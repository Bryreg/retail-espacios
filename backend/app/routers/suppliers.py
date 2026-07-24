from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.auth import require_admin, require_auth
from app.database import get_db
from app.models.models import Supplier, SpaceLease
from app.schemas.spaces import SupplierCreate, SupplierOut

# Every route requires a valid token; mutations additionally require admin.
router = APIRouter(prefix="/suppliers", tags=["suppliers"], dependencies=[Depends(require_auth)])


@router.get("/", response_model=list[SupplierOut])
def list_suppliers(db: Session = Depends(get_db)):
    return db.query(Supplier).order_by(Supplier.name).all()


@router.post("/find-or-create", response_model=SupplierOut, status_code=200, dependencies=[Depends(require_admin)])
def find_or_create_supplier(payload: SupplierCreate, db: Session = Depends(get_db)):
    """Return existing Supplier by name, or create one.  Idempotent."""
    supplier = db.query(Supplier).filter(Supplier.name == payload.name).first()
    if supplier:
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


@router.get("/{supplier_id}", response_model=SupplierOut)
def get_supplier(supplier_id: int, db: Session = Depends(get_db)):
    supplier = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado")
    return supplier


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
    db.delete(supplier)
    db.commit()
