import os

from fastapi import Request
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

_raw_url = os.getenv("DATABASE_URL", "sqlite:///./retail_espacios.db")
# Render provides "postgres://" but SQLAlchemy 2.0+ requires "postgresql://"
SQLALCHEMY_DATABASE_URL = _raw_url.replace("postgres://", "postgresql://", 1) if _raw_url.startswith("postgres://") else _raw_url

# check_same_thread is SQLite-only; PostgreSQL doesn't accept it
_connect_args = {"check_same_thread": False} if SQLALCHEMY_DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args=_connect_args)
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
