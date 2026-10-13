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
referencia. Las medidas, los colores y los rótulos de los editores son del
navegador. Las claves de los tipos, los prefijos y las claves de tarifa no
cambian nunca: están en los planos guardados, en ``spaces.code`` y en las
tarifas de cada cliente.

La regla de las caras (``caras_de``, en ``layout_lookup.py``) no sale de acá:
es una regla con sus propios casos compartidos (``caras.json``). El catálogo
anota cuántas caras tiene cada variante de la góndola y la prueba comprueba que
las dos cosas digan lo mismo.
"""
from __future__ import annotations

import json
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


def tipo_de_tarifa(tipo: str) -> str:
    """La clave de tarifa de un tipo de mueble. Espeja ``rateTypeOf`` del
    frontend: lo que no tiene tarifa —lo que no se vende, un tipo que el
    catálogo no conoce— contesta su propio tipo, como siempre."""
    return TARIFA_POR_TIPO.get(tipo, tipo)
