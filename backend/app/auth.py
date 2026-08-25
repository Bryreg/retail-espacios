"""Authentication core: config helpers, JWT tokens and FastAPI dependencies.

Tres roles:

* ``admin``   — acceso completo.
* ``worker``  — sólo lectura, y nunca ve plata.
* ``montaje`` — **un solo espacio**, sin contraseña, con vencimiento.

El tercero existe para la mercaderista. Antes entraba con la contraseña
compartida del rol ``worker``, y desde ahí veía el mapa de la sede y la tabla
con el proveedor, el período y el estado de cada espacio: mucho más de lo que
necesita para armar una exhibición. Su enlace del correo ahora lleva un token
firmado, acotado a ese espacio y con fecha de vencimiento.

**``require_auth`` rechaza el token de montaje.** Todo queda cerrado por
defecto y sólo lo abren, uno por uno, los endpoints que esa pantalla necesita
—con ``require_montaje``—, cada uno comprobando que el código pedido sea el
suyo. Un rol nuevo que entrara por la puerta general se colaría en cualquier
endpoint que alguien agregue mañana sin acordarse de él.

Los tokens son JWT HS256 firmados con la variable JWT_SECRET.
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
# El enlace del montaje vive lo que dura el trabajo, no lo que dura una sesión:
# el correo sale al firmar el contrato y la exhibición se arma en los días
# siguientes. Un mes cubre eso con margen y acota el daño si el correo se
# reenvía.
MONTAJE_TTL_DAYS = 30

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


def create_mount_token(space_code: str, days: int = MONTAJE_TTL_DAYS) -> str:
    """Un token que sólo sirve para montar ESE espacio, y sólo por un tiempo."""
    payload = {
        "role": "montaje",
        "code": (space_code or "").strip().upper(),
        "exp": datetime.now(timezone.utc) + timedelta(days=days),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> str | None:
    """Return the role encoded in the token, or None if invalid/expired.

    Sólo reconoce ``admin`` y ``worker``: un token de montaje NO pasa por acá,
    para que no entre por la puerta general. Se lee con ``decode_montaje``.
    """
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.PyJWTError:
        return None
    role = payload.get("role")
    return role if role in ("admin", "worker") else None


def decode_montaje(token: str) -> tuple[str, datetime | None] | None:
    """``(código, vencimiento)`` de un token de montaje, o None si no lo es.

    El vencimiento sale acá y no se recalcula en la pantalla: el enlace vive
    semanas y la mercaderista tiene que poder ver que se le está por vencir
    ANTES de llegar a la tienda y descubrirlo con el celular en la mano.
    """
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.PyJWTError:
        return None
    if payload.get("role") != "montaje":
        return None
    code = (payload.get("code") or "").strip().upper()
    if not code:
        return None
    exp = payload.get("exp")
    vence = datetime.fromtimestamp(exp, tz=timezone.utc) if isinstance(exp, (int, float)) else None
    return code, vence


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


class Quien:
    """Quién está pidiendo. ``code`` sólo viene con un token de montaje."""

    __slots__ = ("role", "code", "vence")

    def __init__(self, role: str, code: str | None = None, vence: datetime | None = None):
        self.role = role
        self.code = code
        self.vence = vence

    @property
    def es_montaje(self) -> bool:
        return self.role == "montaje"

    def puede_ver(self, space_code: str) -> bool:
        """¿Puede ver este espacio? El de montaje, sólo el suyo."""
        if not self.es_montaje:
            return True
        return (space_code or "").strip().upper() == self.code


def _leer_credencial(authorization: str | None, token: str | None) -> str | None:
    if authorization and authorization.lower().startswith("bearer "):
        return authorization[7:].strip()
    return token or None


def require_montaje(
    authorization: str | None = Header(default=None),
    token: str | None = Query(default=None),
) -> Quien:
    """Acepta admin, worker **o** un token de montaje.

    Se pone SÓLO en los endpoints que la pantalla de montaje necesita, y cada
    uno tiene que preguntar ``puede_ver(codigo)``: el token no habilita a ver
    todo lo del endpoint, habilita a ver un espacio.

    También acepta el token por query porque la foto y la planometría se abren
    en un ``<img>`` o un ``<iframe>``, que no mandan cabeceras.
    """
    raw = _leer_credencial(authorization, token)
    if not raw:
        raise HTTPException(status_code=401, detail="No autenticado")
    role = decode_token(raw)
    if role is not None:
        return Quien(role)
    montaje = decode_montaje(raw)
    if montaje is not None:
        code, vence = montaje
        return Quien("montaje", code, vence)
    raise HTTPException(status_code=401, detail="Token inválido o expirado")


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
