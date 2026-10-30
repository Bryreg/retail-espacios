"""Los hallazgos menores de seguridad de la auditoría pre-lanzamiento
(P2-23, P3-1, P3-2, P3-4, P3-15, P3-16)."""
import os
import subprocess
import sys

from conftest import CLAVE_ADMIN


def test_p2_23_el_log_del_correo_no_lleva_las_direcciones(client):
    from app.services.mailer import destino_para_log

    texto = destino_para_log(["ana@proveedor.co", "luis@proveedor.co", "x@Otro.com"])
    assert "ana" not in texto and "luis" not in texto
    assert texto == "3 destinatarios (otro.com, proveedor.co)"
    assert destino_para_log(["a@b.co"]) == "1 destinatario (b.co)"


def test_p3_1_sin_docs_fuera_de_desarrollo():
    entorno = {**os.environ, "ENV": "produccion", "JWT_SECRET": "x" * 40, "DATABASE_URL": "sqlite:///:memory:"}
    entorno.pop("APP_ENV", None)
    codigo = "import app.main as m; print(m.app.docs_url, m.app.redoc_url, m.app.openapi_url)"
    r = subprocess.run([sys.executable, "-c", codigo], env=entorno, capture_output=True, text=True,
                       cwd=os.path.dirname(os.path.dirname(os.path.abspath(__file__))), timeout=120)
    assert r.returncode == 0, r.stderr
    assert r.stdout.strip().splitlines()[-1] == "None None None"


def test_p3_1_en_desarrollo_siguen(client):
    assert client.get("/openapi.json").status_code == 200


def test_p3_2_un_enlace_de_montaje_se_revoca_solo(client, admin):
    from app.auth import create_mount_token

    uno = create_mount_token("NAVE-PUN-04", "galerias")
    otro = create_mount_token("NAVE-PUN-04", "galerias")
    assert client.get(f"/api/montaje/mi-espacio?token={uno}").status_code != 401

    r = client.post("/api/auth/revocar-enlace", json={"enlace": f"https://x/?montar=NAVE-PUN-04&t={uno}"}, headers=admin)
    assert r.status_code == 200, r.text
    assert r.json() == {"revocado": True, "tipo": "montaje"}

    assert client.get(f"/api/montaje/mi-espacio?token={uno}").status_code == 401
    assert client.get(f"/api/montaje/mi-espacio?token={otro}").status_code != 401


def test_p3_2_un_enlace_de_guia_se_revoca(client, admin):
    from app.auth import create_guia_token, decode_guia

    t = create_guia_token(7, "galerias")
    assert decode_guia(t) == 7
    assert client.post("/api/auth/revocar-enlace", json={"enlace": t}, headers=admin).json()["tipo"] == "guia"
    assert decode_guia(t) is None


def test_p3_2_no_se_revoca_una_sesion_ni_un_enlace_ajeno(client, admin, worker):
    from app.auth import create_mount_token

    sesion = admin["Authorization"].split(" ", 1)[1]
    assert client.post("/api/auth/revocar-enlace", json={"enlace": sesion}, headers=admin).status_code == 422
    ajeno = create_mount_token("A-1", "otro-super")
    assert client.post("/api/auth/revocar-enlace", json={"enlace": ajeno}, headers=admin).status_code == 422
    assert client.post("/api/auth/revocar-enlace", json={"enlace": "basura"}, headers=admin).status_code == 422
    # Sólo administración.
    assert client.post("/api/auth/revocar-enlace", json={"enlace": ajeno}, headers=worker).status_code == 403


def test_p3_4_el_login_legado_frena_aunque_cambie_la_ip(client):
    from app.routers.auth import LOGIN_MAX_TOTAL

    for i in range(LOGIN_MAX_TOTAL):
        r = client.post("/api/auth/login", json={"password": "mala"}, headers={"X-Forwarded-For": f"10.0.{i // 250}.{i % 250 + 1}"})
        assert r.status_code == 401, (i, r.status_code)
    r = client.post("/api/auth/login", json={"password": CLAVE_ADMIN}, headers={"X-Forwarded-For": "10.9.9.9"})
    assert r.status_code == 429


def test_p3_15_el_worker_no_ve_los_correos_de_aviso(client, admin, worker):
    assert client.put("/api/notifications/config", json={"notify_emails": "jefa@super.co"}, headers=admin).status_code == 200
    assert client.get("/api/notifications/config", headers=admin).json()["notify_emails"] == "jefa@super.co"
    del_worker = client.get("/api/notifications/config", headers=worker).json()
    assert del_worker["notify_emails"] == ""
    assert del_worker["reminder_days"]


def test_p3_16_la_plata_sale_a_cualquier_profundidad(client):
    from app.routers.layout import _redact_fixtures_for_worker

    fixtures = [{
        "id": "f1", "negotiatedValue": 1, "faceB": {"negotiatedValue": 2},
        "slots": [{"id": "s1", "negotiatedValue": 3}],
        "nuevo": {"partes": [{"negotiatedValue": 4, "ancho": 5}]},
    }]
    _redact_fixtures_for_worker(fixtures)
    assert "negotiatedValue" not in repr(fixtures)
    assert fixtures[0]["nuevo"]["partes"][0]["ancho"] == 5
