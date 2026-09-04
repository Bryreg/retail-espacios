"""Panel de plataforma: quién es operador y el interruptor de estado por cliente.

SOLO datos del registro. Este router JAMÁS abre la base de un cliente
(``sesion_de``) -- un operador toca el registro, no los datos de negocio de
ningún supermercado; el estado de cuenta vive enteramente en la base por
defecto (``estados_cliente``, ver ``app/plataforma_estado.py``).

Operador = email en env ``OPERADOR_EMAILS``, y sólo para cuentas con ``sub``:
el login legado nunca trae ``request.state.actor_email`` (lo deja
``require_auth`` sólo cuando el token trae ``email``), así que
``require_operador`` le da 403 siempre, por construcción -- no hace falta
ningún chequeo especial para el legado.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from app.auth import require_auth
from app.clientes import sesion_registro
from app.plataforma_estado import ESTADOS_CUENTA, es_operador, invalidar_cache_estado

router = APIRouter(prefix="/plataforma", tags=["plataforma"])


def require_operador(request: Request, rol: str = Depends(require_auth)) -> str:
    """``require_auth`` + correo de cuenta real + que ese correo sea operador.

    Devuelve el email del operador -- lo usan los endpoints de abajo como
    ``cambiado_por``.
    """
    email = getattr(request.state, "actor_email", None)
    if not email or not es_operador(email):
        raise HTTPException(status_code=403, detail="Solo para operadores de la plataforma.")
    return email


class PatchEstadoIn(BaseModel):
    estado: str
    motivo: str


class PatchSupresionIn(BaseModel):
    estado: str
    nota: str


def _solicitud_dict(fila) -> dict:
    return {
        "id": fila.id,
        "cliente_slug": fila.cliente_slug,
        "usuario_id": fila.usuario_id,
        "email": fila.email,
        "motivo": fila.motivo,
        "estado": fila.estado,
        "creado_en": fila.creado_en,
        "atendido_en": fila.atendido_en,
        "atendido_por": fila.atendido_por,
        "nota": fila.nota,
    }


# ─── Solicitudes de supresión (Fase 3, derechos del titular) ───────────────
#
# Rutas NUEVAS, declaradas ANTES de `/clientes` y `/clientes/{slug}` (contrato
# de la fase) -- aunque en los hechos no chocan (prefijo distinto, "/supresiones"
# vs "/clientes"), se respeta el orden pedido. El owner las CREA desde
# `routers/derechos.py` (`POST /api/clientes/solicitar-supresion`); acá sólo se
# leen y se les cambia el estado -- nada se borra nunca, la ejecución real es
# manual y fuera del sistema.
#
# La constancia de la acción del operador va en la MISMA fila
# (`atendido_en`/`atendido_por`/`nota`) -- el mismo patrón, en el mismo lugar,
# que `EstadoCliente` (`cambiado_en`/`cambiado_por`/`motivo`) más abajo: este
# router opera sobre el REGISTRO y nunca abre la base de negocio de un
# cliente, así que no hay `AuditEntry` (esa tabla vive adentro de cada
# cliente) al que escribirle -- la fila misma ES la bitácora.

@router.get("/supresiones")
def listar_supresiones(email: str = Depends(require_operador)):
    """Todas las solicitudes de supresión, más nuevas primero."""
    from app.models.supresion import SolicitudSupresion

    reg = sesion_registro()
    try:
        filas = reg.query(SolicitudSupresion).order_by(SolicitudSupresion.creado_en.desc()).all()
        return {"solicitudes": [_solicitud_dict(f) for f in filas]}
    finally:
        reg.close()


@router.patch("/supresiones/{solicitud_id}")
def atender_supresion(solicitud_id: int, payload: PatchSupresionIn, email: str = Depends(require_operador)):
    """El operador marca una solicitud atendida o rechazada. Nota OBLIGATORIA
    -- espejo del motivo obligatorio del PATCH de estados de más abajo.

    Nunca borra nada: sólo dice qué se hizo con el pedido. La supresión real
    del cliente, si corresponde, la ejecuta el operador A MANO, fuera de este
    sistema.
    """
    from app.models.supresion import ESTADOS_SUPRESION, SolicitudSupresion

    estado = (payload.estado or "").strip().lower()
    if estado not in ("atendida", "rechazada"):
        raise HTTPException(
            status_code=422,
            detail='Estado inválido: debe ser "atendida" o "rechazada".',
        )
    assert estado in ESTADOS_SUPRESION  # documenta que comparte el catálogo con el modelo

    nota = (payload.nota or "").strip()
    if not nota:
        raise HTTPException(status_code=422, detail="La nota es obligatoria.")

    reg = sesion_registro()
    try:
        fila = reg.query(SolicitudSupresion).filter(SolicitudSupresion.id == solicitud_id).first()
        if fila is None:
            raise HTTPException(status_code=404, detail="No hay una solicitud con ese id.")

        fila.estado = estado
        fila.nota = nota
        fila.atendido_en = datetime.now(timezone.utc)
        fila.atendido_por = email
        reg.commit()

        return _solicitud_dict(fila)
    finally:
        reg.close()


@router.get("/soy")
def soy_operador(request: Request, rol: str = Depends(require_auth)):
    """¿La cuenta de este token es operadora de la plataforma?

    El legado (sin ``sub``) nunca deja ``actor_email`` en el request, así que
    ``es_operador(None)`` da ``False`` siempre -- ni un chequeo aparte.
    """
    email = getattr(request.state, "actor_email", None)
    return {"operador": es_operador(email)}


@router.get("/clientes")
def listar_clientes_plataforma(email: str = Depends(require_operador)):
    """Todos los clientes del registro (activos e inactivos) con su estado.

    Sin fila en ``estados_cliente`` -> ``estado: "activo"`` y el resto en
    ``null``. Con fila -- también cuando el operador dejó "activo" a mano,
    que se guarda como constancia del último cambio -- se muestran los
    valores reales de la fila.
    """
    from app.models.models import ClienteRow
    from app.models.plataforma import EstadoCliente

    reg = sesion_registro()
    try:
        filas = reg.query(ClienteRow).order_by(ClienteRow.slug).all()
        estados = {e.slug: e for e in reg.query(EstadoCliente).all()}
        clientes = []
        for f in filas:
            e = estados.get(f.slug)
            if e is None:
                clientes.append({
                    "slug": f.slug, "nombre": f.nombre, "activo": f.activo,
                    "estado": "activo", "motivo": None, "cambiado_en": None, "cambiado_por": None,
                })
            else:
                clientes.append({
                    "slug": f.slug, "nombre": f.nombre, "activo": f.activo,
                    "estado": e.estado, "motivo": e.motivo,
                    "cambiado_en": e.cambiado_en, "cambiado_por": e.cambiado_por,
                })
        return {"clientes": clientes}
    finally:
        reg.close()


@router.patch("/clientes/{slug}")
def cambiar_estado_cliente(slug: str, payload: PatchEstadoIn, email: str = Depends(require_operador)):
    """El interruptor: sube (o crea) la fila de ``estados_cliente``.

    También para ``estado == "activo"``: la fila queda como constancia de
    quién hizo el último cambio -- el interruptor de ``clientes.py`` la trata
    igual que una fila ausente, pero acá se ve.
    """
    from app.models.models import ClienteRow
    from app.models.plataforma import EstadoCliente

    estado = (payload.estado or "").strip().lower()
    if estado not in ESTADOS_CUENTA:
        raise HTTPException(
            status_code=422,
            detail=f"Estado inválido: debe ser uno de {', '.join(ESTADOS_CUENTA)}",
        )
    motivo = (payload.motivo or "").strip()
    if not motivo:
        raise HTTPException(status_code=422, detail="El motivo es obligatorio.")

    slug = (slug or "").strip().lower()
    reg = sesion_registro()
    try:
        cliente = reg.query(ClienteRow).filter(ClienteRow.slug == slug).first()
        if cliente is None:
            raise HTTPException(status_code=404, detail="No hay un cliente con ese código.")

        fila = reg.query(EstadoCliente).filter(EstadoCliente.slug == slug).first()
        ahora = datetime.now(timezone.utc)
        if fila is None:
            fila = EstadoCliente(
                slug=slug, estado=estado, motivo=motivo, cambiado_en=ahora, cambiado_por=email,
            )
            reg.add(fila)
        else:
            fila.estado = estado
            fila.motivo = motivo
            fila.cambiado_en = ahora
            fila.cambiado_por = email
        reg.commit()

        resultado = {
            "slug": fila.slug, "estado": fila.estado, "motivo": fila.motivo,
            "cambiado_en": fila.cambiado_en, "cambiado_por": fila.cambiado_por,
        }
    finally:
        reg.close()

    # Tras el commit, no antes: si el commit fallara, el cache de un estado
    # viejo no tendría por qué invalidarse.
    invalidar_cache_estado(slug)
    return resultado
