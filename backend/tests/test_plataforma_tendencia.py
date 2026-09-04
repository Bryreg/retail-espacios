"""Fase 5: el snapshot mensual, el cierre automático y ``GET /api/plataforma/tendencia``.

Tres cosas se prueban acá, y son las tres patas del histórico:

* **El write-through** — mirar ``/metricas`` deja las filas de
  ``snapshot_metricas`` (una por cliente legible más la consolidada), repetir no
  duplica, el mes en curso converge y un mes ya pasado queda CONGELADO.
* **El cierre automático** — ``cerrar_mes_anterior()`` puebla el mes ya cerrado
  sin que nadie haya abierto la consola, es idempotente, lo llama de verdad
  ``_run_lease_maintenance()`` y sobrevive a un cliente con la base rota.
* **El endpoint** — N entradas siempre, el mes en curso marcado ``parcial``, la
  supresión K=3 aplicada MES A MES, el consolidado ponderado (Σ/Σ) contra
  números sembrados a mano, el saneo del nombre del proveedor, y la frontera del
  operador (403 / 404 / 422 + bitácora).

Los helpers de andamiaje son los de ``test_plataforma_metricas.py``, copiados a
propósito: cada archivo de pruebas se sostiene solo.

**Los períodos son RELATIVOS a ``periodo_actual()``**, nunca fechas fijas: la
serie termina siempre en el mes en curso, así que un ``"2026-09"`` escrito a mano
haría que este archivo empezara a fallar solo el mes que viene.
"""
import json
from datetime import date, datetime, timezone
from types import SimpleNamespace

# ─── Datos sembrados ─────────────────────────────────────────────────────────
#
# Los contratos se siembran con fechas que cubren un rango ancho (de hace tres
# años a dentro de tres años) para que el MISMO contrato esté activo en
# cualquier mes que la prueba pida: lo que se está probando es el snapshot, no
# otra vez el recorte por período —eso ya lo prueba `test_plataforma_metricas`—.
#
# ACME: 2 sedes con plano, 6 caras comercializables, 3 ocupadas, 4 contratos.
# BETA: 3 caras, 2 contratos -> por debajo de K=3, sus importes van suprimidos.

_NAVE = [
    {"code": "PUN-01", "type": "punta", "sede": "NAVE"},
    # Góndola doble sin `faceB`: son DOS caras vendibles igual.
    {"code": "GON-01", "type": "gondola", "gondolaType": "double", "sede": "NAVE"},
    {"code": "GON-02", "type": "gondola", "gondolaType": "wall", "sede": "NAVE"},
    {"code": "COL-01", "type": "columna", "sede": "NAVE", "rentable": False},
    {"code": "CHK-01", "type": "checkout", "sede": "NAVE"},
]
_SUR = [{"code": "PUN-01", "type": "punta", "sede": "SUR"}]

_SIEMPRE = ("2023-01-01", "2029-12-31")

# (código, proveedor, desde, hasta, canon, is_active)
_CONTRATOS_ACME = [
    ("NAVE-PUN-01", "Alpina", *_SIEMPRE, 1_000_000.0, True),
    ("NAVE-GON-01-B", "Alpina", *_SIEMPRE, 2_000_000.0, True),
    ("SUR-PUN-01", "Nutresa", *_SIEMPRE, 500_000.0, True),
    # El espacio NO está en el plano: suma plata y proveedor, no ocupación.
    ("FANTASMA-01", "Alpina", *_SIEMPRE, 400_000.0, True),
]

# BETA lleva DOS contratos a propósito: es lo que la regla de celda chica (K=3)
# NO deja publicar. Su nombre de proveedor trae un correo adentro, que es el
# caso que el saneo existe para tapar.
_BETA = [
    {"code": "E-01", "type": "punta", "sede": "BETA"},
    {"code": "E-02", "type": "punta", "sede": "BETA"},
    {"code": "E-03", "type": "punta", "sede": "BETA"},
]
PROVEEDOR_SUCIO = "Bimbo Distribuciones (ventas@bimbo.co)"
_CONTRATOS_BETA = [
    ("BETA-E-01", PROVEEDOR_SUCIO, *_SIEMPRE, 400_000.0, True),
    ("BETA-E-02", PROVEEDOR_SUCIO, *_SIEMPRE, 200_000.0, True),
]
# El tercero, que se agrega SÓLO en algunas pruebas para cruzar el umbral K=3.
_TERCERO_BETA = ("BETA-E-03", "Nutresa", *_SIEMPRE, 750_000.0, True)

# Lo que tiene que dar cada uno, calculado a mano:
ACME_CARAS, ACME_OCUPADAS, ACME_CONTRATOS = 6, 3, 4
ACME_INGRESO = 3_900_000.0
ACME_CANON = 975_000.0                       # 3.900.000 / 4

BETA_CARAS, BETA_OCUPADAS, BETA_CONTRATOS = 3, 2, 2
BETA_INGRESO = 600_000.0

# Consolidado con BETA en 2 contratos (galerias no tiene nada, roto va excluido):
CONS_CARAS = ACME_CARAS + BETA_CARAS                  # 9
CONS_OCUPADAS = ACME_OCUPADAS + BETA_OCUPADAS         # 5
CONS_CONTRATOS = ACME_CONTRATOS + BETA_CONTRATOS      # 6
CONS_INGRESO = ACME_INGRESO + BETA_INGRESO            # 4.500.000
CONS_CANON_PONDERADO = 750_000.0                      # 4.500.000 / 6
# La cuenta EQUIVOCADA (promedio de promedios): (975.000 + 300.000) / 2
CONS_PROMEDIO_DE_PROMEDIOS = 637_500.0
CONS_OCUPACION = 55.6                                 # 5 * 100 / 9, un decimal


# ─── Andamiaje (copiado de test_plataforma_metricas.py) ──────────────────────

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


def _operador_sin_membresias(ids: Identidades, monkeypatch, uid="uid-op", email="op@recabra.co"):
    """El dueño del SaaS: correo en ``OPERADOR_EMAILS`` y CERO membresías."""
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


def _romper(slug="roto", nombre="Roto"):
    """Un cliente cuya base NO se puede leer: fila en el registro + archivo basura."""
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


def _limpiar_snapshots():
    """Borra las filas de ``snapshot_metricas`` que dejó el arranque de la app.

    El ``lifespan`` corre ``_run_lease_maintenance`` apenas levanta el
    ``TestClient``, y eso ahora cierra el mes anterior (Fase 5) — con el único
    cliente que existe en ese instante, ``galerias``, porque la prueba funda los
    suyos DESPUÉS. Esas filas son correctas para el estado en que se tomaron,
    pero son ruido para lo que cada prueba quiere medir, y como corresponden a un
    mes pasado quedan CONGELADAS: el consolidado del mes anterior no se volvería a
    escribir aunque después aparecieran clientes nuevos.

    En producción el orden es el natural (los clientes existen mucho antes de que
    el ciclo cierre un mes); acá se limpia para que cada prueba arranque desde
    una tabla vacía y mida lo suyo.
    """
    from app.clientes import sesion_registro
    from app.models.plataforma import SnapshotMetricas

    reg = sesion_registro()
    try:
        reg.query(SnapshotMetricas).delete()
        reg.commit()
    finally:
        reg.close()


def _escenario(client, monkeypatch, con_roto=True):
    """galerias (vacío) + acme + beta (+ roto), y el operador de la consola."""
    from app.plataforma_metricas import limpiar_cache_metricas

    ids = Identidades(client)
    _fundar(ids, "uid-acme", "duena@acme.co", "acme", "Acme")
    _fundar(ids, "uid-beta", "dueno@beta.co", "beta", "Beta")
    _sembrar("acme", {"NAVE": _NAVE, "SUR": _SUR, "VACIA": []}, _CONTRATOS_ACME)
    _sembrar("beta", {"BETA": _BETA}, _CONTRATOS_BETA)
    if con_roto:
        _romper()
    consola = _operador_sin_membresias(ids, monkeypatch)
    limpiar_cache_metricas()
    _limpiar_snapshots()
    return ids, _cab(consola["token"])


# ─── Ayudas propias de esta fase ─────────────────────────────────────────────

def _actual():
    from app.plataforma_metricas import periodo_actual

    return periodo_actual()


def _anterior(anio_mes=None):
    from app.plataforma_tendencia import periodo_anterior

    return periodo_anterior(anio_mes or _actual())


def _pedir_metricas(client, cab, periodo):
    from app.plataforma_metricas import limpiar_cache_metricas

    # El caché de 5 minutos es por período; se limpia para que cada pedido sea
    # un CÁLCULO real, que es lo que dispara el write-through.
    limpiar_cache_metricas()
    r = client.get(f"/api/plataforma/metricas?periodo={periodo}", headers=cab)
    assert r.status_code == 200, r.text
    return r.json()


def _filas(periodo=None):
    """Las filas de ``snapshot_metricas``, indexadas por slug (de un período o todas)."""
    from app.clientes import sesion_registro
    from app.models.plataforma import SnapshotMetricas

    reg = sesion_registro()
    try:
        q = reg.query(SnapshotMetricas)
        if periodo is not None:
            q = q.filter(SnapshotMetricas.periodo == periodo)
        filas = q.all()
        # Se copian los campos a un dict simple: la sesión se cierra enseguida y
        # una instancia del ORM detached no se deja leer después.
        return {
            (f.cliente_slug if periodo is not None else (f.cliente_slug, f.periodo)): {
                "sedes_con_plano": f.sedes_con_plano,
                "espacios_comercializables": f.espacios_comercializables,
                "ocupadas": f.ocupadas,
                "contratos_activos": f.contratos_activos,
                "canon_total": f.canon_total,
                "usuarios": f.usuarios,
                "proveedores": json.loads(f.proveedores_json),
                "clientes_incluidos": f.clientes_incluidos,
                "clientes_con_error": f.clientes_con_error,
                "origen": f.origen,
                "capturado_en": f.capturado_en,
            }
            for f in filas
        }
    finally:
        reg.close()


def _tendencia(client, cab, cliente=None, meses=None, espera=200):
    partes = []
    if cliente is not None:
        partes.append(f"cliente={cliente}")
    if meses is not None:
        partes.append(f"meses={meses}")
    query = ("?" + "&".join(partes)) if partes else ""
    r = client.get(f"/api/plataforma/tendencia{query}", headers=cab)
    assert r.status_code == espera, r.text
    return r.json()


def _mes(cuerpo, periodo):
    return next(p for p in cuerpo["serie"] if p["periodo"] == periodo)


def _sembrar_fila(slug, periodo, **campos):
    """Una fila de snapshot puesta a mano, para armar meses pasados sin viajar en el tiempo."""
    from app.clientes import sesion_registro
    from app.models.plataforma import SnapshotMetricas

    valores = {
        "sedes_con_plano": 1,
        "espacios_comercializables": 10,
        "ocupadas": 5,
        "contratos_activos": 5,
        "canon_total": 1_000_000.0,
        "usuarios": 1,
        "proveedores_json": json.dumps({"Alpina": 5}),
        "clientes_incluidos": 1,
        "clientes_con_error": None,
        "origen": "cierre",
    }
    valores.update(campos)
    reg = sesion_registro()
    try:
        reg.add(SnapshotMetricas(
            cliente_slug=slug, periodo=periodo,
            capturado_en=datetime.now(timezone.utc), **valores,
        ))
        reg.commit()
    finally:
        reg.close()


# ════════════════════════════════════════════════════════════════════════════
# El write-through: mirar las métricas deja la historia
# ════════════════════════════════════════════════════════════════════════════

def test_write_through_deja_una_fila_por_cliente_y_la_consolidada(client, monkeypatch):
    """Pedir ``/metricas`` de un período snapshotea ese período, con crudos exactos."""
    from app.plataforma_tendencia import CONSOLIDADO_SLUG

    _ids, cab = _escenario(client, monkeypatch)
    actual = _actual()
    _pedir_metricas(client, cab, actual)

    filas = _filas(actual)
    # galerias existe y es legible (está vacío): tiene fila. `roto` NO.
    assert set(filas) == {"acme", "beta", "galerias", CONSOLIDADO_SLUG}

    acme = filas["acme"]
    assert acme["espacios_comercializables"] == ACME_CARAS
    assert acme["ocupadas"] == ACME_OCUPADAS
    assert acme["contratos_activos"] == ACME_CONTRATOS
    assert acme["canon_total"] == ACME_INGRESO
    assert acme["sedes_con_plano"] == 2
    assert acme["usuarios"] == 1
    assert acme["proveedores"] == {"Alpina": 3, "Nutresa": 1}
    assert acme["clientes_incluidos"] == 1
    assert acme["clientes_con_error"] is None
    assert acme["origen"] == "vista"

    cons = filas[CONSOLIDADO_SLUG]
    assert cons["espacios_comercializables"] == CONS_CARAS
    assert cons["ocupadas"] == CONS_OCUPADAS
    assert cons["contratos_activos"] == CONS_CONTRATOS
    assert cons["canon_total"] == CONS_INGRESO
    assert cons["clientes_incluidos"] == 3          # acme, beta, galerias
    assert cons["clientes_con_error"] == 1          # roto
    # Los proveedores de todos los clientes, fusionados por nombre ORIGINAL.
    assert cons["proveedores"] == {"Alpina": 3, "Nutresa": 1, PROVEEDOR_SUCIO: 2}


def test_write_through_es_idempotente(client, monkeypatch):
    """Dos pedidos del mismo período dejan exactamente una fila por (slug, periodo)."""
    _ids, cab = _escenario(client, monkeypatch)
    actual = _actual()

    _pedir_metricas(client, cab, actual)
    primera = _filas(actual)
    _pedir_metricas(client, cab, actual)
    _pedir_metricas(client, cab, actual)
    segunda = _filas(actual)

    assert set(primera) == set(segunda)
    # `_filas` indexa por slug: si hubiera duplicados, el UNIQUE los habría
    # frenado antes. Se cuenta a mano para que la prueba lo diga explícito.
    from app.clientes import sesion_registro
    from app.models.plataforma import SnapshotMetricas
    reg = sesion_registro()
    try:
        assert reg.query(SnapshotMetricas).filter(
            SnapshotMetricas.periodo == actual).count() == len(primera)
    finally:
        reg.close()


def test_el_cliente_roto_no_recibe_fila(client, monkeypatch):
    """Una base ilegible deja un HUECO, no un cero falso congelado para siempre."""
    _ids, cab = _escenario(client, monkeypatch)
    actual = _actual()
    cuerpo = _pedir_metricas(client, cab, actual)

    # El endpoint sí lo muestra, con su error.
    assert next(c for c in cuerpo["clientes"] if c["slug"] == "roto")["error"] is not None
    # Pero el histórico no lo inventa.
    assert "roto" not in _filas(actual)


def test_mes_en_curso_se_sobreescribe_y_mes_pasado_queda_congelado(client, monkeypatch):
    """La regla del congelado, en sus dos mitades.

    El mes EN CURSO converge: si los datos cambian, la próxima vista actualiza la
    fila. Un mes YA PASADO no se pisa nunca — recalcularlo hoy daría los contratos
    de hoy, no los de aquel mes.
    """
    _ids, cab = _escenario(client, monkeypatch)
    actual, anterior = _actual(), _anterior()

    _pedir_metricas(client, cab, actual)
    _pedir_metricas(client, cab, anterior)
    antes_actual = _filas(actual)["beta"]
    antes_pasado = _filas(anterior)["beta"]
    assert antes_actual["contratos_activos"] == BETA_CONTRATOS
    assert antes_pasado["contratos_activos"] == BETA_CONTRATOS

    # Cambian los datos de BETA: un contrato más.
    _sembrar("beta", {}, [_TERCERO_BETA])

    _pedir_metricas(client, cab, actual)
    _pedir_metricas(client, cab, anterior)

    despues_actual = _filas(actual)["beta"]
    despues_pasado = _filas(anterior)["beta"]

    # Mes en curso: converge.
    assert despues_actual["contratos_activos"] == BETA_CONTRATOS + 1
    assert despues_actual["canon_total"] == BETA_INGRESO + 750_000.0
    # Mes pasado: congelado, hasta el `capturado_en`.
    assert despues_pasado["contratos_activos"] == BETA_CONTRATOS
    assert despues_pasado["canon_total"] == BETA_INGRESO
    assert despues_pasado["capturado_en"] == antes_pasado["capturado_en"]


def test_el_snapshot_no_persiste_ids_de_usuario(client, monkeypatch):
    """``usuarios`` es un CONTEO. Ningún id, correo ni nombre baja a la tabla."""
    from app.plataforma_tendencia import CONSOLIDADO_SLUG

    _ids, cab = _escenario(client, monkeypatch)
    actual = _actual()
    _pedir_metricas(client, cab, actual)
    filas = _filas(actual)

    assert filas["acme"]["usuarios"] == 1
    # acme y beta tienen un owner cada uno; galerias, ninguno con membresía.
    assert filas[CONSOLIDADO_SLUG]["usuarios"] == 2

    # La tabla no tiene DÓNDE guardar un id: el conjunto de columnas es cerrado
    # y `usuarios` es un entero. Se afirma sobre el esquema y no sobre los datos
    # porque lo que se quiere fijar es que no exista el lugar, no que hoy esté
    # vacío.
    from app.models.plataforma import SnapshotMetricas

    columnas = {c.name for c in SnapshotMetricas.__table__.columns}
    assert columnas == {
        "id", "cliente_slug", "periodo", "sedes_con_plano",
        "espacios_comercializables", "ocupadas", "contratos_activos",
        "canon_total", "usuarios", "proveedores_json", "clientes_incluidos",
        "clientes_con_error", "origen", "capturado_en",
    }
    assert str(SnapshotMetricas.__table__.c.usuarios.type) == "INTEGER"


def test_metricas_no_cambian_su_json_por_el_snapshot(client, monkeypatch):
    """El hook no puede alterar la respuesta de la Fase 4: mismo JSON, con y sin filas."""
    _ids, cab = _escenario(client, monkeypatch)
    actual = _actual()

    primero = _pedir_metricas(client, cab, actual)   # tabla vacía al entrar
    segundo = _pedir_metricas(client, cab, actual)   # tabla ya poblada

    for cuerpo in (primero, segundo):
        assert set(cuerpo) == {"periodo", "generado_en", "de_cache", "consolidado", "clientes"}
    assert primero["consolidado"] == segundo["consolidado"]
    assert primero["clientes"] == segundo["clientes"]


# ════════════════════════════════════════════════════════════════════════════
# El cierre automático
# ════════════════════════════════════════════════════════════════════════════

def test_cerrar_mes_anterior_puebla_sin_abrir_la_consola(client, monkeypatch):
    """El mes ya cerrado se snapshotea aunque nadie haya pedido nunca ``/metricas``."""
    from app.plataforma_tendencia import CONSOLIDADO_SLUG, cerrar_mes_anterior

    _escenario(client, monkeypatch)
    anterior = _anterior()
    assert _filas(anterior) == {}

    cerrar_mes_anterior()

    filas = _filas(anterior)
    assert set(filas) == {"acme", "beta", "galerias", CONSOLIDADO_SLUG}
    # Y queda etiquetado como lo que fue: un cierre, no una vista.
    assert {f["origen"] for f in filas.values()} == {"cierre"}


def test_cerrar_mes_anterior_es_idempotente_y_no_pisa(client, monkeypatch):
    """Llamarlo dos veces no duplica nada ni recaptura lo ya congelado."""
    from app.plataforma_tendencia import cerrar_mes_anterior

    _escenario(client, monkeypatch)
    anterior = _anterior()

    cerrar_mes_anterior()
    primera = _filas(anterior)
    cerrar_mes_anterior()
    segunda = _filas(anterior)

    assert set(primera) == set(segunda)
    # La segunda corrida no tenía nada que hacer: no volvió a capturar.
    assert {s: v["capturado_en"] for s, v in primera.items()} == \
           {s: v["capturado_en"] for s, v in segunda.items()}


def test_mantenimiento_llama_al_cierre_y_sobrevive_a_un_cliente_roto(client, monkeypatch):
    """``_run_lease_maintenance()`` cierra el mes, con una base rota en el registro."""
    from app.main import _run_lease_maintenance
    from app.plataforma_tendencia import CONSOLIDADO_SLUG

    _escenario(client, monkeypatch)  # incluye el cliente `roto`
    anterior = _anterior()
    assert _filas(anterior) == {}

    _run_lease_maintenance()  # no levanta: la base rota no lo tumba

    filas = _filas(anterior)
    assert CONSOLIDADO_SLUG in filas
    assert "roto" not in filas
    assert filas[CONSOLIDADO_SLUG]["clientes_con_error"] == 1


# ════════════════════════════════════════════════════════════════════════════
# El endpoint: forma de la serie
# ════════════════════════════════════════════════════════════════════════════

def test_serie_tiene_siempre_n_meses_consecutivos_y_marca_el_parcial(client, monkeypatch):
    """N entradas, del más viejo al más nuevo, terminando en el mes en curso."""
    from app.plataforma_tendencia import ultimos_periodos

    _ids, cab = _escenario(client, monkeypatch)
    actual = _actual()
    _pedir_metricas(client, cab, actual)

    cuerpo = _tendencia(client, cab, meses=6)

    esperados = ultimos_periodos(6, actual)
    assert [p["periodo"] for p in cuerpo["serie"]] == esperados
    assert cuerpo["meses"] == 6
    assert cuerpo["desde"] == esperados[0]
    assert cuerpo["hasta"] == actual == cuerpo["periodo_actual"]
    assert cuerpo["cliente"] == "__consolidado__"
    assert cuerpo["nombre"] == "Consolidado"
    assert cuerpo["generado_en"].endswith("Z")

    # Sólo el mes en curso es parcial, y es el único con dato en esta prueba.
    assert [p["parcial"] for p in cuerpo["serie"]] == [False] * 5 + [True]
    assert [p["sin_dato"] for p in cuerpo["serie"]] == [True] * 5 + [False]


def test_un_mes_sin_fila_va_completo_y_en_null(client, monkeypatch):
    """El hueco se declara: el mes está, con todas las métricas en ``null``."""
    _ids, cab = _escenario(client, monkeypatch)
    cuerpo = _tendencia(client, cab, meses=3)

    vacio = _mes(cuerpo, _anterior())
    assert vacio["sin_dato"] is True
    assert vacio["capturado_en"] is None and vacio["origen"] is None
    assert vacio["top_proveedores"] == []
    for campo in ("clientes_incluidos", "clientes_con_error", "sedes_con_plano",
                  "espacios_comercializables", "ocupacion_pct",
                  "canon_promedio_mensual", "ingreso_contratado_mes",
                  "usuarios_con_cuenta"):
        assert vacio[campo] is None, campo


def test_el_default_es_consolidado_y_doce_meses(client, monkeypatch):
    _ids, cab = _escenario(client, monkeypatch)
    cuerpo = _tendencia(client, cab)

    assert cuerpo["cliente"] == "__consolidado__"
    assert cuerpo["meses"] == 12 and len(cuerpo["serie"]) == 12


# ════════════════════════════════════════════════════════════════════════════
# El endpoint: los números, K=3 y el saneo
# ════════════════════════════════════════════════════════════════════════════

def test_consolidado_es_ponderado_contra_numeros_sembrados(client, monkeypatch):
    """Σ/Σ, no promedio de promedios — la lección de vitrinas, en el histórico."""
    _ids, cab = _escenario(client, monkeypatch)
    actual = _actual()
    _pedir_metricas(client, cab, actual)

    punto = _mes(_tendencia(client, cab, meses=2), actual)

    assert punto["espacios_comercializables"] == CONS_CARAS
    assert punto["ocupacion_pct"] == CONS_OCUPACION
    assert punto["ingreso_contratado_mes"] == CONS_INGRESO
    assert punto["canon_promedio_mensual"] == CONS_CANON_PONDERADO
    assert punto["canon_promedio_mensual"] != CONS_PROMEDIO_DE_PROMEDIOS
    assert punto["clientes_incluidos"] == 3
    assert punto["clientes_con_error"] == 1
    assert punto["origen"] == "vista"
    assert punto["capturado_en"].endswith("Z")


def test_k3_se_aplica_mes_a_mes(client, monkeypatch):
    """Un cliente con 2 contratos en un mes y 3 en otro: se suprime SÓLO el primero.

    La supresión se aplica AL LEER, así que dos meses de la MISMA serie pueden
    salir uno suprimido y el otro publicado — que es todo el punto de no guardar
    los públicos.
    """
    _ids, cab = _escenario(client, monkeypatch)
    actual, anterior = _actual(), _anterior()

    # Mes anterior: BETA con sus 2 contratos originales -> por debajo de K=3.
    _pedir_metricas(client, cab, anterior)
    # Mes en curso: se le agrega el tercero -> publica.
    _sembrar("beta", {}, [_TERCERO_BETA])
    _pedir_metricas(client, cab, actual)

    cuerpo = _tendencia(client, cab, cliente="beta", meses=3)
    assert cuerpo["nombre"] == "Beta"

    suprimido = _mes(cuerpo, anterior)
    assert suprimido["sin_dato"] is False
    assert suprimido["ingreso_contratado_mes"] is None
    assert suprimido["canon_promedio_mensual"] is None
    assert suprimido["top_proveedores"] == []
    # Los conteos y la ocupación NO se suprimen: no revelan ningún importe.
    assert suprimido["espacios_comercializables"] == BETA_CARAS
    assert suprimido["ocupacion_pct"] == round(BETA_OCUPADAS * 100 / BETA_CARAS, 1)

    publicado = _mes(cuerpo, actual)
    assert publicado["ingreso_contratado_mes"] == BETA_INGRESO + 750_000.0
    assert publicado["canon_promedio_mensual"] == round((BETA_INGRESO + 750_000.0) / 3, 2)
    assert publicado["top_proveedores"]


def test_el_nombre_del_proveedor_sale_saneado(client, monkeypatch):
    """El correo que el cliente tecleó adentro del nombre no llega al JSON."""
    _ids, cab = _escenario(client, monkeypatch)
    actual = _actual()
    _sembrar("beta", {}, [_TERCERO_BETA])   # cruza K=3 para que haya top
    _pedir_metricas(client, cab, actual)

    punto = _mes(_tendencia(client, cab, cliente="beta", meses=1), actual)
    nombres = [p["nombre"] for p in punto["top_proveedores"]]

    assert any("[correo oculto]" in n for n in nombres)
    assert not any("@" in n for n in nombres)
    assert not any("ventas@bimbo.co" in n for n in nombres)


def test_la_serie_nunca_publica_contratos_ni_ocupadas(client, monkeypatch):
    """El numerador y el denominador de la supresión no salen del backend.

    ``contratos_activos`` aparece SÓLO adentro de ``top_proveedores``, donde ya
    pasó por K=3 y es un conteo por proveedor, no el total del cliente.
    """
    _ids, cab = _escenario(client, monkeypatch)
    actual = _actual()
    _pedir_metricas(client, cab, actual)

    cuerpo = _tendencia(client, cab, meses=2)
    for punto in cuerpo["serie"]:
        assert "ocupadas" not in punto
        assert "contratos_activos" not in punto
        assert "canon_total" not in punto
        for prov in punto["top_proveedores"]:
            assert set(prov) == {"nombre", "contratos_activos"}


def test_un_mes_pasado_congelado_se_lee_igual(client, monkeypatch):
    """Una fila puesta en un mes viejo sale publicada con sus propios números."""
    _ids, cab = _escenario(client, monkeypatch)
    hace_dos = _anterior(_anterior())

    _sembrar_fila("acme", hace_dos, contratos_activos=4, canon_total=2_000_000.0,
                  espacios_comercializables=8, ocupadas=2,
                  proveedores_json=json.dumps({"Alpina": 4}))

    punto = _mes(_tendencia(client, cab, cliente="acme", meses=4), hace_dos)
    assert punto["sin_dato"] is False and punto["parcial"] is False
    assert punto["ingreso_contratado_mes"] == 2_000_000.0
    assert punto["canon_promedio_mensual"] == 500_000.0
    assert punto["ocupacion_pct"] == 25.0
    assert punto["origen"] == "cierre"


# ════════════════════════════════════════════════════════════════════════════
# La frontera del operador
# ════════════════════════════════════════════════════════════════════════════

def test_meses_fuera_de_rango_es_422(client, monkeypatch):
    _ids, cab = _escenario(client, monkeypatch)
    for malo in (0, 25, -3):
        _tendencia(client, cab, meses=malo, espera=422)
    # Y los extremos válidos sí entran.
    assert _tendencia(client, cab, meses=1)["meses"] == 1
    assert _tendencia(client, cab, meses=24)["meses"] == 24


def test_cliente_inexistente_es_404_con_texto_fijo(client, monkeypatch):
    _ids, cab = _escenario(client, monkeypatch)
    r = client.get("/api/plataforma/tendencia?cliente=no_existe", headers=cab)
    assert r.status_code == 404
    assert r.json()["detail"] == "No hay un cliente con ese código."
    # Ni la URL de la base ni el mensaje del driver.
    assert "sqlite" not in r.text.lower() and ".db" not in r.text


def test_sin_token_y_sin_ser_operador_es_403(client, monkeypatch):
    ids, _cab_op = _escenario(client, monkeypatch)

    assert client.get("/api/plataforma/tendencia").status_code in (401, 403)

    # El owner de un cliente NO es operador de la plataforma.
    owner = _fundar(ids, "uid-otro", "otro@acme.co", "gamma", "Gamma")
    assert client.get("/api/plataforma/tendencia", headers=owner).status_code == 403


def test_deja_linea_en_la_bitacora(client, monkeypatch):
    """``accion="tendencia"`` y el alcance completo como QUÉ de la línea."""
    from app.clientes import sesion_registro
    from app.models.plataforma import BitacoraPlataforma

    _ids, cab = _escenario(client, monkeypatch)
    cuerpo = _tendencia(client, cab, cliente="acme", meses=3)

    reg = sesion_registro()
    try:
        lineas = reg.query(BitacoraPlataforma).filter(
            BitacoraPlataforma.accion == "tendencia").all()
        assert len(lineas) == 1
        assert lineas[0].email == "op@recabra.co"
        assert lineas[0].periodo == f"acme:{cuerpo['desde']}..{cuerpo['hasta']}"
    finally:
        reg.close()


def test_tendencia_no_toca_ninguna_base_de_cliente(client, monkeypatch):
    """Lee SÓLO el registro: ningún archivo de cliente cambia de tamaño ni de mtime."""
    import os

    from app.clientes import listar, url_para
    from app.database import SQLALCHEMY_DATABASE_URL

    _ids, cab = _escenario(client, monkeypatch)
    _pedir_metricas(client, cab, _actual())

    # La base por DEFECTO queda afuera a propósito: es el registro —donde viven
    # `snapshot_metricas` y la bitácora, que este endpoint sí escribe— y encima
    # es también la base de `galerias`. Lo que se está afirmando es que no se
    # toca ninguna base de NEGOCIO de un cliente, y ésa es la única que no lo es.
    registro = SQLALCHEMY_DATABASE_URL.split("sqlite:///", 1)[1]
    rutas = [
        r for r in (url_para(c.db_name).split("sqlite:///", 1)[1] for c in listar())
        if os.path.abspath(r) != os.path.abspath(registro)
    ]
    antes = {r: os.stat(r) for r in rutas if os.path.exists(r)}
    assert antes, "el escenario tiene que haber creado bases de cliente"

    _tendencia(client, cab, meses=12)
    _tendencia(client, cab, cliente="acme", meses=24)

    for ruta, st in antes.items():
        ahora = os.stat(ruta)
        assert (ahora.st_size, ahora.st_mtime) == (st.st_size, st.st_mtime), ruta
