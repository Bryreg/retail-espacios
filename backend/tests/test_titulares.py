"""Los derechos de UNA persona (auditoría pre-lanzamiento, P1-14).

El operador exporta y suprime a una persona concreta —una usuaria por su
correo, o el contacto de un proveedor— en todas las bases, y queda la
constancia y la línea en las dos bitácoras. La persona con cuenta baja lo suyo.

Mismo patrón que ``test_derechos.py``: verificador falso por
``dependency_overrides`` (acá acumulativo: varias cuentas en la misma prueba),
``OPERADOR_EMAILS`` por ``monkeypatch`` y todo ``import app.*`` adentro.
"""
from types import SimpleNamespace

ANA = "ana.perez@acme.example"
DUENA = "duena@acme.example"
OPERADOR = "op@recabra.example"
CONTACTO = "juan@alpina.example"
TELEFONO = "300 123 4567"


class FakeVerificador:
    def __init__(self, mapa: dict):
        self.mapa = mapa

    def verificar(self, id_token):
        return self.mapa.get(id_token)


def _claims(uid, email, nombre=None):
    return SimpleNamespace(uid=uid, email=email, email_verificado=True, proveedor="google.com", nombre=nombre)


def _cab(token):
    return {"Authorization": f"Bearer {token}"}


class Cuentas:
    def __init__(self, client):
        from app.services.firebase_tokens import get_verificador

        self.client = client
        self.mapa = {}
        client.app.dependency_overrides[get_verificador] = lambda: FakeVerificador(self.mapa)

    def fundar(self, uid, email, slug, nombre, persona=None):
        self.mapa[uid] = _claims(uid, email, persona)
        r = self.client.post("/api/clientes/alta", json={
            "id_token": uid, "slug": slug, "nombre": nombre, "acepta_politica": True})
        assert r.status_code == 200, r.text
        return _cab(r.json()["token"])

    def invitar_y_entrar(self, cab_duena, uid, email, rol, persona=None):
        r = self.client.post("/api/usuarios/invitar", json={"email": email, "rol": rol}, headers=cab_duena)
        assert r.status_code == 200, r.text
        self.mapa[uid] = _claims(uid, email, persona)
        r = self.client.post("/api/auth/oauth", json={"id_token": uid, "acepta_politica": True})
        assert r.status_code == 200, r.text
        return _cab(r.json()["token"])


def _escenario(client, monkeypatch):
    """Acme con su dueña, Ana (administración) que crea un proveedor y figura en
    la libreta de avisos, y el contacto de Alpina. Y un operador."""
    cuentas = Cuentas(client)
    duena = cuentas.fundar("uid-duena", DUENA, "acme", "Acme")
    ana = cuentas.invitar_y_entrar(duena, "uid-ana", ANA, "admin", persona="Ana Pérez")

    r = client.post("/api/suppliers/", json={
        "name": "Alpina", "contact_name": "Juan Gómez", "phone": TELEFONO, "email": CONTACTO,
        "notes": f"Llamar a Juan al {TELEFONO}; avisar a {ANA}",
    }, headers=ana)
    assert r.status_code == 201, r.text
    proveedor_id = r.json()["id"]

    r = client.put("/api/notifications/contacts", json={
        "gerente": [DUENA], "by_sede": {"NAVE": {"admin": [ANA], "mercaderista": []}}}, headers=duena)
    assert r.status_code == 200, r.text

    operador = cuentas.fundar("uid-op", OPERADOR, "operapla", "Opera Plataforma")
    monkeypatch.setenv("OPERADOR_EMAILS", OPERADOR)
    return SimpleNamespace(cuentas=cuentas, duena=duena, ana=ana, operador=operador, proveedor_id=proveedor_id)


def _textos_de_la_base(slug: str) -> list[str]:
    """Cada valor de texto de cada tabla del supermercado, para buscar a mano."""
    from sqlalchemy import String, Text, select

    from app.clientes import buscar, motor_de
    from app.database import Base
    from app.services.traspaso import TABLAS_DEL_CLIENTE

    fuera = []
    with motor_de(buscar(slug)).connect() as cx:
        for nombre in TABLAS_DEL_CLIENTE:
            tabla = Base.metadata.tables[nombre]
            cols = [c for c in tabla.columns if isinstance(c.type, (String, Text))]
            if not cols:
                continue
            for fila in cx.execute(select(*cols)):
                fuera += [v for v in fila if isinstance(v, str)]
    return fuera


def _bitacora_plataforma(accion: str) -> list[str]:
    from app.clientes import sesion_registro
    from app.models.plataforma import BitacoraPlataforma

    reg = sesion_registro()
    try:
        return [f.periodo for f in reg.query(BitacoraPlataforma).filter(BitacoraPlataforma.accion == accion)]
    finally:
        reg.close()


def _bitacora_del_cliente(slug: str, accion: str) -> list:
    from app.clientes import buscar, sesion_de
    from app.models.models import AuditEntry

    db = sesion_de(buscar(slug))
    try:
        return [(f.rol, f.detalle) for f in db.query(AuditEntry).filter(AuditEntry.accion == accion)]
    finally:
        db.close()


# ─── Quién puede ──────────────────────────────────────────────────────────────

def test_solo_el_operador_atiende_titulares(client, monkeypatch):
    e = _escenario(client, monkeypatch)
    for cab in (e.duena, e.ana):
        assert client.post("/api/plataforma/titulares/exportar", json={"correo": ANA}, headers=cab).status_code == 403
        assert client.post("/api/plataforma/titulares/suprimir",
                           json={"correo": ANA, "referencia": "x"}, headers=cab).status_code == 403
    assert client.post("/api/plataforma/titulares/exportar", json={"correo": ANA}).status_code == 401


def test_sin_persona_es_422(client, monkeypatch):
    e = _escenario(client, monkeypatch)
    r = client.post("/api/plataforma/titulares/exportar", json={}, headers=e.operador)
    assert r.status_code == 422, r.text


# ─── Exportar ─────────────────────────────────────────────────────────────────

def test_exportar_a_una_usuaria_en_todas_las_bases_y_queda_en_las_bitacoras(client, monkeypatch):
    from app.plataforma_metricas import periodo_actual

    e = _escenario(client, monkeypatch)
    r = client.post("/api/plataforma/titulares/exportar",
                    json={"correo": ANA.upper(), "referencia": "Radicado 12"}, headers=e.operador)
    assert r.status_code == 200, r.text
    cuerpo = r.json()

    # La cuenta, con su membresía y su aceptación de la política.
    assert cuerpo["cuenta"]["correo"] == ANA
    assert cuerpo["cuenta"]["nombre"] == "Ana Pérez"
    assert [m["supermercado"] for m in cuerpo["cuenta"]["membresias"]] == ["acme"]
    assert cuerpo["cuenta"]["aceptaciones_de_la_politica"]
    # En el registro: la invitación que la nombra.
    assert any(o["tabla"] == "invitaciones" for o in cuerpo["registro"])
    # En Acme: la bitácora (lo que hizo), la libreta de avisos y la nota del proveedor.
    acme = cuerpo["supermercados"]["acme"]
    assert any(l["accion"] == "proveedor.alta" for l in acme["acciones_en_la_bitacora"])
    tablas = {(o["tabla"], o["columna"]) for o in acme["ocurrencias"]}
    assert ("app_config", "value") in tablas
    assert ("suppliers", "notes") in tablas
    # La base del operador no la menciona: no aparece.
    assert "operapla" not in cuerpo["supermercados"]

    # La constancia, sin el correo.
    from app.clientes import sesion_registro
    from app.models.terminos import DerechoDeTitular

    reg = sesion_registro()
    try:
        fila = reg.get(DerechoDeTitular, cuerpo["constancia"])
        assert fila.tipo == "export" and fila.atendido_por == OPERADOR
        assert fila.referencia == "Radicado 12"
        assert ANA not in (fila.huella + fila.resumen_json)
    finally:
        reg.close()

    mes = periodo_actual()
    assert set(_bitacora_plataforma("titular_export")) == {f"acme:{mes}", f"_registro_:{mes}"}
    lineas = _bitacora_del_cliente("acme", "titular.exportado")
    assert lineas and lineas[0][0] == "plataforma"
    assert f"#{cuerpo['constancia']}" in lineas[0][1]
    assert ANA not in lineas[0][1]


def test_exportar_el_contacto_de_un_proveedor(client, monkeypatch):
    e = _escenario(client, monkeypatch)
    r = client.post("/api/plataforma/titulares/exportar",
                    json={"cliente": "acme", "proveedor_id": e.proveedor_id}, headers=e.operador)
    assert r.status_code == 200, r.text
    cuerpo = r.json()
    assert cuerpo["sujeto"] == "contacto"
    assert cuerpo["cuenta"] is None and cuerpo["registro"] == []
    [contacto] = cuerpo["supermercados"]["acme"]["contacto_de_proveedor"]
    assert contacto["contacto"] == "Juan Gómez" and contacto["correo"] == CONTACTO
    # El teléfono escrito en la nota también se encuentra.
    assert any(o["tabla"] == "suppliers" and o["columna"] == "notes"
               for o in cuerpo["supermercados"]["acme"]["ocurrencias"])


# ─── Suprimir ─────────────────────────────────────────────────────────────────

def test_suprimir_sin_referencia_es_422(client, monkeypatch):
    e = _escenario(client, monkeypatch)
    r = client.post("/api/plataforma/titulares/suprimir", json={"correo": ANA}, headers=e.operador)
    assert r.status_code == 422, r.text


def test_suprimir_a_una_usuaria_la_anonimiza_en_todas_las_bases(client, monkeypatch):
    from app.clientes import buscar, sesion_de, sesion_registro
    from app.models.consentimiento import Consentimiento
    from app.models.identidad import Membresia, Usuario
    from app.models.models import AuditEntry
    from app.plataforma_metricas import periodo_actual

    e = _escenario(client, monkeypatch)
    db = sesion_de(buscar("acme"))
    try:
        lineas_antes = db.query(AuditEntry).count()
    finally:
        db.close()
    assert any(ANA in t for t in _textos_de_la_base("acme")), "el escenario no la dejó en la base"

    r = client.post("/api/plataforma/titulares/suprimir",
                    json={"correo": ANA, "referencia": "Correo del 2026-10-30"}, headers=e.operador)
    assert r.status_code == 200, r.text
    resumen = r.json()
    assert "acme" in resumen["supermercados"]
    assert resumen["membresias_apagadas"] == ["acme"]

    # Ni el correo ni el nombre quedan en ninguna columna de texto de Acme.
    textos = _textos_de_la_base("acme")
    assert not any(ANA in t.lower() for t in textos)
    assert any("titular-suprimido-" in t for t in textos)

    # La bitácora NO se borró: se anonimizó, y suma la línea de la supresión.
    db = sesion_de(buscar("acme"))
    try:
        assert db.query(AuditEntry).count() == lineas_antes + 1
        alta = db.query(AuditEntry).filter(AuditEntry.accion == "proveedor.alta").one()
        assert "titular-suprimido-" in alta.detalle
    finally:
        db.close()

    # En el registro: la cuenta queda sin correo ni nombre, la membresía
    # apagada, la constancia de la política intacta (sin correo que la ate).
    reg = sesion_registro()
    try:
        assert reg.query(Usuario).filter(Usuario.email == ANA).first() is None
        u = reg.query(Usuario).filter(Usuario.email.like("suprimido-%")).one()
        assert u.nombre is None and u.firebase_uid.startswith("suprimido-")
        assert reg.query(Membresia).filter(Membresia.usuario_id == u.id).one().activo is False
        assert reg.query(Consentimiento).filter(Consentimiento.usuario_id == u.id).count() >= 1
    finally:
        reg.close()

    # Su sesión deja de abrir Acme.
    assert client.get("/api/spaces/comercial", headers=e.ana).status_code in (401, 403)

    # Las dos bitácoras y el reporte de transparencia de Acme lo dicen.
    mes = periodo_actual()
    assert f"acme:{mes}" in _bitacora_plataforma("titular_supresion")
    assert _bitacora_del_cliente("acme", "titular.suprimido")
    r = client.get("/api/clientes/mi-reporte-plataforma", headers=e.duena)
    assert r.status_code == 200, r.text
    assert any(l["accion"] == "titular_supresion" for l in r.json()["accesos"]["lineas"])

    # Y volver a buscarla ya no encuentra nada en Acme.
    r = client.post("/api/plataforma/titulares/exportar", json={"correo": ANA}, headers=e.operador)
    assert r.status_code == 200
    assert r.json()["cuenta"] is None
    assert "acme" not in r.json()["supermercados"]


def test_suprimir_el_contacto_de_un_proveedor_conserva_al_proveedor(client, monkeypatch):
    from app.clientes import buscar, sesion_de
    from app.models.models import Supplier

    e = _escenario(client, monkeypatch)
    r = client.post("/api/plataforma/titulares/suprimir",
                    json={"cliente": "acme", "proveedor_id": e.proveedor_id, "referencia": "Pedido de Acme"},
                    headers=e.operador)
    assert r.status_code == 200, r.text
    assert r.json()["registro"] == {}  # el contacto no tiene cuenta: el registro no se toca

    db = sesion_de(buscar("acme"))
    try:
        s = db.get(Supplier, e.proveedor_id)
        assert s.name == "Alpina"
        assert (s.contact_name, s.phone, s.email) == (None, None, None)
        assert TELEFONO not in (s.notes or "")
    finally:
        db.close()
    textos = _textos_de_la_base("acme")
    assert not any(CONTACTO in t.lower() or TELEFONO in t for t in textos)


def test_la_unica_duena_no_se_suprime_sin_confirmarlo(client, monkeypatch):
    e = _escenario(client, monkeypatch)
    r = client.post("/api/plataforma/titulares/suprimir",
                    json={"correo": DUENA, "referencia": "x"}, headers=e.operador)
    assert r.status_code == 409, r.text
    assert r.json()["detail"]["codigo"] == "unica_duena"
    assert r.json()["detail"]["supermercados"] == ["acme"]
    # Nada cambió.
    assert any(DUENA in t for t in _textos_de_la_base("acme"))

    r = client.post("/api/plataforma/titulares/suprimir",
                    json={"correo": DUENA, "referencia": "x", "aunque_sea_la_unica_duena": True},
                    headers=e.operador)
    assert r.status_code == 200, r.text
    assert not any(DUENA in t.lower() for t in _textos_de_la_base("acme"))


def test_la_lista_de_constancias_no_tiene_correos(client, monkeypatch):
    e = _escenario(client, monkeypatch)
    client.post("/api/plataforma/titulares/exportar", json={"correo": ANA}, headers=e.operador)
    r = client.get("/api/plataforma/titulares", headers=e.operador)
    assert r.status_code == 200, r.text
    assert len(r.json()) == 1
    assert "@acme" not in r.text
    assert _bitacora_plataforma("titulares")


def test_la_supresion_no_escribe_correos_en_el_log(client, monkeypatch, caplog):
    import logging

    e = _escenario(client, monkeypatch)
    with caplog.at_level(logging.DEBUG):
        client.post("/api/plataforma/titulares/exportar", json={"correo": ANA}, headers=e.operador)
        client.post("/api/plataforma/titulares/suprimir", json={"correo": ANA, "referencia": "x"},
                    headers=e.operador)
    assert ANA not in caplog.text


# ─── Descargar mis datos ──────────────────────────────────────────────────────

def test_descargar_mis_datos(client, monkeypatch):
    e = _escenario(client, monkeypatch)
    r = client.get("/api/auth/mis-datos", headers=e.ana)
    assert r.status_code == 200, r.text
    assert "attachment" in r.headers["content-disposition"]
    cuerpo = r.json()
    assert cuerpo["cuenta"]["correo"] == ANA
    acme = cuerpo["supermercados"]["acme"]
    assert any(l["accion"] == "proveedor.alta" for l in acme["acciones_en_la_bitacora"])
    # El detalle de la bitácora se cuenta, no se copia.
    for o in acme["ocurrencias"]:
        if o["tabla"] == "audit_log":
            assert o["valor"] is None
    # Sólo los supermercados donde tiene acceso: el del operador no.
    assert set(cuerpo["supermercados"]) == {"acme"}
    assert _bitacora_del_cliente("acme", "titular.descarga")


def test_mis_datos_pide_una_cuenta_personal(client, admin):
    assert client.get("/api/auth/mis-datos", headers=admin).status_code == 403
    assert client.get("/api/auth/mis-datos").status_code == 401


def test_mis_datos_tiene_el_freno_del_export(client, monkeypatch):
    e = _escenario(client, monkeypatch)
    for _ in range(3):
        assert client.get("/api/auth/mis-datos", headers=e.ana).status_code == 200
    assert client.get("/api/auth/mis-datos", headers=e.ana).status_code == 429
