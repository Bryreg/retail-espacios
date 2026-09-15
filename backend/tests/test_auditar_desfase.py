"""El auditor de desfase: que encuentre los fantasmas y no invente ninguno.

Un auditor que reporta de más se deja de leer, y uno que reporta de menos es
peor que no tenerlo. Las dos mitades se prueban.

Los tres casos que encuentra salieron de ejercitar el sistema, no de leerlo:
borrar un mueble del plano, pasar una góndola de doble a simple y marcarla «no
comercializable» dejan, las tres, el contrato vivo en la base. El plano nunca
escribe en la base — no es un olvido, es que no existe ese camino.
"""
from datetime import date, timedelta

HOY = date.today()


def _mueble(code, **extra):
    return {
        "id": f"f-{code}", "code": code, "sede": "NAVE", "type": "punta",
        "label": code, "cx": 3, "cz": 8, "rotY": 0,
        "w": 0.9, "d": 0.4, "h": 1.8, "color": "#6366f1", "status": "free",
        "supplierName": "", "brandCategory": "", "negotiatedValue": 0,
        "startDate": "", "endDate": "", "observation": "", **extra,
    }


def _rev(client, admin):
    return next((x["updated_at"] for x in
                 client.get("/api/layout/revisions", headers=admin).json()
                 if x["sede"] == "NAVE"), None)


def _poner(client, admin, fixtures):
    return client.put("/api/layout/NAVE", headers=admin,
                      json={"fixtures": fixtures, "base_updated_at": _rev(client, admin)})

def _plano_viejo(fixtures, sede="NAVE"):
    """Escribe el snapshot DIRECTO, sin pasar por la API.

    Hace falta porque `PUT /api/layout/{sede}` ya descarta el estado comercial:
    lo comercial es de la base. O sea que un JSON con contratos adentro ya no se
    puede crear por la API — y es exactamente el dato que estas pruebas
    necesitan, porque es cómo quedaron los planos guardados ANTES del corte.
    """
    import json as _json
    from app.database import SessionLocal
    from app.models.models import LayoutSnapshot
    db = SessionLocal()
    try:
        snap = db.query(LayoutSnapshot).filter(LayoutSnapshot.sede == sede).first()
        if snap is None:
            snap = LayoutSnapshot(sede=sede, fixtures_json="[]")
            db.add(snap)
        snap.fixtures_json = _json.dumps(fixtures)
        db.commit()
    finally:
        db.close()



def _vender(client, admin, code, dias=30):
    return client.post("/api/leases/bulk/confirmar", headers=admin, json={
        "sede": "NAVE",
        "filas": [{"fila": 1, "espacio": code, "sede": "NAVE", "proveedor": "MACA MANI",
                   "valor": 200000, "desde": HOY.isoformat(),
                   "hasta": (HOY + timedelta(days=dias)).isoformat()}],
    })


def _auditar(capsys, sede=None):
    from app.database import SessionLocal
    from scripts.auditar_desfase import auditar
    db = SessionLocal()
    try:
        n = auditar(db, sede)
    finally:
        db.close()
    return n, capsys.readouterr().out


def test_un_plano_al_dia_no_reporta_nada(client, admin, capsys):
    """La mitad que se olvida: un auditor que grita siempre se deja de leer."""
    client.put("/api/layout/NAVE", headers=admin,
               json={"fixtures": [_mueble("PUN-01")], "base_updated_at": None})
    _vender(client, admin, "PUN-01")
    # Un plano VIEJO que todavía pinta el contrato: es el dato que quedó de
    # antes del corte, y sobre él el auditor no tiene que reportar nada.
    _plano_viejo([_mueble(
        "PUN-01", status="occupied", supplierName="MACA MANI",
        startDate=HOY.isoformat(), endDate=(HOY + timedelta(days=30)).isoformat(),
    )])

    n, salida = _auditar(capsys)
    assert n == 0, salida
    assert "sin desfase" in salida


def test_BORRAR_EL_MUEBLE_DEL_PLANO_deja_el_contrato_vivo(client, admin, capsys):
    client.put("/api/layout/NAVE", headers=admin,
               json={"fixtures": [_mueble("PUN-01"), _mueble("PUN-02")], "base_updated_at": None})
    _vender(client, admin, "PUN-01")
    _poner(client, admin, [_mueble("PUN-02")])          # PUN-01 se borra del plano

    n, salida = _auditar(capsys)
    assert n == 1, salida
    assert "PUN-01" in salida and "el plano no lo ofrece" in salida


def test_MARCARLO_NO_COMERCIALIZABLE_deja_el_contrato_vivo(client, admin, capsys):
    client.put("/api/layout/NAVE", headers=admin,
               json={"fixtures": [_mueble("PUN-01")], "base_updated_at": None})
    _vender(client, admin, "PUN-01")
    _poner(client, admin, [_mueble("PUN-01", rentable=False)])

    n, salida = _auditar(capsys)
    assert n == 1, salida
    assert "PUN-01" in salida


def test_LA_CARA_B_QUE_DESAPARECE_deja_el_contrato_vivo(client, admin, capsys):
    """Pasar una góndola de doble a simple borra un espacio vendible entero."""
    doble = _mueble("GON-60", type="gondola", gondolaType="double", d=0.9)
    client.put("/api/layout/NAVE", headers=admin,
               json={"fixtures": [doble], "base_updated_at": None})
    assert _vender(client, admin, "GON-60-B").json()["creados"] == 1
    _poner(client, admin, [dict(doble, gondolaType="single")])

    n, salida = _auditar(capsys)
    assert n == 1, salida
    assert "GON-60-B" in salida


def test_UN_PLANO_QUE_NO_OPINA_NO_ES_DESFASE(client, admin, capsys):
    """Y acá se ve por qué el corte arregla el problema de raíz.

    Éste es el caso del reporte original —IMP-17 vendido en la base, nadie pintó
    el plano— y ya NO es desfase: desde que lo comercial es de la base, el
    layout no guarda `status` y no tiene ninguna opinión que pueda contradecirla.
    El navegador pide el estado a `/spaces/comercial` y lo pinta vendido.

    Tomar la ausencia por «libre» sería marcar como desfasado todo lo vendido de
    todas las sedes, que es la manera más rápida de que un auditor se deje de
    leer.
    """
    client.put("/api/layout/NAVE", headers=admin,
               json={"fixtures": [_mueble("IMP-17")], "base_updated_at": None})
    _vender(client, admin, "IMP-17")

    n, salida = _auditar(capsys)
    assert n == 0, salida


def test_un_plano_VIEJO_que_lo_pinta_libre_si_se_reporta(client, admin, capsys):
    """Los planos guardados antes del corte sí llevan `status`, y ahí la
    contradicción es real: el plano dice libre y la base dice vendido."""
    _plano_viejo([_mueble("IMP-17", status="free")])
    _vender(client, admin, "IMP-17")

    n, salida = _auditar(capsys)
    assert n == 1, salida
    assert "IMP-17" in salida and "pinta LIBRE" in salida


def test_un_contrato_vencido_no_es_desfase(client, admin, capsys):
    """Es historia. Reportarlo llenaría la lista de ruido permanente."""
    client.put("/api/layout/NAVE", headers=admin,
               json={"fixtures": [_mueble("PUN-01")], "base_updated_at": None})
    client.post("/api/leases/bulk/confirmar", headers=admin, json={
        "sede": "NAVE",
        "filas": [{"fila": 1, "espacio": "PUN-01", "sede": "NAVE", "proveedor": "VIEJO",
                   "valor": 100000,
                   "desde": (HOY - timedelta(days=90)).isoformat(),
                   "hasta": (HOY - timedelta(days=5)).isoformat()}],
    })
    _poner(client, admin, [])                            # y encima se borra el mueble

    n, salida = _auditar(capsys)
    assert n == 0, salida


def test_se_puede_auditar_una_sola_sede(client, admin, capsys):
    client.put("/api/layout/NAVE", headers=admin,
               json={"fixtures": [_mueble("PUN-01"), _mueble("PUN-02")], "base_updated_at": None})
    _vender(client, admin, "PUN-01")
    _poner(client, admin, [_mueble("PUN-02")])           # PUN-01 sale del plano

    n, _ = _auditar(capsys, "NAVE")
    assert n == 1
    n2, salida = _auditar(capsys, "TERRON")
    assert n2 == 0 and "No hay ninguna sede" in salida


def test_UN_CONTRATO_QUE_SOLO_VIVE_EN_EL_PLANO_tambien_se_reporta(client, admin, capsys):
    """La dirección contraria, y la que decide si se puede ir a relacional.

    El panel del plano 2D tuvo campos de contrato editables que escribían el
    JSON sin tocar la base —se quitaron por esto mismo—, así que un contrato
    cargado así sigue viviendo sólo ahí: no sale en ningún reporte, no genera
    aviso de vencimiento y no existe para nada que consulte la base.
    """
    _plano_viejo([_mueble(
        "PUN-07", status="occupied", supplierName="SÓLO EN EL PLANO",
        negotiatedValue=500000, startDate=HOY.isoformat(),
        endDate=(HOY + timedelta(days=20)).isoformat(),
    )])

    n, salida = _auditar(capsys)
    assert n == 1, salida
    assert "SÓLO EN EL PLANO" in salida
    assert "sólo en el JSON" in salida


def test_un_contrato_del_plano_ya_vencido_no_es_desfase(client, admin, capsys):
    _plano_viejo([_mueble(
        "PUN-07", status="occupied", supplierName="VIEJO",
        startDate=(HOY - timedelta(days=90)).isoformat(),
        endDate=(HOY - timedelta(days=5)).isoformat(),
    )])
    n, salida = _auditar(capsys)
    assert n == 0, salida
