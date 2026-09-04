"""Consentimiento registrado a la Política de Tratamiento de Datos Personales
(Fase 3, Ley 1581/2012).

Tabla NUEVA de la base por defecto (el registro) — ``create_all()`` la crea sin
migración, mismo patrón que ``models/plataforma.py``. Se lee y escribe SOLO con
``clientes.sesion_registro()``: es identidad global, no dato de negocio de
ningún cliente.

Se registra en ``Base.metadata`` importando este módulo a nivel de módulo
desde ``routers/auth.py`` — mismo patrón que ``plataforma_estado.py`` con
``models/plataforma.py`` (ver ese docstring). Ese router ya está incluido en
``main.py``, así que no hace falta tocarlo para que ``create_all()`` cree
``consentimientos``.
"""
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Integer, String, UniqueConstraint

from app.database import Base

# Versión vigente de la Política de Tratamiento de Datos Personales
# (``frontend/src/legal/politica-datos.md``). Subirla no reescribe las filas
# viejas: un usuario que aceptó "2026-09-v1" queda sin fila para la versión
# siguiente, y el flujo normal (alta bloquea, login existente avisa una vez)
# vuelve a pedirle el consentimiento sin necesitar ningún backfill.
VERSION_POLITICA = "2026-09-v1"

# Dónde se originó la aceptación: al fundar el cliente, al canjear una
# invitación, o al aceptarla desde el aviso post-login de una cuenta existente.
ORIGENES_CONSENTIMIENTO = ("alta", "invitacion", "login")


class Consentimiento(Base):
    """Una aceptación de una versión de la política, por un usuario, con IP y fecha.

    ``UniqueConstraint(usuario_id, version)``: un usuario acepta cada versión
    UNA vez — el segundo intento (por ejemplo, un segundo POST a
    ``/api/auth/aceptar-politica``) es idempotente por construcción, no por
    código que compruebe antes de insertar.
    """

    __tablename__ = "consentimientos"
    __table_args__ = (
        UniqueConstraint("usuario_id", "version", name="uq_consentimiento_usuario_version"),
    )

    id = Column(Integer, primary_key=True, index=True)
    usuario_id = Column(Integer, nullable=False, index=True)
    version = Column(String, nullable=False)
    aceptado_en = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    ip = Column(String, nullable=False)
    origen = Column(String, nullable=False)  # alta | invitacion | login
