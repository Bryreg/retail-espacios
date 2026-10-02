"""El acceso por clave compartida, apagado por defecto (2026-10-01).

Pregunta del dueño, mirando «Claves de acceso» en Configuración: «ahora que el
acceso se da por correo electrónico, ¿esto sigue siendo necesario?». No: desde
la Fase 15 la pantalla sólo ofrece Google o correo. Lo que esas claves seguían
abriendo era `POST /api/auth/login`, vivo para esta suite — y como cada
supermercado fundado por el alta nace con las claves de `ADMIN_PASSWORD` /
`WORKER_PASSWORD`, y el endpoint acepta el `cliente` de quien sea, quien supiera
esa clave entraba como administrador a cualquiera.

`conftest.py` prende `LOGIN_LEGADO=1` para el resto de la suite; acá se apaga.
"""
from types import SimpleNamespace

from conftest import CLAVE_ADMIN


class FakeVerificador:
    def __init__(self, mapa: dict):
        self.mapa = mapa

    def verificar(self, id_token):
        return self.mapa.get(id_token)


def _claims(uid, email):
    return SimpleNamespace(uid=uid, email=email, email_verificado=True, proveedor="google.com", nombre=None)


def _usar_verificador(client, mapa: dict):
    from app.services.firebase_tokens import get_verificador
    client.app.dependency_overrides[get_verificador] = lambda: FakeVerificador(mapa)


def _fundar(client, uid, email, slug, nombre):
    _usar_verificador(client, {uid: _claims(uid, email)})
    r = client.post(
        "/api/clientes/alta",
        json={"id_token": uid, "slug": slug, "nombre": nombre, "acepta_politica": True},
    )
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def test_apagado_no_se_entra_por_clave_ni_se_cuentan_intentos(client, monkeypatch):
    from app.clientes import sesion_registro
    from app.models.models import LoginAttempt

    monkeypatch.delenv("LOGIN_LEGADO", raising=False)
    for cuerpo in (
        {"password": CLAVE_ADMIN},
        {"password": CLAVE_ADMIN, "cliente": "galerias"},
        {"password": "una-que-no-es"},
        {},
    ):
        r = client.post("/api/auth/login", json=cuerpo)
        assert r.status_code == 410, (cuerpo, r.status_code)
        assert "Google" in r.json()["detail"]

    reg = sesion_registro()
    try:
        assert reg.query(LoginAttempt).count() == 0, "no hay nada que adivinar: no se cuenta nada"
    finally:
        reg.close()


def test_un_supermercado_del_alta_ya_no_se_abre_con_la_clave_compartida(client, monkeypatch):
    """El agujero que esto cierra: el alta le pone a cada supermercado nuevo la
    clave de ADMIN_PASSWORD, y el login legado aceptaba el `cliente` de quien
    fuera."""
    _fundar(client, "uid-n", "duenia@nuevo.co", "nuevo", "Nuevo")
    intento = {"password": CLAVE_ADMIN, "cliente": "nuevo"}

    # Prendido (la emergencia), la clave del entorno abre el supermercado ajeno.
    assert client.post("/api/auth/login", json=intento).status_code == 200

    monkeypatch.delenv("LOGIN_LEGADO", raising=False)
    assert client.post("/api/auth/login", json=intento).status_code == 410


def test_apagado_tampoco_se_cambian_las_claves(client, admin, monkeypatch):
    monkeypatch.delenv("LOGIN_LEGADO", raising=False)
    r = client.put("/api/auth/passwords", json={"admin_password": "una-clave-nueva-larga"}, headers=admin)
    assert r.status_code == 410

    # Y la clave no cambió: al prenderlo de nuevo, la de siempre sigue entrando.
    monkeypatch.setenv("LOGIN_LEGADO", "1")
    assert client.post("/api/auth/login", json={"password": CLAVE_ADMIN}).status_code == 200


def test_la_cuenta_individual_entra_igual(client, monkeypatch):
    monkeypatch.delenv("LOGIN_LEGADO", raising=False)
    cab = _fundar(client, "uid-d", "duenia@tienda.co", "tienda", "Tienda")
    assert client.get("/api/spaces/", headers=cab).status_code == 200

    _usar_verificador(client, {"uid-d": _claims("uid-d", "duenia@tienda.co")})
    r = client.post("/api/auth/oauth", json={"id_token": "uid-d", "acepta_politica": True})
    assert r.status_code == 200, r.text
    assert r.json()["cliente"] == "tienda"


def test_el_interruptor_se_lee_en_cada_pedido(client, monkeypatch):
    monkeypatch.setenv("LOGIN_LEGADO", "0")
    assert client.post("/api/auth/login", json={"password": CLAVE_ADMIN}).status_code == 410
    monkeypatch.setenv("LOGIN_LEGADO", "1")
    assert client.post("/api/auth/login", json={"password": CLAVE_ADMIN}).status_code == 200


def _claves_guardadas(slug):
    from app.auth import CLAVES, get_config
    from app.clientes import buscar, sesion_de

    db = sesion_de(buscar(slug))
    try:
        return {rol: (get_config(db, k_hash) or get_config(db, k_plano))
                for rol, (k_hash, k_plano) in CLAVES.items()}
    finally:
        db.close()


def test_apagado_un_supermercado_nuevo_nace_sin_claves_compartidas(client, monkeypatch):
    """Con el ingreso por clave apagado, una clave compartida no abre nada:
    no se le crea una a cada supermercado del alta (2026-10-02)."""
    monkeypatch.delenv("LOGIN_LEGADO", raising=False)
    _fundar(client, "uid-z", "duenia@zeta.co", "zeta", "Zeta")
    assert _claves_guardadas("zeta") == {"admin": None, "worker": None}

    # Prender el interruptor después tampoco lo abre con la clave del entorno.
    monkeypatch.setenv("LOGIN_LEGADO", "1")
    r = client.post("/api/auth/login", json={"password": CLAVE_ADMIN, "cliente": "zeta"})
    assert r.status_code == 401


def test_nunca_se_inventa_una_clave_al_azar_para_el_registro(client, monkeypatch, caplog):
    """Antes, sin ADMIN_PASSWORD/WORKER_PASSWORD, se generaba una al azar y se
    escribía EN CLARO en el registro de Render. Ahora el rol queda sin clave."""
    import logging

    monkeypatch.delenv("ADMIN_PASSWORD", raising=False)
    monkeypatch.delenv("WORKER_PASSWORD", raising=False)
    with caplog.at_level(logging.INFO, logger="recabra.auth"):
        _fundar(client, "uid-w", "duenia@wuu.co", "wuu", "Wuu")
    assert _claves_guardadas("wuu") == {"admin": None, "worker": None}
    assert "queda sin clave" in caplog.text
    assert "al azar" not in caplog.text
