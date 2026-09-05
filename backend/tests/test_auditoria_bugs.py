"""Auditoría integral post Fase 6 — Dimensión 5: bugs en los últimos cambios
(Fases 4-6, #41-#46).

Territorio EXCLUSIVO de este archivo: `bugs-N`. NO repite lo que ya cubren
`test_tendencia_conciliacion.py`, `test_metricas_conciliacion.py`,
`test_asesoria_contador.py`, `test_plataforma_adopcion.py` ni
`test_plataforma_spread.py` — en particular, NO vuelve a probar el BUG-1
"consolidado congelado no incluye al cliente que llegó después"
(`test_BUG_consolidado_congelado_no_incluye_al_cliente_que_llego_despues`,
ya arreglado) ni H-4 (ventana de 30 días inclusive de adopción, ya cubierta en
`test_asesoria_contador.py` 10e).

Lo que este archivo SÍ encuentra: el arreglo de BUG-1
(`app/plataforma_tendencia.py::persistir_snapshots`, rama `hubo_alta`) dice en
su propio comentario que la consolidada de un mes pasado "se reconstruye a
partir de TODAS las filas por cliente YA PERSISTIDAS" — pero cuando la
reconstrucción toma la rama "exacta" (`slugs_persistidos <=
crudos_por_slug.keys()`), en realidad usa `crudos_por_slug[slug]`, que son los
crudos que ESTA CAPTURA acaba de calcular en vivo contra la base de HOY, no lo
que está escrito en el disco para ese cliente. Si un cliente YA tenía su fila
congelada de un mes pasado y su base cambió DESPUÉS de esa captura (un
contrato nuevo, cancelado, editado), la próxima vez que este mes pasado
dispare la rama `hubo_alta` (porque otro cliente llegó tarde), el
`consolidado` se recalcula con los datos DE HOY de ese primer cliente, no con
los que quedaron congelados en su propia fila -- rompiendo exactamente la
garantía que ESTADO.md promete ("El total nunca puede contradecir a sus
sumandos, ni siquiera congelado").

Helpers copiados de `tests/test_plataforma_metricas.py` /
`tests/test_tendencia_conciliacion.py` a propósito (mismo criterio que ese
archivo: un test de auditoría que importa del código que audita comparte sus
errores).
"""
import json
from datetime import date
from types import SimpleNamespace

import pytest


# ════════════════════════════════════════════════════════════════════════════
# Andamiaje
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
                monthly_rent=canon,
                is_active=activo,
            ))
        db.commit()
    finally:
        db.close()


def _cancelar_contrato(slug, codigo, proveedor):
    """Marca `is_active=False` un contrato existente -- simula que el cliente
    lo canceló/editó DESPUÉS de que su mes ya quedó congelado."""
    from app.clientes import buscar, sesion_de
    from app.models.models import Space, SpaceLease, Supplier

    cliente = buscar(slug)
    db = sesion_de(cliente)
    try:
        espacio = db.query(Space).filter(Space.code == codigo).first()
        proveedor_fila = db.query(Supplier).filter(Supplier.name == proveedor).first()
        lease = (
            db.query(SpaceLease)
            .filter(SpaceLease.space_id == espacio.id, SpaceLease.supplier_id == proveedor_fila.id)
            .first()
        )
        assert lease is not None
        lease.is_active = False
        db.commit()
    finally:
        db.close()


def _tres_meses():
    from app.plataforma_metricas import periodo_actual
    from app.plataforma_tendencia import periodo_anterior

    m = periodo_actual()
    m1 = periodo_anterior(m)
    m2 = periodo_anterior(m1)
    return m2, m1, m


def _limites(periodo):
    from app.plataforma_metricas import rango_del_periodo

    d, h = rango_del_periodo(periodo)
    return d.isoformat(), h.isoformat()


def _metricas(client, cab, periodo):
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


def _purgar_snapshots():
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
                "slug": f.cliente_slug, "periodo": f.periodo,
                "contratos": f.contratos_activos, "canon": f.canon_total,
            }
            for f in q.all()
        ]
    finally:
        reg.close()


_PLANO_K = [
    {"code": "PUN-01", "type": "punta", "sede": "NAVE"},
    {"code": "PUN-02", "type": "punta", "sede": "NAVE"},
    {"code": "GON-01", "type": "gondola", "gondolaType": "double", "sede": "NAVE"},
    {"code": "CHK-01", "type": "checkout", "sede": "NAVE"},
]


# ════════════════════════════════════════════════════════════════════════════
# bugs-1 (CONFIRMADA, alta): la reconstrucción "exacta" de BUG-1 usa datos
# DE HOY de un cliente ya congelado, no lo que quedó escrito en su fila.
# ════════════════════════════════════════════════════════════════════════════

def test_bugs_1_reconstruccion_exacta_usa_datos_de_hoy_no_lo_congelado(client, monkeypatch):
    """Guion, con los números a mano:

    1) `acme` (ya existe) tiene en M-1 tres contratos por 600 (100+200+300;
       el conteo no importa desde Fase 7, sin umbral -- se mantiene por
       continuidad con el resto del escenario). Se pide `/metricas?periodo=M-1`:
       la fila de `acme` en `snapshot_metricas` queda CONGELADA con
       `canon_total=600`, `contratos_activos=3`. El consolidado también queda
       en 600.

    2) Después de esa captura, alguien CANCELA uno de los contratos de `acme`
       en M-1 (`is_active=False`) -- la fila `acme` en disco no se toca (mes
       pasado, ya existía): sigue en 600, para siempre, por diseño.

    3) Se funda `beta`, con 3 contratos propios de M-1 por 900 (300+300+300),
       retroactivos. Nunca tuvo fila en M-1: es un alta tardía.

    4) Se pide `/metricas?periodo=M-1` de nuevo. Esto dispara `hubo_alta`
       (la fila de `beta` se INSERTA) y por lo tanto la reconstrucción del
       consolidado de M-1 (arreglo de BUG-1, iteración 2).

    ESPERADO (lo que ESTADO.md promete: "el total nunca puede contradecir a
    sus sumandos, ni siquiera congelado"): el consolidado reconstruido debe
    sumar EXACTAMENTE lo que dicen las filas por cliente que quedan
    PERSISTIDAS -- acme (congelada, 600, con su contrato cancelado ya fuera
    de la cuenta porque `_contratos_activos` filtra `is_active`... pero acá
    la fila de acme YA estaba escrita en 600 antes de la cancelación, así que
    lo persistido para acme sigue siendo 600) + beta (900) = 1.500.

    OBTENIDO (antes del arreglo): el código reconstruía con
    `crudos_por_slug[slug]`, que son los crudos que ESA CAPTURA calculó EN VIVO
    contra la base de acme tal como estaba AHORA (con el contrato cancelado,
    dos contratos activos, 300 de canon) -- no lo que la fila de acme tiene
    escrito en disco. El consolidado salía en 900 (beta) + 300 (acme
    recalculado) = 1.200, que NO es la suma de lo que efectivamente quedó
    persistido por cliente (1.500).

    ARREGLADO (iteración 3 de BUG-1, `_reconstruir_consolidado`): la fuente de
    verdad de un cliente que YA tenía fila es SU FILA EN DISCO; sólo los slugs
    recién insertados en ESTA captura salen de la memoria. El consolidado dice
    1.500 y `/tendencia` cierra: acme + beta == consolidado.
    """
    ids = Identidades(client)
    _fundar(ids, "uid-acme", "duena@acme.co", "acme", "Acme")
    _m2, m1, _m = _tres_meses()
    d1, h1 = _limites(m1)

    _sembrar("acme", {"NAVE": _PLANO_K}, [
        ("NAVE-PUN-01", "Alpina",  d1, h1, 100.0, True),
        ("NAVE-PUN-02", "Bimbo",   d1, h1, 200.0, True),
        ("NAVE-GON-01", "Nutresa", d1, h1, 300.0, True),
    ])

    consola = _operador_sin_membresias(ids, monkeypatch)
    cab = _cab(consola["token"])
    _purgar_snapshots()

    # 1) Se congela M-1 con acme en 600 / 3 contratos.
    _metricas(client, cab, m1)
    fila_acme_antes = _filas_snapshot("acme", m1)[0]
    assert fila_acme_antes["canon"] == 600.0
    assert fila_acme_antes["contratos"] == 3

    # 2) Se cancela un contrato de acme en M-1 DESPUÉS de la captura. La base
    # de acme, HOY, dice 2 contratos activos / 300 -- pero su fila en disco
    # sigue en 600 (nadie la va a tocar: mes pasado, ya existía).
    _cancelar_contrato("acme", "NAVE-GON-01", "Nutresa")

    # 3) beta funda con historia retroactiva en M-1: 3 contratos, 900.
    _fundar(ids, "uid-beta", "duena@beta.co", "beta", "Beta")
    _sembrar("beta", {"NAVE": _PLANO_K}, [
        ("NAVE-PUN-01", "Alpina", d1, h1, 300.0, True),
        ("NAVE-PUN-02", "Bimbo",  d1, h1, 300.0, True),
        ("NAVE-GON-01", "Nutresa", d1, h1, 300.0, True),
    ])

    # 4) /metricas de M-1 otra vez: inserta la fila de beta (hubo_alta) y
    # dispara la reconstrucción del consolidado.
    _metricas(client, cab, m1)

    fila_acme_despues = _filas_snapshot("acme", m1)[0]
    fila_beta = _filas_snapshot("beta", m1)[0]
    fila_consolidado = _filas_snapshot("__consolidado__", m1)[0]

    # La fila de acme, POR CLIENTE, sigue congelada -- eso el arreglo de
    # BUG-1 lo respeta.
    assert fila_acme_despues["canon"] == 600.0, "la fila por cliente no debería tocarse"
    assert fila_beta["canon"] == 900.0

    suma_de_lo_persistido = fila_acme_despues["canon"] + fila_beta["canon"]
    assert suma_de_lo_persistido == 1500.0

    assert fila_consolidado["canon"] == 1500.0, (
        "bugs-1: el consolidado reconstruido tiene que coincidir con la suma de "
        "sus propias filas por cliente persistidas (acme congelada 600 + beta "
        f"900 = 1500), no con los datos DE HOY de acme. Salió {fila_consolidado['canon']}."
    )
    assert fila_consolidado["canon"] == suma_de_lo_persistido
    # Y los contratos también: 3 congelados de acme + 3 de beta.
    assert fila_consolidado["contratos"] == 6, fila_consolidado

    # Y lo mismo por la API: el total no contradice a sus sumandos publicados.
    consolidado_tendencia = _punto(_tendencia(client, cab, meses=3), m1)
    acme_tendencia = _punto(_tendencia(client, cab, cliente="acme", meses=3), m1)
    beta_tendencia = _punto(_tendencia(client, cab, cliente="beta", meses=3), m1)

    assert acme_tendencia["ingreso_contratado_mes"] == 600.0
    assert beta_tendencia["ingreso_contratado_mes"] == 900.0
    assert consolidado_tendencia["ingreso_contratado_mes"] == 1500.0
    assert (
        acme_tendencia["ingreso_contratado_mes"] + beta_tendencia["ingreso_contratado_mes"]
        == consolidado_tendencia["ingreso_contratado_mes"]
    ), "bugs-1: consolidado y suma de clientes tienen que coincidir en /tendencia"
