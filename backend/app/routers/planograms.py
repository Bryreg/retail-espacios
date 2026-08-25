"""La planometría de un contrato: cómo debe quedar armada esa exhibición.

Un archivo por contrato, guardado en ``lease_files`` — ver el modelo para por
qué cuelga del contrato y no del mueble.

Tres lectores, tres necesidades distintas:

· el **admin** la carga al cerrar el trato y la mira después para comparar;
· el **mercaderista** la abre al montar, y llega por el CÓDIGO del espacio (el
  enlace del correo no sabe de contratos), así que hay un endpoint que resuelve
  espacio → contrato vigente → planometría;
· el **reclamo del proveedor**, meses después, que es la razón por la que el
  archivo no se borra al vencer el contrato.
"""

from datetime import date, datetime
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session, defer

from app.auth import require_admin, require_auth, require_auth_or_query_token
from app.database import get_db
from app.models.models import LeaseFile, Space, SpaceLease

router = APIRouter(tags=["planometrias"])

MAX_SIZE = 10 * 1024 * 1024  # 10 MB

#: Lista CERRADA. No se compara contra "image/*" ni se acepta lo que declare el
#: navegador a secas: un SVG es una imagen para el navegador y un documento con
#: scripts para todo lo demás, y esto se sirve inline desde el mismo origen que
#: la app. Un PDF sí, porque es lo que manda el proveedor la mitad de las veces.
TIPOS = {
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".png": "image/png", ".webp": "image/webp",
    ".heic": "image/heic", ".heif": "image/heif",
    ".pdf": "application/pdf",
}

KIND = "planometria"


# ─── Schemas ──────────────────────────────────────────────────────────────────

class PlanometriaOut(BaseModel):
    id: int
    lease_id: int
    filename: str
    content_type: str
    size: int
    subido_por: Optional[str] = None
    uploaded_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


def _sin_datos(q):
    """El blob nunca viaja en un listado: son megas por fila."""
    return q.options(defer(LeaseFile.data))


def _de_contrato(db: Session, lease_id: int) -> Optional[LeaseFile]:
    return (
        _sin_datos(db.query(LeaseFile))
        .filter(LeaseFile.lease_id == lease_id, LeaseFile.kind == KIND)
        .order_by(LeaseFile.id.desc())
        .first()
    )


# ─── Cargar ───────────────────────────────────────────────────────────────────

@router.post(
    "/leases/{lease_id}/planometria",
    response_model=PlanometriaOut,
    status_code=201,
    dependencies=[Depends(require_admin)],
)
async def subir_planometria(
    lease_id: int,
    file: UploadFile = File(...),
    subido_por: str = Form(""),
    db: Session = Depends(get_db),
):
    lease = db.query(SpaceLease).filter(SpaceLease.id == lease_id).first()
    if not lease:
        raise HTTPException(status_code=404, detail="Contrato no encontrado")

    ext = Path(file.filename or "").suffix.lower()
    declarado = (file.content_type or "").split(";")[0].strip().lower()
    if ext in TIPOS:
        content_type = TIPOS[ext]
    elif declarado in set(TIPOS.values()):
        # La extensión puede venir vacía (una foto tomada desde el navegador no
        # siempre trae nombre). Se acepta el tipo declarado sólo si está en la
        # misma lista cerrada de arriba.
        content_type = declarado
    else:
        raise HTTPException(
            status_code=400,
            detail="La planometría tiene que ser una imagen (JPG, PNG, WEBP, HEIC) o un PDF.",
        )

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="El archivo llegó vacío.")
    if len(data) > MAX_SIZE:
        raise HTTPException(status_code=400, detail="El archivo supera los 10 MB.")

    # Una planometría por contrato: cargar otra REEMPLAZA la anterior. Guardar
    # las dos dejaría dos verdades sobre cómo debe quedar el mismo mueble, que
    # es justo lo que este archivo existe para evitar.
    for vieja in (
        db.query(LeaseFile)
        .filter(LeaseFile.lease_id == lease_id, LeaseFile.kind == KIND)
        .all()
    ):
        db.delete(vieja)

    row = LeaseFile(
        lease_id=lease_id,
        kind=KIND,
        filename=(file.filename or "planometria")[:200],
        content_type=content_type,
        size=len(data),
        data=data,
        subido_por=(subido_por or "").strip()[:80] or None,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


# ─── Leer ─────────────────────────────────────────────────────────────────────

@router.get(
    "/leases/{lease_id}/planometria",
    response_model=PlanometriaOut,
    dependencies=[Depends(require_auth)],
)
def ver_planometria(lease_id: int, db: Session = Depends(get_db)):
    row = _de_contrato(db, lease_id)
    if not row:
        raise HTTPException(status_code=404, detail="Ese contrato no tiene planometría cargada")
    return row


@router.get("/planometrias/por-espacio/{space_code}", response_model=PlanometriaOut)
def planometria_del_espacio(
    space_code: str,
    db: Session = Depends(get_db),
    _=Depends(require_auth),
):
    """La planometría del contrato vigente —o del próximo— sobre ese espacio.

    Es el camino del mercaderista: el enlace del correo de montaje trae el
    código del espacio, no el id de un contrato. Deliberadamente no devuelve
    nada del contrato salvo el archivo — el mercaderista no ve plata, y acá no
    hay ninguna que filtrar.
    """
    codigo = (space_code or "").strip().upper()
    if not codigo:
        raise HTTPException(status_code=404, detail="Espacio no encontrado")

    space = (
        db.query(Space)
        .filter(func.upper(func.trim(Space.code)) == codigo)
        .first()
    )
    if not space:
        raise HTTPException(status_code=404, detail="Espacio no encontrado")

    hoy = date.today()
    activos = [l for l in space.leases if l.is_active]
    # Por FECHAS y no sólo por la bandera: `is_active` se queda en True desde
    # que el contrato se crea.
    corriendo = [l for l in activos if l.start_date <= hoy <= l.end_date]
    proximos = [l for l in activos if l.start_date > hoy]

    # El que corre hoy manda; si no hay, el próximo que arranca. Mirar sólo
    # "hoy" dejaba sin planometría justo al contrato recién vendido para la
    # temporada que viene —que es cuando más se mira, para preparar el montaje
    # y para revisar qué fue lo que se acordó—. Los vencidos no responden acá:
    # "así debe quedar" de algo que ya se desmontó no es una respuesta.
    if corriendo:
        elegido = max(corriendo, key=lambda l: l.start_date)
    elif proximos:
        elegido = min(proximos, key=lambda l: l.start_date)
    else:
        raise HTTPException(
            status_code=404,
            detail="Ese espacio no tiene contrato vigente ni próximo",
        )

    row = _de_contrato(db, elegido.id)
    if not row:
        raise HTTPException(status_code=404, detail="Ese contrato no tiene planometría cargada")
    return row


@router.get("/planometrias/{file_id}")
def descargar_planometria(
    file_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_auth_or_query_token),
):
    row = db.query(LeaseFile).filter(LeaseFile.id == file_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Planometría no encontrada")

    nombre = (row.filename or "planometria").replace('"', "'")
    try:
        nombre.encode("latin-1")
    except UnicodeEncodeError:
        nombre = nombre.encode("latin-1", "replace").decode("latin-1")

    return Response(
        content=row.data,
        media_type=row.content_type,
        headers={"Content-Disposition": f'inline; filename="{nombre}"'},
    )


# ─── Borrar ───────────────────────────────────────────────────────────────────

@router.delete(
    "/leases/{lease_id}/planometria",
    status_code=204,
    dependencies=[Depends(require_admin)],
)
def borrar_planometria(lease_id: int, db: Session = Depends(get_db)):
    filas = (
        db.query(LeaseFile)
        .filter(LeaseFile.lease_id == lease_id, LeaseFile.kind == KIND)
        .all()
    )
    if not filas:
        raise HTTPException(status_code=404, detail="Ese contrato no tiene planometría cargada")
    for f in filas:
        db.delete(f)
    db.commit()
