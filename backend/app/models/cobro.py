"""Cobro de la suscripción (C1 y C2): lo que RECABRA le cobra a cada supermercado.

Cinco tablas NUEVAS del registro (la base por defecto) — ``create_all()`` las
crea sin migración, igual que ``estados_cliente``. Ninguna columna se agrega a
una tabla que ya existía: la regla dura de siempre. Se leen y escriben SOLO con
``clientes.sesion_registro()`` y están clasificadas en ``TABLAS_DEL_REGISTRO``
(``services/traspaso.py``), así que ni el traspaso las vacía ni la copia de
seguridad del supermercado las saca.

**Lo que decidió la dueña y estas tablas respetan** (2026-10-13):

· No hay pasarela. El supermercado paga por transferencia contra una «factura o
  cuenta de cobro» que RECABRA registra (número, CUFE si lo hay) sin emitir nada
  ante la DIAN: eso lo ve ella con su contador.
· Sin suscripción no hay cobranza. **Fila ausente en ``suscripciones`` = cliente
  exento** —Galerías y todo cliente que ya existe—, igual que fila ausente en
  ``estados_cliente`` = activo. Nada de lo de acá lo toca.
· Plata en pesos enteros (``Integer``), nunca ``Float``: los porcentajes de
  retención sí son ``Float`` porque no son plata, son la tasa con la que se
  ESTIMA la retención que el supermercado va a descontar.
· Fechas de negocio en ``Date`` de Colombia (``app/fechas.py``); marcas de
  tiempo en UTC, como en el resto del registro.

**Por qué todo cuelga de ``suscripcion_id`` y no del slug.** Borrar un cliente
borra sus filas del registro justamente para que otro que funde el mismo slug no
herede miembros ni una suspensión ajena (``routers/plataforma.py``, el borrado).
Las facturas y los pagos, en cambio, se CONSERVAN como constancia contable: si
colgaran del slug, el cliente nuevo heredaría la deuda del viejo. Cuelgan de la
suscripción, que se borra con el cliente, y el id de la suscripción no se vuelve
a usar nunca: ``sqlite_autoincrement`` en SQLite (pruebas y entorno local, donde
sin él la fila borrada devolvía su id al siguiente) y la secuencia en Postgres,
que nunca retrocede.
"""
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean, Column, Date, DateTime, Float, Index, Integer, String, UniqueConstraint, text,
)

from app.database import Base

MODOS_COBRO = ("manual", "automatico")
UNIDADES_COBRO = ("supermercado_mes", "sede_mes")
ESTADOS_FACTURA = ("borrador", "emitida", "pagada", "anulada")
MEDIOS_PAGO = ("transferencia", "otro")
ESTADOS_PAGO = ("aprobado", "anulado")
# Los correos de la escalera (C2), en el orden en que llegan. `pago_recibido`
# va aparte: no es un escalón, es la constancia de que se pagó.
HITOS_DE_ATRASO = ("por_vencer", "vencida", "mas_7", "aviso_solo_lectura", "solo_lectura")
HITO_PAGO_RECIBIDO = "pago_recibido"


def _ahora() -> datetime:
    return datetime.now(timezone.utc)


class Suscripcion(Base):
    """El contrato de servicio de UN cliente vivo: cuánto paga y cómo se le cobra.

    Una por cliente (``cliente_slug`` UNIQUE) y se borra con el cliente. El
    precio va acá, pactado con cada supermercado: no hay catálogo de planes
    mientras haya uno o dos clientes que pagan.

    ``modo``: ``manual`` = la operadora mueve el estado de cuenta con el PATCH de
    siempre; ``automatico`` = cuando se prenda la escalera (C2) la cuenta pasa
    sola a sólo lectura ``dia_solo_lectura`` días después de vencida la factura.
    **Nunca a suspendido**: suspender lo decide una persona. Para pasar a
    automático hace falta ``contrato_ref`` —la referencia del contrato firmado o
    de los términos aceptados—, que es la base para cortar algo; sin ella el PUT
    lo rechaza. El cliente de la base principal no pasa nunca a automático.
    """

    __tablename__ = "suscripciones"
    __table_args__ = {"sqlite_autoincrement": True}

    id = Column(Integer, primary_key=True)
    cliente_slug = Column(String, nullable=False, unique=True)
    modo = Column(String, nullable=False, default="manual")  # manual | automatico
    # Lo pactado, en pesos enteros, por unidad y por mes.
    valor_cop = Column(Integer, nullable=False)
    unidad = Column(String, nullable=False, default="supermercado_mes")  # supermercado_mes | sede_mes
    # Cuántas unidades: 1 si es por supermercado, las sedes si es por sede. Lo
    # escribe la operadora: contar sedes sería abrir la base del cliente.
    cantidad = Column(Integer, nullable=False, default=1)
    periodicidad_meses = Column(Integer, nullable=False, default=1)
    plazo_pago_dias = Column(Integer, nullable=False, default=30)
    # Días DESPUÉS del vencimiento en que corresponde sólo lectura (decisión de
    # la dueña: 30). Vencida es `vence_el < hoy`: el día del vencimiento todavía
    # está a tiempo.
    dia_solo_lectura = Column(Integer, nullable=False, default=30)
    # Mientras `hoy <= prorroga_hasta`, lo que corresponde no pasa de gracia.
    prorroga_hasta = Column(Date, nullable=True)
    # Referencia del contrato firmado o de los términos aceptados.
    contrato_ref = Column(String, nullable=True)

    # Datos de facturación: se copian a la factura al emitirla.
    razon_social = Column(String, nullable=True)
    nit = Column(String, nullable=True)
    correo_facturacion = Column(String, nullable=True)
    municipio = Column(String, nullable=True)

    # Retenciones que se espera que el supermercado practique, en % (reteIVA,
    # en % del IVA). Sólo estiman el neto: lo que cuenta es lo que se registra
    # en cada pago.
    retefuente_pct = Column(Float, nullable=False, default=0.0)
    reteica_pct = Column(Float, nullable=False, default=0.0)
    reteiva_pct = Column(Float, nullable=False, default=0.0)

    creado_por = Column(String, nullable=False)
    creado_en = Column(DateTime(timezone=True), nullable=False, default=_ahora)
    actualizado_por = Column(String, nullable=False)
    actualizado_en = Column(DateTime(timezone=True), nullable=False, default=_ahora)


class FacturaCobro(Base):
    """Una factura o cuenta de cobro de un período, tal como la registró la
    operadora. RECABRA no la emite ante la DIAN: guarda su número y, si es
    electrónica, su CUFE.

    «Vencida» no es un estado guardado: es ``estado == "emitida"`` y
    ``vence_el < hoy``. ``pagada`` la pone el registro de pagos cuando lo
    recibido más las retenciones cubren el total (``cobranza.factura_saldada``).

    Una sola factura VIVA por período y suscripción: el índice único deja
    afuera a las anuladas, porque anular una cuenta de cobro que salió mal y
    volver a emitirla para el mismo mes es lo normal. El número no se repite
    nunca, ni siquiera el de una anulada.

    Se conserva cuando se borra el cliente (constancia contable), atada a
    ``suscripcion_id``; ``cliente_slug``, ``cliente_nombre`` y ``nit`` son una
    COPIA del momento de emitir, para que la constancia se lea sola.
    """

    __tablename__ = "facturas_cobro"
    __table_args__ = (
        UniqueConstraint("numero", name="uq_factura_cobro_numero"),
        Index(
            "uq_factura_cobro_periodo_viva", "suscripcion_id", "periodo", unique=True,
            sqlite_where=text("estado <> 'anulada'"),
            postgresql_where=text("estado <> 'anulada'"),
        ),
        {"sqlite_autoincrement": True},
    )

    id = Column(Integer, primary_key=True)
    suscripcion_id = Column(Integer, nullable=False, index=True)  # sin FK: sobrevive al borrado
    cliente_slug = Column(String, nullable=False, index=True)
    cliente_nombre = Column(String, nullable=False)
    nit = Column(String, nullable=True)
    # "2026-11", o "2026-11..2027-01" si cubre varios meses.
    periodo = Column(String, nullable=False)
    numero = Column(String, nullable=True)  # el de la cuenta de cobro o la factura
    cufe = Column(String, nullable=True)
    emitida_el = Column(Date, nullable=True)
    vence_el = Column(Date, nullable=False)
    subtotal_cop = Column(Integer, nullable=False)
    iva_cop = Column(Integer, nullable=False, default=0)
    total_cop = Column(Integer, nullable=False)
    retenciones_estimadas_cop = Column(Integer, nullable=False, default=0)
    neto_esperado_cop = Column(Integer, nullable=False)
    estado = Column(String, nullable=False, default="emitida")  # borrador | emitida | pagada | anulada
    # En disputa no cuenta para el atraso: no se cobra lo que se está discutiendo.
    en_disputa = Column(Boolean, nullable=False, default=False)
    motivo_disputa = Column(String, nullable=True)
    motivo_anulacion = Column(String, nullable=True)
    pagada_el = Column(Date, nullable=True)
    creado_por = Column(String, nullable=False)
    creado_en = Column(DateTime(timezone=True), nullable=False, default=_ahora)
    actualizado_por = Column(String, nullable=False)
    actualizado_en = Column(DateTime(timezone=True), nullable=False, default=_ahora)


class PagoCobro(Base):
    """Plata que entró contra UNA factura, registrada a mano por la operadora.

    Una transferencia que paga varias cuentas de cobro se registra una vez por
    cada factura, con la parte que le toca y la MISMA referencia bancaria: por
    eso ``ref_externa`` no es única (y porque dos bancos pueden dar la misma).

    Las retenciones que el supermercado descontó cuentan como pagadas: la
    factura queda saldada cuando lo recibido más las retenciones cubren el total
    (con mil pesos de tolerancia por redondeo). ``certificado_recibido`` es
    seguimiento contable: no cambia esa cuenta.
    """

    __tablename__ = "pagos_cobro"
    __table_args__ = {"sqlite_autoincrement": True}

    id = Column(Integer, primary_key=True)
    factura_id = Column(Integer, nullable=False, index=True)  # sin FK, como la factura
    medio = Column(String, nullable=False)  # transferencia | otro
    valor_recibido_cop = Column(Integer, nullable=False)
    retefuente_cop = Column(Integer, nullable=False, default=0)
    reteica_cop = Column(Integer, nullable=False, default=0)
    reteiva_cop = Column(Integer, nullable=False, default=0)
    certificado_recibido = Column(Boolean, nullable=False, default=False)
    ref_externa = Column(String, nullable=False, index=True)
    estado = Column(String, nullable=False, default="aprobado")  # aprobado | anulado
    recibido_el = Column(Date, nullable=False)
    # El correo de la operadora que lo registró. Si el pago levanta el estado de
    # cuenta, ese cambio lo firma `sistema:cobranza`, no ella (ver cobranza.py).
    registrado_por = Column(String, nullable=False)
    creado_en = Column(DateTime(timezone=True), nullable=False, default=_ahora)


class CambioEstadoCuenta(Base):
    """El historial del interruptor: ``estados_cliente`` guarda sólo el último
    cambio; esto guarda todos, con quién y por qué.

    Lo escribe ``cobranza.mover_estado``, que es el único camino que cambia
    ``estados_cliente``. ``actor`` es el correo de la operadora o
    ``sistema:cobranza``. ``de`` es el estado efectivo de antes («activo» si no
    había fila).

    Al borrar el cliente se borra su historial SIN suscripción (colgaría del
    slug y lo heredaría quien lo funde de nuevo); el que tiene ``suscripcion_id``
    se conserva con las facturas.
    """

    __tablename__ = "cambios_estado_cuenta"
    __table_args__ = {"sqlite_autoincrement": True}

    id = Column(Integer, primary_key=True)
    cliente_slug = Column(String, nullable=False, index=True)
    suscripcion_id = Column(Integer, nullable=True, index=True)
    de = Column(String, nullable=False)
    a = Column(String, nullable=False)
    motivo = Column(String, nullable=False)
    actor = Column(String, nullable=False)
    en = Column(DateTime(timezone=True), nullable=False, default=_ahora, index=True)


class AvisoCobro(Base):
    """Que un correo de cobranza no salga dos veces (C2).

    Una fila por (factura, hito): el UNIQUE es lo que impide el duplicado, aun
    con dos pasadas a la vez (la del arranque y la que dispara un pago). La fila
    se escribe ANTES de mandar —es la reserva— y se borra si el envío falla, así
    que un correo caído se reintenta en la pasada siguiente y uno que salió no
    se repite nunca. Con el servicio dormido, la pasada que despierta se pone al
    día mandando sólo el hito que corresponde hoy, no todos los atrasados.

    ``destinatarios_n`` es un CONTEO: los correos no se guardan acá (salen de
    las membresías de dueña y del correo de facturación en el momento de
    mandar). Cuelga de la factura, que cuelga de la suscripción: al borrar el
    cliente se conserva con ella, como constancia de que se avisó.
    """

    __tablename__ = "avisos_cobro"
    __table_args__ = (
        UniqueConstraint("factura_id", "hito", name="uq_aviso_cobro_factura_hito"),
        {"sqlite_autoincrement": True},
    )

    id = Column(Integer, primary_key=True)
    factura_id = Column(Integer, nullable=False, index=True)  # sin FK, como el pago
    hito = Column(String, nullable=False)  # HITOS_DE_ATRASO | pago_recibido
    enviado_en = Column(DateTime(timezone=True), nullable=False, default=_ahora)
    destinatarios_n = Column(Integer, nullable=False, default=0)
