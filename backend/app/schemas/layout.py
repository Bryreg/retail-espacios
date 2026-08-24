from datetime import datetime
from typing import Any
from pydantic import BaseModel, ConfigDict, Field


class LayoutIn(BaseModel):
    fixtures: list[Any] = Field(default=[], max_length=2000)
    # Revision the client started from, echoed back from a previous GET/PUT.
    # When present the server rejects the write if someone else saved in between
    # (optimistic concurrency). Absent means "overwrite unconditionally".
    base_updated_at: datetime | None = None


class LayoutOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    sede: str
    fixtures: list[Any]
    updated_at: datetime | None = None


class LayoutRevision(BaseModel):
    """Cheap polling payload — the revision of one sede without its fixtures."""
    model_config = ConfigDict(from_attributes=True)

    sede: str
    updated_at: datetime | None = None
    count: int = 0


class LayoutSettingsIn(BaseModel):
    """Shared, non-fixture layout state that every workstation must agree on."""
    sedes: list[str] = Field(default=[], max_length=100)
    catalog_labels: dict[str, str] = Field(default={})


class LayoutSettingsOut(LayoutSettingsIn):
    updated_at: datetime | None = None


class ReferenceRatesIn(BaseModel):
    """Monthly reference rate (COP) per fixture type.

    ``default`` applies everywhere; ``by_sede`` overrides one type's rate for a
    single sede. Rates are money, so unlike the layout settings these are
    admin-only in BOTH directions — a worker must never read them.
    """
    default: dict[str, float] = Field(default={})
    by_sede: dict[str, dict[str, float]] = Field(default={})


class ReferenceRatesOut(ReferenceRatesIn):
    updated_at: datetime | None = None
