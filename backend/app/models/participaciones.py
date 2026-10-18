"""Participaciones de cara: el porcentaje de una cara vendido a un proveedor.

Cuatro tablas NUEVAS en la base del supermercado (la sesión normal `get_db`,
igual que `spaces`); `create_all()` las crea sin migración. Ninguna columna
nueva en tablas existentes (test_t22, tests/test_tendencia_ataques.py:660).
Diseño: scratchpad/participaciones/21-diseno-final.md §2 (decisiones D5, D6,
D14 de 10-decisiones.md); docs/ESTADO.md §Participaciones cuando aterrice.

· participaciones: un TÉRMINO por fila (una reserva provisional o un contrato)
  de una participación, que es una fila de `spaces` con código …-PC<n>.
  Un término `contrato` NO copia proveedor, marca ni fechas: la verdad es su
  lease (una sola fuente; el día que exista «editar contrato» no hay copia que
  se contradiga).
· distribuciones: una por cara; la versión optimista, el mueble y la firma
  confirmada.
· zonas: los polígonos normalizados 0..1, capa borrador o confirmada.
· historial_participaciones: lo que pasó; nunca se purga (D14). Guarda los
  correos de quien actuó para siempre (la supresión es manual).

Reglas de forma, todas a propósito:

· Sólo `Integer`, `String`, `Text`, `Date`, `DateTime(timezone=True)` y
  `ForeignKey`: nada de `Enum` nativo, `Boolean`, `Float` ni `Numeric`. Los
  estados son `String` con la tupla de valores válidos acá y la validación en el
  servicio; los porcentajes son enteros de puntos básicos (1 pb = 0,01 %,
  10 000 pb = la cara entera, D1). La copia de seguridad serializa con
  `json.dumps` y el traspaso copia filas planas.
· `sqlite_autoincrement` en las cuatro: los ids nunca se reutilizan en SQLite
  (como `modelos_mueble`, `models.py:497`), y el historial nombra ids.
· Ninguna clave foránea de una tabla a sí misma: el traspaso copia cada tabla
  con `select(tabla)` sin `ORDER BY` (`services/traspaso.py::_copiar`) y en
  Postgres un `UPDATE` reordena el heap, así que una fila que apunta a otra de
  la misma tabla podría llegar antes que su padre. Por eso `renueva_a` es un
  `Integer` sin FK (la integridad la da el servicio). El orden ENTRE tablas lo
  resuelve `Base.metadata.sorted_tables`.
"""
from datetime import datetime, timezone

from sqlalchemy import Column, Date, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint

from app.database import Base

#: `reserva`: provisional, con caducidad; `reserva_cancelada`: la cancelaron (o
#: el archivo de la sede); `contrato`: tiene lease, que es la verdad de proveedor,
#: marca y fechas. «Vencido», «caducada», «firmado» y «vigente» no se guardan:
#: se derivan de las fechas (D6).
ESTADOS_DE_TERMINO = ("reserva", "reserva_cancelada", "contrato")
CAPAS = ("borrador", "confirmada")
#: D14: lo contractual, lo gráfico, los cambios de estado de la cara y los
#: eventos que vienen de otro lado (cancelar el lease, borrar la sede…).
TIPOS_DE_HISTORIAL = ("contractual", "geometria", "estado", "evento")


def _ahora() -> datetime:
    return datetime.now(timezone.utc)


class Participacion(Base):
    """Un término de una participación: una reserva provisional o un contrato."""

    __tablename__ = "participaciones"
    __table_args__ = (
        UniqueConstraint("lease_id", name="uq_participaciones_lease"),
        Index("ix_participaciones_cara_estado", "cara_space_id", "estado"),
        {"sqlite_autoincrement": True},
    )

    id = Column(Integer, primary_key=True)
    # El espacio de la participación (código …-PC<n>). No cambia al renovar ni
    # al renumerar (D19): las zonas lo nombran a él, no al término.
    space_id = Column(Integer, ForeignKey("spaces.id"), nullable=False, index=True)
    # La cara (fila de `spaces` del código de la cara, buscada o creada libre).
    cara_space_id = Column(Integer, ForeignKey("spaces.id"), nullable=False, index=True)
    numero = Column(Integer, nullable=False)              # el n de PC<n>; nunca se reutiliza
    estado = Column(String, nullable=False)               # ESTADOS_DE_TERMINO
    puntos_basicos = Column(Integer, nullable=False)      # 1..10000
    # Sólo en una reserva (en un contrato van NULL: la verdad es el lease).
    supplier_id = Column(Integer, ForeignKey("suppliers.id"), nullable=True, index=True)
    marca = Column(String, nullable=True)
    desde = Column(Date, nullable=True)
    hasta = Column(Date, nullable=True)
    caduca = Column(Date, nullable=True)                  # hasta cuándo se sostiene la reserva
    lease_id = Column(Integer, ForeignKey("space_leases.id"), nullable=True)  # sólo contrato
    renueva_a = Column(Integer, nullable=True)            # id del término anterior; SIN FK (ver arriba)
    notas = Column(Text, nullable=True)
    # La cancelación (de la reserva, del contrato por `DELETE /spaces/…/leases/…`
    # o por el archivo de la sede). Distingue «cancelado» de «vencido»:
    # `expire_leases` también deja `is_active = False` al vencer.
    baja_en = Column(DateTime(timezone=True), nullable=True)
    baja_por = Column(String, nullable=True)
    version = Column(Integer, nullable=False, default=1)
    creada_en = Column(DateTime(timezone=True), nullable=False, default=_ahora)
    creada_por = Column(String, nullable=True)
    actualizada_en = Column(DateTime(timezone=True), nullable=False, default=_ahora)
    actualizada_por = Column(String, nullable=True)


class Distribucion(Base):
    """Las zonas de UNA cara: su versión optimista y la confirmación."""

    __tablename__ = "distribuciones"
    __table_args__ = (
        UniqueConstraint("cara_space_id", name="uq_distribuciones_cara"),
        {"sqlite_autoincrement": True},
    )

    id = Column(Integer, primary_key=True)
    cara_space_id = Column(Integer, ForeignKey("spaces.id"), nullable=False)
    # El id del mueble del plano (`fixture.id`) para el que se dibujó. Si otro
    # mueble toma el mismo código, la distribución vieja se cierra.
    fixture_id = Column(String, nullable=True)
    version = Column(Integer, nullable=False, default=1)
    confirmada_en = Column(DateTime(timezone=True), nullable=True)
    confirmada_por = Column(String, nullable=True)
    firma_confirmada = Column(String, nullable=True)
    borrador_en = Column(DateTime(timezone=True), nullable=True)   # NULL = no hay borrador
    borrador_por = Column(String, nullable=True)
    actualizada_en = Column(DateTime(timezone=True), nullable=False, default=_ahora)
    actualizada_por = Column(String, nullable=True)


class Zona(Base):
    """Un polígono de una participación sobre la cara, en u,v normalizados."""

    __tablename__ = "zonas"
    __table_args__ = (
        Index("ix_zonas_distribucion_capa", "distribucion_id", "capa"),
        {"sqlite_autoincrement": True},
    )

    id = Column(Integer, primary_key=True)
    distribucion_id = Column(Integer, ForeignKey("distribuciones.id"), nullable=False)
    capa = Column(String, nullable=False)                  # CAPAS
    # D8: no se dibuja una zona sin participación.
    participacion_space_id = Column(Integer, ForeignKey("spaces.id"), nullable=False, index=True)
    vertices_json = Column(Text, nullable=False)           # [[u,v],…] cuantizado 1e-6, antihorario
    orden = Column(Integer, nullable=False, default=0)
    creada_en = Column(DateTime(timezone=True), nullable=False, default=_ahora)
    creada_por = Column(String, nullable=True)


class HistorialParticipacion(Base):
    """Lo que pasó con una cara y sus participaciones. Nunca se purga (D14) y
    nunca lleva montos: el valor vive en el lease."""

    __tablename__ = "historial_participaciones"
    __table_args__ = {"sqlite_autoincrement": True}

    id = Column(Integer, primary_key=True)
    en = Column(DateTime(timezone=True), nullable=False, default=_ahora, index=True)
    actor = Column(String, nullable=True)                  # correo del token o rol
    tipo = Column(String, nullable=False)                  # TIPOS_DE_HISTORIAL
    accion = Column(String, nullable=False)                # diseño §5.6
    cara_space_id = Column(Integer, ForeignKey("spaces.id"), nullable=True, index=True)
    participacion_space_id = Column(Integer, ForeignKey("spaces.id"), nullable=True, index=True)
    participacion_id = Column(Integer, ForeignKey("participaciones.id"), nullable=True, index=True)
    distribucion_id = Column(Integer, ForeignKey("distribuciones.id"), nullable=True)
    detalle = Column(Text, nullable=True)                  # frase en castellano, sin montos
    antes_json = Column(Text, nullable=True)               # sin montos; con vértices en las confirmaciones
    despues_json = Column(Text, nullable=True)
