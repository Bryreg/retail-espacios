"""Alembic, sólo aditivo, en N bases (auditoría P1-8).

**La regla de siempre sigue**: el esquema se escribe en los modelos y
`create_all` crea lo que falta. Lo que cambia es que ahora hay con qué hacer lo
que `create_all` no hace —una columna o un índice en una tabla que ya existe—
sin tocar las bases a mano: una migración en `migraciones/versions/`, que sólo
puede AGREGAR (`tests/test_migraciones.py` rechaza borrar, renombrar o cambiar
el tipo de algo).

**Cada base, por su cuenta.** El registro (la base por defecto) y la base de
cada supermercado tienen su propia `alembic_version`. `preparar_base`:

1. mira si la base ya tenía tablas y si ya tenía versión;
2. `create_all` (las tablas nuevas, como siempre);
3. sin versión: una base NUEVA (no tenía ninguna tabla) nació entera de
   `create_all` y se sella en la última revisión; una que YA EXISTÍA se sella
   en la línea base (`0001_linea_base`, «lo que había»);
4. `upgrade head`: corre lo que le falte.

Todo en UNA transacción por base (en Postgres el DDL es transaccional): si una
migración falla, esa base queda como estaba y el error sube.

**Cuándo corre.** Al arrancar la app, antes de atender (`main.lifespan`), bajo
un advisory lock de Postgres en el registro: con dos instancias arrancando a la
vez, una migra y la otra espera. El `preDeployCommand` de Render es de los
planes pagos; cuando se pase a uno, `python -m app.migraciones` hace lo mismo
como paso previo al despliegue (ver `render.yaml`) y el arranque encuentra
todo al día.

Los motores de acá no llevan `statement_timeout` (`app/database.py`): un
`CREATE INDEX` sobre una tabla grande puede pasar de 30 s, y cortarlo a la mitad
dejaría el despliegue a medias.
"""
from __future__ import annotations

import contextlib
import logging
import threading
import time
from pathlib import Path
from typing import Iterator

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.pool import NullPool

log = logging.getLogger("recabra.migraciones")

CARPETA = Path(__file__).resolve().parents[1] / "migraciones"
LINEA_BASE = "0001_linea_base"
#: Cuánto espera una instancia a que otra termine de migrar antes de rendirse.
ESPERA_MAXIMA_S = 300

# Los proxies `alembic.context` y `alembic.op` son globales del proceso: dos
# hilos migrando a la vez (el alta de un cliente y el reintento de uno
# degradado) se pisarían. Una migración a la vez por proceso.
_candado_proceso = threading.RLock()


def _registrar_modelos() -> None:
    """Que `Base.metadata` conozca todas las tablas y los índices agregados."""
    import app.models.models  # noqa: F401
    import app.models.indices  # noqa: F401
    import app.models.correos  # noqa: F401


def _config(conexion=None):
    from alembic.config import Config

    from app.database import Base

    cfg = Config()
    cfg.set_main_option("script_location", str(CARPETA))
    cfg.attributes["connection"] = conexion
    cfg.attributes["metadata"] = Base.metadata
    return cfg


def cabeza() -> str:
    """La última revisión."""
    from alembic.script import ScriptDirectory

    return ScriptDirectory.from_config(_config()).get_current_head()


def version_de(conexion) -> str | None:
    from alembic.runtime.migration import MigrationContext

    return MigrationContext.configure(conexion).get_current_revision()


def _motor(url: str):
    if url.startswith("sqlite"):
        return create_engine(url, connect_args={"check_same_thread": False}, poolclass=NullPool)
    return create_engine(url, poolclass=NullPool)


def url_de_motor(motor) -> str:
    return motor.url.render_as_string(hide_password=False)


def preparar_base(url: str) -> str:
    """Deja la base de `url` con todas las tablas y en la última revisión.
    Devuelve qué hizo: ``"nueva"``, ``"sellada"`` (ya existía, sin versión),
    ``"migrada"`` o ``"al_dia"``."""
    from alembic import command

    from app.database import Base

    _registrar_modelos()
    with _candado_proceso:
        motor = _motor(url)
        try:
            with motor.begin() as cx:
                tablas = set(inspect(cx).get_table_names()) - {"alembic_version"}
                antes = version_de(cx)
                Base.metadata.create_all(bind=cx)
                cfg = _config(cx)
                if antes is None and not tablas:
                    command.stamp(cfg, "head")
                    return "nueva"
                if antes is None:
                    command.stamp(cfg, LINEA_BASE)
                command.upgrade(cfg, "head")
                despues = version_de(cx)
            if antes is None:
                log.warning("Base %s sellada en la línea base y llevada a %s", _nombre(url), despues)
                return "sellada"
            if antes != despues:
                log.warning("Base %s migrada: %s -> %s", _nombre(url), antes, despues)
                return "migrada"
            return "al_dia"
        finally:
            motor.dispose()


def _nombre(url: str) -> str:
    """El nombre de la base, sin usuario ni clave, para el log."""
    return url.rsplit("/", 1)[-1].split("?", 1)[0]


@contextlib.contextmanager
def candado_de_migracion() -> Iterator[None]:
    """Una sola instancia migra a la vez (advisory lock de sesión en el
    registro). En SQLite, sólo el candado del proceso."""
    from app.database import SQLALCHEMY_DATABASE_URL
    from app.services.lider import clave

    with _candado_proceso:
        if SQLALCHEMY_DATABASE_URL.startswith("sqlite"):
            yield
            return
        motor = _motor(SQLALCHEMY_DATABASE_URL)
        cx = motor.connect()
        k = clave("migraciones")
        try:
            limite = time.monotonic() + ESPERA_MAXIMA_S
            avisado = False
            while not cx.execute(text("SELECT pg_try_advisory_lock(:k)"), {"k": k}).scalar():
                cx.commit()
                if time.monotonic() > limite:
                    raise RuntimeError("Otra instancia lleva más de 5 minutos migrando; no se arranca.")
                if not avisado:
                    log.warning("Otra instancia está migrando las bases; se espera a que termine")
                    avisado = True
                time.sleep(1)
            cx.commit()
            try:
                yield
            finally:
                cx.execute(text("SELECT pg_advisory_unlock(:k)"), {"k": k})
                cx.commit()
        finally:
            cx.close()
            motor.dispose()


def agregar_columna_si_falta(tabla: str, columna) -> None:
    """Para una migración que agrega una columna (`sa.Column(...)`, que acepte
    NULL o traiga `server_default`). Si la tabla nació de `create_all` después
    de que la columna ya estaba en el modelo, la columna ya está y no se toca."""
    from alembic import op

    reales = {c["name"] for c in inspect(op.get_bind()).get_columns(tabla)}
    if columna.name not in reales:
        op.add_column(tabla, columna)


def migrar_todas() -> dict[str, str]:
    """El registro y cada cliente (activos y archivados: un archivado que se
    reactive tiene que encontrar su base al día). Para la consola y el
    `preDeployCommand`. Devuelve ``{base: lo que hizo}``; si una falla, sigue
    con las demás y al final levanta."""
    from app.clientes import listar, motor_de, registrar_el_de_siempre
    from app.database import SQLALCHEMY_DATABASE_URL

    hechos: dict[str, str] = {}
    fallas: list[str] = []
    with candado_de_migracion():
        hechos[_nombre(SQLALCHEMY_DATABASE_URL)] = preparar_base(SQLALCHEMY_DATABASE_URL)
        registrar_el_de_siempre()
        for cliente in listar(solo_activos=False):
            if cliente.db_name in hechos:
                continue  # el de siempre vive en la base del registro: ya está
            try:
                hechos[cliente.db_name] = preparar_base(url_de_motor(motor_de(cliente)))
            except Exception:  # noqa: BLE001
                log.exception("No se pudo migrar la base del cliente %s", cliente.slug)
                # Un archivado con la base rota no frena el despliegue de los
                # activos: se migra al reactivarlo (`preparar_esquema`).
                if cliente.activo:
                    fallas.append(cliente.slug)
    if fallas:
        raise RuntimeError(f"Fallaron {len(fallas)} bases: {', '.join(fallas)}")
    return hechos


if __name__ == "__main__":  # python -m app.migraciones
    import app.main  # noqa: F401 — todas las tablas registradas
    from app.observabilidad import configurar_logging

    configurar_logging()
    for base, hecho in migrar_todas().items():
        print(f"{base}: {hecho}")
