"""Una sola respuesta a «¿esta góndola tiene cara B?».

Hubo dos. Vender y los editores contaban como doble la góndola sin
``gondolaType``; la fusión del navegador, la auditoría de «Contrato sin mueble»,
el guardarraíl del plano (``espacios_ofrecidos``), la importación de contratos
del plano y ``scripts/auditar_desfase.py`` exigían ``"double"`` escrito. Con una
góndola vieja sin el campo, Vender ofrecía la cara B y la vendía, pero borrar
la góndola no frenaba por ese contrato y la auditoría lo daba por fantasma.

Ahora es ``caras_de`` acá y ``carasDe`` en el frontend, con la regla laxa, y
los dos lados corren los MISMOS casos: ``frontend/scripts/casos/caras.json``
(el frontend, en ``probar-auditoria.mjs``).

Hasta las pruebas que no tocan la API piden ``client``: es el que apunta
``DATABASE_URL`` a una base descartable antes de importar ``app`` (ver
``conftest.py``). Importar ``app`` sin él deja el motor atado a la base de
desarrollo y las pruebas siguientes escriben ahí.
"""
import json
from datetime import timedelta
from pathlib import Path

from app.fechas import hoy as hoy_en_colombia  # el «hoy» del negocio: Colombia

HOY = hoy_en_colombia()
CASOS = Path(__file__).resolve().parents[2] / "frontend/scripts/casos/caras.json"


def _mueble(code, **extra):
    return {
        "id": f"f-{code}", "code": code, "sede": "NAVE", "type": "punta",
        "label": code, "cx": 3, "cz": 8, "rotY": 0,
        "w": 0.9, "d": 0.4, "h": 1.8, "color": "#6366f1", **extra,
    }


#: La góndola de un plano viejo: dibujada doble por los dos editores, ofrecida
#: con cara B por Vender, y sin ``gondolaType`` en el JSON.
VIEJA = _mueble("GON-60", type="gondola", d=0.9)
MURAL = _mueble("GON-61", type="gondola", gondolaType="wall")


def _guardar(client, admin, fixtures):
    return client.put("/api/layout/NAVE", headers=admin,
                      json={"fixtures": fixtures, "base_updated_at": None})


def _vender(client, admin, code):
    r = client.post("/api/leases/bulk/confirmar", headers=admin, json={
        "sede": "NAVE",
        "filas": [{"fila": 1, "espacio": code, "sede": "NAVE", "proveedor": "MACA MANI",
                   "valor": 200000, "desde": HOY.isoformat(),
                   "hasta": (HOY + timedelta(days=30)).isoformat()}],
    })
    assert r.status_code == 200, r.text
    assert r.json()["filas"][0]["lease_id"] is not None, r.text


def _plano_viejo(fixtures, sede="NAVE"):
    """El snapshot escrito por abajo: un JSON con contratos adentro ya no entra
    por la API, y es cómo quedaron los planos de antes del corte."""
    from app.database import SessionLocal
    from app.models.models import LayoutSnapshot
    db = SessionLocal()
    try:
        snap = db.query(LayoutSnapshot).filter(LayoutSnapshot.sede == sede).first()
        if snap is None:
            snap = LayoutSnapshot(sede=sede, fixtures_json="[]")
            db.add(snap)
        snap.fixtures_json = json.dumps(fixtures)
        db.commit()
    finally:
        db.close()


# ─── La regla, con los casos del frontend ─────────────────────────────────────

def test_caras_de_contesta_los_mismos_casos_que_carasDe(client):
    from app.plataforma_metricas import _es_gondola_doble
    from app.services.layout_lookup import caras_de

    casos = json.loads(CASOS.read_text(encoding="utf-8"))["casos"]
    assert len(casos) >= 10, "faltan los casos compartidos"
    mal = [f"{c['por']}: {c['mueble']} → {caras_de(c['mueble'])}, se esperaba {c['caras']}"
           for c in casos if caras_de(c["mueble"]) != c["caras"]]
    assert mal == []
    # Las métricas de la plataforma preguntan lo mismo, no una copia.
    for c in casos:
        assert _es_gondola_doble(c["mueble"]) is (c["caras"] == 2), c["por"]


# ─── Lo que el plano ofrece ───────────────────────────────────────────────────

def test_espacios_ofrecidos_incluye_la_cara_B_de_una_gondola_sin_gondolaType(client):
    from app.services.layout_lookup import espacios_ofrecidos

    assert espacios_ofrecidos([VIEJA], "NAVE") == {"NAVE-GON-60", "NAVE-GON-60-B"}


def test_una_gondola_mural_no_ofrece_cara_B(client):
    from app.services.layout_lookup import espacios_ofrecidos

    assert espacios_ofrecidos([MURAL], "NAVE") == {"NAVE-GON-61"}


def test_BORRAR_LA_GONDOLA_VIEJA_CON_LA_CARA_B_VENDIDA_SE_FRENA(client, admin):
    """El caso entero: Vender la ofreció, se vendió, y el guardarraíl la cuida.

    Con la regla estricta el servidor no contaba esa cara como espacio, así que
    borrar la góndola pasaba y el contrato quedaba vivo sin nada que lo
    mostrara: el fantasma de siempre.
    """
    otro = _mueble("PUN-01")
    assert _guardar(client, admin, [VIEJA, otro]).status_code == 200
    _vender(client, admin, "GON-60-B")

    r = _guardar(client, admin, [otro])
    assert r.status_code == 409, r.text
    assert r.json()["detail"]["code"] == "contratos_vivos"
    assert "GON-60-B" in r.json()["detail"]["choques"][0]

    # Escribirle `"double"` no retira nada: es la misma góndola.
    assert _guardar(client, admin, [{**VIEJA, "gondolaType": "double"}, otro]).status_code == 200


# ─── La importación de contratos del plano ────────────────────────────────────

def _cara_b_vendida(mueble):
    return {**mueble, "faceB": {
        "status": "occupied", "supplierName": "NUTRESA", "brandCategory": "",
        "negotiatedValue": 300000, "startDate": HOY.isoformat(),
        "endDate": (HOY + timedelta(days=30)).isoformat(), "observation": "",
    }}


def test_la_importacion_trae_la_cara_B_de_una_gondola_sin_gondolaType(client, admin):
    from app.services.importar_del_plano import caras_vendidas

    assert [c for c, _ in caras_vendidas([_cara_b_vendida(VIEJA)])] == ["GON-60-B"]

    _plano_viejo([_cara_b_vendida(VIEJA)])
    previo = client.get("/api/layout/importacion/previo", headers=admin)
    assert previo.status_code == 200, previo.text
    assert [x["espacio"] for x in previo.json()["importables"]] == ["NAVE-GON-60-B"]

    r = client.post("/api/layout/importacion/aplicar", headers=admin)
    assert r.status_code == 200, r.text
    comercial = client.get("/api/spaces/comercial", headers=admin).json()
    assert comercial["NAVE-GON-60-B"]["supplierName"] == "NUTRESA"


def test_la_importacion_no_trae_una_cara_B_de_una_mural(client, admin):
    """Una mural no tiene cara B: lo que diga su ``faceB`` no es un contrato."""
    from app.services.importar_del_plano import caras_vendidas

    assert caras_vendidas([_cara_b_vendida(MURAL)]) == []


# ─── El auditor de consola ────────────────────────────────────────────────────

def test_el_auditor_de_consola_cuenta_la_cara_B_de_una_gondola_sin_gondolaType(client):
    from scripts.auditar_desfase import caras_del_plano

    assert set(caras_del_plano([VIEJA])) == {"GON-60", "GON-60-B"}
    assert set(caras_del_plano([MURAL])) == {"GON-61"}


# ─── Las puertas que crean contratos ──────────────────────────────────────────
#
# `espacios_ofrecidos` no ofrece la cara B de una punta ni de una mural, pero la
# planilla y el contrato suelto le recortaban el `-B` a cualquier mueble y lo
# vendían igual. Supervisar lo marcaba enseguida como «Contrato sin mueble»: un
# aviso que la propia aplicación fabricaba.

def _revisar(client, admin, *codigos):
    r = client.post("/api/leases/bulk/validar", headers=admin, json={
        "sede": "NAVE",
        "filas": [{"fila": k + 1, "espacio": c, "sede": "NAVE", "proveedor": "MACA MANI",
                   "valor": 200000, "desde": HOY.isoformat(),
                   "hasta": (HOY + timedelta(days=30)).isoformat()}
                  for k, c in enumerate(codigos)],
    })
    assert r.status_code == 200, r.text
    return r.json()["filas"]


def test_LA_PLANILLA_NO_VENDE_LA_CARA_B_DE_UN_MUEBLE_DE_UNA_CARA(client, admin):
    assert _guardar(client, admin, [_mueble("PUN-01"), MURAL, VIEJA]).status_code == 200

    filas = _revisar(client, admin, "PUN-01-B", "GON-61-B", "NAVE-GON-61-B", "GON-60-B", "PUN-01")
    estados = {f["fila"]: f["estado"] for f in filas}
    assert estados == {1: "error", 2: "error", 3: "error", 4: "ok", 5: "ok"}, filas
    for f in filas[:3]:
        assert any("una sola cara" in m for m in f["mensajes"]), f
    # El aviso nombra el mueble que sí existe, no un «no hay ningún mueble».
    assert any("«PUN-01»" in m for m in filas[0]["mensajes"]), filas[0]
    assert not any("ningún mueble" in m for m in filas[0]["mensajes"]), filas[0]

    r = client.post("/api/leases/bulk/confirmar", headers=admin, json={
        "sede": "NAVE",
        "filas": [{"fila": 1, "espacio": "PUN-01-B", "sede": "NAVE", "proveedor": "MACA MANI",
                   "valor": 200000, "desde": HOY.isoformat(),
                   "hasta": (HOY + timedelta(days=30)).isoformat()}],
    })
    assert r.status_code == 200, r.text
    assert r.json()["filas"][0]["lease_id"] is None, r.text
    assert r.json()["creados"] == 0


def test_EL_CONTRATO_SUELTO_NO_VENDE_LA_CARA_B_DE_UN_MUEBLE_DE_UNA_CARA(client, admin):
    assert _guardar(client, admin, [_mueble("PUN-01"), MURAL, VIEJA]).status_code == 200
    proveedor = client.post("/api/suppliers/find-or-create", headers=admin,
                            json={"name": "MACA MANI"}).json()["id"]

    def contratar(codigo):
        espacio = client.post("/api/spaces/find-or-create", headers=admin, json={
            "code": codigo, "name": codigo, "zone": "punta", "sede": "NAVE", "area_m2": 1.0,
        })
        assert espacio.status_code in (200, 201), espacio.text
        return client.post(f"/api/spaces/{espacio.json()['id']}/leases", headers=admin, json={
            "supplier_id": proveedor, "start_date": HOY.isoformat(),
            "end_date": (HOY + timedelta(days=30)).isoformat(), "monthly_rent": 200000,
        })

    for codigo in ("NAVE-PUN-01-B", "NAVE-GON-61-B"):
        r = contratar(codigo)
        assert r.status_code == 409, r.text
        assert "una sola cara" in r.json()["detail"], r.text
    # La cara B de una góndola doble —también la vieja, sin `gondolaType`— sí.
    assert contratar("NAVE-GON-60-B").status_code == 201
    assert contratar("NAVE-PUN-01").status_code == 201
