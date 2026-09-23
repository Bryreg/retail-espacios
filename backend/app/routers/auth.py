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
    require_auth,
    sub_y_email_de_la_sesion,
    verificar_clave,
)
from app.clientes import (
    CABECERA_ESTADO_CUENTA, Cliente, buscar, cliente_del_pedido, listar, sesion_de, unico,
)
from app.database import get_db
from app.models.models import LoginAttempt
# Fase 4: quién es operador de la plataforma. Módulo de contrato, ya importado
# por `app.auth` y por `app.clientes` — no agrega ningún ciclo.
from app.plataforma_estado import es_operador
from app.red import ip_del_cliente
from app.services.bitacora import anotar
from app.services.firebase_tokens import VerificadorDeIdToken, get_verificador

# El import registra `consentimientos` en Base.metadata ANTES de que corra
# create_all() en el arranque — este router ya se incluye en main.py, así que
# alcanza con importar el módulo acá (mismo patrón que
# `plataforma_estado.py` con `models/plataforma.py`; ver ese docstring). No
# hay ciclo: `models/consentimiento.py` sólo importa `app.database`.
from app.models import consentimiento as _tabla_consentimientos  # noqa: F401

router = APIRouter(prefix="/auth", tags=["auth"])


# ─── Quién está tocando la puerta ─────────────────────────────────────────────

LOGIN_WINDOW_SECONDS = 15 * 60
LOGIN_MAX_ATTEMPTS = 10
LARGO_MINIMO = 8


def _desde(segundos: int) -> datetime:
    return datetime.now(timezone.utc) - timedelta(seconds=segundos)


def frenar_si_hay_muchos_fallos(db: Session, ip: str, modelo=LoginAttempt) -> None:
    """429 cuando esta IP ya lleva demasiados intentos fallidos en la ventana.

    ``modelo`` es ``LoginAttempt`` por defecto (login legado, por cliente) o
    ``IntentoOauth`` (``/oauth``, va contra ``sesion_registro()``) — mismas
    tres columnas en las dos tablas, así que la misma consulta sirve para
    cualquiera de las dos sin duplicar el freno.
    """
    corte = _desde(LOGIN_WINDOW_SECONDS)
    # Barrer lo viejo acá evita una tarea aparte; la tabla es diminuta.
    db.query(modelo).filter(modelo.at < corte).delete(synchronize_session=False)
    db.commit()
    fallos = (
        db.query(modelo)
        .filter(modelo.ip == ip, modelo.at >= corte)
        .count()
    )
    if fallos >= LOGIN_MAX_ATTEMPTS:
        raise HTTPException(
            status_code=429,
            detail="Demasiados intentos. Esperá unos minutos e intentá de nuevo.",
        )


def anotar_fallo(db: Session, ip: str, modelo=LoginAttempt) -> None:
    db.add(modelo(ip=ip, at=datetime.now(timezone.utc)))
    db.commit()


def borrar_fallos(db: Session, ip: str, modelo=LoginAttempt) -> None:
    """Entró bien: la cuenta de esa IP vuelve a cero."""
    db.query(modelo).filter(modelo.ip == ip).delete(synchronize_session=False)
    db.commit()


# ─── Schemas ──────────────────────────────────────────────────────────────────

class LoginIn(BaseModel):
    password: str
    # Qué supermercado. Se manda explícito: **nunca se deduce de la contraseña.**
    # Deducirlo obligaría a probar la clave contra la base de cada cliente —lento
    # a propósito, porque el hash lo es— y, peor, si dos clientes eligieran la
    # misma contraseña entraría al que se revise primero.
    cliente: Optional[str] = None


class AvisoCuenta(BaseModel):
    """Lo que el frontend necesita para pintar el banner de pago pendiente.

    Va en la RESPUESTA del login, nunca adentro del JWT: el token no cambia de
    forma. Un claim de estado además envejecería mal —el token dura horas y el
    operador mueve el interruptor en cualquier momento—, mientras que esto es
    una foto del instante en que la persona entró.
    """
    estado: str
    motivo: Optional[str] = None


class LoginOut(BaseModel):
    token: str
    role: str
    cliente: str
    cliente_nombre: str
    # Ausente cuando el cliente está activo, que es el caso de siempre. El
    # `response_model_exclude_none=True` de la ruta lo saca del JSON en vez de
    # mandarlo en `null`: así el cuerpo del login de un cliente activo sigue
    # siendo, byte por byte, el de antes de la Fase 2.
    aviso_cuenta: Optional[AvisoCuenta] = None


class ClienteOut(BaseModel):
    slug: str
    nombre: str


class OAuthIn(BaseModel):
    id_token: str
    # Con qué supermercado entrar, cuando la cuenta tiene membresía en varios.
    # Igual que en `LoginIn`, nunca se deduce de otra cosa.
    cliente: Optional[str] = None
    # Fase 3: aceptación de la Política de Tratamiento de Datos, sólo relevante
    # cuando el canje de invitaciones pendientes va a crear una membresía
    # nueva y esta cuenta todavía no tiene fila para la versión vigente.
    acepta_politica: bool = False
    # El token del enlace del correo (`/login?invitacion=…`), cuando la persona
    # llegó por ahí. No canjea nada por sí solo —el canje sigue siendo por
    # correo—: dice A QUÉ supermercado venía a entrar, y permite avisarle que
    # entró con otra cuenta en vez de dejarla sin acceso. Ver `oauth_login`.
    invitacion: Optional[str] = None


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


CUENTA_SUSPENDIDA = "La cuenta de este cliente está suspendida."


def _aviso_de(slug: str) -> Optional[AvisoCuenta]:
    """El aviso para el frontend, o `None` si la cuenta está al día.

    `gracia` y `solo_lectura` entran igual —el objetivo es que el cliente pueda
    entrar a ver y a pagar—, pero se van sabiendo por qué la pantalla les va a
    mostrar un banner y qué dice el motivo que escribió el operador.
    """
    from app import plataforma_estado

    estado, motivo = plataforma_estado.estado_de(slug)
    if estado == "activo":
        return None
    return AvisoCuenta(estado=estado, motivo=motivo)


def _aviso_sin_motivo(aviso: Optional[AvisoCuenta]) -> Optional[AvisoCuenta]:
    """El mismo aviso, sin el texto del operador (hallazgo R-2): el `motivo`
    es información de la relación comercial —factura, mora, contacto— y la
    tiene el owner, no su gente. El estado sí viaja: el banner lo necesita."""
    if aviso is None:
        return None
    return AvisoCuenta(estado=aviso.estado, motivo=None)


@router.post("/login", response_model=LoginOut, response_model_exclude_none=True)
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

        # El interruptor de estado de cuenta, explícito: este endpoint NO pasa
        # por `cliente_del_pedido` —acá todavía no hay token que resolver—, así
        # que el único lugar donde puede aplicarse es éste.
        #
        # Va DESPUÉS de comprobar la contraseña a propósito. Contestar 402 antes
        # convertiría la pantalla de ingreso en un oráculo de qué supermercados
        # dejaron de pagar, para cualquiera que sepa un slug — exactamente la
        # razón por la que un cliente inexistente contesta "Contraseña
        # incorrecta" y no "ese supermercado no existe".
        aviso = _aviso_de(cliente.slug)
        if aviso is not None and aviso.estado == "suspendido":
            # Sin excepción de owner: el login legado es una contraseña
            # compartida, no una persona, y por construcción jamás es owner.
            # El motivo tampoco viaja acá — es para quien tiene cuenta propia.
            raise HTTPException(
                status_code=402,
                detail=CUENTA_SUSPENDIDA,
                headers={CABECERA_ESTADO_CUENTA: "suspendido"},
            )

        anotar(db, request, role, "login.ok")
        db.commit()
        return LoginOut(
            token=create_token(role, epoca_de(db, role), cliente.slug),
            role=role,
            cliente=cliente.slug,
            cliente_nombre=cliente.nombre,
            # Sin motivo: el legado es una clave compartida, jamás owner (R-2).
            aviso_cuenta=_aviso_sin_motivo(aviso),
        )
    finally:
        db.close()


# ─── Consentimiento a la Política de Tratamiento de Datos (Fase 3) ───────────

def _tiene_consentimiento_vigente(reg: Session, usuario_id: int) -> bool:
    from app.models.consentimiento import Consentimiento, VERSION_POLITICA

    return (
        reg.query(Consentimiento)
        .filter(Consentimiento.usuario_id == usuario_id, Consentimiento.version == VERSION_POLITICA)
        .first()
        is not None
    )


def _registrar_consentimiento(reg: Session, usuario_id: int, ip: str, origen: str) -> None:
    """Agrega la fila a la sesión (no comitea): el llamador la comitea junto
    con lo demás que esté escribiendo, para que las dos cosas caigan juntas."""
    from app.models.consentimiento import Consentimiento, VERSION_POLITICA

    reg.add(Consentimiento(usuario_id=usuario_id, version=VERSION_POLITICA, ip=ip, origen=origen))


# ─── El enlace de la invitación (2026-09-23) ─────────────────────────────────
#
# Hasta acá el enlace del correo (`/login?invitacion=<token>`) era decorativo:
# ni la pantalla ni el backend leían el token, y la invitación se canjeaba
# SÓLO si la persona entraba con el mismo correo al que se la mandaron. Quien
# entraba con otra cuenta —la personal en vez de la del trabajo, que es lo más
# común— se encontraba con «su cuenta no tiene acceso a ningún supermercado» y,
# en el mismo cuadro, con el formulario para FUNDAR uno. Así nacieron
# supermercados que nadie quería, y así un administrador o una mercaderista
# podía terminar trabajando en una base vacía creyendo que era la de su
# empresa.
#
# El canje sigue atado al correo, a propósito: un enlace reenviado o filtrado
# no le da acceso a quien lo tenga. Lo que cambia es que el token ahora sirve
# para dos cosas que antes no se podían: mostrar ANTES de entrar a qué
# supermercado y con qué cuenta (`GET /invitacion/{token}`), y, al entrar,
# llevar a la persona a ESE supermercado o decirle con claridad que la cuenta
# no es la invitada — nunca ofrecerle fundar otro.

def enmascarar_correo(email: str) -> str:
    """``brayan@gmail.com`` → ``b•••n@gmail.com``.

    Alcanza para que la persona reconozca cuál de sus cuentas es, sin dejar el
    correo entero en la pantalla de quien tenga el enlace. Siempre tres puntos,
    para no contar el largo."""
    local, _, dominio = (email or "").partition("@")
    if not local or not dominio:
        return "•••"
    visible = local[0] + "•••" + (local[-1] if len(local) > 2 else "")
    return f"{visible}@{dominio}"


def _con_zona(momento: datetime) -> datetime:
    """SQLite devuelve las fechas sin zona aunque se hayan guardado con ella."""
    return momento if momento.tzinfo is not None else momento.replace(tzinfo=timezone.utc)


def _fecha_corta(momento: datetime) -> str:
    meses = ("ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic")
    return f"{momento.day} {meses[momento.month - 1]} {momento.year}"


INVITACION_INVALIDA = (
    "Este enlace de invitación no es válido. Solicite uno nuevo a quien lo invitó."
)


def _acceso_desactivado(nombre_cliente: str) -> HTTPException:
    """La cuenta es la invitada, pero su acceso a ese supermercado está
    desactivado (la invitación ya se había usado y después la dieron de baja)."""
    return HTTPException(
        status_code=403,
        detail={
            "codigo": "invitacion_sin_acceso",
            "cliente_nombre": nombre_cliente,
            "mensaje": (
                f"Su acceso a {nombre_cliente} está desactivado. "
                "Solicite a quien lo invitó que lo reactive."
            ),
        },
    )


@router.get("/invitacion/{token}")
def ver_invitacion(token: str, request: Request):
    """Lo que la pantalla de ingreso muestra ANTES de que la persona entre: a
    qué supermercado la invitaron, con qué rol, y con qué correo tiene que
    entrar (enmascarado).

    Pública, porque quien la pide todavía no tiene sesión. El token tiene 256
    bits y no se adivina; igual, cada token que no existe cuenta como intento
    fallido en el mismo freno de `/oauth`, para que esto no sea una manera
    gratis de probar tokens. Un cliente archivado o borrado contesta lo mismo
    que un token inventado.
    """
    from app.clientes import sesion_registro
    from app.models.identidad import IntentoOauth, Invitacion

    reg = sesion_registro()
    try:
        ip = ip_del_cliente(request)
        frenar_si_hay_muchos_fallos(reg, ip, modelo=IntentoOauth)
        limpio = (token or "").strip()
        inv = reg.query(Invitacion).filter(Invitacion.token == limpio).first() if limpio else None
        cliente = buscar(inv.cliente_slug) if inv is not None else None
        if inv is None or cliente is None:
            anotar_fallo(reg, ip, modelo=IntentoOauth)
            raise HTTPException(status_code=404, detail=INVITACION_INVALIDA)
        vence = _con_zona(inv.expira_en)
        if inv.usada_en is not None:
            estado = "usada"
        elif vence <= datetime.now(timezone.utc):
            estado = "vencida"
        else:
            estado = "vigente"
        return {
            "estado": estado,
            "cliente_nombre": cliente.nombre,
            "rol": inv.rol,
            "correo": enmascarar_correo(inv.email),
            "expira_en": vence,
        }
    finally:
        reg.close()


def _rol_de_token(rol_membresia: str) -> str:
    """``owner``/``admin`` de membresía entran al middleware como ``admin``.

    Spec, decisión 5: el JWT propio sólo conoce dos roles. El ``owner`` de hoy
    gestiona usuarios además de lo que gestiona un admin, pero eso lo decide
    `require_admin` — sigue viendo `role == "admin"`. No hay tercer valor que
    inventarle al middleware existente.
    """
    return "admin" if rol_membresia in ("owner", "admin") else "worker"


# ─── La consola del operador (Fase 4) ────────────────────────────────────────

def _entrar_a_la_consola(reg: Session, ip: str, usuario, email: str) -> dict:
    """El operador SIN membresías entra a `/plataforma`, no al 403 de siempre.

    Hasta la Fase 3 este camino terminaba en «tu cuenta no tiene acceso a
    ningún cliente», y al dueño del SaaS la pantalla le ofrecía *fundar su
    supermercado*: la puerta equivocada para la única persona que no viene a
    usar un supermercado sino a operarlos todos.

    Lo que sale es el MISMO JWT de siempre, sin un claim nuevo ni uno de menos
    (``role``/``epoca``/``cliente``/``sub``/``email``):

    · ``role="worker"`` — mínimo privilegio. La consola no necesita más: sus
      endpoints se defienden con `require_operador`, no con el rol del token,
      y si este token se filtrara, "worker" es el techo del daño.
    · ``cliente="plataforma"`` — el slug RESERVADO del alta. No hay base con
      ese nombre y `cliente_del_pedido` sólo lo resuelve adentro de
      ``/api/plataforma``: fuera de ahí, 401.
    · ``epoca`` — la del rol ``worker`` en la BASE POR DEFECTO, que es la del
      registro. Es la única base a la que este token se conecta, así que tiene
      que ser la misma que va a comprobar `require_auth` en cada pedido; leerla
      de otra parte dejaría un token que no valida contra nada.

    No escribe una línea en la bitácora de ningún cliente: no hay cliente al
    que entrar. Lo que sí queda es `ultimo_login`, en el registro.
    """
    # Imports perezosos, como en `oauth_login`: `models/identidad.py` no
    # depende de este router y así queda a prueba de cualquier ciclo futuro.
    from app.models.identidad import IntentoOauth
    from app.plataforma_estado import NOMBRE_PLATAFORMA, SLUG_PLATAFORMA

    usuario.ultimo_login = datetime.now(timezone.utc)
    reg.commit()
    borrar_fallos(reg, ip, modelo=IntentoOauth)

    epoca = epoca_de(reg, "worker")
    return {
        "token": create_token(
            "worker", epoca, SLUG_PLATAFORMA, sub=usuario.id, email=email,
        ),
        "role": "worker",
        "cliente": SLUG_PLATAFORMA,
        "cliente_nombre": NOMBRE_PLATAFORMA,
        "email": email,
        "nombre": usuario.nombre,
        # Top-level, hermano del token — igual que `aviso_cuenta` (Fase 2) y
        # `pedir_consentimiento` (Fase 3): el JWT no cambia de forma, ni un
        # claim. Es lo que le dice al frontend que aterrice en /plataforma.
        "plataforma": True,
    }


@router.post("/oauth")
def oauth_login(
    payload: OAuthIn,
    request: Request,
    verificador: Optional[VerificadorDeIdToken] = Depends(get_verificador),
):
    """Login con Google o correo/contraseña, vía Firebase.

    El backend nunca ve una contraseña acá: Firebase ya autenticó a la
    persona y lo único que llega es su ID token, que se verifica contra el
    JWKS de Google (``services/firebase_tokens.py``). De ahí en más es
    resolver identidad, no autenticar de nuevo.
    """
    # Imports perezosos: `models/identidad.py` no depende de este router, pero
    # evita cualquier ciclo si `clientes.py` alguna vez importa `routers.auth`
    # arriba (hoy no lo hace, y así queda a prueba de que empiece a hacerlo).
    from app.clientes import sesion_registro
    from app.models.consentimiento import VERSION_POLITICA
    from app.models.identidad import IntentoOauth, Invitacion, Membresia, Usuario

    if verificador is None:
        raise HTTPException(
            status_code=503,
            detail="Login con Google/correo no configurado en este servidor",
        )

    reg = sesion_registro()
    try:
        # Mismo freno que el login legado (`frenar_si_hay_muchos_fallos` /
        # `anotar_fallo`, arriba en este archivo), pero contra `IntentoOauth`
        # y NO contra `LoginAttempt`: compartir esa tabla habría sumado los
        # fallos de `/oauth` de CUALQUIER cliente a los del login legado de
        # uno solo —el cliente por defecto, porque su base resulta ser la
        # misma que la del registro— dejando a los demás sin contar nada.
        # Sirve tanto para no dar intentos gratis de "¿existe esta
        # invitación?" como para no convertir el endpoint en una máquina de
        # gastar CPU verificando firmas RSA de tokens inventados. Va ANTES de
        # tocar el verificador, que es la parte cara.
        ip = ip_del_cliente(request)
        frenar_si_hay_muchos_fallos(reg, ip, modelo=IntentoOauth)

        claims = verificador.verificar(payload.id_token)
        if claims is None:
            anotar_fallo(reg, ip, modelo=IntentoOauth)
            raise HTTPException(status_code=401, detail="Token inválido o expirado")

        # Un correo es CONFIABLE si viene verificado o si el token lo emitió
        # Google (Google verifica el correo antes de emitir el ID token, por
        # eso el claim confía aunque `email_verified` no venga marcado — pasa
        # con cuentas de Workspace). CUALQUIER otro proveedor (incluido
        # "password") tiene que traerlo en `true`: sin este chequeo, alguien
        # con una cuenta de Firebase por un proveedor que no pide probar el
        # correo podría declarar CUALQUIER email y canjear la invitación de
        # otra persona. ESTA MISMA VARA decide también la vinculación por
        # correo de más abajo — tener dos varas distintas era un bug real: un
        # google.com sin `email_verified` pasaba esta puerta, NO vinculaba, y
        # con una invitación pendiente moría en un 500 de UNIQUE(email) al
        # intentar crear un usuario con un correo que ya existía; y ese 500
        # funcionaba de oráculo de qué correos ya tienen cuenta.
        correo_confiable = claims.email_verificado or claims.proveedor == "google.com"
        if not correo_confiable:
            anotar_fallo(reg, ip, modelo=IntentoOauth)
            raise HTTPException(status_code=401, detail="Verificá tu correo antes de entrar")

        email = (claims.email or "").strip().lower()
        if not email:
            anotar_fallo(reg, ip, modelo=IntentoOauth)
            raise HTTPException(status_code=401, detail="Token inválido o expirado")

        ahora = datetime.now(timezone.utc)

        # La invitación del enlace, si la persona llegó por él (ver el bloque
        # de `enmascarar_correo`). Se resuelve ANTES de tocar nada: cuando la
        # cuenta no es la invitada no se crea usuario, no se canjea ninguna
        # invitación y no se entra a ningún otro supermercado — lo que la
        # persona venía a hacer era entrar a ESE, y entrar a otro en silencio
        # sería exactamente «entrar al supermercado equivocado».
        del_enlace = None
        cliente_del_enlace = None
        token_enlace = (payload.invitacion or "").strip()
        if token_enlace:
            del_enlace = reg.query(Invitacion).filter(Invitacion.token == token_enlace).first()
            cliente_del_enlace = buscar(del_enlace.cliente_slug) if del_enlace is not None else None
            if del_enlace is None or cliente_del_enlace is None:
                anotar_fallo(reg, ip, modelo=IntentoOauth)
                raise HTTPException(
                    status_code=404,
                    detail={"codigo": "invitacion_invalida", "mensaje": INVITACION_INVALIDA},
                )
            if del_enlace.email != email:
                raise HTTPException(
                    status_code=403,
                    detail={
                        "codigo": "invitacion_otro_correo",
                        "correo": enmascarar_correo(del_enlace.email),
                        "cliente_nombre": cliente_del_enlace.nombre,
                        "mensaje": (
                            f"La invitación a {cliente_del_enlace.nombre} es para "
                            f"{enmascarar_correo(del_enlace.email)} y usted ingresó con {email}. "
                            "Cierre esta sesión e ingrese con la cuenta invitada."
                        ),
                    },
                )
            if del_enlace.usada_en is None and _con_zona(del_enlace.expira_en) <= ahora:
                raise HTTPException(
                    status_code=410,
                    detail={
                        "codigo": "invitacion_vencida",
                        "cliente_nombre": cliente_del_enlace.nombre,
                        "mensaje": (
                            f"La invitación a {cliente_del_enlace.nombre} venció el "
                            f"{_fecha_corta(_con_zona(del_enlace.expira_en))}. "
                            "Solicite una nueva a quien lo invitó."
                        ),
                    },
                )

        usuario = reg.query(Usuario).filter(Usuario.firebase_uid == claims.uid).first()

        if usuario is None:
            # ¿Ya es usuario por otro proveedor con el mismo correo? Se
            # vincula con la MISMA vara que la puerta de arriba (todo el que
            # llegó hasta acá tiene correo confiable). Nunca se crea un
            # usuario nuevo si el correo ya tiene fila: UNIQUE(email) manda.
            usuario = reg.query(Usuario).filter(Usuario.email == email).first()
            if usuario is not None:
                usuario.firebase_uid = claims.uid
                if claims.nombre and not usuario.nombre:
                    usuario.nombre = claims.nombre

        # Invitaciones pendientes de este correo: se canjean SIEMPRE, no sólo
        # la primera vez que se ve el correo. Alguien puede recibir una
        # invitación a un SEGUNDO cliente después de ya tener cuenta —si sólo
        # se mirara cuando `usuario is None`, esa invitación quedaría pendiente
        # para siempre: el próximo login ya resuelve al usuario por
        # `firebase_uid` y nunca vuelve a mirar la tabla. Se canjean TODAS las
        # que haya, no sólo una: dos clientes distintos pueden haber invitado
        # al mismo correo, y las dos membresías nacen juntas.
        invitaciones = (
            reg.query(Invitacion)
            .filter(
                Invitacion.email == email,
                Invitacion.usada_en.is_(None),
                Invitacion.expira_en > ahora,
            )
            .order_by(Invitacion.creado_en.asc())
            .all()
        )

        # Fase 4: un operador de la plataforma NO necesita invitación ni
        # membresía para entrar a su consola. Sin esta excepción, el primer
        # login del dueño del SaaS —que puede no tener fila en `usuarios`
        # todavía— moriría acá, antes de llegar a la bifurcación de más
        # abajo. `es_operador` lee `OPERADOR_EMAILS` del entorno, así que
        # esto no crea ninguna puerta nueva: quien la abre es quien
        # despliega, y ya la tenía abierta.
        es_op = es_operador(email)
        if usuario is None and not invitaciones and not es_op:
            anotar_fallo(reg, ip, modelo=IntentoOauth)
            raise HTTPException(
                status_code=403,
                detail="Tu cuenta no tiene acceso a ningún cliente. Pedí una invitación.",
            )

        if usuario is None:
            usuario = Usuario(firebase_uid=claims.uid, email=email, nombre=claims.nombre)
            reg.add(usuario)
            reg.flush()  # necesita usuario.id para las membresías

        if invitaciones:
            ya_miembro = {
                m.cliente_slug
                for m in reg.query(Membresia).filter(Membresia.usuario_id == usuario.id).all()
            }

            # Fase 3: si el canje va a crear al menos UNA membresía nueva y esta
            # cuenta todavía no tiene fila para la versión vigente de la
            # política, hace falta aceptarla antes de tocar nada — nada se
            # canjea y no se marca ninguna invitación como usada.
            crea_membresia_nueva = any(
                invitacion.cliente_slug not in ya_miembro for invitacion in invitaciones
            )
            if crea_membresia_nueva and not _tiene_consentimiento_vigente(reg, usuario.id):
                if not payload.acepta_politica:
                    # Sin commit: si `usuario` se acababa de crear más arriba
                    # (`reg.add` + `reg.flush()`, todavía sin comitear), el
                    # `reg.close()` del `finally` lo deshace con el resto de
                    # la transacción — "nada se canjea" también para la fila
                    # de `usuarios`, no sólo para la membresía. No se toca el
                    # contador de `IntentoOauth` tampoco: no es un intento
                    # fallido, pero comitear acá para limpiarlo persistiría
                    # ese mismo usuario a medias.
                    raise HTTPException(
                        status_code=428,
                        detail={"codigo": "consentimiento_requerido", "version": VERSION_POLITICA},
                    )
                _registrar_consentimiento(reg, usuario.id, ip, origen="invitacion")

            for invitacion in invitaciones:
                # Ya hay membresía en ese cliente (activa o no): dos
                # invitaciones al mismo cliente no pueden generar dos filas —
                # la tabla tiene UNIQUE(usuario_id, cliente_slug) — y si ya
                # existe la membresía, ésta no la resucita ni le cambia el rol.
                if invitacion.cliente_slug in ya_miembro:
                    invitacion.usada_en = ahora
                    continue
                ya_miembro.add(invitacion.cliente_slug)
                reg.add(Membresia(
                    usuario_id=usuario.id,
                    cliente_slug=invitacion.cliente_slug,
                    rol=invitacion.rol,
                    activo=True,
                ))
                invitacion.usada_en = ahora
            reg.commit()

        membresias = (
            reg.query(Membresia)
            .filter(Membresia.usuario_id == usuario.id, Membresia.activo == True)  # noqa: E712
            .all()
        )
        # Las de un cliente archivado no cuentan (2026-09-23): no se puede
        # entrar ahí, y ofrecerlas en el selector sólo lleva a un 403 después
        # de elegir. `buscar` ya los trata como inexistentes.
        membresias = [m for m in membresias if buscar(m.cliente_slug) is not None]
        if not membresias:
            if es_op:
                return _entrar_a_la_consola(reg, ip, usuario, email)
            if del_enlace is not None:
                # Vino por el enlace, la cuenta es la invitada y aun así no
                # tiene acceso: la invitación ya se había usado y a esa
                # membresía la desactivaron. Un token válido no es un fallo.
                borrar_fallos(reg, ip, modelo=IntentoOauth)
                raise _acceso_desactivado(cliente_del_enlace.nombre)
            anotar_fallo(reg, ip, modelo=IntentoOauth)
            raise HTTPException(
                status_code=403,
                detail="Tu cuenta no tiene acceso a ningún cliente. Pedí una invitación.",
            )

        elegida: Membresia | None = None
        if payload.cliente:
            slug_pedido = payload.cliente.strip().lower()
            elegida = next((m for m in membresias if m.cliente_slug == slug_pedido), None)
            if elegida is None:
                anotar_fallo(reg, ip, modelo=IntentoOauth)
                raise HTTPException(status_code=403, detail="No tenés acceso a ese cliente.")
        elif del_enlace is not None:
            # Llegó por el enlace de ESTE supermercado: entra ahí, aunque tenga
            # otros — el selector está para cuando nadie dijo adónde iba.
            elegida = next((m for m in membresias if m.cliente_slug == del_enlace.cliente_slug), None)
            if elegida is None:
                # Tiene otros accesos, pero el de ESTE supermercado está
                # desactivado: no se lo manda a otro en silencio.
                borrar_fallos(reg, ip, modelo=IntentoOauth)
                raise _acceso_desactivado(cliente_del_enlace.nombre)
        elif len(membresias) == 1:
            elegida = membresias[0]

        if elegida is None:
            # Varias membresías y sin elegir todavía: el front pregunta. El ID
            # token SÍ era válido, así que esto es un login que sigue en curso,
            # no un fallo — se limpia la cuenta de intentos igual que el éxito.
            borrar_fallos(reg, ip, modelo=IntentoOauth)
            filas = []
            for m in membresias:
                cliente_obj = buscar(m.cliente_slug)
                filas.append({
                    "cliente": m.cliente_slug,
                    "nombre": cliente_obj.nombre if cliente_obj else m.cliente_slug,
                    "rol": m.rol,
                })
            return {"requiere_cliente": True, "membresias": filas}

        cliente_obj = buscar(elegida.cliente_slug)
        if cliente_obj is None:
            # El cliente de la membresía está inactivo o ya no existe.
            anotar_fallo(reg, ip, modelo=IntentoOauth)
            raise HTTPException(
                status_code=403,
                detail="Tu cuenta no tiene acceso a ningún cliente. Pedí una invitación.",
            )

        # El interruptor de estado, otra vez explícito: `/oauth` tampoco pasa
        # por `cliente_del_pedido`. Acá el ID token YA está verificado y la
        # membresía resuelta, así que contestar 402 no le cuenta nada a nadie
        # que no fuera de la casa — al revés que en el login legado, donde el
        # chequeo tiene que esperar a la contraseña.
        aviso = _aviso_de(cliente_obj.slug)
        if aviso is not None and aviso.estado == "suspendido" and elegida.rol != "owner":
            # Un token válido no es un intento fallido: se limpia la cuenta de
            # intentos igual que en el éxito, como ya hace la rama de
            # multi-membresía. El motivo NO viaja: es información de la
            # relación comercial, y esa la tiene el owner, no su gente.
            borrar_fallos(reg, ip, modelo=IntentoOauth)
            raise HTTPException(
                status_code=402,
                detail=CUENTA_SUSPENDIDA,
                headers={CABECERA_ESTADO_CUENTA: "suspendido"},
            )

        usuario.ultimo_login = datetime.now(timezone.utc)
        reg.commit()
        borrar_fallos(reg, ip, modelo=IntentoOauth)

        # Fase 3: cuenta existente, CON membresía, que nunca aceptó la versión
        # vigente (o aceptó una anterior) — no se bloquea, se avisa una vez.
        # El frontend lo cierra y no vuelve hasta el próximo login.
        pedir_consentimiento = not _tiene_consentimiento_vigente(reg, usuario.id)

        role = _rol_de_token(elegida.rol)
        cdb = sesion_de(cliente_obj)
        try:
            epoca = epoca_de(cdb, role)
            anotar(cdb, request, role, "login.ok", detalle=email)
            cdb.commit()
        finally:
            cdb.close()

        token = create_token(role, epoca, cliente_obj.slug, sub=usuario.id, email=email)
        cuerpo = {
            "token": token,
            "role": role,
            "cliente": cliente_obj.slug,
            "email": email,
            "nombre": usuario.nombre,
        }
        if aviso is not None:
            # Sólo cuando hay algo que avisar: el cuerpo de un cliente activo
            # queda idéntico al de antes de la Fase 2. El motivo viaja SOLO al
            # owner — en gracia y solo_lectura también, no únicamente en
            # suspendido (hallazgo R-2): su gente ve el estado, no la deuda.
            visible = aviso if elegida.rol == "owner" else _aviso_sin_motivo(aviso)
            cuerpo["aviso_cuenta"] = visible.model_dump()
        if pedir_consentimiento:
            # Top-level, hermano del token — igual que `aviso_cuenta` en Fase
            # 2: el JWT no cambia de forma, ni un claim.
            cuerpo["pedir_consentimiento"] = True
        return cuerpo
    finally:
        reg.close()


@router.post("/aceptar-politica", status_code=204)
def aceptar_politica(
    request: Request,
    role: str = Depends(require_auth),
    identidad: tuple = Depends(sub_y_email_de_la_sesion),
):
    """Registra la aceptación de la política para una cuenta existente
    (Fase 3, origen "login"): lo llama el modal que dispara
    ``pedir_consentimiento`` y también el flujo de aceptar-y-reintentar del
    428 de ``/oauth``, si el frontend prefiere ese camino en vez de reenviar
    ``acepta_politica`` en el mismo pedido.

    Exige un token de cuenta real (con ``sub``): el login legado nunca lo
    trae, y no tiene sentido registrarle un consentimiento a una clave
    compartida por rol que no identifica a nadie — 403.

    Idempotente por construcción: el segundo POST intenta insertar la misma
    fila (mismo ``usuario_id`` + ``version``) y el UNIQUE la rechaza; se
    atrapa y se contesta 204 igual, sin que la persona note nada raro por
    haber tocado el botón dos veces.
    """
    from sqlalchemy.exc import IntegrityError

    from app.clientes import sesion_registro

    sub, _email = identidad
    if sub is None:
        raise HTTPException(
            status_code=403,
            detail="Esta cuenta no tiene consentimiento individual para registrar",
        )

    reg = sesion_registro()
    try:
        ip = ip_del_cliente(request)
        _registrar_consentimiento(reg, sub, ip, origen="login")
        try:
            reg.commit()
        except IntegrityError:
            reg.rollback()  # ya existía la fila para esta versión: idempotente
    finally:
        reg.close()


@router.put("/passwords", response_model=PasswordsOut)
def update_passwords(
    payload: PasswordsUpdate,
    request: Request,
    rol: str = Depends(require_admin),
    cliente: Cliente = Depends(cliente_del_pedido),
    db: Session = Depends(get_db),
    identidad: tuple = Depends(sub_y_email_de_la_sesion),
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

    # El token de rescate reemplaza al que trajo el pedido: si ESE traía `sub`
    # (un admin con cuenta real, entrado por /oauth), el nuevo tiene que
    # conservarlo. Si no lo llevara, quedaría fuera del chequeo de membresía
    # de `decode_token` — un token de hasta 12 horas que sobrevive a que
    # desactiven a esa misma persona un minuto después.
    sub_actor, email_actor = identidad
    nuevo = (
        create_token(rol, epoca_de(db, rol), cliente.slug, sub=sub_actor, email=email_actor)
        if rol in nuevas else None
    )
    return PasswordsOut(ok=True, token=nuevo)
