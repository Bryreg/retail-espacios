"""El enlace de la invitación, el alta con nombre repetido y quién hace dueños.

Pedido del dueño de la plataforma (2026-09-23), con sus palabras: «¿cuando el
dueño de una sede invite a un administrador por correo va a quedar aperturando
un supermercado nuevo? ¿va a entrar en el supermercado equivocado? Y lo mismo
con los mercaderistas».

Las dos cosas pasaban. El enlace del correo (`/login?invitacion=<token>`) no lo
leía nadie: la invitación se canjeaba sólo si la persona entraba con el MISMO
correo, y quien entraba con otra cuenta recibía «su cuenta no tiene acceso» con
el formulario de fundar un supermercado en el mismo cuadro. Y quien ya tenía
otro supermercado entraba al que el selector mostrara primero.

Mismo andamiaje que ``test_identidad.py``: verificador falso por
``dependency_overrides`` y todo ``import app.*`` adentro de las funciones.
"""
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace


class FakeVerificador:
    def __init__(self, mapa: dict):
        self.mapa = mapa

    def verificar(self, id_token):
        return self.mapa.get(id_token)


def _claims(uid, email, verificado=True, proveedor="google.com", nombre=None):
    return SimpleNamespace(
        uid=uid, email=email, email_verificado=verificado, proveedor=proveedor, nombre=nombre,
    )


def _usar_verificador(client, mapa: dict):
    from app.services.firebase_tokens import get_verificador
    client.app.dependency_overrides[get_verificador] = lambda: FakeVerificador(mapa)


def _cab(token):
    return {"Authorization": f"Bearer {token}"}


def _oauth(client, id_token, invitacion=None, cliente=None, acepta=True):
    body = {"id_token": id_token, "acepta_politica": acepta}
    if invitacion is not None:
        body["invitacion"] = invitacion
    if cliente is not None:
        body["cliente"] = cliente
    return client.post("/api/auth/oauth", json=body)


def _invitar(client, cab, email, rol="worker"):
    r = client.post("/api/usuarios/invitar", json={"email": email, "rol": rol}, headers=cab)
    assert r.status_code == 200, r.text


def _fundar(client, uid, email, slug, nombre):
    _usar_verificador(client, {uid: _claims(uid, email)})
    r = client.post(
        "/api/clientes/alta",
        json={"id_token": uid, "slug": slug, "nombre": nombre, "acepta_politica": True},
    )
    assert r.status_code == 200, r.text
    return _cab(r.json()["token"])


def _token_de_la_invitacion(email, slug="galerias"):
    from app.clientes import sesion_registro
    from app.models.identidad import Invitacion

    reg = sesion_registro()
    try:
        fila = (
            reg.query(Invitacion)
            .filter(Invitacion.email == email, Invitacion.cliente_slug == slug)
            .order_by(Invitacion.id.desc())
            .first()
        )
        return fila.token
    finally:
        reg.close()


def _vencer(token):
    from app.clientes import sesion_registro
    from app.models.identidad import Invitacion

    reg = sesion_registro()
    try:
        fila = reg.query(Invitacion).filter(Invitacion.token == token).first()
        fila.expira_en = datetime.now(timezone.utc) - timedelta(days=1)
        reg.commit()
    finally:
        reg.close()


def _filas(modelo, *condiciones):
    from app.clientes import sesion_registro

    reg = sesion_registro()
    try:
        return reg.query(modelo).filter(*condiciones).all()
    finally:
        reg.close()


# ─── GET /api/auth/invitacion/{token} ─────────────────────────────────────────

def test_el_enlace_dice_a_que_supermercado_y_con_que_cuenta_sin_mostrar_el_correo(client, admin):
    _invitar(client, admin, "brayan.moreno@gmail.com", rol="admin")
    token = _token_de_la_invitacion("brayan.moreno@gmail.com")

    r = client.get(f"/api/auth/invitacion/{token}")
    assert r.status_code == 200, r.text
    cuerpo = r.json()
    assert cuerpo["estado"] == "vigente"
    assert cuerpo["cliente_nombre"] == "Galerías"
    assert cuerpo["rol"] == "admin"
    assert cuerpo["correo"] == "b•••o@gmail.com"
    assert "brayan.moreno" not in r.text, "el correo entero no sale en una pantalla sin sesión"


def test_el_enlace_usado_y_el_vencido_se_dicen_como_son(client, admin):
    _invitar(client, admin, "usada@x.co")
    usada = _token_de_la_invitacion("usada@x.co")
    _usar_verificador(client, {"t": _claims("uid-usada", "usada@x.co")})
    assert _oauth(client, "t").status_code == 200
    assert client.get(f"/api/auth/invitacion/{usada}").json()["estado"] == "usada"

    _invitar(client, admin, "tarde@x.co")
    vieja = _token_de_la_invitacion("tarde@x.co")
    _vencer(vieja)
    assert client.get(f"/api/auth/invitacion/{vieja}").json()["estado"] == "vencida"


def test_un_enlace_inventado_da_404_y_cuenta_en_el_freno(client):
    from app.models.identidad import IntentoOauth

    r = client.get("/api/auth/invitacion/esto-no-existe")
    assert r.status_code == 404
    assert len(_filas(IntentoOauth)) == 1

    for _ in range(12):
        client.get("/api/auth/invitacion/esto-tampoco")
    assert client.get("/api/auth/invitacion/nada").status_code == 429


# ─── POST /api/auth/oauth con `invitacion` ────────────────────────────────────

def test_el_enlace_lleva_a_su_supermercado_aunque_la_cuenta_tenga_otro(client, admin):
    """El caso del dueño de la plataforma: fundó «Pepito» con su cuenta y
    después lo invitaron a Galerías. Por el enlace entra a GALERÍAS, sin
    selector de por medio — y la segunda vez que toca el mismo enlace, también."""
    _fundar(client, "uid-bray", "brayan@gmail.com", "pepito", "Pepito")
    _invitar(client, admin, "brayan@gmail.com", rol="admin")
    token = _token_de_la_invitacion("brayan@gmail.com")

    _usar_verificador(client, {"t": _claims("uid-bray", "brayan@gmail.com")})
    r = _oauth(client, "t", invitacion=token)
    assert r.status_code == 200, r.text
    assert r.json()["cliente"] == "galerias"
    assert r.json()["role"] == "admin"

    otra_vez = _oauth(client, "t", invitacion=token)
    assert otra_vez.status_code == 200, otra_vez.text
    assert otra_vez.json()["cliente"] == "galerias"

    # Sin el enlace, con dos supermercados, se pregunta — como siempre.
    sin_enlace = _oauth(client, "t").json()
    assert sin_enlace.get("requiere_cliente") is True
    assert {m["cliente"] for m in sin_enlace["membresias"]} == {"galerias", "pepito"}


def test_el_enlace_con_otra_cuenta_no_canjea_ni_crea_ni_entra_a_nada(client, admin):
    from app.models.identidad import Invitacion, Membresia, Usuario

    _invitar(client, admin, "trabajo@empresa.co", rol="worker")
    token = _token_de_la_invitacion("trabajo@empresa.co")

    _usar_verificador(client, {"t": _claims("uid-personal", "personal@gmail.com")})
    r = _oauth(client, "t", invitacion=token)
    assert r.status_code == 403, r.text
    detalle = r.json()["detail"]
    assert detalle["codigo"] == "invitacion_otro_correo"
    assert detalle["correo"] == "t•••o@empresa.co"
    assert detalle["cliente_nombre"] == "Galerías"
    assert "trabajo@empresa.co" not in r.text

    assert _filas(Usuario, Usuario.email == "personal@gmail.com") == []
    assert _filas(Membresia) == []
    (inv,) = _filas(Invitacion, Invitacion.token == token)
    assert inv.usada_en is None, "la invitación de otra persona no se gasta"

    # Con la cuenta invitada, el mismo enlace entra.
    _usar_verificador(client, {"t2": _claims("uid-trabajo", "trabajo@empresa.co")})
    r = _oauth(client, "t2", invitacion=token)
    assert r.status_code == 200, r.text
    assert (r.json()["cliente"], r.json()["role"]) == ("galerias", "worker")


def test_con_otra_cuenta_que_ya_tiene_supermercado_tampoco_entra_al_suyo_en_silencio(client, admin):
    """«¿Va a entrar en el supermercado equivocado?»: quien vino por el enlace
    de Galerías con la cuenta de su OTRO supermercado no aterriza en el otro."""
    _fundar(client, "uid-p", "propio@gmail.com", "propio", "Propio")
    _invitar(client, admin, "laboral@empresa.co", rol="admin")
    token = _token_de_la_invitacion("laboral@empresa.co")

    _usar_verificador(client, {"t": _claims("uid-p", "propio@gmail.com")})
    r = _oauth(client, "t", invitacion=token)
    assert r.status_code == 403
    assert r.json()["detail"]["codigo"] == "invitacion_otro_correo"
    assert "token" not in r.json()


def test_el_enlace_vencido_no_canjea_ni_entra_a_otro_lado(client, admin):
    from app.models.identidad import Membresia

    _fundar(client, "uid-v", "vencida@x.co", "suyo", "Suyo")
    _invitar(client, admin, "vencida@x.co", rol="admin")
    token = _token_de_la_invitacion("vencida@x.co")
    _vencer(token)

    _usar_verificador(client, {"t": _claims("uid-v", "vencida@x.co")})
    r = _oauth(client, "t", invitacion=token)
    assert r.status_code == 410, r.text
    assert r.json()["detail"]["codigo"] == "invitacion_vencida"
    assert _filas(Membresia, Membresia.cliente_slug == "galerias") == []


def test_un_enlace_inventado_en_el_login_da_404(client):
    _usar_verificador(client, {"t": _claims("uid-x", "x@x.co")})
    r = _oauth(client, "t", invitacion="inventado")
    assert r.status_code == 404
    assert r.json()["detail"]["codigo"] == "invitacion_invalida"


def test_el_enlace_de_un_acceso_desactivado_lo_dice_y_no_manda_a_otro(client, admin):
    _invitar(client, admin, "baja@x.co", rol="worker")
    token = _token_de_la_invitacion("baja@x.co")
    _usar_verificador(client, {"t": _claims("uid-baja", "baja@x.co")})
    assert _oauth(client, "t", invitacion=token).status_code == 200

    lista = client.get("/api/usuarios", headers=admin).json()["miembros"]
    uid = next(m["id"] for m in lista if m["email"] == "baja@x.co")
    assert client.patch(f"/api/usuarios/{uid}", json={"activo": False}, headers=admin).status_code == 200

    r = _oauth(client, "t", invitacion=token)
    assert r.status_code == 403
    assert r.json()["detail"]["codigo"] == "invitacion_sin_acceso"

    # Con OTRO supermercado propio, tampoco la manda ahí en silencio.
    from app.clientes import crear_cliente
    from app.clientes import sesion_registro
    from app.models.identidad import Membresia

    crear_cliente("otrito", "Otrito")
    reg = sesion_registro()
    try:
        reg.add(Membresia(usuario_id=uid, cliente_slug="otrito", rol="worker", activo=True))
        reg.commit()
    finally:
        reg.close()
    r = _oauth(client, "t", invitacion=token)
    assert r.status_code == 403
    assert r.json()["detail"]["codigo"] == "invitacion_sin_acceso"


def test_el_consentimiento_se_pide_y_el_reintento_entra_por_el_enlace(client, admin):
    _fundar(client, "uid-c", "consiente@x.co", "casa", "Casa")
    _invitar(client, admin, "consiente@x.co", rol="admin")
    token = _token_de_la_invitacion("consiente@x.co")

    # Quien funda ya aceptó la política: el 428 no aplica acá. Se prueba con
    # una cuenta nueva, que es la que lo recibe.
    _invitar(client, admin, "nueva@x.co", rol="worker")
    token_nueva = _token_de_la_invitacion("nueva@x.co")
    _usar_verificador(client, {
        "t": _claims("uid-c", "consiente@x.co"),
        "n": _claims("uid-n", "nueva@x.co"),
    })
    assert _oauth(client, "n", invitacion=token_nueva, acepta=False).status_code == 428
    r = _oauth(client, "n", invitacion=token_nueva, acepta=True)
    assert r.status_code == 200, r.text
    assert r.json()["cliente"] == "galerias"

    assert _oauth(client, "t", invitacion=token).json()["cliente"] == "galerias"


# ─── El alta no funda un supermercado con el nombre de otro ──────────────────

def test_no_se_funda_un_supermercado_con_el_nombre_de_uno_que_ya_existe(client):
    from app.database import SQLALCHEMY_DATABASE_URL
    import glob
    import os

    carpeta = os.path.dirname(SQLALCHEMY_DATABASE_URL.replace("sqlite:///", "", 1))
    antes = set(glob.glob(os.path.join(carpeta, "recabra_*.db")))

    _usar_verificador(client, {"t": _claims("uid-dup", "dup@x.co")})
    for nombre in ("Galerías", "GALERIAS", "  galerías. "):
        r = client.post(
            "/api/clientes/alta",
            json={"id_token": "t", "slug": "galerias_dos", "nombre": nombre, "acepta_politica": True},
        )
        assert r.status_code == 409, (nombre, r.text)
        assert "invitación" in r.json()["detail"]
    assert set(glob.glob(os.path.join(carpeta, "recabra_*.db"))) == antes, "no se creó ninguna base"

    r = client.post(
        "/api/clientes/alta",
        json={"id_token": "t", "slug": "galerias_pasto", "nombre": "Galerías Pasto", "acepta_politica": True},
    )
    assert r.status_code == 200, r.text


# ─── Sólo un dueño hace dueños ───────────────────────────────────────────────

def test_un_administrador_no_se_fabrica_un_duenio(client):
    cab_duenia = _fundar(client, "uid-d", "duenia@acme.co", "acme", "Acme")
    _invitar(client, cab_duenia, "admin@acme.co", rol="admin")
    _usar_verificador(client, {"a": _claims("uid-a", "admin@acme.co")})
    cab_admin = _cab(_oauth(client, "a").json()["token"])

    r = client.post("/api/usuarios/invitar", json={"email": "amigo@x.co", "rol": "owner"}, headers=cab_admin)
    assert r.status_code == 403
    assert r.json()["detail"] == "Sólo un dueño puede invitar a otro dueño."

    # Todo lo demás, igual que siempre.
    _invitar(client, cab_admin, "mercaderista@acme.co", rol="worker")
    _invitar(client, cab_duenia, "socia@acme.co", rol="owner")


def test_un_administrador_no_desactiva_ni_reactiva_al_duenio(client):
    cab_duenia = _fundar(client, "uid-d", "duenia@acme.co", "acme", "Acme")
    _invitar(client, cab_duenia, "admin@acme.co", rol="admin")
    _usar_verificador(client, {"a": _claims("uid-a", "admin@acme.co")})
    cab_admin = _cab(_oauth(client, "a").json()["token"])

    miembros = {m["email"]: m["id"] for m in client.get("/api/usuarios", headers=cab_admin).json()["miembros"]}
    r = client.patch(f"/api/usuarios/{miembros['duenia@acme.co']}", json={"activo": False}, headers=cab_admin)
    assert r.status_code == 403
    assert r.json()["detail"] == "Sólo un dueño puede activar o desactivar a otro dueño."

    # La dueña sí maneja a su administrador.
    r = client.patch(f"/api/usuarios/{miembros['admin@acme.co']}", json={"activo": False}, headers=cab_duenia)
    assert r.status_code == 200


# ─── El correo dice con qué cuenta entrar ────────────────────────────────────

def test_el_correo_dice_con_que_cuenta_entrar_y_escapa_el_nombre(client, monkeypatch):
    capturado = {}

    def _falso(destinatarios, asunto, html):
        capturado.update(destinatarios=destinatarios, asunto=asunto, html=html)
        return True

    import app.routers.usuarios as usuarios_router
    monkeypatch.setattr(usuarios_router, "send_mail_to_bg", _falso)

    cab = _fundar(client, "uid-e", "duenia@e.co", "escape", "Súper <i>Uno</i>")
    _invitar(client, cab, "invitada@e.co", rol="worker")

    html = capturado["html"]
    assert "invitada@e.co" in html
    assert "Ingrese desde" in html and "?invitacion=" in html
    assert "&lt;i&gt;Uno&lt;/i&gt;" in html
    assert "<i>Uno</i>" not in html


# ─── Credenciales sin claim `cliente` y el cliente de siempre archivado ──────

def test_sin_el_de_siempre_un_token_sin_cliente_no_cae_en_otro(client, monkeypatch):
    from app.auth import create_mount_token, create_token

    cab_op = _fundar(client, "uid-op", "op@plataforma.co", "pepito", "Pepito")
    monkeypatch.setenv("OPERADOR_EMAILS", "op@plataforma.co")
    r = client.post("/api/plataforma/clientes/galerias/archivar", json={"motivo": "instalación vieja"}, headers=cab_op)
    assert r.status_code == 200, r.text

    viejo = create_token("admin", 0, None)
    for ruta in ("/api/spaces/", "/api/layout/", "/api/suppliers/"):
        assert client.get(ruta, headers=_cab(viejo)).status_code == 401, ruta
    montaje = create_mount_token("A-1", cliente=None)
    assert client.get("/api/montaje/mi-espacio", params={"token": montaje}).status_code == 401
    # Y el login legado sin `cliente` tampoco se cae a Pepito.
    assert client.post("/api/auth/login", json={"password": "admin123"}).status_code == 422
