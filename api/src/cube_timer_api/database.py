import os
import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from uuid import uuid4


def database_path() -> Path:
    configured_path = os.getenv("CUBE_TIMER_DB_PATH")
    if configured_path:
        return Path(configured_path)
    return Path(__file__).resolve().parents[2] / "data" / "cube_timer.db"


@contextmanager
def connect() -> Iterator[sqlite3.Connection]:
    path = database_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    try:
        yield connection
    finally:
        connection.close()


def initialize_database() -> None:
    with connect() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS practice_sessions (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 60),
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS solves (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL REFERENCES practice_sessions(id)
                    ON DELETE CASCADE,
                duration_ms INTEGER NOT NULL CHECK (duration_ms >= 0),
                penalty TEXT NOT NULL DEFAULT 'none'
                    CHECK (penalty IN ('none', 'plus2', 'dnf')),
                scramble TEXT NOT NULL CHECK (length(trim(scramble)) > 0),
                recorded_at TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS solves_session_recorded_at
                ON solves(session_id, recorded_at DESC);
            """
        )
        session_count = connection.execute(
            "SELECT count(*) FROM practice_sessions"
        ).fetchone()[0]
        if session_count == 0:
            connection.execute(
                "INSERT INTO practice_sessions (id, name, created_at) "
                "VALUES (?, 'main', datetime('now'))",
                (str(uuid4()),),
            )
        connection.commit()
