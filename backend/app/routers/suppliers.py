import unicodedata

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.auth import require_admin, require_auth
from app.database import get_db
from app.models.models import Supplier, SpaceLease, SupplierAsset
from app.schemas.spaces import SupplierCreate, SupplierOut, SupplierPublicOut
from app.services.ciclo_participaciones import reservas_del_proveedor

# Every route requires a valid token; mutations additionally require admin.
router = APIRouter(prefix="/suppliers", tags=["suppliers"], dependencies=[Depends(require_auth)])


def _para_el_rol(supplier: Supplier, role: str):
    """El proveedor entero para un admin; sólo id y nombre para el resto.

    ── Qué se estaba filtrando ─────────────────────────────────────────────

    `Supplier` guarda `contact_name`, `phone`, `email` y `notes`. Estas dos
    rutas de lectura sólo exigían sesión —no admin— así que **un mercaderista
    recibía los datos de contacto de todos los proveedores del supermercado**.
    Son datos personales de un tercero, con la Ley 1581 encima, y no le hacen
    falta para nada: monta una exhibición, no llama a nadie.

    ── Por qué lista blanca y no redacción ─────────────────────────────────

    Se devuelve otro esquema, con los dos campos que sí van, en vez de poner en
    `None` los cuatro que no. Un campo que alguien le agregue mañana a
    `Supplier` queda AFUERA por defecto; con una redacción quedaría adentro
    hasta que alguien se acuerde de taparlo, que es precisamente la clase de
    olvido que produjo esta fuga.
    """
    if role == "admin":
        return SupplierOut.model_validate(supplier, from_attributes=True)
    return SupplierPublicOut.model_validate(supplier, from_attributes=True)


# `response_model` va en None a propósito: la forma depende del rol, y dejar
# acá el esquema de admin volvería a serializar los cuatro campos justamente
# para quien no debe verlos.
@router.get("/", response_model=None)
def list_suppliers(role: str = Depends(require_auth), db: Session = Depends(get_db)):
    filas = db.query(Supplier).order_by(Supplier.name).all()
    return [_para_el_rol(s, role) for s in filas]


def _sin_tildes(texto: str) -> str:
    """Para comparar: sin tildes, sin mayúsculas y sin espacios de sobra
    («Lácteos» y «lacteos» empiezan igual)."""
    descompuesto = unicodedata.normalize("NFKD", texto or "")
    return " ".join("".join(c for c in descompuesto if not unicodedata.combining(c)).lower().split())


# Ruta LITERAL: va antes de `/{supplier_id}` (regla de orden de FastAPI,
# docs/ESTADO.md), o «completar» se leería como un id.
@router.get("/completar")
def completar_proveedor(
    prefijo: str = "",
    role: str = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """El proveedor que Vender completa mientras se escribe
    (``docs/rediseno/vender-api.md`` §5): desde 3 letras, sin tildes ni
    mayúsculas, **un solo nombre** —el que tiene más contratos entre los que
    empiezan así; a igualdad, el más viejo— o ``null``. Nunca una lista: la
    pantalla está delante del proveedor, y una lista le mostraría con quién
    más trabaja el supermercado. Nunca montos."""
    buscado = _sin_tildes(prefijo)
    if len(buscado.replace(" ", "")) < 3:
        return {"nombre": None}
    contratos = dict(
        db.query(SpaceLease.supplier_id, func.count(SpaceLease.id)).group_by(SpaceLease.supplier_id).all()
    )
    mejor = None
    for supplier in db.query(Supplier).order_by(Supplier.id).all():
        if not _sin_tildes(supplier.name).startswith(buscado):
            continue
        n = contratos.get(supplier.id, 0)
        if mejor is None or n > mejor[0]:
            mejor = (n, supplier.name)
    return {"nombre": mejor[1] if mejor else None}


@router.post("/find-or-create", response_model=SupplierOut, status_code=200, dependencies=[Depends(require_admin)])
def find_or_create_supplier(payload: SupplierCreate, db: Session = Depends(get_db)):
    """Return existing Supplier by name, or create one.  Idempotent."""
    supplier = db.query(Supplier).filter(Supplier.name == payload.name).first()
    if supplier:
        # Completar el correo que falta, nunca pisar el que ya está. Sin esto,
        # un proveedor creado antes de que existiera el campo se quedaba sin
        # correo para siempre y su constancia de contrato no salía nunca: la
        # única forma de cargarlo habría sido tocar la base a mano. Pisarlo, en
        # cambio, dejaría que un contrato cualquiera le cambie la dirección a
        # un proveedor sin que nadie se entere.
        if payload.email and not supplier.email:
            supplier.email = payload.email
            db.commit()
            db.refresh(supplier)
        return supplier
    try:
        supplier = Supplier(**payload.model_dump())
        db.add(supplier)
        db.commit()
        db.refresh(supplier)
    except IntegrityError:
        db.rollback()
        supplier = db.query(Supplier).filter(Supplier.name == payload.name).first()
    return supplier


@router.post("/", response_model=SupplierOut, status_code=201, dependencies=[Depends(require_admin)])
def create_supplier(payload: SupplierCreate, db: Session = Depends(get_db)):
    supplier = Supplier(**payload.model_dump())
    db.add(supplier)
    db.commit()
    db.refresh(supplier)
    return supplier


@router.get("/{supplier_id}", response_model=None)
def get_supplier(
    supplier_id: int, role: str = Depends(require_auth), db: Session = Depends(get_db),
):
    supplier = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado")
    return _para_el_rol(supplier, role)


@router.put("/{supplier_id}", response_model=SupplierOut, dependencies=[Depends(require_admin)])
def update_supplier(supplier_id: int, payload: SupplierCreate, db: Session = Depends(get_db)):
    supplier = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(supplier, key, value)
    db.commit()
    db.refresh(supplier)
    return supplier


@router.delete("/{supplier_id}", status_code=204, dependencies=[Depends(require_admin)])
def delete_supplier(supplier_id: int, db: Session = Depends(get_db)):
    supplier = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado")
    active_count = (
        db.query(SpaceLease)
        .filter(SpaceLease.supplier_id == supplier_id, SpaceLease.is_active.is_(True))
        .count()
    )
    if active_count:
        raise HTTPException(
            status_code=409,
            detail=f"El proveedor tiene {active_count} contrato(s) activo(s). Cancelalos antes de eliminar.",
        )
    # Sus artes del catálogo (y la ficha de cada una) lo nombran por clave
    # foránea: en Postgres el borrado se caía con un 500 (en SQLite, que no la
    # hace cumplir, pasaba y dejaba artes huérfanas). No se borran solas: son
    # el trabajo de cargar fotos y medidas, y se borran a propósito desde el
    # catálogo.
    artes = db.query(SupplierAsset).filter(SupplierAsset.supplier_id == supplier_id).count()
    if artes:
        raise HTTPException(
            status_code=409,
            detail=f"El proveedor tiene {artes} arte(s) en el catálogo: borralas antes de eliminarlo.",
        )
    # Lo mismo con el historial de contratos (los ya terminados también lo
    # nombran): un 409 que se entiende en vez del 500 de la clave foránea.
    historial = db.query(SpaceLease).filter(SpaceLease.supplier_id == supplier_id).count()
    if historial:
        raise HTTPException(
            status_code=409,
            detail=(
                f"El proveedor tiene {historial} contrato(s) en el historial: "
                "no se puede eliminar sin perder ese historial."
            ),
        )
    # Y las reservas provisionales de participación (vivas, caducadas o
    # canceladas): son las únicas que guardan el proveedor en
    # `participaciones.supplier_id` (un contrato lo lee de su lease, y ese ya
    # frenó arriba). Sin esto, otra vez el 500 de la clave foránea.
    reservas = reservas_del_proveedor(db, supplier_id)
    if reservas:
        raise HTTPException(
            status_code=409,
            detail=(
                f"El proveedor tiene {reservas} reserva(s) provisional(es) de participación en el "
                "historial: no se puede eliminar sin perder ese historial."
            ),
        )
    db.delete(supplier)
    db.commit()
