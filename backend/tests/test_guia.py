"""La guía de montaje de una versión (fase 3 de la distribución, 2026-10-24).

· La hoja: la cara, los destinos de ESA versión con su foto, lo que cambia
  contra la anterior, lo ya asignado sin nombres, sin precios.
· El enlace sin contraseña: abre la guía de su versión y nada más (ni otra
  versión, ni el planograma, ni la puerta general); sube la foto, que no es
  obligatoria.
· Mandarla a quien corresponde: los contactos de la sede y los que se
  escriben; el correo lleva el enlace y no lleva plata.

Todo ``import app.*`` va ADENTRO de las funciones.
"""
from datetime import date

import pytest

RELOJ = pytest.mark.reloj("2026-10-24T15:00:00+00:00")
FOTO = {"foto": ("montada.jpg", b"\xff\xd8\xff\xe0fake-jpeg", "image/jpeg")}


def D(y, m, d) -> str:
    return date(y, m, d).isoformat()


def _mueble(code, tipo, cx, rentable=True, division=None, **extra):
    f = {"id": f"f-{code}", "code": code, "sede": "NAVE", "type": tipo, "label": code, "cx": cx, "cz": 2, "rotY": 0,
         "w": 1, "d": 1, "h": 0.05, "color": "#818cf8", **extra}
    if not rentable:
        f["rentable"] = False
    if division:
        f["partes"] = {"division": division}
    return f


PLANO = [_mueble("INT-01", "metro", 2, rentable=False), _mueble("MET-01", "metro", 6, division="participacion")]


def _rect(u0, u1):
    return [[u0, 0.0], [u1, 0.0], [u1, 1.0], [u0, 1.0]]


def _preparar(client, admin, fixture="f-INT-01"):
    r = client.put("/api/layout/NAVE", headers=admin, json={"fixtures": PLANO, "base_updated_at": None})
    assert r.status_code == 200, r.text
    ids = []
    for nombre, color in (("Lácteos", "d1"), ("Halloween", "d3")):
        r = client.post("/api/planogramas/destinos", headers=admin, json={
            "sede": "NAVE", "nombre": nombre, "tipo": "categoria", "color": color, "como_se_monta": f"{nombre} al frente",
            "codigo_externo": "CAT-1"})
        assert r.status_code == 201, r.text
        ids.append(r.json()["id"])
    base = {"sede": "NAVE", "fixture_id": fixture, "cara": "A"}

    def version(piezas, v, **pub):
        r = client.put("/api/planogramas/borrador", headers=admin, json={**base, "version": v, "piezas": piezas})
        assert r.status_code == 200, r.text
        r = client.post("/api/planogramas/publicar", headers=admin,
                        json={**base, "version": v + 1, "rige_desde": D(2026, 10, 24), **pub})
        assert r.status_code == 200, r.text
        return r.json()["planograma"]["vigente"]["id"]

    v1 = version([{"destino_id": ids[0], "pb": 4000, "vertices": _rect(0, 0.4)}], 0)
    v2 = version([{"destino_id": ids[0], "pb": 3000, "vertices": _rect(0, 0.3)},
                  {"destino_id": ids[1], "pb": 2000, "vertices": _rect(0.3, 0.5)}], 2, hasta=D(2026, 11, 2))
    return ids, v1, v2


def _enlace(client, admin, version_id):
    r = client.post("/api/planogramas/guia/enlace", headers=admin, json={"version_id": version_id})
    assert r.status_code == 200, r.text
    url = r.json()["url"]
    assert f"/?guia={version_id}&t=" in url
    from urllib.parse import parse_qs, urlparse

    return parse_qs(urlparse(url).query)["t"][0], r.json()


@RELOJ
def test_la_hoja_de_una_version(client, admin):
    ids, v1, v2 = _preparar(client, admin)
    r = client.get("/api/guia", headers=admin, params={"version": v2})
    assert r.status_code == 200, r.text
    g = r.json()
    assert (g["codigo"], g["cara"], g["version"]["numero"], g["version"]["hasta"]) == ("INT-01", "A", 2, "2026-11-02")
    assert [(p["nombre"], p["pb"], p["como_se_monta"]) for p in g["piezas"]] == [
        ("Lácteos", 3000, "Lácteos al frente"), ("Halloween", 2000, "Halloween al frente")]
    assert g["anterior"]["numero"] == 1 and [p["pb"] for p in g["anterior"]["piezas"]] == [4000]
    assert g["fixture"]["type"] == "metro" and not {"supplierName", "negotiatedValue", "price"} & set(g["fixture"])
    assert g["asignado"] == [] and g["vendida_entera"] is False and g["fotos"] == []
    # La versión 1 también tiene su guía (reemplazada, con una más nueva).
    g1 = client.get("/api/guia", headers=admin, params={"version": v1}).json()
    assert g1["version"]["estado"] == "reemplazada" and g1["version"]["hay_una_mas_nueva"] is True
    assert g1["anterior"] is None
    # Cambiar el destino después no cambia la guía publicada.
    client.patch(f"/api/planogramas/destinos/{ids[0]}", headers=admin, json={"nombre": "Lácteos y huevos"})
    assert client.get("/api/guia", headers=admin, params={"version": v2}).json()["piezas"][0]["nombre"] == "Lácteos"
    # Sin versión, una sesión no sabe cuál: 422; una que no existe, 404.
    assert client.get("/api/guia", headers=admin).status_code == 422
    assert client.get("/api/guia", headers=admin, params={"version": 999}).status_code == 404


@RELOJ
def test_los_numeros_van_de_izquierda_a_derecha(client, admin):
    """El número de cada destino es el de la hoja (de izquierda a derecha),
    no el orden en que se dibujaron: el correo y la revisión usan el mismo."""
    ids, _v1, _v2 = _preparar(client, admin)
    base = {"sede": "NAVE", "fixture_id": "f-INT-01", "cara": "A"}
    client.put("/api/planogramas/borrador", headers=admin, json={**base, "version": 4, "piezas": [
        {"destino_id": ids[1], "pb": 2000, "vertices": _rect(0.6, 0.8)},
        {"destino_id": ids[0], "pb": 3000, "vertices": _rect(0, 0.3)}]})
    r = client.post("/api/planogramas/publicar", headers=admin, json={**base, "version": 5, "rige_desde": D(2026, 10, 24)})
    assert r.status_code == 200, r.text
    v3 = r.json()["planograma"]["vigente"]["id"]
    g = client.get("/api/guia", headers=admin, params={"version": v3}).json()
    assert [p["nombre"] for p in g["piezas"]] == ["Lácteos", "Halloween"]


def test_la_cara_b_dice_el_codigo_del_mueble():
    """«GON-12 · cara B», no «GON-12-B · cara B»: la hoja, el correo y
    «Para revisar» nombran el mueble, y la cara aparte."""
    from types import SimpleNamespace

    from app.services.guia import codigo_del_mueble

    assert codigo_del_mueble(SimpleNamespace(codigo="CENTRO-GON-12-B", sede="CENTRO", letra="B")) == "GON-12"
    assert codigo_del_mueble(SimpleNamespace(codigo="CENTRO-GON-12", sede="CENTRO", letra="A")) == "GON-12"
    # Un mueble cuyo código termina en «-B» de verdad, en su cara A, no se toca.
    assert codigo_del_mueble(SimpleNamespace(codigo="CENTRO-ISLA-B", sede="CENTRO", letra="A")) == "ISLA-B"


@RELOJ
def test_el_enlace_abre_su_guia_y_nada_mas(client, admin, worker):
    _ids, v1, v2 = _preparar(client, admin)
    token, cuerpo = _enlace(client, admin, v2)
    # Vive hasta un mes después de que termina la versión.
    assert cuerpo["dias"] == (date(2026, 11, 2) - date(2026, 10, 24)).days + 30
    h = {"Authorization": f"Bearer {token}"}
    r = client.get("/api/guia", headers=h)
    assert r.status_code == 200 and r.json()["version"]["numero"] == 2
    assert client.get("/api/guia", params={"token": token}).status_code == 200
    # Otra versión, no.
    assert client.get("/api/guia", headers=h, params={"version": v1}).status_code == 403
    # Ni la puerta general, ni el planograma, ni el montaje.
    for ruta, q in (("/api/planogramas/cara", {"sede": "NAVE", "fixture_id": "f-INT-01", "cara": "A"}),
                    ("/api/planogramas/resumen", {"sede": "NAVE"}), ("/api/spaces/", {}), ("/api/montaje/mi-espacio", {})):
        assert client.get(ruta, headers=h, params=q).status_code == 401, ruta
    assert client.post("/api/planogramas/guia/enlace", headers=h, json={"version_id": v2}).status_code == 401
    # La foto (no es obligatoria): se sube por el enlace y se ve por el enlace.
    r = client.post("/api/guia/foto", headers=h, files=FOTO)
    assert r.status_code == 201, r.text
    foto = r.json()["fotos"][0]
    assert foto["por_enlace"] is True
    r = client.get("/api/guia/foto", params={"id": foto["id"], "token": token})
    assert r.status_code == 200 and r.headers["content-type"] == "image/jpeg"
    # Un SVG no es una foto.
    r = client.post("/api/guia/foto", headers=h, files={"foto": ("x.svg", b"<svg/>", "image/svg+xml")})
    assert r.status_code == 422
    # El enlace de la versión 1 no ve la foto de la 2.
    t1, _ = _enlace(client, admin, v1)
    assert client.get("/api/guia/foto", params={"id": foto["id"], "token": t1}).status_code == 404
    # Un enlace vencido no entra.
    from app.auth import create_guia_token

    vencido = create_guia_token(v2, None, days=-1)
    assert client.get("/api/guia", params={"token": vencido}).status_code == 401
    # Quien no planifica esa cara no saca enlaces (el equipo, por defecto).
    assert client.post("/api/planogramas/guia/enlace", headers=worker, json={"version_id": v2}).status_code == 403
    # Pero con sesión, el equipo la lee.
    assert client.get("/api/guia", headers=worker, params={"version": v2}).status_code == 200


@RELOJ
def test_en_una_cara_que_se_vende_lo_asignado_va_sin_nombres(client, admin, worker):
    r = client.put("/api/layout/NAVE", headers=admin, json={"fixtures": PLANO, "base_updated_at": None})
    assert r.status_code == 200
    r = client.post("/api/participaciones/", headers=admin, json={
        "sede": "NAVE", "espacio": "MET-01", "tipo": "contrato", "proveedor": "Postobón", "marca": "Hit",
        "puntos_basicos": 3000, "desde": D(2026, 10, 1), "hasta": D(2027, 3, 31), "valor_mensual": 1_234_567})
    s1 = r.json()["termino"]["space_id"]
    r = client.post("/api/participaciones/distribucion/confirmar", headers=admin, json={
        "sede": "NAVE", "espacio": "MET-01", "version": 0, "zonas": [{"participacion_space_id": s1, "vertices": _rect(0, 0.3)}]})
    assert r.status_code == 200, r.text
    d = client.post("/api/planogramas/destinos", headers=admin, json={"sede": "NAVE", "nombre": "Propia", "tipo": "marca_propia", "color": "d2"}).json()
    base = {"sede": "NAVE", "fixture_id": "f-MET-01", "cara": "A"}
    client.put("/api/planogramas/borrador", headers=admin, json={**base, "version": 0, "piezas": [{"destino_id": d["id"], "pb": 3000, "vertices": _rect(0.3, 0.6)}]})
    r = client.post("/api/planogramas/publicar", headers=admin, json={**base, "version": 1, "rige_desde": D(2026, 10, 24)})
    assert r.status_code == 200, r.text
    vid = r.json()["planograma"]["vigente"]["id"]
    token, _ = _enlace(client, admin, vid)
    r = client.get("/api/guia", params={"token": token})
    assert r.status_code == 200
    assert r.json()["asignado"] == [_rect(0, 0.3)]
    texto = r.text
    for prohibido in ("Postobón", "Hit", "1234567", "1.234.567", "valor", "proveedor"):
        assert prohibido not in texto, prohibido
    # Con sesión, la misma guarda que el planograma: el equipo no lee la de un
    # mueble que se vende (el enlace sí: lo sacó quien administra).
    assert client.get("/api/guia", headers=worker, params={"version": vid}).status_code == 403
    assert client.get("/api/guia", headers=admin, params={"version": vid}).status_code == 200


@RELOJ
def test_mandarla_a_quien_corresponde(client, admin, monkeypatch):
    _ids, _v1, v2 = _preparar(client, admin)
    r = client.put("/api/notifications/contacts", headers=admin, json={
        "gerente": ["gerente@super.co"], "by_sede": {"NAVE": {"admin": ["admin.nave@super.co"], "mercaderista": ["monta@super.co"]}}})
    assert r.status_code == 200, r.text
    r = client.get("/api/planogramas/guia/destinatarios", headers=admin, params={"version": v2})
    assert r.status_code == 200, r.text
    assert r.json()["montaje"] == ["monta@super.co"]
    assert set(r.json()["comercial"]) == {"gerente@super.co", "admin.nave@super.co"}
    # Sin correo configurado se dice (y se puede copiar el enlace).
    import app.routers.planogramas as rp

    monkeypatch.setattr(rp, "correo_configurado", lambda: False)
    r = client.post("/api/planogramas/guia/enviar", headers=admin, json={"version_id": v2, "correos": ["monta@super.co"]})
    assert r.status_code == 409 and r.json()["detail"]["code"] == "sin_correo"
    enviados = []
    monkeypatch.setattr(rp, "correo_configurado", lambda: True)
    monkeypatch.setattr(rp, "send_mail_to_bg", lambda a, asunto, html: enviados.append((a, asunto, html)))
    r = client.post("/api/planogramas/guia/enviar", headers=admin,
                    json={"version_id": v2, "correos": ["monta@super.co", "otra@super.co", "no-es-correo"]})
    assert r.status_code == 200, r.text
    assert r.json()["enviados"] == ["monta@super.co", "otra@super.co"]
    (a, asunto, html), = enviados
    assert asunto == "Guía de montaje · INT-01 · cara A · versión 2 — NAVE"
    assert "?guia=" in html and "Lácteos" in html and "Halloween" in html and "$" not in html
    assert client.post("/api/planogramas/guia/enviar", headers=admin, json={"version_id": v2, "correos": ["nada"]}).status_code == 422
