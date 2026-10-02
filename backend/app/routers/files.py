from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, Response, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session, defer

from app.auth import require_admin, require_auth, require_auth_or_query_token
from app.database import get_db
from app.models.models import MountConfirmation, Space, SpaceFace, SpaceFile
from app.routers.mounts import MOUNT_FILE_PREFIX
from app.services.bitacora import anotar
from app.services.subidas import leer_con_tope

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
# Se partía por tipo de contenido y no por rol a secas porque el trabajador SÍ
# necesita las fotos: son las que el mapa de la sede le muestra. Pero partir
# por content-type sólo es correcto si "imagen" implica "cara del mueble", y no
# lo implica: un contrato ESCANEADO como JPG (H8, auditoría de vitrinas-3d) es
# una imagen para el navegador y un documento para todos los efectos que
# importan acá.
#
# UNA PRIMERA VERSIÓN de este fix filtraba por "la imagen más reciente del
# espacio" — el mismo error con otro nombre: si el contrato en JPG es la ÚNICA
# imagen del espacio, o se sube DESPUÉS de la cara real, ES "la más reciente"
# y el agujero de H8 seguía abierto (hallazgos X-18/X-18b del red-team). El
# corte correcto no es una heurística sobre CUÁNDO se subió: es una
# DESIGNACIÓN EXPLÍCITA de CUÁL imagen es la cara — ver `models.SpaceFace`. El
# admin la declara a propósito (`uso=cara` en el upload); nada se infiere.
#
# El worker ve sólo dos cosas: la cara DESIGNADA del espacio (tabla
# `SpaceFace`, la misma fuente que usa `list_face_images` en spaces.py) y sus
# propias fotos de montaje (filename con `MOUNT_FILE_PREFIX` — Y content-type
# de imagen: un PDF nombrado "montaje--contrato.pdf" no es una foto de
# montaje sólo porque el nombre empiece igual, hallazgo M-1 del red-team,
# X-19). Cualquier otra cosa —un documento de siempre, una imagen vieja que
# dejó de ser la cara, un contrato en JPG nunca designado, o un espacio que
# todavía no tiene ninguna cara designada (fail closed: sin fila en
# `SpaceFace`, NINGUNA imagen es la cara para el worker)— se trata como
# documento: no se lista, no se descarga y su bajada queda en bitácora.
#
# Cuando exista `tenant_id`, la comprobación de pertenencia va acá también: es
# el único lugar por el que pasan las descargas.

IMAGENES = {"image/jpeg", "image/png", "image/webp"}


def _es_imagen(content_type: str | None) -> bool:
    return (content_type or "") in IMAGENES


def _es_foto_montaje(filename: str | None, content_type: str | None) -> bool:
    """Una foto de montaje es del worker Y una imagen de verdad — el nombre
    solo no alcanza (M-1, X-19): ``montaje--contrato.pdf`` no cuela por tener
    el prefijo puesto, porque el content-type (derivado server-side de la
    extensión, nunca del que manda el cliente) lo delata como documento.

    Se compara contra ``image/*`` y NO contra el ``IMAGENES`` estricto de
    abajo: `routers/mounts.py::PHOTO_TYPES` acepta HEIC/HEIF además de
    JPG/PNG/WEBP (las cámaras de iPhone), y esos content-types nunca pasan por
    `ALLOWED_EXTENSIONS` de este archivo — exigir el conjunto estricto acá
    hubiera dejado a un mercaderista con iPhone sin ver su propia foto."""
    return (filename or "").startswith(MOUNT_FILE_PREFIX) and (content_type or "").startswith("image/")


def _cara_vigente_id(db: Session, space_id: int) -> Optional[int]:
    """El id de la imagen DESIGNADA como cara vigente de ESE espacio —
    `SpaceFace`, nunca inferida. ``None`` si el espacio no tiene ninguna
    designación (fail closed: sin fila, sin cara para el worker)."""
    fila = db.query(SpaceFace.file_id).filter(SpaceFace.space_id == space_id).first()
    return fila[0] if fila else None


def _puede_ver(rol: str, filename: str | None, content_type: str | None, *, es_cara_vigente: bool) -> bool:
    """admin ve todo. worker ve sólo lo que su pantalla necesita: sus fotos de
    montaje (de verdad imágenes, no un documento con el nombre disfrazado) y
    la cara DESIGNADA del espacio — nunca un documento, y nunca una imagen que
    no fue designada como esa cara."""
    return rol == "admin" or _es_foto_montaje(filename, content_type) or es_cara_vigente


# ─── Routes ───────────────────────────────────────────────────────────────────

# El único valor aceptado de `uso`. Es la ÚNICA forma de designar una cara —
# ver el bloque de comentario de arriba y `models.SpaceFace`.
USOS_VALIDOS = {"cara"}


@router.post(
    "/spaces/{space_id}/files",
    response_model=SpaceFileOut,
    status_code=201,
)
async def upload_space_file(
    space_id: int,
    request: Request,
    file: UploadFile = File(...),
    # Campo de form OPCIONAL: "cara" declara esta imagen como la cara vigente
    # del espacio (fix H8-B2). El prefijo de foto de montaje, en cambio, lo
    # sigue poniendo el SERVIDOR en `routers/mounts.py` — acá no hay ningún
    # campo que el cliente pueda usar para fingir esa ruta.
    uso: Optional[str] = Form(None),
    rol: str = Depends(require_admin),
    db: Session = Depends(get_db),
):
    space = db.query(Space).filter(Space.id == space_id).first()
    if not space:
        raise HTTPException(status_code=404, detail="Espacio no encontrado")

    if uso is not None and uso not in USOS_VALIDOS:
        raise HTTPException(status_code=422, detail="uso inválido. El único valor aceptado es 'cara'.")

    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=422,
            detail="Extensión no permitida. Solo se aceptan archivos PDF, XLS, XLSX, CSV o imágenes JPG, PNG y WEBP.",
        )

    # Corta la lectura apenas se pasa del límite (hardening-1): `await
    # file.read()` a secas traía el archivo ENTERO a RAM antes de comparar.
    # `MAX_FILE_SIZE` se lee acá, en tiempo de llamada, no como default de
    # parámetro: los tests lo bajan en caliente sobre el módulo.
    data = await leer_con_tope(file, MAX_FILE_SIZE, "El archivo supera el límite de 10 MB")

    # Derive the content type from the validated extension — never trust the
    # client-supplied header (it is echoed back verbatim on download).
    content_type = MEDIA_TYPES[ext]

    if uso == "cara" and not _es_imagen(content_type):
        raise HTTPException(
            status_code=422,
            detail="Sólo una imagen (JPG/PNG/WEBP) puede declararse como cara vigente del espacio.",
        )

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

    if uso == "cara":
        # Una fila por espacio: designar reemplaza la anterior in-place, no
        # agrega historial (a `list_face_images` y al worker sólo les importa
        # la vigente).
        designacion = db.query(SpaceFace).filter(SpaceFace.space_id == space_id).first()
        if designacion is None:
            db.add(SpaceFace(space_id=space_id, file_id=row.id))
        else:
            designacion.file_id = row.id
            designacion.designado_en = datetime.now(timezone.utc)

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
    # defer(data): metadata listing must not pull every blob into memory.
    filas = (
        db.query(SpaceFile)
        .options(defer(SpaceFile.data))
        .filter(SpaceFile.space_id == space_id)
        .order_by(SpaceFile.uploaded_at.desc(), SpaceFile.id.desc())
        .all()
    )
    # Se filtra en vez de rechazar: el panel del trabajador sigue funcionando y
    # los contratos simplemente no existen para él.
    if rol == "admin":
        return filas
    # La cara vigente es la DESIGNADA (`SpaceFace`), nunca inferida — ver el
    # comentario de arriba y `_cara_vigente_id`. Un espacio sin designación no
    # tiene cara para el worker (fail closed).
    cara_vigente_id = _cara_vigente_id(db, space_id)
    return [
        f for f in filas
        if _puede_ver(rol, f.filename, f.content_type, es_cara_vigente=(f.id == cara_vigente_id))
    ]


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

    # La cara vigente es la DESIGNADA (`SpaceFace`), nunca inferida.
    es_cara_vigente = row.id == _cara_vigente_id(db, row.space_id)
    # 404 y no 403 a propósito: un 403 confirma que ese archivo existe, y
    # numerando se puede levantar el inventario de contratos sin bajar ninguno.
    if not _puede_ver(rol, row.filename, row.content_type, es_cara_vigente=es_cara_vigente):
        raise HTTPException(status_code=404, detail="Archivo no encontrado")

    # Se anota la bajada de lo que un worker NO vería —documentos de siempre,
    # y ahora también cualquier imagen que no sea la foto de montaje ni la
    # cara vigente del espacio (H8: un contrato en JPG es exactamente eso)—,
    # sin importar qué rol lo esté bajando. Las fotos de montaje y la cara
    # vigente se abren decenas de veces por día y ahogarían la bitácora; lo
    # que hay que poder contestar es quién se llevó un documento.
    if not (_es_foto_montaje(row.filename, row.content_type) or es_cara_vigente):
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
    # Si este archivo era la cara designada de su espacio, la designación se
    # borra CON él — no puede quedar colgada apuntando a un id que ya no
    # existe. En SQLite, sin AUTOINCREMENT, el próximo INSERT reutiliza el
    # rowid libre más alto: un archivo nuevo subido después (el contrato,
    # por ejemplo) podría heredar el id justo borrado y quedar designado cara
    # sin que nadie lo pidiera. Fail closed: el espacio queda sin cara hasta
    # que un admin designe de nuevo — mejor eso que una designación fantasma.
    db.query(SpaceFace).filter(SpaceFace.file_id == file_id).delete()
    # Y si era la foto de un montaje, el montaje queda —pasó, y la bitácora lo
    # dice— pero sin la foto. `mount_confirmations.file_id` es una clave
    # foránea SIN regla de borrado: en Postgres, borrar el archivo con el
    # montaje apuntándole daba 500 (2026-10-02); SQLite no hace cumplir las
    # claves foráneas y las pruebas no lo veían.
    db.query(MountConfirmation).filter(MountConfirmation.file_id == file_id).update(
        {MountConfirmation.file_id: None}, synchronize_session=False,
    )
    db.delete(row)
    db.commit()
