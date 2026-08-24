"""SMTP mail delivery — stdlib only (smtplib + EmailMessage).

Recipients come from the ``notify_emails`` app_config key (comma-separated).
If SMTP credentials or recipients are missing, the send is skipped with a log
line. This module NEVER raises to the caller.

Env vars: SMTP_HOST (default smtp.gmail.com), SMTP_PORT (default 587, STARTTLS),
SMTP_USER, SMTP_PASSWORD, MAIL_FROM (default SMTP_USER).
"""
import logging
import os
import smtplib
from email.message import EmailMessage

from sqlalchemy.orm import Session

from app.auth import get_config

logger = logging.getLogger("retail.mailer")


# ─── Settings ─────────────────────────────────────────────────────────────────

def smtp_settings() -> dict:
    user = os.getenv("SMTP_USER", "")
    return {
        "host": os.getenv("SMTP_HOST", "smtp.gmail.com"),
        "port": int(os.getenv("SMTP_PORT", "587")),
        "user": user,
        "password": os.getenv("SMTP_PASSWORD", ""),
        "mail_from": os.getenv("MAIL_FROM", user) or user,
    }


def smtp_configured() -> bool:
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
        "Mensaje automático del sistema de gestión de espacios — Galerías.</p>"
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


def send_mail_to(recipients: list[str], subject: str, html_body: str) -> bool:
    """Send one HTML email to an explicit recipient list.

    Split out from ``send_mail`` because a contract now produces DIFFERENT
    messages for different people — the merchandiser gets a work order with no
    money in it — so the recipients can no longer come from one global config
    key.
    """
    recipients = clean_recipients(recipients)
    if not recipients:
        logger.info("Correo omitido (%s): sin destinatarios", subject)
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
