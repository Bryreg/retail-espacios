from datetime import date
from typing import Optional
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
    """El proveedor para quien no es admin: **sólo el nombre.**

    Es una LISTA BLANCA y no una redacción de campos, y la diferencia importa:
    con una lista blanca, un campo que alguien le agregue mañana a `Supplier`
    —un NIT, una dirección, un contacto de bodega— queda afuera por defecto. Con
    una redacción, se filtra por defecto hasta que alguien se acuerde de taparlo.

    El nombre del proveedor SÍ sale: el mercaderista tiene que saber de quién es
    la exhibición que va a montar. Lo que no tiene que salir es cómo contactarlo,
    que es dato personal de un tercero (Ley 1581) y no le hace falta para nada.
    """
    id: int
    name: str

    model_config = {"from_attributes": True}


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
    #: Los contratos (por id) cuyo aviso de montaje todavía espera: sale cuando
    #: tengan su planometría (y, en un porcentaje, su zona confirmada), una vez
    #: (``services/montajes_pendientes.py``). Al guardar, son todos.
    montaje_pendiente: list[int] = []
    #: Los proveedores de lo guardado que no tienen correo: a ellos no les llega
    #: la constancia, y la pantalla lo dice (planilla, 2026-10-26).
    proveedor_sin_correo: list[str] = []


class LeaseOut(LeaseBase):
    id: int
    space_id: int
    is_active: bool
    #: Anidado SIEMPRE en su forma pública, para todos los roles. Nadie necesita
    #: el teléfono del proveedor colgando de un contrato: quien lo necesita lo
    #: pide por `/suppliers/{id}`, que sí mira el rol. Así esta rama no puede
    #: filtrar aunque alguien se olvide de redactarla.
    supplier: SupplierPublicOut
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
