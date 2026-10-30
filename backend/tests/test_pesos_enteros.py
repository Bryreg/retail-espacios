"""La plata entra en pesos enteros, por todos los caminos (auditoría P2-11).

`1234.5` → `1235` (al peso, los medios hacia arriba: ``meses.al_peso``, el
``Math.round`` de Vender). Se eligió redondear y no rechazar con 422: un
cliente viejo no pierde la venta por un medio peso, y lo que queda en la base
es lo mismo que dicen las cuentas. «Hoy» es el 17 de octubre de 2026 en
Colombia (marca ``reloj``).
"""
from tests import test_participaciones as tp
from tests.test_vender_contrato import _entera, _pedido, _vender

RELOJ = tp.RELOJ
D = tp.D


def _total_del_contrato(lease_id):
    from app.models.models import SpaceLease

    db = tp._bd()
    try:
        return db.get(SpaceLease, lease_id).monthly_rent
    finally:
        db.close()


@RELOJ
def test_vender_redondea_el_total_y_lo_tecleado(client, admin):
    tp._plano(client, admin)
    v = _vender(client, admin, _pedido(_entera("GON-02", 1234.5)))
    lid = v["contratos"][0]["lease_id"]
    assert _total_del_contrato(lid) == 1235
    from app.models.vender import CondicionesDeContrato

    db = tp._bd()
    try:
        assert db.get(CondicionesDeContrato, lid).valor_tecleado == 1235
    finally:
        db.close()


@RELOJ
def test_la_ruta_vieja_de_contratos_redondea_y_dice_la_forma(client, admin):
    """`POST /spaces/{id}/leases` (que hoy usan las pruebas, P2-12): el total
    al peso y la forma «total», como Vender."""
    from app.models.vender import CondicionesDeContrato

    tp._plano(client, admin)
    e = client.post("/api/spaces/find-or-create", headers=admin,
                    json={"code": "NAVE-GON-02", "name": "GON-02", "zone": "gondola", "sede": "NAVE"}).json()
    p = client.post("/api/suppliers/find-or-create", headers=admin, json={"name": "Medio Peso SA"}).json()
    r = client.post(f"/api/spaces/{e['id']}/leases", headers=admin, json={
        "supplier_id": p["id"], "start_date": D(2026, 11, 1), "end_date": D(2026, 11, 30), "monthly_rent": 1234.5})
    assert r.status_code == 201, r.text
    assert r.json()["monthly_rent"] == 1235
    db = tp._bd()
    try:
        c = db.get(CondicionesDeContrato, r.json()["id"])
        assert (c.modo_precio, c.valor_tecleado) == ("total", 1235)
    finally:
        db.close()


@RELOJ
def test_la_planilla_redondea_lo_del_mes(client, admin):
    from test_bulk_leases import _fila, _plano, _validar

    _plano(client, admin)
    f = _validar(client, admin, [_fila(valor=1234.5)]).json()["filas"][0]
    assert f["valor_mes"] == 1235, f


@RELOJ
def test_las_tarifas_quedan_al_peso(client, admin):
    r = client.put("/api/layout/rates", headers=admin,
                   json={"default": {"punta": 1234.5}, "by_sede": {"NAVE": {"gondola": 999.49}}})
    assert r.status_code == 200, r.text
    g = client.get("/api/layout/rates", headers=admin).json()
    assert g["default"] == {"punta": 1235} and g["by_sede"] == {"NAVE": {"gondola": 999}}


@RELOJ
def test_una_participacion_redondea_el_valor(client, admin):
    tp._plano(client, admin)
    tp._alta(client, admin, valor=1234.5)
    (t,) = [t for p in tp._cara(client, admin)["participaciones"] for t in p["terminos"]]
    # Sin `al_mes`, el valor es el total.
    assert t["valor_total"] == 1235


def test_los_esquemas_de_plata_redondean():
    """Los que no tienen un camino corto de punta a punta: el corte de ventas
    y la confirmación de una reserva."""
    from app.routers.cobros import CorteIn
    from app.routers.reservas import ConfirmarIn

    assert CorteIn(periodo_desde="2026-10-01", periodo_hasta="2026-10-31", ventas=1234.5).ventas == 1235
    c = ConfirmarIn(valor=1234.5, valor_tecleado=0.5)
    assert (c.valor, c.valor_tecleado) == (1235, 1)
    assert ConfirmarIn().valor is None
