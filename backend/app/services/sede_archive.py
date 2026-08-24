"""Archiving the commercial rows of a deleted sede.

Deleting a sede used to drop only its layout snapshot. The normalised rows it
had produced — one ``Space`` per commercialised fixture, with its
``SpaceLease`` history — stayed behind, active and unreachable, with three
visible consequences:

· ``check_expiring_leases`` walks every active lease without filtering by sede,
  so reminder emails kept going out for contracts of a sede nobody could open
  any more, and there was no screen left from which to cancel them;
· ``find_or_create_space`` matches on ``Space.code`` alone, so recreating a
  sede under the same name handed the first new gondola the *old* sede's space,
  with its lease history attached. If one of those leases was still active and
  the dates overlapped, saving a contract on a freshly drawn plan answered
  "el espacio ya tiene un contrato activo" for a space the admin had just
  created;
· the backend KPIs kept summing revenue the app no longer showed anywhere.

Archiving closes the lease, frees the unique code and keeps the row.
"""

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.models import ArchivedSpace, Space, SpaceLease, SpaceStatus


def _spaces_of_sede(db: Session, sede: str) -> list[Space]:
    """Every Space that belongs to ``sede``, by either of the two ways it is recorded.

    ``Space.sede`` is the column, but it is nullable and older rows created
    before it existed have it empty. The code is the reliable second signal:
    every fixture-mapped space is stored as ``"{SEDE}-{code}"`` (see the 2D
    plan's ``fullCode``), so a prefix match catches what the column misses.
    """
    target = sede.strip().upper()
    if not target:
        return []
    return (
        db.query(Space)
        .filter(
            (func.upper(func.trim(func.coalesce(Space.sede, ""))) == target)
            | (Space.code.like(f"{target}-%"))
        )
        .all()
    )


def archive_sede_spaces(db: Session, sede: str) -> dict:
    """Archive every Space of ``sede``. Flushes but does not commit.

    The caller owns the transaction, so the archive lands in the same commit as
    the snapshot deletion: a sede is never half-deleted.

    Returns a summary of what was archived.
    """
    spaces = _spaces_of_sede(db, sede)
    if not spaces:
        return {"spaces": 0, "leases_closed": 0}

    already = {
        row.space_id
        for row in db.query(ArchivedSpace)
        .filter(ArchivedSpace.space_id.in_([s.id for s in spaces]))
        .all()
    }

    archived_count = 0
    closed_count = 0

    for space in spaces:
        if space.id in already:
            continue

        record = ArchivedSpace(
            space_id=space.id,
            sede=sede.strip().upper(),
            original_code=space.code,
        )
        db.add(record)
        # The id is what makes the freed code unique, so it has to exist before
        # the rename. A timestamp would collide when a sede is deleted,
        # recreated and deleted again inside the same second.
        db.flush()

        for lease in space.leases:
            if not lease.is_active:
                continue
            lease.is_active = False
            # The dates and the amount are the contract; they are not rewritten.
            # Only the "this is current" flag changes, and that is now true.
            closed_count += 1
        space.status = SpaceStatus.free

        # Free the unique columns. `code` and `svg_id` are both unique, so
        # leaving them as they were would make a recreated sede either reuse
        # this row or fail its insert outright.
        space.code = f"{record.original_code}#{record.id}"
        space.svg_id = f"{space.svg_id}#{record.id}"
        archived_count += 1

    db.flush()
    return {"spaces": archived_count, "leases_closed": closed_count}


def count_commercial_rows(db: Session, sede: str) -> dict:
    """What archiving this sede would touch. Read-only; safe to call before deleting."""
    spaces = _spaces_of_sede(db, sede)
    space_ids = [s.id for s in spaces]
    if not space_ids:
        return {"spaces": 0, "active_leases": 0}
    archived = {
        row.space_id
        for row in db.query(ArchivedSpace).filter(ArchivedSpace.space_id.in_(space_ids)).all()
    }
    live = [s for s in spaces if s.id not in archived]
    active = (
        db.query(SpaceLease)
        .filter(
            SpaceLease.space_id.in_([s.id for s in live] or [-1]),
            SpaceLease.is_active.is_(True),
        )
        .count()
    )
    return {"spaces": len(live), "active_leases": active}
