import json
from datetime import UTC, datetime, timedelta
from uuid import UUID

import pytest
from fastapi.testclient import TestClient

from cubench_api.auth import DEV_USERNAME, SESSION_COOKIE
from cubench_api.config import ConfigError
from cubench_api.database import connect, initialize_database
from cubench_api.dev_account import DEV_PASSWORD, HISTORY_PATH, seed_dev_account
from cubench_api.main import app


def development_db(tmp_path, monkeypatch):
    path = tmp_path / "dev.db"
    monkeypatch.setenv("CUBENCH_DB_PATH", str(path))
    monkeypatch.setenv("CUBENCH_ENV", "development")
    monkeypatch.setenv("CUBENCH_COOKIE_SECURE", "false")
    monkeypatch.delenv("CUBENCH_INVITE_CODE", raising=False)
    return path


def test_startup_seeds_preview_history_without_an_invite(tmp_path, monkeypatch) -> None:
    development_db(tmp_path, monkeypatch)
    history = json.loads(HISTORY_PATH.read_text(encoding="utf-8"))

    with TestClient(app) as client:
        assert client.get("/api/auth/session").status_code == 401
        response = client.post(
            "/api/auth/login",
            json={"username": DEV_USERNAME, "password": DEV_PASSWORD},
        )
        assert response.status_code == 200
        assert response.json()["display_name"] == "Speedcuber"
        solves = client.get("/api/solves").json()

        past = [sample for group in history if group["day"] for sample in group["solves"]]
        today = history[-1]["solves"][:len(solves) - len(past)]
        assert [
            (solve["duration_ms"], solve["penalty"], solve["scramble"])
            for solve in solves
        ] == [tuple(sample) for sample in reversed(past + today)]
        assert len({UUID(solve["id"]) for solve in solves}) == len(solves)
        assert {solve["penalty"] for solve in solves} == {"none", "plus2", "dnf"}
        assert min(datetime.fromisoformat(solve["recorded_at"]) for solve in solves) < (
            datetime.now(UTC) - timedelta(days=330)
        )
        assert client.get("/api/export").json()["solves"]


def test_restart_preserves_edits_and_does_not_duplicate_history(tmp_path, monkeypatch) -> None:
    development_db(tmp_path, monkeypatch)

    with TestClient(app) as client:
        client.post(
            "/api/auth/login",
            json={"username": DEV_USERNAME, "password": DEV_PASSWORD},
        )
        solves = client.get("/api/solves").json()
        solve_id = solves[0]["id"]
        assert client.patch(
            f"/api/solves/{solve_id}", json={"penalty": "dnf"}
        ).status_code == 200
        assert client.patch(
            "/api/profile", json={"display_name": "Practice", "bio": "testing"}
        ).status_code == 200

    with TestClient(app) as client:
        assert client.post(
            "/api/auth/login",
            json={"username": DEV_USERNAME, "password": DEV_PASSWORD},
        ).status_code == 200
        assert client.get("/api/profile").json()["display_name"] == "Practice"
        restarted_solves = client.get("/api/solves").json()
        assert len(restarted_solves) == len(solves)
        assert restarted_solves[0]["penalty"] == "dnf"


def test_seed_uses_preview_day_boundaries(tmp_path) -> None:
    path = tmp_path / "test.db"
    initialize_database(path)
    seed_dev_account(path, datetime(2026, 9, 24, 0, 0, 1, tzinfo=UTC))

    with connect(path) as connection:
        rows = connection.execute(
            "SELECT duration_ms, scramble, recorded_at FROM solves ORDER BY recorded_at DESC"
        ).fetchall()
    history = json.loads(HISTORY_PATH.read_text(encoding="utf-8"))
    assert len(rows) == sum(len(group["solves"]) for group in history) - 5
    assert rows[0]["duration_ms"] == history[-1]["solves"][0][0]
    assert rows[0]["scramble"] == history[-1]["solves"][0][2]
    assert datetime.fromisoformat(rows[0]["recorded_at"]) == datetime(
        2026, 9, 24, 0, 0, 1, tzinfo=UTC
    )


def test_dev_account_is_unusable_in_production_even_with_copied_database(
    tmp_path, monkeypatch
) -> None:
    path = development_db(tmp_path, monkeypatch)
    with TestClient(app) as client:
        client.post(
            "/api/auth/login",
            json={"username": DEV_USERNAME, "password": DEV_PASSWORD},
        )
        session = client.cookies[SESSION_COOKIE]

    monkeypatch.setenv("CUBENCH_ENV", "production")
    monkeypatch.setenv("CUBENCH_COOKIE_SECURE", "true")
    monkeypatch.setenv("CUBENCH_INVITE_CODE", "production-invite")
    with TestClient(app) as client:
        response = client.post(
            "/api/auth/login",
            json={"username": DEV_USERNAME, "password": DEV_PASSWORD},
        )
        assert response.status_code == 401
        client.cookies.set(SESSION_COOKIE, session)
        assert client.get("/api/auth/session").status_code == 401
        assert client.get("/api/solves").status_code == 401
        assert client.post(
            "/api/auth/register",
            json={
                "username": DEV_USERNAME,
                "password": DEV_PASSWORD,
                "invite_code": "production-invite",
            },
        ).status_code == 403

    with connect(path) as connection:
        assert connection.execute("SELECT count(*) FROM accounts").fetchone()[0] == 1


def test_existing_username_is_not_overwritten(tmp_path, monkeypatch) -> None:
    path = development_db(tmp_path, monkeypatch)
    initialize_database(path)
    with connect(path) as connection:
        connection.execute(
            """
            INSERT INTO accounts (username, password_hash, display_name, created_at)
            VALUES (?, 'someone-elses-hash', 'Existing user', '2026-01-01')
            """,
            (DEV_USERNAME,),
        )
        connection.commit()

    with pytest.raises(ConfigError, match="reserved"):
        with TestClient(app):
            pass

    with connect(path) as connection:
        assert connection.execute("SELECT count(*) FROM accounts").fetchone()[0] == 1
