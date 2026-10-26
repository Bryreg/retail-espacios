"""Fase 5 — CONCILIACIÓN NUMÉRICA de la serie de tendencia.

Auditoría independiente (agente Contador), en el mismo espíritu que
``test_metricas_conciliacion.py``: se siembra a mano, se calcula a mano en el
comentario de cada test, y se afirma el número EXACTO que tiene que salir por
``GET /api/plataforma/tendencia``. Nada se lee de la implementación: si el
backend cambia una fórmula, acá se rompe.

Los períodos son RELATIVOS al mes en curso (``M``, ``M-1``, ``M-2``) porque la
serie SIEMPRE termina en el mes en curso (UTC): sembrar meses fijos haría que la
auditoría caducara el 1º del mes que viene.

Los helpers son los de ``test_plataforma_metricas.py`` (``Identidades``,
``_fundar``, ``_operador_sin_membresias``, ``_sembrar``, ``_romper``, ``_cab``),
copiados a propósito: un test de conciliación que importa del test que audita
comparte sus errores.
"""
from tests.sembrado import total_del_plazo
import json
from datetime import date
from types import SimpleNamespace

import pytest


# ════════════════════════════════════════════════════════════════════════════
# Andamiaje (copiado de tests/test_plataforma_metricas.py)
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
    """Layout + espacios + contratos en la base DEL CLIENTE."""
    from app.clientes import buscar, sesion_de
    from app.models.models import LayoutSnapshot, Space, SpaceLease, Supplier

    cliente = buscar(slug)
    assert cliente is not None, slug
    db = sesion_de(cliente)
    try:
        for sede, fixtures in sedes.items():
            db.add(LayoutSnapshot(sede=sede, fixtures_json=json.dumps(fixtures)))
        db.flush()

        for codigo, proveedor, ini, fin, canon, activo in contratos:
            fila = db.query(Supplier).filter(Supplier.name == proveedor).first()
            if fila is None:
                fila = Supplier(name=proveedor)
                db.add(fila)
                db.flush()
            espacio = db.query(Space).filter(Space.code == codigo).first()
            if espacio is None:
                espacio = Space(
                    code=codigo, svg_id=f"svg-{codigo}", name=codigo,
                    zone="Zona", sede=codigo.split("-")[0], area_m2=5.0,
                )
                db.add(espacio)
                db.flush()
            db.add(SpaceLease(
                space_id=espacio.id,
                supplier_id=fila.id,
                start_date=date.fromisoformat(ini),
                end_date=date.fromisoformat(fin),
                monthly_rent=total_del_plazo(canon, ini, fin),  # lo de un mes, guardado como total
                is_active=activo,
            ))
        db.commit()
    finally:
        db.close()


def _romper(slug="roto", nombre="Roto"):
    from app.clientes import sesion_registro, url_para
    from app.models.models import ClienteRow

    db_name = f"recabra_{slug}"
    reg = sesion_registro()
    try:
        reg.add(ClienteRow(slug=slug, nombre=nombre, db_name=db_name, activo=True))
        reg.commit()
    finally:
        reg.close()

    ruta = url_para(db_name).split("sqlite:///", 1)[1]
    with open(ruta, "wb") as f:
        f.write(b"esto no es una base de datos, es un archivo cualquiera\n" * 20)


def _usuario_compartido(slugs, uid="uid-compartida", email="compartida@x.co"):
    """Una persona con membresía activa en VARIOS clientes.

    Es el caso que separa "usuarios distintos" de "suma de usuarios por
    cliente": la misma cuenta ayudando a dos supermercados es UNA persona.
    """
    from app.clientes import sesion_registro
    from app.models.identidad import Membresia, Usuario

    reg = sesion_registro()
    try:
        u = Usuario(firebase_uid=uid, email=email)
        reg.add(u)
        reg.flush()
        for s in slugs:
            reg.add(Membresia(usuario_id=u.id, cliente_slug=s, rol="worker", activo=True))
        reg.commit()
    finally:
        reg.close()


# ─── Períodos relativos ──────────────────────────────────────────────────────

def _tres_meses():
    """``(M-2, M-1, M)`` — el mes en curso y los dos anteriores."""
    from app.plataforma_metricas import periodo_actual
    from app.plataforma_tendencia import periodo_anterior

    m = periodo_actual()
    m1 = periodo_anterior(m)
    m2 = periodo_anterior(m1)
    return m2, m1, m


def _limites(periodo):
    """``(primer_dia, ultimo_dia)`` del período, como ISO."""
    from app.plataforma_metricas import rango_del_periodo

    d, h = rango_del_periodo(periodo)
    return d.isoformat(), h.isoformat()


# ─── Pedidos ─────────────────────────────────────────────────────────────────

def _metricas(client, cab, periodo):
    """Dispara el cálculo REAL (y con él, el write-through del snapshot)."""
    from app.plataforma_metricas import limpiar_cache_metricas

    limpiar_cache_metricas()
    r = client.get(f"/api/plataforma/metricas?periodo={periodo}", headers=cab)
    assert r.status_code == 200, r.text
    assert r.json()["de_cache"] is False, "el caché tapó el cálculo: no hubo write-through"
    return r.json()


def _tendencia(client, cab, cliente="__consolidado__", meses=3):
    r = client.get(
        f"/api/plataforma/tendencia?cliente={cliente}&meses={meses}", headers=cab)
    assert r.status_code == 200, r.text
    return r.json()


def _punto(cuerpo, periodo):
    return next(p for p in cuerpo["serie"] if p["periodo"] == periodo)


def _hojas(nodo):
    if isinstance(nodo, dict):
        for v in nodo.values():
            yield from _hojas(v)
    elif isinstance(nodo, list):
        for v in nodo:
            yield from _hojas(v)
    else:
        yield nodo


def _claves(nodo):
    if isinstance(nodo, dict):
        for k, v in nodo.items():
            yield k
            yield from _claves(v)
    elif isinstance(nodo, list):
        for v in nodo:
            yield from _claves(v)


def _purgar_snapshots():
    """Borra TODAS las filas de ``snapshot_metricas``.

    Hace falta porque el ``lifespan`` de la app arranca el ciclo de
    mantenimiento, y ``_run_lease_maintenance`` llama a ``cerrar_mes_anterior()``
    apenas se abre el ``TestClient`` — o sea, ANTES de que el test funde sus
    clientes y siembre. Ese cierre deja el mes M-1 con filas vacías (sólo
    galerias y el consolidado en cero). Sin purgar, cada test estaría auditando
    una mezcla de su siembra y del cierre de arranque.

    Que ese cierre de arranque exista no es un problema del test: es el
    comportamiento real. Lo que sí es un problema está en
    ``test_BUG_consolidado_congelado_...`` de más abajo.
    """
    from app.clientes import sesion_registro
    from app.models.plataforma import SnapshotMetricas

    reg = sesion_registro()
    try:
        reg.query(SnapshotMetricas).delete()
        reg.commit()
    finally:
        reg.close()


def _filas_snapshot(slug=None, periodo=None):
    from app.clientes import sesion_registro
    from app.models.plataforma import SnapshotMetricas

    reg = sesion_registro()
    try:
        q = reg.query(SnapshotMetricas)
        if slug is not None:
            q = q.filter(SnapshotMetricas.cliente_slug == slug)
        if periodo is not None:
            q = q.filter(SnapshotMetricas.periodo == periodo)
        return [
            {
                "slug": f.cliente_slug, "periodo": f.periodo, "origen": f.origen,
                "contratos": f.contratos_activos, "canon": f.canon_total,
                "caras": f.espacios_comercializables, "ocupadas": f.ocupadas,
                "usuarios": f.usuarios, "sedes": f.sedes_con_plano,
                "incluidos": f.clientes_incluidos, "con_error": f.clientes_con_error,
            }
            for f in q.all()
        ]
    finally:
        reg.close()


# ════════════════════════════════════════════════════════════════════════════
# 1. Serie por cliente: tres meses sembrados a mano
# ════════════════════════════════════════════════════════════════════════════
#
# ACME, sede NAVE, CUATRO muebles → CINCO caras comercializables:
#
#   PUN-01  punta                  -> NAVE-PUN-01
#   GON-01  góndola DOBLE          -> NAVE-GON-01 + NAVE-GON-01-B   (dos caras)
#   GON-02  góndola mural          -> NAVE-GON-02
#   BAT-01  batea (sin bandera)     -> NAVE-BAT-01
#   CAJ-01  checkout               -> (ninguna: el tipo no se vende)
#
#   caras = 5
#
# Contratos (activo en P  ⇔  start <= último día de P  Y  end >= primer día de P
#            Y  is_active):
#
#   C1 Alpina      NAVE-PUN-01     M-2 .. M-2      300.000   (termina en M-2)
#   C2 Bimbo       NAVE-GON-01     M-2 .. M-2      200.000   (termina en M-2)
#   C3 Alpina      NAVE-GON-02     M-2 .. M        100.000   (cruza los TRES)
#   C4 Bimbo       NAVE-GON-01-B   M-1 .. M        400.000   (empieza en M-1)
#   C5 Nutresa     NAVE-BAT-01     M   .. M        600.000   (sólo M)
#   C6 Alpina      NAVE-PUN-01     M   .. M        250.000   (sólo M)
#   C7 Fantasma SA FANTASMA-99     M-1 .. M-1      700.000   (NO está en el plano)
#   C8 Cancelada   NAVE-GON-01     M-2 .. M      9.999.999   is_active=False
#
# A MANO, por mes:
#
#  M-2: activos C1,C2,C3 = 3 contratos
#       ocupadas {NAVE-PUN-01, NAVE-GON-01, NAVE-GON-02} = 3 → 3/5 = 60.0 %
#       canon_total = 300.000+200.000+100.000 = 600.000
#       canon promedio = 600.000/3 = 200.000,00
#       top: Alpina 2 (C1,C3), Bimbo 1 (C2)
#
#  M-1: activos C3,C4,C7 = 3 contratos
#       ocupadas {NAVE-GON-02, NAVE-GON-01-B} = 2  (FANTASMA-99 no está en el
#       plano: suma plata, NO suma cara)              → 2/5 = 40.0 %
#       canon_total = 100.000+400.000+700.000 = 1.200.000
#       canon promedio = 1.200.000/3 = 400.000,00
#       top: Alpina 1, Bimbo 1, Fantasma SA 1 → empate, orden alfabético
#
#  M  : activos C3,C4,C5,C6 = 4 contratos
#       ocupadas {NAVE-GON-02, NAVE-GON-01-B, NAVE-BAT-01, NAVE-PUN-01} = 4
#                                                     → 4/5 = 80.0 %
#       canon_total = 100.000+400.000+600.000+250.000 = 1.350.000
#       canon promedio = 1.350.000/4 = 337.500,00
#       top: Alpina 2 (C3,C6), Bimbo 1, Nutresa 1
#
#  C8 (cancelado) no aparece en NINGÚN mes: si contara, M-2 tendría 4 contratos
#  y 10.599.999 de ingreso.

_PLANO_ACME = [
    {"code": "PUN-01", "type": "punta", "sede": "NAVE"},
    {"code": "GON-01", "type": "gondola", "gondolaType": "double", "sede": "NAVE"},
    {"code": "GON-02", "type": "gondola", "gondolaType": "wall", "sede": "NAVE"},
    {"code": "BAT-01", "type": "batea", "sede": "NAVE"},
    # Y una caja registradora, que NO cuenta: lo decide el TIPO, no la
    # bandera — un plano viejo tampoco la trae.
    {"code": "CAJ-01", "type": "checkout", "sede": "NAVE"},
]

ESC1 = {
    # periodo -> (contratos, ocupacion_pct, ingreso, canon_promedio, top)
    "M2": (3, 60.0, 600_000.0, 200_000.0, [("Alpina", 2), ("Bimbo", 1)]),
    "M1": (3, 40.0, 1_200_000.0, 400_000.0,
           [("Alpina", 1), ("Bimbo", 1), ("Fantasma SA", 1)]),
    "M":  (4, 80.0, 1_350_000.0, 337_500.0,
           [("Alpina", 2), ("Bimbo", 1), ("Nutresa", 1)]),
}


def _escenario_serie(client, monkeypatch):
    ids = Identidades(client)
    _fundar(ids, "uid-acme", "duena@acme.co", "acme", "Acme")
    m2, m1, m = _tres_meses()
    d2, h2 = _limites(m2)
    d1, h1 = _limites(m1)
    d0, h0 = _limites(m)
    _sembrar("acme", {"NAVE": _PLANO_ACME}, [
        ("NAVE-PUN-01",   "Alpina",      d2, h2,   300_000.0, True),
        ("NAVE-GON-01",   "Bimbo",       d2, h2,   200_000.0, True),
        ("NAVE-GON-02",   "Alpina",      d2, h0,   100_000.0, True),
        ("NAVE-GON-01-B", "Bimbo",       d1, h0,   400_000.0, True),
        ("NAVE-BAT-01",   "Nutresa",     d0, h0,   600_000.0, True),
        ("NAVE-PUN-01",   "Alpina",      d0, h0,   250_000.0, True),
        ("FANTASMA-99",   "Fantasma SA", d1, h1,   700_000.0, True),
        ("NAVE-GON-01",   "Cancelada",   d2, h0, 9_999_999.0, False),
    ])
    consola = _operador_sin_membresias(ids, monkeypatch)
    cab = _cab(consola["token"])
    _purgar_snapshots()
    for p in (m2, m1, m):
        _metricas(client, cab, p)
    return cab, (m2, m1, m)


@pytest.mark.parametrize("cual", ["M2", "M1", "M"])
def test_serie_por_cliente_tres_meses(client, monkeypatch, cual):
    cab, (m2, m1, m) = _escenario_serie(client, monkeypatch)
    periodo = {"M2": m2, "M1": m1, "M": m}[cual]
    _contratos, pct, ingreso, canon, top = ESC1[cual]

    cuerpo = _tendencia(client, cab, cliente="acme", meses=3)
    assert [p["periodo"] for p in cuerpo["serie"]] == [m2, m1, m]
    assert cuerpo["nombre"] == "Acme"

    punto = _punto(cuerpo, periodo)
    assert punto["sin_dato"] is False
    assert punto["espacios_comercializables"] == 5, "4 muebles, uno doble = 5 caras"
    assert punto["sedes_con_plano"] == 1
    assert punto["ocupacion_pct"] == pct
    assert punto["ingreso_contratado_mes"] == ingreso
    assert punto["canon_promedio_mensual"] == canon
    assert [(t["nombre"], t["contratos_activos"]) for t in punto["top_proveedores"]] == top


def test_contrato_cancelado_no_cuenta_en_ningun_mes(client, monkeypatch):
    """``is_active=False`` (C8, 9.999.999) no suma en ningún punto de la serie."""
    cab, (m2, m1, m) = _escenario_serie(client, monkeypatch)
    cuerpo = _tendencia(client, cab, cliente="acme", meses=3)
    for punto in cuerpo["serie"]:
        assert 9_999_999.0 not in list(_hojas(punto)), punto["periodo"]
        assert "Cancelada" not in [t["nombre"] for t in punto["top_proveedores"]]
    # Y el crudo guardado tampoco lo tiene: M-2 son 3 contratos, no 4.
    assert [f["contratos"] for f in _filas_snapshot("acme", m2)] == [3]


# ════════════════════════════════════════════════════════════════════════════
# 2. Consolidado PONDERADO (Σ/Σ), nunca promedio de promedios
# ════════════════════════════════════════════════════════════════════════════
#
# Dos clientes de tamaños deliberadamente incomparables, mes en curso (M):
#
#  ACME: 10 góndolas DOBLES = 20 caras.  2 contratos de $100 → 2 caras ocupadas
#        → 2/20 = 10.0 %   ·   canon promedio propio = 100,00
#        (Fase 7, sin umbral: su FILA publica ese número exacto)
#  BETA: 2 puntas = 2 caras.  8 contratos de $1 sobre esos 2 espacios
#        → 2/2 = 100.0 %   ·   canon promedio propio = 1,00
#
#  CONSOLIDADO (Σ/Σ):
#    ocupación = (2+2)/(20+2) = 4/22 = 18,1818… → 18.2 %
#    contratos = 2+8 = 10
#    canon_total = 200 + 8 = 208  → ingreso 208,00
#    canon promedio ponderado = 208/10 = 20,80
#
#  Las cuentas EQUIVOCADAS que este test prohíbe:
#    promedio de porcentajes = (10.0 + 100.0)/2 = 55.0
#    promedio de promedios   = (100,00 + 1,00)/2 = 50,50
#
#  usuarios_con_cuenta consolidado: dueña de acme + dueño de beta + UNA persona
#  con membresía en los dos = 3 DISTINTAS.  (La suma por cliente daría 2+2 = 4.)

CONS_OCUPACION_PONDERADA = 18.2
CONS_OCUPACION_PROMEDIO_DE_PCT = 55.0     # la EQUIVOCADA
CONS_CANON_PONDERADO = 20.80
CONS_CANON_PROMEDIO_DE_PROMEDIOS = 50.50  # la EQUIVOCADA


def _escenario_ponderado(client, monkeypatch):
    ids = Identidades(client)
    _fundar(ids, "uid-acme", "duena@acme.co", "acme", "Acme")
    _fundar(ids, "uid-beta", "dueno@beta.co", "beta", "Beta")
    _usuario_compartido(["acme", "beta"])
    _m2, _m1, m = _tres_meses()
    d0, h0 = _limites(m)

    plano_acme = [
        {"code": f"GD-{i:02d}", "type": "gondola", "gondolaType": "double", "sede": "N"}
        for i in range(1, 11)
    ]  # 10 dobles = 20 caras
    _sembrar("acme", {"N": plano_acme}, [
        ("N-GD-01", "Grande SA", d0, h0, 100.0, True),
        ("N-GD-02", "Grande SA", d0, h0, 100.0, True),
    ])

    plano_beta = [
        {"code": "E-01", "type": "punta", "sede": "B"},
        {"code": "E-02", "type": "punta", "sede": "B"},
    ]
    _sembrar("beta", {"B": plano_beta}, [
        (f"B-E-{(i % 2) + 1:02d}", "Chica SA", d0, h0, 1.0, True) for i in range(8)
    ])

    consola = _operador_sin_membresias(ids, monkeypatch)
    cab = _cab(consola["token"])
    _purgar_snapshots()
    _metricas(client, cab, m)
    return cab, m


def test_consolidado_ocupacion_es_ponderada(client, monkeypatch):
    cab, m = _escenario_ponderado(client, monkeypatch)
    punto = _punto(_tendencia(client, cab, meses=1), m)

    assert punto["espacios_comercializables"] == 22   # 20 + 2
    assert punto["ocupacion_pct"] == CONS_OCUPACION_PONDERADA
    assert punto["ocupacion_pct"] != CONS_OCUPACION_PROMEDIO_DE_PCT

    # Y por cliente, cada uno con su propio porcentaje.
    assert _punto(_tendencia(client, cab, cliente="acme", meses=1), m)["ocupacion_pct"] == 10.0
    assert _punto(_tendencia(client, cab, cliente="beta", meses=1), m)["ocupacion_pct"] == 100.0


def test_consolidado_canon_es_ponderado(client, monkeypatch):
    cab, m = _escenario_ponderado(client, monkeypatch)
    punto = _punto(_tendencia(client, cab, meses=1), m)

    assert punto["ingreso_contratado_mes"] == 208.0
    assert punto["canon_promedio_mensual"] == CONS_CANON_PONDERADO
    assert punto["canon_promedio_mensual"] != CONS_CANON_PROMEDIO_DE_PROMEDIOS

    # acme aporta sus $200 al total, y su propia fila publica el mismo número
    # exacto (Fase 7, sin umbral).
    acme = _punto(_tendencia(client, cab, cliente="acme", meses=1), m)
    assert acme["canon_promedio_mensual"] == 100.0
    assert acme["ingreso_contratado_mes"] == 200.0


def test_consolidado_usuarios_son_distintos(client, monkeypatch):
    cab, m = _escenario_ponderado(client, monkeypatch)
    consolidado = _punto(_tendencia(client, cab, meses=1), m)
    acme = _punto(_tendencia(client, cab, cliente="acme", meses=1), m)
    beta = _punto(_tendencia(client, cab, cliente="beta", meses=1), m)

    assert acme["usuarios_con_cuenta"] == 2      # dueña + compartida
    assert beta["usuarios_con_cuenta"] == 2      # dueño + compartida
    assert consolidado["usuarios_con_cuenta"] == 3   # DISTINTAS
    assert consolidado["usuarios_con_cuenta"] != acme["usuarios_con_cuenta"] + beta["usuarios_con_cuenta"]


# ════════════════════════════════════════════════════════════════════════════
# 3. Fase 7 — agregados EXACTOS por mes en el histórico, sin umbral
# ════════════════════════════════════════════════════════════════════════════
#
# ACME, sede NAVE: PUN-01, PUN-02, GON-01 (doble), BAT-01 → 5 caras
#   (y una CAJ-01, checkout, que no cuenta: el tipo no se vende)
#   A1 Alpina   NAVE-PUN-01     M-2 .. M-2    100
#   A2 Bimbo    NAVE-PUN-02     M-2 .. M-2    200
#   A3 Alpina   NAVE-GON-01     M-1 .. M-1    300
#   A4 Bimbo    NAVE-GON-01-B   M-1 .. M-1    400
#   A5 Nutresa  NAVE-BAT-01     M-1 .. M      500
#
# BETA, sede B: E-01, E-02 → 2 caras
#   B1 Nutresa  B-E-01          M-2 .. M-2   1000
#   B2 Nutresa  B-E-02          M-2 .. M-2   2000
#
# A MANO (sin umbral, Fase 7 — cada mes publica su número exacto):
#   acme M-2: 2 contratos. ingreso 300,00, canon 150,00, top Alpina 1 / Bimbo 1
#             ocupadas 2/5 = 40.0 %
#   acme M-1: 3 contratos. canon_total 1.200, promedio 400,00
#             ocupadas {GON-01, GON-01-B, BAT-01} 3/5 = 60.0 %
#   acme M  : 1 contrato. ingreso 500,00, canon 500,00, top Nutresa 1
#             ocupadas 1/5 = 20.0 %
#
#   consolidado M-2: 2 (acme) + 2 (beta) = 4 contratos
#             canon_total = 300 + 3.000 = 3.300  →  promedio 3.300/4 = 825,00
#             ocupadas (2+2)/(5+2) = 4/7 = 57,142… → 57.1 %
#             top: Nutresa 2, Alpina 1, Bimbo 1
#             ⇒ el ingreso consolidado coincide con la suma de las filas: acme
#               (300,00) + beta (3.000,00) = 3.300,00, sin residuo.
#   consolidado M-1: 3 contratos → 1.200 / 400,00, 3/7 = 42.9 %
#   consolidado M  : 1 contrato en TODA la plataforma → publica exacto
#             ingreso 500,00, canon 500,00, top Nutresa 1
#             ocupacion 1/7 = 14,285… → 14.3 %

_PLANO_K = [
    {"code": "PUN-01", "type": "punta", "sede": "NAVE"},
    {"code": "PUN-02", "type": "punta", "sede": "NAVE"},
    {"code": "GON-01", "type": "gondola", "gondolaType": "double", "sede": "NAVE"},
    {"code": "BAT-01", "type": "batea", "sede": "NAVE"},
    # Y una caja registradora, que NO cuenta: lo decide el TIPO, no la
    # bandera — un plano viejo tampoco la trae.
    {"code": "CAJ-01", "type": "checkout", "sede": "NAVE"},
]


def _escenario_k3(client, monkeypatch):
    ids = Identidades(client)
    _fundar(ids, "uid-acme", "duena@acme.co", "acme", "Acme")
    _fundar(ids, "uid-beta", "dueno@beta.co", "beta", "Beta")
    m2, m1, m = _tres_meses()
    d2, h2 = _limites(m2)
    d1, h1 = _limites(m1)
    d0, h0 = _limites(m)
    _sembrar("acme", {"NAVE": _PLANO_K}, [
        ("NAVE-PUN-01",   "Alpina",  d2, h2, 100.0, True),
        ("NAVE-PUN-02",   "Bimbo",   d2, h2, 200.0, True),
        ("NAVE-GON-01",   "Alpina",  d1, h1, 300.0, True),
        ("NAVE-GON-01-B", "Bimbo",   d1, h1, 400.0, True),
        ("NAVE-BAT-01",   "Nutresa", d1, h0, 500.0, True),
    ])
    _sembrar("beta", {"B": [
        {"code": "E-01", "type": "punta", "sede": "B"},
        {"code": "E-02", "type": "punta", "sede": "B"},
    ]}, [
        ("B-E-01", "Nutresa", d2, h2, 1000.0, True),
        ("B-E-02", "Nutresa", d2, h2, 2000.0, True),
    ])
    consola = _operador_sin_membresias(ids, monkeypatch)
    cab = _cab(consola["token"])
    _purgar_snapshots()
    for p in (m2, m1, m):
        _metricas(client, cab, p)
    return cab, (m2, m1, m)


def test_el_agregado_exacto_se_aplica_mes_a_mes_en_la_serie_del_cliente(client, monkeypatch):
    """Fase 7: cada mes de la serie publica su número exacto, sea cual sea el
    conteo de contratos de ese mes — 1, 2 o 3, ninguno se esconde."""
    cab, (m2, m1, m) = _escenario_k3(client, monkeypatch)
    serie = _tendencia(client, cab, cliente="acme", meses=3)

    # M-2: 2 contratos, exacto.
    p2 = _punto(serie, m2)
    assert p2["ingreso_contratado_mes"] == 300.0
    assert p2["canon_promedio_mensual"] == 150.0
    assert [(t["nombre"], t["contratos_activos"]) for t in p2["top_proveedores"]] == [
        ("Alpina", 1), ("Bimbo", 1)]
    assert p2["ocupacion_pct"] == 40.0
    assert p2["espacios_comercializables"] == 5
    assert p2["sedes_con_plano"] == 1

    # M-1: 3 contratos, exacto.
    p1 = _punto(serie, m1)
    assert p1["ingreso_contratado_mes"] == 1200.0
    assert p1["canon_promedio_mensual"] == 400.0
    assert p1["ocupacion_pct"] == 60.0
    assert [(t["nombre"], t["contratos_activos"]) for t in p1["top_proveedores"]] == [
        ("Alpina", 1), ("Bimbo", 1), ("Nutresa", 1)]

    # M: 1 contrato, exacto igual.
    p0 = _punto(serie, m)
    assert p0["ingreso_contratado_mes"] == 500.0
    assert p0["canon_promedio_mensual"] == 500.0
    assert p0["top_proveedores"] == [{"nombre": "Nutresa", "contratos_activos": 1}]
    assert p0["ocupacion_pct"] == 20.0


def test_consolidado_usa_los_datos_subyacentes_del_cliente(client, monkeypatch):
    """Sin umbral, el consolidado coincide con la suma de las filas visibles:
    ya no hay una fila que aporte al total sin publicar su propio número."""
    cab, (m2, m1, m) = _escenario_k3(client, monkeypatch)
    serie = _tendencia(client, cab, meses=3)

    p2 = _punto(serie, m2)
    assert p2["ingreso_contratado_mes"] == 3300.0, "acme (300) + beta (3.000)"
    assert p2["canon_promedio_mensual"] == 825.0     # 3.300 / 4
    assert p2["ocupacion_pct"] == 57.1               # 4/7
    assert [(t["nombre"], t["contratos_activos"]) for t in p2["top_proveedores"]] == [
        ("Nutresa", 2), ("Alpina", 1), ("Bimbo", 1)]

    p1 = _punto(serie, m1)
    assert p1["ingreso_contratado_mes"] == 1200.0
    assert p1["canon_promedio_mensual"] == 400.0
    assert p1["ocupacion_pct"] == 42.9               # 3/7


def test_el_consolidado_publica_exacto_aunque_toda_la_plataforma_tenga_un_solo_contrato(
    client, monkeypatch,
):
    """Fase 7: sin umbral, el consolidado también publica exacto cuando toda
    la plataforma sólo tiene un contrato ese mes."""
    cab, (_m2, _m1, m) = _escenario_k3(client, monkeypatch)
    p0 = _punto(_tendencia(client, cab, meses=3), m)

    assert p0["ingreso_contratado_mes"] == 500.0, "1 contrato en toda la plataforma"
    assert p0["canon_promedio_mensual"] == 500.0
    assert p0["top_proveedores"] == [{"nombre": "Nutresa", "contratos_activos": 1}]
    assert p0["ocupacion_pct"] == 14.3               # 1/7
    assert p0["espacios_comercializables"] == 7


# ════════════════════════════════════════════════════════════════════════════
# 4. El saneo del nombre del proveedor se aplica AL LEER
# ════════════════════════════════════════════════════════════════════════════
#
# "Juan Pérez (juan@x.co) 3001234567"
#   1) correo  -> "Juan Pérez ([correo oculto]) 3001234567"
#   2) teléfono (10 dígitos ≥ 7) -> "Juan Pérez ([correo oculto]) [teléfono oculto]"
# Tres contratos del mismo proveedor sucio, para que el top tenga un caso real
# que sanear (Fase 7: ya no hace falta cruzar ningún umbral para que el top
# aparezca — con 1 o 2 contratos también saldría saneado igual).

SUCIO = "Juan Pérez (juan@x.co) 3001234567"
SANEADO = "Juan Pérez ([correo oculto]) [teléfono oculto]"


def test_saneo_del_proveedor_en_la_serie(client, monkeypatch):
    ids = Identidades(client)
    _fundar(ids, "uid-acme", "duena@acme.co", "acme", "Acme")
    _m2, _m1, m = _tres_meses()
    d0, h0 = _limites(m)
    _sembrar("acme", {"NAVE": _PLANO_K}, [
        ("NAVE-PUN-01", SUCIO, d0, h0, 100.0, True),
        ("NAVE-PUN-02", SUCIO, d0, h0, 200.0, True),
        ("NAVE-BAT-01", SUCIO, d0, h0, 300.0, True),
    ])
    consola = _operador_sin_membresias(ids, monkeypatch)
    cab = _cab(consola["token"])
    _metricas(client, cab, m)

    for cliente in ("acme", "__consolidado__"):
        cuerpo = _tendencia(client, cab, cliente=cliente, meses=3)
        punto = _punto(cuerpo, m)
        assert [t["nombre"] for t in punto["top_proveedores"]] == [SANEADO], cliente
        # La invariante dura: NINGÚN string del JSON trae una arroba.
        textos = [v for v in _hojas(cuerpo) if isinstance(v, str)]
        assert not any("@" in t for t in textos), cliente
        assert not any("3001234567" in t for t in textos), cliente
        assert not any("x.co" in t for t in textos), cliente


# ════════════════════════════════════════════════════════════════════════════
# 5. Congelado (mes pasado) vs convergencia (mes en curso) + idempotencia
# ════════════════════════════════════════════════════════════════════════════

def _escenario_congelado(client, monkeypatch):
    ids = Identidades(client)
    _fundar(ids, "uid-acme", "duena@acme.co", "acme", "Acme")
    _m2, m1, m = _tres_meses()
    d1, h1 = _limites(m1)
    d0, h0 = _limites(m)
    # Base: 3 contratos en M-1 y 3 en M (el conteo no importa desde Fase 7,
    # sin umbral; se mantiene por continuidad con el resto del escenario).
    _sembrar("acme", {"NAVE": _PLANO_K}, [
        ("NAVE-PUN-01",   "Alpina",  d1, h1, 100.0, True),
        ("NAVE-PUN-02",   "Bimbo",   d1, h1, 200.0, True),
        ("NAVE-GON-01",   "Nutresa", d1, h1, 300.0, True),
        ("NAVE-GON-01-B", "Alpina",  d0, h0, 100.0, True),
        ("NAVE-BAT-01",   "Bimbo",   d0, h0, 200.0, True),
        ("NAVE-PUN-02",   "Nutresa", d0, h0, 300.0, True),
    ])
    consola = _operador_sin_membresias(ids, monkeypatch)
    cab = _cab(consola["token"])
    _purgar_snapshots()
    return cab, (m1, m)


def test_mes_pasado_queda_congelado(client, monkeypatch):
    """M-1: ingreso 600 (100+200+300). Se agrega un contrato de 5.000 en M-1 y
    se vuelve a pedir /metricas → la SERIE de M-1 no se mueve."""
    cab, (m1, m) = _escenario_congelado(client, monkeypatch)
    d1, h1 = _limites(m1)

    _metricas(client, cab, m1)
    antes = _punto(_tendencia(client, cab, cliente="acme", meses=3), m1)
    assert antes["ingreso_contratado_mes"] == 600.0
    assert antes["capturado_en"] is not None

    _sembrar("acme", {}, [("NAVE-BAT-01", "Tardio SA", d1, h1, 5000.0, True)])
    _metricas(client, cab, m1)

    despues = _punto(_tendencia(client, cab, cliente="acme", meses=3), m1)
    assert despues["ingreso_contratado_mes"] == 600.0, "un mes cerrado no se repisa"
    assert despues["capturado_en"] == antes["capturado_en"]
    assert "Tardio SA" not in [t["nombre"] for t in despues["top_proveedores"]]


def test_mes_en_curso_converge(client, monkeypatch):
    """M: ingreso 600. Se agrega un contrato de 5.000 en M → la serie SÍ cambia
    a 5.600 y el promedio pasa de 200,00 a 1.400,00 (5.600/4)."""
    cab, (m1, m) = _escenario_congelado(client, monkeypatch)
    d0, h0 = _limites(m)

    _metricas(client, cab, m)
    antes = _punto(_tendencia(client, cab, cliente="acme", meses=3), m)
    assert antes["ingreso_contratado_mes"] == 600.0
    assert antes["canon_promedio_mensual"] == 200.0

    _sembrar("acme", {}, [("NAVE-PUN-01", "Nuevo SA", d0, h0, 5000.0, True)])
    _metricas(client, cab, m)

    despues = _punto(_tendencia(client, cab, cliente="acme", meses=3), m)
    assert despues["ingreso_contratado_mes"] == 5600.0
    assert despues["canon_promedio_mensual"] == 1400.0
    assert despues["parcial"] is True


def test_idempotencia_una_fila_por_cliente_y_periodo(client, monkeypatch):
    cab, (m1, m) = _escenario_congelado(client, monkeypatch)
    for _ in range(4):
        _metricas(client, cab, m1)
        _metricas(client, cab, m)

    for periodo in (m1, m):
        for slug in ("acme", "galerias", "__consolidado__"):
            filas = _filas_snapshot(slug, periodo)
            assert len(filas) == 1, (slug, periodo, filas)


# ════════════════════════════════════════════════════════════════════════════
# 6. Cierre automático del mes anterior
# ════════════════════════════════════════════════════════════════════════════

def test_cierre_automatico_pone_el_mes_anterior(client, monkeypatch):
    """Sin abrir NUNCA /metricas: ``cerrar_mes_anterior()`` deja M-1 con
    origen="cierre" y los números correctos (ingreso 600, promedio 200,00,
    ocupación 3/5 = 60.0 %). Y M sigue sin fila."""
    from app.plataforma_tendencia import cerrar_mes_anterior

    cab, (m1, m) = _escenario_congelado(client, monkeypatch)
    assert _filas_snapshot(periodo=m1) == []

    cerrar_mes_anterior()

    punto = _punto(_tendencia(client, cab, cliente="acme", meses=3), m1)
    assert punto["sin_dato"] is False
    assert punto["origen"] == "cierre"
    assert punto["ingreso_contratado_mes"] == 600.0
    assert punto["canon_promedio_mensual"] == 200.0
    assert punto["ocupacion_pct"] == 60.0
    assert punto["parcial"] is False

    consolidado = _punto(_tendencia(client, cab, meses=3), m1)
    assert consolidado["ingreso_contratado_mes"] == 600.0
    assert consolidado["clientes_incluidos"] == 2   # galerias + acme
    assert consolidado["clientes_con_error"] == 0

    # El mes EN CURSO no lo toca el cierre.
    assert _punto(_tendencia(client, cab, cliente="acme", meses=3), m)["sin_dato"] is True


def test_cierre_repetido_no_duplica_ni_cambia(client, monkeypatch):
    from app.plataforma_tendencia import cerrar_mes_anterior

    cab, (m1, m) = _escenario_congelado(client, monkeypatch)
    cerrar_mes_anterior()
    antes = _filas_snapshot(periodo=m1)

    d1, h1 = _limites(m1)
    _sembrar("acme", {}, [("NAVE-PUN-02", "Tardio SA", d1, h1, 5000.0, True)])
    cerrar_mes_anterior()
    cerrar_mes_anterior()

    despues = _filas_snapshot(periodo=m1)
    assert len(despues) == len(antes)
    assert sorted(despues, key=lambda f: f["slug"]) == sorted(antes, key=lambda f: f["slug"])


def test_cierre_con_un_cliente_roto_cierra_igual_al_resto(client, monkeypatch):
    from app.plataforma_tendencia import cerrar_mes_anterior

    cab, (m1, m) = _escenario_congelado(client, monkeypatch)
    _romper()
    cerrar_mes_anterior()

    punto = _punto(_tendencia(client, cab, cliente="acme", meses=3), m1)
    assert punto["ingreso_contratado_mes"] == 600.0

    consolidado = _punto(_tendencia(client, cab, meses=3), m1)
    assert consolidado["clientes_con_error"] == 1
    assert consolidado["clientes_incluidos"] == 2   # galerias + acme; roto excluido
    assert consolidado["ingreso_contratado_mes"] == 600.0

    # El cliente roto NO recibe fila: su serie tiene un hueco honesto.
    assert _filas_snapshot("roto", m1) == []
    assert _punto(_tendencia(client, cab, cliente="roto", meses=3), m1)["sin_dato"] is True


def test_run_lease_maintenance_dispara_el_cierre(client, monkeypatch):
    """El cierre cuelga del ciclo real de mantenimiento, no sólo de la función."""
    from app.main import _run_lease_maintenance

    cab, (m1, _m) = _escenario_congelado(client, monkeypatch)
    assert _filas_snapshot(periodo=m1) == []
    _run_lease_maintenance()
    punto = _punto(_tendencia(client, cab, cliente="acme", meses=3), m1)
    assert punto["sin_dato"] is False
    assert punto["origen"] == "cierre"


# ════════════════════════════════════════════════════════════════════════════
# 7. Forma de la serie
# ════════════════════════════════════════════════════════════════════════════

_CAMPOS_PUNTO = {
    "periodo", "parcial", "sin_dato", "capturado_en", "origen",
    "clientes_incluidos", "clientes_con_error", "sedes_con_plano",
    "espacios_comercializables", "ocupacion_pct", "canon_promedio_mensual",
    "ingreso_contratado_mes", "top_proveedores", "usuarios_con_cuenta",
}


def test_forma_seis_meses_ordenados_y_el_ultimo_parcial(client, monkeypatch):
    from app.plataforma_tendencia import ultimos_periodos

    cab, (_m1, m) = _escenario_congelado(client, monkeypatch)
    _metricas(client, cab, m)

    cuerpo = _tendencia(client, cab, meses=6)
    assert cuerpo["meses"] == 6
    assert len(cuerpo["serie"]) == 6
    periodos = [p["periodo"] for p in cuerpo["serie"]]
    assert periodos == ultimos_periodos(6, m), "6 meses consecutivos, viejo → nuevo"
    assert periodos == sorted(periodos)
    assert periodos[-1] == m == cuerpo["periodo_actual"] == cuerpo["hasta"]
    assert cuerpo["desde"] == periodos[0]

    assert [p["parcial"] for p in cuerpo["serie"]] == [False] * 5 + [True]


def test_meses_sin_snapshot_van_con_sin_dato_y_nulls(client, monkeypatch):
    cab, (_m1, m) = _escenario_congelado(client, monkeypatch)
    _metricas(client, cab, m)

    cuerpo = _tendencia(client, cab, meses=6)
    vacios = [p for p in cuerpo["serie"] if p["periodo"] != m]
    assert len(vacios) == 5
    for p in vacios:
        assert p["sin_dato"] is True
        assert set(p) == _CAMPOS_PUNTO
        assert p["top_proveedores"] == []
        for campo in ("capturado_en", "origen", "clientes_incluidos",
                      "clientes_con_error", "sedes_con_plano",
                      "espacios_comercializables", "ocupacion_pct",
                      "canon_promedio_mensual", "ingreso_contratado_mes",
                      "usuarios_con_cuenta"):
            assert p[campo] is None, (p["periodo"], campo)

    lleno = _punto(cuerpo, m)
    assert lleno["sin_dato"] is False
    assert set(lleno) == _CAMPOS_PUNTO


def test_contratos_activos_y_ocupadas_nunca_salen_al_json(client, monkeypatch):
    """Son crudos de negocio (numerador y denominador de la ocupación): no
    cruzan la frontera del operador, con o sin umbral (Fase 7 no cambia esto)."""
    cab, (_m2, _m1, m) = _escenario_k3(client, monkeypatch)
    for cliente in ("acme", "beta", "__consolidado__"):
        cuerpo = _tendencia(client, cab, cliente=cliente, meses=6)
        claves = set(_claves(cuerpo))
        assert "ocupadas" not in claves, cliente
        # "contratos_activos" sólo puede aparecer DENTRO de top_proveedores.
        # Nunca como campo del punto de la serie.
        for punto in cuerpo["serie"]:
            assert "contratos_activos" not in punto, (cliente, punto["periodo"])
            assert "ocupadas" not in punto
            assert "canon_total" not in punto


# ════════════════════════════════════════════════════════════════════════════
# HALLAZGOS — bugs encontrados por esta auditoría (NO se arreglan acá)
# ════════════════════════════════════════════════════════════════════════════
#
# BUG-1 (BLOQUEANTE — un número sale mal).
#
# `persistir_snapshots` congela un mes pasado FILA POR FILA: para cada slug, si
# la fila ya existe la deja intacta; si no existe, la INSERTA. El consolidado es
# una fila más, con el mismo trato. La consecuencia es que un mes pasado puede
# quedar con filas por cliente que NO suman lo que dice su propia fila
# consolidada.
#
# Cómo se llega, sin nada raro:
#
#   1. El servidor arranca. `_run_lease_maintenance` → `cerrar_mes_anterior()`
#      cierra M-1 con los clientes que existen (o que se pudieron leer) EN ESE
#      INSTANTE, y escribe la fila `__consolidado__` de M-1.
#   2. Después aparece un cliente que en el paso 1 no estaba: se dio de alta ese
#      día (con contratos que arrancan en M-1), o —el caso feo— su base estaba
#      ilegible durante el cierre y por eso no recibió fila.
#   3. Alguien abre /metricas?periodo=M-1. El write-through INSERTA la fila de
#      ese cliente (no existía) pero NO toca la consolidada (ya existía, mes
#      pasado ⇒ congelada).
#   4. La serie del consolidado de M-1 queda entonces mostrando el total de
#      antes del paso 2, para siempre — con `clientes_con_error: 1` al lado de un
#      cliente que sí tiene su fila del mes. El número está mal por defecto
#      (subestima el ingreso y la ocupación del negocio), que es justo la lectura
#      que la fase existe para dar.
#
# El test de abajo lo reproduce con números exactos.
#
# ARREGLADO (iteración 2): `persistir_snapshots` trata el mes como una unidad
# — si al persistir un mes pasado se INSERTA alguna fila por cliente, la fila
# `__consolidado__` de ese mes se reconstruye a partir de TODAS las filas por
# cliente ya persistidas del período (ver el bloque `hubo_alta` en
# `app/plataforma_tendencia.py::persistir_snapshots`). La regla de congelado
# sigue valiendo para lo que ya estaba (las filas por cliente nunca se tocan);
# lo que ya no pasa es que el total contradiga a sus sumandos.

def test_BUG_consolidado_congelado_no_incluye_al_cliente_que_llego_despues(
        client, monkeypatch):
    """M-1: acme aporta 3 contratos y $1.200; el consolidado dice $0.

    Guion, con los números a mano:

      · Se cierra M-1 cuando el único cliente es `galerias` (vacío):
        consolidado M-1 = 0 caras, 0 contratos, $0.
      · Se funda acme y se le siembran 3 contratos de M-1 por $1.200 sobre
        5 caras (3 ocupadas).
      · Se abre /metricas de M-1: acme recibe su fila (3 / $1.200 / 5 / 3).

    ESPERADO para el consolidado de M-1: ingreso $1.200,00, canon promedio
    $400,00, ocupación 3/5 = 60.0 %, clientes_incluidos 2.
    OBTENIDO en su momento (histórico, antes del arreglo de BUG-1 y de que la
    Fase 7 quitara K=3): ingreso None, canon None, ocupación None,
    clientes_incluidos 1 (entonces por K=3 sobre 0 contratos), porque la fila
    consolidada quedó congelada en el cierre de arranque.
    """
    from app.plataforma_tendencia import cerrar_mes_anterior

    ids = Identidades(client)
    consola = _operador_sin_membresias(ids, monkeypatch)
    cab = _cab(consola["token"])

    _purgar_snapshots()
    _m2, m1, _m = _tres_meses()
    d1, h1 = _limites(m1)

    # 1) El cierre corre cuando acme todavía no existe.
    cerrar_mes_anterior()
    assert _filas_snapshot("__consolidado__", m1)[0]["contratos"] == 0

    # 2) Aparece acme, con historia en M-1.
    _fundar(ids, "uid-acme", "duena@acme.co", "acme", "Acme")
    _sembrar("acme", {"NAVE": _PLANO_K}, [
        ("NAVE-PUN-01", "Alpina",  d1, h1, 100.0, True),
        ("NAVE-PUN-02", "Bimbo",   d1, h1, 200.0, True),
        ("NAVE-BAT-01", "Nutresa", d1, h1, 900.0, True),
    ])

    # 3) Alguien mira M-1: acme recibe SU fila.
    _metricas(client, cab, m1)
    acme = _punto(_tendencia(client, cab, cliente="acme", meses=3), m1)
    assert acme["ingreso_contratado_mes"] == 1200.0
    assert acme["ocupacion_pct"] == 60.0

    # 4) …y el consolidado del MISMO mes tendría que decir lo mismo.
    consolidado = _punto(_tendencia(client, cab, meses=3), m1)
    assert consolidado["ingreso_contratado_mes"] == 1200.0
    assert consolidado["canon_promedio_mensual"] == 400.0
    assert consolidado["ocupacion_pct"] == 60.0
    assert consolidado["clientes_incluidos"] == 2


# BUG-2 (MENOR — no hay número mal, hay trabajo de más).
#
# `cerrar_mes_anterior` se da por hecho sólo si `esperados <= presentes`, o sea
# si TODOS los slugs del registro tienen fila en M-1. Un cliente cuya base está
# rota nunca recibe fila (correcto: no se le inventan ceros), así que la
# condición no se cumple NUNCA mientras esa base siga rota — y cada corrida del
# mantenimiento (cada 12 h) vuelve a recorrer las N bases de todos los clientes
# para no escribir nada nuevo. No corrompe datos —el congelado protege lo ya
# escrito— pero es un recorrido completo, indefinido, disparado por un cliente
# que justamente ya se sabe que falla.

def test_HALLAZGO_cierre_reintenta_para_siempre_con_un_cliente_roto(client, monkeypatch):
    """Documenta el reintento: tras cerrar, el mes SIGUE considerándose incompleto."""
    from app.models.models import ClienteRow
    from app.clientes import sesion_registro
    from app.models.plataforma import SnapshotMetricas
    from app.plataforma_tendencia import CONSOLIDADO_SLUG, cerrar_mes_anterior

    cab, (m1, _m) = _escenario_congelado(client, monkeypatch)
    _romper()
    cerrar_mes_anterior()

    reg = sesion_registro()
    try:
        esperados = {f.slug for f in reg.query(ClienteRow.slug).all()}
        presentes = {
            f.cliente_slug
            for f in reg.query(SnapshotMetricas.cliente_slug)
            .filter(SnapshotMetricas.periodo == m1).all()
        }
    finally:
        reg.close()

    assert "roto" in esperados and "roto" not in presentes
    assert CONSOLIDADO_SLUG in presentes
    # La guarda de corte del backend es `esperados <= presentes`: con `roto`
    # afuera, es False y el cierre vuelve a recorrer TODAS las bases en la
    # próxima corrida, indefinidamente.
    assert not (esperados <= presentes), (
        "si esto empieza a pasar, el backend cambió la guarda: revisar BUG-2")
