from datetime import datetime

from fastapi.testclient import TestClient

from cubench_api.auth import SESSION_COOKIE


def test_default_profile_is_created(account_client: TestClient) -> None:
    response = account_client.get("/api/profile")

    assert response.status_code == 200
    assert response.json()["id"] == 1
    assert response.json()["display_name"] == "user-a"
    assert response.json()["bio"] == ""
    datetime.fromisoformat(response.json()["created_at"])


def test_profile_update_is_trimmed_and_persisted(account_client: TestClient) -> None:
    created_at = account_client.get("/api/profile").json()["created_at"]

    updated = account_client.patch(
        "/api/profile",
        json={"display_name": "  Speed Cuber  ", "bio": "  Sub-20 solver  "},
    )

    assert updated.status_code == 200
    assert updated.json() == {
        "id": 1,
        "display_name": "Speed Cuber",
        "bio": "Sub-20 solver",
        "created_at": created_at,
    }
    assert account_client.get("/api/profile").json() == updated.json()


def test_profile_rejects_blank_display_name(account_client: TestClient) -> None:
    response = account_client.patch(
        "/api/profile", json={"display_name": "   ", "bio": "valid bio"}
    )

    assert response.status_code == 422


def test_profile_rejects_overlong_bio(account_client: TestClient) -> None:
    response = account_client.patch(
        "/api/profile", json={"display_name": "Cube Solver", "bio": "x" * 161}
    )

    assert response.status_code == 422


def test_profiles_are_isolated_by_account(account_client: TestClient) -> None:
    account_a_session = account_client.cookies[SESSION_COOKIE]
    account_client.patch(
        "/api/profile", json={"display_name": "Cuber A", "bio": "first"}
    )

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
    assert account_client.get("/api/profile").json()["display_name"] == "user-b"
    account_client.cookies.set(SESSION_COOKIE, account_a_session)
    assert account_client.get("/api/profile").json()["display_name"] == "Cuber A"


def test_profile_requires_authentication(client: TestClient) -> None:
    assert client.get("/api/profile").status_code == 401
    response = client.patch(
        "/api/profile", json={"display_name": "Cuber", "bio": ""}
    )
    assert response.status_code == 401
