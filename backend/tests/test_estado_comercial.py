"""El estado comercial sale de la BASE, que es la única verdad.

Antes el mismo hecho estaba escrito dos veces —en `space_leases` y en el JSON
del layout— y podían discrepar. Se rompía de tres maneras, todas con el mismo
síntoma: «está libre y el sistema dice que está ocupado». Este endpoint es la
mitad que reemplaza al JSON.

Lo que se prueba no es que devuelva filas. Es CUÁL contrato manda, qué pasa con
lo que no tiene fila, y que la plata no se le escape a un mercaderista.
"""
from datetime import date, timedelta

HOY = date.today()


def _mueble(code, sede="NAVE", **extra):
    return {
        "id": f"f-{code}", "code": code, "sede": sede, "type": "punta",
        "label": code, "cx": 3, "cz": 8, "rotY": 0,
        "w": 0.9, "d": 0.4, "h": 1.8, "color": "#6366f1", "status": "free",
        "supplierName": "", "brandCategory": "", "negotiatedValue": 0,
        "startDate": "", "endDate": "", "observation": "", **extra,
    }


def _plano(client, admin, fixtures, sede="NAVE"):
    return client.put(f"/api/layout/{sede}", headers=admin,
                      json={"fixtures": fixtures, "base_updated_at": None})


def _vender(client, admin, code, desde, hasta, sede="NAVE", valor=200000, marca="Maní"):
    return client.post("/api/leases/bulk/confirmar", headers=admin, json={
        "sede": sede,
        "filas": [{"fila": 1, "espacio": code, "sede": sede, "proveedor": "MACA MANI",
                   "marca": marca, "valor": valor,
                   "desde": desde.isoformat(), "hasta": hasta.isoformat()}],
    })


def _comercial(client, headers, sede=None):
    r = client.get("/api/spaces/comercial" + (f"?sede={sede}" if sede else ""), headers=headers)
    assert r.status_code == 200, r.text
    return r.json()


# ─── Qué contesta ────────────────────────────────────────────────────────────

def test_LO_QUE_NO_TIENE_FILA_ES_LIBRE(client, admin):
    """No hace falta pre-crear nada: la fila aparece cuando se vende.

    Es lo que permite que el plano deje de guardar el estado — un mueble nuevo
    no necesita que nadie lo dé de alta en la base para poder dibujarse.
    """
    _plano(client, admin, [_mueble("PUN-01"), _mueble("PUN-02")])
    assert _comercial(client, admin) == {}


def test_un_espacio_vendido_sale_con_todo_lo_que_el_plano_dibujaba(client, admin):
    _plano(client, admin, [_mueble("PUN-01")])
    _vender(client, admin, "PUN-01", HOY, HOY + timedelta(days=30))

    e = _comercial(client, admin)["NAVE-PUN-01"]
    assert e["status"] == "occupied"
    assert e["supplierName"] == "MACA MANI"
    assert e["brandCategory"] == "Maní"
    assert e["negotiatedValue"] == 200000
    assert e["startDate"] == HOY.isoformat()
    assert e["endDate"] == (HOY + timedelta(days=30)).isoformat()


# ─── Cuál contrato manda ─────────────────────────────────────────────────────

def test_UN_CONTRATO_FIRMADO_Y_SIN_ARRANCAR_TAMBIEN_OCUPA(client, admin):
    """«Comprometido» no es «libre»: venderlo encima sería venderlo dos veces."""
    _plano(client, admin, [_mueble("PUN-01")])
    _vender(client, admin, "PUN-01", HOY + timedelta(days=10), HOY + timedelta(days=40))

    e = _comercial(client, admin)["NAVE-PUN-01"]
    assert e["status"] == "occupied"
    assert e["startDate"] == (HOY + timedelta(days=10)).isoformat()


def test_un_contrato_vencido_no_manda(client, admin):
    """Es historia. El espacio está libre y se tiene que poder vender."""
    _plano(client, admin, [_mueble("PUN-01")])
    _vender(client, admin, "PUN-01", HOY - timedelta(days=90), HOY - timedelta(days=5))

    assert _comercial(client, admin) == {}


def test_el_que_corre_hoy_le_gana_al_que_todavia_no_arranca(client, admin):
    _plano(client, admin, [_mueble("PUN-01")])
    _vender(client, admin, "PUN-01", HOY, HOY + timedelta(days=10))
    _vender(client, admin, "PUN-01", HOY + timedelta(days=11), HOY + timedelta(days=40))

    e = _comercial(client, admin)["NAVE-PUN-01"]
    assert e["startDate"] == HOY.isoformat(), "mandó el futuro en vez del vigente"


# ─── La plata ────────────────────────────────────────────────────────────────

def test_EL_MERCADERISTA_NO_VE_EL_VALOR(client, admin, worker):
    """La regla dura del proyecto. Puede ver que está ocupado y por quién —lo
    necesita para montar— pero nunca cuánto se cobra."""
    _plano(client, admin, [_mueble("PUN-01")])
    _vender(client, admin, "PUN-01", HOY, HOY + timedelta(days=30))

    e = _comercial(client, worker)["NAVE-PUN-01"]
    assert e["negotiatedValue"] == 0
    assert e["supplierName"] == "MACA MANI"
    assert e["status"] == "occupied"


def test_sin_sesion_no_se_lee(client):
    assert client.get("/api/spaces/comercial").status_code in (401, 403)


# ─── Las sedes ───────────────────────────────────────────────────────────────

def test_se_filtra_por_sede_y_el_codigo_lleva_la_sede_adentro(client, admin):
    """Los códigos cortos se repiten entre tiendas: la clave es la sede + el
    código, siempre. Es exactamente lo que rompió la carga por planilla."""
    _plano(client, admin, [_mueble("IMP-17")], sede="NAVE")
    _plano(client, admin, [_mueble("IMP-17", sede="TERRON")], sede="TERRON")
    _vender(client, admin, "IMP-17", HOY, HOY + timedelta(days=30), sede="NAVE")

    todo = _comercial(client, admin)
    assert "NAVE-IMP-17" in todo
    assert "TERRON-IMP-17" not in todo, "el IMP-17 de la otra sede salió vendido"

    assert list(_comercial(client, admin, "NAVE")) == ["NAVE-IMP-17"]
    assert _comercial(client, admin, "TERRON") == {}


def test_la_cara_B_es_un_espacio_aparte(client, admin):
    doble = _mueble("GON-60", type="gondola", gondolaType="double", d=0.9)
    _plano(client, admin, [doble])
    _vender(client, admin, "GON-60-B", HOY, HOY + timedelta(days=30))

    todo = _comercial(client, admin)
    assert "NAVE-GON-60-B" in todo
    assert "NAVE-GON-60" not in todo, "vender la cara B ocupó también la A"
