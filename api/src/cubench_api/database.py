import os
import sqlite3
from collections.abc import Generator
from contextlib import contextmanager
from pathlib import Path
from uuid import uuid4


def database_path() -> Path:
    configured_path = os.getenv("CUBENCH_DB_PATH")
    if configured_path:
        return Path(configured_path)
    return Path(__file__).resolve().parents[2] / "data" / "cubench.db"


@contextmanager
def connect() -> Generator[sqlite3.Connection]:
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

            CREATE TABLE IF NOT EXISTS local_profile (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                display_name TEXT NOT NULL
                    CHECK (length(trim(display_name)) BETWEEN 1 AND 40),
                bio TEXT NOT NULL DEFAULT ''
                    CHECK (length(trim(bio)) <= 160),
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS accounts (
                id INTEGER PRIMARY KEY,
                username TEXT NOT NULL UNIQUE COLLATE NOCASE
                    CHECK (length(username) BETWEEN 3 AND 32),
                password_hash TEXT NOT NULL,
                display_name TEXT NOT NULL
                    CHECK (length(trim(display_name)) BETWEEN 1 AND 40),
                bio TEXT NOT NULL DEFAULT ''
                    CHECK (length(trim(bio)) <= 160),
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS auth_sessions (
                token_hash TEXT PRIMARY KEY,
                account_id INTEGER NOT NULL REFERENCES accounts(id)
                    ON DELETE CASCADE,
                expires_at INTEGER NOT NULL
            );
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
        else:
            primary_session_id = connection.execute(
                "SELECT id FROM practice_sessions ORDER BY created_at, id LIMIT 1"
            ).fetchone()[0]
            connection.execute(
                "UPDATE solves SET session_id = ? WHERE session_id != ?",
                (primary_session_id, primary_session_id),
            )
            connection.execute(
                "DELETE FROM practice_sessions WHERE id != ?", (primary_session_id,)
            )
            connection.execute(
                "UPDATE practice_sessions SET name = 'main' WHERE id = ?",
                (primary_session_id,),
            )
        connection.execute(
            """
            INSERT OR IGNORE INTO local_profile (id, display_name, bio, created_at)
            VALUES (1, 'Cube Solver', '', datetime('now'))
            """
        )
        connection.commit()
