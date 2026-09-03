"""Lo que un worker NO puede leer, aunque el rol tenga acceso al endpoint.

Tres fugas distintas, cerradas todas del lado del servidor (nunca confiando
en que el formulario del cliente "no muestre" el campo — un cliente viejo, o
una llamada directa a la API, lo seguirían pidiendo igual):

1. **PII del proveedor** (CONFLICTO-2 / H1): ``GET /api/suppliers/``,
   ``GET /api/suppliers/{id}`` y el ``supplier`` anidado en
   ``active_lease``/``upcoming_lease`` de ``SpaceOut`` traían email, teléfono,
   nombre de contacto y notas a cualquier rol autenticado. Ahora sólo admin
   los ve; para cualquier otro rol esas CUATRO claves quedan AUSENTES —nunca
   ``null``— vía ``SupplierPublicOut``.

2. **Nota del contrato** (CONFLICTO-3 / H2, mitad A): ``lease.notes`` viajaba
   sin redactar aunque ``monthly_rent`` sí se anulaba. Es el mismo dinero con
   otra forma: "descuento del 25% cerrado por teléfono" no es un número en
   ``monthly_rent``, pero dice exactamente lo mismo.

3. **Observación del fixture** (CONFLICTO-3 / H2, mitad B): el JSON del plano
   ya tachaba ``negotiatedValue`` en las tres profundidades (fixture, faceB,
   slots) para no-admin, pero dejaba pasar ``observation`` — el mismo texto
   libre que un negociador usa para anotar lo que no entra en un campo con
   nombre.

Las tres comparten la cadena que usó el auditor para probarlas: si aparece en
la respuesta de un worker, algo se filtró.
"""
from app.auth import create_mount_token

SONDA = "descuento del 25% cerrado por telefono"

FIXTURES_CON_OBSERVACION = [
    {
        "id": "g1", "code": "GON-01", "sede": "NAVE", "type": "gondola",
        "gondolaType": "double",
        "label": "Góndola 1", "cx": 3, "cz": 8, "rotY": 0,
        "w": 0.9, "d": 4.0, "h": 1.8, "color": "#94a3b8",
        "observation": f"{SONDA} — top",
        "faceB": {"observation": f"{SONDA} — faceB"},
        "slots": [{"id": "s1", "observation": f"{SONDA} — slot"}],
    },
]


def _montaje_token(code="NAVE-PUN-04"):
    return create_mount_token(code)


def _plano(client, admin, sede="NAVE", fixtures=None):
    r = client.put(
        f"/api/layout/{sede}",
        json={"fixtures": fixtures if fixtures is not None else [], "base_updated_at": None},
        headers=admin,
    )
    assert r.status_code == 200, r.text


def _proveedor(client, admin, **campos):
    payload = {
        "name": "Alpina", "contact_name": "Juan Pérez", "phone": "3001234567",
        "email": "juan@alpina.co", "notes": "cliente difícil, pide siempre descuento",
        **campos,
    }
    r = client.post("/api/suppliers/", json=payload, headers=admin)
    assert r.status_code == 201, r.text
    return r.json()


def _espacio(client, admin, code="NAVE-PUN-04"):
    r = client.post(
        "/api/spaces/find-or-create",
        json={"code": code, "name": code, "zone": "z", "sede": "NAVE", "area_m2": 1.0},
        headers=admin,
    )
    assert r.status_code == 200, r.text
    return r.json()


def _contrato(client, admin, space_id, supplier_id, notes=SONDA):
    r = client.post(
        f"/api/spaces/{space_id}/leases",
        json={
            "supplier_id": supplier_id, "start_date": "2026-01-01", "end_date": "2026-12-31",
            "monthly_rent": 1_000_000, "notes": notes,
        },
        headers=admin,
    )
    assert r.status_code == 201, r.text
    return r.json()


# ─── 1. PII del proveedor: GET /api/suppliers/ y /api/suppliers/{id} ───────


def test_admin_ve_todos_los_campos_del_proveedor(client, admin):
    prov = _proveedor(client, admin)
    r = client.get("/api/suppliers/", headers=admin)
    assert r.status_code == 200, r.text
    fila = next(f for f in r.json() if f["id"] == prov["id"])
    assert fila["email"] == "juan@alpina.co"
    assert fila["phone"] == "3001234567"
    assert fila["contact_name"] == "Juan Pérez"
    assert fila["notes"]

    r2 = client.get(f"/api/suppliers/{prov['id']}", headers=admin)
    assert r2.json()["email"] == "juan@alpina.co"


def test_worker_no_recibe_pii_del_proveedor_en_el_listado(client, admin, worker):
    prov = _proveedor(client, admin)
    r = client.get("/api/suppliers/", headers=worker)
    assert r.status_code == 200, r.text
    fila = next(f for f in r.json() if f["id"] == prov["id"])
    assert fila["name"] == "Alpina"
    for clave in ("email", "phone", "contact_name", "notes"):
        assert clave not in fila, f"'{clave}' no debería estar — ni en null"


def test_worker_no_recibe_pii_del_proveedor_por_id(client, admin, worker):
    prov = _proveedor(client, admin)
    r = client.get(f"/api/suppliers/{prov['id']}", headers=worker)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body == {"id": prov["id"], "name": "Alpina"}


def test_worker_no_recibe_pii_del_proveedor_anidado_en_el_espacio(client, admin, worker):
    """El mismo proveedor, visto a través de active_lease.supplier."""
    prov = _proveedor(client, admin)
    espacio = _espacio(client, admin)
    _contrato(client, admin, espacio["id"], prov["id"], notes=None)

    r = client.get("/api/spaces/by-code/NAVE-PUN-04", headers=worker)
    assert r.status_code == 200, r.text
    supplier = r.json()["active_lease"]["supplier"]
    assert supplier == {"id": prov["id"], "name": "Alpina"}

    # Admin, en cambio, sigue viendo todo.
    r_admin = client.get("/api/spaces/by-code/NAVE-PUN-04", headers=admin)
    supplier_admin = r_admin.json()["active_lease"]["supplier"]
    assert supplier_admin["email"] == "juan@alpina.co"


def test_token_de_montaje_401_en_suppliers(client, admin):
    prov = _proveedor(client, admin)
    cab = {"Authorization": f"Bearer {_montaje_token()}"}
    assert client.get("/api/suppliers/", headers=cab).status_code == 401
    assert client.get(f"/api/suppliers/{prov['id']}", headers=cab).status_code == 401


def test_sin_token_401_en_suppliers(client, admin):
    prov = _proveedor(client, admin)
    assert client.get("/api/suppliers/").status_code == 401
    assert client.get(f"/api/suppliers/{prov['id']}").status_code == 401


# ─── 2. Nota del contrato: GET /api/spaces/by-code/{code} ──────────────────


def test_admin_ve_la_nota_del_contrato(client, admin):
    prov = _proveedor(client, admin)
    espacio = _espacio(client, admin)
    _contrato(client, admin, espacio["id"], prov["id"])
    r = client.get("/api/spaces/by-code/NAVE-PUN-04", headers=admin)
    assert r.json()["active_lease"]["notes"] == SONDA


def test_worker_no_recibe_la_nota_del_contrato(client, admin, worker):
    prov = _proveedor(client, admin)
    espacio = _espacio(client, admin)
    _contrato(client, admin, espacio["id"], prov["id"])
    r = client.get("/api/spaces/by-code/NAVE-PUN-04", headers=worker)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["active_lease"]["notes"] is None
    assert SONDA not in r.text


# ─── 3. Observación del fixture: GET /api/layout/{sede} ────────────────────


def test_admin_ve_la_observacion_en_las_tres_profundidades(client, admin):
    _plano(client, admin, fixtures=FIXTURES_CON_OBSERVACION)
    r = client.get("/api/layout/NAVE", headers=admin)
    assert r.status_code == 200, r.text
    fixture = r.json()["fixtures"][0]
    assert fixture["observation"] == f"{SONDA} — top"
    assert fixture["faceB"]["observation"] == f"{SONDA} — faceB"
    assert fixture["slots"][0]["observation"] == f"{SONDA} — slot"


def test_worker_no_recibe_la_observacion_en_ninguna_profundidad(client, admin, worker):
    _plano(client, admin, fixtures=FIXTURES_CON_OBSERVACION)
    r = client.get("/api/layout/NAVE", headers=worker)
    assert r.status_code == 200, r.text
    fixture = r.json()["fixtures"][0]
    assert "observation" not in fixture
    assert "observation" not in fixture["faceB"]
    assert "observation" not in fixture["slots"][0]
    # La sonda del auditor: si el texto aparece en cualquier parte de la
    # respuesta, algo se filtró por un camino que este test no nombró.
    assert SONDA not in r.text
