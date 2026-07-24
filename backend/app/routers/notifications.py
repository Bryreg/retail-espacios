from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import get_config, require_admin, require_auth, set_config
from app.database import get_db
from app.services.mailer import html_shell, send_mail, smtp_configured

router = APIRouter(prefix="/notifications", tags=["notifications"])


# ─── Schemas ──────────────────────────────────────────────────────────────────

class NotificationConfigOut(BaseModel):
    notify_emails: str
    reminder_days: str


class NotificationConfigIn(BaseModel):
    notify_emails: Optional[str] = None
    reminder_days: Optional[str] = None


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
