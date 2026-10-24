"""Planogramas con destinos (fase 2 de la distribución, 2026-10-24): la API.

Un escenario por prueba (cada prueba con ``client`` levanta una app y una
SQLite). «Hoy» es el 24 de octubre de 2026 en Colombia (marca ``reloj``).

Lo que se prueba:

· un mueble interno: destinos, borrador, publicar versiones, la vigente, la
  programada y la vencida (que sigue vigente con su recordatorio);
· lo que no se publica: piezas que se pisan, un % que no da, sin ubicar,
  fechas al revés, la versión vieja y un destino de otra sede;
· un mueble que se vende: lo vendido manda (no se pisa una marca ubicada, no
  se pasa de la cara entera, una venta entera no deja lugar) y, después de
  publicar, si se vende algo encima, la versión vigente lo dice;
· quién puede: el equipo no escribe salvo que la dueña lo habilite, y aun así
  sólo en muebles internos; un mueble que se vende no le llega.

Todo ``import app.*`` va ADENTRO de las funciones (el fixture ``client`` purga
``sys.modules``).
"""
from datetime import date

import pytest

RELOJ = pytest.mark.reloj("2026-10-24T15:00:00+00:00")


def D(y, m, d) -> str:
    return date(y, m, d).isoformat()


def _mueble(code, tipo, w, d, h, cx, sede="NAVE", division=None, **extra):
    f = {"id": f"f-{code}", "code": code, "sede": sede, "type": tipo, "label": code,
         "cx": cx, "cz": 2, "rotY": 0, "w": w, "d": d, "h": h, "color": "#818cf8", **extra}
    if division:
        f["partes"] = {"division": division}
    return f


# Un metro interno (no se vende), una góndola doble interna, un metro por
# participación y uno que se vende entero.
INT_01 = _mueble("INT-01", "metro", 1, 1, 0.05, 2, rentable=False)
GON_09 = _mueble("GON-09", "gondola", 0.9, 0.9, 1.8, 4, rentable=False, gondolaType="double")
MET_01 = _mueble("MET-01", "metro", 1, 1, 0.05, 6, division="participacion")
MET_02 = _mueble("MET-02", "metro", 1, 1, 0.05, 8)
PLANO = [INT_01, GON_09, MET_01, MET_02]


def _plano(client, admin, fixtures=PLANO, sede="NAVE"):
    r = client.put(f"/api/layout/{sede}", headers=admin, json={"fixtures": fixtures, "base_updated_at": None})
    assert r.status_code == 200, r.text


def _rect(u0, u1, v0=0.0, v1=1.0):
    return [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]


def _destino(client, h, nombre="Lácteos", tipo="categoria", color="d1", codigo=201, sede="NAVE", **extra):
    r = client.post("/api/planogramas/destinos", headers=h, json={
        "sede": sede, "nombre": nombre, "tipo": tipo, "color": color, **extra})
    assert r.status_code == codigo, r.text
    return r.json()


def _cara(client, h, fixture="f-INT-01", cara="A", codigo=200):
    r = client.get("/api/planogramas/cara", headers=h, params={"sede": "NAVE", "fixture_id": fixture, "cara": cara})
    assert r.status_code == codigo, r.text
    return r.json()


def _borrador(client, h, piezas, version, fixture="f-INT-01", cara="A", codigo=200):
    r = client.put("/api/planogramas/borrador", headers=h, json={
        "sede": "NAVE", "fixture_id": fixture, "cara": cara, "version": version, "piezas": piezas})
    assert r.status_code == codigo, r.text
    return r.json()


def _publicar(client, h, version, desde=D(2026, 10, 24), hasta=None, fixture="f-INT-01", cara="A", codigo=200):
    cuerpo = {"sede": "NAVE", "fixture_id": fixture, "cara": cara, "version": version, "rige_desde": desde}
    if hasta:
        cuerpo["hasta"] = hasta
    r = client.post("/api/planogramas/publicar", headers=h, json=cuerpo)
    assert r.status_code == codigo, r.text
    return r.json()


def _codigos(problemas):
    return [p["codigo"] for p in problemas]


# ─── 1 · Un mueble interno ────────────────────────────────────────────────────

@RELOJ
def test_un_mueble_interno_se_planifica_y_se_publica_por_versiones(client, admin):
    import time_machine

    _plano(client, admin)
    vacia = _cara(client, admin)
    assert vacia["comercializable"] is False and vacia["planograma"]["version"] == 0
    assert vacia["planograma"]["vigente"] is None and vacia["permisos"]["planificar"] is True
    assert vacia["vendido"] == {"entera": [], "participaciones": []}

    lacteos = _destino(client, admin, "Lácteos", codigo_externo="CAT-102", en_la_sede=True)
    propia = _destino(client, admin, "Éxito", tipo="marca_propia", color="d2", en_la_sede=True)
    halloween = _destino(client, admin, "Halloween", tipo="promocion", color="d3",
                         como_se_monta="Material de Halloween al frente.")
    # Sólo los guardados en la sede se ofrecen para reusar.
    biblioteca = client.get("/api/planogramas/destinos", headers=admin, params={"sede": "NAVE"}).json()
    assert [d["nombre"] for d in biblioteca] == ["Éxito", "Lácteos"]

    piezas = [{"destino_id": lacteos["id"], "pb": 4000, "vertices": _rect(0, 0.4)},
              {"destino_id": propia["id"], "pb": 2500, "vertices": _rect(0.4, 0.65)},
              {"destino_id": halloween["id"], "pb": 1500, "vertices": None}]
    b = _borrador(client, admin, piezas, 0)
    assert b["planograma"]["version"] == 1 and len(b["planograma"]["borrador"]["piezas"]) == 3
    # En el borrador, lo que falta ubicar no es un error.
    assert b["revision"]["errores"] == []
    # Para publicar, sí.
    r = _publicar(client, admin, 1, codigo=409)
    assert r["detail"]["code"] == "planograma_invalido"
    assert _codigos(r["detail"]["errores"]) == ["SIN_UBICAR"]
    assert r["detail"]["errores"][0]["frase"] == "Falta ubicar Halloween en la cara."

    piezas[2]["vertices"] = _rect(0.65, 0.8)
    b = _borrador(client, admin, piezas, 1)
    p = _publicar(client, admin, 2)
    assert p["publicada"] == 1
    vig = p["planograma"]["vigente"]
    assert (vig["numero"], vig["rige_desde"], vig["hasta"], vig["estado"]) == (1, "2026-10-24", None, "vigente")
    assert vig["vencida_hace_dias"] is None and vig["choca_con_lo_vendido"] == []
    assert [x["destino"]["nombre"] for x in vig["piezas"]] == ["Lácteos", "Éxito", "Halloween"]
    assert vig["piezas"][2]["destino"]["como_se_monta"] == "Material de Halloween al frente."
    assert p["planograma"]["borrador"] is None
    # Cambiar el destino después no cambia lo que se publicó.
    r = client.patch(f"/api/planogramas/destinos/{lacteos['id']}", headers=admin, json={"nombre": "Lácteos y huevos"})
    assert r.status_code == 200 and r.json()["nombre"] == "Lácteos y huevos"
    vig = _cara(client, admin)["planograma"]["vigente"]
    assert vig["piezas"][0]["destino"]["nombre"] == "Lácteos"

    # La versión 2, con fin (una promoción), programada para más adelante.
    piezas = [{"destino_id": lacteos["id"], "pb": 4000, "vertices": _rect(0, 0.4)},
              {"destino_id": halloween["id"], "pb": 2000, "vertices": _rect(0.4, 0.6)}]
    b = _borrador(client, admin, piezas, 3)
    p = _publicar(client, admin, 4, desde=D(2026, 10, 28), hasta=D(2026, 11, 2))
    plan = p["planograma"]
    assert plan["vigente"]["numero"] == 1
    assert [v["numero"] for v in plan["programadas"]] == [2]
    assert [(v["numero"], v["estado"]) for v in plan["versiones"]] == [(2, "programada"), (1, "vigente")]
    resumen = client.get("/api/planogramas/resumen", headers=admin, params={"sede": "NAVE"}).json()
    assert [(c["fixture_id"], c["cara"], c["vigente"]["numero"], c["programada"]["numero"])
            for c in resumen["caras"]] == [("f-INT-01", "A", 1, 2)]

    # Una versión vieja se puede ver.
    v1 = next(v for v in plan["versiones"] if v["numero"] == 1)
    r = client.get("/api/planogramas/version", headers=admin, params={"id": v1["id"]})
    assert r.status_code == 200 and len(r.json()["piezas"]) == 3

    # Pasa el tiempo: la 2 rige; al vencer su «hasta», SIGUE vigente con su recordatorio.
    from conftest import CLAVE_ADMIN, _token

    with time_machine.travel("2026-10-29T15:00:00+00:00", tick=True):
        h = {"Authorization": f"Bearer {_token(client, CLAVE_ADMIN)}"}
        plan = _cara(client, h)["planograma"]
        assert plan["vigente"]["numero"] == 2 and plan["vigente"]["vencida_hace_dias"] is None
        assert [(v["numero"], v["estado"]) for v in plan["versiones"]] == [(2, "vigente"), (1, "reemplazada")]
    with time_machine.travel("2026-11-12T15:00:00+00:00", tick=True):
        h = {"Authorization": f"Bearer {_token(client, CLAVE_ADMIN)}"}
        plan = _cara(client, h)["planograma"]
        assert plan["vigente"]["numero"] == 2 and plan["vigente"]["vencida_hace_dias"] == 10
        resumen = client.get("/api/planogramas/resumen", headers=h, params={"sede": "NAVE"}).json()
        assert resumen["caras"][0]["vigente"]["vencida_hace_dias"] == 10


@RELOJ
def test_lo_que_no_se_publica(client, admin):
    _plano(client, admin)
    a = _destino(client, admin, "Aseo")
    b = _destino(client, admin, "Bebidas", color="d2")
    pisadas = [{"destino_id": a["id"], "pb": 5000, "vertices": _rect(0, 0.5)},
               {"destino_id": b["id"], "pb": 3000, "vertices": _rect(0.45, 0.75)}]
    r = _borrador(client, admin, pisadas, 0)
    assert _codigos(r["revision"]["errores"]) == ["SOLAPE"]
    assert r["revision"]["errores"][0]["frase"] == "Aseo y Bebidas se pisan."
    r = _publicar(client, admin, 1, codigo=409)
    assert _codigos(r["detail"]["errores"]) == ["SOLAPE"]
    # El 409 no tocó el borrador.
    assert _cara(client, admin)["planograma"]["borrador"]["piezas"][1]["vertices"] == _rect(0.45, 0.75)

    # Un % que no da.
    mal = [{"destino_id": a["id"], "pb": 5000, "vertices": _rect(0, 0.4)}]
    r = _borrador(client, admin, mal, 1)
    assert r["revision"]["errores"][0]["frase"] == "Aseo es de 50 % y tiene 40 % dibujado (le falta 10 %)."
    assert r["revision"]["dibujado"] == {str(a["id"]): 4000}

    # Las fechas.
    bien = [{"destino_id": a["id"], "pb": 4000, "vertices": _rect(0, 0.4)}]
    _borrador(client, admin, bien, 2)
    assert _publicar(client, admin, 3, desde=D(2026, 10, 20), codigo=422)["detail"]["code"] == "rige_desde_pasado"
    assert _publicar(client, admin, 3, desde=D(2026, 11, 2), hasta=D(2026, 11, 1),
                     codigo=422)["detail"]["code"] == "hasta_antes"
    # La versión vieja.
    assert _publicar(client, admin, 2, codigo=409)["detail"]["code"] == "version_vieja"
    assert _borrador(client, admin, bien, 2, codigo=409)["detail"]["code"] == "version_vieja"
    # Sin cambios no hay nada que publicar.
    _publicar(client, admin, 3)
    assert _publicar(client, admin, 4, codigo=409)["detail"]["code"] == "sin_borrador"
    # Descartar el borrador deja la publicada.
    b2 = _borrador(client, admin, [], 4)
    assert b2["planograma"]["borrador"]["piezas"] == []
    assert _publicar(client, admin, 5, codigo=409)["detail"]["code"] == "sin_piezas"
    r = client.post("/api/planogramas/descartar", headers=admin,
                    json={"sede": "NAVE", "fixture_id": "f-INT-01", "cara": "A", "version": 5})
    assert r.status_code == 200 and r.json()["planograma"]["borrador"] is None
    assert r.json()["planograma"]["vigente"]["numero"] == 1

    # Un destino de otra sede no entra; una cara que no existe, tampoco.
    _plano(client, admin, [_mueble("INT-07", "metro", 1, 1, 0.05, 2, sede="SUR", rentable=False)], sede="SUR")
    ajeno = _destino(client, admin, "Ajeno", sede="SUR")
    r = _borrador(client, admin, [{"destino_id": ajeno["id"], "pb": 1000, "vertices": None}], 6, codigo=422)
    assert r["detail"]["code"] == "destino_ajeno"
    assert _cara(client, admin, fixture="f-NADA", codigo=404)["detail"]["code"] == "sin_mueble"
    assert _cara(client, admin, fixture="f-INT-01", cara="B", codigo=409)["detail"]["code"] == "sin_cara_b"
    # La B de una góndola doble es su propio planograma.
    assert _cara(client, admin, fixture="f-GON-09", cara="B")["planograma"]["version"] == 0
    # Lo que no es un destino válido.
    _destino(client, admin, "  ", codigo=422)
    assert _destino(client, admin, "X", tipo="contrato", codigo=422)["detail"]["code"] == "destino_tipo"
    assert _destino(client, admin, "X", color="rojo", codigo=422)["detail"]["code"] == "destino_color"


# ─── 2 · Un mueble que se vende: lo vendido manda ────────────────────────────

@RELOJ
def test_lo_libre_de_un_mueble_que_se_vende_se_planifica_y_lo_vendido_manda(client, admin, worker):
    _plano(client, admin)
    r = client.post("/api/participaciones/", headers=admin, json={
        "sede": "NAVE", "espacio": "MET-01", "tipo": "contrato", "proveedor": "Postobón", "marca": "Hit",
        "puntos_basicos": 3000, "desde": D(2026, 10, 1), "hasta": D(2027, 3, 31), "valor_mensual": 1_000_000})
    assert r.status_code == 201, r.text
    s1 = r.json()["termino"]["space_id"]
    r = client.post("/api/participaciones/distribucion/confirmar", headers=admin, json={
        "sede": "NAVE", "espacio": "MET-01", "version": 0,
        "zonas": [{"participacion_space_id": s1, "vertices": _rect(0, 0.3)}]})
    assert r.status_code == 200, r.text
    # Una reserva que todavía no se ubicó: su % queda guardado.
    r = client.post("/api/participaciones/", headers=admin, json={
        "sede": "NAVE", "espacio": "MET-01", "tipo": "reserva", "proveedor": "Alpina",
        "puntos_basicos": 2000, "desde": D(2026, 11, 1), "hasta": D(2026, 12, 31), "caduca": D(2026, 10, 30)})
    assert r.status_code == 201, r.text

    c = _cara(client, admin, fixture="f-MET-01")
    assert c["comercializable"] is True and c["por_participacion"] is True
    vend = {p["nombre"]: p for p in c["vendido"]["participaciones"]}
    assert set(vend) == {"Postobón · Hit", "Alpina"}
    assert vend["Postobón · Hit"]["poligonos"] == [_rect(0, 0.3)] and vend["Alpina"]["poligonos"] == []
    # El equipo no ve un mueble que se vende.
    assert _cara(client, worker, fixture="f-MET-01", codigo=403)["detail"]["code"] == "solo_administracion"

    propia = _destino(client, admin, "Marca propia", tipo="marca_propia")
    encima = [{"destino_id": propia["id"], "pb": 3000, "vertices": _rect(0.2, 0.5)}]
    r = _borrador(client, admin, encima, 0, fixture="f-MET-01")
    assert _codigos(r["revision"]["errores"]) == ["PISA_LO_VENDIDO"]
    assert r["revision"]["errores"][0]["frase"] == "Marca propia pisa el lugar de Postobón · Hit."
    # Lo vendido (30 % + 20 % guardado de la reserva) y 60 % de marca propia no entran.
    mucho = [{"destino_id": propia["id"], "pb": 6000, "vertices": _rect(0.3, 0.9)}]
    _borrador(client, admin, mucho, 1, fixture="f-MET-01")
    r = _publicar(client, admin, 2, fixture="f-MET-01", codigo=409)
    assert _codigos(r["detail"]["errores"]) == ["NO_ALCANZA"]
    assert r["detail"]["errores"][0]["frase"] == (
        "Lo vendido (50 %, el 1 nov 2026) y los destinos (60 %) pasan de la cara entera: queda 50 % para planificar.")
    # Si la promoción termina antes de que entre la reserva, sí entra.
    p = _publicar(client, admin, 2, fixture="f-MET-01", hasta=D(2026, 10, 31))
    assert p["publicada"] == 1
    # El 50 % entra sin fin.
    bien = [{"destino_id": propia["id"], "pb": 5000, "vertices": _rect(0.3, 0.8)}]
    _borrador(client, admin, bien, 3, fixture="f-MET-01")
    p = _publicar(client, admin, 4, fixture="f-MET-01", desde=D(2026, 11, 1))
    assert p["publicada"] == 2

    # Una venta entera no deja lugar en esas fechas.
    r = client.post("/api/leases/bulk/confirmar", headers=admin, json={"sede": "NAVE", "filas": [{
        "fila": 1, "espacio": "MET-02", "sede": "NAVE", "proveedor": "Colombina", "valor": 500_000,
        "desde": D(2026, 12, 1), "hasta": D(2027, 1, 31)}]})
    assert r.status_code == 200 and r.json()["creados"] == 1, r.text
    otro = _destino(client, admin, "Snacks", color="d4")
    _borrador(client, admin, [{"destino_id": otro["id"], "pb": 10000, "vertices": _rect(0, 1)}], 0,
              fixture="f-MET-02")
    r = _publicar(client, admin, 1, fixture="f-MET-02", codigo=409)
    assert _codigos(r["detail"]["errores"]) == ["VENDIDA_ENTERA"]
    assert "desde el 1 dic 2026" in r["detail"]["errores"][0]["frase"]
    p = _publicar(client, admin, 1, fixture="f-MET-02", hasta=D(2026, 11, 30))
    assert p["planograma"]["vigente"]["choca_con_lo_vendido"] == []


@RELOJ
def test_si_despues_se_vende_algo_encima_la_vigente_lo_dice(client, admin):
    _plano(client, admin)
    d = _destino(client, admin, "Snacks")
    _borrador(client, admin, [{"destino_id": d["id"], "pb": 10000, "vertices": _rect(0, 1)}], 0, fixture="f-MET-02")
    _publicar(client, admin, 1, fixture="f-MET-02")
    # Vender no mira el planograma: lo vendido manda.
    r = client.post("/api/leases/bulk/confirmar", headers=admin, json={"sede": "NAVE", "filas": [{
        "fila": 1, "espacio": "MET-02", "sede": "NAVE", "proveedor": "Colombina", "valor": 500_000,
        "desde": D(2026, 12, 1), "hasta": D(2027, 1, 31)}]})
    assert r.status_code == 200 and r.json()["creados"] == 1, r.text
    vig = _cara(client, admin, fixture="f-MET-02")["planograma"]["vigente"]
    assert len(vig["choca_con_lo_vendido"]) == 1 and "vendida entera" in vig["choca_con_lo_vendido"][0]


# ─── 3 · Quién puede ──────────────────────────────────────────────────────────

@RELOJ
def test_el_equipo_planifica_solo_si_la_duena_lo_habilita_y_solo_lo_interno(client, admin, worker):
    _plano(client, admin)
    d = _destino(client, admin, "Lácteos")
    # Por defecto, sólo administración: el equipo lee lo interno, no escribe.
    c = _cara(client, worker)
    assert c["permisos"] == {"planificar": False, "quien_publica": "admin"}
    assert _borrador(client, worker, [], 0, codigo=403)["detail"]["code"] == "solo_administracion"
    _destino(client, worker, "Otro", codigo=403)
    r = client.put("/api/planogramas/ajustes", headers=worker, json={"quien_publica": "equipo"})
    assert r.status_code == 403

    r = client.put("/api/planogramas/ajustes", headers=admin, json={"quien_publica": "equipo"})
    assert r.status_code == 200 and r.json() == {"quien_publica": "equipo"}
    assert _cara(client, worker)["permisos"] == {"planificar": True, "quien_publica": "equipo"}
    _borrador(client, worker, [{"destino_id": d["id"], "pb": 4000, "vertices": _rect(0, 0.4)}], 0)
    p = _publicar(client, worker, 1)
    assert p["planograma"]["vigente"]["publicada_por"]
    # Un mueble que se vende sigue siendo sólo de administración.
    assert _borrador(client, worker, [], 0, fixture="f-MET-01", codigo=403)["detail"]["code"] == "solo_administracion"
    resumen = client.get("/api/planogramas/resumen", headers=worker, params={"sede": "NAVE"}).json()
    assert resumen["puede_planificar"] is True
    # Sin sesión no se entra.
    assert client.get("/api/planogramas/cara", params={"sede": "NAVE", "fixture_id": "f-INT-01"}).status_code == 401

    from app.models.models import AuditEntry
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        acciones = [a.accion for a in db.query(AuditEntry).order_by(AuditEntry.id).all() if a.accion.startswith(("planograma", "destino"))]
    finally:
        db.close()
    assert acciones == ["destino.creado", "planograma.quien_publica", "planograma.borrador", "planograma.publicado"]


@RELOJ
def test_renombrar_la_sede_muda_los_planogramas(client, admin):
    _plano(client, admin)
    d = _destino(client, admin, "Lácteos", en_la_sede=True)
    _borrador(client, admin, [{"destino_id": d["id"], "pb": 4000, "vertices": _rect(0, 0.4)}], 0)
    _publicar(client, admin, 1)
    base = client.get("/api/layout/NAVE", headers=admin).json()["updated_at"]
    r = client.post("/api/layout/NAVE/renombrar", headers=admin, json={"nuevo": "NAVE NORTE", "base_updated_at": base})
    assert r.status_code == 200, r.text
    r = client.get("/api/planogramas/cara", headers=admin,
                   params={"sede": "NAVE NORTE", "fixture_id": "f-INT-01", "cara": "A"})
    assert r.status_code == 200, r.text
    assert r.json()["planograma"]["vigente"]["numero"] == 1
    assert [x["nombre"] for x in r.json()["biblioteca"]] == ["Lácteos"]
