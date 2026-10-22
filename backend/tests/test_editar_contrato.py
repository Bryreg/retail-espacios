"""«Editar contrato»: un contrato guardado se reabre en Vender y se guarda otra
vez (``POST /api/contratos/vender`` con ``edita``, ``docs/rediseno/vender-api.md``
§9, ``services/editar_contrato.py``).

El plano es el de ``test_participaciones`` (NAVE): ``GON-01`` se vende por
participación, ``GON-02`` entera, ``NEV-03`` entera o por puertas. «Hoy» es el
17 de octubre de 2026 en Colombia (marca ``reloj``). Todo ``import app.*`` va
adentro de las funciones (el fixture ``client`` purga ``sys.modules``).
"""
from tests import test_participaciones as tp
from tests.test_vender_contrato import _correos, _entera, _pct, _pedido, _planometria, _vender

RELOJ = tp.RELOJ
D = tp.D
CAMBIO = "Ese contrato cambió mientras lo editabas: recargá y volvé a intentar."
VENTAS = {"modo": "ventas", "porcentaje": 8, "corte": "mensual"}


def _esperado(lease_id):
    from app.models.models import SpaceLease

    db = tp._bd()
    try:
        lease = db.get(SpaceLease, lease_id)
        return {"valor": lease.monthly_rent, "desde": lease.start_date.isoformat(), "hasta": lease.end_date.isoformat()}
    finally:
        db.close()


def _editar(client, headers, lease_id, *lineas, codigo=200, esperado=None, validar=False, **extra):
    cuerpo = _pedido(*lineas, **extra)
    cuerpo["edita"] = {"lease_id": lease_id, "esperado": esperado if esperado is not None else _esperado(lease_id)}
    r = client.post("/api/contratos/vender" + ("?validar=1" if validar else ""), headers=headers, json=cuerpo)
    assert r.status_code == codigo, r.text
    return r.json()


def _vendido(client, admin, *lineas, **extra):
    return _vender(client, admin, _pedido(*lineas, **extra))


def _lease(lease_id):
    from app.models.models import SpaceLease

    db = tp._bd()
    try:
        L = db.get(SpaceLease, lease_id)
        return {"activo": L.is_active, "valor": L.monthly_rent, "desde": L.start_date.isoformat(),
                "hasta": L.end_date.isoformat(), "proveedor": L.supplier.name, "marca": L.marca,
                "espacio": L.space.code, "notas": L.notes}
    finally:
        db.close()


def _fila(modelo, clave):
    db = tp._bd()
    try:
        x = db.get(modelo, clave)
        return None if x is None else {k: getattr(x, k) for k in x.__table__.columns.keys()}
    finally:
        db.close()


def _bitacora(accion):
    from app.models.models import AuditEntry

    db = tp._bd()
    try:
        return [(a.entidad_id, a.detalle) for a in db.query(AuditEntry).filter(AuditEntry.accion == accion)]
    finally:
        db.close()


def _corte(client, admin, lease_id, desde, hasta, ventas=1_000_000):
    r = client.post(f"/api/cobros/{lease_id}/cortes", headers=admin,
                    json={"periodo_desde": desde, "periodo_hasta": hasta, "ventas": ventas})
    assert r.status_code == 201, r.text


# ─── En su lugar ──────────────────────────────────────────────────────────────

@RELOJ
def test_en_su_lugar_precio_proveedor_marca_y_fechas_con_lo_que_cuelga_intacto(client, admin):
    from app.models.models import LeaseFile
    from app.models.vender import CondicionesDeContrato, MontajePendiente

    tp._plano(client, admin)
    r = _vendido(client, admin, _entera("GON-02", 130_000), nota="Firmado en la feria")
    lease_id = r["contratos"][0]["lease_id"]
    _planometria(client, admin, lease_id)

    # El mapa comercial nombra EL contrato, sólo a quien administra.
    mapa = client.get("/api/spaces/comercial", params={"sede": "NAVE"}, headers=admin).json()
    assert mapa["NAVE-GON-02"]["leaseId"] == lease_id

    # La vista previa revisa sin escribir.
    nuevo = _entera("GON-02", 900_000, modo_precio="mensual", valor_tecleado=450_000)
    assert _editar(client, admin, lease_id, nuevo, validar=True, desde=D(2026, 11, 1), hasta=D(2026, 12, 31),
                   proveedor="Lácteos del Valle S.A.") == {"ok": True, "filas": []}
    assert _lease(lease_id)["valor"] == 130_000

    out = _editar(client, admin, lease_id, nuevo, desde=D(2026, 11, 1), hasta=D(2026, 12, 31),
                  proveedor="Lácteos del Valle S.A.", marca="Kumis Valle")
    assert out["edicion"] == {"modo": "en_el_lugar", "lease_id": lease_id, "reemplazado_por": []}
    assert out["contratos"] == [{"espacio": "NAVE-GON-02", "lease_id": lease_id}]
    L = _lease(lease_id)
    assert (L["activo"], L["valor"], L["desde"], L["hasta"], L["proveedor"], L["marca"]) == (
        True, 900_000, "2026-11-01", "2026-12-31", "Lácteos del Valle S.A.", "Kumis Valle")
    assert L["notas"] == "Firmado en la feria", "la nota interna no se toca"
    cond = _fila(CondicionesDeContrato, lease_id)
    assert (cond["modo_precio"], cond["valor_tecleado"]) == ("mensual", 450_000)
    # Lo que cuelga del contrato sigue colgado (mismo lease_id).
    db = tp._bd()
    try:
        assert db.query(LeaseFile).filter(LeaseFile.lease_id == lease_id).count() == 1
        assert db.query(MontajePendiente).count() == 0, "la planometría ya había disparado el montaje"
    finally:
        db.close()
    ((eid, detalle),) = _bitacora("contrato.editado")
    assert eid == str(lease_id)
    assert "Precio fijo $ 130.000 → Precio fijo $ 900.000 ($ 450.000 al mes)" in detalle
    assert "Fechas: 1 nov 2026 → 30 nov 2026 → 1 nov 2026 → 31 dic 2026" in detalle


@RELOJ
def test_fijo_a_ventas_de_uno_que_ya_arranco_y_el_desde_no_se_mueve(client, admin):
    from app.models.vender import CobroPorVenta

    tp._plano(client, admin)
    # Como los de POBLADO: «6» de valor fijo, que era el 6 %.
    lease_id = _vendido(client, admin, _entera("GON-02", 6), desde=D(2026, 8, 1), hasta=D(2027, 1, 31))["contratos"][0]["lease_id"]
    ventas = _entera("GON-02", 0, valor_tecleado=0)

    mal = _editar(client, admin, lease_id, ventas, codigo=422, cobro=VENTAS, desde=D(2026, 9, 1), hasta=D(2027, 1, 31))
    assert mal["detail"]["code"] == "desde_arrancado"
    assert "arrancó el 1 ago 2026" in mal["detail"]["message"]
    pasado = _editar(client, admin, lease_id, ventas, codigo=422, cobro=VENTAS, desde=D(2026, 8, 1),
                     hasta=D(2026, 10, 16))
    assert pasado["detail"]["code"] == "hasta_pasado"

    _editar(client, admin, lease_id, ventas, cobro=VENTAS, desde=D(2026, 8, 1), hasta=D(2027, 1, 31))
    assert _lease(lease_id)["valor"] == 0
    cobro = _fila(CobroPorVenta, lease_id)
    assert (cobro["porcentaje"], cobro["corte"]) == (8.0, "mensual")
    pendientes = client.get("/api/cobros/pendientes", params={"sede": "NAVE"}, headers=admin).json()
    assert [(p["periodo_desde"], p["periodo_hasta"]) for p in pendientes] == [
        ("2026-08-01", "2026-08-31"), ("2026-09-01", "2026-09-30")]


@RELOJ
def test_ventas_a_fijo_sin_cortes_y_con_cortes_y_el_corte_que_no_cambia(client, admin):
    from app.models.vender import CobroPorVenta

    tp._plano(client, admin)
    lease_id = _vendido(client, admin, _entera("GON-02", 0, valor_tecleado=0), cobro=VENTAS,
                        desde=D(2026, 8, 1), hasta=D(2027, 1, 31))["contratos"][0]["lease_id"]
    fechas = {"desde": D(2026, 8, 1), "hasta": D(2027, 1, 31)}

    # Sin cortes: pasa a fijo y su cobro por ventas se va.
    _editar(client, admin, lease_id, _entera("GON-02", 1_200_000), **fechas)
    assert _fila(CobroPorVenta, lease_id) is None and _lease(lease_id)["valor"] == 1_200_000
    # Y vuelve a ventas.
    _editar(client, admin, lease_id, _entera("GON-02", 0, valor_tecleado=0), cobro=VENTAS, **fechas)
    _corte(client, admin, lease_id, "2026-08-01", "2026-08-31")

    a_fijo = _editar(client, admin, lease_id, _entera("GON-02", 1_200_000), codigo=409, **fechas)
    assert a_fijo["detail"]["code"] == "tiene_cortes"
    otro_corte = _editar(client, admin, lease_id, _entera("GON-02", 0, valor_tecleado=0), codigo=409,
                         cobro={**VENTAS, "corte": "al_final"}, **fechas)
    assert otro_corte["detail"]["code"] == "tiene_cortes"
    assert "corte cada mes" in otro_corte["detail"]["message"]
    antes_del_corte = _editar(client, admin, lease_id, _entera("GON-02", 0, valor_tecleado=0), codigo=422,
                              cobro=VENTAS, desde=D(2026, 8, 1), hasta=D(2026, 8, 20))
    assert antes_del_corte["detail"]["code"] == "hasta_antes_del_corte"
    # El % sí cambia (vale para los cortes que vienen), y el «Hasta» se corre.
    _editar(client, admin, lease_id, _entera("GON-02", 0, valor_tecleado=0), cobro={**VENTAS, "porcentaje": 10},
            desde=D(2026, 8, 1), hasta=D(2027, 2, 28))
    assert _fila(CobroPorVenta, lease_id)["porcentaje"] == 10.0
    assert _lease(lease_id)["hasta"] == "2027-02-28"
    # Con cortes no cambia de forma ni de espacio.
    otra = _editar(client, admin, lease_id, _entera("NEV-03", 0, valor_tecleado=0), codigo=409, cobro=VENTAS,
                   desde=D(2026, 8, 1), hasta=D(2027, 2, 28))
    assert otra["detail"]["code"] == "tiene_cortes"


@RELOJ
def test_participacion_cambia_el_porcentaje_sin_contarse_a_si_misma(client, admin):
    from app.models.models import AuditEntry
    from app.models.participaciones import HistorialParticipacion, Participacion

    tp._plano(client, admin)
    r = _vendido(client, admin, _pct("GON-01", 2500, 600_000))
    (p,) = r["participaciones"]
    lease_id = p["lease_id"]
    tp._alta(client, admin, pb=6000, proveedor="Postobón", desde=D(2026, 11, 1), hasta=D(2026, 11, 30))
    db = tp._bd()
    try:
        t0 = db.query(Participacion).filter(Participacion.lease_id == lease_id).one()
        version0, numero0, space0 = t0.version, t0.numero, t0.space_id
    finally:
        db.close()

    # 25 % → 40 %: queda 40 % sin contarse a sí mismo (100 − 60).
    out = _editar(client, admin, lease_id, _pct("GON-01", 4000, 600_000))
    assert out["edicion"]["modo"] == "en_el_lugar"
    assert out["participaciones"][0]["espacio"] == "NAVE-GON-01-PC1"
    db = tp._bd()
    try:
        t = db.query(Participacion).filter(Participacion.lease_id == lease_id).one()
        assert (t.puntos_basicos, t.numero, t.space_id, t.version) == (4000, numero0, space0, version0 + 1)
        h = db.query(HistorialParticipacion).filter(HistorialParticipacion.accion == "contrato.editado").one()
        assert "valor" not in (h.antes_json or "") and "4000" in h.despues_json
        assert db.query(AuditEntry).filter(AuditEntry.accion == "contrato.editado").count() == 1
    finally:
        db.close()
    # 50 % ya no entra con el 60 % del otro: el 409 dice lo que queda, sin nombres.
    lleno = _editar(client, admin, lease_id, _pct("GON-01", 5000, 600_000), codigo=409)
    (fila,) = lleno["detail"]["filas"]
    assert (fila["code"], fila["queda_pb"]) == ("capacidad_excedida", 4000)
    assert "Postobón" not in fila["mensaje"]


# ─── Reemplazo ────────────────────────────────────────────────────────────────

@RELOJ
def test_entera_a_por_partes_cierra_el_viejo_como_reemplazado(client, admin):
    from app.models.models import AuditEntry, LeaseFile
    from app.models.vender import ContratoReemplazado, MontajePendiente

    tp._plano(client, admin)
    lease_id = _vendido(client, admin, _entera("NEV-03", 300_000), nota="Con exhibidor")["contratos"][0]["lease_id"]
    _planometria(client, admin, lease_id)

    out = _editar(client, admin, lease_id, _entera("NEV-03-PU1", 150_000), _entera("NEV-03-PU2", 150_000))
    assert out["edicion"]["modo"] == "reemplazo"
    nuevos = out["edicion"]["reemplazado_por"]
    assert [c["espacio"] for c in out["contratos"]] == ["NAVE-NEV-03-PU1", "NAVE-NEV-03-PU2"]
    assert sorted(c["lease_id"] for c in out["contratos"]) == sorted(nuevos)
    assert _lease(lease_id)["activo"] is False
    fila = _fila(ContratoReemplazado, lease_id)
    assert fila is not None and fila["por"]
    import json
    assert sorted(json.loads(fila["reemplazado_por"])) == sorted(nuevos)
    for n in nuevos:
        L = _lease(n)
        assert L["activo"] and L["notas"] == "Con exhibidor", "los nuevos se quedan con la nota interna del viejo"
    db = tp._bd()
    try:
        # Lo del viejo queda con el viejo; los nuevos vuelven a pedir planometría.
        assert db.query(LeaseFile).filter(LeaseFile.lease_id == lease_id).count() == 1
        assert sorted(m.lease_id for m in db.query(MontajePendiente).all()) == sorted(nuevos)
        assert db.query(AuditEntry).filter(AuditEntry.accion == "contrato.baja").count() == 0, "no es una baja"
    finally:
        db.close()
    assert len(_bitacora("contrato.reemplazado")) == 1
    assert out["avisos"]["montaje_pendiente"] == sorted(nuevos)
    # Ya no está activo: no se edita otra vez.
    assert _editar(client, admin, lease_id, _entera("NEV-03", 300_000), codigo=409)["detail"]["message"] == CAMBIO


@RELOJ
def test_entera_a_porcentaje_y_porcentaje_a_entera(client, admin):
    from app.models.participaciones import HistorialParticipacion, Participacion

    tp._plano(client, admin)
    lease_id = _vendido(client, admin, _entera("GON-02", 400_000))["contratos"][0]["lease_id"]
    out = _editar(client, admin, lease_id, _pct("GON-01", 3000, 400_000))
    assert out["edicion"]["modo"] == "reemplazo"
    (p,) = out["participaciones"]
    assert p["espacio"] == "NAVE-GON-01-PC1" and _lease(lease_id)["activo"] is False

    # Y el porcentaje, reemplazado por una cara entera: su término se da de
    # baja con el ciclo de siempre y el historial dice «reemplazado».
    out2 = _editar(client, admin, p["lease_id"], _entera("GON-02", 400_000))
    assert out2["edicion"]["modo"] == "reemplazo"
    db = tp._bd()
    try:
        t = db.query(Participacion).filter(Participacion.lease_id == p["lease_id"]).one()
        assert t.baja_en is not None
        assert db.query(HistorialParticipacion).filter(
            HistorialParticipacion.accion == "contrato.reemplazado").count() == 1
    finally:
        db.close()


# ─── Siempre EL contrato del renglón ─────────────────────────────────────────

@RELOJ
def test_esperado_que_no_coincide_o_cancelado_entretanto_y_el_proximo_nunca_se_toca(client, admin):
    tp._plano(client, admin)
    vigente = _vendido(client, admin, _entera("GON-02", 3), desde=D(2026, 10, 1), hasta=D(2026, 10, 31))
    proximo = _vendido(client, admin, _entera("GON-02", 1_500_000), desde=D(2026, 11, 1), hasta=D(2026, 11, 30))
    vid, pid = vigente["contratos"][0]["lease_id"], proximo["contratos"][0]["lease_id"]
    fechas = {"desde": D(2026, 10, 1), "hasta": D(2026, 10, 31)}

    for cambio in ({"valor": 4}, {"valor": 3.01}, {"hasta": D(2026, 10, 30)}, {"desde": D(2026, 10, 2)}):
        r = _editar(client, admin, vid, _entera("GON-02", 0, valor_tecleado=0), codigo=409, cobro=VENTAS,
                    esperado={**_esperado(vid), **cambio}, **fechas)
        assert r["detail"] == {"code": "contrato_cambio", "message": CAMBIO}
    # El ruido de un float que viajó por JSON no es un cambio.
    _editar(client, admin, vid, _entera("GON-02", 0, valor_tecleado=0), validar=True, cobro=VENTAS,
            esperado={**_esperado(vid), "valor": 3.0000000001}, **fechas)

    renglon = _esperado(vid)
    space_id = client.get("/api/spaces/by-code/NAVE-GON-02", headers=admin).json()["id"]
    assert client.delete(f"/api/spaces/{space_id}/leases/{vid}", headers=admin).status_code == 204
    r = _editar(client, admin, vid, _entera("GON-02", 0, valor_tecleado=0), codigo=409, cobro=VENTAS,
                esperado=renglon, **fechas)
    assert r["detail"]["code"] == "contrato_cambio"
    assert _lease(pid)["valor"] == 1_500_000, "se tocó el próximo"
    # El próximo, con lo suyo, sí se edita, y no choca consigo mismo.
    _editar(client, admin, pid, _entera("GON-02", 1_600_000), desde=D(2026, 11, 1), hasta=D(2026, 12, 15))
    assert _lease(pid)["valor"] == 1_600_000
    # Un contrato que no existe: 404.
    assert _editar(client, admin, 9999, _entera("GON-02", 1), codigo=404,
                   esperado={"valor": 1, "desde": D(2026, 11, 1), "hasta": D(2026, 11, 30)})["detail"]["code"] == \
        "contrato_no_existe"


@RELOJ
def test_no_choca_consigo_mismo_pero_si_con_otro_contrato(client, admin):
    tp._plano(client, admin)
    a = _vendido(client, admin, _entera("GON-02", 100_000))["contratos"][0]["lease_id"]
    _vendido(client, admin, _entera("GON-02", 100_000), proveedor="Alpina", desde=D(2026, 12, 1), hasta=D(2026, 12, 31))
    # Correrlo dentro de sus días o estirarlo hasta el 30: consigo mismo no choca.
    _editar(client, admin, a, _entera("GON-02", 120_000), desde=D(2026, 11, 5), hasta=D(2026, 11, 30))
    r = _editar(client, admin, a, _entera("GON-02", 120_000), codigo=409, desde=D(2026, 11, 5), hasta=D(2026, 12, 10))
    (fila,) = r["detail"]["filas"]
    assert fila["code"] == "linea_invalida" and "tomado del 1 dic al 31 dic" in fila["mensaje"]
    assert "Alpina" not in fila["mensaje"], "delante del proveedor no se nombra a nadie"


@RELOJ
def test_lo_que_una_edicion_no_puede_traer(client, admin):
    tp._plano(client, admin)
    lease_id = _vendido(client, admin, _entera("GON-02", 100_000))["contratos"][0]["lease_id"]
    assert _editar(client, admin, lease_id, _entera("GON-02", 1), codigo=422, nota="x")["detail"]["code"] == "edita_nota"
    assert _editar(client, admin, lease_id, _entera("GON-02", 1), codigo=422, tipo="reserva",
                   caduca=D(2026, 10, 20))["detail"]["code"] == "edita_tipo"
    dos = _editar(client, admin, lease_id, _entera("GON-02", 1), _entera("NEV-03", 1), codigo=422)
    assert dos["detail"]["code"] == "edita_lineas"
    r = client.post("/api/contratos/vender", headers=admin, json={
        **_pedido(_entera("GON-02", 1)), "edita": {"lease_id": lease_id, "esperado": _esperado(lease_id), "otro": 1}})
    assert r.status_code == 422, "campos de más"


# ─── Correos ──────────────────────────────────────────────────────────────────

@RELOJ
def test_los_tres_reciben_montaje_sin_precios_y_el_proveedor_solo_lo_suyo(client, admin, monkeypatch):
    tp._plano(client, admin)
    enviados = _correos(monkeypatch, client, admin)
    _vendido(client, admin, _entera("NEV-03-PU1", 777_000), proveedor="Alpina", correo="trade@alpina.co")
    lease_id = _vendido(client, admin, _entera("GON-02", 6), desde=D(2026, 8, 1), hasta=D(2027, 1, 31))["contratos"][0]["lease_id"]
    _planometria(client, admin, lease_id)   # el montaje de este ya salió
    enviados.clear()

    out = _editar(client, admin, lease_id, _entera("GON-02", 0, valor_tecleado=0), cobro=VENTAS,
                  desde=D(2026, 8, 1), hasta=D(2027, 1, 31))
    av = out["avisos"]
    assert (av["comercial"], av["proveedor"], av["montaje"], av["montaje_pendiente"]) == (
        ["g@x.co", "a@x.co"], ["compras@valle.co"], ["m@x.co"], [])
    por = {tuple(to): (asunto, html) for to, asunto, html in enviados}
    asunto, html = por[("g@x.co", "a@x.co")]
    assert asunto == "Contrato modificado — GON-02·A · NAVE"
    assert "Precio fijo $ 6" in html and "8 % de las ventas (corte mensual)" in html and "Lo cambió" in html
    asunto, html = por[("compras@valle.co",)]
    assert asunto.startswith("Tu contrato cambió: GON-02·A — ")
    assert "8 % de las ventas" in html and "Alpina" not in html and "777.000" not in html
    asunto, html = por[("m@x.co",)]
    assert asunto == "Contrato modificado — GON-02·A · NAVE"
    assert "$" not in html and "% de las ventas" not in html, "el de montaje no lleva plata"
    assert "?montar=" in html and "Lácteos del Valle" in html


@RELOJ
def test_el_montaje_espera_la_planometria_y_otro_proveedor_no_ve_lo_de_antes(client, admin, monkeypatch):
    tp._plano(client, admin)
    enviados = _correos(monkeypatch, client, admin)
    lease_id = _vendido(client, admin, _entera("GON-02", 500_000))["contratos"][0]["lease_id"]
    enviados.clear()
    out = _editar(client, admin, lease_id, _entera("GON-02", 500_000), proveedor="Alpina", correo="trade@alpina.co")
    assert out["avisos"]["montaje"] == [] and out["avisos"]["montaje_pendiente"] == [lease_id]
    assert not [1 for _to, a, _h in enviados if _to == ["m@x.co"]], "salió el montaje sin planometría"
    (html,) = [h for to, _a, h in enviados if to == ["trade@alpina.co"]]
    assert "Lácteos del Valle" not in html and "Alpina" in html


# ─── Quién puede ──────────────────────────────────────────────────────────────

@RELOJ
def test_solo_administracion_y_sin_lease_id_para_el_trabajador(client, admin, worker):
    tp._plano(client, admin)
    lease_id = _vendido(client, admin, _entera("GON-02", 100_000), nota="descuento del 25 %")["contratos"][0]["lease_id"]
    cuerpo = {**_pedido(_entera("GON-02", 1)), "edita": {"lease_id": lease_id, "esperado": _esperado(lease_id)}}
    assert client.post("/api/contratos/vender", headers=worker, json=cuerpo).status_code == 403
    assert client.post("/api/contratos/vender", json=cuerpo).status_code == 401
    assert client.get(f"/api/contratos/{lease_id}/edicion", headers=worker).status_code == 403
    assert client.get(f"/api/contratos/{lease_id}/edicion").status_code == 401
    mapa = client.get("/api/spaces/comercial", params={"sede": "NAVE"}, headers=worker).json()
    assert mapa["NAVE-GON-02"]["leaseId"] is None

    datos = client.get(f"/api/contratos/{lease_id}/edicion", headers=admin).json()
    assert (datos["espacio"], datos["forma"], datos["valor"], datos["modo_precio"], datos["cobro"]) == (
        "NAVE-GON-02", "entera", 100_000, "total", None)
    assert (datos["activo"], datos["arranco"], datos["correo"]) == (True, False, "compras@valle.co")
    assert "descuento" not in str(datos), "la nota interna no viaja a Vender"
    assert client.get("/api/contratos/9999/edicion", headers=admin).status_code == 404


def test_sin_migraciones_la_tabla_nueva_es_nueva():
    from app.models.vender import ContratoReemplazado
    from app.services.traspaso import TABLAS_DEL_CLIENTE

    assert ContratoReemplazado.__tablename__ == "contratos_reemplazados"
    assert "contratos_reemplazados" in TABLAS_DEL_CLIENTE


def test_los_periodos_de_corte_son_los_mismos_que_dice_vender():
    """``avisoDeCortes`` de Vender (``utils/edicionDeContrato.ts``) cuenta con la
    misma regla que ``cobros.periodos``: los mismos casos, los dos lados."""
    import json
    from datetime import date
    from pathlib import Path

    from app.services.cobros import periodos

    casos = json.loads((Path(__file__).resolve().parents[2] / "frontend/scripts/casos/cobro-por-ventas.json")
                       .read_text(encoding="utf-8"))["cortes"]
    assert len(casos) >= 10
    for c in casos:
        hoy = date.fromisoformat(c["hoy"])
        vencidos = [[a.isoformat(), b.isoformat()]
                    for a, b in periodos(date.fromisoformat(c["desde"]), date.fromisoformat(c["hasta"]), c["corte"])
                    if b < hoy]
        assert vencidos == c["vencidos"], c["por"]
