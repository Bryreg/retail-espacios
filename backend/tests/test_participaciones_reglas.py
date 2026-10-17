"""Participaciones de cara: las reglas, con los MISMOS casos que el navegador.

Qué término cuenta un día, cuánto queda para vender, si un cambio contradice a
los otros términos de su participación y si una distribución se puede
confirmar: ``app/services/reglas_participacion.py`` lo decide con el candado
tomado y ``frontend/src/utils/participaciones.ts`` lo muestra mientras la dueña
carga o dibuja. Las dos corren ``frontend/scripts/casos/participaciones.json``
(``probar-distribucion.mjs`` del otro lado), frases incluidas: si se separan,
el formulario dice «queda 40 %» y el servidor contesta 409.

Sin ``client``: son reglas puras, y la suite del servidor ya tarda media hora.
Los casos usan las claves del navegador (camelCase); acá se pasan a snake_case.
"""
import json
import math
import random
import re
import sys
from datetime import date, timedelta
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parents[2]
CASOS = json.loads((RAIZ / "frontend/scripts/casos/participaciones.json").read_text(encoding="utf-8"))
SUPERFICIES = json.loads((RAIZ / "frontend/scripts/casos/superficies.json").read_text(encoding="utf-8"))
HOY = date.fromisoformat(CASOS["hoy"])
_SUP = {c["nombre"]: c["superficie"] for c in SUPERFICIES["casos"]}


@pytest.fixture(autouse=True)
def _sin_rastros():
    antes = {m for m in sys.modules if m == "app" or m.startswith("app.")}
    yield
    for m in [m for m in sys.modules if (m == "app" or m.startswith("app.")) and m not in antes]:
        del sys.modules[m]


def _serpiente(x):
    """Las claves del navegador a las de Python (``supplierId`` → ``supplier_id``)."""
    if isinstance(x, dict):
        return {re.sub(r"[A-Z]", lambda m: "_" + m.group(0).lower(), k): _serpiente(v) for k, v in x.items()}
    if isinstance(x, list):
        return [_serpiente(v) for v in x]
    return x


def _termino(t, id_, space_id, numero):
    """Lo que el caso no da, completado igual que en ``probar-distribucion.mjs``."""
    t = _serpiente(t)
    lease = t.get("lease")
    return {
        "id": t.get("id", id_), "space_id": t.get("space_id", space_id), "numero": t.get("numero", numero),
        "estado": t["estado"], "pb": t.get("pb", 0), "supplier_id": t.get("supplier_id", 1),
        "marca": t.get("marca"),
        "desde": t.get("desde") or (lease or {}).get("start_date"),
        "hasta": t.get("hasta") or (lease or {}).get("end_date"),
        "caduca": t.get("caduca"), "baja_fecha": t.get("baja_fecha"), "lease": lease,
    }


def _lista(ts, space_id=1, numero=1):
    return [_termino(t, i + 1, space_id, numero) for i, t in enumerate(ts)]


def _de_s(ts, s, numero):
    return [_termino(t, s * 100 + i + 1, s, numero) for i, t in enumerate(ts)]


def _superficie(ref):
    s = _SUP[ref[len("superficie:"):]]
    assert isinstance(s, dict), f"«{ref}» no es una superficie de casos/superficies.json"
    return s


def _vertices(v):
    if isinstance(v, str) and v.startswith("circulo:"):
        n = int(v[len("circulo:"):])
        return [[0.5 + 0.4 * math.cos(2 * math.pi * k / n), 0.5 + 0.4 * math.sin(2 * math.pi * k / n)] for k in range(n)]
    return v


def _iso(d):
    return d.isoformat() if d is not None else None


# ── participaciones.json ─────────────────────────────────────────────────────


def test_constantes_y_textos():
    from app.services import reglas_participacion as R

    for k, v in CASOS["constantes"].items():
        assert getattr(R, k) == v, k
    for c in CASOS["porcentajes"]:
        assert R.pct(c["pb"]) == c["texto"], c["pb"]
    for c in CASOS["deTexto"]:
        assert R.pb_de_texto(c["texto"]) == c["pb"], repr(c["texto"])


def test_estado_visible_vivo_y_que_cuenta_un_dia():
    from app.services import reglas_participacion as R

    for c in CASOS["estados"]:
        [t] = _lista([c["termino"]])
        assert R.estado_visible(t, HOY) == c["estado_visible"], c["nombre"]
        assert R.vivo(t, HOY) is c["vivo"], c["nombre"]
        assert R.rige([t], HOY) is c["vivo"], c["nombre"]
    for c in CASOS["cuentaElDia"]:
        [t] = _lista([c["termino"]])
        for d, v in c["dias"].items():
            assert R.cuenta_el_dia(t, date.fromisoformat(d), HOY) is v, f"{c['nombre']}: {d}"
            assert R.cuenta_el_dia(t, d, CASOS["hoy"]) is v, f"{c['nombre']}: {d} (en texto)"
    for c in CASOS["cuentaEseDia"]:
        ts = _lista(c["terminos"])
        for d, v in c["dias"].items():
            assert R.cuenta_ese_dia(ts, d, HOY) is v, f"{c['nombre']}: {d}"


def test_pico_capacidad_y_disponible():
    from app.services import reglas_participacion as R

    for c in CASOS["pico"]:
        pb, dia = R.pico(_serpiente(c["intervalos"]), c["desde"], c["hasta"])
        assert (pb, _iso(dia)) == (c["pb"], c["dia"]), c["nombre"]
    for c in CASOS["capacidad"]:
        I = R.intervalos_que_cuentan(_lista(c["terminos"]), _serpiente(c["fisicos"]), HOY)
        a = max(date.fromisoformat(c["desde"]), HOY)
        pb, dia = R.pico(I, a, c["hasta"])
        assert pb == c["pico"], c["nombre"]
        if "dia" in c:
            assert _iso(dia) == c["dia"], c["nombre"]
        assert R.disponible(I, c["desde"], c["hasta"], HOY) == c["disponible"], c["nombre"]


def test_la_regla_de_capacidad():
    from app.services import reglas_participacion as R

    for c in CASOS["revisar"]:
        fisicos = _serpiente(c["fisicos"])
        I = R.intervalos_que_cuentan(_lista(c["existentes"]), fisicos, HOY, c["pide"].get("excluir"))
        x = R.revisar_capacidad(I, fisicos, c["pide"]["pb"], c["pide"]["desde"], c["pide"]["hasta"], c.get("cara", "A"), HOY)
        assert (x[0] if x else None) == c["codigo"], c["nombre"]
        if "frase" in c:
            assert x[1] == c["frase"], c["nombre"]
        if "dia" in c:
            assert x[2]["dia"] == c["dia"], c["nombre"]
        if "disponiblePb" in c:
            assert x[2]["disponible_pb"] == c["disponiblePb"], c["nombre"]
        if x and x[0] == "cara_vendida_entera":
            assert x[2] == {}, c["nombre"]
        if x:
            json.dumps({"code": x[0], "message": x[1], **x[2]})   # va directo al 409


def test_las_invariantes_de_los_terminos():
    from app.services import reglas_participacion as R

    for c in CASOS["terminos"]:
        x = R.revisar_terminos(_lista(c["de"], 1, 3), _serpiente(c["cambio"]), HOY)
        assert (x[0] if x else None) == c["codigo"], c["nombre"]
        if "frase" in c:
            assert x[1] == c["frase"], c["nombre"]
        if x:
            assert x[2] == {}, c["nombre"]


def _zonas_del_caso(c):
    if "zonas" in c:
        return [{"participacion_space_id": z["s"], "vertices": _vertices(z["vertices"])} for z in c["zonas"]]
    return [{"participacion_space_id": p["spaceId"], "vertices": _vertices(v)}
            for p in c["participaciones"] for v in p.get("zonas", [])]


def _medir(sup, zonas):
    from app.services.zonas_geometria import medir

    return medir(zonas, {"exclusiones": sup["exclusiones"], "ancho": sup["ancho"], "alto": sup["alto"]})


def test_el_juicio_de_una_distribucion():
    from app.services import reglas_participacion as R

    for c in CASOS["distribucion"]:
        sup = _superficie(c["superficie"])
        m = _medir(sup, _zonas_del_caso(c))
        por_s = {p["spaceId"]: _de_s(p["terminos"], p["spaceId"], p["numero"]) for p in c["participaciones"]}
        j = R.juzgar(m, por_s, HOY, confirmada=bool(c.get("confirmada")), firma_cambio=bool(c.get("firmaCambio")),
                     orientacion=sup["orientacion"])
        assert [p["codigo"] for p in j["errores"]] == c["errores"], c["nombre"]
        assert [p["codigo"] for p in j["avisos"]] == c["avisos"], c["nombre"]
        if "detalle" in c:
            assert j["errores"] + j["avisos"] == c["detalle"], c["nombre"]
        for s, campos in c.get("cuentas", {}).items():
            cu = j["cuentas"][int(s)]
            for k, v in campos.items():
                assert cu[k] == v, f"{c['nombre']}: {k} de {s}"
        assert list(j["cuentas"]) == sorted(j["cuentas"]), c["nombre"]
        if "disponible" in c:
            todos = [t for ts in por_s.values() for t in ts]
            I = R.intervalos_que_cuentan(todos, [], HOY)
            d = c["disponible"]
            assert R.disponible(I, d["desde"], d["hasta"], HOY) == d["pb"], c["nombre"]


def _mapa(por_s):
    return {int(s): _de_s(ts, int(s), int(s)) for s, ts in por_s.items()}


def test_un_cambio_de_termino_no_rompe_la_confirmada():
    from app.services import reglas_participacion as R

    for c in CASOS["rompe"]:
        sup = _superficie(c["superficie"])
        zonas = [{"participacion_space_id": int(s), "vertices": v} for s, ps in c["zonas"].items() for v in ps]
        m = _medir(sup, zonas)
        nuevos = R.rompe_distribucion(m, _mapa(c["antes"]), _mapa(c["despues"]), HOY)
        assert [[p["codigo"], p["participaciones"]] for p in nuevos] == c["nuevos"], c["nombre"]
        if "frases" in c:
            assert [p["frase"] for p in nuevos] == c["frases"], c["nombre"]
        if "mensaje" in c:
            assert R.mensaje_de_rompe(nuevos) == c["mensaje"], c["nombre"]
        assert R.rompe_distribucion(m, _mapa(c["despues"]), _mapa(c["despues"]), HOY) == [], c["nombre"]


def test_ocupacion_anonima_y_estado_de_la_distribucion():
    from app.services import reglas_participacion as R

    for c in CASOS["dispo"]:
        d = R.dispo_por_participacion(_serpiente(c["ocupacion"]), c["desde"], c["hasta"], HOY)
        assert {**d, "libre_desde": _iso(d["libre_desde"])} == \
            {"dispo": c["dispo"], "queda_pb": c["quedaPb"], "libre_desde": c["libreDesde"]}, c["nombre"]
    for c in CASOS["estadosDistribucion"]:
        dist = _serpiente(c["distribucion"])
        assert R.estado_distribucion(c["porParticipacion"], c["fixtureId"], dist, c["firmaActual"]) == c["estado"], c["nombre"]
        assert R.para_revisar(dist, c["firmaActual"]) is c["paraRevisar"], c["nombre"]


# ── Propiedades (baratas) ────────────────────────────────────────────────────


def test_el_pico_es_el_de_contar_dia_por_dia():
    """Y la capacidad dice «entra» justo cuando lo pedido cabe en lo disponible."""
    from app.services import reglas_participacion as R

    azar = random.Random(20261017)
    base = date(2026, 10, 1)
    for i in range(200):
        I = []
        for _ in range(azar.randint(0, 6)):
            a = azar.randint(0, 90)
            I.append({"desde": base + timedelta(a), "hasta": base + timedelta(a + azar.randint(0, 40)),
                      "pb": azar.choice([500, 2500, 3333, 5000, 10000])})
        a = azar.randint(0, 100)
        desde, hasta = base + timedelta(a), base + timedelta(a + azar.randint(-3, 60))
        mejor, cuando = 0, desde
        d = desde
        while d <= hasta:
            s = 0
            for it in I:
                if it["desde"] <= d <= it["hasta"]:
                    s += it["pb"]
            if s > mejor:
                mejor, cuando = s, d
            d += timedelta(1)
        assert R.pico(I, desde, hasta) == (mejor, cuando), i
        pide = azar.randint(1, 10000)
        x = R.revisar_capacidad(I, [], pide, desde, hasta, "A", HOY)
        todo_pasado = max(desde, HOY) > hasta
        assert (x is None) is (todo_pasado or pide <= R.disponible(I, desde, hasta, HOY)), i


def test_es_pura_y_no_lee_el_reloj():
    texto = (RAIZ / "backend/app/services/reglas_participacion.py").read_text(encoding="utf-8")
    codigo = re.sub(r'"""[\s\S]*?"""', " ", texto)
    codigo = re.sub(r"#[^\n]*", " ", codigo)
    assert re.findall(r"^\s*(?:from|import) (app[\w.]*)", codigo, re.M) == ["app.services.zonas_geometria"]
    assert not re.search(r"\btoday\s*\(|\bnow\s*\(|app\.fechas|\bfechas\.hoy", codigo), "hoy es un parámetro"
    assert not re.search(r"\bf?sum\s*\(", codigo), "sin sum/fsum: bucles explícitos como el navegador"
