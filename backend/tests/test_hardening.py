"""Hardening OWASP (Fase 3): cabeceras de seguridad en TODA respuesta —
también en los errores — y HSTS condicionado a que el pedido haya llegado
por HTTPS de verdad.

`tests/test_files_acceso.py::test_las_cabeceras_de_seguridad_viajan_en_toda_respuesta`
ya cubre el caso feliz (200) desde la Fase 1. Este archivo cubre el resto del
contrato de esta fase: que las cabeceras no se caigan junto con la respuesta
(404, 422, 401) y que HSTS mire `X-Forwarded-Proto` — el único lugar donde
Starlette se entera de que hubo TLS cuando la conexión real, detrás del proxy
de Render, es siempre HTTP.
"""

CABECERAS_ESPERADAS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
}


def _assert_cabeceras_de_seguridad(r):
    for nombre, valor in CABECERAS_ESPERADAS.items():
        assert r.headers.get(nombre) == valor, f"{nombre} ausente o distinto en {r.status_code}"
    assert "Content-Security-Policy" in r.headers, f"CSP ausente en {r.status_code}"
    assert "Permissions-Policy" in r.headers, f"Permissions-Policy ausente en {r.status_code}"
    # Redundancia deliberada: frame-ancestors 'none' cubre lo mismo por CSP,
    # para los navegadores que la respeten.
    assert "frame-ancestors 'none'" in r.headers["Content-Security-Policy"]


# ─── Cabeceras en cada forma de respuesta ─────────────────────────────────────

def test_cabeceras_en_200(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    _assert_cabeceras_de_seguridad(r)


def test_cabeceras_en_404_de_api(client):
    # Ninguna ruta matchea esto — ni siquiera el catch-all de la SPA, que en
    # tests no existe (no hay frontend/dist armado): Starlette contesta su
    # 404 genérico, y la cabecera tiene que viajar igual.
    r = client.get("/api/esto-no-existe-en-ningun-router")
    assert r.status_code == 404
    _assert_cabeceras_de_seguridad(r)


def test_cabeceras_en_422(client, admin):
    # SpaceCreate exige svg_id/code/name/zone/area_m2 — un payload vacío es
    # un 422 de validación de Pydantic, no un HTTPException a mano.
    r = client.post("/api/spaces/", json={}, headers=admin)
    assert r.status_code == 422
    _assert_cabeceras_de_seguridad(r)


def test_cabeceras_en_401_de_auth(client):
    # Sin credencial: require_auth_or_query_token corta con 401 antes de
    # tocar la base.
    r = client.get("/api/files/1")
    assert r.status_code == 401
    _assert_cabeceras_de_seguridad(r)


# ─── HSTS: sólo cuando el pedido llegó por HTTPS de verdad ────────────────────

def test_hsts_ausente_sin_indicio_de_tls(client):
    # El cliente de pruebas entra por http y no manda X-Forwarded-Proto — el
    # caso de un uvicorn expuesto directo, sin proxy, en desarrollo.
    r = client.get("/api/health")
    assert "Strict-Transport-Security" not in r.headers


def test_hsts_presente_con_x_forwarded_proto_https(client):
    # `request.url.scheme` sigue siendo "http" acá (Starlette arma la URL de
    # la conexión real del test client, no del proxy) — HSTS tiene que salir
    # igual, mirando SOLO la cabecera que Render agrega en producción.
    r = client.get("/api/health", headers={"x-forwarded-proto": "https"})
    assert r.status_code == 200
    assert r.headers["Strict-Transport-Security"] == "max-age=31536000; includeSubDomains"


def test_hsts_ausente_con_x_forwarded_proto_http(client):
    # Un proxy que reenvía explícito "http" (o cualquier valor que no sea
    # "https") no debe activar HSTS — sólo la señal positiva cuenta.
    r = client.get("/api/health", headers={"x-forwarded-proto": "http"})
    assert "Strict-Transport-Security" not in r.headers


# ─── CSP: la concesión de Firebase, medida y acotada ──────────────────────────

def test_csp_incluye_los_hosts_medidos_de_firebase_y_nada_mas_ancho(client):
    r = client.get("/api/health")
    csp = r.headers["Content-Security-Policy"]
    partes = {p.split(" ", 1)[0]: p for p in csp.split("; ")}

    connect_src = partes["connect-src"]
    assert "https://identitytoolkit.googleapis.com" in connect_src
    assert "https://securetoken.googleapis.com" in connect_src

    script_src = partes["script-src"]
    # Sólo el script puntual de gapi que pide signInWithPopup — nunca un
    # comodín, y 'unsafe-inline'/'unsafe-eval' siguen sin aparecer acá.
    assert "https://apis.google.com" in script_src
    assert "unsafe-inline" not in script_src
    assert "unsafe-eval" not in script_src

    frame_src = partes["frame-src"]
    assert "https://*.firebaseapp.com" in frame_src

    # style-src conserva la única concesión de siempre (React con style={{}}),
    # y sólo ahí.
    assert "'unsafe-inline'" in partes["style-src"]
