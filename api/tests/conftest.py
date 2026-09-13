from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from cubench_api.main import app


@pytest.fixture
def client(tmp_path, monkeypatch) -> Iterator[TestClient]:
    monkeypatch.setenv("CUBENCH_DB_PATH", str(tmp_path / "test.db"))
    monkeypatch.setenv("CUBENCH_INVITE_CODE", "test-invite")
    monkeypatch.setenv("CUBENCH_COOKIE_SECURE", "false")
    monkeypatch.setenv("CUBENCH_ENV", "test")
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def account_client(client: TestClient) -> TestClient:
    response = client.post(
        "/api/auth/register",
        json={
            "username": "user-a",
            "password": "test-password",
            "invite_code": "test-invite",
        },
    )
    assert response.status_code == 201
    return client
