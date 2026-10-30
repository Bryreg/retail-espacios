"""Términos del servicio con aceptación versionada (auditoría pre-lanzamiento,
P0-2, la parte de producto).

Lo que fija:

* el texto que muestra el servidor es copia byte a byte del borrador de
  ``docs/legal/borradores/``;
* sin ``TERMINOS_VIGENTES`` todo es como antes: nadie ve ni acepta términos;
* con la variable puesta pero el texto todavía borrador (o de otra versión),
  tampoco: un borrador no se publica por error;
* con términos vigentes de verdad, el alta los exige con su versión y guarda la
  constancia con la versión de la política; la dueña de un supermercado que ya
  existía los acepta desde el aviso al entrar; nadie más.
"""
from pathlib import Path
from types import SimpleNamespace

RAIZ = Path(__file__).resolve().parents[2]
VERSION = "2099-01-v1"
TEXTO_LIMPIO = f"""# Términos del servicio de RECABRA

**Versión: {VERSION} · del 2099-01-01**

## 1. Qué es

Un texto de prueba, sin marcas.
"""


class FakeVerificador:
    def __init__(self, mapa: dict):
        self.mapa = mapa

    def verificar(self, id_token):
        return self.mapa.get(id_token)


def _cab(token):
    return {"Authorization": f"Bearer {token}"}


def _verificador(client):
    from app.services.firebase_tokens import get_verificador

    mapa = {}
    client.app.dependency_overrides[get_verificador] = lambda: FakeVerificador(mapa)
    return mapa


def _claims(uid, email):
    return SimpleNamespace(uid=uid, email=email, email_verificado=True, proveedor="google.com", nombre=None)


def _alta(client, mapa, uid, email, slug, **extra):
    mapa[uid] = _claims(uid, email)
    return client.post("/api/clientes/alta", json={
        "id_token": uid, "slug": slug, "nombre": slug.title(), "acepta_politica": True, **extra})


def _vigentes(monkeypatch, tmp_path, texto=TEXTO_LIMPIO, version=VERSION):
    import app.services.terminos as terminos

    archivo = tmp_path / "terminos.md"
    archivo.write_text(texto, encoding="utf-8")
    monkeypatch.setattr(terminos, "ARCHIVO", archivo)
    monkeypatch.setenv("TERMINOS_VIGENTES", version)


def _aceptaciones():
    from app.clientes import sesion_registro
    from app.models.terminos import AceptacionDeTerminos

    reg = sesion_registro()
    try:
        return [(a.cliente_slug, a.version_terminos, a.version_politica, a.origen)
                for a in reg.query(AceptacionDeTerminos).order_by(AceptacionDeTerminos.id)]
    finally:
        reg.close()


# ─── El texto ─────────────────────────────────────────────────────────────────

def test_la_copia_del_servidor_es_el_borrador():
    fuente = RAIZ / "docs" / "legal" / "borradores" / "terminos-servicio.md"
    copia = RAIZ / "backend" / "app" / "legal" / "terminos-servicio.md"
    assert fuente.read_bytes() == copia.read_bytes(), (
        "backend/app/legal/terminos-servicio.md divergió del borrador: se edita el de docs y se copia")


def test_el_borrador_tiene_version_y_sigue_siendo_borrador():
    from app.services.terminos import ARCHIVO, marcas_de_borrador, version_del_archivo

    texto = ARCHIVO.read_text(encoding="utf-8")
    assert version_del_archivo(texto) == "2026-10-v1"
    # Mientras el abogado no lo revise, el sistema no lo publica.
    assert "[COMPLETAR" in marcas_de_borrador(texto)


# ─── Apagado ──────────────────────────────────────────────────────────────────

def test_sin_la_variable_no_hay_terminos_y_el_alta_es_la_de_siempre(client, monkeypatch):
    monkeypatch.delenv("TERMINOS_VIGENTES", raising=False)
    r = client.get("/api/auth/terminos")
    assert r.status_code == 200
    assert r.json() == {"vigente": False, "version": None, "texto": None}

    mapa = _verificador(client)
    r = _alta(client, mapa, "uid-a", "a@acme.example", "acme")
    assert r.status_code == 200, r.text
    assert _aceptaciones() == []
    r = client.post("/api/auth/oauth", json={"id_token": "uid-a"})
    assert r.status_code == 200
    assert "pedir_terminos" not in r.json()
    r = client.post("/api/auth/aceptar-terminos", json={"version": "2026-10-v1"}, headers=_cab(r.json()["token"]))
    assert r.status_code == 409


def test_con_la_variable_pero_el_borrador_no_se_publica(client, monkeypatch, caplog):
    import logging

    monkeypatch.setenv("TERMINOS_VIGENTES", "2026-10-v1")  # la versión del borrador real
    with caplog.at_level(logging.WARNING, logger="recabra.terminos"):
        r = client.get("/api/auth/terminos")
    assert r.json()["vigente"] is False
    assert "borrador" in caplog.text

    mapa = _verificador(client)
    assert _alta(client, mapa, "uid-a", "a@acme.example", "acme").status_code == 200
    assert _aceptaciones() == []


def test_una_version_que_no_es_la_del_archivo_no_rige(client, monkeypatch, tmp_path):
    _vigentes(monkeypatch, tmp_path, version="2099-02-v9")
    assert client.get("/api/auth/terminos").json()["vigente"] is False


# ─── Prendido ─────────────────────────────────────────────────────────────────

def test_terminos_vigentes_se_publican(client, monkeypatch, tmp_path):
    _vigentes(monkeypatch, tmp_path)
    cuerpo = client.get("/api/auth/terminos").json()
    assert cuerpo["vigente"] is True and cuerpo["version"] == VERSION
    assert "Un texto de prueba" in cuerpo["texto"]


def test_el_alta_exige_los_terminos_con_su_version(client, monkeypatch, tmp_path):
    from app.models.consentimiento import VERSION_POLITICA

    _vigentes(monkeypatch, tmp_path)
    mapa = _verificador(client)

    r = _alta(client, mapa, "uid-a", "a@acme.example", "acme")
    assert r.status_code == 422, r.text
    r = _alta(client, mapa, "uid-a", "a@acme.example", "acme", acepta_terminos=True, version_terminos="2098-v0")
    assert r.status_code == 409, r.text
    from app.clientes import buscar
    assert buscar("acme") is None, "un alta rechazada no puede fundar nada"

    r = _alta(client, mapa, "uid-a", "a@acme.example", "acme", acepta_terminos=True, version_terminos=VERSION)
    assert r.status_code == 200, r.text
    assert _aceptaciones() == [("acme", VERSION, VERSION_POLITICA, "alta")]

    # Ya los aceptó: al entrar no se le vuelven a pedir.
    r = client.post("/api/auth/oauth", json={"id_token": "uid-a"})
    assert "pedir_terminos" not in r.json()


def test_la_duena_de_antes_los_acepta_al_entrar_y_nadie_mas(client, monkeypatch, tmp_path):
    from app.models.consentimiento import VERSION_POLITICA

    monkeypatch.delenv("TERMINOS_VIGENTES", raising=False)
    mapa = _verificador(client)
    r = _alta(client, mapa, "uid-a", "a@acme.example", "acme")
    duena = _cab(r.json()["token"])
    assert client.post("/api/usuarios/invitar", json={"email": "b@acme.example", "rol": "admin"},
                       headers=duena).status_code == 200
    mapa["uid-b"] = _claims("uid-b", "b@acme.example")
    r = client.post("/api/auth/oauth", json={"id_token": "uid-b", "acepta_politica": True})
    admin_b = _cab(r.json()["token"])

    # Pasan a regir.
    _vigentes(monkeypatch, tmp_path)
    r = client.post("/api/auth/oauth", json={"id_token": "uid-a"})
    assert r.json()["pedir_terminos"] == VERSION
    duena = _cab(r.json()["token"])
    r = client.post("/api/auth/oauth", json={"id_token": "uid-b"})
    assert "pedir_terminos" not in r.json(), "los términos los acepta la dueña, no su gente"

    assert client.post("/api/auth/aceptar-terminos", json={"version": VERSION}, headers=admin_b).status_code == 403
    assert client.post("/api/auth/aceptar-terminos", json={"version": "2098-v0"}, headers=duena).status_code == 409
    assert client.post("/api/auth/aceptar-terminos", json={"version": VERSION}, headers=duena).status_code == 204
    # Dos toques del botón: una sola fila.
    assert client.post("/api/auth/aceptar-terminos", json={"version": VERSION}, headers=duena).status_code == 204
    assert _aceptaciones() == [("acme", VERSION, VERSION_POLITICA, "login")]

    r = client.post("/api/auth/oauth", json={"id_token": "uid-a"})
    assert "pedir_terminos" not in r.json()

    from app.clientes import buscar, sesion_de
    from app.models.models import AuditEntry

    db = sesion_de(buscar("acme"))
    try:
        assert db.query(AuditEntry).filter(AuditEntry.accion == "terminos.aceptados").count() == 1
    finally:
        db.close()


def test_aceptar_terminos_pide_cuenta_personal(client, admin, monkeypatch, tmp_path):
    _vigentes(monkeypatch, tmp_path)
    assert client.post("/api/auth/aceptar-terminos", json={"version": VERSION}, headers=admin).status_code == 403
