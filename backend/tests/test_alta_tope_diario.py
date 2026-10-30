"""Tope diario de altas self-service de toda la plataforma (auditoría
pre-lanzamiento, P1-12; decisión del dueño: «Tope diario + aviso»).

Cada alta crea una base de Postgres y su pool de conexiones. El tope de dos
por usuario no frena a quien tiene muchas cuentas de Google: pasado el tope
diario, el alta queda en lista de espera, no se crea ninguna base y al
operador le llega un correo. Cada alta que sí entra también se le avisa.
"""
from types import SimpleNamespace


class FakeVerificador:
    def __init__(self, mapa):
        self.mapa = mapa

    def verificar(self, id_token):
        return self.mapa.get(id_token)


def _alta(client, uid, email, slug, nombre):
    from app.services.firebase_tokens import get_verificador

    claims = SimpleNamespace(uid=uid, email=email, email_verificado=True, proveedor="google.com", nombre=None)
    client.app.dependency_overrides[get_verificador] = lambda: FakeVerificador({uid: claims})
    return client.post("/api/clientes/alta",
                       json={"id_token": uid, "slug": slug, "nombre": nombre, "acepta_politica": True})


def test_pasado_el_tope_el_alta_queda_en_espera_sin_crear_base(client, monkeypatch):
    from app import routers
    from app.clientes import buscar, sesion_registro
    from app.models.plataforma import AltaEnEspera

    correos = []
    monkeypatch.setattr("app.services.mailer.send_mail_to_bg",
                        lambda destino, asunto, html: correos.append((destino, asunto, html)))
    monkeypatch.setenv("OPERADOR_EMAILS", "op@recabra.co")
    monkeypatch.setenv("ALTAS_POR_DIA", "1")

    assert _alta(client, "u1", "uno@a.co", "primero", "Primero").status_code == 200
    r = _alta(client, "u2", "dos@b.co", "segundo", "Segundo")
    assert r.status_code == 429, r.text
    assert "lista de espera" in r.json()["detail"]
    assert buscar("segundo") is None, "se creó la base igual"

    reg = sesion_registro()
    try:
        espera = reg.query(AltaEnEspera).all()
        assert [(e.email, e.slug, e.nombre) for e in espera] == [("dos@b.co", "segundo", "Segundo")]
    finally:
        reg.close()

    asuntos = [a for _d, a, _h in correos]
    assert asuntos == ["RECABRA · supermercado nuevo", "RECABRA · alta en espera"]
    assert all(d == ["op@recabra.co"] for d, _a, _h in correos)
    assert "Segundo" in correos[1][2] and "segundo" in correos[1][2]
    assert routers  # el import de arriba fija el paquete para el monkeypatch


def test_el_nombre_que_escribe_la_persona_se_escapa_en_el_correo(client, monkeypatch):
    correos = []
    monkeypatch.setattr("app.services.mailer.send_mail_to_bg",
                        lambda destino, asunto, html: correos.append(html))
    monkeypatch.setenv("OPERADOR_EMAILS", "op@recabra.co")
    assert _alta(client, "u3", "tres@c.co", "tercero", "<b>Tercero</b>").status_code == 200
    assert "&lt;b&gt;Tercero&lt;/b&gt;" in correos[0]
    assert "<b>Tercero</b>" not in correos[0]


def test_sin_operadores_no_se_manda_nada_y_el_alta_entra(client, monkeypatch):
    correos = []
    monkeypatch.setattr("app.services.mailer.send_mail_to_bg", lambda *a: correos.append(a))
    monkeypatch.delenv("OPERADOR_EMAILS", raising=False)
    assert _alta(client, "u4", "cuatro@d.co", "cuarto", "Cuarto").status_code == 200
    assert correos == []
