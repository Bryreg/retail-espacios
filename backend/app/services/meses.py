"""La duración de un contrato en meses: una sola cuenta, escrita dos veces.

La usa Vender para «al mes» (lo que se escribe por mes × los meses = el total
que se guarda) y la va a usar Supervisar para la cuenta al revés (el total ÷
los meses = lo que paga al mes). Su gemela es ``frontend/src/utils/meses.ts``,
y las dos corren los MISMOS casos: ``frontend/scripts/casos/meses.json``
(acá, ``tests/test_meses.py``). Si una cambia, cambian la otra y los casos en
el mismo commit (``docs/rediseno/vender-api.md`` §6).

La regla: los meses calendario COMPLETOS entre ``desde`` y ``hasta + 1 día``
(los dos extremos cuentan, como en todo el proyecto: un contrato de un día dura
un día), más los días que sobran ÷ 30.

· 1 nov – 30 nov = 1; 1 nov – 31 ene = 3; 19 oct – 18 nov = 1.
· Un mes se suma desde el día de arranque y, si ese día no existe en el mes de
  llegada, se queda en el último (31 ene + 1 mes = 28 feb, o 29 en bisiesto).
  Se cuenta siempre desde el arranque y no de un mes al siguiente: 31 ene + 2
  meses es 31 mar, no 28 mar.
"""
from __future__ import annotations

import calendar
from datetime import date, timedelta

#: Lo que vale un día suelto: el mes comercial de treinta días.
DIAS_DEL_MES = 30


def _sumar_meses(d: date, n: int) -> date:
    """``d`` + ``n`` meses calendario, quedándose en el último día del mes de
    llegada si el de ``d`` no existe ahí."""
    total = d.month - 1 + n
    anio, mes = d.year + total // 12, total % 12 + 1
    return date(anio, mes, min(d.day, calendar.monthrange(anio, mes)[1]))


def meses_entre(desde: date, hasta: date) -> float:
    """Los meses de ``desde`` a ``hasta``, los dos incluidos. ``0`` si ``hasta``
    es anterior a ``desde`` (no hay plazo que contar)."""
    if hasta < desde:
        return 0.0
    fin = hasta + timedelta(days=1)
    completos = (fin.year - desde.year) * 12 + (fin.month - desde.month)
    # El conteo por calendario puede pasarse en uno (19 oct → 18 nov da 1, y
    # 19 oct → 10 nov también daría 1): se baja hasta que el mes entre entero.
    while completos > 0 and _sumar_meses(desde, completos) > fin:
        completos -= 1
    sobran = (fin - _sumar_meses(desde, completos)).days
    return completos + sobran / DIAS_DEL_MES
