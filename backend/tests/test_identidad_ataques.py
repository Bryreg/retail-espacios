"""Red team de la Fase 1 Identidad — tests de ATAQUE, no de funcionalidad.

Escritos por el auditor ofensivo de tokens. Tres clases de test acá adentro:

* **Defensas que aguantan**: el ataque se ejecuta y falla. Son la evidencia
  de que se probó, y la red que avisa si mañana alguien la afloja.
* **Regresiones de hallazgos ya cerrados**: los agujeros que este auditor
  encontró y el builder tapó durante la misma sesión (H-1 … H-6). Quedan acá
  para que no vuelvan.
* **Hallazgos abiertos**, marcados ``xfail(strict=True)``: afirman el
  comportamiento SEGURO, que hoy no se cumple. Con ``strict=True`` el día que
  se arregle el agujero el test pasa a XPASS y la suite se pone en rojo — el
  recordatorio de sacarle el marcador. Mientras tanto la suite sigue verde y
  el hallazgo no se pierde.

El identificador (``H-n``) de cada test referencia el informe
``features/identidad/outputs/auditoria-seguridad.md``.

**Sobre el verificador falso.** ``tests/test_identidad.py`` guarda una
referencia a ``get_verificador`` tomada al importar el módulo. El fixture
``client`` purga ``sys.modules['app.*']`` entre pruebas, así que esa
referencia envejece. Acá el módulo se importa DENTRO de cada test —después de
que el fixture armó la app— para que la clave del ``dependency_overrides`` sea
siempre el objeto vivo.
"""
import json
import time
from datetime import datetime, timedelta, timezone

import jwt
import pytest

from conftest import CLAVE_ADMIN, medios


# ─── Utilidades ────────────────────────────────────────────────────────────────

def _ft():
    from app.services import firebase_tokens as ft
    return ft


def _claims(uid, email, verificado=True, proveedor="google.com", nombre=None):
    return _ft().ClaimsVerificadas(
        uid=uid, email=email, email_verificado=verificado,
        proveedor=proveedor, nombre=nombre,
    )


def _usar_verificador(client, mapa):
    """Inyecta un verificador falso usando el objeto VIVO de `get_verificador`."""
    ft = _ft()

    class _Falso(ft.VerificadorDeIdToken):
        def verificar(self, id_token):
            return mapa.get(id_token)

    client.app.dependency_overrides[ft.get_verificador] = lambda: _Falso()


def _cab(token):
    return {"Authorization": f"Bearer {token}"}


def _invitar(client, cab_admin, email, rol="worker"):
    r = client.post("/api/usuarios/invitar", json={"email": email, "rol": rol}, headers=cab_admin)
    assert r.status_code == 200, r.text
    return r.json()


def _oauth(client, id_token, cliente=None, acepta_politica=True):
    body = {"id_token": id_token, "acepta_politica": acepta_politica}
    if cliente is not None:
        body["cliente"] = cliente
    return client.post("/api/auth/oauth", json=body)


def _entrar(client, cab_admin, email, uid, rol="worker", cliente=None):
    """Invita + entra por /oauth. Devuelve el cuerpo de la respuesta."""
    _invitar(client, cab_admin, email, rol=rol)
    _usar_verificador(client, {"tok": _claims(uid, email)})
    r = _oauth(client, "tok", cliente=cliente)
    assert r.status_code == 200, r.text
    return r.json()


def _id_de(client, cab_admin, email):
    listado = client.get("/api/usuarios", headers=cab_admin).json()
    return next(m["id"] for m in listado["miembros"] if m["email"] == email)


def _payload(token):
    """Los claims del JWT propio, sin verificar — es un test, la firma no importa."""
    return jwt.decode(token, options={"verify_signature": False})


def _admin_de(client, slug):
    return _cab(
        client.post("/api/auth/login", json={"password": CLAVE_ADMIN, "cliente": slug}).json()["token"]
    )


# ════════════════════════════════════════════════════════════════════════════
# HALLAZGOS ABIERTOS
# ════════════════════════════════════════════════════════════════════════════

@pytest.mark.xfail(
    strict=True,
    reason=(
        "H-7 (media): el `token` de la invitación (routers/usuarios.py:105) se "
        "genera, se guarda y se manda por correo (línea 122) pero NO se lee en "
        "ningún lado — ni el backend ni el frontend lo canjean. La invitación "
        "se resuelve sólo por igualdad de `email` en /oauth, así que el enlace "
        "del correo es decorativo y no prueba nada."
    ),
)
def test_ataque_el_token_de_la_invitacion_no_se_verifica_nunca(client, admin):
    from app.clientes import sesion_registro
    from app.models.identidad import Invitacion

    _invitar(client, admin, "invitada@x.co", rol="worker")

    reg = sesion_registro()
    try:
        emitido = reg.query(Invitacion).filter(Invitacion.email == "invitada@x.co").first().token
    finally:
        reg.close()

    # Entrar SIN presentar el token del correo tendría que ser imposible: el
    # enlace es lo único que prueba que quien entra recibió la invitación.
    _usar_verificador(client, {"tok": _claims("uid-inv", "invitada@x.co")})
    r = _oauth(client, "tok")
    assert r.status_code in (401, 403), (
        f"la invitación se canjeó sin presentar el token {emitido[:8]}…: {r.status_code}"
    )


@pytest.mark.xfail(
    strict=True,
    reason=(
        "H-8 (media): una invitación se canjea sola, en cualquier login y desde "
        "CUALQUIER cliente (routers/auth.py, bloque de invitaciones: el filtro "
        "es sólo `Invitacion.email == email`). El admin de un cliente ajeno "
        "escribe un correo conocido y, en el próximo login de esa persona, se "
        "queda con una membresía suya sin que ella acepte nada — y desde ahí ve "
        "su nombre y su `ultimo_login` en GET /api/usuarios."
    ),
)
def test_ataque_un_cliente_ajeno_se_agrega_una_membresia_sin_consentimiento(client, admin):
    from app.clientes import crear_cliente

    # La persona ya tiene cuenta y trabaja en "galerias".
    _entrar(client, admin, "persona@x.co", "uid-persona", rol="admin")

    # Un admin de otro cliente del mismo servicio escribe ese correo.
    crear_cliente("ajeno", "Ajeno")
    admin_ajeno = _admin_de(client, "ajeno")
    _invitar(client, admin_ajeno, "persona@x.co", rol="worker")

    # La persona vuelve a entrar. No aceptó nada.
    _usar_verificador(client, {"tok": _claims("uid-persona", "persona@x.co")})
    r = _oauth(client, "tok")
    assert r.status_code == 200, r.text
    cuerpo = r.json()

    assert cuerpo.get("requiere_cliente") is not True, (
        "la cuenta ganó una membresía en un cliente ajeno sin aceptarla: "
        f"{cuerpo.get('membresias')}"
    )
    # Y el admin ajeno no debería ver ni el nombre ni el último login de nadie
    # que no haya aceptado entrar a su cliente.
    miembros = client.get("/api/usuarios", headers=admin_ajeno).json()["miembros"]
    assert all(m["email"] != "persona@x.co" for m in miembros), miembros


# ════════════════════════════════════════════════════════════════════════════
# REGRESIONES · hallazgos cerrados durante esta auditoría
# ════════════════════════════════════════════════════════════════════════════

def test_h9_el_freno_de_oauth_no_contamina_el_login_legado(client):
    """H-9 (era baja): el contador de /oauth vivía en `login_attempts`.

    `sesion_registro()` es la base del cliente POR DEFECTO, así que los fallos
    de /oauth de todos los clientes se sumaban al freno del login legado de
    ese cliente —y sólo de ese—. Ahora van a `IntentoOauth`, tabla propia en
    el registro.
    """
    _usar_verificador(client, {})  # todo id_token da None -> 401

    for i in range(15):
        _oauth(client, f"basura-{i}")

    r = client.post("/api/auth/login", json={"password": CLAVE_ADMIN, "cliente": "galerias"})
    assert r.status_code == 200, f"/oauth agotó el cupo de /api/auth/login: {r.status_code}"

    # Y al revés: agotar el login legado no cierra /oauth.
    for _ in range(15):
        client.post("/api/auth/login", json={"password": "malísima"})
    assert client.post("/api/auth/login", json={"password": CLAVE_ADMIN}).status_code == 429



def test_h1_el_token_de_rescate_de_passwords_conserva_sub(client, admin):
    """H-1 (era bloqueante): PUT /api/auth/passwords reemitía un token SIN `sub`.

    Un token sin `sub` no pasa por el chequeo de membresía de `decode_token`:
    cualquier admin con cuenta real se fabricaba una credencial de 12 h inmune
    a que lo desactivaran.
    """
    sesion = _entrar(client, admin, "duenio@x.co", "uid-duenio", rol="owner")
    cab_oauth = _cab(sesion["token"])

    rescate = client.put(
        "/api/auth/passwords",
        json={"admin_password": "clave-nueva-larga"},
        headers=cab_oauth,
    ).json()["token"]
    assert _payload(rescate)["sub"] == _payload(sesion["token"])["sub"]

    # Y la revocación lo alcanza igual que al token de /oauth.
    otro = _cab(client.post("/api/auth/login", json={"password": "clave-nueva-larga"}).json()["token"])
    _entrar(client, otro, "owner2@x.co", "uid-owner2", rol="owner")
    uid_victima = _id_de(client, otro, "duenio@x.co")
    assert client.patch(f"/api/usuarios/{uid_victima}", json={"activo": False}, headers=otro).status_code == 200

    assert client.get("/api/spaces/", headers=cab_oauth).status_code == 401
    assert client.get("/api/spaces/", headers=_cab(rescate)).status_code == 401


def test_h2_una_invitacion_no_se_canjea_con_un_correo_sin_verificar(client, admin):
    """H-2 (era alta): sólo el proveedor "password" exigía `email_verified`.

    Cualquier otro proveedor del proyecto Firebase podía declarar el correo de
    otra persona y quedarse con su invitación.
    """
    _invitar(client, admin, "ceo@corp.co", rol="owner")

    for proveedor in ("password", "facebook.com", "custom", None):
        _usar_verificador(client, {
            "tok": _claims("uid-atacante", "ceo@corp.co", verificado=False, proveedor=proveedor),
        })
        r = _oauth(client, "tok")
        assert r.status_code in (401, 403), (proveedor, r.status_code, r.text)

    # Google es la única excepción, y con motivo: verifica el correo antes de
    # emitir el ID token, aunque no siempre marque el claim.
    _usar_verificador(client, {
        "tok": _claims("uid-google", "ceo@corp.co", verificado=False, proveedor="google.com"),
    })
    assert _oauth(client, "tok").status_code == 200


def test_h2b_vincular_un_uid_nuevo_a_una_cuenta_ajena_exige_correo_verificado(client, admin):
    _entrar(client, admin, "victima@x.co", "uid-victima")

    _usar_verificador(client, {
        "tok": _claims("uid-otro", "victima@x.co", verificado=False, proveedor="facebook.com"),
    })
    assert _oauth(client, "tok").status_code in (401, 403)


def test_h3_una_invitacion_a_un_segundo_cliente_si_se_canjea(client, admin):
    """H-3 (era media): la invitación sólo se miraba cuando el usuario no existía."""
    from app.clientes import crear_cliente

    _entrar(client, admin, "andariega@x.co", "uid-and", rol="worker")

    crear_cliente("segundo", "Segundo")
    _invitar(client, _admin_de(client, "segundo"), "andariega@x.co", rol="worker")

    _usar_verificador(client, {"tok": _claims("uid-and", "andariega@x.co")})
    cuerpo = _oauth(client, "tok").json()
    assert cuerpo.get("requiere_cliente") is True, cuerpo
    assert {m["cliente"] for m in cuerpo["membresias"]} == {"galerias", "segundo"}


def test_h4_dos_invitaciones_al_mismo_correo_no_se_pisan(client, admin):
    """H-4 (era media): se canjeaba sólo la MÁS NUEVA y la otra quedaba huérfana."""
    from app.clientes import crear_cliente

    _invitar(client, admin, "ceo@corp.co", rol="owner")
    crear_cliente("segundo", "Segundo")
    time.sleep(0.01)  # que `creado_en` no empate
    _invitar(client, _admin_de(client, "segundo"), "ceo@corp.co", rol="worker")

    _usar_verificador(client, {"tok": _claims("uid-ceo", "ceo@corp.co")})
    cuerpo = _oauth(client, "tok").json()
    assert cuerpo.get("requiere_cliente") is True, cuerpo
    roles = {m["cliente"]: m["rol"] for m in cuerpo["membresias"]}
    assert roles == {"galerias": "owner", "segundo": "worker"}


def test_h5_un_token_con_sub_de_usuario_borrado_no_vale(client, admin):
    """H-5 (era baja/latente): `_membresia_activa` no miraba si el usuario existe."""
    from app.auth import invalidar_cache_membresia
    from app.clientes import sesion_registro
    from app.models.identidad import Usuario

    sesion = _entrar(client, admin, "fantasma@x.co", "uid-fantasma")
    cab = _cab(sesion["token"])
    assert client.get("/api/spaces/", headers=cab).status_code == 200

    reg = sesion_registro()
    try:
        reg.query(Usuario).filter(Usuario.email == "fantasma@x.co").delete()
        reg.commit()
    finally:
        reg.close()
    invalidar_cache_membresia(_payload(sesion["token"])["sub"], "galerias")

    assert client.get("/api/spaces/", headers=cab).status_code == 401


def test_h6_oauth_frena_los_intentos_como_el_login_legado(client):
    """H-6 (era media): /oauth no tenía freno; era 30 verificaciones RSA gratis."""
    _usar_verificador(client, {})
    codigos = [_oauth(client, f"basura-{i}").status_code for i in range(15)]
    assert 429 in codigos, codigos


# ════════════════════════════════════════════════════════════════════════════
# DEFENSAS QUE AGUANTAN · ataques ejecutados y fallidos
# ════════════════════════════════════════════════════════════════════════════

def test_el_jwt_propio_no_sirve_como_id_token_en_oauth(client, admin):
    """Confusión de tokens, ida: el HS256 propio contra el verificador real."""
    from app.services.firebase_tokens import VerificadorFirebase

    sesion = _entrar(client, admin, "confu@x.co", "uid-confu", rol="admin")
    v = VerificadorFirebase(
        "recabra-test",
        transporte=lambda url: (200, json.dumps({"keys": []}).encode(), ""),
    )
    assert v.verificar(sesion["token"]) is None


def test_un_id_token_de_firebase_no_entra_por_require_auth(client, admin):
    """Confusión de tokens, vuelta: un RS256 de Google contra la puerta general.

    El ID token lleva ADEMÁS los claims propios (`role`, `epoca`, `cliente`)
    inyectados a mano: si algún camino leyera los claims sin exigir HS256 con
    JWT_SECRET, entraría como admin.
    """
    from cryptography.hazmat.primitives.asymmetric import rsa

    priv = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    ahora = int(time.time())
    id_token = jwt.encode(
        {
            "sub": "uid-1", "email": "x@x.co", "email_verified": True,
            "role": "admin", "epoca": 0, "cliente": "galerias",
            "aud": "recabra-test", "iss": "https://securetoken.google.com/recabra-test",
            "exp": ahora + 3600,
        },
        priv, algorithm="RS256", headers={"kid": "k1"},
    )
    assert client.get("/api/spaces/", headers=_cab(id_token)).status_code == 401
    assert client.get("/api/usuarios", headers=_cab(id_token)).status_code == 401
    assert client.get(f"/api/catalogo/1/imagen?token={id_token}").status_code == 401
    assert client.get(f"/api/montaje/mi-espacio?token={id_token}").status_code == 401


def test_el_token_de_montaje_no_abre_oauth_ni_la_gestion_de_usuarios(client, admin):
    from app.auth import create_mount_token

    montaje = create_mount_token("NAVE-PUN-01", "galerias")
    assert client.get("/api/usuarios", headers=_cab(montaje)).status_code == 401
    assert client.get("/api/spaces/", headers=_cab(montaje)).status_code == 401
    assert client.post("/api/usuarios/invitar", json={"email": "a@b.co", "rol": "admin"},
                       headers=_cab(montaje)).status_code == 401

    _usar_verificador(client, {})
    assert _oauth(client, montaje).status_code in (401, 429)


def test_la_revocacion_alcanza_el_token_por_query_y_la_puerta_de_montaje(client, admin):
    """Desactivada la membresía, ningún camino lateral queda abierto."""
    sesion = _entrar(client, admin, "lateral@x.co", "uid-lat")
    tok = sesion["token"]
    med = medios(tok)  # lo que viaja por query (P2-1)

    # Vivo: la dependencia pasa (el 404 es del recurso, no de la autenticación).
    assert client.get(f"/api/catalogo/1/imagen?token={med}").status_code == 404
    assert client.get(f"/api/montaje/mi-espacio?token={med}").status_code != 401

    uid = _id_de(client, admin, "lateral@x.co")
    assert client.patch(f"/api/usuarios/{uid}", json={"activo": False}, headers=admin).status_code == 200

    assert client.get(f"/api/catalogo/1/imagen?token={med}").status_code == 401
    assert client.get(f"/api/montaje/mi-espacio?token={med}").status_code == 401
    assert client.get("/api/spaces/", headers=_cab(tok)).status_code == 401
    assert client.get(f"/api/files/1?token={med}").status_code == 401


def test_el_body_cliente_de_oauth_no_alcanza_una_membresia_inactiva(client, admin):
    """Cross-cliente: pedir explícitamente un cliente con la membresía apagada."""
    from app.clientes import crear_cliente

    crear_cliente("vecino2", "Vecino Dos")
    _invitar(client, admin, "doble@x.co", rol="worker")
    _invitar(client, _admin_de(client, "vecino2"), "doble@x.co", rol="admin")

    _usar_verificador(client, {"tok": _claims("uid-doble", "doble@x.co")})
    assert _oauth(client, "tok", cliente="galerias").status_code == 200

    uid = _id_de(client, admin, "doble@x.co")
    client.patch(f"/api/usuarios/{uid}", json={"activo": False}, headers=admin)

    for slug in ("galerias", "GALERIAS", " galerias ", "../galerias", "galerias%00"):
        assert _oauth(client, "tok", cliente=slug).status_code == 403, slug


def test_un_admin_de_a_no_toca_las_membresias_de_b(client, admin):
    from app.clientes import crear_cliente

    crear_cliente("vecino3", "Vecino Tres")
    admin_vecino = _admin_de(client, "vecino3")
    _entrar(client, admin, "solo-a@x.co", "uid-a", rol="worker")
    uid = _id_de(client, admin, "solo-a@x.co")

    assert client.patch(f"/api/usuarios/{uid}", json={"activo": False}, headers=admin_vecino).status_code == 404
    assert client.get("/api/usuarios", headers=admin_vecino).json()["miembros"] == []
    # Y la membresía real siguió intacta.
    assert client.get("/api/usuarios", headers=admin).json()["miembros"][0]["activo"] is True


def test_la_cabecera_manda_sobre_el_token_de_query(client, admin):
    """`?token=` de otro cliente no redirige la base cuando hay cabecera válida."""
    from app.clientes import crear_cliente

    crear_cliente("vecino4", "Vecino Cuatro")
    tok_vecino = client.post(
        "/api/auth/login", json={"password": CLAVE_ADMIN, "cliente": "vecino4"}
    ).json()["token"]

    sesion = _entrar(client, admin, "coherente@x.co", "uid-coh", rol="admin")
    r = client.get(f"/api/usuarios?token={tok_vecino}", headers=_cab(sesion["token"]))
    assert r.status_code == 200
    assert [m["email"] for m in r.json()["miembros"]] == ["coherente@x.co"]


def test_ni_el_id_token_ni_el_jwt_propio_se_filtran(client, admin):
    _invitar(client, admin, "fuga@x.co", rol="worker")
    _usar_verificador(client, {"tok-secreto": _claims("uid-fuga", "fuga@x.co")})

    fallo = _oauth(client, "tok-secreto-mal")
    assert "tok-secreto" not in fallo.text

    sesion = _oauth(client, "tok-secreto").json()
    crudo = json.dumps(client.get("/api/bitacora/", headers=admin).json())
    assert "tok-secreto" not in crudo
    assert sesion["token"] not in crudo
    # JWT_SECRET ni asomado en ninguna respuesta.
    assert "test-secret" not in crudo


def test_invitar_no_delata_si_el_correo_ya_existe_en_otro_cliente(client, admin):
    """Enumeración: el 409 sólo habla del cliente propio."""
    from app.clientes import crear_cliente

    crear_cliente("vecino5", "Vecino Cinco")
    admin_vecino = _admin_de(client, "vecino5")
    _entrar(client, admin, "conocida@x.co", "uid-con", rol="worker")

    a = client.post("/api/usuarios/invitar", json={"email": "conocida@x.co", "rol": "worker"}, headers=admin_vecino)
    b = client.post("/api/usuarios/invitar", json={"email": "nadie@x.co", "rol": "worker"}, headers=admin_vecino)
    assert a.status_code == b.status_code == 200


def test_oauth_no_distingue_correo_invitado_de_correo_desconocido(client, admin):
    """El 403 es idéntico con una invitación vencida y sin ninguna invitación."""
    from app.clientes import sesion_registro
    from app.models.identidad import Invitacion

    _invitar(client, admin, "vencida@x.co", rol="worker")
    reg = sesion_registro()
    try:
        inv = reg.query(Invitacion).filter(Invitacion.email == "vencida@x.co").first()
        inv.expira_en = datetime.now(timezone.utc) - timedelta(days=1)
        reg.commit()
    finally:
        reg.close()

    _usar_verificador(client, {
        "a": _claims("uid-a", "vencida@x.co"),
        "b": _claims("uid-b", "jamas-invitada@x.co"),
    })
    ra, rb = _oauth(client, "a"), _oauth(client, "b")
    assert ra.status_code == rb.status_code == 403
    assert ra.json()["detail"] == rb.json()["detail"]


def test_el_rol_del_token_lo_manda_la_membresia_no_el_pedido(client, admin):
    """Escalada: un invitado como worker no puede nacer admin."""
    _invitar(client, admin, "aspirante@x.co", rol="worker")
    _usar_verificador(client, {"tok": _claims("uid-asp", "aspirante@x.co", nombre="admin")})

    r = _oauth(client, "tok", cliente="galerias")
    assert r.status_code == 200, r.text
    assert r.json()["role"] == "worker"
    assert _payload(r.json()["token"])["role"] == "worker"
    assert client.get("/api/usuarios", headers=_cab(r.json()["token"])).status_code == 403
    assert client.post("/api/usuarios/invitar", json={"email": "x@y.co", "rol": "owner"},
                       headers=_cab(r.json()["token"])).status_code == 403


def test_una_invitacion_no_resucita_ni_asciende_una_membresia_apagada(client, admin):
    """Reactivación por la puerta de atrás: invitar a quien fue desactivado."""
    from app.clientes import sesion_registro
    from app.models.identidad import Invitacion, Membresia

    _entrar(client, admin, "echada@x.co", "uid-ech", rol="worker")
    uid = _id_de(client, admin, "echada@x.co")
    client.patch(f"/api/usuarios/{uid}", json={"activo": False}, headers=admin)

    # El endpoint corta antes (409, ya es miembro). Se fuerza la fila a mano
    # para probar el canje, que es la parte que importa.
    assert client.post("/api/usuarios/invitar", json={"email": "echada@x.co", "rol": "owner"},
                       headers=admin).status_code == 409

    reg = sesion_registro()
    try:
        reg.add(Invitacion(
            email="echada@x.co", cliente_slug="galerias", rol="owner",
            token="forzado-a-mano",
            expira_en=datetime.now(timezone.utc) + timedelta(days=1),
        ))
        reg.commit()
    finally:
        reg.close()

    _usar_verificador(client, {"tok": _claims("uid-ech", "echada@x.co")})
    assert _oauth(client, "tok").status_code == 403  # sigue desactivada

    reg = sesion_registro()
    try:
        m = reg.query(Membresia).filter(Membresia.usuario_id == uid).first()
        assert m.activo is False
        assert m.rol == "worker", "la invitación no puede ascender a owner"
    finally:
        reg.close()


def test_google_sin_verificar_con_cuenta_previa_e_invitacion_no_da_500(client, admin):
    """El caso que moría en 500 de UNIQUE(email) — hallazgo del verificador.

    Cuenta de Workspace (google.com con `email_verified=false`) cuyo correo YA
    tiene fila en `usuarios` con otro uid, y con una invitación pendiente a un
    segundo cliente: la puerta confía en google.com, la vinculación tiene que
    usar LA MISMA vara. Antes: no vinculaba, intentaba crear un usuario nuevo
    con un correo que ya existía → IntegrityError → 500 — y el 500 vs 403 era
    además un oráculo de qué correos ya tienen cuenta.
    """
    from app.clientes import crear_cliente
    from app.models.identidad import Usuario

    # Cuenta previa por correo/clave (uid viejo) en galerias.
    _entrar(client, admin, "workspace@x.co", "uid-viejo", rol="worker")

    # Un segundo cliente la invita.
    crear_cliente("vecino9", "Vecino Nueve")
    admin_vecino = _admin_de(client, "vecino9")
    _invitar(client, admin_vecino, "workspace@x.co", rol="worker")

    # Vuelve con un token de google.com, email_verified=false, uid NUEVO.
    _usar_verificador(client, {
        "tok": _claims("uid-nuevo-google", "workspace@x.co", verificado=False, proveedor="google.com"),
    })
    r = _oauth(client, "tok", cliente="vecino9")
    assert r.status_code == 200, r.text
    assert r.json()["role"] == "worker"

    # Se vinculó a la cuenta existente: una sola fila, uid actualizado.
    from app.clientes import sesion_registro
    reg = sesion_registro()
    try:
        filas = reg.query(Usuario).filter(Usuario.email == "workspace@x.co").all()
        assert len(filas) == 1
        assert filas[0].firebase_uid == "uid-nuevo-google"
    finally:
        reg.close()


def test_password_sin_verificar_sigue_muriendo_en_la_puerta(client, admin):
    """La unificación de la vara NO afloja el proveedor password: sin
    `email_verified` sigue siendo 401 en la puerta, con o sin cuenta previa."""
    _entrar(client, admin, "estricta@x.co", "uid-est", rol="worker")
    _usar_verificador(client, {
        "tok": _claims("uid-otro", "estricta@x.co", verificado=False, proveedor="password"),
    })
    r = _oauth(client, "tok")
    assert r.status_code == 401
    assert "correo" in r.json()["detail"].lower()
