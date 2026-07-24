from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session, defer

from app.auth import require_admin, require_auth, require_auth_or_query_token
from app.database import get_db
from app.models.models import Space, SpaceFile

router = APIRouter(tags=["files"])

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB
ALLOWED_EXTENSIONS = {".pdf", ".xls", ".xlsx", ".csv"}
MEDIA_TYPES = {
    ".pdf": "application/pdf",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".csv": "text/csv",
}


# ─── Schemas ──────────────────────────────────────────────────────────────────

class SpaceFileOut(BaseModel):
    id: int
    filename: str
    content_type: str
    size: int
    uploaded_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.post(
    "/spaces/{space_id}/files",
    response_model=SpaceFileOut,
    status_code=201,
    dependencies=[Depends(require_admin)],
)
async def upload_space_file(
    space_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    space = db.query(Space).filter(Space.id == space_id).first()
    if not space:
        raise HTTPException(status_code=404, detail="Espacio no encontrado")

    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=422,
            detail="Extensión no permitida. Solo se aceptan archivos PDF, XLS, XLSX o CSV.",
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
    db.commit()
    db.refresh(row)
    return row


@router.get(
    "/spaces/{space_id}/files",
    response_model=list[SpaceFileOut],
    dependencies=[Depends(require_auth)],
)
def list_space_files(space_id: int, db: Session = Depends(get_db)):
    space = db.query(Space).filter(Space.id == space_id).first()
    if not space:
        raise HTTPException(status_code=404, detail="Espacio no encontrado")
    # defer(data): metadata listing must not pull every blob into memory
    return (
        db.query(SpaceFile)
        .options(defer(SpaceFile.data))
        .filter(SpaceFile.space_id == space_id)
        .order_by(SpaceFile.uploaded_at.desc())
        .all()
    )


@router.get("/files/{file_id}", dependencies=[Depends(require_auth_or_query_token)])
def download_file(file_id: int, db: Session = Depends(get_db)):
    """Serve the binary inline. Auth via Bearer header OR ?token= (for iframes)."""
    row = db.query(SpaceFile).filter(SpaceFile.id == file_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Archivo no encontrado")

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


@router.delete("/files/{file_id}", status_code=204, dependencies=[Depends(require_admin)])
def delete_file(file_id: int, db: Session = Depends(get_db)):
    row = db.query(SpaceFile).options(defer(SpaceFile.data)).filter(SpaceFile.id == file_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Archivo no encontrado")
    db.delete(row)
    db.commit()
