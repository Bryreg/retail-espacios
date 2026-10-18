"""El auditor de desfase: que encuentre los fantasmas y no invente ninguno.

Un auditor que reporta de más se deja de leer, y uno que reporta de menos es
peor que no tenerlo. Las dos mitades se prueban.

Los tres casos que encuentra salieron de ejercitar el sistema, no de leerlo:
borrar un mueble del plano, pasar una góndola de doble a simple y marcarla «no
comercializable» dejaban, las tres, el contrato vivo en la base. El plano nunca
escribe en la base — no es un olvido, es que no existe ese camino.

**Las tres puertas ya están cerradas hacia adelante**: el guardado del plano las
frena y nombra el contrato (`tests/test_contrato_sin_mueble.py`). Pero el auditor
sigue haciendo falta, y por eso estas pruebas siguen acá: lo que ya está
desfasado en la base de producción se guardó antes de que ese guardarraíl
existiera, y nadie lo va a arreglar solo. Por eso el desfase se fabrica acá
escribiendo el snapshot por abajo, con `_plano_viejo` — que es exactamente cómo
quedó.
"""
from datetime import timedelta

from app.fechas import hoy as hoy_en_colombia  # el «hoy» del negocio: Colombia

HOY = hoy_en_colombia()


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

    # Hoy el guardado lo frena y nombra el contrato: la puerta está cerrada.
    assert _poner(client, admin, [_mueble("PUN-02")]).status_code == 409

    # Pero lo que ya está desfasado se guardó antes de que ese guardarraíl
    # existiera, y sigue ahí hasta que alguien lo mire.
    _plano_viejo([_mueble("PUN-02")])

    n, salida = _auditar(capsys)
    assert n == 1, salida
    assert "PUN-01" in salida and "el plano no lo ofrece" in salida


def test_MARCARLO_NO_COMERCIALIZABLE_deja_el_contrato_vivo(client, admin, capsys):
    client.put("/api/layout/NAVE", headers=admin,
               json={"fixtures": [_mueble("PUN-01")], "base_updated_at": None})
    _vender(client, admin, "PUN-01")

    assert _poner(client, admin, [_mueble("PUN-01", rentable=False)]).status_code == 409
    _plano_viejo([_mueble("PUN-01", rentable=False)])

    n, salida = _auditar(capsys)
    assert n == 1, salida
    assert "PUN-01" in salida


def test_LA_CARA_B_QUE_DESAPARECE_deja_el_contrato_vivo(client, admin, capsys):
    """Pasar una góndola de doble a simple borra un espacio vendible entero."""
    doble = _mueble("GON-60", type="gondola", gondolaType="double", d=0.9)
    client.put("/api/layout/NAVE", headers=admin,
               json={"fixtures": [doble], "base_updated_at": None})
    assert _vender(client, admin, "GON-60-B").json()["creados"] == 1

    assert _poner(client, admin, [dict(doble, gondolaType="single")]).status_code == 409
    _plano_viejo([dict(doble, gondolaType="single")])

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
    _plano_viejo([_mueble("PUN-02")])                    # PUN-01 sale del plano

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


# ─── Lo que nunca se alquila, aunque el plano viejo no lo diga ────────────────
#
# El auditor preguntaba sólo por la bandera (`rentable is False`) y la pantalla
# y el servidor preguntan primero por el TIPO (`es_comercializable`): la caja,
# la columna y el servicio al cliente nunca se alquilan. Una caja de un plano
# viejo, sin la bandera, contaba acá como espacio ofrecido. CLAUDE.md promete
# que el script «hace lo mismo» que la tarjeta de Supervisar.

def test_UN_CONTRATO_SOBRE_UNA_CAJA_SE_REPORTA_AUNQUE_EL_PLANO_VIEJO_NO_TENGA_LA_BANDERA(
        client, admin, capsys):
    # El contrato entró cuando el plano todavía no dibujaba la caja (el
    # contrato suelto falla abierto ante un código sin mueble).
    _plano_viejo([_mueble("PUN-01")])
    espacio = client.post("/api/spaces/find-or-create", headers=admin, json={
        "code": "NAVE-CAJ-02", "name": "Caja 2", "zone": "checkout", "sede": "NAVE", "area_m2": 1.0,
    })
    assert espacio.status_code in (200, 201), espacio.text
    proveedor = client.post("/api/suppliers/find-or-create", headers=admin,
                            json={"name": "MACA MANI"}).json()["id"]
    r = client.post(f"/api/spaces/{espacio.json()['id']}/leases", headers=admin, json={
        "supplier_id": proveedor, "start_date": HOY.isoformat(),
        "end_date": (HOY + timedelta(days=30)).isoformat(), "monthly_rent": 200000,
    })
    assert r.status_code == 201, r.text

    # Después se dibujó la caja, en un plano de antes de la bandera.
    caja = _mueble("CAJ-02", type="checkout")
    assert "rentable" not in caja
    _plano_viejo([_mueble("PUN-01"), caja])

    from scripts.auditar_desfase import caras_del_plano
    assert "CAJ-02" not in caras_del_plano([caja])

    n, salida = _auditar(capsys)
    assert n == 1, salida
    assert "CAJ-02" in salida and "el plano no lo ofrece" in salida


def test_UNA_CAJA_PINTADA_OCUPADA_EN_UN_PLANO_VIEJO_NO_ES_UN_CONTRATO(client, admin, capsys):
    """La importación del plano (`caras_vendidas`) tampoco la trae: crearle un
    contrato haría una fila que la propia aplicación rechaza."""
    _plano_viejo([_mueble(
        "CAJ-03", type="checkout", status="occupied", supplierName="CAJA VIEJA",
        startDate=HOY.isoformat(), endDate=(HOY + timedelta(days=20)).isoformat(),
    )])
    n, salida = _auditar(capsys)
    assert n == 0, salida


def test_UNA_PARTICIPACION_tiene_mueble_mientras_su_cara_se_venda_por_participacion(client, admin, capsys):
    """La participación de una cara (``GON-01-PC1``) no está entre las caras del
    plano —sus números no tienen tope—: tiene mueble si su CARA se vende por
    participación, la misma regla que la aplicación (``layout_lookup.ofrece``).
    La de una cara que dejó de venderse así es un fantasma, como cualquier
    otro. Los contratos se escriben por abajo: la participación todavía no
    tiene su camino propio."""
    from app.database import SessionLocal
    from app.models.models import Space, SpaceLease, Supplier

    por_pc = _mueble("GON-01", type="gondola", gondolaType="double", d=0.9, partes={"division": "participacion"})
    entera = _mueble("GON-02", type="gondola", gondolaType="double", d=0.9)
    _plano_viejo([por_pc, entera])
    db = SessionLocal()
    try:
        sup = Supplier(name="Alpina")
        db.add(sup)
        db.flush()
        for codigo in ("NAVE-GON-01-PC1", "NAVE-GON-01-B-PC2", "NAVE-GON-02-PC1"):
            space = Space(code=codigo, svg_id=f"fix-{codigo}", name=codigo, zone="gondola", sede="NAVE", area_m2=0.0)
            db.add(space)
            db.flush()
            db.add(SpaceLease(space_id=space.id, supplier_id=sup.id, monthly_rent=1, is_active=True,
                              start_date=HOY, end_date=HOY + timedelta(days=30)))
        db.commit()
    finally:
        db.close()

    n, salida = _auditar(capsys)
    assert n == 1, salida
    assert "GON-02-PC1" in salida and "el plano no lo ofrece" in salida
    assert "GON-01-PC1" not in salida and "GON-01-B-PC2" not in salida, salida


def test_UN_MUEBLE_DE_ANTES_que_ya_se_llamaba_GON_07_PC1_no_es_un_fantasma(client, admin, capsys):
    """Riesgo R1 del diseño de participaciones: antes del token ``PC`` un mueble
    se podía llamar ``GON-07-PC1``. Su contrato es de su cara entera, y el plano
    lo muestra por el texto tal cual (``layout_lookup.ofrece``), no como «la
    participación 1 de GON-07»."""
    from app.database import SessionLocal
    from app.models.models import Space, SpaceLease, Supplier

    # Sin el estado comercial en el JSON (el de un plano después del corte):
    # lo único que se mira es si el plano lo ofrece.
    viejo = {k: v for k, v in _mueble("GON-07-PC1", type="gondola", gondolaType="wall").items() if k != "status"}
    _plano_viejo([viejo])
    db = SessionLocal()
    try:
        sup = Supplier(name="Alpina")
        db.add(sup)
        db.flush()
        space = Space(code="NAVE-GON-07-PC1", svg_id="fix-viejo", name="GON-07-PC1", zone="gondola", sede="NAVE",
                      area_m2=1.0)
        db.add(space)
        db.flush()
        db.add(SpaceLease(space_id=space.id, supplier_id=sup.id, monthly_rent=1, is_active=True,
                          start_date=HOY, end_date=HOY + timedelta(days=30)))
        db.commit()
    finally:
        db.close()

    n, salida = _auditar(capsys)
    assert n == 0, salida
    # Sí se cuenta entre los nombres para renombrar (``buscar_codigos_pc.py``).
    assert "GON-07-PC1. Conviene renombrarlos" in salida, salida
