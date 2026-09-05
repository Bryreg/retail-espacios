"""Derechos del titular (Fase 3): export owner-only + solicitud de supresión.

Mismo patrón que ``test_alta.py``/``test_plataforma.py``: verificador falso vía
``dependency_overrides``, ``OPERADOR_EMAILS`` por ``monkeypatch``, y todo
``import app.*`` ADENTRO de las funciones -- el fixture ``client`` de
``conftest.py`` purga ``sys.modules['app.*']`` entre pruebas.
"""
from types import SimpleNamespace

from conftest import CLAVE_ADMIN, CLAVE_WORKER

MENSAJE_NO_OWNER = "Solo el owner del cliente puede hacer esto."
CLAVES_DEL_EXPORT = {"cliente", "generado_en", "version_politica", "spaces", "leases", "suppliers", "layouts"}

# Una IP pública, reconocible, que se manda a propósito en una acción de
# negocio para comprobar que el export NUNCA la repite (no es de bitácora).
IP_CONOCIDA = "9.9.9.9"


class FakeVerificador:
    def __init__(self, mapa: dict):
        self.mapa = mapa

    def verificar(self, id_token):
        return self.mapa.get(id_token)


def _claims(uid, email, verificado=True, proveedor="google.com", nombre=None):
    return SimpleNamespace(
        uid=uid, email=email, email_verificado=verificado, proveedor=proveedor, nombre=nombre,
    )


def _usar_verificador(client, mapa: dict):
    from app.services.firebase_tokens import get_verificador
    client.app.dependency_overrides[get_verificador] = lambda: FakeVerificador(mapa)


def _cab(token):
    return {"Authorization": f"Bearer {token}"}


def _fundar(client, uid, email, slug, nombre):
    """Funda un cliente por el alta self-service -- el fundador nace owner."""
    _usar_verificador(client, {uid: _claims(uid, email)})
    r = client.post(
        "/api/clientes/alta",
        json={"id_token": uid, "slug": slug, "nombre": nombre, "acepta_politica": True},
    )
    assert r.status_code == 200, r.text
    return _cab(r.json()["token"])


def _invitar_y_entrar(client, owner_cab, *, uid, email, rol):
    """Invita a `email` con `rol` sobre el cliente de `owner_cab` y hace su
    primer oauth -- devuelve la cabecera de esa cuenta (rol de MEMBRESÍA, no
    del JWT: un `admin` invitado sigue sin ser owner)."""
    r = client.post("/api/usuarios/invitar", json={"email": email, "rol": rol}, headers=owner_cab)
    assert r.status_code == 200, r.text
    _usar_verificador(client, {uid: _claims(uid, email)})
    # `acepta_politica: True` de entrada -- Fase 3 se lo pide una vez al
    # entrar y no es lo que este archivo prueba.
    r = client.post("/api/auth/oauth", json={"id_token": uid, "acepta_politica": True})
    assert r.status_code == 200, r.text
    return _cab(r.json()["token"])


def _operador(client, monkeypatch, *, uid="uid-operador", email="op@recabra.co",
              slug="operapla", nombre="Opera Plataforma"):
    cab = _fundar(client, uid, email, slug, nombre)
    monkeypatch.setenv("OPERADOR_EMAILS", email)
    return cab


# ════════════════════════════════════════════════════════════════════════════
# Owner-only: la MISMA frontera para export y supresión
# ════════════════════════════════════════════════════════════════════════════

def test_worker_legado_403_en_los_dos_endpoints(client, worker):
    assert client.get("/api/clientes/mi-export", headers=worker).status_code == 403
    r = client.post("/api/clientes/solicitar-supresion", json={}, headers=worker)
    assert r.status_code == 403
    assert r.json()["detail"] == MENSAJE_NO_OWNER


def test_admin_legado_sin_sub_403_en_los_dos_endpoints(client, admin):
    """El legado nunca trae `sub`: no hay membresía que buscar, así que ni
    siquiera el admin de siempre (que en el resto de la app puede todo) pasa."""
    r1 = client.get("/api/clientes/mi-export", headers=admin)
    assert r1.status_code == 403
    assert r1.json()["detail"] == MENSAJE_NO_OWNER

    r2 = client.post("/api/clientes/solicitar-supresion", json={}, headers=admin)
    assert r2.status_code == 403
    assert r2.json()["detail"] == MENSAJE_NO_OWNER


def test_cuenta_con_sub_pero_membresia_admin_no_owner_403(client):
    """El rol del JWT (`admin`, porque owner viaja como admin -- Fase 1,
    decisión 5) NO alcanza: sólo la membresía `owner` sirve."""
    owner_cab = _fundar(client, "uid-duenio", "duenio@x.co", "conadmin", "Con Admin")
    gerente_cab = _invitar_y_entrar(
        client, owner_cab, uid="uid-gerente", email="gerente@x.co", rol="admin",
    )

    r1 = client.get("/api/clientes/mi-export", headers=gerente_cab)
    assert r1.status_code == 403
    assert r1.json()["detail"] == MENSAJE_NO_OWNER

    r2 = client.post("/api/clientes/solicitar-supresion", json={}, headers=gerente_cab)
    assert r2.status_code == 403
    assert r2.json()["detail"] == MENSAJE_NO_OWNER


def test_cuenta_con_sub_pero_membresia_worker_403(client):
    owner_cab = _fundar(client, "uid-duenio2", "duenio2@x.co", "conworker", "Con Worker")
    peon_cab = _invitar_y_entrar(
        client, owner_cab, uid="uid-peon", email="peon@x.co", rol="worker",
    )

    assert client.get("/api/clientes/mi-export", headers=peon_cab).status_code == 403
    assert client.post("/api/clientes/solicitar-supresion", json={}, headers=peon_cab).status_code == 403


# ════════════════════════════════════════════════════════════════════════════
# GET /clientes/mi-export
# ════════════════════════════════════════════════════════════════════════════

def test_owner_200_con_las_claves_exactas_del_contrato(client):
    owner_cab = _fundar(client, "uid-ok", "ok@x.co", "exportable", "Exportable")

    r = client.get("/api/clientes/mi-export", headers=owner_cab)
    assert r.status_code == 200, r.text
    body = r.json()
    assert set(body.keys()) == CLAVES_DEL_EXPORT
    assert body["cliente"] == {"slug": "exportable", "nombre": "Exportable"}
    # Contra la CONSTANTE, no contra el literal: cuando la política sube de
    # versión (Fase 7: "2026-09-v2") este contrato no puede quedar afirmando
    # una versión que ya no existe. El literal se afirma en UN solo lugar
    # -- `tests/test_consentimiento.py`, contra el encabezado del documento.
    from app.models.consentimiento import VERSION_POLITICA

    assert body["version_politica"] == VERSION_POLITICA
    assert body["generado_en"]
    assert body["spaces"] == []
    assert body["leases"] == []
    assert body["suppliers"] == []
    assert body["layouts"] == {}

    # Cabecera de descarga, con el slug y sin espacios raros.
    disposicion = r.headers.get("content-disposition", "")
    assert "attachment" in disposicion
    assert "recabra-export-exportable-" in disposicion
    assert disposicion.endswith('.json"')


def test_export_trae_los_datos_de_negocio_completos_incluida_la_plata(client):
    """El owner es admin: acá NO se redacta `monthly_rent`, a diferencia de
    todas las demás respuestas que sí lo hacen para `worker`."""
    owner_cab = _fundar(client, "uid-plata", "plata@x.co", "conplata", "Con Plata")

    sup = client.post("/api/suppliers/", json={"name": "Alpina"}, headers=owner_cab)
    assert sup.status_code == 201, sup.text
    supplier_id = sup.json()["id"]

    space = client.post(
        "/api/spaces/find-or-create",
        json={"svg_id": "s-export", "code": "EXP-01", "sede": "NAVE"},
        headers=owner_cab,
    )
    assert space.status_code in (200, 201), space.text
    space_id = space.json()["id"]

    lease = client.post(
        f"/api/spaces/{space_id}/leases",
        json={
            "supplier_id": supplier_id, "monthly_rent": 1234567,
            "start_date": "2026-01-01", "end_date": "2026-12-31",
        },
        headers=owner_cab,
    )
    assert lease.status_code == 201, lease.text

    r = client.get("/api/clientes/mi-export", headers=owner_cab)
    assert r.status_code == 200, r.text
    body = r.json()

    assert any(s["name"] == "Alpina" for s in body["suppliers"])
    assert any(sp["code"] == "EXP-01" and sp["sede"] == "NAVE" for sp in body["spaces"])
    filas_lease = [l for l in body["leases"] if l["supplier_id"] == supplier_id]
    assert filas_lease and filas_lease[0]["monthly_rent"] == 1234567, (
        "el export le redactó la plata al owner -- no debería"
    )


def test_export_no_filtra_bitacora_hashes_ni_tablas_de_intentos(client):
    owner_cab = _fundar(client, "uid-secreto", "duenia@secreto.co", "secretito", "Secretito")

    # Una acción de negocio con una IP reconocible -- si el export tocara la
    # bitácora (tiene IPs de terceros), esta cadena aparecería en la respuesta.
    r_sup = client.post(
        "/api/suppliers/", json={"name": "Proveedor Secreto"},
        headers={**owner_cab, "X-Forwarded-For": IP_CONOCIDA},
    )
    assert r_sup.status_code == 201, r_sup.text

    r = client.get("/api/clientes/mi-export", headers=owner_cab)
    assert r.status_code == 200, r.text
    crudo = r.text
    texto = crudo.lower()

    assert IP_CONOCIDA not in crudo, "el export filtró una IP de la bitácora"
    assert "password" not in texto, "el export filtró una clave"
    assert "hash" not in texto, "el export filtró un hash de app_config"
    for clave in ("audit_log", "login_attempts", "oauth_attempts",
                  "alta_attempts", "export_attempts", "estados_cliente"):
        assert clave not in texto, f"el export filtró la tabla {clave}"


def test_export_incluye_el_layout_de_cada_sede(client):
    owner_cab = _fundar(client, "uid-layout", "layout@x.co", "conlayout", "Con Layout")

    fixtures = [{"code": "PUN-01", "type": "gondola", "x": 0, "y": 0}]
    r_put = client.put("/api/layout/NAVE", json={"fixtures": fixtures}, headers=owner_cab)
    assert r_put.status_code == 200, r_put.text

    r = client.get("/api/clientes/mi-export", headers=owner_cab)
    assert r.status_code == 200, r.text
    layouts = r.json()["layouts"]
    assert "NAVE" in layouts
    assert layouts["NAVE"][0]["code"] == "PUN-01"


def test_cuarto_export_en_la_hora_da_429(client):
    owner_cab = _fundar(client, "uid-freno", "freno@x.co", "confreno", "Con Freno")

    codigos = [client.get("/api/clientes/mi-export", headers=owner_cab).status_code for _ in range(4)]
    assert codigos[:3] == [200, 200, 200], codigos
    assert codigos[3] == 429, codigos

    # Y el freno es por usuario -- un owner de OTRO cliente no lo hereda.
    otro_cab = _fundar(client, "uid-libre", "libre@x.co", "conlibre", "Con Libre")
    assert client.get("/api/clientes/mi-export", headers=otro_cab).status_code == 200


# ════════════════════════════════════════════════════════════════════════════
# POST /clientes/solicitar-supresion
# ════════════════════════════════════════════════════════════════════════════

def test_solicitar_supresion_201_y_duplicada_pendiente_409(client):
    owner_cab = _fundar(client, "uid-supr", "supr@x.co", "consupresion", "Con Supresión")

    r1 = client.post(
        "/api/clientes/solicitar-supresion", json={"motivo": "Cerramos la tienda"}, headers=owner_cab,
    )
    assert r1.status_code == 201, r1.text
    body = r1.json()
    assert body["cliente_slug"] == "consupresion"
    assert body["estado"] == "pendiente"
    assert body["motivo"] == "Cerramos la tienda"
    assert body["atendido_en"] is None
    assert body["atendido_por"] is None

    r2 = client.post(
        "/api/clientes/solicitar-supresion", json={"motivo": "Insisto"}, headers=owner_cab,
    )
    assert r2.status_code == 409, r2.text

    # Nada se borró -- el cliente y sus datos de negocio siguen intactos.
    assert client.get("/api/spaces/", headers=owner_cab).status_code == 200


def test_solicitar_supresion_sin_motivo_es_valido(client):
    owner_cab = _fundar(client, "uid-supr2", "supr2@x.co", "consinmotivo", "Con Sin Motivo")
    r = client.post("/api/clientes/solicitar-supresion", json={}, headers=owner_cab)
    assert r.status_code == 201, r.text
    assert r.json()["motivo"] is None


# ════════════════════════════════════════════════════════════════════════════
# Panel de plataforma: GET/PATCH /plataforma/supresiones
# ════════════════════════════════════════════════════════════════════════════

def test_get_supresiones_403_sin_operador(client):
    owner_cab = _fundar(client, "uid-nooper", "nooper@x.co", "connooper", "Con No Oper")
    assert client.get("/api/plataforma/supresiones", headers=owner_cab).status_code == 403


def test_get_supresiones_las_ve_el_operador(client, monkeypatch):
    owner_cab = _fundar(client, "uid-pide", "pide@x.co", "pidesupr", "Pide Supresión")
    r = client.post(
        "/api/clientes/solicitar-supresion", json={"motivo": "Vendimos el local"}, headers=owner_cab,
    )
    assert r.status_code == 201, r.text
    solicitud_id = r.json()["id"]

    cab_op = _operador(client, monkeypatch)
    r = client.get("/api/plataforma/supresiones", headers=cab_op)
    assert r.status_code == 200, r.text
    filas = r.json()["solicitudes"]
    assert any(f["id"] == solicitud_id and f["cliente_slug"] == "pidesupr" for f in filas)
    # Orden: más nuevas primero.
    creados = [f["creado_en"] for f in filas]
    assert creados == sorted(creados, reverse=True)


def test_patch_supresion_sin_nota_da_422(client, monkeypatch):
    owner_cab = _fundar(client, "uid-sinnota", "sinnota@x.co", "consinnota", "Con Sin Nota")
    r = client.post("/api/clientes/solicitar-supresion", json={}, headers=owner_cab)
    solicitud_id = r.json()["id"]

    cab_op = _operador(client, monkeypatch)
    r_patch = client.patch(
        f"/api/plataforma/supresiones/{solicitud_id}", json={"estado": "atendida", "nota": "   "}, headers=cab_op,
    )
    assert r_patch.status_code == 422, r_patch.text


def test_patch_supresion_estado_invalido_da_422(client, monkeypatch):
    owner_cab = _fundar(client, "uid-invalido", "invalido@x.co", "estadoinvalido", "Estado Inválido")
    r = client.post("/api/clientes/solicitar-supresion", json={}, headers=owner_cab)
    solicitud_id = r.json()["id"]

    cab_op = _operador(client, monkeypatch)
    r_patch = client.patch(
        f"/api/plataforma/supresiones/{solicitud_id}",
        json={"estado": "pendiente", "nota": "no corresponde"}, headers=cab_op,
    )
    assert r_patch.status_code == 422, r_patch.text


def test_patch_supresion_requiere_operador(client, monkeypatch):
    owner_cab = _fundar(client, "uid-sinop", "sinop@x.co", "consinop", "Con Sin Op")
    r = client.post("/api/clientes/solicitar-supresion", json={}, headers=owner_cab)
    solicitud_id = r.json()["id"]

    r_patch = client.patch(
        f"/api/plataforma/supresiones/{solicitud_id}",
        json={"estado": "atendida", "nota": "listo"}, headers=owner_cab,
    )
    assert r_patch.status_code == 403, r_patch.text


def test_patch_supresion_cambia_estado_y_no_borra_nada_de_la_base_del_cliente(client, monkeypatch):
    owner_cab = _fundar(client, "uid-completo", "completo@x.co", "conflujo", "Con Flujo")

    sup = client.post("/api/suppliers/", json={"name": "Testigo"}, headers=owner_cab)
    assert sup.status_code == 201, sup.text

    r = client.post(
        "/api/clientes/solicitar-supresion", json={"motivo": "Cerramos"}, headers=owner_cab,
    )
    solicitud_id = r.json()["id"]

    cab_op = _operador(client, monkeypatch)
    r_patch = client.patch(
        f"/api/plataforma/supresiones/{solicitud_id}",
        json={"estado": "atendida", "nota": "Ejecutada a mano el 4/9"}, headers=cab_op,
    )
    assert r_patch.status_code == 200, r_patch.text
    body = r_patch.json()
    assert body["estado"] == "atendida"
    assert body["nota"] == "Ejecutada a mano el 4/9"
    assert body["atendido_en"] is not None
    assert body["atendido_por"] == "op@recabra.co"

    # Nada se borró: el proveedor sigue ahí y el cliente sigue operando.
    r_sup = client.get("/api/suppliers/", headers=owner_cab)
    assert r_sup.status_code == 200
    assert any(s["name"] == "Testigo" for s in r_sup.json())

    from app.clientes import buscar
    assert buscar("conflujo") is not None, "la supresión borró el cliente del registro -- no debería"


# ─── m-3: el habeas data no se corta por estado de cuenta ───────────────────


def test_owner_de_cliente_suspendido_puede_exportar_y_pedir_supresion(client, monkeypatch):
    """Hallazgo m-3 de la verificación: con el cliente suspendido, el owner
    entraba (a propósito) pero el 402 del interruptor le cortaba el export y
    la solicitud de supresión — y hasta aceptar-politica. Los derechos del
    titular (Ley 1581) no pueden depender del estado comercial."""
    owner_cab = _fundar(client, "uid-titular", "titular@x.co", "titularmarket", "Titular Market")

    cab_op = _operador(client, monkeypatch)
    r = client.patch(
        "/api/plataforma/clientes/titularmarket",
        json={"estado": "suspendido", "motivo": "Mora"},
        headers=cab_op,
    )
    assert r.status_code == 200, r.text

    r = client.get("/api/clientes/mi-export", headers=owner_cab)
    assert r.status_code == 200, r.text

    r = client.post("/api/clientes/solicitar-supresion", json={}, headers=owner_cab)
    assert r.status_code in (201, 409), r.text

    # Y el resto del negocio sigue cortado — la exención es quirúrgica.
    assert client.get("/api/spaces/", headers=owner_cab).status_code == 402
