"""La superficie comercializable de una cara: qué rectángulo de la cara se
vende por participación, qué partes de él no (zócalo, parantes, copete…) y a
qué distancia del mueble se dibujan las zonas en el 3D.

Gemela de ``frontend/src/utils/superficie.ts``: las dos corren
``frontend/scripts/casos/superficies.json`` (con
``tests/test_participaciones_geometria.py`` de este lado y
``scripts/probar-superficies.mjs`` del otro). Con ESTA superficie se calcula
lo que se dibujó de cada participación, así que las dos tienen que dar los
mismos números, bit a bit (ver ``zonas_geometria.py``).

Cada tipo que se vende por participación declara su receta en el catálogo
(``tipos[t].superficie.receta``; la unión ``RecetaDeSuperficie`` de
``frontend/src/catalogo/catalogo.ts``). Las cotas salen de lo que dibuja el 3D:
las de la góndola, la punta y el robatope son de
``frontend/src/components/StoreEditor3D/muebles/medidas.ts`` y van COPIADAS
acá (``test_participaciones_geometria.py`` compara la copia con ese archivo);
las de la ristra, la cruz y la vitrina están escritas en
``StoreEditor3D.tsx`` y las amarra ``probar-superficies.mjs``.

Coordenadas (§8 del diseño de participaciones): el marco local del mueble
tiene el origen en el centro de la huella, en el piso, ``y`` arriba y el
frente hacia −z; la cara B de una góndola doble mira a +z. u = 0 es el borde
IZQUIERDO de quien mira la cara de frente; v = 0, abajo (en la zona libre, el
borde delantero). El robatope dibuja en el marco de sus repisas, girado
``giro_x`` alrededor de X.
"""
from __future__ import annotations

import math

from app.services.catalogo_muebles import TIPOS, tipo_base
from app.services.zonas_geometria import AREA_MINIMA_M2, area_util, cuantizar_numero

# ── Copia de muebles/medidas.ts (la compara test_participaciones_geometria) ──
ZOCALO_ALTO = 0.12
PARANTE_ANCHO = 0.05
ESPESOR_ESPINA = 0.02
ANCHO_MODULO_TIPICO = 1.25
COPETE_ALTO = 0.36
#: ``techoDeCara(h) = max(TECHO_MINIMO_DE_PUNTA, h − COPETE_ALTO)``.
TECHO_MINIMO_DE_PUNTA = 0.4
ROBATOPE_CAPA = 0.055
ROBATOPE_PARANTE = 0.05
ROBATOPE_PASO_OBJETIVO = 0.40
ROBATOPE_BASE = 0.12
ROBATOPE_MARGEN = 0.16
ROBATOPE_ESPESOR_REPISA = 0.022
ROBATOPE_GIRO = -0.06
#: ``tramosValidos``: un entero de 1 a 40.
TRAMOS_MAXIMOS = 40
#: ``ALTURA_PISABLE`` de ``utils/planta.ts``: por debajo, el mueble se pisa.
ALTURA_PISABLE = 0.25

# ── Propias de la superficie (las mismas en superficie.ts) ──────────────────
REMATE_GONDOLA = 0.10
SEPARACION_GONDOLA = 0.012
SEPARACION_PUNTA = 0.014
SEPARACION_ROBATOPE = 0.014
SEPARACION_RISTRA = 0.012
SEPARACION_CROSS = 0.006
SEPARACION_VITRINA = 0.020
SOBRE_LA_TAPA = 0.004
#: Un mueble de más de un kilómetro es un plano roto o un número mal escrito
#: (la API no acota las medidas): no se distribuye. Sin este tope, un ancho de
#: 1e308 colgaba la cuenta y ``_mm`` se caía con OverflowError en la firma.
MEDIDA_MAXIMA = 1000
#: Ni módulos ni puertas de más: cada uno es una exclusión, y la cuenta de
#: franjas crece con ellas. Un módulo de 1e-9 (la API no lo acota) pedía mil
#: millones de parantes.
MAX_VANOS = 200
#: La ristra de ``RistraMesh``.
RISTRA_ANCHO_MINIMO = 0.076
RISTRA_ANCHO_MAXIMO = 0.13
RISTRA_FRACCION_DEL_ANCHO = 0.45
RISTRA_BASE = 0.06
RISTRA_CABEZAL = 0.06
RISTRA_GANCHO = 0.32
#: La cruz de ``CrossMesh``.
CROSS_EJE_DEL_POSTE = 0.032
CROSS_LADO_DEL_POSTE = 0.055
CROSS_PRIMER_NIVEL = 0.10
CROSS_RECORRIDO = 0.12
CROSS_MEDIO_ESPESOR = 0.013
#: La vitrina de ``MuebleMesh``.
VITRINA_FRACCION_DE_BASE = 0.22
VITRINA_BASE_MAXIMA = 0.40
VITRINA_MARCO = 0.036
VITRINA_PUERTA = 0.60
VITRINA_MEDIO_DIVISOR = 0.009


def _redondear(x: float) -> int:
    """``Math.round`` del navegador, exacto: el entero más cercano y, en el
    medio, el de arriba. ``round()`` de Python redondea al par, y
    ``floor(x + 0.5)`` se equivoca donde la suma ya redondea
    (0.49999999999999994 + 0.5 da 1.0); ``x − floor(x)`` es exacto."""
    piso = math.floor(x)
    return piso + 1 if x - piso >= 0.5 else piso


def _techo_de_cara(h: float) -> float:
    return max(TECHO_MINIMO_DE_PUNTA, h - COPETE_ALTO)


def _fondo_por_cara(d: float, mural: bool) -> float:
    return d - ESPESOR_ESPINA if mural else (d - ESPESOR_ESPINA) / 2


def _cotas_de_robatope(w: float, d: float, h: float) -> tuple[float, float]:
    """(cuerpo, apoyo de la primera repisa), con las mismas operaciones que
    ``cotasDeRobatope``."""
    cuerpo = h - ROBATOPE_CAPA
    n = max(2, _redondear(cuerpo / ROBATOPE_PASO_OBJETIVO))
    primera = ROBATOPE_BASE + 1 * (cuerpo - ROBATOPE_MARGEN) / (n + 1)
    return cuerpo, primera + ROBATOPE_ESPESOR_REPISA / 2


def _numero(x) -> bool:
    return isinstance(x, (int, float)) and not isinstance(x, bool)


def _como_en_el_navegador(x):
    """El número como lo lee el navegador: ``JSON.parse`` convierte un entero
    que no entra en un float en ±Infinity, y el ``json`` de Python lo deja
    ``int`` (``math.isfinite`` y la división se caían con OverflowError).
    Lo demás pasa igual."""
    if isinstance(x, int) and not isinstance(x, bool):
        try:
            float(x)
        except OverflowError:
            return math.inf if x > 0 else -math.inf
    return x


def _tramos_validos(t):
    if _numero(t) and math.isfinite(t) and float(t).is_integer() and 1 <= t <= TRAMOS_MAXIMOS:
        return int(t)
    return None


def _vanos(w: float, modulo, tramos) -> int:
    """Cuántos módulos tiene el corrido, como ``vanosDeCorrido``."""
    fijos = _tramos_validos(tramos)
    if fijos is not None:
        return fijos
    m = modulo if modulo is not None and modulo > 0 else ANCHO_MODULO_TIPICO
    return max(1, _redondear(w / m))


def _parantes(w: float, n: int) -> list[float]:
    """Los ejes de los parantes: en cada unión y en las dos puntas."""
    return [-w / 2 + (w / n) * i for i in range(n + 1)]


def _bandas(w: float, xs, y0: float, y1: float) -> list[tuple]:
    return [("parante", max(-w / 2, x - PARANTE_ANCHO / 2), min(w / 2, x + PARANTE_ANCHO / 2), y0, y1) for x in xs]


# Cada receta devuelve (orientacion, (x0, x1, y0, y1), [(por, x0, x1, y0, y1)…],
# plano, giro_x) en metros y en el marco del mueble (§7.3), o None.

def _gondola(w, d, h, mural, modulo, tramos):
    n = _vanos(w, modulo, tramos)
    if n > MAX_VANOS:
        return None
    excl = [
        ("zocalo", -w / 2, w / 2, 0, ZOCALO_ALTO),
        ("remate", -w / 2, w / 2, h - REMATE_GONDOLA, h),
        *_bandas(w, _parantes(w, n), ZOCALO_ALTO, h - REMATE_GONDOLA),
    ]
    return "frente", (-w / 2, w / 2, 0, h), excl, ESPESOR_ESPINA / 2 + _fondo_por_cara(d, mural) + SEPARACION_GONDOLA, 0


def _punta(w, d, h, mural, modulo, tramos):
    n = _vanos(w, modulo, None)
    if n > MAX_VANOS:
        return None
    techo = _techo_de_cara(h)
    excl = [
        ("zocalo", -w / 2, w / 2, 0, ZOCALO_ALTO),
        ("copete", -w / 2, w / 2, techo, h),
        *_bandas(w, _parantes(w, n), ZOCALO_ALTO, techo),
    ]
    return "frente", (-w / 2, w / 2, 0, h), excl, d / 2 + SEPARACION_PUNTA, 0


def _robatope(w, d, h, mural, modulo, tramos):
    # En el marco de las repisas, girado ROBATOPE_GIRO alrededor del origen.
    cuerpo, apoyo = _cotas_de_robatope(w, d, h)
    excl = [
        ("base", -w / 2, w / 2, 0, apoyo),
        ("remate", -w / 2, w / 2, cuerpo, h),
        ("parante", -w / 2, -w / 2 + ROBATOPE_PARANTE, apoyo, cuerpo),
        ("parante", w / 2 - ROBATOPE_PARANTE, w / 2, apoyo, cuerpo),
    ]
    return "frente", (-w / 2, w / 2, 0, h), excl, d / 2 + SEPARACION_ROBATOPE, ROBATOPE_GIRO


def _ristra(w, d, h, mural, modulo, tramos):
    a = min(RISTRA_ANCHO_MAXIMO, max(RISTRA_ANCHO_MINIMO, RISTRA_FRACCION_DEL_ANCHO * w))
    excl = [("base", -a / 2, a / 2, 0, RISTRA_BASE), ("cabezal", -a / 2, a / 2, h - RISTRA_CABEZAL, h)]
    return "frente", (-a / 2, a / 2, 0, h), excl, RISTRA_GANCHO * d + SEPARACION_RISTRA, 0


def _cross(w, d, h, mural, modulo, tramos):
    poste = CROSS_EJE_DEL_POSTE + CROSS_LADO_DEL_POSTE / 2
    base = CROSS_PRIMER_NIVEL + CROSS_MEDIO_ESPESOR
    tapa = CROSS_PRIMER_NIVEL + (h - CROSS_RECORRIDO) - CROSS_MEDIO_ESPESOR
    excl = [
        ("base", -w / 2, w / 2, 0, base),
        ("tapa", -w / 2, w / 2, tapa, h),
        ("poste", -w / 2, -w / 2 + poste, base, tapa),
        ("poste", w / 2 - poste, w / 2, base, tapa),
    ]
    return "frente", (-w / 2, w / 2, 0, h), excl, d / 2 + SEPARACION_CROSS, 0


def _vitrina(w, d, h, mural, modulo, tramos):
    base_h = min(VITRINA_FRACCION_DE_BASE * h, VITRINA_BASE_MAXIMA)
    techo = h - VITRINA_MARCO
    n_p = max(1, _redondear(w / VITRINA_PUERTA))
    if n_p > MAX_VANOS:
        return None
    pw = w / n_p
    excl = [
        ("zocalo", -w / 2, w / 2, 0, base_h),
        ("marco", -w / 2, w / 2, techo, h),
        ("marco", -w / 2, -w / 2 + VITRINA_MARCO, base_h, techo),
        ("marco", w / 2 - VITRINA_MARCO, w / 2, base_h, techo),
    ]
    for i in range(1, n_p):
        x = -w / 2 + i * pw
        excl.append(("divisor", x - VITRINA_MEDIO_DIVISOR, x + VITRINA_MEDIO_DIVISOR, base_h, techo))
    return "frente", (-w / 2, w / 2, 0, h), excl, d / 2 + SEPARACION_VITRINA, 0


def _zona_libre(w, d, h, mural, modulo, tramos):
    # La tapa entera, vista desde arriba (D16), sólo si se pisa
    # (h < ALTURA_PISABLE): ésa el 3D la dibuja como una placa de alto h. Una
    # más alta es un exhibidor con rieles 8 mm por encima de h (MetroMesh).
    if not h < ALTURA_PISABLE:
        return None
    return "arriba", (-w / 2, w / 2, -d / 2, d / 2), [], h + SOBRE_LA_TAPA, 0


_RECETARIO = {
    "gondola": _gondola,
    "punta": _punta,
    "robatope": _robatope,
    "ristra": _ristra,
    "cross": _cross,
    "vitrina": _vitrina,
    "zona_libre": _zona_libre,
}

#: Las recetas que se saben calcular: las de ``RecetaDeSuperficie``.
RECETAS: tuple[str, ...] = tuple(_RECETARIO)


def caras_del_mueble(fixture: dict) -> int:
    """``caras_de`` de ``layout_lookup`` (LA respuesta a «¿tiene cara B?»),
    importada acá adentro: ``layout_lookup`` arrastra la base, y este módulo
    tiene que poder importarse sin ella."""
    from app.services.layout_lookup import caras_de

    return caras_de(fixture)


def tiene_superficie(tipo: str) -> bool:
    """¿El tipo (o el alias del 2D) tiene receta de superficie?"""
    return bool((TIPOS.get(tipo_base(tipo)) or {}).get("superficie")) if isinstance(tipo, str) else False


def _positivo(x) -> bool:
    return _numero(x) and math.isfinite(x) and x > 0


def _en_la_cara(x: float) -> float:
    return 0 if x < 0 else (1 if x > 1 else x)


def _dibujo_de(f, cara):
    if not isinstance(f, dict) or cara not in ("A", "B"):
        return None
    tipo = f.get("type")
    if not isinstance(tipo, str):
        return None
    clave = tipo_base(tipo)
    receta = ((TIPOS.get(clave) or {}).get("superficie") or {}).get("receta")
    if receta not in _RECETARIO:
        return None
    caras = caras_del_mueble({"type": tipo, "gondolaType": f.get("gondolaType")})
    if cara == "B" and caras != 2:
        return None
    w, d, h = (_como_en_el_navegador(f.get(k)) for k in ("w", "d", "h"))
    if not (_positivo(w) and _positivo(d) and _positivo(h)):
        return None
    if w > MEDIDA_MAXIMA or d > MEDIDA_MAXIMA or h > MEDIDA_MAXIMA:
        return None
    modulo = _como_en_el_navegador(f.get("modulo"))
    partes = f.get("partes")
    tramos = _como_en_el_navegador(partes.get("tramos")) if isinstance(partes, dict) else None
    dibujo = _RECETARIO[receta](
        w, d, h, caras == 1,
        modulo if _numero(modulo) else None,
        tramos if _numero(tramos) else None,
    )
    return (clave, receta, caras, dibujo) if dibujo is not None else None


def superficie(f: dict, cara: str) -> dict | None:
    """La superficie comercializable de la cara ``"A"`` o ``"B"`` (§7.4):
    ``{orientacion, ancho, alto, plano, giro_x, exclusiones, area_util_m2}``,
    o None si: el tipo no tiene receta, la cara es la B de un mueble de una
    cara, las medidas no son números > 0 (o pasan de ``MEDIDA_MAXIMA``), pide
    más de ``MAX_VANOS`` módulos o puertas, o lo útil no pasa de 1 cm². Las
    exclusiones van a u,v (en la B, en espejo), recortadas a [0,1],
    cuantizadas a 1e-6, sin las que quedan sin ancho o sin alto y ordenadas
    por (v0, u0, v1, u1, por). Es ``superficieDeCara`` del navegador."""
    r = _dibujo_de(f, cara)
    if r is None:
        return None
    orientacion, (x0, x1, y0, y1), rects, plano, giro_x = r[3]
    W, H = x1 - x0, y1 - y0
    exclusiones = []
    for por, ex0, ex1, ey0, ey1 in rects:
        if cara == "B":
            u0, u1 = (ex0 - x0) / W, (ex1 - x0) / W
        else:
            u0, u1 = (x1 - ex1) / W, (x1 - ex0) / W
        v0, v1 = (ey0 - y0) / H, (ey1 - y0) / H
        q = {
            "por": por,
            "u0": cuantizar_numero(_en_la_cara(u0)), "u1": cuantizar_numero(_en_la_cara(u1)),
            "v0": cuantizar_numero(_en_la_cara(v0)), "v1": cuantizar_numero(_en_la_cara(v1)),
        }
        if q["u1"] <= q["u0"] or q["v1"] <= q["v0"]:
            continue
        exclusiones.append(q)
    exclusiones.sort(key=lambda e: (e["v0"], e["u0"], e["v1"], e["u1"], e["por"]))
    area_util_m2 = W * H * area_util(exclusiones)
    if not area_util_m2 > AREA_MINIMA_M2:
        return None
    return {"orientacion": orientacion, "ancho": W, "alto": H, "plano": plano, "giro_x": giro_x,
            "exclusiones": exclusiones, "area_util_m2": area_util_m2}


def _mm(x: float) -> int:
    return math.floor(x * 1000 + 0.5)


def _q4(x: float) -> int:
    return math.floor(x * 10000 + 0.5)


def firma(f: dict, cara: str) -> str | None:
    """La firma de la cara (§3.9): lo que, si cambia, deja una distribución
    confirmada «para revisar». Lleva el tipo, mural o doble (de ``caras_de``,
    nunca de ``"double"`` escrito), ancho y alto en mm, los entrepaños
    guardados (un entero; otra cosa es «-») y las exclusiones a 1e-4, que
    llevan el módulo y los tramos. El fondo no entra. Es ``firmaDeCara``."""
    s = superficie(f, cara)
    r = _dibujo_de(f, cara) if s is not None else None
    if s is None or r is None:
        return None
    clave, _receta, caras, _ = r
    variante = "doble" if caras == 2 else ("mural" if clave == "gondola" else "")
    e = _como_en_el_navegador(f.get("entrepanos"))
    entrepanos = str(int(e)) if (_numero(e) and math.isfinite(e) and float(e).is_integer() and 0 <= e <= 1000) else "-"
    orden = sorted(s["exclusiones"], key=lambda x: (_q4(x["v0"]), _q4(x["u0"]), _q4(x["v1"]), _q4(x["u1"]), x["por"]))
    partes = ";".join(f"{x['por']}:{_q4(x['u0'])},{_q4(x['u1'])},{_q4(x['v0'])},{_q4(x['v1'])}" for x in orden)
    return f"v1|{clave}|{variante}|{_mm(s['ancho'])}|{_mm(s['alto'])}|e{entrepanos}|{partes}"

