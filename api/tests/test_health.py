from fastapi.testclient import TestClient


def test_liveness_is_public(client: TestClient) -> None:
    response = client.get("/api/health/live")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_readiness_checks_the_database(client: TestClient) -> None:
    response = client.get("/api/health/ready")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_readiness_fails_when_database_disappears(client: TestClient) -> None:
    client.app.state.runtime_config.db_path.unlink()

    response = client.get("/api/health/ready")

    assert response.status_code == 503
    assert response.json() == {"status": "unavailable"}
    assert client.get("/api/health/live").status_code == 200
