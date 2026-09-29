from datetime import UTC, datetime
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from cubench_api import main as main_module
from cubench_api import summary as summary_module
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
    assert client.get("/api/solves/summary").status_code == 401
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


def test_summary_incremental_insert_retry_and_historical_rebuild(account_client: TestClient) -> None:
    assert account_client.get("/api/solves/summary").json()["solve_count"] == 0
    solves = []
    for day in range(1, 13):
        payload = solve_payload()
        payload.update(duration_ms=day * 1000, recorded_at=f"2026-01-{day:02d}T12:00:00Z")
        if day >= 11:
            payload["penalty"] = "dnf"
        assert account_client.post("/api/solves", json=payload).status_code == 201
        solves.append(payload)

    summary = account_client.get("/api/solves/summary").json()
    assert summary["solve_count"] == 12
    assert summary["completed_count"] == 10
    assert summary["total_duration_ms"] == 78000
    assert summary["best_single_ms"] == 1000
    assert summary["best_ao5_ms"] == 3000
    assert datetime.fromisoformat(summary["best_ao5_at"]) == datetime.fromisoformat(solves[4]["recorded_at"])
    assert summary["best_ao12_ms"] is None

    assert account_client.post("/api/solves", json=solves[-1]).status_code == 201
    assert account_client.get("/api/solves/summary").json() == summary

    # Editing the DNF makes the first ao12 valid. Repeating an edit and deleting
    # the best solve must not leave stale personal bests behind.
    assert account_client.patch(
        f"/api/solves/{solves[-1]['id']}", json={"penalty": "none"}
    ).status_code == 200
    assert account_client.get("/api/solves/summary").json()["best_ao12_ms"] == 6600
    assert account_client.delete(f"/api/solves/{solves[0]['id']}").status_code == 204
    assert account_client.get("/api/solves/summary").json()["best_single_ms"] == 2000

    older = solve_payload()
    older.update(duration_ms=500, recorded_at="2025-12-31T12:00:00Z")
    assert account_client.post("/api/solves", json=older).status_code == 201
    assert account_client.get("/api/solves/summary").json()["best_single_ms"] == 500


def test_summary_is_account_scoped(account_client: TestClient) -> None:
    account_client.post("/api/solves", json=solve_payload())
    account_client.cookies.clear()
    account_client.post("/api/auth/register", json={
        "username": "another", "password": "test-password", "invite_code": "test-invite"
    })
    assert account_client.get("/api/solves/summary").json()["solve_count"] == 0


def test_chronological_insert_does_not_rebuild_and_offsets_sort_by_instant(
    account_client: TestClient, monkeypatch
) -> None:
    early = solve_payload()
    early.update(recorded_at="2026-01-01T12:00:00+02:00", duration_ms=9000)
    assert account_client.post("/api/solves", json=early).status_code == 201

    def unexpected_rebuild(*args) -> None:
        raise AssertionError("chronological append performed a full rebuild")

    with monkeypatch.context() as patch:
        patch.setattr(summary_module, "rebuild_summary", unexpected_rebuild)
        later = solve_payload()
        later.update(recorded_at="2026-01-01T10:00:00.000001Z", duration_ms=8000)
        assert account_client.post("/api/solves", json=later).status_code == 201

    assert account_client.get("/api/solves/summary").json()["best_single_ms"] == 8000
    assert account_client.get("/api/solves").json()[0]["id"] == later["id"]
    # Same ID and instant in a different timezone remains a retry, not a new solve.
    later["recorded_at"] = "2026-01-01T12:00:00.000001+02:00"
    assert account_client.post("/api/solves", json=later).status_code == 201
    assert account_client.get("/api/solves/summary").json()["solve_count"] == 2


def test_failed_summary_write_rolls_back_the_solve(
    account_client: TestClient, monkeypatch
) -> None:
    def fail(*args) -> None:
        raise RuntimeError("summary update failed")

    with monkeypatch.context() as patch:
        patch.setattr(main_module, "added_solve", fail)
        with pytest.raises(RuntimeError, match="summary update failed"):
            account_client.post("/api/solves", json=solve_payload())

    assert account_client.get("/api/solves").json() == []
    assert account_client.get("/api/solves/summary").json()["solve_count"] == 0
