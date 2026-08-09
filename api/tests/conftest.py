from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from cubebench_api.main import app


@pytest.fixture
def client(tmp_path, monkeypatch) -> Iterator[TestClient]:
    monkeypatch.setenv("CUBEBENCH_DB_PATH", str(tmp_path / "test.db"))
    with TestClient(app) as test_client:
        yield test_client
