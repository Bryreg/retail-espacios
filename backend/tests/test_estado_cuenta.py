"""El interruptor de estado de cuenta (Fase 2): qué pasa y qué no según el estado.

Lo que se prueba acá es una semántica de DENEGACIÓN, y las semánticas de
denegación se rompen por los bordes, no por el centro. De ahí la forma de este
archivo:

* **La fila ausente es el caso de producción**, no un caso raro: galerias y todo
  cliente que ya existe no tienen fila en ``estados_cliente``. La primera prueba
  del archivo es que sin fila NADA cambia — si esa se cae, el resto no importa.
* **El estado se siembra escribiendo la tabla a mano**, con ``sesion_registro()``
  y ``limpiar_cache_estado()``, y NO por el PATCH del panel del operador. El
  interruptor tiene que quedar probado aunque ese router todavía no exista, y
  además una prueba que dependiera de él estaría probando dos cosas a la vez.
* **``solo_lectura`` se prueba contra ``GET /api/spaces/map``**, que es el
  endpoint donde ``expire_leases()`` ESCRIBE adentro de un GET. Es el caso que
  decide si el corte quedó al pedido HTTP (bien) o a la sesión de base (mal): un
  bloqueo a la sesión dejaría ese GET permitido cayéndose al vencer un contrato.

**Todos los ``import app.*`` van adentro de las funciones**, por lo mismo que
explican ``conftest.py`` y ``test_identidad.py``: el fixture ``client`` purga
``sys.modules`` entre pruebas, y una referencia tomada en la colección de pytest
apuntaría a un módulo que ya no es el que usa la app fresca.
"""
from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace

from conftest import CLAVE_ADMIN, CLAVE_WORKER

SOLO_LECTURA = "Cuenta en solo lectura por pago pendiente."
SUSPENDIDA = "La cuenta de este cliente está suspendida."


# ─── Sembrar estado ────────────────────────────────────────────────────────────

def _sembrar(estado: str, *, slug: str = "galerias", motivo: str = "Factura de marzo impaga"):
    """Deja la fila de ``estados_cliente`` en ese estado y tira el cache.

    Sin ``limpiar_cache_estado()`` la prueba mediría el cache y no el
    interruptor: el login del fixture ``admin`` ya dejó cacheado "activo" por
    sesenta segundos, que es más de lo que dura cualquier prueba.
    """
    from app import plataforma_estado
    from app.clientes import sesion_registro
    from app.models.plataforma import EstadoCliente

    reg = sesion_registro()
    try:
        fila = reg.query(EstadoCliente).filter(EstadoCliente.slug == slug).first()
        if fila is None:
            fila = EstadoCliente(slug=slug, estado=estado, motivo=motivo, cambiado_por="op@recabra.co")
            reg.add(fila)
        else:
            fila.estado = estado
            fila.motivo = motivo
        fila.cambiado_en = datetime.now(timezone.utc)
        reg.commit()
    finally:
        reg.close()

    plataforma_estado.limpiar_cache_estado()


# ─── Helpers de /oauth (mismo patrón que test_identidad.py) ────────────────────

class FakeVerificador:
    def __init__(self, mapa: dict):
        self.mapa = mapa

    def verificar(self, id_token):
        return self.mapa.get(id_token)


def _claims(uid, email, verificado=True, proveedor="google.com", nombre=None):
    return SimpleNamespace(
        uid=uid, email=email, email_verificado=verificado, proveedor=proveedor, nombre=nombre,
    )


def _usar_verificador(client, mapa: dict):
    from app.services.firebase_tokens import get_verificador
    client.app.dependency_overrides[get_verificador] = lambda: FakeVerificador(mapa)


def _cab(token):
    return {"Authorization": f"Bearer {token}"}


def _invitar(client, admin, email, rol="worker"):
    r = client.post("/api/usuarios/invitar", json={"email": email, "rol": rol}, headers=admin)
    assert r.status_code == 200, r.text


def _entrar_por_oauth(client, admin, email, rol="worker", uid=None):
    """Invita y canjea, con el cliente todavía sano. Devuelve la respuesta cruda."""
    _invitar(client, admin, email, rol=rol)
    _usar_verificador(client, {"tok": _claims(uid or f"uid-{email}", email)})
    return client.post("/api/auth/oauth", json={"id_token": "tok"})


def _login_legado(client, password=CLAVE_ADMIN):
    return client.post("/api/auth/login", json={"password": password})


# ════════════════════════════════════════════════════════════════════════════
# Sin fila, y con fila "activo": el sistema de siempre
# ════════════════════════════════════════════════════════════════════════════

def test_sin_fila_en_estados_cliente_todo_sigue_exactamente_igual(client, admin):
    """Cero backfill: el cliente que ya existe no tiene fila y no se entera de nada."""
    assert client.get("/api/spaces/", headers=admin).status_code == 200
    assert client.post("/api/suppliers/", json={"name": "Alpina"}, headers=admin).status_code == 201

    # El cuerpo del login legado queda BYTE A BYTE como antes de la Fase 2:
    # `aviso_cuenta` no aparece ni siquiera en `null`.
    cuerpo = _login_legado(client).json()
    assert set(cuerpo) == {"token", "role", "cliente", "cliente_nombre"}


def test_fila_con_estado_activo_es_lo_mismo_que_no_tener_fila(client, admin):
    """El PATCH del operador deja fila hasta para "activo" — no puede degradar nada."""
    _sembrar("activo", motivo="Se puso al día")

    assert client.get("/api/spaces/", headers=admin).status_code == 200
    assert client.post("/api/suppliers/", json={"name": "Alpina"}, headers=admin).status_code == 201
    assert set(_login_legado(client).json()) == {"token", "role", "cliente", "cliente_nombre"}


# ════════════════════════════════════════════════════════════════════════════
# gracia: nada se corta, pero el aviso viaja
# ════════════════════════════════════════════════════════════════════════════

def test_gracia_no_corta_nada_y_avisa_en_los_dos_logins(client, admin):
    oauth = _entrar_por_oauth(client, admin, "duena@x.co", rol="owner")
    assert oauth.status_code == 200, oauth.text

    _sembrar("gracia", motivo="Vence el 30")

    # Negocio intacto: lee y escribe como cualquier cliente al día.
    assert client.get("/api/spaces/", headers=admin).status_code == 200
    assert client.post("/api/suppliers/", json={"name": "Colanta"}, headers=admin).status_code == 201

    legado = _login_legado(client)
    assert legado.status_code == 200
    # El legado ve el ESTADO (el banner lo necesita) pero no el motivo: es una
    # clave compartida, jamás owner, y la deuda es del owner (hallazgo R-2).
    # Con response_model_exclude_none, el motivo en None ni aparece.
    assert legado.json()["aviso_cuenta"] == {"estado": "gracia"}

    _usar_verificador(client, {"tok": _claims("uid-duena@x.co", "duena@x.co")})
    por_cuenta = client.post("/api/auth/oauth", json={"id_token": "tok"})
    assert por_cuenta.status_code == 200, por_cuenta.text
    assert por_cuenta.json()["aviso_cuenta"] == {"estado": "gracia", "motivo": "Vence el 30"}


# ════════════════════════════════════════════════════════════════════════════
# solo_lectura
# ════════════════════════════════════════════════════════════════════════════

def test_solo_lectura_deja_leer(client, admin):
    _sembrar("solo_lectura")
    assert client.get("/api/spaces/", headers=admin).status_code == 200
    assert client.get("/api/suppliers/", headers=admin).status_code == 200


def test_solo_lectura_no_rompe_el_get_que_escribe_por_dentro(client, admin):
    """El caso que decide si el corte es al PEDIDO o a la SESIÓN.

    ``GET /api/spaces/map`` llama a ``expire_leases()``, que da de baja los
    contratos vencidos y libera el espacio — o sea, ESCRIBE adentro de un GET.
    Con el cliente en ``solo_lectura`` ese GET tiene que seguir contestando 200
    **y seguir escribiendo**: se siembra un contrato vencido antes y se
    comprueba después que quedó dado de baja.
    """
    from app.clientes import buscar, sesion_de
    from app.models.models import Space, SpaceLease, SpaceStatus, Supplier

    db = sesion_de(buscar("galerias"))
    try:
        espacio = db.query(Space).first()
        assert espacio is not None, "el arranque siembra los pasillos de galerias"
        espacio.status = SpaceStatus.occupied
        proveedor = Supplier(name="Vencido S.A.")
        db.add(proveedor)
        db.flush()
        contrato = SpaceLease(
            space_id=espacio.id,
            supplier_id=proveedor.id,
            start_date=date.today() - timedelta(days=60),
            end_date=date.today() - timedelta(days=1),
            monthly_rent=100000.0,
            is_active=True,
        )
        db.add(contrato)
        db.commit()
        contrato_id, espacio_id = contrato.id, espacio.id
    finally:
        db.close()

    _sembrar("solo_lectura")

    assert client.get("/api/spaces/map", headers=admin).status_code == 200

    db = sesion_de(buscar("galerias"))
    try:
        assert db.query(SpaceLease).filter(SpaceLease.id == contrato_id).first().is_active is False
        assert db.query(Space).filter(Space.id == espacio_id).first().status == SpaceStatus.free
    finally:
        db.close()


def test_solo_lectura_corta_las_mutaciones_de_negocio(client, admin):
    _sembrar("solo_lectura")

    r = client.post("/api/suppliers/", json={"name": "Nueva"}, headers=admin)
    assert r.status_code == 402
    assert r.json()["detail"] == SOLO_LECTURA

    r = client.post(
        "/api/spaces/find-or-create",
        json={"code": "FIX-1", "name": "Mueble nuevo", "zone": "Pasillo A"},
        headers=admin,
    )
    assert r.status_code == 402
    assert r.json()["detail"] == SOLO_LECTURA


def test_solo_lectura_deja_pasar_auth_y_usuarios(client, admin):
    """Spec, decisión 3: el owner tiene que poder entrar y administrar para pagar."""
    _sembrar("solo_lectura")

    r = client.post("/api/usuarios/invitar", json={"email": "socia@x.co", "rol": "admin"}, headers=admin)
    assert r.status_code == 200, r.text

    # `PUT /api/auth/passwords` muta, y aun así pasa: cuelga de /api/auth.
    # Va al final porque cambiar la clave de admin cierra las sesiones de admin.
    r = client.put("/api/auth/passwords", json={"admin_password": "otraclave123"}, headers=admin)
    assert r.status_code == 200, r.text


def test_solo_lectura_deja_entrar_por_los_dos_logins_con_aviso(client, admin):
    oauth = _entrar_por_oauth(client, admin, "duena@x.co", rol="owner")
    assert oauth.status_code == 200, oauth.text

    _sembrar("solo_lectura", motivo="Segundo recordatorio")

    legado = _login_legado(client, CLAVE_WORKER)
    assert legado.status_code == 200
    # Estado sí, motivo no — misma regla R-2 que en gracia.
    assert legado.json()["aviso_cuenta"] == {"estado": "solo_lectura"}

    _usar_verificador(client, {"tok": _claims("uid-duena@x.co", "duena@x.co")})
    por_cuenta = client.post("/api/auth/oauth", json={"id_token": "tok"})
    assert por_cuenta.status_code == 200, por_cuenta.text
    assert por_cuenta.json()["aviso_cuenta"] == {"estado": "solo_lectura", "motivo": "Segundo recordatorio"}


# ════════════════════════════════════════════════════════════════════════════
# suspendido
# ════════════════════════════════════════════════════════════════════════════

def test_suspendido_corta_hasta_los_get(client, admin):
    _sembrar("suspendido", motivo="Tres meses sin pagar")

    r = client.get("/api/spaces/", headers=admin)
    assert r.status_code == 402
    assert r.json()["detail"] == SUSPENDIDA

    r = client.post("/api/suppliers/", json={"name": "Nueva"}, headers=admin)
    assert r.status_code == 402
    assert r.json()["detail"] == SUSPENDIDA

    # Ni siquiera el GET que escribe por dentro: en suspendido no hay excepción.
    assert client.get("/api/spaces/map", headers=admin).status_code == 402


def test_suspendido_no_deja_entrar_por_el_login_legado(client):
    _sembrar("suspendido", motivo="Tres meses sin pagar")

    r = _login_legado(client)
    assert r.status_code == 402
    assert r.json()["detail"] == SUSPENDIDA
    # El motivo NO viaja por el legado: es una contraseña compartida, no una
    # persona, y por construcción jamás es owner.
    assert "Tres meses" not in r.text

    assert _login_legado(client, CLAVE_WORKER).status_code == 402


def test_suspendido_con_clave_equivocada_sigue_contestando_401(client):
    """El 402 va DESPUÉS de la contraseña: la pantalla de ingreso no es un oráculo.

    Si contestara 402 antes de comprobar la clave, cualquiera que supiera un
    slug podría averiguar qué supermercados dejaron de pagar — la misma razón
    por la que un cliente inexistente contesta "Contraseña incorrecta".
    """
    _sembrar("suspendido")
    r = client.post("/api/auth/login", json={"password": "no-es-la-clave"})
    assert r.status_code == 401


def test_suspendido_deja_afuera_al_worker_y_adentro_al_owner_con_el_motivo(client, admin):
    _invitar(client, admin, "duena@x.co", rol="owner")
    _invitar(client, admin, "peon@x.co", rol="worker")

    _sembrar("suspendido", motivo="Tres meses sin pagar")

    _usar_verificador(client, {
        "t-owner": _claims("uid-owner", "duena@x.co"),
        "t-worker": _claims("uid-worker", "peon@x.co"),
    })

    peon = client.post("/api/auth/oauth", json={"id_token": "t-worker"})
    assert peon.status_code == 402
    assert peon.json()["detail"] == SUSPENDIDA
    # El motivo es información de la relación comercial: la ve el owner, no su gente.
    assert "Tres meses" not in peon.text

    duena = client.post("/api/auth/oauth", json={"id_token": "t-owner"})
    assert duena.status_code == 200, duena.text
    assert duena.json()["aviso_cuenta"] == {
        "estado": "suspendido", "motivo": "Tres meses sin pagar",
    }


def test_el_owner_que_entro_a_una_cuenta_suspendida_igual_no_opera(client, admin):
    """Entra a ver y a pagar, no a seguir laburando: su token choca con el 402."""
    _invitar(client, admin, "duena@x.co", rol="owner")
    _sembrar("suspendido")
    _usar_verificador(client, {"t": _claims("uid-owner", "duena@x.co")})

    token = client.post("/api/auth/oauth", json={"id_token": "t"}).json()["token"]
    assert client.get("/api/spaces/", headers=_cab(token)).status_code == 402


# ════════════════════════════════════════════════════════════════════════════
# El cache y su invalidación
# ════════════════════════════════════════════════════════════════════════════

def test_invalidar_cache_estado_se_siente_en_el_pedido_siguiente(client, admin):
    """Sin la invalidación, el corte tardaría hasta un minuto en notarse."""
    from app import plataforma_estado

    _sembrar("activo")
    assert client.get("/api/spaces/", headers=admin).status_code == 200  # cachea "activo"

    from app.clientes import sesion_registro
    from app.models.plataforma import EstadoCliente

    reg = sesion_registro()
    try:
        fila = reg.query(EstadoCliente).filter(EstadoCliente.slug == "galerias").first()
        fila.estado = "suspendido"
        fila.motivo = "Cortado a mano"
        reg.commit()
    finally:
        reg.close()

    plataforma_estado.invalidar_cache_estado("galerias")

    r = client.get("/api/spaces/", headers=admin)
    assert r.status_code == 402
    assert r.json()["detail"] == SUSPENDIDA


def test_el_estado_de_un_cliente_no_toca_al_otro(client, admin):
    """El interruptor es por cliente: suspender uno no roza al de al lado."""
    from app.clientes import crear_cliente
    crear_cliente("otromarket", "Otro Market")

    otro = client.post("/api/auth/login", json={"password": CLAVE_ADMIN, "cliente": "otromarket"})
    assert otro.status_code == 200, otro.text
    cab_otro = _cab(otro.json()["token"])

    _sembrar("suspendido", slug="otromarket")

    assert client.get("/api/spaces/", headers=cab_otro).status_code == 402
    assert client.get("/api/spaces/", headers=admin).status_code == 200
