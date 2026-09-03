"""Identidad global: usuarios, membresías por cliente e invitaciones.

Tres tablas NUEVAS — `create_all()` las crea sin migración, la misma regla que
ya usa el resto del repo (ver docstrings de ``clientes.py`` y ``models.py``).

**Viven SIEMPRE en la base por defecto**, nunca en la de un supermercado: un
usuario puede tener membresías en varios clientes a la vez, así que esto es
identidad GLOBAL, igual que la tabla ``clientes``. Se leen y escriben
exclusivamente con ``clientes.sesion_registro()`` — la sesión de un cliente
ve estas tablas vacías (``create_all`` las crea ahí también, pero no
significan nada, igual que pasa con ``ClienteRow``).

Roles de membresía: ``owner`` (dueño del cliente), ``admin`` y ``worker``. El
JWT propio sólo conoce dos roles (``admin``/``worker``) — ``owner`` se mapea a
``admin`` al emitir el token (spec, decisión 5): para todo el middleware
existente un owner se comporta como admin.
"""
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, UniqueConstraint

from app.database import Base

ROLES_MEMBRESIA = ("owner", "admin", "worker")


class Usuario(Base):
    """Una persona con cuenta real (Google o correo/contraseña vía Firebase)."""

    __tablename__ = "usuarios"

    id = Column(Integer, primary_key=True, index=True)
    # El uid que da Firebase — estable para esa cuenta, distinto entre
    # proveedores si la persona entra alguna vez con Google y otra con correo
    # usando el MISMO correo (no se fusionan automáticamente salvo que el
    # correo venga verificado; ver routers/auth.py::oauth_login).
    firebase_uid = Column(String, unique=True, nullable=False, index=True)
    email = Column(String, unique=True, nullable=False, index=True)
    nombre = Column(String, nullable=True)
    creado_en = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    ultimo_login = Column(DateTime(timezone=True), nullable=True)


class Membresia(Base):
    """Qué rol tiene un usuario en un cliente (supermercado) concreto.

    Un mismo usuario puede tener una fila por cliente — es lo que permite que
    una persona ayude a dos supermercados con la misma cuenta de Google.
    """

    __tablename__ = "membresias"
    __table_args__ = (
        UniqueConstraint("usuario_id", "cliente_slug", name="uq_membresia_usuario_cliente"),
    )

    id = Column(Integer, primary_key=True, index=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False, index=True)
    # No es FK a `clientes`: esa tabla vive en la misma base por defecto, así
    # que técnicamente se podría, pero se guarda el slug —igual que en el
    # JWT— para no acoplar el orden de creación de las dos tablas.
    cliente_slug = Column(String, nullable=False, index=True)
    rol = Column(String, nullable=False)  # owner | admin | worker
    activo = Column(Boolean, default=True, nullable=False)
    creado_en = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)


class IntentoOauth(Base):
    """Intentos fallidos de ``POST /api/auth/oauth``, para el freno de fuerza
    bruta — tabla APARTE de ``LoginAttempt`` (``models/models.py``) a
    propósito.

    ``/oauth`` no sabe todavía a qué cliente pertenece cuando cuenta un
    intento fallido —lo único que tiene ahí es la IP, la identidad recién se
    resuelve después—, así que el contador tiene que vivir en la base
    GLOBAL, junto al resto de identidad (``sesion_registro()``). Reusar
    ``login_attempts`` habría significado que los fallos de ``/oauth`` de
    CUALQUIER cliente se sumaran a los del login legado de uno solo —el
    cliente por defecto, porque su base es, por construcción, la misma que la
    del registro— y ninguno de los demás clientes se enterara nunca de sus
    propios intentos.

    Misma forma que ``LoginAttempt`` a propósito: las mismas tres funciones
    de freno en ``routers/auth.py`` (`frenar_si_hay_muchos_fallos`,
    `anotar_fallo`, `borrar_fallos`) sirven para las dos, parametrizadas por
    el modelo.
    """

    __tablename__ = "oauth_attempts"

    id = Column(Integer, primary_key=True, index=True)
    ip = Column(String, nullable=False, index=True)
    at = Column(DateTime(timezone=True), nullable=False, index=True)


class Invitacion(Base):
    """Una invitación pendiente: alguien todavía sin cuenta, con un rol reservado.

    El token es opaco (``secrets.token_urlsafe``) y vive en la tabla, no en un
    JWT — así se puede marcar ``usada_en`` y volverlo irreproducible sin
    depender de una época compartida por todo el cliente.
    """

    __tablename__ = "invitaciones"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, nullable=False, index=True)
    cliente_slug = Column(String, nullable=False, index=True)
    rol = Column(String, nullable=False)
    token = Column(String, nullable=False, unique=True, index=True)
    expira_en = Column(DateTime(timezone=True), nullable=False)
    usada_en = Column(DateTime(timezone=True), nullable=True)
    # Email de quien invitó, cuando se conoce (viene del token del actor). No
    # es FK: quien invitó puede haber sido borrado y la invitación sigue
    # siendo válida.
    invitado_por = Column(String, nullable=True)
    creado_en = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
