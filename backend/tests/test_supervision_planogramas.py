"""La supervisión de los planogramas (fase 4 de la distribución, 2026-10-25).

· Quien monta avisa desde el enlace de la guía: «quedó montada» o «no se
  pudo» (con el motivo). Una versión reemplazada no se monta.
· «Para revisar»: la vigente sin aviso entra EL MISMO DÍA que empieza a regir
  (decisión del dueño); montada y falta revisar; no se pudo; no coincide.
· Revisar: «coincide» pide una foto nueva o haberla visto en la tienda; «no
  coincide», los números de la hoja que quedaron mal (o «otra cosa» con la
  nota). Con «reenviar», a quien monta le llega la guía con la nota.
· Revisa quien puede publicar esa cara.

Todo ``import app.*`` va ADENTRO de las funciones.
"""
from datetime import date

import pytest

RELOJ = pytest.mark.reloj("2026-10-24T15:00:00+00:00")
FOTO = {"foto": ("montada.jpg", b"\xff\xd8\xff\xe0fake-jpeg", "image/jpeg")}


def D(y, m, d) -> str:
    return date(y, m, d).isoformat()


def _mueble(code, tipo, cx, rentable=True, division=None):
    f = {"id": f"f-{code}", "code": code, "sede": "NAVE", "type": tipo, "label": code, "cx": cx, "cz": 2, "rotY": 0,
         "w": 1, "d": 1, "h": 0.05, "color": "#818cf8"}
    if not rentable:
        f["rentable"] = False
    if division:
        f["partes"] = {"division": division}
    return f


PLANO = [_mueble("INT-01", "metro", 2, rentable=False), _mueble("MET-01", "metro", 6, division="participacion")]


def _rect(u0, u1):
    return [[u0, 0.0], [u1, 0.0], [u1, 1.0], [u0, 1.0]]


def _publicar(client, admin, fixture, piezas, version, rige=D(2026, 10, 24)):
    base = {"sede": "NAVE", "fixture_id": fixture, "cara": "A"}
    r = client.put("/api/planogramas/borrador", headers=admin, json={**base, "version": version, "piezas": piezas})
    assert r.status_code == 200, r.text
    r = client.post("/api/planogramas/publicar", headers=admin, json={**base, "version": version + 1, "rige_desde": rige})
    assert r.status_code == 200, r.text
    pl = r.json()["planograma"]
    return (pl["vigente"] or pl["programadas"][0])["id"]


def _preparar(client, admin):
    r = client.put("/api/layout/NAVE", headers=admin, json={"fixtures": PLANO, "base_updated_at": None})
    assert r.status_code == 200, r.text
    ids = []
    for nombre in ("Lácteos", "Halloween"):
        r = client.post("/api/planogramas/destinos", headers=admin, json={"sede": "NAVE", "nombre": nombre, "tipo": "categoria", "color": "d1"})
        assert r.status_code == 201, r.text
        ids.append(r.json()["id"])
    v1 = _publicar(client, admin, "f-INT-01", [{"destino_id": ids[0], "pb": 4000, "vertices": _rect(0, 0.4)}], 0)
    v2 = _publicar(client, admin, "f-INT-01", [{"destino_id": ids[1], "pb": 2000, "vertices": _rect(0.3, 0.5)},
                                                {"destino_id": ids[0], "pb": 3000, "vertices": _rect(0, 0.3)}], 2)
    return ids, v1, v2


def _token(client, admin, version_id):
    r = client.post("/api/planogramas/guia/enlace", headers=admin, json={"version_id": version_id})
    assert r.status_code == 200, r.text
    from urllib.parse import parse_qs, urlparse

    return parse_qs(urlparse(r.json()["url"]).query)["t"][0]


def _lista(client, quien):
    r = client.get("/api/planogramas/supervision", headers=quien, params={"sede": "NAVE"})
    assert r.status_code == 200, r.text
    return r.json()["caras"]


def _revisar(client, admin, version_id, **e):
    return client.post("/api/planogramas/supervision/revisar", headers=admin, json={"version_id": version_id, **e})


@RELOJ
def test_el_ciclo_de_una_version(client, admin):
    _ids, v1, v2 = _preparar(client, admin)
    # Rige hoy y nadie avisó: entra el mismo día.
    (c,) = _lista(client, admin)
    assert (c["version_id"], c["estado"], c["dias_que_rige"], c["nombre"]) == (v2, "sin_montar", 0, "INT-01 · cara A")
    cara = client.get("/api/planogramas/cara", headers=admin, params={"sede": "NAVE", "fixture_id": "f-INT-01"}).json()
    assert {v["numero"]: v["montaje"]["estado"] for v in cara["planograma"]["versiones"]} == {2: "sin_montar", 1: "sin_registro"}

    token = _token(client, admin, v2)
    r = client.post("/api/guia/aviso", params={"token": token}, json={"estado": "montada"})
    assert r.status_code == 201, r.text
    (c,) = _lista(client, admin)
    assert (c["estado"], c["aviso"]["por_enlace"], c["fotos_nuevas"]) == ("por_revisar", True, 0)
    # Sin foto, «coincide» sólo si la vio en la tienda.
    r = _revisar(client, admin, v2, resultado="coincide")
    assert r.status_code == 422 and r.json()["detail"]["code"] == "sin_foto"
    assert client.post("/api/guia/foto", params={"token": token}, files=FOTO).status_code == 201
    assert _lista(client, admin)[0]["fotos_nuevas"] == 1
    r = _revisar(client, admin, v2, resultado="coincide")
    assert r.status_code == 200, r.text
    assert r.json()["revision"]["resultado"] == "coincide" and r.json()["reenvio"] is None
    assert _lista(client, admin) == []
    f = client.get("/api/planogramas/supervision/version", headers=admin, params={"id": v2}).json()
    assert f["montaje"]["estado"] == "coincide" and [x["nueva"] for x in f["fotos"]] == [False]
    assert [p["nombre"] for p in f["piezas"]] == ["Lácteos", "Halloween"]   # los números de la hoja

    # Vuelven a avisar: otra vez por revisar. No coincide: los números de la hoja.
    client.post("/api/guia/aviso", params={"token": token}, json={"estado": "montada"})
    assert _lista(client, admin)[0]["estado"] == "por_revisar"
    r = _revisar(client, admin, v2, resultado="no_coincide")
    assert r.status_code == 422 and r.json()["detail"]["code"] == "sin_numeros"
    r = _revisar(client, admin, v2, resultado="no_coincide", numeros=[3])
    assert r.status_code == 422 and r.json()["detail"]["code"] == "numero_invalido"
    r = _revisar(client, admin, v2, resultado="no_coincide", otra_cosa=True)
    assert r.status_code == 422 and r.json()["detail"]["code"] == "sin_nota"
    r = _revisar(client, admin, v2, resultado="no_coincide", numeros=[2, 2], nota="Halloween va a la derecha")
    assert r.status_code == 200, r.text
    (c,) = _lista(client, admin)
    assert c["estado"] == "no_coincide" and c["revision"]["numeros"] == [2] and c["aviso"] is None
    # Quien monta ve qué corregir en el enlace; al volver a avisar, se va.
    g = client.get("/api/guia", params={"token": token}).json()
    assert g["correccion"]["numeros"] == [2] and g["correccion"]["nota"] == "Halloween va a la derecha"
    assert g["aviso"]["estado"] == "montada"

    r = client.post("/api/guia/aviso", params={"token": token}, json={"estado": "no_se_pudo"})
    assert r.status_code == 422 and r.json()["detail"]["code"] == "sin_motivo"
    r = client.post("/api/guia/aviso", params={"token": token}, json={"estado": "no_se_pudo", "motivo": "sin_producto", "nota": "Mañana"})
    assert r.status_code == 201
    assert client.get("/api/guia", params={"token": token}).json()["correccion"] is None
    (c,) = _lista(client, admin)
    assert (c["estado"], c["aviso"]["motivo_legible"], c["aviso"]["nota"]) == ("no_se_pudo", "No llegó el producto", "Mañana")
    # La vio en la tienda: coincide sin foto nueva, y queda escrito.
    r = _revisar(client, admin, v2, resultado="coincide", en_la_tienda=True)
    assert r.status_code == 200 and r.json()["revision"]["en_la_tienda"] is True
    assert _lista(client, admin) == []
    f = client.get("/api/planogramas/supervision/version", headers=admin, params={"id": v2}).json()
    assert [x["estado"] for x in f["montaje"]["avisos"]] == ["no_se_pudo", "montada", "montada"] and [x["resultado"] for x in f["montaje"]["revisiones"]] == [
        "coincide", "no_coincide", "coincide"]

    # Una versión reemplazada no se monta ni se revisa.
    r = client.post("/api/guia/aviso", params={"token": _token(client, admin, v1)}, json={"estado": "montada"})
    assert r.status_code == 409 and r.json()["detail"]["code"] == "reemplazada"
    assert _revisar(client, admin, v1, resultado="coincide", en_la_tienda=True).status_code == 409
    # Un enlace no abre la lista ni la ficha.
    assert client.get("/api/planogramas/supervision", params={"token": token, "sede": "NAVE"}).status_code == 401


@RELOJ
def test_una_programada_no_entra_hasta_que_rige(client, admin):
    ids, _v1, v2 = _preparar(client, admin)
    v3 = _publicar(client, admin, "f-INT-01", [{"destino_id": ids[0], "pb": 5000, "vertices": _rect(0, 0.5)}], 4,
                   rige=D(2026, 10, 30))
    cara = client.get("/api/planogramas/cara", headers=admin, params={"sede": "NAVE", "fixture_id": "f-INT-01"}).json()
    assert {v["numero"]: v["montaje"]["estado"] for v in cara["planograma"]["versiones"]}[3] == "no_rige"
    assert [c["version_id"] for c in _lista(client, admin)] == [v2]
    # Montarla antes de que rija se puede avisar.
    r = client.post("/api/guia/aviso", params={"token": _token(client, admin, v3)}, json={"estado": "montada"})
    assert r.status_code == 201


@RELOJ
def test_revisa_quien_puede_publicar_esa_cara(client, admin, worker):
    ids, _v1, v2 = _preparar(client, admin)
    vm = _publicar(client, admin, "f-MET-01", [{"destino_id": ids[0], "pb": 2000, "vertices": _rect(0, 0.2)}], 0)
    assert {c["codigo"] for c in _lista(client, admin)} == {"INT-01", "MET-01"}
    # Sólo administración publica: el equipo no ve la lista ni revisa.
    assert _lista(client, worker) == []
    assert client.get("/api/planogramas/supervision/version", headers=worker, params={"id": v2}).status_code == 403
    assert _revisar(client, worker, v2, resultado="coincide", en_la_tienda=True).status_code == 403
    # Con el equipo habilitado: los internos sí, el que se vende nunca.
    assert client.put("/api/planogramas/ajustes", headers=admin, json={"quien_publica": "equipo"}).status_code == 200
    assert [c["codigo"] for c in _lista(client, worker)] == ["INT-01"]
    assert _revisar(client, worker, v2, resultado="coincide", en_la_tienda=True).status_code == 200
    assert _revisar(client, worker, vm, resultado="coincide", en_la_tienda=True).status_code == 403
    # Con sesión, el equipo avisa de un interno; de uno que se vende, no.
    assert client.post("/api/guia/aviso", headers=worker, json={"version": v2, "estado": "montada"}).status_code == 201
    assert client.post("/api/guia/aviso", headers=worker, json={"version": vm, "estado": "montada"}).status_code == 403


@RELOJ
def test_si_no_coincide_le_llega_la_guia_con_la_nota(client, admin, monkeypatch):
    _ids, _v1, v2 = _preparar(client, admin)
    r = client.put("/api/notifications/contacts", headers=admin, json={
        "gerente": ["gerente@super.co"], "by_sede": {"NAVE": {"mercaderista": ["monta@super.co"]}}})
    assert r.status_code == 200, r.text
    import app.routers.planogramas as rp

    enviados = []
    monkeypatch.setattr(rp, "correo_configurado", lambda: True)
    monkeypatch.setattr(rp, "send_mail_to_bg", lambda a, asunto, html: enviados.append((a, asunto, html)))
    r = _revisar(client, admin, v2, resultado="no_coincide", numeros=[1, 2], nota="Van al revés", reenviar=True)
    assert r.status_code == 200, r.text
    assert (r.json()["reenvio"], r.json()["reenviada_a"], r.json()["revision"]["guia_reenviada"]) == (
        "enviada", ["monta@super.co"], True)
    (a, asunto, html), = enviados
    assert a == ["monta@super.co"] and asunto.startswith("Corregir el montaje · INT-01 · cara A · versión 2")
    assert "Los números 1 y 2 · Van al revés" in html and "?guia=" in html and "$" not in html
    # Sin la casilla, no sale nada.
    _revisar(client, admin, v2, resultado="no_coincide", numeros=[1], reenviar=False)
    assert len(enviados) == 1
    # Sin correo configurado se guarda igual y se dice.
    monkeypatch.setattr(rp, "correo_configurado", lambda: False)
    r = _revisar(client, admin, v2, resultado="no_coincide", numeros=[1], reenviar=True)
    assert r.status_code == 200 and r.json()["reenvio"] == "sin_correo" and r.json()["revision"]["guia_reenviada"] is False
