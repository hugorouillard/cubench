"""Bounded account reads from transactionally maintained projections."""

import sqlite3
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException

from cubench_api.summary import read_summary

PAGE_SIZE = 10
MAX_CHART_POINTS = 1000


def activity(connection: sqlite3.Connection, account_id: int, year: int | None = None) -> list[dict]:
    if year is None:
        end = datetime.now(UTC).date()
        start = end - timedelta(days=365)
    else:
        start = datetime(year, 1, 1, tzinfo=UTC).date()
        end = datetime(year, 12, 31, tzinfo=UTC).date()
    return [dict(row) for row in connection.execute(
        """SELECT day, attempts FROM daily_activity
           WHERE account_id = ? AND day BETWEEN ? AND ? ORDER BY day""",
        (account_id, start.isoformat(), end.isoformat()),
    )]


def progression(connection: sqlite3.Connection, account_id: int) -> list[dict]:
    rows = [dict(row) for row in connection.execute(
        """SELECT id, recorded_at, attempt_number, single_ms, pb_single_ms,
                  mean_5_ms, mean_12_ms, mean_50_ms
           FROM solve_progression WHERE account_id = ? AND single_ms IS NOT NULL
           ORDER BY recorded_at, id""", (account_id,)
    )]
    if len(rows) <= MAX_CHART_POINTS:
        return rows
    # Preserve chronological endpoints and extremes of each plotted series in
    # every bucket. Values are exact; only the number of rendered dots is bounded.
    selected = {0, len(rows) - 1}
    bucket_size = max(1, (len(rows) + 98) // 99)
    for start in range(0, len(rows), bucket_size):
        indexes = range(start, min(start + bucket_size, len(rows)))
        selected.add(indexes.start)
        selected.add(indexes.stop - 1)
        for field in ("single_ms", "pb_single_ms", "mean_5_ms", "mean_12_ms", "mean_50_ms"):
            candidates = [index for index in indexes if rows[index][field] is not None]
            if candidates:
                selected.add(min(candidates, key=lambda index: rows[index][field]))
                selected.add(max(candidates, key=lambda index: rows[index][field]))
    return [rows[index] for index in sorted(selected)]


def recent_page(
    connection: sqlite3.Connection, account_id: int, revision: int,
    cursor: str | None = None,
) -> dict:
    if cursor is not None:
        previous = connection.execute(
            "SELECT recorded_at FROM solves WHERE account_id = ? AND id = ?",
            (account_id, cursor),
        ).fetchone()
        if previous is None:
            raise HTTPException(status_code=409, detail="History changed; refresh the account")
        condition = "AND (s.recorded_at, s.id) < (?, ?)"
        parameters = (account_id, previous["recorded_at"], cursor, PAGE_SIZE + 1)
    else:
        condition = ""
        parameters = (account_id, PAGE_SIZE + 1)
    rows = connection.execute(
        f"""SELECT s.id, s.duration_ms, s.penalty, s.scramble, s.recorded_at,
                   s.created_at, p.is_pb
            FROM solves s JOIN solve_progression p
              ON p.account_id = s.account_id AND p.id = s.id
            WHERE s.account_id = ? {condition}
            ORDER BY s.recorded_at DESC, s.id DESC LIMIT ?""",
        parameters,
    ).fetchall()
    solves = [dict(row) for row in rows[:PAGE_SIZE]]
    return {
        "revision": revision, "solves": solves,
        "next_cursor": solves[-1]["id"] if len(rows) > PAGE_SIZE else None,
    }


def dashboard(connection: sqlite3.Connection, account_id: int) -> dict:
    summary = read_summary(connection, account_id)
    profile = connection.execute(
        "SELECT id, display_name, bio, created_at FROM accounts WHERE id = ?", (account_id,)
    ).fetchone()
    return {
        "profile": dict(profile), "summary": summary,
        "activity": activity(connection, account_id),
        "progression": progression(connection, account_id),
        "recent": recent_page(connection, account_id, summary["revision"]),
    }
