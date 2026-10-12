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


# ─── La ficha del arte: forma y medidas del envase ────────────────────────────
#
# Es lo que decide la escala del producto en el 3D y cuántos frentes entran por
# entrepaño. Vive en una tabla NUEVA (`supplier_asset_specs`), 1:1 con el arte,
# porque `supplier_assets` no puede ganar columnas sin migración.

FICHA_VASO = {
    "forma": "vaso", "alto_mm": 90, "ancho_mm": 75, "fondo_mm": 75,
    "apilable": True, "acostado": False, "fondo_foto": "auto",
}


def _fichas_en_la_base(arte_id=None):
    """Cuenta directa en la base: SQLite no hace cumplir la clave foránea, así
    que la API sola no alcanza para saber si quedó una ficha huérfana."""
    from app.database import SessionLocal
    from app.models.models import SupplierAssetSpec

    db = SessionLocal()
    try:
        q = db.query(SupplierAssetSpec)
        if arte_id is not None:
            q = q.filter(SupplierAssetSpec.asset_id == arte_id)
        return q.count()
    finally:
        db.close()


def test_la_ficha_viaja_en_el_mismo_formulario_del_alta(client, admin):
    prov = _proveedor(client, admin)
    r = _subir(client, admin, prov, forma="vaso", alto_mm="90", apilable="true")
    assert r.status_code == 201, r.text
    ficha = r.json()["ficha"]
    assert ficha["forma"] == "vaso" and ficha["alto_mm"] == 90 and ficha["apilable"] is True
    # Lo que no se mandó queda en su valor por defecto.
    assert ficha["ancho_mm"] is None and ficha["fondo_foto"] == "auto"
    lista = client.get("/api/catalogo/", headers=admin).json()
    assert lista[0]["ficha"]["alto_mm"] == 90


def test_un_arte_sin_ficha_se_lista_con_ficha_nula(client, admin):
    """Las artes de antes no tienen ficha y no están rotas: el 3D las estima."""
    prov = _proveedor(client, admin)
    assert _subir(client, admin, prov).status_code == 201
    assert client.get("/api/catalogo/", headers=admin).json()[0]["ficha"] is None
    assert _fichas_en_la_base() == 0


def test_la_ficha_se_crea_y_despues_se_reemplaza(client, admin):
    prov = _proveedor(client, admin)
    arte = _subir(client, admin, prov).json()["id"]
    r = client.put(f"/api/catalogo/{arte}/ficha", json=FICHA_VASO, headers=admin)
    assert r.status_code == 200, r.text
    assert r.json()["ficha"]["alto_mm"] == 90
    assert r.json()["proveedor"] == "Alpina" and r.json()["id"] == arte

    otra = {**FICHA_VASO, "alto_mm": 120, "fondo_foto": "quitar", "apilable": False}
    r = client.put(f"/api/catalogo/{arte}/ficha", json=otra, headers=admin)
    assert r.status_code == 200, r.text
    assert r.json()["ficha"]["alto_mm"] == 120 and r.json()["ficha"]["fondo_foto"] == "quitar"
    # Reemplaza: sigue habiendo UNA ficha para ese arte, no dos.
    assert _fichas_en_la_base(arte) == 1
    assert client.get("/api/catalogo/", headers=admin).json()[0]["ficha"]["alto_mm"] == 120


def test_la_ficha_la_carga_sola_la_administracion(client, admin, worker):
    prov = _proveedor(client, admin)
    arte = _subir(client, admin, prov).json()["id"]
    assert client.put(f"/api/catalogo/{arte}/ficha", json=FICHA_VASO, headers=worker).status_code == 403
    assert client.put(f"/api/catalogo/{arte}/ficha", json=FICHA_VASO).status_code == 401
    assert client.put("/api/catalogo/9999/ficha", json=FICHA_VASO, headers=admin).status_code == 404
    # Y el worker tampoco la cuela por el alta.
    assert _subir(client, worker, prov, forma="vaso", alto_mm="90").status_code == 403
    assert _fichas_en_la_base() == 0


def test_la_ficha_es_una_lista_cerrada_con_topes(client, admin):
    prov = _proveedor(client, admin)
    arte = _subir(client, admin, prov).json()["id"]
    for malo in (
        {**FICHA_VASO, "forma": "tubo"},
        {**FICHA_VASO, "alto_mm": 0},
        {**FICHA_VASO, "alto_mm": 5000},
        {**FICHA_VASO, "fondo_foto": "x"},
        {**FICHA_VASO, "color": "rojo"},
    ):
        r = client.put(f"/api/catalogo/{arte}/ficha", json=malo, headers=admin)
        assert r.status_code == 422, (malo, r.text)
    # En el alta también, y ANTES de guardar el arte: no queda un arte suelto.
    for campos in ({"forma": "tubo"}, {"alto_mm": "0"}, {"alto_mm": "5000"}, {"fondo_foto": "x"}):
        r = _subir(client, admin, prov, nombre="Otro", **campos)
        assert r.status_code == 422, (campos, r.text)
    assert [a["nombre"] for a in client.get("/api/catalogo/", headers=admin).json()] == ["Yogurt Griego 150g"]
    assert _fichas_en_la_base() == 0


def test_el_precio_al_publico_es_opcional_y_va_y_vuelve(client, admin):
    """El hablador del porta-precios: muestra precio sólo si alguien lo cargó.
    Sin cargar, la ficha lo trae en null y el hablador va sin cifra."""
    prov = _proveedor(client, admin)
    arte = _subir(client, admin, prov, forma="vaso", alto_mm="90").json()["id"]
    assert client.get("/api/catalogo/", headers=admin).json()[0]["ficha"]["precio_publico"] is None
    r = client.put(f"/api/catalogo/{arte}/ficha", json={**FICHA_VASO, "precio_publico": 4900}, headers=admin)
    assert r.status_code == 200, r.text
    assert r.json()["ficha"]["precio_publico"] == 4900
    assert client.get("/api/catalogo/", headers=admin).json()[0]["ficha"]["precio_publico"] == 4900
    # Borrarlo es mandarlo vacío: vuelve a null, no a cero.
    r = client.put(f"/api/catalogo/{arte}/ficha", json=FICHA_VASO, headers=admin)
    assert r.json()["ficha"]["precio_publico"] is None
    # En el alta, en el mismo formulario.
    r = _subir(client, admin, prov, nombre="Otro", forma="caja", alto_mm="200", precio_publico="12500")
    assert r.status_code == 201, r.text
    assert r.json()["ficha"]["precio_publico"] == 12500


def test_el_precio_tiene_topes(client, admin):
    prov = _proveedor(client, admin)
    arte = _subir(client, admin, prov).json()["id"]
    for malo in (0, 20_000_000, -100):
        r = client.put(f"/api/catalogo/{arte}/ficha", json={**FICHA_VASO, "precio_publico": malo}, headers=admin)
        assert r.status_code == 422, (malo, r.text)
        r = _subir(client, admin, prov, nombre="Malo", precio_publico=str(malo))
        assert r.status_code == 422, (malo, r.text)
    assert _fichas_en_la_base() == 0


def test_borrar_el_arte_borra_su_ficha(client, admin):
    prov = _proveedor(client, admin)
    arte = _subir(client, admin, prov, forma="caja", alto_mm="270").json()["id"]
    assert _fichas_en_la_base(arte) == 1
    assert client.delete(f"/api/catalogo/{arte}", headers=admin).status_code == 204
    assert _fichas_en_la_base(arte) == 0


def test_un_proveedor_con_artes_no_se_borra_con_un_500(client, admin):
    """``DELETE /api/suppliers/{id}`` con artes en el catálogo: en Postgres la
    clave foránea (proveedor → artes → fichas) lo rechazaba con un 500, y en
    SQLite —que no la hace cumplir— dejaba artes y fichas huérfanas. Ahora un
    409 que se entiende, y no se toca nada."""
    from app.database import SessionLocal
    from app.models.models import Supplier, SupplierAsset

    prov = _proveedor(client, admin)
    arte = _subir(client, admin, prov, forma="caja", alto_mm="270").json()["id"]
    r = client.delete(f"/api/suppliers/{prov}", headers=admin)
    assert r.status_code == 409, r.text
    assert "catálogo" in r.json()["detail"]
    db = SessionLocal()
    try:
        assert db.query(Supplier).filter(Supplier.id == prov).count() == 1
        assert db.query(SupplierAsset).filter(SupplierAsset.supplier_id == prov).count() == 1
    finally:
        db.close()
    assert _fichas_en_la_base(arte) == 1

    # Borradas sus artes, el proveedor se borra.
    assert client.delete(f"/api/catalogo/{arte}", headers=admin).status_code == 204
    assert client.delete(f"/api/suppliers/{prov}", headers=admin).status_code == 204
    # Y uno sin nada, también.
    otro = _proveedor(client, admin, "Nutresa")
    assert client.delete(f"/api/suppliers/{otro}", headers=admin).status_code == 204



# ─── El catálogo por NOMBRE del proveedor (visor 3D de Vender) ───────────────
#
# Vender conoce el nombre que la dueña tecleó en el contrato, no el id, y la
# pantalla la mira un proveedor: no puede bajar la lista de proveedores ni el
# catálogo entero para buscarlo. `?proveedor=` lo resuelve en el servidor con
# la MISMA regla que usa «Guardar contrato» (`bulk_leases.confirmar`): sin
# espacios de más, sin mayúsculas, y si hay dos, gana el más viejo.

def _por_nombre(client, headers, nombre):
    r = client.get("/api/catalogo/", params={"proveedor": nombre}, headers=headers)
    assert r.status_code == 200, r.text
    return r.json()


def _subir_por_nombre(client, headers, proveedor, nombre="Yogurt Griego 150g",
                      archivo=("yogurt.jpg", JPG, "image/jpeg"), **extra):
    return client.post(
        "/api/catalogo/",
        data={"proveedor": proveedor, "nombre": nombre, **extra},
        files={"file": archivo},
        headers=headers,
    )


def _cuantos_proveedores():
    from app.database import SessionLocal
    from app.models.models import Supplier

    db = SessionLocal()
    try:
        return db.query(Supplier).count()
    finally:
        db.close()


def _proveedores_llamados(nombre):
    from app.database import SessionLocal
    from app.models.models import Supplier

    db = SessionLocal()
    try:
        return [s for s in db.query(Supplier).all() if (s.name or "").strip().lower() == nombre.lower()]
    finally:
        db.close()


def test_por_nombre_trae_solo_los_de_ese_proveedor(client, admin):
    alpina = _proveedor(client, admin, "Alpina")
    nutresa = _proveedor(client, admin, "Nutresa")
    _subir(client, admin, alpina, nombre="Yogurt")
    _subir(client, admin, alpina, nombre="Avena")
    _subir(client, admin, nutresa, nombre="Galletas")
    for pedido in ("alpina", " ALPINA ", "Alpina"):
        lista = _por_nombre(client, admin, pedido)
        assert sorted(a["nombre"] for a in lista) == ["Avena", "Yogurt"], pedido
        assert {a["supplier_id"] for a in lista} == {alpina}


def test_por_nombre_baja_tambien_lo_que_no_es_ascii(client, admin):
    """El `lower()` de SQLite sólo baja ASCII: con `func.lower`, «POSTOBÓN» no
    encontraba a «Postobón». El cotejo va en Python."""
    postobon = _proveedor(client, admin, "Postobón")
    _subir(client, admin, postobon, nombre="Manzana 2 L")
    lista = _por_nombre(client, admin, "POSTOBÓN")
    assert [a["nombre"] for a in lista] == ["Manzana 2 L"]
    assert lista[0]["supplier_id"] == postobon
    # Y al revés, que es donde SQL falla: guardado con la Ó mayúscula.
    nevera = _proveedor(client, admin, "NEVERAS DEL ÑUÑOA")
    _subir(client, admin, nevera, nombre="Cubeta")
    assert [a["supplier_id"] for a in _por_nombre(client, admin, "neveras del ñuñoa")] == [nevera]


def test_por_nombre_vacio_o_desconocido_no_trae_nada_nunca_todo(client, admin):
    """Con el parámetro presente la respuesta es la de ESE proveedor o nada.
    El catálogo entero es la lista de clientes de la tienda."""
    prov = _proveedor(client, admin, "Alpina")
    _subir(client, admin, prov)
    assert _por_nombre(client, admin, "Colanta") == []
    assert _por_nombre(client, admin, "") == []
    assert _por_nombre(client, admin, "   ") == []
    # Literal en la URL, sin pasar por `params`: `?proveedor=` a secas.
    r = client.get("/api/catalogo/?proveedor=", headers=admin)
    assert r.status_code == 200 and r.json() == []


def test_por_nombre_con_dos_que_solo_difieren_en_mayusculas_gana_el_mas_viejo(client, admin):
    """La regla de `bulk_leases`: el contrato con «bic» se escribe al más
    viejo, así que el visor muestra los productos de ése y no los del otro."""
    viejo = _proveedor(client, admin, "BIC")
    nuevo = _proveedor(client, admin, "Bic")
    assert viejo != nuevo
    _subir(client, admin, viejo, nombre="Bolígrafo")
    _subir(client, admin, nuevo, nombre="Encendedor")
    lista = _por_nombre(client, admin, "bic")
    assert [a["nombre"] for a in lista] == ["Bolígrafo"]


def test_por_nombre_un_proveedor_sin_artes_da_lista_vacia(client, admin):
    _proveedor(client, admin, "Colanta")
    otro = _proveedor(client, admin, "Alpina")
    _subir(client, admin, otro)
    assert _por_nombre(client, admin, "Colanta") == []


def test_sin_el_parametro_el_catalogo_sigue_igual(client, admin):
    """El Editor 3D lo sigue pidiendo entero (la pantalla de la dueña)."""
    a = _proveedor(client, admin, "Alpina")
    b = _proveedor(client, admin, "Nutresa")
    _subir(client, admin, a, nombre="Yogurt")
    _subir(client, admin, b, nombre="Galletas")
    lista = client.get("/api/catalogo/", headers=admin).json()
    assert {x["nombre"] for x in lista} >= {"Yogurt", "Galletas"}
    solo_b = client.get("/api/catalogo/", params={"supplier_id": b}, headers=admin).json()
    assert [x["nombre"] for x in solo_b] == ["Galletas"]


def test_alta_por_nombre_reusa_al_que_ya_existe(client, admin):
    prov = _proveedor(client, admin, "Alpina")
    antes = _cuantos_proveedores()
    r = _subir_por_nombre(client, admin, "  ALPINA ", forma="vaso", alto_mm="90")
    assert r.status_code == 201, r.text
    assert r.json()["supplier_id"] == prov
    assert r.json()["proveedor"] == "Alpina"
    assert _cuantos_proveedores() == antes


def test_alta_por_nombre_crea_uno_nuevo_y_despues_lo_reusa(client, admin):
    antes = _cuantos_proveedores()
    r = _subir_por_nombre(client, admin, "  Lácteos del Valle  ", forma="caja", alto_mm="200")
    assert r.status_code == 201, r.text
    assert r.json()["proveedor"] == "Lácteos del Valle"   # recortado
    assert _cuantos_proveedores() == antes + 1
    r2 = _subir_por_nombre(client, admin, "LÁCTEOS DEL VALLE", nombre="Otro", forma="caja", alto_mm="200")
    assert r2.status_code == 201, r2.text
    assert r2.json()["supplier_id"] == r.json()["supplier_id"]
    assert _cuantos_proveedores() == antes + 1


def test_alta_por_nombre_la_hace_sola_la_administracion(client, admin, worker):
    antes = _cuantos_proveedores()
    assert _subir_por_nombre(client, worker, "Alpina").status_code == 403
    assert _cuantos_proveedores() == antes


def test_alta_sin_proveedor_ni_id_es_un_422(client, admin):
    r = client.post("/api/catalogo/", data={"nombre": "x"},
                    files={"file": ("x.jpg", JPG, "image/jpeg")}, headers=admin)
    assert r.status_code == 422
    assert _subir_por_nombre(client, admin, "   ").status_code == 422


def test_alta_por_nombre_que_falla_no_deja_un_proveedor_suelto(client, admin):
    """Todo se valida ANTES de crear al proveedor, y el proveedor nuevo entra
    en el mismo commit que el arte: un alta rechazada no deja nada."""
    antes = _cuantos_proveedores()
    # No es una imagen.
    r = _subir_por_nombre(client, admin, "Proveedor Nuevo SA", archivo=("x.svg", SVG, "image/svg+xml"))
    assert r.status_code == 422
    # La ficha no se entiende.
    r = _subir_por_nombre(client, admin, "Proveedor Nuevo SA", forma="pelota")
    assert r.status_code == 422
    r = _subir_por_nombre(client, admin, "Proveedor Nuevo SA", alto_mm="3")
    assert r.status_code == 422
    # Sin nombre de producto, y vacío.
    assert _subir_por_nombre(client, admin, "Proveedor Nuevo SA", nombre="  ").status_code == 422
    assert _subir_por_nombre(client, admin, "Proveedor Nuevo SA", archivo=("x.jpg", b"", "image/jpeg")).status_code == 422
    assert _cuantos_proveedores() == antes
    assert _proveedores_llamados("Proveedor Nuevo SA") == []


def test_alta_con_supplier_id_no_cambio(client, admin):
    prov = _proveedor(client, admin, "Alpina")
    r = _subir(client, admin, prov)
    assert r.status_code == 201 and r.json()["supplier_id"] == prov
    assert _subir(client, admin, 999_999).status_code == 404


def test_alta_por_nombre_y_despues_el_contrato_no_crea_otro_proveedor(client, admin):
    """Cruzada: el visor da de alta «alpina s.a.» al subir un producto, y al
    guardar el contrato con «Alpina S.A.» la tanda lo encuentra. Un proveedor
    por empresa, con el historial entero."""
    from datetime import timedelta

    from app.fechas import hoy as hoy_en_colombia

    plano = [{
        "id": "v1", "code": "PUN-09", "sede": "NAVE", "type": "punta",
        "label": "Punta Góndola", "cx": 3, "cz": 8, "rotY": 0,
        "w": 0.9, "d": 0.4, "h": 1.8, "color": "#6366f1", "status": "free",
        "supplierName": "", "brandCategory": "", "negotiatedValue": 0,
        "startDate": "", "endDate": "", "observation": "",
    }]
    r = client.put("/api/layout/NAVE", json={"fixtures": plano, "base_updated_at": None}, headers=admin)
    assert r.status_code == 200, r.text

    subida = _subir_por_nombre(client, admin, "alpina s.a.", forma="vaso", alto_mm="90")
    assert subida.status_code == 201, subida.text
    sid = subida.json()["supplier_id"]
    antes = _cuantos_proveedores()

    hoy = hoy_en_colombia()
    fila = {
        "fila": 1, "espacio": "PUN-09", "sede": "NAVE", "proveedor": "Alpina S.A.",
        "valor": 1_000_000,
        "desde": (hoy + timedelta(days=5)).isoformat(),
        "hasta": (hoy + timedelta(days=35)).isoformat(),
    }
    r = client.post("/api/leases/bulk/confirmar", json={"sede": "NAVE", "filas": [fila]}, headers=admin)
    assert r.status_code == 200, r.text
    assert r.json()["creados"] == 1
    assert _cuantos_proveedores() == antes
    assert [s.id for s in _proveedores_llamados("alpina s.a.")] == [sid]
    # Y el visor, con el nombre como quedó en el contrato, ve el producto.
    assert [a["supplier_id"] for a in _por_nombre(client, admin, "Alpina S.A.")] == [sid]
