"""Cómo terminó cada contrato (rediseño UX, 2026-10-27).

`space_leases.is_active` en falso no dice POR QUÉ el contrato dejó de correr:
lo apaga `expire_leases` al vencer por fecha (terminó solo), «Cancelar el
contrato» (`DELETE /spaces/{id}/leases/{lease_id}`, que anota `contrato.baja`
en la bitácora) y «Editar contrato» cuando lo reemplaza
(`contratos_reemplazados`). Para el historial de la ficha y la serie de
Indicadores no es lo mismo: lo terminado fue canon de verdad; lo cancelado y lo
reemplazado, no (lo reemplazado sigue en los contratos que lo reemplazan).

Sin tabla nueva ni migración: se lee de lo que ya se anota.

**Hasta qué día corrió lo cancelado** (auditoría P2-13, 2026-10-30). Antes lo
cancelado salía de TODOS los meses de la serie: un contrato de seis meses
cancelado en el cuarto dejaba de haber sido canon en los tres primeros. Ahora
la baja guarda su fecha efectiva (`bajas_de_contrato`, tabla nueva) y lo
cancelado se devenga hasta el día anterior (`tramo_devengado`). Para las bajas
de antes de la tabla, la fecha es la de su línea `contrato.baja` en la
bitácora (día de Colombia). El borrado de una sede también deja su fila (motivo
«sede»): lo que se cerró con ella corrió hasta ese día.
"""
from datetime import date, timedelta

from sqlalchemy.orm import Session

from app.fechas import ZONA_DEL_NEGOCIO
from app.models.models import AuditEntry
from app.models.vender import BajaDeContrato, ContratoReemplazado


def cerrados_a_mano(db: Session, lease_ids) -> dict[int, str]:
    """De esos contratos, los que alguien cerró: ``{lease_id: "cancelado" |
    "reemplazado"}``. Los demás que estén apagados terminaron por fecha."""
    ids = sorted({int(i) for i in lease_ids})
    if not ids:
        return {}
    fuera: dict[int, str] = {}
    for (eid,) in (db.query(AuditEntry.entidad_id)
                   .filter(AuditEntry.accion == "contrato.baja", AuditEntry.entidad == "contrato",
                           AuditEntry.entidad_id.in_([str(i) for i in ids])).all()):
        try:
            fuera[int(eid)] = "cancelado"
        except (TypeError, ValueError):
            continue
    for (lid,) in db.query(BajaDeContrato.lease_id).filter(BajaDeContrato.lease_id.in_(ids)).all():
        fuera[int(lid)] = "cancelado"
    for (lid,) in db.query(ContratoReemplazado.lease_id).filter(ContratoReemplazado.lease_id.in_(ids)).all():
        fuera[int(lid)] = "reemplazado"
    return fuera


def _dia_de_colombia(instante) -> date:
    if instante.tzinfo is None:
        # SQLite devuelve la marca sin huso: se guardó en UTC.
        from datetime import timezone
        instante = instante.replace(tzinfo=timezone.utc)
    return instante.astimezone(ZONA_DEL_NEGOCIO).date()


def bajas_efectivas(db: Session, lease_ids) -> dict[int, date]:
    """``{lease_id: día desde el que ya no corre}`` de los contratos dados de
    baja: la tabla `bajas_de_contrato` y, para las bajas de antes de la tabla,
    el día de su línea `contrato.baja` en la bitácora (la primera)."""
    ids = sorted({int(i) for i in lease_ids})
    if not ids:
        return {}
    fuera: dict[int, date] = {}
    for eid, at in (db.query(AuditEntry.entidad_id, AuditEntry.at)
                    .filter(AuditEntry.accion == "contrato.baja", AuditEntry.entidad == "contrato",
                            AuditEntry.entidad_id.in_([str(i) for i in ids]))
                    .order_by(AuditEntry.at).all()):
        try:
            lid = int(eid)
        except (TypeError, ValueError):
            continue
        if at is not None and lid not in fuera:
            fuera[lid] = _dia_de_colombia(at)
    for lid, efectiva in (db.query(BajaDeContrato.lease_id, BajaDeContrato.efectiva)
                          .filter(BajaDeContrato.lease_id.in_(ids)).all()):
        fuera[int(lid)] = efectiva
    return fuera


def anotar_baja(db: Session, lease, efectiva: date, motivo: str = "cancelado", por: str | None = None) -> None:
    """Guarda el día efectivo de la baja de ``lease``. **Sin commit**: viaja
    con la transacción de quien cancela (o borra la sede)."""
    fila = db.get(BajaDeContrato, lease.id)
    if fila is None:
        db.add(BajaDeContrato(lease_id=lease.id, efectiva=efectiva, motivo=motivo, por=por))
    else:
        fila.efectiva, fila.motivo, fila.por = efectiva, motivo, por


def estado_del_contrato(lease, cerrados: dict[int, str], hoy_) -> str:
    """vigente · proximo · terminado · cancelado · reemplazado."""
    if lease.id in cerrados:
        return cerrados[lease.id]
    if not lease.is_active:
        # Apagado sin que nadie lo cerrara: venció por fecha. Uno apagado que
        # todavía no terminó y que nadie canceló (una sede archivada) no corre.
        return "terminado" if lease.end_date and lease.end_date < hoy_ else "cancelado"
    if lease.end_date and lease.end_date < hoy_:
        return "terminado"
    if lease.start_date and lease.start_date > hoy_:
        return "proximo"
    return "vigente"


def fue_canon(lease, cerrados: dict[int, str], hoy_) -> bool:
    """¿Cuenta como canon que corrió (o corre)? Todo menos lo cancelado o
    reemplazado (y lo apagado sin terminar)."""
    return estado_del_contrato(lease, cerrados, hoy_) in ("vigente", "proximo", "terminado")


def tramo_devengado(lease, cerrados: dict[int, str], bajas: dict[int, date], hoy_):
    """``(desde, hasta)`` de los días en que ``lease`` fue (o es) canon, o None.

    Lo vigente, lo próximo y lo terminado, su plazo entero. Lo cancelado con
    fecha de baja, desde que arrancó hasta el día ANTERIOR a la baja (un
    contrato de seis meses cancelado el 1.º del cuarto aporta tres meses). Lo
    reemplazado, nada: sigue en los contratos que lo reemplazan. El canon al
    mes sigue siendo el del plazo FIRMADO (`meses.al_mes_de` con las fechas
    del contrato): la baja corta los días, no cambia el precio."""
    d, h = lease.start_date, lease.end_date
    if not d or not h:
        return None
    if fue_canon(lease, cerrados, hoy_):
        return d, h
    if cerrados.get(lease.id) == "cancelado" and lease.id in bajas:
        h = min(h, bajas[lease.id] - timedelta(days=1))
        return (d, h) if h >= d else None
    return None
