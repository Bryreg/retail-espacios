"""El canon de un mes: UNA definición, escrita dos veces (auditoría P1-16).

Hasta el 2026-10-30 había dos: Inicio, el Mapa y Análisis sumaban en el
navegador el valor al mes COMPLETO de cada contrato vigente hoy, y «Todas las
sedes», la curva de 12 meses y la variación usaban ``GET /dashboard/serie``,
que prorrateaba por días y devolvía decimales. La misma sede decía dos cifras.

La que queda es la del servidor, al peso:

· cada contrato aporta su canon AL MES (``meses.al_mes_de``: el total repartido
  en los meses de su plazo FIRMADO) por los días del mes que corre ÷ los días
  del mes. Uno que arranca el 16 de un mes de 30 aporta la mitad. Si se dio de
  baja antes de terminar, corre hasta ``corta`` (el día anterior a la baja,
  ``historial.tramo_devengado``): la baja corta los días, no cambia el precio;
* lo cobrado en los cortes de un contrato por % de las ventas, repartido por
  días si el corte cruza meses (``cobros.cobrado_por_contrato``);
· la suma, redondeada al peso con los medios hacia arriba (``meses.al_peso``).

Su gemela es ``frontend/src/utils/canon.ts`` y las dos corren los MISMOS casos:
``frontend/scripts/casos/canon.json`` (acá, ``tests/test_canon.py``; allá,
``scripts/probar-canon.mjs``). Si una cambia, cambian la otra y los casos en el
mismo commit. El orden de las operaciones es el mismo en las dos a propósito
(``al_mes * dias / dias_del_mes``): con dobles IEEE dan el mismo número.
"""
from __future__ import annotations

from calendar import monthrange
from datetime import date
from typing import Iterable, Optional

from app.services.meses import al_mes_de, al_peso


def limites_del_mes(anio: int, mes: int) -> tuple[date, date]:
    return date(anio, mes, 1), date(anio, mes, monthrange(anio, mes)[1])


def devengado_del_contrato(valor_total: float, desde: date, hasta: date, anio: int, mes: int,
                           corta: Optional[date] = None) -> float:
    """Lo que ``valor_total`` (de ``desde`` a ``hasta``) devenga en ese mes, sin
    redondear. ``corta``: el último día que corrió, si se dio de baja antes."""
    if not desde or not hasta:
        return 0.0
    ini, fin = limites_del_mes(anio, mes)
    ultimo = min(hasta, corta) if corta else hasta
    a, b = max(desde, ini), min(ultimo, fin)
    if a > b:
        return 0.0
    al_mes = al_mes_de(float(valor_total or 0), desde, hasta)
    return al_mes * ((b - a).days + 1) / monthrange(anio, mes)[1]


def devengado_del_corte(monto: float, desde: date, hasta: date, anio: int, mes: int) -> float:
    """Lo de un corte de ventas que cae en ese mes, repartido por días."""
    ini, fin = limites_del_mes(anio, mes)
    dias = (hasta - desde).days + 1
    cruce = (min(hasta, fin) - max(desde, ini)).days + 1
    if dias <= 0 or cruce <= 0:
        return 0.0
    return float(monto or 0) * cruce / dias


def canon_del_mes(contratos: Iterable[dict], cortes: Iterable[dict], anio: int, mes: int) -> float:
    """El canon de ese mes, al peso. ``contratos``: ``{valor, desde, hasta,
    corta?}``; ``cortes``: ``{monto, desde, hasta}`` (fechas ``date``)."""
    total = 0.0
    for c in contratos:
        total += devengado_del_contrato(c["valor"], c["desde"], c["hasta"], anio, mes, c.get("corta"))
    for c in cortes:
        total += devengado_del_corte(c["monto"], c["desde"], c["hasta"], anio, mes)
    return al_peso(total)
