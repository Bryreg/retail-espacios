import json
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.auth import require_admin, require_auth
from app.database import get_db
from app.models.models import LayoutSnapshot
from app.schemas.layout import LayoutIn, LayoutOut

# Every route requires a valid token; saving a layout additionally requires admin.
router = APIRouter(prefix="/layout", tags=["layout"], dependencies=[Depends(require_auth)])


def _to_out(snap: LayoutSnapshot) -> LayoutOut:
    return LayoutOut(
        sede=snap.sede,
        fixtures=json.loads(snap.fixtures_json or "[]"),
        updated_at=snap.updated_at,
    )


def _redact_fixtures_for_worker(fixtures: list) -> None:
    """Drop negotiated amounts so non-admin roles never receive them.

    The dicts come fresh from ``json.loads`` in ``_to_out`` — mutating them
    cannot dirty the ORM session (``fixtures_json`` stays untouched).
    """
    for fixture in fixtures:
        if isinstance(fixture, dict):
            fixture.pop("negotiatedValue", None)
            face_b = fixture.get("faceB")
            if isinstance(face_b, dict):
                face_b.pop("negotiatedValue", None)
            for slot in fixture.get("slots") or []:
                if isinstance(slot, dict):
                    slot.pop("negotiatedValue", None)


@router.get("/", response_model=list[LayoutOut])
def get_all_layouts(role: str = Depends(require_auth), db: Session = Depends(get_db)):
    """Return the saved fixture layout for every sede."""
    outs = [_to_out(s) for s in db.query(LayoutSnapshot).all()]
    if role != "admin":
        for out in outs:
            _redact_fixtures_for_worker(out.fixtures)
    return outs


@router.get("/{sede}", response_model=LayoutOut)
def get_layout(sede: str, role: str = Depends(require_auth), db: Session = Depends(get_db)):
    """Return the fixture layout for a single sede (empty list if none saved yet)."""
    snap = db.query(LayoutSnapshot).filter(LayoutSnapshot.sede == sede).first()
    out = _to_out(snap) if snap else LayoutOut(sede=sede, fixtures=[])
    if role != "admin":
        _redact_fixtures_for_worker(out.fixtures)
    return out


@router.put("/{sede}", response_model=LayoutOut, dependencies=[Depends(require_admin)])
def save_layout(sede: str, payload: LayoutIn, db: Session = Depends(get_db)):
    """Upsert the fixture layout for a sede — creates or replaces atomically."""
    snap = db.query(LayoutSnapshot).filter(LayoutSnapshot.sede == sede).first()
    if snap:
        snap.fixtures_json = json.dumps(payload.fixtures)
    else:
        snap = LayoutSnapshot(sede=sede, fixtures_json=json.dumps(payload.fixtures))
        db.add(snap)
    db.commit()
    db.refresh(snap)
    return _to_out(snap)
