"""``POST /api/contratos/vender``: guardar un contrato de Vender de una vez,
todo o nada (``docs/rediseno/vender-api.md`` §1, ``services/vender.py``).

Sólo administración. ``?validar=1`` revisa todo y no escribe nada: es la vista
previa antes de habilitar «Guardar». Sin ``validar``: un solo commit; cualquier
error hace rollback y no queda nada escrito —ni contratos, ni términos, ni
bitácora—. Los correos salen DESPUÉS del commit, en un solo envío con todas
las filas (``bulk_leases._avisar``); el de montaje queda pendiente hasta que
cada contrato tenga su planometría (y un porcentaje, su zona confirmada):
``services/montajes_pendientes.py``.
"""
from datetime import date
from typing import Literal, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, Request
from pydantic import BaseModel, ConfigDict, Field, StrictInt
from sqlalchemy.orm import Session

from app.auth import require_admin
from app.clientes import Cliente, cliente_del_pedido
from app.database import get_db
from app.routers.bulk_leases import _avisar
from app.routers.participaciones import fila_de_participacion
from app.services import vender as servicio
from app.services.bitacora import anotar
from app.services import editar_contrato
from app.services.aviso_de_edicion import avisar_edicion
from app.services.ciclo_participaciones import actor_de

router = APIRouter(prefix="/contratos", tags=["vender"])


class _Estricto(BaseModel):
    #: Campos de más → 422: un cliente que manda algo que el servidor no lee no
    #: puede creer que se guardó.
    model_config = ConfigDict(extra="forbid")


class CobroIn(_Estricto):
    modo: Literal["fijo", "ventas"] = "fijo"
    porcentaje: Optional[float] = Field(default=None, allow_inf_nan=False)
    corte: Optional[Literal["mensual", "al_final"]] = None


class ParticipacionIn(_Estricto):
    #: La cara («GON-02», «GON-02-B» o con la sede): el número PC lo pone el servidor.
    cara: str = Field(min_length=1, max_length=200)
    puntos_basicos: StrictInt = Field(ge=1, le=10000)
    #: El término que se renueva (Renovar desde Supervisar).
    renueva: Optional[StrictInt] = None


class LineaIn(_Estricto):
    espacio: Optional[str] = Field(default=None, max_length=200)
    participacion: Optional[ParticipacionIn] = None
    #: SIEMPRE el total de la línea por todo el plazo.
    valor: Optional[float] = Field(default=None, allow_inf_nan=False)
    modo_precio: Optional[Literal["mensual", "total"]] = None
    valor_tecleado: Optional[float] = Field(default=None, allow_inf_nan=False)


class EsperadoIn(_Estricto):
    """Lo que Supervisar mostró del contrato que se edita: si el contrato ya no
    dice esto, 409 ``contrato_cambio`` (``services/editar_contrato.py``)."""
    valor: float = Field(allow_inf_nan=False)
    desde: date
    hasta: date


class EditaIn(_Estricto):
    """«Editar contrato» (§9 de ``docs/rediseno/vender-api.md``): EL contrato
    del renglón (``leaseId`` de ``GET /spaces/comercial``) y lo que se mostró."""
    lease_id: StrictInt
    esperado: EsperadoIn


class VenderIn(_Estricto):
    sede: str = Field(min_length=1, max_length=120)
    proveedor: str = Field(min_length=1, max_length=200)
    correo: Optional[str] = Field(default=None, max_length=254)
    marca: Optional[str] = Field(default=None, max_length=200)
    nota: Optional[str] = Field(default=None, max_length=2000)
    desde: date
    hasta: date
    tipo: Literal["contrato", "reserva"]
    caduca: Optional[date] = None
    cobro: CobroIn = Field(default_factory=CobroIn)
    lineas: list[LineaIn] = Field(default_factory=list)
    #: Sólo «Editar contrato»: el pedido corrige (o reemplaza) ESE contrato.
    edita: Optional[EditaIn] = None


@router.get("/{lease_id}/edicion")
def para_editar(lease_id: int, rol: str = Depends(require_admin), db: Session = Depends(get_db)):
    """El contrato como lo carga Vender para editarlo («Editar contrato» de
    Supervisar). Sin la nota interna. Sólo administración (lleva plata)."""
    return editar_contrato.para_editar(db, lease_id)


@router.post("/vender")
def vender(
    cuerpo: VenderIn,
    request: Request,
    background_tasks: BackgroundTasks,
    validar: bool = False,
    rol: str = Depends(require_admin),
    cliente: Cliente = Depends(cliente_del_pedido),
    db: Session = Depends(get_db),
):
    pedido = cuerpo.model_dump()
    if cuerpo.edita is not None:
        return _editar(pedido, request, background_tasks, validar, rol, cliente, db)
    pedido.pop("edita", None)
    if validar:
        try:
            servicio.guardar(db, pedido, actor_de(request, rol), validar=True)
        finally:
            db.rollback()
        return {"ok": True, "filas": []}
    try:
        hecho = servicio.guardar(db, pedido, actor_de(request, rol))
        for accion, entidad, entidad_id, detalle in hecho.bitacora:
            anotar(db, request, rol, accion, entidad=entidad, entidad_id=entidad_id, detalle=detalle)
        db.commit()
    except Exception:
        # Todo o nada: ni una línea, ni un término, ni una fila de bitácora.
        db.rollback()
        raise

    filas = list(hecho.filas) + [fila_de_participacion(*x) for x in hecho.de_participacion]
    avisos = None
    if filas:
        avisos = _avisar(db, background_tasks, cuerpo.sede, filas, cliente).model_dump()
    return {
        "contratos": hecho.contratos,
        "participaciones": hecho.participaciones,
        "reservas": hecho.reservas,
        "avisos": avisos,
    }


def _editar(pedido: dict, request: Request, background_tasks: BackgroundTasks, validar: bool, rol: str,
            cliente: Cliente, db: Session) -> dict:
    """«Editar contrato»: el mismo pedido, con ``edita``. Todo o nada; los
    correos «Contrato modificado» salen después del commit, a todos
    (``services/aviso_de_edicion.py``)."""
    actor = actor_de(request, rol)
    if validar:
        try:
            editar_contrato.editar(db, pedido, actor, validar=True)
        finally:
            db.rollback()
        return {"ok": True, "filas": []}
    try:
        hecho = editar_contrato.editar(db, pedido, actor)
        for accion, entidad, entidad_id, detalle in hecho.bitacora:
            anotar(db, request, rol, accion, entidad=entidad, entidad_id=entidad_id, detalle=detalle)
        db.commit()
    except Exception:
        db.rollback()
        raise
    avisos = avisar_edicion(db, background_tasks, cliente, hecho, actor).model_dump()
    return {
        "contratos": hecho.contratos,
        "participaciones": hecho.participaciones,
        "reservas": [],
        "avisos": avisos,
        "edicion": {"modo": hecho.modo, "lease_id": hecho.lease_id, "reemplazado_por": hecho.reemplazado_por},
    }
