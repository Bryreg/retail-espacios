"""La consola del operador puede exigir segundo factor (auditoría
pre-lanzamiento, P1-13).

Esa consola ve todos los clientes y puede borrarlos. Con `OPERADOR_EXIGE_MFA=1`
sólo entra un token emitido desde un ID token de Firebase que traiga
`firebase.sign_in_second_factor`. Apagado (el valor por defecto, para no dejar
afuera al operador antes de activar el segundo factor en Firebase) todo sigue
como antes.
"""
from types import SimpleNamespace

import jwt


class FakeVerificador:
    def __init__(self, mapa):
        self.mapa = mapa

    def verificar(self, id_token):
        return self.mapa.get(id_token)


def _entrar(client, monkeypatch, segundo_factor):
    from app.services.firebase_tokens import get_verificador

    monkeypatch.setenv("OPERADOR_EMAILS", "op@recabra.co")
    claims = SimpleNamespace(uid="uid-op", email="op@recabra.co", email_verificado=True,
                             proveedor="google.com", nombre=None, segundo_factor=segundo_factor)
    client.app.dependency_overrides[get_verificador] = lambda: FakeVerificador({"tok": claims})
    r = client.post("/api/auth/oauth", json={"id_token": "tok", "acepta_politica": True})
    assert r.status_code == 200, r.text
    assert r.json().get("plataforma") is True
    return r.json()["token"]


def test_apagado_entra_sin_segundo_factor(client, monkeypatch):
    monkeypatch.delenv("OPERADOR_EXIGE_MFA", raising=False)
    token = _entrar(client, monkeypatch, None)
    assert "mfa" not in jwt.decode(token, options={"verify_signature": False})
    r = client.get("/api/plataforma/metricas", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200, r.text


def test_prendido_sin_segundo_factor_da_403(client, monkeypatch):
    monkeypatch.setenv("OPERADOR_EXIGE_MFA", "1")
    token = _entrar(client, monkeypatch, None)
    r = client.get("/api/plataforma/metricas", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403
    assert "dos pasos" in r.json()["detail"]


def test_prendido_con_segundo_factor_entra(client, monkeypatch):
    monkeypatch.setenv("OPERADOR_EXIGE_MFA", "1")
    token = _entrar(client, monkeypatch, "totp")
    assert jwt.decode(token, options={"verify_signature": False})["mfa"] is True
    r = client.get("/api/plataforma/metricas", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200, r.text
