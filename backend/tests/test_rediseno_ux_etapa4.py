"""Etapa 4 del rediseño UX (2026-10-27): la línea de tiempo de la sede en
Contratos (`GET /spaces/linea`).

Hasta acá el navegador sólo sabía el contrato que manda en cada espacio (el
vigente o el próximo): un espacio vendido hasta noviembre y otra vez desde enero
tenía el segundo contrato invisible en una línea de 12 meses.

La línea vive en Contratos, la pantalla que mira el proveedor: trae fechas,
nunca proveedores ni plata, y es de administración.

«Hoy» es el 17 de octubre de 2026 en Colombia (marca ``reloj``).
"""
from tests import test_participaciones as tp
from tests.test_vender_contrato import _entera, _pedido, _vender

RELOJ = tp.RELOJ
D = tp.D


@RELOJ
def test_la_linea_trae_cada_contrato_y_reserva_sin_nombres_ni_plata(client, admin, worker):
    tp._plano(client, admin)
    _vender(client, admin, _pedido(_entera("GON-02", 900_000), proveedor="Antes SA",
                                   desde=D(2026, 10, 1), hasta=D(2026, 11, 30)))
    _vender(client, admin, _pedido(_entera("GON-02", 600_000), proveedor="Después SA",
                                   desde=D(2027, 1, 1), hasta=D(2027, 2, 28)))
    # Uno que ya terminó no está; uno que arranca en 13 meses tampoco.
    _vender(client, admin, _pedido(_entera("NEV-03", 500_000), proveedor="Viejo SA",
                                   desde=D(2026, 6, 1), hasta=D(2026, 9, 30)))
    _vender(client, admin, _pedido(_entera("NEV-03", 500_000), proveedor="Lejano SA",
                                   desde=D(2027, 12, 1), hasta=D(2027, 12, 31)))
    _vender(client, admin, _pedido(_entera("GON-02-B"), proveedor="Reserva SA", tipo="reserva",
                                   caduca=D(2026, 10, 25)))

    r = client.get("/api/spaces/linea", headers=admin, params={"sede": "nave"})
    assert r.status_code == 200, r.text
    linea = r.json()
    assert (linea["desde"], linea["hasta"][:7]) == ("2026-10-17", "2027-10")
    filas = [(f["espacio"], f["tipo"], f["desde"], f["hasta"]) for f in linea["filas"]]
    assert filas == [
        ("NAVE-GON-02", "contrato", "2026-10-01", "2026-11-30"),
        ("NAVE-GON-02", "contrato", "2027-01-01", "2027-02-28"),
        ("NAVE-GON-02-B", "reserva", "2026-11-01", "2026-11-30"),
    ]
    assert linea["filas"][2]["caduca"] == "2026-10-25"
    # Ni proveedores ni plata en ninguna fila.
    texto = r.text
    for nombre in ("Antes SA", "Después SA", "Reserva SA", "900000", "600000"):
        assert nombre not in texto
    assert all(set(f) <= {"espacio", "tipo", "id", "desde", "hasta", "caduca"} for f in linea["filas"])
    # Otra sede: nada. El trabajador: no entra.
    assert client.get("/api/spaces/linea", headers=admin, params={"sede": "OTRA"}).json()["filas"] == []
    assert client.get("/api/spaces/linea", headers=worker, params={"sede": "NAVE"}).status_code == 403


@RELOJ
def test_un_contrato_cancelado_no_ocupa_la_linea(client, admin):
    tp._plano(client, admin)
    v = _vender(client, admin, _pedido(_entera("GON-02", 900_000), desde=D(2026, 11, 1), hasta=D(2026, 11, 30)))
    lease_id = v["contratos"][0]["lease_id"]
    espacio = client.get("/api/spaces/by-code/NAVE-GON-02", headers=admin).json()
    assert client.delete(f"/api/spaces/{espacio['id']}/leases/{lease_id}", headers=admin).status_code in (200, 204)
    assert client.get("/api/spaces/linea", headers=admin, params={"sede": "NAVE"}).json()["filas"] == []
