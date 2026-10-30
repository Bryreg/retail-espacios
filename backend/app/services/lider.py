"""Una sola vuelta de mantenimiento a la vez, con una o con N instancias
(auditoría P1-5).

El mantenimiento lo pueden disparar dos cosas: el hilo de la app —al arrancar
y cada 12 horas, mientras el servicio está despierto— y el cron de GitHub
(`POST /api/interno/mantenimiento`), que corre a hora fija y de paso lo
despierta. Y el día que haya más de una instancia, cada una tiene su hilo. Sin
candado, dos vueltas a la vez mandarían dos veces el mismo recordatorio.

El candado es un **advisory lock de Postgres de sesión**, tomado sin esperar
(`pg_try_advisory_lock`) en la base del registro, que comparten todas las
instancias: quien no lo consigue no espera, se retira y lo dice en el log. Se
suelta al terminar (`pg_advisory_unlock`) o, si el proceso muere, cuando se
cierra su conexión.

En SQLite no hay advisory locks: alcanza con el candado del proceso, porque
SQLite es una sola máquina y un solo proceso (desarrollo y pruebas). Ese
candado de proceso corre también en Postgres, adelante del de la base: el hilo
y el endpoint de la misma instancia no llegan ni a pedirle nada a Postgres.
"""
from __future__ import annotations

import contextlib
import hashlib
import logging
import threading
from typing import Iterator

from sqlalchemy import text

log = logging.getLogger("recabra.lider")

_locales: dict[str, threading.Lock] = {}
_locales_candado = threading.Lock()


def clave(nombre: str) -> int:
    """El número del advisory lock de ese nombre (64 bits con signo)."""
    return int.from_bytes(hashlib.sha256(f"recabra:{nombre}".encode()).digest()[:8], "big", signed=True)


def _local(nombre: str) -> threading.Lock:
    with _locales_candado:
        return _locales.setdefault(nombre, threading.Lock())


@contextlib.contextmanager
def ser_lider(nombre: str, motor=None) -> Iterator[bool]:
    """``with ser_lider("mantenimiento") as soy:`` — ``soy`` dice si esta
    vuelta tiene el candado. Si es ``False``, otra vuelta está corriendo (acá o
    en otra instancia) y ésta no hace nada."""
    if motor is None:
        from app.database import engine as motor

    local = _local(nombre)
    if not local.acquire(blocking=False):
        yield False
        return
    try:
        if motor.dialect.name != "postgresql":
            yield True
            return
        k = clave(nombre)
        cx = motor.connect()
        try:
            tengo = bool(cx.execute(text("SELECT pg_try_advisory_lock(:k)"), {"k": k}).scalar())
            # Que la conexión no quede «idle in transaction» mientras dura la
            # vuelta: el candado es de SESIÓN y sobrevive al commit.
            cx.commit()
            try:
                yield tengo
            finally:
                if tengo:
                    try:
                        cx.execute(text("SELECT pg_advisory_unlock(:k)"), {"k": k})
                        cx.commit()
                    except Exception:  # noqa: BLE001
                        # Si no se pudo soltar, cerrar la conexión lo suelta:
                        # se invalida para que el pool no la reuse con el
                        # candado puesto.
                        log.warning("No se pudo soltar el candado %s; se descarta la conexión", nombre)
                        cx.invalidate()
        finally:
            cx.close()
    finally:
        local.release()
