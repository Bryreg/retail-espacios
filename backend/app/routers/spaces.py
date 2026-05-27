from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload
from app.database import get_db
from app.models.models import Space, SpaceLease, Supplier, SpaceStatus
from app.schemas.spaces import SpaceOut, SpaceCreate, SpaceStatusUpdate, LeaseCreate, LeaseOut, SpaceMapItem, SpaceFindOrCreate

router = APIRouter(prefix="/spaces", tags=["spaces"])


# ─── Lease expiry helper ──────────────────────────────────────────────────────

def expire_leases(db: Session) -> int:
    """Mark leases whose end_date has passed as inactive and free their spaces.

    Returns the number of leases expired.
    """
    today = date.today()
    expired = (
        db.query(SpaceLease)
        .filter(SpaceLease.is_active == True, SpaceLease.end_date < today)  # noqa: E712
        .all()
    )
    count = 0
    for lease in expired:
        lease.is_active = False
        db.flush()  # ensure the query below sees the updated flag
        # Only set space to free if no other active lease remains
        remaining = (
            db.query(SpaceLease)
            .filter(
                SpaceLease.space_id == lease.space_id,
                SpaceLease.is_active == True,  # noqa: E712
                SpaceLease.id != lease.id,
            )
            .count()
        )
        if remaining == 0:
            space = db.query(Space).filter(Space.id == lease.space_id).first()
            if space and space.status == SpaceStatus.occupied:
                space.status = SpaceStatus.free
        count += 1
    if count:
        db.commit()
    return count


@router.get("/map", response_model=list[SpaceMapItem])
def get_map_status(db: Session = Depends(get_db)):
    # Expire stale leases on every map refresh so the UI always reflects reality
    expire_leases(db)
    spaces = db.query(Space).options(
        joinedload(Space.leases).joinedload(SpaceLease.supplier)
    ).all()
    result = []
    for space in spaces:
        active_lease = next((l for l in space.leases if l.is_active), None)
        result.append(SpaceMapItem(
            svg_id=space.svg_id,
            status=space.status,
            name=space.name,
            supplier_name=active_lease.supplier.name if active_lease else None,
        ))
    return result


@router.post("/find-or-create", response_model=SpaceOut, status_code=200)
def find_or_create_space(payload: SpaceFindOrCreate, db: Session = Depends(get_db)):
    """Return the existing Space whose code matches, or create a new one on the fly.

    Used when fixtures are assigned in the 2D/3D editors without a pre-seeded Space record.
    The generated svg_id is prefixed with "fix-" to avoid conflicts with the seeded SVG IDs.
    """
    space = (
        db.query(Space)
        .options(joinedload(Space.leases).joinedload(SpaceLease.supplier))
        .filter(Space.code == payload.code)
        .first()
    )
    if space:
        return space

    space = Space(
        code=payload.code,
        svg_id=f"fix-{payload.code}",
        name=payload.name or payload.code,
        zone=payload.zone or "Sin zona",
        sede=payload.sede,
        area_m2=payload.area_m2 or 4.0,
        status=SpaceStatus.free,
    )
    db.add(space)
    try:
        db.commit()
    except IntegrityError:
        # Concurrent insert (race condition): roll back and fetch the winner's row.
        db.rollback()
        space = (
            db.query(Space)
            .options(joinedload(Space.leases).joinedload(SpaceLease.supplier))
            .filter(Space.code == payload.code)
            .first()
        )
        return space

    # Re-query to load relationships (needed for SpaceOut serialization)
    space = (
        db.query(Space)
        .options(joinedload(Space.leases).joinedload(SpaceLease.supplier))
        .filter(Space.code == payload.code)
        .first()
    )
    return space


@router.post("/", response_model=SpaceOut, status_code=201)
def create_space(payload: SpaceCreate, db: Session = Depends(get_db)):
    existing = db.query(Space).filter(Space.svg_id == payload.svg_id).first()
    if existing:
        raise HTTPException(status_code=409, detail="Ya existe un espacio con ese svg_id")
    space = Space(**payload.model_dump(), status=SpaceStatus.free)
    db.add(space)
    db.commit()
    db.refresh(space)
    return space


@router.get("/", response_model=list[SpaceOut])
def list_spaces(db: Session = Depends(get_db)):
    return db.query(Space).options(
        joinedload(Space.leases).joinedload(SpaceLease.supplier)
    ).order_by(Space.zone, Space.code).all()


@router.get("/{space_id}", response_model=SpaceOut)
def get_space(space_id: int, db: Session = Depends(get_db)):
    space = db.query(Space).options(
        joinedload(Space.leases).joinedload(SpaceLease.supplier)
    ).filter(Space.id == space_id).first()
    if not space:
        raise HTTPException(status_code=404, detail="Espacio no encontrado")
    return space


@router.get("/by-svg/{svg_id}", response_model=SpaceOut)
def get_space_by_svg(svg_id: str, db: Session = Depends(get_db)):
    space = db.query(Space).options(
        joinedload(Space.leases).joinedload(SpaceLease.supplier)
    ).filter(Space.svg_id == svg_id).first()
    if not space:
        raise HTTPException(status_code=404, detail="Espacio no encontrado")
    return space


@router.patch("/{space_id}/status", response_model=SpaceOut)
def update_status(space_id: int, payload: SpaceStatusUpdate, db: Session = Depends(get_db)):
    space = db.query(Space).filter(Space.id == space_id).first()
    if not space:
        raise HTTPException(status_code=404, detail="Espacio no encontrado")
    space.status = payload.status
    if payload.notes is not None:
        space.notes = payload.notes
    db.commit()
    db.refresh(space)
    return space


@router.post("/{space_id}/leases", response_model=LeaseOut, status_code=201)
def create_lease(space_id: int, payload: LeaseCreate, db: Session = Depends(get_db)):
    # Date sanity check
    if payload.start_date >= payload.end_date:
        raise HTTPException(status_code=422, detail="start_date debe ser anterior a end_date")

    space = db.query(Space).filter(Space.id == space_id).first()
    if not space:
        raise HTTPException(status_code=404, detail="Espacio no encontrado")
    supplier = db.query(Supplier).filter(Supplier.id == payload.supplier_id).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado")

    # Reject if an active lease already overlaps the requested period
    overlapping = (
        db.query(SpaceLease)
        .filter(
            SpaceLease.space_id == space_id,
            SpaceLease.is_active == True,  # noqa: E712
            SpaceLease.start_date <= payload.end_date,
            SpaceLease.end_date >= payload.start_date,
        )
        .first()
    )
    if overlapping:
        raise HTTPException(
            status_code=409,
            detail=(
                f"El espacio ya tiene un contrato activo del {overlapping.start_date}"
                f" al {overlapping.end_date}. Cancelalo primero o ajustá las fechas."
            ),
        )

    lease = SpaceLease(space_id=space_id, **payload.model_dump())
    db.add(lease)
    space.status = SpaceStatus.occupied
    db.commit()
    db.refresh(lease)
    return lease


@router.delete("/{space_id}/leases/{lease_id}", status_code=204)
def cancel_lease(space_id: int, lease_id: int, db: Session = Depends(get_db)):
    lease = db.query(SpaceLease).filter(
        SpaceLease.id == lease_id,
        SpaceLease.space_id == space_id,
    ).first()
    if not lease:
        raise HTTPException(status_code=404, detail="Contrato no encontrado")
    if not lease.is_active:
        raise HTTPException(status_code=409, detail="El contrato ya estaba cancelado")

    lease.is_active = False

    # Only mark the space free when no other active lease remains
    remaining = (
        db.query(SpaceLease)
        .filter(
            SpaceLease.space_id == space_id,
            SpaceLease.is_active == True,  # noqa: E712
            SpaceLease.id != lease_id,
        )
        .count()
    )
    space = db.query(Space).filter(Space.id == space_id).first()
    if space and remaining == 0:
        space.status = SpaceStatus.free

    db.commit()
