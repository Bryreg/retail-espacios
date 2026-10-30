"""La planilla deja rastro en la bitácora (auditoría P1-18).

`/leases/bulk/confirmar` escribía contratos sin `anotar`: Vender sí anotaba
`contrato.alta`, la planilla no. Ahora cada contrato creado deja su línea en la
MISMA transacción.
"""
from test_bulk_leases import _confirmar, _fila, _plano


def _altas(client, admin):
    r = client.get("/api/bitacora/", headers=admin, params={"accion": "contrato.alta", "limite": 500})
    assert r.status_code == 200, r.text
    return r.json()


def test_confirmar_anota_un_contrato_alta_por_cada_contrato(client, admin):
    """Después de `/leases/bulk/confirmar` hay N filas `contrato.alta`, una por
    contrato creado, con su id."""
    _plano(client, admin)
    antes = {l["id"] for l in _altas(client, admin)}
    r = _confirmar(client, admin, [_fila(2), _fila(3, espacio="PUN-05")])
    assert r.status_code == 200, r.text
    assert r.json()["creados"] == 2
    nuevas = [l for l in _altas(client, admin) if l["id"] not in antes]
    assert len(nuevas) == 2
    ids = {f["lease_id"] for f in r.json()["filas"] if f.get("lease_id")}
    assert {int(l["entidad_id"]) for l in nuevas} == ids
    assert all("planilla" in (l["detalle"] or "") for l in nuevas)
    assert all(l["rol"] == "admin" for l in nuevas)


def test_una_fila_con_error_no_deja_linea_en_la_bitacora(client, admin):
    _plano(client, admin)
    antes = {l["id"] for l in _altas(client, admin)}
    r = _confirmar(client, admin, [_fila(2, espacio="NO-EXISTE-99")])
    assert r.status_code == 200 and r.json()["creados"] == 0
    assert not [l for l in _altas(client, admin) if l["id"] not in antes]
