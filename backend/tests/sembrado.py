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
