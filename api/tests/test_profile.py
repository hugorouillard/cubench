from datetime import datetime

from fastapi.testclient import TestClient


def test_default_profile_is_created(client: TestClient) -> None:
    response = client.get("/api/profile")

    assert response.status_code == 200
    assert response.json()["id"] == 1
    assert response.json()["display_name"] == "Cube Solver"
    assert response.json()["bio"] == ""
    datetime.fromisoformat(response.json()["created_at"])


def test_profile_update_is_trimmed_and_persisted(client: TestClient) -> None:
    created_at = client.get("/api/profile").json()["created_at"]

    updated = client.patch(
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
    assert client.get("/api/profile").json() == updated.json()


def test_profile_rejects_blank_display_name(client: TestClient) -> None:
    response = client.patch(
        "/api/profile", json={"display_name": "   ", "bio": "valid bio"}
    )

    assert response.status_code == 422


def test_profile_rejects_overlong_bio(client: TestClient) -> None:
    response = client.patch(
        "/api/profile", json={"display_name": "Cube Solver", "bio": "x" * 161}
    )

    assert response.status_code == 422
