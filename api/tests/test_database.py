from fastapi.testclient import TestClient

from cubench_api.database import connect, initialize_database


def test_initialization_creates_current_schema(client: TestClient) -> None:
    initialize_database()

    with connect() as connection:
        tables = {
            row["name"]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
            )
        }
        account_columns = {
            row["name"]
            for row in connection.execute("PRAGMA table_info(accounts)")
        }

    assert {"accounts", "auth_sessions", "solves"} <= tables
    assert {"username", "password_hash"} <= account_columns
