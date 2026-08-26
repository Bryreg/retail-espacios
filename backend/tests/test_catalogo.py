"""El catálogo de artes: de quién es cada producto y por qué no vive en el espacio.

El caso que motiva el archivo es el último. El arte antes entraba por
``space_files`` y el 3D tomaba la imagen MÁS RECIENTE del espacio, así que
cualquier cosa que alguien subiera —un contrato escaneado, la foto de un
pasillo— se convertía en el producto del mueble. Con tabla propia las dos cosas
dejan de pisarse, y lo comprueba el test de abajo.
"""

# Un JPEG y un PNG mínimos de verdad.
JPG = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00\xff\xd9"
PNG = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01"
    b"\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
)
# Un SVG: es una imagen para el navegador y un documento con scripts para todo
# lo demás. Se sirve inline desde el mismo origen que la app.
SVG = b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'


def _proveedor(client, admin, name="Alpina"):
    r = client.post("/api/suppliers/find-or-create", json={"name": name}, headers=admin)
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


def _subir(client, headers, supplier_id, nombre="Yogurt Griego 150g",
           archivo=("yogurt.jpg", JPG, "image/jpeg"), **extra):
    return client.post(
        "/api/catalogo/",
        data={"supplier_id": supplier_id, "nombre": nombre, **extra},
        files={"file": archivo},
        headers=headers,
    )


# ─── Lo básico ────────────────────────────────────────────────────────────────

def test_se_carga_una_vez_y_queda_en_la_lista(client, admin):
    prov = _proveedor(client, admin)
    r = _subir(client, admin, prov, categoria="Lácteos")
    assert r.status_code == 201, r.text
    b = r.json()
    assert b["nombre"] == "Yogurt Griego 150g"
    assert b["categoria"] == "Lácteos"
    assert b["content_type"] == "image/jpeg"
    assert b["size"] == len(JPG)
    # El nombre del proveedor viaja resuelto: la lista del 3D agrupa por
    # proveedor y no puede pedir una segunda llamada para saber cómo se llama.
    assert b["proveedor"] == "Alpina"

    lista = client.get("/api/catalogo/", headers=admin).json()
    assert [a["nombre"] for a in lista] == ["Yogurt Griego 150g"]


def test_el_arte_se_sirve_para_pintarla(client, admin):
    prov = _proveedor(client, admin)
    arte = _subir(client, admin, prov).json()["id"]
    r = client.get(f"/api/catalogo/{arte}/imagen", headers=admin)
    assert r.status_code == 200
    assert r.content == JPG
    assert r.headers["content-type"] == "image/jpeg"


def test_el_cargador_de_texturas_entra_con_el_token_en_la_query(client, admin):
    """Three.js hace un fetch del navegador y no manda Authorization."""
    prov = _proveedor(client, admin)
    arte = _subir(client, admin, prov).json()["id"]
    token = admin["Authorization"].split(" ", 1)[1]
    assert client.get(f"/api/catalogo/{arte}/imagen?token={token}").status_code == 200
    assert client.get(f"/api/catalogo/{arte}/imagen").status_code == 401
    assert client.get(f"/api/catalogo/{arte}/imagen?token=basura").status_code == 401


def test_un_proveedor_puede_tener_varios_productos(client, admin):
    prov = _proveedor(client, admin)
    _subir(client, admin, prov, nombre="Yogurt Griego")
    _subir(client, admin, prov, nombre="Avena")
    otro = _proveedor(client, admin, "Nutresa")
    _subir(client, admin, otro, nombre="Café")

    todos = client.get("/api/catalogo/", headers=admin).json()
    assert len(todos) == 3
    # Ordenado por proveedor y después por producto: así se lee la lista.
    assert [a["proveedor"] for a in todos] == ["Alpina", "Alpina", "Nutresa"]
    assert [a["nombre"] for a in todos] == ["Avena", "Yogurt Griego", "Café"]

    solo = client.get(f"/api/catalogo/?supplier_id={otro}", headers=admin).json()
    assert [a["nombre"] for a in solo] == ["Café"]


def test_el_mismo_producto_se_le_prueba_a_cualquier_mueble(client, admin):
    """Es el punto entero del cambio: el arte NO cuelga de un espacio.

    Antes había que resubir el mismo archivo en cada punta que se quisiera
    mostrar. Acá se carga una vez y el id sirve para pintar cualquier cara, de
    cualquier sede — no hay nada en la fila que la ate a un espacio.
    """
    prov = _proveedor(client, admin)
    arte = _subir(client, admin, prov).json()
    assert "space_id" not in arte and "space_code" not in arte
    # Y se puede pedir cuantas veces haga falta, que es lo que pasa cuando se
    # prueba el mismo producto en tres muebles seguidos.
    for _ in range(3):
        assert client.get(f"/api/catalogo/{arte['id']}/imagen", headers=admin).status_code == 200


def test_el_catalogo_y_los_archivos_del_espacio_no_se_pisan(client, admin):
    """Una imagen subida al espacio no aparece en el catálogo, ni al revés.

    Es la razón de la tabla nueva. Con todo en ``space_files``, el 3D tomaba la
    imagen más reciente del espacio, así que subir un contrato escaneado en JPG
    reemplazaba el producto del mueble.
    """
    prov = _proveedor(client, admin)
    _subir(client, admin, prov, nombre="Yogurt Griego")

    r = client.post(
        "/api/spaces/find-or-create",
        json={"code": "NAVE-PUN-04", "name": "Punta", "zone": "punta", "sede": "NAVE", "area_m2": 1.0},
        headers=admin,
    )
    space_id = r.json()["id"]
    subida = client.post(
        f"/api/spaces/{space_id}/files",
        files={"file": ("contrato-escaneado.jpg", JPG, "image/jpeg")},
        headers=admin,
    )
    assert subida.status_code in (200, 201), subida.text

    catalogo = client.get("/api/catalogo/", headers=admin).json()
    assert [a["nombre"] for a in catalogo] == ["Yogurt Griego"]
    archivos = client.get(f"/api/spaces/{space_id}/files", headers=admin).json()
    assert [f["filename"] for f in archivos] == ["contrato-escaneado.jpg"]


# ─── Lo que se rechaza ────────────────────────────────────────────────────────

def test_no_se_acepta_un_svg(client, admin):
    """Un SVG es un documento con scripts servido desde el origen de la app."""
    prov = _proveedor(client, admin)
    r = _subir(client, admin, prov, archivo=("logo.svg", SVG, "image/svg+xml"))
    assert r.status_code == 422
    # Ni cambiándole la extensión: la lista es cerrada por los dos lados.
    r = _subir(client, admin, prov, archivo=("logo", SVG, "image/svg+xml"))
    assert r.status_code == 422


def test_sin_extension_vale_el_tipo_declarado(client, admin):
    """Una imagen pegada desde el portapapeles llega sin nombre de archivo."""
    prov = _proveedor(client, admin)
    r = _subir(client, admin, prov, archivo=("blob", PNG, "image/png"))
    assert r.status_code == 201, r.text
    assert r.json()["content_type"] == "image/png"


def test_un_producto_sin_nombre_no_sirve(client, admin):
    """El nombre es lo que se elige de la lista; sin él no hay nada que elegir."""
    prov = _proveedor(client, admin)
    assert _subir(client, admin, prov, nombre="   ").status_code == 422


def test_un_archivo_vacio_se_rechaza(client, admin):
    prov = _proveedor(client, admin)
    assert _subir(client, admin, prov, archivo=("x.jpg", b"", "image/jpeg")).status_code == 422


def test_no_se_carga_contra_un_proveedor_que_no_existe(client, admin):
    assert _subir(client, admin, 9999).status_code == 404


def test_el_arte_pesada_se_rechaza(client, admin):
    prov = _proveedor(client, admin)
    grande = b"\xff\xd8\xff\xe0" + b"\x00" * (5 * 1024 * 1024 + 1)
    assert _subir(client, admin, prov, archivo=("x.jpg", grande, "image/jpeg")).status_code == 413


# ─── Quién puede qué ──────────────────────────────────────────────────────────

def test_el_worker_mira_pero_no_carga_ni_borra(client, admin, worker):
    """Ve el catálogo —el 3D lo necesita para pintar— pero no lo edita."""
    prov = _proveedor(client, admin)
    arte = _subir(client, admin, prov).json()["id"]

    assert client.get("/api/catalogo/", headers=worker).status_code == 200
    assert client.get(f"/api/catalogo/{arte}/imagen", headers=worker).status_code == 200
    assert _subir(client, worker, prov).status_code == 403
    assert client.delete(f"/api/catalogo/{arte}", headers=worker).status_code == 403


def test_sin_sesion_no_se_ve_nada(client, admin):
    prov = _proveedor(client, admin)
    arte = _subir(client, admin, prov).json()["id"]
    assert client.get("/api/catalogo/").status_code == 401
    assert client.get(f"/api/catalogo/{arte}/imagen").status_code == 401
    assert client.delete(f"/api/catalogo/{arte}").status_code == 401


def test_el_enlace_de_montaje_tampoco_llega_al_catalogo(client, admin):
    """El token de la mercaderista está cerrado por defecto: esto lo confirma."""
    from app.auth import create_mount_token

    prov = _proveedor(client, admin)
    arte = _subir(client, admin, prov).json()["id"]
    t = create_mount_token("NAVE-PUN-04")
    assert client.get("/api/catalogo/", headers={"Authorization": f"Bearer {t}"}).status_code == 401
    assert client.get(f"/api/catalogo/{arte}/imagen?token={t}").status_code == 401


def test_borrar_saca_el_producto_de_la_lista(client, admin):
    prov = _proveedor(client, admin)
    arte = _subir(client, admin, prov).json()["id"]
    assert client.delete(f"/api/catalogo/{arte}", headers=admin).status_code == 204
    assert client.get("/api/catalogo/", headers=admin).json() == []
    # Y la imagen deja de responder: el 3D cae al patrón de categoría.
    assert client.get(f"/api/catalogo/{arte}/imagen", headers=admin).status_code == 404
    assert client.delete(f"/api/catalogo/{arte}", headers=admin).status_code == 404
