"""Lo que les pasa a las participaciones cuando actúa OTRO camino.

Los términos de participación (`models/participaciones.py`) viven en tablas
propias, pero hay caminos de siempre que los tocan sin saberlo: cancelar un
contrato desde su ficha (`DELETE /spaces/{id}/leases/{id}`), borrar una sede
(que archiva sus espacios y cierra sus contratos) y borrar un proveedor. Acá
están los ganchos que esos caminos llaman, y el anotador del historial que
usan ellos y el servicio de participaciones (diseño §2.5, §4.6, §5.5–§5.6).

Ninguna función hace commit: viajan en la transacción de quien llama, como la
bitácora (`services/bitacora.py`). Así el cambio y su historia caen juntos o no
cae ninguno.
"""
from __future__ import annotations

import json
from datetime import date, datetime, timezone
from typing import Iterable, Optional

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.fechas import hoy
from app.models.models import Space, SpaceLease
from app.models.participaciones import TIPOS_DE_HISTORIAL, HistorialParticipacion, Participacion

#: Claves que NUNCA entran al historial: el valor vive en el lease, y el
#: historial no se purga ni pasa por la redacción de montos de `spaces.py`.
_CLAVES_CON_PLATA = frozenset({"valor", "valor_mensual", "monthly_rent", "monto", "canon"})


def _ahora() -> datetime:
    return datetime.now(timezone.utc)


def actor_de(request, rol: Optional[str]) -> str:
    """Quién actúa, para `baja_por`, `creada_por` y el historial: el correo del
    token cuando lo trae (`require_auth` lo deja en `request.state.actor_email`,
    como lo lee la bitácora); si no, el rol."""
    correo = getattr(getattr(request, "state", None), "actor_email", None) if request is not None else None
    return correo or rol or "desconocido"


def _a_texto(valor):
    if isinstance(valor, (datetime, date)):
        return valor.isoformat()
    raise TypeError(f"{type(valor).__name__} no va al historial")


def _sin_plata(valor, donde: str) -> None:
    if isinstance(valor, dict):
        for k, v in valor.items():
            if str(k).lower() in _CLAVES_CON_PLATA:
                raise ValueError(f"El historial no lleva montos ({donde}.{k}).")
            _sin_plata(v, f"{donde}.{k}")
    elif isinstance(valor, (list, tuple)):
        for v in valor:
            _sin_plata(v, donde)


def _json(valor) -> Optional[str]:
    if valor is None:
        return None
    return json.dumps(valor, ensure_ascii=False, sort_keys=True, default=_a_texto)


def anotar_historial(
    db: Session,
    *,
    tipo: str,
    accion: str,
    actor: Optional[str] = None,
    cara_space_id: Optional[int] = None,
    participacion_space_id: Optional[int] = None,
    participacion_id: Optional[int] = None,
    distribucion_id: Optional[int] = None,
    detalle: Optional[str] = None,
    antes=None,
    despues=None,
) -> HistorialParticipacion:
    """Agrega una fila al historial (D14). **No hace commit.**

    `antes` y `despues` son dicts (o listas) que se guardan como JSON; las
    fechas van en ISO. Nunca llevan montos: una clave de plata frena con
    `ValueError` (es un error de programación, no del usuario)."""
    if tipo not in TIPOS_DE_HISTORIAL:
        raise ValueError(f"Tipo de historial desconocido: {tipo!r}")
    _sin_plata(antes, "antes")
    _sin_plata(despues, "despues")
    fila = HistorialParticipacion(
        en=_ahora(),
        actor=actor,
        tipo=tipo,
        accion=accion,
        cara_space_id=cara_space_id,
        participacion_space_id=participacion_space_id,
        participacion_id=participacion_id,
        distribucion_id=distribucion_id,
        detalle=detalle,
        antes_json=_json(antes),
        despues_json=_json(despues),
    )
    db.add(fila)
    return fila


def _dar_de_baja(termino: Participacion, actor: Optional[str], cuando: datetime) -> None:
    termino.baja_en = cuando
    termino.baja_por = actor
    termino.actualizada_en = cuando
    termino.actualizada_por = actor
    # Un PATCH/renovar/confirmar que leyó la versión anterior tiene que chocar
    # con `version_vieja` en vez de escribir sobre un término ya dado de baja.
    termino.version = (termino.version or 1) + 1


# ─── Cancelar un contrato (gancho de `cancel_lease`, diseño §4.6) ─────────────

def al_cancelar_contrato(db: Session, lease: SpaceLease, actor: Optional[str]) -> Optional[Participacion]:
    """El contrato `lease` se está cancelando por el camino de siempre.

    Nada si el lease no es de una participación. Si ya había vencido por fecha
    (`end_date < hoy()`: `expire_leases` todavía no lo había cerrado) NO pone
    `baja_en`: se rotula «vencido», no «cancelado» (crítica 22-B4), y el
    vencimiento no se escribe (se deriva, D6). Si no: `baja_en`/`baja_por` del
    término y una fila `evento`/`contrato.cancelado` en el historial.

    Devuelve el término dado de baja, o None."""
    termino = db.query(Participacion).filter(Participacion.lease_id == lease.id).first()
    if termino is None or termino.estado != "contrato" or termino.baja_en is not None:
        return None
    if lease.end_date < hoy():
        return None
    cuando = _ahora()
    _dar_de_baja(termino, actor, cuando)
    anotar_historial(
        db,
        tipo="evento",
        accion="contrato.cancelado",
        actor=actor,
        cara_space_id=termino.cara_space_id,
        participacion_space_id=termino.space_id,
        participacion_id=termino.id,
        detalle=(
            f"Contrato cancelado · participación {termino.numero} · "
            f"{lease.start_date.isoformat()}→{lease.end_date.isoformat()}"
        ),
        antes={"lease_id": lease.id, "desde": lease.start_date, "hasta": lease.end_date,
               "puntos_basicos": termino.puntos_basicos},
        despues={"baja_en": cuando},
    )
    return termino


# ─── Borrar una sede (gancho de `sede_archive`, diseño §2.5) ──────────────────

def _de_esos_espacios(space_ids: list[int]):
    """Términos colgados de esos espacios, por la participación o por la cara."""
    return or_(Participacion.space_id.in_(space_ids), Participacion.cara_space_id.in_(space_ids))


def _reservas_vivas_q(db: Session, space_ids: list[int]):
    """Reservas provisionales vivas (diseño §3.3, `vivo`): no canceladas, no
    caducadas y que terminan hoy o después."""
    d = hoy()
    return db.query(Participacion).filter(
        _de_esos_espacios(space_ids),
        Participacion.estado == "reserva",
        Participacion.caduca >= d,
        Participacion.hasta >= d,
    )


def reservas_vivas(db: Session, space_ids: Iterable[int]) -> int:
    """Cuántas reservas provisionales vivas cuelgan de esos espacios. Es lo que
    el diálogo de «Borrar sede» avisa que se cancela (`count_commercial_rows`)."""
    ids = list(space_ids)
    if not ids:
        return 0
    return _reservas_vivas_q(db, ids).count()


def codigos_de_caras_con_terminos(db: Session, space_ids: Iterable[int]) -> set[str]:
    """Los códigos de las caras que tienen términos colgados de esos espacios:
    los candados que hay que tomar antes de tocarlos (la misma clave que la
    venta de la cara entera, de sus partes y de sus participaciones)."""
    ids = list(space_ids)
    if not ids:
        return set()
    filas = (
        db.query(Space.code)
        .join(Participacion, Participacion.cara_space_id == Space.id)
        .filter(_de_esos_espacios(ids))
        .distinct()
        .all()
    )
    return {codigo for (codigo,) in filas if codigo}


def al_archivar_sede(
    db: Session,
    sede: str,
    space_ids: Iterable[int],
    leases_cerrados: Iterable[SpaceLease],
    actor: Optional[str],
) -> dict:
    """La sede se está borrando: sus espacios `space_ids` se archivan y el
    archivo cerró `leases_cerrados`. Misma transacción, sin commit.

    · Las reservas provisionales vivas pasan a `reserva_cancelada` con `baja_en`
      (el diálogo ya lo avisó con `reservas_vivas`).
    · Los términos `contrato` cuyo lease cerró el archivo ganan `baja_en`, salvo
      los que ya habían vencido por fecha (se rotulan «vencido», como en
      `al_cancelar_contrato`).
    · Una fila `evento`/`sede.baja` por término tocado.

    Quien llama tomó antes los candados de `codigos_de_caras_con_terminos`.
    """
    ids = list(space_ids)
    resumen = {"reservas_canceladas": 0, "contratos_cerrados": 0}
    if not ids:
        return resumen
    cuando = _ahora()
    nombre = (sede or "").strip().upper()

    for termino in _reservas_vivas_q(db, ids).order_by(Participacion.id).all():
        termino.estado = "reserva_cancelada"
        _dar_de_baja(termino, actor, cuando)
        anotar_historial(
            db, tipo="evento", accion="sede.baja", actor=actor,
            cara_space_id=termino.cara_space_id, participacion_space_id=termino.space_id,
            participacion_id=termino.id,
            detalle=(f"Se borró la sede {nombre}: la reserva provisional de la participación "
                     f"{termino.numero} se canceló."),
            antes={"estado": "reserva", "desde": termino.desde, "hasta": termino.hasta,
                   "caduca": termino.caduca, "puntos_basicos": termino.puntos_basicos},
            despues={"estado": "reserva_cancelada", "baja_en": cuando},
        )
        resumen["reservas_canceladas"] += 1

    por_lease = {lease.id: lease for lease in leases_cerrados}
    if por_lease:
        d = hoy()
        terminos = (
            db.query(Participacion)
            .filter(Participacion.lease_id.in_(list(por_lease)), Participacion.estado == "contrato",
                    Participacion.baja_en.is_(None))
            .order_by(Participacion.id)
            .all()
        )
        for termino in terminos:
            lease = por_lease[termino.lease_id]
            if lease.end_date < d:
                continue
            _dar_de_baja(termino, actor, cuando)
            anotar_historial(
                db, tipo="evento", accion="sede.baja", actor=actor,
                cara_space_id=termino.cara_space_id, participacion_space_id=termino.space_id,
                participacion_id=termino.id,
                detalle=(f"Se borró la sede {nombre}: el contrato de la participación "
                         f"{termino.numero} se cerró."),
                antes={"lease_id": lease.id, "desde": lease.start_date, "hasta": lease.end_date,
                       "puntos_basicos": termino.puntos_basicos},
                despues={"baja_en": cuando},
            )
            resumen["contratos_cerrados"] += 1
    return resumen


# ─── Borrar un proveedor (guarda de `delete_supplier`) ────────────────────────

def reservas_del_proveedor(db: Session, supplier_id: int) -> int:
    """Términos que nombran al proveedor: sólo las reservas lo guardan (un
    contrato lo lee de su lease, que ya frena el borrado por historial)."""
    return db.query(Participacion).filter(Participacion.supplier_id == supplier_id).count()
