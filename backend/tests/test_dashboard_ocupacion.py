"""GET /api/dashboard/ocupacion — agregado por sede: esperada vs real.

El caso que motiva el archivo es que las dos ocupaciones tienen que poder
DIFERIR: "esperada" cuenta lo contratado, "real" cuenta de eso lo que además
se confirmó montado (``mount_confirmations``, el último reporte por espacio).
Un contrato firmado que nadie fue a armar todavía tiene que bajar "real" sin
tocar "esperada" — si las dos siempre coincidieran, el KPI no diría nada que
"contratadas" no dijera ya.
"""
from datetime import date, timedelta

from app.auth import create_mount_token

HOY = date.today()

JPG = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00\xff\xd9"

# Tres puntas comercializables + una caja que no lo es (queda fuera de todo).
FIXTURES = [
    {
        "id": "f1", "code": "PUN-04", "sede": "NAVE", "type": "punta",
        "label": "Punta 4", "cx": 3, "cz": 8, "rotY": 0,
        "w": 1.2, "d": 0.9, "h": 1.8, "color": "#6366f1",
    },
    {
        "id": "f2", "code": "PUN-05", "sede": "NAVE", "type": "punta",
        "label": "Punta 5", "cx": 6, "cz": 8, "rotY": 0,
        "w": 1.2, "d": 0.9, "h": 1.8, "color": "#6366f1",
    },
    {
        "id": "f3", "code": "PUN-06", "sede": "NAVE", "type": "punta",
        "label": "Punta 6", "cx": 9, "cz": 8, "rotY": 0,
        "w": 1.2, "d": 0.9, "h": 1.8, "color": "#6366f1",
    },
    {
        "id": "f4", "code": "CAJ-01", "sede": "NAVE", "type": "checkout",
        "label": "Cajas", "cx": 3, "cz": 1, "rotY": 0, "rentable": False,
        "w": 6.0, "d": 1.2, "h": 1.2, "color": "#cbd5e1",
    },
]

GONDOLA_DOBLE = [
    {
        "id": "g1", "code": "GON-01", "sede": "NAVE", "type": "gondola",
        "gondolaType": "double",
        "label": "Góndola 1", "cx": 3, "cz": 8, "rotY": 0,
        "w": 0.9, "d": 4.0, "h": 1.8, "color": "#94a3b8",
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


def _montar(client, headers, code, sede="NAVE", estado="montado"):
    data = {"space_code": code, "estado": estado, "sede": sede}
    files = {"foto": ("m.jpg", JPG, "image/jpeg")} if estado == "montado" else None
    if estado != "montado":
        data["motivo"] = "sin_material"
    r = client.post("/api/mounts/", data=data, headers=headers, files=files)
    assert r.status_code == 201, r.text
    return r.json()


def _una(client, admin, sede="NAVE", **params):
    r = client.get("/api/dashboard/ocupacion", params={"sede": sede, **params}, headers=admin)
    assert r.status_code == 200, r.text
    filas = r.json()
    assert len(filas) == 1, filas
    return filas[0]


def _montaje_token(code="NAVE-PUN-04"):
    return create_mount_token(code)


# ─── Forma general ──────────────────────────────────────────────────────────


def test_token_de_montaje_recibe_401(client, admin):
    _plano(client, admin)
    r = client.get(
        "/api/dashboard/ocupacion", headers={"Authorization": f"Bearer {_montaje_token()}"}
    )
    assert r.status_code == 401


def test_sin_token_401(client):
    assert client.get("/api/dashboard/ocupacion").status_code == 401


def test_sede_sin_plano_devuelve_lista_vacia_no_404(client, admin):
    r = client.get("/api/dashboard/ocupacion?sede=NOEXISTE", headers=admin)
    assert r.status_code == 200
    assert r.json() == []


def test_lo_no_comercializable_no_cuenta(client, admin):
    """Sólo 3 de las 4 fixtures son comercializables (CAJ-01 no lo es)."""
    _plano(client, admin)
    fila = _una(client, admin)
    assert fila["caras_comercializables"] == 3


def test_gondola_doble_cuenta_dos_caras(client, admin):
    _plano(client, admin, fixtures=GONDOLA_DOBLE)
    fila = _una(client, admin)
    assert fila["caras_comercializables"] == 2


# ─── Esperada vs real: el caso central ──────────────────────────────────────


def test_esperada_y_real_pueden_diferir(client, admin, worker):
    """PUN-04: contratada y montada. PUN-05: contratada, SIN montar.
    PUN-06: libre. 3 comercializables, 2 contratadas, 1 montada."""
    _plano(client, admin)
    _set_rates(client, admin, default={"punta": 500_000})

    _contrato(client, admin, "NAVE-PUN-04", HOY - timedelta(days=1), HOY + timedelta(days=10), valor=1_000_000)
    _montar(client, worker, "NAVE-PUN-04")

    _contrato(client, admin, "NAVE-PUN-05", HOY - timedelta(days=1), HOY + timedelta(days=10), valor=1_000_000)
    # PUN-05 nunca se reporta montado.

    fila = _una(client, admin)
    assert fila["caras_comercializables"] == 3
    assert fila["contratadas"] == 2
    assert fila["montadas"] == 1
    assert fila["vencidas"] == 0
    assert fila["ocupacion_esperada_pct"] == round(2 / 3 * 100, 1)
    assert fila["ocupacion_real_pct"] == round(1 / 3 * 100, 1)
    assert fila["ocupacion_esperada_pct"] != fila["ocupacion_real_pct"]


def test_vencidas_cuenta_lo_expirado_sin_reemplazo(client, admin):
    _plano(client, admin)
    _contrato(client, admin, "NAVE-PUN-06", HOY - timedelta(days=20), HOY - timedelta(days=5))
    fila = _una(client, admin)
    assert fila["vencidas"] == 1
    # Vencido no es lo mismo que contratado hoy.
    assert fila["contratadas"] == 0


def test_no_montado_no_cuenta_como_montada(client, admin, worker):
    """Reportar "no pude montar" no debe sumar a "montadas"."""
    _plano(client, admin)
    _contrato(client, admin, "NAVE-PUN-04", HOY - timedelta(days=1), HOY + timedelta(days=10))
    _montar(client, worker, "NAVE-PUN-04", estado="no_montado")
    fila = _una(client, admin)
    assert fila["contratadas"] == 1
    assert fila["montadas"] == 0


def test_manda_el_ultimo_reporte_de_montaje(client, admin, worker):
    """Si el último reporte dice "no pude", eso es lo que cuenta, aunque antes
    hubiera dicho "montado"."""
    _plano(client, admin)
    _contrato(client, admin, "NAVE-PUN-04", HOY - timedelta(days=1), HOY + timedelta(days=10))
    _montar(client, worker, "NAVE-PUN-04", estado="montado")
    _montar(client, worker, "NAVE-PUN-04", estado="no_montado")
    fila = _una(client, admin)
    assert fila["montadas"] == 0


# ─── Plata: sólo admin ──────────────────────────────────────────────────────


def test_worker_no_recibe_los_campos_de_ingreso(client, admin, worker):
    _plano(client, admin)
    _contrato(client, admin, "NAVE-PUN-04", HOY - timedelta(days=1), HOY + timedelta(days=10), valor=1_000_000)
    r = client.get("/api/dashboard/ocupacion?sede=NAVE", headers=worker)
    fila = r.json()[0]
    assert "ingreso_contratado" not in fila
    assert "ingreso_a_referencia" not in fila
    # El resto de la fila sí es visible.
    assert fila["contratadas"] == 1


def test_admin_recibe_ingreso_contratado_y_a_referencia(client, admin):
    """Prorrateado /30 al PERÍODO pedido, no el monto mensual a secas.

    El contrato cubre de sobra los 30 días pedidos (desde 5 días antes hasta
    bien después), así que el prorrateo de los 30 días del período da
    exactamente el monto mensual — el mismo número que antes de prorratear,
    pero ahora es una coincidencia del período elegido, no la fórmula.
    """
    _plano(client, admin)
    _set_rates(client, admin, default={"punta": 500_000})
    _contrato(client, admin, "NAVE-PUN-04", HOY - timedelta(days=5), HOY + timedelta(days=40), valor=1_000_000)
    desde, hasta = HOY, HOY + timedelta(days=29)  # 30 días exactos
    fila = _una(client, admin, desde=desde, hasta=hasta)
    assert fila["ingreso_contratado"] == 1_000_000
    # 3 caras comercializables a 500.000 de referencia cada una, prorrateadas
    # a los mismos 30 días del período: da el monto mensual entero.
    assert fila["ingreso_a_referencia"] == 1_500_000


def test_ingreso_contratado_prorratea_a_un_periodo_mas_corto(client, admin):
    """Medio período (15 de 30 días) prorratea a la mitad, no al mes completo."""
    _plano(client, admin)
    _contrato(client, admin, "NAVE-PUN-04", HOY - timedelta(days=5), HOY + timedelta(days=40), valor=900_000)
    desde, hasta = HOY, HOY + timedelta(days=14)  # 15 días
    fila = _una(client, admin, desde=desde, hasta=hasta)
    assert fila["ingreso_contratado"] == round(900_000 * 15 / 30)


def test_contrato_de_un_dia_prorratea_a_monthly_sobre_30(client, admin):
    """El caso que motivó la corrección: un contrato de un día NO puede sumar
    el mes entero — son $66.667, no $2.000.000."""
    _plano(client, admin)
    _contrato(client, admin, "NAVE-PUN-04", HOY, HOY, valor=2_000_000)
    fila = _una(client, admin)  # sin desde/hasta: período es HOY, un día
    assert fila["ingreso_contratado"] == round(2_000_000 / 30) == 66_667


def test_temporada_cerrada_no_reporta_cero(client, admin):
    """Un contrato ya vencido (is_active apagado por expire_leases) sigue
    reportando lo que devengó para el período que cubrió — "junio vendido"
    no puede volver $0 sólo porque ya pasó."""
    _plano(client, admin)
    lease_desde, lease_hasta = HOY - timedelta(days=33), HOY - timedelta(days=4)  # 30 días
    _contrato(client, admin, "NAVE-PUN-04", lease_desde, lease_hasta, valor=900_000)
    # El período pedido se estira unos días más allá del fin del contrato:
    # "vencido" se mide AL FINAL del período (`hasta`), así que tiene que
    # quedar después de lease_hasta para que el contrato ya esté vencido
    # mirado desde ahí — si `hasta` coincidiera con el último día del
    # contrato, ese día todavía está "ocupado", no "vencido".
    desde, hasta = lease_desde, HOY - timedelta(days=1)
    fila = _una(client, admin, desde=desde, hasta=hasta)
    # El ingreso prorratea sólo los 30 días que el contrato realmente cubrió
    # dentro del período (no los días de después, que nadie contrató).
    assert fila["ingreso_contratado"] == 900_000
    # Vencido, sí — pero eso no vacía el ingreso del período que sí cubrió.
    assert fila["vencidas"] == 1


def test_dos_contratos_consecutivos_suman_prorrateos_sin_doblar(client, admin):
    """Dos contratos que se turnan la MISMA cara sin superponerse: el ingreso
    del período es la suma de lo que cada uno prorratea, ni más ni menos —
    el bug que corrige esto sumaba el monto MENSUAL completo de cada uno."""
    _plano(client, admin)
    _contrato(client, admin, "NAVE-PUN-04", HOY - timedelta(days=10), HOY - timedelta(days=1), valor=900_000)
    _contrato(client, admin, "NAVE-PUN-04", HOY, HOY + timedelta(days=9), valor=1_200_000)
    desde, hasta = HOY - timedelta(days=10), HOY + timedelta(days=9)  # 20 días, cubiertos por los dos
    fila = _una(client, admin, desde=desde, hasta=hasta)
    esperado = round((900_000 * 10 + 1_200_000 * 10) / 30)
    assert fila["ingreso_contratado"] == esperado
    # Si hubiera doblado (sumando el mes completo de cada uno) daría 2.100.000.
    assert fila["ingreso_contratado"] != 900_000 + 1_200_000


def test_cancelacion_conserva_el_devengado_hasta_cancelled_at(client, admin):
    """Cancelar no borra lo YA devengado: prorratea hasta la fecha de
    cancelación, no hasta el end_date original ni a cero."""
    _plano(client, admin)
    lease = _contrato(
        client, admin, "NAVE-PUN-04",
        HOY - timedelta(days=10), HOY + timedelta(days=10), valor=3_000_000,
    )
    espacio = client.get("/api/spaces/by-code/NAVE-PUN-04", headers=admin).json()
    r = client.delete(f"/api/spaces/{espacio['id']}/leases/{lease['id']}", headers=admin)
    assert r.status_code == 204, r.text

    # Período que abarca de sobra el contrato original (21 días).
    desde, hasta = HOY - timedelta(days=10), HOY + timedelta(days=10)
    fila = _una(client, admin, desde=desde, hasta=hasta)

    # Cancelado HOY: se devengaron los 11 días de start_date a hoy, inclusive
    # — no los 21 del contrato original, y no cero.
    esperado = round(3_000_000 * 11 / 30)
    assert fila["ingreso_contratado"] == esperado
    sin_cancelar = round(3_000_000 * 21 / 30)
    assert fila["ingreso_contratado"] < sin_cancelar
    assert fila["ingreso_contratado"] > 0


# ─── Período ────────────────────────────────────────────────────────────────


def test_periodo_por_defecto_es_hoy(client, admin):
    """Sin desde/hasta, un contrato que ya venció no cuenta como contratado."""
    _plano(client, admin)
    _contrato(client, admin, "NAVE-PUN-04", HOY - timedelta(days=20), HOY - timedelta(days=5))
    fila = _una(client, admin)
    assert fila["contratadas"] == 0
    assert fila["vencidas"] == 1


def test_periodo_futuro_cuenta_lo_que_toca_esa_ventana(client, admin):
    """Un contrato que arranca dentro del período pedido cuenta como contratado
    para ESE período, aunque hoy todavía no haya empezado."""
    _plano(client, admin)
    _contrato(client, admin, "NAVE-PUN-04", HOY + timedelta(days=30), HOY + timedelta(days=40))
    desde, hasta = HOY + timedelta(days=35), HOY + timedelta(days=45)
    r = client.get(
        f"/api/dashboard/ocupacion?sede=NAVE&desde={desde}&hasta={hasta}", headers=admin
    )
    fila = r.json()[0]
    assert fila["contratadas"] == 1


def test_desde_sin_hasta_es_422(client, admin):
    r = client.get(f"/api/dashboard/ocupacion?desde={HOY}", headers=admin)
    assert r.status_code == 422


def test_desde_posterior_a_hasta_es_422(client, admin):
    d, h = HOY + timedelta(days=5), HOY
    r = client.get(f"/api/dashboard/ocupacion?desde={d}&hasta={h}", headers=admin)
    assert r.status_code == 422


def test_cancelar_libera_la_cara_para_periodos_futuros(client, admin):
    """Cancelar suelta la cara HACIA ADELANTE. El día de la cancelación la
    cara devengó (prorrateo hasta ``cancelled_at``), así que para HOY cuenta
    como contratada Y con plata — plata y conteo van juntos por construcción
    (hallazgo C-3: nunca más ``ingreso_contratado > 0`` con
    ``contratadas = 0`` en la misma fila). De mañana en adelante: libre."""
    _plano(client, admin)
    lease = _contrato(client, admin, "NAVE-PUN-04", HOY - timedelta(days=1), HOY + timedelta(days=10))
    espacio = client.get("/api/spaces/by-code/NAVE-PUN-04", headers=admin).json()
    r = client.delete(f"/api/spaces/{espacio['id']}/leases/{lease['id']}", headers=admin)
    assert r.status_code == 204, r.text

    fila_hoy = _una(client, admin)  # período por defecto: HOY
    assert fila_hoy["contratadas"] == 1
    assert fila_hoy["ingreso_contratado"] > 0

    manana = HOY + timedelta(days=1)
    fila = _una(client, admin, desde=manana, hasta=HOY + timedelta(days=10))
    assert fila["contratadas"] == 0
    assert fila["ingreso_contratado"] == 0


# ─── C-1 / C-3: una sola elegibilidad, y sin mirar el calendario ────────────


def _apagar_sin_fila(lease_id):
    """Simula una cancelación ANTERIOR a ``lease_cancellations``: apaga
    ``is_active`` sin dejar fila, directo en la base — por API es imposible a
    propósito (el endpoint de cancelar escribe la fila en la misma
    transacción)."""
    from app.database import SessionLocal
    from app.models.models import SpaceLease

    db = SessionLocal()
    try:
        lease = db.get(SpaceLease, lease_id)
        lease.is_active = False
        db.commit()
    finally:
        db.close()


def test_cancelacion_historica_end_date_pasado_cuenta_hasta_end_date(client, admin):
    """C-1 (regresión): sin fila y con ``end_date`` ya pasado, el lease cuenta
    hasta su ``end_date`` — igual que un vencimiento natural de
    ``expire_leases()``. Es la regla estable elegida: el prorrateo fino de las
    cancelaciones pre-tabla lo repone el backfill desde ``audit_log``, no una
    comparación contra HOY en runtime."""
    _plano(client, admin)
    desde_l, hasta_l = HOY - timedelta(days=33), HOY - timedelta(days=4)  # 30 días
    lease = _contrato(client, admin, "NAVE-PUN-04", desde_l, hasta_l, valor=900_000)
    _apagar_sin_fila(lease["id"])
    fila = _una(client, admin, desde=desde_l, hasta=hasta_l)
    assert fila["ingreso_contratado"] == 900_000
    assert fila["contratadas"] == 1  # plata y conteo, juntos (C-3)


def test_cancelacion_historica_end_date_futuro_no_salta_con_el_calendario(client, admin):
    """C-1, el caso que "saltaba solo": sin fila y con ``end_date`` en el
    futuro, antes valía $0 hoy y el plazo ENTERO el día que ``end_date``
    quedara atrás — el P&L de una temporada cambiaba sin que nadie tocara
    nada. La regla estable: cuenta hasta ``end_date`` desde ya, el mismo
    número hoy, mañana y en un año — la elegibilidad es función pura de lo
    guardado y no mira ``date.today()``."""
    _plano(client, admin)
    desde_l, hasta_l = HOY - timedelta(days=9), HOY + timedelta(days=20)  # 30 días
    lease = _contrato(client, admin, "NAVE-PUN-04", desde_l, hasta_l, valor=900_000)
    _apagar_sin_fila(lease["id"])
    fila = _una(client, admin, desde=desde_l, hasta=hasta_l)
    assert fila["ingreso_contratado"] == 900_000
    assert fila["contratadas"] == 1


def test_plata_y_conteo_nunca_se_contradicen_en_temporada_cerrada(client, admin):
    """C-3 (regresión, el caso de junio): una temporada ya cerrada cuyo
    contrato terminó cancelado tiene que mostrar su devengado Y contar la
    cara. Antes: ``ingreso_contratado = $1.000.000`` con ``contratadas = 0``
    en la misma fila — plata sin ocupación, imposible de explicar."""
    _plano(client, admin)
    desde_l, hasta_l = HOY - timedelta(days=40), HOY - timedelta(days=11)  # 30 días
    lease = _contrato(client, admin, "NAVE-PUN-04", desde_l, hasta_l, valor=1_000_000)
    espacio = client.get("/api/spaces/by-code/NAVE-PUN-04", headers=admin).json()
    r = client.delete(f"/api/spaces/{espacio['id']}/leases/{lease['id']}", headers=admin)
    assert r.status_code == 204, r.text
    fila = _una(client, admin, desde=desde_l, hasta=hasta_l)
    assert fila["ingreso_contratado"] == 1_000_000
    assert fila["contratadas"] == 1


def test_sin_sede_devuelve_todas_las_que_tienen_plano(client, admin):
    poblado_fixtures = [{**f, "sede": "POBLADO"} for f in FIXTURES]
    _plano(client, admin, sede="NAVE")
    _plano(client, admin, sede="POBLADO", fixtures=poblado_fixtures)
    r = client.get("/api/dashboard/ocupacion", headers=admin)
    assert r.status_code == 200
    sedes = {fila["sede"] for fila in r.json()}
    assert sedes == {"NAVE", "POBLADO"}
