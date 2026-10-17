"""Dos sesiones no sobrevenden una cara por participación: el candado, la
lectura fresca y la versión (diseño 21-diseno-final.md §5.4, §13.2).

Patrón de ``tests/test_partes_concurrencia.py``:

· **El orden, en SQLite (siempre).** Espías que anotan, en cada camino que
  puede sobrevender (alta de reserva y de contrato, cambiar, confirmar,
  cancelar y renovar un término, confirmar la distribución), que el orden es
  ``revisar → candado(clave de la cara) → expire_all → revisar → escribir``, y
  que en la confirmación de la distribución la geometría se mide ANTES del
  candado y adentro sólo se juzga. La clave es la del MUEBLE: la misma que la
  venta de la cara entera o de una parte (``NAVE-GON-01-PU1``).
· **Las carreras, en Postgres (sólo con ``DATABASE_URL_PG_PRUEBA``).** Dos
  hilos, cada uno con su sesión, llaman al servicio; la revisión de adentro del
  primero se demora a propósito (la ventana) y el segundo arranca en el medio:

  1. dos altas de 60 % en la misma cara y fechas → una entra, la otra
     ``capacidad_excedida``; un solo término en la base;
  3. una reserva que sube de 30 % a 70 % contra un alta de 40 % → exactamente
     una falla con ``capacidad_excedida`` (fija el ``expire_all``: sin él, la
     segunda revisión leía la reserva vieja de la memoria de la sesión y
     pasaban las dos, 110 %);
  4. dos renovaciones del mismo contrato → una entra; la otra ``no_renovable``
     (el renovado ya no es el término más nuevo). El diseño decía
     ``termino_superpuesto``; la gemela ``revisar_terminos`` mira primero el
     estado del renovado, que es lo que dice más.

  Receta del Postgres descartable: ``participaciones/audit/07-pruebas.md``
  §3.7 (fuera de ``/tmp/claude-0``, socket corto, ``initdb -E UTF8``)::

      DATABASE_URL_PG_PRUEBA=postgresql://postgres@127.0.0.1:55433/prueba \\
          python -m pytest tests/test_participaciones_concurrencia.py
"""
import json
import os
import sys
import threading
import time
from collections import defaultdict
from datetime import date

import pytest

RELOJ = pytest.mark.reloj("2026-10-17T15:00:00+00:00")

GON_01 = {"id": "f-GON-01", "code": "GON-01", "sede": "NAVE", "type": "gondola", "gondolaType": "double",
          "label": "Góndola 1", "cx": 2, "cz": 2, "rotY": 0, "w": 0.9, "d": 0.9, "h": 1.8, "color": "#818cf8",
          "partes": {"division": "participacion"}}
MET_01 = {"id": "f-MET-01", "code": "MET-01", "sede": "NAVE", "type": "metro", "label": "Metro 1", "cx": 6,
          "cz": 2, "rotY": 0, "w": 1, "d": 1, "h": 0.05, "color": "#818cf8", "partes": {"division": "participacion"}}


def D(y, m, d) -> str:
    return date(y, m, d).isoformat()


# ─── El orden, siempre ────────────────────────────────────────────────────────

ESCRIBEN = ("espacio_para", "escribir_contrato", "_subir_version_termino", "_distribucion_para_escribir")


def _espiar(monkeypatch):
    """Anota revisar, candado, expire_all, medir, juzgar y la primera escritura."""
    import app.services.participaciones as P
    from sqlalchemy.orm import Session

    traza = []

    def envolver(nombre, marca):
        original = getattr(P, nombre)

        def espia(*a, **kw):
            traza.append(marca)
            return original(*a, **kw)

        monkeypatch.setattr(P, nombre, espia)

    envolver("revisar_alta", "revisar")
    envolver("medir_capa", "medir")
    envolver("juzgar_capa", "juzgar")
    for nombre in ESCRIBEN:
        envolver(nombre, "escribir")
    tomar = P.tomar_candados
    monkeypatch.setattr(P, "tomar_candados", lambda db, c: (traza.append(("candado", tuple(sorted(c)))),
                                                            tomar(db, c))[1])
    expirar = Session.expire_all
    monkeypatch.setattr(Session, "expire_all", lambda self: (traza.append("expire_all"), expirar(self))[1])
    return traza


def _hasta_escribir(traza):
    corte = traza.index("escribir")
    return traza[:corte]


@RELOJ
def test_cada_camino_toma_el_candado_de_la_cara_y_relee_antes_de_la_revision_que_escribe(client, admin, monkeypatch):
    from app.services.candado import claves_de_candado

    r = client.put("/api/layout/NAVE", headers=admin, json={"fixtures": [GON_01, MET_01], "base_updated_at": None})
    assert r.status_code == 200, r.text
    traza = _espiar(monkeypatch)
    termino_ok = ["revisar", ("candado", ("NAVE-GON-01",)), "expire_all", "revisar"]

    def pedir(metodo, url, cuerpo, codigo):
        traza.clear()
        r = client.request(metodo, url, headers=admin, json=cuerpo)
        assert r.status_code == codigo, r.text
        return r.json()

    alta = {"sede": "NAVE", "espacio": "GON-01", "proveedor": "Postobón", "marca": "Hit", "puntos_basicos": 2000}
    contrato = pedir("POST", "/api/participaciones/", {**alta, "tipo": "contrato", "desde": D(2026, 10, 1),
                                                       "hasta": D(2026, 12, 31), "valor_mensual": 1}, 201)["termino"]
    assert _hasta_escribir(traza) == termino_ok, traza
    reserva = pedir("POST", "/api/participaciones/", {**alta, "tipo": "reserva", "desde": D(2026, 11, 1),
                                                      "hasta": D(2026, 11, 30), "caduca": D(2026, 10, 25)},
                    201)["termino"]
    assert _hasta_escribir(traza) == termino_ok, traza

    # Una distribución confirmada: los caminos que cambian términos la miden ANTES del candado.
    zonas = [{"participacion_space_id": contrato["space_id"], "vertices": [[0.1, 0], [0.2, 0], [0.2, 1], [0.1, 1]]}]
    pedir("POST", "/api/participaciones/distribucion/confirmar",
          {"sede": "NAVE", "espacio": "GON-01", "version": 0, "zonas": zonas}, 200)
    previo = _hasta_escribir(traza)
    i = previo.index(("candado", ("NAVE-GON-01",)))
    assert "medir" in previo[:i] and "revisar" not in previo, previo
    assert previo[i:] == [("candado", ("NAVE-GON-01",)), "expire_all", "juzgar"], previo

    pedir("PATCH", f"/api/participaciones/{reserva['id']}", {"version": 1, "puntos_basicos": 2500}, 200)
    previo = _hasta_escribir(traza)
    assert [p for p in previo if p != "medir"] == termino_ok and previo[0] == "medir", previo
    pedir("POST", f"/api/participaciones/{reserva['id']}/confirmar", {"version": 2, "valor_mensual": 1}, 200)
    previo = _hasta_escribir(traza)
    assert [p for p in previo if p != "medir"] == termino_ok and "medir" not in previo[previo.index("expire_all"):]
    renovada = pedir("POST", f"/api/participaciones/{contrato['id']}/renovar", {
        "version": 1, "tipo": "reserva", "desde": D(2027, 1, 1), "hasta": D(2027, 1, 31),
        "caduca": D(2026, 12, 1)}, 201)["termino"]
    assert [p for p in _hasta_escribir(traza) if p != "medir"] == termino_ok, traza
    pedir("POST", f"/api/participaciones/{renovada['id']}/cancelar", {"version": 1}, 200)
    assert _hasta_escribir(traza) == termino_ok, traza

    # La cara B toma el candado de su código, que es el mismo del mueble.
    pedir("POST", "/api/participaciones/", {**alta, "espacio": "GON-01-B", "tipo": "contrato",
                                            "desde": D(2026, 10, 1), "hasta": D(2026, 12, 31), "valor_mensual": 1}, 201)
    assert _hasta_escribir(traza)[1] == ("candado", ("NAVE-GON-01-B",))
    misma = claves_de_candado(["NAVE-GON-01"])
    for codigo in ("NAVE-GON-01-B", "NAVE-GON-01-PU1", "NAVE-GON-01-B-PC3", "NAVE-GON-01-PC1"):
        assert claves_de_candado([codigo]) == misma, codigo

    # Un rechazo de adentro no escribe nada.
    traza.clear()
    r = client.post("/api/participaciones/", headers=admin, json={
        **alta, "tipo": "contrato", "puntos_basicos": 9000, "desde": D(2026, 10, 1), "hasta": D(2026, 12, 31),
        "valor_mensual": 1})
    assert r.status_code == 409 and "escribir" not in traza, traza


# ─── Las carreras, contra Postgres ────────────────────────────────────────────

PG = os.environ.get("DATABASE_URL_PG_PRUEBA", "")
SIN_PG = pytest.mark.skipif(not PG.startswith("postgresql"),
                            reason="las carreras de dos hilos se corren contra un Postgres descartable")


def _purgar():
    for nombre in [m for m in sys.modules if m == "app" or m.startswith("app.")]:
        del sys.modules[nombre]


@pytest.fixture()
def pg(monkeypatch):
    """La app contra el Postgres descartable, con el plano sembrado."""
    _purgar()
    monkeypatch.setenv("DATABASE_URL", PG)
    monkeypatch.setenv("JWT_SECRET", "test-secret")
    try:
        import app.models.models  # noqa: F401 — registra las tablas
        import app.models.participaciones  # noqa: F401
        import app.services.participaciones as P
        from app.database import Base, SessionLocal, engine
        from app.models.models import LayoutSnapshot

        Base.metadata.drop_all(engine)
        Base.metadata.create_all(engine)
        db = SessionLocal()
        db.add(LayoutSnapshot(sede="NAVE", fixtures_json=json.dumps([GON_01, MET_01])))
        db.commit()
        db.close()
        yield P, SessionLocal
        engine.dispose()
        Base.metadata.drop_all(engine)
    finally:
        _purgar()


def _alta(P, SessionLocal, pb, tipo="contrato", **extra):
    cuerpo = {"sede": "NAVE", "espacio": "GON-01", "tipo": tipo, "proveedor": "Postobón", "marca": "Hit",
              "puntos_basicos": pb, "desde": date(2026, 11, 1), "hasta": date(2026, 11, 30),
              "caduca": date(2026, 10, 25) if tipo == "reserva" else None,
              "valor_mensual": 1.0 if tipo == "contrato" else None, "notas": None, "correo": None, **extra}
    return cuerpo


def _correr(P, SessionLocal, monkeypatch, primera, segunda):
    """Corre ``primera`` y ``segunda`` en dos hilos con su sesión. La revisión
    de ADENTRO (la segunda llamada) de la primera se queda mirando 0,6 s antes
    de escribir: es la ventana. La segunda arranca ahí: sin candado (o sin
    lectura fresca) pasaría su revisión sobre datos viejos."""
    from fastapi import HTTPException

    original = P.revisar_alta
    llamadas = defaultdict(int)
    en_la_ventana = threading.Event()

    def demorado(*a, **kw):
        r = original(*a, **kw)
        nombre = threading.current_thread().name
        llamadas[nombre] += 1
        if nombre == "primera" and llamadas[nombre] == 2:
            en_la_ventana.set()
            time.sleep(0.6)
        return r

    monkeypatch.setattr(P, "revisar_alta", demorado)
    resultados = {}

    def correr(nombre, paso):
        s = SessionLocal()
        try:
            paso(s)
            s.commit()
            resultados[nombre] = "ok"
        except HTTPException as e:
            s.rollback()
            resultados[nombre] = e.detail["code"] if isinstance(e.detail, dict) else e.detail
        except Exception as e:  # pragma: no cover — que el hilo no muera callado
            s.rollback()
            resultados[nombre] = f"{type(e).__name__}: {e}"
        finally:
            s.close()

    hilos = [threading.Thread(target=correr, args=("primera", primera), name="primera"),
             threading.Thread(target=correr, args=("segunda", segunda), name="segunda")]
    hilos[0].start()
    assert en_la_ventana.wait(10), f"la primera no llegó a la revisión de adentro: {resultados}"
    hilos[1].start()
    for h in hilos:
        h.join(20)
    return resultados


@SIN_PG
@RELOJ
def test_dos_altas_de_60_a_la_vez_dejan_una_sola(pg, monkeypatch):
    from app.models.participaciones import Participacion

    P, SessionLocal = pg
    resultados = _correr(P, SessionLocal, monkeypatch,
                         lambda s: P.alta(s, _alta(P, SessionLocal, 6000), "a@x.co"),
                         lambda s: P.alta(s, _alta(P, SessionLocal, 6000, proveedor="Alpina"), "b@x.co"))
    assert resultados == {"primera": "ok", "segunda": "capacidad_excedida"}, resultados
    s = SessionLocal()
    try:
        assert s.query(Participacion).count() == 1
    finally:
        s.close()


@SIN_PG
@RELOJ
def test_una_reserva_que_sube_contra_un_alta_no_pasan_las_dos(pg, monkeypatch):
    from app.models.participaciones import Participacion

    P, SessionLocal = pg
    s = SessionLocal()
    reserva = P.alta(s, _alta(P, SessionLocal, 3000, tipo="reserva"), "a@x.co").termino.id
    s.commit()
    s.close()
    resultados = _correr(
        P, SessionLocal, monkeypatch,
        lambda s: P.editar(s, reserva, {"version": 1, "puntos_basicos": 7000}, {"version", "puntos_basicos"},
                           "a@x.co"),
        lambda s: P.alta(s, _alta(P, SessionLocal, 4000, proveedor="Alpina"), "b@x.co"))
    assert resultados == {"primera": "ok", "segunda": "capacidad_excedida"}, resultados
    s = SessionLocal()
    try:
        assert [t.puntos_basicos for t in s.query(Participacion).order_by(Participacion.id)] == [7000]
    finally:
        s.close()


@SIN_PG
@RELOJ
def test_dos_renovaciones_del_mismo_contrato_dejan_una(pg, monkeypatch):
    from app.models.participaciones import Participacion

    P, SessionLocal = pg
    s = SessionLocal()
    contrato = P.alta(s, _alta(P, SessionLocal, 2500, desde=date(2026, 10, 1), hasta=date(2026, 12, 31)),
                      "a@x.co").termino.id
    s.commit()
    s.close()
    renovar = {"version": 1, "desde": date(2027, 1, 1), "hasta": date(2027, 3, 31), "correo": None, "notas": None}
    resultados = _correr(
        P, SessionLocal, monkeypatch,
        lambda s: P.renovar(s, contrato, {**renovar, "tipo": "contrato", "valor_mensual": 1.0, "caduca": None},
                            "a@x.co"),
        lambda s: P.renovar(s, contrato, {**renovar, "tipo": "reserva", "valor_mensual": None,
                                          "caduca": date(2026, 12, 1)}, "b@x.co"))
    assert resultados == {"primera": "ok", "segunda": "no_renovable"}, resultados
    s = SessionLocal()
    try:
        assert s.query(Participacion).count() == 2
    finally:
        s.close()
