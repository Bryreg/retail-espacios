"""El catálogo de los tipos de mueble, del lado del servidor.

Lee ``app/catalogo/muebles.json``, que es una copia idéntica byte a byte de
``frontend/src/catalogo/muebles.json``: la imagen de Docker lleva ``backend/`` y
``frontend/dist``, no una carpeta compartida, así que cada lado tiene la suya y
``tests/test_catalogo_muebles.py`` exige que sean la misma.

── Lo que había antes ───────────────────────────────────────────────────────

El servidor tenía sus propias copias de lo que depende del tipo de mueble,
escritas a mano y vigiladas contra el frontend con expresiones regulares: los
prefijos (``renumeracion.py``), lo que nunca se alquila y las frases de
referencia (``layout_lookup.py``), y la clave de tarifa (``bulk_leases.py`` y
``plataforma_metricas.py``, dos veces la misma regla). Ahora esas tablas se
CALCULAN de acá y conservan su nombre en cada módulo, así que quien las usaba no
cambió. Lo que calculan sobre un plano lo compara ``test_catalogo_muebles.py``
contra ``frontend/scripts/casos/catalogo-antes.json``, lo que daban antes.

Sólo se lee lo que el servidor necesita: prefijo, si se alquila, tarifa y
referencia, y de los MODELOS (las fichas de muebles de verdad) sólo su tipo y
su tarifa propia: la media estiba, el cuarto de estiba y el exhibidor de cartón
se cobran aparte de su tipo (``tarifa_del_mueble``). Las medidas, los colores y los rótulos de los editores son del
navegador. Las claves de los tipos, los prefijos y las claves de tarifa no
cambian nunca: están en los planos guardados, en ``spaces.code`` y en las
tarifas de cada cliente.

Y las REGLAS DE UNA FICHA (``fichas`` en el archivo): la clave, la
confiabilidad, la geometría que admite cada familia y los largos de los textos.
Con ellas ``problemas_de_la_ficha`` valida la ficha propia que arma cada
supermercado (la tabla ``modelos_mueble``, ``routers/muebles.py``) con las MISMAS
reglas que ``probar-catalogo.mjs`` aplica a los modelos de este archivo, y que
``frontend/src/catalogo/fichas.ts`` aplica en el navegador: los dos lados corren
los casos de ``frontend/scripts/casos/fichas.json``.

La regla de las caras (``caras_de``, en ``layout_lookup.py``) no sale de acá:
es una regla con sus propios casos compartidos (``caras.json``). El catálogo
anota cuántas caras tiene cada variante de la góndola y la prueba comprueba que
las dos cosas digan lo mismo.
"""
from __future__ import annotations

import json
import math
import re
from pathlib import Path

#: El archivo. Va adentro de ``app/`` para que viaje con el código a la imagen.
RUTA = Path(__file__).resolve().parents[1] / "catalogo" / "muebles.json"

_DATOS: dict = json.loads(RUTA.read_text(encoding="utf-8"))

#: Los tipos, en el orden del archivo, y los nombres viejos del plano 2D
#: (``gondola_doble``/``gondola_mural``) que son un tipo con su variante.
TIPOS: dict[str, dict] = _DATOS["tipos"]
ALIAS: dict[str, dict] = _DATOS["alias"]

#: El prefijo del código de espacio de cada tipo y de cada alias.
PREFIJO_POR_TIPO: dict[str, str] = {
    **{tipo: d["prefijo"] for tipo, d in TIPOS.items()},
    **{alias: TIPOS[a["tipo"]]["prefijo"] for alias, a in ALIAS.items()},
}

#: Lo desconocido cae en SPC, como hace ``prefijoDe`` del frontend.
PREFIJO_DESCONOCIDO: str = _DATOS["prefijoDesconocido"]

#: Los tipos que nunca son espacio vendible, diga lo que diga la bandera:
#: ``alquilable: "nunca"`` (columna, caja, servicio al cliente).
NUNCA_ALQUILABLE: frozenset[str] = frozenset(
    tipo for tipo, d in TIPOS.items() if d["alquilable"] == "nunca"
)

#: La clave de tarifa de cada tipo y alias que la tiene. Las dos caras de una
#: góndola (doble o mural, y los dos nombres viejos del 2D) comparten la de
#: ``gondola``, porque el valor negociado también es por cara.
TARIFA_POR_TIPO: dict[str, str] = {
    **{tipo: d["tarifa"] for tipo, d in TIPOS.items() if d.get("tarifa")},
    **{alias: TIPOS[a["tipo"]]["tarifa"] for alias, a in ALIAS.items() if TIPOS[a["tipo"]].get("tarifa")},
}

#: La frase con que el plano del mercaderista nombra un mueble de referencia
#: («a la derecha de las cajas»), en el orden del minimapa.
REFERENCIAS: dict[str, str] = {
    tipo: TIPOS[tipo]["referencia"]["frase"] for tipo in _DATOS["orden"]["minimapa"]
}


#: Vender por partes (``partes`` en el archivo): qué es cada clase —la puerta
#: de la nevera, y lo que venga— una sola vez, con su token, si divide la cara,
#: el campo de ``partes`` que la cuenta, su tarifa y cómo la nombran los
#: informes. La regla la aplica ``services/partes.py``.
CLASES_DE_PARTE: dict[str, dict] = _DATOS["partes"]["clases"]

#: Los finales de código que ningún mueble puede tomar al renombrarse: los
#: tokens de las partes de hoy y de las que vienen, y la cara B.
RESERVADOS: frozenset[str] = frozenset(_DATOS["partes"]["reservados"])

#: Qué divisiones admite cada tipo (``tipos[t].partes.divisiones``).
DIVISIONES_POR_TIPO: dict[str, tuple[str, ...]] = {
    tipo: tuple((d.get("partes") or {}).get("divisiones") or ())
    for tipo, d in TIPOS.items() if (d.get("partes") or {}).get("divisiones")
}

#: Qué PIEZAS lleva cada tipo (``tipos[t].partes.piezas``): la bahía de
#: impulso de la caja, el forro de la columna. Una pieza no parte la cara: es
#: inventario de un mueble que nunca se vende entero, y se vende aunque el
#: mueble no sea comercializable.
PIEZAS_POR_TIPO: dict[str, tuple[str, ...]] = {
    tipo: tuple((d.get("partes") or {}).get("piezas") or ())
    for tipo, d in TIPOS.items() if (d.get("partes") or {}).get("piezas")
}

#: Las divisiones cuya cantidad NO va en la ficha de esa familia, sino en el
#: plano (``tipos[t].partes.seCuentanEnElPlano``): la ficha de una góndola es
#: un módulo, y cuántos tramos tiene depende del largo del corrido.
SE_CUENTAN_EN_EL_PLANO: dict[str, frozenset[str]] = {
    tipo: frozenset((d.get("partes") or {}).get("seCuentanEnElPlano") or ())
    for tipo, d in TIPOS.items() if (d.get("partes") or {}).get("seCuentanEnElPlano")
}


def tipo_de_tarifa(tipo: str) -> str:
    """La clave de tarifa de un tipo de mueble. Lo que no tiene tarifa —lo que
    no se vende, un tipo que el catálogo no conoce— contesta su propio tipo,
    como siempre. Para un mueble del plano, ``tarifa_del_mueble``, que mira
    antes su modelo."""
    return TARIFA_POR_TIPO.get(tipo, tipo)


#: Los modelos (fichas de muebles de verdad) que tienen tarifa propia: id →
#: (tipo, tarifa). Un mueble colocado desde uno guarda su id en ``modelo``, y
#: ni el id ni la tarifa de un modelo cambian nunca.
TARIFA_POR_MODELO: dict[str, tuple[str, str]] = {
    m["id"]: (m["tipo"], m["tarifa"]) for m in _DATOS.get("modelos", []) if m.get("tarifa")
}


def tipo_base(tipo: str) -> str:
    """El tipo de verdad de un tipo o de un alias del 2D
    (``gondola_mural`` → ``gondola``). Lo usan la tarifa por modelo y
    ``PUT /layout``, que no le rellena a un mueble la ficha de otro tipo."""
    return ALIAS.get(tipo, {}).get("tipo", tipo)


def tarifa_del_mueble(fixture: dict, propios: dict[str, tuple[str, str]] | None = None) -> str:
    """La clave de tarifa de un mueble del plano. Espeja ``rateTypeOf`` del
    frontend: primero la tarifa propia de su modelo —si el modelo la tiene y es
    del mismo tipo que el mueble—, y si no, la de su tipo, como siempre. Un
    mueble de un plano viejo no tiene ``modelo`` y da lo de siempre.

    ``propios`` son las fichas propias del supermercado que tienen tarifa
    (``cli:<clave>`` → (tipo, tarifa)), con la MISMA regla que los modelos de
    este archivo. Las lee de su base quien llama, UNA vez por pedido
    (``services/fichas_propias.tarifas_propias``): una planilla trae cientos de
    filas y la consola recorre todos los planos de todos los clientes. Sin
    ``propios``, un mueble de una ficha propia da la tarifa de su tipo."""
    tipo = str(fixture.get("type") or "")
    modelo = fixture.get("modelo")
    if isinstance(modelo, str):
        ficha = TARIFA_POR_MODELO.get(modelo)
        if ficha is None and propios:
            ficha = propios.get(modelo)
        if ficha and ficha[0] == tipo_base(tipo):
            return ficha[1]
    return tipo_de_tarifa(tipo)


# ─── Las reglas de una ficha ──────────────────────────────────────────────────
#
# Una FICHA es lo que describe un modelo: su familia, su nombre, sus medidas, la
# geometría que fija y de dónde salió. Los modelos de ``muebles.json`` las valida
# ``probar-catalogo.mjs``; las fichas propias de cada supermercado (la tabla
# ``modelos_mueble``) las valida esto, al guardarlas, con las mismas reglas —que
# viven en el archivo, en ``fichas``, para que los dos lados lean las mismas—.
# ``frontend/src/catalogo/fichas.ts`` es su espejo en el navegador y
# ``frontend/scripts/casos/fichas.json`` tiene los casos que corren los dos.

#: Las reglas de ``muebles.json``: la clave, la confiabilidad, la geometría y
#: los largos máximos.
REGLAS_DE_FICHA: dict = _DATOS["fichas"]

#: Una ficha propia viaja en el plano como ``cli:<clave>``; un modelo del
#: catálogo, como ``base:…``.
PREFIJO_PROPIO: str = REGLAS_DE_FICHA["prefijoPropio"]

#: La clave de una ficha propia. Es lo que guarda el plano y no cambia nunca.
#: Con ``fullmatch``: con ``match``, el ``$`` de Python deja pasar un salto de
#: línea al final.
_CLAVE = re.compile(REGLAS_DE_FICHA["clave"])
_ES_IMAGEN = re.compile(REGLAS_DE_FICHA["fuenteQueEsImagen"], re.IGNORECASE)
_URL = re.compile(r"https?://\S+", re.IGNORECASE)

#: Las familias que admiten fichas: las que tienen ``rango`` contra el que
#: medirlas.
FAMILIAS_CON_FICHA: dict[str, dict] = {
    tipo: d for tipo, d in TIPOS.items() if d.get("rango") and not d.get("legado")
}

#: Las tarifas propias que puede llevar una ficha de cada familia: las de los
#: modelos de esa familia en el catálogo (la media estiba, el exhibidor de
#: cartón). Son las que la pantalla de Tarifas ya ofrece; una ficha no inventa
#: una tarifa que nadie puede cargar.
TARIFAS_DE_FICHA: dict[str, frozenset[str]] = {
    tipo: frozenset(m["tarifa"] for m in _DATOS.get("modelos", []) if m["tipo"] == tipo and m.get("tarifa"))
    for tipo in FAMILIAS_CON_FICHA
}

#: Lo que puede traer una ficha propia, y nada más: ni foto, ni color, ni id.
CAMPOS_DE_FICHA_PROPIA: tuple[str, ...] = (
    "clave", "tipo", "variante", "nombre", "w", "d", "h",
    "entrepanos", "modulo", "partes", "tarifa", "fuente",
)
CAMPOS_DE_FUENTE: tuple[str, ...] = ("url", "nota", "confiabilidad")

_NOMBRE_DE_MEDIDA = {"w": "el ancho", "d": "el fondo", "h": "el alto"}
_NOMBRE_DE_GEOMETRIA = {"entrepanos": "los entrepaños", "modulo": "el módulo", "puertas": "las puertas",
                        "tramos": "los tramos", "bahias": "las bahías de impulso", "forro": "el forro",
                        "division": "cómo se vende por partes"}

#: Lo que puede vivir adentro de ``partes`` de un mueble o de una ficha, con su
#: tipo: las claves de ``fichas.geometria`` que van en ``partes``. Es la lista
#: blanca que copian el enlace de la mercaderista (``_solo_geometria``) y el
#: visor de Vender (``sinDatosComerciales``): un número donde va un número, un
#: sí o no donde va un sí o no (el forro), una palabra de la lista cerrada
#: donde va una palabra, y nada más.
CAMPOS_DE_PARTES: dict[str, dict] = {
    campo: regla for campo, regla in REGLAS_DE_FICHA["geometria"].items() if regla["enPartes"]
}


def _valores_de(regla: dict, familia: dict | None) -> tuple[str, ...] | None:
    """La lista cerrada de un campo de palabras (``division``): la de su
    familia (``partes.divisiones``) o, sin familia, la de todas las clases.
    ``None`` si el campo es un número."""
    clave = regla.get("valores")
    if not clave:
        return None
    if familia is None:
        return tuple(CLASES_DE_PARTE)
    return tuple((familia.get("partes") or {}).get(clave) or ())


def _numero(x) -> bool:
    """Un número de verdad, y que entre en un ``float``: un entero de JSON de
    cientos de cifras lanzaba ``OverflowError`` en ``isfinite`` (y en el
    ``float()`` de la regla de los enteros), y la API contestaba 500 en vez del
    422 por campo."""
    if not isinstance(x, (int, float)) or isinstance(x, bool):
        return False
    try:
        return math.isfinite(float(x))
    except OverflowError:
        return False


def _texto(x) -> bool:
    return isinstance(x, str) and bool(x.strip())


def _largo(x: str) -> int:
    """En letras de verdad (puntos de código), como ``[...texto].length`` del
    navegador."""
    return len(x.strip())


def _m(x: float) -> str:
    return f"{x:.2f}".replace(".", ",")


def problemas_de_la_ficha(ficha, *, nueva: bool = True) -> list[tuple[str, str]]:
    """Lo que está mal en una ficha propia, como ``(campo, problema)``. Vacía
    es que se puede guardar.

    Las reglas son las del catálogo: la familia existe y admite fichas, las
    medidas están dentro del ``rango`` de la familia, la geometría es sólo la
    que admite su ``geometria`` (y dentro de su rango, entera donde corresponde),
    la tarifa propia es una de las de su familia, la fuente dice cuánto confiar
    y de dónde salió —una URL http(s) que no sea una imagen, o una nota— y los
    textos tienen largo máximo. ``nueva`` pide la clave (el alta); al editar,
    la clave es la de la ruta y no se cambia.

    Los campos se llaman igual que en ``fichas.ts`` (``w``, ``partes.puertas``,
    ``fuente.url``…): los casos compartidos comparan los campos con problemas.
    """
    mal: list[tuple[str, str]] = []
    if not isinstance(ficha, dict):
        return [("ficha", "la ficha tiene que ser un objeto")]
    for k in ficha:
        if k not in CAMPOS_DE_FICHA_PROPIA:
            if k == "foto":
                mal.append((k, "una ficha no lleva foto: sólo medidas y de dónde salieron"))
            else:
                mal.append((str(k), f"«{k}» no es un dato de la ficha"))

    clave = ficha.get("clave")
    if clave is not None or nueva:
        if not isinstance(clave, str) or not _CLAVE.fullmatch(clave):
            mal.append(("clave", "la clave son minúsculas, números y guiones, hasta 60: "
                                 "es lo que guarda el plano y no cambia nunca"))

    tipo = ficha.get("tipo")
    familia = FAMILIAS_CON_FICHA.get(tipo) if isinstance(tipo, str) else None
    if familia is None:
        if isinstance(tipo, str) and tipo in TIPOS:
            mal.append(("tipo", f"la familia «{tipo}» no admite fichas"))
        else:
            mal.append(("tipo", "falta la familia, o no existe"))

    largos = REGLAS_DE_FICHA["largoMaximo"]
    nombre = ficha.get("nombre")
    if not _texto(nombre):
        mal.append(("nombre", "falta el nombre"))
    elif _largo(nombre) > largos["nombre"]:
        mal.append(("nombre", f"el nombre tiene hasta {largos['nombre']} letras"))

    if familia is not None:
        variantes = familia.get("variantes")
        variante = ficha.get("variante")
        if variantes:
            if not isinstance(variante, str) or variante not in variantes:
                mal.append(("variante", "la variante tiene que ser una de " + ", ".join(variantes)))
        elif variante is not None:
            mal.append(("variante", f"«{tipo}» no tiene variantes"))

        for k in ("w", "d", "h"):
            v = ficha.get(k)
            r = familia["rango"][k]
            if v is None:
                mal.append((k, f"falta {_NOMBRE_DE_MEDIDA[k]}, en metros"))
            elif not _numero(v):
                mal.append((k, f"{_NOMBRE_DE_MEDIDA[k]} tiene que ser un número, en metros"))
            elif not r[0] <= v <= r[1]:
                mal.append((k, f"{_NOMBRE_DE_MEDIDA[k]} ({_m(v)} m) está fuera del rango de su familia "
                               f"({_m(r[0])} a {_m(r[1])} m)"))

        partes = ficha.get("partes")
        if partes is not None and not (
            isinstance(partes, dict) and all(k in CAMPOS_DE_PARTES for k in partes)
        ):
            mal.append(("partes", "las partes sólo llevan lo conocido (las puertas, los tramos, las bahías de "
                                  "impulso, el forro y cómo se vende)"))
            partes = None
        admite = familia.get("geometria") or {}
        en_el_plano = SE_CUENTAN_EN_EL_PLANO.get(tipo, frozenset())
        #: Los campos que cuentan una división que se cuenta en el plano: no
        #: van en la ficha (los tramos de una góndola).
        del_plano = {CLASES_DE_PARTE[c]["campo"] for c in en_el_plano if c in CLASES_DE_PARTE}
        #: Los campos que cuentan las piezas de la familia (``partes.bahias``
        #: de la caja, ``partes.forro`` de la columna).
        de_sus_piezas = {
            CLASES_DE_PARTE[c]["campo"] for c in (familia.get("partes") or {}).get("piezas") or ()
            if c in CLASES_DE_PARTE
        }
        for campo, regla in REGLAS_DE_FICHA["geometria"].items():
            donde = f"partes.{campo}" if regla["enPartes"] else campo
            v = (partes or {}).get(campo) if regla["enPartes"] else ficha.get(campo)
            if v is None:
                continue
            if regla.get("booleano"):
                # Un sí o no (el forro de una columna): lo lleva la familia
                # que tiene una pieza contada con él.
                if campo not in de_sus_piezas:
                    mal.append((donde, f"la familia «{tipo}» no lleva {_NOMBRE_DE_GEOMETRIA[campo]}"))
                elif not isinstance(v, bool):
                    mal.append((donde, f"{_NOMBRE_DE_GEOMETRIA[campo]} es sí o no"))
                continue
            valores = _valores_de(regla, familia)
            if valores is not None:
                # Una palabra de una lista cerrada: cómo se vende por partes.
                if not valores and de_sus_piezas:
                    mal.append((donde, f"la familia «{tipo}» no se divide: lo que se vende son sus piezas"))
                elif not valores:
                    mal.append((donde, f"la familia «{tipo}» se vende entera: no tiene partes"))
                elif not isinstance(v, str) or v not in valores:
                    mal.append((donde, "se vende por " + " o por ".join(
                        CLASES_DE_PARTE[c]["plural"] for c in valores)))
                elif v not in en_el_plano:
                    # Dividir pide saber en cuántas: sin la cuenta no hay
                    # partes. La cuenta vive en `partes` (las puertas, los
                    # tramos) o en la ficha (los entrepaños, con la base).
                    clase = CLASES_DE_PARTE[v]
                    regla_campo = REGLAS_DE_FICHA["geometria"][clase["campo"]]
                    n = (partes or {}).get(clase["campo"]) if regla_campo["enPartes"] else ficha.get(clase["campo"])
                    base = 1 if clase.get("base") else 0
                    if not (_numero(n) and float(n) == int(n) and n + base >= clase["minimo"]):
                        al_menos = clase["minimo"] - base
                        sin_base = ", sin contar la base" if base else ""
                        mal.append((donde, f"para venderla por {clase['plural']}, la ficha dice cuánt"
                                           f"{'a' if clase.get('genero') == 'f' else 'o'}s ({al_menos} o más{sin_base})"))
                continue
            if campo in del_plano:
                mal.append((donde, f"en la ficha de «{tipo}» no van {_NOMBRE_DE_GEOMETRIA[campo]}: dependen del "
                                   "largo del corrido y se fijan en el plano, uno por módulo"))
                continue
            r = admite.get(campo)
            if r is None:
                mal.append((donde, f"la familia «{tipo}» no lleva {_NOMBRE_DE_GEOMETRIA[campo]}"))
            elif not _numero(v) or (regla["entero"] and float(v) != int(v)) or not r[0] <= v <= r[1]:
                entero = " (entero)" if regla["entero"] else ""
                mal.append((donde, f"{_NOMBRE_DE_GEOMETRIA[campo]} van de {r[0]} a {r[1]}{entero}"))

        tarifa = ficha.get("tarifa")
        if tarifa is not None:
            propias = TARIFAS_DE_FICHA.get(tipo, frozenset())
            if tarifa == familia.get("tarifa"):
                mal.append(("tarifa", "es la tarifa de su familia: dejala vacía"))
            elif not isinstance(tarifa, str) or tarifa not in propias:
                otras = ", ".join(sorted(propias)) or "ninguna"
                mal.append(("tarifa", f"la tarifa propia tiene que ser una de las de su familia ({otras})"))

    fuente = ficha.get("fuente")
    if not isinstance(fuente, dict):
        mal.append(("fuente", "falta la fuente: cuánto confiar y la URL de la ficha o una nota"))
    else:
        for k in fuente:
            if k not in CAMPOS_DE_FUENTE:
                mal.append((f"fuente.{k}", f"«{k}» no es un dato de la fuente"))
        if fuente.get("confiabilidad") not in REGLAS_DE_FICHA["confiabilidad"]:
            mal.append(("fuente.confiabilidad",
                        "la confiabilidad es " + ", ".join(REGLAS_DE_FICHA["confiabilidad"])))
        url, nota = fuente.get("url"), fuente.get("nota")
        if url is not None and not isinstance(url, str):
            mal.append(("fuente.url", "la URL tiene que ser un texto"))
        elif _texto(url):
            if _largo(url) > largos["url"]:
                mal.append(("fuente.url", f"la URL tiene hasta {largos['url']} letras"))
            elif not _URL.fullmatch(url.strip()):
                mal.append(("fuente.url", "la URL empieza con http:// o https://, sin espacios"))
            elif _ES_IMAGEN.search(url.strip()):
                mal.append(("fuente.url", "la fuente es una imagen: se guarda la página de la ficha, nunca una foto"))
        if nota is not None and not isinstance(nota, str):
            mal.append(("fuente.nota", "la nota tiene que ser un texto"))
        elif _texto(nota) and _largo(nota) > largos["nota"]:
            mal.append(("fuente.nota", f"la nota tiene hasta {largos['nota']} letras"))
        if not _texto(url) and not _texto(nota):
            mal.append(("fuente", "decí de dónde salió: la URL de la ficha o una nota"))
    return mal


def ficha_normalizada(ficha: dict) -> dict:
    """Lo que se guarda de una ficha ya validada (``problemas_de_la_ficha``
    vacía), sin la clave: los textos sin espacios de más, las medidas al
    milímetro, los enteros como enteros, y sin lo que vino vacío."""
    salida: dict = {"tipo": ficha["tipo"], "nombre": ficha["nombre"].strip()}
    if ficha.get("variante") is not None:
        salida["variante"] = ficha["variante"]
    for k in ("w", "d", "h"):
        salida[k] = round(float(ficha[k]), 3)
    if ficha.get("entrepanos") is not None:
        salida["entrepanos"] = int(ficha["entrepanos"])
    if ficha.get("modulo") is not None:
        salida["modulo"] = round(float(ficha["modulo"]), 3)
    # De `partes`, cada clave conocida con su tipo (`CAMPOS_DE_PARTES`): hasta
    # vender por partes se guardaban sólo las puertas, y la manera de venderla
    # que la dueña eligió en el taller se perdía sin aviso.
    partes = {}
    for campo, regla in CAMPOS_DE_PARTES.items():
        v = (ficha.get("partes") or {}).get(campo)
        if v is None:
            continue
        if regla.get("valores"):
            partes[campo] = v
        elif regla.get("booleano"):
            partes[campo] = bool(v)
        else:
            partes[campo] = int(v) if regla["entero"] else round(float(v), 3)
    if partes:
        salida["partes"] = partes
    if ficha.get("tarifa") is not None:
        salida["tarifa"] = ficha["tarifa"]
    fuente = ficha["fuente"]
    salida["fuente"] = {"confiabilidad": fuente["confiabilidad"]}
    for k in ("url", "nota"):
        if _texto(fuente.get(k)):
            salida["fuente"][k] = fuente[k].strip()
    return salida
