"""Test harness for the API.

Every test gets a throwaway SQLite file. The environment has to be set before
``app.database`` is imported, because it builds the engine from ``DATABASE_URL``
at module level — so nothing from ``app`` may be imported at the top of this
file.

Las contraseñas ya no vienen escritas en el código: una instalación nueva las
toma de ADMIN_PASSWORD / WORKER_PASSWORD o se inventa uno al azar. Los tests
son una instalación nueva en cada prueba, así que las fijan por el entorno —
que es exactamente el camino que va a usar un supermercado al desplegar.
"""

import os
import tempfile

import pytest

# Las de siempre, para no tocar los tests que ya las usan escritas.
CLAVE_ADMIN = "admin123"
CLAVE_WORKER = "galerias"


@pytest.fixture()
def client():
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    os.environ["DATABASE_URL"] = f"sqlite:///{path}"
    os.environ["JWT_SECRET"] = "test-secret"
    os.environ["ENV"] = "test"
    os.environ["ADMIN_PASSWORD"] = CLAVE_ADMIN
    os.environ["WORKER_PASSWORD"] = CLAVE_WORKER

    # Imported here, and purged afterwards, so each test builds a fresh engine
    # bound to its own file instead of sharing the first test's database.
    import app.database  # noqa: F401
    from fastapi.testclient import TestClient
    from app.main import app as fastapi_app

    with TestClient(fastapi_app) as c:
        yield c

    # Soltar los motores antes de purgar los módulos: cada cliente abre el suyo,
    # y una prueba que deje conexiones abiertas contra un archivo borrado hace
    # fallar a la siguiente por un motivo que no tiene nada que ver.
    try:
        from app.clientes import olvidar_motores
        olvidar_motores()
    except Exception:
        pass

    import sys
    for name in [m for m in sys.modules if m == "app" or m.startswith("app.")]:
        del sys.modules[name]
    os.unlink(path)
    # Las bases de los clientes que haya creado la prueba son archivos hermanos.
    import glob
    carpeta = os.path.dirname(path)
    for extra in glob.glob(os.path.join(carpeta, "recabra_*.db")):
        try:
            os.unlink(extra)
        except OSError:
            pass


def _token(client, password: str) -> str:
    r = client.post("/api/auth/login", json={"password": password})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture()
def admin(client):
    """Authorization header for the default admin."""
    return {"Authorization": f"Bearer {_token(client, CLAVE_ADMIN)}"}


@pytest.fixture()
def worker(client):
    """Authorization header for the default worker."""
    return {"Authorization": f"Bearer {_token(client, CLAVE_WORKER)}"}
