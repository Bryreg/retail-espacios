import json
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.models import LayoutSnapshot
from app.schemas.layout import LayoutIn, LayoutOut

router = APIRouter(prefix="/layout", tags=["layout"])


def _to_out(snap: LayoutSnapshot) -> LayoutOut:
    return LayoutOut(
        sede=snap.sede,
        fixtures=json.loads(snap.fixtures_json or "[]"),
        updated_at=snap.updated_at,
    )


@router.get("/", response_model=list[LayoutOut])
def get_all_layouts(db: Session = Depends(get_db)):
    """Return the saved fixture layout for every sede."""
    return [_to_out(s) for s in db.query(LayoutSnapshot).all()]


@router.get("/{sede}", response_model=LayoutOut)
def get_layout(sede: str, db: Session = Depends(get_db)):
    """Return the fixture layout for a single sede (empty list if none saved yet)."""
    snap = db.query(LayoutSnapshot).filter(LayoutSnapshot.sede == sede).first()
    if snap:
        return _to_out(snap)
    return LayoutOut(sede=sede, fixtures=[])


@router.put("/{sede}", response_model=LayoutOut)
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
