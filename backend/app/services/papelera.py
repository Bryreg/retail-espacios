"""La papelera de sedes: 30 días para arrepentirse (auditoría P2-18).

Borrar una sede (``DELETE /layout/{sede}``) se lleva el plano y cierra lo
comercial (``sede_archive.archive_sede_spaces``). Era irreversible: un clic
equivocado obligaba a redibujar el plano y a volver a cargar lo vendido. Ahora
el mismo borrado guarda en ``sedes_en_papelera`` el plano tal como estaba y los
ids de lo que cerró, y ``restaurar`` lo devuelve:

· el plano, con el mismo nombre de sede, y el nombre a la lista compartida;
· cada espacio archivado, con su código de antes (``ArchivedSpace``);
· los contratos que el borrado cerró: los que siguen en fecha vuelven a correr
  y su baja «sede» se borra (para la serie, el contrato corrió sin corte); el
  término de una participación que el borrado había dado de baja, vuelve;
* los reportes de montaje archivados, vuelven a contar.

Lo que NO vuelve, y se dice en la pantalla: las reservas provisionales que el
borrado canceló (de participación y de espacio). Son de palabra y con fecha de
caducidad: devolverlas sola podría tomar una cara que otra persona ya vendió.

No se restaura sobre algo que existe: si ya hay una sede con ese nombre, o un
espacio vivo con alguno de los códigos, 409 y no se toca nada. Pasados
``DIAS_EN_LA_PAPELERA`` la fila no se puede restaurar y el mantenimiento la
purga (``purgar``): lo cerrado queda cerrado, como antes de la papelera.

Nada de acá hace commit: lo hace quien llama, con la bitácora adentro.
"""
import json
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.auth import get_config, set_config
from app.fechas import hoy
from app.models.models import (
    ArchivedSpace, LayoutSnapshot, MountConfirmation, SedeEnPapelera, Space, SpaceLease, SpaceStatus,
)
from app.models.participaciones import Participacion
from app.models.vender import BajaDeContrato
from app.services.candado import tomar_candados
from app.services.layout_lookup import normalizar

DIAS_EN_LA_PAPELERA = 30
#: La lista compartida de sedes (``routers/layout.SEDES_KEY``; un servicio no
#: importa de un router).
SEDES_KEY = "layout_sedes"
SETTINGS_UPDATED_KEY = "layout_settings_updated_at"


def _utc(d: datetime) -> datetime:
    return d.replace(tzinfo=timezone.utc) if d.tzinfo is None else d.astimezone(timezone.utc)


def _vence(fila: SedeEnPapelera) -> datetime:
    return _utc(fila.borrada_en) + timedelta(days=DIAS_EN_LA_PAPELERA)


def guardar(db: Session, sede: str, snap: LayoutSnapshot | None, archivado: dict, en_la_lista: bool,
            actor: str | None) -> SedeEnPapelera:
    """Deja la sede en la papelera, en la transacción del borrado."""
    fila = SedeEnPapelera(
        sede=sede,
        fixtures_json=(snap.fixtures_json if snap is not None else None) or "[]",
        cerrado_json=json.dumps({
            "espacios": list(archivado.get("space_ids") or []),
            "contratos": list(archivado.get("lease_ids") or []),
            "montajes": list(archivado.get("mount_ids") or []),
            "en_la_lista": bool(en_la_lista),
            "reservas_canceladas": int(archivado.get("reservas_canceladas") or 0),
        }),
        borrada_por=actor,
    )
    db.add(fila)
    db.flush()
    return fila


def listar(db: Session) -> list[dict]:
    """Las sedes que todavía se pueden restaurar, de la más nueva a la más vieja."""
    ahora = datetime.now(timezone.utc)
    fuera = []
    for f in db.query(SedeEnPapelera).filter(SedeEnPapelera.restaurada_en.is_(None)) \
            .order_by(SedeEnPapelera.borrada_en.desc(), SedeEnPapelera.id.desc()).all():
        if _vence(f) <= ahora:
            continue
        cerrado = json.loads(f.cerrado_json or "{}")
        try:
            muebles = len(json.loads(f.fixtures_json or "[]"))
        except (ValueError, TypeError):
            muebles = 0
        fuera.append({
            "id": f.id, "sede": f.sede, "borrada_en": _utc(f.borrada_en).isoformat(),
            "vence_en": _vence(f).isoformat(), "borrada_por": f.borrada_por,
            "muebles": muebles, "contratos": len(cerrado.get("contratos") or []),
            "reservas_canceladas": int(cerrado.get("reservas_canceladas") or 0),
        })
    return fuera


def _conflicto(mensaje: str) -> HTTPException:
    return HTTPException(status_code=409, detail={"code": "papelera_conflicto", "message": mensaje})


def restaurar(db: Session, papelera_id: int, actor: str | None) -> dict:
    """Devuelve la sede. Levanta 404/409 sin tocar nada si no se puede."""
    fila = db.get(SedeEnPapelera, papelera_id)
    if fila is None:
        raise HTTPException(status_code=404, detail="Esa sede no está en la papelera.")
    if fila.restaurada_en is not None:
        raise _conflicto(f"«{fila.sede}» ya se restauró.")
    if _vence(fila) <= datetime.now(timezone.utc):
        raise _conflicto(f"Pasaron más de {DIAS_EN_LA_PAPELERA} días desde que se borró «{fila.sede}»: "
                         "ya no se puede restaurar.")
    from app.services.sede_archive import sedes_conocidas

    if normalizar(fila.sede) in sedes_conocidas(db):
        raise _conflicto(f"Ya hay una sede «{fila.sede}». Renombrala o borrala antes de restaurar ésta.")

    cerrado = json.loads(fila.cerrado_json or "{}")
    archivos = (db.query(ArchivedSpace).filter(ArchivedSpace.space_id.in_(cerrado.get("espacios") or [])).all()
                if cerrado.get("espacios") else [])
    codigos = [a.original_code for a in archivos]
    if codigos:
        tomar_candados(db, codigos)
        db.expire_all()
    ocupados = sorted({c for (c,) in db.query(Space.code).filter(Space.code.in_(codigos)).all()}) if codigos else []
    if ocupados:
        raise _conflicto("Ya hay espacios con esos códigos: " + ", ".join(ocupados[:5])
                         + (" y más" if len(ocupados) > 5 else "") + ". No se restauró nada.")

    # ── El plano y el nombre ──────────────────────────────────────────────────
    db.add(LayoutSnapshot(sede=fila.sede, fixtures_json=fila.fixtures_json or "[]"))
    try:
        sedes = json.loads(get_config(db, SEDES_KEY) or "[]")
    except (ValueError, TypeError):
        sedes = []
    if not isinstance(sedes, list):
        sedes = []
    if fila.sede not in sedes:
        set_config(db, SEDES_KEY, json.dumps([*sedes, fila.sede]))
        set_config(db, SETTINGS_UPDATED_KEY, datetime.now(timezone.utc).isoformat())

    # ── Los espacios, con su código ───────────────────────────────────────────
    espacios = {a.space_id: a for a in archivos}
    for space in db.query(Space).filter(Space.id.in_(list(espacios))).all() if espacios else []:
        a = espacios[space.id]
        sufijo = f"#{a.id}"
        space.code = a.original_code
        if (space.svg_id or "").endswith(sufijo):
            space.svg_id = space.svg_id[: -len(sufijo)]
        db.delete(a)
    db.flush()

    # ── Los contratos que el borrado cerró ────────────────────────────────────
    dia = hoy()
    ids = list(cerrado.get("contratos") or [])
    vuelven = 0
    if ids:
        db.query(BajaDeContrato).filter(BajaDeContrato.lease_id.in_(ids), BajaDeContrato.motivo == "sede") \
            .delete(synchronize_session=False)
        ahora = datetime.now(timezone.utc)
        for lease in db.query(SpaceLease).filter(SpaceLease.id.in_(ids)).all():
            if lease.end_date and lease.end_date >= dia:
                lease.is_active = True
                vuelven += 1
                if lease.start_date <= dia:
                    space = db.get(Space, lease.space_id)
                    if space is not None:
                        space.status = SpaceStatus.occupied
            for termino in db.query(Participacion).filter(
                    Participacion.lease_id == lease.id, Participacion.estado == "contrato",
                    Participacion.baja_en.isnot(None)).all():
                if lease.end_date and lease.end_date >= dia:
                    termino.baja_en = None
                    termino.baja_por = None
                    termino.actualizada_en = ahora
                    termino.actualizada_por = actor
                    termino.version = (termino.version or 1) + 1

    # ── Los montajes ─────────────────────────────────────────────────────────
    montajes = list(cerrado.get("montajes") or [])
    if montajes:
        for m in db.query(MountConfirmation).filter(MountConfirmation.id.in_(montajes)).all():
            m.archivado_en = None

    fila.restaurada_en = datetime.now(timezone.utc)
    fila.restaurada_por = actor
    db.flush()
    return {"sede": fila.sede, "espacios": len(espacios), "contratos": vuelven,
            "reservas_canceladas": int(cerrado.get("reservas_canceladas") or 0)}


def purgar(db: Session) -> int:
    """Borra lo que lleva más de ``DIAS_EN_LA_PAPELERA`` (y lo ya restaurado
    de hace más de ese plazo). Lo corre el mantenimiento; hace su commit."""
    corte = datetime.now(timezone.utc) - timedelta(days=DIAS_EN_LA_PAPELERA)
    n = db.query(SedeEnPapelera).filter(SedeEnPapelera.borrada_en < corte).delete(synchronize_session=False)
    db.commit()
    return n
