"""Consentimiento a la Política de Tratamiento de Datos (Fase 3, Ley 1581/2012).

Mismo patrón que ``test_alta.py``/``test_identidad.py``: verificador falso vía
``dependency_overrides`` y todo ``import app.*`` ADENTRO de las funciones —
``app.database`` arma el motor al importarse y el fixture ``client`` purga
``sys.modules`` entre pruebas, así que un import de nivel de módulo quedaría
apuntando a la app vieja en cuanto otro archivo de test corriera antes.
"""
from types import SimpleNamespace

from conftest import CLAVE_ADMIN


class FakeVerificador:
    """Traduce un `id_token` de mentira (clave de diccionario) a claims."""

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


def _alta(client, id_token, slug, nombre, acepta_politica=True):
    body = {"id_token": id_token, "slug": slug, "nombre": nombre}
    if acepta_politica is not None:
        body["acepta_politica"] = acepta_politica
    return client.post("/api/clientes/alta", json=body)


def _invitar(client, admin, email, rol="worker"):
    r = client.post("/api/usuarios/invitar", json={"email": email, "rol": rol}, headers=admin)
    assert r.status_code == 200, r.text
    return r.json()


def _oauth(client, id_token, cliente=None, acepta_politica=None):
    body = {"id_token": id_token}
    if cliente is not None:
        body["cliente"] = cliente
    if acepta_politica is not None:
        body["acepta_politica"] = acepta_politica
    return client.post("/api/auth/oauth", json=body)


# ════════════════════════════════════════════════════════════════════════════
# Alta: [B]
# ════════════════════════════════════════════════════════════════════════════

def test_alta_sin_acepta_politica_da_422_y_no_crea_nada(client):
    _usar_verificador(client, {"t": _claims("uid-sin-pol", "sinpol@x.co")})
    r = _alta(client, "t", "sinpolmarket", "Sin Pol Market", acepta_politica=False)
    assert r.status_code == 422
    assert "Política de Tratamiento de Datos" in r.json()["detail"]

    from app.clientes import buscar, sesion_registro
    from app.models.identidad import Usuario
    from app.models.models import ClienteRow

    assert buscar("sinpolmarket") is None
    reg = sesion_registro()
    try:
        assert reg.query(ClienteRow).filter(ClienteRow.slug == "sinpolmarket").first() is None
        assert reg.query(Usuario).filter(Usuario.email == "sinpol@x.co").first() is None
    finally:
        reg.close()


def test_alta_omitiendo_el_campo_tambien_da_422(client):
    """``acepta_politica`` no viaja: el default es False, no se asume aceptado."""
    _usar_verificador(client, {"t": _claims("uid-omitido", "omitido@x.co")})
    r = _alta(client, "t", "omitidomarket", "Omitido Market", acepta_politica=None)
    assert r.status_code == 422


def test_alta_con_acepta_politica_deja_fila_con_version_e_ip(client):
    _usar_verificador(client, {"t": _claims("uid-conpol", "conpol@x.co")})
    r = _alta(client, "t", "conpolmarket", "Con Pol Market", acepta_politica=True)
    assert r.status_code == 200, r.text

    from app.clientes import sesion_registro
    from app.models.consentimiento import VERSION_POLITICA, Consentimiento
    from app.models.identidad import Usuario

    reg = sesion_registro()
    try:
        usuario = reg.query(Usuario).filter(Usuario.email == "conpol@x.co").first()
        assert usuario is not None
        fila = (
            reg.query(Consentimiento)
            .filter(Consentimiento.usuario_id == usuario.id, Consentimiento.version == VERSION_POLITICA)
            .first()
        )
        assert fila is not None
        assert fila.origen == "alta"
        assert fila.ip  # no vacío
    finally:
        reg.close()


# ════════════════════════════════════════════════════════════════════════════
# Invitación / oauth: [C]
# ════════════════════════════════════════════════════════════════════════════

def test_invitacion_pendiente_sin_consentimiento_da_428_y_no_crea_membresia(client, admin):
    _invitar(client, admin, "invitado@x.co", rol="worker")

    _usar_verificador(client, {"t": _claims("uid-inv", "invitado@x.co")})
    r = _oauth(client, "t")
    assert r.status_code == 428, r.text
    detalle = r.json()["detail"]
    assert detalle["codigo"] == "consentimiento_requerido"

    from app.clientes import sesion_registro
    from app.models.identidad import Membresia, Usuario

    reg = sesion_registro()
    try:
        # Ni la membresía ni (con este flujo) el usuario deberían haber quedado.
        usuario = reg.query(Usuario).filter(Usuario.email == "invitado@x.co").first()
        if usuario is not None:
            assert (
                reg.query(Membresia).filter(Membresia.usuario_id == usuario.id).first()
                is None
            )
    finally:
        reg.close()

    # Ni un JWT llegó a servir: reintentando sin el token nuevo, sigue sin acceso.
    assert r.json().get("token") is None


def test_invitacion_con_acepta_politica_crea_membresia_y_fila_invitacion(client, admin):
    _invitar(client, admin, "aceptador@x.co", rol="worker")

    _usar_verificador(client, {"t": _claims("uid-acep", "aceptador@x.co")})
    r = _oauth(client, "t", acepta_politica=True)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["role"] == "worker"
    assert "pedir_consentimiento" not in body

    from app.clientes import sesion_registro
    from app.models.consentimiento import VERSION_POLITICA, Consentimiento
    from app.models.identidad import Membresia, Usuario

    reg = sesion_registro()
    try:
        usuario = reg.query(Usuario).filter(Usuario.email == "aceptador@x.co").first()
        assert usuario is not None
        assert (
            reg.query(Membresia)
            .filter(Membresia.usuario_id == usuario.id, Membresia.cliente_slug == "galerias")
            .first()
            is not None
        )
        fila = (
            reg.query(Consentimiento)
            .filter(Consentimiento.usuario_id == usuario.id, Consentimiento.version == VERSION_POLITICA)
            .first()
        )
        assert fila is not None
        assert fila.origen == "invitacion"
    finally:
        reg.close()


# ════════════════════════════════════════════════════════════════════════════
# Usuario existente con membresía, sin fila para la versión vigente: [C]
# ════════════════════════════════════════════════════════════════════════════

def test_login_con_membresia_y_sin_fila_pide_consentimiento_una_vez(client, admin):
    _invitar(client, admin, "yaesmiembro@x.co", rol="worker")
    _usar_verificador(client, {"t": _claims("uid-ym", "yaesmiembro@x.co")})
    primero = _oauth(client, "t", acepta_politica=True)
    assert primero.status_code == 200, primero.text

    # Se le borra la fila de consentimiento a mano -- simula una cuenta que
    # existía antes de esta fase, sin ninguna aceptación registrada.
    from app.clientes import sesion_registro
    from app.models.consentimiento import Consentimiento
    from app.models.identidad import Usuario

    reg = sesion_registro()
    try:
        usuario = reg.query(Usuario).filter(Usuario.email == "yaesmiembro@x.co").first()
        reg.query(Consentimiento).filter(Consentimiento.usuario_id == usuario.id).delete()
        reg.commit()
    finally:
        reg.close()

    # Login normal, SIN acepta_politica: pasa igual (no hay membresía nueva
    # que crear), y la respuesta avisa con el campo top-level.
    r = _oauth(client, "t")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["pedir_consentimiento"] is True
    assert "token" in body  # el JWT no cambia de forma: sigue viniendo


# ════════════════════════════════════════════════════════════════════════════
# POST /api/auth/aceptar-politica: [D]
# ════════════════════════════════════════════════════════════════════════════

def test_aceptar_politica_204_y_deja_fila_origen_login(client, admin):
    _invitar(client, admin, "acepto-despues@x.co", rol="worker")
    _usar_verificador(client, {"t": _claims("uid-ad", "acepto-despues@x.co")})
    login1 = _oauth(client, "t", acepta_politica=True)
    assert login1.status_code == 200

    from app.clientes import sesion_registro
    from app.models.consentimiento import Consentimiento
    from app.models.identidad import Usuario

    reg = sesion_registro()
    try:
        usuario = reg.query(Usuario).filter(Usuario.email == "acepto-despues@x.co").first()
        reg.query(Consentimiento).filter(Consentimiento.usuario_id == usuario.id).delete()
        reg.commit()
    finally:
        reg.close()

    token = _oauth(client, "t").json()["token"]  # ahora sin fila -> pedir_consentimiento
    r = client.post("/api/auth/aceptar-politica", headers=_cab(token))
    assert r.status_code == 204
    assert not r.content

    reg = sesion_registro()
    try:
        usuario = reg.query(Usuario).filter(Usuario.email == "acepto-despues@x.co").first()
        fila = reg.query(Consentimiento).filter(Consentimiento.usuario_id == usuario.id).first()
        assert fila is not None
        assert fila.origen == "login"
    finally:
        reg.close()


def test_aceptar_politica_segunda_vez_es_idempotente(client, admin):
    _invitar(client, admin, "doble@x.co", rol="worker")
    _usar_verificador(client, {"t": _claims("uid-doble", "doble@x.co")})
    token = _oauth(client, "t", acepta_politica=True).json()["token"]

    r1 = client.post("/api/auth/aceptar-politica", headers=_cab(token))
    assert r1.status_code == 204
    r2 = client.post("/api/auth/aceptar-politica", headers=_cab(token))
    assert r2.status_code == 204

    from app.clientes import sesion_registro
    from app.models.consentimiento import Consentimiento
    from app.models.identidad import Usuario

    reg = sesion_registro()
    try:
        usuario = reg.query(Usuario).filter(Usuario.email == "doble@x.co").first()
        filas = reg.query(Consentimiento).filter(Consentimiento.usuario_id == usuario.id).all()
        assert len(filas) == 1  # el UNIQUE evitó la segunda fila, sin que el 204 lo delate
    finally:
        reg.close()


def test_aceptar_politica_con_token_legado_da_403(client, admin):
    r = client.post("/api/auth/aceptar-politica", headers=admin)
    assert r.status_code == 403


def test_aceptar_politica_sin_token_da_401(client):
    r = client.post("/api/auth/aceptar-politica")
    assert r.status_code == 401


# ════════════════════════════════════════════════════════════════════════════
# El login legado no cambia ni un byte: [E]
# ════════════════════════════════════════════════════════════════════════════

def test_login_legado_no_exige_ni_acepta_campo_nuevo(client):
    r = client.post("/api/auth/login", json={"password": CLAVE_ADMIN})
    assert r.status_code == 200, r.text
    body = r.json()
    assert set(body.keys()) == {"token", "role", "cliente", "cliente_nombre"}
    assert "pedir_consentimiento" not in body


# ════════════════════════════════════════════════════════════════════════════
# Fase 7 — la política subió de versión: el re-consentimiento se dispara: [F]
# ════════════════════════════════════════════════════════════════════════════
#
# La Fase 7 cambió el trato de forma MATERIAL (el operador ve agregados
# exactos sin umbral; el cliente gana el reporte de transparencia), así que
# `VERSION_POLITICA` subió a "2026-09-v2". Lo que estas pruebas fijan no es
# la cadena por la cadena: es que el flujo que YA existía —sin backfill, sin
# migración, sin tocar el login legado— alcanza para volver a pedir la
# aceptación a una cuenta que sólo había aceptado la versión anterior.

VERSION_ANTERIOR = "2026-09-v1"


def _fila_de_consentimiento_a_mano(email, version, origen="login"):
    """Inserta a mano, con ``sesion_registro()``, una fila de consentimiento
    para ``version`` -- simula la cuenta que aceptó la política ANTERIOR y no
    conoce la vigente. Se escribe directo en el registro a propósito: por la
    API no hay forma de registrar una versión que ya no es la vigente."""
    from app.clientes import sesion_registro
    from app.models.consentimiento import Consentimiento
    from app.models.identidad import Usuario

    reg = sesion_registro()
    try:
        usuario = reg.query(Usuario).filter(Usuario.email == email).first()
        assert usuario is not None, email
        reg.query(Consentimiento).filter(Consentimiento.usuario_id == usuario.id).delete()
        reg.add(Consentimiento(
            usuario_id=usuario.id, version=version, ip="10.0.0.1", origen=origen,
        ))
        reg.commit()
        return usuario.id
    finally:
        reg.close()


def _versiones_aceptadas(usuario_id):
    from app.clientes import sesion_registro
    from app.models.consentimiento import Consentimiento

    reg = sesion_registro()
    try:
        return sorted(
            f.version
            for f in reg.query(Consentimiento)
            .filter(Consentimiento.usuario_id == usuario_id)
            .all()
        )
    finally:
        reg.close()


def test_solo_acepto_la_version_anterior_pide_consentimiento_y_aceptar_lo_destraba(client, admin):
    """Una cuenta con fila SÓLO para "2026-09-v1": entra igual (no es un muro),
    la respuesta avisa, ``/aceptar-politica`` deja la fila de la versión
    VIGENTE, y el login siguiente ya no avisa. La fila vieja NO se reescribe:
    quedan las dos, que es la prueba de qué texto aceptó y cuándo."""
    from app.models.consentimiento import VERSION_POLITICA

    assert VERSION_ANTERIOR != VERSION_POLITICA, (
        "esta prueba necesita que la versión vigente NO sea la anterior")

    _invitar(client, admin, "solo-v1@x.co", rol="worker")
    _usar_verificador(client, {"t": _claims("uid-solo-v1", "solo-v1@x.co")})
    assert _oauth(client, "t", acepta_politica=True).status_code == 200

    usuario_id = _fila_de_consentimiento_a_mano("solo-v1@x.co", VERSION_ANTERIOR)
    assert _versiones_aceptadas(usuario_id) == [VERSION_ANTERIOR]

    # 1. El login avisa -- sin bloquear y sin cambiar la forma del JWT.
    r = _oauth(client, "t")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["pedir_consentimiento"] is True
    token = body["token"]

    # 2. Aceptar deja la fila de la versión VIGENTE, sin borrar la vieja.
    assert client.post("/api/auth/aceptar-politica", headers=_cab(token)).status_code == 204
    assert _versiones_aceptadas(usuario_id) == sorted([VERSION_ANTERIOR, VERSION_POLITICA])

    # 3. El login siguiente ya no avisa: quedó destrabado.
    r2 = _oauth(client, "t")
    assert r2.status_code == 200, r2.text
    assert "pedir_consentimiento" not in r2.json()


def test_invitacion_pendiente_con_solo_la_version_anterior_da_428(client, admin):
    """El mismo criterio en la puerta de la membresía NUEVA: haber aceptado la
    versión anterior no vale como consentimiento vigente -- 428, y ninguna
    membresía creada."""
    from app.models.consentimiento import VERSION_POLITICA

    # Primer cliente + primera membresía, para tener el usuario en el registro.
    _invitar(client, admin, "viejo-invitado@x.co", rol="worker")
    _usar_verificador(client, {"t": _claims("uid-vi", "viejo-invitado@x.co")})
    assert _oauth(client, "t", acepta_politica=True).status_code == 200
    usuario_id = _fila_de_consentimiento_a_mano("viejo-invitado@x.co", VERSION_ANTERIOR)

    # Una invitación NUEVA a otro cliente: crea membresía, así que exige
    # consentimiento VIGENTE.
    _usar_verificador(client, {
        "t": _claims("uid-vi", "viejo-invitado@x.co"),
        "f": _claims("uid-fund2", "fundador2@x.co"),
    })
    alta = _alta(client, "f", "otromercado", "Otro Mercado")
    assert alta.status_code == 200, alta.text
    cab_owner2 = {"Authorization": f"Bearer {alta.json()['token']}"}
    _invitar(client, cab_owner2, "viejo-invitado@x.co", rol="worker")

    r = _oauth(client, "t", cliente="otromercado")
    assert r.status_code == 428, r.text
    detalle = r.json()["detail"]
    assert detalle["codigo"] == "consentimiento_requerido"
    assert detalle["version"] == VERSION_POLITICA  # avisa CUÁL falta, no la vieja

    from app.clientes import sesion_registro
    from app.models.identidad import Membresia

    reg = sesion_registro()
    try:
        assert (
            reg.query(Membresia)
            .filter(Membresia.usuario_id == usuario_id, Membresia.cliente_slug == "otromercado")
            .first()
            is None
        )
    finally:
        reg.close()


def test_el_login_legado_no_se_entera_del_cambio_de_version(client):
    """El legado (clave compartida) no tiene cuenta ni consentimiento que
    registrar: la subida de versión no le agrega ni un campo ni un rechazo.
    200, el MISMO cuerpo de siempre, y ``/aceptar-politica`` le sigue dando
    403 por construcción."""
    r = client.post("/api/auth/login", json={"password": CLAVE_ADMIN})
    assert r.status_code == 200, r.text
    body = r.json()
    assert set(body.keys()) == {"token", "role", "cliente", "cliente_nombre"}
    assert "pedir_consentimiento" not in body
    assert "version" not in body

    cab = {"Authorization": f"Bearer {body['token']}"}
    assert client.post("/api/auth/aceptar-politica", headers=cab).status_code == 403


# ════════════════════════════════════════════════════════════════════════════
# La constante y el documento dicen lo mismo: [G]
# ════════════════════════════════════════════════════════════════════════════

def _texto_politica():
    from pathlib import Path

    raiz = Path(__file__).resolve().parents[2]
    fuente = raiz / "docs" / "legal" / "politica-datos.md"
    copia = raiz / "frontend" / "src" / "legal" / "politica-datos.md"
    return fuente, copia, fuente.read_text(encoding="utf-8")


def test_la_constante_es_la_version_de_fase_7():
    """El literal se afirma acá y en NINGÚN otro test: el resto compara contra
    la constante importada."""
    from app.models.consentimiento import VERSION_POLITICA

    assert VERSION_POLITICA == "2026-09-v2"


def test_el_encabezado_y_el_versionado_de_la_politica_traen_la_version_vigente():
    """La cabecera del documento y su sección de vigencia y versionado nombran
    la MISMA cadena que la constante -- si divergen, la constancia de
    consentimiento apunta a un texto que no existe. El historial de versiones
    tiene que dejar dicho qué cambió en esta."""
    from app.models.consentimiento import VERSION_POLITICA

    fuente, copia, texto = _texto_politica()

    cabecera = texto.splitlines()[4]
    assert VERSION_POLITICA in cabecera, cabecera
    assert "Vigencia: septiembre 2026" in cabecera, cabecera

    versionado = texto[texto.index("## 11. Vigencia y versionado"):]
    assert f"**Versión de esta política: {VERSION_POLITICA}.**" in versionado
    assert "Historial de versiones" in versionado
    linea = next(
        (l for l in versionado.splitlines() if l.startswith(f"| **{VERSION_POLITICA}**")), None,
    )
    assert linea is not None, "falta la fila de esta versión en el historial"
    bajo = linea.lower()
    assert "agregados exactos" in bajo and "sin umbral" in bajo
    assert "reporte de transparencia" in bajo

    # La versión anterior no se borra del historial: es lo que aceptaron las
    # filas viejas de `consentimientos`.
    assert VERSION_ANTERIOR in versionado

    assert fuente.read_bytes() == copia.read_bytes(), (
        "la copia del frontend divergió de docs/legal/politica-datos.md")


def test_la_politica_declara_el_re_consentimiento_por_cambio_de_version():
    """§4.1 (la base de legalidad) tiene que decir que un cambio de versión
    vuelve a pedir la aceptación, y §7 tiene que listar el reporte de
    transparencia al lado del export y de la supresión."""
    _fuente, _copia, texto = _texto_politica()

    cuatro_uno = texto[texto.index("### 4.1"):texto.index("### 4.2")]
    bajo = cuatro_uno.lower()
    assert "vuelve a pedir la aceptación" in bajo
    assert "2026-09-v2" in cuatro_uno

    siete = texto[texto.index("## 7. Derechos del titular"):texto.index("## 8.")]
    assert "mi-reporte-plataforma" in siete
    assert "Reporte de transparencia" in siete
    assert "mi-export" in siete and "solicitar-supresion" in siete


# ════════════════════════════════════════════════════════════════════════════
# El export dice qué versión rige: [H]
# ════════════════════════════════════════════════════════════════════════════

def test_mi_export_devuelve_la_version_vigente(client):
    """``/mi-export`` publica ``version_politica``: contra la CONSTANTE, no
    contra un literal -- el mismo contrato que fija ``test_derechos.py``,
    afirmado acá porque lo que se prueba es la subida de versión."""
    from app.models.consentimiento import VERSION_POLITICA

    _usar_verificador(client, {"t": _claims("uid-exp", "exp@x.co")})
    alta = _alta(client, "t", "exportador", "Exportador")
    assert alta.status_code == 200, alta.text
    cab = _cab(alta.json()["token"])

    r = client.get("/api/clientes/mi-export", headers=cab)
    assert r.status_code == 200, r.text
    assert r.json()["version_politica"] == VERSION_POLITICA
