"""Usar el sistema entero y preguntarle al auditor si quedó algún fantasma.

No prueba una función: ejercita el recorrido de una persona —dibujar dos
tiendas, vender, subir una planilla que cruza tiendas, intentar borrar algo
vendido, cancelar, retirar un espacio a mano— y al final corre el auditor.

Es la prueba que cierra el cambio: **una sola verdad quiere decir que después de
usar todo, el auditor da cero**. Cada pieza tiene sus pruebas; ésta comprueba
que juntas no dejan un hueco — que es donde vivía el bug original, en la juntura
entre el plano y la base y no adentro de ninguno de los dos.
"""
from datetime import date, timedelta

HOY = date.today()


def _mueble(code, sede, **extra):
    return {
        "id": f"f-{sede}-{code}", "code": code, "sede": sede, "type": "punta",
        "label": code, "cx": 3, "cz": 8, "rotY": 0,
        "w": 0.9, "d": 0.4, "h": 1.8, "color": "#6366f1", **extra,
    }


def _rev(client, admin, sede):
    return next((x["updated_at"] for x in
                 client.get("/api/layout/revisions", headers=admin).json()
                 if x["sede"] == sede), None)


def _guardar(client, admin, sede, fixtures):
    return client.put(f"/api/layout/{sede}", headers=admin, json={
        "fixtures": fixtures, "base_updated_at": _rev(client, admin, sede),
    })


def _vender(client, admin, filas, sede="NAVE"):
    r = client.post("/api/leases/bulk/confirmar", headers=admin,
                    json={"sede": sede, "filas": filas})
    assert r.status_code == 200, r.text
    return r.json()


def _fila(n, espacio, sede, proveedor, valor):
    return {"fila": n, "espacio": espacio, "sede": sede, "proveedor": proveedor,
            "marca": "Aseo", "valor": valor, "desde": HOY.isoformat(),
            "hasta": (HOY + timedelta(days=30)).isoformat()}


def _comercial(client, headers):
    r = client.get("/api/spaces/comercial", headers=headers)
    assert r.status_code == 200, r.text
    return r.json()


def _auditar(capsys):
    from app.database import SessionLocal
    from scripts.auditar_desfase import auditar
    db = SessionLocal()
    try:
        n = auditar(db)
    finally:
        db.close()
    return n, capsys.readouterr().out


def test_DESPUES_DE_USAR_TODO_EL_AUDITOR_DA_CERO(client, admin, worker, capsys):
    # ── Dos tiendas, cada una con su IMP-17 ──────────────────────────────────
    # Los códigos se repiten entre sedes: casi todas tienen un IMP-17, y
    # confundirlos fue exactamente el bug que se reportó.
    nave = [
        _mueble("IMP-17", "NAVE"), _mueble("IMP-18", "NAVE"),
        _mueble("GON-60", "NAVE", type="gondola", gondolaType="double", d=0.9),
    ]
    cj = [_mueble("IMP-17", "CIUDAD JARDIN"), _mueble("PUN-15", "CIUDAD JARDIN")]
    assert client.put("/api/layout/NAVE", headers=admin, json={
        "fixtures": nave, "base_updated_at": None}).status_code == 200
    assert client.put("/api/layout/CIUDAD JARDIN", headers=admin, json={
        "fixtures": cj, "base_updated_at": None}).status_code == 200

    guardado = client.get("/api/layout/NAVE", headers=admin).json()["fixtures"]
    assert all("status" not in f and "supplierName" not in f for f in guardado), \
        "el plano guardado volvió a opinar de lo comercial"

    # ── Vender ───────────────────────────────────────────────────────────────
    assert _vender(client, admin,
                   [_fila(1, "IMP-17", "NAVE", "COLGATE", 1_000_000)])["creados"] == 1

    com = _comercial(client, admin)
    assert com["NAVE-IMP-17"]["status"] == "occupied"
    assert com["NAVE-IMP-17"]["supplierName"] == "COLGATE"
    assert com["NAVE-IMP-17"]["negotiatedValue"] == 1_000_000
    assert "CIUDAD JARDIN-IMP-17" not in com, "se vendió el IMP-17 de la otra tienda"
    assert _comercial(client, worker)["NAVE-IMP-17"]["negotiatedValue"] == 0

    # ── Una planilla que cruza tiendas ───────────────────────────────────────
    # UNA planilla crea contratos en varias tiendas: la columna «sede» manda,
    # no la que esté abierta en pantalla.
    assert _vender(client, admin, [
        _fila(1, "PUN-15", "CIUDAD JARDIN", "FABULOSO", 500_000),
        _fila(2, "GON-60-B", "NAVE", "NOEL", 700_000),
    ])["creados"] == 2
    com = _comercial(client, admin)
    assert com["CIUDAD JARDIN-PUN-15"]["supplierName"] == "FABULOSO"
    assert com["NAVE-GON-60-B"]["supplierName"] == "NOEL"
    assert "NAVE-GON-60" not in com, "vender la cara B ocupó también la A"

    # ── Las tres puertas están cerradas ──────────────────────────────────────
    r = _guardar(client, admin, "NAVE", [nave[1], nave[2]])
    assert r.status_code == 409 and r.json()["detail"]["code"] == "contratos_vivos"
    assert "COLGATE" in r.json()["detail"]["choques"][0]

    r = _guardar(client, admin, "NAVE",
                 [nave[0], nave[1], dict(nave[2], gondolaType="single")])
    assert r.status_code == 409 and "GON-60-B" in r.json()["detail"]["choques"][0]

    assert _guardar(client, admin, "NAVE",
                    [dict(nave[0], rentable=False), nave[1], nave[2]]).status_code == 409

    # Lo que NO es sacar de circulación pasa sin ruido.
    nave[0] = dict(nave[0], cx=11)
    assert _guardar(client, admin, "NAVE", nave).status_code == 200
    nave = [nave[0], nave[2]]
    assert _guardar(client, admin, "NAVE", nave).status_code == 200

    # ── Cancelar libera el espacio en el acto ────────────────────────────────
    espacio = client.get("/api/spaces/by-code/NAVE-IMP-17", headers=admin).json()
    contrato = espacio["active_lease"] or espacio["upcoming_lease"]
    assert client.delete(f"/api/spaces/{espacio['id']}/leases/{contrato['id']}",
                         headers=admin).status_code in (200, 204)
    assert "NAVE-IMP-17" not in _comercial(client, admin)
    # Y recién ahora se puede sacar del plano.
    nave = [nave[1]]
    assert _guardar(client, admin, "NAVE", nave).status_code == 200

    # ── Retirar un espacio a mano ────────────────────────────────────────────
    e = client.post("/api/spaces/find-or-create", headers=admin, json={
        "code": "CIUDAD JARDIN-IMP-17", "sede": "CIUDAD JARDIN", "name": "IMP-17",
    }).json()
    client.patch(f"/api/spaces/{e['id']}/status", headers=admin,
                 json={"status": "maintenance", "notes": "vitrina rota"})
    com = _comercial(client, admin)
    assert com["CIUDAD JARDIN-IMP-17"]["status"] == "maintenance"
    assert com["CIUDAD JARDIN-IMP-17"]["observation"] == "vitrina rota"

    # ── Y el auditor no encuentra nada ───────────────────────────────────────
    total, salida = _auditar(capsys)
    assert total == 0, salida
    assert "sin desfase" in salida


def test_UN_PLANO_VIEJO_SE_IMPORTA_Y_DESPUES_EL_AUDITOR_DA_CERO(client, admin, capsys):
    """La otra mitad, de punta a punta y por HTTP.

    Un contrato que vive sólo en el JSON no está en ninguna tabla: no sale en
    ningún reporte, no genera aviso de vencimiento y no existe para nada que
    consulte la base. El auditor lo ve —es la dirección que el navegador no
    puede calcular— y los dos endpoints lo resuelven desde la pantalla, sin
    consola.
    """
    import json as _json
    from app.database import SessionLocal
    from app.models.models import LayoutSnapshot

    vendido = {
        **_mueble("PUN-07", "NAVE"),
        "status": "occupied", "supplierName": "CAA", "brandCategory": "Snacks",
        "negotiatedValue": 500_000, "startDate": HOY.isoformat(),
        "endDate": (HOY + timedelta(days=30)).isoformat(), "observation": "",
    }
    sin_proveedor = {
        **_mueble("PUN-08", "NAVE"),
        "status": "occupied", "supplierName": "", "brandCategory": "",
        "negotiatedValue": 0, "startDate": HOY.isoformat(),
        "endDate": (HOY + timedelta(days=30)).isoformat(), "observation": "",
    }
    # Escrito directo: por la API ya no entra, el servidor lo descarta.
    db = SessionLocal()
    try:
        db.add(LayoutSnapshot(sede="NAVE", fixtures_json=_json.dumps([vendido, sin_proveedor])))
        db.commit()
    finally:
        db.close()

    # El auditor lo ve, y ve que son dos.
    total, salida = _auditar(capsys)
    assert total == 2, salida
    assert "sólo en el JSON" in salida

    # El previo no escribe.
    previo = client.get("/api/layout/importacion/previo", headers=admin).json()
    assert len(previo["importables"]) == 1
    assert previo["incompletos"][0]["motivo"] == "le falta el proveedor"
    assert _comercial(client, admin) == {}, "el previo escribió"

    # Aplicar sí, y lo importado aparece en el mapa comercial.
    aplicado = client.post("/api/layout/importacion/aplicar", headers=admin).json()
    assert len(aplicado["importables"]) == 1
    e = _comercial(client, admin)["NAVE-PUN-07"]
    assert e["supplierName"] == "CAA" and e["negotiatedValue"] == 500_000

    # Y el auditor baja a UNO: queda el que no se puede importar, que es
    # correcto que siga marcado — es un contrato del plano que nadie puede usar.
    total, salida = _auditar(capsys)
    assert total == 1, salida
    assert "PUN-08" in salida


def test_BARRER_Y_VOLVER_A_CARGAR_LA_PLANILLA_QUEDA_LIMPIO(client, admin, capsys):
    """La pregunta que importa antes de apretar el botón: después de barrer,
    ¿una planilla entra sin un solo error y queda derecho?

    Recorre el camino entero: dos tiendas dibujadas, contratos de prueba y
    residuo del selector viejo, barrido, carga por planilla cruzando sedes, y
    el auditor al final.
    """
    import json as _json
    from app.database import SessionLocal
    from app.models.models import LayoutSnapshot

    # ── Dos tiendas con el mismo código, que es lo normal ────────────────────
    nave = [_mueble("IMP-17", "NAVE"), _mueble("PUN-01", "NAVE"),
            _mueble("GON-60", "NAVE", type="gondola", gondolaType="double", d=0.9)]
    cj = [_mueble("IMP-17", "CIUDAD JARDIN"), _mueble("PUN-15", "CIUDAD JARDIN")]
    assert client.put("/api/layout/NAVE", headers=admin, json={
        "fixtures": nave, "base_updated_at": None}).status_code == 200
    assert client.put("/api/layout/CIUDAD JARDIN", headers=admin, json={
        "fixtures": cj, "base_updated_at": None}).status_code == 200

    # Un contrato de prueba…
    _vender(client, admin, [_fila(1, "IMP-17", "NAVE", "VIEJO", 111_111)])
    # …y el residuo del selector de estado, escrito directo como quedó.
    db = SessionLocal()
    try:
        snap = db.query(LayoutSnapshot).filter(
            LayoutSnapshot.sede == "CIUDAD JARDIN").first()
        sucio = [dict(f, status="occupied") for f in _json.loads(snap.fixtures_json)]
        snap.fixtures_json = _json.dumps(sucio)
        db.commit()
    finally:
        db.close()

    # ── Barrer ───────────────────────────────────────────────────────────────
    previo = client.get("/api/layout/empezar-de-cero/previo", headers=admin).json()
    assert previo["contratos"] == 1
    assert previo["muebles_con_residuo"] == 2

    r = client.post("/api/layout/empezar-de-cero/aplicar", headers=admin,
                    json={"contratos_esperados": previo["contratos"]})
    assert r.status_code == 200, r.text
    assert _comercial(client, admin) == {}, "quedó algo vendido"

    # ── Y ahora la planilla, cruzando sedes y con una cara B ─────────────────
    resp = _vender(client, admin, [
        _fila(1, "IMP-17", "NAVE", "COLGATE", 1_000_000),
        _fila(2, "PUN-15", "CIUDAD JARDIN", "FABULOSO", 500_000),
        _fila(3, "GON-60-B", "NAVE", "NOEL", 700_000),
        _fila(4, "IMP-17", "CIUDAD JARDIN", "ALPINA", 400_000),
    ])
    assert resp["creados"] == 4, resp
    assert [f["estado"] for f in resp["filas"]].count("error") == 0, resp

    # Cada una en SU tienda, que es lo que rompía antes.
    com = _comercial(client, admin)
    assert com["NAVE-IMP-17"]["supplierName"] == "COLGATE"
    assert com["CIUDAD JARDIN-IMP-17"]["supplierName"] == "ALPINA"
    assert com["CIUDAD JARDIN-PUN-15"]["supplierName"] == "FABULOSO"
    assert com["NAVE-GON-60-B"]["supplierName"] == "NOEL"
    assert "NAVE-GON-60" not in com, "vender la cara B ocupó también la A"
    assert len(com) == 4

    # ── Sin desfase ──────────────────────────────────────────────────────────
    total, salida = _auditar(capsys)
    assert total == 0, salida
