"""«Editar contrato»: un contrato YA guardado, reabierto en el formulario de
Vender y guardado otra vez (``docs/rediseno/vender-api.md`` §9).

Lo que pidió el dueño (2026-10-22): ~30 contratos de POBLADO se cargaron con un
valor de pocos pesos porque eran por % de las ventas cuando esa forma de cobro
no existía. Se corrigen de a uno, desde Supervisar («Para revisar» → Corregir y
la ficha del espacio), con TODO lo de Vender: la forma de venderse, el
proveedor, las fechas, el precio o el % de las ventas. Y cada edición se manda
de nuevo a los correos (comercial, proveedor y montaje).

**El pedido es el de Vender** (``POST /api/contratos/vender``) con ``edita:
{ lease_id, esperado }``: ``esperado`` es la huella entera (``huella``: valor,
fechas, proveedor, marca, cómo se cobra y, de un porcentaje, sus puntos
básicos). Una edición lleva UNA línea
—el contrato que se edita— salvo cuando pasa a venderse por partes: entonces
las partes elegidas de UNA cara. Siempre es un contrato (una reserva no se edita
por acá) y no lleva nota (la nota interna no viaja a Vender: lo mira el
proveedor).

**Siempre EL contrato del renglón.** El ``lease_id`` y ``esperado`` son lo que
Supervisar mostró. Bajo el candado del mueble (``tomar_candados``), con
``expire_all`` y la fila del contrato ``FOR UPDATE`` (la cancelación no toma el
candado del mueble, pero escribe la fila), si el contrato ya no existe → 404; si
se canceló, terminó o ya no dice lo mismo (la huella entera: dos pestañas que
cambiaban la marca con el mismo «valor y fechas» entraban las dos) → 409
``contrato_cambio`` y no se escribe nada.

**El correo no viaja con otro proveedor** (``_sin_el_correo_del_anterior``):
si la edición pasa el contrato a otro proveedor, un ``correo`` igual al del
anterior se ignora. Es el patrón de «Pasar a % de
ventas» (PR 88).

**Las fechas.** Un contrato que ya arrancó no mueve su «Desde» (422
``desde_arrancado``): los cortes, el montaje y lo cobrado cuelgan de ese día.
El «Hasta» no queda antes de hoy (422 ``hasta_pasado``) ni antes del último
corte de ventas cargado (422 ``hasta_antes_del_corte``).

**No choca consigo mismo, y con nada más.** La revisión es la de Vender
(``vender.revisar``) con el contrato que se edita excluido —``excluir_lease``
en los choques, ``excluir_termino`` en la capacidad de una cara por
participación—. Sólo ESE contrato y sólo desde acá: otro contrato del mismo
proveedor en la misma cara choca igual.

**Mismo espacio = mismo contrato.** La misma cara entera, la misma parte o el
mismo porcentaje de la misma cara: se corrige EN SU LUGAR (``space_leases``,
``condiciones_de_contrato``, ``cobros_por_venta`` y, en un porcentaje, los
puntos básicos del término con su versión). Todo lo que cuelga del contrato —la
planometría, el montaje, los cortes, la zona de Distribución, el enlace firmado—
sigue colgado (mismo ``lease_id``). Con cortes cargados el cobro sigue por
ventas y con el mismo corte (409 ``tiene_cortes``); el % sí cambia (vale para los
cortes que vienen).

**Otro espacio u otra forma = reemplazo.** En la MISMA transacción, el viejo se
cierra (``is_active = False``) y queda en ``contratos_reemplazados`` —no se
cancela—, y nacen los nuevos por el camino de Vender (``vender._escribir``),
con la nota interna del viejo. Lo que colgaba del viejo se queda con él: los
nuevos vuelven a pedir su planometría en «Para revisar». Con cortes cargados no
se reemplaza (409 ``tiene_cortes``): los nuevos volverían a pedir los mismos
meses. Un porcentaje reemplazado se da de baja con el ciclo de siempre
(``baja_en``) y el historial lo dice ``contrato.reemplazado``.

Nada de acá hace commit ni manda correos: lo hace el router, después.
"""
from __future__ import annotations

import json
import math
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from decimal import ROUND_HALF_UP, Decimal
from types import SimpleNamespace
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.fechas import hoy
from app.models.models import LeaseFile, Space, SpaceLease, SpaceStatus
from app.models.participaciones import Participacion
from app.models.vender import CobroPorVenta, CondicionesDeContrato, ContratoReemplazado, CorteDeVenta
from app.services import participaciones as part
from app.services import reglas_participacion as reglas
from app.services import vender as venta
from app.services.alta_de_contrato import cache_de_proveedores, clave_de_proveedor, proveedor_por_nombre
from app.services.candado import clave_de_candado, tomar_candados
from app.services.ciclo_participaciones import _dar_de_baja, anotar_historial
from app.services.condiciones import texto_del_total, texto_del_valor
from app.services.layout_lookup import caras_de, find_fixture_by_space_code, normalizar, sin_prefijo_de_sede
from app.services.montajes_pendientes import PLANOMETRIA, ids_pendientes
from app.services.partes import es_division, partir_codigo


def _error(status: int, code: str, message: str) -> HTTPException:
    return HTTPException(status_code=status, detail={"code": code, "message": message})


CAMBIO = ("contrato_cambio", "Ese contrato cambió mientras lo editabas: recargá y volvé a intentar.")


def _ahora() -> datetime:
    return datetime.now(timezone.utc)


def al_centavo(valor) -> Decimal:
    """El número redondeado al centavo con los medios hacia arriba, sobre su
    escritura decimal más corta (``repr``): el ruido de un float que viajó por
    JSON no cuenta, un centavo sí. Un ``nan`` o un infinito, 0."""
    v = float(valor or 0)
    if not math.isfinite(v):
        v = 0.0
    return Decimal(repr(v)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _fecha(d: Optional[date]) -> str:
    return reglas._fecha_corta(d) if d is not None else "—"


def _completo(codigo: str, sede: str) -> str:
    c = normalizar(codigo)
    s = normalizar(sede)
    if not s or c.startswith(f"{s}-"):
        return c
    return f"{s}-{c}"


# ─── Lo que dice un contrato (para la bitácora y los correos) ────────────────


@dataclass
class Foto:
    """Un contrato como lo leen los correos: sin nota y, para el de montaje,
    sin plata (``valor``, ``cobro`` y ``condicion`` no los mira)."""
    lease_id: int
    espacio: str
    sede: str
    forma: str                 # "entera" | "parte" | "pieza" | "participacion"
    parte: Optional[str]       # «EN2», «BI1»; en un porcentaje, None
    supplier_id: Optional[int]
    proveedor: str
    correo: Optional[str]
    marca: Optional[str]
    desde: date
    hasta: date
    valor: float
    #: Copias (``_copia``) de ``condiciones_de_contrato`` y ``cobros_por_venta``.
    condicion: Optional[SimpleNamespace] = None
    cobro: Optional[SimpleNamespace] = None
    pb: Optional[int] = None
    cara: Optional[str] = None  # el código completo de la cara
    #: La cara como se lee en pantalla: «PUN-04», «GON-02·A», «GON-02·B».
    visible: str = ""

    @property
    def corto(self) -> str:
        return self.visible or sin_prefijo_de_sede(self.cara or self.espacio, self.sede)

    @property
    def nombre(self) -> str:
        """El espacio como se lee: «GON-02·A», «PUN-03·EN1», «GON-01·A» (de
        un porcentaje, su cara: el `…-PC<n>` es un número interno)."""
        return f"{self.corto}·{self.parte}" if self.parte else self.corto

    @property
    def rotulo(self) -> str:
        """El espacio con el formato de la app: «PUN-03 · EN1» (una parte, como
        la línea de Vender), «CAJ-04·BI1» (una pieza), «PUN-04», «GON-01·A»."""
        if self.forma == "parte" and self.parte:
            return f"{self.corto} · {self.parte}"
        return self.nombre

    @property
    def texto_del_cobro(self) -> str:
        if self.cobro is not None:
            return texto_del_valor(self.valor, self.condicion, self.cobro)
        return f"Precio fijo {texto_del_valor(self.valor, self.condicion, None)}"


def _copia(fila, *campos):
    """Lo que dice la fila AHORA: la foto de antes no puede cambiar cuando se
    corrige la fila en su lugar."""
    return None if fila is None else SimpleNamespace(**{c: getattr(fila, c) for c in campos})


def _visible(db: Session, cara: str, sede: str) -> str:
    """La cara como la nombra la pantalla (`codigoVisibleDe`): con su letra
    sólo si el mueble tiene dos caras."""
    p = partir_codigo(cara)
    base = sin_prefijo_de_sede(p.base, sede)
    if p.cara == "B":
        return f"{base}·B"
    mueble = find_fixture_by_space_code(db, cara)
    return f"{base}·A" if mueble is not None and caras_de(mueble) == 2 else base


def termino_de(db: Session, lease_id: int) -> Optional[Participacion]:
    return db.query(Participacion).filter(Participacion.lease_id == lease_id).first()


def foto_de(db: Session, lease: SpaceLease, termino: Optional[Participacion] = None) -> Foto:
    space = lease.space
    codigo = normalizar(space.code if space else "")
    sede = normalizar(space.sede if space else "") or ""
    if not sede and codigo:
        sede = codigo.split("-", 1)[0]
    p = partir_codigo(codigo)
    if termino is None:
        termino = termino_de(db, lease.id)
    if termino is not None:
        forma, parte = "participacion", None
        cara_space = db.get(Space, termino.cara_space_id)
        cara = normalizar(cara_space.code) if cara_space else part.codigo_cara(sede, codigo)
    elif p.parte is None:
        forma, parte, cara = "entera", None, codigo
    else:
        forma = "parte" if es_division(p.parte) else "pieza"
        parte = p.parte.sufijo
        cara = part.codigo_cara(sede, codigo) if es_division(p.parte) else codigo
    supplier = lease.supplier
    return Foto(
        lease_id=lease.id, espacio=codigo, sede=sede, forma=forma, parte=parte,
        supplier_id=lease.supplier_id, proveedor=supplier.name if supplier else "",
        correo=supplier.email if supplier else None, marca=lease.marca,
        desde=lease.start_date, hasta=lease.end_date, valor=float(lease.monthly_rent or 0),
        condicion=_copia(db.get(CondicionesDeContrato, lease.id), "modo_precio", "valor_tecleado"),
        cobro=_copia(db.get(CobroPorVenta, lease.id), "porcentaje", "corte"),
        pb=termino.puntos_basicos if termino is not None else None, cara=cara,
        visible=(sin_prefijo_de_sede(partir_codigo(codigo).base, sede) if forma == "pieza"
                 else _visible(db, cara or codigo, sede)),
    )


def _texto_del_espacio(fotos: list[Foto]) -> str:
    """«PUN-04 entera», «PUN-04 · EN1 y EN2», «GON-01 · 25 %»."""
    if not fotos:
        return "—"
    f = fotos[0]
    if f.forma == "participacion":
        return f"{f.corto} · {reglas.pct(f.pb or 0)}"
    if f.forma == "entera":
        return f"{f.corto} entera"
    if f.forma == "pieza":
        return f"{f.corto}·{f.parte}"
    partes = sorted(x.parte or "" for x in fotos)
    lista = partes[0] if len(partes) == 1 else f"{', '.join(partes[:-1])} y {partes[-1]}"
    return f"{f.corto} · {lista}"


def _texto_del_cobro(fotos: list[Foto]) -> str:
    if not fotos:
        return "—"
    if len(fotos) == 1:
        return fotos[0].texto_del_cobro
    if all(f.cobro is not None for f in fotos):
        return fotos[0].texto_del_cobro
    total = texto_del_total([(f.valor, f.condicion, f.cobro) for f in fotos])
    return f"Precio fijo {total}" if total else "—"


def cambios(antes: Foto, despues: list[Foto]) -> list[tuple[str, str, str, bool]]:
    """``(campo, antes, ahora, cambió)`` de lo que se lee de un contrato. Sin
    la nota. El primero es el espacio; el cobro, el último."""
    d = despues[0] if despues else antes
    filas = [
        ("Espacio", _texto_del_espacio([antes]), _texto_del_espacio(despues)),
        ("Proveedor", antes.proveedor or "—", d.proveedor or "—"),
        ("Marca", antes.marca or "—", d.marca or "—"),
        ("Fechas", f"{_fecha(antes.desde)} → {_fecha(antes.hasta)}", f"{_fecha(d.desde)} → {_fecha(d.hasta)}"),
        ("Cobro", _texto_del_cobro([antes]), _texto_del_cobro(despues)),
    ]
    return [(c, a, b, a != b) for c, a, b in filas]


# ─── El pedido ────────────────────────────────────────────────────────────────


def _validar_edicion(p: dict) -> None:
    """Lo que una edición no puede traer (422, antes de mirar la base)."""
    if p.get("tipo") != "contrato":
        raise _error(422, "edita_tipo", "Una edición guarda un contrato: una reserva no se edita por acá.")
    if (p.get("nota") or "").strip():
        raise _error(422, "edita_nota", "La nota interna del contrato no se cambia desde Vender.")
    lineas = p.get("lineas") or []
    if any((x.get("participacion") or {}).get("renueva") is not None for x in lineas):
        raise _error(422, "edita_renueva", "Una edición no renueva: para el período siguiente, usá «Renovar».")
    if len(lineas) > 1:
        sede = normalizar(p.get("sede"))
        if any(x.get("participacion") for x in lineas):
            raise _error(422, "edita_lineas", "Una edición lleva un solo espacio, o las partes de una misma cara.")
        partes = [partir_codigo(_completo(x.get("espacio") or "", sede)) for x in lineas]
        if not all(x.parte is not None and es_division(x.parte) for x in partes) \
                or len({(x.cara_entera, x.parte.clase) for x in partes}) != 1:
            raise _error(422, "edita_lineas", "Una edición lleva un solo espacio, o las partes de una misma cara.")


def _al_centesimo(p) -> Decimal:
    """Un porcentaje de las ventas al centésimo («7,25 %»), sin el ruido de un float."""
    return Decimal(repr(float(p or 0))).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def huella(db: Session, lease: SpaceLease, termino: Optional[Participacion]) -> tuple:
    """Lo que el contrato dice HOY, en la forma en que se compara con
    ``esperado``: el valor al centavo, las dos fechas, el proveedor y la marca
    (sin mayúsculas ni espacios a los costados), cómo se cobra (fijo, o el % al
    centésimo con su corte) y, de un porcentaje, sus puntos básicos."""
    cobro = db.get(CobroPorVenta, lease.id)
    return (
        al_centavo(lease.monthly_rent), lease.start_date, lease.end_date,
        clave_de_proveedor(lease.supplier.name if lease.supplier else ""), reglas._marca_normal(lease.marca),
        ("ventas", _al_centesimo(cobro.porcentaje), cobro.corte) if cobro is not None else ("fijo", None, None),
        termino.puntos_basicos if termino is not None else None,
    )


def _huella_esperada(esperado: dict) -> tuple:
    cobro = esperado.get("cobro") or {}
    ventas = cobro.get("modo") == "ventas"
    return (
        al_centavo(esperado["valor"]), esperado["desde"], esperado["hasta"],
        clave_de_proveedor(esperado.get("proveedor")), reglas._marca_normal(esperado.get("marca")),
        ("ventas", _al_centesimo(cobro.get("porcentaje")), cobro.get("corte")) if ventas else ("fijo", None, None),
        esperado.get("puntos_basicos"),
    )


def _vigente_y_esperado(db: Session, lease: SpaceLease, termino: Optional[Participacion], esperado: dict) -> None:
    """409 ``contrato_cambio`` si el contrato ya no es el que se mostró: la
    huella ENTERA (``huella``), no sólo el valor y las fechas. Con sólo eso, dos
    pestañas que cambiaban la marca o el proveedor con el mismo ``esperado``
    entraban las dos (200 y 200) y salían dos tandas de correos."""
    cancelado = not lease.is_active or (termino is not None and (termino.baja_en is not None
                                                                or termino.estado != "contrato"))
    if cancelado or lease.end_date < hoy():
        raise _error(409, *CAMBIO)
    if huella(db, lease, termino) != _huella_esperada(esperado):
        raise _error(409, *CAMBIO)


def _sin_el_correo_del_anterior(p: dict, lease: SpaceLease) -> dict:
    """Si la edición le pasa el contrato a OTRO proveedor, el correo del
    anterior no viaja con él: Vender abre con el correo del proveedor cargado,
    y al cambiar el nombre ese correo seguía en el campo y
    ``proveedor_por_nombre`` se lo daba al nuevo (o a uno que existía sin
    correo), y «Tu contrato cambió» le llegaba al de antes. Un ``correo`` igual
    al del proveedor anterior se ignora; cualquier otro, se usa como siempre
    (sólo completa al que no tiene)."""
    anterior = lease.supplier
    if anterior is None or clave_de_proveedor(p.get("proveedor")) == clave_de_proveedor(anterior.name):
        return p
    correo = (p.get("correo") or "").strip().lower()
    if correo and correo == (anterior.email or "").strip().lower():
        return {**p, "correo": None}
    return p


def _cortes(db: Session, lease_id: int) -> list[CorteDeVenta]:
    return db.query(CorteDeVenta).filter(CorteDeVenta.lease_id == lease_id).order_by(CorteDeVenta.periodo_hasta).all()


def _reglas_de_fechas(lease: SpaceLease, p: dict, cortes: list[CorteDeVenta]) -> None:
    dia = hoy()
    if lease.start_date <= dia and p["desde"] != lease.start_date:
        raise _error(422, "desde_arrancado",
                     f"El contrato arrancó el {_fecha(lease.start_date)}: su «Desde» no se mueve. "
                     "Para otro arranque, renovalo o cancelalo.")
    # Primero el corte: un corte cargado siempre terminó antes de hoy, así que
    # un «Hasta» antes del corte también es antes de hoy, y esta frase dice más.
    if cortes:
        ultimo = max(c.periodo_hasta for c in cortes)
        if p["hasta"] < ultimo:
            raise _error(422, "hasta_antes_del_corte",
                         f"Ya hay ventas cargadas hasta el {_fecha(ultimo)}: el «Hasta» no puede quedar antes.")
    if p["hasta"] < dia:
        raise _error(422, "hasta_pasado", "El «Hasta» no puede quedar antes de hoy.")


def _en_el_lugar(db: Session, lease: SpaceLease, termino: Optional[Participacion], rev: venta.Revision,
                 sede: str) -> bool:
    """¿El mismo espacio y la misma forma? La misma cara entera, la misma parte
    o el mismo porcentaje de la misma cara."""
    if len(rev.lineas) != 1:
        return False
    linea = rev.lineas[0]
    if termino is not None:
        cara = db.get(Space, termino.cara_space_id)
        return linea.cara is not None and cara is not None and normalizar(linea.cara.codigo) == normalizar(cara.code)
    if linea.fila is None or not linea.fila.codigo:
        return False
    propio = lease.space.code if lease.space else ""
    return _completo(linea.fila.codigo, sede) == _completo(propio, sede)


def _reglas_de_cobro(db: Session, lease: SpaceLease, p: dict, cortes: list[CorteDeVenta], en_lugar: bool) -> None:
    """Con ventas ya cargadas, el cobro sigue por ventas, con el mismo corte, y
    en el mismo contrato (409 ``tiene_cortes``)."""
    if not cortes:
        return
    viejo = db.get(CobroPorVenta, lease.id)
    nuevo = p.get("cobro") or {"modo": "fijo"}
    if not en_lugar:
        raise _error(409, "tiene_cortes",
                     "Este contrato ya tiene ventas cargadas: no cambia de forma ni de espacio. "
                     "Editalo en su lugar, o cancelalo y vendé de nuevo.")
    if nuevo.get("modo") != "ventas":
        raise _error(409, "tiene_cortes",
                     "Este contrato ya tiene ventas cargadas: sigue cobrándose por % de las ventas.")
    if viejo is not None and nuevo.get("corte") != viejo.corte:
        cual = "cada mes" if viejo.corte == "mensual" else "al final"
        raise _error(409, "tiene_cortes",
                     f"Este contrato ya tiene ventas cargadas con corte {cual}: el corte no cambia.")


def _revisar_termino(db: Session, termino: Participacion, linea: venta.Linea, p: dict) -> None:
    """Las invariantes de los términos de UNA participación (I1–I3, como
    ``reglas.revisar_terminos``) y que no rompa la distribución confirmada,
    para un contrato de porcentaje que se corrige en su lugar. La capacidad ya
    la miró ``vender.revisar`` sin contarse a sí mismo."""
    dia = hoy()
    datos = linea.datos
    de = datos.por_s.get(termino.space_id, [])
    t = next((x for x in de if x["id"] == termino.id), None)
    if t is None:
        raise _error(409, *CAMBIO)
    otros = [x for x in de if x["id"] != termino.id]
    supplier = cache_de_proveedores(db).get(clave_de_proveedor(p["proveedor"]))
    supplier_id = supplier.id if supplier is not None else None
    marca = (p.get("marca") or "").strip() or None
    toca_quien = supplier_id != t["supplier_id"] or reglas._marca_normal(marca) != reglas._marca_normal(t["marca"])
    if toca_quien:
        for o in otros:
            if o.get("supplier_id") != supplier_id or reglas._marca_normal(o.get("marca")) != reglas._marca_normal(marca):
                raise _error(409, "otro_proveedor",
                             "Esta participación tiene otro término con otro proveedor o marca: un proveedor o una "
                             "marca distintos son otra participación.")
    if linea.pb != t["pb"]:
        for o in otros:
            if reglas.vivo(o, dia) and o["pb"] != linea.pb:
                raise _error(409, "otro_porcentaje",
                             f"Esta participación tiene otro término vivo con el {reglas.pct(o['pb'])}: "
                             "con otro porcentaje es una participación nueva.")
    for o in otros:
        if not reglas.vivo(o, dia):
            continue
        a, b = reglas._fechas_de(o)
        if a <= p["hasta"] and p["desde"] <= b:
            raise _error(409, "termino_superpuesto",
                         f"Esta participación ya tiene otro término del {_fecha(a)} al {_fecha(b)}: "
                         "las fechas no pueden pisarse.")
    medidas = part.medidas_de_capas(linea.cara, datos)
    if medidas is not None and medidas.get("confirmada") is not None:
        despues = {s: list(ts) for s, ts in datos.por_s.items()}
        despues[termino.space_id] = [
            {**x, "pb": linea.pb, "desde": p["desde"], "hasta": p["hasta"],
             "lease": {"is_active": True, "start_date": p["desde"], "end_date": p["hasta"]}}
            if x["id"] == termino.id else x
            for x in despues[termino.space_id]
        ]
        if reglas.rompe_distribucion(medidas["confirmada"], datos.por_s, despues, dia):
            # Delante del proveedor (Vender): sin nombrar participaciones.
            raise _error(409, "rompe_distribucion",
                         "Con ese porcentaje o esas fechas no entra en la distribución de la cara: "
                         "revisala en Supervisar.")


# ─── Revisar y escribir ──────────────────────────────────────────────────────


@dataclass
class Editado:
    """Lo que hizo una edición, para la respuesta, la bitácora y los correos."""
    modo: str                      # "en_el_lugar" | "reemplazo"
    lease_id: int
    antes: Foto
    despues: list[Foto] = field(default_factory=list)
    #: ``(accion, entidad, entidad_id, detalle)``.
    bitacora: list[tuple] = field(default_factory=list)
    contratos: list[dict] = field(default_factory=list)
    participaciones: list[dict] = field(default_factory=list)
    reemplazado_por: list[int] = field(default_factory=list)


def _revisar(db: Session, p: dict, lease: SpaceLease, termino: Optional[Participacion]):
    """Todo lo que se mira de una edición, sin escribir: devuelve la revisión
    de Vender y si va en su lugar."""
    sede = normalizar(p["sede"])
    _vigente_y_esperado(db, lease, termino, p["edita"]["esperado"])
    cortes = _cortes(db, lease.id)
    _reglas_de_fechas(lease, p, cortes)
    rev = venta.revisar(db, p, excluir_lease=lease.id, excluir_termino=termino.id if termino is not None else None)
    venta._rechazar(rev)
    en_lugar = _en_el_lugar(db, lease, termino, rev, sede)
    _reglas_de_cobro(db, lease, p, cortes, en_lugar)
    if en_lugar and termino is not None:
        _revisar_termino(db, termino, rev.lineas[0], p)
    return rev, en_lugar


def editar(db: Session, p: dict, actor: str, validar: bool = False) -> Optional[Editado]:
    """Revisa y, sin ``validar``, escribe la edición. ``None`` al validar.
    Levanta 404 ``contrato_no_existe``, 409 ``contrato_cambio`` /
    ``tiene_cortes`` / ``contrato_invalido`` / ``plano_cambio``, y 422."""
    _validar_edicion(p)
    venta._validar_pedido(p)
    lease_id = int(p["edita"]["lease_id"])
    lease = db.get(SpaceLease, lease_id)
    if lease is None:
        raise _error(404, "contrato_no_existe", "Ese contrato no existe.")
    termino = termino_de(db, lease_id)
    p = _sin_el_correo_del_anterior(p, lease)
    rev, _ = _revisar(db, p, lease, termino)
    if validar:
        return None

    # El candado de los muebles del pedido Y del contrato que se edita (que
    # puede ser otro mueble: el reemplazo se lleva el contrato a otro lado).
    codigos = rev.codigos | {
        venta._codigo_completo(x["espacio"], normalizar(p["sede"])) for x in p["lineas"] if (x.get("espacio") or "").strip()
    }
    if lease.space is not None:
        codigos.add(normalizar(lease.space.code))
    tomados = set(tomar_candados(db, codigos))
    # Lectura fresca: lo que la primera revisión cargó en la sesión no se
    # refresca solo al volver a consultarlo.
    db.expire_all()
    lease = db.query(SpaceLease).filter(SpaceLease.id == lease_id).with_for_update().one_or_none()
    if lease is None:
        raise _error(404, "contrato_no_existe", "Ese contrato no existe.")
    termino = termino_de(db, lease_id)
    p = _sin_el_correo_del_anterior(p, lease)
    rev, en_lugar = _revisar(db, p, lease, termino)
    if any(clave_de_candado(c) not in tomados for c in rev.codigos):
        raise _error(409, "plano_cambio", "El plano cambió mientras guardabas: recargá y volvé a intentar.")
    antes = foto_de(db, lease, termino)
    if en_lugar:
        return _corregir(db, p, lease, termino, rev, actor, antes)
    return _reemplazar(db, p, lease, termino, rev, actor, antes)


def _historial_sin_plata(f: Foto) -> dict:
    return {"puntos_basicos": f.pb, "desde": f.desde, "hasta": f.hasta, "proveedor": f.proveedor, "marca": f.marca}


def _detalle(antes: Foto, despues: list[Foto]) -> str:
    """La línea de la bitácora (de administración): qué cambió, antes → ahora."""
    tocado = [f"{c}: {a} → {b}" for c, a, b, cambio in cambios(antes, despues) if cambio]
    return f"{antes.espacio} · " + ("; ".join(tocado) if tocado else "sin cambios")


def _corregir(db: Session, p: dict, lease: SpaceLease, termino: Optional[Participacion], rev: venta.Revision,
              actor: str, antes: Foto) -> Editado:
    """El mismo contrato, corregido en su lugar."""
    linea = rev.lineas[0]
    x = linea.entrada
    cobro = p.get("cobro") or {"modo": "fijo"}
    ventas = cobro.get("modo") == "ventas"
    valor = 0.0 if ventas else float(x.get("valor") or 0)
    correo = part._correo(p.get("correo"))
    supplier = proveedor_por_nombre(db, p["proveedor"], correo, cache_de_proveedores(db))
    lease.supplier_id = supplier.id
    lease.supplier = supplier
    lease.marca = (p.get("marca") or "").strip() or None
    lease.start_date = p["desde"]
    lease.end_date = p["hasta"]
    lease.monthly_rent = valor
    if lease.space is not None and lease.start_date <= hoy():
        lease.space.status = SpaceStatus.occupied

    condicion = db.get(CondicionesDeContrato, lease.id)
    if x.get("modo_precio") in ("mensual", "total"):
        if condicion is None:
            db.add(CondicionesDeContrato(lease_id=lease.id, modo_precio=x["modo_precio"],
                                         valor_tecleado=x.get("valor_tecleado")))
        else:
            condicion.modo_precio = x["modo_precio"]
            condicion.valor_tecleado = x.get("valor_tecleado")
    viejo = db.get(CobroPorVenta, lease.id)
    if ventas:
        if viejo is None:
            db.add(CobroPorVenta(lease_id=lease.id, porcentaje=float(cobro["porcentaje"]), corte=cobro["corte"],
                                 creado_por=actor))
        else:
            viejo.porcentaje = float(cobro["porcentaje"])
            viejo.corte = cobro["corte"]
    elif viejo is not None:
        # Sin cortes cargados (`_reglas_de_cobro`): no se pierde nada cobrado.
        db.delete(viejo)

    if termino is not None:
        if linea.pb != termino.puntos_basicos:
            # Mismo PC, mismo número, mismas zonas: sólo el porcentaje.
            part._subir_version_termino(db, termino.id, termino.version, {"puntos_basicos": linea.pb}, actor)
            db.refresh(termino)
    db.flush()
    despues = foto_de(db, lease, termino)
    if termino is not None:
        anotar_historial(
            db, tipo="contractual", accion="contrato.editado", actor=actor, cara_space_id=termino.cara_space_id,
            participacion_space_id=termino.space_id, participacion_id=termino.id,
            detalle=(f"Contrato editado · participación {termino.numero} · {reglas.pct(termino.puntos_basicos)} · "
                     f"{despues.proveedor} · {despues.desde.isoformat()}→{despues.hasta.isoformat()}"),
            antes=_historial_sin_plata(antes), despues=_historial_sin_plata(despues),
        )
    hecho = Editado(modo="en_el_lugar", lease_id=lease.id, antes=antes, despues=[despues])
    hecho.bitacora.append(("contrato.editado", "contrato", lease.id, _detalle(antes, [despues])))
    if termino is not None:
        hecho.participaciones.append({"cara": despues.cara, "espacio": despues.espacio, "termino_id": termino.id,
                                      "tipo": "contrato", "lease_id": lease.id, "reserva_id": None})
    else:
        hecho.contratos.append({"espacio": despues.espacio, "lease_id": lease.id})
    return hecho


def _reemplazar(db: Session, p: dict, lease: SpaceLease, termino: Optional[Participacion], rev: venta.Revision,
                actor: str, antes: Foto) -> Editado:
    """Otro espacio u otra forma: nacen los nuevos por el camino de Vender y el
    viejo se cierra como REEMPLAZADO, todo en la misma transacción."""
    escrito = venta._escribir(db, p, rev, actor, nota_de=lease.notes or "")
    nuevos = [c["lease_id"] for c in escrito.contratos] + [x["lease_id"] for x in escrito.participaciones
                                                           if x.get("lease_id")]
    lease.is_active = False
    space = lease.space
    if space is not None:
        quedan = (db.query(SpaceLease)
                  .filter(SpaceLease.space_id == space.id, SpaceLease.is_active.is_(True), SpaceLease.id != lease.id)
                  .count())
        if quedan == 0 and space.status == SpaceStatus.occupied:
            space.status = SpaceStatus.free
    cuando = _ahora()
    db.add(ContratoReemplazado(lease_id=lease.id, reemplazado_por=json.dumps(nuevos), en=cuando, por=actor))
    if termino is not None and termino.baja_en is None:
        # El ciclo de siempre (`al_cancelar_contrato`), pero el historial lo
        # dice: no es una baja del proveedor, es otra forma de venderle.
        _dar_de_baja(termino, actor, cuando)
        anotar_historial(
            db, tipo="evento", accion="contrato.reemplazado", actor=actor, cara_space_id=termino.cara_space_id,
            participacion_space_id=termino.space_id, participacion_id=termino.id,
            detalle=f"Contrato reemplazado por otra forma de venderlo · participación {termino.numero}",
            antes={"lease_id": lease.id, "desde": lease.start_date, "hasta": lease.end_date,
                   "puntos_basicos": termino.puntos_basicos},
            despues={"baja_en": cuando, "reemplazado_por": nuevos},
        )
    db.flush()
    despues = [foto_de(db, db.get(SpaceLease, i)) for i in nuevos]
    hecho = Editado(modo="reemplazo", lease_id=lease.id, antes=antes, despues=despues,
                    contratos=escrito.contratos, participaciones=escrito.participaciones, reemplazado_por=nuevos)
    hecho.bitacora.append(("contrato.reemplazado", "contrato", lease.id,
                           f"{antes.espacio} → {', '.join(d.espacio for d in despues)} · "
                           f"{_detalle(antes, despues).split(' · ', 1)[1]}"))
    hecho.bitacora.extend(escrito.bitacora)
    return hecho


# ─── Lo que Supervisar necesita para abrir Vender con el contrato ────────────


def para_editar(db: Session, lease_id: int) -> dict:
    """``GET /api/contratos/{lease_id}/edicion``: el contrato como lo carga
    Vender. Sin la nota interna (Vender lo mira el proveedor). Sólo
    administración."""
    lease = db.get(SpaceLease, lease_id)
    if lease is None:
        raise _error(404, "contrato_no_existe", "Ese contrato no existe.")
    termino = termino_de(db, lease_id)
    f = foto_de(db, lease, termino)
    cortes = _cortes(db, lease_id)
    dia = hoy()
    planometria = (db.query(LeaseFile.filename)
                   .filter(LeaseFile.lease_id == lease_id, LeaseFile.kind == PLANOMETRIA)
                   .order_by(LeaseFile.id.desc()).first())
    activo = bool(lease.is_active) and lease.end_date >= dia and not (
        termino is not None and (termino.baja_en is not None or termino.estado != "contrato"))
    return {
        "lease_id": lease.id, "espacio": f.espacio, "sede": f.sede, "cara": f.cara, "forma": f.forma,
        "parte": f.parte, "proveedor": f.proveedor, "correo": f.correo, "marca": f.marca,
        "desde": f.desde, "hasta": f.hasta, "valor": f.valor,
        "modo_precio": f.condicion.modo_precio if f.condicion is not None else None,
        "valor_tecleado": f.condicion.valor_tecleado if f.condicion is not None else None,
        "cobro": ({"porcentaje": f.cobro.porcentaje, "corte": f.cobro.corte} if f.cobro is not None else None),
        "puntos_basicos": f.pb, "termino_id": termino.id if termino is not None else None,
        "activo": activo, "arranco": lease.start_date <= dia,
        "ultimo_corte": max((c.periodo_hasta for c in cortes), default=None), "cortes": len(cortes),
        "planometria": planometria[0] if planometria else None,
        "montaje_pendiente": lease.id in ids_pendientes(db, [lease.id]),
        "hoy": dia,
    }

