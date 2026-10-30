"""Dos sesiones no sobrevenden una cara por participación: el candado, la
lectura fresca y la versión (diseño 21-diseno-final.md §5.4, §13.2).

Patrón de ``tests/test_partes_concurrencia.py``:

· **El orden, en SQLite (siempre).** Espías que anotan, en cada camino que
  puede sobrevender (alta de reserva y de contrato, cambiar, confirmar,
  cancelar y renovar un término, confirmar la distribución), que el orden es
  ``revisar → candado(clave de la cara) → expire_all → revisar → escribir``, y
  que en la confirmación de la distribución la geometría se mide ANTES del
  candado y adentro sólo se juzga. La clave es la del MUEBLE: la misma que la
  venta de la cara entera o de una parte (``NAVE-GON-01-PU1``). Y en los
  caminos de siempre (paso 4c): el guardado del plano que saca la división
  toma ese candado ANTES de leer los términos (A1), y la renumeración toma
  los de los códigos viejos y nuevos antes de mudar (B1).
· **Las carreras, en Postgres (sólo con ``DATABASE_URL_PG_PRUEBA``).** Dos
  hilos, cada uno con su sesión, llaman al servicio; la revisión de adentro del
  primero se demora a propósito (la ventana) y el segundo arranca en el medio:

  1. dos altas de 60 % en la misma cara y fechas → una entra, la otra
     ``capacidad_excedida``; un solo término en la base;
  2. ``PUT /layout`` que saca la división de la cara contra un alta (paso
     4c, hallazgo A1): gane quien gane, la base queda coherente — o la cara
     sigue por participación con su término (el guardado frena con
     ``participaciones_vivas``) o ya no se vende así y no le cuelga nada (el
     alta frena en la compuerta);
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

# Las carreras contra Postgres comparten la base descartable: todas al mismo
# proceso cuando la suite corre en paralelo (`pytest -n auto --dist loadgroup`).
pytestmark = pytest.mark.xdist_group("postgres")

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


@RELOJ
def test_si_el_mueble_cambia_mientras_se_espera_el_candado_no_se_escribe_nada(client, admin, monkeypatch):
    """Adentro del candado la cara se resuelve otra vez contra el plano: si es
    otra (el plano cambió en el medio) el alta no escribe con el candado de
    afuera; si cambió la firma del mueble, la confirmación de la distribución
    no guarda zonas medidas sobre la superficie vieja. Los dos dan 409
    ``plano_cambio`` y la base queda como estaba."""
    import dataclasses

    import app.services.participaciones as P
    from app.database import SessionLocal
    from app.models.participaciones import Distribucion, HistorialParticipacion, Participacion

    r = client.put("/api/layout/NAVE", headers=admin, json={"fixtures": [GON_01, MET_01], "base_updated_at": None})
    assert r.status_code == 200, r.text
    alta = {"sede": "NAVE", "espacio": "MET-01", "proveedor": "Postobón", "puntos_basicos": 2000, "tipo": "contrato",
            "desde": D(2026, 10, 1), "hasta": D(2026, 12, 31), "valor_mensual": 1}
    termino = client.post("/api/participaciones/", headers=admin, json=alta).json()["termino"]

    def contar():
        db = SessionLocal()
        try:
            return (db.query(Participacion).count(), db.query(Distribucion).count(),
                    db.query(HistorialParticipacion).count())
        finally:
            db.close()

    original = P.resolver_cara
    llamadas = []

    def otra_la_segunda(cambio):
        def resolver(*a, **kw):
            cara = original(*a, **kw)
            llamadas.append(cara.codigo)
            return dataclasses.replace(cara, **cambio) if len(llamadas) == 2 else cara
        return resolver

    antes = contar()
    monkeypatch.setattr(P, "resolver_cara", otra_la_segunda({"codigo": "NAVE-MET-09"}))
    r = client.post("/api/participaciones/", headers=admin, json={**alta, "proveedor": "Alpina"})
    assert r.status_code == 409 and r.json()["detail"]["code"] == "plano_cambio", r.text
    assert contar() == antes

    llamadas.clear()
    monkeypatch.setattr(P, "resolver_cara", otra_la_segunda({"firma": "v1|metro||otra"}))
    zonas = [{"participacion_space_id": termino["space_id"], "vertices": [[0, 0], [0.2, 0], [0.2, 1], [0, 1]]}]
    r = client.post("/api/participaciones/distribucion/confirmar", headers=admin,
                    json={"sede": "NAVE", "espacio": "MET-01", "version": 0, "zonas": zonas})
    assert r.status_code == 409 and r.json()["detail"]["code"] == "plano_cambio", r.text
    assert len(llamadas) == 2 and contar() == antes


@RELOJ
def test_un_cambio_de_termino_juzga_la_distribucion_que_encuentra_despues_del_candado(client, admin, monkeypatch):
    """La capa confirmada se mide ANTES del candado (§5.4); si mientras se
    esperaba otra sesión confirmó otra distribución, adentro se vuelve a medir.
    Acá la otra sesión pone las dos participaciones en la misma mitad (vale:
    noviembre y diciembre no se cruzan) justo antes de que el cambio tome el
    candado. El cambio adelanta la reserva de diciembre al 20 de noviembre:
    tiene que chocar con ESA distribución y no con la de antes, donde estaban
    separadas (con las medidas viejas pasaba y dejaba dos marcas en la misma
    región)."""
    import app.services.participaciones as P
    from app.database import SessionLocal
    from app.models.participaciones import Participacion

    r = client.put("/api/layout/NAVE", headers=admin, json={"fixtures": [GON_01, MET_01], "base_updated_at": None})
    assert r.status_code == 200, r.text
    base = {"sede": "NAVE", "espacio": "MET-01", "puntos_basicos": 5000}
    m1 = client.post("/api/participaciones/", headers=admin, json={
        **base, "proveedor": "Postobón", "tipo": "contrato", "desde": D(2026, 11, 1), "hasta": D(2026, 11, 30),
        "valor_mensual": 1}).json()["termino"]
    m2 = client.post("/api/participaciones/", headers=admin, json={
        **base, "proveedor": "Alpina", "tipo": "reserva", "desde": D(2026, 12, 1), "hasta": D(2026, 12, 31),
        "caduca": D(2026, 11, 15)}).json()["termino"]
    izq, der = [[0, 0], [0.5, 0], [0.5, 1], [0, 1]], [[0.5, 0], [1, 0], [1, 1], [0.5, 1]]

    def zonas(a, b):
        return [{"participacion_space_id": m1["space_id"], "vertices": a},
                {"participacion_space_id": m2["space_id"], "vertices": b}]

    r = client.post("/api/participaciones/distribucion/confirmar", headers=admin,
                    json={"sede": "NAVE", "espacio": "MET-01", "version": 0, "zonas": zonas(izq, der)})
    assert r.status_code == 200, r.text

    tomar = P.tomar_candados
    otra = []

    def la_otra_sesion_confirma_antes(db, codigos):
        if not otra:
            otra.append(True)
            s = SessionLocal()
            try:
                P.confirmar_distribucion(s, {"sede": "NAVE", "espacio": "MET-01", "version": 1,
                                             "zonas": zonas(izq, izq)}, "otra@x.co")
                s.commit()
            finally:
                s.close()
        return tomar(db, codigos)

    monkeypatch.setattr(P, "tomar_candados", la_otra_sesion_confirma_antes)
    r = client.patch(f"/api/participaciones/{m2['id']}", headers=admin, json={"version": 1, "desde": D(2026, 11, 20)})
    assert otra == [True]
    assert r.status_code == 409 and r.json()["detail"]["code"] == "rompe_distribucion", r.text
    db = SessionLocal()
    try:
        assert db.get(Participacion, m2["id"]).desde == date(2026, 12, 1), "el cambio no se escribió"
    finally:
        db.close()
    confirmada = client.get("/api/participaciones/cara", headers=admin,
                            params={"sede": "NAVE", "espacio": "MET-01"}).json()["distribucion"]["confirmada"]
    assert [z["vertices"] for z in confirmada] == [izq, izq]


# ─── El guardado del plano y la renumeración (paso 4c) ────────────────────────

@RELOJ
def test_el_guardado_que_saca_la_division_toma_el_candado_de_la_cara_antes_de_leer_sus_participaciones(
        client, admin, monkeypatch):
    """A1 de la crítica: pasar ``partes.division`` de ``"participacion"`` a
    entera no cambia lo ofrecido ni la firma de partes. Sin el disparador
    propio, el guardado no tomaba candado y un alta simultánea pasaba con el
    plano viejo. El orden tiene que ser candado (con la clave del mueble) →
    ``expire_all`` → leer los términos de la cara."""
    import app.routers.layout as L
    import app.services.participaciones as P
    from app.services.candado import claves_de_candado
    from sqlalchemy.orm import Session

    r = client.put("/api/layout/NAVE", headers=admin, json={"fixtures": [GON_01, MET_01], "base_updated_at": None})
    assert r.status_code == 200, r.text
    traza = []
    tomar, leer, expirar = L.tomar_candados, P.leer, Session.expire_all
    monkeypatch.setattr(L, "tomar_candados", lambda db, c: (traza.append(("candado", tuple(sorted(c)))),
                                                            tomar(db, c))[1])
    monkeypatch.setattr(P, "leer", lambda db, codigo: (traza.append(("leer", codigo)), leer(db, codigo))[1])
    monkeypatch.setattr(Session, "expire_all", lambda self: (traza.append("expire_all"), expirar(self))[1])

    def guardar(fixtures, codigo=200):
        traza.clear()
        r = client.put("/api/layout/NAVE", headers=admin, json={"fixtures": fixtures, "base_updated_at": None})
        assert r.status_code == codigo, r.text

    # Lo de siempre (mover un mueble) no toma candado ni relee nada.
    guardar([{**GON_01, "cx": 3}, MET_01])
    assert traza == [], traza
    entera = {**GON_01, "cx": 3, "partes": None}
    guardar([entera, MET_01])
    assert traza[:2] == [("candado", ("NAVE-GON-01", "NAVE-GON-01-B")), "expire_all"], traza
    assert ("leer", "NAVE-GON-01") in traza and ("leer", "NAVE-GON-01-B") in traza
    misma = claves_de_candado(["NAVE-GON-01"])
    assert claves_de_candado(["NAVE-GON-01-B"]) == claves_de_candado(["NAVE-GON-01-PC1"]) == misma
    # Volver a participación también la toma (la cara entra), sin nada que leer.
    guardar([{**GON_01, "cx": 3}, MET_01])
    assert traza == [("candado", ("NAVE-GON-01", "NAVE-GON-01-B")), "expire_all"], traza
    # Con una reserva viva, la lectura (fresca, con el candado tomado) la ve y frena.
    alta = {"sede": "NAVE", "espacio": "GON-01", "proveedor": "Postobón", "puntos_basicos": 2000, "tipo": "reserva",
            "desde": D(2026, 11, 1), "hasta": D(2026, 11, 30), "caduca": D(2026, 10, 25)}
    assert client.post("/api/participaciones/", headers=admin, json=alta).status_code == 201
    guardar([entera, MET_01], 409)
    assert traza.index(("leer", "NAVE-GON-01")) > traza.index("expire_all") > 0


@RELOJ
def test_la_renumeracion_toma_los_candados_de_los_codigos_viejos_y_nuevos_antes_de_mudar(client, admin, monkeypatch):
    """B1: un alta concurrente no puede buscar la cara por el código viejo
    mientras se muda. El orden: planificar → candados de los códigos viejos y
    nuevos de cada mueble que muda → ``expire_all`` → planificar otra vez →
    mudar."""
    import app.services.renumeracion as R
    from sqlalchemy.orm import Session

    # La única góndola se llama GON-05: renumerar la pasa a GON-01 (un nombre que nadie tenía).
    gon_05 = {**GON_01, "id": "f-GON-05", "code": "GON-05"}
    r = client.put("/api/layout/NAVE", headers=admin, json={"fixtures": [gon_05, MET_01], "base_updated_at": None})
    assert r.status_code == 200, r.text
    alta = {"sede": "NAVE", "espacio": "GON-05", "proveedor": "Postobón", "puntos_basicos": 2000, "tipo": "contrato",
            "desde": D(2026, 11, 1), "hasta": D(2026, 11, 30), "valor_mensual": 1}
    pc = client.post("/api/participaciones/", headers=admin, json=alta).json()["termino"]
    traza = []

    def espiar(nombre, marca):
        original = getattr(R, nombre)
        monkeypatch.setattr(R, nombre, lambda *a, **kw: (traza.append(marca), original(*a, **kw))[1])

    espiar("planificar_sede", "planificar")
    espiar("_mudar_espacios", "mudar")
    tomar, expirar = R.tomar_candados, Session.expire_all
    monkeypatch.setattr(R, "tomar_candados", lambda db, c: (traza.append(("candado", tuple(sorted(c)))),
                                                            tomar(db, c))[1])
    monkeypatch.setattr(Session, "expire_all", lambda self: (traza.append("expire_all"), expirar(self))[1])

    r = client.post("/api/layout/renumeracion/aplicar", headers=admin, json={"sedes": ["NAVE"]})
    assert r.status_code == 200, r.text
    assert traza == ["planificar", ("candado", ("NAVE-GON-01", "NAVE-GON-05")), "expire_all", "planificar",
                     "mudar"], traza
    cara = client.get("/api/participaciones/cara", headers=admin, params={"sede": "NAVE", "espacio": "GON-01"}).json()
    assert [p["codigo"] for p in cara["participaciones"]] == ["NAVE-GON-01-PC1"]
    assert cara["participaciones"][0]["space_id"] == pc["space_id"]
    # Otra vez: nada que mudar, ningún candado.
    traza.clear()
    assert client.post("/api/layout/renumeracion/aplicar", headers=admin, json={"sedes": ["NAVE"]}).status_code == 200
    assert traza == ["planificar"], traza

    # Si mientras se esperaba el candado el plano cambió y la segunda mirada renombra muebles que no tienen
    # su candado (acá, otra góndola que entró), no se escribe nada: 409 y a mirar el previo otra vez.
    from app.database import SessionLocal
    from app.models.models import LayoutSnapshot, Space

    def poner_plano(fixtures):
        s = SessionLocal()
        try:
            s.query(LayoutSnapshot).filter_by(sede="NAVE").one().fixtures_json = json.dumps(fixtures)
            s.commit()
        finally:
            s.close()

    gon_01 = {**gon_05, "code": "GON-01"}
    otra = {**GON_01, "id": "f-GON-08", "code": "GON-08", "cx": 30, "partes": None}
    tercera = {**GON_01, "id": "f-GON-09", "code": "GON-09", "cx": 40, "partes": None}
    poner_plano([gon_01, MET_01, otra])
    original = R.tomar_candados

    def en_el_medio(db, codigos):
        monkeypatch.setattr(R, "tomar_candados", original)
        poner_plano([gon_01, MET_01, otra, tercera])  # otra sesión guarda el plano antes de soltar el candado
        return original(db, codigos)

    monkeypatch.setattr(R, "tomar_candados", en_el_medio)
    r = client.post("/api/layout/renumeracion/aplicar", headers=admin, json={"sedes": ["NAVE"]})
    assert r.status_code == 409 and r.json()["detail"]["code"] == "renumeracion_bloqueada", r.text
    assert "el plano cambió mientras se renumeraba" in r.json()["detail"]["motivos"][0]
    s = SessionLocal()
    try:
        codigos = [f["code"] for f in json.loads(s.query(LayoutSnapshot).filter_by(sede="NAVE").one().fixtures_json)]
        assert codigos == ["GON-01", "MET-01", "GON-08", "GON-09"], codigos
        assert s.get(Space, pc["space_id"]).code == "NAVE-GON-01-PC1"
    finally:
        s.close()


@RELOJ
def test_los_caminos_de_siempre_releen_despues_del_candado(client, admin, monkeypatch):
    """El contrato suelto, la planilla (y Vender) y la importación del plano
    toman el candado del mueble y enseguida ``expire_all``: lo que revisan
    después (los contratos de la cara y los términos de participación de
    ``bloqueo_por_participaciones``) es lo que hay en la base, no lo que la
    sesión ya tenía en memoria (§5.4)."""
    import app.routers.bulk_leases as BL
    import app.routers.spaces as SP
    import app.services.importar_del_plano as IMP
    import app.services.participaciones as P
    from app.database import SessionLocal
    from app.models.models import LayoutSnapshot
    from sqlalchemy.orm import Session

    gon_02 = {**GON_01, "id": "f-GON-02", "code": "GON-02", "label": "Góndola 2", "cx": 4, "partes": None}
    r = client.put("/api/layout/NAVE", headers=admin, json={"fixtures": [GON_01, gon_02, MET_01],
                                                            "base_updated_at": None})
    assert r.status_code == 200, r.text
    traza = []
    expirar, bloqueo = Session.expire_all, P.bloqueo_por_participaciones
    monkeypatch.setattr(Session, "expire_all", lambda self: (traza.append("expire_all"), expirar(self))[1])
    for modulo in (SP, BL, IMP):
        tomar = modulo.tomar_candados
        monkeypatch.setattr(modulo, "tomar_candados",
                            lambda db, c, tomar=tomar: (traza.append("candado"), tomar(db, c))[1])
    # La defensa se pregunta siempre adentro, con la sesión ya fresca.
    monkeypatch.setattr(SP, "bloqueo_por_participaciones",
                        lambda *a: (traza.append("bloqueo"), bloqueo(*a))[1])

    s = client.post("/api/spaces/find-or-create", headers=admin,
                    json={"code": "NAVE-GON-02", "name": "x", "zone": "Z", "sede": "NAVE", "area_m2": 1}).json()
    sup = client.post("/api/suppliers/find-or-create", headers=admin, json={"name": "Colombina"}).json()
    traza.clear()
    r = client.post(f"/api/spaces/{s['id']}/leases", headers=admin, json={
        "supplier_id": sup["id"], "start_date": D(2026, 11, 1), "end_date": D(2026, 11, 30), "monthly_rent": 1})
    assert r.status_code == 201, r.text
    assert traza[:3] == ["candado", "expire_all", "bloqueo"], traza

    traza.clear()
    r = client.post("/api/leases/bulk/confirmar", headers=admin, json={"sede": "NAVE", "filas": [{
        "fila": 2, "espacio": "GON-02-B", "sede": "NAVE", "proveedor": "Colombina", "valor": 1,
        "desde": D(2026, 11, 1), "hasta": D(2026, 11, 30)}]})
    assert r.json()["creados"] == 1, r.text
    assert traza[:2] == ["candado", "expire_all"], traza

    db = SessionLocal()
    try:
        fixtures = [GON_01, {**gon_02, "code": "GON-03", "id": "f-GON-03", "status": "occupied",
                             "supplierName": "Colanta", "startDate": D(2026, 11, 1), "endDate": D(2026, 11, 30)},
                    MET_01]
        db.query(LayoutSnapshot).filter_by(sede="NAVE").one().fixtures_json = json.dumps(fixtures)
        db.commit()
    finally:
        db.close()
    traza.clear()
    r = client.post("/api/layout/importacion/aplicar", headers=admin)
    assert [x["espacio"] for x in r.json()["importables"]] == ["NAVE-GON-03"], r.text
    assert traza[:2] == ["candado", "expire_all"], traza


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


def _guardar_plano(fixtures):
    """El guardado del plano llamado como lo llama la ruta (sin request: el
    actor queda «admin»). Hace su propio commit."""
    def paso(s):
        from app.routers.layout import save_layout
        from app.schemas.layout import LayoutIn

        save_layout("NAVE", LayoutIn(fixtures=fixtures, base_updated_at=None), None, s)
    return paso


def _estado_de_la_cara(SessionLocal):
    """(¿GON-01 sigue por participación?, términos vivos de su cara A)."""
    from app.fechas import hoy
    from app.models.models import LayoutSnapshot
    from app.services import participaciones as P
    from app.services import reglas_participacion as reglas
    from app.services.layout_lookup import por_participacion

    s = SessionLocal()
    try:
        fixtures = json.loads(s.query(LayoutSnapshot).filter_by(sede="NAVE").one().fixtures_json)
        gon = next(f for f in fixtures if f["code"] == "GON-01")
        vivos = [t for t in P.leer(s, "NAVE-GON-01").todos if reglas.vivo(t, hoy())]
        return por_participacion(gon), len(vivos)
    finally:
        s.close()


@SIN_PG
@RELOJ
def test_sacar_la_division_contra_un_alta_deja_la_base_coherente_cuando_gana_el_alta(pg, monkeypatch):
    """Carrera 2, el alta primero: el guardado que saca la división espera el
    candado de la cara (A1), lee los términos ya con el alta escrita y frena con
    ``participaciones_vivas``. La cara sigue por participación con su término."""
    P, SessionLocal = pg
    sin_division = [{**GON_01, "partes": None}, MET_01]
    resultados = _correr(P, SessionLocal, monkeypatch,
                         lambda s: P.alta(s, _alta(P, SessionLocal, 3000, tipo="reserva"), "a@x.co"),
                         _guardar_plano(sin_division))
    assert resultados == {"primera": "ok", "segunda": "participaciones_vivas"}, resultados
    assert _estado_de_la_cara(SessionLocal) == (True, 1)


@SIN_PG
@RELOJ
def test_sacar_la_division_contra_un_alta_deja_la_base_coherente_cuando_gana_el_plano(pg, monkeypatch):
    """Carrera 2, el plano primero: el guardado toma el candado y se queda
    mirando (la ventana) antes de leer los términos; el alta pasa su revisión
    de afuera con el plano viejo y espera el candado; adentro relee el plano
    ya sin la división y la compuerta la frena. Sin términos colgando de una
    cara que ya no se vende así."""
    import app.routers.layout as L
    from fastapi import HTTPException

    P, SessionLocal = pg
    original = L.participaciones_vivas
    en_la_ventana = threading.Event()

    def demorado(*a, **kw):
        en_la_ventana.set()
        time.sleep(0.6)
        return original(*a, **kw)

    monkeypatch.setattr(L, "participaciones_vivas", demorado)
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

    plano = threading.Thread(target=correr, args=("plano", _guardar_plano([{**GON_01, "partes": None}, MET_01])))
    alta = threading.Thread(target=correr, args=("alta", lambda s: P.alta(s, _alta(P, SessionLocal, 3000), "b@x.co")))
    plano.start()
    assert en_la_ventana.wait(10), f"el guardado no llegó a la ventana: {resultados}"
    alta.start()
    for h in (plano, alta):
        h.join(20)
    assert resultados == {"plano": "ok", "alta": "parte_inexistente"}, resultados
    assert _estado_de_la_cara(SessionLocal) == (False, 0)
