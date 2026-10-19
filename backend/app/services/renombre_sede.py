"""Renombrar una sede de verdad: los códigos pasan al nombre nuevo y lo vendido sigue vivo.

Hasta la fase 2 de las participaciones, renombrar una sede era, en el
navegador, «borrar + crear»: ``renameSede`` movía la clave local y llamaba a
``DELETE /layout/{viejo}``, y el plano subía como el primer guardado de una
sede nueva. El borrado archiva la sede (``services/sede_archive.py``): cerraba
los contratos, cancelaba las reservas provisionales, daba de baja los términos
de participación, archivaba los montajes y sacaba el nombre de la lista. Las
tarifas de ``by_sede[VIEJO]`` quedaban huérfanas y la sede nueva caía a la
general. La pantalla sólo podía avisarlo antes.

Acá el renombre cambia sólo lo que lleva el nombre escrito, en UNA transacción:

· los códigos de ``spaces`` (y su ``svg_id`` y su rótulo cuando son el código)
  que empiezan con ``VIEJO-`` pasan a ``NUEVO-``, y la columna ``sede`` de
  todas las filas de la sede —también las de código corto— pasa a ``NUEVO``;
· los reportes de montaje (``mount_confirmations.space_code`` y ``sede``);
· el registro de nombres de la renumeración (``renumeracion_nombres.sede``);
· el plano: su fila (``layout_snapshots.sede``), el campo ``sede`` de los
  muebles que decían ``VIEJO`` y el prefijo de los códigos que llevan la sede
  adentro (si no, ``_full_code`` armaría ``NUEVO-VIEJO-GON-01``); y el campo
  ``sede`` de los muebles de OTROS planos que decían ``VIEJO`` (V16);
· la lista de sedes y las tarifas ``by_sede`` las muda ``routers/layout.py``,
  que es el dueño de esas claves, en la misma transacción.

Lo demás va por ``id`` y sobrevive sin tocarlo: contratos, participaciones,
zonas, distribuciones, historial, fotos (``space_files``), caras
(``space_faces``) y planometrías. No se tocan las filas archivadas (son de una
sede borrada), ni el historial y la bitácora viejos (dicen lo que pasó con el
nombre de entonces), ni los muebles del plano cuya «Sede» propia es otra (se
avisa). El enlace de montaje que sobrevive al cambio de código lo resuelve
``routers/montaje.py`` (toma el código del contrato).

Los candados son los de siempre (``services/candado.py``): los de todos los
códigos viejos y nuevos y los de los muebles del plano, ANTES de releer y de
escribir, con ``expire_all``; si lo que se ve con el candado puesto pide
códigos que no tienen candado, se frena (el patrón de ``renumeracion.con_candados``).
El plano se escribe con la escritura condicional de ``save_layout``: sólo si
sigue en la revisión que se leyó.
"""

from __future__ import annotations

import json
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.models import ArchivedSpace, LayoutSnapshot, RenumeracionNombre, Space
from app.services.candado import tomar_candados
from app.services.layout_lookup import _y, normalizar
from app.services.renumeracion import EspacioArrastrado, _svg_nuevo, mudar_espacios
from app.services.sede_archive import (
    _mount_confirmations_of_sede,
    _spaces_of_sede,
    codigos_del_plano,
    sedes_conocidas,
)


class RenombreRechazado(Exception):
    """No se renombra, y se dice por qué. ``code`` va al ``detail`` del 409
    (o del 404/422) tal cual; ``motivos``, las frases una por una."""

    def __init__(self, code: str, mensaje: str, motivos: list[str] | None = None, status: int = 409):
        self.code = code
        self.mensaje = mensaje
        self.motivos = motivos or []
        self.status = status
        super().__init__(f"{code}: {mensaje}")


@dataclass
class PlanDeRenombre:
    """Lo que el renombre cambiaría, sin haber escrito nada."""

    viejo: str
    nuevo: str
    #: Las filas cuyo código lleva el prefijo de la sede: se mudan.
    espacios: list[EspacioArrastrado] = field(default_factory=list)
    #: Las filas de la sede con código corto (sin prefijo): sólo cambia `sede`.
    solo_sede: list[int] = field(default_factory=list)
    montajes: int = 0
    bloqueos: list[str] = field(default_factory=list)

    def firma(self) -> tuple:
        """Para comparar la mirada de antes del candado con la de después."""
        return (tuple(sorted((e.space_id, e.antes, e.ahora) for e in self.espacios)),
                tuple(sorted(self.solo_sede)))


@dataclass
class HechoRenombre:
    """Lo que el renombre hizo. El router lo devuelve y lo anota."""

    viejo: str
    nuevo: str
    espacios: int
    contratos: int
    montajes: int
    updated_at: datetime | None
    fixtures: list
    avisos: list[str] = field(default_factory=list)


def _con_prefijo(codigo: str, viejo: str, nuevo: str) -> str | None:
    """``NAVE-GON-01`` → ``NAVE NORTE-GON-01``, o ``None`` si el código no
    lleva el prefijo de la sede vieja."""
    c = normalizar(codigo)
    return f"{nuevo}-{c[len(viejo) + 1:]}" if c.startswith(f"{viejo}-") else None


def planificar(db: Session, viejo: str, nuevo: str) -> PlanDeRenombre:
    """Qué filas se mudan y qué lo impide. **No escribe.**

    La selección es la del archivo de la sede (``_spaces_of_sede``, con el
    prefijo corregido: ``SAN`` no se lleva lo de ``SAN-JOSE``), sin las
    archivadas. Se frena si un código destino ya lo tiene una fila que no se
    muda, si dos filas que se mudan van al mismo destino (el mismo código
    escrito con otras mayúsculas) o si un ``svg_id`` destino está tomado."""
    v, n = normalizar(viejo), normalizar(nuevo)
    plan = PlanDeRenombre(viejo=v, nuevo=n)
    seleccion = _spaces_of_sede(db, v)
    if seleccion:
        archivadas = {
            fila.space_id for fila in db.query(ArchivedSpace.space_id)
            .filter(ArchivedSpace.space_id.in_([s.id for s in seleccion])).all()
        }
        seleccion = [s for s in seleccion if s.id not in archivadas]
    for space in sorted(seleccion, key=lambda s: s.id):
        ahora = _con_prefijo(space.code, v, n)
        if ahora is None:
            plan.solo_sede.append(space.id)
            continue
        antes = normalizar(space.code)
        plan.espacios.append(EspacioArrastrado(
            space_id=space.id, antes=antes, ahora=ahora,
            svg_antes=space.svg_id or "", svg_ahora=_svg_nuevo(space.svg_id or "", antes, ahora),
            contratos=sum(1 for lease in space.leases if lease.is_active),
        ))
    plan.montajes = len(_mount_confirmations_of_sede(db, v))

    if plan.espacios:
        se_mudan = {e.space_id for e in plan.espacios}
        quietas = [s for s in db.query(Space).all() if s.id not in se_mudan]
        codigos = {normalizar(s.code): s for s in quietas}
        svgs = {normalizar(s.svg_id): s for s in quietas if (s.svg_id or "").strip()}
        por_destino: dict[str, list[EspacioArrastrado]] = defaultdict(list)
        for e in plan.espacios:
            por_destino[normalizar(e.ahora)].append(e)
            duena = codigos.get(normalizar(e.ahora))
            if duena is not None:
                plan.bloqueos.append(
                    f"«{e.ahora}» ya es el código del espacio #{duena.id}, que no es de «{v}»: archivalo o "
                    "cambiale el código antes de renombrar."
                )
            duena_svg = svgs.get(normalizar(e.svg_ahora)) if (e.svg_ahora or "").strip() else None
            if duena_svg is not None and duena_svg is not duena:
                plan.bloqueos.append(
                    f"El svg_id «{e.svg_ahora}» ya lo tiene el espacio #{duena_svg.id}: el espacio #{e.space_id} "
                    "no puede tomarlo."
                )
        for destino, grupo in por_destino.items():
            if len(grupo) > 1:
                lista = _y([f"#{e.space_id} («{e.antes}»)" for e in grupo])
                plan.bloqueos.append(
                    f"Los espacios {lista} son el mismo código escrito distinto y los dos irían a «{destino}»: "
                    "unilos o archivá el que sobra antes de renombrar."
                )
    return plan


def _codigos_del_candado(db: Session, plan: PlanDeRenombre) -> set[str]:
    """Las claves: los códigos viejos y nuevos de lo que se muda y los de los
    muebles del plano con los dos nombres (un alta de participación de una
    cara sin términos todavía no tiene fila, pero sí mueble)."""
    codigos = {c for e in plan.espacios for c in (e.antes, e.ahora)}
    for c in codigos_del_plano(db, plan.viejo):
        codigos.add(c)
        otro = _con_prefijo(c, plan.viejo, plan.nuevo)
        if otro:
            codigos.add(otro)
    return codigos


def plano_de_la_sede(db: Session, sede: str) -> LayoutSnapshot | None:
    """La fila del plano por su nombre exacto o, si no, por el normalizado
    (la ruta puede traer «Nave» de una lista vieja). La lee el router antes de
    renombrar: su ``updated_at`` es la revisión que se compara y la que la
    escritura condicional exige."""
    snap = db.query(LayoutSnapshot).filter(LayoutSnapshot.sede == sede).first()
    if snap is not None:
        return snap
    return (db.query(LayoutSnapshot)
            .filter(func.upper(func.trim(LayoutSnapshot.sede)) == normalizar(sede)).first())


def _mudar_muebles(fixtures: list, viejo: str, nuevo: str, propio: bool) -> tuple[list, list[str]]:
    """El plano con la sede nueva: el campo ``sede`` que decía la vieja y, en
    el plano propio, el prefijo de los códigos con la sede adentro. Devuelve
    también los códigos de los muebles del plano propio cuya «Sede» es OTRA
    (quedan como están: se avisa)."""
    ajenos: list[str] = []
    for f in fixtures:
        if not isinstance(f, dict):
            continue
        sede_propia = normalizar(f.get("sede"))
        if sede_propia == viejo:
            f["sede"] = nuevo
        elif propio and sede_propia and sede_propia != nuevo:
            ajenos.append(normalizar(f.get("code")) or "sin código")
        if propio:
            otro = _con_prefijo(f.get("code") or "", viejo, nuevo)
            if otro:
                f["code"] = otro
    return fixtures, ajenos


def _escribir_plano(db: Session, snap_id: int, leido, valores: dict, nombre: str) -> None:
    """La escritura condicional del plano (como ``save_layout``): sólo si sigue
    en la revisión ``leido``. Si otra escritura la movió, se frena todo."""
    escritas = (
        db.query(LayoutSnapshot)
        .filter(LayoutSnapshot.id == snap_id, LayoutSnapshot.updated_at == leido)
        .update(valores, synchronize_session=False)
    )
    if escritas == 0:
        raise RenombreRechazado(
            "renombre_bloqueado",
            f"Otro equipo guardó el plano de «{nombre}» mientras se renombraba: probá otra vez.",
        )


def renombrar(db: Session, viejo: str, nuevo: str, leido=None, snap_id: int | None = None) -> HechoRenombre:
    """Renombra ``viejo`` a ``nuevo`` en la sesión. **No hace commit**: lo hace
    el router, con la lista, las tarifas y la bitácora en la misma
    transacción.

    ``leido``/``snap_id``: la revisión y el id de la fila del plano que leyó el
    router al empezar (la que comparó con ``base_updated_at``); el plano se
    escribe sólo si sigue ahí. Sin plano (una sede que sólo está en la lista),
    se mudan las filas y nada más."""
    v, n = normalizar(viejo), normalizar(nuevo)
    if not n:
        raise RenombreRechazado("sede_vacia", "Escribí el nombre nuevo de la sede.", status=422)
    if n == v:
        raise RenombreRechazado("mismo_nombre", f"«{v}» ya se llama así.", status=422)
    conocidas = sedes_conocidas(db)
    if n in conocidas:
        raise RenombreRechazado("sede_existe", f"Ya hay una sede «{n}»: elegí otro nombre.")
    if snap_id is None and v not in conocidas:
        raise RenombreRechazado("sede_inexistente", f"No hay ninguna sede «{v}».", status=404)

    # Mirar, tomar los candados, mirar otra vez con la sesión fresca.
    primera = planificar(db, v, n)
    claves = _codigos_del_candado(db, primera)
    if claves:
        tomar_candados(db, claves)
        db.expire_all()
    plan = planificar(db, v, n)
    sin_candado = _codigos_del_candado(db, plan) - claves
    if sin_candado:
        raise RenombreRechazado(
            "renombre_bloqueado",
            f"La sede «{v}» cambió mientras se renombraba: probá otra vez.",
            ["Cambiaron " + _y(sorted(sin_candado)[:5]) + "."],
        )
    if plan.bloqueos:
        raise RenombreRechazado(
            "renombre_bloqueado", f"No se puede renombrar «{v}» a «{n}» sin romper algo.", plan.bloqueos,
        )

    # Las filas: el código, el svg_id y el rótulo cuando son el código; y la
    # columna `sede` de todas, las de código corto también.
    mudar_espacios(db, plan.espacios, v, n)
    ids = [e.space_id for e in plan.espacios] + plan.solo_sede
    for space in db.query(Space).filter(Space.id.in_(ids or [-1])).all():
        space.sede = n

    # Los reportes de montaje: el código y la sede. Los archivados no.
    for conf in _mount_confirmations_of_sede(db, v):
        otro = _con_prefijo(conf.space_code, v, n)
        if otro:
            conf.space_code = otro
        conf.sede = n

    # El registro de nombres de la renumeración se lee por la sede del plano.
    for fila in db.query(RenumeracionNombre).filter(
            func.upper(func.trim(RenumeracionNombre.sede)) == v).all():
        fila.sede = n

    ahora = datetime.now(timezone.utc)
    avisos: list[str] = []
    fixtures: list = []
    updated_at = None
    if snap_id is not None:
        snap = db.get(LayoutSnapshot, snap_id)
        try:
            fixtures = json.loads((snap.fixtures_json if snap else None) or "[]")
        except (ValueError, TypeError):
            fixtures = []
        if not isinstance(fixtures, list):
            fixtures = []
        fixtures, ajenos = _mudar_muebles(fixtures, v, n, propio=True)
        if ajenos:
            avisos.append(
                f"{len(ajenos)} mueble(s) del plano dicen ser de otra sede ({_y(sorted(set(ajenos))[:5])}): "
                "quedan como están."
            )
        _escribir_plano(db, snap_id, leido, {
            LayoutSnapshot.sede: n,
            LayoutSnapshot.fixtures_json: json.dumps(fixtures),
            LayoutSnapshot.updated_at: ahora,
        }, v)
        updated_at = ahora

    # Los muebles de OTROS planos que decían la sede vieja (V16): la sede
    # vieja ya no existe, y su campo armaría códigos que nadie tiene.
    for otro in db.query(LayoutSnapshot).filter(LayoutSnapshot.id != (snap_id or -1)).all():
        try:
            suyos = json.loads(otro.fixtures_json or "[]")
        except (ValueError, TypeError):
            continue
        if not isinstance(suyos, list) or not any(
                isinstance(f, dict) and normalizar(f.get("sede")) == v for f in suyos):
            continue
        suyos, _ = _mudar_muebles(suyos, v, n, propio=False)
        _escribir_plano(db, otro.id, otro.updated_at, {
            LayoutSnapshot.fixtures_json: json.dumps(suyos),
            LayoutSnapshot.updated_at: ahora,
        }, otro.sede)
        avisos.append(f"En el plano de «{otro.sede}» había muebles con la sede «{v}»: ahora dicen «{n}».")

    db.flush()
    return HechoRenombre(
        viejo=v, nuevo=n,
        espacios=len(ids),
        contratos=sum(e.contratos for e in plan.espacios),
        montajes=plan.montajes,
        updated_at=updated_at,
        fixtures=fixtures,
        avisos=avisos,
    )
