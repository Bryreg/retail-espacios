from datetime import date
from typing import Optional
from pydantic import BaseModel
from app.models.models import SpaceStatus


class SupplierBase(BaseModel):
    name: str
    contact_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    notes: Optional[str] = None


class SupplierCreate(SupplierBase):
    pass


class SupplierOut(SupplierBase):
    id: int

    model_config = {"from_attributes": True}


class LeaseBase(BaseModel):
    supplier_id: int
    marca: Optional[str] = None
    start_date: date
    end_date: date
    monthly_rent: float
    notes: Optional[str] = None


class LeaseCreate(LeaseBase):
    pass


class LeaseOut(LeaseBase):
    id: int
    space_id: int
    is_active: bool
    supplier: SupplierOut

    model_config = {"from_attributes": True}


class SpaceCreate(BaseModel):
    svg_id: str
    code: str
    name: str
    zone: str
    sede: Optional[str] = None
    area_m2: float
    notes: Optional[str] = None


class SpaceFindOrCreate(BaseModel):
    """Find a Space by its code or create it on the fly (for fixture-mapped spaces)."""
    code: str
    name: Optional[str] = None
    zone: Optional[str] = None
    sede: Optional[str] = None
    area_m2: Optional[float] = None


class SpaceStatusUpdate(BaseModel):
    status: SpaceStatus
    notes: Optional[str] = None


class SpaceOut(BaseModel):
    id: int
    code: str
    svg_id: str
    name: str
    zone: str
    sede: Optional[str] = None
    area_m2: float
    status: SpaceStatus
    notes: Optional[str] = None
    active_lease: Optional[LeaseOut] = None

    model_config = {"from_attributes": True}


class SpaceMapItem(BaseModel):
    svg_id: str
    status: SpaceStatus
    name: str
    supplier_name: Optional[str] = None

    model_config = {"from_attributes": True}
