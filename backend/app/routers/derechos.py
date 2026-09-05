"""Derechos del titular (Fase 3, Ley 1581/2012): export owner-only + solicitud
de supresión.

**Owner-only, definición ÚNICA usada acá** (contrato de la fase, [A]): JWT con
``sub`` + membresía ACTIVA con ``rol == "owner"`` sobre el cliente **del
pedido** (``cliente_del_pedido``), leída SIEMPRE con ``sesion_registro()`` --
nunca de la base de negocio. El rol ``admin`` del token NO alcanza: el owner
viaja como ``admin`` en el JWT desde la Fase 1 (spec, decisión 5), así que el
rol del TOKEN no distingue owner -- sólo la membresía lo dice. Consecuencia
directa: legado sin ``sub`` -> 403 (no hay con qué buscar membresía); una
cuenta real con membresía ``admin`` (no owner) -> 403; ``worker`` -> 403.

**Nada se borra nunca.** El export lee y la solicitud de supresión sólo
registra un pedido -- la ejecución real es MANUAL y fuera del sistema. Ningún
endpoint de este archivo escribe ni borra un solo dato de negocio.

**La frontera dura del export** (contrato [D]): sale sólo lo que se consulta
acá abajo -- ``Space``, ``SpaceLease``, ``Supplier`` y ``LayoutSnapshot`` de la
base DEL CLIENTE. Nunca se toca ``AuditEntry`` (bitácora, tiene IPs de
terceros), nunca ``AppConfig`` (guarda los hashes de las claves legadas), nunca
ninguna tabla de intentos ni ``estados_cliente``. No es una lista negra que
haya que mantener: es que el código de abajo simplemente no las consulta.

Router NUEVO, prefix ``/clientes`` -- mismo prefix que ``routers/alta.py``,
ambos con rutas literales (``/mi-export``, ``/solicitar-supresion``,
``/alta``), así que el orden entre los dos no cambia ningún resultado; se
declara antes en ``main.py`` porque así lo pide el contrato de esta fase.
"""
import json
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel

from app.auth import require_auth, sub_y_email_de_la_sesion
from app.clientes import Cliente, cliente_del_pedido, sesion_de, sesion_registro
# Import a nivel de módulo: registra `solicitudes_supresion` y
# `export_attempts` en `Base.metadata` ANTES de que corra `create_all()` --
# mismo patrón que `plataforma_estado.py` con `models/plataforma.py`.
from app.models.consentimiento import VERSION_POLITICA
from app.models.supresion import IntentoExport, SolicitudSupresion
# El default de `?meses=` del reporte de transparencia (Fase 7, Parte B): se
# importa de `plataforma_tendencia`, que es quien lo define, para que el
# horizonte por defecto de `/tendencia` y el de este endpoint no se puedan
# separar. `MESES_MAXIMO` se usa para validar `meses` ANTES de cobrar el
# freno de `/mi-reporte-plataforma` (ver el endpoint más abajo).
from app.plataforma_tendencia import MESES_DEFAULT, MESES_MAXIMO

router = APIRouter(prefix="/clientes", tags=["derechos"])

MENSAJE_NO_OWNER = "Solo el owner del cliente puede hacer esto."

# 3 exports por hora por usuario -- tabla propia (`export_attempts`), no
# contamina ningún otro freno del repo.
EXPORT_MAX_POR_HORA = 3
EXPORT_VENTANA_SEGUNDOS = 3600


# ─── Owner-only ────────────────────────────────────────────────────────────

def require_owner(
    request: Request,
    rol: str = Depends(require_auth),
    sub_email: tuple = Depends(sub_y_email_de_la_sesion),
    cliente: Cliente = Depends(cliente_del_pedido),
) -> tuple[Cliente, int, str]:
    """El cliente del pedido + quién es, sólo si es SU owner.

    Devuelve ``(cliente, usuario_id, email)`` -- lo que usan los dos endpoints
    de abajo. No mira ``rol`` (el del JWT) para nada: ese vale "admin" tanto
    para un owner como para un admin común (Fase 1, decisión 5), así que la
    única fuente de verdad es la membresía.
    """
    sub, email = sub_email
    if sub is None:
        # Legado (sin `sub`): no hay identidad de usuario contra la que buscar
        # una membresía. Nunca puede ser owner, por construcción.
        raise HTTPException(status_code=403, detail=MENSAJE_NO_OWNER)

    from app.models.identidad import Membresia

    reg = sesion_registro()
    try:
        membresia = (
            reg.query(Membresia)
            .filter(
                Membresia.usuario_id == sub,
                Membresia.cliente_slug == cliente.slug,
                Membresia.activo == True,  # noqa: E712
            )
            .first()
        )
    finally:
        reg.close()

    if membresia is None or membresia.rol != "owner":
        raise HTTPException(status_code=403, detail=MENSAJE_NO_OWNER)

    return cliente, sub, (email or "")


# ─── GET /clientes/mi-export ────────────────────────────────────────────────

def _chequear_y_anotar_freno_export(usuario_id: int) -> None:
    """429 si esta cuenta ya bajó su export 3 veces en la última hora."""
    reg = sesion_registro()
    try:
        corte = datetime.now(timezone.utc) - timedelta(seconds=EXPORT_VENTANA_SEGUNDOS)
        # Barrer lo viejo acá evita una tarea aparte -- la tabla es diminuta,
        # mismo espíritu que `frenar_si_hay_muchos_fallos` en `routers/auth.py`.
        reg.query(IntentoExport).filter(IntentoExport.at < corte).delete(synchronize_session=False)
        reg.commit()

        cantidad = (
            reg.query(IntentoExport)
            .filter(IntentoExport.usuario_id == usuario_id, IntentoExport.at >= corte)
            .count()
        )
        if cantidad >= EXPORT_MAX_POR_HORA:
            raise HTTPException(
                status_code=429,
                detail="Ya descargaste tu export el máximo de veces permitido esta hora. Probá en un rato.",
            )

        reg.add(IntentoExport(usuario_id=usuario_id, at=datetime.now(timezone.utc)))
        reg.commit()
    finally:
        reg.close()


def _valor_status(status) -> str:
    return status.value if hasattr(status, "value") else str(status)


def _space_dict(s) -> dict:
    return {
        "id": s.id,
        "code": s.code,
        "svg_id": s.svg_id,
        "name": s.name,
        "zone": s.zone,
        "sede": s.sede,
        "area_m2": s.area_m2,
        "status": _valor_status(s.status),
        "notes": s.notes,
    }


def _lease_dict(lease) -> dict:
    # El owner es admin: acá NO se redacta plata (contrato [D]) -- a
    # diferencia de las respuestas normales de `spaces.py`, que sí lo hacen
    # para `worker`.
    return {
        "id": lease.id,
        "space_id": lease.space_id,
        "supplier_id": lease.supplier_id,
        "marca": lease.marca,
        "start_date": lease.start_date.isoformat() if lease.start_date else None,
        "end_date": lease.end_date.isoformat() if lease.end_date else None,
        "monthly_rent": lease.monthly_rent,
        "is_active": lease.is_active,
        "notes": lease.notes,
    }


def _supplier_dict(sup) -> dict:
    return {
        "id": sup.id,
        "name": sup.name,
        "contact_name": sup.contact_name,
        "phone": sup.phone,
        "email": sup.email,
        "notes": sup.notes,
    }


@router.get("/mi-export")
def mi_export(dueno: tuple = Depends(require_owner)):
    """El JSON completo de los datos de negocio del cliente del owner.

    Freno: 3 por hora por ``usuario_id``. Frontera dura, ver el docstring del
    módulo -- lo único que se consulta es lo de abajo, nada más.
    """
    from app.models.models import LayoutSnapshot, Space, SpaceLease, Supplier

    cliente, usuario_id, _email = dueno
    _chequear_y_anotar_freno_export(usuario_id)

    db = sesion_de(cliente)
    try:
        spaces = [_space_dict(s) for s in db.query(Space).order_by(Space.id).all()]
        leases = [_lease_dict(l) for l in db.query(SpaceLease).order_by(SpaceLease.id).all()]
        suppliers = [_supplier_dict(s) for s in db.query(Supplier).order_by(Supplier.id).all()]

        layouts: dict = {}
        for snap in db.query(LayoutSnapshot).order_by(LayoutSnapshot.sede).all():
            try:
                layouts[snap.sede] = json.loads(snap.fixtures_json or "[]")
            except (TypeError, ValueError):
                # Un JSON corrupto no puede tirar abajo todo el export -- se
                # entrega la crudeza en vez de nada, y no se inventa un dato.
                layouts[snap.sede] = snap.fixtures_json
    finally:
        db.close()

    payload = {
        "cliente": {"slug": cliente.slug, "nombre": cliente.nombre},
        "generado_en": datetime.now(timezone.utc).isoformat(),
        "version_politica": VERSION_POLITICA,
        "spaces": spaces,
        "leases": leases,
        "suppliers": suppliers,
        "layouts": layouts,
    }

    nombre_archivo = f"recabra-export-{cliente.slug}-{date.today().isoformat()}.json"
    return Response(
        content=json.dumps(payload, ensure_ascii=False),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{nombre_archivo}"'},
    )


# ─── POST /clientes/solicitar-supresion ─────────────────────────────────────

class SolicitarSupresionIn(BaseModel):
    motivo: Optional[str] = None


def _solicitud_dict(fila: SolicitudSupresion) -> dict:
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


@router.post("/solicitar-supresion", status_code=201)
def solicitar_supresion(payload: SolicitarSupresionIn, dueno: tuple = Depends(require_owner)):
    """El owner PIDE la supresión de su cliente -- no se borra nada acá.

    Una PENDIENTE por cliente a la vez: reintentar con otro motivo mientras la
    primera sigue sin atender no abre una segunda cola -- 409.
    """
    cliente, usuario_id, email = dueno

    reg = sesion_registro()
    try:
        ya_pendiente = (
            reg.query(SolicitudSupresion)
            .filter(
                SolicitudSupresion.cliente_slug == cliente.slug,
                SolicitudSupresion.estado == "pendiente",
            )
            .first()
        )
        if ya_pendiente is not None:
            raise HTTPException(
                status_code=409,
                detail="Ya hay una solicitud de supresión pendiente para este cliente.",
            )

        motivo = (payload.motivo or "").strip() or None
        fila = SolicitudSupresion(
            cliente_slug=cliente.slug,
            usuario_id=usuario_id,
            email=email,
            motivo=motivo,
            estado="pendiente",
            creado_en=datetime.now(timezone.utc),
        )
        reg.add(fila)
        reg.commit()
        return _solicitud_dict(fila)
    finally:
        reg.close()


# ─── GET /clientes/mi-reporte-plataforma ────────────────────────────────────
#
# Ruta LITERAL más, en el mismo prefix que ``/mi-export`` y
# ``/solicitar-supresion`` -- mismo comentario de siempre sobre el orden entre
# routers (no choca con nada de ``routers/alta.py``).

@router.get("/mi-reporte-plataforma")
def mi_reporte_plataforma(meses: int = MESES_DEFAULT, dueno: tuple = Depends(require_owner)):
    """El reporte de transparencia (Fase 7, Parte B) del cliente del owner.

    ``?meses=N`` (default 12, 1..24) -- 422 si se sale de rango. El slug
    NUNCA sale de un parámetro: sale de ``cliente_del_pedido`` a través de
    ``require_owner``, así que un owner sólo puede pedir el reporte de SU
    propio cliente, nunca el de otro (contrato [A] de este módulo).

    **La validación de ``meses`` va ANTES del freno.** Se chequea
    ``1 <= meses <= MESES_MAXIMO`` y se responde 422 ANTES de tocar
    ``_chequear_y_anotar_freno_export``: un pedido inválido (que de todos
    modos iba a terminar en 422 dentro de ``armar_reporte``) nunca puede
    consumir cupo del propio titular -- tres ``meses=0`` seguidos no pueden
    dejarlo sin poder ejercer su derecho de acceso durante una hora.

    **Comparte el freno de 3 por hora con ``/mi-export``**
    (``_chequear_y_anotar_freno_export``, arriba): sin migraciones no hay
    columna para llevar un contador aparte por endpoint, y los dos devuelven
    datos completos del cliente a demanda de su propio owner -- la MISMA
    superficie de abuso (un owner que se golpea a sí mismo descargando el
    reporte 1000 veces por hora). Se decidió compartir la tabla
    ``export_attempts`` en vez de abrir una cuarta tabla nueva sólo para
    diferenciar los dos contadores.

    **No anota bitácora.** ``bitacora_plataforma`` registra accesos DEL
    OPERADOR a datos de negocio de un cliente -- esto es al revés: el DUEÑO
    mirando sus propios datos. Anotarlo acá sería registrar que alguien miró
    lo suyo, que no es lo que la bitácora existe para constatar.
    """
    from app.plataforma_reporte import ClienteDesconocido, MesesInvalidos, armar_reporte

    cliente, usuario_id, _email = dueno

    if not (1 <= meses <= MESES_MAXIMO):
        raise HTTPException(status_code=422, detail=f"Los meses van de 1 a {MESES_MAXIMO}.")

    _chequear_y_anotar_freno_export(usuario_id)

    try:
        return armar_reporte(cliente.slug, meses)
    except MesesInvalidos as e:
        # Red de seguridad: `armar_reporte` valida `meses` de nuevo (y valida
        # otras formas inválidas, como un `meses` no convertible a int que
        # FastAPI ya habría rechazado con 422 antes de llegar acá). No se
        # borra el except sólo porque el chequeo de arriba ya cubre el caso
        # común.
        raise HTTPException(status_code=422, detail=str(e)) from e
    except ClienteDesconocido as e:
        # No debería poder pasar -- `cliente` ya vino resuelto por
        # `cliente_del_pedido`/`require_owner` -- pero si el registro
        # cambiara debajo de la sesión, el mismo texto fijo que en
        # `/plataforma/tendencia` y sin filtrar nada del driver.
        raise HTTPException(status_code=404, detail="No hay un cliente con ese código.") from e
