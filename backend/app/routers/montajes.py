"""Los avisos de montaje que esperan (``docs/rediseno/vender-api.md`` §4,
``services/montajes_pendientes.py``).

· ``GET /api/montajes/pendientes?sede=`` — para Supervisar («Falta
  planometría»): los contratos vivos o por empezar cuyo correo de montaje
  todavía no salió, y qué les falta. Sólo administración (lleva proveedor) y sin
  montos. La sede va por query, como en cobros y reservas: el barrido del token
  de montaje (``tests/test_montaje_enlace.py``) lo cubre sin relleno nuevo.
· ``avisar_los_listos``: el correo de montaje de los pendientes que ya tienen
  todo. Lo llaman la carga de la planometría (``routers/planograms.py``) y la
  confirmación de una distribución (``routers/participaciones.py``), después de
  su commit.
"""
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends
from sqlalchemy.orm import Session

from app.auth import require_admin
from app.clientes import Cliente, cliente_del_pedido
from app.database import get_db
from app.models.models import SpaceLease
from app.routers.bulk_leases import FilaOut, _avisar
from app.schemas.spaces import AvisosContrato
from app.services import montajes_pendientes as servicio
from app.services.layout_lookup import find_fixture_by_space_code
from app.services.partes import cantidad_de, es_participacion, partir_codigo, texto_para_montar
from app.services.reglas_participacion import pct

router = APIRouter(prefix="/montajes", tags=["montajes"])


@router.get("/pendientes")
def leer_pendientes(
    background_tasks: BackgroundTasks,
    sede: Optional[str] = None,
    rol: str = Depends(require_admin),
    db: Session = Depends(get_db),
    cliente: Cliente = Depends(cliente_del_pedido),
):
    """Los contratos cuyo aviso de montaje espera la planometría o la zona.
    Los que ya tienen todo (la regla de 2026-10-29 los dejó listos sin que
    nadie volviera a confirmar ni a cargar) salen ahora y no se listan."""
    # Un correo por sede: sin `sede` la lista junta todas.
    por_sede: dict[str, list] = {}
    for pendiente in servicio.listos_de_la_sede(db, sede):
        lease = db.get(SpaceLease, pendiente.lease_id)
        por_sede.setdefault(lease.space.sede if lease is not None and lease.space else "", []).append(pendiente)
    for de_la_sede, listos in por_sede.items():
        avisar_los_listos(db, background_tasks, listos, cliente, sede=de_la_sede or None)
    return servicio.pendientes_de_la_sede(db, sede)


def fila_para_montar(db: Session, lease: SpaceLease) -> FilaOut:
    """La fila del correo de montaje de un contrato, con la parte dicha para
    quien monta: «Puerta 2 de 3…» o «Participación 3 · 25 % de la cara A».
    Sin valor: el correo de montaje no lleva plata."""
    space = lease.space
    codigo = space.code or ""
    partido = partir_codigo(codigo)
    parte = None
    termino = servicio.termino_del_contrato(db, lease.id)
    if termino is not None:
        parte = f"Participación {termino.numero} · {pct(termino.puntos_basicos)} de la cara {partido.cara}"
    elif partido.parte is not None and not es_participacion(partido.parte):
        mueble = find_fixture_by_space_code(db, codigo) or {}
        parte = texto_para_montar(partido.parte, cantidad_de(mueble, partido.parte.clase))
    supplier = lease.supplier
    return FilaOut(
        fila=0, estado="ok", codigo=codigo, nombre=space.name, sede=space.sede,
        proveedor=supplier.name if supplier else None, marca=lease.marca,
        desde=lease.start_date.isoformat(), hasta=lease.end_date.isoformat(), lease_id=lease.id, parte=parte,
    )


def avisar_los_listos(db: Session, background_tasks: BackgroundTasks, listos: list, cliente: Cliente,
                      sede: Optional[str] = None) -> Optional[AvisosContrato]:
    """El correo de montaje de esos pendientes (``servicio.listos``), sólo a
    quien monta —comercial y el proveedor ya recibieron el suyo al guardar— y
    en un solo correo por sede. Las filas se borran ANTES de avisar (con su
    commit): el aviso sale una vez, y ``_avisar`` no manda el montaje de un
    contrato que todavía tiene fila. Un contrato cancelado entretanto no se
    avisa. Devuelve a quién se encoló, o None si no había nada que mandar."""
    if not listos:
        return None
    filas = []
    for pendiente in listos:
        lease = db.get(SpaceLease, pendiente.lease_id)
        if lease is not None and lease.is_active:
            filas.append(fila_para_montar(db, lease))
        db.delete(pendiente)
    db.commit()
    if not filas:
        return None
    return _avisar(db, background_tasks, sede or filas[0].sede, filas, cliente, roles=("montaje",))
