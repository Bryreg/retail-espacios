import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session
from app.auth import get_config, require_admin, require_auth, set_config
from app.database import get_db
from app.models.models import LayoutSnapshot
from app.schemas.layout import (
    LayoutIn,
    LayoutOut,
    LayoutRevision,
    LayoutSettingsIn,
    LayoutSettingsOut,
)

# Every route requires a valid token; saving a layout additionally requires admin.
router = APIRouter(prefix="/layout", tags=["layout"], dependencies=[Depends(require_auth)])

# Config keys holding the shared (non-fixture) layout state.
SEDES_KEY = "layout_sedes"
CATALOG_LABELS_KEY = "layout_catalog_labels"
SETTINGS_UPDATED_KEY = "layout_settings_updated_at"

# Revisions are compared exactly: the client echoes back verbatim the string it
# received, and the JSON round-trip preserves microseconds. Sub-millisecond
# truncation is the only slack allowed, in case a backend ever rounds. An
# earlier version tolerated a whole second, which silently accepted a stale
# write made inside that window — exactly the overwrite this check exists to
# prevent.
def _truncate_ms(value: datetime) -> datetime:
    return value.replace(microsecond=(value.microsecond // 1000) * 1000)


def _to_out(snap: LayoutSnapshot) -> LayoutOut:
    return LayoutOut(
        sede=snap.sede,
        fixtures=json.loads(snap.fixtures_json or "[]"),
        updated_at=snap.updated_at,
    )


def _as_utc(value: datetime | None) -> datetime | None:
    """Normalise to aware UTC — SQLite hands back naive datetimes."""
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


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


def _price_map(fixtures: list) -> dict:
    """Index the stored negotiated amounts by fixture id.

    Shape: {fixture_id: {"top": value, "faceB": value, "slots": {slot_id: value}}}
    """
    index: dict = {}
    for fixture in fixtures:
        if not isinstance(fixture, dict) or not fixture.get("id"):
            continue
        entry: dict = {}
        if "negotiatedValue" in fixture:
            entry["top"] = fixture["negotiatedValue"]
        face_b = fixture.get("faceB")
        if isinstance(face_b, dict) and "negotiatedValue" in face_b:
            entry["faceB"] = face_b["negotiatedValue"]
        slots = {}
        for slot in fixture.get("slots") or []:
            if isinstance(slot, dict) and slot.get("id") and "negotiatedValue" in slot:
                slots[slot["id"]] = slot["negotiatedValue"]
        if slots:
            entry["slots"] = slots
        if entry:
            index[fixture["id"]] = entry
    return index


def _restore_missing_prices(incoming: list, stored: list) -> None:
    """Refill negotiated amounts the client did not send, in place.

    Worker responses have every ``negotiatedValue`` stripped server-side. Only
    an admin may write, so a redacted payload should never come back — but if
    one ever did, silently zeroing every contract in a sede would be
    unrecoverable. An ABSENT key is refilled from the stored snapshot; an
    explicit value (including 0) is a real edit and is always honoured.
    """
    if not stored:
        return
    index = _price_map(stored)
    if not index:
        return
    for fixture in incoming:
        if not isinstance(fixture, dict):
            continue
        entry = index.get(fixture.get("id"))
        if not entry:
            continue
        if "top" in entry and "negotiatedValue" not in fixture:
            fixture["negotiatedValue"] = entry["top"]
        face_b = fixture.get("faceB")
        if isinstance(face_b, dict) and "faceB" in entry and "negotiatedValue" not in face_b:
            face_b["negotiatedValue"] = entry["faceB"]
        for slot in fixture.get("slots") or []:
            if not isinstance(slot, dict):
                continue
            value = (entry.get("slots") or {}).get(slot.get("id"))
            if value is not None and "negotiatedValue" not in slot:
                slot["negotiatedValue"] = value


def _no_store(response: Response) -> None:
    """Layout reads drive cross-workstation sync — they must never be cached."""
    response.headers["Cache-Control"] = "no-store, max-age=0"


# ─── Reads ────────────────────────────────────────────────────────────────────
# Route-order gotcha (same as spaces.py): every literal path MUST be declared
# above "/{sede}", otherwise Starlette matches the catch-all first.


@router.get("/", response_model=list[LayoutOut])
def get_all_layouts(response: Response, role: str = Depends(require_auth), db: Session = Depends(get_db)):
    """Return the saved fixture layout for every sede."""
    _no_store(response)
    outs = [_to_out(s) for s in db.query(LayoutSnapshot).all()]
    if role != "admin":
        for out in outs:
            _redact_fixtures_for_worker(out.fixtures)
    return outs


@router.get("/revisions", response_model=list[LayoutRevision])
def get_revisions(response: Response, db: Session = Depends(get_db)):
    """Return ``{sede, updated_at, count}`` for every sede — no fixture payload.

    Clients poll this to notice another workstation's changes cheaply, and only
    re-download the sedes whose revision actually moved.
    """
    _no_store(response)
    revisions = []
    for snap in db.query(LayoutSnapshot).all():
        try:
            count = len(json.loads(snap.fixtures_json or "[]"))
        except (ValueError, TypeError):
            count = 0
        revisions.append(LayoutRevision(sede=snap.sede, updated_at=snap.updated_at, count=count))
    return revisions


@router.get("/settings", response_model=LayoutSettingsOut)
def get_settings(response: Response, db: Session = Depends(get_db)):
    """Shared sede list and catalog label overrides.

    These used to live only in each browser's localStorage, so renaming or
    adding a sede never reached anyone else's workstation.
    """
    _no_store(response)
    try:
        sedes = json.loads(get_config(db, SEDES_KEY) or "[]")
    except ValueError:
        sedes = []
    try:
        labels = json.loads(get_config(db, CATALOG_LABELS_KEY) or "{}")
    except ValueError:
        labels = {}
    raw_updated = get_config(db, SETTINGS_UPDATED_KEY)
    updated_at = None
    if raw_updated:
        try:
            updated_at = datetime.fromisoformat(raw_updated)
        except ValueError:
            updated_at = None
    return LayoutSettingsOut(
        sedes=[s for s in sedes if isinstance(s, str)],
        catalog_labels={k: v for k, v in labels.items() if isinstance(v, str)} if isinstance(labels, dict) else {},
        updated_at=updated_at,
    )


@router.put("/settings", response_model=LayoutSettingsOut, dependencies=[Depends(require_admin)])
def save_settings(payload: LayoutSettingsIn, db: Session = Depends(get_db)):
    """Replace the shared sede list and catalog labels."""
    now = datetime.now(timezone.utc)
    set_config(db, SEDES_KEY, json.dumps(payload.sedes))
    set_config(db, CATALOG_LABELS_KEY, json.dumps(payload.catalog_labels))
    set_config(db, SETTINGS_UPDATED_KEY, now.isoformat())
    db.commit()
    return LayoutSettingsOut(
        sedes=payload.sedes,
        catalog_labels=payload.catalog_labels,
        updated_at=now,
    )


@router.get("/{sede}", response_model=LayoutOut)
def get_layout(sede: str, response: Response, role: str = Depends(require_auth), db: Session = Depends(get_db)):
    """Return the fixture layout for a single sede (empty list if none saved yet)."""
    _no_store(response)
    snap = db.query(LayoutSnapshot).filter(LayoutSnapshot.sede == sede).first()
    out = _to_out(snap) if snap else LayoutOut(sede=sede, fixtures=[])
    if role != "admin":
        _redact_fixtures_for_worker(out.fixtures)
    return out


# ─── Write ────────────────────────────────────────────────────────────────────


@router.put("/{sede}", response_model=LayoutOut, dependencies=[Depends(require_admin)])
def save_layout(sede: str, payload: LayoutIn, db: Session = Depends(get_db)):
    """Upsert the fixture layout for a sede — creates or replaces atomically.

    When the client sends ``base_updated_at`` the write is rejected with 409 if
    another workstation saved this sede in the meantime, so a client holding a
    stale copy can no longer silently wipe someone else's work.
    """
    snap = db.query(LayoutSnapshot).filter(LayoutSnapshot.sede == sede).first()

    # The row is gone but this client is saving on top of a revision it once
    # read: the sede was deleted from another workstation while it held a copy.
    # Falling through would upsert the row back — the deletion undone silently,
    # on every workstation, by whoever happened to have unsaved edits. Only a
    # genuine first write (no base revision: bootstrap or an explicit force)
    # may create a snapshot.
    if snap is None and payload.base_updated_at is not None:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "layout_deleted",
                "message": f"«{sede}» fue eliminada desde otro equipo.",
            },
        )

    if snap and payload.base_updated_at is not None:
        stored = _as_utc(snap.updated_at)
        base = _as_utc(payload.base_updated_at)
        if stored and base and _truncate_ms(stored) != _truncate_ms(base):
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "layout_conflict",
                    "message": (
                        f"Otro equipo guardó cambios en «{sede}» mientras editabas. "
                        "Actualizá para ver la versión del servidor antes de volver a guardar."
                    ),
                    "server_updated_at": stored.isoformat(),
                },
            )

    fixtures = payload.fixtures
    if snap:
        try:
            previous = json.loads(snap.fixtures_json or "[]")
        except (ValueError, TypeError):
            previous = []
        _restore_missing_prices(fixtures, previous)
        snap.fixtures_json = json.dumps(fixtures)
        # fixtures_json is unchanged when a client re-saves identical data, and
        # SQLAlchemy would then skip the UPDATE and leave updated_at stale.
        snap.updated_at = datetime.now(timezone.utc)
    else:
        snap = LayoutSnapshot(sede=sede, fixtures_json=json.dumps(fixtures))
        db.add(snap)
    db.commit()
    db.refresh(snap)
    return _to_out(snap)


@router.delete("/{sede}", status_code=204, dependencies=[Depends(require_admin)])
def delete_layout(sede: str, db: Session = Depends(get_db)):
    """Drop a sede's snapshot entirely.

    Without this, removing a sede only took it out of the shared list while its
    snapshot lived on, so every other workstation kept downloading the fixtures
    of a sede that no longer exists.
    """
    snap = db.query(LayoutSnapshot).filter(LayoutSnapshot.sede == sede).first()
    if snap:
        db.delete(snap)

    # Drop the name from the shared list too, in the same commit. Leaving that
    # to a separate settings PUT from the client made the deletion two
    # independent writes that could half-land: the snapshot gone but the name
    # still listed (a phantom sede nobody can remove, since the sede list is
    # only ever unioned, never trimmed), or the name gone but the snapshot
    # alive, which the next pull re-adopts and re-publishes.
    try:
        sedes = json.loads(get_config(db, SEDES_KEY) or "[]")
    except (ValueError, TypeError):
        sedes = []
    remaining = [s for s in sedes if s != sede]
    if remaining != sedes:
        set_config(db, SEDES_KEY, json.dumps(remaining))
        set_config(db, SETTINGS_UPDATED_KEY, datetime.now(timezone.utc).isoformat())

    db.commit()
    return Response(status_code=204)
