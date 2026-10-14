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
    r = client.post("/api/leases/bulk/confirmar", headers=admin, json={"sede": "NAVE", "filas": [
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
