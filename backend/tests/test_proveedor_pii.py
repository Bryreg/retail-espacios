"""Los datos de contacto del proveedor no salen de la administración.

`Supplier` guarda `contact_name`, `phone`, `email` y `notes`. Las dos rutas de
lectura sólo exigían sesión —no admin— así que **un mercaderista recibía los
datos de contacto de todos los proveedores del supermercado**. Son datos
personales de un tercero, con la Ley 1581 encima, y no le hacen falta para
nada: monta una exhibición, no llama a nadie.

Lo encontró la auditoría legal del PR #37 (hallazgo H1) y quedó sin cerrar
cuando ese PR se descartó. Estas pruebas usan su mismo método: una CANARIA —un
dato inventado e inconfundible— que se busca en el texto COMPLETO de la
respuesta, no campo por campo. Buscar campo por campo sólo encuentra las fugas
que uno ya sospecha.
"""

from app.fechas import hoy as hoy_en_colombia  # el «hoy» del negocio: Colombia

TELEFONO = "3009998877"
CORREO = "gerencia.secreta@proveedor-x.com"
CONTACTO = "Marta Secreta"
NOTA_PROV = "acepta descuento del 25% si se paga adelantado"

CANARIAS = [TELEFONO, CORREO, CONTACTO, NOTA_PROV]


def _crear(client, admin):
    r = client.post("/api/suppliers/", headers=admin, json={
        "name": "PROVEEDOR X", "contact_name": CONTACTO,
        "phone": TELEFONO, "email": CORREO, "notes": NOTA_PROV,
    })
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _sin_canarias(texto: str, quien: str):
    for c in CANARIAS:
        assert c not in texto, f"{quien} vio «{c}» — fuga de datos del proveedor"


# ─── La lista ────────────────────────────────────────────────────────────────

def test_UN_MERCADERISTA_NO_VE_EL_CONTACTO_DEL_PROVEEDOR(client, admin, worker):
    _crear(client, admin)

    r = client.get("/api/suppliers/", headers=worker)
    assert r.status_code == 200, r.text
    _sin_canarias(r.text, "el mercaderista")

    # Y sí ve lo que necesita: de quién es la exhibición que va a montar.
    fila = r.json()[0]
    assert fila["name"] == "PROVEEDOR X"
    assert set(fila) == {"id", "name"}, fila


def test_el_admin_sí_ve_todo(client, admin):
    _crear(client, admin)
    fila = client.get("/api/suppliers/", headers=admin).json()[0]
    assert fila["phone"] == TELEFONO
    assert fila["email"] == CORREO
    assert fila["contact_name"] == CONTACTO


def test_el_detalle_por_id_tambien_se_recorta(client, admin, worker):
    sid = _crear(client, admin)
    r = client.get(f"/api/suppliers/{sid}", headers=worker)
    assert r.status_code == 200, r.text
    _sin_canarias(r.text, "el mercaderista")
    assert set(r.json()) == {"id", "name"}
    # Y para el admin sigue entero.
    assert client.get(f"/api/suppliers/{sid}", headers=admin).json()["phone"] == TELEFONO


# ─── Anidado en un contrato ──────────────────────────────────────────────────

def _vender(client, admin, nota_contrato):
    """Un espacio con contrato del PROVEEDOR X, con nota propia."""
    espacio = client.post("/api/spaces/find-or-create", headers=admin, json={
        "code": "NAVE-PUN-01", "sede": "NAVE", "name": "PUN-01",
    }).json()
    sid = _crear(client, admin)
    from datetime import timedelta
    hoy = hoy_en_colombia()
    r = client.post(f"/api/spaces/{espacio['id']}/leases", headers=admin, json={
        "supplier_id": sid, "marca": "Aseo",
        "start_date": hoy.isoformat(),
        "end_date": (hoy + timedelta(days=30)).isoformat(),
        "monthly_rent": 1_000_000, "notes": nota_contrato,
    })
    assert r.status_code == 201, r.text
    return espacio["id"]


def test_EL_PROVEEDOR_ANIDADO_EN_EL_CONTRATO_TAMPOCO(client, admin, worker):
    """La rama que se olvida: el proveedor colgando de `space.active_lease`."""
    sid_espacio = _vender(client, admin, "sin nota")

    r = client.get(f"/api/spaces/{sid_espacio}", headers=worker)
    assert r.status_code == 200, r.text
    _sin_canarias(r.text, "el mercaderista")
    assert r.json()["active_lease"]["supplier"]["name"] == "PROVEEDOR X"


def test_NI_SIQUIERA_AL_ADMIN_le_cuelga_el_telefono_del_contrato(client, admin):
    """Anidado va SIEMPRE recortado, para todos los roles.

    No es desconfianza del admin —lo ve entero en `/suppliers/{id}`— es que una
    rama que nunca lleva el dato no lo puede filtrar aunque alguien se olvide de
    redactarla. El admin que necesita el teléfono lo pide donde corresponde.
    """
    sid_espacio = _vender(client, admin, "sin nota")
    lease = client.get(f"/api/spaces/{sid_espacio}", headers=admin).json()["active_lease"]
    assert set(lease["supplier"]) == {"id", "name"}, lease["supplier"]


def test_LA_NOTA_DEL_CONTRATO_NO_LE_LLEGA_AL_MERCADERISTA(client, admin, worker):
    """Tachar el número y dejar pasar la nota deja la plata fugándose en
    castellano: `notes` es texto libre."""
    canaria = "descuento del 25% cerrado por telefono"
    sid_espacio = _vender(client, admin, canaria)

    r = client.get(f"/api/spaces/{sid_espacio}", headers=worker)
    assert canaria not in r.text, "el mercaderista vio la nota del contrato"
    assert r.json()["active_lease"]["notes"] is None
    assert r.json()["active_lease"]["monthly_rent"] is None

    # El admin sí: es suya y la necesita.
    del_admin = client.get(f"/api/spaces/{sid_espacio}", headers=admin).json()["active_lease"]
    assert del_admin["notes"] == canaria
    assert del_admin["monthly_rent"] == 1_000_000


def test_por_codigo_y_por_svg_se_recortan_igual(client, admin, worker):
    """Las tres puertas de lectura de un espacio usan el mismo camino; si
    alguna se saltara la redacción, la fuga volvería por ahí."""
    _vender(client, admin, "descuento del 25% cerrado por telefono")
    for ruta in ("/api/spaces/by-code/NAVE-PUN-01", "/api/spaces/"):
        r = client.get(ruta, headers=worker)
        assert r.status_code == 200, (ruta, r.text)
        _sin_canarias(r.text, f"el mercaderista en {ruta}")
        assert "descuento del 25%" not in r.text, ruta
