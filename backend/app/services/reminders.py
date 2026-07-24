"""Lease-expiry reminders.

``check_expiring_leases`` compares every active lease's days-to-expiry against
the configured ``reminder_days`` set and sends at most ONE email per
(lease, days_left) combination — deduplicated via NotificationLog rows.
The log row is only inserted after a successful send, so a temporarily
misconfigured SMTP retries on the next cycle.
"""
import logging
from datetime import date

from sqlalchemy.orm import Session, joinedload

from app.auth import get_config
from app.models.models import NotificationLog, SpaceLease
from app.services.mailer import format_cop, html_shell, send_mail

logger = logging.getLogger("retail.reminders")


def _parse_reminder_days(raw: str) -> set[int]:
    days: set[int] = set()
    for part in raw.split(","):
        part = part.strip()
        if part.isdigit():
            days.add(int(part))
    return days


def check_expiring_leases(db: Session) -> int:
    """Send expiry reminder emails for active leases. Returns emails sent."""
    today = date.today()
    reminder_days = _parse_reminder_days(get_config(db, "reminder_days", "30,15,7,1") or "")
    if not reminder_days:
        return 0

    leases = (
        db.query(SpaceLease)
        .options(joinedload(SpaceLease.space), joinedload(SpaceLease.supplier))
        .filter(SpaceLease.is_active.is_(True))
        .all()
    )

    sent_count = 0
    for lease in leases:
        days_left = (lease.end_date - today).days
        if days_left not in reminder_days:
            continue

        kind = f"expiry_{days_left}"
        already_sent = (
            db.query(NotificationLog)
            .filter(NotificationLog.lease_id == lease.id, NotificationLog.kind == kind)
            .first()
        )
        if already_sent:
            continue

        space = lease.space
        subject = f"Contrato por vencer en {days_left} días — {space.code}"
        rows = [
            ("Sede", space.sede or "—"),
            ("Espacio", f"{space.code} — {space.name}"),
            ("Proveedor", lease.supplier.name if lease.supplier else "—"),
            ("Marca", lease.marca or "—"),
            ("Inicio", str(lease.start_date)),
            ("Fin", str(lease.end_date)),
            ("Valor mensual", format_cop(lease.monthly_rent)),
            ("Días restantes", str(days_left)),
        ]
        footer = (
            "El contrato está próximo a vencer. Contacte al proveedor para "
            "renegociar la renovación o coordinar la finalización y entrega del espacio."
        )
        if send_mail(db, subject, html_shell(subject, rows, footer)):
            db.add(NotificationLog(lease_id=lease.id, kind=kind))
            db.commit()
            sent_count += 1

    if sent_count:
        logger.info("Recordatorios de vencimiento enviados: %d", sent_count)
    return sent_count
