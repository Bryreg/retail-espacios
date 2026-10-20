"""El correo de montaje espera a la planometría (``docs/rediseno/vender-api.md`` §4).

Decisión del dueño (2026-10-20): quien monta recibe su aviso cuando ya puede
montar. Eso es, para CUALQUIER contrato nuevo —una cara entera, una parte o un
porcentaje—, cuando tiene su planometría cargada (``POST
/leases/{id}/planometria``, en Supervisar); y, en un porcentaje, además cuando
su cara tiene la distribución confirmada con la zona de esa participación (sin
zona no se sabe dónde va).

Cómo se lleva: cada contrato nuevo deja una fila en ``montajes_pendientes`` al
escribirse (``alta_de_contrato.escribir_contrato`` y el contrato suelto de
``routers/spaces.py``). Mientras la fila existe, el aviso de montaje no sale
(``bulk_leases._avisar`` la mira); comercial y el proveedor reciben el suyo al
guardar, como siempre. Cuando se cumple lo último que faltaba —se carga la
planometría, o se confirma la distribución— sale el correo de montaje y la fila
se borra: sale UNA vez. Reemplazar la planometría después no lo repite (ya no
hay fila), y un contrato de antes de esta regla (sin fila) se comporta como
siempre: su aviso ya salió al guardarlo.

``cara_space_id``: en un porcentaje, la fila de la cara (la que se distribuye);
en una cara entera o una parte, la del propio contrato. Lo que falta no se
guarda: se mira cada vez (la planometría en ``lease_files``, la zona en
``zonas``), así que una planometría borrada vuelve a faltar.

Sin commit y sin correos: los manda ``routers/montajes.py``. Sin plata: lo que
devuelve ``pendientes_de_la_sede`` es para Supervisar y no lleva montos.
"""
from __future__ import annotations

from typing import Optional

from sqlalchemy.orm import Session

from app.fechas import hoy
from app.models.models import LeaseFile, Space, SpaceLease
from app.models.participaciones import Distribucion, Participacion, Zona
from app.models.vender import MontajePendiente
from app.services.partes import codigo_de_parte, partir_codigo

#: El ``kind`` de la planometría en ``lease_files`` (``routers/planograms.py``).
PLANOMETRIA = "planometria"


def dejar_pendiente(db: Session, lease: SpaceLease, cara_space_id: Optional[int] = None) -> None:
    """El contrato recién escrito espera su planometría (y su zona, si es un
    porcentaje: quien llama pasa la cara). Va en la transacción de quien llama."""
    db.add(MontajePendiente(lease_id=lease.id, cara_space_id=cara_space_id or lease.space_id))


def ids_pendientes(db: Session, lease_ids) -> set[int]:
    """De esos contratos, los que todavía esperan para avisar al montaje."""
    ids = [i for i in lease_ids if i]
    if not ids:
        return set()
    return {i for (i,) in db.query(MontajePendiente.lease_id).filter(MontajePendiente.lease_id.in_(ids))}


def con_zona_confirmada(db: Session, cara_space_id: int, pc_space_id: int) -> bool:
    """¿La participación ya tiene zona en la capa confirmada de su cara?"""
    return (db.query(Zona.id).join(Distribucion, Distribucion.id == Zona.distribucion_id)
            .filter(Distribucion.cara_space_id == cara_space_id, Zona.capa == "confirmada",
                    Zona.participacion_space_id == pc_space_id).first()) is not None


def tiene_planometria(db: Session, lease_id: int) -> bool:
    return (db.query(LeaseFile.id)
            .filter(LeaseFile.lease_id == lease_id, LeaseFile.kind == PLANOMETRIA).first()) is not None


def termino_del_contrato(db: Session, lease_id: int) -> Optional[Participacion]:
    """El término de participación de ese contrato, o None (cara entera o parte)."""
    return db.query(Participacion).filter(Participacion.lease_id == lease_id).first()


def que_falta(db: Session, pendiente: MontajePendiente,
              termino: Optional[Participacion] = None) -> tuple[bool, bool]:
    """``(falta_planometria, falta_distribucion)`` de un aviso pendiente."""
    t = termino if termino is not None else termino_del_contrato(db, pendiente.lease_id)
    falta_distribucion = t is not None and not con_zona_confirmada(db, pendiente.cara_space_id, t.space_id)
    return not tiene_planometria(db, pendiente.lease_id), falta_distribucion


def listos(db: Session, lease_id: Optional[int] = None,
           cara_space_id: Optional[int] = None) -> list[MontajePendiente]:
    """Los avisos pendientes a los que ya no les falta nada: del contrato
    (``lease_id``, al cargar su planometría) o de la cara (``cara_space_id``, al
    confirmar su distribución). Quien llama manda el correo y borra las filas."""
    q = db.query(MontajePendiente)
    if lease_id is not None:
        q = q.filter(MontajePendiente.lease_id == lease_id)
    if cara_space_id is not None:
        q = q.filter(MontajePendiente.cara_space_id == cara_space_id)
    return [p for p in q.order_by(MontajePendiente.lease_id).all() if que_falta(db, p) == (False, False)]


def pendientes_de_la_sede(db: Session, sede: Optional[str] = None) -> list[dict]:
    """Para Supervisar («Falta planometría»): los contratos vivos o por empezar
    de la sede cuyo aviso de montaje todavía espera, del que arranca antes al
    último. Sin montos."""
    dia = hoy()
    q = (db.query(MontajePendiente, SpaceLease, Space)
         .join(SpaceLease, SpaceLease.id == MontajePendiente.lease_id)
         .join(Space, Space.id == SpaceLease.space_id)
         .filter(SpaceLease.is_active.is_(True), SpaceLease.end_date >= dia))
    if sede:
        q = q.filter(Space.sede == sede.strip().upper())
    fuera = []
    for pendiente, lease, space in q.order_by(SpaceLease.start_date, SpaceLease.id).all():
        termino = termino_del_contrato(db, lease.id)
        falta_planometria, falta_distribucion = que_falta(db, pendiente, termino)
        if termino is not None:
            cara = db.get(Space, pendiente.cara_space_id)
            codigo_cara = cara.code if cara is not None else None
        else:
            p = partir_codigo(space.code)
            codigo_cara = codigo_de_parte(p.base, p.cara, None)
        fuera.append({
            "lease_id": lease.id, "espacio": space.code, "cara": codigo_cara, "sede": space.sede,
            "proveedor": lease.supplier.name if lease.supplier else None, "marca": lease.marca,
            "desde": lease.start_date, "hasta": lease.end_date,
            "falta_planometria": falta_planometria, "falta_distribucion": falta_distribucion,
            "dias_para_empezar": (lease.start_date - dia).days,
        })
    return fuera
