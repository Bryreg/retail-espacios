"""El enlace firmado de la mercaderista: entra sin contraseña y ve un espacio.

El caso que motiva el archivo es el primero de todos, y es el que hay que
romper para que esto valga: **un token de montaje no abre nada más**. La
tentación al agregar un rol es dejarlo pasar por la puerta general y filtrar
después endpoint por endpoint; con eso, el que alguien agregue mañana nace
abierto. Acá se barre la API entera con el token y se exige 401 en todo lo que
no sea ``/api/montaje``.
"""

from datetime import date, timedelta

JPG = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00\xff\xd9"
HOY = date.today()

#: Dos muebles, uno alquilado y otro no. El segundo existe para comprobar que
#: viaja como geometría y nada más: es el vecino que el plano necesita dibujar.
FIXTURES = [
    {
        "id": "f1", "code": "PUN-04", "sede": "NAVE", "type": "punta",
        "label": "Punta de góndola", "nomenclatura": "P4", "cx": 3, "cz": 8,
        "rotY": 0, "w": 1.2, "d": 0.9, "h": 1.8, "color": "#6366f1",
        "status": "occupied", "supplierName": "Alpina", "brandCategory": "Yogurt",
        "negotiatedValue": 1_800_000, "startDate": "2026-01-01", "endDate": "2026-12-31",
        "observation": "el proveedor pidió doble frente",
    },
    {
        "id": "f2", "code": "GON-09", "sede": "NAVE", "type": "gondola",
        "label": "Góndola 9", "cx": 9, "cz": 8, "rotY": 0,
        "w": 0.9, "d": 4.0, "h": 1.8, "color": "#94a3b8",
        "status": "occupied", "supplierName": "Nutresa", "brandCategory": "Café",
        "negotiatedValue": 2_400_000, "startDate": "2026-02-01", "endDate": "2026-11-30",
        "observation": "",
    },
    {
        "id": "f3", "code": "CAJ-01", "sede": "NAVE", "type": "checkout",
        "label": "Cajas", "cx": 3, "cz": 1, "rotY": 0,
        "w": 6.0, "d": 1.2, "h": 1.2, "color": "#cbd5e1", "rentable": False,
    },
]


def _mount_token(code="NAVE-PUN-04", days=30):
    from app.auth import create_mount_token
    return create_mount_token(code, days=days)


def _cab(token):
    return {"Authorization": f"Bearer {token}"}


def _plano(client, admin, sede="NAVE", fixtures=None):
    r = client.put(
        f"/api/layout/{sede}",
        json={"fixtures": fixtures if fixtures is not None else FIXTURES, "base_updated_at": None},
        headers=admin,
    )
    assert r.status_code == 200, r.text


def _espacio(client, admin, code="NAVE-PUN-04", name="Punta"):
    r = client.post(
        "/api/spaces/find-or-create",
        json={"code": code, "name": name, "zone": "punta", "sede": "NAVE", "area_m2": 1.0},
        headers=admin,
    )
    assert r.status_code == 200, r.text
    return r.json()["id"]


def _proveedor(client, admin, name="Alpina"):
    r = client.post("/api/suppliers/find-or-create", json={"name": name}, headers=admin)
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


def _contrato(client, admin, space_id, supplier_id, marca="Yogurt", desde=None, hasta=None):
    r = client.post(
        f"/api/spaces/{space_id}/leases",
        json={
            "supplier_id": supplier_id,
            "marca": marca,
            "start_date": (desde or HOY - timedelta(days=1)).isoformat(),
            "end_date": (hasta or HOY + timedelta(days=20)).isoformat(),
            "monthly_rent": 1_800_000,
        },
        headers=admin,
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _armado(client, admin, code="NAVE-PUN-04", proveedor="Alpina", marca="Yogurt"):
    """Plano, espacio, proveedor y contrato: la situación real del enlace."""
    _plano(client, admin)
    space_id = _espacio(client, admin, code)
    lease_id = _contrato(client, admin, space_id, _proveedor(client, admin, proveedor), marca)
    return space_id, lease_id


# ─── Lo que el token NO abre ──────────────────────────────────────────────────

def test_el_token_de_montaje_no_pasa_por_la_puerta_general(client):
    """``require_auth`` no lo reconoce. Es la regla de la que cuelga todo lo demás."""
    from app.auth import decode_montaje, decode_token

    t = _mount_token()
    assert decode_token(t) is None
    code, vence = decode_montaje(t)
    assert code == "NAVE-PUN-04"
    assert vence is not None


def test_el_token_no_abre_ningun_otro_endpoint(client, admin):
    """Barrido de toda la API: fuera de ``/api/montaje`` no entra a nada.

    Se recorren las rutas de verdad y no una lista escrita a mano: una lista se
    queda vieja en cuanto alguien agrega un endpoint, que es exactamente el
    descuido que este test existe para atrapar.
    """
    from app.main import app

    _armado(client, admin)
    cab = _cab(_mount_token())

    # Valores para los endpoints que llevan parámetros en la ruta. Se les da
    # algo que EXISTE: con un id inventado, un 404 se confundiría con un cierre.
    relleno = {
        "sede": "NAVE", "space_code": "NAVE-PUN-04", "code": "NAVE-PUN-04",
        "space_id": "1", "lease_id": "1", "file_id": "1", "supplier_id": "1",
        "id": "1", "svg_id": "fix-NAVE-PUN-04", "key": "reminder_days",
        "arte_id": "1",
        # Fase 7: `GET /api/plataforma/clientes/{slug}/reporte` fue el primer GET
        # con `{slug}` en la ruta. El cliente de siempre del fixture.
        "slug": "galerias",
    }
    # Lo abierto a propósito, escrito acá para que agregar algo público sea una
    # decisión visible y no un test que se acomoda solo.
    #
    # `/api/auth/clientes` es la lista del selector de la pantalla de ingreso:
    # hay que mostrarla ANTES de que nadie se identifique, así que no puede
    # pedir sesión. Devuelve sólo código y nombre de cada supermercado.
    #
    # `/api/auth/invitacion/{token}` (2026-09-23) es lo que la pantalla de
    # ingreso muestra del enlace del correo ANTES de entrar: el supermercado,
    # el rol, el estado y el correo invitado ENMASCARADO. Pide el token de la
    # invitación (256 bits) en vez de sesión, y cada token inexistente cuenta
    # en el freno de `/oauth` (`test_invitacion_enlace.py`).
    publicas = {"/api/health", "/api/auth/clientes", "/api/auth/invitacion/{token}"}

    # Se enumera por el esquema OpenAPI y no por `app.routes`: desde FastAPI
    # 0.141 / Starlette 1.x `include_router` deja en `app.routes` un
    # `_IncludedRouter` sin `path` ni `methods`, y el barrido por atributos
    # recorría cero rutas (y pasaba en verde sin comprobar nada).
    esquema = app.openapi()
    rutas = sorted(
        (path, set(m.upper() for m in ops.keys()))
        for path, ops in esquema.get("paths", {}).items()
    )
    revisadas = 0
    for path, metodos in rutas:
        if not path.startswith("/api/") or "GET" not in metodos:
            continue
        if path.startswith("/api/montaje") or path in publicas:
            continue
        url = path
        for nombre, valor in relleno.items():
            url = url.replace("{" + nombre + "}", valor)
        assert "{" not in url, f"falta con qué rellenar {url}: quedaría sin barrer"
        r = client.get(url, headers=cab)
        assert r.status_code == 401, f"{url} respondió {r.status_code} a un token de montaje"
        revisadas += 1
    # Si el barrido no probó nada, el test pasa sin haber comprobado nada.
    assert revisadas >= 27, f"sólo se barrieron {revisadas} rutas"


def test_el_token_tampoco_escribe_por_la_puerta_general(client, admin):
    """El reporte de montaje del tablero sigue pidiendo sesión."""
    _armado(client, admin)
    r = client.post(
        "/api/mounts/",
        data={"space_code": "NAVE-PUN-04", "estado": "montado", "sede": "NAVE"},
        files={"foto": ("m.jpg", JPG, "image/jpeg")},
        headers=_cab(_mount_token()),
    )
    assert r.status_code == 401


def test_sin_token_no_se_entra_a_la_pantalla_de_montaje(client):
    assert client.get("/api/montaje/mi-espacio").status_code == 401
    assert client.get("/api/montaje/mi-espacio?token=basura").status_code == 401


def test_un_enlace_vencido_no_sirve(client, admin):
    """El enlace dura lo que dura el trabajo, no para siempre."""
    _armado(client, admin)
    r = client.get("/api/montaje/mi-espacio", headers=_cab(_mount_token(days=-1)))
    assert r.status_code == 401


# ─── Lo que sí ve ─────────────────────────────────────────────────────────────

def test_la_pantalla_llega_completa_en_una_llamada(client, admin):
    _armado(client, admin)
    r = client.get("/api/montaje/mi-espacio", headers=_cab(_mount_token()))
    assert r.status_code == 200, r.text
    b = r.json()
    assert b["code"] == "NAVE-PUN-04"
    assert b["corto"] == "PUN-04"
    assert b["sede"] == "NAVE"
    assert b["fixture_code"] == "PUN-04"
    assert b["label"] == "Punta de góndola"
    assert b["nomenclatura"] == "P4"
    assert b["proveedor"] == "Alpina"
    assert b["marca"] == "Yogurt"
    assert b["desde"] and b["hasta"]
    # La frase de ubicación es la MISMA que ya iba en el correo.
    assert b["donde"] and "cajas" in b["donde"]
    assert b["vence"]
    # El plano necesita a los vecinos para dibujar el contexto.
    assert {v["code"] for v in b["vecinos"]} == {"PUN-04", "GON-09", "CAJ-01"}


def test_los_vecinos_viajan_sin_una_sola_palabra_comercial(client, admin):
    """Es el punto entero del cambio: antes veía el mapa con todo escrito."""
    _armado(client, admin)
    b = client.get("/api/montaje/mi-espacio", headers=_cab(_mount_token())).json()

    prohibidos = {
        "negotiatedValue", "supplierName", "brandCategory",
        "startDate", "endDate", "status", "observation", "faceB", "slots",
    }
    for vecino in b["vecinos"]:
        assert not (prohibidos & set(vecino)), f"{vecino['code']} llegó con {prohibidos & set(vecino)}"
    # Y lo que sí necesita el plano sigue estando.
    for vecino in b["vecinos"]:
        assert {"code", "cx", "cz", "w", "d", "type"} <= set(vecino)


def test_el_proveedor_del_propio_espacio_si_llega_pero_nunca_la_plata(client, admin):
    """Tiene que saber qué exhibición va a armar; el valor no es asunto suyo."""
    _armado(client, admin)
    crudo = client.get("/api/montaje/mi-espacio", headers=_cab(_mount_token())).text
    assert "Alpina" in crudo
    assert "1800000" not in crudo.replace(" ", "")
    assert "negotiatedValue" not in crudo


def test_el_enlace_de_un_espacio_no_abre_el_de_al_lado(client, admin):
    """El código sale del token, no del pedido: cambiarlo en la barra no sirve."""
    _plano(client, admin)
    otro = _espacio(client, admin, "NAVE-GON-09", "Góndola 9")
    _contrato(client, admin, otro, _proveedor(client, admin, "Nutresa"), "Café")
    _armado(client, admin)

    b = client.get(
        "/api/montaje/mi-espacio?code=NAVE-GON-09",
        headers=_cab(_mount_token("NAVE-PUN-04")),
    ).json()
    assert b["code"] == "NAVE-PUN-04"
    assert b["proveedor"] == "Alpina"


def test_un_espacio_sin_contrato_no_rompe_la_pantalla(client, admin):
    """El enlace puede llegar después de que el contrato se canceló."""
    _plano(client, admin)
    r = client.get("/api/montaje/mi-espacio", headers=_cab(_mount_token("NAVE-GON-09")))
    assert r.status_code == 200, r.text
    b = r.json()
    assert b["code"] == "NAVE-GON-09"
    assert b["proveedor"] == ""
    assert b["fixture_code"] == "GON-09"


def test_la_cara_b_es_su_propio_espacio_pero_el_mismo_mueble(client, admin):
    _plano(client, admin)
    b = client.get("/api/montaje/mi-espacio", headers=_cab(_mount_token("NAVE-GON-09-B"))).json()
    assert b["code"] == "NAVE-GON-09-B"
    assert b["corto"] == "GON-09-B"
    # En el plano hay UN mueble con dos caras: es ese el que hay que señalar.
    assert b["fixture_code"] == "GON-09"


def test_un_espacio_borrado_del_plano_todavia_se_puede_reportar(client, admin):
    """El contrato sobrevive a que alguien borre el mueble del plano.

    La exhibición está armada en la tienda igual; lo que falta es el papel, y
    dejar sin reportar es peor que quedarse sin el plano de ubicación.
    """
    _plano(client, admin, fixtures=[])
    _espacio(client, admin, "NAVE-PUN-04")

    r = client.get("/api/montaje/mi-espacio", headers=_cab(_mount_token()))
    assert r.status_code == 200, r.text
    b = r.json()
    assert b["code"] == "NAVE-PUN-04"
    assert b["corto"] == "PUN-04"
    assert b["vecinos"] == []
    assert b["fixture_code"] == ""   # no hay a qué apuntar: el plano se omite
    assert b["donde"] is None

    assert _reportar(client, _mount_token()).status_code == 201


def test_el_admin_puede_mirar_la_misma_pantalla(client, admin):
    """Para poder revisar qué está viendo la mercaderista sin pedirle el celular."""
    _armado(client, admin)
    r = client.get("/api/montaje/mi-espacio?code=NAVE-PUN-04", headers=admin)
    assert r.status_code == 200
    assert r.json()["proveedor"] == "Alpina"
    # Sin código no hay nada que mostrar: el admin no tiene uno en el token.
    assert client.get("/api/montaje/mi-espacio", headers=admin).status_code == 422


# ─── Reportar ─────────────────────────────────────────────────────────────────

def _reportar(client, token, estado="montado", foto=("m.jpg", JPG, "image/jpeg"), **extra):
    return client.post(
        "/api/montaje/reportar",
        data={"estado": estado, **extra},
        files={"foto": foto} if foto else None,
        headers=_cab(token),
    )


def test_reporta_su_espacio_sin_contrasena(client, admin):
    _armado(client, admin)
    r = _reportar(client, _mount_token(), reportado_por="Yenny")
    assert r.status_code == 201, r.text
    b = r.json()
    assert b["space_code"] == "NAVE-PUN-04"
    assert b["sede"] == "NAVE"
    assert b["estado"] == "montado"
    assert b["reportado_por"] == "Yenny"
    assert b["rol"] == "montaje"


def test_el_formulario_no_puede_elegir_otro_espacio(client, admin):
    """Un campo del formulario lo escribe el cliente. El token no."""
    _armado(client, admin)
    r = _reportar(client, _mount_token("NAVE-PUN-04"), space_code="NAVE-GON-09")
    assert r.status_code == 201, r.text
    assert r.json()["space_code"] == "NAVE-PUN-04"


def test_la_foto_sigue_siendo_obligatoria_por_este_camino(client, admin):
    """La regla es una sola: las dos puertas llaman a la misma función."""
    _armado(client, admin)
    assert _reportar(client, _mount_token(), foto=None).status_code == 422
    # Y el "no pude" sigue necesitando motivo, pero no foto.
    assert _reportar(client, _mount_token(), estado="no_montado", foto=None).status_code == 422
    r = _reportar(client, _mount_token(), estado="no_montado", foto=None, motivo="sin_material")
    assert r.status_code == 201, r.text


def test_lo_reportado_vuelve_en_la_pantalla(client, admin):
    """Tocar el enlace dos veces es lo más normal del mundo."""
    _armado(client, admin)
    _reportar(client, _mount_token(), reportado_por="Yenny")
    b = client.get("/api/montaje/mi-espacio", headers=_cab(_mount_token())).json()
    assert b["ultimo"]["estado"] == "montado"
    assert b["ultimo"]["reportado_por"] == "Yenny"
    assert b["ultimo"]["foto_tipo"] == "image/jpeg"


def test_el_reporte_del_enlace_aparece_en_el_tablero(client, admin):
    """Sirve de poco que reporte si el comercial no lo ve."""
    _armado(client, admin)
    _reportar(client, _mount_token())
    lista = client.get("/api/mounts/", headers=admin).json()
    assert [m["space_code"] for m in lista] == ["NAVE-PUN-04"]
    assert lista[0]["rol"] == "montaje"


# ─── La planometría ───────────────────────────────────────────────────────────

def _subir_plano(client, admin, lease_id):
    r = client.post(
        f"/api/leases/{lease_id}/planometria",
        files={"file": ("plano.jpg", JPG, "image/jpeg")},
        headers=admin,
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


def test_abre_la_planometria_de_su_espacio(client, admin):
    _, lease_id = _armado(client, admin)
    _subir_plano(client, admin, lease_id)

    b = client.get("/api/montaje/mi-espacio", headers=_cab(_mount_token())).json()
    assert b["tiene_planometria"] is True
    assert b["planometria_tipo"] == "image/jpeg"

    # Por query param, porque un <img> no manda cabeceras.
    r = client.get(f"/api/montaje/planometria?token={_mount_token()}")
    assert r.status_code == 200
    assert r.content == JPG
    assert r.headers["content-type"] == "image/jpeg"
    assert r.headers["content-disposition"].startswith("inline")


def test_la_planometria_del_vecino_no_se_alcanza(client, admin):
    """El archivo se resuelve DESDE el token: no hay id que cambiar."""
    _plano(client, admin)
    otro = _espacio(client, admin, "NAVE-GON-09", "Góndola 9")
    lease_otro = _contrato(client, admin, otro, _proveedor(client, admin, "Nutresa"), "Café")
    ajeno = _subir_plano(client, admin, lease_otro)

    cab = _cab(_mount_token("NAVE-PUN-04"))
    # Su propio espacio no tiene planometría cargada.
    assert client.get("/api/montaje/planometria", headers=cab).status_code == 404
    # Y el endpoint general, que sí recibe un id, le sigue cerrado.
    assert client.get(f"/api/planometrias/{ajeno}", headers=cab).status_code == 401
    assert client.get(f"/api/planometrias/{ajeno}?token={_mount_token()}").status_code == 401


def test_sin_planometria_lo_dice_y_no_falla(client, admin):
    """No todos los contratos traen una; que falte es normal, no un error."""
    _armado(client, admin)
    b = client.get("/api/montaje/mi-espacio", headers=_cab(_mount_token())).json()
    assert b["tiene_planometria"] is False
    assert b["planometria_tipo"] is None


# ─── El correo ────────────────────────────────────────────────────────────────

def test_el_correo_de_montaje_lleva_el_enlace_firmado(client, admin, monkeypatch):
    """Sin esto no hay entrada sin contraseña: el enlace es la credencial."""
    from urllib.parse import parse_qs, urlparse

    import app.services.mailer as mailer
    from app.auth import decode_montaje

    enviados = []
    monkeypatch.setattr(mailer, "correo_configurado", lambda: True)
    monkeypatch.setattr(
        mailer, "send_mail_to", lambda to, subject, html: enviados.append((to, subject, html))
    )
    client.put(
        "/api/notifications/contacts",
        json={"gerente": [], "by_sede": {"NAVE": {"admin": [], "mercaderista": ["m@x.co"]}}},
        headers=admin,
    )

    _armado(client, admin)

    montaje = [e for e in enviados if e[1].startswith("Montar ")]
    assert montaje, f"no salió el correo de montaje: {[e[1] for e in enviados]}"
    html = montaje[0][2]
    assert "sin contraseña" in html

    inicio = html.index('href="') + 6
    href = html[inicio:html.index('"', inicio)]
    token = parse_qs(urlparse(href).query)["t"][0]
    code, vence = decode_montaje(token)
    assert code == "NAVE-PUN-04"
    assert vence is not None

    # Y el token del correo abre exactamente ese espacio, nada más.
    assert client.get("/api/montaje/mi-espacio", headers=_cab(token)).json()["code"] == "NAVE-PUN-04"
    assert client.get("/api/layout/NAVE", headers=_cab(token)).status_code == 401


def test_el_correo_comercial_no_lleva_ningun_enlace_firmado(client, admin, monkeypatch):
    """El enlace es una credencial: sólo va a quien tiene que montar."""
    import app.services.mailer as mailer

    enviados = []
    monkeypatch.setattr(mailer, "correo_configurado", lambda: True)
    monkeypatch.setattr(
        mailer, "send_mail_to", lambda to, subject, html: enviados.append((to, subject, html))
    )
    client.put(
        "/api/notifications/contacts",
        json={"gerente": ["g@x.co"], "by_sede": {"NAVE": {"admin": ["a@x.co"], "mercaderista": []}}},
        headers=admin,
    )

    _armado(client, admin)

    for to, subject, html in enviados:
        if not subject.startswith("Montar "):
            assert "?montar=" not in html and "&t=" not in html, subject
