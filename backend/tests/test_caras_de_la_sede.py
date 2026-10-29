"""Plano › Caras (el dueño, 2026-10-29: «¿desde dónde llevo control de la
distribución de los muebles que no se venden?»).

· Salen TODAS las caras con superficie, también las que nunca se planificaron
  («sin repartir»), primero las que piden algo.
· Una con borrador y sin versión: «borrador»; con versión vigente: «lista»,
  con los nombres de sus destinos y cómo va su montaje.
· Lo que no coincide al montar vuelve a «para revisar».
· Quien no administra ve sólo los muebles que no se venden.

Todo ``import app.*`` va ADENTRO de las funciones.
"""
from datetime import date

import pytest

RELOJ = pytest.mark.reloj("2026-10-24T15:00:00+00:00")


def _mueble(code, cx, rentable=True, division=None):
    f = {"id": f"f-{code}", "code": code, "sede": "NAVE", "type": "metro", "label": code, "cx": cx, "cz": 2, "rotY": 0,
         "w": 1, "d": 1, "h": 0.05, "color": "#818cf8"}
    if not rentable:
        f["rentable"] = False
    if division:
        f["partes"] = {"division": division}
    return f


PLANO = [_mueble("INT-01", 2, rentable=False), _mueble("INT-02", 4, rentable=False),
         _mueble("MET-01", 6, division="participacion")]


def _rect(u0, u1):
    return [[u0, 0.0], [u1, 0.0], [u1, 1.0], [u0, 1.0]]


def _caras(client, quien):
    r = client.get("/api/planogramas/caras", headers=quien, params={"sede": "NAVE"})
    assert r.status_code == 200, r.text
    return {c["codigo"]: c for c in r.json()["caras"]}, [c["codigo"] for c in r.json()["caras"]]


def _preparar(client, admin):
    r = client.put("/api/layout/NAVE", headers=admin, json={"fixtures": PLANO, "base_updated_at": None})
    assert r.status_code == 200, r.text
    r = client.post("/api/planogramas/destinos", headers=admin,
                    json={"sede": "NAVE", "nombre": "Lácteos", "tipo": "categoria", "color": "d1"})
    assert r.status_code == 201, r.text
    return r.json()["id"]


@RELOJ
def test_todas_las_caras_con_su_estado_y_primero_lo_que_pide_algo(client, admin, worker):
    lacteos = _preparar(client, admin)
    por, orden = _caras(client, admin)
    assert set(orden) == {"INT-01", "INT-02", "MET-01"}
    assert all(c["estado"] == "sin_repartir" and c["destinos"] == [] for c in por.values())
    assert por["MET-01"]["comercializable"] and por["MET-01"]["por_participacion"]
    assert not por["INT-01"]["comercializable"]

    base = {"sede": "NAVE", "fixture_id": "f-INT-01", "cara": "A"}
    r = client.put("/api/planogramas/borrador", headers=admin,
                   json={**base, "version": 0, "piezas": [{"destino_id": lacteos, "pb": 4000, "vertices": _rect(0, 0.4)}]})
    assert r.status_code == 200, r.text
    por, _ = _caras(client, admin)
    assert por["INT-01"]["estado"] == "borrador"
    assert por["INT-01"]["destinos"] == ["Lácteos"]

    r = client.post("/api/planogramas/publicar", headers=admin,
                    json={**base, "version": 1, "rige_desde": date(2026, 10, 24).isoformat()})
    assert r.status_code == 200, r.text
    por, orden = _caras(client, admin)
    assert por["INT-01"]["estado"] == "lista"
    assert por["INT-01"]["vigente"]["numero"] == 1
    assert por["INT-01"]["montaje"] == "sin_montar"
    assert orden[-1] == "INT-01", "lo que está listo va al final"

    # Quien monta dice que no se pudo: vuelve a pedir algo.
    v = por["INT-01"]["vigente"]["id"]
    r = client.post("/api/planogramas/guia/enlace", headers=admin, json={"version_id": v})
    from urllib.parse import parse_qs, urlparse

    t = parse_qs(urlparse(r.json()["url"]).query)["t"][0]
    r = client.post("/api/guia/aviso", params={"token": t}, json={"estado": "no_se_pudo", "motivo": "sin_producto"})
    assert r.status_code in (200, 201), r.text
    por, orden = _caras(client, admin)
    assert (por["INT-01"]["estado"], por["INT-01"]["motivo"]) == ("para_revisar", "no_se_pudo")
    assert orden[0] == "INT-01"

    # Quien no administra: sólo lo que no se vende.
    _por, orden = _caras(client, worker)
    assert set(orden) == {"INT-01", "INT-02"}
