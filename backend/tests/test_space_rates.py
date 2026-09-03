"""GET /api/spaces/{code}/rates — tarifa de referencia + ocupación derivada.

Dos preguntas en un solo endpoint, con reglas de visibilidad distintas: la
tarifa es plata (admin también para LEER, como ``/layout/rates``) y la
ocupación es sólo fechas (cualquier rol autenticado). El caso que motiva medio
archivo es que "vencido" tiene que sobrevivir a que OTRO endpoint —el mapa,
los KPIs— ya haya corrido ``expire_leases()`` y apagado el ``is_active`` del
contrato que se pasó de fecha.
"""
from datetime import date, timedelta

from app.auth import create_mount_token

HOY = date.today()

FIXTURES = [
    {
        "id": "f1", "code": "PUN-04", "sede": "NAVE", "type": "punta",
        "label": "Punta de góndola", "cx": 3, "cz": 8, "rotY": 0,
        "w": 1.2, "d": 0.9, "h": 1.8, "color": "#6366f1",
    },
    {
        "id": "f2", "code": "PUN-05", "sede": "NAVE", "type": "punta",
        "label": "Punta de góndola", "cx": 6, "cz": 8, "rotY": 0,
        "w": 1.2, "d": 0.9, "h": 1.8, "color": "#6366f1",
    },
    {
        # Góndola doble: dos caras, A y B, que comparten tipo de tarifa.
        "id": "f3", "code": "GON-09", "sede": "NAVE", "type": "gondola",
        "gondolaType": "double",
        "label": "Góndola 9", "cx": 9, "cz": 8, "rotY": 0,
        "w": 0.9, "d": 4.0, "h": 1.8, "color": "#94a3b8",
    },
    {
        "id": "f4", "code": "CAJ-01", "sede": "NAVE", "type": "checkout",
        "label": "Cajas", "cx": 3, "cz": 1, "rotY": 0, "rentable": False,
        "w": 6.0, "d": 1.2, "h": 1.2, "color": "#cbd5e1",
    },
]


def _plano(client, admin, sede="NAVE", fixtures=None):
    r = client.put(
        f"/api/layout/{sede}",
        json={"fixtures": fixtures if fixtures is not None else FIXTURES, "base_updated_at": None},
        headers=admin,
    )
    assert r.status_code == 200, r.text


def _set_rates(client, admin, default=None, by_sede=None):
    r = client.put(
        "/api/layout/rates",
        json={"default": default or {}, "by_sede": by_sede or {}},
        headers=admin,
    )
    assert r.status_code == 200, r.text


def _contrato(client, admin, code, desde, hasta, valor=1_000_000, proveedor="Alpina", sede="NAVE"):
    espacio = client.post(
        "/api/spaces/find-or-create",
        json={"code": code, "name": code, "zone": "z", "sede": sede, "area_m2": 1.0},
        headers=admin,
    ).json()
    prov = client.post("/api/suppliers/find-or-create", json={"name": proveedor}, headers=admin).json()
    r = client.post(
        f"/api/spaces/{espacio['id']}/leases",
        json={
            "supplier_id": prov["id"], "start_date": str(desde), "end_date": str(hasta),
            "monthly_rent": valor,
        },
        headers=admin,
    )
    assert r.status_code == 201, r.text
    return r.json()


def _montaje_token(code="NAVE-PUN-04"):
    return create_mount_token(code)


# ─── Visibilidad por rol ───────────────────────────────────────────────────


def test_admin_ve_reference_rate(client, admin):
    _plano(client, admin)
    _set_rates(client, admin, default={"punta": 500_000})
    r = client.get("/api/spaces/NAVE-PUN-04/rates", headers=admin)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["reference_rate"] == 500_000
    assert body["type"] == "punta"
    assert body["sede"] == "NAVE"


def test_worker_no_recibe_la_clave_reference_rate(client, admin, worker):
    """No es null: la clave no está. Lista blanca, no negra."""
    _plano(client, admin)
    _set_rates(client, admin, default={"punta": 500_000})
    r = client.get("/api/spaces/NAVE-PUN-04/rates", headers=worker)
    assert r.status_code == 200, r.text
    assert "reference_rate" not in r.json()


def test_worker_si_ve_occupancy(client, admin, worker):
    """Las fechas no son dinero: cualquier rol autenticado las ve."""
    _plano(client, admin)
    r = client.get("/api/spaces/NAVE-PUN-04/rates", headers=worker)
    assert r.status_code == 200, r.text
    assert r.json()["occupancy"]["estado"] == "disponible"


def test_token_de_montaje_recibe_401(client, admin):
    _plano(client, admin)
    r = client.get(
        "/api/spaces/NAVE-PUN-04/rates",
        headers={"Authorization": f"Bearer {_montaje_token()}"},
    )
    assert r.status_code == 401


def test_sin_token_401(client, admin):
    _plano(client, admin)
    assert client.get("/api/spaces/NAVE-PUN-04/rates").status_code == 401


# ─── 404 ────────────────────────────────────────────────────────────────────


def test_404_codigo_desconocido(client, admin):
    _plano(client, admin)
    r = client.get("/api/spaces/NAVE-NOEXISTE/rates", headers=admin)
    assert r.status_code == 404


def test_404_sede_equivocada(client, admin):
    """PUN-04 existe en NAVE, no en POBLADO: el código completo manda."""
    _plano(client, admin, sede="NAVE")
    r = client.get("/api/spaces/POBLADO-PUN-04/rates", headers=admin)
    assert r.status_code == 404


# ─── Tarifa: tipo y override por sede ──────────────────────────────────────


def test_override_de_sede_gana_a_la_general(client, admin):
    _plano(client, admin)
    _set_rates(client, admin, default={"punta": 500_000}, by_sede={"NAVE": {"punta": 700_000}})
    r = client.get("/api/spaces/NAVE-PUN-04/rates", headers=admin)
    assert r.json()["reference_rate"] == 700_000


def test_sin_tarifa_configurada_reference_rate_es_null_pero_la_clave_esta(client, admin):
    _plano(client, admin)
    r = client.get("/api/spaces/NAVE-PUN-04/rates", headers=admin)
    body = r.json()
    assert "reference_rate" in body
    assert body["reference_rate"] is None


def test_cara_b_de_gondola_doble_comparte_tipo_y_tarifa(client, admin):
    """La tarifa de góndola es por cara: A y B resuelven el MISMO tipo."""
    _plano(client, admin)
    _set_rates(client, admin, default={"gondola": 900_000})
    a = client.get("/api/spaces/NAVE-GON-09/rates", headers=admin).json()
    b = client.get("/api/spaces/NAVE-GON-09-B/rates", headers=admin).json()
    assert a["type"] == b["type"] == "gondola"
    assert a["reference_rate"] == b["reference_rate"] == 900_000


# ─── Ocupación de HOY ───────────────────────────────────────────────────────


def test_estado_disponible_sin_contrato(client, admin):
    _plano(client, admin)
    occ = client.get("/api/spaces/NAVE-PUN-05/rates", headers=admin).json()["occupancy"]
    assert occ == {"estado": "disponible", "lease_desde": None, "lease_hasta": None, "se_libera_el": None}


def test_estado_ocupado_vigente(client, admin):
    desde, hasta = HOY - timedelta(days=5), HOY + timedelta(days=5)
    _plano(client, admin)
    _contrato(client, admin, "NAVE-PUN-04", desde, hasta)
    occ = client.get("/api/spaces/NAVE-PUN-04/rates", headers=admin).json()["occupancy"]
    assert occ["estado"] == "ocupado"
    assert occ["lease_desde"] == str(desde)
    assert occ["lease_hasta"] == str(hasta)
    # Rangos inclusivos en los dos extremos: el primer día libre es el siguiente.
    assert occ["se_libera_el"] == str(hasta + timedelta(days=1))


def test_estado_contratado_futuro(client, admin):
    """Firmado, todavía no arranca: no es "ocupado" hoy."""
    desde, hasta = HOY + timedelta(days=10), HOY + timedelta(days=20)
    _plano(client, admin)
    _contrato(client, admin, "NAVE-PUN-04", desde, hasta)
    occ = client.get("/api/spaces/NAVE-PUN-04/rates", headers=admin).json()["occupancy"]
    assert occ["estado"] == "contratado"
    assert occ["lease_desde"] == str(desde)
    assert occ["se_libera_el"] is None


def test_contrato_de_un_dia_es_valido(client, admin):
    _plano(client, admin)
    _contrato(client, admin, "NAVE-PUN-04", HOY, HOY)
    occ = client.get("/api/spaces/NAVE-PUN-04/rates", headers=admin).json()["occupancy"]
    assert occ["estado"] == "ocupado"
    assert occ["lease_desde"] == occ["lease_hasta"] == str(HOY)


def test_estado_vencido(client, admin):
    desde, hasta = HOY - timedelta(days=20), HOY - timedelta(days=5)
    _plano(client, admin)
    _contrato(client, admin, "NAVE-PUN-04", desde, hasta)
    occ = client.get("/api/spaces/NAVE-PUN-04/rates", headers=admin).json()["occupancy"]
    assert occ["estado"] == "vencido"
    assert occ["lease_desde"] == str(desde)
    assert occ["lease_hasta"] == str(hasta)


def test_vencido_sobrevive_a_que_otro_endpoint_ya_corrio_expire_leases(client, admin):
    """El bug que este diseño evita: "vencido" no puede depender de is_active,
    porque /spaces/map ya lo apaga en cuanto alguien lo pisa."""
    desde, hasta = HOY - timedelta(days=20), HOY - timedelta(days=5)
    _plano(client, admin)
    _contrato(client, admin, "NAVE-PUN-04", desde, hasta)
    # Dispara expire_leases() de verdad, como haría el polling del mapa.
    assert client.get("/api/spaces/map", headers=admin).status_code == 200
    occ = client.get("/api/spaces/NAVE-PUN-04/rates", headers=admin).json()["occupancy"]
    assert occ["estado"] == "vencido"


def test_cancelar_no_deja_el_espacio_vencido(client, admin):
    """Cancelado no es lo mismo que vencido: el espacio vuelve a disponible."""
    desde, hasta = HOY - timedelta(days=1), HOY + timedelta(days=5)
    _plano(client, admin)
    lease = _contrato(client, admin, "NAVE-PUN-04", desde, hasta)
    espacio = client.get("/api/spaces/by-code/NAVE-PUN-04", headers=admin).json()
    r = client.delete(f"/api/spaces/{espacio['id']}/leases/{lease['id']}", headers=admin)
    assert r.status_code == 204, r.text
    occ = client.get("/api/spaces/NAVE-PUN-04/rates", headers=admin).json()["occupancy"]
    assert occ["estado"] == "disponible"


# ─── Ocupación de un PERÍODO ────────────────────────────────────────────────


def test_rango_libre_sin_contrato(client, admin):
    _plano(client, admin)
    d, h = HOY, HOY + timedelta(days=9)
    occ = client.get(
        f"/api/spaces/NAVE-PUN-04/rates?desde={d}&hasta={h}", headers=admin
    ).json()["occupancy"]
    assert occ == {"estado": "libre"}


def test_rango_tomado_coincide_exacto(client, admin):
    d, h = HOY, HOY + timedelta(days=9)
    _plano(client, admin)
    _contrato(client, admin, "NAVE-PUN-04", d, h)
    occ = client.get(
        f"/api/spaces/NAVE-PUN-04/rates?desde={d}&hasta={h}", headers=admin
    ).json()["occupancy"]
    assert occ == {"estado": "tomado"}


def test_rango_se_libera_cuando_es_parcial(client, admin):
    """El contrato cubre sólo una parte del período pedido: ni libre ni tomado."""
    _plano(client, admin)
    _contrato(client, admin, "NAVE-PUN-04", HOY, HOY + timedelta(days=9))
    d, h = HOY + timedelta(days=5), HOY + timedelta(days=15)
    occ = client.get(
        f"/api/spaces/NAVE-PUN-04/rates?desde={d}&hasta={h}", headers=admin
    ).json()["occupancy"]
    assert occ == {"estado": "se_libera"}


def test_rango_ambos_extremos_inclusivos(client, admin):
    """Un contrato que termina el día X bloquea justo el día X, ni uno más ni uno menos."""
    _plano(client, admin)
    _contrato(client, admin, "NAVE-PUN-04", HOY, HOY + timedelta(days=4))
    # El período pedido empieza justo el día en que el contrato termina.
    d, h = HOY + timedelta(days=4), HOY + timedelta(days=8)
    occ = client.get(
        f"/api/spaces/NAVE-PUN-04/rates?desde={d}&hasta={h}", headers=admin
    ).json()["occupancy"]
    assert occ == {"estado": "se_libera"}  # 1 de 5 días tomado


def test_desde_sin_hasta_es_422(client, admin):
    _plano(client, admin)
    r = client.get(f"/api/spaces/NAVE-PUN-04/rates?desde={HOY}", headers=admin)
    assert r.status_code == 422


def test_desde_posterior_a_hasta_es_422(client, admin):
    _plano(client, admin)
    d, h = HOY + timedelta(days=5), HOY
    r = client.get(f"/api/spaces/NAVE-PUN-04/rates?desde={d}&hasta={h}", headers=admin)
    assert r.status_code == 422
