# Contratos + correos: creación, recordatorios de vencimiento y config pendiente

> Engram #334 · `notifications/email` · **snapshot histórico 2026-08-23 — el estado vigente está en [docs/ESTADO.md](../ESTADO.md)**

**Qué** (prioridad #1 del usuario): al crear un contrato (`POST /spaces/{id}/leases`) sale email "Nuevo contrato" vía BackgroundTasks (`services/mailer.py`, smtplib STARTTLS). Recordatorios de vencimiento a 30/15/7/1 días (configurables en `app_config.reminder_days`): loop asyncio en lifespan de main.py corre `expire_leases` + `check_expiring_leases` al arrancar y cada 12h; dedup por tabla `notification_log` (lease_id, kind="expiry_{días}") — el log solo se inserta si el envío fue exitoso, así SMTP mal configurado reintenta al próximo ciclo.

**Config**: destinatarios en `app_config.notify_emails` (editable en modal Configuración admin, con botón "Enviar correo de prueba" → POST /notifications/test). SMTP por env vars en Render: SMTP_HOST (default smtp.gmail.com), SMTP_PORT (587), SMTP_USER, SMTP_PASSWORD (app password de Gmail, requiere 2FA), MAIL_FROM. Sin credenciales el sistema loguea y sigue — nunca crashea ni bloquea requests.

**PENDIENTE del usuario**: verificar que SMTP_USER/SMTP_PASSWORD estén seteados en Render y notify_emails configurado — al 2026-08-23 notify_emails estaba vacío (visto durante el seeding).
