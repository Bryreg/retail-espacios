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
