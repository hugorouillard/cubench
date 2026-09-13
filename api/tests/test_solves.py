from datetime import UTC, datetime
from uuid import uuid4

from fastapi.testclient import TestClient

from cubench_api.auth import SESSION_COOKIE


def solve_payload(solve_id: str | None = None) -> dict:
    return {
        "id": solve_id or str(uuid4()),
        "duration_ms": 12340,
        "penalty": "none",
        "scramble": "R U R' U'",
        "recorded_at": datetime.now(UTC).isoformat(),
    }


def test_solve_lifecycle(account_client: TestClient) -> None:
    payload = solve_payload()

    created = account_client.post("/api/solves", json=payload)
    assert created.status_code == 201
    assert created.json()["duration_ms"] == 12340

    listed = account_client.get("/api/solves")
    assert listed.status_code == 200
    assert [solve["id"] for solve in listed.json()] == [payload["id"]]

    updated = account_client.patch(
        f"/api/solves/{payload['id']}", json={"penalty": "plus2"}
    )
    assert updated.status_code == 200
    assert updated.json()["penalty"] == "plus2"

    updated = account_client.patch(
        f"/api/solves/{payload['id']}", json={"duration_ms": 14340}
    )
    assert updated.status_code == 200
    assert updated.json()["duration_ms"] == 14340
    assert updated.json()["penalty"] == "plus2"

    deleted = account_client.delete(f"/api/solves/{payload['id']}")
    assert deleted.status_code == 204
    assert account_client.get("/api/solves").json() == []


def test_solve_update_requires_a_change(account_client: TestClient) -> None:
    response = account_client.patch(f"/api/solves/{uuid4()}", json={})

    assert response.status_code == 422


def test_identical_duplicate_solve_is_idempotent(account_client: TestClient) -> None:
    payload = solve_payload()

    created = account_client.post("/api/solves", json=payload)
    response = account_client.post("/api/solves", json=payload)

    assert created.status_code == 201
    assert response.status_code == 201
    assert response.json() == created.json()


def test_conflicting_duplicate_solve_is_rejected(account_client: TestClient) -> None:
    payload = solve_payload()

    created = account_client.post("/api/solves", json=payload)
    assert created.status_code == 201
    payload["duration_ms"] += 1
    response = account_client.post("/api/solves", json=payload)

    assert response.status_code == 409


def test_solves_are_isolated_by_account(account_client: TestClient) -> None:
    shared_id = str(uuid4())
    account_a_session = account_client.cookies[SESSION_COOKIE]
    created = account_client.post("/api/solves", json=solve_payload(shared_id))
    assert created.status_code == 201

    account_client.cookies.clear()
    response = account_client.post(
        "/api/auth/register",
        json={
            "username": "user-b",
            "password": "test-password",
            "invite_code": "test-invite",
        },
    )
    assert response.status_code == 201
    assert account_client.get("/api/solves").json() == []
    update = account_client.patch(
        f"/api/solves/{shared_id}", json={"penalty": "dnf"}
    )
    assert update.status_code == 404
    assert account_client.delete(f"/api/solves/{shared_id}").status_code == 404
    created = account_client.post("/api/solves", json=solve_payload(shared_id))
    assert created.status_code == 201

    account_client.cookies.set(SESSION_COOKIE, account_a_session)
    assert account_client.get("/api/solves").json()[0]["penalty"] == "none"


def test_solve_routes_require_authentication(client: TestClient) -> None:
    assert client.get("/api/solves").status_code == 401
    assert client.post("/api/solves", json=solve_payload()).status_code == 401
    update = client.patch(f"/api/solves/{uuid4()}", json={"penalty": "dnf"})
    assert update.status_code == 401
    assert client.delete(f"/api/solves/{uuid4()}").status_code == 401
    assert client.get("/api/export").status_code == 401


def test_export_contains_profile_and_solves(account_client: TestClient) -> None:
    account_a_solve = solve_payload()
    account_client.post("/api/solves", json=account_a_solve)

    account_client.cookies.clear()
    account_client.post(
        "/api/auth/register",
        json={
            "username": "user-b",
            "password": "test-password",
            "invite_code": "test-invite",
        },
    )
    account_b_solve = solve_payload()
    account_client.post("/api/solves", json=account_b_solve)

    response = account_client.get("/api/export")

    assert response.status_code == 200
    assert response.json()["version"] == 3
    assert response.json()["profile"]["display_name"] == "user-b"
    assert [solve["id"] for solve in response.json()["solves"]] == [
        account_b_solve["id"]
    ]
    assert "sessions" not in response.json()
