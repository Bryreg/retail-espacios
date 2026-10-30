import os

from fastapi import Request
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

_raw_url = os.getenv("DATABASE_URL", "sqlite:///./retail_espacios.db")
# Render provides "postgres://" but SQLAlchemy 2.0+ requires "postgresql://"
SQLALCHEMY_DATABASE_URL = _raw_url.replace("postgres://", "postgresql://", 1) if _raw_url.startswith("postgres://") else _raw_url



def segundos_de_tope() -> int:
    """El tope de cada consulta en Postgres, en segundos (`STATEMENT_TIMEOUT_S`,
    30 por defecto; 0 lo apaga). Auditoría P2-10.

    Corre un solo worker: una consulta que se cuelga —las métricas de todas las
    bases, la copia ZIP de un supermercado grande— dejaba a todos los demás
    esperando detrás. Con el tope, la consulta lenta falla sola y el resto sigue.
    """
    try:
        return max(0, int(os.getenv("STATEMENT_TIMEOUT_S", "30")))
    except ValueError:
        return 30


def argumentos_de_conexion(url: str) -> dict:
    """Los `connect_args` de un motor: los mismos para la base por defecto y la
    de cada cliente (`clientes.motor_de`).

    · SQLite: `check_same_thread` (el hilo de mantenimiento y los pedidos
      comparten el motor). No tiene `statement_timeout`: no se le pasa nada más.
    · Postgres: `statement_timeout`, que viaja en el arranque de cada conexión
      (`options=-c …`), así ninguna sesión puede olvidárselo.
    """
    if url.startswith("sqlite"):
        return {"check_same_thread": False}
    tope = segundos_de_tope()
    if tope <= 0:
        return {}
    return {"options": f"-c statement_timeout={tope * 1000}"}


def argumentos_de_pool(url: str) -> dict:
    """`pool_pre_ping` y `pool_recycle` para Postgres (auditoría P1-7).

    Render corta las conexiones quietas: sin esto, el primer pedido después de
    una noche sin uso salía con «server closed the connection unexpectedly» —un
    500—. Los motores de cliente ya lo tenían; el de la base por defecto
    (registro + GALERIAS), que es el que más se usa, no.
    """
    if url.startswith("sqlite"):
        return {}
    return {"pool_pre_ping": True, "pool_recycle": 1800}


engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args=argumentos_de_conexion(SQLALCHEMY_DATABASE_URL),
    **argumentos_de_pool(SQLALCHEMY_DATABASE_URL),
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db(request: Request):
    """La sesión de la base del supermercado que está pidiendo.

    Éste es el único punto por el que pasan todos los endpoints, y por eso
    separar clientes se pudo hacer sin tocar los doce routers: acá se decide
    contra qué base corre la consulta, y de ahí en adelante nadie más elige.

    El import va adentro a propósito — `app.clientes` importa este módulo, así
    que arriba sería un ciclo.
    """
    from app.clientes import sesion_para_pedido

    db = sesion_para_pedido(request)
    try:
        yield db
    finally:
        db.close()
