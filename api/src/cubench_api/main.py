import sqlite3
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID, uuid4

from fastapi import FastAPI, HTTPException, Query, Response, status

from cubench_api.database import connect, initialize_database
from cubench_api.schemas import (
    ExportData,
    PracticeSession,
    Profile,
    ProfileUpdate,
    Solve,
    SolveCreate,
    SolveUpdate,
)


@asynccontextmanager
async def lifespan(_: FastAPI):
    initialize_database()
    yield


app = FastAPI(title="Cubench API", lifespan=lifespan)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/profile", response_model=Profile)
def get_profile() -> dict:
    with connect() as connection:
        row = connection.execute(
            "SELECT id, display_name, bio, created_at FROM local_profile WHERE id = 1"
        ).fetchone()
    return dict(row)


@app.patch("/api/profile", response_model=Profile)
def update_profile(payload: ProfileUpdate) -> dict:
    with connect() as connection:
        connection.execute(
            "UPDATE local_profile SET display_name = ?, bio = ? WHERE id = 1",
            (payload.display_name, payload.bio),
        )
        connection.commit()
        row = connection.execute(
            "SELECT id, display_name, bio, created_at FROM local_profile WHERE id = 1"
        ).fetchone()
    return dict(row)


@app.get("/api/sessions", response_model=list[PracticeSession])
def list_sessions() -> list[dict]:
    with connect() as connection:
        rows = connection.execute(
            "SELECT id, name, created_at FROM practice_sessions ORDER BY created_at"
        ).fetchall()
    return [dict(row) for row in rows]


@app.get("/api/solves", response_model=list[Solve])
def list_solves(
    session_id: Annotated[UUID | None, Query()] = None,
) -> list[dict]:
    query = (
        "SELECT id, session_id, duration_ms, penalty, scramble, recorded_at, "
        "created_at FROM solves"
    )
    parameters: tuple[str, ...] = ()
    if session_id:
        query += " WHERE session_id = ?"
        parameters = (str(session_id),)
    query += " ORDER BY recorded_at DESC"
    with connect() as connection:
        rows = connection.execute(query, parameters).fetchall()
    return [dict(row) for row in rows]


@app.delete("/api/solves", status_code=status.HTTP_204_NO_CONTENT)
def clear_solves() -> Response:
    with connect() as connection:
        connection.execute("DELETE FROM solves")
        connection.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.post(
    "/api/solves", response_model=Solve, status_code=status.HTTP_201_CREATED
)
def create_solve(payload: SolveCreate) -> dict:
    solve = {
        **payload.model_dump(mode="json"),
        "created_at": datetime.now(UTC).isoformat(),
    }
    try:
        with connect() as connection:
            connection.execute(
                """
                INSERT INTO solves (
                    id, session_id, duration_ms, penalty, scramble,
                    recorded_at, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                tuple(solve.values()),
            )
            connection.commit()
    except sqlite3.IntegrityError as error:
        message = str(error)
        if "FOREIGN KEY" in message:
            raise HTTPException(status_code=404, detail="Session not found") from error
        raise HTTPException(status_code=409, detail="Solve already exists") from error
    return solve


@app.patch("/api/solves/{solve_id}", response_model=Solve)
def update_solve(solve_id: UUID, payload: SolveUpdate) -> dict:
    with connect() as connection:
        cursor = connection.execute(
            """
            UPDATE solves
            SET duration_ms = COALESCE(?, duration_ms),
                penalty = COALESCE(?, penalty)
            WHERE id = ?
            """,
            (payload.duration_ms, payload.penalty, str(solve_id)),
        )
        connection.commit()
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Solve not found")
        row = connection.execute(
            """
            SELECT id, session_id, duration_ms, penalty, scramble,
                   recorded_at, created_at
            FROM solves WHERE id = ?
            """,
            (str(solve_id),),
        ).fetchone()
    return dict(row)


@app.delete("/api/solves/{solve_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_solve(solve_id: UUID) -> Response:
    with connect() as connection:
        cursor = connection.execute(
            "DELETE FROM solves WHERE id = ?", (str(solve_id),)
        )
        connection.commit()
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Solve not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/api/export", response_model=ExportData)
def export_data() -> dict:
    with connect() as connection:
        profile = connection.execute(
            "SELECT id, display_name, bio, created_at FROM local_profile WHERE id = 1"
        ).fetchone()
        sessions = connection.execute(
            "SELECT id, name, created_at FROM practice_sessions ORDER BY created_at"
        ).fetchall()
        solves = connection.execute(
            """
            SELECT id, session_id, duration_ms, penalty, scramble,
                   recorded_at, created_at
            FROM solves ORDER BY recorded_at
            """
        ).fetchall()
    return {
        "version": 2,
        "exported_at": datetime.now(UTC).isoformat(),
        "profile": dict(profile),
        "sessions": [dict(row) for row in sessions],
        "solves": [dict(row) for row in solves],
    }
