"""Deleting a sede: the snapshot, the shared list, and the commercial rows.

These cover the failure modes that actually shipped and had to be fixed by
hand: a deleted sede coming back from a stale client, a phantom name left in
the shared list, expiry reminders for a sede nobody can open, and a recreated
sede inheriting the previous one's contracts.
"""

from datetime import timedelta

from app.fechas import hoy as hoy_en_colombia  # el «hoy» del negocio: Colombia

FIXTURE = {
    "id": "f1", "code": "GON-01", "sede": "NAVE", "type": "gondola",
    "label": "GON-01", "cx": 3, "cz": 8, "rotY": 0,
    "w": 0.9, "d": 4.0, "h": 1.8, "color": "#6366f1", "status": "free",
    "supplierName": "", "brandCategory": "", "negotiatedValue": 0,
    "startDate": "", "endDate": "", "observation": "",
}


def _put(client, admin, sede, fixtures, base=None):
    return client.put(
        f"/api/layout/{sede}",
        json={"fixtures": fixtures, "base_updated_at": base},
        headers=admin,
    )


def _make_contract(client, admin, code, sede, *, days_left=10, supplier="Colgate"):
    """Save a contract the way the plan does: find/create the space, then lease it."""
    r = client.post(
        "/api/spaces/find-or-create",
        json={"code": code, "name": code, "zone": "Z", "sede": sede, "area_m2": 4.0},
        headers=admin,
    )
    assert r.status_code in (200, 201), r.text
    space_id = r.json()["id"]

    r = client.post("/api/suppliers/find-or-create", json={"name": supplier}, headers=admin)
    assert r.status_code in (200, 201), r.text
    supplier_id = r.json()["id"]

    r = client.post(
        f"/api/spaces/{space_id}/leases",
        json={
            "supplier_id": supplier_id,
            "marca": "Marca",
            "start_date": str(hoy_en_colombia() - timedelta(days=5)),
            "end_date": str(hoy_en_colombia() + timedelta(days=days_left)),
            "monthly_rent": 500000,
        },
        headers=admin,
    )
    assert r.status_code in (200, 201), r.text
    return space_id, r.json()["id"]


# ── The snapshot and the shared list ────────────────────────────────────────

def test_delete_removes_snapshot_and_name_in_one_commit(client, admin):
    _put(client, admin, "NAVE", [FIXTURE])
    client.put(
        "/api/layout/settings",
        json={"sedes": ["TERRON", "NAVE"], "catalog_labels": {}},
        headers=admin,
    )

    assert client.delete("/api/layout/NAVE", headers=admin).status_code == 204

    assert client.get("/api/layout/NAVE", headers=admin).json()["fixtures"] == []
    assert "NAVE" not in client.get("/api/layout/settings", headers=admin).json()["sedes"]


def test_stale_client_cannot_resurrect_a_deleted_sede(client, admin):
    """The bug: a workstation with unsaved edits upserted the row straight back."""
    _put(client, admin, "NAVE", [FIXTURE])
    rev = client.get("/api/layout/NAVE", headers=admin).json()["updated_at"]
    client.delete("/api/layout/NAVE", headers=admin)

    r = _put(client, admin, "NAVE", [FIXTURE], base=rev)
    assert r.status_code == 409
    assert r.json()["detail"]["code"] == "layout_deleted"
    assert client.get("/api/layout/NAVE", headers=admin).json()["fixtures"] == []


def test_a_genuine_first_write_may_still_create(client, admin):
    """Bootstrap and force send no base revision, and must keep working."""
    assert _put(client, admin, "NUEVA", [FIXTURE], base=None).status_code == 200
    assert len(client.get("/api/layout/NUEVA", headers=admin).json()["fixtures"]) == 1


def test_a_stale_base_on_a_live_sede_is_still_a_plain_conflict(client, admin):
    _put(client, admin, "NAVE", [FIXTURE])
    rev = client.get("/api/layout/NAVE", headers=admin).json()["updated_at"]
    assert _put(client, admin, "NAVE", [FIXTURE], base=rev).status_code == 200

    r = _put(client, admin, "NAVE", [FIXTURE], base=rev)
    assert r.status_code == 409
    assert r.json()["detail"]["code"] == "layout_conflict"


def test_deleting_an_unknown_sede_is_not_an_error(client, admin):
    assert client.delete("/api/layout/NO_EXISTE", headers=admin).status_code == 204


def test_a_worker_cannot_delete(client, admin, worker):
    _put(client, admin, "NAVE", [FIXTURE])
    assert client.delete("/api/layout/NAVE", headers=worker).status_code in (401, 403)
    assert len(client.get("/api/layout/NAVE", headers=admin).json()["fixtures"]) == 1


# ── The commercial rows ─────────────────────────────────────────────────────

def test_delete_closes_active_contracts(client, admin):
    """They used to stay active, so expiry emails kept going out for a sede
    nobody could open, with no screen left to cancel them from."""
    _put(client, admin, "NAVE", [FIXTURE])
    space_id, _ = _make_contract(client, admin, "NAVE-GON-01", "NAVE")

    before = client.get(f"/api/spaces/{space_id}", headers=admin).json()
    assert before["active_lease"] is not None

    client.delete("/api/layout/NAVE", headers=admin)

    after = client.get(f"/api/spaces/{space_id}", headers=admin).json()
    assert after["active_lease"] is None, "el contrato quedó activo"

    # Closed, not erased: the amount and the dates are the record, and the row
    # is still there. The API only exposes the *active* lease, so this is the
    # one assertion that has to reach past it.
    from app.database import SessionLocal
    from app.models.models import SpaceLease
    db = SessionLocal()
    try:
        kept = db.query(SpaceLease).filter(SpaceLease.space_id == space_id).all()
        assert len(kept) == 1
        assert kept[0].monthly_rent == 500000
        assert kept[0].is_active is False
    finally:
        db.close()


def test_closed_contracts_no_longer_trigger_reminders(client, admin):
    from app.database import SessionLocal
    from app.services.reminders import check_expiring_leases

    _put(client, admin, "NAVE", [FIXTURE])
    # 30 days out is one of the default reminder thresholds.
    _make_contract(client, admin, "NAVE-GON-01", "NAVE", days_left=30)

    db = SessionLocal()
    try:
        due = [l for l in _active_leases(db) if (l.end_date - hoy_en_colombia()).days == 30]
        assert due, "precondición: el contrato debería estar en la ventana de aviso"
    finally:
        db.close()

    client.delete("/api/layout/NAVE", headers=admin)

    db = SessionLocal()
    try:
        assert check_expiring_leases(db) == 0
        assert not _active_leases(db)
    finally:
        db.close()


def _active_leases(db):
    from app.models.models import SpaceLease
    return db.query(SpaceLease).filter(SpaceLease.is_active.is_(True)).all()


def test_recreating_a_sede_does_not_inherit_the_old_contracts(client, admin):
    """find_or_create_space matches on code alone, so the first gondola of a
    recreated sede used to be handed the previous sede's space and history."""
    _put(client, admin, "NAVE", [FIXTURE])
    old_space_id, _ = _make_contract(client, admin, "NAVE-GON-01", "NAVE")
    client.delete("/api/layout/NAVE", headers=admin)

    # Same name, same first code — a plausible "I deleted it by mistake" redo.
    _put(client, admin, "NAVE", [FIXTURE])
    r = client.post(
        "/api/spaces/find-or-create",
        json={"code": "NAVE-GON-01", "name": "GON-01", "zone": "Z",
              "sede": "NAVE", "area_m2": 4.0},
        headers=admin,
    )
    assert r.status_code in (200, 201), r.text
    new = r.json()
    assert new["id"] != old_space_id, "reutilizó el espacio de la sede borrada"
    assert new["active_lease"] is None, "el espacio nuevo arrastró un contrato viejo"


def test_a_second_delete_of_the_same_sede_is_harmless(client, admin):
    _put(client, admin, "NAVE", [FIXTURE])
    _make_contract(client, admin, "NAVE-GON-01", "NAVE")
    assert client.delete("/api/layout/NAVE", headers=admin).status_code == 204
    assert client.delete("/api/layout/NAVE", headers=admin).status_code == 204


def test_impact_reports_what_would_be_closed(client, admin):
    _put(client, admin, "NAVE", [FIXTURE])
    _make_contract(client, admin, "NAVE-GON-01", "NAVE")
    _make_contract(client, admin, "NAVE-GON-02", "NAVE", supplier="Doria")

    impact = client.get("/api/layout/NAVE/impact", headers=admin).json()
    assert impact["active_leases"] == 2
    assert impact["spaces"] == 2

    client.delete("/api/layout/NAVE", headers=admin)
    # `reservas_vivas`: las reservas provisionales de participación que el
    # archivo cancelaría (tests/test_participaciones_ciclo.py las prueba llenas).
    assert client.get("/api/layout/NAVE/impact", headers=admin).json() == {
        "spaces": 0, "active_leases": 0, "reservas_vivas": 0,
    }


def test_other_sedes_are_untouched(client, admin):
    _put(client, admin, "NAVE", [FIXTURE])
    _put(client, admin, "TERRON", [dict(FIXTURE, id="t1", sede="TERRON")])
    _make_contract(client, admin, "TERRON-GON-01", "TERRON")
    terron_space, _ = _make_contract(client, admin, "TERRON-GON-02", "TERRON", supplier="Doria")

    client.delete("/api/layout/NAVE", headers=admin)

    assert len(client.get("/api/layout/TERRON", headers=admin).json()["fixtures"]) == 1
    still = client.get(f"/api/spaces/{terron_space}", headers=admin).json()
    assert still["active_lease"] is not None, "cerró un contrato de otra sede"


# ── Shared settings concurrency ─────────────────────────────────────────────

def test_settings_reject_a_write_based_on_an_older_revision(client, admin):
    """Two admins inside one poll window used to overwrite each other, and a
    stale list could reinstate a deleted sede for everyone."""
    first = client.put(
        "/api/layout/settings",
        json={"sedes": ["TERRON", "NAVE"], "catalog_labels": {}},
        headers=admin,
    ).json()
    rev = first["updated_at"]

    ok = client.put(
        "/api/layout/settings",
        json={"sedes": ["TERRON"], "catalog_labels": {}, "base_updated_at": rev},
        headers=admin,
    )
    assert ok.status_code == 200

    stale = client.put(
        "/api/layout/settings",
        json={"sedes": ["TERRON", "NAVE"], "catalog_labels": {}, "base_updated_at": rev},
        headers=admin,
    )
    assert stale.status_code == 409
    assert stale.json()["detail"]["code"] == "settings_conflict"
    assert client.get("/api/layout/settings", headers=admin).json()["sedes"] == ["TERRON"]


def test_the_first_ever_publish_needs_no_revision(client, admin):
    """Nothing stored yet, so there is no revision for the client to echo."""
    r = client.put(
        "/api/layout/settings",
        json={"sedes": ["TERRON"], "catalog_labels": {"gondola": "Góndola"}},
        headers=admin,
    )
    assert r.status_code == 200
    assert r.json()["catalog_labels"] == {"gondola": "Góndola"}


def test_dos_primeras_publicaciones_a_la_vez_dan_409_y_no_500(client, admin, monkeypatch):
    """Al entrar a una base vacía el navegador manda dos `PUT /settings` (el
    doble efecto de StrictMode). Las dos leen la base sin revisión e insertan
    la misma clave: la segunda chocaba con `UNIQUE app_config.key` y volvía
    500 (el recorrido de vender por partes, 2026-10-14). Se simula esa
    carrera: la segunda escritura inserta como si no hubiera visto la fila."""
    import app.routers.layout as lay
    from app.models.models import AppConfig

    primera = client.put("/api/layout/settings", json={"sedes": ["TERRON"], "catalog_labels": {}}, headers=admin)
    assert primera.status_code == 200, primera.text
    monkeypatch.setattr(lay, "set_config", lambda db, key, value: db.add(AppConfig(key=key, value=value)))
    segunda = client.put("/api/layout/settings", json={
        "sedes": ["TERRON", "NAVE"], "catalog_labels": {}, "base_updated_at": primera.json()["updated_at"],
    }, headers=admin)
    assert segunda.status_code == 409, segunda.text
    assert segunda.json()["detail"]["code"] == "settings_conflict"
    assert client.get("/api/layout/settings", headers=admin).json()["sedes"] == ["TERRON"]


def test_a_blind_write_over_a_known_revision_is_rejected(client, admin):
    """A client that never read the settings used to overwrite them wholesale by
    sending no base revision — which put deleted sedes back for everyone."""
    client.put(
        "/api/layout/settings",
        json={"sedes": ["TERRON"], "catalog_labels": {}},
        headers=admin,
    )

    blind = client.put(
        "/api/layout/settings",
        json={"sedes": ["TERRON", "NAVE"], "catalog_labels": {}},
        headers=admin,
    )
    assert blind.status_code == 409
    assert blind.json()["detail"]["code"] == "settings_conflict"
    assert client.get("/api/layout/settings", headers=admin).json()["sedes"] == ["TERRON"]


# ── fase 2 · I5: el prefijo de otra sede, el candado de todo el plano y el ───
# ── guardado que llega tarde ─────────────────────────────────────────────────

def _fila_a_mano(code, sede=None, *, contrato=False, proveedor="Doria"):
    """Una fila de ``spaces`` escrita directo en la base, como las dejaron los
    caminos de antes: sin la columna ``sede`` o con el código en minúsculas.
    Con ``contrato``, un lease activo colgando."""
    from app.database import SessionLocal
    from app.models.models import Space, SpaceLease, SpaceStatus, Supplier

    db = SessionLocal()
    try:
        space = Space(code=code, svg_id=code, name=code, zone="Z", sede=sede, area_m2=1.0,
                      status=SpaceStatus.free)
        db.add(space)
        db.flush()
        if contrato:
            prov = db.query(Supplier).filter_by(name=proveedor).first()
            if prov is None:
                prov = Supplier(name=proveedor)
                db.add(prov)
                db.flush()
            db.add(SpaceLease(
                space_id=space.id, supplier_id=prov.id, marca="Marca",
                start_date=hoy_en_colombia() - timedelta(days=5),
                end_date=hoy_en_colombia() + timedelta(days=30),
                monthly_rent=500000, is_active=True,
            ))
        db.commit()
        return space.id
    finally:
        db.close()


def _fila(space_id):
    from app.database import SessionLocal
    from app.models.models import Space

    db = SessionLocal()
    try:
        s = db.get(Space, space_id)
        return s.code, s.sede, any(lease.is_active for lease in s.leases)
    finally:
        db.close()


def test_borrar_SAN_no_se_lleva_lo_de_SAN_JOSE(client, admin):
    """Medido (fase 2 · I5): con las sedes SAN y SAN-JOSE, borrar SAN archivaba
    SAN-JOSE-IMP-01 —el prefijo «SAN-» calza con las dos— y, con contratos, los
    cerraba. Una fila que dice su sede es de esa sede; el prefijo cuenta sólo
    para las que no la dicen, y no si es el de una sede más larga que existe.
    El código se compara en mayúsculas (en Postgres `LIKE` las distingue)."""
    _put(client, admin, "SAN", [dict(FIXTURE, sede="SAN")])
    _put(client, admin, "SAN-JOSE", [dict(FIXTURE, id="j1", sede="SAN-JOSE")])
    suyo = _fila_a_mano("SAN-GON-01", "SAN", contrato=True)
    ajeno = _fila_a_mano("SAN-JOSE-GON-01", "SAN-JOSE", contrato=True, proveedor="Colgate")
    # Filas viejas sin la columna `sede`: sólo el código dice de quién son.
    suya_sin_sede = _fila_a_mano("san-imp-02")
    ajena_sin_sede = _fila_a_mano("SAN-JOSE-IMP-03", contrato=True)

    impacto = client.get("/api/layout/SAN/impact", headers=admin).json()
    assert (impacto["spaces"], impacto["active_leases"]) == (2, 1), impacto

    assert client.delete("/api/layout/SAN", headers=admin).status_code == 204

    code, _, vivo = _fila(suyo)
    assert code.startswith("SAN-GON-01#") and not vivo, "la fila de SAN no se archivó"
    assert _fila(suya_sin_sede)[0].startswith("san-imp-02#"), "la fila sin sede con el prefijo de SAN no se archivó"
    assert _fila(ajeno) == ("SAN-JOSE-GON-01", "SAN-JOSE", True), "borrar SAN tocó una fila de SAN-JOSE"
    assert _fila(ajena_sin_sede) == ("SAN-JOSE-IMP-03", None, True), \
        "borrar SAN se llevó una fila sin sede con el prefijo de SAN-JOSE"
    assert len(client.get("/api/layout/SAN-JOSE", headers=admin).json()["fixtures"]) == 1


def test_borrar_la_sede_toma_el_candado_de_todos_los_muebles_del_plano(client, admin, monkeypatch):
    """E1 (fase 2 · I5): el archivo tomaba candado sólo de las caras que ya
    tenían términos. La PRIMERA alta de una cara sin términos pasaba a la par
    del borrado —relee el plano y el DELETE todavía no se ve— y dejaba cara,
    participación, contrato y término vivos en una sede borrada. Ahora toma el
    candado de cada mueble del plano, con el orden de siempre: candado →
    flush → expire_all. (La carrera de verdad, con dos hilos, sólo se puede
    ver en Postgres; acá alcanza con el espía.)"""
    from sqlalchemy.orm import Session

    import app.services.sede_archive as archivo
    from conftest import esperar_mantenimiento

    esperar_mantenimiento()
    _put(client, admin, "NAVE", [FIXTURE, dict(FIXTURE, id="f2", code="GON-02", cx=6)])

    candados, eventos = [], []
    tomar = archivo.tomar_candados

    def espia_candado(db, c):
        candados.append(set(c))
        eventos.append(("candado", set(c)))
        return tomar(db, c)

    flush, expire_all = Session.flush, Session.expire_all
    monkeypatch.setattr(archivo, "tomar_candados", espia_candado)
    monkeypatch.setattr(Session, "flush", lambda self, *a, **k: eventos.append("flush") or flush(self, *a, **k))
    monkeypatch.setattr(Session, "expire_all", lambda self: eventos.append("expire_all") or expire_all(self))
    assert client.delete("/api/layout/NAVE", headers=admin).status_code == 204

    todos = {"NAVE-GON-01", "NAVE-GON-02"}
    assert candados == [todos], "el archivo no tomó el candado de cada mueble del plano"
    assert eventos[:3] == [("candado", todos), "flush", "expire_all"], eventos[:4]


def test_un_guardado_que_llega_tarde_no_pisa_lo_que_otro_escribio_en_el_medio(client, admin, monkeypatch):
    """`save_layout` comparaba `base_updated_at` ANTES de los candados y
    escribía sin condición: dos guardados con la misma base pasaban los dos, y
    uno podía pisar una renumeración que entró en el medio (fase 2 · I5).
    Ahora la fila se escribe sólo si sigue en la revisión que se leyó al
    empezar. Se simula la otra escritura justo donde dolía: con los candados."""
    import json
    from datetime import datetime, timezone

    import app.routers.layout as lay
    from app.database import SessionLocal
    from app.models.models import LayoutSnapshot

    _put(client, admin, "NAVE", [FIXTURE])
    rev = client.get("/api/layout/NAVE", headers=admin).json()["updated_at"]
    otro = dict(FIXTURE, id="f9", code="GON-09", cx=9)
    original = lay._candados_del_guardado

    def otra_escritura_en_el_medio(db, sede, previas, nuevas):
        otra = SessionLocal()
        try:
            fila = otra.query(LayoutSnapshot).filter(LayoutSnapshot.sede == sede).one()
            fila.fixtures_json = json.dumps([FIXTURE, otro])
            fila.updated_at = datetime(2030, 1, 1, tzinfo=timezone.utc)
            otra.commit()
        finally:
            otra.close()
        return original(db, sede, previas, nuevas)

    monkeypatch.setattr(lay, "_candados_del_guardado", otra_escritura_en_el_medio)
    r = _put(client, admin, "NAVE", [dict(FIXTURE, cx=5)], base=rev)
    monkeypatch.setattr(lay, "_candados_del_guardado", original)

    assert r.status_code == 409, r.text
    assert r.json()["detail"]["code"] == "layout_conflict"
    guardado = {f["id"]: f for f in client.get("/api/layout/NAVE", headers=admin).json()["fixtures"]}
    assert set(guardado) == {"f1", "f9"}, "el guardado que llegó tarde pisó la otra escritura"
    assert guardado["f1"]["cx"] == 3


def test_la_lista_de_sedes_es_la_misma_clave_en_el_archivo_y_en_el_router(client):
    """`sede_archive.SEDES_KEY` copia la del router (un servicio no importa de
    un router): si se separan, «SAN» dejaría de ver a «SAN-JOSE» en la lista."""
    import app.routers.layout as lay
    import app.services.sede_archive as archivo

    assert archivo.SEDES_KEY == lay.SEDES_KEY
