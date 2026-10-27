"""Participaciones de cara: la capa con base (diseño ``21-diseno-final.md``
§3.11, §4.3, §4.5, §4.7 y §5 del scratchpad de la etapa).

Las reglas viven en dos gemelos puros que no saben de bases ni de relojes
(``reglas_participacion``: qué cuenta un día, la capacidad, las invariantes de
los términos y el juicio de una distribución; ``zonas_geometria`` y
``superficie``: lo que se dibujó y sobre qué). Acá se arma su entrada desde la
base y el plano, y viven los caminos que escriben:

· un término: alta (reserva provisional o contrato), cambiar una reserva,
  confirmarla como contrato, cancelarla y renovar un contrato;
· la distribución de una cara: borrador, confirmación y descarte.

**El orden que no se negocia** en todo camino que puede sobrevender una cara
(alta, cambiar, confirmar, cancelar, renovar y confirmar la distribución)::

    revisar → (geometría) → tomar_candados([cara]) → db.expire_all() → revisar otra vez → escribir

· La revisión de afuera es para fallar rápido; la que vale es la de adentro.
· El candado es ``pg_advisory_xact_lock`` del MUEBLE (``services/candado.py``):
  la misma clave que la venta de la cara entera, de sus partes, del guardado
  del plano y de la renumeración. Por eso todo camino arma el código COMPLETO
  de la cara con la sede del plano (``codigo_cara``): ``GON-01`` y
  ``NAVE-GON-01`` darían candados distintos.
· ``db.expire_all()`` justo después del candado: SQLAlchemy no refresca un
  objeto que la sesión ya tiene en memoria cuando se lo vuelve a consultar, y la
  primera revisión cargó los términos. Sin esto, una reserva que otra sesión
  subió de 30 % a 70 % se seguiría leyendo en 30 %.
· La geometría (medir zonas: hasta ≈ 0,1–0,5 s en CPython) se calcula ANTES del
  candado: el candado frena el guardado del plano de la sede y toda venta de
  ese mueble. Adentro sólo se juzga con los términos frescos (barato) y, si la
  distribución o el mueble cambiaron en el medio (raro), se vuelve a medir.
· La versión optimista de un término y de una distribución se comprueba con
  ``UPDATE … WHERE version = :leida`` (0 filas → 409 ``version_vieja``): en
  SQLite el candado no hace nada y esto es lo que queda.

**Ninguna función hace commit**: el router anota la bitácora (necesita el
``Request``) y hace commit, y sólo después manda los correos o arma un 409 «que
guarda» con ``JSONResponse`` (con ``raise HTTPException`` la sesión haría
rollback y el borrador se perdería).

Los errores van como ``HTTPException(status, detail={"code", "message", …})``,
el formato del guardado del plano que ``describeError`` del navegador lee por
``message``. Las frases nunca nombran proveedores ni montos salvo en lo que
sólo ve la dueña (el ``TerminoOut``).
"""
from __future__ import annotations

import json
import math
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import func, or_, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.fechas import ZONA_DEL_NEGOCIO, hoy
from app.models.models import Space, SpaceLease, Supplier
from app.models.participaciones import Distribucion, HistorialParticipacion, Participacion, Zona
from app.models.vender import CobroPorVenta, CondicionesDeContrato, PrecioDeReserva
from app.services.meses import al_mes_de
from app.services import reglas_participacion as reglas
from app.services import zonas_geometria as geo
from app.services.alta_de_contrato import escribir_contrato, espacio_para, proveedor_por_nombre
from app.services.candado import tomar_candados
from app.services.ciclo_participaciones import anotar_historial
from app.services.layout_lookup import (
    SIN_CARA_B, PlanoIndexado, caras_de, contratos_que_chocan, es_comercializable, motivo_para_no_vender_parte,
    normalizar, por_participacion, sin_prefijo_de_sede,
)
from app.services.partes import CodigoPartido, Parte, codigo_de_parte, es_division, es_participacion, partir_codigo
from app.services.superficie import firma as firma_de_cara
from app.services.superficie import superficie as superficie_de_cara
from app.services.superficie import tiene_superficie

#: El período por defecto de la capacidad y del informe: un año desde hoy.
DIAS_DEL_PERIODO = 364
#: ``partir_codigo`` sólo reconoce ``PC1``…``PC99``.
NUMERO_MAXIMO = 99
LIMITE_DEL_HISTORIAL = 200
LIMITE_MAXIMO_DEL_HISTORIAL = 1000
#: El «para siempre» de la ocupación (lo que termina hoy o después).
_SIN_FIN = date(9999, 12, 31)
_PARTE_PC = Parte("participacion", "PC", 1)


def _ahora() -> datetime:
    return datetime.now(timezone.utc)


def _error(status: int, code: str, message: str, **extra) -> HTTPException:
    return HTTPException(status_code=status, detail={"code": code, "message": message, **extra})


def _utc(dt: Optional[datetime]) -> Optional[datetime]:
    """SQLite devuelve los ``DateTime(timezone=True)`` sin huso: se guardaron
    en UTC (como lee ``bitacora._utc``)."""
    if dt is None:
        return None
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt.astimezone(timezone.utc)


def _iso(dt: Optional[datetime]) -> Optional[str]:
    u = _utc(dt)
    return u.isoformat() if u is not None else None


def baja_fecha(baja_en: Optional[datetime]) -> Optional[date]:
    """El DÍA de la cancelación en Colombia (§3.2): una baja a las 21:00 del 17
    de octubre en Colombia se guarda ``2026-10-18T02:00Z`` y su día es el 17. El
    navegador usa este campo y nunca deriva un día de un instante."""
    u = _utc(baja_en)
    return u.astimezone(ZONA_DEL_NEGOCIO).date() if u is not None else None


def _escapar_like(texto: str) -> str:
    return texto.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _version_vieja_termino(actual: Optional[int]) -> HTTPException:
    return _error(
        409, "version_vieja",
        "Otra sesión cambió esta participación mientras la editabas: traé lo nuevo y volvé a intentar.",
        version_actual=actual,
    )


def _version_vieja_distribucion(actual: Optional[int]) -> HTTPException:
    return _error(
        409, "version_vieja",
        "Otra sesión cambió esta distribución mientras la editabas. Tu trabajo sigue en pantalla: traé lo "
        "nuevo y se combina con lo tuyo.",
        version_actual=actual,
    )


def _reintentar() -> HTTPException:
    return _error(409, "reintentar",
                  "Otra sesión creó una participación en esta cara al mismo tiempo. Probá de nuevo.")


# ─── La cara: del texto (o del término) al mueble del plano ──────────────────


@dataclass
class Cara:
    """Una cara del plano: el mueble, la letra y su código COMPLETO armado con
    la sede del PLANO (nunca con el campo ``sede`` del mueble, V16), que es
    también la clave del candado. ``fixture`` es None sólo para un término cuyo
    mueble ya no está en el plano (lo único que se le puede hacer es cancelar
    una reserva)."""
    sede: str
    fixture: Optional[dict]
    letra: str
    codigo: str
    por_participacion: bool
    comercializable: bool
    superficie: Optional[dict]
    firma: Optional[str]

    @property
    def corto(self) -> str:
        return sin_prefijo_de_sede(self.codigo, self.sede)

    @property
    def fixture_id(self) -> Optional[str]:
        fid = (self.fixture or {}).get("id")
        return None if fid is None else str(fid)

    @property
    def rotulo(self) -> str:
        f = self.fixture or {}
        return str(f.get("label") or f.get("code") or partir_codigo(self.corto).base)

    @property
    def distribuible(self) -> bool:
        return self.por_participacion and self.superficie is not None


def codigo_cara(sede: str, codigo: str) -> str:
    """El código COMPLETO de la cara de ``codigo`` con la sede del plano:
    ``GON-01-B-PC3`` + ``NAVE`` → ``NAVE-GON-01-B``."""
    s = normalizar(sede)
    p = partir_codigo(codigo)
    base = sin_prefijo_de_sede(p.base, s)
    completo = f"{s}-{base}" if s else base
    return f"{completo}-B" if p.cara == "B" else completo


def _armar_cara(sede: str, fixture: Optional[dict], letra: str, codigo: Optional[str] = None) -> Cara:
    s = normalizar(sede)
    if codigo is None:
        base = sin_prefijo_de_sede(normalizar((fixture or {}).get("code")), s)
        codigo = (f"{s}-{base}" if s else base) + ("-B" if letra == "B" else "")
    if fixture is None:
        return Cara(s, None, letra, normalizar(codigo), False, False, None, None)
    return Cara(
        sede=s, fixture=fixture, letra=letra, codigo=normalizar(codigo),
        por_participacion=por_participacion(fixture), comercializable=es_comercializable(fixture),
        superficie=superficie_de_cara(fixture, letra), firma=firma_de_cara(fixture, letra),
    )


def resolver_cara(db: Session, sede: str, espacio: str, plano: Optional[PlanoIndexado] = None) -> Cara:
    """La cara que pide el texto (``GON-01``, ``GON-01-B``, ``NAVE-GON-01-B``)
    en el plano de ``sede``, como la resuelve la planilla
    (``PlanoIndexado.resolver``). 404 si el mueble no está; 409 si pide la B de
    un mueble de una cara; 422 si pide una parte."""
    s = normalizar(sede)
    texto = normalizar(espacio)
    if not s or not texto:
        raise _error(422, "espacio_vacio", "Falta la sede o el código de la cara.")
    plano = plano or PlanoIndexado(db)
    r = plano.resolver(s, texto)
    if r is None:
        una = plano.sin_cara_b(s, texto)
        if una is not None:
            raise _error(409, SIN_CARA_B,
                         f"«{sin_prefijo_de_sede(una.codigo, una.sede)}» tiene una sola cara: no hay cara B que vender.")
        raise _error(404, "sin_mueble",
                     f"No hay ningún mueble con el código «{sin_prefijo_de_sede(texto, s)}» en el plano de {s}.")
    if r.parte is not None:
        corto = sin_prefijo_de_sede(normalizar(r.fixture.get("code")), s)
        # La B se nombra sólo si existe (``caras_de``: la única respuesta a
        # «¿tiene cara B?»); a una nevera de una cara no se le ofrece «NEV-03-B».
        caras = f"{corto} o {corto}-B" if caras_de(r.fixture) == 2 else corto
        raise _error(422, "pide_una_parte", f"Pedí la cara ({caras}), no una parte.")
    return _armar_cara(s, r.fixture, r.partido.cara)


def _sede_por_prefijo(codigo: str, plano: PlanoIndexado) -> str:
    """La sede de un código COMPLETO por su prefijo, entre las sedes que
    tienen plano: la más larga que calce y cuyo plano tenga el mueble (``SAN``
    y ``SAN-JOSE`` empiezan igual); si ninguno lo tiene, la más larga que
    calce, para que la frase del 404 nombre la sede. ``""`` si no calza
    ninguna."""
    calzan = sorted((s for s in plano.sedes() if s and codigo.startswith(f"{s}-")), key=len, reverse=True)
    for s in calzan:
        if plano.resolver(s, sin_prefijo_de_sede(codigo, s)) is not None:
            return s
    return calzan[0] if calzan else ""


def cara_del_termino(db: Session, termino: Participacion, plano: Optional[PlanoIndexado] = None) -> Cara:
    """La cara de un término, por su fila de cara: el código guardado ES el
    completo (lo armó el alta con la sede del plano, y la renumeración lo muda
    con el mueble). El mueble se busca por el código corto en el plano de esa
    sede; si ya no está, ``fixture`` queda None.

    La sede sale de la fila de cara; si está vacía (las filas de antes de la
    columna, las de ``find-or-create`` o de un reporte de montaje sin sede: el
    alta las reusa), de la fila PC del término, que ``_crear_espacio_pc`` llena
    siempre con la sede del plano; y si tampoco, del prefijo del código. Sin
    esto, confirmar, renovar y cambiar daban 404 «ya no está en el plano de .»
    con el mueble en el plano."""
    cara_space = db.get(Space, termino.cara_space_id)
    sede = normalizar(cara_space.sede)
    codigo = normalizar(cara_space.code)
    if not sede:
        pc = db.get(Space, termino.space_id)
        sede = normalizar(pc.sede) if pc is not None else ""
    if not sede:
        plano = plano or PlanoIndexado(db)
        sede = _sede_por_prefijo(codigo, plano)
    letra = partir_codigo(codigo).cara
    fixture = None
    if sede:
        plano = plano or PlanoIndexado(db)
        r = plano.resolver(sede, sin_prefijo_de_sede(codigo, sede))
        if r is not None and r.parte is None and r.partido.cara == letra:
            fixture = r.fixture
    return _armar_cara(sede, fixture, letra, codigo)


# ─── Lo que la base sabe de una cara ──────────────────────────────────────────


def termino_para_reglas(t: Participacion, lease: Optional[SpaceLease]) -> dict:
    """La entrada de ``reglas_participacion`` (§3.2). En un contrato,
    proveedor, marca y fechas salen SIEMPRE del lease (la única verdad); sus
    columnas en el término van en NULL y no se leen."""
    base = {"id": t.id, "space_id": t.space_id, "numero": t.numero, "estado": t.estado, "pb": t.puntos_basicos,
            "baja_fecha": baja_fecha(t.baja_en)}
    if t.estado == "contrato":
        if lease is None:
            return {**base, "supplier_id": None, "marca": None, "desde": None, "hasta": None, "caduca": None,
                    "lease": None}
        return {**base, "supplier_id": lease.supplier_id, "marca": lease.marca, "desde": lease.start_date,
                "hasta": lease.end_date, "caduca": None,
                "lease": {"is_active": bool(lease.is_active), "start_date": lease.start_date,
                          "end_date": lease.end_date}}
    return {**base, "supplier_id": t.supplier_id, "marca": t.marca, "desde": t.desde, "hasta": t.hasta,
            "caduca": t.caduca, "lease": None}


@dataclass
class Datos:
    """Los términos, sus leases y la distribución de UNA cara, leídos juntos.
    ``por_s``: la entrada de las reglas por participación (``space_id`` del
    espacio PC), con todos sus términos."""
    cara_space: Optional[Space] = None
    terminos: list = field(default_factory=list)
    leases: dict = field(default_factory=dict)
    pcs: dict = field(default_factory=dict)
    por_s: dict = field(default_factory=dict)
    distribucion: Optional[Distribucion] = None
    capas: dict = field(default_factory=lambda: {"borrador": [], "confirmada": []})

    @property
    def todos(self) -> list[dict]:
        return [t for s in sorted(self.por_s) for t in self.por_s[s]]

    @property
    def version(self) -> int:
        return self.distribucion.version if self.distribucion is not None else 0


def leer(db: Session, codigo: str) -> Datos:
    """Todo lo que hay en la base sobre la cara de ese código COMPLETO."""
    datos = Datos()
    cara_space = db.query(Space).filter(Space.code == normalizar(codigo)).first()
    if cara_space is None:
        return datos
    datos.cara_space = cara_space
    datos.terminos = (db.query(Participacion).filter(Participacion.cara_space_id == cara_space.id)
                      .order_by(Participacion.id).all())
    ids_lease = [t.lease_id for t in datos.terminos if t.lease_id is not None]
    if ids_lease:
        datos.leases = {L.id: L for L in db.query(SpaceLease).filter(SpaceLease.id.in_(ids_lease)).all()}
    ids_pc = sorted({t.space_id for t in datos.terminos})
    if ids_pc:
        datos.pcs = {s.id: s for s in db.query(Space).filter(Space.id.in_(ids_pc)).all()}
    for t in datos.terminos:
        datos.por_s.setdefault(t.space_id, []).append(termino_para_reglas(t, datos.leases.get(t.lease_id)))
    datos.distribucion = db.query(Distribucion).filter(Distribucion.cara_space_id == cara_space.id).first()
    if datos.distribucion is not None:
        for z in (db.query(Zona).filter(Zona.distribucion_id == datos.distribucion.id)
                  .order_by(Zona.orden, Zona.id).all()):
            datos.capas.setdefault(z.capa, []).append(z)
    return datos


def fisicos_de(db: Session, cara: Cara, desde: date, hasta: date, excluir_lease: Optional[int] = None) -> list[dict]:
    """Lo que ocupa la cara ENTERA en [desde, hasta] (§3.2): sus contratos de
    cara entera o de partes físicas, y los leases de participación sin término
    (huérfanos: un script, un archivo viejo), que cuentan como la cara entera
    hasta que se aclaren. Con el código de la CARA, nunca con el de una PC.

    «Con término» quiere decir con un término de ESTA fila de cara (la que
    ``leer`` encuentra por el código y cuyos términos ya suman en la
    capacidad). Un lease PC vivo cuyo término cuelga de OTRA fila —la carrera
    entre borrar la sede y la primera alta de la cara deja uno colgado de la
    fila archivada ``…#id``— no lo cuenta ningún término de esta cara: va
    como huérfano, cuenta como la cara entera (conservador: nunca sobreventa)
    y Supervisar lo lista.

    ``excluir_lease``: sólo «Editar contrato» (el contrato que se edita no
    ocupa la cara contra sí mismo; ``services/editar_contrato.py``)."""
    choques = contratos_que_chocan(db, cara.codigo, desde, hasta, sede=cara.sede, excluir_lease=excluir_lease)
    de_pc = [lease.id for lease, _space, p in choques if es_participacion(p.parte)]
    con_termino = set()
    if de_pc:
        con_termino = {lid for (lid,) in (db.query(Participacion.lease_id)
                                          .join(Space, Space.id == Participacion.cara_space_id)
                                          .filter(Participacion.lease_id.in_(de_pc),
                                                  Space.code == normalizar(cara.codigo)))}
    fuera = []
    for lease, space, p in choques:
        if es_participacion(p.parte) and lease.id in con_termino:
            continue
        fuera.append({"codigo": space.code, "desde": lease.start_date, "hasta": lease.end_date,
                      "huerfano": es_participacion(p.parte), "lease_id": lease.id})
    return fuera


def bloqueo_por_participaciones(db: Session, sede: str, codigo: str, desde: date, hasta: date,
                                excluir_id: Optional[int] = None) -> Optional[str]:
    """La frase que frena vender la cara ENTERA de ``codigo`` (o una división
    física suya) si tiene reservas o contratos de participación que cuentan en
    ``[max(desde, HOY), hasta]``; None si no (§4.3). La usan la planilla, el
    contrato suelto y la importación del plano (paso 4c) como defensa en
    profundidad: la compuerta ya frena la entera de una cara POR
    participación; esto cubre la que dejó de serlo con términos vivos.

    La cara se resuelve contra el plano como la planilla
    (``PlanoIndexado.resolver``), así un código corto o con otra escritura
    encuentra la cara completa; sin mueble, se arma con la sede. Una pieza (la
    bahía de una caja) no choca con participaciones, y un código de
    participación lo rechaza cada camino con su propia frase: los dos dan None.
    Sin términos en la cara cuesta una consulta indexada vacía. La frase no
    nombra proveedores ni montos (la lee Vender en vivo).

    ``excluir_id``: el término del contrato que se edita (sólo «Editar
    contrato»): no frena consigo mismo."""
    dia = hoy()
    a = max(desde, dia)
    if a > hasta:
        return None
    s = normalizar(sede)
    p = partir_codigo(codigo)
    if es_participacion(p.parte) or (p.parte is not None and not es_division(p.parte)):
        return None
    r = PlanoIndexado(db).resolver(s, codigo) if s else None
    if r is not None:
        cara = _armar_cara(s, r.fixture, r.partido.cara).codigo
    else:
        cara = codigo_cara(s, codigo)
    datos = leer(db, cara)
    if not datos.terminos:
        return None
    cuentan = [i for i in reglas.intervalos_que_cuentan(datos.todos, [], dia, excluir_id=excluir_id)
               if i["desde"] <= hasta and a <= i["hasta"]]
    if not cuentan:
        return None
    primero = min(i["desde"] for i in cuentan)
    ultimo = max(i["hasta"] for i in cuentan)
    # Sin cuántos términos: delante del proveedor (Vender) eso dice cuántos
    # otros tienen algo en la cara.
    return (f"«{sin_prefijo_de_sede(cara, s)}» se vende por participación del {reglas._fecha_corta(max(primero, a))} "
            f"al {reglas._fecha_corta(min(ultimo, hasta))}: en esas fechas no se vende entera ni por partes.")


# ─── La geometría (afuera del candado) ───────────────────────────────────────


def _crudas(zonas: list[Zona]) -> list[dict]:
    return [{"participacion_space_id": z.participacion_space_id, "vertices": json.loads(z.vertices_json)}
            for z in zonas]


def medir_capa(zonas: list[dict], superficie: dict) -> dict:
    """``zonas_geometria.medir``: lo caro, sin términos. Se llama ANTES del
    candado (las pruebas lo espían)."""
    return geo.medir(zonas, superficie)


def juzgar_capa(medidas: dict, por_s: dict, dia: date, *, confirmada: bool, firma_cambio: bool,
                orientacion: str) -> dict:
    """``reglas_participacion.juzgar``: barato, con los términos frescos. En la
    confirmación de una distribución corre ADENTRO del candado."""
    return reglas.juzgar(medidas, por_s, dia, confirmada=confirmada, firma_cambio=firma_cambio,
                         orientacion=orientacion)


def _otro_mueble(datos: Datos, cara: Cara) -> bool:
    """La distribución se dibujó para otro mueble que tenía este código
    (§2.5): no vale para el de ahora."""
    return datos.distribucion is not None and datos.distribucion.fixture_id != cara.fixture_id


def medidas_de_capas(cara: Cara, datos: Datos) -> Optional[dict]:
    """Las medidas de las dos capas guardadas, para ``rompe_distribucion``
    (§3.11). None si la cara no se distribuye o la distribución es de otro
    mueble."""
    if not cara.distribuible or datos.distribucion is None or _otro_mueble(datos, cara):
        return None
    fuera = {"version": datos.version, "firma": cara.firma, "confirmada": None, "borrador": None}
    if datos.capas.get("confirmada"):
        fuera["confirmada"] = medir_capa(_crudas(datos.capas["confirmada"]), cara.superficie)
    if datos.distribucion.borrador_en is not None and datos.capas.get("borrador"):
        fuera["borrador"] = medir_capa(_crudas(datos.capas["borrador"]), cara.superficie)
    return fuera


def _medidas_frescas(cara: Cara, datos: Datos, previas: Optional[dict]) -> Optional[dict]:
    """Adentro del candado: las medidas de afuera sirven si la distribución y
    el mueble no cambiaron en el medio; si no (raro), se vuelve a medir."""
    if previas is not None and previas["version"] == datos.version and previas["firma"] == cara.firma \
            and cara.distribuible and not _otro_mueble(datos, cara):
        return previas
    return medidas_de_capas(cara, datos)


# ─── La revisión de un término (§3.4, §3.5, §3.11, §4.2) ─────────────────────


def _compuerta(cara: Cara) -> None:
    """La compuerta de §4.2: la participación EXISTE si la cara se vende por
    participación (lo comercializable, la cara B que no existe y la división
    física los dice ``motivo_para_no_vender_parte``, la misma frase que la
    planilla)."""
    if cara.fixture is None:
        raise _error(404, "sin_mueble", f"El mueble de «{cara.corto}» ya no está en el plano de {cara.sede}.")
    partido = CodigoPartido(normalizar(cara.fixture.get("code")), cara.letra, _PARTE_PC)
    motivo = motivo_para_no_vender_parte(cara.fixture, partido)
    if motivo:
        raise _error(409, motivo[0], motivo[1])


def _rechazo(r) -> None:
    """Un ``(codigo, frase, extra)`` de las reglas → 409."""
    if r is not None:
        codigo, frase, extra = r
        raise _error(409, codigo, frase, **extra)


def validar_fechas(tipo: str, desde: date, hasta: date, caduca: Optional[date], dia: date) -> None:
    """Los 422 de las fechas de un término (§5.3), en el orden de la tabla."""
    if desde > hasta:
        raise _error(422, "fechas", "La fecha de inicio no puede ser posterior a la de fin")
    if tipo == "reserva":
        if hasta < dia:
            raise _error(422, "reserva_pasada", "Una reserva provisional tiene que terminar hoy o después.")
        if caduca is None or not (dia <= caduca <= hasta):
            raise _error(422, "caduca", "La reserva tiene que caducar entre hoy y el último día que reserva.")


def _valor_valido(valor) -> bool:
    return isinstance(valor, (int, float)) and math.isfinite(valor) and valor >= 0


def _total_y_al_mes(e: dict, desde, hasta) -> tuple[float, Optional[float]]:
    """``(total, lo_de_cada_mes)`` del valor del cuerpo. Con ``al_mes`` (el
    formulario de Distribución, que pide «Valor al mes»: 2026-10-26), el total
    es ese valor × los meses del contrato, al peso, como «Al mes» en Vender; si
    no, el valor ya es el total y no hay nada que anotar."""
    from app.services.meses import al_peso, meses_entre

    valor = e.get("valor_mensual")
    if e.get("al_mes") and valor:
        return al_peso(float(valor) * meses_entre(desde, hasta)), float(valor)
    return valor, None


def _anotar_al_mes(db: Session, lease, al_mes: Optional[float]) -> None:
    """Cómo se escribió el precio: «al mes». Sin esto el contrato quedaba sin
    forma y se leía como el total (los contratos de antes de Vender)."""
    if lease is not None and al_mes:
        db.add(CondicionesDeContrato(lease_id=lease.id, modo_precio="mensual", valor_tecleado=al_mes))


def validar_tipo(tipo: str, caduca, valor, *, admite_precio: bool = False) -> None:
    """Lo que cada tipo lleva y lo que no (§5.3): la reserva caduca y no tiene
    valor; el contrato tiene valor (≥ 0) y no caduca.

    ``admite_precio``: sólo el guardado de Vender (``services/vender.py``),
    que guarda el precio acordado de una reserva aparte, en
    ``precios_de_reserva`` (``docs/rediseno/vender-api.md`` §2). Por
    ``POST /api/participaciones/`` una reserva sigue sin valor."""
    if tipo == "contrato":
        if caduca is not None:
            raise _error(422, "caduca", "Un contrato no caduca: la caducidad es de la reserva provisional.")
        if valor is None or not _valor_valido(valor):
            raise _error(422, "valor_mensual", "Escribí el valor del contrato.")
    elif admite_precio:
        if valor is not None and not _valor_valido(valor):
            raise _error(422, "valor_mensual", "El precio acordado de la reserva tiene que ser un número de 0 o más.")
    elif valor is not None:
        raise _error(422, "valor_mensual",
                     "Una reserva provisional no lleva valor: se escribe al confirmarla como contrato.")


def _terminos_despues(por_s: dict, tipo: str, t: Optional[dict], nuevo: dict) -> dict:
    """Los términos de la cara como quedarían con el cambio (para
    ``rompe_distribucion``)."""
    despues = {s: list(ts) for s, ts in por_s.items()}
    if tipo == "renovar":
        contrato = nuevo["tipo_nuevo"] == "contrato"
        despues[t["space_id"]].append({
            "id": -1, "space_id": t["space_id"], "numero": t["numero"], "estado": nuevo["tipo_nuevo"],
            "pb": nuevo["pb"], "supplier_id": t["supplier_id"], "marca": t["marca"],
            "desde": nuevo["desde"], "hasta": nuevo["hasta"],
            "caduca": None if contrato else nuevo["caduca"], "baja_fecha": None,
            "lease": ({"is_active": True, "start_date": nuevo["desde"], "end_date": nuevo["hasta"]}
                      if contrato else None),
        })
        return despues
    cambiado = {**t, "pb": nuevo["pb"], "desde": nuevo["desde"], "hasta": nuevo["hasta"]}
    if tipo == "editar":
        cambiado.update(caduca=nuevo["caduca"], marca=nuevo["marca"])
    else:  # confirmar: la reserva pasa a contrato con esas fechas
        cambiado.update(estado="contrato", caduca=None,
                        lease={"is_active": True, "start_date": nuevo["desde"], "end_date": nuevo["hasta"]})
    despues[t["space_id"]] = [cambiado if x["id"] == t["id"] else x for x in despues[t["space_id"]]]
    return despues


def revisar_alta(db: Session, cara: Cara, datos: Datos, cambio: dict, medidas: Optional[dict] = None,
                 excluir_lease: Optional[int] = None, excluir_termino: Optional[int] = None) -> list:
    """La revisión de un camino que crea o cambia un término (§4.3): versión,
    estado del término, compuerta, fechas, invariantes I1–I3, capacidad con lo
    físico de la cara y ``rompe_distribucion``. Levanta el 409 (o 422/404) con
    el detalle estructurado; si pasa, devuelve los problemas que el cambio le
    crea al BORRADOR (sólo avisos: el borrador no es oficial).

    Se llama dos veces por camino: antes del candado (para fallar rápido) y
    después de ``tomar_candados`` + ``expire_all`` con ``datos`` leídos de
    nuevo (la que vale).

    ``cambio``: ``{"tipo": "alta" | "editar" | "confirmar" | "cancelar" |
    "renovar", …}`` con ``id`` y ``version`` (editar, confirmar, cancelar),
    ``renueva_a`` y ``version`` (renovar), y ``pb``, ``desde``, ``hasta``,
    ``caduca``, ``marca``, ``tipo_nuevo`` según el caso.

    ``excluir_lease`` / ``excluir_termino`` (sólo en un alta, y sólo desde
    «Editar contrato», ``services/editar_contrato.py``): el contrato que se
    edita —una cara entera que pasa a porcentaje, o el porcentaje mismo— no
    compite consigo mismo en la capacidad.
    """
    dia = hoy()
    tipo = cambio["tipo"]
    t_fila: Optional[Participacion] = None
    if tipo != "alta":
        tid = cambio["renueva_a"] if tipo == "renovar" else cambio["id"]
        t_fila = next((x for x in datos.terminos if x.id == tid), None)
        if t_fila is None:
            raise _error(404, "sin_participacion", "Esa participación no existe.")
    if tipo in ("editar", "confirmar", "cancelar") and t_fila.version != cambio["version"]:
        raise _version_vieja_termino(t_fila.version)
    if tipo == "cancelar":
        if t_fila.estado == "contrato":
            raise _error(409, "es_contrato", "Un contrato se cancela desde su ficha (Cancelar contrato).")
        if t_fila.estado != "reserva":
            raise _error(409, "no_cancelable", "Esa reserva provisional ya estaba cancelada.")
        # Una reserva caducada ya no cuenta: cancelarla reescribía su historia
        # (pasaba a «cancelada» con la fecha de hoy y el historial dejaba de
        # derivar «caducó»). Se deja como está.
        t = next(x for x in datos.por_s[t_fila.space_id] if x["id"] == t_fila.id)
        if reglas.estado_visible(t, dia) == "reserva_caducada":
            cuando = f" el {reglas._fecha_corta(t['caduca'])}" if t.get("caduca") is not None else ""
            raise _error(409, "reserva_caducada",
                         f"La reserva ya caducó{cuando}: no hace falta cancelarla; queda en el historial.")
        return []

    _compuerta(cara)
    t = None if t_fila is None else next(x for x in datos.por_s[t_fila.space_id] if x["id"] == t_fila.id)
    if tipo == "alta":
        nuevo = {"pb": cambio["pb"], "desde": cambio["desde"], "hasta": cambio["hasta"]}
        excluir = excluir_termino
    elif tipo == "renovar":
        nuevo = {"tipo_nuevo": cambio["tipo_nuevo"], "pb": t["pb"], "desde": cambio["desde"],
                 "hasta": cambio["hasta"], "caduca": cambio.get("caduca")}
        _rechazo(reglas.revisar_terminos(datos.por_s[t["space_id"]], {
            "tipo": "renovar", "renueva_a": t["id"], "desde": nuevo["desde"], "hasta": nuevo["hasta"],
            "pb": t["pb"], "supplier_id": t["supplier_id"], "marca": t["marca"]}, dia))
        # Después de las reglas: renovar dos veces el mismo término choca con
        # «ya tiene un término más nuevo», que dice más que «otra sesión».
        if t_fila.version != cambio["version"]:
            raise _version_vieja_termino(t_fila.version)
        excluir = None
    else:  # editar o confirmar una reserva
        nuevo = {
            "pb": cambio.get("pb") if cambio.get("pb") is not None else t["pb"],
            "desde": cambio.get("desde") or t["desde"],
            "hasta": cambio.get("hasta") or t["hasta"],
            "caduca": cambio.get("caduca") or t["caduca"],
            "marca": cambio["marca"] if "marca" in cambio else t["marca"],
        }
        # Las fechas, sólo si el término se puede tocar: a un contrato o a una
        # reserva caducada le corresponde el 409 de su estado, no un 422.
        if t["estado"] == "reserva" and reglas.vivo(t, dia):
            validar_fechas("reserva" if tipo == "editar" else "contrato", nuevo["desde"], nuevo["hasta"],
                           nuevo["caduca"], dia)
        tocado = {k: cambio[k] for k in ("pb", "desde", "hasta", "marca") if k in cambio}
        _rechazo(reglas.revisar_terminos(datos.por_s[t["space_id"]], {"tipo": tipo, "id": t["id"], **tocado}, dia))
        excluir = t["id"]

    fisicos = fisicos_de(db, cara, nuevo["desde"], nuevo["hasta"], excluir_lease=excluir_lease if tipo == "alta" else None)
    I = reglas.intervalos_que_cuentan(datos.todos, fisicos, dia, excluir_id=excluir)
    _rechazo(reglas.revisar_capacidad(I, fisicos, nuevo["pb"], nuevo["desde"], nuevo["hasta"], cara.letra, dia))

    if tipo == "alta" or medidas is None:
        return []
    despues = _terminos_despues(datos.por_s, tipo, t, nuevo)
    if medidas.get("confirmada") is not None:
        rotos = reglas.rompe_distribucion(medidas["confirmada"], datos.por_s, despues, dia)
        if rotos:
            raise _error(409, "rompe_distribucion", reglas.mensaje_de_rompe(rotos), problemas=rotos)
    if medidas.get("borrador") is not None:
        return reglas.rompe_distribucion(medidas["borrador"], datos.por_s, despues, dia)
    return []


# ─── Escribir un término ─────────────────────────────────────────────────────


@dataclass
class Hecho:
    """Lo que hizo un camino de término, para que el router anote la
    bitácora, haga commit, arme la respuesta y mande los correos."""
    cara: Cara
    termino: Participacion
    accion: str
    detalle: str
    lease: Optional[SpaceLease] = None
    supplier: Optional[Supplier] = None
    avisos_distribucion: list = field(default_factory=list)
    #: El código de la participación, para la bitácora.
    entidad: str = ""


def _bajo_candado(db: Session, cara: Cara) -> None:
    """El candado del mueble de la cara y la lectura fresca (regla dura)."""
    tomar_candados(db, [cara.codigo])
    db.expire_all()


def _misma_cara(antes: Cara, despues: Cara) -> None:
    """El candado se tomó con el código de afuera: si adentro la cara es otra
    (el plano cambió en el medio), no se escribe."""
    if antes.codigo != despues.codigo:
        raise _error(409, "plano_cambio", "El plano cambió mientras guardabas: recargá la cara y volvé a intentar.")


def siguiente_numero(db: Session, cara_space: Space, cara: Cara) -> int:
    """El ``n`` de la próxima participación de la cara (§2.4): nunca se
    reutiliza. El mayor entre los términos y las filas ``…-PC<n>`` de la cara
    (también las creadas a mano, la forma corta de esa sede y las archivadas,
    ``…-PC7#12``). Se calcula con el candado tomado."""
    a = db.query(func.max(Participacion.numero)).filter(Participacion.cara_space_id == cara_space.id).scalar() or 0
    c = normalizar(cara.codigo)
    s = cara.sede
    formas = {c} | ({sin_prefijo_de_sede(c, s)} if s else set())
    guardado = func.upper(func.trim(Space.code))
    filas = (db.query(Space.code, Space.sede)
             .filter(or_(*[guardado.like(f"{_escapar_like(f)}-PC%", escape="\\") for f in sorted(formas)]))
             .all())
    b = 0
    for code, sede_fila in filas:
        bruto = normalizar(code).split("#", 1)[0]
        if s and not bruto.startswith(f"{s}-") and normalizar(sede_fila) not in ("", s):
            continue  # la forma corta de OTRA sede
        p = partir_codigo(f"{s}-{sin_prefijo_de_sede(bruto, s)}" if s else bruto)
        if es_participacion(p.parte) and codigo_de_parte(p.base, p.cara, None) == c:
            b = max(b, p.parte.n)
    return max(a, b) + 1


def _fila_de_cara(db: Session, cara: Cara, datos: Datos) -> Space:
    """La fila de ``spaces`` de la cara, buscada o creada LIBRE con el armado
    de la planilla (``alta_de_contrato.espacio_para``). Una fila que ya
    estaba sin sede (de antes de la columna, de ``find-or-create``) se queda
    con la del plano: es la que leen ``cara_del_termino``, «Para revisar» y el
    archivo de la sede. Una sede que ya tiene no se pisa."""
    if datos.cara_space is not None:
        if not normalizar(datos.cara_space.sede) and cara.sede:
            datos.cara_space.sede = cara.sede
        return datos.cara_space
    try:
        return espacio_para(db, cara.codigo, cara.rotulo, cara.sede, cara.fixture, None)
    except IntegrityError:
        raise _reintentar()


def _crear_espacio_pc(db: Session, cara: Cara, n: int) -> Space:
    codigo = f"{cara.codigo}-PC{n}"
    if db.query(Space.id).filter(or_(Space.code == codigo, Space.svg_id == codigo)).first() is not None:
        raise _reintentar()
    try:
        return espacio_para(db, codigo, f"{cara.rotulo} · Participación {n} · cara {cara.letra}", cara.sede,
                            cara.fixture, Parte("participacion", "PC", n))
    except IntegrityError:
        raise _reintentar()


def _marca(texto: Optional[str]) -> Optional[str]:
    limpio = (texto or "").strip()
    return limpio or None


def _correo(texto: Optional[str]) -> Optional[str]:
    """Como la planilla: un correo que no parece correo no se guarda."""
    limpio = (texto or "").strip()
    return limpio if limpio and "@" in limpio and " " not in limpio else None


def _campos_historial(t: dict, proveedor: Optional[str]) -> dict:
    """Lo que el historial guarda de un término: SIN valor (nunca se purga)."""
    return {"puntos_basicos": t["pb"], "desde": t["desde"], "hasta": t["hasta"], "caduca": t.get("caduca"),
            "proveedor": proveedor, "marca": t.get("marca"), "estado": t.get("estado")}


def _frase_del_termino(numero: int, pb: int, proveedor: str, marca: Optional[str], desde, hasta) -> str:
    return (f"Participación {numero} · {reglas.pct(pb)} · {proveedor}{f' ({marca})' if marca else ''} · "
            f"{desde.isoformat()}→{hasta.isoformat()}")


def alta(db: Session, e: dict, actor: str) -> Hecho:
    """5 · Alta de una reserva provisional o de un contrato sobre una
    participación NUEVA de la cara (§5.3). ``e``: el cuerpo ya validado por
    pydantic."""
    dia = hoy()
    tipo = e["tipo"]
    validar_fechas(tipo, e["desde"], e["hasta"], e.get("caduca"), dia)
    validar_tipo(tipo, e.get("caduca"), e.get("valor_mensual"))
    cambio = {"tipo": "alta", "pb": e["puntos_basicos"], "desde": e["desde"], "hasta": e["hasta"]}

    cara = resolver_cara(db, e["sede"], e["espacio"])
    datos = leer(db, cara.codigo)
    revisar_alta(db, cara, datos, cambio)
    _bajo_candado(db, cara)
    fresca = resolver_cara(db, e["sede"], e["espacio"])
    _misma_cara(cara, fresca)
    # Los términos de afuera siguen en memoria (``datos``): sin el
    # ``expire_all`` de ``_bajo_candado``, esta lectura los devolvería viejos
    # (el mapa de identidad no los refresca) y una reserva que otra sesión
    # subió de 30 % a 70 % seguiría contando 30 %.
    datos = leer(db, fresca.codigo)
    revisar_alta(db, fresca, datos, cambio)
    return escribir_alta(db, fresca, datos, e, actor)


def escribir_alta(db: Session, fresca: Cara, datos: Datos, e: dict, actor: str,
                  supplier: Optional[Supplier] = None) -> Hecho:
    """La mitad que ESCRIBE el alta, con el candado ya tomado y la revisión de
    adentro hecha (``alta`` y el guardado de Vender, ``services/vender.py``,
    que toma los candados de todas sus líneas juntos). ``supplier``: el
    proveedor ya buscado o creado por quien llama."""
    tipo = e["tipo"]
    cara_space = _fila_de_cara(db, fresca, datos)
    n = siguiente_numero(db, cara_space, fresca)
    if n > NUMERO_MAXIMO:
        raise _error(409, "cara_llena", f"Esta cara ya usó {NUMERO_MAXIMO} números de participación.")
    pc = _crear_espacio_pc(db, fresca, n)
    marca = _marca(e.get("marca"))
    if supplier is None:
        supplier = proveedor_por_nombre(db, e["proveedor"], _correo(e.get("correo")))
    lease = None
    ahora = _ahora()
    if tipo == "contrato":
        total, al_mes = _total_y_al_mes(e, e["desde"], e["hasta"])
        lease = escribir_contrato(db, pc, supplier, marca, e["desde"], e["hasta"], total,
                                  e.get("notas"), cara_space_id=cara_space.id)
        _anotar_al_mes(db, lease, al_mes)
        termino = Participacion(space_id=pc.id, cara_space_id=cara_space.id, numero=n, estado="contrato",
                                puntos_basicos=e["puntos_basicos"], lease_id=lease.id, version=1,
                                creada_en=ahora, creada_por=actor, actualizada_en=ahora, actualizada_por=actor)
    else:
        termino = Participacion(space_id=pc.id, cara_space_id=cara_space.id, numero=n, estado="reserva",
                                puntos_basicos=e["puntos_basicos"], supplier_id=supplier.id, marca=marca,
                                desde=e["desde"], hasta=e["hasta"], caduca=e["caduca"], notas=e.get("notas"),
                                version=1, creada_en=ahora, creada_por=actor, actualizada_en=ahora,
                                actualizada_por=actor)
    db.add(termino)
    db.flush()
    regla = termino_para_reglas(termino, lease)
    frase = _frase_del_termino(n, e["puntos_basicos"], supplier.name, marca, e["desde"], e["hasta"])
    accion = f"participacion.{tipo}"
    anotar_historial(
        db, tipo="contractual", accion=accion, actor=actor, cara_space_id=cara_space.id,
        participacion_space_id=pc.id, participacion_id=termino.id,
        detalle=(f"Reserva provisional · {frase} · caduca {e['caduca'].isoformat()}" if tipo == "reserva"
                 else f"Contrato · {frase}"),
        antes=None, despues={**_campos_historial(regla, supplier.name), "codigo": pc.code},
    )
    return Hecho(cara=fresca, termino=termino, accion=accion, lease=lease, supplier=supplier, entidad=pc.code,
                 detalle=f"{pc.code} · {reglas.pct(e['puntos_basicos'])} · {supplier.name} · "
                         f"{e['desde'].isoformat()}→{e['hasta'].isoformat()}")


def _termino_o_404(db: Session, participacion_id: int) -> Participacion:
    t = db.get(Participacion, participacion_id)
    if t is None:
        raise _error(404, "sin_participacion", "Esa participación no existe.")
    return t


def _subir_version_termino(db: Session, tid: int, version: int, valores: dict, actor: str) -> None:
    """``UPDATE participaciones SET …, version = version + 1 WHERE id = :id
    AND version = :v``; 0 filas → 409 ``version_vieja``."""
    r = db.execute(
        update(Participacion)
        .where(Participacion.id == tid, Participacion.version == version)
        .values(**valores, version=Participacion.version + 1, actualizada_en=_ahora(), actualizada_por=actor)
        .execution_options(synchronize_session=False)
    )
    if r.rowcount != 1:
        actual = db.query(Participacion.version).filter(Participacion.id == tid).scalar()
        raise _version_vieja_termino(actual)


def _camino_de_termino(db: Session, participacion_id: int, cambio: dict):
    """revisar → geometría → candado → expire_all → revisar. Devuelve la cara,
    los datos frescos, el término fresco y los avisos del borrador."""
    t0 = _termino_o_404(db, participacion_id)
    cara = cara_del_termino(db, t0)
    datos = leer(db, cara.codigo)
    medidas = None if cambio["tipo"] == "cancelar" else medidas_de_capas(cara, datos)
    revisar_alta(db, cara, datos, cambio, medidas)
    _bajo_candado(db, cara)
    t = _termino_o_404(db, participacion_id)
    fresca = cara_del_termino(db, t)
    _misma_cara(cara, fresca)
    datos = leer(db, fresca.codigo)
    if cambio["tipo"] != "cancelar":
        medidas = _medidas_frescas(fresca, datos, medidas)
    avisos = revisar_alta(db, fresca, datos, cambio, medidas)
    return fresca, datos, t, avisos


def _proveedor_de(db: Session, regla: dict) -> Optional[Supplier]:
    return db.get(Supplier, regla["supplier_id"]) if regla.get("supplier_id") is not None else None


def editar(db: Session, participacion_id: int, e: dict, presentes: set, actor: str) -> Hecho:
    """6 · Cambiar una reserva provisional viva (§5.3). ``presentes``: los
    campos que el cuerpo trae (una ``marca`` en null la borra)."""
    cambio = {"tipo": "editar", "id": participacion_id, "version": e["version"]}
    for clave, regla in (("puntos_basicos", "pb"), ("desde", "desde"), ("hasta", "hasta"), ("caduca", "caduca")):
        if clave in presentes and e.get(clave) is not None:
            cambio[regla] = e[clave]
    if "marca" in presentes:
        cambio["marca"] = _marca(e.get("marca"))
    cara, datos, t, avisos = _camino_de_termino(db, participacion_id, cambio)
    antes = next(x for x in datos.por_s[t.space_id] if x["id"] == t.id)
    valores = {}
    if "pb" in cambio:
        valores["puntos_basicos"] = cambio["pb"]
    for k in ("desde", "hasta", "caduca", "marca"):
        if k in cambio:
            valores[k] = cambio[k]
    if "notas" in presentes:
        valores["notas"] = e.get("notas")
    _subir_version_termino(db, t.id, e["version"], valores, actor)
    db.refresh(t)
    despues = termino_para_reglas(t, None)
    proveedor = _proveedor_de(db, antes)
    nombre = proveedor.name if proveedor else None
    anotar_historial(
        db, tipo="contractual", accion="participacion.editada", actor=actor, cara_space_id=t.cara_space_id,
        participacion_space_id=t.space_id, participacion_id=t.id,
        detalle=f"Reserva provisional cambiada · {_frase_del_termino(t.numero, t.puntos_basicos, nombre or '—', t.marca, t.desde, t.hasta)}",
        antes=_campos_historial(antes, nombre), despues=_campos_historial(despues, nombre),
    )
    pc = datos.pcs.get(t.space_id)
    return Hecho(cara=cara, termino=t, accion="participacion.editada", avisos_distribucion=avisos,
                 entidad=pc.code if pc else str(t.space_id),
                 detalle=f"{pc.code if pc else t.space_id} · {reglas.pct(t.puntos_basicos)} · "
                         f"{t.desde.isoformat()}→{t.hasta.isoformat()}")


def confirmar_reserva(db: Session, participacion_id: int, e: dict, presentes: set, actor: str) -> Hecho:
    """7 · Reserva viva → contrato (§5.3), con el MISMO alta de contrato que la
    planilla, sobre el MISMO espacio PC. Proveedor, marca y fechas pasan al
    lease (la única verdad) y sus columnas quedan en NULL; lo que decía la
    reserva queda en el ``antes`` del historial.

    Sin ``valor_mensual`` en el cuerpo, vale el precio acordado al reservar
    desde Vender (``precios_de_reserva``, §2 de ``docs/rediseno/vender-api.md``),
    que se borra al confirmar."""
    valor = e.get("valor_mensual")
    precio = db.get(PrecioDeReserva, participacion_id)
    #: La reserva se cobraba por ventas y el cuerpo no trae otro valor: el
    #: contrato nace cobrando por ventas, con su valor en 0 (decisión del
    #: dueño, 2026-10-20). Un ``valor_mensual`` en el cuerpo lo pasa a fijo.
    por_ventas = valor is None and precio is not None and precio.cobro_modo == "ventas"
    if por_ventas:
        valor = 0.0
    elif valor is None and precio is not None:
        valor = precio.valor
    validar_tipo("contrato", None, valor)
    cambio = {"tipo": "confirmar", "id": participacion_id, "version": e["version"]}
    for clave, regla in (("puntos_basicos", "pb"), ("desde", "desde"), ("hasta", "hasta")):
        if clave in presentes and e.get(clave) is not None:
            cambio[regla] = e[clave]
    cara, datos, t, avisos = _camino_de_termino(db, participacion_id, cambio)
    antes = next(x for x in datos.por_s[t.space_id] if x["id"] == t.id)
    pb = cambio.get("pb", antes["pb"])
    desde, hasta = cambio.get("desde", antes["desde"]), cambio.get("hasta", antes["hasta"])
    supplier = _proveedor_de(db, antes)
    correo = _correo(e.get("correo"))
    if correo and not supplier.email:
        supplier.email = correo  # completa el que falta, nunca pisa (como la planilla)
    pc = datos.pcs[t.space_id]
    notas = e.get("notas") if "notas" in presentes else t.notas
    al_mes = None
    if e.get("valor_mensual") is not None:
        valor, al_mes = _total_y_al_mes(e, desde, hasta)
    lease = escribir_contrato(db, pc, supplier, antes["marca"], desde, hasta, valor, notas,
                              cara_space_id=t.cara_space_id)
    _anotar_al_mes(db, lease, al_mes)
    if precio is not None:
        if por_ventas:
            db.add(CobroPorVenta(lease_id=lease.id, porcentaje=precio.cobro_porcentaje, corte=precio.cobro_corte,
                                 creado_por=actor))
        elif e.get("valor_mensual") is None and precio.modo_precio:
            # Cómo se escribió el precio que se usó: lo dicen los correos.
            db.add(CondicionesDeContrato(lease_id=lease.id, modo_precio=precio.modo_precio,
                                         valor_tecleado=precio.valor_tecleado))
        db.delete(precio)
    _subir_version_termino(db, t.id, e["version"], {
        "estado": "contrato", "lease_id": lease.id, "puntos_basicos": pb, "supplier_id": None, "marca": None,
        "desde": None, "hasta": None, "caduca": None, "notas": None}, actor)
    db.refresh(t)
    despues = termino_para_reglas(t, lease)
    anotar_historial(
        db, tipo="contractual", accion="participacion.confirmada", actor=actor, cara_space_id=t.cara_space_id,
        participacion_space_id=t.space_id, participacion_id=t.id,
        detalle=f"Reserva confirmada como contrato · {_frase_del_termino(t.numero, pb, supplier.name, antes['marca'], desde, hasta)}",
        antes=_campos_historial(antes, supplier.name),
        despues={**_campos_historial(despues, supplier.name), "lease_id": lease.id},
    )
    return Hecho(cara=cara, termino=t, accion="participacion.confirmada", lease=lease, supplier=supplier,
                 avisos_distribucion=avisos, entidad=pc.code,
                 detalle=f"{pc.code} · {reglas.pct(pb)} · {supplier.name} · {desde.isoformat()}→{hasta.isoformat()}")


def cancelar_reserva(db: Session, participacion_id: int, e: dict, actor: str) -> Hecho:
    """8 · Cancelar una reserva provisional (un contrato se cancela por
    ``DELETE /spaces/{id}/leases/{id}``). Toma el candado: una cancelación
    concurrente con la confirmación de la misma reserva se serializa. No
    revalida la distribución: cancelar sólo saca restricciones."""
    cambio = {"tipo": "cancelar", "id": participacion_id, "version": e["version"]}
    cara, datos, t, _ = _camino_de_termino(db, participacion_id, cambio)
    antes = next(x for x in datos.por_s[t.space_id] if x["id"] == t.id)
    cuando = _ahora()
    _subir_version_termino(db, t.id, e["version"], {"estado": "reserva_cancelada", "baja_en": cuando,
                                                     "baja_por": actor}, actor)
    db.refresh(t)
    proveedor = _proveedor_de(db, antes)
    anotar_historial(
        db, tipo="evento", accion="reserva.cancelada", actor=actor, cara_space_id=t.cara_space_id,
        participacion_space_id=t.space_id, participacion_id=t.id,
        detalle=f"Reserva provisional cancelada · participación {t.numero}",
        antes=_campos_historial(antes, proveedor.name if proveedor else None),
        despues={"estado": "reserva_cancelada", "baja_en": cuando},
    )
    pc = datos.pcs.get(t.space_id)
    return Hecho(cara=cara, termino=t, accion="reserva.baja", entidad=pc.code if pc else str(t.space_id),
                 detalle=f"{pc.code if pc else t.space_id} · participación {t.numero}")


def renovar(db: Session, participacion_id: int, e: dict, actor: str) -> Hecho:
    """9 · Un término nuevo de la MISMA participación (mismo espacio PC, mismo
    número, mismas zonas) que sigue al contrato vivo más nuevo (§4.7).
    Proveedor, marca y porcentaje se copian del renovado (I2, I3)."""
    dia = hoy()
    tipo = e["tipo"]
    validar_fechas(tipo, e["desde"], e["hasta"], e.get("caduca"), dia)
    validar_tipo(tipo, e.get("caduca"), e.get("valor_mensual"))
    cambio = {"tipo": "renovar", "renueva_a": participacion_id, "version": e["version"], "tipo_nuevo": tipo,
              "desde": e["desde"], "hasta": e["hasta"], "caduca": e.get("caduca")}
    cara, datos, t, avisos = _camino_de_termino(db, participacion_id, cambio)
    return escribir_renovacion(db, cara, datos, t, e, actor, avisos)


def escribir_renovacion(db: Session, cara: Cara, datos: Datos, t: Participacion, e: dict, actor: str,
                        avisos: Optional[list] = None) -> Hecho:
    """La mitad que ESCRIBE la renovación, con el candado ya tomado y la
    revisión de adentro hecha (``renovar`` y el guardado de Vender)."""
    tipo = e["tipo"]
    renovado = next(x for x in datos.por_s[t.space_id] if x["id"] == t.id)
    _subir_version_termino(db, t.id, e["version"], {}, actor)
    supplier = _proveedor_de(db, renovado)
    correo = _correo(e.get("correo"))
    if correo and supplier is not None and not supplier.email:
        supplier.email = correo
    pc = datos.pcs[t.space_id]
    marca = renovado["marca"]
    ahora = _ahora()
    lease = None
    if tipo == "contrato":
        total, al_mes = _total_y_al_mes(e, e["desde"], e["hasta"])
        lease = escribir_contrato(db, pc, supplier, marca, e["desde"], e["hasta"], total,
                                  e.get("notas"), cara_space_id=t.cara_space_id)
        _anotar_al_mes(db, lease, al_mes)
        nuevo = Participacion(space_id=t.space_id, cara_space_id=t.cara_space_id, numero=t.numero,
                              estado="contrato", puntos_basicos=renovado["pb"], lease_id=lease.id, renueva_a=t.id,
                              version=1, creada_en=ahora, creada_por=actor, actualizada_en=ahora,
                              actualizada_por=actor)
    else:
        nuevo = Participacion(space_id=t.space_id, cara_space_id=t.cara_space_id, numero=t.numero,
                              estado="reserva", puntos_basicos=renovado["pb"], supplier_id=supplier.id, marca=marca,
                              desde=e["desde"], hasta=e["hasta"], caduca=e["caduca"], notas=e.get("notas"),
                              renueva_a=t.id, version=1, creada_en=ahora, creada_por=actor,
                              actualizada_en=ahora, actualizada_por=actor)
    db.add(nuevo)
    db.flush()
    regla = termino_para_reglas(nuevo, lease)
    anotar_historial(
        db, tipo="contractual", accion="participacion.renovada", actor=actor, cara_space_id=t.cara_space_id,
        participacion_space_id=t.space_id, participacion_id=nuevo.id,
        detalle=(f"Renovada como {'contrato' if tipo == 'contrato' else 'reserva provisional'} · "
                 f"{_frase_del_termino(t.numero, renovado['pb'], supplier.name, marca, e['desde'], e['hasta'])}"),
        antes={**_campos_historial(renovado, supplier.name), "termino": t.id},
        despues={**_campos_historial(regla, supplier.name), "renueva_a": t.id},
    )
    return Hecho(cara=cara, termino=nuevo, accion="participacion.renovada", lease=lease, supplier=supplier,
                 avisos_distribucion=avisos or [], entidad=pc.code,
                 detalle=f"{pc.code} · {reglas.pct(renovado['pb'])} · {supplier.name} · "
                         f"{e['desde'].isoformat()}→{e['hasta'].isoformat()}")


# ─── La distribución (§3.7, §3.8, §5.3 10–12) ────────────────────────────────


def zona_out(z: Zona) -> dict:
    return {"id": z.id, "participacion_space_id": z.participacion_space_id,
            "vertices": json.loads(z.vertices_json), "orden": z.orden}


#: fase 2 · I1: lo que se le dice a un tipo de mueble sin receta de superficie
#: (isla, impulsador, batea…): «Cómo se vende» no le ofrece «por participación»,
#: así que mandarlo a elegirlo ahí era un callejón. La misma frase dice
#: ``layout_lookup.motivo_para_no_vender_parte`` (frente F).
TIPO_SIN_PARTICIPACION = "Este tipo de mueble todavía no se vende por participación."


def _exigir_distribuible(cara: Cara) -> None:
    """§3.8 paso 0b: sin superficie no se dibuja (no se guarda nada)."""
    if not cara.por_participacion:
        if cara.fixture is not None and not tiene_superficie(str(cara.fixture.get("type") or "")):
            raise _error(409, "cara_no_distribuible", TIPO_SIN_PARTICIPACION)
        raise _error(409, "cara_no_distribuible",
                     f"«{cara.corto}» no se vende por participación: elegí «por participación» en «Cómo se vende» "
                     "del Editor 3D.")
    if cara.superficie is None:
        raise _error(409, "cara_no_distribuible", f"«{cara.corto}» no tiene superficie para dibujar zonas.")


def _exigir_topes(zonas: list[dict]) -> None:
    """§3.8 paso 0: fuera de los topes, 422 y no se guarda nada (contados
    crudos: 60 zonas, 240 puntos en total, 24 por zona)."""
    if not geo.dentro_de_los_topes(zonas):
        raise _error(422, "distribucion_malformada",
                     f"La distribución trae más de {geo.MAX_ZONAS_POR_CARA} zonas, más de "
                     f"{geo.MAX_VERTICES_POR_CARA} puntos o una zona de más de {geo.MAX_VERTICES} puntos.")


def _validar_zonas(datos: Datos, zonas: list[dict]) -> None:
    """Los 422 que no guardan nada, zona por zona (§3.7 pasos 1 y 2): la
    estructura y que sea de una participación de ESTA cara. Un número que no
    cuantiza a un valor finito (más de ≈ 1e302) también es estructura rota:
    guardarlo dejaría un ``Infinity`` que el JSON de la respuesta no puede
    llevar."""
    propias = set(datos.por_s)
    for k, z in enumerate(zonas):
        vertices, codigo = geo.validar_zona(z["vertices"], 1.0, 1.0)
        if codigo == "ZONA_MALFORMADA" or any(not math.isfinite(x) for q in (vertices or []) for x in q):
            raise _error(422, "zona_malformada",
                         f"La zona {k + 1} no es una lista de puntos: borrala y dibujala de nuevo.", zona=k)
        if z["participacion_space_id"] not in propias:
            raise _error(422, "espacio_ajeno", f"La zona {k + 1} no es de ninguna participación de esta cara.",
                         zona=k)


def subir_version_distribucion(db: Session, dist_id: int, version_leida: int, actor: str) -> None:
    """§5.4: la versión optimista de la distribución."""
    r = db.execute(
        update(Distribucion)
        .where(Distribucion.id == dist_id, Distribucion.version == version_leida)
        .values(version=Distribucion.version + 1, actualizada_en=_ahora(), actualizada_por=actor)
        .execution_options(synchronize_session=False)
    )
    if r.rowcount != 1:
        actual = db.query(Distribucion.version).filter(Distribucion.id == dist_id).scalar()
        raise _version_vieja_distribucion(actual)


def _distribucion_para_escribir(db: Session, cara: Cara, datos: Datos, version: int, actor: str) -> Distribucion:
    """La distribución de la cara con la versión ya subida. La primera
    (``version == 0``) se inserta con 1; la UNIQUE de la cara convierte la
    carrera en ``IntegrityError`` → 409 ``version_vieja``."""
    if version == 0:
        if datos.distribucion is not None:
            raise _version_vieja_distribucion(datos.distribucion.version)
        cara_space = _fila_de_cara(db, cara, datos)
        ahora = _ahora()
        dist = Distribucion(cara_space_id=cara_space.id, fixture_id=cara.fixture_id, version=1,
                            actualizada_en=ahora, actualizada_por=actor)
        db.add(dist)
        try:
            db.flush()
        except IntegrityError:
            db.rollback()
            actual = (db.query(Distribucion.version).filter(Distribucion.cara_space_id == cara_space.id).scalar()
                      if cara_space.id is not None else None)
            raise _version_vieja_distribucion(actual)
        return dist
    if datos.distribucion is None:
        raise _version_vieja_distribucion(0)
    subir_version_distribucion(db, datos.distribucion.id, version, actor)
    db.refresh(datos.distribucion)
    return datos.distribucion


def _cerrar_si_otro_mueble(db: Session, dist: Distribucion, cara: Cara, datos: Datos, actor: str) -> bool:
    """§2.5: la distribución se dibujó para OTRO mueble que tomó este código.
    La primera escritura la cierra: sus zonas pasan al historial con sus
    vértices (evento ``distribucion.otro_mueble``) y empieza de cero para el
    mueble de ahora."""
    if dist.fixture_id == cara.fixture_id:
        return False
    antes = {"fixture_id": dist.fixture_id, "firma_confirmada": dist.firma_confirmada,
             "confirmada": [zona_out(z) for z in datos.capas.get("confirmada", [])],
             "borrador": [zona_out(z) for z in datos.capas.get("borrador", [])]}
    db.query(Zona).filter(Zona.distribucion_id == dist.id).delete(synchronize_session=False)
    for capa in datos.capas.values():
        capa.clear()
    dist.fixture_id = cara.fixture_id
    dist.confirmada_en = dist.confirmada_por = dist.firma_confirmada = None
    dist.borrador_en = dist.borrador_por = None
    anotar_historial(db, tipo="evento", accion="distribucion.otro_mueble", actor=actor,
                     cara_space_id=dist.cara_space_id, distribucion_id=dist.id,
                     detalle=f"Otro mueble tomó el código «{cara.corto}»: la distribución anterior se cerró.",
                     antes=antes, despues={"fixture_id": cara.fixture_id})
    return True


def _reemplazar_capa(db: Session, dist: Distribucion, capa: str, zonas: list[dict], medidas: dict,
                     actor: str) -> None:
    """Borra la capa y la vuelve a escribir: los vértices limpios
    (cuantizados, sin repetidos, antihorarios) de cada zona válida; los de una
    zona con error, cuantizados (un borrador guarda lo que se dibujó)."""
    db.query(Zona).filter(Zona.distribucion_id == dist.id, Zona.capa == capa).delete(synchronize_session=False)
    ahora = _ahora()
    for k, z in enumerate(zonas):
        v = medidas["validaciones"][k]["vertices"]
        db.add(Zona(distribucion_id=dist.id, capa=capa, participacion_space_id=z["participacion_space_id"],
                    vertices_json=json.dumps(v, separators=(",", ":")), orden=k, creada_en=ahora, creada_por=actor))


def _resumen_de_capa(zonas: list[dict], medidas: Optional[dict], datos: Datos) -> dict:
    """Lo que el historial guarda de un borrador: zonas y lo dibujado por
    participación (por número), sin vértices."""
    numeros = {s: ts[0]["numero"] for s, ts in datos.por_s.items() if ts}
    cuenta: dict[str, int] = {}
    for z in zonas:
        n = str(numeros.get(z["participacion_space_id"], z["participacion_space_id"]))
        cuenta[n] = cuenta.get(n, 0) + 1
    dibujado = {}
    if medidas is not None:
        dibujado = {str(numeros.get(s, s)): pb for s, pb in medidas["dibujado_pb"].items()}
    return {"zonas": cuenta, "dibujado_pb": dibujado}


@dataclass
class HechoDistribucion:
    cara: Cara
    distribucion: Optional[Distribucion]
    accion: Optional[str]
    detalle: str
    juicio: Optional[dict] = None
    invalida: bool = False


def _origen_de_copia(db: Session, origen: dict, cara: Cara) -> dict:
    """fase 2 · I1 · «Copiar zonas de otra cara»: de dónde vienen las zonas de
    este borrador, como lo guarda el historial. Lo declara el navegador —es
    historia de la dueña, no una regla—: las zonas se validan como las de
    cualquier borrador, y una de otra cara sigue siendo ``espacio_ajeno``.

    La cara de origen se resuelve contra el plano como ``GET /cara``; si ya no
    resuelve (el mueble se borró, una B que no existe) se arma el código con la
    sede y queda ``en_el_plano: False``: el origen NUNCA frena el guardado,
    salvo que sea la MISMA cara (422 ``copia_de_la_misma_cara``, antes de
    escribir nada). Sin montos ni vértices."""
    sede = normalizar(origen.get("sede"))
    espacio = normalizar(origen.get("espacio"))
    try:
        codigo, en_el_plano = resolver_cara(db, sede, espacio).codigo, True
    except HTTPException:
        codigo, en_el_plano = codigo_cara(sede, espacio), False
    if codigo == cara.codigo:
        raise _error(422, "copia_de_la_misma_cara", "Elegí otra cara para copiar: ésta es la misma.")
    fila = (db.query(Distribucion.id).join(Space, Space.id == Distribucion.cara_space_id)
            .filter(Space.code == codigo).first())
    return {
        "sede": sede, "codigo_cara": codigo, "capa": origen.get("capa"), "version": origen.get("version"),
        "distribucion_id": fila[0] if fila is not None else None, "espejo": bool(origen.get("espejo")),
        "mapa": {str(p["origen"]): p.get("destino") for p in (origen.get("mapa") or ())},
        "sin_copiar": int(origen.get("sin_copiar") or 0), "en_el_plano": en_el_plano,
    }


def _detalle_de_copia(origen: dict, zonas: list[dict], datos: Datos) -> str:
    """«Copia de NAVE · GON-01 · cara A (confirmada): 5 zonas de 3
    participaciones; 2 sin copiar». Cuenta las zonas de las participaciones de
    esta cara que recibieron algo (las del ``mapa``): las que no recibieron
    nada se quedan como estaban y no son de la copia."""
    sede = origen["sede"]
    p = partir_codigo(sin_prefijo_de_sede(origen["codigo_cara"], sede))
    de = f"{sede} · {p.base} · cara {p.cara}" if sede else f"{p.base} · cara {p.cara}"
    destinos = {n for n in origen["mapa"].values() if n is not None}
    numeros = {s: ts[0]["numero"] for s, ts in datos.por_s.items() if ts}
    copiadas = [z for z in zonas if numeros.get(z["participacion_space_id"]) in destinos]
    n = len(copiadas)
    m = len({numeros[z["participacion_space_id"]] for z in copiadas})
    texto = (f"Copia de {de} ({origen['capa']}): {n} zona{'' if n == 1 else 's'} de {m} "
             f"participaci{'ón' if m == 1 else 'ones'}")
    if origen["sin_copiar"]:
        texto += f"; {origen['sin_copiar']} sin copiar"
    return texto


def guardar_borrador(db: Session, e: dict, actor: str) -> HechoDistribucion:
    """10 · Guardar el borrador (con errores marcados): sin candado, con
    versión. Reemplaza toda la capa ``borrador``. ``automatico`` (el
    autoguardado) no escribe historial ni bitácora.

    fase 2 · I1: con ``origen`` las zonas vienen de «Copiar zonas de otra
    cara»: se anota ``distribucion.copiada`` (aunque venga ``automatico``: una
    copia siempre queda en el historial) con de dónde vinieron. Nada más
    cambia: ni candado (no cambia la capacidad), ni términos, ni la versión
    optimista. La cara de origen no se anota (la copia no la cambia)."""
    cara = resolver_cara(db, e["sede"], e["espacio"])
    zonas = e["zonas"]
    _exigir_topes(zonas)
    _exigir_distribuible(cara)
    origen = _origen_de_copia(db, e["origen"], cara) if e.get("origen") else None
    automatico = bool(e.get("automatico")) and origen is None
    datos = leer(db, cara.codigo)
    _validar_zonas(datos, zonas)
    medidas = medir_capa(zonas, cara.superficie)
    anterior = None
    if not automatico and datos.distribucion is not None and datos.distribucion.borrador_en is not None \
            and not _otro_mueble(datos, cara):
        crudas = _crudas(datos.capas.get("borrador", []))
        anterior = _resumen_de_capa(crudas, medir_capa(crudas, cara.superficie) if crudas else None, datos)
    dist = _distribucion_para_escribir(db, cara, datos, e["version"], actor)
    _cerrar_si_otro_mueble(db, dist, cara, datos, actor)
    _reemplazar_capa(db, dist, "borrador", zonas, medidas, actor)
    dist.borrador_en = _ahora()
    dist.borrador_por = actor
    juicio = juzgar_capa(medidas, datos.por_s, hoy(), confirmada=False, firma_cambio=False,
                         orientacion=cara.superficie["orientacion"])
    if automatico:
        return HechoDistribucion(cara, dist, None, "", juicio)
    if origen is not None:
        anotar_historial(db, tipo="geometria", accion="distribucion.copiada", actor=actor,
                         cara_space_id=dist.cara_space_id, distribucion_id=dist.id,
                         detalle=_detalle_de_copia(origen, zonas, datos),
                         antes=anterior, despues={**_resumen_de_capa(zonas, medidas, datos), "origen": origen})
        return HechoDistribucion(cara, dist, "distribucion.copiada",
                                 f"{cara.codigo} · {len(zonas)} zona{'' if len(zonas) == 1 else 's'} · "
                                 f"copia de {origen['codigo_cara']}", juicio)
    anotar_historial(db, tipo="geometria", accion="distribucion.borrador", actor=actor,
                     cara_space_id=dist.cara_space_id, distribucion_id=dist.id,
                     detalle=f"Borrador guardado: {len(zonas)} zona{'' if len(zonas) == 1 else 's'}",
                     antes=anterior, despues=_resumen_de_capa(zonas, medidas, datos))
    return HechoDistribucion(cara, dist, "distribucion.borrador",
                             f"{cara.codigo} · {len(zonas)} zona{'' if len(zonas) == 1 else 's'}", juicio)


def confirmar_distribucion(db: Session, e: dict, actor: str) -> HechoDistribucion:
    """11 · Validar estricto y confirmar (§3.8). La geometría (las zonas del
    cuerpo y la capa confirmada de antes) se mide ANTES del candado; adentro
    se re-lee la firma del mueble (cambió: 409 ``plano_cambio``, nada se
    escribe) y se juzga con los términos frescos.

    Con algún error: las zonas quedan como borrador y el router hace commit y
    contesta 409 ``distribucion_invalida`` (``invalida``). Sin errores: la capa
    confirmada pasa a ser EXACTAMENTE estas zonas (las de historia de la
    anterior salen de la capa y quedan en el ``antes`` del historial, con sus
    vértices), se borra el borrador y se guardan la firma y el mueble."""
    cara = resolver_cara(db, e["sede"], e["espacio"])
    zonas = e["zonas"]
    _exigir_topes(zonas)
    _exigir_distribuible(cara)
    datos = leer(db, cara.codigo)
    _validar_zonas(datos, zonas)
    medidas = medir_capa(zonas, cara.superficie)
    vieja = None if _otro_mueble(datos, cara) else _crudas(datos.capas.get("confirmada", []))
    medidas_vieja = medir_capa(vieja, cara.superficie) if vieja else None
    version_vista = datos.version

    _bajo_candado(db, cara)
    try:
        fresca = resolver_cara(db, e["sede"], e["espacio"])
    except HTTPException:
        fresca = None
    if fresca is None or fresca.codigo != cara.codigo or fresca.firma != cara.firma or not fresca.distribuible \
            or fresca.fixture_id != cara.fixture_id:
        raise _error(409, "plano_cambio", "El mueble cambió mientras confirmabas: recargá la cara y volvé a confirmar.")
    datos = leer(db, fresca.codigo)
    juicio = juzgar_capa(medidas, datos.por_s, hoy(), confirmada=False, firma_cambio=False,
                         orientacion=fresca.superficie["orientacion"])
    if datos.version != version_vista:
        # Otra sesión escribió la distribución en el medio: la versión optimista
        # lo frena abajo; la capa vieja del historial se vuelve a medir.
        vieja = None if _otro_mueble(datos, fresca) else _crudas(datos.capas.get("confirmada", []))
        medidas_vieja = medir_capa(vieja, fresca.superficie) if vieja else None
    dist = _distribucion_para_escribir(db, fresca, datos, e["version"], actor)
    _cerrar_si_otro_mueble(db, dist, fresca, datos, actor)
    ahora = _ahora()
    n = len(zonas)
    if juicio["errores"]:
        _reemplazar_capa(db, dist, "borrador", zonas, medidas, actor)
        dist.borrador_en = ahora
        dist.borrador_por = actor
        problemas = len(juicio["errores"])
        anotar_historial(db, tipo="geometria", accion="distribucion.borrador", actor=actor,
                         cara_space_id=dist.cara_space_id, distribucion_id=dist.id,
                         detalle=(f"Confirmación rechazada ({problemas} problema{'' if problemas == 1 else 's'}): "
                                  f"se guardó como borrador con {n} zona{'' if n == 1 else 's'}"),
                         antes=None, despues=_resumen_de_capa(zonas, medidas, datos))
        return HechoDistribucion(fresca, dist, "distribucion.borrador",
                                 f"{fresca.codigo} · {n} zona{'' if n == 1 else 's'} · no confirmada", juicio,
                                 invalida=True)
    antes_zonas = [zona_out(z) for z in datos.capas.get("confirmada", [])]
    db.query(Zona).filter(Zona.distribucion_id == dist.id).delete(synchronize_session=False)
    _reemplazar_capa(db, dist, "confirmada", zonas, medidas, actor)
    db.flush()
    nuevas = (db.query(Zona).filter(Zona.distribucion_id == dist.id, Zona.capa == "confirmada")
              .order_by(Zona.orden, Zona.id).all())
    dist.borrador_en = dist.borrador_por = None
    dist.confirmada_en = ahora
    dist.confirmada_por = actor
    dist.firma_confirmada = fresca.firma
    dist.fixture_id = fresca.fixture_id
    participaciones = len({z["participacion_space_id"] for z in zonas})
    anotar_historial(
        db, tipo="geometria", accion="distribucion.confirmada", actor=actor, cara_space_id=dist.cara_space_id,
        distribucion_id=dist.id,
        detalle=(f"Confirmada: {n} zona{'' if n == 1 else 's'} de {participaciones} "
                 f"participaci{'ón' if participaciones == 1 else 'ones'}"),
        antes={"zonas": antes_zonas,
               "cuentas": {str(s): pb for s, pb in (medidas_vieja or {"dibujado_pb": {}})["dibujado_pb"].items()}},
        despues={"zonas": [zona_out(z) for z in nuevas],
                 "cuentas": {str(s): pb for s, pb in medidas["dibujado_pb"].items()}},
    )
    return HechoDistribucion(fresca, dist, "distribucion.confirmada",
                             f"{fresca.codigo} · {n} zona{'' if n == 1 else 's'}", juicio)


def descartar_borrador(db: Session, e: dict, actor: str) -> HechoDistribucion:
    """12 · Borrar el borrador (la confirmada queda). Sin candado, con versión.

    fase 2 · I1 (E6): sin borrador no hay nada que descartar. Con la versión
    al día no se escribe nada —ni sube la versión (le daría a otra sesión un
    ``version_vieja`` de balde) ni se anota «Borrador descartado» en el
    historial, que es para siempre—; con otra versión, 409 como siempre. La
    distribución de OTRO mueble sigue el camino de siempre (se cierra)."""
    cara = resolver_cara(db, e["sede"], e["espacio"])
    datos = leer(db, cara.codigo)
    if datos.distribucion is None and e["version"] == 0:
        return HechoDistribucion(cara, None, None, "")
    if datos.distribucion is not None and datos.distribucion.borrador_en is None and not _otro_mueble(datos, cara):
        if e["version"] != datos.distribucion.version:
            raise _version_vieja_distribucion(datos.distribucion.version)
        return HechoDistribucion(cara, datos.distribucion, None, "")
    anterior = None
    if datos.distribucion is not None and datos.distribucion.borrador_en is not None and not _otro_mueble(datos, cara):
        crudas = _crudas(datos.capas.get("borrador", []))
        anterior = _resumen_de_capa(crudas, medir_capa(crudas, cara.superficie)
                                    if crudas and cara.superficie else None, datos)
    dist = _distribucion_para_escribir(db, cara, datos, e["version"], actor)
    _cerrar_si_otro_mueble(db, dist, cara, datos, actor)
    db.query(Zona).filter(Zona.distribucion_id == dist.id, Zona.capa == "borrador").delete(synchronize_session=False)
    dist.borrador_en = dist.borrador_por = None
    anotar_historial(db, tipo="geometria", accion="distribucion.descartada", actor=actor,
                     cara_space_id=dist.cara_space_id, distribucion_id=dist.id,
                     detalle="Borrador descartado", antes=anterior, despues=None)
    return HechoDistribucion(cara, dist, "distribucion.descartada", f"{cara.codigo} · borrador descartado")


# ─── Lecturas ────────────────────────────────────────────────────────────────


def termino_out(t: Participacion, regla: dict, pc: Optional[Space], lease: Optional[SpaceLease],
                proveedores: dict, dia: date, precio: Optional[PrecioDeReserva] = None) -> dict:
    """``TerminoOut`` (§5.3). Lleva el valor del contrato y, de una reserva
    hecha desde Vender, su precio acordado (``valor_acordado``,
    ``precios_de_reserva``): sólo lo leen rutas de administrador."""
    sid = regla.get("supplier_id")
    prov = proveedores.get(sid) if sid is not None else None
    return {
        "id": t.id, "space_id": t.space_id, "codigo": pc.code if pc else None, "numero": t.numero,
        "cara": partir_codigo(pc.code).cara if pc else None,
        "estado": t.estado, "estado_visible": reglas.estado_visible(regla, dia),
        "puntos_basicos": t.puntos_basicos, "porcentaje": reglas.pct(t.puntos_basicos),
        "proveedor": {"id": prov.id, "nombre": prov.name} if prov else None,
        "marca": regla.get("marca"), "desde": regla.get("desde"), "hasta": regla.get("hasta"),
        "caduca": regla.get("caduca"),
        # `valor_mensual` es, a pesar del nombre, el TOTAL del contrato (lo que
        # guarda `monthly_rent`); lo leen así el formulario y la ficha de la
        # cara. Se queda por compatibilidad y al lado van los dos con su nombre
        # (rediseño UX, 2026-10-26): `valor_total` y `valor_al_mes` (el total
        # repartido en sus meses, `services/meses.py`).
        "lease_id": t.lease_id, "valor_mensual": float(lease.monthly_rent) if lease is not None else None,
        "valor_total": float(lease.monthly_rent) if lease is not None else None,
        "valor_al_mes": (al_mes_de(float(lease.monthly_rent), lease.start_date, lease.end_date)
                         if lease is not None and lease.start_date and lease.end_date else None),
        "valor_acordado": float(precio.valor) if precio is not None and precio.valor is not None else None,
        # Una reserva que se cobra por ventas: el porcentaje y el corte acordados.
        "cobro_acordado": ({"modo": "ventas", "porcentaje": precio.cobro_porcentaje, "corte": precio.cobro_corte}
                           if precio is not None and precio.cobro_modo == "ventas" else None),
        "renueva_a": t.renueva_a,
        "notas": (lease.notes if lease is not None else None) if t.estado == "contrato" else t.notas,
        "baja_en": _iso(t.baja_en), "baja_fecha": regla.get("baja_fecha"),
        "version": t.version, "creada_en": _iso(t.creada_en), "creada_por": t.creada_por,
    }


def _proveedores(db: Session, por_s: dict) -> dict:
    ids = {t["supplier_id"] for ts in por_s.values() for t in ts if t.get("supplier_id") is not None}
    return {s.id: s for s in db.query(Supplier).filter(Supplier.id.in_(ids)).all()} if ids else {}


def _orden_nuevo_primero(t: dict):
    return (t.get("desde") or date.min, t["id"])


def terminos_out(db: Session, datos: Datos, dia: date) -> dict[int, list[dict]]:
    """Los ``TerminoOut`` por participación, del más nuevo al más viejo."""
    proveedores = _proveedores(db, datos.por_s)
    filas = {t.id: t for t in datos.terminos}
    ids = [t.id for t in datos.terminos]
    precios = ({p.participacion_id: p for p in
                db.query(PrecioDeReserva).filter(PrecioDeReserva.participacion_id.in_(ids)).all()} if ids else {})
    fuera = {}
    for s, ts in datos.por_s.items():
        fuera[s] = [termino_out(filas[r["id"]], r, datos.pcs.get(s), datos.leases.get(filas[r["id"]].lease_id),
                                proveedores, dia, precios.get(r["id"]))
                    for r in sorted(ts, key=_orden_nuevo_primero, reverse=True)]
    return fuera


def _sin_juicio() -> dict:
    return {"errores": [], "avisos": [], "cuentas": {}}


def _revision_mostrada(cara: Cara, datos: Datos, dia: date) -> tuple[str, list, dict, bool, Optional[dict]]:
    """La capa que se muestra (el borrador si hay; si no, la confirmada), su
    juicio y si la confirmada quedó para revisar. Devuelve ``(capa, zonas,
    juicio, para_revisar, medidas)``."""
    dist = datos.distribucion
    otro = _otro_mueble(datos, cara)
    capa = "borrador" if (dist is not None and dist.borrador_en is not None and not otro) else "confirmada"
    zonas = [] if (dist is None or otro) else datos.capas.get(capa, [])
    para_revisar = (not otro and dist is not None and reglas.para_revisar(
        {"confirmada_en": dist.confirmada_en, "firma_confirmada": dist.firma_confirmada}, cara.firma))
    if not cara.distribuible:
        return capa, zonas, _sin_juicio(), para_revisar, None
    medidas = medir_capa(_crudas(zonas), cara.superficie)
    juicio = juzgar_capa(medidas, datos.por_s, dia, confirmada=(capa == "confirmada"), firma_cambio=para_revisar,
                         orientacion=cara.superficie["orientacion"])
    return capa, zonas, juicio, para_revisar, medidas


def estado_de_distribucion(cara: Cara, datos: Datos) -> str:
    dist = datos.distribucion
    d = None if dist is None else {"fixture_id": dist.fixture_id, "confirmada_en": dist.confirmada_en,
                                   "firma_confirmada": dist.firma_confirmada, "borrador_en": dist.borrador_en}
    return reglas.estado_distribucion(cara.distribuible, cara.fixture_id, d, cara.firma)


def _cuenta(juicio: dict, s: int, ts: list, dia: date) -> dict:
    cu = juicio["cuentas"].get(s)
    if cu is not None:
        return cu
    viva = reglas.rige(ts, dia)
    c, _ = reglas.contratado_pb(ts, dia)
    return {"numero": ts[0]["numero"] if ts else None, "viva": viva, "contratado": c, "dibujado": 0,
            "pendiente": c if viva else 0, "exceso": 0}


def _intervalos_out(datos: Datos, dia: date) -> list[dict]:
    """Los términos que cuentan desde hoy (contratos activos y reservas que se
    sostienen), con su tipo y su número: sólo para la dueña."""
    fuera = []
    for t in datos.todos:
        L = t.get("lease")
        if t["estado"] == "contrato" and L and L["is_active"] and L["end_date"] >= dia:
            fuera.append({"desde": L["start_date"], "hasta": L["end_date"], "pb": t["pb"], "tipo": "contrato",
                          "numero": t["numero"]})
        elif t["estado"] == "reserva" and t.get("caduca") is not None and t["caduca"] >= dia and t["hasta"] >= dia:
            fuera.append({"desde": t["desde"], "hasta": t["hasta"], "pb": t["pb"], "tipo": "reserva",
                          "numero": t["numero"]})
    fuera.sort(key=lambda x: (x["desde"], x["hasta"], x["numero"]))
    return fuera


def capacidad(db: Session, cara: Cara, datos: Datos, desde: date, hasta: date, dia: date) -> dict:
    # Lo físico va hasta el final, como ``intervalos`` (que trae todo lo vivo):
    # el formulario de Distribución hace su vista previa de la capacidad con
    # este bloque (§9.3), y un término que pasa del período mostrado no puede
    # «entrar» en la pantalla y chocar acá con una venta entera que empieza
    # después. El pico y lo disponible siguen siendo los del período (``pico``
    # recorta a [desde, hasta]).
    fis = fisicos_de(db, cara, min(desde, dia), _SIN_FIN)
    I = reglas.intervalos_que_cuentan(datos.todos, fis, dia)
    a = max(desde, dia)
    if a <= hasta:
        p, dia_pico = reglas.pico(I, a, hasta)
    else:
        p, dia_pico = 0, None
    return {
        "hoy_pb": reglas.comprometido(I, dia),
        "disponible_hoy_pb": reglas.disponible(I, dia, dia, dia),
        "periodo": {"desde": desde, "hasta": hasta, "pico_pb": p, "dia_pico": dia_pico,
                    "disponible_pb": reglas.disponible(I, desde, hasta, dia)},
        "intervalos": _intervalos_out(datos, dia),
        "fisicos": [{k: f[k] for k in ("codigo", "desde", "hasta", "huerfano")} for f in fis],
    }


def periodo(desde: Optional[date], hasta: Optional[date], dia: date) -> tuple[date, date]:
    desde = desde or dia
    hasta = hasta or (dia + timedelta(days=DIAS_DEL_PERIODO))
    if desde > hasta:
        raise _error(422, "fechas", "La fecha de inicio no puede ser posterior a la de fin")
    return desde, hasta


def bloque_de_cara(db: Session, cara: Cara, desde: Optional[date] = None, hasta: Optional[date] = None,
                   datos: Optional[Datos] = None) -> dict:
    """1 · Todo lo de una cara (§5.3): superficie, firma, distribución (las dos
    capas), participaciones con sus términos, capacidad y revisión de la capa
    que se muestra. Es también el bloque que devuelven los caminos que
    escriben. Sólo para administradores (lleva valores)."""
    dia = hoy()
    desde, hasta = periodo(desde, hasta, dia)
    datos = datos or leer(db, cara.codigo)
    dist = datos.distribucion
    capa, _zonas, juicio, para_revisar, _medidas = _revision_mostrada(cara, datos, dia)
    otro = _otro_mueble(datos, cara)
    distribucion = None
    if dist is not None:
        borrador = None
        if dist.borrador_en is not None and not otro:
            borrador = [zona_out(z) for z in datos.capas.get("borrador", [])]
        distribucion = {
            "id": dist.id, "version": dist.version, "estado": estado_de_distribucion(cara, datos),
            "confirmada_en": None if otro else _iso(dist.confirmada_en),
            "confirmada_por": None if otro else dist.confirmada_por,
            "para_revisar": para_revisar,
            "borrador_en": None if otro else _iso(dist.borrador_en),
            "borrador_por": None if otro else dist.borrador_por,
            "confirmada": [] if otro else [zona_out(z) for z in datos.capas.get("confirmada", [])],
            "borrador": borrador,
            "otro_mueble": otro,
        }
    outs = terminos_out(db, datos, dia)
    participaciones = []
    for s, ts in datos.por_s.items():
        cu = _cuenta(juicio, s, ts, dia)
        pc = datos.pcs.get(s)
        participaciones.append({
            "space_id": s, "codigo": pc.code if pc else None, "numero": ts[0]["numero"], "viva": cu["viva"],
            "contratado_pb": cu["contratado"], "dibujado_pb": cu["dibujado"], "pendiente_pb": cu["pendiente"],
            "terminos": outs[s],
        })
    participaciones.sort(key=lambda x: x["numero"])
    f = cara.fixture or {}
    return {
        "sede": cara.sede, "hoy": dia, "codigo_cara": cara.codigo, "cara": cara.letra,
        "fixture": ({"id": cara.fixture_id, "code": f.get("code"), "label": f.get("label"), "type": f.get("type"),
                     "caras": caras_de(f)} if cara.fixture is not None else None),
        "por_participacion": cara.por_participacion, "comercializable": cara.comercializable,
        "superficie": cara.superficie, "firma": cara.firma,
        "distribucion": distribucion,
        "participaciones": participaciones,
        "capacidad": capacidad(db, cara, datos, desde, hasta, dia),
        "revision": {"capa": capa, "errores": juicio["errores"], "avisos": juicio["avisos"]},
    }


def _caras_del_plano(db: Session, sede: str, plano: Optional[PlanoIndexado] = None) -> list[Cara]:
    """Las caras por participación del plano actual de la sede, en el orden
    del plano."""
    s = normalizar(sede)
    plano = plano or PlanoIndexado(db)
    caras = []
    for f in plano.de_sede(s):
        if not por_participacion(f) or not normalizar(f.get("code")):
            continue
        for letra in (("A", "B") if caras_de(f) == 2 else ("A",)):
            caras.append(_armar_cara(s, f, letra))
    return caras


def ocupacion(db: Session, sede: str) -> dict:
    """3 · La ocupación ANÓNIMA de las caras por participación del plano
    (§4.8): intervalos ``{desde, hasta, pb}`` que terminan hoy o después
    (contratos activos y reservas que se sostienen, mezclados) y lo que ocupa
    la cara entera. Sin nombres, montos ni números: la lee el trabajador."""
    dia = hoy()
    s = normalizar(sede)
    fuera = {}
    for cara in _caras_del_plano(db, s):
        datos = leer(db, cara.codigo)
        intervalos = sorted(({"desde": i["desde"], "hasta": i["hasta"], "pb": i["pb"]}
                             for i in _intervalos_out(datos, dia)),
                            key=lambda x: (x["desde"], x["hasta"], x["pb"]))
        fisicos = sorted(({"desde": f["desde"], "hasta": f["hasta"]}
                          for f in fisicos_de(db, cara, dia, _SIN_FIN) if f["hasta"] >= dia),
                         key=lambda x: (x["desde"], x["hasta"]))
        fuera[cara.codigo] = {"intervalos": intervalos, "fisicos": fisicos}
    return {"sede": s, "hoy": dia, "caras": fuera}


def _rige_ese_dia(ts: list, dia_informe: date, dia: date) -> tuple[Optional[dict], bool]:
    """El término de la participación que rige ese día, o el próximo vivo si
    ese día no rige ninguno (§5.3 2). ``(término, cuenta_el_dia)``."""
    for t in sorted(ts, key=_orden_nuevo_primero, reverse=True):
        if reglas.cuenta_el_dia(t, dia_informe, dia):
            return t, True
    vivos = sorted((t for t in ts if reglas.vivo(t, dia) and t["hasta"] is not None and t["hasta"] >= dia_informe),
                   key=lambda t: (t["desde"], t["id"]))
    return (vivos[0], False) if vivos else (None, False)


def resumen(db: Session, sede: str, dia: Optional[date] = None, desde: Optional[date] = None,
            hasta: Optional[date] = None, proveedor_id: Optional[int] = None, espacio: Optional[str] = None) -> dict:
    """2 · El informe por sede / mueble / proveedor / día y período (D18). Los
    totales son de UN día (dos participaciones con fechas que no se cruzan
    pueden ocupar la misma región: sumarlas daría más de 100 %) y la capacidad,
    del período. Sin montos (D10)."""
    hoy_ = hoy()
    s = normalizar(sede)
    dia_informe = dia or hoy_
    desde, hasta = periodo(desde, hasta, hoy_)
    plano = PlanoIndexado(db)
    caras = _caras_del_plano(db, s, plano)
    if espacio:
        pedida = resolver_cara(db, s, espacio, plano)
        solo_b = partir_codigo(normalizar(espacio)).cara == "B"
        base = partir_codigo(pedida.codigo).base
        caras = [c for c in caras if (c.codigo == pedida.codigo if solo_b else partir_codigo(c.codigo).base == base)]
    filas = []
    por_proveedor: dict[int, dict] = {}
    totales = {"caras_por_participacion": 0, "sin_distribuir": 0, "borradores": 0, "para_revisar": 0,
               "con_errores": 0, "reservas_por_caducar": 0, "sin_mueble": 0, "huerfanos": 0}
    # Los contratos de participación sin término (§3.2), por lease: con su
    # código y sus fechas, para que «Para revisar» los nombre.
    huerfanos: dict[int, dict] = {}
    for cara in caras:
        datos = leer(db, cara.codigo)
        proveedores = _proveedores(db, datos.por_s)
        fis = fisicos_de(db, cara, min(desde, dia_informe, hoy_), max(hasta, dia_informe, hoy_))
        I = reglas.intervalos_que_cuentan(datos.todos, fis, hoy_)
        if dia_informe >= hoy_:
            comprometido_dia = reglas.comprometido(I, dia_informe)
        else:  # el pasado: lo que contó ese día (§3.3), y lo entero que lo cubría
            comprometido_dia = 0
            for t in datos.todos:
                if reglas.cuenta_el_dia(t, dia_informe, hoy_):
                    comprometido_dia += t["pb"]
            if any(f["desde"] <= dia_informe <= f["hasta"] for f in fis):
                comprometido_dia += reglas.CARA_ENTERA_PB
        a = max(desde, hoy_)
        p, dia_pico = reglas.pico(I, a, hasta) if a <= hasta else (0, None)
        capa, _z, juicio, para_revisar, _m = _revision_mostrada(cara, datos, hoy_)
        estado = estado_de_distribucion(cara, datos)
        area = cara.superficie["area_util_m2"] if cara.superficie else 0.0
        lista = []
        dibujado_dia = pendiente_dia = 0
        for sid, ts in sorted(datos.por_s.items(), key=lambda kv: kv[1][0]["numero"]):
            t, cuenta = _rige_ese_dia(ts, dia_informe, hoy_)
            if t is None:
                continue
            cu = _cuenta(juicio, sid, ts, hoy_)
            if cuenta:
                dibujado_dia += cu["dibujado"]
                pendiente_dia += max(0, t["pb"] - cu["dibujado"])
            if proveedor_id is not None and t.get("supplier_id") != proveedor_id:
                continue
            prov = proveedores.get(t.get("supplier_id"))
            pc = datos.pcs.get(sid)
            m2 = t["pb"] / reglas.CARA_ENTERA_PB * area
            lista.append({
                "codigo": pc.code if pc else None, "numero": t["numero"],
                "proveedor_id": prov.id if prov else None, "proveedor": prov.name if prov else None,
                "marca": t.get("marca"), "cuenta_el_dia": cuenta, "estado_visible": reglas.estado_visible(t, hoy_),
                "puntos_basicos": t["pb"], "desde": t["desde"], "hasta": t["hasta"], "caduca": t.get("caduca"),
                "dibujado_pb": cu["dibujado"], "m2_contratados": m2,
            })
            if prov is not None:
                pp = por_proveedor.setdefault(prov.id, {"proveedor_id": prov.id, "proveedor": prov.name,
                                                        "participaciones": 0, "caras": set(),
                                                        "m2_contratados_dia": 0.0})
                pp["participaciones"] += 1
                pp["caras"].add(cara.codigo)
                if cuenta:
                    pp["m2_contratados_dia"] += m2
        if proveedor_id is not None and not lista:
            continue
        for t in datos.todos:
            if t["estado"] == "reserva" and reglas.vivo(t, hoy_) and t["caduca"] <= hoy_ + timedelta(
                    days=reglas.DIAS_AVISO_CADUCA) and (proveedor_id is None or t.get("supplier_id") == proveedor_id):
                totales["reservas_por_caducar"] += 1
        for f in fis:
            if f["huerfano"] and f["hasta"] >= desde and f["desde"] <= hasta:
                huerfanos[f["lease_id"]] = {"codigo": f["codigo"], "desde": f["desde"], "hasta": f["hasta"]}
        # El borrador de la capa que se muestra (también encima de una
        # confirmada, que sigue «confirmada»): cuándo se guardó, y su DÍA en
        # Colombia (la cuenta de `baja_fecha`: el navegador no deriva días de
        # un instante).
        dist = datos.distribucion
        borrador_en = (dist.borrador_en if dist is not None and dist.borrador_en is not None
                       and not _otro_mueble(datos, cara) else None)
        totales["caras_por_participacion"] += 1
        totales["sin_distribuir"] += estado == "sin_distribuir"
        totales["borradores"] += estado == "borrador"
        totales["para_revisar"] += estado == "para_revisar"
        totales["con_errores"] += bool(juicio["errores"])
        filas.append({
            "codigo_cara": cara.codigo, "cara": cara.letra, "fixture_code": (cara.fixture or {}).get("code"),
            "rotulo": cara.rotulo, "estado_distribucion": estado, "area_util_m2": area,
            "comprometido_dia_pb": comprometido_dia, "pico_pb": p, "dia_pico": dia_pico,
            "disponible_pb": reglas.disponible(I, desde, hasta, hoy_),
            "dibujado_dia_pb": dibujado_dia, "pendiente_dia_pb": pendiente_dia,
            "errores": len(juicio["errores"]), "avisos": len(juicio["avisos"]),
            "borrador_en": _iso(borrador_en), "borrador_dia": baja_fecha(borrador_en),
            "participaciones": lista,
        })
    totales["huerfanos"] = len(huerfanos)
    sin_mueble = _caras_sin_mueble(db, s, {c.codigo for c in caras}, plano, hoy_) if not espacio else []
    totales["sin_mueble"] = len(sin_mueble)
    return {
        "sede": s, "hoy": hoy_, "dia": dia_informe, "desde": desde, "hasta": hasta, "caras": filas,
        "por_proveedor": [{**pp, "caras": len(pp["caras"])}
                          for pp in sorted(por_proveedor.values(), key=lambda x: (x["proveedor"] or "", x["proveedor_id"]))],
        "totales": totales,
        "sin_mueble": sin_mueble,
        "huerfanos": [huerfanos[k] for k in sorted(huerfanos, key=lambda k: (huerfanos[k]["codigo"], k))],
    }


def _caras_sin_mueble(db: Session, sede: str, en_el_plano: set, plano: PlanoIndexado, dia: date) -> list[dict]:
    """§11-6 «Participación sin mueble»: las caras de la sede con términos VIVOS
    (contratos activos que no terminaron, reservas que se sostienen) que el
    plano ya no vende por participación —el mueble no está, o dejó de venderse
    así—. Lo frena el guardado del plano (§4.4); puede venir de un plano viejo.
    Las canceladas, caducadas y vencidas no cuentan: no se borran nunca (D14)
    y una cara que volvió a venderse entera quedaba para siempre en «Para
    revisar» (verificación del paso 7). Lo archivado (``…#id``) tampoco."""
    fuera = []
    caras_con_terminos = (db.query(Space.code).join(Participacion, Participacion.cara_space_id == Space.id)
                          .filter(Space.sede == sede).distinct().all())
    for (code,) in sorted(caras_con_terminos, key=lambda x: x[0] or ""):
        codigo = normalizar(code)
        if not codigo or "#" in codigo or codigo in en_el_plano:
            continue
        vivos = [t for t in leer(db, codigo).todos if reglas.vivo(t, dia)]
        if not vivos:
            continue
        p = partir_codigo(codigo)
        corto = p.base[len(sede) + 1:] if p.base.startswith(f"{sede}-") else p.base
        fuera.append({
            "codigo_cara": codigo, "cara": p.cara, "fixture_code": corto,
            # El mueble sigue en el plano (dejó de venderse por participación)
            # o ya no está.
            "en_el_plano": plano.resolver(sede, corto) is not None,
            "participaciones": len({t["space_id"] for t in vivos}),
            "hasta": max(t["hasta"] for t in vivos),
        })
    return fuera


def historial(db: Session, sede: Optional[str] = None, espacio: Optional[str] = None,
              participacion_id: Optional[int] = None, limite: int = LIMITE_DEL_HISTORIAL) -> dict:
    """4 · El historial (D14) de una cara o de una participación, del más nuevo
    al más viejo, con «cómo estaba» en cada confirmación; y los vencimientos y
    caducidades, que no se escriben (D6): se derivan de las fechas."""
    dia = hoy()
    limite = max(1, min(int(limite or LIMITE_DEL_HISTORIAL), LIMITE_MAXIMO_DEL_HISTORIAL))
    if participacion_id is not None:
        t = _termino_o_404(db, participacion_id)
        filtro = HistorialParticipacion.participacion_space_id == t.space_id
        terminos = db.query(Participacion).filter(Participacion.space_id == t.space_id).all()
    elif sede and espacio:
        try:
            codigo = resolver_cara(db, sede, espacio).codigo
        except HTTPException as e:
            if e.status_code != 404:
                raise
            codigo = codigo_cara(sede, espacio)  # el historial de un mueble que ya no está
        cara_space = db.query(Space).filter(Space.code == codigo).first()
        if cara_space is None:
            return {"entradas": [], "derivados": []}
        filtro = HistorialParticipacion.cara_space_id == cara_space.id
        terminos = db.query(Participacion).filter(Participacion.cara_space_id == cara_space.id).all()
    else:
        raise _error(422, "historial_sin_filtro", "Pedí el historial de una cara (sede y espacio) o de una participación.")
    filas = (db.query(HistorialParticipacion).filter(filtro)
             .order_by(HistorialParticipacion.en.desc(), HistorialParticipacion.id.desc()).limit(limite).all())
    ids = {f.participacion_space_id for f in filas if f.participacion_space_id is not None}
    ids |= {t.space_id for t in terminos}
    codigos = {s.id: s.code for s in db.query(Space).filter(Space.id.in_(ids)).all()} if ids else {}
    entradas = [{
        "id": f.id, "en": _iso(f.en), "actor": f.actor, "tipo": f.tipo, "accion": f.accion,
        "participacion_id": f.participacion_id, "codigo": codigos.get(f.participacion_space_id),
        "detalle": f.detalle,
        "antes": json.loads(f.antes_json) if f.antes_json else None,
        "despues": json.loads(f.despues_json) if f.despues_json else None,
    } for f in filas]
    leases = {}
    ids_lease = [t.lease_id for t in terminos if t.lease_id is not None]
    if ids_lease:
        leases = {L.id: L for L in db.query(SpaceLease).filter(SpaceLease.id.in_(ids_lease)).all()}
    derivados = []
    for t in terminos:
        r = termino_para_reglas(t, leases.get(t.lease_id))
        if t.estado == "contrato" and r["lease"] is not None and r["baja_fecha"] is None and r["hasta"] < dia:
            derivados.append(_derivado(r["hasta"] + timedelta(days=1), "participacion.vencida", t, codigos,
                                       f"Venció la participación {t.numero}."))
        elif t.estado == "reserva" and t.caduca is not None and t.caduca < dia:
            derivados.append(_derivado(t.caduca + timedelta(days=1), "reserva.caducada", t, codigos,
                                       f"Caducó la reserva provisional de la participación {t.numero}."))
    derivados.sort(key=lambda d: (d["dia"], d["participacion_id"]), reverse=True)
    return {"entradas": entradas, "derivados": derivados}


def _derivado(dia: date, accion: str, t: Participacion, codigos: dict, detalle: str) -> dict:
    """Una entrada DERIVADA del historial (D6: no tiene fila): el vencimiento
    de un contrato o la caducidad de una reserva, el DÍA de Colombia en que
    pasó —el siguiente al último día de vigencia—.

    · ``dia`` (``YYYY-MM-DD``) es lo que el panel muestra, sin hora: lo parsea
      como fecha local, nunca con ``new Date(iso)`` (que toma ``2026-10-18``
      como medianoche UTC: las 7 p. m. del 17 en Colombia).
    · ``en`` es el instante de la medianoche de ese día en Colombia, escrito
      en UTC como el ``en`` de las entradas reales (``_iso``):
      ``2026-10-18T05:00:00+00:00``. Con el mismo formato, ordenar por el
      texto (el panel compara ``a.en < b.en``) da el orden de los instantes;
      con ``-05:00`` la entrada real de las 10 p. m. del 17
      (``2026-10-18T03:00…+00:00``) quedaba DESPUÉS de lo derivado del 18.
    · ``derivado: true`` la distingue de una entrada con fila."""
    medianoche = datetime.combine(dia, datetime.min.time(), tzinfo=ZONA_DEL_NEGOCIO)
    return {"en": _iso(medianoche), "dia": dia, "derivado": True, "tipo": "evento", "accion": accion,
            "participacion_id": t.id, "codigo": codigos.get(t.space_id), "detalle": detalle}
