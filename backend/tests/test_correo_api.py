"""El correo por HTTPS, que es el camino que funciona donde el SMTP está cerrado.

Render con plan gratuito devuelve `[Errno 101] Network is unreachable` al
intentar abrir el socket SMTP: falla antes de autenticar, así que ninguna
credencial de Gmail sirve ahí. El puerto 443 sí sale.

Se levanta un servidor HTTP de verdad y se apunta el proveedor contra él: así
se comprueba lo que de verdad viaja —cabeceras y cuerpo— en vez de confiar en
un doble de prueba que puede coincidir con el error.
"""
import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

import pytest

# `app.services.mailer` se importa ADENTRO de cada función, nunca acá (R-0):
# un import app.* a nivel de módulo corre en la COLECCIÓN de pytest, antes de
# que el fixture fije DATABASE_URL, y deja app.database clavado contra el
# archivo persistente backend/retail_espacios.db — la segunda corrida de la
# suite arrancaba en rojo por los clientes que la primera fundó ahí.


class Recibidor(BaseHTTPRequestHandler):
    recibido: dict = {}
    codigo = 201
    respuesta = b'{"messageId":"<abc@brevo>"}'

    def do_POST(self):
        n = int(self.headers.get("Content-Length", 0))
        Recibidor.recibido = {
            "ruta": self.path,
            "cabeceras": {k.lower(): v for k, v in self.headers.items()},
            "cuerpo": json.loads(self.rfile.read(n) or b"{}"),
        }
        self.send_response(Recibidor.codigo)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(Recibidor.respuesta)

    def log_message(self, *a):
        pass


@pytest.fixture()
def servidor():
    srv = HTTPServer(("127.0.0.1", 0), Recibidor)
    hilo = threading.Thread(target=srv.serve_forever, daemon=True)
    hilo.start()
    yield f"http://127.0.0.1:{srv.server_port}/envio"
    srv.shutdown()


@pytest.fixture()
def brevo(monkeypatch, servidor):
    """Brevo configurado, pero apuntando al servidor local.

    Se reemplaza sólo la URL: el POST que sale es el de verdad, con sus
    cabeceras y su cuerpo, contra un servidor que los guarda.
    """
    from app.services import mailer
    monkeypatch.setenv("EMAIL_PROVIDER", "brevo")
    monkeypatch.setenv("EMAIL_API_KEY", "clave-de-prueba")
    monkeypatch.setenv("MAIL_FROM", "bmgpersonal99@gmail.com")
    monkeypatch.setenv("MAIL_FROM_NAME", "Galerías")

    real = mailer._post_json
    monkeypatch.setattr(
        mailer, "_post_json",
        lambda url, h, p, timeout=20: real(servidor, h, p, timeout),
    )
    Recibidor.codigo = 201
    Recibidor.respuesta = b'{"messageId":"<abc@brevo>"}'
    Recibidor.recibido = {}
    return servidor


def test_el_correo_sale_por_https(brevo):
    from app.services import mailer
    ok, motivo, seg = mailer.enviar_con_diagnostico(
        ["operador@ejemplo.com"], "Nuevo contrato — NAVE-PUN-01", "<p>hola</p>"
    )
    assert ok, motivo
    assert seg >= 0


def test_viaja_la_clave_y_el_remitente(brevo):
    from app.services import mailer
    mailer.enviar_con_diagnostico(["operador@ejemplo.com"], "Asunto", "<p>x</p>")
    r = Recibidor.recibido
    assert r["cabeceras"]["api-key"] == "clave-de-prueba"
    assert r["cuerpo"]["sender"]["email"] == "bmgpersonal99@gmail.com"
    assert r["cuerpo"]["to"] == [{"email": "operador@ejemplo.com"}]
    assert r["cuerpo"]["subject"] == "Asunto"
    assert r["cuerpo"]["htmlContent"] == "<p>x</p>"


def test_varios_destinatarios_van_todos(brevo):
    from app.services import mailer
    mailer.enviar_con_diagnostico(["a@b.co", "c@d.co"], "S", "<p>x</p>")
    assert Recibidor.recibido["cuerpo"]["to"] == [{"email": "a@b.co"}, {"email": "c@d.co"}]


def test_una_clave_rechazada_lo_dice_con_todas_las_letras(brevo):
    from app.services import mailer
    Recibidor.codigo = 401
    Recibidor.respuesta = b'{"message":"Key not found"}'
    ok, motivo, _ = mailer.enviar_con_diagnostico(["a@b.co"], "S", "<p>x</p>")
    assert not ok
    assert "EMAIL_API_KEY" in motivo
    assert "verificado" in motivo, "tiene que mencionar la verificación del remitente"
    assert "bmgpersonal99@gmail.com" in motivo


def test_un_error_del_proveedor_trae_su_respuesta(brevo):
    from app.services import mailer
    Recibidor.codigo = 400
    Recibidor.respuesta = b'{"message":"sender not valid"}'
    ok, motivo, _ = mailer.enviar_con_diagnostico(["a@b.co"], "S", "<p>x</p>")
    assert not ok
    assert "400" in motivo and "sender not valid" in motivo


def test_sin_clave_no_intenta_salir(monkeypatch):
    from app.services import mailer
    monkeypatch.setenv("EMAIL_PROVIDER", "brevo")
    monkeypatch.delenv("EMAIL_API_KEY", raising=False)
    monkeypatch.setenv("MAIL_FROM", "x@y.co")
    ok, motivo, _ = mailer.enviar_con_diagnostico(["a@b.co"], "S", "<p>x</p>")
    assert not ok and "EMAIL_API_KEY" in motivo


def test_con_proveedor_https_no_hacen_falta_credenciales_smtp(monkeypatch):
    """SMTP_USER y SMTP_PASSWORD dejan de ser obligatorias: no hay SMTP."""
    from app.services import mailer
    monkeypatch.setenv("EMAIL_PROVIDER", "brevo")
    monkeypatch.setenv("EMAIL_API_KEY", "k")
    monkeypatch.setenv("MAIL_FROM", "x@y.co")
    monkeypatch.delenv("SMTP_USER", raising=False)
    monkeypatch.delenv("SMTP_PASSWORD", raising=False)
    assert mailer.correo_configurado() is True


def test_un_proveedor_desconocido_no_rompe(monkeypatch):
    from app.services import mailer
    monkeypatch.setenv("EMAIL_PROVIDER", "palomas-mensajeras")
    assert mailer.proveedor() == "smtp"


def test_sendgrid_habla_su_propio_dialecto(monkeypatch):
    """El otro proveedor arma otro cuerpo y otra cabecera de autorización."""
    from app.services import mailer
    monkeypatch.setenv("EMAIL_PROVIDER", "sendgrid")
    monkeypatch.setenv("EMAIL_API_KEY", "SG.clave")
    monkeypatch.setenv("MAIL_FROM", "bmgpersonal99@gmail.com")

    salida = {}

    def espia(url, cabeceras, cuerpo, timeout=20):
        salida.update(url=url, cabeceras=cabeceras, cuerpo=cuerpo)
        return 202, "{}"

    monkeypatch.setattr(mailer, "_post_json", espia)
    ok, motivo, _ = mailer.enviar_con_diagnostico(["a@b.co"], "S", "<p>x</p>")

    assert ok, motivo
    assert salida["url"].startswith("https://api.sendgrid.com")
    assert salida["cabeceras"]["Authorization"] == "Bearer SG.clave"
    assert salida["cuerpo"]["from"]["email"] == "bmgpersonal99@gmail.com"
    assert salida["cuerpo"]["personalizations"][0]["to"] == [{"email": "a@b.co"}]
    assert salida["cuerpo"]["content"][0]["type"] == "text/html"


def test_el_smtp_sigue_siendo_el_camino_por_defecto(monkeypatch):
    """Sin EMAIL_PROVIDER nada cambia: una instalación existente no se entera."""
    from app.services import mailer
    monkeypatch.delenv("EMAIL_PROVIDER", raising=False)
    assert mailer.proveedor() == "smtp"


def test_volver_a_smtp_es_borrar_una_variable(monkeypatch):
    """Si mañana el hosting deja salir SMTP, se vuelve sin tocar código.

    El camino SMTP no se reemplazó: sigue siendo el de por defecto, y las
    credenciales conviven con las del proveedor HTTPS. Quitar EMAIL_PROVIDER
    devuelve el envío a smtplib con lo que ya estaba configurado.
    """
    from app.services import mailer
    monkeypatch.setenv("SMTP_USER", "bmgpersonal99@gmail.com")
    monkeypatch.setenv("SMTP_PASSWORD", "abcd efgh ijkl mnop")

    monkeypatch.setenv("EMAIL_PROVIDER", "brevo")
    monkeypatch.setenv("EMAIL_API_KEY", "clave")
    monkeypatch.setenv("MAIL_FROM", "bmgpersonal99@gmail.com")
    assert mailer.proveedor() == "brevo"

    monkeypatch.delenv("EMAIL_PROVIDER")
    assert mailer.proveedor() == "smtp"
    assert mailer.correo_configurado() is True, "las credenciales SMTP seguían ahí"
    # Y la contraseña de aplicación se sigue limpiando, que es lo que la hacía fallar.
    assert mailer.smtp_settings()["password"] == "abcdefghijklmnop"


def test_el_puerto_465_usa_ssl_directo(monkeypatch):
    """465 es SSL desde el saludo; hacerle starttls() lo rompía."""
    from app.services import mailer
    import smtplib

    usados = {}

    class FalsoSSL:
        def __init__(self, host, port, timeout=None):
            usados["clase"] = "SMTP_SSL"
        def __enter__(self): return self
        def __exit__(self, *a): return False
        def login(self, *a): pass
        def send_message(self, *a): pass
        def starttls(self): usados["starttls"] = True

    monkeypatch.delenv("EMAIL_PROVIDER", raising=False)
    monkeypatch.setenv("SMTP_USER", "a@b.co")
    monkeypatch.setenv("SMTP_PASSWORD", "x")
    monkeypatch.setenv("SMTP_PORT", "465")
    monkeypatch.setattr(smtplib, "SMTP_SSL", FalsoSSL)

    ok, motivo, _ = mailer.enviar_con_diagnostico(["c@d.co"], "S", "<p>x</p>")
    assert ok, motivo
    assert usados["clase"] == "SMTP_SSL"
    assert "starttls" not in usados, "en 465 no va starttls"
