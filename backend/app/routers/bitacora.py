"""Leer la bitácora. Sólo el administrador, y sólo de a poco.

La escritura vive en `services/bitacora.py`; acá está la puerta para mirarla.
"""
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import require_admin
from app.database import get_db
from app.models.models import AuditEntry
from app.services.bitacora import ACCIONES, RETIRADAS

router = APIRouter(prefix="/bitacora", tags=["bitacora"], dependencies=[Depends(require_admin)])

TOPE = 500


class LineaBitacora(BaseModel):
    id: int
    at: datetime
    rol: str
    ip: str
    accion: str
    # El código en español, armado al leer y no al escribir: cambiar la
    # redacción no puede reescribir lo que ya pasó.
    titulo: str
    entidad: Optional[str] = None
    entidad_id: Optional[str] = None
    detalle: Optional[str] = None


def _utc(t: datetime) -> datetime:
    """La hora sale SIEMPRE con huso.

    SQLite guarda la fecha sin él, así que salía como `2026-08-30T00:41:53` a
    secas — y el navegador lee eso como hora LOCAL, no como UTC. En Colombia
    eso son cinco horas de diferencia: la bitácora mostraba "recién" para algo
    de esta madrugada y la fecha exacta quedaba corrida. Se marca acá, que es
    donde se sabe que lo guardado es UTC.
    """
    return t if t.tzinfo is not None else t.replace(tzinfo=timezone.utc)


@router.get("/", response_model=list[LineaBitacora])
def listar(
    limite: int = Query(default=100, ge=1, le=TOPE),
    accion: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
):
    q = db.query(AuditEntry)
    if accion:
        q = q.filter(AuditEntry.accion == accion)
    filas = q.order_by(AuditEntry.at.desc(), AuditEntry.id.desc()).limit(limite).all()
    return [
        LineaBitacora(
            id=f.id, at=_utc(f.at), rol=f.rol, ip=f.ip, accion=f.accion,
            titulo=ACCIONES.get(f.accion, f.accion),
            entidad=f.entidad, entidad_id=f.entidad_id, detalle=f.detalle,
        )
        for f in filas
    ]


@router.get("/acciones", response_model=dict[str, str])
def acciones():
    """El diccionario de códigos, para que el filtro de la pantalla no lo repita.
    Sin las retiradas: filtrar por algo que ya no puede pasar no sirve."""
    return {codigo: titulo for codigo, titulo in ACCIONES.items() if codigo not in RETIRADAS}
