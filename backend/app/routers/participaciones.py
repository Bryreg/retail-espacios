"""Participaciones de cara: la API (diseño ``21-diseno-final.md`` §5).

Rutas efectivas ``/api/participaciones/…``. Todas son de administrador
(``require_admin``) **salvo** ``GET /ocupacion``, que lee cualquier sesión del
supermercado (``require_auth``): es anónima —intervalos ``{desde, hasta, pb}``
sin nombres, montos ni números de participación— y la usan Vender, Supervisar,
el plano 2D y la banda de estado del 3D. El trabajador no ve participaciones
ni zonas (D7) y la plata nunca le llega: todo lo que lleva valor o proveedor
es de administrador.

Reglas de la casa que valen acá:

· **Rutas literales antes que las paramétricas** (como ``/face-images`` antes
  de ``/{space_id}``): ``/cara``, ``/resumen``, ``/ocupacion``,
  ``/historial`` y ``/distribucion/…`` antes de ``/{participacion_id}/…``.
  Orden de declaración: 1, 2, 3, 4, 10, 11, 12, 5, 6, 7, 8, 9 (tabla §5.2).
· **Los GET reciben sus datos por query, nunca por ruta** (``?sede=&espacio=``):
  el barrido del token de montaje (``tests/test_montaje_enlace.py``) los cubre
  sin casos nuevos, y un código con ``#`` o ``/`` no rompe la URL.
· La lógica vive en ``services/participaciones.py`` (sin commit). Acá se
  anota la bitácora, se hace commit y DESPUÉS se arma la respuesta y se
  encolan los correos. Un 409 que guarda algo (la confirmación de una
  distribución con errores deja el borrador) va con ``JSONResponse`` después
  del commit: con ``raise HTTPException`` la sesión haría rollback.
"""
from datetime import date
from typing import Literal, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, Query, Request
from fastapi.responses import JSONResponse
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel, ConfigDict, Field, StrictInt, field_validator
from sqlalchemy.orm import Session

from app.auth import require_admin, require_auth
from app.clientes import Cliente, cliente_del_pedido
from app.database import get_db
from app.routers.bulk_leases import FilaOut, _avisar
from app.services import participaciones as servicio
from app.services.bitacora import anotar
from app.services.ciclo_participaciones import actor_de
from app.services.reglas_participacion import pct

router = APIRouter(prefix="/participaciones", tags=["participaciones"])


# ─── Cuerpos ──────────────────────────────────────────────────────────────────

class _Estricto(BaseModel):
    #: Campos de más → 422 (§5.3): un cliente viejo que manda «proveedor» al
    #: renovar no puede creer que lo cambió.
    model_config = ConfigDict(extra="forbid")


def _texto_lleno(v: str) -> str:
    limpio = (v or "").strip()
    if not limpio:
        raise ValueError("no puede estar vacío")
    return limpio


class AltaIn(_Estricto):
    sede: str = Field(min_length=1, max_length=120)
    espacio: str = Field(min_length=1, max_length=200)
    tipo: Literal["reserva", "contrato"]
    proveedor: str = Field(min_length=1, max_length=200)
    correo: Optional[str] = Field(default=None, max_length=254)
    marca: Optional[str] = Field(default=None, max_length=200)
    puntos_basicos: StrictInt = Field(ge=1, le=10000)
    desde: date
    hasta: date
    caduca: Optional[date] = None
    valor_mensual: Optional[float] = None
    notas: Optional[str] = Field(default=None, max_length=2000)

    _proveedor = field_validator("proveedor")(_texto_lleno)


class EditarIn(_Estricto):
    version: StrictInt
    puntos_basicos: Optional[StrictInt] = Field(default=None, ge=1, le=10000)
    desde: Optional[date] = None
    hasta: Optional[date] = None
    caduca: Optional[date] = None
    marca: Optional[str] = Field(default=None, max_length=200)
    notas: Optional[str] = Field(default=None, max_length=2000)


class ConfirmarIn(_Estricto):
    version: StrictInt
    valor_mensual: Optional[float] = None
    correo: Optional[str] = Field(default=None, max_length=254)
    notas: Optional[str] = Field(default=None, max_length=2000)
    puntos_basicos: Optional[StrictInt] = Field(default=None, ge=1, le=10000)
    desde: Optional[date] = None
    hasta: Optional[date] = None


class CancelarIn(_Estricto):
    version: StrictInt


class RenovarIn(_Estricto):
    version: StrictInt
    tipo: Literal["reserva", "contrato"]
    desde: date
    hasta: date
    caduca: Optional[date] = None
    valor_mensual: Optional[float] = None
    correo: Optional[str] = Field(default=None, max_length=254)
    notas: Optional[str] = Field(default=None, max_length=2000)


class ZonaIn(_Estricto):
    participacion_space_id: StrictInt
    #: La estructura (pares de números finitos) la mira el servicio, en el
    #: orden de §3.7, con el código de la gemela (``ZONA_MALFORMADA`` → 422).
    vertices: list


class DistribucionIn(_Estricto):
    sede: str = Field(min_length=1, max_length=120)
    espacio: str = Field(min_length=1, max_length=200)
    version: StrictInt = Field(ge=0)
    zonas: list[ZonaIn] = Field(default_factory=list)


# fase 2 · I1 · «Copiar zonas de otra cara» (D20, Caso F): de dónde vienen las
# zonas de un borrador. Es historia, no una regla: el servidor valida las zonas
# como las de cualquier borrador (una de otra cara es `espacio_ajeno`) y no
# recalcula la copia; esto sólo va al historial y a la bitácora.

class ParDeCopiaIn(_Estricto):
    #: El número de la participación en la cara de origen (el n de PC<n>).
    origen: StrictInt = Field(ge=1, le=99)
    #: El de la participación de ESTA cara que recibió sus zonas; None: no se copió.
    destino: Optional[StrictInt] = Field(default=None, ge=1, le=99)


class OrigenDeCopiaIn(_Estricto):
    sede: str = Field(min_length=1, max_length=120)
    #: «GON-01» o «GON-01-B», como en ``GET /cara``.
    espacio: str = Field(min_length=1, max_length=200)
    capa: Literal["confirmada", "borrador"]
    #: La versión de la distribución de origen que se leyó.
    version: StrictInt = Field(ge=0)
    espejo: bool = False
    mapa: list[ParDeCopiaIn] = Field(default_factory=list, max_length=99)
    #: Las zonas del origen que quedaron afuera (no rigen, sin destino, sin lugar).
    sin_copiar: StrictInt = Field(default=0, ge=0, le=500)


class BorradorIn(DistribucionIn):
    #: El autoguardado del navegador (§9.8): sin historial ni bitácora.
    automatico: bool = False
    #: fase 2 · I1: las zonas vienen de «Copiar zonas de otra cara». Sólo para
    #: el historial y la bitácora; con él, el guardado se anota aunque venga
    #: ``automatico`` (una copia siempre queda en el historial).
    origen: Optional[OrigenDeCopiaIn] = None


class DescartarIn(_Estricto):
    sede: str = Field(min_length=1, max_length=120)
    espacio: str = Field(min_length=1, max_length=200)
    version: StrictInt = Field(ge=0)


# ─── Ayudas ───────────────────────────────────────────────────────────────────

def _zonas(cuerpo: DistribucionIn) -> list[dict]:
    return [{"participacion_space_id": z.participacion_space_id, "vertices": z.vertices} for z in cuerpo.zonas]


def _respuesta_de_termino(db: Session, hecho: "servicio.Hecho") -> dict:
    """``{"termino": TerminoOut, "cara": <el bloque de GET /cara>}``, leído
    DESPUÉS del commit."""
    bloque = servicio.bloque_de_cara(db, hecho.cara)
    termino = None
    for p in bloque["participaciones"]:
        for t in p["terminos"]:
            if t["id"] == hecho.termino.id:
                termino = t
    return {"termino": termino, "cara": bloque}


def _correos(db: Session, background_tasks: BackgroundTasks, hecho: "servicio.Hecho", cliente: Cliente):
    """Los correos de un contrato nuevo, los mismos de la planilla
    (``bulk_leases._avisar``), con la parte dicha para quien monta: «Participación
    3 · 25 % de la cara A». Una reserva no manda correos."""
    if hecho.lease is None:
        return None
    lease, t = hecho.lease, hecho.termino
    pc = lease.space
    fila = FilaOut(
        fila=0, estado="ok", codigo=pc.code, nombre=pc.name, sede=pc.sede,
        proveedor=hecho.supplier.name if hecho.supplier else None, marca=lease.marca,
        correo=hecho.supplier.email if hecho.supplier else None, valor=lease.monthly_rent,
        desde=lease.start_date.isoformat(), hasta=lease.end_date.isoformat(), lease_id=lease.id,
        parte=f"Participación {t.numero} · {pct(t.puntos_basicos)} de la cara {hecho.cara.letra}",
    )
    return _avisar(db, background_tasks, pc.sede, [fila], cliente).model_dump()


def _bitacora(db: Session, request: Request, rol: str, accion: Optional[str], entidad: str, entidad_id: str,
              detalle: str) -> None:
    if accion:
        anotar(db, request, rol, accion, entidad=entidad, entidad_id=entidad_id, detalle=detalle)


def _respuesta_de_distribucion(db: Session, hecho: "servicio.HechoDistribucion") -> dict:
    bloque = servicio.bloque_de_cara(db, hecho.cara)
    version = bloque["distribucion"]["version"] if bloque["distribucion"] else 0
    return {**bloque, "version": version}


# ─── 1–4 · Lecturas ───────────────────────────────────────────────────────────

@router.get("/cara")
def leer_cara(
    sede: str = Query(..., min_length=1),
    espacio: str = Query(..., min_length=1),
    desde: Optional[date] = None,
    hasta: Optional[date] = None,
    rol: str = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """1 · Todo lo de una cara: superficie, firma, distribución (las dos
    capas), participaciones con sus términos, capacidad y revisión."""
    cara = servicio.resolver_cara(db, sede, espacio)
    return servicio.bloque_de_cara(db, cara, desde, hasta)


@router.get("/resumen")
def leer_resumen(
    sede: str = Query(..., min_length=1),
    dia: Optional[date] = None,
    desde: Optional[date] = None,
    hasta: Optional[date] = None,
    proveedor_id: Optional[int] = None,
    espacio: Optional[str] = None,
    rol: str = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """2 · El informe por sede, mueble, proveedor, día y período (D18)."""
    return servicio.resumen(db, sede, dia, desde, hasta, proveedor_id, espacio)


@router.get("/ocupacion")
def leer_ocupacion(
    sede: str = Query(..., min_length=1),
    rol: str = Depends(require_auth),
    db: Session = Depends(get_db),
):
    """3 · La ocupación ANÓNIMA por cara. La única ruta de participaciones que
    lee el trabajador: sin nombres, montos ni números de participación."""
    return servicio.ocupacion(db, sede)


@router.get("/historial")
def leer_historial(
    sede: Optional[str] = None,
    espacio: Optional[str] = None,
    participacion_id: Optional[int] = None,
    limite: int = Query(servicio.LIMITE_DEL_HISTORIAL, ge=1, le=servicio.LIMITE_MAXIMO_DEL_HISTORIAL),
    rol: str = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """4 · El historial de una cara o de una participación (D14)."""
    return servicio.historial(db, sede, espacio, participacion_id, limite)


# ─── 10–12 · La distribución ──────────────────────────────────────────────────

@router.put("/distribucion/borrador")
def guardar_borrador(
    cuerpo: BorradorIn,
    request: Request,
    rol: str = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """10 · Guardar el borrador, con sus errores marcados (sin candado). Con
    ``origen`` (fase 2 · I1, «Copiar zonas de otra cara») se anota como
    ``distribucion.copiada``: ningún término, contrato ni reserva se toca."""
    e = {**cuerpo.model_dump(exclude={"zonas"}), "zonas": _zonas(cuerpo)}
    hecho = servicio.guardar_borrador(db, e, actor_de(request, rol))
    _bitacora(db, request, rol, hecho.accion, "distribucion", hecho.cara.codigo, hecho.detalle)
    db.commit()
    return _respuesta_de_distribucion(db, hecho)


@router.post("/distribucion/confirmar")
def confirmar_distribucion(
    cuerpo: DistribucionIn,
    request: Request,
    rol: str = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """11 · Validar estricto y confirmar. Con errores, las zonas quedan como
    borrador (commit) y la respuesta es 409 ``distribucion_invalida``."""
    e = {**cuerpo.model_dump(exclude={"zonas"}), "zonas": _zonas(cuerpo)}
    hecho = servicio.confirmar_distribucion(db, e, actor_de(request, rol))
    _bitacora(db, request, rol, hecho.accion, "distribucion", hecho.cara.codigo, hecho.detalle)
    db.commit()
    if hecho.invalida:
        n = len(hecho.juicio["errores"])
        return JSONResponse(status_code=409, content=jsonable_encoder({"detail": {
            "code": "distribucion_invalida",
            "message": f"La distribución tiene {n} problema{'' if n == 1 else 's'}: se guardó como borrador.",
            "errores": hecho.juicio["errores"], "avisos": hecho.juicio["avisos"],
            "version": hecho.distribucion.version,
        }}))
    return _respuesta_de_distribucion(db, hecho)


@router.post("/distribucion/descartar")
def descartar_borrador(
    cuerpo: DescartarIn,
    request: Request,
    rol: str = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """12 · Borrar el borrador (la confirmada queda)."""
    hecho = servicio.descartar_borrador(db, cuerpo.model_dump(), actor_de(request, rol))
    _bitacora(db, request, rol, hecho.accion, "distribucion", hecho.cara.codigo, hecho.detalle)
    db.commit()
    return _respuesta_de_distribucion(db, hecho)


# ─── 5–9 · Los términos ───────────────────────────────────────────────────────

@router.post("/", status_code=201)
def crear(
    cuerpo: AltaIn,
    background_tasks: BackgroundTasks,
    request: Request,
    rol: str = Depends(require_admin),
    cliente: Cliente = Depends(cliente_del_pedido),
    db: Session = Depends(get_db),
):
    """5 · Alta de una reserva provisional o de un contrato (participación
    nueva de la cara)."""
    hecho = servicio.alta(db, cuerpo.model_dump(), actor_de(request, rol))
    _bitacora(db, request, rol, hecho.accion, "participacion", hecho.entidad, hecho.detalle)
    db.commit()
    respuesta = _respuesta_de_termino(db, hecho)
    respuesta["avisos"] = _correos(db, background_tasks, hecho, cliente)
    respuesta["avisos_distribucion"] = []
    return respuesta


@router.patch("/{participacion_id}")
def editar(
    participacion_id: int,
    cuerpo: EditarIn,
    request: Request,
    rol: str = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """6 · Cambiar una reserva provisional viva."""
    hecho = servicio.editar(db, participacion_id, cuerpo.model_dump(), set(cuerpo.model_fields_set),
                            actor_de(request, rol))
    _bitacora(db, request, rol, hecho.accion, "participacion", hecho.entidad, hecho.detalle)
    db.commit()
    respuesta = _respuesta_de_termino(db, hecho)
    respuesta["avisos"] = None
    respuesta["avisos_distribucion"] = hecho.avisos_distribucion
    return respuesta


@router.post("/{participacion_id}/confirmar")
def confirmar(
    participacion_id: int,
    cuerpo: ConfirmarIn,
    background_tasks: BackgroundTasks,
    request: Request,
    rol: str = Depends(require_admin),
    cliente: Cliente = Depends(cliente_del_pedido),
    db: Session = Depends(get_db),
):
    """7 · Reserva viva → contrato, con el mismo alta de contrato."""
    hecho = servicio.confirmar_reserva(db, participacion_id, cuerpo.model_dump(), set(cuerpo.model_fields_set),
                                       actor_de(request, rol))
    _bitacora(db, request, rol, hecho.accion, "participacion", hecho.entidad, hecho.detalle)
    db.commit()
    respuesta = _respuesta_de_termino(db, hecho)
    respuesta["avisos"] = _correos(db, background_tasks, hecho, cliente)
    respuesta["avisos_distribucion"] = hecho.avisos_distribucion
    return respuesta


@router.post("/{participacion_id}/cancelar")
def cancelar(
    participacion_id: int,
    cuerpo: CancelarIn,
    request: Request,
    rol: str = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """8 · Cancelar una reserva provisional."""
    hecho = servicio.cancelar_reserva(db, participacion_id, cuerpo.model_dump(), actor_de(request, rol))
    _bitacora(db, request, rol, hecho.accion, "participacion", hecho.entidad, hecho.detalle)
    db.commit()
    return _respuesta_de_termino(db, hecho)


@router.post("/{participacion_id}/renovar", status_code=201)
def renovar(
    participacion_id: int,
    cuerpo: RenovarIn,
    background_tasks: BackgroundTasks,
    request: Request,
    rol: str = Depends(require_admin),
    cliente: Cliente = Depends(cliente_del_pedido),
    db: Session = Depends(get_db),
):
    """9 · Un término nuevo de la misma participación."""
    hecho = servicio.renovar(db, participacion_id, cuerpo.model_dump(), actor_de(request, rol))
    _bitacora(db, request, rol, hecho.accion, "participacion", hecho.entidad, hecho.detalle)
    db.commit()
    respuesta = _respuesta_de_termino(db, hecho)
    respuesta["avisos"] = _correos(db, background_tasks, hecho, cliente)
    respuesta["avisos_distribucion"] = hecho.avisos_distribucion
    return respuesta
