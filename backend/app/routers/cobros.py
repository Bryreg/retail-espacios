"""Los contratos que se cobran por un % de las ventas: sus cortes
(``docs/rediseno/vender-api.md`` §3, ``services/cobros.py``).

Todo de administración (``require_admin``): es plata. Las rutas literales van
antes que las paramétricas (``/pendientes`` antes de ``/{lease_id}/…``), y los
GET reciben sus datos por query, como en participaciones: el barrido del token
de montaje (``tests/test_montaje_enlace.py``) los cubre sin relleno nuevo.
"""
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.auth import require_admin
from app.database import get_db
from app.services import cobros as servicio
from app.services.bitacora import anotar
from app.services.ciclo_participaciones import actor_de
from app.services.mailer import format_cop
from app.schemas.pesos import Pesos

router = APIRouter(prefix="/cobros", tags=["cobros por ventas"])


class CorteIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    periodo_desde: date
    periodo_hasta: date
    #: Lo vendido, en pesos enteros (P2-11).
    ventas: Pesos = Field(ge=0, allow_inf_nan=False)


@router.get("/pendientes")
def leer_pendientes(sede: Optional[str] = None, rol: str = Depends(require_admin), db: Session = Depends(get_db)):
    """Los cortes vencidos sin cargar."""
    return servicio.pendientes(db, sede)


@router.get("")
def leer_cobros(sede: Optional[str] = None, rol: str = Depends(require_admin), db: Session = Depends(get_db)):
    """Por contrato: porcentaje, corte, los cortes cargados y el próximo."""
    return servicio.resumen(db, sede)


@router.post("/{lease_id}/cortes", status_code=201)
def cargar_corte(
    lease_id: int,
    cuerpo: CorteIn,
    request: Request,
    rol: str = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Carga lo vendido en un período y devuelve lo que se cobra."""
    corte = servicio.cargar_corte(db, lease_id, cuerpo.periodo_desde, cuerpo.periodo_hasta, cuerpo.ventas,
                                  actor_de(request, rol))
    anotar(db, request, rol, "cobro.corte", entidad="contrato", entidad_id=lease_id,
           detalle=f"{corte.periodo_desde}→{corte.periodo_hasta} · {format_cop(corte.monto)}")
    db.commit()
    return {"monto": corte.monto}
