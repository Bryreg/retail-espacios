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
· **Pasar a ventas** (``pasar_a_ventas``): un contrato que se cargó con un
  valor fijo cuando el cobro por ventas no existía —en POBLADO, ~30 con un
  `monthly_rent` de unos pocos pesos, que era el % escrito como plata— se pasa
  desde Supervisar → «Para revisar» → Corregir → «Bajo tarifa de referencia».
  Queda como uno de Vender: `monthly_rent` en 0 y su fila de
  `cobros_por_venta`; el valor viejo no se pierde (una línea al final de la
  nota del contrato y la bitácora).

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
from app.models.participaciones import Participacion
from app.models.vender import CORTES, CobroPorVenta, CondicionesDeContrato, CorteDeVenta
from app.services.mailer import format_cop


def _error(status: int, code: str, message: str) -> HTTPException:
    return HTTPException(status_code=status, detail={"code": code, "message": message})


def validar_cobro_por_ventas(porcentaje: Optional[float], corte: Optional[str]) -> None:
    """La regla del % de las ventas, la misma para Vender (``cobro`` del pedido,
    §1) y para pasar un contrato a ventas: más de 0 y hasta 100, y el corte
    cada mes o al final. 422 ``cobro`` si no."""
    if porcentaje is None or not (0 < porcentaje <= 100):
        raise _error(422, "cobro", "Escribí el porcentaje de las ventas (más de 0 y hasta 100).")
    if corte not in CORTES:
        raise _error(422, "cobro", "Elegí cada cuánto se carga lo vendido: cada mes o al final.")


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


def pesos_exactos(valor: float) -> str:
    """La plata entera y con punto de miles (``format_cop``); si trae
    decimales —un 0,5 que era «0,5 %»— con su coma, hasta el centavo: la
    constancia tiene que decir lo que había, no «$ 1». La gemela es
    ``pesosExactos`` (``components/Supervisar/paraRevisar.ts``)."""
    if float(valor).is_integer():
        return format_cop(valor)
    entero, dec = f"{float(valor):,.2f}".split(".")
    return f"$ {entero.replace(',', '.')},{dec.rstrip('0')}"


def linea_de_constancia(dia: date, anterior: float) -> str:
    """La línea que queda al final de la nota del contrato."""
    return f"Pasado a % de ventas el {dia.isoformat()} (valor anterior: {pesos_exactos(anterior)})"


def pasar_a_ventas(db: Session, lease_id: int, porcentaje: float, corte: str,
                   actor: Optional[str]) -> tuple[SpaceLease, CobroPorVenta, float]:
    """Pasa un contrato de valor fijo a cobro por un % de las ventas.

    Lo deja como lo deja Vender al guardar uno por ventas: `monthly_rent` en 0,
    su fila de `cobros_por_venta` y, si el precio se había tecleado en Vender
    (`condiciones_de_contrato`), lo tecleado en 0 (Vender manda 0 con ventas).
    El valor viejo queda escrito al final de la nota —sin tocar lo que ya
    decía—: la bitácora se purga al año y la nota no.

    Sólo un contrato que corre o que todavía no arranca: 404 si no existe; 409
    ``ya_por_ventas``, ``no_es_contrato`` (el término de una participación que
    no es contrato), ``contrato_cancelado`` o ``contrato_terminado``; 422
    ``cobro`` con un % fuera de (0, 100] o un corte que no es de ``CORTES``.
    Las reservas no tienen contrato (`reservas_de_espacio`, `precios_de_reserva`
    guardan su propio cobro): acá no se tocan.

    No hace commit. Devuelve ``(lease, cobro, valor_anterior)``."""
    validar_cobro_por_ventas(porcentaje, corte)
    lease = db.get(SpaceLease, lease_id)
    if lease is None:
        raise _error(404, "contrato_no_existe", "Ese contrato no existe.")
    if db.get(CobroPorVenta, lease_id) is not None:
        raise _error(409, "ya_por_ventas", "Ese contrato ya se cobra por un % de las ventas.")
    termino = db.query(Participacion).filter(Participacion.lease_id == lease_id).first()
    if termino is not None and termino.estado != "contrato":
        raise _error(409, "no_es_contrato", "Eso no es un contrato: una reserva guarda su propio cobro.")
    dia = hoy()
    # `is_active = False` lo deja la cancelación y también `expire_leases` al
    # vencer: lo que distingue una de otra es si el plazo ya pasó (o, en una
    # participación, la baja del término).
    if (termino is not None and termino.baja_en is not None) or (not lease.is_active and lease.end_date >= dia):
        raise _error(409, "contrato_cancelado", "Ese contrato está cancelado: no se cambia cómo se cobra.")
    if lease.end_date < dia:
        raise _error(409, "contrato_terminado",
                     "Ese contrato ya terminó: se pasa a % de las ventas uno que corre o que todavía no arranca.")

    anterior = float(lease.monthly_rent or 0)
    lease.monthly_rent = 0
    linea = linea_de_constancia(dia, anterior)
    nota = (lease.notes or "").rstrip()
    lease.notes = f"{nota}\n{linea}" if nota else linea
    condicion = db.get(CondicionesDeContrato, lease_id)
    if condicion is not None:
        condicion.valor_tecleado = 0
    cobro = CobroPorVenta(lease_id=lease_id, porcentaje=float(porcentaje), corte=corte, creado_por=actor)
    db.add(cobro)
    db.flush()
    return lease, cobro, anterior
