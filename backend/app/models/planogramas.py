"""Planogramas de las caras, con «destinos» (fase 2 de la distribución, 2026-10-24).

Cinco tablas NUEVAS en la base del supermercado (`create_all()` las crea sin
migración; ninguna columna nueva en tablas existentes, test_t22):

· destinos: a qué se dedica un lugar de la cara que NO es un contrato —una
  categoría, la marca propia, una promoción, un producto o grupo, otro—, con su
  nombre, su color, cómo se monta y el código en el sistema del supermercado
  (para cruzarlo con su ERP más adelante). Son de una sede; ``en_la_sede`` dice
  si se guardó para reusarlo en otros muebles.
· planogramas: uno por cara (sede, mueble del plano por su ``fixture_id`` y la
  letra), con la versión optimista y el borrador. NO cuelga de ``spaces``: un
  mueble interno no tiene filas comerciales y crearlas lo haría aparecer en la
  ocupación y en las métricas. El renombre de la sede muda ``sede``
  (``services/renombre_sede.py``); renumerar cambia el código, no el id.
· versiones_de_planograma: cada publicación. Una versión publicada no se
  cambia ni se borra: cambiarla es publicar la siguiente.
· piezas_de_planograma: el lugar de un destino en la cara —su % y su polígono
  en u,v normalizados, como una zona—; con ``version_id`` NULL es el borrador.
· ajustes_de_planograma: quién publica (sólo administración, o también el
  equipo). Una fila por clave.
· fotos_de_guia (fase 3, la guía de montaje): la foto de cómo quedó la cara,
  unida a la versión que se montó. No es obligatoria (decisión del dueño).
  Los bytes van en la base, como las planometrías: el disco de Render se borra.

Mismas reglas de forma que `models/participaciones.py`: sólo Integer, String,
Text, Date, DateTime(timezone=True) y ForeignKey; los estados y los tipos son
String validados en el servicio; los % son puntos básicos (10 000 = la cara
entera); `sqlite_autoincrement` en todas; ninguna clave foránea de una tabla a
sí misma.
"""
from datetime import datetime, timezone

from sqlalchemy import Column, Date, DateTime, ForeignKey, Index, Integer, LargeBinary, String, Text, UniqueConstraint

from app.database import Base

#: Qué es un destino (lo elige quien planifica; el dueño los aprobó así).
TIPOS_DE_DESTINO = ("marca_propia", "categoria", "producto", "promocion", "otro")
#: Los colores de los destinos: tokens del tema (`--destino-1` … `--destino-6`).
COLORES_DE_DESTINO = ("d1", "d2", "d3", "d4", "d5", "d6")
#: Quién publica: sólo administración (por defecto) o también el equipo.
QUIEN_PUBLICA = ("admin", "equipo")


def _ahora() -> datetime:
    return datetime.now(timezone.utc)


class Destino(Base):
    """A qué se dedica un lugar de la cara que no es un contrato."""

    __tablename__ = "destinos"
    __table_args__ = (
        Index("ix_destinos_sede", "sede"),
        {"sqlite_autoincrement": True},
    )

    id = Column(Integer, primary_key=True)
    sede = Column(String, nullable=False)
    nombre = Column(String, nullable=False)
    tipo = Column(String, nullable=False)                 # TIPOS_DE_DESTINO
    color = Column(String, nullable=False)                # COLORES_DE_DESTINO
    como_se_monta = Column(Text, nullable=True)           # lo lee la mercaderista
    codigo_externo = Column(String, nullable=True)        # el del ERP del supermercado
    en_la_sede = Column(Integer, nullable=False, default=0)   # 1: se reusa en otros muebles
    creado_en = Column(DateTime(timezone=True), nullable=False, default=_ahora)
    creado_por = Column(String, nullable=True)
    actualizado_en = Column(DateTime(timezone=True), nullable=False, default=_ahora)
    actualizado_por = Column(String, nullable=True)


class Planograma(Base):
    """El planograma de UNA cara: su versión optimista y su borrador."""

    __tablename__ = "planogramas"
    __table_args__ = (
        UniqueConstraint("sede", "fixture_id", "cara", name="uq_planogramas_cara"),
        {"sqlite_autoincrement": True},
    )

    id = Column(Integer, primary_key=True)
    sede = Column(String, nullable=False)
    fixture_id = Column(String, nullable=False)           # `fixture.id` del plano
    cara = Column(String, nullable=False)                 # "A" o "B"
    codigo = Column(String, nullable=True)                # el código de la cara al último guardado (para leer)
    version = Column(Integer, nullable=False, default=1)
    borrador_en = Column(DateTime(timezone=True), nullable=True)   # NULL = no hay borrador
    borrador_por = Column(String, nullable=True)
    actualizado_en = Column(DateTime(timezone=True), nullable=False, default=_ahora)
    actualizado_por = Column(String, nullable=True)


class VersionDePlanograma(Base):
    """Una publicación: la instrucción oficial de montaje desde ``rige_desde``."""

    __tablename__ = "versiones_de_planograma"
    __table_args__ = (
        UniqueConstraint("planograma_id", "numero", name="uq_versiones_de_planograma_numero"),
        {"sqlite_autoincrement": True},
    )

    id = Column(Integer, primary_key=True)
    planograma_id = Column(Integer, ForeignKey("planogramas.id"), nullable=False, index=True)
    numero = Column(Integer, nullable=False)
    rige_desde = Column(Date, nullable=False)
    hasta = Column(Date, nullable=True)                   # opcional (una promoción)
    firma = Column(String, nullable=True)                 # la del mueble al publicar
    publicada_en = Column(DateTime(timezone=True), nullable=False, default=_ahora)
    publicada_por = Column(String, nullable=True)


class PiezaDePlanograma(Base):
    """El lugar de un destino en la cara. ``version_id`` NULL: el borrador."""

    __tablename__ = "piezas_de_planograma"
    __table_args__ = (
        Index("ix_piezas_de_planograma_capa", "planograma_id", "version_id"),
        {"sqlite_autoincrement": True},
    )

    id = Column(Integer, primary_key=True)
    planograma_id = Column(Integer, ForeignKey("planogramas.id"), nullable=False)
    version_id = Column(Integer, ForeignKey("versiones_de_planograma.id"), nullable=True)
    destino_id = Column(Integer, ForeignKey("destinos.id"), nullable=False, index=True)
    puntos_basicos = Column(Integer, nullable=False)      # 1..10000
    # [[u,v],…] cuantizado 1e-6, antihorario; NULL en un borrador: todavía sin ubicar.
    vertices_json = Column(Text, nullable=True)
    orden = Column(Integer, nullable=False, default=0)
    # Sólo en una versión publicada: el destino como era al publicar (nombre,
    # tipo, color, cómo se monta, código). Cambiar el destino después no
    # cambia lo que se publicó.
    foto_json = Column(Text, nullable=True)


class AjusteDePlanograma(Base):
    """Un ajuste del supermercado sobre los planogramas (``quien_publica``)."""

    __tablename__ = "ajustes_de_planograma"
    __table_args__ = (
        UniqueConstraint("clave", name="uq_ajustes_de_planograma_clave"),
        {"sqlite_autoincrement": True},
    )

    id = Column(Integer, primary_key=True)
    clave = Column(String, nullable=False)
    valor = Column(String, nullable=False)
    actualizado_en = Column(DateTime(timezone=True), nullable=False, default=_ahora)
    actualizado_por = Column(String, nullable=True)


class FotoDeGuia(Base):
    """La foto de cómo quedó la cara, subida desde la guía de una versión."""

    __tablename__ = "fotos_de_guia"
    __table_args__ = {"sqlite_autoincrement": True}

    id = Column(Integer, primary_key=True)
    version_id = Column(Integer, ForeignKey("versiones_de_planograma.id"), nullable=False, index=True)
    filename = Column(String, nullable=False)
    content_type = Column(String, nullable=False)
    size = Column(Integer, nullable=False)
    data = Column(LargeBinary, nullable=False)
    # El correo de la sesión, o «enlace» si se subió desde el enlace sin contraseña.
    subida_por = Column(String, nullable=True)
    subida_en = Column(DateTime(timezone=True), nullable=False, default=_ahora)

