from datetime import UTC, datetime
from uuid import uuid4

from fastapi.testclient import TestClient


def solve_payload(session_id: str) -> dict:
    return {
        "id": str(uuid4()),
        "session_id": session_id,
        "duration_ms": 12340,
        "penalty": "none",
        "scramble": "R U R' U'",
        "recorded_at": datetime.now(UTC).isoformat(),
    }


def test_solve_lifecycle(client: TestClient) -> None:
    session_id = client.get("/api/sessions").json()[0]["id"]
    payload = solve_payload(session_id)

    created = client.post("/api/solves", json=payload)
    assert created.status_code == 201
    assert created.json()["duration_ms"] == 12340

    listed = client.get(f"/api/solves?session_id={session_id}")
    assert listed.status_code == 200
    assert [solve["id"] for solve in listed.json()] == [payload["id"]]

    updated = client.patch(
        f"/api/solves/{payload['id']}", json={"penalty": "plus2"}
    )
    assert updated.status_code == 200
    assert updated.json()["penalty"] == "plus2"

    deleted = client.delete(f"/api/solves/{payload['id']}")
    assert deleted.status_code == 204
    assert client.get("/api/solves").json() == []


def test_solve_requires_an_existing_session(client: TestClient) -> None:
    response = client.post("/api/solves", json=solve_payload(str(uuid4())))

    assert response.status_code == 404


def test_duplicate_solve_is_rejected(client: TestClient) -> None:
    session_id = client.get("/api/sessions").json()[0]["id"]
    payload = solve_payload(session_id)

    assert client.post("/api/solves", json=payload).status_code == 201
    response = client.post("/api/solves", json=payload)

    assert response.status_code == 409


def test_export_contains_profile_sessions_and_solves(client: TestClient) -> None:
    session_id = client.get("/api/sessions").json()[0]["id"]
    payload = solve_payload(session_id)
    client.post("/api/solves", json=payload)

    response = client.get("/api/export")

    assert response.status_code == 200
    assert response.json()["version"] == 2
    assert response.json()["profile"]["display_name"] == "Cube Solver"
    assert response.json()["sessions"][0]["id"] == session_id
    assert response.json()["solves"][0]["id"] == payload["id"]
