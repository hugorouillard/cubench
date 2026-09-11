import sqlite3

from fastapi.testclient import TestClient

from cubench_api.database import connect, initialize_database


def test_account_schema_replaces_prototype_tables(client: TestClient) -> None:
    with connect() as connection:
        tables = {
            row["name"]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
            )
        }
        version = connection.execute("PRAGMA user_version").fetchone()[0]

    assert version == 1
    assert {"accounts", "auth_sessions", "solves"} <= tables
    assert "practice_sessions" not in tables
    assert "local_profile" not in tables


def test_migration_preserves_accounts_and_resets_unowned_solves(
    tmp_path, monkeypatch
) -> None:
    path = tmp_path / "prototype.db"
    monkeypatch.setenv("CUBENCH_DB_PATH", str(path))
    with sqlite3.connect(path) as connection:
        connection.executescript(
            """
            CREATE TABLE accounts (
                id INTEGER PRIMARY KEY,
                username TEXT NOT NULL UNIQUE COLLATE NOCASE,
                password_hash TEXT NOT NULL,
                display_name TEXT NOT NULL,
                bio TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL
            );
            CREATE TABLE auth_sessions (
                token_hash TEXT PRIMARY KEY,
                account_id INTEGER NOT NULL REFERENCES accounts(id),
                expires_at INTEGER NOT NULL
            );
            CREATE TABLE practice_sessions (id TEXT PRIMARY KEY);
            CREATE TABLE solves (id TEXT PRIMARY KEY, session_id TEXT NOT NULL);
            CREATE TABLE local_profile (id INTEGER PRIMARY KEY);
            INSERT INTO accounts VALUES (
                1, 'cuber', 'hash', 'Cuber', '', '2026-01-01T00:00:00+00:00'
            );
            INSERT INTO auth_sessions VALUES ('token-hash', 1, 2000000000);
            INSERT INTO practice_sessions VALUES ('session');
            INSERT INTO solves VALUES ('solve', 'session');
            INSERT INTO local_profile VALUES (1);
            """
        )

    initialize_database()

    with connect() as connection:
        username = connection.execute("SELECT username FROM accounts").fetchone()[0]
        session_count = connection.execute(
            "SELECT count(*) FROM auth_sessions"
        ).fetchone()[0]
        solve_count = connection.execute("SELECT count(*) FROM solves").fetchone()[0]
        tables = {
            row["name"]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
            )
        }

        assert username == "cuber"
        assert session_count == 1
        assert solve_count == 0
        assert "practice_sessions" not in tables
        assert "local_profile" not in tables
