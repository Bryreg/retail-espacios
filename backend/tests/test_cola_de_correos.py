"""La cola de correos (auditoría P1-4): ningún aviso se pierde en silencio.

El criterio de aceptación de la auditoría, con un proveedor de mentira: con la
clave del proveedor revocada el correo queda PENDIENTE, deja una línea WARNING
—sin direcciones— y el mantenimiento lo reintenta; cuando el proveedor vuelve,
sale y queda ENVIADO. Y lo que sale por un pedido real (el contrato nuevo) es lo
mismo de antes: los mismos destinatarios, el mismo asunto, el mismo cuerpo.
"""
import asyncio
import json
import logging
from datetime import datetime, timedelta, timezone

from tests.conftest import esperar_mantenimiento


class ProveedorQueFallaYDespuesAnda:
    """El `enviar_con_diagnostico` de mentira: las primeras `fallas` veces
    contesta como Brevo con la clave revocada; después, enviado."""

    def __init__(self, fallas: int):
        self.fallas = fallas
        self.llamadas: list[tuple[list, str, str]] = []

    def __call__(self, destinatarios, asunto, html):
        self.llamadas.append((list(destinatarios), asunto, html))
        if len(self.llamadas) <= self.fallas:
            return False, ("Brevo rechazó la credencial o el remitente (HTTP 401). Revisá que EMAIL_API_KEY "
                           "sea válida. Respuesta: {\"to\": \"ana@alpina.com\"}"), 0.1
        return True, "Enviado.", 0.1


def _sesion():
    from app.database import SessionLocal

    return SessionLocal()


def _filas():
    from app.models.correos import CorreoPendiente

    db = _sesion()
    try:
        return [(f.estado, f.intentos, f.asunto, json.loads(f.destinatarios_json), f.ultimo_error)
                for f in db.query(CorreoPendiente).order_by(CorreoPendiente.id).all()]
    finally:
        db.close()


def _encolar(destinatarios, asunto="Nuevo contrato — PUN-04", html="<p>hola</p>"):
    from fastapi import BackgroundTasks

    from app.services.cola_de_correos import encolar_correo

    tareas = BackgroundTasks()
    db = _sesion()
    try:
        encolar_correo(tareas, db, None, destinatarios, asunto, html)
    finally:
        db.close()
    asyncio.run(tareas())


def test_con_la_clave_revocada_queda_pendiente_se_reintenta_y_sale(client, monkeypatch, caplog):
    from app.services import cola_de_correos, mailer

    esperar_mantenimiento()
    proveedor = ProveedorQueFallaYDespuesAnda(fallas=2)
    monkeypatch.setattr(mailer, "enviar_con_diagnostico", proveedor)

    with caplog.at_level(logging.WARNING):
        _encolar(["ana@alpina.com", "luis@alpina.com"])
    [(estado, intentos, asunto, destinatarios, error)] = _filas()
    assert (estado, intentos) == ("pendiente", 1)
    assert destinatarios == ["ana@alpina.com", "luis@alpina.com"] and asunto == "Nuevo contrato — PUN-04"
    assert "HTTP 401" in error and "ana@" not in error
    avisos = [r.getMessage() for r in caplog.records if r.name == "recabra.correos"]
    assert avisos and "no salió" in avisos[0] and "2 destinatarios (alpina.com)" in avisos[0]
    assert all("ana@" not in r.getMessage() and "luis@" not in r.getMessage() for r in caplog.records)

    db = _sesion()
    try:
        # Todavía no venció la espera: el mantenimiento no lo toca.
        assert cola_de_correos.despachar_pendientes(db) == {"enviados": 0, "fallidos": 0}
        luego = datetime.now(timezone.utc) + timedelta(minutes=6)
        assert cola_de_correos.despachar_pendientes(db, ahora=luego) == {"enviados": 0, "fallidos": 1}
        assert _filas()[0][:2] == ("pendiente", 2)
        # La espera crece: a los 6 minutos de nuevo, todavía no.
        assert cola_de_correos.despachar_pendientes(db, ahora=luego + timedelta(minutes=6)) == {
            "enviados": 0, "fallidos": 0}
        mucho_despues = luego + timedelta(hours=1)
        assert cola_de_correos.despachar_pendientes(db, ahora=mucho_despues) == {"enviados": 1, "fallidos": 0}
    finally:
        db.close()
    assert _filas()[0][:2] == ("enviado", 3)
    # El mismo correo las tres veces: mismos destinatarios, mismo asunto, mismo cuerpo.
    assert {(tuple(d), a, h) for d, a, h in proveedor.llamadas} == {
        (("ana@alpina.com", "luis@alpina.com"), "Nuevo contrato — PUN-04", "<p>hola</p>")}


def test_despues_del_ultimo_intento_queda_abandonado_con_su_warning(client, monkeypatch, caplog):
    from app.services import cola_de_correos, mailer

    esperar_mantenimiento()
    monkeypatch.setattr(mailer, "enviar_con_diagnostico", ProveedorQueFallaYDespuesAnda(fallas=99))
    _encolar(["x@y.co"])
    db = _sesion()
    try:
        momento = datetime.now(timezone.utc)
        for _ in range(cola_de_correos.MAX_INTENTOS + 2):
            momento += timedelta(days=2)
            with caplog.at_level(logging.WARNING):
                cola_de_correos.despachar_pendientes(db, ahora=momento)
    finally:
        db.close()
    [(estado, intentos, *_r)] = _filas()
    assert (estado, intentos) == ("abandonado", cola_de_correos.MAX_INTENTOS)
    assert any("abandonado" in r.getMessage() for r in caplog.records if r.name == "recabra.correos")


def test_lo_que_sale_enseguida_queda_enviado_y_se_purga_a_los_30_dias(client, monkeypatch):
    from app.services import cola_de_correos, mailer

    esperar_mantenimiento()
    monkeypatch.setattr(mailer, "enviar_con_diagnostico", ProveedorQueFallaYDespuesAnda(fallas=0))
    _encolar(["a@b.co"])
    assert _filas()[0][:2] == ("enviado", 1)
    db = _sesion()
    try:
        assert cola_de_correos.purgar_viejos(db) == 0
        assert cola_de_correos.purgar_viejos(db, ahora=datetime.now(timezone.utc) + timedelta(days=31)) == 1
    finally:
        db.close()
    assert _filas() == []


def test_un_contrato_nuevo_manda_lo_mismo_que_antes_y_queda_anotado(client, monkeypatch):
    """Por un pedido real: el router pasa SU `send_mail_to_bg` (el que las
    pruebas reemplazan), y sale con los mismos destinatarios y asunto."""
    import app.routers.spaces as spaces
    from app.services import mailer

    r = client.post("/api/auth/login", json={"password": "admin123"})
    cab = {"Authorization": f"Bearer {r.json()['token']}"}
    esperar_mantenimiento()
    monkeypatch.setattr(spaces, "correo_configurado", lambda: True)
    monkeypatch.setattr(spaces, "recipients_for", lambda db, sede: {"comercial": ["gerente@super.co"],
                                                                     "montaje": []}, raising=False)
    enviados = []
    monkeypatch.setattr(spaces, "send_mail_to_bg", lambda to, asunto, html: enviados.append((to, asunto)))
    # Un envío de verdad no puede pasar: si el router no usara el suyo, esto lo diría.
    monkeypatch.setattr(mailer, "enviar_con_diagnostico", lambda *a: (_ for _ in ()).throw(AssertionError("real")))

    proveedor = client.post("/api/suppliers/", json={"name": "Alpina", "email": "ventas@alpina.co"}, headers=cab)
    assert proveedor.status_code in (200, 201), proveedor.text
    espacio = client.post("/api/spaces/find-or-create", json={"code": "NAVE-PUN-04", "sede": "NAVE",
                                                              "name": "Punta 4"}, headers=cab).json()
    hoy = datetime.now(timezone.utc).date()
    r = client.post(f"/api/spaces/{espacio['id']}/leases", headers=cab, json={
        "supplier_id": proveedor.json()["id"], "start_date": str(hoy), "end_date": str(hoy + timedelta(days=30)),
        "monthly_rent": 100000,
    })
    assert r.status_code in (200, 201), r.text
    asuntos = [a for _t, a in enviados]
    assert ["gerente@super.co"] in [t for t, _a in enviados]
    assert ["ventas@alpina.co"] in [t for t, _a in enviados]
    assert any(a.startswith("Nuevo contrato") for a in asuntos), asuntos
    filas = _filas()
    assert len(filas) == len(enviados) and {f[0] for f in filas} == {"enviado"}
    assert sorted(tuple(f[3]) for f in filas) == sorted(tuple(t) for t, _a in enviados)
