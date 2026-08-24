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
        for lease in self.leases:
            if lease.is_active:
                return lease
        return None


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


class ArchivedSpace(Base):
    """A Space whose sede was deleted from the floor plan.

    Deleting a sede drops its layout, but the rows in ``spaces`` and
    ``space_leases`` are commercial history and are not deleted with it. They
    are archived instead, which does three things the plain delete did not:

    · the active lease is closed, so expiry reminder emails stop going out for
      a sede nobody can see any more;
    · the space's unique ``code`` is freed, so a sede recreated under the same
      name starts clean instead of inheriting the previous one's contracts
      through ``find_or_create_space``, which matches on code alone;
    · ``original_code`` keeps the name the space had, so the history stays
      readable.

    This is a new table on purpose. The schema is created with
    ``Base.metadata.create_all()``, which creates missing tables but never adds
    a column to an existing one, so an ``archived`` flag on ``spaces`` would
    silently never appear on the deployed database.
    """
    __tablename__ = "archived_spaces"

    id = Column(Integer, primary_key=True, index=True)
    space_id = Column(Integer, ForeignKey("spaces.id"), nullable=False, unique=True, index=True)
    sede = Column(String, nullable=False, index=True)
    original_code = Column(String, nullable=False)
    archived_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class NotificationLog(Base):
    """Deduplication log for sent notifications (one row per lease + kind)."""
    __tablename__ = "notification_logs"

    id = Column(Integer, primary_key=True, index=True)
    lease_id = Column(Integer, ForeignKey("space_leases.id"), nullable=False, index=True)
    kind = Column(String, nullable=False)
    sent_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
