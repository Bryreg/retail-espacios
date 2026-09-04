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


def _subir(client, admin, space_id, nombre, contenido, tipo, *, uso=None):
    return client.post(
        f"/api/spaces/{space_id}/files",
        files={"file": (nombre, io.BytesIO(contenido), tipo)},
        data={"uso": uso} if uso else {},
        headers=admin,
    )


def test_el_trabajador_no_lista_ni_baja_documentos(client, admin, worker):
    sid = _crear_espacio(client, admin)

    pdf = _subir(client, admin, sid, "contrato.pdf", b"%PDF-1.4 plata", "application/pdf")
    assert pdf.status_code == 201, pdf.text
    # Designada como cara: sin esto, con el fix de la Iteración 2 (designación
    # explícita, fail closed) el worker no vería NINGUNA imagen.
    foto = _subir(client, admin, sid, "cara.png", b"\x89PNG\r\n\x1a\n", "image/png", uso="cara")
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


# ─── H8 (auditoría de vitrinas-3d): el contrato escaneado como imagen ─────────
#
# El filtro viejo era por content-type: cualquier JPG/PNG/WEBP pasaba para el
# worker, contrato escaneado incluido.
#
# ITERACIÓN 1 de este fix filtraba por "la imagen más reciente del espacio" —
# el mismo error con otro nombre: el auditor red-team (X-18/X-18b,
# `test_compliance_ataques.py`) mostró que un contrato en JPG subido DESPUÉS
# de la cara real, o como ÚNICO adjunto de un espacio, seguía calificando
# como "la más reciente" y volvía a bajar para el worker.
#
# ITERACIÓN 2 (esta): la cara vigente es una DESIGNACIÓN EXPLÍCITA
# (`uso="cara"` en el upload, ver `routers/files.py::upload_space_file` y
# `models.SpaceFace`) — nunca se infiere de cuándo se subió. Un espacio sin
# ninguna designación no tiene cara para el worker: fail closed a propósito.

def _token_de(headers: dict) -> str:
    return headers["Authorization"].split(" ", 1)[1]


def test_contrato_jpg_no_designado_no_es_la_cara_vigente(client, admin, worker):
    """El caso base: un contrato en JPG sin designar convive con la cara
    DESIGNADA del espacio — el worker ve sólo la designada."""
    sid = _crear_espacio(client, admin)

    contrato_jpg = _subir(
        client, admin, sid, "contrato-firmado.jpg", b"\xff\xd8\xff\xe0 contrato", "image/jpeg"
    ).json()["id"]
    cara = _subir(
        client, admin, sid, "cara-proveedor.png", b"\x89PNG\r\n\x1a\n", "image/png", uso="cara"
    ).json()["id"]

    # El worker NO ve el contrato en el listado — sólo la cara designada.
    listado_worker = client.get(f"/api/spaces/{sid}/files", headers=worker).json()
    assert {f["id"] for f in listado_worker} == {cara}

    # GET /api/files/{id} con token de worker: 404, tanto por header como por
    # ?token= (el mismo camino que usa el <img>/<iframe> del admin).
    tok_worker = _token_de(worker)
    assert client.get(f"/api/files/{contrato_jpg}", headers=worker).status_code == 404
    assert client.get(f"/api/files/{contrato_jpg}?token={tok_worker}").status_code == 404

    # La cara designada sí baja para el worker, por las dos vías.
    assert client.get(f"/api/files/{cara}", headers=worker).status_code == 200
    assert client.get(f"/api/files/{cara}?token={tok_worker}").status_code == 200

    # El admin sigue bajando TODO, por header y por ?token= — no se le rompió
    # el <img>/<iframe> que usa la pantalla de administración.
    tok_admin = _token_de(admin)
    assert client.get(f"/api/files/{contrato_jpg}", headers=admin).status_code == 200
    assert client.get(f"/api/files/{contrato_jpg}?token={tok_admin}").status_code == 200
    assert client.get(f"/api/files/{cara}", headers=admin).status_code == 200
    assert client.get(f"/api/files/{cara}?token={tok_admin}").status_code == 200
    listado_admin = client.get(f"/api/spaces/{sid}/files", headers=admin).json()
    assert {f["id"] for f in listado_admin} == {contrato_jpg, cara}


def test_x18_contrato_jpg_subido_despues_de_la_cara_no_la_reemplaza(client, admin, worker):
    """Cierra X-18: el orden natural es armar el espacio, subir la cara para
    el 3D, y DESPUÉS firmar y escanear el contrato. Con la Iteración 1 (heur.
    "más reciente"), ese orden bastaba para que el contrato SE CONVIRTIERA en
    la cara. Con la designación explícita, subir un archivo después no mueve
    la designación de nadie — sólo un ``uso="cara"`` nuevo la mueve."""
    sid = _crear_espacio(client, admin)

    cara = _subir(
        client, admin, sid, "cara-alpina.png", b"\x89PNG\r\n\x1a\n", "image/png", uso="cara"
    ).json()["id"]
    contrato_jpg = _subir(
        client, admin, sid, "contrato-firmado.jpg", b"\xff\xd8\xff plata", "image/jpeg"
    ).json()["id"]  # sin uso: NO se convierte en la cara pese a ser el más nuevo

    tok_worker = _token_de(worker)
    listado_worker = client.get(f"/api/spaces/{sid}/files", headers=worker).json()
    assert {f["id"] for f in listado_worker} == {cara}, "el worker lista el contrato"
    assert client.get(f"/api/files/{contrato_jpg}", headers=worker).status_code == 404
    assert client.get(f"/api/files/{contrato_jpg}?token={tok_worker}").status_code == 404
    assert client.get(f"/api/files/{cara}", headers=worker).status_code == 200


def test_x18b_espacio_cuyo_unico_adjunto_es_el_contrato_jpg_no_designado(client, admin, worker):
    """Cierra X-18b — el escenario original de H8: un espacio al que sólo se
    le colgó el contrato fotografiado, sin designar nada como cara. Con la
    Iteración 1 esa era, por ser la única imagen, "la más reciente" y por lo
    tanto la cara. Con la designación explícita el espacio queda SIN cara —
    fail closed — y el contrato nunca calificó."""
    sid = _crear_espacio(client, admin)
    contrato = _subir(
        client, admin, sid, "contrato-firmado.jpg", b"\xff\xd8\xff plata", "image/jpeg"
    ).json()["id"]

    tok_worker = _token_de(worker)
    assert client.get(f"/api/spaces/{sid}/files", headers=worker).json() == []
    assert client.get(f"/api/files/{contrato}", headers=worker).status_code == 404
    assert client.get(f"/api/files/{contrato}?token={tok_worker}").status_code == 404

    # Y queda anotada su bajada (por el admin, que sí puede).
    assert client.get(f"/api/files/{contrato}", headers=admin).status_code == 200
    entradas = client.get("/api/bitacora/", headers=admin).json()
    assert any(
        e.get("accion") == "archivo.descarga" and e.get("entidad_id") == str(contrato)
        for e in entradas
    ), "la bajada del contrato único (sin designar) tendría que quedar anotada"


def test_espacio_sin_designacion_el_worker_no_ve_ninguna_imagen_no_de_montaje(client, admin, worker):
    """Fail closed explícito: aunque haya VARIAS imágenes en el espacio,
    ninguna es la cara mientras el admin no designe una — no vuelve la
    heurística vieja de "la más reciente esté designada o no"."""
    sid = _crear_espacio(client, admin)
    vieja = _subir(client, admin, sid, "vieja.png", b"\x89PNG vieja", "image/png").json()["id"]
    nueva = _subir(client, admin, sid, "nueva.png", b"\x89PNG nueva", "image/png").json()["id"]
    montaje = _subir(
        client, admin, sid, "montaje--T-GON-01--foto.jpg", b"\xff\xd8\xff foto", "image/jpeg"
    ).json()["id"]

    listado_worker = client.get(f"/api/spaces/{sid}/files", headers=worker).json()
    assert {f["id"] for f in listado_worker} == {montaje}
    for fid in (vieja, nueva):
        assert client.get(f"/api/files/{fid}", headers=worker).status_code == 404


def test_x19_montaje_contrato_pdf_no_cuela_por_el_nombre(client, admin, worker):
    """Cierra X-19 (M-1): ``_es_foto_montaje`` exige TAMBIÉN que el
    content-type sea de imagen — un PDF nombrado ``montaje--contrato.pdf`` no
    es una foto de montaje sólo porque el nombre empiece con el prefijo
    reservado, y su bajada queda anotada como cualquier documento."""
    sid = _crear_espacio(client, admin)
    disfrazado = _subir(
        client, admin, sid, "montaje--contrato-firmado.pdf", b"%PDF-1.4 plata", "application/pdf"
    )
    assert disfrazado.status_code == 201, disfrazado.text
    fid = disfrazado.json()["id"]

    tok_worker = _token_de(worker)
    listado_worker = client.get(f"/api/spaces/{sid}/files", headers=worker).json()
    assert fid not in {f["id"] for f in listado_worker}, "el worker lista el PDF disfrazado"
    assert client.get(f"/api/files/{fid}", headers=worker).status_code == 404
    assert client.get(f"/api/files/{fid}?token={tok_worker}").status_code == 404

    # Y su bajada por el admin SÍ queda en bitácora (el bypass del nombre no
    # esquiva tampoco el registro, M-1).
    assert client.get(f"/api/files/{fid}", headers=admin).status_code == 200
    entradas = client.get("/api/bitacora/", headers=admin).json()
    assert any(
        e.get("accion") == "archivo.descarga" and e.get("entidad_id") == str(fid)
        for e in entradas
    ), "el PDF disfrazado de foto de montaje tendría que quedar anotado al bajarse"


def test_la_foto_de_montaje_de_verdad_sigue_visible_para_el_worker(client, admin, worker):
    """El worker conserva lo que ya podía ver — su propia foto de montaje —
    junto con un contrato sin designar (que queda afuera) y la cara designada
    (que sigue adentro) en el mismo espacio."""
    sid = _crear_espacio(client, admin)
    contrato_jpg = _subir(
        client, admin, sid, "contrato.jpg", b"\xff\xd8\xff\xe0 plata", "image/jpeg"
    ).json()["id"]
    cara = _subir(
        client, admin, sid, "cara.png", b"\x89PNG\r\n\x1a\n", "image/png", uso="cara"
    ).json()["id"]
    # La foto de montaje entra con el prefijo reservado, como hace mounts.py.
    foto_montaje = _subir(
        client, admin, sid, "montaje--T-GON-01--listo.jpg", b"\xff\xd8\xff\xe0 listo", "image/jpeg"
    ).json()["id"]

    listado_worker = client.get(f"/api/spaces/{sid}/files", headers=worker).json()
    assert {f["id"] for f in listado_worker} == {cara, foto_montaje}
    assert contrato_jpg not in {f["id"] for f in listado_worker}

    assert client.get(f"/api/files/{foto_montaje}", headers=worker).status_code == 200
    assert client.get(f"/api/files/{contrato_jpg}", headers=worker).status_code == 404


def test_bajar_un_jpg_no_designado_queda_en_bitacora(client, admin, worker):
    """Lo que ahora queda restringido se anota al bajarlo, como ya se hace con
    los documentos — el admin incluido, porque la bitácora de descargas no
    distingue quién pide el archivo."""
    sid = _crear_espacio(client, admin)
    viejo = _subir(
        client, admin, sid, "contrato-viejo.jpg", b"\xff\xd8\xff\xe0 viejo", "image/jpeg"
    ).json()["id"]
    _subir(client, admin, sid, "cara-nueva.png", b"\x89PNG\r\n\x1a\n", "image/png", uso="cara")

    assert client.get(f"/api/files/{viejo}", headers=admin).status_code == 200

    entradas = client.get("/api/bitacora/", headers=admin).json()
    # `entidad_id` viaja como texto (columna String en AuditEntry).
    assert any(
        e.get("accion") == "archivo.descarga" and e.get("entidad_id") == str(viejo)
        for e in entradas
    ), "la bajada del JPG no designado tendría que quedar anotada"


def test_designar_una_cara_nueva_reemplaza_a_la_anterior(client, admin, worker):
    """Una fila por espacio: la segunda designación desplaza a la primera, no
    convive con ella — ni en el listado ni en `GET /spaces/face-images`."""
    sid = _crear_espacio(client, admin)
    primera = _subir(
        client, admin, sid, "cara-v1.png", b"\x89PNG v1", "image/png", uso="cara"
    ).json()["id"]
    segunda = _subir(
        client, admin, sid, "cara-v2.png", b"\x89PNG v2", "image/png", uso="cara"
    ).json()["id"]

    listado_worker = client.get(f"/api/spaces/{sid}/files", headers=worker).json()
    assert {f["id"] for f in listado_worker} == {segunda}
    assert client.get(f"/api/files/{primera}", headers=worker).status_code == 404
    assert client.get(f"/api/files/{segunda}", headers=worker).status_code == 200

    caras = client.get("/api/spaces/face-images", headers=worker).json()
    assert [c["file_id"] for c in caras] == [segunda]


def test_designar_como_cara_exige_una_imagen(client, admin):
    """``uso=cara`` sobre un PDF (o cualquier no-imagen) es 422 — declarar un
    documento como la cara del mueble no tiene sentido y no debe poder
    esquivar el filtro por esa vía."""
    sid = _crear_espacio(client, admin)
    r = _subir(client, admin, sid, "contrato.pdf", b"%PDF-1.4 plata", "application/pdf", uso="cara")
    assert r.status_code == 422, r.text


def test_uso_invalido_es_422(client, admin):
    sid = _crear_espacio(client, admin)
    r = _subir(client, admin, sid, "algo.png", b"\x89PNG algo", "image/png", uso="lo-que-sea")
    assert r.status_code == 422, r.text


def test_foto_de_montaje_heic_sigue_visible_para_el_worker(client, worker, admin):
    """Regresión del propio fix M-1: `_es_foto_montaje` no puede exigir el
    ``IMAGENES`` estricto de este archivo (jpeg/png/webp) — `mounts.py`
    acepta también HEIC/HEIF (fotos de iPhone sin convertir), y ese
    content-type nunca pasa por `ALLOWED_EXTENSIONS` de acá. Exigir el
    conjunto estricto hubiera dejado al mercaderista con iPhone sin ver su
    propia foto."""
    foto = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00\xff\xd9"
    r = client.post(
        "/api/mounts/",
        data={"space_code": "MFOTO-GON-01", "estado": "montado", "sede": "MFOTO"},
        files={"foto": ("IMG_0042.HEIC", foto, "image/heic")},
        headers=worker,
    )
    assert r.status_code == 201, r.text
    file_id = r.json()["file_id"]
    assert file_id is not None

    espacios = client.get("/api/spaces/", headers=admin).json()
    sid = next(e["id"] for e in espacios if e["code"] == "MFOTO-GON-01")

    listado_worker = client.get(f"/api/spaces/{sid}/files", headers=worker).json()
    assert {f["id"] for f in listado_worker} == {file_id}
    assert client.get(f"/api/files/{file_id}", headers=worker).status_code == 200


def test_face_images_solo_lista_espacios_con_designacion(client, admin):
    """`GET /spaces/face-images` (la fuente del 3D) usa la MISMA designación:
    un espacio sin ella no aparece — fail closed también para el 3D, no sólo
    para el worker."""
    sid = _crear_espacio(client, admin)
    _subir(client, admin, sid, "contrato.jpg", b"\xff\xd8\xff plata", "image/jpeg")  # sin designar

    assert client.get("/api/spaces/face-images", headers=admin).json() == []

    cara = _subir(
        client, admin, sid, "cara.png", b"\x89PNG cara", "image/png", uso="cara"
    ).json()["id"]
    caras = client.get("/api/spaces/face-images", headers=admin).json()
    assert [c["file_id"] for c in caras] == [cara]
