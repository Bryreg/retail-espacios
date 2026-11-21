"""Gestión de usuarios de un cliente: invitar, listar, activar/desactivar y
cambiar el rol.

Todo bajo ``require_admin`` y operando sobre el cliente **del token** —
``cliente_del_pedido``—, nunca sobre uno que venga en la URL o el cuerpo: un
admin de Olímpica no tiene por qué poder nombrar el slug de otro supermercado
y que el servidor le crea.

Rutas literales (``/invitar``, la lista en la raíz) declaradas ANTES que la
paramétrica (``/{usuario_id}``), como manda la regla dura del repo.
"""
import secrets
from datetime import datetime, timedelta, timezone
from html import escape
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from app.auth import invalidar_cache_membresia, require_admin, sub_y_email_de_la_sesion
from app.clientes import Cliente, buscar, cliente_del_pedido
from app.database import get_db
from app.services.bitacora import anotar
from app.services.cola_de_correos import enviar_ya_y_anotar
from sqlalchemy.orm import Session
from app.models.identidad import ROLES_MEMBRESIA, Invitacion, Membresia, Usuario
from app.services.mailer import app_base_url, html_shell, send_mail_to_bg

router = APIRouter(prefix="/usuarios", tags=["usuarios"])

INVITACION_TTL_DIAS = 7

ROL_EN_EL_CORREO = {"owner": "Dueño", "admin": "Administrador", "worker": "Trabajador"}

SOLO_DUENIO_INVITA_DUENIO = "Sólo un dueño puede invitar a otro dueño."
SOLO_DUENIO_TOCA_DUENIO = "Sólo un dueño puede activar o desactivar a otro dueño."
# Cambiar el rol (2026-11-20): reinvitar a alguien que ya es miembro da 409, y
# no había otra forma de pasar a un trabajador a administrador. Mismas reglas
# que invitar: sólo un dueño da el rol Dueño o se lo quita a otro.
SOLO_DUENIO_CAMBIA_DUENIO = "Sólo un dueño puede dar el rol Dueño o cambiarle el rol a otro dueño."
ULTIMO_DUENIO = "No se puede dejar al supermercado sin dueño: primero dale el rol Dueño a otra persona."
# Ni desactivarse ni cambiarse el rol uno mismo: quien se desactiva pierde el
# acceso en el acto, y quien se baja de rol puede quedarse sin poder volver.
# Lo hace otra persona: a un dueño, otro dueño; a un administrador, también
# otro administrador.
NO_A_VOS_MISMO = "No podés desactivarte ni cambiarte el rol a vos mismo: pedíselo a otra persona que maneje el equipo."


def _actor_es_duenio(reg, sub, cliente_slug: str) -> bool:
    """¿Quien hace el pedido es DUEÑO (membresía activa ``owner``) de este cliente?

    El token no lo dice: ``owner`` y ``admin`` viajan los dos como ``admin``
    (spec de la Fase 1, decisión 5), así que se pregunta a la membresía. Sin
    esto, cualquier administrador se fabricaba un dueño —invitándolo o
    reactivándolo— y el dueño es quien ve el motivo del corte de cuenta, entra
    aunque la cuenta esté suspendida y ejerce los derechos del titular.

    El login legado (token sin ``sub``) no pasa por acá: es la clave maestra de
    la instalación, no una persona, y ya no tiene pantalla desde la Fase 15.
    """
    fila = (
        reg.query(Membresia)
        .filter(
            Membresia.usuario_id == sub,
            Membresia.cliente_slug == cliente_slug,
            Membresia.activo == True,  # noqa: E712
        )
        .first()
    )
    return fila is not None and fila.rol == "owner"


# ─── Schemas ──────────────────────────────────────────────────────────────────

class InvitarIn(BaseModel):
    email: str
    rol: str


class InvitarOut(BaseModel):
    ok: bool
    expira_en: datetime
    # Si el correo salió ya. Si no, quedó en la cola de correos y el
    # mantenimiento lo reintenta: la pantalla no dice «enviada» sin serlo.
    correo_enviado: bool = False


class MiembroOut(BaseModel):
    id: int
    email: str
    nombre: Optional[str] = None
    rol: str
    activo: bool
    ultimo_login: Optional[datetime] = None


class InvitacionPendienteOut(BaseModel):
    email: str
    rol: str
    expira_en: datetime


class UsuariosOut(BaseModel):
    miembros: list[MiembroOut]
    invitaciones: list[InvitacionPendienteOut]


class PatchUsuarioIn(BaseModel):
    # Los dos opcionales: Ajustes › Equipo manda uno por vez. Sin ninguno, 422.
    activo: Optional[bool] = None
    rol: Optional[str] = None


# ─── POST /usuarios/invitar ────────────────────────────────────────────────────

@router.post("/invitar", response_model=InvitarOut)
def invitar_usuario(
    payload: InvitarIn,
    request: Request,
    rol: str = Depends(require_admin),
    cliente: Cliente = Depends(cliente_del_pedido),
    identidad: tuple = Depends(sub_y_email_de_la_sesion),
    db: Session = Depends(get_db),
):
    email = (payload.email or "").strip().lower()
    if not email or "@" not in email or " " in email:
        raise HTTPException(status_code=422, detail="Correo inválido")
    rol_nuevo = (payload.rol or "").strip().lower()
    if rol_nuevo not in ROLES_MEMBRESIA:
        raise HTTPException(
            status_code=422,
            detail=f"Rol inválido: debe ser uno de {', '.join(ROLES_MEMBRESIA)}",
        )

    from app.clientes import sesion_registro

    reg = sesion_registro()
    try:
        sub_actor = identidad[0]
        if rol_nuevo == "owner" and sub_actor is not None and not _actor_es_duenio(reg, sub_actor, cliente.slug):
            raise HTTPException(status_code=403, detail=SOLO_DUENIO_INVITA_DUENIO)

        usuario = reg.query(Usuario).filter(Usuario.email == email).first()
        if usuario is not None:
            ya_miembro = (
                reg.query(Membresia)
                .filter(Membresia.usuario_id == usuario.id, Membresia.cliente_slug == cliente.slug)
                .first()
            )
            if ya_miembro is not None:
                raise HTTPException(status_code=409, detail="Esa persona ya es miembro de este supermercado: cambiale el rol desde la lista.")

        ahora = datetime.now(timezone.utc)
        expira = ahora + timedelta(days=INVITACION_TTL_DIAS)
        # `token_urlsafe(32)` — 256 bits, no adivinable e independiente de
        # JWT_SECRET: aunque el token viaje en la URL del correo, no revela
        # nada sobre la firma del sistema. Se guarda tal cual (no un hash):
        # a diferencia de una contraseña, este valor no sirve para nada más
        # que canjearse una vez, y guardarlo en claro es lo que permite
        # buscarlo por igualdad al canjearlo.
        token = secrets.token_urlsafe(32)
        # `request.state.actor_email` lo deja `require_auth` (vía
        # `require_admin`) cuando quien invita entró con cuenta real — así
        # queda quién invitó sin agregar un solo campo nuevo al pedido.
        invitado_por = getattr(getattr(request, "state", None), "actor_email", None)

        invitacion = Invitacion(
            email=email,
            cliente_slug=cliente.slug,
            rol=rol_nuevo,
            token=token,
            expira_en=expira,
            invitado_por=invitado_por,
        )
        reg.add(invitacion)
        reg.commit()

        enlace = f"{app_base_url()}/login?invitacion={token}"
        # El correo le dice a la persona CON QUÉ CUENTA entrar (2026-09-23):
        # la invitación se canjea por correo, y quien entraba con otra cuenta
        # —la personal en vez de la del trabajo— terminaba sin acceso y con el
        # formulario de fundar un supermercado adelante. Los valores van
        # escapados: el nombre del supermercado lo escribió quien lo fundó.
        nombre = escape(cliente.nombre)
        html = html_shell(
            # El título lo escapa `html_shell`: acá va el nombre tal cual.
            f"Invitación a {cliente.nombre}",
            [
                ("Supermercado", nombre),
                ("Rol", ROL_EN_EL_CORREO.get(rol_nuevo, rol_nuevo)),
                ("Entrá con", escape(email)),
            ],
            footer=(
                f'Entrá desde <a href="{enlace}">{enlace}</a> con la cuenta '
                f'<b>{escape(email)}</b>: con Google, si es una cuenta de Google, o creando '
                f'una cuenta de correo con esa misma dirección. Si entrás con otra cuenta, la '
                f'invitación no la va a encontrar. El enlace vence en {INVITACION_TTL_DIAS} días.'
            ),
        )
        # Por la cola de correos (como los avisos): se anota antes de salir y,
        # si el proveedor de correo falla, el mantenimiento lo reintenta. Antes
        # salía directo y una falla pasajera perdía la invitación en silencio
        # mientras la pantalla decía «Invitación enviada».
        correo_enviado = enviar_ya_y_anotar(
            db, send_mail_to_bg, [email], f"Invitación a {cliente.nombre} — RECABRA", html,
        )

        # La bitácora del supermercado (auditoría P2-14): a quién se invitó y
        # con qué rol, en palabras («invitada@x: rol Trabajador»); el correo de
        # quien invita lo agrega `anotar` al final. El del invitado va primero
        # (2026-11-21): sin él la línea no decía a quién —y con la clave de la
        # instalación no decía ningún correo—. La lee sólo quien ya ve Equipo,
        # y la supresión de esa persona lo anonimiza como cualquier otro correo.
        # La invitación ya está en el registro: esta línea va en la base del
        # cliente, en su propio commit.
        anotar(db, request, rol, "usuario.invitado", entidad="usuario",
               detalle=f"{email}: rol {ROL_EN_EL_CORREO[rol_nuevo]}")
        db.commit()
        return InvitarOut(ok=True, expira_en=expira, correo_enviado=correo_enviado)
    finally:
        reg.close()


# ─── GET /usuarios ──────────────────────────────────────────────────────────────

@router.get("", response_model=UsuariosOut)
def listar_usuarios(
    rol: str = Depends(require_admin),
    cliente: Cliente = Depends(cliente_del_pedido),
):
    from app.clientes import sesion_registro

    reg = sesion_registro()
    try:
        filas = reg.query(Membresia).filter(Membresia.cliente_slug == cliente.slug).all()
        miembros: list[MiembroOut] = []
        for m in filas:
            u = reg.query(Usuario).filter(Usuario.id == m.usuario_id).first()
            if u is None:
                continue
            miembros.append(MiembroOut(
                id=u.id, email=u.email, nombre=u.nombre,
                rol=m.rol, activo=m.activo, ultimo_login=u.ultimo_login,
            ))
        miembros.sort(key=lambda m: m.email)

        ahora = datetime.now(timezone.utc)
        pendientes = (
            reg.query(Invitacion)
            .filter(
                Invitacion.cliente_slug == cliente.slug,
                Invitacion.usada_en.is_(None),
                Invitacion.expira_en > ahora,
            )
            .order_by(Invitacion.creado_en.desc())
            .all()
        )
        invitaciones = [
            InvitacionPendienteOut(email=i.email, rol=i.rol, expira_en=i.expira_en)
            for i in pendientes
        ]
        return UsuariosOut(miembros=miembros, invitaciones=invitaciones)
    finally:
        reg.close()


# ─── PATCH /usuarios/{usuario_id} ───────────────────────────────────────────────

@router.patch("/{usuario_id}")
def patch_usuario(
    usuario_id: int,
    payload: PatchUsuarioIn,
    request: Request,
    rol: str = Depends(require_admin),
    cliente: Cliente = Depends(cliente_del_pedido),
    identidad: tuple = Depends(sub_y_email_de_la_sesion),
    db: Session = Depends(get_db),
):
    from app.clientes import sesion_registro

    reg = sesion_registro()
    try:
        membresia = (
            reg.query(Membresia)
            .filter(Membresia.usuario_id == usuario_id, Membresia.cliente_slug == cliente.slug)
            .first()
        )
        if membresia is None:
            raise HTTPException(status_code=404, detail="Esa persona no es miembro de este supermercado.")

        if payload.activo is None and payload.rol is None:
            raise HTTPException(status_code=422, detail="Falta qué cambiar: activo o rol.")
        rol_nuevo = None
        if payload.rol is not None:
            rol_nuevo = payload.rol.strip().lower()
            if rol_nuevo not in ROLES_MEMBRESIA:
                raise HTTPException(
                    status_code=422,
                    detail=f"Rol inválido: debe ser uno de {', '.join(ROLES_MEMBRESIA)}",
                )
            if rol_nuevo == membresia.rol:
                rol_nuevo = None  # nada que cambiar
        desactiva = payload.activo is False and membresia.activo

        sub_actor = identidad[0]
        if sub_actor is not None and sub_actor == usuario_id and (desactiva or rol_nuevo is not None):
            raise HTTPException(status_code=409, detail=NO_A_VOS_MISMO)
        es_duenio = sub_actor is None or _actor_es_duenio(reg, sub_actor, cliente.slug)
        if rol_nuevo is not None and (membresia.rol == "owner" or rol_nuevo == "owner") and not es_duenio:
            raise HTTPException(status_code=403, detail=SOLO_DUENIO_CAMBIA_DUENIO)
        if membresia.rol == "owner" and not es_duenio:
            raise HTTPException(status_code=403, detail=SOLO_DUENIO_TOCA_DUENIO)

        # Ni desactivando ni quitándole el rol: el supermercado no se queda sin
        # un dueño activo (es quien ve la suscripción, baja la copia y ejerce
        # los derechos del titular).
        deja_de_ser_duenio = membresia.activo and membresia.rol == "owner" and (desactiva or rol_nuevo is not None)
        if deja_de_ser_duenio:
            otros_owners_activos = (
                reg.query(Membresia)
                .filter(
                    Membresia.cliente_slug == cliente.slug,
                    Membresia.rol == "owner",
                    Membresia.activo == True,  # noqa: E712
                    Membresia.usuario_id != usuario_id,
                )
                .count()
            )
            if otros_owners_activos == 0:
                raise HTTPException(
                    status_code=409,
                    detail="No se puede desactivar al último dueño activo de este supermercado."
                    if desactiva else ULTIMO_DUENIO,
                )

        rol_antes = membresia.rol
        # A quién, para la bitácora: «luis@x: Trabajador → Administrador». Sólo
        # el correo, nunca el nombre: la supresión de la persona lo anonimiza en
        # cualquier columna de texto (`services/titulares.py`).
        afectado = reg.query(Usuario.email).filter(Usuario.id == usuario_id).scalar() or f"persona #{usuario_id}"
        if payload.activo is not None:
            membresia.activo = bool(payload.activo)
        if rol_nuevo is not None:
            membresia.rol = rol_nuevo
        reg.commit()
        # El caché guarda también el rol: con el rol nuevo, el token que esa
        # persona tiene abierto deja de valer si dice otro (`auth.decode_token`)
        # y vuelve a entrar con el que le toca. Sin esto, un administrador
        # pasado a trabajador seguía viendo la plata hasta que el token venciera.
        invalidar_cache_membresia(usuario_id, cliente.slug)
        # La bitácora del supermercado (auditoría P2-14): a quién y qué cambió;
        # quién lo hizo lo agrega `anotar` al final.
        if payload.activo is not None:
            anotar(db, request, rol, "usuario.cambio", entidad="usuario", entidad_id=usuario_id,
                   detalle=f"{afectado}: {'activado' if membresia.activo else 'desactivado'}")
        if rol_nuevo is not None:
            anotar(db, request, rol, "usuario.rol", entidad="usuario", entidad_id=usuario_id,
                   detalle=f"{afectado}: {ROL_EN_EL_CORREO[rol_antes]} → {ROL_EN_EL_CORREO[rol_nuevo]}")
        db.commit()
        return {"ok": True}
    finally:
        reg.close()
