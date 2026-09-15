"""Dejar la base sin contratos y los planos sin estado comercial.

Para un momento puntual, no para el uso diario: el sistema estuvo en prueba, se
cargaron contratos por caminos que ya no existen, y quedó mezcla —filas de
prueba en la base y muebles marcados «Ocupado» a mano en el JSON—. Ahora que lo
comercial tiene UNA verdad, conviene barrer eso de una vez: lo que se cargue
después queda derecho porque ya no hay otro camino por donde entre.

Lo que se prueba es lo que separa esto de un botón peligroso: que el previo no
toque nada, que el seguro de la cuenta frene de verdad, que lo que NO se debe
llevar siga en pie —los planos, los proveedores, los montajes— y que después
quede realmente limpio.
"""
import json
from datetime import date, timedelta

HOY = date.today()


def _mueble(code, sede="NAVE", **extra):
    return {
        "id": f"f-{sede}-{code}", "code": code, "sede": sede, "type": "punta",
        "label": code, "cx": 3, "cz": 8, "rotY": 0,
        "w": 0.9, "d": 0.4, "h": 1.8, "color": "#6366f1", **extra,
    }


def _plano_viejo(fixtures, sede="NAVE"):
    """El snapshot escrito directo: por la API ya no entra lo comercial."""
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


def _snapshot(sede="NAVE"):
    from app.database import SessionLocal
    from app.models.models import LayoutSnapshot
    db = SessionLocal()
    try:
        snap = db.query(LayoutSnapshot).filter(LayoutSnapshot.sede == sede).first()
        return json.loads(snap.fixtures_json) if snap else None
    finally:
        db.close()


def _vender(client, admin, code="PUN-01", sede="NAVE"):
    r = client.post("/api/leases/bulk/confirmar", headers=admin, json={
        "sede": sede,
        "filas": [{"fila": 1, "espacio": code, "sede": sede, "proveedor": "MACA MANI",
                   "marca": "Maní", "valor": 200000,
                   "desde": HOY.isoformat(),
                   "hasta": (HOY + timedelta(days=30)).isoformat()}],
    })
    assert r.status_code == 200, r.text
    assert r.json()["creados"] == 1, r.text


def _previo(client, admin):
    r = client.get("/api/layout/empezar-de-cero/previo", headers=admin)
    assert r.status_code == 200, r.text
    return r.json()


def _aplicar(client, admin, esperados):
    return client.post("/api/layout/empezar-de-cero/aplicar", headers=admin,
                       json={"contratos_esperados": esperados})


def _comercial(client, admin):
    return client.get("/api/spaces/comercial", headers=admin).json()


# ─── El previo ───────────────────────────────────────────────────────────────

def test_EL_PREVIO_NO_TOCA_NADA(client, admin):
    client.put("/api/layout/NAVE", headers=admin,
               json={"fixtures": [_mueble("PUN-01")], "base_updated_at": None})
    _vender(client, admin)

    p = _previo(client, admin)
    assert p["contratos"] == 1
    assert p["aplicado"] is False
    # Y sigue todo donde estaba.
    assert len(_comercial(client, admin)) == 1
    assert _previo(client, admin)["contratos"] == 1


def test_el_previo_cuenta_el_residuo_del_plano_y_dice_en_qué_sede(client, admin):
    _plano_viejo([
        _mueble("PUN-01", status="occupied", supplierName="CAA"),
        _mueble("PUN-02"),
    ], sede="NAVE")
    _plano_viejo([_mueble("IMP-09", sede="TERRON", status="free")], sede="TERRON")

    p = _previo(client, admin)
    assert p["muebles_con_residuo"] == 2, p
    assert p["sedes_con_residuo"] == ["NAVE", "TERRON"]


def test_un_plano_ya_limpio_no_cuenta_residuo(client, admin):
    """La mitad que se olvida: no inventar trabajo donde no hay."""
    client.put("/api/layout/NAVE", headers=admin,
               json={"fixtures": [_mueble("PUN-01")], "base_updated_at": None})
    p = _previo(client, admin)
    assert p["muebles_con_residuo"] == 0
    assert p["sedes_con_residuo"] == []


# ─── El seguro ───────────────────────────────────────────────────────────────

def test_LA_CUENTA_QUE_NO_COINCIDE_FRENA_Y_NO_BORRA_NADA(client, admin):
    """Un botón que se lleva todos los contratos con un clic se aprieta sin
    querer, y esto no se deshace."""
    client.put("/api/layout/NAVE", headers=admin,
               json={"fixtures": [_mueble("PUN-01")], "base_updated_at": None})
    _vender(client, admin)

    r = _aplicar(client, admin, esperados=7)
    assert r.status_code == 409, r.text
    assert r.json()["detail"]["code"] == "cuenta_no_coincide"
    assert r.json()["detail"]["contratos"] == 1
    assert len(_comercial(client, admin)) == 1, "frenó y borró igual"


def test_si_alguien_vende_entre_el_previo_y_el_boton_tambien_frena(client, admin):
    """La razón de fondo del seguro: no llevarse algo que nadie vio."""
    client.put("/api/layout/NAVE", headers=admin, json={
        "fixtures": [_mueble("PUN-01"), _mueble("PUN-02")], "base_updated_at": None})
    _vender(client, admin, "PUN-01")
    visto = _previo(client, admin)["contratos"]

    _vender(client, admin, "PUN-02")  # alguien vendió mientras tanto

    assert _aplicar(client, admin, esperados=visto).status_code == 409
    assert len(_comercial(client, admin)) == 2


def test_UN_MERCADERISTA_NO_PUEDE_NI_MIRAR(client, admin, worker):
    assert client.get("/api/layout/empezar-de-cero/previo",
                      headers=worker).status_code == 403
    assert client.post("/api/layout/empezar-de-cero/aplicar", headers=worker,
                       json={"contratos_esperados": 0}).status_code == 403


def test_sin_sesion_tampoco(client):
    assert client.get("/api/layout/empezar-de-cero/previo").status_code in (401, 403)


# ─── Lo que sí se lleva ──────────────────────────────────────────────────────

def test_DESPUES_NO_QUEDA_UN_SOLO_CONTRATO(client, admin):
    client.put("/api/layout/NAVE", headers=admin, json={
        "fixtures": [_mueble("PUN-01"), _mueble("PUN-02")], "base_updated_at": None})
    _vender(client, admin, "PUN-01")
    _vender(client, admin, "PUN-02")

    r = _aplicar(client, admin, esperados=2)
    assert r.status_code == 200, r.text
    assert r.json()["contratos"] == 2 and r.json()["aplicado"] is True
    assert _comercial(client, admin) == {}


def test_EL_PLANO_DEJA_DE_OPINAR(client, admin):
    """Sin esto el plano seguiría pintando ocupado lo que ya no tiene contrato,
    que es justo el desfase que todo esto vino a eliminar."""
    _plano_viejo([_mueble("PUN-01", status="occupied", supplierName="CAA",
                          negotiatedValue=500000, startDate=HOY.isoformat(),
                          endDate=(HOY + timedelta(days=30)).isoformat(),
                          faceB={"status": "occupied", "supplierName": "NOEL"})])

    assert _aplicar(client, admin, esperados=0).status_code == 200

    guardado = _snapshot()[0]
    for campo in ("status", "supplierName", "negotiatedValue", "startDate", "endDate"):
        assert campo not in guardado, f"«{campo}» sobrevivió al barrido"
    assert "faceB" not in guardado, "la cara B quedó vacía en vez de irse"
    # Y el mueble sigue siendo el mueble.
    assert guardado["code"] == "PUN-01" and guardado["w"] == 0.9


def test_el_espacio_ocupado_vuelve_a_libre(client, admin):
    client.put("/api/layout/NAVE", headers=admin,
               json={"fixtures": [_mueble("PUN-01")], "base_updated_at": None})
    _vender(client, admin)
    _aplicar(client, admin, esperados=1)

    espacio = client.get("/api/spaces/by-code/NAVE-PUN-01", headers=admin).json()
    assert espacio["status"] == "free"
    assert espacio["active_lease"] is None


# ─── Lo que NO se lleva ──────────────────────────────────────────────────────

def test_LOS_PLANOS_NO_SE_TOCAN(client, admin):
    """La geometría es trabajo dibujado a mano, sede por sede."""
    client.put("/api/layout/NAVE", headers=admin, json={
        "fixtures": [_mueble("PUN-01"), _mueble("PUN-02"), _mueble("GON-60")],
        "base_updated_at": None})
    _vender(client, admin)

    _aplicar(client, admin, esperados=1)

    quedan = client.get("/api/layout/NAVE", headers=admin).json()["fixtures"]
    assert {f["code"] for f in quedan} == {"PUN-01", "PUN-02", "GON-60"}


def test_LOS_PROVEEDORES_NO_SE_TOCAN(client, admin):
    """Son contactos reales de gente real: volver a escribirlos es trabajo
    perdido, y un proveedor sin contratos no molesta a nadie."""
    client.put("/api/layout/NAVE", headers=admin,
               json={"fixtures": [_mueble("PUN-01")], "base_updated_at": None})
    _vender(client, admin)

    r = _aplicar(client, admin, esperados=1)
    assert r.json()["proveedores_intactos"] >= 1
    assert any(p["name"] == "MACA MANI"
               for p in client.get("/api/suppliers/", headers=admin).json())


def test_los_montajes_no_se_tocan(client, admin, worker):
    """Son la prueba de lo que un mercaderista armó, con su foto. Borrar la
    evidencia de trabajo hecho no lo decide una escoba."""
    client.put("/api/layout/NAVE", headers=admin,
               json={"fixtures": [_mueble("PUN-01")], "base_updated_at": None})
    _vender(client, admin)
    # La foto es obligatoria: es la prueba de que la exhibición quedó armada, y
    # es justamente por eso que este barrido no se lleva los montajes.
    jpg = b"\xff\xd8\xff\xe0" + b"0" * 64
    r = client.post("/api/mounts/", headers=worker,
                    data={"space_code": "NAVE-PUN-01", "estado": "montado",
                          "sede": "NAVE"},
                    files={"foto": ("montado.jpg", jpg, "image/jpeg")})
    assert r.status_code in (200, 201), r.text

    antes = _previo(client, admin)["montajes_intactos"]
    assert antes >= 1
    assert _aplicar(client, admin, esperados=1).json()["montajes_intactos"] == antes


# ─── Se puede repetir ────────────────────────────────────────────────────────

def test_correrlo_dos_veces_no_rompe_nada(client, admin):
    client.put("/api/layout/NAVE", headers=admin,
               json={"fixtures": [_mueble("PUN-01")], "base_updated_at": None})
    _vender(client, admin)
    assert _aplicar(client, admin, esperados=1).status_code == 200

    segunda = _aplicar(client, admin, esperados=0)
    assert segunda.status_code == 200
    assert segunda.json()["contratos"] == 0
    assert _comercial(client, admin) == {}


def test_QUEDA_EN_LA_BITACORA(client, admin):
    """Esto no se deshace: tiene que quedar quién y cuándo."""
    _plano_viejo([_mueble("PUN-01", status="occupied", supplierName="CAA")])
    _aplicar(client, admin, esperados=0)

    filas = client.get("/api/bitacora/", headers=admin).json()
    nuestra = [x for x in filas if x["accion"] == "contrato.barrido"]
    assert len(nuestra) == 1, filas
    assert "NAVE" in (nuestra[0]["detalle"] or "")
