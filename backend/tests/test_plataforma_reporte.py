"""Fase 7, Parte B: el reporte de transparencia por cliente.

Dos endpoints, un solo cuerpo (``app.plataforma_reporte.armar_reporte``):

* ``GET /api/clientes/mi-reporte-plataforma`` — para el DUEÑO (``require_owner``,
  igual que ``/mi-export``): el slug sale del token, nunca de un parámetro.
* ``GET /api/plataforma/clientes/{slug}/reporte`` — para el OPERADOR
  (``require_operador``): anota ``accion="reporte"`` en la bitácora.

Mismo patrón de andamiaje que ``test_plataforma_metricas.py`` /
``test_derechos.py`` (verificador falso vía ``dependency_overrides``,
``OPERADOR_EMAILS`` por ``monkeypatch``, todo ``import app.*`` ADENTRO de las
funciones) — cada archivo de pruebas se sostiene solo.
"""
import json
import re
from datetime import date, datetime, timezone
from types import SimpleNamespace

MENSAJE_NO_OWNER = "Solo el owner del cliente puede hacer esto."

CLAVES_NIVEL1 = {
    "cliente", "generado_en", "ventana", "politica", "catalogo", "valores",
    "spread_actual", "accesos", "derechos",
}
CLAVES_POLITICA = {
    "version_vigente", "version_aceptada", "aceptada_en", "base_legal", "url",
}
CLAVES_VENTANA = {"desde", "hasta", "meses"}
CLAVES_ACCESOS = {"total", "lineas"}
CLAVES_LINEA_ACCESO = {"fecha", "operador", "accion", "periodo"}
CLAVES_DERECHOS = {"export", "supresion", "reporte", "contacto"}
CLAVES_CATALOGO_ITEM = {
    "clave", "nombre", "definicion", "fuente", "finalidad", "endpoints", "tratamiento",
}
CLAVES_VALOR = {
    "periodo", "sin_dato", "origen", "capturado_en", "sedes_con_plano",
    "espacios_comercializables", "ocupadas", "ocupacion_pct", "contratos_activos",
    "canon_total", "canon_promedio_mensual", "usuarios_con_cuenta", "top_proveedores",
}
CLAVES_TOP_PROVEEDOR = {"nombre", "contratos"}

_FECHA_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

# Claves que jamás pueden aparecer, en ningún nivel del JSON: filas de negocio,
# PII de usuario final o la tarifa cruda.
CLAVES_PROHIBIDAS = {
    "monthly_rent", "tarifa", "rates", "by_sede", "default", "email",
    "usuario_id", "space_id", "notes", "notas", "foto",
}


# ─── Andamiaje ────────────────────────────────────────────────────────────────

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
    """Acumula las cuentas falsas: un solo override para todas las del test."""

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
    """Funda un cliente por el alta self-service. Devuelve la cabecera del owner."""
    ids.registrar(uid, email)
    r = ids.client.post(
        "/api/clientes/alta",
        json={"id_token": uid, "slug": slug, "nombre": nombre, "acepta_politica": True},
    )
    assert r.status_code == 200, r.text
    return _cab(r.json()["token"])


def _invitar_y_entrar(ids: Identidades, owner_cab, *, uid, email, rol):
    """Invita a ``email`` con ``rol`` sobre el cliente de ``owner_cab`` y hace
    su primer oauth -- devuelve la cabecera de esa cuenta (rol de MEMBRESÍA)."""
    r = ids.client.post("/api/usuarios/invitar", json={"email": email, "rol": rol}, headers=owner_cab)
    assert r.status_code == 200, r.text
    ids.registrar(uid, email)
    r = ids.client.post("/api/auth/oauth", json={"id_token": uid, "acepta_politica": True})
    assert r.status_code == 200, r.text
    return _cab(r.json()["token"])


def _operador_sin_membresias(ids: Identidades, monkeypatch, uid="uid-op", email="op@recabra.co"):
    """El dueño del SaaS: correo en ``OPERADOR_EMAILS`` y CERO membresías."""
    monkeypatch.setenv("OPERADOR_EMAILS", email)
    ids.registrar(uid, email)
    r = ids.client.post("/api/auth/oauth", json={"id_token": uid})
    assert r.status_code == 200, r.text
    return _cab(r.json()["token"])


def _periodos(n: int, hasta=None):
    from app.plataforma_metricas import periodo_actual
    from app.plataforma_tendencia import ultimos_periodos

    return ultimos_periodos(n, hasta or periodo_actual())


def _sembrar_snapshot(slug, periodo, *, sedes=1, caras=10, ocupadas=4, contratos=4,
                       canon_total=1_000_000.0, usuarios=2, proveedores=None,
                       origen="vista", capturado_en=None):
    """Escribe DIRECTO una fila de ``snapshot_metricas`` -- el registro, nunca
    la base de un cliente. Es lo único de este archivo con permiso para
    escribir: el reporte que se prueba es de sólo lectura."""
    from app.clientes import sesion_registro
    from app.models.plataforma import SnapshotMetricas

    reg = sesion_registro()
    try:
        reg.add(SnapshotMetricas(
            cliente_slug=slug,
            periodo=periodo,
            sedes_con_plano=sedes,
            espacios_comercializables=caras,
            ocupadas=ocupadas,
            contratos_activos=contratos,
            canon_total=canon_total,
            usuarios=usuarios,
            proveedores_json=json.dumps(proveedores or {}, ensure_ascii=False),
            clientes_incluidos=None,
            clientes_con_error=None,
            origen=origen,
            capturado_en=capturado_en or datetime.now(timezone.utc),
        ))
        reg.commit()
    finally:
        reg.close()


def _pedir_dueno(client, owner_cab, meses=None):
    params = {} if meses is None else {"meses": meses}
    return client.get("/api/clientes/mi-reporte-plataforma", headers=owner_cab, params=params)


def _pedir_operador(client, cab_op, slug, meses=None):
    params = {} if meses is None else {"meses": meses}
    return client.get(f"/api/plataforma/clientes/{slug}/reporte", headers=cab_op, params=params)


def _claves_recursivas(obj) -> set:
    """Todas las claves de dict que aparecen en cualquier nivel del JSON."""
    encontradas: set = set()
    if isinstance(obj, dict):
        for k, v in obj.items():
            encontradas.add(k)
            encontradas |= _claves_recursivas(v)
    elif isinstance(obj, list):
        for item in obj:
            encontradas |= _claves_recursivas(item)
    return encontradas


# ════════════════════════════════════════════════════════════════════════════
# El shape, con las claves EXACTAS
# ════════════════════════════════════════════════════════════════════════════

def test_owner_200_con_las_claves_exactas_del_shape(client):
    owner_cab = _fundar(Identidades(client), "uid-shape", "shape@x.co", "repshape", "Rep Shape")

    r = _pedir_dueno(client, owner_cab)
    assert r.status_code == 200, r.text
    body = r.json()

    assert set(body.keys()) == CLAVES_NIVEL1
    assert set(body["politica"].keys()) == CLAVES_POLITICA
    assert set(body["ventana"].keys()) == CLAVES_VENTANA
    assert set(body["accesos"].keys()) == CLAVES_ACCESOS
    assert set(body["derechos"].keys()) == CLAVES_DERECHOS
    assert body["cliente"] == {"slug": "repshape", "nombre": "Rep Shape"}
    assert body["ventana"]["meses"] == 12
    assert len(body["valores"]) == 12

    for item in body["catalogo"]:
        assert set(item.keys()) == CLAVES_CATALOGO_ITEM
    for valor in body["valores"]:
        assert set(valor.keys()) == CLAVES_VALOR
        for prov in valor["top_proveedores"]:
            assert set(prov.keys()) == CLAVES_TOP_PROVEEDOR

    # El fundador aceptó la política de entrada (`acepta_politica: True`) --
    # la aceptación tiene que aparecer.
    from app.models.consentimiento import VERSION_POLITICA
    assert body["politica"]["version_vigente"] == VERSION_POLITICA
    assert body["politica"]["version_aceptada"] == VERSION_POLITICA
    assert _FECHA_RE.match(body["politica"]["aceptada_en"])


def test_401_sin_token(client):
    assert client.get("/api/clientes/mi-reporte-plataforma").status_code == 401


def test_403_worker_admin_legado_y_membresia_no_owner(client, admin, worker):
    assert _pedir_dueno(client, admin).status_code == 403
    assert _pedir_dueno(client, worker).status_code == 403

    ids = Identidades(client)
    owner_cab = _fundar(ids, "uid-jefe", "jefe@x.co", "repnoowner", "Rep No Owner")
    gerente_cab = _invitar_y_entrar(ids, owner_cab, uid="uid-gerente", email="gerente@x.co", rol="admin")
    peon_cab = _invitar_y_entrar(ids, owner_cab, uid="uid-peon", email="peon@x.co", rol="worker")

    r1 = _pedir_dueno(client, gerente_cab)
    assert r1.status_code == 403
    assert r1.json()["detail"] == MENSAJE_NO_OWNER

    r2 = _pedir_dueno(client, peon_cab)
    assert r2.status_code == 403


def test_operador_sin_membresias_no_ve_el_endpoint_del_dueno(client, monkeypatch):
    """El token de la consola (``cliente == "plataforma"``) sólo resuelve bajo
    ``/api/plataforma``: fuera de ahí, ``cliente_del_pedido`` ni siquiera le
    da una sesión de base -- 401 por construcción (mismo patrón que M-9 en
    ``test_metricas_ataques.py``: 401 o 403, nunca 200)."""
    ids = Identidades(client)
    cab_op = _operador_sin_membresias(ids, monkeypatch)
    assert _pedir_dueno(client, cab_op).status_code in (401, 403)


def test_owner_de_un_cliente_no_ve_nada_del_otro(client):
    ids = Identidades(client)
    a_cab = _fundar(ids, "uid-a", "a@x.co", "repcrucea", "Rep Cruce A")
    b_cab = _fundar(ids, "uid-b", "b@x.co", "repcruceb", "Rep Cruce B")

    periodos = _periodos(1)
    _sembrar_snapshot(
        "repcrucea", periodos[0], canon_total=1_234_567.0,
        proveedores={"Proveedor Secreto De A": 3},
    )
    _sembrar_snapshot(
        "repcruceb", periodos[0], canon_total=9_999.0,
        proveedores={"Proveedor De B": 1},
    )

    r = _pedir_dueno(client, b_cab, meses=1)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["cliente"] == {"slug": "repcruceb", "nombre": "Rep Cruce B"}

    crudo = r.text
    assert "repcrucea" not in crudo
    assert "Rep Cruce A" not in crudo
    assert "Proveedor Secreto De A" not in crudo


# ════════════════════════════════════════════════════════════════════════════
# 422: meses fuera de rango
# ════════════════════════════════════════════════════════════════════════════

def test_meses_invalidos_da_422_en_los_dos_endpoints(client, monkeypatch):
    ids = Identidades(client)
    owner_cab = _fundar(ids, "uid-meses", "meses@x.co", "repmeses", "Rep Meses")
    cab_op = _operador_sin_membresias(ids, monkeypatch)

    for meses in (0, 25, "abc"):
        r1 = _pedir_dueno(client, owner_cab, meses=meses)
        assert r1.status_code == 422, (meses, r1.text)
        r2 = _pedir_operador(client, cab_op, "repmeses", meses=meses)
        assert r2.status_code == 422, (meses, r2.text)


# ════════════════════════════════════════════════════════════════════════════
# El operador: mismo JSON, bitácora y 404
# ════════════════════════════════════════════════════════════════════════════

def test_operador_200_mismo_json_y_el_dueno_ve_el_acceso_despues(client, monkeypatch):
    ids = Identidades(client)
    owner_cab = _fundar(ids, "uid-op1", "op1@x.co", "repoperador", "Rep Operador")
    cab_op = _operador_sin_membresias(ids, monkeypatch, uid="uid-consola", email="consola@recabra.co")

    r_dueno_antes = _pedir_dueno(client, owner_cab)
    assert r_dueno_antes.status_code == 200, r_dueno_antes.text
    total_antes = r_dueno_antes.json()["accesos"]["total"]

    r_op = _pedir_operador(client, cab_op, "repoperador")
    assert r_op.status_code == 200, r_op.text
    cuerpo_op = r_op.json()
    assert set(cuerpo_op.keys()) == CLAVES_NIVEL1
    assert cuerpo_op["cliente"] == {"slug": "repoperador", "nombre": "Rep Operador"}

    desde, hasta = cuerpo_op["ventana"]["desde"], cuerpo_op["ventana"]["hasta"]

    r_dueno_despues = _pedir_dueno(client, owner_cab)
    assert r_dueno_despues.status_code == 200, r_dueno_despues.text
    cuerpo_dueno = r_dueno_despues.json()
    assert cuerpo_dueno["accesos"]["total"] == total_antes + 1

    lineas_reporte = [l for l in cuerpo_dueno["accesos"]["lineas"] if l["accion"] == "reporte"]
    assert len(lineas_reporte) == 1, cuerpo_dueno["accesos"]["lineas"]
    linea = lineas_reporte[0]
    assert linea["operador"] == "consola@recabra.co"
    assert linea["periodo"] == f"repoperador:{desde}..{hasta}"
    assert _FECHA_RE.match(linea["fecha"])

    # El GET del dueño que acabamos de hacer NO se anotó a sí mismo -- no es
    # un acceso del operador.
    total_tras_leer_de_nuevo = client.get(
        "/api/clientes/mi-reporte-plataforma", headers=owner_cab,
    ).json()["accesos"]["total"]
    assert total_tras_leer_de_nuevo == total_antes + 1


def test_operador_404_con_slug_inexistente(client, monkeypatch):
    ids = Identidades(client)
    cab_op = _operador_sin_membresias(ids, monkeypatch)
    r = _pedir_operador(client, cab_op, "no-existe-este-cliente")
    assert r.status_code == 404, r.text
    assert r.json()["detail"] == "No hay un cliente con ese código."


def test_operador_requiere_ser_operador(client):
    ids = Identidades(client)
    owner_cab = _fundar(ids, "uid-noop", "noop@x.co", "repnoop", "Rep No Op")
    r = _pedir_operador(client, owner_cab, "repnoop")
    assert r.status_code == 403, r.text


# ════════════════════════════════════════════════════════════════════════════
# Valores mes a mes contra el snapshot sembrado
# ════════════════════════════════════════════════════════════════════════════

def test_valores_mes_a_mes_contra_snapshot_incluido_sin_dato(client):
    from app.plataforma_metricas import _pct, _plata

    ids = Identidades(client)
    owner_cab = _fundar(ids, "uid-valores", "valores@x.co", "repvalores", "Rep Valores")

    periodos = _periodos(3)  # [viejo, medio, actual]
    viejo, medio, actual = periodos

    _sembrar_snapshot(
        "repvalores", viejo, sedes=2, caras=10, ocupadas=4, contratos=4,
        canon_total=4_000_000.0, usuarios=3,
        proveedores={"Distribuciones López (lopez@correo.com)": 2, "Nutresa": 1},
        origen="cierre",
        capturado_en=datetime(2020, 1, 15, 10, 30, tzinfo=timezone.utc),
    )
    # El mes MEDIO no tiene fila -- tiene que salir `sin_dato`.
    _sembrar_snapshot("repvalores", actual, sedes=2, caras=10, ocupadas=5, contratos=1,
                      canon_total=500_000.0, usuarios=3, proveedores={"Alpina": 1},
                      origen="vista")

    # Contaminación deliberada: el consolidado y OTRO cliente, mismo período.
    _sembrar_snapshot("__consolidado__", viejo, canon_total=999_999_999.0)
    _fundar(ids, "uid-otro", "otro@x.co", "repvaloresotro", "Rep Valores Otro")
    _sembrar_snapshot("repvaloresotro", viejo, canon_total=777_777.0)

    r = _pedir_dueno(client, owner_cab, meses=3)
    assert r.status_code == 200, r.text
    valores = r.json()["valores"]
    assert [v["periodo"] for v in valores] == [viejo, medio, actual]

    v_viejo = valores[0]
    assert v_viejo["sin_dato"] is False
    assert v_viejo["origen"] == "cierre"
    assert v_viejo["capturado_en"] == "2020-01-15"
    assert v_viejo["sedes_con_plano"] == 2
    assert v_viejo["espacios_comercializables"] == 10
    assert v_viejo["ocupadas"] == 4
    assert v_viejo["contratos_activos"] == 4
    assert v_viejo["canon_total"] == _plata(4_000_000.0)
    assert v_viejo["ocupacion_pct"] == _pct(4, 10)
    assert v_viejo["canon_promedio_mensual"] == _plata(4_000_000.0 / 4)
    nombres = {p["nombre"] for p in v_viejo["top_proveedores"]}
    assert "Distribuciones López ([correo oculto])" in nombres
    assert not any("lopez@correo.com" in n for n in nombres)
    for p in v_viejo["top_proveedores"]:
        assert set(p.keys()) == CLAVES_TOP_PROVEEDOR

    v_medio = valores[1]
    assert v_medio["sin_dato"] is True
    assert v_medio["origen"] is None
    assert v_medio["capturado_en"] is None
    for clave in ("sedes_con_plano", "espacios_comercializables", "ocupadas",
                  "ocupacion_pct", "contratos_activos", "canon_total",
                  "canon_promedio_mensual", "usuarios_con_cuenta"):
        assert v_medio[clave] is None, clave
    assert v_medio["top_proveedores"] == []

    v_actual = valores[2]
    assert v_actual["sin_dato"] is False
    assert v_actual["contratos_activos"] == 1
    assert v_actual["canon_promedio_mensual"] == _plata(500_000.0)

    # Nada de lo sembrado en el consolidado ni en el otro cliente se filtró:
    # los canones de las dos filas contaminantes no aparecen en ningún valor.
    canones = {v["canon_total"] for v in valores}
    assert 999_999_999.0 not in canones
    assert 777_777.0 not in canones
    assert "repvaloresotro" not in r.text


# ════════════════════════════════════════════════════════════════════════════
# Formatos de fecha y frontera del contenido
# ════════════════════════════════════════════════════════════════════════════

def test_fechas_sin_hora_en_todo_el_reporte(client, monkeypatch):
    ids = Identidades(client)
    owner_cab = _fundar(ids, "uid-fechas", "fechas@x.co", "repfechas", "Rep Fechas")
    cab_op = _operador_sin_membresias(ids, monkeypatch)
    assert _pedir_operador(client, cab_op, "repfechas").status_code == 200

    r = _pedir_dueno(client, owner_cab)
    body = r.json()
    assert _FECHA_RE.match(body["politica"]["aceptada_en"])
    for linea in body["accesos"]["lineas"]:
        assert _FECHA_RE.match(linea["fecha"]), linea


def test_ninguna_clave_prohibida_en_ningun_nivel(client, monkeypatch):
    ids = Identidades(client)
    owner_cab = _fundar(ids, "uid-frontera", "frontera@x.co", "repfrontera", "Rep Frontera")
    cab_op = _operador_sin_membresias(ids, monkeypatch)
    assert _pedir_operador(client, cab_op, "repfrontera").status_code == 200

    r = _pedir_dueno(client, owner_cab)
    body = r.json()

    claves = _claves_recursivas(body)
    prohibidas_presentes = claves & CLAVES_PROHIBIDAS
    assert not prohibidas_presentes, prohibidas_presentes

    # `email` no aparece como CLAVE en ningún nivel -- el correo del operador
    # viaja bajo la clave `operador`.
    assert "email" not in claves


# ════════════════════════════════════════════════════════════════════════════
# El freno compartido con /mi-export
# ════════════════════════════════════════════════════════════════════════════

def test_freno_compartido_con_mi_export_429_en_el_cuarto(client):
    ids = Identidades(client)
    owner_cab = _fundar(ids, "uid-freno", "freno@x.co", "repfreno", "Rep Freno")

    r1 = client.get("/api/clientes/mi-export", headers=owner_cab)
    r2 = client.get("/api/clientes/mi-export", headers=owner_cab)
    r3 = _pedir_dueno(client, owner_cab)
    assert [r1.status_code, r2.status_code, r3.status_code] == [200, 200, 200]

    r4 = _pedir_dueno(client, owner_cab)
    assert r4.status_code == 429, r4.text

    # Por usuario -- otro owner no lo hereda.
    otro_cab = _fundar(ids, "uid-libre", "libre@x.co", "repfrenolibre", "Rep Freno Libre")
    assert _pedir_dueno(client, otro_cab).status_code == 200


def test_meses_invalido_no_consume_el_freno_del_dueno(client):
    """Un `meses` inválido tiene que dar 422 sin gastar cupo del freno
    compartido con `/mi-export`: la validación de `meses` va ANTES de
    `_chequear_y_anotar_freno_export` (routers/derechos.py). Tres pedidos con
    `meses=0` (que igual iban a fallar) no pueden dejar al dueño sin poder
    pedir su reporte válido en la misma hora."""
    ids = Identidades(client)
    owner_cab = _fundar(ids, "uid-freno422", "freno422@x.co", "repfreno422", "Rep Freno 422")

    for _ in range(3):
        r = _pedir_dueno(client, owner_cab, meses=0)
        assert r.status_code == 422, r.text

    r4 = _pedir_dueno(client, owner_cab)
    assert r4.status_code == 200, r4.text


# ════════════════════════════════════════════════════════════════════════════
# Habeas data: exención del interruptor de cobranza
# ════════════════════════════════════════════════════════════════════════════

def test_owner_de_cliente_suspendido_obtiene_200(client, monkeypatch):
    ids = Identidades(client)
    owner_cab = _fundar(ids, "uid-susp", "susp@x.co", "repsuspendido", "Rep Suspendido")
    cab_op = _operador_sin_membresias(ids, monkeypatch)

    r = client.patch(
        "/api/plataforma/clientes/repsuspendido",
        json={"estado": "suspendido", "motivo": "Mora"},
        headers=cab_op,
    )
    assert r.status_code == 200, r.text

    assert _pedir_dueno(client, owner_cab).status_code == 200
    # Y el resto del negocio sigue cortado -- la exención es quirúrgica.
    assert client.get("/api/spaces/", headers=owner_cab).status_code == 402


def test_ruta_del_dueno_esta_exenta_de_habeas_data(client):
    from app.clientes import _EXENTOS_POR_HABEAS_DATA

    assert "/api/clientes/mi-reporte-plataforma" in _EXENTOS_POR_HABEAS_DATA


# ════════════════════════════════════════════════════════════════════════════
# Orden de rutas y catálogo taxativo
# ════════════════════════════════════════════════════════════════════════════

def test_ruta_del_operador_declarada_despues_de_las_literales(client):
    from conftest import rutas_planas

    rutas = rutas_planas(client.app)
    orden = [r.path for r in rutas]

    objetivo = "/api/plataforma/clientes/{slug}/reporte"
    assert objetivo in orden

    literales_antes = [
        "/api/plataforma/metricas",
        "/api/plataforma/tendencia",
        "/api/plataforma/adopcion",
        "/api/plataforma/supresiones",
        "/api/plataforma/soy",
        "/api/plataforma/clientes",
    ]
    idx_objetivo = orden.index(objetivo)
    for literal in literales_antes:
        assert literal in orden, literal
        assert orden.index(literal) < idx_objetivo, (literal, objetivo)


def test_catalogo_cubre_cada_clave_publicada_por_metricas_y_adopcion(client, monkeypatch):
    from app.plataforma_reporte import CATALOGO

    ids = Identidades(client)
    _fundar(ids, "uid-cat", "cat@x.co", "repcatalogo", "Rep Catálogo")
    cab_op = _operador_sin_membresias(ids, monkeypatch)

    claves_catalogo = {c["clave"] for c in CATALOGO}

    r_met = client.get("/api/plataforma/metricas", headers=cab_op)
    assert r_met.status_code == 200, r_met.text
    cuerpo_met = r_met.json()
    claves_metricas: set = set()
    for fila in cuerpo_met["clientes"]:
        claves_metricas.add("estado_cuenta")
        if fila.get("metricas"):
            claves_metricas |= set(fila["metricas"].keys())

    r_ado = client.get("/api/plataforma/adopcion", headers=cab_op)
    assert r_ado.status_code == 200, r_ado.text
    cuerpo_ado = r_ado.json()
    claves_adopcion: set = set()
    for fila in cuerpo_ado["clientes"]:
        claves_adopcion |= (set(fila.keys()) - {"slug", "nombre", "error"})

    faltantes = (claves_metricas | claves_adopcion) - claves_catalogo
    assert not faltantes, f"claves publicadas sin entrada en CATALOGO: {faltantes}"


# ════════════════════════════════════════════════════════════════════════════
# Sólo lectura de verdad
# ════════════════════════════════════════════════════════════════════════════

def test_el_reporte_no_escribe_nada_en_la_base_del_cliente(client, monkeypatch):
    from app.clientes import buscar, sesion_de
    from app.models.models import AuditEntry, Space, SpaceLease

    ids = Identidades(client)
    owner_cab = _fundar(ids, "uid-solo", "solo@x.co", "reponlylectura", "Rep Only Lectura")
    cab_op = _operador_sin_membresias(ids, monkeypatch)

    def foto():
        db = sesion_de(buscar("reponlylectura"))
        try:
            return (
                db.query(Space).count(),
                db.query(SpaceLease).count(),
                db.query(AuditEntry).count(),
            )
        finally:
            db.close()

    antes = foto()
    _pedir_dueno(client, owner_cab)
    _pedir_operador(client, cab_op, "reponlylectura")
    assert foto() == antes
