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
import json
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


# ─── Cambiar el rol (2026-11-20) ──────────────────────────────────────────────
#
# Reinvitar a un miembro da 409 y no había otra forma de pasar a un trabajador a
# administrador (recorrido del manual del dueño). Mismas reglas que invitar.

def _equipo_de_acme(client):
    """La dueña de Acme, una administradora y un trabajador que ya entraron."""
    cab_duenia = _fundar(client, "uid-d", "duenia@acme.co", "acme", "Acme")
    _invitar(client, cab_duenia, "admin@acme.co", rol="admin")
    _invitar(client, cab_duenia, "peon@acme.co", rol="worker")
    _usar_verificador(client, {
        "a": _claims("uid-a", "admin@acme.co"), "p": _claims("uid-p", "peon@acme.co"),
        "d": _claims("uid-d", "duenia@acme.co"),
    })
    cab_admin = _cab(_oauth(client, "a").json()["token"])
    cab_peon = _cab(_oauth(client, "p").json()["token"])
    miembros = {m["email"]: m["id"] for m in client.get("/api/usuarios", headers=cab_duenia).json()["miembros"]}
    return cab_duenia, cab_admin, cab_peon, miembros


def _rol_en_la_lista(client, cab, email):
    return next(m["rol"] for m in client.get("/api/usuarios", headers=cab).json()["miembros"] if m["email"] == email)


def test_la_duenia_le_cambia_el_rol_a_un_trabajador_y_su_token_viejo_deja_de_valer(client):
    from app.routers.usuarios import ROL_EN_EL_CORREO

    cab_duenia, _cab_admin, cab_peon, miembros = _equipo_de_acme(client)
    assert client.get("/api/usuarios", headers=cab_peon).status_code == 403

    r = client.patch(f"/api/usuarios/{miembros['peon@acme.co']}", json={"rol": "admin"}, headers=cab_duenia)
    assert r.status_code == 200, r.text
    assert _rol_en_la_lista(client, cab_duenia, "peon@acme.co") == "admin"

    # El token que tenía abierto dice «worker»: ya no vale (vuelve a entrar).
    assert client.get("/api/spaces/", headers=cab_peon).status_code == 401
    r = _oauth(client, "p")
    assert r.status_code == 200 and r.json()["role"] == "admin"
    assert client.get("/api/usuarios", headers=_cab(r.json()["token"])).status_code == 200

    # Y de vuelta a trabajador: el token de administrador deja de abrir la plata.
    cab_ascendido = _cab(r.json()["token"])
    assert client.patch(f"/api/usuarios/{miembros['peon@acme.co']}", json={"rol": "worker"},
                        headers=cab_duenia).status_code == 200
    assert client.get("/api/usuarios", headers=cab_ascendido).status_code == 401

    # La bitácora dice a quién y qué cambió, en palabras, y que lo hizo la dueña.
    lineas = [l for l in client.get("/api/bitacora/?accion=usuario.rol", headers=cab_duenia).json()]
    assert [l["detalle"].split(" · ")[0] for l in lineas] == [
        f"peon@acme.co: {ROL_EN_EL_CORREO['admin']} → {ROL_EN_EL_CORREO['worker']}",
        f"peon@acme.co: {ROL_EN_EL_CORREO['worker']} → {ROL_EN_EL_CORREO['admin']}",
    ]
    assert all(l["rol"] == "owner" and l["detalle"].endswith("duenia@acme.co") for l in lineas)
    assert lineas[0]["titulo"] == "Rol de una persona cambiado"


def test_solo_un_duenio_da_el_rol_duenio_o_se_lo_cambia_a_otro(client):
    from app.routers.usuarios import SOLO_DUENIO_CAMBIA_DUENIO

    cab_duenia, cab_admin, _cab_peon, miembros = _equipo_de_acme(client)

    # La administradora sí sube a un trabajador a administrador (como invitarlo)…
    assert client.patch(f"/api/usuarios/{miembros['peon@acme.co']}", json={"rol": "admin"},
                        headers=cab_admin).status_code == 200
    # …pero no hace dueños, ni le baja el rol a la dueña.
    r = client.patch(f"/api/usuarios/{miembros['peon@acme.co']}", json={"rol": "owner"}, headers=cab_admin)
    assert r.status_code == 403 and r.json()["detail"] == SOLO_DUENIO_CAMBIA_DUENIO
    r = client.patch(f"/api/usuarios/{miembros['duenia@acme.co']}", json={"rol": "worker"}, headers=cab_admin)
    assert r.status_code == 403 and r.json()["detail"] == SOLO_DUENIO_CAMBIA_DUENIO
    assert _rol_en_la_lista(client, cab_duenia, "duenia@acme.co") == "owner"

    # La dueña sí hace dueña a la administradora (su token sigue: las dos viajan como admin).
    assert client.patch(f"/api/usuarios/{miembros['admin@acme.co']}", json={"rol": "owner"},
                        headers=cab_duenia).status_code == 200
    assert client.get("/api/clientes/mi-suscripcion", headers=cab_admin).status_code == 200


def test_el_supermercado_no_se_queda_sin_duenio_y_nadie_se_cambia_a_si_mismo(client, admin):
    from app.routers.usuarios import NO_A_VOS_MISMO, ULTIMO_DUENIO

    cab_duenia, cab_admin, _cab_peon, miembros = _equipo_de_acme(client)
    yo = miembros["duenia@acme.co"]

    # Ni desactivarse ni bajarse de rol: tampoco la administradora a sí misma.
    for cuerpo in ({"activo": False}, {"rol": "admin"}):
        r = client.patch(f"/api/usuarios/{yo}", json=cuerpo, headers=cab_duenia)
        assert r.status_code == 409 and r.json()["detail"] == NO_A_VOS_MISMO, cuerpo
    r = client.patch(f"/api/usuarios/{miembros['admin@acme.co']}", json={"activo": False}, headers=cab_admin)
    assert r.status_code == 409 and r.json()["detail"] == NO_A_VOS_MISMO
    # Lo que no cambia nada no se frena.
    assert client.patch(f"/api/usuarios/{yo}", json={"rol": "owner"}, headers=cab_duenia).status_code == 200

    # Con otra dueña, a la primera se la puede pasar a administradora (lo hace la otra).
    client.patch(f"/api/usuarios/{miembros['admin@acme.co']}", json={"rol": "owner"}, headers=cab_duenia)
    r = client.patch(f"/api/usuarios/{yo}", json={"rol": "admin"}, headers=cab_admin)
    assert r.status_code == 200, r.text
    # Y ya no queda otra dueña: a la que sigue no se le puede quitar el rol
    # (la clave de la instalación, que no tiene membresía, lo intenta).
    from app.auth import create_token
    cab_legado = _cab(create_token("admin", 0, "acme"))
    r = client.patch(f"/api/usuarios/{miembros['admin@acme.co']}", json={"rol": "worker"}, headers=cab_legado)
    assert r.status_code == 409 and r.json()["detail"] == ULTIMO_DUENIO
    assert _rol_en_la_lista(client, cab_admin, "admin@acme.co") == "owner"


def test_cambiar_el_rol_valida_lo_que_llega(client):
    cab_duenia, _cab_admin, _cab_peon, miembros = _equipo_de_acme(client)
    peon = miembros["peon@acme.co"]
    assert client.patch(f"/api/usuarios/{peon}", json={"rol": "jefe"}, headers=cab_duenia).status_code == 422
    assert client.patch(f"/api/usuarios/{peon}", json={}, headers=cab_duenia).status_code == 422
    assert client.patch("/api/usuarios/999999", json={"rol": "admin"}, headers=cab_duenia).status_code == 404


def test_la_bitacora_dice_duenio_cuando_lo_hizo_la_duenia(client):
    """El dueño viaja como `admin` en el token y la bitácora lo anotaba así
    («admin · 127.0.0.1»). El rol del token no cambia: sólo lo anotado."""
    cab_duenia, cab_admin, _cab_peon, miembros = _equipo_de_acme(client)
    client.patch(f"/api/usuarios/{miembros['peon@acme.co']}", json={"activo": False}, headers=cab_duenia)
    client.patch(f"/api/usuarios/{miembros['peon@acme.co']}", json={"activo": True}, headers=cab_admin)
    lineas = client.get("/api/bitacora/?accion=usuario.cambio", headers=cab_duenia).json()
    # A quién, qué y quién (2026-11-21: decía «activado · admin@acme.co», y
    # ese correo era el de quien lo hizo, no el de la persona activada).
    assert [(l["detalle"], l["rol"]) for l in lineas] == [
        ("peon@acme.co: activado · admin@acme.co", "admin"),
        ("peon@acme.co: desactivado · duenia@acme.co", "owner"),
    ]
    # La invitación dice a quién y el rol en palabras (decía «rol owner»).
    invitadas = client.get("/api/bitacora/?accion=usuario.invitado", headers=cab_duenia).json()
    assert [(l["detalle"], l["rol"]) for l in invitadas] == [
        ("peon@acme.co: rol Trabajador · duenia@acme.co", "owner"),
        ("admin@acme.co: rol Administrador · duenia@acme.co", "owner"),
    ]
    # El ingreso de la dueña, también.
    _oauth(client, "d")
    ingreso = client.get("/api/bitacora/?accion=login.ok", headers=cab_duenia).json()[0]
    assert ingreso["rol"] == "owner" and ingreso["detalle"] == "duenia@acme.co"


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
    assert "Entrá desde" in html and "?invitacion=" in html
    assert "&lt;i&gt;Uno&lt;/i&gt;" in html
    assert "<i>Uno</i>" not in html
    # Escapado UNA vez: el título lo escapa `html_shell` (2026-10-02), así que
    # quien llama ya no lo escapa por su cuenta.
    assert "&amp;lt;" not in html


# ─── La invitación pasa por la cola de correos (2026-11-21) ───────────────────
#
# Salía directo: una falla pasajera del proveedor de correo perdía la invitación
# y la pantalla decía igual «Invitación enviada». Ahora se anota en
# `correos_pendientes`, el mantenimiento la reintenta y la respuesta dice si salió.

def _correos_de_galerias():
    from app.database import SessionLocal
    from app.models.correos import CorreoPendiente

    db = SessionLocal()
    try:
        return [(f.estado, f.intentos, json.loads(f.destinatarios_json), f.asunto)
                for f in db.query(CorreoPendiente).order_by(CorreoPendiente.id).all()]
    finally:
        db.close()


def test_la_invitacion_que_no_sale_queda_en_la_cola_y_se_reintenta(client, admin, monkeypatch):
    from app.database import SessionLocal
    from app.services import cola_de_correos, mailer
    from tests.conftest import esperar_mantenimiento

    import app.routers.usuarios as usuarios_router

    esperar_mantenimiento()
    intentos = []

    def _cae(destinatarios, asunto, html):
        intentos.append((list(destinatarios), asunto))
        return False

    monkeypatch.setattr(usuarios_router, "send_mail_to_bg", _cae)
    r = client.post("/api/usuarios/invitar", json={"email": "nueva@acme.co", "rol": "worker"}, headers=admin)
    assert r.status_code == 200, r.text
    assert r.json()["correo_enviado"] is False
    assert intentos == [(["nueva@acme.co"], "Invitación a Galerías — RECABRA")]
    assert _correos_de_galerias() == [("pendiente", 1, ["nueva@acme.co"], "Invitación a Galerías — RECABRA")]
    # La invitación existe igual: aparece en la lista de pendientes.
    pendientes = client.get("/api/usuarios", headers=admin).json()["invitaciones"]
    assert [i["email"] for i in pendientes] == ["nueva@acme.co"]

    # Cuando el proveedor vuelve, el mantenimiento la manda: el mismo correo.
    salieron = []
    monkeypatch.setattr(mailer, "send_mail_to", lambda d, a, h: salieron.append((list(d), a, h)) or True)
    db = SessionLocal()
    try:
        luego = datetime.now(timezone.utc) + timedelta(hours=1)
        assert cola_de_correos.despachar_pendientes(db, ahora=luego) == {"enviados": 1, "fallidos": 0}
    finally:
        db.close()
    assert _correos_de_galerias()[0][:2] == ("enviado", 2)
    [(destinatarios, asunto, html)] = salieron
    assert destinatarios == ["nueva@acme.co"] and asunto == "Invitación a Galerías — RECABRA"
    assert "?invitacion=" in html and "nueva@acme.co" in html


def test_la_invitacion_que_sale_queda_enviada_y_la_respuesta_lo_dice(client, admin, monkeypatch):
    from tests.conftest import esperar_mantenimiento

    import app.routers.usuarios as usuarios_router

    esperar_mantenimiento()
    monkeypatch.setattr(usuarios_router, "send_mail_to_bg", lambda d, a, h: True)
    r = client.post("/api/usuarios/invitar", json={"email": "otra@acme.co", "rol": "admin"}, headers=admin)
    assert r.status_code == 200, r.text
    assert r.json()["correo_enviado"] is True
    assert _correos_de_galerias() == [("enviado", 1, ["otra@acme.co"], "Invitación a Galerías — RECABRA")]


def test_con_la_clave_de_la_instalacion_la_bitacora_dice_a_quien_se_invito(client, admin):
    """Con el login legado no hay correo de quien invita: la línea decía sólo
    «rol Trabajador», sin ningún correo. Ahora dice a quién."""
    _invitar(client, admin, "Invitada@Acme.co", rol="worker")
    [linea] = client.get("/api/bitacora/?accion=usuario.invitado", headers=admin).json()
    assert linea["detalle"] == "invitada@acme.co: rol Trabajador"
    assert linea["titulo"] == "Persona invitada"


def test_el_titulo_del_correo_es_texto_y_no_arma_html(client):
    """El título es el asunto, con la sede o el código adentro, y los escribe
    quien administra: una sede con `<` no puede armar HTML en el correo."""
    from app.services.mailer import html_shell

    html = html_shell("3 espacios por montar — <b>NAVE</b>", [("Espacio", "x")])
    assert "<b>NAVE</b>" not in html
    assert "&lt;b&gt;NAVE&lt;/b&gt;" in html


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


# ─── La voz: de vos, como la app (2026-11-20) ─────────────────────────────────

def test_los_textos_del_ingreso_y_la_invitacion_van_de_vos():
    """La invitación y los avisos del ingreso estaban en usted («Ingrese con la
    cuenta», «Solicite uno nuevo a quien lo invitó») en una app que habla de
    vos. Sólo la landing va de usted (decisión del dueño)."""
    import inspect
    import re

    from app.routers import alta, auth, usuarios

    usted = re.compile(r"\b(Ingrese|ingrese|Solicite|solicite|usted|Su acceso|lo invitó|Cierre esta|Le escribimos|el suyo|agregue)\b")
    for texto in (auth.INVITACION_INVALIDA, alta.MENSAJE_NOMBRE_TOMADO, alta.MENSAJE_EN_ESPERA):
        assert not usted.search(texto), texto
    for modulo in (auth, usuarios):
        codigo = "\n".join(l for l in inspect.getsource(modulo).splitlines() if not l.strip().startswith("#"))
        cadenas = re.findall(r"f?\"[^\"\n]*\"|f?'[^'\n]*'", codigo)
        hallados = [c for c in cadenas if usted.search(c)]
        assert hallados == [], hallados
