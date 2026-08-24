"""Confirmación de montaje: la prueba de que lo que se cobró se armó.

Es el único punto de la aplicación donde un worker escribe algo, y está
deliberadamente acotado: puede reportar el montaje de un espacio y adjuntar una
foto, nada más. No toca el layout, no toca contratos y no ve valores.
"""
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session, defer

from app.auth import require_auth
from app.database import get_db
from app.models.models import MountConfirmation, Space, SpaceFile

router = APIRouter(prefix="/mounts", tags=["mounts"], dependencies=[Depends(require_auth)])

MAX_PHOTO = 10 * 1024 * 1024
PHOTO_TYPES = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}

ESTADOS = ("montado", "no_montado")
MOTIVOS = ("sin_material", "sin_producto", "espacio_ocupado", "otro")


class MountOut(BaseModel):
    id: int
    space_code: str
    sede: Optional[str] = None
    estado: str
    motivo: Optional[str] = None
    nota: Optional[str] = None
    file_id: Optional[int] = None
    reportado_por: Optional[str] = None
    rol: Optional[str] = None
    confirmado_en: Optional[datetime] = None

    model_config = {"from_attributes": True}


@router.get("/", response_model=list[MountOut])
def list_mounts(sede: Optional[str] = None, db: Session = Depends(get_db)):
    """Confirmaciones, la más reciente primero.

    Sin paginar a propósito: son tres tiendas y un puñado de espacios, y el
    cliente necesita el historial completo para saber cuál fue el último
    reporte de cada uno.
    """
    # Lo archivado no sale: pertenece a una sede que ya se borró, y su código
    # puede estar en uso otra vez por una sede recreada con el mismo nombre.
    q = db.query(MountConfirmation).filter(MountConfirmation.archivado_en.is_(None))
    if sede:
        q = q.filter(MountConfirmation.sede == sede.strip().upper())
    return q.order_by(MountConfirmation.confirmado_en.desc(), MountConfirmation.id.desc()).all()


@router.post("/", response_model=MountOut, status_code=201)
async def confirm_mount(
    space_code: str = Form(...),
    estado: str = Form(...),
    sede: Optional[str] = Form(None),
    motivo: Optional[str] = Form(None),
    nota: Optional[str] = Form(None),
    reportado_por: Optional[str] = Form(None),
    foto: Optional[UploadFile] = File(None),
    role: str = Depends(require_auth),
    db: Session = Depends(get_db),
):
    """Reporta el montaje de un espacio. Abierto a worker: es su trabajo."""
    code = (space_code or "").strip().upper()
    if not code:
        raise HTTPException(status_code=422, detail="Falta el código del espacio")
    if estado not in ESTADOS:
        raise HTTPException(status_code=422, detail=f"estado debe ser uno de {ESTADOS}")
    if motivo and motivo not in MOTIVOS:
        raise HTTPException(status_code=422, detail=f"motivo debe ser uno de {MOTIVOS}")
    if estado == "no_montado" and not motivo:
        raise HTTPException(
            status_code=422,
            detail="Un espacio sin montar necesita motivo: sirve para saber a quién reclamarle",
        )

    file_id = None
    if foto is not None and foto.filename:
        ext = Path(foto.filename).suffix.lower()
        if ext not in PHOTO_TYPES:
            raise HTTPException(status_code=422, detail="La foto debe ser JPG, PNG o WEBP")
        data = await foto.read()
        if len(data) > MAX_PHOTO:
            raise HTTPException(status_code=413, detail="La foto supera el límite de 10 MB")

        # La foto se cuelga del Space para que aparezca junto al resto de los
        # archivos del espacio. Si el espacio todavía no existe como fila —
        # solo se crea al guardar un contrato — se crea acá, porque tener la
        # evidencia importa más que el orden en que se cargaron las cosas.
        space = db.query(Space).filter(Space.code == code).first()
        if not space:
            space = Space(
                code=code, svg_id=f"fix-{code}", name=code,
                zone="montaje", sede=(sede or "").strip().upper() or None, area_m2=0.0,
            )
            db.add(space)
            db.flush()
        row = SpaceFile(
            space_id=space.id,
            filename=foto.filename,
            content_type=PHOTO_TYPES[ext],
            size=len(data),
            data=data,
        )
        db.add(row)
        db.flush()
        file_id = row.id

    conf = MountConfirmation(
        space_code=code,
        sede=(sede or "").strip().upper() or None,
        estado=estado,
        motivo=motivo,
        nota=(nota or "").strip() or None,
        file_id=file_id,
        reportado_por=(reportado_por or "").strip() or None,
        rol=role,
        # Hora del servidor, no del dispositivo.
        confirmado_en=datetime.now(timezone.utc),
    )
    db.add(conf)
    db.commit()
    db.refresh(conf)
    return conf


@router.get("/files/{file_id}/exists", response_model=dict)
def photo_exists(file_id: int, db: Session = Depends(get_db)):
    """Chequeo barato para la interfaz — no descarga el binario."""
    found = (
        db.query(SpaceFile.id)
        .options(defer(SpaceFile.data))
        .filter(SpaceFile.id == file_id)
        .first()
    )
    return {"exists": bool(found)}
