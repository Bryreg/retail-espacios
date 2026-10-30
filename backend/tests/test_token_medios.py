"""P2-1 de la auditoría pre-lanzamiento: el JWT de sesión ya no viaja en la URL.

Lo que va por ``?token=`` (``<img>``, ``<iframe>``, texturas del 3D) es un
token de medios: 15 minutos, pedido con la sesión en la cabecera, y que no abre
ninguna ruta que no sea de ver archivos — ni siquiera por cabecera.
"""
import jwt

# app.auth se importa adentro de cada prueba: el entorno (JWT_SECRET, ENV) lo
# arma la fixture del conftest.
TTL = 15 * 60


def _sesion(admin):
    return admin["Authorization"].split(" ", 1)[1]


def _medios(client, admin):
    r = client.post("/api/auth/token-medios", headers=admin)
    assert r.status_code == 200, r.text
    assert r.json()["vence_en"] == TTL
    return r.json()["token"]


def test_la_sesion_por_query_ya_no_entra(client, admin):
    r = client.get(f"/api/files/999999?token={_sesion(admin)}")
    assert r.status_code == 401


def test_el_token_de_medios_abre_los_archivos(client, admin):
    med = _medios(client, admin)
    # 404: pasó la autenticación y el archivo no existe.
    assert client.get(f"/api/files/999999?token={med}").status_code == 404
    assert client.get(f"/api/catalogo/999999/imagen?token={med}").status_code == 404


def test_el_token_de_medios_no_sirve_como_sesion(client, admin):
    med = _medios(client, admin)
    assert client.get("/api/spaces/", headers={"Authorization": f"Bearer {med}"}).status_code == 401
    # Ni para pedir otro token de medios (no se encadena).
    assert client.post("/api/auth/token-medios", headers={"Authorization": f"Bearer {med}"}).status_code == 401
    # Ni por query en una ruta que no es de archivos.
    assert client.get(f"/api/clientes/mi-export?token={med}").status_code in (401, 403)


def test_el_token_de_medios_dura_poco_y_conserva_quien_es(client, admin):
    import time

    from app.auth import JWT_ALGORITHM, JWT_SECRET

    med = _medios(client, admin)
    p = jwt.decode(med, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    s = jwt.decode(_sesion(admin), JWT_SECRET, algorithms=[JWT_ALGORITHM])
    assert p["uso"] == "medios"
    assert p["role"] == s["role"]
    assert p.get("epoca") == s.get("epoca")
    assert p.get("cliente") == s.get("cliente")
    assert p["exp"] <= time.time() + TTL + 5


def test_sin_sesion_no_hay_token_de_medios(client):
    assert client.post("/api/auth/token-medios").status_code == 401


# ─── P2-2: «Salir» cierra el token en el servidor ────────────────────────────

def test_salir_cierra_esta_sesion_y_su_token_de_medios(client):
    from conftest import CLAVE_ADMIN

    a = client.post("/api/auth/login", json={"password": CLAVE_ADMIN}).json()["token"]
    b = client.post("/api/auth/login", json={"password": CLAVE_ADMIN}).json()["token"]
    cab_a = {"Authorization": f"Bearer {a}"}
    med = client.post("/api/auth/token-medios", headers=cab_a).json()["token"]
    assert client.get("/api/spaces/", headers=cab_a).status_code == 200

    assert client.post("/api/auth/logout", headers=cab_a).status_code == 204

    assert client.get("/api/spaces/", headers=cab_a).status_code == 401
    assert client.get(f"/api/files/999999?token={med}").status_code == 401
    # La otra sesión de la misma clave sigue abierta.
    assert client.get("/api/spaces/", headers={"Authorization": f"Bearer {b}"}).status_code == 200


def test_la_sesion_cerrada_queda_anotada_en_la_base(client):
    """El cierre sobrevive a un reinicio: queda en `sesiones_cerradas`."""
    from conftest import CLAVE_ADMIN

    a = client.post("/api/auth/login", json={"password": CLAVE_ADMIN}).json()["token"]
    client.post("/api/auth/logout", headers={"Authorization": f"Bearer {a}"})

    import app.auth as auth
    from app.clientes import sesion_registro
    from app.models.plataforma import SesionCerrada

    reg = sesion_registro()
    try:
        assert reg.query(SesionCerrada).count() == 1
    finally:
        reg.close()
    # Proceso nuevo: la memoria vacía se vuelve a llenar desde la tabla.
    auth._cerradas.clear()
    auth._cerradas_cargadas = False
    assert client.get("/api/spaces/", headers={"Authorization": f"Bearer {a}"}).status_code == 401


def test_salir_sin_sesion_es_401(client):
    assert client.post("/api/auth/logout").status_code == 401
