"""El catálogo de artes de los proveedores: qué producto se le prueba a un mueble.

Existe para poder responder en la reunión «¿y cómo se vería mi producto acá?»
sin salir de la pantalla. El arte se carga UNA vez contra el proveedor y desde
ahí se le prueba a cualquier mueble, en cualquier sede.

Antes esto viajaba por ``space_files``: se subía una imagen al espacio y
``list_face_images`` tomaba la más reciente para pintar la cara en el 3D. El
arte quedaba atada al espacio —el mismo producto había que resubirlo en cada
punta— y cualquier imagen que alguien subiera al espacio se convertía en el
producto del mueble. Ese camino sigue andando para lo que ya está cargado; el
catálogo es el que se usa para vender.
"""
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session, defer

from app.auth import require_admin, require_auth, require_auth_or_query_token
from app.database import get_db
from app.models.models import Supplier, SupplierAsset
from app.services.subidas import leer_con_tope

router = APIRouter(prefix="/catalogo", tags=["catalogo"])

MAX_SIZE = 5 * 1024 * 1024

#: Lista CERRADA, igual que en el resto del proyecto. No se compara contra
#: "image/*" ni se acepta lo que declare el navegador a secas: un SVG es una
#: imagen para el navegador y un documento con scripts para todo lo demás, y
#: esto se sirve inline desde el mismo origen que la aplicación.
#:
#: Nada de PDF acá, a diferencia de la planometría: esto se pinta como textura
#: sobre un mueble en el 3D y una textura tiene que ser una imagen.
TIPOS = {
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".png": "image/png", ".webp": "image/webp",
}


class ArteOut(BaseModel):
    id: int
    supplier_id: int
    #: Se manda resuelto para que la lista se pueda dibujar sin una segunda
    #: llamada: el 3D agrupa por proveedor y necesita el nombre, no el id.
    proveedor: str = ""
    nombre: str
    categoria: Optional[str] = None
    filename: str
    content_type: str
    size: int
    uploaded_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


def _salida(fila: SupplierAsset, proveedor: str) -> ArteOut:
    salida = ArteOut.model_validate(fila)
    salida.proveedor = proveedor
    return salida


@router.get("/", response_model=list[ArteOut], dependencies=[Depends(require_auth)])
def listar(supplier_id: Optional[int] = None, db: Session = Depends(get_db)):
    """El catálogo entero, o el de un proveedor.

    Sin paginar: son unos pocos proveedores con un puñado de productos cada
    uno, y quien vende necesita la lista completa para elegir de un vistazo.
    El binario NUNCA viaja en el listado — son megas por fila.
    """
    q = (
        db.query(SupplierAsset, Supplier.name)
        .join(Supplier, Supplier.id == SupplierAsset.supplier_id)
        .options(defer(SupplierAsset.data))
    )
    if supplier_id is not None:
        q = q.filter(SupplierAsset.supplier_id == supplier_id)
    filas = q.order_by(Supplier.name.asc(), SupplierAsset.nombre.asc()).all()
    return [_salida(arte, nombre) for arte, nombre in filas]


@router.post("/", response_model=ArteOut, status_code=201, dependencies=[Depends(require_admin)])
async def subir(
    supplier_id: int = Form(...),
    nombre: str = Form(...),
    categoria: Optional[str] = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    proveedor = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not proveedor:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado")

    limpio = (nombre or "").strip()
    if not limpio:
        raise HTTPException(status_code=422, detail="Ponele nombre al producto: es lo que se elige de la lista")

    # La extensión manda; si no viene —una imagen pegada desde el portapapeles
    # llega sin nombre— vale el tipo declarado, contra la misma lista cerrada.
    ext = Path(file.filename or "").suffix.lower()
    declarado = (file.content_type or "").split(";")[0].strip().lower()
    if ext in TIPOS:
        content_type = TIPOS[ext]
    elif declarado in set(TIPOS.values()):
        content_type = declarado
    else:
        raise HTTPException(
            status_code=422,
            detail="El arte tiene que ser una imagen (JPG, PNG o WEBP).",
        )

    # Mismo corte que en `files.py`/`mounts.py` (hardening-1): se deja de leer
    # apenas se pasa del tope, en vez de bufferizar el arte entero en RAM para
    # después rechazarlo. `MAX_SIZE` se lee acá, en tiempo de llamada.
    data = await leer_con_tope(file, MAX_SIZE, "El arte supera los 5 MB.")
    if not data:
        raise HTTPException(status_code=422, detail="El archivo llegó vacío.")

    fila = SupplierAsset(
        supplier_id=supplier_id,
        nombre=limpio[:120],
        categoria=(categoria or "").strip()[:80] or None,
        filename=(file.filename or "arte")[:200],
        content_type=content_type,
        size=len(data),
        data=data,
    )
    db.add(fila)
    db.commit()
    db.refresh(fila)
    return _salida(fila, proveedor.name)


@router.get("/{arte_id}/imagen")
def imagen(
    arte_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_auth_or_query_token),
):
    """El archivo. Acepta ``?token=`` porque quien lo pide es Three.js.

    El cargador de texturas hace un ``fetch`` propio del navegador y no manda
    la cabecera Authorization, igual que un ``<img>``.
    """
    fila = db.query(SupplierAsset).filter(SupplierAsset.id == arte_id).first()
    if not fila:
        raise HTTPException(status_code=404, detail="Arte no encontrada")
    return Response(
        content=fila.data,
        media_type=fila.content_type,
        headers={
            # El arte no cambia nunca: una fila nueva es un id nuevo. Cachear
            # fuerte evita volver a bajar megas cada vez que se prueba un
            # producto en otro mueble, que es justo lo que se hace en una
            # reunión.
            "Cache-Control": "private, max-age=86400",
        },
    )


@router.delete("/{arte_id}", status_code=204, dependencies=[Depends(require_admin)])
def borrar(arte_id: int, db: Session = Depends(get_db)):
    fila = db.query(SupplierAsset).filter(SupplierAsset.id == arte_id).first()
    if not fila:
        raise HTTPException(status_code=404, detail="Arte no encontrada")
    db.delete(fila)
    db.commit()
    return Response(status_code=204)
