"""Transactionally maintained, per-account headline solve statistics.

New chronological solves extend the stored projection using only the last 11
attempts. Historical inserts, edits and deletions rebuild it from the source
of truth; no cached statistics are needed for the charts or activity calendar.
"""

import sqlite3
from datetime import UTC, datetime


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
        "last_recorded_at": None,
        "last_id": None,
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


def _extend(summary: dict, previous: list[sqlite3.Row], solve: sqlite3.Row) -> None:
    summary["solve_count"] += 1
    summary["total_duration_ms"] += solve["duration_ms"]
    duration = _duration(solve)
    if duration is not None:
        summary["completed_count"] += 1
        summary["effective_duration_ms"] += duration
        if summary["best_single_ms"] is None or duration < summary["best_single_ms"]:
            summary["best_single_ms"] = duration
            summary["best_single_at"] = solve["recorded_at"]
            summary["best_single_id"] = solve["id"]

    for size in (5, 12):
        if len(previous) >= size - 1:
            average = _average(previous[-(size - 1):] + [solve])
            key = f"best_ao{size}_ms"
            if average is not None and (summary[key] is None or average < summary[key]):
                summary[key] = average
                summary[f"best_ao{size}_at"] = solve["recorded_at"]
                summary[f"best_ao{size}_id"] = solve["id"]
    summary["last_recorded_at"] = solve["recorded_at"]
    summary["last_id"] = solve["id"]


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
    previous: list[sqlite3.Row] = []
    for solve in connection.execute(
        """SELECT id, recorded_at, duration_ms, penalty FROM solves
           WHERE account_id = ? ORDER BY recorded_at, id""",
        (account_id,),
    ):
        _extend(summary, previous, solve)
        previous = (previous + [solve])[-11:]
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
           ORDER BY recorded_at DESC, id DESC LIMIT 11""",
        (account_id, solve["recorded_at"], solve["id"]),
    ).fetchall()
    _extend(summary, list(reversed(previous)), solve)
    _save(connection, account_id, summary)
