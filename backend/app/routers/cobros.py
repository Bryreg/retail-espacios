"""Los contratos que se cobran por un % de las ventas: sus cortes
(``docs/rediseno/vender-api.md`` §3, ``services/cobros.py``).

Todo de administración (``require_admin``): es plata. Las rutas literales van
antes que las paramétricas (``/pendientes`` antes de ``/{lease_id}/…``), y los
GET reciben sus datos por query, como en participaciones: el barrido del token
de montaje (``tests/test_montaje_enlace.py``) los cubre sin relleno nuevo.
"""
from datetime import date
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth import require_admin
from app.database import get_db
from app.services import cobros as servicio
from app.services.bitacora import anotar
from app.services.ciclo_participaciones import actor_de
from app.services.condiciones import porcentaje_texto
from app.services.mailer import format_cop

router = APIRouter(prefix="/cobros", tags=["cobros por ventas"])


class CorteIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    periodo_desde: date
    periodo_hasta: date
    ventas: float = Field(ge=0, allow_inf_nan=False)


class EsperadoIn(BaseModel):
    """Lo que el renglón de «Bajo tarifa» mostró del contrato: si el contrato
    ya no dice esto, 409 ``contrato_cambio`` (``servicio.pasar_a_ventas``)."""
    model_config = ConfigDict(extra="forbid")

    valor: float = Field(allow_inf_nan=False)
    desde: date
    hasta: date


class PasarAVentasIn(BaseModel):
    """El % y el corte, como el ``cobro`` de Vender (§1), y lo que el renglón
    mostró (``esperado``, obligatorio): campos de más → 422."""
    model_config = ConfigDict(extra="forbid")

    porcentaje: float = Field(allow_inf_nan=False)
    corte: Literal["mensual", "al_final"]
    esperado: EsperadoIn


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


@router.post("/{lease_id}/pasar-a-ventas")
def pasar_a_ventas(
    lease_id: int,
    cuerpo: PasarAVentasIn,
    request: Request,
    rol: str = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Un contrato de valor fijo pasa a cobrarse por un % de las ventas
    (Supervisar → «Para revisar» → Corregir → «Bajo tarifa de referencia»).
    Todo o nada: el valor en 0, su `cobros_por_venta`, la constancia en la nota
    y la bitácora caen en el mismo commit. El contrato es el del renglón
    (``lease_id``) y tiene que seguir diciendo lo que el renglón mostró
    (``esperado``): si no, 409 ``contrato_cambio``."""
    try:
        lease, cobro, anterior = servicio.pasar_a_ventas(db, lease_id, cuerpo.porcentaje, cuerpo.corte,
                                                         cuerpo.esperado.model_dump(), actor_de(request, rol))
        espacio = lease.space.code if lease.space else None
        anotar(db, request, rol, "cobro.a_ventas", entidad="contrato", entidad_id=lease_id,
               detalle=f"{espacio or lease_id} · {porcentaje_texto(cobro.porcentaje)} · "
                       f"antes {servicio.pesos_exactos(anterior)}")
        db.commit()
    except IntegrityError:
        # Dos pedidos a la vez: el otro ya escribió su `cobros_por_venta` (la
        # clave es el contrato). No se escribió nada de éste.
        db.rollback()
        raise HTTPException(status_code=409, detail={
            "code": "ya_por_ventas", "message": "Ese contrato ya se cobra por un % de las ventas."})
    return {
        "lease_id": lease.id, "espacio": espacio, "sede": lease.space.sede if lease.space else None,
        "proveedor": lease.supplier.name if lease.supplier else None, "marca": lease.marca,
        "desde": lease.start_date, "hasta": lease.end_date,
        "monthly_rent": lease.monthly_rent, "notes": lease.notes,
        "porcentaje": cobro.porcentaje, "corte": cobro.corte, "valor_anterior": anterior,
    }
