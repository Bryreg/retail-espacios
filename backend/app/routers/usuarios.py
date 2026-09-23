"""Gestión de usuarios de un cliente: invitar, listar, activar/desactivar.

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
from app.models.identidad import ROLES_MEMBRESIA, Invitacion, Membresia, Usuario
from app.services.mailer import app_base_url, html_shell, send_mail_to_bg

router = APIRouter(prefix="/usuarios", tags=["usuarios"])

INVITACION_TTL_DIAS = 7

ROL_EN_EL_CORREO = {"owner": "Dueño", "admin": "Administrador", "worker": "Trabajador"}

SOLO_DUENIO_INVITA_DUENIO = "Sólo un dueño puede invitar a otro dueño."
SOLO_DUENIO_TOCA_DUENIO = "Sólo un dueño puede activar o desactivar a otro dueño."


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
    activo: bool


# ─── POST /usuarios/invitar ────────────────────────────────────────────────────

@router.post("/invitar", response_model=InvitarOut)
def invitar_usuario(
    payload: InvitarIn,
    request: Request,
    rol: str = Depends(require_admin),
    cliente: Cliente = Depends(cliente_del_pedido),
    identidad: tuple = Depends(sub_y_email_de_la_sesion),
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
                raise HTTPException(status_code=409, detail="Esa persona ya es miembro de este cliente.")

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
            f"Invitación a {nombre}",
            [
                ("Supermercado", nombre),
                ("Rol", ROL_EN_EL_CORREO.get(rol_nuevo, rol_nuevo)),
                ("Ingrese con", escape(email)),
            ],
            footer=(
                f'Ingrese desde <a href="{enlace}">{enlace}</a> con la cuenta '
                f'<b>{escape(email)}</b>: con Google, si es una cuenta de Google, o creando '
                f'una cuenta de correo con esa misma dirección. Si ingresa con otra cuenta, la '
                f'invitación no la va a encontrar. El enlace vence en {INVITACION_TTL_DIAS} días.'
            ),
        )
        send_mail_to_bg([email], f"Invitación a {cliente.nombre} — RECABRA", html)

        return InvitarOut(ok=True, expira_en=expira)
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
    rol: str = Depends(require_admin),
    cliente: Cliente = Depends(cliente_del_pedido),
    identidad: tuple = Depends(sub_y_email_de_la_sesion),
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
            raise HTTPException(status_code=404, detail="Esa persona no es miembro de este cliente.")

        sub_actor = identidad[0]
        if membresia.rol == "owner" and sub_actor is not None and not _actor_es_duenio(reg, sub_actor, cliente.slug):
            raise HTTPException(status_code=403, detail=SOLO_DUENIO_TOCA_DUENIO)

        if payload.activo is False and membresia.activo and membresia.rol == "owner":
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
                    detail="No se puede desactivar al último dueño activo de este cliente.",
                )

        membresia.activo = bool(payload.activo)
        reg.commit()
        invalidar_cache_membresia(usuario_id, cliente.slug)
        return {"ok": True}
    finally:
        reg.close()
