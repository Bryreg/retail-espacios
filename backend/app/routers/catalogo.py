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
from typing import Literal, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile
from pydantic import BaseModel, Field, ValidationError
from sqlalchemy.orm import Session, defer

from app.auth import require_admin, require_auth, require_auth_or_query_token
from app.database import get_db
from app.models.models import Supplier, SupplierAsset, SupplierAssetSpec
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


FormaDeFicha = Literal["auto", "caja", "botella", "lata", "vaso", "frasco", "bolsa", "otro"]
FondoDeFoto = Literal["auto", "quitar", "conservar"]


class FichaIn(BaseModel):
    """La ficha del arte: forma del envase y medidas en milímetros.

    Lista CERRADA de formas y de modos de fondo: la columna es String a
    propósito (un enum de Postgres pide ``ALTER TYPE`` para crecer), así que el
    único lugar donde se hace cumplir es acá. Las medidas tienen tope: un
    envase de 0 mm rompe la cuenta de frentes y uno de 5 m es un error de
    tipeo, no un producto.
    """
    model_config = {"extra": "forbid"}

    forma: FormaDeFicha = "auto"
    alto_mm: Optional[int] = Field(None, ge=10, le=1500)
    ancho_mm: Optional[int] = Field(None, ge=10, le=1500)
    fondo_mm: Optional[int] = Field(None, ge=5, le=1500)
    apilable: bool = False
    acostado: bool = False
    fondo_foto: FondoDeFoto = "auto"
    #: El precio al público, en pesos enteros, para el hablador del
    #: porta-precios. Opcional: sin él el hablador va sin cifra, nunca con una
    #: inventada. Con tope: 0 es un error y 20 millones, un tipeo.
    precio_publico: Optional[int] = Field(None, ge=50, le=10_000_000)


class FichaOut(BaseModel):
    forma: str = "auto"
    alto_mm: Optional[int] = None
    ancho_mm: Optional[int] = None
    fondo_mm: Optional[int] = None
    apilable: bool = False
    acostado: bool = False
    fondo_foto: str = "auto"
    precio_publico: Optional[int] = None

    model_config = {"from_attributes": True}


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
    #: Las medidas del envase, si alguien las cargó. Sin ficha el 3D las
    #: estima por el contenido o por el rubro, y lo dice («≈»).
    ficha: Optional[FichaOut] = None

    model_config = {"from_attributes": True}


def _salida(fila: SupplierAsset, proveedor: str, ficha: Optional[SupplierAssetSpec] = None) -> ArteOut:
    salida = ArteOut.model_validate(fila)
    salida.proveedor = proveedor
    salida.ficha = FichaOut.model_validate(ficha) if ficha is not None else None
    return salida


def _guardar_ficha(db: Session, arte_id: int, ficha: FichaIn) -> SupplierAssetSpec:
    """Crea o reemplaza la ficha (1:1 con el arte, como ``SpaceFace``)."""
    fila = db.query(SupplierAssetSpec).filter(SupplierAssetSpec.asset_id == arte_id).first()
    if fila is None:
        fila = SupplierAssetSpec(asset_id=arte_id)
        db.add(fila)
    for campo, valor in ficha.model_dump().items():
        setattr(fila, campo, valor)
    return fila


def _error_de_ficha(e: ValidationError) -> HTTPException:
    # Sin la entrada ni el contexto: el contexto de pydantic puede traer
    # excepciones, que no se serializan.
    return HTTPException(
        status_code=422,
        detail=e.errors(include_url=False, include_context=False, include_input=False),
    )


@router.get("/", response_model=list[ArteOut], dependencies=[Depends(require_auth)])
def listar(supplier_id: Optional[int] = None, db: Session = Depends(get_db)):
    """El catálogo entero, o el de un proveedor.

    Sin paginar: son unos pocos proveedores con un puñado de productos cada
    uno, y quien vende necesita la lista completa para elegir de un vistazo.
    El binario NUNCA viaja en el listado — son megas por fila.
    """
    # La ficha viene en la MISMA consulta (outerjoin): una consulta por arte
    # para traer sus medidas sería un N+1 en la lista que se abre en la reunión.
    q = (
        db.query(SupplierAsset, Supplier.name, SupplierAssetSpec)
        .join(Supplier, Supplier.id == SupplierAsset.supplier_id)
        .outerjoin(SupplierAssetSpec, SupplierAssetSpec.asset_id == SupplierAsset.id)
        .options(defer(SupplierAsset.data))
    )
    if supplier_id is not None:
        q = q.filter(SupplierAsset.supplier_id == supplier_id)
    filas = q.order_by(Supplier.name.asc(), SupplierAsset.nombre.asc()).all()
    return [_salida(arte, nombre, ficha) for arte, nombre, ficha in filas]


@router.post("/", response_model=ArteOut, status_code=201, dependencies=[Depends(require_admin)])
async def subir(
    supplier_id: int = Form(...),
    nombre: str = Form(...),
    categoria: Optional[str] = Form(None),
    file: UploadFile = File(...),
    # La ficha del envase, opcional y en el MISMO formulario: se pide al cargar
    # el arte porque el alto es lo que decide cuántos frentes entran.
    forma: Optional[str] = Form(None),
    alto_mm: Optional[int] = Form(None),
    ancho_mm: Optional[int] = Form(None),
    fondo_mm: Optional[int] = Form(None),
    apilable: Optional[bool] = Form(None),
    acostado: Optional[bool] = Form(None),
    fondo_foto: Optional[str] = Form(None),
    precio_publico: Optional[int] = Form(None),
    db: Session = Depends(get_db),
):
    proveedor = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not proveedor:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado")

    # La ficha se valida ANTES de leer el archivo: no tiene sentido bajar cinco
    # megas para después rechazar una forma que no existe.
    campos = {
        k: v for k, v in {
            "forma": forma, "alto_mm": alto_mm, "ancho_mm": ancho_mm, "fondo_mm": fondo_mm,
            "apilable": apilable, "acostado": acostado, "fondo_foto": fondo_foto,
            "precio_publico": precio_publico,
        }.items() if v is not None
    }
    ficha: Optional[FichaIn] = None
    if campos:
        try:
            ficha = FichaIn(**campos)
        except ValidationError as e:
            raise _error_de_ficha(e)

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
    spec = None
    if ficha is not None:
        # En el mismo commit que el arte: un arte sin su ficha porque el
        # segundo paso falló es un arte que se mide mal en la reunión.
        db.flush()
        spec = _guardar_ficha(db, fila.id, ficha)
    db.commit()
    db.refresh(fila)
    if spec is not None:
        db.refresh(spec)
    return _salida(fila, proveedor.name, spec)


@router.put("/{arte_id}/ficha", response_model=ArteOut, dependencies=[Depends(require_admin)])
def guardar_ficha(arte_id: int, ficha: FichaIn, db: Session = Depends(get_db)):
    """Crea o reemplaza la ficha de un arte ya cargado.

    Es el camino de las artes que se subieron antes de que existiera la ficha:
    la dueña las mide una vez y desde ahí se ven a escala en cualquier mueble.
    """
    fila = (
        db.query(SupplierAsset).options(defer(SupplierAsset.data))
        .filter(SupplierAsset.id == arte_id).first()
    )
    if not fila:
        raise HTTPException(status_code=404, detail="Arte no encontrada")
    spec = _guardar_ficha(db, arte_id, ficha)
    db.commit()
    db.refresh(spec)
    proveedor = db.query(Supplier).filter(Supplier.id == fila.supplier_id).first()
    return _salida(fila, proveedor.name if proveedor else "", spec)


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
    # La ficha primero: Postgres hace cumplir la clave foránea y no deja borrar
    # un arte que tiene ficha. SQLite no la hace cumplir, y por eso la prueba
    # lo comprueba contando filas.
    db.query(SupplierAssetSpec).filter(SupplierAssetSpec.asset_id == arte_id).delete()
    db.delete(fila)
    db.commit()
    return Response(status_code=204)
