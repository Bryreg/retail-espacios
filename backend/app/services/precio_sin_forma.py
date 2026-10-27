"""Contratos de antes de Vender: ¿su valor era del mes o del total? (2026-10-25)

Desde la «fase 17» el valor de un contrato es lo acordado por todo el plazo, y
desde el rediseño de Vender (#84, #85) Supervisar lo reparte en meses para «Al
mes». Pero hay contratos cargados antes —en GALERÍAS, todos— con el valor del
MES en ese campo: el sistema los leía como el total y el «al mes» salía
dividido por la duración.

Un contrato así se reconoce porque no tiene forma de precio guardada
(``condiciones_de_contrato``) ni cobra por ventas, y vale más de cero. Quien
administra le dice cómo se lee, en Supervisar → «Para revisar» → Corregir:

· «Es al mes»: el valor pasa a ser lo de cada mes y el total, ese valor × los
  meses del contrato (``meses_entre``, redondeado al peso, la misma cuenta de
  Vender). Queda escrito como «al mes».
· «Es el total»: el valor no cambia; queda escrito como total y sale de la
  lista.
· «Se cobra por % de las ventas» (2026-10-27): el valor que se cargó era un
  marcador (en GALERÍAS, $ 1) porque lo que se cobra sale de las ventas. Queda
  como cualquier contrato por ventas de Vender: valor 0 y su cobro
  (``cobros_por_venta``) con el porcentaje y el corte; los cortes se cargan
  como siempre, desde «Ventas por cargar».

Las tres guardan lo de antes (``precios_corregidos``) para deshacerlo, y
ninguna manda correos: es corregir cómo se lee un dato, no cambiar un contrato
(decisión del dueño, 2026-10-25). Todo o nada, y cada contrato con el valor
que la pantalla mostró (409 ``contrato_cambio`` si cambió entretanto).

Ninguna función hace commit.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.fechas import hoy
from app.models.models import Space, SpaceLease
from app.models.vender import CORTES, CobroPorVenta, CondicionesDeContrato, CorteDeVenta, PrecioCorregido
from app.services.layout_lookup import normalizar
from app.services.meses import meses_entre

#: Cuántos contratos se corrigen de una vez, como mucho.
MAX_POR_VEZ = 1000


def _error(status: int, code: str, message: str) -> HTTPException:
    return HTTPException(status_code=status, detail={"code": code, "message": message})


def al_peso(v: float) -> float:
    """Redondeado al peso, con los medios hacia arriba (el ``Math.round`` de
    Vender para un valor positivo)."""
    return float(Decimal(repr(float(v))).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def al_centavo(v: float) -> Decimal:
    return Decimal(repr(float(v or 0))).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _estado(lease: SpaceLease, dia: date) -> str:
    if not lease.is_active:
        return "cerrado"
    if lease.end_date < dia:
        return "vencido"
    if lease.start_date > dia:
        return "proximo"
    return "vigente"


@dataclass
class Fila:
    lease_id: int
    espacio: str
    proveedor: str
    desde: date
    hasta: date
    valor: float
    meses: float
    total_si_es_al_mes: float
    estado: str

    def out(self) -> dict:
        return {"lease_id": self.lease_id, "espacio": self.espacio, "proveedor": self.proveedor,
                "desde": self.desde, "hasta": self.hasta, "valor": self.valor,
                "meses": round(self.meses, 4), "total_si_es_al_mes": self.total_si_es_al_mes, "estado": self.estado}


def _sin_forma(db: Session, sede: Optional[str] = None, ids: Optional[list[int]] = None, para_escribir: bool = False):
    q = db.query(SpaceLease).join(Space, SpaceLease.space_id == Space.id)
    q = q.filter(~SpaceLease.id.in_(db.query(CondicionesDeContrato.lease_id)),
                 ~SpaceLease.id.in_(db.query(CobroPorVenta.lease_id)),
                 SpaceLease.monthly_rent > 0)
    if sede is not None:
        q = q.filter(Space.sede == sede)
    if ids is not None:
        q = q.filter(SpaceLease.id.in_(ids or [-1]))
    if para_escribir:
        q = q.with_for_update()
    return q.order_by(SpaceLease.start_date.desc(), SpaceLease.id).all()


def _fila(lease: SpaceLease, dia: date) -> Fila:
    sede = normalizar(lease.space.sede) if lease.space is not None else ""
    codigo = lease.space.code if lease.space is not None else ""
    if sede and codigo.upper().startswith(f"{sede}-"):
        codigo = codigo[len(sede) + 1:]
    meses = meses_entre(lease.start_date, lease.end_date)
    valor = float(lease.monthly_rent or 0)
    return Fila(lease_id=lease.id, espacio=codigo, proveedor=lease.supplier.name if lease.supplier else "",
                desde=lease.start_date, hasta=lease.end_date, valor=valor, meses=meses,
                total_si_es_al_mes=al_peso(valor * meses), estado=_estado(lease, dia))


def pendientes(db: Session, sede: str) -> list[dict]:
    """Los contratos de la sede sin forma de precio: los vigentes y próximos
    primero, después los vencidos y los cerrados (todos cuentan: los vencidos
    hacen los históricos)."""
    dia = hoy()
    filas = [_fila(x, dia) for x in _sin_forma(db, normalizar(sede))]
    orden = {"vigente": 0, "proximo": 1, "vencido": 2, "cerrado": 3}
    filas.sort(key=lambda f: (orden[f.estado], f.espacio, f.desde))
    return [f.out() for f in filas]


def corregir(db: Session, modo: str, contratos: list[dict], actor: str,
             cobro: Optional[dict] = None) -> list[PrecioCorregido]:
    """Les dice a esos contratos cómo se lee su valor. Todo o nada: cada uno
    tiene que seguir sin forma y con el valor que se mostró. Con ``ventas``,
    ``cobro`` trae el porcentaje y el corte (los mismos para todos)."""
    if modo not in ("mensual", "total", "ventas"):
        raise _error(422, "modo_invalido", "Un valor se lee «al mes», como el total o se cobra por % de las ventas.")
    if modo == "ventas":
        pct = (cobro or {}).get("porcentaje")
        if not isinstance(pct, (int, float)) or not (0 < float(pct) <= 100):
            raise _error(422, "cobro", "Escribí el porcentaje de las ventas (más de 0 y hasta 100).")
        if (cobro or {}).get("corte") not in CORTES:
            raise _error(422, "cobro", "Elegí si el corte es cada mes o al final.")
    if not contratos:
        raise _error(422, "sin_contratos", "Elegí al menos un contrato.")
    if len(contratos) > MAX_POR_VEZ:
        raise _error(422, "demasiados", f"Se corrigen hasta {MAX_POR_VEZ} contratos de una vez.")
    esperado = {int(c["lease_id"]): al_centavo(c["valor"]) for c in contratos}
    leases = {x.id: x for x in _sin_forma(db, ids=list(esperado), para_escribir=True)}
    for lease_id, valor in esperado.items():
        x = leases.get(lease_id)
        if x is None or al_centavo(x.monthly_rent) != valor:
            raise _error(409, "contrato_cambio",
                         "Un contrato cambió mientras lo mirabas (o ya se corrigió): recargá y volvé a intentar.")
    hechos = []
    for lease_id in esperado:
        x = leases[lease_id]
        antes = float(x.monthly_rent)
        meses = meses_entre(x.start_date, x.end_date)
        if modo == "ventas":
            # Como un contrato por ventas de Vender: el valor va en 0 y lo que
            # se cobra sale de los cortes.
            despues = 0.0
            db.add(CobroPorVenta(lease_id=x.id, porcentaje=float(cobro["porcentaje"]), corte=cobro["corte"],
                                 creado_por=actor))
        else:
            despues = al_peso(antes * meses) if modo == "mensual" else antes
            db.add(CondicionesDeContrato(lease_id=x.id, modo_precio=modo, valor_tecleado=antes))
        x.monthly_rent = despues
        fila = PrecioCorregido(lease_id=x.id, modo_precio=modo, valor_antes=antes, meses=meses,
                               total_despues=despues, por=actor)
        db.add(fila)
        hechos.append(fila)
    db.flush()
    return hechos


def deshacer(db: Session, lease_ids: list[int]) -> list[PrecioCorregido]:
    """Vuelve esos contratos a como estaban: el valor de antes y sin forma.
    Sólo si nadie los tocó después (el valor sigue siendo el que quedó)."""
    if not lease_ids:
        raise _error(422, "sin_contratos", "Elegí al menos un contrato.")
    filas = {f.lease_id: f for f in db.query(PrecioCorregido).filter(PrecioCorregido.lease_id.in_(lease_ids)).all()}
    leases = {x.id: x for x in db.query(SpaceLease).filter(SpaceLease.id.in_(lease_ids)).with_for_update().all()}
    for lease_id in lease_ids:
        f, x = filas.get(lease_id), leases.get(lease_id)
        if f is not None and f.modo_precio == "ventas":
            # Por ventas: sólo si sigue así y todavía no se cargó ninguna venta
            # (lo cobrado no se pierde deshaciendo).
            sigue = db.get(CobroPorVenta, lease_id) is not None and x is not None and al_centavo(x.monthly_rent) == al_centavo(0)
            cortes = db.query(CorteDeVenta.id).filter(CorteDeVenta.lease_id == lease_id).first() is not None
            if not sigue or cortes:
                raise _error(409, "contrato_cambio",
                             "Ese contrato se editó o ya tiene ventas cargadas: ya no se puede deshacer desde acá.")
            continue
        c = db.get(CondicionesDeContrato, lease_id)
        if f is None or x is None or c is None or al_centavo(x.monthly_rent) != al_centavo(f.total_despues) \
                or c.modo_precio != f.modo_precio:
            raise _error(409, "contrato_cambio",
                         "Ese contrato se editó después de corregirlo: ya no se puede deshacer desde acá.")
    hechos = []
    for lease_id in lease_ids:
        f, x = filas[lease_id], leases[lease_id]
        x.monthly_rent = f.valor_antes
        if f.modo_precio == "ventas":
            db.delete(db.get(CobroPorVenta, lease_id))
        else:
            db.delete(db.get(CondicionesDeContrato, lease_id))
        db.delete(f)
        hechos.append(f)
    db.flush()
    return hechos
