"""Que lo que el servidor dice llegue a alguien (auditoría P1-3).

Hasta acá la app no configuraba el logging: uvicorn deja el logger raíz en
WARNING y sin handler propio, así que cada ``logger.info`` se perdía y las
líneas importantes se escribían como WARNING sólo para que salieran (ver los
comentarios de ``main._run_lease_maintenance``). Ahora, al arrancar:

· **El log va en líneas JSON a la salida estándar**, que es lo que Render
  junta en su pestaña *Logs* (y lo que un drenaje de logs reenvía). Una línea
  por evento, con hora UTC, nivel, logger, mensaje y la traza si hay una.
  Nivel: ``LOG_LEVEL`` (``INFO`` por defecto). ``LOG_FORMAT=texto`` lo deja
  legible para desarrollo.
· **No pisa a nadie.** Si el logger raíz ya tiene handlers —pytest, o un
  ``uvicorn --log-config`` que alguien eligió— no se toca nada.
· **Sentry, sólo con ``SENTRY_DSN``.** Sin la variable no se importa nada.
  ``send_default_pii=False``: ni IPs ni cabeceras de quien pide; y el texto de
  cada evento pasa por ``sin_correos`` antes de salir.

Privacidad: los logs no llevan direcciones de correo. Quien loguea algo que
podría traer una (el motivo de un proveedor de correo, por ejemplo) lo pasa por
``sin_correos``.
"""
from __future__ import annotations

import json
import logging
import os
import re
import sys
from datetime import datetime, timezone

_MARCA = "_recabra_json"

_CORREO = re.compile(r"[A-Za-z0-9._%+\-]+@([A-Za-z0-9.\-]+\.[A-Za-z]{2,})")


def sin_correos(texto: str) -> str:
    """Reemplaza cada dirección por ``***@dominio``: se sabe a qué proveedor
    iba (útil para diagnosticar), no a quién."""
    return _CORREO.sub(lambda m: f"***@{m.group(1)}", texto or "")


def resumen_de_destinatarios(destinatarios) -> str:
    """«3 destinatarios (gmail.com, alpina.com)»: cuántos y a qué dominios,
    nunca las direcciones."""
    lista = [d for d in (destinatarios or []) if isinstance(d, str)]
    dominios = sorted({d.rsplit("@", 1)[-1].lower() for d in lista if "@" in d})
    n = len(lista)
    return f"{n} destinatario{'s' if n != 1 else ''} ({', '.join(dominios) or 'sin dominio'})"


# Lo que va en la query de una URL y abre algo: el token del enlace de montaje o
# de la guía (`?montar=…&t=…`, `?guia=…&t=…`) y el de medios (`?token=…`). El
# registro de accesos de uvicorn escribe la ruta entera, y un enlace sin
# contraseña copiado del log del hosting sirve igual que el del correo
# (auditoría pre-lanzamiento, P2-23: los logs no guardan lo que identifica ni
# lo que abre).
_TOKEN_EN_LA_RUTA = re.compile(r"([?&](?:t|token|id_token)=)[^&#\s]+", re.IGNORECASE)


def sin_tokens(ruta: str) -> str:
    """``/?montar=X&t=eyJ…`` → ``/?montar=X&t=***``; y sin correos."""
    return sin_correos(_TOKEN_EN_LA_RUTA.sub(r"\1***", ruta or ""))


class SinTokensEnLaRuta(logging.Filter):
    """Filtro del logger ``uvicorn.access``: sus ``args`` son
    ``(cliente, método, ruta, versión, estado)``; la ruta sale sin tokens."""

    def filter(self, registro: logging.LogRecord) -> bool:
        args = registro.args
        if isinstance(args, tuple) and len(args) >= 3 and isinstance(args[2], str):
            registro.args = args[:2] + (sin_tokens(args[2]),) + args[3:]
        return True


def filtrar_el_registro_de_accesos() -> bool:
    """Le pone el filtro a ``uvicorn.access`` una sola vez. Va aparte de
    ``configurar_logging`` porque uvicorn configura su logger él mismo y eso
    no depende de quién configuró el raíz."""
    acceso = logging.getLogger("uvicorn.access")
    if any(isinstance(f, SinTokensEnLaRuta) for f in acceso.filters):
        return False
    acceso.addFilter(SinTokensEnLaRuta())
    return True


class FormatoJSON(logging.Formatter):
    """Una línea JSON por registro.

    **Red de seguridad (auditoría P2-23):** el mensaje y la traza pasan por
    ``sin_correos`` acá, al escribirse. Quien loguea ya resume los destinatarios
    (``resumen_de_destinatarios``), pero una excepción del proveedor de correo o
    de la base puede traer una dirección adentro, y la traza no la escribe nadie
    a mano."""

    def format(self, registro: logging.LogRecord) -> str:
        datos = {
            "time": datetime.fromtimestamp(registro.created, tz=timezone.utc).isoformat(timespec="milliseconds"),
            "level": registro.levelname,
            "logger": registro.name,
            "message": sin_correos(registro.getMessage()),
        }
        if registro.exc_info:
            datos["exc"] = sin_correos(self.formatException(registro.exc_info))
        return json.dumps(datos, ensure_ascii=False)


class _SalidaEstandar:
    """``sys.stdout`` resuelto en cada escritura y no al crear el handler: si
    alguien reemplaza la salida (un runner de pruebas que la captura y la
    cierra), el handler no queda escribiendo en un archivo cerrado."""

    def write(self, texto):
        return sys.stdout.write(texto)

    def flush(self):
        try:
            sys.stdout.flush()
        except Exception:  # noqa: BLE001
            pass


def configurar_logging() -> bool:
    """Configura el logger raíz una sola vez. Devuelve si lo configuró."""
    raiz = logging.getLogger()
    if any(getattr(h, _MARCA, False) for h in raiz.handlers):
        return False
    if raiz.handlers:
        # Alguien ya decidió cómo se loguea (pytest, un --log-config).
        return False
    handler = logging.StreamHandler(_SalidaEstandar())
    setattr(handler, _MARCA, True)
    if os.getenv("LOG_FORMAT", "json").strip().lower() == "texto":
        handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
    else:
        handler.setFormatter(FormatoJSON())
    raiz.addHandler(handler)
    nivel = getattr(logging, os.getenv("LOG_LEVEL", "INFO").strip().upper(), logging.INFO)
    raiz.setLevel(nivel if isinstance(nivel, int) else logging.INFO)
    return True


_sentry_listo = False


def configurar_sentry() -> bool:
    """Prende Sentry si hay ``SENTRY_DSN``. Sin la variable, no hace nada."""
    global _sentry_listo
    dsn = os.getenv("SENTRY_DSN", "").strip()
    if not dsn or _sentry_listo:
        return _sentry_listo
    try:
        import sentry_sdk
    except ImportError:
        logging.getLogger("recabra.observabilidad").warning(
            "SENTRY_DSN está puesto pero sentry-sdk no está instalado: los errores no salen."
        )
        return False

    def _limpiar(evento, _pista):
        # Ninguna dirección de correo sale de la máquina, ni en el mensaje ni
        # en la excepción.
        try:
            texto = json.dumps(evento, default=str)
            if "@" in texto:
                return json.loads(sin_correos(texto))
        except Exception:  # noqa: BLE001
            pass
        return evento

    try:
        tasa = float(os.getenv("SENTRY_TRACES_SAMPLE_RATE", "0") or 0)
    except ValueError:
        tasa = 0.0
    sentry_sdk.init(
        dsn=dsn,
        environment=os.getenv("SENTRY_ENVIRONMENT", "production"),
        release=os.getenv("RENDER_GIT_COMMIT") or None,
        send_default_pii=False,
        traces_sample_rate=tasa,
        before_send=_limpiar,
    )
    _sentry_listo = True
    logging.getLogger("recabra.observabilidad").info("Sentry prendido (%s)", os.getenv("SENTRY_ENVIRONMENT", "production"))
    return True
