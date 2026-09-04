"""Plataforma (Fase 2): estado de cuenta por cliente y frenos del alta self-service.

Tablas NUEVAS de la base por defecto (el registro) — ``create_all()`` las crea sin
migración, igual que las de identidad. **FILA AUSENTE en ``estados_cliente`` =
cliente activo**: galerias y todo cliente existente quedan activos sin backfill.
Se leen y escriben SOLO con ``clientes.sesion_registro()``.
"""
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Integer, String, UniqueConstraint

from app.database import Base


class EstadoCliente(Base):
    """El interruptor de estado de cuenta, movido a mano por un operador.

    Una fila con estado "activo" también es activo: el PATCH del operador deja la
    fila puesta para conservar quién cambió qué por última vez.
    """

    __tablename__ = "estados_cliente"

    slug = Column(String, primary_key=True)
    estado = Column(String, nullable=False)  # activo | gracia | solo_lectura | suspendido
    motivo = Column(String, nullable=False)
    cambiado_en = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    cambiado_por = Column(String, nullable=False)  # email del operador (cuenta con sub)


class IntentoAlta(Base):
    """Fallos de ``POST /api/clientes/alta`` — tabla propia estilo ``IntentoOauth``.

    Misma forma que ``LoginAttempt``/``IntentoOauth`` a propósito: sirven las mismas
    tres funciones de freno de ``routers/auth.py``, parametrizadas por el modelo.
    Tabla aparte para no contaminar los frenos del login legado ni los de /oauth.
    """

    __tablename__ = "alta_attempts"

    id = Column(Integer, primary_key=True, index=True)
    ip = Column(String, nullable=False, index=True)
    at = Column(DateTime(timezone=True), nullable=False, index=True)


class Fundacion(Base):
    """Quién fundó qué cliente por el alta self-service — para el tope de 2."""

    __tablename__ = "fundaciones"
    __table_args__ = (
        UniqueConstraint("usuario_id", "cliente_slug", name="uq_fundacion_usuario_cliente"),
    )

    id = Column(Integer, primary_key=True, index=True)
    usuario_id = Column(Integer, nullable=False, index=True)
    cliente_slug = Column(String, nullable=False)
    creado_en = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)


class BitacoraPlataforma(Base):
    """Cada vez que un operador MIRÓ datos de negocio agregados de los clientes.

    Es la contrapartida de la enmienda de la regla dura de la Fase 4: el
    operador puede ver métricas agregadas de todos los clientes, y a cambio
    **cada consulta deja constancia** con su correo y el período que pidió.

    Tres decisiones que la definen:

    · **Vive en el REGISTRO, no en la base de ningún cliente.** El acceso es
      del operador a la plataforma, no de nadie a un supermercado; anotarlo en
      la bitácora de cada cliente (``audit_log``) además obligaría a ESCRIBIR
      en bases que este camino abre en sólo lectura por diseño.
    · **Tabla nueva y no ``audit_log``.** Esa tabla existe adentro de cada
      cliente y sus filas hablan de acciones sobre datos de ese cliente; ésta
      habla de un actor que está por encima de todos. Mezclarlas haría
      imposible contestar «¿qué miró el operador?» sin recorrer N bases.
    · **Se anota el ACCESO, no el cálculo.** Una respuesta servida desde el
      caché de 5 minutos deja línea igual: lo que la bitácora tiene que poder
      reconstruir es quién vio qué y cuándo, y eso pasó aunque los números ya
      estuvieran calculados.

    ``create_all()`` la crea, sin migración — la misma regla de siempre.
    """

    __tablename__ = "bitacora_plataforma"

    id = Column(Integer, primary_key=True, index=True)
    # El correo del operador (cuenta con `sub`; el legado jamás es operador).
    email = Column(String, nullable=False, index=True)
    # Código estable, como en `audit_log`: hoy sólo "metricas".
    accion = Column(String, nullable=False, default="metricas")
    # El período consultado, "YYYY-MM". Es el QUÉ de la línea: sin él, saber
    # que alguien miró no dice qué miró.
    periodo = Column(String, nullable=False)
    en = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True,
    )
