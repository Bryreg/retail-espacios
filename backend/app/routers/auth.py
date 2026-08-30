"""Login, contraseñas y el freno a la fuerza bruta.

Tres cosas cambiaron acá y las tres venían del mismo lugar —que el sistema se
escribió para una sola tienda y ahora se vende a varias—:

* la contraseña se compara contra un hash Argon2id, no contra texto plano;
* el freno de intentos vive en la base y no en un diccionario que se borra en
  cada despliegue;
* cambiar una contraseña cierra las sesiones abiertas de ese rol.
"""
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
from app.clientes import Cliente, buscar, cliente_del_pedido, listar, sesion_de, unico
from app.database import get_db
from app.models.models import LoginAttempt
from app.red import ip_del_cliente
from app.services.bitacora import anotar

router = APIRouter(prefix="/auth", tags=["auth"])


# ─── Quién está tocando la puerta ─────────────────────────────────────────────

LOGIN_WINDOW_SECONDS = 15 * 60
LOGIN_MAX_ATTEMPTS = 10
LARGO_MINIMO = 8


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
    # Qué supermercado. Se manda explícito: **nunca se deduce de la contraseña.**
    # Deducirlo obligaría a probar la clave contra la base de cada cliente —lento
    # a propósito, porque el hash lo es— y, peor, si dos clientes eligieran la
    # misma contraseña entraría al que se revise primero.
    cliente: Optional[str] = None


class LoginOut(BaseModel):
    token: str
    role: str
    cliente: str
    cliente_nombre: str


class ClienteOut(BaseModel):
    slug: str
    nombre: str


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

@router.get("/clientes", response_model=list[ClienteOut])
def clientes_disponibles():
    """La lista para el selector de la pantalla de ingreso.

    Es pública porque hay que mostrarla antes de que nadie se identifique. Sólo
    salen el código y el nombre — ni cuántas tiendas tiene cada uno, ni nada de
    adentro. Mientras haya un solo cliente la pantalla ni lo pregunta.
    """
    return [ClienteOut(slug=c.slug, nombre=c.nombre) for c in listar()]


def _cliente_para_entrar(slug: Optional[str]) -> Cliente:
    if slug:
        cliente = buscar(slug)
        if cliente is None:
            raise HTTPException(status_code=401, detail="Contraseña incorrecta")
        return cliente
    solo = unico()
    if solo is not None:
        return solo
    raise HTTPException(status_code=422, detail="Elegí el supermercado antes de entrar")


@router.post("/login", response_model=LoginOut)
def login(payload: LoginIn, request: Request):
    """Single-field login: the password decides the role (admin first, then worker).

    Abre su propia sesión en vez de usar `get_db`: acá todavía no hay token, así
    que el supermercado sale del cuerpo del pedido y no de la credencial.

    Un cliente que no existe contesta lo mismo que una contraseña equivocada, y
    a propósito: si dijera «ese supermercado no existe», la pantalla de ingreso
    serviría para averiguar quiénes son los clientes.
    """
    cliente = _cliente_para_entrar(payload.cliente)
    db = sesion_de(cliente)
    try:
        ip = ip_del_cliente(request)
        frenar_si_hay_muchos_fallos(db, ip)

        if verificar_clave(db, "admin", payload.password):
            role = "admin"
        elif verificar_clave(db, "worker", payload.password):
            role = "worker"
        else:
            anotar(db, request, "anónimo", "login.fallo")
            # `anotar_fallo` cierra la transacción, así que la línea de la
            # bitácora viaja con ella. La contraseña que se intentó NO se
            # guarda: media bitácora se llenaría de contraseñas casi correctas
            # de gente que se equivocó una letra.
            anotar_fallo(db, ip)
            raise HTTPException(status_code=401, detail="Contraseña incorrecta")

        borrar_fallos(db, ip)
        anotar(db, request, role, "login.ok")
        db.commit()
        return LoginOut(
            token=create_token(role, epoca_de(db, role), cliente.slug),
            role=role,
            cliente=cliente.slug,
            cliente_nombre=cliente.nombre,
        )
    finally:
        db.close()


@router.put("/passwords", response_model=PasswordsOut)
def update_passwords(
    payload: PasswordsUpdate,
    request: Request,
    rol: str = Depends(require_admin),
    cliente: Cliente = Depends(cliente_del_pedido),
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
        anotar(db, request, rol, "clave.cambio", entidad="rol", entidad_id=quien)
    db.commit()

    nuevo = create_token(rol, epoca_de(db, rol), cliente.slug) if rol in nuevas else None
    return PasswordsOut(ok=True, token=nuevo)
