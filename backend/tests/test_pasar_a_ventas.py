"""Pasar un contrato de valor fijo a cobro por un % de las ventas
(``POST /api/cobros/{lease_id}/pasar-a-ventas``, ``docs/rediseno/vender-api.md`` §3).

En POBLADO hay ~30 contratos cargados como fijos cuando el cobro por ventas no
existía: su `monthly_rent` (el TOTAL del contrato) es de unos pocos pesos, que
casi seguro era el % escrito como plata. Salían en Supervisar → «Para revisar»
→ Corregir → «Bajo tarifa de referencia» con «−100 %». Desde ese renglón se
pasan a % de las ventas y quedan como uno de Vender: el valor en 0, su
`cobros_por_venta`, y el valor viejo escrito al final de la nota.

El plano es el de ``test_participaciones`` (NAVE). «Hoy» es el 17 de octubre de
2026 en Colombia (marca ``reloj``). Todo ``import app.*`` va adentro de las
funciones (el fixture ``client`` purga ``sys.modules``).
"""
from tests import test_participaciones as tp
from tests.test_vender_contrato import _entera, _pedido, _vender

RELOJ = tp.RELOJ
D = tp.D
BIEN = {"porcentaje": 8, "corte": "mensual"}


def _url(lease_id):
    return f"/api/cobros/{lease_id}/pasar-a-ventas"


def _fijo(client, admin, espacio="GON-02", valor=8, **extra):
    """Un contrato como los de POBLADO: «8» de valor fijo (era el 8 %)."""
    r = _vender(client, admin, _pedido(_entera(espacio, valor), **extra))
    return r["contratos"][0]["lease_id"]


def _code(r):
    return r.json()["detail"]["code"]


@RELOJ
def test_pasa_a_ventas_con_el_valor_en_cero_y_la_constancia_en_la_nota(client, admin):
    from app.models.models import AuditEntry, SpaceLease
    from app.models.vender import CobroPorVenta, CondicionesDeContrato

    tp._plano(client, admin)
    lease_id = _fijo(client, admin, nota="Firmado en la feria", desde=D(2026, 9, 19), hasta=D(2026, 11, 10))
    # Antes: el mapa comercial dice 8 pesos, que en Supervisar sale «bajo tarifa».
    antes = client.get("/api/spaces/comercial", params={"sede": "NAVE"}, headers=admin).json()
    assert antes["NAVE-GON-02"]["negotiatedValue"] == 8

    r = client.post(_url(lease_id), json=BIEN, headers=admin)
    assert r.status_code == 200, r.text
    cuerpo = r.json()
    assert (cuerpo["lease_id"], cuerpo["espacio"], cuerpo["monthly_rent"]) == (lease_id, "NAVE-GON-02", 0)
    assert (cuerpo["porcentaje"], cuerpo["corte"], cuerpo["valor_anterior"]) == (8.0, "mensual", 8.0)
    # La nota de antes se queda; la constancia va al final, con el día de Colombia.
    assert cuerpo["notes"] == "Firmado en la feria\nPasado a % de ventas el 2026-10-17 (valor anterior: $ 8)"

    db = tp._bd()
    try:
        lease = db.get(SpaceLease, lease_id)
        assert lease.monthly_rent == 0 and lease.notes.endswith("(valor anterior: $ 8)")
        cobro = db.get(CobroPorVenta, lease_id)
        assert (cobro.porcentaje, cobro.corte) == (8.0, "mensual") and cobro.creado_por
        # Lo tecleado en Vender queda como lo deja Vender con ventas: en 0.
        assert db.get(CondicionesDeContrato, lease_id).valor_tecleado == 0
        (linea,) = db.query(AuditEntry).filter(AuditEntry.accion == "cobro.a_ventas").all()
        assert linea.entidad_id == str(lease_id) and "8 %" in linea.detalle and "antes $ 8" in linea.detalle
    finally:
        db.close()

    # Sale de «Bajo tarifa»: el mapa ya no le da valor (Supervisar sólo compara
    # lo que tiene valor > 0) y el tablero no lo cuenta como un contrato de $ 0.
    despues = client.get("/api/spaces/comercial", params={"sede": "NAVE"}, headers=admin).json()
    assert despues["NAVE-GON-02"]["negotiatedValue"] == 0
    assert despues["NAVE-GON-02"]["observation"].endswith("(valor anterior: $ 8)")
    # Y «Ventas por cargar» funciona con él: septiembre ya terminó y está pendiente.
    pendientes = client.get("/api/cobros/pendientes", params={"sede": "NAVE"}, headers=admin)
    assert pendientes.status_code == 200
    assert pendientes.json() == [{"lease_id": lease_id, "espacio": "NAVE-GON-02", "proveedor": "Lácteos del Valle",
                                  "porcentaje": 8.0, "periodo_desde": "2026-09-19", "periodo_hasta": "2026-09-30"}]
    (fila,) = client.get("/api/cobros", params={"sede": "NAVE"}, headers=admin).json()
    assert fila["lease_id"] == lease_id and fila["proximo_corte"]["periodo_desde"] == "2026-09-19"
    corte = {"periodo_desde": "2026-09-19", "periodo_hasta": "2026-09-30", "ventas": 1_000_000}
    assert client.post(f"/api/cobros/{lease_id}/cortes", json=corte, headers=admin).json() == {"monto": 80_000.0}


@RELOJ
def test_sin_nota_la_constancia_es_la_nota_y_un_decimal_no_se_redondea(client, admin):
    tp._plano(client, admin)
    lease_id = _fijo(client, admin, "NEV-03-PU1", valor=0.5, nota=None)
    r = client.post(_url(lease_id), json={"porcentaje": 0.5, "corte": "al_final"}, headers=admin)
    assert r.status_code == 200, r.text
    assert r.json()["notes"] == "Pasado a % de ventas el 2026-10-17 (valor anterior: $ 0,5)"
    assert (r.json()["porcentaje"], r.json()["corte"]) == (0.5, "al_final")
    # Un total grande va entero y con punto de miles.
    otro = _fijo(client, admin, "NEV-03-PU2", valor=800_000)
    r = client.post(_url(otro), json=BIEN, headers=admin)
    assert r.json()["notes"].endswith("(valor anterior: $ 800.000)")


@RELOJ
def test_el_porcentaje_va_con_la_regla_de_vender(client, admin):
    from app.models.vender import CobroPorVenta

    tp._plano(client, admin)
    lease_id = _fijo(client, admin)
    for malo in ({"porcentaje": 0, "corte": "mensual"}, {"porcentaje": -1, "corte": "mensual"},
                 {"porcentaje": 100.01, "corte": "mensual"}, {"porcentaje": 150, "corte": "mensual"}):
        r = client.post(_url(lease_id), json=malo, headers=admin)
        assert r.status_code == 422 and _code(r) == "cobro", (malo, r.text)
    # La forma: sin %, un corte que no existe o un campo de más, el 422 de siempre.
    for malo in ({"corte": "mensual"}, {"porcentaje": 8}, {"porcentaje": 8, "corte": "semanal"},
                 {"porcentaje": 8, "corte": "mensual", "monthly_rent": 0}, {"porcentaje": "NaN", "corte": "mensual"}):
        assert client.post(_url(lease_id), json=malo, headers=admin).status_code == 422, malo
    # El borde de arriba entra: 100 %.
    assert client.post(_url(lease_id), json={"porcentaje": 100, "corte": "mensual"}, headers=admin).status_code == 200
    db = tp._bd()
    try:
        assert db.query(CobroPorVenta).count() == 1
    finally:
        db.close()


@RELOJ
def test_lo_que_no_se_pasa(client, admin):
    """404 si no existe; 409 si ya cobra por ventas, si está cancelado o si ya
    terminó. Ningún rechazo escribe nada."""
    from app.models.models import SpaceLease
    from app.models.vender import CobroPorVenta

    tp._plano(client, admin)
    r = client.post(_url(99_999), json=BIEN, headers=admin)
    assert r.status_code == 404 and _code(r) == "contrato_no_existe"

    # Ya por ventas: hecho en Vender, o pasado dos veces.
    ventas = _vender(client, admin, _pedido({"espacio": "NEV-03-PU1", "valor": 0},
                                            cobro={"modo": "ventas", "porcentaje": 8, "corte": "mensual"}))
    r = client.post(_url(ventas["contratos"][0]["lease_id"]), json=BIEN, headers=admin)
    assert r.status_code == 409 and _code(r) == "ya_por_ventas"
    dos_veces = _fijo(client, admin, "GON-02")
    assert client.post(_url(dos_veces), json=BIEN, headers=admin).status_code == 200
    r = client.post(_url(dos_veces), json={"porcentaje": 5, "corte": "al_final"}, headers=admin)
    assert r.status_code == 409 and _code(r) == "ya_por_ventas"

    # Cancelado (con `DELETE`, el camino de siempre).
    cancelado = _fijo(client, admin, "NEV-03-PU2")
    db = tp._bd()
    try:
        space_id = db.get(SpaceLease, cancelado).space_id
    finally:
        db.close()
    assert client.delete(f"/api/spaces/{space_id}/leases/{cancelado}", headers=admin).status_code == 204
    r = client.post(_url(cancelado), json=BIEN, headers=admin)
    assert r.status_code == 409 and _code(r) == "contrato_cancelado"

    # Terminado: ya pasó su plazo.
    terminado = _fijo(client, admin, "NEV-03-PU3", desde=D(2026, 8, 1), hasta=D(2026, 9, 30))
    r = client.post(_url(terminado), json=BIEN, headers=admin)
    assert r.status_code == 409 and _code(r) == "contrato_terminado"

    db = tp._bd()
    try:
        for lid in (cancelado, terminado):
            lease = db.get(SpaceLease, lid)
            assert lease.monthly_rent == 8 and "Pasado a % de ventas" not in (lease.notes or "")
            assert db.get(CobroPorVenta, lid) is None
        assert db.get(CobroPorVenta, dos_veces).corte == "mensual", "el segundo pedido pisó el primero"
    finally:
        db.close()


@RELOJ
def test_una_reserva_no_se_toca(client, admin):
    """Una reserva no es un contrato: guarda su propio cobro en su tabla. Su id
    no es el de ningún contrato (404), y un término de participación que no es
    contrato colgado de un lease se rechaza (409 ``no_es_contrato``)."""
    from app.models.models import Space
    from app.models.participaciones import Participacion
    from app.models.vender import ReservaDeEspacio

    tp._plano(client, admin)
    r = _vender(client, admin, _pedido(_entera("GON-02", 8), tipo="reserva", caduca=D(2026, 10, 25)))
    reserva_id = r["reservas"][0]["reserva_id"]
    r = client.post(_url(reserva_id), json=BIEN, headers=admin)
    assert r.status_code == 404, "no hay contratos: el id de la reserva no es el de un contrato"
    db = tp._bd()
    try:
        res = db.get(ReservaDeEspacio, reserva_id)
        assert (res.valor, res.cobro_modo, res.estado) == (8, "fijo", "viva")
    finally:
        db.close()

    # Un lease con un término que no es contrato (no debería pasar; si pasa, no se toca).
    lease_id = _fijo(client, admin, "NEV-03-PU1")
    db = tp._bd()
    try:
        cara = db.query(Space).filter(Space.code == "NAVE-NEV-03-PU1").one()
        db.add(Participacion(space_id=cara.id, cara_space_id=cara.id, numero=99, estado="reserva",
                             puntos_basicos=5000, lease_id=lease_id))
        db.commit()
    finally:
        db.close()
    r = client.post(_url(lease_id), json=BIEN, headers=admin)
    assert r.status_code == 409 and _code(r) == "no_es_contrato"


@RELOJ
def test_es_plata_solo_administracion(client, admin, worker):
    from app.models.models import SpaceLease
    from app.models.vender import CobroPorVenta

    tp._plano(client, admin)
    lease_id = _fijo(client, admin)
    assert client.post(_url(lease_id), json=BIEN, headers=worker).status_code == 403
    assert client.post(_url(lease_id), json=BIEN).status_code == 401
    db = tp._bd()
    try:
        assert db.get(SpaceLease, lease_id).monthly_rent == 8
        assert db.get(CobroPorVenta, lease_id) is None
    finally:
        db.close()


@RELOJ
def test_vender_sigue_con_la_misma_regla_del_porcentaje(client, admin):
    """Vender y el paso a ventas comparten el validador: el mismo 422 ``cobro``."""
    tp._plano(client, admin)
    for p in (0, 150):
        cuerpo = _pedido({"espacio": "GON-02", "valor": 0}, cobro={"modo": "ventas", "porcentaje": p, "corte": "mensual"})
        assert _vender(client, admin, cuerpo, codigo=422)["detail"]["code"] == "cobro"
