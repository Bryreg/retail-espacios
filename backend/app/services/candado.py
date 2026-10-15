"""El candado: dos sesiones no venden la misma nevera a la vez.

Con la venta por partes, el choque ya no es «el mismo código»: la nevera
entera (``NEV-03``) y su puerta 2 (``NEV-03-PU2``) son dos filas distintas de
``spaces`` —la de la puerta puede ni existir todavía— y las dos revisan antes
de escribir. Sin candado, dos sesiones que confirman al mismo tiempo pasan
las dos la revisión y la nevera queda vendida entera Y por puertas.

El candado es POR MUEBLE (``SEDE-CODIGO``, sin cara ni parte): cubre las dos
caras, la entera y todas sus partes, y también el ``Space`` que todavía no
existe —por eso no alcanza un ``FOR UPDATE`` sobre ``spaces``—. Se toma
ORDENADO, así dos tandas con muebles cruzados no se traban entre sí, y es de
transacción (``pg_advisory_xact_lock``): se suelta solo en el ``commit`` o el
``rollback``.

En SQLite no hace nada: escribe un solo proceso. La prueba de dos hilos corre
contra un Postgres descartable (``tests/test_partes_concurrencia.py``).
"""
from __future__ import annotations

import hashlib
from typing import Iterable

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.services.partes import partir_codigo


def clave_de_candado(codigo: str) -> int:
    """El número del candado de un código: el de su mueble, sin cara ni parte.
    ``NAVE-NEV-03``, ``NAVE-NEV-03-B`` y ``NAVE-NEV-03-PU2`` dan el mismo."""
    base = partir_codigo(codigo).base
    return int.from_bytes(hashlib.sha256(base.encode("utf-8")).digest()[:8], "big", signed=True)


def claves_de_candado(codigos: Iterable[str]) -> list[int]:
    """Las claves de esos códigos, sin repetir y en orden: el orden es el mismo
    para todas las sesiones, y así ninguna espera a otra que la espera a ella."""
    return sorted({clave_de_candado(c) for c in codigos if c})


def tomar_candados(db: Session, codigos: Iterable[str]) -> list[int]:
    """Toma los candados de esos muebles hasta el fin de la transacción.
    Devuelve las claves (las pruebas miran el orden)."""
    claves = claves_de_candado(codigos)
    if db.get_bind().dialect.name != "postgresql":
        return claves
    for k in claves:
        db.execute(text("SELECT pg_advisory_xact_lock(:k)"), {"k": k})
    return claves
