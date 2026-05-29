from datetime import datetime
from typing import Any
from pydantic import BaseModel, ConfigDict


class LayoutIn(BaseModel):
    fixtures: list[Any]


class LayoutOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    sede: str
    fixtures: list[Any]
    updated_at: datetime | None = None
