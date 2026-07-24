"""Authentication core: config helpers, JWT tokens and FastAPI dependencies.

Roles: "admin" (full access) and "worker" (read-only). Tokens are HS256 JWTs
signed with the JWT_SECRET env var, valid for 12 hours.
"""
import os
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, Header, HTTPException, Query
from sqlalchemy.orm import Session

from app.models.models import AppConfig

JWT_SECRET = os.getenv("JWT_SECRET")
if not JWT_SECRET:
    # Production is detected via Render's env marker or a Postgres DATABASE_URL.
    _is_production = bool(os.getenv("RENDER")) or (os.getenv("DATABASE_URL") or "").startswith("postgres")
    if _is_production:
        raise RuntimeError("JWT_SECRET must be set in production")
    JWT_SECRET = "dev-secret-change-me"
JWT_ALGORITHM = "HS256"
TOKEN_TTL_HOURS = 12

DEFAULT_CONFIG = {
    "admin_password": "admin123",
    "worker_password": "galerias",
    "notify_emails": "",
    "reminder_days": "30,15,7,1",
}


# ─── Config helpers ───────────────────────────────────────────────────────────

def get_config(db: Session, key: str, default: str | None = None) -> str | None:
    row = db.query(AppConfig).filter(AppConfig.key == key).first()
    return row.value if row else default


def set_config(db: Session, key: str, value: str) -> None:
    """Upsert one config key. The caller is responsible for committing."""
    row = db.query(AppConfig).filter(AppConfig.key == key).first()
    if row:
        row.value = value
    else:
        db.add(AppConfig(key=key, value=value))


def ensure_default_config(db: Session) -> None:
    """Seed the default config keys at startup if they are absent."""
    changed = False
    for key, value in DEFAULT_CONFIG.items():
        if db.query(AppConfig).filter(AppConfig.key == key).first() is None:
            db.add(AppConfig(key=key, value=value))
            changed = True
    if changed:
        db.commit()


# ─── Tokens ───────────────────────────────────────────────────────────────────

def create_token(role: str) -> str:
    payload = {
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(hours=TOKEN_TTL_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> str | None:
    """Return the role encoded in the token, or None if invalid/expired."""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.PyJWTError:
        return None
    role = payload.get("role")
    return role if role in ("admin", "worker") else None


# ─── FastAPI dependencies ─────────────────────────────────────────────────────

def require_auth(authorization: str | None = Header(default=None)) -> str:
    """Validate the ``Authorization: Bearer <jwt>`` header and return the role."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="No autenticado")
    role = decode_token(authorization[7:].strip())
    if role is None:
        raise HTTPException(status_code=401, detail="Token inválido o expirado")
    return role


def require_admin(role: str = Depends(require_auth)) -> str:
    if role != "admin":
        raise HTTPException(status_code=403, detail="Se requiere rol de administrador")
    return role


def require_auth_or_query_token(
    authorization: str | None = Header(default=None),
    token: str | None = Query(default=None),
) -> str:
    """Like ``require_auth`` but also accepts ``?token=<jwt>``.

    Needed for file downloads rendered in <iframe>/<embed>, which cannot send
    an Authorization header.
    """
    raw: str | None = None
    if authorization and authorization.lower().startswith("bearer "):
        raw = authorization[7:].strip()
    elif token:
        raw = token
    if not raw:
        raise HTTPException(status_code=401, detail="No autenticado")
    role = decode_token(raw)
    if role is None:
        raise HTTPException(status_code=401, detail="Token inválido o expirado")
    return role
