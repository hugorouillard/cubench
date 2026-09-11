import os
import sqlite3
from collections.abc import Generator
from contextlib import contextmanager
from pathlib import Path


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
    connection.execute("PRAGMA busy_timeout = 5000")
    try:
        yield connection
    finally:
        connection.close()


def initialize_database() -> None:
    with connect() as connection:
        connection.execute("PRAGMA journal_mode = WAL")
        connection.executescript(
            """
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

            CREATE TABLE IF NOT EXISTS solves (
                account_id INTEGER NOT NULL REFERENCES accounts(id)
                    ON DELETE CASCADE,
                id TEXT NOT NULL,
                duration_ms INTEGER NOT NULL CHECK (duration_ms >= 0),
                penalty TEXT NOT NULL DEFAULT 'none'
                    CHECK (penalty IN ('none', 'plus2', 'dnf')),
                scramble TEXT NOT NULL CHECK (length(trim(scramble)) > 0),
                recorded_at TEXT NOT NULL,
                created_at TEXT NOT NULL,
                PRIMARY KEY (account_id, id)
            );

            CREATE INDEX IF NOT EXISTS solves_account_recorded_at
            ON solves(account_id, recorded_at DESC, id DESC);
            """
        )
