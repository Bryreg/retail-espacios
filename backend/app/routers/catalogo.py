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

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, Response, UploadFile
from pydantic import BaseModel, Field, ValidationError
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, defer

from app.auth import require_admin, require_auth, require_auth_or_query_token
from app.database import get_db
from app.models.models import Supplier, SupplierAsset, SupplierAssetSpec
from app.services.bitacora import anotar
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


#: El nombre más largo que se acepta para dar de alta un proveedor desde el
#: visor de Vender. No se recorta: «Guardar contrato» (``bulk_leases``) busca el
#: nombre ENTERO, y un proveedor creado acá con el nombre cortado sería otro
#: para el contrato —dos proveedores para el mismo, con el historial partido—.
LARGO_MAXIMO_DE_PROVEEDOR = 200


def _proveedor_por_nombre(db: Session, nombre: Optional[str]) -> Optional[Supplier]:
    """El proveedor que va a usar «Guardar contrato» para ese nombre, o ``None``.

    La regla es la de ``bulk_leases.confirmar``: sin espacios de más y sin
    mayúsculas, y si hay dos que sólo difieren en mayúsculas («BIC» y «Bic»),
    gana el más viejo. Así el visor de Vender muestra los productos del MISMO
    proveedor al que después se le escribe el contrato.

    El cotejo va en Python y no con ``func.lower`` de SQL a propósito: el
    ``lower()`` de SQLite sólo baja ASCII, y «POSTOBÓN» no daría «postobón».
    Son unos pocos proveedores por supermercado; recorrerlos no cuesta nada.
    """
    limpio = (nombre or "").strip().lower()
    if not limpio:
        return None
    for s in db.query(Supplier).order_by(Supplier.id.asc()):
        if (s.name or "").strip().lower() == limpio:
            return s
    return None


def _error_de_ficha(e: ValidationError) -> HTTPException:
    # Sin la entrada ni el contexto: el contexto de pydantic puede traer
    # excepciones, que no se serializan.
    return HTTPException(
        status_code=422,
        detail=e.errors(include_url=False, include_context=False, include_input=False),
    )


@router.get("/", response_model=list[ArteOut], dependencies=[Depends(require_auth)])
def listar(
    supplier_id: Optional[int] = None,
    proveedor: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """El catálogo entero, o el de un proveedor.

    Sin paginar: son unos pocos proveedores con un puñado de productos cada
    uno, y quien vende necesita la lista completa para elegir de un vistazo.
    El binario NUNCA viaja en el listado — son megas por fila.

    ``?proveedor=`` es el del visor 3D de Vender, que conoce el NOMBRE que la
    dueña tecleó en el contrato y no el id. Se resuelve con la misma regla que
    usa «Guardar contrato» (``_proveedor_por_nombre``). Con el parámetro
    presente —aunque venga vacío o con espacios— la respuesta es la de ESE
    proveedor o una lista vacía, NUNCA el catálogo entero: el catálogo es la
    lista de clientes de la tienda, y esa pantalla la está mirando un
    proveedor. Bajar todo y filtrar en el navegador ya sería entregarlo.
    """
    proveedor_id: Optional[int] = None
    if proveedor is not None:
        encontrado = _proveedor_por_nombre(db, proveedor)
        if encontrado is None:
            return []
        proveedor_id = encontrado.id
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
    if proveedor_id is not None:
        q = q.filter(SupplierAsset.supplier_id == proveedor_id)
    filas = q.order_by(Supplier.name.asc(), SupplierAsset.nombre.asc()).all()
    return [_salida(arte, nombre, ficha) for arte, nombre, ficha in filas]


@router.post("/", response_model=ArteOut, status_code=201)
async def subir(
    request: Request,
    rol: str = Depends(require_admin),
    # Uno de los dos. `supplier_id` es el camino del Editor 3D, que elige el
    # proveedor de una lista. `proveedor` es el del visor de Vender, que sólo
    # conoce el NOMBRE tecleado en el contrato y no puede listar proveedores
    # (la pantalla la mira uno de ellos).
    supplier_id: Optional[int] = Form(None),
    proveedor: Optional[str] = Form(None),
    # Con `proveedor`: la dueña confirmó que el nombre es NUEVO y hay que darlo
    # de alta. Sin esto, un nombre que no está da 409 (`proveedor_nuevo`).
    crear_proveedor: Optional[bool] = Form(None),
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
    nombre_del_proveedor = (proveedor or "").strip()
    duenio: Optional[Supplier] = None
    if supplier_id is not None:
        duenio = db.query(Supplier).filter(Supplier.id == supplier_id).first()
        if not duenio:
            raise HTTPException(status_code=404, detail="Proveedor no encontrado")
    elif not nombre_del_proveedor:
        raise HTTPException(status_code=422, detail="Falta el proveedor")
    elif len(nombre_del_proveedor) > LARGO_MAXIMO_DE_PROVEEDOR:
        raise HTTPException(status_code=422, detail="El nombre del proveedor es demasiado largo")
    else:
        duenio = _proveedor_por_nombre(db, nombre_del_proveedor)
        # Un nombre que no está NO se da de alta solo. «Postobon» sin tilde o
        # «Kelloggs» sin apóstrofe no encuentran a «Postobón» ni a «Kellogg's»
        # (la regla es la del contrato: sin mayúsculas ni espacios de más,
        # nada más), y subir un producto creaba un proveedor duplicado en
        # plena reunión, antes de guardar el contrato. Se pregunta: el visor
        # pide confirmarlo y vuelve con `crear_proveedor`. El aviso no nombra
        # a nadie (no hay «¿quisiste decir…?»): la pantalla la mira un
        # proveedor y un parecido sería el nombre de otro.
        if duenio is None and not crear_proveedor:
            raise HTTPException(
                status_code=409,
                detail={
                    "codigo": "proveedor_nuevo",
                    "mensaje": f"No hay ningún proveedor «{nombre_del_proveedor}». "
                               "Revisá cómo está escrito; si es nuevo, confirmá el alta.",
                },
            )

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

    # Recién ahora, con TODO validado, el proveedor nuevo (ya confirmado: si
    # no, el 409 de arriba). Entra en el MISMO commit que el arte —si algo
    # falla después, no queda un proveedor suelto creado por una subida que no
    # llegó—. Crearlo antes de guardar el contrato es una escritura
    # adelantada, pero la misma que haría guardarlo: el contrato lo encuentra
    # por nombre (`bulk_leases`) y no crea otro.
    if duenio is None:
        nuevo = Supplier(name=nombre_del_proveedor)
        db.add(nuevo)
        try:
            db.flush()
            duenio = nuevo
        except IntegrityError:
            # Otra sesión lo creó entre la búsqueda y el alta (`name` es
            # único): se usa ése, como `find_or_create` de `suppliers.py`.
            db.rollback()
            duenio = _proveedor_por_nombre(db, nombre_del_proveedor)
            if duenio is None:
                raise HTTPException(status_code=409, detail="No se pudo dar de alta al proveedor; probá de nuevo")

    fila = SupplierAsset(
        supplier_id=duenio.id,
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
    # La bitácora (auditoría P2-14), en el mismo commit que el arte.
    db.flush()
    anotar(db, request, rol, "arte.alta", entidad="arte", entidad_id=fila.id,
           detalle=f"{duenio.name} · {fila.nombre}")
    db.commit()
    db.refresh(fila)
    if spec is not None:
        db.refresh(spec)
    return _salida(fila, duenio.name, spec)


@router.put("/{arte_id}/ficha", response_model=ArteOut)
def guardar_ficha(arte_id: int, ficha: FichaIn, request: Request, rol: str = Depends(require_admin),
                  db: Session = Depends(get_db)):
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
    anotar(db, request, rol, "arte.ficha", entidad="arte", entidad_id=arte_id, detalle=fila.nombre)
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


@router.delete("/{arte_id}", status_code=204)
def borrar(arte_id: int, request: Request, rol: str = Depends(require_admin), db: Session = Depends(get_db)):
    fila = db.query(SupplierAsset).filter(SupplierAsset.id == arte_id).first()
    if not fila:
        raise HTTPException(status_code=404, detail="Arte no encontrada")
    # La ficha primero: Postgres hace cumplir la clave foránea y no deja borrar
    # un arte que tiene ficha. SQLite no la hace cumplir, y por eso la prueba
    # lo comprueba contando filas.
    db.query(SupplierAssetSpec).filter(SupplierAssetSpec.asset_id == arte_id).delete()
    anotar(db, request, rol, "arte.baja", entidad="arte", entidad_id=arte_id, detalle=fila.nombre)
    db.delete(fila)
    db.commit()
    return Response(status_code=204)
