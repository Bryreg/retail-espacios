"""Planogramas con destinos: el servidor dice lo mismo que la pantalla.

«Planificar la cara» dice en vivo el estado de cada destino (ubicado, le falta,
sobra, pisa a otro o a lo vendido) con las cuentas del navegador
(``frontend/src/utils/planograma.ts``). Lo que vale es la revisión del servidor
(``services/planogramas.revisar``), la que frena publicar.
``frontend/scripts/casos/planogramas.json`` lo escribe
``probar-planogramas.mjs`` con las piezas que arma el navegador, su % dibujado
y los problemas que la pantalla marca; acá:

· la superficie sale de ``services/superficie.py`` (no del archivo);
· ``revisar`` da por destino EXACTAMENTE el % dibujado del navegador;
· y los mismos problemas (por su código), ni uno más ni uno menos.
"""
import json
import sys
from datetime import date
from pathlib import Path
from types import SimpleNamespace

import pytest

RAIZ = Path(__file__).resolve().parents[2]
CASOS = json.loads((RAIZ / "frontend/scripts/casos/planogramas.json").read_text(encoding="utf-8"))["casos"]
HOY = date(2026, 10, 24)


@pytest.fixture(autouse=True)
def _sin_rastros():
    antes = {m for m in sys.modules if m == "app" or m.startswith("app.")}
    yield
    for m in [m for m in sys.modules if (m == "app" or m.startswith("app.")) and m not in antes]:
        del sys.modules[m]


def test_hay_casos():
    assert len(CASOS) >= 5
    codigos = {c for caso in CASOS for c in caso["codigos"]}
    assert {"SOLAPE", "PIEZA_FALTA", "PIEZA_SOBRA", "PISA_LO_VENDIDO"} <= codigos


@pytest.mark.parametrize("caso", CASOS, ids=[c["nombre"] for c in CASOS])
def test_el_servidor_ve_lo_mismo_que_la_pantalla(caso):
    from app.services.planogramas import Vendido, revisar
    from app.services.superficie import superficie

    sup = superficie(caso["mueble"], "A")
    assert sup is not None
    cara = SimpleNamespace(superficie=sup)
    vendido = Vendido([], [{
        **p, "intervalos": [{"desde": date.fromisoformat(i["desde"]), "hasta": date.fromisoformat(i["hasta"]), "pb": i["pb"]}
                            for i in p["intervalos"]],
    } for p in caso.get("vendido", [])])
    destinos = {p["destino_id"]: {"nombre": f"Destino {p['destino_id']}"} for p in caso["piezas"]}
    j = revisar(cara, caso["piezas"], destinos, vendido, HOY, None, para_publicar=False)
    assert {str(k): v for k, v in j["dibujado"].items()} == {str(k): v for k, v in caso["dibujado"].items() if int(k) > 0}
    assert sorted(p["codigo"] for p in j["errores"]) == sorted(caso["codigos"])
