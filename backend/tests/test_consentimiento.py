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
