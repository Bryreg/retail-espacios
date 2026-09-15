"""Sacar de circulación algo vendido no se hace en silencio.

La auditoría encontró que TODA edición del plano que retira un espacio de la
venta dejaba su contrato vivo en la base, por tres puertas: borrar el mueble,
pasar la góndola de doble a simple —desaparece la cara B— y marcarlo «no
comercializable». Ninguna avisaba, porque el plano NO le escribe a la base.

El contrato quedaba vivo y sin nada en pantalla que lo mostrara, y aparecía
meses después al intentar vender. Así se reportó: «no me deja alquilar la
IMP-17 que está libre, el sistema la toma como ocupada».

Se frena al GUARDAR EL PLANO, que es el único lugar por el que pasan las tres
puertas y los cuatro caminos de borrado. Y se frena en vez de cancelar solo:
cancelar es plata y un compromiso con un proveedor, no lo decide un guardado.
"""
from datetime import date, timedelta

HOY = date.today()

MUEBLE = {
    "id": "f1", "code": "IMP-17", "sede": "NAVE", "type": "punta",
    "label": "IMP-17", "cx": 3, "cz": 8, "rotY": 0,
    "w": 0.9, "d": 0.4, "h": 1.8, "color": "#6366f1",
}
OTRO = {**MUEBLE, "id": "f2", "code": "IMP-18", "label": "IMP-18"}
DOBLE = {**MUEBLE, "id": "f3", "code": "GON-60", "label": "GON-60",
         "type": "gondola", "gondolaType": "double", "d": 0.9}


def _guardar(client, headers, fixtures, sede="NAVE"):
    return client.put(f"/api/layout/{sede}", headers=headers,
                      json={"fixtures": fixtures, "base_updated_at": None})


def _ok(client, headers, fixtures, sede="NAVE"):
    r = _guardar(client, headers, fixtures, sede)
    assert r.status_code == 200, r.text
    return r


def _vender(client, admin, code, sede="NAVE", desde=None, hasta=None):
    r = client.post("/api/leases/bulk/confirmar", headers=admin, json={
        "sede": sede,
        "filas": [{"fila": 1, "espacio": code, "sede": sede, "proveedor": "MACA MANI",
                   "marca": "Maní", "valor": 200000,
                   "desde": (desde or HOY).isoformat(),
                   "hasta": (hasta or HOY + timedelta(days=30)).isoformat()}],
    })
    assert r.status_code == 200, r.text
    assert r.json()["filas"][0]["lease_id"] is not None, r.text
    return r


def _proveedor(client, admin) -> int:
    r = client.post("/api/suppliers/", headers=admin,
                    json={"name": "MACA MANI", "contact": "", "phone": "", "email": ""})
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


# ─── Las tres puertas ────────────────────────────────────────────────────────

def test_BORRAR_UN_MUEBLE_VENDIDO_SE_FRENA(client, admin):
    _ok(client, admin, [MUEBLE, OTRO])
    _vender(client, admin, "IMP-17")

    r = _guardar(client, admin, [OTRO])
    assert r.status_code == 409, r.text
    detalle = r.json()["detail"]
    assert detalle["code"] == "contratos_vivos"
    assert len(detalle["choques"]) == 1
    assert "IMP-17" in detalle["choques"][0]
    assert "MACA MANI" in detalle["choques"][0]
    # Y no escribió: el plano sigue teniendo el mueble.
    guardado = client.get("/api/layout/NAVE", headers=admin).json()["fixtures"]
    assert {f["code"] for f in guardado} == {"IMP-17", "IMP-18"}


def test_PASAR_LA_GONDOLA_DE_DOBLE_A_SIMPLE_SE_FRENA(client, admin):
    """La cara B desaparece sin que nadie la borre: es un espacio menos."""
    _ok(client, admin, [DOBLE])
    _vender(client, admin, "GON-60-B")

    r = _guardar(client, admin, [{**DOBLE, "gondolaType": "single"}])
    assert r.status_code == 409, r.text
    assert "GON-60-B" in r.json()["detail"]["choques"][0]


def test_MARCARLO_NO_COMERCIALIZABLE_SE_FRENA(client, admin):
    """Sale de la venta sin salir del plano: el mueble sigue ahí y el contrato
    también, pero ya no hay nada que lo ofrezca."""
    _ok(client, admin, [MUEBLE])
    _vender(client, admin, "IMP-17")

    r = _guardar(client, admin, [{**MUEBLE, "rentable": False}])
    assert r.status_code == 409, r.text
    assert "IMP-17" in r.json()["detail"]["choques"][0]


# ─── Lo que NO se frena ──────────────────────────────────────────────────────

def test_borrar_un_mueble_libre_pasa(client, admin):
    _ok(client, admin, [MUEBLE, OTRO])
    _vender(client, admin, "IMP-17")
    _ok(client, admin, [MUEBLE])  # se va el IMP-18, que no tiene nada


def test_mover_y_renombrar_no_es_sacar_de_circulacion(client, admin):
    _ok(client, admin, [MUEBLE])
    _vender(client, admin, "IMP-17")
    _ok(client, admin, [{**MUEBLE, "cx": 9, "cz": 2, "w": 1.4}])


def test_un_contrato_VENCIDO_no_frena_nada(client, admin):
    """Es historia, no un compromiso vivo."""
    _ok(client, admin, [MUEBLE])
    _vender(client, admin, "IMP-17",
            desde=HOY - timedelta(days=60), hasta=HOY - timedelta(days=30))
    _ok(client, admin, [])


def test_UN_CONTRATO_FIRMADO_Y_SIN_ARRANCAR_SI_FRENA(client, admin):
    """Todavía no corre, pero ya está comprometido: borrarlo lo esconde igual."""
    _ok(client, admin, [MUEBLE])
    _vender(client, admin, "IMP-17",
            desde=HOY + timedelta(days=30), hasta=HOY + timedelta(days=60))
    assert _guardar(client, admin, []).status_code == 409


def test_UN_DESFASE_QUE_YA_ESTABA_NO_TRABA_EL_PLANO(client, admin):
    """La regla que no se negocia: un plano roto se abre, se mira y se guarda.

    Sólo se frena lo que ESTE guardado retira. Una sede que ya arrastraba un
    contrato sin mueble —las que había antes de que esto existiera— quedaría
    imposible de guardar para siempre.
    """
    _ok(client, admin, [MUEBLE, OTRO])
    _vender(client, admin, "IMP-17")
    # El desfase se produce de todas formas: se acepta a la fuerza escribiendo
    # el snapshot por abajo, como quedó el plano de producción.
    from app.database import SessionLocal
    from app.models.models import LayoutSnapshot
    import json
    db = SessionLocal()
    try:
        snap = db.query(LayoutSnapshot).filter(LayoutSnapshot.sede == "NAVE").first()
        snap.fixtures_json = json.dumps([OTRO])
        db.commit()
    finally:
        db.close()

    # Mover el IMP-18 tiene que poder guardarse, aunque el IMP-17 siga huérfano.
    _ok(client, admin, [{**OTRO, "cx": 12}])


def test_un_plano_que_entra_por_primera_vez_pasa(client, admin):
    """No hay con qué comparar. Trabarlo ahí lo haría inimportable — y es como
    llega un plano existente: el arranque, otro equipo, una restauración."""
    # El contrato sin pasar por ningún plano: `find-or-create` + la fila.
    espacio = client.post("/api/spaces/find-or-create", headers=admin, json={
        "code": "TERRON-IMP-17", "sede": "TERRON", "name": "IMP-17",
    }).json()
    r = client.post(f"/api/spaces/{espacio['id']}/leases", headers=admin, json={
        "supplier_id": _proveedor(client, admin), "marca": "Maní",
        "start_date": HOY.isoformat(),
        "end_date": (HOY + timedelta(days=30)).isoformat(),
        "monthly_rent": 200000,
    })
    assert r.status_code in (200, 201), r.text

    # TERRON no tiene snapshot: éste es su PRIMER guardado y entra.
    assert _guardar(client, admin, [], sede="TERRON").status_code == 200


def test_el_contrato_de_OTRA_sede_no_frena_este_plano(client, admin):
    _ok(client, admin, [MUEBLE], sede="NAVE")
    _ok(client, admin, [{**MUEBLE, "sede": "TERRON"}], sede="TERRON")
    _vender(client, admin, "IMP-17", sede="TERRON")
    _ok(client, admin, [], sede="NAVE")


def test_cancelar_el_contrato_desbloquea_el_guardado(client, admin):
    """El camino de salida existe y es el correcto: se cancela y se borra."""
    _ok(client, admin, [MUEBLE])
    _vender(client, admin, "IMP-17")
    assert _guardar(client, admin, []).status_code == 409

    # El mismo camino que usa la pantalla: el espacio por su código trae el
    # contrato vigente, y con ese id se cancela.
    espacio = client.get("/api/spaces/by-code/NAVE-IMP-17", headers=admin).json()
    contrato = espacio["active_lease"] or espacio["upcoming_lease"]
    assert client.delete(
        f"/api/spaces/{espacio['id']}/leases/{contrato['id']}", headers=admin
    ).status_code in (200, 204)

    _ok(client, admin, [])
