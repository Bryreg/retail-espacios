"""Auditoría integral (post Fase 6) — dimensión 1+2: ingreso/login y aislamiento
multi-tenant + base de datos.

Mismo contrato de lectura que `test_identidad_ataques.py` y
`test_plataforma_ataques.py`:

* **Defensas que aguantan**: el ataque corre y falla. Evidencia de que se probó.
* **Caracterizaciones**: el sistema hace lo que el contrato dice y la
  consecuencia conviene tenerla escrita (pasan en verde).
* **Hallazgos abiertos**: `xfail(strict=True)` afirmando el comportamiento
  SEGURO. El día que se tape el agujero, XPASS pone la suite en rojo.

Los ids (`ingresos-N`) referencian `features/auditoria/outputs/ingresos.md`.

Todos los `import app.*` van ADENTRO de las funciones: el fixture `client`
purga `sys.modules['app.*']` entre pruebas.
"""
import ast
import base64
import json
import os
import subprocess
import time
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from jwt.algorithms import RSAAlgorithm

from conftest import CLAVE_ADMIN, CLAVE_WORKER

PROJECT_ID = "recabra-auditoria"


# ─── Utilidades (mismo estilo que los red-team previos) ───────────────────────

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


def _payload(token):
    return jwt.decode(token, options={"verify_signature": False})


def _fundar(client, uid, email, slug, nombre):
    _usar_verificador(client, {uid: _claims(uid, email)})
    r = client.post(
        "/api/clientes/alta",
        json={"id_token": uid, "slug": slug, "nombre": nombre, "acepta_politica": True},
    )
    assert r.status_code == 200, r.text
    return r.json()


def _sembrar_estado(estado: str, *, slug: str = "galerias", motivo: str = "Factura 0001 impaga"):
    from app import plataforma_estado
    from app.clientes import sesion_registro
    from app.models.plataforma import EstadoCliente

    reg = sesion_registro()
    try:
        fila = reg.query(EstadoCliente).filter(EstadoCliente.slug == slug).first()
        if fila is None:
            fila = EstadoCliente(slug=slug, estado=estado, motivo=motivo, cambiado_por="op@x.co")
            reg.add(fila)
        else:
            fila.estado, fila.motivo = estado, motivo
        fila.cambiado_en = datetime.now(timezone.utc)
        reg.commit()
    finally:
        reg.close()
    plataforma_estado.limpiar_cache_estado()


# ─── RSA / JWKS de verdad (el verificador real corre, sin tocar la red) ───────

def _rsa_par():
    priv = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    return priv, priv.public_key()


def _jwk(public_key, kid: str) -> dict:
    j = json.loads(RSAAlgorithm.to_jwk(public_key))
    j["kid"] = kid
    return j


def _transporte_fijo(keys: list[dict]):
    cuerpo = json.dumps({"keys": keys}).encode()

    def _t(url):
        return 200, cuerpo, "max-age=3600"

    return _t


def _verificador_real(claves, project_id=PROJECT_ID):
    from app.services.firebase_tokens import VerificadorFirebase
    return VerificadorFirebase(project_id, transporte=_transporte_fijo(claves))


def _id_token(priv, *, kid="k1", alg="RS256", aud=PROJECT_ID, iss=None,
              sub="uid-x", email="x@x.co", email_verified=True, provider="password",
              exp_delta=3600, iat_delta=0):
    ahora = int(time.time())
    payload = {
        "sub": sub, "email": email, "email_verified": email_verified,
        "firebase": {"sign_in_provider": provider},
        "iat": ahora + iat_delta, "exp": ahora + exp_delta,
        "aud": aud,
        "iss": iss if iss is not None else f"https://securetoken.google.com/{PROJECT_ID}",
    }
    return jwt.encode(payload, priv, algorithm=alg, headers={"kid": kid})


@pytest.fixture()
def par_rsa():
    return _rsa_par()


# ════════════════════════════════════════════════════════════════════════════
# HALLAZGOS ABIERTOS
# ════════════════════════════════════════════════════════════════════════════

# ════════════════════════════════════════════════════════════════════════════
# HALLAZGOS ARREGLADOS (eran xfail; el arreglo los dejó en verde)
# ════════════════════════════════════════════════════════════════════════════

def test_ingresos_1_un_bearer_basura_no_delata_el_estado_de_cuenta(client, admin):
    """ingresos-1 — ARREGLADO.

    El arreglo de R-1 sólo miraba si el pedido traía CREDENCIAL, no si esa
    credencial valía: `cliente_del_token(raw)` devuelve `None` tanto para
    «token nuestro sin claim cliente» como para «texto inventado», y con un
    solo cliente en la instalación —producción hoy— el segundo caso igual
    llamaba a `_aplicar_estado(unico(), request)`. Resultado: un anónimo con
    `Authorization: Bearer cualquier-cosa` recuperaba el oráculo que R-1 cerró
    (402 = ese supermercado dejó de pagar, 401 = está al día).

    El arreglo: `auth.token_verifica(raw)` decide. Sólo un token que FIRMAMOS
    nosotros y no venció llega a `_aplicar_estado`.
    """
    _sembrar_estado("suspendido")

    basura = _cab("no-soy-un-jwt")
    r = client.get("/api/spaces/", headers=basura)
    assert r.status_code == 401, (
        f"un anónimo con un token inventado leyó el estado de cuenta: {r.status_code} {r.text}"
    )

    _sembrar_estado("solo_lectura")
    r = client.post("/api/suppliers/", json={"name": "X"}, headers=basura)
    assert r.status_code == 401, (
        f"un anónimo con un token inventado leyó el estado de cuenta: {r.status_code} {r.text}"
    )


def test_ingresos_1b_las_otras_formas_de_credencial_invalida_tampoco_delatan(client, admin):
    """Las variantes del mismo ataque: un JWT bien formado firmado con OTRA
    clave, uno nuestro pero VENCIDO, y el `?token=` de la query (el camino
    lateral de `<img>`/`<iframe>`). Ninguno puede sacar un 402."""
    from app.auth import create_token

    _sembrar_estado("suspendido")

    ajeno = jwt.encode(
        {"role": "admin", "epoca": 0, "cliente": None,
         "exp": datetime.now(timezone.utc) + timedelta(hours=1)},
        "otra-clave-cualquiera", algorithm="HS256",
    )
    vencido = jwt.encode(
        {"role": "admin", "epoca": 0, "cliente": None,
         "exp": datetime.now(timezone.utc) - timedelta(hours=1)},
        os.environ["JWT_SECRET"], algorithm="HS256",
    )

    for etiqueta, tok in (("firmado con otra clave", ajeno), ("vencido", vencido),
                          ("basura", "xxx.yyy.zzz")):
        r = client.get("/api/spaces/", headers=_cab(tok))
        assert r.status_code == 401, f"({etiqueta}) {r.status_code} {r.text}"
        r = client.get("/api/spaces/", params={"token": tok})
        assert r.status_code == 401, f"({etiqueta}, por query) {r.status_code} {r.text}"

    # Control: NO se relajó nada. Un token NUESTRO y vigente de este único
    # cliente sigue recibiendo el 402 que le corresponde — incluso uno legado
    # sin claim `cliente`, que es el caso que el fallback `unico()` existe para
    # cubrir.
    legado = create_token("admin", 0, None)
    assert _payload(legado)["cliente"] is None
    r = client.get("/api/spaces/", headers=_cab(legado))
    assert r.status_code == 402, (
        f"se relajó el interruptor de cobranza: un token válido pasó con {r.status_code}"
    )
    # Y el admin con su token normal (claim `cliente` puesto), también.
    r = client.get("/api/spaces/", headers=admin)
    assert r.status_code == 402, r.text


def test_ingresos_2_las_exenciones_del_interruptor_tienen_frontera_de_segmento(client):
    """ingresos-2 — ARREGLADO.

    `_EXENTOS_EN_SOLO_LECTURA` y `_EXENTOS_POR_HABEAS_DATA` se comparaban con
    `str.startswith` SIN frontera de segmento — el mismo defecto que H-3 obligó
    a arreglar para `/api/plataforma`. Ahora las tres comparaciones pasan por
    `clientes._path_bajo`, que exige igualdad o prefijo + barra.
    """
    from app import clientes

    class _Req:
        def __init__(self, path, metodo="POST"):
            self.url = SimpleNamespace(path=path)
            self.method = metodo

    _sembrar_estado("solo_lectura")
    cli = clientes.buscar("galerias")

    def _corta(path, metodo="POST"):
        try:
            clientes._aplicar_estado(cli, _Req(path, metodo))
        except Exception as e:
            assert getattr(e, "status_code", None) == 402, (path, e)
            return True
        return False

    # Lo que SIGUE exento: el prefijo exacto y sus hijos.
    for exento in ("/api/auth", "/api/auth/login", "/api/usuarios", "/api/usuarios/invitar",
                   "/api/clientes/mi-export", "/api/clientes/solicitar-supresion",
                   "/api/auth/aceptar-politica"):
        assert not _corta(exento), f"{exento} dejó de estar exento (regresión)"

    # Lo que NO puede heredar la exención por parecerse al prefijo.
    for impostor in ("/api/authorizaciones/emitir", "/api/authx", "/api/usuariosx",
                     "/api/usuarios-externos/alta", "/api/clientes/mi-exportacion"):
        assert _corta(impostor), f"{impostor} se coló por una exención de prefijo suelto"

    # Y la de plataforma, que ya tenía frontera, sigue teniéndola.
    assert clientes._es_path_de_plataforma("/api/plataforma")
    assert clientes._es_path_de_plataforma("/api/plataforma/clientes")
    assert not clientes._es_path_de_plataforma("/api/plataformazo")


# ════════════════════════════════════════════════════════════════════════════
# CARACTERIZACIONES (pasan; el informe las cita)
# ════════════════════════════════════════════════════════════════════════════

def test_ingresos_3_el_leeway_de_60s_tambien_alarga_el_exp(par_rsa, capsys):
    """`leeway=60` en `firebase_tokens.py` no distingue `iat` de `exp`: un ID
    token VENCIDO hace menos de 60 s sigue verificando. Está documentado en el
    propio comentario del código; queda medido acá."""
    priv, pub = par_rsa
    v = _verificador_real([_jwk(pub, "k1")])

    vencido_30 = v.verificar(_id_token(priv, exp_delta=-30))
    vencido_120 = v.verificar(_id_token(priv, exp_delta=-120))

    print(f"\nexp hace 30 s  -> {'VERIFICA' if vencido_30 else 'rechaza'}")
    print(f"exp hace 120 s -> {'VERIFICA' if vencido_120 else 'rechaza'}")

    assert vencido_30 is not None, "el leeway ya no aplica a exp (cambió el contrato)"
    assert vencido_120 is None, "el leeway se agrandó: un token vencido 2 min entra"


def test_ingresos_4_h5_la_clave_worker_del_cliente_por_defecto_mata_al_operador(
    client, admin, monkeypatch
):
    """H-5, caracterización (no xfail): el admin del cliente que vive en la BASE
    POR DEFECTO le cierra la sesión al operador de la plataforma cambiando la
    contraseña de `worker` de SU PROPIO supermercado. El token de consola nace
    con `epoca_de(registro, "worker")` y `require_auth` la revalida contra esa
    misma base."""
    monkeypatch.setenv("OPERADOR_EMAILS", "op@recabra.co")

    # El operador entra a la consola: sin membresías -> token cliente=plataforma.
    _usar_verificador(client, {"tok-op": _claims("uid-op", "op@recabra.co")})
    r = client.post("/api/auth/oauth", json={"id_token": "tok-op", "acepta_politica": True})
    assert r.status_code == 200, r.text
    cuerpo = r.json()
    assert cuerpo.get("plataforma") is True, cuerpo
    assert _payload(cuerpo["token"])["cliente"] == "plataforma"
    op = _cab(cuerpo["token"])

    assert client.get("/api/plataforma/clientes", headers=op).status_code == 200

    # El admin de GALERIAS (la base por defecto) cambia la clave de SU worker.
    r = client.put("/api/auth/passwords", json={"worker_password": "otra-clave-larga"}, headers=admin)
    assert r.status_code == 200, r.text

    r = client.get("/api/plataforma/clientes", headers=op)
    assert r.status_code == 401, (
        f"H-5 dejó de reproducirse (¿se le dio época propia al token de consola?): {r.status_code}"
    )


def test_ingresos_5_un_token_viejo_sin_cliente_no_se_cae_a_uno_arbitrario(client, admin):
    """`unico()` como fallback: con DOS clientes, un token emitido antes del
    multi-tenant (sin claim `cliente`) NO abre ninguna base."""
    from app.auth import create_token

    _fundar(client, "uid-f", "funda@x.co", "segundito", "Segundito")

    viejo = create_token("admin", 0, None)
    assert _payload(viejo)["cliente"] is None

    for ruta in ("/api/spaces/", "/api/spaces/comercial", "/api/layout/", "/api/suppliers/"):
        r = client.get(ruta, headers=_cab(viejo))
        assert r.status_code == 401, f"{ruta} abrió una base con un token sin cliente: {r.status_code}"


# ════════════════════════════════════════════════════════════════════════════
# DEFENSAS QUE AGUANTAN
# ════════════════════════════════════════════════════════════════════════════

def test_ingresos_6_un_token_de_otro_proyecto_firebase_no_entra(par_rsa):
    """El JWKS de `securetoken` es COMPARTIDO por todos los proyectos Firebase:
    la misma clave (mismo `kid`, firma válida) firma los tokens de cualquiera.
    Lo único que separa un proyecto de otro es `aud`/`iss`, y los dos se validan
    por parámetro en `jwt.decode` — cinturón y tirantes."""
    priv, pub = par_rsa
    v = _verificador_real([_jwk(pub, "k1")])

    # Bien firmado por LA MISMA clave del JWKS, pero de otro proyecto.
    ajeno = _id_token(
        priv, kid="k1", aud="proyecto-del-atacante",
        iss="https://securetoken.google.com/proyecto-del-atacante",
        email="victima@x.co",
    )
    assert v.verificar(ajeno) is None

    # Sólo el `aud` cambiado (el `iss` correcto): tampoco.
    assert v.verificar(_id_token(priv, kid="k1", aud="proyecto-del-atacante")) is None
    # Sólo el `iss` cambiado (el `aud` correcto): tampoco.
    assert v.verificar(
        _id_token(priv, kid="k1", iss="https://securetoken.google.com/otro")
    ) is None
    # `iss` de un emisor que no es securetoken, con aud correcto: tampoco.
    assert v.verificar(_id_token(priv, kid="k1", iss="https://accounts.google.com")) is None

    # Control: el legítimo sí verifica (si no, los asserts de arriba no prueban nada).
    assert v.verificar(_id_token(priv, kid="k1")) is not None


def test_ingresos_7_ningun_router_cruza_de_cliente(client, admin):
    """Cross-tenant a lo ancho: A y B con datos distintos; el token de A no ve
    NADA de B por ningún router, y cambiarle una letra al claim `cliente` del
    token (que va firmado) lo rompe entero."""
    # B = cliente nuevo, fundado por su owner.
    cuerpo_b = _fundar(client, "uid-b", "owner-b@x.co", "supermercadob", "Super B")
    b = _cab(cuerpo_b["token"])

    # Un proveedor y un espacio que sólo existen en B.
    r = client.post("/api/suppliers/", json={"name": "PROVEEDOR-SOLO-DE-B"}, headers=b)
    assert r.status_code in (200, 201), r.text
    r = client.post(
        "/api/spaces/find-or-create",
        json={"svg_id": "solo-b", "code": "BBB-99", "sede": "NAVE"},
        headers=b,
    )
    assert r.status_code in (200, 201), r.text

    # A = galerías, con su admin legado.
    lecturas = [
        "/api/spaces/", "/api/spaces/comercial", "/api/suppliers/", "/api/layout/",
        "/api/dashboard/serie", "/api/dashboard/serie", "/api/mounts/",
        "/api/catalogo/", "/api/bitacora/", "/api/files/1", "/api/notifications/config",
    ]
    for ruta in lecturas:
        r = client.get(ruta, headers=admin)
        assert "PROVEEDOR-SOLO-DE-B" not in r.text, f"{ruta} filtró un proveedor de B"
        assert "BBB-99" not in r.text, f"{ruta} filtró un espacio de B"

    # Y al revés: el token de B tampoco ve lo de A.
    r = client.post("/api/suppliers/", json={"name": "PROVEEDOR-SOLO-DE-A"}, headers=admin)
    assert r.status_code in (200, 201), r.text
    for ruta in lecturas:
        r = client.get(ruta, headers=b)
        assert "PROVEEDOR-SOLO-DE-A" not in r.text, f"{ruta} filtró un proveedor de A a B"

    # Una letra del claim `cliente` cambiada: el token deja de valer entero.
    crudo = cuerpo_b["token"]
    cab, pay, firma = crudo.split(".")
    datos = json.loads(base64.urlsafe_b64decode(pay + "=" * (-len(pay) % 4)))
    datos["cliente"] = "galerias"
    nuevo_pay = base64.urlsafe_b64encode(
        json.dumps(datos, separators=(",", ":")).encode()
    ).rstrip(b"=").decode()
    falso = f"{cab}.{nuevo_pay}.{firma}"
    r = client.get("/api/spaces/", headers=_cab(falso))
    assert r.status_code == 401, f"un claim `cliente` reescrito abrió otra base: {r.status_code}"


def test_ingresos_8_el_token_de_consola_no_abre_ninguna_base_de_negocio(client, monkeypatch):
    """`cliente="plataforma"` sólo resuelve bajo `/api/plataforma/*` — por
    construcción, no por lista de excepciones. Se prueba también por el camino
    lateral del `?token=` (el que usan `<img>` e `<iframe>`)."""
    _fundar(client, "uid-op", "op@recabra.co", "operadora", "Operadora")
    monkeypatch.setenv("OPERADOR_EMAILS", "op2@recabra.co")
    _usar_verificador(client, {"t": _claims("uid-op2", "op2@recabra.co")})
    r = client.post("/api/auth/oauth", json={"id_token": "t", "acepta_politica": True})
    assert r.status_code == 200, r.text
    tok = r.json()["token"]
    assert _payload(tok)["cliente"] == "plataforma"

    for ruta in ("/api/spaces/", "/api/spaces/comercial", "/api/layout/", "/api/suppliers/",
                 "/api/dashboard/serie", "/api/files/1", "/api/bitacora/", "/api/usuarios"):
        r = client.get(ruta, headers=_cab(tok))
        assert r.status_code == 401, f"el token de consola abrió {ruta}: {r.status_code}"
        r = client.get(ruta, params={"token": tok})
        assert r.status_code == 401, f"el token de consola abrió {ruta} por query: {r.status_code}"

    # Y un prefijo que sólo se le PARECE a /api/plataforma tampoco resuelve.
    r = client.get("/api/plataformazo", headers=_cab(tok))
    assert r.status_code in (401, 404), r.status_code


def test_ingresos_9_el_freno_por_ip_no_se_esquiva_con_x_forwarded_for(client):
    """`/oauth` y `/alta` usan el mismo `ip_del_cliente` que el login legado: la
    cadena se lee de DERECHA a izquierda, así que lo que el atacante escribe
    adelante no le da intentos nuevos."""
    _usar_verificador(client, {})  # ningún id_token verifica: todo es fallo

    def _oauth(i):
        return client.post(
            "/api/auth/oauth",
            json={"id_token": f"malo-{i}", "acepta_politica": True},
            headers={"X-Forwarded-For": f"10.0.0.{i}, 200.9.9.9"},
        )

    codigos = [_oauth(i).status_code for i in range(12)]
    assert 429 in codigos, f"el freno de /oauth se esquivó con X-Forwarded-For: {codigos}"

    def _alta(i):
        return client.post(
            "/api/clientes/alta",
            json={"id_token": f"malo-{i}", "slug": f"nuevo{i}", "nombre": "N",
                  "acepta_politica": True},
            headers={"X-Forwarded-For": f"10.1.1.{i}, 200.8.8.8"},
        )

    codigos = [_alta(i).status_code for i in range(12)]
    assert 429 in codigos, f"el freno del alta se esquivó con X-Forwarded-For: {codigos}"


def test_ingresos_10_la_invitacion_no_cruza_de_cliente_ni_sobrevive_al_vencimiento(client, admin):
    """Una invitación es de UN cliente: canjearla no da acceso a otro, y una
    vencida no da acceso a ninguno."""
    from app.clientes import sesion_registro
    from app.models.identidad import Invitacion, Membresia

    _fundar(client, "uid-b", "owner-b@x.co", "supermercadob", "Super B")

    # GALERIAS invita a alguien.
    r = client.post("/api/usuarios/invitar", json={"email": "peon@x.co", "rol": "worker"},
                    headers=admin)
    assert r.status_code == 200, r.text

    _usar_verificador(client, {"tp": _claims("uid-peon", "peon@x.co")})
    r = client.post("/api/auth/oauth", json={"id_token": "tp", "acepta_politica": True})
    assert r.status_code == 200, r.text
    assert r.json()["cliente"] == "galerias"

    # Pedir el OTRO cliente con esa misma cuenta: 403, no membresía inventada.
    r = client.post("/api/auth/oauth",
                    json={"id_token": "tp", "cliente": "supermercadob", "acepta_politica": True})
    assert r.status_code == 403, r.text

    reg = sesion_registro()
    try:
        slugs = {m.cliente_slug for m in reg.query(Membresia).filter(
            Membresia.usuario_id == _payload(
                client.post("/api/auth/oauth",
                            json={"id_token": "tp", "acepta_politica": True}).json()["token"]
            )["sub"]
        ).all()}
    finally:
        reg.close()
    assert slugs == {"galerias"}, f"el canje cruzó de cliente: {slugs}"

    # Una invitación VENCIDA no se canjea (y la cuenta nueva se queda afuera).
    r = client.post("/api/usuarios/invitar", json={"email": "tarde@x.co", "rol": "worker"},
                    headers=admin)
    assert r.status_code == 200, r.text
    reg = sesion_registro()
    try:
        fila = reg.query(Invitacion).filter(Invitacion.email == "tarde@x.co").first()
        fila.expira_en = datetime.now(timezone.utc) - timedelta(days=1)
        reg.commit()
    finally:
        reg.close()
    _usar_verificador(client, {"tt": _claims("uid-tarde", "tarde@x.co")})
    r = client.post("/api/auth/oauth", json={"id_token": "tt", "acepta_politica": True})
    assert r.status_code == 403, f"una invitación vencida entró: {r.status_code} {r.text}"


def test_ingresos_11_el_enlace_de_montaje_no_cruza_de_cliente_ni_sobrevive_vencido(client, admin):
    """El token de montaje lleva su `cliente` adentro de lo firmado y su propio
    vencimiento. Ninguno de los dos se puede mover desde afuera."""
    from app.auth import create_mount_token

    _fundar(client, "uid-b", "owner-b@x.co", "supermercadob", "Super B")

    # Un token de montaje de B, presentado contra el sistema: sólo abre B.
    tok_b = create_mount_token("NAVE-BBB-99", cliente="supermercadob")
    tok_vencido = create_mount_token("NAVE-BBB-99", cliente="supermercadob", days=-1)
    tok_sin_cliente = create_mount_token("NAVE-BBB-99", cliente=None)

    r = client.get("/api/montaje/mi-espacio", params={"token": tok_vencido})
    assert r.status_code == 401, f"un enlace de montaje vencido sigue abriendo: {r.status_code}"

    # Sin `cliente` y con DOS clientes en el sistema no hay a qué caerse.
    r = client.get("/api/montaje/mi-espacio", params={"token": tok_sin_cliente})
    assert r.status_code == 401, (
        f"un enlace de montaje sin cliente se cayó a un cliente arbitrario: {r.status_code}"
    )

    # El de B abre la base de B: nada de A puede aparecer ahí.
    r = client.get("/api/montaje/mi-espacio", params={"token": tok_b})
    assert r.status_code == 200, r.text
    assert "PROVEEDOR" not in r.text.upper() or r.json().get("proveedor") == "", r.text

    # Y el token de montaje jamás entra por la puerta general (`require_auth`).
    for ruta in ("/api/spaces/", "/api/layout/", "/api/suppliers/"):
        assert client.get(ruta, headers=_cab(tok_b)).status_code == 401, ruta


def test_ingresos_12_sin_columnas_nuevas_en_tablas_preexistentes(client):
    """SIN MIGRACIONES: `create_all()` crea tablas, nunca columnas. Se compara
    por AST el `backend/app/models/` de 6dd2f4c (cierre de Fase 3/4 temprana)
    contra HEAD: ninguna tabla que ya existía puede haber ganado una columna."""
    raiz = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    if not os.path.isdir(os.path.join(raiz, ".git")):
        pytest.skip("no es un checkout de git")

    def _columnas(fuente: str) -> dict[str, set[str]]:
        arbol = ast.parse(fuente)
        salida: dict[str, set[str]] = {}
        for nodo in ast.walk(arbol):
            if not isinstance(nodo, ast.ClassDef):
                continue
            tabla, cols = None, set()
            for cuerpo in nodo.body:
                if not isinstance(cuerpo, ast.Assign) or not cuerpo.targets:
                    continue
                destino = cuerpo.targets[0]
                if not isinstance(destino, ast.Name):
                    continue
                if destino.id == "__tablename__" and isinstance(cuerpo.value, ast.Constant):
                    tabla = cuerpo.value.value
                elif (isinstance(cuerpo.value, ast.Call)
                      and isinstance(cuerpo.value.func, ast.Name)
                      and cuerpo.value.func.id in ("Column", "mapped_column")):
                    cols.add(destino.id)
            if tabla:
                salida[tabla] = cols
        return salida

    archivos = ["models.py", "identidad.py", "plataforma.py", "consentimiento.py", "supresion.py"]
    viejo: dict[str, set[str]] = {}
    nuevo: dict[str, set[str]] = {}
    for nombre in archivos:
        ruta = f"backend/app/models/{nombre}"
        try:
            fuente_vieja = subprocess.run(
                ["git", "show", f"6dd2f4c:{ruta}"], cwd=raiz,
                capture_output=True, text=True, check=True,
            ).stdout
        except subprocess.CalledProcessError:
            continue
        viejo.update(_columnas(fuente_vieja))
        with open(os.path.join(raiz, ruta), encoding="utf-8") as f:
            nuevo.update(_columnas(f.read()))

    assert viejo, "no se pudo leer el modelo viejo: el test no probaría nada"
    crecidas = {
        tabla: sorted(nuevo[tabla] - cols)
        for tabla, cols in viejo.items()
        if tabla in nuevo and nuevo[tabla] - cols
    }
    assert not crecidas, (
        "tablas preexistentes con columnas nuevas — en producción NO existen: "
        f"{crecidas}"
    )


def test_ingresos_13_ninguna_credencial_valida_entra_a_un_cliente_inactivo(client, admin):
    """Desactivar un cliente en el registro cierra la puerta en el pedido
    siguiente, por los TRES caminos: JWT propio, login legado y `?token=`."""
    from app.clientes import sesion_registro
    from app.models.models import ClienteRow

    cuerpo = _fundar(client, "uid-b", "owner-b@x.co", "supermercadob", "Super B")
    b = _cab(cuerpo["token"])
    assert client.get("/api/spaces/", headers=b).status_code == 200

    reg = sesion_registro()
    try:
        reg.query(ClienteRow).filter(ClienteRow.slug == "supermercadob").first().activo = False
        reg.commit()
    finally:
        reg.close()

    assert client.get("/api/spaces/", headers=b).status_code == 401
    assert client.get("/api/spaces/", params={"token": cuerpo["token"]}).status_code == 401
    r = client.post("/api/auth/login", json={"password": CLAVE_ADMIN, "cliente": "supermercadob"})
    assert r.status_code == 401, r.text
    r = client.post("/api/auth/oauth",
                    json={"id_token": "uid-b", "cliente": "supermercadob", "acepta_politica": True})
    assert r.status_code in (401, 403), r.text


def test_ingresos_14_la_misma_clave_legada_en_dos_clientes_no_los_cruza(client, admin):
    """Las contraseñas del login legado son POR BASE. Entrar a A con la clave de
    A no da un token que abra B, aunque las dos claves sean idénticas."""
    _fundar(client, "uid-b", "owner-b@x.co", "supermercadob", "Super B")

    # Se le pone a B la MISMA clave de admin que tiene GALERIAS.
    from app.auth import guardar_clave
    from app.clientes import buscar, sesion_de

    cli_b = buscar("supermercadob")
    s = sesion_de(cli_b)
    try:
        guardar_clave(s, "admin", CLAVE_ADMIN)
        s.commit()
    finally:
        s.close()

    r = client.post("/api/auth/login", json={"password": CLAVE_ADMIN, "cliente": "galerias"})
    assert r.status_code == 200, r.text
    tok_a = r.json()["token"]
    assert _payload(tok_a)["cliente"] == "galerias"

    r = client.post("/api/auth/login", json={"password": CLAVE_ADMIN, "cliente": "supermercadob"})
    assert r.status_code == 200, r.text
    assert _payload(r.json()["token"])["cliente"] == "supermercadob"

    # Sin `cliente` en el cuerpo y con dos clientes: hay que elegir.
    r = client.post("/api/auth/login", json={"password": CLAVE_ADMIN})
    assert r.status_code == 422, r.text


def test_ingresos_15_una_falla_de_infraestructura_del_alta_se_disfraza_de_slug_tomado(
    client, monkeypatch
):
    """`routers/alta.py` mapea TODO `ErrorDeAlta` a 409 «Ese código ya está
    tomado». Pero `crear_cliente` levanta ese mismo error cuando el usuario de
    Postgres NO TIENE PERMISO para `CREATE DATABASE` — el caso probable en
    Render, donde la base la crea el panel y el rol de la app no es superusuario.
    El fundador ve «probá con otro código» y prueba slugs para siempre, mientras
    cada intento deja un `Usuario` huérfano (R-4) y ninguna línea que diga qué
    pasó de verdad."""
    from app.clientes import sesion_registro
    from app.models.identidad import Usuario
    from app.models.plataforma import Fundacion

    import app.routers.alta as alta_mod
    from app.clientes import ErrorDeAlta

    def _sin_permiso(slug, nombre):
        raise ErrorDeAlta(
            "No se pudo crear la base del cliente: permission denied to create database. "
            "Suele ser que el usuario de Postgres no tiene permiso para crear bases."
        )

    monkeypatch.setattr(alta_mod, "crear_cliente", _sin_permiso)
    _usar_verificador(client, {"t": _claims("uid-f", "funda@x.co")})
    r = client.post(
        "/api/clientes/alta",
        json={"id_token": "t", "slug": "nuevomercado", "nombre": "Nuevo", "acepta_politica": True},
    )

    print(f"\nalta con CREATE DATABASE denegado -> {r.status_code} {r.text}")
    assert r.status_code == 409
    assert "tomado" in r.text, r.text
    assert "permission" not in r.text and "permiso" not in r.text

    reg = sesion_registro()
    try:
        huerfanos = [
            u.email for u in reg.query(Usuario).all()
            if reg.query(Fundacion).filter(Fundacion.usuario_id == u.id).count() == 0
        ]
    finally:
        reg.close()
    assert "funda@x.co" in huerfanos, (
        "R-4 dejó de reproducirse: el alta fallida ya no deja usuario huérfano"
    )


def test_ingresos_16_las_tablas_del_registro_que_crecen_tienen_purga(client):
    """ingresos-5 = frontera-4, ARREGLADO en la misma auditoría: `audit_log`
    se purga (`services/bitacora.py::purgar`) y ahora también el registro
    (`plataforma_tendencia.purgar_registro`: `bitacora_plataforma` por
    antigüedad, `intentos_alta` viejos, filas POR CLIENTE de
    `snapshot_metricas` fuera de la ventana; la fila `__consolidado__` nunca).
    La purga corre al final de `cerrar_mes_anterior`, que el ciclo de
    mantenimiento dispara en cada vuelta. La versión original de este test
    afirmaba la AUSENCIA de purga con patrones de string que dejaron de
    matchear y quedó "verde" diciendo algo falso (verif-2); este fija la
    presencia por el objeto real, no por grep. El test funcional de la purga
    es `test_auditoria_frontera.py::test_f08`."""
    import inspect

    from app import plataforma_tendencia
    from app.services import bitacora

    assert callable(getattr(bitacora, "purgar", None)), "se cayó la purga de audit_log (regresión)"
    assert callable(getattr(plataforma_tendencia, "purgar_registro", None)), (
        "desapareció purgar_registro: bitacora_plataforma volvería a crecer sin tope"
    )
    fuente_cierre = inspect.getsource(plataforma_tendencia.cerrar_mes_anterior)
    assert "purgar_registro()" in fuente_cierre, (
        "cerrar_mes_anterior ya no llama a purgar_registro: la purga existe pero nadie la dispara"
    )
