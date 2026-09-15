"""Pasar a la base los contratos que hoy viven sólo en el JSON.

Se corre una vez, antes de que el layout deje de guardar estado comercial. Sin
esto, al invertir la verdad esos contratos desaparecerían de la pantalla: no
están en ninguna tabla, así que nada los podría volver a dibujar.

Lo que se prueba: que traiga lo que sólo estaba en el JSON, que NO duplique lo
que ya estaba, y que lo que no se puede importar se reporte en vez de inventarse.
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


def _vendido(code, prov="CAA", dias=30, **extra):
    # `extra` va al final para poder PISAR lo de acá: hay pruebas que necesitan
    # justamente un contrato al que le falte algo.
    return _mueble(code, **{
        "status": "occupied", "supplierName": prov, "brandCategory": "Snacks",
        "negotiatedValue": 500000, "startDate": HOY.isoformat(),
        "endDate": (HOY + timedelta(days=dias)).isoformat(), **extra,
    })


def _plano(client, admin, fixtures):
    """El plano como quedó guardado ANTES del corte, que es lo que este script
    existe para migrar. Va directo al snapshot: la API ya no acepta contratos
    adentro del layout."""
    _plano_viejo(fixtures)

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



def _importar(ensayo=False):
    """La misma función que usa la pantalla y que usa el script de consola.

    Vivía en el script; se mudó a `app/services/importar_del_plano.py` cuando la
    importación pasó a hacerse también desde Supervisar. Tener dos
    implementaciones de algo que ESCRIBE contratos era la clase de duplicación
    que este proyecto viene sacando, así que el script quedó de cáscara.
    """
    from app.database import SessionLocal
    from app.services.importar_del_plano import aplicar, revisar
    db = SessionLocal()
    try:
        plan = revisar(db) if ensayo else aplicar(db)
        return len(plan.importables), plan.ya_estaban, plan.incompletos
    finally:
        db.close()


def _comercial(client, admin):
    return client.get("/api/spaces/comercial", headers=admin).json()


def test_UN_CONTRATO_QUE_SOLO_ESTABA_EN_EL_JSON_LLEGA_A_LA_BASE(client, admin):
    _plano(client, admin, [_vendido("PUN-07")])
    assert _comercial(client, admin) == {}, "no debería estar todavía"

    creados, ya, incompletos = _importar()
    assert (creados, ya, incompletos) == (1, 0, [])

    e = _comercial(client, admin)["NAVE-PUN-07"]
    assert e["supplierName"] == "CAA"
    assert e["negotiatedValue"] == 500000
    assert e["startDate"] == HOY.isoformat()
    assert e["brandCategory"] == "Snacks"


def test_NO_DUPLICA_LO_QUE_YA_ESTABA(client, admin):
    """Idempotente: se tiene que poder correr dos veces sin miedo."""
    _plano(client, admin, [_mueble("PUN-01")])
    client.post("/api/leases/bulk/confirmar", headers=admin, json={
        "sede": "NAVE",
        "filas": [{"fila": 1, "espacio": "PUN-01", "sede": "NAVE", "proveedor": "ALPINA",
                   "valor": 100000, "desde": HOY.isoformat(),
                   "hasta": (HOY + timedelta(days=30)).isoformat()}],
    })
    _plano(client, admin, [_vendido("PUN-01", prov="ALPINA")])

    creados, ya, _ = _importar()
    assert (creados, ya) == (0, 1)
    assert _comercial(client, admin)["NAVE-PUN-01"]["supplierName"] == "ALPINA"

    # Y otra vez, por las dudas.
    assert _importar()[0] == 0


def test_la_cara_B_vendida_tambien_se_importa(client, admin):
    doble = _mueble("GON-60", type="gondola", gondolaType="double", d=0.9)
    doble["faceB"] = {
        "status": "occupied", "supplierName": "NUTRESA", "brandCategory": "",
        "negotiatedValue": 300000, "startDate": HOY.isoformat(),
        "endDate": (HOY + timedelta(days=30)).isoformat(), "observation": "",
    }
    _plano(client, admin, [doble])

    assert _importar()[0] == 1
    assert "NAVE-GON-60-B" in _comercial(client, admin)


def test_LO_QUE_NO_SE_PUEDE_IMPORTAR_SE_REPORTA_NO_SE_INVENTA(client, admin):
    """Sin proveedor o sin fechas no hay fila posible: esas columnas son
    obligatorias. Inventarlas sería peor que dejarlo para mirar a mano."""
    _plano(client, admin, [
        _vendido("PUN-01", prov=""),                      # sin proveedor
        _vendido("PUN-02", startDate="", endDate=""),     # sin fechas
    ])

    creados, _, incompletos = _importar()
    assert creados == 0
    assert len(incompletos) == 2
    assert any(x.code == "PUN-01" for x in incompletos)
    # El motivo se dice para que se pueda arreglar, no como un código.
    assert {x.code: x.motivo for x in incompletos} == {
        "PUN-01": "le falta el proveedor",
        "PUN-02": "le faltan las dos fechas",
    }
    assert _comercial(client, admin) == {}


def test_un_mueble_no_comercializable_no_se_importa(client, admin):
    _plano(client, admin, [_vendido("PUN-01", rentable=False)])
    assert _importar()[0] == 0


def test_el_ensayo_no_escribe_nada(client, admin):
    _plano(client, admin, [_vendido("PUN-07")])
    creados, _, _ = _importar(ensayo=True)
    assert creados == 1, "el ensayo tiene que decir qué haría"
    assert _comercial(client, admin) == {}, "el ensayo escribió"
