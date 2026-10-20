"""``POST /api/contratos/vender``: guardar un contrato de Vender de una vez,
todo o nada (``docs/rediseno/vender-api.md`` §1, ``services/vender.py``).

Sólo administración. ``?validar=1`` revisa todo y no escribe nada: es la vista
previa antes de habilitar «Guardar». Sin ``validar``: un solo commit; cualquier
error hace rollback y no queda nada escrito —ni contratos, ni términos, ni
bitácora—. Los correos salen DESPUÉS del commit, en un solo envío con todas
las filas (``bulk_leases._avisar``); el de montaje de un porcentaje sin zona
confirmada queda pendiente (``montajes_pendientes``).
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
        avisos = _avisar(db, background_tasks, cuerpo.sede, filas, cliente,
                         sin_montaje=hecho.sin_montaje).model_dump()
    return {
        "contratos": hecho.contratos,
        "participaciones": hecho.participaciones,
        "reservas": hecho.reservas,
        "avisos": avisos,
    }
