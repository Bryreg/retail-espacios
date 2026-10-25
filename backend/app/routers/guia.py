"""La guía de montaje: la hoja de una versión y su foto (fase 3, 2026-10-24).

Rutas ``/api/guia/…``. Las abre una sesión (admin o worker) **o** el enlace
firmado de UNA versión (``auth.require_guia``): ese enlace no abre nada más,
y cada ruta compara la versión pedida con la del enlace. Sin precios ni
nombres de proveedores (``services/guia.py``). Los GET por query.
"""
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, Response, UploadFile
from sqlalchemy.orm import Session

from app.auth import QuienGuia, require_guia
from app.database import get_db
from app.models.planogramas import FotoDeGuia
from app.routers.mounts import MAX_PHOTO, PHOTO_TYPES
from app.services import guia as servicio
from app.services.bitacora import anotar
from app.services.subidas import leer_con_tope

router = APIRouter(prefix="/guia", tags=["guia"])


def _version_pedida(db: Session, quien: QuienGuia, version: int | None) -> int:
    """El enlace manda: sólo su versión. Una sesión pide la que quiera, con la
    misma guarda que leer el planograma (la cara de un mueble que se vende,
    sólo administración)."""
    if quien.es_enlace:
        if version is not None and version != quien.version:
            raise HTTPException(status_code=403, detail="Este enlace es de otra versión.")
        return quien.version
    if version is None:
        raise HTTPException(status_code=422, detail="Falta la versión.")
    servicio.puede_leer(db, quien.role, version)
    return version


@router.get("")
def leer_guia(
    version: int | None = Query(default=None, ge=1),
    quien: QuienGuia = Depends(require_guia),
    db: Session = Depends(get_db),
):
    """La hoja de una versión: la cara, los destinos, lo que cambia, lo ya
    asignado (sin nombres) y las fotos que se subieron."""
    return servicio.guia(db, _version_pedida(db, quien, version))


@router.post("/foto", status_code=201)
async def subir_foto(
    request: Request,
    version: int | None = Form(default=None),
    foto: UploadFile = File(...),
    quien: QuienGuia = Depends(require_guia),
    db: Session = Depends(get_db),
):
    """La foto de cómo quedó (no es obligatoria). Sólo imágenes de la lista
    cerrada de las fotos de montaje, hasta 10 MB."""
    vid = _version_pedida(db, quien, version)
    servicio.version_o_404(db, vid)
    ext = Path(foto.filename or "").suffix.lower()
    declarado = (foto.content_type or "").lower().split(";")[0].strip()
    if ext in PHOTO_TYPES:
        tipo = PHOTO_TYPES[ext]
    elif declarado in set(PHOTO_TYPES.values()):
        tipo = declarado
    else:
        raise HTTPException(status_code=422, detail="El archivo tiene que ser una imagen (JPG, PNG, WEBP o HEIC)")
    data = await leer_con_tope(foto, MAX_PHOTO, "La foto supera el límite de 10 MB")
    correo = getattr(getattr(request, "state", None), "actor_email", None)
    db.add(FotoDeGuia(version_id=vid, filename=(foto.filename or "foto")[:200], content_type=tipo, size=len(data),
                      data=data, subida_por="enlace" if quien.es_enlace else (correo or quien.role)))
    nombre, _sede, v, _pl = servicio.titulo(db, vid)
    anotar(db, request, quien.role, "guia.foto", entidad="planograma", entidad_id=nombre,
           detalle=f"Foto de cómo quedó la versión {v.numero}")
    db.commit()
    return {"fotos": servicio.fotos_de(db, vid)}


@router.get("/foto")
def ver_foto(
    id: int = Query(..., ge=1),
    quien: QuienGuia = Depends(require_guia),
    db: Session = Depends(get_db),
):
    """Una foto de la guía, en línea (va en un ``<img>``)."""
    f = db.get(FotoDeGuia, id)
    if f is None or (quien.es_enlace and f.version_id != quien.version):
        raise HTTPException(status_code=404, detail="Esa foto no existe.")
    if not quien.es_enlace:
        servicio.puede_leer(db, quien.role, f.version_id)
    return Response(content=f.data, media_type=f.content_type,
                    headers={"Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff"})
