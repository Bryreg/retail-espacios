"""Login, contraseñas y el freno a la fuerza bruta.

Tres cosas cambiaron acá y las tres venían del mismo lugar —que el sistema se
escribió para una sola tienda y ahora se vende a varias—:

* la contraseña se compara contra un hash Argon2id, no contra texto plano;
* el freno de intentos vive en la base y no en un diccionario que se borra en
  cada despliegue;
* cambiar una contraseña cierra las sesiones abiertas de ese rol.
"""
import ipaddress
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import (
    create_token,
    epoca_de,
    guardar_clave,
    invalidar_sesiones,
    require_admin,
    verificar_clave,
)
from app.database import get_db
from app.models.models import LoginAttempt

router = APIRouter(prefix="/auth", tags=["auth"])


# ─── Quién está tocando la puerta ─────────────────────────────────────────────

LOGIN_WINDOW_SECONDS = 15 * 60
LOGIN_MAX_ATTEMPTS = 10
LARGO_MINIMO = 8


def _parsear(bruto: str):
    """Una IP de la cadena `X-Forwarded-For`, con o sin puerto, o None."""
    bruto = bruto.strip().strip('"')
    try:
        return ipaddress.ip_address(bruto)
    except ValueError:
        pass
    # "1.2.3.4:5678" y "[::1]:5678"
    if bruto.startswith("[") and "]" in bruto:
        bruto = bruto[1:bruto.index("]")]
    elif bruto.count(":") == 1:
        bruto = bruto.rsplit(":", 1)[0]
    try:
        return ipaddress.ip_address(bruto)
    except ValueError:
        return None


def _es_interna(ip) -> bool:
    return ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved


def ip_del_cliente(request: Request) -> str:
    """La IP real de quien pide, detrás del proxy de Render.

    Sin esto el freno de intentos era decorativo en producción: todas las
    peticiones llegan desde la misma dirección interna del balanceador, así que
    o se contaban todas juntas —y el primer atacante dejaba afuera a los
    supermercados— o se contaba una sola IP para todo el mundo.

    `X-Forwarded-For` es una lista y **el cliente puede inventar el principio**:
    manda `X-Forwarded-For: 1.2.3.4` y el proxy le agrega atrás la dirección
    desde la que realmente se conectó. Por eso se lee de derecha a izquierda y
    se toma la primera pública: las de la izquierda son las que se pueden
    falsificar, las internas son saltos del propio proxy.

    Y si la conexión llega directa —el peer ya es una dirección pública, no hay
    proxy adelante— la cabecera se ignora entera, porque ahí sí sería puro
    invento del cliente.
    """
    peer = _parsear(request.client.host) if request.client else None
    if peer is not None and not _es_interna(peer):
        return str(peer)

    cadena = request.headers.get("x-forwarded-for", "")
    candidatos = [p for p in (t.strip() for t in cadena.split(",")) if p]
    for bruto in reversed(candidatos):
        ip = _parsear(bruto)
        if ip is not None and not _es_interna(ip):
            return str(ip)

    # Todo interno: red privada o desarrollo. Sirve igual para separar máquinas.
    for bruto in reversed(candidatos):
        ip = _parsear(bruto)
        if ip is not None:
            return str(ip)
    return str(peer) if peer is not None else "desconocida"


def _desde(segundos: int) -> datetime:
    return datetime.now(timezone.utc) - timedelta(seconds=segundos)


def frenar_si_hay_muchos_fallos(db: Session, ip: str) -> None:
    """429 cuando esta IP ya lleva demasiados intentos fallidos en la ventana."""
    corte = _desde(LOGIN_WINDOW_SECONDS)
    # Barrer lo viejo acá evita una tarea aparte; la tabla es diminuta.
    db.query(LoginAttempt).filter(LoginAttempt.at < corte).delete(synchronize_session=False)
    db.commit()
    fallos = (
        db.query(LoginAttempt)
        .filter(LoginAttempt.ip == ip, LoginAttempt.at >= corte)
        .count()
    )
    if fallos >= LOGIN_MAX_ATTEMPTS:
        raise HTTPException(
            status_code=429,
            detail="Demasiados intentos. Esperá unos minutos e intentá de nuevo.",
        )


def anotar_fallo(db: Session, ip: str) -> None:
    db.add(LoginAttempt(ip=ip, at=datetime.now(timezone.utc)))
    db.commit()


def borrar_fallos(db: Session, ip: str) -> None:
    """Entró bien: la cuenta de esa IP vuelve a cero."""
    db.query(LoginAttempt).filter(LoginAttempt.ip == ip).delete(synchronize_session=False)
    db.commit()


# ─── Schemas ──────────────────────────────────────────────────────────────────

class LoginIn(BaseModel):
    password: str


class LoginOut(BaseModel):
    token: str
    role: str


class PasswordsUpdate(BaseModel):
    admin_password: Optional[str] = None
    worker_password: Optional[str] = None


class PasswordsOut(BaseModel):
    ok: bool
    # Cuando el admin cambia SU propia contraseña se cierran las sesiones de
    # admin, la suya incluida. En vez de echarlo de la pantalla en la que acaba
    # de guardar, se le devuelve un token nuevo para que siga adentro.
    token: Optional[str] = None


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.post("/login", response_model=LoginOut)
def login(payload: LoginIn, request: Request, db: Session = Depends(get_db)):
    """Single-field login: the password decides the role (admin first, then worker)."""
    ip = ip_del_cliente(request)
    frenar_si_hay_muchos_fallos(db, ip)

    if verificar_clave(db, "admin", payload.password):
        role = "admin"
    elif verificar_clave(db, "worker", payload.password):
        role = "worker"
    else:
        anotar_fallo(db, ip)
        raise HTTPException(status_code=401, detail="Contraseña incorrecta")

    borrar_fallos(db, ip)
    return LoginOut(token=create_token(role, epoca_de(db, role)), role=role)


@router.put("/passwords", response_model=PasswordsOut)
def update_passwords(
    payload: PasswordsUpdate,
    rol: str = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if payload.admin_password is None and payload.worker_password is None:
        raise HTTPException(status_code=422, detail="Debe enviar al menos una contraseña")

    def revisar(clave: str, quien: str) -> str:
        limpia = clave.strip()
        if not limpia:
            raise HTTPException(status_code=422, detail=f"La contraseña de {quien} no puede estar vacía")
        if len(limpia) < LARGO_MINIMO:
            raise HTTPException(
                status_code=422,
                detail=f"La contraseña de {quien} debe tener al menos {LARGO_MINIMO} caracteres",
            )
        return limpia

    # Se valida todo ANTES de escribir nada: si la segunda contraseña no pasa,
    # que no quede la primera cambiada y la otra no.
    nuevas: dict[str, str] = {}
    if payload.admin_password is not None:
        nuevas["admin"] = revisar(payload.admin_password, "administrador")
    if payload.worker_password is not None:
        nuevas["worker"] = revisar(payload.worker_password, "trabajador")

    for quien, clave in nuevas.items():
        guardar_clave(db, quien, clave)
        # Cambiar la contraseña sirve casi siempre para sacar a alguien. Si los
        # tokens que ya andan dando vueltas siguieran valiendo doce horas más,
        # no serviría para eso.
        invalidar_sesiones(db, quien)
    db.commit()

    nuevo = create_token(rol, epoca_de(db, rol)) if rol in nuevas else None
    return PasswordsOut(ok=True, token=nuevo)
