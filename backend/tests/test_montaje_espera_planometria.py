"""El correo de montaje espera a la planometría (decisión del dueño, 2026-10-20).

``docs/rediseno/vender-api.md`` §4 y ``services/montajes_pendientes.py``: el
aviso a quien monta sale cuando el contrato tiene su planometría —el archivo o
un planograma publicado de la cara; en un porcentaje, su zona confirmada
(2026-10-29)—, una sola vez. Comercial y el proveedor reciben el suyo al guardar, como siempre. Un
contrato de antes de la regla (sin fila pendiente) no cambia.

Y la lista de Supervisar («Falta planometría»): ``GET /api/montajes/pendientes``,
sólo de administración y sin plata.
"""
import json

from tests import test_participaciones as tp
from tests import test_vender_contrato as tv

RELOJ = tp.RELOJ
D = tp.D
JPG = b"\xff\xd8\xff\xe0 una planometria"


def _correos(monkeypatch, client, admin):
    """Los correos de la planilla (por donde sale el de montaje) y los del
    contrato suelto, capturados: [(para, asunto, html)]."""
    import app.routers.spaces as spaces

    enviados = tv._correos(monkeypatch, client, admin)
    monkeypatch.setattr(spaces, "send_mail_to_bg", lambda to, asunto, html: enviados.append((to, asunto, html)))
    return enviados


def _por_montar(enviados):
    return [(to, html) for to, asunto, html in enviados if "por montar" in asunto]


def _planometria(client, admin, lease_id, nombre="plano.jpg"):
    r = client.post(f"/api/leases/{lease_id}/planometria", headers=admin,
                    files={"file": (nombre, JPG, "image/jpeg")})
    assert r.status_code == 201, r.text
    return r.json()


def _pendientes(client, headers, sede="NAVE"):
    return client.get("/api/montajes/pendientes", headers=headers, params={"sede": sede})


def _cuantos_pendientes():
    from app.models.vender import MontajePendiente

    return tv._cuantos(MontajePendiente)


def _zona_confirmada(client, admin, termino, version=0):
    sup = tp._cara(client, admin)["superficie"]
    zonas = tp._zonas((termino["space_id"], tp._franja(sup, 0, 0.2)))
    tp._distribuir(client, admin, "confirmar", "GON-01", version, zonas)


# ─── Una cara entera ──────────────────────────────────────────────────────────

@RELOJ
def test_una_cara_entera_avisa_al_montaje_cuando_se_carga_la_planometria_y_una_vez(client, admin, monkeypatch):
    tp._plano(client, admin)
    enviados = _correos(monkeypatch, client, admin)
    r = tv._vender(client, admin, tv._pedido(tv._entera("GON-02", 130_000)))
    (lease_id,) = [c["lease_id"] for c in r["contratos"]]

    # Al guardar: comercial y proveedor, sí; quien monta, todavía no.
    assert not _por_montar(enviados), "salió el montaje sin planometría"
    assert [1 for to, _a, _h in enviados if to == ["compras@valle.co"]], "el proveedor recibe su constancia"
    assert [1 for to, _a, _h in enviados if "g@x.co" in to], "comercial recibe su aviso"
    assert r["avisos"]["montaje"] == [] and r["avisos"]["montaje_pendiente"] == [lease_id]
    assert _cuantos_pendientes() == 1

    # Se carga la planometría: sale, con su enlace y sin plata.
    plano = _planometria(client, admin, lease_id)
    assert plano["aviso_de_montaje"] == {"estado": "salio", "smtp_listo": True, "montaje": ["m@x.co"]}
    (montaje,) = _por_montar(enviados)
    assert montaje[0] == ["m@x.co"]
    assert "?montar=NAVE-GON-02" in montaje[1]
    assert "130.000" not in montaje[1] and "130000" not in montaje[1] and "$" not in montaje[1]
    assert _cuantos_pendientes() == 0

    # Reemplazarla no lo repite.
    otra = _planometria(client, admin, lease_id, nombre="otra.jpg")
    assert otra["aviso_de_montaje"] is None
    assert len(_por_montar(enviados)) == 1


@RELOJ
def test_la_planilla_sigue_la_misma_regla(client, admin, monkeypatch):
    tp._plano(client, admin)
    enviados = _correos(monkeypatch, client, admin)
    filas = [{"fila": 1, "espacio": "GON-02", "sede": "NAVE", "proveedor": "Alpina", "correo": "ventas@alpina.co",
              "valor": 500_000, **tv.NOV},
             {"fila": 2, "espacio": "NEV-03", "sede": "NAVE", "proveedor": "Alpina", "correo": "ventas@alpina.co",
              "valor": 300_000, **tv.NOV}]
    r = client.post("/api/leases/bulk/confirmar", headers=admin, json={"sede": "NAVE", "filas": filas})
    assert r.status_code == 200, r.text
    cuerpo = r.json()
    assert cuerpo["creados"] == 2, cuerpo
    ids = [f["lease_id"] for f in cuerpo["filas"]]
    assert not _por_montar(enviados)
    assert cuerpo["avisos"]["montaje"] == [] and cuerpo["avisos"]["montaje_pendiente"] == sorted(ids)
    assert [1 for to, _a, _h in enviados if to == ["ventas@alpina.co"]]

    # La planometría de la nevera: sale el de la nevera, y nada más (la
    # planilla es sólo para muebles enteros desde el 2026-10-26).
    _planometria(client, admin, ids[1])
    (montaje,) = _por_montar(enviados)
    assert "NAVE-NEV-03" in montaje[1] and "Puerta" not in montaje[1]
    assert "NAVE-GON-02" not in montaje[1]
    assert _cuantos_pendientes() == 1


@RELOJ
def test_el_contrato_suelto_tambien_espera(client, admin, monkeypatch):
    tp._plano(client, admin)
    enviados = _correos(monkeypatch, client, admin)
    space = client.post("/api/spaces/find-or-create", headers=admin, json={
        "code": "NAVE-GON-02", "name": "Góndola 2", "zone": "Z", "sede": "NAVE", "area_m2": 0.8}).json()
    sup = client.post("/api/suppliers/find-or-create", headers=admin,
                      json={"name": "Nutresa", "email": "ventas@nutresa.co"}).json()
    r = client.post(f"/api/spaces/{space['id']}/leases", headers=admin, json={
        "supplier_id": sup["id"], "marca": "Chocolates", "start_date": D(2026, 11, 1),
        "end_date": D(2026, 11, 30), "monthly_rent": 900_000})
    assert r.status_code == 201, r.text
    lease = r.json()
    assert lease["avisos"]["montaje"] == [] and lease["avisos"]["montaje_pendiente"] == [lease["id"]]
    assert not [1 for _to, asunto, _h in enviados if asunto.startswith("Montar ") or "por montar" in asunto]
    assert [1 for to, _a, _h in enviados if to == ["ventas@nutresa.co"]]

    _planometria(client, admin, lease["id"])
    (montaje,) = _por_montar(enviados)
    assert "NAVE-GON-02" in montaje[1] and "900" not in montaje[1]


@RELOJ
def test_una_reserva_confirmada_espera_su_planometria(client, admin, monkeypatch):
    tp._plano(client, admin)
    enviados = _correos(monkeypatch, client, admin)
    r = tv._vender(client, admin, tv._pedido(tv._entera("GON-02", 130_000), tipo="reserva", caduca=D(2026, 10, 25)))
    (reserva,) = r["reservas"]
    c = client.post(f"/api/reservas/{reserva['reserva_id']}/confirmar", headers=admin, json={})
    assert c.status_code == 200, c.text
    confirmada = c.json()
    assert confirmada["avisos"]["montaje_pendiente"] == [confirmada["lease_id"]]
    assert not _por_montar(enviados)
    assert _planometria(client, admin, confirmada["lease_id"])["aviso_de_montaje"]["estado"] == "salio"
    assert len(_por_montar(enviados)) == 1


# ─── Un porcentaje: la planometría y la zona, en cualquier orden ─────────────

@RELOJ
def test_un_porcentaje_con_planometria_espera_la_zona(client, admin, monkeypatch):
    tp._plano(client, admin)
    enviados = _correos(monkeypatch, client, admin)
    t = tp._alta(client, admin, pb=2500, correo="trade@postobon.co")["termino"]
    assert _planometria(client, admin, t["lease_id"])["aviso_de_montaje"]["estado"] == "espera_distribucion"
    assert not _por_montar(enviados)
    (fila,) = _pendientes(client, admin).json()
    assert (fila["falta_planometria"], fila["falta_distribucion"]) == (False, True)

    _zona_confirmada(client, admin, t)
    (montaje,) = _por_montar(enviados)
    assert "NAVE-GON-01-PC1" in montaje[1] and "Participación 1 · 25 % de la cara A" in montaje[1]
    assert _cuantos_pendientes() == 0
    # Ni otra planometría ni otra confirmación lo repiten.
    assert _planometria(client, admin, t["lease_id"], nombre="otra.jpg")["aviso_de_montaje"] is None
    _zona_confirmada(client, admin, t, version=1)
    assert len(_por_montar(enviados)) == 1


@RELOJ
def test_en_un_porcentaje_la_zona_confirmada_basta(client, admin, monkeypatch):
    """Decisión del dueño (2026-10-29): «con la distribución se supone que ya
    debería estar». En un porcentaje, la zona confirmada ES su planometría: el
    aviso sale al confirmarla, sin archivo."""
    tp._plano(client, admin)
    enviados = _correos(monkeypatch, client, admin)
    t = tp._alta(client, admin, pb=2500)["termino"]
    (fila,) = _pendientes(client, admin).json()
    assert (fila["falta_planometria"], fila["falta_distribucion"]) == (False, True), "pide un archivo además de la zona"

    _zona_confirmada(client, admin, t)
    (montaje,) = _por_montar(enviados)
    assert "NAVE-GON-01-PC1" in montaje[1]
    assert _cuantos_pendientes() == 0
    assert _pendientes(client, admin).json() == []


# ─── Un planograma publicado cuenta como planometría ─────────────────────────

def _planograma_publicado(client, admin, fixture_id, cara="A", hasta=D(2026, 10, 31)):
    d = client.post("/api/planogramas/destinos", headers=admin, json={
        "sede": "NAVE", "nombre": "Lácteos", "tipo": "categoria", "color": "d1", "como_se_monta": "Al frente"})
    assert d.status_code == 201, d.text
    base = {"sede": "NAVE", "fixture_id": fixture_id, "cara": cara}
    bloque = client.get("/api/planogramas/cara", headers=admin, params=base)
    assert bloque.status_code == 200, bloque.text
    r = client.put("/api/planogramas/borrador", headers=admin, json={**base, "version": 0, "piezas": [
        # 30 % del ancho son 28,82 % de lo útil de la cara de GON-02 (el zócalo y
        # los parantes no cuentan): lo que el servidor mide.
        {"destino_id": d.json()["id"], "pb": 2882, "vertices": [[0, 0], [0.3, 0], [0.3, 1], [0, 1]]}]})
    assert r.status_code == 200, r.text
    r = client.post("/api/planogramas/publicar", headers=admin,
                    json={**base, "version": 1, "rige_desde": D(2026, 10, 17), "hasta": hasta})
    assert r.status_code == 200, r.text


@RELOJ
def test_un_planograma_publicado_cuenta_como_la_planometria_de_la_cara(client, admin, monkeypatch):
    tp._plano(client, admin)
    enviados = _correos(monkeypatch, client, admin)
    r = tv._vender(client, admin, tv._pedido(tv._entera("GON-02", 130_000)))
    (lease_id,) = [c["lease_id"] for c in r["contratos"]]
    (fila,) = _pendientes(client, admin).json()
    assert fila["falta_planometria"] is True

    _planograma_publicado(client, admin, "f-GON-02")
    (montaje,) = _por_montar(enviados)
    assert "NAVE-GON-02" in montaje[1] and "130.000" not in montaje[1]
    assert _cuantos_pendientes() == 0
    # Cargar el archivo después no lo repite.
    assert _planometria(client, admin, lease_id)["aviso_de_montaje"] is None
    assert len(_por_montar(enviados)) == 1


@RELOJ
def test_los_que_ya_tenian_todo_salen_al_leer_la_lista(client, admin, monkeypatch):
    """Lo que quedó listo con la regla nueva sin que nadie volviera a confirmar
    ni a cargar (en producción: una distribución confirmada antes del cambio)
    no queda esperando: sale cuando Supervisar lee la lista."""
    from app.models.models import LeaseFile

    tp._plano(client, admin)
    enviados = _correos(monkeypatch, client, admin)
    r = tv._vender(client, admin, tv._pedido(tv._entera("GON-02", 130_000)))
    (lease_id,) = [c["lease_id"] for c in r["contratos"]]
    db = tp._bd()
    try:  # la planometría sin pasar por el endpoint (no avisa)
        db.add(LeaseFile(lease_id=lease_id, kind="planometria", filename="p.jpg", content_type="image/jpeg",
                         size=len(JPG), data=JPG))
        db.commit()
    finally:
        db.close()
    assert not _por_montar(enviados)

    assert _pendientes(client, admin).json() == []
    (montaje,) = _por_montar(enviados)
    assert "NAVE-GON-02" in montaje[1]
    assert _cuantos_pendientes() == 0


# ─── Lo de antes no cambia ────────────────────────────────────────────────────

@RELOJ
def test_un_contrato_de_antes_de_la_regla_no_recibe_otro_aviso(client, admin, monkeypatch):
    """Sin fila pendiente (un contrato guardado antes del 2026-10-20, cuyo
    aviso de montaje ya salió al guardarlo): cargar la planometría o confirmar
    la distribución no manda nada."""
    from app.models.vender import MontajePendiente

    tp._plano(client, admin)
    enviados = _correos(monkeypatch, client, admin)
    entera = tv._vender(client, admin, tv._pedido(tv._entera("GON-02")))["contratos"][0]["lease_id"]
    t = tp._alta(client, admin, pb=2500)["termino"]
    db = tp._bd()
    try:
        db.query(MontajePendiente).delete()
        db.commit()
    finally:
        db.close()

    assert _planometria(client, admin, entera)["aviso_de_montaje"] is None
    assert _planometria(client, admin, t["lease_id"])["aviso_de_montaje"] is None
    _zona_confirmada(client, admin, t)
    assert not _por_montar(enviados)
    assert _pendientes(client, admin).json() == []


# ─── La lista de Supervisar ───────────────────────────────────────────────────

@RELOJ
def test_la_lista_de_pendientes_dice_que_falta_y_no_lleva_plata(client, admin, worker):
    tp._plano(client, admin)
    r = tv._vender(client, admin, tv._pedido(tv._entera("GON-02", 130_000), tv._entera("NEV-03-PU1", 70_000),
                                             tv._pct("GON-01-B", 2500, 610_000)))
    entera, puerta = (c["lease_id"] for c in r["contratos"])
    (p,) = r["participaciones"]

    respuesta = _pendientes(client, admin)
    assert respuesta.status_code == 200, respuesta.text
    filas = respuesta.json()
    por_contrato = {f["lease_id"]: f for f in filas}
    assert set(por_contrato) == {entera, puerta, p["lease_id"]}
    assert por_contrato[entera] == {
        "lease_id": entera, "espacio": "NAVE-GON-02", "cara": "NAVE-GON-02", "sede": "NAVE",
        "proveedor": "Lácteos del Valle", "marca": "Yogur Valle", "desde": "2026-11-01", "hasta": "2026-11-30",
        "falta_planometria": True, "falta_distribucion": False, "dias_para_empezar": 15,
    }
    assert (por_contrato[puerta]["espacio"], por_contrato[puerta]["cara"]) == ("NAVE-NEV-03-PU1", "NAVE-NEV-03")
    pct = por_contrato[p["lease_id"]]
    assert (pct["espacio"], pct["cara"]) == ("NAVE-GON-01-B-PC1", "NAVE-GON-01-B")
    # Un porcentaje sólo espera su zona: la distribución es su planometría.
    assert (pct["falta_planometria"], pct["falta_distribucion"]) == (False, True)

    # Sin plata: ni un campo de valor ni un monto en el texto.
    texto = json.dumps(filas)
    for monto in ("130000", "70000", "610000", "130.000", "valor", "monthly_rent", "cobro"):
        assert monto not in texto, monto

    # Cargada la planometría de la entera, sale de la lista; un contrato
    # cancelado tampoco está; otra sede no ve nada.
    _planometria(client, admin, entera)
    espacio = client.get("/api/spaces/by-code/NAVE-NEV-03-PU1", headers=admin).json()
    assert client.delete(f"/api/spaces/{espacio['id']}/leases/{puerta}", headers=admin).status_code == 204
    assert [f["lease_id"] for f in _pendientes(client, admin).json()] == [p["lease_id"]]
    assert _pendientes(client, admin, sede="OTRA").json() == []

    # Sólo administración.
    assert _pendientes(client, worker).status_code == 403
    assert client.get("/api/montajes/pendientes", params={"sede": "NAVE"}).status_code == 401
