from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session, defer

from app.auth import require_admin, require_auth, require_auth_or_query_token
from app.database import get_db
from app.models.models import Space, SpaceFile
from app.services.bitacora import anotar

router = APIRouter(tags=["files"])

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB
ALLOWED_EXTENSIONS = {".pdf", ".xls", ".xlsx", ".csv", ".jpg", ".jpeg", ".png", ".webp"}
MEDIA_TYPES = {
    ".pdf": "application/pdf",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".csv": "text/csv",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
}


# ─── Schemas ──────────────────────────────────────────────────────────────────

class SpaceFileOut(BaseModel):
    id: int
    filename: str
    content_type: str
    size: int
    uploaded_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ─── Quién puede ver qué ──────────────────────────────────────────────────────
#
# Los adjuntos de un espacio son dos cosas muy distintas metidas en la misma
# tabla: FOTOS —la cara del mueble que pinta el plano, la prueba del montaje— y
# DOCUMENTOS —el contrato en PDF, la planilla del acuerdo—.
#
# El rol `worker` es de sólo lectura y, por diseño, NUNCA VE PLATA. Pero podía
# listar y descargar los contratos: `require_auth` comprobaba que hubiera
# credencial y nadie comprobaba que ese archivo fuera para esos ojos. Con la
# clave de trabajador —que conoce todo el personal— alcanzaba con numerar
# /api/files/1, /api/files/2 para bajarse la cartera entera.
#
# Se parte por tipo de contenido y no por rol a secas porque el trabajador SÍ
# necesita las fotos: son las que el mapa de la sede le muestra.
#
# Cuando exista `tenant_id`, la comprobación de pertenencia va acá también: es
# el único lugar por el que pasan las descargas.

IMAGENES = {"image/jpeg", "image/png", "image/webp"}


def _es_documento(content_type: str | None) -> bool:
    return (content_type or "") not in IMAGENES


def _puede_ver(rol: str, content_type: str | None) -> bool:
    return rol == "admin" or not _es_documento(content_type)


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.post(
    "/spaces/{space_id}/files",
    response_model=SpaceFileOut,
    status_code=201,
)
async def upload_space_file(
    space_id: int,
    request: Request,
    file: UploadFile = File(...),
    rol: str = Depends(require_admin),
    db: Session = Depends(get_db),
):
    space = db.query(Space).filter(Space.id == space_id).first()
    if not space:
        raise HTTPException(status_code=404, detail="Espacio no encontrado")

    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=422,
            detail="Extensión no permitida. Solo se aceptan archivos PDF, XLS, XLSX, CSV o imágenes JPG, PNG y WEBP.",
        )

    data = await file.read()
    if len(data) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="El archivo supera el límite de 10 MB")

    # Derive the content type from the validated extension — never trust the
    # client-supplied header (it is echoed back verbatim on download).
    content_type = MEDIA_TYPES[ext]

    row = SpaceFile(
        space_id=space_id,
        filename=file.filename or f"archivo{ext}",
        content_type=content_type,
        size=len(data),
        data=data,
    )
    db.add(row)
    db.flush()
    anotar(
        db, request, rol, "archivo.alta",
        entidad="archivo", entidad_id=row.id,
        detalle=f"{space.code} · {row.filename}",
    )
    db.commit()
    db.refresh(row)
    return row


@router.get("/spaces/{space_id}/files", response_model=list[SpaceFileOut])
def list_space_files(
    space_id: int,
    db: Session = Depends(get_db),
    rol: str = Depends(require_auth),
):
    space = db.query(Space).filter(Space.id == space_id).first()
    if not space:
        raise HTTPException(status_code=404, detail="Espacio no encontrado")
    # defer(data): metadata listing must not pull every blob into memory
    filas = (
        db.query(SpaceFile)
        .options(defer(SpaceFile.data))
        .filter(SpaceFile.space_id == space_id)
        .order_by(SpaceFile.uploaded_at.desc())
        .all()
    )
    # Se filtra en vez de rechazar: el panel del trabajador sigue funcionando y
    # los contratos simplemente no existen para él.
    return [f for f in filas if _puede_ver(rol, f.content_type)]


@router.get("/files/{file_id}")
def download_file(
    file_id: int,
    request: Request,
    db: Session = Depends(get_db),
    rol: str = Depends(require_auth_or_query_token),
):
    """Serve the binary inline. Auth via Bearer header OR ?token= (for iframes)."""
    row = db.query(SpaceFile).filter(SpaceFile.id == file_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Archivo no encontrado")
    # 404 y no 403 a propósito: un 403 confirma que ese archivo existe, y
    # numerando se puede levantar el inventario de contratos sin bajar ninguno.
    if not _puede_ver(rol, row.content_type):
        raise HTTPException(status_code=404, detail="Archivo no encontrado")

    # Se anota la bajada del DOCUMENTO, no la de las imágenes: la foto del
    # montaje y las artes se abren decenas de veces por día y ahogarían la
    # bitácora. Lo que hay que poder contestar es quién se llevó un contrato.
    if _es_documento(row.content_type):
        anotar(
            db, request, rol, "archivo.descarga",
            entidad="archivo", entidad_id=row.id, detalle=row.filename,
        )
        db.commit()

    # Content-Disposition is latin-1 only; degrade non-encodable characters
    safe_name = (row.filename or "archivo").replace('"', "'")
    try:
        safe_name.encode("latin-1")
    except UnicodeEncodeError:
        safe_name = safe_name.encode("latin-1", "replace").decode("latin-1")

    return Response(
        content=row.data,
        media_type=row.content_type,
        headers={"Content-Disposition": f'inline; filename="{safe_name}"'},
    )


@router.delete("/files/{file_id}", status_code=204)
def delete_file(
    file_id: int,
    request: Request,
    rol: str = Depends(require_admin),
    db: Session = Depends(get_db),
):
    row = db.query(SpaceFile).options(defer(SpaceFile.data)).filter(SpaceFile.id == file_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Archivo no encontrado")
    anotar(
        db, request, rol, "archivo.baja",
        entidad="archivo", entidad_id=row.id, detalle=row.filename,
    )
    db.delete(row)
    db.commit()
