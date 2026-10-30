"""El enlace firmado de la mercaderista: entra sin contraseña y ve un espacio.

El caso que motiva el archivo es el primero de todos, y es el que hay que
romper para que esto valga: **un token de montaje no abre nada más**. La
tentación al agregar un rol es dejarlo pasar por la puerta general y filtrar
después endpoint por endpoint; con eso, el que alguien agregue mañana nace
abierto. Acá se barre la API entera con el token y se exige 401 en todo lo que
no sea ``/api/montaje``.
"""

from datetime import timedelta

from app.fechas import hoy as hoy_en_colombia  # el «hoy» del negocio: Colombia
# Los ayudantes de las participaciones (plano, alta, distribuir), para las
# pruebas de la fase 2 de abajo: el mismo escenario, sin copiarlo.
from tests import test_participaciones as tp

JPG = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00\xff\xd9"
HOY = hoy_en_colombia()

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
    # `/api/auth/clientes` —la lista de supermercados del viejo selector de
    # ingreso— salió el 2026-10-02: le contaba a cualquiera quién usa el sistema.
    #
    # `/api/auth/invitacion/{token}` (2026-09-23) es lo que la pantalla de
    # ingreso muestra del enlace del correo ANTES de entrar: el supermercado,
    # el rol, el estado y el correo invitado ENMASCARADO. Pide el token de la
    # invitación (256 bits) en vez de sesión, y cada token inexistente cuenta
    # en el freno de `/oauth` (`test_invitacion_enlace.py`).
    # `/api/health/ready` (auditoría P1-3) es el health check de Render: público
    # como `/api/health`, y no dice nada más que «la base contesta».
    publicas = {"/api/health", "/api/health/ready", "/api/auth/invitacion/{token}"}

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


def test_los_vecinos_llegan_con_su_ficha_y_partes_solo_con_sus_numeros(client, admin):
    """La mercaderista ve el mueble de verdad: los entrepaños, el módulo y las
    puertas que guardó (es geometría). De `partes` pasan sus números
    conocidos, uno por uno: lo que alguien le escriba adentro mañana, no."""
    con_ficha = [
        {**FIXTURES[0], "entrepanos": 4, "modulo": 0.45},
        {**FIXTURES[1], "modelo": "base:gondola-central-200-m100", "entrepanos": 4, "modulo": 1.0},
        FIXTURES[2],
        {
            "id": "f4", "code": "NEV-01", "sede": "NAVE", "type": "nevera_puertas",
            "label": "Nevera de Puertas", "cx": 12, "cz": 2, "rotY": 0,
            "w": 2.07, "d": 0.7, "h": 2.1, "color": "#1e293b",
            "modelo": "base:nevera-3p-frigomaster",
            "partes": {"puertas": 3, "proveedor": "Postobón", "valor": 2_500_000, "cedida": True},
        },
    ]
    _plano(client, admin, fixtures=con_ficha)
    _espacio(client, admin)
    _contrato(client, admin, _espacio(client, admin), _proveedor(client, admin))
    b = client.get("/api/montaje/mi-espacio", headers=_cab(_mount_token())).json()
    vecinos = {v["code"]: v for v in b["vecinos"]}
    assert (vecinos["PUN-04"]["entrepanos"], vecinos["PUN-04"]["modulo"]) == (4, 0.45)
    g = vecinos["GON-09"]
    assert (g["modelo"], g["entrepanos"], g["modulo"]) == ("base:gondola-central-200-m100", 4, 1.0)
    n = vecinos["NEV-01"]
    assert n["partes"] == {"puertas": 3}, f"`partes` llegó con más que sus números: {n['partes']}"
    crudo = client.get("/api/montaje/mi-espacio", headers=_cab(_mount_token())).text
    for fuga in ("Postob", "2500000", "cedida"):
        assert fuga not in crudo.replace(" ", ""), f"«{fuga}» llegó a la mercaderista"
    # Un mueble sin ficha no gana ninguna clave.
    assert not ({"modelo", "entrepanos", "modulo", "partes"} & set(vecinos["CAJ-01"]))


def test_la_ficha_que_no_es_ficha_no_llega_a_la_mercaderista(client, admin):
    """`PUT /layout` recibe el mueble sin tipar. Un `modelo` que es un objeto,
    unos entrepaños que son texto o un módulo con un proveedor adentro no son
    geometría: no salen, igual que `partes` sale sólo con sus números (y que
    `sinDatosComerciales` en el visor de Vender)."""
    colados = [
        {**FIXTURES[0], "modelo": {"proveedor": "Postobón", "valor": 2_500_000},
         "entrepanos": {"negotiatedValue": 1}, "modulo": "Postobón 2.500.000"},
        {**FIXTURES[1], "modelo": "base:gondola-central-200-m100", "entrepanos": True, "modulo": 1.0},
        FIXTURES[2],
    ]
    _plano(client, admin, fixtures=colados)
    _espacio(client, admin)
    _contrato(client, admin, _espacio(client, admin), _proveedor(client, admin))
    r = client.get("/api/montaje/mi-espacio", headers=_cab(_mount_token()))
    vecinos = {v["code"]: v for v in r.json()["vecinos"]}
    assert not ({"modelo", "entrepanos", "modulo"} & set(vecinos["PUN-04"])), vecinos["PUN-04"]
    g = vecinos["GON-09"]
    assert g["modelo"] == "base:gondola-central-200-m100" and g["modulo"] == 1.0
    assert "entrepanos" not in g, "un booleano pasó como entrepaños"
    for fuga in ("Postob", "2500000", "2.500.000", "negotiatedValue"):
        assert fuga not in r.text.replace(" ", ""), f"«{fuga}» llegó a la mercaderista"


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
    """Sin esto no hay entrada sin contraseña: el enlace es la credencial.
    Desde el 2026-10-20 sale al cargar la planometría, por el correo de la
    planilla (``services/montajes_pendientes.py``)."""
    from urllib.parse import parse_qs, unquote, urlparse

    import app.routers.bulk_leases as lotes
    import app.services.mailer as mailer
    from app.auth import decode_montaje

    enviados = []
    monkeypatch.setattr(mailer, "correo_configurado", lambda: True)
    monkeypatch.setattr(lotes, "correo_configurado", lambda: True)
    monkeypatch.setattr(
        mailer, "send_mail_to", lambda to, subject, html: enviados.append((to, subject, html))
    )
    client.put(
        "/api/notifications/contacts",
        json={"gerente": [], "by_sede": {"NAVE": {"admin": [], "mercaderista": ["m@x.co"]}}},
        headers=admin,
    )

    _space_id, lease_id = _armado(client, admin)
    assert not [e for e in enviados if "por montar" in e[1]], "salió el montaje sin planometría"
    _subir_plano(client, admin, lease_id)

    montaje = [e for e in enviados if "por montar" in e[1]]
    assert montaje, f"no salió el correo de montaje: {[e[1] for e in enviados]}"
    html = montaje[0][2]
    assert "sin contraseña" in html

    inicio = html.index('href="') + 6
    href = unquote(html[inicio:html.index('"', inicio)].replace("&amp;", "&"))
    token = parse_qs(urlparse(href).query)["t"][0]
    code, vence = decode_montaje(token)
    assert code == "NAVE-PUN-04"
    assert vence is not None
    from app.auth import contrato_del_montaje
    assert contrato_del_montaje(token) == lease_id, "el enlace no dice qué contrato se monta"

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
        if "por montar" not in subject:
            assert "?montar=" not in html and "&t=" not in html, subject


# ─── El camino de hoy: lo vendido en el mapa o por planilla ───────────────────
#
# Desde el 2026-09-02 todo contrato nuevo sale por `/leases/bulk/confirmar`, y
# hasta el 2026-10-02 su correo de montaje sólo decía «Abrir RECABRA»: quien
# monta sin cuenta propia recibía un aviso con el que no podía hacer nada.

def _vender_por_lote(client, admin, monkeypatch, desde, hasta):
    """Contactos cargados y un contrato de DOS espacios por el camino del mapa,
    con sus planometrías (desde el 2026-10-20 el aviso de montaje sale al
    cargarlas, uno por contrato). Devuelve los correos que salieron:
    [(para, asunto, html)]."""
    import app.routers.bulk_leases as lotes

    enviados = []
    monkeypatch.setattr(lotes, "correo_configurado", lambda: True)
    monkeypatch.setattr(
        lotes, "send_mail_to_bg", lambda to, subject, html: enviados.append((to, subject, html))
    )
    _plano(client, admin, fixtures=[dict(f, status="free", supplierName="", negotiatedValue=0)
                                    for f in FIXTURES])
    assert client.put(
        "/api/notifications/contacts",
        json={"gerente": ["g@x.co"], "by_sede": {"NAVE": {"admin": ["a@x.co"], "mercaderista": ["m@x.co"]}}},
        headers=admin,
    ).status_code == 200
    filas = [
        {"fila": 1, "espacio": "PUN-04", "sede": "NAVE", "proveedor": "Alpina", "correo": "ventas@alpina.co",
         "marca": "Yogurt <b>", "valor": 1_000_000, "desde": desde.isoformat(), "hasta": hasta.isoformat()},
        {"fila": 2, "espacio": "GON-09", "sede": "NAVE", "proveedor": "Alpina", "correo": "ventas@alpina.co",
         "marca": "Yogurt <b>", "valor": 500_000, "desde": desde.isoformat(), "hasta": hasta.isoformat()},
    ]
    r = client.post("/api/leases/bulk/confirmar", json={"sede": "NAVE", "filas": filas}, headers=admin)
    assert r.status_code == 200, r.text
    assert r.json()["creados"] == 2, r.json()
    assert not [1 for _to, subject, _h in enviados if "por montar" in subject], "salió sin planometría"
    for fila in r.json()["filas"]:
        _subir_plano(client, admin, fila["lease_id"])
    return enviados


def _enlaces(html):
    import re
    from urllib.parse import parse_qs, unquote, urlparse

    salida = []
    for href in re.findall(r'href="([^"]+\?montar=[^"]+)"', html):
        q = parse_qs(urlparse(unquote(href.replace("&amp;", "&"))).query)
        salida.append((q["montar"][0], q["t"][0]))
    return salida


def test_el_aviso_de_montaje_del_mapa_trae_un_enlace_por_espacio(client, admin, monkeypatch):
    enviados = _vender_por_lote(client, admin, monkeypatch, HOY, HOY + timedelta(days=60))

    montajes = [(to, html) for to, subject, html in enviados if "por montar" in subject]
    assert len(montajes) == 2 and all(to == ["m@x.co"] for to, _h in montajes)
    montaje = (["m@x.co"], "".join(h for _to, h in montajes))
    enlaces = _enlaces(montaje[1])
    assert sorted(c for c, _t in enlaces) == ["NAVE-GON-09", "NAVE-PUN-04"]
    # Cada enlace abre SU espacio y nada más, sin contraseña.
    for codigo, token in enlaces:
        r = client.get("/api/montaje/mi-espacio", headers=_cab(token))
        assert r.status_code == 200, r.text
        assert r.json()["code"] == codigo
        assert client.get("/api/layout/NAVE", headers=_cab(token)).status_code == 401
    # Lo que tecleó el supermercado va escapado: el correo no ejecuta HTML ajeno.
    assert "Yogurt <b>" not in montaje[1] and "Yogurt &lt;b&gt;" in montaje[1]


def test_el_enlace_es_una_credencial_y_solo_va_a_quien_monta(client, admin, monkeypatch):
    enviados = _vender_por_lote(client, admin, monkeypatch, HOY, HOY + timedelta(days=60))
    otros = [(subject, html) for to, subject, html in enviados if "por montar" not in subject]
    assert otros, "no salió el resumen comercial ni la constancia al proveedor"
    for subject, html in otros:
        assert "?montar=" not in html and "&t=" not in html, subject
    # Y el proveedor sabe de qué supermercado le escriben (no de «la plataforma»).
    (constancia,) = [html for to, subject, html in enviados if to == ["ventas@alpina.co"]]
    assert "Supermercado" in constancia and "Cargados desde una planilla" not in "".join(h for _s, h in otros)


def test_el_enlace_vive_hasta_un_mes_despues_de_que_arranca_el_contrato(client, admin, monkeypatch):
    """Contado desde la firma, el enlace de un contrato vendido para dentro de
    dos meses llegaba muerto al día del montaje."""
    from datetime import datetime, timezone

    from app.auth import decode_montaje

    inicio = HOY + timedelta(days=60)
    enviados = _vender_por_lote(client, admin, monkeypatch, inicio, inicio + timedelta(days=30))
    html = "".join(html for to, subject, html in enviados if "por montar" in subject)
    enlaces = _enlaces(html)
    assert len(enlaces) == 2, html
    for _codigo, token in enlaces:
        _code, vence = decode_montaje(token)
        dias = (vence - datetime.now(timezone.utc)).days
        assert 88 <= dias <= 90, dias


# ─── El enlace dice qué contrato se monta (2026-10-02) ───────────────────────
#
# Sale al vender y vive hasta un mes después de que el contrato arranca, así que
# se abre mientras el espacio todavía es de otro. Sin decir su contrato, la
# pantalla mostraba el que corre hoy —otro proveedor, otra planometría— y un
# «lo monté» quedaba anotado sobre el código, a nombre de ése.

def _relevo(client, admin, colanta_desde=21):
    """Alpina corre hasta dentro de 20 días; Colanta compró a continuación."""
    _plano(client, admin)
    space_id = _espacio(client, admin)
    alpina = _contrato(client, admin, space_id, _proveedor(client, admin, "Alpina"), "Yogurt",
                       desde=HOY - timedelta(days=40), hasta=HOY + timedelta(days=colanta_desde - 1))
    colanta = _contrato(client, admin, space_id, _proveedor(client, admin, "Colanta"), "Leche",
                        desde=HOY + timedelta(days=colanta_desde), hasta=HOY + timedelta(days=90))
    return space_id, alpina, colanta


def _enlace_de(contrato, code="NAVE-PUN-04"):
    from app.auth import create_mount_token
    return create_mount_token(code, days=120, contrato=contrato)


def test_el_enlace_muestra_su_contrato_aunque_el_espacio_todavia_sea_de_otro(client, admin):
    _space_id, alpina, colanta = _relevo(client, admin)
    _subir_plano(client, admin, alpina)

    token = _enlace_de(colanta)
    r = client.get("/api/montaje/mi-espacio", headers=_cab(token))
    assert r.status_code == 200, r.text
    e = r.json()
    assert (e["proveedor"], e["marca"]) == ("Colanta", "Leche")
    assert e["desde"] == (HOY + timedelta(days=21)).isoformat()
    assert e["se_confirma_desde"] == (HOY + timedelta(days=20)).isoformat()
    # La planometría de Alpina no es «así debe quedar» para Colanta.
    assert e["tiene_planometria"] is False
    assert client.get("/api/montaje/planometria", headers=_cab(token)).status_code == 404

    # Un enlace de antes, sin contrato adentro, sigue mostrando el que corre hoy.
    viejo = client.get("/api/montaje/mi-espacio", headers=_cab(_mount_token())).json()
    assert viejo["proveedor"] == "Alpina" and viejo["se_confirma_desde"] is None
    assert viejo["tiene_planometria"] is True


def test_antes_de_la_vispera_no_se_confirma_y_nada_queda_a_nombre_del_otro(client, admin):
    _s, _alpina, colanta = _relevo(client, admin)
    r = _reportar(client, _enlace_de(colanta))
    assert r.status_code == 409, r.text
    assert r.json()["detail"].startswith("Todavía no:")
    assert client.get("/api/mounts/", headers=admin).json() == [], "quedó un reporte sobre el código"


def test_desde_la_vispera_se_confirma_y_el_montado_del_anterior_no_cuenta(client, admin):
    from datetime import datetime, timezone

    from app.database import SessionLocal
    from app.models.models import MountConfirmation

    _s, _alpina, colanta = _relevo(client, admin, colanta_desde=1)
    # Alpina se reportó montada hace un mes, con un enlace de los de antes.
    assert _reportar(client, _mount_token(), reportado_por="Yenny").status_code == 201
    db = SessionLocal()
    try:
        db.query(MountConfirmation).update(
            {MountConfirmation.confirmado_en: datetime.now(timezone.utc) - timedelta(days=30)})
        db.commit()
    finally:
        db.close()

    token = _enlace_de(colanta)
    e = client.get("/api/montaje/mi-espacio", headers=_cab(token)).json()
    assert e["se_confirma_desde"] is None, "la víspera del arranque ya se puede confirmar"
    assert e["ultimo"] is None, "el «montado» de Alpina se le atribuyó a Colanta"

    r = _reportar(client, token, reportado_por="Mario")
    assert r.status_code == 201, r.text
    e = client.get("/api/montaje/mi-espacio", headers=_cab(token)).json()
    assert e["ultimo"]["reportado_por"] == "Mario"


def test_un_contrato_cancelado_deja_el_enlace_sin_nada_que_montar(client, admin):
    space_id, _alpina, colanta = _relevo(client, admin)
    assert client.delete(f"/api/spaces/{space_id}/leases/{colanta}", headers=admin).status_code == 204

    token = _enlace_de(colanta)
    for r in (
        client.get("/api/montaje/mi-espacio", headers=_cab(token)),
        client.get("/api/montaje/planometria", headers=_cab(token)),
        _reportar(client, token),
    ):
        assert r.status_code == 410, r.text
        assert "se canceló" in r.json()["detail"]


def test_el_contrato_del_enlace_tiene_que_ser_de_su_espacio(client, admin):
    """Un enlace con el contrato de OTRO espacio no abre ese contrato: el
    código y el contrato van firmados juntos, pero igual se comprueba."""
    _s, _alpina, colanta = _relevo(client, admin)
    otro = _espacio(client, admin, "NAVE-GON-09", "Góndola")
    ajeno = _contrato(client, admin, otro, _proveedor(client, admin, "Nutresa"), "Café")
    r = client.get("/api/montaje/mi-espacio", headers=_cab(_enlace_de(ajeno)))
    assert r.status_code == 410, r.text


def test_cada_enlace_del_lote_dice_su_contrato(client, admin, monkeypatch):
    from app.auth import contrato_del_montaje
    from app.database import SessionLocal
    from app.models.models import SpaceLease

    enviados = _vender_por_lote(client, admin, monkeypatch, HOY, HOY + timedelta(days=60))
    html = "".join(html for to, subject, html in enviados if "por montar" in subject)
    enlaces = _enlaces(html)
    assert len(enlaces) == 2, html
    db = SessionLocal()
    try:
        for codigo, token in enlaces:
            lease = db.get(SpaceLease, contrato_del_montaje(token))
            assert lease is not None and lease.space.code == codigo, codigo
    finally:
        db.close()


# ─── Fase 2 · el enlace sigue a su contrato aunque el espacio cambie de código ─
#
# El enlace firma el código del día en que se vendió. Una renumeración o un
# renombre de sede le cambian el código a la fila —contrato, fotos y reportes
# siguen pegados por id— y el enlace respondía «Ese contrato se canceló», que era
# falso. Ahora el código sale del contrato, con evidencia de que el del enlace
# era de ESE espacio (`_contrato_mudado`); sin evidencia, el 410 de siempre
# (`test_el_contrato_del_enlace_tiene_que_ser_de_su_espacio`, que no cambia).

@tp.RELOJ
def test_el_enlace_con_contrato_sobrevive_a_una_renumeracion_que_intercambia_los_codigos(client, admin):
    from app.auth import create_mount_token

    # GON-01 queda después de GON-02 en el recorrido: renumerar los intercambia,
    # y las dos se venden por participación, así que el código viejo de cada
    # una pasa a ser de la OTRA (la permutación, el caso difícil).
    gon_02 = {**tp.GON_02, "cx": 2, "partes": {"division": "participacion"}}
    tp._plano(client, admin, [{**tp.GON_01, "cx": 6}, gon_02, tp.PUN_01])
    postobon = tp._alta(client, admin, pb=2500, desde=tp.D(2026, 10, 1), hasta=tp.D(2026, 12, 31))["termino"]
    alpina = tp._alta(client, admin, espacio="GON-02", pb=4000, proveedor="Alpina", marca="Yogurt",
                      desde=tp.D(2026, 10, 1), hasta=tp.D(2026, 12, 31))["termino"]
    assert (postobon["codigo"], alpina["codigo"]) == ("NAVE-GON-01-PC1", "NAVE-GON-02-PC1")
    _subir_plano(client, admin, postobon["lease_id"])

    # Los enlaces salen al vender, con el código de ese día.
    enlace_postobon = create_mount_token("NAVE-GON-01-PC1", days=120, contrato=postobon["lease_id"])
    enlace_alpina = create_mount_token("NAVE-GON-02-PC1", days=120, contrato=alpina["lease_id"])

    r = client.post("/api/layout/renumeracion/aplicar", headers=admin, json={"sedes": ["NAVE"]})
    assert r.status_code == 200, r.text

    # Cada enlace abre SU contrato, con el código de hoy.
    r = client.get("/api/montaje/mi-espacio", headers=_cab(enlace_postobon))
    assert r.status_code == 200, r.text
    e = r.json()
    assert (e["code"], e["corto"], e["fixture_code"]) == ("NAVE-GON-02-PC1", "GON-02-PC1", "GON-02")
    assert (e["proveedor"], e["marca"]) == ("Postobón", "Hit")
    assert e["parte"]["texto"] == "Participación 1 · 25 % de la cara A"
    assert e["tiene_planometria"] is True
    assert client.get("/api/montaje/planometria", headers=_cab(enlace_postobon)).status_code == 200

    e = client.get("/api/montaje/mi-espacio", headers=_cab(enlace_alpina)).json()
    assert (e["code"], e["proveedor"]) == ("NAVE-GON-01-PC1", "Alpina")
    assert e["parte"]["texto"] == "Participación 1 · 40 % de la cara A"
    assert e["tiene_planometria"] is False, "la planometría de Postobón se le mostró a Alpina"

    # El reporte cae en el código de HOY, donde lo busca el tablero, y vuelve
    # en la pantalla del mismo enlace.
    r = _reportar(client, enlace_postobon, reportado_por="Yenny")
    assert r.status_code == 201, r.text
    assert r.json()["space_code"] == "NAVE-GON-02-PC1"
    assert [m["space_code"] for m in client.get("/api/mounts/", headers=admin).json()] == ["NAVE-GON-02-PC1"]
    assert client.get("/api/montaje/mi-espacio", headers=_cab(enlace_postobon)).json()["ultimo"]["reportado_por"] == "Yenny"
    assert client.get("/api/montaje/mi-espacio", headers=_cab(enlace_alpina)).json()["ultimo"] is None, \
        "el reporte de Postobón le quedó a Alpina"

    # Cancelado el contrato, el enlace ya no tiene nada que montar: ni por el
    # código viejo ni siguiendo al contrato.
    r = client.delete(f"/api/spaces/{postobon['space_id']}/leases/{postobon['lease_id']}", headers=admin)
    assert r.status_code == 204, r.text
    for r in (
        client.get("/api/montaje/mi-espacio", headers=_cab(enlace_postobon)),
        client.get("/api/montaje/planometria", headers=_cab(enlace_postobon)),
        _reportar(client, enlace_postobon),
    ):
        assert r.status_code == 410, r.text


def test_el_enlace_con_contrato_sigue_al_espacio_si_su_codigo_viejo_ya_no_es_de_nadie(client, admin):
    """Lo que hace un renombre de sede: todos los códigos cambian de prefijo y
    el viejo queda libre. Se simula escribiendo la fila como la deja el
    renombre (el endpoint es de otro frente): lo que se prueba es el enlace."""
    from app.database import SessionLocal
    from app.models.models import Space

    space_id, lease_id = _armado(client, admin)
    token = _enlace_de(lease_id)
    db = SessionLocal()
    try:
        s = db.get(Space, space_id)
        s.code, s.svg_id, s.sede = "NAVA-PUN-04", "fix-NAVA-PUN-04", "NAVA"
        db.commit()
    finally:
        db.close()

    r = client.get("/api/montaje/mi-espacio", headers=_cab(token))
    assert r.status_code == 200, r.text
    e = r.json()
    assert (e["code"], e["sede"], e["proveedor"]) == ("NAVA-PUN-04", "NAVA", "Alpina")
    r = _reportar(client, token)
    assert r.status_code == 201, r.text
    assert r.json()["space_code"] == "NAVA-PUN-04"

    # Un enlace SIN contrato (los de antes del 2026-10-02) no tiene a quién
    # seguir: el código viejo y nada más, como siempre.
    viejo = client.get("/api/montaje/mi-espacio", headers=_cab(_mount_token())).json()
    assert viejo["code"] == "NAVE-PUN-04" and viejo["proveedor"] == ""

    # Si el código viejo vuelve a ser de alguien (otra fila con ese nombre, sin
    # ese contrato) y ninguna renumeración une los dos, no se adivina: 410.
    _espacio(client, admin, "NAVE-PUN-04", "Punta nueva")
    r = client.get("/api/montaje/mi-espacio", headers=_cab(token))
    assert r.status_code == 410, r.text


# ─── Fase 2 · G1: quien monta una participación ve SU zona, y nada más ───────

def _mi_espacio_pc(client, code, contrato):
    from app.auth import create_mount_token

    token = create_mount_token(code, days=120, contrato=contrato)
    r = client.get("/api/montaje/mi-espacio", headers=_cab(token))
    assert r.status_code == 200, r.text
    return r.json()


@tp.RELOJ
def test_quien_monta_una_participacion_ve_solo_su_zona_y_el_trabajador_ninguna(client, admin, worker):
    import json
    from datetime import date

    from app.database import SessionLocal
    from app.models.models import Space, SpaceLease, SpaceStatus, Supplier
    from app.services.zonas_geometria import limpiar

    tp._plano(client, admin)
    a = tp._alta(client, admin, pb=2500, desde=tp.D(2026, 10, 1), hasta=tp.D(2026, 12, 31))["termino"]
    b = tp._alta(client, admin, pb=3000, proveedor="Colcafé", marca="Sello Rojo", valor=2_345_678,
                 desde=tp.D(2026, 10, 1), hasta=tp.D(2026, 12, 31))["termino"]
    sup = tp._cara(client, admin)["superficie"]
    # Cada una dibuja menos de lo contratado (20 % de 25 % y de 30 %): falta
    # dibujar es un aviso, no frena la confirmación, y no hay exceso posible.
    suya, ajena = tp._franja(sup, 0, 0.2), tp._franja(sup, 0.4, 0.6)
    zonas = tp._zonas((a["space_id"], suya), (b["space_id"], ajena))

    def dibujo():
        return _mi_espacio_pc(client, "NAVE-GON-01-PC1", a["lease_id"])["dibujo"]

    # Sin distribución, y con un borrador sin confirmar: nada (la pantalla de siempre).
    assert dibujo() is None
    tp._distribuir(client, admin, "borrador", "GON-01", 0, zonas)
    assert dibujo() is None, "se dibujó un borrador"

    # Confirmada: su zona, sólo la suya, sobre la cara entera.
    tp._distribuir(client, admin, "confirmar", "GON-01", 1, zonas)
    e = _mi_espacio_pc(client, "NAVE-GON-01-PC1", a["lease_id"])
    d = e["dibujo"]
    assert d is not None
    assert set(d) == {"cara", "superficie", "zonas"}
    assert d["cara"] == "A"
    assert d["zonas"] == [limpiar(suya)], "viajaron formas que no son de esta participación"
    assert set(d["superficie"]) == {"orientacion", "ancho", "alto", "exclusiones"}
    assert (d["superficie"]["orientacion"], d["superficie"]["ancho"], d["superficie"]["alto"]) == \
        (sup["orientacion"], sup["ancho"], sup["alto"])
    assert d["superficie"]["exclusiones"] == sup["exclusiones"]
    assert all(set(x) == {"por", "u0", "u1", "v0", "v1"} for x in d["superficie"]["exclusiones"])
    # El renglón de siempre no cambia (decisión J), y de la otra participación no llega nada.
    assert e["parte"]["texto"] == "Participación 1 · 25 % de la cara A"
    crudo = json.dumps(e, ensure_ascii=False)
    for ajeno in ("Colcafé", "Sello Rojo", "2345678", "1200000", "PC2", "30 %"):
        assert ajeno not in crudo, f"quien monta ve «{ajeno}»"
    assert limpiar(ajena) not in d["zonas"]
    # Y la otra participación ve la suya, no la de Postobón.
    otra = _mi_espacio_pc(client, "NAVE-GON-01-PC2", b["lease_id"])["dibujo"]
    assert otra["zonas"] == [limpiar(ajena)]

    # El admin, con ?code=, ve lo mismo que la mercaderista; el trabajador, nada:
    # con ?code= de cada …-PC<n> armaría la distribución entera de la cara (D7).
    r = client.get("/api/montaje/mi-espacio", params={"code": "NAVE-GON-01-PC1"}, headers=admin)
    assert r.status_code == 200, r.text
    assert r.json()["dibujo"] == d
    r = client.get("/api/montaje/mi-espacio", params={"code": "NAVE-GON-01-PC1"}, headers=worker)
    assert r.status_code == 200, r.text
    assert r.json()["dibujo"] is None, "el trabajador recibe el dibujo de las zonas"

    # Un borrador encima de la confirmada no se dibuja: vale lo confirmado.
    otro_borrador = tp._zonas((a["space_id"], tp._franja(sup, 0.7, 0.9)), (b["space_id"], ajena))
    tp._distribuir(client, admin, "borrador", "GON-01", 2, otro_borrador)
    assert dibujo()["zonas"] == [limpiar(suya)], "se dibujó el borrador en vez de lo confirmado"

    # El mueble cambió de medida: la confirmada queda «para revisar» y no se
    # dibuja lo que ya no es. Vuelve a la medida confirmada: vuelve el dibujo.
    tp._guardar(client, admin, tp._con("GON-01", w=1.25))
    assert dibujo() is None, "se dibujó una distribución para revisar"
    tp._guardar(client, admin, tp.PLANO)
    assert dibujo()["zonas"] == [limpiar(suya)]

    # Un lease de participación hecho a mano, sin término: sin zona que dibujar.
    db = SessionLocal()
    try:
        pc = Space(code="NAVE-GON-01-PC4", svg_id="NAVE-GON-01-PC4", name="x", zone="gondola", sede="NAVE",
                   area_m2=0.0, status=SpaceStatus.free)
        sup_huerfano = Supplier(name="Huérfano SA")
        db.add_all([pc, sup_huerfano])
        db.flush()
        huerfano = SpaceLease(space_id=pc.id, supplier_id=sup_huerfano.id, start_date=date(2026, 12, 1),
                              end_date=date(2026, 12, 31), monthly_rent=1, is_active=True)
        db.add(huerfano)
        db.commit()
        huerfano_id = huerfano.id
    finally:
        db.close()
    e = _mi_espacio_pc(client, "NAVE-GON-01-PC4", huerfano_id)
    assert e["parte"]["texto"] == "Participación 4 de la cara A"
    assert e["dibujo"] is None

    # Una cara entera o una puerta no son participaciones: nunca llevan dibujo.
    r = client.get("/api/montaje/mi-espacio", params={"code": "NAVE-GON-02"}, headers=admin)
    assert r.status_code == 200, r.text
    assert r.json()["dibujo"] is None


@tp.RELOJ
def test_el_enlace_de_un_contrato_de_vender_no_lleva_la_plata_nueva(client, admin):
    """El rediseño de Vender guarda cómo se tecleó el precio y el cobro por
    ventas (docs/rediseno/vender-api.md §3, §5): nada de eso llega a quien
    monta, ni con el enlace del contrato."""
    from app.auth import create_mount_token

    tp._plano(client, admin)
    base = {"sede": "NAVE", "proveedor": "Alpina", "marca": "Yogurt", "desde": "2026-11-01", "hasta": "2026-11-30",
            "tipo": "contrato"}
    fijo = client.post("/api/contratos/vender", headers=admin, json={**base, "lineas": [
        {"espacio": "GON-02", "valor": 2_468_000, "modo_precio": "mensual", "valor_tecleado": 2_468_000}]})
    assert fijo.status_code == 200, fijo.text
    ventas = client.post("/api/contratos/vender", headers=admin, json={
        **base, "cobro": {"modo": "ventas", "porcentaje": 13.7, "corte": "al_final"},
        "lineas": [{"espacio": "NEV-03-PU1", "valor": 0}]})
    assert ventas.status_code == 200, ventas.text
    for r in (fijo.json(), ventas.json()):
        (c,) = r["contratos"]
        token = create_mount_token(c["espacio"], days=60, contrato=c["lease_id"])
        crudo = client.get("/api/montaje/mi-espacio", headers=_cab(token))
        assert crudo.status_code == 200, crudo.text
        for plata in ("2468000", "13.7", "valor_tecleado", "porcentaje", "corte", "ventas"):
            assert plata not in crudo.text, f"quien monta ve «{plata}»"
