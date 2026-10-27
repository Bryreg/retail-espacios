"""Etapa 7 del rediseño UX (2026-10-27): Montajes en una sola lista.

· «Verificar el montaje de un contrato» con «no coincide» puede reenviar el
  aviso de montaje (``reenviar``), y el enlace de quien monta muestra la
  verificación de su último reporte: qué hay que corregir.
· ``GET /planogramas/supervision?todas=1`` trae también las caras cuyo montaje
  coincide (el filtro «Verificado» de la lista); sin ``todas``, lo de siempre.
"""
import io

from tests import test_montaje_enlace as te
from tests import test_supervision_planogramas as sp


def _reportar(client, headers, code="NAVE-PUN-04"):
    r = client.post("/api/mounts/", headers=headers,
                    data={"space_code": code, "estado": "montado", "sede": "NAVE"},
                    files={"foto": ("m.jpg", io.BytesIO(b"\xff\xd8\xff\xe0jpeg"), "image/jpeg")})
    assert r.status_code == 201, r.text
    return r.json()


def test_no_coincide_reenvia_el_aviso_y_el_enlace_dice_que_corregir(client, admin, worker):
    te._armado(client, admin)
    m = _reportar(client, worker)
    r = client.post(f"/api/mounts/{m['id']}/verificar", headers=admin,
                    json={"resultado": "no_coincide", "nota": "Falta el cabezote", "reenviar": True})
    assert r.status_code == 200, r.text
    v = r.json()["verificacion"]
    # Sin correo configurado en las pruebas: se intentó y se dice que no salió.
    assert v["resultado"] == "no_coincide" and v["aviso_reenviado"] is False
    # Quien monta abre su enlace y lee qué corregir (sin plata).
    b = client.get("/api/montaje/mi-espacio", headers=te._cab(te._mount_token())).json()
    assert b["ultimo"]["verificacion"]["resultado"] == "no_coincide"
    assert b["ultimo"]["verificacion"]["nota"] == "Falta el cabezote"
    assert "1800000" not in str(b) and "1.800.000" not in str(b)
    # «Coincide» no reenvía nada aunque lo pidan.
    r = client.post(f"/api/mounts/{m['id']}/verificar", headers=admin,
                    json={"resultado": "coincide", "reenviar": True})
    assert r.status_code == 200 and "aviso_reenviado" not in r.json()["verificacion"]


@sp.RELOJ
def test_la_supervision_de_planogramas_con_todas(client, admin):
    _ids, _v1, v2 = sp._preparar(client, admin)
    token = sp._token(client, admin, v2)
    assert client.post("/api/guia/aviso", params={"token": token}, json={"estado": "montada"}).status_code == 201
    assert sp._revisar(client, admin, v2, resultado="coincide", en_la_tienda=True).status_code == 200
    # «Para revisar» ya no la quiere; la lista de Montajes, sí, con su revisión.
    assert sp._lista(client, admin) == []
    r = client.get("/api/planogramas/supervision", headers=admin, params={"sede": "NAVE", "todas": 1})
    (c,) = r.json()["caras"]
    assert (c["version_id"], c["estado"]) == (v2, "coincide")
    assert c["revision"]["resultado"] == "coincide" and c["revision"]["en_la_tienda"] is True
