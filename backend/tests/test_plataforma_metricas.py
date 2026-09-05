"""Fase 4: métricas agregadas del negocio y la puerta del operador sin membresías.

Dos cosas se prueban acá, y son las dos caras de la misma enmienda:

* ``GET /api/plataforma/metricas`` — los agregados TAXATIVOS de la spec contra
  datos sembrados a mano, la frontera de lo que el JSON puede contener, la
  tolerancia a una base rota, el caché de 5 minutos y la bitácora del registro.
* ``POST /api/auth/oauth`` para un operador SIN membresías — el token de la
  consola: abre ``/api/plataforma`` y **nada más**.

Mismo patrón que ``test_plataforma.py``: verificador falso por
``dependency_overrides``, ``OPERADOR_EMAILS`` por ``monkeypatch``, y todo
``import app.*`` ADENTRO de las funciones.

Los números sembrados están elegidos para que el promedio PONDERADO del
consolidado (Σ canones / Σ contratos) y el promedio de promedios den distinto:
si alguien cambiara la cuenta por la equivocada, el test lo dice.
"""
import json
from datetime import date
from types import SimpleNamespace

import pytest

# ─── Datos sembrados ─────────────────────────────────────────────────────────
#
# Cliente ACME, período 2026-09 (2026-09-01 .. 2026-09-30):
#
#   sede NAVE  PUN-01     punta                      -> NAVE-PUN-01
#              GON-01     góndola doble SIN faceB    -> NAVE-GON-01 + NAVE-GON-01-B
#              GON-02     góndola mural (una cara)   -> NAVE-GON-02
#              COL-01     rentable: false            -> NO cuenta
#              CHK-01     sin la bandera `rentable`  -> SÍ cuenta (ausente = vendible)
#   sede SUR   PUN-01                                -> SUR-PUN-01
#   sede VACIA plano guardado sin muebles            -> NO es "sede con plano"
#
#   => 2 sedes con plano, 6 caras comercializables.
#
#   Contratos: 4 activos (uno de UN día, uno sobre un espacio que no está en el
#   plano) + 3 que no lo están (uno futuro, uno vencido, uno CANCELADO).

PERIODO = "2026-09"

_NAVE = [
    {"code": "PUN-01", "type": "punta", "sede": "NAVE"},
    # Góndola doble SIN la clave `faceB`: lo que la hace doble es el TIPO, no
    # que alguien haya vendido esa cara alguna vez. El editor omite `faceB`
    # mientras la cara B está libre, y `facesOf` (DashboardView.tsx) devuelve
    # DOS caras igual (`f.faceB ?? EMPTY_FACE`). Son dos espacios vendibles.
    {"code": "GON-01", "type": "gondola", "gondolaType": "double", "sede": "NAVE"},
    {"code": "GON-02", "type": "gondola", "gondolaType": "wall", "sede": "NAVE"},
    {"code": "COL-01", "type": "columna", "sede": "NAVE", "rentable": False},
    # Sin la bandera: `isRentable` dice que sí. Sólo un `false` explícito excluye.
    {"code": "CHK-01", "type": "checkout", "sede": "NAVE"},
]
_SUR = [{"code": "PUN-01", "type": "punta", "sede": "SUR"}]

# (código, proveedor, desde, hasta, canon, is_active)
_CONTRATOS_ACME = [
    ("NAVE-PUN-01", "Alpina", "2026-09-01", "2026-09-30", 1_000_000.0, True),
    ("NAVE-GON-01-B", "Alpina", "2026-08-15", "2026-09-05", 2_000_000.0, True),
    # Un solo día, y cae adentro del mes: vale como cualquier otro.
    ("SUR-PUN-01", "Nutresa", "2026-09-30", "2026-09-30", 500_000.0, True),
    # El espacio NO está en el plano: suma canon, ingreso y proveedor, pero no
    # puede contar como cara ocupada (el denominador no lo incluye).
    ("FANTASMA-01", "Alpina", "2026-09-10", "2026-09-20", 400_000.0, True),
    ("NAVE-GON-02", "Nutresa", "2026-10-01", "2026-10-31", 9_999_999.0, True),   # futuro
    ("NAVE-CHK-01", "Bimbo", "2026-07-01", "2026-08-31", 8_888_888.0, True),     # vencido
    ("NAVE-GON-01", "Bimbo", "2026-09-01", "2026-09-30", 7_777_777.0, False),    # cancelado
]

# BETA lleva TRES contratos, uno por proveedor: da un top de tres sin empates
# de conteo, que es lo que el test del desempate alfabético necesita mirar.
_BETA = [
    {"code": "E-01", "type": "punta", "sede": "BETA"},
    {"code": "E-02", "type": "punta", "sede": "BETA"},
    {"code": "E-03", "type": "punta", "sede": "BETA"},
]
_CONTRATOS_BETA = [
    ("BETA-E-01", "Nutresa", "2026-09-01", "2026-09-30", 400_000.0, True),
    ("BETA-E-02", "Bimbo", "2026-09-01", "2026-09-30", 200_000.0, True),
    ("BETA-E-03", "Alpina", "2026-09-01", "2026-09-30", 750_000.0, True),
]

# Lo que tiene que dar ACME, calculado a mano:
ACME_CARAS = 6           # PUN-01, GON-01, GON-01-B, GON-02, CHK-01, SUR-PUN-01
ACME_OCUPADAS = 3        # NAVE-PUN-01, NAVE-GON-01-B, SUR-PUN-01 (FANTASMA no está en el plano)
ACME_INGRESO = 3_900_000.0
ACME_CONTRATOS = 4
ACME_CANON = 975_000.0   # 3.900.000 / 4

BETA_INGRESO = 1_350_000.0
BETA_CONTRATOS = 3
BETA_CANON = 450_000.0

# Consolidado (galerias no tiene nada; roto queda excluido por error).
CONS_INGRESO = ACME_INGRESO + BETA_INGRESO            # 5.250.000
CONS_CONTRATOS = ACME_CONTRATOS + BETA_CONTRATOS      # 7
CONS_CANON_PONDERADO = 750_000.0                      # 5.250.000 / 7
CONS_PROMEDIO_DE_PROMEDIOS = 712_500.0                # la cuenta EQUIVOCADA


# ─── Andamiaje ───────────────────────────────────────────────────────────────

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
    """El dueño del SaaS: correo en ``OPERADOR_EMAILS`` y CERO membresías.

    Entra por el camino nuevo de ``/oauth`` y se lleva el token de la consola.
    """
    monkeypatch.setenv("OPERADOR_EMAILS", email)
    ids.registrar(uid, email)
    r = ids.client.post("/api/auth/oauth", json={"id_token": uid})
    assert r.status_code == 200, r.text
    return r.json()


def _sembrar(slug, sedes: dict, contratos: list):
    """Escribe layout + espacios + contratos en la base DEL CLIENTE.

    Es lo único de este archivo que escribe en una base de negocio: el endpoint
    que se prueba no escribe nunca.
    """
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


def _escenario(client, monkeypatch):
    """galerias (vacío) + acme + beta + roto, y el operador de la consola."""
    from app.plataforma_metricas import limpiar_cache_metricas

    ids = Identidades(client)
    _fundar(ids, "uid-acme", "duena@acme.co", "acme", "Acme")
    _fundar(ids, "uid-beta", "dueno@beta.co", "beta", "Beta")
    _sembrar("acme", {"NAVE": _NAVE, "SUR": _SUR, "VACIA": []}, _CONTRATOS_ACME)
    _sembrar("beta", {"BETA": _BETA}, _CONTRATOS_BETA)
    _romper()
    consola = _operador_sin_membresias(ids, monkeypatch)
    limpiar_cache_metricas()
    return ids, _cab(consola["token"])


def _pedir(client, cab, periodo=PERIODO):
    r = client.get(f"/api/plataforma/metricas?periodo={periodo}", headers=cab)
    assert r.status_code == 200, r.text
    return r.json()


def _fila(cuerpo, slug):
    return next(c for c in cuerpo["clientes"] if c["slug"] == slug)


def _hojas(nodo):
    """Todos los valores escalares del JSON, sin importar dónde estén."""
    if isinstance(nodo, dict):
        for v in nodo.values():
            yield from _hojas(v)
    elif isinstance(nodo, list):
        for v in nodo:
            yield from _hojas(v)
    else:
        yield nodo


def _todos_los_numeros(cuerpo):
    # `bool` es subclase de `int` en Python: `de_cache` no es un número.
    return [v for v in _hojas(cuerpo)
            if isinstance(v, (int, float)) and not isinstance(v, bool)]


def _todos_los_textos(cuerpo):
    return [v for v in _hojas(cuerpo) if isinstance(v, str)]


# ════════════════════════════════════════════════════════════════════════════
# Los agregados, contra datos sembrados conocidos
# ════════════════════════════════════════════════════════════════════════════

def test_periodo_resuelto_y_forma_de_la_respuesta(client, monkeypatch):
    _ids, cab = _escenario(client, monkeypatch)
    cuerpo = _pedir(client, cab)

    assert cuerpo["periodo"] == {
        "anio_mes": "2026-09", "desde": "2026-09-01", "hasta": "2026-09-30",
    }
    assert cuerpo["de_cache"] is False
    assert cuerpo["generado_en"].endswith("Z")
    # Ordenados por slug, y el suspendido/inactivo no se filtra.
    assert [c["slug"] for c in cuerpo["clientes"]] == ["acme", "beta", "galerias", "roto"]


def test_metricas_de_un_cliente_contra_datos_sembrados(client, monkeypatch):
    """Los ocho agregados de ACME, calculados a mano arriba."""
    _ids, cab = _escenario(client, monkeypatch)
    m = _fila(_pedir(client, cab), "acme")

    assert m["estado_cuenta"] == "activo"
    assert m["error"] is None
    assert m["metricas"] == {
        "sedes_con_plano": 2,                       # NAVE y SUR; VACIA no
        "espacios_comercializables": ACME_CARAS,    # góndola doble = 2 caras
        "ocupacion_pct": 50.0,                      # 3 de 6
        "canon_promedio_mensual": ACME_CANON,
        "ingreso_contratado_mes": ACME_INGRESO,
        "top_proveedores": [
            {"nombre": "Alpina", "contratos_activos": 3},
            {"nombre": "Nutresa", "contratos_activos": 1},
        ],
        "usuarios_con_cuenta": 1,
        "ultimo_acceso": m["metricas"]["ultimo_acceso"],
        # Fase 6 (spread): ACME no tiene tarifa de referencia configurada en
        # este escenario -> `null` + los 4 contratos activos van sin tarifa.
        "spread_pct": None,
        "tarifa_configurada": False,
        "contratos_sin_tarifa": ACME_CONTRATOS,
    }
    # La fecha del último acceso: sólo la fecha, sin hora y sin quién.
    assert m["metricas"]["ultimo_acceso"] == date.today().isoformat()


def test_gondola_doble_suma_dos_caras_y_el_no_comercializable_ninguna(client, monkeypatch):
    """Las seis caras de ACME, una por una — es la cuenta que decide la ocupación."""
    from app.plataforma_metricas import _caras_comercializables

    _ids, cab = _escenario(client, monkeypatch)
    caras = _caras_comercializables(_NAVE, "NAVE") | _caras_comercializables(_SUR, "SUR")

    assert caras == {
        "NAVE-PUN-01",
        # Doble SIN `faceB` en el JSON: dos caras igual. Lo que la hace doble es
        # el tipo; `faceB` sólo guarda los datos comerciales de esa cara.
        "NAVE-GON-01", "NAVE-GON-01-B",
        "NAVE-GON-02",                     # mural: sólo A
        "NAVE-CHK-01",                     # `rentable` ausente = comercializable
        "SUR-PUN-01",
    }
    assert "NAVE-COL-01" not in caras       # `rentable: false` explícito
    assert _fila(_pedir(client, cab), "acme")["metricas"]["espacios_comercializables"] == len(caras)


def test_la_gondola_doble_no_depende_de_la_clave_faceB(client, monkeypatch):
    """Con `faceB` y sin `faceB`, el inventario es el mismo: DOS caras.

    `faceB` es dónde se guardan los datos comerciales de la cara B, no lo que
    hace doble a una góndola. Una góndola recién dibujada —nada vendido en
    ninguna cara— se persiste sin la clave y sigue siendo dos espacios
    vendibles; exigirla contaba la mitad del inventario en el mueble más común
    y en el estado más frecuente.
    """
    from app.plataforma_metricas import _caras_comercializables

    sin_faceB = [{"code": "GON-77", "type": "gondola", "gondolaType": "double", "sede": "N1"}]
    con_faceB = [dict(sin_faceB[0], faceB={"supplierName": "Alpina", "negotiatedValue": 1})]

    esperado = {"N1-GON-77", "N1-GON-77-B"}
    assert _caras_comercializables(sin_faceB, "N1") == esperado
    assert _caras_comercializables(con_faceB, "N1") == esperado


def test_el_tipo_legado_gondola_doble_tambien_cuenta_dos_caras(client, monkeypatch):
    """`DashboardView.tsx` conserva a propósito `|| f.type === "gondola_doble"`.

    Esos layouts están persistidos en las bases de clientes viejos y sus
    góndolas siguen teniendo dos caras. Si el backend no reconociera el tipo
    legado, un cliente antiguo aparecería con la mitad del inventario y una
    ocupación inflada al doble.
    """
    from app.plataforma_metricas import _caras_comercializables, _es_gondola_doble

    assert _es_gondola_doble({"type": "gondola_doble"}) is True
    assert _caras_comercializables([{"code": "GON-88", "type": "gondola_doble"}], "N1") == {
        "N1-GON-88", "N1-GON-88-B",
    }
    # Una mural explícita sigue siendo UNA sola cara.
    assert _es_gondola_doble({"type": "gondola", "gondolaType": "wall"}) is False


def test_un_contrato_sobre_la_cara_B_invisible_cuenta_como_ocupacion(client, monkeypatch):
    """El caso por la puerta del endpoint: góndola doble sola, contrato en `-B`.

    Si la cara B no existiera para el backend, el contrato real sobre ella no
    contaría como ocupación **y** el denominador se encogería: 1 cara y 0 %,
    cuando el plano que ve el cliente muestra 2 caras y una vendida.
    """
    from app.plataforma_metricas import limpiar_cache_metricas

    ids = Identidades(client)
    _fundar(ids, "uid-dob", "duena@dob.co", "dob", "Doble")
    _sembrar(
        "dob",
        {"D1": [{"code": "GON-77", "type": "gondola", "gondolaType": "double", "sede": "D1"}]},
        [("D1-GON-77-B", "Alpina", "2026-09-01", "2026-09-30", 100_000.0, True)],
    )
    consola = _operador_sin_membresias(ids, monkeypatch)
    limpiar_cache_metricas()

    m = _fila(_pedir(client, _cab(consola["token"])), "dob")["metricas"]
    assert m["espacios_comercializables"] == 2
    assert m["ocupacion_pct"] == 50.0


def test_contrato_de_un_dia_cuenta_en_su_mes_y_no_en_otro(client, monkeypatch):
    _ids, cab = _escenario(client, monkeypatch)

    septiembre = _fila(_pedir(client, cab, "2026-09"), "acme")["metricas"]
    assert septiembre["ingreso_contratado_mes"] == ACME_INGRESO  # incluye los 500.000 del día único

    # En noviembre no hay ningún contrato activo de ACME. Sin umbral (Fase 7):
    # `ingreso_contratado_mes` es SIEMPRE un número, y con 0 contratos es 0.0 —
    # no factura nada, y eso es un dato, no una ausencia. `canon_promedio_mensual`
    # sigue en `null` porque no hay ningún contrato del que promediar.
    noviembre = _fila(_pedir(client, cab, "2026-11"), "acme")["metricas"]
    assert noviembre["canon_promedio_mensual"] is None
    assert noviembre["ingreso_contratado_mes"] == 0.0
    assert noviembre["top_proveedores"] == []
    assert noviembre["ocupacion_pct"] == 0.0  # hay caras, ninguna ocupada


def test_contrato_sin_mueble_en_el_plano_no_infla_la_ocupacion(client, monkeypatch):
    """FANTASMA-01 tiene contrato pero no existe en el layout.

    Suma a canon, ingreso y al top de proveedores (la plata existe), pero no
    puede contar como cara ocupada: el denominador no lo incluye y el
    porcentaje se pasaría de 100.
    """
    _ids, cab = _escenario(client, monkeypatch)
    m = _fila(_pedir(client, cab), "acme")["metricas"]

    assert m["ocupacion_pct"] == round(ACME_OCUPADAS * 100 / ACME_CARAS, 1) == 50.0
    # 4 contratos activos, pero sólo 3 caras ocupadas.
    assert sum(p["contratos_activos"] for p in m["top_proveedores"]) == ACME_CONTRATOS


def test_ocupacion_null_cuando_no_hay_espacios_comercializables(client, monkeypatch):
    """galerias no tiene plano: no tiene 0 % de ocupación, no tiene ocupación."""
    _ids, cab = _escenario(client, monkeypatch)
    m = _fila(_pedir(client, cab), "galerias")["metricas"]

    assert m["sedes_con_plano"] == 0
    assert m["espacios_comercializables"] == 0
    assert m["ocupacion_pct"] is None
    assert m["canon_promedio_mensual"] is None      # 0 contratos: no hay qué promediar
    assert m["ingreso_contratado_mes"] == 0.0       # Fase 7: SIEMPRE número, sin umbral
    assert m["usuarios_con_cuenta"] == 0
    assert m["ultimo_acceso"] is None


def test_empate_en_el_top_se_desempata_alfabeticamente(client, monkeypatch):
    _ids, cab = _escenario(client, monkeypatch)
    m = _fila(_pedir(client, cab), "beta")["metricas"]

    assert m["top_proveedores"] == [
        {"nombre": "Alpina", "contratos_activos": 1},
        {"nombre": "Bimbo", "contratos_activos": 1},
        {"nombre": "Nutresa", "contratos_activos": 1},
    ]


def test_cliente_suspendido_aparece_con_sus_metricas(client, monkeypatch):
    """El operador necesita ver el negocio COMPLETO: una cuenta cortada por
    impago es justamente la que hay que poder mirar."""
    from app.plataforma_metricas import limpiar_cache_metricas

    _ids, cab = _escenario(client, monkeypatch)
    r = client.patch(
        "/api/plataforma/clientes/beta",
        json={"estado": "suspendido", "motivo": "impago"},
        headers=cab,
    )
    assert r.status_code == 200, r.text
    limpiar_cache_metricas()

    fila = _fila(_pedir(client, cab), "beta")
    assert fila["estado_cuenta"] == "suspendido"
    assert fila["error"] is None
    assert fila["metricas"]["ingreso_contratado_mes"] == BETA_INGRESO


# ════════════════════════════════════════════════════════════════════════════
# Consolidado
# ════════════════════════════════════════════════════════════════════════════

def test_consolidado_pondera_y_no_promedia_promedios(client, monkeypatch):
    _ids, cab = _escenario(client, monkeypatch)
    c = _pedir(client, cab)["consolidado"]

    assert c["clientes_total"] == 4          # galerias + acme + beta + roto
    assert c["clientes_con_error"] == 1      # roto
    assert c["sedes_con_plano"] == 3         # NAVE + SUR + BETA
    assert c["espacios_comercializables"] == 9   # 6 + 3

    # Ocupación consolidada = Σ ocupadas / Σ comercializables, NO promedio de %.
    assert c["ocupacion_pct"] == 66.7        # (3 + 3) / 9

    # Canon promedio PONDERADO = Σ canones / Σ contratos.
    assert c["canon_promedio_mensual"] == CONS_CANON_PONDERADO
    assert c["canon_promedio_mensual"] != CONS_PROMEDIO_DE_PROMEDIOS
    assert c["ingreso_contratado_mes"] == CONS_INGRESO

    assert c["top_proveedores"] == [
        {"nombre": "Alpina", "contratos_activos": 4},
        {"nombre": "Nutresa", "contratos_activos": 2},
        {"nombre": "Bimbo", "contratos_activos": 1},
    ]
    # Los dos owners. El operador no tiene membresía y no cuenta.
    assert c["usuarios_con_cuenta"] == 2


def test_consolidado_excluye_al_cliente_con_error(client, monkeypatch):
    """Sumar la fila rota como si fuera un cliente con todo en cero mentiría el
    porcentaje. Se la cuenta aparte y no se la suma."""
    _ids, cab = _escenario(client, monkeypatch)
    cuerpo = _pedir(client, cab)

    roto = _fila(cuerpo, "roto")
    assert roto["metricas"] is None
    assert roto["error"] is not None
    # Sin la fila rota el consolidado es exactamente acme + beta.
    assert cuerpo["consolidado"]["ingreso_contratado_mes"] == ACME_INGRESO + BETA_INGRESO


# ════════════════════════════════════════════════════════════════════════════
# Fase 7 — agregados EXACTOS, sin umbral: la plata sale sea cual sea el conteo
# ════════════════════════════════════════════════════════════════════════════
#
# Hasta la Fase 6 esta sección probaba la supresión de celda chica (K=3): con
# menos de 3 contratos activos, `ingreso_contratado_mes`, `canon_promedio_mensual`
# y `top_proveedores` salían en `null`/vacío. El dueño de la plataforma decidió
# cambiar el trato (docs/ESTADO.md, Fase 7): el operador ve el número EXACTO de
# todos los clientes, sin umbral — con un contrato activo, el ingreso del mes
# es ese contrato y así se publica. La contrapartida es el reporte de
# transparencia (`app/plataforma_reporte.py`), que construye otro agente.

def _cliente_con_contratos(client, monkeypatch, slug, cuantos):
    """Funda un cliente con `cuantos` contratos activos y devuelve su fila.

    Un espacio por contrato, canon distinto en cada uno, para que si algo se
    filtrara se vea qué número es.
    """
    from app.plataforma_metricas import limpiar_cache_metricas

    fixtures = [{"code": f"E-{i:02d}", "type": "punta", "sede": slug.upper()}
                for i in range(1, max(cuantos, 1) + 1)]
    contratos = [
        (f"{slug.upper()}-E-{i:02d}", f"Prov{i}", "2026-09-01", "2026-09-30",
         100_000.0 * i + 7.0, True)
        for i in range(1, cuantos + 1)
    ]
    ids = Identidades(client)
    _fundar(ids, f"uid-{slug}", f"duena@{slug}.co", slug, slug.title())
    _sembrar(slug, {slug.upper(): fixtures}, contratos)
    consola = _operador_sin_membresias(ids, monkeypatch)
    limpiar_cache_metricas()

    cuerpo = _pedir(client, _cab(consola["token"]))
    return cuerpo, _fila(cuerpo, slug)["metricas"], [c[4] for c in contratos]


def test_con_un_contrato_de_4_173_919_el_ingreso_y_el_canon_salen_exactos(client, monkeypatch):
    """El caso de la spec, al pie de la letra: un contrato de 4.173.919 publica
    ese número exacto — antes se suprimía, ahora es la regla del dueño."""
    from app.plataforma_metricas import limpiar_cache_metricas

    ids = Identidades(client)
    _fundar(ids, "uid-uno", "duena@uno.co", "uno", "Uno")
    _sembrar(
        "uno",
        {"UNO": [{"code": "E-01", "type": "punta", "sede": "UNO"}]},
        [("UNO-E-01", "Alpina", "2026-09-01", "2026-09-30", 4_173_919.0, True)],
    )
    consola = _operador_sin_membresias(ids, monkeypatch)
    limpiar_cache_metricas()

    m = _fila(_pedir(client, _cab(consola["token"])), "uno")["metricas"]
    assert m["ingreso_contratado_mes"] == 4_173_919.0
    assert m["canon_promedio_mensual"] == 4_173_919.0
    assert m["top_proveedores"] == [{"nombre": "Alpina", "contratos_activos": 1}]


@pytest.mark.parametrize("cuantos", [1, 2, 3, 5])
def test_con_cualquier_cantidad_de_contratos_el_agregado_sale_exacto(client, monkeypatch, cuantos):
    """1, 2, 3 o 5 contratos: sin umbral, el ingreso y el canon promedio son
    SIEMPRE el número exacto — antes de la Fase 7, 1 y 2 se suprimían."""
    cuerpo, m, canones = _cliente_con_contratos(client, monkeypatch, f"n{cuantos}", cuantos)

    assert m["ingreso_contratado_mes"] == round(sum(canones), 2)
    assert m["canon_promedio_mensual"] == round(sum(canones) / cuantos, 2)
    assert len(m["top_proveedores"]) == cuantos
    # La suma sí aparece en la respuesta: ya no hay nada que esconder por
    # debajo de un umbral.
    assert round(sum(canones), 2) in _todos_los_numeros(cuerpo)


def test_con_cero_contratos_el_ingreso_es_0_0_y_el_canon_null(client, monkeypatch):
    """0 contratos es la única `null`/cero que sigue existiendo, y por un motivo
    distinto al umbral: `ingreso_contratado_mes` es SIEMPRE número (0.0 acá,
    porque no facturó nada), y `canon_promedio_mensual` es `null` porque no hay
    ningún contrato del que promediar — no por ausencia de dato protegido."""
    _cuerpo, m, _canones = _cliente_con_contratos(client, monkeypatch, "cero", 0)

    assert m["ingreso_contratado_mes"] == 0.0
    assert m["canon_promedio_mensual"] is None
    assert m["top_proveedores"] == []


def test_los_conteos_y_la_ocupacion_no_dependen_de_cuantos_contratos_haya(client, monkeypatch):
    """Los conteos y el % de ocupación siempre fueron ajenos al ingreso, con o
    sin umbral: no cambian con la Fase 7 porque nunca hubo nada que proteger ahí."""
    _cuerpo, m, _canones = _cliente_con_contratos(client, monkeypatch, "conteos", 1)

    assert m["sedes_con_plano"] == 1
    assert m["espacios_comercializables"] == 1
    assert m["ocupacion_pct"] == 100.0
    assert m["usuarios_con_cuenta"] == 1


def test_el_consolidado_es_exactamente_la_suma_de_todas_las_filas_legibles(client, monkeypatch):
    """Fase 7: sin supresión, el consolidado SÍ es reconstruible sumando lo
    visible — ya no hay una fila que esconda su propio ingreso por debajo de
    un umbral. ACME (4 contratos) + un cliente de 1 solo contrato: el
    consolidado suma los CINCO, y el de 1 contrato aporta su número EXACTO,
    no `null`.
    """
    from app.plataforma_metricas import limpiar_cache_metricas

    ids = Identidades(client)
    _fundar(ids, "uid-acme", "duena@acme.co", "acme", "Acme")
    _fundar(ids, "uid-min", "duena@min.co", "min", "Min")
    _sembrar("acme", {"NAVE": _NAVE, "SUR": _SUR, "VACIA": []}, _CONTRATOS_ACME)
    _sembrar(
        "min",
        {"MIN": [{"code": "E-01", "type": "punta", "sede": "MIN"}]},
        [("MIN-E-01", "Solitaria", "2026-09-01", "2026-09-30", 123_457.0, True)],
    )
    consola = _operador_sin_membresias(ids, monkeypatch)
    limpiar_cache_metricas()

    cuerpo = _pedir(client, _cab(consola["token"]))
    c = cuerpo["consolidado"]

    assert _fila(cuerpo, "min")["metricas"]["ingreso_contratado_mes"] == 123_457.0
    assert c["ingreso_contratado_mes"] == ACME_INGRESO + 123_457.0
    assert c["canon_promedio_mensual"] == round((ACME_INGRESO + 123_457.0) / 5, 2)
    assert {"nombre": "Solitaria", "contratos_activos": 1} in c["top_proveedores"]
    # Sin filas ocultas, el consolidado SÍ se puede reconstruir sumando lo
    # visible — al revés de lo que valía bajo K=3.
    visibles = sum(
        f["metricas"]["ingreso_contratado_mes"] or 0.0
        for f in cuerpo["clientes"] if f["metricas"]
    )
    assert visibles == c["ingreso_contratado_mes"]


def test_el_consolidado_publica_exacto_aunque_toda_la_plataforma_tenga_pocos_contratos(
    client, monkeypatch,
):
    """Sin umbral, con dos contratos en toda la plataforma el consolidado es
    el número exacto — antes de la Fase 7 esto daba `null` porque 2 < K."""
    cuerpo, m, canones = _cliente_con_contratos(client, monkeypatch, "chico", 2)
    c = cuerpo["consolidado"]

    assert c["ingreso_contratado_mes"] == round(sum(canones), 2)
    assert c["canon_promedio_mensual"] == round(sum(canones) / 2, 2)
    assert len(c["top_proveedores"]) == 2
    # Es el único cliente con contratos en la plataforma: la fila y el
    # consolidado coinciden.
    assert m["ingreso_contratado_mes"] == c["ingreso_contratado_mes"]
    assert c["espacios_comercializables"] == 2
    assert c["ocupacion_pct"] == 100.0


# ════════════════════════════════════════════════════════════════════════════
# El nombre del proveedor: texto libre del cliente, saneado antes de salir
# ════════════════════════════════════════════════════════════════════════════

def test_el_nombre_del_proveedor_sale_sin_correo_ni_telefono(client, monkeypatch):
    """`Supplier.name` lo teclea el supermercado y muy seguido trae el contacto.

    En retail el proveedor es a menudo una persona natural y el correo o el
    celular terminan escritos adentro del nombre, porque es el único campo que
    se ve en las listas. Ese string es lo único de negocio que cruza al JSON
    del operador: sale enmascarado.
    """
    from app.plataforma_metricas import limpiar_cache_metricas

    sucio = "Juan Perez Distribuciones (juan.perez@gmail.example) cel 300 555 8899"
    ids = Identidades(client)
    _fundar(ids, "uid-suc", "duena@suc.co", "suc", "Suc")
    _sembrar(
        "suc",
        {"S1": [{"code": f"E-{i:02d}", "type": "punta", "sede": "S1"} for i in (1, 2, 3)]},
        [(f"S1-E-{i:02d}", sucio, "2026-09-01", "2026-09-30", 100_000.0, True)
         for i in (1, 2, 3)],
    )
    consola = _operador_sin_membresias(ids, monkeypatch)
    limpiar_cache_metricas()

    cuerpo = _pedir(client, _cab(consola["token"]))
    top = _fila(cuerpo, "suc")["metricas"]["top_proveedores"]

    # Las tres filas siguen siendo UN proveedor con TRES contratos: el saneo no
    # agrupa, sólo cambia lo que sale.
    assert len(top) == 1
    assert top[0]["contratos_activos"] == 3
    assert "juan.perez@gmail.example" not in top[0]["nombre"]
    assert "300 555 8899" not in top[0]["nombre"]
    assert top[0]["nombre"].startswith("Juan Perez Distribuciones")
    # Y ningún string de TODA la respuesta trae una arroba.
    assert [t for t in _todos_los_textos(cuerpo) if "@" in t] == []


def test_el_saneo_del_nombre_no_reagrupa_ni_reordena(client, monkeypatch):
    """El conteo y el orden se hacen con el nombre ORIGINAL.

    Si se agrupara por la versión saneada, dos proveedores distintos cuyos
    nombres se enmascaran igual se fundirían en una fila y el conteo mentiría.
    """
    from app.plataforma_metricas import sanear_nombre_proveedor

    assert sanear_nombre_proveedor("Alpina") == "Alpina"
    assert "@" not in sanear_nombre_proveedor("ventas@alpina.example")
    assert "3005558899" not in sanear_nombre_proveedor("Alpina 3005558899")
    assert "300-555-8899" not in sanear_nombre_proveedor("Alpina 300-555-8899")
    # Menos de 7 dígitos no es un teléfono: un código interno se conserva.
    assert sanear_nombre_proveedor("Alpina 123456") == "Alpina 123456"
    # Tope de largo, con recorte limpio.
    largo = sanear_nombre_proveedor("Distribuidora " + "muy larga " * 40)
    assert len(largo) <= 80
    assert largo.endswith("…")


# ════════════════════════════════════════════════════════════════════════════
# Base rota: la fila se marca, el panel sigue
# ════════════════════════════════════════════════════════════════════════════

def test_base_rota_marca_error_y_el_resto_funciona(client, monkeypatch):
    _ids, cab = _escenario(client, monkeypatch)
    cuerpo = _pedir(client, cab)

    roto = _fila(cuerpo, "roto")
    assert roto["metricas"] is None
    assert roto["estado_cuenta"] == "activo"
    assert roto["error"] == "No se pudo leer la base de este cliente."

    # El resto no se enteró.
    assert _fila(cuerpo, "acme")["metricas"]["ingreso_contratado_mes"] == ACME_INGRESO
    assert _fila(cuerpo, "beta")["metricas"]["ingreso_contratado_mes"] == BETA_INGRESO


def test_el_error_no_filtra_la_base_ni_el_mensaje_del_driver(client, monkeypatch):
    """El texto es FIJO: ni la URL, ni el nombre del archivo, ni lo que dijo
    SQLite. Ese detalle va al log del servidor, no al navegador."""
    _ids, cab = _escenario(client, monkeypatch)
    texto = _fila(_pedir(client, cab), "roto")["error"]

    for prohibido in ("sqlite", "recabra_roto", ".db", "/", "database", "file is not"):
        assert prohibido not in texto.lower()


# ════════════════════════════════════════════════════════════════════════════
# Caché de 5 minutos + bitácora del registro
# ════════════════════════════════════════════════════════════════════════════

def test_segunda_llamada_sale_del_cache(client, monkeypatch):
    _ids, cab = _escenario(client, monkeypatch)

    primera = _pedir(client, cab)
    segunda = _pedir(client, cab)

    assert primera["de_cache"] is False
    assert segunda["de_cache"] is True
    # El `generado_en` es el del CÁLCULO, no el de la lectura: mentirlo haría
    # creer que los números son más frescos de lo que son.
    assert segunda["generado_en"] == primera["generado_en"]
    assert segunda["consolidado"] == primera["consolidado"]

    # Otro período no se sirve del caché del primero.
    assert _pedir(client, cab, "2026-08")["de_cache"] is False


def test_la_bitacora_anota_cada_consulta_incluida_la_cacheada(client, monkeypatch):
    """La bitácora registra el ACCESO, no el cálculo: un acierto de caché
    también es un operador viendo los números."""
    from app.clientes import sesion_registro
    from app.models.plataforma import BitacoraPlataforma

    _ids, cab = _escenario(client, monkeypatch)

    _pedir(client, cab)              # calcula
    _pedir(client, cab)              # caché
    _pedir(client, cab, "2026-08")   # otro período

    reg = sesion_registro()
    try:
        filas = reg.query(BitacoraPlataforma).order_by(BitacoraPlataforma.id).all()
        lineas = [(f.email, f.accion, f.periodo) for f in filas]
        fechas = [f.en for f in filas]
    finally:
        reg.close()

    assert lineas == [
        ("op@recabra.co", "metricas", "2026-09"),
        ("op@recabra.co", "metricas", "2026-09"),
        ("op@recabra.co", "metricas", "2026-08"),
    ]
    assert all(f is not None for f in fechas)


def test_las_metricas_no_escriben_en_la_base_del_cliente(client, monkeypatch):
    """Read-only de verdad: ni una fila nueva, ni una línea de ``audit_log``."""
    from app.clientes import buscar, sesion_de
    from app.models.models import AuditEntry, Space, SpaceLease

    _ids, cab = _escenario(client, monkeypatch)

    def foto():
        db = sesion_de(buscar("acme"))
        try:
            return (
                db.query(Space).count(),
                db.query(SpaceLease).count(),
                db.query(AuditEntry).count(),
            )
        finally:
            db.close()

    antes = foto()
    _pedir(client, cab)
    _pedir(client, cab, "2026-08")
    assert foto() == antes


# ════════════════════════════════════════════════════════════════════════════
# Puerta: 403, 422 y la frontera del JSON
# ════════════════════════════════════════════════════════════════════════════

def test_403_para_no_operador_y_para_el_legado(client, admin, monkeypatch):
    monkeypatch.setenv("OPERADOR_EMAILS", "otro@x.co")
    ids = Identidades(client)
    cab = _fundar(ids, "uid-nop", "nop@x.co", "nop", "No Op")

    assert client.get("/api/plataforma/metricas", headers=cab).status_code == 403
    assert client.get("/api/plataforma/metricas", headers=admin).status_code == 403
    assert client.get("/api/plataforma/metricas").status_code == 401


def test_periodo_malformado_da_422(client, monkeypatch):
    _ids, cab = _escenario(client, monkeypatch)

    for malo in ("2026-13", "2026-00", "26-09", "2026-9", "septiembre", "2026-09-01", "2026/09"):
        r = client.get(f"/api/plataforma/metricas?periodo={malo}", headers=cab)
        assert r.status_code == 422, f"{malo} -> {r.status_code}"


def test_sin_parametro_es_el_mes_en_curso_en_utc(client, monkeypatch):
    from datetime import datetime, timezone

    _ids, cab = _escenario(client, monkeypatch)
    r = client.get("/api/plataforma/metricas", headers=cab)
    assert r.status_code == 200, r.text

    hoy = datetime.now(timezone.utc).date()
    assert r.json()["periodo"]["anio_mes"] == f"{hoy.year:04d}-{hoy.month:02d}"


def _recorrer(nodo, camino="raiz"):
    """(camino, clave, valor) de cada nodo del JSON, para inspeccionarlo entero."""
    if isinstance(nodo, dict):
        for k, v in nodo.items():
            yield f"{camino}.{k}", k, v
            yield from _recorrer(v, f"{camino}.{k}")
    elif isinstance(nodo, list):
        for i, v in enumerate(nodo):
            yield from _recorrer(v, f"{camino}[{i}]")


def test_el_json_no_trae_ninguna_clave_prohibida(client, monkeypatch):
    """La frontera dura de la spec, verificada sobre el JSON REAL."""
    _ids, cab = _escenario(client, monkeypatch)
    cuerpo = _pedir(client, cab)

    prohibidas = {
        # filas de negocio
        "leases", "space_leases", "spaces", "espacios", "contratos", "suppliers",
        "proveedores", "layout", "fixtures", "fixtures_json",
        # valores de contratos individuales
        "monthly_rent", "canon", "negotiatedValue", "start_date", "end_date",
        "marca", "supplier_id", "space_id", "lease_id", "code", "svg_id",
        # personas
        "email", "correo", "usuarios", "nombre_usuario", "firebase_uid", "ultimo_login",
        # lo que nunca sale
        "notas", "notes", "fotos", "files", "bitacora", "audit_log", "motivo",
        "cambiado_por", "ip",
    }
    for camino, clave, _valor in _recorrer(cuerpo):
        assert clave not in prohibidas, f"clave prohibida en {camino}"

    # Y en el texto plano tampoco aparecen los correos de los usuarios finales.
    crudo = json.dumps(cuerpo)
    for correo in ("duena@acme.co", "dueno@beta.co"):
        assert correo not in crudo


def test_los_unicos_arreglos_son_clientes_y_top_proveedores(client, monkeypatch):
    _ids, cab = _escenario(client, monkeypatch)
    cuerpo = _pedir(client, cab)

    arreglos = [
        (camino, clave) for camino, clave, valor in _recorrer(cuerpo)
        if isinstance(valor, list)
    ]
    assert arreglos, "el recorrido no encontró ningún arreglo: la prueba no probó nada"
    for camino, clave in arreglos:
        assert clave in ("clientes", "top_proveedores"), camino


def test_cada_proveedor_del_top_trae_exactamente_dos_campos(client, monkeypatch):
    _ids, cab = _escenario(client, monkeypatch)
    cuerpo = _pedir(client, cab)

    tops = [cuerpo["consolidado"]["top_proveedores"]]
    tops += [c["metricas"]["top_proveedores"] for c in cuerpo["clientes"] if c["metricas"]]
    vistos = 0
    for top in tops:
        assert len(top) <= 5
        for p in top:
            assert set(p.keys()) == {"nombre", "contratos_activos"}
            vistos += 1
    assert vistos > 0


# ════════════════════════════════════════════════════════════════════════════
# La puerta del operador SIN membresías (/oauth)
# ════════════════════════════════════════════════════════════════════════════

def test_oauth_operador_sin_membresias_entra_a_la_consola(client, monkeypatch):
    ids = Identidades(client)
    cuerpo = _operador_sin_membresias(ids, monkeypatch)

    assert cuerpo["plataforma"] is True
    assert cuerpo["cliente"] == "plataforma"
    assert cuerpo["cliente_nombre"] == "Plataforma"
    assert cuerpo["email"] == "op@recabra.co"
    # Mínimo privilegio: la consola no necesita admin.
    assert cuerpo["role"] == "worker"


def test_la_forma_del_jwt_no_cambia(client, monkeypatch):
    """Los mismos claims de siempre, ni uno nuevo: `role`, `epoca`, `cliente`,
    `sub`, `email` (más el `exp` de `create_token`)."""
    import jwt as pyjwt

    ids = Identidades(client)
    cuerpo = _operador_sin_membresias(ids, monkeypatch)
    payload = pyjwt.decode(cuerpo["token"], "test-secret", algorithms=["HS256"])

    assert set(payload.keys()) == {"role", "epoca", "cliente", "exp", "sub", "email"}
    assert payload["role"] == "worker"
    assert payload["cliente"] == "plataforma"
    assert payload["email"] == "op@recabra.co"
    # `sub` viaja como TEXTO de dígitos (RFC 7519; PyJWT ≥ 2.10 rechaza un
    # `sub` numérico) y vuelve a entero en `auth._sub_entero`.
    assert isinstance(payload["sub"], str) and payload["sub"].isdigit()
    assert isinstance(payload["epoca"], int)


def test_el_slug_plataforma_sigue_reservado_en_el_alta(client, monkeypatch):
    """El token dice `cliente: "plataforma"`; si alguien pudiera FUNDAR ese
    slug, ese token abriría una base de negocio de verdad."""
    from app.routers.alta import SLUGS_RESERVADOS

    assert "plataforma" in SLUGS_RESERVADOS

    ids = Identidades(client)
    ids.registrar("uid-usurpador", "usurpador@x.co")
    r = client.post(
        "/api/clientes/alta",
        json={"id_token": "uid-usurpador", "slug": "plataforma",
              "nombre": "Plataforma", "acepta_politica": True},
    )
    assert r.status_code == 409


def test_el_token_de_la_consola_abre_soy_y_metricas(client, monkeypatch):
    _ids, cab = _escenario(client, monkeypatch)

    r = client.get("/api/plataforma/soy", headers=cab)
    assert r.status_code == 200 and r.json()["operador"] is True
    assert client.get("/api/plataforma/metricas", headers=cab).status_code == 200
    assert client.get("/api/plataforma/clientes", headers=cab).status_code == 200


def test_el_token_de_la_consola_no_abre_ninguna_base_de_negocio(client, monkeypatch):
    """La frontera dura de la Fase 4: fuera de ``/api/plataforma`` ese token es
    un token que nombra un cliente que no existe. 401, por construcción."""
    _ids, cab = _escenario(client, monkeypatch)

    for ruta in (
        "/api/spaces/",
        "/api/layout/",
        "/api/dashboard/kpis",
        "/api/suppliers/",
        "/api/clientes/mi-export",
        "/api/spaces/map",
        "/api/bitacora/",
    ):
        r = client.get(ruta, headers=cab)
        assert r.status_code == 401, f"{ruta} -> {r.status_code} {r.text[:120]}"


def test_sin_membresias_y_sin_ser_operador_sigue_dando_el_403_de_siempre(client, monkeypatch):
    monkeypatch.setenv("OPERADOR_EMAILS", "el-operador-es-otro@x.co")
    ids = Identidades(client)
    ids.registrar("uid-nadie", "nadie@x.co")

    r = client.post("/api/auth/oauth", json={"id_token": "uid-nadie"})
    assert r.status_code == 403
    assert r.json()["detail"] == "Tu cuenta no tiene acceso a ningún cliente. Pedí una invitación."


def test_operador_con_membresias_conserva_el_flujo_de_siempre(client, monkeypatch):
    """Tener membresía manda: entra a SU cliente, con el cuerpo de siempre y
    sin la marca `plataforma`."""
    ids = Identidades(client)
    _fundar(ids, "uid-op2", "op2@recabra.co", "opmarket", "Op Market")
    monkeypatch.setenv("OPERADOR_EMAILS", "op2@recabra.co")

    r = client.post("/api/auth/oauth", json={"id_token": "uid-op2"})
    assert r.status_code == 200, r.text
    cuerpo = r.json()
    assert cuerpo["cliente"] == "opmarket"
    assert cuerpo["role"] == "admin"       # owner viaja como admin
    assert "plataforma" not in cuerpo
    assert "cliente_nombre" not in cuerpo  # el cuerpo de /oauth de siempre

    # Y su token sí abre su base de negocio, como antes.
    assert client.get("/api/spaces/", headers=_cab(cuerpo["token"])).status_code == 200


def test_sacar_el_correo_de_operador_mata_el_token_de_la_consola(client, monkeypatch):
    """El token de la consola vive de lo mismo que lo emitió: que ese correo
    siga en ``OPERADOR_EMAILS``. Sacarlo corta en el pedido siguiente."""
    _ids, cab = _escenario(client, monkeypatch)
    assert client.get("/api/plataforma/soy", headers=cab).status_code == 200

    monkeypatch.setenv("OPERADOR_EMAILS", "ya-no-es-el@x.co")
    assert client.get("/api/plataforma/soy", headers=cab).status_code == 401
