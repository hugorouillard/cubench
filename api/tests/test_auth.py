from fastapi.testclient import TestClient

import cubench_api.auth as auth
from cubench_api.auth import SESSION_COOKIE, SESSION_MAX_AGE
from cubench_api.database import connect


def registration_payload(**overrides) -> dict:
    return {
        "username": "speedcuber",
        "password": "correct horse battery staple",
        "invite_code": "test-invite",
        **overrides,
    }


def test_registration_creates_account_and_session(client: TestClient) -> None:
    response = client.post("/api/auth/register", json=registration_payload())

    assert response.status_code == 201
    assert response.json()["username"] == "speedcuber"
    assert response.json()["display_name"] == "speedcuber"
    assert response.cookies[SESSION_COOKIE]
    assert client.get("/api/auth/session").json() == response.json()

    with connect() as connection:
        row = connection.execute(
            "SELECT username, password_hash FROM accounts"
        ).fetchone()
        stored_token = connection.execute(
            "SELECT token_hash FROM auth_sessions"
        ).fetchone()["token_hash"]
    assert row["username"] == "speedcuber"
    assert "correct horse battery staple" not in row["password_hash"]
    assert response.cookies[SESSION_COOKIE] not in stored_token

    cookie = response.headers["set-cookie"].lower()
    assert "httponly" in cookie
    assert "samesite=lax" in cookie
    assert f"max-age={SESSION_MAX_AGE}" in cookie


def test_registration_requires_the_invite_code(client: TestClient) -> None:
    response = client.post(
        "/api/auth/register", json=registration_payload(invite_code="wrong")
    )

    assert response.status_code == 403
    assert client.get("/api/auth/session").status_code == 401


def test_usernames_are_case_insensitive(client: TestClient) -> None:
    response = client.post("/api/auth/register", json=registration_payload())
    assert response.status_code == 201
    response = client.post(
        "/api/auth/register", json=registration_payload(username="SpeedCuber")
    )

    assert response.status_code == 409


def test_login_accepts_valid_credentials(client: TestClient) -> None:
    client.post("/api/auth/register", json=registration_payload())
    client.cookies.clear()

    response = client.post(
        "/api/auth/login",
        json={"username": "SpeedCuber", "password": "correct horse battery staple"},
    )

    assert response.status_code == 200
    assert response.cookies[SESSION_COOKIE]
    assert client.get("/api/auth/session").status_code == 200


def test_login_rejects_invalid_credentials(client: TestClient) -> None:
    client.post("/api/auth/register", json=registration_payload())
    client.cookies.clear()

    response = client.post(
        "/api/auth/login", json={"username": "speedcuber", "password": "wrong"}
    )

    assert response.status_code == 401


def test_tampered_session_is_rejected(client: TestClient) -> None:
    client.cookies.set(SESSION_COOKIE, "tampered.session")

    assert client.get("/api/auth/session").status_code == 401


def test_expired_session_is_rejected(client: TestClient, monkeypatch) -> None:
    monkeypatch.setattr(auth.time, "time", lambda: 1_000)
    client.post("/api/auth/register", json=registration_payload())
    monkeypatch.setattr(auth.time, "time", lambda: 1_000 + SESSION_MAX_AGE + 1)

    assert client.get("/api/auth/session").status_code == 401


def test_logout_clears_session(client: TestClient) -> None:
    client.post("/api/auth/register", json=registration_payload())
    session = client.cookies[SESSION_COOKIE]

    response = client.post("/api/auth/logout")

    assert response.status_code == 204
    assert client.get("/api/auth/session").status_code == 401
    client.cookies.set(SESSION_COOKIE, session)
    assert client.get("/api/auth/session").status_code == 401


def test_account_configuration_is_required(client: TestClient, monkeypatch) -> None:
    monkeypatch.delenv("CUBENCH_INVITE_CODE")

    response = client.post("/api/auth/register", json=registration_payload())

    assert response.status_code == 503
    with connect() as connection:
        assert connection.execute("SELECT count(*) FROM accounts").fetchone()[0] == 0


def test_secure_cookie_can_be_enabled(client: TestClient, monkeypatch) -> None:
    monkeypatch.setenv("CUBENCH_COOKIE_SECURE", "true")

    response = client.post("/api/auth/register", json=registration_payload())

    assert "secure" in response.headers["set-cookie"].lower()
