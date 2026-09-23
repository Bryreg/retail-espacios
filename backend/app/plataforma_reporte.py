"""El reporte de transparencia: qué le tomó la plataforma a un cliente, cómo
lo calculó, quién lo consultó y cuándo (Fase 7, Parte B).

**Por qué existe.** La Fase 7 le sacó al operador el umbral de celda chica
(K=3): ahora ve los agregados EXACTOS de todos los clientes. La contrapartida
que hace ese trato defendible ante Ley 1581 es este reporte -- cada cliente
puede pedir, a demanda, la justificación completa de la toma de datos: qué
agregado existe, con qué fórmula, de qué tabla, para qué sirve y si sale
saneado o sin hora; los valores exactos que la plataforma calculó de él mes a
mes; y cada consulta del operador que lo alcanzó, con fecha y correo.

**SIN MIGRACIONES.** Todo sale de tablas que YA EXISTEN: ``snapshot_metricas``,
``bitacora_plataforma``, ``consentimientos``, ``membresias``, ``clientes`` y
``solicitudes_supresion`` -- las cinco del registro. Este módulo no agrega ni
una columna ni una tabla.

**Sólo lectura y sólo el REGISTRO**, con una única excepción acotada e
idéntica a la de ``plataforma_metricas``: ``spread_actual`` abre la base DE
ESTE cliente, una sola vez, sólo para leer (``_metricas_de_un_cliente``), y
nunca la de otro. Ningún otro dato de este módulo abre una base de negocio.

**``armar_reporte(slug, meses)`` es la única puerta.** La usan los DOS
endpoints (``routers/derechos.py`` para el dueño, ``routers/plataforma.py``
para el operador) y devuelven exactamente el mismo JSON -- el shape es
VINCULANTE y el frontend lo consume tal cual, sin distinguir de qué endpoint
vino.

**La frontera de ESTE reporte (Fase 7) sigue igual**: su JSON son agregados,
nunca filas de ``space_leases``/``spaces``/``suppliers``; ningún correo, nombre
ni id de un usuario final (``accesos.lineas[].operador`` es el correo del
OPERADOR -- el dato que el cliente tiene derecho a ver, no el de uno de sus
propios usuarios); el nombre del proveedor sale SANEADO (``_top``, reusado tal
cual); fechas sin hora; la tarifa de referencia nunca sale, sólo el spread. Los
únicos arreglos del JSON son ``catalogo``, ``valores``,
``valores[].top_proveedores`` y ``accesos.lineas``.

**Lo que SÍ cambió en la Fase 8 (detalle por cliente para asesoría).** La regla
"el operador ve agregados, nunca filas" dejó de ser cierta en un punto acotado
y declarado: ``GET /api/plataforma/clientes/{slug}/detalle`` SÍ publica filas de
contratos y de espacios de UN cliente -- código y tipo del espacio, estado en el
período, y del contrato vigente el proveedor saneado, la marca, el canon mensual
y las fechas -- para el servicio de asesoría comercial, sólo lectura y con
bitácora (``accion="detalle"``, ``periodo="<slug>:<YYYY-MM>"``). Ese endpoint
vive en ``app/plataforma_detalle.py``; ESTE módulo no lo llama ni copia sus
datos. Lo que sí hace, y es la razón de que la ampliación sea defendible, es
**declararlo**: el ``CATALOGO`` de abajo gana las entradas del detalle con
``endpoints: ["detalle"]``, y ``_accesos_del_cliente`` lista las consultas
``accion="detalle"`` de ese cliente, de modo que el titular ve en su propio
reporte qué se lee de él y quién lo leyó. La política lo declara en el §5.3 (a)
(detalle de espacios y contratos) y (b) (lo que sigue prohibido).
"""
import json
import logging
from datetime import date, datetime, time, timezone

from app.plataforma_tendencia import (
    CONSOLIDADO_SLUG,
    ClienteDesconocido,
    MesesInvalidos,
    MESES_DEFAULT,
    MESES_MAXIMO,
    ultimos_periodos,
)

log = logging.getLogger("recabra.plataforma.reporte")

BASE_LEGAL = "Política de Tratamiento de Datos Personales, §5.3 (Ley 1581/2012, Decreto 1377/2013)"
URL_POLITICA = "/politica-datos"

# Texto FIJO para cuando `spread_actual` no se pudo calcular -- nunca el
# mensaje del driver (mismo espíritu que `ERROR_BASE_ILEGIBLE`).
ERROR_SPREAD_ACTUAL = "No se pudo calcular el spread del mes en curso."

# Reexportadas por conveniencia del router y de los tests -- son las MISMAS
# excepciones de `plataforma_tendencia`, no una copia: un `meses` fuera de
# rango o un slug inexistente tienen que dar el mismo 422/404 en los tres
# endpoints que hoy leen el registro (`/tendencia`, y ahora los dos de acá).
__all__ = [
    "MesesInvalidos", "ClienteDesconocido", "CATALOGO", "armar_reporte",
]


# ─── El catálogo taxativo (VINCULANTE) ────────────────────────────────────────
#
# Un dict por agregado que la plataforma publica HOY -- de `/metricas`
# (`app/plataforma_metricas.py::publicas_desde_crudos` + lo que
# `_metricas_de_un_cliente` agrega aparte: `ultimo_acceso`, `spread_pct`,
# `tarifa_configurada`, `contratos_sin_tarifa`; más `estado_cuenta`, que viaja
# en la fila del cliente), de `/tendencia` (los mismos campos de `/metricas`
# que el histórico también guarda -- `publicar_fila` en
# `app/plataforma_tendencia.py`; el spread NO se persiste histórico, así que
# esos tres campos son SÓLO de `/metricas`) y de `/adopcion`
# (`app/plataforma_adopcion.py::_fila_cliente`, nombres reales de ese
# archivo).
#
# Es una lista ESTÁTICA en el código, no prosa suelta en el frontend: cambiar
# lo que la plataforma toma de un cliente significa tocar ESTE archivo, y el
# test de abajo (`test_plataforma_reporte.py`) afirma que ninguna clave que
# `/metricas` o `/adopcion` publican de verdad queda afuera.
#
# 34 entradas: las primeras 17 son las que publican `/metricas`, `/tendencia`
# y `/adopcion` bajo ESE nombre exacto (por eso llevan ese endpoint en
# `endpoints`). Las últimas 5 (`ocupadas`, `contratos_activos`, `canon_total`,
# `origen`, `capturado_en`) son cifras que SÍ salen en `valores[]` de este
# mismo reporte -- la propia auditoría del cliente sobre sus datos, exactos
# (desde la Fase 7 no hay supresión en ningún lado) -- pero que NINGÚN otro
# endpoint publica con ese nombre exacto: su `endpoints` es `["reporte"]`
# nada más (nunca "metricas"/"tendencia"/"adopcion" -- el test T-61 del
# auditor afirma el recíproco: toda entrada que declare uno de esos tres
# endpoints tiene que aparecer ahí con ese nombre exacto).
#
# Las 12 últimas (Fase 8) son el DETALLE de espacios y contratos que el
# operador ve de un cliente por `GET /api/plataforma/clientes/{slug}/detalle`
# (`app/plataforma_detalle.py`): `endpoints: ["detalle"]`, un valor nuevo y
# válido de `endpoints`. Son la excepción declarada a "agregados, nunca filas"
# -- ver el docstring del módulo. No salen en `valores[]` de este reporte (T-62
# no las alcanza) ni en `/metricas`//`tendencia`//`adopcion` (T-61 tampoco):
# están acá porque el catálogo es la declaración TAXATIVA de todo lo que la
# plataforma lee de un cliente, no sólo de lo que este reporte imprime. La
# `finalidad` de las 12 es `asesoria` -- el enum del shape (y el tipo del
# frontend) sigue siendo `asesoria|salud_cartera|cobranza`; la finalidad nueva
# de la política, "mejora del servicio y de la plataforma" (§3.6), vive en el
# documento y no en este enum, porque cambiarlo rompería el contrato del
# frontend sin decirle nada nuevo al titular.
CATALOGO = [
    {
        "clave": "sedes_con_plano",
        "nombre": "Sedes con plano",
        "definicion": "Cuántas sedes del cliente tienen un plano (layout) guardado en la plataforma.",
        "fuente": "layout_snapshots",
        "finalidad": "salud_cartera",
        "endpoints": ["metricas", "tendencia"],
        "tratamiento": "exacto",
    },
    {
        "clave": "espacios_comercializables",
        "nombre": "Espacios comercializables",
        "definicion": "Cuántas caras de mueble están marcadas como vendibles en los planos vigentes del cliente.",
        "fuente": "layout_snapshots",
        "finalidad": "salud_cartera",
        "endpoints": ["metricas", "tendencia"],
        "tratamiento": "exacto",
    },
    {
        "clave": "ocupacion_pct",
        "nombre": "Ocupación",
        "definicion": "Porcentaje de espacios comercializables con un contrato activo en el período (ocupadas ÷ comercializables × 100).",
        "fuente": "layout_snapshots, space_leases",
        "finalidad": "salud_cartera",
        "endpoints": ["metricas", "tendencia"],
        "tratamiento": "relacion",
    },
    {
        "clave": "canon_promedio_mensual",
        "nombre": "Canon promedio mensual",
        "definicion": "Promedio del canon mensual de los contratos activos del período (canon total ÷ cantidad de contratos activos).",
        "fuente": "space_leases",
        "finalidad": "salud_cartera",
        "endpoints": ["metricas", "tendencia"],
        "tratamiento": "relacion",
    },
    {
        "clave": "ingreso_contratado_mes",
        "nombre": "Ingreso contratado del mes",
        "definicion": "Suma del canon mensual de todos los contratos activos del período.",
        "fuente": "space_leases",
        "finalidad": "salud_cartera",
        "endpoints": ["metricas", "tendencia"],
        "tratamiento": "exacto",
    },
    {
        "clave": "top_proveedores",
        "nombre": "Top de proveedores",
        "definicion": "Los proveedores con más contratos activos del período (hasta 5), con el nombre saneado (correos y teléfonos enmascarados) y su conteo de contratos.",
        "fuente": "space_leases, suppliers",
        "finalidad": "asesoria",
        "endpoints": ["metricas", "tendencia"],
        "tratamiento": "saneado",
    },
    {
        "clave": "usuarios_con_cuenta",
        "nombre": "Usuarios con cuenta",
        "definicion": "Cantidad de personas con una membresía activa en la cuenta del cliente.",
        "fuente": "membresias",
        "finalidad": "cobranza",
        "endpoints": ["metricas", "tendencia", "adopcion"],
        "tratamiento": "conteo",
    },
    {
        "clave": "ultimo_acceso",
        "nombre": "Último acceso",
        "definicion": "Fecha (sin hora) del ingreso más reciente de cualquier persona con membresía activa en el cliente.",
        "fuente": "usuarios.ultimo_login, membresias",
        "finalidad": "cobranza",
        "endpoints": ["metricas"],
        "tratamiento": "sin_hora",
    },
    {
        "clave": "estado_cuenta",
        "nombre": "Estado de cuenta",
        "definicion": "El estado comercial de la cuenta (activo, gracia, solo_lectura o suspendido) que fijó el operador, y el motivo que escribió el operador al cambiarlo -- no es un dato que se toma del cliente.",
        "fuente": "estados_cliente",
        "finalidad": "cobranza",
        "endpoints": ["metricas", "adopcion"],
        "tratamiento": "exacto",
    },
    {
        "clave": "spread_pct",
        "nombre": "Spread sobre la tarifa de referencia",
        "definicion": "Diferencia porcentual entre el canon efectivamente cobrado y la tarifa de referencia del espacio, en los contratos del período con tarifa aplicable ((Σ canon con tarifa ÷ Σ tarifa − 1) × 100). La tarifa de referencia nunca sale, sólo esta relación.",
        "fuente": "space_leases, app_config (tarifa de referencia)",
        "finalidad": "salud_cartera",
        "endpoints": ["metricas"],
        "tratamiento": "relacion",
    },
    {
        "clave": "tarifa_configurada",
        "nombre": "Tarifa de referencia configurada",
        "definicion": "Si el cliente tiene alguna tarifa de referencia cargada (nunca cuál, sólo si existe).",
        "fuente": "app_config (tarifa de referencia)",
        "finalidad": "salud_cartera",
        "endpoints": ["metricas"],
        "tratamiento": "exacto",
    },
    {
        "clave": "contratos_sin_tarifa",
        "nombre": "Contratos sin tarifa aplicable",
        "definicion": "Cantidad de contratos activos del período cuyo espacio no tiene una tarifa de referencia (de su sede o por defecto) aplicable.",
        "fuente": "space_leases, app_config (tarifa de referencia)",
        "finalidad": "salud_cartera",
        "endpoints": ["metricas"],
        "tratamiento": "conteo",
    },
    {
        "clave": "cohorte",
        "nombre": "Cohorte de adopción",
        "definicion": "Mes de alta del cliente (la fundación self-service más antigua, o la fecha de creación del registro si no hay fundación), usado para agrupar la adopción.",
        "fuente": "fundaciones, clientes",
        "finalidad": "asesoria",
        "endpoints": ["adopcion"],
        "tratamiento": "sin_hora",
    },
    {
        "clave": "clasificacion",
        "nombre": "Clasificación de adopción",
        "definicion": "Categoría del cliente en el período (nueva, activa, fantasma, dormida o sin_cuentas), según cuentas con membresía, accesos recientes y contratos activos.",
        "fuente": "membresias, usuarios.ultimo_login, space_leases",
        "finalidad": "asesoria",
        "endpoints": ["adopcion"],
        "tratamiento": "relacion",
    },
    {
        "clave": "usuarios_activos_30d",
        "nombre": "Usuarios activos en 30 días",
        "definicion": "Cantidad de personas con membresía activa que ingresaron en los últimos 30 días.",
        "fuente": "membresias, usuarios.ultimo_login",
        "finalidad": "asesoria",
        "endpoints": ["adopcion"],
        "tratamiento": "conteo",
    },
    {
        "clave": "dias_sin_acceso",
        "nombre": "Días sin acceso",
        "definicion": "Días transcurridos desde el último ingreso de cualquier persona con membresía activa (sin dato si nunca entró nadie).",
        "fuente": "usuarios.ultimo_login, membresias",
        "finalidad": "asesoria",
        "endpoints": ["adopcion"],
        "tratamiento": "sin_hora",
    },
    {
        "clave": "con_contratos_activos",
        "nombre": "Tiene contratos activos",
        "definicion": "Si el cliente tiene al menos un contrato activo en el período en curso.",
        "fuente": "space_leases",
        "finalidad": "asesoria",
        "endpoints": ["adopcion"],
        "tratamiento": "exacto",
    },
    # ── Las 5 que sólo salen en `valores[]` de ESTE reporte (endpoints:
    # ["reporte"], nunca "metricas"/"tendencia"/"adopcion" -- ver la nota de
    # arriba y el test T-61 del auditor) ──────────────────────────────────
    {
        "clave": "ocupadas",
        "nombre": "Espacios ocupados",
        "definicion": "Cuántas caras comercializables tenían un contrato vigente en el mes -- el numerador de ocupacion_pct.",
        "fuente": "layout_snapshots, space_leases (contratos vigentes del mes)",
        "finalidad": "salud_cartera",
        "endpoints": ["reporte"],
        "tratamiento": "conteo",
    },
    {
        "clave": "contratos_activos",
        "nombre": "Contratos activos del mes",
        "definicion": "Cantidad de contratos vigentes en el mes -- el denominador de canon_promedio_mensual, guardado en snapshot_metricas.",
        "fuente": "snapshot_metricas (contratos vigentes de la base del cliente, capturados al armar la fila del mes)",
        "finalidad": "asesoria",
        "endpoints": ["reporte"],
        "tratamiento": "conteo",
    },
    {
        "clave": "canon_total",
        "nombre": "Canon total del mes",
        "definicion": "Suma del canon mensual de los contratos vigentes del mes -- el numerador de canon_promedio_mensual; es el mismo número que /metricas publica como ingreso_contratado_mes.",
        "fuente": "snapshot_metricas (suma del canon mensual de los contratos vigentes)",
        "finalidad": "asesoria",
        "endpoints": ["reporte"],
        "tratamiento": "exacto",
    },
    {
        "clave": "origen",
        "nombre": "Origen de la fila del mes",
        "definicion": "Si la fila del mes se tomó de una vista en vivo (\"vista\") o del cierre de mes (\"cierre\").",
        "fuente": "snapshot_metricas",
        "finalidad": "salud_cartera",
        "endpoints": ["reporte"],
        "tratamiento": "exacto",
    },
    {
        "clave": "capturado_en",
        "nombre": "Fecha de captura",
        "definicion": "Día en que se capturó la fila del mes -- se publica sin hora.",
        "fuente": "snapshot_metricas",
        "finalidad": "salud_cartera",
        "endpoints": ["reporte"],
        "tratamiento": "sin_hora",
    },
    # ── Fase 8: el DETALLE de espacios y contratos (endpoints: ["detalle"]) ──
    # Lo que el operador ve de UN cliente por vez en
    # `GET /api/plataforma/clientes/{slug}/detalle`, para la asesoría
    # comercial. Declarado en la política §5.3 (a); lo que NO se abre está en
    # §5.3 (b) y no tiene entrada acá porque no se lee: contactos y notas de
    # proveedores, notas de espacios y contratos, fotos y archivos, usuarios y
    # la tarifa de referencia.
    {
        "clave": "espacio_codigo_y_tipo",
        "nombre": "Código y tipo del espacio",
        "definicion": "Por cada espacio comercializable del plano, su código completo (SEDE-CODE, con el sufijo -B de la cara B de una góndola doble) y su tipo comercial (góndola, punta, nevera y demás), más la sede, la zona y el área si están cargadas.",
        "fuente": "layout_snapshots",
        "finalidad": "asesoria",
        "endpoints": ["detalle"],
        "tratamiento": "exacto",
    },
    {
        "clave": "espacio_estado",
        "nombre": "Estado del espacio en el período",
        "definicion": "Si el espacio está ocupado, libre o se libera dentro del período consultado (el contrato que lo ocupa vence antes de que termine).",
        "fuente": "layout_snapshots, space_leases",
        "finalidad": "asesoria",
        "endpoints": ["detalle"],
        "tratamiento": "exacto",
    },
    {
        "clave": "contrato_proveedor",
        "nombre": "Proveedor del contrato vigente",
        "definicion": "El nombre comercial del proveedor que ocupa el espacio, saneado (los correos y teléfonos incrustados se enmascaran antes de mostrarse). Nunca sus datos de contacto ni sus notas.",
        "fuente": "suppliers.name",
        "finalidad": "asesoria",
        "endpoints": ["detalle"],
        "tratamiento": "saneado",
    },
    {
        "clave": "contrato_marca",
        "nombre": "Marca del contrato vigente",
        "definicion": "La marca que se exhibe en el espacio según el contrato vigente, con el mismo saneo que el nombre del proveedor.",
        "fuente": "space_leases",
        "finalidad": "asesoria",
        "endpoints": ["detalle"],
        "tratamiento": "saneado",
    },
    {
        "clave": "contrato_canon_mensual",
        "nombre": "Canon mensual del contrato vigente",
        "definicion": "El canon mensual pactado en el contrato que ocupa el espacio, contrato por contrato (no sólo el promedio ni la suma del mes).",
        "fuente": "space_leases",
        "finalidad": "asesoria",
        "endpoints": ["detalle"],
        "tratamiento": "exacto",
    },
    {
        "clave": "contrato_fechas",
        "nombre": "Fechas del contrato vigente",
        "definicion": "Las fechas de inicio y de fin del contrato que ocupa el espacio, y cuántos días le faltan para vencer.",
        "fuente": "space_leases",
        "finalidad": "asesoria",
        "endpoints": ["detalle"],
        "tratamiento": "exacto",
    },
    {
        "clave": "resumen_por_tipo",
        "nombre": "Resumen por tipo de espacio",
        "definicion": "Por cada tipo de espacio del cliente: cuántos hay, cuántos ocupados y cuántos libres, y el canon promedio, mínimo y máximo de los contratos vigentes de ese tipo, más si hay una tarifa de referencia configurada para ese tipo (sí/no -- nunca el valor de la tarifa).",
        "fuente": "space_leases, layout_snapshots, app_config (sólo el sí/no de la tarifa)",
        "finalidad": "asesoria",
        "endpoints": ["detalle"],
        "tratamiento": "relacion",
    },
    {
        "clave": "proveedores_del_cliente",
        "nombre": "Proveedores del cliente",
        "definicion": "Por cada proveedor con contratos vigentes en el cliente, con el nombre saneado: cuántos espacios ocupa, de qué tipos y en qué sedes, su canon total y promedio, qué parte de los contratos vigentes del cliente representa, desde cuándo está y cuántos contratos le vencen en 60 días.",
        "fuente": "space_leases, suppliers",
        "finalidad": "asesoria",
        "endpoints": ["detalle"],
        "tratamiento": "saneado",
    },
    {
        "clave": "movimientos",
        "nombre": "Movimientos de los últimos 12 meses",
        "definicion": "Mes a mes, los contratos que empezaron y los que terminaron o se cancelaron, con el proveedor (saneado), el espacio, el tipo, el canon, la fecha y el motivo de cancelación si lo hubo.",
        "fuente": "space_leases (y las cancelaciones registradas)",
        "finalidad": "asesoria",
        "endpoints": ["detalle"],
        "tratamiento": "exacto",
    },
    {
        "clave": "benchmark_plataforma",
        "nombre": "Promedio de la plataforma por tipo de espacio",
        "definicion": "UN solo número por tipo de espacio: el canon promedio de los contratos vigentes de ese tipo en todos los clientes legibles. Sin desglose, sin sedes y sin el nombre de ningún otro supermercado -- se usa sólo para sugerir un precio cuando el cliente no cobra nada de ese tipo.",
        "fuente": "space_leases de todos los clientes legibles (un promedio por tipo)",
        "finalidad": "asesoria",
        "endpoints": ["detalle"],
        "tratamiento": "relacion",
    },
    {
        "clave": "oportunidades",
        "nombre": "Oportunidades de venta de espacio",
        "definicion": "Por cada espacio libre o que se libera: el precio sugerido (el canon promedio que ESE cliente cobra por ese tipo o, si no cobra ninguno, el promedio de la plataforma) y hasta 3 proveedores candidatos, que son siempre proveedores del MISMO cliente, con el canon que ya pagan.",
        "fuente": "derivado de espacio_estado, resumen_por_tipo, proveedores_del_cliente y benchmark_plataforma",
        "finalidad": "asesoria",
        "endpoints": ["detalle"],
        "tratamiento": "relacion",
    },
    {
        "clave": "recomendaciones",
        "nombre": "Recomendaciones de asesoría",
        "definicion": "La lista priorizada de qué proponerle al cliente (espacio libre, contrato por vencer, precio bajo la tarifa, concentración de un proveedor, sede subutilizada, tipos sin tarifa o arranque), con el canon mensual en juego y una explicación en palabras que GENERA EL SISTEMA a partir de esos mismos datos -- no es una nota de nadie y no lleva datos de contacto ni personas.",
        "fuente": "derivado de las entradas anteriores del detalle (texto generado por el sistema)",
        "finalidad": "asesoria",
        "endpoints": ["detalle"],
        "tratamiento": "relacion",
    },
]


def _top_reporte(proveedores_json: str) -> list[dict]:
    """``top_proveedores`` con el shape del reporte: ``{nombre, contratos}``.

    Reusa ``_top`` entero -- el orden (conteo desc, alfabético en los
    empates), el tope de 5 y el saneo del nombre son la MISMA función que usan
    ``/metricas`` y ``/tendencia`` -- y sólo le cambia el nombre de la clave de
    conteo (``contratos_activos`` -> ``contratos``) para el shape VINCULANTE
    de este reporte. Ninguna fórmula se reescribe acá.
    """
    from app.plataforma_metricas import _top

    try:
        conteos = json.loads(proveedores_json or "{}")
    except (TypeError, ValueError):
        log.exception("proveedores_json ilegible en un snapshot del reporte de transparencia")
        conteos = {}
    if not isinstance(conteos, dict):
        conteos = {}
    conteos = {str(n): int(c) for n, c in conteos.items()}
    return [
        {"nombre": item["nombre"], "contratos": item["contratos_activos"]}
        for item in _top(conteos)
    ]


def _valor_vacio(periodo: str) -> dict:
    """Un mes sin fila en ``snapshot_metricas`` para este cliente: presente en
    ``valores`` igual que en la serie de tendencia, y honesto sobre que no
    sabe nada -- no se omite ni se inventa un cero."""
    return {
        "periodo": periodo,
        "sin_dato": True,
        "origen": None,
        "capturado_en": None,
        "sedes_con_plano": None,
        "espacios_comercializables": None,
        "ocupadas": None,
        "ocupacion_pct": None,
        "contratos_activos": None,
        "canon_total": None,
        "canon_promedio_mensual": None,
        "usuarios_con_cuenta": None,
        "top_proveedores": [],
    }


def _valor_de_fila(fila) -> dict:
    """Una fila REAL de ``snapshot_metricas`` de este cliente, con los crudos
    exactos (nunca supresión de celda chica: es la propia auditoría del
    cliente sobre sus datos, no lo que ve el operador de otro) más
    ``ocupacion_pct`` y ``canon_promedio_mensual`` derivados con las MISMAS
    funciones que ``/tendencia``."""
    from app.plataforma_metricas import _pct, _plata

    contratos = fila.contratos_activos or 0
    canon_total = float(fila.canon_total or 0.0)
    return {
        "periodo": fila.periodo,
        "sin_dato": False,
        "origen": fila.origen,
        "capturado_en": fila.capturado_en.date().isoformat() if fila.capturado_en else None,
        "sedes_con_plano": fila.sedes_con_plano,
        "espacios_comercializables": fila.espacios_comercializables,
        "ocupadas": fila.ocupadas,
        "ocupacion_pct": _pct(fila.ocupadas or 0, fila.espacios_comercializables or 0),
        "contratos_activos": contratos,
        "canon_total": _plata(canon_total),
        "canon_promedio_mensual": _plata(canon_total / contratos) if contratos else None,
        "usuarios_con_cuenta": fila.usuarios,
        "top_proveedores": _top_reporte(fila.proveedores_json),
    }


def _politica_del_cliente(reg, slug: str) -> tuple[str | None, str | None]:
    """``(version_aceptada, aceptada_en)`` -- la aceptación MÁS RECIENTE de la
    versión VIGENTE, por cualquier owner activo del cliente. Join en memoria:
    ``membresias`` (owner, activo) -> ids -> ``consentimientos`` (esa
    versión). Sin correo ni id en el resultado -- sólo la versión y el día.
    ``(None, None)`` si ningún owner activo aceptó la versión vigente."""
    from app.models.consentimiento import Consentimiento, VERSION_POLITICA
    from app.models.identidad import Membresia

    ids_owners = [
        m.usuario_id
        for m in reg.query(Membresia.usuario_id)
        .filter(
            Membresia.cliente_slug == slug,
            Membresia.activo == True,  # noqa: E712
            Membresia.rol == "owner",
        )
        .all()
    ]
    if not ids_owners:
        return None, None

    fila = (
        reg.query(Consentimiento)
        .filter(
            Consentimiento.usuario_id.in_(ids_owners),
            Consentimiento.version == VERSION_POLITICA,
        )
        .order_by(Consentimiento.aceptado_en.desc())
        .first()
    )
    if fila is None:
        return None, None
    return fila.version, fila.aceptado_en.date().isoformat()


def _spread_actual(reg, fila_cliente) -> dict | None:
    """El spread del MES EN CURSO, sólo de este cliente -- UNA base, sólo
    lectura. ``None`` entero si algo falla (base rota, tarifa ilegible): el
    reporte no puede caerse por esto, y el mensaje del driver nunca sale."""
    from app.clientes import Cliente
    from app.plataforma_metricas import _metricas_de_un_cliente, periodo_actual, rango_del_periodo

    try:
        actual = periodo_actual()
        desde, hasta = rango_del_periodo(actual)
        cliente = Cliente(
            slug=fila_cliente.slug, nombre=fila_cliente.nombre,
            db_name=fila_cliente.db_name, activo=fila_cliente.activo,
        )
        publicas, _crudos = _metricas_de_un_cliente(cliente, reg, desde, hasta)
        return {
            "periodo": actual,
            "tarifa_configurada": publicas["tarifa_configurada"],
            "spread_pct": publicas["spread_pct"],
            "contratos_sin_tarifa": publicas["contratos_sin_tarifa"],
        }
    except Exception:  # noqa: BLE001
        log.exception("No se pudo calcular el spread actual del reporte de transparencia")
        return None


def _accesos_del_cliente(reg, slug: str, desde_dt: datetime, hasta_dt: datetime) -> dict:
    """Cada línea de ``bitacora_plataforma`` en la ventana que ALCANZÓ a este
    cliente. Más nueva primero; ``fecha`` sin hora; ``operador`` es el correo
    del operador (el dato que el titular tiene derecho a ver).

    La regla por ``accion``:

    * ``metricas``, ``adopcion``, ``clientes`` -- barren a TODOS los clientes:
      alcanzan siempre.
    * ``tendencia`` -- alcanza si el período es ``"<slug>:…"`` o el del
      consolidado (que suma a este cliente).
    * ``supresiones`` -- alcanza sólo si este cliente tiene alguna solicitud.
    * ``reporte`` -- el reporte de transparencia de ESTE cliente
      (``periodo="<slug>:<desde>..<hasta>"``).
    * ``detalle`` (Fase 8) -- el detalle de espacios y contratos de ESTE
      cliente (``periodo="<slug>:<YYYY-MM>"``).
    * ``renombre``, ``archivo``, ``reactivacion``, ``borrado`` (2026-09-23) --
      lo que el operador le HIZO a este cliente desde la consola, con la misma
      forma de ``periodo`` que ``detalle``. El borrado no llega a verse en
      ningún reporte (el cliente ya no existe), pero se declara igual: la
      regla es que ninguna acción quede sin rama acá.

    Cualquier acción que no esté en esa lista NO alcanza: una acción nueva sin
    su rama acá quedaría sin declarar en el reporte del titular, que es
    exactamente lo que este módulo existe para impedir."""
    from app.models.plataforma import BitacoraPlataforma
    from app.models.supresion import SolicitudSupresion

    tiene_supresion = (
        reg.query(SolicitudSupresion.id)
        .filter(SolicitudSupresion.cliente_slug == slug)
        .first()
        is not None
    )

    filas = (
        reg.query(BitacoraPlataforma)
        .filter(BitacoraPlataforma.en >= desde_dt, BitacoraPlataforma.en <= hasta_dt)
        .order_by(BitacoraPlataforma.en.desc())
        .all()
    )

    lineas = []
    for f in filas:
        periodo = f.periodo or ""
        if f.accion in ("metricas", "adopcion", "clientes"):
            alcanza = True
        elif f.accion == "tendencia":
            alcanza = periodo.startswith(f"{slug}:") or periodo.startswith(f"{CONSOLIDADO_SLUG}:")
        elif f.accion == "supresiones":
            alcanza = tiene_supresion
        elif f.accion == "reporte":
            alcanza = periodo.startswith(f"{slug}:")
        elif f.accion in ("renombre", "archivo", "reactivacion", "borrado"):
            alcanza = periodo.startswith(f"{slug}:")
        elif f.accion == "detalle":
            # Fase 8: `GET /api/plataforma/clientes/{slug}/detalle` anota
            # `periodo="<slug>:<YYYY-MM>"` -- alcanza SÓLO al cliente cuyo slug
            # va adelante. Es la consulta más invasiva que existe (espacios y
            # contratos, fila por fila), así que tiene que verse en el reporte
            # del titular igual que las demás.
            alcanza = periodo.startswith(f"{slug}:")
        else:
            alcanza = False
        if not alcanza:
            continue
        lineas.append({
            "fecha": f.en.date().isoformat(),
            "operador": f.email,
            "accion": f.accion,
            "periodo": f.periodo,
        })

    return {"total": len(lineas), "lineas": lineas}


def armar_reporte(slug: str, meses: int = MESES_DEFAULT) -> dict:
    """El cuerpo completo del reporte de transparencia de UN cliente.

    Única puerta de este módulo -- la usan los dos endpoints
    (``routers/derechos.py`` y ``routers/plataforma.py``) y los dos devuelven
    exactamente lo que esto devuelve. Levanta ``MesesInvalidos`` (``meses``
    fuera de 1..``MESES_MAXIMO``) o ``ClienteDesconocido`` (el slug no existe
    en el registro) -- las MISMAS excepciones que ``plataforma_tendencia.serie``,
    para que el 422/404 sea uno solo en toda la plataforma.
    """
    from app.clientes import sesion_registro
    from app.models.models import ClienteRow
    from app.models.plataforma import SnapshotMetricas
    from app.plataforma_metricas import _ahora_iso, rango_del_periodo
    from app.models.consentimiento import VERSION_POLITICA

    try:
        cuantos = int(meses)
    except (TypeError, ValueError) as e:
        raise MesesInvalidos(f"Los meses van de 1 a {MESES_MAXIMO}.") from e
    if not (1 <= cuantos <= MESES_MAXIMO):
        raise MesesInvalidos(f"Los meses van de 1 a {MESES_MAXIMO}.")

    slug = (slug or "").strip()
    hasta = _periodo_actual()
    periodos = ultimos_periodos(cuantos, hasta)
    desde = periodos[0]

    reg = sesion_registro()
    try:
        fila_cliente = reg.query(ClienteRow).filter(ClienteRow.slug == slug).first()
        if fila_cliente is None:
            raise ClienteDesconocido("No hay un cliente con ese código.")

        version_aceptada, aceptada_en = _politica_del_cliente(reg, slug)

        filas_snapshot = {
            f.periodo: f
            for f in reg.query(SnapshotMetricas)
            .filter(SnapshotMetricas.cliente_slug == slug, SnapshotMetricas.periodo.in_(periodos))
            .all()
        }
        valores = [
            _valor_de_fila(filas_snapshot[p]) if p in filas_snapshot else _valor_vacio(p)
            for p in periodos
        ]

        spread_actual = _spread_actual(reg, fila_cliente)

        d_desde, _h_desde = rango_del_periodo(desde)
        _d_hasta, d_hasta = rango_del_periodo(hasta)
        desde_dt = datetime.combine(d_desde, time.min, tzinfo=timezone.utc)
        hasta_dt = datetime.combine(d_hasta, time.max, tzinfo=timezone.utc)
        accesos = _accesos_del_cliente(reg, slug, desde_dt, hasta_dt)

        nombre_cliente = fila_cliente.nombre
    finally:
        reg.close()

    return {
        "cliente": {"slug": slug, "nombre": nombre_cliente},
        "generado_en": _ahora_iso(),
        "ventana": {"desde": desde, "hasta": hasta, "meses": cuantos},
        "politica": {
            "version_vigente": VERSION_POLITICA,
            "version_aceptada": version_aceptada,
            "aceptada_en": aceptada_en,
            "base_legal": BASE_LEGAL,
            "url": URL_POLITICA,
        },
        "catalogo": CATALOGO,
        "valores": valores,
        "spread_actual": spread_actual,
        "accesos": accesos,
        "derechos": {
            "export": "GET /api/clientes/mi-export",
            "supresion": "POST /api/clientes/solicitar-supresion",
            "reporte": "GET /api/clientes/mi-reporte-plataforma",
            "contacto": "Correo de protección de datos de la política, §8",
        },
    }


def _periodo_actual() -> str:
    """Import diferido de ``plataforma_metricas.periodo_actual`` -- evita un
    import circular a nivel de módulo (``plataforma_metricas`` no importa este
    archivo, pero mantener todos los imports de negocio adentro de las
    funciones es el patrón que ya usan ``plataforma_tendencia`` y
    ``plataforma_adopcion``)."""
    from app.plataforma_metricas import periodo_actual

    return periodo_actual()
