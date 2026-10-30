"""Fase 6 — AUDITORÍA ARITMÉTICA del spread ponderado (Fase 7: sin umbral) y
de las cohortes.

Este archivo es de un AUDITOR, no del constructor: no reusa una sola cuenta del
código de producción. Todo número esperado está calculado A MANO en las
constantes de arriba (mismo estilo que ``test_metricas_conciliacion.py``) y el
test se limita a comparar el JSON contra esas constantes. Si mañana alguien
cambia la fórmula del spread, este archivo no lo sigue: lo denuncia.

Qué se audita:

* El spread por cliente — ``(Σ canon_con_tarifa / Σ tarifa − 1) × 100`` a 1
  decimal — EXACTO sin umbral (Fase 7: K=3 desapareció), la precedencia
  ``by_sede`` sobre ``default``, los contratos sin tarifa aplicable (espacio
  fuera del plano o tipo sin entrada) y la cara ``-B`` de la góndola doble,
  que paga la MISMA tarifa por cara que la A.
* El consolidado PONDERADO (Σ/Σ sobre TODOS los clientes legibles con
  tarifa, sin excluir a ninguno) y su diferencia demostrada contra el
  promedio aritmético de spreads, que es la cuenta equivocada.
* Que ningún valor ABSOLUTO de tarifa aparezca en el JSON.
* Que ``/tendencia`` NO gane los campos nuevos.
* La clasificación de adopción, su orden de precedencia, los bordes de los 30
  días, las cohortes por mes de alta, la retención y los ordenamientos.

Convención de fechas: los contratos se siembran con un rango absurdamente
ancho (2020..2099) para que estén activos en CUALQUIER mes en que corra la
suite; el período pedido es siempre el mes en curso (UTC), que es el único que
``/adopcion`` sabe mirar.
"""
from tests.sembrado import total_del_plazo, marcar_cancelados
import json
from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

# ════════════════════════════════════════════════════════════════════════════
# ESCENARIO DEL SPREAD, CALCULADO A MANO
# ════════════════════════════════════════════════════════════════════════════
#
# Contratos siempre activos: 2020-01-01 .. 2099-12-31.
INI, FIN = "2020-01-01", "2099-12-31"

# ── Cliente A (slug "clia") ──────────────────────────────────────────────────
# Tarifa: default {gondola: 1.000.000}. Sin by_sede.
# Plano NAVE: GON-01 doble -> NAVE-GON-01 + NAVE-GON-01-B
#             GON-02 doble -> NAVE-GON-02 + NAVE-GON-02-B
# Contratos: NAVE-GON-01, NAVE-GON-01-B, NAVE-GON-02, todos a 900.000.
#   (la cara -B entra por el MISMO tipo "gondola" que la cara A: misma tarifa)
#   Σ canon_con_tarifa = 2.700.000 · Σ tarifa = 3 × 1.000.000 = 3.000.000
#   ratio = 2.700.000 / 3.000.000 = 0,9  ->  (0,9 − 1) × 100 = −10,0
A_CANON_CT = 2_700_000.0
A_TARIFA_T = 3_000_000.0
A_CONTRATOS_CT = 3
A_SPREAD = -10.0
A_CANON_PROMEDIO = 900_000.0          # 2.700.000 / 3
A_INGRESO = 2_700_000.0
A_SIN_TARIFA = 0

# ── Cliente B (slug "clib") ──────────────────────────────────────────────────
# Misma tarifa default {gondola: 1.000.000}; SÓLO 2 contratos a 900.000.
# Fase 7 (sin umbral): 2 contratos publican igual que 3 — no hay umbral que
# cruzar. ratio = 1.800.000 / 2.000.000 = 0,9  ->  (0,9 − 1) × 100 = −10,0
B_CANON_CT = 1_800_000.0
B_TARIFA_T = 2_000_000.0
B_CONTRATOS_CT = 2
B_SIN_TARIFA = 0
B_SPREAD = -10.0
B_CANON_PROMEDIO = 900_000.0          # 1.800.000 / 2
B_INGRESO = 1_800_000.0

# ── Cliente C (slug "clic") ──────────────────────────────────────────────────
# SIN tarifa configurada. 4 contratos a 1.111.111 (valor elegido para no
# coincidir con ninguna tarifa sembrada, que es lo que audita el test de fuga).
C_CANON = 1_111_111.0
C_CONTRATOS = 4
C_INGRESO = 4_444_444.0               # 4 × 1.111.111
C_SIN_TARIFA = 4                      # todos los activos
C_CANON_CT = 0.0
C_TARIFA_T = 0.0
C_CONTRATOS_CT = 0

# ── Cliente D (slug "clid") ──────────────────────────────────────────────────
# Tarifa: default {gondola: 1.000.000}, by_sede {NAVE: {gondola: 2.000.000}}.
# Contratos:
#   3 en NAVE a 1.500.000  -> tarifa de la SEDE  = 3 × 2.000.000 = 6.000.000
#   1 en SUR  a   800.000  -> SUR no tiene propia, cae al default = 1.000.000
#   1 sobre "FANTASMA-01", código que NO está en el plano -> sin tarifa
#   Σ canon_con_tarifa = 4.500.000 + 800.000 = 5.300.000
#   Σ tarifa           = 6.000.000 + 1.000.000 = 7.000.000
#   5.300.000 / 7.000.000 = 0,757142857142857…
#   (0,757142857… − 1) × 100 = −24,285714285714…  -> round(…, 1) = −24,3
D_CANON_CT = 5_300_000.0
D_TARIFA_T = 7_000_000.0
D_CONTRATOS_CT = 4
D_SPREAD = -24.3
D_SIN_TARIFA = 1
D_CONTRATOS = 5
D_INGRESO = 5_800_000.0               # 4.500.000 + 800.000 + 500.000
D_CANON_PROMEDIO = 1_160_000.0        # 5.800.000 / 5

# ── Consolidado (A + B + C + D legibles; "galerias" vacío; "roto" excluido) ──
# Fase 7 (sin umbral): el consolidado suma a TODOS los legibles con tarifa —
# A, B y D los tres, B incluido (antes de la Fase 7 quedaba afuera por K=3).
#   Σ canon_con_tarifa = 2.700.000 + 1.800.000 + 0 + 5.300.000 = 9.800.000
#   Σ tarifa           = 3.000.000 + 2.000.000 + 0 + 7.000.000 = 12.000.000
#   Σ contratos_con_tarifa = 3 + 2 + 0 + 4 = 9
#   9.800.000 / 12.000.000 = 0,816666…  ->  (−0,183333…) × 100 = −18,3333…
#   round(…, 1) = −18,3
CONS_CANON_CT = 9_800_000.0
CONS_TARIFA_T = 12_000_000.0
CONS_CONTRATOS_CT = 9
CONS_SPREAD = -18.3
# La cuenta EQUIVOCADA (promedio aritmético de los spreads publicados: A, B y
# D — los tres, ahora que ninguno se suprime): (−10,0 + −10,0 + −24,3) / 3 =
# −14,7666… -> −14,77
CONS_PROMEDIO_DE_SPREADS = -14.77
CONS_CLIENTES_CON_TARIFA = 3          # A, B y D. C no; galerias tampoco.

# Los montos de TARIFA sembrados: ninguno puede aparecer en el JSON.
TARIFAS_SEMBRADAS = (1_000_000.0, 2_000_000.0)


# ════════════════════════════════════════════════════════════════════════════
# Andamiaje (copiado de tests/test_plataforma_metricas.py)
# ════════════════════════════════════════════════════════════════════════════

class FakeVerificador:
    def __init__(self, mapa: dict):
        self.mapa = mapa

    def verificar(self, id_token):
        return self.mapa.get(id_token)


def _claims(uid, email):
    return SimpleNamespace(
        uid=uid, email=email, email_verificado=True, proveedor="google.com", nombre=None,
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

        proveedores: dict = {}
        espacios: dict = {}
        for codigo, proveedor, ini, fin, canon, activo in contratos:
            if proveedor not in proveedores:
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
                monthly_rent=total_del_plazo(canon, ini, fin),  # lo de un mes, guardado como total
                is_active=activo,
            ))
        marcar_cancelados(db)  # is_active=False es una baja (auditoría P1-17)
        db.commit()
    finally:
        db.close()


def _tarifar(slug, default: dict | None = None, by_sede: dict | None = None):
    """La tarifa de referencia en la base DEL CLIENTE (``app_config``)."""
    from app.auth import set_config
    from app.clientes import buscar, sesion_de
    from app.routers.layout import RATES_KEY

    cliente = buscar(slug)
    assert cliente is not None, slug
    db = sesion_de(cliente)
    try:
        set_config(db, RATES_KEY, json.dumps({
            "default": default or {},
            "by_sede": by_sede or {},
        }))
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


def _periodo():
    from app.plataforma_metricas import periodo_actual

    return periodo_actual()


def _pedir(client, cab):
    r = client.get(f"/api/plataforma/metricas?periodo={_periodo()}", headers=cab)
    assert r.status_code == 200, r.text
    return r.json()


def _fila(cuerpo, slug):
    return next(c for c in cuerpo["clientes"] if c["slug"] == slug)


def _hojas(nodo):
    if isinstance(nodo, dict):
        for v in nodo.values():
            yield from _hojas(v)
    elif isinstance(nodo, list):
        for v in nodo:
            yield from _hojas(v)
    else:
        yield nodo


def _todos_los_numeros(cuerpo):
    return [v for v in _hojas(cuerpo)
            if isinstance(v, (int, float)) and not isinstance(v, bool)]


# ── Fixtures del plano ───────────────────────────────────────────────────────
# Una `gondola` sin `gondolaType` (o con "double") son DOS caras: A y -B.

def _gondolas(sede, cuantas):
    return [
        {"code": f"GON-{i:02d}", "type": "gondola", "gondolaType": "double", "sede": sede}
        for i in range(1, cuantas + 1)
    ]


_A_NAVE = _gondolas("NAVE", 2)
_A_CONTRATOS = [
    ("NAVE-GON-01", "Alpina", INI, FIN, 900_000.0, True),
    ("NAVE-GON-01-B", "Alpina", INI, FIN, 900_000.0, True),   # la cara B: MISMA tarifa
    ("NAVE-GON-02", "Nutresa", INI, FIN, 900_000.0, True),
]

_B_NAVE = _gondolas("NAVE", 1)
_B_CONTRATOS = [
    ("NAVE-GON-01", "Alpina", INI, FIN, 900_000.0, True),
    ("NAVE-GON-01-B", "Bimbo", INI, FIN, 900_000.0, True),
]

_C_NAVE = _gondolas("NAVE", 2)
_C_CONTRATOS = [
    ("NAVE-GON-01", "Alpina", INI, FIN, C_CANON, True),
    ("NAVE-GON-01-B", "Alpina", INI, FIN, C_CANON, True),
    ("NAVE-GON-02", "Bimbo", INI, FIN, C_CANON, True),
    ("NAVE-GON-02-B", "Bimbo", INI, FIN, C_CANON, True),
]

_D_NAVE = _gondolas("NAVE", 2)
_D_SUR = _gondolas("SUR", 1)
_D_CONTRATOS = [
    ("NAVE-GON-01", "Alpina", INI, FIN, 1_500_000.0, True),
    ("NAVE-GON-01-B", "Alpina", INI, FIN, 1_500_000.0, True),
    ("NAVE-GON-02", "Nutresa", INI, FIN, 1_500_000.0, True),
    ("SUR-GON-01", "Nutresa", INI, FIN, 800_000.0, True),
    # Código SIN mueble en el plano: no hay (sede, tipo) que consultar.
    ("FANTASMA-01", "Bimbo", INI, FIN, 500_000.0, True),
]


def _escenario_spread(client, monkeypatch):
    """A, B, C, D + un cliente con la base rota, y el operador de la consola."""
    from app.plataforma_metricas import limpiar_cache_metricas

    ids = Identidades(client)
    _fundar(ids, "uid-a", "duena@a.co", "clia", "Cliente A")
    _fundar(ids, "uid-b", "duena@b.co", "clib", "Cliente B")
    _fundar(ids, "uid-c", "duena@c.co", "clic", "Cliente C")
    _fundar(ids, "uid-d", "duena@d.co", "clid", "Cliente D")

    _sembrar("clia", {"NAVE": _A_NAVE}, _A_CONTRATOS)
    _tarifar("clia", default={"gondola": 1_000_000})

    _sembrar("clib", {"NAVE": _B_NAVE}, _B_CONTRATOS)
    _tarifar("clib", default={"gondola": 1_000_000})

    _sembrar("clic", {"NAVE": _C_NAVE}, _C_CONTRATOS)   # sin _tarifar: sin tarifa

    _sembrar("clid", {"NAVE": _D_NAVE, "SUR": _D_SUR}, _D_CONTRATOS)
    _tarifar("clid", default={"gondola": 1_000_000}, by_sede={"NAVE": {"gondola": 2_000_000}})

    _romper()
    consola = _operador_sin_membresias(ids, monkeypatch)
    limpiar_cache_metricas()
    return ids, _cab(consola["token"])


# ════════════════════════════════════════════════════════════════════════════
# 1-5 · El spread POR CLIENTE
# ════════════════════════════════════════════════════════════════════════════

def test_01_spread_exacto_con_tres_contratos_y_tarifa_default(client, monkeypatch):
    """A: 3 × 900.000 contra 3 × 1.000.000 -> −10,0 exacto, y el canon intacto."""
    _ids, cab = _escenario_spread(client, monkeypatch)
    m = _fila(_pedir(client, cab), "clia")["metricas"]

    # A mano: (2.700.000 / 3.000.000 − 1) × 100 = −10,0
    assert round((A_CANON_CT / A_TARIFA_T - 1) * 100, 1) == A_SPREAD
    assert m["spread_pct"] == A_SPREAD
    assert m["tarifa_configurada"] is True
    assert m["contratos_sin_tarifa"] == A_SIN_TARIFA
    # El spread no toca ninguna cuenta de la Fase 4.
    assert m["canon_promedio_mensual"] == A_CANON_PROMEDIO
    assert m["ingreso_contratado_mes"] == A_INGRESO


def test_02_dos_contratos_publican_el_spread_exacto(client, monkeypatch):
    """B: con 2 contratos, sin umbral (Fase 7), el spread sale EXACTO.

    Hasta la Fase 6 esto era la frontera de K=3 ("no te lo puedo mostrar" con
    menos de 3). El dueño de la plataforma la quitó: `tarifa_configurada`
    (si se configuró o no) y `spread_pct` (el número, exacto sea cual sea el
    conteo) son dos preguntas distintas, y ninguna de las dos depende ya de un
    umbral.
    """
    _ids, cab = _escenario_spread(client, monkeypatch)
    m = _fila(_pedir(client, cab), "clib")["metricas"]

    assert B_CONTRATOS_CT < 3
    assert m["spread_pct"] == B_SPREAD
    assert m["tarifa_configurada"] is True
    assert m["contratos_sin_tarifa"] == B_SIN_TARIFA
    assert m["canon_promedio_mensual"] == B_CANON_PROMEDIO
    assert m["ingreso_contratado_mes"] == B_INGRESO


def test_03_sin_tarifa_configurada_todos_los_contratos_quedan_sin_tarifa(client, monkeypatch):
    _ids, cab = _escenario_spread(client, monkeypatch)
    m = _fila(_pedir(client, cab), "clic")["metricas"]

    assert m["spread_pct"] is None
    assert m["tarifa_configurada"] is False
    assert m["contratos_sin_tarifa"] == C_SIN_TARIFA      # los 4 activos
    # El canon se sigue publicando: la ausencia de tarifa no toca la Fase 4.
    assert m["ingreso_contratado_mes"] == C_INGRESO


def test_04_by_sede_gana_al_default_y_el_codigo_fuera_del_plano_no_entra(client, monkeypatch):
    """D: la sede con tarifa propia manda; la que no la tiene cae al default;
    el contrato sobre un código sin mueble en el plano queda AFUERA del spread
    pero DENTRO del ingreso — la plata existe aunque el plano no la muestre."""
    _ids, cab = _escenario_spread(client, monkeypatch)
    m = _fila(_pedir(client, cab), "clid")["metricas"]

    # A mano, con el redondeo explícito:
    #   5.300.000 / 7.000.000 = 0,7571428571428571
    #   (0,7571428571428571 − 1) × 100 = −24,285714285714288  ->  −24,3
    assert round((D_CANON_CT / D_TARIFA_T - 1) * 100, 1) == D_SPREAD
    assert m["spread_pct"] == D_SPREAD
    assert m["contratos_sin_tarifa"] == D_SIN_TARIFA
    assert m["tarifa_configurada"] is True
    # Los CINCO contratos siguen contando para la Fase 4.
    assert m["ingreso_contratado_mes"] == D_INGRESO
    assert m["canon_promedio_mensual"] == D_CANON_PROMEDIO


def test_05_la_cara_B_de_la_gondola_doble_paga_la_misma_tarifa_por_cara(client, monkeypatch):
    """La cara ``-B`` no existe como fixture propio: si el mapa de tipos no la
    espejara, ese contrato caería en `contratos_sin_tarifa` y el spread de A
    sería otro. Con 2 de los 3 contratos de A sobre una góndola doble (uno en
    cada cara), que A dé −10,0 con `contratos_sin_tarifa == 0` es la prueba.
    """
    from app.plataforma_metricas import _mapa_tipos_de_sede

    _ids, cab = _escenario_spread(client, monkeypatch)
    mapa = _mapa_tipos_de_sede(_A_NAVE, "NAVE")

    assert mapa["NAVE-GON-01"] == ("NAVE", "gondola")
    assert mapa["NAVE-GON-01-B"] == ("NAVE", "gondola")   # misma sede, mismo tipo

    m = _fila(_pedir(client, cab), "clia")["metricas"]
    assert m["contratos_sin_tarifa"] == 0
    assert m["spread_pct"] == A_SPREAD


def test_05b_un_tipo_sin_entrada_en_la_tarifa_cuenta_como_sin_tarifa(client, monkeypatch):
    """Tarifa configurada para `gondola` y un contrato sobre una `nevera`: el
    mueble está en el plano, pero su TIPO no tiene tarifa -> `contratos_sin_tarifa`.
    """
    from app.plataforma_metricas import limpiar_cache_metricas

    ids = Identidades(client)
    _fundar(ids, "uid-n", "duena@n.co", "clin", "Cliente Nevera")
    fixtures = _gondolas("NAVE", 2) + [{"code": "NEV-01", "type": "nevera", "sede": "NAVE"}]
    _sembrar("clin", {"NAVE": fixtures}, [
        ("NAVE-GON-01", "Alpina", INI, FIN, 900_000.0, True),
        ("NAVE-GON-01-B", "Alpina", INI, FIN, 900_000.0, True),
        ("NAVE-GON-02", "Bimbo", INI, FIN, 900_000.0, True),
        ("NAVE-NEV-01", "Bimbo", INI, FIN, 400_000.0, True),
    ])
    _tarifar("clin", default={"gondola": 1_000_000})   # sin entrada para "nevera"
    consola = _operador_sin_membresias(ids, monkeypatch)
    limpiar_cache_metricas()

    m = _fila(_pedir(client, _cab(consola["token"])), "clin")["metricas"]
    # El spread lo arman SÓLO las 3 góndolas: 2.700.000 / 3.000.000 -> −10,0
    assert m["spread_pct"] == -10.0
    assert m["contratos_sin_tarifa"] == 1
    assert m["ingreso_contratado_mes"] == 3_100_000.0   # la nevera sí suma plata


# ════════════════════════════════════════════════════════════════════════════
# 6-8 · El CONSOLIDADO
# ════════════════════════════════════════════════════════════════════════════

def test_06_consolidado_ponderado_incluye_al_cliente_chico(client, monkeypatch):
    """Σ canon_con_tarifa / Σ tarifa sobre TODOS los clientes con tarifa — A, B
    y D los tres, B (el cliente chico, 2 contratos) incluido.

    Hasta la Fase 6, B quedaba AFUERA del consolidado del spread porque su
    propio spread estaba suprimido por K=3 (H-1: si hubiera entrado, se habría
    podido despejar por diferencia contra A y D). Fase 7 quita el umbral en
    los dos niveles: B publica su propio spread exacto (−10,0) y el
    consolidado lo suma como a cualquier otro — ya no hay nada que despejar
    por diferencia, porque no hay nada escondido.
    """
    _ids, cab = _escenario_spread(client, monkeypatch)
    cuerpo = _pedir(client, cab)
    cons = cuerpo["consolidado"]

    # A mano, A + B + D: 9.800.000 / 12.000.000 = 0,81666…  ->  −18,3
    assert (CONS_CANON_CT, CONS_TARIFA_T) == (9_800_000.0, 12_000_000.0)
    assert round((CONS_CANON_CT / CONS_TARIFA_T - 1) * 100, 1) == CONS_SPREAD

    assert cons["spread_pct"] == CONS_SPREAD
    assert cons["clientes_con_tarifa"] == CONS_CLIENTES_CON_TARIFA

    # La cuenta EQUIVOCADA da otro número: si el consolidado promediara los
    # spreads publicados (A, B y D — los tres, ninguno suprimido), saldría
    # −14,77 y no −18,3.
    publicados = [c["metricas"]["spread_pct"] for c in cuerpo["clientes"]
                  if c["metricas"] and c["metricas"]["spread_pct"] is not None]
    assert sorted(publicados) == sorted([A_SPREAD, B_SPREAD, D_SPREAD])
    assert round(sum(publicados) / len(publicados), 2) == CONS_PROMEDIO_DE_SPREADS
    assert cons["spread_pct"] != CONS_PROMEDIO_DE_SPREADS

    # Y B SÍ aparece en su propia fila, exacto: nada que despejar por diferencia.
    b = _fila(cuerpo, "clib")["metricas"]
    assert b["spread_pct"] == B_SPREAD

    # El cliente ROTO no suma ni cuenta.
    assert cuerpo["consolidado"]["clientes_con_error"] == 1
    assert _fila(cuerpo, "roto")["metricas"] is None


def test_07_el_consolidado_es_null_solo_sin_ningun_contrato_con_tarifa(client, monkeypatch):
    """`spread_pct` es `null` SÓLO por ausencia de dato: sin tarifa configurada
    o sin contratos con tarifa aplicable — nunca por un umbral (Fase 7)."""
    from app.plataforma_metricas import limpiar_cache_metricas

    ids = Identidades(client)
    _fundar(ids, "uid-b", "duena@b.co", "clib", "Cliente B")
    _sembrar("clib", {"NAVE": _B_NAVE}, _B_CONTRATOS)
    _tarifar("clib", default={"gondola": 1_000_000})
    consola = _operador_sin_membresias(ids, monkeypatch)
    limpiar_cache_metricas()

    cons = _pedir(client, _cab(consola["token"]))["consolidado"]
    # 2 contratos con tarifa, sin umbral: el consolidado publica exacto,
    # igual que la fila de B (test_02).
    assert cons["spread_pct"] == B_SPREAD
    assert cons["clientes_con_tarifa"] == 1


def test_08_redondeo_a_un_decimal_sin_ruido_de_coma_flotante(client, monkeypatch):
    """3 contratos a 333.333 contra 1.000.000: 999.999/3.000.000 = 0,333333.

    (0,333333 − 1) × 100 = −66,6667  ->  un decimal: −66,7. Ni −66,66666666667
    ni −66,60000000000001.
    """
    from app.plataforma_metricas import limpiar_cache_metricas

    ids = Identidades(client)
    _fundar(ids, "uid-r", "duena@r.co", "clir", "Cliente Redondeo")
    _sembrar("clir", {"NAVE": _gondolas("NAVE", 2)}, [
        ("NAVE-GON-01", "Alpina", INI, FIN, 333_333.0, True),
        ("NAVE-GON-01-B", "Alpina", INI, FIN, 333_333.0, True),
        ("NAVE-GON-02", "Bimbo", INI, FIN, 333_333.0, True),
    ])
    _tarifar("clir", default={"gondola": 1_000_000})
    consola = _operador_sin_membresias(ids, monkeypatch)
    limpiar_cache_metricas()

    esperado = round((999_999.0 / 3_000_000.0 - 1) * 100, 1)
    assert esperado == -66.7
    m = _fila(_pedir(client, _cab(consola["token"])), "clir")["metricas"]
    assert m["spread_pct"] == esperado
    # Un decimal, literalmente: el JSON no puede traer 15 dígitos de ruido.
    assert len(str(abs(m["spread_pct"])).split(".")[1]) == 1


def test_08b_ningun_valor_absoluto_de_tarifa_sale_al_json(client, monkeypatch):
    """La spec es taxativa: ni la tarifa, ni Σ tarifa, ni nada derivado de ella
    en valores absolutos. Grep numérico del cuerpo entero."""
    _ids, cab = _escenario_spread(client, monkeypatch)
    cuerpo = _pedir(client, cab)
    numeros = set(_todos_los_numeros(cuerpo))

    for monto in TARIFAS_SEMBRADAS:
        assert monto not in numeros, f"la tarifa {monto:,.0f} se filtró al JSON"
    for sigma in (A_TARIFA_T, B_TARIFA_T, D_TARIFA_T, CONS_TARIFA_T):
        assert sigma not in numeros, f"Σ tarifa {sigma:,.0f} se filtró al JSON"


# ════════════════════════════════════════════════════════════════════════════
# 9 · /tendencia NO gana los campos nuevos
# ════════════════════════════════════════════════════════════════════════════

def test_09_la_tendencia_no_trae_los_campos_del_spread(client, monkeypatch):
    """El histórico del spread está FUERA DE ALCANCE (SIN MIGRACIONES): ni un
    punto de la serie —ni por cliente ni consolidada— puede traerlos."""
    _ids, cab = _escenario_spread(client, monkeypatch)
    _pedir(client, cab)   # deja el snapshot del período

    for consulta in ("cliente=clia", "cliente=__consolidado__"):
        r = client.get(f"/api/plataforma/tendencia?{consulta}&meses=3", headers=cab)
        assert r.status_code == 200, r.text
        cuerpo = r.json()
        for punto in cuerpo["serie"]:
            for campo in ("spread_pct", "tarifa_configurada", "contratos_sin_tarifa"):
                assert campo not in punto, f"{campo} apareció en {consulta}"
                assert campo not in (punto.get("metricas") or {}), f"{campo} en {consulta}"
        assert "spread_pct" not in json.dumps(cuerpo)


# ════════════════════════════════════════════════════════════════════════════
# ESCENARIO DE ADOPCIÓN, CALCULADO A MANO
# ════════════════════════════════════════════════════════════════════════════
#
# Un cliente por clasificación, más los dos bordes de los 30 días. Todos con
# alta vieja (200 días) salvo el que prueba `nueva`.
#
#   slug      contratos  último login   alta        -> clasificación esperada
#   ────────────────────────────────────────────────────────────────────────
#   afantasma    sí       hace 45 d     hace 200 d     fantasma
#   bactiva      sí       hace  3 d     hace 200 d     activa
#   cnueva       sí       nunca         hace  10 d     nueva  (gana a fantasma)
#   dsincuenta   sí       hace  3 d     hace 200 d     sin_cuentas (membresía OFF)
#   edormida     no       hace 60 d     hace 200 d     dormida
#   fnunca       sí       nunca         hace 200 d     fantasma, dias_sin_acceso null
#   gborde30     no       hace 30 d     hace 200 d     activa   (contrato: ≥ hoy−30)
#   hborde alta  sí       hace 45 d     hace  30 d     fantasma (30 NO es "< 30")
#
# "galerias" viene con la instalación: 0 membresías -> sin_cuentas.

ADOPCION_ESPERADA = {
    "afantasma": "fantasma",
    "bactiva": "activa",
    "cnueva": "nueva",
    "dsincuenta": "sin_cuentas",
    "edormida": "dormida",
    "fnunca": "fantasma",
    "hbordealta": "fantasma",
    "galerias": "sin_cuentas",
}


def _hoy():
    return datetime.now(timezone.utc).date()


def _poner_login(slug, dias):
    """``ultimo_login`` de TODOS los usuarios de ``slug`` a hace ``dias`` días
    (``None`` = nunca entró)."""
    from app.clientes import sesion_registro
    from app.models.identidad import Membresia, Usuario

    cuando = None if dias is None else datetime.now(timezone.utc) - timedelta(days=dias)
    reg = sesion_registro()
    try:
        ids = [f[0] for f in reg.query(Membresia.usuario_id)
               .filter(Membresia.cliente_slug == slug).all()]
        for uid in ids:
            u = reg.query(Usuario).filter(Usuario.id == uid).first()
            u.ultimo_login = cuando
        reg.commit()
    finally:
        reg.close()


def _poner_alta(slug, dias=None, fecha=None):
    """La ``Fundacion.creado_en`` del slug: hace ``dias`` días, o en ``fecha``."""
    from app.clientes import sesion_registro
    from app.models.plataforma import Fundacion

    if fecha is not None:
        cuando = datetime(fecha.year, fecha.month, fecha.day, 12, 0, tzinfo=timezone.utc)
    else:
        cuando = datetime.now(timezone.utc) - timedelta(days=dias)
    reg = sesion_registro()
    try:
        for f in reg.query(Fundacion).filter(Fundacion.cliente_slug == slug).all():
            f.creado_en = cuando
        reg.commit()
    finally:
        reg.close()


def _sin_fundacion(slug, creado=None):
    """Borra las fundaciones del slug y fija ``ClienteRow.creado`` (o lo anula)."""
    from app.clientes import sesion_registro
    from app.models.models import ClienteRow
    from app.models.plataforma import Fundacion

    reg = sesion_registro()
    try:
        reg.query(Fundacion).filter(Fundacion.cliente_slug == slug).delete()
        fila = reg.query(ClienteRow).filter(ClienteRow.slug == slug).first()
        fila.creado = (
            None if creado is None
            else datetime(creado.year, creado.month, creado.day, 12, 0, tzinfo=timezone.utc)
        )
        reg.commit()
    finally:
        reg.close()


def _desactivar_membresias(slug):
    from app.clientes import sesion_registro
    from app.models.identidad import Membresia

    reg = sesion_registro()
    try:
        for m in reg.query(Membresia).filter(Membresia.cliente_slug == slug).all():
            m.activo = False
        reg.commit()
    finally:
        reg.close()


_UN_CONTRATO = [("NAVE-GON-01", "Alpina", INI, FIN, 900_000.0, True)]


def _escenario_adopcion(client, monkeypatch):
    from app.plataforma_metricas import limpiar_cache_metricas

    ids = Identidades(client)
    plan = [
        # slug,        con_contratos, login_hace, alta_hace
        ("afantasma",  True,  45,   200),
        ("bactiva",    True,   3,   200),
        ("cnueva",     True,  None,  10),
        ("dsincuenta", True,   3,   200),
        ("edormida",   False, 60,   200),
        ("fnunca",     True,  None, 200),
        ("gborde30",   False, 30,   200),
        ("hbordealta", True,  45,    30),
    ]
    for i, (slug, con_contratos, login, alta) in enumerate(plan):
        _fundar(ids, f"uid-{slug}", f"duena@{slug}.co", slug, slug.upper())
        _sembrar(slug, {"NAVE": _gondolas("NAVE", 1)},
                 _UN_CONTRATO if con_contratos else [])
        _poner_login(slug, login)
        _poner_alta(slug, dias=alta)
    _desactivar_membresias("dsincuenta")
    # "galerias" viene con la instalación y no tiene fundación. Se le anula la
    # fecha para que su cohorte sea `null` y no el mes en curso: así el
    # escenario no cambia de forma según el día en que corra la suite.
    _sin_fundacion("galerias", creado=None)

    consola = _operador_sin_membresias(ids, monkeypatch)
    limpiar_cache_metricas()
    return ids, _cab(consola["token"])


def _adopcion(client, cab):
    r = client.get("/api/plataforma/adopcion", headers=cab)
    assert r.status_code == 200, r.text
    return r.json()


def _cli(cuerpo, slug):
    return next(c for c in cuerpo["clientes"] if c["slug"] == slug)


# ════════════════════════════════════════════════════════════════════════════
# 10 · Clasificación de adopción
# ════════════════════════════════════════════════════════════════════════════

def test_10_forma_de_la_respuesta_de_adopcion(client, monkeypatch):
    _ids, cab = _escenario_adopcion(client, monkeypatch)
    cuerpo = _adopcion(client, cab)

    assert set(cuerpo) == {"periodo", "generado_en", "cohortes", "clientes"}
    assert cuerpo["periodo"] == _periodo()
    for c in cuerpo["clientes"]:
        assert set(c) == {
            "slug", "nombre", "estado_cuenta", "error", "cohorte", "clasificacion",
            "usuarios_con_cuenta", "usuarios_activos_30d", "dias_sin_acceso",
            "con_contratos_activos",
        }
        assert c["clasificacion"] in (
            "nueva", "activa", "fantasma", "dormida", "sin_cuentas",
        )
        assert c["dias_sin_acceso"] is None or isinstance(c["dias_sin_acceso"], int)
    for f in cuerpo["cohortes"]:
        assert set(f) == {
            "cohorte", "clientes", "retencion_30d_pct",
            "nueva", "activa", "fantasma", "dormida", "sin_cuentas",
        }
    # Ningún correo, nombre ni id de usuario en el cuerpo.
    assert "@" not in json.dumps(cuerpo, ensure_ascii=False)


def test_10a_cada_clasificacion_contra_lo_sembrado(client, monkeypatch):
    _ids, cab = _escenario_adopcion(client, monkeypatch)
    cuerpo = _adopcion(client, cab)

    obtenido = {c["slug"]: c["clasificacion"] for c in cuerpo["clientes"]}
    for slug, esperada in ADOPCION_ESPERADA.items():
        assert obtenido[slug] == esperada, f"{slug}: esperaba {esperada}, dio {obtenido[slug]}"


def test_10b_dias_sin_acceso_y_usuarios_activos(client, monkeypatch):
    _ids, cab = _escenario_adopcion(client, monkeypatch)
    cuerpo = _adopcion(client, cab)

    assert _cli(cuerpo, "afantasma")["dias_sin_acceso"] == 45
    assert _cli(cuerpo, "afantasma")["usuarios_activos_30d"] == 0
    assert _cli(cuerpo, "bactiva")["dias_sin_acceso"] == 3
    assert _cli(cuerpo, "bactiva")["usuarios_activos_30d"] == 1
    # Nunca entró nadie: `null`, no 0 y no una fecha inventada.
    assert _cli(cuerpo, "fnunca")["dias_sin_acceso"] is None
    assert _cli(cuerpo, "fnunca")["con_contratos_activos"] is True
    assert _cli(cuerpo, "edormida")["con_contratos_activos"] is False
    # La membresía DESACTIVADA no cuenta como cuenta.
    assert _cli(cuerpo, "dsincuenta")["usuarios_con_cuenta"] == 0
    assert _cli(cuerpo, "dsincuenta")["dias_sin_acceso"] is None


def test_10c_nueva_gana_a_fantasma(client, monkeypatch):
    """`cnueva` tiene contratos activos y CERO accesos: sin la precedencia de
    la spec saldría `fantasma` y la consola llamaría a un cliente de 10 días."""
    _ids, cab = _escenario_adopcion(client, monkeypatch)
    c = _cli(_adopcion(client, cab), "cnueva")

    assert c["con_contratos_activos"] is True
    assert c["dias_sin_acceso"] is None
    assert c["clasificacion"] == "nueva"


def test_10d_alta_de_exactamente_30_dias_ya_no_es_nueva(client, monkeypatch):
    """El borde de arriba: "alta hace MENOS de 30 días". 30 no es menos de 30."""
    _ids, cab = _escenario_adopcion(client, monkeypatch)
    c = _cli(_adopcion(client, cab), "hbordealta")

    assert c["clasificacion"] == "fantasma"


# HALLAZGO A1 (arreglado en el cierre de la fase): `plataforma_adopcion.py`
# usaba `< DIAS_RECIENTE`; el contrato dice `ultimo_login.date() >= hoy - 30`,
# que incluye el día 30. Ahora es `<=` y este test lo fija.
def test_10e_login_de_exactamente_30_dias_es_activa(client, monkeypatch):
    _ids, cab = _escenario_adopcion(client, monkeypatch)
    c = _cli(_adopcion(client, cab), "gborde30")

    # A mano: hoy − 30 días es el último día que el contrato acepta (≥).
    assert c["dias_sin_acceso"] == 30
    assert c["usuarios_activos_30d"] == 1
    assert c["clasificacion"] == "activa"


# ════════════════════════════════════════════════════════════════════════════
# 11-12 · Cohortes, retención y orden
# ════════════════════════════════════════════════════════════════════════════
#
#   slug     fuente de la fecha de alta        -> cohorte
#   ─────────────────────────────────────────────────────
#   koa      Fundacion 2025-01-10                 2025-01   (login hace 2 d)
#   kob      Fundacion 2025-01-25                 2025-01   (login hace 90 d)
#   kod      Fundacion 2025-01-08                 2025-01   (nunca entró)
#   koc      Fundacion 2025-03-05                 2025-03   (nunca entró)
#   koe      SIN Fundacion, ClienteRow NULL       null      (nunca entró)
#   galerias SIN Fundacion, ClienteRow NULL       null      (0 membresías)
#
# El caso "sin Fundacion pero CON ClienteRow.creado" va aparte, en
# `test_11c_*`: hoy revienta el endpoint (HALLAZGO A2) y no puede convivir con
# el resto del escenario.
#
#   Cohorte 2025-01: 3 clientes, 1 con acceso en 30 d -> 1×100/3 = 33,333… -> 33,3
#   Cohorte 2025-03: 1 cliente, 0 activos            -> 0,0
#   Cohorte null:    2 clientes, 0 activos           -> 0,0
#   Orden: ["2025-01", "2025-03", null]

COH_ENE = "2025-01"
COH_MAR = "2025-03"
COH_ENE_CLIENTES = 3
COH_ENE_RETENCION = 33.3       # round(1 × 100 / 3, 1)


def _escenario_cohortes(client, monkeypatch):
    from app.plataforma_metricas import limpiar_cache_metricas

    ids = Identidades(client)
    for slug in ("koa", "kob", "koc", "kod", "koe"):
        _fundar(ids, f"uid-{slug}", f"duena@{slug}.co", slug, slug.upper())
        _sembrar(slug, {"NAVE": _gondolas("NAVE", 1)}, [])

    _poner_alta("koa", fecha=date(2025, 1, 10))
    _poner_login("koa", 2)
    _poner_alta("kob", fecha=date(2025, 1, 25))
    _poner_login("kob", 90)
    _poner_alta("koc", fecha=date(2025, 3, 5))
    _poner_login("koc", None)
    _poner_alta("kod", fecha=date(2025, 1, 8))
    _poner_login("kod", None)
    _sin_fundacion("koe", creado=None)
    _poner_login("koe", None)
    _sin_fundacion("galerias", creado=None)

    consola = _operador_sin_membresias(ids, monkeypatch)
    limpiar_cache_metricas()
    return ids, _cab(consola["token"])


def test_11_cohorte_por_mes_de_alta_con_las_dos_fuentes(client, monkeypatch):
    _ids, cab = _escenario_cohortes(client, monkeypatch)
    cuerpo = _adopcion(client, cab)
    por_slug = {c["slug"]: c["cohorte"] for c in cuerpo["clientes"]}

    assert por_slug["koa"] == COH_ENE          # Fundacion
    assert por_slug["kob"] == COH_ENE          # Fundacion, mismo mes
    assert por_slug["kod"] == COH_ENE          # Fundacion, mismo mes (tercero)
    assert por_slug["koc"] == COH_MAR          # Fundacion, otro mes
    assert por_slug["koe"] is None             # ninguna de las dos -> no se inventa
    assert por_slug["galerias"] is None


def test_11c_cliente_sin_fundacion_usa_la_fecha_de_ClienteRow(client, monkeypatch):
    """La segunda fuente de la cohorte, la de los clientes pre-alta self-service.

    REGRESIÓN del HALLAZGO A2 (detectado por esta auditoría el 2026-09-05 y
    corregido por el builder en `plataforma_adopcion.py:106-111` durante la
    misma sesión): `datetime` es subclase de `date`, así que el guard original
    ``not isinstance(alta, date)`` NUNCA reducía ``ClienteRow.creado`` a día y
    ``(hoy - alta).days`` reventaba con ``TypeError: unsupported operand
    type(s) for -: 'datetime.date' and 'datetime.datetime'``. Dispara con
    CUALQUIER cliente sin ``Fundacion`` —todo el parque anterior al alta
    self-service, el "galerias" de la instalación incluido— y tumbaba el
    endpoint ENTERO con un 500, no sólo esa fila. Este test lo fija.
    """
    from app.plataforma_metricas import limpiar_cache_metricas

    ids = Identidades(client)
    _fundar(ids, "uid-viejo", "duena@viejo.co", "viejo", "Viejo")
    _sembrar("viejo", {"NAVE": _gondolas("NAVE", 1)}, [])
    _poner_login("viejo", None)
    _sin_fundacion("viejo", creado=date(2024, 7, 21))
    _sin_fundacion("galerias", creado=None)
    consola = _operador_sin_membresias(ids, monkeypatch)
    limpiar_cache_metricas()

    cuerpo = _adopcion(client, _cab(consola["token"]))
    assert _cli(cuerpo, "viejo")["cohorte"] == "2024-07"


def test_11b_retencion_y_desglose_de_cada_cohorte(client, monkeypatch):
    _ids, cab = _escenario_cohortes(client, monkeypatch)
    cuerpo = _adopcion(client, cab)
    por_cohorte = {c["cohorte"]: c for c in cuerpo["cohortes"]}

    enero = por_cohorte[COH_ENE]
    assert enero["clientes"] == COH_ENE_CLIENTES
    # A mano: 1 de 3 con acceso en los últimos 30 días -> 33,3
    assert round(1 * 100.0 / 3, 1) == COH_ENE_RETENCION
    assert enero["retencion_30d_pct"] == COH_ENE_RETENCION

    assert por_cohorte[COH_MAR]["clientes"] == 1
    assert por_cohorte[COH_MAR]["retencion_30d_pct"] == 0.0
    assert por_cohorte[None]["clientes"] == 2

    # La suma de las CINCO clasificaciones tiene que dar el total de la cohorte,
    # y la suma de las cohortes, el total de clientes.
    clasifs = ("nueva", "activa", "fantasma", "dormida", "sin_cuentas")
    for fila in cuerpo["cohortes"]:
        assert sum(fila[k] for k in clasifs) == fila["clientes"], fila
    assert sum(f["clientes"] for f in cuerpo["cohortes"]) == len(cuerpo["clientes"])


def test_12_orden_de_cohortes_y_de_clientes(client, monkeypatch):
    """Cohortes ascendente con la `null` AL FINAL; clientes con los fantasmas
    primero — la lista es "a quién llamar hoy", no un índice alfabético."""
    _ids, cab = _escenario_cohortes(client, monkeypatch)
    assert [c["cohorte"] for c in _adopcion(client, cab)["cohortes"]] == [
        COH_ENE, COH_MAR, None,
    ]

    _ids2, cab2 = _escenario_adopcion(client, monkeypatch)
    cuerpo = _adopcion(client, cab2)
    orden = {"fantasma": 0, "dormida": 1, "sin_cuentas": 2, "nueva": 3, "activa": 4}
    clave = [(orden[c["clasificacion"]], c["slug"]) for c in cuerpo["clientes"]]
    assert clave == sorted(clave)
    assert cuerpo["clientes"][0]["clasificacion"] == "fantasma"
