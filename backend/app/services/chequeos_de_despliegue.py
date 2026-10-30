"""Lo que antes había que correr a mano antes de desplegar (auditoría P2-8).

`scripts/buscar_codigos_pc.py` decía «correr ANTES de desplegar»: un mueble o
una fila de `spaces` que se llame `…-PC<n>` se lee como una participación de
otro mueble, y su contrato cuenta como la cara entera de ése. Correrlo pedía la
consola de Render (plan pago) o una base restaurada, así que en la práctica no
se corría.

Ahora lo corre el mantenimiento, en cada vuelta y por cada supermercado, con la
MISMA función que el script (`buscar`): sólo lee. Si encuentra algo, una línea
WARNING por supermercado con cuántos muebles y espacios hay que renombrar (la
renumeración del plano lo hace sin perder nada). Sin hallazgos no dice nada.
"""
from __future__ import annotations

import logging

log = logging.getLogger("recabra.chequeos")


def codigos_pc(db, slug: str) -> int:
    """Cuántas cosas hay que renombrar en la base de ese cliente."""
    try:
        from scripts.buscar_codigos_pc import buscar
    except ImportError:  # el directorio `scripts/` no está en el camino
        return 0
    hallado = buscar(db)
    muebles, espacios = hallado["muebles"], hallado["espacios"]
    total = len(muebles) + len(espacios)
    if total:
        log.warning(
            "Cliente %s: %d mueble(s) del plano y %d espacio(s) con un código que se lee como "
            "participación (…-PC<n>): %s. Renombralos con la renumeración del plano "
            "(ver scripts/buscar_codigos_pc.py).",
            slug, len(muebles), len(espacios),
            ", ".join([c for _s, c, _r in muebles][:10] + [c for c, _s, _v in espacios][:10]),
        )
    return total
