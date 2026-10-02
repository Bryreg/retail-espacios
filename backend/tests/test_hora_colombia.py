"""La fecha del negocio es la de Colombia (`app/fechas.py`), no la del servidor.

Render corre en UTC, cinco horas adelante: desde las 7 p. m. de Colombia el
servidor ya vive en «mañana». Hasta el 2026-10-02 eso liberaba a las 7 p. m. un
contrato que vencía ese día —y el espacio se podía volver a vender esa noche—,
y mostraba vigente uno que arrancaba al día siguiente.

Estas pruebas corren con el reloj del proceso a las 9 p. m. del 2 de octubre en
Colombia, que en UTC ya es el 3.
"""
from datetime import date

import pytest

NOCHE_EN_COLOMBIA = pytest.mark.reloj("2026-10-03T02:00:00+00:00")


def _contrato(client, admin, code, desde, hasta):
    esp = client.post(
        "/api/spaces/find-or-create",
        json={"code": code, "name": code, "zone": "punta", "sede": "NAVE", "area_m2": 1.0},
        headers=admin,
    )
    assert esp.status_code == 200, esp.text
    prov = client.post("/api/suppliers/find-or-create", json={"name": "Alpina"}, headers=admin)
    assert prov.status_code in (200, 201), prov.text
    r = client.post(
        f"/api/spaces/{esp.json()['id']}/leases",
        json={"supplier_id": prov.json()["id"], "start_date": desde, "end_date": hasta, "monthly_rent": 100_000},
        headers=admin,
    )
    assert r.status_code == 201, r.text
    return esp.json()["id"]


@NOCHE_EN_COLOMBIA
def test_hoy_es_el_dia_de_colombia_aunque_en_utc_ya_sea_manana(client):
    from datetime import datetime, timezone

    from app.fechas import hoy

    assert datetime.now(timezone.utc).date() == date(2026, 10, 3)
    assert hoy() == date(2026, 10, 2)


@NOCHE_EN_COLOMBIA
def test_un_contrato_que_vence_hoy_sigue_vigente_a_las_9_de_la_noche(client, admin):
    espacio = _contrato(client, admin, "NAVE-PUN-01", "2026-09-01", "2026-10-02")

    # El mantenimiento y las pantallas pasan por `expire_leases`.
    from app.database import SessionLocal
    from app.routers.spaces import expire_leases

    db = SessionLocal()
    try:
        assert expire_leases(db) == 0, "se venció a las 9 p. m. del último día"
        db.commit()
    finally:
        db.close()

    r = client.get(f"/api/spaces/{espacio}", headers=admin).json()
    assert r["status"] == "occupied"
    assert r["active_lease"] and r["active_lease"]["end_date"] == "2026-10-02"


@NOCHE_EN_COLOMBIA
def test_un_contrato_que_arranca_manana_todavia_no_ocupa_el_espacio(client, admin):
    espacio = _contrato(client, admin, "NAVE-PUN-02", "2026-10-03", "2026-12-31")

    r = client.get(f"/api/spaces/{espacio}", headers=admin).json()
    assert r["status"] != "occupied", "a las 9 p. m. ya lo daba por arrancado"
    assert r["active_lease"] is None
    assert r["upcoming_lease"] and r["upcoming_lease"]["start_date"] == "2026-10-03"
