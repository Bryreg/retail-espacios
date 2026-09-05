"""Panel de plataforma: quién es operador, el interruptor de estado y las métricas.

Datos del registro, con UNA excepción acotada y declarada: ``GET /metricas``
(Fase 4). Todos los demás endpoints de este router JAMÁS abren la base de un
cliente -- un operador toca el registro, no los datos de negocio de ningún
supermercado; el estado de cuenta vive enteramente en la base por defecto
(``estados_cliente``, ver ``app/plataforma_estado.py``).

**La excepción, textual** (enmienda de la regla dura de la Fase 2, spec de la
Fase 4): el operador accede a datos de negocio SOLO por los endpoints de
métricas agregadas -- ``/metricas``, ``/tendencia`` y, desde la Fase 6,
``/adopcion`` -- sólo lectura, sólo agregados (nunca filas individuales), y
cada consulta queda anotada en ``bitacora_plataforma`` con su correo. La
lógica vive entera en ``app/plataforma_metricas.py`` y
``app/plataforma_adopcion.py``, que no escriben una sola fila en ninguna base
de cliente; acá abajo sólo se valida el período, se anota la consulta y se
devuelve.

**Y la bitácora ya no es sólo de los agregados** (hallazgo frontera-6): toda
consulta del operador deja línea por ``_anotar_consulta``, incluidas
``GET /supresiones`` (correo, id y motivo de titulares de habeas data) y
``GET /clientes`` (motivo del corte de cada cuenta), que son la PII más
sensible del panel y no dejaban ninguna. ``GET /soy`` no anota: no devuelve un
solo dato de nadie más que del propio solicitante.

Operador = email en env ``OPERADOR_EMAILS``, y sólo para cuentas con ``sub``:
el login legado nunca trae ``request.state.actor_email`` (lo deja
``require_auth`` sólo cuando el token trae ``email``), así que
``require_operador`` le da 403 siempre, por construcción -- no hace falta
ningún chequeo especial para el legado.
"""
import logging
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

log = logging.getLogger("recabra.plataforma.router")


def _anotar_consulta(email: str, accion: str, periodo: str) -> None:
    """Una línea en ``bitacora_plataforma``: quién consultó qué, y cuándo.

    Estaba repetido palabra por palabra en ``/metricas``, ``/tendencia`` y
    ``/adopcion``, y ESE es el motivo de que ``/supresiones`` y ``/clientes`` —los
    dos endpoints que devuelven PII de verdad: el correo, el id y el motivo del
    titular que ejerció habeas data, y el motivo del corte de cada cuenta— se
    hubieran quedado sin constancia de lectura (hallazgo frontera-6). Con un solo
    helper, anotar es una línea y olvidarse cuesta más que acordarse.

    **Sesión propia y commit propio**, igual que los tres bloques que reemplaza:
    la bitácora es del ACCESO, no de la transacción de negocio (que en este
    router no existe: se leyó y se cerró).

    **Nunca propaga.** La constancia no puede tumbar la consulta que constata —el
    operador ya vio los datos cuando esto corre—; el detalle va al log con traza.

    Y nunca lleva un dato de negocio adentro: ``accion`` es un código estable y
    ``periodo`` es un período o un rango, jamás un correo, un motivo ni un
    nombre.
    """
    from app.models.plataforma import BitacoraPlataforma

    try:
        reg = sesion_registro()
        try:
            reg.add(BitacoraPlataforma(
                email=email,
                accion=accion,
                periodo=periodo,
                en=datetime.now(timezone.utc),
            ))
            reg.commit()
        finally:
            reg.close()
    except Exception:  # noqa: BLE001
        log.exception("No se pudo anotar la consulta %s de %s en la bitácora", accion, email)


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
    from app.plataforma_metricas import PeriodoInvalido, metricas_del_periodo, normalizar_periodo

    try:
        anio_mes = normalizar_periodo(periodo)
    except PeriodoInvalido as e:
        raise HTTPException(status_code=422, detail=str(e)) from e

    cuerpo = metricas_del_periodo(anio_mes)
    _anotar_consulta(email, "metricas", anio_mes)
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
    from app.plataforma_tendencia import ClienteDesconocido, MesesInvalidos, serie

    try:
        cuerpo = serie(cliente, meses)
    except MesesInvalidos as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    except ClienteDesconocido as e:
        raise HTTPException(status_code=404, detail="No hay un cliente con ese código.") from e

    _anotar_consulta(
        email, "tendencia", f"{cuerpo['cliente']}:{cuerpo['desde']}..{cuerpo['hasta']}")
    return cuerpo


# ─── Adopción (Fase 6) ────────────────────────────────────────────────────────
#
# Ruta LITERAL, declarada INMEDIATAMENTE después de `/tendencia` y ANTES de
# `/supresiones/{solicitud_id}` y `/clientes/{slug}` -- la regla dura de orden
# de rutas de FastAPI. Misma frontera del operador: sólo lectura, sólo
# agregados del REGISTRO (más `contratos_activos_por_cliente`, que reusa el
# recorrido de bases de `/metricas` en vez de abrirlas de nuevo), con
# bitácora. No abre ninguna base de cliente.

@router.get("/adopcion")
def adopcion_del_negocio(email: str = Depends(require_operador)):
    """Cohortes de adopción: quién entra, quién no, y a quién llamar hoy.

    Sin parámetros -- siempre el mes calendario en curso (UTC), como el resto
    del panel. **La bitácora se escribe SIEMPRE**, con acción ``"adopcion"`` y
    el período en curso, después de calcular -- si el cálculo se cayera, no
    habría acceso que anotar.
    """
    from app.plataforma_adopcion import calcular_adopcion

    cuerpo = calcular_adopcion()
    _anotar_consulta(email, "adopcion", cuerpo["periodo"])
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
    """Todas las solicitudes de supresión, más nuevas primero.

    **Deja línea en la bitácora** (``accion="supresiones"``, hallazgo
    frontera-6). Es el endpoint con la PII más sensible del panel —el correo, el
    id de usuario y el motivo de cada titular que ejerció habeas data—, y hasta
    ahora sólo quedaban rastro los PATCH (``atendido_por`` en la fila): quién
    LEYÓ la lista no se sabía. La línea va después de armar la respuesta y no
    lleva ni un dato de las solicitudes adentro; el ``periodo`` es el mes en
    curso, porque acá no hay un período consultado y la columna es obligatoria.
    """
    from app.models.supresion import SolicitudSupresion
    from app.plataforma_metricas import periodo_actual

    reg = sesion_registro()
    try:
        filas = reg.query(SolicitudSupresion).order_by(SolicitudSupresion.creado_en.desc()).all()
        cuerpo = {"solicitudes": [_solicitud_dict(f) for f in filas]}
    finally:
        reg.close()

    _anotar_consulta(email, "supresiones", periodo_actual())
    return cuerpo


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

    **Deja línea en la bitácora** (``accion="clientes"``, hallazgo frontera-6):
    devuelve el MOTIVO del corte de cada cuenta, que es texto libre del operador
    y el dato más sensible del registro después de las supresiones. Igual que
    allá: la línea va después de armar la respuesta, sin nada del contenido
    adentro, con el mes en curso como ``periodo``.
    """
    from app.models.models import ClienteRow
    from app.models.plataforma import EstadoCliente
    from app.plataforma_metricas import periodo_actual

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
    finally:
        reg.close()

    _anotar_consulta(email, "clientes", periodo_actual())
    return {"clientes": clientes}


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


# ─── Reporte de transparencia, para el operador (Fase 7, Parte B) ──────────
#
# Ruta declarada AL FINAL DEL ARCHIVO A PROPÓSITO -- después de `/metricas`,
# `/tendencia`, `/adopcion`, `/supresiones`, `/supresiones/{solicitud_id}`,
# `/soy`, `/clientes` y `/clientes/{slug}` PATCH: es decir, después de TODAS
# las literales de este router. `/clientes/{slug}/reporte` no puede chocar
# con `/clientes/{slug}` (distinto número de segmentos) ni con ninguna otra
# ruta de acá, pero se respeta el orden igual -- la regla dura de FastAPI del
# repo es "literal antes de paramétrica", y el día que alguien agregue una
# ruta nueva bajo `/clientes/` en el medio de este archivo, ésta ya queda
# a salvo por estar al final.
#
# Mismo JSON que `GET /api/clientes/mi-reporte-plataforma` -- las dos rutas
# llaman a la MISMA función (`app.plataforma_reporte.armar_reporte`). La
# diferencia es la bitácora: acá SÍ se anota (es un acceso del operador a
# datos de un cliente), allá no (es el dueño mirando lo suyo).

@router.get("/clientes/{slug}/reporte")
def reporte_de_transparencia_del_cliente(
    slug: str,
    meses: int = MESES_DEFAULT,
    email: str = Depends(require_operador),
):
    """El reporte de transparencia de UN cliente, para el operador.

    ``slug`` normalizado (``.strip().lower()``, igual que el PATCH de
    estados). 404 con texto FIJO si no existe -- igual que ``/tendencia`` y
    el PATCH de arriba. ``meses`` fuera de 1..24 -> 422.

    **La bitácora se escribe SIEMPRE, DESPUÉS de armar** (si armar fallara,
    no habría acceso que anotar) -- ``accion="reporte"``, con
    ``periodo="<slug>:<desde>..<hasta>"``: el reporte también es un acceso
    del operador a datos de negocio de este cliente, y el rango completo
    (no un solo mes) es el QUÉ de la línea, igual que en ``/tendencia``.
    """
    from app.plataforma_reporte import ClienteDesconocido, MesesInvalidos, armar_reporte

    slug = (slug or "").strip().lower()
    try:
        cuerpo = armar_reporte(slug, meses)
    except MesesInvalidos as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    except ClienteDesconocido as e:
        raise HTTPException(status_code=404, detail="No hay un cliente con ese código.") from e

    ventana = cuerpo["ventana"]
    _anotar_consulta(email, "reporte", f"{slug}:{ventana['desde']}..{ventana['hasta']}")
    return cuerpo
