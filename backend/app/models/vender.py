"""Lo que el rediseño de Vender guarda de un contrato (``docs/rediseno/vender-api.md``).

Ocho tablas NUEVAS en la base del supermercado (la sesión normal `get_db`,
como `spaces`); `create_all()` las crea sin migración y ninguna columna nueva
entra en una tabla que ya existía (test_t22, tests/test_tendencia_ataques.py).
Cada una cuelga de un contrato o de un término por clave foránea, y la mayoría
lo tiene por clave primaria: lo que guardan es UNA cosa de ese contrato.

· condiciones_de_contrato: cómo se escribió el precio («al mes» o el total, y
  qué se tecleó). El contrato guarda siempre el total (`monthly_rent`, que en
  Vender nunca se prorrateó); esto sólo recuerda la forma, para decirla igual
  en los correos y en Supervisar.
· precios_de_reserva: el precio acordado de una reserva provisional de
  participación, que todavía no tiene contrato donde vivir. Se usa al
  confirmarla y se borra.
· cobros_por_venta y cortes_de_venta: el contrato que se cobra por un % de lo
  vendido. Su `monthly_rent` va en 0 y la plata sale de los cortes que se
  cargan; las métricas no lo cuentan como un contrato de $ 0.
· reservas_de_espacio: «Reservar hasta…» de una cara entera o de una parte
  (§8 del contrato). Mientras vive (`estado = "viva"` y `caduca ≥ hoy`, día de
  Colombia) cuenta como OCUPADO en sus fechas en todos los caminos que deciden
  si algo choca: `layout_lookup.contratos_que_chocan` la devuelve junto con los
  contratos. Al confirmarla nace el contrato (`lease_id`); al cancelarla queda
  en el registro con `baja_en`.
· contratos_reemplazados: «Editar contrato» que cambia la forma de vender o el
  espacio (la punta entera → por entrepaños, una cara → un porcentaje): el
  contrato viejo se cierra (`is_active = False`) y esta fila dice que fue
  REEMPLAZADO —no cancelado— y por cuáles (``services/editar_contrato.py``).
· precios_corregidos (2026-10-25): un contrato cargado ANTES de Vender no
  dice si su valor era del mes o del total (se leía como total). Quien
  administra lo corrige en Supervisar → «Para revisar» → Corregir
  (``services/precio_sin_forma.py``): esta fila guarda el valor de antes para
  poder deshacerlo. Corregirlo no manda correos.
· montajes_pendientes: el aviso de montaje de un contrato nuevo, que espera
  su planometría y, en un porcentaje, la distribución confirmada de su cara
  (sin zona, quien monta no sabe dónde va). ``services/montajes_pendientes.py``.
· verificaciones_de_montaje (2026-10-26): quién miró el reporte de montaje de
  un contrato al lado de su planometría y si coincide. No lleva plata.

Todo esto es plata o la lleva cerca: sólo lo leen rutas de administración, y
nada de acá entra al historial de participaciones (que no lleva montos) ni al
token de montaje.
"""
from datetime import datetime, timezone

from sqlalchemy import Column, Date, DateTime, Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship

from app.database import Base

#: Cómo se escribió el precio: por mes (× la duración = el total) o el total.
MODOS_DE_PRECIO = ("mensual", "total")
#: Cada cuánto se carga lo vendido de un contrato que cobra por ventas.
CORTES = ("mensual", "al_final")
#: Cómo se cobra: un valor fijo o un % de las ventas.
MODOS_DE_COBRO = ("fijo", "ventas")
#: `viva` hasta que se confirma (nace el contrato) o se cancela. «Caducada» no
#: se guarda: es una viva con `caduca` en el pasado.
ESTADOS_DE_RESERVA = ("viva", "confirmada", "cancelada")


def _ahora() -> datetime:
    return datetime.now(timezone.utc)


class CondicionesDeContrato(Base):
    """Cómo se escribió el precio de un contrato hecho desde Vender."""

    __tablename__ = "condiciones_de_contrato"

    lease_id = Column(Integer, ForeignKey("space_leases.id"), primary_key=True, autoincrement=False)
    modo_precio = Column(String, nullable=False)          # MODOS_DE_PRECIO
    valor_tecleado = Column(Float, nullable=True)
    creado_en = Column(DateTime(timezone=True), nullable=False, default=_ahora)


class PrecioCorregido(Base):
    """Un contrato de antes de Vender al que quien administra le dijo cómo se
    lee su valor («era al mes», «era el total» o, desde 2026-10-27, «se cobra
    por % de las ventas»: ``modo_precio`` «ventas» y ``total_despues`` 0).
    Guarda lo de antes para deshacerlo."""

    __tablename__ = "precios_corregidos"

    lease_id = Column(Integer, ForeignKey("space_leases.id"), primary_key=True, autoincrement=False)
    modo_precio = Column(String, nullable=False)          # MODOS_DE_PRECIO: cómo se dijo que se lee
    valor_antes = Column(Float, nullable=False)           # el `monthly_rent` que tenía
    meses = Column(Float, nullable=False)                 # la duración usada (``meses_entre``)
    total_despues = Column(Float, nullable=False)         # el `monthly_rent` que quedó
    por = Column(String, nullable=True)
    en = Column(DateTime(timezone=True), nullable=False, default=_ahora)


class PrecioDeReserva(Base):
    """El precio acordado de una reserva provisional de participación, o su
    cobro por un % de las ventas (decisión del dueño, 2026-10-20)."""

    __tablename__ = "precios_de_reserva"

    participacion_id = Column(Integer, ForeignKey("participaciones.id"), primary_key=True, autoincrement=False)
    #: El total por todo el plazo, como el `monthly_rent` del contrato que será.
    #: None si se cobra por ventas.
    valor = Column(Float, nullable=True)
    modo_precio = Column(String, nullable=True)           # MODOS_DE_PRECIO
    valor_tecleado = Column(Float, nullable=True)
    cobro_modo = Column(String, nullable=False, default="fijo")   # MODOS_DE_COBRO
    cobro_porcentaje = Column(Float, nullable=True)
    cobro_corte = Column(String, nullable=True)                   # CORTES
    creado_en = Column(DateTime(timezone=True), nullable=False, default=_ahora)
    creado_por = Column(String, nullable=True)


class CobroPorVenta(Base):
    """Un contrato que se cobra por un porcentaje de lo vendido."""

    __tablename__ = "cobros_por_venta"

    lease_id = Column(Integer, ForeignKey("space_leases.id"), primary_key=True, autoincrement=False)
    #: El porcentaje de las ventas, tal cual se escribió (8 = 8 %).
    porcentaje = Column(Float, nullable=False)
    corte = Column(String, nullable=False)                # CORTES
    creado_en = Column(DateTime(timezone=True), nullable=False, default=_ahora)
    creado_por = Column(String, nullable=True)


class CorteDeVenta(Base):
    """Lo vendido en un período de un contrato por ventas, y lo que se cobra."""

    __tablename__ = "cortes_de_venta"
    __table_args__ = (
        UniqueConstraint("lease_id", "periodo_desde", name="uq_cortes_de_venta_periodo"),
        {"sqlite_autoincrement": True},
    )

    id = Column(Integer, primary_key=True)
    lease_id = Column(Integer, ForeignKey("space_leases.id"), nullable=False, index=True)
    periodo_desde = Column(Date, nullable=False)
    periodo_hasta = Column(Date, nullable=False)
    ventas = Column(Float, nullable=False)
    #: ventas × porcentaje, redondeado al peso.
    monto = Column(Float, nullable=False)
    cargado_en = Column(DateTime(timezone=True), nullable=False, default=_ahora)
    cargado_por = Column(String, nullable=True)


class ReservaDeEspacio(Base):
    """Una cara entera o una parte reservada a un proveedor hasta `caduca`."""

    __tablename__ = "reservas_de_espacio"
    __table_args__ = (
        Index("ix_reservas_de_espacio_estado", "estado", "caduca"),
        {"sqlite_autoincrement": True},
    )

    id = Column(Integer, primary_key=True)
    space_id = Column(Integer, ForeignKey("spaces.id"), nullable=False, index=True)
    supplier_id = Column(Integer, ForeignKey("suppliers.id"), nullable=False, index=True)
    marca = Column(String, nullable=True)
    desde = Column(Date, nullable=False)
    hasta = Column(Date, nullable=False)
    caduca = Column(Date, nullable=False)
    #: El total por todo el plazo, como el `monthly_rent` del contrato que será.
    valor = Column(Float, nullable=True)
    modo_precio = Column(String, nullable=True)           # MODOS_DE_PRECIO
    valor_tecleado = Column(Float, nullable=True)
    #: Cómo se va a cobrar el contrato que nazca: fijo (`valor`) o por un % de
    #: las ventas (decisión del dueño, 2026-10-20).
    cobro_modo = Column(String, nullable=False, default="fijo")   # MODOS_DE_COBRO
    cobro_porcentaje = Column(Float, nullable=True)
    cobro_corte = Column(String, nullable=True)                   # CORTES
    correo = Column(String, nullable=True)
    notas = Column(Text, nullable=True)
    estado = Column(String, nullable=False, default="viva")   # ESTADOS_DE_RESERVA
    lease_id = Column(Integer, ForeignKey("space_leases.id"), nullable=True)
    creado_en = Column(DateTime(timezone=True), nullable=False, default=_ahora)
    creado_por = Column(String, nullable=True)
    baja_en = Column(DateTime(timezone=True), nullable=True)
    baja_por = Column(String, nullable=True)

    space = relationship("Space")
    supplier = relationship("Supplier")


class MontajePendiente(Base):
    """El aviso de montaje de un contrato nuevo que espera su planometría (y,
    en un porcentaje, su zona). ``cara_space_id``: la cara que se distribuye en
    un porcentaje; en una cara entera o una parte, el espacio del contrato."""

    __tablename__ = "montajes_pendientes"

    lease_id = Column(Integer, ForeignKey("space_leases.id"), primary_key=True, autoincrement=False)
    cara_space_id = Column(Integer, ForeignKey("spaces.id"), nullable=False, index=True)
    creado_en = Column(DateTime(timezone=True), nullable=False, default=_ahora)


class ContratoReemplazado(Base):
    """Un contrato que «Editar contrato» cerró porque cambió su forma de
    venderse o su espacio: no se canceló, se reemplazó por los de
    ``reemplazado_por`` (ids de ``space_leases``, en JSON), en el mismo
    guardado. Lo que colgaba de él (planometría, montaje, cortes) queda con él:
    los nuevos vuelven a pedir su planometría como cualquier contrato nuevo."""

    __tablename__ = "contratos_reemplazados"

    lease_id = Column(Integer, ForeignKey("space_leases.id"), primary_key=True, autoincrement=False)
    #: ``[41, 42]``: los contratos que lo reemplazan.
    reemplazado_por = Column(Text, nullable=False, default="[]")
    en = Column(DateTime(timezone=True), nullable=False, default=_ahora)
    por = Column(String, nullable=True)


#: Por qué se dio de baja un contrato antes de su fin: «Cancelar el contrato»
#: o el borrado de su sede (que lo cierra con ella).
MOTIVOS_DE_BAJA = ("cancelado", "sede")


class BajaDeContrato(Base):
    """El día en que un contrato DEJÓ de correr por una baja (auditoría P2-13).

    `is_active = False` no guardaba la fecha, así que la serie de Indicadores
    y las métricas de la plataforma sacaban al cancelado de TODOS los meses:
    un contrato de seis meses cancelado en el cuarto dejaba de haber sido canon
    en los tres primeros. Con esta fila se devenga hasta el día anterior a
    ``efectiva`` (`services/historial.tramo_devengado`). Tabla nueva: ninguna
    columna entra en `space_leases`."""

    __tablename__ = "bajas_de_contrato"

    lease_id = Column(Integer, ForeignKey("space_leases.id"), primary_key=True, autoincrement=False)
    #: Desde este día (Colombia) el contrato ya no corre.
    efectiva = Column(Date, nullable=False)
    motivo = Column(String, nullable=False, default="cancelado")
    en = Column(DateTime(timezone=True), nullable=False, default=_ahora)
    por = Column(String, nullable=True)


#: Lo que dice quien verifica el montaje de un contrato.
RESULTADOS_DE_VERIFICACION = ("coincide", "no_coincide")


class VerificacionDeMontaje(Base):
    """«Verificar el montaje de un contrato» (rediseño UX, 2026-10-26): quien
    administra pone la planometría al lado de la foto del reporte y dice si
    coincide. Hasta acá sólo los planogramas guardaban su revisión
    (`revisiones_de_planograma`); de un contrato quedaba el reporte y nada más.

    Tabla NUEVA que cuelga del reporte (`mount_confirmations`): una fila por
    verificación, nunca se pisa —si se verifica dos veces, vale la última y la
    anterior queda como historia—. No lleva plata: la ve también quien monta."""

    __tablename__ = "verificaciones_de_montaje"
    __table_args__ = {"sqlite_autoincrement": True}

    id = Column(Integer, primary_key=True)
    montaje_id = Column(Integer, ForeignKey("mount_confirmations.id"), nullable=False, index=True)
    resultado = Column(String, nullable=False)            # RESULTADOS_DE_VERIFICACION
    nota = Column(Text, nullable=True)
    verificada_por = Column(String, nullable=True)
    verificada_en = Column(DateTime(timezone=True), nullable=False, default=_ahora)
