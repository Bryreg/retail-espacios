"""Cuentas individuales: Google/correo vía Firebase, membresías por cliente.

Dos capas, separadas a propósito:

* **Lógica de negocio** (invitación → cuenta, multi-membresía, revocación,
  redacción por rol, cross-cliente) se prueba con un verificador falso
  inyectado por ``app.dependency_overrides`` — no hace falta firmar nada de
  verdad para probar "¿qué hace el backend con un token ya verificado?".
* **Verificación del ID token** (los ataques: `alg=none`, confusión RS→HS,
  `aud`/`iss`/`exp`, `kid` desconocido) se prueba contra el
  ``VerificadorFirebase`` REAL, con una clave RSA propia del test y un
  transporte HTTP inyectado que nunca toca la red — el JWKS "de Google" es un
  diccionario en memoria armado acá.

**Todos los ``import app.*`` van adentro de las funciones, nunca arriba del
archivo** — es la misma regla que ``conftest.py`` explica para sí mismo:
``app.database`` arma el motor al importarse, y el fixture ``client`` purga
``sys.modules`` entre pruebas para que cada una arranque con un motor propio.
Un import de nivel de módulo se resuelve UNA vez, en la colección de pytest
—antes de que ningún fixture haya corrido—, y esa referencia queda vieja en
cuanto CUALQUIER otro archivo de test corre antes que éste y dispara la purga:
``client.app.dependency_overrides[get_verificador]`` terminaría apuntando a
una función que ya no es la que usa el router de la app fresca.
"""
import base64
import hashlib
import hmac
import json
import time
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from jwt.algorithms import RSAAlgorithm

from conftest import CLAVE_ADMIN, CLAVE_WORKER
from app.fechas import hoy as hoy_en_colombia  # el «hoy» del negocio: Colombia

PROJECT_ID = "recabra-test"


# ─── Helpers: verificador falso para las pruebas de negocio ────────────────────

class FakeVerificador:
    """Traduce un `id_token` de mentira (una clave de diccionario) a claims.

    No hereda de `VerificadorDeIdToken` a propósito: el router sólo llama
    `.verificar(...)`, nunca comprueba el tipo, así que esta clase no necesita
    ningún import de `app.*` a nivel de módulo.
    """

    def __init__(self, mapa: dict):
        self.mapa = mapa

    def verificar(self, id_token):
        return self.mapa.get(id_token)


def _claims(uid, email, verificado=True, proveedor="google.com", nombre=None):
    """Mismos atributos que `ClaimsVerificadas`, sin importar la clase real."""
    return SimpleNamespace(
        uid=uid, email=email, email_verificado=verificado, proveedor=proveedor, nombre=nombre,
    )


def _usar_verificador(client, mapa: dict):
    from app.services.firebase_tokens import get_verificador
    client.app.dependency_overrides[get_verificador] = lambda: FakeVerificador(mapa)


def _cab(token):
    return {"Authorization": f"Bearer {token}"}


def _invitar(client, admin, email, rol="worker"):
    r = client.post("/api/usuarios/invitar", json={"email": email, "rol": rol}, headers=admin)
    assert r.status_code == 200, r.text
    return r.json()


def _oauth(client, id_token, cliente=None):
    # Fase 3: `acepta_politica` va SIEMPRE en True acá — nada de lo que este
    # archivo prueba es sobre consentimiento (eso vive en
    # `test_consentimiento.py`), así que el gate nuevo no tiene por qué
    # interferir con un canje de invitación que antes de esta fase pasaba
    # sin pedir nada. Sin esto, cualquier test de acá que invite y entre por
    # primera vez se llevaría un 428 en lugar del 200/403/lo que sea que
    # prueba.
    body = {"id_token": id_token, "acepta_politica": True}
    if cliente is not None:
        body["cliente"] = cliente
    return client.post("/api/auth/oauth", json=body)


# ─── Helpers: JWKS y RSA de verdad, para las pruebas de verificación ───────────

def _rsa_par():
    priv = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    return priv, priv.public_key()


def _jwk(public_key, kid: str) -> dict:
    jwk = json.loads(RSAAlgorithm.to_jwk(public_key))
    jwk["kid"] = kid
    return jwk


def _transporte_fijo(keys: list[dict], cache_control: str = "max-age=3600", codigo: int = 200):
    cuerpo = json.dumps({"keys": keys}).encode()

    def _t(url):
        return codigo, cuerpo, cache_control

    return _t


def _verificador_real(claves_jwks: list[dict], project_id: str = PROJECT_ID, **kw):
    from app.services.firebase_tokens import VerificadorFirebase
    return VerificadorFirebase(project_id, transporte=_transporte_fijo(claves_jwks, **kw))


def _id_token_firmado(
    private_key,
    kid="k1",
    alg="RS256",
    project_id=PROJECT_ID,
    sub="uid-atacante",
    email="atacante@x.co",
    email_verified=True,
    provider="password",
    aud=None,
    iss=None,
    exp_delta=3600,
    iat_delta=0,
):
    ahora = int(time.time())
    payload = {
        "sub": sub,
        "email": email,
        "email_verified": email_verified,
        "firebase": {"sign_in_provider": provider},
        "iat": ahora + iat_delta,
        "exp": ahora + exp_delta,
        "aud": project_id if aud is None else aud,
        "iss": f"https://securetoken.google.com/{project_id}" if iss is None else iss,
    }
    return jwt.encode(payload, private_key, algorithm=alg, headers={"kid": kid})


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _token_hs256_manual(header: dict, payload: dict, secret: bytes) -> str:
    """Arma un JWT HS256 a mano, sin pasar por las validaciones de PyJWT.

    PyJWT 2.9 rechaza de entrada firmar HS256 con algo que parezca una clave
    PEM/asimétrica (`InvalidKeyError`) — una salvaguarda que un atacante de
    verdad no tiene por qué respetar: arma el JWT él mismo con HMAC crudo,
    exactamente lo que hace esta función.
    """
    h = _b64url(json.dumps(header, separators=(",", ":")).encode())
    p = _b64url(json.dumps(payload, separators=(",", ":")).encode())
    firma = hmac.new(secret, f"{h}.{p}".encode(), hashlib.sha256).digest()
    return f"{h}.{p}.{_b64url(firma)}"


# ════════════════════════════════════════════════════════════════════════════
# 503 sin configurar
# ════════════════════════════════════════════════════════════════════════════

def test_503_sin_firebase_project_id(client):
    """Sin la variable de entorno, /oauth se apaga solo. El resto sigue andando."""
    r = _oauth(client, "cualquier-cosa")
    assert r.status_code == 503
    assert "no configurado" in r.json()["detail"].lower()

    # El resto de la app funciona normal: el login legado, por ejemplo.
    assert client.post("/api/auth/login", json={"password": CLAVE_ADMIN}).status_code == 200


# ════════════════════════════════════════════════════════════════════════════
# El flujo de invitación → cuenta → JWT propio
# ════════════════════════════════════════════════════════════════════════════

def test_oauth_crea_usuario_por_invitacion_y_entra_al_cliente_correcto(client, admin):
    _invitar(client, admin, "nueva@x.co", rol="worker")

    _usar_verificador(client, {"tok-1": _claims("uid-1", "nueva@x.co")})
    r = _oauth(client, "tok-1")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["role"] == "worker"
    assert body["cliente"] == "galerias"
    assert body["email"] == "nueva@x.co"
    assert "token" in body

    # El JWT propio abre la app como cualquier worker.
    assert client.get("/api/spaces/", headers=_cab(body["token"])).status_code == 200


def test_owner_y_admin_de_membresia_mapean_a_role_admin(client, admin):
    for rol_membresia in ("owner", "admin"):
        email = f"{rol_membresia}@x.co"
        _invitar(client, admin, email, rol=rol_membresia)
        _usar_verificador(client, {"t": _claims(f"uid-{rol_membresia}", email)})
        r = _oauth(client, "t")
        assert r.status_code == 200, r.text
        assert r.json()["role"] == "admin"


def test_sin_membresia_ni_invitacion_da_403(client):
    _usar_verificador(client, {"t": _claims("uid-nadie", "nadie@x.co")})
    r = _oauth(client, "t")
    assert r.status_code == 403
    assert "invitación" in r.json()["detail"].lower()


def test_correo_no_verificado_por_password_da_401(client, admin):
    """Google ya viene verificado; correo/contraseña exige `email_verified`."""
    _invitar(client, admin, "sinverificar@x.co")
    _usar_verificador(client, {
        "t": _claims("uid-x", "sinverificar@x.co", verificado=False, proveedor="password"),
    })
    r = _oauth(client, "t")
    assert r.status_code == 401


def test_google_sin_email_verified_en_el_claim_igual_entra(client, admin):
    """Google no siempre manda `email_verified` en el claim, pero ya lo verificó él."""
    _invitar(client, admin, "google@x.co")
    _usar_verificador(client, {
        "t": _claims("uid-g", "google@x.co", verificado=False, proveedor="google.com"),
    })
    assert _oauth(client, "t").status_code == 200


def test_401_si_el_id_token_no_verifica(client):
    _usar_verificador(client, {})  # el falso no reconoce ningún token
    r = _oauth(client, "lo-que-sea")
    assert r.status_code == 401


# ─── Invitaciones vencidas o reusadas ──────────────────────────────────────────

def test_invitacion_vencida_no_sirve(client, admin):
    _invitar(client, admin, "tarde@x.co")
    from app.clientes import sesion_registro
    from app.models.identidad import Invitacion

    reg = sesion_registro()
    try:
        inv = reg.query(Invitacion).filter(Invitacion.email == "tarde@x.co").first()
        inv.expira_en = datetime.now(timezone.utc) - timedelta(days=1)
        reg.commit()
    finally:
        reg.close()

    _usar_verificador(client, {"t": _claims("uid-tarde", "tarde@x.co")})
    assert _oauth(client, "t").status_code == 403


def test_invitacion_ya_usada_no_se_reusa(client, admin):
    _invitar(client, admin, "una-vez@x.co")
    _usar_verificador(client, {"t": _claims("uid-1v", "una-vez@x.co")})
    assert _oauth(client, "t").status_code == 200

    # Si alguien más (u otro dispositivo) intenta canjear la MISMA invitación
    # con un firebase_uid distinto, ya no hay invitación pendiente que la
    # respalde y el usuario original ya existe con otro uid.
    _usar_verificador(client, {"t2": _claims("uid-otro", "una-vez@x.co", proveedor="password", verificado=False)})
    r = _oauth(client, "t2")
    # Correo sin verificar y sin invitación pendiente: no hay por dónde entrar.
    assert r.status_code in (401, 403)


def test_invitar_dos_veces_a_quien_ya_es_miembro_da_409(client, admin):
    _invitar(client, admin, "repetido@x.co", rol="worker")
    _usar_verificador(client, {"t": _claims("uid-rep", "repetido@x.co")})
    assert _oauth(client, "t").status_code == 200

    r = client.post("/api/usuarios/invitar", json={"email": "repetido@x.co", "rol": "admin"}, headers=admin)
    assert r.status_code == 409


# ════════════════════════════════════════════════════════════════════════════
# Multi-membresía
# ════════════════════════════════════════════════════════════════════════════

def test_multi_membresia_devuelve_la_lista_y_despues_entra_al_elegido(client, admin):
    from app.clientes import crear_cliente
    crear_cliente("otromarket", "Otro Market")

    _invitar(client, admin, "multi@x.co", rol="admin")  # en "galerias"

    otro_admin = _cab(
        client.post("/api/auth/login", json={"password": CLAVE_ADMIN, "cliente": "otromarket"}).json()["token"]
    )
    r = client.post("/api/usuarios/invitar", json={"email": "multi@x.co", "rol": "worker"}, headers=otro_admin)
    assert r.status_code == 200, r.text

    _usar_verificador(client, {"t": _claims("uid-multi", "multi@x.co")})

    primero = _oauth(client, "t")
    assert primero.status_code == 200
    assert primero.json().get("requiere_cliente") is True
    slugs = {m["cliente"] for m in primero.json()["membresias"]}
    assert slugs == {"galerias", "otromarket"}
    roles = {m["cliente"]: m["rol"] for m in primero.json()["membresias"]}
    assert roles == {"galerias": "admin", "otromarket": "worker"}

    elegido = _oauth(client, "t", cliente="otromarket")
    assert elegido.status_code == 200, elegido.text
    body = elegido.json()
    assert body["cliente"] == "otromarket"
    assert body["role"] == "worker"


def test_pedir_un_cliente_sin_membresia_ahi_da_403(client, admin):
    from app.clientes import crear_cliente
    crear_cliente("ajeno", "Ajeno")

    _invitar(client, admin, "acotado@x.co", rol="worker")
    _usar_verificador(client, {"t": _claims("uid-acot", "acotado@x.co")})
    r = _oauth(client, "t", cliente="ajeno")
    assert r.status_code == 403


# ════════════════════════════════════════════════════════════════════════════
# Revocación por request
# ════════════════════════════════════════════════════════════════════════════

def test_membresia_desactivada_da_401_en_el_siguiente_request(client, admin):
    _invitar(client, admin, "revocar@x.co", rol="worker")
    _usar_verificador(client, {"t": _claims("uid-rev", "revocar@x.co")})
    sesion = _oauth(client, "t").json()
    cab = _cab(sesion["token"])

    assert client.get("/api/spaces/", headers=cab).status_code == 200

    # El admin lo desactiva desde /api/usuarios.
    listado = client.get("/api/usuarios", headers=admin).json()
    usuario_id = next(m["id"] for m in listado["miembros"] if m["email"] == "revocar@x.co")
    r = client.patch(f"/api/usuarios/{usuario_id}", json={"activo": False}, headers=admin)
    assert r.status_code == 200, r.text

    # El PATCH invalida el caché: no hace falta esperar el TTL de 60s.
    assert client.get("/api/spaces/", headers=cab).status_code == 401

    # Reactivarlo lo devuelve.
    assert client.patch(f"/api/usuarios/{usuario_id}", json={"activo": True}, headers=admin).status_code == 200
    assert client.get("/api/spaces/", headers=cab).status_code == 200


def test_patch_sin_membresia_en_ese_cliente_da_404(client, admin):
    r = client.patch("/api/usuarios/999999", json={"activo": False}, headers=admin)
    assert r.status_code == 404


def test_no_se_puede_desactivar_al_ultimo_owner(client, admin):
    _invitar(client, admin, "unico-owner@x.co", rol="owner")
    _usar_verificador(client, {"t": _claims("uid-owner", "unico-owner@x.co")})
    assert _oauth(client, "t").status_code == 200

    listado = client.get("/api/usuarios", headers=admin).json()
    usuario_id = next(m["id"] for m in listado["miembros"] if m["email"] == "unico-owner@x.co")
    r = client.patch(f"/api/usuarios/{usuario_id}", json={"activo": False}, headers=admin)
    assert r.status_code == 409


def test_desactivar_un_owner_cuando_hay_otro_owner_activo_si_funciona(client, admin):
    for email in ("owner1@x.co", "owner2@x.co"):
        _invitar(client, admin, email, rol="owner")
        _usar_verificador(client, {"t": _claims(f"uid-{email}", email)})
        assert _oauth(client, "t").status_code == 200

    listado = client.get("/api/usuarios", headers=admin).json()
    id1 = next(m["id"] for m in listado["miembros"] if m["email"] == "owner1@x.co")
    assert client.patch(f"/api/usuarios/{id1}", json={"activo": False}, headers=admin).status_code == 200


# ════════════════════════════════════════════════════════════════════════════
# El dinero no viaja al worker por membresía (misma redacción que siempre)
# ════════════════════════════════════════════════════════════════════════════

def test_worker_por_membresia_no_ve_negotiatedvalue_ni_monthly_rent(client, admin):

    _invitar(client, admin, "mercaderista@x.co", rol="worker")
    _usar_verificador(client, {"t": _claims("uid-merc", "mercaderista@x.co")})
    worker_membresia = _cab(_oauth(client, "t").json()["token"])

    fixtures = [{
        "id": "f1", "code": "PUN-01", "type": "punta_gondola",
        "cx": 1.0, "cz": 1.0, "rotY": 0, "w": 1.2, "d": 0.6, "h": 1.8,
        "rentable": True, "label": "Punta 1", "negotiatedValue": 1_500_000,
    }]
    assert client.put(
        "/api/layout/NAVE", json={"fixtures": fixtures, "base_updated_at": None}, headers=admin,
    ).status_code == 200

    space_id = client.post(
        "/api/spaces/find-or-create",
        json={"code": "NAVE-PUN-01", "name": "Punta 1", "zone": "punta", "sede": "NAVE", "area_m2": 1.0},
        headers=admin,
    ).json()["id"]
    supplier_id = client.post("/api/suppliers/find-or-create", json={"name": "Alpina"}, headers=admin).json()["id"]
    hoy = hoy_en_colombia()
    assert client.post(
        f"/api/spaces/{space_id}/leases",
        json={
            "supplier_id": supplier_id, "marca": "Yogurt",
            "start_date": (hoy - timedelta(days=1)).isoformat(),
            "end_date": (hoy + timedelta(days=20)).isoformat(),
            "monthly_rent": 1_500_000,
        },
        headers=admin,
    ).status_code == 201

    # Exactamente lo mismo que un worker legado: sin plata, en ningún lado.
    legado_worker = _cab(
        client.post("/api/auth/login", json={"password": CLAVE_WORKER}).json()["token"]
    )
    for cab in (worker_membresia, legado_worker):
        espacio = client.get(f"/api/spaces/{space_id}", headers=cab).json()
        assert espacio["active_lease"]["monthly_rent"] is None

        layout = client.get("/api/layout/NAVE", headers=cab).json()
        assert "negotiatedValue" not in layout["fixtures"][0]

        # Donde vive la plata desde *Una sola verdad para lo comercial*: el
        # mapa que el navegador funde sobre el plano. El layout ya no la lleva
        # —el servidor la descarta al guardar— así que comprobarla sólo ahí
        # daría una seguridad que ya no significa nada.
        comercial = client.get("/api/spaces/comercial", headers=cab).json()
        assert comercial["NAVE-PUN-01"]["negotiatedValue"] == 0
        assert comercial["NAVE-PUN-01"]["supplierName"] == "Alpina"

        # La serie del canon (lo que quedó de `/dashboard/kpis`, que se fue el
        # 2026-10-30) es sólo de administración: al trabajador, ni la cifra.
        assert client.get("/api/dashboard/serie", headers=cab).status_code == 403

        assert client.get("/api/layout/rates", headers=cab).status_code == 403

    # El admin sí lo ve, por las dos vías que quedan.
    assert client.get("/api/spaces/comercial", headers=admin).json()[
        "NAVE-PUN-01"]["negotiatedValue"] == 1_500_000
    assert client.get(f"/api/spaces/{space_id}", headers=admin).json()["active_lease"]["monthly_rent"] == 1_500_000
    # Y el layout no se la guarda a NADIE: ésa era la segunda verdad.
    assert "negotiatedValue" not in client.get(
        "/api/layout/NAVE", headers=admin).json()["fixtures"][0]


def test_worker_por_membresia_no_entra_a_lo_nuevo_de_vender(client, admin):
    """El rediseño de Vender (docs/rediseno/vender-api.md) trajo plata nueva:
    el precio de una reserva, el cobro por ventas con sus cortes, la reserva de
    una cara entera y el proveedor que se completa. Nada de eso es del worker,
    tampoco por membresía."""
    _invitar(client, admin, "mercaderista2@x.co", rol="worker")
    _usar_verificador(client, {"t": _claims("uid-merc2", "mercaderista2@x.co")})
    worker_membresia = _cab(_oauth(client, "t").json()["token"])
    for url in ("/api/cobros", "/api/cobros/pendientes", "/api/reservas", "/api/suppliers/completar?prefijo=alp"):
        assert client.get(url, headers=worker_membresia).status_code == 403, url
    assert client.post("/api/contratos/vender?validar=1", json={}, headers=worker_membresia).status_code == 403
    assert client.post("/api/cobros/1/cortes", json={}, headers=worker_membresia).status_code == 403
    assert client.post("/api/reservas/1/confirmar", json={}, headers=worker_membresia).status_code == 403


# ════════════════════════════════════════════════════════════════════════════
# Cross-cliente: una membresía en A no abre B
# ════════════════════════════════════════════════════════════════════════════

def test_token_de_un_cliente_no_abre_la_base_de_otro(client, admin):
    from app.clientes import crear_cliente
    crear_cliente("vecino", "Vecino")

    _invitar(client, admin, "solo-galerias@x.co", rol="admin")
    _usar_verificador(client, {"t": _claims("uid-sg", "solo-galerias@x.co")})
    propio = _oauth(client, "t")
    assert propio.status_code == 200
    cab = _cab(propio.json()["token"])

    # Datos de "galerias".
    client.post("/api/suppliers/find-or-create", json={"name": "Alpina"}, headers=cab)

    admin_vecino = _cab(
        client.post("/api/auth/login", json={"password": CLAVE_ADMIN, "cliente": "vecino"}).json()["token"]
    )
    proveedores_vecino = [p["name"] for p in client.get("/api/suppliers/", headers=admin_vecino).json()]
    assert "Alpina" not in proveedores_vecino

    # Y un admin de "vecino" no ve la membresía de alguien en "galerias".
    r = client.get("/api/usuarios", headers=admin_vecino).json()
    assert all(m["email"] != "solo-galerias@x.co" for m in r["miembros"])


# ════════════════════════════════════════════════════════════════════════════
# Login legado — intacto
# ════════════════════════════════════════════════════════════════════════════

def test_login_legado_intacto_clave_buena(client):
    r = client.post("/api/auth/login", json={"password": CLAVE_ADMIN})
    assert r.status_code == 200
    body = r.json()
    assert set(body) == {"token", "role", "cliente", "cliente_nombre"}
    assert body["role"] == "admin"
    payload = jwt.decode(body["token"], options={"verify_signature": False})
    assert "sub" not in payload
    assert "email" not in payload
    assert set(payload) == {"role", "epoca", "cliente", "exp", "jti"}


def test_login_legado_intacto_clave_mala(client):
    r = client.post("/api/auth/login", json={"password": "no-es"})
    assert r.status_code == 401


def test_login_legado_intacto_con_epoca_invalidada(client, admin):
    token_viejo = client.post("/api/auth/login", json={"password": CLAVE_ADMIN}).json()["token"]
    assert client.get("/api/spaces/", headers=_cab(token_viejo)).status_code == 200

    r = client.put("/api/auth/passwords", json={"admin_password": "otra-clave-larga"}, headers=admin)
    assert r.status_code == 200

    assert client.get("/api/spaces/", headers=_cab(token_viejo)).status_code == 401
    assert client.post("/api/auth/login", json={"password": "otra-clave-larga"}).status_code == 200


# ════════════════════════════════════════════════════════════════════════════
# Gestión de usuarios: listado y orden de rutas
# ════════════════════════════════════════════════════════════════════════════

def test_listar_usuarios_incluye_miembros_e_invitaciones_pendientes(client, admin):
    _invitar(client, admin, "pendiente@x.co", rol="worker")
    _usar_verificador(client, {"t": _claims("uid-l", "activo@x.co")})
    _invitar(client, admin, "activo@x.co", rol="admin")
    assert _oauth(client, "t").status_code == 200

    r = client.get("/api/usuarios", headers=admin)
    assert r.status_code == 200, r.text
    body = r.json()
    assert {m["email"] for m in body["miembros"]} == {"activo@x.co"}
    assert {i["email"] for i in body["invitaciones"]} == {"pendiente@x.co"}


def test_usuarios_requiere_admin(client, worker):
    assert client.get("/api/usuarios", headers=worker).status_code == 403
    assert client.post(
        "/api/usuarios/invitar", json={"email": "x@x.co", "rol": "worker"}, headers=worker
    ).status_code == 403


def test_ruta_invitar_no_la_traga_la_parametrica(client, admin):
    """`/usuarios/invitar` es literal: tiene que ganarle a `/usuarios/{usuario_id}`."""
    r = client.post("/api/usuarios/invitar", json={"email": "orden@x.co", "rol": "worker"}, headers=admin)
    assert r.status_code == 200, r.text  # si la paramétrica la interceptara, sería 404 o 422


def test_invitar_rol_invalido_da_422(client, admin):
    r = client.post("/api/usuarios/invitar", json={"email": "x@x.co", "rol": "superadmin"}, headers=admin)
    assert r.status_code == 422


# ════════════════════════════════════════════════════════════════════════════
# Auditoría: el email del actor queda en la bitácora
# ════════════════════════════════════════════════════════════════════════════

def test_la_bitacora_registra_el_email_del_actor_con_cuenta_nueva(client, admin):
    """Sin tocar spaces.py: `espacio.estado` ya llama a `anotar` con el
    `Request` de siempre, y `require_auth` (en `app/auth.py`) es lo único que
    hizo falta cambiar para que el email quede en el `detalle`."""
    _invitar(client, admin, "auditado@x.co", rol="admin")
    _usar_verificador(client, {"t": _claims("uid-a", "auditado@x.co")})
    cab = _cab(_oauth(client, "t").json()["token"])

    space_id = client.post(
        "/api/spaces/find-or-create",
        json={"code": "NAVE-AUD-01", "name": "Auditoría", "zone": "z", "sede": "NAVE", "area_m2": 1.0},
        headers=cab,
    ).json()["id"]
    r = client.patch(f"/api/spaces/{space_id}/status", json={"status": "maintenance"}, headers=cab)
    assert r.status_code == 200, r.text

    # Y el login legado, que no tiene con qué, sigue sin email en el detalle.
    client.post("/api/auth/login", json={"password": CLAVE_ADMIN})

    entradas = client.get("/api/bitacora/", headers=admin).json()
    assert any(
        e["accion"] == "espacio.estado" and "auditado@x.co" in (e.get("detalle") or "")
        for e in entradas
    ), entradas

    # El propio /oauth anota su login con el email a propósito (mismo patrón
    # que cualquier otra acción con `sub`). El login LEGADO —el de la fixture
    # `admin` y el explícito de acá arriba— no tiene con qué: ninguno de esos
    # gana un "@" que antes no tenía.
    logins = [e for e in entradas if e["accion"] == "login.ok"]
    con_email = [e for e in logins if "@" in (e.get("detalle") or "")]
    assert [e["detalle"] for e in con_email] == ["auditado@x.co"]
    assert len(logins) - len(con_email) == 2  # la del fixture `admin` + la explícita


# ════════════════════════════════════════════════════════════════════════════
# Ataques contra la verificación real del ID token (sin red)
# ════════════════════════════════════════════════════════════════════════════

@pytest.fixture()
def _par_rsa():
    return _rsa_par()


def test_verifica_un_token_legitimo(_par_rsa):
    priv, pub = _par_rsa
    v = _verificador_real([_jwk(pub, "k1")])
    tok = _id_token_firmado(priv, kid="k1")
    claims = v.verificar(tok)
    assert claims is not None
    assert claims.uid == "uid-atacante"
    assert claims.email == "atacante@x.co"


def test_rechaza_alg_none(_par_rsa):
    priv, pub = _par_rsa
    v = _verificador_real([_jwk(pub, "k1")])
    payload = {
        "sub": "x", "email": "x@x.co", "email_verified": True,
        "aud": PROJECT_ID, "iss": f"https://securetoken.google.com/{PROJECT_ID}",
        "exp": int(time.time()) + 3600,
    }
    tok = jwt.encode(payload, key=None, algorithm="none", headers={"kid": "k1"})
    assert v.verificar(tok) is None


def test_rechaza_confusion_rs256_a_hs256(_par_rsa):
    """El ataque clásico: firmar HS256 usando la clave pública RSA como secreto.

    El JWT se arma a mano (`_token_hs256_manual`): PyJWT rechaza de entrada
    construir un token así con su API de alto nivel, pero un atacante de
    verdad no pasa por esa salvaguarda — arma el JWT él mismo. Lo que importa
    es que `VerificadorFirebase.verificar` lo rechace de todos modos, y lo
    hace ANTES de tocar el JWKS: mira el `alg` del header primero.
    """
    priv, pub = _par_rsa
    v = _verificador_real([_jwk(pub, "k1")])

    from cryptography.hazmat.primitives import serialization
    pem_publica = pub.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    ahora = int(time.time())
    header = {"alg": "HS256", "typ": "JWT", "kid": "k1"}
    payload = {
        "sub": "atacante", "email": "atacante@x.co", "email_verified": True,
        "aud": PROJECT_ID, "iss": f"https://securetoken.google.com/{PROJECT_ID}",
        "exp": ahora + 3600,
    }
    tok = _token_hs256_manual(header, payload, pem_publica)
    assert v.verificar(tok) is None


def test_rechaza_aud_ajena(_par_rsa):
    priv, pub = _par_rsa
    v = _verificador_real([_jwk(pub, "k1")])
    tok = _id_token_firmado(priv, kid="k1", aud="otro-proyecto-firebase")
    assert v.verificar(tok) is None


def test_rechaza_iss_ajeno(_par_rsa):
    priv, pub = _par_rsa
    v = _verificador_real([_jwk(pub, "k1")])
    tok = _id_token_firmado(priv, kid="k1", iss="https://securetoken.google.com/otro-proyecto")
    assert v.verificar(tok) is None


def test_rechaza_token_vencido(_par_rsa):
    priv, pub = _par_rsa
    v = _verificador_real([_jwk(pub, "k1")])
    tok = _id_token_firmado(priv, kid="k1", exp_delta=-120)  # más allá del leeway de 60 s
    assert v.verificar(tok) is None


def test_rechaza_kid_desconocido(_par_rsa):
    """Un `kid` que no está en el JWKS de Google — el caso de un proyecto ajeno."""
    priv, pub = _par_rsa
    otra_priv, _otra_pub = _rsa_par()
    v = _verificador_real([_jwk(pub, "k1")])
    tok = _id_token_firmado(otra_priv, kid="kid-que-no-existe")
    assert v.verificar(tok) is None


def test_rechaza_firma_alterada(_par_rsa):
    priv, pub = _par_rsa
    v = _verificador_real([_jwk(pub, "k1")])
    tok = _id_token_firmado(priv, kid="k1")
    manipulado = tok[:-4] + ("AAAA" if not tok.endswith("AAAA") else "BBBB")
    assert v.verificar(manipulado) is None


def test_rechaza_alg_rs384_aunque_el_header_lo_pida(_par_rsa):
    """Sólo RS256. Un algoritmo RSA distinto tampoco entra."""
    priv, pub = _par_rsa
    v = _verificador_real([_jwk(pub, "k1")])
    tok = _id_token_firmado(priv, kid="k1", alg="RS384")
    assert v.verificar(tok) is None


def test_sin_kid_en_el_header_no_verifica(_par_rsa):
    priv, pub = _par_rsa
    v = _verificador_real([_jwk(pub, "k1")])
    ahora = int(time.time())
    payload = {
        "sub": "x", "email": "x@x.co", "aud": PROJECT_ID,
        "iss": f"https://securetoken.google.com/{PROJECT_ID}", "exp": ahora + 3600,
    }
    tok = jwt.encode(payload, priv, algorithm="RS256")  # sin headers={"kid": ...}
    assert v.verificar(tok) is None


def test_el_cache_del_jwks_respeta_max_age_y_no_repite_la_bajada(_par_rsa):
    from app.services.firebase_tokens import VerificadorFirebase

    priv, pub = _par_rsa
    llamadas = {"n": 0}
    cuerpo = json.dumps({"keys": [_jwk(pub, "k1")]}).encode()

    def transporte(url):
        llamadas["n"] += 1
        return 200, cuerpo, "max-age=3600"

    v = VerificadorFirebase(PROJECT_ID, transporte=transporte)
    tok = _id_token_firmado(priv, kid="k1")
    assert v.verificar(tok) is not None
    assert v.verificar(tok) is not None
    assert llamadas["n"] == 1  # la segunda verificación usó el caché


def test_un_kid_nuevo_fuerza_un_refresco_pero_uno_solo(_par_rsa):
    """Rotación de claves: si el kid no está, se reintenta UNA vez — no en bucle."""
    from app.services.firebase_tokens import VerificadorFirebase

    priv1, pub1 = _par_rsa
    priv2, pub2 = _rsa_par()
    estado = {"claves": [_jwk(pub1, "k1")]}
    llamadas = {"n": 0}

    def transporte(url):
        llamadas["n"] += 1
        return 200, json.dumps({"keys": estado["claves"]}).encode(), "max-age=3600"

    v = VerificadorFirebase(PROJECT_ID, transporte=transporte)
    tok_1 = _id_token_firmado(priv1, kid="k1")
    assert v.verificar(tok_1) is not None
    assert llamadas["n"] == 1

    # Google rotó: ahora publica k2 y ya no firma con k1.
    estado["claves"] = [_jwk(pub2, "k2")]
    tok_2 = _id_token_firmado(priv2, kid="k2")
    assert v.verificar(tok_2) is not None
    assert llamadas["n"] == 2  # un refresco forzado, no más


def test_falla_de_red_no_rompe_devuelve_none(_par_rsa):
    from app.services.firebase_tokens import VerificadorFirebase

    priv, pub = _par_rsa

    def transporte_roto(url):
        raise OSError("Network is unreachable")

    v = VerificadorFirebase(PROJECT_ID, transporte=transporte_roto)
    tok = _id_token_firmado(priv, kid="k1")
    assert v.verificar(tok) is None  # no verificó, no revienta


def test_sin_project_id_get_verificador_da_none(client, monkeypatch):
    from app.services.firebase_tokens import get_verificador

    monkeypatch.delenv("FIREBASE_PROJECT_ID", raising=False)
    assert get_verificador() is None


def test_tolera_desfase_de_reloj_en_iat(_par_rsa):
    """Un token con `iat` 30 s "en el futuro" tiene que verificar: es el caso
    real de un servidor con el reloj apenas detrás del de Google — medido
    contra Firebase de verdad, 0.5 s de desfase bastaban para rechazar TODO
    login recién emitido con ImmatureSignatureError."""
    priv, pub = _par_rsa
    v = _verificador_real([_jwk(pub, "k1")])
    tok = _id_token_firmado(priv, kid="k1", iat_delta=30)
    claims = v.verificar(tok)
    assert claims is not None
    assert claims.uid == "uid-atacante"


def test_iat_muy_futuro_sigue_rechazado(_par_rsa):
    """La tolerancia es de reloj, no una puerta: un `iat` cinco minutos en el
    futuro (fuera del leeway de 60 s) se sigue rechazando."""
    priv, pub = _par_rsa
    v = _verificador_real([_jwk(pub, "k1")])
    tok = _id_token_firmado(priv, kid="k1", iat_delta=300)
    assert v.verificar(tok) is None
