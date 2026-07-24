from datetime import date, timedelta
from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload
from app.auth import require_auth
from app.database import get_db
from app.models.models import Space, SpaceLease, Supplier
from app.routers.spaces import expire_leases

# Read-only router: any authenticated role may consult the dashboard.
router = APIRouter(prefix="/dashboard", tags=["dashboard"], dependencies=[Depends(require_auth)])


@router.get("/kpis")
def get_kpis(role: str = Depends(require_auth), db: Session = Depends(get_db)):
    expire_leases(db)
    today = date.today()
    expiry_threshold = today + timedelta(days=30)

    # Space counts grouped by status
    status_counts = (
        db.query(Space.status, func.count(Space.id).label("cnt"))
        .group_by(Space.status)
        .all()
    )
    counts: dict = {r.status.value: r.cnt for r in status_counts}
    total = sum(counts.values())

    # Total monthly revenue from all active leases
    monthly_revenue = float(
        db.query(func.coalesce(func.sum(SpaceLease.monthly_rent), 0.0))
        .filter(SpaceLease.is_active.is_(True))
        .scalar()
        or 0.0
    )

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
    top_suppliers = (
        db.query(
            Supplier.name,
            func.count(SpaceLease.id).label("leases"),
            func.sum(SpaceLease.monthly_rent).label("revenue"),
        )
        .join(SpaceLease, SpaceLease.supplier_id == Supplier.id)
        .filter(SpaceLease.is_active.is_(True))
        .group_by(Supplier.id, Supplier.name)
        .order_by(func.sum(SpaceLease.monthly_rent).desc())
        .limit(5)
        .all()
    )

    # Workers never receive negotiated amounts — zero out every revenue field.
    is_admin = role == "admin"
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
                "name": r.name,
                "leases": r.leases,
                "revenue": float(r.revenue or 0) if is_admin else 0.0,
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
    today = date.today()
    spaces = (
        db.query(Space)
        .options(
            joinedload(Space.leases).joinedload(SpaceLease.supplier)
        )
        .all()
    )

    result = []
    for space in spaces:
        active_lease = next(
            (l for l in space.leases if l.is_active), None
        )
        days_remaining: int | None = None
        if active_lease:
            days_remaining = (active_lease.end_date - today).days

        unauthorized = (space.status.value == "occupied") and (active_lease is None)

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
