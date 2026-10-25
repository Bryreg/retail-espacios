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
    """La huella ENTERA que el renglón mostró: valor, fechas, proveedor, marca,
    cómo se cobra y, de un porcentaje, sus puntos básicos."""
    from app.models.models import SpaceLease
    from app.models.participaciones import Participacion
    from app.models.vender import CobroPorVenta

    db = tp._bd()
    try:
        lease = db.get(SpaceLease, lease_id)
        cobro = db.get(CobroPorVenta, lease_id)
        termino = db.query(Participacion).filter(Participacion.lease_id == lease_id).first()
        return {"valor": lease.monthly_rent, "desde": lease.start_date.isoformat(), "hasta": lease.end_date.isoformat(),
                "proveedor": lease.supplier.name if lease.supplier else "", "marca": lease.marca,
                "cobro": ({"modo": "ventas", "porcentaje": cobro.porcentaje, "corte": cobro.corte} if cobro is not None
                          else {"modo": "fijo"}),
                "puntos_basicos": termino.puntos_basicos if termino is not None else None}
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
    assert out["edicion"] == {"modo": "en_el_lugar", "lease_id": lease_id, "reemplazado_por": [], "sin_reenvio": False}
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

    # La huella ENTERA: valor, fechas, proveedor, marca, cómo se cobra y el %.
    for cambio in ({"valor": 4}, {"valor": 3.01}, {"hasta": D(2026, 10, 30)}, {"desde": D(2026, 10, 2)},
                   {"proveedor": "Alpina"}, {"marca": "Otra marca"}, {"marca": None},
                   {"cobro": {"modo": "ventas", "porcentaje": 8, "corte": "mensual"}}, {"puntos_basicos": 2500}):
        r = _editar(client, admin, vid, _entera("GON-02", 0, valor_tecleado=0), codigo=409, cobro=VENTAS,
                    esperado={**_esperado(vid), **cambio}, **fechas)
        assert r["detail"] == {"code": "contrato_cambio", "message": CAMBIO}, cambio
    # El ruido de un float que viajó por JSON no es un cambio, ni las
    # mayúsculas o los espacios de los costados del proveedor y la marca.
    _editar(client, admin, vid, _entera("GON-02", 0, valor_tecleado=0), validar=True, cobro=VENTAS,
            esperado={**_esperado(vid), "valor": 3.0000000001, "proveedor": "  lácteos del valle ",
                      "marca": "YOGUR VALLE "}, **fechas)
    # Lo que falta de la huella no se acepta (422): todos los campos son obligatorios.
    for falta in ("proveedor", "marca", "cobro", "puntos_basicos"):
        esp = {k: v for k, v in _esperado(vid).items() if k != falta}
        _editar(client, admin, vid, _entera("GON-02", 0, valor_tecleado=0), codigo=422, cobro=VENTAS,
                esperado=esp, **fechas)

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
                   esperado={"valor": 1, "desde": D(2026, 11, 1), "hasta": D(2026, 11, 30), "proveedor": "X",
                             "marca": None, "cobro": {"modo": "fijo"}, "puntos_basicos": None})["detail"]["code"] == \
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


def _sin_forma(lease_id):
    """Un contrato como los de antes de Vender: sin forma de precio guardada."""
    from app.models.vender import CondicionesDeContrato

    db = tp._bd()
    try:
        db.query(CondicionesDeContrato).filter(CondicionesDeContrato.lease_id == lease_id).delete()
        db.commit()
    finally:
        db.close()


@RELOJ
def test_pasar_a_al_mes_con_el_mismo_numero_no_reenvia(client, admin, monkeypatch):
    """Un contrato cargado antes de Vender guardó el valor del MES como si
    fuera el total. Editarlo a «Al mes» con el mismo número corrige cómo se
    lee: el total pasa a ser el mes × los meses y no sale ningún correo
    (decisión del dueño, 2026-10-25). Si además cambia el número, sí."""
    from app.models.vender import CondicionesDeContrato

    tp._plano(client, admin)
    enviados = _correos(monkeypatch, client, admin)
    lease_id = _vendido(client, admin, _entera("GON-02", 800_000), desde=D(2026, 8, 1), hasta=D(2027, 1, 31))["contratos"][0]["lease_id"]
    _planometria(client, admin, lease_id)
    _sin_forma(lease_id)
    enviados.clear()

    out = _editar(client, admin, lease_id, _entera("GON-02", 4_800_000, modo_precio="mensual", valor_tecleado=800_000),
                  desde=D(2026, 8, 1), hasta=D(2027, 1, 31))
    assert out["edicion"]["sin_reenvio"] is True and out["edicion"]["modo"] == "en_el_lugar"
    assert enviados == [], "sólo cambió cómo se lee el precio: no sale ningún correo"
    assert (out["avisos"]["comercial"], out["avisos"]["proveedor"], out["avisos"]["montaje"]) == ([], [], [])
    assert _lease(lease_id)["valor"] == 4_800_000
    c = _fila(CondicionesDeContrato, lease_id)
    assert (c["modo_precio"], c["valor_tecleado"]) == ("mensual", 800_000)
    ((_id, detalle),) = [x for x in _bitacora("contrato.editado") if x[0] == str(lease_id)]
    assert "sin reenvío" in detalle and "$ 800.000 al mes" in detalle

    # Y de vuelta a «Total» con el mismo número escrito: tampoco.
    out = _editar(client, admin, lease_id, _entera("GON-02", 800_000), desde=D(2026, 8, 1), hasta=D(2027, 1, 31))
    assert out["edicion"]["sin_reenvio"] is True and enviados == []
    # Cambiar el número (o algo más) es una edición de verdad: sale a todos.
    out = _editar(client, admin, lease_id, _entera("GON-02", 5_400_000, modo_precio="mensual", valor_tecleado=900_000),
                  desde=D(2026, 8, 1), hasta=D(2027, 1, 31))
    assert out["edicion"]["sin_reenvio"] is False and len(enviados) == 3


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


@RELOJ
def test_cambiar_de_proveedor_no_arrastra_el_correo_del_anterior(client, admin, monkeypatch):
    """Vender abre con el correo del proveedor cargado; si se cambia el nombre,
    ese correo seguía en el campo y viajaba: ``proveedor_por_nombre`` se lo daba
    al nuevo (o a uno que existía sin correo) y «Tu contrato cambió», con
    precio, le llegaba al de ANTES. Un ``correo`` igual al del proveedor
    anterior se ignora, y el del proveedor sale sólo al proveedor que queda."""
    from app.models.models import Supplier

    tp._plano(client, admin)
    enviados = _correos(monkeypatch, client, admin)
    # Uno que ya existe SIN correo.
    _vendido(client, admin, _entera("NEV-03-PU1", 200_000), proveedor="Postobón", correo=None)
    lease_id = _vendido(client, admin, _entera("GON-02", 500_000))["contratos"][0]["lease_id"]
    otro_id = _vendido(client, admin, _entera("NEV-03-PU2", 300_000))["contratos"][0]["lease_id"]
    _planometria(client, admin, lease_id)
    enviados.clear()

    def correo_de(nombre):
        db = tp._bd()
        try:
            return db.query(Supplier).filter(Supplier.name == nombre).one().email
        finally:
            db.close()

    # El caso exacto: el pedido trae el correo del anterior (como lo sembró Vender).
    out = _editar(client, admin, lease_id, _entera("GON-02", 500_000), proveedor="Alpina", correo="compras@valle.co")
    assert correo_de("Alpina") is None, "el proveedor nuevo se quedó con el correo del anterior"
    assert out["avisos"]["proveedor"] == []
    assert not [1 for to, _a, _h in enviados if "compras@valle.co" in to], "«Tu contrato cambió» salió al anterior"
    enviados.clear()
    # A uno que ya existía sin correo, tampoco.
    _editar(client, admin, otro_id, _entera("NEV-03-PU2", 300_000), proveedor="Postobón", correo="COMPRAS@valle.co ")
    assert correo_de("Postobón") is None
    assert not [1 for to, _a, _h in enviados if "compras@valle.co" in [x.lower() for x in to]]
    enviados.clear()
    # Otro correo, escrito a propósito para el nuevo: ése sí se usa, y es el único.
    out = _editar(client, admin, lease_id, _entera("GON-02", 500_000), proveedor="Alpina", correo="trade@alpina.co")
    assert correo_de("Alpina") == "trade@alpina.co"
    assert out["avisos"]["proveedor"] == ["trade@alpina.co"]
    destinos = [x for to, _a, _h in enviados for x in to]
    assert "trade@alpina.co" in destinos and "compras@valle.co" not in destinos
    (html,) = [h for to, _a, h in enviados if to == ["trade@alpina.co"]]
    assert "Hola, Alpina." in html and "Postobón" not in html and "Lácteos del Valle" not in html
    # El mismo proveedor de siempre sigue con su correo.
    assert correo_de("Lácteos del Valle") == "compras@valle.co"


@RELOJ
def test_dos_pestanas_con_el_mismo_esperado_la_segunda_es_409_y_un_solo_envio(client, admin, monkeypatch):
    """Dos pestañas abren el mismo contrato y las dos le cambian la marca (o el
    proveedor) sin tocar valor ni fechas: con un ``esperado`` de valor y fechas
    entraban las dos (200 y 200) y salían dos tandas de correos. Con la huella
    entera, la segunda es 409 ``contrato_cambio`` y no escribe ni avisa."""
    tp._plano(client, admin)
    enviados = _correos(monkeypatch, client, admin)
    lease_id = _vendido(client, admin, _entera("GON-02", 500_000))["contratos"][0]["lease_id"]
    _planometria(client, admin, lease_id)
    renglon = _esperado(lease_id)
    enviados.clear()
    cuerpo = {**_pedido(_entera("GON-02", 500_000), marca="Kumis Valle"),
              "edita": {"lease_id": lease_id, "esperado": renglon}}
    primera = client.post("/api/contratos/vender", headers=admin, json=cuerpo)
    segunda = client.post("/api/contratos/vender", headers=admin, json=cuerpo)
    assert primera.status_code == 200, primera.text
    assert segunda.status_code == 409 and segunda.json()["detail"] == {"code": "contrato_cambio", "message": CAMBIO}
    assert len(enviados) == 3, [a for _t, a, _h in enviados]
    assert len(_bitacora("contrato.editado")) == 1
    # Lo mismo con el proveedor.
    renglon = _esperado(lease_id)
    enviados.clear()
    cuerpo = {**_pedido(_entera("GON-02", 500_000), proveedor="Alpina", correo="trade@alpina.co", marca="Kumis Valle"),
              "edita": {"lease_id": lease_id, "esperado": renglon}}
    assert client.post("/api/contratos/vender", headers=admin, json=cuerpo).status_code == 200
    assert client.post("/api/contratos/vender", headers=admin, json=cuerpo).status_code == 409
    assert len({a for _t, a, _h in enviados}) == 2 and len(enviados) == 3, "dos tandas de correos"


@RELOJ
def test_el_proximo_contrato_de_una_cara_con_vigente_se_edita_por_su_id(client, admin, worker):
    """El mapa dibuja el vigente (``leaseId``); el próximo de la misma cara viene
    como ``proximoLeaseId``, sólo para quien administra, y se edita por ese id:
    el vigente no se toca."""
    tp._plano(client, admin)
    vid = _vendido(client, admin, _entera("GON-02", 900_000), desde=D(2026, 10, 1),
                   hasta=D(2026, 10, 31))["contratos"][0]["lease_id"]
    pid = _vendido(client, admin, _entera("GON-02", 1_500_000), proveedor="Alpina", marca="Bon Yurt",
                   desde=D(2026, 11, 1), hasta=D(2026, 11, 30))["contratos"][0]["lease_id"]
    mapa = client.get("/api/spaces/comercial", params={"sede": "NAVE"}, headers=admin).json()
    assert (mapa["NAVE-GON-02"]["leaseId"], mapa["NAVE-GON-02"]["proximoLeaseId"]) == (vid, pid)
    del_trabajador = client.get("/api/spaces/comercial", params={"sede": "NAVE"}, headers=worker).json()
    assert del_trabajador["NAVE-GON-02"]["leaseId"] is None
    assert del_trabajador["NAVE-GON-02"]["proximoLeaseId"] is None, "el trabajador ve el id del próximo"
    # Sin vigente no hay «próximo»: el que arranca es el que dibuja la fila.
    assert client.get("/api/spaces/comercial", params={"sede": "NAVE"},
                      headers=admin).json().get("NAVE-NEV-03") is None

    datos = client.get(f"/api/contratos/{pid}/edicion", headers=admin).json()
    assert (datos["proveedor"], datos["desde"], datos["valor"]) == ("Alpina", "2026-11-01", 1_500_000)
    _editar(client, admin, pid, _entera("GON-02", 1_600_000), proveedor="Alpina", marca="Bon Yurt",
            desde=D(2026, 11, 1), hasta=D(2026, 12, 15))
    assert _lease(pid)["valor"] == 1_600_000 and _lease(pid)["hasta"] == "2026-12-15"
    assert _lease(vid)["valor"] == 900_000 and _lease(vid)["hasta"] == "2026-10-31", "se tocó el vigente"
    # Nunca se pega al mueble ni viaja en el layout.
    from app.services.layout_lookup import CAMPOS_DE_CONTRATO
    assert "proximoLeaseId" in CAMPOS_DE_CONTRATO and "leaseId" in CAMPOS_DE_CONTRATO


@RELOJ
def test_el_409_de_vender_no_compara_con_la_tarifa_en_ninguna_parte(client, admin):
    """El 409 de ``POST /api/contratos/vender`` trae ``filas[].mensajes``: no se
    pintan, pero viajan al navegador de la pantalla que mira el proveedor. Con
    ``delante_del_proveedor`` no va ni «% por debajo de la tarifa de
    referencia» ni su monto, en NINGUNA parte de la respuesta (la vista previa,
    el guardado y una edición)."""
    import json

    tp._plano(client, admin)
    assert client.put("/api/layout/rates", headers=admin, json={
        "default": {t: 2_000_000 for t in ("gondola", "punta", "nevera_puertas", "nevera", "metro", "robatope")},
        "by_sede": {}}).status_code == 200
    _vendido(client, admin, _entera("GON-02", 1_000_000), proveedor="Postobón")
    lease_id = _vendido(client, admin, _entera("NEV-03", 1_000_000), desde=D(2026, 12, 1),
                        hasta=D(2026, 12, 31))["contratos"][0]["lease_id"]
    # Una línea que choca, con un precio muy por debajo de la tarifa (el
    # mensaje de la fila junta errores Y avisos).
    respuestas = [
        _vender(client, admin, _pedido(_entera("GON-02", 1), _entera("NEV-03-PU1", 1)), codigo=409),
        _vender(client, admin, _pedido(_entera("GON-02", 1)), codigo=409, validar=True),
        _editar(client, admin, lease_id, _entera("GON-02", 1), codigo=409),
        _editar(client, admin, lease_id, _entera("GON-02", 1), codigo=409, validar=True),
    ]
    for r in respuestas:
        assert r["detail"]["code"] == "contrato_invalido", r
        todo = json.dumps(r, ensure_ascii=False).lower()
        for prohibido in ("tarifa", "referencia", "por debajo", "2.000.000", "2000000"):
            assert prohibido not in todo, (prohibido, todo)
    # La planilla de administración sigue comparando (no es Vender).
    r = client.post("/api/leases/bulk/validar", headers=admin, json={"sede": "NAVE", "filas": [{
        "fila": 2, "espacio": "NEV-03-PU2", "sede": "NAVE", "proveedor": "Colombina", "valor": 1,
        "desde": D(2026, 11, 1), "hasta": D(2026, 11, 30)}]})
    fila = r.json()["filas"][0]
    assert any("por debajo de la tarifa" in m for m in fila["mensajes"]), fila


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
