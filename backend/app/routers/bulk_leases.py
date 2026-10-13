"""Carga masiva de contratos desde una planilla.

El caso real: la temporada se negocia en una reunión y queda en un Excel con
cuarenta filas. Cargarlas de a una por el mapa es media tarde de trabajo y, peor,
media tarde de oportunidades de equivocarse.

Dos pasos a propósito, ``validar`` y ``confirmar``:

· **validar** no escribe nada. Devuelve un veredicto por fila —qué mueble
  resolvió, qué le falta, con qué choca— para que la revisión ocurra ANTES de
  crear cuarenta contratos y disparar los correos. Una importación a ciegas que
  sale mal no se deshace con un botón.
· **confirmar** vuelve a validar (la base pudo cambiar entre un paso y el otro)
  y crea sólo lo que pasa.

El archivo lo lee el navegador con la librería de Excel que la app ya usa, así
que acá entra JSON plano: el servidor no aprende a abrir hojas de cálculo, y de
paso el mismo endpoint sirve para un CSV o para lo que venga después.

**Más estricto que el alta de a uno, a propósito.** Ahí un código sin mueble en
el plano se acepta —hay filas sembradas y muebles borrados después del contrato—
pero un código que no existe en una planilla de cuarenta filas es un error de
tipeo, y crearlo callado deja un contrato colgado de un espacio fantasma que
nadie va a montar.
"""

from collections import defaultdict
from datetime import date, datetime
from html import escape
from typing import Optional
from urllib.parse import quote

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import create_mount_token, dias_del_enlace_de_montaje, require_admin
from app.clientes import Cliente, cliente_del_pedido
from app.database import get_db
from app.fechas import hoy
from app.models.models import Space, SpaceLease, SpaceStatus, Supplier
from app.routers.layout import reference_rates_raw
from app.services.layout_lookup import (
    Ambiguedad, Colision, PlanoIndexado, es_comercializable, sin_prefijo_de_sede,
)
from app.services.catalogo_muebles import tipo_de_tarifa
from app.services.renumeracion import Rastreador
from app.schemas.spaces import AvisosContrato
from app.services.contacts import recipients_for
from app.services.mailer import (
    app_base_url, correo_configurado, format_cop, html_shell, send_mail_to_bg,
)

router = APIRouter(prefix="/leases/bulk", tags=["carga masiva"])

#: Tope de filas por archivo. No es una limitación técnica sino de revisión: una
#: planilla de mil filas no se revisa en pantalla, y aprobar a ciegas es lo que
#: los dos pasos existen para evitar.
MAX_FILAS = 300

OK, AVISO, ERROR = "ok", "aviso", "error"


# ─── Entrada y salida ─────────────────────────────────────────────────────────

class FilaIn(BaseModel):
    #: Número de fila en la planilla ORIGINAL, con encabezado incluido, para que
    #: el mensaje diga "fila 14" y esa sea la fila 14 del Excel del usuario.
    fila: int
    espacio: str = ""
    sede: Optional[str] = None
    proveedor: str = ""
    correo: Optional[str] = None
    marca: Optional[str] = None
    valor: Optional[float] = None
    #: ISO. El navegador ya resolvió el formato de la celda —fecha de Excel,
    #: dd/mm/aaaa, aaaa-mm-dd— porque es donde está el archivo.
    desde: Optional[str] = None
    hasta: Optional[str] = None
    nota: Optional[str] = None


class LoteIn(BaseModel):
    #: Sede por defecto para las filas que no traen la suya.
    sede: Optional[str] = None
    filas: list[FilaIn] = Field(default_factory=list)


class FilaOut(BaseModel):
    fila: int
    estado: str
    mensajes: list[str] = Field(default_factory=list)
    #: Lo que el servidor entendió, para que la revisión sea sobre lo resuelto y
    #: no sobre lo que la persona cree que escribió.
    codigo: Optional[str] = None
    nombre: Optional[str] = None
    #: El nombre con el que el plano DIBUJA el mueble resuelto, cuando alguien se
    #: lo puso a mano y no es su código. None cuando el mueble se dibuja con su
    #: propio código, que es el caso normal.
    #:
    #: Sin esto la revisión no puede mostrar el desvío: ``codigo`` repite lo que
    #: la persona tecleó con la sede antepuesta y ``nombre`` es el label del tipo
    #: —«Impulsador Marca» para los once impulsadores—, así que los dos campos
    #: son idénticos para el mueble correcto y para el equivocado.
    nombre_dibujado: Optional[str] = None
    sede: Optional[str] = None
    proveedor: Optional[str] = None
    marca: Optional[str] = None
    correo: Optional[str] = None
    valor: Optional[float] = None
    desde: Optional[str] = None
    hasta: Optional[str] = None
    nota: Optional[str] = None
    dias: Optional[int] = None
    referencia: Optional[float] = None
    #: El proveedor todavía no existe en la base y se va a crear. Vale avisarlo:
    #: "Nutresa" y "NUTRESA S.A." son dos proveedores distintos para el sistema.
    proveedor_nuevo: bool = False
    #: El contrato que quedó creado, en la respuesta de /confirmar. La pantalla
    #: lo necesita para colgarle la planometría, que existe recién después de
    #: que el contrato existe. Al validar es siempre None.
    lease_id: Optional[int] = None


class LoteOut(BaseModel):
    filas: list[FilaOut]
    ok: int
    avisos: int
    errores: int


class ConfirmadoOut(BaseModel):
    creados: int
    omitidos: int
    filas: list[FilaOut]
    #: A quién se le avisó, de verdad.
    #:
    #: La planilla no lo usaba —carga cuarenta contratos y se mira el resumen—
    #: pero el contrato multiespacio de la pantalla de Vender pasa por acá, y
    #: ahí cerrar la llamada creyendo que se le avisó al mercaderista, sin que
    #: haya salido un correo, es el modo de falla que vuelve inútil todo esto.
    #: Reporta lo ENCOLADO, no lo entregado.
    avisos: Optional[AvisosContrato] = None


# ─── Utilidades ───────────────────────────────────────────────────────────────

def _fecha(valor: Optional[str]) -> Optional[date]:
    if not valor:
        return None
    try:
        return datetime.strptime(str(valor).strip()[:10], "%Y-%m-%d").date()
    except ValueError:
        return None


def _codigo_completo(espacio: str, sede: str) -> str:
    """``PUN-04`` + ``NAVE`` → ``NAVE-PUN-04``, sin duplicar el prefijo.

    La planilla puede traer el corto o el completo; en la reunión se habla del
    corto, y el corto se repite entre sedes.
    """
    code = (espacio or "").strip().upper()
    s = (sede or "").strip().upper()
    if not s or code.startswith(f"{s}-"):
        return code
    return f"{s}-{code}"


def _se_pisan(a_desde: date, a_hasta: date, b_desde: date, b_hasta: date) -> bool:
    """Inclusivo en los dos extremos, como todo el resto del proyecto: alguien
    tiene que desmontar una exhibición antes de armar la siguiente."""
    return a_desde <= b_hasta and a_hasta >= b_desde


def _tipo_de_tarifa(tipo: str) -> str:
    """La clave de tarifa de un tipo de mueble, del catálogo de muebles
    (``services/catalogo_muebles.py``): las dos caras de una góndola comparten
    la de ``gondola``."""
    return tipo_de_tarifa(tipo)


# ─── Los dos nombres de un mueble, dichos en castellano ───────────────────────

def _rechazo_ambiguo(a: Ambiguedad, sede: str) -> str:
    """El rechazo tiene que ofrecer LOS DOS CAMINOS, cada uno con su código completo.

    Antes terminaba en «Escribí el código completo del que quisiste», y seguir
    ese consejo era una trampa: quien mira la cajita que el plano rotula
    «IMP-08» escribe ``CIUDAD JARDIN-IMP-08``, que es el OTRO mueble —el que
    lleva ese código de verdad—, y el contrato entraba callado en el equivocado.
    Un mensaje que pide adivinar entre dos muebles que no nombra es tan mudo
    como no decir nada.

    Primero el que la persona probablemente quiso: el que el plano DIBUJA con el
    texto que tecleó. Es lo que estaba mirando cuando escribió la fila.
    """
    #: El del código no siempre se dibuja con su código: en la corrida renumerada
    #: de CIUDAD JARDIN, el mueble ``IMP-12`` se dibuja «IMP-08». Describirlo mal
    #: sería volver a mandar a la persona al mueble que no quería.
    el_del_codigo = (
        f"tiene ese código, aunque el plano lo dibuje «{a.nombre_tecleado}»"
        if a.nombre_tecleado
        else "se dibuja con su propio código"
    )
    return (
        f"«{a.texto}» es ambiguo en {sede}. "
        f"Escribí {a.codigo_dibujado} para el mueble que el plano dibuja «{a.texto}», "
        f"o {a.codigo_tecleado} para el que {el_del_codigo}."
    )


def _avisos_de_colision(c: Colision) -> list[str]:
    """La fila entra, pero el mueble tiene un gemelo de nombre: hay que decirlo.

    Es la categoría que esta pantalla ya tiene —«entra, pero se mira»— y es la
    correcta acá: los dos muebles son FÍSICAMENTE DISTINTOS y contratar los dos
    es legítimo, así que rechazar el código completo dejaría seis muebles de
    CIUDAD JARDIN imposibles de contratar y rompería la pantalla de Vender, que
    manda siempre el código completo.

    Cada aviso dice **qué se está por contratar** y **cuál es el otro**, los dos
    con su código completo. Cuando las dos direcciones se dan a la vez —el mueble
    ``IMP-12`` se dibuja «IMP-08», que es el código de otro, y su propio código
    «IMP-12» es el nombre dibujado de un tercero— el segundo aviso no repite el
    encabezado: la pantalla los junta en un solo párrafo y dos preámbulos
    idénticos se leen como ruido.
    """
    dibujo = (
        f"que el plano dibuja «{c.nombre_dibujado}»"
        if c.nombre_dibujado
        else "que se dibuja con su propio código"
    )
    mensajes: list[str] = []
    if c.otro_tiene_por_codigo_mi_nombre:
        mensajes.append(
            f"Ojo: este contrato va al mueble {c.codigo}, {dibujo}. Ese nombre es el "
            f"código de OTRO mueble de la sede: {c.otro_tiene_por_codigo_mi_nombre}."
        )
    if c.otro_se_dibuja_con_mi_codigo:
        if mensajes:
            mensajes.append(
                f"Y su código, «{c.corto}», es además el nombre con el que el plano "
                f"dibuja a un tercero: {c.otro_se_dibuja_con_mi_codigo}."
            )
        else:
            mensajes.append(
                f"Ojo: este contrato va al mueble {c.codigo}, {dibujo}. OTRO mueble de "
                f"la sede se dibuja «{c.corto}» y su código es "
                f"{c.otro_se_dibuja_con_mi_codigo}."
            )
    return mensajes


# ─── El corazón: revisar una tanda sin escribir nada ──────────────────────────

def _revisar(db: Session, lote: LoteIn) -> list[FilaOut]:
    if len(lote.filas) > MAX_FILAS:
        raise HTTPException(
            status_code=400,
            detail=f"La planilla trae {len(lote.filas)} filas y el tope es {MAX_FILAS}. "
                   "Partila en varias: un archivo que no se puede revisar en pantalla "
                   "no se puede aprobar con criterio.",
        )

    rates = reference_rates_raw(db)
    #: Los muebles de todas las sedes, leídos una sola vez: cada fila pregunta
    #: tres cosas al plano y una planilla trae hasta trescientas.
    plano = PlanoIndexado(db)
    #: El registro de renumeraciones, también leído una sola vez: cada fila que
    #: no resuelve le pregunta lo mismo. No lee nada hasta que alguna pregunte.
    rastreador = Rastreador(db)
    proveedores = {
        (s.name or "").strip().lower(): s
        for s in db.query(Supplier).all()
    }

    salida: list[FilaOut] = []
    #: Lo aceptado hasta ahora, por código, para que dos filas del MISMO archivo
    #: no se vendan el mismo espacio en fechas que se pisan. Es el error más
    #: fácil de cometer en una planilla y el más difícil de ver leyéndola.
    tomados: dict[str, list[tuple[date, date, int]]] = defaultdict(list)

    for fila in lote.filas:
        out = FilaOut(fila=fila.fila, estado=OK)
        errores: list[str] = []
        avisos: list[str] = []

        sede = (fila.sede or lote.sede or "").strip().upper()
        out.sede = sede or None
        codigo = _codigo_completo(fila.espacio, sede)
        out.codigo = codigo or None

        proveedor = (fila.proveedor or "").strip()
        out.proveedor = proveedor or None
        out.marca = (fila.marca or "").strip() or None
        out.correo = (fila.correo or "").strip() or None
        # Se guarda en el contrato (`notes`), que es donde vive desde que lo
        # comercial es de la base. Viaja de vuelta sólo para que la pantalla la
        # muestre en el previo, antes de confirmar: hubo un tiempo en que la
        # pantalla la escribía en el JSON del plano, y ya no.
        out.nota = (fila.nota or "").strip() or None

        # ── El espacio ────────────────────────────────────────────────────────
        fixture = None
        tecleado = (fila.espacio or "").strip()
        if not tecleado:
            # `_codigo_completo("", "NAVE")` devuelve «NAVE-», que no es el código
            # de nada: devolverlo como "lo que el servidor entendió" sería otro
            # eco que confirma un error en vez de mostrarlo.
            out.codigo = None
            errores.append("Falta el código del espacio.")
        elif not sede:
            # Sin sede el código queda corto, y el corto resolvía igual contra el
            # plano: la fila pasaba y creaba un Space nuevo —«IMP-08» al lado de
            # «CIUDAD JARDIN-IMP-08»— para el mismo mueble físico, cada uno ciego
            # al contrato del otro. Es una doble venta literal, sin nomenclatura
            # de por medio.
            errores.append(
                "Falta la sede: sin ella el código queda corto y crea un espacio nuevo."
            )
        else:
            # Primero la ambigüedad: si el texto calza dos muebles, cuál resolvió
            # el servidor es lo de menos, porque las dos respuestas son
            # defendibles y sólo una es la que la persona quiso.
            ambiguo = plano.ambiguedad(sede, tecleado)
            resuelto = None if ambiguo else plano.resolver(sede, tecleado)
            if ambiguo:
                errores.append(_rechazo_ambiguo(ambiguo, sede))
            elif resuelto is None:
                corto = sin_prefijo_de_sede(tecleado, sede)
                otras = [s for s in plano.sedes_con_codigo(corto) if s != sede]
                # El servidor sabe en qué se convirtió un nombre que él mismo
                # retiró al renumerar, y hasta ahora se lo callaba. Después de
                # renumerar, TODA planilla vieja de la casa cae en este renglón:
                # sin esta línea el mensaje es cierto y deja a la persona sin
                # ninguna pista de por qué. No resuelve la fila —adivinar el
                # mueble es el error que esta fase eliminó—, la explica.
                pista = rastreador.pista(sede, tecleado)
                una_cara = plano.sin_cara_b(sede, tecleado)
                if una_cara is not None:
                    # El mueble existe; lo que no existe es su cara B. Decir
                    # «no hay ningún mueble» manda a buscar un tipeo.
                    errores.append(
                        f"«{sin_prefijo_de_sede(una_cara.codigo, una_cara.sede)}» tiene una sola cara: "
                        "no hay cara B que vender."
                    )
                elif otras:
                    # Un tipeo en la columna Sede mandaba el contrato a otro
                    # supermercado sin un aviso. Decir dónde sí está es la
                    # diferencia entre corregirlo y salir a buscar un error que
                    # no existe.
                    errores.append(
                        f"«{corto}» no existe en {sede}; sí existe en {', '.join(otras)}."
                    )
                else:
                    errores.append(
                        f"No hay ningún mueble con el código «{codigo}» en el plano de {sede}."
                    )
                if pista:
                    errores.append(pista)
            else:
                fixture = resuelto.fixture
                # El código completo lo arma la sede DEL FIXTURE, nunca el texto
                # pelado de la fila.
                codigo = resuelto.codigo
                out.codigo = codigo
                out.sede = resuelto.sede or sede
                # Se dice aunque la fila termine en error: la revisión tiene que
                # poder ver contra qué mueble resolvió, sobre todo cuando no entra.
                out.nombre_dibujado = resuelto.nombre_dibujado
                if not es_comercializable(fixture):
                    errores.append(
                        f"«{codigo}» está marcado como no comercializable: es parte del local."
                    )
                else:
                    out.nombre = fixture.get("label") or fixture.get("code")
                    # El texto resolvió sin dudas, pero el MUEBLE puede tener un
                    # gemelo de nombre: es el residuo que dejaba abierta la doble
                    # venta. Quien mira la cajita rotulada «IMP-08» y escribe el
                    # código completo llega al otro mueble, y hasta acá entraba
                    # sin una palabra. Entra igual —los dos muebles existen y los
                    # dos se alquilan— pero se mira.
                    colision = plano.colision(sede, resuelto)
                    if colision:
                        avisos.extend(_avisos_de_colision(colision))
                    ref = None
                    tipo = _tipo_de_tarifa(str(fixture.get("type") or ""))
                    if rates:
                        por_sede = (rates.get("by_sede") or {}).get(sede or "", {})
                        ref = por_sede.get(tipo)
                        if ref is None:
                            ref = (rates.get("default") or {}).get(tipo)
                    out.referencia = ref

        # ── El proveedor ──────────────────────────────────────────────────────
        #: Notas que se dicen pero NO pintan la fila. "Proveedor nuevo" es cierto
        #: y útil, pero en una planilla de una temporada entera casi todas las
        #: filas lo son: dejarlo teñir de amarillo entrena a la gente a ignorar
        #: el amarillo, que es justo lo que hace falta que miren.
        notas: list[str] = []

        if not proveedor:
            errores.append("Falta el proveedor.")
        elif proveedor.lower() not in proveedores:
            out.proveedor_nuevo = True
            notas.append("Proveedor nuevo: se va a crear.")

        if out.correo and ("@" not in out.correo or " " in out.correo):
            avisos.append(f"El correo «{out.correo}» no parece válido; no se va a guardar.")
            out.correo = None

        # ── El valor ──────────────────────────────────────────────────────────
        valor = float(fila.valor or 0)
        out.valor = valor or None
        if valor <= 0:
            errores.append("Falta el valor, o quedó en cero.")
        elif out.referencia:
            desvio = round((1 - valor / out.referencia) * 100)
            if desvio >= 15:
                avisos.append(
                    f"{desvio}% por debajo de la tarifa de referencia "
                    f"({format_cop(out.referencia)})."
                )

        # ── Las fechas ────────────────────────────────────────────────────────
        desde, hasta = _fecha(fila.desde), _fecha(fila.hasta)
        out.desde = desde.isoformat() if desde else None
        out.hasta = hasta.isoformat() if hasta else None
        if not desde or not hasta:
            errores.append("Faltan las fechas, o no se entendieron.")
        elif desde > hasta:
            errores.append("La fecha de fin es anterior a la de inicio.")
        else:
            # Los dos extremos cuentan: un contrato de un día dura un día.
            out.dias = (hasta - desde).days + 1

        # ── Choques ───────────────────────────────────────────────────────────
        if not errores and desde and hasta and codigo:
            for otro_desde, otro_hasta, otra_fila in tomados[codigo]:
                if _se_pisan(desde, hasta, otro_desde, otro_hasta):
                    errores.append(
                        f"Choca con la fila {otra_fila} de esta misma planilla, "
                        f"que ya toma «{codigo}» del {otro_desde} al {otro_hasta}."
                    )
                    break

        if not errores and desde and hasta and codigo:
            space = db.query(Space).filter(Space.code == codigo).first()
            if space:
                for lease in space.leases:
                    if not lease.is_active:
                        continue
                    if _se_pisan(desde, hasta, lease.start_date, lease.end_date):
                        errores.append(
                            f"«{codigo}» ya tiene un contrato del {lease.start_date} "
                            f"al {lease.end_date}. Cancelalo primero o ajustá las fechas."
                        )
                        break

        if errores:
            out.estado = ERROR
            out.mensajes = errores + avisos + notas
        else:
            out.estado = AVISO if avisos else OK
            out.mensajes = avisos + notas
            tomados[codigo].append((desde, hasta, fila.fila))

        salida.append(out)

    return salida


def _resumen(filas: list[FilaOut]) -> tuple[int, int, int]:
    return (
        sum(1 for f in filas if f.estado == OK),
        sum(1 for f in filas if f.estado == AVISO),
        sum(1 for f in filas if f.estado == ERROR),
    )


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/validar", response_model=LoteOut, dependencies=[Depends(require_admin)])
def validar(lote: LoteIn, db: Session = Depends(get_db)):
    """Revisa la tanda y no escribe nada. Es el paso que hace revisable la carga."""
    filas = _revisar(db, lote)
    ok, avisos, errores = _resumen(filas)
    return LoteOut(filas=filas, ok=ok, avisos=avisos, errores=errores)


@router.post("/confirmar", response_model=ConfirmadoOut, dependencies=[Depends(require_admin)])
def confirmar(
    lote: LoteIn,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    cliente: Cliente = Depends(cliente_del_pedido),
):
    """Crea los contratos de las filas que pasan. Vuelve a validar antes.

    Revalidar no es paranoia: entre la revisión y el botón alguien pudo vender
    uno de esos espacios desde el mapa, y crear el contrato igual dejaría dos
    proveedores en la misma punta.
    """
    filas = _revisar(db, lote)
    por_fila = {f.fila: f for f in filas}
    plano = PlanoIndexado(db)
    #: El proveedor se busca igual que en la revisión: sin espacios y sin
    #: mayúsculas. Si la revisión no avisó «Proveedor nuevo» porque ya existe
    #: «BIC», confirmar no puede crear en silencio un «Bic» aparte: serían dos
    #: proveedores para el mismo, con el historial partido, y la renovación ya
    #: no se reconocería como tal (`services/fotos_vencidas.py`). Si ya hay dos
    #: que sólo difieren en mayúsculas, gana el más viejo.
    proveedores: dict[str, Supplier] = {}
    for s in db.query(Supplier).order_by(Supplier.id).all():
        proveedores.setdefault((s.name or "").strip().lower(), s)

    creados: list[FilaOut] = []
    for fila in lote.filas:
        v = por_fila.get(fila.fila)
        if not v or v.estado == ERROR:
            continue

        # Acotado a la sede, como en la revisión: el código ya viene completo y
        # con la sede del fixture, así que esto no puede caer en otra tienda.
        resuelto = plano.resolver(v.sede or "", v.codigo or "")
        fixture = resuelto.fixture if resuelto else None
        space = db.query(Space).filter(Space.code == v.codigo).first()
        if not space:
            area = 0.0
            if fixture:
                try:
                    area = round(float(fixture.get("w") or 0) * float(fixture.get("d") or 0), 2)
                except (TypeError, ValueError):
                    area = 0.0
            space = Space(
                code=v.codigo,
                svg_id=v.codigo,
                name=v.nombre or v.codigo,
                zone=str((fixture or {}).get("type") or "espacio"),
                sede=v.sede,
                area_m2=area,
                status=SpaceStatus.free,
            )
            db.add(space)
            db.flush()

        nombre = (v.proveedor or "").strip()
        supplier = proveedores.get(nombre.lower())
        if not supplier:
            supplier = Supplier(name=nombre, email=v.correo)
            db.add(supplier)
            db.flush()
            proveedores[nombre.lower()] = supplier
        elif v.correo and not supplier.email:
            # Se completa el que falta y nunca se pisa el que ya está: la
            # planilla puede traer el correo del vendedor de turno.
            supplier.email = v.correo

        lease = SpaceLease(
            space_id=space.id,
            supplier_id=supplier.id,
            marca=v.marca,
            start_date=_fecha(v.desde),
            end_date=_fecha(v.hasta),
            monthly_rent=float(v.valor or 0),
            notes=v.nota,
        )
        db.add(lease)
        db.flush()          # para poder devolver el id del contrato creado
        v.lease_id = lease.id
        # Sólo lo que ya arrancó ocupa: firmar en agosto para diciembre no puede
        # esconder cuatro meses vendibles detrás de un estado que no es cierto.
        if lease.start_date <= hoy():
            space.status = SpaceStatus.occupied
        creados.append(v)

    db.commit()

    avisos: Optional[AvisosContrato] = None
    if creados:
        avisos = _avisar(db, background_tasks, lote.sede, creados, cliente)

    return ConfirmadoOut(
        creados=len(creados),
        omitidos=len(filas) - len(creados),
        filas=filas,
        avisos=avisos,
    )


def _enlace_de_montaje(fila: FilaOut, cliente: Cliente) -> str:
    """El enlace firmado que abre ESE espacio para confirmar su montaje.

    Lleva adentro del token el cliente —sin eso, el enlace de un supermercado
    abriría la pantalla contra la base de otro— y el contrato que se monta, y
    vive hasta un mes después de que arranca (`auth.dias_del_enlace_de_montaje`).
    """
    codigo = fila.codigo or ""
    dias = dias_del_enlace_de_montaje(_fecha(fila.desde))
    token = create_mount_token(codigo, cliente.slug, days=dias, contrato=fila.lease_id)
    return f"{app_base_url()}/?montar={quote(codigo)}&t={quote(token)}"


# ─── Los avisos, uno por rol y uno por tanda ──────────────────────────────────

def _avisar(
    db: Session,
    background_tasks: BackgroundTasks,
    sede_lote,
    creados: list[FilaOut],
    cliente: Cliente,
) -> AvisosContrato:
    """Un correo por rol para TODA la tanda, no uno por contrato.

    Cuarenta contratos por el camino de a uno serían ciento veinte correos en un
    minuto: nadie los lee, el proveedor de correo los trata como spam y el aviso
    que sí importaba se pierde entre los otros. Lo mismo vale para un contrato
    de tres espacios hecho desde el mapa: son tres espacios, no tres acuerdos.

    Devuelve a quién se le encoló algo, que es lo que la pantalla muestra al
    cerrar. Sin SMTP configurado no se encola nada y se dice.
    """
    listo = correo_configurado()
    encolados = AvisosContrato(smtp_listo=listo, comercial=[], montaje=[], proveedor=[])

    por_sede: dict[str, list[FilaOut]] = defaultdict(list)
    for c in creados:
        por_sede[c.sede or (sede_lote or "").strip().upper() or ""].append(c)

    for sede, filas in por_sede.items():
        who = recipients_for(db, sede)
        cuantos = len(filas)
        total = sum(float(f.valor or 0) for f in filas)

        if who["comercial"] and listo:
            encolados.comercial.extend(who["comercial"])
            asunto = f"{cuantos} contrato{'s' if cuantos != 1 else ''} nuevo{'s' if cuantos != 1 else ''} — {sede or 'sede'}"
            rows = [
                (f"{escape(f.codigo or '')} · {escape(f.proveedor or '')}",
                 f"{f.desde} → {f.hasta} · {format_cop(float(f.valor or 0))}")
                for f in filas
            ]
            rows.append(("Total mensual", format_cop(total)))
            # Antes decía «Cargados desde una planilla.» también para lo vendido
            # en el mapa, que pasa por el mismo camino (2026-10-02).
            background_tasks.add_task(
                send_mail_to_bg, who["comercial"], asunto,
                html_shell(asunto, rows, f"Contratos de {escape(cliente.nombre)}, recién guardados en RECABRA."),
            )

        if who["montaje"] and listo:
            encolados.montaje.extend(who["montaje"])
            asunto = f"{cuantos} espacio{'s' if cuantos != 1 else ''} por montar — {sede or 'sede'}"
            # Cada espacio con SU enlace firmado (2026-10-02). Entre el 2026-09-02
            # y esta fecha el correo sólo decía «Abrir RECABRA»: quien monta sin
            # cuenta propia —la mayoría, gente del proveedor— recibía un aviso
            # con el que no podía hacer nada.
            rows = [
                (escape(f.codigo or ""),
                 f"{escape(f.proveedor or '')}{f' · {escape(f.marca)}' if f.marca else ''} · "
                 f"desde el {f.desde}<br>"
                 f'<a href="{_enlace_de_montaje(f, cliente)}" style="color:#0369A1;font-weight:600;">'
                 "Ver dónde queda y confirmar</a>")
                for f in filas
            ]
            pie = (
                "Cada enlace abre ese espacio señalado en el plano, y ahí mismo se "
                "confirma el montaje — sin contraseña. <strong>La foto es "
                "obligatoria</strong>: es la prueba de que la exhibición quedó armada. "
                "Quien tenga cuenta en RECABRA también los ve en "
                f'<a href="{app_base_url()}/" style="color:#0369A1;">Montajes</a>.'
                '<br><br><span style="color:#94A3B8;font-size:12px;">'
                "Los enlaces son personales: no los reenvíes. Vencen un mes después de "
                "que arranca cada contrato.</span>"
            )
            background_tasks.add_task(
                send_mail_to_bg, who["montaje"], asunto,
                html_shell(asunto, rows, pie),
            )

    # La constancia al proveedor va agrupada POR PROVEEDOR: uno que se llevó seis
    # espacios recibe un correo con los seis, no seis correos.
    por_proveedor: dict[int, tuple[Supplier, list[FilaOut]]] = {}
    for c in creados:
        # Por el contrato que se acaba de crear, no por el nombre escrito en la
        # fila: «Bic» se guardó con el proveedor «BIC» que ya existía.
        lease = db.get(SpaceLease, c.lease_id) if c.lease_id else None
        supplier = lease.supplier if lease else None
        if not supplier or not supplier.email:
            continue
        por_proveedor.setdefault(supplier.id, (supplier, []))[1].append(c)

    for supplier, filas in por_proveedor.values():
        if not listo:
            continue
        encolados.proveedor.append(supplier.email)
        cuantos = len(filas)
        asunto = f"Confirmación de {cuantos} espacio{'s' if cuantos != 1 else ''}"
        # Con el nombre del supermercado (2026-10-02): el proveedor trabaja con
        # varios, y «respondé este correo» le escribía a la plataforma, no a la
        # tienda —el remitente es el de RECABRA para todos los clientes—.
        rows = [("Supermercado", escape(cliente.nombre))] + [
            (escape(f"{f.codigo} — {f.nombre or ''}".strip(" —")),
             f"{f.desde} → {f.hasta} · {format_cop(float(f.valor or 0))}")
            for f in filas
        ]
        background_tasks.add_task(
            send_mail_to_bg, [supplier.email], asunto,
            html_shell(
                asunto, rows,
                f"Cualquier ajuste sobre lo acordado, comunicate con {escape(cliente.nombre)}.",
            ),
        )

    return encolados
