"""La portada pública y el login, servidos por el mismo proceso (Fase 9).

La landing no agrega ni una ruta al backend: `/` ya se servía con el catch-all
del SPA de `main.py`. Lo que cambia es quién decide qué se ve —eso pasa en
`frontend/src/App.tsx`—, y por eso lo que hay que blindar acá es lo de
alrededor:

* `/` contesta el `index.html` **sin sesión y sin cookies**. Si un día alguien
  le pone un guard al catch-all, la página pública deja de existir y esta
  prueba lo dice.
* `/login`, `/login?invitacion=…` (el destino del correo de invitación, ver
  `routers/usuarios.py`) y `/politica-datos` siguen sirviendo el mismo shell.
  Son rutas del cliente: el servidor tiene que devolver la aplicación, no un
  404, o el enlace del correo muere.
* Nada de esto puede quedar detrás de `/api/`: una ruta desconocida bajo
  `/api/` sigue devolviendo JSON 404 y no el HTML.
* El `index.html` que se sirve lleva el SEO de la landing (título, descripción
  y Open Graph). Un cliente de correo o de WhatsApp no ejecuta JavaScript: si
  esas etiquetas se ponen desde React, el enlace compartido no dice nada.

Si `frontend/dist` no está construido, el catch-all ni se registra y estas
pruebas se saltan: es el mismo estado en el que corre un backend de desarrollo
puro.
"""

from pathlib import Path

import pytest

DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"
INDEX = DIST / "index.html"

sin_dist = pytest.mark.skipif(
    not INDEX.exists(),
    reason="frontend/dist sin construir: el catch-all del SPA no está montado",
)


@sin_dist
@pytest.mark.parametrize(
    "ruta",
    [
        "/",
        "/login",
        "/login?invitacion=TOKEN-DE-PRUEBA",
        "/login#registro",
        "/politica-datos",
        "/?montar=PUN-04&t=token-de-montaje",
    ],
)
def test_rutas_publicas_sirven_la_aplicacion(client, ruta):
    """Todas se sirven sin sesión y todas devuelven el mismo shell."""
    r = client.get(ruta)
    assert r.status_code == 200, ruta
    assert "text/html" in r.headers["content-type"]
    assert '<div id="root">' in r.text


@sin_dist
def test_la_portada_no_pide_autorizacion(client):
    """Sin cabecera `Authorization` y sin cookies: es una página pública."""
    r = client.get("/", headers={})
    assert r.status_code == 200
    assert "WWW-Authenticate" not in r.headers


def test_la_plantilla_declara_el_seo_de_la_landing():
    """El título, la descripción y el Open Graph viven en el HTML, no en JS.

    Se lee la PLANTILLA (`frontend/index.html`), que es de donde `vite build`
    saca el `index.html` que después sirve este backend: un `dist/` viejo en el
    disco de alguien no puede hacer pasar ni fallar esta comprobación.
    """
    plantilla = (Path(__file__).resolve().parents[2] / "frontend" / "index.html").read_text("utf-8")
    assert "<title>RECABRA — Espacios comerciales de tu supermercado</title>" in plantilla
    assert 'name="description"' in plantilla
    assert 'property="og:title"' in plantilla
    assert 'property="og:description"' in plantilla
    assert 'name="robots" content="index, follow"' in plantilla
    assert 'lang="es"' in plantilla


@sin_dist
def test_el_html_servido_es_una_pagina_en_español(client):
    html = client.get("/").text
    assert 'lang="es"' in html
    assert "<title>" in html


@sin_dist
def test_una_ruta_desconocida_de_api_sigue_siendo_404_json(client):
    """El catch-all no se puede tragar la API: eso ya estaba y sigue estando."""
    r = client.get("/api/no-existe")
    assert r.status_code == 404
    assert "text/html" not in r.headers["content-type"]


def test_la_pagina_publica_no_habilita_nada_sin_token(client):
    """Contrapartida: que `/` sea pública no abre un solo dato del negocio."""
    for ruta in ("/api/spaces", "/api/dashboard/metrics", "/api/layout/CENTRO"):
        assert client.get(ruta).status_code in (401, 403, 404, 422), ruta
