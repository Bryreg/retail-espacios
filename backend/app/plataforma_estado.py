"""Estado de cuenta por cliente y operadores de plataforma — helpers compartidos.

MÓDULO DE CONTRATO (Fase 2): lo usan la resolución de cliente (``clientes.py``),
los logins (``routers/auth.py``) y el panel del operador
(``routers/plataforma.py``). Si dos ramas lo crean, lo crean IDÉNTICO.

El estado vive en ``estados_cliente``, en la base por defecto (el registro):
fila ausente = activo, y una fila con estado "activo" también es activo.
"""
import os
import threading
import time

# El import registra las tablas en Base.metadata ANTES de que corra create_all()
# — quien importe este módulo a nivel de módulo (clientes.py, los routers de
# plataforma/alta) ya deja las tablas creadas en el arranque. No hay ciclo:
# models/plataforma.py sólo importa app.database.
from app.models import plataforma as _tablas  # noqa: F401

ESTADOS_CUENTA = ("activo", "gracia", "solo_lectura", "suspendido")

# Mismo espíritu que el cache de membresía de app/auth.py: el estado se lee en
# CADA pedido, así que 60 s de cache con invalidación explícita en el PATCH.
_ESTADO_CACHE_TTL_SEGUNDOS = 60.0
_estado_cache: dict[str, tuple[tuple[str, str | None], float]] = {}
_estado_cache_candado = threading.Lock()


def estado_de(slug: str) -> tuple[str, str | None]:
    """``(estado, motivo)`` del cliente. Fila ausente o "activo" → ("activo", None)."""
    ahora = time.monotonic()
    with _estado_cache_candado:
        cacheado = _estado_cache.get(slug)
        if cacheado is not None and cacheado[1] > ahora:
            return cacheado[0]

    from app.clientes import sesion_registro
    from app.models.plataforma import EstadoCliente

    reg = sesion_registro()
    try:
        fila = reg.query(EstadoCliente).filter(EstadoCliente.slug == slug).first()
    finally:
        reg.close()

    if fila is None or fila.estado == "activo":
        valor: tuple[str, str | None] = ("activo", None)
    else:
        valor = (fila.estado, fila.motivo)

    with _estado_cache_candado:
        _estado_cache[slug] = (valor, ahora + _ESTADO_CACHE_TTL_SEGUNDOS)
    return valor


def invalidar_cache_estado(slug: str) -> None:
    """La llama el PATCH del operador: el corte se siente en el pedido siguiente."""
    with _estado_cache_candado:
        _estado_cache.pop(slug, None)


def limpiar_cache_estado() -> None:
    """Para las pruebas, que arman una base nueva por prueba."""
    with _estado_cache_candado:
        _estado_cache.clear()


def es_operador(email: str | None) -> bool:
    """¿Este correo es operador de plataforma?

    La lista vive en la env ``OPERADOR_EMAILS`` (coma-separada, sin distinguir
    mayúsculas) — no hay tabla de superadmins que alguien pueda escribir. Se lee
    en cada llamada a propósito: los tests la monkeypatchean sin tocar caches.
    Sólo aplica a cuentas con ``sub`` — el email llega del token; el legado no
    trae email y jamás es operador.
    """
    if not email:
        return False
    crudos = os.getenv("OPERADOR_EMAILS", "")
    operadores = {e.strip().lower() for e in crudos.split(",") if e.strip()}
    return email.strip().lower() in operadores
