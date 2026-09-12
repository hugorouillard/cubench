import pytest

from cubench_api.config import ConfigError, load_runtime_config


def test_default_configuration_is_for_development(monkeypatch) -> None:
    for name in (
        "CUBENCH_ENV",
        "CUBENCH_DB_PATH",
        "CUBENCH_INVITE_CODE",
        "CUBENCH_COOKIE_SECURE",
    ):
        monkeypatch.delenv(name, raising=False)

    config = load_runtime_config()

    assert config.environment == "development"
    assert config.db_path.name == "cubench.db"
    assert config.invite_code is None
    assert not config.cookie_secure


def test_invalid_boolean_is_rejected(monkeypatch) -> None:
    monkeypatch.setenv("CUBENCH_COOKIE_SECURE", "tru")

    with pytest.raises(ConfigError, match="true or false"):
        load_runtime_config()


def test_blank_database_path_is_rejected(monkeypatch) -> None:
    monkeypatch.setenv("CUBENCH_DB_PATH", "  ")

    with pytest.raises(ConfigError, match="must not be blank"):
        load_runtime_config()


def test_production_configuration_fails_closed(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("CUBENCH_ENV", "production")
    monkeypatch.setenv("CUBENCH_DB_PATH", str(tmp_path / "cubench.db"))
    monkeypatch.setenv("CUBENCH_INVITE_CODE", "private-invite")
    monkeypatch.setenv("CUBENCH_COOKIE_SECURE", "false")

    with pytest.raises(ConfigError, match="COOKIE_SECURE"):
        load_runtime_config()
