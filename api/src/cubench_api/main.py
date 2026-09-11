import sqlite3
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from uuid import UUID

from fastapi import FastAPI, HTTPException, Response, status

from cubench_api.auth import AccountDependency, router as auth_router
from cubench_api.database import connect, initialize_database
from cubench_api.schemas import (
    ExportData,
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
app.include_router(auth_router)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/profile", response_model=Profile)
def get_profile(account: AccountDependency) -> dict:
    return account.model_dump()


@app.patch("/api/profile", response_model=Profile)
def update_profile(payload: ProfileUpdate, account: AccountDependency) -> dict:
    with connect() as connection:
        connection.execute(
            "UPDATE accounts SET display_name = ?, bio = ? WHERE id = ?",
            (payload.display_name, payload.bio, account.id),
        )
        row = connection.execute(
            "SELECT id, display_name, bio, created_at FROM accounts WHERE id = ?",
            (account.id,),
        ).fetchone()
        connection.commit()
    return dict(row)


@app.get("/api/solves", response_model=list[Solve])
def list_solves(account: AccountDependency) -> list[dict]:
    with connect() as connection:
        rows = connection.execute(
            """
            SELECT id, duration_ms, penalty, scramble, recorded_at, created_at
            FROM solves WHERE account_id = ?
            ORDER BY recorded_at DESC, id DESC
            """,
            (account.id,),
        ).fetchall()
    return [dict(row) for row in rows]


@app.post(
    "/api/solves", response_model=Solve, status_code=status.HTTP_201_CREATED
)
def create_solve(payload: SolveCreate, account: AccountDependency) -> dict:
    solve = {
        **payload.model_dump(mode="json"),
        "created_at": datetime.now(UTC).isoformat(),
    }
    try:
        with connect() as connection:
            connection.execute(
                """
                INSERT INTO solves (
                    account_id, id, duration_ms, penalty, scramble,
                    recorded_at, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (account.id, *solve.values()),
            )
            connection.commit()
    except sqlite3.IntegrityError as error:
        if "UNIQUE constraint failed" in str(error):
            with connect() as connection:
                row = connection.execute(
                    """
                    SELECT id, duration_ms, penalty, scramble, recorded_at, created_at
                    FROM solves WHERE account_id = ? AND id = ?
                    """,
                    (account.id, str(payload.id)),
                ).fetchone()
            expected = payload.model_dump(mode="json")
            if row and all(row[key] == value for key, value in expected.items()):
                return dict(row)
        raise HTTPException(status_code=409, detail="Solve already exists") from error
    return solve


@app.patch("/api/solves/{solve_id}", response_model=Solve)
def update_solve(
    solve_id: UUID, payload: SolveUpdate, account: AccountDependency
) -> dict:
    with connect() as connection:
        cursor = connection.execute(
            """
            UPDATE solves
            SET duration_ms = COALESCE(?, duration_ms),
                penalty = COALESCE(?, penalty)
            WHERE account_id = ? AND id = ?
            """,
            (payload.duration_ms, payload.penalty, account.id, str(solve_id)),
        )
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Solve not found")
        row = connection.execute(
            """
            SELECT id, duration_ms, penalty, scramble, recorded_at, created_at
            FROM solves WHERE account_id = ? AND id = ?
            """,
            (account.id, str(solve_id)),
        ).fetchone()
        connection.commit()
    return dict(row)


@app.delete("/api/solves/{solve_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_solve(solve_id: UUID, account: AccountDependency) -> Response:
    with connect() as connection:
        cursor = connection.execute(
            "DELETE FROM solves WHERE account_id = ? AND id = ?",
            (account.id, str(solve_id)),
        )
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Solve not found")
        connection.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/api/export", response_model=ExportData)
def export_data(account: AccountDependency) -> dict:
    with connect() as connection:
        profile = connection.execute(
            "SELECT id, display_name, bio, created_at FROM accounts WHERE id = ?",
            (account.id,),
        ).fetchone()
        solves = connection.execute(
            """
            SELECT id, duration_ms, penalty, scramble, recorded_at, created_at
            FROM solves WHERE account_id = ? ORDER BY recorded_at, id
            """,
            (account.id,),
        ).fetchall()
    return {
        "version": 3,
        "exported_at": datetime.now(UTC).isoformat(),
        "profile": dict(profile),
        "solves": [dict(row) for row in solves],
    }
