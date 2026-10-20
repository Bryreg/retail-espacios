"""La reserva de una cara entera o de una parte (``docs/rediseno/vender-api.md`` §8).

«Reservar hasta…» de Vender vale también para lo entero y las partes, no sólo
para los porcentajes. La reserva (``models/vender.ReservaDeEspacio``) guarda
proveedor, marca, fechas, precio acordado y hasta cuándo se sostiene
(``caduca``). Mientras VIVE —``estado = "viva"`` y ``caduca ≥ hoy``, día de
Colombia— cuenta como ocupado en sus fechas en todos los caminos que deciden si
algo choca: los mira ``layout_lookup.contratos_que_chocan``, que es por donde
pasan la planilla, el contrato suelto, Vender, la importación del plano y la
capacidad de una cara por participación (``fisicos_de``). Caducada, deja de
contar sola: no hace falta ningún proceso que la cierre.

Confirmarla crea el contrato con el precio guardado (el cuerpo puede
cambiarlo), con el mismo orden de siempre: candado del mueble →
``expire_all`` → revisar → escribir. Cancelarla la deja en el registro con
``baja_en``.

Una reserva no manda correos, como la de una participación: el aviso sale al
confirmarla. Nada de acá hace commit.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.fechas import hoy
from app.models.models import Space
from app.models.vender import CobroPorVenta, CondicionesDeContrato, ReservaDeEspacio
from app.routers.bulk_leases import ERROR, FilaIn, FilaOut, LoteIn, _revisar
from app.services.alta_de_contrato import escribir_contrato
from app.services.candado import tomar_candados
from app.services.reglas_participacion import DIAS_AVISO_CADUCA


def _error(status: int, code: str, message: str) -> HTTPException:
    return HTTPException(status_code=status, detail={"code": code, "message": message})


def es_viva(r: ReservaDeEspacio, dia=None) -> bool:
    return r.estado == "viva" and r.caduca >= (dia or hoy())


def listar(db: Session, sede: Optional[str] = None) -> list[dict]:
    """Las reservas vivas (las que caducan pronto, marcadas), por caducidad:
    «Reservas por caducar» de Supervisar."""
    dia = hoy()
    q = (db.query(ReservaDeEspacio, Space).join(Space, Space.id == ReservaDeEspacio.space_id)
         .filter(ReservaDeEspacio.estado == "viva", ReservaDeEspacio.caduca >= dia))
    if sede:
        q = q.filter(Space.sede == sede.strip().upper())
    fuera = []
    for r, space in q.order_by(ReservaDeEspacio.caduca, ReservaDeEspacio.id).all():
        fuera.append({
            "id": r.id, "espacio": space.code, "sede": space.sede,
            "proveedor": r.supplier.name if r.supplier else None, "marca": r.marca,
            "desde": r.desde, "hasta": r.hasta, "caduca": r.caduca,
            "caduca_pronto": r.caduca <= dia + timedelta(days=DIAS_AVISO_CADUCA),
            "valor": r.valor, "modo_precio": r.modo_precio, "valor_tecleado": r.valor_tecleado,
            "cobro": ({"modo": "ventas", "porcentaje": r.cobro_porcentaje, "corte": r.cobro_corte}
                      if r.cobro_modo == "ventas" else {"modo": "fijo"}),
            "notas": r.notas, "creado_en": r.creado_en, "creado_por": r.creado_por,
        })
    return fuera


def _reserva_o_404(db: Session, reserva_id: int) -> ReservaDeEspacio:
    r = db.get(ReservaDeEspacio, reserva_id)
    if r is None:
        raise _error(404, "sin_reserva", "Esa reserva no existe.")
    return r


def _exigir_viva(r: ReservaDeEspacio) -> None:
    if r.estado != "viva":
        raise _error(409, "no_viva", "Esa reserva ya se confirmó o se canceló.")
    if r.caduca < hoy():
        raise _error(409, "reserva_caducada",
                     f"La reserva caducó el {r.caduca.isoformat()}: cargá una nueva desde Vender.")


def confirmar(db: Session, reserva_id: int, e: dict, actor: str) -> tuple[ReservaDeEspacio, FilaOut]:
    """La reserva viva → contrato, con el precio guardado si el cuerpo no trae
    ``valor``. Devuelve la reserva y la fila de los correos (con ``lease_id``)."""
    r = _reserva_o_404(db, reserva_id)
    _exigir_viva(r)
    tomar_candados(db, [r.space.code])
    db.expire_all()
    r = _reserva_o_404(db, reserva_id)
    _exigir_viva(r)
    # El cobro: el del cuerpo si trae uno; si trae sólo un valor, fijo; si no,
    # el que se guardó al reservar (un % de las ventas también, decisión del
    # dueño del 2026-10-20).
    cobro = e.get("cobro") or ({"modo": "fijo"} if e.get("valor") is not None else {
        "modo": r.cobro_modo or "fijo", "porcentaje": r.cobro_porcentaje, "corte": r.cobro_corte})
    por_ventas = cobro.get("modo") == "ventas"
    if por_ventas:
        if not cobro.get("porcentaje") or not (0 < cobro["porcentaje"] <= 100) \
                or cobro.get("corte") not in ("mensual", "al_final"):
            raise _error(422, "cobro", "Escribí el porcentaje de las ventas y cada cuánto se carga lo vendido.")
        valor = 0.0
    else:
        valor = e.get("valor") if e.get("valor") is not None else r.valor
        if not valor or valor <= 0:
            raise _error(422, "valor", "Escribí el valor del contrato.")
    space = r.space
    # Revisa como la planilla (el plano, la compuerta, los choques y las
    # participaciones vivas), con la reserva ya fuera de la cuenta: si no,
    # chocaría consigo misma. Todo en la misma transacción; un rechazo hace
    # rollback y la reserva sigue viva.
    r.estado = "confirmada"
    db.flush()
    sede = (space.sede or "").strip().upper()
    notas = e.get("notas") if e.get("notas") is not None else r.notas
    lote = LoteIn(sede=sede, filas=[FilaIn(
        fila=1, espacio=space.code, sede=sede, proveedor=r.supplier.name, marca=r.marca, valor=valor,
        desde=r.desde.isoformat(), hasta=r.hasta.isoformat(), nota=notas,
    )])
    (fila,) = _revisar(db, lote, exigir_valor=not por_ventas)
    if fila.estado == ERROR:
        raise _error(409, "reserva_invalida", fila.mensajes[0])
    correo = (e.get("correo") or "").strip() or r.correo
    if correo and "@" in correo and " " not in correo and not r.supplier.email:
        r.supplier.email = correo  # completa el que falta, nunca pisa (como la planilla)
    lease = escribir_contrato(db, space, r.supplier, r.marca, r.desde, r.hasta, valor, notas)
    if por_ventas:
        db.add(CobroPorVenta(lease_id=lease.id, porcentaje=float(cobro["porcentaje"]), corte=cobro["corte"],
                             creado_por=actor))
    elif e.get("valor") is not None:
        if e.get("modo_precio"):
            db.add(CondicionesDeContrato(lease_id=lease.id, modo_precio=e["modo_precio"],
                                         valor_tecleado=e.get("valor_tecleado")))
    elif r.modo_precio:
        db.add(CondicionesDeContrato(lease_id=lease.id, modo_precio=r.modo_precio, valor_tecleado=r.valor_tecleado))
    r.lease_id = lease.id
    db.flush()
    fila.lease_id = lease.id
    fila.valor = valor
    fila.proveedor = r.supplier.name
    return r, fila


def cancelar(db: Session, reserva_id: int, actor: str) -> ReservaDeEspacio:
    """Cancela una reserva viva: queda en el registro con ``baja_en``."""
    r = _reserva_o_404(db, reserva_id)
    _exigir_viva(r)
    r.estado = "cancelada"
    r.baja_en = datetime.now(timezone.utc)
    r.baja_por = actor
    db.flush()
    return r
