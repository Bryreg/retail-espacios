"""Sembrar un contrato con lo de UN MES, guardado como lo guarda el sistema.

Las pruebas de la consola de plataforma, de la asesoría y de la transparencia
siembran el «canon» de cada contrato como lo de un mes (sus cuentas a mano lo
suman como el ingreso del mes). El sistema guarda en ``monthly_rent`` el TOTAL
del plazo (fase 17) y la consola lo reparte en sus meses desde el 2026-10-26
(``services/meses.al_mes_de``): sembrar ``canon × meses`` deja las mismas
cuentas a mano, ahora sobre lo que de verdad se guarda.
"""
from datetime import date


def total_del_plazo(canon, ini, fin):
    from app.services.meses import meses_entre

    desde = date.fromisoformat(ini) if isinstance(ini, str) else ini
    hasta = date.fromisoformat(fin) if isinstance(fin, str) else fin
    m = meses_entre(desde, hasta)
    return canon * m if m > 0 and canon else canon


def marcar_cancelados(db):
    """Lo sembrado con ``is_active=False`` es un contrato CANCELADO antes de
    correr: se le deja su baja (``bajas_de_contrato``), como la deja «Cancelar
    el contrato».

    Desde el 2026-10-30 (auditoría P1-17) ``is_active`` en falso NO quiere decir
    cancelado: ``expire_leases`` lo apaga también a lo vencido por fecha, y lo
    vencido fue canon. Lo que distingue una baja es su fila (o su línea
    ``contrato.baja`` en la bitácora). Sin esto, un contrato «cancelado» de las
    siembras con el fin en el pasado contaría como terminado. La baja es del día
    que arrancaba: no aporta en ningún mes, como antes.

    Sin commit: va antes del ``commit`` de quien siembra."""
    from app.models.models import SpaceLease
    from app.models.vender import BajaDeContrato

    db.flush()
    ya = {lid for (lid,) in db.query(BajaDeContrato.lease_id).all()}
    for lease in db.query(SpaceLease).filter(SpaceLease.is_active.is_(False)).all():
        if lease.id not in ya:
            db.add(BajaDeContrato(lease_id=lease.id, efectiva=lease.start_date, motivo="cancelado", por="siembra"))
