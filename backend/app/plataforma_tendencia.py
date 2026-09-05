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

**Los NÚMEROS se protegen al LEER; el NOMBRE del proveedor, al ESCRIBIR.** La
tabla guarda los conteos crudos y la supresión de celda chica (K=3) la aplica
``publicar_fila`` en cada lectura, reusando las funciones de
``plataforma_metricas``: un solo lugar donde el crudo se vuelve público, y si
mañana el umbral sube a 5 el histórico entero obedece sin tocar una fila. El
nombre del proveedor no: baja a disco YA SANEADO (``_recortar_top``), porque un
correo o un celular de un tercero metido adentro de ``Supplier.name`` no tiene
por qué existir en reposo en el registro —hallazgos frontera-2/compliance-1—.
El saneo es idempotente, así que ``publicar_fila`` lo sigue pasando por ``_top``
sin enmascarar dos veces y una mejora futura del saneo se aplica igual a lo ya
guardado.

**Y el registro se purga** (``purgar_registro``, frontera-4): bitácora del
operador a 365 días —la misma constante que la bitácora de cada cliente—,
intentos de alta a 24 h y snapshots por cliente más viejos que la ventana
consultable. La serie ``__consolidado__`` no se purga nunca: es la serie larga
del negocio.
"""
import json
import logging
from datetime import datetime, timedelta, timezone

from app.plataforma_metricas import (
    MESES_HISTORIA_MAXIMO,
    TOPE_PROVEEDORES,
    VENTANA_MESES_ADELANTE,
    _corrido,
    _pct,
    _plata,
    _suprimir_celda_chica,
    _top,
    periodo_actual,
    rango_del_periodo,
    sanear_nombre_proveedor,
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
# La MISMA constante que acota la ventana de períodos consultables de
# `plataforma_metricas` (frontera-3): se reusa en vez de duplicarse para que el
# horizonte que la serie puede dibujar y el que el endpoint acepta consultar no
# se puedan separar.
MESES_MAXIMO = MESES_HISTORIA_MAXIMO

# Cuánto histórico se conserva en el registro antes de purgarlo
# (`purgar_registro`, frontera-4): todo lo que la ventana de consulta puede
# alcanzar, más un año de colchón. Un mes que ya nadie puede pedir ni dibujar
# no es historia, es una fila que ocupa disco sin consumidor.
MESES_QUE_SE_GUARDA_EL_SNAPSHOT = MESES_MAXIMO + VENTANA_MESES_ADELANTE
# Los intentos fallidos del alta (`IntentoAlta`) sólo cuentan dentro de la
# ventana del rate limit (`routers/auth.LOGIN_WINDOW_SECONDS`, 15 minutos). Un
# día es dos órdenes de magnitud más que eso: lo que se borra ya no frenaba a
# nadie, y queda margen de sobra para mirar la tabla si hay un incidente.
HORAS_QUE_SE_GUARDA_EL_INTENTO = 24

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
    """Las ``TOPE_PROVEEDORES`` entradas más altas, **con el nombre SANEADO**.

    Es el único paso previo al ``json.dumps`` que baja a
    ``snapshot_metricas.proveedores_json`` —lo usan la fila por cliente, la
    consolidada y la reconstrucción—, así que es acá donde se sanea (hallazgos
    frontera-2 / compliance-1). Antes el disco guardaba el nombre CRUDO y el
    saneo se aplicaba recién al leer: el correo o el celular que un supermercado
    tecleó adentro de ``Supplier.name`` quedaba en claro, sin plazo, en una
    tabla del REGISTRO —o sea en la base de negocio de GALERIAS—, a un
    ``db.query`` de distancia de cualquier backup o script de soporte. Un dato
    de contacto de un tercero que nunca dio consentimiento no tiene por qué
    existir en reposo.

    Dos pasos, en este orden:

    1. **Ordenar y recortar con el nombre ORIGINAL** —conteo descendente,
       empates por nombre alfabético, el mismo criterio de ``_top``—, que es el
       que agrupó. Elegir el top por el nombre saneado podría fundir dos
       proveedores distintos y el conteo mentiría.
    2. **Sanear al bajar.** Si dos originales del top sanean igual, sus conteos
       se SUMAN: es la misma aproximación que la rama que reconstruye desde
       disco ya acepta, y perder la distinción entre "Norte (juan@x.co)" y
       "Norte (ana@x.co)" es exactamente el punto.

    Los NÚMEROS siguen crudos —K=3 se aplica al leer, en ``publicar_fila``—; lo
    que baja saneado es sólo la cadena. Y el saneo es idempotente, así que
    volver a pasar por ``_top`` al leer no enmascara dos veces.
    """
    ordenados = sorted(conteos.items(), key=lambda par: (-par[1], par[0]))
    saneados: dict[str, int] = {}
    for nombre, cuantos in ordenados[:TOPE_PROVEEDORES]:
        clave = sanear_nombre_proveedor(nombre)
        saneados[clave] = saneados.get(clave, 0) + int(cuantos)
    return saneados


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

    **Un mes FUTURO no es historia (frontera-3).** ``/metricas?periodo=`` acepta
    hasta doce meses hacia adelante —un contrato que arranca el mes que viene se
    mira preguntando por ese mes— pero lo que se ve ahí es una proyección de la
    base de HOY, no lo que va a pasar. Persistirla la convertiría, cuando ese mes
    llegue, en una fila "congelada" de un pasado que nunca ocurrió, y el
    congelado impediría corregirla. Así que si ``anio_mes`` es posterior al mes
    en curso, esta función no escribe NADA.

    **La excepción del congelado (BUG-1, iteración 3).** Un mes YA PASADO se
    inserta sólo si falta — esa es la regla, y sigue valiendo para cada fila POR
    CLIENTE: una ya presente nunca se toca acá, aunque el mes tenga altas nuevas.
    Pero la fila ``__consolidado__`` es distinta: es una SUMA de esas filas, y
    una suma que no coincide con sus sumandos está mal, congelada o no. Si esta
    captura de un mes pasado INSERTA al menos una fila por cliente que todavía no
    tenía — un cliente que se dio de alta con historia retroactiva, o cuya base
    estuvo rota durante el cierre y ahora se pudo leer — la consolidada de ESE
    período se reconstruye a partir de TODAS las filas por cliente ya
    persistidas.

    **Y la fuente de verdad de cada sumando es su FILA EN DISCO**, salvo para
    los slugs que ESTA captura acaba de insertar (``recien_insertados``), donde
    lo que se acaba de escribir ES el valor fresco y además se tienen los ids
    reales de usuario y el conteo COMPLETO por proveedor. La iteración 2 de este
    arreglo tomaba ``crudos_por_slug`` para todos los slugs que hubiera leído, y
    con eso un cliente cuya fila ya estaba congelada (contrato cancelado
    DESPUÉS de la captura) entraba al total con sus números de hoy: el
    consolidado contradecía a sus propios sumandos publicados —600 + 900 por
    cliente contra 1.200 en el total— que es exactamente lo que la fase existe
    para que no pase (hallazgo bugs-1). Ver ``_reconstruir_consolidado``.
    """
    from app.clientes import sesion_registro
    from app.models.plataforma import SnapshotMetricas
    from app.plataforma_metricas import consolidar_crudos

    actual = periodo_actual()
    if anio_mes > actual:
        # Ver el docstring: una proyección no es historia. Sin log de error —
        # esto es normal, no un fallo.
        log.debug("No se persiste el snapshot de %s: es un mes futuro", anio_mes)
        return

    es_mes_en_curso = anio_mes == actual
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
        # Los slugs cuya fila NACE en esta captura: para ésos —y sólo para
        # ésos— lo que hay en memoria es lo mismo que se acaba de escribir, así
        # que se puede usar el crudo completo (ids de usuario, conteo entero por
        # proveedor). Ver `_reconstruir_consolidado`.
        recien_insertados: set[str] = set()
        for slug, valores in a_escribir:
            if slug == CONSOLIDADO_SLUG:
                continue  # se resuelve aparte, una vez que se sabe `hubo_alta`
            fila = existentes.get(slug)
            if fila is None:
                reg.add(SnapshotMetricas(
                    cliente_slug=slug, periodo=anio_mes, origen=origen,
                    capturado_en=ahora, **valores,
                ))
                recien_insertados.add(slug)
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
            valores_reconstruidos = _reconstruir_consolidado(
                filas_clientes, crudos_por_slug, recien_insertados, con_error)

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


def _reconstruir_consolidado(
    filas_clientes: list,
    crudos_por_slug: dict[str, dict],
    recien_insertados: set[str],
    con_error: int,
) -> dict:
    """La consolidada de un mes pasado, rearmada desde sus sumandos (BUG-1).

    **Una sola reconstrucción, con una sola regla de precedencia**: para cada
    fila por cliente ya persistida del período,

    · si su slug está en ``recien_insertados`` —la fila NACIÓ en esta captura—,
      el sumando sale de ``crudos_por_slug``: es literalmente lo que se acaba de
      escribir, y en memoria viene mejor (ids reales de usuario para deduplicar
      entre clientes, y el conteo COMPLETO por proveedor, no sólo su top 5);
    · si no, el sumando sale de **SU FILA EN DISCO**, siempre. Esa fila es la
      verdad congelada de ese cliente en ese mes, aunque su base haya cambiado
      después y aunque esta captura la haya leído recién. Tomar los crudos de
      hoy para un cliente ya congelado es el hallazgo bugs-1: el total dejaba de
      coincidir con los sumandos que el propio operador ve por cliente.

    Ingreso, ocupación, contratos y sedes quedan EXACTOS en los dos caminos —son
    los campos load-bearing, los que nunca pueden estar mal—. Usuarios y
    proveedores son la aproximación conocida (ya aceptada en ESTADO.md) para las
    filas que salen de disco: ahí sólo sobrevive el CONTEO de usuarios (no los
    ids con los que se deduplica a la misma persona con cuenta en dos
    supermercados) y el TOP-5 de proveedores (no su conteo completo).
    """
    proveedores_aprox: dict[str, int] = {}
    usuarios_aprox: set = set()
    sedes = caras = ocupadas = contratos = 0
    canon_total = 0.0
    for f in filas_clientes:
        crudos = crudos_por_slug.get(f.cliente_slug) if f.cliente_slug in recien_insertados else None
        if crudos is not None:
            # Recién insertada: el crudo en memoria ES esta fila, y trae más.
            sedes += crudos["sedes"]
            caras += crudos["caras"]
            ocupadas += crudos["ocupadas"]
            contratos += crudos["contratos"]
            canon_total += float(crudos["canon_total"])
            usuarios_aprox.update(crudos["usuarios"])
            for nombre, cuantos in crudos["proveedores"].items():
                # El nombre en memoria es el ORIGINAL; el de disco ya viene
                # saneado (`_recortar_top`). Se sanea acá para sumar en el mismo
                # espacio de nombres — si no, el mismo proveedor aparecería dos
                # veces con dos escrituras distintas del mismo contacto.
                clave = sanear_nombre_proveedor(nombre)
                proveedores_aprox[clave] = proveedores_aprox.get(clave, 0) + int(cuantos)
            continue

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


def purgar_registro() -> dict[str, int]:
    """Borra del REGISTRO lo que ya cumplió su plazo (hallazgo frontera-4).

    ``services/bitacora.purgar`` cuida la bitácora de cada cliente (365 días) y
    el ciclo de mantenimiento la llama por cada base. Las tres tablas que crecen
    en el registro no tenían equivalente: nadie las borraba nunca. Es a la vez un
    problema de retención —Ley 1581: dato conservado sin plazo declarado— y de
    disponibilidad en un disco de plan chico.

    Qué se borra, y con qué plazo:

    · ``BitacoraPlataforma`` más vieja que ``services.bitacora.DIAS_QUE_SE_GUARDA``
      (365 días). Se IMPORTA esa constante, no se duplica: el plazo de la
      constancia del operador y el de la del cliente son el mismo plazo, y el día
      que uno cambie tiene que cambiar el otro.
    · ``IntentoAlta`` de más de ``HORAS_QUE_SE_GUARDA_EL_INTENTO`` (24 h). El
      rate limit del alta sólo mira los últimos 15 minutos
      (``routers/auth.LOGIN_WINDOW_SECONDS``), así que lo que se borra ya no
      frenaba a nadie.
    · ``SnapshotMetricas`` de un período anterior a la ventana consultable
      (``MESES_QUE_SE_GUARDA_EL_SNAPSHOT``), **excepto la fila
      ``__consolidado__``**: la serie del total de la plataforma es el histórico
      largo del negocio —no habla de ningún cliente en particular ni trae un
      nombre de proveedor— y se conserva entera.

    Devuelve los conteos borrados por tabla y los loguea. No propaga: quien la
    llama es el ciclo de mantenimiento, y una purga que falla no puede frenarlo.
    """
    from app.clientes import sesion_registro
    from app.models.plataforma import BitacoraPlataforma, IntentoAlta, SnapshotMetricas
    from app.services.bitacora import DIAS_QUE_SE_GUARDA

    ahora = _ahora_utc()
    corte_bitacora = ahora - timedelta(days=DIAS_QUE_SE_GUARDA)
    corte_intentos = ahora - timedelta(hours=HORAS_QUE_SE_GUARDA_EL_INTENTO)
    corte_snapshot = _corrido(periodo_actual(), -MESES_QUE_SE_GUARDA_EL_SNAPSHOT)

    borrados = {"bitacora_plataforma": 0, "alta_attempts": 0, "snapshot_metricas": 0}
    reg = sesion_registro()
    try:
        borrados["bitacora_plataforma"] = (
            reg.query(BitacoraPlataforma)
            .filter(BitacoraPlataforma.en < corte_bitacora)
            .delete(synchronize_session=False)
        )
        borrados["alta_attempts"] = (
            reg.query(IntentoAlta)
            .filter(IntentoAlta.at < corte_intentos)
            .delete(synchronize_session=False)
        )
        borrados["snapshot_metricas"] = (
            reg.query(SnapshotMetricas)
            .filter(
                SnapshotMetricas.periodo < corte_snapshot,
                SnapshotMetricas.cliente_slug != CONSOLIDADO_SLUG,
            )
            .delete(synchronize_session=False)
        )
        reg.commit()
    except Exception:  # noqa: BLE001
        log.exception("No se pudo purgar el registro de plataforma")
        try:
            reg.rollback()
        except Exception:  # noqa: BLE001
            pass
        return {k: 0 for k in borrados}
    finally:
        reg.close()

    if any(borrados.values()):
        log.info("Purga del registro de plataforma: %s", borrados)
    return borrados


def cerrar_mes_anterior() -> None:
    """Las DOS tareas de plataforma del ciclo de mantenimiento: cierre y purga.

    **1. El cierre.** Se asegura de que el mes YA CERRADO tenga sus filas. Sin
    esto, la serie dependería de que alguien hubiera abierto la consola: un mes
    en el que nadie miró el panel quedaría como un hueco permanente, porque
    calcularlo después daría los contratos de hoy y no los de aquel mes.

    Falta el mes si no está la fila consolidada **o** si falta la de algún
    cliente del registro. Cuando falta, se llama a ``calcular``, que recorre las
    bases y dispara el write-through con ``origen="cierre"``. Cuando no falta, no
    hace absolutamente nada — que es lo normal en casi todas las corridas.

    **2. La purga** (``purgar_registro``, frontera-4). Corre SIEMPRE, también
    cuando el cierre no tenía nada que hacer —que es el caso normal—, y en su
    propio ``try``: son dos tareas independientes y una no puede tapar a la
    otra. Va acá y no en ``main._run_lease_maintenance`` porque ese ciclo ya
    llama a esta función una vez por vuelta, que es exactamente la cadencia que
    la purga necesita.

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

        if not (CONSOLIDADO_SLUG in presentes and esperados <= presentes):
            # `calcular` ya es tolerante a fallos por cliente —una base rota deja
            # su fila con error y el resto sigue—, así que el cierre hereda esa
            # tolerancia sin repetirla acá.
            from app.plataforma_metricas import calcular
            calcular(mes, origen=ORIGEN_CIERRE)
    except Exception:  # noqa: BLE001
        log.exception("No se pudo cerrar el mes anterior de la serie de métricas")

    try:
        purgar_registro()
    except Exception:  # noqa: BLE001
        log.exception("No se pudo purgar el registro de plataforma")


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
