"""El catch-all del SPA no sirve archivos de afuera de ``dist`` (auditoría
pre-lanzamiento, P0-1).

Antes armaba ``dist / full_path``: ``GET /%2e%2e/%2e%2e/backend/app/main.py``,
``//etc/passwd`` o ``/%2Fetc%2Fhostname`` devolvían el archivo (el código del
servidor, y en un despliegue con SQLite, la base entera). Estas pruebas montan
el SPA sobre un ``dist`` de mentira, así que corren siempre —también en el job
de backend de CI, donde no hay build— en vez de saltarse.
"""
from pathlib import Path

import pytest


@pytest.fixture()
def spa(tmp_path):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from app.main import montar_spa

    dist = tmp_path / "frontend" / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text("<!doctype html><title>SPA</title>")
    (dist / "robots.txt").write_text("User-agent: *")
    (dist / "assets" / "app.js").write_text("console.log(1)")
    # Lo que NO tiene que salir: un «secreto» al lado de dist y una base.
    (tmp_path / "frontend" / "secreto.txt").write_text("CLAVE")
    (tmp_path / "base.db").write_bytes(b"SQLite format 3\x00datos")
    # Un enlace simbólico dentro de dist que apunta afuera.
    (dist / "atajo.txt").symlink_to(tmp_path / "frontend" / "secreto.txt")
    app = FastAPI()
    montar_spa(app, dist)
    return TestClient(app), tmp_path


ATAQUES = [
    "/%2e%2e/secreto.txt",
    "/%2e%2e/%2e%2e/base.db",
    "/..%2fsecreto.txt",
    "/..%2f..%2fbase.db",
    "//etc/hostname",
    "/%2Fetc%2Fhostname",
    "/%2fetc%2fpasswd",
    "/atajo.txt",
    "/assets/..%2f..%2fsecreto.txt",
]


@pytest.mark.parametrize("ruta", ATAQUES)
def test_nada_de_afuera_de_dist(spa, ruta):
    c, _tmp = spa
    r = c.get(ruta)
    assert b"CLAVE" not in r.content
    assert b"SQLite format 3" not in r.content
    assert b"root:" not in r.content
    if r.status_code == 200:
        assert r.content.startswith(b"<!doctype html>"), f"{ruta} sirvió otra cosa que el index"


def test_lo_legitimo_sigue_saliendo(spa):
    c, _tmp = spa
    assert c.get("/").content.startswith(b"<!doctype html>")
    assert c.get("/contratos").content.startswith(b"<!doctype html>")
    assert c.get("/plano/3d").content.startswith(b"<!doctype html>")
    assert c.get("/robots.txt").text == "User-agent: *"
    assert c.get("/assets/app.js").text == "console.log(1)"
    assert c.get("/api/no-existe").status_code == 404


def test_la_eleccion_del_archivo(tmp_path):
    from app.main import archivo_de_la_spa

    dist = tmp_path / "dist"
    dist.mkdir()
    (dist / "index.html").write_text("i")
    (dist / "robots.txt").write_text("r")
    (tmp_path / "fuera.txt").write_text("f")
    indice = dist / "index.html"
    assert archivo_de_la_spa(dist, "robots.txt") == (dist / "robots.txt").resolve()
    for ruta in ["", ".", "..", "../fuera.txt", "/etc/passwd", "a/b", "..\\fuera.txt", "no-existe.txt", str(tmp_path / "fuera.txt")]:
        assert archivo_de_la_spa(dist, ruta) == indice, ruta
