"""Vender por partes: la nevera entera o por puertas; el mural, la góndola, la
nevera abierta o la de vegetales, enteros o por tramos; la góndola y la punta,
enteras o por entrepaños. Y las PIEZAS de lo que nunca se vende entero: las
bahías de impulso de una caja, una por una (``CAJ-04-BI1``), y el forro de una
columna (``COL-07-FO``).

La dueña lo pidió así: **las marcas pagan la nevera entera o por puertas, pero
nunca las dos en las mismas fechas; dos puertas distintas, sí.** Y eligió el
código: ``NEV-03-PU2`` es la puerta 2 de la nevera ``NEV-03``, contando de
izquierda a derecha mirando su frente. Ese código queda para siempre en
contratos, correos, planillas y enlaces de montaje. Lo mismo para los tramos
(``GON-05-B-TR2``: el tramo 2 de la cara B, de izquierda a derecha mirando esa
cara) y los entrepaños (``PUN-02-EN1``: la base, contando de abajo hacia
arriba): «cada repisa con proveedor y precio por entrepaño, pero siempre
dejando la opción de vender toda la cara». Un mueble se divide de UNA sola
forma.

── Una parte es un espacio más ──────────────────────────────────────────────

No hay tabla nueva ni columna nueva. Una puerta vendida es una fila más de
``spaces`` —con su código derivado— y su contrato es un ``space_leases`` como
cualquier otro. La relación entre la cara y sus partes **se deduce del
código** (``partir_codigo``), así que el conflicto se decide igual por todos
los caminos que crean un contrato (la planilla, Vender, el contrato suelto, la
importación del plano), sin consultar cómo está configurado hoy el plano.

── Tres niveles de configuración ───────────────────────────────────────────

· la FAMILIA (``muebles.json``, ``tipos[t].partes.divisiones``) dice de qué
  formas se puede dividir;
· el MODELO (de RECABRA o una ficha propia) dice cuál usa y en cuántas;
· el MUEBLE del plano lo guarda ESTAMPADO en ``partes`` (``division`` y su
  cuenta) y es lo único que cuenta para vender.

Un mueble sin ``partes.division`` se vende entero, como siempre: la nevera de
la dueña colocada antes (``NEV-01``) no cambia sola aunque tenga
``partes.puertas``.

── Las piezas ───────────────────────────────────────────────────────────────

Una caja y una columna nunca se venden enteras (son operación de la tienda);
lo que sí se vende es una PIEZA de ellas: cada bahía de impulso del lado del
cliente de la caja (``partes.bahias``: cuántas, de izquierda a derecha mirando
la caja desde la fila) y el forro de la columna (``partes.forro``: sí o no).
Una pieza no parte ninguna cara —no hay cara que vender—, así que no choca
con nada más que consigo misma, se ofrece aunque el mueble no sea
comercializable, va siempre en la cara A y su tarifa es la de su clase, sin
respaldo. Una caja de un plano de antes no tiene ``partes.bahias``: no ofrece
nada, como siempre.

El espejo de este módulo en el navegador es ``frontend/src/utils/partes.ts``.
Los dos corren los casos de ``frontend/scripts/casos/partes.json``
(``tests/test_partes.py`` y ``scripts/probar-partes.mjs``).

No importa ``layout_lookup``: ese módulo importa éste.
"""
from __future__ import annotations

import math
import re
from dataclasses import dataclass

from app.services.catalogo_muebles import (
    CAMPOS_DE_PARTES, CLASES_DE_PARTE, DIVISIONES_POR_TIPO, PIEZAS_POR_TIPO, REGLAS_DE_FICHA, RESERVADOS, TIPOS,
    tarifa_del_mueble, tipo_base,
)

#: token → clase (``"PU"`` → ``"puertas"``). Sólo las clases que el catálogo
#: tiene HOY: un ``TR2`` antes de que existan los tramos es parte del nombre del
#: mueble, que es lo que era ayer.
CLASE_POR_TOKEN: dict[str, str] = {c["token"]: clase for clase, c in CLASES_DE_PARTE.items()}

#: El último tramo de un código que es una parte numerada: dos letras y un
#: número de 1 a 99 sin ceros adelante.
_NUMERADA = re.compile(r"([A-Z]{2})([1-9][0-9]?)")


@dataclass(frozen=True)
class Parte:
    """Qué parte de la cara: la clase (``puertas``), su token (``PU``) y el
    número (1 es la de la izquierda mirando el frente). ``n`` es ``None`` en una
    pieza única (el forro de una columna, cuando llegue)."""
    clase: str
    token: str
    n: int | None

    @property
    def sufijo(self) -> str:
        return f"{self.token}{self.n}" if self.n is not None else self.token


@dataclass(frozen=True)
class CodigoPartido:
    """Un código de espacio, partido: el código del mueble (con la sede si la
    traía), la cara y la parte (``None`` es la cara entera)."""
    base: str
    cara: str
    parte: Parte | None

    @property
    def cara_entera(self) -> str:
        """El código de la cara a la que pertenece: ``NAVE-NEV-03-PU2`` →
        ``NAVE-NEV-03``."""
        return codigo_de_parte(self.base, self.cara, None)


def normalizar(texto) -> str:
    """Trim + mayúsculas, como ``normalizar`` de ``layout_lookup``."""
    return ("" if texto is None else str(texto)).strip().upper()


def partir_codigo(codigo) -> CodigoPartido:
    """``NAVE-NEV-03-PU2`` → (``NAVE-NEV-03``, A, PU2); ``GON-05-B`` → (``GON-05``,
    B, entera).

    De derecha a izquierda, y sin necesitar la sede: si el último tramo es una
    parte de una clase que existe, es la parte; después, si lo que queda termina
    en ``-B``, es la cara B. ``CIUDAD JARDIN-NEV-03-PU2`` se parte igual.

    Quien resuelve contra el PLANO prueba primero el texto tal cual (un mueble
    viejo que se llamara literalmente ``X-PU2`` sigue siendo él mismo): esto es
    sólo la forma.
    """
    c = normalizar(codigo)
    parte = None
    resto = c
    corte = c.rfind("-")
    if corte > 0:
        ultimo = c[corte + 1:]
        m = _NUMERADA.fullmatch(ultimo)
        if m and m.group(1) in CLASE_POR_TOKEN:
            clase = CLASE_POR_TOKEN[m.group(1)]
            if not CLASES_DE_PARTE[clase].get("unico"):
                parte = Parte(clase, m.group(1), int(m.group(2)))
        elif ultimo in CLASE_POR_TOKEN and CLASES_DE_PARTE[CLASE_POR_TOKEN[ultimo]].get("unico"):
            parte = Parte(CLASE_POR_TOKEN[ultimo], ultimo, None)
        if parte is not None:
            resto = c[:corte]
    if resto.endswith("-B") and len(resto) > 2:
        return CodigoPartido(resto[:-2], "B", parte)
    return CodigoPartido(resto, "A", parte)


def codigo_de_parte(base: str, cara: str, parte: Parte | None) -> str:
    """Al revés de ``partir_codigo``: ``(NAVE-GON-05, B, TR2)`` →
    ``NAVE-GON-05-B-TR2``. La cara B va antes que la parte."""
    c = normalizar(base)
    if cara == "B":
        c += "-B"
    if parte is not None:
        c += f"-{parte.sufijo}"
    return c


def es_division(parte: Parte | None) -> bool:
    """¿La parte divide la cara (puertas, tramos, entrepaños)? Las piezas (la
    bahía de una caja, el forro de una columna) no: son inventario aparte."""
    return parte is not None and CLASES_DE_PARTE[parte.clase]["es"] == "division"


def es_pieza(parte: Parte | None) -> bool:
    """¿Es una pieza de un mueble que no se vende entero (la bahía de impulso
    de una caja, el forro de una columna)?"""
    return parte is not None and CLASES_DE_PARTE[parte.clase]["es"] == "pieza"


def chocan(a: CodigoPartido, b: CodigoPartido) -> bool:
    """¿Dos espacios no se pueden vender en fechas que se pisan?

    · el mismo espacio, sí;
    · la cara entera y una de sus divisiones, sí (la nevera entera o por
      puertas, nunca las dos);
    · dos divisiones de la misma clase, no (dos puertas distintas conviven);
    · dos divisiones de clases distintas de la misma cara, sí: se pisan
      físicamente (el tramo 2 y el entrepaño 3 comparten una repisa). Un
      mueble se divide de UNA forma, pero una restauración o un script podrían
      haber dejado contratos de las dos;
    · una pieza no choca con nada más que consigo misma.

    Es ESTRUCTURAL: se decide por los códigos, no por cómo está configurado el
    plano hoy. Un contrato de ``PU3`` sigue chocando con la nevera entera
    aunque alguien la haya bajado a dos puertas por un camino que no pasó por
    la guarda.
    """
    if a == b:
        return True
    if a.base != b.base or a.cara != b.cara:
        return False
    if a.parte is None:
        return es_division(b.parte)
    if b.parte is None:
        return es_division(a.parte)
    return es_division(a.parte) and es_division(b.parte) and a.parte.clase != b.parte.clase


# ─── La configuración del mueble del plano ────────────────────────────────────


def _entero(v) -> bool:
    """Un entero de verdad: en Python ``True`` es un ``int`` y no es una
    cantidad de puertas."""
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        return False
    try:
        return math.isfinite(float(v)) and float(v) == int(v)
    except (OverflowError, ValueError):
        return False


def valor_del_campo(fixture: dict, campo: str):
    """Lo que el mueble guardó en ese campo de la ficha: adentro de ``partes``
    (las puertas, los tramos) o en el mueble (los entrepaños), según
    ``fichas.geometria`` del catálogo."""
    regla = REGLAS_DE_FICHA["geometria"].get(campo)
    if regla is None:
        return None
    if regla["enPartes"]:
        partes = fixture.get("partes")
        return partes.get(campo) if isinstance(partes, dict) else None
    return fixture.get(campo)


def cantidad_de(fixture: dict, clase: str) -> int | None:
    """Cuántas partes de esa clase tiene la cara, o ``None`` si el mueble no lo
    dice bien: el campo que la cuenta es un número entero dentro del rango de
    su familia, y con la base (los entrepaños) da al menos el mínimo de la
    clase. No se recorta ni se adivina: lo que no cierra no se vende por
    partes. Una góndola con 4 entrepaños guardados vende 5: la base (``EN1``)
    y los 4 —los cinco llevan producto—; sin entrepaños guardados no hay
    cuenta, y se vende entera."""
    regla = CLASES_DE_PARTE.get(clase)
    if regla is None or not isinstance(fixture, dict):
        return None
    v = valor_del_campo(fixture, regla["campo"])
    if not _entero(v):
        return None
    n = int(v)
    rango = (TIPOS.get(tipo_base(str(fixture.get("type") or ""))) or {}).get("geometria", {}).get(regla["campo"])
    if rango and not rango[0] <= n <= rango[1]:
        return None
    total = n + (1 if regla.get("base") else 0)
    if total < regla.get("minimo", 1):
        return None
    return total


def division_de(fixture: dict) -> tuple[str, int] | None:
    """La forma en que se divide la cara y en cuántas partes, o ``None`` si se
    vende entera. Vale sólo una ``division`` que su familia admite y con su
    cuenta bien escrita: un texto que no es de la lista no sale nunca."""
    partes = fixture.get("partes")
    if not isinstance(partes, dict):
        return None
    clase = partes.get("division")
    if not isinstance(clase, str):
        return None
    if clase not in DIVISIONES_POR_TIPO.get(tipo_base(str(fixture.get("type") or "")), ()):
        return None
    n = cantidad_de(fixture, clase)
    return (clase, n) if n is not None else None


def piezas_de(fixture: dict) -> list[Parte]:
    """Las piezas que el mueble pone a la venta: ``[BI1, BI2]`` de una caja con
    dos bahías de impulso, ``[FO]`` de una columna forrada. Sólo las que su
    familia lleva (``partes.piezas``) y con su campo bien escrito: un entero
    dentro del rango de la familia (las bahías) o un ``true`` (el forro). Lo que
    no cierra no se vende, y una caja sin ``partes.bahias`` no ofrece nada."""
    if not isinstance(fixture, dict):
        return []
    fuera: list[Parte] = []
    for clase in PIEZAS_POR_TIPO.get(tipo_base(str(fixture.get("type") or "")), ()):
        regla = CLASES_DE_PARTE.get(clase)
        if regla is None or regla["es"] != "pieza":
            continue
        if regla.get("unico"):
            if valor_del_campo(fixture, regla["campo"]) is True:
                fuera.append(Parte(clase, regla["token"], None))
            continue
        n = cantidad_de(fixture, clase)
        if n:
            fuera.extend(Parte(clase, regla["token"], k) for k in range(1, n + 1))
    return fuera


def partes_de(fixture: dict, caras: int, comercializable: bool) -> list[tuple[str, Parte]]:
    """Las partes que el mueble pone a la venta, por cara: ``[("A", PU1), …]``.

    ``caras`` y ``comercializable`` los dice quien llama (``caras_de`` y
    ``es_comercializable`` de ``layout_lookup``): una división parte una cara
    que se vende, así que un mueble no comercializable no ofrece ninguna. Las
    PIEZAS van aparte y al final, siempre en la cara A: se ofrecen aunque el
    mueble no sea comercializable (la caja y la columna no lo son nunca).
    """
    fuera: list[tuple[str, Parte]] = []
    div = division_de(fixture) if comercializable else None
    if div is not None:
        clase, n = div
        token = CLASES_DE_PARTE[clase]["token"]
        fuera = [(cara, Parte(clase, token, k)) for cara in ("A", "B")[:max(1, caras)] for k in range(1, n + 1)]
    fuera.extend(("A", p) for p in piezas_de(fixture))
    return fuera


def firma_de_partes(fixture: dict) -> dict[str, int | None]:
    """Lo que decide DÓNDE cae cada parte vendida, por clase: la cantidad si el
    mueble se divide de esa forma, ``None`` si no. Con una parte vendida, que
    cambie esto es mover lo vendido (``partes_que_se_moverian``). Las piezas,
    por cuántas hay (las bahías parten la mesa en partes iguales: de 2 a 3, la
    bahía 1 queda en otro lugar) o, el forro, 1 si lo tiene."""
    div = division_de(fixture)
    firma = {clase: (div[1] if div and div[0] == clase else None) for clase in CLASES_DE_PARTE}
    for p in piezas_de(fixture):
        firma[p.clase] = max(firma.get(p.clase) or 0, p.n or 1)
    return firma


def partes_tipadas(partes) -> dict:
    """De ``partes``, sólo lo conocido y con su tipo (``CAMPOS_DE_PARTES``): un
    entero donde va un entero, una palabra de la lista cerrada donde va una
    palabra. Es lo que sale hacia quien no ve plata (la mercaderista); un
    objeto entero en una lista blanca se llevaría lo que le escriban adentro
    mañana."""
    if not isinstance(partes, dict):
        return {}
    fuera: dict = {}
    for campo, regla in CAMPOS_DE_PARTES.items():
        v = partes.get(campo)
        if regla.get("valores"):
            if isinstance(v, str) and v in CLASES_DE_PARTE:
                fuera[campo] = v
        elif regla.get("booleano"):
            if isinstance(v, bool):
                fuera[campo] = v
        elif regla["entero"]:
            if _entero(v):
                fuera[campo] = v
        elif isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v):
            fuera[campo] = v
    return fuera


# ─── Cómo se dice ─────────────────────────────────────────────────────────────


def concordancia(clase: str) -> dict[str, str]:
    """Las palabras que concuerdan con la clase: «una puerta vendida, la otra,
    esta», «un tramo vendido, el otro, este». Del catálogo (``genero``)."""
    f = (CLASES_DE_PARTE.get(clase) or {}).get("genero") != "m"
    return {
        "un": "una" if f else "un", "el": "la" if f else "el", "los": "las" if f else "los",
        "o": "a" if f else "o", "este": "esta" if f else "este",
    }


def texto_de_parte(parte: Parte, de: int | None = None) -> str:
    """``Puerta 2 de 3``: sin el «de» si no se sabe cuántas hay."""
    regla = CLASES_DE_PARTE[parte.clase]
    nombre = regla["singular"][:1].upper() + regla["singular"][1:]
    if parte.n is None:
        return nombre
    return f"{nombre} {parte.n}" + (f" de {de}" if de else "")


def texto_para_montar(parte: Parte, de: int | None = None) -> str:
    """Lo que lee la mercaderista: cuál es, contada desde dónde. Los
    entrepaños, de abajo hacia arriba y con la base como el 1: es la bandeja
    que se apoya en el zócalo, y también lleva producto. Las bahías de una
    caja, mirándola desde la fila (``mirando`` de la clase); el forro, que es
    uno solo, con el nombre con que lo dicen los informes («Forro de
    columna»)."""
    regla = CLASES_DE_PARTE[parte.clase]
    texto = texto_de_parte(parte, de)
    if parte.n is None:
        nombre = regla.get("informe") or regla["singular"]
        return nombre[:1].upper() + nombre[1:]
    if regla.get("eje") == "ancho":
        return f"{texto}, contando de izquierda a derecha mirando {regla.get('mirando') or 'el frente'}"
    if regla.get("eje") == "alto":
        base = " (el 1 es la base)" if regla.get("base") else ""
        return f"{texto}, contando de abajo hacia arriba{base}"
    return texto


# ─── La tarifa de referencia ──────────────────────────────────────────────────


def redondear(x: float) -> int:
    """Al peso más cercano, con los medios hacia arriba. ``round`` de Python
    redondea al par y ``Math.round`` hacia arriba: 2.500.000 / 4 da lo mismo en
    los dos lados, pero 1.000.001 / 2 no. Los dos usan ``floor(x + 0.5)``."""
    return math.floor(x + 0.5)


def _tarifa(rates: dict | None, sede: str, clave: str) -> float | None:
    """``referenceRateFor`` del navegador: la de la sede si es un número > 0,
    si no la general si lo es."""
    if not rates or not clave:
        return None
    for fuente in ((rates.get("by_sede") or {}).get(sede) or {}, rates.get("default") or {}):
        v = fuente.get(clave) if isinstance(fuente, dict) else None
        if isinstance(v, (int, float)) and not isinstance(v, bool) and v > 0:
            return v
    return None


def referencia_de_espacio(
    rates: dict | None, sede: str, fixture: dict, parte: Parte | None,
    propios: dict[str, tuple[str, str]] | None = None,
) -> tuple[float | None, str]:
    """La tarifa de referencia de un espacio y de dónde salió.

    · la cara entera: la del mueble (``tarifa_del_mueble``), ``"cara"``;
    · una división: la de su clase (``parte_puerta``), ``"clase"``, y si está
      vacía, la de la cara dividida por la cantidad de partes, ``"cara/n"``;
    · una pieza: la de su clase, sin respaldo.

    La sede gana sobre la general en cada paso, como siempre.
    """
    tarifa_cara = tarifa_del_mueble(fixture, propios)
    if parte is None:
        return _tarifa(rates, sede, tarifa_cara), "cara"
    regla = CLASES_DE_PARTE[parte.clase]
    propia = _tarifa(rates, sede, regla["tarifa"])
    if propia is not None:
        return propia, "clase"
    if regla["es"] != "division":
        return None, ""
    n = cantidad_de(fixture, parte.clase)
    base = _tarifa(rates, sede, tarifa_cara)
    if base is None or not n:
        return None, ""
    return redondear(base / n), "cara/n"


def termina_reservado(codigo: str) -> bool:
    """¿El nombre termina como el código de una parte o de la cara B?
    (``GON-01-B``, ``NEV-03-PU2``, ``GON-01-TR2``, ``CAJ-04-FO``). Incluye los
    tokens de lo que todavía no se vende, para que mañana ningún mueble se
    llame así."""
    c = normalizar(codigo)
    corte = c.rfind("-")
    if corte <= 0:
        return False
    ultimo = c[corte + 1:]
    m = re.fullmatch(r"([A-Z]{1,2})([0-9]*)", ultimo)
    return bool(m) and m.group(1) in RESERVADOS
