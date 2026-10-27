"""Etapa 5 del rediseño UX (2026-10-27): Indicadores.

· `GET /dashboard/serie`: el canon DEVENGADO de cada mes, por sede (la curva de
  12 meses, la variación contra el mes anterior y «Todas las sedes»), y cuándo
  terminó el último contrato de cada espacio («días sin contrato»). Plata: sólo
  administración.
· `GET/PUT /layout/metas`: la meta de ocupación y la de canon ÷ tarifa, general
  y por sede. Sin nada guardado, las propuestas del dibujo (90 % y 95 %).

«Hoy» es el 17 de octubre de 2026 en Colombia (marca ``reloj``).
"""
from tests import test_participaciones as tp
from tests.test_vender_contrato import _entera, _pedido, _vender

RELOJ = tp.RELOJ
D = tp.D


@RELOJ
def test_la_serie_reparte_cada_contrato_en_los_dias_de_cada_mes(client, admin, worker):
    tp._plano(client, admin)
    # Junio a agosto, $ 900.000 en total: $ 300.000 por mes.
    _vender(client, admin, _pedido(_entera("GON-02-B", 900_000), proveedor="Antes SA",
                                   desde=D(2026, 6, 1), hasta=D(2026, 8, 31)))
    # Del 16 de octubre al 15 de diciembre, $ 600.000: $ 300.000 al mes; octubre
    # corre 16 de sus 31 días.
    _vender(client, admin, _pedido(_entera("GON-02", 600_000), proveedor="Ahora SA",
                                   desde=D(2026, 10, 16), hasta=D(2026, 12, 15)))
    r = client.get("/api/dashboard/serie", headers=admin)
    assert r.status_code == 200, r.text
    s = r.json()
    assert s["meses"][0] == "2025-11" and s["meses"][-1] == "2026-10" and len(s["meses"]) == 12
    nave = s["sedes"]["NAVE"]
    por_mes = dict(zip(s["meses"], nave["canon"]))
    assert (por_mes["2026-05"], por_mes["2026-06"], por_mes["2026-07"], por_mes["2026-08"], por_mes["2026-09"]) == (0, 300_000, 300_000, 300_000, 0)
    assert abs(por_mes["2026-10"] - 300_000 * 16 / 31) < 1
    assert dict(zip(s["meses"], nave["contratos"]))["2026-10"] == 1
    # El último contrato que terminó, por espacio.
    assert nave["ultimo_fin"] == {"NAVE-GON-02-B": "2026-08-31"}
    # Seis meses: el mismo final.
    assert client.get("/api/dashboard/serie", headers=admin, params={"meses": 6}).json()["meses"][0] == "2026-05"
    # El trabajador no ve plata.
    assert client.get("/api/dashboard/serie", headers=worker).status_code == 403


@RELOJ
def test_un_contrato_cancelado_no_suma_en_la_serie(client, admin):
    tp._plano(client, admin)
    v = _vender(client, admin, _pedido(_entera("GON-02", 600_000), desde=D(2026, 10, 1), hasta=D(2026, 11, 30)))
    espacio = client.get("/api/spaces/by-code/NAVE-GON-02", headers=admin).json()
    client.delete(f"/api/spaces/{espacio['id']}/leases/{v['contratos'][0]['lease_id']}", headers=admin)
    s = client.get("/api/dashboard/serie", headers=admin).json()
    assert sum(s["sedes"].get("NAVE", {"canon": [0]})["canon"]) == 0


def test_las_metas_valen_las_propuestas_hasta_que_alguien_las_cambia(client, admin, worker):
    m = client.get("/api/layout/metas", headers=worker).json()
    assert m == {"general": {"ocupacion": 90, "canon_tarifa": 95}, "sedes": {}, "por_defecto": True}
    cuerpo = {"general": {"ocupacion": 85, "canon_tarifa": 100}, "sedes": {"nave ": {"ocupacion": 92, "canon_tarifa": 97}}}
    assert client.put("/api/layout/metas", headers=worker, json=cuerpo).status_code == 403
    r = client.put("/api/layout/metas", headers=admin, json=cuerpo)
    assert r.status_code == 200, r.text
    m = client.get("/api/layout/metas", headers=worker).json()
    assert m == {"general": {"ocupacion": 85, "canon_tarifa": 100}, "sedes": {"NAVE": {"ocupacion": 92, "canon_tarifa": 97}}, "por_defecto": False}
    # Fuera de rango: no.
    malo = {"general": {"ocupacion": 120, "canon_tarifa": 95}}
    assert client.put("/api/layout/metas", headers=admin, json=malo).status_code == 422
    lineas = client.get("/api/bitacora/", headers=admin, params={"accion": "ajustes.metas"}).json()
    assert len(lineas) == 1 and lineas[0]["titulo"] == "Metas de Indicadores cambiadas"


@RELOJ
def test_lo_vencido_es_terminado_y_lo_cancelado_cancelado_aunque_se_hayan_cerrado(client, admin):
    """`expire_leases` apaga lo vencido igual que «Cancelar el contrato»: el
    historial de la ficha (etapa 0) lo leía todo como cancelado en cuanto algo
    llamaba a `/spaces/comercial`."""
    tp._plano(client, admin)
    _vender(client, admin, _pedido(_entera("GON-02", 900_000), proveedor="Antes SA",
                                   desde=D(2026, 6, 1), hasta=D(2026, 8, 31)))
    v = _vender(client, admin, _pedido(_entera("GON-02", 600_000), proveedor="Cancelado SA",
                                       desde=D(2026, 11, 1), hasta=D(2026, 11, 30)))
    espacio = client.get("/api/spaces/by-code/NAVE-GON-02", headers=admin).json()
    client.delete(f"/api/spaces/{espacio['id']}/leases/{v['contratos'][0]['lease_id']}", headers=admin)
    client.get("/api/spaces/comercial", headers=admin)   # vence lo vencido
    filas = client.get("/api/spaces/by-code/NAVE-GON-02/historial", headers=admin).json()
    assert [(f["proveedor"], f["estado"]) for f in filas] == [("Cancelado SA", "cancelado"), ("Antes SA", "terminado")]
    # Y la serie cuenta lo terminado, no lo cancelado.
    por_mes = dict(zip(*[client.get("/api/dashboard/serie", headers=admin).json()[k] for k in ("meses",)],
                       client.get("/api/dashboard/serie", headers=admin).json()["sedes"]["NAVE"]["canon"]))
    assert por_mes["2026-07"] == 300_000 and por_mes["2026-10"] == 0
