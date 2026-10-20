"""La reserva de una cara entera o de una parte (``docs/rediseno/vender-api.md`` §8).

Mientras vive, lo reservado cuenta como ocupado en sus fechas en TODOS los
caminos que deciden si algo choca: el guardado de Vender, la planilla, el
contrato suelto, la capacidad de una cara por participación, el guardarraíl
del plano y el mapa comercial. Caducada, deja de contar sola.

El plano es el de ``test_participaciones`` (NAVE). «Hoy» es el 17 de octubre
de 2026 en Colombia (marca ``reloj``). Todo ``import app.*`` va adentro de las
funciones.
"""
from datetime import date

from tests import test_participaciones as tp
from tests.test_vender_contrato import NOV, _correos, _cuantos, _entera, _pedido, _vender

RELOJ = tp.RELOJ
D = tp.D


def _reservar(client, admin, *lineas, proveedor="Lácteos del Valle", caduca=D(2026, 10, 25)):
    r = _vender(client, admin, _pedido(*lineas, tipo="reserva", caduca=caduca, proveedor=proveedor))
    return r["reservas"]


def _space_id(codigo):
    from app.models.models import Space

    db = tp._bd()
    try:
        return db.query(Space).filter(Space.code == codigo).one().id
    finally:
        db.close()


@RELOJ
def test_reservar_una_cara_entera_la_toma_en_todos_los_caminos(client, admin, monkeypatch):
    from app.models.models import SpaceLease
    from app.models.vender import ReservaDeEspacio

    tp._plano(client, admin)
    enviados = _correos(monkeypatch, client, admin)
    (r,) = _reservar(client, admin, _entera("GON-02", 400_000, modo_precio="total"))
    assert r["espacio"] == "NAVE-GON-02" and r["reserva_id"]
    assert _cuantos(SpaceLease) == 0 and enviados == [], "una reserva no es un contrato ni manda correos"
    db = tp._bd()
    try:
        fila = db.get(ReservaDeEspacio, r["reserva_id"])
        assert (fila.estado, fila.caduca, fila.valor, fila.desde) == ("viva", date(2026, 10, 25), 400_000,
                                                                      date(2026, 11, 1))
    finally:
        db.close()

    # Vender: tomada, sin decir que es una reserva ni de quién.
    otro = _vender(client, admin, _pedido(_entera("GON-02"), proveedor="Competidor SA"), codigo=409)
    mensaje = otro["detail"]["filas"][0]["mensaje"]
    assert "tomado" in mensaje and "reserva" not in mensaje.lower() and "Lácteos" not in mensaje

    # La planilla.
    v = client.post("/api/leases/bulk/validar", headers=admin, json={"sede": "NAVE", "filas": [
        {"fila": 2, "espacio": "GON-02", "proveedor": "Competidor SA", "valor": 1000, **NOV}]})
    assert v.status_code == 200, v.text
    assert v.json()["filas"][0]["estado"] == "error"

    # El contrato suelto.
    sid = _space_id("NAVE-GON-02")
    sup = client.post("/api/suppliers/find-or-create", json={"name": "Competidor SA"}, headers=admin).json()["id"]
    suelto = client.post(f"/api/spaces/{sid}/leases", headers=admin, json={
        "supplier_id": sup, "monthly_rent": 1000, "start_date": NOV["desde"], "end_date": NOV["hasta"]})
    assert suelto.status_code == 409, suelto.text
    assert "tomado" in suelto.text and "Lácteos" not in suelto.text

    # Fuera de sus fechas, se vende.
    _vender(client, admin, _pedido(_entera("GON-02"), desde=D(2026, 12, 1), hasta=D(2026, 12, 31),
                                   proveedor="Competidor SA"))


@RELOJ
def test_una_parte_reservada_tambien_choca(client, admin):
    tp._plano(client, admin)
    _reservar(client, admin, _entera("NEV-03-PU1"))
    r = _vender(client, admin, _pedido(_entera("NEV-03-PU1"), proveedor="Competidor SA"), codigo=409)
    assert r["detail"]["filas"][0]["indice"] == 0
    # La puerta 2 es otro espacio: no choca.
    _vender(client, admin, _pedido(_entera("NEV-03-PU2"), proveedor="Competidor SA"))


@RELOJ
def test_una_cara_reservada_cuenta_como_lo_fisico_en_la_capacidad(client, admin):
    """Una reserva de la cara entera de una cara que se vende por participación
    (un plano escrito a mano, una cara que cambió de forma) llena la cara: un
    porcentaje no entra en esas fechas."""
    from app.models.models import Space, SpaceStatus, Supplier
    from app.models.vender import ReservaDeEspacio

    tp._plano(client, admin)
    db = tp._bd()
    try:
        cara = Space(code="NAVE-GON-01", svg_id="NAVE-GON-01", name="Góndola 1", zone="gondola", sede="NAVE",
                     area_m2=0.81, status=SpaceStatus.free)
        sup = Supplier(name="Quien Reservó")
        db.add_all([cara, sup])
        db.flush()
        db.add(ReservaDeEspacio(space_id=cara.id, supplier_id=sup.id, desde=date(2026, 11, 1),
                                hasta=date(2026, 11, 30), caduca=date(2026, 10, 25), estado="viva"))
        db.commit()
    finally:
        db.close()
    r = tp._alta(client, admin, pb=1000, desde=D(2026, 11, 10), hasta=D(2026, 11, 20), codigo=409)
    assert r["detail"]["code"] == "cara_vendida_entera"
    assert "Quien Reservó" not in str(r)
    # Después de sus fechas, sí.
    tp._alta(client, admin, pb=1000, desde=D(2026, 12, 1), hasta=D(2026, 12, 31))


@RELOJ
def test_una_reserva_caducada_ya_no_toma_nada(client, admin):
    from app.models.vender import ReservaDeEspacio

    tp._plano(client, admin)
    (r,) = _reservar(client, admin, _entera("GON-02"))
    db = tp._bd()
    try:
        db.get(ReservaDeEspacio, r["reserva_id"]).caduca = date(2026, 10, 16)  # ayer
        db.commit()
    finally:
        db.close()
    _vender(client, admin, _pedido(_entera("GON-02"), proveedor="Competidor SA"))
    assert client.get("/api/reservas", headers=admin).json() == []
    assert client.post(f"/api/reservas/{r['reserva_id']}/confirmar", headers=admin, json={}).status_code == 409


@RELOJ
def test_confirmar_crea_el_contrato_con_el_precio_guardado(client, admin, monkeypatch):
    from app.models.models import AuditEntry, SpaceLease
    from app.models.vender import CondicionesDeContrato, ReservaDeEspacio

    tp._plano(client, admin)
    (r,) = _reservar(client, admin, _entera("GON-02", 1_500_000, modo_precio="mensual", valor_tecleado=1_500_000))
    lista = client.get("/api/reservas", params={"sede": "NAVE"}, headers=admin).json()
    assert [(x["id"], x["espacio"], x["caduca"], x["caduca_pronto"]) for x in lista] == [
        (r["reserva_id"], "NAVE-GON-02", "2026-10-25", False)]

    enviados = _correos(monkeypatch, client, admin)
    c = client.post(f"/api/reservas/{r['reserva_id']}/confirmar", headers=admin, json={})
    assert c.status_code == 200, c.text
    lease_id = c.json()["lease_id"]
    db = tp._bd()
    try:
        lease = db.get(SpaceLease, lease_id)
        assert (lease.monthly_rent, lease.start_date, lease.supplier.name) == (
            1_500_000, date(2026, 11, 1), "Lácteos del Valle")
        reserva = db.get(ReservaDeEspacio, r["reserva_id"])
        assert (reserva.estado, reserva.lease_id) == ("confirmada", lease_id)
        assert db.get(CondicionesDeContrato, lease_id).modo_precio == "mensual"
        acciones = {a for (a,) in db.query(AuditEntry.accion)}
        assert {"reserva_espacio.alta", "reserva_espacio.confirmada", "contrato.alta"} <= acciones
    finally:
        db.close()
    assert client.get("/api/reservas", headers=admin).json() == []
    assert any("Valor del contrato" in h for _to, _a, h in enviados), "salen los avisos de un contrato"
    # Ya confirmada: no se confirma dos veces.
    assert client.post(f"/api/reservas/{r['reserva_id']}/confirmar", headers=admin, json={}).status_code == 409


@RELOJ
def test_confirmar_con_otro_valor_y_cancelar_libera(client, admin):
    from app.models.models import SpaceLease
    from app.models.vender import ReservaDeEspacio

    tp._plano(client, admin)
    (a,) = _reservar(client, admin, _entera("GON-02", 100_000))
    (b,) = _reservar(client, admin, _entera("NEV-03-PU1", 100_000))
    c = client.post(f"/api/reservas/{a['reserva_id']}/confirmar", headers=admin, json={"valor": 250_000})
    assert c.status_code == 200, c.text
    db = tp._bd()
    try:
        assert db.get(SpaceLease, c.json()["lease_id"]).monthly_rent == 250_000
    finally:
        db.close()

    assert client.delete(f"/api/reservas/{b['reserva_id']}", headers=admin).status_code == 204
    db = tp._bd()
    try:
        fila = db.get(ReservaDeEspacio, b["reserva_id"])
        assert fila.estado == "cancelada" and fila.baja_en is not None
    finally:
        db.close()
    _vender(client, admin, _pedido(_entera("NEV-03-PU1"), proveedor="Competidor SA"))
    assert client.delete(f"/api/reservas/{b['reserva_id']}", headers=admin).status_code == 409


@RELOJ
def test_el_mapa_comercial_la_da_tomada_y_al_trabajador_sin_plata(client, admin, worker):
    tp._plano(client, admin)
    _reservar(client, admin, _entera("GON-02", 777_000))
    suyo = client.get("/api/spaces/comercial", params={"sede": "NAVE"}, headers=admin).json()["NAVE-GON-02"]
    assert (suyo["status"], suyo["supplierName"], suyo["negotiatedValue"], suyo["reservaHasta"]) == (
        "occupied", "Lácteos del Valle", 777_000, "2026-10-25")
    crudo = client.get("/api/spaces/comercial", params={"sede": "NAVE"}, headers=worker)
    ajeno = crudo.json()["NAVE-GON-02"]
    assert ajeno["status"] == "occupied"
    assert (ajeno["supplierName"], ajeno["negotiatedValue"], ajeno["reservaHasta"]) == ("", 0, None)
    assert "777000" not in crudo.text and "Lácteos" not in crudo.text
    assert client.get("/api/reservas", headers=worker).status_code == 403
    assert client.post("/api/reservas/1/confirmar", headers=worker, json={}).status_code == 403
    assert client.delete("/api/reservas/1", headers=worker).status_code == 403


@RELOJ
def test_el_plano_no_saca_de_circulacion_algo_reservado(client, admin):
    tp._plano(client, admin)
    _reservar(client, admin, _entera("GON-02"))
    sin_gon_02 = [f for f in tp.PLANO if f["code"] != "GON-02"]
    r = client.put("/api/layout/NAVE", headers=admin, json={"fixtures": sin_gon_02, "base_updated_at": None})
    assert r.status_code == 409, r.text
    detalle = r.json()["detail"]
    assert detalle["code"] == "contratos_vivos"
    assert "tiene una reserva de Lácteos del Valle" in detalle["choques"][0]


@RELOJ
def test_reserva_y_contrato_no_se_mezclan_en_un_pedido(client, admin):
    """Todo el pedido es una reserva o todo es un contrato: el tipo es uno solo
    (no hay forma de mandarlos mezclados) y la reserva exige caducidad."""
    tp._plano(client, admin)
    sin = _vender(client, admin, _pedido(_entera("GON-02"), tipo="reserva"), codigo=422)
    assert sin["detail"]["code"] == "caduca"
    tarde = _vender(client, admin, _pedido(_entera("GON-02"), tipo="reserva", caduca=D(2026, 12, 5)), codigo=422)
    assert tarde["detail"]["code"] == "caduca", "caduca después del último día"


# ─── Una reserva que se cobra por ventas (decisión del dueño, 2026-10-20) ────

VENTAS = {"modo": "ventas", "porcentaje": 8, "corte": "mensual"}


@RELOJ
def test_la_reserva_de_espacio_por_ventas_nace_cobrando_por_ventas(client, admin):
    from app.models.models import SpaceLease
    from app.models.vender import CobroPorVenta

    tp._plano(client, admin)
    a = _vender(client, admin, _pedido({"espacio": "GON-02", "valor": 0}, tipo="reserva", caduca=D(2026, 10, 25),
                                       cobro=VENTAS))["reservas"][0]
    b = _vender(client, admin, _pedido({"espacio": "NEV-03-PU1"}, tipo="reserva", caduca=D(2026, 10, 25),
                                       cobro=VENTAS))["reservas"][0]
    lista = {x["id"]: x for x in client.get("/api/reservas", headers=admin).json()}
    assert lista[a["reserva_id"]]["cobro"] == {"modo": "ventas", "porcentaje": 8.0, "corte": "mensual"}

    c = client.post(f"/api/reservas/{a['reserva_id']}/confirmar", headers=admin, json={})
    assert c.status_code == 200, c.text
    # El cuerpo lo puede cambiar: con un valor, el contrato es fijo.
    d = client.post(f"/api/reservas/{b['reserva_id']}/confirmar", headers=admin, json={"valor": 300_000})
    assert d.status_code == 200, d.text
    db = tp._bd()
    try:
        assert db.get(SpaceLease, c.json()["lease_id"]).monthly_rent == 0
        cobro = db.get(CobroPorVenta, c.json()["lease_id"])
        assert (cobro.porcentaje, cobro.corte) == (8.0, "mensual")
        assert db.get(SpaceLease, d.json()["lease_id"]).monthly_rent == 300_000
        assert db.get(CobroPorVenta, d.json()["lease_id"]) is None
    finally:
        db.close()


@RELOJ
def test_la_reserva_de_porcentaje_por_ventas_nace_cobrando_por_ventas(client, admin):
    from app.models.models import SpaceLease
    from app.models.vender import CobroPorVenta, PrecioDeReserva

    tp._plano(client, admin)
    linea = {"participacion": {"cara": "GON-01", "puntos_basicos": 2500}, "valor": 0}
    _vender(client, admin, _pedido(linea, tipo="reserva", caduca=D(2026, 10, 25),
                                   cobro={"modo": "ventas", "porcentaje": 6.5, "corte": "al_final"}))
    t = tp._participacion(tp._cara(client, admin), 1)["terminos"][0]
    assert t["valor_acordado"] is None
    assert t["cobro_acordado"] == {"modo": "ventas", "porcentaje": 6.5, "corte": "al_final"}
    c = client.post(f"/api/participaciones/{t['id']}/confirmar", headers=admin, json={"version": t["version"]})
    assert c.status_code == 200, c.text
    lease_id = c.json()["termino"]["lease_id"]
    db = tp._bd()
    try:
        assert db.get(SpaceLease, lease_id).monthly_rent == 0
        assert (db.get(CobroPorVenta, lease_id).porcentaje, db.get(CobroPorVenta, lease_id).corte) == (6.5, "al_final")
        assert db.query(PrecioDeReserva).count() == 0
    finally:
        db.close()
