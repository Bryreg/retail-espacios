"""Auditoría integral (post Fase 6) — Dimensión 6: compliance y privacidad (Ley 1581).

Territorio de este archivo, único que toca este agente: `tests/test_auditoria_compliance.py`.
No repite lo que ya cubren `test_compliance_ataques.py` (x1..x29), `test_consentimiento.py`,
`test_derechos.py`, `test_estado_cuenta.py`, ni el hallazgo de retención por CANTIDAD de filas
que ya reporta `test_auditoria_frontera.py::test_f08_hallazgo_la_bitacora_del_operador_no_se_purga_nunca`
(dimensión 2 — aislamiento y base de datos). Ese test demuestra que `bitacora_plataforma` y
`snapshot_metricas` nunca se purgan (CRECIMIENTO). Este archivo agrega el ángulo que le falta:
el CONTENIDO de lo que se guarda ahí sin sanear y sin plazo, y si eso es un dato de un tercero
bajo la Ley 1581.

Todos los `import app.*` van adentro de las funciones -- el fixture `client` de `conftest.py`
purga `sys.modules['app.*']` entre pruebas.
"""
import json
from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace

import pytest


# ════════════════════════════════════════════════════════════════════════════
# ANDAMIAJE — mismo patrón que test_tendencia_ataques.py / test_metricas_ataques.py
# ════════════════════════════════════════════════════════════════════════════

class FakeVerificador:
    def __init__(self, mapa: dict):
        self.mapa = mapa

    def verificar(self, id_token):
        return self.mapa.get(id_token)


def _claims(uid, email, verificado=True, proveedor="google.com", nombre=None):
    return SimpleNamespace(
        uid=uid, email=email, email_verificado=verificado, proveedor=proveedor, nombre=nombre,
    )


class Identidades:
    def __init__(self, client):
        self.client = client
        self.mapa: dict = {}

    def registrar(self, uid, email):
        from app.services.firebase_tokens import get_verificador

        self.mapa[uid] = _claims(uid, email)
        self.client.app.dependency_overrides[get_verificador] = lambda: FakeVerificador(self.mapa)
        return uid


def _cab(token):
    return {"Authorization": f"Bearer {token}"}


def _fundar(ids: Identidades, uid, email, slug, nombre):
    ids.registrar(uid, email)
    r = ids.client.post(
        "/api/clientes/alta",
        json={"id_token": uid, "slug": slug, "nombre": nombre, "acepta_politica": True},
    )
    assert r.status_code == 200, r.text
    return _cab(r.json()["token"])


def _operador_sin_membresias(ids: Identidades, monkeypatch, uid="uid-op", email="op@recabra.co"):
    monkeypatch.setenv("OPERADOR_EMAILS", email)
    ids.registrar(uid, email)
    r = ids.client.post("/api/auth/oauth", json={"id_token": uid})
    assert r.status_code == 200, r.text
    return r.json()


def _sembrar(slug, sedes: dict, contratos: list):
    """Escribe layout + espacios + contratos en la base DEL CLIENTE."""
    from app.clientes import buscar, sesion_de
    from app.models.models import LayoutSnapshot, Space, SpaceLease, Supplier

    cliente = buscar(slug)
    assert cliente is not None, slug
    db = sesion_de(cliente)
    try:
        for sede, fixtures in sedes.items():
            db.add(LayoutSnapshot(sede=sede, fixtures_json=json.dumps(fixtures)))
        db.flush()

        proveedores: dict = {}
        espacios: dict = {}
        for codigo, proveedor, ini, fin, canon, activo in contratos:
            if proveedor not in proveedores:
                fila = db.query(Supplier).filter(Supplier.name == proveedor).first()
                if fila is None:
                    fila = Supplier(name=proveedor)
                    db.add(fila)
                    db.flush()
                proveedores[proveedor] = fila
            if codigo not in espacios:
                espacio = db.query(Space).filter(Space.code == codigo).first()
                if espacio is None:
                    espacio = Space(
                        code=codigo, svg_id=f"svg-{codigo}", name=codigo,
                        zone="Zona", sede=codigo.split("-")[0], area_m2=5.0,
                    )
                    db.add(espacio)
                    db.flush()
                espacios[codigo] = espacio
            db.add(SpaceLease(
                space_id=espacios[codigo].id,
                supplier_id=proveedores[proveedor].id,
                start_date=date.fromisoformat(ini),
                end_date=date.fromisoformat(fin),
                monthly_rent=canon,
                is_active=activo,
            ))
        db.commit()
    finally:
        db.close()


# El nombre de proveedor es texto libre que carga el comercial del supermercado
# (Fase 4, docstring de `_sanear_nombre`): nada impide que alguien pegue ahí el
# contacto directo de la persona del proveedor -- exactamente lo que la propia
# Fase 4 dice que el saneo existe para evitar que "filtre un dato de contacto de
# un tercero" (ESTADO.md, Fase 4).
PROVEEDOR_CON_CONTACTO = "Distribuidora Alpina - contacto directo carlos.perez@alpina-ejemplo.example +57 300 555 0177"


# ════════════════════════════════════════════════════════════════════════════
# compliance-1 · el saneo de nombre de proveedor es SOLO de lectura: a disco
# (snapshot_metricas, tabla del REGISTRO, compartida por toda la plataforma)
# baja el nombre ORIGINAL, sin sanear y sin plazo de conservación.
# ════════════════════════════════════════════════════════════════════════════
#
# `models/plataforma.py::SnapshotMetricas.proveedores_json` lo dice en su propio
# docstring: "JSON: {nombre_ORIGINAL_del_proveedor: nº de contratos activos}".
# `plataforma_metricas.publicas_desde_crudos` / `plataforma_tendencia.publicar_fila`
# aplican `_top()` (que sanea correos y teléfonos) SOLO al leer la serie para el
# JSON público -- nunca al escribir el snapshot. El resultado: un dato de
# contacto de un tercero (el proveedor no es titular de ninguna relación
# contractual con RECABRA, ni dio consentimiento) queda en texto plano en una
# tabla que:
#   (a) vive en el registro compartido, no en la base del cliente que lo cargó;
#   (b) según `test_auditoria_frontera.py::test_f08` nunca se purga -- así que
#       "sin plazo" no es hipotético, es demostrado por otro archivo;
#   (c) NO aparece mencionada en `docs/legal/politica-datos.md` §6 ("Cuánto
#       tiempo conservamos los datos") ni en §2.3 ("Contactos de proveedores"),
#       que sólo describe la copia que vive en la base DEL CLIENTE.
#
# Esto no es (todavía) una fuga por API -- `test_t13` en
# `test_tendencia_ataques.py` ya prueba que la respuesta pública nunca lleva un
# `@` ni un teléfono. Es una fuga de la GARANTÍA: el dato que la Fase 4 promete
# sanear "para que el campo de texto libre que carga el supermercado no filtre
# un dato de contacto de un tercero" (ESTADO.md) sigue existiendo, sin sanear,
# apenas un nivel más abajo -- a un `db.query` de distancia de cualquiera con
# acceso al registro (soporte, un backup, un futuro endpoint de diagnóstico).

def _snapshot_de(cliente_slug: str, periodo: str):
    from app.clientes import sesion_registro
    from app.models.plataforma import SnapshotMetricas

    reg = sesion_registro()
    try:
        return (
            reg.query(SnapshotMetricas)
            .filter(SnapshotMetricas.cliente_slug == cliente_slug, SnapshotMetricas.periodo == periodo)
            .first()
        )
    finally:
        reg.close()


def test_compliance1_snapshot_metricas_no_deberia_guardar_el_contacto_del_proveedor_sin_sanear(
    client, monkeypatch,
):
    from app.plataforma_metricas import calcular, limpiar_cache_metricas, periodo_actual

    ids = Identidades(client)
    _fundar(ids, "uid-acme", "duena@acme.example", "acme", "Acme")
    # 3 contratos activos -- por encima del umbral K=3, para que el proveedor
    # jugoso entre de lleno al cálculo (no que quede fuera por celda chica).
    contratos = [
        ("NAVE-E-01", PROVEEDOR_CON_CONTACTO, "2026-09-01", "2026-09-30", 100_000.0, True),
        ("NAVE-E-02", PROVEEDOR_CON_CONTACTO, "2026-09-01", "2026-09-30", 100_000.0, True),
        ("NAVE-E-03", PROVEEDOR_CON_CONTACTO, "2026-09-01", "2026-09-30", 100_000.0, True),
    ]
    _sembrar("acme", {"NAVE": [
        {"code": "E-01", "type": "punta", "sede": "NAVE"},
        {"code": "E-02", "type": "punta", "sede": "NAVE"},
        {"code": "E-03", "type": "punta", "sede": "NAVE"},
    ]}, contratos)
    limpiar_cache_metricas()

    periodo = periodo_actual()
    calcular(periodo, origen="vista")  # write-through: deja la fila en snapshot_metricas

    fila = _snapshot_de("acme", periodo)
    assert fila is not None, "el write-through no dejó snapshot: la prueba no vale"

    crudo = json.loads(fila.proveedores_json or "{}")

    # Ni el correo ni el teléfono del contacto sobreviven a disco, ni siquiera
    # en el crudo interno: `_recortar_top` sanea el nombre ANTES del `json.dumps`
    # (arreglo de compliance-1 / frontera-2). Los NÚMEROS siguen crudos —K=3 se
    # aplica al leer—; lo que baja saneado es sólo la cadena.
    assert not any("@" in nombre for nombre in crudo), (
        f"el correo del contacto del proveedor quedó a disco sin sanear: {list(crudo)}"
    )
    assert not any("555 0177" in nombre for nombre in crudo), (
        f"el teléfono del contacto del proveedor quedó a disco sin sanear: {list(crudo)}"
    )
    assert not any("carlos.perez" in nombre for nombre in crudo), list(crudo)
    # El conteo NO se perdió con el saneo: sigue siendo el crudo de 3 contratos.
    assert list(crudo.values()) == [3], crudo

    # Y el saneo es idempotente: `publicar_fila` vuelve a pasar el nombre ya
    # saneado por `_top` en cada lectura, y eso no puede enmascarar dos veces.
    from app.plataforma_metricas import sanear_nombre_proveedor

    for nombre in crudo:
        assert sanear_nombre_proveedor(nombre) == nombre, nombre


# ════════════════════════════════════════════════════════════════════════════
# compliance-2 · el dato de contacto de un tercero, aunque nunca salga por
# `/tendencia`, SÍ sale completo por el camino de mantenimiento si alguna vez
# se agrega un `_top()` distinto (o uno con un bug) -- porque hoy sólo hay UN
# lugar que sanea, y es el de lectura, no el de escritura. Sonda directa: se
# demuestra que `SnapshotMetricas` no tiene NINGÚN mecanismo -- ni trigger, ni
# validación en el modelo, ni paso de saneo en el write-through de
# `plataforma_metricas.calcular` -- que impida escribir un nombre con `@` o
# dígitos de teléfono. Es una sonda de diseño, no de API: confirma que la
# invariante de privacidad depende enteramente de que TODO futuro lector
# recuerde llamar a `_top()`, algo que un solo endpoint nuevo (o un script de
# soporte que lea `snapshot_metricas` directo) puede romper sin tocar ningún
# test existente de frontera de API.
# ════════════════════════════════════════════════════════════════════════════

def test_compliance2_sonda_nada_impide_escribir_un_nombre_de_proveedor_con_arroba_en_el_registro():
    """Sonda de diseño (no requiere servidor): inserta directo en el modelo del
    registro un `proveedores_json` con un correo adentro y confirma que ORM y
    esquema lo aceptan sin quejarse -- no hay constraint, trigger ni validación
    de by-pass en `models/plataforma.py::SnapshotMetricas` que lo impida.
    Salida literal para el entregable."""
    import os
    import tempfile

    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    os.environ["DATABASE_URL"] = f"sqlite:///{path}"
    os.environ["JWT_SECRET"] = "test-secret-compliance2"
    os.environ["ENV"] = "test"
    os.environ["ADMIN_PASSWORD"] = "admin123"
    os.environ["WORKER_PASSWORD"] = "galerias"

    import app.database as appdb
    from app.database import Base
    from app.models.plataforma import SnapshotMetricas

    Base.metadata.create_all(bind=appdb.engine)
    Session = appdb.SessionLocal
    db = Session()
    try:
        crudo_con_contacto = json.dumps({
            "Distribuidora Alpina - carlos.perez@alpina-ejemplo.example": 3,
        })
        fila = SnapshotMetricas(
            cliente_slug="acme",
            periodo="2026-09",
            sedes_con_plano=1,
            espacios_comercializables=3,
            ocupadas=3,
            contratos_activos=3,
            canon_total=300_000.0,
            usuarios=1,
            proveedores_json=crudo_con_contacto,
            clientes_incluidos=1,
            clientes_con_error=0,
            origen="vista",
            capturado_en=datetime.now(timezone.utc),
        )
        db.add(fila)
        db.commit()  # NO lanza -- ni constraint ni trigger lo frena

        releida = db.query(SnapshotMetricas).filter(SnapshotMetricas.cliente_slug == "acme").first()
        assert releida is not None
        assert "@" in releida.proveedores_json, (
            "salida literal (compliance-2): el esquema aceptó y persistió un correo de "
            f"contacto de tercero sin sanear en snapshot_metricas.proveedores_json: "
            f"{releida.proveedores_json!r}"
        )
    finally:
        db.close()


# ════════════════════════════════════════════════════════════════════════════
# compliance-3 · el token de invitación (credencial, no sólo dato personal)
# viaja en TEXTO PLANO dentro del cuerpo del correo hacia Brevo/SendGrid, y
# `docs/legal/politica-datos.md` §9.1 declara el renglón del proveedor de
# correo saliente como "[COMPLETAR: proveedor de correo saliente]" -- ni
# siquiera nombra a Brevo/SendGrid, mientras que `docs/ESTADO.md` (líneas
# ~1785-1807) SÍ los nombra en detalle de ingeniería. La política, tal como
# está HOY (BORRADOR), no dice que el cuerpo del correo que ve el proveedor de
# terceros incluye un enlace con un token de sesión de un solo uso.
# ════════════════════════════════════════════════════════════════════════════

def test_compliance3_sonda_el_cuerpo_del_correo_de_invitacion_lleva_el_token_en_claro(client, monkeypatch):
    """Sonda (no xfail): intercepta `send_mail_to_bg` para capturar el HTML real
    que viajaría a la API de Brevo/SendGrid (`_enviar_por_api`) y confirma, con
    salida literal, que el token de invitación va en claro en el `href`. No es
    un hallazgo de fuga -- el token es de un solo uso y expira (`INVITACION_TTL_DIAS`,
    visto en `routers/usuarios.py`) -- pero SÍ es un dato que
    `docs/legal/politica-datos.md` §9.1 no describe todavía para el proveedor de
    correo saliente (deja el renglón en `[COMPLETAR]`), así que es una brecha de
    TRANSPARENCIA documentada acá con reproducción, no una sospecha."""
    import app.services.mailer as mailer

    capturado = {}

    def _fake_send(recipients, subject, html_body):
        capturado["recipients"] = recipients
        capturado["subject"] = subject
        capturado["html"] = html_body
        return True

    monkeypatch.setattr(mailer, "send_mail_to_bg", _fake_send)
    # `routers/usuarios.py` importa el símbolo directo -- hay que parchear ahí también.
    import app.routers.usuarios as usuarios_router
    monkeypatch.setattr(usuarios_router, "send_mail_to_bg", _fake_send)

    ids = Identidades(client)
    cab_owner = _fundar(ids, "uid-acme", "duena@acme.example", "acme", "Acme")

    r = client.post(
        "/api/usuarios/invitar",
        json={"email": "invitado@ejemplo.example", "rol": "admin"},
        headers=cab_owner,
    )
    assert r.status_code == 200, r.text

    assert "html" in capturado, "no se interceptó el envío -- la sonda no vale"
    assert "?invitacion=" in capturado["html"], (
        f"salida literal (compliance-3): el correo NO llevó el token donde se esperaba: "
        f"{capturado['html'][:400]!r}"
    )

    # Salida literal para el entregable: el fragmento exacto que viajaría en el
    # `payload["htmlContent"]` de la llamada HTTPS a Brevo/SendGrid.
    import re
    enlace = re.search(r'href="([^"]+)"', capturado["html"])
    assert enlace is not None
    print("compliance-3 -- enlace con token que viaja al proveedor de correo:", enlace.group(1))
