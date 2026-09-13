import hashlib
import secrets
import sqlite3
import time
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field, field_validator

from cubench_api.config import ConfigDependency, RuntimeConfig
from cubench_api.database import connect

SESSION_COOKIE = "cubench_session"
SESSION_MAX_AGE = 60 * 60 * 24 * 30
SCRYPT_N = 2**14
SCRYPT_R = 8
SCRYPT_P = 1

router = APIRouter(prefix="/api/auth", tags=["auth"])


class Account(BaseModel):
    id: int
    username: str
    display_name: str
    bio: str
    created_at: datetime


class RegisterRequest(BaseModel):
    username: str = Field(
        min_length=3, max_length=32, pattern=r"^[a-zA-Z0-9_-]+$"
    )
    password: str = Field(min_length=8, max_length=128)
    invite_code: str = Field(min_length=1, max_length=256)

    @field_validator("username")
    @classmethod
    def normalize_username(cls, value: str) -> str:
        return value.lower()


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=32)
    password: str = Field(min_length=1, max_length=128)

    @field_validator("username")
    @classmethod
    def normalize_username(cls, value: str) -> str:
        return value.strip().lower()


def _invite_code(config: RuntimeConfig) -> str:
    if config.invite_code is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Account login is not configured",
        )
    return config.invite_code


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(
        password.encode(), salt=salt, n=SCRYPT_N, r=SCRYPT_R, p=SCRYPT_P
    )
    return ":".join(
        (
            "scrypt",
            str(SCRYPT_N),
            str(SCRYPT_R),
            str(SCRYPT_P),
            salt.hex(),
            digest.hex(),
        )
    )


def verify_password(password: str, encoded_hash: str) -> bool:
    try:
        algorithm, n, r, p, encoded_salt, encoded_digest = encoded_hash.split(":")
        if algorithm != "scrypt":
            return False
        digest = hashlib.scrypt(
            password.encode(),
            salt=bytes.fromhex(encoded_salt),
            n=int(n),
            r=int(r),
            p=int(p),
        )
        return secrets.compare_digest(digest, bytes.fromhex(encoded_digest))
    except (ValueError, TypeError):
        return False


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _create_session(connection: sqlite3.Connection, account_id: int) -> str:
    now = int(time.time())
    token = secrets.token_urlsafe(32)
    connection.execute("DELETE FROM auth_sessions WHERE expires_at <= ?", (now,))
    connection.execute(
        """
        INSERT INTO auth_sessions (token_hash, account_id, expires_at)
        VALUES (?, ?, ?)
        """,
        (_token_hash(token), account_id, now + SESSION_MAX_AGE),
    )
    return token


def _account(row: sqlite3.Row) -> Account:
    return Account(
        id=row["id"],
        username=row["username"],
        display_name=row["display_name"],
        bio=row["bio"],
        created_at=row["created_at"],
    )


def _set_session_cookie(
    response: Response, token: str, config: RuntimeConfig
) -> None:
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=SESSION_MAX_AGE,
        httponly=True,
        secure=config.cookie_secure,
        samesite="lax",
    )


def require_account(
    session: Annotated[str | None, Cookie(alias=SESSION_COOKIE)] = None,
) -> Account:
    if session is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
    with connect() as connection:
        row = connection.execute(
            """
            SELECT accounts.id, accounts.username, accounts.display_name,
                   accounts.bio, accounts.created_at
            FROM accounts
            JOIN auth_sessions ON auth_sessions.account_id = accounts.id
            WHERE auth_sessions.token_hash = ? AND auth_sessions.expires_at > ?
            """,
            (_token_hash(session), int(time.time())),
        ).fetchone()
    if row is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
    return _account(row)


AccountDependency = Annotated[Account, Depends(require_account)]


@router.post(
    "/register", response_model=Account, status_code=status.HTTP_201_CREATED
)
def register(
    payload: RegisterRequest, response: Response, config: ConfigDependency
) -> Account:
    expected_invite = _invite_code(config)
    if not secrets.compare_digest(payload.invite_code.encode(), expected_invite.encode()):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Invalid invite code"
        )

    created_at = datetime.now(UTC).isoformat()
    try:
        with connect() as connection:
            cursor = connection.execute(
                """
                INSERT INTO accounts (
                    username, password_hash, display_name, bio, created_at
                ) VALUES (?, ?, ?, '', ?)
                """,
                (
                    payload.username,
                    hash_password(payload.password),
                    payload.username,
                    created_at,
                ),
            )
            account_id = cursor.lastrowid
            if account_id is None:
                raise RuntimeError("SQLite did not return an account id")
            token = _create_session(connection, account_id)
            connection.commit()
    except sqlite3.IntegrityError as error:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Username is already taken"
        ) from error

    account = Account(
        id=account_id,
        username=payload.username,
        display_name=payload.username,
        bio="",
        created_at=created_at,
    )
    _set_session_cookie(response, token, config)
    return account


@router.post("/login", response_model=Account)
def login(
    payload: LoginRequest, response: Response, config: ConfigDependency
) -> Account:
    with connect() as connection:
        row = connection.execute(
            """
            SELECT id, username, password_hash, display_name, bio, created_at
            FROM accounts WHERE username = ?
            """,
            (payload.username,),
        ).fetchone()

    if row is None or not verify_password(payload.password, row["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )
    account = _account(row)
    with connect() as connection:
        token = _create_session(connection, account.id)
        connection.commit()
    _set_session_cookie(response, token, config)
    return account


@router.get("/session", response_model=Account)
def get_session(account: AccountDependency) -> Account:
    return account


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    response: Response,
    session: Annotated[str | None, Cookie(alias=SESSION_COOKIE)] = None,
) -> None:
    if session is not None:
        with connect() as connection:
            connection.execute(
                "DELETE FROM auth_sessions WHERE token_hash = ?",
                (_token_hash(session),),
            )
            connection.commit()
    response.delete_cookie(SESSION_COOKIE)
