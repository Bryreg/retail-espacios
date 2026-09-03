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
import logging
import os
import secrets
import threading
import time
from datetime import datetime, timedelta, timezone

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import Argon2Error, InvalidHashError, VerifyMismatchError
from fastapi import Depends, Header, HTTPException, Query, Request
from sqlalchemy.orm import Session

from app.database import get_db
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
    "notify_emails": "",
    # Los hitos del aviso de vencimiento. 7 y 1 no servían: a una semana ya no
    # hay margen para negociar y a un día el correo avisa de algo que ya pasó.
    "reminder_days": "30,15,6",
}

log = logging.getLogger("recabra.auth")

# ─── Contraseñas ──────────────────────────────────────────────────────────────
#
# Se guardaban en texto plano en `app_config` y se comparaban con `==`. Un
# volcado de la base —un respaldo, un empleado con acceso— las entregaba todas,
# y la comparación tardaba distinto según cuántos caracteres coincidieran.
#
# Ahora se guarda el hash Argon2id bajo una clave NUEVA. `app_config` es
# clave/valor, así que esto no necesita ninguna migración: es la razón por la
# que se puede hacer hoy y no en la fase de las cuentas de usuario.

# Los parámetros son los que OWASP da como mínimo recomendado para Argon2id:
# 19 MiB de memoria, dos pasadas, un hilo. Los de la librería por defecto son 64
# MiB y cuatro hilos, y eso acá se vuelve un problema propio: el servicio corre
# en una instancia de 512 MB, así que un puñado de intentos simultáneos —que es
# justo lo que hace un ataque de fuerza bruta— se comería la memoria de la
# máquina. Defenderse de adivinar la contraseña no puede costar el servidor.
_ph = PasswordHasher(time_cost=2, memory_cost=19 * 1024, parallelism=1)

# rol -> (clave del hash, clave heredada en texto plano)
CLAVES: dict[str, tuple[str, str]] = {
    "admin": ("admin_password_hash", "admin_password"),
    "worker": ("worker_password_hash", "worker_password"),
}

# Un hash real contra el que verificar cuando NO hay contraseña configurada, para
# que fallar tarde lo mismo que acertar. Sin esto, un 401 instantáneo delata que
# ese rol no existe todavía.
#
# Se calcula la primera vez que hace falta, no al importar: es un hash entero de
# costo, y el arranque no tiene por qué pagarlo para algo que sólo se usa cuando
# alguien se equivoca contra un rol sin contraseña.
_señuelo: str | None = None


def _hash_señuelo() -> str:
    global _señuelo
    if _señuelo is None:
        _señuelo = _ph.hash("señuelo-de-tiempo-constante")
    return _señuelo


def hashear(clave: str) -> str:
    return _ph.hash(clave)


def guardar_clave(db: Session, rol: str, clave: str) -> None:
    """Guarda el hash y borra el texto plano heredado si quedaba."""
    k_hash, k_plano = CLAVES[rol]
    set_config(db, k_hash, hashear(clave))
    fila = db.query(AppConfig).filter(AppConfig.key == k_plano).first()
    if fila is not None:
        db.delete(fila)


def verificar_clave(db: Session, rol: str, intento: str) -> bool:
    """¿Es `intento` la contraseña de `rol`?

    Migra sola: si todavía está el texto plano heredado y coincide, escribe el
    hash y borra el texto en el mismo movimiento. Nadie queda afuera y nadie
    tiene que hacer nada — la primera vez que alguien entra, su contraseña deja
    de estar en claro.
    """
    k_hash, k_plano = CLAVES[rol]

    guardado = get_config(db, k_hash)
    if guardado:
        try:
            _ph.verify(guardado, intento)
        except VerifyMismatchError:
            return False
        except (Argon2Error, InvalidHashError) as e:
            # `InvalidHashError` NO hereda de `Argon2Error` sino de `ValueError`.
            # Sin atraparlo, un hash ilegible —un respaldo a medias, una edición
            # a mano de `app_config`— no da "contraseña incorrecta" sino un 500
            # en el login: nadie entra y el error no dice por qué.
            log.error(
                "El hash de %s está ilegible (%s). Con ese rol no va a entrar nadie "
                "hasta reponer la contraseña.", rol, type(e).__name__,
            )
            return False
        # Argon2 sube sus parámetros con el tiempo; rehashear al entrar mantiene
        # el costo al día sin pedirle nada a nadie.
        if _ph.check_needs_rehash(guardado):
            set_config(db, k_hash, hashear(intento))
            db.commit()
        return True

    heredada = get_config(db, k_plano)
    # En bytes a propósito: `compare_digest` con cadenas exige ASCII y revienta
    # con TypeError si la contraseña heredada trae una tilde o una eñe. Eso, en
    # producción, es un supermercado entero que no puede entrar.
    if heredada is not None and secrets.compare_digest(
        intento.encode("utf-8"), heredada.encode("utf-8")
    ):
        guardar_clave(db, rol, intento)
        db.commit()
        log.info("Contraseña de %s migrada a Argon2 y borrada del texto plano.", rol)
        return True

    # Sin contraseña configurada o intento errado: se gasta el mismo tiempo.
    try:
        _ph.verify(_hash_señuelo(), intento)
    except Argon2Error:
        pass
    return False


# ─── Épocas de sesión ─────────────────────────────────────────────────────────
#
# Cambiar la contraseña no echaba a nadie: los JWT ya emitidos seguían valiendo
# hasta 12 horas. Justo lo contrario de lo que se busca al cambiarla, que suele
# ser sacar a alguien.
#
# Cada rol lleva un contador en `app_config`. El token guarda con qué número
# nació y deja de valer cuando el contador sube. Es por rol a propósito: que el
# admin cambie la clave de los mercaderistas no tiene por qué cerrarle la sesión
# a él.

def clave_epoca(rol: str) -> str:
    return f"token_epoch_{rol}"


def epoca_de(db: Session, rol: str) -> int:
    try:
        return int(get_config(db, clave_epoca(rol), "0") or "0")
    except ValueError:
        return 0


def invalidar_sesiones(db: Session, rol: str) -> int:
    """Sube la época del rol: todo token emitido antes deja de valer."""
    nueva = epoca_de(db, rol) + 1
    set_config(db, clave_epoca(rol), str(nueva))
    return nueva


# ─── Arranque de las contraseñas ──────────────────────────────────────────────

def _hay_clave(db: Session, rol: str) -> bool:
    k_hash, k_plano = CLAVES[rol]
    return get_config(db, k_hash) is not None or get_config(db, k_plano) is not None


def bootstrap_claves(db: Session) -> None:
    """Le pone contraseña a una instalación nueva, y sólo a una instalación nueva.

    Antes venían escritas en el código —`admin123` y `galerias`—, y ese es el
    problema entero: cada supermercado que instalara esto arrancaba con las
    mismas dos claves, publicadas en el repositorio.

    Ahora sale de ADMIN_PASSWORD / WORKER_PASSWORD, y si no están se genera una
    al azar y se escribe en el log del arranque, que es el único lugar al que
    llega quien acaba de desplegar.

    **La base manda.** Si el rol ya tiene contraseña no se toca, aunque la
    variable de entorno diga otra cosa: si no, cada reinicio pisaría lo que se
    cambió desde la pantalla de configuración.
    """
    for rol in CLAVES:
        if _hay_clave(db, rol):
            if os.getenv(f"{rol.upper()}_PASSWORD"):
                log.info(
                    "%s_PASSWORD está definida pero %s ya tiene contraseña: se ignora. "
                    "Se cambia desde la pantalla de configuración.",
                    rol.upper(), rol,
                )
            continue
        desde_entorno = os.getenv(f"{rol.upper()}_PASSWORD")
        clave = desde_entorno or secrets.token_urlsafe(12)
        guardar_clave(db, rol, clave)
        db.commit()
        if desde_entorno:
            log.warning("Contraseña de %s tomada de %s_PASSWORD.", rol, rol.upper())
        else:
            log.warning(
                "Instalación nueva: contraseña de %s generada al azar -> %s\n"
                "Anotala y cambiala desde la pantalla de configuración. "
                "No vuelve a aparecer.",
                rol, clave,
            )


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
    bootstrap_claves(db)


# ─── Tokens ───────────────────────────────────────────────────────────────────

def create_token(
    role: str,
    epoca: int = 0,
    cliente: str | None = None,
    *,
    sub: int | None = None,
    email: str | None = None,
) -> str:
    """El mismo token de siempre — ``sub``/``email`` son opcionales y NUEVOS.

    El login legado (``routers/auth.py::login``) llama esto sin ``sub`` ni
    ``email``, y el payload que sale es byte a byte el de antes: las claves
    nuevas sólo se agregan cuando alguien las pasa, que es lo que hace
    ``/api/auth/oauth``. Ahí ``sub`` es el id de la fila en ``usuarios`` y
    habilita, en ``decode_token``, la revocación por membresía — algo que un
    token del login por clave compartida no tiene ni necesita: ese ya se
    revoca por época.
    """
    payload = {
        "role": role,
        # Con qué número de época nació. Si el contador del rol sube después,
        # este token deja de valer aunque todavía no se haya vencido.
        "epoca": epoca,
        # De qué supermercado. **Sin esto la separación por base no serviría de
        # nada:** la firma es una sola para todo el servicio, así que un token
        # de administrador de un cliente abriría la puerta del otro. Va adentro
        # de lo firmado, de modo que cambiarlo invalida el token.
        "cliente": cliente,
        "exp": datetime.now(timezone.utc) + timedelta(hours=TOKEN_TTL_HOURS),
    }
    if sub is not None:
        payload["sub"] = sub
    if email is not None:
        payload["email"] = email
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def create_mount_token(
    space_code: str, cliente: str | None = None, days: int = MONTAJE_TTL_DAYS
) -> str:
    """Un token que sólo sirve para montar ESE espacio, y sólo por un tiempo."""
    payload = {
        "role": "montaje",
        "code": (space_code or "").strip().upper(),
        "cliente": cliente,
        "exp": datetime.now(timezone.utc) + timedelta(days=days),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


# ─── Revocación por request (membresías individuales) ─────────────────────────
#
# Las épocas invalidan TODO un rol de golpe — sirven para el logout masivo del
# login legado, pero desactivar a UNA persona no puede subirle la época a
# todo el mundo. Un token con `sub` (los que emite /oauth) se valida además
# contra su membresía, consultada al registro y cacheada por 60 s: lo bastante
# corto para que "desactivar a alguien" se sienta inmediato, lo bastante largo
# para no convertir cada pedido en una consulta a la base por defecto.
#
# El PATCH de `routers/usuarios.py` llama `invalidar_cache_membresia` al
# cambiar `activo`, así que en la práctica el retraso real es el tiempo hasta
# el PRÓXIMO pedido de esa persona, no el TTL.

_MEMBRESIA_CACHE_TTL_SEGUNDOS = 60
_membresia_cache: dict[tuple[int, str], tuple[bool, float]] = {}
_membresia_cache_candado = threading.Lock()


def _membresia_activa(usuario_id: int, cliente_slug: str) -> bool:
    clave = (usuario_id, cliente_slug)
    ahora = time.monotonic()
    with _membresia_cache_candado:
        cacheado = _membresia_cache.get(clave)
        if cacheado is not None and ahora < cacheado[1]:
            return cacheado[0]

    # Import perezoso: `clientes.py` importa este módulo con un import
    # perezoso también (dentro de funciones), así que ninguno de los dos carga
    # al otro al arrancar.
    from app.clientes import sesion_registro
    from app.models.identidad import Membresia, Usuario

    reg = sesion_registro()
    try:
        # El `join` contra `usuarios` importa hoy poco —no hay ningún
        # endpoint que borre una fila de `usuarios`— pero es la diferencia
        # entre "sin efecto" y "agujero latente" el día que exista uno (Fase
        # 2, o un borrado manual): sin él, un `sub` de una cuenta que ya no
        # existe seguiría validando mientras su fila de `membresias` quedara
        # atrás.
        fila = (
            reg.query(Membresia)
            .join(Usuario, Usuario.id == Membresia.usuario_id)
            .filter(Membresia.usuario_id == usuario_id, Membresia.cliente_slug == cliente_slug)
            .first()
        )
        activa = bool(fila is not None and fila.activo)
    finally:
        reg.close()

    with _membresia_cache_candado:
        _membresia_cache[clave] = (activa, ahora + _MEMBRESIA_CACHE_TTL_SEGUNDOS)
    return activa


def invalidar_cache_membresia(usuario_id: int, cliente_slug: str) -> None:
    """Se llama al cambiar ``activo`` desde el PATCH: no hay que esperar el TTL."""
    with _membresia_cache_candado:
        _membresia_cache.pop((usuario_id, cliente_slug), None)


def _claims_del_token(token: str) -> tuple[int | None, str | None]:
    """``(sub, email)`` de un token ya válido, o ``(None, None)``.

    Sólo se llama sobre tokens que ya pasaron por ``decode_token`` (o que se
    van a volver a verificar acá mismo, que es barato): repite el
    ``jwt.decode`` para leer dos campos que ``decode_token`` no devuelve
    —devuelve el rol, por compatibilidad con todo el código que ya lo llama.
    """
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.PyJWTError:
        return None, None
    sub = payload.get("sub")
    email = payload.get("email")
    return (
        sub if isinstance(sub, int) else None,
        email if isinstance(email, str) and email else None,
    )


def _email_del_token(token: str) -> str | None:
    return _claims_del_token(token)[1]


def sub_y_email_de_la_sesion(
    authorization: str | None = Header(default=None),
) -> tuple[int | None, str | None]:
    """El ``(sub, email)`` de quien hace el pedido, si entró con cuenta real.

    Pensado para el único endpoint que REEMITE un token para la MISMA persona
    que hizo el pedido — ``PUT /api/auth/passwords``. Sin esto, un admin con
    cuenta real que cambiaba su propia contraseña se llevaba un token de
    rescate SIN ``sub``: como ``decode_token`` sólo somete al chequeo de
    membresía a los tokens QUE TRAEN ``sub``, ese token de rescate seguía
    abriendo todo aunque a esa persona la desactivaran un minuto después —
    la revocación individual dejaba de tener efecto mientras ese token
    viviera (hasta 12 horas). No verifica nada por su cuenta: el pedido ya
    pasó por ``require_admin``, así que el token es válido por construcción.
    """
    if not authorization or not authorization.lower().startswith("bearer "):
        return None, None
    return _claims_del_token(authorization[7:].strip())


def decode_token(token: str, db: Session | None = None) -> str | None:
    """Return the role encoded in the token, or None if invalid/expired.

    Sólo reconoce ``admin`` y ``worker``: un token de montaje NO pasa por acá,
    para que no entre por la puerta general. Se lee con ``decode_montaje``.

    Con ``db`` también comprueba la época: un token emitido antes del último
    cambio de contraseña de ese rol ya no vale. Sin ``db`` sólo se valida la
    firma —es lo que hace el token de montaje, que no muere con la contraseña.

    Si el token trae ``sub`` (los que emite ``/oauth``), además comprueba que
    la membresía de esa persona en ese cliente siga activa — ver la sección de
    arriba. Un token sin ``sub`` (todo lo del login legado) no paga ese costo:
    pasa exactamente como pasaba antes.
    """
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.PyJWTError:
        return None
    role = payload.get("role")
    if role not in ("admin", "worker"):
        return None
    if db is not None:
        nacio = payload.get("epoca")
        if not isinstance(nacio, int) or nacio < epoca_de(db, role):
            return None
    sub = payload.get("sub")
    if sub is not None:
        if not isinstance(sub, int):
            return None
        cliente = payload.get("cliente")
        if not isinstance(cliente, str) or not cliente:
            return None
        if not _membresia_activa(sub, cliente):
            return None
    return role


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


def cliente_del_token(raw: str) -> str | None:
    """El supermercado que dice el token, o None si el token no sirve.

    Verifica la firma ANTES de mirar el nombre: si no, cambiar una letra del
    token alcanzaría para entrar a la base de otro cliente, que es exactamente
    lo que esta separación existe para impedir.

    Devuelve None también cuando el token es válido pero no trae cliente. Eso
    pasa con los que se emitieron antes de que el sistema tuviera más de uno, y
    se resuelven con el único cliente que hay — así nadie se queda afuera el día
    del despliegue.
    """
    try:
        payload = jwt.decode(raw, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.PyJWTError:
        return None
    valor = payload.get("cliente")
    return valor.strip().lower() if isinstance(valor, str) and valor.strip() else None


# ─── FastAPI dependencies ─────────────────────────────────────────────────────

def require_auth(
    request: Request,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> str:
    """Validate the ``Authorization: Bearer <jwt>`` header and return the role.

    Cuando el token trae ``email`` (los de ``/oauth``) lo deja en
    ``request.state.actor_email``. Es lo que ``services/bitacora.py::anotar``
    lee para que la línea diga la persona y no sólo el rol — sin tocar un solo
    router de negocio: todos pasan por acá, y ``anotar`` ya recibe el
    ``Request`` de siempre.
    """
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="No autenticado")
    raw = authorization[7:].strip()
    role = decode_token(raw, db)
    if role is None:
        raise HTTPException(status_code=401, detail="Token inválido o expirado")
    email = _email_del_token(raw)
    if email:
        request.state.actor_email = email
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
    db: Session = Depends(get_db),
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
    role = decode_token(raw, db)
    if role is not None:
        return Quien(role)
    montaje = decode_montaje(raw)
    if montaje is not None:
        code, vence = montaje
        return Quien("montaje", code, vence)
    raise HTTPException(status_code=401, detail="Token inválido o expirado")


def require_auth_or_query_token(
    request: Request,
    authorization: str | None = Header(default=None),
    token: str | None = Query(default=None),
    db: Session = Depends(get_db),
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
    role = decode_token(raw, db)
    if role is None:
        raise HTTPException(status_code=401, detail="Token inválido o expirado")
    email = _email_del_token(raw)
    if email:
        request.state.actor_email = email
    return role
