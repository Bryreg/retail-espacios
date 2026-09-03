"""Tarifa de referencia y ocupación derivada, por espacio y por sede.

Dos preguntas que comparten dominio: "¿cuánto vale este espacio y está libre?"
(``GET /spaces/{code}/rates``) y "¿cómo va la sede?" (``GET
/dashboard/ocupacion``). Las dos se apoyan en la MISMA regla de qué contrato
manda hoy (``services.contratos.contrato_para_montar``) y en la MISMA tabla de
tarifas (``routers.layout.reference_rates_raw``) — no se duplican acá.

**Nunca `is_active` solo.** `expire_leases()` corre en otros endpoints (el
mapa, los KPIs) y apaga la bandera de un contrato vencido en cuanto alguien
pega ahí — con el polling de 20 s del cliente, eso pasa segundos después de
que el contrato vence. Si "vencido" dependiera de `is_active`, el estado
desaparecería solo con el paso del tiempo y sin que nada haya cambiado del
lado comercial: por eso la búsqueda de "el último contrato que corrió" ignora
la bandera y mira sólo `end_date`. Para "¿qué días están tomados en este
rango?" es al revés: un contrato CANCELADO no debe contar como tomado —
soltar el espacio es exactamente lo que cancelar hace — así que esa cuenta sí
filtra por `is_active`. Las dos reglas conviven a propósito.

**Ingreso: prorrateado /30, misma convención que firma el resto del sistema**
(``Contrato.tsx``: `total = round(monthly_rent/30 * dias)`, rangos inclusivos
en los dos extremos). Antes de este módulo, `ingreso_contratado` sumaba el
`monthly_rent` COMPLETO de cualquier contrato que tocara el período, sin
prorratear — un contrato de un día sumaba un mes entero, y dos contratos
consecutivos sobre la misma cara sumaban dos meses completos por un período
que entre los dos no llegaba a cubrir un mes. `ingreso_a_referencia` prorratea
igual (a la duración del PERÍODO pedido, no de un lease — es el techo de lo
que se cobraría si todo estuviera vendido a tarifa de lista) para que las dos
cifras sean comparables. La división por 30 se aplica UNA vez sobre la suma
de toda la sede (pesos-día), no lease por lease: así dos contratos
consecutivos sobre la misma cara suman sus prorrateos sin que un redondeo por
lease los deforme antes de sumar.
"""
import json
from datetime import date, timedelta

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.models.models import LayoutSnapshot, LeaseCancellation, MountConfirmation, Space
from app.routers.layout import reference_rates_raw
from app.services.contratos import contrato_para_montar

# ─── Tipo y tarifa ──────────────────────────────────────────────────────────


def rate_type_of(fixture: dict) -> str:
    """Espeja ``rateTypeOf`` de ``frontend/src/types/fixtures.ts``.

    Los dos tipos legados del 2D (``gondola_doble``/``gondola_mural``) y el
    tipo unificado ``gondola`` comparten una sola tarifa por cara.
    """
    tipo = str(fixture.get("type") or "")
    return "gondola" if tipo in ("gondola_doble", "gondola_mural") else tipo


def reference_rate_for(raw_rates: dict, sede: str, rate_type: str) -> float | None:
    """Espeja ``referenceRateFor``: el override de la sede gana sobre la general."""
    sede_key = (sede or "").strip().upper()
    by_sede = raw_rates.get("by_sede") if isinstance(raw_rates, dict) else None
    if isinstance(by_sede, dict):
        sede_rates = by_sede.get(sede_key)
        if isinstance(sede_rates, dict):
            override = sede_rates.get(rate_type)
            if isinstance(override, (int, float)) and not isinstance(override, bool) and override > 0:
                return float(override)
    default_rates = raw_rates.get("default") if isinstance(raw_rates, dict) else None
    if isinstance(default_rates, dict):
        base = default_rates.get(rate_type)
        if isinstance(base, (int, float)) and not isinstance(base, bool) and base > 0:
            return float(base)
    return None


# ─── Ocupación de UN espacio ────────────────────────────────────────────────


def _sin_ocupacion() -> dict:
    return {"estado": "disponible", "lease_desde": None, "lease_hasta": None, "se_libera_el": None}


def occupancy_today(space: Space | None, today: date | None = None) -> dict:
    """Estado de HOY para un espacio: disponible / contratado / vencido / ocupado.

    El contrato que manda es el que decide ``contrato_para_montar`` — vigente,
    o si no hay, el próximo ya firmado —, así las dos pantallas (montaje y
    esta) nunca se contradicen. Si no hay ninguno de los dos, se busca el más
    reciente que ya terminó, SIN mirar ``is_active``: ver el docstring del
    módulo.
    """
    today = today or date.today()
    if space is None or not space.leases:
        return _sin_ocupacion()

    lease = contrato_para_montar(space, today)
    if lease is not None:
        if lease.start_date <= today <= lease.end_date:
            return {
                "estado": "ocupado",
                "lease_desde": lease.start_date.isoformat(),
                "lease_hasta": lease.end_date.isoformat(),
                # Rangos inclusivos en los dos extremos: el día siguiente al
                # de fin es el primero realmente libre.
                "se_libera_el": (lease.end_date + timedelta(days=1)).isoformat(),
            }
        # start_date > today: firmado, todavía no arranca.
        return {
            "estado": "contratado",
            "lease_desde": lease.start_date.isoformat(),
            "lease_hasta": lease.end_date.isoformat(),
            "se_libera_el": None,
        }

    pasados = [l for l in space.leases if l.end_date < today]
    if pasados:
        ultimo = max(pasados, key=lambda l: l.end_date)
        return {
            "estado": "vencido",
            "lease_desde": ultimo.start_date.isoformat(),
            "lease_hasta": ultimo.end_date.isoformat(),
            "se_libera_el": None,
        }
    return _sin_ocupacion()


def occupancy_range(space: Space | None, desde: date, hasta: date) -> dict:
    """Estado de un PERÍODO: libre / se_libera (parcial) / tomado.

    Espeja ``daysTakenInRange``/``rangeAvailability`` del cliente, pero suma
    sobre las filas de ``space_leases`` en vez de un único par de fechas del
    fixture. Los contratos activos de un mismo espacio nunca se solapan entre
    sí (lo impide ``create_lease``), así que sumar la intersección de cada uno
    contra el rango pedido no cuenta ningún día dos veces. Un contrato
    CANCELADO no debe restar disponibilidad — soltar el espacio es lo que
    cancelar hace — así que acá sí se filtra por ``is_active``.
    """
    total = (hasta - desde).days + 1
    if total <= 0 or space is None:
        return {"estado": "libre"}

    tomado = 0
    for lease in space.leases:
        if not lease.is_active:
            continue
        a = max(desde, lease.start_date)
        b = min(hasta, lease.end_date)
        if b >= a:
            tomado += (b - a).days + 1

    if tomado <= 0:
        return {"estado": "libre"}
    if tomado >= total:
        return {"estado": "tomado"}
    return {"estado": "se_libera"}


# ─── Agregado por sede (dashboard) ──────────────────────────────────────────


def _es_gondola_doble(fixture: dict) -> bool:
    """DOS caras (A y B), o una sola. Espeja ``isDoubleGondola``.

    Cubre las dos formas en que un fixture puede describir una góndola: el
    tipo unificado (``type: "gondola"`` + ``gondolaType``, donde la ausencia
    de ``gondolaType`` significa "double" — el mismo default que usa el
    cliente) y los tipos legados del 2D que todavía puede traer un snapshot
    viejo nunca vuelto a guardar.
    """
    tipo = str(fixture.get("type") or "")
    if tipo == "gondola_doble":
        return True
    if tipo == "gondola_mural":
        return False
    if tipo == "gondola":
        return (fixture.get("gondolaType") or "double") == "double"
    return False


def _full_code(fixture_code: str, sede: str) -> str:
    code = (fixture_code or "").strip().upper()
    sede_uc = (sede or "").strip().upper()
    if sede_uc and not code.startswith(f"{sede_uc}-"):
        return f"{sede_uc}-{code}"
    return code


def _caras_comercializables(sede: str, fixtures: list) -> list[tuple[str, str]]:
    """``[(code, rate_type), ...]`` — una entrada por CARA, no por mueble.

    Sólo lo comercializable entra: la ausencia de ``rentable`` significa
    comercializable (``isRentable``), y sólo un ``false`` explícito lo saca.
    """
    caras: list[tuple[str, str]] = []
    for fixture in fixtures:
        if not isinstance(fixture, dict):
            continue
        if fixture.get("rentable") is False:
            continue
        raw = str(fixture.get("code") or "").strip()
        if not raw:
            continue
        rate_type = rate_type_of(fixture)
        base = _full_code(raw, sede)
        caras.append((base, rate_type))
        if _es_gondola_doble(fixture):
            caras.append((f"{base}-B", rate_type))
    return caras


def _fin_efectivo(lease, cancelados: dict[int, date]) -> date:
    """Hasta qué día cuenta este lease — LA regla de elegibilidad, única para
    conteo (``_cubre_periodo``) y plata (``_ingreso_periodo_dias``), para que
    ``contratadas`` e ``ingreso_contratado`` no puedan contradecirse por
    construcción (hallazgo C-3 del auditor contable).

    - Con fila en ``lease_cancellations``: corta en la fecha de cancelación —
      lo devengado hasta ahí no se borra, pero no sigue sumando después.
    - Sin fila: corta en ``end_date``, esté el lease activo o no. Un lease que
      ``expire_leases()`` apagó al vencer devengó su plazo completo, y una
      cancelación anterior a la tabla queda contada hasta ``end_date`` de
      forma EXPLÍCITA Y ESTABLE — el mismo resultado todos los días, no según
      qué día se consulte (hallazgo C-1: acá nada compara contra HOY). El
      prorrateo fino de esas cancelaciones históricas lo repone el backfill de
      ``lease_cancellations`` desde ``audit_log`` (ver docs/ESTADO.md), no una
      adivinanza en runtime.
    """
    cancelado_el = cancelados.get(lease.id)
    if cancelado_el is not None:
        return min(lease.end_date, cancelado_el)
    return lease.end_date


def _cubre_periodo(
    space: Space | None, desde: date, hasta: date, cancelados: dict[int, date]
) -> bool:
    """¿Algún contrato de este espacio toca el período?

    "Tocar" es solapar aunque sea un día — igual que el chequeo de choque de
    ``create_lease`` — con el corte de ``_fin_efectivo``: la MISMA elegibilidad
    que la plata, así una fila con ``ingreso_contratado > 0`` siempre cuenta
    también en ``contratadas``. OJO: esto cuenta la temporada ("ocupó los días
    que ocupó"); el semáforo de venta (``occupancy_range``) sigue filtrando
    ``is_active`` a propósito — "cancelado no ocupa" es la regla correcta para
    VENDER, no para contar lo devengado.
    """
    if space is None:
        return False
    for lease in space.leases:
        if lease.start_date <= hasta and _fin_efectivo(lease, cancelados) >= desde:
            return True
    return False


def _cancelados_de(db: Session, spaces: dict) -> dict[int, date]:
    """``{lease_id: fecha en que se canceló}``, para los leases de estos espacios
    que tienen fila en ``lease_cancellations``. Una sola consulta para toda la
    sede — no una por lease."""
    lease_ids = [lease.id for space in spaces.values() for lease in space.leases]
    if not lease_ids:
        return {}
    filas = (
        db.query(LeaseCancellation.lease_id, LeaseCancellation.cancelled_at)
        .filter(LeaseCancellation.lease_id.in_(lease_ids))
        .all()
    )
    return {lease_id: cancelled_at.date() for lease_id, cancelled_at in filas}


def _ingreso_periodo_dias(
    space: Space | None,
    desde: date,
    hasta: date,
    cancelados: dict[int, date],
) -> float:
    """Σ ``monthly_rent × días que el lease intersecta [desde, hasta]`` de este
    espacio — en PESOS-DÍA, sin dividir por 30 todavía (eso se hace una sola
    vez sobre la suma de toda la sede, en ``sede_ocupacion``).

    La elegibilidad es ``_fin_efectivo`` — la MISMA que el conteo de
    ``_cubre_periodo`` — y es función pura de lo GUARDADO (fechas + fila de
    cancelación): consultar el mismo período hoy, mañana o en un año devuelve
    el mismo peso. Acá no entra HOY a propósito — un P&L que cambia solo con
    el paso del calendario no se puede firmar (hallazgo C-1).
    """
    if space is None:
        return 0.0
    total = 0.0
    for lease in space.leases:
        a = max(desde, lease.start_date)
        b = min(hasta, _fin_efectivo(lease, cancelados))
        if b >= a:
            total += float(lease.monthly_rent or 0) * ((b - a).days + 1)
    return total


def _es_vencida(space: Space | None, hasta: date) -> bool:
    """¿Este espacio está "vencido" mirado desde el final del período?

    Reutiliza ``occupancy_today`` con ``hasta`` como fecha de referencia, así
    que respeta la misma regla de no depender de ``is_active`` solo.
    """
    if space is None:
        return False
    return occupancy_today(space, today=hasta)["estado"] == "vencido"


def _montado_por_codigo(db: Session, codes: list[str]) -> set[str]:
    """Códigos cuyo ÚLTIMO reporte de montaje (no archivado) dice "montado".

    Una fila por reporte, no por espacio — manda el más reciente
    (``confirmado_en``, con el id como desempate para reportes en el mismo
    segundo).
    """
    if not codes:
        return set()
    rn = (
        func.row_number()
        .over(
            partition_by=MountConfirmation.space_code,
            order_by=(MountConfirmation.confirmado_en.desc(), MountConfirmation.id.desc()),
        )
        .label("rn")
    )
    sub = (
        db.query(MountConfirmation.space_code, MountConfirmation.estado, rn)
        .filter(
            MountConfirmation.space_code.in_(codes),
            MountConfirmation.archivado_en.is_(None),
        )
        .subquery()
    )
    filas = (
        db.query(sub.c.space_code)
        .filter(sub.c.rn == 1, sub.c.estado == "montado")
        .all()
    )
    return {code for (code,) in filas}


def sede_ocupacion(
    db: Session,
    sede: str,
    fixtures: list,
    desde: date,
    hasta: date,
    include_money: bool,
) -> dict:
    """El agregado de una sede para el período ``[desde, hasta]`` (inclusivo).

    ``esperada`` = contratadas / comercializables. ``real`` = montadas /
    comercializables — el mismo denominador que ``esperada`` a propósito, para
    que las dos lean como una sola barra comparada contra el mismo total y no
    dos números que no se pueden restar entre sí.

    ``ingreso_contratado``/``ingreso_a_referencia`` (sólo admin): devengado
    PRORRATEADO al período, /30 como el resto del sistema — ver el docstring
    del módulo y el de ``_ingreso_periodo_dias``. La división por 30 se hace
    UNA vez sobre la suma en pesos-día de toda la sede, no lease por lease.
    """
    caras = _caras_comercializables(sede, fixtures)
    codes = [c for c, _ in caras]
    periodo_dias = (hasta - desde).days + 1

    spaces: dict[str, Space] = {}
    if codes:
        rows = (
            db.query(Space)
            .options(joinedload(Space.leases))
            .filter(Space.code.in_(codes))
            .all()
        )
        spaces = {s.code: s for s in rows}

    montados = _montado_por_codigo(db, codes)

    raw_rates = reference_rates_raw(db) if include_money else {}
    # El conteo (contratadas) usa la misma elegibilidad que la plata, así que
    # las cancelaciones se cargan SIEMPRE, no sólo cuando include_money.
    cancelados = _cancelados_de(db, spaces)

    contratadas = 0
    montadas = 0
    vencidas = 0
    ingreso_contratado_dias = 0.0
    ingreso_a_referencia_dias = 0.0

    for code, rate_type in caras:
        space = spaces.get(code)
        if _cubre_periodo(space, desde, hasta, cancelados):
            contratadas += 1
            if code in montados:
                montadas += 1
        if _es_vencida(space, hasta):
            vencidas += 1
        if include_money:
            ingreso_contratado_dias += _ingreso_periodo_dias(space, desde, hasta, cancelados)
            ref = reference_rate_for(raw_rates, sede, rate_type)
            if ref:
                ingreso_a_referencia_dias += ref * periodo_dias

    total = len(caras)
    esperada_pct = round(contratadas / total * 100, 1) if total else 0.0
    real_pct = round(montadas / total * 100, 1) if total else 0.0

    out = {
        "sede": sede,
        "caras_comercializables": total,
        "contratadas": contratadas,
        "montadas": montadas,
        "vencidas": vencidas,
        "ocupacion_esperada_pct": esperada_pct,
        "ocupacion_real_pct": real_pct,
    }
    if include_money:
        out["ingreso_contratado"] = round(ingreso_contratado_dias / 30)
        out["ingreso_a_referencia"] = round(ingreso_a_referencia_dias / 30)
    return out


def ocupacion_por_sedes(
    db: Session,
    sede_filtro: str | None,
    desde: date,
    hasta: date,
    include_money: bool,
) -> list[dict]:
    """Una fila por sede con snapshot guardado (vacía si ``sede_filtro`` no existe).

    Una sola pasada por ``layout_snapshots``: llamar a ``sede_ocupacion`` una
    vez por sede desde el router repetiría este query por cada una.
    """
    resultado = []
    for snap in db.query(LayoutSnapshot).all():
        if sede_filtro and (snap.sede or "").strip().lower() != sede_filtro.strip().lower():
            continue
        try:
            fixtures = json.loads(snap.fixtures_json or "[]")
        except (ValueError, TypeError):
            fixtures = []
        if not isinstance(fixtures, list):
            fixtures = []
        resultado.append(sede_ocupacion(db, snap.sede, fixtures, desde, hasta, include_money))
    return resultado
