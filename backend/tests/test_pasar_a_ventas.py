"""Pasar un contrato de valor fijo a cobro por un % de las ventas
(``POST /api/cobros/{lease_id}/pasar-a-ventas``, ``docs/rediseno/vender-api.md`` §3).

En POBLADO hay ~30 contratos cargados como fijos cuando el cobro por ventas no
existía: su `monthly_rent` (el TOTAL del contrato) es de unos pocos pesos, que
casi seguro era el % escrito como plata. Salían en Supervisar → «Para revisar»
→ Corregir → «Bajo tarifa de referencia» con «−100 %». Desde ese renglón se
pasan a % de las ventas y quedan como uno de Vender: el valor en 0, su
`cobros_por_venta`, y el valor viejo escrito al final de la nota.

El contrato es EL del renglón (su ``lease_id``) y el pedido lleva lo que el
renglón mostró (``esperado``): si el contrato ya no dice eso, o ya no está
vigente ni por arrancar, 409 ``contrato_cambio`` y no se escribe nada (antes la
pantalla volvía a pedir el espacio y, con el vigente cancelado entretanto,
pasaba a ventas el PRÓXIMO).

El plano es el de ``test_participaciones`` (NAVE). «Hoy» es el 17 de octubre de
2026 en Colombia (marca ``reloj``). Todo ``import app.*`` va adentro de las
funciones (el fixture ``client`` purga ``sys.modules``).
"""
import json
from datetime import date
from pathlib import Path

from tests import test_participaciones as tp
from tests.test_vender_contrato import _entera, _pedido, _vender

RELOJ = tp.RELOJ
D = tp.D
BIEN = {"porcentaje": 8, "corte": "mensual"}
#: Los casos que corren los dos lados (``paraRevisar.ts``, ``probar-comercial``).
CASOS = json.loads((Path(__file__).resolve().parents[2] / "frontend/scripts/casos/cobro-por-ventas.json")
                   .read_text(encoding="utf-8"))
CAMBIO = "Ese contrato cambió mientras lo mirabas: recargá y volvé a intentar."


def _url(lease_id):
    return f"/api/cobros/{lease_id}/pasar-a-ventas"


def _esperado(lease_id):
    """Lo que el renglón muestra del contrato: su valor y sus fechas."""
    from app.models.models import SpaceLease

    db = tp._bd()
    try:
        lease = db.get(SpaceLease, lease_id)
        return {"valor": lease.monthly_rent, "desde": lease.start_date.isoformat(),
                "hasta": lease.end_date.isoformat()}
    finally:
        db.close()


def _pasar(client, headers, lease_id, cobro=BIEN, esperado=None, **cambios):
    """El POST del renglón: el cobro y lo que el renglón mostró (con
    ``cambios`` encima, para simular un renglón viejo)."""
    e = dict(esperado if esperado is not None else _esperado(lease_id), **cambios)
    return client.post(_url(lease_id), json={**cobro, "esperado": e}, headers=headers)


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

    # El renglón conoce SU contrato: `leaseId`, sólo para quien administra.
    assert antes["NAVE-GON-02"]["leaseId"] == lease_id
    r = _pasar(client, admin, lease_id)
    assert r.status_code == 200, r.text
    cuerpo = r.json()
    assert (cuerpo["lease_id"], cuerpo["espacio"], cuerpo["monthly_rent"]) == (lease_id, "NAVE-GON-02", 0)
    assert (cuerpo["porcentaje"], cuerpo["corte"], cuerpo["valor_anterior"]) == (8.0, "mensual", 8.0)
    # La nota de antes se queda; la constancia va al final, con el día de
    # Colombia escrito como lo dice la app («17 oct 2026», no ISO).
    assert cuerpo["notes"] == "Firmado en la feria\nPasado a % de ventas el 17 oct 2026 (valor anterior: $ 8)"

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
    r = _pasar(client, admin, lease_id, {"porcentaje": 0.5, "corte": "al_final"})
    assert r.status_code == 200, r.text
    assert r.json()["notes"] == "Pasado a % de ventas el 17 oct 2026 (valor anterior: $ 0,5)"
    assert (r.json()["porcentaje"], r.json()["corte"]) == (0.5, "al_final")
    # Un total grande va entero y con punto de miles.
    otro = _fijo(client, admin, "NEV-03-PU2", valor=800_000)
    r = _pasar(client, admin, otro)
    assert r.json()["notes"].endswith("(valor anterior: $ 800.000)")
    # Con decimales que redondean a entero, sin la coma colgando.
    tercero = _fijo(client, admin, "NEV-03-PU3", valor=0.999)
    r = _pasar(client, admin, tercero)
    assert r.json()["notes"].endswith("(valor anterior: $ 1)"), r.text


def test_pesos_exactos_da_lo_mismo_que_la_pantalla():
    """Los casos de ``casos/cobro-por-ventas.json``, los mismos que corre
    ``pesosExactos`` en ``probar-comercial``: redondeo al centavo con los
    medios hacia arriba y recién después, ¿es entero? Antes 0,999 daba «$ 1,»
    y 0,995 daba «$ 0,99» acá y «$ 1» en la pantalla."""
    from app.services.cobros import pesos_exactos

    casos = CASOS["pesos_exactos"]
    assert len(casos) >= 20
    for valor, texto in casos:
        assert pesos_exactos(valor) == texto, (valor, pesos_exactos(valor), texto)
    for raro in (float("nan"), float("inf")):
        assert pesos_exactos(raro) == "$ 0"


def test_la_constancia_lleva_la_fecha_de_la_app():
    from app.services.cobros import linea_de_constancia

    assert linea_de_constancia(date(2026, 10, 21), 3) == "Pasado a % de ventas el 21 oct 2026 (valor anterior: $ 3)"
    assert linea_de_constancia(date(2027, 1, 5), 0.5) == "Pasado a % de ventas el 5 ene 2027 (valor anterior: $ 0,5)"


def test_los_cortes_vencidos_dan_lo_mismo_que_la_pantalla():
    """Lo que el renglón abierto avisa antes de guardar («Quedan 3 cortes ya
    vencidos por cargar…») sale de ``cortesVencidos`` de ``paraRevisar.ts``;
    acá, los mismos casos contra ``periodos`` y la regla de ``pendientes``
    (vencido = su último día es anterior a hoy)."""
    from app.services.cobros import periodos

    casos = CASOS["cortes"]
    assert len(casos) >= 10
    for c in casos:
        hoy = date.fromisoformat(c["hoy"])
        vencidos = [[a.isoformat(), b.isoformat()]
                    for a, b in periodos(date.fromisoformat(c["desde"]), date.fromisoformat(c["hasta"]), c["corte"])
                    if b < hoy]
        assert vencidos == c["vencidos"], c["por"]


@RELOJ
def test_los_cortes_que_avisa_el_renglon_son_los_que_quedan_pendientes(client, admin):
    """De punta a punta: un contrato que arrancó el 21 jul, pasado a ventas
    con corte mensual el 17 oct, deja exactamente los tres pendientes que el
    renglón avisó (jul, ago y sep); con «al final», ninguno."""
    from app.models.models import SpaceLease

    tp._plano(client, admin)
    mensual = _fijo(client, admin, "NEV-03-PU1", valor=6)
    al_final = _fijo(client, admin, "NEV-03-PU2", valor=6)
    db = tp._bd()
    try:
        for lid in (mensual, al_final):
            lease = db.get(SpaceLease, lid)
            lease.start_date, lease.end_date = date(2026, 7, 21), date(2027, 1, 31)
        db.commit()
    finally:
        db.close()
    assert _pasar(client, admin, mensual).status_code == 200
    assert _pasar(client, admin, al_final, {"porcentaje": 6, "corte": "al_final"}).status_code == 200
    pendientes = client.get("/api/cobros/pendientes", params={"sede": "NAVE"}, headers=admin).json()
    assert [(p["lease_id"], p["periodo_desde"], p["periodo_hasta"]) for p in pendientes] == [
        (mensual, "2026-07-21", "2026-07-31"), (mensual, "2026-08-01", "2026-08-31"),
        (mensual, "2026-09-01", "2026-09-30")]


@RELOJ
def test_el_porcentaje_va_con_la_regla_de_vender(client, admin):
    from app.models.vender import CobroPorVenta

    tp._plano(client, admin)
    lease_id = _fijo(client, admin)
    for malo in ({"porcentaje": 0, "corte": "mensual"}, {"porcentaje": -1, "corte": "mensual"},
                 {"porcentaje": 100.01, "corte": "mensual"}, {"porcentaje": 150, "corte": "mensual"}):
        r = _pasar(client, admin, lease_id, malo)
        assert r.status_code == 422 and _code(r) == "cobro", (malo, r.text)
    # La forma: sin %, un corte que no existe o un campo de más, el 422 de siempre.
    esperado = _esperado(lease_id)
    for malo in ({"corte": "mensual"}, {"porcentaje": 8}, {"porcentaje": 8, "corte": "semanal"},
                 {"porcentaje": 8, "corte": "mensual", "monthly_rent": 0}, {"porcentaje": "NaN", "corte": "mensual"}):
        assert client.post(_url(lease_id), json={**malo, "esperado": esperado}, headers=admin).status_code == 422, malo
    # Lo que el renglón mostró es obligatorio y con su forma: sin `esperado`,
    # sin una fecha, con una fecha que no es fecha, un valor que no es número o
    # un campo de más, 422.
    for malo in (BIEN, {**BIEN, "esperado": None}, {**BIEN, "esperado": {"valor": 8, "desde": esperado["desde"]}},
                 {**BIEN, "esperado": {**esperado, "hasta": "mañana"}},
                 {**BIEN, "esperado": {**esperado, "valor": "NaN"}},
                 {**BIEN, "esperado": {**esperado, "lease_id": lease_id}}):
        assert client.post(_url(lease_id), json=malo, headers=admin).status_code == 422, malo
    # El borde de arriba entra: 100 %.
    assert _pasar(client, admin, lease_id, {"porcentaje": 100, "corte": "mensual"}).status_code == 200
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
    r = _pasar(client, admin, 99_999, esperado={"valor": 8, "desde": D(2026, 11, 1), "hasta": D(2026, 11, 30)})
    assert r.status_code == 404 and _code(r) == "contrato_no_existe"

    # Ya por ventas: hecho en Vender, o pasado dos veces.
    ventas = _vender(client, admin, _pedido({"espacio": "NEV-03-PU1", "valor": 0},
                                            cobro={"modo": "ventas", "porcentaje": 8, "corte": "mensual"}))
    r = _pasar(client, admin, ventas["contratos"][0]["lease_id"])
    assert r.status_code == 409 and _code(r) == "ya_por_ventas"
    dos_veces = _fijo(client, admin, "GON-02")
    lo_que_mostro = _esperado(dos_veces)
    assert _pasar(client, admin, dos_veces).status_code == 200
    r = _pasar(client, admin, dos_veces, {"porcentaje": 5, "corte": "al_final"}, esperado=lo_que_mostro)
    assert r.status_code == 409 and _code(r) == "ya_por_ventas"

    # Cancelado (con `DELETE`, el camino de siempre).
    cancelado = _fijo(client, admin, "NEV-03-PU2")
    db = tp._bd()
    try:
        space_id = db.get(SpaceLease, cancelado).space_id
    finally:
        db.close()
    assert client.delete(f"/api/spaces/{space_id}/leases/{cancelado}", headers=admin).status_code == 204
    # Un renglón sólo dibuja contratos vigentes o por arrancar: si ya no lo
    # es, cambió mientras se miraba.
    r = _pasar(client, admin, cancelado)
    assert r.status_code == 409 and _code(r) == "contrato_cambio"
    assert r.json()["detail"]["message"] == CAMBIO

    # Terminado: ya pasó su plazo.
    terminado = _fijo(client, admin, "NEV-03-PU3", desde=D(2026, 8, 1), hasta=D(2026, 9, 30))
    r = _pasar(client, admin, terminado)
    assert r.status_code == 409 and _code(r) == "contrato_cambio"

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
    r = _pasar(client, admin, reserva_id, esperado={"valor": 8, "desde": D(2026, 11, 1), "hasta": D(2026, 11, 30)})
    assert r.status_code == 404, "no hay contratos: el id de la reserva no es el de un contrato"
    # Una reserva no lleva `leaseId` en el mapa comercial: no hay contrato que nombrar.
    assert client.get("/api/spaces/comercial", params={"sede": "NAVE"}, headers=admin).json()["NAVE-GON-02"]["leaseId"] is None
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
    r = _pasar(client, admin, lease_id)
    assert r.status_code == 409 and _code(r) == "no_es_contrato"


@RELOJ
def test_es_plata_solo_administracion(client, admin, worker):
    from app.models.models import SpaceLease
    from app.models.vender import CobroPorVenta

    tp._plano(client, admin)
    lease_id = _fijo(client, admin)
    assert _pasar(client, worker, lease_id).status_code == 403
    assert _pasar(client, {}, lease_id).status_code == 401
    # El trabajador no sabe qué contrato dibuja la cara: `leaseId` le llega `None`.
    mapa = client.get("/api/spaces/comercial", params={"sede": "NAVE"}, headers=worker)
    assert mapa.json()["NAVE-GON-02"]["leaseId"] is None
    assert all(v["leaseId"] is None for v in mapa.json().values())
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


def _cancelar(client, admin, lease_id):
    from app.models.models import SpaceLease

    db = tp._bd()
    try:
        space_id = db.get(SpaceLease, lease_id).space_id
    finally:
        db.close()
    assert client.delete(f"/api/spaces/{space_id}/leases/{lease_id}", headers=admin).status_code == 204


@RELOJ
def test_el_vigente_cancelado_entretanto_no_pasa_al_proximo(client, admin):
    """El hallazgo de la ronda de prueba, tal cual: GON-02 tiene un vigente de
    $ 3 (el % escrito como plata) y un próximo de $ 1.500.000 en la misma cara.
    El renglón de «Bajo tarifa» muestra el de $ 3; otra persona lo cancela
    entretanto; «Guardar». Antes la pantalla volvía a pedir el espacio, elegía
    `active_lease ?? upcoming_lease` y pasaba a ventas el PRÓXIMO (200). Ahora
    el pedido nombra el contrato del renglón: 409 ``contrato_cambio`` y el
    próximo queda intacto."""
    from app.models.models import AuditEntry, SpaceLease
    from app.models.vender import CobroPorVenta

    tp._plano(client, admin)
    vigente = _fijo(client, admin, "GON-02", valor=3, desde=D(2026, 10, 17), hasta=D(2026, 11, 30))
    proximo = _fijo(client, admin, "GON-02", valor=1_500_000, desde=D(2026, 12, 1), hasta=D(2027, 2, 28),
                    nota="Temporada de fin de año")
    # Lo que el renglón dibuja: el vigente, con su `leaseId`.
    renglon = client.get("/api/spaces/comercial", params={"sede": "NAVE"}, headers=admin).json()["NAVE-GON-02"]
    assert (renglon["leaseId"], renglon["negotiatedValue"]) == (vigente, 3)
    esperado = {"valor": renglon["negotiatedValue"], "desde": renglon["startDate"], "hasta": renglon["endDate"]}

    _cancelar(client, admin, vigente)
    r = _pasar(client, admin, renglon["leaseId"], esperado=esperado)
    assert r.status_code == 409 and _code(r) == "contrato_cambio", r.text
    assert r.json()["detail"]["message"] == CAMBIO
    # Un renglón viejo que apuntara al próximo con lo que mostraba del vigente
    # tampoco pasa: el valor y las fechas no son los de ese contrato.
    r = _pasar(client, admin, proximo, esperado=esperado)
    assert r.status_code == 409 and _code(r) == "contrato_cambio", r.text

    db = tp._bd()
    try:
        lease = db.get(SpaceLease, proximo)
        assert (lease.monthly_rent, lease.notes, lease.is_active) == (1_500_000, "Temporada de fin de año", True)
        assert db.query(CobroPorVenta).count() == 0
        assert db.query(AuditEntry).filter(AuditEntry.accion == "cobro.a_ventas").count() == 0
    finally:
        db.close()
    # Recargado, el renglón ya es el del próximo (y no sale en «Bajo tarifa»).
    assert client.get("/api/spaces/comercial", params={"sede": "NAVE"},
                      headers=admin).json()["NAVE-GON-02"]["leaseId"] == proximo


@RELOJ
def test_lo_esperado_tiene_que_coincidir(client, admin):
    """El valor (al centavo) y las dos fechas que
    el renglón mostró: si el contrato dice otra cosa —se editó entretanto—,
    409 ``contrato_cambio`` y nada escrito. Coincidiendo, 200."""
    from app.models.models import SpaceLease
    from app.models.vender import CobroPorVenta

    tp._plano(client, admin)
    lease_id = _fijo(client, admin, "GON-02", valor=3)
    for cambio in ({"valor": 4}, {"valor": 3.01}, {"valor": 2.99}, {"valor": 0},
                   {"desde": D(2026, 10, 31)}, {"hasta": D(2026, 12, 1)}):
        r = _pasar(client, admin, lease_id, **cambio)
        assert r.status_code == 409 and _code(r) == "contrato_cambio", (cambio, r.text)
    db = tp._bd()
    try:
        assert db.get(SpaceLease, lease_id).monthly_rent == 3 and db.get(CobroPorVenta, lease_id) is None
    finally:
        db.close()
    # Al centavo es el mismo número (el ruido de un float que viajó por JSON).
    r = _pasar(client, admin, lease_id, valor=3.004)
    assert r.status_code == 200, r.text
    assert r.json()["valor_anterior"] == 3
