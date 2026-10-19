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

**Participaciones de cara** (diseño de participaciones §2.5). Sus reservas
provisionales no son leases: sin un gancho quedaban vivas sobre espacios
archivados. En la misma transacción, con los candados de esas caras tomados
ANTES de tocar nada, las reservas vivas pasan a `reserva_cancelada` y los
términos de los contratos que el archivo cierra ganan `baja_en`
(`services/ciclo_participaciones.py`). Y se dice antes: `count_commercial_rows`
cuenta `reservas_vivas`, que el diálogo de «Borrar sede» muestra.
"""

import json
from datetime import datetime, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.auth import get_config
from app.models.models import (
    ArchivedSpace,
    LayoutSnapshot,
    MountConfirmation,
    Space,
    SpaceLease,
    SpaceStatus,
)
from app.services.candado import tomar_candados
from app.services.ciclo_participaciones import (
    al_archivar_sede, codigos_de_caras_con_terminos, reservas_vivas,
)
from app.services.layout_lookup import _escapar_like, _full_code, normalizar, sin_prefijo_de_sede

#: La lista compartida de sedes en ``app_config``. Es ``SEDES_KEY`` de
#: ``routers/layout.py`` (un servicio no importa de un router: la capa al
#: revés da un import circular); ``tests/test_sede_delete.py`` exige que las
#: dos digan lo mismo.
SEDES_KEY = "layout_sedes"


def sedes_conocidas(db: Session) -> set[str]:
    """Los nombres de sede que existen, normalizados: los que tienen plano
    guardado y los de la lista compartida (una sede recién creada puede no
    tener plano todavía)."""
    nombres = {normalizar(s) for (s,) in db.query(LayoutSnapshot.sede).all()}
    try:
        lista = json.loads(get_config(db, SEDES_KEY) or "[]")
    except (ValueError, TypeError):
        lista = []
    if isinstance(lista, list):
        nombres |= {normalizar(s) for s in lista if isinstance(s, str)}
    return {n for n in nombres if n}


def _mas_largas(db: Session, target: str) -> list[str]:
    """Las sedes que existen y empiezan como ``target`` seguida de un guion
    (``SAN-JOSE`` para ``SAN``): sus códigos también empiezan con ``SAN-``."""
    return sorted(s for s in sedes_conocidas(db) if s != target and s.startswith(f"{target}-"))


def _de_una_sede_mas_larga(codigo: str, mas_largas: list[str]) -> bool:
    """¿El código lleva el prefijo de una de esas sedes más largas?
    ``SAN-JOSE-IMP-01`` es de ``SAN-JOSE``, no de ``SAN``."""
    c = normalizar(codigo)
    return any(c.startswith(f"{otra}-") for otra in mas_largas)


def _spaces_of_sede(db: Session, sede: str) -> list[Space]:
    """Every Space that belongs to ``sede``, by either of the two ways it is recorded.

    ``Space.sede`` is the column, but it is nullable and older rows created
    before it existed have it empty. The code is the reliable second signal:
    every fixture-mapped space is stored as ``"{SEDE}-{code}"`` (see the 2D
    plan's ``fullCode``), so a prefix match catches what the column misses.

    **El prefijo cuenta sólo para las filas con la columna vacía**, y no para
    las que calzan con el prefijo de una sede MÁS LARGA que existe (fase 2 ·
    I5, medido): con las sedes ``SAN`` y ``SAN-JOSE``, borrar ``SAN`` archivaba
    ``SAN-JOSE-IMP-01`` —con contratos, los habría cerrado y habría cancelado
    sus reservas—. Una fila que dice su sede es de esa sede, diga lo que diga
    el código. El código se compara en mayúsculas: en Postgres ``LIKE``
    distingue mayúsculas y en SQLite no, y una fila guardada ``nave-imp-05``
    es de ``NAVE`` en las dos. Lo usan el archivo, ``count_commercial_rows``
    y el renombre de sede (``services/renombre_sede.py``).
    """
    target = normalizar(sede)
    if not target:
        return []
    columna = func.upper(func.trim(func.coalesce(Space.sede, "")))
    filas = (
        db.query(Space)
        .filter(
            (columna == target)
            | ((columna == "") & func.upper(Space.code).like(f"{_escapar_like(target)}-%", escape="\\"))
        )
        .all()
    )
    if all(normalizar(s.sede) for s in filas):
        return filas
    mas_largas = _mas_largas(db, target)
    if not mas_largas:
        return filas
    return [s for s in filas if normalizar(s.sede) or not _de_una_sede_mas_larga(s.code, mas_largas)]


def _mount_confirmations_of_sede(db: Session, sede: str) -> list[MountConfirmation]:
    """Los reportes de montaje vivos (no archivados) de ``sede``, con la regla
    de ``_spaces_of_sede``: por la columna, y por el prefijo del código sólo
    los que no dicen su sede y no son de una sede más larga."""
    target = normalizar(sede)
    if not target:
        return []
    columna = func.upper(func.trim(func.coalesce(MountConfirmation.sede, "")))
    filas = (
        db.query(MountConfirmation)
        .filter(
            MountConfirmation.archivado_en.is_(None),
            (columna == target)
            | ((columna == "")
               & func.upper(MountConfirmation.space_code).like(f"{_escapar_like(target)}-%", escape="\\")),
        )
        .all()
    )
    if all(normalizar(r.sede) for r in filas):
        return filas
    mas_largas = _mas_largas(db, target)
    if not mas_largas:
        return filas
    return [r for r in filas if normalizar(r.sede) or not _de_una_sede_mas_larga(r.space_code, mas_largas)]


def _archive_mount_confirmations(db: Session, sede: str) -> int:
    """Stamp the sede's mount reports as archived. Returns how many were stamped.

    They are not deleted: a mount confirmation is the evidence that what was
    charged was actually built, and it is what answers a supplier months later.
    But it has to stop counting, because a sede recreated under the same name
    reuses the same space codes — and ``latestByCode`` on the client keys on the
    code alone, so a brand new gondola would open already marked as mounted.

    Matched the same two ways as the spaces: by the column, and by the code
    prefix for the rows whose ``sede`` was never filled in
    (``_mount_confirmations_of_sede``).
    """
    rows = _mount_confirmations_of_sede(db, sede)
    now = datetime.now(timezone.utc)
    for row in rows:
        row.archivado_en = now
    return len(rows)


def codigos_del_plano(db: Session, sede: str) -> set[str]:
    """Los códigos COMPLETOS de los muebles del plano guardado de ``sede``,
    armados con la sede del PLANO, como arma la cara un alta de participación
    (``participaciones.codigo_cara``): las claves de sus candados.

    Se lee la columna, no la fila: quien borra la sede ya marcó la fila para
    borrar (``db.delete``) y con ``autoflush=False`` (``database.py``) el
    ``DELETE`` todavía no se escribió, así que la consulta la ve."""
    crudo = db.query(LayoutSnapshot.fixtures_json).filter(LayoutSnapshot.sede == sede).scalar()
    if crudo is None:
        # El renombre pasa el nombre normalizado; una fila guardada «Nave»
        # (de una lista vieja) es la misma sede.
        fila = (db.query(LayoutSnapshot.fixtures_json)
                .filter(func.upper(func.trim(LayoutSnapshot.sede)) == normalizar(sede)).first())
        crudo = fila[0] if fila else None
    try:
        fixtures = json.loads(crudo or "[]")
    except (ValueError, TypeError):
        return set()
    if not isinstance(fixtures, list):
        return set()
    s = normalizar(sede)
    codigos: set[str] = set()
    for f in fixtures:
        if not isinstance(f, dict):
            continue
        code = normalizar(f.get("code"))
        if code:
            codigos.add(_full_code(sin_prefijo_de_sede(code, s), s))
    return codigos


def _tomar_candados_de_participaciones(db: Session, sede: str) -> None:
    """Los candados de las caras de la sede que tienen términos de
    participación **y los de todos los muebles de su plano**
    (``codigos_del_plano``), ANTES de leer lo que se va a cambiar: un alta,
    una confirmación o una renovación concurrente sobre esa cara espera a que
    el archivo termine (o el archivo a ella). Con los códigos de ANTES del
    renombre a ``#id``: la clave del candado sale del código.

    Los muebles del plano (fase 2 · I5, E1): sin ellos, la PRIMERA alta de una
    cara que nunca tuvo términos pasaba a la par del borrado —el alta relee el
    plano y el ``DELETE`` todavía no se ve— y dejaba cara, participación,
    contrato y término vivos en una sede borrada, que ninguna pantalla lista y
    cuyos avisos de vencimiento seguían saliendo. Con el candado del mueble, el
    alta que esperaba relee el plano y da 404 («No hay ningún mueble…»), y la
    que ganó la ve el ``_spaces_of_sede`` de después y se archiva. Cierra
    también la venta concurrente de una cara entera.

    Una sede sin plano y sin participaciones no toma nada y no relee nada: lo
    de siempre, igual. Con candados, ``expire_all`` (regla dura del diseño
    §5.4): lo que se lee después es lo de la base, no lo que la sesión tenía
    en memoria; el ``flush`` de antes es para no perder lo pendiente de quien
    llama (el borrado del plano).

    El orden es candado → ``flush`` → ``expire_all``, y no ``flush`` primero:
    el ``flush`` escribe el ``DELETE`` de la fila del plano, que en Postgres
    queda trabada hasta el commit. Si eso pasara ANTES del candado, un
    ``PUT /layout`` de la misma sede que ya tiene el candado de esa cara
    (`_candados_del_guardado`) y va a escribir esa misma fila esperaría al
    borrado mientras el borrado espera su candado: un abrazo mortal que
    Postgres corta con un 500. Con el candado primero, el borrado espera a que
    el guardado termine y recién ahí toca la fila."""
    codigos = codigos_de_caras_con_terminos(db, [s.id for s in _spaces_of_sede(db, sede)])
    codigos |= codigos_del_plano(db, sede)
    if not codigos:
        return
    tomar_candados(db, codigos)
    db.flush()
    db.expire_all()


def archive_sede_spaces(db: Session, sede: str, actor: str | None = None) -> dict:
    """Archive every Space of ``sede``. Flushes but does not commit.

    The caller owns the transaction, so the archive lands in the same commit as
    the snapshot deletion: a sede is never half-deleted.

    ``actor`` (correo del token o rol) queda en ``baja_por`` y en el historial
    de las participaciones que el archivo cancela.

    Returns a summary of what was archived.
    """
    _tomar_candados_de_participaciones(db, sede)

    # Before the early return below: a "no pude montar" report never creates a
    # Space row, so a sede can have confirmations to archive and no spaces.
    mounts_archived = _archive_mount_confirmations(db, sede)

    spaces = _spaces_of_sede(db, sede)
    if not spaces:
        db.flush()
        return {"spaces": 0, "leases_closed": 0, "mounts_archived": mounts_archived,
                "reservas_canceladas": 0}

    already = {
        row.space_id
        for row in db.query(ArchivedSpace)
        .filter(ArchivedSpace.space_id.in_([s.id for s in spaces]))
        .all()
    }

    archived_count = 0
    closed_count = 0
    archivados: list[int] = []
    cerrados: list[SpaceLease] = []

    for space in spaces:
        if space.id in already:
            continue
        archivados.append(space.id)

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
            cerrados.append(lease)
        space.status = SpaceStatus.free

        # Free the unique columns. `code` and `svg_id` are both unique, so
        # leaving them as they were would make a recreated sede either reuse
        # this row or fail its insert outright.
        space.code = f"{record.original_code}#{record.id}"
        space.svg_id = f"{space.svg_id}#{record.id}"
        archived_count += 1

    participaciones = al_archivar_sede(db, sede, archivados, cerrados, actor)
    db.flush()
    return {
        "spaces": archived_count,
        "leases_closed": closed_count,
        "mounts_archived": mounts_archived,
        "reservas_canceladas": participaciones["reservas_canceladas"],
    }


def count_commercial_rows(db: Session, sede: str) -> dict:
    """What archiving this sede would touch. Read-only; safe to call before deleting."""
    spaces = _spaces_of_sede(db, sede)
    space_ids = [s.id for s in spaces]
    if not space_ids:
        return {"spaces": 0, "active_leases": 0, "reservas_vivas": 0}
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
    # Las reservas provisionales de participación que el archivo cancelaría
    # (las de los mismos espacios que archiva). No son leases: sin esto el
    # diálogo no las nombraba.
    return {"spaces": len(live), "active_leases": active,
            "reservas_vivas": reservas_vivas(db, [s.id for s in live])}
