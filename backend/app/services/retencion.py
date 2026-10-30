"""Cuánto se guarda cada cosa (auditoría pre-lanzamiento, P2-23; Ley 1581,
art. 4 literales c y d; Decreto 1377, art. 11).

Cada plazo es un valor por defecto PROPUESTO que se cambia con una variable de
entorno, porque varios los tiene que confirmar el abogado (la política los
marca ``[COMPLETAR: confirmar plazo]``). Lo que se purga acá es lo que no es
prueba de ningún contrato ni de ninguna autorización: líneas de bitácora
viejas, intentos fallidos, sesiones ya vencidas, altas que nadie atendió y
correos ya enviados. Los contratos, los montajes, las constancias de
consentimiento y la facturación NO pasan por acá.

Lo corre el mantenimiento (``main._run_lease_maintenance``): en la base de cada
supermercado, ``bitacora.purgar`` con ``dias("RETENCION_BITACORA_DIAS")``,
``purgar_cliente`` y la purga de la cola de correos; una vez por vuelta,
``purgar_registro`` (y el cierre del mes, ``plataforma_tendencia.purgar_registro``,
la bitácora del operador con ``dias("RETENCION_BITACORA_PLATAFORMA_DIAS")``).
Cada purga devuelve cuántas filas se fueron, y el resumen del mantenimiento lo
dice.

| Variable | Por defecto | Qué |
|---|---|---|
| ``RETENCION_BITACORA_DIAS`` | 365 | Bitácora de cada supermercado (``audit_log``) |
| ``RETENCION_BITACORA_PLATAFORMA_DIAS`` | 760 | Bitácora del operador (``bitacora_plataforma``): 25 meses, uno más que la ventana del reporte de transparencia (24) |
| ``RETENCION_INTENTOS_DIAS`` | 1 | Intentos fallidos con IP (login legado, cuenta) y de export; los del alta, 24 h (``plataforma_tendencia``) |
| ``RETENCION_ALTAS_EN_ESPERA_DIAS`` | 90 | Altas que llegaron con el tope del día |
| ``RETENCION_CORREOS_ENVIADOS_DIAS`` | 30 | Correos de la cola ya enviados |
| ``RETENCION_CORREOS_ABANDONADOS_DIAS`` | 90 | Correos de la cola que no salieron |
| (sin variable) | al vencer | Sesiones cerradas con «Salir» y enlaces revocados: pasado su vencimiento el token ya no abre nada |
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone

log = logging.getLogger("recabra.retencion")

PLAZOS = {
    "RETENCION_BITACORA_DIAS": 365,
    "RETENCION_BITACORA_PLATAFORMA_DIAS": 760,
    "RETENCION_INTENTOS_DIAS": 1,
    "RETENCION_ALTAS_EN_ESPERA_DIAS": 90,
    "RETENCION_CORREOS_ENVIADOS_DIAS": 30,
    "RETENCION_CORREOS_ABANDONADOS_DIAS": 90,
}

#: Por debajo de esto un plazo no se acepta: un «0» tecleado por error no
#: puede vaciar la bitácora en la próxima vuelta del mantenimiento.
MINIMO_DIAS = 1


def dias(variable: str) -> int:
    defecto = PLAZOS[variable]
    bruto = (os.getenv(variable) or "").strip()
    if not bruto:
        return defecto
    try:
        valor = int(bruto)
    except ValueError:
        log.warning("%s=%r no es un número de días: se usa %d", variable, bruto, defecto)
        return defecto
    if valor < MINIMO_DIAS:
        log.warning("%s=%d es menos de %d día: se usa %d", variable, valor, MINIMO_DIAS, defecto)
        return defecto
    return valor


def _ahora() -> datetime:
    return datetime.now(timezone.utc)


def _antes_de(variable: str, ahora: datetime | None = None) -> datetime:
    return (ahora or _ahora()) - timedelta(days=dias(variable))


def purgar_cliente(db, ahora: datetime | None = None) -> dict:
    """La base de UN supermercado: los intentos del login legado (la bitácora
    la purga ``bitacora.purgar`` y la cola ``cola_de_correos.purgar_viejos``,
    los dos con los plazos de acá). Hace commit."""
    from app.models.models import LoginAttempt

    hecho = {
        "intentos_de_login": db.query(LoginAttempt)
        .filter(LoginAttempt.at < _antes_de("RETENCION_INTENTOS_DIAS", ahora))
        .delete(synchronize_session=False),
    }
    db.commit()
    return hecho


def purgar_registro(ahora: datetime | None = None) -> dict:
    """El registro de la plataforma, una vez por vuelta. Hace commit. (La
    bitácora del operador y los intentos del alta los purga
    ``plataforma_tendencia.purgar_registro``, que ya existía.)"""
    from app.clientes import sesion_registro
    from app.models.identidad import IntentoOauth
    from app.models.plataforma import AltaEnEspera, SesionCerrada
    from app.models.supresion import IntentoExport

    momento = ahora or _ahora()
    intentos = _antes_de("RETENCION_INTENTOS_DIAS", momento)
    reg = sesion_registro()
    try:
        hecho = {
            "intentos": sum(
                reg.query(modelo).filter(modelo.at < intentos).delete(synchronize_session=False)
                for modelo in (IntentoOauth, IntentoExport)
            ),
            "altas_en_espera": reg.query(AltaEnEspera)
            .filter(AltaEnEspera.creado_en < _antes_de("RETENCION_ALTAS_EN_ESPERA_DIAS", momento))
            .delete(synchronize_session=False),
            # Un token cerrado que ya venció no abre nada: su fila no protege de
            # nada. La memoria (`auth._cerradas`) la suelta al reiniciar.
            "sesiones_cerradas": reg.query(SesionCerrada)
            .filter(SesionCerrada.vence < momento)
            .delete(synchronize_session=False),
        }
        reg.commit()
        return hecho
    finally:
        reg.close()
