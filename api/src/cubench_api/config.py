import os
from dataclasses import dataclass
from pathlib import Path
from typing import Annotated

from fastapi import Depends, Request


class ConfigError(RuntimeError):
    pass


@dataclass(frozen=True)
class RuntimeConfig:
    environment: str
    db_path: Path
    invite_code: str | None
    cookie_secure: bool


def _boolean_setting(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    normalized = value.strip().lower()
    if normalized in {"1", "true", "yes"}:
        return True
    if normalized in {"0", "false", "no"}:
        return False
    raise ConfigError(f"{name} must be true or false")


def load_runtime_config() -> RuntimeConfig:
    environment = os.getenv("CUBENCH_ENV", "development").strip().lower()
    if environment not in {"development", "test", "production"}:
        raise ConfigError(
            "CUBENCH_ENV must be development, test, or production"
        )

    configured_path = os.getenv("CUBENCH_DB_PATH")
    if configured_path is not None and not configured_path.strip():
        raise ConfigError("CUBENCH_DB_PATH must not be blank")
    db_path = (
        Path(configured_path).expanduser()
        if configured_path is not None
        else Path(__file__).resolve().parents[2] / "data" / "cubench.db"
    )

    invite_code = os.getenv("CUBENCH_INVITE_CODE")
    if invite_code is not None:
        invite_code = invite_code.strip()
    if not invite_code or invite_code == "replace-with-a-private-invite-code":
        invite_code = None

    cookie_secure = _boolean_setting("CUBENCH_COOKIE_SECURE", False)

    if environment == "production":
        if not db_path.is_absolute():
            raise ConfigError("CUBENCH_DB_PATH must be absolute in production")
        if not cookie_secure:
            raise ConfigError("CUBENCH_COOKIE_SECURE must be true in production")
        if invite_code is None:
            raise ConfigError("CUBENCH_INVITE_CODE must be set in production")

    return RuntimeConfig(
        environment=environment,
        db_path=db_path,
        invite_code=invite_code,
        cookie_secure=cookie_secure,
    )


def get_runtime_config(request: Request) -> RuntimeConfig:
    config = getattr(request.app.state, "runtime_config", None)
    if not isinstance(config, RuntimeConfig):
        raise RuntimeError("Runtime configuration is unavailable")
    return config


ConfigDependency = Annotated[RuntimeConfig, Depends(get_runtime_config)]
