"""Deleting a sede: the snapshot, the shared list, and the commercial rows.

These cover the failure modes that actually shipped and had to be fixed by
hand: a deleted sede coming back from a stale client, a phantom name left in
the shared list, expiry reminders for a sede nobody can open, and a recreated
sede inheriting the previous one's contracts.
"""

from datetime import date, timedelta

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
            "start_date": str(date.today() - timedelta(days=5)),
            "end_date": str(date.today() + timedelta(days=days_left)),
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
        due = [l for l in _active_leases(db) if (l.end_date - date.today()).days == 30]
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
    assert client.get("/api/layout/NAVE/impact", headers=admin).json() == {
        "spaces": 0, "active_leases": 0,
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
