"""El entorno de Alembic.

Dos maneras de llegar acá:

· **Desde la app** (`app/migraciones.py`): trae la conexión abierta, adentro de
  una transacción, en ``config.attributes["connection"]``. Es lo normal: el
  arranque migra el registro y cada base de cliente, una por una.
· **Desde la línea de comandos** (`alembic …` en `backend/`): sin conexión; se
  conecta a ``DATABASE_URL`` —una sola base— y carga los modelos para que
  ``alembic revision --autogenerate`` tenga contra qué comparar. Lo que
  autogenere hay que leerlo: la prueba de «sólo aditivo» rechaza cualquier
  borrado o renombre (``tests/test_migraciones.py``).
"""
from alembic import context
from sqlalchemy import create_engine
from sqlalchemy.pool import NullPool

config = context.config


def _metadatos():
    metadatos = config.attributes.get("metadata")
    if metadatos is not None:
        return metadatos
    import app.main  # noqa: F401 — registra todas las tablas
    from app.database import Base

    return Base.metadata


def _correr(conexion) -> None:
    context.configure(
        connection=conexion,
        target_metadata=_metadatos(),
        # SQLite no sabe ALTER de verdad: Alembic recrea la tabla. Sólo para
        # desarrollo y pruebas; producción es Postgres.
        render_as_batch=conexion.dialect.name == "sqlite",
        compare_type=False,
    )
    with context.begin_transaction():
        context.run_migrations()


conexion = config.attributes.get("connection")
if conexion is not None:
    _correr(conexion)
else:
    from app.database import SQLALCHEMY_DATABASE_URL

    motor = create_engine(SQLALCHEMY_DATABASE_URL, poolclass=NullPool)
    with motor.begin() as cx:
        _correr(cx)
    motor.dispose()
