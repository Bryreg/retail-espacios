from datetime import timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload
from app.auth import require_auth
from app.database import get_db
from app.fechas import hoy
from app.models.models import Space, SpaceLease, Supplier
from app.routers.spaces import expire_leases
from app.services.cobros import cobrado_por_contrato
from app.services.meses import al_mes_de

# Read-only router: any authenticated role may consult the dashboard.
router = APIRouter(prefix="/dashboard", tags=["dashboard"], dependencies=[Depends(require_auth)])


@router.get("/kpis")
def get_kpis(role: str = Depends(require_auth), db: Session = Depends(get_db)):
    expire_leases(db)
    today = hoy()
    expiry_threshold = today + timedelta(days=30)

    # Space counts grouped by status
    status_counts = (
        db.query(Space.status, func.count(Space.id).label("cnt"))
        .group_by(Space.status)
        .all()
    )
    counts: dict = {r.status.value: r.cnt for r in status_counts}
    total = sum(counts.values())

    # Monthly revenue from leases RUNNING TODAY. Filtering on is_active alone
    # also summed contracts signed for a future period, overstating income by
    # whatever had been pre-sold.
    running = (
        SpaceLease.is_active.is_(True),
        SpaceLease.start_date <= today,
        SpaceLease.end_date >= today,
    )
    # `monthly_rent` guarda el TOTAL del contrato (vender-api.md §1): sumarlo
    # como si fuera el mes inflaba el canon por la duración de cada contrato
    # (la verificación del rediseño UX, 2026-10-26, encontró $ 44.670.000
    # contra $ 6.370.000 reales). Lo del mes es cada total repartido en SUS
    # meses (`services/meses.py`, la misma cuenta del «Al mes» de Supervisar).
    corriendo = db.query(SpaceLease.id, SpaceLease.monthly_rent, SpaceLease.start_date, SpaceLease.end_date
                         ).filter(*running).all()
    al_mes = {lid: al_mes_de(float(rent or 0), d, h) for lid, rent, d, h in corriendo}
    monthly_revenue = float(sum(al_mes.values()))
    # Los contratos que se cobran por un % de las ventas tienen el valor en 0:
    # lo suyo es lo cobrado en los cortes de este mes (vender-api.md §3),
    # repartido por días si el corte cruza meses.
    inicio_mes = today.replace(day=1)
    fin_mes = (inicio_mes + timedelta(days=32)).replace(day=1) - timedelta(days=1)
    cobrado = cobrado_por_contrato(db, inicio_mes, fin_mes)
    monthly_revenue += sum(cobrado.values())

    # Leases expiring within the next 30 days
    expiring_soon = int(
        db.query(func.count(SpaceLease.id))
        .filter(
            SpaceLease.is_active.is_(True),
            SpaceLease.end_date <= expiry_threshold,
            SpaceLease.end_date >= today,
        )
        .scalar()
        or 0
    )

    # Top 5 suppliers ranked by monthly revenue
    # Lo cobrado por ventas se suma al proveedor: por eso el orden y el tope
    # de cinco se aplican después, acá, y no en la consulta.
    por_proveedor: dict[int, dict] = {}
    for sid, name, lease_id, rent in (
        db.query(Supplier.id, Supplier.name, SpaceLease.id, SpaceLease.monthly_rent)
        .join(SpaceLease, SpaceLease.supplier_id == Supplier.id)
        .filter(*running)
        .all()
    ):
        fila = por_proveedor.setdefault(sid, {"name": name, "leases": 0, "revenue": 0.0})
        fila["leases"] += 1
        fila["revenue"] += al_mes.get(lease_id, float(rent or 0)) + cobrado.get(lease_id, 0.0)
    # Workers never receive negotiated amounts — zero out every revenue field.
    is_admin = role == "admin"
    # Al trabajador, ni el orden por plata: los cinco primeros por plata son un
    # ranking aunque las cifras vayan en cero. Para él, por nombre.
    if is_admin:
        top_suppliers = sorted(por_proveedor.values(), key=lambda r: -r["revenue"])[:5]
    else:
        top_suppliers = sorted(por_proveedor.values(), key=lambda r: ((r["name"] or "").casefold(), r["name"] or ""))[:5]
    return {
        "total_spaces": total,
        "occupied": counts.get("occupied", 0),
        "free": counts.get("free", 0),
        "reserved": counts.get("reserved", 0),
        "maintenance": counts.get("maintenance", 0),
        "monthly_revenue": monthly_revenue if is_admin else 0.0,
        "expiring_soon": expiring_soon,
        "top_suppliers": [
            {
                "name": r["name"],
                "leases": r["leases"],
                "revenue": float(r["revenue"] or 0) if is_admin else 0.0,
            }
            for r in top_suppliers
        ],
    }


@router.get("/spaces")
def get_spaces(role: str = Depends(require_auth), db: Session = Depends(get_db)):
    """
    Per-space occupancy data for the manager dashboard.
    Returns all spaces with their active lease info and an 'unauthorized' flag
    (status=occupied but no active lease).
    """
    expire_leases(db)
    today = hoy()
    spaces = (
        db.query(Space)
        .options(
            joinedload(Space.leases).joinedload(SpaceLease.supplier)
        )
        .all()
    )

    result = []
    for space in spaces:
        # Date-aware: a lease signed for a future period is not "active" today.
        active_lease = space.active_lease
        days_remaining: int | None = None
        if active_lease:
            days_remaining = (active_lease.end_date - today).days

        # A space flagged occupied with a contract that only starts later is
        # committed, not unauthorised — flagging it would cry wolf.
        unauthorized = (
            space.status.value == "occupied"
            and active_lease is None
            and space.upcoming_lease is None
        )

        result.append({
            "id": space.id,
            "code": space.code,
            "name": space.name,
            "zone": space.zone,
            "status": space.status.value,
            "unauthorized": unauthorized,
            "lease": {
                "supplier": active_lease.supplier.name if active_lease else None,
                "start_date": str(active_lease.start_date) if active_lease else None,
                "end_date": str(active_lease.end_date) if active_lease else None,
                "days_remaining": days_remaining,
                # Rent is admin-only — workers get null
                "monthly_rent": float(active_lease.monthly_rent) if (active_lease and role == "admin") else None,
            } if active_lease else None,
        })

    return result
