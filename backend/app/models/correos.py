"""La cola de correos de un supermercado (auditoría P1-4).

Tabla NUEVA en la base de cada cliente, sin columnas agregadas a nada que ya
existiera. Ver ``services/cola_de_correos.py`` para el porqué y el ciclo de
vida de una fila.
"""
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Index, Integer, String, Text

from app.database import Base


def _ahora():
    return datetime.now(timezone.utc)


class CorreoPendiente(Base):
    """Un correo que la aplicación tiene que mandar: se anota ANTES de salir y
    se marca cuando salió. Lo que sigue ``pendiente`` lo reintenta el
    mantenimiento, con espera creciente, hasta ``abandonado``."""

    __tablename__ = "correos_pendientes"

    id = Column(Integer, primary_key=True)
    creado_en = Column(DateTime(timezone=True), nullable=False, default=_ahora)
    #: Lista JSON de direcciones, tal como las resolvió el pedido.
    destinatarios_json = Column(Text, nullable=False)
    asunto = Column(String(300), nullable=False)
    cuerpo_html = Column(Text, nullable=False)
    #: ``pendiente`` → ``enviado`` | ``abandonado``.
    estado = Column(String(20), nullable=False, default="pendiente")
    intentos = Column(Integer, nullable=False, default=0)
    #: Cuándo se puede volver a intentar. Al anotarlo queda un rato adelante:
    #: ese rato es del envío inmediato, y el mantenimiento no lo pisa.
    proximo_intento = Column(DateTime(timezone=True), nullable=False, default=_ahora)
    #: El último motivo de falla, SIN direcciones (``observabilidad.sin_correos``).
    ultimo_error = Column(String(500), nullable=True)
    enviado_en = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("ix_correos_pendientes_estado_proximo", "estado", "proximo_intento"),
    )
