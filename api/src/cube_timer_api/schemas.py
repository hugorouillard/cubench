from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

Penalty = Literal["none", "plus2", "dnf"]


class PracticeSessionCreate(BaseModel):
    name: str = Field(min_length=1, max_length=60)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        name = value.strip()
        if not name:
            raise ValueError("name cannot be blank")
        return name


class PracticeSessionUpdate(PracticeSessionCreate):
    pass


class PracticeSession(BaseModel):
    id: UUID
    name: str
    created_at: datetime


class SolveCreate(BaseModel):
    id: UUID
    session_id: UUID
    duration_ms: int = Field(ge=0, le=86_400_000)
    penalty: Penalty = "none"
    scramble: str = Field(min_length=1, max_length=500)
    recorded_at: datetime

    @field_validator("scramble")
    @classmethod
    def clean_scramble(cls, value: str) -> str:
        scramble = value.strip()
        if not scramble:
            raise ValueError("scramble cannot be blank")
        return scramble


class SolveUpdate(BaseModel):
    penalty: Penalty


class Solve(SolveCreate):
    created_at: datetime
