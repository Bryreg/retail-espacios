"""Panel de plataforma: quién es operador y el interruptor de estado por cliente.

Mismo patrón que ``test_alta.py``/``test_identidad.py``: verificador falso vía
``dependency_overrides``, ``OPERADOR_EMAILS`` por ``monkeypatch`` (se lee en
cada llamada a propósito, sin tocar ningún caché), y todo ``import app.*``
ADENTRO de las funciones.
"""
from types import SimpleNamespace


class FakeVerificador:
    def __init__(self, mapa: dict):
        self.mapa = mapa

    def verificar(self, id_token):
        return self.mapa.get(id_token)


def _claims(uid, email, verificado=True, proveedor="google.com", nombre=None):
    return SimpleNamespace(
        uid=uid, email=email, email_verificado=verificado, proveedor=proveedor, nombre=nombre,
    )


def _usar_verificador(client, mapa: dict):
    from app.services.firebase_tokens import get_verificador
    client.app.dependency_overrides[get_verificador] = lambda: FakeVerificador(mapa)


def _cab(token):
    return {"Authorization": f"Bearer {token}"}


def _cuenta_con_sub(client, uid, email, slug, nombre):
    """Funda un cliente por el alta self-service y devuelve la cabecera de su
    owner — un token con ``sub``/``email``, como los que emite ``/oauth``."""
    _usar_verificador(client, {uid: _claims(uid, email)})
    # `acepta_politica` es obligatorio desde la Fase 3 (consentimiento
    # registrado) -- este archivo es de la Fase 2 y no la ataca, así que se
    # manda siempre en `True` para que la fundación llegue a "owner" como
    # antes de que esa regla existiera.
    r = client.post(
        "/api/clientes/alta",
        json={"id_token": uid, "slug": slug, "nombre": nombre, "acepta_politica": True},
    )
    assert r.status_code == 200, r.text
    return _cab(r.json()["token"])


def _operador(client, monkeypatch, uid="uid-op", email="op@plataforma.co",
              slug="conplataforma", nombre="Con Plataforma"):
    cab = _cuenta_con_sub(client, uid, email, slug, nombre)
    monkeypatch.setenv("OPERADOR_EMAILS", email)
    return cab


# ════════════════════════════════════════════════════════════════════════════
# GET /plataforma/soy
# ════════════════════════════════════════════════════════════════════════════

def test_soy_false_para_legado(client, admin):
    r = client.get("/api/plataforma/soy", headers=admin)
    assert r.status_code == 200
    assert r.json()["operador"] is False


def test_soy_false_para_cuenta_no_operadora(client, monkeypatch):
    monkeypatch.setenv("OPERADOR_EMAILS", "otro-que-no-es@x.co")
    cab = _cuenta_con_sub(client, "uid-no-op", "no-op@x.co", "noop", "No Op")
    r = client.get("/api/plataforma/soy", headers=cab)
    assert r.status_code == 200
    assert r.json()["operador"] is False


def test_soy_true_para_operador(client, monkeypatch):
    cab = _operador(client, monkeypatch)
    r = client.get("/api/plataforma/soy", headers=cab)
    assert r.status_code == 200
    assert r.json()["operador"] is True


# ════════════════════════════════════════════════════════════════════════════
# GET /plataforma/clientes
# ════════════════════════════════════════════════════════════════════════════

def test_get_clientes_403_para_no_operador_y_legado(client, admin, monkeypatch):
    monkeypatch.setenv("OPERADOR_EMAILS", "nadie-de-esto@x.co")
    cab = _cuenta_con_sub(client, "uid-x", "x@x.co", "xslug", "X")

    assert client.get("/api/plataforma/clientes", headers=cab).status_code == 403
    r_legado = client.get("/api/plataforma/clientes", headers=admin)
    assert r_legado.status_code == 403


def test_get_clientes_200_con_estados_para_operador(client, monkeypatch):
    cab = _operador(client, monkeypatch)  # funda "conplataforma" de paso

    r = client.get("/api/plataforma/clientes", headers=cab)
    assert r.status_code == 200, r.text
    filas = {c["slug"]: c for c in r.json()["clientes"]}

    assert "galerias" in filas
    assert filas["galerias"]["estado"] == "activo"
    assert filas["galerias"]["motivo"] is None
    assert filas["galerias"]["cambiado_por"] is None

    assert "conplataforma" in filas
    assert filas["conplataforma"]["activo"] is True
    assert filas["conplataforma"]["estado"] == "activo"


# ════════════════════════════════════════════════════════════════════════════
# PATCH /plataforma/clientes/{slug}
# ════════════════════════════════════════════════════════════════════════════

def test_patch_estado_invalido_da_422(client, monkeypatch):
    cab = _operador(client, monkeypatch)
    r = client.patch("/api/plataforma/clientes/galerias", json={"estado": "vip", "motivo": "x"}, headers=cab)
    assert r.status_code == 422


def test_patch_motivo_vacio_da_422(client, monkeypatch):
    cab = _operador(client, monkeypatch)
    r = client.patch("/api/plataforma/clientes/galerias", json={"estado": "gracia", "motivo": "   "}, headers=cab)
    assert r.status_code == 422


def test_patch_slug_inexistente_da_404(client, monkeypatch):
    cab = _operador(client, monkeypatch)
    r = client.patch("/api/plataforma/clientes/no-existe", json={"estado": "gracia", "motivo": "x"}, headers=cab)
    assert r.status_code == 404


def test_patch_requiere_operador(client, admin, monkeypatch):
    monkeypatch.setenv("OPERADOR_EMAILS", "nadie-de-esto@x.co")
    r = client.patch("/api/plataforma/clientes/galerias", json={"estado": "gracia", "motivo": "x"}, headers=admin)
    assert r.status_code == 403


def test_patch_upsert_con_cambiado_por(client, monkeypatch):
    cab = _operador(client, monkeypatch, email="op2@plataforma.co")
    r = client.patch(
        "/api/plataforma/clientes/galerias",
        json={"estado": "solo_lectura", "motivo": "pago pendiente"},
        headers=cab,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["slug"] == "galerias"
    assert body["estado"] == "solo_lectura"
    assert body["motivo"] == "pago pendiente"
    assert body["cambiado_por"] == "op2@plataforma.co"
    assert body["cambiado_en"] is not None

    listado = client.get("/api/plataforma/clientes", headers=cab).json()["clientes"]
    fila = next(c for c in listado if c["slug"] == "galerias")
    assert fila["estado"] == "solo_lectura"
    assert fila["motivo"] == "pago pendiente"
    assert fila["cambiado_por"] == "op2@plataforma.co"


def test_patch_estado_activo_deja_fila(client, monkeypatch):
    """Aunque el estado final sea "activo", la fila queda como constancia del
    último cambio -- no se borra."""
    cab = _operador(client, monkeypatch, email="op3@plataforma.co")
    client.patch(
        "/api/plataforma/clientes/galerias",
        json={"estado": "suspendido", "motivo": "impago"},
        headers=cab,
    )
    r = client.patch(
        "/api/plataforma/clientes/galerias",
        json={"estado": "activo", "motivo": "puso al día el pago"},
        headers=cab,
    )
    assert r.status_code == 200, r.text
    assert r.json()["estado"] == "activo"
    assert r.json()["motivo"] == "puso al día el pago"
    assert r.json()["cambiado_por"] == "op3@plataforma.co"

    listado = client.get("/api/plataforma/clientes", headers=cab).json()["clientes"]
    fila = next(c for c in listado if c["slug"] == "galerias")
    assert fila["estado"] == "activo"
    assert fila["motivo"] == "puso al día el pago"
    assert fila["cambiado_por"] == "op3@plataforma.co"


def test_invalidar_cache_estado_se_llama_tras_el_patch(client, monkeypatch):
    """El PATCH invalida el cache de 60s -- una lectura inmediata de
    ``estado_de`` ya ve el cambio, sin esperar el TTL."""
    from app.plataforma_estado import estado_de, limpiar_cache_estado

    limpiar_cache_estado()
    cab = _operador(client, monkeypatch, email="op4@plataforma.co")
    assert estado_de("galerias") == ("activo", None)

    r = client.patch(
        "/api/plataforma/clientes/galerias",
        json={"estado": "gracia", "motivo": "recordatorio de pago"},
        headers=cab,
    )
    assert r.status_code == 200, r.text
    assert estado_de("galerias") == ("gracia", "recordatorio de pago")
    limpiar_cache_estado()
