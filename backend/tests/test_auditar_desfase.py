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
    # El navegador pinta el contrato en el plano, que es lo que hace de verdad.
    _poner(client, admin, [_mueble(
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


def test_el_plano_que_lo_pinta_libre_tambien_se_reporta(client, admin, capsys):
    """El caso del reporte original: el mueble está, y el plano lo pinta libre.

    Es el que produce «está libre y el sistema no me deja venderlo»: la pantalla
    invita a vender y el servidor rechaza.
    """
    client.put("/api/layout/NAVE", headers=admin,
               json={"fixtures": [_mueble("IMP-17")], "base_updated_at": None})
    _vender(client, admin, "IMP-17")                     # nadie pinta el plano

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
               json={"fixtures": [_mueble("PUN-01")], "base_updated_at": None})
    _vender(client, admin, "PUN-01")

    n, _ = _auditar(capsys, "NAVE")
    assert n == 1
    n2, salida = _auditar(capsys, "TERRON")
    assert n2 == 0 and "No hay ninguna sede" in salida
