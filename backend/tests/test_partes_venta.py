"""Vender la nevera entera o por puertas, por todos los caminos que crean un
contrato.

La regla de la dueña: **la nevera entera o por puertas, nunca las dos en
fechas que se pisen; dos puertas distintas, sí.** Un contrato nace por cuatro
caminos —la planilla y Vender (``/leases/bulk/validar`` y ``/confirmar``, que
también usa «Renovar»), el contrato suelto (``POST /spaces/{id}/leases``) y la
importación de los contratos que vivían en el plano— y los cuatro tienen que
decir lo mismo. Si uno solo deja pasar la nevera entera con la puerta 2
vendida, el proveedor de la puerta 2 llega a montar y encuentra la nevera de
otro.

Y los mensajes nunca nombran al dueño de la otra puerta: Vender los lee en
vivo, delante del proveedor que está comprando.
"""
from datetime import timedelta

import pytest

from app.fechas import hoy as hoy_en_colombia  # el «hoy» del negocio: Colombia

HOY = hoy_en_colombia()


def _d(dias: int) -> str:
    return (HOY + timedelta(days=dias)).isoformat()


def _nevera(code="NEV-03", division="puertas", puertas=3, **extra):
    partes = {"puertas": puertas}
    if division:
        partes["division"] = division
    return {
        "id": f"f-{code}", "code": code, "sede": "NAVE", "type": "nevera_puertas",
        "label": "Nevera de Puertas", "cx": 4, "cz": 2, "rotY": 0,
        "w": 2.07, "d": 0.7, "h": 2.1, "color": "#1e293b",
        "modelo": "base:nevera-3p-frigomaster", "partes": partes, **extra,
    }


def _mural(code="GON-07"):
    return {
        "id": f"f-{code}", "code": code, "sede": "NAVE", "type": "gondola", "gondolaType": "wall",
        "label": "Góndola Mural", "cx": 9, "cz": 2, "rotY": 0, "w": 3, "d": 0.5, "h": 1.8, "color": "#818cf8",
    }


def _plano(client, admin, fixtures):
    r = client.put("/api/layout/NAVE", headers=admin, json={"fixtures": fixtures, "base_updated_at": None})
    assert r.status_code == 200, r.text


def _fila(espacio, desde=1, hasta=30, proveedor="Postobón", valor=350_000, fila=1):
    return {"fila": fila, "espacio": espacio, "sede": "NAVE", "proveedor": proveedor,
            "valor": valor, "desde": _d(desde), "hasta": _d(hasta)}


def _validar(client, admin, *filas):
    r = client.post("/api/leases/bulk/validar", headers=admin, json={"sede": "NAVE", "filas": list(filas)})
    assert r.status_code == 200, r.text
    return r.json()["filas"]


def _confirmar(client, admin, *filas):
    r = client.post("/api/leases/bulk/confirmar", headers=admin, json={"sede": "NAVE", "filas": list(filas)})
    assert r.status_code == 200, r.text
    return r.json()["filas"]


def _vendido(client, admin, espacio, **kw):
    f = _confirmar(client, admin, _fila(espacio, **kw))[0]
    assert f["lease_id"] is not None, f
    return f


# ─── La regla, por la planilla y Vender ───────────────────────────────────────

def test_con_la_puerta_2_vendida_la_nevera_entera_no_se_vende_en_esas_fechas(client, admin):
    _plano(client, admin, [_nevera()])
    _vendido(client, admin, "NEV-03-PU2", desde=1, hasta=30)
    f = _validar(client, admin, _fila("NEV-03", desde=10, hasta=40, proveedor="Alpina"))[0]
    assert f["estado"] == "error", f
    texto = " ".join(f["mensajes"])
    assert "NAVE-NEV-03-PU2" in texto and "no se vende entera" in texto, texto
    # Y nunca de quién es la otra puerta: Vender lo lee delante del proveedor.
    assert "Postob" not in texto, texto


def test_con_la_nevera_vendida_entera_ninguna_puerta_se_vende_en_esas_fechas(client, admin):
    _plano(client, admin, [_nevera()])
    _vendido(client, admin, "NEV-03", desde=1, hasta=30, proveedor="Coca-Cola")
    for puerta in ("PU1", "PU2", "PU3"):
        f = _validar(client, admin, _fila(f"NEV-03-{puerta}", desde=30, hasta=40))[0]
        assert f["estado"] == "error", f
        assert "está vendida entera" in " ".join(f["mensajes"])
        assert "Coca" not in " ".join(f["mensajes"])


def test_fuera_de_esas_fechas_si_y_los_extremos_cuentan(client, admin):
    _plano(client, admin, [_nevera()])
    _vendido(client, admin, "NEV-03-PU2", desde=1, hasta=30)
    # El día 30 es de la puerta: la nevera entera arranca el 31.
    assert _validar(client, admin, _fila("NEV-03", desde=30, hasta=31))[0]["estado"] == "error"
    assert _validar(client, admin, _fila("NEV-03", desde=31, hasta=60))[0]["estado"] != "error"
    # Un contrato de un día dura un día.
    assert _validar(client, admin, _fila("NEV-03", desde=0, hasta=0))[0]["estado"] != "error"
    assert _validar(client, admin, _fila("NEV-03", desde=1, hasta=1))[0]["estado"] == "error"


def test_dos_puertas_distintas_conviven(client, admin):
    _plano(client, admin, [_nevera()])
    _vendido(client, admin, "NEV-03-PU1", desde=1, hasta=30)
    f = _confirmar(client, admin, _fila("NEV-03-PU2", desde=1, hasta=30, proveedor="Alpina"),
                   _fila("NEV-03-PU3", desde=1, hasta=30, proveedor="Alpina", fila=2))
    assert all(x["lease_id"] is not None for x in f), f


def test_en_la_misma_planilla_la_entera_y_una_puerta_chocan(client, admin):
    _plano(client, admin, [_nevera()])
    f = _validar(client, admin, _fila("NEV-03-PU2", fila=1), _fila("NEV-03", fila=2, proveedor="Alpina"),
                 _fila("NEV-03-PU3", fila=3, proveedor="Alpina"))
    assert f[0]["estado"] != "error" and f[2]["estado"] != "error", f
    assert f[1]["estado"] == "error" and "fila 1" in " ".join(f[1]["mensajes"]), f[1]
    # Y al revés: la entera primero y la puerta después. La revisión contra la
    # base no ve las filas de la misma tanda, que todavía no se escribieron.
    f = _validar(client, admin, _fila("NEV-03", fila=1), _fila("NEV-03-PU2", fila=2, proveedor="Alpina"))
    assert f[0]["estado"] != "error", f
    assert f[1]["estado"] == "error" and "fila 1" in " ".join(f[1]["mensajes"]), f[1]
    # Y `confirmar` escribe uno solo: la entera.
    f = _confirmar(client, admin, _fila("NEV-03", fila=1), _fila("NEV-03-PU2", fila=2, proveedor="Alpina"))
    assert [x["lease_id"] is not None for x in f] == [True, False], f
    comercial = client.get("/api/spaces/comercial", headers=admin).json()
    assert "NAVE-NEV-03" in comercial and "NAVE-NEV-03-PU2" not in comercial, sorted(comercial)


# ─── La compuerta: lo que el plano no ofrece ──────────────────────────────────

def test_una_nevera_que_se_vende_entera_no_vende_puertas(client, admin):
    _plano(client, admin, [_nevera(division=None)])
    f = _validar(client, admin, _fila("NEV-03-PU2"))[0]
    assert f["estado"] == "error"
    assert "se vende entera" in " ".join(f["mensajes"]) and "por puertas" in " ".join(f["mensajes"])
    # La entera, como siempre.
    assert _validar(client, admin, _fila("NEV-03"))[0]["estado"] != "error"


def test_no_hay_puerta_4_en_una_nevera_de_3(client, admin):
    _plano(client, admin, [_nevera()])
    f = _validar(client, admin, _fila("NEV-03-PU4"))[0]
    assert f["estado"] == "error" and "no hay PU4" in " ".join(f["mensajes"]), f


def test_la_parte_de_una_cara_b_que_no_existe(client, admin):
    _plano(client, admin, [_nevera()])
    f = _validar(client, admin, _fila("NEV-03-B-PU1"))[0]
    assert f["estado"] == "error" and "una sola cara" in " ".join(f["mensajes"]), f


def test_una_nevera_no_comercializable_no_vende_ni_puertas(client, admin):
    _plano(client, admin, [_nevera(rentable=False)])
    f = _validar(client, admin, _fila("NEV-03-PU1"))[0]
    assert f["estado"] == "error" and "no comercializable" in " ".join(f["mensajes"]), f


def test_la_cara_b_antes_que_la_parte(client, admin):
    """«NEV-03-PU2-B» es un orden que alguien va a escribir: se le dice el bueno."""
    _plano(client, admin, [_nevera()])
    f = _validar(client, admin, _fila("NEV-03-PU2-B"))[0]
    assert f["estado"] == "error"
    assert "la cara va antes" in " ".join(f["mensajes"]), f


# ─── Lo que queda escrito ─────────────────────────────────────────────────────

def test_el_espacio_de_la_puerta_nace_con_su_nombre_y_su_parte_del_frente(client, admin):
    _plano(client, admin, [_nevera()])
    f = _vendido(client, admin, "NEV-03-PU2")
    assert f["codigo"] == "NAVE-NEV-03-PU2"
    assert f["nombre"] == "Nevera de Puertas · Puerta 2"
    assert f["parte"] == "Puerta 2 de 3, contando de izquierda a derecha mirando el frente"
    from app.database import SessionLocal
    from app.models.models import Space
    db = SessionLocal()
    try:
        s = db.query(Space).filter(Space.code == "NAVE-NEV-03-PU2").one()
        assert (s.name, s.zone, s.sede) == ("Nevera de Puertas · Puerta 2", "nevera_puertas", "NAVE")
        assert s.area_m2 == pytest.approx(round(2.07 * 0.7 / 3, 2))
    finally:
        db.close()


def test_la_tarifa_de_la_puerta_y_su_respaldo(client, admin):
    _plano(client, admin, [_nevera()])
    client.put("/api/layout/rates", headers=admin, json={"default": {"nevera_puertas": 900_000}, "by_sede": {}})
    assert _validar(client, admin, _fila("NEV-03-PU1"))[0]["referencia"] == 300_000
    assert _validar(client, admin, _fila("NEV-03"))[0]["referencia"] == 900_000
    client.put("/api/layout/rates", headers=admin,
               json={"default": {"nevera_puertas": 900_000, "parte_puerta": 350_000},
                     "by_sede": {"NAVE": {"parte_puerta": 400_000}}})
    assert _validar(client, admin, _fila("NEV-03-PU1"))[0]["referencia"] == 400_000


def test_renovar_una_puerta_es_venderla_otra_vez(client, admin):
    """«Renovar» siembra la ficha de Vender y guarda por `confirmar`: la puerta
    siguiente al contrato que termina, sin chocar con el suyo."""
    _plano(client, admin, [_nevera()])
    _vendido(client, admin, "NEV-03-PU2", desde=1, hasta=30)
    assert _validar(client, admin, _fila("NEV-03-PU2", desde=31, hasta=61))[0]["estado"] != "error"
    assert _validar(client, admin, _fila("NEV-03-PU2", desde=30, hasta=61))[0]["estado"] == "error"


# ─── El contrato suelto ───────────────────────────────────────────────────────

def _suelto(client, admin, code, desde=1, hasta=30):
    s = client.post("/api/spaces/find-or-create", headers=admin,
                    json={"code": code, "name": code, "zone": "Z", "sede": "NAVE", "area_m2": 1}).json()
    sup = client.post("/api/suppliers/find-or-create", headers=admin, json={"name": "Postobón"}).json()
    return client.post(f"/api/spaces/{s['id']}/leases", headers=admin, json={
        "supplier_id": sup["id"], "start_date": _d(desde), "end_date": _d(hasta), "monthly_rent": 1,
    })


def test_el_contrato_suelto_dice_lo_mismo(client, admin):
    _plano(client, admin, [_nevera()])
    assert _suelto(client, admin, "NAVE-NEV-03-PU2").status_code == 201
    r = _suelto(client, admin, "NAVE-NEV-03", desde=5, hasta=10)
    assert r.status_code == 409 and "no se vende entera" in r.json()["detail"], r.text
    assert "Postob" not in r.json()["detail"]
    assert _suelto(client, admin, "NAVE-NEV-03-PU1").status_code == 201
    r = _suelto(client, admin, "NAVE-NEV-03-PU4")
    assert r.status_code == 409 and "no hay PU4" in r.json()["detail"], r.text


def test_el_contrato_suelto_de_una_parte_con_la_cara_vendida_entera(client, admin):
    """La otra dirección: con la cara vendida ENTERA, ninguna de sus partes
    entra por el contrato suelto —ni una puerta, ni un tramo, ni un
    entrepaño—, y la frase no nombra a quien tiene la entera."""
    mural = {**_mural("GON-08"), "partes": {"tramos": 3, "division": "tramos"}}
    punta = {"id": "f-PUN-02", "code": "PUN-02", "sede": "NAVE", "type": "punta", "label": "Punta",
             "cx": 12, "cz": 2, "rotY": 0, "w": 0.9, "d": 0.4, "h": 1.8, "color": "#6366f1",
             "entrepanos": 3, "partes": {"division": "entrepanos"}}
    _plano(client, admin, [_nevera(), mural, punta])
    for cara in ("NEV-03", "GON-08", "PUN-02"):
        _vendido(client, admin, cara, desde=1, hasta=30, proveedor="Coca-Cola")
    for parte in ("NAVE-NEV-03-PU2", "NAVE-GON-08-TR1", "NAVE-PUN-02-EN1"):
        r = _suelto(client, admin, parte, desde=5, hasta=10)
        assert r.status_code == 409, (parte, r.text)
        assert "vendida entera" in r.json()["detail"], (parte, r.text)
        assert "Coca" not in r.json()["detail"]
    # Fuera de esas fechas, sí.
    assert _suelto(client, admin, "NAVE-NEV-03-PU2", desde=31, hasta=40).status_code == 201


def test_el_contrato_suelto_exige_el_codigo_completo_de_lo_que_se_vende_por_partes(client, admin):
    """La regla «entera o por partes» compara CÓDIGOS. El contrato suelto
    aceptaba la puerta sin la sede (`NEV-03-PU2`) o con un espacio adelante, y
    la nevera entera, escrita completa por la planilla, no la veía: se vendía
    entera a uno y por puertas a otro en las mismas fechas. Ahora se pide la
    forma completa, como la arma la planilla."""
    caja = {"id": "c1", "code": "CAJ-01", "sede": "NAVE", "type": "checkout", "label": "Caja",
            "cx": 1, "cz": 1, "rotY": 0, "w": 1.8, "d": 0.7, "h": 0.9, "color": "#8b5cf6",
            "partes": {"bahias": 2}}
    _plano(client, admin, [_nevera(), caja, _mural()])
    for escrito, canonico in [("NEV-03-PU2", "NAVE-NEV-03-PU2"), (" NAVE-NEV-03-PU2", "NAVE-NEV-03-PU2"),
                              ("nave-nev-03-pu3", "NAVE-NEV-03-PU3"), ("CAJ-01-BI1", "NAVE-CAJ-01-BI1"),
                              ("NEV-03", "NAVE-NEV-03")]:
        r = _suelto(client, admin, escrito)
        assert r.status_code == 409, (escrito, r.text)
        assert f"Escribilo «{canonico}»" in r.json()["detail"], (escrito, r.text)
    assert client.get("/api/spaces/comercial", headers=admin).json() == {}
    # Escrita completa, entra; y la entera, después, choca como siempre.
    assert _suelto(client, admin, "NAVE-NEV-03-PU2").status_code == 201
    assert _validar(client, admin, _fila("NEV-03", proveedor="Coca-Cola"))[0]["estado"] == "error"
    # Un mueble que se vende entero sigue como siempre: sin exigir nada.
    assert _suelto(client, admin, "GON-07").status_code == 201


def _contrato_viejo(code, desde=1, hasta=30):
    """Una fila de antes de que el contrato suelto exigiera el código completo:
    escrita directo en la base, porque por la API ya no entra."""
    from datetime import date
    from app.database import SessionLocal
    from app.models.models import Space, SpaceLease, Supplier
    db = SessionLocal()
    try:
        sup = Supplier(name=f"Viejo {code}")
        space = Space(code=code, svg_id=f"fix-{code}", name=code, zone="Z", sede="NAVE", area_m2=1)
        db.add_all([sup, space])
        db.flush()
        db.add(SpaceLease(space_id=space.id, supplier_id=sup.id, monthly_rent=1,
                          start_date=date.fromisoformat(_d(desde)), end_date=date.fromisoformat(_d(hasta))))
        db.commit()
    finally:
        db.close()


def test_un_contrato_viejo_guardado_sin_la_sede_tambien_cuenta(client, admin):
    """Lo que ya estaba escrito sin la sede: la nevera entera lo ve, y el
    guardado del plano no mueve ni saca esa puerta sin avisar."""
    _plano(client, admin, [_nevera()])
    _contrato_viejo("NEV-03-PU1", desde=0)
    f = _validar(client, admin, _fila("NEV-03", proveedor="Coca-Cola"))[0]
    assert f["estado"] == "error" and "NEV-03-PU1" in " ".join(f["mensajes"]), f
    # De 3 a 2 puertas la puerta 1 queda en otro lugar: 409, como con la completa.
    r = client.put("/api/layout/NAVE", headers=admin,
                   json={"fixtures": [_nevera(puertas=2)], "base_updated_at": None})
    assert r.status_code == 409 and "partes_vendidas" in r.text, r.text
    # Y con la puerta 3 vendida, bajar a 2 la saca del plano: `contratos_vivos`.
    _contrato_viejo("NEV-03-PU3", desde=40, hasta=50)
    r = client.put("/api/layout/NAVE", headers=admin,
                   json={"fixtures": [_nevera(puertas=2)], "base_updated_at": None})
    assert r.status_code == 409 and "contratos_vivos" in r.text and "NEV-03-PU3" in r.text, r.text


def test_el_contrato_suelto_de_una_caja_dice_que_nunca_se_alquila(client, admin):
    caja = {"id": "c1", "code": "CAJ-01", "sede": "NAVE", "type": "checkout", "label": "Caja",
            "cx": 1, "cz": 1, "rotY": 0, "w": 1.8, "d": 0.7, "h": 0.9, "color": "#8b5cf6"}
    _plano(client, admin, [caja])
    r = _suelto(client, admin, "NAVE-CAJ-01")
    assert r.status_code == 409 and "nunca se alquila" in r.json()["detail"], r.text


# ─── Los correos ──────────────────────────────────────────────────────────────

def test_los_tres_correos_dicen_cual_puerta_y_el_de_montaje_sin_plata(client, admin, monkeypatch):
    import app.routers.bulk_leases as bl

    enviados = []
    monkeypatch.setattr(bl, "correo_configurado", lambda: True)
    monkeypatch.setattr(bl, "send_mail_to_bg", lambda to, asunto, html: enviados.append((to, asunto, html)))
    client.put("/api/notifications/contacts", headers=admin, json={"gerente": [], "by_sede": {"NAVE": {
        "admin": ["jefe@galerias.co"], "mercaderista": ["merca@galerias.co"]}}})
    client.post("/api/suppliers/find-or-create", headers=admin,
                json={"name": "Postobón", "email": "ventas@postobon.co"})
    _plano(client, admin, [_nevera()])
    _vendido(client, admin, "NEV-03-PU2", valor=350_000)
    assert len(enviados) == 3, enviados
    for to, _asunto, html in enviados:
        assert "Puerta 2 de 3" in html, (to, html)
    montaje = next(html for to, _a, html in enviados if "merca@galerias.co" in to)
    assert "350" not in montaje, "la plata llegó al correo de montaje"


# ─── La importación de lo que vivía en el plano ───────────────────────────────

def test_la_importacion_del_plano_no_pisa_una_puerta_vendida(client, admin):
    import json

    _plano(client, admin, [_nevera()])
    _vendido(client, admin, "NEV-03-PU2", desde=1, hasta=30)
    from app.database import SessionLocal
    from app.models.models import LayoutSnapshot
    db = SessionLocal()
    try:
        snap = db.query(LayoutSnapshot).filter(LayoutSnapshot.sede == "NAVE").one()
        viejo = {**_nevera(), "status": "occupied", "supplierName": "Alpina",
                 "startDate": _d(5), "endDate": _d(40), "negotiatedValue": 1}
        snap.fixtures_json = json.dumps([viejo])
        db.commit()
    finally:
        db.close()
    r = client.get("/api/layout/importacion/previo", headers=admin)
    assert r.status_code == 200, r.text
    cuerpo = r.json()
    assert cuerpo["importables"] == [], cuerpo
    assert any("choca con partes vendidas" in i["motivo"] for i in cuerpo["incompletos"]), cuerpo


# ─── El enlace de la mercaderista ─────────────────────────────────────────────

def test_el_enlace_de_montaje_de_una_puerta_dice_cual_y_lleva_el_mueble(client, admin):
    """La mercaderista abre `NAVE-NEV-03-PU2`: tiene que saber que es la puerta
    2 de 3, contada desde dónde, y el plano tiene que señalar la nevera (el
    mueble, sin el sufijo de la parte). Sin plata, como siempre."""
    from app.auth import create_mount_token

    _plano(client, admin, [_nevera()])
    _vendido(client, admin, "NEV-03-PU2", desde=0, hasta=30)
    r = client.get("/api/montaje/mi-espacio",
                   headers={"Authorization": f"Bearer {create_mount_token('NAVE-NEV-03-PU2', days=30)}"})
    assert r.status_code == 200, r.text
    b = r.json()
    assert b["code"] == "NAVE-NEV-03-PU2"
    assert b["corto"] == "NEV-03-PU2"
    assert b["fixture_code"] == "NEV-03"
    assert b["parte"] == {
        "token": "PU", "n": 2, "de": 3,
        "texto": "Puerta 2 de 3, contando de izquierda a derecha mirando el frente",
    }, b["parte"]
    assert "350" not in r.text, "la plata llegó al enlace de montaje"
    # Una cara sin partes no trae la clave con nada adentro.
    _plano(client, admin, [_nevera(), _mural()])
    _vendido(client, admin, "GON-07", desde=0, hasta=30)
    c = client.get("/api/montaje/mi-espacio",
                   headers={"Authorization": f"Bearer {create_mount_token('NAVE-GON-07', days=30)}"}).json()
    assert c.get("parte") is None, c.get("parte")


# ─── Renumerar ────────────────────────────────────────────────────────────────

FOTO = {"foto": ("montaje.png", b"\x89PNG\r\n\x1a\n" + b"0" * 32, "image/png")}


def test_renumerar_muda_la_parte_vendida_con_su_mueble(client, admin):
    """Las dos neveras tienen los nombres corridos: la de la izquierda (cx=1)
    se llama NEV-02 y renumerar la pasa a NEV-01, y a la otra al revés. Su
    puerta 2 vendida tiene que ir con ELLA —el espacio, su `svg_id` y la
    confirmación de montaje—: con la regla vieja (sólo `-B`) el contrato quedaba
    colgado del código viejo, que después es la OTRA nevera, y el proveedor
    montaba en la equivocada. Lo mismo con un tramo de la cara B de una
    góndola."""
    from app.database import SessionLocal
    from app.models.models import MountConfirmation, Space

    def nevera(cx, code):
        return {**_nevera(code), "id": f"n{cx}", "cx": cx, "cz": 15.0}

    def gondola(cx, code):
        return {"id": f"g{cx}", "code": code, "sede": "NAVE", "type": "gondola", "gondolaType": "double",
                "label": "Góndola", "cx": cx, "cz": 5.0, "rotY": 0, "w": 3, "d": 1.0, "h": 1.8,
                "color": "#818cf8", "partes": {"tramos": 3, "division": "tramos"}}

    _plano(client, admin, [nevera(1, "NEV-02"), nevera(3, "NEV-01"), gondola(1, "GON-02"), gondola(5, "GON-01")])
    _vendido(client, admin, "NEV-02-PU2", desde=1, hasta=30)
    _vendido(client, admin, "GON-02-B-TR2", desde=1, hasta=30, proveedor="Alpina")
    for espacio in ("NAVE-NEV-02-PU2", "NAVE-GON-02-B-TR2"):
        m = client.post("/api/mounts/", headers=admin,
                        data={"space_code": espacio, "estado": "montado", "sede": "NAVE"}, files=FOTO)
        assert m.status_code == 201, m.text

    r = client.post("/api/layout/renumeracion/aplicar", json={"sedes": None}, headers=admin)
    assert r.status_code == 200, r.text
    codigos = {f["id"]: f["code"] for f in client.get("/api/layout/NAVE", headers=admin).json()["fixtures"]}
    assert (codigos["n1"], codigos["g1"]) == ("NEV-01", "GON-01"), codigos

    db = SessionLocal()
    try:
        espacios = {s.code: s for s in db.query(Space).all()}
        montajes = {c.space_code for c in db.query(MountConfirmation).all()}
    finally:
        db.close()
    assert {"NAVE-NEV-01-PU2", "NAVE-GON-01-B-TR2"} <= set(espacios), sorted(espacios)
    assert "NAVE-NEV-02-PU2" not in espacios and "NAVE-GON-02-B-TR2" not in espacios, sorted(espacios)
    assert "NAVE-NEV-01-PU2" in espacios["NAVE-NEV-01-PU2"].svg_id, espacios["NAVE-NEV-01-PU2"].svg_id
    assert montajes == {"NAVE-NEV-01-PU2", "NAVE-GON-01-B-TR2"}, montajes
    comercial = client.get("/api/spaces/comercial", headers=admin).json()
    assert comercial["NAVE-NEV-01-PU2"]["supplierName"] == "Postobón"
    assert comercial["NAVE-GON-01-B-TR2"]["supplierName"] == "Alpina"
