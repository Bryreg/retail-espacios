import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session
from app.auth import get_config, require_admin, require_auth, set_config
from app.database import get_db
from app.models.models import LayoutSnapshot
from app.services.sede_archive import archive_sede_spaces, count_commercial_rows
from app.schemas.layout import (
    LayoutIn,
    LayoutOut,
    LayoutRevision,
    LayoutSettingsIn,
    LayoutSettingsOut,
    ReferenceRatesIn,
    ReferenceRatesOut,
    SeasonWindow,
    SeasonWindowsIn,
    SeasonWindowsOut,
)

logger = logging.getLogger(__name__)

# Every route requires a valid token; saving a layout additionally requires admin.
router = APIRouter(prefix="/layout", tags=["layout"], dependencies=[Depends(require_auth)])

# Config keys holding the shared (non-fixture) layout state.
SEDES_KEY = "layout_sedes"
CATALOG_LABELS_KEY = "layout_catalog_labels"
SETTINGS_UPDATED_KEY = "layout_settings_updated_at"
RATES_KEY = "layout_reference_rates"
RATES_UPDATED_KEY = "layout_reference_rates_updated_at"
SEASONS_KEY = "layout_season_windows"
SEASONS_UPDATED_KEY = "layout_season_windows_updated_at"

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


def _stored_settings_revision(db: Session) -> datetime | None:
    """The revision currently stored for the shared settings, as aware UTC."""
    raw = get_config(db, SETTINGS_UPDATED_KEY)
    if not raw:
        return None
    try:
        return _as_utc(datetime.fromisoformat(raw))
    except ValueError:
        return None


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
    updated_at = _stored_settings_revision(db)
    return LayoutSettingsOut(
        sedes=[s for s in sedes if isinstance(s, str)],
        catalog_labels={k: v for k, v in labels.items() if isinstance(v, str)} if isinstance(labels, dict) else {},
        updated_at=updated_at,
    )


@router.put("/settings", response_model=LayoutSettingsOut, dependencies=[Depends(require_admin)])
def save_settings(payload: LayoutSettingsIn, db: Session = Depends(get_db)):
    """Replace the shared sede list and catalog labels.

    The sede list is a single value replaced whole, so two admins touching
    sedes inside the same poll window used to silently overwrite each other.
    That is worse than it sounds: the list is only ever unioned on pull, never
    trimmed, so a stale copy could put a deleted sede back for everyone with no
    way to remove it again. When the client echoes the revision it read, a
    write made against an older one is rejected instead of applied.
    """
    stored = _stored_settings_revision(db)
    base = _as_utc(payload.base_updated_at)
    # Once the server holds a revision, a write must name it. Treating a missing
    # base as "overwrite unconditionally" left the door open at exactly the
    # point this check exists to close: a workstation that had never read the
    # settings — or had not read them since — published its own list over
    # everyone else's, deleted sedes included. A genuine first publish is the
    # case where the server has no revision either, and that still goes through.
    if stored is not None:
        if base is None or _truncate_ms(stored) != _truncate_ms(base):
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "settings_conflict",
                    "message": (
                        "Otro equipo cambió la lista de sedes mientras editabas."
                    ),
                    "server_updated_at": stored.isoformat(),
                },
            )

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


# ─── Season windows (shared, read by anyone authenticated) ────────────────────
# Unlike the rates these are not money — a worker looking at what is free for
# Christmas needs the same season dates the admin sees. Route order: literal
# paths stay above "/{sede}".


@router.get("/seasons", response_model=SeasonWindowsOut)
def get_season_windows(response: Response, db: Session = Depends(get_db)):
    """Días de venta antes y después del ancla, por temporada."""
    _no_store(response)
    try:
        stored = json.loads(get_config(db, SEASONS_KEY) or "{}")
    except ValueError:
        stored = {}
    windows: dict[str, SeasonWindow] = {}
    if isinstance(stored, dict):
        for key, value in stored.items():
            if not isinstance(key, str) or not isinstance(value, dict):
                continue
            try:
                windows[key] = SeasonWindow(
                    before=int(value.get("before", 0)),
                    after=int(value.get("after", 0)),
                )
            except (TypeError, ValueError):
                continue
    raw_updated = get_config(db, SEASONS_UPDATED_KEY)
    updated_at = None
    if raw_updated:
        try:
            updated_at = datetime.fromisoformat(raw_updated)
        except ValueError:
            updated_at = None
    return SeasonWindowsOut(windows=windows, updated_at=updated_at)


@router.put("/seasons", response_model=SeasonWindowsOut, dependencies=[Depends(require_admin)])
def save_season_windows(payload: SeasonWindowsIn, db: Session = Depends(get_db)):
    """Replace the season windows. Same for every sede — they are not per-store."""
    now = datetime.now(timezone.utc)
    clean = {
        key.strip(): {"before": w.before, "after": w.after}
        for key, w in payload.windows.items()
        if key.strip()
    }
    set_config(db, SEASONS_KEY, json.dumps(clean))
    set_config(db, SEASONS_UPDATED_KEY, now.isoformat())
    db.commit()
    return SeasonWindowsOut(
        windows={k: SeasonWindow(**v) for k, v in clean.items()},
        updated_at=now,
    )


# ─── Reference rates (admin-only, both directions) ────────────────────────────
# Rates are money: they never travel to a worker, so unlike /settings even the
# GET requires admin. Stored in app_config — the schema rule of this project is
# "no migrations", and a key/value row is how non-fixture state gets persisted.


def _clean_rates(raw: dict) -> dict[str, float]:
    """Keep only {type: positive amount} pairs — sending 0 clears a rate."""
    clean: dict[str, float] = {}
    if not isinstance(raw, dict):
        return clean
    for key, value in raw.items():
        if not isinstance(key, str) or not key.strip():
            continue
        try:
            number = float(value)
        except (TypeError, ValueError):
            continue
        if number > 0:
            clean[key.strip()] = number
    return clean


@router.get("/rates", response_model=ReferenceRatesOut, dependencies=[Depends(require_admin)])
def get_reference_rates(response: Response, db: Session = Depends(get_db)):
    """Monthly reference rate per fixture type, with per-sede overrides."""
    _no_store(response)
    try:
        stored = json.loads(get_config(db, RATES_KEY) or "{}")
    except ValueError:
        stored = {}
    if not isinstance(stored, dict):
        stored = {}
    by_sede_raw = stored.get("by_sede")
    by_sede = (
        {sede: _clean_rates(rates) for sede, rates in by_sede_raw.items() if isinstance(sede, str)}
        if isinstance(by_sede_raw, dict)
        else {}
    )
    raw_updated = get_config(db, RATES_UPDATED_KEY)
    updated_at = None
    if raw_updated:
        try:
            updated_at = datetime.fromisoformat(raw_updated)
        except ValueError:
            updated_at = None
    return ReferenceRatesOut(
        default=_clean_rates(stored.get("default")),
        by_sede={sede: rates for sede, rates in by_sede.items() if rates},
        updated_at=updated_at,
    )


@router.put("/rates", response_model=ReferenceRatesOut, dependencies=[Depends(require_admin)])
def save_reference_rates(payload: ReferenceRatesIn, db: Session = Depends(get_db)):
    """Replace the reference rates. Sede keys are normalised like sede names."""
    now = datetime.now(timezone.utc)
    default = _clean_rates(payload.default)
    by_sede: dict[str, dict[str, float]] = {}
    for sede, rates in payload.by_sede.items():
        # Same normalisation as the client's normalizeSede — "Nave" and "NAVE"
        # must not accumulate as two different override sets.
        name = sede.strip().upper()
        clean = _clean_rates(rates)
        if name and clean:
            by_sede[name] = clean
    set_config(db, RATES_KEY, json.dumps({"default": default, "by_sede": by_sede}))
    set_config(db, RATES_UPDATED_KEY, now.isoformat())
    db.commit()
    return ReferenceRatesOut(default=default, by_sede=by_sede, updated_at=now)


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


@router.get("/{sede}/impact", dependencies=[Depends(require_admin)])
def delete_impact(sede: str, db: Session = Depends(get_db)):
    """What deleting this sede would close on the commercial side.

    The confirmation dialog counts fixtures and shelves out of the layout
    snapshot, which is a different set from the normalised spaces: only a
    fixture someone pressed "Guardar contrato" on has rows here. Both numbers
    matter, and only the server knows this one.

    Two segments, so unlike ``/revisions`` and ``/settings`` this one does not
    have to be declared before the ``/{sede}`` catch-all: that route matches a
    single segment and cannot swallow this path.
    """
    return count_commercial_rows(db, sede)


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

    # Close the sede's commercial rows in the same transaction. They are not
    # deleted — they are billing history — but leaving them live meant expiry
    # emails for a sede nobody could open, and a sede recreated under the same
    # name inheriting the old one's contracts through find_or_create_space.
    archived = archive_sede_spaces(db, sede)

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
    if archived["spaces"] or archived["mounts_archived"]:
        logger.info(
            "sede %s eliminada: %s espacios archivados, %s contratos cerrados, "
            "%s montajes archivados",
            sede, archived["spaces"], archived["leases_closed"],
            archived["mounts_archived"],
        )
    return Response(status_code=204)
