"""El cobro por un porcentaje de las ventas (``docs/rediseno/vender-api.md`` §3).

Un contrato de Vender puede cobrarse por un % de lo que el proveedor vende en
el espacio en vez de un valor fijo. Su `monthly_rent` va en 0 —no hay nada fijo
que guardar— y la plata sale de los CORTES: cada período alguien carga lo
vendido y el servidor calcula lo que se cobra (ventas × porcentaje, redondeado
al peso).

· **Los períodos.** Con corte mensual, uno por mes calendario dentro del
  contrato: del 19 oct al 18 dic son 19–31 oct, 1–30 nov y 1–18 dic. Con corte
  «al final», uno solo: el contrato entero.
· **Pendiente** es un período que ya terminó (su último día es anterior a
  hoy, día de Colombia) y no tiene corte cargado. Un contrato cancelado debe
  igual lo que ya se vendió: sus períodos terminados siguen pendientes.
· **Las métricas** no lo cuentan como un contrato de $ 0: lo sacan de los
  promedios y suman lo cobrado (``cobrado_entre``), repartido por días entre
  los meses que cubre el corte.

Nada de esto hace commit: lo hace quien llama. Todo es plata: sólo lo leen
rutas de administración.
"""
from __future__ import annotations

import calendar
from datetime import date, timedelta
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.fechas import hoy
from app.models.models import Space, SpaceLease
from app.models.vender import CobroPorVenta, CorteDeVenta


def _error(status: int, code: str, message: str) -> HTTPException:
    return HTTPException(status_code=status, detail={"code": code, "message": message})


def _fin_de_mes(d: date) -> date:
    return date(d.year, d.month, calendar.monthrange(d.year, d.month)[1])


def periodos(desde: date, hasta: date, corte: str) -> list[tuple[date, date]]:
    """Los períodos de corte de un contrato del ``desde`` al ``hasta``."""
    if hasta < desde:
        return []
    if corte != "mensual":
        return [(desde, hasta)]
    fuera = []
    a = desde
    while a <= hasta:
        b = min(_fin_de_mes(a), hasta)
        fuera.append((a, b))
        a = b + timedelta(days=1)
    return fuera


def monto_de(ventas: float, porcentaje: float) -> float:
    """Lo que se cobra: ventas × porcentaje, redondeado al peso."""
    return float(round(float(ventas) * float(porcentaje) / 100))


def ids_por_ventas(db: Session) -> set[int]:
    """Los contratos que se cobran por ventas (sus ``lease_id``)."""
    return {lid for (lid,) in db.query(CobroPorVenta.lease_id).all()}


def cobrado_por_contrato(db: Session, desde: date, hasta: date) -> dict[int, float]:
    """Lo cobrado en los cortes de cada contrato por ventas, en ``[desde,
    hasta]``. Un corte que cruza meses («al final») se reparte por días: un
    corte de tres meses no cae entero en el último."""
    fuera: dict[int, float] = {}
    for c in (db.query(CorteDeVenta)
              .filter(CorteDeVenta.periodo_desde <= hasta, CorteDeVenta.periodo_hasta >= desde).all()):
        dias = (c.periodo_hasta - c.periodo_desde).days + 1
        cruce = (min(c.periodo_hasta, hasta) - max(c.periodo_desde, desde)).days + 1
        if dias <= 0 or cruce <= 0:
            continue
        fuera[c.lease_id] = fuera.get(c.lease_id, 0.0) + float(c.monto or 0) * cruce / dias
    return fuera


def cobrado_entre(db: Session, desde: date, hasta: date) -> float:
    """El total cobrado por ventas en ``[desde, hasta]``."""
    return sum(cobrado_por_contrato(db, desde, hasta).values())


def _cobros(db: Session, sede: Optional[str]):
    q = (db.query(CobroPorVenta, SpaceLease, Space)
         .join(SpaceLease, SpaceLease.id == CobroPorVenta.lease_id)
         .join(Space, Space.id == SpaceLease.space_id))
    if sede:
        q = q.filter(Space.sede == sede.strip().upper())
    return q.order_by(SpaceLease.start_date, SpaceLease.id).all()


def _cargados(db: Session, ids: list[int]) -> dict[int, list[CorteDeVenta]]:
    fuera: dict[int, list[CorteDeVenta]] = {}
    if not ids:
        return fuera
    for c in (db.query(CorteDeVenta).filter(CorteDeVenta.lease_id.in_(ids))
              .order_by(CorteDeVenta.periodo_desde).all()):
        fuera.setdefault(c.lease_id, []).append(c)
    return fuera


def pendientes(db: Session, sede: Optional[str] = None) -> list[dict]:
    """Los cortes vencidos sin cargar, del más viejo al más nuevo."""
    dia = hoy()
    filas = _cobros(db, sede)
    cargados = _cargados(db, [lease.id for _c, lease, _s in filas])
    fuera = []
    for cobro, lease, space in filas:
        hechos = {c.periodo_desde for c in cargados.get(lease.id, [])}
        for a, b in periodos(lease.start_date, lease.end_date, cobro.corte):
            if b < dia and a not in hechos:
                fuera.append({
                    "lease_id": lease.id, "espacio": space.code,
                    "proveedor": lease.supplier.name if lease.supplier else None,
                    "porcentaje": cobro.porcentaje, "periodo_desde": a, "periodo_hasta": b,
                })
    fuera.sort(key=lambda f: (f["periodo_hasta"], f["lease_id"]))
    return fuera


def resumen(db: Session, sede: Optional[str] = None) -> list[dict]:
    """Por contrato: porcentaje, corte, los cortes cargados y el próximo."""
    filas = _cobros(db, sede)
    cargados = _cargados(db, [lease.id for _c, lease, _s in filas])
    fuera = []
    for cobro, lease, space in filas:
        suyos = cargados.get(lease.id, [])
        hechos = {c.periodo_desde for c in suyos}
        proximo = next(((a, b) for a, b in periodos(lease.start_date, lease.end_date, cobro.corte)
                        if a not in hechos), None)
        fuera.append({
            "lease_id": lease.id, "espacio": space.code, "sede": space.sede,
            "proveedor": lease.supplier.name if lease.supplier else None, "marca": lease.marca,
            "desde": lease.start_date, "hasta": lease.end_date,
            "porcentaje": cobro.porcentaje, "corte": cobro.corte,
            "cortes": [{"periodo_desde": c.periodo_desde, "periodo_hasta": c.periodo_hasta,
                        "ventas": c.ventas, "monto": c.monto, "cargado_en": c.cargado_en,
                        "cargado_por": c.cargado_por} for c in suyos],
            "cobrado": sum(float(c.monto or 0) for c in suyos),
            "proximo_corte": ({"periodo_desde": proximo[0], "periodo_hasta": proximo[1]}
                              if proximo is not None else None),
        })
    return fuera


def cargar_corte(db: Session, lease_id: int, periodo_desde: date, periodo_hasta: date, ventas: float,
                 actor: Optional[str]) -> CorteDeVenta:
    """Carga lo vendido en UN período del contrato y calcula lo que se cobra.

    El período tiene que ser uno de los del contrato (``periodos``), ya
    terminado y sin corte cargado: un corte cargado no se pisa en silencio."""
    cobro = db.get(CobroPorVenta, lease_id)
    if cobro is None:
        raise _error(404, "sin_cobro_por_ventas", "Ese contrato no se cobra por ventas.")
    lease = db.get(SpaceLease, lease_id)
    if (periodo_desde, periodo_hasta) not in periodos(lease.start_date, lease.end_date, cobro.corte):
        raise _error(422, "periodo", "Ese período no es un corte de este contrato.")
    if periodo_hasta >= hoy():
        raise _error(422, "periodo_abierto", "Ese período todavía no terminó: se carga cuando termine.")
    if ventas is None or ventas < 0:
        raise _error(422, "ventas", "Escribí lo vendido en el período (0 o más).")
    ya = (db.query(CorteDeVenta.id)
          .filter(CorteDeVenta.lease_id == lease_id, CorteDeVenta.periodo_desde == periodo_desde).first())
    if ya is not None:
        raise _error(409, "corte_cargado", "Ese corte ya está cargado.")
    corte = CorteDeVenta(lease_id=lease_id, periodo_desde=periodo_desde, periodo_hasta=periodo_hasta,
                         ventas=float(ventas), monto=monto_de(ventas, cobro.porcentaje), cargado_por=actor)
    db.add(corte)
    db.flush()
    return corte
