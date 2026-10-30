"""El cobro por un % de las ventas (``docs/rediseno/vender-api.md`` §3): sus
cortes y lo que ven las métricas.

Un contrato que se cobra por ventas tiene el valor en 0 y la plata sale de los
cortes. Las métricas no pueden contarlo como un contrato de $ 0: lo sacan del
canon promedio y del spread, y suman lo cobrado al ingreso.

«Hoy» es el 17 de octubre de 2026 en Colombia (marca ``reloj``). Todo
``import app.*`` va adentro de las funciones.
"""
from datetime import date

from tests import test_participaciones as tp
from tests.test_vender_contrato import _entera, _pedido, _vender

RELOJ = tp.RELOJ
D = tp.D
VENTAS = {"modo": "ventas", "porcentaje": 8, "corte": "mensual"}


@RELOJ
def test_los_periodos_de_corte(client):
    from app.services.cobros import monto_de, periodos

    assert periodos(date(2026, 9, 19), date(2026, 11, 10), "mensual") == [
        (date(2026, 9, 19), date(2026, 9, 30)), (date(2026, 10, 1), date(2026, 10, 31)),
        (date(2026, 11, 1), date(2026, 11, 10))]
    assert periodos(date(2026, 9, 19), date(2026, 11, 10), "al_final") == [(date(2026, 9, 19), date(2026, 11, 10))]
    assert periodos(date(2028, 2, 1), date(2028, 2, 29), "mensual") == [(date(2028, 2, 1), date(2028, 2, 29))]
    assert monto_de(1_234_567, 8) == 98_765.0
    assert monto_de(1_000, 7.5) == 75.0


@RELOJ
def test_cargar_los_cortes_vencidos(client, admin, worker):
    tp._plano(client, admin)
    r = _vender(client, admin, _pedido({"espacio": "GON-02", "valor": 0}, cobro=VENTAS,
                                       desde=D(2026, 9, 19), hasta=D(2026, 11, 10)))
    lease_id = r["contratos"][0]["lease_id"]

    pendientes = client.get("/api/cobros/pendientes", params={"sede": "NAVE"}, headers=admin).json()
    assert pendientes == [{"lease_id": lease_id, "espacio": "NAVE-GON-02", "proveedor": "Lácteos del Valle",
                           "porcentaje": 8.0, "periodo_desde": "2026-09-19", "periodo_hasta": "2026-09-30"}]

    corte = {"periodo_desde": "2026-09-19", "periodo_hasta": "2026-09-30", "ventas": 1_234_567}
    c = client.post(f"/api/cobros/{lease_id}/cortes", json=corte, headers=admin)
    assert c.status_code == 201, c.text
    assert c.json() == {"monto": 98_765.0}
    assert client.get("/api/cobros/pendientes", headers=admin).json() == []
    # No se pisa, no se carga un período abierto ni uno que no es del contrato.
    assert client.post(f"/api/cobros/{lease_id}/cortes", json=corte, headers=admin).status_code == 409
    abierto = {"periodo_desde": "2026-10-01", "periodo_hasta": "2026-10-31", "ventas": 1}
    assert client.post(f"/api/cobros/{lease_id}/cortes", json=abierto, headers=admin).status_code == 422
    raro = {"periodo_desde": "2026-09-20", "periodo_hasta": "2026-09-30", "ventas": 1}
    assert client.post(f"/api/cobros/{lease_id}/cortes", json=raro, headers=admin).status_code == 422
    negativo = {**corte, "ventas": -1}
    assert client.post(f"/api/cobros/{lease_id}/cortes", json=negativo, headers=admin).status_code == 422

    (fila,) = client.get("/api/cobros", params={"sede": "NAVE"}, headers=admin).json()
    assert (fila["porcentaje"], fila["corte"], fila["cobrado"]) == (8.0, "mensual", 98_765.0)
    assert [x["monto"] for x in fila["cortes"]] == [98_765.0]
    assert fila["proximo_corte"] == {"periodo_desde": "2026-10-01", "periodo_hasta": "2026-10-31"}

    # La plata no le llega al trabajador.
    assert client.get("/api/cobros", headers=worker).status_code == 403
    assert client.get("/api/cobros/pendientes", headers=worker).status_code == 403
    assert client.post(f"/api/cobros/{lease_id}/cortes", json=corte, headers=worker).status_code == 403
    espacio = client.get(f"/api/spaces/{_space_id('NAVE-GON-02')}", headers=worker).text
    assert "98765" not in espacio and "porcentaje" not in espacio


def _space_id(codigo):
    from app.models.models import Space

    db = tp._bd()
    try:
        return db.query(Space).filter(Space.code == codigo).one().id
    finally:
        db.close()


@RELOJ
def test_al_final_es_un_solo_corte(client, admin):
    tp._plano(client, admin)
    r = _vender(client, admin, _pedido({"espacio": "GON-02", "valor": 0},
                                       cobro={"modo": "ventas", "porcentaje": 10, "corte": "al_final"},
                                       desde=D(2026, 8, 1), hasta=D(2026, 10, 10)))
    lease_id = r["contratos"][0]["lease_id"]
    (p,) = client.get("/api/cobros/pendientes", headers=admin).json()
    assert (p["periodo_desde"], p["periodo_hasta"]) == ("2026-08-01", "2026-10-10")
    c = client.post(f"/api/cobros/{lease_id}/cortes", headers=admin,
                    json={"periodo_desde": "2026-08-01", "periodo_hasta": "2026-10-10", "ventas": 5_000_000})
    assert c.json() == {"monto": 500_000.0}


def _octubre_con_un_contrato_de_cada(client, admin):
    """GON-02 a $ 1.000.000 fijo y la puerta 1 de NEV-03 por ventas, con un
    corte de octubre de $ 200.000 cargado (directo en la base: por la API se
    carga recién cuando el mes termina)."""
    from app.models.vender import CorteDeVenta

    tp._plano(client, admin)
    oct_ = {"desde": D(2026, 10, 1), "hasta": D(2026, 10, 31)}
    _vender(client, admin, _pedido(_entera("GON-02", 1_000_000), proveedor="Fijo SA", **oct_))
    r = _vender(client, admin, _pedido({"espacio": "NEV-03-PU1", "valor": 0}, cobro=VENTAS,
                                       proveedor="Por Ventas SA", **oct_))
    lease_id = r["contratos"][0]["lease_id"]
    db = tp._bd()
    try:
        db.add(CorteDeVenta(lease_id=lease_id, periodo_desde=date(2026, 10, 1), periodo_hasta=date(2026, 10, 31),
                            ventas=2_500_000, monto=200_000))
        db.commit()
    finally:
        db.close()
    return lease_id


@RELOJ
def test_el_tablero_suma_lo_cobrado_y_no_un_contrato_de_cero(client, admin, worker):
    """El canon del mes (`GET /dashboard/serie`, la única cuenta desde que
    `/dashboard/kpis` se fue el 2026-10-30): el fijo, más lo cobrado en el
    corte del que se cobra por ventas."""
    _octubre_con_un_contrato_de_cada(client, admin)
    s = client.get("/api/dashboard/serie", headers=admin).json()
    assert dict(zip(s["meses"], s["sedes"]["NAVE"]["canon"]))["2026-10"] == 1_200_000
    assert client.get("/api/dashboard/serie", headers=worker).status_code == 403


@RELOJ
def test_las_metricas_de_la_plataforma_lo_sacan_del_promedio(client, admin):
    from app.clientes import buscar, sesion_registro
    from app.database import SessionLocal
    from app.plataforma_metricas import _contratos_activos, _contratos_por_ventas, _metricas_de_un_cliente

    _octubre_con_un_contrato_de_cada(client, admin)
    desde, hasta = date(2026, 10, 1), date(2026, 10, 31)
    db = SessionLocal()
    try:
        assert [c for c, _n, _v in _contratos_activos(db, desde, hasta)] == ["NAVE-GON-02"]
        assert _contratos_por_ventas(db, desde, hasta) == [("NAVE-NEV-03-PU1", "Por Ventas SA", 200_000.0)]
    finally:
        db.close()
    reg = sesion_registro()
    try:
        publicas, crudos = _metricas_de_un_cliente(buscar("galerias"), reg, desde, hasta)
    finally:
        reg.close()
    # El promedio es el del único contrato fijo, no (1.000.000 + 0) / 2.
    assert publicas["canon_promedio_mensual"] == 1_000_000
    assert publicas["ingreso_contratado_mes"] == 1_200_000
    assert {p["nombre"] for p in publicas["top_proveedores"]} == {"Fijo SA", "Por Ventas SA"}
    # Los dos ocupan su cara (la puerta ocupa su nevera).
    assert crudos["ocupadas"] == 2


@RELOJ
def test_el_detalle_del_asesor_no_lo_promedia(client, admin):
    from app.plataforma_detalle import armar_detalle

    _octubre_con_un_contrato_de_cada(client, admin)
    d = armar_detalle("galerias", "2026-10")
    proveedores = {p["nombre"]: p for p in d["proveedores"]}
    assert proveedores["Por Ventas SA"]["canon_total"] == 200_000
    assert proveedores["Por Ventas SA"]["canon_promedio"] is None
    assert proveedores["Fijo SA"]["canon_promedio"] == 1_000_000
    for fila in d["resumen_por_tipo"]:
        assert fila["canon_minimo"] in (None, 1_000_000), f"un contrato por ventas entró al promedio: {fila}"
