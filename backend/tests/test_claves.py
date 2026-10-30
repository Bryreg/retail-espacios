"""Las contraseñas: cómo se guardan, cómo migran y cuándo dejan de valer.

Las cuatro cosas que se prueban acá venían de la auditoría, y las cuatro se
verificaron fallando contra el código anterior antes de escribir el arreglo:

* la contraseña estaba en `app_config` en texto plano;
* la instalación nueva arrancaba con `admin123` / `galerias`, publicadas en el
  repositorio;
* el freno de intentos vivía en memoria y se borraba en cada despliegue;
* cambiar la contraseña no cerraba ninguna sesión.
"""
from datetime import datetime, timedelta, timezone

from conftest import CLAVE_ADMIN, CLAVE_WORKER


def _config(clave):
    from app.database import SessionLocal
    from app.models.models import AppConfig
    db = SessionLocal()
    try:
        fila = db.query(AppConfig).filter(AppConfig.key == clave).first()
        return fila.value if fila else None
    finally:
        db.close()


def _poner_config(clave, valor):
    from app.database import SessionLocal
    from app.models.models import AppConfig
    db = SessionLocal()
    try:
        fila = db.query(AppConfig).filter(AppConfig.key == clave).first()
        if fila:
            fila.value = valor
        else:
            db.add(AppConfig(key=clave, value=valor))
        db.commit()
    finally:
        db.close()


def _borrar_config(*claves):
    from app.database import SessionLocal
    from app.models.models import AppConfig
    db = SessionLocal()
    try:
        db.query(AppConfig).filter(AppConfig.key.in_(claves)).delete(synchronize_session=False)
        db.commit()
    finally:
        db.close()


# ─── Cómo queda guardada ──────────────────────────────────────────────────────

def test_la_clave_no_queda_en_texto_plano(client):
    """Un volcado de la base no puede entregar la contraseña."""
    assert _config("admin_password") is None
    assert _config("worker_password") is None

    guardado = _config("admin_password_hash")
    assert guardado is not None
    assert guardado.startswith("$argon2id$")
    assert CLAVE_ADMIN not in guardado


def test_entra_con_la_clave_del_entorno(client):
    """ADMIN_PASSWORD es el camino de una instalación nueva."""
    r = client.post("/api/auth/login", json={"password": CLAVE_ADMIN})
    assert r.status_code == 200, r.text
    assert r.json()["role"] == "admin"

    r = client.post("/api/auth/login", json={"password": CLAVE_WORKER})
    assert r.status_code == 200, r.text
    assert r.json()["role"] == "worker"


def test_la_clave_heredada_migra_sola(client):
    """La instalación que ya está viva no se puede quedar afuera.

    En producción la contraseña de los mercaderistas está en texto plano desde
    hace meses. Si el arreglo pidiera un paso manual, alguien se quedaría sin
    entrar el lunes: la migración tiene que pasar sola en el primer ingreso.
    """
    _borrar_config("worker_password_hash")
    _poner_config("worker_password", "la-de-siempre")

    r = client.post("/api/auth/login", json={"password": "la-de-siempre"})
    assert r.status_code == 200, r.text
    assert r.json()["role"] == "worker"

    # Y en el mismo movimiento dejó de estar en claro.
    assert _config("worker_password") is None
    assert (_config("worker_password_hash") or "").startswith("$argon2id$")

    # La siguiente vez entra contra el hash, no contra el texto.
    assert client.post("/api/auth/login", json={"password": "la-de-siempre"}).status_code == 200


def test_la_clave_equivocada_no_entra(client):
    r = client.post("/api/auth/login", json={"password": "no-es-esta"})
    assert r.status_code == 401


# ─── El freno de intentos ─────────────────────────────────────────────────────

def _intentar(client, clave, ip="200.1.2.3"):
    return client.post(
        "/api/auth/login",
        json={"password": clave},
        headers={"X-Forwarded-For": ip},
    )


def test_diez_fallos_y_se_cierra(client):
    for _ in range(10):
        assert _intentar(client, "mala").status_code == 401
    # El once ya no llega ni a comparar: la clave BUENA también rebota.
    assert _intentar(client, CLAVE_ADMIN).status_code == 429


def test_el_freno_es_por_ip(client):
    for _ in range(10):
        _intentar(client, "mala", ip="200.1.2.3")
    assert _intentar(client, CLAVE_ADMIN, ip="200.1.2.3").status_code == 429
    # Otro supermercado, desde otra conexión, sigue entrando.
    assert _intentar(client, CLAVE_ADMIN, ip="181.50.60.70").status_code == 200


def test_no_se_puede_esquivar_el_freno_inventando_el_encabezado(client):
    """El principio de X-Forwarded-For lo escribe el cliente; el final, el proxy.

    Si se leyera de izquierda a derecha, bastaría con cambiar esa primera IP en
    cada intento para tener intentos infinitos.
    """
    for i in range(10):
        r = client.post(
            "/api/auth/login",
            json={"password": "mala"},
            headers={"X-Forwarded-For": f"10.0.0.{i}, 200.1.2.3"},
        )
        assert r.status_code == 401
    r = client.post(
        "/api/auth/login",
        json={"password": CLAVE_ADMIN},
        headers={"X-Forwarded-For": "10.0.0.99, 200.1.2.3"},
    )
    assert r.status_code == 429


def test_los_intentos_quedan_en_la_base(client):
    """En memoria se borraban con cada despliegue; Render reinicia solo."""
    from app.database import SessionLocal
    from app.models.models import LoginAttempt

    for _ in range(3):
        _intentar(client, "mala")

    db = SessionLocal()
    try:
        assert db.query(LoginAttempt).filter(LoginAttempt.ip == "200.1.2.3").count() == 3
    finally:
        db.close()


def test_entrar_bien_borra_la_cuenta(client):
    for _ in range(9):
        assert _intentar(client, "mala").status_code == 401
    assert _intentar(client, CLAVE_ADMIN).status_code == 200
    # Vuelve a tener los diez intentos: quien se equivoca no queda marcado.
    for _ in range(9):
        assert _intentar(client, "mala").status_code == 401
    assert _intentar(client, CLAVE_ADMIN).status_code == 200


def test_los_intentos_viejos_no_cuentan(client):
    """La ventana son quince minutos, no para siempre."""
    from app.database import SessionLocal
    from app.models.models import LoginAttempt

    for _ in range(10):
        _intentar(client, "mala")
    assert _intentar(client, CLAVE_ADMIN).status_code == 429

    db = SessionLocal()
    try:
        viejo = datetime.now(timezone.utc) - timedelta(hours=1)
        for fila in db.query(LoginAttempt).all():
            fila.at = viejo
        db.commit()
    finally:
        db.close()

    assert _intentar(client, CLAVE_ADMIN).status_code == 200


# ─── Cambiar la contraseña ────────────────────────────────────────────────────

def test_cambiar_la_clave_del_worker_cierra_sus_sesiones(client, admin, worker):
    """Se cambia la contraseña justo para sacar a alguien."""
    assert client.get("/api/spaces/comercial", headers=worker).status_code == 200

    r = client.put("/api/auth/passwords", json={"worker_password": "otra-clave-larga"}, headers=admin)
    assert r.status_code == 200, r.text

    # El token que tenía en la mano deja de valer, sin esperar las 12 horas.
    assert client.get("/api/spaces/comercial", headers=worker).status_code == 401
    # Y el admin, que no cambió la suya, sigue adentro.
    assert client.get("/api/spaces/comercial", headers=admin).status_code == 200

    r = client.post("/api/auth/login", json={"password": "otra-clave-larga"})
    assert r.status_code == 200
    assert r.json()["role"] == "worker"
    assert client.post("/api/auth/login", json={"password": CLAVE_WORKER}).status_code == 401


def test_el_admin_no_se_echa_a_si_mismo(client, admin):
    """Cambiar la propia contraseña cierra las sesiones de admin —la suya
    incluida—, así que la respuesta trae un token nuevo para no dejarlo afuera
    de la pantalla en la que acaba de guardar."""
    r = client.put("/api/auth/passwords", json={"admin_password": "clave-nueva-admin"}, headers=admin)
    assert r.status_code == 200, r.text
    nuevo = r.json()["token"]
    assert nuevo

    # El viejo murió.
    assert client.get("/api/spaces/comercial", headers=admin).status_code == 401
    # El nuevo sirve.
    assert client.get(
        "/api/spaces/comercial", headers={"Authorization": f"Bearer {nuevo}"}
    ).status_code == 200


def test_cambiar_la_del_worker_no_devuelve_token(client, admin):
    r = client.put("/api/auth/passwords", json={"worker_password": "otra-clave-larga"}, headers=admin)
    assert r.status_code == 200
    assert r.json()["token"] is None


def test_la_clave_nueva_tiene_un_largo_minimo(client, admin):
    r = client.put("/api/auth/passwords", json={"admin_password": "corta"}, headers=admin)
    assert r.status_code == 422
    # Y no quedó a medias: la vieja sigue sirviendo.
    assert client.post("/api/auth/login", json={"password": CLAVE_ADMIN}).status_code == 200


def test_si_la_segunda_no_pasa_no_se_cambia_ninguna(client, admin):
    """Escribir la primera y rechazar la segunda dejaría media configuración."""
    r = client.put(
        "/api/auth/passwords",
        json={"admin_password": "clave-nueva-admin", "worker_password": "x"},
        headers=admin,
    )
    assert r.status_code == 422
    assert client.post("/api/auth/login", json={"password": CLAVE_ADMIN}).status_code == 200
    assert client.post("/api/auth/login", json={"password": "clave-nueva-admin"}).status_code == 401


def test_el_worker_no_puede_cambiar_claves(client, worker):
    r = client.put("/api/auth/passwords", json={"worker_password": "otra-clave-larga"}, headers=worker)
    assert r.status_code == 403


def test_la_clave_heredada_con_tilde_tambien_migra(client):
    """`compare_digest` con cadenas exige ASCII: una eñe la hace reventar.

    La contraseña de una tienda colombiana puede tener perfectamente una tilde,
    y ahí el error no sería "clave incorrecta" sino un 500 — nadie entra y nadie
    entiende por qué.
    """
    _borrar_config("worker_password_hash")
    _poner_config("worker_password", "señora-galerías")

    r = client.post("/api/auth/login", json={"password": "señora-galerías"})
    assert r.status_code == 200, r.text
    assert r.json()["role"] == "worker"
    assert _config("worker_password") is None


def test_un_hash_ilegible_no_tumba_el_login(client):
    """`InvalidHashError` hereda de `ValueError`, no de `Argon2Error`.

    Si no se atrapa aparte, un hash roto en `app_config` —un respaldo a medias,
    alguien editando la tabla a mano— convierte el login en un 500 para todo el
    mundo, en vez de un "contraseña incorrecta" para ese rol.
    """
    _poner_config("admin_password_hash", "esto-no-es-un-hash")
    _borrar_config("admin_password")

    r = client.post("/api/auth/login", json={"password": CLAVE_ADMIN})
    assert r.status_code == 401, r.text
    # Y el otro rol sigue entrando: se rompió una fila, no el sistema.
    assert client.post("/api/auth/login", json={"password": CLAVE_WORKER}).status_code == 200


def test_cambiar_la_clave_no_mata_el_enlace_del_mercaderista(client, admin):
    """El token de montaje no muere con la contraseña, y tiene que ser así.

    Ese enlace sale por correo al firmar el contrato y la exhibición se arma en
    los días siguientes. Si rotar la clave del panel apagara los enlaces ya
    enviados, la mercaderista llegaría a la tienda con un enlace muerto y nadie
    sabría por qué.
    """
    from app.auth import create_mount_token

    t = create_mount_token("NAVE-PUN-04")
    antes = client.get(f"/api/montaje/mi-espacio?token={t}").status_code
    assert antes != 401

    r = client.put(
        "/api/auth/passwords",
        json={"admin_password": "clave-nueva-admin", "worker_password": "clave-nueva-worker"},
        headers=admin,
    )
    assert r.status_code == 200, r.text

    assert client.get(f"/api/montaje/mi-espacio?token={t}").status_code == antes
