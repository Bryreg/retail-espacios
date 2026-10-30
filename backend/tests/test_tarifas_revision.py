"""Las tarifas de referencia: gana la primera escritura, no la última
(auditoría P2-17). Como el layout y los settings: quien manda la revisión que
leyó (`base_updated_at`) escribe sólo si nadie guardó después; si no, 409
`rates_conflict`."""


def test_dos_pestanas_no_se_pisan_las_tarifas(client, admin):
    leido = client.get("/api/layout/rates", headers=admin).json()
    assert leido["updated_at"] is None
    # Primera vez: la base es «nunca se guardaron».
    a = client.put("/api/layout/rates", headers=admin,
                   json={"default": {"punta": 600_000}, "by_sede": {}, "base_updated_at": None})
    assert a.status_code == 200, a.text
    # La otra pestaña leyó antes (también «nunca»): 409, y no pisa.
    b = client.put("/api/layout/rates", headers=admin,
                   json={"default": {"punta": 1}, "by_sede": {}, "base_updated_at": None})
    assert b.status_code == 409, b.text
    assert b.json()["detail"]["code"] == "rates_conflict"
    assert "Otra persona cambió las tarifas" in b.json()["detail"]["message"]
    assert b.json()["detail"]["server_updated_at"][:23] == a.json()["updated_at"][:23]
    assert client.get("/api/layout/rates", headers=admin).json()["default"] == {"punta": 600_000}
    # Con la revisión de ahora, sí.
    c = client.put("/api/layout/rates", headers=admin,
                   json={"default": {"punta": 650_000}, "by_sede": {}, "base_updated_at": a.json()["updated_at"]})
    assert c.status_code == 200, c.text
    assert client.get("/api/layout/rates", headers=admin).json()["default"] == {"punta": 650_000}
    # Una revisión vieja, otra vez 409.
    d = client.put("/api/layout/rates", headers=admin,
                   json={"default": {"punta": 2}, "by_sede": {}, "base_updated_at": a.json()["updated_at"]})
    assert d.status_code == 409


def test_sin_revision_escribe_como_antes(client, admin):
    """Un cliente que no manda la revisión (los guiones de consola) escribe
    como siempre: la pantalla la manda siempre."""
    assert client.put("/api/layout/rates", headers=admin, json={"default": {"punta": 1}, "by_sede": {}}).status_code == 200
    assert client.put("/api/layout/rates", headers=admin, json={"default": {"punta": 2}, "by_sede": {}}).status_code == 200


def test_la_pantalla_manda_la_revision_y_avisa_el_conflicto():
    """El navegador manda lo que leyó y, ante el 409, trae lo de la otra
    persona y lo dice (`store/fixtureStore.ts`)."""
    from pathlib import Path

    raiz = Path(__file__).resolve().parents[2] / "frontend" / "src"
    api = (raiz / "api" / "layout.ts").read_text(encoding="utf-8")
    store = (raiz / "store" / "fixtureStore.ts").read_text(encoding="utf-8")
    assert "base_updated_at: base" in api
    assert "saveReferenceRates(rates, _revisionDeTarifas)" in store
    assert '"rates_conflict"' in store and "Otra persona cambió las tarifas" in store
