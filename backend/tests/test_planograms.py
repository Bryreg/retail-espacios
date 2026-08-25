"""La planometría: de quién es, quién la ve y por qué no vive en el mueble.

El caso que motiva el archivo es el tercero. Guardada en el mueble habría un
solo casillero: al entrar el proveedor siguiente se pierde la planometría del
anterior, y con ella la única prueba de qué se acordó armar. Colgada del
contrato, cada acuerdo lleva la suya y el histórico queda.
"""

from datetime import date, timedelta

# Un JPEG mínimo de verdad: SOI + APP0 + EOI.
JPG = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00\xff\xd9"
PDF = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n"

HOY = date.today()


def _espacio(client, admin, code="NAVE-PUN-04"):
    r = client.post(
        "/api/spaces/find-or-create",
        json={"code": code, "name": "Punta", "zone": "punta", "sede": "NAVE", "area_m2": 1.0},
        headers=admin,
    )
    assert r.status_code == 200, r.text
    return r.json()["id"]


def _proveedor(client, admin, name="Alpina"):
    r = client.post("/api/suppliers/find-or-create", json={"name": name}, headers=admin)
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


def _contrato(client, admin, space_id, supplier_id, desde=None, hasta=None):
    r = client.post(
        f"/api/spaces/{space_id}/leases",
        json={
            "supplier_id": supplier_id,
            "start_date": (desde or HOY - timedelta(days=1)).isoformat(),
            "end_date": (hasta or HOY + timedelta(days=20)).isoformat(),
            "monthly_rent": 1_800_000,
        },
        headers=admin,
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _subir(client, headers, lease_id, archivo=("plano.jpg", JPG, "image/jpeg"), **extra):
    return client.post(
        f"/api/leases/{lease_id}/planometria",
        files={"file": archivo},
        data=extra,
        headers=headers,
    )


def _armado(client, admin):
    space_id = _espacio(client, admin)
    lease_id = _contrato(client, admin, space_id, _proveedor(client, admin))
    return space_id, lease_id


# ─── Lo básico ────────────────────────────────────────────────────────────────

def test_admin_carga_y_lee_la_planometria(client, admin):
    _, lease_id = _armado(client, admin)

    r = _subir(client, admin, lease_id, subido_por="Camilo")
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["lease_id"] == lease_id
    assert body["content_type"] == "image/jpeg"
    assert body["size"] == len(JPG)
    assert body["subido_por"] == "Camilo"

    r = client.get(f"/api/leases/{lease_id}/planometria", headers=admin)
    assert r.status_code == 200
    assert r.json()["id"] == body["id"]

    r = client.get(f"/api/planometrias/{body['id']}", headers=admin)
    assert r.status_code == 200
    assert r.content == JPG
    assert r.headers["content-type"].startswith("image/jpeg")
    # Inline y no attachment: se mira, no se baja.
    assert "inline" in r.headers["content-disposition"]


def test_el_pdf_del_proveedor_tambien_entra(client, admin):
    """La mitad de los proveedores manda la exhibición en PDF, no en foto."""
    _, lease_id = _armado(client, admin)
    r = _subir(client, admin, lease_id, archivo=("exhibicion.pdf", PDF, "application/pdf"))
    assert r.status_code == 201, r.text
    assert r.json()["content_type"] == "application/pdf"


def test_un_contrato_sin_planometria_da_404(client, admin):
    _, lease_id = _armado(client, admin)
    assert client.get(f"/api/leases/{lease_id}/planometria", headers=admin).status_code == 404


# ─── Por qué cuelga del contrato ─────────────────────────────────────────────

def test_cada_contrato_del_mismo_espacio_guarda_la_suya(client, admin):
    """El punto entero del diseño.

    El mismo mueble, dos temporadas, dos proveedores: las dos planometrías
    tienen que sobrevivir. Guardado en el mueble, la segunda pisaba a la
    primera y el reclamo de la primera se quedaba sin prueba.
    """
    space_id = _espacio(client, admin)
    uno = _contrato(client, admin, space_id, _proveedor(client, admin, "Alpina"),
                    desde=HOY - timedelta(days=60), hasta=HOY - timedelta(days=31))
    dos = _contrato(client, admin, space_id, _proveedor(client, admin, "Nutresa"),
                    desde=HOY - timedelta(days=1), hasta=HOY + timedelta(days=20))

    assert _subir(client, admin, uno, archivo=("alpina.jpg", JPG, "image/jpeg")).status_code == 201
    assert _subir(client, admin, dos, archivo=("nutresa.pdf", PDF, "application/pdf")).status_code == 201

    a = client.get(f"/api/leases/{uno}/planometria", headers=admin).json()
    b = client.get(f"/api/leases/{dos}/planometria", headers=admin).json()
    assert a["id"] != b["id"]
    assert a["filename"] == "alpina.jpg"
    assert b["filename"] == "nutresa.pdf"


def test_volver_a_cargar_reemplaza(client, admin):
    """Una por contrato: dos verdades sobre cómo debe quedar el mismo mueble es
    justo lo que este archivo existe para evitar."""
    _, lease_id = _armado(client, admin)
    primera = _subir(client, admin, lease_id, archivo=("v1.jpg", JPG, "image/jpeg")).json()
    segunda = _subir(client, admin, lease_id, archivo=("v2.png", JPG, "image/png")).json()

    assert client.get(f"/api/leases/{lease_id}/planometria", headers=admin).json()["id"] == segunda["id"]
    assert client.get(f"/api/planometrias/{primera['id']}", headers=admin).status_code == 404


# ─── El camino del mercaderista ──────────────────────────────────────────────

def test_el_mercaderista_la_encuentra_por_el_codigo_del_espacio(client, admin, worker):
    """El enlace del correo de montaje trae el código, no el id del contrato."""
    _, lease_id = _armado(client, admin)
    _subir(client, admin, lease_id)

    r = client.get("/api/planometrias/por-espacio/NAVE-PUN-04", headers=worker)
    assert r.status_code == 200, r.text
    assert r.json()["lease_id"] == lease_id
    # Y puede abrir el archivo.
    assert client.get(f"/api/planometrias/{r.json()['id']}", headers=worker).status_code == 200


def test_por_espacio_responde_por_el_contrato_que_corre_hoy(client, admin, worker):
    """No por la bandera `is_active`, que se queda en True desde que se crea:
    uno firmado hoy para diciembre respondería acá durante cuatro meses."""
    space_id = _espacio(client, admin)
    viejo = _contrato(client, admin, space_id, _proveedor(client, admin, "Alpina"),
                      desde=HOY - timedelta(days=60), hasta=HOY - timedelta(days=31))
    hoy = _contrato(client, admin, space_id, _proveedor(client, admin, "Nutresa"),
                    desde=HOY - timedelta(days=2), hasta=HOY + timedelta(days=10))
    _subir(client, admin, viejo, archivo=("viejo.jpg", JPG, "image/jpeg"))
    _subir(client, admin, hoy, archivo=("hoy.jpg", JPG, "image/jpeg"))

    r = client.get("/api/planometrias/por-espacio/NAVE-PUN-04", headers=worker)
    assert r.status_code == 200
    assert r.json()["lease_id"] == hoy
    assert r.json()["filename"] == "hoy.jpg"


def test_un_contrato_futuro_ya_muestra_su_planometria(client, admin, worker):
    """Vendido en agosto para septiembre: la planometría se mira JUSTO ahí.

    Responder sólo por el contrato que corre hoy dejaba sin nada al recién
    vendido, que es cuando más se consulta —para preparar el montaje y para
    revisar qué fue lo que se acordó armar—.
    """
    space_id = _espacio(client, admin)
    futuro = _contrato(client, admin, space_id, _proveedor(client, admin),
                       desde=HOY + timedelta(days=30), hasta=HOY + timedelta(days=60))
    _subir(client, admin, futuro, archivo=("septiembre.jpg", JPG, "image/jpeg"))

    r = client.get("/api/planometrias/por-espacio/NAVE-PUN-04", headers=worker)
    assert r.status_code == 200, r.text
    assert r.json()["lease_id"] == futuro


def test_el_que_corre_hoy_le_gana_al_proximo(client, admin, worker):
    space_id = _espacio(client, admin)
    hoy = _contrato(client, admin, space_id, _proveedor(client, admin, "Alpina"),
                    desde=HOY - timedelta(days=2), hasta=HOY + timedelta(days=5))
    futuro = _contrato(client, admin, space_id, _proveedor(client, admin, "Nutresa"),
                       desde=HOY + timedelta(days=30), hasta=HOY + timedelta(days=60))
    _subir(client, admin, hoy, archivo=("hoy.jpg", JPG, "image/jpeg"))
    _subir(client, admin, futuro, archivo=("despues.jpg", JPG, "image/jpeg"))

    r = client.get("/api/planometrias/por-espacio/NAVE-PUN-04", headers=worker)
    assert r.status_code == 200
    assert r.json()["lease_id"] == hoy


def test_un_contrato_vencido_no_responde(client, admin, worker):
    """«Así debe quedar» de algo que ya se desmontó no es una respuesta."""
    space_id = _espacio(client, admin)
    viejo = _contrato(client, admin, space_id, _proveedor(client, admin),
                      desde=HOY - timedelta(days=60), hasta=HOY - timedelta(days=31))
    _subir(client, admin, viejo)
    assert client.get("/api/planometrias/por-espacio/NAVE-PUN-04", headers=worker).status_code == 404


def test_el_codigo_no_distingue_mayusculas_ni_espacios(client, admin, worker):
    _, lease_id = _armado(client, admin)
    _subir(client, admin, lease_id)
    assert client.get("/api/planometrias/por-espacio/ nave-pun-04 ", headers=worker).status_code == 200


# ─── Permisos y validación ───────────────────────────────────────────────────

def test_el_mercaderista_no_carga_ni_borra(client, admin, worker):
    _, lease_id = _armado(client, admin)
    assert _subir(client, worker, lease_id).status_code == 403
    _subir(client, admin, lease_id)
    assert client.delete(f"/api/leases/{lease_id}/planometria", headers=worker).status_code == 403


def test_sin_sesion_no_se_ve(client, admin):
    _, lease_id = _armado(client, admin)
    subida = _subir(client, admin, lease_id).json()
    assert client.get(f"/api/leases/{lease_id}/planometria").status_code == 401
    assert client.get(f"/api/planometrias/{subida['id']}").status_code == 401


def test_un_svg_no_pasa(client, admin):
    """Un SVG es una imagen para el navegador y un documento con scripts para
    todo lo demás, y esto se sirve inline desde el mismo origen que la app. El
    filtro compara contra una lista cerrada, nunca contra "image/*"."""
    _, lease_id = _armado(client, admin)
    svg = b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
    r = _subir(client, admin, lease_id, archivo=("x.svg", svg, "image/svg+xml"))
    assert r.status_code == 400
    # Y tampoco colándolo con otra extensión pero declarando el tipo.
    r = _subir(client, admin, lease_id, archivo=("x", svg, "image/svg+xml"))
    assert r.status_code == 400


def test_un_archivo_vacio_no_pasa(client, admin):
    _, lease_id = _armado(client, admin)
    assert _subir(client, admin, lease_id, archivo=("v.jpg", b"", "image/jpeg")).status_code == 400


def test_un_contrato_que_no_existe_da_404(client, admin):
    assert _subir(client, admin, 99999).status_code == 404


def test_borrar_la_saca(client, admin):
    _, lease_id = _armado(client, admin)
    subida = _subir(client, admin, lease_id).json()
    assert client.delete(f"/api/leases/{lease_id}/planometria", headers=admin).status_code == 204
    assert client.get(f"/api/leases/{lease_id}/planometria", headers=admin).status_code == 404
    assert client.get(f"/api/planometrias/{subida['id']}", headers=admin).status_code == 404
    # Borrar dos veces avisa en vez de quedarse callado.
    assert client.delete(f"/api/leases/{lease_id}/planometria", headers=admin).status_code == 404
