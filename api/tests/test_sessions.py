from fastapi.testclient import TestClient


def test_default_session_is_created(client: TestClient) -> None:
    response = client.get("/api/sessions")

    assert response.status_code == 200
    assert len(response.json()) == 1
    assert response.json()[0]["name"] == "main"


def test_session_lifecycle(client: TestClient) -> None:
    created = client.post("/api/sessions", json={"name": "  slow solves  "})
    assert created.status_code == 201
    assert created.json()["name"] == "slow solves"

    session_id = created.json()["id"]
    updated = client.patch(
        f"/api/sessions/{session_id}", json={"name": "lookahead"}
    )
    assert updated.status_code == 200
    assert updated.json()["name"] == "lookahead"

    deleted = client.delete(f"/api/sessions/{session_id}")
    assert deleted.status_code == 204
    assert len(client.get("/api/sessions").json()) == 1


def test_only_session_cannot_be_deleted(client: TestClient) -> None:
    session_id = client.get("/api/sessions").json()[0]["id"]

    response = client.delete(f"/api/sessions/{session_id}")

    assert response.status_code == 409
