"""Distribuir «como un juego de piezas»: el servidor acepta las piezas EXACTAS
que arma el navegador.

Desde el rediseño de Distribuir (2026-10-24) una marca no se dibuja a mano: su
pieza nace con el tamaño de su % contratado (``frontend/src/utils/piezas.ts``)
y se arrastra a la cara. La promesa —«no hay forma de pasarse»— vale sólo si
el SERVIDOR, con su propia superficie y su propia cuenta, ve exactamente ese %.

``frontend/scripts/casos/piezas.json`` lo escribe ``probar-piezas.mjs`` con
los rectángulos (y la L a mano) que arma el navegador para cada mueble del
catálogo que se vende por participación (góndola doble, mural y de tres
módulos, punta, robatope, ristra, cruz, vitrina, zona libre, las neveras) con
1 %, 17 %, 17,5 %, 30 %, 50 % y 100 %, y las caras acomodadas solas. Acá:

· la superficie de la cara sale de ``services/superficie.py`` (no del archivo);
· cada zona pasa ``validar_zona`` sin cambiar (ya viene cuantizada y antihoraria);
· ``medir`` da por participación EXACTAMENTE el pb pedido;
· ``juzgar``, con contratos vivos que se cruzan en fechas, no da ningún error
  (ni ``EXCESO`` ni ``SOLAPE``) y deja ``pendiente`` y ``exceso`` en 0.

El servidor no cambió: esto fija que lo que el navegador promete es lo que el
servidor acepta al confirmar.
"""
import json
import sys
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parents[2]
CASOS = json.loads((RAIZ / "frontend/scripts/casos/piezas.json").read_text(encoding="utf-8"))["casos"]


@pytest.fixture(autouse=True)
def _sin_rastros():
    antes = {m for m in sys.modules if m == "app" or m.startswith("app.")}
    yield
    for m in [m for m in sys.modules if (m == "app" or m.startswith("app.")) and m not in antes]:
        del sys.modules[m]


def _contrato(i, space_id, pb):
    return {
        "id": i + 1, "space_id": space_id, "numero": i + 1, "estado": "contrato", "pb": pb, "supplier_id": i + 1,
        "marca": None, "desde": "2026-10-01", "hasta": "2027-03-31", "caduca": None, "baja_fecha": None,
        "lease": {"is_active": True, "start_date": "2026-10-01", "end_date": "2027-03-31"},
    }


def test_hay_casos_de_todos_los_muebles_y_porcentajes():
    assert len(CASOS) >= 100
    tipos = {c["mueble"]["type"] for c in CASOS}
    assert {"gondola", "punta", "robatope", "ristra", "cross", "mueble", "metro", "nevera_puertas", "nevera_refrescos"} <= tipos
    pbs = {p["pb"] for c in CASOS for p in c["piezas"]}
    assert {100, 1700, 1750, 3000, 5000, 10000} <= pbs


def test_el_servidor_ve_el_porcentaje_justo_sin_exceso_ni_solape():
    from app.services.reglas_participacion import juzgar
    from app.services.superficie import superficie
    from app.services.zonas_geometria import medir, validar_zona

    for c in CASOS:
        sup = superficie(c["mueble"], "A")
        assert sup is not None, c["nombre"]
        zonas = []
        for p in c["piezas"]:
            limpios, codigo = validar_zona(p["vertices"], sup["ancho"], sup["alto"])
            assert codigo is None, f"{c['nombre']}: {codigo}"
            assert limpios == p["vertices"], f"{c['nombre']}: el servidor limpia distinto lo que manda el navegador"
            zonas.append({"participacion_space_id": p["s"], "vertices": p["vertices"]})
        m = medir(zonas, {"exclusiones": sup["exclusiones"], "ancho": sup["ancho"], "alto": sup["alto"]})
        for p in c["piezas"]:
            assert m["dibujado_pb"][p["s"]] == p["pb"], f"{c['nombre']}: el servidor ve {m['dibujado_pb'][p['s']]} pb y no {p['pb']}"
        terminos = {p["s"]: [_contrato(i, p["s"], p["pb"])] for i, p in enumerate(c["piezas"])}
        j = juzgar(m, terminos, "2026-10-24", orientacion=sup["orientacion"])
        assert j["errores"] == [], f"{c['nombre']}: {[e['frase'] for e in j['errores']]}"
        for p in c["piezas"]:
            cuenta = j["cuentas"][p["s"]]
            assert (cuenta["dibujado"], cuenta["pendiente"], cuenta["exceso"]) == (p["pb"], 0, 0), c["nombre"]
