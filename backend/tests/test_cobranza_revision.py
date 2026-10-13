"""La revisión de C1 y C2 (2026-10-13): lo que encontraron tres revisores —uno
de seguridad y privacidad, uno de la escalera y la plata, uno de cobertura con
mutaciones— y quedó arreglado. Una prueba por hallazgo; cada una se vio fallar
contra el código de antes del arreglo (o contra la mutación que el revisor
dejó viva, cuando el hallazgo era una prueba que faltaba).

Lo que fijan, en palabras de la dueña:

* **Sin aviso formal entregado no hay sólo lectura.** La cuenta pasa a sólo
  lectura diez días después de que SALIÓ el aviso formal, como mínimo: ni con
  una deuda vieja al prender el interruptor, ni con el correo caído.
* **Nadie ve plata que no le toca**: los datos bancarios de RECABRA sólo los ve
  la dueña de un supermercado con suscripción; el correo de facturación que es
  de alguien de su gente no recibe montos; cada destinatario recibe su propio
  correo; quien funde de nuevo un slug borrado no hereda la bitácora de cobros.
* **Un abono no es «al día»**: «levantar» sólo levanta si el pago deja al día.
* **Un mes se cobra una vez**, la plata aguanta más de dos mil millones, y
  sólo lectura es a los 30 días o más, nunca menos.
* **Galerías no la mueve nada del sistema**, aunque tenga una suscripción
  manual para ver sus cuentas de cobro.
* **Anular, disputar o prorrogar se nota al toque** con la escalera prendida.

**Todos los ``import app.*`` van adentro de las funciones**: el fixture
``client`` purga ``sys.modules`` entre pruebas (ver ``conftest.py``).
"""
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

from app.fechas import hoy as hoy_en_colombia
from tests.test_cobranza_escalera import (  # noqa: F401  (los fixtures se usan por nombre)
    ADMIN,
    DUENA,
    OPERADORA,
    _a_la_duena,
    _correr,
    _emitir,
    _estado,
    _filas,
    _fundar,
    _patch,
    _suscribir,
    correos,
    escena,
    prendida,
)


def _registro():
    from app.clientes import sesion_registro

    return sesion_registro()


def _aviso_formal_hace(factura_id: int, dias: int) -> None:
    """Deja constancia de que el aviso formal de esa cuenta de cobro salió hace
    ``dias`` días, como lo habría dejado una pasada de entonces."""
    from app.models.cobro import AvisoCobro

    reg = _registro()
    try:
        reg.add(AvisoCobro(
            factura_id=factura_id, hito="aviso_solo_lectura", destinatarios_n=2,
            enviado_en=datetime.now(timezone.utc) - timedelta(days=dias),
        ))
        reg.commit()
    finally:
        reg.close()


def _fecha(d):
    from app.services.cobranza_automatica import _fecha as fecha

    return fecha(d)


# ════════════════════════════════════════════════════════════════════════════
# Sin aviso formal entregado no hay sólo lectura (alta)
# ════════════════════════════════════════════════════════════════════════════

def test_una_deuda_vieja_primero_recibe_el_aviso_formal_y_diez_dias_despues_el_corte(
    client, escena, correos, prendida,
):
    """Una cuenta de cobro cargada tarde —vencida hace 35 días, como al prender
    el interruptor sobre una deuda vieja—: la primera pasada la deja en gracia
    y manda el aviso formal con la fecha corrida (hoy + 10). Al día 9 sigue en
    gracia; al 10, sólo lectura y su correo. Antes pasaba derecho a sólo
    lectura, sin un solo aviso."""
    from app.models.cobro import AvisoCobro

    hoy = hoy_en_colombia()
    _suscribir(client, escena.operadora)
    f = _emitir(client, escena.operadora, hoy - timedelta(days=35))

    plan = _correr()
    assert _estado()[0] == "gracia"
    assert [c.hito for _p, c in plan.correos] == ["aviso_solo_lectura"]
    (aviso,) = _a_la_duena(correos)
    assert f"desde el {_fecha(hoy + timedelta(days=10))}" in aviso.asunto

    _correr(hoy + timedelta(days=9))
    assert _estado()[0] == "gracia"
    _correr(hoy + timedelta(days=10))
    assert _estado()[:2] == ("solo_lectura", "sistema:cobranza")
    assert "está en sólo lectura" in _a_la_duena(correos)[-1].asunto
    assert {a.hito for a in _filas(AvisoCobro, AvisoCobro.factura_id == f["id"])} == {
        "aviso_solo_lectura", "solo_lectura",
    }


def test_con_el_correo_caido_la_cuenta_no_pasa_a_solo_lectura_y_el_log_lo_dice(
    client, escena, correos, prendida,
):
    """Ningún correo sale (SMTP caído o sin configurar): la escalera llega a
    gracia y ahí se queda —sin aviso entregado no hay corte—, y la línea del
    log lo dice. Cuando el correo vuelve, sale el aviso y diez días después,
    el corte."""
    from app.models.cobro import AvisoCobro

    _suscribir(client, escena.operadora)
    vence = hoy_en_colombia() + timedelta(days=3)
    _emitir(client, escena.operadora, vence)
    correos.estado["ok"] = False
    for d in (-5, 1, 8, 20, 30, 60):
        plan = _correr(vence + timedelta(days=d))
    assert _estado()[0] == "gracia"
    assert _filas(AvisoCobro) == []
    assert "sin aviso formal entregado" in plan.resumen() and "acme" in plan.resumen()

    correos.estado["ok"] = True
    _correr(vence + timedelta(days=61))
    assert _estado()[0] == "gracia"
    assert "pasa a sólo lectura" in _a_la_duena(correos)[-1].asunto
    _correr(vence + timedelta(days=70))
    assert _estado()[0] == "gracia"
    _correr(vence + timedelta(days=71))
    assert _estado()[0] == "solo_lectura"


def test_con_la_cuenta_ya_en_solo_lectura_ningun_correo_anuncia_el_corte(client, escena, correos, prendida):
    """La cuenta quedó en sólo lectura por la cuenta de cobro de agosto. La de
    septiembre sigue su escalera de correos, pero ninguno anuncia «desde el …
    pasa a sólo lectura» (ya pasó), y el «está en sólo lectura» llega una vez
    por corte, no una por cuenta de cobro."""
    hoy = hoy_en_colombia()
    _suscribir(client, escena.operadora)
    agosto = _emitir(client, escena.operadora, hoy - timedelta(days=40), numero="CC-A", periodo="2026-08")
    _emitir(client, escena.operadora, hoy - timedelta(days=1), numero="CC-B", periodo="2026-09")
    _aviso_formal_hace(agosto["id"], 11)

    for d in range(0, 41):
        _correr(hoy + timedelta(days=d))
        assert _estado()[0] == "solo_lectura", d
    a_la_duena = _a_la_duena(correos)
    assert sum("está en sólo lectura" in c.asunto for c in a_la_duena) == 1
    for c in a_la_duena:
        assert "pasa a sólo lectura" not in c.asunto, c.asunto
        assert "Si sigue impaga, desde el" not in c.html, c.asunto
    de_septiembre = [c for c in a_la_duena if "CC-B" in c.asunto]
    assert de_septiembre and all("ya está en sólo lectura" in c.html for c in de_septiembre)


def test_la_proxima_de_la_duena_es_la_que_cuenta_para_el_atraso(client, escena, correos, prendida):
    """La más vieja está en disputa y la otra no: la dueña ve como «próxima» la
    que la va a dejar en sólo lectura, con la fecha de verdad (diez días
    después del aviso formal, que salió hoy)."""
    hoy = hoy_en_colombia()
    _suscribir(client, escena.operadora)
    vieja = _emitir(client, escena.operadora, hoy - timedelta(days=40), numero="CC-A", periodo="2026-08")
    _emitir(client, escena.operadora, hoy - timedelta(days=25), numero="CC-B", periodo="2026-09")
    r = client.post(f"/api/plataforma/facturas/{vieja['id']}/disputa", headers=escena.operadora,
                    json={"motivo": "El supermercado dice que agosto no se prestó"})
    assert r.status_code == 200, r.text

    prox = client.get("/api/clientes/mi-suscripcion", headers=escena.duena).json()["proxima_factura"]
    assert prox["numero"] == "CC-B"
    assert prox["solo_lectura_desde"] == (hoy + timedelta(days=10)).isoformat()


# ════════════════════════════════════════════════════════════════════════════
# Nadie ve plata que no le toca
# ════════════════════════════════════════════════════════════════════════════

def test_los_datos_bancarios_solo_los_ve_la_duena_de_un_supermercado_con_suscripcion(
    client, escena, monkeypatch,
):
    """El alta es self-service: cualquiera con una cuenta de Google funda un
    supermercado. Sin suscripción, la dueña no recibe la cuenta bancaria de
    RECABRA; con suscripción, sí."""
    monkeypatch.setenv("COBRO_INSTRUCCIONES_TRANSFERENCIA", "Banco Ficticio ahorros 000-111111-22 RECABRA")
    kiosco = _fundar(client, "uid-kiosco", "duena@kiosco.co", "kiosco", "Kiosco")
    r = client.get("/api/clientes/mi-suscripcion", headers=kiosco)
    assert r.status_code == 200, r.text
    assert r.json()["suscripcion"] is None
    assert r.json()["instrucciones_transferencia"] is None
    assert "111111" not in r.text

    _suscribir(client, escena.operadora)
    r = client.get("/api/clientes/mi-suscripcion", headers=escena.duena)
    assert r.json()["instrucciones_transferencia"].startswith("Banco Ficticio")


def test_el_correo_de_facturacion_de_alguien_de_su_gente_no_recibe_montos(client, escena, correos, prendida):
    """La dueña (o la operadora) puso como correo de facturación el de la admin
    del supermercado: los avisos con montos le llegan sólo a la dueña."""
    _suscribir(client, escena.operadora, correo_facturacion=ADMIN)
    _emitir(client, escena.operadora, hoy_en_colombia() - timedelta(days=2))
    plan = _correr()
    assert [c.para for c in correos.enviados] == [[DUENA]]
    assert [c.destinatarios for _p, c in plan.correos] == [1]


def test_la_bitacora_de_cobros_de_un_cliente_borrado_no_le_llega_al_que_funda_el_mismo_slug(client, escena):
    """«acme» tuvo suscripción, cuentas de cobro, un pago y una disputa; se
    archivó y se borró, y otra persona fundó «acme». Su reporte de
    transparencia no trae la relación comercial del anterior —ni lo que la
    operadora haga después sobre una factura huérfana—, y sí lo suyo."""
    _suscribir(client, escena.operadora, modo="manual")
    pagada = _emitir(client, escena.operadora, hoy_en_colombia() - timedelta(days=5),
                     numero="CC-1", periodo="2026-09")
    huerfana = _emitir(client, escena.operadora, hoy_en_colombia() + timedelta(days=5),
                       numero="CC-2", periodo="2026-10")
    op = escena.operadora
    assert client.post(f"/api/plataforma/facturas/{pagada['id']}/pagos", headers=op,
                       json={"valor_recibido_cop": 1_234_567, "ref_externa": "T-1"}).status_code == 200
    assert client.post(f"/api/plataforma/facturas/{huerfana['id']}/disputa", headers=op,
                       json={"motivo": "revisar"}).status_code == 200
    assert client.post("/api/plataforma/clientes/acme/archivar", json={"motivo": "se va"}, headers=op).status_code == 200
    assert client.post("/api/plataforma/clientes/acme/borrar", json={"confirmacion": "acme"},
                       headers=op).status_code == 200

    nueva = _fundar(client, "uid-acme-2", "nueva@acme.co", "acme", "Acme de Otra Dueña")
    # La operadora actúa sobre la factura que quedó de constancia.
    assert client.post(f"/api/plataforma/facturas/{huerfana['id']}/anular", headers=op,
                       json={"motivo": "cliente borrado"}).status_code == 200

    def acciones():
        r = client.get("/api/clientes/mi-reporte-plataforma", headers=nueva)
        assert r.status_code == 200, r.text
        return {linea["accion"] for linea in r.json()["accesos"]["lineas"]}

    de_cobro = {"suscripcion", "factura", "pago_manual", "anulacion", "disputa"}
    assert not (acciones() & de_cobro), acciones()
    _suscribir(client, op, modo="manual")
    assert "suscripcion" in acciones()


# ════════════════════════════════════════════════════════════════════════════
# La plata y las cuentas
# ════════════════════════════════════════════════════════════════════════════

def test_un_abono_con_levantar_no_baja_la_suspension_que_puso_una_persona(client, escena):
    """«Si con este pago queda al día, levantar»: un abono de 100.000 sobre
    1.234.567 no deja al día, así que la suspensión que puso la operadora se
    queda como está —antes se volvía un sólo lectura del sistema—. El pago
    que salda sí la levanta."""
    op = escena.operadora
    _suscribir(client, op, modo="manual")
    f = _emitir(client, op, hoy_en_colombia() - timedelta(days=40))
    _patch(client, op, "suspendido", "Suspendida por decisión de RECABRA")

    r = client.post(f"/api/plataforma/facturas/{f['id']}/pagos", headers=op,
                    json={"valor_recibido_cop": 100_000, "ref_externa": "T-1", "levantar_estado": True})
    assert r.status_code == 200, r.text
    assert (r.json()["estado_cuenta"]["movido"], r.json()["estado_cuenta"]["razon"]) == (False, "no_queda_al_dia")
    assert _estado()[:2] == ("suspendido", OPERADORA)

    r = client.post(f"/api/plataforma/facturas/{f['id']}/pagos", headers=op,
                    json={"valor_recibido_cop": 1_134_567, "ref_externa": "T-2", "levantar_estado": True})
    assert r.json()["estado_cuenta"]["movido"] is True
    assert _estado()[:2] == ("activo", "sistema:cobranza")


def test_el_correo_despues_de_un_abono_dice_lo_abonado_y_lo_que_falta(client, escena, correos, prendida):
    hoy = hoy_en_colombia()
    _suscribir(client, escena.operadora)
    f = _emitir(client, escena.operadora, hoy - timedelta(days=1))
    r = client.post(f"/api/plataforma/facturas/{f['id']}/pagos", headers=escena.operadora,
                    json={"valor_recibido_cop": 1_000_000, "ref_externa": "TRX-PARCIAL"})
    assert r.status_code == 200, r.text
    correos.enviados.clear()

    _correr(hoy + timedelta(days=8))
    (c,) = _a_la_duena(correos)
    assert "Abonado" in c.html and "$ 1.000.000" in c.html
    assert "Falta por pagar" in c.html and "$ 234.567" in c.html
    assert "Neto a pagar" not in c.html


def test_un_mes_se_cobra_una_sola_vez(client, escena):
    """«2026-11», «2026-11..2026-12» y «2026-11..2026-11» entraban las tres.
    Ahora la que cruza un mes de otra viva da 409, y «X..X» se guarda «X»."""
    op = escena.operadora
    _suscribir(client, op, modo="manual")

    def emitir(periodo, numero):
        return client.post("/api/plataforma/clientes/acme/facturas", headers=op,
                           json={"periodo": periodo, "numero": numero})

    noviembre = emitir("2026-11", "CC-1")
    assert noviembre.status_code == 200, noviembre.text
    for i, periodo in enumerate(("2026-11..2026-12", "2026-11..2026-11", "2026-10..2027-01")):
        r = emitir(periodo, f"CC-X{i}")
        assert r.status_code == 409, (periodo, r.text)
        assert "CC-1" in r.json()["detail"]
    r = emitir("2026-12..2027-01", "CC-2")
    assert r.status_code == 200, r.text
    assert r.json()["total_cop"] == 2 * 1_234_567
    assert emitir("2027-01", "CC-3").status_code == 409

    r = client.post(f"/api/plataforma/facturas/{noviembre.json()['id']}/anular", headers=op,
                    json={"motivo": "salió mal"})
    assert r.status_code == 200, r.text
    r = emitir("2026-11..2026-11", "CC-4")
    assert r.status_code == 200, r.text
    assert r.json()["periodo"] == "2026-11"


def test_la_plata_aguanta_mas_de_dos_mil_millones_y_lo_calculado_tiene_tope(client, escena):
    """En Postgres ``Integer`` es de 4 bytes: 24 meses de 50 sedes a 2 millones
    (2.400 millones) reventaban con un 500. Las columnas de plata son
    ``BigInteger``, y lo que se calcula pasa por el mismo tope que lo escrito."""
    from sqlalchemy import BigInteger

    from app.database import Base

    columnas = {
        "suscripciones": ("valor_cop",),
        "facturas_cobro": ("subtotal_cop", "iva_cop", "total_cop", "retenciones_estimadas_cop", "neto_esperado_cop"),
        "pagos_cobro": ("valor_recibido_cop", "retefuente_cop", "reteica_cop", "reteiva_cop"),
    }
    for tabla, nombres in columnas.items():
        for nombre in nombres:
            assert isinstance(Base.metadata.tables[tabla].c[nombre].type, BigInteger), (tabla, nombre)

    op = escena.operadora
    _suscribir(client, op, modo="manual", valor_cop=2_000_000, unidad="sede_mes", cantidad=50)
    r = client.post("/api/plataforma/clientes/acme/facturas", headers=op,
                    json={"periodo": "2026-11..2028-10", "numero": "CC-GRANDE"})
    assert r.status_code == 200, r.text
    assert r.json()["total_cop"] == 2_400_000_000
    r = client.post("/api/plataforma/clientes/acme/facturas", headers=op,
                    json={"periodo": "2028-11", "numero": "CC-ESCRITA", "subtotal_cop": 3_000_000_000})
    assert r.status_code == 200, r.text

    _suscribir(client, op, modo="manual", valor_cop=1_000_000_000, unidad="sede_mes", cantidad=11)
    r = client.post("/api/plataforma/clientes/acme/facturas", headers=op,
                    json={"periodo": "2028-12", "numero": "CC-TOPE"})
    assert r.status_code == 422, r.text
    assert "tope" in r.json()["detail"]


def test_solo_lectura_es_a_los_30_dias_o_mas_nunca_menos(client, escena):
    """La dueña decidió 30 días. Se puede dar más aire, no menos."""
    for dia, codigo in ((1, 422), (29, 422), (30, 200), (45, 200), (365, 200), (366, 422)):
        r = client.put("/api/plataforma/clientes/acme/suscripcion", headers=escena.operadora,
                       json={"modo": "manual", "valor_cop": 1_000_000, "dia_solo_lectura": dia})
        assert r.status_code == codigo, (dia, r.text)


# ════════════════════════════════════════════════════════════════════════════
# Galerías y los demás exentos
# ════════════════════════════════════════════════════════════════════════════

def test_a_galerias_no_la_mueve_nada_del_sistema_aunque_tenga_suscripcion_manual(client, escena):
    """Con una suscripción manual para ver sus cuentas de cobro, Galerías sale
    en la cartera con lo que debe, pero sin «correspondería», y un pago con
    «levantar» no le toca el estado: lo puso la operadora y ahí se queda."""
    from app.services.cobranza import ACTOR_SISTEMA, EL_QUE_CORRESPONDE, mover_estado

    op = escena.operadora
    r = client.put("/api/plataforma/clientes/galerias/suscripcion", headers=op,
                   json={"modo": "manual", "valor_cop": 1_000_000})
    assert r.status_code == 200, r.text
    f = _emitir(client, op, hoy_en_colombia() - timedelta(days=45), slug="galerias", numero="G-1", periodo="2026-08")
    galerias = {c["slug"]: c for c in client.get("/api/plataforma/cobros", headers=op).json()["clientes"]}["galerias"]
    assert galerias["saldo_pendiente_cop"] == 1_000_000
    assert galerias["estado_correspondiente"] is None

    _patch(client, op, "solo_lectura", "Lo decidió RECABRA", slug="galerias")
    r = client.post(f"/api/plataforma/facturas/{f['id']}/pagos", headers=op,
                    json={"valor_recibido_cop": 1_000_000, "ref_externa": "T", "levantar_estado": True})
    assert r.status_code == 200, r.text
    assert r.json()["estado_cuenta"]["razon"] == "exento"
    assert _estado("galerias")[:2] == ("solo_lectura", OPERADORA)
    assert mover_estado("galerias", EL_QUE_CORRESPONDE, None, ACTOR_SISTEMA)["razon"] == "exento"


def test_la_escalera_no_toca_la_base_principal_aunque_alguien_le_cargue_una_automatica(
    client, escena, correos, prendida,
):
    """El PUT ya le niega el modo automático; la escalera lo vuelve a mirar. Una
    fila automática escrita a mano para Galerías no la mueve ni le escribe."""
    from app.models.cobro import FacturaCobro, Suscripcion
    from app.models.plataforma import EstadoCliente

    reg = _registro()
    try:
        sus = Suscripcion(cliente_slug="galerias", modo="automatico", valor_cop=1_000_000,
                          contrato_ref="a mano", creado_por="x", actualizado_por="x")
        reg.add(sus)
        reg.flush()
        vence = hoy_en_colombia() - timedelta(days=60)
        reg.add(FacturaCobro(
            suscripcion_id=sus.id, cliente_slug="galerias", cliente_nombre="Galerías", periodo="2026-08",
            numero="G-1", emitida_el=vence - timedelta(days=30), vence_el=vence, subtotal_cop=1_000_000,
            total_cop=1_000_000, neto_esperado_cop=1_000_000, creado_por="x", actualizado_por="x",
        ))
        reg.commit()
    finally:
        reg.close()

    plan = _correr()
    assert [p.slug for p in plan.pasos] == []
    assert _filas(EstadoCliente, EstadoCliente.slug == "galerias") == []
    assert correos.enviados == []


# ════════════════════════════════════════════════════════════════════════════
# Anular, disputar o prorrogar se nota al toque (escalera prendida)
# ════════════════════════════════════════════════════════════════════════════

def test_anular_disputar_o_prorrogar_vuelve_a_mirar_al_cliente_al_toque(client, escena, correos, prendida):
    """La escalera dejó la cuenta en sólo lectura. Anular la cuenta de cobro
    del corte, ponerla en disputa o cargar una prórroga la devuelve enseguida
    —antes había que esperar la pasada de las 12 horas, con la dueña cortada—."""
    hoy = hoy_en_colombia()
    op = escena.operadora
    _suscribir(client, op)

    def cortar(numero, periodo):
        f = _emitir(client, op, hoy - timedelta(days=35), numero=numero, periodo=periodo)
        _aviso_formal_hace(f["id"], 11)
        _correr()
        assert _estado()[:2] == ("solo_lectura", "sistema:cobranza")
        return f

    def estado_para_la_duena():
        return client.get("/api/auth/estado-cuenta", headers=escena.duena).json()["estado"]

    f = cortar("CC-1", "2026-08")
    r = client.post(f"/api/plataforma/facturas/{f['id']}/anular", headers=op, json={"motivo": "salió mal"})
    assert r.status_code == 200, r.text
    assert _estado()[:2] == ("activo", "sistema:cobranza")
    assert estado_para_la_duena() == "activo"

    g = cortar("CC-2", "2026-09")
    r = client.post(f"/api/plataforma/facturas/{g['id']}/disputa", headers=op, json={"motivo": "la discuten"})
    assert r.status_code == 200, r.text
    assert _estado()[0] == "activo"

    r = client.post(f"/api/plataforma/facturas/{g['id']}/disputa", headers=op,
                    json={"motivo": "se resolvió", "en_disputa": False})
    assert r.status_code == 200, r.text
    assert _estado()[0] == "solo_lectura"
    _suscribir(client, op, prorroga_hasta=(hoy + timedelta(days=20)).isoformat())
    assert _estado()[0] == "gracia"
    assert estado_para_la_duena() == "gracia"


# ════════════════════════════════════════════════════════════════════════════
# Barreras que no tenían prueba (mutaciones que sobrevivían)
# ════════════════════════════════════════════════════════════════════════════

@pytest.mark.parametrize("valor, prendido", [
    ("", False), ("0", False), ("false", False), ("no", False), ("off", False), ("apagado", False),
    ("1", True), ("true", True), ("si", True), ("sí", True), ("SÍ", True), ("on", True),
])
def test_el_interruptor_solo_se_prende_con_un_si_explicito(client, monkeypatch, valor, prendido):
    from app.services.cobranza_automatica import INTERRUPTOR, automatica_prendida

    monkeypatch.setenv(INTERRUPTOR, valor)
    assert automatica_prendida() is prendido


def test_con_el_interruptor_en_cero_la_pasada_no_escribe_ni_manda(client, escena, correos, monkeypatch):
    """render.yaml promete «vacía o en 0, cada pasada sólo ENSAYA»."""
    from app.models.cobro import AvisoCobro, CambioEstadoCuenta
    from app.models.plataforma import EstadoCliente
    from app.services.cobranza_automatica import INTERRUPTOR

    _suscribir(client, escena.operadora)
    _emitir(client, escena.operadora, hoy_en_colombia() - timedelta(days=3))
    for valor in ("0", "false", "no", "off"):
        monkeypatch.setenv(INTERRUPTOR, valor)
        plan = _correr()
        assert plan.ensayo is True and [p.a for p in plan.pasos] == ["gracia"], valor
    assert _filas(EstadoCliente) == [] and _filas(CambioEstadoCuenta) == [] and _filas(AvisoCobro) == []
    assert correos.enviados == []


def test_la_constancia_de_pago_no_sale_para_pagos_viejos(client, escena, correos, monkeypatch):
    """Prender el interruptor no puede mandar un «recibimos su pago» por cada
    cuenta de cobro saldada hace meses: sólo la de un pago registrado en los
    últimos 10 días."""
    from app.models.cobro import PagoCobro
    from app.services.cobranza_automatica import INTERRUPTOR

    monkeypatch.delenv(INTERRUPTOR, raising=False)
    op = escena.operadora
    _suscribir(client, op)
    vieja = _emitir(client, op, hoy_en_colombia() + timedelta(days=5), numero="CC-VIEJA", periodo="2026-10")
    nueva = _emitir(client, op, hoy_en_colombia() + timedelta(days=5), numero="CC-NUEVA", periodo="2026-11")
    for f in (vieja, nueva):
        r = client.post(f"/api/plataforma/facturas/{f['id']}/pagos", headers=op,
                        json={"valor_recibido_cop": 1_234_567, "ref_externa": f"T-{f['id']}"})
        assert r.status_code == 200, r.text
    reg = _registro()
    try:
        ahora = datetime.now(timezone.utc)
        for f, dias in ((vieja, 11), (nueva, 9)):
            reg.query(PagoCobro).filter(PagoCobro.factura_id == f["id"]).update(
                {"creado_en": ahora - timedelta(days=dias)})
        reg.commit()
    finally:
        reg.close()

    monkeypatch.setenv(INTERRUPTOR, "1")
    _correr()
    asuntos = [c.asunto for c in _a_la_duena(correos)]
    assert any("recibimos el pago" in a and "CC-NUEVA" in a for a in asuntos), asuntos
    assert not any("CC-VIEJA" in a for a in asuntos), asuntos


def test_con_otra_fecha_solo_se_ensaya_tambien_hacia_atras(client, escena, correos, prendida):
    """Aplicar con el reloj atrasado levantaría estados y mandaría avisos
    viejos: ni la consola ni la pasada lo aceptan, y no se escribe nada."""
    from app.models.cobro import AvisoCobro
    from app.models.plataforma import EstadoCliente
    from app.services.cobranza_automatica import correr

    _suscribir(client, escena.operadora)
    _emitir(client, escena.operadora, hoy_en_colombia() - timedelta(days=2))
    ayer = hoy_en_colombia() - timedelta(days=1)
    r = client.post(f"/api/plataforma/cobranza/correr?ensayo=0&fecha={ayer.isoformat()}", headers=escena.operadora)
    assert r.status_code == 422, r.text
    with pytest.raises(ValueError):
        correr(hoy=ayer, ensayo=False)
    assert _filas(EstadoCliente, EstadoCliente.slug == "acme") == [] and _filas(AvisoCobro) == []
    assert correos.enviados == []


def test_el_reloj_que_vuelve_atras_no_repite_un_aviso_anterior(client, escena, correos, prendida):
    """Una vez salido «lleva 8 días vencida», una pasada con el reloj del
    servidor corrido para atrás no manda «está vencida»: nunca un hito anterior
    a uno que ya salió."""
    _suscribir(client, escena.operadora)
    vence = hoy_en_colombia() + timedelta(days=2)
    _emitir(client, escena.operadora, vence)
    _correr(vence + timedelta(days=8))
    _correr(vence + timedelta(days=3))
    assert [c.asunto.split(": ", 1)[1] for c in _a_la_duena(correos)] == ["la cuenta de cobro CC-001 lleva 8 días vencida"]


def test_las_exenciones_para_ponerse_al_dia_tienen_frontera_en_el_corte_mismo(client, escena):
    """La frontera de segmento, probada en ``_aplicar_estado`` y no sólo en
    ``_path_bajo``: con la cuenta suspendida, un GET a una ruta que se PARECE a
    una exenta da 402."""
    from app import clientes

    _patch(client, escena.operadora, "suspendido", "Decisión de RECABRA")
    cliente = clientes.buscar("acme")

    def corta(path):
        try:
            clientes._aplicar_estado(cliente, SimpleNamespace(url=SimpleNamespace(path=path), method="GET"))
        except Exception as e:  # noqa: BLE001
            assert getattr(e, "status_code", None) == 402, (path, e)
            return True
        return False

    for exento in ("/api/clientes/mi-suscripcion", "/api/clientes/mi-suscripcion/facturacion",
                   "/api/auth/estado-cuenta"):
        assert not corta(exento), exento
    for impostor in ("/api/clientes/mi-suscripcion-vieja", "/api/clientes/mi-suscripcionX",
                     "/api/auth/estado-cuentas", "/api/auth/estado-cuenta-de-otro"):
        assert corta(impostor), impostor
