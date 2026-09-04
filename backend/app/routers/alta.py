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
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError

from app.auth import create_token, epoca_de
from app.clientes import SLUG_VALIDO, ErrorDeAlta, crear_cliente, sesion_de, sesion_registro
from app.red import ip_del_cliente
from app.routers.auth import anotar_fallo, borrar_fallos, frenar_si_hay_muchos_fallos
from app.services.firebase_tokens import VerificadorDeIdToken, get_verificador

router = APIRouter(prefix="/clientes", tags=["clientes"])

# Códigos que nadie puede fundar por acá: son rutas o nombres propios del
# sistema, no supermercados. Lista propia del alta self-service -- `crear_cliente`
# no la conoce, porque también la usa la creación manual de un cliente nuevo.
SLUGS_RESERVADOS = {
    "galerias", "api", "www", "admin", "plataforma", "registro", "recabra",
    "app", "auth", "login", "oauth", "test", "demo", "soporte", "status", "render",
}

MENSAJE_SLUG_TOMADO = "Ese código ya está tomado. Probá con otro."
MAX_FUNDACIONES_POR_USUARIO = 2


class AltaIn(BaseModel):
    id_token: str
    slug: str
    nombre: str


@router.post("/alta")
def alta_self_service(
    payload: AltaIn,
    request: Request,
    verificador: Optional[VerificadorDeIdToken] = Depends(get_verificador),
):
    # Imports perezosos, mismo motivo que `routers/auth.py::oauth_login`: sin
    # ciclo aunque `clientes.py` llegue a importar algo de acá alguna vez.
    from app.models.identidad import Membresia, Usuario
    from app.models.models import ClienteRow
    from app.models.plataforma import Fundacion, IntentoAlta

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

        # 12) Membresía owner + fundación, en UN solo commit del registro.
        reg.add(Membresia(usuario_id=usuario.id, cliente_slug=cliente.slug, rol="owner", activo=True))
        reg.add(Fundacion(usuario_id=usuario.id, cliente_slug=cliente.slug))
        usuario.ultimo_login = datetime.now(timezone.utc)
        reg.commit()

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
            "email": email,
            "nombre": usuario.nombre,
        }
    finally:
        reg.close()
