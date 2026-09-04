"""La bitácora: quién hizo qué.

El hallazgo decía que si mañana falta un contrato o cambia un valor no hay
forma de saber quién ni cuándo. Estas pruebas fijan las tres cosas que la
hacen útil de verdad:

* que registre lo que mueve plata y lo que abre puertas, y **nada más**;
* que la línea y el cambio caigan juntos o no caiga ninguno;
* que no la pueda leer cualquiera, y que nunca guarde un secreto.
"""
from datetime import date, datetime, timedelta, timezone

from conftest import CLAVE_ADMIN

HOY = date.today()


def _lineas(client, admin, **params):
    r = client.get("/api/bitacora/", headers=admin, params=params)
    assert r.status_code == 200, r.text
    return r.json()


def _acciones(client, admin):
    return [l["accion"] for l in _lineas(client, admin, limite=500)]


def _espacio(client, admin, code="NAVE-PUN-01"):
    r = client.post(
        "/api/spaces/find-or-create",
        json={"code": code, "name": "Punta", "zone": "punta", "sede": "NAVE", "area_m2": 1.0},
        headers=admin,
    )
    assert r.status_code == 200, r.text
    return r.json()["id"]


def _proveedor(client, admin, name="Alpina"):
    r = client.post("/api/suppliers/find-or-create", json={"name": name}, headers=admin)
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


def _contrato(client, admin, space_id, supplier_id):
    r = client.post(
        f"/api/spaces/{space_id}/leases",
        json={
            "supplier_id": supplier_id,
            "marca": "Yogurt",
            "start_date": (HOY - timedelta(days=1)).isoformat(),
            "end_date": (HOY + timedelta(days=20)).isoformat(),
            "monthly_rent": 1_800_000,
        },
        headers=admin,
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


# ─── Lo que queda anotado ─────────────────────────────────────────────────────

def test_el_ingreso_queda_anotado(client, admin):
    lineas = _lineas(client, admin, accion="login.ok")
    assert lineas, "el login del admin no dejó rastro"
    assert lineas[0]["rol"] == "admin"
    assert lineas[0]["titulo"] == "Ingreso"


def test_el_intento_fallido_queda_anotado_sin_la_contrasena(client, admin):
    """Lo que se intentó NO se guarda: media bitácora serían contraseñas casi
    correctas de gente que se equivocó una letra."""
    client.post("/api/auth/login", json={"password": "casi-la-clave-secreta"})

    lineas = _lineas(client, admin, accion="login.fallo")
    assert len(lineas) == 1
    assert lineas[0]["rol"] == "anónimo"
    entero = str(lineas[0])
    assert "casi-la-clave-secreta" not in entero


def test_el_contrato_queda_anotado_con_el_espacio_y_el_proveedor(client, admin):
    space_id = _espacio(client, admin)
    _contrato(client, admin, space_id, _proveedor(client, admin))

    lineas = _lineas(client, admin, accion="contrato.alta")
    assert len(lineas) == 1
    assert lineas[0]["titulo"] == "Contrato creado"
    assert "NAVE-PUN-01" in lineas[0]["detalle"]
    assert "Alpina" in lineas[0]["detalle"]
    # El valor mensual NO: la bitácora la lee más gente que la base.
    assert "1800000" not in str(lineas[0])


def test_cancelar_un_contrato_queda_anotado(client, admin):
    space_id = _espacio(client, admin)
    lease_id = _contrato(client, admin, space_id, _proveedor(client, admin))

    r = client.delete(f"/api/spaces/{space_id}/leases/{lease_id}", headers=admin)
    assert r.status_code == 204, r.text

    lineas = _lineas(client, admin, accion="contrato.baja")
    assert len(lineas) == 1
    assert lineas[0]["entidad_id"] == str(lease_id)


def test_el_documento_deja_rastro_al_subir_al_bajar_y_al_borrar(client, admin):
    """Es la pregunta que un supermercado va a hacer: quién se llevó el contrato."""
    space_id = _espacio(client, admin)
    r = client.post(
        f"/api/spaces/{space_id}/files",
        files={"file": ("contrato.pdf", b"%PDF-1.4 lo que sea", "application/pdf")},
        headers=admin,
    )
    assert r.status_code == 201, r.text
    file_id = r.json()["id"]

    assert client.get(f"/api/files/{file_id}", headers=admin).status_code == 200
    assert client.delete(f"/api/files/{file_id}", headers=admin).status_code == 204

    acciones = _acciones(client, admin)
    for esperada in ("archivo.alta", "archivo.descarga", "archivo.baja"):
        assert esperada in acciones, f"falta {esperada}"


def test_la_imagen_no_ensucia_la_bitacora(client, admin):
    """La cara del mueble se abre decenas de veces por día; anotarla ahogaría
    lo que sí hay que poder encontrar.

    Fase 3 (fix H8-B2): la exención ya NO es "cualquier imagen" — es la cara
    DESIGNADA (``uso=cara``) del espacio, ver
    ``features/compliance/outputs/hardening.md``. Una imagen sin designar SÍ
    deja rastro al bajarse: es exactamente el caso de un contrato escaneado
    en JPG que nadie marcó como cara."""
    space_id = _espacio(client, admin)
    r = client.post(
        f"/api/spaces/{space_id}/files",
        files={"file": ("foto.jpg", b"\xff\xd8\xff no importa", "image/jpeg")},
        data={"uso": "cara"},
        headers=admin,
    )
    assert r.status_code == 201, r.text
    file_id = r.json()["id"]

    assert client.get(f"/api/files/{file_id}", headers=admin).status_code == 200
    assert "archivo.descarga" not in _acciones(client, admin)


def test_el_cambio_de_clave_queda_anotado(client, admin):
    r = client.put("/api/auth/passwords", json={"worker_password": "otra-clave-larga"}, headers=admin)
    assert r.status_code == 200, r.text

    lineas = _lineas(client, admin, accion="clave.cambio")
    assert len(lineas) == 1
    assert lineas[0]["entidad_id"] == "worker"
    assert "otra-clave-larga" not in str(lineas[0])


def test_borrar_una_sede_queda_anotado_con_el_estropicio(client, admin):
    _espacio(client, admin)
    r = client.put(
        "/api/layout/NAVE",
        json={"fixtures": [], "base_updated_at": None},
        headers=admin,
    )
    assert r.status_code == 200, r.text

    r = client.delete("/api/layout/NAVE", headers=admin)
    assert r.status_code == 204, r.text

    lineas = _lineas(client, admin, accion="sede.baja")
    assert len(lineas) == 1
    assert lineas[0]["entidad_id"] == "NAVE"
    assert "espacios archivados" in lineas[0]["detalle"]


def test_mirar_no_deja_rastro(client, admin):
    """Sólo se anota lo que cambia algo o abre una puerta. Si cada listado
    dejara línea, lo que importa se pierde entre el ruido."""
    for ruta in ("/api/spaces/", "/api/suppliers/", "/api/dashboard/kpis", "/api/spaces/map"):
        client.get(ruta, headers=admin)

    acciones = set(_acciones(client, admin))
    assert acciones <= {"login.ok"}, f"algo de sólo lectura quedó anotado: {acciones}"


# ─── Quién la puede leer ──────────────────────────────────────────────────────

def test_el_trabajador_no_puede_leer_la_bitacora(client, worker):
    assert client.get("/api/bitacora/", headers=worker).status_code == 403


def test_sin_sesion_no_se_lee_la_bitacora(client):
    assert client.get("/api/bitacora/").status_code == 401


# ─── Cómo se lee ──────────────────────────────────────────────────────────────

def test_lo_mas_nuevo_primero(client, admin):
    space_id = _espacio(client, admin)
    _contrato(client, admin, space_id, _proveedor(client, admin))

    lineas = _lineas(client, admin, limite=10)
    fechas = [l["at"] for l in lineas]
    assert fechas == sorted(fechas, reverse=True)
    assert lineas[0]["accion"] == "contrato.alta"


def test_el_limite_tiene_techo(client, admin):
    assert client.get("/api/bitacora/", headers=admin, params={"limite": 5000}).status_code == 422
    assert client.get("/api/bitacora/", headers=admin, params={"limite": 0}).status_code == 422


def test_el_diccionario_de_acciones_cubre_lo_que_se_anota(client, admin):
    """Si alguien agrega un código y no lo pone en la lista, la pantalla lo
    muestra crudo. Esto lo hace notar acá y no en producción."""
    r = client.get("/api/bitacora/acciones", headers=admin)
    assert r.status_code == 200
    catalogo = r.json()

    space_id = _espacio(client, admin)
    lease_id = _contrato(client, admin, space_id, _proveedor(client, admin))
    client.delete(f"/api/spaces/{space_id}/leases/{lease_id}", headers=admin)
    client.patch(f"/api/spaces/{space_id}/status", json={"status": "maintenance"}, headers=admin)
    client.post("/api/auth/login", json={"password": "no-es"})

    for accion in set(_acciones(client, admin)):
        assert accion in catalogo, f"`{accion}` no está en el diccionario"


# ─── Que no crezca para siempre ───────────────────────────────────────────────

def test_lo_viejo_se_purga(client, admin):
    from app.database import SessionLocal
    from app.models.models import AuditEntry
    from app.services.bitacora import purgar

    db = SessionLocal()
    try:
        db.add(AuditEntry(
            at=datetime.now(timezone.utc) - timedelta(days=400),
            rol="admin", ip="1.2.3.4", accion="login.ok",
        ))
        db.commit()
        assert purgar(db) == 1
        # Y lo de hoy sigue ahí.
        assert db.query(AuditEntry).count() >= 1
    finally:
        db.close()


def test_si_la_operacion_falla_no_queda_la_linea(client, admin):
    """La línea viaja con la transacción del cambio. Una bitácora que dice que
    se canceló un contrato que sigue vivo manda a buscar donde no hay nada."""
    space_id = _espacio(client, admin)
    r = client.delete(f"/api/spaces/{space_id}/leases/999999", headers=admin)
    assert r.status_code == 404
    assert "contrato.baja" not in _acciones(client, admin)


def test_la_hora_sale_con_huso(client, admin):
    """SQLite guarda la fecha sin huso, y el navegador lee eso como hora LOCAL.

    En Colombia son cinco horas de diferencia: sin marcarla, la bitácora decía
    "recién" para algo de la madrugada y la fecha exacta quedaba corrida.
    """
    from datetime import datetime as dt

    lineas = _lineas(client, admin, limite=1)
    assert lineas, "hace falta al menos el login del admin"
    crudo = lineas[0]["at"]
    assert dt.fromisoformat(crudo).tzinfo is not None, f"sin huso: {crudo}"
