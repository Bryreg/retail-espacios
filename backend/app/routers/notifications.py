from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import get_config, require_admin, require_auth, set_config
from app.database import get_db
from app.services.contacts import get_contacts, recipients_for, save_contacts
from app.services.mailer import html_shell, send_mail, smtp_configured

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
        reminder_days=get_config(db, "reminder_days", "30,15,7,1") or "",
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
                detail="reminder_days debe ser una lista de días separados por comas (ej: 30,15,7,1)",
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
        smtp_listo=smtp_configured(),
    )


@router.post("/test", dependencies=[Depends(require_admin)])
def send_test_notification(db: Session = Depends(get_db)):
    if not smtp_configured():
        return {
            "ok": False,
            "detail": (
                "SMTP no configurado. Defina las variables de entorno SMTP_USER y "
                "SMTP_PASSWORD (y opcionalmente SMTP_HOST, SMTP_PORT y MAIL_FROM) en el servidor."
            ),
        }

    recipients = (get_config(db, "notify_emails", "") or "").strip()
    if not recipients:
        return {
            "ok": False,
            "detail": "No hay destinatarios configurados. Agregue correos de notificación antes de enviar la prueba.",
        }

    subject = "Correo de prueba — Galerías"
    html = html_shell(
        subject,
        [("Estado", "Configuración SMTP correcta")],
        "Si recibió este mensaje, las notificaciones del sistema están funcionando correctamente.",
    )
    ok = send_mail(db, subject, html)
    detail = (
        "Correo de prueba enviado correctamente."
        if ok
        else "No se pudo enviar el correo de prueba. Revise las credenciales SMTP y los registros del servidor."
    )
    return {"ok": ok, "detail": detail}
