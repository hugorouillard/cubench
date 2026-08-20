from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

Penalty = Literal["none", "plus2", "dnf"]


class ProfileUpdate(BaseModel):
    display_name: str = Field(min_length=1, max_length=40)
    bio: str = Field(max_length=160)

    @field_validator("display_name", "bio", mode="before")
    @classmethod
    def trim_text(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value


class Profile(ProfileUpdate):
    id: int
    created_at: datetime


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


class ExportData(BaseModel):
    version: int
    exported_at: datetime
    profile: Profile
    sessions: list[PracticeSession]
    solves: list[Solve]
