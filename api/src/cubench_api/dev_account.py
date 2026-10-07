"""Provision the local demo account from the same history as the account preview."""

import json
from datetime import datetime, timedelta
from pathlib import Path
from uuid import NAMESPACE_URL, uuid5

from cubench_api.auth import DEV_USERNAME, hash_password, verify_password
from cubench_api.config import ConfigError
from cubench_api.database import connect

DEV_PASSWORD = "dev-password"
HISTORY_PATH = Path(__file__).with_name("preview_history.json")


def seed_dev_account(db_path: Path, now: datetime | None = None) -> None:
    """Seed once; preserve profile edits and solves across subsequent restarts."""

    with connect(db_path) as connection:
        existing = connection.execute(
            "SELECT password_hash FROM accounts WHERE username = ?", (DEV_USERNAME,)
        ).fetchone()
        if existing is not None:
            if not verify_password(DEV_PASSWORD, existing["password_hash"]):
                raise ConfigError(f"{DEV_USERNAME} is reserved for the development account")
            return

        history = json.loads(HISTORY_PATH.read_text(encoding="utf-8"))
        now = now or datetime.now().astimezone()
        # Match the preview's rolling local dates; today gains up to six attempts.
        midnight = now.replace(hour=0, minute=0, second=0, microsecond=0)
        today_attempts = min(6, 1 + int((now - midnight).total_seconds() // 90))
        local_now = now.replace(tzinfo=None)
        created_at = (local_now - timedelta(days=372)).astimezone().isoformat()

        cursor = connection.execute(
            """
            INSERT INTO accounts (username, password_hash, display_name, bio, created_at)
            VALUES (?, ?, ?, '', ?)
            """,
            (DEV_USERNAME, hash_password(DEV_PASSWORD), "Speedcuber", created_at),
        )
        account_id = cursor.lastrowid
        for group in history:
            day = group["day"]
            samples = group["solves"]
            attempts = min(today_attempts, len(samples)) if day == 0 else len(samples)
            if day == 0:
                session_start = now - timedelta(seconds=(attempts - 1) * 90)
            else:
                session_start = (local_now - timedelta(days=day)).replace(
                    hour=18, minute=0, second=0, microsecond=0
                )
            for attempt, (duration_ms, penalty, scramble) in enumerate(samples[:attempts]):
                recorded_at = session_start + timedelta(seconds=attempt * 90)
                timestamp = recorded_at.astimezone().isoformat()
                solve_id = str(uuid5(NAMESPACE_URL, f"cubench-preview-{day}-{attempt}"))
                connection.execute(
                    """
                    INSERT INTO solves (
                        account_id, id, duration_ms, penalty, scramble,
                        recorded_at, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (account_id, solve_id, duration_ms, penalty, scramble, timestamp, timestamp),
                )
        connection.commit()
