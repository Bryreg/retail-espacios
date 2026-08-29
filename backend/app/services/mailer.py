"""Envío de correo — sólo biblioteca estándar.

Dos caminos, elegidos con ``EMAIL_PROVIDER``:

* ``smtp`` (por defecto) — ``smtplib`` contra un servidor de correo.
* ``brevo`` / ``sendgrid`` — una llamada HTTPS a la API del proveedor.

El segundo existe porque **el hosting puede bloquear la salida SMTP**. En
Render con plan gratuito, ``connect()`` devuelve ``[Errno 101] Network is
unreachable`` antes de intentar autenticarse: ninguna credencial de Gmail
funciona ahí, y el error no tiene nada que ver con la contraseña. El puerto
443 sí sale, así que el mismo correo viaja por HTTPS.

Los dos proveedores permiten verificar una dirección suelta como remitente
—``bmgpersonal99@gmail.com``, por ejemplo— sin tener un dominio propio.

Se usa ``urllib.request`` y no ``httpx`` ni ``requests`` a propósito: este
módulo no agrega dependencias, y ``requirements.txt`` no trae ningún cliente
HTTP. Una dependencia nueva es una forma de romper el despliegue.

Recipients come from the ``notify_emails`` app_config key (comma-separated).
If SMTP credentials or recipients are missing, the send is skipped with a log
line. This module NEVER raises to the caller.

Env vars: SMTP_HOST (default smtp.gmail.com), SMTP_PORT (default 587, STARTTLS),
SMTP_USER, SMTP_PASSWORD, MAIL_FROM (default SMTP_USER).
"""
import json
import logging
import os
import smtplib
import time
import urllib.error
import urllib.request
from email.message import EmailMessage

from sqlalchemy.orm import Session

from app.auth import get_config

logger = logging.getLogger("retail.mailer")


# ─── Settings ─────────────────────────────────────────────────────────────────

def proveedor() -> str:
    """``smtp``, ``brevo`` o ``sendgrid``. Lo desconocido cae en smtp."""
    valor = os.getenv("EMAIL_PROVIDER", "smtp").strip().lower()
    return valor if valor in ("smtp", "brevo", "sendgrid") else "smtp"


def api_key() -> str:
    return os.getenv("EMAIL_API_KEY", "").strip()


def nombre_remitente() -> str:
    return os.getenv("MAIL_FROM_NAME", "RECABRA").strip() or "RECABRA"


def smtp_settings() -> dict:
    user = os.getenv("SMTP_USER", "").strip()
    # Sin espacios. Google muestra la contraseña de aplicación en cuatro grupos
    # —"abcd efgh ijkl mnop"— y quien la copia se lleva los espacios; el
    # servidor la rechaza con un error de credenciales que no dice eso, y se
    # pierde media hora buscando el problema donde no está. Lo mismo con el
    # salto de línea que a veces queda pegado al pegar en el panel de Render.
    password = "".join(os.getenv("SMTP_PASSWORD", "").split())
    return {
        "host": os.getenv("SMTP_HOST", "smtp.gmail.com").strip(),
        "port": int(os.getenv("SMTP_PORT", "587")),
        "user": user,
        "password": password,
        "mail_from": (os.getenv("MAIL_FROM", "").strip() or user),
    }


def app_base_url() -> str:
    """De dónde cuelgan los enlaces que van en los correos.

    Configurable porque el mismo código corre en Render y en una máquina local;
    sin barra final para que quien concatene no genere doble barra.
    """
    return os.getenv("APP_URL", "https://retail-espacios.onrender.com").rstrip("/")


def correo_configurado() -> bool:
    """¿Hay con qué mandar un correo?

    Se llamaba ``smtp_configured``. Con un proveedor HTTPS de por medio, un
    nombre que afirma SMTP describe mal lo que mide: devolvería ``True`` sin
    que haya ningún SMTP en juego.
    """
    if proveedor() != "smtp":
        return bool(api_key() and smtp_settings()["mail_from"])
    settings = smtp_settings()
    return bool(settings["user"] and settings["password"])


# ─── Formatting helpers ───────────────────────────────────────────────────────

def format_cop(value: float) -> str:
    """COP con separador de miles: 1500000 → ``$ 1.500.000``."""
    return "$ " + f"{value:,.0f}".replace(",", ".")


def html_shell(title: str, rows: list[tuple[str, str]], footer: str = "") -> str:
    """Simple inline-styled HTML email body: a title, a key/value table, a footer."""
    rows_html = "".join(
        "<tr>"
        f'<td style="padding:6px 12px;color:#6b7280;font-size:13px;white-space:nowrap;">{label}</td>'
        f'<td style="padding:6px 12px;color:#111827;font-size:13px;font-weight:600;">{value}</td>'
        "</tr>"
        for label, value in rows
    )
    footer_html = (
        f'<p style="margin:16px 0 0;font-size:13px;color:#374151;">{footer}</p>' if footer else ""
    )
    return (
        '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;'
        'padding:24px;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;">'
        f'<h2 style="margin:0 0 16px;font-size:18px;color:#111827;">{title}</h2>'
        f'<table style="border-collapse:collapse;width:100%;background:#f9fafb;border-radius:6px;">'
        f"{rows_html}</table>"
        f"{footer_html}"
        '<p style="margin:24px 0 0;font-size:11px;color:#9ca3af;">'
        "Mensaje automático del sistema de gestión de espacios — RECABRA.</p>"
        "</div>"
    )


# ─── Sending ──────────────────────────────────────────────────────────────────

def clean_recipients(values) -> list[str]:
    """Keep plausible addresses, de-duplicated, order preserved.

    Deliberately loose — this is an internal address book typed by hand, not a
    signup form. The only thing worth rejecting is what would make the SMTP
    envelope invalid.
    """
    seen: set[str] = set()
    out: list[str] = []
    for raw in values or []:
        if not isinstance(raw, str):
            continue
        addr = raw.strip()
        if not addr or "@" not in addr or " " in addr:
            continue
        key = addr.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(addr)
    return out


def _post_json(url: str, headers: dict, payload: dict, timeout: int = 20) -> tuple[int, str]:
    """POST de JSON con la biblioteca estándar. Devuelve ``(código, cuerpo)``.

    Un 4xx o 5xx no levanta excepción acá: el cuerpo de la respuesta es lo que
    explica qué pasó —«remitente no verificado», «clave inválida»— y es
    justamente lo que hay que mostrarle a quien aprieta el botón de prueba.
    """
    datos = json.dumps(payload).encode("utf-8")
    pedido = urllib.request.Request(
        url, data=datos, method="POST",
        headers={**headers, "Content-Type": "application/json", "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(pedido, timeout=timeout) as r:
            return r.status, r.read(2000).decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read(2000).decode("utf-8", "replace")


def _enviar_por_api(
    recipients: list[str], subject: str, html_body: str, settings: dict
) -> tuple[bool, str]:
    """Manda el correo por la API HTTPS del proveedor configurado."""
    clave = api_key()
    if not clave:
        return False, "Falta EMAIL_API_KEY en el servidor."
    remitente = settings["mail_from"]
    if not remitente:
        return False, "Falta MAIL_FROM: el proveedor necesita saber desde qué dirección sale."

    cual = proveedor()
    if cual == "brevo":
        url = "https://api.brevo.com/v3/smtp/email"
        cabeceras = {"api-key": clave}
        cuerpo = {
            "sender": {"email": remitente, "name": nombre_remitente()},
            "to": [{"email": d} for d in recipients],
            "subject": subject,
            "htmlContent": html_body,
        }
        esperado = (200, 201, 202)
    else:  # sendgrid
        url = "https://api.sendgrid.com/v3/mail/send"
        cabeceras = {"Authorization": f"Bearer {clave}"}
        cuerpo = {
            "personalizations": [{"to": [{"email": d} for d in recipients]}],
            "from": {"email": remitente, "name": nombre_remitente()},
            "subject": subject,
            "content": [{"type": "text/html", "value": html_body}],
        }
        esperado = (200, 202)

    codigo, respuesta = _post_json(url, cabeceras, cuerpo)
    if codigo in esperado:
        return True, "Enviado."
    if codigo in (401, 403):
        return False, (
            f"{cual.capitalize()} rechazó la credencial o el remitente (HTTP {codigo}). "
            f"Revisá que EMAIL_API_KEY sea válida y que «{remitente}» esté verificado "
            f"como remitente en {cual.capitalize()}. Respuesta: {respuesta[:300]}"
        )
    return False, f"{cual.capitalize()} respondió HTTP {codigo}. {respuesta[:300]}"


def enviar_con_diagnostico(
    recipients: list[str], subject: str, html_body: str
) -> tuple[bool, str, float]:
    """Manda un correo y devuelve ``(ok, motivo, segundos)``.

    El motivo existe para el botón de prueba. Antes ese botón respondía
    «Revise las credenciales SMTP y los registros del servidor» pasara lo que
    pasara: una contraseña rechazada y un puerto bloqueado por la red daban el
    mismo texto, y para distinguirlos había que entrar a los logs del
    servidor. Un botón de prueba que no dice qué falló no prueba nada.

    Los segundos importan tanto como el motivo: una autenticación rechazada
    vuelve en menos de un segundo, y un puerto bloqueado tarda hasta que corta
    el temporizador. Con ese número se sabe si el problema es la credencial o
    la red sin leer un solo log.
    """
    recipients = clean_recipients(recipients)
    if not recipients:
        return False, "No hay destinatarios.", 0.0

    settings = smtp_settings()
    inicio = time.monotonic()

    # Camino HTTPS: el hosting puede tener cerrada la salida SMTP y el 443 no.
    if proveedor() != "smtp":
        try:
            ok, motivo = _enviar_por_api(recipients, subject, html_body, settings)
        except Exception as e:
            logger.exception("Error enviando correo por API (%s)", subject)
            ok, motivo = False, f"{type(e).__name__}: {e}"
        tardanza = time.monotonic() - inicio
        if ok:
            logger.info("Correo enviado (%s) a %s", subject, ", ".join(recipients))
        return ok, motivo, tardanza

    if not settings["user"] or not settings["password"]:
        return False, "Faltan SMTP_USER o SMTP_PASSWORD en el servidor.", 0.0

    try:
        msg = EmailMessage()
        msg["Subject"] = subject
        msg["From"] = settings["mail_from"]
        msg["To"] = ", ".join(recipients)
        msg.set_content("Este mensaje contiene contenido HTML. Use un cliente de correo compatible.")
        msg.add_alternative(html_body, subtype="html")

        # El puerto decide el modo. 465 es SSL desde el saludo y 587 es STARTTLS:
        # antes se hacía starttls() siempre, así que configurar 465 —que es una
        # elección habitual— fallaba con un error que no mencionaba el puerto.
        if settings["port"] == 465:
            cliente = smtplib.SMTP_SSL(settings["host"], settings["port"], timeout=30)
        else:
            cliente = smtplib.SMTP(settings["host"], settings["port"], timeout=30)
        with cliente as smtp:
            if settings["port"] != 465:
                smtp.starttls()
            smtp.login(settings["user"], settings["password"])
            smtp.send_message(msg)

        tardanza = time.monotonic() - inicio
        logger.info("Correo enviado (%s) a %s", subject, ", ".join(recipients))
        return True, "Enviado.", tardanza
    # El ORDEN importa: smtplib.SMTPException hereda de OSError, así que un
    # `except OSError` puesto antes se tragaría también los errores de
    # autenticación y los reportaría como problema de red.
    except smtplib.SMTPAuthenticationError as e:
        tardanza = time.monotonic() - inicio
        logger.exception("Error enviando correo (%s)", subject)
        return (
            False,
            f"El servidor de correo rechazó las credenciales (código {e.smtp_code}). "
            "Con Gmail hace falta una contraseña de aplicación de 16 caracteres, "
            "no la contraseña de la cuenta.",
            tardanza,
        )
    except smtplib.SMTPException as e:
        tardanza = time.monotonic() - inicio
        logger.exception("Error enviando correo (%s)", subject)
        return False, f"El servidor de correo respondió con un error. {type(e).__name__}: {e}", tardanza
    except OSError as e:
        # No se pudo ni abrir el socket: la credencial nunca entró en juego.
        # Es lo que pasa en Render con plan gratuito, que cierra la salida SMTP
        # y devuelve «Network is unreachable» en connect(). Decir «revise las
        # credenciales» acá manda a buscar el problema donde no está.
        tardanza = time.monotonic() - inicio
        logger.exception("Error enviando correo (%s)", subject)
        return (
            False,
            f"El servidor no pudo abrir la conexión con {settings['host']}:{settings['port']} "
            f"({type(e).__name__}: {e}). No son las credenciales: no se llegó a autenticar. "
            "Es la red de donde corre la aplicación, que bloquea la salida SMTP.",
            tardanza,
        )
    except Exception as e:
        tardanza = time.monotonic() - inicio
        logger.exception("Error enviando correo (%s)", subject)
        return False, f"{type(e).__name__}: {e}", tardanza


def send_mail_to(recipients: list[str], subject: str, html_body: str) -> bool:
    """Send one HTML email to an explicit recipient list.

    Split out from ``send_mail`` because a contract now produces DIFFERENT
    messages for different people — the merchandiser gets a work order with no
    money in it — so the recipients can no longer come from one global config
    key.
    """
    ok, _motivo, _t = enviar_con_diagnostico(recipients, subject, html_body)
    return ok


def send_mail(db: Session, subject: str, html_body: str) -> bool:
    """Send an HTML email to the configured recipients. Returns True on success.

    Never raises: missing recipients/credentials or SMTP errors are logged and
    reported as False so callers can decide whether to retry later.
    """
    raw = get_config(db, "notify_emails", "") or ""
    recipients = [e.strip() for e in raw.split(",") if e.strip()]
    if not recipients:
        logger.info("Correo omitido (%s): no hay destinatarios en notify_emails", subject)
        return False

    settings = smtp_settings()
    if not settings["user"] or not settings["password"]:
        logger.info("Correo omitido (%s): faltan SMTP_USER / SMTP_PASSWORD", subject)
        return False

    try:
        msg = EmailMessage()
        msg["Subject"] = subject
        msg["From"] = settings["mail_from"]
        msg["To"] = ", ".join(recipients)
        msg.set_content("Este mensaje contiene contenido HTML. Use un cliente de correo compatible.")
        msg.add_alternative(html_body, subtype="html")

        with smtplib.SMTP(settings["host"], settings["port"], timeout=30) as smtp:
            smtp.starttls()
            smtp.login(settings["user"], settings["password"])
            smtp.send_message(msg)

        logger.info("Correo enviado (%s) a %s", subject, ", ".join(recipients))
        return True
    except Exception:
        logger.exception("Error enviando correo (%s)", subject)
        return False


def send_mail_to_bg(recipients: list[str], subject: str, html_body: str) -> None:
    """Entry point for FastAPI BackgroundTasks with explicit recipients.

    Needs no DB session: the addresses were already resolved while handling the
    request, which also means the caller could show them to the user first.
    """
    send_mail_to(recipients, subject, html_body)


def send_mail_bg(subject: str, html_body: str) -> None:
    """Entry point for FastAPI BackgroundTasks — opens its own DB session.

    The request-scoped session is closed before background tasks run, so this
    helper must never reuse it.
    """
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        send_mail(db, subject, html_body)
    finally:
        db.close()
