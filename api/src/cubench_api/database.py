import sqlite3
from collections.abc import Generator
from contextlib import contextmanager
from pathlib import Path

from cubench_api.config import load_runtime_config

CURRENT_SCHEMA_VERSION = 1


class SchemaError(RuntimeError):
    pass


def _open_database(path: Path, mode: str = "rw") -> sqlite3.Connection:
    uri = f"{path.resolve().as_uri()}?mode={mode}"
    connection = sqlite3.connect(uri, uri=True)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    connection.execute("PRAGMA busy_timeout = 5000")
    return connection


@contextmanager
def connect(path: Path | None = None) -> Generator[sqlite3.Connection]:
    connection = _open_database(path or load_runtime_config().db_path)
    try:
        yield connection
    finally:
        connection.close()


def initialize_database(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path)
    connection.row_factory = sqlite3.Row
    try:
        version = connection.execute("PRAGMA user_version").fetchone()[0]
        tables = connection.execute(
            """
            SELECT name FROM sqlite_master
            WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
            """
        ).fetchall()

        if version == 0 and tables:
            raise SchemaError(
                "This pre-release database is not supported; reset it and restart"
            )
        if version not in {0, CURRENT_SCHEMA_VERSION}:
            raise SchemaError(
                f"Database schema version {version} is not supported; "
                f"expected {CURRENT_SCHEMA_VERSION}"
            )
        if version == CURRENT_SCHEMA_VERSION:
            return

        connection.execute("PRAGMA journal_mode = WAL")
        connection.executescript(
            f"""
            BEGIN IMMEDIATE;

            CREATE TABLE accounts (
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

            CREATE TABLE auth_sessions (
                token_hash TEXT PRIMARY KEY,
                account_id INTEGER NOT NULL REFERENCES accounts(id)
                    ON DELETE CASCADE,
                expires_at INTEGER NOT NULL
            );

            CREATE TABLE solves (
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

            CREATE INDEX solves_account_recorded_at
            ON solves(account_id, recorded_at DESC, id DESC);

            PRAGMA user_version = {CURRENT_SCHEMA_VERSION};
            COMMIT;
            """
        )
    finally:
        connection.close()


def database_is_ready(path: Path) -> bool:
    try:
        connection = _open_database(path, "ro")
        try:
            version = connection.execute("PRAGMA user_version").fetchone()[0]
            query_ok = connection.execute("SELECT 1").fetchone()[0] == 1
            return version == CURRENT_SCHEMA_VERSION and query_ok
        finally:
            connection.close()
    except (OSError, sqlite3.Error):
        return False
