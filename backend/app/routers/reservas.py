"""Las reservas de una cara entera o de una parte (``docs/rediseno/vender-api.md``
§8, ``services/reservas.py``). Se crean desde Vender (``POST
/api/contratos/vender`` con ``tipo: "reserva"``); acá se listan, se confirman y
se cancelan.

Todo de administración: llevan proveedor y precio acordado. El GET recibe la
sede por query (el barrido del token de montaje lo cubre sin relleno nuevo) y
las rutas literales van antes que las paramétricas.
"""
from typing import Literal, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.auth import require_admin
from app.clientes import Cliente, cliente_del_pedido
from app.database import get_db
from app.routers.bulk_leases import _avisar
from app.services import reservas as servicio
from app.services.bitacora import anotar
from app.services.ciclo_participaciones import actor_de

router = APIRouter(prefix="/reservas", tags=["reservas"])


class CobroIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    modo: Literal["fijo", "ventas"]
    porcentaje: Optional[float] = Field(default=None, allow_inf_nan=False)
    corte: Optional[Literal["mensual", "al_final"]] = None


class ConfirmarIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    #: Otro valor que el acordado al reservar (el total por todo el plazo).
    valor: Optional[float] = Field(default=None, allow_inf_nan=False)
    modo_precio: Optional[Literal["mensual", "total"]] = None
    valor_tecleado: Optional[float] = Field(default=None, allow_inf_nan=False)
    correo: Optional[str] = Field(default=None, max_length=254)
    notas: Optional[str] = Field(default=None, max_length=2000)
    #: Otro cobro que el acordado al reservar (fijo o por un % de las ventas).
    cobro: Optional[CobroIn] = None


@router.get("")
def leer_reservas(sede: Optional[str] = None, rol: str = Depends(require_admin), db: Session = Depends(get_db)):
    """Las reservas vivas, de la que caduca primero a la última."""
    return servicio.listar(db, sede)


@router.post("/{reserva_id}/confirmar")
def confirmar(
    reserva_id: int,
    cuerpo: ConfirmarIn,
    request: Request,
    background_tasks: BackgroundTasks,
    rol: str = Depends(require_admin),
    cliente: Cliente = Depends(cliente_del_pedido),
    db: Session = Depends(get_db),
):
    """La reserva → contrato, con los avisos de un contrato nuevo."""
    try:
        reserva, fila = servicio.confirmar(db, reserva_id, cuerpo.model_dump(), actor_de(request, rol))
        anotar(db, request, rol, "reserva_espacio.confirmada", entidad="reserva", entidad_id=reserva.id,
               detalle=f"{fila.codigo} · {fila.proveedor} · contrato {fila.lease_id}")
        anotar(db, request, rol, "contrato.alta", entidad="contrato", entidad_id=fila.lease_id,
               detalle=f"{fila.codigo} · {fila.proveedor} · {fila.desde}→{fila.hasta}")
        db.commit()
    except Exception:
        db.rollback()
        raise
    avisos = _avisar(db, background_tasks, fila.sede, [fila], cliente).model_dump()
    return {"reserva_id": reserva_id, "lease_id": fila.lease_id, "espacio": fila.codigo, "avisos": avisos}


@router.delete("/{reserva_id}", status_code=204)
def cancelar(reserva_id: int, request: Request, rol: str = Depends(require_admin), db: Session = Depends(get_db)):
    """Cancela una reserva viva (queda en el registro con ``baja_en``)."""
    reserva = servicio.cancelar(db, reserva_id, actor_de(request, rol))
    anotar(db, request, rol, "reserva_espacio.baja", entidad="reserva", entidad_id=reserva.id,
           detalle=f"{reserva.space.code} · {reserva.supplier.name if reserva.supplier else '—'}")
    db.commit()
