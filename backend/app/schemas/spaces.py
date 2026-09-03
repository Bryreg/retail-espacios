from datetime import date
from typing import Optional, Union
from pydantic import BaseModel, Field
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


class SupplierPublicOut(BaseModel):
    """Lo único que un no-admin necesita para saber QUIÉN ocupa un espacio.

    ``email``, ``phone``, ``contact_name`` y ``notes`` quedan AUSENTES —no en
    ``null``— porque son datos de contacto y notas comerciales del proveedor:
    un worker no tiene por qué poder llamarlo por fuera del sistema, ni leer
    lo que un admin anotó sobre la negociación. Lista blanca: sólo lo que
    está declarado acá viaja, nunca "todo menos lo que se tacha".
    """
    id: int
    name: str

    model_config = {"from_attributes": True}


def supplier_out_for_role(supplier, role: str) -> Union[SupplierOut, SupplierPublicOut]:
    """``SupplierOut`` completo para admin; ``SupplierPublicOut`` (sólo id/name)
    para cualquier otro rol — worker, o lo que se agregue mañana.

    ``supplier`` puede ser el ORM ``Supplier`` o ya un ``SupplierOut``: los dos
    exponen los mismos atributos, así que ``from_attributes`` lee cualquiera de
    los dos sin distinción.
    """
    if role == "admin":
        return SupplierOut.model_validate(supplier, from_attributes=True)
    return SupplierPublicOut.model_validate(supplier, from_attributes=True)


class LeaseBase(BaseModel):
    supplier_id: int
    marca: Optional[str] = None
    start_date: date
    end_date: date
    monthly_rent: float = Field(ge=0)
    notes: Optional[str] = None


class LeaseCreate(LeaseBase):
    pass


class AvisosContrato(BaseModel):
    """A quién se le avisó al guardar el contrato.

    Existe porque la pantalla decía «Ya salieron los avisos» como frase fija,
    aunque el SMTP no estuviera configurado y no hubiera salido ni un correo.
    Cerrar una negociación creyendo que se avisó al mercaderista, y que no se
    haya avisado a nadie, es el modo de falla que vuelve inútil la herramienta.

    Reporta lo ENCOLADO, no lo entregado: los envíos son tareas en segundo
    plano que corren después de responder. Si el servidor no puede entregar,
    queda en su log — pero al menos ya no se afirma lo que no se hizo.
    """
    smtp_listo: bool = False
    comercial: list[str] = []
    montaje: list[str] = []
    proveedor: list[str] = []


class LeaseOut(LeaseBase):
    id: int
    space_id: int
    is_active: bool
    # Union y no SupplierOut a secas: la redacción por rol reemplaza este campo
    # por un SupplierPublicOut para no-admin (ver `_space_out_for_role` en
    # routers/spaces.py), y Pydantic serializa por el tipo REAL de la instancia
    # cuando el campo es una Union — así el email/phone/contact_name/notes del
    # proveedor quedan AUSENTES del JSON para worker, no en null.
    supplier: Union[SupplierOut, SupplierPublicOut]
    # Overridden as Optional so responses for non-admin roles can redact the amount.
    monthly_rent: Optional[float] = None
    # Sólo viene al CREAR el contrato; al listar no tiene sentido.
    avisos: Optional[AvisosContrato] = None

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
    #: El firmado que todavía no arranca. Sale de la property del modelo, así
    #: que no hay columna nueva. Hace falta para poder CANCELARLO: sin esto, un
    #: contrato vendido para la temporada que viene no tenía id alcanzable
    #: desde la interfaz, y el mensaje de choque de fechas decía "cancelalo
    #: primero" señalando algo que no se podía hacer.
    upcoming_lease: Optional[LeaseOut] = None

    model_config = {"from_attributes": True}


class SpaceMapItem(BaseModel):
    svg_id: str
    status: SpaceStatus
    name: str
    supplier_name: Optional[str] = None

    model_config = {"from_attributes": True}
