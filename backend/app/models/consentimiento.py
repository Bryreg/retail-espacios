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
# (``docs/legal/politica-datos.md`` y su copia byte-idéntica en
# ``frontend/src/legal/politica-datos.md``). Este valor y el encabezado de ese
# documento cambian JUNTOS, o las constancias apuntarían a un texto que no
# existe (lo fija ``tests/test_consentimiento.py``).
#
# Fase 7 — sube a "2026-09-v2" porque el trato cambió de forma MATERIAL, no
# porque el texto se haya redactado mejor: el operador de la plataforma pasó a
# ver los agregados EXACTOS de todos los clientes, sin el umbral de 3 contratos
# que aplicaba la v1, y la contrapartida es el reporte de transparencia que
# cada cliente puede pedir (``GET /api/clientes/mi-reporte-plataforma``) con
# cada dato tomado, su definición, su fuente, su finalidad, los valores mes a
# mes y qué operador lo consultó y cuándo. Un cambio así se le vuelve a
# informar al titular (§4.1 y §5.3 de la política).
#
# Subirla NO reescribe las filas viejas: un usuario que aceptó "2026-09-v1"
# queda sin fila para la versión siguiente, y el flujo que YA existe (el alta
# bloquea, la invitación da 428, el login de una cuenta existente avisa una vez
# con ``pedir_consentimiento``) vuelve a pedirle el consentimiento sin
# necesitar ningún backfill ni ninguna migración.
VERSION_POLITICA = "2026-09-v2"

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
