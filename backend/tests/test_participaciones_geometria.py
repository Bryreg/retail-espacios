"""Participaciones de cara: la geometría de las zonas y la superficie
comercializable, con los MISMOS casos que el navegador.

Una cara se vende por participación (el 25 % para una marca, el 30 % para
otra) y cada una se dibuja como zonas sobre la cara. Lo dibujado se cuenta en
puntos básicos con la misma cuenta en dos lados: ``app/services/zonas_geometria.py``
y ``app/services/superficie.py``, que deciden al confirmar, y sus gemelos
``frontend/src/utils/zonasGeometria.ts`` y ``utils/superficie.ts``, que la
dueña ve mientras dibuja. Las dos corren ``frontend/scripts/casos/zonas.json``
y ``casos/superficies.json`` (``probar-zonas.mjs`` y ``probar-superficies.mjs``
del otro lado), y en ``exactos`` Python tiene que dar el número del navegador
bit a bit: si una suma cambia de orden de un solo lado, falla acá.

Sin ``client``: son reglas puras, y la suite del servidor ya tarda media hora.
``superficie.py`` pregunta «¿tiene cara B?» a ``caras_de`` de ``layout_lookup``,
que arrastra ``app.database``: el fixture ``_sin_rastros`` saca de
``sys.modules`` lo que cada prueba importó de ``app``, como hace ``client``,
para que la prueba siguiente arme su motor contra su propia base.
"""
import json
import math
import re
import sys
import time
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parents[2]
CASOS = json.loads((RAIZ / "frontend/scripts/casos/zonas.json").read_text(encoding="utf-8"))
SUPERFICIES = json.loads((RAIZ / "frontend/scripts/casos/superficies.json").read_text(encoding="utf-8"))
TOL = CASOS["tolerancia"]
_SUP = {c["nombre"]: c["superficie"] for c in SUPERFICIES["casos"]}


@pytest.fixture(autouse=True)
def _sin_rastros():
    antes = {m for m in sys.modules if m == "app" or m.startswith("app.")}
    yield
    for m in [m for m in sys.modules if (m == "app" or m.startswith("app.")) and m not in antes]:
        del sys.modules[m]


def _superficie_de(ref):
    s = _SUP[ref[len("superficie:"):]]
    assert isinstance(s, dict), f"«{ref}» no es una superficie de casos/superficies.json"
    return s


def _exclusiones(e):
    if e == "peor":
        return CASOS["peor"]["exclusiones"]
    return _superficie_de(e)["exclusiones"] if isinstance(e, str) else e


def _poligonos(p):
    return CASOS["peor"][p[len("peor:"):]] if isinstance(p, str) else p


def _vertices(v):
    if isinstance(v, str) and v.startswith("circulo:"):
        n = int(v[len("circulo:"):])
        return [[0.5 + 0.4 * math.cos(2 * math.pi * k / n), 0.5 + 0.4 * math.sin(2 * math.pi * k / n)] for k in range(n)]
    return v


# ── zonas.json ───────────────────────────────────────────────────────────────


def test_area_de_la_union_dentro_de_la_cara():
    from app.services.zonas_geometria import area_cubierta

    for c in CASOS["area"]:
        assert area_cubierta(c["zonas"], _exclusiones(c["exclusiones"])) == pytest.approx(c["area"], abs=TOL), c["nombre"]


def test_lo_que_se_pisan_dos_participaciones():
    from app.services.zonas_geometria import area_cubierta

    for c in CASOS["interseccion"]:
        E = _exclusiones(c["exclusiones"])
        a = area_cubierta(c["a"], E, c["b"])
        assert a == pytest.approx(c["area"], abs=TOL), c["nombre"]
        assert area_cubierta(c["b"], E, c["a"]) == pytest.approx(a, abs=1e-12), f"{c['nombre']}: al revés"


def test_validacion_de_una_zona():
    from app.services.zonas_geometria import area_firmada, es_simple, limpiar, validar_zona

    for c in CASOS["validar"]:
        vertices, codigo = validar_zona(_vertices(c["vertices"]), c["ancho"], c["alto"])
        assert codigo == c["codigo"], c["nombre"]
        if "limpios" in c:
            assert vertices == c["limpios"], f"{c['nombre']}: los vértices limpios"
        if codigo is None:
            assert es_simple(vertices) and area_firmada(vertices) > 0, c["nombre"]
            assert limpiar(vertices) == vertices, f"{c['nombre']}: limpiar lo limpio lo cambia"
            assert limpiar(_vertices(c["vertices"])) == vertices, f"{c['nombre']}: limpiar no da lo mismo que validar"


def test_pb_dibujados():
    from app.services.zonas_geometria import dibujado_pb

    for c in CASOS["dibujado"]:
        assert dibujado_pb(c["zonas"], _exclusiones(c["exclusiones"])) == c["pb"], c["nombre"]


def test_medir_una_distribucion_sin_terminos():
    from app.services.zonas_geometria import area_util, medir

    for c in CASOS["medir"]:
        s = _superficie_de(c["superficie"]) if isinstance(c["superficie"], str) else c["superficie"]
        m = medir([{"participacion_space_id": z["s"], "vertices": z["vertices"]} for z in c["zonas"]],
                  {"exclusiones": s["exclusiones"], "ancho": s["ancho"], "alto": s["alto"]})
        assert [v["codigo"] for v in m["validaciones"]] == c["codigos"], c["nombre"]
        assert [v["k"] for v in m["validaciones"]] == list(range(len(c["zonas"]))), c["nombre"]
        assert {str(k): v for k, v in m["dibujado_pb"].items()} == c["dibujado"], c["nombre"]
        assert list(m["dibujado_pb"]) == sorted(m["dibujado_pb"]), f"{c['nombre']}: el dibujado no va por id"
        assert [[p["s1"], p["s2"]] for p in m["pisadas"]] == [p[:2] for p in c["pisadas"]], c["nombre"]
        for p, esperada in zip(m["pisadas"], c["pisadas"]):
            assert p["m2"] == pytest.approx(esperada[2], abs=TOL), c["nombre"]
        assert m["sin_superficie_util"] == c["sin_superficie_util"], c["nombre"]
        assert m["area_util"] == area_util(s["exclusiones"]), c["nombre"]


def test_los_topes_de_una_capa():
    from app.services import zonas_geometria as G

    for c in CASOS["topes"]:
        zonas = [{"vertices": "x" if n == "malformada" else [[0, 0]] * n} for n in c["vertices_por_zona"]]
        assert G.dentro_de_los_topes(zonas) is c["entra"], c["nombre"]
    assert (G.MIN_VERTICES, G.MAX_VERTICES, G.MAX_ZONAS_POR_CARA, G.MAX_VERTICES_POR_CARA, G.AREA_MINIMA_M2, G.CUANTO) \
        == (3, 24, 60, 240, 1e-4, 1e-6), "los topes no son los del diseño (§3.1)"


def test_bit_a_bit_lo_mismo_que_el_navegador():
    """El número que dio ``zonasGeometria.ts``, congelado: Python tiene que dar
    EXACTAMENTE ése (mismas operaciones, mismo orden)."""
    from app.services.zonas_geometria import area_cubierta

    for c in CASOS["exactos"]:
        Q = _poligonos(c["Q"]) if "Q" in c else None
        a = area_cubierta(_poligonos(c["P"]), _exclusiones(c["E"]), Q)
        assert a == c["area"], f"{c['nombre']}: {a!r} y no {c['area']!r} (cambió el orden de una cuenta)"


def test_union_mas_interseccion_es_la_suma():
    """|A∪B| + |A∩B| = |A| + |B| en los pares al azar de ``exactos``."""
    from app.services.zonas_geometria import area_cubierta

    pares = [c for c in CASOS["exactos"] if "Q" in c and not isinstance(c["P"], str)]
    assert len(pares) >= 4
    for c in pares:
        E = _exclusiones(c["E"])
        suma = area_cubierta(c["P"], E) + area_cubierta(c["Q"], E)
        otra = area_cubierta(c["P"] + c["Q"], E) + area_cubierta(c["P"], E, c["Q"])
        assert otra == pytest.approx(suma, abs=1e-12), c["nombre"]


def test_ajustar_al_contratado_no_pasa_el_tope():
    """Las salidas de ``ajustarAlContratado`` (las carga el paso del editor):
    el dibujado de cada una, contado de este lado, no pasa su tope."""
    from app.services.zonas_geometria import dibujado_pb

    for c in CASOS.get("ajustar", []):
        assert dibujado_pb(c["salida"], _exclusiones(c["exclusiones"])) <= c["tope"], c["nombre"]


def test_el_peor_caso_es_rapido():
    """§6.5: 240 vértices de estrellas que se cruzan sobre zócalo y parante.
    Medido ≈ 0,09 s la intersección y ≈ 0,12 s la medición entera en CPython;
    el tope de la prueba es holgado (CI comparte máquina)."""
    from app.services.zonas_geometria import MAX_VERTICES_POR_CARA, area_cubierta, medir

    a, b, E = CASOS["peor"]["a"], CASOS["peor"]["b"], CASOS["peor"]["exclusiones"]
    total = 0
    for p in a + b:
        total += len(p)
    assert total == MAX_VERTICES_POR_CARA
    t = time.perf_counter()
    area_cubierta(a, E, b)
    interseccion = time.perf_counter() - t
    t = time.perf_counter()
    m = medir([{"participacion_space_id": 1, "vertices": v} for v in a] + [{"participacion_space_id": 2, "vertices": v} for v in b],
              {"exclusiones": E, "ancho": 1, "alto": 1})
    medicion = time.perf_counter() - t
    assert [p["s1"] for p in m["pisadas"]] == [1]
    assert interseccion < 1.0, f"la intersección del peor caso tardó {interseccion:.2f} s"
    assert medicion < 2.0, f"medir el peor caso tardó {medicion:.2f} s"


def test_la_geometria_es_pura_y_sin_sumas_compensadas():
    fuente = (RAIZ / "backend/app/services/zonas_geometria.py").read_text(encoding="utf-8")
    codigo = re.sub(r'"""[\s\S]*?"""', " ", fuente)
    codigo = re.sub(r"#[^\n]*", " ", codigo)
    assert not re.search(r"(^|[^\w.])(sum|fsum|round)\s*\(", codigo, re.M), "suma con sum/fsum o redondea con round"
    assert not re.search(r"^\s*(from app|import app)", codigo, re.M), "importa algo de la app: tiene que ser pura"


# ── superficies.json ─────────────────────────────────────────────────────────


def _igual_superficie(obtenida, esperada, quien):
    assert (obtenida is None) == (esperada is None), quien
    if esperada is None:
        return
    assert obtenida["orientacion"] == esperada["orientacion"], quien
    for k in ("ancho", "alto", "plano", "giro_x", "area_util_m2"):
        assert obtenida[k] == pytest.approx(esperada[k], abs=SUPERFICIES["tolerancia"]), f"{quien}: {k}"
    assert len(obtenida["exclusiones"]) == len(esperada["exclusiones"]), f"{quien}: las exclusiones"
    for x, y in zip(obtenida["exclusiones"], esperada["exclusiones"]):
        assert x["por"] == y["por"], quien
        for k in ("u0", "u1", "v0", "v1"):
            assert x[k] == pytest.approx(y[k], abs=SUPERFICIES["tolerancia"]), f"{quien}: {x['por']}.{k}"


def test_la_superficie_de_cada_cara():
    from app.services.superficie import firma, superficie

    for c in SUPERFICIES["casos"]:
        esperada = c["superficie"]
        if isinstance(esperada, str):
            esperada = _SUP[esperada[len("igual:"):]]
        _igual_superficie(superficie(c["mueble"], c["cara"]), esperada, c["nombre"])
        assert firma(c["mueble"], c["cara"]) == c.get("firma"), f"{c['nombre']}: la firma"


def test_las_recetas_son_las_del_catalogo():
    """``RECETAS`` es la unión ``RecetaDeSuperficie`` de ``catalogo.ts`` (la que
    leen probar-catalogo y test_catalogo_muebles), y todo tipo con
    ``superficie`` en el catálogo pide una receta que se sabe calcular."""
    from app.services.catalogo_muebles import ALIAS, TIPOS
    from app.services.superficie import RECETAS, tiene_superficie

    union = re.search(r"export type RecetaDeSuperficie =([^;]*);",
                      (RAIZ / "frontend/src/catalogo/catalogo.ts").read_text(encoding="utf-8"))
    assert union, "no encontré `RecetaDeSuperficie` en catalogo.ts"
    assert sorted(RECETAS) == sorted(re.findall(r'"([^"]+)"', union.group(1)))
    con_superficie = {t for t, d in TIPOS.items() if d.get("superficie")}
    assert con_superficie == {"gondola", "punta", "robatope", "ristra", "cross", "mueble", "metro"}
    for t in con_superficie:
        assert TIPOS[t]["superficie"]["receta"] in RECETAS, t
        assert tiene_superficie(t), t
    for alias, a in ALIAS.items():
        assert tiene_superficie(alias) is (a["tipo"] in con_superficie), alias
    for t in ("nevera_puertas", "isla", "checkout", "constructor", "__proto__", ""):
        assert not tiene_superficie(t), t


def test_la_cara_b_de_una_doble_es_la_a_en_espejo():
    from app.services.superficie import firma, superficie

    for w in (0.6, 0.9, 1.25, 2.4, 3.0, 4.9):
        for extra in ({}, {"modulo": 1.0}, {"partes": {"tramos": 3}}, {"type": "gondola_doble"}):
            f = {"type": "gondola", "w": w, "d": 0.9, "h": 1.8, **extra}
            assert superficie(f, "B") == superficie(f, "A"), (w, extra)
            assert firma(f, "B") == firma(f, "A"), (w, extra)
    asimetrica = {"type": "gondola", "w": 2.0, "d": 0.9, "h": 1.8}
    assert superficie({**asimetrica, "gondolaType": "wall"}, "B") is None


def test_el_area_util_es_la_resta_cuando_no_se_pisan():
    from app.services.zonas_geometria import area_util

    for c in SUPERFICIES["casos"]:
        s = c["superficie"]
        if not isinstance(s, dict):
            continue
        E = s["exclusiones"]
        if any(a["u0"] < b["u1"] and b["u0"] < a["u1"] and a["v0"] < b["v1"] and b["v0"] < a["v1"]
               for i, a in enumerate(E) for b in E[i + 1:]):
            continue
        resta = 1.0
        for e in E:
            resta -= (e["u1"] - e["u0"]) * (e["v1"] - e["v0"])
        assert area_util(E) == pytest.approx(resta, abs=1e-12), c["nombre"]
        assert s["area_util_m2"] == pytest.approx(s["ancho"] * s["alto"] * resta, abs=1e-9), c["nombre"]


def test_la_copia_de_las_medidas_del_3d():
    """Python copia las cotas de ``muebles/medidas.ts`` (y la altura pisable de
    ``utils/planta.ts``) que el navegador importa: tienen que ser las mismas."""
    from app.services import superficie as S

    medidas = (RAIZ / "frontend/src/components/StoreEditor3D/muebles/medidas.ts").read_text(encoding="utf-8")
    planta = (RAIZ / "frontend/src/utils/planta.ts").read_text(encoding="utf-8")

    def de_bloque(nombre, clave):
        bloque = re.search(rf"export const {nombre} = \{{([\s\S]*?)\}} as const;", medidas)
        assert bloque, nombre
        m = re.search(rf"\b{clave}:\s*(-?[\d.]+)", bloque.group(1))
        assert m, f"{nombre}.{clave}"
        return float(m.group(1))

    def suelta(patron, texto=medidas):
        m = re.search(patron, texto)
        assert m, patron
        return float(m.group(1))

    assert S.ZOCALO_ALTO == de_bloque("ZOCALO", "alto")
    assert S.PARANTE_ANCHO == de_bloque("PARANTE", "ancho")
    assert S.COPETE_ALTO == de_bloque("COPETE", "alto")
    for clave, valor in (("capa", S.ROBATOPE_CAPA), ("parante", S.ROBATOPE_PARANTE), ("pasoObjetivo", S.ROBATOPE_PASO_OBJETIVO),
                         ("base", S.ROBATOPE_BASE), ("margen", S.ROBATOPE_MARGEN), ("espesorRepisa", S.ROBATOPE_ESPESOR_REPISA),
                         ("giro", S.ROBATOPE_GIRO)):
        assert valor == de_bloque("ROBATOPE", clave), clave
    assert S.ESPESOR_ESPINA == suelta(r"export const ESPESOR_ESPINA = ([\d.]+);")
    assert S.ANCHO_MODULO_TIPICO == suelta(r"export const ANCHO_MODULO_TIPICO = ([\d.]+);")
    assert S.TECHO_MINIMO_DE_PUNTA == suelta(r"return Math\.max\(([\d.]+), h - COPETE\.alto\);")
    assert S.TRAMOS_MAXIMOS == suelta(r"tramos >= 1 && tramos <= (\d+)")
    assert S.ALTURA_PISABLE == suelta(r"export const ALTURA_PISABLE = ([\d.]+);", planta)
    # Las fórmulas que la copia repite.
    assert "return esMural ? d - ESPESOR_ESPINA : (d - ESPESOR_ESPINA) / 2;" in medidas
    assert "const n = Math.max(2, Math.round(cuerpo / ROBATOPE.pasoObjetivo));" in medidas
    assert "(_, i) => ROBATOPE.base + (i + 1) * (cuerpo - ROBATOPE.margen) / (n + 1)," in medidas
    assert "apoyos: repisas.map((y) => y + ROBATOPE.espesorRepisa / 2)," in medidas
    assert "Math.max(1, Math.round(w / (modulo && modulo > 0 ? modulo : ANCHO_MODULO_TIPICO)))" in medidas


def test_la_zona_libre_solo_si_se_pisa():
    """La zona libre se dibuja 4 mm sobre su tapa sólo si se pisa
    (h < ALTURA_PISABLE): una más alta es un exhibidor con rieles que salen por
    encima de h y atravesarían el dibujo."""
    from app.services.superficie import ALTURA_PISABLE, superficie

    s = superficie({"type": "metro", "w": 2.0, "d": 1.5, "h": 0.05}, "A")
    assert (s["orientacion"], s["ancho"], s["alto"], s["exclusiones"]) == ("arriba", 2.0, 1.5, [])
    assert s["plano"] == pytest.approx(0.054)
    assert superficie({"type": "metro", "w": 1, "d": 1, "h": ALTURA_PISABLE - 1e-9}, "A") is not None
    assert superficie({"type": "metro", "w": 1, "d": 1, "h": ALTURA_PISABLE}, "A") is None
