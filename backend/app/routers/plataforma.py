"""Panel de plataforma: quién es operador, el interruptor de estado y las métricas.

Datos del registro, con UNA excepción acotada y declarada: ``GET /metricas``
(Fase 4). Todos los demás endpoints de este router JAMÁS abren la base de un
cliente -- un operador toca el registro, no los datos de negocio de ningún
supermercado; el estado de cuenta vive enteramente en la base por defecto
(``estados_cliente``, ver ``app/plataforma_estado.py``).

**La excepción, textual** (enmienda de la regla dura de la Fase 2, spec de la
Fase 4): el operador accede a datos de negocio SOLO por el endpoint de métricas
agregadas -- sólo lectura, sólo agregados (nunca filas individuales), y cada
consulta queda anotada en ``bitacora_plataforma`` con su correo. La lógica vive
entera en ``app/plataforma_metricas.py``, que no escribe una sola fila en
ninguna base de cliente; acá abajo sólo se valida el período, se anota la
consulta y se devuelve.

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
# Los defaults de `/tendencia` (Fase 5). Se importan del módulo que los define
# para que el contrato del endpoint y el de la serie no se puedan separar.
from app.plataforma_tendencia import CONSOLIDADO_SLUG, MESES_DEFAULT

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


# ─── Métricas del negocio (Fase 4) ────────────────────────────────────────────
#
# Ruta LITERAL, declarada ANTES que `/clientes/{slug}` y
# `/supresiones/{solicitud_id}` -- la regla dura de orden de rutas de FastAPI.
# Hoy no chocaría (primer segmento distinto), pero el orden se respeta igual:
# el día que alguien agregue `/{algo}` en este router, esta ruta ya está a
# salvo y no hay que acordarse de nada.

@router.get("/metricas")
def metricas_del_negocio(
    periodo: str | None = None,
    email: str = Depends(require_operador),
):
    """Los agregados taxativos de la spec: consolidado + una fila por cliente.

    ``?periodo=YYYY-MM``; sin parámetro, el mes calendario en curso (UTC).
    Un período malformado es 422 -- no se cae a "el mes actual" en silencio,
    porque el operador que teclea mal una fecha tiene que enterarse.

    **La bitácora se escribe SIEMPRE**, también cuando la respuesta salió del
    caché de 5 minutos: lo que se registra es que este operador VIO estos
    números, y eso pasó igual aunque el cálculo fuera de hace cuatro minutos.
    Va DESPUÉS de calcular: si el cálculo se cayera, no habría acceso que
    anotar.
    """
    from app.models.plataforma import BitacoraPlataforma
    from app.plataforma_metricas import PeriodoInvalido, metricas_del_periodo, normalizar_periodo

    try:
        anio_mes = normalizar_periodo(periodo)
    except PeriodoInvalido as e:
        raise HTTPException(status_code=422, detail=str(e)) from e

    cuerpo = metricas_del_periodo(anio_mes)

    reg = sesion_registro()
    try:
        reg.add(BitacoraPlataforma(
            email=email,
            accion="metricas",
            periodo=anio_mes,
            en=datetime.now(timezone.utc),
        ))
        reg.commit()
    finally:
        reg.close()

    return cuerpo


# ─── Tendencia temporal (Fase 5) ──────────────────────────────────────────────
#
# Ruta LITERAL, declarada junto a `/metricas` y ANTES de las paramétricas
# `/clientes/{slug}` y `/supresiones/{solicitud_id}` — la regla dura de orden de
# rutas de FastAPI. Es la MISMA frontera del operador que `/metricas`: sólo
# lectura, sólo agregados, con bitácora; nunca filas de negocio ni datos de
# usuarios finales. No abre ninguna base de cliente — lee sólo el snapshot del
# registro (`snapshot_metricas`), donde la supresión K=3 y el saneo se aplican al
# leer, reusando la lógica de `plataforma_metricas`.

@router.get("/tendencia")
def tendencia_del_negocio(
    cliente: str = CONSOLIDADO_SLUG,
    meses: int = MESES_DEFAULT,
    email: str = Depends(require_operador),
):
    """La serie de tiempo de los agregados públicos, por cliente o consolidada.

    ``?cliente=<slug|__consolidado__>`` (default el consolidado) y ``?meses=N``
    (default 12, acotado a 1..24). Un ``meses`` fuera de rango es 422 y un
    ``cliente`` que no existe es 404: ni uno ni otro se caen al default en
    silencio — el operador que teclea mal tiene que enterarse, igual que con el
    período de ``/metricas``.

    **La bitácora se escribe SIEMPRE**, con acción ``"tendencia"``. El QUÉ de la
    línea es el alcance completo —``"<cliente>:<desde>..<hasta>"``— porque acá lo
    consultado no es un mes sino un rango: sin los extremos, saber que alguien
    miró la tendencia no dice qué tendencia miró. Va DESPUÉS de leer: si la
    lectura fallara, no habría acceso que anotar.
    """
    from app.models.plataforma import BitacoraPlataforma
    from app.plataforma_tendencia import ClienteDesconocido, MesesInvalidos, serie

    try:
        cuerpo = serie(cliente, meses)
    except MesesInvalidos as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    except ClienteDesconocido as e:
        raise HTTPException(status_code=404, detail="No hay un cliente con ese código.") from e

    reg = sesion_registro()
    try:
        reg.add(BitacoraPlataforma(
            email=email,
            accion="tendencia",
            periodo=f"{cuerpo['cliente']}:{cuerpo['desde']}..{cuerpo['hasta']}",
            en=datetime.now(timezone.utc),
        ))
        reg.commit()
    finally:
        reg.close()

    return cuerpo


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
    # Y el cache de MÉTRICAS también (hallazgo M-1): el estado_cuenta viaja
    # adentro del JSON de métricas, y sin esto el propio operador veía el
    # estado viejo en el panel hasta 5 minutos después de su propio PATCH.
    from app.plataforma_metricas import limpiar_cache_metricas
    limpiar_cache_metricas()
    return resultado
