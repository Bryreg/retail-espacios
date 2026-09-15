"""Importar desde la PANTALLA los contratos que sólo viven en el JSON.

El script de consola sigue existiendo, pero la consola del servicio en Render es
un plan pago. Estos dos endpoints son el mismo servicio por HTTP: el previo no
escribe y el de aplicar escribe todo de una vez.

Lo que se prueba es lo que separa esto de un botón peligroso: que el previo no
toque una fila, que aplicar dos veces no duplique, que lo que no se puede
importar se reporte en vez de inventarse, que la plata no se le escape a un
mercaderista y que quede en la bitácora — porque esto CREA contratos.
"""
import json
from datetime import date, timedelta

HOY = date.today()


def _mueble(code, **extra):
    return {
        "id": f"f-{code}", "code": code, "sede": "NAVE", "type": "punta",
        "label": code, "cx": 3, "cz": 8, "rotY": 0,
        "w": 0.9, "d": 0.4, "h": 1.8, "color": "#6366f1", **extra,
    }


def _vendido(code, prov="CAA", **extra):
    # `**extra` va al final para que una prueba pueda pisar las fechas: puesto
    # antes, Python se queja de recibir `startDate` dos veces.
    return _mueble(code, **{
        "status": "occupied", "supplierName": prov,
        "brandCategory": "Snacks", "negotiatedValue": 500000,
        "startDate": HOY.isoformat(),
        "endDate": (HOY + timedelta(days=30)).isoformat(),
        "observation": "cerca de la entrada", **extra,
    })


def _plano_viejo(fixtures, sede="NAVE"):
    """El snapshot escrito DIRECTO, que es como quedaron los planos de antes.

    Por la API ya no entra: `PUT /api/layout/{sede}` descarta el estado
    comercial. Y ése es justo el dato que estas pruebas necesitan.
    """
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


def _previo(client, headers):
    r = client.get("/api/layout/importacion/previo", headers=headers)
    assert r.status_code == 200, r.text
    return r.json()


def _aplicar(client, headers):
    r = client.post("/api/layout/importacion/aplicar", headers=headers)
    assert r.status_code == 200, r.text
    return r.json()


def _comercial(client, headers):
    return client.get("/api/spaces/comercial", headers=headers).json()


# ─── El previo ───────────────────────────────────────────────────────────────

def test_EL_PREVIO_NO_ESCRIBE_UNA_SOLA_FILA(client, admin):
    _plano_viejo([_vendido("PUN-07")])

    previo = _previo(client, admin)
    assert len(previo["importables"]) == 1
    assert previo["aplicado"] is False
    fila = previo["importables"][0]
    assert fila["espacio"] == "NAVE-PUN-07"
    assert fila["sede"] == "NAVE" and fila["code"] == "PUN-07"
    assert fila["proveedor"] == "CAA"
    assert fila["valor"] == 500000

    assert _comercial(client, admin) == {}, "el previo escribió"
    # Y se puede pedir mil veces sin que cambie nada.
    assert len(_previo(client, admin)["importables"]) == 1


def test_un_plano_sin_nada_que_importar_contesta_vacio(client, admin):
    _plano_viejo([_mueble("PUN-01")])
    previo = _previo(client, admin)
    assert previo["importables"] == [] and previo["incompletos"] == []


# ─── Aplicar ─────────────────────────────────────────────────────────────────

def test_APLICAR_LO_PASA_A_LA_BASE(client, admin):
    _plano_viejo([_vendido("PUN-07")])
    r = _aplicar(client, admin)
    assert len(r["importables"]) == 1 and r["aplicado"] is True

    e = _comercial(client, admin)["NAVE-PUN-07"]
    assert e["supplierName"] == "CAA"
    assert e["negotiatedValue"] == 500000
    assert e["brandCategory"] == "Snacks"
    assert e["observation"] == "cerca de la entrada"
    assert e["startDate"] == HOY.isoformat()


def test_APLICAR_DOS_VECES_NO_DUPLICA(client, admin):
    """Idempotente: el botón se puede apretar dos veces sin miedo."""
    _plano_viejo([_vendido("PUN-07")])
    assert len(_aplicar(client, admin)["importables"]) == 1

    segunda = _aplicar(client, admin)
    assert segunda["importables"] == []
    assert segunda["ya_estaban"] == 1
    assert len(_comercial(client, admin)) == 1


def test_la_cara_B_vendida_tambien_entra(client, admin):
    doble = _mueble("GON-60", type="gondola", gondolaType="double", d=0.9)
    doble["faceB"] = {
        "status": "occupied", "supplierName": "NUTRESA", "brandCategory": "",
        "negotiatedValue": 300000, "startDate": HOY.isoformat(),
        "endDate": (HOY + timedelta(days=30)).isoformat(), "observation": "",
    }
    _plano_viejo([doble])
    assert len(_aplicar(client, admin)["importables"]) == 1
    assert "NAVE-GON-60-B" in _comercial(client, admin)


# ─── Lo que NO se importa ────────────────────────────────────────────────────

def test_LO_QUE_FALTA_SE_REPORTA_CON_SU_MOTIVO(client, admin):
    """No se inventa: `space_leases` exige proveedor y fechas, y rellenarlas
    con algo plausible sería fabricar un contrato que nadie firmó."""
    _plano_viejo([
        _vendido("PUN-01", prov=""),
        _vendido("PUN-02", startDate="", endDate=""),
        _vendido("PUN-03", startDate=(HOY + timedelta(days=9)).isoformat(),
                 endDate=HOY.isoformat()),
    ])
    r = _aplicar(client, admin)
    assert r["importables"] == []
    assert {x["code"]: x["motivo"] for x in r["incompletos"]} == {
        "PUN-01": "le falta el proveedor",
        "PUN-02": "le faltan las dos fechas",
        "PUN-03": "las fechas están al revés: termina antes de empezar",
    }
    assert _comercial(client, admin) == {}


def test_UNA_CAJA_MARCADA_OCUPADA_NO_ES_UN_CONTRATO(client, admin):
    """Un tipo que nunca se alquila no puede tener contrato: la propia
    aplicación rechaza uno, así que importarlo haría una fila inservible."""
    _plano_viejo([_vendido("CAJ-01", type="checkout")])
    assert _aplicar(client, admin)["importables"] == []


def test_un_mueble_no_comercializable_tampoco(client, admin):
    _plano_viejo([_vendido("PUN-01", rentable=False)])
    assert _aplicar(client, admin)["importables"] == []


# ─── Quién puede ─────────────────────────────────────────────────────────────

def test_UN_MERCADERISTA_NO_PUEDE_NI_MIRAR(client, admin, worker):
    """Lleva plata, y aplicar además crea contratos."""
    _plano_viejo([_vendido("PUN-07")])
    assert client.get("/api/layout/importacion/previo", headers=worker).status_code == 403
    assert client.post("/api/layout/importacion/aplicar", headers=worker).status_code == 403
    assert _comercial(client, admin) == {}, "el worker importó algo"


def test_sin_sesion_tampoco(client):
    assert client.get("/api/layout/importacion/previo").status_code in (401, 403)
    assert client.post("/api/layout/importacion/aplicar").status_code in (401, 403)


# ─── Queda anotado ───────────────────────────────────────────────────────────

def test_IMPORTAR_QUEDA_EN_LA_BITACORA(client, admin):
    """Esto crea contratos, que es plata: tiene que quedar quién y cuándo."""
    _plano_viejo([_vendido("PUN-07")])
    _aplicar(client, admin)

    filas = client.get("/api/bitacora/", headers=admin).json()
    nuestra = [x for x in filas if x["accion"] == "contrato.importado"]
    assert len(nuestra) == 1, filas
    assert "NAVE-PUN-07" in (nuestra[0]["detalle"] or "")


def test_un_previo_no_ensucia_la_bitacora(client, admin):
    """Sólo lee: anotarlo llenaría el registro de ruido y taparía lo que sí
    importa, que es quién escribió."""
    _plano_viejo([_vendido("PUN-07")])
    _previo(client, admin)

    filas = client.get("/api/bitacora/", headers=admin).json()
    assert [x for x in filas if x["accion"] == "contrato.importado"] == []
