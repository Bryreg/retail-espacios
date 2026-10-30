"""Dos sesiones no venden la misma nevera a la vez: el candado.

Con la venta por partes la nevera entera (``NEV-03``) y su puerta 2
(``NEV-03-PU2``) son dos filas distintas de ``spaces`` —la de la puerta puede
ni existir todavía—, y las dos sesiones revisan antes de escribir. Sin
candado, dos ventas que se confirman al mismo tiempo pasan las dos la revisión
y la nevera queda vendida entera Y por puertas. El candado es por mueble, de
transacción y ordenado (``services/candado.py``).

Dos pruebas:

· **El orden, en SQLite (siempre).** Un espía comprueba que ``confirmar`` toma
  los candados de los muebles que toca —ordenados— ANTES de la revisión con la
  que escribe, y que el contrato suelto y el guardado del plano también los
  toman.
· **La carrera, en Postgres (sólo con ``DATABASE_URL_PG_PRUEBA``).** Dos hilos
  con su propia sesión: uno confirma la nevera entera y el otro la puerta 2 en
  fechas que se pisan, con la revisión del primero demorada a propósito. Sale
  exactamente un contrato. Se corre contra un Postgres 16 descartable, como la
  verificación de la cobranza y de las fotos vencidas::

      DATABASE_URL_PG_PRUEBA=postgresql://…/prueba python -m pytest tests/test_partes_concurrencia.py
"""
from tests import sin_planilla  # las partes: la revisión común, sin las reglas de la planilla
import os
import sys
import threading
import time
from datetime import timedelta

import pytest

# Las carreras contra Postgres comparten la base descartable: todas al mismo
# proceso cuando la suite corre en paralelo (`pytest -n auto --dist loadgroup`).
pytestmark = pytest.mark.xdist_group("postgres")

from app.fechas import hoy as hoy_en_colombia  # el «hoy» del negocio: Colombia

HOY = hoy_en_colombia()

NEVERA = {
    "id": "n3", "code": "NEV-03", "sede": "NAVE", "type": "nevera_puertas", "label": "Nevera de Puertas",
    "cx": 4, "cz": 2, "rotY": 0, "w": 2.07, "d": 0.7, "h": 2.1, "color": "#1e293b",
    "partes": {"puertas": 3, "division": "puertas"},
}
OTRA = {**NEVERA, "id": "n1", "code": "NEV-01", "cx": 9}


def _fila(espacio, fila=1):
    return {"fila": fila, "espacio": espacio, "sede": "NAVE", "proveedor": "Postobón", "valor": 1,
            "desde": (HOY + timedelta(days=1)).isoformat(), "hasta": (HOY + timedelta(days=30)).isoformat()}


# ─── El orden, siempre ────────────────────────────────────────────────────────

def test_confirmar_toma_los_candados_ordenados_antes_de_la_revision_que_escribe(client, admin, monkeypatch):
    import app.routers.bulk_leases as bl
    from app.services.candado import claves_de_candado

    r = client.put("/api/layout/NAVE", headers=admin, json={"fixtures": [NEVERA, OTRA], "base_updated_at": None})
    assert r.status_code == 200, r.text

    pasos = []
    tomar, revisar = bl.tomar_candados, bl._revisar
    monkeypatch.setattr(bl, "tomar_candados", lambda db, c: pasos.append(("candado", tomar(db, c))))
    monkeypatch.setattr(bl, "_revisar", lambda db, lote, **kw: (pasos.append(("revisar", None)), revisar(db, lote, **kw))[1])

    r = sin_planilla.post("/api/leases/bulk/confirmar", json={"sede": "NAVE", "filas": [
        _fila("NEV-03-PU2"), _fila("nev-01", fila=2)]})
    assert r.status_code == 200, r.text
    assert [p for p, _ in pasos] == ["revisar", "candado", "revisar"], pasos
    claves = pasos[1][1]
    assert claves == sorted(claves) and len(claves) == 2, claves
    # Por mueble: la nevera entera y su puerta tienen el mismo candado.
    assert claves_de_candado(["NAVE-NEV-03"]) == claves_de_candado(["NAVE-NEV-03-PU2", "NAVE-NEV-03-B"])
    assert set(claves) == set(claves_de_candado(["NAVE-NEV-03", "NAVE-NEV-01"]))


def test_el_contrato_suelto_y_el_plano_tambien_toman_el_candado(client, admin, monkeypatch):
    import app.routers.layout as lay
    import app.routers.spaces as sp
    from app.services.candado import claves_de_candado

    r = client.put("/api/layout/NAVE", headers=admin, json={"fixtures": [NEVERA], "base_updated_at": None})
    assert r.status_code == 200, r.text
    tomados = []
    monkeypatch.setattr(sp, "tomar_candados", lambda db, c: tomados.append(("suelto", sorted(c))))
    monkeypatch.setattr(lay, "tomar_candados", lambda db, c: tomados.append(("plano", sorted(c))))

    s = client.post("/api/spaces/find-or-create", headers=admin,
                    json={"code": "NAVE-NEV-03-PU2", "name": "x", "zone": "z", "sede": "NAVE", "area_m2": 1}).json()
    sup = client.post("/api/suppliers/find-or-create", headers=admin, json={"name": "Postobón"}).json()
    r = client.post(f"/api/spaces/{s['id']}/leases", headers=admin, json={
        "supplier_id": sup["id"], "start_date": (HOY + timedelta(days=1)).isoformat(),
        "end_date": (HOY + timedelta(days=9)).isoformat(), "monthly_rent": 1})
    assert r.status_code == 201, r.text
    assert tomados == [("suelto", ["NAVE-NEV-03-PU2"])]

    # Bajar la nevera a dos puertas toca la forma de venderla: candado.
    r = client.put("/api/layout/NAVE", headers=admin, json={"fixtures": [
        {**NEVERA, "partes": {"puertas": 2, "division": "puertas"}}], "base_updated_at": None})
    assert r.status_code == 409, r.text
    plano = [c for quien, c in tomados if quien == "plano"]
    assert plano and claves_de_candado(plano[0]) == claves_de_candado(["NAVE-NEV-03"]), tomados


def test_el_contrato_suelto_toma_el_candado_antes_de_revisar(client, admin, monkeypatch):
    """Que lo tome no alcanza: tomado justo antes de escribir, dos sesiones
    (la nevera entera y su puerta 2) pasan las dos la revisión."""
    import app.routers.spaces as sp

    r = client.put("/api/layout/NAVE", headers=admin, json={"fixtures": [NEVERA], "base_updated_at": None})
    assert r.status_code == 200, r.text
    pasos = []
    tomar, compuerta, choques = sp.tomar_candados, sp.por_que_no_se_vende, sp.contratos_que_chocan
    monkeypatch.setattr(sp, "tomar_candados", lambda db, c: (pasos.append("candado"), tomar(db, c))[1])
    monkeypatch.setattr(sp, "por_que_no_se_vende",
                        lambda *a, **kw: (pasos.append("compuerta"), compuerta(*a, **kw))[1])
    monkeypatch.setattr(sp, "contratos_que_chocan",
                        lambda *a, **kw: (pasos.append("choques"), choques(*a, **kw))[1])

    s = client.post("/api/spaces/find-or-create", headers=admin,
                    json={"code": "NAVE-NEV-03-PU2", "name": "x", "zone": "z", "sede": "NAVE", "area_m2": 1}).json()
    sup = client.post("/api/suppliers/find-or-create", headers=admin, json={"name": "Postobón"}).json()
    r = client.post(f"/api/spaces/{s['id']}/leases", headers=admin, json={
        "supplier_id": sup["id"], "start_date": (HOY + timedelta(days=1)).isoformat(),
        "end_date": (HOY + timedelta(days=9)).isoformat(), "monthly_rent": 1})
    assert r.status_code == 201, r.text
    assert pasos == ["candado", "compuerta", "choques"], pasos


def test_la_importacion_del_plano_toma_los_candados_antes_de_la_revision_que_escribe(client, admin, monkeypatch):
    """La importación de los contratos que viven en el plano: mira, toma el
    candado de los muebles que va a escribir y vuelve a mirar. Entre la primera
    mirada y la escritura alguien pudo vender una puerta de esa nevera."""
    import json

    import app.services.importar_del_plano as imp
    from app.database import SessionLocal
    from app.models.models import LayoutSnapshot
    from app.services.candado import claves_de_candado

    r = client.put("/api/layout/NAVE", headers=admin, json={"fixtures": [NEVERA, OTRA], "base_updated_at": None})
    assert r.status_code == 200, r.text
    db = SessionLocal()
    try:
        snap = db.query(LayoutSnapshot).filter(LayoutSnapshot.sede == "NAVE").one()
        vendida = {**NEVERA, "status": "occupied", "supplierName": "Alpina", "negotiatedValue": 1,
                   "startDate": (HOY + timedelta(days=1)).isoformat(),
                   "endDate": (HOY + timedelta(days=30)).isoformat()}
        snap.fixtures_json = json.dumps([vendida, OTRA])
        db.commit()
    finally:
        db.close()

    pasos = []
    tomar, revisar = imp.tomar_candados, imp.revisar
    monkeypatch.setattr(imp, "tomar_candados", lambda db, c: (pasos.append(("candado", sorted(c))), tomar(db, c))[1])
    monkeypatch.setattr(imp, "revisar", lambda db: (pasos.append(("revisar", None)), revisar(db))[1])

    r = client.post("/api/layout/importacion/aplicar", headers=admin)
    assert r.status_code == 200, r.text
    assert len(r.json()["importables"]) == 1, r.json()
    assert [p for p, _ in pasos] == ["revisar", "candado", "revisar"], pasos
    assert claves_de_candado(pasos[1][1]) == claves_de_candado(["NAVE-NEV-03"]), pasos


# ─── La carrera, contra Postgres ──────────────────────────────────────────────

PG = os.environ.get("DATABASE_URL_PG_PRUEBA", "")


@pytest.mark.skipif(not PG.startswith("postgresql"), reason="la carrera de dos hilos se corre contra un Postgres descartable")
def test_dos_ventas_a_la_vez_dejan_un_solo_contrato(monkeypatch):
    import json

    for nombre in [m for m in sys.modules if m == "app" or m.startswith("app.")]:
        del sys.modules[nombre]
    monkeypatch.setenv("DATABASE_URL", PG)
    monkeypatch.setenv("JWT_SECRET", "test-secret")
    try:
        import app.models.models  # noqa: F401 — registra las tablas
        import app.routers.bulk_leases as bl
        from app.clientes import Cliente
        from app.database import Base, SessionLocal, engine
        from app.models.models import LayoutSnapshot, SpaceLease
        from fastapi import BackgroundTasks

        Base.metadata.drop_all(engine)
        Base.metadata.create_all(engine)
        db = SessionLocal()
        db.add(LayoutSnapshot(sede="NAVE", fixtures_json=json.dumps([NEVERA])))
        db.commit()
        db.close()

        original = bl.contratos_que_chocan
        llamadas = {"NAVE-NEV-03": 0}
        en_la_ventana = threading.Event()

        def demorado(db, codigo, *a, **kw):
            r = original(db, codigo, *a, **kw)
            # La nevera entera, en la revisión con la que va a escribir (la
            # segunda), se queda mirando ANTES de escribir: es la ventana. Sin
            # candado, la puerta revisa en el medio, no ve nada y escriben las
            # dos; con candado, la puerta espera el commit y ve la nevera.
            if codigo == "NAVE-NEV-03":
                llamadas[codigo] += 1
                if llamadas[codigo] == 2:
                    en_la_ventana.set()
                    time.sleep(0.6)
            return r

        monkeypatch.setattr(bl, "contratos_que_chocan", demorado)
        cliente = Cliente(slug="galerias", nombre="Galerías", db_name="prueba")
        resultados = {}

        def vender(espacio):
            s = SessionLocal()
            try:
                lote = bl.LoteIn(sede="NAVE", filas=[bl.FilaIn(**_fila(espacio))])
                resultados[espacio] = bl.confirmar_lote(s, lote, BackgroundTasks(), cliente)
            finally:
                s.close()

        entera = threading.Thread(target=vender, args=("NEV-03",))
        puerta = threading.Thread(target=vender, args=("NEV-03-PU2",))
        entera.start()
        assert en_la_ventana.wait(10), "la venta de la nevera entera no llegó a revisar"
        puerta.start()
        for h in (entera, puerta):
            h.join(20)
        s = SessionLocal()
        try:
            assert s.query(SpaceLease).count() == 1, resultados
        finally:
            s.close()
        assert sorted(r.creados for r in resultados.values()) == [0, 1], resultados
        Base.metadata.drop_all(engine)
    finally:
        for nombre in [m for m in sys.modules if m == "app" or m.startswith("app.")]:
            del sys.modules[nombre]
