"""Alta self-service: un usuario Firebase sin membresías funda su cliente.

Sin JWT propio -- la persona todavía no tiene uno (`/oauth` le daría 403 sin
membresías). Recibe el `id_token` de Firebase directo, con la MISMA vara de
correo confiable que `/oauth` (`routers/auth.py::oauth_login`) y las MISMAS
reglas de vinculación de `Usuario`: por `firebase_uid`, si no por email
confiable, nunca se crea un usuario nuevo si el email ya tiene fila.

Construido sobre `crear_cliente` (`clientes.py`), que ya existe: es el paso
IRREVERSIBLE del alta -- crea la base del supermercado nuevo -- así que TODA
validación va antes de llamarlo. "Sin cliente a medias" (spec): si algo falla
después, no queda una base a medio crear ni una fila colgando.

El freno de fuerza bruta reutiliza las mismas tres funciones de
`routers/auth.py` (`frenar_si_hay_muchos_fallos` / `anotar_fallo` /
`borrar_fallos`), parametrizadas por `IntentoAlta` -- tabla propia, no
contamina ni `login_attempts` ni `oauth_attempts`.
"""
import os
from datetime import datetime, timedelta, timezone
from html import escape
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError

from app.auth import create_token, epoca_de
from app.clientes import (
    SLUG_VALIDO, ErrorDeAlta, crear_cliente, nombre_ocupado, sesion_de, sesion_registro,
)
from app.red import ip_del_cliente
from app.routers.auth import (
    _tiene_consentimiento_vigente,
    anotar_fallo,
    borrar_fallos,
    frenar_si_hay_muchos_fallos,
)
from app.services.firebase_tokens import VerificadorDeIdToken, get_verificador
from app.services import terminos as terminos_srv
# Registra `aceptaciones_de_terminos` en `Base.metadata` antes de `create_all()`.
from app.models import terminos as _tablas_de_terminos  # noqa: F401

router = APIRouter(prefix="/clientes", tags=["clientes"])

# Códigos que nadie puede fundar por acá: son rutas o nombres propios del
# sistema, no supermercados. Lista propia del alta self-service -- `crear_cliente`
# no la conoce, porque también la usa la creación manual de un cliente nuevo.
SLUGS_RESERVADOS = {
    "galerias", "api", "www", "admin", "plataforma", "registro", "recabra",
    "app", "auth", "login", "oauth", "test", "demo", "soporte", "status", "render",
}

MENSAJE_SLUG_TOMADO = "Ese código ya está tomado. Probá con otro."
# Un supermercado con el nombre de otro que ya usa el sistema es, casi
# siempre, alguien de ESE supermercado que no encontró su invitación: fundar
# acá lo deja trabajando en una base vacía creyendo que es la de su empresa
# (2026-09-23 — así nacieron clientes que nadie quería). Se le dice qué hacer
# en vez de crearlo. Decir que el nombre existe no es contar un secreto: está
# en la fachada de la tienda, y sólo lo ve quien ya entró con una cuenta.
MENSAJE_NOMBRE_TOMADO = (
    "Ya hay un supermercado con ese nombre en RECABRA. Si usted trabaja allí, no lo cree "
    "de nuevo: solicite a su dueño una invitación a su correo. Si es otro supermercado, "
    "agregue la ciudad o la sede al nombre."
)
MAX_FUNDACIONES_POR_USUARIO = 2

# Tope de altas self-service de TODA la plataforma en 24 horas (auditoría
# pre-lanzamiento, P1-12). Cada alta crea una base de Postgres y abre su pool
# de conexiones: con cuentas de Google descartables, el tope por usuario de
# arriba no frena a nadie. Pasado el tope, el alta queda en espera
# (`AltaEnEspera`) y al operador le llega un correo; ninguna base se crea.
ALTAS_POR_DIA_DEFECTO = 10
MENSAJE_EN_ESPERA = (
    "Hoy ya se dieron de alta muchos supermercados y el suyo quedó en lista de espera. "
    "Le escribimos a su correo para habilitarlo en cuanto podamos."
)


def altas_por_dia() -> int:
    try:
        return max(0, int(os.getenv("ALTAS_POR_DIA", str(ALTAS_POR_DIA_DEFECTO))))
    except ValueError:
        return ALTAS_POR_DIA_DEFECTO


def _avisar_al_operador(background_tasks: BackgroundTasks, asunto: str, nombre: str, slug: str,
                        email: str, pie: str) -> None:
    """Un correo a quienes operan la plataforma. Sin operadores, nada."""
    from app.plataforma_estado import correos_de_operador
    from app.services.mailer import html_shell, send_mail_to_bg

    destino = correos_de_operador()
    if destino:
        filas = [("Supermercado", escape(nombre)), ("Código", escape(slug)), ("Correo", escape(email))]
        background_tasks.add_task(send_mail_to_bg, destino, asunto, html_shell(asunto, filas, pie))


class AltaIn(BaseModel):
    id_token: str
    slug: str
    nombre: str
    # Fase 3: sin esto no hay fundación. Falso/ausente es el default -- la
    # persona tiene que marcarlo, no viene marcado por omisión.
    acepta_politica: bool = False
    # P0-2: con términos del servicio vigentes (`TERMINOS_VIGENTES`, ver
    # `services/terminos.py`), la dueña los acepta al fundar, con la versión
    # que leyó. Sin términos vigentes se ignoran y el alta es la de siempre.
    acepta_terminos: bool = False
    version_terminos: Optional[str] = None


@router.post("/alta")
def alta_self_service(
    payload: AltaIn,
    request: Request,
    background_tasks: BackgroundTasks,
    verificador: Optional[VerificadorDeIdToken] = Depends(get_verificador),
):
    # Imports perezosos, mismo motivo que `routers/auth.py::oauth_login`: sin
    # ciclo aunque `clientes.py` llegue a importar algo de acá alguna vez.
    from app.models.consentimiento import VERSION_POLITICA, Consentimiento
    from app.models.identidad import Membresia, Usuario
    from app.models.models import ClienteRow
    from app.models.plataforma import AltaEnEspera, Fundacion, IntentoAlta

    reg = sesion_registro()
    try:
        ip = ip_del_cliente(request)

        # 1) Freno por IP, ANTES de tocar el verificador -- ni un intento
        # gratis de "¿existe este id_token?", ni gastar CPU verificando firmas
        # RSA de tokens inventados.
        frenar_si_hay_muchos_fallos(reg, ip, modelo=IntentoAlta)

        # 2) Sin verificador configurado, el alta se apaga sola.
        if verificador is None:
            raise HTTPException(
                status_code=503,
                detail="Login con Google/correo no configurado en este servidor",
            )

        # 3) Token inválido o vencido.
        claims = verificador.verificar(payload.id_token)
        if claims is None:
            anotar_fallo(reg, ip, modelo=IntentoAlta)
            raise HTTPException(status_code=401, detail="Token inválido o expirado")

        # 4) Correo confiable -- MISMA vara que /oauth: verificado, o el
        # proveedor es Google (que ya lo verificó él antes de emitir el token).
        correo_confiable = claims.email_verificado or claims.proveedor == "google.com"
        if not correo_confiable:
            anotar_fallo(reg, ip, modelo=IntentoAlta)
            raise HTTPException(status_code=401, detail="Verificá tu correo antes de entrar")

        email = (claims.email or "").strip().lower()
        if not email:
            anotar_fallo(reg, ip, modelo=IntentoAlta)
            raise HTTPException(status_code=401, detail="Token inválido o expirado")

        # 5) Nombre del supermercado.
        nombre = (payload.nombre or "").strip()
        if not nombre:
            raise HTTPException(status_code=422, detail="El nombre del supermercado no puede estar vacío")

        # 5.5) Nombre repetido entre los clientes activos (ver
        # `MENSAJE_NOMBRE_TOMADO`). Antes del slug a propósito: quien escribió
        # el nombre de su empresa tiene que leer esto, no «el código está
        # tomado», que lo invita a probar con otro código.
        if nombre_ocupado(reg, nombre) is not None:
            raise HTTPException(status_code=409, detail=MENSAJE_NOMBRE_TOMADO)

        # 6) Slug -- mismo régimen que `crear_cliente`.
        slug = (payload.slug or "").strip().lower()
        if not SLUG_VALIDO.match(slug):
            raise HTTPException(
                status_code=422,
                detail=(
                    "El código del cliente va en minúsculas, sin espacios ni tildes, "
                    "y arranca con una letra."
                ),
            )

        # 7) Reservado: nombres propios del sistema, no supermercados.
        if slug in SLUGS_RESERVADOS:
            raise HTTPException(status_code=409, detail=MENSAJE_SLUG_TOMADO)

        # 8) Ya existe -- consulta DIRECTA a la tabla, activo o no: `buscar()`
        # filtra inactivos y dejaría estrellar el UNIQUE de `clientes.slug`.
        if reg.query(ClienteRow).filter(ClienteRow.slug == slug).first() is not None:
            raise HTTPException(status_code=409, detail=MENSAJE_SLUG_TOMADO)

        # 8.5) Fase 3: aceptar la Política de Tratamiento de Datos Personales.
        # ANTES de cualquier escritura -- el Usuario que se resuelve/crea en
        # el paso siguiente incluido -- y del paso irreversible de más abajo.
        if not payload.acepta_politica:
            raise HTTPException(
                status_code=422,
                detail="Para fundar el cliente hay que aceptar la Política de Tratamiento de Datos Personales",
            )

        # 8.6) Los términos del servicio, si rigen (P0-2). También antes de
        # cualquier escritura. La versión tiene que ser la que rige AHORA: si
        # cambió mientras la persona leía, aceptó otro texto.
        terminos_vigentes = terminos_srv.version_vigente()
        if terminos_vigentes is not None:
            if not payload.acepta_terminos:
                raise HTTPException(
                    status_code=422,
                    detail="Para fundar el cliente hay que aceptar los Términos del servicio",
                )
            if (payload.version_terminos or "").strip() != terminos_vigentes:
                raise HTTPException(
                    status_code=409,
                    detail="Los términos del servicio cambiaron mientras leías: volvé a abrirlos y aceptá la versión nueva.",
                )

        # 9) Resolver/crear Usuario -- MISMAS reglas de vinculación que
        # /oauth: por firebase_uid, si no por email (ya confiable a esta
        # altura), y nunca se crea uno nuevo si el email ya tiene fila.
        usuario = reg.query(Usuario).filter(Usuario.firebase_uid == claims.uid).first()
        if usuario is None:
            usuario = reg.query(Usuario).filter(Usuario.email == email).first()
            if usuario is not None:
                usuario.firebase_uid = claims.uid
                if claims.nombre and not usuario.nombre:
                    usuario.nombre = claims.nombre
        if usuario is None:
            usuario = Usuario(firebase_uid=claims.uid, email=email, nombre=claims.nombre)
            reg.add(usuario)
            reg.flush()  # necesita usuario.id para contar fundaciones y la membresía

        # 10) Tope de fundaciones por usuario.
        fundadas = reg.query(Fundacion).filter(Fundacion.usuario_id == usuario.id).count()
        if fundadas >= MAX_FUNDACIONES_POR_USUARIO:
            raise HTTPException(
                status_code=403,
                detail=f"Ya fundaste el máximo de clientes permitidos ({MAX_FUNDACIONES_POR_USUARIO}).",
            )

        # 10.5) Tope diario de la plataforma (P1-12): pasado, el alta queda en
        # espera y no se crea ninguna base.
        desde = datetime.now(timezone.utc) - timedelta(hours=24)
        if reg.query(Fundacion).filter(Fundacion.creado_en >= desde).count() >= altas_por_dia():
            reg.add(AltaEnEspera(email=email, nombre=nombre, slug=slug))
            reg.commit()
            _avisar_al_operador(
                background_tasks, "RECABRA · alta en espera", nombre, slug, email,
                f"Llegó con el tope diario ({altas_por_dia()}) ya alcanzado: no se creó ninguna base. "
                "Si corresponde, dalo de alta desde la consola y avisale a la persona.",
            )
            # Una respuesta y no una excepción: con `raise` las tareas de fondo
            # (el correo al operador) no corren.
            return JSONResponse(status_code=429, content={"detail": MENSAJE_EN_ESPERA},
                                background=background_tasks)

        # `crear_cliente` abre SU PROPIA sesión contra la base por defecto (la
        # misma que `reg`) y hace un COMMIT ahí adentro. En SQLite eso choca
        # con la transacción que `reg` viene arrastrando desde el flush/las
        # consultas de arriba -- "database is locked" -- así que se cierra
        # ACÁ, antes del paso irreversible: no hay nada pendiente de más que
        # perder (el usuario, si era nuevo, ya quedó guardado).
        reg.commit()

        # 11) Recién ahí, el paso irreversible: toda la validación fue antes.
        try:
            cliente = crear_cliente(slug, nombre)
        except ErrorDeAlta:
            raise HTTPException(status_code=409, detail=MENSAJE_SLUG_TOMADO)
        except IntegrityError:
            # Carrera: dos altas con el mismo slug llegaron casi juntas.
            raise HTTPException(status_code=409, detail=MENSAJE_SLUG_TOMADO)

        # 12) Membresía owner + fundación + consentimiento registrado, en UN
        # solo commit del registro. El consentimiento es por USUARIO, no por
        # alta: quien funda un segundo cliente con la misma cuenta (tope de
        # `MAX_FUNDACIONES_POR_USUARIO`, arriba) ya tiene fila de la primera
        # vez -- insertarla de nuevo estrellaría el UNIQUE(usuario_id,
        # version).
        reg.add(Membresia(usuario_id=usuario.id, cliente_slug=cliente.slug, rol="owner", activo=True))
        reg.add(Fundacion(usuario_id=usuario.id, cliente_slug=cliente.slug))
        if not _tiene_consentimiento_vigente(reg, usuario.id):
            reg.add(Consentimiento(usuario_id=usuario.id, version=VERSION_POLITICA, ip=ip, origen="alta"))
        if terminos_vigentes is not None:
            # La constancia del alta dice las dos versiones: la de los términos
            # y la de la política que regía.
            terminos_srv.registrar(reg, usuario.id, cliente.slug, terminos_vigentes, ip, origen="alta")
        usuario.ultimo_login = datetime.now(timezone.utc)
        reg.commit()

        _avisar_al_operador(
            background_tasks, "RECABRA · supermercado nuevo", cliente.nombre, cliente.slug, email,
            "Se dio de alta por el autoservicio.",
        )

        # 13) Éxito: se limpia el contador de esta IP y se emite el token,
        # igual que /oauth -- la época sale de la base NUEVA del cliente.
        borrar_fallos(reg, ip, modelo=IntentoAlta)

        cdb = sesion_de(cliente)
        try:
            epoca = epoca_de(cdb, "admin")
        finally:
            cdb.close()

        token = create_token("admin", epoca, cliente.slug, sub=usuario.id, email=email)
        return {
            "token": token,
            "role": "admin",
            "cliente": cliente.slug,
            "cliente_nombre": cliente.nombre,
            "rol_cliente": "owner",
            "email": email,
            "nombre": usuario.nombre,
        }
    finally:
        reg.close()
