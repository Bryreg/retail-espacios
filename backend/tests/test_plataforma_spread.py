"""Fase 6: el spread (canon vs tarifa de referencia) del panel de plataforma.

Reusa el andamiaje de ``test_plataforma_metricas.py`` (``Identidades``,
``_fundar``, ``_operador_sin_membresias``, ``_sembrar``, ``_romper``, ``_cab``,
``_fila``). Cada test siembra su propio cliente con las tarifas que necesita,
vía ``set_config(db, RATES_KEY, json.dumps({...}))`` en la base DEL CLIENTE
-- el mismo camino que usa ``PUT /api/layout/rates``, sin pasar por HTTP.
"""
import json

from tests.test_plataforma_metricas import (
    Identidades,
    _cab,
    _fila,
    _fundar,
    _operador_sin_membresias,
    _pedir,
    _sembrar,
)

PERIODO = "2026-09"


def _tarifas(slug, rates: dict):
    """Escribe la tarifa de referencia en la base DEL CLIENTE."""
    from app.auth import set_config
    from app.clientes import buscar, sesion_de
    from app.routers.layout import RATES_KEY

    cliente = buscar(slug)
    db = sesion_de(cliente)
    try:
        set_config(db, RATES_KEY, json.dumps(rates))
        db.commit()
    finally:
        db.close()


def _cliente_con(client, monkeypatch, slug, fixtures: dict, contratos: list, rates: dict | None):
    from app.plataforma_metricas import limpiar_cache_metricas

    ids = Identidades(client)
    _fundar(ids, f"uid-{slug}", f"duena@{slug}.co", slug, slug.title())
    _sembrar(slug, fixtures, contratos)
    if rates is not None:
        _tarifas(slug, rates)
    consola = _operador_sin_membresias(ids, monkeypatch)
    limpiar_cache_metricas()

    cuerpo = _pedir(client, _cab(consola["token"]))
    return cuerpo, _fila(cuerpo, slug)["metricas"]


# ════════════════════════════════════════════════════════════════════════════
# El caso de la spec, calculado a mano: tarifa default 1.000.000, 3 contratos
# a 900.000 -> spread = (2.700.000 / 3.000.000 - 1) * 100 = -10.0
# ════════════════════════════════════════════════════════════════════════════

def test_tres_contratos_bajo_tarifa_dan_el_spread_esperado(client, monkeypatch):
    fixtures = {"S1": [{"code": f"E-0{i}", "type": "punta", "sede": "S1"} for i in (1, 2, 3)]}
    contratos = [
        (f"S1-E-0{i}", f"Prov{i}", "2026-09-01", "2026-09-30", 900_000.0, True)
        for i in (1, 2, 3)
    ]
    rates = {"default": {"punta": 1_000_000.0}, "by_sede": {}}
    _cuerpo, m = _cliente_con(client, monkeypatch, "tres", fixtures, contratos, rates)

    assert m["spread_pct"] == -10.0
    assert m["tarifa_configurada"] is True
    assert m["contratos_sin_tarifa"] == 0


def test_dos_contratos_con_tarifa_dan_null_por_K3(client, monkeypatch):
    fixtures = {"S1": [{"code": f"E-0{i}", "type": "punta", "sede": "S1"} for i in (1, 2)]}
    contratos = [
        (f"S1-E-0{i}", f"Prov{i}", "2026-09-01", "2026-09-30", 900_000.0, True)
        for i in (1, 2)
    ]
    rates = {"default": {"punta": 1_000_000.0}, "by_sede": {}}
    _cuerpo, m = _cliente_con(client, monkeypatch, "dos", fixtures, contratos, rates)

    assert m["spread_pct"] is None
    assert m["tarifa_configurada"] is True
    assert m["contratos_sin_tarifa"] == 0


def test_sin_tarifa_configurada_da_null_y_todos_sin_tarifa(client, monkeypatch):
    fixtures = {"S1": [{"code": f"E-0{i}", "type": "punta", "sede": "S1"} for i in (1, 2, 3)]}
    contratos = [
        (f"SINTAR-E-0{i}", f"Prov{i}", "2026-09-01", "2026-09-30", 900_000.0, True)
        for i in (1, 2, 3)
    ]
    _cuerpo, m = _cliente_con(client, monkeypatch, "sintar", fixtures, contratos, rates=None)

    assert m["spread_pct"] is None
    assert m["tarifa_configurada"] is False
    assert m["contratos_sin_tarifa"] == 3


def test_tarifa_de_sede_gana_a_la_default(client, monkeypatch):
    """Sede con tarifa propia: se usa la de la sede, NUNCA la default."""
    fixtures = {"SD": [{"code": f"E-0{i}", "type": "punta", "sede": "SD"} for i in (1, 2, 3)]}
    contratos = [
        (f"SD-E-0{i}", f"Prov{i}", "2026-09-01", "2026-09-30", 1_800_000.0, True)
        for i in (1, 2, 3)
    ]
    # Default dice 1.000.000 (daría spread muy alto); la sede dice 2.000.000
    # (da -10.0). Si el código usara el default por error, el test lo dice.
    rates = {"default": {"punta": 1_000_000.0}, "by_sede": {"SD": {"punta": 2_000_000.0}}}
    _cuerpo, m = _cliente_con(client, monkeypatch, "sedeprop", fixtures, contratos, rates)

    assert m["spread_pct"] == -10.0
    assert m["tarifa_configurada"] is True


def test_contrato_sin_fixture_en_el_plano_cuenta_sin_tarifa(client, monkeypatch):
    """El espacio FANTASMA no está en el mapa código->tipo: no puede tener
    tarifa aplicable, cuenta en `contratos_sin_tarifa` y queda fuera del spread."""
    fixtures = {"S1": [{"code": f"E-0{i}", "type": "punta", "sede": "S1"} for i in (1, 2, 3)]}
    contratos = [
        (f"S1-E-0{i}", f"Prov{i}", "2026-09-01", "2026-09-30", 900_000.0, True)
        for i in (1, 2, 3)
    ] + [("FANTASMA-01", "ProvX", "2026-09-01", "2026-09-30", 5_000_000.0, True)]
    rates = {"default": {"punta": 1_000_000.0}, "by_sede": {}}
    _cuerpo, m = _cliente_con(client, monkeypatch, "fant", fixtures, contratos, rates)

    # El spread sigue siendo -10.0: FANTASMA-01 no entra a la cuenta.
    assert m["spread_pct"] == -10.0
    assert m["contratos_sin_tarifa"] == 1


def test_tipo_sin_tarifa_aplicable_cuenta_sin_tarifa_y_no_tumba_el_resto(client, monkeypatch):
    """Un tipo de mueble sin tarifa (ni por sede ni default) cuenta en
    `contratos_sin_tarifa` y queda fuera del spread; los demás contratos con
    tarifa siguen formando la cuenta."""
    fixtures = {
        "S1": [{"code": f"E-0{i}", "type": "punta", "sede": "S1"} for i in (1, 2, 3)]
        + [{"code": "COL-01", "type": "columna", "sede": "S1"}]
    }
    contratos = [
        (f"S1-E-0{i}", f"Prov{i}", "2026-09-01", "2026-09-30", 900_000.0, True)
        for i in (1, 2, 3)
    ] + [("S1-COL-01", "ProvColumna", "2026-09-01", "2026-09-30", 300_000.0, True)]
    # Sólo "punta" tiene tarifa; "columna" no la tiene ni por sede ni default.
    rates = {"default": {"punta": 1_000_000.0}, "by_sede": {}}
    _cuerpo, m = _cliente_con(client, monkeypatch, "mixto", fixtures, contratos, rates)

    assert m["spread_pct"] == -10.0
    assert m["contratos_sin_tarifa"] == 1


# ════════════════════════════════════════════════════════════════════════════
# Consolidado: Σ/Σ, distinto del promedio de spreads
# ════════════════════════════════════════════════════════════════════════════

def test_consolidado_pondera_y_difiere_del_promedio_de_spreads(client, monkeypatch):
    """Dos clientes con spreads muy distintos: el consolidado NO es el
    promedio simple de los dos spreads publicados."""
    from app.plataforma_metricas import limpiar_cache_metricas

    ids = Identidades(client)

    # A: 3 contratos a 900.000, tarifa 1.000.000 -> spread -10.0
    _fundar(ids, "uid-a", "duena@a.co", "aaa", "AAA")
    fixtures_a = {"SA": [{"code": f"E-0{i}", "type": "punta", "sede": "SA"} for i in (1, 2, 3)]}
    contratos_a = [
        (f"SA-E-0{i}", f"ProvA{i}", "2026-09-01", "2026-09-30", 900_000.0, True)
        for i in (1, 2, 3)
    ]
    _sembrar("aaa", fixtures_a, contratos_a)
    _tarifas("aaa", {"default": {"punta": 1_000_000.0}, "by_sede": {}})

    # B: 3 contratos a 400.000, tarifa 1.000.000 -> spread -60.0
    _fundar(ids, "uid-b", "duena@b.co", "bbb", "BBB")
    fixtures_b = {"SB": [{"code": f"E-0{i}", "type": "punta", "sede": "SB"} for i in (1, 2, 3)]}
    contratos_b = [
        (f"SB-E-0{i}", f"ProvB{i}", "2026-09-01", "2026-09-30", 400_000.0, True)
        for i in (1, 2, 3)
    ]
    _sembrar("bbb", fixtures_b, contratos_b)
    _tarifas("bbb", {"default": {"punta": 1_000_000.0}, "by_sede": {}})

    consola = _operador_sin_membresias(ids, monkeypatch)
    limpiar_cache_metricas()

    cuerpo = _pedir(client, _cab(consola["token"]))
    a = _fila(cuerpo, "aaa")["metricas"]
    b = _fila(cuerpo, "bbb")["metricas"]
    assert a["spread_pct"] == -10.0
    assert b["spread_pct"] == -60.0

    # Σ canon = 2.700.000 + 1.200.000 = 3.900.000; Σ tarifa = 6.000.000.
    # (3.900.000 / 6.000.000 - 1) * 100 = -35.0 -- en este reparto simétrico
    # coincide con el promedio simple de -10.0 y -60.0, así que la prueba de
    # que la cuenta es la PONDERADA (y no el promedio de promedios) es la de
    # abajo, con reparto asimétrico: `test_el_ponderado_no_es_el_promedio_de_spreads`.
    consolidado = cuerpo["consolidado"]
    assert consolidado["spread_pct"] == -35.0
    assert consolidado["clientes_con_tarifa"] == 2


def test_el_ponderado_no_es_el_promedio_de_spreads(client, monkeypatch):
    """Reparto ASIMÉTRICO a propósito: si alguien cambiara la cuenta del
    consolidado por el promedio de los spreads publicados, este test lo dice.
    """
    from app.plataforma_metricas import limpiar_cache_metricas

    ids = Identidades(client)

    # Grande: 9 contratos a 900.000, tarifa 1.000.000 -> spread -10.0
    _fundar(ids, "uid-gr", "duena@gr.co", "grande", "Grande")
    fixtures_g = {"SG": [{"code": f"E-0{i}", "type": "punta", "sede": "SG"} for i in range(1, 10)]}
    contratos_g = [
        (f"SG-E-0{i}", f"ProvG{i}", "2026-09-01", "2026-09-30", 900_000.0, True)
        for i in range(1, 10)
    ]
    _sembrar("grande", fixtures_g, contratos_g)
    _tarifas("grande", {"default": {"punta": 1_000_000.0}, "by_sede": {}})

    # Chico: 3 contratos a 400.000, tarifa 1.000.000 -> spread -60.0
    _fundar(ids, "uid-ch", "duena@ch.co", "chico", "Chico")
    fixtures_c = {"SC": [{"code": f"E-0{i}", "type": "punta", "sede": "SC"} for i in (1, 2, 3)]}
    contratos_c = [
        (f"SC-E-0{i}", f"ProvC{i}", "2026-09-01", "2026-09-30", 400_000.0, True)
        for i in (1, 2, 3)
    ]
    _sembrar("chico", fixtures_c, contratos_c)
    _tarifas("chico", {"default": {"punta": 1_000_000.0}, "by_sede": {}})

    consola = _operador_sin_membresias(ids, monkeypatch)
    limpiar_cache_metricas()

    cuerpo = _pedir(client, _cab(consola["token"]))
    grande = _fila(cuerpo, "grande")["metricas"]
    chico = _fila(cuerpo, "chico")["metricas"]
    assert grande["spread_pct"] == -10.0
    assert chico["spread_pct"] == -60.0

    promedio_de_spreads = round((grande["spread_pct"] + chico["spread_pct"]) / 2, 1)  # -35.0
    # Σ canon = 8.100.000 + 1.200.000 = 9.300.000; Σ tarifa = 12.000.000.
    # (9.300.000 / 12.000.000 - 1) * 100 = -22.5
    esperado_ponderado = -22.5
    assert cuerpo["consolidado"]["spread_pct"] == esperado_ponderado
    assert cuerpo["consolidado"]["spread_pct"] != promedio_de_spreads


def test_cliente_roto_no_suma_al_consolidado(client, monkeypatch):
    from app.plataforma_metricas import limpiar_cache_metricas
    from tests.test_plataforma_metricas import _romper

    ids = Identidades(client)
    _fundar(ids, "uid-ok", "duena@ok.co", "ok", "OK")
    fixtures = {"S1": [{"code": f"E-0{i}", "type": "punta", "sede": "S1"} for i in (1, 2, 3)]}
    contratos = [
        (f"S1-E-0{i}", f"Prov{i}", "2026-09-01", "2026-09-30", 900_000.0, True)
        for i in (1, 2, 3)
    ]
    _sembrar("ok", fixtures, contratos)
    _tarifas("ok", {"default": {"punta": 1_000_000.0}, "by_sede": {}})
    _romper()

    consola = _operador_sin_membresias(ids, monkeypatch)
    limpiar_cache_metricas()

    cuerpo = _pedir(client, _cab(consola["token"]))
    roto = _fila(cuerpo, "roto")
    assert roto["metricas"] is None
    # El consolidado es EXACTAMENTE el de "ok": el roto no aporta nada.
    assert cuerpo["consolidado"]["spread_pct"] == _fila(cuerpo, "ok")["metricas"]["spread_pct"]
    assert cuerpo["consolidado"]["clientes_con_tarifa"] == 1


# ════════════════════════════════════════════════════════════════════════════
# La tendencia sigue sin las claves nuevas; el caché sirve el spread
# ════════════════════════════════════════════════════════════════════════════

def test_tendencia_no_tiene_ni_una_clave_del_spread(client, monkeypatch):
    """`persistir_snapshots`/`publicar_fila` no conocen el spread: el
    histórico no gana columnas (SIN MIGRACIONES) y no revienta con KeyError."""
    from app.plataforma_metricas import limpiar_cache_metricas

    ids = Identidades(client)
    _fundar(ids, "uid-tnd", "duena@tnd.co", "tnd", "TND")
    fixtures = {"S1": [{"code": f"E-0{i}", "type": "punta", "sede": "S1"} for i in (1, 2, 3)]}
    contratos = [
        (f"S1-E-0{i}", f"Prov{i}", "2026-09-01", "2026-09-30", 900_000.0, True)
        for i in (1, 2, 3)
    ]
    _sembrar("tnd", fixtures, contratos)
    _tarifas("tnd", {"default": {"punta": 1_000_000.0}, "by_sede": {}})
    consola = _operador_sin_membresias(ids, monkeypatch)
    limpiar_cache_metricas()
    cab = _cab(consola["token"])

    # Dispara el write-through del snapshot de Fase 5.
    assert _pedir(client, cab)["clientes"]

    r = client.get("/api/plataforma/tendencia?cliente=tnd&meses=1", headers=cab)
    assert r.status_code == 200, r.text
    punto = r.json()["serie"][-1]
    for clave in ("spread_pct", "tarifa_configurada", "contratos_sin_tarifa", "clientes_con_tarifa"):
        assert clave not in punto, clave


def test_el_cache_de_metricas_sirve_el_spread_ya_calculado(client, monkeypatch):
    from app.plataforma_metricas import limpiar_cache_metricas

    ids = Identidades(client)
    _fundar(ids, "uid-cac", "duena@cac.co", "cac", "CAC")
    fixtures = {"S1": [{"code": f"E-0{i}", "type": "punta", "sede": "S1"} for i in (1, 2, 3)]}
    contratos = [
        (f"S1-E-0{i}", f"Prov{i}", "2026-09-01", "2026-09-30", 900_000.0, True)
        for i in (1, 2, 3)
    ]
    _sembrar("cac", fixtures, contratos)
    _tarifas("cac", {"default": {"punta": 1_000_000.0}, "by_sede": {}})
    consola = _operador_sin_membresias(ids, monkeypatch)
    limpiar_cache_metricas()
    cab = _cab(consola["token"])

    primera = _pedir(client, cab)
    segunda = _pedir(client, cab)
    assert primera["de_cache"] is False
    assert segunda["de_cache"] is True
    assert _fila(segunda, "cac")["metricas"]["spread_pct"] == -10.0
    assert _fila(segunda, "cac")["metricas"]["spread_pct"] == _fila(primera, "cac")["metricas"]["spread_pct"]
