import sqlite3

import pytest

from cubench_api.database import (
    CURRENT_SCHEMA_VERSION,
    SchemaError,
    connect,
    initialize_database,
)


def test_initialization_creates_the_versioned_schema(tmp_path) -> None:
    path = tmp_path / "cubench.db"

    initialize_database(path)

    with connect(path) as connection:
        tables = {
            row["name"]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
            )
        }
        version = connection.execute("PRAGMA user_version").fetchone()[0]
        journal_mode = connection.execute("PRAGMA journal_mode").fetchone()[0]
    assert {"accounts", "auth_sessions", "solves", "solve_summaries"} <= tables
    assert version == CURRENT_SCHEMA_VERSION
    assert journal_mode == "wal"


def test_initialization_is_idempotent(tmp_path) -> None:
    path = tmp_path / "cubench.db"
    initialize_database(path)

    initialize_database(path)

    with connect(path) as connection:
        assert connection.execute("PRAGMA user_version").fetchone()[0] == CURRENT_SCHEMA_VERSION


def test_v1_migration_backfills_existing_accounts_and_solves(tmp_path) -> None:
    path = tmp_path / "cubench.db"
    initialize_database(path)
    with connect(path) as connection:
        connection.execute("DROP TABLE solve_progression")
        connection.execute("DROP TABLE daily_activity")
        connection.execute("DROP TABLE solve_summaries")
        connection.execute("PRAGMA user_version = 1")
        connection.execute(
            """INSERT INTO accounts (id, username, password_hash, display_name, created_at)
               VALUES (1, 'solver', 'hash', 'Solver', '2026-01-01T00:00:00Z')"""
        )
        connection.execute(
            """INSERT INTO solves (account_id, id, duration_ms, penalty, scramble,
               recorded_at, created_at) VALUES (1, 'old', 12000, 'plus2', 'R U',
               '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')"""
        )
        connection.commit()

    initialize_database(path)

    with connect(path) as connection:
        row = connection.execute(
            "SELECT * FROM solve_summaries WHERE account_id = 1"
        ).fetchone()
        assert row["solve_count"] == 1
        assert row["best_single_ms"] == 14000
        assert connection.execute("PRAGMA user_version").fetchone()[0] == CURRENT_SCHEMA_VERSION
    initialize_database(path)


def test_v2_migration_rebuilds_projections(tmp_path) -> None:
    path = tmp_path / "cubench.db"
    initialize_database(path)
    with connect(path) as connection:
        connection.execute("DROP TABLE solve_progression")
        connection.execute("DROP TABLE daily_activity")
        connection.execute("DROP TABLE solve_summaries")
        connection.execute("""CREATE TABLE solve_summaries (
            account_id INTEGER PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
            solve_count INTEGER NOT NULL, completed_count INTEGER NOT NULL,
            total_duration_ms INTEGER NOT NULL, effective_duration_ms INTEGER NOT NULL,
            best_single_ms INTEGER, best_single_at TEXT, best_single_id TEXT,
            best_ao5_ms INTEGER, best_ao5_at TEXT, best_ao5_id TEXT,
            best_ao12_ms INTEGER, best_ao12_at TEXT, best_ao12_id TEXT,
            last_recorded_at TEXT, last_id TEXT
        )""")
        connection.execute("PRAGMA user_version = 2")
        connection.execute("""INSERT INTO accounts (id, username, password_hash, display_name, created_at)
                              VALUES (1, 'solver', 'hash', 'Solver', '2026-01-01T00:00:00Z')""")
        connection.execute("""INSERT INTO solves
            (account_id, id, duration_ms, penalty, scramble, recorded_at, created_at)
            VALUES (1, 'old', 12000, 'none', 'R U',
                    '2026-01-01T00:00:00.000000Z', '2026-01-01T00:00:00Z')""")
        connection.commit()

    initialize_database(path)

    with connect(path) as connection:
        assert connection.execute("PRAGMA user_version").fetchone()[0] == CURRENT_SCHEMA_VERSION
        assert connection.execute("SELECT best_single_ms FROM solve_summaries").fetchone()[0] == 12000
        assert connection.execute("SELECT attempts FROM daily_activity").fetchone()[0] == 1
        assert connection.execute("SELECT is_pb FROM solve_progression").fetchone()[0] == 1


def test_initialization_rejects_a_pre_release_database(tmp_path) -> None:
    path = tmp_path / "prototype.db"
    with sqlite3.connect(path) as connection:
        connection.execute("CREATE TABLE solves (id TEXT PRIMARY KEY)")

    with pytest.raises(SchemaError, match="pre-release"):
        initialize_database(path)


def test_initialization_rejects_an_unsupported_version(tmp_path) -> None:
    path = tmp_path / "future.db"
    with sqlite3.connect(path) as connection:
        connection.execute(f"PRAGMA user_version = {CURRENT_SCHEMA_VERSION + 1}")

    with pytest.raises(SchemaError, match="not supported"):
        initialize_database(path)
