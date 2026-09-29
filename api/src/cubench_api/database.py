import sqlite3
from collections.abc import Generator
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path

from cubench_api.config import load_runtime_config

CURRENT_SCHEMA_VERSION = 3


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
        if version not in {0, 1, 2, CURRENT_SCHEMA_VERSION}:
            raise SchemaError(
                f"Database schema version {version} is not supported; "
                f"expected {CURRENT_SCHEMA_VERSION}"
            )
        if version == CURRENT_SCHEMA_VERSION:
            return

        if version == 0:
            connection.execute("PRAGMA journal_mode = WAL")
            connection.executescript(
                """
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

                PRAGMA user_version = 1;
                COMMIT;
                """
            )

        from cubench_api.summary import normalize_recorded_at, rebuild_summary

        if version in (0, 1):
            connection.execute("BEGIN IMMEDIATE")
            try:
                connection.execute(
                    """CREATE TABLE solve_summaries (
                        account_id INTEGER PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
                        solve_count INTEGER NOT NULL,
                        completed_count INTEGER NOT NULL,
                        total_duration_ms INTEGER NOT NULL,
                        effective_duration_ms INTEGER NOT NULL,
                        best_single_ms INTEGER,
                        best_single_at TEXT,
                        best_single_id TEXT,
                        best_ao5_ms INTEGER,
                        best_ao5_at TEXT,
                        best_ao5_id TEXT,
                        best_ao12_ms INTEGER,
                        best_ao12_at TEXT,
                        best_ao12_id TEXT,
                        last_recorded_at TEXT,
                        last_id TEXT
                    )"""
                )
                if version == 1:
                    # Earlier releases preserved client timezone and precision.
                    for solve in connection.execute(
                        "SELECT account_id, id, recorded_at FROM solves"
                    ).fetchall():
                        connection.execute(
                            "UPDATE solves SET recorded_at = ? WHERE account_id = ? AND id = ?",
                            (
                                normalize_recorded_at(datetime.fromisoformat(solve["recorded_at"])),
                                solve["account_id"],
                                solve["id"],
                            ),
                        )
                connection.execute("PRAGMA user_version = 2")
                connection.commit()
            except Exception:
                connection.rollback()
                raise

        connection.execute("BEGIN IMMEDIATE")
        try:
            for column, definition in (
                ("revision", "INTEGER NOT NULL DEFAULT 0"),
                ("best_ao50_ms", "INTEGER"),
                ("best_ao50_at", "TEXT"),
                ("best_ao50_id", "TEXT"),
                ("first_completed_ms", "INTEGER"),
                ("earliest_solve_at", "TEXT"),
                ("active_days", "INTEGER NOT NULL DEFAULT 0"),
                ("longest_streak", "INTEGER NOT NULL DEFAULT 0"),
                ("last_active_day", "TEXT"),
                ("ending_streak", "INTEGER NOT NULL DEFAULT 0"),
            ):
                connection.execute(f"ALTER TABLE solve_summaries ADD COLUMN {column} {definition}")
            connection.execute(
                """CREATE TABLE daily_activity (
                    account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
                    day TEXT NOT NULL, attempts INTEGER NOT NULL,
                    PRIMARY KEY (account_id, day)
                )"""
            )
            connection.execute(
                """CREATE TABLE solve_progression (
                    account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
                    id TEXT NOT NULL, recorded_at TEXT NOT NULL,
                    attempt_number INTEGER NOT NULL,
                    single_ms INTEGER, pb_single_ms INTEGER,
                    mean_5_ms INTEGER, mean_12_ms INTEGER, mean_50_ms INTEGER,
                    is_pb INTEGER NOT NULL,
                    PRIMARY KEY (account_id, id)
                )"""
            )
            connection.execute(
                "CREATE INDEX progression_account_order ON solve_progression(account_id, recorded_at, id)"
            )
            for account in connection.execute("SELECT id FROM accounts"):
                rebuild_summary(connection, account["id"])
            connection.execute(f"PRAGMA user_version = {CURRENT_SCHEMA_VERSION}")
            connection.commit()
        except Exception:
            connection.rollback()
            raise
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
