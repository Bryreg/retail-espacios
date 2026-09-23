"""El detalle de negocio de UN cliente, para la asesoría comercial (Fase 8).

**Este módulo SÓLO LEE**, igual que ``app/plataforma_metricas.py`` y por la
misma garantía de construcción: no hay un ``add``, un ``commit`` ni un
``delete`` contra ninguna base en todo el archivo; las sesiones de cliente se
usan sólo para ``query(...)`` y se cierran en el ``finally``.

**Qué abre.** La base de ESTE cliente, UNA sola vez (``armar_detalle``), y la
de todos los demás sólo dentro de ``benchmark_por_tipo``, que no devuelve nada
de nadie: un promedio de canon por tipo de espacio sobre todos los clientes
legibles, un número por tipo, sin desglose ni nombres. Ninguna otra base se
toca.

**Qué sale (taxativo, spec de la Fase 8)**: el espacio (código completo, sede,
código corto, cara, tipo, zona, área), su estado en el período
(``ocupado``/``libre``/``se_libera``) y el contrato vigente si lo hay
—proveedor por NOMBRE COMERCIAL SANEADO, marca, canon, inicio, fin—; el
resumen por tipo; los proveedores del cliente; los movimientos de los últimos
12 meses; las oportunidades sobre lo que está libre; y las recomendaciones
priorizadas, cada una con una ``explicacion`` corta generada acá a partir de
esos mismos datos.

**Qué nunca.** ``Supplier.contact_name`` / ``phone`` / ``email`` / ``notes``,
``Space.notes``, ``SpaceLease.notes``, ``SpaceFile`` ni foto alguna; ningún
correo, nombre ni id de un usuario del supermercado; ningún id numérico de
fila (``space_id``, ``lease_id``, ``supplier_id``); nada del fixture del
layout que traiga plata o texto libre (``observation``, ``supplierName``,
``negotiatedValue``, ``nomenclatura``, ``label``) — los contratos salen SOLO
de ``space_leases``; y **la tarifa de referencia**, de la que sólo sale
``tarifa_configurada`` sí/no por tipo, nunca su valor, ni su suma, ni su
promedio.

**Cero fórmulas duplicadas.** El tipo de cada espacio, el código completo, el
porcentaje, la plata redondeada, el saneo del nombre y la regla de "contrato
del período" se importan de ``plataforma_metricas``; la huella del mueble, de
``services/layout_lookup``. Lo único nuevo acá es la vuelta del plano que
devuelve el FIXTURE de cada código (``_fixtures_por_codigo``) — que
``_numeros_del_layout`` no devuelve — y que reusa sus mismos helpers.

**Sin caché del detalle**: se calcula en cada consulta, porque la bitácora
anota cada una y el asesor mira esto mientras habla con el cliente. Lo único
cacheado es el benchmark de plataforma (5 minutos por período, mismo TTL y
mismo LRU acotado que ``/metricas``): recorrer las N bases por cada espacio
libre de cada cliente no escala.
"""
import json
import logging
import threading
import time
from collections import OrderedDict, namedtuple
from datetime import date

from app.plataforma_metricas import (
    CACHE_TTL_SEGUNDOS,
    TOPE_CACHE_PERIODOS,
    _ahora_iso,
    _codigo_completo,
    _contratos_activos,
    _contratos_del_cliente,
    _corrido,
    _del_periodo,
    _es_comercializable,
    _es_gondola_doble,
    _guardar_en_cache,
    _numeros_del_layout,
    _pct,
    _plata,
    _tarifa_aplicable,
    _tarifas_limpias,
    rango_del_periodo,
    sanear_nombre_proveedor,
)
# La MISMA excepción de `/tendencia` y del reporte de transparencia: un slug que
# no está en el registro tiene que dar el mismo 404 con el mismo texto fijo en
# los cuatro endpoints que hoy miran un cliente por su código.
from app.plataforma_tendencia import ClienteDesconocido
from app.services.layout_lookup import _huella

log = logging.getLogger("recabra.plataforma.detalle")

__all__ = [
    "BaseIlegible", "ClienteDesconocido", "armar_detalle", "benchmark_por_tipo",
    "limpiar_cache_detalle",
]

#: Los movimientos que ve el asesor: el período consultado y los once meses
#: anteriores.
MESES_MOVIMIENTOS = 12
#: Un contrato "por vencer" a efectos de la recomendación y del contador por
#: proveedor. Sesenta días es una renovación que todavía se puede negociar.
DIAS_POR_VENCER = 60
#: … y por debajo de treinta la recomendación sube a prioridad alta sola.
DIAS_POR_VENCER_URGENTE = 30
#: Cuántos proveedores candidatos se proponen por espacio libre.
TOPE_CANDIDATOS = 3
#: Concentración de cartera: a partir de acá hay recomendación, y a partir del
#: umbral alto la recomendación es de prioridad alta.
UMBRAL_CONCENTRACION_PCT = 40.0
UMBRAL_CONCENTRACION_ALTA_PCT = 60.0
#: Una sede está subutilizada si está esta cantidad de PUNTOS por debajo de la
#: ocupación promedio del propio cliente.
BRECHA_SEDE_PUNTOS = 15.0
#: Porción del ingreso contratado del mes que hace alta (o media) a una
#: recomendación. Es relativa al cliente a propósito: $900.000 son la mitad del
#: negocio de una tienda y el ruido de fondo de una cadena.
PISO_PRIORIDAD_ALTA = 0.15
PISO_PRIORIDAD_MEDIA = 0.05

#: El tipo que se le pone a un contrato cuyo código no tiene mueble en el plano.
#: No es un espacio (no entra en `espacios[]`, ni en `resumen_por_tipo`, ni en
#: `oportunidades`), pero la plata existe: cuenta en proveedores, movimientos y
#: contratos por vencer.
TIPO_FUERA_DEL_PLANO = "fuera_del_plano"

_ORDEN_PRIORIDAD = {"alta": 0, "media": 1, "baja": 2}


class BaseIlegible(RuntimeError):
    """La base de negocio de este cliente no se dejó abrir o leer.

    El router la convierte en 503 con ``ERROR_BASE_ILEGIBLE`` — el texto FIJO
    de ``plataforma_metricas``, sin la URL de la base ni el mensaje crudo del
    driver, que van al log del servidor y sólo ahí.
    """


#: Un contrato tal como lo devuelve ``_contratos_del_cliente``, con nombre. El
#: ``proveedor`` es el nombre CRUDO: se sanea al armar el JSON, nunca al
#: agrupar (ver ``sanear_nombre_proveedor``).
_Contrato = namedtuple("_Contrato", "codigo proveedor marca canon inicio fin activo")


# ─── Lo que hay que leer del plano y de las filas ─────────────────────────────

def _fixtures_por_codigo(db) -> dict[str, dict]:
    """``codigo_completo -> fixture`` de los muebles COMERCIALIZABLES.

    ``_numeros_del_layout`` devuelve el mapa de TIPOS, que es lo que le hace
    falta al spread; acá hace falta además la geometría (para el área cuando no
    hay fila en ``spaces``) y saber si el mueble es una góndola doble (para
    decir si un código es la cara A). Se arma con los MISMOS helpers
    (``_es_comercializable``, ``_codigo_completo``, ``_es_gondola_doble``) y en
    una sola pasada por ``layout_snapshots``, en vez de llamar a
    ``find_fixture_by_space_code`` una vez por espacio — que recorre todas las
    sedes en cada llamada.

    La cara ``-B`` comparte el fixture de su góndola: es la otra cara del mismo
    mueble, con su mismo tamaño y su mismo tipo.
    """
    from app.models.models import LayoutSnapshot

    mapa: dict[str, dict] = {}
    for snap in db.query(LayoutSnapshot).all():
        try:
            fixtures = json.loads(snap.fixtures_json or "[]")
        except (ValueError, TypeError):
            continue
        if not isinstance(fixtures, list):
            continue
        for fixture in fixtures:
            if not isinstance(fixture, dict):
                continue
            code = str(fixture.get("code") or "").strip()
            if not code or not _es_comercializable(fixture):
                continue
            sede = str(fixture.get("sede") or snap.sede or "").strip()
            completo = _codigo_completo(sede, code)
            if not completo:
                continue
            mapa[completo] = fixture
            if _es_gondola_doble(fixture):
                mapa[f"{completo}-B"] = fixture
    return mapa


def _zona_y_area(db) -> dict[str, tuple]:
    """``codigo -> (zone, area_m2)`` de las filas de ``spaces``.

    SÓLO esas dos columnas. ``spaces`` también tiene ``notes`` —texto libre del
    cliente— y un ``id`` que es una fila de negocio: ninguno de los dos sale de
    esta función, así que ninguno puede llegar al JSON por descuido más
    adelante.
    """
    from app.models.models import Space

    filas = db.query(Space.code, Space.zone, Space.area_m2).all()
    return {(codigo or "").strip().upper(): (zona, area) for codigo, zona, area in filas}


# ─── El benchmark de plataforma ───────────────────────────────────────────────
#
# UN número por tipo de espacio: el canon promedio de los contratos activos de
# ESE tipo en TODOS los clientes legibles. Es lo único de este módulo que abre
# bases que no son la del cliente consultado, y por eso lo que devuelve está
# acotado a un `dict[str, float]`: sin slugs, sin conteos por cliente, sin
# nombres de proveedores. De ahí no se despeja quién cobra cuánto.

_cache_benchmark: "OrderedDict[str, tuple[dict[str, float], float]]" = OrderedDict()
_cache_candado = threading.Lock()


def _acumular_benchmark(cliente, desde: date, hasta: date, suma: dict, cuenta: dict) -> None:
    """Suma los contratos activos de UN cliente al acumulado por tipo.

    Abre su base, lee el plano y los contratos del período, y cierra. Un código
    sin mueble en el plano no tiene tipo y se salta: no se puede promediar en
    una bolsa que no existe.
    """
    from app.clientes import sesion_de

    db = sesion_de(cliente)
    try:
        _sedes, _caras, mapa_tipos = _numeros_del_layout(db)
        contratos = _contratos_activos(db, desde, hasta)
    finally:
        db.close()

    for codigo, _nombre, canon in contratos:
        entrada = mapa_tipos.get(codigo)
        if entrada is None:
            continue
        tipo = entrada[1]
        suma[tipo] = suma.get(tipo, 0.0) + canon
        cuenta[tipo] = cuenta.get(tipo, 0) + 1


def _calcular_benchmark(anio_mes: str) -> dict[str, float]:
    """``{tipo: canon promedio}`` sobre TODOS los clientes legibles.

    Recorre las mismas filas que ``plataforma_metricas._calcular``: todas las
    de ``clientes`` del registro, ordenadas por slug, activas e inactivas —el
    negocio de una cuenta suspendida sigue siendo negocio para el promedio— y
    en SECUENCIA, con ``try/except`` por cliente: una base rota se ignora y el
    resto del promedio se calcula igual (mismo patrón que
    ``_run_lease_maintenance``). El cliente consultado entra también: "todos
    los legibles" es todos.
    """
    from app.clientes import Cliente, sesion_registro
    from app.models.models import ClienteRow

    desde, hasta = rango_del_periodo(anio_mes)

    reg = sesion_registro()
    try:
        # Los archivados no entran al benchmark: misma regla que `/metricas`.
        filas = (
            reg.query(ClienteRow)
            .filter(ClienteRow.activo == True)  # noqa: E712
            .order_by(ClienteRow.slug)
            .all()
        )
        objetivos = [
            Cliente(slug=f.slug, nombre=f.nombre, db_name=f.db_name, activo=f.activo)
            for f in filas
        ]
    finally:
        reg.close()

    suma: dict[str, float] = {}
    cuenta: dict[str, int] = {}
    for cliente in objetivos:
        try:
            _acumular_benchmark(cliente, desde, hasta, suma, cuenta)
        except Exception:  # noqa: BLE001
            log.exception(
                "No se pudo leer la base del cliente %s para el benchmark de plataforma",
                cliente.slug,
            )

    return {tipo: _plata(suma[tipo] / cuenta[tipo]) for tipo in sorted(suma) if cuenta.get(tipo)}


def benchmark_por_tipo(anio_mes: str) -> dict[str, float]:
    """El benchmark del período, del caché de 5 minutos o recién calculado.

    Mismo TTL, mismo LRU acotado y mismo candado que el caché de ``/metricas``
    (``CACHE_TTL_SEGUNDOS``, ``TOPE_CACHE_PERIODOS``, ``_guardar_en_cache``):
    el detalle no se cachea —cada consulta se calcula y se anota—, pero el
    recorrido por las N bases sí, o cada espacio libre de cada cliente pagaría
    esa vuelta entera.
    """
    ahora = time.monotonic()
    with _cache_candado:
        cacheado = _cache_benchmark.get(anio_mes)
        if cacheado is not None and cacheado[1] > ahora:
            _cache_benchmark.move_to_end(anio_mes)
            return dict(cacheado[0])

    valores = _calcular_benchmark(anio_mes)

    with _cache_candado:
        _guardar_en_cache(
            _cache_benchmark, anio_mes, (valores, time.monotonic() + CACHE_TTL_SEGUNDOS))
    return dict(valores)


def limpiar_cache_detalle() -> None:
    """Para las pruebas, que arman una base nueva por prueba."""
    with _cache_candado:
        _cache_benchmark.clear()


# ─── Plata y porcentajes, en palabras ─────────────────────────────────────────

def _pesos(valor) -> str:
    """``1200000`` -> ``"$ 1.200.000"``. Sin decimales y con punto de miles.

    Es lo único que formatea plata en todo el backend, y existe para que las
    ``explicacion`` de las recomendaciones sean legibles sin que el frontend
    tenga que reconstruir la frase. Los números de verdad viajan aparte, en
    ``valor_estimado_mensual`` y en ``datos``.
    """
    try:
        entero = int(round(float(valor or 0)))
    except (TypeError, ValueError):
        entero = 0
    return "$ " + f"{entero:,}".replace(",", ".")


def _num(valor) -> str:
    """Un porcentaje con un decimal, para el texto de las explicaciones."""
    return f"{float(valor or 0):.1f}"


def _lista(textos) -> str:
    return ", ".join(textos)


# ─── Los espacios del plano ───────────────────────────────────────────────────

def _codigo_corto(codigo: str, sede: str) -> str:
    """``NAVE-GON-01-B`` -> ``GON-01``: sin el prefijo de sede y sin la cara.

    Es la nomenclatura que el cliente ve adentro del plano; el código completo
    es el que vale afuera (regla dura del repo). Se publican los dos porque el
    asesor lee el corto y busca por el completo.
    """
    base = codigo[:-2] if codigo.endswith("-B") else codigo
    if sede and base.startswith(f"{sede}-"):
        return base[len(sede) + 1:]
    return base


def _cara_de(codigo: str, fixture: dict | None) -> str | None:
    """``"B"`` para la cara del sufijo, ``"A"`` para la cara top-level de una
    góndola doble, ``None`` para un mueble de una sola cara."""
    if codigo.endswith("-B"):
        return "B"
    if fixture is not None and _es_gondola_doble(fixture):
        return "A"
    return None


def _area_de(codigo: str, fixture: dict | None, geo: dict) -> float | None:
    """El área del espacio: la de ``spaces`` si existe y es positiva, si no la
    huella del mueble en el plano (``_huella``, el mismo ancho×fondo con el
    giro aplicado que usa el minimapa), si no ``None``."""
    fila = geo.get(codigo)
    if fila is not None and fila[1]:
        try:
            area = float(fila[1])
        except (TypeError, ValueError):
            area = 0.0
        if area > 0:
            return _plata(area)
    if fixture is not None:
        w, d = _huella(fixture)
        if w > 0 and d > 0:
            return round(w * d, 2)
    return None


def _zona_de(codigo: str, geo: dict) -> str | None:
    fila = geo.get(codigo)
    if fila is None:
        return None
    zona = (fila[0] or "").strip()
    # Texto libre del cliente, como el nombre del proveedor: pasa por el
    # mismo saneo (correos y teléfonos enmascarados). detalle-1 del auditor.
    return sanear_nombre_proveedor(zona) or None


def _contrato_publicado(contratos: list) -> "_Contrato | None":
    """De los contratos del período sobre un mismo espacio, el que se publica:
    el de fin más tardío —el que dice hasta cuándo está tomado ese espacio—.
    Los empates se rompen por canon y por nombre para que el JSON sea
    determinista consulta tras consulta."""
    if not contratos:
        return None
    return max(contratos, key=lambda c: (c.fin, c.canon, c.proveedor))


def _contrato_publico(contrato: "_Contrato", desde: date) -> dict:
    """El contrato tal como sale al JSON. Nombre SANEADO, marca saneada por el
    mismo camino (es el otro texto libre que el cliente teclea), plata
    redondeada y fechas en ISO. Ni ``notes``, ni ids, ni la fila."""
    marca = sanear_nombre_proveedor(contrato.marca) if contrato.marca else ""
    return {
        "proveedor": sanear_nombre_proveedor(contrato.proveedor),
        "marca": marca or None,
        "canon_mensual": _plata(contrato.canon),
        "inicio": contrato.inicio.isoformat(),
        "fin": contrato.fin.isoformat(),
        "dias_para_vencer": (contrato.fin - desde).days,
        "arranca_en_periodo": contrato.inicio >= desde,
    }


def _armar_espacios(mapa_tipos: dict, fixtures: dict, geo: dict,
                    publicados: dict, desde: date, hasta: date) -> list[dict]:
    """Un objeto por CARA comercializable del plano, ordenado por sede y código.

    El universo de espacios son las claves de ``mapa_tipos`` —las mismas caras
    que cuenta la ocupación de ``/metricas``, cara ``-B`` incluida—: si un
    contrato apunta a un código que no está ahí, no es un espacio de este
    cliente y no se inventa uno.
    """
    salida = []
    for codigo in sorted(mapa_tipos, key=lambda c: (mapa_tipos[c][0], c)):
        sede, tipo = mapa_tipos[codigo]
        fixture = fixtures.get(codigo)
        contrato = publicados.get(codigo)
        if contrato is None:
            estado = "libre"
        elif contrato.fin <= hasta:
            estado = "se_libera"
        else:
            estado = "ocupado"
        salida.append({
            "codigo": codigo,
            "sede": sede,
            "codigo_corto": _codigo_corto(codigo, sede),
            "cara": _cara_de(codigo, fixture),
            "tipo": tipo,
            "zona": _zona_de(codigo, geo),
            "area_m2": _area_de(codigo, fixture, geo),
            "estado": estado,
            "contrato": _contrato_publico(contrato, desde) if contrato is not None else None,
        })
    return salida


def _armar_sedes(espacios: list[dict]) -> list[dict]:
    """Una fila por sede CON PLANO, alfabética. ``ocupados`` incluye a los que
    se liberan dentro del período: durante el período están tomados."""
    por_sede: dict[str, list] = {}
    for e in espacios:
        por_sede.setdefault(e["sede"], []).append(e)

    salida = []
    for sede in sorted(por_sede):
        filas = por_sede[sede]
        ocupados = sum(1 for e in filas if e["estado"] != "libre")
        salida.append({
            "sede": sede,
            "espacios": len(filas),
            "ocupados": ocupados,
            "libres": len(filas) - ocupados,
            "ocupacion_pct": _pct(ocupados, len(filas)),
        })
    return salida


def _armar_resumen_por_tipo(espacios: list[dict], mapa_tipos: dict, tarifas: dict) -> list[dict]:
    """Total, ocupados, libres y la estadística de canon por tipo de espacio.

    ``canon_promedio`` / ``canon_minimo`` / ``canon_maximo`` salen de los
    contratos PUBLICADOS en ``espacios[]`` de ese tipo — los contratos que el
    asesor está viendo en la tabla de arriba, no otra cuenta paralela.

    ``tarifa_configurada`` es un SÍ/NO: hay tarifa aplicable (la de la sede o
    la default) para ese tipo en ALGUNA de las sedes que tienen espacios así.
    El valor de la tarifa no sale, ni su suma, ni su promedio: es la única cifra
    del negocio del cliente que la Fase 6 dejó fuera de la frontera y la Fase 8
    no la mueve.
    """
    sedes_por_tipo: dict[str, set] = {}
    for sede, tipo in mapa_tipos.values():
        sedes_por_tipo.setdefault(tipo, set()).add(sede)

    por_tipo: dict[str, list] = {}
    for e in espacios:
        por_tipo.setdefault(e["tipo"], []).append(e)

    salida = []
    for tipo in sorted(por_tipo):
        filas = por_tipo[tipo]
        ocupados = sum(1 for e in filas if e["estado"] != "libre")
        canones = [e["contrato"]["canon_mensual"] for e in filas if e["contrato"] is not None]
        salida.append({
            "tipo": tipo,
            "total": len(filas),
            "ocupados": ocupados,
            "libres": len(filas) - ocupados,
            "canon_promedio": _plata(sum(canones) / len(canones)) if canones else None,
            "canon_minimo": _plata(min(canones)) if canones else None,
            "canon_maximo": _plata(max(canones)) if canones else None,
            "tarifa_configurada": any(
                _tarifa_aplicable(tarifas, sede, tipo) is not None
                for sede in sorted(sedes_por_tipo.get(tipo, set()))
            ),
        })
    return salida


# ─── Los proveedores del cliente ──────────────────────────────────────────────

def _indice_de_proveedores(del_periodo: list, historicos: list, mapa_tipos: dict,
                           desde: date) -> list[dict]:
    """Un registro por proveedor con contratos en el período.

    **Se agrupa por el nombre CRUDO y se publica el saneado**, exactamente como
    ``_top`` de ``plataforma_metricas``: agrupar por la versión saneada podría
    fundir dos proveedores distintos en una sola fila y el conteo mentiría.

    ``desde`` (el primer contrato) mira TODOS los contratos históricos de ese
    proveedor en la base —vencidos y cancelados incluidos—: la antigüedad de la
    relación comercial es lo que el asesor necesita, y esa no empieza el día
    del contrato vigente.
    """
    indice: dict[str, dict] = {}
    for c in del_periodo:
        if not c.proveedor:
            continue
        registro = indice.setdefault(c.proveedor, {
            "crudo": c.proveedor,
            "nombre": sanear_nombre_proveedor(c.proveedor),
            "contratos": 0,
            "canon_total": 0.0,
            "tipos": set(),
            "sedes": set(),
            "codigos": set(),
            "por_vencer": 0,
        })
        entrada = mapa_tipos.get(c.codigo)
        registro["contratos"] += 1
        registro["canon_total"] += c.canon
        registro["codigos"].add(c.codigo)
        if entrada is None:
            registro["tipos"].add(TIPO_FUERA_DEL_PLANO)
        else:
            registro["sedes"].add(entrada[0])
            registro["tipos"].add(entrada[1])
        if (c.fin - desde).days <= DIAS_POR_VENCER:
            registro["por_vencer"] += 1

    primeros: dict[str, date] = {}
    for c in historicos:
        if c.proveedor in indice:
            actual = primeros.get(c.proveedor)
            if actual is None or c.inicio < actual:
                primeros[c.proveedor] = c.inicio

    # El denominador es el total de contratos DEL PERÍODO, el mismo que usa la
    # recomendación de concentración: si se contaran sólo los que tienen
    # proveedor, dos cifras que el asesor lee juntas no cerrarían entre sí.
    total = len(del_periodo)
    for crudo, registro in indice.items():
        registro["canon_promedio"] = _plata(registro["canon_total"] / registro["contratos"])
        registro["canon_total"] = _plata(registro["canon_total"])
        registro["participacion_pct"] = _pct(registro["contratos"], total)
        registro["desde"] = primeros.get(crudo)
    return sorted(indice.values(), key=lambda r: (-r["canon_total"], r["nombre"], r["crudo"]))


def _armar_proveedores(indice: list[dict]) -> list[dict]:
    """El JSON público de los proveedores: nombre SANEADO y cifras. Ni el
    nombre crudo, ni ``contact_name``, ni ``phone``, ni ``email``, ni
    ``notes`` — esas cuatro columnas de ``suppliers`` no se leen en todo el
    módulo."""
    return [
        {
            "nombre": r["nombre"],
            "espacios": r["contratos"],
            "tipos": sorted(r["tipos"]),
            "sedes": sorted(r["sedes"]),
            "canon_total": r["canon_total"],
            "canon_promedio": r["canon_promedio"],
            "participacion_pct": r["participacion_pct"],
            "desde": r["desde"].isoformat() if r["desde"] else None,
            "contratos_por_vencer_60d": r["por_vencer"],
        }
        for r in indice
    ]


# ─── Movimientos: quién entró y quién salió, mes a mes ────────────────────────

def _armar_movimientos(historicos: list, mapa_tipos: dict, anio_mes: str) -> list[dict]:
    """Doce meses, del más viejo al período consultado inclusive.

    Entradas = contratos que EMPEZARON ese mes; salidas = contratos que
    TERMINARON ese mes. Los dos miran también los cancelados: una cancelación
    es la salida más importante de todas, y el modelo no tiene tabla de
    cancelaciones —``is_active == False`` con la fecha de fin intacta es lo que
    la representa (ver ``routers/spaces.py::cancel_lease``)—. Por eso una
    entrada lleva ``cancelado`` y una salida lleva ``motivo``.
    """
    meses = [_corrido(anio_mes, -i) for i in range(MESES_MOVIMIENTOS - 1, -1, -1)]
    salida = []
    for mes in meses:
        m_desde, m_hasta = rango_del_periodo(mes)
        entradas = []
        salidas = []
        for c in historicos:
            tipo = mapa_tipos.get(c.codigo, (None, TIPO_FUERA_DEL_PLANO))[1]
            if m_desde <= c.inicio <= m_hasta:
                entradas.append({
                    "proveedor": sanear_nombre_proveedor(c.proveedor),
                    "codigo": c.codigo,
                    "tipo": tipo,
                    "canon_mensual": _plata(c.canon),
                    "fecha": c.inicio.isoformat(),
                    "cancelado": not c.activo,
                })
            if m_desde <= c.fin <= m_hasta:
                salidas.append({
                    "proveedor": sanear_nombre_proveedor(c.proveedor),
                    "codigo": c.codigo,
                    "tipo": tipo,
                    "canon_mensual": _plata(c.canon),
                    "fecha": c.fin.isoformat(),
                    "motivo": "cancelacion" if not c.activo else "vencimiento",
                })
        clave = lambda m: (m["fecha"], m["codigo"], m["proveedor"])  # noqa: E731
        salida.append({
            "mes": mes,
            "entradas": sorted(entradas, key=clave),
            "salidas": sorted(salidas, key=clave),
        })
    return salida


# ─── Oportunidades ────────────────────────────────────────────────────────────

def _precios_sugeridos(resumen: list[dict], benchmark: dict) -> dict[str, tuple]:
    """``tipo -> (precio, origen)``.

    El promedio que ESE cliente ya cobra por ese tipo manda (``"cliente"``);
    si no cobra ninguno todavía, el promedio de la plataforma
    (``"benchmark"``); si tampoco hay, no se inventa un precio (``(None,
    None)``) — una oportunidad sin precio sigue siendo una oportunidad.
    """
    precios: dict[str, tuple] = {}
    for fila in resumen:
        tipo = fila["tipo"]
        if fila["canon_promedio"] is not None:
            precios[tipo] = (fila["canon_promedio"], "cliente")
        elif benchmark.get(tipo) is not None:
            precios[tipo] = (_plata(benchmark[tipo]), "benchmark")
        else:
            precios[tipo] = (None, None)
    return precios


def _candidatos(indice: list[dict], tipo: str, codigos_ocupados: set) -> list[dict]:
    """Hasta tres proveedores a los que ofrecerles ese espacio.

    Proveedores del propio cliente que NO ocupan ninguno de los espacios en
    juego. Primero los que ya tienen contratos de ESE tipo (``mismo_tipo``:
    saben lo que compran y cuánto vale), después el resto; dentro de cada
    grupo, el que más canon promedio paga hoy, y los empates por nombre.
    """
    elegibles = [r for r in indice if not (r["codigos"] & codigos_ocupados)]
    elegibles.sort(key=lambda r: (
        0 if tipo in r["tipos"] else 1, -r["canon_promedio"], r["nombre"], r["crudo"],
    ))
    return [
        {
            "proveedor": r["nombre"],
            "canon_actual": r["canon_promedio"],
            "mismo_tipo": tipo in r["tipos"],
        }
        for r in elegibles[:TOPE_CANDIDATOS]
    ]


def _armar_oportunidades(espacios: list[dict], precios: dict, indice: list[dict]) -> list[dict]:
    """Un item por espacio libre o que se libera, del que más plata pone en
    juego al que menos."""
    salida = []
    for e in espacios:
        if e["estado"] == "ocupado":
            continue
        precio, origen = precios.get(e["tipo"], (None, None))
        salida.append({
            "codigo": e["codigo"],
            "sede": e["sede"],
            "tipo": e["tipo"],
            "estado": e["estado"],
            "precio_sugerido": precio,
            "origen_precio": origen,
            "valor_estimado_mensual": _plata(precio or 0),
            "candidatos": _candidatos(indice, e["tipo"], {e["codigo"]}),
        })
    salida.sort(key=lambda o: (-o["valor_estimado_mensual"], o["codigo"]))
    return salida


# ─── Recomendaciones ──────────────────────────────────────────────────────────

def _prioridad(valor: float, ingreso: float) -> str:
    """La regla general: qué tan grande es lo que está en juego COMPARADO CON
    lo que este cliente factura hoy.

    Sin ingreso contratado (un cliente que arranca), cualquier valor positivo
    es alta: todo lo que hay para ganar es todo lo que hay.
    """
    if ingreso <= 0:
        return "alta" if valor > 0 else "baja"
    if valor >= PISO_PRIORIDAD_ALTA * ingreso:
        return "alta"
    if valor >= PISO_PRIORIDAD_MEDIA * ingreso:
        return "media"
    return "baja"


def _rec(tipo: str, clave: str, prioridad: str, valor: float,
         explicacion: str, datos: dict) -> dict:
    return {
        "id": f"{tipo}:{clave}",
        "tipo": tipo,
        "prioridad": prioridad,
        "valor_estimado_mensual": _plata(valor),
        "explicacion": explicacion,
        "datos": datos,
    }


def _rec_espacio_libre(espacios, precios, indice, ingreso) -> list[dict]:
    """Una por TIPO de espacio con algo libre — no una por espacio: al asesor
    se le vende "tres puntas", no tres veces "una punta"."""
    por_tipo: dict[str, list] = {}
    for e in espacios:
        if e["estado"] != "ocupado":
            por_tipo.setdefault(e["tipo"], []).append(e)

    salida = []
    for tipo in sorted(por_tipo):
        libres = por_tipo[tipo]
        codigos = [e["codigo"] for e in libres]
        precio, origen = precios.get(tipo, (None, None))
        valor = (precio or 0) * len(libres)
        candidatos = _candidatos(indice, tipo, set(codigos))
        nombres = [c["proveedor"] for c in candidatos]
        if precio is None:
            plata_txt = "un precio por definir"
            fuente = "todavía sin promedio de referencia"
        else:
            plata_txt = _pesos(precio)
            fuente = ("promedio que ya cobra este cliente" if origen == "cliente"
                      else "promedio de la plataforma")
        explicacion = (
            f"{len(libres)} espacio(s) de tipo {tipo} libre(s) ({_lista(codigos)}): "
            f"ofrecerlos a {_lista(nombres) if nombres else 'un proveedor nuevo'} "
            f"a unos {plata_txt} mensuales cada uno ({fuente})."
        )
        salida.append(_rec(
            "espacio_libre", tipo, _prioridad(valor, ingreso), valor, explicacion,
            {
                "tipo": tipo,
                "espacios": codigos,
                "libres": len(libres),
                "precio_sugerido": precio,
                "origen_precio": origen,
                "candidatos": candidatos,
            },
        ))
    return salida


def _rec_por_vencer(publicados: dict, mapa_tipos: dict, desde: date, ingreso: float) -> list[dict]:
    """Una por espacio cuyo contrato del período vence dentro de la ventana.

    Los códigos FUERA del plano entran también: el espacio no está dibujado,
    pero el contrato existe y la plata se pierde igual si nadie lo renueva.
    """
    salida = []
    for codigo in sorted(publicados):
        contrato = publicados[codigo]
        dias = (contrato.fin - desde).days
        if dias > DIAS_POR_VENCER:
            continue
        tipo = mapa_tipos.get(codigo, (None, TIPO_FUERA_DEL_PLANO))[1]
        proveedor = sanear_nombre_proveedor(contrato.proveedor)
        prioridad = _prioridad(contrato.canon, ingreso)
        if dias <= DIAS_POR_VENCER_URGENTE:
            prioridad = "alta"
        elif prioridad == "baja":
            # Un contrato que vence en dos meses nunca es "baja": la fecha
            # manda, aunque el canon sea chico contra el resto del negocio.
            prioridad = "media"
        explicacion = (
            f"El contrato de {proveedor} en {codigo} ({tipo}) vence el "
            f"{contrato.fin.isoformat()} (en {dias} días): renovar o reasignar; "
            f"canon en juego {_pesos(contrato.canon)}."
        )
        salida.append(_rec(
            "contrato_por_vencer", codigo, prioridad, contrato.canon, explicacion,
            {
                "codigo": codigo,
                "tipo": tipo,
                "proveedor": proveedor,
                "canon_mensual": _plata(contrato.canon),
                "fin": contrato.fin.isoformat(),
                "dias_para_vencer": dias,
            },
        ))
    return salida


def _rec_precio_bajo(espacios: list[dict], resumen: list[dict], ingreso: float) -> list[dict]:
    """Una por tipo donde hay contratos por debajo del promedio del PROPIO
    cliente para ese tipo.

    La comparación es contra el promedio del cliente, nunca contra la tarifa de
    referencia: esa cifra no cruza la frontera y esta recomendación no la
    necesita para decir dónde hay margen en la próxima renovación. Hacen falta
    al menos dos contratos: con uno solo, el promedio ES ese contrato.
    """
    promedios = {f["tipo"]: f["canon_promedio"] for f in resumen}
    salida = []
    for tipo in sorted(promedios):
        promedio = promedios[tipo]
        if promedio is None:
            continue
        contratos = [e for e in espacios if e["tipo"] == tipo and e["contrato"] is not None]
        if len(contratos) < 2:
            continue
        bajos = [e for e in contratos if e["contrato"]["canon_mensual"] < promedio]
        if not bajos:
            continue
        codigos = sorted(e["codigo"] for e in bajos)
        brecha = _plata(sum(promedio - e["contrato"]["canon_mensual"] for e in bajos))
        explicacion = (
            f"{len(bajos)} contrato(s) de {tipo} cobran por debajo del promedio del "
            f"cliente para ese tipo ({_pesos(promedio)}): subir el canon en la próxima "
            f"renovación; brecha {_pesos(brecha)} mensuales."
        )
        salida.append(_rec(
            "precio_bajo_tarifa", tipo, _prioridad(brecha, ingreso), brecha, explicacion,
            {
                "tipo": tipo,
                "canon_promedio": promedio,
                "contratos_bajo_promedio": len(bajos),
                "codigos": codigos,
                "brecha_total": brecha,
            },
        ))
    return salida


def _rec_concentracion(indice: list[dict], total_contratos: int) -> list[dict]:
    """Una por proveedor del que dependa demasiada cartera.

    Con un solo contrato en todo el cliente no hay concentración que
    diversificar: hay un cliente que arranca.
    """
    if total_contratos < 2:
        return []
    salida = []
    for r in indice:
        participacion = r["participacion_pct"] or 0.0
        if participacion < UMBRAL_CONCENTRACION_PCT:
            continue
        prioridad = "alta" if participacion >= UMBRAL_CONCENTRACION_ALTA_PCT else "media"
        explicacion = (
            f"{r['contratos']} de {total_contratos} contratos activos "
            f"({_num(participacion)} %) dependen de {r['nombre']}: diversificar; "
            f"canon en juego {_pesos(r['canon_total'])}."
        )
        salida.append(_rec(
            "concentracion_proveedor", r["nombre"], prioridad, r["canon_total"], explicacion,
            {
                "proveedor": r["nombre"],
                "contratos": r["contratos"],
                "contratos_activos_total": total_contratos,
                "participacion_pct": participacion,
                "canon_total": r["canon_total"],
            },
        ))
    return salida


def _rec_sede_subutilizada(sedes: list[dict], espacios: list[dict], precios: dict,
                           ingreso: float) -> list[dict]:
    """Una por sede que esté muy por debajo del promedio del propio cliente.

    Con una sola sede no hay contra qué comparar: el promedio del cliente ES esa
    sede.
    """
    if len(sedes) < 2:
        return []
    total = len(espacios)
    ocupados = sum(1 for e in espacios if e["estado"] != "libre")
    promedio = _pct(ocupados, total)
    if promedio is None:
        return []

    salida = []
    for fila in sedes:
        pct = fila["ocupacion_pct"]
        if pct is None or pct > promedio - BRECHA_SEDE_PUNTOS:
            continue
        libres = [e for e in espacios if e["sede"] == fila["sede"] and e["estado"] == "libre"]
        codigos = [e["codigo"] for e in libres]
        valor = sum((precios.get(e["tipo"], (None, None))[0] or 0) for e in libres)
        explicacion = (
            f"{fila['sede']} está al {_num(pct)} % de ocupación, "
            f"{_num(promedio - pct)} puntos por debajo del promedio del cliente "
            f"({_num(promedio)} %): concentrar la venta ahí; {len(libres)} espacios "
            f"libres por {_pesos(valor)} mensuales."
        )
        salida.append(_rec(
            "sede_subutilizada", fila["sede"], _prioridad(valor, ingreso), valor, explicacion,
            {
                "sede": fila["sede"],
                "ocupacion_pct": pct,
                "ocupacion_promedio_cliente_pct": promedio,
                "libres": len(libres),
                "espacios_libres": codigos,
            },
        ))
    return salida


def _rec_sin_tarifa(resumen: list[dict]) -> list[dict]:
    """UNA sola, con todos los tipos sin tarifa de referencia configurada.

    Vale 0 y es siempre baja: no hay plata en juego, hay una medición que no se
    puede hacer (el spread de ``/metricas`` sale ``null`` sin tarifa). Los
    tipos salen por su nombre; el valor de ninguna tarifa sale nunca.
    """
    tipos = [f["tipo"] for f in resumen if not f["tarifa_configurada"]]
    if not tipos:
        return []
    explicacion = (
        f"Sin tarifa de referencia para {_lista(tipos)}: cargar tarifas para medir "
        f"el spread."
    )
    return [_rec("sin_tarifa", "todos", "baja", 0.0, explicacion, {"tipos": tipos})]


def _rec_arranque(espacios: list[dict], benchmark: dict) -> list[dict]:
    """La ÚNICA recomendación cuando el cliente no tiene un solo contrato en el
    período.

    Las demás no se generan: sin contratos no hay promedio propio, ni
    concentración, ni renovación que negociar, y una lista de seis
    recomendaciones vacías no le dice nada al asesor. Ésta sí: cuántos espacios
    hay para vender y cuánto valen al promedio de la plataforma.
    """
    por_tipo: dict[str, int] = {}
    for e in espacios:
        por_tipo[e["tipo"]] = por_tipo.get(e["tipo"], 0) + 1
    espacios_por_tipo = [{"tipo": t, "total": por_tipo[t]} for t in sorted(por_tipo)]
    valor = sum(benchmark.get(e["tipo"], 0) for e in espacios)
    detalle = _lista(f"{f['tipo']}: {f['total']}" for f in espacios_por_tipo)
    explicacion = (
        f"Sin contratos activos en el período: {len(espacios)} espacios "
        f"comercializables ({detalle or 'ninguno en el plano'}) por un potencial de "
        f"{_pesos(valor)} mensuales al promedio de la plataforma."
    )
    return [_rec("arranque", "todos", "alta", valor, explicacion, {
        "espacios_por_tipo": espacios_por_tipo,
        "benchmark_plataforma": dict(benchmark),
    })]


def _armar_recomendaciones(espacios, sedes, resumen, indice, publicados, precios,
                           benchmark, mapa_tipos, del_periodo, desde) -> list[dict]:
    """La lista priorizada: qué proponerle HOY a este cliente.

    Orden final: prioridad (alta, media, baja), después lo que más plata pone
    en juego, y los empates por ``id`` para que dos consultas seguidas devuelvan
    exactamente lo mismo.
    """
    ingreso = sum(c.canon for c in del_periodo)
    if not del_periodo:
        return _rec_arranque(espacios, benchmark)

    recomendaciones = []
    recomendaciones += _rec_espacio_libre(espacios, precios, indice, ingreso)
    recomendaciones += _rec_por_vencer(publicados, mapa_tipos, desde, ingreso)
    recomendaciones += _rec_precio_bajo(espacios, resumen, ingreso)
    recomendaciones += _rec_concentracion(indice, len(del_periodo))
    recomendaciones += _rec_sede_subutilizada(sedes, espacios, precios, ingreso)
    recomendaciones += _rec_sin_tarifa(resumen)
    recomendaciones.sort(key=lambda r: (
        _ORDEN_PRIORIDAD[r["prioridad"]], -r["valor_estimado_mensual"], r["id"],
    ))
    return recomendaciones


# ─── La única puerta ──────────────────────────────────────────────────────────

def armar_detalle(slug: str, anio_mes: str) -> dict:
    """El cuerpo completo de ``GET /api/plataforma/clientes/{slug}/detalle``.

    Levanta ``ClienteDesconocido`` (el slug no está en el registro — el router
    lo convierte en 404 con el texto fijo de siempre) o ``BaseIlegible`` (la
    base de negocio no se dejó leer — 503 con ``ERROR_BASE_ILEGIBLE``).

    La base del cliente se abre UNA vez y se lee TODO lo que hace falta en esa
    pasada (plano, filas de ``spaces``, contratos y tarifas); el resto es
    aritmética en memoria. Sin caché: cada consulta se calcula y cada consulta
    se anota en la bitácora.
    """
    from app.clientes import buscar, sesion_de
    from app.plataforma_estado import estado_de

    cliente = buscar(slug)
    if cliente is None:
        raise ClienteDesconocido(slug)

    desde, hasta = rango_del_periodo(anio_mes)

    try:
        db = sesion_de(cliente)
        try:
            sedes_con_plano, _caras, mapa_tipos = _numeros_del_layout(db)
            fixtures = _fixtures_por_codigo(db)
            geo = _zona_y_area(db)
            crudos = _contratos_del_cliente(db)
            tarifas = _tarifas_limpias(db)
        finally:
            # Sólo se leyó: nada que comitear ni que revertir.
            db.close()
    except Exception as e:  # noqa: BLE001
        log.exception("No se pudo leer la base del cliente %s para el detalle", slug)
        raise BaseIlegible(slug) from e

    historicos = [_Contrato(*fila) for fila in crudos]
    del_periodo = [
        c for c in historicos if _del_periodo(c.inicio, c.fin, c.activo, desde, hasta)
    ]

    por_codigo: dict[str, list] = {}
    for c in del_periodo:
        por_codigo.setdefault(c.codigo, []).append(c)
    publicados = {codigo: _contrato_publicado(lista) for codigo, lista in por_codigo.items()}

    espacios = _armar_espacios(mapa_tipos, fixtures, geo, publicados, desde, hasta)
    sedes = _armar_sedes(espacios)
    resumen = _armar_resumen_por_tipo(espacios, mapa_tipos, tarifas)
    indice = _indice_de_proveedores(del_periodo, historicos, mapa_tipos, desde)
    benchmark = benchmark_por_tipo(anio_mes)
    precios = _precios_sugeridos(resumen, benchmark)

    estado, _motivo = estado_de(cliente.slug)

    return {
        "cliente": {
            "slug": cliente.slug,
            "nombre": cliente.nombre,
            "estado_cuenta": estado,
        },
        "periodo": anio_mes,
        "desde": desde.isoformat(),
        "hasta": hasta.isoformat(),
        "generado_en": _ahora_iso(),
        "sedes_con_plano": sedes_con_plano,
        "sedes": sedes,
        "espacios": espacios,
        "contratos_fuera_del_plano": sum(
            1 for c in del_periodo if c.codigo not in mapa_tipos),
        "resumen_por_tipo": resumen,
        "proveedores": _armar_proveedores(indice),
        "movimientos": _armar_movimientos(historicos, mapa_tipos, anio_mes),
        "benchmark_plataforma": benchmark,
        "oportunidades": _armar_oportunidades(espacios, precios, indice),
        "recomendaciones": _armar_recomendaciones(
            espacios, sedes, resumen, indice, publicados, precios, benchmark,
            mapa_tipos, del_periodo, desde,
        ),
    }
