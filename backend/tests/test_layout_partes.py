"""Lo vendido por partes no se mueve, ni se pierde, al guardar el plano.

Con la puerta 2 de una nevera vendida, el plano no puede pasar la nevera de 3
a 4 puertas: la «puerta 2» sería otra hoja, y lo que firmó el proveedor ya no
es lo que se monta. ``PUT /layout`` contesta 409 ``partes_vendidas``; si la
puerta vendida directamente desaparece (bajar a 2 puertas con la 3 vendida,
dejar de venderla por puertas) contesta el 409 ``contratos_vivos`` de siempre.
Un plano que no toca nada de eso se guarda igual que antes.

Y una pestaña abierta con el código de antes, que arme ``partes`` sólo con lo
que conoce, no borra la manera de venderla: el servidor le rellena adentro de
``partes`` la clave que llega AUSENTE, y sólo un ``null`` la borra.
"""
from tests import sin_planilla  # las partes: la revisión común, sin las reglas de la planilla
import json
from datetime import timedelta

from app.fechas import hoy as hoy_en_colombia  # el «hoy» del negocio: Colombia

HOY = hoy_en_colombia()


def _d(dias: int) -> str:
    return (HOY + timedelta(days=dias)).isoformat()


def _nevera(puertas=3, division="puertas", id_="f-NEV-03", **extra):
    partes = {"puertas": puertas}
    if division is not None:
        partes["division"] = division
    return {
        "id": id_, "code": "NEV-03", "sede": "NAVE", "type": "nevera_puertas",
        "label": "Nevera de Puertas", "cx": 4, "cz": 2, "rotY": 0,
        "w": 2.07, "d": 0.7, "h": 2.1, "color": "#1e293b", "partes": partes, **extra,
    }


def _guardar(client, admin, fixtures):
    return client.put("/api/layout/NAVE", headers=admin, json={"fixtures": fixtures, "base_updated_at": None})


def _vender(client, admin, espacio, desde=1, hasta=30):
    r = sin_planilla.post("/api/leases/bulk/confirmar", json={"sede": "NAVE", "filas": [
        {"fila": 1, "espacio": espacio, "sede": "NAVE", "proveedor": "Postobón", "valor": 1,
         "desde": _d(desde), "hasta": _d(hasta)}]})
    assert r.status_code == 200 and r.json()["filas"][0]["lease_id"], r.text


def _guardado(client, admin):
    return client.get("/api/layout/NAVE", headers=admin).json()["fixtures"]


def test_con_una_puerta_vendida_no_se_pasa_de_3_a_4_puertas(client, admin):
    assert _guardar(client, admin, [_nevera()]).status_code == 200
    _vender(client, admin, "NEV-03-PU2")
    r = _guardar(client, admin, [_nevera(puertas=4)])
    assert r.status_code == 409, r.text
    d = r.json()["detail"]
    assert d["code"] == "partes_vendidas"
    assert "de 3 a 4 puertas" in d["choques"][0] and "NEV-03-PU2" in d["choques"][0], d
    # El plano quedó como estaba.
    assert _guardado(client, admin)[0]["partes"] == {"puertas": 3, "division": "puertas"}


def test_firmada_para_el_mes_que_viene_tambien_frena(client, admin):
    assert _guardar(client, admin, [_nevera()]).status_code == 200
    _vender(client, admin, "NEV-03-PU1", desde=35, hasta=60)
    r = _guardar(client, admin, [_nevera(puertas=2)])
    assert r.status_code == 409 and r.json()["detail"]["code"] == "partes_vendidas", r.text


def test_vencida_no_frena(client, admin):
    assert _guardar(client, admin, [_nevera()]).status_code == 200
    _vender(client, admin, "NEV-03-PU2", desde=-40, hasta=-10)
    assert _guardar(client, admin, [_nevera(puertas=4)]).status_code == 200


def test_la_puerta_vendida_que_desaparece_frena_como_siempre(client, admin):
    assert _guardar(client, admin, [_nevera()]).status_code == 200
    _vender(client, admin, "NEV-03-PU3")
    r = _guardar(client, admin, [_nevera(puertas=2)])
    assert r.status_code == 409 and r.json()["detail"]["code"] == "contratos_vivos", r.text
    # Sacar la división con un `null` (como lo dice el navegador de hoy), igual.
    # Sin la clave es «no sé» (una pestaña de antes): se rellena y se guarda.
    r = _guardar(client, admin, [{**_nevera(), "partes": {"puertas": 3, "division": None}}])
    assert r.status_code == 409 and r.json()["detail"]["code"] == "contratos_vivos", r.text


def test_otra_nevera_con_el_mismo_codigo_tambien_frena(client, admin):
    """Se compara por el CÓDIGO del mueble: borrar NEV-03 y dibujar otra NEV-03
    con 4 puertas es mover la puerta vendida igual."""
    assert _guardar(client, admin, [_nevera()]).status_code == 200
    _vender(client, admin, "NEV-03-PU2")
    r = _guardar(client, admin, [_nevera(puertas=4, id_="otra")])
    assert r.status_code == 409 and r.json()["detail"]["code"] == "partes_vendidas", r.text


def test_mover_estirar_o_cambiar_lo_demas_se_guarda(client, admin):
    assert _guardar(client, admin, [_nevera()]).status_code == 200
    _vender(client, admin, "NEV-03-PU2")
    # El ancho: las puertas se estiran parejo, no cambia cuál es cuál.
    assert _guardar(client, admin, [_nevera(w=2.4, cx=6, rotY=1.2)]).status_code == 200
    # La nevera entera vendida no frena cambiar las puertas (no hay puertas vendidas).


def test_la_entera_vendida_no_frena_cambiar_las_puertas(client, admin):
    assert _guardar(client, admin, [_nevera()]).status_code == 200
    _vender(client, admin, "NEV-03")
    assert _guardar(client, admin, [_nevera(puertas=4)]).status_code == 200


def test_sin_partes_vendidas_se_cambia_sin_preguntar(client, admin):
    assert _guardar(client, admin, [_nevera()]).status_code == 200
    assert _guardar(client, admin, [_nevera(puertas=4)]).status_code == 200
    assert _guardar(client, admin, [_nevera(division=None)]).status_code == 200


def test_una_pestana_vieja_no_borra_como_se_vende(client, admin):
    """La pestaña de antes conoce las puertas y no `division`: manda `partes`
    sólo con las puertas. El servidor rellena lo que falta adentro."""
    assert _guardar(client, admin, [_nevera()]).status_code == 200
    assert _guardar(client, admin, [{**_nevera(), "partes": {"puertas": 3}}]).status_code == 200
    assert _guardado(client, admin)[0]["partes"] == {"puertas": 3, "division": "puertas"}
    # `partes` ausente entera: se rellena entera, como siempre.
    sin = {k: v for k, v in _nevera().items() if k != "partes"}
    assert _guardar(client, admin, [sin]).status_code == 200
    assert _guardado(client, admin)[0]["partes"] == {"puertas": 3, "division": "puertas"}
    # Un `null` adentro sí la borra, y no se guarda el `null`.
    assert _guardar(client, admin, [{**_nevera(), "partes": {"puertas": 3, "division": None}}]).status_code == 200
    assert _guardado(client, admin)[0]["partes"] == {"puertas": 3}


def test_un_plano_sin_partes_se_guarda_byte_a_byte_igual(client, admin):
    punta = {"id": "p1", "code": "PUN-01", "sede": "NAVE", "type": "punta", "label": "Punta",
             "cx": 1, "cz": 1, "rotY": 0, "w": 0.9, "d": 0.4, "h": 1.8, "color": "#6366f1"}
    assert _guardar(client, admin, [punta]).status_code == 200
    assert _guardar(client, admin, [punta]).status_code == 200
    from app.database import SessionLocal
    from app.models.models import LayoutSnapshot
    db = SessionLocal()
    try:
        assert json.loads(db.query(LayoutSnapshot).one().fixtures_json) == [punta]
    finally:
        db.close()


def test_un_nombre_que_se_lee_como_una_parte_no_entra(client, admin):
    punta = {"id": "p1", "code": "PUN-01", "sede": "NAVE", "type": "punta", "label": "Punta",
             "cx": 1, "cz": 1, "rotY": 0, "w": 0.9, "d": 0.4, "h": 1.8, "color": "#6366f1"}
    assert _guardar(client, admin, [punta]).status_code == 200
    for nombre in ("PUN-01-PU2", "PUN-01-B", "PUN-01-TR3"):
        r = _guardar(client, admin, [{**punta, "code": nombre}])
        assert r.status_code == 409, (nombre, r.text)
        assert r.json()["detail"]["code"] == "nombre_reservado", r.text
    # Un plano que ya lo tenía se sigue guardando (se escribe por abajo).
    from app.database import SessionLocal
    from app.models.models import LayoutSnapshot
    db = SessionLocal()
    try:
        snap = db.query(LayoutSnapshot).one()
        snap.fixtures_json = json.dumps([{**punta, "code": "PUN-01-B"}])
        db.commit()
    finally:
        db.close()
    assert _guardar(client, admin, [{**punta, "code": "PUN-01-B", "cx": 2}]).status_code == 200


# ─── Las participaciones de una cara (diseño de participaciones, §4.4) ────────

def _gondola_pc(division="participacion", **extra):
    """Una góndola doble que se vende por participación (``GON-01-PC3``)."""
    return {
        "id": "f-GON-01", "code": "GON-01", "sede": "NAVE", "type": "gondola", "gondolaType": "double",
        "label": "Góndola", "cx": 2, "cz": 2, "rotY": 0, "w": 1.0, "d": 0.9, "h": 1.8, "color": "#6366f1",
        "partes": {"division": division}, **extra,
    }


def _espacio_directo(codigo, desde=None, hasta=None, sede="NAVE"):
    """Un espacio (y su contrato, si hay fechas) escrito directo en la base: la
    participación todavía no tiene su camino propio (llega con su router), y la
    planilla no es el camino de una participación."""
    from datetime import date
    from app.database import SessionLocal
    from app.models.models import Space, SpaceLease, Supplier
    db = SessionLocal()
    try:
        space = Space(code=codigo, svg_id=f"fix-{codigo}", name=codigo, zone="gondola", sede=sede, area_m2=0.0)
        db.add(space)
        db.flush()
        if desde is not None:
            sup = db.query(Supplier).filter(Supplier.name == "Postobón").first() or Supplier(name="Postobón")
            db.add(sup)
            db.flush()
            db.add(SpaceLease(space_id=space.id, supplier_id=sup.id, monthly_rent=1, is_active=True,
                              start_date=date.fromisoformat(_d(desde)), end_date=date.fromisoformat(_d(hasta))))
        db.commit()
    finally:
        db.close()


def test_una_participacion_viva_no_se_queda_sin_su_cara(client, admin):
    """Un contrato de participación (``GON-01-PC1``) se ofrece mientras su cara
    se venda por participación (``layout_lookup.ofrece``): el guardado que
    saca la división, pasa la doble a mural o la vende por tramos lo frena con
    el 409 ``contratos_vivos`` de siempre, nombrándolo. Lo que no toca la cara
    se guarda, y una participación vencida no frena. Una participación no tiene
    lugar físico: ``partes_que_se_moverian`` no la cuenta como movida."""
    assert _guardar(client, admin, [_gondola_pc()]).status_code == 200
    _espacio_directo("NAVE-GON-01-PC1", desde=1, hasta=30)
    _espacio_directo("NAVE-GON-01-B-PC2", desde=10, hasta=60)
    _espacio_directo("NAVE-GON-01-PC3", desde=-40, hasta=-10)

    # Mover la góndola o cambiarle los entrepaños no toca cómo se vende.
    assert _guardar(client, admin, [_gondola_pc(cx=6, rotY=1.2)]).status_code == 200
    assert _guardar(client, admin, [_gondola_pc(entrepanos=5)]).status_code == 200

    # Doble → mural: la B se va, y con ella su participación viva.
    r = _guardar(client, admin, [_gondola_pc(gondolaType="wall")])
    assert r.status_code == 409 and r.json()["detail"]["code"] == "contratos_vivos", r.text
    choques = r.json()["detail"]["choques"]
    assert len(choques) == 1 and "«GON-01-B-PC2»" in choques[0] and "Postobón" in choques[0], choques

    # Sacar la división (con el `null` del navegador de hoy) o venderla por
    # tramos: las dos vivas, no la vencida.
    for partes in ({"division": None}, {"division": "tramos", "tramos": 2}):
        r = _guardar(client, admin, [{**_gondola_pc(), "partes": partes}])
        assert r.status_code == 409 and r.json()["detail"]["code"] == "contratos_vivos", (partes, r.text)
        texto = " ".join(r.json()["detail"]["choques"])
        assert "«GON-01-PC1»" in texto and "«GON-01-B-PC2»" in texto and "GON-01-PC3" not in texto, texto
    # Marcarla no comercializable, también.
    r = _guardar(client, admin, [_gondola_pc(rentable=False)])
    assert r.status_code == 409 and r.json()["detail"]["code"] == "contratos_vivos", r.text
    assert _guardado(client, admin)[0]["partes"] == {"division": "participacion"}

    # La participación no «se mueve» si cambia la firma del mueble: no tiene
    # lugar físico (la pierde, y eso lo frena la guarda de arriba).
    from app.database import SessionLocal
    from app.services.layout_lookup import partes_que_se_moverian
    db = SessionLocal()
    try:
        por_tramos = {**_gondola_pc(), "partes": {"division": "tramos", "tramos": 2}}
        assert partes_que_se_moverian(db, "NAVE", [_gondola_pc()], [por_tramos]) == []
    finally:
        db.close()


def test_la_cara_por_participacion_se_escribe_completa(client, admin):
    """``forma_canonica`` exige el código completo de una cara por
    participación, o que tuvo participaciones (filas ``…-PC<n>`` en
    ``spaces``, también la corta de esa sede y la archivada): ``GON-01`` y
    ``NAVE-GON-01`` toman candados distintos. Una cara que se vende entera y
    nunca tuvo participaciones, como siempre: no exige nada."""
    otra = lambda code: {**_gondola_pc(), "id": f"f-{code}", "code": code, "partes": None}  # noqa: E731
    assert _guardar(client, admin, [_gondola_pc()] + [otra(c) for c in ("GON-02", "GON-03", "GON-04", "GON-05")]).status_code == 200

    from app.database import SessionLocal
    from app.services.layout_lookup import forma_canonica
    _espacio_directo("NAVE-GON-02-PC1")             # la A tuvo participaciones
    _espacio_directo("GON-03-B-PC1")                 # corta, de esta sede
    _espacio_directo("GON-04-PC1", sede="POBLADO")   # corta, de OTRA sede: no cuenta
    _espacio_directo("NAVE-GON-05-PC2#7")            # archivada
    db = SessionLocal()
    try:
        assert forma_canonica(db, "NAVE", "GON-01") == "NAVE-GON-01"
        assert forma_canonica(db, "NAVE", "gon-01-b") == "NAVE-GON-01-B"
        assert forma_canonica(db, "NAVE", "GON-01-PC2") == "NAVE-GON-01-PC2"
        assert forma_canonica(db, "NAVE", "GON-02") == "NAVE-GON-02"
        assert forma_canonica(db, "NAVE", "GON-02-B") is None, "las participaciones eran de la A"
        assert forma_canonica(db, "NAVE", "GON-03-B") == "NAVE-GON-03-B"
        assert forma_canonica(db, "NAVE", "GON-03") is None
        assert forma_canonica(db, "NAVE", "GON-04") is None, "la fila corta es de otra sede"
        assert forma_canonica(db, "NAVE", "GON-05") == "NAVE-GON-05"
    finally:
        db.close()

    # Por la API: el contrato suelto de la cara que tuvo participaciones, escrita corta.
    sup = client.post("/api/suppliers/", headers=admin, json={"name": "Alpina"}).json()["id"]
    space = client.post("/api/spaces/find-or-create", headers=admin,
                        json={"code": "GON-02", "sede": "NAVE"}).json()
    r = client.post(f"/api/spaces/{space['id']}/leases", headers=admin, json={
        "supplier_id": sup, "start_date": _d(1), "end_date": _d(30), "monthly_rent": 1})
    assert space["code"] == "GON-02"
    assert r.status_code == 409 and "Escribilo «NAVE-GON-02»" in r.json()["detail"], r.text


def test_un_mueble_viejo_que_se_llama_como_una_participacion_sigue_cuidado(client, admin):
    """Riesgo R1 del diseño: un mueble de ANTES del token que ya se llamaba
    ``GON-07-PC1`` (un nombre nuevo así ya no entra). Su contrato es de su cara
    entera, y ``ofrece`` lo reconoce por el texto tal cual, como
    ``PlanoIndexado.resolver``: retirarlo del plano frena con el 409
    ``contratos_vivos`` de siempre, aunque ninguna cara se venda por
    participación. Sin eso, el código se leía como «la participación 1 de
    GON-07» y el guardado lo dejaba huérfano en silencio."""
    import json as _json
    from app.database import SessionLocal
    from app.models.models import LayoutSnapshot
    viejo = {**_gondola_pc(), "id": "f-viejo", "code": "GON-07-PC1", "gondolaType": "wall", "partes": None}
    punta = {"id": "p1", "code": "PUN-01", "sede": "NAVE", "type": "punta", "label": "Punta",
             "cx": 1, "cz": 1, "rotY": 0, "w": 0.9, "d": 0.4, "h": 1.8, "color": "#6366f1"}
    assert _guardar(client, admin, [punta]).status_code == 200
    db = SessionLocal()
    try:
        db.query(LayoutSnapshot).one().fixtures_json = _json.dumps([punta, viejo])
        db.commit()
    finally:
        db.close()
    _espacio_directo("NAVE-GON-07-PC1", desde=1, hasta=30)

    # Moverlo se guarda (el nombre viejo se respeta) …
    assert _guardar(client, admin, [punta, {**viejo, "cx": 5}]).status_code == 200
    # … y sacarlo del plano frena, nombrando su contrato.
    r = _guardar(client, admin, [punta])
    assert r.status_code == 409 and r.json()["detail"]["code"] == "contratos_vivos", r.text
    assert any("«GON-07-PC1»" in c for c in r.json()["detail"]["choques"]), r.text
