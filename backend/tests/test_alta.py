"""Alta self-service: un usuario Firebase sin membresías funda su cliente.

Mismo patrón que ``test_identidad.py``: verificador falso vía
``dependency_overrides`` y todo ``import app.*`` ADENTRO de las funciones —
`app.database` arma el motor al importarse y el fixture ``client`` purga
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


def _alta(client, id_token, slug, nombre):
    return client.post("/api/clientes/alta", json={"id_token": id_token, "slug": slug, "nombre": nombre})


# ════════════════════════════════════════════════════════════════════════════
# Alta feliz
# ════════════════════════════════════════════════════════════════════════════

def test_alta_feliz_funda_owner_y_base_vacia(client):
    _usar_verificador(client, {"t": _claims("uid-f", "fundador@x.co")})
    r = _alta(client, "t", "nuevomarket", "Nuevo Market")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["role"] == "admin"
    assert body["cliente"] == "nuevomarket"
    assert body["cliente_nombre"] == "Nuevo Market"
    assert body["email"] == "fundador@x.co"
    assert "token" in body

    # El token sirve para entrar como admin del cliente recién fundado.
    assert client.get("/api/spaces/", headers=_cab(body["token"])).status_code == 200

    from app.clientes import sesion_registro
    from app.models.identidad import Membresia, Usuario
    from app.models.plataforma import Fundacion

    reg = sesion_registro()
    try:
        usuario = reg.query(Usuario).filter(Usuario.email == "fundador@x.co").first()
        assert usuario is not None
        assert usuario.firebase_uid == "uid-f"

        membresia = (
            reg.query(Membresia)
            .filter(Membresia.usuario_id == usuario.id, Membresia.cliente_slug == "nuevomarket")
            .first()
        )
        assert membresia is not None
        assert membresia.rol == "owner"
        assert membresia.activo is True

        fundacion = (
            reg.query(Fundacion)
            .filter(Fundacion.usuario_id == usuario.id, Fundacion.cliente_slug == "nuevomarket")
            .first()
        )
        assert fundacion is not None
    finally:
        reg.close()

    # La base nueva arranca vacía: sin los pasillos que se siembran en galerias.
    from app.clientes import buscar, sesion_de
    from app.models.models import Space

    cliente = buscar("nuevomarket")
    cdb = sesion_de(cliente)
    try:
        assert cdb.query(Space).count() == 0
    finally:
        cdb.close()


# ════════════════════════════════════════════════════════════════════════════
# Validaciones de entrada
# ════════════════════════════════════════════════════════════════════════════

def test_slug_invalido_da_422(client):
    _usar_verificador(client, {"t": _claims("uid-1", "uno@x.co")})
    r = _alta(client, "t", "Con Espacios!", "Mi Super")
    assert r.status_code == 422


def test_nombre_vacio_da_422(client):
    _usar_verificador(client, {"t": _claims("uid-2", "dos@x.co")})
    r = _alta(client, "t", "unslug", "   ")
    assert r.status_code == 422


def test_slug_reservado_da_409(client):
    _usar_verificador(client, {"t": _claims("uid-3", "tres@x.co")})
    r = _alta(client, "t", "admin", "Admin Market")
    assert r.status_code == 409
    assert "tomado" in r.json()["detail"].lower()


def test_slug_duplicado_con_galerias_da_409(client):
    _usar_verificador(client, {"t": _claims("uid-4", "cuatro@x.co")})
    r = _alta(client, "t", "galerias", "Otra Galerias")
    assert r.status_code == 409
    assert "tomado" in r.json()["detail"].lower()


# ════════════════════════════════════════════════════════════════════════════
# Tope de fundaciones por usuario
# ════════════════════════════════════════════════════════════════════════════

def test_tercer_intento_del_mismo_usuario_da_403(client):
    _usar_verificador(client, {"t": _claims("uid-tope", "tope@x.co")})
    assert _alta(client, "t", "primero", "Primero").status_code == 200
    assert _alta(client, "t", "segundo", "Segundo").status_code == 200
    r = _alta(client, "t", "tercero", "Tercero")
    assert r.status_code == 403
    assert "máximo" in r.json()["detail"].lower()


# ════════════════════════════════════════════════════════════════════════════
# Token inválido / correo no confiable
# ════════════════════════════════════════════════════════════════════════════

def test_401_si_el_id_token_no_verifica(client):
    _usar_verificador(client, {})  # el falso no reconoce ningún token
    r = _alta(client, "lo-que-sea", "unslug", "Mi Super")
    assert r.status_code == 401


def test_correo_no_verificado_por_password_da_401(client):
    _usar_verificador(client, {
        "t": _claims("uid-nv", "sinverificar@x.co", verificado=False, proveedor="password"),
    })
    r = _alta(client, "t", "unslug", "Mi Super")
    assert r.status_code == 401


# ════════════════════════════════════════════════════════════════════════════
# Freno de fuerza bruta — tabla propia, no contamina las otras
# ════════════════════════════════════════════════════════════════════════════

def test_429_tras_10_fallos_y_no_contamina_otras_tablas(client):
    _usar_verificador(client, {})
    for _ in range(10):
        assert _alta(client, "malo", "unslug", "Mi Super").status_code == 401
    r = _alta(client, "malo", "unslug", "Mi Super")
    assert r.status_code == 429

    from app.clientes import sesion_registro
    from app.models.identidad import IntentoOauth
    from app.models.models import LoginAttempt
    from app.models.plataforma import IntentoAlta

    reg = sesion_registro()
    try:
        assert reg.query(IntentoAlta).count() >= 10
        assert reg.query(IntentoOauth).count() == 0
        assert reg.query(LoginAttempt).count() == 0
    finally:
        reg.close()


# ════════════════════════════════════════════════════════════════════════════
# 503 sin verificador configurado
# ════════════════════════════════════════════════════════════════════════════

def test_503_sin_verificador_configurado(client):
    r = _alta(client, "cualquier-cosa", "unslug", "Mi Super")
    assert r.status_code == 503
    assert "no configurado" in r.json()["detail"].lower()

    # El resto de la app sigue andando: el login legado, por ejemplo.
    assert client.post("/api/auth/login", json={"password": CLAVE_ADMIN}).status_code == 200
