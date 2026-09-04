"""Serie de tiempo de las métricas del negocio, para la consola (Fase 5).

La Fase 4 dejó una foto: ``GET /api/plataforma/metricas`` contesta «cómo está el
negocio en el mes que me pidas», recorriendo las N bases en vivo. Pero el mes
pasado ya no se puede recorrer: los contratos de agosto no están guardados como
estaban en agosto, están como están HOY. Preguntarle a la base de un cliente por
un mes viejo devuelve la verdad de hoy proyectada hacia atrás, no la de
entonces. Sin historia persistida, «¿estamos mejorando o empeorando?» —la
primera pregunta de una asesoría recurrente— es literalmente incontestable.

Este módulo es esa historia. Tres piezas:

* **``persistir_snapshots``** — el write-through. Cada vez que
  ``plataforma_metricas.calcular`` recorre las bases de verdad, deja en el
  registro una fila de ``snapshot_metricas`` por cliente legible más la fila
  consolidada. Se cuelga del CÁLCULO y no del endpoint: un acierto del caché de
  5 minutos no recalculó nada y no tiene crudos que guardar.
* **``cerrar_mes_anterior``** — el cierre. El ciclo de mantenimiento que ya
  existe (``main._run_lease_maintenance``, cada 12 h) se asegura de que el mes
  ya cerrado tenga sus filas aunque nadie haya abierto la consola ese mes. Sin
  esto, la serie tendría huecos justamente en los meses tranquilos.
* **``serie``** — la lectura. Devuelve N meses consecutivos terminando en el mes
  en curso, siempre completos (un mes sin fila sale con ``sin_dato``, no se
  omite: un hueco callado en un gráfico de línea se lee como una caída).

**La regla del congelado.** El mes EN CURSO se sobreescribe en cada captura —
converge al valor final a medida que el mes avanza, y la última escritura antes
de que el mes cambie es la definitiva—. Un mes ya PASADO se inserta sólo si
falta: la primera captura es la que vale, porque cualquier recálculo posterior
mira la base de hoy. Por eso una fila vieja no se pisa nunca.

**Qué NO hace este módulo:** no abre la base de ningún cliente. Ni una. Lee y
escribe únicamente el registro (``sesion_registro``); los datos de negocio le
llegan ya agregados desde ``plataforma_metricas``, que es el único módulo con
permiso —acotado y declarado— para tocarlas, y sólo en lectura.

**Y la privacidad se aplica AL LEER.** La tabla guarda crudos; la supresión de
celda chica (K=3) y el saneo del nombre del proveedor los aplica
``publicar_fila`` en cada lectura, reusando las funciones de
``plataforma_metricas``. Un solo lugar donde el crudo se vuelve público — si
mañana el umbral sube a 5, el histórico entero obedece sin tocar una fila.
"""
import json
import logging
from datetime import datetime, timezone

from app.plataforma_metricas import (
    TOPE_PROVEEDORES,
    _pct,
    _plata,
    _suprimir_celda_chica,
    _top,
    periodo_actual,
    rango_del_periodo,
)

log = logging.getLogger("recabra.plataforma.tendencia")

# El slug reservado de la fila del total de la plataforma. Los guiones bajos de
# los extremos lo dejan fuera de `SLUG_VALIDO` (`clientes.py` exige empezar por
# letra): ningún cliente real puede llamarse así, así que la fila consolidada no
# puede colisionar con la de nadie.
CONSOLIDADO_SLUG = "__consolidado__"
NOMBRE_CONSOLIDADO = "Consolidado"

# Un año es el horizonte natural de una asesoría —compara contra el mismo mes
# del año pasado— y entra cómodo en un gráfico de línea sin apretar las
# etiquetas. El tope de 24 no es de rendimiento (son 24 filas de una tabla
# indexada) sino de lectura: más puntos en el mismo ancho es una línea que ya no
# se puede leer.
MESES_DEFAULT = 12
MESES_MAXIMO = 24

ORIGEN_VISTA = "vista"
ORIGEN_CIERRE = "cierre"


class MesesInvalidos(ValueError):
    """El parámetro ``meses`` no está entre 1 y ``MESES_MAXIMO``."""


class ClienteDesconocido(LookupError):
    """El ``cliente`` pedido no es el consolidado ni un slug del registro."""


# ─── Aritmética de meses ──────────────────────────────────────────────────────

def periodo_anterior(anio_mes: str) -> str:
    """El mes calendario anterior a ``YYYY-MM``, cruzando el año si hace falta.

    Se valida con ``rango_del_periodo`` —la misma puerta que usa el endpoint de
    métricas— para que un período basura levante ``PeriodoInvalido`` acá y no se
    convierta más adelante en una consulta contra un ``periodo`` inventado.
    """
    desde, _hasta = rango_del_periodo(anio_mes)
    if desde.month == 1:
        return f"{desde.year - 1:04d}-12"
    return f"{desde.year:04d}-{desde.month - 1:02d}"


def ultimos_periodos(n: int, hasta: str) -> list[str]:
    """``n`` meses consecutivos que TERMINAN en ``hasta``, del más viejo al más nuevo.

    El orden es el del eje de un gráfico de línea (el tiempo corre hacia la
    derecha), y se arma acá y no en el frontend para que la serie llegue ya
    ordenada: ordenar por el string ``YYYY-MM`` funciona, pero es una invariante
    silenciosa que se rompe el día que el formato cambie.
    """
    periodos = [hasta]
    for _ in range(max(0, n - 1)):
        periodos.append(periodo_anterior(periodos[-1]))
    return list(reversed(periodos))


def _ahora_utc() -> datetime:
    return datetime.now(timezone.utc)


def _iso_z(momento: datetime | None) -> str | None:
    """``datetime`` → ISO con ``Z``, tolerando el naive que devuelve SQLite.

    SQLite no guarda la zona horaria: una columna ``DateTime(timezone=True)``
    vuelve del disco sin ``tzinfo`` aunque se haya escrito en UTC. Se la
    reponemos, porque todo el repo fecha en UTC y un ISO sin sufijo lo interpreta
    el navegador como hora local — el mes en curso podría aparecer capturado
    "mañana".
    """
    if momento is None:
        return None
    if momento.tzinfo is None:
        momento = momento.replace(tzinfo=timezone.utc)
    return momento.astimezone(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def _recortar_top(conteos: dict[str, int]) -> dict[str, int]:
    """Las ``TOPE_PROVEEDORES`` entradas más altas, con el orden de ``_top``.

    Se recorta ANTES de guardar: el JSON público nunca muestra más de cinco, así
    que persistir la cola entera sería guardar para siempre el nombre de
    proveedores que nadie va a ver — dato de un tercero sin propósito, que es
    justo lo que la frontera de la fase no quiere acumular.

    El criterio de orden es el mismo de ``_top`` —conteo descendente, empates por
    nombre alfabético— y se resuelve con el nombre ORIGINAL, que es el que
    agrupó. Recortar por el nombre saneado podría fundir dos proveedores
    distintos en uno y el conteo mentiría.
    """
    ordenados = sorted(conteos.items(), key=lambda par: (-par[1], par[0]))
    return dict(ordenados[:TOPE_PROVEEDORES])


# ─── Escritura: el write-through y el cierre ──────────────────────────────────

def persistir_snapshots(
    anio_mes: str,
    clientes: list[dict],
    crudos_por_slug: dict[str, dict],
    origen: str,
) -> None:
    """Deja (o actualiza) las filas de ``snapshot_metricas`` de ``anio_mes``.

    Recibe lo que ``calcular`` ya tiene en la mano: las filas ``clientes`` de la
    respuesta —de donde sale cuántos fallaron— y los ``crudos`` de cada cliente
    que SÍ se pudo leer, indexados por slug. No recalcula nada ni vuelve a abrir
    ninguna base.

    **Un cliente con error no recibe fila.** Escribirle ceros sería inventar un
    mes en el que ese supermercado no tuvo contratos, y esa mentira quedaría
    congelada para siempre en el gráfico. Su serie tiene un hueco ese mes, que es
    exactamente la verdad: no se sabe.

    **Nunca propaga.** Si la persistencia falla, ``/metricas`` responde igual: la
    foto del panel no puede depender de que la historia se haya podido guardar.
    El detalle va al log, con traza.

    **La excepción del congelado (BUG-1).** Un mes YA PASADO se inserta sólo si
    falta — esa es la regla, y sigue valiendo para cada fila POR CLIENTE: una ya
    presente nunca se toca acá, aunque el mes tenga altas nuevas. Pero la fila
    ``__consolidado__`` es distinta: es una SUMA de esas filas, y una suma que no
    coincide con sus sumandos está mal, congelada o no. Si esta captura de un mes
    pasado INSERTA al menos una fila por cliente que todavía no tenía — un
    cliente que se dio de alta con historia retroactiva, o cuya base estuvo
    rota durante el cierre y ahora se pudo leer — la consolidada de ESE período
    se reconstruye a partir de TODAS las filas por cliente ya persistidas (no
    sólo las de esta captura: una captura de mes pasado puede traer un
    subconjunto distinto al que quedó congelado en el cierre). El mes en curso
    sigue con su regla de siempre (converge en cada captura); nada de esto lo
    cambia.
    """
    from app.clientes import sesion_registro
    from app.models.plataforma import SnapshotMetricas
    from app.plataforma_metricas import consolidar_crudos

    es_mes_en_curso = anio_mes == periodo_actual()
    con_error = sum(1 for c in clientes if c.get("error") is not None)

    # ── Las filas por cliente ─────────────────────────────────────────────────
    a_escribir: list[tuple[str, dict]] = []
    for slug, crudos in crudos_por_slug.items():
        a_escribir.append((slug, {
            "sedes_con_plano": crudos["sedes"],
            "espacios_comercializables": crudos["caras"],
            "ocupadas": crudos["ocupadas"],
            "contratos_activos": crudos["contratos"],
            "canon_total": float(crudos["canon_total"]),
            "usuarios": len(crudos["usuarios"]),
            "proveedores_json": json.dumps(_recortar_top(crudos["proveedores"]), ensure_ascii=False),
            "clientes_incluidos": 1,
            "clientes_con_error": None,
        }))

    # ── Y la consolidada ──────────────────────────────────────────────────────
    #
    # Se guardan SUMAS, nunca promedios: el mismo ponderado que usa
    # `consolidar_agregado` para el JSON público de `/metricas`, vía el helper
    # compartido `consolidar_crudos` — acá SIN K=3 (esto es un crudo, no un
    # público; K=3 se aplica recién al leer, en `publicar_fila`). Guardar el
    # promedio ya calculado sería quedarse sin los sumandos, y con eso la única
    # cuenta posible pasaría a ser el promedio de promedios — la equivocada (una
    # sede chica al 100 % no compensa a una grande al 10 %).
    def _consolidado_crudo_a_valores(crudo: dict, clientes_incluidos: int) -> dict:
        return {
            "sedes_con_plano": crudo["sedes"],
            "espacios_comercializables": crudo["caras"],
            "ocupadas": crudo["ocupadas"],
            "contratos_activos": crudo["contratos"],
            "canon_total": float(crudo["canon_total"]),
            "usuarios": len(crudo["usuarios"]),
            "proveedores_json": json.dumps(_recortar_top(crudo["proveedores"]), ensure_ascii=False),
            "clientes_incluidos": clientes_incluidos,
            "clientes_con_error": con_error,
        }

    consolidado_crudo = consolidar_crudos(list(crudos_por_slug.values()))
    valores_consolidado = _consolidado_crudo_a_valores(consolidado_crudo, len(crudos_por_slug))
    a_escribir.append((CONSOLIDADO_SLUG, valores_consolidado))

    ahora = _ahora_utc()
    reg = sesion_registro()
    try:
        existentes = {
            f.cliente_slug: f
            for f in reg.query(SnapshotMetricas)
            .filter(SnapshotMetricas.periodo == anio_mes)
            .all()
        }

        # BUG-1: se detecta acá si esta captura de un mes PASADO inserta al
        # menos una fila por cliente que faltaba. Si sí, la consolidada de este
        # período no puede quedar congelada con un total viejo -- se
        # reconstruye más abajo, DESPUÉS de que las altas de este bucle ya
        # estén escritas.
        hubo_alta = False
        for slug, valores in a_escribir:
            if slug == CONSOLIDADO_SLUG:
                continue  # se resuelve aparte, una vez que se sabe `hubo_alta`
            fila = existentes.get(slug)
            if fila is None:
                reg.add(SnapshotMetricas(
                    cliente_slug=slug, periodo=anio_mes, origen=origen,
                    capturado_en=ahora, **valores,
                ))
                if not es_mes_en_curso:
                    hubo_alta = True
            elif es_mes_en_curso:
                # Converge: el mes todavía no terminó, y el número de ahora es
                # más completo que el de esta mañana.
                for campo, valor in valores.items():
                    setattr(fila, campo, valor)
                fila.origen = origen
                fila.capturado_en = ahora
            # Mes pasado con fila ya puesta: se deja como está. Congelada --
            # esto NO cambia con el arreglo de BUG-1, que sólo toca la fila
            # consolidada.

        fila_consolidado = existentes.get(CONSOLIDADO_SLUG)
        if fila_consolidado is None:
            reg.add(SnapshotMetricas(
                cliente_slug=CONSOLIDADO_SLUG, periodo=anio_mes, origen=origen,
                capturado_en=ahora, **valores_consolidado,
            ))
        elif es_mes_en_curso:
            # Comportamiento de siempre: el mes en curso converge en cada
            # captura, con el total recién calculado de esta vuelta.
            for campo, valor in valores_consolidado.items():
                setattr(fila_consolidado, campo, valor)
            fila_consolidado.origen = origen
            fila_consolidado.capturado_en = ahora
        elif hubo_alta:
            # BUG-1: mes pasado, consolidada ya existía (congelada), pero esta
            # captura acaba de insertar al menos una fila por cliente nueva. El
            # total no puede contradecir a sus sumandos -- se reconstruye a
            # partir de TODAS las filas por cliente del período, ya persistidas
            # (las recién insertadas arriba incluidas: hace falta `flush` para
            # que la consulta las vea sin haber hecho aún el commit).
            reg.flush()
            filas_clientes = (
                reg.query(SnapshotMetricas)
                .filter(
                    SnapshotMetricas.periodo == anio_mes,
                    SnapshotMetricas.cliente_slug != CONSOLIDADO_SLUG,
                )
                .all()
            )
            slugs_persistidos = {f.cliente_slug for f in filas_clientes}

            if slugs_persistidos <= set(crudos_por_slug.keys()):
                # Esta captura leyó (en memoria, con ids reales de usuario y el
                # conteo COMPLETO de cada proveedor) a todos los clientes que
                # tienen fila persistida este período: reconstrucción EXACTA,
                # usuarios y proveedores incluidos.
                crudo_reconstruido = consolidar_crudos(
                    [crudos_por_slug[slug] for slug in slugs_persistidos]
                )
                valores_reconstruidos = _consolidado_crudo_a_valores(
                    crudo_reconstruido, len(slugs_persistidos))
            else:
                # Hay alguna fila persistida de un cliente que ESTA captura no
                # leyó (su base está rota ahora, pero estaba legible cuando se
                # guardó su fila -- o esta captura es justamente la del cierre
                # de otro mes y no lo tocó). Se suma desde DISCO: exacto para
                # ingreso/ocupación/contratos -- los campos load-bearing del
                # bug -- pero aproximado para usuarios y proveedores, porque en
                # disco sólo sobrevive el CONTEO de usuarios (no los ids, no se
                # puede deduplicar con exactitud entre clientes) y el TOP-5 de
                # proveedores de cada cliente (no su conteo completo). Se
                # documenta como limitación conocida en ESTADO.md.
                valores_reconstruidos = _reconstruir_consolidado_desde_disco(
                    filas_clientes, con_error)

            for campo, valor in valores_reconstruidos.items():
                setattr(fila_consolidado, campo, valor)
            fila_consolidado.origen = origen
            fila_consolidado.capturado_en = ahora
        # Mes pasado, consolidada ya presente y sin altas nuevas: se deja como
        # está. Congelada -- el comportamiento previo al arreglo, intacto.

        # Una sola transacción: o queda el mes entero o no queda nada. Un
        # consolidado escrito junto a filas por cliente a medio guardar sería
        # peor que no tener el mes.
        reg.commit()
    except Exception:  # noqa: BLE001
        log.exception("No se pudo persistir el snapshot de %s", anio_mes)
        try:
            reg.rollback()
        except Exception:  # noqa: BLE001
            pass
    finally:
        reg.close()


def _reconstruir_consolidado_desde_disco(filas_clientes: list, con_error: int) -> dict:
    """Suma APROXIMADA del consolidado a partir de filas YA persistidas (BUG-1).

    Se usa sólo cuando esta captura no tiene en memoria los crudos de TODOS los
    clientes con fila persistida ese período (ver ``persistir_snapshots``).
    Ingreso, ocupación, contratos y sedes son exactos (Σ de columnas guardadas
    tal cual). Usuarios y proveedores son la limitación conocida: en disco cada
    fila sólo guarda el CONTEO de usuarios (no los ids que permitirían
    deduplicar entre clientes) y el TOP-5 de proveedores (no el conteo
    completo), así que no hay forma de reconstruir esas dos cifras con
    exactitud desde acá. Se prioriza que los campos load-bearing del bug
    (ingreso/ocupación/contratos) queden bien, que es lo que la fase existe
    para garantizar.
    """
    proveedores_aprox: dict[str, int] = {}
    usuarios_aprox: set = set()
    sedes = caras = ocupadas = contratos = 0
    canon_total = 0.0
    for f in filas_clientes:
        sedes += f.sedes_con_plano or 0
        caras += f.espacios_comercializables or 0
        ocupadas += f.ocupadas or 0
        contratos += f.contratos_activos or 0
        canon_total += float(f.canon_total or 0.0)
        try:
            top_disco = json.loads(f.proveedores_json or "{}")
        except (ValueError, TypeError):
            top_disco = {}
        if isinstance(top_disco, dict):
            for nombre, cuantos in top_disco.items():
                proveedores_aprox[nombre] = proveedores_aprox.get(nombre, 0) + int(cuantos)
        # Sin ids reales para deduplicar entre clientes: un placeholder único
        # por cliente y posición, para no fusionar por error usuarios de
        # clientes distintos ni tampoco perder el conteo guardado.
        usuarios_aprox.update(
            f"__reconstruido__{f.cliente_slug}#{i}" for i in range(f.usuarios or 0)
        )

    return {
        "sedes_con_plano": sedes,
        "espacios_comercializables": caras,
        "ocupadas": ocupadas,
        "contratos_activos": contratos,
        "canon_total": canon_total,
        "usuarios": len(usuarios_aprox),
        "proveedores_json": json.dumps(_recortar_top(proveedores_aprox), ensure_ascii=False),
        "clientes_incluidos": len(filas_clientes),
        "clientes_con_error": con_error,
    }


def cerrar_mes_anterior() -> None:
    """Se asegura de que el mes YA CERRADO tenga sus filas. Lo llama el mantenimiento.

    Sin esto, la serie dependería de que alguien hubiera abierto la consola: un
    mes en el que nadie miró el panel quedaría como un hueco permanente, porque
    calcularlo después daría los contratos de hoy y no los de aquel mes.

    Falta el mes si no está la fila consolidada **o** si falta la de algún
    cliente del registro. Cuando falta, se llama a ``calcular``, que recorre las
    bases y dispara el write-through con ``origen="cierre"``. Cuando no falta, no
    hace absolutamente nada — que es lo normal en casi todas las corridas.

    No escribe en ninguna base de cliente y no propaga: el mantenimiento de
    contratos y recordatorios es lo importante de ese ciclo, y un problema con el
    histórico no puede frenarlo.
    """
    from app.clientes import sesion_registro
    from app.models.models import ClienteRow
    from app.models.plataforma import SnapshotMetricas

    try:
        mes = periodo_anterior(periodo_actual())

        reg = sesion_registro()
        try:
            esperados = {f.slug for f in reg.query(ClienteRow.slug).all()}
            presentes = {
                f.cliente_slug
                for f in reg.query(SnapshotMetricas.cliente_slug)
                .filter(SnapshotMetricas.periodo == mes)
                .all()
            }
        finally:
            reg.close()

        if CONSOLIDADO_SLUG in presentes and esperados <= presentes:
            return

        # `calcular` ya es tolerante a fallos por cliente —una base rota deja su
        # fila con error y el resto sigue—, así que el cierre hereda esa
        # tolerancia sin repetirla acá.
        from app.plataforma_metricas import calcular
        calcular(mes, origen=ORIGEN_CIERRE)
    except Exception:  # noqa: BLE001
        log.exception("No se pudo cerrar el mes anterior de la serie de métricas")


# ─── Lectura: de la fila cruda al JSON público ────────────────────────────────

def publicar_fila(fila) -> dict:
    """Los agregados PÚBLICOS de una fila de ``snapshot_metricas``.

    Es la única puerta por la que un crudo guardado se vuelve un número
    publicado, y aplica exactamente las mismas reglas que el endpoint de métricas
    porque usa exactamente las mismas funciones: ``_pct``, ``_plata``, ``_top``
    (que sanea el nombre del proveedor) y ``_suprimir_celda_chica`` (K=3). No hay
    una sola fórmula reescrita acá — el día que el umbral de supresión cambie, el
    histórico entero cambia con él, sin tocar una fila guardada.

    **Ni ``contratos_activos`` ni ``ocupadas`` salen jamás.** Son el numerador y
    el denominador de la propia supresión: publicarlos al lado de los importes en
    ``null`` diría "acá hay 2 contratos", que es la mitad de lo que la regla
    esconde. Salen sólo transformados (``ocupacion_pct``) o como el conteo por
    proveedor del top, que ya pasó por K=3.
    """
    try:
        proveedores = json.loads(fila.proveedores_json or "{}")
    except (ValueError, TypeError):
        # Un JSON ilegible no puede tumbar la serie entera: ese mes va sin top.
        log.exception("proveedores_json ilegible en el snapshot %s/%s",
                      fila.cliente_slug, fila.periodo)
        proveedores = {}
    if not isinstance(proveedores, dict):
        proveedores = {}

    contratos = fila.contratos_activos or 0
    canon_total = float(fila.canon_total or 0.0)
    publicas = {
        "sedes_con_plano": fila.sedes_con_plano,
        "espacios_comercializables": fila.espacios_comercializables,
        "ocupacion_pct": _pct(fila.ocupadas or 0, fila.espacios_comercializables or 0),
        "canon_promedio_mensual": _plata(canon_total / contratos) if contratos else None,
        "ingreso_contratado_mes": _plata(canon_total),
        "top_proveedores": _top({str(n): int(c) for n, c in proveedores.items()}),
        "usuarios_con_cuenta": fila.usuarios,
    }
    return _suprimir_celda_chica(publicas, contratos)


def _mes_vacio(periodo: str, actual: str) -> dict:
    """Un mes sin fila: presente en la serie, y honesto sobre que no sabe nada.

    El mes se devuelve igual —no se omite— porque un gráfico de línea al que le
    falta un punto en el medio dibuja una recta entre los vecinos, y eso miente
    con más convicción que un hueco. ``top_proveedores`` va como lista vacía y no
    ``null`` por la misma razón que en ``_suprimir_celda_chica``: el frontend lo
    recorre sin preguntar.
    """
    return {
        "periodo": periodo,
        "parcial": periodo == actual,
        "sin_dato": True,
        "capturado_en": None,
        "origen": None,
        "clientes_incluidos": None,
        "clientes_con_error": None,
        "sedes_con_plano": None,
        "espacios_comercializables": None,
        "ocupacion_pct": None,
        "canon_promedio_mensual": None,
        "ingreso_contratado_mes": None,
        "top_proveedores": [],
        "usuarios_con_cuenta": None,
    }


def serie(cliente: str, meses: int) -> dict:
    """El cuerpo de ``GET /api/plataforma/tendencia``. Lee SÓLO el registro.

    Siempre devuelve ``meses`` entradas consecutivas terminando en el mes en
    curso (UTC), de la más vieja a la más nueva. El mes en curso viene marcado
    ``parcial``: sus números son los de un mes que todavía no terminó, y
    compararlo de igual a igual contra un mes cerrado es la lectura equivocada
    más fácil de hacer con un gráfico así.

    Sin caché, a propósito. Son ``meses`` filas de una tabla indexada del
    registro —no hay N bases que recorrer, que es lo que el caché de métricas
    existe para evitar— y a cambio el operador ve en el acto el efecto de su
    propio refresco de métricas.
    """
    from app.clientes import sesion_registro
    from app.models.models import ClienteRow
    from app.models.plataforma import SnapshotMetricas

    try:
        cuantos = int(meses)
    except (TypeError, ValueError) as e:
        raise MesesInvalidos(f"Los meses van de 1 a {MESES_MAXIMO}.") from e
    if not (1 <= cuantos <= MESES_MAXIMO):
        raise MesesInvalidos(f"Los meses van de 1 a {MESES_MAXIMO}.")

    slug = (cliente or "").strip()
    actual = periodo_actual()
    periodos = ultimos_periodos(cuantos, actual)

    reg = sesion_registro()
    try:
        if slug == CONSOLIDADO_SLUG:
            nombre = NOMBRE_CONSOLIDADO
        else:
            fila_cliente = reg.query(ClienteRow).filter(ClienteRow.slug == slug).first()
            if fila_cliente is None:
                # Texto FIJO y el mismo que usa el PATCH de estados: no dice si
                # el slug existe pero está vacío, ni devuelve nada del driver.
                raise ClienteDesconocido("No hay un cliente con ese código.")
            nombre = fila_cliente.nombre

        filas = {
            f.periodo: f
            for f in reg.query(SnapshotMetricas)
            .filter(
                SnapshotMetricas.cliente_slug == slug,
                SnapshotMetricas.periodo.in_(periodos),
            )
            .all()
        }
    finally:
        reg.close()

    puntos = []
    for periodo in periodos:
        fila = filas.get(periodo)
        if fila is None:
            puntos.append(_mes_vacio(periodo, actual))
            continue
        punto = {
            "periodo": periodo,
            "parcial": periodo == actual,
            "sin_dato": False,
            "capturado_en": _iso_z(fila.capturado_en),
            "origen": fila.origen,
            "clientes_incluidos": fila.clientes_incluidos,
            "clientes_con_error": fila.clientes_con_error,
        }
        punto.update(publicar_fila(fila))
        puntos.append(punto)

    return {
        "cliente": slug,
        "nombre": nombre,
        "meses": cuantos,
        "desde": periodos[0],
        "hasta": periodos[-1],
        "periodo_actual": actual,
        "generado_en": _iso_z(_ahora_utc()),
        "serie": puntos,
    }
