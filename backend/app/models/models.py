import enum
from datetime import date, datetime
from sqlalchemy import Column, Integer, String, Float, Boolean, Date, DateTime, ForeignKey, Enum as SAEnum, Text
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
    name = Column(String, nullable=False)
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
    sede = Column(String, nullable=True)
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
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
