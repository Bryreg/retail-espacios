"""La cola de correos: ningún aviso se pierde en silencio (auditoría P1-4).

**Antes.** Cada pedido que mandaba un correo lo dejaba en un ``BackgroundTask``
de FastAPI y se olvidaba: si el proveedor de correo fallaba (una
``EMAIL_API_KEY`` revocada, un 5xx de Brevo) el correo se perdía, y el motivo
—``send_mail_to`` lo tiraba— no quedaba en ninguna parte. Un redeploy en el
medio del envío también lo perdía.

**Ahora.** El pedido sigue igual —mismos destinatarios, mismo asunto, mismo
cuerpo, y el correo sale enseguida, después de la respuesta—, pero antes de
salir queda ANOTADO en ``correos_pendientes``, en la base del supermercado:

1. ``encolar_correo`` (en el pedido) programa la tarea de fondo.
2. La tarea anota la fila (``pendiente``, con ``proximo_intento`` diez minutos
   adelante: ese rato es suyo) y manda. Si sale, ``enviado``. Si no, una línea
   WARNING en el log y el próximo intento según ``ESPERAS``.
3. El mantenimiento (``despachar_pendientes``, en cada vuelta y en el cron)
   reintenta lo vencido. Después de ``MAX_INTENTOS``, ``abandonado`` —con su
   WARNING—: el correo no se manda nunca más, y la fila queda para mirar.
4. ``purgar_viejos``: lo enviado se borra a los 30 días y lo abandonado a los
   90. La fila lleva direcciones de terceros; no se guardan más de lo necesario.

Es «al menos una vez»: si el proceso muere justo después de que el proveedor
aceptó el correo y antes de marcarlo, el mantenimiento lo vuelve a mandar. Es
preferible a perderlo.

**El log nunca lleva direcciones**: cuántos destinatarios y a qué dominios
(``observabilidad.resumen_de_destinatarios``), y el motivo pasa por
``sin_correos``.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Callable, Optional

from sqlalchemy.orm import Session, sessionmaker

from app.models.correos import CorreoPendiente
from app.observabilidad import resumen_de_destinatarios, sin_correos

log = logging.getLogger("recabra.correos")

#: Espera antes del intento n+1, después de fallar el intento n (1-based).
ESPERAS = (
    timedelta(minutes=5),
    timedelta(minutes=30),
    timedelta(hours=2),
    timedelta(hours=6),
    timedelta(hours=12),
    timedelta(hours=24),
)
MAX_INTENTOS = len(ESPERAS) + 1
#: El rato que la fila recién anotada le pertenece al envío inmediato.
RESERVA_DEL_ENVIO_INMEDIATO = timedelta(minutes=10)
#: Cuántos correos manda una vuelta del mantenimiento, por supermercado.
LOTE = 50

DIAS_ENVIADOS = 30
DIAS_ABANDONADOS = 90


def _ahora() -> datetime:
    return datetime.now(timezone.utc)


def _aware(momento: datetime) -> datetime:
    """SQLite devuelve las fechas sin huso aunque la columna lo pida."""
    return momento if momento.tzinfo else momento.replace(tzinfo=timezone.utc)


def _intentar(enviar: Optional[Callable], destinatarios: list[str], asunto: str, html: str) -> tuple[bool, str]:
    """Manda y dice si salió y, si no, por qué (sin direcciones).

    ``enviar`` es la función de envío de quien encoló —el ``send_mail_to_bg``
    de su router, que es lo que las pruebas reemplazan—. Si es la de verdad, se
    usa ``mailer.send_mail_to``, y el motivo sale de ``motivo_del_ultimo_fallo``. Una
    función que no informa (devuelve ``None``) cuenta como enviada.
    """
    from app.services import mailer

    if enviar is None or enviar is mailer.send_mail_to_bg or enviar is mailer.send_mail_to:
        # Por `mailer.send_mail_to`, buscado en el módulo en cada llamada: el
        # mismo caño de siempre (y el que algunas pruebas reemplazan).
        try:
            ok = mailer.send_mail_to(destinatarios, asunto, html)
        except Exception as e:  # noqa: BLE001
            return False, sin_correos(f"{type(e).__name__}: {e}")
        return ok is not False, ("" if ok is not False else sin_correos(mailer.motivo_del_ultimo_fallo()))
    try:
        resultado = enviar(destinatarios, asunto, html)
    except Exception as e:  # noqa: BLE001 — una falla es un reintento, no un 500
        return False, sin_correos(f"{type(e).__name__}: {e}")
    return resultado is not False, ""


def _registrar_falla(fila: CorreoPendiente, motivo: str, ahora: datetime) -> None:
    fila.intentos = (fila.intentos or 0) + 1
    fila.ultimo_error = (motivo or "sin motivo")[:500]
    destinatarios = json.loads(fila.destinatarios_json or "[]")
    if fila.intentos >= MAX_INTENTOS:
        fila.estado = "abandonado"
        log.warning(
            "Correo #%s abandonado tras %s intentos: «%s», %s. Último motivo: %s",
            fila.id, fila.intentos, fila.asunto, resumen_de_destinatarios(destinatarios), fila.ultimo_error,
        )
        return
    espera = ESPERAS[min(fila.intentos, len(ESPERAS)) - 1]
    fila.proximo_intento = ahora + espera
    log.warning(
        "Correo #%s no salió (intento %s de %s; el próximo en %s): «%s», %s. Motivo: %s",
        fila.id, fila.intentos, MAX_INTENTOS, espera, fila.asunto,
        resumen_de_destinatarios(destinatarios), fila.ultimo_error,
    )


def _registrar_envio(fila: CorreoPendiente, ahora: datetime) -> None:
    fila.intentos = (fila.intentos or 0) + 1
    fila.estado = "enviado"
    fila.enviado_en = ahora
    fila.ultimo_error = None


def encolar_correo(tareas, db: Session, enviar: Optional[Callable], destinatarios, asunto: str,
                   html: str) -> None:
    """En lugar de ``tareas.add_task(send_mail_to_bg, destinatarios, asunto, html)``:
    ``encolar_correo(tareas, db, send_mail_to_bg, destinatarios, asunto, html)``.

    Mismo momento de envío (después de la respuesta), mismos destinatarios y
    mismo contenido; la diferencia es que queda anotado y se reintenta.
    ``db`` es la sesión del pedido: de ahí sale la base del supermercado.
    ``enviar`` es el ``send_mail_to_bg`` que el router importó —el que las
    pruebas reemplazan para ver qué salió—; ``None`` usa el de ``mailer``.
    """
    tareas.add_task(_anotar_y_enviar, db.get_bind(), enviar, list(destinatarios or []), asunto, html)


def _anotar_y_enviar(motor, enviar, destinatarios: list[str], asunto: str, html: str) -> None:
    """La tarea de fondo: anota, manda y marca. Nunca levanta."""
    sesion = sessionmaker(bind=motor, autoflush=False)()
    fila = None
    try:
        try:
            fila = CorreoPendiente(
                destinatarios_json=json.dumps(destinatarios, ensure_ascii=False),
                asunto=(asunto or "")[:300],
                cuerpo_html=html or "",
                estado="pendiente",
                intentos=0,
                proximo_intento=_ahora() + RESERVA_DEL_ENVIO_INMEDIATO,
            )
            sesion.add(fila)
            sesion.commit()
        except Exception:  # noqa: BLE001
            # Sin la fila, el correo sale igual —como antes—, sólo que sin
            # reintento: que no anotarlo no sea además no mandarlo.
            log.warning("No se pudo anotar el correo «%s» en la cola; se manda sin reintento", asunto, exc_info=True)
            sesion.rollback()
            fila = None
        ok, motivo = _intentar(enviar, destinatarios, asunto, html)
        if fila is None:
            if not ok:
                log.warning("Correo «%s» no salió (%s): %s", asunto, resumen_de_destinatarios(destinatarios), motivo)
            return
        try:
            if ok:
                _registrar_envio(fila, _ahora())
            else:
                _registrar_falla(fila, motivo, _ahora())
            sesion.commit()
        except Exception:  # noqa: BLE001
            log.warning("No se pudo marcar el correo #%s", getattr(fila, "id", "?"), exc_info=True)
            sesion.rollback()
    finally:
        sesion.close()


def despachar_pendientes(db: Session, ahora: Optional[datetime] = None) -> dict:
    """Reintenta lo que está ``pendiente`` y vencido. Lo llama el mantenimiento,
    una vez por supermercado. Devuelve ``{"enviados": n, "fallidos": n}``."""
    ahora = ahora or _ahora()
    enviados = fallidos = 0
    filas = (
        db.query(CorreoPendiente)
        .filter(CorreoPendiente.estado == "pendiente", CorreoPendiente.proximo_intento <= ahora)
        .order_by(CorreoPendiente.id)
        .limit(LOTE)
        .all()
    )
    for fila in filas:
        try:
            destinatarios = json.loads(fila.destinatarios_json or "[]")
        except ValueError:
            destinatarios = []
        ok, motivo = _intentar(None, destinatarios, fila.asunto, fila.cuerpo_html)
        if ok:
            _registrar_envio(fila, ahora)
            enviados += 1
        else:
            _registrar_falla(fila, motivo, ahora)
            fallidos += 1
        # Una por una: si el proceso se corta a mitad del lote, lo que ya salió
        # queda marcado y no se repite.
        db.commit()
    return {"enviados": enviados, "fallidos": fallidos}


def purgar_viejos(db: Session, ahora: Optional[datetime] = None) -> int:
    ahora = ahora or _ahora()
    borrados = (
        db.query(CorreoPendiente)
        .filter(CorreoPendiente.estado == "enviado",
                CorreoPendiente.creado_en < ahora - timedelta(days=DIAS_ENVIADOS))
        .delete(synchronize_session=False)
    )
    borrados += (
        db.query(CorreoPendiente)
        .filter(CorreoPendiente.estado == "abandonado",
                CorreoPendiente.creado_en < ahora - timedelta(days=DIAS_ABANDONADOS))
        .delete(synchronize_session=False)
    )
    if borrados:
        db.commit()
    return borrados


def pendientes(db: Session) -> int:
    """Cuántos correos esperan reintento (para la consola y el health)."""
    return db.query(CorreoPendiente).filter(CorreoPendiente.estado == "pendiente").count()
