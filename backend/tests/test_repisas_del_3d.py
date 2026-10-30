"""Las repisas del 3D: sólo lectura + «Pasar a contrato» (auditoría P1-15).

Las repisas (`slots` del mueble) guardaban proveedor, «Valor (COP/mes)» y
fechas sólo en el JSON del plano: una venta paralela sin contrato, sin candado,
sin choque de fechas, sin bitácora y fuera del canon. Decisión del dueño
(2026-10-30): lo comercial de una repisa queda de sólo lectura; la que ya tiene
proveedor se pasa a un contrato de verdad desde su panel.
"""
import json
from datetime import timedelta

from app.fechas import hoy as hoy_en_colombia
from test_bulk_leases import FIXTURES

HOY = hoy_en_colombia()
DESDE = (HOY + timedelta(days=10)).isoformat()
HASTA = (HOY + timedelta(days=10 + 90)).isoformat()


def _slot(sid="s1", **extra):
    return {"id": sid, "x": 0, "w": 0.5, "y": 0, "h": 0.5, "status": "occupied", "supplierName": "Repisas SA",
            "brandCategory": "Galletas", "negotiatedValue": 300_000, "startDate": DESDE, "endDate": HASTA, **extra}


def _guardar(client, admin, fixtures, codigo=200):
    r = client.put("/api/layout/NAVE", headers=admin, json={"fixtures": fixtures, "base_updated_at": None})
    assert r.status_code == codigo, r.text
    return r.json()


def _en_la_base(fixtures):
    """Lo vendido de antes: escrito directo, como quedó en los planos viejos."""
    from app.database import SessionLocal
    from app.models.models import LayoutSnapshot

    db = SessionLocal()
    try:
        db.query(LayoutSnapshot).filter_by(sede="NAVE").one().fixtures_json = json.dumps(fixtures)
        db.commit()
    finally:
        db.close()


def _con_repisa(**extra):
    return [{**FIXTURES[0], "slots": [_slot(**extra)]}, *FIXTURES[1:]]


def test_el_guardado_no_vende_repisas_pero_conserva_las_de_antes(client, admin):
    _guardar(client, admin, FIXTURES)
    # Una repisa NUEVA con proveedor y valor: 409.
    d = _guardar(client, admin, _con_repisa(), codigo=409)["detail"]
    assert d["code"] == "repisas_vendidas"
    assert "sólo lectura" in d["choques"][0]
    # Ni con proveedor y sin estado.
    assert _guardar(client, admin, _con_repisa(status="free"), codigo=409)["detail"]["code"] == "repisas_vendidas"
    # Lo vendido de antes se guarda igual mientras no se toque (no se pierde).
    _en_la_base(_con_repisa())
    movido = _con_repisa()
    movido[0] = {**movido[0], "cx": 4}
    _guardar(client, admin, movido)
    guardado = client.get("/api/layout/NAVE", headers=admin).json()["fixtures"][0]["slots"][0]
    assert (guardado["supplierName"], guardado["negotiatedValue"]) == ("Repisas SA", 300_000)
    # Cambiarle el valor, el proveedor o las fechas: 409.
    for cambio in ({"negotiatedValue": 1}, {"supplierName": "Otro"}, {"endDate": DESDE}):
        assert _guardar(client, admin, _con_repisa(**cambio), codigo=409)["detail"]["code"] == "repisas_vendidas"
    # Liberarla, sí.
    _guardar(client, admin, _con_repisa(status="free", supplierName="", brandCategory="", negotiatedValue=0,
                                        startDate="", endDate=""))


def test_pasar_a_contrato_crea_el_contrato_y_libera_la_repisa(client, admin, worker):
    from app.database import SessionLocal
    from app.models.models import SpaceLease
    from app.models.vender import CondicionesDeContrato
    from app.services.meses import al_peso, meses_entre
    from datetime import date

    _guardar(client, admin, FIXTURES)
    _en_la_base(_con_repisa())
    ruta = "/api/layout/NAVE/repisas/f1/s1/contrato"
    assert client.post(ruta, headers=worker, json={"espacio": "PUN-04"}).status_code == 403
    # Otro mueble: no.
    r = client.post(ruta, headers=admin, json={"espacio": "PUN-05"})
    assert r.status_code == 409 and "no es una cara ni una parte de este mueble" in r.text
    r = client.post(ruta, headers=admin, json={"espacio": "PUN-04"})
    assert r.status_code == 200, r.text
    hecho = r.json()
    total = al_peso(300_000 * meses_entre(date.fromisoformat(DESDE), date.fromisoformat(HASTA)))
    assert (hecho["espacio"], hecho["valor_total"], hecho["valor_al_mes"]) == ("NAVE-PUN-04", total, 300_000)
    db = SessionLocal()
    try:
        lease = db.get(SpaceLease, hecho["lease_id"])
        assert (lease.monthly_rent, lease.marca, lease.start_date.isoformat(), lease.end_date.isoformat()) == \
            (total, "Galletas", DESDE, HASTA)
        c = db.get(CondicionesDeContrato, lease.id)
        assert (c.modo_precio, c.valor_tecleado) == ("mensual", 300_000)
    finally:
        db.close()
    # La repisa quedó libre, en el plano guardado y en la respuesta.
    repisa = client.get("/api/layout/NAVE", headers=admin).json()["fixtures"][0]["slots"][0]
    assert (repisa["status"], repisa["supplierName"], repisa["negotiatedValue"]) == ("free", "", 0)
    assert hecho["layout"]["fixtures"][0]["slots"][0]["status"] == "free"
    # La base lo sabe: el mapa comercial lo tiene, y la bitácora dice de dónde vino.
    assert client.get("/api/spaces/comercial", headers=admin).json()["NAVE-PUN-04"]["supplierName"] == "Repisas SA"
    altas = client.get("/api/bitacora/", headers=admin, params={"accion": "contrato.alta"}).json()
    assert any("repisa del 3D" in (l["detalle"] or "") for l in altas)
    # Y otra vez: ya no tiene proveedor.
    assert client.post(ruta, headers=admin, json={"espacio": "PUN-04"}).status_code == 409


def test_pasar_a_contrato_frena_si_choca_con_un_contrato_vivo(client, admin):
    from test_bulk_leases import _confirmar, _fila

    _guardar(client, admin, FIXTURES)
    assert _confirmar(client, admin, [_fila(2, desde=DESDE, hasta=HASTA)]).json()["creados"] == 1
    _en_la_base(_con_repisa())
    r = client.post("/api/layout/NAVE/repisas/f1/s1/contrato", headers=admin, json={"espacio": "PUN-04"})
    assert r.status_code == 409, r.text
    assert r.json()["detail"]["code"] == "repisa_no_pasa" and r.json()["detail"]["choques"]
    # No tocó la repisa.
    repisa = client.get("/api/layout/NAVE", headers=admin).json()["fixtures"][0]["slots"][0]
    assert repisa["supplierName"] == "Repisas SA"


def test_una_repisa_sin_fechas_no_pasa(client, admin):
    _guardar(client, admin, FIXTURES)
    _en_la_base(_con_repisa(startDate="", endDate=""))
    r = client.post("/api/layout/NAVE/repisas/f1/s1/contrato", headers=admin, json={"espacio": "PUN-04"})
    assert r.status_code == 409 and "le faltan las fechas" in r.json()["detail"]
