"""La papelera de sedes: borrar una sede se deshace dentro de 30 días
(auditoría P2-18, `services/papelera.py`)."""
from datetime import datetime, timedelta, timezone

from test_sede_delete import FIXTURE, _make_contract, _put


def _papelera(client, admin):
    r = client.get("/api/layout/papelera", headers=admin)
    assert r.status_code == 200, r.text
    return r.json()


def test_borrar_y_restaurar_devuelve_el_plano_los_codigos_y_los_contratos(client, admin):
    assert _put(client, admin, "NAVE", [FIXTURE]).status_code == 200
    client.put("/api/layout/settings", json={"sedes": ["NAVE"], "catalog_labels": {}}, headers=admin)
    space_id, lease_id = _make_contract(client, admin, "NAVE-GON-01", "NAVE")
    assert client.delete("/api/layout/NAVE", headers=admin).status_code == 204
    # Borrada de verdad: sin plano, sin el código, sin el contrato vivo.
    assert client.get("/api/layout/NAVE", headers=admin).json()["fixtures"] == []
    assert "NAVE-GON-01" not in client.get("/api/spaces/comercial", headers=admin).json()

    p = _papelera(client, admin)
    assert p["dias"] == 30
    (fila,) = p["sedes"]
    assert (fila["sede"], fila["muebles"], fila["contratos"]) == ("NAVE", 1, 1)

    r = client.post(f"/api/layout/papelera/{fila['id']}/restaurar", headers=admin)
    assert r.status_code == 200, r.text
    assert r.json() == {"sede": "NAVE", "espacios": 1, "contratos": 1, "reservas_canceladas": 0}
    # Vuelve todo: el plano, el nombre en la lista, el código y el contrato.
    assert [f["code"] for f in client.get("/api/layout/NAVE", headers=admin).json()["fixtures"]] == ["GON-01"]
    assert "NAVE" in client.get("/api/layout/settings", headers=admin).json()["sedes"]
    comercial = client.get("/api/spaces/comercial", headers=admin).json()
    assert comercial["NAVE-GON-01"]["leaseId"] == lease_id
    espacio = client.get(f"/api/spaces/{space_id}", headers=admin).json()
    assert espacio["code"] == "NAVE-GON-01" and "#" not in espacio["svg_id"]
    # La serie no ve un corte: el contrato corrió sin baja.
    from app.database import SessionLocal
    from app.models.vender import BajaDeContrato

    db = SessionLocal()
    try:
        assert db.get(BajaDeContrato, lease_id) is None
    finally:
        db.close()
    # Ya no está en la papelera, y no se restaura dos veces.
    assert _papelera(client, admin)["sedes"] == []
    assert client.post(f"/api/layout/papelera/{fila['id']}/restaurar", headers=admin).status_code == 409
    acciones = [l["accion"] for l in client.get("/api/bitacora/", headers=admin, params={"limite": 500}).json()]
    assert "sede.baja" in acciones and "sede.restaurada" in acciones


def test_no_se_restaura_encima_de_una_sede_que_existe(client, admin):
    _put(client, admin, "NAVE", [FIXTURE])
    assert client.delete("/api/layout/NAVE", headers=admin).status_code == 204
    (fila,) = _papelera(client, admin)["sedes"]
    # Alguien volvió a crear «NAVE» entretanto.
    assert _put(client, admin, "NAVE", [{**FIXTURE, "id": "f2", "code": "GON-09"}]).status_code == 200
    r = client.post(f"/api/layout/papelera/{fila['id']}/restaurar", headers=admin)
    assert r.status_code == 409, r.text
    assert "Ya hay una sede «NAVE»" in r.json()["detail"]["message"]
    # No tocó nada.
    assert [f["code"] for f in client.get("/api/layout/NAVE", headers=admin).json()["fixtures"]] == ["GON-09"]


def test_pasados_30_dias_no_se_restaura_y_el_mantenimiento_la_purga(client, admin):
    from app.database import SessionLocal
    from app.models.models import SedeEnPapelera
    from app.services.papelera import purgar

    _put(client, admin, "NAVE", [FIXTURE])
    assert client.delete("/api/layout/NAVE", headers=admin).status_code == 204
    db = SessionLocal()
    try:
        fila = db.query(SedeEnPapelera).one()
        fila.borrada_en = datetime.now(timezone.utc) - timedelta(days=31)
        db.commit()
        fid = fila.id
    finally:
        db.close()
    assert _papelera(client, admin)["sedes"] == []
    r = client.post(f"/api/layout/papelera/{fid}/restaurar", headers=admin)
    assert r.status_code == 409 and "Pasaron más de 30 días" in r.json()["detail"]["message"]
    db = SessionLocal()
    try:
        assert purgar(db) == 1
        assert db.query(SedeEnPapelera).count() == 0
    finally:
        db.close()


def test_la_papelera_es_de_administracion(client, worker):
    assert client.get("/api/layout/papelera", headers=worker).status_code == 403
    assert client.post("/api/layout/papelera/1/restaurar", headers=worker).status_code == 403
