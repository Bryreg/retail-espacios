"""Cómo terminó cada contrato (rediseño UX, 2026-10-27).

`space_leases.is_active` en falso no dice POR QUÉ el contrato dejó de correr:
lo apaga `expire_leases` al vencer por fecha (terminó solo), «Cancelar el
contrato» (`DELETE /spaces/{id}/leases/{lease_id}`, que anota `contrato.baja`
en la bitácora) y «Editar contrato» cuando lo reemplaza
(`contratos_reemplazados`). Para el historial de la ficha y la serie de
Indicadores no es lo mismo: lo terminado fue canon de verdad; lo cancelado y lo
reemplazado, no (lo reemplazado sigue en los contratos que lo reemplazan).

Sin tabla nueva ni migración: se lee de lo que ya se anota.
"""
from sqlalchemy.orm import Session

from app.models.models import AuditEntry
from app.models.vender import ContratoReemplazado


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
    for (lid,) in db.query(ContratoReemplazado.lease_id).filter(ContratoReemplazado.lease_id.in_(ids)).all():
        fuera[int(lid)] = "reemplazado"
    return fuera


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
