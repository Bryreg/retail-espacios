"""Métricas agregadas del negocio, para la consola del operador (Fase 4).

**Este módulo SÓLO LEE.** Es la única puerta por la que un operador toca datos
de negocio de un cliente, y la enmienda de la regla dura de la Fase 2 la acota
a esto: sólo lectura, sólo agregados, nunca filas. No hay un ``add``, un
``commit`` ni un ``delete`` contra la base de un cliente en todo el archivo —
la garantía es por construcción, no por convención: las sesiones de cliente
sólo se usan para ``query(...)`` y se cierran en el ``finally``.

**Qué sale (taxativo, spec de la fase)**: nº de sedes con plano, nº de espacios
comercializables, % de ocupación del período, canon promedio mensual de
contratos activos, ingreso contratado del mes, top 5 de proveedores por nº de
contratos activos (nombre + conteo), nº de usuarios con cuenta y la FECHA del
último acceso, y el estado de cuenta. **Qué nunca**: valores de contratos
individuales, filas de ``space_leases``/``spaces``, correos o nombres de
usuarios finales, notas, fotos, ni la bitácora de nadie. Los únicos arreglos
de la respuesta son ``clientes`` y ``top_proveedores``.

**Dos defensas sobre esa frontera**, porque "agregado" no alcanza solo:

* **Supresión de celda chica (K=3)** — con menos de 3 contratos activos, la
  suma ES el sumando. Bajo ese umbral, ``ingreso_contratado_mes`` y
  ``canon_promedio_mensual`` van en ``null`` y ``top_proveedores`` vacío, tanto
  por cliente como en el consolidado. Ver ``_suprimir_celda_chica``.
* **Saneo del nombre del proveedor** — ``Supplier.name`` es texto libre del
  cliente y es el único string de negocio que sale al JSON. Se le enmascaran
  correos y teléfonos y se le pone tope de largo. Ver
  ``sanear_nombre_proveedor``.

**Cómo recorre las bases** — patrón de ``main.py::_run_lease_maintenance``: en
SECUENCIA, una por una, con ``try/except`` por cliente. Una base rota deja su
fila marcada con ``error`` y el panel entero sigue funcionando; el consolidado
la excluye y la cuenta aparte en ``clientes_con_error``. El texto del error es
FIJO: jamás la URL de la base, ni credenciales, ni el mensaje crudo del driver
—eso va al log del servidor, que es donde sirve—.

**Caché de 5 minutos** por ``anio_mes``, en memoria del registro y con candado,
igual que ``_estado_cache`` de ``plataforma_estado.py``: recorrer N bases en
cada pedido no escala sin techo. Es un LRU ACOTADO (``TOPE_CACHE_PERIODOS``):
el TTL solo no acota nada si el pedido siempre trae un período distinto. La
bitácora NO depende del caché: la anota el router en cada consulta, porque lo
que se registra es el acceso, no el cálculo.

**Y el ``periodo`` tiene ventana** (``normalizar_periodo``): 24 meses hacia
atrás —lo que la serie de tendencia puede dibujar— y 12 hacia adelante —un
contrato que arranca el mes que viene se mira preguntando por ese mes—. Fuera
de eso es 422: si no, un GET de sólo lectura recorre N bases por cada uno de
≈97.000 meses tecleables.
"""
import calendar
import json
import logging
import re
import threading
import time
import unicodedata
from collections import OrderedDict
from datetime import date, datetime, timezone

log = logging.getLogger("recabra.plataforma.metricas")

# El texto que ve el operador cuando la base de un cliente no se deja leer.
# Corto y FIJO a propósito: el detalle real (que suele traer la URL de la base
# y a veces credenciales) va al log del servidor y nunca al JSON.
ERROR_BASE_ILEGIBLE = "No se pudo leer la base de este cliente."

TOPE_PROVEEDORES = 5

# ─── Supresión de celda chica (K=3) ───────────────────────────────────────────
#
# Una suma de UN sumando no es un agregado: es el sumando. Con un solo contrato
# activo, `ingreso_contratado_mes` y `canon_promedio_mensual` son, exactamente,
# el `monthly_rent` de ese contrato, y el `top_proveedores` de al lado dice con
# quién se firmó. El operador reconstruye la fila entera —proveedor, monto y,
# si además hay una sola cara ocupada, cuál espacio— sin salir del panel. Eso
# es justo lo que la spec prohíbe ("nunca valores de contratos individuales"),
# y no es un caso de laboratorio: es el estado normal de un supermercado en su
# primer mes, que es cuando más se lo mira desde la consola.
#
# La regla, estándar en estadística oficial: por debajo de K observaciones, la
# celda no se publica. K=3 — con dos contratos, quien conoce uno despeja el
# otro.
#
# Se suprimen SÓLO los tres campos que exponen plata (`ingreso_contratado_mes`,
# `canon_promedio_mensual`, `top_proveedores`). Los conteos y la ocupación NO:
# un porcentaje sobre el inventario no revela ningún valor de contrato.
K_MINIMO_CONTRATOS = 3


def _spread(canon: float, tarifa: float, contratos: int) -> float | None:
    """``(Σ canon_con_tarifa / Σ tarifa − 1) × 100``, redondeado a 1 decimal.

    ``None`` por debajo de ``K_MINIMO_CONTRATOS`` — la MISMA regla de celda
    chica que protege el canon: con uno o dos contratos con tarifa aplicable,
    el spread y el canon promedio (que sí se publica) despejan la tarifa. Con
    ``contratos >= K`` la tarifa acumulada es siempre positiva (sólo se suma
    cuando un contrato tuvo tarifa aplicable > 0), así que no hace falta
    guardia aparte contra la división por cero.
    """
    if contratos < K_MINIMO_CONTRATOS:
        return None
    return round((canon / tarifa - 1) * 100, 1)


def _suprimir_celda_chica(publicas: dict, contratos: int) -> dict:
    """Aplica la regla K=3 sobre un diccionario de métricas, in place.

    ``null`` para los dos importes y lista **vacía** para el top. La elección es
    deliberada y consistente con el resto del contrato: los importes ya usan
    ``null`` para "este número no existe" (``canon_promedio_mensual`` sin
    contratos), mientras que ``top_proveedores`` es un arreglo en todos los
    casos y el frontend lo recorre sin preguntar — devolverle ``null`` lo
    rompería para ganar una distinción que no necesita.

    **El umbral incluye el cero.** Dejar ``0.0`` cuando no hay ningún contrato
    parecía inofensivo —no hay nada que proteger— pero rompe la supresión por
    la puerta de atrás: si el cero se publica y el 1 y el 2 se ocultan,
    entonces ``null`` *significa* "tiene uno o dos" y el operador aprende de la
    ausencia justo lo que la regla le quería ocultar. Con el umbral uniforme,
    ``null`` sólo dice "menos de tres".
    """
    if contratos >= K_MINIMO_CONTRATOS:
        return publicas
    publicas["ingreso_contratado_mes"] = None
    publicas["canon_promedio_mensual"] = None
    publicas["top_proveedores"] = []
    return publicas


_PERIODO_RE = re.compile(r"^(\d{4})-(\d{2})$")


class PeriodoInvalido(ValueError):
    """El parámetro ``periodo`` no es un ``YYYY-MM`` con mes real."""


# ─── El período ───────────────────────────────────────────────────────────────

def periodo_actual() -> str:
    """El mes calendario en curso, en UTC. El servidor corre en UTC y el resto
    del repo fecha en UTC; usar la hora local de la máquina haría que el
    "mes actual" cambiara según dónde se despliegue."""
    hoy = datetime.now(timezone.utc).date()
    return f"{hoy.year:04d}-{hoy.month:02d}"


def rango_del_periodo(anio_mes: str) -> tuple[date, date]:
    """``(desde, hasta)`` — el primer y el último día del mes, inclusive."""
    m = _PERIODO_RE.match((anio_mes or "").strip())
    if m is None:
        raise PeriodoInvalido("El período va como YYYY-MM (por ejemplo, 2026-09).")
    anio, mes = int(m.group(1)), int(m.group(2))
    if not (1 <= mes <= 12) or not (1900 <= anio <= 9999):
        raise PeriodoInvalido("El período va como YYYY-MM (por ejemplo, 2026-09).")
    ultimo = calendar.monthrange(anio, mes)[1]
    return date(anio, mes, 1), date(anio, mes, ultimo)


# ─── La ventana de períodos consultables (frontera-3) ─────────────────────────
#
# `rango_del_periodo` acepta cualquier mes entre 1900-01 y 9999-12: ≈97.000
# valores distintos, y cada uno que no esté cacheado recorre las N bases de
# negocio, deja una entrada nueva en el caché de proceso y ESCRIBE filas de
# `snapshot_metricas`. Un GET de sólo lectura no puede ser una palanca de
# crecimiento sin techo, ni fabricar "historia" de meses que no existieron.
#
# La ventana no es simétrica a propósito:
#
# · Hacia atrás, `MESES_HISTORIA_MAXIMO` (24) — exactamente lo que la serie de
#   tendencia puede mostrar (`plataforma_tendencia.MESES_MAXIMO`, que reusa
#   esta constante). Pedir un mes que ningún gráfico puede dibujar no tiene
#   consumidor.
# · Hacia adelante, `VENTANA_MESES_ADELANTE` (12) — un contrato que arranca el
#   mes que viene se mira preguntando por ese mes, y una campaña de temporada
#   se planifica con un año de anticipación. Lo que NO pasa es que esos meses
#   se persistan como historia: ver `plataforma_tendencia.persistir_snapshots`.
MESES_HISTORIA_MAXIMO = 24
VENTANA_MESES_ADELANTE = 12


def _corrido(anio_mes: str, meses: int) -> str:
    """``YYYY-MM`` corrido ``meses`` (con signo) en el calendario."""
    anio, mes = int(anio_mes[:4]), int(anio_mes[5:7])
    total = anio * 12 + (mes - 1) + meses
    return f"{total // 12:04d}-{total % 12 + 1:02d}"


def ventana_de_periodos() -> tuple[str, str]:
    """``(mas_viejo, mas_nuevo)`` consultables hoy, ambos inclusive."""
    actual = periodo_actual()
    return (
        _corrido(actual, -MESES_HISTORIA_MAXIMO),
        _corrido(actual, VENTANA_MESES_ADELANTE),
    )


def normalizar_periodo(crudo: str | None) -> str:
    """``YYYY-MM`` validado y DENTRO de la ventana, o el mes en curso si no vino nada.

    Dos puertas, en este orden: la forma (``rango_del_periodo``, que no cambió —
    se usa como unidad en otros lados y sigue aceptando cualquier mes real) y la
    ventana de arriba. Fuera de la ventana levanta ``PeriodoInvalido`` con un
    texto FIJO que nombra los dos extremos y no refleja lo que el operador
    tecleó; el router lo convierte en 422.
    """
    if crudo is None or not str(crudo).strip():
        return periodo_actual()
    anio_mes = str(crudo).strip()
    rango_del_periodo(anio_mes)  # valida la FORMA; levanta PeriodoInvalido
    mas_viejo, mas_nuevo = ventana_de_periodos()
    if not (mas_viejo <= anio_mes <= mas_nuevo):
        raise PeriodoInvalido(
            f"El período tiene que estar entre {mas_viejo} y {mas_nuevo}.")
    return anio_mes


# ─── Semántica del layout, replicada server-side ──────────────────────────────
#
# Espeja `frontend/src/types/fixtures.ts` (`isRentable`, `isDoubleGondola`,
# `fullSpaceCode`). Si las dos se separan, el % de ocupación que ve el operador
# deja de ser el mismo negocio que ve el cliente en su plano.

def _es_comercializable(fixture: dict) -> bool:
    """``isRentable``: ausente = comercializable; sólo un ``false`` explícito no.

    Un layout guardado antes de que la bandera existiera no tiene la propiedad
    y todos sus muebles siguen siendo vendibles — la compatibilidad hacia atrás
    es el motivo entero de que la regla se lea al revés de lo que parece.
    """
    return fixture.get("rentable") is not False


def _es_gondola_doble(fixture: dict) -> bool:
    """``isDoubleGondola`` **de ``DashboardView.tsx``**, que es la que cuenta caras.

    Dos criterios, unidos por un OR, exactamente como el frontend::

        isDoubleGondolaShared(f) || (f.type as string) === "gondola_doble"

    · ``type == "gondola"`` con ``gondolaType`` ``"double"`` **o ausente** — el
      default indefinido es doble en los dos editores (``fixtures.ts``).
    · el tipo **legado** ``"gondola_doble"``, que ``DashboardView.tsx`` conserva
      a propósito para los layouts viejos ya persistidos: esos planos están en
      las bases de los clientes y sus góndolas siguen siendo de dos caras. Sin
      esta rama, un cliente antiguo aparecería con la mitad del inventario.
    """
    tipo = fixture.get("type")
    if tipo == "gondola_doble":
        return True
    if tipo != "gondola":
        return False
    return (fixture.get("gondolaType") or "double") == "double"


def _codigo_completo(sede: str, code: str) -> str:
    """``fullSpaceCode``: ``SEDE-CODE`` en mayúsculas, sin doble prefijo.

    Los códigos que genera el editor 3D ya traen la sede adentro; el guard
    evita ``NAVE-NAVE-PUN-01``. Todo en mayúsculas porque el prefijo se genera
    así y la sede puede venir escrita como sea.
    """
    code_uc = (code or "").strip().upper()
    sede_uc = (sede or "").strip().upper()
    if not sede_uc or code_uc.startswith(f"{sede_uc}-"):
        return code_uc
    return f"{sede_uc}-{code_uc}"


def _caras_comercializables(fixtures: list, sede_snapshot: str) -> set[str]:
    """Los códigos completos de las caras VENDIBLES de una sede.

    Una góndola doble son DOS espacios **siempre**: la cara A son los campos
    top-level del fixture y la cara B lleva el sufijo ``-B``. Lo que hace doble
    a una góndola es su TIPO, no la presencia de la clave ``faceB``: ``faceB``
    es sólo donde se guardan los datos comerciales de esa cara, y el editor la
    omite mientras la cara nunca tuvo nada vendido. ``facesOf``
    (``DashboardView.tsx``) hace ``f.faceB ?? EMPTY_FACE`` y devuelve DOS
    entradas igual — una góndola recién dibujada son dos caras libres, no una.
    Exigir ``faceB`` contaba la mitad del inventario justo en el mueble más
    común y en el estado más frecuente (nada vendido todavía).
    """
    caras: set[str] = set()
    for fixture in fixtures:
        if not isinstance(fixture, dict):
            continue
        code = str(fixture.get("code") or "").strip()
        if not code:
            continue
        if not _es_comercializable(fixture):
            continue
        sede = str(fixture.get("sede") or sede_snapshot or "").strip()
        completo = _codigo_completo(sede, code)
        if not completo:
            continue
        caras.add(completo)
        if _es_gondola_doble(fixture):
            # Con o sin la clave `faceB`: `f.faceB ?? EMPTY_FACE`.
            caras.add(f"{completo}-B")
    return caras


# ─── Tarifa de referencia: tipo y sede de cada espacio (Fase 6) ───────────────
#
# El spread necesita, para cada contrato, la tarifa APLICABLE a su espacio —
# la de su sede o la default— y esa tarifa se busca por (SEDE, tipo). El plano
# ya se abre una vez para `_caras_comercializables`; en vez de abrirlo de
# nuevo por cada contrato (`find_fixture_by_space_code` recorre TODAS las
# sedes por cada llamada), se arma acá, en la MISMA pasada, un mapa
# ``codigo_completo -> (SEDE, tipo)``.

def _tipo_de_tarifa(tipo: str) -> str:
    """Misma semántica que ``_tipo_de_tarifa`` de ``routers/bulk_leases.py``:
    las dos caras de una góndola (doble o mural) comparten tarifa, porque el
    valor negociado también es por cara."""
    return "gondola" if tipo in ("gondola_doble", "gondola_mural") else tipo


def _mapa_tipos_de_sede(fixtures: list, sede_snapshot: str) -> dict[str, tuple[str, str]]:
    """``codigo_completo -> (SEDE, tipo)`` de los fixtures COMERCIALIZABLES de
    una sede. Espeja ``_caras_comercializables``: la cara ``-B`` de una
    góndola doble entra con el MISMO tipo que la cara A."""
    mapa: dict[str, tuple[str, str]] = {}
    for fixture in fixtures:
        if not isinstance(fixture, dict):
            continue
        code = str(fixture.get("code") or "").strip()
        if not code:
            continue
        if not _es_comercializable(fixture):
            continue
        sede = str(fixture.get("sede") or sede_snapshot or "").strip()
        completo = _codigo_completo(sede, code)
        if not completo:
            continue
        sede_uc = sede.strip().upper()
        tipo = _tipo_de_tarifa(str(fixture.get("type") or ""))
        mapa[completo] = (sede_uc, tipo)
        if _es_gondola_doble(fixture):
            mapa[f"{completo}-B"] = (sede_uc, tipo)
    return mapa


# ─── Un cliente ───────────────────────────────────────────────────────────────

def _numeros_del_layout(db) -> tuple[int, set[str], dict[str, tuple[str, str]]]:
    """``(sedes_con_plano, caras_comercializables, mapa_tipos)`` leyendo
    ``layout_snapshots``.

    Una sede con el plano vacío no es una sede con plano: la fila existe desde
    que alguien abrió el editor y guardó sin dibujar nada. ``mapa_tipos`` es
    ``codigo_completo -> (SEDE, tipo)`` (Fase 6, spread): se arma en la misma
    pasada para no volver a abrir el plano por cada contrato.
    """
    from app.models.models import LayoutSnapshot

    sedes = 0
    caras: set[str] = set()
    mapa_tipos: dict[str, tuple[str, str]] = {}
    for snap in db.query(LayoutSnapshot).all():
        try:
            fixtures = json.loads(snap.fixtures_json or "[]")
        except (ValueError, TypeError):
            # Un JSON ilegible no tumba al cliente entero: esa sede no cuenta.
            continue
        if not isinstance(fixtures, list) or not fixtures:
            continue
        sedes += 1
        caras |= _caras_comercializables(fixtures, snap.sede or "")
        mapa_tipos.update(_mapa_tipos_de_sede(fixtures, snap.sede or ""))
    return sedes, caras, mapa_tipos


def _contratos_activos(db, desde: date, hasta: date) -> list[tuple[str, str, float]]:
    """``(codigo_espacio, nombre_proveedor, canon)`` de cada contrato activo.

    "Activo en el período" = ``start_date <= hasta AND end_date >= desde``, con
    los dos extremos inclusive: un contrato de UN día que cae adentro del mes
    cuenta como cualquier otro.

    Al solapamiento de fechas se le suma ``is_active``, que es lo que dice que
    el contrato **no fue cancelado** (ver ``Space.active_lease`` en
    ``models/models.py``: las fechas son la verdad, la bandera sólo dice que
    nadie lo dio de baja). Un contrato cancelado no es un contrato activo, así
    que no puede sumar ingreso ni ocupación.

    Devuelve una lista de TUPLAS, no filas del ORM, a propósito: lo que sale de
    esta función se agrega y se tira. Nada de esto viaja al JSON.
    """
    from app.models.models import Space, SpaceLease, Supplier

    filas = (
        db.query(Space.code, Supplier.name, SpaceLease.monthly_rent)
        .join(Space, Space.id == SpaceLease.space_id)
        .join(Supplier, Supplier.id == SpaceLease.supplier_id)
        .filter(
            SpaceLease.is_active == True,  # noqa: E712
            SpaceLease.start_date <= hasta,
            SpaceLease.end_date >= desde,
        )
        .all()
    )
    return [
        ((codigo or "").strip().upper(), (nombre or "").strip(), float(canon or 0.0))
        for codigo, nombre, canon in filas
    ]


def _usuarios_del_cliente(reg, slug: str) -> tuple[list[int], date | None]:
    """``(ids_de_usuarios_con_membresía_activa, fecha_del_último_acceso)``.

    Sale del REGISTRO (``membresias`` + ``usuarios``), no de la base del
    cliente: la identidad es global desde la Fase 1. Se devuelven ids —números—
    y una FECHA: ni un correo ni un nombre salen de acá, y la fecha va sin hora
    para que el último acceso no sirva de reloj de nadie.
    """
    from app.models.identidad import Membresia, Usuario

    filas = (
        reg.query(Usuario.id, Usuario.ultimo_login)
        .join(Membresia, Membresia.usuario_id == Usuario.id)
        .filter(Membresia.cliente_slug == slug, Membresia.activo == True)  # noqa: E712
        .all()
    )
    ids = sorted({fila[0] for fila in filas})
    accesos = [fila[1] for fila in filas if fila[1] is not None]
    ultimo = max(accesos).date() if accesos else None
    return ids, ultimo


# ─── El nombre del proveedor, saneado ─────────────────────────────────────────
#
# `Supplier.name` es TEXTO LIBRE que teclea el supermercado, y es el único
# string de negocio que la spec deja salir al JSON del operador. En retail el
# proveedor es muy seguido una persona natural, y el contacto termina escrito
# adentro del nombre porque es el campo que se ve en las listas
# ("Juan Pérez Distribuciones (juan.perez@…)"). Eso convierte al top de
# proveedores en un canal de datos personales de un tercero, que es
# exactamente lo que la frontera de la fase prohíbe.
#
# Se sanea SÓLO la cadena que sale al JSON. El conteo y el agrupamiento se
# hacen contra el nombre ORIGINAL: si dos filas del mismo proveedor se
# agruparan por su versión saneada, dos nombres distintos podrían fundirse en
# uno y el conteo mentiría.

_CORREO_RE = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]*[A-Za-z0-9\-]+\.[A-Za-z]{2,}")
# 7+ dígitos con separadores de teléfono intercalados (espacio, guion, punto,
# paréntesis, +). El umbral es 7 porque abajo de eso son códigos internos,
# metros cuadrados o años, no un número de contacto.
# El `\(?` inicial se come el paréntesis del indicativo (`(300) 555 88 99`) para
# no dejar uno huérfano al lado de la máscara.
# Separadores admitidos ENTRE los dígitos de un teléfono. Además del espacio,
# el guion, el punto y los paréntesis de siempre, entran la barra, el guion
# bajo, el punto medio y la coma: `300/555/8899`, `300_555_8899` y
# `300·555·8899` son formas corrientes de teclear un celular, y sin ellas la
# expresión veía tres números cortos y ninguno llegaba al umbral de 7 dígitos
# (hallazgo frontera-1).
_TELEFONO_RE = re.compile(r"\(?\+?\d(?:[\s\-.()/_·,]*\d){6,}\)?")
MASCARA_CORREO = "[correo oculto]"
MASCARA_TELEFONO = "[teléfono oculto]"
LARGO_MAXIMO_NOMBRE = 80


def sanear_nombre_proveedor(nombre: str) -> str:
    """El nombre del proveedor como puede salir al JSON del operador.

    Cuatro pasadas, en este orden:

    0. **Normalización Unicode (NFKC) y borrado de los caracteres de formato**
       (categoría ``Cf``: U+200B..U+200D, U+FEFF, marcas de dirección…). Va
       PRIMERA porque las dos expresiones de abajo son ASCII: sin este paso,
       una arroba de ancho completo (``＠``, U+FF20 — la que teclea cualquier
       teclado asiático y la que sobrevive a un copy-paste desde un PDF) no es
       la ``@`` que busca ``_CORREO_RE``, y un espacio de ancho cero entre los
       dígitos (``300​555​8899``, que viaja solo en cualquier copy-paste desde
       una web o un WhatsApp) parte el teléfono en tres números demasiado
       cortos para el umbral. NFKC además convierte los dígitos de ancho
       completo en dígitos ASCII. Hallazgo frontera-1.
    1. **Correos** — cualquier subcadena con forma de correo (``@`` y un punto
       en el dominio) se reemplaza por ``[correo oculto]``. Antes del teléfono,
       porque un correo suele traer dígitos que si no se llevaría esa pasada.
    2. **Teléfonos** — 7 o más dígitos contiguos admitiendo los separadores de
       ``_TELEFONO_RE`` intercalados → ``[teléfono oculto]``.
    3. **Tope de largo** — 80 caracteres, cortando en el último espacio para no
       partir una palabra al medio, con ``…`` al final. Un nombre de proveedor
       no necesita más; el resto es narrativa que alguien metió en el campo, y
       cuanto más largo, más chance de que traiga algo que no debería.

    Un ``@`` suelto que sobreviva a la pasada 1 (``"Distribuciones @ Norte"``)
    se neutraliza igual, y sobre el texto YA normalizado: la invariante que
    defiende la frontera es "ningún string del JSON trae una arroba", y depender
    de que el patrón cubra todas las formas de escribir un correo es apostar
    contra el usuario.

    **Es idempotente**: las máscaras no traen ni arrobas ni dígitos, así que
    volver a sanear un nombre ya saneado lo deja igual. De eso depende que el
    snapshot pueda guardarlo ya saneado (frontera-2) y que ``_top`` lo siga
    pasando por acá al leer sin enmascarar dos veces.
    """
    crudo = unicodedata.normalize("NFKC", str(nombre or ""))
    crudo = "".join(c for c in crudo if unicodedata.category(c) != "Cf")
    limpio = " ".join(crudo.split())
    limpio = _CORREO_RE.sub(MASCARA_CORREO, limpio)
    limpio = _TELEFONO_RE.sub(MASCARA_TELEFONO, limpio)
    limpio = limpio.replace("@", " ")
    limpio = " ".join(limpio.split())
    if len(limpio) > LARGO_MAXIMO_NOMBRE:
        cortado = limpio[: LARGO_MAXIMO_NOMBRE - 1]
        espacio = cortado.rfind(" ")
        if espacio >= LARGO_MAXIMO_NOMBRE // 2:
            cortado = cortado[:espacio]
        limpio = cortado.rstrip(" .,;:-") + "…"
    return limpio


def _top(conteos: dict[str, int]) -> list[dict]:
    """Top 5 por nº de contratos, descendente; empates por nombre alfabético.

    Cada objeto es EXACTAMENTE ``{nombre, contratos_activos}`` — el nombre del
    proveedor y cuántos contratos tiene. Ni un campo más: un ``id`` o un
    ``monto`` acá convertirían el agregado en una fila de negocio.

    El orden (conteo desc, nombre alfabético para los empates) se resuelve con
    el nombre **original**, que es el que agrupó; el saneo se aplica recién al
    armar el objeto que sale. Así el saneo no puede reordenar el top ni fundir
    dos proveedores distintos en una sola fila.
    """
    ordenados = sorted(conteos.items(), key=lambda par: (-par[1], par[0]))
    return [
        {"nombre": sanear_nombre_proveedor(n), "contratos_activos": c}
        for n, c in ordenados[:TOPE_PROVEEDORES]
    ]


def _pct(ocupadas: int, total: int) -> float | None:
    """Porcentaje con un decimal, o ``None`` si no hay denominador.

    ``None`` y no ``0.0``: un cliente sin un solo espacio comercializable no
    tiene 0 % de ocupación, no tiene ocupación.
    """
    if total <= 0:
        return None
    return round(ocupadas * 100.0 / total, 1)


def _plata(valor: float) -> float:
    return round(valor + 0.0, 2)


def _tarifas_limpias(db) -> dict:
    """``{"default": {...}, "by_sede": {...}}`` con la MISMA regla de
    ``_clean_rates`` de ``routers/layout.py`` (sólo números > 0), sede en
    mayúsculas. Import LOCAL, en la misma sesión del cliente ya abierta.

    La tarifa nunca sale de acá al JSON — sólo se usa para calcular el
    spread (una relación), nunca su valor.
    """
    from app.routers.layout import _clean_rates, reference_rates_raw

    raw = reference_rates_raw(db)
    default = _clean_rates(raw.get("default") or {})
    by_sede_raw = raw.get("by_sede") or {}
    by_sede: dict[str, dict[str, float]] = {}
    if isinstance(by_sede_raw, dict):
        for sede, rates in by_sede_raw.items():
            if not isinstance(sede, str):
                continue
            limpio = _clean_rates(rates)
            if limpio:
                by_sede[sede.strip().upper()] = limpio
    return {"default": default, "by_sede": by_sede}


def _tarifa_aplicable(tarifas: dict, sede: str, tipo: str) -> float | None:
    """La tarifa de un contrato: la de su SEDE si existe y es > 0, si no la
    ``default`` si es > 0. ``None`` si ninguna de las dos aplica."""
    valor = (tarifas.get("by_sede") or {}).get(sede, {}).get(tipo)
    if valor is not None and valor > 0:
        return valor
    valor = (tarifas.get("default") or {}).get(tipo)
    if valor is not None and valor > 0:
        return valor
    return None


def _metricas_de_un_cliente(cliente, reg, desde: date, hasta: date) -> tuple[dict, dict]:
    """``(metricas_publicas, crudos_para_el_consolidado)`` de UN cliente.

    Los "crudos" no salen nunca al JSON: son los sumandos que el consolidado
    necesita para ponderar (contratos, canon total, caras, ocupadas, ids de
    usuarios, conteo por proveedor). Sin ellos el consolidado tendría que
    promediar promedios, que es una cuenta distinta y equivocada.
    """
    from app.clientes import sesion_de

    db = sesion_de(cliente)
    try:
        sedes, caras, mapa_tipos = _numeros_del_layout(db)
        contratos = _contratos_activos(db, desde, hasta)
        tarifas = _tarifas_limpias(db)
    finally:
        # Sólo se leyó. Nada que comitear ni que revertir; la sesión se cierra
        # pase lo que pase, igual que en `_run_lease_maintenance`.
        db.close()

    tarifa_configurada = bool(tarifas["default"]) or any(tarifas["by_sede"].values())
    canon_con_tarifa = 0.0
    tarifa_total = 0.0
    contratos_con_tarifa = 0
    contratos_sin_tarifa = 0
    for codigo, _nombre, canon in contratos:
        entrada = mapa_tipos.get(codigo)
        tarifa_valor = None
        if entrada is not None:
            sede_del_espacio, tipo = entrada
            tarifa_valor = _tarifa_aplicable(tarifas, sede_del_espacio, tipo)
        if tarifa_valor is None:
            contratos_sin_tarifa += 1
            continue
        canon_con_tarifa += canon
        tarifa_total += tarifa_valor
        contratos_con_tarifa += 1

    ocupados = {codigo for codigo, _n, _c in contratos}
    # Un contrato sobre un espacio que NO tiene mueble en el plano (un código
    # legado, un mueble borrado después de firmar) no puede contar como cara
    # ocupada: inflaría el numerador contra un denominador que no lo incluye,
    # y con eso el porcentaje pasaría de 100. Para canon, ingreso y top de
    # proveedores sí cuenta — la plata existe aunque el plano no la muestre.
    ocupadas = len(caras & ocupados)

    canon_total = sum(canon for _c, _n, canon in contratos)
    conteo_proveedores: dict[str, int] = {}
    for _codigo, nombre, _canon in contratos:
        if not nombre:
            continue
        conteo_proveedores[nombre] = conteo_proveedores.get(nombre, 0) + 1

    ids_usuarios, ultimo_acceso = _usuarios_del_cliente(reg, cliente.slug)

    crudos = {
        "sedes": sedes,
        "caras": len(caras),
        "ocupadas": ocupadas,
        "contratos": len(contratos),
        "canon_total": canon_total,
        "proveedores": conteo_proveedores,
        "usuarios": ids_usuarios,
        # ── Fase 6 (spread): NUNCA al JSON tal cual — sólo entran al público
        # transformados por `_spread` (una relación, jamás la tarifa ni su
        # suma). Ver `publicas_desde_crudos`: NO los toca -- se agregan
        # después, en `_metricas_de_un_cliente`, igual que `ultimo_acceso`.
        "canon_con_tarifa": canon_con_tarifa,
        "tarifa_total": tarifa_total,
        "contratos_con_tarifa": contratos_con_tarifa,
        "contratos_sin_tarifa": contratos_sin_tarifa,
        "tarifa_configurada": tarifa_configurada,
    }
    # Los públicos se derivan SIEMPRE de los crudos, por `publicas_desde_crudos`
    # -- el mismo camino que relee la serie histórica (Fase 5,
    # `app/plataforma_tendencia.py`): un único lugar donde el crudo se vuelve
    # público y donde se aplica la supresión K=3. `ultimo_acceso` es lo único
    # que no sale de los crudos -- vive en el registro, no en la base de
    # negocio -- así que se agrega aparte; K=3 no lo toca (una fecha no revela
    # ningún importe).
    publicas = publicas_desde_crudos(crudos)
    publicas["ultimo_acceso"] = ultimo_acceso.isoformat() if ultimo_acceso else None
    # Fase 6 (spread): PROHIBIDO meterlos en `publicas_desde_crudos` -- la
    # reusa la tendencia (`publicar_fila`), que reconstruye desde crudos en
    # disco sin estas claves. Se agregan acá, después, igual que
    # `ultimo_acceso`.
    publicas["spread_pct"] = _spread(canon_con_tarifa, tarifa_total, contratos_con_tarifa)
    publicas["tarifa_configurada"] = tarifa_configurada
    publicas["contratos_sin_tarifa"] = contratos_sin_tarifa
    return publicas, crudos


def publicas_desde_crudos(crudos: dict) -> dict:
    """Los agregados PÚBLICOS de un cliente a partir de sus ``crudos``, con K=3.

    Es la frontera única entre el sumando crudo y el número publicado: la usan
    el endpoint de métricas (Fase 4, vía ``_metricas_de_un_cliente``) y la serie
    de tiempo (Fase 5, ``app/plataforma_tendencia.py``), de modo que la
    supresión de celda chica y el saneo del nombre del proveedor viven en un
    solo sitio. No incluye ``sedes_con_plano`` ni ``ultimo_acceso`` -- ese
    último no es un crudo de negocio -- para que la serie histórica, que no
    los guarda igual, use exactamente esta función tal cual.
    """
    contratos = crudos["contratos"]
    caras = crudos["caras"]
    publicas = {
        "sedes_con_plano": crudos["sedes"],
        "espacios_comercializables": caras,
        "ocupacion_pct": _pct(crudos["ocupadas"], caras),
        "canon_promedio_mensual": _plata(crudos["canon_total"] / contratos) if contratos else None,
        "ingreso_contratado_mes": _plata(crudos["canon_total"]),
        "top_proveedores": _top(crudos["proveedores"]),
        "usuarios_con_cuenta": len(crudos["usuarios"]),
    }
    return _suprimir_celda_chica(publicas, contratos)


# ─── El cálculo completo ──────────────────────────────────────────────────────

def _ahora_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def _calcular(anio_mes: str, origen: str = "vista") -> tuple[dict, dict[str, int]]:
    """El cuerpo completo de ``GET /api/plataforma/metricas`` (sin caché) MÁS
    el conteo de contratos activos por cliente LEGIBLE (Fase 6, adopción).

    Recorre TODAS las filas de ``clientes`` del registro — activas e inactivas,
    y los suspendidos incluidos: el operador necesita ver el negocio completo,
    y una cuenta cortada por impago es justamente la que hay que poder mirar.

    ``origen`` sólo ETIQUETA el snapshot que este cálculo deja de paso (Fase 5):
    ``"vista"`` cuando lo disparó alguien mirando el panel, ``"cierre"`` cuando
    lo disparó el ciclo de mantenimiento. No cambia una sola cuenta ni un solo
    campo del JSON que se devuelve.

    El segundo elemento de la tupla —``{slug: nº de contratos activos}`` para
    los clientes que SÍ se pudieron leer y ``{slug: None}`` para los que no—
    es de uso INTERNO: nunca sale al JSON de ``/metricas``. Existe para que la adopción (``contratos_activos_por_cliente``,
    más abajo) no tenga que recorrer las N bases una segunda vez -- ya está
    calculado acá, en `crudos["contratos"]` de cada cliente.
    """
    from app.clientes import Cliente, sesion_registro
    from app.models.models import ClienteRow
    from app.models.plataforma import EstadoCliente

    desde, hasta = rango_del_periodo(anio_mes)

    reg = sesion_registro()
    try:
        filas = reg.query(ClienteRow).order_by(ClienteRow.slug).all()
        estados = {e.slug: e.estado for e in reg.query(EstadoCliente).all()}
        # Se materializa la lista ANTES de abrir ninguna base de cliente: la
        # sesión del registro queda libre y no depende de cuánto tarde la
        # vuelta por las N bases.
        objetivos = [
            (
                Cliente(slug=f.slug, nombre=f.nombre, db_name=f.db_name, activo=f.activo),
                estados.get(f.slug) or "activo",
            )
            for f in filas
        ]

        clientes: list[dict] = []
        acumulado: list[dict] = []
        # Los crudos de los clientes LEGIBLES, indexados por slug: es lo único
        # que le falta al snapshot de la Fase 5 y ya está calculado acá. Se lleva
        # aparte de `acumulado` —que es una lista y le alcanza— porque el
        # snapshot necesita saber DE QUIÉN es cada crudo.
        crudos_por_slug: dict[str, dict] = {}
        contratos_por_cliente: dict[str, int | None] = {}
        for cliente, estado in objetivos:
            fila = {
                "slug": cliente.slug,
                "nombre": cliente.nombre,
                "estado_cuenta": estado,
                "error": None,
                "metricas": None,
            }
            try:
                publicas, crudos = _metricas_de_un_cliente(cliente, reg, desde, hasta)
            except Exception:  # noqa: BLE001
                # Patrón `_run_lease_maintenance`: una base rota no tumba al
                # resto. El detalle va al log (con traza), el JSON se queda con
                # el texto fijo — el mensaje del driver trae la URL de la base.
                log.exception("No se pudieron leer las métricas del cliente %s", cliente.slug)
                fila["error"] = ERROR_BASE_ILEGIBLE
                # `None` = "se intentó leer y no se pudo". La adopción distingue
                # así una base rota de un cliente que nació después del caché.
                contratos_por_cliente[cliente.slug] = None
            else:
                fila["metricas"] = publicas
                acumulado.append(crudos)
                # Sólo los clientes legibles se snapshotean (Fase 5): una base
                # rota no deja crudos que guardar, igual que no suma al
                # consolidado -- la serie de ese cliente tendrá un hueco ese mes.
                crudos_por_slug[cliente.slug] = crudos
                contratos_por_cliente[cliente.slug] = crudos["contratos"]
            clientes.append(fila)
    finally:
        reg.close()

    # Write-through de la serie histórica (Fase 5, `app/plataforma_tendencia.py`):
    # cada cálculo REAL deja o actualiza el snapshot del período por cliente.
    # Tolerante a fallos: si la persistencia falla, las métricas se devuelven
    # igual -- la foto del panel no depende de que la historia se haya podido
    # guardar. Va acá, no en el caché (`metricas_del_periodo`), porque lo que
    # hay que capturar es el cálculo, y un acierto de caché no recalcula nada
    # (ni trae los crudos que hacen falta para el snapshot).
    #
    # El import es LOCAL: `plataforma_tendencia` importa de este módulo a nivel
    # de archivo (reusa `_pct`, `_plata`, `_top` y `_suprimir_celda_chica`), así
    # que hacerlo arriba cerraría el ciclo.
    try:
        from app.plataforma_tendencia import persistir_snapshots
        persistir_snapshots(anio_mes, clientes, crudos_por_slug, origen)
    except Exception:  # noqa: BLE001
        log.exception("No se pudo persistir el snapshot de la serie de tendencia para %s", anio_mes)

    cuerpo = {
        "periodo": {
            "anio_mes": anio_mes,
            "desde": desde.isoformat(),
            "hasta": hasta.isoformat(),
        },
        "generado_en": _ahora_iso(),
        "de_cache": False,
        "consolidado": _consolidar(len(clientes), clientes, acumulado),
        "clientes": clientes,
    }
    return cuerpo, contratos_por_cliente


def calcular(anio_mes: str, origen: str = "vista") -> dict:
    """El cuerpo completo de ``GET /api/plataforma/metricas``, sin caché.

    Wrapper de ``_calcular`` con la firma de siempre (la usa
    ``plataforma_tendencia.cerrar_mes_anterior``): descarta el conteo de
    contratos por cliente, que es de uso interno de la adopción.
    """
    cuerpo, _contratos_por_cliente = _calcular(anio_mes, origen)
    return cuerpo


def consolidar_crudos(acumulado: list[dict]) -> dict:
    """La suma CRUDA (Σ), sin K=3 ni saneo, de una lista de ``crudos``.

    Es el paso compartido entre dos consumidores con necesidades distintas:
    ``consolidar_agregado`` (abajo), que le aplica K=3 y el saneo de proveedor
    para devolver el JSON PÚBLICO del consolidado de ``/metricas``; y
    ``app.plataforma_tendencia.persistir_snapshots`` (Fase 5), que guarda estos
    números tal cual — la fila ``__consolidado__`` de ``snapshot_metricas``
    también es un CRUDO, igual que la de cada cliente, porque K=3 se aplica al
    LEER la serie (``publicar_fila``), no al escribirla.

    Un único lugar para el ponderado (Σ/Σ, nunca promedio de promedios) evita
    que la tendencia reimplemente esta suma por su cuenta — que es justamente
    cómo apareció BUG-1: reconstruir el consolidado desde las filas por
    cliente ya persistidas necesitaba la misma aritmética que arma el
    consolidado la primera vez.

    Con un único elemento en ``acumulado`` da exactamente sus propios crudos:
    así también sirve para el punto de UN cliente, sin una segunda fórmula.
    """
    proveedores: dict[str, int] = {}
    for a in acumulado:
        for nombre, cuantos in a["proveedores"].items():
            proveedores[nombre] = proveedores.get(nombre, 0) + cuantos

    # Distintos: la misma persona puede tener cuenta en dos supermercados y no
    # por eso son dos usuarios de la plataforma.
    usuarios: set = set()
    for a in acumulado:
        usuarios.update(a["usuarios"])

    return {
        "sedes": sum(a["sedes"] for a in acumulado),
        "caras": sum(a["caras"] for a in acumulado),
        "ocupadas": sum(a["ocupadas"] for a in acumulado),
        "contratos": sum(a["contratos"] for a in acumulado),
        "canon_total": sum(a["canon_total"] for a in acumulado),
        "proveedores": proveedores,
        "usuarios": usuarios,
    }


def consolidar_agregado(acumulado: list[dict]) -> dict:
    """El agregado consolidado PÚBLICO (ponderado, con K=3) de una lista de ``crudos``.

    SÓLO la cuenta del negocio — sin ``clientes_total`` ni ``clientes_con_error``,
    que son de la foto del panel (Fase 4) y no tienen sentido en un punto de la
    serie histórica. La usa el consolidado de ``/metricas`` (envuelto por
    ``_consolidar``, abajo). La tendencia (Fase 5,
    ``app/plataforma_tendencia.py``) NO pasa por esta función: la fila
    ``__consolidado__`` que persiste es un CRUDO (arma el suyo con
    ``consolidar_crudos`` de arriba, sin K=3), y aplica K=3 recién al leer,
    con ``publicar_fila``. Ambas comparten el mismo ponderado (Σ/Σ) por la
    misma ``consolidar_crudos`` — un solo lugar para la aritmética, aunque el
    JSON que produce cada una sea distinto.

    Las dos cuentas que no se pueden hacer promediando promedios:

    · **canon promedio ponderado** = Σ canones / Σ contratos activos. Un cliente
      con 1 contrato de $100 y otro con 99 de $1 dan un promedio real de ~$2, no
      de $50,50 — y el operador que mira este número está mirando su negocio.
    · **ocupación consolidada** = Σ ocupadas / Σ comercializables, por lo mismo:
      una sede chica al 100 % no compensa a una grande al 10 %.
    """
    crudo = consolidar_crudos(acumulado)
    contratos = crudo["contratos"]
    canon_total = crudo["canon_total"]
    agregado = {
        "sedes_con_plano": crudo["sedes"],
        "espacios_comercializables": crudo["caras"],
        "ocupacion_pct": _pct(crudo["ocupadas"], crudo["caras"]),
        "canon_promedio_mensual": _plata(canon_total / contratos) if contratos else None,
        "ingreso_contratado_mes": _plata(canon_total),
        "top_proveedores": _top(crudo["proveedores"]),
        "usuarios_con_cuenta": len(crudo["usuarios"]),
    }
    # Se calcula con los datos SUBYACENTES de todos los clientes legibles — los
    # suprimidos incluidos: suprimir una fila no puede cambiar el total del
    # negocio — y aplica la MISMA regla K=3 a su propio nivel. Con dos contratos
    # en toda la plataforma, el total ES el contrato.
    return _suprimir_celda_chica(agregado, contratos)


def _consolidar(total_clientes: int, clientes: list[dict], acumulado: list[dict]) -> dict:
    """El consolidado del panel de ``/metricas``: el agregado ponderado más el
    conteo de clientes.

    El agregado del negocio lo hace ``consolidar_agregado`` (compartido con la
    tendencia); acá sólo se le anteponen ``clientes_total`` y
    ``clientes_con_error``, que son de la foto de ESTE mes y no de la serie.

    **El spread consolidado se calcula ACÁ, no en ``consolidar_agregado``**
    (Fase 6): esa función la reusa ``app/plataforma_tendencia.py``, cuya fila
    ``__consolidado__`` persistida no guarda ``canon_con_tarifa``/
    ``tarifa_total`` — meterlo ahí rompería la reconstrucción con un
    ``KeyError``. Ponderado (Σ canon_con_tarifa / Σ tarifa_total) sobre los
    clientes LEGIBLES de ``acumulado``, K=3 sobre Σ contratos_con_tarifa,
    nunca promedio de spreads.
    """
    con_error = sum(1 for c in clientes if c["error"] is not None)
    agregado = consolidar_agregado(acumulado)
    # Sólo entran al spread consolidado los clientes cuyo PROPIO spread se
    # publica (≥ K contratos con tarifa). Si entrara un cliente suprimido por
    # K=3, su Σ tarifa y su spread se despejarían por diferencia entre el
    # consolidado y los clientes visibles — la supresión no valdría nada
    # (hallazgo H-1 de la fase, `test_asesoria_ataques.py` a17). Distinto del
    # ingreso consolidado, que sí suma a todos: ahí el total del negocio es
    # el dato; acá el dato es una relación cuya base es secreta por spec.
    publicables = [a for a in acumulado if a["contratos_con_tarifa"] >= K_MINIMO_CONTRATOS]
    canon_con_tarifa = sum(a["canon_con_tarifa"] for a in publicables)
    tarifa_total = sum(a["tarifa_total"] for a in publicables)
    contratos_con_tarifa = sum(a["contratos_con_tarifa"] for a in publicables)
    agregado["spread_pct"] = _spread(canon_con_tarifa, tarifa_total, contratos_con_tarifa)
    agregado["clientes_con_tarifa"] = sum(1 for a in acumulado if a["tarifa_configurada"])
    return {
        "clientes_total": total_clientes,
        "clientes_con_error": con_error,
        **agregado,
    }


# ─── Caché de 5 minutos ───────────────────────────────────────────────────────
#
# Mismo patrón que `_estado_cache` de `plataforma_estado.py`: diccionario en
# memoria del proceso, candado, TTL y un `limpiar_` para las pruebas. La clave
# es el `anio_mes`: pedir agosto no invalida septiembre.

CACHE_TTL_SEGUNDOS = 5 * 60.0
# Tope de períodos vivos en memoria (frontera-3). El TTL solo no acota nada:
# mientras alguien siga pidiendo períodos distintos, ninguna entrada llega a
# vencer y el diccionario crece con cada mes nuevo que se teclee. 24 es el
# horizonte de la serie de tendencia: más períodos que ésos no los mira nadie
# dos veces, así que desalojar el menos usado no cuesta un solo acierto real.
TOPE_CACHE_PERIODOS = 24
_cache: "OrderedDict[str, tuple[dict, float]]" = OrderedDict()
# El conteo de contratos activos por cliente (Fase 6, adopción) — de uso
# INTERNO, jamás al JSON. Mismo TTL, mismo tope y mismo candado que `_cache`,
# se llena en el MISMO cálculo (`metricas_del_periodo` lo arma junto con el
# cuerpo) para no recorrer las N bases una segunda vez.
_cache_contratos: "OrderedDict[str, tuple[dict[str, int], float]]" = OrderedDict()
_cache_candado = threading.Lock()


def _guardar_en_cache(cache: OrderedDict, clave: str, valor) -> None:
    """LRU acotado a ``TOPE_CACHE_PERIODOS``. Llamar SIEMPRE bajo el candado."""
    cache[clave] = valor
    cache.move_to_end(clave)
    while len(cache) > TOPE_CACHE_PERIODOS:
        cache.popitem(last=False)


def metricas_del_periodo(anio_mes: str) -> dict:
    """El cuerpo de la respuesta, del caché o recién calculado.

    Un acierto de caché devuelve el MISMO ``generado_en`` del cálculo original
    —es la hora en que esos números se sacaron, y mentirla haría creer al
    operador que está mirando algo más fresco de lo que mira— y marca
    ``de_cache: true`` para que la pantalla lo pueda decir.
    """
    ahora = time.monotonic()
    with _cache_candado:
        cacheado = _cache.get(anio_mes)
        if cacheado is not None and cacheado[1] > ahora:
            _cache.move_to_end(anio_mes)  # LRU: usarlo lo vuelve el más reciente
            cuerpo = dict(cacheado[0])
            cuerpo["de_cache"] = True
            return cuerpo

    cuerpo, contratos_por_cliente = _calcular(anio_mes)

    with _cache_candado:
        expira = time.monotonic() + CACHE_TTL_SEGUNDOS
        _guardar_en_cache(_cache, anio_mes, (cuerpo, expira))
        _guardar_en_cache(_cache_contratos, anio_mes, (contratos_por_cliente, expira))
    # Se devuelve una copia superficial por la misma razón por la que el hit de
    # arriba la hace: el llamador no puede quedarse con una referencia al
    # diccionario guardado y cambiarle `de_cache` a la copia del caché.
    return dict(cuerpo)


def contratos_activos_por_cliente(anio_mes: str) -> dict[str, int]:
    """``{slug: nº de contratos activos}`` de los clientes LEGIBLES del período.

    Del caché de 5 minutos si está fresco (mismo TTL que ``/metricas``); si no,
    dispara ``metricas_del_periodo`` — que lo llena como efecto de calcular — y
    lo devuelve. Uso INTERNO exclusivo de ``plataforma_adopcion``: este dict
    JAMÁS sale al JSON de ningún endpoint.
    """
    ahora = time.monotonic()
    with _cache_candado:
        cacheado = _cache_contratos.get(anio_mes)
        if cacheado is not None and cacheado[1] > ahora:
            _cache_contratos.move_to_end(anio_mes)
            return dict(cacheado[0])

    metricas_del_periodo(anio_mes)

    with _cache_candado:
        cacheado = _cache_contratos.get(anio_mes)
        return dict(cacheado[0]) if cacheado is not None else {}


def limpiar_cache_metricas() -> None:
    """Para las pruebas, que arman una base nueva por prueba."""
    with _cache_candado:
        _cache.clear()
        _cache_contratos.clear()
