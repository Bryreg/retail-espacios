from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import get_config, require_admin, require_auth, set_config
from app.database import get_db
from app.services.contacts import get_contacts, recipients_for, save_contacts
from app.services.mailer import (
    clean_recipients, enviar_con_diagnostico, html_shell, correo_configurado, smtp_settings,
)

router = APIRouter(prefix="/notifications", tags=["notifications"])


# ─── Schemas ──────────────────────────────────────────────────────────────────

class NotificationConfigOut(BaseModel):
    notify_emails: str
    reminder_days: str


class NotificationConfigIn(BaseModel):
    notify_emails: Optional[str] = None
    reminder_days: Optional[str] = None


class SedeContacts(BaseModel):
    """Quién recibe aviso en una sede. El mercaderista nunca recibe valores."""
    admin: list[str] = Field(default=[], max_length=20)
    mercaderista: list[str] = Field(default=[], max_length=20)


class ContactBook(BaseModel):
    """El gerente operacional supervisa a los administradores, así que es uno
    solo para todas las sedes y recibe todo lo comercial."""
    gerente: list[str] = Field(default=[], max_length=20)
    by_sede: dict[str, SedeContacts] = Field(default={})


class RecipientPreview(BaseModel):
    """A quién le llegaría el aviso de un contrato en esta sede."""
    sede: Optional[str] = None
    comercial: list[str] = []
    montaje: list[str] = []
    smtp_listo: bool = False


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.get("/config", response_model=NotificationConfigOut, dependencies=[Depends(require_auth)])
def get_notification_config(db: Session = Depends(get_db)):
    return NotificationConfigOut(
        notify_emails=get_config(db, "notify_emails", "") or "",
        reminder_days=get_config(db, "reminder_days", "30,15,6") or "",
    )


@router.put("/config", response_model=NotificationConfigOut, dependencies=[Depends(require_admin)])
def update_notification_config(payload: NotificationConfigIn, db: Session = Depends(get_db)):
    if payload.notify_emails is not None:
        set_config(db, "notify_emails", payload.notify_emails.strip())

    if payload.reminder_days is not None:
        cleaned = ",".join(
            part.strip() for part in payload.reminder_days.split(",") if part.strip().isdigit()
        )
        if payload.reminder_days.strip() and not cleaned:
            raise HTTPException(
                status_code=422,
                detail="reminder_days debe ser una lista de días separados por comas (ej: 30,15,6)",
            )
        set_config(db, "reminder_days", cleaned)

    db.commit()
    return get_notification_config(db)


# ─── Contact book ─────────────────────────────────────────────────────────────
# Route order: literal paths only in this router, no catch-all, so order is
# free. Admin-only in both directions: these are staff addresses.


@router.get("/contacts", response_model=ContactBook, dependencies=[Depends(require_admin)])
def read_contacts(db: Session = Depends(get_db)):
    book = get_contacts(db)
    return ContactBook(
        gerente=book["gerente"],
        by_sede={s: SedeContacts(**roles) for s, roles in book["by_sede"].items()},
    )


@router.put("/contacts", response_model=ContactBook, dependencies=[Depends(require_admin)])
def write_contacts(payload: ContactBook, db: Session = Depends(get_db)):
    saved = save_contacts(
        db,
        payload.gerente,
        {s: r.model_dump() for s, r in payload.by_sede.items()},
    )
    db.commit()
    return ContactBook(
        gerente=saved["gerente"],
        by_sede={s: SedeContacts(**roles) for s, roles in saved["by_sede"].items()},
    )


@router.get("/recipients", response_model=RecipientPreview, dependencies=[Depends(require_admin)])
def preview_recipients(sede: Optional[str] = None, db: Session = Depends(get_db)):
    """Quién recibiría el aviso si se guardara un contrato en esta sede.

    Existe para que el panel lo muestre ANTES de guardar: cerrar una llamada
    creyendo que se avisó al mercaderista y que no se haya avisado a nadie es
    el modo de falla que vuelve inútil a la herramienta.
    """
    who = recipients_for(db, sede)
    return RecipientPreview(
        sede=sede,
        comercial=who["comercial"],
        montaje=who["montaje"],
        smtp_listo=correo_configurado(),
    )


@router.post("/test", dependencies=[Depends(require_admin)])
def send_test_notification(db: Session = Depends(get_db)):
    if not correo_configurado():
        return {
            "ok": False,
            "detail": (
                "El correo no está configurado en el servidor. Por SMTP hacen falta "
                "SMTP_USER y SMTP_PASSWORD; por HTTPS, EMAIL_PROVIDER (brevo o sendgrid), "
                "EMAIL_API_KEY y MAIL_FROM. Si el hosting bloquea la salida SMTP —Render "
                "en plan gratuito la bloquea— el único camino que funciona es el de HTTPS."
            ),
        }

    # Antes miraba SÓLO la clave vieja `notify_emails`, así que con la libreta
    # de contactos llena —que es de donde salen los avisos de verdad— la prueba
    # respondía «no hay destinatarios» y nadie entendía por qué.
    libro = get_contacts(db)
    de_libreta = clean_recipients([
        *libro["gerente"],
        *[a for roles in libro["by_sede"].values() for lista in roles.values() for a in lista],
    ])
    legacy = clean_recipients((get_config(db, "notify_emails", "") or "").split(","))
    destinos = clean_recipients([*de_libreta, *legacy])
    if not destinos:
        return {
            "ok": False,
            "detail": (
                "No hay destinatarios configurados. Cargá los contactos de la sede "
                "—o la lista de notificación— antes de enviar la prueba."
            ),
        }

    subject = "Correo de prueba — RECABRA"
    ajustes = smtp_settings()
    html = html_shell(
        subject,
        [
            ("Estado", "Configuración SMTP correcta"),
            ("Servidor", f"{ajustes['host']}:{ajustes['port']}"),
            ("Remitente", ajustes["mail_from"] or "—"),
            ("Destinatarios", ", ".join(destinos)),
        ],
        "Si recibió este mensaje, las notificaciones del sistema están funcionando correctamente.",
    )
    # El motivo real, no «revise las credenciales». Un botón de prueba que no
    # dice qué falló no prueba nada: una contraseña rechazada y un puerto
    # bloqueado por la red daban exactamente el mismo texto, y para
    # distinguirlos había que entrar a los registros del servidor.
    ok, motivo, segundos = enviar_con_diagnostico(destinos, subject, html)
    detail = (
        f"Correo de prueba enviado a {', '.join(destinos)}."
        if ok else motivo
    )
    return {
        "ok": ok,
        "detail": detail,
        "servidor": f"{ajustes['host']}:{ajustes['port']}",
        "remitente": ajustes["mail_from"],
        "destinatarios": destinos,
        "segundos": round(segundos, 2),
    }
