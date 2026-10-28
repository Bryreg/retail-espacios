"""Contratos de antes de Vender: ¿su valor era del mes o del total? (2026-10-25)

En GALERÍAS los contratos se cargaron con el valor del MES, y el sistema lo
leía como el total. Quien administra le dice a cada uno (o a todos) cómo se
lee: «al mes» → el total pasa a ser el valor × los meses; «el total» → no
cambia. Se puede deshacer. Sin correos. Todo ``import app.*`` adentro.
"""
from tests import test_participaciones as tp
from tests.test_editar_contrato import _editar, _lease, _sin_forma, _vendido
from tests.test_vender_contrato import _correos, _entera

RELOJ = tp.RELOJ
D = tp.D
URL = "/api/contratos/precio-sin-forma"


def _lista(client, admin):
    r = client.get(URL, headers=admin, params={"sede": "NAVE"})
    assert r.status_code == 200, r.text
    return {c["lease_id"]: c for c in r.json()["contratos"]}


def _condicion(lease_id):
    from app.models.vender import CondicionesDeContrato

    db = tp._bd()
    try:
        c = db.get(CondicionesDeContrato, lease_id)
        return None if c is None else (c.modo_precio, c.valor_tecleado)
    finally:
        db.close()


@RELOJ
def test_los_de_antes_se_leen_al_mes_o_total_y_se_deshace(client, admin, worker, monkeypatch):
    tp._plano(client, admin)
    enviados = _correos(monkeypatch, client, admin)
    # Dos de antes (sin forma): uno vigente de 6 meses y uno vencido de 3.
    vigente = _vendido(client, admin, _entera("GON-02", 800_000), desde=D(2026, 8, 1), hasta=D(2027, 1, 31))["contratos"][0]["lease_id"]
    vencido = _vendido(client, admin, _entera("NEV-03", 500_000), desde=D(2026, 5, 1), hasta=D(2026, 7, 31))["contratos"][0]["lease_id"]
    # Uno hecho en Vender (con forma) y uno por ventas: no son de antes.
    con_forma = _vendido(client, admin, _entera("NEV-03", 300_000), desde=D(2026, 11, 1), hasta=D(2026, 11, 30))["contratos"][0]["lease_id"]
    _sin_forma(vigente)
    _sin_forma(vencido)
    enviados.clear()

    filas = _lista(client, admin)
    assert set(filas) == {vigente, vencido} and con_forma not in filas
    assert (filas[vigente]["estado"], filas[vigente]["meses"], filas[vigente]["total_si_es_al_mes"]) == ("vigente", 6, 4_800_000)
    assert (filas[vencido]["estado"], filas[vencido]["total_si_es_al_mes"]) == ("vencido", 1_500_000)
    assert filas[vigente]["espacio"] == "GON-02" and filas[vigente]["proveedor"] == "Lácteos del Valle"
    # Sólo administración.
    assert client.get(URL, headers=worker, params={"sede": "NAVE"}).status_code == 403
    assert client.post(URL + "/corregir", headers=worker, json={"modo": "mensual", "contratos": [{"lease_id": vigente, "valor": 800_000}]}).status_code == 403

    # El valor que se mostró tiene que seguir siendo el que es: si no, nada.
    r = client.post(URL + "/corregir", headers=admin, json={"modo": "mensual", "contratos": [
        {"lease_id": vigente, "valor": 800_000}, {"lease_id": vencido, "valor": 499_999}]})
    assert r.status_code == 409 and r.json()["detail"]["code"] == "contrato_cambio"
    assert _lease(vigente)["valor"] == 800_000, "todo o nada"

    r = client.post(URL + "/corregir", headers=admin, json={"modo": "mensual", "contratos": [
        {"lease_id": vigente, "valor": 800_000}, {"lease_id": vencido, "valor": 500_000}]})
    assert r.status_code == 200, r.text
    assert (_lease(vigente)["valor"], _lease(vencido)["valor"]) == (4_800_000, 1_500_000)
    assert (_condicion(vigente), _condicion(vencido)) == (("mensual", 800_000), ("mensual", 500_000))
    assert _lista(client, admin) == {}
    assert enviados == [], "corregir cómo se lee un valor no manda correos"
    # Ya corregido, no se vuelve a corregir.
    r = client.post(URL + "/corregir", headers=admin, json={"modo": "total", "contratos": [{"lease_id": vigente, "valor": 4_800_000}]})
    assert r.status_code == 409

    # Deshacer: vuelve el valor de antes y sale otra vez en la lista.
    r = client.post(URL + "/deshacer", headers=admin, json={"lease_ids": [vencido]})
    assert r.status_code == 200, r.text
    assert _lease(vencido)["valor"] == 500_000 and _condicion(vencido) is None
    assert set(_lista(client, admin)) == {vencido}
    # «Es el total»: no cambia el valor, y sale de la lista.
    r = client.post(URL + "/corregir", headers=admin, json={"modo": "total", "contratos": [{"lease_id": vencido, "valor": 500_000}]})
    assert r.status_code == 200 and _lease(vencido)["valor"] == 500_000 and _condicion(vencido) == ("total", 500_000)
    assert _lista(client, admin) == {}

    # Editado después de corregirlo: ya no se deshace desde acá.
    _editar(client, admin, vigente, _entera("GON-02", 5_400_000, modo_precio="mensual", valor_tecleado=900_000),
            desde=D(2026, 8, 1), hasta=D(2027, 1, 31))
    r = client.post(URL + "/deshacer", headers=admin, json={"lease_ids": [vigente]})
    assert r.status_code == 409 and _lease(vigente)["valor"] == 5_400_000


@RELOJ
def test_la_bitacora_dice_lo_de_antes_y_lo_de_ahora(client, admin):
    from app.models.models import AuditEntry

    tp._plano(client, admin)
    lease_id = _vendido(client, admin, _entera("GON-02", 800_000), desde=D(2026, 8, 1), hasta=D(2027, 1, 31))["contratos"][0]["lease_id"]
    _sin_forma(lease_id)
    r = client.post(URL + "/corregir", headers=admin, json={"modo": "mensual", "contratos": [{"lease_id": lease_id, "valor": 800_000}]})
    assert r.status_code == 200
    db = tp._bd()
    try:
        (a,) = db.query(AuditEntry).filter(AuditEntry.accion == "contrato.precio_corregido").all()
        assert a.entidad_id == str(lease_id) and "800.000" in a.detalle and "4.800.000" in a.detalle
    finally:
        db.close()


def _cobro(lease_id):
    from app.models.vender import CobroPorVenta

    db = tp._bd()
    try:
        c = db.get(CobroPorVenta, lease_id)
        return None if c is None else (c.porcentaje, c.corte)
    finally:
        db.close()


@RELOJ
def test_se_cobran_por_ventas(client, admin, worker, monkeypatch):
    """«Por % de ventas»: queda como un contrato por ventas de Vender (valor 0
    + su cobro), con los cortes en «Ventas por cargar»."""
    from app.models.models import AuditEntry

    tp._plano(client, admin)
    enviados = _correos(monkeypatch, client, admin)
    uno = _vendido(client, admin, _entera("GON-02", 1), desde=D(2026, 9, 19), hasta=D(2026, 11, 10))["contratos"][0]["lease_id"]
    otro = _vendido(client, admin, _entera("NEV-03", 1), desde=D(2026, 8, 1), hasta=D(2026, 12, 31))["contratos"][0]["lease_id"]
    _sin_forma(uno)
    _sin_forma(otro)
    enviados.clear()
    assert set(_lista(client, admin)) == {uno, otro}

    mostrados = [{"lease_id": uno, "valor": 1}, {"lease_id": otro, "valor": 1}]
    # Sin porcentaje o sin corte válido, nada.
    for cobro in (None, {"porcentaje": 0, "corte": "mensual"}, {"porcentaje": 101, "corte": "mensual"},
                  {"porcentaje": 8, "corte": "semanal"}):
        r = client.post(URL + "/corregir", headers=admin, json={"modo": "ventas", "contratos": mostrados, "cobro": cobro})
        assert r.status_code == 422, (cobro, r.text)
    assert _cobro(uno) is None and _lease(uno)["valor"] == 1
    assert client.post(URL + "/corregir", headers=worker, json={
        "modo": "ventas", "contratos": mostrados, "cobro": {"porcentaje": 8, "corte": "mensual"}}).status_code == 403

    r = client.post(URL + "/corregir", headers=admin, json={
        "modo": "ventas", "contratos": mostrados, "cobro": {"porcentaje": 7.5, "corte": "mensual"}})
    assert r.status_code == 200, r.text
    assert (_lease(uno)["valor"], _lease(otro)["valor"]) == (0, 0)
    assert (_cobro(uno), _cobro(otro)) == ((7.5, "mensual"), (7.5, "mensual"))
    assert _condicion(uno) is None
    assert _lista(client, admin) == {}
    assert enviados == []
    db = tp._bd()
    try:
        detalles = [a.detalle for a in db.query(AuditEntry).filter(AuditEntry.accion == "contrato.precio_corregido").all()]
        assert detalles and all("7,5 % de las ventas, corte cada mes" in d for d in detalles)
    finally:
        db.close()
    # Ya son por ventas: sus cortes vencidos piden cargarse, como los de Vender.
    pendientes = client.get("/api/cobros/pendientes", params={"sede": "NAVE"}, headers=admin).json()
    assert {p["lease_id"] for p in pendientes} == {uno, otro}

    # Deshacer vuelve el valor de antes y saca el cobro.
    r = client.post(URL + "/deshacer", headers=admin, json={"lease_ids": [otro]})
    assert r.status_code == 200, r.text
    assert _lease(otro)["valor"] == 1 and _cobro(otro) is None
    assert set(_lista(client, admin)) == {otro}

    # Con una venta ya cargada, no se deshace (lo cobrado no se pierde).
    corte = {"periodo_desde": "2026-09-19", "periodo_hasta": "2026-09-30", "ventas": 1_000_000}
    assert client.post(f"/api/cobros/{uno}/cortes", json=corte, headers=admin).status_code == 201
    r = client.post(URL + "/deshacer", headers=admin, json={"lease_ids": [uno]})
    assert r.status_code == 409 and _cobro(uno) == (7.5, "mensual")
