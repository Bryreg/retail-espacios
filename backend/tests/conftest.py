"""Test harness for the API.

Every test gets a throwaway SQLite file. The environment has to be set before
``app.database`` is imported, because it builds the engine from ``DATABASE_URL``
at module level — so nothing from ``app`` may be imported at the top of this
file. La única excepción en las pruebas es ``app.fechas`` (el día de Colombia):
no arma motor ni lee variables, así que las pruebas la importan arriba.

Las claves compartidas ya no vienen escritas en el código: con el ingreso por
clave prendido (`LOGIN_LEGADO`, apagado en producción desde el 2026-10-01) se
toman de ADMIN_PASSWORD / WORKER_PASSWORD. La suite arma sus sesiones con ese
ingreso, así que el fixture `client` prende el interruptor y fija las claves.
"""

import os
import tempfile

import pytest

# Las de siempre, para no tocar los tests que ya las usan escritas.
CLAVE_ADMIN = "admin123"
CLAVE_WORKER = "galerias"

# Para los archivos cuyos datos son de septiembre de 2026 y que lo piden por la
# API (`?periodo=2026-09`): corren con el reloj en ese mes. La consola sólo deja
# consultar los últimos 24 meses (`plataforma_metricas.ventana_de_periodos`), y
# con el reloj de verdad esas pruebas empezarían a recibir 422 el 2028-10-01.
# El mediodía del 15 queda lejos de los dos bordes del mes en cualquier huso.
SEPTIEMBRE_DE_2026 = pytest.mark.reloj("2026-09-15T12:00:00+00:00")


def pytest_addoption(parser):
    parser.addoption(
        "--reloj", metavar="MOMENTO", default=None,
        help="corre toda la suite con el reloj del proceso en MOMENTO (ISO 8601, "
             "p. ej. 2028-10-01T00:00:05+00:00): ninguna prueba puede depender "
             "del día en que se corre, y así se comprueba antes de que llegue.",
    )


_viaje_de_la_suite = None


def pytest_configure(config):
    config.addinivalue_line(
        "markers",
        "reloj(momento): la prueba corre con el reloj del proceso en `momento` "
        "(ISO 8601); desde ahí sigue andando.",
    )
    global _viaje_de_la_suite
    momento = config.getoption("--reloj")
    if momento:
        import time_machine

        _viaje_de_la_suite = time_machine.travel(momento, tick=True)
        _viaje_de_la_suite.start()


def pytest_unconfigure(config):
    if _viaje_de_la_suite is not None:
        _viaje_de_la_suite.stop()


@pytest.fixture(autouse=True)
def _reloj(request):
    """Mueve el reloj de TODO el proceso —la app, su hilo de mantenimiento, los
    JWT— al momento de la marca ``reloj``, si la prueba la tiene.

    Es autouse para que corra antes que ``client``: el arranque de la app cierra
    el mes anterior, y tiene que cerrar el del mismo calendario que la prueba.
    ``test_reloj.py`` lo vigila.
    """
    marca = request.node.get_closest_marker("reloj")
    if marca is None:
        yield
        return
    import time_machine

    with time_machine.travel(marca.args[0], tick=True):
        yield


@pytest.fixture()
def client():
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    os.environ["DATABASE_URL"] = f"sqlite:///{path}"
    os.environ["JWT_SECRET"] = "test-secret"
    os.environ["ENV"] = "test"
    os.environ["ADMIN_PASSWORD"] = CLAVE_ADMIN
    os.environ["WORKER_PASSWORD"] = CLAVE_WORKER
    # El acceso por clave compartida está apagado por defecto desde 2026-10-01
    # (`routers/auth.py::exigir_login_legado`), pero toda la suite arma sus
    # sesiones con él sin montar Firebase. `test_login_legado.py` prueba el
    # apagado sacando esta variable.
    os.environ["LOGIN_LEGADO"] = "1"

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


class RutaPlana:
    """Lo que los tests necesitan de una ruta: ``path`` completo y ``methods``."""

    def __init__(self, path: str, methods):
        self.path = path
        self.methods = set(methods or ())

    def __repr__(self) -> str:
        return f"RutaPlana({self.path!r}, {sorted(self.methods)!r})"


def rutas_planas(app) -> list:
    """Todas las rutas de la app, en ORDEN de declaración, con el path completo.

    Desde FastAPI 0.141 / Starlette 1.x ``include_router`` deja en
    ``app.routes`` un ``_IncludedRouter`` sin ``path`` ni ``methods``: las
    rutas reales viven en ``original_router.routes`` y el prefijo del
    ``include`` está aparte, en ``include_context.prefix``. Los tests que
    recorrían ``app.routes`` por atributos pasaban a barrer cero rutas — y a
    pasar en verde sin comprobar nada. Este helper aplana recursivamente y
    conserva el orden, que es lo que los tests de "literal antes de
    paramétrica" necesitan.
    """
    salida: list = []

    def _caminar(rutas, prefijo: str) -> None:
        for r in rutas:
            original = getattr(r, "original_router", None)
            if original is not None:
                contexto = getattr(r, "include_context", None)
                extra = getattr(contexto, "prefix", "") or ""
                _caminar(original.routes, prefijo + extra)
                continue
            path = getattr(r, "path", None)
            if path is None:
                continue
            salida.append(RutaPlana(prefijo + path, getattr(r, "methods", None)))

    _caminar(app.routes, "")
    return salida
