"""La planometría de un contrato: cómo debe quedar armada esa exhibición.

Un archivo por contrato, guardado en ``lease_files`` — ver el modelo para por
qué cuelga del contrato y no del mueble.

Tres lectores, tres necesidades distintas:

· el **admin** la carga al cerrar el trato (en Supervisar) y la mira después
  para comparar. Cargarla es lo que libera el correo de montaje de un contrato
  nuevo (``services/montajes_pendientes.py``): sale entonces, una vez —en un
  porcentaje, si además su zona ya está confirmada—. Reemplazarla no lo repite;
· el **mercaderista** la abre al montar, y llega por el CÓDIGO del espacio (el
  enlace del correo no sabe de contratos), así que hay un endpoint que resuelve
  espacio → contrato vigente → planometría;
· el **reclamo del proveedor**, mientras dure la relación: el archivo vive lo
  que vive el contrato y sus renovaciones, y cinco días después de que la cadena
  termina sin renovación lo borra la limpieza del mantenimiento
  (``services/fotos_vencidas.py``, con ``LIMPIAR_FOTOS_VENCIDAS`` prendido).
"""

from datetime import datetime
from pathlib import Path
from typing import Literal, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Response, UploadFile
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session, defer

from app.auth import require_admin, require_auth, require_auth_or_query_token
from app.clientes import Cliente, cliente_del_pedido
from app.database import get_db
from app.models.models import LeaseFile, Space, SpaceLease
from app.models.vender import MontajePendiente
from app.routers.montajes import avisar_los_listos
from app.services import montajes_pendientes
from app.services.contratos import contrato_para_montar
from app.services.subidas import leer_con_tope

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

KIND = montajes_pendientes.PLANOMETRIA


# ─── Schemas ──────────────────────────────────────────────────────────────────

class AvisoDeMontajeOut(BaseModel):
    """Qué pasó con el correo de montaje al cargar la planometría.

    ``salio``: se encoló ahora (``montaje``: a quién; vacío sin SMTP o sin
    mercaderista cargado). ``espera_distribucion``: es un porcentaje y su zona
    todavía no está confirmada; sale al confirmarla."""
    estado: Literal["salio", "espera_distribucion"]
    smtp_listo: bool = False
    montaje: list[str] = []


class PlanometriaOut(BaseModel):
    id: int
    lease_id: int
    filename: str
    content_type: str
    size: int
    subido_por: Optional[str] = None
    uploaded_at: Optional[datetime] = None
    #: Sólo al cargarla, y sólo si el contrato esperaba para avisar al montaje;
    #: None en un contrato de antes de la regla o ya avisado (no se repite).
    aviso_de_montaje: Optional[AvisoDeMontajeOut] = None

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
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    subido_por: str = Form(""),
    db: Session = Depends(get_db),
    cliente: Cliente = Depends(cliente_del_pedido),
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

    # Mismo corte que en `files.py`/`mounts.py` (hardening-1): se corta la
    # lectura apenas se pasa del tope. El 400 (y no 413) es el que este
    # endpoint contestaba desde siempre y se conserva tal cual.
    data = await leer_con_tope(
        file, MAX_SIZE, "El archivo supera los 10 MB.", codigo=400
    )
    if not data:
        raise HTTPException(status_code=400, detail="El archivo llegó vacío.")

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
    salida = PlanometriaOut.model_validate(row)
    salida.aviso_de_montaje = _avisar_montaje(db, background_tasks, lease_id, cliente)
    return salida


def _avisar_montaje(db: Session, background_tasks: BackgroundTasks, lease_id: int,
                    cliente: Cliente) -> Optional[AvisoDeMontajeOut]:
    """Si el contrato esperaba su planometría para avisar al montaje: sale
    ahora, salvo que sea un porcentaje sin zona confirmada (entonces sale al
    confirmar la distribución). Sin fila pendiente no hay nada que hacer: un
    contrato de antes de la regla, o una planometría que reemplaza a otra."""
    pendiente = db.get(MontajePendiente, lease_id)
    if pendiente is None:
        return None
    _falta_planometria, falta_distribucion = montajes_pendientes.que_falta(db, pendiente)
    if falta_distribucion:
        return AvisoDeMontajeOut(estado="espera_distribucion")
    avisos = avisar_los_listos(db, background_tasks, montajes_pendientes.listos(db, lease_id=lease_id), cliente)
    if avisos is None:
        return None
    return AvisoDeMontajeOut(estado="salio", smtp_listo=avisos.smtp_listo, montaje=avisos.montaje)


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

    # Qué contrato manda hoy sobre el espacio es una regla sola, compartida con
    # la pantalla de montaje: si cada uno eligiera por su cuenta, el enlace del
    # correo mostraría "así debe quedar" de un contrato y los datos de otro.
    elegido = contrato_para_montar(space)
    if elegido is None:
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
