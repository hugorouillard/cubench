from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from cubench_api import main as main_module
from cubench_api import summary as summary_module
from cubench_api.account_views import MAX_CHART_POINTS
from cubench_api.auth import SESSION_COOKIE
from cubench_api.database import connect
from cubench_api.summary import rebuild_summary


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
    assert client.get("/api/account/dashboard").status_code == 401
    assert client.get("/api/account/activity?year=2025&revision=0").status_code == 401
    assert client.get(f"/api/account/recent?cursor={uuid4()}&revision=0").status_code == 401
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
    assert account_client.get("/api/account/dashboard").json()["recent"]["solves"] == []


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


def test_dashboard_matches_full_history_and_pages_without_losing_prefixes(
    account_client: TestClient,
) -> None:
    for index in range(120):
        solve = solve_payload()
        solve.update(
            duration_ms=9_000 + index * 31,
            penalty="dnf" if index in (9, 90) else "plus2" if index % 13 == 0 else "none",
            recorded_at=(datetime(2025, 1, 1, tzinfo=UTC) + timedelta(hours=index * 11)).isoformat(),
        )
        assert account_client.post("/api/solves", json=solve).status_code == 201

    dashboard = account_client.get("/api/account/dashboard")
    assert dashboard.status_code == 200
    data = dashboard.json()
    assert len(data["recent"]["solves"]) == 10
    assert len(data["progression"]) == 118
    assert data["summary"]["solve_count"] == 120
    history = list(reversed(account_client.get("/api/solves").json()))
    completed = [solve["duration_ms"] + (2000 if solve["penalty"] == "plus2" else 0)
                 for solve in history if solve["penalty"] != "dnf"]
    assert data["summary"]["mean_ms"] == (sum(completed) * 2 + len(completed)) // (2 * len(completed))
    assert data["summary"]["best_single_ms"] == min(completed)

    def full_average(window: list[dict]) -> int | None:
        values = sorted(float("inf") if solve["penalty"] == "dnf" else
                        solve["duration_ms"] + (2000 if solve["penalty"] == "plus2" else 0)
                        for solve in window)[1:-1]
        return None if float("inf") in values else int(sum(values) / len(values) + 0.5)

    for size in (5, 12, 50):
        valid = [average for index in range(size, len(history) + 1)
                 if (average := full_average(history[index - size:index])) is not None]
        assert data["summary"][f"best_ao{size}_ms"] == min(valid)
    assert data["progression"][-1]["mean_50_ms"] == (2 * sum(completed[-50:]) + 50) // 100
    assert data["summary"]["active_days"] == len({solve["recorded_at"][:10] for solve in history})
    assert sum(day["attempts"] for day in account_client.get(
        f"/api/account/activity?year=2025&revision={data['summary']['revision']}"
    ).json()) == 120

    cursor = data["recent"]["next_cursor"]
    seen = {solve["id"] for solve in data["recent"]["solves"]}
    while cursor:
        page = account_client.get(
            f"/api/account/recent?cursor={cursor}&revision={data['summary']['revision']}"
        ).json()
        assert not seen.intersection(solve["id"] for solve in page["solves"])
        seen.update(solve["id"] for solve in page["solves"])
        cursor = page["next_cursor"]
    assert len(seen) == 120

    account_client.patch(f"/api/solves/{history[2]['id']}", json={"penalty": "dnf"})
    assert account_client.get(
        f"/api/account/recent?cursor={data['recent']['next_cursor']}&revision={data['summary']['revision']}"
    ).status_code == 409
    assert account_client.get("/api/account/dashboard").json()["summary"]["completed_count"] == 117


def test_large_history_chart_is_bounded_without_truncating_account_totals(
    account_client: TestClient,
) -> None:
    account_id = account_client.get("/api/profile").json()["id"]
    start = datetime(2025, 1, 1, tzinfo=UTC)
    with connect() as connection:
        connection.executemany(
            """INSERT INTO solves
               (account_id, id, duration_ms, penalty, scramble, recorded_at, created_at)
               VALUES (?, ?, ?, 'none', 'R U', ?, ?)""",
            (
                (account_id, str(uuid4()), 10_000 + index,
                 (start + timedelta(minutes=index)).isoformat(timespec="microseconds"),
                 start.isoformat())
                for index in range(2_000)
            ),
        )
        rebuild_summary(connection, account_id)
        connection.commit()

    response = account_client.get("/api/account/dashboard")
    assert response.status_code == 200
    dashboard = response.json()
    assert dashboard["summary"]["solve_count"] == 2_000
    assert dashboard["summary"]["best_single_ms"] == 10_000
    assert dashboard["summary"]["best_ao50_ms"] == 10_025
    assert len(dashboard["progression"]) <= MAX_CHART_POINTS
    assert dashboard["progression"][0]["attempt_number"] == 1
    assert dashboard["progression"][-1]["attempt_number"] == 2_000
    assert len(dashboard["recent"]["solves"]) == 10


def test_activity_uses_utc_days_and_reconciles_historical_mutations(
    account_client: TestClient,
) -> None:
    first = solve_payload()
    first.update(recorded_at="2026-01-02T18:59:00-05:00", duration_ms=10000)
    second = solve_payload()
    second.update(recorded_at="2026-01-03T02:01:00+02:00", duration_ms=11000)
    for solve in (first, second):
        assert account_client.post("/api/solves", json=solve).status_code == 201
    data = account_client.get("/api/account/dashboard").json()
    assert data["summary"]["active_days"] == 2
    assert data["summary"]["longest_streak"] == 2
    assert account_client.get(
        f"/api/account/activity?year=2026&revision={data['summary']['revision']}"
    ).json() == [
        {"day": "2026-01-02", "attempts": 1},
        {"day": "2026-01-03", "attempts": 1},
    ]
    assert account_client.delete(f"/api/solves/{first['id']}").status_code == 204
    data = account_client.get("/api/account/dashboard").json()
    assert data["summary"]["active_days"] == 1
    assert data["summary"]["longest_streak"] == 1
