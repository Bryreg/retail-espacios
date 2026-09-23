"""Pasar los datos de un cliente a la base principal (`services/traspaso.py`).

El caso que lo pidió (2026-09-23): el supermercado real del dueño de la
plataforma vivía con el código `pepito`, y `galerias` —el de la base
principal— tenía los datos de práctica de la instalación original. «Quiero que
quede desde el código como Galerías.»

Lo que estas pruebas fijan:

* los datos de negocio del origen llegan IDÉNTICOS al principal, tabla por
  tabla, archivos incluidos, y los de práctica no quedan;
* el registro acompaña: la dueña entra a `galerias` con su cuenta de siempre,
  las invitaciones pendientes del origen llevan a `galerias`, y las del
  principal viejo no llevan a ninguna parte;
* ninguna sesión de antes sobrevive (ni la del origen ni la del principal);
* el origen queda archivado e intacto, de respaldo;
* todo o nada: una falla a la mitad no cambia nada;
* una tabla sin clasificar frena el traspaso antes de tocar nada.
"""
import datetime as dt
from types import SimpleNamespace

import pytest
from sqlalchemy import select


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


def _motor(slug, db_name):
    from app.clientes import Cliente, motor_de
    return motor_de(Cliente(slug=slug, nombre=slug, db_name=db_name))


def _contenido(motor):
    """Tabla → filas ordenadas, de TODAS las tablas de negocio."""
    from app.services.traspaso import _tablas_del_cliente

    fuera = {}
    with motor.connect() as cx:
        for tabla in _tablas_del_cliente():
            filas = [tuple(f) for f in cx.execute(select(tabla)).all()]
            fuera[tabla.name] = sorted(filas, key=repr)
    return fuera


def _registro(modelo, *condiciones):
    from app.clientes import sesion_registro

    reg = sesion_registro()
    try:
        return reg.query(modelo).filter(*condiciones).all()
    finally:
        reg.close()


@pytest.fixture()
def escenario(client, admin, monkeypatch):
    """Galerías con datos de práctica, suspendida; Pepito con los reales."""
    from app.clientes import sesion_registro
    from app.database import engine as motor_principal
    from app.models.models import AppConfig, Space, SpaceFile, SpaceLease, Supplier
    from app.models.plataforma import SnapshotMetricas
    from sqlalchemy.orm import Session

    # ── La operadora (su propio cliente, para tener sesión de consola) ──────
    cab_op = _fundar(client, "uid-op", "op@plataforma.co", "consola", "Consola")
    monkeypatch.setenv("OPERADOR_EMAILS", "op@plataforma.co")

    # ── Galerías: práctica ──────────────────────────────────────────────────
    assert client.post("/api/suppliers/", json={"name": "Práctica SA"}, headers=admin).status_code == 201
    r = client.post("/api/usuarios/invitar", json={"email": "vieja@x.co", "rol": "admin"}, headers=admin)
    assert r.status_code == 200
    r = client.post("/api/usuarios/invitar", json={"email": "practica@x.co", "rol": "worker"}, headers=admin)
    assert r.status_code == 200
    assert _oauth(client, "uid-prac", "practica@x.co").status_code == 200
    assert client.patch(
        "/api/plataforma/clientes/galerias", json={"estado": "suspendido", "motivo": "práctica"}, headers=cab_op,
    ).status_code == 200

    # ── Pepito: lo real ─────────────────────────────────────────────────────
    cab_pepito = _fundar(client, "uid-bray", "brayan@gmail.com", "pepito", "Pepito")
    prov = client.post("/api/suppliers/", json={"name": "Proveedor Real"}, headers=cab_pepito)
    assert prov.status_code == 201, prov.text
    r = client.put(
        "/api/layout/settings",
        json={"sedes": ["TERRON"], "catalog_labels": {"punta": "Punta de góndola"}},
        headers=cab_pepito,
    )
    assert r.status_code == 200, r.text
    r = client.post("/api/usuarios/invitar", json={"email": "mercaderista@x.co", "rol": "worker"}, headers=cab_pepito)
    assert r.status_code == 200
    motor_pepito = _motor("pepito", "recabra_pepito")
    with Session(motor_pepito) as s:
        espacio = Space(code="TER-PUN-01", svg_id="fix-TER-PUN-01", name="Punta 1", zone="PUN",
                        sede="TERRON", area_m2=1.5)
        s.add(espacio)
        s.flush()
        s.add(SpaceLease(space_id=espacio.id, supplier_id=prov.json()["id"], marca="Marca Real",
                         start_date=dt.date(2026, 9, 1), end_date=dt.date(2026, 12, 31),
                         monthly_rent=1_234_567, is_active=True))
        s.add(SpaceFile(space_id=espacio.id, filename="contrato.pdf", content_type="application/pdf",
                        size=5, data=b"%PDF-"))
        s.merge(AppConfig(key="notify_emails", value="real@galerias.co"))
        s.commit()
    # Algo de práctica con archivo, para ver que se va.
    with Session(motor_principal) as s:
        primero = s.query(Space).first()
        s.add(SpaceFile(space_id=primero.id, filename="viejo.pdf", content_type="application/pdf",
                        size=3, data=b"old"))
        s.commit()
    reg = sesion_registro()
    try:
        reg.add(SnapshotMetricas(cliente_slug="pepito", periodo="2025-01"))
        reg.add(SnapshotMetricas(cliente_slug="galerias", periodo="2025-01"))
        reg.commit()
    finally:
        reg.close()
    # Una consulta del operador sobre Pepito: la bitácora la anota con su slug.
    assert client.get("/api/plataforma/clientes/pepito/detalle", headers=cab_op).status_code == 200

    return SimpleNamespace(cab_op=cab_op, cab_pepito=cab_pepito, cab_legado=admin, motor_pepito=motor_pepito)


def _pasar(client, cab, slug="pepito", confirmacion="galerias"):
    return client.post(
        f"/api/plataforma/clientes/{slug}/pasar-al-principal", json={"confirmacion": confirmacion}, headers=cab,
    )


# ─── El caso del dueño ────────────────────────────────────────────────────────

def test_los_datos_de_pepito_pasan_a_galerias_identicos(client, escenario):
    from app.database import engine as motor_principal

    antes_pepito = _contenido(escenario.motor_pepito)
    r = _pasar(client, escenario.cab_op)
    assert r.status_code == 200, r.text
    assert r.json()["principal"] == "galerias" and r.json()["origen"] == "pepito"
    assert r.json()["filas"]["spaces"] == 1 and r.json()["filas"]["space_files"] == 1

    despues_principal = _contenido(motor_principal)
    for tabla, filas in antes_pepito.items():
        if tabla == "app_config":
            continue  # lleva además la generación y las épocas nuevas, abajo
        assert despues_principal[tabla] == filas, tabla
    # La configuración de Pepito llegó entera, más la marca de generación.
    config = dict(despues_principal["app_config"])
    for clave, valor in antes_pepito["app_config"]:
        if not clave.startswith("token_epoch_"):
            assert config[clave] == valor, clave
    assert config.get("generacion_datos")
    # Y el origen quedó intacto, de respaldo.
    assert _contenido(escenario.motor_pepito) == antes_pepito


def test_la_duenia_entra_a_galerias_y_ve_lo_suyo(client, escenario):
    assert _pasar(client, escenario.cab_op).status_code == 200

    r = _oauth(client, "uid-bray", "brayan@gmail.com")
    assert r.status_code == 200, r.text
    assert (r.json()["cliente"], r.json()["role"]) == ("galerias", "admin")
    cab = _cab(r.json()["token"])
    nombres = {p["name"] for p in client.get("/api/suppliers/", headers=cab).json()}
    assert "Proveedor Real" in nombres and "Práctica SA" not in nombres
    ajustes = client.get("/api/layout/settings", headers=cab).json()
    assert ajustes["sedes"] == ["TERRON"]
    assert ajustes["generacion"], "sin generación, un navegador viejo subiría los planos de práctica"
    reporte = client.get("/api/clientes/mi-reporte-plataforma", headers=cab).json()
    acciones = [l["accion"] for l in reporte["accesos"]["lineas"]]
    assert "traspaso" in acciones and "detalle" in acciones, acciones

    # La invitación pendiente de Pepito lleva a Galerías.
    r = _oauth(client, "uid-merc", "mercaderista@x.co")
    assert r.status_code == 200, r.text
    assert (r.json()["cliente"], r.json()["role"]) == ("galerias", "worker")


def test_el_registro_acompania_y_lo_viejo_del_principal_se_va(client, escenario):
    from app.models.identidad import Invitacion, Membresia
    from app.models.models import ClienteRow
    from app.models.plataforma import BitacoraPlataforma, EstadoCliente, Fundacion, SnapshotMetricas

    assert _pasar(client, escenario.cab_op).status_code == 200

    assert _registro(Membresia, Membresia.cliente_slug == "pepito") == []
    miembros = _registro(Membresia, Membresia.cliente_slug == "galerias")
    assert [(m.rol, m.activo) for m in miembros] == [("owner", True)], "la de práctica no sigue"
    invit = {i.email for i in _registro(Invitacion, Invitacion.cliente_slug == "galerias")}
    assert invit == {"mercaderista@x.co"}, "una invitación de práctica llevaría a los datos reales"
    assert _registro(EstadoCliente, EstadoCliente.slug == "galerias") == [], "Galerías queda activa"
    assert [f.cliente_slug for f in _registro(Fundacion)] .count("galerias") == 1
    assert {s.cliente_slug for s in _registro(SnapshotMetricas, SnapshotMetricas.periodo == "2025-01")} == {"galerias"}
    periodos = [b.periodo for b in _registro(BitacoraPlataforma)]
    assert not any(p.startswith("pepito:") for p in periodos)
    (galerias,) = _registro(ClienteRow, ClienteRow.slug == "galerias")
    (pepito,) = _registro(ClienteRow, ClienteRow.slug == "pepito")
    assert galerias.activo is True and pepito.activo is False
    assert galerias.nombre == "Galerías"

    # La cuenta de práctica ya no entra a ningún lado.
    assert _oauth(client, "uid-prac", "practica@x.co").status_code == 403


def test_ninguna_sesion_de_antes_sobrevive(client, escenario):
    from app.auth import create_token, epoca_de
    from app.clientes import sesion_registro

    # La sesión de consola de un operador SIN supermercado propio: su época es
    # la del rol worker de la base principal.
    reg = sesion_registro()
    try:
        consola = _cab(create_token("worker", epoca_de(reg, "worker"), "plataforma", sub=999, email="op@plataforma.co"))
    finally:
        reg.close()
    assert client.get("/api/plataforma/clientes", headers=consola).status_code == 200

    assert _pasar(client, escenario.cab_op).status_code == 200
    assert client.get("/api/spaces/", headers=escenario.cab_pepito).status_code == 401
    assert client.get("/api/spaces/", headers=escenario.cab_legado).status_code == 401
    # Esa época subió con el traspaso: la operadora vuelve a entrar.
    assert client.get("/api/plataforma/clientes", headers=consola).status_code == 401
    # La de una operadora que entró con SU supermercado no depende de la base
    # principal, y sigue.
    assert client.get("/api/plataforma/clientes", headers=escenario.cab_op).status_code == 200


# ─── Rechazos ─────────────────────────────────────────────────────────────────

def test_rechazos(client, escenario):
    from app.models.models import ClienteRow

    assert _pasar(client, escenario.cab_pepito).status_code == 403
    assert _pasar(client, escenario.cab_legado).status_code == 403
    r = _pasar(client, escenario.cab_op, confirmacion="pepito")
    assert r.status_code == 422 and "galerias" in r.json()["detail"]
    assert _pasar(client, escenario.cab_op, slug="galerias").status_code == 409
    assert _pasar(client, escenario.cab_op, slug="noexiste").status_code == 404
    # Un archivado es el respaldo de un traspaso: pasarlo otra vez pisaría lo
    # trabajado después en el principal.
    assert client.post("/api/plataforma/clientes/pepito/archivar", json={"motivo": "x"}, headers=escenario.cab_op).status_code == 200
    r = _pasar(client, escenario.cab_op)
    assert r.status_code == 409 and "archivado" in r.json()["detail"]
    assert client.post("/api/plataforma/clientes/pepito/reactivar", json={"motivo": "x"}, headers=escenario.cab_op).status_code == 200
    # Nada cambió: Pepito sigue activo y con su dueña.
    (pepito,) = _registro(ClienteRow, ClienteRow.slug == "pepito")
    assert pepito.activo is True
    assert client.get("/api/spaces/", headers=escenario.cab_pepito).status_code == 200


# ─── Todo o nada ──────────────────────────────────────────────────────────────

def test_una_falla_a_la_mitad_no_cambia_nada(client, escenario, monkeypatch):
    from app.database import engine as motor_principal
    from app.models.identidad import Membresia
    from app.models.models import ClienteRow
    from app.models.plataforma import EstadoCliente
    import app.services.traspaso as traspaso

    antes_principal = _contenido(motor_principal)
    original = traspaso._copiar

    def _copiar_y_romper(origen, destino, tabla):
        n = original(origen, destino, tabla)
        if tabla.name == "space_leases":
            raise RuntimeError("se cortó la conexión a la mitad")
        return n

    monkeypatch.setattr(traspaso, "_copiar", _copiar_y_romper)
    with pytest.raises(RuntimeError):
        traspaso.traspasar_al_principal("pepito")

    assert _contenido(motor_principal) == antes_principal, "quedaron datos a medias en la base principal"
    assert [m.rol for m in _registro(Membresia, Membresia.cliente_slug == "pepito")] == ["owner"]
    assert len(_registro(EstadoCliente, EstadoCliente.slug == "galerias")) == 1
    (pepito,) = _registro(ClienteRow, ClienteRow.slug == "pepito")
    assert pepito.activo is True, "el origen vuelve a quedar activo si el traspaso no se hizo"


def test_una_tabla_sin_clasificar_frena_antes_de_tocar_nada(client, escenario, monkeypatch):
    from app.models.models import ClienteRow
    import app.services.traspaso as traspaso

    monkeypatch.setattr(traspaso, "TABLAS_DEL_CLIENTE", traspaso.TABLAS_DEL_CLIENTE - {"audit_log"})
    r = _pasar(client, escenario.cab_op)
    assert r.status_code == 409 and "audit_log" in r.json()["detail"]
    (pepito,) = _registro(ClienteRow, ClienteRow.slug == "pepito")
    assert pepito.activo is True


def test_una_columna_que_falta_frena_sin_copiar_nada(client, escenario):
    from sqlalchemy import text
    from app.database import engine as motor_principal
    from app.models.models import ClienteRow

    antes = _contenido(motor_principal)
    with escenario.motor_pepito.begin() as cx:
        cx.execute(text("ALTER TABLE suppliers DROP COLUMN notes"))
    r = _pasar(client, escenario.cab_op)
    assert r.status_code == 409 and "suppliers.notes" in r.json()["detail"]
    assert _contenido(motor_principal) == antes
    (pepito,) = _registro(ClienteRow, ClienteRow.slug == "pepito")
    assert pepito.activo is True


def test_las_tablas_estan_clasificadas_una_sola_vez(client):
    """Una tabla nueva tiene que decidir de qué lado está ANTES de que el
    traspaso vuelva a correr: si fuera del registro y se vaciara como de
    negocio, se llevaría puesto el sistema entero."""
    from app.database import Base
    from app.services.traspaso import TABLAS_DEL_CLIENTE, TABLAS_DEL_REGISTRO, tablas_sin_clasificar

    assert tablas_sin_clasificar() == set()
    assert TABLAS_DEL_CLIENTE & TABLAS_DEL_REGISTRO == set()
    assert (TABLAS_DEL_CLIENTE | TABLAS_DEL_REGISTRO) <= set(Base.metadata.tables), "un nombre viejo en la lista"
    for nombre in ("usuarios", "membresias", "clientes", "invitaciones"):
        assert nombre in TABLAS_DEL_REGISTRO


def test_un_principal_archivado_vuelve_activo_con_los_datos_nuevos(client, escenario):
    from app.models.models import ClienteRow

    r = client.post("/api/plataforma/clientes/galerias/archivar", json={"motivo": "práctica"}, headers=escenario.cab_op)
    assert r.status_code == 200
    assert _pasar(client, escenario.cab_op).status_code == 200
    (galerias,) = _registro(ClienteRow, ClienteRow.slug == "galerias")
    assert galerias.activo is True
    assert _oauth(client, "uid-bray", "brayan@gmail.com").json()["cliente"] == "galerias"
