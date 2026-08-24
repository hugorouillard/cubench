from fastapi.testclient import TestClient

from cubench_api.database import connect, initialize_database


def test_default_session_is_created(client: TestClient) -> None:
    response = client.get("/api/sessions")

    assert response.status_code == 200
    assert len(response.json()) == 1
    assert response.json()[0]["name"] == "main"


def test_existing_sessions_are_merged_into_the_oldest(client: TestClient) -> None:
    primary_id = client.get("/api/sessions").json()[0]["id"]
    extra_id = "d420bb6c-02a2-475b-928b-f39a8c0f6015"
    solve_id = "6ac51ee0-9093-465e-a162-3af5e244cc42"
    with connect() as connection:
        connection.execute(
            "INSERT INTO practice_sessions (id, name, created_at) VALUES (?, ?, ?)",
            (extra_id, "slow solves", "2099-01-01T00:00:00+00:00"),
        )
        connection.execute(
            """
            INSERT INTO solves (
                id, session_id, duration_ms, penalty, scramble,
                recorded_at, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                solve_id,
                extra_id,
                12340,
                "none",
                "R U R' U'",
                "2026-01-01T00:00:00+00:00",
                "2026-01-01T00:00:00+00:00",
            ),
        )
        connection.commit()

    initialize_database()

    sessions = client.get("/api/sessions").json()
    assert len(sessions) == 1
    assert sessions[0]["id"] == primary_id
    assert sessions[0]["name"] == "main"
    assert client.get("/api/solves").json()[0]["session_id"] == primary_id


def test_sessions_cannot_be_created(client: TestClient) -> None:
    assert client.post("/api/sessions", json={"name": "extra"}).status_code == 405
