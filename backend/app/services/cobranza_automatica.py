"""La escalera de cobranza, sola (C2): avisos por correo y sólo lectura a los
30 días de vencida la cuenta de cobro. **En ensayo por defecto.**

Corre desde ``main._run_lease_maintenance`` —al arrancar y cada 12 horas—, en
su propio bloque, y desde «Correr cobranza (ensayo)» de la consola
(``POST /api/plataforma/cobranza/correr``). Toca sólo el REGISTRO: lo que
RECABRA le cobra a un cliente no vive en la base de ese cliente.

── Lo que decidió la dueña (2026-10-13) y esto respeta ──────────────────────

· **Sólo suscripciones en modo automático de clientes activos.** Un cliente
  sin suscripción —Galerías y todo el que ya existía— o con suscripción manual
  no se mueve nunca, ni recibe un correo de acá. El de la base principal
  tampoco (el PUT de la suscripción ya le niega el modo automático; acá se
  vuelve a mirar). Un cliente archivado se saltea.
· **La escalera**, con ``d`` = días desde el vencimiento de la cuenta de cobro
  emitida, impaga y sin disputa más vieja (``cobranza.estado_objetivo``):
  ``d ≤ 0`` activo · ``1 ≤ d < dia_solo_lectura`` gracia ·
  ``d ≥ dia_solo_lectura`` sólo lectura. «Vencida» es ``vence_el < hoy`` con
  el hoy de Colombia: el día del vencimiento todavía está a tiempo. Con una
  prórroga vigente no pasa de gracia.
· **Sin aviso formal entregado no hay sólo lectura** (revisión de C2, hallazgo
  alto). El paso a sólo lectura exige que el correo ``aviso_solo_lectura`` de
  esa cuenta de cobro haya SALIDO hace ``DIAS_AVISO_SOLO_LECTURA`` días o más
  (su fila en ``avisos_cobro``, que sólo queda si el envío salió). Si no salió
  a tiempo —el interruptor se prendió con una deuda vieja, la cuenta de cobro
  se cargó tarde, el servicio estuvo dormido, el correo está caído o no hay a
  quién escribirle—, la cuenta se queda en gracia, el aviso sale apenas se
  pueda con la fecha corrida (hoy + 10) y el resumen del log lo dice. Antes,
  todos esos casos pasaban derecho a sólo lectura sin un solo aviso.
· **Nunca suspendido.** Suspender lo decide la operadora con el PATCH de
  siempre.
· **Al empeorar, nunca pisa a una persona**: un estado que no es «activo» y
  que puso alguien con nombre y apellido (``cambiado_por`` que no empieza con
  ``sistema:``) queda como está, para arriba y para abajo. Al ponerse al día,
  la escalera devuelve a activo sólo lo que puso ella misma. Las dos reglas
  viven en ``cobranza.mover_estado``, el único camino que escribe el estado, y
  esto lo llama con ``actor = sistema:cobranza``: el cálculo y la escritura
  van en la misma transacción.
· **Los motivos que escribe no llevan montos** (``cobranza.motivo_del_sistema``):
  la franja de «pago pendiente» se ve en Vender, delante de proveedores.

── Los correos ───────────────────────────────────────────────────────────────

A las cuentas con membresía ACTIVA de dueña (``owner``) del supermercado y al
correo de facturación de la suscripción. A nadie más: ni a su gente (admin no
dueña, worker), ni a la libreta de contactos por sede, que puede tener gente
de piso. Ellas sí ven plata, así que el correo lleva número, total,
retenciones estimadas, neto y vencimiento, y los datos para transferir de
``COBRO_INSTRUCCIONES_TRANSFERENCIA``.

Un hito por cuenta de cobro, una sola vez (``avisos_cobro``, UNIQUE por
factura y hito):

====================  ========================================================
``por_vencer``        desde 5 días antes del vencimiento hasta el día mismo
``vencida``           desde el día siguiente al vencimiento (``d = 1``)
``mas_7``             desde ``d = 8``
``aviso_solo_lectura``10 días antes del día de sólo lectura, o apenas se
                      pueda si ya pasó esa fecha (y entonces el corte se corre)
``solo_lectura``      el día que la cuenta queda de verdad en sólo lectura,
                      una vez por corte (no uno por cada cuenta de cobro)
``pago_recibido``     la constancia, cuando la cuenta de cobro queda pagada
====================  ========================================================

**Con el servicio dormido se pone al día sin duplicar**: en cada pasada se
manda sólo el hito que le corresponde HOY a cada cuenta de cobro —la que
despierta 20 días tarde manda uno, no los tres atrasados— y nunca uno
anterior a otro que ya salió. ``aviso_solo_lectura`` y ``solo_lectura`` no
salen si un estado puesto por una persona frena la escalera (serían
mentira), ``solo_lectura`` sólo sale si la cuenta quedó de verdad así, y con la
cuenta YA en sólo lectura ningún correo anuncia un corte futuro.

Un correo por destinatario: el correo de facturación puede ser el de un
contador de afuera, y no tiene por qué ver el correo personal de las dueñas. Y
el correo de facturación que es de alguien de su gente (admin no dueña,
worker) no recibe nada: la plata es sólo para la dueña. Después de un abono,
el correo dice lo abonado y lo que falta, no el neto entero.

── El interruptor ────────────────────────────────────────────────────────────

``COBRANZA_AUTOMATICA``, apagado por defecto —el mismo patrón que
``LIMPIAR_FOTOS_VENCIDAS``—: apagado, la pasada sólo ENSAYA. Calcula todo con
el mismo código que lo real (``mover_estado(..., ensayo=True)``), no escribe un
estado ni manda un correo, y deja UNA línea WARNING de resumen con lo que
haría —también con «0 cambios»—: nadie configura el logging y uvicorn deja el
raíz en WARNING, así que un INFO no llega al log de Render, y una línea que
sólo saliera con algo para hacer se leería como «nada que hacer» justo antes
de prender el interruptor. Se prende en el panel de Render cuando la dueña lo
decida, después de mirar unos días el ensayo.
"""
from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from html import escape
from typing import Callable, Optional

from sqlalchemy.exc import IntegrityError

from app.fechas import hoy as hoy_en_colombia
from app.models.cobro import HITO_PAGO_RECIBIDO, HITOS_DE_ATRASO
# La fecha de sólo lectura y el aviso formal viven con `estado_objetivo`: la
# escalera y el estado tienen que contar igual.
from app.services.cobranza import (  # noqa: F401  (se re-exportan)
    DIAS_AVISO_SOLO_LECTURA,
    abonado,
    dia_del_aviso_formal,
    fecha_de_solo_lectura,
)

log = logging.getLogger("recabra.cobranza_automatica")

#: Prendido, la pasada mueve estados y manda correos; apagado (por defecto), ensaya.
INTERRUPTOR = "COBRANZA_AUTOMATICA"

#: El texto con los datos para transferir. Va en el entorno (``sync: false`` en
#: render.yaml): un dato bancario no se escribe en el repo.
VARIABLE_INSTRUCCIONES = "COBRO_INSTRUCCIONES_TRANSFERENCIA"

#: Desde cuántos días antes del vencimiento sale el recordatorio.
DIAS_POR_VENCER = 5
#: El atraso desde el que sale el segundo aviso.
DIA_MAS_7 = 8
#: Hasta cuántos días después de registrado el pago sale su constancia. Que no
#: salga para pagos viejos: prender el interruptor no puede mandar diez
#: «recibimos su pago» de cuentas de cobro saldadas hace meses.
DIAS_CONSTANCIA_DE_PAGO = 10

#: El código de la bitácora de la consola para «Correr cobranza».
ACCION_BITACORA = "cobranza"


def automatica_prendida() -> bool:
    """¿La pasada mueve estados y manda correos de verdad? Se lee en cada pasada."""
    return (os.getenv(INTERRUPTOR) or "").strip().lower() in ("1", "true", "si", "sí", "on")


def instrucciones_de_transferencia() -> Optional[str]:
    """Los datos para transferir, tal como los escribió la dueña en Render, o
    ``None`` si no están: la pantalla y el correo dicen entonces que se
    comuniquen con RECABRA."""
    texto = (os.getenv(VARIABLE_INSTRUCCIONES) or "").strip()
    return texto[:2000] or None


# ════════════════════════════════════════════════════════════════════════════
# Las cuentas puras
# ════════════════════════════════════════════════════════════════════════════

def hito_de_atraso(suscripcion, factura, hoy: date, avisada_el: Optional[date] = None) -> Optional[str]:
    """El correo que le corresponde HOY a una cuenta de cobro, o ``None``.
    PURA. Sólo una emitida y sin disputa tiene hito de atraso.

    ``avisada_el`` es el día en que salió su aviso formal (``None`` si no
    salió). Sin aviso, desde el día que le toca —diez antes de la fecha de
    sólo lectura— lo que corresponde es el aviso, por más atrasada que esté: el
    corte nunca llega sin él. Con aviso, nada hasta el corte, que es
    ``DIAS_AVISO_SOLO_LECTURA`` días después de que salió como mínimo."""
    if factura.estado != "emitida" or factura.en_disputa or factura.vence_el is None:
        return None
    atraso = (hoy - factura.vence_el).days
    if atraso < -DIAS_POR_VENCER:
        return None
    if atraso <= 0:
        return "por_vencer"
    if avisada_el is not None:
        return "solo_lectura" if hoy >= fecha_de_solo_lectura(suscripcion, factura, avisada_el) else None
    if hoy >= dia_del_aviso_formal(suscripcion, factura):
        return "aviso_solo_lectura"
    if atraso >= DIA_MAS_7:
        return "mas_7"
    return "vencida"


def _orden(hito: str) -> int:
    return HITOS_DE_ATRASO.index(hito)


def _como_utc(instante: Optional[datetime]) -> Optional[datetime]:
    """SQLite devuelve las marcas sin zona; son UTC (así se escriben)."""
    if instante is None:
        return None
    return instante if instante.tzinfo else instante.replace(tzinfo=timezone.utc)


# ════════════════════════════════════════════════════════════════════════════
# El plan: lo que se hizo, o lo que se haría
# ════════════════════════════════════════════════════════════════════════════

@dataclass
class Correo:
    factura_id: int
    numero: Optional[str]
    hito: str
    destinatarios: int
    #: ``True`` salió · ``False`` falló o no había a quién · ``None`` ensayo o
    #: ya lo había mandado otra pasada en el mismo instante.
    enviado: Optional[bool] = None
    nota: Optional[str] = None

    def como_dict(self) -> dict:
        return {
            "factura_id": self.factura_id, "factura": self.numero, "hito": self.hito,
            "destinatarios": self.destinatarios, "enviado": self.enviado, "nota": self.nota,
        }


@dataclass
class Paso:
    """Una suscripción automática en una pasada."""
    slug: str
    nombre: str
    suscripcion_id: int
    de: str
    a: str
    movido: bool
    razon: Optional[str]
    correos: list = field(default_factory=list)

    def como_dict(self) -> dict:
        return {
            "slug": self.slug, "nombre": self.nombre, "de": self.de, "a": self.a,
            "movido": self.movido, "razon": self.razon,
            "correos": [c.como_dict() for c in self.correos],
        }


@dataclass
class Plan:
    hoy: date
    ensayo: bool = True
    pasos: list = field(default_factory=list)
    errores: list = field(default_factory=list)

    @property
    def cambios(self) -> list:
        return [p for p in self.pasos if p.movido]

    @property
    def correos(self) -> list:
        return [(p, c) for p in self.pasos for c in p.correos]

    def resumen(self) -> str:
        """La línea del log. Sin montos ni correos: slugs, estados y hitos."""
        n = len(self.pasos)
        partes = [f"{n} {'suscripción automática' if n == 1 else 'suscripciones automáticas'}"]
        cambios = self.cambios
        if cambios:
            detalle = ", ".join(f"{p.slug} {p.de}→{p.a}" for p in cambios)
            partes.append(f"{len(cambios)} {'cambio' if len(cambios) == 1 else 'cambios'}: {detalle}")
        else:
            partes.append("0 cambios")
        correos = self.correos
        if self.ensayo:
            a_mandar = [(p, c) for p, c in correos if c.destinatarios > 0]
            partes.append(
                f"{len(a_mandar)} {'correo' if len(a_mandar) == 1 else 'correos'}"
                + (": " + ", ".join(f"{p.slug} {c.numero or c.factura_id} {c.hito}" for p, c in a_mandar)
                   if a_mandar else "")
            )
        else:
            salieron = [(p, c) for p, c in correos if c.enviado]
            partes.append(
                f"{len(salieron)} {'correo mandado' if len(salieron) == 1 else 'correos mandados'}"
                + (": " + ", ".join(f"{p.slug} {c.numero or c.factura_id} {c.hito}" for p, c in salieron)
                   if salieron else "")
            )
            fallidos = [c for _p, c in correos if c.enviado is False and c.destinatarios > 0]
            if fallidos:
                partes.append(f"{len(fallidos)} sin poder mandar (se reintentan)")
        sin_destino = [p.slug for p, c in correos if c.destinatarios == 0]
        if sin_destino:
            partes.append("sin a quién escribir: " + ", ".join(sorted(set(sin_destino))))
        # Sin el aviso formal entregado la cuenta no pasa a sólo lectura: que
        # el log lo diga, para que nadie lea «gracia» como «todavía no toca».
        sin_aviso = [p.slug for p, c in correos if c.hito == "aviso_solo_lectura" and c.enviado is False]
        if sin_aviso:
            partes.append(
                "sin aviso formal entregado (no pasa a sólo lectura hasta que salga): "
                + ", ".join(sorted(set(sin_aviso)))
            )
        frenados = [p.slug for p in self.pasos if p.razon == "lo_puso_una_persona"]
        if frenados:
            partes.append("sin tocar (lo puso una persona): " + ", ".join(frenados))
        if self.errores:
            partes.append("con error: " + ", ".join(self.errores))
        cabeza = (
            f"Cobranza automática, ENSAYO ({INTERRUPTOR} apagado), lo que haría"
            if self.ensayo else "Cobranza automática"
        )
        return f"{cabeza} el {self.hoy.isoformat()}: " + " · ".join(partes)

    def como_dict(self) -> dict:
        return {
            "hoy": self.hoy,
            "ensayo": self.ensayo,
            "interruptor": automatica_prendida(),
            "clientes": [p.como_dict() for p in self.pasos],
            "errores": list(self.errores),
            "resumen": self.resumen(),
        }


# ════════════════════════════════════════════════════════════════════════════
# La pasada
# ════════════════════════════════════════════════════════════════════════════

def _suscripciones_automaticas(solo: Optional[int] = None) -> list[tuple[int, str, str]]:
    """``(id, slug, nombre)`` de las suscripciones automáticas de clientes
    ACTIVOS, sin el de la base principal. NO usa ``clientes.listar()``: acá no
    se abre la base de nadie, todo sale del registro."""
    from app.clientes import es_el_de_siempre, sesion_registro
    from app.models.cobro import Suscripcion
    from app.models.models import ClienteRow

    reg = sesion_registro()
    try:
        consulta = (
            reg.query(Suscripcion, ClienteRow)
            .join(ClienteRow, ClienteRow.slug == Suscripcion.cliente_slug)
            .filter(Suscripcion.modo == "automatico", ClienteRow.activo.is_(True))
        )
        if solo is not None:
            consulta = consulta.filter(Suscripcion.id == solo)
        return [
            (s.id, s.cliente_slug, c.nombre)
            for s, c in consulta.order_by(Suscripcion.cliente_slug).all()
            if not es_el_de_siempre(c)
        ]
    finally:
        reg.close()


def destinatarios(reg, suscripcion) -> list[str]:
    """Las dueñas con membresía activa del supermercado y el correo de
    facturación. Nadie más.

    El correo de facturación lo escriben la operadora o la dueña, y nada impedía
    que fuera el de alguien de su gente: si es el de un miembro ACTIVO que no es
    dueña (admin, worker…), no se le manda —la plata es sólo para la dueña—, y
    la dueña lo recibe igual por su lado (revisión de C2)."""
    from app.models.identidad import Membresia, Usuario
    from app.services.mailer import clean_recipients

    miembros = (
        reg.query(Usuario.email, Membresia.rol)
        .join(Membresia, Membresia.usuario_id == Usuario.id)
        .filter(Membresia.cliente_slug == suscripcion.cliente_slug, Membresia.activo.is_(True))
        .all()
    )
    duenas = sorted(e for e, rol in miembros if e and rol == "owner")
    su_gente = {e.strip().lower() for e, rol in miembros if e and rol != "owner"}
    su_gente -= {d.strip().lower() for d in duenas}
    facturacion = suscripcion.correo_facturacion
    if facturacion and facturacion.strip().lower() in su_gente:
        facturacion = None
    return clean_recipients(duenas + [facturacion])


def correr(
    hoy: Optional[date] = None,
    *,
    ensayo: Optional[bool] = None,
    solo: Optional[int] = None,
    parar: Optional[Callable[[], bool]] = None,
) -> Plan:
    """Una pasada de la escalera. Devuelve el plan: lo hecho, o lo que se haría.

    ``ensayo=None`` hace lo que diga el interruptor; ``True`` nunca escribe ni
    manda; ``False`` aplica. ``hoy`` sirve para ensayar otro día («¿qué pasa el
    15-nov?»): con una fecha que no es hoy sólo se puede ensayar. Aplicar con el
    reloj adelantado le cortaría a alguien una cuenta que hoy está a tiempo, y
    con el reloj atrasado levantaría estados y mandaría avisos viejos.
    ``solo`` corre una sola suscripción (tras un pago). ``parar`` se mira entre
    suscripción y suscripción (el apagado de la app).
    """
    real = hoy_en_colombia()
    dia = hoy or real
    if ensayo is None:
        ensayo = not automatica_prendida()
    if not ensayo and dia != real:
        raise ValueError(
            f"Con una fecha que no es hoy ({dia.isoformat()}) sólo se puede ensayar: aplicarla le "
            "cortaría a alguien una cuenta que hoy está a tiempo, o le mandaría avisos viejos."
        )
    plan = Plan(hoy=dia, ensayo=ensayo)
    for suscripcion_id, slug, nombre in _suscripciones_automaticas(solo):
        if parar is not None and parar():
            break
        try:
            paso = _una(suscripcion_id, slug, nombre, dia, ensayo)
        except Exception:
            # Un cliente con algo roto no deja sin escalera a los demás.
            log.exception("La cobranza automática falló para el cliente %s", slug)
            plan.errores.append(slug)
            continue
        if paso is not None:
            plan.pasos.append(paso)
    return plan


def _una(suscripcion_id: int, slug: str, nombre: str, hoy: date, ensayo: bool) -> Optional[Paso]:
    from app.services import cobranza

    try:
        r = cobranza.mover_estado(
            slug, cobranza.EL_QUE_CORRESPONDE, None, cobranza.ACTOR_SISTEMA,
            de_la_suscripcion=suscripcion_id, hoy=hoy, ensayo=ensayo,
        )
    except cobranza.NoEncontrado:
        return None  # el cliente se borró entre la lista y acá
    if r["razon"] in ("exento", "otra_suscripcion"):
        return None  # la suscripción se fue (o es otra) en el medio
    paso = Paso(
        slug=slug, nombre=nombre, suscripcion_id=suscripcion_id,
        de=r["de"], a=r["estado"], movido=bool(r["movido"]), razon=r["razon"],
    )
    paso.correos = _avisos(suscripcion_id, r, hoy, ensayo)
    return paso


def _avisos(suscripcion_id: int, estado: dict, hoy: date, ensayo: bool) -> list[Correo]:
    """Los correos que le tocan hoy a esta suscripción, mandados (o no, en
    ensayo). ``estado`` es lo que devolvió ``mover_estado``: cómo quedó (o
    quedaría) la cuenta, y quién la dejó así."""
    from app.clientes import sesion_registro
    from app.models.cobro import AvisoCobro, FacturaCobro, PagoCobro, Suscripcion
    from app.models.models import ClienteRow
    from app.services.cobranza import avisos_formales, es_del_sistema

    reg = sesion_registro()
    try:
        sus = reg.get(Suscripcion, suscripcion_id)
        if sus is None or sus.modo != "automatico":
            return []
        cliente = reg.query(ClienteRow).filter(ClienteRow.slug == sus.cliente_slug).first()
        facturas = (
            reg.query(FacturaCobro).filter(FacturaCobro.suscripcion_id == sus.id)
            .order_by(FacturaCobro.vence_el, FacturaCobro.id).all()
        )
        ids = [f.id for f in facturas]
        ya: dict[int, set] = {i: set() for i in ids}
        pagos: dict[int, list] = {i: [] for i in ids}
        if ids:
            for a in reg.query(AvisoCobro).filter(AvisoCobro.factura_id.in_(ids)).all():
                ya[a.factura_id].add(a.hito)
            for p in reg.query(PagoCobro).filter(PagoCobro.factura_id.in_(ids)).all():
                pagos[p.factura_id].append(p)
        # Los mismos avisos formales con los que `mover_estado` decidió el estado.
        avisadas = avisos_formales(reg, sus, facturas, hoy)
        para = destinatarios(reg, sus)
        reg.expunge_all()  # se leen después de cerrar la sesión
    finally:
        reg.close()

    # Un estado que no es «activo» y que puso una persona frena la escalera:
    # avisar que la cuenta va a pasar a sólo lectura sería mentira.
    frenada = (
        bool(estado.get("cambiado_por")) and not es_del_sistema(estado["cambiado_por"])
        and estado["estado"] != "activo"
    )
    # Con la cuenta YA en sólo lectura, ningún correo anuncia un corte que ya
    # pasó, y el corte se avisa una vez, no una por cuenta de cobro: si alguna
    # impaga ya llevó el «está en sólo lectura», éste es el mismo corte.
    cortada = estado["estado"] == "solo_lectura"
    anunciado = any("solo_lectura" in ya[f.id] for f in facturas if f.estado == "emitida")
    hace_poco = datetime.now(timezone.utc) - timedelta(days=DIAS_CONSTANCIA_DE_PAGO)

    pendientes: list[tuple] = []
    for f in facturas:
        hito = hito_de_atraso(sus, f, hoy, avisadas.get(f.id))
        if hito == "aviso_solo_lectura" and frenada:
            hito = None
        elif hito == "aviso_solo_lectura" and cortada:
            # El corte ya pasó: en vez de anunciarlo, el recordatorio de
            # siempre, que dice que la cuenta ya está en sólo lectura.
            hito = "mas_7" if (hoy - f.vence_el).days >= DIA_MAS_7 else "vencida"
        elif hito == "solo_lectura" and (not cortada or frenada or anunciado):
            hito = None  # sólo el corte que hizo la escalera, y una vez
        if hito is not None:
            anteriores = [h for h in ya[f.id] if h in HITOS_DE_ATRASO]
            if anteriores and max(_orden(h) for h in anteriores) >= _orden(hito):
                hito = None  # ya salió éste, u otro más adelante
        if hito is not None:
            pendientes.append((f, hito))
            if hito == "solo_lectura":
                anunciado = True
        if f.estado == "pagada" and HITO_PAGO_RECIBIDO not in ya[f.id]:
            registrados = [_como_utc(p.creado_en) for p in pagos[f.id] if p.estado == "aprobado"]
            if registrados and max(registrados) >= hace_poco:
                pendientes.append((f, HITO_PAGO_RECIBIDO))

    nombre = cliente.nombre if cliente is not None else sus.cliente_slug
    correos = []
    for f, hito in pendientes:
        correo = Correo(factura_id=f.id, numero=f.numero, hito=hito, destinatarios=len(para))
        correos.append(correo)
        if not para:
            correo.enviado = False
            correo.nota = "sin_destinatarios"
            continue
        if ensayo:
            continue
        correo.enviado, correo.nota = _mandar(
            sus, f, hito, nombre, hoy, para,
            frenada=frenada, cortada=cortada, abonado_cop=abonado(pagos[f.id]),
        )
    return correos


def _mandar(
    sus, factura, hito: str, nombre: str, hoy: date, para: list[str], *,
    frenada: bool, cortada: bool = False, abonado_cop: int = 0,
) -> tuple[Optional[bool], Optional[str]]:
    """Reserva el (factura, hito), manda, y suelta la reserva si no salió.

    La reserva va PRIMERO: con dos pasadas a la vez, la segunda choca con el
    UNIQUE y no manda. Si el envío falla, la fila se borra y la pasada
    siguiente lo vuelve a intentar.

    Un envío por destinatario, para que nadie vea el correo de otro (el de
    facturación puede ser un contador de afuera). Con que a uno le haya
    llegado, el aviso cuenta como dado y la reserva se queda: reintentar
    repetiría el correo a quien ya lo recibió. El que no salió queda en el log."""
    from app.clientes import sesion_registro
    from app.models.cobro import AvisoCobro
    from app.services import mailer

    reg = sesion_registro()
    try:
        reserva = AvisoCobro(
            factura_id=factura.id, hito=hito, enviado_en=datetime.now(timezone.utc),
            destinatarios_n=len(para),
        )
        reg.add(reserva)
        try:
            reg.commit()
        except IntegrityError:
            reg.rollback()
            return None, "ya_mandado"
        asunto, cuerpo = mensaje(
            hito, sus, factura, nombre, hoy, frenada=frenada, cortada=cortada, abonado_cop=abonado_cop,
        )
        fallidos = [d for d in para if not mailer.send_mail_to([d], asunto, cuerpo)]
        if len(fallidos) < len(para):
            if fallidos:
                log.warning(
                    "El correo de cobranza %s de la cuenta de cobro %s (%s) no le llegó a %d de %d destinatarios",
                    hito, factura.numero or factura.id, sus.cliente_slug, len(fallidos), len(para),
                )
                return True, "parcial"
            return True, None
        reg.delete(reserva)
        reg.commit()
        log.warning(
            "No salió el correo de cobranza %s de la cuenta de cobro %s (%s): se reintenta en la pasada siguiente",
            hito, factura.numero or factura.id, sus.cliente_slug,
        )
        return False, "fallo_el_envio"
    finally:
        reg.close()


# ════════════════════════════════════════════════════════════════════════════
# Lo que dice cada correo
# ════════════════════════════════════════════════════════════════════════════

_MESES = ("ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic")


def _fecha(d: date) -> str:
    return f"{d.day}-{_MESES[d.month - 1]}-{d.year}"


def _pesos(n: int) -> str:
    return "$ " + f"{int(n):,}".replace(",", ".")


def mensaje(
    hito: str, sus, factura, nombre: str, hoy: date, *,
    frenada: bool = False, cortada: bool = False, avisada_el: Optional[date] = None, abonado_cop: int = 0,
) -> tuple[str, str]:
    """``(asunto, html)`` del correo de ``hito``. Todo lo que viene de la base o
    del entorno se escapa: el nombre del supermercado y las instrucciones los
    escribe una persona. Con la escalera ``frenada`` por un estado que puso una
    persona, el correo no anuncia una fecha de sólo lectura que no va a llegar
    sola; con la cuenta ya ``cortada``, dice que ya está en sólo lectura en vez
    de anunciarlo. La fecha de sólo lectura es la de verdad: si el aviso formal
    no salió todavía, no antes de diez días desde hoy. Con un abono
    (``abonado_cop``), dice lo abonado y lo que falta: pedir el neto entero a
    quien ya pagó una parte es pedirle que pague dos veces."""
    from app.services.mailer import app_base_url, html_shell

    numero = factura.numero or f"#{factura.id}"
    solo_lectura = fecha_de_solo_lectura(sus, factura, avisada_el or hoy)
    atraso = (hoy - factura.vence_el).days
    asuntos = {
        "por_vencer": f"RECABRA · {nombre}: la cuenta de cobro {numero} vence el {_fecha(factura.vence_el)}",
        "vencida": f"RECABRA · {nombre}: la cuenta de cobro {numero} está vencida",
        "mas_7": f"RECABRA · {nombre}: la cuenta de cobro {numero} lleva {atraso} días vencida",
        "aviso_solo_lectura": f"RECABRA · {nombre}: desde el {_fecha(solo_lectura)} la cuenta pasa a sólo lectura",
        "solo_lectura": f"RECABRA · {nombre}: la cuenta está en sólo lectura",
        HITO_PAGO_RECIBIDO: f"RECABRA · {nombre}: recibimos el pago de la cuenta de cobro {numero}",
    }
    filas = [
        ("Supermercado", escape(nombre)),
        ("Cuenta de cobro", escape(numero)),
        ("Período", escape(factura.periodo)),
        ("Total", _pesos(factura.total_cop)),
    ]
    if hito == HITO_PAGO_RECIBIDO:
        filas.append(("Pagada el", _fecha(factura.pagada_el) if factura.pagada_el else "—"))
    elif abonado_cop > 0:
        filas += [
            ("Abonado", _pesos(abonado_cop)),
            ("Falta por pagar", _pesos(max(factura.total_cop - abonado_cop, 0))),
            ("Vence", _fecha(factura.vence_el)),
        ]
    else:
        filas += [
            ("Retenciones estimadas", _pesos(factura.retenciones_estimadas_cop)),
            ("Neto a pagar", _pesos(factura.neto_esperado_cop)),
            ("Vence", _fecha(factura.vence_el)),
        ]
    if frenada:
        despues = ""
    elif cortada:
        despues = (
            " La cuenta ya está en sólo lectura: se puede ver y consultar todo, pero no guardar "
            "cambios hasta ponerse al día."
        )
    else:
        despues = (
            f" Si sigue impaga, desde el {_fecha(solo_lectura)} la cuenta queda en sólo lectura: "
            "se puede ver y consultar todo, pero no guardar cambios."
        )
    textos = {
        "por_vencer": "Le recordamos que esta cuenta de cobro vence pronto.",
        "vencida": "Esta cuenta de cobro venció y no tenemos registrado el pago." + despues,
        "mas_7": f"Esta cuenta de cobro lleva {atraso} días vencida." + despues,
        "aviso_solo_lectura": (
            f"Aviso formal: si esta cuenta de cobro sigue impaga, desde el {_fecha(solo_lectura)} "
            "la cuenta queda en sólo lectura: se podrá ver y consultar todo, pero no guardar "
            "cambios hasta ponerse al día. Los datos no se borran."
        ),
        "solo_lectura": (
            "Como esta cuenta de cobro sigue impaga, la cuenta quedó en sólo lectura: se puede "
            "ver y consultar todo, pero no guardar cambios. Los datos no se borran, y apenas "
            "registremos el pago vuelve a funcionar entera."
        ),
        HITO_PAGO_RECIBIDO: "Registramos el pago de esta cuenta de cobro. Gracias.",
    }
    pie = escape(textos[hito])
    if hito != HITO_PAGO_RECIBIDO:
        instrucciones = instrucciones_de_transferencia()
        como = (
            "Para pagar por transferencia: " + escape(instrucciones).replace("\n", "<br>")
            if instrucciones else
            "Para los datos de la transferencia, comuníquese con RECABRA."
        )
        pie += f"<br><br>{como}"
    pie += (
        f'<br><br>El detalle está en <a href="{escape(app_base_url())}/">RECABRA</a>, '
        "en Configuración → Suscripción. Si ya pagó, no tenga en cuenta este mensaje."
        if hito != HITO_PAGO_RECIBIDO else ""
    )
    return asuntos[hito], html_shell(asuntos[hito], filas, pie)
