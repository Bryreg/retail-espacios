"""Una sola función de alta de contrato (D11 de participaciones).

Lo que hacía `routers/bulk_leases.confirmar` fila por fila, sacado a un módulo
propio SIN cambiar nada de lo que hace, para que el alta de un contrato de
participación (`services/participaciones.py`) escriba exactamente igual que la
planilla y que Vender: el mismo proveedor (sin mayúsculas, el más viejo si hay
dos), el mismo espacio buscado o creado libre con la misma huella, y el mismo
«sólo lo que ya arrancó ocupa».

Nada de esto toma candados ni revisa: lo hace quien llama, ANTES (la revisión,
el candado del mueble y `db.expire_all()`). Nada hace commit: viaja en la
transacción de quien llama, como la bitácora.

`create_lease` (`routers/spaces.py`) e `importar_del_plano` pueden adoptarlas
después; en esta fase no cambian de comportamiento.
"""
from __future__ import annotations

from datetime import date
from typing import Optional

from sqlalchemy.orm import Session

from app.fechas import hoy
from app.models.models import Space, SpaceLease, SpaceStatus, Supplier
from app.services.catalogo_muebles import CLASES_DE_PARTE
from app.services.partes import Parte, cantidad_de, es_division


def clave_de_proveedor(nombre: Optional[str]) -> str:
    """Cómo se compara un proveedor: sin espacios a los costados y sin mayúsculas."""
    return (nombre or "").strip().lower()


def cache_de_proveedores(db: Session) -> dict[str, Supplier]:
    """Los proveedores por su clave. Si ya hay dos que sólo difieren en
    mayúsculas («BIC» y «Bic»), gana el más viejo (id menor)."""
    proveedores: dict[str, Supplier] = {}
    for s in db.query(Supplier).order_by(Supplier.id).all():
        proveedores.setdefault(clave_de_proveedor(s.name), s)
    return proveedores


def proveedor_por_nombre(
    db: Session, nombre: str, correo: Optional[str], cache: Optional[dict] = None,
) -> Supplier:
    """El proveedor de ese nombre, buscado sin mayúsculas; si no hay, lo crea.

    Si la revisión no avisó «Proveedor nuevo» porque ya existe «BIC», el alta no
    puede crear en silencio un «Bic» aparte: serían dos proveedores para el
    mismo, con el historial partido, y la renovación ya no se reconocería como
    tal (`services/fotos_vencidas.py`).

    El correo se completa si falta y NUNCA pisa el que ya está: la planilla
    puede traer el correo del vendedor de turno.

    `cache` (de `cache_de_proveedores`) es para una tanda: se actualiza con el
    proveedor creado, así la fila siguiente lo encuentra.
    """
    if cache is None:
        cache = cache_de_proveedores(db)
    limpio = (nombre or "").strip()
    supplier = cache.get(limpio.lower())
    if not supplier:
        supplier = Supplier(name=limpio, email=correo)
        db.add(supplier)
        db.flush()
        cache[limpio.lower()] = supplier
    elif correo and not supplier.email:
        supplier.email = correo
    return supplier


def area_de_espacio(fixture: Optional[dict], parte: Optional[Parte]) -> float:
    """La huella en m² del espacio nuevo: la del mueble (`w·d`), o su parte del
    frente para una división que parte el ancho. Una parte que no parte el
    ancho no tiene huella propia, y una pieza (la bahía de una caja, el forro de
    una columna) o una participación tampoco: no es un pedazo del piso que se
    vende."""
    area = 0.0
    if fixture:
        try:
            area = round(float(fixture.get("w") or 0) * float(fixture.get("d") or 0), 2)
        except (TypeError, ValueError):
            area = 0.0
        if parte is not None:
            n = cantidad_de(fixture, parte.clase)
            eje = CLASES_DE_PARTE[parte.clase].get("eje")
            area = round(area / n, 2) if (n and eje == "ancho" and es_division(parte)) else 0.0
    return area


def espacio_para(
    db: Session,
    codigo: str,
    nombre: Optional[str],
    sede: Optional[str],
    fixture: Optional[dict],
    parte: Optional[Parte],
) -> Space:
    """La fila de `spaces` de `codigo`, o una nueva LIBRE con la huella de
    `area_de_espacio`, el rótulo `nombre` (o el código si no hay) y el tipo del
    mueble como zona."""
    space = db.query(Space).filter(Space.code == codigo).first()
    if space:
        return space
    space = Space(
        code=codigo,
        svg_id=codigo,
        name=nombre or codigo,
        zone=str((fixture or {}).get("type") or "espacio"),
        sede=sede,
        area_m2=area_de_espacio(fixture, parte),
        status=SpaceStatus.free,
    )
    db.add(space)
    db.flush()
    return space


def escribir_contrato(
    db: Session,
    space: Space,
    supplier: Supplier,
    marca: Optional[str],
    desde: date,
    hasta: date,
    valor: Optional[float],
    notas: Optional[str],
) -> SpaceLease:
    """Inserta el contrato y hace `flush` (quien llama necesita su id).

    Sólo lo que ya arrancó ocupa: firmar en agosto para diciembre no puede
    esconder cuatro meses vendibles detrás de un estado que no es cierto."""
    lease = SpaceLease(
        space_id=space.id,
        supplier_id=supplier.id,
        marca=marca,
        start_date=desde,
        end_date=hasta,
        monthly_rent=float(valor or 0),
        notes=notas,
    )
    db.add(lease)
    db.flush()
    if lease.start_date <= hoy():
        space.status = SpaceStatus.occupied
    return lease
