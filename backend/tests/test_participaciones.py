"""Participaciones de cara, pasos 4b y 4c: la API y los caminos de siempre (diseño
21-diseno-final.md §4.3, §4.4, §4.9, §5, §11, §13.2).

Un escenario por prueba, con varias aserciones encadenadas (cada prueba con
``client`` reimporta la app y crea una SQLite: ≈ 1–1,5 s). Los números de las
escenas con fechas son de la marca ``reloj``: «hoy» es el 17 de octubre de 2026
en Colombia. Para «pasa el tiempo» se usa ``time_machine.travel`` alrededor de
la segunda mitad y se vuelve a entrar (la sesión dura 12 h).

Los casos del pedido que se prueban por la API: A (30 % contratado y 20 %
dibujado → pendiente 10 % y lo disponible no lo ofrece), B (tres polígonos que
suman igual después de guardar y recargar), C (formas libres que se guardan),
D (dos marcas con fechas cruzadas que se pisan → 409 al confirmar y el
borrador queda), E (exceso → 409), G (lo vencido o cancelado deja de contar y
su zona pasa a historia) y H (dos sesiones con la misma versión → la segunda
recibe ``version_vieja``).

Todo ``import app.*`` va ADENTRO de las funciones (el fixture ``client`` purga
``sys.modules``).
"""
from datetime import date

import pytest

RELOJ = pytest.mark.reloj("2026-10-17T15:00:00+00:00")


def D(y, m, d) -> str:
    return date(y, m, d).isoformat()


def _mueble(code, tipo, w, d, h, cx, division="participacion", **extra):
    f = {"id": f"f-{code}", "code": code, "sede": "NAVE", "type": tipo, "label": extra.pop("label", code),
         "cx": cx, "cz": 2, "rotY": 0, "w": w, "d": d, "h": h, "color": "#818cf8", **extra}
    if division:
        f["partes"] = {"division": division}
    return f


GON_01 = _mueble("GON-01", "gondola", 0.9, 0.9, 1.8, 2, label="Góndola 1", gondolaType="double")
GON_02 = _mueble("GON-02", "gondola", 0.9, 0.9, 1.8, 4, division=None, label="Góndola 2", gondolaType="double")
PUN_01 = _mueble("PUN-01", "punta", 0.9, 0.4, 1.8, 6, label="Punta 1")
MET_01 = _mueble("MET-01", "metro", 1, 1, 0.05, 8, label="Metro 1")
MET_02 = _mueble("MET-02", "metro", 1, 1, 0.05, 10, label="Metro 2")
NEV_03 = {**_mueble("NEV-03", "nevera_puertas", 2.07, 0.7, 2.1, 12, label="Nevera"),
          "partes": {"puertas": 3, "division": "puertas"}}
ROB_01 = _mueble("ROB-01", "robatope", 0.3, 0.4, 1.6, 14, label="Robatope 1")
PLANO = [GON_01, GON_02, PUN_01, MET_01, MET_02, NEV_03, ROB_01]


def _plano(client, admin, fixtures=PLANO):
    r = client.put("/api/layout/NAVE", headers=admin, json={"fixtures": fixtures, "base_updated_at": None})
    assert r.status_code == 200, r.text


def _entrar(client):
    """Una sesión nueva de administrador (después de viajar en el tiempo)."""
    from conftest import CLAVE_ADMIN, _token

    return {"Authorization": f"Bearer {_token(client, CLAVE_ADMIN)}"}


def _alta(client, admin, espacio="GON-01", tipo="contrato", pb=2500, desde=D(2026, 11, 1), hasta=D(2027, 1, 31),
          proveedor="Postobón", marca="Hit", caduca=None, valor=1_200_000, codigo=201, **extra):
    cuerpo = {"sede": "NAVE", "espacio": espacio, "tipo": tipo, "proveedor": proveedor, "marca": marca,
              "puntos_basicos": pb, "desde": desde, "hasta": hasta}
    if tipo == "reserva":
        cuerpo["caduca"] = caduca or D(2026, 10, 25)
    else:
        cuerpo["valor_mensual"] = valor
    cuerpo.update(extra)
    r = client.post("/api/participaciones/", headers=admin, json=cuerpo)
    assert r.status_code == codigo, r.text
    return r.json()


def _cara(client, admin, espacio="GON-01", **q):
    r = client.get("/api/participaciones/cara", headers=admin, params={"sede": "NAVE", "espacio": espacio, **q})
    assert r.status_code == 200, r.text
    return r.json()


def _zonas(*pares):
    return [{"participacion_space_id": s, "vertices": v} for s, v in pares]


def _distribuir(client, admin, accion, espacio, version, zonas, codigo=200, **extra):
    cuerpo = {"sede": "NAVE", "espacio": espacio, "version": version, **extra}
    if accion != "descartar":
        cuerpo["zonas"] = zonas
    if accion == "borrador":
        r = client.put("/api/participaciones/distribucion/borrador", headers=admin, json=cuerpo)
    else:
        r = client.post(f"/api/participaciones/distribucion/{accion}", headers=admin, json=cuerpo)
    assert r.status_code == codigo, r.text
    return r.json()


def _rect(u0, u1, v0=0.0, v1=1.0):
    return [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]


def _util(sup):
    """El tramo útil en u de un frente (entre los parantes)."""
    izq = max((e["u1"] for e in sup["exclusiones"] if e["por"] == "parante" and e["u0"] == 0), default=0.0)
    der = min((e["u0"] for e in sup["exclusiones"] if e["por"] == "parante" and e["u1"] == 1), default=1.0)
    return izq, der


def _franja(sup, a, b):
    """La franja de ``a`` a ``b`` (fracciones del ancho útil), de arriba abajo:
    pisa zócalo y remate, que no suman."""
    izq, der = _util(sup)
    return _rect(izq + a * (der - izq), izq + b * (der - izq))


def _dibujado(sup, *zonas):
    from app.services.zonas_geometria import dibujado_pb, limpiar

    return dibujado_pb([limpiar(z) for z in zonas], sup["exclusiones"])


def _codigos(problemas):
    return [p["codigo"] for p in problemas]


def _participacion(bloque, numero):
    return next(p for p in bloque["participaciones"] if p["numero"] == numero)


def _bd():
    from app.database import SessionLocal

    return SessionLocal()


# ─── 1 · Alta y numeración ────────────────────────────────────────────────────

@RELOJ
def test_alta_numera_crea_los_espacios_y_un_contrato_no_copia_lo_del_lease(client, admin, monkeypatch):
    import app.routers.bulk_leases as bl
    from app.models.models import AuditEntry, Space, SpaceLease, SpaceStatus
    from app.models.participaciones import HistorialParticipacion, Participacion

    enviados = []
    monkeypatch.setattr(bl, "correo_configurado", lambda: True)
    monkeypatch.setattr(bl, "send_mail_to_bg", lambda to, asunto, html: enviados.append((to, asunto, html)))
    _plano(client, admin)

    reserva = _alta(client, admin, tipo="reserva", caduca=D(2026, 10, 25))
    t = reserva["termino"]
    assert (t["codigo"], t["numero"], t["cara"], t["estado"], t["estado_visible"]) == (
        "NAVE-GON-01-PC1", 1, "A", "reserva", "reserva")
    assert t["proveedor"]["nombre"] == "Postobón" and t["valor_mensual"] is None and t["caduca"] == "2026-10-25"
    assert reserva["avisos"] is None and enviados == [], "una reserva no manda correos"
    assert reserva["cara"]["codigo_cara"] == "NAVE-GON-01"

    contrato = _alta(client, admin, proveedor="Alpina", marca="Yogurt", pb=2000, correo="trade@alpina.co")
    t2 = contrato["termino"]
    assert (t2["codigo"], t2["estado"], t2["estado_visible"]) == ("NAVE-GON-01-PC2", "contrato", "firmado")
    assert (t2["proveedor"]["nombre"], t2["marca"], t2["desde"], t2["hasta"], t2["valor_mensual"]) == (
        "Alpina", "Yogurt", "2026-11-01", "2027-01-31", 1_200_000.0)
    assert contrato["avisos"]["proveedor"] == ["trade@alpina.co"]
    assert len(enviados) == 1 and "Participación 2 · 20 % de la cara A" in enviados[0][2]

    db = _bd()
    try:
        fila = db.query(Participacion).filter_by(numero=2).one()
        # La verdad de proveedor, marca y fechas es el lease: el término no la copia.
        assert (fila.supplier_id, fila.marca, fila.desde, fila.hasta, fila.caduca) == (None,) * 5
        lease = db.get(SpaceLease, fila.lease_id)
        pc = db.get(Space, fila.space_id)
        assert lease.space_id == pc.id and lease.marca == "Yogurt" and lease.monthly_rent == 1_200_000
        assert (pc.code, pc.svg_id, pc.area_m2, pc.status, pc.sede, pc.zone) == (
            "NAVE-GON-01-PC2", "NAVE-GON-01-PC2", 0.0, SpaceStatus.free, "NAVE", "gondola")
        assert pc.name == "Góndola 1 · Participación 2 · cara A"
        cara = db.query(Space).filter_by(code="NAVE-GON-01").one()
        assert (cara.status, cara.area_m2, cara.name) == (SpaceStatus.free, 0.81, "Góndola 1")
        historial = db.query(HistorialParticipacion).order_by(HistorialParticipacion.id).all()
        assert [(h.tipo, h.accion) for h in historial] == [
            ("contractual", "participacion.reserva"), ("contractual", "participacion.contrato")]
        assert "valor" not in (historial[1].despues_json or "") and "1200000" not in (historial[1].despues_json or "")
        acciones = [a for (a,) in db.query(AuditEntry.accion).filter(AuditEntry.accion.like("participacion.%"))]
        assert sorted(acciones) == ["participacion.contrato", "participacion.reserva"]
    finally:
        db.close()

    # PC1 cancelada: su número no se reutiliza.
    r = client.post(f"/api/participaciones/{t['id']}/cancelar", headers=admin, json={"version": t["version"]})
    assert r.status_code == 200, r.text
    assert r.json()["termino"]["estado"] == "reserva_cancelada"
    assert _alta(client, admin, pb=1000)["termino"]["codigo"] == "NAVE-GON-01-PC3"

    # Una fila …-PC5 creada a mano y una archivada …-PC7#12 cuentan.
    db = _bd()
    try:
        for codigo in ("NAVE-GON-01-PC5", "NAVE-GON-01-PC7#12"):
            db.add(Space(code=codigo, svg_id=codigo, name=codigo, zone="gondola", sede="NAVE", area_m2=0.0,
                         status=SpaceStatus.free))
        db.commit()
    finally:
        db.close()
    assert _alta(client, admin, pb=1000)["termino"]["codigo"] == "NAVE-GON-01-PC8"
    # La B numera aparte.
    assert _alta(client, admin, espacio="GON-01-B", pb=1000)["termino"]["codigo"] == "NAVE-GON-01-B-PC1"

    bloque = _cara(client, admin)
    assert [p["numero"] for p in bloque["participaciones"]] == [1, 2, 3, 8]
    assert _participacion(bloque, 2)["terminos"][0]["proveedor"]["nombre"] == "Alpina"
    assert bloque["capacidad"]["periodo"]["pico_pb"] == 2000 + 1000 + 1000

    # La regla de códigos lee PC1…PC99: con la 99 usada (aunque sea a mano) la cara está llena, y no se crea
    # una PC100 que nadie sabría partir.
    db = _bd()
    try:
        db.add(Space(code="NAVE-GON-01-PC99", svg_id="NAVE-GON-01-PC99", name="x", zone="gondola", sede="NAVE",
                     area_m2=0.0, status=SpaceStatus.free))
        db.commit()
    finally:
        db.close()
    r = client.post("/api/participaciones/", headers=admin, json={
        "sede": "NAVE", "espacio": "GON-01", "tipo": "contrato", "proveedor": "Colanta", "puntos_basicos": 100,
        "desde": D(2026, 11, 1), "hasta": D(2026, 11, 30), "valor_mensual": 1})
    assert (r.status_code, r.json()["detail"]["code"]) == (409, "cara_llena"), r.text
    assert [p["numero"] for p in _cara(client, admin)["participaciones"]] == [1, 2, 3, 8]


# ─── 2 · Capacidad ────────────────────────────────────────────────────────────

@RELOJ
def test_la_capacidad_suma_lo_que_cuenta_cada_dia_y_nada_mas(client, admin):
    _plano(client, admin)
    # Los 422 del alta, en el orden de la tabla (§5.3): nada llega a la base.
    base = {"sede": "NAVE", "espacio": "GON-01", "proveedor": "Postobón", "puntos_basicos": 2500}
    for cuerpo, frase in (
        ({**base, "tipo": "contrato", "desde": D(2026, 11, 2), "hasta": D(2026, 11, 1), "valor_mensual": 1},
         "La fecha de inicio no puede ser posterior a la de fin"),
        ({**base, "tipo": "reserva", "desde": D(2026, 10, 1), "hasta": D(2026, 10, 16), "caduca": D(2026, 10, 16)},
         "Una reserva provisional tiene que terminar hoy o después."),
        ({**base, "tipo": "reserva", "desde": D(2026, 11, 1), "hasta": D(2026, 11, 30)},
         "La reserva tiene que caducar entre hoy y el último día que reserva."),
        ({**base, "tipo": "reserva", "desde": D(2026, 11, 1), "hasta": D(2026, 11, 30), "caduca": D(2026, 12, 1)},
         "La reserva tiene que caducar entre hoy y el último día que reserva."),
        ({**base, "tipo": "contrato", "desde": D(2026, 11, 1), "hasta": D(2026, 11, 30)},
         "Escribí el valor mensual del contrato."),
        ({**base, "tipo": "contrato", "desde": D(2026, 11, 1), "hasta": D(2026, 11, 30), "valor_mensual": -1},
         "Escribí el valor mensual del contrato."),
        ({**base, "espacio": "GON-09", "tipo": "contrato", "desde": D(2026, 11, 2), "hasta": D(2026, 11, 1),
          "valor_mensual": 1}, "La fecha de inicio no puede ser posterior a la de fin"),
    ):
        r = client.post("/api/participaciones/", headers=admin, json=cuerpo)
        assert r.status_code == 422 and r.json()["detail"]["message"] == frase, (cuerpo, r.text)
    for malo in ({"puntos_basicos": 0}, {"puntos_basicos": 10001}, {"puntos_basicos": 25.5}, {"proveedor": "  "},
                 {"campo_de_mas": 1}, {"tipo": "regalo"}):
        r = client.post("/api/participaciones/", headers=admin, json={
            **base, "tipo": "contrato", "desde": D(2026, 11, 1), "hasta": D(2026, 11, 30), "valor_mensual": 1, **malo})
        assert r.status_code == 422 and isinstance(r.json()["detail"], list), (malo, r.text)
    r = client.post("/api/participaciones/", headers=admin, json={
        **base, "tipo": "reserva", "desde": D(2026, 11, 1), "hasta": D(2026, 11, 30), "caduca": D(2026, 10, 25),
        "valor_mensual": 1})
    assert r.status_code == 422 and r.json()["detail"]["code"] == "valor_mensual", r.text
    r = client.post("/api/participaciones/", headers=admin, json={
        **base, "tipo": "contrato", "desde": D(2026, 11, 1), "hasta": D(2026, 11, 30), "caduca": D(2026, 10, 25),
        "valor_mensual": 1})
    assert r.status_code == 422 and r.json()["detail"]["code"] == "caduca", r.text
    assert _cara(client, admin)["participaciones"] == []

    _alta(client, admin, pb=6000, desde=D(2026, 11, 1), hasta=D(2026, 12, 31))
    r = client.post("/api/participaciones/", headers=admin, json={
        "sede": "NAVE", "espacio": "GON-01", "tipo": "contrato", "proveedor": "Alpina", "puntos_basicos": 5000,
        "desde": D(2026, 11, 15), "hasta": D(2026, 11, 30), "valor_mensual": 1})
    assert r.status_code == 409, r.text
    detalle = r.json()["detail"]
    assert (detalle["code"], detalle["dia"], detalle["disponible_pb"]) == ("capacidad_excedida", "2026-11-15", 4000)
    assert "Postobón" not in detalle["message"] and "15 nov 2026" in detalle["message"]
    # 60 + 40 entra justo: la participación 1 con contrato vivo no es «física».
    _alta(client, admin, pb=4000, desde=D(2026, 11, 15), hasta=D(2026, 11, 30), proveedor="Alpina")

    # Dos que no se cruzan en fechas no suman.
    _alta(client, admin, espacio="GON-01-B", pb=6000, desde=D(2026, 11, 1), hasta=D(2026, 11, 30))
    _alta(client, admin, espacio="GON-01-B", pb=6000, desde=D(2026, 12, 1), hasta=D(2026, 12, 31), proveedor="Alpina")

    # Un contrato cancelado por el camino de siempre deja de contar.
    pc1 = _alta(client, admin, espacio="MET-01", pb=7000, desde=D(2026, 11, 1), hasta=D(2026, 11, 30))["termino"]
    _alta(client, admin, espacio="MET-01", pb=4000, desde=D(2026, 11, 1), hasta=D(2026, 11, 30), codigo=409)
    r = client.delete(f"/api/spaces/{pc1['space_id']}/leases/{pc1['lease_id']}", headers=admin)
    assert r.status_code == 204, r.text
    _alta(client, admin, espacio="MET-01", pb=4000, desde=D(2026, 11, 1), hasta=D(2026, 11, 30))

    # Una reserva viva cuenta; caducada, no.
    _alta(client, admin, espacio="PUN-01", tipo="reserva", pb=8000, desde=D(2026, 11, 1), hasta=D(2026, 11, 30),
          caduca=D(2026, 10, 20))
    _alta(client, admin, espacio="PUN-01", pb=3000, desde=D(2026, 11, 1), hasta=D(2026, 11, 30), codigo=409)
    import time_machine

    # La defensa en profundidad de los caminos de siempre (4c): la cara con participaciones vivas.
    from app.services.participaciones import bloqueo_por_participaciones

    db = _bd()
    try:
        frase = bloqueo_por_participaciones(db, "NAVE", "GON-01", date(2026, 11, 10), date(2026, 11, 20))
        # Sin cuántos términos: delante del proveedor eso cuenta a los demás.
        assert frase == ("«GON-01» se vende por participación del 10 nov 2026 al 20 nov 2026: en esas fechas no "
                         "se vende entera ni por partes.")
        assert "Postobón" not in frase and "Alpina" not in frase
        # La forma completa, una división y la B (con sus propios términos) también; una pieza o una PC, no.
        assert bloqueo_por_participaciones(db, "NAVE", "NAVE-GON-01-TR1", date(2026, 11, 10), date(2026, 11, 20))
        assert "GON-01-B" in bloqueo_por_participaciones(db, "NAVE", "GON-01-B", date(2026, 12, 5), date(2026, 12, 6))
        assert bloqueo_por_participaciones(db, "NAVE", "NAVE-GON-01-PC1", date(2026, 11, 10), date(2026, 11, 20)) is None
        assert bloqueo_por_participaciones(db, "NAVE", "GON-01", date(2027, 2, 1), date(2027, 2, 28)) is None
        assert bloqueo_por_participaciones(db, "NAVE", "GON-01", date(2026, 9, 1), date(2026, 9, 30)) is None
        assert bloqueo_por_participaciones(db, "NAVE", "GON-02", date(2026, 11, 1), date(2026, 11, 30)) is None
        assert bloqueo_por_participaciones(db, "NAVE", "NAVE-SIN-MUEBLE", date(2026, 11, 1), date(2026, 11, 30)) is None
    finally:
        db.close()

    with time_machine.travel("2026-10-21T15:00:00+00:00", tick=True):
        otra = _entrar(client)
        bloque = _cara(client, otra, espacio="PUN-01")
        assert bloque["participaciones"][0]["terminos"][0]["estado_visible"] == "reserva_caducada"
        assert bloque["capacidad"]["periodo"]["pico_pb"] == 0 and bloque["capacidad"]["intervalos"] == []
        ocupacion = client.get("/api/participaciones/ocupacion", headers=otra, params={"sede": "NAVE"}).json()
        assert ocupacion["caras"]["NAVE-PUN-01"] == {"intervalos": [], "fisicos": []}
        # La caducidad no se escribe: el historial la deriva de la fecha (D6).
        derivados = client.get("/api/participaciones/historial", headers=otra,
                               params={"sede": "NAVE", "espacio": "PUN-01"}).json()["derivados"]
        # El día de Colombia en `dia`; `en` es su medianoche en Colombia, en UTC (contrato del historial).
        assert [(d["accion"], d["dia"], d["en"], d["derivado"]) for d in derivados] == [
            ("reserva.caducada", "2026-10-21", "2026-10-21T05:00:00+00:00", True)]
        _alta(client, otra, espacio="PUN-01", pb=3000, desde=D(2026, 11, 1), hasta=D(2026, 11, 30))


# ─── 3 · Cara vendida entera y lease huérfano ─────────────────────────────────

@RELOJ
def test_lo_vendido_entero_y_el_lease_huerfano_cuentan_como_la_cara_entera(client, admin):
    from app.models.models import Space, SpaceLease, SpaceStatus, Supplier

    _plano(client, admin)
    r = client.post("/api/leases/bulk/confirmar", headers=admin, json={"sede": "NAVE", "filas": [{
        "fila": 1, "espacio": "GON-02", "sede": "NAVE", "proveedor": "Colombina", "valor": 500_000,
        "desde": D(2026, 10, 1), "hasta": D(2026, 11, 15)}]})
    assert r.status_code == 200 and r.json()["creados"] == 1, r.text
    # El plano la pasa a participación con el contrato entero vivo: el guardado lo deja.
    _plano(client, admin, [{**f, "partes": {"division": "participacion"}} if f["code"] == "GON-02" else f
                           for f in PLANO])
    r = client.post("/api/participaciones/", headers=admin, json={
        "sede": "NAVE", "espacio": "GON-02", "tipo": "contrato", "proveedor": "Alpina", "puntos_basicos": 3000,
        "desde": D(2026, 11, 1), "hasta": D(2026, 11, 30), "valor_mensual": 1})
    assert r.status_code == 409, r.text
    assert r.json()["detail"]["code"] == "cara_vendida_entera"
    assert "del 1 oct 2026 al 15 nov 2026" in r.json()["detail"]["message"]
    assert "Colombina" not in r.json()["detail"]["message"]
    _alta(client, admin, espacio="GON-02", pb=3000, desde=D(2026, 11, 16), hasta=D(2026, 11, 30))
    capacidad = _cara(client, admin, espacio="GON-02")["capacidad"]
    assert (capacidad["hoy_pb"], capacidad["disponible_hoy_pb"]) == (10000, 0)
    assert capacidad["fisicos"] == [{"codigo": "NAVE-GON-02", "desde": "2026-10-01", "hasta": "2026-11-15",
                                     "huerfano": False}]
    # La ocupación anónima (Vender, Supervisar, el plano) también la lleva, sin código: no se pinta libre.
    ocupacion = client.get("/api/participaciones/ocupacion", headers=admin, params={"sede": "NAVE"}).json()
    assert ocupacion["caras"]["NAVE-GON-02"] == {
        "intervalos": [{"desde": "2026-11-16", "hasta": "2026-11-30", "pb": 3000}],
        "fisicos": [{"desde": "2026-10-01", "hasta": "2026-11-15"}]}

    # Un lease de participación sin término (insertado a mano) cuenta como la cara entera.
    db = _bd()
    try:
        pc = Space(code="NAVE-GON-01-PC4", svg_id="NAVE-GON-01-PC4", name="x", zone="gondola", sede="NAVE",
                   area_m2=0.0, status=SpaceStatus.free)
        sup = Supplier(name="Huérfano SA")
        db.add_all([pc, sup])
        db.flush()
        db.add(SpaceLease(space_id=pc.id, supplier_id=sup.id, start_date=date(2026, 11, 1),
                          end_date=date(2026, 11, 30), monthly_rent=1, is_active=True))
        db.commit()
    finally:
        db.close()
    capacidad = _cara(client, admin)["capacidad"]
    assert [f["huerfano"] for f in capacidad["fisicos"]] == [True]
    assert capacidad["periodo"]["disponible_pb"] == 0
    # Con un período que termina antes, lo físico de después igual viaja (la vista previa del formulario
    # no puede decir «entra» donde el servidor dice cara_vendida_entera), y el período no cambia.
    corto = _cara(client, admin, hasta=D(2026, 10, 31))["capacidad"]
    assert [f["huerfano"] for f in corto["fisicos"]] == [True] and corto["periodo"]["disponible_pb"] == 10000
    r = client.post("/api/participaciones/", headers=admin, json={
        "sede": "NAVE", "espacio": "GON-01", "tipo": "contrato", "proveedor": "Alpina", "puntos_basicos": 1000,
        "desde": D(2026, 11, 10), "hasta": D(2026, 11, 20), "valor_mensual": 1})
    assert r.status_code == 409 and r.json()["detail"]["code"] == "cara_vendida_entera", r.text
    assert "sin término" in r.json()["detail"]["message"]
    # Fuera de sus fechas, sí: y la numeración salta la fila PC4 que ya existe.
    assert _alta(client, admin, pb=1000, desde=D(2026, 12, 1), hasta=D(2026, 12, 31))["termino"]["numero"] == 5
    r = client.get("/api/participaciones/resumen", headers=admin, params={"sede": "NAVE"})
    assert r.status_code == 200, r.text
    assert r.json()["totales"]["huerfanos"] == 1


# ─── 4 · La compuerta en los caminos de siempre ───────────────────────────────

def _suelto(client, admin, code, desde=D(2026, 11, 1), hasta=D(2026, 11, 30)):
    """Un contrato suelto (`POST /spaces/{id}/leases`) sobre el espacio ``code``."""
    s = client.post("/api/spaces/find-or-create", headers=admin,
                    json={"code": code, "name": code, "zone": "Z", "sede": "NAVE", "area_m2": 1})
    assert s.status_code in (200, 201), s.text
    sup = client.post("/api/suppliers/find-or-create", headers=admin, json={"name": "Colombina"}).json()
    return client.post(f"/api/spaces/{s.json()['id']}/leases", headers=admin, json={
        "supplier_id": sup["id"], "start_date": desde, "end_date": hasta, "monthly_rent": 1})


def _planilla(client, admin, espacio, desde=D(2026, 11, 1), hasta=D(2026, 11, 30), paso="validar"):
    r = client.post(f"/api/leases/bulk/{paso}", headers=admin, json={"sede": "NAVE", "filas": [{
        "fila": 2, "espacio": espacio, "sede": "NAVE", "proveedor": "Colombina", "valor": 500_000,
        "desde": desde, "hasta": hasta}]})
    assert r.status_code == 200, r.text
    return r.json()


def _vendido_en_el_json(f, proveedor="Colombina", desde=D(2026, 11, 1), hasta=D(2026, 11, 30)):
    """Un mueble con un contrato que vive SÓLO en el JSON del plano (lo que
    `PUT /layout` ya no acepta: se escribe directo en la base)."""
    return {**f, "status": "occupied", "supplierName": proveedor, "startDate": desde, "endDate": hasta,
            "negotiatedValue": 100}


def _plano_en_la_base(fixtures):
    """El plano escrito directo en la base, sin pasar por las guardas del guardado."""
    import json

    from app.models.models import LayoutSnapshot

    db = _bd()
    try:
        db.query(LayoutSnapshot).filter_by(sede="NAVE").one().fixtures_json = json.dumps(fixtures)
        db.commit()
    finally:
        db.close()


def _leases():
    from app.models.models import SpaceLease

    db = _bd()
    try:
        return db.query(SpaceLease).count()
    finally:
        db.close()


@RELOJ
def test_la_compuerta_frena_la_cara_entera_y_la_participacion_en_los_caminos_de_siempre(client, admin):
    _plano(client, admin)
    pc = _alta(client, admin)["termino"]
    antes = _leases()

    # Contrato suelto: la cara entera de una cara por participación, la participación misma (existe, pero se
    # carga en Distribución), el código corto de la cara y una participación de una cara que no se vende así.
    for code, frase in (("NAVE-GON-01", "se vende por participación: el porcentaje se vende en Vender"),
                        ("NAVE-GON-01-PC1", "es una participación: se vende y se renueva en Vender"),
                        ("GON-01", "se vende por participación"),
                        ("NAVE-NEV-03-PC1", "no se vende por participación")):
        r = _suelto(client, admin, code)
        assert r.status_code == 409 and frase in r.json()["detail"], (code, r.text)
    assert _leases() == antes, "ningún contrato suelto se escribió"

    # La planilla (y Vender, que confirma por el mismo camino) dice lo mismo, fila por fila.
    for espacio, frase in (("GON-01-PC1", "es una participación (un % de la cara). La planilla es sólo para "
                                          "muebles que se venden enteros: los porcentajes se venden en Vender."),
                           ("NEV-03-PC1", "no se vende por participación: elegí «por participación»"),
                           ("GON-01", "se vende por participación"),
                           ("GON-01-B", "se vende por participación")):
        fila = _planilla(client, admin, espacio)["filas"][0]
        assert fila["estado"] == "error" and any(frase in m for m in fila["mensajes"]), (espacio, fila)
    assert _planilla(client, admin, "GON-01-PC1", paso="confirmar")["creados"] == 0
    assert _leases() == antes

    # Una participación no se marca «Reservado» a mano.
    r = client.patch(f"/api/spaces/{pc['space_id']}/status", headers=admin, json={"status": "reserved"})
    assert r.status_code == 409 and "Vender" in r.text, r.text

    # Importar del plano: un contrato del JSON sobre la cara entera de PUN-01 (por participación, todavía sin
    # participaciones) y sobre un mueble viejo llamado como una participación quedan «Incompletos».
    viejo = _mueble("GON-09-PC1", "gondola", 0.9, 0.9, 1.8, 20, division=None, gondolaType="wall")
    _plano_en_la_base([_vendido_en_el_json(f) if f["code"] == "PUN-01" else f for f in PLANO]
                      + [_vendido_en_el_json(viejo)])
    r = client.get("/api/layout/importacion/previo", headers=admin)
    assert r.status_code == 200, r.text
    incompletos = {x["espacio"]: x["motivo"] for x in r.json()["incompletos"]}
    assert "se vende por participación" in incompletos["NAVE-PUN-01"]
    assert "se lee como una participación" in incompletos["NAVE-GON-09-PC1"]
    assert r.json()["importables"] == []
    r = client.post("/api/layout/importacion/aplicar", headers=admin)
    assert r.status_code == 200 and r.json()["importables"] == [], r.text
    assert _leases() == antes

    # El script de antes del despliegue (riesgo R1) encuentra el mueble viejo, no la participación de verdad.
    from scripts.buscar_codigos_pc import buscar

    db = _bd()
    try:
        hallado = buscar(db)
    finally:
        db.close()
    assert [codigo for _sede, codigo, _r in hallado["muebles"]] == ["GON-09-PC1"]
    # La fila que el contrato suelto de arriba creó a mano sí; la de la participación del alta, no.
    assert hallado["espacios"] == [("NAVE-NEV-03-PC1", "NAVE", 0)] and hallado["archivados"] == []


# ─── 5 · Defensa en profundidad ───────────────────────────────────────────────

@RELOJ
def test_una_cara_que_dejo_de_venderse_por_participacion_con_terminos_vivos_no_se_vende_entera(client, admin):
    _plano(client, admin)
    _alta(client, admin, tipo="reserva", desde=D(2026, 11, 1), hasta=D(2026, 11, 30), caduca=D(2026, 10, 25))
    # El plano escrito directo en la base (el guardado lo frenaría, escenario 12): GON-01 se vende entera,
    # con la reserva de su cara A viva, y su JSON trae un contrato de antes en esas fechas.
    sin_division = {k: v for k, v in GON_01.items() if k != "partes"}
    _plano_en_la_base([_vendido_en_el_json(sin_division) if f["code"] == "GON-01" else f for f in PLANO])
    frase = ("«GON-01» se vende por participación del 1 nov 2026 al 30 nov 2026: en esas fechas no se vende "
             "entera ni por partes.")
    antes = _leases()

    fila = _planilla(client, admin, "GON-01")["filas"][0]
    assert fila["estado"] == "error" and frase in fila["mensajes"], fila
    assert "Postobón" not in " ".join(fila["mensajes"])
    # Ni cuántos términos tiene la cara: delante del proveedor eso cuenta a los demás.
    assert not any("término" in m for m in fila["mensajes"]), fila
    # Fuera de esas fechas, y la cara B (sin términos), sí.
    assert _planilla(client, admin, "GON-01", desde=D(2026, 12, 1), hasta=D(2026, 12, 31))["filas"][0]["estado"] == "ok"
    assert _planilla(client, admin, "GON-01-B")["filas"][0]["estado"] == "ok"

    r = _suelto(client, admin, "NAVE-GON-01")
    assert r.status_code == 409 and r.json()["detail"] == frase, r.text
    # Con el código corto, la forma completa primero: la misma clave de candado que sus participaciones.
    r = _suelto(client, admin, "GON-01")
    assert r.status_code == 409 and "Escribilo «NAVE-GON-01»" in r.json()["detail"], r.text

    r = client.get("/api/layout/importacion/previo", headers=admin)
    incompletos = {x["espacio"]: x["motivo"] for x in r.json()["incompletos"]}
    assert incompletos["NAVE-GON-01"] == frase and r.json()["importables"] == []
    assert _leases() == antes


# ─── 6 · Casos A, B, C y H ────────────────────────────────────────────────────

@RELOJ
def test_casos_a_b_c_lo_dibujado_se_suma_por_participacion_y_vuelve_igual(client, admin):
    from app.services.zonas_geometria import limpiar

    _plano(client, admin)
    pc1 = _alta(client, admin, pb=3000, desde=D(2026, 10, 1), hasta=D(2026, 12, 31))["termino"]
    s1 = pc1["space_id"]
    bloque = _cara(client, admin)
    sup = bloque["superficie"]
    assert bloque["distribucion"] is None and bloque["revision"]["capa"] == "confirmada"
    assert _codigos(bloque["revision"]["avisos"]) == ["PENDIENTE"]

    # Caso A: 30 % contratado, 20 % dibujado → falta 10 %; lo disponible sigue en 70 %.
    a = _franja(sup, 0, 0.2)
    assert _dibujado(sup, a) == 2000
    r = _distribuir(client, admin, "borrador", "GON-01", 0, _zonas((s1, a)))
    p = _participacion(r, 1)
    assert (r["version"], p["contratado_pb"], p["dibujado_pb"], p["pendiente_pb"]) == (1, 3000, 2000, 1000)
    assert (r["capacidad"]["hoy_pb"], r["capacidad"]["disponible_hoy_pb"]) == (3000, 7000)
    assert r["revision"]["capa"] == "borrador" and r["revision"]["errores"] == []
    assert [x["frase"] for x in r["revision"]["avisos"]] == ["A la participación 1 le falta dibujar 10 % de 30 %."]
    assert r["distribucion"]["estado"] == "borrador"

    # Caso B: tres zonas separadas suman 30 %; recargadas, los mismos vértices y la misma cuenta.
    tres = [_franja(sup, 0, 0.1), _franja(sup, 0.3, 0.4), _franja(sup, 0.6, 0.7)]
    assert _dibujado(sup, *tres) == 3000
    r = _distribuir(client, admin, "borrador", "GON-01", 1, _zonas(*[(s1, z) for z in tres]))
    assert _participacion(r, 1)["dibujado_pb"] == 3000 and _participacion(r, 1)["pendiente_pb"] == 0
    recargada = _cara(client, admin)
    assert [z["vertices"] for z in recargada["distribucion"]["borrador"]] == [limpiar(z) for z in tres]
    assert _participacion(recargada, 1)["dibujado_pb"] == 3000
    # Una cuarta adentro de la primera, de la misma participación, no cambia el total (D9).
    cuatro = tres + [_franja(sup, 0.02, 0.08)]
    r = _distribuir(client, admin, "borrador", "GON-01", 2, _zonas(*[(s1, z) for z in cuatro]))
    assert _participacion(r, 1)["dibujado_pb"] == 3000 and r["revision"]["errores"] == []
    r = _distribuir(client, admin, "confirmar", "GON-01", 3, _zonas(*[(s1, z) for z in cuatro]))
    assert r["version"] == 4 and r["distribucion"]["estado"] == "confirmada"
    assert r["distribucion"]["borrador"] is None and len(r["distribucion"]["confirmada"]) == 4
    assert r["revision"] == {"capa": "confirmada", "errores": [], "avisos": []}

    # Caso C: vertical, horizontal, estrella y una que cruza entrepaños y un parante se guardan tal cual.
    estrella = [[0.5, 0.2], [0.56, 0.4], [0.75, 0.42], [0.6, 0.53], [0.66, 0.75], [0.5, 0.62], [0.34, 0.75],
                [0.4, 0.53], [0.25, 0.42], [0.44, 0.4]]
    libres = [_rect(0.1, 0.15, 0.1, 0.9), _rect(0.05, 0.95, 0.45, 0.5), estrella, _rect(0.0, 0.3, 0.3, 0.7)]
    r = _distribuir(client, admin, "borrador", "GON-01", 4, _zonas(*[(s1, z) for z in libres]))
    assert r["revision"]["capa"] == "borrador" and "ZONA_SE_CRUZA" not in _codigos(r["revision"]["errores"])
    recargada = _cara(client, admin)
    assert [z["vertices"] for z in recargada["distribucion"]["borrador"]] == [limpiar(z) for z in libres]
    assert recargada["distribucion"]["estado"] == "confirmada", "confirmada con un borrador encima"
    assert len(recargada["distribucion"]["confirmada"]) == 4


# ─── 7 · Casos D y E ──────────────────────────────────────────────────────────

@RELOJ
def test_casos_d_y_e_el_solape_y_el_exceso_no_se_confirman_y_el_borrador_queda(client, admin):
    from app.models.participaciones import HistorialParticipacion

    _plano(client, admin)
    s1 = _alta(client, admin, espacio="MET-01", pb=5000, desde=D(2026, 10, 1), hasta=D(2026, 12, 31))["termino"]
    s2 = _alta(client, admin, espacio="MET-01", tipo="reserva", pb=5000, desde=D(2026, 11, 1),
               hasta=D(2026, 11, 30), caduca=D(2026, 10, 30), proveedor="Alpina")["termino"]
    pisadas = _zonas((s1["space_id"], _rect(0, 0.5)), (s2["space_id"], _rect(0.45, 0.95)))
    r = _distribuir(client, admin, "borrador", "MET-01", 0, pisadas)
    assert _codigos(r["revision"]["errores"]) == ["SOLAPE"]
    assert r["revision"]["errores"][0]["frase"] == (
        "Las zonas de las participaciones 1 y 2 se pisan (500 cm²) y sus fechas se cruzan: separalas.")
    r = client.post("/api/participaciones/distribucion/confirmar", headers=admin,
                    json={"sede": "NAVE", "espacio": "MET-01", "version": 1, "zonas": pisadas})
    assert r.status_code == 409, r.text
    detalle = r.json()["detail"]
    assert (detalle["code"], detalle["version"], _codigos(detalle["errores"])) == (
        "distribucion_invalida", 2, ["SOLAPE"])
    assert detalle["message"] == "La distribución tiene 1 problema: se guardó como borrador."
    # El 409 hizo commit: el borrador está.
    bloque = _cara(client, admin, espacio="MET-01")
    assert bloque["distribucion"]["estado"] == "borrador" and bloque["distribucion"]["version"] == 2
    assert [z["vertices"] for z in bloque["distribucion"]["borrador"]] == [_rect(0, 0.5), _rect(0.45, 0.95)]
    db = _bd()
    try:
        assert db.query(HistorialParticipacion).filter_by(accion="distribucion.borrador").count() == 2
        assert db.query(HistorialParticipacion).filter_by(accion="distribucion.confirmada").count() == 0
    finally:
        db.close()
    separadas = _zonas((s1["space_id"], _rect(0, 0.5)), (s2["space_id"], _rect(0.5, 1)))
    r = _distribuir(client, admin, "confirmar", "MET-01", 2, separadas)
    assert r["distribucion"]["estado"] == "confirmada" and r["revision"]["errores"] == []

    # Caso E: 20 % contratado y 25 % dibujado.
    s = _alta(client, admin, espacio="MET-02", pb=2000, desde=D(2026, 10, 1), hasta=D(2026, 12, 31))["termino"]
    r = _distribuir(client, admin, "borrador", "MET-02", 0, _zonas((s["space_id"], _rect(0, 0.25))))
    assert [x["frase"] for x in r["revision"]["errores"]] == [
        "La participación 1 tiene dibujado 25 % y contratado 20 %: achicá sus zonas (o usá «Ajustar al contratado»)."]
    r = client.post("/api/participaciones/distribucion/confirmar", headers=admin, json={
        "sede": "NAVE", "espacio": "MET-02", "version": 1, "zonas": _zonas((s["space_id"], _rect(0, 0.25)))})
    assert r.status_code == 409 and _codigos(r.json()["detail"]["errores"]) == ["EXCESO"], r.text
    r = _distribuir(client, admin, "confirmar", "MET-02", 2, _zonas((s["space_id"], _rect(0, 0.2))))
    assert r["distribucion"]["estado"] == "confirmada" and _participacion(r, 1)["dibujado_pb"] == 2000


# ─── 8 · Caso F y 21 · Robatope ───────────────────────────────────────────────

@RELOJ
def test_caso_f_las_dos_caras_son_independientes_y_el_robatope_dibuja_girado(client, admin):
    from app.services.superficie import superficie

    _plano(client, admin)
    a = _alta(client, admin, pb=10000, desde=D(2026, 10, 1), hasta=D(2026, 12, 31))["termino"]
    b = _alta(client, admin, espacio="GON-01-B", pb=5000, desde=D(2026, 10, 1), hasta=D(2026, 12, 31))["termino"]
    assert b["codigo"] == "NAVE-GON-01-B-PC1"
    cara_b = _cara(client, admin, espacio="GON-01-B")
    assert (cara_b["cara"], cara_b["capacidad"]["hoy_pb"], cara_b["capacidad"]["disponible_hoy_pb"]) == ("B", 5000, 5000)
    sup = cara_b["superficie"]
    _distribuir(client, admin, "borrador", "GON-01", 0, _zonas((a["space_id"], _franja(sup, 0, 1))))
    assert _cara(client, admin, espacio="GON-01-B")["distribucion"] is None
    # Una zona de la A no se puede mandar a la B: espacio ajeno.
    r = client.put("/api/participaciones/distribucion/borrador", headers=admin, json={
        "sede": "NAVE", "espacio": "GON-01-B", "version": 0, "zonas": _zonas((a["space_id"], _rect(0.1, 0.2)))})
    assert r.status_code == 422 and r.json()["detail"]["code"] == "espacio_ajeno", r.text
    r = _distribuir(client, admin, "borrador", "GON-01-B", 0, _zonas((b["space_id"], _franja(sup, 0, 0.5))))
    assert _participacion(r, 1)["dibujado_pb"] == 5000

    rob = _cara(client, admin, espacio="ROB-01")
    assert rob["superficie"]["giro_x"] == -0.06
    assert rob["superficie"] == superficie(ROB_01, "A")
    assert rob["firma"].startswith("v1|robatope||300|1600|")
    # Una parte no es una cara; la B de una punta no existe; un mueble que no está, 404.
    r = client.get("/api/participaciones/cara", headers=admin, params={"sede": "NAVE", "espacio": "NEV-03-PU2"})
    # La nevera tiene una sola cara: la frase no le ofrece una B que no existe.
    assert r.status_code == 422 and r.json()["detail"]["message"] == "Pedí la cara (NEV-03), no una parte."
    r = client.get("/api/participaciones/cara", headers=admin, params={"sede": "NAVE", "espacio": "GON-01-PC1"})
    assert r.status_code == 422 and r.json()["detail"]["message"] == "Pedí la cara (GON-01 o GON-01-B), no una parte."
    r = client.get("/api/participaciones/cara", headers=admin, params={"sede": "NAVE", "espacio": "PUN-01-B"})
    assert r.status_code == 409 and r.json()["detail"]["code"] == "sin_cara_b"
    r = client.get("/api/participaciones/cara", headers=admin, params={"sede": "NAVE", "espacio": "GON-09"})
    assert r.status_code == 404
    assert r.json()["detail"]["message"] == "No hay ningún mueble con el código «GON-09» en el plano de NAVE."
    # Una cara que no es por participación: 200 sin errores; la compuerta frena el alta.
    gon02 = _cara(client, admin, espacio="GON-02")
    assert (gon02["por_participacion"], gon02["revision"]["errores"]) == (False, [])
    r = client.post("/api/participaciones/", headers=admin, json={
        "sede": "NAVE", "espacio": "NEV-03", "tipo": "contrato", "proveedor": "x", "puntos_basicos": 100,
        "desde": D(2026, 11, 1), "hasta": D(2026, 11, 2), "valor_mensual": 1})
    assert r.status_code == 409 and r.json()["detail"]["code"] == "parte_inexistente", r.text

    # Lo que no se guarda (§3.7 pasos 1–2, §3.8 pasos 0 y 0b): los topes protegen la geometría, que corre
    # sin candado pero cuesta; y una cara que no se vende por participación no tiene distribución.
    def borrador(espacio, version, zonas):
        return client.put("/api/participaciones/distribucion/borrador", headers=admin,
                          json={"sede": "NAVE", "espacio": espacio, "version": version, "zonas": zonas})

    s = b["space_id"]
    for zonas, esperado in (
        ([{"participacion_space_id": s, "vertices": _rect(0.1, 0.11)}] * 61, (422, "distribucion_malformada")),
        ([{"participacion_space_id": s, "vertices": [[i / 30, (i % 2) * 0.5] for i in range(25)]}],
         (422, "distribucion_malformada")),
        ([{"participacion_space_id": s, "vertices": [["a", 0], [1, 0], [1, 1]]}], (422, "zona_malformada")),
        ([{"participacion_space_id": s, "vertices": [[1e308, 0], [1, 0], [1, 1]]}], (422, "zona_malformada")),
    ):
        r = borrador("GON-01-B", 1, zonas)
        assert (r.status_code, r.json()["detail"]["code"]) == esperado, r.text
    for espacio in ("GON-02", "NEV-03"):
        r = borrador(espacio, 0, [])
        assert (r.status_code, r.json()["detail"]["code"]) == (409, "cara_no_distribuible"), r.text
    assert _cara(client, admin, espacio="GON-01-B")["distribucion"]["version"] == 1, "nada se guardó"
    assert _cara(client, admin, espacio="GON-02")["distribucion"] is None

    # ── fase 2 · I1 · «Copiar zonas de otra cara» (D20, Caso F) ──────────────────
    # La copia entra por el borrador de siempre con `origen`, que sólo va al
    # historial y a la bitácora: no crea ni toca términos, contratos, reservas
    # ni capacidad. La red del mapeo es la de arriba: una zona de la A mandada
    # a la B sigue siendo `espacio_ajeno`.
    import json

    from app.models.models import AuditEntry, SpaceLease
    from app.models.participaciones import HistorialParticipacion, Participacion

    def filas():
        db = _bd()
        try:
            return db.query(Participacion).count(), db.query(SpaceLease).count()
        finally:
            db.close()

    def anotadas(accion):
        db = _bd()
        try:
            hist = [(h.cara_space_id, h.detalle, json.loads(h.despues_json) if h.despues_json else None)
                    for h in db.query(HistorialParticipacion).filter_by(accion=accion).order_by(HistorialParticipacion.id)]
            bit = [(x.entidad_id, x.detalle) for x in db.query(AuditEntry).filter_by(accion=accion).order_by(AuditEntry.id)]
            return hist, bit
        finally:
            db.close()

    def cara_de(termino_id):
        db = _bd()
        try:
            return db.get(Participacion, termino_id).cara_space_id
        finally:
            db.close()

    def con_origen(origen, version, automatico=False):
        return client.put("/api/participaciones/distribucion/borrador", headers=admin, json={
            "sede": "NAVE", "espacio": "GON-01-B", "version": version, "automatico": automatico,
            "zonas": _zonas((s, _franja(sup, 0, 0.5))), "origen": origen})

    antes = filas()
    capacidad_b = _cara(client, admin, espacio="GON-01-B")["capacidad"]
    borradores = len(anotadas("distribucion.borrador")[0])
    dist_a = _cara(client, admin)["distribucion"]["id"]
    copia = {"sede": "NAVE", "espacio": "GON-01", "capa": "borrador", "version": 1, "mapa": [{"origen": 1, "destino": 1}]}
    r = con_origen(copia, 1)
    assert r.status_code == 200, r.text
    r = r.json()
    assert (r["version"], r["distribucion"]["estado"], r["distribucion"]["confirmada"]) == (2, "borrador", [])
    assert [z["participacion_space_id"] for z in r["distribucion"]["borrador"]] == [s]
    hist, bit = anotadas("distribucion.copiada")
    assert [(c, d) for c, d, _ in hist] == [
        (cara_de(b["id"]), "Copia de NAVE · GON-01 · cara A (borrador): 1 zona de 1 participación")]
    assert cara_de(b["id"]) != cara_de(a["id"]), "la copia se anotó en la cara de origen"
    assert hist[0][2]["origen"] == {
        "sede": "NAVE", "codigo_cara": "NAVE-GON-01", "capa": "borrador", "version": 1, "distribucion_id": dist_a,
        "espejo": False, "mapa": {"1": 1}, "sin_copiar": 0, "en_el_plano": True}
    assert hist[0][2]["zonas"] == {"1": 1}, "el historial de la copia no trae el resumen de la capa"
    assert len(anotadas("distribucion.borrador")[0]) == borradores, "la copia se anotó también como «borrador guardado»"
    assert len(bit) == 1 and bit[0][0] == "NAVE-GON-01-B", bit
    assert bit[0][1].startswith("NAVE-GON-01-B · 1 zona · copia de NAVE-GON-01"), bit
    assert filas() == antes, "la copia creó o tocó términos (o contratos)"
    assert _cara(client, admin, espacio="GON-01-B")["capacidad"] == capacidad_b, "la copia cambió la capacidad"

    # Con `automatico`, igual se anota: una copia siempre queda en el historial.
    r = con_origen({**copia, "espejo": True, "sin_copiar": 2, "mapa": [{"origen": 1, "destino": 1}, {"origen": 2}]}, 2,
                   automatico=True)
    assert r.status_code == 200 and r.json()["version"] == 3, r.text
    hist, bit = anotadas("distribucion.copiada")
    assert len(hist) == 2 and len(bit) == 2
    assert hist[1][1] == "Copia de NAVE · GON-01 · cara A (borrador): 1 zona de 1 participación; 2 sin copiar"
    assert (hist[1][2]["origen"]["espejo"], hist[1][2]["origen"]["mapa"]) == (True, {"1": 1, "2": None})

    # La misma cara (escrita como sea) no es un origen: 422 antes de escribir nada. Un campo de más, tampoco.
    for misma in ("GON-01-B", "nave-gon-01-b"):
        r = con_origen({**copia, "espacio": misma}, 3)
        assert (r.status_code, r.json()["detail"]["code"]) == (422, "copia_de_la_misma_cara"), r.text
        assert r.json()["detail"]["message"] == "Elegí otra cara para copiar: ésta es la misma."
    for de_mas in ({**copia, "proveedor": "Postobón"}, {**copia, "mapa": [{"origen": 1, "destino": 1, "valor_mensual": 1}]},
                   {**copia, "capa": "historia"}, {**copia, "mapa": [{"origen": 0, "destino": 1}]}):
        assert con_origen(de_mas, 3).status_code == 422, de_mas
    assert _cara(client, admin, espacio="GON-01-B")["distribucion"]["version"] == 3, "un origen rechazado guardó algo"
    assert len(anotadas("distribucion.copiada")[0]) == 2
    # Un origen que ya no está en el plano no frena el guardado: queda dicho.
    r = con_origen({**copia, "espacio": "GON-09"}, 3)
    assert r.status_code == 200, r.text
    o = anotadas("distribucion.copiada")[0][-1][2]["origen"]
    assert (o["codigo_cara"], o["en_el_plano"], o["distribucion_id"]) == ("NAVE-GON-09", False, None)
    assert filas() == antes

    # fase 2 · I1: un tipo sin receta de superficie no tiene «por participación» en «Cómo se vende»: no se lo
    # manda ahí. Uno que sí la tiene, sí.
    r = borrador("GON-02", 0, [])
    assert r.json()["detail"]["message"] == (
        "«GON-02» no se vende por participación: elegí «por participación» en «Cómo se vende» del Editor 3D.")
    _plano(client, admin, PLANO + [_mueble("EXP-01", "isla", 1.2, 0.8, 1.4, 16, division=None, label="Estiba")])
    r = borrador("EXP-01", 0, [])
    assert (r.status_code, r.json()["detail"]) == (409, {
        "code": "cara_no_distribuible", "message": "Este tipo de mueble todavía no se vende por participación."}), r.text


# ─── 9 · Caso G con el reloj ──────────────────────────────────────────────────

@RELOJ
def test_caso_g_lo_vencido_y_lo_cancelado_dejan_de_contar_y_su_zona_pasa_a_historia(client, admin):
    import time_machine

    from app.models.participaciones import HistorialParticipacion

    _plano(client, admin)
    p1 = _alta(client, admin, espacio="MET-01", pb=5000, desde=D(2026, 10, 1), hasta=D(2026, 10, 31))["termino"]
    p2 = _alta(client, admin, espacio="MET-01", pb=5000, desde=D(2026, 11, 1), hasta=D(2026, 11, 30),
               proveedor="Alpina")["termino"]
    p3 = _alta(client, admin, espacio="MET-01", tipo="reserva", pb=3000, desde=D(2026, 11, 1), hasta=D(2026, 11, 30),
               caduca=D(2026, 11, 1), proveedor="Colanta")["termino"]
    zonas = _zonas((p1["space_id"], _rect(0, 0.5)), (p2["space_id"], _rect(0, 0.5)), (p3["space_id"], _rect(0.6, 0.9)))
    # D19: la misma región en fechas que no se cruzan.
    r = _distribuir(client, admin, "confirmar", "MET-01", 0, zonas)
    assert r["revision"]["errores"] == []
    # La reserva cancelada: su zona mandada otra vez ya no se confirma.
    r = client.post(f"/api/participaciones/{p3['id']}/cancelar", headers=admin, json={"version": 1})
    assert r.status_code == 200, r.text
    r = client.post("/api/participaciones/distribucion/confirmar", headers=admin,
                    json={"sede": "NAVE", "espacio": "MET-01", "version": 1, "zonas": zonas})
    assert r.status_code == 409, r.text
    errores = r.json()["detail"]["errores"]
    assert [(e["codigo"], e["zona"]) for e in errores] == [("ZONA_DE_PARTICIPACION_TERMINADA", 2)]
    _distribuir(client, admin, "descartar", "MET-01", 2, [])

    with time_machine.travel("2026-11-05T15:00:00+00:00", tick=True):
        otra = _entrar(client)
        bloque = _cara(client, otra, espacio="MET-01")
        assert (bloque["capacidad"]["hoy_pb"], bloque["capacidad"]["disponible_hoy_pb"]) == (5000, 5000)
        assert [p["viva"] for p in bloque["participaciones"]] == [False, True, False]
        assert bloque["participaciones"][0]["terminos"][0]["estado_visible"] == "vencido"
        # En la confirmada guardada, las zonas de lo que ya no rige son historia: no chocan ni cuentan.
        assert bloque["revision"] == {"capa": "confirmada", "errores": [], "avisos": []}
        # El vencimiento no se escribe: el historial lo deriva (D6). La reserva cancelada no «caduca».
        derivados = client.get("/api/participaciones/historial", headers=otra,
                               params={"sede": "NAVE", "espacio": "MET-01"}).json()["derivados"]
        assert [(d["accion"], d["dia"], d["en"], d["participacion_id"]) for d in derivados] == [
            ("participacion.vencida", "2026-11-01", "2026-11-01T05:00:00+00:00", p1["id"])]
        _alta(client, otra, espacio="MET-01", pb=5000, desde=D(2026, 11, 10), hasta=D(2026, 11, 20),
              proveedor="Nutresa")
        r = client.post("/api/participaciones/distribucion/confirmar", headers=otra,
                        json={"sede": "NAVE", "espacio": "MET-01", "version": 3, "zonas": zonas})
        assert r.status_code == 409, r.text
        assert [(e["codigo"], e["zona"]) for e in r.json()["detail"]["errores"]] == [
            ("ZONA_DE_PARTICIPACION_TERMINADA", 0), ("ZONA_DE_PARTICIPACION_TERMINADA", 2)]
        r = _distribuir(client, otra, "confirmar", "MET-01", 4, _zonas((p2["space_id"], _rect(0, 0.5))))
        assert len(r["distribucion"]["confirmada"]) == 1
        db = _bd()
        try:
            ultima = (db.query(HistorialParticipacion).filter_by(accion="distribucion.confirmada")
                      .order_by(HistorialParticipacion.id.desc()).first())
            import json

            antes = json.loads(ultima.antes_json)
            assert [z["participacion_space_id"] for z in antes["zonas"]] == [
                p1["space_id"], p2["space_id"], p3["space_id"]]
            assert antes["zonas"][0]["vertices"] == _rect(0, 0.5)
        finally:
            db.close()
        r = client.post(f"/api/participaciones/{p1['id']}/renovar", headers=otra, json={
            "version": p1["version"], "tipo": "contrato", "desde": D(2026, 12, 1), "hasta": D(2026, 12, 31),
            "valor_mensual": 1})
        assert r.status_code == 409 and r.json()["detail"]["code"] == "no_renovable", r.text


# ─── 13 (la parte de 4b) · La distribución de otro mueble ─────────────────────

@RELOJ
def test_la_distribucion_de_otro_mueble_con_el_mismo_codigo_no_vale_y_la_proxima_escritura_la_cierra(client, admin):
    import json

    from app.models.participaciones import HistorialParticipacion

    _plano(client, admin)
    s = _alta(client, admin, espacio="MET-02", tipo="reserva", pb=4000, desde=D(2026, 11, 1),
              hasta=D(2026, 11, 30))["termino"]
    _distribuir(client, admin, "confirmar", "MET-02", 0, _zonas((s["space_id"], _rect(0, 0.4))))
    r = client.post(f"/api/participaciones/{s['id']}/cancelar", headers=admin, json={"version": 1})
    assert r.status_code == 200, r.text
    # Otro mueble (otro id) toma el código MET-02.
    _plano(client, admin, [{**f, "id": "f-MET-02-nuevo"} if f["code"] == "MET-02" else f for f in PLANO])
    bloque = _cara(client, admin, espacio="MET-02")
    d = bloque["distribucion"]
    assert (d["estado"], d["otro_mueble"], d["confirmada"], d["borrador"], d["version"]) == (
        "sin_distribuir", True, [], None, 1)
    assert bloque["revision"]["errores"] == []
    r = _distribuir(client, admin, "borrador", "MET-02", 1, [])
    assert (r["distribucion"]["otro_mueble"], r["distribucion"]["estado"], r["version"]) == (False, "borrador", 2)
    db = _bd()
    try:
        cierre = db.query(HistorialParticipacion).filter_by(accion="distribucion.otro_mueble").one()
        antes = json.loads(cierre.antes_json)
        assert antes["fixture_id"] == "f-MET-02" and antes["confirmada"][0]["vertices"] == _rect(0, 0.4)
        assert json.loads(cierre.despues_json) == {"fixture_id": "f-MET-02-nuevo"}
    finally:
        db.close()


# ─── 10 · Invariantes y revalidación ──────────────────────────────────────────

@RELOJ
def test_las_invariantes_de_termino_y_un_cambio_que_romperia_la_confirmada(client, admin):
    from app.models.participaciones import HistorialParticipacion, Participacion

    _plano(client, admin)
    pc1 = _alta(client, admin, pb=2500, desde=D(2026, 10, 1), hasta=D(2026, 12, 31))["termino"]
    url = f"/api/participaciones/{pc1['id']}/renovar"
    r = client.post(url, headers=admin, json={"version": 1, "tipo": "reserva", "desde": D(2026, 12, 1),
                                              "hasta": D(2027, 2, 28), "caduca": D(2026, 11, 15)})
    assert r.status_code == 409 and r.json()["detail"]["code"] == "termino_superpuesto", r.text
    assert "del 1 oct 2026 al 31 dic 2026" in r.json()["detail"]["message"]
    r = client.post(url, headers=admin, json={"version": 1, "tipo": "contrato", "desde": D(2027, 1, 1),
                                              "hasta": D(2027, 3, 31), "valor_mensual": 1_300_000})
    assert r.status_code == 201, r.text
    nuevo = r.json()["termino"]
    assert (nuevo["codigo"], nuevo["numero"], nuevo["renueva_a"], nuevo["puntos_basicos"]) == (
        "NAVE-GON-01-PC1", 1, pc1["id"], 2500)
    assert (nuevo["proveedor"]["nombre"], nuevo["marca"], nuevo["valor_mensual"]) == ("Postobón", "Hit", 1_300_000.0)
    # La segunda renovación del mismo término: ya no es el más nuevo.
    r = client.post(url, headers=admin, json={"version": 1, "tipo": "contrato", "desde": D(2027, 4, 1),
                                              "hasta": D(2027, 4, 30), "valor_mensual": 1})
    assert r.status_code == 409 and r.json()["detail"]["code"] == "no_renovable", r.text
    # Renovar no lleva proveedor, marca ni porcentaje (se copian): mandarlos es 422.
    r = client.post(url, headers=admin, json={"version": 2, "tipo": "contrato", "desde": D(2027, 4, 1),
                                              "hasta": D(2027, 4, 30), "valor_mensual": 1, "proveedor": "Alpina"})
    assert r.status_code == 422, r.text

    pc2 = _alta(client, admin, pb=2000, desde=D(2026, 10, 1), hasta=D(2026, 11, 30), proveedor="Alpina",
                marca="Chocolisto")["termino"]
    r = client.post(f"/api/participaciones/{pc2['id']}/renovar", headers=admin, json={
        "version": 1, "tipo": "reserva", "desde": D(2026, 12, 1), "hasta": D(2026, 12, 31), "caduca": D(2026, 11, 20)})
    assert r.status_code == 201, r.text
    reserva = r.json()["termino"]
    assert (reserva["estado"], reserva["proveedor"]["nombre"], reserva["marca"]) == ("reserva", "Alpina", "Chocolisto")
    r = client.patch(f"/api/participaciones/{reserva['id']}", headers=admin, json={"version": 1, "puntos_basicos": 3000})
    assert r.status_code == 409 and r.json()["detail"]["code"] == "otro_porcentaje", r.text
    r = client.patch(f"/api/participaciones/{reserva['id']}", headers=admin, json={"version": 1, "marca": "Otra"})
    assert r.status_code == 409 and r.json()["detail"]["code"] == "otro_proveedor", r.text
    # Un contrato no se cambia por PATCH.
    r = client.patch(f"/api/participaciones/{pc2['id']}", headers=admin, json={"version": 2, "puntos_basicos": 1000})
    assert r.status_code == 409 and r.json()["detail"]["code"] == "no_editable", r.text

    # A2: PC1 en noviembre y PC2 en diciembre en la misma mitad; renovar PC1 a diciembre rompería la confirmada.
    m1 = _alta(client, admin, espacio="MET-01", pb=5000, desde=D(2026, 11, 1), hasta=D(2026, 11, 30))["termino"]
    m2 = _alta(client, admin, espacio="MET-01", pb=5000, desde=D(2026, 12, 1), hasta=D(2026, 12, 31),
               proveedor="Alpina")["termino"]
    _distribuir(client, admin, "confirmar", "MET-01", 0,
                _zonas((m1["space_id"], _rect(0, 0.5)), (m2["space_id"], _rect(0, 0.5))))
    db = _bd()
    try:
        antes = (db.query(Participacion).count(), db.query(HistorialParticipacion).count())
    finally:
        db.close()
    r = client.post(f"/api/participaciones/{m1['id']}/renovar", headers=admin, json={
        "version": 1, "tipo": "reserva", "desde": D(2026, 12, 1), "hasta": D(2027, 1, 31), "caduca": D(2026, 11, 15)})
    assert r.status_code == 409, r.text
    detalle = r.json()["detail"]
    assert detalle["code"] == "rompe_distribucion" and _codigos(detalle["problemas"]) == ["SOLAPE"]
    assert detalle["message"].startswith(
        "Con esas fechas, las zonas de la participación 1 pisan las de la 2 desde el 1 dic 2026")
    db = _bd()
    try:
        assert (db.query(Participacion).count(), db.query(HistorialParticipacion).count()) == antes, "algo se escribió"
    finally:
        db.close()

    # Un PATCH que estira una reserva sobre la región de otra que rige en esas fechas.
    n1 = _alta(client, admin, espacio="PUN-01", pb=5000, desde=D(2026, 11, 1), hasta=D(2026, 11, 30))["termino"]
    n2 = _alta(client, admin, espacio="PUN-01", tipo="reserva", pb=5000, desde=D(2026, 12, 1), hasta=D(2026, 12, 31),
               caduca=D(2026, 11, 25), proveedor="Alpina")["termino"]
    sup = _cara(client, admin, espacio="PUN-01")["superficie"]
    _distribuir(client, admin, "confirmar", "PUN-01", 0,
                _zonas((n1["space_id"], _franja(sup, 0, 0.5)), (n2["space_id"], _franja(sup, 0, 0.5))))
    r = client.patch(f"/api/participaciones/{n2['id']}", headers=admin, json={"version": 1, "desde": D(2026, 11, 20)})
    assert r.status_code == 409 and r.json()["detail"]["code"] == "rompe_distribucion", r.text
    # Cancelar no revalida: sólo saca restricciones.
    r = client.post(f"/api/participaciones/{n2['id']}/cancelar", headers=admin, json={"version": 1})
    assert r.status_code == 200, r.text
    # A un contrato no se lo cancela por acá.
    r = client.post(f"/api/participaciones/{n1['id']}/cancelar", headers=admin, json={"version": 1})
    assert r.status_code == 409 and r.json()["detail"]["code"] == "es_contrato", r.text


# ─── 11 · Versión (Caso H) ────────────────────────────────────────────────────

@RELOJ
def test_caso_h_dos_sesiones_con_la_misma_version_la_segunda_recibe_version_vieja(client, admin):
    from app.models.models import AuditEntry
    from app.models.participaciones import HistorialParticipacion

    _plano(client, admin)
    s = _alta(client, admin, espacio="MET-01", pb=3000, desde=D(2026, 10, 1), hasta=D(2026, 12, 31))["termino"]
    zonas = _zonas((s["space_id"], _rect(0, 0.2)))
    assert _distribuir(client, admin, "borrador", "MET-01", 0, zonas)["version"] == 1
    r = client.put("/api/participaciones/distribucion/borrador", headers=admin,
                   json={"sede": "NAVE", "espacio": "MET-01", "version": 0, "zonas": zonas})
    assert r.status_code == 409, r.text
    assert (r.json()["detail"]["code"], r.json()["detail"]["version_actual"]) == ("version_vieja", 1)
    assert _distribuir(client, admin, "borrador", "MET-01", 1, zonas)["version"] == 2
    r = client.put("/api/participaciones/distribucion/borrador", headers=admin,
                   json={"sede": "NAVE", "espacio": "MET-01", "version": 1, "zonas": zonas})
    assert r.status_code == 409 and r.json()["detail"]["version_actual"] == 2, r.text
    r = client.post("/api/participaciones/distribucion/confirmar", headers=admin,
                    json={"sede": "NAVE", "espacio": "MET-01", "version": 1, "zonas": zonas})
    assert r.status_code == 409 and r.json()["detail"]["code"] == "version_vieja", r.text

    def cuentas():
        db = _bd()
        try:
            return (db.query(HistorialParticipacion).filter_by(tipo="geometria").count(),
                    db.query(AuditEntry).filter(AuditEntry.accion.like("distribucion.%")).count())
        finally:
            db.close()

    antes = cuentas()
    assert _distribuir(client, admin, "borrador", "MET-01", 2, zonas, automatico=True)["version"] == 3
    assert cuentas() == antes, "el autoguardado no escribe historial ni bitácora"
    _distribuir(client, admin, "borrador", "MET-01", 3, zonas)
    assert cuentas() == (antes[0] + 1, antes[1] + 1)
    r = _distribuir(client, admin, "descartar", "MET-01", 4, [])
    assert r["distribucion"]["borrador"] is None and r["version"] == 5
    # fase 2 · I1 (E6): descartar sin borrador no sube la versión (otra sesión recibiría un version_vieja de balde)
    # ni anota «Borrador descartado» (el historial es para siempre); con otra versión, 409 como siempre.
    antes = cuentas()
    assert _distribuir(client, admin, "descartar", "MET-01", 5, [])["version"] == 5
    assert cuentas() == antes, "descartar sin borrador anotó historial o bitácora"
    r = client.post("/api/participaciones/distribucion/descartar", headers=admin,
                    json={"sede": "NAVE", "espacio": "MET-01", "version": 4})
    assert r.status_code == 409, r.text
    assert (r.json()["detail"]["code"], r.json()["detail"]["version_actual"]) == ("version_vieja", 5)

    # Lo mismo con un término: dos sesiones cambian la misma reserva.
    reserva = _alta(client, admin, espacio="MET-01", tipo="reserva", pb=1000, desde=D(2026, 11, 1),
                    hasta=D(2026, 11, 30), proveedor="Alpina")["termino"]
    url = f"/api/participaciones/{reserva['id']}"
    r = client.patch(url, headers=admin, json={"version": 1, "notas": "la de la mañana"})
    assert r.status_code == 200 and r.json()["termino"]["version"] == 2, r.text
    assert r.json()["termino"]["notas"] == "la de la mañana"
    r = client.patch(url, headers=admin, json={"version": 1, "puntos_basicos": 2000})
    assert r.status_code == 409, r.text
    assert (r.json()["detail"]["code"], r.json()["detail"]["version_actual"]) == ("version_vieja", 2)
    r = client.post(f"{url}/confirmar", headers=admin, json={"version": 1, "valor_mensual": 1})
    assert r.status_code == 409 and r.json()["detail"]["code"] == "version_vieja", r.text
    # Con la versión al día, se confirma como contrato sobre el MISMO espacio.
    r = client.post(f"{url}/confirmar", headers=admin, json={"version": 2, "valor_mensual": 900_000,
                                                             "correo": "ventas@alpina.co"})
    assert r.status_code == 200, r.text
    t = r.json()["termino"]
    assert (t["estado"], t["space_id"], t["codigo"], t["valor_mensual"], t["proveedor"]["nombre"]) == (
        "contrato", reserva["space_id"], reserva["codigo"], 900_000.0, "Alpina")


# ─── 6 y 7 (verificación) · Un término no compite consigo mismo ───────────────

@RELOJ
def test_cambiar_o_confirmar_una_reserva_no_compite_consigo_misma_y_avisa_lo_que_rompe_del_borrador(client, admin):
    """Cambiar o confirmar una reserva la saca de la cuenta (``excluir_id``):
    si contara dos veces, una reserva de 60 % no podría pasar a 70 % en una
    cara vacía. Y lo que el cambio le rompe al BORRADOR vuelve como aviso, no
    como 409 (el borrador no es oficial, §3.11)."""
    _plano(client, admin)
    r = _alta(client, admin, espacio="MET-01", tipo="reserva", pb=6000, desde=D(2026, 11, 1), hasta=D(2026, 11, 30),
              caduca=D(2026, 10, 30))["termino"]
    url = f"/api/participaciones/{r['id']}"
    # Una reserva que se cambia sigue caducando entre hoy y su último día (y nada se escribe).
    hecho = client.patch(url, headers=admin, json={"version": 1, "caduca": D(2026, 12, 5)})
    assert (hecho.status_code, hecho.json()["detail"]["code"]) == (422, "caduca"), hecho.text
    hecho = client.patch(url, headers=admin, json={"version": 1, "puntos_basicos": 7000})
    assert hecho.status_code == 200, hecho.text
    assert hecho.json()["cara"]["capacidad"]["periodo"]["pico_pb"] == 7000
    # 70 + 30 = 100: entra justo.
    _alta(client, admin, espacio="MET-01", pb=3000, desde=D(2026, 11, 1), hasta=D(2026, 11, 30), proveedor="Alpina")
    _distribuir(client, admin, "borrador", "MET-01", 0, _zonas((r["space_id"], _rect(0, 0.7))))
    # Bajarla a 60 % deja el borrador con 70 % dibujado: aviso, y el cambio se hace.
    hecho = client.patch(url, headers=admin, json={"version": 2, "puntos_basicos": 6000})
    assert hecho.status_code == 200, hecho.text
    avisos = hecho.json()["avisos_distribucion"]
    assert [(a["codigo"], a["participaciones"]) for a in avisos] == [("EXCESO", [1])], avisos
    assert avisos[0]["frase"].startswith("Con ese porcentaje, la participación 1 queda con 70 % dibujado y 60 %")
    # Confirmarla de vuelta en 70 %: 70 + 30 = 100 sin contarse a sí misma; el borrador ya no queda roto.
    hecho = client.post(f"{url}/confirmar", headers=admin, json={"version": 3, "valor_mensual": 1,
                                                                 "puntos_basicos": 7000})
    assert hecho.status_code == 200, hecho.text
    cuerpo = hecho.json()
    assert (cuerpo["termino"]["estado"], cuerpo["termino"]["puntos_basicos"]) == ("contrato", 7000)
    assert cuerpo["avisos_distribucion"] == []
    assert cuerpo["cara"]["capacidad"]["periodo"]["pico_pb"] == 10000
    # Confirmada, la verdad de proveedor, marca y fechas pasa al lease: el término no guarda copia.
    from app.models.participaciones import Participacion

    db = _bd()
    try:
        fila = db.get(Participacion, r["id"])
        assert (fila.supplier_id, fila.marca, fila.desde, fila.hasta, fila.caduca, fila.notas) == (None,) * 6
        assert fila.lease_id == cuerpo["termino"]["lease_id"] is not None
    finally:
        db.close()


# ─── 12 · Las guardas del guardado del plano ──────────────────────────────────

def _guardar(client, admin, fixtures, codigo=200):
    r = client.put("/api/layout/NAVE", headers=admin, json={"fixtures": fixtures, "base_updated_at": None})
    assert r.status_code == codigo, r.text
    return r.json()


def _con(mueble, plano=PLANO, **cambios):
    """El plano con el mueble de código ``mueble`` cambiado. Un ``None`` viaja
    como ``null``: en la ficha del mueble (``partes``) es «borrala»; ausente, el
    servidor conservaría la guardada (``_con_la_ficha_de_antes``)."""
    return [{**f, **cambios} if f["code"] == mueble else f for f in plano]


def _slot(id_, status="occupied", fin=D(2026, 12, 31), valor=100):
    return {"id": id_, "x": 0, "y": 0, "w": 0.3, "h": 0.3, "supplierName": "", "brandCategory": "",
            "negotiatedValue": valor, "startDate": D(2026, 10, 1), "endDate": fin, "status": status}


def _rechazo(client, admin, fixtures):
    return _guardar(client, admin, fixtures, 409)["detail"]


@RELOJ
def test_el_guardado_del_plano_no_rompe_lo_vendido_por_participacion(client, admin):
    from app.models.participaciones import HistorialParticipacion

    _plano(client, admin)
    _alta(client, admin, tipo="reserva", caduca=D(2026, 10, 25))
    # Sacar la división con una reserva viva (no es un lease: la guarda de contratos vivos no la ve).
    d = _rechazo(client, admin, _con("GON-01", partes=None))
    assert d["code"] == "participaciones_vivas"
    assert d["choques"] == ["GON-01 · cara A tiene 1 participación viva (1 reserva provisional). Cancelala o "
                            "dejá que venza antes de cambiar cómo se vende."]
    # Borrar el mueble, renombrarlo sin la renumeración o cambiarle el tipo a uno sin superficie (la estiba;
    # la nevera de bebidas ya tiene receta): lo mismo.
    for fixtures in ([f for f in PLANO if f["code"] != "GON-01"], _con("GON-01", code="GON-09"),
                     _con("GON-01", type="isla", gondolaType=None)):
        assert _rechazo(client, admin, fixtures)["code"] == "participaciones_vivas"
    # Doble → mural con dos reservas en la B: sale sólo la B, y es la que frena.
    _alta(client, admin, espacio="GON-01-B", tipo="reserva", caduca=D(2026, 10, 25), proveedor="Alpina")
    _alta(client, admin, espacio="GON-01-B", tipo="reserva", caduca=D(2026, 10, 25), pb=1000, proveedor="Colanta")
    d = _rechazo(client, admin, _con("GON-01", gondolaType="wall"))
    assert d["code"] == "participaciones_vivas" and len(d["choques"]) == 1
    assert d["choques"][0] == ("GON-01 · cara B tiene 2 participaciones vivas (2 reservas provisionales). "
                               "Cancelalas o dejá que venzan antes de cambiar cómo se vende.")
    # Con un contrato de participación ya la frena la guarda de siempre (un lease que dejaría de estar en el
    # plano, `ofrece`), que corre antes: es la que se ve.
    _alta(client, admin, espacio="GON-01-B", pb=1000, proveedor="Colombina")
    d = _rechazo(client, admin, _con("GON-01", gondolaType="wall"))
    assert d["code"] == "contratos_vivos" and "«GON-01-B-PC3» tiene un contrato de Colombina" in d["choques"][0]

    # Con sólo lo terminado (un contrato de PUN-01 que ya venció), la división sale; y queda en su historia.
    _alta(client, admin, espacio="PUN-01", desde=D(2026, 9, 1), hasta=D(2026, 10, 10))
    plano = _con("PUN-01", partes=None)
    _guardar(client, admin, plano)
    db = _bd()
    try:
        fila = db.query(HistorialParticipacion).filter_by(accion="distribucion.division").one()
        assert fila.tipo == "estado" and fila.detalle == "PUN-01 · cara A dejó de venderse por participación."
        assert fila.actor == "admin"
    finally:
        db.close()
    # Y vuelve: la entrada también queda en su historia.
    plano = _con("PUN-01", plano, partes={"division": "participacion"})
    _guardar(client, admin, plano)
    db = _bd()
    try:
        filas = db.query(HistorialParticipacion).filter_by(accion="distribucion.division").order_by(
            HistorialParticipacion.id).all()
        assert [f.detalle for f in filas] == ["PUN-01 · cara A dejó de venderse por participación.",
                                              "PUN-01 · cara A pasó a venderse por participación."]
    finally:
        db.close()

    # Espacios internos: GON-02 (entera) con uno vendido y vigente no pasa a participación.
    plano = _con("GON-02", plano, slots=[_slot("s1")])
    _guardar(client, admin, plano)
    d = _rechazo(client, admin, _con("GON-02", plano, partes={"division": "participacion"}))
    assert d == {"code": "slots_vendidos_en_participacion",
                 "message": "Este guardado pasaría a participación 1 mueble(s) de «NAVE» con espacios internos "
                            "vendidos.",
                 "choques": ["«GON-02» tiene espacios internos vendidos: no pasa a participación hasta que "
                             "terminen."]}
    # Uno que termina hoy todavía rige (el día de Colombia).
    hoy_termina = _con("GON-02", plano, slots=[_slot("s1", fin=D(2026, 10, 17))])
    _guardar(client, admin, hoy_termina)
    assert _rechazo(client, admin, _con("GON-02", hoy_termina, partes={"division": "participacion"}))["code"] == \
        "slots_vendidos_en_participacion"
    # Terminado, sí pasa (en dos guardados: el que lo termina y el que cambia la división).
    plano = _con("GON-02", plano, slots=[_slot("s1", fin=D(2026, 10, 1))])
    _guardar(client, admin, plano)
    plano = _con("GON-02", plano, partes={"division": "participacion"})
    _guardar(client, admin, plano)
    # En un mueble por participación no se vende un espacio interno: ni uno nuevo, ni estirar, adelantar,
    # pasarle a otro proveedor o cambiar el valor del que estaba. Liberarlo, sí.
    for slots in ([_slot("s1", fin=D(2026, 10, 1)), _slot("s2")], [_slot("s1", fin=D(2026, 12, 31))],
                  [_slot("s1", fin=D(2026, 10, 1), valor=999)], [_slot("s1", status="free"), _slot("s2", "reserved")],
                  [{**_slot("s1", fin=D(2026, 10, 1)), "startDate": D(2026, 9, 1)}],
                  [{**_slot("s1", fin=D(2026, 10, 1)), "supplierName": "Alpina"}]):
        d = _rechazo(client, admin, _con("GON-02", plano, slots=slots))
        assert d["code"] == "slots_en_participacion", (slots, d)
        assert d["choques"] == ["«GON-02» se vende por participación: lo vendido va con contrato en Distribución, "
                                "no como espacio interno."]
    sin_valor = {k: v for k, v in _slot("s1", fin=D(2026, 10, 1)).items() if k != "negotiatedValue"}
    _guardar(client, admin, _con("GON-02", plano, slots=[sin_valor], cx=4.5))  # un valor ausente no es un cambio
    plano = _con("GON-02", plano, slots=[_slot("s1", status="free")])
    _guardar(client, admin, plano)
    # Y el liberado no se vuelve a vender con el mismo id (una pestaña vieja que lo tenía vendido).
    assert _rechazo(client, admin, _con("GON-02", plano, slots=[_slot("s1")]))["code"] == "slots_en_participacion"

    # Un plano que ya venía así (por participación con un espacio interno vendido y vigente, de antes) se
    # guarda igual mientras no lo toque.
    viejo = _con("MET-02", plano, slots=[_slot("s9")])
    _plano_en_la_base(viejo)
    _guardar(client, admin, _con("MET-02", viejo, cx=10.5))

    # Una cara por tramos con un tramo vendido no pasa a participación: lo frena la guarda de siempre
    # (contratos vivos: el tramo deja de estar en el plano).
    tramos = {**_mueble("GON-03", "gondola", 3.75, 0.9, 2.0, 30, division=None, gondolaType="wall"),
              "partes": {"division": "tramos", "tramos": 3}}
    plano = _con("MET-02", viejo, cx=10.5) + [tramos]
    _guardar(client, admin, plano)
    r = client.post("/api/leases/bulk/confirmar", headers=admin, json={"sede": "NAVE", "filas": [{
        "fila": 2, "espacio": "GON-03-TR1", "sede": "NAVE", "proveedor": "Colombina", "valor": 1,
        "desde": D(2026, 10, 1), "hasta": D(2026, 12, 31)}]})
    assert r.json()["creados"] == 1, r.text
    assert _rechazo(client, admin, _con("GON-03", plano, partes={"division": "participacion"}))["code"] == \
        "contratos_vivos"


# ─── 13 · Firma: lo que el guardado del plano deja para revisar ───────────────

@RELOJ
def test_un_cambio_del_mueble_deja_la_distribucion_confirmada_para_revisar_y_lo_anota(client, admin):
    _plano(client, admin)
    t = _alta(client, admin, pb=3000)["termino"]
    sup = _cara(client, admin)["superficie"]
    _distribuir(client, admin, "confirmar", "GON-01", 0, _zonas((t["space_id"], _franja(sup, 0, 0.2))))

    def estado():
        b = _cara(client, admin)
        return b["distribucion"]["para_revisar"], "PARA_REVISAR" in _codigos(b["revision"]["avisos"])

    def anotado():
        h = client.get("/api/participaciones/historial", headers=admin,
                       params={"sede": "NAVE", "espacio": "GON-01"}).json()
        return [(e["accion"], e["despues"]["para_revisar"]) for e in h["entradas"] if e["tipo"] == "estado"]

    assert estado() == (False, False) and anotado() == []
    _guardar(client, admin, _con("GON-01", w=1.25))
    assert estado() == (True, True)
    assert anotado() == [("distribucion.para_revisar", True)]
    _guardar(client, admin, PLANO)  # vuelve a la medida confirmada
    assert estado() == (False, False)
    assert anotado() == [("distribucion.para_revisar", False), ("distribucion.para_revisar", True)]
    _guardar(client, admin, _con("GON-01", d=0.6))  # el fondo no entra en la firma: nada que anotar
    assert estado() == (False, False) and len(anotado()) == 2
    _guardar(client, admin, _con("GON-01", entrepanos=5))
    assert estado() == (True, True) and anotado()[0] == ("distribucion.para_revisar", True)
    # La cara B cambió igual (es el mismo mueble), pero no tiene distribución: nada que anotar ahí.
    h = client.get("/api/participaciones/historial", headers=admin, params={"sede": "NAVE", "espacio": "GON-01-B"})
    assert h.json()["entradas"] == []
    # Otro mueble con el mismo código (otro id) y otra medida: la confirmada era del de antes, no queda «para
    # revisar» del nuevo (`otro_mueble`), y no se anota nada.
    _guardar(client, admin, _con("GON-01", id="f-otra-gondola", w=1.25))
    assert _cara(client, admin)["distribucion"]["otro_mueble"] is True
    assert len(anotado()) == 3


# ─── 14 · Ciclo de vida: renumerar y borrar la sede ───────────────────────────

@RELOJ
def test_la_renumeracion_muda_las_participaciones_y_borrar_la_sede_las_cierra(client, admin):
    from app.models.models import AuditEntry, Space
    from app.models.participaciones import Participacion

    # GON-01 queda después de GON-02 en el recorrido de la tienda: renumerar los intercambia.
    _plano(client, admin, [{**GON_01, "cx": 6}, {**GON_02, "cx": 2}, PUN_01])
    contrato = _alta(client, admin, pb=3000, desde=D(2026, 10, 1), hasta=D(2026, 12, 31))["termino"]
    reserva = _alta(client, admin, tipo="reserva", pb=2000, proveedor="Alpina")["termino"]
    sup = _cara(client, admin)["superficie"]
    _distribuir(client, admin, "confirmar", "GON-01", 0, _zonas((contrato["space_id"], _franja(sup, 0, 0.2))))

    r = client.post("/api/layout/renumeracion/aplicar", headers=admin, json={"sedes": ["NAVE"]})
    assert r.status_code == 200, r.text
    db = _bd()
    try:
        assert db.get(Space, contrato["space_id"]).code == "NAVE-GON-02-PC1"
        assert db.get(Space, reserva["space_id"]).code == "NAVE-GON-02-PC2"
        assert db.get(Space, db.get(Participacion, contrato["id"]).cara_space_id).code == "NAVE-GON-02"
    finally:
        db.close()
    # Todo sigue por id: la cara se pide con el código nuevo y trae lo mismo, distribución incluida.
    b = _cara(client, admin, espacio="GON-02")
    assert [p["codigo"] for p in b["participaciones"]] == ["NAVE-GON-02-PC1", "NAVE-GON-02-PC2"]
    assert (b["distribucion"]["estado"], b["distribucion"]["otro_mueble"]) == ("confirmada", False)
    assert _alta(client, admin, espacio="GON-02", pb=1000)["termino"]["codigo"] == "NAVE-GON-02-PC3"
    assert _cara(client, admin, espacio="GON-01")["participaciones"] == []  # el nuevo GON-01 no hereda nada

    # Borrar la sede: lo dice antes, cancela las reservas y da de baja los contratos, con quien lo hizo.
    assert client.get("/api/layout/NAVE/impact", headers=admin).json()["reservas_vivas"] == 1
    r = client.delete("/api/layout/NAVE", headers=admin)
    assert r.status_code == 204, r.text
    db = _bd()
    try:
        cancelada = db.get(Participacion, reserva["id"])
        assert (cancelada.estado, cancelada.baja_por) == ("reserva_cancelada", "admin")
        assert cancelada.baja_en is not None
        cerrado = db.get(Participacion, contrato["id"])
        assert cerrado.baja_en is not None and cerrado.baja_por == "admin"
        detalle = db.query(AuditEntry).filter_by(accion="sede.baja").one().detalle
        assert detalle.endswith(" · 1 reserva provisional de participación cancelada"), detalle
    finally:
        db.close()


# ─── 15 · Cancelación a la noche de Colombia ──────────────────────────────────

@pytest.mark.reloj("2026-10-18T02:00:00+00:00")
def test_cancelar_a_las_nueve_de_la_noche_es_del_dia_de_colombia(client, admin):
    _plano(client, admin)
    t = _alta(client, admin, pb=3000, desde=D(2026, 10, 1), hasta=D(2026, 12, 31))["termino"]
    r = client.delete(f"/api/spaces/{t['space_id']}/leases/{t['lease_id']}", headers=admin)
    assert r.status_code == 204, r.text
    bloque = _cara(client, admin)
    termino = bloque["participaciones"][0]["terminos"][0]
    assert (termino["estado_visible"], termino["baja_fecha"]) == ("cancelado", "2026-10-17")
    assert termino["baja_en"].startswith("2026-10-18T02:0")
    assert bloque["capacidad"]["hoy_pb"] == 0
    for dia, esperado in ((D(2026, 10, 16), 3000), (D(2026, 10, 17), 0)):
        r = client.get("/api/participaciones/resumen", headers=admin, params={"sede": "NAVE", "dia": dia})
        cara = next(c for c in r.json()["caras"] if c["codigo_cara"] == "NAVE-GON-01")
        assert cara["comprometido_dia_pb"] == esperado, dia

    # Un lease ya vencido por fecha que `expire_leases` no había cerrado: «vencido», sin baja.
    v = _alta(client, admin, pb=2000, desde=D(2026, 9, 1), hasta=D(2026, 10, 10), proveedor="Alpina")["termino"]
    r = client.delete(f"/api/spaces/{v['space_id']}/leases/{v['lease_id']}", headers=admin)
    assert r.status_code == 204, r.text
    vencido = _participacion(_cara(client, admin), 2)["terminos"][0]
    assert (vencido["estado_visible"], vencido["baja_en"], vencido["baja_fecha"]) == ("vencido", None, None)


# ─── 16 · Montaje y consola ───────────────────────────────────────────────────

@RELOJ
def test_quien_monta_ve_su_participacion_sin_plata_y_la_consola_la_cuenta_aparte(client, admin):
    import json

    from app.auth import create_mount_token
    from app.models.models import Space, SpaceLease, SpaceStatus, Supplier

    _plano(client, admin)
    a = _alta(client, admin, pb=2500, desde=D(2026, 10, 1), hasta=D(2026, 12, 31))["termino"]
    b = _alta(client, admin, espacio="GON-01-B", pb=1250, proveedor="Alpina")["termino"]

    def mi_espacio(code, contrato):
        token = create_mount_token(code, days=120, contrato=contrato)
        r = client.get("/api/montaje/mi-espacio", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200, r.text
        return r.json()

    e = mi_espacio("NAVE-GON-01-PC1", a["lease_id"])
    assert e["parte"] == {"token": "PC", "n": 1, "de": None, "texto": "Participación 1 · 25 % de la cara A"}
    assert (e["corto"], e["fixture_code"], e["proveedor"]) == ("GON-01-PC1", "GON-01", "Postobón")
    assert "1200000" not in json.dumps(e), "quien monta no ve plata"
    assert mi_espacio("NAVE-GON-01-B-PC1", b["lease_id"])["parte"]["texto"] == "Participación 1 · 12,5 % de la cara B"
    # Un lease de participación sin término (hecho a mano): sin porcentaje que decir.
    db = _bd()
    try:
        pc = Space(code="NAVE-GON-01-PC4", svg_id="NAVE-GON-01-PC4", name="x", zone="gondola", sede="NAVE",
                   area_m2=0.0, status=SpaceStatus.free)
        sup = Supplier(name="Huérfano SA")
        db.add_all([pc, sup])
        db.flush()
        huerfano = SpaceLease(space_id=pc.id, supplier_id=sup.id, start_date=date(2026, 12, 1),
                              end_date=date(2026, 12, 31), monthly_rent=1, is_active=True)
        db.add(huerfano)
        db.commit()
        huerfano_id = huerfano.id
    finally:
        db.close()
    assert mi_espacio("NAVE-GON-01-PC4", huerfano_id)["parte"]["texto"] == "Participación 4 de la cara A"

    # La consola: tipo propio (no «fuera del plano»), y ocupa su cara como una división.
    import app.plataforma_detalle as pd
    import app.plataforma_metricas as pm

    mapa = {"NAVE-GON-01": ("NAVE", "gondola"), "NAVE-GON-01-B": ("NAVE", "gondola")}
    tipos = pd._tipos_de_contrato(mapa, {}, ["NAVE-GON-01-PC1", "NAVE-GON-01-B-PC3", "NAVE-GON-09-PC1", "OTRA-01"])
    assert tipos["NAVE-GON-01-PC1"] == tipos["NAVE-GON-01-B-PC3"] == ("NAVE", "participacion")
    assert "NAVE-GON-09-PC1" not in tipos and "OTRA-01" not in tipos  # sin su cara en el plano: fuera del plano
    assert pm.cara_ocupada("NAVE-GON-01-PC1") == "NAVE-GON-01"
    assert pm.cara_ocupada("NAVE-GON-01-B-PC3") == "NAVE-GON-01-B"
    assert pm.cara_ocupada("NAVE-NEV-03-PU2") == "NAVE-NEV-03" and pm.cara_ocupada("NAVE-GON-01") == "NAVE-GON-01"


# ─── 17 · Borrar un proveedor ─────────────────────────────────────────────────

@RELOJ
def test_un_proveedor_con_reservas_o_contratos_de_participacion_no_se_borra(client, admin):
    _plano(client, admin)
    reserva = _alta(client, admin, tipo="reserva", proveedor="Nutresa")["termino"]
    contrato = _alta(client, admin, proveedor="Colanta")["termino"]
    r = client.delete(f"/api/suppliers/{reserva['proveedor']['id']}", headers=admin)
    assert r.status_code == 409 and "reserva" in r.text, r.text
    r = client.delete(f"/api/suppliers/{contrato['proveedor']['id']}", headers=admin)
    assert r.status_code == 409, r.text


# ─── 18 · Permisos ────────────────────────────────────────────────────────────

@RELOJ
def test_el_trabajador_solo_lee_la_ocupacion_anonima(client, admin, worker):
    from conftest import rutas_planas

    _plano(client, admin)
    _alta(client, admin, pb=2500, desde=D(2026, 10, 1), hasta=D(2026, 12, 31), marca="Hit", valor=3_333_333)
    _alta(client, admin, tipo="reserva", pb=1500, desde=D(2026, 11, 1), hasta=D(2026, 11, 30), proveedor="Alpina")
    revisadas = 0
    for ruta in rutas_planas(client.app):
        if not ruta.path.startswith("/api/participaciones"):
            continue
        for metodo in sorted(ruta.methods - {"HEAD", "OPTIONS"}):
            url = ruta.path.replace("{participacion_id}", "1")
            params = {"sede": "NAVE", "espacio": "GON-01"} if metodo == "GET" else None
            r = client.request(metodo, url, headers=worker, params=params, json=None if metodo == "GET" else {})
            esperado = 200 if (metodo, ruta.path) == ("GET", "/api/participaciones/ocupacion") else 403
            assert r.status_code == esperado, (metodo, ruta.path, r.status_code, r.text)
            revisadas += 1
    assert revisadas == 12, revisadas

    r = client.get("/api/participaciones/ocupacion", headers=worker, params={"sede": "NAVE"})
    cuerpo = r.json()
    prohibidas = {"proveedor", "proveedor_id", "supplier", "supplier_id", "marca", "valor", "valor_mensual",
                  "monthly_rent", "numero", "notas", "tipo", "codigo"}

    def claves(x):
        if isinstance(x, dict):
            for k, v in x.items():
                yield k
                yield from claves(v)
        elif isinstance(x, list):
            for v in x:
                yield from claves(v)

    assert not (set(claves(cuerpo)) & prohibidas), cuerpo
    assert "3333333" not in r.text and "Postobón" not in r.text and "Hit" not in r.text
    assert set(cuerpo["caras"]) == {"NAVE-GON-01", "NAVE-GON-01-B", "NAVE-PUN-01", "NAVE-MET-01", "NAVE-MET-02",
                                    "NAVE-ROB-01"}
    assert cuerpo["caras"]["NAVE-GON-01"] == {
        "intervalos": [{"desde": "2026-10-01", "hasta": "2026-12-31", "pb": 2500},
                       {"desde": "2026-11-01", "hasta": "2026-11-30", "pb": 1500}],
        "fisicos": []}
    assert client.get("/api/participaciones/ocupacion", headers=admin, params={"sede": "NAVE"}).json() == cuerpo
    # «Estado por espacio» del trabajador no cambia de forma: el contrato PC, sin plata.
    comercial = client.get("/api/spaces/comercial", headers=worker, params={"sede": "NAVE"}).json()
    pc = comercial["NAVE-GON-01-PC1"]
    assert (pc["negotiatedValue"], pc["observation"]) == (0, "")


# ─── 19 · Rutas en orden ──────────────────────────────────────────────────────

def test_las_rutas_literales_van_antes_que_las_parametricas(client):
    from conftest import rutas_planas

    rutas = [(r.path, m) for r in rutas_planas(client.app) if r.path.startswith("/api/participaciones")
             for m in sorted(r.methods - {"HEAD", "OPTIONS"})]
    assert rutas == [
        ("/api/participaciones/cara", "GET"),
        ("/api/participaciones/resumen", "GET"),
        ("/api/participaciones/ocupacion", "GET"),
        ("/api/participaciones/historial", "GET"),
        ("/api/participaciones/distribucion/borrador", "PUT"),
        ("/api/participaciones/distribucion/confirmar", "POST"),
        ("/api/participaciones/distribucion/descartar", "POST"),
        ("/api/participaciones/", "POST"),
        ("/api/participaciones/{participacion_id}", "PATCH"),
        ("/api/participaciones/{participacion_id}/confirmar", "POST"),
        ("/api/participaciones/{participacion_id}/cancelar", "POST"),
        ("/api/participaciones/{participacion_id}/renovar", "POST"),
    ]
    # Ningún GET lleva parámetros de ruta: el barrido del token de montaje los cubre sin relleno nuevo.
    assert not [p for p, m in rutas if m == "GET" and "{" in p]

    # La otra mitad del escenario 19: lo que pide el navegador
    # (`frontend/src/api/participaciones.ts`) son estas mismas rutas, con su
    # método. `probar-distribucion` fija la lista del cliente, pero nada la
    # comparaba con el servidor: una errata daba 404 y el store se la tragaba.
    import re
    from pathlib import Path

    raiz = Path(__file__).resolve().parents[2]
    texto = (raiz / "frontend" / "src" / "api" / "participaciones.ts").read_text(encoding="utf-8")
    base = re.search(r'baseURL:\s*"([^"]+)"', (raiz / "frontend" / "src" / "api" / "client.ts")
                     .read_text(encoding="utf-8")).group(1)
    prefijo = re.search(r'^const P = "([^"]+)";$', texto, re.M).group(1)
    pedidos = []
    for metodo, camino in re.findall(r"client\.(get|post|put|patch|delete)<[^>]*>\(`\$\{P\}([^`]*)`", texto):
        camino = camino.replace("${id}", "{participacion_id}")
        assert "${" not in camino, camino
        pedidos.append((base + prefijo + camino, metodo.upper()))
    assert len(re.findall(r"client\.(get|post|put|patch|delete)\b", texto)) == len(pedidos) == 12, pedidos
    assert sorted(pedidos) == sorted(rutas), sorted(set(pedidos) ^ set(rutas))


# ─── 20 · Resumen por día ─────────────────────────────────────────────────────

@RELOJ
def test_el_resumen_suma_un_dia_y_una_vez_por_participacion(client, admin):
    _plano(client, admin)
    m1 = _alta(client, admin, espacio="MET-01", pb=6000, desde=D(2026, 11, 1), hasta=D(2026, 11, 30))["termino"]
    m2 = _alta(client, admin, espacio="MET-01", pb=6000, desde=D(2026, 12, 1), hasta=D(2026, 12, 31),
               proveedor="Alpina")["termino"]
    _distribuir(client, admin, "confirmar", "MET-01", 0,
                _zonas((m1["space_id"], _rect(0, 0.6)), (m2["space_id"], _rect(0, 0.6))))
    g1 = _alta(client, admin, pb=2500, desde=D(2026, 10, 1), hasta=D(2026, 11, 30))["termino"]
    r = client.post(f"/api/participaciones/{g1['id']}/renovar", headers=admin, json={
        "version": 1, "tipo": "contrato", "desde": D(2026, 12, 1), "hasta": D(2026, 12, 31), "valor_mensual": 1})
    assert r.status_code == 201, r.text
    _alta(client, admin, espacio="PUN-01", tipo="reserva", pb=1000, desde=D(2026, 11, 1), hasta=D(2026, 11, 30),
          caduca=D(2026, 10, 20), proveedor="Colanta")
    _alta(client, admin, espacio="PUN-01", tipo="reserva", pb=1000, desde=D(2026, 11, 1), hasta=D(2026, 11, 30),
          caduca=D(2026, 11, 10), proveedor="Colanta")

    def resumen(**q):
        r = client.get("/api/participaciones/resumen", headers=admin, params={"sede": "NAVE", **q})
        assert r.status_code == 200, r.text
        return r.json()

    noviembre = resumen(dia=D(2026, 11, 15))
    metro = next(c for c in noviembre["caras"] if c["codigo_cara"] == "NAVE-MET-01")
    assert (metro["comprometido_dia_pb"], metro["dibujado_dia_pb"], metro["pendiente_dia_pb"]) == (6000, 6000, 0)
    assert [(p["numero"], p["cuenta_el_dia"]) for p in metro["participaciones"]] == [(1, True), (2, False)]
    assert metro["participaciones"][0]["m2_contratados"] == pytest.approx(6000 / 10000 * metro["area_util_m2"])
    assert metro["estado_distribucion"] == "confirmada"
    diciembre = resumen(dia=D(2026, 12, 15))
    metro = next(c for c in diciembre["caras"] if c["codigo_cara"] == "NAVE-MET-01")
    assert (metro["dibujado_dia_pb"], [p["numero"] for p in metro["participaciones"] if p["cuenta_el_dia"]]) == (6000, [2])
    # La participación renovada es UNA fila: el término que rige ese día (el de diciembre).
    gondola = next(c for c in diciembre["caras"] if c["codigo_cara"] == "NAVE-GON-01")
    assert [(p["numero"], p["desde"]) for p in gondola["participaciones"]] == [(1, "2026-12-01")]
    postobon = next(p for p in noviembre["por_proveedor"] if p["proveedor"] == "Postobón")
    area_gondola = next(c for c in noviembre["caras"] if c["codigo_cara"] == "NAVE-GON-01")["area_util_m2"]
    assert (postobon["participaciones"], postobon["caras"]) == (2, 2), "la renovación firmada no suma dos veces"
    assert postobon["m2_contratados_dia"] == pytest.approx(0.6 * 1.0 + 0.25 * area_gondola)
    alpina_id = next(p for p in diciembre["por_proveedor"] if p["proveedor"] == "Alpina")["proveedor_id"]
    solo = resumen(dia=D(2026, 12, 15), proveedor_id=alpina_id)
    assert [c["codigo_cara"] for c in solo["caras"]] == ["NAVE-MET-01"]
    assert [p["proveedor"] for p in solo["caras"][0]["participaciones"]] == ["Alpina"]
    totales = resumen()["totales"]
    assert totales["reservas_por_caducar"] == 1 and totales["caras_por_participacion"] == 6
    assert totales["sin_distribuir"] == 5 and totales["huerfanos"] == 0
    # Una cara o un mueble (los dos lados).
    assert [c["codigo_cara"] for c in resumen(espacio="GON-01")["caras"]] == ["NAVE-GON-01", "NAVE-GON-01-B"]
    assert [c["codigo_cara"] for c in resumen(espacio="GON-01-B")["caras"]] == ["NAVE-GON-01-B"]

    historial = client.get("/api/participaciones/historial", headers=admin,
                           params={"sede": "NAVE", "espacio": "MET-01"}).json()
    assert [e["accion"] for e in historial["entradas"]] == [
        "distribucion.confirmada", "participacion.contrato", "participacion.contrato"]
    assert historial["entradas"][0]["despues"]["zonas"][0]["vertices"] == _rect(0, 0.6)
    por_participacion = client.get("/api/participaciones/historial", headers=admin,
                                   params={"participacion_id": g1["id"]}).json()
    assert [e["accion"] for e in por_participacion["entradas"]] == ["participacion.renovada", "participacion.contrato"]


@RELOJ
def test_el_resumen_nombra_lo_que_hay_que_revisar_sin_mueble_vivo_huerfanos_y_borradores(client, admin):
    """Lo que «Para revisar» (Supervisar) dice con fecha y nombre: la cara SIN
    MUEBLE cuenta sólo si le quedan términos vivos (una reserva cancelada no
    se borra nunca, D14, y dejaba la tarjeta para siempre), el contrato de
    participación sin término con su código y sus fechas, y el borrador de
    cada cara con su instante y su día de Colombia (también encima de una
    confirmada, que sigue «confirmada»)."""
    import json

    import time_machine
    from app.models.models import LayoutSnapshot, Space, SpaceLease, SpaceStatus, Supplier

    _plano(client, admin)
    viva = _alta(client, admin, espacio="PUN-01", tipo="reserva", pb=2000, desde=D(2026, 11, 1),
                 hasta=D(2026, 11, 30), caduca=D(2026, 10, 25))["termino"]
    muerta = _alta(client, admin, espacio="MET-02", tipo="reserva", pb=2000, desde=D(2026, 11, 1),
                   hasta=D(2026, 11, 30), caduca=D(2026, 10, 25))["termino"]
    r = client.post(f"/api/participaciones/{muerta['id']}/cancelar", headers=admin, json={"version": muerta["version"]})
    assert r.status_code == 200, r.text
    _alta(client, admin, espacio="ROB-01", pb=2500, desde=D(2026, 10, 1), hasta=D(2026, 12, 31))
    g = _alta(client, admin, pb=3000, desde=D(2026, 10, 1), hasta=D(2026, 12, 31))["termino"]
    sup = _cara(client, admin)["superficie"]
    _distribuir(client, admin, "confirmar", "GON-01", 0, _zonas((g["space_id"], _franja(sup, 0, 0.3))))
    _distribuir(client, admin, "borrador", "GON-01", 1, _zonas((g["space_id"], _franja(sup, 0, 0.31))))

    # Un contrato de participación sin término (un script, un archivo viejo).
    db = _bd()
    try:
        pc = Space(code="NAVE-GON-01-PC9", svg_id="NAVE-GON-01-PC9", name="x", zone="gondola", sede="NAVE",
                   area_m2=0.0, status=SpaceStatus.free)
        sup_h = Supplier(name="Huérfano SA")
        db.add_all([pc, sup_h])
        db.flush()
        db.add(SpaceLease(space_id=pc.id, supplier_id=sup_h.id, start_date=date(2027, 1, 1),
                          end_date=date(2027, 1, 31), monthly_rent=1, is_active=True))
        db.commit()
    finally:
        db.close()

    def resumen(headers=admin):
        r = client.get("/api/participaciones/resumen", headers=headers, params={"sede": "NAVE"})
        assert r.status_code == 200, r.text
        return r.json()

    r0 = resumen()
    assert r0["sin_mueble"] == [] and r0["totales"]["sin_mueble"] == 0
    assert r0["huerfanos"] == [{"codigo": "NAVE-GON-01-PC9", "desde": "2027-01-01", "hasta": "2027-01-31"}]
    assert r0["totales"]["huerfanos"] == 1
    gondola = next(c for c in r0["caras"] if c["codigo_cara"] == "NAVE-GON-01")
    assert gondola["estado_distribucion"] == "confirmada", "un borrador encima de la confirmada no cambia el estado"
    assert gondola["borrador_en"].startswith("2026-10-17T15:00") and gondola["borrador_dia"] == "2026-10-17"
    assert all(c["borrador_en"] is None and c["borrador_dia"] is None
               for c in r0["caras"] if c["codigo_cara"] != "NAVE-GON-01")

    # Un plano viejo (el guardado lo frena): PUN-01 deja de venderse por
    # participación con su reserva viva, MET-02 también pero sólo tenía una
    # reserva cancelada, y ROB-01 desaparece con su contrato vivo.
    db = _bd()
    try:
        snap = db.query(LayoutSnapshot).filter_by(sede="NAVE").one()
        muebles = [f for f in json.loads(snap.fixtures_json) if f["code"] != "ROB-01"]
        for f in muebles:
            if f["code"] in ("PUN-01", "MET-02"):
                f.pop("partes", None)
            if f["code"] == "GON-01":
                f["id"] = "f-GON-01-otro"     # otro mueble con el mismo código (§2.5)
        snap.fixtures_json = json.dumps(muebles)
        db.commit()
    finally:
        db.close()
    r1 = resumen()
    assert r1["sin_mueble"] == [
        {"codigo_cara": "NAVE-PUN-01", "cara": "A", "fixture_code": "PUN-01", "en_el_plano": True,
         "participaciones": 1, "hasta": "2026-11-30"},
        {"codigo_cara": "NAVE-ROB-01", "cara": "A", "fixture_code": "ROB-01", "en_el_plano": False,
         "participaciones": 1, "hasta": "2026-12-31"},
    ], "la reserva cancelada de MET-02 cuenta como «sin mueble», o falta una cara con términos vivos"
    assert r1["totales"]["sin_mueble"] == 2
    assert viva["codigo"] == "NAVE-PUN-01-PC1"
    # El borrador se dibujó para el mueble de antes: no vale para el de ahora.
    otro = next(c for c in r1["caras"] if c["codigo_cara"] == "NAVE-GON-01")
    assert (otro["estado_distribucion"], otro["borrador_en"], otro["borrador_dia"]) == ("sin_distribuir", None, None)

    # La reserva caduca sola: la cara sale de la lista sin que nadie la toque.
    with time_machine.travel("2026-10-26T15:00:00+00:00", tick=True):
        r2 = resumen(_entrar(client))
        assert [x["codigo_cara"] for x in r2["sin_mueble"]] == ["NAVE-ROB-01"] and r2["totales"]["sin_mueble"] == 1


# ─── 21 · Lo que dejó la revisión final ───────────────────────────────────────

@RELOJ
def test_una_fila_de_cara_sin_sede_no_deja_la_participacion_sin_confirmar_renovar_ni_cambiar(client, admin, monkeypatch):
    """Una fila ``NAVE-GON-01`` sin sede (de antes de la columna, de
    ``find-or-create`` o de un reporte de montaje sin sede) la reusa el alta.
    Confirmar, renovar y cambiar buscaban el mueble con esa sede vacía y daban
    404 «ya no está en el plano de .» con el mueble en el plano: sólo quedaba
    cancelar y cargar otra participación, sin sus zonas ni la continuidad de
    la renovación. El alta le completa la sede; y si una fila igual llega sin
    ella, la cara del término la toma de su fila PC o del prefijo del código."""
    import app.services.participaciones as servicio
    from app.models.models import Space, SpaceStatus
    from app.services.participaciones import _sede_por_prefijo

    _plano(client, admin)
    db = _bd()
    try:
        db.add(Space(code="NAVE-GON-01", svg_id="fix-NAVE-GON-01", name="GON-01", zone="Pasillo", sede=None,
                     area_m2=4.0, status=SpaceStatus.free))
        db.commit()
    finally:
        db.close()

    def sedes(*codigos, poner=False):
        """La sede de esas filas; con ``poner``, se la borra (NULL)."""
        db = _bd()
        try:
            filas = db.query(Space).filter(Space.code.in_(codigos)).order_by(Space.code).all()
            if poner:
                for f in filas:
                    f.sede = None
                db.commit()
            return [f.sede for f in filas]
        finally:
            db.close()

    reserva = _alta(client, admin, tipo="reserva", pb=2500, caduca=D(2026, 10, 25))["termino"]
    contrato = _alta(client, admin, pb=2000, proveedor="Alpina", marca="Bon Yurt", desde=D(2026, 10, 1),
                     hasta=D(2026, 12, 31))["termino"]
    assert sedes("NAVE-GON-01") == ["NAVE"], "el alta reusa la fila sin completarle la sede"

    # Una fila que sigue sin sede: la cara sale de la sede de la fila PC del término. El prefijo es el
    # último recurso (una sede puede tener guiones): acá, si se usara, daría una sede sin plano.
    sedes("NAVE-GON-01", poner=True)
    with monkeypatch.context() as m:
        m.setattr(servicio, "_sede_por_prefijo", lambda codigo, plano: "SIN-PLANO")
        r = client.patch(f"/api/participaciones/{reserva['id']}", headers=admin,
                         json={"version": reserva["version"], "notas": "con la sede de la fila PC"})
    assert r.status_code == 200, r.text
    reserva = r.json()["termino"]

    # Ni la fila de cara ni las PC: la sede sale del prefijo del código.
    sedes("NAVE-GON-01", reserva["codigo"], contrato["codigo"], poner=True)
    r = client.post(f"/api/participaciones/{reserva['id']}/confirmar", headers=admin,
                    json={"version": reserva["version"], "valor_mensual": 1000})
    assert r.status_code == 200, r.text
    assert r.json()["termino"]["estado"] == "contrato"
    r = client.post(f"/api/participaciones/{contrato['id']}/renovar", headers=admin,
                    json={"version": contrato["version"], "tipo": "contrato", "desde": D(2027, 1, 1),
                          "hasta": D(2027, 3, 31), "valor_mensual": 1000})
    assert r.status_code == 201, r.text
    assert r.json()["termino"]["renueva_a"] == contrato["id"]

    # El prefijo: la sede más larga que calza y cuyo plano tiene el mueble.
    class Plano:
        def __init__(self, muebles):
            self.muebles = muebles

        def sedes(self):
            return sorted(self.muebles)

        def resolver(self, sede, espacio):
            return object() if espacio in self.muebles.get(sede, ()) else None

    assert _sede_por_prefijo("SAN-JOSE-GON-01", Plano({"SAN": {"JOSE-GON-01"}, "SAN-JOSE": {"GON-01"}})) == "SAN-JOSE"
    assert _sede_por_prefijo("SAN-GON-01", Plano({"SAN": {"GON-01"}, "SAN-JOSE": {"GON-01"}})) == "SAN"
    assert _sede_por_prefijo("SAN-JOSE-GON-01", Plano({"SAN": {"JOSE-GON-01"}, "SAN-JOSE": {"GON-02"}})) == "SAN", \
        "la sede más larga calza pero su plano no tiene el mueble: es de la otra"
    assert _sede_por_prefijo("SAN-JOSE-GON-09", Plano({"SAN": set(), "SAN-JOSE": set()})) == "SAN-JOSE", \
        "sin el mueble, la frase del 404 igual nombra la sede"
    assert _sede_por_prefijo("OTRA-GON-01", Plano({"SAN": {"GON-01"}})) == ""


@RELOJ
def test_cancelar_una_reserva_caducada_no_reescribe_su_historia(client, admin):
    """Una reserva que caducó el 20 no se «cancela» el 25: pasaba a cancelada
    con la fecha del 25 y el historial dejaba de decir que caducó (D14). 409
    con una frase que dice qué pasa, y la fila no se toca. La que caduca HOY
    todavía se sostiene: ésa sí se cancela."""
    import time_machine

    from app.models.participaciones import HistorialParticipacion, Participacion

    _plano(client, admin)
    caducada = _alta(client, admin, tipo="reserva", pb=2500, caduca=D(2026, 10, 20))["termino"]
    de_hoy = _alta(client, admin, espacio="PUN-01", tipo="reserva", pb=2500, caduca=D(2026, 10, 25))["termino"]
    with time_machine.travel("2026-10-25T15:00:00+00:00", tick=True):
        otra = _entrar(client)
        r = client.post(f"/api/participaciones/{caducada['id']}/cancelar", headers=otra,
                        json={"version": caducada["version"]})
        assert r.status_code == 409, r.text
        assert r.json()["detail"] == {
            "code": "reserva_caducada",
            "message": "La reserva ya caducó el 20 oct 2026: no hace falta cancelarla; queda en el historial."}
        db = _bd()
        try:
            t = db.get(Participacion, caducada["id"])
            assert (t.estado, t.version, t.baja_en, t.baja_por) == ("reserva", caducada["version"], None, None)
            assert [h.accion for h in db.query(HistorialParticipacion)
                    .filter_by(participacion_id=caducada["id"]).order_by(HistorialParticipacion.id)] == [
                "participacion.reserva"]
        finally:
            db.close()
        h = client.get("/api/participaciones/historial", headers=otra,
                       params={"participacion_id": caducada["id"]}).json()
        assert [(d["accion"], d["dia"]) for d in h["derivados"]] == [("reserva.caducada", "2026-10-21")]
        assert [e["accion"] for e in h["entradas"]] == ["participacion.reserva"]
        assert _cara(client, otra)["participaciones"][0]["terminos"][0]["estado_visible"] == "reserva_caducada"

        r = client.post(f"/api/participaciones/{de_hoy['id']}/cancelar", headers=otra,
                        json={"version": de_hoy["version"]})
        assert r.status_code == 200, r.text
        assert r.json()["termino"]["estado_visible"] == "reserva_cancelada"


@RELOJ
def test_un_lease_de_participacion_colgado_de_otra_fila_de_cara_cuenta_como_la_cara_entera(client, admin):
    """La carrera entre borrar la sede y la primera alta de una cara (§2.5),
    armada a mano: el archivo renombra la fila de cara (sin términos, no toma
    su candado) a ``NAVE-GON-01#id`` y el alta concurrente ya la había reusado
    y creó ``NAVE-GON-01-PC1``, que el archivo no vio. Queda un lease PC vivo
    cuyo término cuelga de la fila archivada. ``fisicos_de`` lo descartaba por
    tener término —de OTRA fila—: ese 30 % no contaba en ninguna parte y se
    podía vender el 100 % encima. Ahora va como huérfano (la cara entera) y
    «Para revisar» lo nombra."""
    from app.models.models import Space

    _plano(client, admin)
    _alta(client, admin, pb=3000, desde=D(2026, 11, 1), hasta=D(2026, 11, 30))
    db = _bd()
    try:
        fila = db.query(Space).filter_by(code="NAVE-GON-01").one()
        fila.code, fila.svg_id = f"NAVE-GON-01#{fila.id}", f"{fila.svg_id}#{fila.id}"
        db.commit()
    finally:
        db.close()

    huerfano = {"codigo": "NAVE-GON-01-PC1", "desde": "2026-11-01", "hasta": "2026-11-30", "huerfano": True}
    assert _cara(client, admin)["capacidad"]["fisicos"] == [huerfano]
    r = _alta(client, admin, pb=7000, desde=D(2026, 11, 10), hasta=D(2026, 11, 20), codigo=409)
    assert r["detail"]["code"] == "cara_vendida_entera", r

    # La cara vuelve a tener su fila (sin términos de antes): el de la fila archivada sigue contando,
    # el número no se reutiliza, y el término de ESTA fila no es «físico».
    nueva = _alta(client, admin, pb=2000, desde=D(2026, 12, 1), hasta=D(2026, 12, 31))["termino"]
    assert nueva["numero"] == 2
    assert _cara(client, admin)["capacidad"]["fisicos"] == [huerfano]
    _alta(client, admin, pb=1000, desde=D(2026, 11, 10), hasta=D(2026, 11, 20), codigo=409)
    assert _cara(client, admin, espacio="GON-01-B")["capacidad"]["fisicos"] == []
    ocupacion = client.get("/api/participaciones/ocupacion", headers=admin, params={"sede": "NAVE"}).json()
    assert ocupacion["caras"]["NAVE-GON-01"] == {
        "intervalos": [{"desde": "2026-12-01", "hasta": "2026-12-31", "pb": 2000}],
        "fisicos": [{"desde": "2026-11-01", "hasta": "2026-11-30"}]}
    resumen = client.get("/api/participaciones/resumen", headers=admin, params={"sede": "NAVE"}).json()
    assert resumen["huerfanos"] == [{"codigo": "NAVE-GON-01-PC1", "desde": "2026-11-01", "hasta": "2026-11-30"}]


@RELOJ
def test_el_historial_fecha_lo_derivado_con_el_dia_de_colombia_y_lo_ordena_contra_lo_real(client, admin):
    """Contrato del historial: el vencimiento de un contrato y la caducidad de
    una reserva (derivados, sin fila: D6) traen ``derivado: true``, ``dia`` (el
    día de Colombia en que pasó: el siguiente al último día de vigencia) y
    ``en``, la medianoche de ese día en Colombia escrita en UTC, como el
    ``en`` de las entradas reales. Con ``"en": "2026-10-20"`` el navegador en
    Colombia lo mostraba el 19 a las 7 p. m., y lo ordenaba ANTES de lo que
    pasó a las 10 p. m. del 19; con ``-05:00``, el panel (que compara el
    texto) seguía ordenándolo así.

    El reloj, a las 21:00 del 20 en Colombia (ya el 21 en UTC): lo que vale
    hasta el 20 todavía rige, y no aparece ni vencido ni caducado."""
    from datetime import datetime

    import time_machine

    _plano(client, admin)
    vencido = _alta(client, admin, espacio="MET-01", pb=3000, desde=D(2026, 10, 1), hasta=D(2026, 10, 19))["termino"]
    _alta(client, admin, espacio="MET-01", pb=3000, desde=D(2026, 10, 1), hasta=D(2026, 10, 20), proveedor="Alpina")
    caducada = _alta(client, admin, espacio="MET-01", tipo="reserva", pb=2000, desde=D(2026, 11, 1),
                     hasta=D(2026, 11, 30), caduca=D(2026, 10, 19), proveedor="Colanta")["termino"]
    sostiene = _alta(client, admin, espacio="MET-01", tipo="reserva", pb=2000, desde=D(2026, 11, 1),
                     hasta=D(2026, 11, 30), caduca=D(2026, 10, 20), proveedor="Nutresa")["termino"]

    # Una entrada real a las 10 p. m. del 19 en Colombia (03:00 del 20 en UTC).
    with time_machine.travel("2026-10-20T03:00:00+00:00", tick=False):
        r = client.patch(f"/api/participaciones/{sostiene['id']}", headers=_entrar(client),
                         json={"version": sostiene["version"], "notas": "a la noche"})
        assert r.status_code == 200, r.text

    with time_machine.travel("2026-10-21T02:00:00+00:00", tick=False):
        h = client.get("/api/participaciones/historial", headers=_entrar(client),
                       params={"sede": "NAVE", "espacio": "MET-01"}).json()
    assert [(d["accion"], d["participacion_id"], d["dia"], d["en"], d["derivado"]) for d in h["derivados"]] == [
        ("reserva.caducada", caducada["id"], "2026-10-20", "2026-10-20T05:00:00+00:00", True),
        ("participacion.vencida", vencido["id"], "2026-10-20", "2026-10-20T05:00:00+00:00", True),
    ], "lo que vale hasta el 20 (hoy en Colombia) aparece vencido o caducado, o falta un derivado"
    assert all("dia" not in e and "derivado" not in e for e in h["entradas"])
    editada = next(e for e in h["entradas"] if e["accion"] == "participacion.editada")
    assert editada["en"].startswith("2026-10-20T03:00")
    # Juntas y ordenadas por instante, lo derivado del 20 va después de las 10 p. m. del 19.
    juntas = sorted(h["entradas"] + h["derivados"], key=lambda e: datetime.fromisoformat(e["en"]), reverse=True)
    assert [e["accion"] for e in juntas[:3]] == ["reserva.caducada", "participacion.vencida", "participacion.editada"]
    # Y por el texto, como ordena el panel (`a.en < b.en` en PanelDeDistribucion): el mismo orden.
    por_texto = sorted(h["entradas"] + h["derivados"], key=lambda e: e["en"], reverse=True)
    assert [e["accion"] for e in por_texto] == [e["accion"] for e in juntas], \
        "ordenar por el texto de `en` no da el orden de los instantes: lo derivado y lo real no comparten formato"
