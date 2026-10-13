"""La escalera de cobranza, sola (C2): avisos por correo y sólo lectura a los
30 días de vencida la cuenta de cobro, en ensayo por defecto.

Lo que la dueña decidió y estas pruebas fijan (2026-10-13):

* **Cada tramo**: hasta el día del vencimiento, activo; desde el día siguiente,
  gracia; a los ``dia_solo_lectura`` días, sólo lectura. **Nunca suspendido**:
  eso lo decide una persona. La prórroga no deja pasar de gracia.
* **Nunca pisa a una persona al empeorar**, y al ponerse al día sólo vuelve a
  activo lo que puso el sistema.
* **Sin suscripción, o con suscripción manual, nunca se mueve** (Galerías).
* **Con ``COBRANZA_AUTOMATICA`` apagado sólo ensaya**: ni un estado, ni un
  correo, y una línea WARNING en el log con lo que haría.
* **Correos sin duplicar y sólo a las dueñas y al correo de facturación**; el
  servicio que despierta tarde se pone al día con UN correo, no con todos.
* **La dueña del supermercado** lee su suscripción aun suspendida (y nada más
  del negocio); su gente recibe 403 y el estado sin motivo.

El reloj se mueve con ``time_machine`` sólo alrededor de la pasada de la
escalera (los tokens se firman con el reloj de verdad y vencen en horas).

**Todos los ``import app.*`` van adentro de las funciones**: el fixture
``client`` purga ``sys.modules`` entre pruebas (ver ``conftest.py``).
"""
import re
import threading
import time
from contextlib import contextmanager
from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
import time_machine

from app.fechas import hoy as hoy_en_colombia

OPERADORA = "op@plataforma.co"
DUENA = "duena@acme.co"
TESORERIA = "tesoreria@acme.co"
ADMIN = "admin@acme.co"
TRABAJADOR = "piso@acme.co"


class FakeVerificador:
    def __init__(self, mapa: dict):
        self.mapa = mapa

    def verificar(self, id_token):
        return self.mapa.get(id_token)


def _cab(token):
    return {"Authorization": f"Bearer {token}"}


def _usar_verificador(client, uid, email):
    from app.services.firebase_tokens import get_verificador

    claims = SimpleNamespace(uid=uid, email=email, email_verificado=True, proveedor="google.com", nombre=None)
    client.app.dependency_overrides[get_verificador] = lambda: FakeVerificador({uid: claims})


def _fundar(client, uid, email, slug, nombre):
    _usar_verificador(client, uid, email)
    r = client.post("/api/clientes/alta",
                    json={"id_token": uid, "slug": slug, "nombre": nombre, "acepta_politica": True})
    assert r.status_code == 200, r.text
    return _cab(r.json()["token"])


def _invitar_y_entrar(client, duena, email, rol):
    r = client.post("/api/usuarios/invitar", json={"email": email, "rol": rol}, headers=duena)
    assert r.status_code == 200, r.text
    _usar_verificador(client, f"uid-{email}", email)
    r = client.post("/api/auth/oauth", json={"id_token": f"uid-{email}", "acepta_politica": True})
    assert r.status_code == 200, r.text
    return _cab(r.json()["token"])


def _esperar_el_arranque():
    """El arranque de la app corre una pasada de mantenimiento en un hilo, que
    incluye la escalera. Se la espera, para que no se cruce con lo que la
    prueba siembra ni con el interruptor que la prueba prende."""
    import app.main as main

    limite = time.monotonic() + 5
    while main._mantenimiento_en_vuelo is None and time.monotonic() < limite:
        time.sleep(0.02)
    limite = time.monotonic() + 60
    while main._mantenimiento_en_vuelo is not None and not main._mantenimiento_en_vuelo.done():
        assert time.monotonic() < limite, "la pasada de mantenimiento del arranque no terminó"
        time.sleep(0.02)


@pytest.fixture()
def escena(client, monkeypatch):
    """La operadora (dueña de «consola») y «acme», fundado por su dueña, con una
    admin y una trabajadora invitadas. Sin suscripción todavía."""
    operadora = _fundar(client, "uid-op", OPERADORA, "consola", "Consola")
    monkeypatch.setenv("OPERADOR_EMAILS", OPERADORA)
    duena = _fundar(client, "uid-acme", DUENA, "acme", "Acme Supermercados")
    admin = _invitar_y_entrar(client, duena, ADMIN, "admin")
    trabajador = _invitar_y_entrar(client, duena, TRABAJADOR, "worker")
    _esperar_el_arranque()
    return SimpleNamespace(operadora=operadora, duena=duena, admin=admin, trabajador=trabajador)


@pytest.fixture()
def correos(monkeypatch):
    """El cartero falso: anota cada envío y contesta que salió."""
    from app.services import mailer

    enviados = []
    estado = {"ok": True}

    def falso(destinatarios, asunto, html):
        enviados.append(SimpleNamespace(para=list(destinatarios), asunto=asunto, html=html))
        return estado["ok"]

    monkeypatch.setattr(mailer, "send_mail_to", falso)
    return SimpleNamespace(enviados=enviados, estado=estado)


@pytest.fixture()
def prendida(monkeypatch):
    from app.services.cobranza_automatica import INTERRUPTOR

    monkeypatch.setenv(INTERRUPTOR, "1")


SUSCRIPCION = {
    "modo": "automatico", "contrato_ref": "Contrato firmado 2026-10-01",
    "valor_cop": 1_234_567, "unidad": "supermercado_mes", "cantidad": 1,
    "periodicidad_meses": 1, "plazo_pago_dias": 30, "dia_solo_lectura": 30,
    "razon_social": "Acme S.A.S.", "nit": "900123456-7", "correo_facturacion": TESORERIA,
    "municipio": "Cali", "retefuente_pct": 0, "reteica_pct": 0, "reteiva_pct": 0,
}


def _suscribir(client, cab, slug="acme", **cambios):
    r = client.put(f"/api/plataforma/clientes/{slug}/suscripcion", json={**SUSCRIPCION, **cambios}, headers=cab)
    assert r.status_code == 200, r.text
    return r.json()


def _emitir(client, cab, vence: date, numero="CC-001", periodo="2026-10", slug="acme"):
    r = client.post(f"/api/plataforma/clientes/{slug}/facturas", headers=cab, json={
        "periodo": periodo, "numero": numero,
        "emitida_el": (min(vence, hoy_en_colombia()) - timedelta(days=30)).isoformat(),
        "vence_el": vence.isoformat(),
    })
    assert r.status_code == 200, r.text
    return r.json()


def _patch(client, cab, estado, motivo, slug="acme"):
    r = client.patch(f"/api/plataforma/clientes/{slug}", json={"estado": estado, "motivo": motivo}, headers=cab)
    assert r.status_code == 200, r.text


@contextmanager
def _el_dia(d: date, hora_utc: int = 17):
    """Mediodía de Colombia de ``d`` (17:00 UTC), con el reloj quieto."""
    with time_machine.travel(datetime(d.year, d.month, d.day, hora_utc, 0, tzinfo=timezone.utc), tick=False):
        assert hoy_en_colombia() == d
        yield


def _correr(d: date | None = None, **kw):
    from app.services.cobranza_automatica import correr

    if d is None:
        return correr(**kw)
    with _el_dia(d):
        return correr(**kw)


def _estado(slug="acme"):
    from app.clientes import sesion_registro
    from app.models.plataforma import EstadoCliente

    reg = sesion_registro()
    try:
        fila = reg.query(EstadoCliente).filter(EstadoCliente.slug == slug).first()
        return (fila.estado, fila.cambiado_por, fila.motivo) if fila else ("activo", None, None)
    finally:
        reg.close()


def _filas(modelo, *condiciones):
    from app.clientes import sesion_registro

    reg = sesion_registro()
    try:
        return reg.query(modelo).filter(*condiciones).all()
    finally:
        reg.close()


def _hitos(correos):
    return [re.search(r":\s(.*)$", c.asunto).group(1) for c in correos.enviados]


# ════════════════════════════════════════════════════════════════════════════
# Los tramos
# ════════════════════════════════════════════════════════════════════════════

def test_cada_tramo_de_la_escalera_y_nunca_suspendido(client, escena, correos, prendida):
    """Activo hasta el día del vencimiento, gracia desde el siguiente, sólo
    lectura a los 30 días, y ahí se queda: 100 días después sigue en sólo
    lectura, nunca suspendido. Un correo por tramo, y los motivos sin montos."""
    from app.models.cobro import AvisoCobro

    _suscribir(client, escena.operadora)
    vence = hoy_en_colombia() + timedelta(days=10)
    f = _emitir(client, escena.operadora, vence)

    esperado = [
        (-6, "activo", None),
        (-5, "activo", "por_vencer"),
        (0, "activo", None),             # el día que vence: todavía a tiempo, y por_vencer ya salió
        (1, "gracia", "vencida"),
        (7, "gracia", None),
        (8, "gracia", "mas_7"),
        (19, "gracia", None),
        (20, "gracia", "aviso_solo_lectura"),
        (29, "gracia", None),
        (30, "solo_lectura", "solo_lectura"),
        (100, "solo_lectura", None),
    ]
    for d, estado, hito in esperado:
        antes = len(correos.enviados)
        plan = _correr(vence + timedelta(days=d))
        assert plan.ensayo is False
        assert _estado()[0] == estado, (d, _estado())
        nuevos = [c for _p, c in plan.correos if c.enviado]
        assert [c.hito for c in nuevos] == ([hito] if hito else []), (d, [c.hito for c in nuevos])
        assert len(correos.enviados) == antes + (1 if hito else 0), d

    estado, por, motivo = _estado()
    assert por == "sistema:cobranza"
    assert "$" not in motivo and "1.234.567" not in motivo and "1234567" not in motivo
    assert {a.hito for a in _filas(AvisoCobro, AvisoCobro.factura_id == f["id"])} == {
        "por_vencer", "vencida", "mas_7", "aviso_solo_lectura", "solo_lectura",
    }
    # El correo, que va a la dueña y a tesorería, sí lleva la plata.
    assert "1.234.567" in correos.enviados[-1].html


def test_el_dia_del_vencimiento_todavia_es_activo_hasta_la_medianoche_de_colombia(client, escena, prendida, correos):
    """Las 11:30 p. m. del día del vencimiento en Colombia ya son el día
    siguiente en el servidor (UTC): la escalera pregunta la fecha de Colombia."""
    _suscribir(client, escena.operadora)
    vence = hoy_en_colombia() + timedelta(days=3)
    _emitir(client, escena.operadora, vence)
    from app.services.cobranza_automatica import correr

    manana = vence + timedelta(days=1)
    with time_machine.travel(datetime(manana.year, manana.month, manana.day, 4, 30, tzinfo=timezone.utc), tick=False):
        assert hoy_en_colombia() == vence
        correr()
    assert _estado()[0] == "activo"
    with time_machine.travel(datetime(manana.year, manana.month, manana.day, 5, 30, tzinfo=timezone.utc), tick=False):
        correr()
    assert _estado()[0] == "gracia"


def test_el_servicio_que_despierta_20_dias_tarde_se_pone_al_dia_con_un_correo(client, escena, correos, prendida):
    """Render apagó el servicio desde antes de que venciera: la primera pasada,
    20 días después, deja la cuenta en gracia y manda UN correo —el que
    corresponde hoy—, no los tres atrasados. La segunda pasada del mismo día no
    manda nada; la del día 30 sí, el de sólo lectura."""
    _suscribir(client, escena.operadora)
    vence = hoy_en_colombia() + timedelta(days=2)
    _emitir(client, escena.operadora, vence)

    _correr(vence + timedelta(days=20))
    assert _estado()[0] == "gracia"
    assert len(correos.enviados) == 1
    assert "pasa a sólo lectura" in correos.enviados[0].asunto

    _correr(vence + timedelta(days=20))
    _correr(vence + timedelta(days=25))
    assert len(correos.enviados) == 1

    _correr(vence + timedelta(days=45))
    assert _estado()[0] == "solo_lectura"
    assert len(correos.enviados) == 2
    assert "está en sólo lectura" in correos.enviados[1].asunto


def test_la_prorroga_no_deja_pasar_de_gracia_y_corre_el_aviso(client, escena, correos, prendida):
    vence = hoy_en_colombia() + timedelta(days=2)
    _suscribir(client, escena.operadora, prorroga_hasta=(vence + timedelta(days=45)).isoformat())
    _emitir(client, escena.operadora, vence)

    _correr(vence + timedelta(days=31))
    assert _estado()[0] == "gracia"
    assert not any("sólo lectura" in c.asunto for c in correos.enviados)

    _correr(vence + timedelta(days=36))  # 10 días antes del 46, el día siguiente a la prórroga
    assert "desde el" in correos.enviados[-1].asunto

    _correr(vence + timedelta(days=45))
    assert _estado()[0] == "gracia"
    _correr(vence + timedelta(days=46))
    assert _estado()[0] == "solo_lectura"


def test_el_estado_que_puso_una_persona_no_se_toca_ni_para_arriba_ni_para_abajo(client, escena, correos, prendida):
    """La operadora le dio aire (gracia a mano): a los 30 días la escalera no la
    pasa a sólo lectura ni avisa que va a pasar. Si la suspende a mano, un
    pago no la levanta sola: al quedar al día, la escalera sólo devuelve a
    activo lo que puso ella misma."""
    _suscribir(client, escena.operadora)
    vence = hoy_en_colombia() - timedelta(days=5)
    f = _emitir(client, escena.operadora, vence)

    _patch(client, escena.operadora, "gracia", "Lo hablé con la dueña: paga el 30")
    _correr(vence + timedelta(days=3))
    (vencida,) = correos.enviados
    assert "está vencida" in vencida.asunto
    assert "sólo lectura" not in vencida.html  # no anuncia lo que la escalera no va a hacer
    _correr(vence + timedelta(days=20))  # el aviso formal tampoco
    _correr(vence + timedelta(days=40))
    assert _estado()[:2] == ("gracia", OPERADORA)
    assert len(correos.enviados) == 1

    _patch(client, escena.operadora, "suspendido", "Suspendida por decisión de RECABRA")
    _correr()
    assert _estado()[:2] == ("suspendido", OPERADORA)

    r = client.post(f"/api/plataforma/facturas/{f['id']}/pagos", headers=escena.operadora,
                    json={"valor_recibido_cop": 1_234_567, "ref_externa": "TRX-9"})
    assert r.status_code == 200, r.text
    _correr()
    assert _estado()[:2] == ("suspendido", OPERADORA)


def test_un_pago_devuelve_a_activo_lo_que_puso_el_sistema_y_manda_la_constancia(client, escena, correos, prendida):
    """La escalera la dejó en sólo lectura. La operadora registra el pago SIN
    marcar «levantar»: con la escalera prendida, la de ESE cliente corre apenas
    sale la respuesta, la cuenta vuelve a activo firmada por el sistema y sale
    la constancia del pago, una sola vez."""
    from app.models.cobro import CambioEstadoCuenta

    _suscribir(client, escena.operadora)
    f = _emitir(client, escena.operadora, hoy_en_colombia() - timedelta(days=35))
    _correr()
    assert _estado()[:2] == ("solo_lectura", "sistema:cobranza")
    assert client.get("/api/auth/estado-cuenta", headers=escena.trabajador).json()["estado"] == "solo_lectura"

    r = client.post(f"/api/plataforma/facturas/{f['id']}/pagos", headers=escena.operadora,
                    json={"valor_recibido_cop": 1_234_567, "ref_externa": "TRX-1"})
    assert r.status_code == 200, r.text
    assert r.json()["estado_cuenta"] is None  # el pago no lo tocó: fue la escalera

    assert _estado()[:2] == ("activo", "sistema:cobranza")
    assert client.get("/api/auth/estado-cuenta", headers=escena.trabajador).json()["estado"] == "activo"
    assert "recibimos el pago" in correos.enviados[-1].asunto
    _correr()
    assert sum("recibimos el pago" in c.asunto for c in correos.enviados) == 1

    cambios = [(c.de, c.a, c.actor) for c in _filas(CambioEstadoCuenta, CambioEstadoCuenta.cliente_slug == "acme")]
    assert cambios == [("activo", "solo_lectura", "sistema:cobranza"), ("solo_lectura", "activo", "sistema:cobranza")]


def test_sin_suscripcion_o_con_suscripcion_manual_nunca_se_mueve(client, escena, correos, prendida):
    """Galerías (sin suscripción) y un cliente manual con una cuenta de cobro
    vencida hace 90 días: la escalera no los mira. Ni estado, ni historial, ni
    correos. Uno archivado, tampoco."""
    from app.models.cobro import AvisoCobro, CambioEstadoCuenta
    from app.models.plataforma import EstadoCliente

    _suscribir(client, escena.operadora, modo="manual")
    _emitir(client, escena.operadora, hoy_en_colombia() - timedelta(days=90))
    plan = _correr()
    assert plan.pasos == []
    assert _filas(EstadoCliente) == [] and _filas(CambioEstadoCuenta) == [] and _filas(AvisoCobro) == []
    assert correos.enviados == []

    # Automática, pero archivada: tampoco.
    _suscribir(client, escena.operadora)
    r = client.post("/api/plataforma/clientes/acme/archivar", json={"motivo": "pausa"}, headers=escena.operadora)
    assert r.status_code == 200, r.text
    assert _correr().pasos == []
    assert _filas(EstadoCliente, EstadoCliente.slug == "acme") == []


def test_el_ensayo_no_escribe_ni_manda_y_dice_lo_que_haria(client, escena, correos, monkeypatch):
    """Con el interruptor apagado —el valor por defecto— la pasada calcula con
    el mismo código y no escribe un estado ni manda un correo."""
    from app.models.cobro import AvisoCobro, CambioEstadoCuenta
    from app.models.plataforma import EstadoCliente
    from app.services.cobranza_automatica import INTERRUPTOR

    monkeypatch.delenv(INTERRUPTOR, raising=False)
    _suscribir(client, escena.operadora)
    _emitir(client, escena.operadora, hoy_en_colombia() - timedelta(days=3))

    plan = _correr()
    assert plan.ensayo is True
    (paso,) = plan.pasos
    assert (paso.de, paso.a, paso.movido) == ("activo", "gracia", True)
    assert [c.hito for c in paso.correos] == ["vencida"] and paso.correos[0].destinatarios == 2
    resumen = plan.resumen()
    assert "ENSAYO" in resumen and "1 cambio: acme activo→gracia" in resumen and "vencida" in resumen

    assert _filas(EstadoCliente) == [] and _filas(CambioEstadoCuenta) == [] and _filas(AvisoCobro) == []
    assert correos.enviados == []
    with pytest.raises(ValueError):
        _correr(ensayo=False, hoy=hoy_en_colombia() + timedelta(days=1))


def test_la_linea_del_ensayo_sale_siempre_en_el_log_tambien_con_cero(client, escena, capsys, monkeypatch):
    """Como con las fotos vencidas: WARNING (un INFO no llega al log de Render)
    y SIEMPRE, también con «0 cambios»."""
    import logging

    from app.main import _run_lease_maintenance
    from app.services.cobranza_automatica import INTERRUPTOR

    monkeypatch.delenv(INTERRUPTOR, raising=False)
    raiz = logging.getLogger()
    handler = logging.StreamHandler()
    raiz.addHandler(handler)
    try:
        capsys.readouterr()
        _run_lease_maintenance()
        vacio = capsys.readouterr().err
        _suscribir(client, escena.operadora)
        _emitir(client, escena.operadora, hoy_en_colombia() - timedelta(days=3))
        _run_lease_maintenance()
        con_algo = capsys.readouterr().err
    finally:
        raiz.removeHandler(handler)
    lineas = [l for l in vacio.splitlines() if "Cobranza automática" in l]
    assert len(lineas) == 1, vacio
    assert "ENSAYO" in lineas[0] and "0 cambios" in lineas[0] and INTERRUPTOR in lineas[0]
    assert "1 cambio: acme activo→gracia" in con_algo
    assert "1.234.567" not in con_algo and TESORERIA not in con_algo


def test_los_correos_van_solo_a_las_duenas_y_a_facturacion_y_no_se_duplican(client, escena, correos, prendida):
    _suscribir(client, escena.operadora)
    _emitir(client, escena.operadora, hoy_en_colombia() - timedelta(days=2))
    _correr()
    _correr()
    assert len(correos.enviados) == 1
    assert sorted(correos.enviados[0].para) == sorted([DUENA, TESORERIA])
    assert ADMIN not in correos.enviados[0].para and TRABAJADOR not in correos.enviados[0].para


def test_dos_pasadas_a_la_vez_mandan_un_solo_correo_y_no_se_pisan(client, escena, correos, prendida, monkeypatch):
    """La del arranque y la que dispara un pago pueden cruzarse. Las dos leen
    «sin fila de estado» antes de que ninguna escriba (una barrera lo fuerza):
    la segunda choca con la llave al crear la fila, vuelve a leer y no hace
    nada. Y las dos leen «ningún aviso mandado» antes de que ninguna reserve
    (otra barrera): el correo sale una sola vez porque la reserva del hito va
    antes del envío, y la segunda choca con el UNIQUE."""
    from app.models.cobro import CambioEstadoCuenta
    from app.services import cobranza, cobranza_automatica, mailer

    _suscribir(client, escena.operadora)
    _emitir(client, escena.operadora, hoy_en_colombia() - timedelta(days=2))

    barrera = threading.Barrier(2)
    ya_esperaron = set()
    original = cobranza.estado_objetivo

    def a_la_par(*args, **kw):
        if threading.get_ident() not in ya_esperaron:
            ya_esperaron.add(threading.get_ident())
            barrera.wait(10)
        return original(*args, **kw)

    monkeypatch.setattr(cobranza, "estado_objetivo", a_la_par)
    barrera_avisos = threading.Barrier(2)
    leer_destinatarios = cobranza_automatica.destinatarios

    def avisos_a_la_par(*args, **kw):
        barrera_avisos.wait(10)  # las dos ya leyeron los avisos mandados
        return leer_destinatarios(*args, **kw)

    monkeypatch.setattr(cobranza_automatica, "destinatarios", avisos_a_la_par)
    lento = []

    def despacio(para, asunto, html):
        time.sleep(0.3)
        lento.append(asunto)
        return True

    monkeypatch.setattr(mailer, "send_mail_to", despacio)
    planes = []
    hilos = [threading.Thread(target=lambda: planes.append(_correr())) for _ in range(2)]
    for h in hilos:
        h.start()
    for h in hilos:
        h.join(30)
    assert len(planes) == 2 and all(p.errores == [] for p in planes), [p.errores for p in planes]
    assert len(lento) == 1, lento
    assert [(c.de, c.a) for c in _filas(CambioEstadoCuenta)] == [("activo", "gracia")]
    assert sum(1 for p in planes for paso in p.pasos if paso.movido) == 1


def test_un_correo_que_no_sale_se_reintenta_en_la_pasada_siguiente(client, escena, correos, prendida):
    from app.models.cobro import AvisoCobro

    _suscribir(client, escena.operadora)
    _emitir(client, escena.operadora, hoy_en_colombia() - timedelta(days=2))
    correos.estado["ok"] = False
    plan = _correr()
    assert [c.enviado for _p, c in plan.correos] == [False]
    assert _filas(AvisoCobro) == []
    correos.estado["ok"] = True
    _correr()
    assert len(correos.enviados) == 2 and len(_filas(AvisoCobro)) == 1


def test_un_cliente_sin_a_quien_escribir_no_rompe_la_pasada(client, escena, correos, prendida):
    """Sin correo de facturación y sin dueña activa no hay a quién avisar: se
    dice en el plan y el estado se mueve igual."""
    from app.clientes import sesion_registro
    from app.models.identidad import Membresia

    _suscribir(client, escena.operadora, correo_facturacion=None)
    _emitir(client, escena.operadora, hoy_en_colombia() - timedelta(days=2))
    reg = sesion_registro()
    try:
        reg.query(Membresia).filter(Membresia.cliente_slug == "acme", Membresia.rol == "owner").update({"activo": False})
        reg.commit()
    finally:
        reg.close()
    plan = _correr()
    assert _estado()[0] == "gracia"
    assert [(c.enviado, c.nota) for _p, c in plan.correos] == [(False, "sin_destinatarios")]
    assert correos.enviados == [] and "sin a quién escribir: acme" in plan.resumen()


def test_hito_de_atraso_es_puro_y_respeta_el_orden(client):
    from app.services.cobranza_automatica import hito_de_atraso

    vence = date(2026, 11, 15)
    sus = SimpleNamespace(dia_solo_lectura=30, prorroga_hasta=None)
    f = SimpleNamespace(estado="emitida", en_disputa=False, vence_el=vence)
    por_dia = {d: hito_de_atraso(sus, f, vence + timedelta(days=d)) for d in range(-7, 40)}
    assert por_dia[-6] is None and por_dia[-5] == "por_vencer" and por_dia[0] == "por_vencer"
    assert por_dia[1] == por_dia[7] == "vencida"
    assert por_dia[8] == por_dia[19] == "mas_7"
    assert por_dia[20] == por_dia[29] == "aviso_solo_lectura"
    assert por_dia[30] == por_dia[39] == "solo_lectura"
    # Con sólo lectura temprano, el aviso formal no llega antes que el de vencida.
    corta = SimpleNamespace(dia_solo_lectura=10, prorroga_hasta=None)
    assert [hito_de_atraso(corta, f, vence + timedelta(days=d)) for d in (1, 9, 10)] == [
        "vencida", "mas_7", "solo_lectura",
    ]
    for otra in (SimpleNamespace(estado="pagada", en_disputa=False, vence_el=vence),
                 SimpleNamespace(estado="emitida", en_disputa=True, vence_el=vence)):
        assert hito_de_atraso(sus, otra, vence + timedelta(days=40)) is None


# ════════════════════════════════════════════════════════════════════════════
# La consola: «Correr cobranza»
# ════════════════════════════════════════════════════════════════════════════

def test_correr_cobranza_desde_la_consola_ensaya_y_sin_interruptor_no_aplica(client, escena, correos, monkeypatch):
    from app.models.plataforma import BitacoraPlataforma, EstadoCliente
    from app.services.cobranza_automatica import INTERRUPTOR

    monkeypatch.delenv(INTERRUPTOR, raising=False)
    _suscribir(client, escena.operadora)
    vence = hoy_en_colombia() + timedelta(days=5)
    _emitir(client, escena.operadora, vence)

    r = client.post("/api/plataforma/cobranza/correr", headers=escena.operadora)
    assert r.status_code == 200, r.text
    assert r.json()["ensayo"] is True and r.json()["interruptor"] is False
    (fila,) = r.json()["clientes"]
    assert (fila["slug"], fila["a"], fila["movido"]) == ("acme", "activo", False)
    assert [c["hito"] for c in fila["correos"]] == ["por_vencer"]

    # «¿Qué pasa el día 31?»: sólo lectura, en ensayo.
    dia = (vence + timedelta(days=31)).isoformat()
    r = client.post(f"/api/plataforma/cobranza/correr?ensayo=1&fecha={dia}", headers=escena.operadora)
    assert r.status_code == 200, r.text
    assert r.json()["clientes"][0]["a"] == "solo_lectura"
    assert "1234567" not in r.text and "1.234.567" not in r.text and TESORERIA not in r.text

    assert client.post("/api/plataforma/cobranza/correr?ensayo=0", headers=escena.operadora).status_code == 409
    for quien in (escena.duena, escena.admin):
        assert client.post("/api/plataforma/cobranza/correr", headers=quien).status_code == 403
    assert _filas(EstadoCliente, EstadoCliente.slug == "acme") == [] and correos.enviados == []
    assert any(b.accion == "cobranza" for b in _filas(BitacoraPlataforma))
    reporte = client.get("/api/clientes/mi-reporte-plataforma", headers=escena.duena)
    assert "cobranza" in {l["accion"] for l in reporte.json()["accesos"]["lineas"]}

    monkeypatch.setenv(INTERRUPTOR, "1")
    r = client.post(f"/api/plataforma/cobranza/correr?ensayo=0&fecha={dia}", headers=escena.operadora)
    assert r.status_code == 422, r.text


# ════════════════════════════════════════════════════════════════════════════
# La dueña del supermercado y su gente
# ════════════════════════════════════════════════════════════════════════════

def test_la_duena_suspendida_lee_su_suscripcion_y_nada_mas_del_negocio(client, escena, monkeypatch):
    monkeypatch.setenv("COBRO_INSTRUCCIONES_TRANSFERENCIA", "Bancolombia ahorros 000-000000-00 a nombre de RECABRA")
    _suscribir(client, escena.operadora, retefuente_pct=3.5)
    _emitir(client, escena.operadora, hoy_en_colombia() - timedelta(days=50))
    _patch(client, escena.operadora, "suspendido", "Suspendida por la cuenta de cobro de octubre")

    r = client.get("/api/clientes/mi-suscripcion", headers=escena.duena)
    assert r.status_code == 200, r.text
    cuerpo = r.json()
    assert cuerpo["estado"]["estado"] == "suspendido"
    assert cuerpo["estado"]["motivo"] == "Suspendida por la cuenta de cobro de octubre"
    prox = cuerpo["proxima_factura"]
    assert (prox["numero"], prox["total_cop"], prox["retenciones_estimadas_cop"], prox["neto_esperado_cop"]) == (
        "CC-001", 1_234_567, 43_210, 1_191_357,
    )
    assert prox["vencida"] is True and prox["dias_atraso"] == 50
    assert cuerpo["instrucciones_transferencia"].startswith("Bancolombia")
    assert [c["a"] for c in cuerpo["cambios"]] == ["suspendido"] and cuerpo["cambios"][0]["por"] == "RECABRA"
    # Nada de lo que es de RECABRA: ni el correo de la operadora ni el contrato.
    assert OPERADORA not in r.text and "Contrato firmado" not in r.text

    r = client.put("/api/clientes/mi-suscripcion/facturacion", headers=escena.duena,
                   json={"razon_social": "Acme Hnos S.A.S.", "nit": "900123456-7",
                         "correo_facturacion": "pagos@acme.co", "municipio": "Palmira"})
    assert r.status_code == 200, r.text
    assert client.get("/api/clientes/mi-suscripcion", headers=escena.duena).json()["suscripcion"][
        "correo_facturacion"] == "pagos@acme.co"
    r = client.put("/api/clientes/mi-suscripcion/facturacion", headers=escena.duena,
                   json={"correo_facturacion": "no es correo"})
    assert r.status_code == 422

    estado = client.get("/api/auth/estado-cuenta", headers=escena.duena).json()
    assert estado == {"estado": "suspendido", "motivo": "Suspendida por la cuenta de cobro de octubre", "duena": True}

    # El negocio, cortado: la exención es quirúrgica.
    for ruta in ("/api/spaces/", "/api/suppliers/", "/api/clientes/mi-copia", "/api/clientes/mi-suscripcionX"):
        assert client.get(ruta, headers=escena.duena).status_code in (402, 404), ruta
    assert client.get("/api/spaces/", headers=escena.duena).status_code == 402


def test_su_gente_no_ve_plata_ni_motivo_y_el_estado_le_llega_igual(client, escena):
    _suscribir(client, escena.operadora)
    _emitir(client, escena.operadora, hoy_en_colombia() - timedelta(days=10))
    for estado in ("activo", "solo_lectura", "suspendido"):
        if estado != "activo":
            _patch(client, escena.operadora, estado, "Cuenta de cobro de octubre impaga")
        for quien in (escena.admin, escena.trabajador):
            r = client.get("/api/clientes/mi-suscripcion", headers=quien)
            assert r.status_code == 403, (estado, r.text)
            assert "1.234.567" not in r.text and "CC-001" not in r.text
            r = client.put("/api/clientes/mi-suscripcion/facturacion", headers=quien,
                           json={"correo_facturacion": "yo@acme.co"})
            assert r.status_code == 403, (estado, r.text)
            r = client.get("/api/auth/estado-cuenta", headers=quien)
            assert r.status_code == 200, (estado, r.text)
            assert r.json() == {"estado": estado, "motivo": None, "duena": False}
    # Sin sesión, nada: ni el estado de nadie.
    assert client.get("/api/auth/estado-cuenta").status_code == 401
    assert client.get("/api/clientes/mi-suscripcion").status_code == 401


def test_sin_suscripcion_la_duena_ve_que_esta_exenta(client, escena):
    r = client.get("/api/clientes/mi-suscripcion", headers=escena.duena)
    assert r.status_code == 200, r.text
    assert r.json()["suscripcion"] is None and r.json()["facturas"] == []
    assert r.json()["instrucciones_transferencia"] is None
    r = client.put("/api/clientes/mi-suscripcion/facturacion", headers=escena.duena,
                   json={"razon_social": "Acme"})
    assert r.status_code == 409


def test_la_exencion_para_ponerse_al_dia_tiene_frontera_de_segmento(client):
    from app.clientes import _EXENTOS_PARA_PONERSE_AL_DIA, _path_bajo

    assert _path_bajo("/api/clientes/mi-suscripcion", _EXENTOS_PARA_PONERSE_AL_DIA)
    assert _path_bajo("/api/clientes/mi-suscripcion/facturacion", _EXENTOS_PARA_PONERSE_AL_DIA)
    assert _path_bajo("/api/auth/estado-cuenta", _EXENTOS_PARA_PONERSE_AL_DIA)
    for impostor in ("/api/clientes/mi-suscripcionX", "/api/clientes/mi-suscripcion-vieja",
                     "/api/auth/estado-cuentas", "/api/clientes/mi-copia"):
        assert not _path_bajo(impostor, _EXENTOS_PARA_PONERSE_AL_DIA), impostor


def test_avisos_cobro_es_del_registro(client):
    from app.database import Base
    from app.services.traspaso import TABLAS_DEL_CLIENTE, TABLAS_DEL_REGISTRO, tablas_sin_clasificar

    assert "avisos_cobro" in Base.metadata.tables
    assert "avisos_cobro" in TABLAS_DEL_REGISTRO and "avisos_cobro" not in TABLAS_DEL_CLIENTE
    assert tablas_sin_clasificar() == set()
