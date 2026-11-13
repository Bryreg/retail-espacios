"""Indicadores › Historial (2026-11-13): los contratos de la sede que ya no
están vivos, con filtros (`GET /api/spaces/historial`).

El plano es el de ``test_participaciones`` (NAVE): ``GON-02`` se vende entera
(cara A y B), ``NEV-03`` entera o por puertas. «Hoy» es el 17 de octubre de
2026 en Colombia (marca ``reloj``).
"""
from tests import test_participaciones as tp
from tests.test_editar_contrato import _editar
from tests.test_vender_contrato import _entera, _pedido, _vender

RELOJ = tp.RELOJ
D = tp.D


def _historial(client, headers, codigo=200, **q):
    r = client.get("/api/spaces/historial", headers=headers, params={"sede": "NAVE", **q})
    assert r.status_code == codigo, r.text
    return r.json()


def _armar(client, admin):
    """Un terminado, uno vivo, uno reemplazado y uno cancelado."""
    tp._plano(client, admin)
    terminado = _vender(client, admin, _pedido(_entera("GON-02", 900_000), proveedor="Nestlé de Colombia",
                                               marca="Ñapa", desde=D(2026, 7, 1), hasta=D(2026, 9, 30)))
    _vender(client, admin, _pedido(_entera("GON-02", 600_000), proveedor="Ahora SA",
                                   desde=D(2026, 10, 1), hasta=D(2026, 11, 30)))
    viejo = _vender(client, admin, _pedido(_entera("NEV-03", 300_000), proveedor="Fríos SA"))["contratos"][0]["lease_id"]
    assert _editar(client, admin, viejo, _entera("NEV-03-PU1", 150_000), _entera("NEV-03-PU2", 150_000),
                   proveedor="Fríos SA")["edicion"]["modo"] == "reemplazo"
    cancelado = _vender(client, admin, _pedido(_entera("GON-02-B", 200_000), proveedor="Se Fue SA"))
    cid = cancelado["contratos"][0]["lease_id"]
    espacio = client.get("/api/spaces/by-code/NAVE-GON-02-B", headers=admin).json()
    assert client.delete(f"/api/spaces/{espacio['id']}/leases/{cid}", headers=admin).status_code == 204
    return terminado["contratos"][0]["lease_id"], viejo, cid


@RELOJ
def test_trae_solo_lo_cerrado_con_su_estado_y_cuentas(client, admin):
    terminado, reemplazado, cancelado = _armar(client, admin)
    h = _historial(client, admin)
    assert h["cuentas"] == {"terminado": 1, "cancelado": 1, "reemplazado": 1}
    assert h["total"] == 3
    # Del que terminó más tarde al más viejo; lo vivo no aparece.
    assert [(f["lease_id"], f["estado"]) for f in h["filas"]] == [
        (cancelado, "cancelado"), (reemplazado, "reemplazado"), (terminado, "terminado")]
    assert all(f["proveedor"] != "Ahora SA" for f in h["filas"])
    por_id = {f["lease_id"]: f for f in h["filas"]}
    # La baja guarda desde qué día ya no corre; lo demás no la tiene.
    assert por_id[cancelado]["cancelado_desde"] == "2026-10-17"
    assert por_id[terminado]["cancelado_desde"] is None
    # La plata, completa, para quien administra: tres meses por $ 900.000.
    assert (por_id[terminado]["valor_total"], por_id[terminado]["valor_al_mes"]) == (900_000, 300_000)
    assert por_id[terminado]["espacio"] == "NAVE-GON-02"


@RELOJ
def test_los_filtros(client, admin):
    terminado, reemplazado, cancelado = _armar(client, admin)
    ids = lambda h: [f["lease_id"] for f in h["filas"]]  # noqa: E731

    # Estado: uno o varios; las cuentas no dependen de él (son los chips).
    h = _historial(client, admin, estado="cancelado")
    assert ids(h) == [cancelado]
    assert h["cuentas"] == {"terminado": 1, "cancelado": 1, "reemplazado": 1}
    assert ids(_historial(client, admin, estado="terminado,reemplazado")) == [reemplazado, terminado]

    # Proveedor o marca, sin tildes ni mayúsculas.
    assert ids(_historial(client, admin, proveedor="nestle")) == [terminado]
    assert ids(_historial(client, admin, proveedor="ñapa")) == [terminado]
    h = _historial(client, admin, proveedor="fríos")
    assert ids(h) == [reemplazado] and h["cuentas"] == {"terminado": 0, "cancelado": 0, "reemplazado": 1}

    # Un pedazo del código, o la cara con sus partes (sin la B): «Ver todos».
    assert sorted(ids(_historial(client, admin, espacio="gon-02"))) == sorted([terminado, cancelado])
    assert ids(_historial(client, admin, cara="NAVE-GON-02")) == [terminado]
    assert ids(_historial(client, admin, cara="NAVE-GON-02-B")) == [cancelado]

    # Fechas: lo que corrió algún día del rango, los extremos incluidos.
    assert ids(_historial(client, admin, desde="2026-09-30", hasta="2026-10-15")) == [terminado]
    assert ids(_historial(client, admin, hasta="2026-06-30")) == []
    _historial(client, admin, codigo=422, desde="2026-10-01", hasta="2026-09-01")

    # Otra sede: nada.
    r = client.get("/api/spaces/historial", headers=admin, params={"sede": "OTRA"}).json()
    assert r["filas"] == [] and r["total"] == 0


@RELOJ
def test_el_trabajador_lo_ve_sin_plata(client, admin, worker):
    _armar(client, admin)
    h = _historial(client, worker)
    assert h["total"] == 3
    assert all("valor_total" not in f and "valor_al_mes" not in f for f in h["filas"])
    assert client.get("/api/spaces/historial", params={"sede": "NAVE"}).status_code == 401
