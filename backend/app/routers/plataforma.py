"""Panel de plataforma: quién es operador, el interruptor de estado y las métricas.

Y desde C1 (2026-10-13), los COBROS: la suscripción de cada cliente, sus
cuentas de cobro y los pagos que registra la operadora a mano (``/cobros``,
``/clientes/{slug}/suscripcion``, ``/clientes/{slug}/facturas``,
``/facturas/{id}/…``). Son del registro, como el estado de cuenta: lo que la
plataforma le cobra a un cliente no vive en la base de ese cliente.

Datos del registro, con TRES excepciones acotadas y declaradas: ``GET /metricas``
(Fase 4), ``GET /clientes/{slug}/reporte`` (Fase 7, sólo el spread del mes en
curso) y ``GET /clientes/{slug}/detalle`` (Fase 8). Los demás endpoints de
este router JAMÁS abren la base de un cliente -- un operador toca el registro,
no los datos de negocio de ningún supermercado; el estado de cuenta vive
enteramente en la base por defecto (``estados_cliente``, ver
``app/plataforma_estado.py``).

**La excepción, textual** (enmienda de la regla dura de la Fase 2, spec de la
Fase 4): el operador accede a datos de negocio SOLO por los endpoints de
métricas agregadas -- ``/metricas``, ``/tendencia`` y, desde la Fase 6,
``/adopcion`` -- sólo lectura, sólo agregados (nunca filas individuales), y
cada consulta queda anotada en ``bitacora_plataforma`` con su correo. La
lógica vive entera en ``app/plataforma_metricas.py`` y
``app/plataforma_adopcion.py``, que no escriben una sola fila en ninguna base
de cliente; acá abajo sólo se valida el período, se anota la consulta y se
devuelve.

**Y desde la Fase 8 la enmienda va más lejos: agregados exactos Y DETALLE DE
NEGOCIO.** ``GET /clientes/{slug}/detalle`` (decisión del dueño de la
plataforma, 2026-09-05, para el servicio de asesoría comercial) devuelve el
negocio de UN cliente espacio por espacio: qué proveedor ocupa cada uno, a qué
canon, desde y hasta cuándo, qué está libre, y las oportunidades y
recomendaciones que se derivan de eso. Sigue siendo SOLO LECTURA, con bitácora
(``accion="detalle"``) y con la misma frontera de siempre: nada de datos de
contacto del proveedor ni de notas, ninguna foto, ningún correo/nombre/id de
un usuario del supermercado, y la tarifa de referencia sólo como
``tarifa_configurada`` sí/no. La lógica vive entera en
``app/plataforma_detalle.py``, que tampoco escribe una sola fila.

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
from datetime import date, datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from pydantic import BaseModel

from app.auth import require_auth
from app.clientes import sesion_registro
from app.plataforma_estado import es_operador
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


# ─── Cobros: la cartera de la suscripción (C1) ─────────────────────────────
#
# Ruta LITERAL, declarada junto a las otras literales y ANTES de toda
# paramétrica -- la regla dura de orden de rutas. Lee SÓLO el registro
# (`suscripciones`, `facturas_cobro`, `pagos_cobro`, `estados_cliente`): lo
# que la plataforma le cobra a cada cliente es de la plataforma, no de la base
# de nadie. Las escrituras de la cartera (suscripción, factura, pago, anular,
# disputa) van más abajo, después del ciclo de vida; la lógica vive entera en
# `app/services/cobranza.py`.
#
# Plata y facturas son sólo para la operadora (este router) y, cuando llegue
# su pantalla, para la dueña del supermercado: su gente no ve un monto jamás.

@router.get("/cobros")
def cartera_de_cobros(email: str = Depends(require_operador)):
    """Una fila por cliente: modo, valor pactado, la próxima cuenta de cobro a
    pagar, días de atraso, el estado de cuenta actual y el que le
    correspondería, el último pago y sus facturas. Un cliente sin suscripción
    sale ``exento``: sin deuda, sin facturas, fuera de la cobranza.

    **Deja línea en la bitácora** (``accion="cobros"``): devuelve los datos de
    facturación de cada cliente, que incluyen un correo. Como ``/clientes``,
    barre a todos, así que alcanza el reporte de transparencia de todos.
    """
    from app.plataforma_metricas import periodo_actual
    from app.services.cobranza import cartera

    cuerpo = cartera()
    _anotar_consulta(email, "cobros", periodo_actual())
    return cuerpo


@router.post("/cobranza/correr")
def correr_cobranza(
    ensayo: bool = True,
    fecha: date | None = None,
    email: str = Depends(require_operador),
):
    """«Correr cobranza»: la escalera de C2 ahora mismo, y lo que hizo —o, en
    ensayo, lo que haría—: a quién movería de estado y qué correos mandaría
    (hito y cuántos destinatarios, sin los correos).

    **Ensayo por defecto** (``?ensayo=1``): calcula con el mismo código que lo
    real y no escribe ni manda nada. ``?fecha=2026-11-15`` ensaya ese día
    («¿qué pasa el 15 de noviembre?»). Aplicar (``?ensayo=0``) exige el
    interruptor ``COBRANZA_AUTOMATICA`` prendido —es el único que decide si la
    escalera corta, también desde acá— y la fecha de hoy (409 y 422).

    Lee sólo el registro. **Deja línea en la bitácora** (``accion="cobranza"``):
    barre a todos los clientes con suscripción automática, como ``/cobros``.
    """
    from app.plataforma_metricas import periodo_actual
    from app.services import cobranza_automatica

    if not ensayo and not cobranza_automatica.automatica_prendida():
        raise HTTPException(
            status_code=409,
            detail=(
                f"La cobranza automática está apagada ({cobranza_automatica.INTERRUPTOR}): "
                "desde acá sólo se puede ensayar."
            ),
        )
    if not ensayo and fecha is not None:
        raise HTTPException(status_code=422, detail="Con otra fecha sólo se puede ensayar.")
    try:
        plan = cobranza_automatica.correr(hoy=fecha, ensayo=ensayo)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    if not ensayo:
        log.warning("%s", plan.resumen())
    _anotar_consulta(email, cobranza_automatica.ACCION_BITACORA, periodo_actual())
    return plan.como_dict()


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


@router.get("/salud")
def salud_de_la_plataforma(email: str = Depends(require_operador)):
    """Cómo está la operación (auditoría P1-6, P2-6, P1-5, P1-4), para quien
    opera: el tamaño de la base contra su cuota, los clientes degradados (su
    base no arrancó: sus pedidos reciben 503), cómo terminó la última vuelta de
    mantenimiento y cuántos correos esperan reintento. Sólo lee; el tamaño es
    el de la última medición del mantenimiento si la hay."""
    import app.main as principal
    from app.clientes import degradados, esta_degradado, listar, sesion_de
    from app.services import cola_de_correos, tamano_de_base

    base = tamano_de_base.ultima
    if base is None:
        try:
            base = tamano_de_base.medir()
        except Exception:  # noqa: BLE001
            log.warning("No se pudo medir el tamaño de la base", exc_info=True)
            base = None
    correos = 0
    for cliente in listar():
        if esta_degradado(cliente.slug):
            continue
        db = sesion_de(cliente)
        try:
            correos += cola_de_correos.pendientes(db)
        except Exception:  # noqa: BLE001
            log.warning("No se pudo contar la cola de correos de %s", cliente.slug, exc_info=True)
        finally:
            db.close()
    return {
        "base": base,
        "clientes_degradados": sorted(degradados()),
        "ultimo_mantenimiento": principal.ultimo_mantenimiento,
        "correos_pendientes": correos,
    }


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
    from app.clientes import es_el_de_siempre
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
            # `base_principal`: el cliente vive en la base del registro, así
            # que la consola le ofrece archivar pero nunca borrar (2026-09-23).
            if e is None:
                clientes.append({
                    "slug": f.slug, "nombre": f.nombre, "activo": f.activo,
                    "base_principal": es_el_de_siempre(f),
                    "estado": "activo", "motivo": None, "cambiado_en": None, "cambiado_por": None,
                })
            else:
                clientes.append({
                    "slug": f.slug, "nombre": f.nombre, "activo": f.activo,
                    "base_principal": es_el_de_siempre(f),
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

    El cuerpo vive en ``services/cobranza.mover_estado`` (C1), el único camino
    que cambia ``estados_cliente``: valida igual, sube o crea la fila igual,
    invalida el caché del estado y el de las métricas después del commit
    (hallazgo M-1) y, además, deja la fila del cambio en
    ``cambios_estado_cuenta``. La respuesta es la de siempre. Lo que pone una
    persona acá, la cobranza automática no lo empeora jamás.
    """
    from app.services.cobranza import ErrorDeCobranza, mover_estado

    try:
        fila = mover_estado(slug, payload.estado, payload.motivo, email)
    except ErrorDeCobranza as e:
        raise HTTPException(status_code=e.status, detail=str(e)) from e
    return {clave: fila[clave] for clave in ("slug", "estado", "motivo", "cambiado_en", "cambiado_por")}


# ─── El ciclo de vida de un cliente: renombrar, archivar, borrar ───────────
#
# Pedido del dueño de la plataforma (2026-09-23): la consola mostraba cinco
# clientes y él usa uno. Tres los habían fundado cuentas que no encontraron su
# invitación (ver `routers/auth.py`, el bloque de `enmascarar_correo`); el que
# de verdad usa se llamaba «Pepito» porque así lo bautizó quien lo fundó; y el
# viejo GALERIAS —el de la instalación original— seguía ahí, suspendido.
#
# Tres operaciones, de menos a más grave, y cada una deja línea en la bitácora
# con el slug adelante (`"<slug>:<YYYY-MM>"`), igual que `detalle`: el cliente
# la ve en su reporte de transparencia (`plataforma_reporte._accesos_del_cliente`).
#
# · **Renombrar** cambia sólo el nombre VISIBLE. El slug no se toca: va adentro
#   de cada token emitido y arma el nombre de la base (`recabra_<slug>`).
#   Dos clientes activos no pueden llamarse igual (`clientes.nombre_ocupado`):
#   es la confusión que manda a alguien al supermercado equivocado.
# · **Archivar** es reversible: `clientes.activo = False`. Nadie entra (los
#   tokens de ese cliente dan 401 en el pedido siguiente, porque `buscar` ya no
#   lo ve), deja de aparecer en la pantalla de ingreso y en el análisis de la
#   consola, y el mantenimiento de fondo lo saltea. Los datos quedan intactos.
# · «Pasar a la base principal» (los datos de un cliente reemplazan a los del
#   principal) tuvo ruta acá del 2026-09-23 al 2026-10-02: sirvió UNA vez, para
#   la mudanza Pepito → Galerías, y después sólo podía pisar por error los datos
#   reales de Galerías. Queda `app/services/traspaso.py`, sin ruta.
# · **Borrar** no tiene vuelta atrás: la base del cliente se elimina y sus
#   filas del registro también. Sólo un cliente YA ARCHIVADO —el archivo es el
#   período de gracia contra el clic equivocado—, nunca el de la base por
#   defecto (que es también la del registro de todos) y sólo escribiendo su
#   código a mano.

class NombreIn(BaseModel):
    nombre: str


class MotivoIn(BaseModel):
    motivo: str


class BorrarIn(BaseModel):
    confirmacion: str


LARGO_MAXIMO_NOMBRE_CLIENTE = 60
CLIENTE_DESCONOCIDO = "No hay un cliente con ese código."


def _fila_cliente_o_404(reg, slug: str):
    from app.models.models import ClienteRow

    fila = reg.query(ClienteRow).filter(ClienteRow.slug == (slug or "").strip().lower()).first()
    if fila is None:
        raise HTTPException(status_code=404, detail=CLIENTE_DESCONOCIDO)
    return fila


def _motivo_o_422(payload: MotivoIn) -> str:
    motivo = (payload.motivo or "").strip()
    if not motivo:
        raise HTTPException(status_code=422, detail="El motivo es obligatorio.")
    return motivo


def _olvidar_caches_de_consola() -> None:
    """Lo que la consola ya calculó con la lista vieja de clientes."""
    from app.plataforma_detalle import limpiar_cache_detalle
    from app.plataforma_metricas import limpiar_cache_metricas

    limpiar_cache_metricas()
    limpiar_cache_detalle()


def _fila_de_consola(fila) -> dict:
    return {"slug": fila.slug, "nombre": fila.nombre, "activo": fila.activo}


@router.put("/clientes/{slug}/nombre")
def renombrar_cliente(slug: str, payload: NombreIn, email: str = Depends(require_operador)):
    from app.clientes import nombre_ocupado
    from app.plataforma_metricas import periodo_actual

    nombre = " ".join((payload.nombre or "").split())
    if not nombre:
        raise HTTPException(status_code=422, detail="El nombre no puede quedar vacío.")
    if len(nombre) > LARGO_MAXIMO_NOMBRE_CLIENTE:
        raise HTTPException(
            status_code=422,
            detail=f"El nombre puede tener hasta {LARGO_MAXIMO_NOMBRE_CLIENTE} caracteres.",
        )

    reg = sesion_registro()
    try:
        fila = _fila_cliente_o_404(reg, slug)
        if fila.activo:
            otro = nombre_ocupado(reg, nombre, excepto=fila.slug)
            if otro is not None:
                raise HTTPException(
                    status_code=409,
                    detail=(
                        f"Ya hay un cliente activo que se llama así ({otro.slug}). "
                        "Dos clientes con el mismo nombre se confunden en la pantalla de ingreso: "
                        "renombrá o archivá el otro primero."
                    ),
                )
        fila.nombre = nombre
        reg.commit()
        resultado = _fila_de_consola(fila)
    finally:
        reg.close()

    _olvidar_caches_de_consola()
    _anotar_consulta(email, "renombre", f"{resultado['slug']}:{periodo_actual()}")
    return resultado


@router.post("/clientes/{slug}/archivar")
def archivar_cliente(slug: str, payload: MotivoIn, email: str = Depends(require_operador)):
    from app.auth import invalidar_cache_membresia
    from app.models.identidad import Membresia
    from app.plataforma_metricas import periodo_actual

    _motivo_o_422(payload)
    reg = sesion_registro()
    try:
        fila = _fila_cliente_o_404(reg, slug)
        fila.activo = False
        reg.commit()
        resultado = _fila_de_consola(fila)
        miembros = [
            m.usuario_id
            for m in reg.query(Membresia).filter(Membresia.cliente_slug == fila.slug).all()
        ]
    finally:
        reg.close()

    for usuario_id in miembros:
        invalidar_cache_membresia(usuario_id, resultado["slug"])
    _olvidar_caches_de_consola()
    # El motivo NO va a la bitácora: la regla de `_anotar_consulta` es que ahí
    # no viaja texto libre. Se le pide igual a quien archiva, como con el
    # estado de cuenta: obliga a pensarlo un segundo antes del clic.
    _anotar_consulta(email, "archivo", f"{resultado['slug']}:{periodo_actual()}")
    return resultado


@router.post("/clientes/{slug}/reactivar")
def reactivar_cliente(slug: str, payload: MotivoIn, email: str = Depends(require_operador)):
    from app.clientes import _fila_a_cliente, nombre_ocupado, preparar_esquema
    from app.plataforma_metricas import periodo_actual

    _motivo_o_422(payload)
    reg = sesion_registro()
    try:
        fila = _fila_cliente_o_404(reg, slug)
        otro = nombre_ocupado(reg, fila.nombre, excepto=fila.slug)
        if otro is not None:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Ya hay un cliente activo que se llama «{otro.nombre}» ({otro.slug}). "
                    "Renombrá uno de los dos antes de reactivar este."
                ),
            )
        fila.activo = True
        reg.commit()
        resultado = _fila_de_consola(fila)
        cliente = _fila_a_cliente(fila)
    finally:
        reg.close()

    # Las tablas que se desplegaron mientras estaba archivado: el arranque sólo
    # prepara a los activos, y sin esto el catálogo (`supplier_asset_specs`)
    # daba 500 hasta el próximo reinicio. Si falla, la reactivación queda
    # hecha igual y el próximo arranque lo vuelve a intentar.
    try:
        preparar_esquema(cliente)
    except Exception:  # noqa: BLE001
        log.exception("No se pudo preparar la base de %s al reactivarlo", cliente.slug)

    _olvidar_caches_de_consola()
    _anotar_consulta(email, "reactivacion", f"{resultado['slug']}:{periodo_actual()}")
    return resultado


@router.post("/clientes/{slug}/borrar")
def borrar_cliente(slug: str, payload: BorrarIn, email: str = Depends(require_operador)):
    """Borra el cliente para siempre: su base y sus filas del registro.

    **Qué se va**: la base `recabra_<slug>`, la fila de `clientes`, las
    membresías y las invitaciones de ese slug, su estado de cuenta, sus
    fundaciones, sus fotos mensuales por cliente, su suscripción y su historial
    de estados sin suscripción. Las cuatro primeras NO son limpieza: un cliente
    nuevo que alguna vez tome el mismo slug heredaría miembros, invitaciones
    pendientes y hasta una suspensión ajena.

    **Qué queda**: las cuentas de las personas (pueden estar en otros
    supermercados), sus consentimientos, las solicitudes de supresión (son
    constancia legal), la bitácora de la plataforma, la fila CONSOLIDADA de
    las fotos mensuales — la historia de la plataforma no se reescribe — y sus
    cuentas de cobro y pagos (constancia contable), atados a una suscripción
    que ya no existe: el que funde el mismo slug arranca sin deuda.

    La base se borra ANTES que las filas: si el `DROP` falla no se tocó nada, y
    si lo que falla es el registro, el cliente sigue archivado y el borrado se
    puede repetir (`DROP DATABASE IF EXISTS`).
    """
    from app.auth import invalidar_cache_membresia
    from app.clientes import ErrorDeBaja, borrar_base, es_el_de_siempre
    from app.models.identidad import Invitacion, Membresia
    from app.models.plataforma import EstadoCliente, Fundacion, SnapshotMetricas
    from app.plataforma_estado import invalidar_cache_estado
    from app.plataforma_metricas import periodo_actual
    from app.services.cobranza import olvidar_cliente as olvidar_cliente_en_cobranza

    reg = sesion_registro()
    try:
        fila = _fila_cliente_o_404(reg, slug)
        slug_real, db_name = fila.slug, fila.db_name
        if es_el_de_siempre(fila):
            raise HTTPException(
                status_code=409,
                detail=(
                    "Este cliente vive en la base principal del sistema, la misma que guarda la lista "
                    "de todos los clientes y sus usuarios: se puede archivar, pero no borrar."
                ),
            )
        if fila.activo:
            raise HTTPException(
                status_code=409,
                detail="Primero archivalo: un cliente activo no se borra. El archivo se puede deshacer; el borrado no.",
            )
        if (payload.confirmacion or "").strip().lower() != slug_real:
            raise HTTPException(
                status_code=422,
                detail=f"Para borrarlo, escribí su código exacto: {slug_real}",
            )
    finally:
        reg.close()

    try:
        borrar_base(slug_real, db_name)
    except ErrorDeBaja as e:
        raise HTTPException(status_code=409, detail=str(e))

    reg = sesion_registro()
    try:
        fila = _fila_cliente_o_404(reg, slug_real)
        miembros = [
            m.usuario_id
            for m in reg.query(Membresia).filter(Membresia.cliente_slug == slug_real).all()
        ]
        for modelo, columna in (
            (Membresia, Membresia.cliente_slug),
            (Invitacion, Invitacion.cliente_slug),
            (Fundacion, Fundacion.cliente_slug),
            (SnapshotMetricas, SnapshotMetricas.cliente_slug),
            (EstadoCliente, EstadoCliente.slug),
        ):
            reg.query(modelo).filter(columna == slug_real).delete(synchronize_session=False)
        # Su suscripción y su historial de estados sin suscripción (C1). Las
        # facturas y los pagos se quedan como constancia contable, colgados de
        # una suscripción cuyo id no se vuelve a usar: nadie los hereda.
        olvidar_cliente_en_cobranza(reg, slug_real)
        reg.delete(fila)
        reg.commit()
    finally:
        reg.close()

    for usuario_id in miembros:
        invalidar_cache_membresia(usuario_id, slug_real)
    invalidar_cache_estado(slug_real)
    _olvidar_caches_de_consola()
    _anotar_consulta(email, "borrado", f"{slug_real}:{periodo_actual()}")
    return {"ok": True, "slug": slug_real}


# ─── Cobros: la suscripción, las cuentas de cobro y los pagos (C1) ─────────
#
# Lo que la dueña decidió (2026-10-13): por ahora NO hay pasarela ni factura
# electrónica emitida desde acá. La operadora registra la cuenta de cobro que ya
# emitió (número y, si es electrónica, CUFE) y el pago que vio entrar en el
# banco, con lo que el supermercado retuvo. Nada de esto corta el servicio por
# sí mismo: el estado de cuenta lo sigue moviendo ella con el PATCH, el sistema
# lo LEVANTA si ella lo pide al registrar un pago que deja al día, y la escalera
# de C2 (sólo con su interruptor prendido) vuelve a mirar al cliente después de
# cada escritura de acá —pago, anulación, disputa, suscripción—, para que lo que
# puso el sistema no quede colgado 12 horas.
#
# Rutas paramétricas, declaradas después de todas las literales (la cartera,
# `GET /cobros`, está arriba con las demás) y antes del reporte y el detalle,
# que van al final. Cada escritura deja su línea en la bitácora con el slug
# adelante (`"<slug>:<YYYY-MM>"`), como el ciclo de vida: el cliente la ve en
# su reporte de transparencia, sin montos. La lógica vive en
# `app/services/cobranza.py`; acá sólo se traduce el error al código HTTP.

class SuscripcionIn(BaseModel):
    modo: str = "manual"
    valor_cop: int
    unidad: str = "supermercado_mes"
    cantidad: int = 1
    periodicidad_meses: int = 1
    plazo_pago_dias: int = 30
    dia_solo_lectura: int = 30
    prorroga_hasta: date | None = None
    contrato_ref: str | None = None
    razon_social: str | None = None
    nit: str | None = None
    correo_facturacion: str | None = None
    municipio: str | None = None
    retefuente_pct: float = 0.0
    reteica_pct: float = 0.0
    reteiva_pct: float = 0.0


class FacturaIn(BaseModel):
    periodo: str
    numero: str
    cufe: str | None = None
    emitida_el: date | None = None
    vence_el: date | None = None
    # Sin subtotal, lo pactado por los meses del período.
    subtotal_cop: int | None = None
    iva_cop: int = 0


class PagoIn(BaseModel):
    medio: str = "transferencia"
    valor_recibido_cop: int
    retefuente_cop: int = 0
    reteica_cop: int = 0
    reteiva_cop: int = 0
    certificado_recibido: bool = False
    ref_externa: str
    recibido_el: date | None = None
    # La opción explícita: si con este pago queda al día, el estado de cuenta
    # baja a lo que corresponde (lo firma `sistema:cobranza`). Apagada, el
    # estado no se toca.
    levantar_estado: bool = False


class DisputaIn(BaseModel):
    motivo: str
    en_disputa: bool = True


def _cobranza(hacer):
    """Corre una operación de la cartera y traduce su error a HTTP: el texto es
    para la operadora y va tal cual."""
    from app.services.cobranza import ErrorDeCobranza

    try:
        return hacer()
    except ErrorDeCobranza as e:
        raise HTTPException(status_code=e.status, detail=str(e)) from e


@router.put("/clientes/{slug}/suscripcion")
def guardar_suscripcion(
    slug: str,
    payload: SuscripcionIn,
    tareas: BackgroundTasks,
    email: str = Depends(require_operador),
):
    """Crea o reemplaza la suscripción del cliente: precio pactado, plazo,
    escalera, datos de facturación y retenciones esperadas. Modo automático
    sólo con la referencia del contrato (422), sólo lectura a los 30 días o
    más (422), y ninguna suscripción para el cliente de la base principal, que
    es exento (409).

    Con la escalera prendida, la de ESE cliente corre apenas sale la respuesta:
    una prórroga recién cargada lo devuelve a gracia sin esperar 12 horas."""
    from app.plataforma_metricas import periodo_actual
    from app.services import cobranza

    cuerpo = _cobranza(lambda: cobranza.guardar_suscripcion(slug, payload.model_dump(), email))
    _anotar_consulta(email, "suscripcion", f"{(slug or '').strip().lower()}:{periodo_actual()}")
    tareas.add_task(_escalera_de_la_suscripcion, cuerpo["id"], "la suscripción")
    return cuerpo


@router.post("/clientes/{slug}/facturas")
def emitir_factura(slug: str, payload: FacturaIn, email: str = Depends(require_operador)):
    """Registra una cuenta de cobro del cliente, ya emitida fuera de RECABRA.
    Un cliente sin suscripción no recibe ninguna (409): está exento."""
    from app.plataforma_metricas import periodo_actual
    from app.services import cobranza

    cuerpo = _cobranza(lambda: cobranza.emitir_factura(slug, payload.model_dump(), email))
    _anotar_consulta(email, "factura", f"{(slug or '').strip().lower()}:{periodo_actual()}")
    return cuerpo


@router.post("/facturas/{factura_id}/pagos")
def registrar_pago(
    factura_id: int,
    payload: PagoIn,
    tareas: BackgroundTasks,
    email: str = Depends(require_operador),
):
    """Un pago manual contra una cuenta de cobro, con sus retenciones y la
    referencia del banco. Con ``levantar_estado``, si el cliente queda al día,
    su estado de cuenta vuelve a lo que corresponde.

    Y si la suscripción es automática y la escalera está prendida (C2), corre
    la escalera de ESE cliente apenas sale la respuesta: lo que puso el sistema
    vuelve a activo sin esperar la pasada de las 12 horas, y sale la constancia
    del pago por correo. En segundo plano, porque un correo puede tardar."""
    from app.plataforma_metricas import periodo_actual
    from app.services import cobranza

    cuerpo = _cobranza(lambda: cobranza.registrar_pago(factura_id, payload.model_dump(), email))
    slug = _slug_de_la_factura(factura_id)
    _anotar_consulta(email, "pago_manual", f"{slug}:{periodo_actual()}")
    tareas.add_task(_escalera_de_la_factura, cuerpo["factura"]["id"], "un pago")
    return cuerpo


def _escalera_de_la_suscripcion(suscripcion_id: int, tras: str) -> None:
    """La escalera de UNA suscripción, sólo si está prendida. No propaga: la
    respuesta ya salió, y la pasada de las 12 horas lo retoma.

    Corre después de cada escritura de la cartera (pago, anulación, disputa,
    suscripción): anular la cuenta de cobro que causó el corte, ponerla en
    disputa o dar una prórroga dejaba al cliente en sólo lectura hasta 12 horas,
    y desde la consola no había cómo aplicarlo (revisión de C2). Lo que mueve
    es lo que puso el sistema, con las reglas de siempre: nunca a una persona."""
    from app.services import cobranza_automatica

    if not cobranza_automatica.automatica_prendida():
        return
    try:
        plan = cobranza_automatica.correr(solo=suscripcion_id)
        if plan.pasos:
            log.warning("Tras %s: %s", tras, plan.resumen())
    except Exception:  # noqa: BLE001
        log.exception("La escalera tras %s (suscripción %s) falló", tras, suscripcion_id)


def _escalera_de_la_factura(factura_id: int, tras: str) -> None:
    """``_escalera_de_la_suscripcion`` de la suscripción de esa cuenta de cobro."""
    from app.models.cobro import FacturaCobro
    from app.services import cobranza_automatica

    if not cobranza_automatica.automatica_prendida():
        return
    try:
        reg = sesion_registro()
        try:
            fila = reg.query(FacturaCobro.suscripcion_id).filter(FacturaCobro.id == factura_id).first()
        finally:
            reg.close()
    except Exception:  # noqa: BLE001
        log.exception("La escalera tras %s (cuenta de cobro %s) falló", tras, factura_id)
        return
    if fila is not None:
        _escalera_de_la_suscripcion(fila[0], tras)


@router.post("/facturas/{factura_id}/anular")
def anular_factura(
    factura_id: int,
    payload: MotivoIn,
    tareas: BackgroundTasks,
    email: str = Depends(require_operador),
):
    """Anula una cuenta de cobro que salió mal, con motivo. El número queda
    usado; el período queda libre para emitir la corregida. Con la escalera
    prendida, la del cliente corre apenas sale la respuesta: si esa cuenta de
    cobro era la del corte, el cliente no espera 12 horas."""
    from app.plataforma_metricas import periodo_actual
    from app.services import cobranza

    cuerpo = _cobranza(lambda: cobranza.anular_factura(factura_id, payload.motivo, email))
    _anotar_consulta(email, "anulacion", f"{_slug_de_la_factura(factura_id)}:{periodo_actual()}")
    tareas.add_task(_escalera_de_la_factura, factura_id, "una anulación")
    return cuerpo


@router.post("/facturas/{factura_id}/disputa")
def disputar_factura(
    factura_id: int,
    payload: DisputaIn,
    tareas: BackgroundTasks,
    email: str = Depends(require_operador),
):
    """Pone o saca la marca de disputa, con motivo: lo que se discute no cuenta
    para el atraso. Con la escalera prendida, la del cliente corre apenas sale
    la respuesta, igual que tras un pago."""
    from app.plataforma_metricas import periodo_actual
    from app.services import cobranza

    cuerpo = _cobranza(lambda: cobranza.marcar_disputa(factura_id, payload.en_disputa, payload.motivo, email))
    _anotar_consulta(email, "disputa", f"{_slug_de_la_factura(factura_id)}:{periodo_actual()}")
    tareas.add_task(_escalera_de_la_factura, factura_id, "una disputa")
    return cuerpo


def _slug_de_la_factura(factura_id: int) -> str:
    """A quién atribuye la bitácora una acción sobre una factura: al slug de
    su cliente, SÓLO si la factura es de la suscripción que ese slug tiene hoy.

    Las facturas de un cliente borrado se quedan como constancia, y otro puede
    fundar el mismo slug: anotar `factura.cliente_slug` metía en el reporte de
    transparencia del nuevo titular la anulación o el pago de una relación
    comercial ajena (revisión de C2). Una factura huérfana se anota como
    ``#suscripcion-<id>``, que ningún slug puede tener adelante. Sólo se llama
    después de que la operación encontró la factura."""
    from app.models.cobro import FacturaCobro, Suscripcion

    reg = sesion_registro()
    try:
        fila = (
            reg.query(FacturaCobro.cliente_slug, FacturaCobro.suscripcion_id)
            .filter(FacturaCobro.id == factura_id).first()
        )
        if fila is None:
            return ""
        vigente = reg.query(Suscripcion.id).filter(Suscripcion.cliente_slug == fila[0]).first()
        if vigente is not None and vigente[0] == fila[1]:
            return fila[0]
        return f"#suscripcion-{fila[1]}"
    finally:
        reg.close()


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


# ─── Detalle de negocio de un cliente, para la asesoría (Fase 8) ───────────
#
# Ruta declarada AL FINAL DEL ARCHIVO, después de `/clientes/{slug}/reporte`
# y por lo tanto después de TODAS las literales de este router (`/metricas`,
# `/tendencia`, `/adopcion`, `/supresiones`, `/soy`, `/clientes`): la regla
# dura del repo es "literal antes de paramétrica". `/clientes/{slug}/detalle`
# no puede chocar hoy con ninguna de ellas (distinto número de segmentos o
# distinto primer segmento), pero el orden se respeta igual -- el día que
# alguien agregue una ruta nueva bajo `/clientes/` en el medio del archivo,
# ésta ya está a salvo por estar al final.
#
# Es la SEGUNDA puerta por la que un operador toca datos de negocio de un
# cliente (la primera es `/metricas`), y la única que devuelve filas: los
# espacios y sus contratos. Todo lo que sale de acá lo arma
# `app.plataforma_detalle.armar_detalle`, que abre la base de ESTE cliente una
# sola vez y sólo para `query(...)`.

@router.get("/clientes/{slug}/detalle")
def detalle_de_negocio_del_cliente(
    slug: str,
    periodo: str | None = None,
    email: str = Depends(require_operador),
):
    """El detalle de negocio de UN cliente: espacios, contratos, proveedores,
    movimientos, oportunidades y recomendaciones.

    ``?periodo=YYYY-MM``; sin parámetro, el mes calendario en curso (UTC), con
    la MISMA ventana de ``/metricas`` -- un período malformado o fuera de
    ventana es 422 con el texto de ``normalizar_periodo``, nunca una caída
    silenciosa al mes actual. ``slug`` normalizado (``.strip().lower()``,
    igual que el PATCH de estados y que ``/reporte``); si no existe, 404 con
    el MISMO texto fijo de ``/tendencia`` y ``/reporte``. Si la base de
    negocio no se deja leer, 503 con ``ERROR_BASE_ILEGIBLE``: el texto fijo,
    sin la URL de la base ni el mensaje del driver, que van al log.

    **La bitácora se escribe SIEMPRE, DESPUÉS de armar** (si armar fallara, no
    habría acceso que anotar) -- ``accion="detalle"`` con
    ``periodo="<slug>:<YYYY-MM>"``: es el acceso más profundo que un operador
    puede hacer a los datos de un cliente, y el reporte de transparencia de
    ese cliente lo lista. No hay caché del detalle a propósito: cada consulta
    se calcula y cada consulta queda anotada.
    """
    from app.plataforma_detalle import BaseIlegible, ClienteDesconocido, armar_detalle
    from app.plataforma_metricas import ERROR_BASE_ILEGIBLE, PeriodoInvalido, normalizar_periodo

    slug = (slug or "").strip().lower()
    try:
        anio_mes = normalizar_periodo(periodo)
    except PeriodoInvalido as e:
        raise HTTPException(status_code=422, detail=str(e)) from e

    try:
        cuerpo = armar_detalle(slug, anio_mes)
    except ClienteDesconocido as e:
        raise HTTPException(status_code=404, detail="No hay un cliente con ese código.") from e
    except BaseIlegible as e:
        raise HTTPException(status_code=503, detail=ERROR_BASE_ILEGIBLE) from e

    _anotar_consulta(email, "detalle", f"{slug}:{anio_mes}")
    return cuerpo
