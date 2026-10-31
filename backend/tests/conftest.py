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

import contextlib
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
    with app_de_prueba() as c:
        yield c


@contextlib.contextmanager
def app_de_prueba():
    """Levanta la app contra una base SQLite propia y, al salir, la baja y la
    olvida: motores, módulos ``app.*``, cachés de librerías y archivos. Es el
    cuerpo del fixture ``client``; ``test_suite_sin_fuga.py`` la usa a mano."""
    # Una CARPETA propia por prueba, no un archivo suelto en el temporal común:
    # las bases de los clientes que la prueba dé de alta son archivos HERMANOS
    # de ésta (`<carpeta>/recabra_<slug>.db`, ver `clientes.url_para`), y con
    # todas las pruebas en el mismo `/tmp` dos procesos en paralelo (`pytest -n`)
    # se pisaban `recabra_acme.db` —«attempt to write a readonly database»—.
    # Auditoría P3-12.
    carpeta = tempfile.mkdtemp(prefix="recabra-prueba-")
    # Y antes de armar nada, fuera los `app.*` que haya dejado una prueba SIN
    # este fixture (una que importa `app.services.guia` suelto): se crearon con
    # el `DATABASE_URL` de la prueba anterior, cuya carpeta ya no existe, y su
    # motor apuntaría ahí. Con el `/tmp` común esa base vieja se recreaba sola
    # y la prueba corría, sin saberlo, contra otra base.
    import sys

    for name in [m for m in sys.modules if m == "app" or m.startswith("app.")]:
        del sys.modules[name]
    path = os.path.join(carpeta, "retail.db")
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
    # Y que la clave compartida se siembre también en los supermercados que la
    # suite funda (en producción sólo va en la base de siempre: P1-11).
    os.environ["LOGIN_LEGADO_TODOS"] = "1"

    # Imported here, and purged afterwards, so each test builds a fresh engine
    # bound to its own file instead of sharing the first test's database.
    # La limpieza va en el `finally`: si el arranque falla, o si quien usa esto
    # a mano levanta una excepción adentro del `with`, la prueba siguiente no
    # puede heredar la app ni la base de esta.
    try:
        import app.database  # noqa: F401
        from fastapi.testclient import TestClient
        from app.main import app as fastapi_app

        with TestClient(fastapi_app) as c:
            yield c
    finally:
        # Soltar los motores antes de purgar los módulos: cada cliente abre el
        # suyo, y una prueba que deje conexiones abiertas contra un archivo
        # borrado hace fallar a la siguiente por un motivo que no tiene nada
        # que ver.
        try:
            from app.clientes import olvidar_motores
            olvidar_motores()
        except Exception:
            pass

        import sys
        for name in [m for m in sys.modules if m == "app" or m.startswith("app.")]:
            del sys.modules[name]
        soltar_la_app_vieja()
        # La base de la prueba y las de los clientes que haya creado viven en
        # su carpeta: se va entera.
        import shutil
        shutil.rmtree(carpeta, ignore_errors=True)


def soltar_la_app_vieja() -> None:
    """Corta las referencias que tres librerías guardan a la app de la prueba
    que terminó, para que la purga de ``sys.modules`` la libere de verdad.

    Cada prueba importa la app entera de nuevo: modelos, rutas, esquemas. Sacar
    los módulos de ``sys.modules`` no alcanza si algo de afuera sigue apuntando
    a sus clases o funciones, y tres cosas apuntaban:

    · ``JoinCondition._track_overlapping_sync_targets`` de SQLAlchemy: un
      ``WeakKeyDictionary`` cuyos valores apuntan a su propia clave (columna →
      mapper → relación), así que ninguna entrada muere nunca. Sin tope: cada
      prueba dejaba ~7 MB, la suite llegaba a varios GB, el runner de GitHub
      entraba en swap y el proceso tardaba más de un cuarto de hora en salir
      después del 100 % liberando decenas de millones de objetos.
    · los cachés de ``typing`` (``Optional[Space]``, ``list[Proveedor]``…):
      128 entradas por función, con las clases de las últimas pruebas.
    · los tres ``lru_cache`` de 4096 de ``fastapi.dependencies.models``, con
      las funciones de las rutas de las últimas pruebas.

    Los tres son internos de cada librería: si una versión nueva los mueve, la
    limpieza no rompe nada (se saltea) y ``test_suite_sin_fuga.py`` avisa que
    la fuga volvió.
    """
    import typing

    for limpiar in getattr(typing, "_cleanups", ()):
        limpiar()
    try:
        import fastapi.dependencies.models as modelos_de_fastapi
    except ImportError:
        pass
    else:
        for valor in list(vars(modelos_de_fastapi).values()):
            if callable(getattr(valor, "cache_clear", None)):
                valor.cache_clear()
    try:
        from sqlalchemy.orm.relationships import JoinCondition

        JoinCondition._track_overlapping_sync_targets.clear()
    except (ImportError, AttributeError):
        pass


def esperar_mantenimiento() -> None:
    """Espera a que termine la pasada de mantenimiento que el arranque de la
    app lanza en un hilo (vencimientos, recordatorios, cierre del mes, la
    escalera de cobranza).

    Ese hilo corre A LA PAR de la prueba. Con la máquina cargada termina tarde
    y se cruza con lo que la prueba mide: el cierre del mes escribe snapshots
    entre el «antes» y el «después» de un conteo, o importa un módulo mientras
    la prueba recorre ``sys.modules`` («dictionary changed size during
    iteration»). Así cayeron T-05 y T-08 de ``test_tendencia_ataques.py`` el
    2026-10-13, con tres suites corriendo a la vez. Una prueba que cuenta lo que
    la app escribe, o que toca ``sys.modules``, llama a esto primero.
    """
    import time

    import app.main as main

    limite = time.monotonic() + 5
    while main._mantenimiento_en_vuelo is None and time.monotonic() < limite:
        time.sleep(0.02)
    limite = time.monotonic() + 60
    while main._mantenimiento_en_vuelo is not None and not main._mantenimiento_en_vuelo.done():
        assert time.monotonic() < limite, "la pasada de mantenimiento del arranque no terminó"
        time.sleep(0.02)


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


def medios(token: str) -> str:
    """El token de medios de una sesión: lo único que viaja por ``?token=``
    desde la auditoría pre-lanzamiento (P2-1). El JWT de sesión por query ya
    no entra."""
    from app.auth import crear_token_de_medios

    t = crear_token_de_medios(token)
    assert t is not None, "la sesión no es válida para pedir un token de medios"
    return t


def fin_de_un_mes(desde):
    """El «hasta» de un contrato de UN mes que arranca en ``desde``, con la
    regla de ``services/meses.py`` (un mes calendario menos un día). No
    ``desde + 30 días``: arrancando un 31, treinta días después es «un mes y un
    día» (31 oct → 30 nov), y las pruebas que comparan el valor al mes fallaban
    los días 31."""
    from datetime import timedelta

    from app.services.meses import _sumar_meses

    return _sumar_meses(desde, 1) - timedelta(days=1)
