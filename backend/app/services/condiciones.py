"""Cómo se dice el valor de un contrato en un correo.

Hasta el rediseño de Vender los correos decían «Valor mensual» o «Total
mensual» del lado de `monthly_rent`, que en Vender es el TOTAL por todo el
plazo (nunca se prorrateó): un contrato de tres meses por $ 1.800.000 llegaba
como «Valor mensual $ 1.800.000». Ahora dicen «Valor del contrato» y, si se
escribió por mes (`condiciones_de_contrato`), lo agregan entre paréntesis:
«$ 1.800.000 ($ 600.000 al mes)». Un contrato que se cobra por un % de las
ventas (`cobros_por_venta`) no tiene valor fijo: se dice el porcentaje.

La plata va siempre entera y con punto de miles (`format_cop`): «$ 1.8M» no
es un valor que se pueda firmar.
"""
from __future__ import annotations

from typing import Iterable, Optional

from sqlalchemy.orm import Session

from app.models.vender import CobroPorVenta, CondicionesDeContrato
from app.services.mailer import format_cop

ETIQUETA_DEL_VALOR = "Valor del contrato"


def porcentaje_texto(p: float) -> str:
    """``8`` → «8 %», ``7.5`` → «7,5 %», ``12.25`` → «12,25 %»."""
    texto = f"{float(p):.2f}".rstrip("0").rstrip(".")
    return f"{texto.replace('.', ',')} %"


def texto_de_cobro(cobro: CobroPorVenta) -> str:
    cuando = "corte mensual" if cobro.corte == "mensual" else "corte al final"
    return f"{porcentaje_texto(cobro.porcentaje)} de las ventas ({cuando})"


def condiciones_de(db: Session, ids: Iterable[int]) -> tuple[dict, dict]:
    """``({lease_id: CondicionesDeContrato}, {lease_id: CobroPorVenta})`` de
    esos contratos, leídos en dos consultas."""
    ids = sorted({i for i in ids if i is not None})
    if not ids:
        return {}, {}
    condiciones = {c.lease_id: c for c in
                   db.query(CondicionesDeContrato).filter(CondicionesDeContrato.lease_id.in_(ids)).all()}
    cobros = {c.lease_id: c for c in db.query(CobroPorVenta).filter(CobroPorVenta.lease_id.in_(ids)).all()}
    return condiciones, cobros


def al_mes(condicion: Optional[CondicionesDeContrato]) -> Optional[float]:
    """Lo que se tecleó por mes, si el precio se escribió así."""
    if condicion is None or condicion.modo_precio != "mensual" or not condicion.valor_tecleado:
        return None
    return float(condicion.valor_tecleado)


def texto_del_valor(valor: Optional[float], condicion: Optional[CondicionesDeContrato] = None,
                    cobro: Optional[CobroPorVenta] = None) -> str:
    """El valor de UN contrato, para un correo."""
    if cobro is not None:
        return texto_de_cobro(cobro)
    texto = format_cop(float(valor or 0))
    mensual = al_mes(condicion)
    if mensual is not None:
        texto += f" ({format_cop(mensual)} al mes)"
    return texto


def valor_de_lease(db: Session, lease) -> str:
    """``texto_del_valor`` de un contrato leyendo sus condiciones."""
    condiciones, cobros = condiciones_de(db, [lease.id])
    return texto_del_valor(lease.monthly_rent, condiciones.get(lease.id), cobros.get(lease.id))


def texto_del_total(filas: list[tuple[Optional[float], Optional[CondicionesDeContrato], Optional[CobroPorVenta]]]) -> Optional[str]:
    """El total de una tanda: la suma de los valores fijos y, si TODOS se
    escribieron por mes, la suma por mes. ``None`` si todos se cobran por
    ventas (no hay valor fijo que sumar)."""
    fijos = [(v, c) for v, c, cobro in filas if cobro is None]
    if not fijos:
        return None
    texto = format_cop(sum(float(v or 0) for v, _c in fijos))
    mensuales = [al_mes(c) for _v, c in fijos]
    if all(m is not None for m in mensuales):
        texto += f" ({format_cop(sum(mensuales))} al mes)"
    if len(fijos) < len(filas):
        texto += " más lo que se cobre por ventas"
    return texto
