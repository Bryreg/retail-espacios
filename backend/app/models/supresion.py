"""Derechos del titular (Fase 3, Ley 1581/2012): solicitud de supresión y freno del export.

Dos tablas NUEVAS de la base por defecto (el registro) -- ``create_all()`` las
crea sin migración, mismo patrón que ``models/plataforma.py`` y
``models/consentimiento.py``. Se leen y escriben SOLO con
``clientes.sesion_registro()``: son identidad/gobernanza global, no datos de
negocio de ningún cliente.

Se registran en ``Base.metadata`` importando este módulo a nivel de módulo
desde ``routers/derechos.py`` (mismo patrón que ``plataforma_estado.py`` con
``models/plataforma.py``) -- ese router queda incluido en ``main.py``, así que
no hace falta tocar nada más para que ``create_all()`` cree las tablas.
"""
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Integer, String

from app.database import Base

# Nada se borra NUNCA por esta tabla: la ejecución real de la supresión es
# MANUAL y fuera del sistema. Esta fila es sólo el registro de que alguien la
# pidió y de qué hizo el operador con el pedido.
ESTADOS_SUPRESION = ("pendiente", "atendida", "rechazada")


class SolicitudSupresion(Base):
    """Un owner pidió que se suprima su cliente. Sólo queda registrada."""

    __tablename__ = "solicitudes_supresion"

    id = Column(Integer, primary_key=True, index=True)
    cliente_slug = Column(String, nullable=False, index=True)
    usuario_id = Column(Integer, nullable=False)
    email = Column(String, nullable=False)
    motivo = Column(String, nullable=True)
    estado = Column(String, nullable=False, default="pendiente")  # pendiente | atendida | rechazada
    creado_en = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    # Los tres siguientes los llena el PATCH del operador (routers/plataforma.py),
    # como constancia -- mismo espíritu que `cambiado_en`/`cambiado_por` en
    # `EstadoCliente` (Fase 2): la fila misma es la bitácora, no un canal aparte.
    atendido_en = Column(DateTime(timezone=True), nullable=True)
    atendido_por = Column(String, nullable=True)  # email del operador
    nota = Column(String, nullable=True)


class IntentoExport(Base):
    """Freno de 3 exports por hora por usuario -- tabla propia, estilo ``IntentoAlta``.

    Por ``usuario_id`` y no por IP: el freno de exportar los propios datos es
    por CUENTA, no por conexión -- dos owners detrás del mismo NAT/VPN no
    tienen por qué compartir contador, y un mismo owner cambiando de red no
    tiene por qué resetearlo.
    """

    __tablename__ = "export_attempts"

    id = Column(Integer, primary_key=True, index=True)
    usuario_id = Column(Integer, nullable=False, index=True)
    at = Column(DateTime(timezone=True), nullable=False, index=True)
