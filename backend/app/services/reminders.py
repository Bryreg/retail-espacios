"""El aviso de que un contrato se está por caer.

Corre desde ``main`` cada 12 horas, y de arranque. Manda a lo sumo UN correo por
(contrato, hito) — la fila de ``NotificationLog`` se escribe recién después de
un envío exitoso, así que un SMTP mal configurado reintenta en el ciclo
siguiente en vez de perder el aviso.

Tres cosas que estaban mal y por qué importaban:

**Los hitos eran 30/15/7/1.** Son 30/15/6: a 7 días no queda margen para
negociar nada y a 1 el correo llega para avisar de algo que ya pasó. El último
aviso útil es el que todavía deja armar una reunión.

**Se comparaba por igualdad exacta** — ``days_left in reminder_days`` — así que
si el servicio estaba dormido justo el día 30, ese aviso no salía NUNCA. En
Render un servicio sin tráfico se apaga, y el día que despierta rara vez es
exactamente uno de los hitos. Ahora se busca el hito más chico que todavía cubre
los días que faltan, así que un contrato a 28 días recibe el aviso de «30» —
tarde pero llega— y uno que aparece a 5 días recibe UNO solo, el de «6», y no
los tres de golpe.

**Iba a `notify_emails`**, la lista global vieja, mientras los correos de
contrato ya van por la libreta de contactos por sede. Con la libreta cargada y
`notify_emails` vacío —que es la instalación normal hoy— el recordatorio no le
llegaba a nadie y sólo dejaba una línea en el log. Ahora va por la misma libreta
que todo lo demás, con la misma caída a `notify_emails` para la instalación que
todavía no la cargó.
"""
import logging

from sqlalchemy.orm import Session, joinedload

from app.auth import get_config
from app.fechas import hoy
from app.models.models import NotificationLog, SpaceLease
from app.services.contacts import recipients_for
from app.services.mailer import format_cop, html_shell, send_mail_to

logger = logging.getLogger("retail.reminders")


def _parse_reminder_days(raw: str) -> list[int]:
    """Los hitos, de mayor a menor. Ordenados porque el que manda es el más
    chico que todavía cubre: ver `_hito`."""
    dias = {int(p.strip()) for p in raw.split(",") if p.strip().isdigit()}
    return sorted(dias, reverse=True)


def _hito(days_left: int, hitos: list[int]) -> int | None:
    """El hito que le toca a un contrato al que le quedan ``days_left`` días.

    Es el MÁS CHICO de los que todavía lo cubren, y ahí está toda la gracia:

    - a 40 días no le toca ninguno (todavía no entra en el primero);
    - a 30, y hasta 16, le toca el de 30;
    - a 15, y hasta 7, el de 15;
    - a 6, y de ahí para abajo —incluso vencido—, el de 6.

    Con eso un contrato que aparece con 5 días recibe un solo correo, el de 6, y
    no los tres de golpe; y uno que estaba a 30 el día que el servidor dormía
    recibe el de 30 al día siguiente, en vez de perderlo para siempre.
    """
    candidatos = [h for h in hitos if days_left <= h]
    return min(candidatos) if candidatos else None


def check_expiring_leases(db: Session) -> int:
    """Manda los avisos de vencimiento. Devuelve cuántos correos salieron."""
    today = hoy()
    hitos = _parse_reminder_days(get_config(db, "reminder_days", "30,15,6") or "")
    if not hitos:
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
        hito = _hito(days_left, hitos)
        if hito is None:
            continue

        # La marca lleva el HITO, no los días que faltaban: si llevara los días,
        # un aviso que sale tarde —el de «30» mandado el día 28— dejaría el hito
        # sin marcar y volvería a salir al día siguiente, y al otro.
        kind = f"expiry_{hito}"
        already_sent = (
            db.query(NotificationLog)
            .filter(NotificationLog.lease_id == lease.id, NotificationLog.kind == kind)
            .first()
        )
        if already_sent:
            continue

        space = lease.space
        # El asunto dice los días REALES, no el hito. Un correo que dice «en 30
        # días» cuando faltan 28 es un correo que miente sobre lo único que
        # importa de él.
        cuando = (
            f"vence en {days_left} días" if days_left > 1
            else "vence mañana" if days_left == 1
            else "vence hoy" if days_left == 0
            else f"venció hace {abs(days_left)} días"
        )
        subject = f"Contrato {cuando} — {space.code}"
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
            "El contrato está próximo a vencer. Para renovarlo, entrá a Sede → "
            "Supervisar, tocá el espacio en «Para revisar» y usá «Renovar»: el "
            "contrato nuevo sale con el mismo proveedor y el mismo valor, "
            "arrancando el día después de que termine éste."
        )
        # Por la libreta de contactos de la sede, como todo el resto del correo:
        # `send_mail` iba a la lista global vieja, y con la libreta cargada y esa
        # lista vacía el aviso no le llegaba a nadie.
        destinatarios = recipients_for(db, space.sede)["comercial"]
        if not destinatarios:
            logger.info(
                "Aviso de vencimiento omitido (%s): la sede %s no tiene contactos comerciales",
                space.code, space.sede or "—",
            )
            continue
        if send_mail_to(destinatarios, subject, html_shell(subject, rows, footer)):
            db.add(NotificationLog(lease_id=lease.id, kind=kind))
            db.commit()
            sent_count += 1

    if sent_count:
        logger.info("Recordatorios de vencimiento enviados: %d", sent_count)
    return sent_count
