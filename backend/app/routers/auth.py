import time
from collections import defaultdict, deque
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import create_token, get_config, require_admin, set_config
from app.database import get_db

router = APIRouter(prefix="/auth", tags=["auth"])


# ─── Login rate limiting ──────────────────────────────────────────────────────
# In-memory per-IP throttle — acceptable because this app runs single-process.

LOGIN_WINDOW_SECONDS = 15 * 60
LOGIN_MAX_ATTEMPTS = 10

_login_attempts: dict[str, deque[float]] = defaultdict(deque)


def _check_login_rate_limit(ip: str) -> None:
    """Record one attempt for this IP and raise 429 once the window is full.

    Counts every attempt (failures and successes) BEFORE the password check.
    """
    now = time.monotonic()
    attempts = _login_attempts[ip]
    while attempts and now - attempts[0] > LOGIN_WINDOW_SECONDS:
        attempts.popleft()
    if len(attempts) >= LOGIN_MAX_ATTEMPTS:
        raise HTTPException(
            status_code=429,
            detail="Demasiados intentos. Esperá unos minutos e intentá de nuevo.",
        )
    attempts.append(now)


# ─── Schemas ──────────────────────────────────────────────────────────────────

class LoginIn(BaseModel):
    password: str


class LoginOut(BaseModel):
    token: str
    role: str


class PasswordsUpdate(BaseModel):
    admin_password: Optional[str] = None
    worker_password: Optional[str] = None


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.post("/login", response_model=LoginOut)
def login(payload: LoginIn, request: Request, db: Session = Depends(get_db)):
    """Single-field login: the password decides the role (admin first, then worker)."""
    _check_login_rate_limit(request.client.host if request.client else "unknown")

    admin_password = get_config(db, "admin_password", "admin123")
    worker_password = get_config(db, "worker_password", "galerias")

    if payload.password == admin_password:
        role = "admin"
    elif payload.password == worker_password:
        role = "worker"
    else:
        raise HTTPException(status_code=401, detail="Contraseña incorrecta")

    return LoginOut(token=create_token(role), role=role)


@router.put("/passwords", dependencies=[Depends(require_admin)])
def update_passwords(payload: PasswordsUpdate, db: Session = Depends(get_db)):
    if payload.admin_password is None and payload.worker_password is None:
        raise HTTPException(status_code=422, detail="Debe enviar al menos una contraseña")

    if payload.admin_password is not None:
        if not payload.admin_password.strip():
            raise HTTPException(status_code=422, detail="La contraseña de administrador no puede estar vacía")
        set_config(db, "admin_password", payload.admin_password)

    if payload.worker_password is not None:
        if not payload.worker_password.strip():
            raise HTTPException(status_code=422, detail="La contraseña de trabajador no puede estar vacía")
        set_config(db, "worker_password", payload.worker_password)

    db.commit()
    return {"ok": True}
