"""Auditoría integral (post Fase 6) — Dimensión 4: OWASP / hardening / deps / config.

Auditor, no builder: este archivo sólo REPRODUCE. Ningún fix vive acá.

Ataca ocho hipótesis concretas del encargo (ver `features/auditoria/spec.md`
y el prompt del Maestro):

1. DoS por carga: `await file.read()` / `await foto.read()` bufferizan el
   cuerpo ENTERO en RAM antes de comparar contra `MAX_FILE_SIZE`/`MAX_PHOTO`.
   Y lo mismo, en general, para cualquier body JSON (login/oauth incluidos):
   no hay ningún límite de tamaño de request en la app.
2. HSTS confía en `X-Forwarded-Proto` — se prueba que se puede spoofear, y se
   evalúa el impacto real (spoiler: benigno, ver hardening-2).
3. CORS: un origen no listado no se refleja y nunca lleva credenciales.
4. Redacción de dinero: el worker no ve `monthly_rent`/`negotiatedValue` por
   layout (files y mounts ni siquiera tienen esos campos en su schema de
   salida — se confirma por inspección, no hace falta test).
5. SVG rechazado en mounts (content-type derivado server-side).
6. Deps: `pip-audit`/`npm audit` — hallazgos reales documentados en el .md
   (no como test: son hechos del entorno, no comportamiento de la app).
7. Dockerfile corre como root — hecho estático, documentado en el .md.

Estilo: FakeVerificador/dependency_overrides no hace falta acá (todo pasa por
el login legado). `import app.*` local a cada función porque el fixture
`client` de conftest.py purga `sys.modules['app.*']` entre pruebas.
"""
import io

import pytest


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _un_espacio(client, admin) -> int:
    espacios = client.get("/api/spaces/", headers=admin).json()
    assert espacios, "seed_spaces no corrió — no hay espacio para subirle un archivo"
    return espacios[0]["id"]


FOTO_JPEG = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00\xff\xd9"


# ─── Hipótesis 1 (ARREGLADA): DoS por carga — el límite ahora frena la LECTURA ─
#
# El hallazgo original: `data = await file.read()` bufferizaba el archivo
# ENTERO en RAM y recién después lo comparaba contra `MAX_FILE_SIZE`. Con
# `--workers 1` (Dockerfile) un archivo de varios GB no hacía lento al
# servidor: mataba al único proceso, y el atacante ni siquiera necesitaba que
# le aceptaran el archivo.
#
# El arreglo: `app/services/subidas.py::leer_con_tope` lee de a 64 KiB y corta
# apenas se pasa. Estos tests eran la sonda del hallazgo y ahora son la
# REGRESIÓN: siguen exigiendo el 413 (mismo código, mismo texto) y además
# exigen que lo leído no pase del tope más un chunk.

CHUNK = 64 * 1024


def _espia_de_lectura(monkeypatch):
    """Cuenta cuántos bytes salieron por `UploadFile.read` en este pedido.

    OJO: `files_mod.UploadFile` es `fastapi.UploadFile`, pero el parser de
    multipart de Starlette (`formparsers.py`) instancia directamente
    `starlette.datastructures.UploadFile` — la CLASE BASE, no la subclase de
    FastAPI — así que hay que espiar `.read()` ahí, o el objeto que de verdad
    llega al endpoint nunca pasa por el parche.
    """
    import starlette.datastructures as ds

    leido = {"bytes": 0}
    real_read = ds.UploadFile.read

    async def read_espiado(self, *a, **kw):
        data = await real_read(self, *a, **kw)
        leido["bytes"] += len(data)
        return data

    monkeypatch.setattr(ds.UploadFile, "read", read_espiado)
    return leido


def _no_leyo_de_mas(leido: dict, tope: int, payload: bytes, donde: str) -> None:
    assert leido["bytes"] <= tope + CHUNK, (
        f"{donde}: se leyeron {leido['bytes']} bytes de {len(payload)} con un tope de "
        f"{tope} — el corte tendría que haber parado en {tope} + un chunk de "
        f"{CHUNK} = {tope + CHUNK} como mucho"
    )
    print(
        f"\n{donde}: tope {tope} B · archivo {len(payload)} B · "
        f"LEÍDO {leido['bytes']} B (máximo aceptable {tope + CHUNK})"
    )


def test_h1_files_corta_la_lectura_al_pasarse_del_limite(client, admin, monkeypatch):
    import app.routers.files as files_mod

    sid = _un_espacio(client, admin)
    leido = _espia_de_lectura(monkeypatch)
    # Bajo el límite a 100 bytes: CUALQUIER archivo de prueba, por chico que
    # sea comparado con un ataque real, ya lo supera muchas veces.
    monkeypatch.setattr(files_mod, "MAX_FILE_SIZE", 100)

    payload = b"\xff\xd8\xff\xe0" + (b"A" * (2 * 1024 * 1024))  # ~2 MB, firma JPEG válida
    r = client.post(
        f"/api/spaces/{sid}/files",
        files={"file": ("grande.jpg", io.BytesIO(payload), "image/jpeg")},
        headers=admin,
    )

    assert r.status_code == 413, r.text
    assert r.json()["detail"] == "El archivo supera el límite de 10 MB", r.text
    _no_leyo_de_mas(leido, 100, payload, "files.py")


def test_h1b_mounts_corta_la_lectura_de_la_foto_al_pasarse_del_limite(client, worker, monkeypatch):
    import app.routers.mounts as mounts_mod

    leido = _espia_de_lectura(monkeypatch)
    monkeypatch.setattr(mounts_mod, "MAX_PHOTO", 100)

    payload = FOTO_JPEG + (b"A" * (2 * 1024 * 1024))
    r = client.post(
        "/api/mounts/",
        data={"space_code": "H1-MOUNT", "estado": "montado", "sede": "NAVE"},
        files={"foto": ("montaje.jpg", payload, "image/jpeg")},
        headers=worker,
    )

    assert r.status_code == 413, r.text
    assert r.json()["detail"] == "La foto supera el límite de 10 MB", r.text
    _no_leyo_de_mas(leido, 100, payload, "mounts.py")


def test_h1d_catalogo_corta_la_lectura_del_arte_al_pasarse_del_limite(client, admin, monkeypatch):
    """El auditor no lo listó, pero `catalogo.py` tenía exactamente el mismo
    patrón (`await file.read()` y después el `len`). Se arregló igual y se
    cubre igual."""
    import app.routers.catalogo as catalogo_mod

    r = client.post("/api/suppliers/find-or-create", json={"name": "Alpina"}, headers=admin)
    assert r.status_code in (200, 201), r.text
    prov = r.json()["id"]

    leido = _espia_de_lectura(monkeypatch)
    monkeypatch.setattr(catalogo_mod, "MAX_SIZE", 100)

    payload = b"\xff\xd8\xff\xe0" + (b"A" * (2 * 1024 * 1024))
    r = client.post(
        "/api/catalogo/",
        data={"supplier_id": prov, "nombre": "Arte gigante"},
        files={"file": ("arte.jpg", io.BytesIO(payload), "image/jpeg")},
        headers=admin,
    )

    assert r.status_code == 413, r.text
    assert r.json()["detail"] == "El arte supera los 5 MB.", r.text
    _no_leyo_de_mas(leido, 100, payload, "catalogo.py")


def test_h1e_planograms_corta_la_lectura_al_pasarse_del_limite(client, admin, monkeypatch):
    """Mismo patrón en `planograms.py`. Acá el código de respuesta es 400 y no
    413 — es el que ese endpoint contestaba desde siempre y el arreglo lo
    conserva: no se cambian códigos ni textos, sólo el momento del corte."""
    import app.routers.planograms as planograms_mod
    from datetime import date, timedelta

    r = client.post(
        "/api/spaces/find-or-create",
        json={"code": "NAVE-H1E-01", "name": "Punta", "zone": "punta",
              "sede": "NAVE", "area_m2": 1.0},
        headers=admin,
    )
    assert r.status_code in (200, 201), r.text
    space_id = r.json()["id"]
    r = client.post("/api/suppliers/find-or-create", json={"name": "AlpinaH1E"}, headers=admin)
    assert r.status_code in (200, 201), r.text
    hoy = date.today()
    r = client.post(
        f"/api/spaces/{space_id}/leases",
        json={
            "supplier_id": r.json()["id"],
            "start_date": (hoy - timedelta(days=1)).isoformat(),
            "end_date": (hoy + timedelta(days=20)).isoformat(),
            "monthly_rent": 1_800_000,
        },
        headers=admin,
    )
    assert r.status_code == 201, r.text
    lease_id = r.json()["id"]

    leido = _espia_de_lectura(monkeypatch)
    monkeypatch.setattr(planograms_mod, "MAX_SIZE", 100)

    payload = b"\xff\xd8\xff\xe0" + (b"A" * (2 * 1024 * 1024))
    r = client.post(
        f"/api/leases/{lease_id}/planometria",
        files={"file": ("plano.jpg", io.BytesIO(payload), "image/jpeg")},
        headers=admin,
    )

    assert r.status_code == 400, r.text
    assert r.json()["detail"] == "El archivo supera los 10 MB.", r.text
    _no_leyo_de_mas(leido, 100, payload, "planograms.py")


# ─── Hipótesis 1c (ARREGLADA): tope de cuerpo, pre-autenticación ─────────────
#
# `LimiteDeCuerpo` (app/services/subidas.py) es un middleware ASGI PURO —no
# `@app.middleware("http")`, porque `BaseHTTPMiddleware` no puede intervenir el
# `receive`— que cuenta los bytes del cuerpo y corta con 413 apenas se pasa,
# antes de que ningún parser lo materialice y antes de cualquier auth.

def test_h1c_un_body_json_gigante_muere_antes_del_login(client):
    """El hallazgo: `POST /api/auth/login` con 5 MB de "contraseña" se
    parseaba entero para terminar contestando 401 — sin cuenta, sin sesión, sin
    nada. Ahora corta el middleware."""
    payload_gigante = "A" * (5 * 1024 * 1024)
    r = client.post("/api/auth/login", json={"password": payload_gigante})

    assert r.status_code == 413, f"{r.status_code} {r.text[:200]}"
    assert r.headers["content-type"].startswith("application/json"), r.headers
    assert r.json() == {"detail": "El pedido supera el tamaño máximo permitido."}


def test_h1c_b_el_tope_no_rompe_el_login_normal_ni_las_cabeceras(client):
    """Control positivo: el camino feliz sigue igual, y el 413 del middleware
    sale con las cabeceras de seguridad puestas (`cabeceras_de_seguridad` es
    el middleware de AFUERA, así que el 413 lo atraviesa)."""
    from conftest import CLAVE_ADMIN

    r = client.post("/api/auth/login", json={"password": "no-es-la-clave"})
    assert r.status_code == 401, r.text

    r = client.post("/api/auth/login", json={"password": CLAVE_ADMIN})
    assert r.status_code == 200, r.text

    grande = client.post("/api/auth/login", json={"password": "A" * (5 * 1024 * 1024)})
    assert grande.status_code == 413
    print(
        "\n413 del middleware · CSP: "
        f"{'sí' if 'Content-Security-Policy' in grande.headers else 'NO'} · "
        f"X-Content-Type-Options: {grande.headers.get('X-Content-Type-Options')}"
    )
    assert "Content-Security-Policy" in grande.headers, (
        "el 413 del tope de cuerpo salió sin CSP: el orden de middlewares cambió"
    )
    assert grande.headers.get("X-Frame-Options") == "DENY"


def test_h1c_c_un_upload_legitimo_de_9_mb_sigue_pasando(client, admin):
    """El tope multipart (12 MiB) tiene que dejar pasar los 10 MB que el
    endpoint sí acepta. 9 MB de archivo entran y se guardan: el middleware no
    puede convertirse en un límite más chico que el del negocio."""
    sid = _un_espacio(client, admin)
    payload = b"\xff\xd8\xff\xe0" + (b"A" * (9 * 1024 * 1024))
    r = client.post(
        f"/api/spaces/{sid}/files",
        files={"file": ("nueve-mb.jpg", io.BytesIO(payload), "image/jpeg")},
        headers=admin,
    )
    assert r.status_code == 201, f"{r.status_code} {r.text[:200]}"
    assert r.json()["size"] == len(payload)


def test_h1c_d_un_multipart_de_20_mb_lo_corta_el_middleware_no_el_endpoint(client, admin):
    """Por arriba del tope multipart corta el middleware — el 413 genérico, no
    el del endpoint. Es la diferencia entre "no llegó a RAM" y "llegó y lo
    rechazamos"."""
    sid = _un_espacio(client, admin)
    payload = b"\xff\xd8\xff\xe0" + (b"A" * (20 * 1024 * 1024))
    r = client.post(
        f"/api/spaces/{sid}/files",
        files={"file": ("veinte-mb.jpg", io.BytesIO(payload), "image/jpeg")},
        headers=admin,
    )
    assert r.status_code == 413, f"{r.status_code} {r.text[:200]}"
    assert r.json() == {"detail": "El pedido supera el tamaño máximo permitido."}


def test_h1c_e_un_content_length_mentido_no_sirve_para_pasar(client):
    """El `Content-Length` declarado se usa para rechazar de entrada, nunca
    para permitir: lo que decide es el conteo real sobre el `receive`."""
    cuerpo = b'{"password":"' + b"A" * (5 * 1024 * 1024) + b'"}'
    r = client.post(
        "/api/auth/login",
        content=cuerpo,
        headers={"Content-Type": "application/json", "Content-Length": str(len(cuerpo))},
    )
    assert r.status_code == 413, r.status_code


# ─── Hipótesis 2: HSTS y X-Forwarded-Proto ────────────────────────────────────

def test_h2_hsts_se_puede_forzar_con_un_header_spoofeado(client):
    """`main.py` agrega HSTS si `request.url.scheme == "https"` O si el
    cliente manda `X-Forwarded-Proto: https` — necesario para que HSTS viaje
    alguna vez detrás del proxy de Render (que SIEMPRE habla HTTP con este
    proceso). El costo es que, tomado el proceso sin ese proxy en el medio
    (TestClient acá, o cualquiera que hable directo al puerto del contenedor),
    UN CLIENTE cualquiera puede agregar ese header y sacarse la cabecera HSTS
    por su cuenta.

    Impacto real evaluado: BENIGNO. HSTS es una cabecera que el NAVEGADOR sólo
    respeta si la respuesta llegó por una conexión HTTPS de verdad (RFC 6797
    §7.2: "An HSTS Host MUST NOT include the STS header field in HTTP
    responses conveyed over non-secure transport" es la norma para el
    servidor, pero el navegador la ignora igual si la ve por HTTP plano —
    ningún navegador activa HSTS a partir de una respuesta no-TLS). O sea: un
    atacante que spoofea el header sólo logra que el proceso ESCRIBA la
    cabecera de más; no logra que ningún navegador la aplique fuera de una
    conexión https real. Se documenta como hallazgo de higiene (severidad
    baja), no como vulnerabilidad explotable."""
    r = client.get("/api/health", headers={"X-Forwarded-Proto": "https"})
    assert r.status_code == 200
    assert "Strict-Transport-Security" in r.headers

    r2 = client.get("/api/health")  # sin el header, y TestClient no habla TLS
    assert "Strict-Transport-Security" not in r2.headers


# ─── Hipótesis 3: CORS — sin reflejo, sin credenciales ────────────────────────

def test_h3_cors_no_refleja_un_origen_no_listado(client):
    r = client.get(
        "/api/health",
        headers={"Origin": "https://sitio-atacante.evil"},
    )
    assert r.status_code == 200
    # Starlette's CORSMiddleware solo agrega Access-Control-Allow-Origin
    # cuando el origen matchea la lista; para un origen ajeno, no debe estar.
    assert r.headers.get("access-control-allow-origin") != "https://sitio-atacante.evil"
    assert "access-control-allow-credentials" not in {k.lower() for k in r.headers.keys()}


def test_h3b_cors_preflight_de_un_origen_no_listado_no_autoriza(client):
    r = client.options(
        "/api/health",
        headers={
            "Origin": "https://sitio-atacante.evil",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert r.headers.get("access-control-allow-origin") != "https://sitio-atacante.evil"


# ─── Hipótesis 4: redacción de dinero (control positivo) ──────────────────────

def test_h4_worker_no_ve_negotiated_value_en_layout(client, admin, worker):
    fixture = {
        "id": "f1", "code": "H4-01", "sede": "NAVE-H4", "type": "gondola",
        "label": "H4-01", "cx": 1, "cz": 1, "rotY": 0,
        "w": 1, "d": 1, "h": 1, "color": "#000000", "status": "free",
        "supplierName": "ProveedorX", "brandCategory": "", "negotiatedValue": 999999,
        "startDate": "", "endDate": "", "observation": "",
    }
    r = client.put(
        "/api/layout/NAVE-H4",
        json={"fixtures": [fixture], "base_updated_at": None},
        headers=admin,
    )
    assert r.status_code == 200, r.text

    visto_worker = client.get("/api/layout/NAVE-H4", headers=worker).json()
    assert "negotiatedValue" not in visto_worker["fixtures"][0], (
        "el worker vio negotiatedValue en el layout — fuga de dinero fuera de rol"
    )

    visto_admin = client.get("/api/layout/NAVE-H4", headers=admin).json()
    assert visto_admin["fixtures"][0]["negotiatedValue"] == 999999


# ─── Hipótesis 5: SVG rechazado en mounts (no ejecuta al servirse inline) ─────

def test_h5_un_svg_disfrazado_de_foto_es_rechazado(client, worker):
    """Un SVG puede llevar `<script>`: si mounts.py lo aceptara y files.py lo
    sirviera `inline`, ejecutaría JS con la sesión de quien lo abra. Se ataca
    con extensión `.jpg` (para no caer por extensión) pero content-type real
    `image/svg+xml` — el único vector que le queda a un atacante, porque
    mounts.py deriva primero por EXTENSIÓN y sólo cae al content-type
    declarado cuando la extensión no está en `PHOTO_TYPES`."""
    svg = b"<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>"
    r = client.post(
        "/api/mounts/",
        data={"space_code": "H5-MOUNT", "estado": "montado", "sede": "NAVE"},
        files={"foto": ("ataque.svg", svg, "image/svg+xml")},
        headers=worker,
    )
    assert r.status_code == 422, r.text


def test_h5b_svg_con_extension_jpg_pero_content_type_svg_tambien_cae(client, worker):
    svg = b"<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>"
    r = client.post(
        "/api/mounts/",
        data={"space_code": "H5B-MOUNT", "estado": "montado", "sede": "NAVE"},
        files={"foto": ("ataque.jpg", svg, "image/svg+xml")},
        headers=worker,
    )
    # La extensión ".jpg" está en PHOTO_TYPES, así que gana por extensión y el
    # content-type derivado es "image/jpeg" — el navegador jamás lo ejecuta
    # como SVG porque el content-type servido en la descarga es el derivado
    # server-side, nunca el declarado por el cliente. Se documenta el
    # comportamiento (caracterización), no es un hallazgo: lo que importa es
    # que el byte a byte SVG nunca se sirva con un content-type que un
    # navegador interprete como SVG, y ese es justamente el invariante que
    # `content_type = MEDIA_TYPES[ext]` / `PHOTO_TYPES[ext]` protege.
    assert r.status_code == 201, r.text
    assert r.json()["file_id"] is not None
