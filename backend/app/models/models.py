import enum
from datetime import date, datetime, timezone
from sqlalchemy import Column, Integer, String, Float, Boolean, Date, DateTime, ForeignKey, Enum as SAEnum, Text, LargeBinary
from sqlalchemy.orm import relationship
from app.database import Base


class SpaceStatus(str, enum.Enum):
    free = "free"
    occupied = "occupied"
    reserved = "reserved"
    maintenance = "maintenance"


class Supplier(Base):
    __tablename__ = "suppliers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, unique=True)
    contact_name = Column(String)
    phone = Column(String)
    email = Column(String)
    notes = Column(Text)

    leases = relationship("SpaceLease", back_populates="supplier")


class Space(Base):
    __tablename__ = "spaces"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String, unique=True, nullable=False)
    svg_id = Column(String, unique=True, nullable=False)
    name = Column(String, nullable=False)
    zone = Column(String, nullable=False)
    sede = Column(String, nullable=True, index=True)
    area_m2 = Column(Float, nullable=False)
    status = Column(SAEnum(SpaceStatus), default=SpaceStatus.free, nullable=False)
    notes = Column(Text)

    leases = relationship("SpaceLease", back_populates="space")

    @property
    def active_lease(self):
        """The lease RUNNING TODAY, or None.

        ``is_active`` alone is not enough: it stays True from the moment a
        lease is created, so a contract signed in August for December used to
        answer here and the space read as occupied for four months it was
        actually free. The dates are the truth; the flag only says the lease
        was not cancelled.
        """
        today = date.today()
        for lease in self.leases:
            if lease.is_active and lease.start_date <= today <= lease.end_date:
                return lease
        return None

    @property
    def upcoming_lease(self):
        """The next lease already signed but not yet started — earliest first.

        Kept separate from ``active_lease`` so "committed" never gets counted
        as "earning". Callers that need to know the space is not sellable for
        that period must consult both.
        """
        today = date.today()
        future = [
            lease for lease in self.leases
            if lease.is_active and lease.start_date > today
        ]
        return min(future, key=lambda x: x.start_date) if future else None


class SpaceLease(Base):
    __tablename__ = "space_leases"

    id = Column(Integer, primary_key=True, index=True)
    space_id = Column(Integer, ForeignKey("spaces.id"), nullable=False)
    supplier_id = Column(Integer, ForeignKey("suppliers.id"), nullable=False)
    marca = Column(String, nullable=True)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    monthly_rent = Column(Float, nullable=False)
    is_active = Column(Boolean, default=True)
    notes = Column(Text)

    space = relationship("Space", back_populates="leases")
    supplier = relationship("Supplier", back_populates="leases")


class LayoutSnapshot(Base):
    """Persists the full fixture layout for one sede.

    One row per sede — upserted on every save so the table never grows unbounded.
    ``fixtures_json`` stores the UnifiedFixture array serialised as a JSON string.
    """
    __tablename__ = "layout_snapshots"

    id = Column(Integer, primary_key=True, index=True)
    sede = Column(String, unique=True, nullable=False, index=True)
    fixtures_json = Column(Text, nullable=False, default="[]")
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class AppConfig(Base):
    """Key/value application configuration (passwords, notification settings).

    Seeded at startup with defaults — see ``app.auth.ensure_default_config``.
    """
    __tablename__ = "app_config"

    key = Column(String, primary_key=True)
    value = Column(Text, nullable=True)


class SpaceFile(Base):
    """Binary attachment (contract PDF / Excel / CSV) linked to a Space.

    Stored in the database because Render's disk is ephemeral.
    """
    __tablename__ = "space_files"

    id = Column(Integer, primary_key=True, index=True)
    space_id = Column(Integer, ForeignKey("spaces.id"), nullable=False, index=True)
    filename = Column(String, nullable=False)
    content_type = Column(String, nullable=False)
    size = Column(Integer, nullable=False)
    data = Column(LargeBinary, nullable=False)
    uploaded_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class MountConfirmation(Base):
    """Prueba de que el espacio contratado se montó — o de por qué no.

    Tabla NUEVA a propósito. La regla del proyecto prohíbe columnas nuevas en
    tablas existentes porque ``create_all`` no las agrega, pero sí crea tablas
    que no existían; y guardar esto acá evita lo alternativo, que era darle al
    mercaderista permiso de escritura sobre el JSON del layout para marcar un
    par de campos.

    Se guarda una fila por confirmación, no una por espacio: el histórico de
    quién dijo qué y cuándo es justamente lo que sirve cuando el proveedor
    reclama que su exhibición nunca se armó.
    """
    __tablename__ = "mount_confirmations"

    id = Column(Integer, primary_key=True, index=True)
    # Se guarda el CÓDIGO y no un FK a spaces: un espacio solo existe en esa
    # tabla si alguna vez se le guardó un contrato, y el montaje puede
    # confirmarse antes de eso.
    space_code = Column(String, nullable=False, index=True)
    sede = Column(String, nullable=True, index=True)
    # "montado" | "no_montado"
    estado = Column(String, nullable=False)
    # Por qué no se pudo, cuando aplica: el proveedor no entregó material, no
    # llegó producto, se cayó por operación de la tienda.
    motivo = Column(String, nullable=True)
    nota = Column(Text, nullable=True)
    # Foto en space_files. Opcional: un "no montado" no siempre tiene qué
    # fotografiar.
    file_id = Column(Integer, ForeignKey("space_files.id"), nullable=True)
    # Rol que reportó. No hay tabla de usuarios; el nombre lo escribe quien
    # confirma, para que el registro diga algo más que "worker".
    reportado_por = Column(String, nullable=True)
    rol = Column(String, nullable=True)
    # La pone el SERVIDOR al recibir, nunca el dispositivo: el EXIF de un
    # celular se edita y no defiende nada ante un reclamo.
    confirmado_en = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True
    )


class NotificationLog(Base):
    """Deduplication log for sent notifications (one row per lease + kind)."""
    __tablename__ = "notification_logs"

    id = Column(Integer, primary_key=True, index=True)
    lease_id = Column(Integer, ForeignKey("space_leases.id"), nullable=False, index=True)
    kind = Column(String, nullable=False)
    sent_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
