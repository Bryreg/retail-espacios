"""Confirmación de montaje: quién puede reportar, qué exige y qué pasa al borrar la sede.

El caso que motiva el archivo es el último: montaje y borrado de sede se
construyeron por separado, y juntos dejan un estado que se ve bien y miente —
una sede recreada con el mismo nombre reusa los mismos códigos, así que sus
espacios nuevos aparecían montados por reportes de la sede anterior.
"""

FIXTURE = {
    "id": "f1", "code": "GON-01", "sede": "NAVE", "type": "gondola",
    "label": "GON-01", "cx": 3, "cz": 8, "rotY": 0,
    "w": 0.9, "d": 4.0, "h": 1.8, "color": "#6366f1", "status": "free",
    "supplierName": "", "brandCategory": "", "negotiatedValue": 0,
    "startDate": "", "endDate": "", "observation": "",
}


def _put(client, admin, sede, fixtures):
    return client.put(
        f"/api/layout/{sede}",
        json={"fixtures": fixtures, "base_updated_at": None},
        headers=admin,
    )


# Un JPEG mínimo de verdad: SOI + APP0 + EOI. No hace falta que sea una foto,
# pero sí que el archivo llegue como llega desde un celular.
FOTO = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00\xff\xd9"


def _confirm(client, headers, code, sede="NAVE", estado="montado", foto=("montaje.jpg", FOTO, "image/jpeg"), **extra):
    """Reporta un montaje. Por defecto lleva foto, porque "montado" la exige."""
    data = {"space_code": code, "estado": estado, "sede": sede, **extra}
    files = {"foto": foto} if foto else None
    return client.post("/api/mounts/", data=data, headers=headers, files=files)


def test_worker_can_report_a_mount(client, worker):
    """Es el único punto donde un worker escribe. Si esto se cierra, el
    mercaderista queda sin forma de confirmar desde el celular."""
    r = _confirm(client, worker, "NAVE-GON-01", reportado_por="Andrés")
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["estado"] == "montado"
    assert body["rol"] == "worker"
    assert body["reportado_por"] == "Andrés"
    # La hora la pone el servidor, no el dispositivo.
    assert body["confirmado_en"]


def test_the_code_is_normalised(client, worker):
    assert _confirm(client, worker, " nave-gon-01 ").json()["space_code"] == "NAVE-GON-01"


def test_not_mounted_needs_a_reason(client, worker):
    """Un "no pude" sin motivo no le sirve a nadie: no se sabe a quién reclamarle."""
    assert _confirm(
        client, worker, "NAVE-GON-01", estado="no_montado", foto=None
    ).status_code == 422
    ok = _confirm(
        client, worker, "NAVE-GON-01", estado="no_montado", motivo="sin_material", foto=None
    )
    assert ok.status_code == 201, ok.text


def test_an_invented_estado_is_rejected(client, worker):
    assert _confirm(client, worker, "NAVE-GON-01", estado="a_medias").status_code == 422


def test_anonymous_cannot_report(client):
    assert client.post(
        "/api/mounts/", data={"space_code": "NAVE-GON-01", "estado": "montado"}
    ).status_code == 401


def test_history_is_kept_newest_first(client, worker):
    """Se guarda una fila por reporte, no una por espacio: el histórico de quién
    dijo qué es justamente lo que sirve cuando el proveedor reclama."""
    _confirm(client, worker, "NAVE-GON-01", estado="no_montado", motivo="sin_material", foto=None)
    _confirm(client, worker, "NAVE-GON-01")

    rows = client.get("/api/mounts/", headers=worker).json()
    assert len(rows) == 2
    assert rows[0]["estado"] == "montado", "el más reciente no quedó primero"


def test_deleting_a_sede_archives_its_mounts(client, admin, worker):
    """Sin esto, una sede recreada con el mismo nombre nacía montada."""
    _put(client, admin, "NAVE", [FIXTURE])
    _confirm(client, worker, "NAVE-GON-01")
    assert len(client.get("/api/mounts/", headers=admin).json()) == 1

    assert client.delete("/api/layout/NAVE", headers=admin).status_code == 204
    assert client.get("/api/mounts/", headers=admin).json() == []

    # Y la sede vuelve: los códigos son los mismos, el montaje no.
    _put(client, admin, "NAVE", [FIXTURE])
    assert client.get("/api/mounts/", headers=admin).json() == []


def test_archiving_reaches_reports_that_never_created_a_space(client, admin, worker):
    """Un "no pude montar" no crea fila en spaces — solo la foto la crea. Si el
    archivado se cuelga de los espacios, estos reportes sobreviven al borrado."""
    _put(client, admin, "NAVE", [FIXTURE])
    _confirm(client, worker, "NAVE-GON-01", estado="no_montado", motivo="sin_producto")

    client.delete("/api/layout/NAVE", headers=admin)
    assert client.get("/api/mounts/", headers=admin).json() == []


def test_deleting_a_sede_leaves_the_others_alone(client, admin, worker):
    _put(client, admin, "NAVE", [FIXTURE])
    _put(client, admin, "TERRON", [dict(FIXTURE, id="t1", sede="TERRON")])
    _confirm(client, worker, "NAVE-GON-01", sede="NAVE")
    _confirm(client, worker, "TERRON-GON-01", sede="TERRON")

    client.delete("/api/layout/NAVE", headers=admin)

    rows = client.get("/api/mounts/", headers=admin).json()
    assert [r["space_code"] for r in rows] == ["TERRON-GON-01"]


def test_a_mount_without_sede_is_matched_by_its_code(client, admin, worker):
    """El campo sede es opcional en el formulario; el prefijo del código es la
    segunda señal, igual que para los espacios."""
    _put(client, admin, "NAVE", [FIXTURE])
    r = client.post(
        "/api/mounts/",
        data={"space_code": "NAVE-GON-01", "estado": "montado"},
        files={"foto": ("montaje.jpg", FOTO, "image/jpeg")},
        headers=worker,
    )
    assert r.status_code == 201, r.text
    assert r.json()["sede"] is None

    client.delete("/api/layout/NAVE", headers=admin)
    assert client.get("/api/mounts/", headers=admin).json() == []


# ── La foto como prueba ──────────────────────────────────────────────────────

def test_mounted_without_a_photo_is_rejected(client, worker):
    """"Montado" sin foto es una afirmación sin respaldo, y es exactamente lo
    que el proveedor discute meses después."""
    r = _confirm(client, worker, "NAVE-GON-01", foto=None)
    assert r.status_code == 422
    assert "foto" in r.json()["detail"].lower()
    # Y no quedó nada a medias.
    assert client.get("/api/mounts/", headers=worker).json() == []


def test_not_mounted_does_not_need_a_photo(client, worker):
    """Si el material nunca llegó puede no haber qué fotografiar. Exigirla ahí
    dejaría sin reportar justo el problema que hay que escalar."""
    r = _confirm(
        client, worker, "NAVE-GON-01", estado="no_montado", motivo="sin_material", foto=None
    )
    assert r.status_code == 201, r.text
    assert r.json()["file_id"] is None


def test_an_iphone_photo_is_accepted(client, worker):
    """iOS no siempre convierte a JPEG al subir. Si el HEIC se rechaza, el
    mercaderista queda sin poder reportar desde su propio teléfono."""
    r = _confirm(client, worker, "NAVE-GON-01", foto=("IMG_0042.HEIC", FOTO, "image/heic"))
    assert r.status_code == 201, r.text
    assert r.json()["file_id"] is not None


def test_a_file_without_extension_falls_back_to_its_type(client, worker):
    """Hay cámaras y navegadores que mandan el archivo sin punto en el nombre.
    Bloquear por eso sería bloquear por un detalle que el usuario no controla."""
    r = _confirm(client, worker, "NAVE-GON-01", foto=("captura", FOTO, "image/jpeg"))
    assert r.status_code == 201, r.text
    assert r.json()["file_id"] is not None


def test_something_that_is_not_an_image_is_rejected(client, worker):
    r = _confirm(client, worker, "NAVE-GON-01", foto=("contrato.pdf", b"%PDF-1.4", "application/pdf"))
    assert r.status_code == 422


def test_the_photo_is_stored_and_linked(client, worker):
    """La foto tiene que quedar recuperable: si no, la prueba no existe."""
    r = _confirm(client, worker, "NAVE-GON-01")
    file_id = r.json()["file_id"]
    assert file_id
    assert client.get(f"/api/mounts/files/{file_id}/exists", headers=worker).json() == {"exists": True}


def test_an_svg_is_not_a_photo(client, worker):
    """Un SVG es una imagen para el navegador y un documento con scripts para
    todo lo demás. Guardado como foto y servido inline desde el mismo origen,
    ejecutaría JavaScript con la sesión de quien lo abra."""
    r = _confirm(
        client, worker, "NAVE-GON-01",
        foto=("mapa.svg", b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
              "image/svg+xml"),
    )
    assert r.status_code == 422
    # Y tampoco entra disfrazado de tipo declarado a mano.
    r2 = _confirm(client, worker, "NAVE-GON-01", foto=("sin_extension", b"<svg/>", "image/svg+xml"))
    assert r2.status_code == 422


def test_the_mount_photo_is_not_a_planogram(client, admin, worker):
    """La foto se cuelga del mismo espacio que las artes del proveedor. El
    editor 3D usa la imagen DESIGNADA de cada espacio como textura (Fase 3,
    fix H8-B2 — ya no "la más reciente": esa heurística dejaba que un
    contrato escaneado en JPG, subido después del arte, se convirtiera en la
    textura). Sin separar la foto de montaje de la designación, igual la
    reemplazaría — y con la foto obligatoria, en cada contrato."""
    _put(client, admin, "NAVE", [FIXTURE])
    # El arte del proveedor, subido por el camino normal de archivos y
    # DECLARADO como cara (uso=cara) — la designación explícita reemplaza a
    # la vieja heurística de "imagen más reciente".
    r = client.post(
        "/api/spaces/find-or-create",
        json={"code": "NAVE-GON-01", "name": "GON-01", "zone": "Z",
              "sede": "NAVE", "area_m2": 4.0},
        headers=admin,
    )
    space_id = r.json()["id"]
    arte = client.post(
        f"/api/spaces/{space_id}/files",
        files={"file": ("planograma.png", b"\x89PNG\r\n\x1a\n", "image/png")},
        data={"uso": "cara"},
        headers=admin,
    )
    assert arte.status_code in (200, 201), arte.text
    arte_id = arte.json()["id"]

    antes = client.get("/api/spaces/face-images", headers=admin).json()
    assert any(x["code"] == "NAVE-GON-01" and x["file_id"] == arte_id for x in antes)

    # Y ahora el mercaderista reporta el montaje con su foto.
    assert _confirm(client, worker, "NAVE-GON-01").status_code == 201

    despues = client.get("/api/spaces/face-images", headers=admin).json()
    fila = next(x for x in despues if x["code"] == "NAVE-GON-01")
    assert fila["file_id"] == arte_id, "la foto del montaje se robó el planograma"


def test_the_report_carries_enough_to_open_the_photo(client, worker):
    """La prueba no sirve si cuesta trabajo mirarla: el tablero necesita el
    nombre y el tipo para abrirla sin una segunda llamada por fila."""
    r = _confirm(client, worker, "NAVE-GON-01", foto=("IMG_0042.jpg", FOTO, "image/jpeg"))
    assert r.status_code == 201, r.text
    assert r.json()["foto_tipo"] == "image/jpeg"
    assert "IMG_0042.jpg" in r.json()["foto_nombre"]

    fila = client.get("/api/mounts/", headers=worker).json()[0]
    assert fila["foto_tipo"] == "image/jpeg"
    assert fila["file_id"]


def test_a_report_without_a_photo_says_so(client, worker):
    _confirm(client, worker, "NAVE-GON-01", estado="no_montado",
             motivo="sin_material", foto=None)
    fila = client.get("/api/mounts/", headers=worker).json()[0]
    assert fila["file_id"] is None
    assert fila["foto_nombre"] is None


def test_borrar_la_foto_de_un_montaje_deja_el_montaje_sin_foto(client, admin, worker):
    """Un admin puede borrar la foto (el ✕ del plano 2D en edición se la ofrece
    como a cualquier archivo). Antes de 2026-10-02 eso daba 500 en producción:
    `mount_confirmations.file_id` apunta al archivo sin regla de borrado, y
    Postgres —no SQLite— se niega a dejar la referencia colgando. El montaje
    pasó y la bitácora lo dice: se queda, sin la foto."""
    r = _confirm(client, worker, "NAVE-GON-01")
    assert r.status_code == 201, r.text
    foto = r.json()["file_id"]
    assert foto

    assert client.delete(f"/api/files/{foto}", headers=admin).status_code == 204

    fila = client.get("/api/mounts/", headers=admin).json()[0]
    assert fila["estado"] == "montado"
    assert fila["file_id"] is None, "el montaje sigue apuntando a un archivo borrado"
    assert fila["foto_nombre"] is None


def test_con_cuenta_propia_el_montaje_dice_quien_fue(client, admin):
    """Desde el 2026-10-02 el reporte con sesión de cuenta propia guarda ESA
    cuenta, no lo que se tecleó en «Tu nombre» (que es del tiempo de la clave
    compartida, cuando todos entraban como el mismo «worker»)."""
    from types import SimpleNamespace

    from app.services.firebase_tokens import get_verificador

    class Verificador:
        def verificar(self, id_token):
            return SimpleNamespace(uid="uid-m", email="mario@tienda.co", email_verificado=True,
                                   proveedor="google.com", nombre="Mario Montajes")

    client.app.dependency_overrides[get_verificador] = lambda: Verificador()
    r = client.post("/api/usuarios/invitar", json={"email": "mario@tienda.co", "rol": "worker"}, headers=admin)
    assert r.status_code == 200, r.text
    r = client.post("/api/auth/oauth", json={"id_token": "x", "acepta_politica": True})
    assert r.status_code == 200, r.text
    mario = {"Authorization": f"Bearer {r.json()['token']}"}

    r = _confirm(client, mario, "NAVE-GON-01", reportado_por="Otro Nombre")
    assert r.status_code == 201, r.text
    assert r.json()["reportado_por"] == "Mario Montajes"


def test_por_el_enlace_sin_cuenta_sigue_valiendo_el_nombre_escrito(client, worker):
    r = _confirm(client, worker, "NAVE-GON-01", reportado_por="Andrés")
    assert r.json()["reportado_por"] == "Andrés"
