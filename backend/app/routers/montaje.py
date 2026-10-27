"""La pantalla de la mercaderista: un espacio, sin contraseña.

Antes entraba con la contraseña compartida del rol ``worker`` y aterrizaba en
el tablero: desde ahí veía el mapa de la sede completa y la tabla con el
proveedor, el período y el estado de todos los espacios. Nada de eso le hace
falta para armar una exhibición, y la contraseña compartida sobrevive a la
persona que deja de trabajar ahí.

Ahora el correo lleva un enlace firmado —un JWT de rol ``montaje``, acotado a
ESE espacio y con vencimiento— y este router es **todo** lo que ese token
alcanza. ``require_auth`` lo rechaza en el resto de la aplicación, así que un
endpoint que alguien agregue mañana nace cerrado para él sin tener que
acordarse de este archivo.

Tres cosas necesita esa pantalla y tres cosas hay acá: qué montar y dónde
queda, cómo debe quedar armado, y el botón para reportarlo.

Desde la fase 2 de participaciones (2026-10-19), dos cosas más:

· El enlace que dice su contrato sigue a ESE contrato aunque el espacio cambie
  de código (una renumeración, un renombre de sede): antes respondía «Ese
  contrato se canceló», que era falso (``_resolver``).
· Quien monta una participación de cara ve SU zona dibujada sobre la cara —y
  nada de las otras—, si la distribución está confirmada (``dibujo``,
  ``_dibujo_de_participacion``). El filtro va acá, en el servidor: las formas
  ajenas nunca viajan.
"""
import json
from datetime import date, datetime, time, timedelta, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session, defer

from app.auth import Quien, require_montaje
from app.database import get_db
from app.fechas import ZONA_DEL_NEGOCIO, hoy
from app.models.models import (
    ArchivedSpace, LayoutSnapshot, LeaseFile, MountConfirmation, RenumeracionNombre, Space, SpaceFile, SpaceLease,
)
from app.models.participaciones import Participacion
from app.routers.mounts import MountOut, registrar_montaje
from app.services.contratos import contrato_para_montar
from app.services.layout_lookup import describe_location
from app.services.participaciones import cara_del_termino, estado_de_distribucion, leer
from app.services.partes import (
    cantidad_de, es_participacion, normalizar, partes_tipadas, partir_codigo, texto_para_montar,
)
from app.services.reglas_participacion import pct

router = APIRouter(prefix="/montaje", tags=["montaje"], dependencies=[Depends(require_montaje)])

KIND_PLANOMETRIA = "planometria"

#: Lo único que se manda de los muebles VECINOS: dónde están y qué son, para
#: dibujar el plano que dice «queda acá». Nada de quién lo alquiló, por cuánto
#: ni hasta cuándo. Es una lista blanca y no una negra a propósito: un campo
#: comercial que se agregue mañana al layout no se filtra por olvido.
#:
#: Desde 2026-10-13 también la ficha del mueble: es geometría, la misma que ve
#: el visor de Vender (``sinDatosComerciales``), y sin ella la mercaderista
#: vería otro mueble que el que tiene que armar. NO está en esta lista: la
#: copia ``_solo_geometria`` clave por clave y con su tipo (``modelo`` sólo si
#: es texto, ``entrepanos`` y ``modulo`` sólo si son números, de ``partes``
#: sólo sus números conocidos). ``PUT /layout`` recibe el mueble sin tipar, y
#: una clave de la lista blanca se llevaría lo que le escriban adentro mañana
#: —un objeto con plata, un texto con un proveedor—.
_GEOMETRIA = {
    "id", "code", "nomenclatura", "type", "gondolaType", "label",
    "cx", "cz", "rotY", "w", "d", "h", "color", "sede", "rentable",
}


def _es_numero(v: object) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool)


# ─── Schemas ──────────────────────────────────────────────────────────────────

class ExclusionDeMontaje(BaseModel):
    """Un pedazo de la cara que no se vende (parante, zócalo, copete…), en u,v."""
    por: str
    u0: float
    u1: float
    v0: float
    v1: float


class SuperficieDeMontaje(BaseModel):
    """La cara, sólo su forma: medidas en metros y lo que no se vende."""
    orientacion: Literal["frente", "arriba"]
    ancho: float
    alto: float
    exclusiones: list[ExclusionDeMontaje] = []


class DibujoDeMontaje(BaseModel):
    """La zona de quien monta sobre su cara (fase 2 · G1, decisión de la dueña
    del 2026-10-18: «con su zona dibujada, sólo la suya; el resto gris»).

    Tipado clave por clave, como ``_solo_geometria``: una lista blanca. No hay
    lugar acá para el nombre de otro proveedor, su marca, su porcentaje, su
    número de participación ni plata; y ``zonas`` son SÓLO los polígonos de la
    participación del enlace —el filtro va en el servidor
    (``_dibujo_de_participacion``)—, así que las formas ajenas no viajan.
    """
    cara: Literal["A", "B"]
    superficie: SuperficieDeMontaje
    #: Los polígonos de SU participación en la capa confirmada, ``[[u, v], …]``
    #: (u = 0 a la izquierda de quien mira, v = 0 abajo o el borde delantero).
    zonas: list[list[list[float]]]


class EspacioMontaje(BaseModel):
    """Todo lo que la pantalla muestra, en una sola llamada.

    Una sola llamada y no cuatro porque cada endpoint abierto a este token es
    una superficie más que revisar; y porque del otro lado hay un celular con
    señal de supermercado, donde cuatro viajes son cuatro oportunidades de
    quedarse a mitad de camino.
    """
    #: ``SEDE-CODIGO``, el mismo que viaja en el enlace y el que se reporta.
    code: str
    #: Lo que se le muestra: ``PUN-01``, no ``NAVE-PUN-01``.
    corto: str
    sede: str
    #: El código del MUEBLE en el plano, sin el sufijo de cara: la cara B se
    #: reporta como ``PUN-01-B`` pero en el plano hay un solo mueble.
    fixture_code: str
    label: str = ""
    nomenclatura: Optional[str] = None
    proveedor: str = ""
    marca: str = ""
    desde: Optional[str] = None
    hasta: Optional[str] = None
    #: "A unos 4 m de las cajas". La misma frase que ya iba en el correo.
    donde: Optional[str] = None
    #: Los muebles de la sede, sólo geometría, para dibujar el plano.
    vecinos: list[dict] = []
    #: Hay planometría cargada para el contrato que manda hoy sobre el espacio.
    tiene_planometria: bool = False
    planometria_tipo: Optional[str] = None
    #: El último reporte de este espacio, si ya hubo alguno.
    ultimo: Optional[MountOut] = None
    #: Cuándo se vence el enlace. La pantalla avisa antes de que pase.
    vence: Optional[datetime] = None
    #: Desde qué día se puede confirmar, cuando todavía no se puede: la víspera
    #: del arranque del contrato del enlace. Mientras tanto la pantalla lo dice
    #: en vez de ofrecer el formulario.
    se_confirma_desde: Optional[str] = None
    #: Si el espacio es una parte del mueble (``NEV-03-PU2``), cuál, dicho para
    #: armarla: «Puerta 2 de 3, contando de izquierda a derecha mirando el
    #: frente». ``None`` es la cara entera. Ni plata ni quién tiene las otras.
    parte: Optional[dict] = None
    #: Una participación de cara con la distribución confirmada: su zona
    #: dibujada sobre la cara (sólo la suya). Sólo con el enlace de montaje o
    #: para un admin, nunca para el trabajador; ``None`` en todo lo demás, y
    #: la pantalla queda como antes.
    dibujo: Optional[DibujoDeMontaje] = None


# ─── Resolución ───────────────────────────────────────────────────────────────

def _codigo(quien: Quien, code: Optional[str]) -> str:
    """El espacio sobre el que se está pidiendo.

    Con un token de montaje sale del token y no del pedido: si viniera del
    pedido, cambiar el parámetro en la barra de direcciones abriría cualquier
    otro espacio con el mismo enlace. Un admin sí puede nombrarlo —ya ve todo—
    y así esta pantalla se puede revisar desde el tablero.
    """
    if quien.es_montaje:
        return quien.code or ""
    pedido = (code or "").strip().upper()
    if not pedido:
        raise HTTPException(status_code=422, detail="Falta el código del espacio")
    return pedido


def _base(code: str) -> str:
    """El código del espacio sin el sufijo de cara ni la parte: la cara B y la
    puerta 2 se montan en el mismo mueble."""
    return partir_codigo(code).base


def _fixtures(db: Session, sede: str) -> list[dict]:
    target = (sede or "").strip().upper()
    for snap in db.query(LayoutSnapshot).all():
        if (snap.sede or "").strip().upper() != target:
            continue
        try:
            crudos = json.loads(snap.fixtures_json or "[]")
        except (ValueError, TypeError):
            return []
        return [f for f in crudos if isinstance(f, dict)]
    return []


def _solo_geometria(fixture: dict) -> dict:
    fuera = {k: v for k, v in fixture.items() if k in _GEOMETRIA}
    # La ficha, con su tipo: el mismo criterio que `sinDatosComerciales` en
    # el navegador. Un `modelo` que no es texto o unos entrepaños que no son
    # un número no son una ficha, y no salen.
    if isinstance(fixture.get("modelo"), str):
        fuera["modelo"] = fixture["modelo"]
    for clave in ("entrepanos", "modulo"):
        if _es_numero(fixture.get(clave)):
            fuera[clave] = fixture[clave]
    # `partes` no pasa entera: es un objeto, y un objeto de la lista blanca se
    # llevaría lo que le escriban adentro mañana. Pasa lo conocido (las
    # puertas y cómo se vende), copiado clave por clave y con su tipo
    # (`partes.partes_tipadas`, que sale del catálogo).
    partes = partes_tipadas(fixture.get("partes"))
    if partes:
        fuera["partes"] = partes
    return fuera


def _sede_de(code: str, db: Session) -> str:
    """La sede a la que pertenece el espacio.

    Sale del prefijo del código, que es como se arma en toda la aplicación, y
    se confirma contra las sedes que existen: un código como ``NAVE-PUN-01``
    tiene sede ``NAVE``, pero uno viejo sin prefijo no tiene ninguna y sacarle
    el primer tramo a ciegas devolvería ``PUN``.
    """
    sedes = {(s.sede or "").strip().upper() for s in db.query(LayoutSnapshot.sede).all()}
    partes = code.split("-")
    for corte in range(len(partes) - 1, 0, -1):
        candidata = "-".join(partes[:corte])
        if candidata in sedes:
            return candidata
    return ""


_MESES = ("enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
          "agosto", "septiembre", "octubre", "noviembre", "diciembre")

CONTRATO_CANCELADO = "Ese contrato se canceló: ya no hay nada que montar con este enlace."


def _contrato(quien: Quien, space: Optional[Space]) -> Optional[SpaceLease]:
    """El contrato que se monta.

    Con un enlace que dice su contrato (desde el 2026-10-02), ése, aunque
    todavía no arranque: el enlace sale al vender y vive hasta un mes después
    del arranque, así que se abre mientras el espacio sigue siendo de otro, y
    mostrar el que corre hoy era mostrar otro proveedor con otra planometría.
    Si se canceló, o no es de este espacio, ninguno.

    Sin contrato en el enlace —los de antes, o una sesión—, el que manda hoy.
    """
    if space is None:
        return None
    if quien.contrato is not None:
        return next((l for l in space.leases if l.id == quien.contrato and l.is_active), None)
    return contrato_para_montar(space)


def _se_confirma_desde(lease: SpaceLease) -> date:
    """La víspera del arranque: el día en que se desarma lo anterior y se arma
    esto. Antes, el espacio puede seguir siendo de otro contrato, y un reporte
    por código quedaría a nombre de ése."""
    return lease.start_date - timedelta(days=1)


def _fecha_larga(d: date) -> str:
    return f"{d.day} de {_MESES[d.month - 1]}"


def _planometria(db: Session, lease: Optional[SpaceLease]) -> Optional[LeaseFile]:
    """La planometría del contrato que se monta."""
    if lease is None:
        return None
    return (
        db.query(LeaseFile)
        .options(defer(LeaseFile.data))
        .filter(LeaseFile.lease_id == lease.id, LeaseFile.kind == KIND_PLANOMETRIA)
        .order_by(LeaseFile.id.desc())
        .first()
    )


def _espacio(db: Session, code: str) -> Optional[Space]:
    return db.query(Space).filter(func.upper(func.trim(Space.code)) == code).first()


def _renumeracion_lo_llevo(db: Session, antes: str, ahora: str) -> bool:
    """¿Una renumeración llevó al mueble que se llamaba ``antes`` (código
    completo, sin cara ni parte) a llamarse ``ahora``?

    Se contesta con el registro de la renumeración (``RenumeracionNombre``),
    que existe para esta pregunta: «¿cómo se llamaba este mueble cuando se
    negoció el contrato que tengo en la mano?». No se elige un mueble con
    esto: el espacio lo elige el contrato del enlace; esto sólo confirma que
    el código del enlace es un nombre viejo de ESE mueble y no otro.
    """
    if not antes or not ahora:
        return False
    muebles = {
        fila.fixture_id for fila in db.query(RenumeracionNombre.fixture_id)
        .filter(func.upper(func.trim(RenumeracionNombre.codigo_anterior)) == antes).all()
    }
    if not muebles:
        return False
    return db.query(RenumeracionNombre.id).filter(
        RenumeracionNombre.fixture_id.in_(sorted(muebles)),
        func.upper(func.trim(RenumeracionNombre.codigo_nuevo)) == ahora,
    ).first() is not None


def _contrato_mudado(db: Session, quien: Quien, codigo: str, del_codigo: Optional[Space]) -> Optional[SpaceLease]:
    """El contrato del enlace cuando su espacio ya no se llama como dice el
    enlace (fase 2 · enlace por contrato).

    El enlace firma el código que tenía el espacio el día que se vendió. Una
    renumeración o un renombre de sede le cambian el código a la fila —el
    contrato, las fotos y los reportes siguen pegados por id—, y con el código
    viejo no se encontraba nada: la pantalla decía «Ese contrato se canceló»,
    que era falso. Ahora se sigue al contrato, pero sólo si todo esto vale:

    · el contrato existe, no se canceló, y su fila no está archivada (una sede
      borrada cierra sus contratos y archiva sus filas);
    · la cara y la parte son las mismas (lo que se muda es el mueble: la
      ``…-B-PC2`` de antes es la ``…-B-PC2`` de ahora);
    · y hay evidencia de que el código del enlace era de ESE espacio: nadie se
      llama así hoy (el nombre se fue con su mueble, como en un renombre de
      sede), o el registro de la renumeración dice que ese mueble se llamaba
      así. Sin evidencia —el código del enlace es hoy de otro espacio que no
      tiene ese contrato y ninguna renumeración los une—, nada: el contrato y
      el código van firmados juntos, y que no calcen es un error que no se
      adivina (``test_el_contrato_del_enlace_tiene_que_ser_de_su_espacio``).
    """
    if quien.contrato is None:
        return None
    lease = db.get(SpaceLease, quien.contrato)
    if lease is None or not lease.is_active or lease.space is None:
        return None
    if db.query(ArchivedSpace.id).filter(ArchivedSpace.space_id == lease.space_id).first() is not None:
        return None
    nuevo = normalizar(lease.space.code)
    if not nuevo or nuevo == codigo:
        return None
    antes, ahora = partir_codigo(codigo), partir_codigo(nuevo)
    if (antes.cara, antes.parte) != (ahora.cara, ahora.parte):
        return None
    if del_codigo is None or _renumeracion_lo_llevo(db, antes.base, ahora.base):
        return lease
    return None


def _resolver(db: Session, quien: Quien, code: Optional[str]) -> tuple[str, Optional[Space], Optional[SpaceLease]]:
    """El código, la fila y el contrato sobre los que se está pidiendo.

    Con un enlace que dice su contrato, el código sale del CONTRATO cuando el
    espacio cambió de código desde que se mandó el enlace (``_contrato_mudado``):
    la pantalla, la planometría y el reporte caen en el código de hoy. Si el
    contrato se canceló —o no se puede probar que es de ese espacio—, 410.
    Sin contrato en el enlace (los de antes del 2026-10-02, que vencen en
    semanas), el código del token y nada más, como siempre.
    """
    codigo = _codigo(quien, code)
    if not codigo:
        raise HTTPException(status_code=404, detail="Espacio no encontrado")
    space = _espacio(db, codigo)
    lease = _contrato(quien, space)
    if quien.contrato is not None and lease is None:
        lease = _contrato_mudado(db, quien, codigo, space)
        if lease is None:
            raise HTTPException(status_code=410, detail=CONTRATO_CANCELADO)
        space = lease.space
        codigo = normalizar(space.code)
    return codigo, space, lease


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/mi-espacio", response_model=EspacioMontaje)
def mi_espacio(
    response: Response,
    quien: Quien = Depends(require_montaje),
    code: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Qué hay que montar, dónde queda y si ya se reportó."""
    # El enlace se abre, se cierra y se vuelve a abrir con la exhibición ya
    # armada. Una respuesta cacheada diría "pendiente" después de reportar.
    response.headers["Cache-Control"] = "no-store, max-age=0"

    # El código sale del token (o del contrato del enlace, si el espacio cambió
    # de código desde que se mandó: `_resolver`), nunca del pedido.
    codigo, space, lease = _resolver(db, quien, code)

    sede = _sede_de(codigo, db)
    base = _base(codigo)
    fixtures = _fixtures(db, sede)

    # El mueble del plano. Se busca por el código corto y por el completo: el
    # editor 3D genera códigos con la sede adentro y el 2D no siempre.
    mueble: dict = {}
    for f in fixtures:
        raw = str(f.get("code") or "").strip().upper()
        if not raw:
            continue
        propia = str(f.get("sede") or sede or "").strip().upper()
        completo = raw if (propia and raw.startswith(f"{propia}-")) else f"{propia}-{raw}" if propia else raw
        if base in (completo, raw):
            mueble = f
            break

    plano = _planometria(db, lease)

    reportes = (
        db.query(MountConfirmation)
        .filter(
            MountConfirmation.space_code == codigo,
            MountConfirmation.archivado_en.is_(None),
        )
        .order_by(MountConfirmation.confirmado_en.desc(), MountConfirmation.id.desc())
    )
    se_confirma_desde = None
    if quien.contrato is not None:
        # Sólo cuenta lo reportado para ESTE contrato. El reporte se guarda por
        # código —no hay columna para el contrato—, así que se separa por fecha:
        # el «montado» del proveedor anterior no es el de éste.
        desde = _se_confirma_desde(lease)
        if hoy() < desde:
            se_confirma_desde = desde.isoformat()
        inicio = datetime.combine(desde, time.min, tzinfo=ZONA_DEL_NEGOCIO)
        ultimo = next((r for r in reportes if _utc(r.confirmado_en) >= inicio), None)
    else:
        ultimo = reportes.first()
    ultimo_out = None
    if ultimo is not None:
        ultimo_out = MountOut.model_validate(ultimo)
        # Si administración vio que no coincide, quien monta lee qué corregir
        # (rediseño UX, etapa 7). Sin plata: la nota la escribió administración.
        from app.routers.mounts import _ultimas_verificaciones
        ultimo_out.verificacion = _ultimas_verificaciones(db, [ultimo.id]).get(ultimo.id)
        if ultimo.file_id:
            datos = (
                db.query(SpaceFile.filename, SpaceFile.content_type)
                .filter(SpaceFile.id == ultimo.file_id)
                .first()
            )
            if datos:
                ultimo_out.foto_nombre, ultimo_out.foto_tipo = datos

    corto = str(mueble.get("code") or "") or (base[len(sede) + 1:] if sede and base.startswith(f"{sede}-") else base)
    # El sufijo completo: la cara B y la parte (`NEV-03-PU2`, `GON-05-B-PU1`).
    partido = partir_codigo(codigo)
    if partido.cara == "B":
        corto = f"{corto}-B"
    parte = None
    dibujo = None
    if partido.parte is not None:
        corto = f"{corto}-{partido.parte.sufijo}"
        if es_participacion(partido.parte):
            # Una participación de cara (D13): quien monta ve cuál y qué parte
            # de la cara le toca, en palabras, sin plata (el porcentaje no es
            # plata: es lo que se monta). Y, con la distribución confirmada, su
            # zona dibujada sobre la cara: sólo la suya (fase 2 · G1).
            de = None
            termino = _termino_del_contrato(db, lease)
            texto = _texto_de_participacion(termino, partido)
            dibujo = _dibujo_de_participacion(db, termino, quien)
        else:
            de = cantidad_de(mueble, partido.parte.clase) if mueble else None
            texto = texto_para_montar(partido.parte, de)
        parte = {"token": partido.parte.token, "n": partido.parte.n, "de": de, "texto": texto}

    return EspacioMontaje(
        code=codigo,
        corto=corto,
        sede=sede or (space.sede if space else "") or "",
        fixture_code=str(mueble.get("code") or ""),
        label=str(mueble.get("label") or "") or (space.name if space else ""),
        nomenclatura=mueble.get("nomenclatura"),
        proveedor=(lease.supplier.name if lease and lease.supplier else ""),
        marca=(lease.marca if lease else "") or "",
        desde=str(lease.start_date) if lease else None,
        hasta=str(lease.end_date) if lease else None,
        donde=describe_location(db, codigo, sede) if sede else None,
        vecinos=[_solo_geometria(f) for f in fixtures],
        tiene_planometria=plano is not None,
        planometria_tipo=plano.content_type if plano else None,
        ultimo=ultimo_out,
        vence=quien.vence,
        se_confirma_desde=se_confirma_desde,
        parte=parte,
        dibujo=dibujo,
    )


def _termino_del_contrato(db: Session, lease: Optional[SpaceLease]) -> Optional[Participacion]:
    """El término de participación de ESTE contrato, o None (un lease de
    participación hecho a mano, o sin contrato que mostrar)."""
    if lease is None:
        return None
    return db.query(Participacion).filter(Participacion.lease_id == lease.id).first()


def _texto_de_participacion(termino: Optional[Participacion], partido) -> str:
    """«Participación 3 · 25 % de la cara A» con el porcentaje del término de
    ESTE contrato; sin término, «Participación 3 de la cara A»."""
    n = partido.parte.n
    if termino is None:
        return f"Participación {n} de la cara {partido.cara}"
    return f"Participación {n} · {pct(termino.puntos_basicos)} de la cara {partido.cara}"


def _dibujo_de_participacion(db: Session, termino: Optional[Participacion], quien: Quien) -> Optional[DibujoDeMontaje]:
    """La zona de ESTA participación sobre su cara, para quien la monta.

    Sale sólo si todo esto vale; si no, ``None`` y la pantalla queda como antes:

    1. quien pide es el enlace de montaje o un admin. El trabajador NO: con
       ``?code=`` de cada ``…-PC<n>`` armaría la distribución entera de la cara
       (D7);
    2. hay término de este contrato (un lease hecho a mano no tiene zona);
    3. la cara está en el plano, se vende por participación, y su distribución
       está CONFIRMADA y al día (``estado_de_distribucion``): ni el borrador, ni
       la de otro mueble con el mismo código, ni la que quedó «para revisar»
       porque el mueble cambió —dibujaría algo que ya no es—;
    4. tiene al menos una zona suya (una cara toda gris no le dice nada).

    **El filtro va acá**: de la capa confirmada viajan sólo los polígonos con
    ``participacion_space_id ==`` el espacio de la participación. Las formas de
    las otras participaciones nunca salen del servidor, ni sus números ni sus
    nombres. Sólo lectura: sin candado (nada se escribe).
    """
    if termino is None or not (quien.es_montaje or quien.role == "admin"):
        return None
    cara = cara_del_termino(db, termino)
    if cara.superficie is None:
        return None
    datos = leer(db, cara.codigo)
    if estado_de_distribucion(cara, datos) != "confirmada":
        return None
    zonas = [
        json.loads(z.vertices_json)
        for z in datos.capas.get("confirmada", [])
        if z.participacion_space_id == termino.space_id
    ]
    if not zonas:
        return None
    sup = cara.superficie
    return DibujoDeMontaje(
        cara=cara.letra,
        superficie=SuperficieDeMontaje(
            orientacion=sup["orientacion"],
            ancho=sup["ancho"],
            alto=sup["alto"],
            exclusiones=[
                ExclusionDeMontaje(por=str(x["por"]), u0=x["u0"], u1=x["u1"], v0=x["v0"], v1=x["v1"])
                for x in sup["exclusiones"]
            ],
        ),
        zonas=zonas,
    )


def _utc(t: datetime) -> datetime:
    """SQLite devuelve la hora sin huso; lo guardado es UTC."""
    return t if t.tzinfo is not None else t.replace(tzinfo=timezone.utc)


@router.get("/planometria")
def planometria(
    quien: Quien = Depends(require_montaje),
    code: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """El archivo de "así debe quedar", del espacio del propio enlace.

    Se sirve desde acá y no por ``/planometrias/{id}`` para no tener que abrir
    ese endpoint: allá el id es del pedido, así que habría que confiar en una
    comprobación; acá el archivo se resuelve DESDE el token y no hay id que
    cambiar en la barra de direcciones.
    """
    _codigo_de_hoy, _space, lease = _resolver(db, quien, code)
    row = _planometria(db, lease)
    if row is None:
        raise HTTPException(status_code=404, detail="Ese espacio no tiene planometría cargada")
    # `_planometria` difiere el binario para el listado; acá sí hace falta.
    completo = db.query(LeaseFile).filter(LeaseFile.id == row.id).first()
    if completo is None:
        raise HTTPException(status_code=404, detail="Ese espacio no tiene planometría cargada")

    nombre = (completo.filename or "planometria").replace('"', "'")
    try:
        nombre.encode("latin-1")
    except UnicodeEncodeError:
        nombre = nombre.encode("latin-1", "replace").decode("latin-1")

    return Response(
        content=completo.data,
        media_type=completo.content_type,
        headers={"Content-Disposition": f'inline; filename="{nombre}"'},
    )


@router.post("/reportar", response_model=MountOut, status_code=201)
async def reportar(
    estado: str = Form(...),
    motivo: Optional[str] = Form(None),
    nota: Optional[str] = Form(None),
    reportado_por: Optional[str] = Form(None),
    foto: Optional[UploadFile] = File(None),
    space_code: Optional[str] = Form(None),
    quien: Quien = Depends(require_montaje),
    db: Session = Depends(get_db),
):
    """Reporta el montaje del espacio del enlace.

    El código NO se toma del formulario cuando quien reporta es un enlace de
    montaje: sale del token. Un campo del formulario lo elige el cliente, y con
    un enlace repartido por correo eso alcanza para escribir sobre el espacio
    de cualquier otro proveedor.
    """
    # Con un enlace que dice su contrato, el código es el de HOY del espacio de
    # ese contrato (`_resolver`): después de una renumeración el reporte cae
    # en el código nuevo, donde lo busca el tablero.
    codigo, _space, lease = _resolver(db, quien, space_code)
    if quien.contrato is not None:
        desde = _se_confirma_desde(lease)
        if hoy() < desde:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Todavía no: el contrato arranca el {_fecha_larga(lease.start_date)} "
                    f"y el montaje se confirma desde el {_fecha_larga(desde)}."
                ),
            )
    return await registrar_montaje(
        db,
        space_code=codigo,
        estado=estado,
        rol=quien.role,
        sede=_sede_de(codigo, db) or None,
        motivo=motivo,
        nota=nota,
        reportado_por=reportado_por,
        foto=foto,
    )
