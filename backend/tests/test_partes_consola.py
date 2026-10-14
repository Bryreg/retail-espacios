"""Vender por partes en la consola de la plataforma (el detalle por cliente).

Lo que la revisión de la rama encontró —la venta estaba bien, lo que mentía era
cómo se informaba— y quedó fijo acá:

· una nevera vendida ENTERA hasta el 15 con su puerta 2 vendida desde el 16 no
  «se libera» el 15: la entera no se puede vender hasta que termine la puerta,
  así que no es una oportunidad ni se le ofrece a nadie;
· una pieza vendida (la bahía de impulso de una caja) no sale libre en el
  resumen por tipo: la caja no es un espacio y su bahía no cuelga de ninguna
  cara, así que se mira su contrato por su código;
· las puertas de una nevera vendida entera no están libres: en esas fechas
  ninguna se puede vender (``chocan``);
· el contrato de una pieza sale en el detalle (``piezas``), para que «N sobre
  el plano + K fuera» cierre con los contratos.
"""
import json
from datetime import date

from conftest import SEPTIEMBRE_DE_2026
from test_plataforma_detalle import (
    Identidades, _detalle, _fundar, _limpiar_caches, _operador_sin_membresias, _sembrar,
)

pytestmark = SEPTIEMBRE_DE_2026

_NEVERA = {"code": "NEV-03", "type": "nevera_puertas", "sede": "NAVE", "w": 2.07, "d": 0.7,
           "partes": {"puertas": 3, "division": "puertas"}}
_CAJA = {"code": "CAJ-04", "type": "checkout", "sede": "NAVE", "w": 1.8, "d": 0.7, "partes": {"bahias": 2}}
_PUNTA = {"code": "PUN-01", "type": "punta", "sede": "NAVE", "w": 1.2, "d": 0.6}
_SIN_TARIFAS = {"default": {}, "by_sede": {}}


def _mapas(*fixtures):
    from app import plataforma_metricas as pm
    return pm._mapa_tipos_de_sede(list(fixtures), "NAVE"), pm._mapa_partes_de_sede(list(fixtures), "NAVE")


def _contrato(codigo, proveedor, canon, inicio, fin):
    from app import plataforma_detalle as pd
    return pd._Contrato(codigo, proveedor, None, canon, inicio, fin, True)


# ─── Las funciones, una por una ───────────────────────────────────────────────
#
# Piden `client` aunque no lo usen: importar `app` sin él arma el motor con el
# `DATABASE_URL` por defecto, y las pruebas de punta a punta que siguen en el
# mismo proceso escribirían en `backend/retail_espacios.db` (pasó).

def test_la_entera_no_se_libera_mientras_corra_una_de_sus_puertas(client):
    from app import plataforma_detalle as pd

    mapa_tipos, partes = _mapas(_NEVERA)
    desde, hasta = date(2026, 9, 1), date(2026, 9, 30)
    publicados = {
        "NAVE-NEV-03": _contrato("NAVE-NEV-03", "Coca-Cola", 900_000.0, date(2026, 9, 1), date(2026, 9, 15)),
        "NAVE-NEV-03-PU2": _contrato("NAVE-NEV-03-PU2", "Postobón", 300_000.0, date(2026, 9, 16),
                                     date(2026, 12, 31)),
    }
    (e,) = pd._armar_espacios(mapa_tipos, {"NAVE-NEV-03": _NEVERA}, {}, publicados, desde, hasta, partes)
    assert e["estado"] == "ocupado", e
    # El contrato publicado de la cara sigue siendo el suyo; la puerta, debajo.
    assert e["contrato"]["fin"] == "2026-09-15"
    assert [(p["parte"], p["contrato"]["fin"]) for p in e["partes"]] == [("PU2", "2026-12-31")]
    assert pd._armar_oportunidades([e], {}, []) == []

    # Al revés —la puerta termina antes que la entera— manda la entera, como siempre.
    publicados["NAVE-NEV-03"] = _contrato("NAVE-NEV-03", "Coca-Cola", 900_000.0, date(2026, 9, 16),
                                          date(2026, 9, 20))
    publicados["NAVE-NEV-03-PU2"] = _contrato("NAVE-NEV-03-PU2", "Postobón", 300_000.0, date(2026, 9, 1),
                                              date(2026, 9, 10))
    (e,) = pd._armar_espacios(mapa_tipos, {"NAVE-NEV-03": _NEVERA}, {}, publicados, desde, hasta, partes)
    assert e["estado"] == "se_libera"


def test_el_resumen_por_tipo_mira_el_contrato_de_cada_parte_por_su_codigo(client):
    from app import plataforma_detalle as pd

    mapa_tipos, partes = _mapas(_NEVERA, _CAJA, _PUNTA)
    desde, hasta = date(2026, 9, 1), date(2026, 9, 30)
    publicados = {
        # La nevera vendida ENTERA: ninguna de sus puertas se puede vender.
        "NAVE-NEV-03": _contrato("NAVE-NEV-03", "Coca-Cola", 900_000.0, date(2026, 9, 1), date(2026, 12, 31)),
        # La bahía 1 de la caja: la caja no es un espacio.
        "NAVE-CAJ-04-BI1": _contrato("NAVE-CAJ-04-BI1", "Colombina", 150_000.0, date(2026, 9, 1),
                                     date(2026, 12, 31)),
    }
    fixtures = {"NAVE-NEV-03": _NEVERA, "NAVE-PUN-01": _PUNTA}
    espacios = pd._armar_espacios(mapa_tipos, fixtures, {}, publicados, desde, hasta, partes)
    resumen = {r["tipo"]: r for r in pd._armar_resumen_por_tipo(espacios, mapa_tipos, _SIN_TARIFAS, partes,
                                                                 publicados)}
    bahia = resumen["parte_bahia"]
    assert (bahia["total"], bahia["ocupados"], bahia["libres"]) == (2, 1, 1), bahia
    assert bahia["canon_promedio"] == 150_000.0
    puerta = resumen["parte_puerta"]
    assert (puerta["total"], puerta["ocupados"], puerta["libres"]) == (3, 3, 0), puerta
    # Tomadas por la entera, sin canon propio: el canon es de la nevera.
    assert puerta["canon_promedio"] is None
    assert resumen["nevera_puertas"]["canon_promedio"] == 900_000.0

    # Con una puerta vendida (y la entera libre), las otras dos siguen libres.
    publicados = {"NAVE-NEV-03-PU2": _contrato("NAVE-NEV-03-PU2", "Postobón", 300_000.0, date(2026, 9, 1),
                                               date(2026, 12, 31))}
    espacios = pd._armar_espacios(mapa_tipos, fixtures, {}, publicados, desde, hasta, partes)
    resumen = {r["tipo"]: r for r in pd._armar_resumen_por_tipo(espacios, mapa_tipos, _SIN_TARIFAS, partes,
                                                                 publicados)}
    puerta = resumen["parte_puerta"]
    assert (puerta["ocupados"], puerta["libres"], puerta["canon_promedio"]) == (1, 2, 300_000.0), puerta


def test_las_piezas_vendidas_salen_con_su_contrato_y_sin_tarifa(client):
    from app import plataforma_detalle as pd

    _mapa_tipos, partes = _mapas(_CAJA)
    publicados = {"NAVE-CAJ-04-BI1": _contrato("NAVE-CAJ-04-BI1", "Colombina", 150_000.0, date(2026, 9, 1),
                                               date(2026, 12, 31))}
    (pieza,) = pd._armar_piezas(partes, publicados, date(2026, 9, 1))
    assert {k: v for k, v in pieza.items() if k != "contrato"} == {
        "parte": "BI1", "codigo": "NAVE-CAJ-04-BI1", "codigo_corto": "CAJ-04-BI1", "sede": "NAVE",
        "tipo": "parte_bahia",
    }
    assert pieza["contrato"]["proveedor"] == "Colombina" and pieza["contrato"]["fin"] == "2026-12-31"
    assert "tarifa" not in json.dumps(pieza)
    assert pd._armar_piezas(partes, {}, date(2026, 9, 1)) == []


# ─── De punta a punta, por el endpoint ────────────────────────────────────────

def test_el_detalle_con_partes_cierra_sus_cuentas(client, monkeypatch):
    ids = Identidades(client)
    _fundar(ids, "uid-pc", "duena@pc.co", "partcli", "Autoservicio Zafiro")
    _sembrar("partcli", {"NAVE": [_NEVERA, _CAJA, _PUNTA]}, [
        ("NAVE-NEV-03", "Coca-Cola", None, "2026-09-01", "2026-12-31", 900_000.0, True),
        ("NAVE-CAJ-04-BI1", "Colombina", None, "2026-09-01", "2026-12-31", 150_000.0, True),
    ])
    cab = _operador_sin_membresias(ids, monkeypatch)
    _limpiar_caches()
    d = _detalle(client, cab, slug="partcli")
    por_tipo = {r["tipo"]: r for r in d["resumen_por_tipo"]}
    assert por_tipo["parte_puerta"]["libres"] == 0, por_tipo["parte_puerta"]
    assert por_tipo["parte_bahia"]["ocupados"] == 1, por_tipo["parte_bahia"]
    assert [p["codigo"] for p in d["piezas"]] == ["NAVE-CAJ-04-BI1"]
    # «N · M sobre el plano + K fuera» cierra: lo que cuenta `contratosSobreElPlano`.
    en_plano = (sum(1 for e in d["espacios"] if e["contrato"])
                + sum(len(e.get("partes") or []) for e in d["espacios"]) + len(d["piezas"]))
    contratos = sum(p["espacios"] for p in d["proveedores"])
    assert contratos == en_plano + d["contratos_fuera_del_plano"] == 2


def test_el_detalle_no_ofrece_la_entera_con_una_puerta_vendida_despues(client, monkeypatch):
    ids = Identidades(client)
    _fundar(ids, "uid-pc2", "duena@pc2.co", "partcli2", "Minimercado Ocaso")
    _sembrar("partcli2", {"NAVE": [_NEVERA, _PUNTA]}, [
        ("NAVE-NEV-03", "Coca-Cola", None, "2026-09-01", "2026-09-15", 900_000.0, True),
        ("NAVE-NEV-03-PU2", "Postobón", None, "2026-09-16", "2026-12-31", 300_000.0, True),
    ])
    cab = _operador_sin_membresias(ids, monkeypatch)
    _limpiar_caches()
    d = _detalle(client, cab, slug="partcli2")
    nev = next(e for e in d["espacios"] if e["codigo"] == "NAVE-NEV-03")
    assert nev["estado"] == "ocupado", nev["estado"]
    assert "NAVE-NEV-03" not in [o["codigo"] for o in d["oportunidades"]]
    assert not any("NEV-03" in r["explicacion"] for r in d["recomendaciones"] if r["tipo"] == "espacio_libre")
    # Sin piezas vendidas, sin la clave: las de siempre.
    assert "piezas" not in d
