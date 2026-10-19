"""Red team de la Fase 3 — Compliance: tests de ATAQUE, no de funcionalidad.

Sucesor directo de ``tests/test_plataforma_ataques.py`` (Fase 2) y
``tests/test_identidad_ataques.py`` (Fase 1): misma disciplina, mismo contrato
de lectura, mismo patrón técnico (``FakeVerificador`` vía
``dependency_overrides``, todos los ``import app.*`` ADENTRO de las funciones
porque el fixture ``client`` de ``conftest.py`` purga ``sys.modules['app.*']``
entre pruebas).

Esta fase abrió CANALES DE SALIDA de datos. Se atacan seis superficies:

1. **El export del owner** — el único endpoint del sistema que serializa una
   base de negocio entera en un JSON. Se ataca por quién lo pide (worker,
   admin legado, admin-no-owner, owner de OTRO cliente) y por qué sale adentro
   (IPs de terceros sembradas a propósito, hashes de claves, tablas de
   intentos, el motivo del operador).
2. **El consentimiento como oráculo** — un 428 nuevo en la puerta de
   ``/oauth``. Se ataca preguntando si distingue algo que un anónimo no
   debería poder distinguir, y si el campo ``acepta_politica`` se puede
   satisfacer con un valor que no es una aceptación.
3. **La supresión** — quién crea, quién lee, y si algo se borra de verdad.
4. **Las cabeceras** — que estén en TODA respuesta, incluidos los errores que
   no pasan por ningún router, y que HSTS no se mande sin TLS.
5. **El fix H8** (contrato como imagen) — por el borde. En Iteración 2 el fix
   pasó de la heurística "la imagen más reciente" a una DESIGNACIÓN explícita
   (``uso=cara`` → tabla ``SpaceFace``), así que se ataca el diseño nuevo:
   designar un PDF, designar de un espacio a otro, inyectar el prefijo de
   montaje desde el nombre del archivo subido, y reusar el rowid de una cara
   borrada.
6. **La página pública de la política** — que los tres documentos legales
   lleven el encabezado de BORRADOR.

Tres clases de test, igual que en las fases anteriores:

* **Defensas que aguantan**: el ataque se ejecuta y falla.
* **Caracterizaciones**: el sistema hace lo que el contrato dice y esa
  consecuencia conviene tenerla escrita.
* **Hallazgos abiertos**, marcados ``xfail(strict=True)``: afirman el
  comportamiento SEGURO, que hoy no se cumple. El día que se tape el agujero
  el test pasa a XPASS y la suite se pone en rojo — el recordatorio de sacarle
  el marcador.

El identificador (``X-n``) de cada test referencia el informe
``features/compliance/outputs/red-team-exfiltracion.md``.
"""
import io
from types import SimpleNamespace

import pytest

from conftest import CLAVE_ADMIN, CLAVE_WORKER

MENSAJE_NO_OWNER = "Solo el owner del cliente puede hacer esto."
NO_OPERADOR = "Solo para operadores de la plataforma."

# IPs públicas y reconocibles que se siembran a propósito en la bitácora del
# cliente y en los frenos del registro, para después buscarlas en el texto
# crudo del export.
IP_BITACORA = "203.0.113.77"
IP_FRENO = "198.51.100.42"
IP_CONSENT = "192.0.2.31"


# ─── Utilidades ────────────────────────────────────────────────────────────────

class FakeVerificador:
    """Traduce un ``id_token`` de mentira (clave del diccionario) a claims."""

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


def _alta(client, id_token, slug, nombre, *, acepta=True, ip=None):
    cuerpo = {"id_token": id_token, "slug": slug, "nombre": nombre}
    if acepta is not None:
        cuerpo["acepta_politica"] = acepta
    cabeceras = {"X-Forwarded-For": ip} if ip else {}
    return client.post("/api/clientes/alta", json=cuerpo, headers=cabeceras)


def _fundar(client, uid, email, slug, nombre, *, ip=None):
    """Funda un cliente por el alta self-service — el fundador nace owner."""
    _usar_verificador(client, {uid: _claims(uid, email)})
    r = _alta(client, uid, slug, nombre, ip=ip)
    assert r.status_code == 200, r.text
    return _cab(r.json()["token"])


def _invitar_y_entrar(client, owner_cab, *, uid, email, rol):
    """Invita con ``rol`` sobre el cliente de ``owner_cab`` y hace su primer
    ``/oauth``. Devuelve la cabecera de esa cuenta."""
    r = client.post("/api/usuarios/invitar", json={"email": email, "rol": rol}, headers=owner_cab)
    assert r.status_code == 200, r.text
    _usar_verificador(client, {uid: _claims(uid, email)})
    r = client.post("/api/auth/oauth", json={"id_token": uid, "acepta_politica": True})
    assert r.status_code == 200, r.text
    return _cab(r.json()["token"])


def _operador(client, monkeypatch, *, uid="uid-op", email="op@recabra.co",
              slug="operapla", nombre="Opera Plataforma"):
    cab = _fundar(client, uid, email, slug, nombre)
    monkeypatch.setenv("OPERADOR_EMAILS", email)
    return cab


def _crear_espacio(client, cab, sede="TEST", code="T-GON-01") -> int:
    """Un espacio al que colgarle archivos. ``find-or-create`` sirve tanto para
    la base de siempre (ya sembrada) como para la base recién creada de un
    cliente fundado por el alta, que nace vacía a propósito."""
    r = client.post(
        "/api/spaces/find-or-create",
        json={"code": code, "sede": sede, "name": code, "zone": "Pruebas", "area_m2": 4.0},
        headers=cab,
    )
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


def _subir(client, cab, space_id, nombre, contenido, tipo, *, ip=None, uso=None):
    cabeceras = dict(cab)
    if ip:
        cabeceras["X-Forwarded-For"] = ip
    return client.post(
        f"/api/spaces/{space_id}/files",
        files={"file": (nombre, io.BytesIO(contenido), tipo)},
        data={"uso": uso} if uso else {},
        headers=cabeceras,
    )


# ════════════════════════════════════════════════════════════════════════════
# [1] EXPORT — quién lo pide
# ════════════════════════════════════════════════════════════════════════════

def test_x1_el_export_le_cierra_la_puerta_a_las_cuatro_credenciales(client, admin, worker, monkeypatch):
    """X-1. Worker legado, admin legado, admin-no-owner y owner de OTRO
    cliente: 403 en los cuatro, con el MISMO mensaje (no distingue por qué)."""
    # worker legado y admin legado: sin `sub`, no hay membresía que buscar.
    assert client.get("/api/clientes/mi-export", headers=worker).status_code == 403
    assert client.get("/api/clientes/mi-export", headers=admin).status_code == 403

    owner_a = _fundar(client, "uid-a", "a@x.co", "clientea", "Cliente A")
    # admin-no-owner sobre el MISMO cliente: el rol del JWT dice "admin" igual
    # que el del owner, así que si el gate mirara el token, pasaría.
    gerente = _invitar_y_entrar(client, owner_a, uid="uid-ger", email="ger@x.co", rol="admin")
    r = client.get("/api/clientes/mi-export", headers=gerente)
    assert r.status_code == 403, r.text
    assert r.json()["detail"] == MENSAJE_NO_OWNER

    # owner de OTRO cliente: tiene membresía owner, pero de otra base.
    owner_b = _fundar(client, "uid-b", "b@x.co", "clienteb", "Cliente B")
    r = client.get("/api/clientes/mi-export", headers=owner_b)
    assert r.status_code == 200, r.text
    # No hay forma de pedir el export de A con el token de B: el cliente sale
    # del token firmado, nunca del pedido.
    assert r.json()["cliente"]["slug"] == "clienteb"


def test_x1b_ni_query_ni_cabecera_mueven_el_cliente_del_export(client):
    """X-1b. Un parámetro suelto o una cabecera inventada no reapuntan el
    export a la base de otro supermercado."""
    _fundar(client, "uid-a", "a@x.co", "victima", "Víctima")
    owner_b = _fundar(client, "uid-b", "b@x.co", "atacante", "Atacante")

    for intento in (
        {"params": {"cliente": "victima"}},
        {"params": {"slug": "victima"}},
        {"headers": {**owner_b, "X-Cliente": "victima"}},
    ):
        kwargs = {"headers": owner_b, **intento}
        r = client.get("/api/clientes/mi-export", **kwargs)
        assert r.status_code == 200, r.text
        assert r.json()["cliente"]["slug"] == "atacante", intento


def test_x1c_el_montaje_y_el_token_por_query_no_alcanzan_el_export(client, worker):
    """X-1c. El camino lateral del ``?token=`` (el que usan ``<img>``/
    ``<iframe>``) no abre el export: ese endpoint exige Bearer de verdad."""
    r = client.post("/api/auth/login", json={"password": CLAVE_WORKER})
    token = r.json()["token"]
    # Sin cabecera, sólo el token por query.
    r = client.get(f"/api/clientes/mi-export?token={token}")
    assert r.status_code in (401, 403), r.text


# ════════════════════════════════════════════════════════════════════════════
# [1] EXPORT — qué sale adentro
# ════════════════════════════════════════════════════════════════════════════

def test_x2_el_export_no_lleva_ips_ni_hashes_ni_tablas_de_intentos(client, monkeypatch):
    """X-2. Se siembran DOS IPs reconocibles (una en la bitácora del cliente,
    otra en el freno del registro) y el motivo del operador, y se busca todo
    eso en el texto crudo del JSON."""
    owner = _fundar(client, "uid-o", "o@x.co", "expo", "Expo", ip=IP_CONSENT)

    # (a) Bitácora del cliente: una descarga y una alta de archivo con una IP
    #     pública reconocible.
    sid = _crear_espacio(client, owner)
    doc = _subir(client, owner, sid, "contrato.pdf", b"%PDF-1.4 plata", "application/pdf", ip=IP_BITACORA)
    assert doc.status_code == 201, doc.text
    assert client.get(f"/api/files/{doc.json()['id']}", headers={**owner, "X-Forwarded-For": IP_BITACORA}).status_code == 200
    bit = client.get("/api/bitacora/", headers=owner)
    assert bit.status_code == 200, bit.text
    assert IP_BITACORA in bit.text, "la IP tiene que haber quedado en la bitácora para que la prueba valga"

    # (b) Freno del registro: un alta fallida desde otra IP pública.
    _usar_verificador(client, {"bueno": _claims("uid-o", "o@x.co")})
    _alta(client, "inventado", "loquesea", "Lo Que Sea", ip=IP_FRENO)

    # (c) Motivo del operador sobre ESTE cliente.
    op = _operador(client, monkeypatch)
    motivo_secreto = "MOTIVO-INTERNO-NO-DEBE-SALIR-factura-4711"
    r = client.patch("/api/plataforma/clientes/expo",
                     json={"estado": "gracia", "motivo": motivo_secreto}, headers=op)
    assert r.status_code == 200, r.text

    # (d) El export.
    r = client.get("/api/clientes/mi-export", headers=owner)
    assert r.status_code == 200, r.text
    crudo = r.text

    for prohibido in (IP_BITACORA, IP_FRENO, IP_CONSENT):
        assert prohibido not in crudo, f"el export filtró la IP {prohibido}"
    assert motivo_secreto not in crudo, "el export filtró el motivo del operador"

    minus = crudo.lower()
    for veneno in ("hash", "$2b$", "$argon2", "password", "contrase",
                   "admin_password", "worker_password",
                   "audit_log", "login_attempts", "oauth_attempts",
                   "alta_attempts", "export_attempts", "estados_cliente",
                   "app_config", "consentimiento"):
        assert veneno.lower() not in minus, f"el export filtró {veneno!r}"

    assert set(r.json()) == {
        "cliente", "generado_en", "version_politica", "spaces", "leases", "suppliers", "layouts",
        # Las seis tablas del rediseño de Vender, juntas (vender-api.md §7).
        "condiciones_comerciales",
    }


def test_x2b_el_export_del_owner_no_arrastra_datos_de_otro_cliente(client):
    """X-2b. Aislamiento horizontal: lo que se cargó en el cliente A no puede
    aparecer en el JSON de B."""
    owner_a = _fundar(client, "uid-a", "a@x.co", "clientea", "Cliente A")
    r = client.post("/api/suppliers/", json={"name": "PROVEEDOR-SECRETO-DE-A"}, headers=owner_a)
    assert r.status_code in (200, 201), r.text

    owner_b = _fundar(client, "uid-b", "b@x.co", "clienteb", "Cliente B")
    r = client.get("/api/clientes/mi-export", headers=owner_b)
    assert r.status_code == 200, r.text
    assert "PROVEEDOR-SECRETO-DE-A" not in r.text
    assert r.json()["suppliers"] == []


def test_x3_el_freno_del_export_no_es_un_canal_de_enumeracion(client):
    """X-3. El 403 del no-owner llega ANTES que el contador: un worker no
    puede quemarle la cuota al owner, y el 429 nunca le cuenta nada a quien no
    pasó la puerta."""
    owner = _fundar(client, "uid-o", "o@x.co", "expo", "Expo")
    gerente = _invitar_y_entrar(client, owner, uid="uid-g", email="g@x.co", rol="admin")

    # 10 intentos de un no-owner: siempre 403, nunca 429.
    for _ in range(10):
        r = client.get("/api/clientes/mi-export", headers=gerente)
        assert r.status_code == 403, r.text

    # El owner conserva sus tres.
    for i in range(3):
        assert client.get("/api/clientes/mi-export", headers=owner).status_code == 200, i
    r = client.get("/api/clientes/mi-export", headers=owner)
    assert r.status_code == 429, r.text
    # Y el 429 no dice nada de nadie más.
    assert "@" not in r.json()["detail"]


def test_x3b_el_freno_del_export_es_por_cuenta_no_global(client):
    """X-3b. Que el owner de un cliente se quede sin cuota no puede dejar sin
    export al owner de otro (sería una denegación cruzada gratis)."""
    owner_a = _fundar(client, "uid-a", "a@x.co", "clientea", "Cliente A")
    owner_b = _fundar(client, "uid-b", "b@x.co", "clienteb", "Cliente B")

    for _ in range(3):
        assert client.get("/api/clientes/mi-export", headers=owner_a).status_code == 200
    assert client.get("/api/clientes/mi-export", headers=owner_a).status_code == 429
    assert client.get("/api/clientes/mi-export", headers=owner_b).status_code == 200


# ════════════════════════════════════════════════════════════════════════════
# [2] CONSENTIMIENTO COMO ORÁCULO
# ════════════════════════════════════════════════════════════════════════════

def test_x4_el_428_no_se_alcanza_sin_credencial_valida(client, admin):
    """X-4. El 428 vive DESPUÉS de verificar el ID token: un anónimo con un
    token inventado sigue viendo el 401 de siempre, exista o no una invitación
    para ese correo. No es un oráculo de correos ni de membresías."""
    r = client.post("/api/usuarios/invitar", json={"email": "invitada@x.co", "rol": "worker"}, headers=admin)
    assert r.status_code == 200, r.text

    _usar_verificador(client, {"bueno": _claims("uid-i", "invitada@x.co")})

    # Token que el verificador no conoce → 401, igual que si no hubiera invitación.
    r_invitada = client.post("/api/auth/oauth", json={"id_token": "inventado"})
    r_desconocida = client.post("/api/auth/oauth", json={"id_token": "otro-inventado"})
    assert r_invitada.status_code == 401, r_invitada.text
    assert r_desconocida.status_code == 401
    assert r_invitada.json() == r_desconocida.json()

    # Con el token bueno, sí: 428. Pero eso ya es la propia dueña del correo.
    r = client.post("/api/auth/oauth", json={"id_token": "bueno"})
    assert r.status_code == 428, r.text
    assert r.json()["detail"]["codigo"] == "consentimiento_requerido"


def test_x4b_el_428_no_canjea_la_invitacion_ni_deja_usuario(client, admin):
    """X-4b. El 428 no puede ser un "medio canje": ni membresía, ni fila de
    usuario, ni invitación marcada como usada — el reintento tiene que poder
    funcionar."""
    client.post("/api/usuarios/invitar", json={"email": "inv@x.co", "rol": "worker"}, headers=admin)
    _usar_verificador(client, {"tok": _claims("uid-i", "inv@x.co")})

    assert client.post("/api/auth/oauth", json={"id_token": "tok"}).status_code == 428

    from app.clientes import sesion_registro
    from app.models.identidad import Invitacion, Membresia, Usuario
    reg = sesion_registro()
    try:
        assert reg.query(Usuario).filter(Usuario.email == "inv@x.co").first() is None
        assert reg.query(Membresia).count() == 0
        inv = reg.query(Invitacion).filter(Invitacion.email == "inv@x.co").first()
        assert inv is not None and inv.usada_en is None
    finally:
        reg.close()

    # El reintento aceptando funciona: el 428 no quemó la invitación.
    r = client.post("/api/auth/oauth", json={"id_token": "tok", "acepta_politica": True})
    assert r.status_code == 200, r.text


@pytest.mark.parametrize("valor", ["false", "False", 0, "0", "no", "", None, [], {}])
def test_x5_acepta_politica_no_se_satisface_con_un_valor_que_no_es_una_aceptacion(client, valor):
    """X-5. El campo es un booleano: ninguna forma rara (string "false", 0,
    null, "", lista, objeto) puede pasar por una aceptación. Todo lo que no es
    un `true` inequívoco tiene que morir en 422 y NO fundar nada."""
    _usar_verificador(client, {"tok": _claims("uid-r", "raro@x.co")})
    r = _alta(client, "tok", "rarito", "Rarito", acepta=valor)
    assert r.status_code == 422, f"acepta_politica={valor!r} → {r.status_code} {r.text}"

    from app.clientes import sesion_registro
    from app.models.consentimiento import Consentimiento
    from app.models.models import ClienteRow
    reg = sesion_registro()
    try:
        assert reg.query(ClienteRow).filter(ClienteRow.slug == "rarito").first() is None
        assert reg.query(Consentimiento).count() == 0
    finally:
        reg.close()


def test_x5b_no_hay_fundacion_sin_fila_de_consentimiento(client):
    """X-5b. La contraparte: cuando el alta SÍ pasa, la fila queda — con la
    versión vigente y con la IP real del pedido, no con la del proxy."""
    _fundar(client, "uid-o", "o@x.co", "conconsent", "Con Consent", ip=IP_CONSENT)

    from app.clientes import sesion_registro
    from app.models.consentimiento import Consentimiento, VERSION_POLITICA
    from app.models.identidad import Membresia
    reg = sesion_registro()
    try:
        filas = reg.query(Consentimiento).all()
        assert len(filas) == 1, filas
        assert filas[0].version == VERSION_POLITICA
        assert filas[0].ip == IP_CONSENT
        assert filas[0].origen == "alta"
        # Ninguna membresía sin su consentimiento detrás.
        for m in reg.query(Membresia).all():
            assert reg.query(Consentimiento).filter(
                Consentimiento.usuario_id == m.usuario_id).count() == 1
    finally:
        reg.close()


def test_x6_la_ip_del_consentimiento_no_vuelve_por_ninguna_respuesta(client, monkeypatch):
    """X-6. La IP se guarda (es la prueba de la autorización, art. 7 Dto.
    1377) pero es dato de un tercero: no puede viajar de vuelta al navegador
    por ningún canal — ni el login, ni el export, ni el panel del operador."""
    owner = _fundar(client, "uid-o", "o@x.co", "expo", "Expo", ip=IP_CONSENT)

    r = client.post("/api/clientes/solicitar-supresion", json={"motivo": "me voy"}, headers=owner)
    assert r.status_code == 201, r.text
    assert IP_CONSENT not in r.text

    _usar_verificador(client, {"tok": _claims("uid-o", "o@x.co")})
    r_login = client.post("/api/auth/oauth", json={"id_token": "tok"})
    assert r_login.status_code == 200, r_login.text
    assert IP_CONSENT not in r_login.text
    # Y quien ya aceptó no vuelve a recibir el pedido.
    assert "pedir_consentimiento" not in r_login.json()

    assert IP_CONSENT not in client.get("/api/clientes/mi-export", headers=owner).text

    op = _operador(client, monkeypatch)
    assert IP_CONSENT not in client.get("/api/plataforma/supresiones", headers=op).text
    assert IP_CONSENT not in client.get("/api/plataforma/clientes", headers=op).text


def test_x7_aceptar_politica_exige_cuenta_real(client, admin, worker):
    """X-7. ``POST /auth/aceptar-politica`` no es un endpoint abierto: sin
    token 401, con el legado (sin ``sub``) 403 — no se le registra un
    consentimiento a una clave compartida que no identifica a nadie."""
    assert client.post("/api/auth/aceptar-politica").status_code == 401
    assert client.post("/api/auth/aceptar-politica", headers=admin).status_code == 403
    assert client.post("/api/auth/aceptar-politica", headers=worker).status_code == 403

    from app.clientes import sesion_registro
    from app.models.consentimiento import Consentimiento
    reg = sesion_registro()
    try:
        assert reg.query(Consentimiento).count() == 0
    finally:
        reg.close()


def test_x7b_aceptar_politica_no_escribe_por_cuenta_de_otro(client, admin):
    """X-7b. El ``usuario_id`` sale del ``sub`` del token firmado, nunca del
    cuerpo: mandar otro id no mueve la fila de nadie más."""
    client.post("/api/usuarios/invitar", json={"email": "uno@x.co", "rol": "worker"}, headers=admin)
    client.post("/api/usuarios/invitar", json={"email": "dos@x.co", "rol": "worker"}, headers=admin)
    _usar_verificador(client, {"t1": _claims("uid-1", "uno@x.co"), "t2": _claims("uid-2", "dos@x.co")})
    c1 = _cab(client.post("/api/auth/oauth", json={"id_token": "t1", "acepta_politica": True}).json()["token"])
    r2 = client.post("/api/auth/oauth", json={"id_token": "t2"})
    assert r2.status_code == 428, r2.text

    # La cuenta 1 intenta aceptar "por" la 2.
    r = client.post("/api/auth/aceptar-politica",
                    json={"usuario_id": 999, "sub": 999, "version": "2026-09-v1"}, headers=c1)
    assert r.status_code == 204, r.text

    # La 2 sigue sin consentimiento: su /oauth sigue dando 428.
    assert client.post("/api/auth/oauth", json={"id_token": "t2"}).status_code == 428


def test_x8_pedir_consentimiento_no_habla_de_terceros(client, admin):
    """X-8. ``pedir_consentimiento`` es un campo sobre QUIEN ESTÁ ENTRANDO.
    Nunca aparece por la cuenta de otro, y borrarle la fila a uno no se la
    quita al otro."""
    client.post("/api/usuarios/invitar", json={"email": "uno@x.co", "rol": "worker"}, headers=admin)
    client.post("/api/usuarios/invitar", json={"email": "dos@x.co", "rol": "worker"}, headers=admin)
    _usar_verificador(client, {"t1": _claims("uid-1", "uno@x.co"), "t2": _claims("uid-2", "dos@x.co")})
    assert client.post("/api/auth/oauth", json={"id_token": "t1", "acepta_politica": True}).status_code == 200
    assert client.post("/api/auth/oauth", json={"id_token": "t2", "acepta_politica": True}).status_code == 200

    # Se le borra la fila SÓLO a la cuenta 1 (simula una versión nueva).
    from app.clientes import sesion_registro
    from app.models.consentimiento import Consentimiento
    from app.models.identidad import Usuario
    reg = sesion_registro()
    try:
        u1 = reg.query(Usuario).filter(Usuario.email == "uno@x.co").first()
        reg.query(Consentimiento).filter(Consentimiento.usuario_id == u1.id).delete()
        reg.commit()
    finally:
        reg.close()

    r1 = client.post("/api/auth/oauth", json={"id_token": "t1"})
    r2 = client.post("/api/auth/oauth", json={"id_token": "t2"})
    assert r1.json().get("pedir_consentimiento") is True
    assert "pedir_consentimiento" not in r2.json()
    # Y el aviso no arrastra el correo ni la IP de nadie más.
    assert "dos@x.co" not in r1.text


# ════════════════════════════════════════════════════════════════════════════
# [3] SUPRESIÓN
# ════════════════════════════════════════════════════════════════════════════

def test_x9_la_supresion_es_owner_only_para_crear(client, admin, worker):
    """X-9. Crear una solicitud: worker legado, admin legado y admin-no-owner
    → 403, con el mismo mensaje."""
    for cab in (admin, worker):
        r = client.post("/api/clientes/solicitar-supresion", json={}, headers=cab)
        assert r.status_code == 403, r.text
        assert r.json()["detail"] == MENSAJE_NO_OWNER

    owner = _fundar(client, "uid-o", "o@x.co", "expo", "Expo")
    gerente = _invitar_y_entrar(client, owner, uid="uid-g", email="g@x.co", rol="admin")
    trabajador = _invitar_y_entrar(client, owner, uid="uid-w", email="w@x.co", rol="worker")
    for cab in (gerente, trabajador):
        assert client.post("/api/clientes/solicitar-supresion", json={}, headers=cab).status_code == 403

    from app.clientes import sesion_registro
    from app.models.supresion import SolicitudSupresion
    reg = sesion_registro()
    try:
        assert reg.query(SolicitudSupresion).count() == 0
    finally:
        reg.close()


def test_x10_la_lista_del_operador_no_la_lee_nadie_mas(client, monkeypatch):
    """X-10. ``GET/PATCH /plataforma/supresiones``: ni el owner que la creó,
    ni un admin-no-owner, ni el legado. Sólo el operador."""
    owner = _fundar(client, "uid-o", "o@x.co", "expo", "Expo")
    r = client.post("/api/clientes/solicitar-supresion", json={"motivo": "cierro"}, headers=owner)
    assert r.status_code == 201, r.text
    sid = r.json()["id"]

    gerente = _invitar_y_entrar(client, owner, uid="uid-g", email="g@x.co", rol="admin")
    # Con más de un cliente en el registro, el login legado exige elegir.
    r_admin_legado = client.post("/api/auth/login", json={"password": CLAVE_ADMIN, "cliente": "galerias"})
    assert r_admin_legado.status_code == 200, r_admin_legado.text
    legado = _cab(r_admin_legado.json()["token"])

    for cab in (owner, gerente, legado):
        assert client.get("/api/plataforma/supresiones", headers=cab).status_code == 403
        r = client.patch(f"/api/plataforma/supresiones/{sid}",
                         json={"estado": "atendida", "nota": "listo"}, headers=cab)
        assert r.status_code == 403, r.text
        assert r.json()["detail"] == NO_OPERADOR

    assert client.get("/api/plataforma/supresiones").status_code == 401

    # Y la solicitud sigue pendiente: ningún 403 la movió.
    op = _operador(client, monkeypatch)
    filas = client.get("/api/plataforma/supresiones", headers=op).json()["solicitudes"]
    assert [f["estado"] for f in filas] == ["pendiente"]


def test_x11_la_solicitud_de_un_cliente_no_arrastra_datos_de_otro(client, monkeypatch):
    """X-11. La fila que ve el operador nombra al cliente y a quien pidió, y
    nada más: ni plata, ni el motivo del estado de cuenta, ni datos de otro
    supermercado."""
    owner_a = _fundar(client, "uid-a", "a@x.co", "clientea", "Cliente A")
    owner_b = _fundar(client, "uid-b", "b@x.co", "clienteb", "Cliente B")
    client.post("/api/suppliers/", json={"name": "SECRETO-DE-A"}, headers=owner_a)

    assert client.post("/api/clientes/solicitar-supresion", json={"motivo": "adios"},
                       headers=owner_b).status_code == 201

    op = _operador(client, monkeypatch)
    r = client.get("/api/plataforma/supresiones", headers=op)
    assert r.status_code == 200, r.text
    assert "SECRETO-DE-A" not in r.text
    filas = r.json()["solicitudes"]
    assert len(filas) == 1
    assert filas[0]["cliente_slug"] == "clienteb"
    assert set(filas[0]) == {
        "id", "cliente_slug", "usuario_id", "email", "motivo", "estado",
        "creado_en", "atendido_en", "atendido_por", "nota",
    }


def test_x12_nada_se_borra_por_ningun_camino_de_la_supresion(client, monkeypatch):
    """X-12. Ni el POST del owner ni el PATCH del operador tocan un solo dato:
    el cliente sigue en el registro, su base sigue teniendo lo que tenía, y la
    gente sigue entrando."""
    owner = _fundar(client, "uid-o", "o@x.co", "expo", "Expo")
    client.post("/api/suppliers/", json={"name": "SIGO-ACA"}, headers=owner)

    r = client.post("/api/clientes/solicitar-supresion", json={"motivo": "chau"}, headers=owner)
    sid = r.json()["id"]

    op = _operador(client, monkeypatch)
    r = client.patch(f"/api/plataforma/supresiones/{sid}",
                     json={"estado": "atendida", "nota": "ejecutada a mano"}, headers=op)
    assert r.status_code == 200, r.text

    from app.clientes import sesion_registro
    from app.models.identidad import Membresia
    from app.models.models import ClienteRow
    reg = sesion_registro()
    try:
        fila = reg.query(ClienteRow).filter(ClienteRow.slug == "expo").first()
        assert fila is not None and fila.activo is True
        assert reg.query(Membresia).filter(Membresia.cliente_slug == "expo").count() == 1
    finally:
        reg.close()

    proveedores = client.get("/api/suppliers/", headers=owner).json()
    assert any(p["name"] == "SIGO-ACA" for p in proveedores)
    assert client.get("/api/clientes/mi-export", headers=owner).status_code == 200


def test_x12b_el_patch_de_supresion_valida_estado_y_nota(client, monkeypatch):
    """X-12b. El PATCH del operador no acepta un estado libre ni una nota
    vacía — la fila ES la bitácora, y una bitácora sin nota no sirve."""
    owner = _fundar(client, "uid-o", "o@x.co", "expo", "Expo")
    sid = client.post("/api/clientes/solicitar-supresion", json={}, headers=owner).json()["id"]
    op = _operador(client, monkeypatch)

    assert client.patch(f"/api/plataforma/supresiones/{sid}",
                        json={"estado": "borrada", "nota": "x"}, headers=op).status_code == 422
    assert client.patch(f"/api/plataforma/supresiones/{sid}",
                        json={"estado": "atendida", "nota": "   "}, headers=op).status_code == 422
    assert client.patch("/api/plataforma/supresiones/999999",
                        json={"estado": "atendida", "nota": "x"}, headers=op).status_code == 404


# ════════════════════════════════════════════════════════════════════════════
# [4] CABECERAS / CSP
# ════════════════════════════════════════════════════════════════════════════

CABECERAS_OBLIGATORIAS = (
    "Content-Security-Policy",
    "X-Content-Type-Options",
    "X-Frame-Options",
    "Referrer-Policy",
    "Permissions-Policy",
)


def _assert_cabeceras(respuesta, etiqueta):
    for h in CABECERAS_OBLIGATORIAS:
        assert h in respuesta.headers, f"falta {h} en {etiqueta} ({respuesta.status_code})"
    assert "frame-ancestors 'none'" in respuesta.headers["Content-Security-Policy"]


def test_x13_las_cabeceras_estan_en_200_401_404_422_429_y_402(client, admin, monkeypatch):
    """X-13. Las cabeceras no pueden depender de que la respuesta salga de un
    router: el 404 del catch-all, el 422 de Pydantic, el 429 de un freno y el
    402 del interruptor de Fase 2 pasan todos por el mismo middleware."""
    r200 = client.get("/api/health")
    assert r200.status_code == 200
    _assert_cabeceras(r200, "200 /api/health")

    r401 = client.get("/api/files/1")
    assert r401.status_code == 401
    _assert_cabeceras(r401, "401")

    r404 = client.get("/api/no-existe-este-camino")
    assert r404.status_code == 404
    _assert_cabeceras(r404, "404 de /api")

    r422 = client.post("/api/spaces/", json={}, headers=admin)
    assert r422.status_code == 422
    _assert_cabeceras(r422, "422")

    # 429: el freno del export (Fase 3).
    owner = _fundar(client, "uid-o", "o@x.co", "expo", "Expo")
    for _ in range(3):
        client.get("/api/clientes/mi-export", headers=owner)
    r429 = client.get("/api/clientes/mi-export", headers=owner)
    assert r429.status_code == 429, r429.text
    _assert_cabeceras(r429, "429 del export")

    # 402: el interruptor de Fase 2, suspendiendo al cliente del owner.
    op = _operador(client, monkeypatch)
    assert client.patch("/api/plataforma/clientes/expo",
                        json={"estado": "suspendido", "motivo": "impago"},
                        headers=op).status_code == 200
    r402 = client.get("/api/spaces/", headers=owner)
    assert r402.status_code == 402, r402.text
    _assert_cabeceras(r402, "402 del interruptor")


def test_x14_hsts_solo_cuando_hubo_tls(client):
    """X-14. HSTS es un compromiso de un año: mandarlo desde un origen que no
    es HTTPS puede dejar afuera a un despliegue interno. Sólo la señal
    POSITIVA del proxy cuenta."""
    assert "Strict-Transport-Security" not in client.get("/api/health").headers
    assert "Strict-Transport-Security" not in client.get(
        "/api/health", headers={"X-Forwarded-Proto": "http"}).headers
    r = client.get("/api/health", headers={"X-Forwarded-Proto": "https"})
    assert "Strict-Transport-Security" in r.headers
    assert "max-age=31536000" in r.headers["Strict-Transport-Security"]


def test_x15_la_csp_no_rompe_el_login_de_firebase(client):
    """X-15. Una CSP que rompe el login es peor que ninguna. ``connect-src``
    tiene que cubrir los DOS hosts que el SDK de Firebase Auth contacta
    (``frontend/src/api/firebase.ts``), y ``style-src``/``font-src`` las
    fuentes de ``frontend/index.html``."""
    csp = client.get("/api/health").headers["Content-Security-Policy"]
    directivas = {}
    for parte in csp.split(";"):
        parte = parte.strip()
        if not parte:
            continue
        nombre, _, resto = parte.partition(" ")
        directivas[nombre] = resto

    for host in ("https://identitytoolkit.googleapis.com", "https://securetoken.googleapis.com"):
        assert host in directivas["connect-src"], f"la CSP corta {host}: el login de Fase 1 se rompe"
    assert "'self'" in directivas["connect-src"]
    assert "https://fonts.googleapis.com" in directivas["style-src"]
    assert "https://fonts.gstatic.com" in directivas["font-src"]
    # Y lo que NO puede aflojarse.
    assert "unsafe-inline" not in directivas["script-src"]
    assert "unsafe-eval" not in directivas["script-src"]
    assert directivas["object-src"] == "'none'"
    assert directivas["frame-ancestors"] == "'none'"


def test_x16_referrer_policy_no_deja_fugar_el_token_de_la_query(client):
    """X-16. Las URLs con ``?token=`` (files, catálogo, planometrías, el enlace
    de montaje) llevan un JWT en la query. La política tiene que impedir que
    ese querystring viaje en el ``Referer`` a un origen externo — de las
    políticas que el navegador conoce, sólo las que mandan el ORIGEN (o
    menos) cross-origin sirven."""
    seguras = {
        "no-referrer", "same-origin", "strict-origin",
        "strict-origin-when-cross-origin", "origin", "origin-when-cross-origin",
    }
    politica = client.get("/api/health").headers["Referrer-Policy"].strip().lower()
    assert politica in seguras, f"Referrer-Policy {politica!r} deja viajar la URL completa"
    # `origin-when-cross-origin` y `origin` mandan el origen incluso a http:
    # la que está puesta tiene que ser una de las estrictas.
    assert politica in {"no-referrer", "same-origin", "strict-origin", "strict-origin-when-cross-origin"}


# ════════════════════════════════════════════════════════════════════════════
# [5] FIX H8 — el contrato escaneado como imagen
# ════════════════════════════════════════════════════════════════════════════

def test_x17_el_contrato_jpg_pisado_por_una_cara_mas_nueva_no_baja_para_worker(client, admin, worker):
    """X-17. El caso que el builder cubrió: un contrato en JPG convive con la
    cara DESIGNADA del espacio (Iteración 2 — la designación es explícita,
    ``uso="cara"``, nunca "la imagen más reciente": ver B-2 en
    ``features/compliance/outputs/hardening.md``) → el worker no lo lista ni
    lo baja, ni por cabecera ni por ``?token=``; el admin lo sigue bajando por
    las dos vías."""
    sid = _crear_espacio(client, admin)
    contrato = _subir(client, admin, sid, "contrato-firmado.jpg", b"\xff\xd8\xff plata", "image/jpeg")
    cara = _subir(client, admin, sid, "cara-alpina.png", b"\x89PNG\r\n\x1a\n", "image/png", uso="cara")
    id_contrato, id_cara = contrato.json()["id"], cara.json()["id"]

    tok_worker = client.post("/api/auth/login", json={"password": CLAVE_WORKER}).json()["token"]
    tok_admin = client.post("/api/auth/login", json={"password": CLAVE_ADMIN}).json()["token"]

    listado = client.get(f"/api/spaces/{sid}/files", headers=worker).json()
    assert {f["id"] for f in listado} == {id_cara}
    assert client.get(f"/api/files/{id_contrato}", headers=worker).status_code == 404
    assert client.get(f"/api/files/{id_contrato}?token={tok_worker}").status_code == 404
    assert client.get(f"/api/files/{id_cara}", headers=worker).status_code == 200
    assert client.get(f"/api/files/{id_cara}?token={tok_worker}").status_code == 200
    assert client.get(f"/api/files/{id_contrato}", headers=admin).status_code == 200
    assert client.get(f"/api/files/{id_contrato}?token={tok_admin}").status_code == 200


def test_x18_el_contrato_jpg_mas_reciente_tampoco_baja_para_worker(client, admin, worker):
    """X-18 (CERRADO en Iteración 2 — era hallazgo B-2). La primera versión del
    fix filtraba por "la imagen más reciente del espacio", que no es una
    propiedad de seguridad sino del orden en que trabaja la persona: un
    contrato fotografiado y subido DESPUÉS de la cara del mueble pasaba a SER
    la cara vigente y el worker lo bajaba.

    Ahora la cara es una DESIGNACIÓN explícita (``uso="cara"``, tabla
    ``SpaceFace``), así que subir algo después no designa nada. Este test
    afirma el comportamiento seguro y HOY PASA."""
    sid = _crear_espacio(client, admin)
    cara = _subir(client, admin, sid, "cara-alpina.png", b"\x89PNG\r\n\x1a\n", "image/png", uso="cara")
    contrato = _subir(client, admin, sid, "contrato-firmado.jpg", b"\xff\xd8\xff plata", "image/jpeg")
    id_contrato, id_cara = contrato.json()["id"], cara.json()["id"]

    tok_worker = client.post("/api/auth/login", json={"password": CLAVE_WORKER}).json()["token"]
    listado = client.get(f"/api/spaces/{sid}/files", headers=worker).json()
    assert id_contrato not in {f["id"] for f in listado}, "el worker lista el contrato"
    assert client.get(f"/api/files/{id_contrato}", headers=worker).status_code == 404
    assert client.get(f"/api/files/{id_contrato}?token={tok_worker}").status_code == 404
    # ...y la designación NO se movió sola: la cara vieja sigue siendo la cara.
    assert client.get(f"/api/files/{id_cara}", headers=worker).status_code == 200


def test_x18b_un_espacio_cuyo_unico_adjunto_es_el_contrato_jpg(client, admin, worker):
    """X-18b (CERRADO en Iteración 2 — el escenario ORIGINAL de H8). Un espacio
    al que sólo se le colgó el contrato fotografiado: no hay ninguna otra
    imagen. Con la heurística vieja ésa "era" la cara vigente. Con designación
    explícita el espacio simplemente no tiene cara (fail closed) y el worker no
    ve nada."""
    sid = _crear_espacio(client, admin, code="T-GON-02")
    contrato = _subir(client, admin, sid, "contrato-firmado.jpg", b"\xff\xd8\xff plata", "image/jpeg")
    id_contrato = contrato.json()["id"]

    tok_worker = client.post("/api/auth/login", json={"password": CLAVE_WORKER}).json()["token"]
    assert client.get(f"/api/spaces/{sid}/files", headers=worker).json() == []
    assert client.get(f"/api/files/{id_contrato}", headers=worker).status_code == 404
    assert client.get(f"/api/files/{id_contrato}?token={tok_worker}").status_code == 404
    # El admin lo sigue viendo: el fix filtra por rol, no rompe el archivo.
    assert client.get(f"/api/files/{id_contrato}", headers=admin).status_code == 200


def test_x19_un_documento_disfrazado_con_el_prefijo_de_montaje_no_baja(client, admin, worker):
    """X-19 (CERRADO en Iteración 2 — era hallazgo M-1). ``_es_foto_montaje``
    miraba SÓLO el nombre: ``montaje--contrato.pdf`` era una "foto de montaje"
    y el worker lo bajaba. Ahora exige además content-type de imagen —derivado
    server-side de la extensión, nunca del header del cliente—, así que el PDF
    disfrazado se trata como documento.

    Se verifica también el punto (2) del encargo de Iteración 2: qué queda en
    la bitácora del intento de bypass."""
    sid = _crear_espacio(client, admin)
    disfrazado = _subir(client, admin, sid, "montaje--contrato-firmado.pdf",
                        b"%PDF-1.4 plata", "application/pdf")
    assert disfrazado.status_code == 201, disfrazado.text
    fid = disfrazado.json()["id"]

    tok_worker = client.post("/api/auth/login", json={"password": CLAVE_WORKER}).json()["token"]
    listado = client.get(f"/api/spaces/{sid}/files", headers=worker).json()
    assert fid not in {f["id"] for f in listado}, "el worker lista el PDF disfrazado"
    assert client.get(f"/api/files/{fid}", headers=worker).status_code == 404
    assert client.get(f"/api/files/{fid}?token={tok_worker}").status_code == 404
    # El admin sí lo baja, y ESA bajada sí queda anotada (es un documento).
    assert client.get(f"/api/files/{fid}", headers=admin).status_code == 200
    bit = client.get("/api/bitacora/", headers=admin)
    assert bit.status_code == 200, bit.text
    assert "montaje--contrato-firmado.pdf" in bit.text


@pytest.mark.xfail(
    strict=True,
    reason="X-19b: el 404 al worker se levanta ANTES de `anotar`, así que el intento de bypass no deja rastro",
)
def test_x19b_el_intento_de_bypass_del_worker_deberia_quedar_en_la_bitacora(client, admin, worker):
    """X-19b (HALLAZGO ABIERTO, punto (2) del encargo de Iteración 2). El
    encargo pide "404 **Y** fila en ``audit_log``". El 404 está; la fila no:
    ``files.py:245`` levanta la excepción ANTES del bloque ``anotar`` de
    ``:254``, así que un worker puede numerar ``/api/files/1..N`` buscando
    contratos y no queda absolutamente nada escrito. La puerta está cerrada
    pero no tiene mirilla.

    Este test afirma el comportamiento deseado (que el rechazo se anote). Hoy
    falla."""
    sid = _crear_espacio(client, admin)
    fid = _subir(client, admin, sid, "montaje--contrato-firmado.pdf",
                 b"%PDF-1.4 plata", "application/pdf").json()["id"]
    doc = _subir(client, admin, sid, "contrato.pdf", b"%PDF-1.4 mas plata", "application/pdf").json()["id"]

    antes = client.get("/api/bitacora/", headers=admin).json()
    n_antes = len(antes if isinstance(antes, list) else antes.get("items", []))

    assert client.get(f"/api/files/{fid}", headers=worker).status_code == 404
    assert client.get(f"/api/files/{doc}", headers=worker).status_code == 404

    despues = client.get("/api/bitacora/", headers=admin).json()
    n_despues = len(despues if isinstance(despues, list) else despues.get("items", []))
    assert n_despues > n_antes, "dos intentos de bypass rechazados y cero líneas nuevas en la bitácora"


# ─── Ataques NUEVOS que habilita el diseño por designación (Iteración 2) ──────

def test_x25_no_se_puede_designar_como_cara_algo_que_no_es_una_imagen(client, admin, worker):
    """X-25. El nuevo campo ``uso=cara`` es una puerta de escritura: si
    aceptara un PDF, el contrato se auto-designaría cara y el fix de H8 se
    cerraría en falso. Se prueban un PDF y un CSV, y que el rechazo no deje
    designación a medias (el espacio sigue sin cara para el worker)."""
    sid = _crear_espacio(client, admin)
    for nombre, cuerpo, tipo in (
        ("contrato-firmado.pdf", b"%PDF-1.4 plata", "application/pdf"),
        ("tarifas.csv", b"espacio,precio\nA,1000\n", "text/csv"),
    ):
        r = _subir(client, admin, sid, nombre, cuerpo, tipo, uso="cara")
        assert r.status_code == 422, f"{nombre} se aceptó como cara: {r.status_code} {r.text}"

    # `uso` fuera de catálogo tampoco cuela.
    r = _subir(client, admin, sid, "x.png", b"\x89PNG", "image/png", uso="montaje")
    assert r.status_code == 422, r.text
    r = _subir(client, admin, sid, "y.png", b"\x89PNG", "image/png", uso="CARA")
    assert r.status_code == 422, r.text

    # Nada quedó designado: el espacio sigue cerrado para el worker.
    assert client.get(f"/api/spaces/{sid}/files", headers=worker).json() == []
    assert client.get("/api/spaces/face-images", headers=admin).json() == []


def test_x26_la_designacion_no_cruza_de_un_espacio_a_otro(client, admin, worker):
    """X-26. La designación se crea SIEMPRE contra el espacio del upload
    (``SpaceFace(space_id=space_id, file_id=row.id)``) y el chequeo la busca
    por ``row.space_id``: no hay forma por API de apuntar la cara de un espacio
    a un archivo de otro. Se comprueba que (a) designar en B no abre nada de A,
    y (b) no existe ningún endpoint suelto de designación que acepte un
    ``file_id`` arbitrario."""
    sid_a = _crear_espacio(client, admin, code="T-GON-0A")
    sid_b = _crear_espacio(client, admin, code="T-GON-0B")
    contrato_a = _subir(client, admin, sid_a, "contrato-a.jpg", b"\xff\xd8\xff plata-A", "image/jpeg").json()["id"]
    cara_b = _subir(client, admin, sid_b, "cara-b.png", b"\x89PNG B", "image/png", uso="cara").json()["id"]

    # El contrato de A no se vuelve visible por tener B una cara designada.
    assert client.get(f"/api/files/{contrato_a}", headers=worker).status_code == 404
    assert client.get(f"/api/spaces/{sid_a}/files", headers=worker).json() == []
    assert {f["id"] for f in client.get(f"/api/spaces/{sid_b}/files", headers=worker).json()} == {cara_b}

    # No hay puerta lateral para designar un file_id ajeno.
    for metodo, ruta, cuerpo in (
        ("post", f"/api/spaces/{sid_a}/face", {"file_id": contrato_a}),
        ("put", f"/api/spaces/{sid_a}/face", {"file_id": contrato_a}),
        ("post", "/api/spaces/face-images", {"space_id": sid_a, "file_id": contrato_a}),
        ("patch", f"/api/files/{contrato_a}", {"uso": "cara"}),
    ):
        r = getattr(client, metodo)(ruta, json=cuerpo, headers=admin)
        assert r.status_code in (404, 405), f"{metodo.upper()} {ruta} → {r.status_code} {r.text}"
    assert client.get(f"/api/files/{contrato_a}", headers=worker).status_code == 404


def test_x27_borrar_la_cara_designada_no_deja_la_designacion_apuntando_al_proximo_archivo(client, admin, worker):
    """X-27 (ATAQUE NUEVO del diseño por tabla — CERRADO durante la Iteración 2).
    ``DELETE /api/files/{id}`` borraba la fila de ``space_files`` pero NO la de
    ``space_faces``, que quedaba colgada apuntando a un id que ya no existe. En
    SQLite, sin ``AUTOINCREMENT``, el próximo ``INSERT`` REUSA el rowid libre
    más alto — así que el siguiente archivo subido heredaba el id de la cara
    borrada y quedaba designado cara sin que nadie lo designara. Si ese archivo
    era el contrato, H8 se reabría por la puerta de atrás, y encima en silencio
    (una "cara vigente" no se anota en la bitácora).

    ``files.py::delete_file`` ahora borra la designación junto con el archivo.
    Se ejecuta el ataque completo igual: designar, borrar, subir el contrato,
    intentar bajarlo como worker."""
    sid = _crear_espacio(client, admin)
    cara = _subir(client, admin, sid, "cara-alpina.png", b"\x89PNG cara", "image/png", uso="cara").json()["id"]
    assert client.get(f"/api/files/{cara}", headers=worker).status_code == 200

    assert client.delete(f"/api/files/{cara}", headers=admin).status_code == 204

    contrato = _subir(client, admin, sid, "contrato-firmado.jpg", b"\xff\xd8\xff plata", "image/jpeg")
    assert contrato.status_code == 201, contrato.text
    id_contrato = contrato.json()["id"]

    tok_worker = client.post("/api/auth/login", json={"password": CLAVE_WORKER}).json()["token"]
    assert client.get(f"/api/files/{id_contrato}", headers=worker).status_code == 404, (
        f"el contrato heredó el id de la cara borrada (cara={cara}, contrato={id_contrato}) "
        "y quedó designado cara sin que nadie lo designara"
    )
    assert client.get(f"/api/files/{id_contrato}?token={tok_worker}").status_code == 404
    assert id_contrato not in {f["id"] for f in client.get(f"/api/spaces/{sid}/files", headers=worker).json()}


@pytest.mark.xfail(
    strict=True,
    reason="X-28: `_es_foto_montaje` sigue confiando en el NOMBRE; una imagen llamada `montaje--contrato.jpg` baja para worker y sin bitácora",
)
def test_x28_el_prefijo_de_montaje_inyectado_desde_el_nombre_sigue_siendo_una_llave_para_imagenes(client, admin, worker):
    """X-28 (RESIDUO de M-1). El fix cerró el caso del PDF, pero
    ``_es_foto_montaje`` sigue mirando el NOMBRE que el cliente eligió: una
    IMAGEN llamada ``montaje--contrato-firmado.jpg`` cumple las dos
    condiciones (prefijo + content-type de imagen) y el worker la baja, aunque
    nadie la haya designado cara y aunque ``mounts.py`` construya ese nombre
    server-side como ``montaje--<code>--<archivo>``.

    Y como ``files.py:254`` reusa la misma condición para decidir si anota, la
    bajada además NO deja línea en la bitácora. Justo el formato del hallazgo
    H8 original (contrato ESCANEADO como JPG).

    Este test afirma el comportamiento seguro. Hoy falla."""
    sid = _crear_espacio(client, admin)
    fid = _subir(client, admin, sid, "montaje--contrato-firmado.jpg",
                 b"\xff\xd8\xff plata", "image/jpeg").json()["id"]

    tok_worker = client.post("/api/auth/login", json={"password": CLAVE_WORKER}).json()["token"]
    r = client.get(f"/api/files/{fid}", headers=worker)
    r_tok = client.get(f"/api/files/{fid}?token={tok_worker}")
    listado = {f["id"] for f in client.get(f"/api/spaces/{sid}/files", headers=worker).json()}
    bit = client.get("/api/bitacora/", headers=admin)

    # Se reporta como hallazgo abierto (m-6): el prefijo del nombre sigue
    # abriendo la puerta para imágenes, y en silencio.
    assert (r.status_code, r_tok.status_code) == (404, 404), (
        "una imagen con el prefijo de montaje puesto a mano sigue bajando para el worker"
    )
    assert fid not in listado
    assert "montaje--contrato-firmado.jpg" in bit.text


def test_x29_face_images_ya_no_devuelve_el_contrato_jpg_mas_reciente(client, admin):
    """X-29 (la SEGUNDA puerta del mismo hallazgo, punto (1) del encargo).
    ``GET /api/spaces/face-images`` alimenta la textura del 3D y devolvía "la
    imagen más reciente por espacio": un contrato escaneado quedaba pintado en
    el mueble para todo el mundo. Ahora sale de ``SpaceFace``, así que un
    espacio sin designación no aparece y el contrato nunca es file_id de
    nadie."""
    sid = _crear_espacio(client, admin)
    contrato = _subir(client, admin, sid, "contrato-firmado.jpg", b"\xff\xd8\xff plata", "image/jpeg").json()["id"]

    caras = client.get("/api/spaces/face-images", headers=admin).json()
    assert caras == [], f"el espacio sin cara designada aparece igual: {caras}"

    cara = _subir(client, admin, sid, "cara-alpina.png", b"\x89PNG cara", "image/png", uso="cara").json()["id"]
    caras = client.get("/api/spaces/face-images", headers=admin).json()
    assert [c["file_id"] for c in caras] == [cara]
    assert contrato not in {c["file_id"] for c in caras}

    # Subir OTRA imagen después no le roba la designación a la cara.
    _subir(client, admin, sid, "contrato-2.jpg", b"\xff\xd8\xff mas plata", "image/jpeg")
    caras = client.get("/api/spaces/face-images", headers=admin).json()
    assert [c["file_id"] for c in caras] == [cara]

    # Re-designar SÍ la mueve, y deja UNA sola fila (no historial).
    cara2 = _subir(client, admin, sid, "cara-nueva.png", b"\x89PNG nueva", "image/png", uso="cara").json()["id"]
    caras = client.get("/api/spaces/face-images", headers=admin).json()
    assert [c["file_id"] for c in caras] == [cara2]


def test_x20_la_cara_vigente_del_3d_sigue_bajando_para_el_worker(client, admin, worker):
    """X-20. El fix no puede romper el 3D: la cara DESIGNADA (Iteración 2) y
    la foto de montaje del propio worker siguen listándose y bajando."""
    sid = _crear_espacio(client, admin)
    _subir(client, admin, sid, "vieja.png", b"\x89PNG vieja", "image/png")
    cara = _subir(client, admin, sid, "cara-nueva.png", b"\x89PNG nueva", "image/png", uso="cara")
    montaje = _subir(client, admin, sid, "montaje--T-GON-01--foto.jpg", b"\xff\xd8\xff foto", "image/jpeg")

    visibles = {f["id"] for f in client.get(f"/api/spaces/{sid}/files", headers=worker).json()}
    assert visibles == {cara.json()["id"], montaje.json()["id"]}
    assert client.get(f"/api/files/{cara.json()['id']}", headers=worker).status_code == 200
    assert client.get(f"/api/files/{montaje.json()['id']}", headers=worker).status_code == 200


# ════════════════════════════════════════════════════════════════════════════
# [6] DOCUMENTOS LEGALES
# ════════════════════════════════════════════════════════════════════════════

def test_x21_los_tres_documentos_legales_dicen_que_son_borrador():
    """X-21. El sistema no da asesoría legal: los tres documentos —los dos de
    ``docs/legal/`` y la copia que sirve la página pública— tienen que abrir
    con el encabezado de BORRADOR, y la copia del frontend tiene que ser
    idéntica a la fuente (si divergen, la página pública miente)."""
    from pathlib import Path

    raiz = Path(__file__).resolve().parents[2]
    politica = raiz / "docs" / "legal" / "politica-datos.md"
    guia = raiz / "docs" / "legal" / "guia-rnbd.md"
    copia = raiz / "frontend" / "src" / "legal" / "politica-datos.md"

    for doc in (politica, guia, copia):
        assert doc.exists(), doc
        primera = doc.read_text(encoding="utf-8").splitlines()[0]
        assert "BORRADOR PARA REVISIÓN DE ABOGADO" in primera, doc

    assert politica.read_bytes() == copia.read_bytes(), (
        "la copia del frontend divergió de docs/legal/politica-datos.md"
    )


def test_x23_los_endpoints_nuevos_no_estrenan_el_oraculo_del_402(client, monkeypatch):
    """X-23. El hallazgo R-1 de la Fase 2 (un anónimo distinguía 401 de 402 y
    con eso sabía qué supermercado dejó de pagar) no puede volver por las
    puertas nuevas: sin credencial, los tres endpoints de esta fase contestan
    401, no 402 ni 428, aunque el cliente esté suspendido."""
    owner = _fundar(client, "uid-o", "o@x.co", "expo", "Expo")
    op = _operador(client, monkeypatch)
    assert client.patch("/api/plataforma/clientes/expo",
                        json={"estado": "suspendido", "motivo": "impago"},
                        headers=op).status_code == 200

    for metodo, ruta, cuerpo in (
        ("get", "/api/clientes/mi-export", None),
        ("post", "/api/clientes/solicitar-supresion", {}),
        ("post", "/api/auth/aceptar-politica", {}),
    ):
        r = getattr(client, metodo)(ruta, json=cuerpo) if cuerpo is not None else getattr(client, metodo)(ruta)
        assert r.status_code == 401, f"{ruta} → {r.status_code} {r.text}"
    del owner


def test_x24_el_interruptor_de_fase_2_ya_no_corta_el_habeas_data(client, monkeypatch):
    """X-24 (CERRADO en el cierre de fase — m-3). El interruptor cortaba el
    export y la solicitud de supresión de un cliente suspendido — justo el
    caso más típico de querer irse. Ahora los derechos del titular están
    exentos del 402 (``_EXENTOS_POR_HABEAS_DATA`` en ``clientes.py``): el
    interruptor de cobranza no puede bloquear el habeas data."""
    owner = _fundar(client, "uid-o", "o@x.co", "expo", "Expo")
    op = _operador(client, monkeypatch)
    assert client.patch("/api/plataforma/clientes/expo",
                        json={"estado": "suspendido", "motivo": "impago"},
                        headers=op).status_code == 200

    assert client.get("/api/clientes/mi-export", headers=owner).status_code == 200
    assert client.post("/api/clientes/solicitar-supresion", json={}, headers=owner).status_code in (201, 409)
    # El negocio sigue cortado: la exención es quirúrgica, no una puerta.
    assert client.get("/api/spaces/", headers=owner).status_code == 402


@pytest.fixture()
def _dist_minimo():
    """El catch-all de la SPA solo se registra si ``frontend/dist`` existe
    (main.py lo chequea al importar). Localmente suele estar construido; en CI
    no — y el test daba 404 por ausencia de build, no por bug. Este fixture
    garantiza un dist mínimo ANTES de que el fixture ``client`` importe
    ``app.main``, y limpia solo lo que creó."""
    import shutil
    from pathlib import Path

    dist = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
    creado = not dist.exists()
    if creado:
        (dist / "assets").mkdir(parents=True)
        (dist / "index.html").write_text("<!doctype html><title>RECABRA</title>")
    yield
    if creado:
        shutil.rmtree(dist, ignore_errors=True)


def test_x22_la_pagina_publica_no_exige_login_y_lleva_las_cabeceras(_dist_minimo, client):
    """X-22. ``/politica-datos`` la resuelve el catch-all de la SPA: tiene que
    contestar sin credencial (es un requisito legal) y con las mismas
    cabeceras que todo lo demás."""
    r = client.get("/politica-datos")
    assert r.status_code == 200, r.text
    _assert_cabeceras(r, "/politica-datos sin login")
