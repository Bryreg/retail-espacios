"""El ciclo de vida de un cliente desde la consola: renombrar, archivar, borrar.

Pedido del dueño de la plataforma (2026-09-23): la consola mostraba cinco
clientes y él trabaja en uno, que además se llamaba «Pepito». Estas pruebas
fijan las tres operaciones y, sobre todo, sus candados: nadie más que un
operador las toca, archivar se deshace, borrar no — y por eso sólo se borra lo
ya archivado, nunca el cliente de la base por defecto, escribiendo el código.

La prueba que más importa es la de la herencia: un slug borrado y vuelto a
fundar NO puede traer miembros, invitaciones ni una suspensión del anterior.
"""
import glob
import os
from types import SimpleNamespace

import pytest


class FakeVerificador:
    def __init__(self, mapa: dict):
        self.mapa = mapa

    def verificar(self, id_token):
        return self.mapa.get(id_token)


def _claims(uid, email):
    return SimpleNamespace(uid=uid, email=email, email_verificado=True, proveedor="google.com", nombre=None)


def _usar_verificador(client, mapa: dict):
    from app.services.firebase_tokens import get_verificador
    client.app.dependency_overrides[get_verificador] = lambda: FakeVerificador(mapa)


def _cab(token):
    return {"Authorization": f"Bearer {token}"}


def _fundar(client, uid, email, slug, nombre):
    _usar_verificador(client, {uid: _claims(uid, email)})
    r = client.post(
        "/api/clientes/alta",
        json={"id_token": uid, "slug": slug, "nombre": nombre, "acepta_politica": True},
    )
    assert r.status_code == 200, r.text
    return _cab(r.json()["token"])


def _oauth(client, uid, email):
    _usar_verificador(client, {uid: _claims(uid, email)})
    return client.post("/api/auth/oauth", json={"id_token": uid, "acepta_politica": True})


@pytest.fixture()
def operador(client, monkeypatch):
    cab = _fundar(client, "uid-op", "op@plataforma.co", "consola", "Consola")
    monkeypatch.setenv("OPERADOR_EMAILS", "op@plataforma.co")
    return cab


def _archivar(client, cab, slug):
    r = client.post(f"/api/plataforma/clientes/{slug}/archivar", json={"motivo": "no se usa"}, headers=cab)
    assert r.status_code == 200, r.text
    return r.json()


def _bases():
    from app.database import SQLALCHEMY_DATABASE_URL

    carpeta = os.path.dirname(SQLALCHEMY_DATABASE_URL.replace("sqlite:///", "", 1))
    return {os.path.basename(p) for p in glob.glob(os.path.join(carpeta, "recabra_*.db"))}


def _cuantas(modelo, *condiciones):
    from app.clientes import sesion_registro

    reg = sesion_registro()
    try:
        return reg.query(modelo).filter(*condiciones).count()
    finally:
        reg.close()


def _bitacora(accion):
    from app.models.plataforma import BitacoraPlataforma
    from app.clientes import sesion_registro

    reg = sesion_registro()
    try:
        return [f.periodo for f in reg.query(BitacoraPlataforma).filter(BitacoraPlataforma.accion == accion).all()]
    finally:
        reg.close()


# ─── Nadie más que un operador ────────────────────────────────────────────────

def test_ni_una_cuenta_comun_ni_el_legado_tocan_el_ciclo(client, admin, monkeypatch):
    monkeypatch.setenv("OPERADOR_EMAILS", "alguien-mas@x.co")
    cab = _fundar(client, "uid-d", "duenia@x.co", "tienda", "Tienda")
    pedidos = (
        ("put", "/api/plataforma/clientes/galerias/nombre", {"nombre": "Otro"}),
        ("post", "/api/plataforma/clientes/galerias/archivar", {"motivo": "x"}),
        ("post", "/api/plataforma/clientes/galerias/reactivar", {"motivo": "x"}),
        ("post", "/api/plataforma/clientes/tienda/borrar", {"confirmacion": "tienda"}),
    )
    for metodo, ruta, cuerpo in pedidos:
        for cabecera in (cab, admin):
            r = getattr(client, metodo)(ruta, json=cuerpo, headers=cabecera)
            assert r.status_code == 403, (ruta, r.status_code)
    assert "recabra_tienda.db" in _bases()


# ─── Renombrar ────────────────────────────────────────────────────────────────

def test_renombrar_pepito_a_galerias_pide_archivar_la_vieja_antes(client, operador):
    cab_pepito = _fundar(client, "uid-b", "brayan@gmail.com", "pepito", "Pepito")

    r = client.put("/api/plataforma/clientes/pepito/nombre", json={"nombre": " Galerías "}, headers=operador)
    assert r.status_code == 409, r.text
    assert "galerias" in r.json()["detail"]

    _archivar(client, operador, "galerias")
    r = client.put("/api/plataforma/clientes/pepito/nombre", json={"nombre": " Galerías "}, headers=operador)
    assert r.status_code == 200, r.text
    assert r.json() == {"slug": "pepito", "nombre": "Galerías", "activo": True}

    consola = {c["slug"]: c for c in client.get("/api/plataforma/clientes", headers=operador).json()["clientes"]}
    assert consola["pepito"]["nombre"] == "Galerías"
    assert consola["galerias"]["activo"] is False

    # El dueño de Pepito sigue adentro: el slug —y su token— no cambiaron.
    assert client.get("/api/spaces/", headers=cab_pepito).status_code == 200
    # Y lo ve en su reporte de transparencia.
    reporte = client.get("/api/clientes/mi-reporte-plataforma", headers=cab_pepito).json()
    assert "renombre" in [l["accion"] for l in reporte["accesos"]["lineas"]]
    assert any(p.startswith("pepito:") for p in _bitacora("renombre"))


def test_renombrar_valida_lo_que_recibe(client, operador):
    put = lambda slug, nombre: client.put(  # noqa: E731
        f"/api/plataforma/clientes/{slug}/nombre", json={"nombre": nombre}, headers=operador
    )
    assert put("consola", "   ").status_code == 422
    assert put("consola", "x" * 61).status_code == 422
    assert put("noexiste", "Algo").status_code == 404
    assert put("consola", "Consola   Central").json()["nombre"] == "Consola Central"


# ─── Archivar y reactivar ─────────────────────────────────────────────────────

def test_archivar_corta_el_acceso_y_lo_saca_de_la_vista_sin_borrar_nada(client, operador):
    cab = _fundar(client, "uid-m", "medium@x.co", "medium", "Medium")
    assert client.get("/api/spaces/", headers=cab).status_code == 200

    assert client.post(
        "/api/plataforma/clientes/medium/archivar", json={"motivo": "  "}, headers=operador
    ).status_code == 422
    assert _archivar(client, operador, "medium")["activo"] is False

    assert client.get("/api/spaces/", headers=cab).status_code == 401
    assert _oauth(client, "uid-m", "medium@x.co").status_code == 403
    metricas = client.get("/api/plataforma/metricas", headers=operador).json()
    assert "medium" not in {c["slug"] for c in metricas["clientes"]}
    adopcion = client.get("/api/plataforma/adopcion", headers=operador).json()
    assert "medium" not in {c["slug"] for c in adopcion["clientes"]}
    consola = {c["slug"]: c for c in client.get("/api/plataforma/clientes", headers=operador).json()["clientes"]}
    assert consola["medium"]["activo"] is False
    assert "recabra_medium.db" in _bases(), "archivar no borra la base"

    r = client.post("/api/plataforma/clientes/medium/reactivar", json={"motivo": "volvió"}, headers=operador)
    assert r.status_code == 200, r.text
    assert _oauth(client, "uid-m", "medium@x.co").status_code == 200


def test_reactivar_no_deja_dos_clientes_activos_con_el_mismo_nombre(client, operador):
    _fundar(client, "uid-b", "brayan@gmail.com", "pepito", "Pepito")
    _archivar(client, operador, "galerias")
    client.put("/api/plataforma/clientes/pepito/nombre", json={"nombre": "Galerías"}, headers=operador)

    r = client.post("/api/plataforma/clientes/galerias/reactivar", json={"motivo": "x"}, headers=operador)
    assert r.status_code == 409
    assert "pepito" in r.json()["detail"]


def test_con_galerias_archivado_quien_tenia_los_dos_entra_directo_al_que_queda(client, operador):
    from app.clientes import sesion_registro
    from app.models.identidad import Membresia, Usuario

    _fundar(client, "uid-b", "brayan@gmail.com", "pepito", "Pepito")
    reg = sesion_registro()
    try:
        usuario = reg.query(Usuario).filter(Usuario.email == "brayan@gmail.com").first()
        reg.add(Membresia(usuario_id=usuario.id, cliente_slug="galerias", rol="admin", activo=True))
        reg.commit()
    finally:
        reg.close()
    assert _oauth(client, "uid-b", "brayan@gmail.com").json().get("requiere_cliente") is True

    _archivar(client, operador, "galerias")
    r = _oauth(client, "uid-b", "brayan@gmail.com")
    assert r.status_code == 200, r.text
    assert r.json()["cliente"] == "pepito"


# ─── Borrar ───────────────────────────────────────────────────────────────────

def test_borrar_pide_archivado_y_el_codigo_exacto(client, operador):
    _fundar(client, "uid-m", "medium@x.co", "medium", "Medium")
    borrar = lambda conf: client.post(  # noqa: E731
        "/api/plataforma/clientes/medium/borrar", json={"confirmacion": conf}, headers=operador
    )
    r = borrar("medium")
    assert r.status_code == 409 and "archival" in r.json()["detail"].lower()

    _archivar(client, operador, "medium")
    for mal in ("", "Medium ", "medio", "galerias"):
        if mal.strip().lower() == "medium":
            continue
        assert borrar(mal).status_code == 422, mal
    assert "recabra_medium.db" in _bases()
    assert client.post(
        "/api/plataforma/clientes/noexiste/borrar", json={"confirmacion": "noexiste"}, headers=operador
    ).status_code == 404


def test_el_cliente_de_siempre_se_archiva_pero_no_se_borra(client, operador):
    from app.models.models import ClienteRow

    # La consola lo sabe de antemano, para no ofrecer el botón.
    lista = {c["slug"]: c for c in client.get("/api/plataforma/clientes", headers=operador).json()["clientes"]}
    assert lista["galerias"]["base_principal"] is True
    assert lista["consola"]["base_principal"] is False

    _archivar(client, operador, "galerias")
    r = client.post("/api/plataforma/clientes/galerias/borrar", json={"confirmacion": "galerias"}, headers=operador)
    assert r.status_code == 409
    assert "base principal" in r.json()["detail"]
    assert _cuantas(ClienteRow, ClienteRow.slug == "galerias") == 1


def test_borrar_se_lleva_la_base_y_el_slug_vuelve_a_nacer_sin_herencia(client, operador):
    from app.models.identidad import Invitacion, Membresia, Usuario
    from app.models.models import ClienteRow
    from app.models.plataforma import EstadoCliente, Fundacion, SnapshotMetricas
    from app.clientes import sesion_registro

    cab_duenia = _fundar(client, "uid-m", "medium@x.co", "medium", "Medium")
    r = client.post("/api/usuarios/invitar", json={"email": "vieja@x.co", "rol": "worker"}, headers=cab_duenia)
    assert r.status_code == 200
    r = client.post("/api/usuarios/invitar", json={"email": "pendiente@x.co", "rol": "admin"}, headers=cab_duenia)
    assert r.status_code == 200
    assert _oauth(client, "uid-vieja", "vieja@x.co").json()["cliente"] == "medium"
    assert client.patch(
        "/api/plataforma/clientes/medium", json={"estado": "suspendido", "motivo": "mora"}, headers=operador
    ).status_code == 200
    reg = sesion_registro()
    try:
        reg.add(SnapshotMetricas(cliente_slug="medium", periodo="2026-08"))
        reg.commit()
    finally:
        reg.close()

    _archivar(client, operador, "medium")
    r = client.post("/api/plataforma/clientes/medium/borrar", json={"confirmacion": " MEDIUM "}, headers=operador)
    assert r.status_code == 200, r.text
    assert r.json() == {"ok": True, "slug": "medium"}

    assert "recabra_medium.db" not in _bases()
    for modelo, columna in (
        (ClienteRow, ClienteRow.slug),
        (Membresia, Membresia.cliente_slug),
        (Invitacion, Invitacion.cliente_slug),
        (EstadoCliente, EstadoCliente.slug),
        (Fundacion, Fundacion.cliente_slug),
        (SnapshotMetricas, SnapshotMetricas.cliente_slug),
    ):
        assert _cuantas(modelo, columna == "medium") == 0, modelo.__tablename__
    # Las personas quedan: pueden estar en otros supermercados.
    assert _cuantas(Usuario, Usuario.email == "vieja@x.co") == 1
    assert any(p.startswith("medium:") for p in _bitacora("borrado"))

    # El token de la dueña ya no abre nada.
    assert client.get("/api/spaces/", headers=cab_duenia).status_code == 401

    # Alguien más funda «medium» otra vez: arranca vacío, activo y SIN herencia.
    cab_nuevo = _fundar(client, "uid-n", "nuevo@x.co", "medium", "Medium Nuevo")
    assert client.get("/api/spaces/", headers=cab_nuevo).status_code == 200
    miembros = client.get("/api/usuarios", headers=cab_nuevo).json()
    assert [m["email"] for m in miembros["miembros"]] == ["nuevo@x.co"]
    assert miembros["invitaciones"] == []
    assert _oauth(client, "uid-vieja", "vieja@x.co").status_code == 403
    assert _oauth(client, "uid-pend", "pendiente@x.co").status_code == 403


def test_borrar_base_no_acepta_una_base_que_no_sea_la_propia(client):
    """La función de más abajo, sin HTTP: los tres candados antes del DROP."""
    from app.clientes import ErrorDeBaja, _db_por_defecto, borrar_base

    for slug, base in (
        ("medium", "recabra_otro"),
        ("medium", _db_por_defecto()),
        ("../x", "recabra_../x"),
        ("Medium", "recabra_Medium"),
    ):
        with pytest.raises(ErrorDeBaja):
            borrar_base(slug, base)
