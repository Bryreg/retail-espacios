"""Cuánto ocupa la instancia de Postgres, contra su cuota (auditoría P2-6).

Los archivos —documentos de contrato, fotos de montaje, planometrías, artes—
viven como blobs adentro de la base, y la base gratuita de Render tiene un tope
de 1 GB **para toda la instancia**: el registro y todas las bases de cliente
juntas. Pasado el tope, Render deja de aceptar escrituras y la app entera queda
de sólo lectura sin que nadie lo haya decidido.

El mantenimiento mide en cada vuelta y deja una línea en el log: WARNING desde
el 70 % de ``CUOTA_BASE_MB`` (1024 por defecto; poné el del plan contratado),
INFO por debajo. La consola del operador lo ve en ``GET /api/plataforma/salud``.

Lo que libera lugar de verdad es la limpieza de fotos de contratos terminados
(``services/fotos_vencidas.py``): apagada, sólo ensaya y deja en el log cuánto
borraría. Prenderla (``LIMPIAR_FOTOS_VENCIDAS=1``) después de leer ese ensayo:
ver ``docs/operacion.md``.
"""
from __future__ import annotations

import logging
import os
from pathlib import Path

from sqlalchemy import text

log = logging.getLogger("recabra.tamano")

UMBRAL_DE_AVISO = 0.70

#: La última medición (la consola la muestra sin volver a medir).
ultima: dict | None = None


def cuota_mb() -> int:
    try:
        return max(1, int(os.getenv("CUOTA_BASE_MB", "1024")))
    except ValueError:
        return 1024


def _bytes_sqlite() -> int:
    from app.database import SQLALCHEMY_DATABASE_URL

    archivo = Path(SQLALCHEMY_DATABASE_URL.replace("sqlite:///", "", 1))
    carpeta = archivo.parent
    total = archivo.stat().st_size if archivo.exists() else 0
    for otra in carpeta.glob("recabra_*.db"):
        total += otra.stat().st_size
    return total


def _bytes_postgres(motor) -> int:
    with motor.connect() as cx:
        return int(cx.execute(text(
            "SELECT COALESCE(SUM(pg_database_size(datname)), 0) FROM pg_database WHERE NOT datistemplate"
        )).scalar() or 0)


def medir(motor=None) -> dict:
    """``{"bytes", "mb", "cuota_mb", "uso", "alerta"}``: lo ocupado por TODA la
    instancia (todas las bases) y la parte de la cuota."""
    global ultima
    if motor is None:
        from app.database import engine as motor
    ocupado = _bytes_postgres(motor) if motor.dialect.name == "postgresql" else _bytes_sqlite()
    cuota = cuota_mb()
    uso = ocupado / (cuota * 1024 * 1024)
    ultima = {
        "bytes": ocupado,
        "mb": round(ocupado / (1024 * 1024), 1),
        "cuota_mb": cuota,
        "uso": round(uso, 4),
        "alerta": uso >= UMBRAL_DE_AVISO,
    }
    return ultima


def revisar(motor=None) -> dict:
    """Mide y lo deja en el log. Nunca levanta (lo llama el mantenimiento)."""
    try:
        m = medir(motor)
    except Exception:  # noqa: BLE001
        log.warning("No se pudo medir el tamaño de la base", exc_info=True)
        return {}
    if m["alerta"]:
        log.warning(
            "La base ocupa %.1f MB: %d %% de la cuota de %d MB (CUOTA_BASE_MB). Pasado el tope, "
            "Render deja de aceptar escrituras. Ver docs/operacion.md, «La base se llena».",
            m["mb"], round(m["uso"] * 100), m["cuota_mb"],
        )
    else:
        log.info("La base ocupa %.1f MB (%d %% de %d MB)", m["mb"], round(m["uso"] * 100), m["cuota_mb"])
    return m
