"""Aceptación versionada de los Términos del servicio (auditoría pre-lanzamiento,
P0-2, la parte de producto) y constancia de los derechos de titulares atendidos
por el operador (P1-14).

Dos tablas NUEVAS del registro — ``create_all()`` las crea; ninguna columna se
agrega a una tabla existente (regla dura «sólo aditivo»). Se leen y escriben
SOLO con ``clientes.sesion_registro()`` y están clasificadas en
``services/traspaso.TABLAS_DEL_REGISTRO``.

**Por qué una tabla aparte y no filas en ``consentimientos``.** La política se
acepta por PERSONA (``UNIQUE(usuario_id, version)``) y sus filas las leen el
reporte de transparencia y el login, que preguntan «¿aceptó la versión
vigente?» comparando contra ``VERSION_POLITICA``. Los términos son un contrato
con el SUPERMERCADO: los acepta su dueña, por cada supermercado, y la
constancia tiene que decir también qué versión de la política estaba vigente en
ese momento. Meterlos en ``consentimientos`` con un prefijo obligaba a cada
lector de esa tabla a filtrarlos.
"""
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Integer, String, Text, UniqueConstraint

from app.database import Base

#: Dónde se aceptaron: al fundar el supermercado, o desde el aviso que aparece
#: al entrar (una dueña que ya existía cuando los términos pasaron a regir).
ORIGENES_TERMINOS = ("alta", "login")


class AceptacionDeTerminos(Base):
    """Una dueña aceptó una versión de los términos para un supermercado."""

    __tablename__ = "aceptaciones_de_terminos"
    __table_args__ = (
        UniqueConstraint("usuario_id", "cliente_slug", "version_terminos", name="uq_aceptacion_terminos"),
    )

    id = Column(Integer, primary_key=True, index=True)
    usuario_id = Column(Integer, nullable=False, index=True)
    cliente_slug = Column(String, nullable=False, index=True)
    version_terminos = Column(String, nullable=False)
    #: La versión de la política vigente cuando se aceptaron los términos: la
    #: constancia del alta dice las dos.
    version_politica = Column(String, nullable=False)
    aceptado_en = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    ip = Column(String, nullable=False)
    origen = Column(String, nullable=False)  # alta | login


class DerechoDeTitular(Base):
    """Constancia de una solicitud de un titular que atendió el operador
    (Ley 1581, arts. 14 y 15): exportar sus datos o suprimirlos.

    **No guarda el correo de la persona.** Una constancia de supresión que
    conservara la dirección suprimida deshace lo que constata. Guarda la
    ``huella`` (los primeros 16 hexadecimales del SHA-256 del correo en
    minúsculas, o de ``cliente:proveedor``): si la persona vuelve a escribir,
    se puede comprobar que ya se la atendió, sin tener su dirección guardada.
    ``resumen_json`` lleva cuántas filas había o se tocaron, por base y por
    tabla — nunca un valor.
    """

    __tablename__ = "derechos_de_titulares"

    id = Column(Integer, primary_key=True, index=True)
    tipo = Column(String, nullable=False)        # export | supresion
    sujeto = Column(String, nullable=False)      # persona | contacto
    huella = Column(String, nullable=False, index=True)
    #: Sólo cuando la búsqueda se limitó a un supermercado (el contacto de un
    #: proveedor lo instruye el supermercado, que es el responsable).
    cliente_slug = Column(String, nullable=True)
    atendido_por = Column(String, nullable=False)  # correo del operador
    atendido_en = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    #: El radicado o la referencia de la solicitud (texto del operador; sin
    #: datos de la persona, lo dice la pantalla).
    referencia = Column(String, nullable=True)
    resumen_json = Column(Text, nullable=False, default="{}")
