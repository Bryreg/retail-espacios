"""Quién puede ver qué archivo.

El rol ``worker`` es de sólo lectura y, por diseño, nunca ve plata. Pero podía
listar y bajarse los contratos: ``require_auth`` comprobaba que hubiera
credencial y nadie comprobaba que ese archivo fuera para esos ojos. Con la clave
de trabajador —que conoce todo el personal— alcanzaba con numerar
``/api/files/1``, ``/api/files/2`` para levantar la cartera entera.

Las fotos sí las necesita: son las que el mapa de la sede le muestra. Por eso el
corte va por tipo de archivo y no por rol a secas.
"""

import io


def _crear_espacio(client, admin) -> int:
    """Un espacio al que colgarle archivos, por el camino del layout."""
    fixtures = [{
        "id": "f1", "code": "T-GON-01", "sede": "TEST", "type": "gondola",
        "gondolaType": "double", "label": "", "cx": 1.0, "cz": 1.0, "rotY": 0.0,
        "w": 1.0, "d": 1.0, "h": 1.8, "color": "#94a3b8", "rentable": True,
        "status": "free", "supplierName": "", "brandCategory": "",
        "negotiatedValue": 0, "startDate": "", "endDate": "", "observation": "",
    }]
    r = client.put("/api/layout/TEST",
                   json={"fixtures": fixtures, "base_updated_at": None},
                   headers=admin)
    assert r.status_code == 200, r.text
    espacios = client.get("/api/spaces/", headers=admin).json()
    assert espacios, "el layout tendría que haber creado el espacio"
    return espacios[0]["id"]


def _subir(client, admin, space_id, nombre, contenido, tipo):
    return client.post(
        f"/api/spaces/{space_id}/files",
        files={"file": (nombre, io.BytesIO(contenido), tipo)},
        headers=admin,
    )


def test_el_trabajador_no_lista_ni_baja_documentos(client, admin, worker):
    sid = _crear_espacio(client, admin)

    pdf = _subir(client, admin, sid, "contrato.pdf", b"%PDF-1.4 plata", "application/pdf")
    assert pdf.status_code == 201, pdf.text
    foto = _subir(client, admin, sid, "cara.png", b"\x89PNG\r\n\x1a\n", "image/png")
    assert foto.status_code == 201, foto.text

    id_pdf, id_foto = pdf.json()["id"], foto.json()["id"]

    # El admin ve las dos.
    listado_admin = client.get(f"/api/spaces/{sid}/files", headers=admin).json()
    assert {f["id"] for f in listado_admin} == {id_pdf, id_foto}
    assert client.get(f"/api/files/{id_pdf}", headers=admin).status_code == 200

    # El trabajador ve la foto y NO el contrato — ni listado ni descarga.
    listado_worker = client.get(f"/api/spaces/{sid}/files", headers=worker).json()
    assert {f["id"] for f in listado_worker} == {id_foto}
    assert client.get(f"/api/files/{id_foto}", headers=worker).status_code == 200
    assert client.get(f"/api/files/{id_pdf}", headers=worker).status_code == 404


def test_el_documento_negado_responde_404_y_no_403(client, admin, worker):
    """Un 403 confirmaría que ese archivo existe.

    Numerando ids se podría levantar el inventario de contratos sin bajar
    ninguno: cuántos hay y en qué espacios. El 404 no distingue entre «no está»
    y «no es para vos».
    """
    sid = _crear_espacio(client, admin)
    id_pdf = _subir(client, admin, sid, "contrato.pdf", b"%PDF-1.4", "application/pdf").json()["id"]

    negado = client.get(f"/api/files/{id_pdf}", headers=worker)
    inexistente = client.get("/api/files/999999", headers=worker)
    assert negado.status_code == inexistente.status_code == 404
    assert negado.json() == inexistente.json()


def test_sin_credencial_no_se_baja_nada(client, admin):
    sid = _crear_espacio(client, admin)
    id_foto = _subir(client, admin, sid, "cara.png", b"\x89PNG\r\n\x1a\n", "image/png").json()["id"]
    assert client.get(f"/api/files/{id_foto}").status_code == 401


def test_las_cabeceras_de_seguridad_viajan_en_toda_respuesta(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.headers["X-Content-Type-Options"] == "nosniff"
    assert r.headers["X-Frame-Options"] == "DENY"
    assert "frame-ancestors 'none'" in r.headers["Content-Security-Policy"]
    # Los scripts no llevan unsafe-inline: es donde de verdad importa.
    csp = r.headers["Content-Security-Policy"]
    script_src = next(p for p in csp.split("; ") if p.startswith("script-src"))
    assert "unsafe-inline" not in script_src
    # HSTS sólo con TLS; el cliente de pruebas entra por http.
    assert "Strict-Transport-Security" not in r.headers
