"""Transactionally maintained account statistics, daily counts and chart points.

Chronological solves extend the lifetime aggregates and new rolling windows
using recent attempts/completions; historical mutations rebuild from solves.
"""

import sqlite3
from datetime import UTC, date, datetime, timedelta


def normalize_recorded_at(value: datetime) -> str:
    """Fixed-width UTC timestamps sort in the same order as their instants."""
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.astimezone(UTC).isoformat(timespec="microseconds").replace("+00:00", "Z")


def empty_summary() -> dict:
    return {
        "solve_count": 0,
        "completed_count": 0,
        "total_duration_ms": 0,
        "effective_duration_ms": 0,
        "best_single_ms": None,
        "best_single_at": None,
        "best_single_id": None,
        "best_ao5_ms": None,
        "best_ao5_at": None,
        "best_ao5_id": None,
        "best_ao12_ms": None,
        "best_ao12_at": None,
        "best_ao12_id": None,
        "best_ao50_ms": None,
        "best_ao50_at": None,
        "best_ao50_id": None,
        "first_completed_ms": None,
        "earliest_solve_at": None,
        "active_days": 0,
        "longest_streak": 0,
        "last_active_day": None,
        "ending_streak": 0,
        "last_recorded_at": None,
        "last_id": None,
        "revision": 0,
    }


def read_summary(connection: sqlite3.Connection, account_id: int) -> dict:
    row = connection.execute(
        "SELECT * FROM solve_summaries WHERE account_id = ?", (account_id,)
    ).fetchone()
    summary = dict(row) if row else empty_summary()
    summary.pop("account_id", None)
    summary.pop("last_recorded_at", None)
    summary.pop("last_id", None)
    count = summary["completed_count"]
    # Match the browser's Math.round for nonnegative millisecond durations.
    summary["mean_ms"] = (
        (summary["effective_duration_ms"] * 2 + count) // (2 * count)
        if count else None
    )
    today = datetime.now(UTC).date()
    latest = summary.pop("last_active_day", None)
    summary["current_streak"] = (
        summary["ending_streak"]
        if latest and date.fromisoformat(latest) in (today, today - timedelta(days=1))
        else 0
    )
    summary.pop("ending_streak")
    return summary


def _duration(solve: sqlite3.Row) -> int | None:
    if solve["penalty"] == "dnf":
        return None
    return solve["duration_ms"] + (2000 if solve["penalty"] == "plus2" else 0)


def _average(window: list[sqlite3.Row]) -> int | None:
    values = sorted(
        float("inf") if solve["penalty"] == "dnf" else _duration(solve)
        for solve in window
    )
    middle = values[1:-1]
    if any(value == float("inf") for value in middle):
        return None
    return (2 * sum(middle) + len(middle)) // (2 * len(middle))


def _extend(
    summary: dict, previous: list[sqlite3.Row], completed: list[int], solve: sqlite3.Row
) -> dict:
    day = solve["recorded_at"][:10]
    if day != summary["last_active_day"]:
        previous_day = summary["last_active_day"]
        summary["ending_streak"] = (
            summary["ending_streak"] + 1 if previous_day and
            date.fromisoformat(day) - date.fromisoformat(previous_day) == timedelta(days=1)
            else 1
        )
        summary["last_active_day"] = day
        summary["active_days"] += 1
        summary["longest_streak"] = max(summary["longest_streak"], summary["ending_streak"])
    if summary["earliest_solve_at"] is None:
        summary["earliest_solve_at"] = solve["recorded_at"]
    summary["solve_count"] += 1
    summary["total_duration_ms"] += solve["duration_ms"]
    duration = _duration(solve)
    is_pb = False
    if duration is not None:
        if summary["first_completed_ms"] is None:
            summary["first_completed_ms"] = duration
        summary["completed_count"] += 1
        summary["effective_duration_ms"] += duration
        if summary["best_single_ms"] is None or duration < summary["best_single_ms"]:
            is_pb = True
            summary["best_single_ms"] = duration
            summary["best_single_at"] = solve["recorded_at"]
            summary["best_single_id"] = solve["id"]

    for size in (5, 12, 50):
        if len(previous) >= size - 1:
            average = _average(previous[-(size - 1):] + [solve])
            key = f"best_ao{size}_ms"
            if average is not None and (summary[key] is None or average < summary[key]):
                summary[key] = average
                summary[f"best_ao{size}_at"] = solve["recorded_at"]
                summary[f"best_ao{size}_id"] = solve["id"]
    summary["last_recorded_at"] = solve["recorded_at"]
    summary["last_id"] = solve["id"]
    point = {
        "id": solve["id"], "recorded_at": solve["recorded_at"],
        "attempt_number": summary["solve_count"], "single_ms": duration,
        "pb_single_ms": summary["best_single_ms"], "is_pb": int(is_pb),
    }
    for size in (5, 12, 50):
        window = (completed + ([duration] if duration is not None else []))[-size:]
        point[f"mean_{size}_ms"] = (
            (2 * sum(window) + size) // (2 * size) if duration is not None and
            len(window) == size else None
        )
    return point


def _write_point(connection: sqlite3.Connection, account_id: int, point: dict) -> None:
    columns = ["account_id", *point]
    connection.execute(
        f"INSERT INTO solve_progression ({', '.join(columns)}) "
        f"VALUES ({', '.join('?' for _ in columns)})",
        (account_id, *point.values()),
    )


def _write_day(connection: sqlite3.Connection, account_id: int, day: str) -> None:
    connection.execute(
        """INSERT INTO daily_activity (account_id, day, attempts) VALUES (?, ?, 1)
           ON CONFLICT(account_id, day) DO UPDATE SET attempts = attempts + 1""",
        (account_id, day),
    )


def _save(connection: sqlite3.Connection, account_id: int, summary: dict) -> None:
    columns = ["account_id", *summary]
    connection.execute(
        f"INSERT OR REPLACE INTO solve_summaries ({', '.join(columns)}) "
        f"VALUES ({', '.join('?' for _ in columns)})",
        (account_id, *summary.values()),
    )


def rebuild_summary(connection: sqlite3.Connection, account_id: int) -> None:
    """Reconcile with authoritative solves, within the caller's transaction."""
    summary = empty_summary()
    row = connection.execute(
        "SELECT revision FROM solve_summaries WHERE account_id = ?", (account_id,)
    ).fetchone()
    summary["revision"] = (row["revision"] if row else 0) + 1
    previous: list[sqlite3.Row] = []
    completed: list[int] = []
    connection.execute("DELETE FROM solve_progression WHERE account_id = ?", (account_id,))
    connection.execute("DELETE FROM daily_activity WHERE account_id = ?", (account_id,))
    for solve in connection.execute(
        """SELECT id, recorded_at, duration_ms, penalty FROM solves
           WHERE account_id = ? ORDER BY recorded_at, id""",
        (account_id,),
    ):
        point = _extend(summary, previous, completed, solve)
        _write_point(connection, account_id, point)
        _write_day(connection, account_id, solve["recorded_at"][:10])
        previous = (previous + [solve])[-49:]
        if (duration := _duration(solve)) is not None:
            completed = (completed + [duration])[-49:]
    _save(connection, account_id, summary)


def added_solve(connection: sqlite3.Connection, account_id: int, solve_id: str) -> None:
    """Called only after a successful insert, before the insert is committed."""
    solve = connection.execute(
        """SELECT id, recorded_at, duration_ms, penalty FROM solves
           WHERE account_id = ? AND id = ?""", (account_id, solve_id)
    ).fetchone()
    row = connection.execute(
        "SELECT * FROM solve_summaries WHERE account_id = ?", (account_id,)
    ).fetchone()
    summary = dict(row) if row else empty_summary()
    summary.pop("account_id", None)
    if row and row["solve_count"] and (solve["recorded_at"], solve["id"]) <= (
        row["last_recorded_at"], row["last_id"]
    ):
        rebuild_summary(connection, account_id)
        return

    previous = connection.execute(
        """SELECT id, recorded_at, duration_ms, penalty FROM solves
           WHERE account_id = ? AND (recorded_at, id) < (?, ?)
           ORDER BY recorded_at DESC, id DESC LIMIT 49""",
        (account_id, solve["recorded_at"], solve["id"]),
    ).fetchall()
    completed = [duration for previous_solve in reversed(previous)
                 if (duration := _duration(previous_solve)) is not None]
    if len(completed) < 49:
        completed_rows = connection.execute(
            """SELECT duration_ms, penalty FROM solves
               WHERE account_id = ? AND (recorded_at, id) < (?, ?)
               AND penalty != 'dnf' ORDER BY recorded_at DESC, id DESC LIMIT 49""",
            (account_id, solve["recorded_at"], solve["id"]),
        ).fetchall()
        completed = [_duration(item) for item in reversed(completed_rows)]
    point = _extend(summary, list(reversed(previous)), completed, solve)
    summary["revision"] += 1
    _write_point(connection, account_id, point)
    _write_day(connection, account_id, solve["recorded_at"][:10])
    _save(connection, account_id, summary)
