from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator

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


class SolveCreate(BaseModel):
    id: UUID
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
    duration_ms: int | None = Field(default=None, ge=0, le=86_400_000)
    penalty: Penalty | None = None

    @model_validator(mode="after")
    def require_update(self) -> "SolveUpdate":
        if self.duration_ms is None and self.penalty is None:
            raise ValueError("an updated duration or penalty is required")
        return self


class Solve(SolveCreate):
    created_at: datetime


class SolveSummary(BaseModel):
    revision: int
    solve_count: int
    completed_count: int
    total_duration_ms: int
    effective_duration_ms: int
    mean_ms: int | None
    best_single_ms: int | None
    best_single_at: datetime | None
    best_single_id: UUID | None
    best_ao5_ms: int | None
    best_ao5_at: datetime | None
    best_ao5_id: UUID | None
    best_ao12_ms: int | None
    best_ao12_at: datetime | None
    best_ao12_id: UUID | None
    best_ao50_ms: int | None
    best_ao50_at: datetime | None
    best_ao50_id: UUID | None
    first_completed_ms: int | None
    earliest_solve_at: datetime | None
    active_days: int
    current_streak: int
    longest_streak: int


class ActivityDay(BaseModel):
    day: str
    attempts: int


class ProgressionPoint(BaseModel):
    id: UUID
    recorded_at: datetime
    attempt_number: int
    single_ms: int
    pb_single_ms: int
    mean_5_ms: int | None
    mean_12_ms: int | None
    mean_50_ms: int | None


class RecentSolve(Solve):
    is_pb: bool


class RecentPage(BaseModel):
    revision: int
    solves: list[RecentSolve]
    next_cursor: UUID | None


class AccountDashboard(BaseModel):
    profile: Profile
    summary: SolveSummary
    activity: list[ActivityDay]
    progression: list[ProgressionPoint]
    recent: RecentPage


class ExportData(BaseModel):
    version: int
    exported_at: datetime
    profile: Profile
    solves: list[Solve]
