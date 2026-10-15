"""La cobranza a mano en la consola (C1): suscripción, cuentas de cobro y pagos.

Lo que la dueña decidió y estas pruebas fijan (2026-10-13):

* **Sólo la operadora.** Plata y facturas no las ve ni las toca nadie más: ni la
  dueña de otro supermercado, ni el login legado. Todo 403, y nada escrito.
* **Sin suscripción no hay cobranza.** Galerías y todo cliente sin suscripción
  sale «exento»: sin deuda, sin facturas, y no se le puede emitir nada.
* **Esta tanda no corta el servicio a nadie.** El único movimiento del sistema
  es LEVANTAR el estado cuando un pago deja al cliente al día, y sólo si la
  operadora lo pide; lo firma ``sistema:cobranza`` y nunca empeora nada.
* **Las facturas cuelgan de la suscripción, no del slug**, y el id de la
  suscripción no se reutiliza (``sqlite_autoincrement``): quien funda de nuevo
  un slug borrado no hereda la deuda del anterior.
* **Una transferencia puede pagar varias facturas**: la referencia bancaria no
  es única.
* **El PATCH de siempre hace lo mismo que antes** y, además, deja historial.

**Todos los ``import app.*`` van adentro de las funciones**, por lo mismo que
explican ``conftest.py`` y ``test_estado_cuenta.py``: el fixture ``client``
purga ``sys.modules`` entre pruebas.
"""
import re
from datetime import date, timedelta
from types import SimpleNamespace

import pytest

from app.fechas import hoy as hoy_en_colombia  # el «hoy» del negocio: Colombia

OPERADORA = "op@plataforma.co"


class FakeVerificador:
    def __init__(self, mapa: dict):
        self.mapa = mapa

    def verificar(self, id_token):
        return self.mapa.get(id_token)


def _claims(uid, email):
    return SimpleNamespace(uid=uid, email=email, email_verificado=True, proveedor="google.com", nombre=None)


def _cab(token):
    return {"Authorization": f"Bearer {token}"}


def _fundar(client, uid, email, slug, nombre):
    from app.services.firebase_tokens import get_verificador

    client.app.dependency_overrides[get_verificador] = lambda: FakeVerificador({uid: _claims(uid, email)})
    r = client.post(
        "/api/clientes/alta",
        json={"id_token": uid, "slug": slug, "nombre": nombre, "acepta_politica": True},
    )
    assert r.status_code == 200, r.text
    return _cab(r.json()["token"])


@pytest.fixture()
def operadora(client, monkeypatch):
    cab = _fundar(client, "uid-op", OPERADORA, "consola", "Consola")
    monkeypatch.setenv("OPERADOR_EMAILS", OPERADORA)
    return cab


def _registro():
    from app.clientes import sesion_registro

    return sesion_registro()


def _filas(modelo, *condiciones):
    reg = _registro()
    try:
        return reg.query(modelo).filter(*condiciones).all()
    finally:
        reg.close()


def _cartera(client, cab) -> dict:
    r = client.get("/api/plataforma/cobros", headers=cab)
    assert r.status_code == 200, r.text
    return {c["slug"]: c for c in r.json()["clientes"]}


SUSCRIPCION = {
    "modo": "manual", "valor_cop": 1_000_000, "unidad": "supermercado_mes", "cantidad": 1,
    "periodicidad_meses": 1, "plazo_pago_dias": 30, "dia_solo_lectura": 30,
    "razon_social": "Cañaveral S.A.S.", "nit": "900123456-7", "correo_facturacion": "tesoreria@canaveral.co",
    "municipio": "Cali", "retefuente_pct": 3.5, "reteica_pct": 0.966, "reteiva_pct": 0,
}


def _suscribir(client, cab, slug, **cambios):
    r = client.put(f"/api/plataforma/clientes/{slug}/suscripcion", json={**SUSCRIPCION, **cambios}, headers=cab)
    assert r.status_code == 200, r.text
    return r.json()


def _emitir(client, cab, slug, periodo, numero, *, vence_hace=None, **extra):
    cuerpo = {"periodo": periodo, "numero": numero, **extra}
    if vence_hace is not None:
        vence = hoy_en_colombia() - timedelta(days=vence_hace)
        cuerpo.setdefault("emitida_el", (vence - timedelta(days=30)).isoformat())
        cuerpo["vence_el"] = vence.isoformat()
    r = client.post(f"/api/plataforma/clientes/{slug}/facturas", json=cuerpo, headers=cab)
    assert r.status_code == 200, r.text
    return r.json()


def _pagar(client, cab, factura_id, *, esperado=200, **cuerpo):
    datos = {"medio": "transferencia", "ref_externa": "TRX-1", **cuerpo}
    r = client.post(f"/api/plataforma/facturas/{factura_id}/pagos", json=datos, headers=cab)
    assert r.status_code == esperado, r.text
    return r.json()


def _patch(client, cab, slug, estado, motivo):
    r = client.patch(f"/api/plataforma/clientes/{slug}", json={"estado": estado, "motivo": motivo}, headers=cab)
    assert r.status_code == 200, r.text
    return r.json()


# ════════════════════════════════════════════════════════════════════════════
# Sólo la operadora
# ════════════════════════════════════════════════════════════════════════════

def test_quien_no_es_operadora_no_ve_ni_toca_los_cobros(client, admin, operadora):
    """La dueña de un supermercado (cuenta real, owner) y el login legado: 403
    en cada endpoint de cobros, y ninguno deja una fila escrita."""
    from app.models.cobro import CambioEstadoCuenta, FacturaCobro, PagoCobro, Suscripcion

    _suscribir(client, operadora, "consola")
    factura = _emitir(client, operadora, "consola", "2026-09", "CC-001")
    antes = {m.__tablename__: len(_filas(m)) for m in (Suscripcion, FacturaCobro, PagoCobro, CambioEstadoCuenta)}

    duenia = _fundar(client, "uid-d", "duenia@tienda.co", "tienda", "Tienda")
    pedidos = (
        ("get", "/api/plataforma/cobros", None),
        ("put", "/api/plataforma/clientes/tienda/suscripcion", SUSCRIPCION),
        ("post", "/api/plataforma/clientes/consola/facturas", {"periodo": "2026-10", "numero": "CC-X"}),
        ("post", f"/api/plataforma/facturas/{factura['id']}/pagos",
         {"valor_recibido_cop": 1_000_000, "ref_externa": "X", "levantar_estado": True}),
        ("post", f"/api/plataforma/facturas/{factura['id']}/anular", {"motivo": "x"}),
        ("post", f"/api/plataforma/facturas/{factura['id']}/disputa", {"motivo": "x"}),
    )
    for metodo, ruta, cuerpo in pedidos:
        for quien, cabecera in (("dueña", duenia), ("legado", admin)):
            r = client.request(metodo.upper(), ruta, json=cuerpo, headers=cabecera)
            assert r.status_code == 403, (quien, ruta, r.status_code, r.text)
            assert "1.000.000" not in r.text and "CC-001" not in r.text
        assert client.request(metodo.upper(), ruta, json=cuerpo).status_code == 401, ruta

    despues = {m.__tablename__: len(_filas(m)) for m in (Suscripcion, FacturaCobro, PagoCobro, CambioEstadoCuenta)}
    assert despues == antes


# ════════════════════════════════════════════════════════════════════════════
# Exento: sin suscripción no hay deuda
# ════════════════════════════════════════════════════════════════════════════

def test_un_cliente_sin_suscripcion_es_exento_y_nunca_aparece_con_deuda(client, operadora):
    """Galerías (y todo cliente sin fila en `suscripciones`) sale exento: sin
    deuda, sin atraso, sin facturas, y no se le puede emitir una."""
    _suscribir(client, operadora, "consola")
    _emitir(client, operadora, "consola", "2026-08", "CC-001", vence_hace=60)

    cartera = _cartera(client, operadora)
    galerias = cartera["galerias"]
    assert galerias["exento"] is True
    assert galerias["suscripcion"] is None
    assert galerias["saldo_pendiente_cop"] is None
    assert galerias["dias_atraso"] is None
    assert galerias["proxima_factura"] is None
    assert galerias["facturas"] == []
    assert galerias["estado_correspondiente"] is None
    assert galerias["estado"] == "activo"

    # Y el de al lado, con una vencida, sí debe: la deuda no se contagia.
    assert cartera["consola"]["exento"] is False
    assert cartera["consola"]["saldo_pendiente_cop"] == 1_000_000
    assert cartera["consola"]["dias_atraso"] == 60

    r = client.post("/api/plataforma/clientes/galerias/facturas",
                    json={"periodo": "2026-10", "numero": "CC-G1"}, headers=operadora)
    assert r.status_code == 409, r.text
    assert "exento" in r.json()["detail"]


def test_levantar_el_estado_no_mueve_a_un_cliente_sin_suscripcion(client, operadora):
    """El camino del sistema sobre un exento no hace nada: ni fila de estado ni
    historial."""
    from app.models.cobro import CambioEstadoCuenta
    from app.models.plataforma import EstadoCliente
    from app.services.cobranza import levantar_si_corresponde

    r = levantar_si_corresponde("galerias")
    assert r["movido"] is False and r["razon"] == "exento"
    assert _filas(EstadoCliente, EstadoCliente.slug == "galerias") == []
    assert _filas(CambioEstadoCuenta, CambioEstadoCuenta.cliente_slug == "galerias") == []


# ════════════════════════════════════════════════════════════════════════════
# La suscripción
# ════════════════════════════════════════════════════════════════════════════

def test_el_modo_automatico_exige_la_referencia_del_contrato(client, operadora):
    r = client.put("/api/plataforma/clientes/consola/suscripcion",
                   json={**SUSCRIPCION, "modo": "automatico"}, headers=operadora)
    assert r.status_code == 422, r.text
    assert "contrato" in r.json()["detail"]
    r = client.put("/api/plataforma/clientes/consola/suscripcion",
                   json={**SUSCRIPCION, "modo": "automatico", "contrato_ref": "   "}, headers=operadora)
    assert r.status_code == 422, r.text

    sus = _suscribir(client, operadora, "consola", modo="automatico", contrato_ref="Contrato firmado 2026-10-01")
    assert sus["modo"] == "automatico"
    assert _cartera(client, operadora)["consola"]["suscripcion"]["modo"] == "automatico"


def test_el_cliente_de_la_base_principal_nunca_pasa_a_automatico(client, operadora):
    r = client.put("/api/plataforma/clientes/galerias/suscripcion",
                   json={**SUSCRIPCION, "modo": "automatico", "contrato_ref": "x"}, headers=operadora)
    assert r.status_code == 409, r.text
    # Manual sí: la dueña puede querer ver sus cuentas de cobro en la cartera.
    assert _suscribir(client, operadora, "galerias")["modo"] == "manual"


def test_la_suscripcion_valida_lo_que_recibe(client, operadora):
    for cambio in ({"valor_cop": 0}, {"modo": "pasarela"}, {"unidad": "por_espacio"},
                   {"retefuente_pct": 101}, {"correo_facturacion": "no es correo"},
                   {"dia_solo_lectura": 0}):
        r = client.put("/api/plataforma/clientes/consola/suscripcion",
                       json={**SUSCRIPCION, **cambio}, headers=operadora)
        assert r.status_code == 422, (cambio, r.text)
    r = client.put("/api/plataforma/clientes/no-existe/suscripcion", json=SUSCRIPCION, headers=operadora)
    assert r.status_code == 404


# ════════════════════════════════════════════════════════════════════════════
# Facturas y pagos
# ════════════════════════════════════════════════════════════════════════════

def test_la_factura_calcula_retenciones_y_neto_y_copia_nombre_y_nit(client, operadora):
    _suscribir(client, operadora, "consola")
    f = _emitir(client, operadora, "consola", "2026-10", "CC-001")
    assert f["subtotal_cop"] == 1_000_000  # sin subtotal: lo pactado por un mes
    assert f["total_cop"] == 1_000_000
    assert f["retenciones_estimadas_cop"] == 44_660  # 3,5 % + 0,966 %
    assert f["neto_esperado_cop"] == 955_340
    assert f["vence_el"] == (date.fromisoformat(f["emitida_el"]) + timedelta(days=30)).isoformat()
    assert f["estado"] == "emitida"

    from app.models.cobro import FacturaCobro
    (fila,) = _filas(FacturaCobro, FacturaCobro.id == f["id"])
    assert (fila.cliente_nombre, fila.nit) == ("Cañaveral S.A.S.", "900123456-7")

    trimestre = _emitir(client, operadora, "consola", "2026-11..2027-01", "CC-002")
    assert trimestre["subtotal_cop"] == 3_000_000

    # Una viva por período, y los números no se repiten.
    r = client.post("/api/plataforma/clientes/consola/facturas",
                    json={"periodo": "2026-10", "numero": "CC-003"}, headers=operadora)
    assert r.status_code == 409, r.text
    r = client.post("/api/plataforma/clientes/consola/facturas",
                    json={"periodo": "2027-02", "numero": "CC-001"}, headers=operadora)
    assert r.status_code == 409, r.text
    for malo in ("2026-13", "26-10", "2026-10..2026-09", ""):
        r = client.post("/api/plataforma/clientes/consola/facturas",
                        json={"periodo": malo, "numero": "CC-9"}, headers=operadora)
        assert r.status_code == 422, (malo, r.text)


def test_un_pago_manual_con_retenciones_salda_la_factura(client, operadora):
    """La demo del plan: transferencia por el neto más la retefuente y la
    reteICA que el supermercado descontó → la factura queda pagada, aunque el
    certificado no haya llegado."""
    _suscribir(client, operadora, "consola")
    f = _emitir(client, operadora, "consola", "2026-09", "CC-001", vence_hace=5)

    # Un abono a cuenta no la salda.
    r = _pagar(client, operadora, f["id"], valor_recibido_cop=500_000, ref_externa="TRX-A")
    assert r["factura"]["estado"] == "emitida"
    assert r["factura"]["saldo_cop"] == 500_000

    r = _pagar(client, operadora, f["id"], valor_recibido_cop=455_340 - 1_000,
               retefuente_cop=35_000, reteica_cop=9_660, ref_externa="TRX-B")
    assert r["factura"]["estado"] == "pagada"  # faltan $1.000: la tolerancia del redondeo
    assert r["factura"]["pagada_el"] == hoy_en_colombia().isoformat()
    assert r["pago"]["registrado_por"] == OPERADORA
    assert r["pago"]["certificado_recibido"] is False
    assert r["estado_cuenta"] is None  # no pidió levantar nada

    fila = _cartera(client, operadora)["consola"]
    assert fila["saldo_pendiente_cop"] == 0
    assert fila["dias_atraso"] is None
    assert fila["estado_correspondiente"] == "activo"
    assert fila["proxima_factura"] is None
    assert fila["ultimo_pago"]["ref_externa"] == "TRX-B"
    assert fila["ultimo_pago"]["factura_numero"] == "CC-001"

    # Pagada, no recibe más pagos.
    _pagar(client, operadora, f["id"], esperado=409, valor_recibido_cop=1, ref_externa="TRX-C")


def test_un_pago_que_supera_lo_que_falta_se_rechaza(client, operadora):
    _suscribir(client, operadora, "consola")
    f = _emitir(client, operadora, "consola", "2026-09", "CC-001")
    r = _pagar(client, operadora, f["id"], esperado=409, valor_recibido_cop=2_000_000)
    assert "varias" in r["detail"]
    for malo in ({"valor_recibido_cop": 0}, {"valor_recibido_cop": 10, "ref_externa": " "},
                 {"valor_recibido_cop": 10, "medio": "wompi"},
                 {"valor_recibido_cop": 10, "recibido_el": (hoy_en_colombia() + timedelta(days=1)).isoformat()}):
        _pagar(client, operadora, f["id"], esperado=422, **malo)
    _pagar(client, operadora, 999_999, esperado=404, valor_recibido_cop=10)


def test_una_transferencia_puede_pagar_dos_facturas(client, operadora):
    """Cañaveral paga septiembre y octubre con UNA transferencia: se registra
    en cada cuenta de cobro la parte que le toca, con la misma referencia."""
    from app.models.cobro import PagoCobro

    _suscribir(client, operadora, "consola", retefuente_pct=0, reteica_pct=0)
    sep = _emitir(client, operadora, "consola", "2026-09", "CC-001", vence_hace=20)
    octu = _emitir(client, operadora, "consola", "2026-10", "CC-002", vence_hace=2)

    a = _pagar(client, operadora, sep["id"], valor_recibido_cop=1_000_000, ref_externa="BANCOLOMBIA-778")
    b = _pagar(client, operadora, octu["id"], valor_recibido_cop=1_000_000, ref_externa="BANCOLOMBIA-778")
    assert a["factura"]["estado"] == b["factura"]["estado"] == "pagada"

    pagos = _filas(PagoCobro, PagoCobro.ref_externa == "BANCOLOMBIA-778")
    assert sorted(p.factura_id for p in pagos) == sorted([sep["id"], octu["id"]])
    assert _cartera(client, operadora)["consola"]["saldo_pendiente_cop"] == 0


def test_anular_libera_el_periodo_y_no_se_anula_lo_que_tiene_pagos(client, operadora):
    _suscribir(client, operadora, "consola")
    f = _emitir(client, operadora, "consola", "2026-10", "CC-001")

    r = client.post(f"/api/plataforma/facturas/{f['id']}/anular", json={"motivo": " "}, headers=operadora)
    assert r.status_code == 422
    r = client.post(f"/api/plataforma/facturas/{f['id']}/anular",
                    json={"motivo": "Salió con el NIT viejo"}, headers=operadora)
    assert r.status_code == 200, r.text
    assert r.json()["estado"] == "anulada"
    assert r.json()["saldo_cop"] == 0

    # El período queda libre para la corregida; el número, usado para siempre.
    r = client.post("/api/plataforma/clientes/consola/facturas",
                    json={"periodo": "2026-10", "numero": "CC-001"}, headers=operadora)
    assert r.status_code == 409
    nueva = _emitir(client, operadora, "consola", "2026-10", "CC-002")
    _pagar(client, operadora, f["id"], esperado=409, valor_recibido_cop=10)

    _pagar(client, operadora, nueva["id"], valor_recibido_cop=100_000)
    r = client.post(f"/api/plataforma/facturas/{nueva['id']}/anular", json={"motivo": "x"}, headers=operadora)
    assert r.status_code == 409, r.text


def test_una_factura_en_disputa_no_cuenta_para_el_atraso(client, operadora):
    _suscribir(client, operadora, "consola")
    f = _emitir(client, operadora, "consola", "2026-08", "CC-001", vence_hace=45)
    assert _cartera(client, operadora)["consola"]["estado_correspondiente"] == "solo_lectura"

    r = client.post(f"/api/plataforma/facturas/{f['id']}/disputa",
                    json={"motivo": "Discuten dos sedes"}, headers=operadora)
    assert r.status_code == 200, r.text
    assert r.json()["en_disputa"] is True
    fila = _cartera(client, operadora)["consola"]
    assert fila["estado_correspondiente"] == "activo"
    assert fila["dias_atraso"] is None

    r = client.post(f"/api/plataforma/facturas/{f['id']}/disputa",
                    json={"motivo": "Se aclaró", "en_disputa": False}, headers=operadora)
    assert r.status_code == 200
    assert _cartera(client, operadora)["consola"]["estado_correspondiente"] == "solo_lectura"


# ════════════════════════════════════════════════════════════════════════════
# Levantar el estado tras un pago
# ════════════════════════════════════════════════════════════════════════════

def test_el_pago_levanta_el_estado_solo_si_se_pide_y_lo_firma_el_sistema(client, operadora):
    """La operadora puso sólo lectura a mano. Un pago SIN la opción no toca el
    estado; un abono CON la opción tampoco (no quedó al día); el pago que salda
    con la opción lo levanta a activo, firmado `sistema:cobranza`, y el correo
    de ella queda en el pago, no en el estado."""
    from app.models.cobro import CambioEstadoCuenta
    from app.plataforma_estado import estado_de

    _suscribir(client, operadora, "consola", retefuente_pct=0, reteica_pct=0)
    f = _emitir(client, operadora, "consola", "2026-08", "CC-001", vence_hace=40)
    _patch(client, operadora, "consola", "solo_lectura", "Factura de agosto impaga")

    r = _pagar(client, operadora, f["id"], valor_recibido_cop=300_000, ref_externa="T1")
    assert r["estado_cuenta"] is None
    r = _pagar(client, operadora, f["id"], valor_recibido_cop=300_000, ref_externa="T2", levantar_estado=True)
    assert r["estado_cuenta"]["movido"] is False
    assert r["estado_cuenta"]["estado"] == "solo_lectura"
    assert estado_de("consola")[0] == "solo_lectura"

    r = _pagar(client, operadora, f["id"], valor_recibido_cop=400_000, ref_externa="T3", levantar_estado=True)
    assert r["factura"]["estado"] == "pagada"
    assert r["estado_cuenta"]["movido"] is True
    assert r["estado_cuenta"]["estado"] == "activo"
    assert r["estado_cuenta"]["cambiado_por"] == "sistema:cobranza"
    assert r["pago"]["registrado_por"] == OPERADORA
    # El caché se invalidó: el corte se levanta en el pedido siguiente.
    assert estado_de("consola") == ("activo", None)

    ultimo = _filas(CambioEstadoCuenta, CambioEstadoCuenta.cliente_slug == "consola")[-1]
    assert (ultimo.de, ultimo.a, ultimo.actor) == ("solo_lectura", "activo", "sistema:cobranza")
    assert ultimo.suscripcion_id == _cartera(client, operadora)["consola"]["suscripcion"]["id"]


def test_un_pago_nunca_empeora_el_estado(client, operadora):
    """El cliente está activo con una factura vencida hace 40 días (le
    correspondería sólo lectura). Pagar OTRA con «levantar» no lo corta: un
    pago nunca le corta el servicio a nadie (y no quedó al día, así que
    tampoco hay nada que levantar)."""
    _suscribir(client, operadora, "consola", retefuente_pct=0, reteica_pct=0)
    _emitir(client, operadora, "consola", "2026-08", "CC-001", vence_hace=40)
    otra = _emitir(client, operadora, "consola", "2026-09", "CC-002", vence_hace=10)

    r = _pagar(client, operadora, otra["id"], valor_recibido_cop=1_000_000, levantar_estado=True)
    assert r["estado_cuenta"]["movido"] is False
    assert r["estado_cuenta"]["estado"] == "activo"
    fila = _cartera(client, operadora)["consola"]
    assert (fila["estado"], fila["estado_correspondiente"]) == ("activo", "solo_lectura")


def test_el_sistema_no_empeora_lo_que_puso_una_persona(client, operadora):
    """La regla que va a necesitar la escalera de C2, fijada desde ya en el
    único camino que escribe: una máquina sólo empeora un estado que no existe,
    que dice activo o que puso otra máquina."""
    from app.services.cobranza import ACTOR_SISTEMA, mover_estado

    r = mover_estado("consola", "gracia", "aviso", ACTOR_SISTEMA)
    assert r["movido"] is True  # sin fila: puede
    r = mover_estado("consola", "solo_lectura", "atraso", ACTOR_SISTEMA)
    assert r["movido"] is True  # lo había puesto el sistema: puede

    _patch(client, operadora, "consola", "gracia", "Lo hablé con la dueña")
    r = mover_estado("consola", "solo_lectura", "atraso", ACTOR_SISTEMA)
    assert (r["movido"], r["razon"], r["estado"]) == (False, "lo_puso_una_persona", "gracia")
    # Mejorar lo de una persona, sólo si ella lo pidió.
    r = mover_estado("consola", "activo", "al día", ACTOR_SISTEMA)
    assert r["movido"] is False
    r = mover_estado("consola", "activo", "al día", ACTOR_SISTEMA, mejorar_sobre_una_persona=True)
    assert r["movido"] is True

    _patch(client, operadora, "consola", "activo", "Reactivada a mano")
    r = mover_estado("consola", "gracia", "aviso", ACTOR_SISTEMA)
    assert r["movido"] is True  # «activo» puesto por una persona no congela nada


def test_los_motivos_que_escribe_el_sistema_no_llevan_montos(client, operadora):
    """El motivo le llega a la dueña del supermercado y la franja se ve en
    Vender, delante de los proveedores: una fecha sí, un monto jamás."""
    from app.models.plataforma import EstadoCliente
    from app.services.cobranza import ACTOR_SISTEMA, EL_QUE_CORRESPONDE, motivo_del_sistema, mover_estado

    _suscribir(client, operadora, "consola", valor_cop=2_345_678, retefuente_pct=0, reteica_pct=0)
    vieja = _emitir(client, operadora, "consola", "2026-07", "CC-001", vence_hace=50)
    _emitir(client, operadora, "consola", "2026-08", "CC-002", vence_hace=12)

    # Paga la vieja y el sistema escribe lo que corresponde: gracia por la otra.
    _pagar(client, operadora, vieja["id"], valor_recibido_cop=2_345_678)
    r = mover_estado("consola", EL_QUE_CORRESPONDE, None, ACTOR_SISTEMA)
    assert (r["movido"], r["estado"]) == (True, "gracia")
    (fila,) = _filas(EstadoCliente, EstadoCliente.slug == "consola")
    for motivo in (fila.motivo,) + tuple(
        motivo_del_sistema(e, [SimpleNamespace(estado="emitida", vence_el=date(2026, 9, 1), en_disputa=False,
                                               total_cop=2_345_678)], date(2026, 10, 13))
        for e in ("activo", "gracia", "solo_lectura")
    ):
        assert "$" not in motivo, motivo
        assert not re.search(r"\d[\d.]{3,}", motivo.replace("2026", "")), motivo


# ════════════════════════════════════════════════════════════════════════════
# Borrar y volver a fundar: nadie hereda la deuda
# ════════════════════════════════════════════════════════════════════════════

def test_borrar_y_volver_a_fundar_el_mismo_slug_no_hereda_facturas(client, operadora):
    from app.models.cobro import CambioEstadoCuenta, FacturaCobro, PagoCobro, Suscripcion

    _fundar(client, "uid-m", "medium@x.co", "medium", "Medium")
    _patch(client, operadora, "medium", "gracia", "Antes de la suscripción")  # historial sin suscripción
    vieja = _suscribir(client, operadora, "medium", retefuente_pct=0, reteica_pct=0)
    f = _emitir(client, operadora, "medium", "2026-09", "CC-M1", vence_hace=40)
    _pagar(client, operadora, f["id"], valor_recibido_cop=200_000)
    _emitir(client, operadora, "medium", "2026-10", "CC-M2", vence_hace=5)
    _patch(client, operadora, "medium", "solo_lectura", "Con suscripción")  # historial con suscripción

    assert client.post("/api/plataforma/clientes/medium/archivar", json={"motivo": "baja"},
                       headers=operadora).status_code == 200
    r = client.post("/api/plataforma/clientes/medium/borrar", json={"confirmacion": "medium"}, headers=operadora)
    assert r.status_code == 200, r.text

    # Se fue la suscripción y el historial sin suscripción; quedó la constancia.
    assert _filas(Suscripcion, Suscripcion.cliente_slug == "medium") == []
    historial = _filas(CambioEstadoCuenta, CambioEstadoCuenta.cliente_slug == "medium")
    assert [h.suscripcion_id for h in historial] == [vieja["id"]]
    assert len(_filas(FacturaCobro, FacturaCobro.suscripcion_id == vieja["id"])) == 2
    assert len(_filas(PagoCobro, PagoCobro.factura_id == f["id"])) == 1

    # Alguien funda «medium» otra vez: exento, sin deuda, sin facturas.
    _fundar(client, "uid-m2", "otra@x.co", "medium", "Medium Nuevo")
    fila = _cartera(client, operadora)["medium"]
    assert fila["exento"] is True and fila["facturas"] == [] and fila["saldo_pendiente_cop"] is None

    # Y con suscripción nueva, tampoco: su id no es el de la vieja.
    nueva = _suscribir(client, operadora, "medium")
    assert nueva["id"] != vieja["id"]
    fila = _cartera(client, operadora)["medium"]
    assert fila["facturas"] == []
    assert fila["saldo_pendiente_cop"] == 0
    assert fila["estado_correspondiente"] == "activo"
    assert fila["estado"] == "activo"
    # El mismo período se puede emitir: la viva de antes era de otra suscripción.
    _emitir(client, operadora, "medium", "2026-10", "CC-M3")


def test_el_id_de_una_suscripcion_borrada_no_se_reutiliza(client, operadora):
    """Lo que hace que la herencia de arriba no pase en SQLite (pruebas y
    entorno local): sin `sqlite_autoincrement` la fila borrada devolvía su id."""
    from app.models.cobro import Suscripcion

    primera = _suscribir(client, operadora, "consola")["id"]
    reg = _registro()
    try:
        reg.query(Suscripcion).delete()
        reg.commit()
    finally:
        reg.close()
    assert _suscribir(client, operadora, "consola")["id"] > primera


# ════════════════════════════════════════════════════════════════════════════
# El PATCH de siempre, ahora por `mover_estado`
# ════════════════════════════════════════════════════════════════════════════

def test_el_patch_da_lo_mismo_que_antes_y_ademas_deja_historial(client, operadora):
    from app.models.cobro import CambioEstadoCuenta
    from app.models.plataforma import EstadoCliente
    from app.plataforma_estado import estado_de

    assert estado_de("galerias") == ("activo", None)  # deja el caché caliente
    cuerpo = _patch(client, operadora, "galerias", "suspendido", "Tres meses sin pagar")
    assert set(cuerpo) == {"slug", "estado", "motivo", "cambiado_en", "cambiado_por"}
    assert (cuerpo["slug"], cuerpo["estado"], cuerpo["motivo"], cuerpo["cambiado_por"]) == (
        "galerias", "suspendido", "Tres meses sin pagar", OPERADORA)
    assert estado_de("galerias") == ("suspendido", "Tres meses sin pagar")  # caché invalidado

    _patch(client, operadora, "galerias", "activo", "Pagó")
    (fila,) = _filas(EstadoCliente, EstadoCliente.slug == "galerias")
    assert (fila.estado, fila.cambiado_por) == ("activo", OPERADORA)  # la fila queda de constancia

    historial = _filas(CambioEstadoCuenta, CambioEstadoCuenta.cliente_slug == "galerias")
    assert [(h.de, h.a, h.motivo, h.actor, h.suscripcion_id) for h in historial] == [
        ("activo", "suspendido", "Tres meses sin pagar", OPERADORA, None),
        ("suspendido", "activo", "Pagó", OPERADORA, None),
    ]

    # Lo inválido sigue dando 422/404 y no deja ni estado ni historial.
    for slug, estado, motivo, codigo in (("galerias", "vip", "x", 422), ("galerias", "gracia", "  ", 422),
                                         ("no-existe", "gracia", "x", 404)):
        r = client.patch(f"/api/plataforma/clientes/{slug}", json={"estado": estado, "motivo": motivo},
                         headers=operadora)
        assert r.status_code == codigo, (slug, estado, r.text)
    assert len(_filas(CambioEstadoCuenta)) == 2


# ════════════════════════════════════════════════════════════════════════════
# Las cuentas puras
# ════════════════════════════════════════════════════════════════════════════

def _f(vence_el, estado="emitida", en_disputa=False):
    return SimpleNamespace(estado=estado, vence_el=vence_el, en_disputa=en_disputa)


def test_estado_objetivo_vencida_es_despues_del_dia_del_vencimiento(client):
    from app.services.cobranza import estado_objetivo

    hoy = date(2026, 10, 13)
    sus = SimpleNamespace(dia_solo_lectura=30, prorroga_hasta=None)
    assert estado_objetivo(sus, [], hoy) == "activo"
    assert estado_objetivo(sus, [_f(hoy)], hoy) == "activo"  # el día que vence, todavía a tiempo
    assert estado_objetivo(sus, [_f(hoy - timedelta(days=1))], hoy) == "gracia"
    assert estado_objetivo(sus, [_f(hoy - timedelta(days=29))], hoy) == "gracia"
    assert estado_objetivo(sus, [_f(hoy - timedelta(days=30))], hoy) == "solo_lectura"
    # Nunca suspendido, por más atraso que haya.
    assert estado_objetivo(sus, [_f(hoy - timedelta(days=400))], hoy) == "solo_lectura"
    # Lo que no se cobra no cuenta: pagada, anulada, borrador, en disputa.
    for otra in (_f(hoy - timedelta(days=90), "pagada"), _f(hoy - timedelta(days=90), "anulada"),
                 _f(hoy - timedelta(days=90), "borrador"), _f(hoy - timedelta(days=90), en_disputa=True)):
        assert estado_objetivo(sus, [otra], hoy) == "activo"
    # Manda la más vieja.
    assert estado_objetivo(sus, [_f(hoy - timedelta(days=2)), _f(hoy - timedelta(days=31))], hoy) == "solo_lectura"
    # Una prórroga vigente no deja pasar de gracia; vencida, no cuenta.
    con_prorroga = SimpleNamespace(dia_solo_lectura=30, prorroga_hasta=hoy)
    assert estado_objetivo(con_prorroga, [_f(hoy - timedelta(days=60))], hoy) == "gracia"
    con_prorroga.prorroga_hasta = hoy - timedelta(days=1)
    assert estado_objetivo(con_prorroga, [_f(hoy - timedelta(days=60))], hoy) == "solo_lectura"


def test_factura_saldada_con_retenciones_y_tolerancia(client):
    from app.services.cobranza import factura_saldada

    f = SimpleNamespace(total_cop=1_000_000)

    def pago(valor, rf=0, ri=0, rv=0, estado="aprobado"):
        return SimpleNamespace(valor_recibido_cop=valor, retefuente_cop=rf, reteica_cop=ri, reteiva_cop=rv, estado=estado)

    assert factura_saldada(f, [pago(955_340, rf=35_000, ri=9_660)])
    assert factura_saldada(f, [pago(999_000)])           # mil pesos de tolerancia
    assert not factura_saldada(f, [pago(998_999)])
    assert not factura_saldada(f, [pago(1_000_000, estado="anulado")])
    assert factura_saldada(f, [pago(500_000), pago(500_000)])


# ════════════════════════════════════════════════════════════════════════════
# Registro, bitácora y reporte de transparencia
# ════════════════════════════════════════════════════════════════════════════

def test_las_tablas_de_cobro_son_del_registro(client):
    from app.database import Base
    from app.services.traspaso import TABLAS_DEL_CLIENTE, TABLAS_DEL_REGISTRO, tablas_sin_clasificar

    nuevas = {"suscripciones", "facturas_cobro", "pagos_cobro", "cambios_estado_cuenta"}
    assert nuevas <= set(Base.metadata.tables)
    assert nuevas <= TABLAS_DEL_REGISTRO
    assert not nuevas & TABLAS_DEL_CLIENTE
    assert tablas_sin_clasificar() == set()


def test_cada_accion_deja_su_linea_y_el_cliente_la_ve_sin_montos(client, operadora):
    from app.models.plataforma import BitacoraPlataforma

    _suscribir(client, operadora, "consola")
    f = _emitir(client, operadora, "consola", "2026-09", "CC-001")
    _pagar(client, operadora, f["id"], valor_recibido_cop=100_000)
    otra = _emitir(client, operadora, "consola", "2026-10", "CC-002")
    client.post(f"/api/plataforma/facturas/{otra['id']}/disputa", json={"motivo": "x"}, headers=operadora)
    client.post(f"/api/plataforma/facturas/{otra['id']}/anular", json={"motivo": "x"}, headers=operadora)
    _cartera(client, operadora)

    lineas = {(b.accion, b.periodo.split(":")[0]) for b in _filas(BitacoraPlataforma)}
    for accion in ("suscripcion", "factura", "pago_manual", "disputa", "anulacion"):
        assert (accion, "consola") in lineas, accion
    assert any(a == "cobros" for a, _ in lineas)

    # La operadora también es la dueña de «consola»: su reporte las lista.
    reporte = client.get("/api/clientes/mi-reporte-plataforma", headers=operadora)
    assert reporte.status_code == 200, reporte.text
    acciones = {l["accion"] for l in reporte.json()["accesos"]["lineas"]}
    assert {"cobros", "suscripcion", "factura", "pago_manual", "disputa", "anulacion"} <= acciones
    assert "100.000" not in reporte.text and "100000" not in reporte.text
