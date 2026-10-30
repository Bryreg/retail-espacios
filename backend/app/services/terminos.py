"""Los Términos del servicio, versionados y apagados hasta que el dueño los
marque como vigentes (auditoría pre-lanzamiento, P0-2).

**El interruptor es ``TERMINOS_VIGENTES``**, con la versión que rige (por
ejemplo ``2026-10-v1``). Sin la variable, todo funciona como antes de esta
tanda: el alta pide sólo la política, nadie ve un aviso de términos y
``GET /api/auth/terminos`` dice que no hay términos publicados.

**Y aun con la variable puesta, un borrador no se publica.** El texto sale de
``app/legal/terminos-servicio.md`` (copia byte a byte de
``docs/legal/borradores/terminos-servicio.md``; ``tests/test_terminos.py`` lo
fija), y rige sólo si:

* el encabezado del archivo dice ``**Versión: <la misma de la variable>**``, y
* no queda ninguna marca de borrador: ``[COMPLETAR``, ``[VALIDAR CON ABOGADO``
  ni la palabra ``BORRADOR``.

Si no, la variable se ignora y queda UNA línea WARNING en el log que dice por
qué. Así el dueño no puede publicar por error el texto con los huecos que
tiene que llenar el abogado, ni una versión que no es la del archivo (la
constancia apuntaría a un texto que no existe).

Quién los acepta: **la dueña** (membresía ``owner``), por supermercado. Los
términos son el contrato del servicio con el supermercado; su gente acepta la
política de datos, como siempre.
"""
from __future__ import annotations

import logging
import os
import re
from pathlib import Path
from typing import Optional

log = logging.getLogger("recabra.terminos")

VARIABLE = "TERMINOS_VIGENTES"
ARCHIVO = Path(__file__).resolve().parents[1] / "legal" / "terminos-servicio.md"
MARCAS_DE_BORRADOR = ("[COMPLETAR", "[VALIDAR CON ABOGADO", "BORRADOR")
_VERSION = re.compile(r"\*\*Versión:\s*([0-9A-Za-z._-]+)")

# Para no repetir el mismo WARNING en cada pedido: uno por motivo y versión.
_avisados: set[tuple[str, str]] = set()


def _avisar(motivo: str, version: str, texto: str) -> None:
    clave = (motivo, version)
    if clave in _avisados:
        return
    _avisados.add(clave)
    log.warning("%s=%s se ignora: %s", VARIABLE, version, texto)


def version_del_archivo(texto: str) -> Optional[str]:
    m = _VERSION.search(texto or "")
    return m.group(1) if m else None


def marcas_de_borrador(texto: str) -> list[str]:
    return [m for m in MARCAS_DE_BORRADOR if m in (texto or "")]


def vigentes(archivo: Path | None = None) -> Optional[dict]:
    """``{"version", "texto"}`` de los términos que rigen, o ``None``."""
    pedida = (os.getenv(VARIABLE) or "").strip()
    if not pedida:
        return None
    ruta = archivo or ARCHIVO
    try:
        texto = ruta.read_text(encoding="utf-8")
    except OSError:
        _avisar("sin_archivo", pedida, f"no se pudo leer {ruta.name}")
        return None
    en_el_archivo = version_del_archivo(texto)
    if en_el_archivo != pedida:
        _avisar("otra_version", pedida, f"el archivo dice la versión {en_el_archivo or '(ninguna)'}")
        return None
    quedan = marcas_de_borrador(texto)
    if quedan:
        _avisar("borrador", pedida, f"el texto todavía es un borrador ({', '.join(quedan)})")
        return None
    return {"version": pedida, "texto": texto}


def version_vigente() -> Optional[str]:
    v = vigentes()
    return v["version"] if v else None


def acepto(reg, usuario_id: int, slug: str, version: str) -> bool:
    from app.models.terminos import AceptacionDeTerminos

    return (
        reg.query(AceptacionDeTerminos.id)
        .filter(
            AceptacionDeTerminos.usuario_id == usuario_id,
            AceptacionDeTerminos.cliente_slug == slug,
            AceptacionDeTerminos.version_terminos == version,
        )
        .first()
        is not None
    )


def registrar(reg, usuario_id: int, slug: str, version: str, ip: str, origen: str) -> None:
    """Agrega la constancia a la sesión (no comitea), con la versión de la
    política que rige ahora."""
    from app.models.consentimiento import VERSION_POLITICA
    from app.models.terminos import AceptacionDeTerminos

    reg.add(AceptacionDeTerminos(
        usuario_id=usuario_id, cliente_slug=slug, version_terminos=version,
        version_politica=VERSION_POLITICA, ip=ip, origen=origen,
    ))


def pendiente_para(reg, usuario_id: Optional[int], slug: str, rol_membresia: Optional[str]) -> Optional[str]:
    """La versión que esta persona tiene que aceptar para este supermercado, o
    ``None``: no hay términos vigentes, no es la dueña, o ya los aceptó."""
    if usuario_id is None or rol_membresia != "owner":
        return None
    version = version_vigente()
    if version is None or acepto(reg, usuario_id, slug, version):
        return None
    return version
