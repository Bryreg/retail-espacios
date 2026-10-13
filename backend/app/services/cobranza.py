"""La cobranza de la suscripción, a mano (C1).

Tres cosas viven acá, y las tres las usa la consola de la operadora
(``routers/plataforma.py``):

1. **``mover_estado``: el ÚNICO camino que cambia ``estados_cliente``.** Antes
   el cuerpo estaba adentro del PATCH de la consola; ahora el PATCH lo llama y
   hace exactamente lo mismo que hacía —valida, sube o crea la fila, invalida
   los cachés— más una cosa: deja una fila en ``cambios_estado_cuenta``, porque
   ``estados_cliente`` sólo guarda el último cambio y la cobranza necesita la
   historia. Si mañana el estado lo mueve otra cosa (la escalera de C2), pasa
   por acá y hereda las mismas reglas.

2. **Las cuentas puras**: si una factura está saldada (``factura_saldada``),
   cuántos días de atraso hay (``dias_de_atraso``) y qué estado de cuenta le
   CORRESPONDERÍA a un cliente según sus facturas (``estado_objetivo``). En esta
   tanda ``estado_objetivo`` sólo se muestra en la consola, al lado del estado
   real, y se usa para levantar el estado cuando un pago deja al cliente al día.

3. **La cartera y sus formularios**: la suscripción de cada cliente, emitir una
   cuenta de cobro, registrar un pago, anularla o marcarla en disputa.

── Lo que decidió la dueña (2026-10-13) y esto respeta ──────────────────────

· **Esta tanda no le corta el servicio a nadie.** Ningún camino de acá empeora
  un estado: el único movimiento automático es LEVANTAR, y sólo si la operadora
  lo pide al registrar el pago («levantar el estado si queda al día»).
· **Nunca suspensión automática.** ``estado_objetivo`` no devuelve
  ``suspendido`` jamás: lo más grave que corresponde por atraso es sólo
  lectura, a los ``dia_solo_lectura`` días (30) de vencida la factura.
  Suspender lo decide una persona con el PATCH de siempre.
· **Sin suscripción no hay cobranza**: Galerías y todo cliente sin fila en
  ``suscripciones`` es EXENTO. No aparece con deuda, no se le emite nada y nada
  de acá le mueve el estado.
· **Al empeorar, el sistema nunca pisa a una persona.** Un estado puesto por la
  operadora sólo lo cambia el sistema para MEJORAR, y sólo cuando ella lo pidió.
  Lo firma ``sistema:cobranza``; el correo de ella queda en el pago
  (``registrado_por``). Así un estado que puso el sistema se distingue siempre
  del que puso una persona, y la escalera de C2 sabe cuál puede tocar.
· **Los motivos que escribe el sistema no llevan montos.** El motivo le llega a
  la dueña del supermercado y la franja de «pago pendiente» se ve en Vender,
  delante de los proveedores.
· **«Vencida» es ``vence_el < hoy``**, con el hoy de Colombia
  (``app/fechas.py``): el día del vencimiento todavía está a tiempo.
"""
import logging
import re
from datetime import date, datetime, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy.exc import IntegrityError

from app.fechas import hoy as hoy_en_colombia
from app.plataforma_estado import ESTADOS_CUENTA, invalidar_cache_estado

log = logging.getLogger("recabra.cobranza")

# Quién firma lo que hace el sistema. Todo actor que empiece con `sistema:` es
# una máquina; cualquier otro es el correo de una persona.
ACTOR_SISTEMA = "sistema:cobranza"
PREFIJO_SISTEMA = "sistema:"

# Mil pesos de tolerancia: lo que el redondeo de una retención le puede quitar
# a una transferencia que paga exacto.
TOLERANCIA_COP = 1_000

# Qué tan grave es cada estado. Mejorar es bajar en esta escala.
GRAVEDAD = {"activo": 0, "gracia": 1, "solo_lectura": 2, "suspendido": 3}

CLIENTE_DESCONOCIDO = "No hay un cliente con ese código."
FACTURA_DESCONOCIDA = "No hay una cuenta de cobro con ese número interno."

_MESES = ("ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic")
_PERIODO = re.compile(r"^(\d{4})-(0[1-9]|1[0-2])(?:\.\.(\d{4})-(0[1-9]|1[0-2]))?$")


class ErrorDeCobranza(Exception):
    """Lo que la consola tiene que leer: el texto va tal cual al ``detail``."""

    status = 422


class DatoInvalido(ErrorDeCobranza):
    status = 422


class NoEncontrado(ErrorDeCobranza):
    status = 404


class Conflicto(ErrorDeCobranza):
    status = 409


class _ElQueCorresponde:
    """El estado que no se elige: se calcula de las facturas, adentro de la
    misma transacción que lo escribe. No es una cadena a propósito: ningún
    cuerpo de un PATCH puede llegar a parecerse a esto."""

    def __repr__(self) -> str:
        return "EL_QUE_CORRESPONDE"


EL_QUE_CORRESPONDE = _ElQueCorresponde()


def es_del_sistema(actor: str | None) -> bool:
    return bool(actor) and actor.startswith(PREFIJO_SISTEMA)


def _fecha_humana(d: date) -> str:
    """``15-nov-2026``: el motivo lo lee una persona, no una máquina."""
    return f"{d.day}-{_MESES[d.month - 1]}-{d.year}"


# ════════════════════════════════════════════════════════════════════════════
# Las cuentas puras
# ════════════════════════════════════════════════════════════════════════════

def abonado(pagos) -> int:
    """Lo que cuenta como pagado de una factura: lo recibido más lo que el
    supermercado retuvo, de los pagos aprobados."""
    return sum(
        (p.valor_recibido_cop or 0) + (p.retefuente_cop or 0) + (p.reteica_cop or 0) + (p.reteiva_cop or 0)
        for p in pagos
        if p.estado == "aprobado"
    )


def factura_saldada(factura, pagos) -> bool:
    """¿Lo recibido más las retenciones cubren el total? Con ``TOLERANCIA_COP``
    de margen por redondeo. Las retenciones cuentan aunque el certificado no
    haya llegado: el certificado es seguimiento contable, no plata que falte."""
    return abonado(pagos) >= factura.total_cop - TOLERANCIA_COP


def esta_vencida(factura, hoy: date) -> bool:
    """Emitida, impaga y con el vencimiento ATRÁS: el día que vence todavía no."""
    return factura.estado == "emitida" and factura.vence_el is not None and factura.vence_el < hoy


def dias_de_atraso(facturas, hoy: date) -> int | None:
    """Días desde el vencimiento de la factura vencida más vieja, sin contar
    las que están en disputa. ``None`` si no hay ninguna vencida."""
    vencidas = [f for f in facturas if esta_vencida(f, hoy) and not f.en_disputa]
    if not vencidas:
        return None
    return max((hoy - f.vence_el).days for f in vencidas)


def estado_objetivo(suscripcion, facturas, hoy: date) -> str:
    """El estado de cuenta que le correspondería a un cliente con suscripción.
    PURA: no lee la base, no mira el estado actual ni quién lo puso.

    · sin facturas vencidas (o sólo en disputa) → ``activo``;
    · vencida hace menos de ``dia_solo_lectura`` días → ``gracia``;
    · vencida hace ``dia_solo_lectura`` días o más → ``solo_lectura``;
    · con una prórroga vigente (``hoy <= prorroga_hasta``), no pasa de gracia.

    **Nunca ``suspendido``**: suspender lo decide una persona.
    """
    atraso = dias_de_atraso(facturas, hoy)
    if atraso is None:
        return "activo"
    if atraso < suscripcion.dia_solo_lectura:
        return "gracia"
    prorroga = suscripcion.prorroga_hasta
    if prorroga is not None and hoy <= prorroga:
        return "gracia"
    return "solo_lectura"


def motivo_del_sistema(estado: str, facturas, hoy: date) -> str:
    """El motivo que escribe el sistema: una fecha, nunca un monto (lo lee la
    dueña del supermercado, y la franja se ve en Vender delante de proveedores)."""
    vencidas = [f for f in facturas if esta_vencida(f, hoy) and not f.en_disputa]
    if estado == "activo" or not vencidas:
        return "La suscripción está al día."
    desde = _fecha_humana(min(f.vence_el for f in vencidas))
    if estado == "gracia":
        return f"Pago de la suscripción pendiente: la cuenta de cobro venció el {desde}."
    return (
        f"Pago de la suscripción vencido desde el {desde}: la cuenta queda en sólo lectura "
        "hasta ponerse al día. Los datos no se borran."
    )


def _miles(n: int) -> str:
    """``1234567`` → ``1.234.567``: los pesos se escriben como en Colombia."""
    return f"{n:,}".replace(",", ".")


def _redondear(x: Decimal) -> int:
    return int(x.quantize(Decimal(1), rounding=ROUND_HALF_UP))


def retenciones_estimadas(suscripcion, subtotal_cop: int, iva_cop: int) -> int:
    """Lo que se espera que el supermercado retenga: retefuente y reteICA sobre
    el subtotal, reteIVA sobre el IVA. Es una estimación para calcular el neto;
    lo que vale es lo que se registra en cada pago."""
    tasa = Decimal(str(suscripcion.retefuente_pct or 0)) + Decimal(str(suscripcion.reteica_pct or 0))
    base = Decimal(subtotal_cop) * tasa / 100 + Decimal(iva_cop) * Decimal(str(suscripcion.reteiva_pct or 0)) / 100
    return _redondear(base)


def meses_del_periodo(periodo: str) -> int:
    """``2026-11`` → 1; ``2026-11..2027-01`` → 3. Levanta ``DatoInvalido``."""
    m = _PERIODO.match((periodo or "").strip())
    if not m:
        raise DatoInvalido("El período va como 2026-11, o 2026-11..2027-01 si cubre varios meses.")
    desde = int(m.group(1)) * 12 + int(m.group(2))
    hasta = int(m.group(3)) * 12 + int(m.group(4)) if m.group(3) else desde
    if hasta < desde:
        raise DatoInvalido("El período termina antes de empezar.")
    if hasta - desde >= 24:
        raise DatoInvalido("Un período puede cubrir hasta 24 meses.")
    return hasta - desde + 1


# ════════════════════════════════════════════════════════════════════════════
# El interruptor
# ════════════════════════════════════════════════════════════════════════════

def _olvidar_caches(slug: str) -> None:
    """Tras el commit, no antes: si el commit fallara, el caché de un estado
    viejo no tendría por qué invalidarse. Y también el de MÉTRICAS (hallazgo
    M-1): el estado viaja adentro del JSON de métricas, y sin esto la operadora
    veía el estado viejo en el panel hasta 5 minutos después de su propio cambio."""
    from app.plataforma_metricas import limpiar_cache_metricas

    invalidar_cache_estado(slug)
    limpiar_cache_metricas()


def _fila_estado(slug: str, fila, *, movido: bool, de: str, razon: str | None) -> dict:
    return {
        "slug": slug,
        "estado": fila.estado if fila is not None else "activo",
        "motivo": fila.motivo if fila is not None else None,
        "cambiado_en": fila.cambiado_en if fila is not None else None,
        "cambiado_por": fila.cambiado_por if fila is not None else None,
        "movido": movido,
        "de": de,
        "razon": razon,
    }


def _por_que_no_se_mueve(antes: str, nuevo: str, fila, actor: str, *,
                         solo_mejorar: bool, mejorar_sobre_una_persona: bool) -> str | None:
    """Las reglas que separan a una persona de una máquina. ``None`` = se mueve."""
    sube = GRAVEDAD[nuevo] > GRAVEDAD.get(antes, 0)
    baja = GRAVEDAD[nuevo] < GRAVEDAD.get(antes, 0)
    if solo_mejorar and not baja:
        return "no_mejora"
    if not es_del_sistema(actor):
        return None  # una persona siempre puede: es el PATCH de siempre
    if nuevo == antes:
        return "sin_cambio"
    puesto_por_una_persona = (
        fila is not None and antes != "activo" and not es_del_sistema(fila.cambiado_por)
    )
    if puesto_por_una_persona and (sube or not mejorar_sobre_una_persona):
        return "lo_puso_una_persona"
    return None


def mover_estado(
    slug: str,
    estado,
    motivo: str | None,
    actor: str,
    *,
    solo_mejorar: bool = False,
    mejorar_sobre_una_persona: bool = False,
    de_la_suscripcion: int | None = None,
    hoy: date | None = None,
    ensayo: bool = False,
) -> dict:
    """El único camino que cambia ``estados_cliente``.

    Con un estado escrito (el PATCH de la consola) hace lo de siempre: valida
    contra ``ESTADOS_CUENTA`` y exige motivo —también para «activo»—, sube o
    crea la fila con ``cambiado_por = actor``, y después del commit invalida el
    caché del estado (el corte se siente en el pedido siguiente) y el de las
    métricas. Lo nuevo: cada cambio deja su fila en ``cambios_estado_cuenta``.

    Con ``EL_QUE_CORRESPONDE`` el estado no se elige: se calcula con
    ``estado_objetivo`` sobre las facturas de la suscripción, **adentro de la
    misma transacción que escribe** y con la suscripción y el estado tomados con
    ``FOR UPDATE`` en Postgres. Si entre que alguien decidió levantar y esto
    corre entró otra factura o un pago, cuenta con lo de ahora, no con lo de
    antes. Un cliente sin suscripción no se mueve (exento), y tampoco uno cuya
    suscripción ya no es ``de_la_suscripcion`` (el slug lo tomó otro cliente).

    Las reglas de máquina (``actor`` que empieza con ``sistema:``): nunca
    empeora un estado puesto por una persona; lo mejora sólo con
    ``mejorar_sobre_una_persona`` (la operadora lo pidió); y no reescribe un
    estado igual al que ya hay. ``solo_mejorar`` corta todo lo que no sea bajar
    en la escala de gravedad.

    Devuelve la fila como quedó (``slug``, ``estado``, ``motivo``,
    ``cambiado_en``, ``cambiado_por``) más ``movido``, ``de`` y ``razon`` (por
    qué no se movió: ``exento`` · ``otra_suscripcion`` · ``no_mejora`` ·
    ``sin_cambio`` · ``lo_puso_una_persona``). Levanta ``DatoInvalido`` (estado
    o motivo) y ``NoEncontrado`` (el cliente no existe).

    Con ``ensayo`` (la escalera de C2 con ``COBRANZA_AUTOMATICA`` apagado, y
    «Correr cobranza (ensayo)» de la consola) decide EXACTAMENTE igual —el
    mismo cálculo, las mismas reglas, en la misma transacción— y no escribe
    nada: devuelve lo que habría quedado, con ``ensayo: True``. Que el ensayo y
    lo real pasen por el mismo código es lo que hace que el ensayo valga.
    """
    from app.clientes import sesion_registro
    from app.models.cobro import CambioEstadoCuenta, FacturaCobro, Suscripcion
    from app.models.models import ClienteRow
    from app.models.plataforma import EstadoCliente

    calcular = estado is EL_QUE_CORRESPONDE
    if not calcular:
        estado = (estado or "").strip().lower()
        if estado not in ESTADOS_CUENTA:
            raise DatoInvalido(f"Estado inválido: debe ser uno de {', '.join(ESTADOS_CUENTA)}")
        motivo = (motivo or "").strip()
        if not motivo:
            raise DatoInvalido("El motivo es obligatorio.")
    actor = (actor or "").strip()
    if not actor:
        raise DatoInvalido("Falta quién hace el cambio.")
    slug = (slug or "").strip().lower()
    dia = hoy or hoy_en_colombia()

    # Dos intentos: si la cuenta no tenía fila de estado y otro camino la crea
    # en el mismo instante (la pasada de la escalera y la que dispara un pago),
    # `FOR UPDATE` no tiene qué bloquear —tampoco en Postgres— y el segundo
    # INSERT choca con la llave. Se vuelve a leer y se decide de nuevo, sobre
    # la fila que dejó el otro.
    for intento in (1, 2):
        reg = sesion_registro()
        try:
            if reg.query(ClienteRow.slug).filter(ClienteRow.slug == slug).first() is None:
                raise NoEncontrado(CLIENTE_DESCONOCIDO)
            sus = (
                reg.query(Suscripcion).filter(Suscripcion.cliente_slug == slug)
                .with_for_update().first()
            )
            fila = (
                reg.query(EstadoCliente).filter(EstadoCliente.slug == slug)
                .with_for_update().first()
            )
            antes = fila.estado if fila is not None else "activo"

            nuevo, texto = estado, motivo
            if calcular:
                if sus is None:
                    return _fila_estado(slug, fila, movido=False, de=antes, razon="exento")
                if de_la_suscripcion is not None and sus.id != de_la_suscripcion:
                    return _fila_estado(slug, fila, movido=False, de=antes, razon="otra_suscripcion")
                facturas = reg.query(FacturaCobro).filter(FacturaCobro.suscripcion_id == sus.id).all()
                nuevo = estado_objetivo(sus, facturas, dia)
                texto = (motivo or "").strip() or motivo_del_sistema(nuevo, facturas, dia)

            razon = _por_que_no_se_mueve(
                antes, nuevo, fila, actor,
                solo_mejorar=solo_mejorar, mejorar_sobre_una_persona=mejorar_sobre_una_persona,
            )
            if razon is not None:
                return _fila_estado(slug, fila, movido=False, de=antes, razon=razon)
            if ensayo:
                reg.rollback()  # suelta el FOR UPDATE: no se escribió nada
                return {
                    "slug": slug, "estado": nuevo, "motivo": texto,
                    "cambiado_en": None, "cambiado_por": actor,
                    "movido": True, "de": antes, "razon": None, "ensayo": True,
                }

            ahora = datetime.now(timezone.utc)
            if fila is None:
                fila = EstadoCliente(slug=slug, estado=nuevo, motivo=texto, cambiado_en=ahora, cambiado_por=actor)
                reg.add(fila)
            else:
                fila.estado = nuevo
                fila.motivo = texto
                fila.cambiado_en = ahora
                fila.cambiado_por = actor
            reg.add(CambioEstadoCuenta(
                cliente_slug=slug,
                suscripcion_id=sus.id if sus is not None else None,
                de=antes, a=nuevo, motivo=texto, actor=actor, en=ahora,
            ))
            try:
                reg.commit()
            except IntegrityError:
                reg.rollback()
                if intento == 2:
                    raise
                continue
            resultado = _fila_estado(slug, fila, movido=True, de=antes, razon=None)
            break
        finally:
            reg.close()

    _olvidar_caches(slug)
    return resultado


def levantar_si_corresponde(slug: str, *, de_la_suscripcion: int | None = None, hoy: date | None = None) -> dict:
    """Después de un pago, si la operadora lo pidió: el estado baja a lo que
    corresponde —``activo`` si quedó al día— y nunca sube. Lo firma
    ``sistema:cobranza``, de modo que la escalera de C2 lo reconozca como suyo."""
    return mover_estado(
        slug, EL_QUE_CORRESPONDE, None, ACTOR_SISTEMA,
        solo_mejorar=True, mejorar_sobre_una_persona=True,
        de_la_suscripcion=de_la_suscripcion, hoy=hoy,
    )


# ════════════════════════════════════════════════════════════════════════════
# La cartera: lo que la consola lee y escribe
# ════════════════════════════════════════════════════════════════════════════

def _texto(valor, largo: int, nombre: str) -> str | None:
    """Un texto opcional: sin espacios de más, vacío = ``None``, con tope."""
    if valor is None:
        return None
    limpio = " ".join(str(valor).split())
    if not limpio:
        return None
    if len(limpio) > largo:
        raise DatoInvalido(f"{nombre} puede tener hasta {largo} caracteres.")
    return limpio


def _entero(valor, minimo: int, maximo: int, nombre: str) -> int:
    if valor is None or isinstance(valor, bool):
        raise DatoInvalido(f"Falta {nombre}.")
    try:
        n = int(valor)
    except (TypeError, ValueError) as e:
        raise DatoInvalido(f"{nombre} tiene que ser un número entero.") from e
    if n != valor:
        raise DatoInvalido(f"{nombre} tiene que ser un número entero.")
    if not (minimo <= n <= maximo):
        raise DatoInvalido(f"{nombre} va de {_miles(minimo)} a {_miles(maximo)}.")
    return n


def _datos_de_facturacion(datos: dict) -> dict:
    """Razón social, NIT, correo de facturación y municipio, limpios. Los
    valida igual la operadora (la suscripción entera) que la dueña del
    supermercado (sólo esto, desde Configuración → Suscripción)."""
    correo = _texto(datos.get("correo_facturacion"), 254, "El correo de facturación")
    if correo is not None and (" " in correo or not re.fullmatch(r"[^@]+@[^@]+\.[^@]+", correo)):
        raise DatoInvalido("El correo de facturación no parece un correo.")
    return {
        "razon_social": _texto(datos.get("razon_social"), 200, "La razón social"),
        "nit": _texto(datos.get("nit"), 40, "El NIT"),
        "correo_facturacion": correo,
        "municipio": _texto(datos.get("municipio"), 100, "El municipio"),
    }


def _porcentaje(valor, nombre: str) -> float:
    try:
        x = float(valor or 0)
    except (TypeError, ValueError) as e:
        raise DatoInvalido(f"{nombre} tiene que ser un número.") from e
    if not (0 <= x <= 100):
        raise DatoInvalido(f"{nombre} va de 0 a 100.")
    return round(x, 4)


def _suscripcion_dict(s) -> dict:
    return {
        "id": s.id,
        "modo": s.modo,
        "valor_cop": s.valor_cop,
        "unidad": s.unidad,
        "cantidad": s.cantidad,
        "periodicidad_meses": s.periodicidad_meses,
        "plazo_pago_dias": s.plazo_pago_dias,
        "dia_solo_lectura": s.dia_solo_lectura,
        "prorroga_hasta": s.prorroga_hasta,
        "contrato_ref": s.contrato_ref,
        "razon_social": s.razon_social,
        "nit": s.nit,
        "correo_facturacion": s.correo_facturacion,
        "municipio": s.municipio,
        "retefuente_pct": s.retefuente_pct,
        "reteica_pct": s.reteica_pct,
        "reteiva_pct": s.reteiva_pct,
        "actualizado_por": s.actualizado_por,
        "actualizado_en": s.actualizado_en,
    }


def _pago_dict(p) -> dict:
    return {
        "id": p.id,
        "medio": p.medio,
        "valor_recibido_cop": p.valor_recibido_cop,
        "retefuente_cop": p.retefuente_cop,
        "reteica_cop": p.reteica_cop,
        "reteiva_cop": p.reteiva_cop,
        "certificado_recibido": p.certificado_recibido,
        "ref_externa": p.ref_externa,
        "estado": p.estado,
        "recibido_el": p.recibido_el,
        "registrado_por": p.registrado_por,
    }


def _factura_dict(f, pagos, hoy: date) -> dict:
    cubierto = abonado(pagos)
    vencida = esta_vencida(f, hoy)
    return {
        "id": f.id,
        "numero": f.numero,
        "cufe": f.cufe,
        "periodo": f.periodo,
        "emitida_el": f.emitida_el,
        "vence_el": f.vence_el,
        "subtotal_cop": f.subtotal_cop,
        "iva_cop": f.iva_cop,
        "total_cop": f.total_cop,
        "retenciones_estimadas_cop": f.retenciones_estimadas_cop,
        "neto_esperado_cop": f.neto_esperado_cop,
        "estado": f.estado,
        "en_disputa": bool(f.en_disputa),
        "motivo_disputa": f.motivo_disputa,
        "motivo_anulacion": f.motivo_anulacion,
        "pagada_el": f.pagada_el,
        "abonado_cop": cubierto,
        # Lo que falta: sólo una factura emitida debe algo.
        "saldo_cop": max(f.total_cop - cubierto, 0) if f.estado == "emitida" else 0,
        "vencida": vencida,
        "dias_atraso": (hoy - f.vence_el).days if vencida else None,
        "pagos": [_pago_dict(p) for p in sorted(pagos, key=lambda p: (p.recibido_el, p.id))],
    }


def cartera(hoy: date | None = None) -> dict:
    """Una fila por cliente del registro (activos y archivados): su estado de
    cuenta, y si tiene suscripción, sus facturas, cuánto debe, cuántos días de
    atraso y qué estado le correspondería. Un cliente sin suscripción sale
    ``exento``, sin deuda y sin facturas: no es «al día», es «fuera»."""
    from app.clientes import es_el_de_siempre, sesion_registro
    from app.models.cobro import FacturaCobro, PagoCobro, Suscripcion
    from app.models.models import ClienteRow
    from app.models.plataforma import EstadoCliente

    dia = hoy or hoy_en_colombia()
    reg = sesion_registro()
    try:
        clientes = reg.query(ClienteRow).order_by(ClienteRow.slug).all()
        estados = {e.slug: e for e in reg.query(EstadoCliente).all()}
        suscripciones = {s.cliente_slug: s for s in reg.query(Suscripcion).all()}
        ids = [s.id for s in suscripciones.values()]
        facturas_por_sus: dict[int, list] = {i: [] for i in ids}
        pagos_por_factura: dict[int, list] = {}
        if ids:
            facturas = reg.query(FacturaCobro).filter(FacturaCobro.suscripcion_id.in_(ids)).all()
            for f in facturas:
                facturas_por_sus[f.suscripcion_id].append(f)
                pagos_por_factura[f.id] = []
            if facturas:
                for p in reg.query(PagoCobro).filter(PagoCobro.factura_id.in_([f.id for f in facturas])).all():
                    pagos_por_factura[p.factura_id].append(p)

        filas = []
        for c in clientes:
            e = estados.get(c.slug)
            s = suscripciones.get(c.slug)
            fila = {
                "slug": c.slug,
                "nombre": c.nombre,
                "activo": c.activo,
                "base_principal": es_el_de_siempre(c),
                "estado": e.estado if e is not None else "activo",
                "cambiado_por": e.cambiado_por if e is not None else None,
                "exento": s is None,
                "suscripcion": None,
                "estado_correspondiente": None,
                "dias_atraso": None,
                "saldo_pendiente_cop": None,
                "proxima_factura": None,
                "ultimo_pago": None,
                "facturas": [],
            }
            if s is not None:
                propias = facturas_por_sus.get(s.id, [])
                dicts = {f.id: _factura_dict(f, pagos_por_factura.get(f.id, []), dia) for f in propias}
                impagas = sorted(
                    (f for f in propias if f.estado == "emitida"),
                    key=lambda f: (f.vence_el, f.id),
                )
                pagos = [
                    (p, f) for f in propias for p in pagos_por_factura.get(f.id, []) if p.estado == "aprobado"
                ]
                ultimo = max(pagos, key=lambda pf: (pf[0].recibido_el, pf[0].id), default=None)
                fila.update({
                    "suscripcion": _suscripcion_dict(s),
                    "estado_correspondiente": estado_objetivo(s, propias, dia),
                    "dias_atraso": dias_de_atraso(propias, dia),
                    "saldo_pendiente_cop": sum(dicts[f.id]["saldo_cop"] for f in impagas),
                    "proxima_factura": dicts[impagas[0].id] if impagas else None,
                    "ultimo_pago": (
                        {**_pago_dict(ultimo[0]), "factura_id": ultimo[1].id, "factura_numero": ultimo[1].numero}
                        if ultimo is not None else None
                    ),
                    "facturas": [
                        dicts[f.id]
                        for f in sorted(propias, key=lambda f: (f.emitida_el or f.vence_el, f.id), reverse=True)
                    ],
                })
            filas.append(fila)
    finally:
        reg.close()
    from app.services.cobranza_automatica import automatica_prendida

    # Si la escalera aplica lo que «correspondería» o sólo lo ensaya: la consola
    # lo dice al lado de cada diferencia, para que no se lea como una promesa.
    return {"hoy": dia, "cobranza_automatica": automatica_prendida(), "clientes": filas}


def guardar_suscripcion(slug: str, datos: dict, actor: str) -> dict:
    """Crea o reemplaza la suscripción de un cliente. Todo el cuerpo manda: lo
    que no viene vuelve a su valor por defecto, como en un PUT.

    Pasar a automático exige ``contrato_ref`` (422): es la base para restringir
    una cuenta, y sin ella la escalera no tiene de dónde agarrarse. El cliente
    de la base principal no pasa nunca a automático (409): la dueña lo dejó
    fuera de la cobranza automática."""
    from app.clientes import es_el_de_siempre, sesion_registro
    from app.models.cobro import MODOS_COBRO, UNIDADES_COBRO, Suscripcion
    from app.models.models import ClienteRow

    modo = (datos.get("modo") or "manual").strip().lower()
    if modo not in MODOS_COBRO:
        raise DatoInvalido(f"Modo inválido: debe ser uno de {', '.join(MODOS_COBRO)}.")
    unidad = (datos.get("unidad") or "supermercado_mes").strip().lower()
    if unidad not in UNIDADES_COBRO:
        raise DatoInvalido(f"Unidad inválida: debe ser una de {', '.join(UNIDADES_COBRO)}.")
    facturacion = _datos_de_facturacion(datos)
    limpio = {
        "modo": modo,
        "valor_cop": _entero(datos.get("valor_cop"), 1, 1_000_000_000, "El valor pactado"),
        "unidad": unidad,
        "cantidad": _entero(datos.get("cantidad", 1), 1, 10_000, "La cantidad"),
        "periodicidad_meses": _entero(datos.get("periodicidad_meses", 1), 1, 12, "La periodicidad"),
        "plazo_pago_dias": _entero(datos.get("plazo_pago_dias", 30), 0, 180, "El plazo de pago"),
        "dia_solo_lectura": _entero(datos.get("dia_solo_lectura", 30), 1, 365, "El día de sólo lectura"),
        "prorroga_hasta": datos.get("prorroga_hasta"),
        "contrato_ref": _texto(datos.get("contrato_ref"), 200, "La referencia del contrato"),
        **facturacion,
        "retefuente_pct": _porcentaje(datos.get("retefuente_pct"), "La retefuente"),
        "reteica_pct": _porcentaje(datos.get("reteica_pct"), "La reteICA"),
        "reteiva_pct": _porcentaje(datos.get("reteiva_pct"), "La reteIVA"),
    }
    if modo == "automatico" and not limpio["contrato_ref"]:
        raise DatoInvalido(
            "El modo automático necesita la referencia del contrato firmado o de los términos "
            "aceptados: sin eso no hay base para restringir la cuenta de nadie."
        )

    slug = (slug or "").strip().lower()
    reg = sesion_registro()
    try:
        cliente = reg.query(ClienteRow).filter(ClienteRow.slug == slug).first()
        if cliente is None:
            raise NoEncontrado(CLIENTE_DESCONOCIDO)
        if modo == "automatico" and es_el_de_siempre(cliente):
            raise Conflicto(
                "El cliente de la base principal queda fuera de la cobranza automática: "
                "su suscripción puede ser manual, nunca automática."
            )
        ahora = datetime.now(timezone.utc)
        sus = reg.query(Suscripcion).filter(Suscripcion.cliente_slug == slug).first()
        if sus is None:
            sus = Suscripcion(cliente_slug=slug, creado_por=actor, creado_en=ahora)
            reg.add(sus)
        for campo, valor in limpio.items():
            setattr(sus, campo, valor)
        sus.actualizado_por = actor
        sus.actualizado_en = ahora
        try:
            reg.commit()
        except IntegrityError as e:
            reg.rollback()
            raise Conflicto(
                "Alguien acaba de cargar la suscripción de este cliente: recargá la cartera y volvé a intentar."
            ) from e
        return _suscripcion_dict(sus)
    finally:
        reg.close()


def emitir_factura(slug: str, datos: dict, actor: str, *, hoy: date | None = None) -> dict:
    """Registra una cuenta de cobro (o factura) ya emitida fuera de RECABRA.

    El subtotal, si no viene, es lo pactado por los meses del período; el
    vencimiento, si no viene, es la emisión más el plazo de pago. Las
    retenciones estimadas y el neto salen de los porcentajes de la suscripción.
    Nombre y NIT se COPIAN a la factura: es la constancia de a quién se le cobró.
    """
    from app.clientes import sesion_registro
    from app.models.cobro import FacturaCobro, Suscripcion
    from app.models.models import ClienteRow

    dia = hoy or hoy_en_colombia()
    periodo = (datos.get("periodo") or "").strip()
    meses = meses_del_periodo(periodo)
    numero = _texto(datos.get("numero"), 40, "El número")
    if numero is None:
        raise DatoInvalido("El número de la cuenta de cobro es obligatorio.")
    cufe = _texto(datos.get("cufe"), 200, "El CUFE")
    emitida_el = datos.get("emitida_el") or dia
    iva = _entero(datos.get("iva_cop") or 0, 0, 1_000_000_000, "El IVA")

    slug = (slug or "").strip().lower()
    reg = sesion_registro()
    try:
        cliente = reg.query(ClienteRow).filter(ClienteRow.slug == slug).first()
        if cliente is None:
            raise NoEncontrado(CLIENTE_DESCONOCIDO)
        sus = reg.query(Suscripcion).filter(Suscripcion.cliente_slug == slug).first()
        if sus is None:
            raise Conflicto(
                "Este cliente no tiene suscripción: está exento de la cobranza. "
                "Cargá su suscripción antes de emitirle una cuenta de cobro."
            )
        if datos.get("subtotal_cop") is None:
            subtotal = sus.valor_cop * sus.cantidad * meses
        else:
            subtotal = _entero(datos.get("subtotal_cop"), 0, 10_000_000_000, "El subtotal")
        total = subtotal + iva
        if total <= 0:
            raise DatoInvalido("Una cuenta de cobro por cero pesos no se registra.")
        vence_el = datos.get("vence_el") or (emitida_el + timedelta(days=sus.plazo_pago_dias))
        if vence_el < emitida_el:
            raise DatoInvalido("La cuenta de cobro no puede vencer antes de emitirse.")

        viva = (
            reg.query(FacturaCobro)
            .filter(
                FacturaCobro.suscripcion_id == sus.id,
                FacturaCobro.periodo == periodo,
                FacturaCobro.estado != "anulada",
            )
            .first()
        )
        if viva is not None:
            raise Conflicto(
                f"Ya hay una cuenta de cobro de {periodo} para este cliente ({viva.numero}). "
                "Si salió mal, anulala primero."
            )
        if reg.query(FacturaCobro.id).filter(FacturaCobro.numero == numero).first() is not None:
            raise Conflicto(f"El número {numero} ya está usado: los números no se repiten, ni los de una anulada.")

        retenciones = retenciones_estimadas(sus, subtotal, iva)
        ahora = datetime.now(timezone.utc)
        factura = FacturaCobro(
            suscripcion_id=sus.id,
            cliente_slug=slug,
            cliente_nombre=sus.razon_social or cliente.nombre,
            nit=sus.nit,
            periodo=periodo,
            numero=numero,
            cufe=cufe,
            emitida_el=emitida_el,
            vence_el=vence_el,
            subtotal_cop=subtotal,
            iva_cop=iva,
            total_cop=total,
            retenciones_estimadas_cop=retenciones,
            neto_esperado_cop=total - retenciones,
            estado="emitida",
            en_disputa=False,
            creado_por=actor,
            creado_en=ahora,
            actualizado_por=actor,
            actualizado_en=ahora,
        )
        reg.add(factura)
        try:
            reg.commit()
        except IntegrityError as e:
            reg.rollback()
            raise Conflicto(
                "Otra cuenta de cobro con ese período o ese número acaba de registrarse: recargá la cartera."
            ) from e
        return _factura_dict(factura, [], dia)
    finally:
        reg.close()


def registrar_pago(factura_id: int, datos: dict, actor: str, *, hoy: date | None = None) -> dict:
    """Un pago manual contra UNA factura: lo recibido, lo que el supermercado
    retuvo y la referencia del banco (obligatoria, y repetible: la misma
    transferencia puede pagar varias cuentas de cobro, una parte en cada una).

    Si con esto la factura queda saldada, pasa a ``pagada``. Y si la operadora
    marcó ``levantar_estado``, el estado de cuenta baja a lo que corresponde
    —``activo`` si quedó al día— firmado por ``sistema:cobranza``; si no, el
    estado no se toca.
    """
    from app.clientes import sesion_registro
    from app.models.cobro import MEDIOS_PAGO, FacturaCobro, PagoCobro

    dia = hoy or hoy_en_colombia()
    medio = (datos.get("medio") or "transferencia").strip().lower()
    if medio not in MEDIOS_PAGO:
        raise DatoInvalido(f"Medio inválido: debe ser uno de {', '.join(MEDIOS_PAGO)}.")
    recibido = _entero(datos.get("valor_recibido_cop"), 0, 10_000_000_000, "El valor recibido")
    retefuente = _entero(datos.get("retefuente_cop") or 0, 0, 10_000_000_000, "La retefuente")
    reteica = _entero(datos.get("reteica_cop") or 0, 0, 10_000_000_000, "La reteICA")
    reteiva = _entero(datos.get("reteiva_cop") or 0, 0, 10_000_000_000, "La reteIVA")
    if recibido + retefuente + reteica + reteiva <= 0:
        raise DatoInvalido("Un pago por cero pesos no se registra.")
    ref = _texto(datos.get("ref_externa"), 120, "La referencia")
    if ref is None:
        raise DatoInvalido("La referencia del pago es obligatoria (la del banco, o la del recibo).")
    recibido_el = datos.get("recibido_el") or dia
    if recibido_el > dia:
        raise DatoInvalido("Un pago no se registra con fecha futura.")

    reg = sesion_registro()
    try:
        factura = reg.query(FacturaCobro).filter(FacturaCobro.id == factura_id).with_for_update().first()
        if factura is None:
            raise NoEncontrado(FACTURA_DESCONOCIDA)
        if factura.estado != "emitida":
            raise Conflicto(f"Esta cuenta de cobro está {factura.estado}: no recibe pagos.")
        previos = reg.query(PagoCobro).filter(PagoCobro.factura_id == factura.id).all()
        falta = factura.total_cop - abonado(previos)
        if recibido + retefuente + reteica + reteiva > falta + TOLERANCIA_COP:
            raise Conflicto(
                f"El pago supera lo que falta de esta cuenta de cobro ({_miles(falta)} pesos). Si la "
                "transferencia pagó varias, registrá en cada una la parte que le toca, con la misma "
                "referencia."
            )
        pago = PagoCobro(
            factura_id=factura.id,
            medio=medio,
            valor_recibido_cop=recibido,
            retefuente_cop=retefuente,
            reteica_cop=reteica,
            reteiva_cop=reteiva,
            certificado_recibido=bool(datos.get("certificado_recibido")),
            ref_externa=ref,
            estado="aprobado",
            recibido_el=recibido_el,
            registrado_por=actor,
            creado_en=datetime.now(timezone.utc),
        )
        reg.add(pago)
        pagos = previos + [pago]
        if factura_saldada(factura, pagos):
            factura.estado = "pagada"
            factura.pagada_el = max(p.recibido_el for p in pagos if p.estado == "aprobado")
        factura.actualizado_por = actor
        factura.actualizado_en = datetime.now(timezone.utc)
        reg.commit()
        slug, suscripcion_id = factura.cliente_slug, factura.suscripcion_id
        resultado = {"factura": _factura_dict(factura, pagos, dia), "pago": _pago_dict(pago), "estado_cuenta": None}
    finally:
        reg.close()

    if datos.get("levantar_estado"):
        try:
            resultado["estado_cuenta"] = levantar_si_corresponde(
                slug, de_la_suscripcion=suscripcion_id, hoy=dia,
            )
        except NoEncontrado:
            # El cliente de esta factura ya no existe (se borró y la factura
            # quedó de constancia): no hay estado que levantar.
            resultado["estado_cuenta"] = {"movido": False, "razon": "sin_cliente"}
    return resultado


def _factura_para_cambiar(reg, factura_id: int):
    from app.models.cobro import FacturaCobro

    factura = reg.query(FacturaCobro).filter(FacturaCobro.id == factura_id).with_for_update().first()
    if factura is None:
        raise NoEncontrado(FACTURA_DESCONOCIDA)
    return factura


def _pagos_de(reg, factura_id: int) -> list:
    from app.models.cobro import PagoCobro

    return reg.query(PagoCobro).filter(PagoCobro.factura_id == factura_id).all()


def anular_factura(factura_id: int, motivo: str, actor: str, *, hoy: date | None = None) -> dict:
    """Una cuenta de cobro que salió mal se anula, con motivo. No se borra: el
    número queda usado. Una con pagos no se anula (habría que devolver plata)."""
    from app.clientes import sesion_registro

    motivo = _texto(motivo, 300, "El motivo")
    if motivo is None:
        raise DatoInvalido("El motivo es obligatorio.")
    reg = sesion_registro()
    try:
        factura = _factura_para_cambiar(reg, factura_id)
        if factura.estado == "anulada":
            raise Conflicto("Esta cuenta de cobro ya está anulada.")
        pagos = _pagos_de(reg, factura.id)
        if factura.estado == "pagada" or abonado(pagos) > 0:
            raise Conflicto("Esta cuenta de cobro tiene pagos registrados: no se anula.")
        factura.estado = "anulada"
        factura.motivo_anulacion = motivo
        factura.actualizado_por = actor
        factura.actualizado_en = datetime.now(timezone.utc)
        reg.commit()
        return _factura_dict(factura, pagos, hoy or hoy_en_colombia())
    finally:
        reg.close()


def marcar_disputa(factura_id: int, en_disputa: bool, motivo: str, actor: str, *, hoy: date | None = None) -> dict:
    """Pone o saca la marca de disputa, con motivo. Una factura en disputa no
    cuenta para el atraso: no se le corre la escalera a lo que se discute."""
    from app.clientes import sesion_registro

    motivo = _texto(motivo, 300, "El motivo")
    if motivo is None:
        raise DatoInvalido("El motivo es obligatorio.")
    reg = sesion_registro()
    try:
        factura = _factura_para_cambiar(reg, factura_id)
        if factura.estado != "emitida":
            raise Conflicto(f"Esta cuenta de cobro está {factura.estado}: sólo una emitida se discute.")
        factura.en_disputa = bool(en_disputa)
        factura.motivo_disputa = motivo
        factura.actualizado_por = actor
        factura.actualizado_en = datetime.now(timezone.utc)
        reg.commit()
        return _factura_dict(factura, _pagos_de(reg, factura.id), hoy or hoy_en_colombia())
    finally:
        reg.close()


def olvidar_cliente(reg, slug: str) -> None:
    """Lo que se va con un cliente borrado, en la transacción del borrado: su
    suscripción y su historial de estados SIN suscripción (que colgaría del slug
    y lo heredaría quien lo funde de nuevo). Las facturas, los pagos y el
    historial atado a la suscripción se quedan: son constancia contable, y como
    cuelgan de un id de suscripción que no se vuelve a usar, nadie los hereda."""
    from app.models.cobro import CambioEstadoCuenta, Suscripcion

    reg.query(Suscripcion).filter(Suscripcion.cliente_slug == slug).delete(synchronize_session=False)
    reg.query(CambioEstadoCuenta).filter(
        CambioEstadoCuenta.cliente_slug == slug,
        CambioEstadoCuenta.suscripcion_id.is_(None),
    ).delete(synchronize_session=False)


# ════════════════════════════════════════════════════════════════════════════
# Lo que ve la dueña del supermercado (C2)
# ════════════════════════════════════════════════════════════════════════════
#
# Su sección «Suscripción» de Configuración, y lo que BloqueoCuenta le muestra
# tras un clic cuando la cuenta está suspendida. Sólo la dueña: el router lo
# pide con `require_owner` (la membresía `owner`, no el rol del token). Su gente
# (admin no dueña, worker, mercaderista) no ve un monto jamás.
#
# Es lo mismo que la cartera de la consola, recortado a UN cliente y sin lo que
# es de RECABRA: ni quién de RECABRA registró qué (correos de la operadora), ni
# las notas de anulación o de disputa, ni la referencia del contrato.

#: Cuántas cuentas de cobro, pagos y cambios de estado ve la dueña: un año.
HISTORIAL_DE_LA_DUENA = 12


def _quien_para_la_duena(actor: str | None) -> str:
    """El actor de un cambio de estado, dicho para la dueña del supermercado:
    el correo de la operadora no es suyo."""
    return "automático" if es_del_sistema(actor) else "RECABRA"


def _factura_para_la_duena(f, pagos, hoy: date) -> dict:
    completo = _factura_dict(f, pagos, hoy)
    return {
        clave: completo[clave]
        for clave in (
            "id", "numero", "periodo", "emitida_el", "vence_el", "subtotal_cop", "iva_cop",
            "total_cop", "retenciones_estimadas_cop", "neto_esperado_cop", "estado", "en_disputa",
            "pagada_el", "abonado_cop", "saldo_cop", "vencida", "dias_atraso",
        )
    } | {"electronica": bool(f.cufe)}


def mi_suscripcion(slug: str, *, hoy: date | None = None) -> dict:
    """Todo lo que la dueña de ``slug`` necesita para saber qué debe y pagarlo.

    · ``estado``: el de su cuenta, con el motivo (es la dueña: le corresponde).
    · ``suscripcion``: lo pactado y sus datos de facturación (``None`` si el
      cliente no tiene suscripción: está exento, no hay nada que pagar).
    · ``proxima_factura``: la impaga que vence primero, con total, retenciones
      estimadas y neto; y, si su cobro es automático, desde qué día la cuenta
      pasaría a sólo lectura si sigue impaga.
    · ``facturas``, ``pagos`` y ``cambios``: el último año.
    · ``instrucciones_transferencia``: el texto de
      ``COBRO_INSTRUCCIONES_TRANSFERENCIA`` (los datos bancarios viven en el
      entorno, nunca en el repo), o ``None`` si no está configurado.
    """
    from sqlalchemy import or_

    from app.clientes import sesion_registro
    from app.models.cobro import CambioEstadoCuenta, FacturaCobro, PagoCobro, Suscripcion
    from app.models.plataforma import EstadoCliente
    from app.services.cobranza_automatica import fecha_de_solo_lectura, instrucciones_de_transferencia

    dia = hoy or hoy_en_colombia()
    slug = (slug or "").strip().lower()
    reg = sesion_registro()
    try:
        fila = reg.query(EstadoCliente).filter(EstadoCliente.slug == slug).first()
        sus = reg.query(Suscripcion).filter(Suscripcion.cliente_slug == slug).first()
        facturas, pagos_por_factura = [], {}
        if sus is not None:
            facturas = reg.query(FacturaCobro).filter(FacturaCobro.suscripcion_id == sus.id).all()
            pagos_por_factura = {f.id: [] for f in facturas}
            if facturas:
                for p in reg.query(PagoCobro).filter(PagoCobro.factura_id.in_(list(pagos_por_factura))).all():
                    pagos_por_factura[p.factura_id].append(p)
        # Su historia: la de esta suscripción, más los cambios de antes de que
        # tuviera una (esos cuelgan del slug). Los de una suscripción ajena —la
        # de un cliente borrado que tenía este mismo slug— no son suyos.
        condicion = CambioEstadoCuenta.suscripcion_id.is_(None) & (CambioEstadoCuenta.cliente_slug == slug)
        if sus is not None:
            condicion = or_(condicion, CambioEstadoCuenta.suscripcion_id == sus.id)
        cambios = (
            reg.query(CambioEstadoCuenta).filter(condicion)
            .order_by(CambioEstadoCuenta.en.desc(), CambioEstadoCuenta.id.desc())
            .limit(HISTORIAL_DE_LA_DUENA * 2).all()
        )

        estado = {
            "estado": fila.estado if fila is not None else "activo",
            "motivo": fila.motivo if fila is not None and fila.estado != "activo" else None,
            "cambiado_en": fila.cambiado_en if fila is not None else None,
        }
        cuerpo = {
            "hoy": dia,
            "estado": estado,
            "suscripcion": None,
            "proxima_factura": None,
            "facturas": [],
            "pagos": [],
            "cambios": [
                {"en": c.en, "de": c.de, "a": c.a, "motivo": c.motivo, "por": _quien_para_la_duena(c.actor)}
                for c in cambios
            ],
            "instrucciones_transferencia": instrucciones_de_transferencia(),
        }
        if sus is None:
            return cuerpo

        cuerpo["suscripcion"] = {
            clave: getattr(sus, clave)
            for clave in (
                "modo", "valor_cop", "unidad", "cantidad", "periodicidad_meses", "plazo_pago_dias",
                "dia_solo_lectura", "prorroga_hasta", "razon_social", "nit", "correo_facturacion",
                "municipio", "retefuente_pct", "reteica_pct", "reteiva_pct",
            )
        }
        recientes = sorted(facturas, key=lambda f: (f.emitida_el or f.vence_el, f.id), reverse=True)
        cuerpo["facturas"] = [
            _factura_para_la_duena(f, pagos_por_factura[f.id], dia) for f in recientes[:HISTORIAL_DE_LA_DUENA]
        ]
        impagas = sorted((f for f in facturas if f.estado == "emitida"), key=lambda f: (f.vence_el, f.id))
        if impagas:
            proxima = _factura_para_la_duena(impagas[0], pagos_por_factura[impagas[0].id], dia)
            proxima["solo_lectura_desde"] = (
                fecha_de_solo_lectura(sus, impagas[0])
                if sus.modo == "automatico" and not impagas[0].en_disputa else None
            )
            cuerpo["proxima_factura"] = proxima
        numeros = {f.id: f.numero for f in facturas}
        pagos = sorted(
            (p for lista in pagos_por_factura.values() for p in lista if p.estado == "aprobado"),
            key=lambda p: (p.recibido_el, p.id), reverse=True,
        )
        cuerpo["pagos"] = [
            {
                "recibido_el": p.recibido_el,
                "factura_numero": numeros.get(p.factura_id),
                "valor_recibido_cop": p.valor_recibido_cop,
                "retenciones_cop": (p.retefuente_cop or 0) + (p.reteica_cop or 0) + (p.reteiva_cop or 0),
                "certificado_recibido": bool(p.certificado_recibido),
                "ref_externa": p.ref_externa,
            }
            for p in pagos[: HISTORIAL_DE_LA_DUENA * 2]
        ]
        return cuerpo
    finally:
        reg.close()


def actualizar_facturacion(slug: str, datos: dict, actor: str) -> dict:
    """La dueña corrige sus datos de facturación: razón social, NIT, correo de
    facturación y municipio. Nada más de la suscripción —el precio, el plazo y
    la escalera son lo pactado con RECABRA—, y valen para las cuentas de cobro
    que se emitan desde ahora: las ya emitidas guardan la copia de su día.

    Sin suscripción no hay datos que guardar (409)."""
    from app.clientes import sesion_registro
    from app.models.cobro import Suscripcion

    limpio = _datos_de_facturacion(datos)
    slug = (slug or "").strip().lower()
    reg = sesion_registro()
    try:
        sus = reg.query(Suscripcion).filter(Suscripcion.cliente_slug == slug).with_for_update().first()
        if sus is None:
            raise Conflicto(
                "Este supermercado no tiene una suscripción registrada en RECABRA: "
                "no hay datos de facturación que guardar."
            )
        for campo, valor in limpio.items():
            setattr(sus, campo, valor)
        sus.actualizado_por = actor
        sus.actualizado_en = datetime.now(timezone.utc)
        reg.commit()
        return dict(limpio)
    finally:
        reg.close()
