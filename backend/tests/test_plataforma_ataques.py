"""Red team de la Fase 2 — Clientes: tests de ATAQUE, no de funcionalidad.

Sucesor directo de ``tests/test_identidad_ataques.py`` (Fase 1): misma
disciplina, mismo contrato de lectura.

Se atacan tres superficies, que son las tres que la Fase 2 estrena:

1. **La frontera de operador de plataforma** — privilegio NUEVO, definido por
   una variable de entorno y no por una tabla. Se ataca por donde se atacan las
   fronteras definidas por texto: el token que no debería calificar (el legado,
   que no tiene ``sub`` ni ``email``), el correo que casi matchea, la env vacía
   y la escalada horizontal (¿el operador ve datos de negocio de alguien?).
2. **La superficie de denegación** — ``solo_lectura`` y ``suspendido``. Una
   semántica de denegación se rompe por los bordes: el método raro (HEAD,
   OPTIONS), el camino lateral (``?token=`` en la query, el enlace de la
   mercaderista), el endpoint que el builder no probó, y el cache de 60 s.
3. **El alta self-service como superficie de abuso** — slugs hostiles contra un
   ``CREATE DATABASE``, duplicados contra un cliente inactivo, el tope de dos
   fundaciones, el freno por IP y la promesa de "sin cliente a medias".

Tres clases de test acá adentro, igual que en la Fase 1:

* **Defensas que aguantan**: el ataque se ejecuta y falla. Son la evidencia de
  que se probó y la red que avisa si mañana alguien la afloja.
* **Caracterizaciones**: el sistema se comporta como el contrato dice, y ese
  comportamiento tiene una consecuencia que conviene tener escrita (por ejemplo
  que fundar un cliente nuevo esquiva una suspensión). Pasan, y el informe las
  cita.
* **Hallazgos abiertos**, marcados ``xfail(strict=True)``: afirman el
  comportamiento SEGURO, que hoy no se cumple. Con ``strict=True``, el día que
  se tape el agujero el test pasa a XPASS y la suite se pone en rojo — el
  recordatorio de sacarle el marcador. Mientras tanto la suite sigue verde y el
  hallazgo no se pierde.

El identificador (``R-n``) de cada test referencia el informe
``features/clientes/outputs/red-team-privilegio.md``.

**Todos los ``import app.*`` van adentro de las funciones.** El fixture
``client`` de ``conftest.py`` purga ``sys.modules['app.*']`` entre pruebas: una
referencia tomada en la colección de pytest apuntaría a un módulo muerto, y la
clave de ``dependency_overrides`` tiene que ser el objeto VIVO.
"""
import glob
import os
from datetime import datetime, timezone
from types import SimpleNamespace

import jwt
import pytest

from conftest import CLAVE_ADMIN, CLAVE_WORKER

SOLO_LECTURA = "Cuenta en solo lectura por pago pendiente."
SUSPENDIDA = "La cuenta de este cliente está suspendida."
NO_OPERADOR = "Solo para operadores de la plataforma."


# ─── Utilidades ────────────────────────────────────────────────────────────────

class FakeVerificador:
    """Traduce un ``id_token`` de mentira (clave del diccionario) a claims."""

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


def _payload(token):
    """Los claims del JWT propio, sin verificar — es un test, la firma no importa."""
    return jwt.decode(token, options={"verify_signature": False})


def _alta(client, id_token, slug, nombre):
    # `acepta_politica` es obligatorio desde la Fase 3 (consentimiento
    # registrado). Este archivo ataca la Fase 2 (plataforma/alta), no el
    # consentimiento -- se manda siempre en `True` para que las fundaciones de
    # los casos felices sigan llegando a "owner" como antes de esa regla; los
    # casos que esperan 4xx acá abajo fallan todos ANTES del chequeo de
    # `acepta_politica` en `routers/alta.py` (token/correo/nombre/slug/
    # reservado/duplicado van primero), así que este valor no les cambia el
    # resultado.
    return client.post(
        "/api/clientes/alta",
        json={"id_token": id_token, "slug": slug, "nombre": nombre, "acepta_politica": True},
    )


def _fundar(client, uid, email, slug, nombre):
    """Funda un cliente por el alta y devuelve el cuerpo (trae token con ``sub``)."""
    _usar_verificador(client, {uid: _claims(uid, email)})
    r = _alta(client, uid, slug, nombre)
    assert r.status_code == 200, r.text
    return r.json()


def _operador(client, monkeypatch, *, uid="uid-op", email="op@recabra.co",
              slug="operadora", nombre="Operadora"):
    """Una cuenta con ``sub`` cuyo correo está en ``OPERADOR_EMAILS``."""
    cuerpo = _fundar(client, uid, email, slug, nombre)
    monkeypatch.setenv("OPERADOR_EMAILS", email)
    return _cab(cuerpo["token"])


def _sembrar(estado: str, *, slug: str = "galerias", motivo: str = "Factura 0001-4517 impaga"):
    """Escribe ``estados_cliente`` a mano y tira el cache.

    A mano y no por el PATCH del operador a propósito: el interruptor tiene que
    quedar probado sin depender del router que lo mueve, y sin el
    ``limpiar_cache_estado()`` la prueba mediría el cache (60 s, más de lo que
    dura cualquier prueba) en vez del interruptor.
    """
    from app import plataforma_estado
    from app.clientes import sesion_registro
    from app.models.plataforma import EstadoCliente

    reg = sesion_registro()
    try:
        fila = reg.query(EstadoCliente).filter(EstadoCliente.slug == slug).first()
        if fila is None:
            fila = EstadoCliente(slug=slug, estado=estado, motivo=motivo,
                                 cambiado_por="op@recabra.co")
            reg.add(fila)
        else:
            fila.estado, fila.motivo = estado, motivo
        fila.cambiado_en = datetime.now(timezone.utc)
        reg.commit()
    finally:
        reg.close()

    plataforma_estado.limpiar_cache_estado()


def _registro():
    from app.clientes import sesion_registro
    return sesion_registro()


def _conteos():
    """``(clientes, membresias, fundaciones, usuarios)`` en el registro."""
    from app.models.identidad import Membresia, Usuario
    from app.models.models import ClienteRow
    from app.models.plataforma import Fundacion

    reg = _registro()
    try:
        return (
            reg.query(ClienteRow).count(),
            reg.query(Membresia).count(),
            reg.query(Fundacion).count(),
            reg.query(Usuario).count(),
        )
    finally:
        reg.close()


def _bases_en_disco():
    """Los archivos ``recabra_*.db`` que existen — una base creada deja rastro."""
    from app.database import SQLALCHEMY_DATABASE_URL

    carpeta = os.path.dirname(SQLALCHEMY_DATABASE_URL.replace("sqlite:///", "", 1))
    return {os.path.basename(p) for p in glob.glob(os.path.join(carpeta, "recabra_*.db"))}


# Muestra ANCHA de mutaciones de negocio: un endpoint por router que muta, no
# sólo el que el builder probó. Cada tupla es (método, ruta, cuerpo json).
MUTACIONES_DE_NEGOCIO = [
    ("POST", "/api/spaces/", {"svg_id": "s1", "code": "A-1", "sede": "PUN"}),
    ("POST", "/api/spaces/find-or-create", {"svg_id": "s1", "code": "A-1", "sede": "PUN"}),
    ("PATCH", "/api/spaces/1/status", {"status": "occupied"}),
    ("POST", "/api/spaces/1/leases", {"supplier_id": 1}),
    ("DELETE", "/api/spaces/1/leases/1", None),
    ("POST", "/api/suppliers/", {"name": "Proveedor X"}),
    ("POST", "/api/suppliers/find-or-create", {"name": "Proveedor X"}),
    ("PUT", "/api/suppliers/1", {"name": "Proveedor Y"}),
    ("DELETE", "/api/suppliers/1", None),
    ("PUT", "/api/layout/settings", {}),
    ("PUT", "/api/layout/seasons", {}),
    ("PUT", "/api/layout/rates", {}),
    ("PUT", "/api/layout/PUN", {}),
    ("DELETE", "/api/layout/PUN", None),
    ("POST", "/api/leases/bulk/validar", {"filas": []}),
    ("POST", "/api/leases/bulk/confirmar", {"filas": []}),
    ("POST", "/api/mounts/", {"lease_id": 1}),
    ("POST", "/api/catalogo/", {}),
    ("DELETE", "/api/catalogo/1", None),
    ("POST", "/api/spaces/1/files", {}),
    ("DELETE", "/api/files/1", None),
    ("POST", "/api/leases/1/planometria", {}),
    ("DELETE", "/api/leases/1/planometria", None),
    ("PUT", "/api/notifications/config", {}),
    ("PUT", "/api/notifications/contacts", {}),
    ("POST", "/api/notifications/test", {}),
    ("POST", "/api/montaje/reportar", {"codigo": "A-1"}),
]

# Muestra ancha de LECTURAS de negocio — las que `suspendido` también corta.
LECTURAS_DE_NEGOCIO = [
    "/api/spaces/",
    "/api/spaces/map",
    "/api/suppliers/",
    "/api/dashboard/kpis",
    "/api/dashboard/spaces",
    "/api/layout/",
    "/api/mounts/",
    "/api/catalogo/",
    "/api/bitacora/",
]


def _pedir(client, metodo, ruta, cuerpo, headers):
    kwargs = {"headers": headers}
    if cuerpo is not None and metodo in ("POST", "PUT", "PATCH"):
        kwargs["json"] = cuerpo
    return client.request(metodo, ruta, **kwargs)


# ════════════════════════════════════════════════════════════════════════════
# HALLAZGOS ABIERTOS
# ════════════════════════════════════════════════════════════════════════════

# Hallazgo CERRADO en el cierre de fase — el test ahora afirma el arreglo.
def test_r1_un_pedido_anonimo_no_debe_delatar_el_estado_de_cuenta(client, admin):
    _sembrar("suspendido")

    r = client.get("/api/spaces/")  # sin cabecera, sin token, sin nada
    assert r.status_code == 401, (
        f"un anónimo leyó el estado de cuenta del cliente: {r.status_code} {r.text}"
    )

    _sembrar("solo_lectura")
    r = client.post("/api/suppliers/", json={"name": "X"})
    assert r.status_code == 401, (
        f"un anónimo leyó el estado de cuenta del cliente: {r.status_code} {r.text}"
    )


# Hallazgo CERRADO en el cierre de fase — el test ahora afirma el arreglo.
def test_r2_el_motivo_de_la_deuda_no_deberia_llegarle_a_los_no_owner(client, admin):
    _sembrar("solo_lectura", motivo="Mora 90 días — factura 0001-4517 — hablar con Tesorería")

    # a) La contraseña compartida de worker. No es una persona: es un cartel en
    #    la trastienda que sabe el mercaderista de turno.
    legado = client.post("/api/auth/login", json={"password": CLAVE_WORKER})
    assert legado.status_code == 200, legado.text
    motivo_legado = (legado.json().get("aviso_cuenta") or {}).get("motivo")

    # b) Un miembro con cuenta propia y rol worker.
    client.post("/api/usuarios/invitar", json={"email": "peon@x.co", "rol": "worker"}, headers=admin)
    _usar_verificador(client, {"tok": _claims("uid-peon", "peon@x.co")})
    # Cuenta nueva sin consentimiento registrado -- Fase 3 se lo pide UNA vez
    # al entrar (spec); este archivo ataca la Fase 2, así que se manda de
    # entrada para no chocar con el 428 de "consentimiento_requerido".
    oauth = client.post("/api/auth/oauth", json={"id_token": "tok", "acepta_politica": True})
    assert oauth.status_code == 200, oauth.text
    motivo_oauth = (oauth.json().get("aviso_cuenta") or {}).get("motivo")

    assert motivo_legado is None and motivo_oauth is None, (
        "el motivo de la deuda se filtró a quien no es owner: "
        f"legado={motivo_legado!r} oauth={motivo_oauth!r}"
    )


@pytest.mark.xfail(
    strict=True,
    reason=(
        "R-3 (menor): el tope de dos fundaciones es un `count()` seguido de un "
        "`INSERT` (routers/alta.py:139-144 y 165) sin ninguna barrera en la "
        "base. `Fundacion` sólo tiene UNIQUE(usuario_id, cliente_slug), que "
        "impide fundar DOS VECES EL MISMO slug, no fundar un tercer cliente. "
        "Dos altas simultáneas del mismo usuario leen ambas «llevo 1» y dejan 3 "
        "fundaciones. El daño está acotado a un cliente de más."
    ),
)
def test_r3_el_tope_de_dos_fundaciones_no_tiene_barrera_en_la_base(client):
    from app.models.plataforma import Fundacion

    cuerpo = _fundar(client, "uid-carrera", "carrera@x.co", "primerita", "Primerita")
    usuario_id = _payload(cuerpo["token"])["sub"]

    # Dos pedidos concurrentes: los dos leen el contador ANTES de que el otro
    # escriba, los dos ven "1 < 2" y los dos insertan.
    a, b = _registro(), _registro()
    try:
        assert a.query(Fundacion).filter(Fundacion.usuario_id == usuario_id).count() == 1
        assert b.query(Fundacion).filter(Fundacion.usuario_id == usuario_id).count() == 1
        a.add(Fundacion(usuario_id=usuario_id, cliente_slug="segundita"))
        a.commit()
        b.add(Fundacion(usuario_id=usuario_id, cliente_slug="tercerita"))
        b.commit()
        total = a.query(Fundacion).filter(Fundacion.usuario_id == usuario_id).count()
    finally:
        a.close()
        b.close()

    assert total <= 2, f"quedaron {total} fundaciones para un tope de 2"


@pytest.mark.xfail(
    strict=True,
    reason=(
        "R-4 (menor): el alta hace `reg.commit()` (routers/alta.py:152) ANTES "
        "del paso irreversible para soltar el candado de SQLite. Si "
        "`crear_cliente` falla justo después, la fila de `usuarios` recién "
        "creada ya quedó grabada: un `Usuario` sin membresía, sin fundación y "
        "sin cliente. No da acceso a nada (/oauth le contesta 403 «tu cuenta no "
        "tiene acceso a ningún cliente»), pero contradice la promesa de «sin "
        "cliente a medias» y deja fondo de tabla que crece con cada intento "
        "fallido."
    ),
)
def test_r4_un_alta_que_falla_en_el_paso_irreversible_no_deja_usuario_huerfano(client, monkeypatch):
    import app.routers.alta as alta
    from app.models.identidad import Usuario

    def _explota(slug, nombre):
        raise alta.ErrorDeAlta("no se pudo crear la base del cliente")

    monkeypatch.setattr(alta, "crear_cliente", _explota)

    _usar_verificador(client, {"t": _claims("uid-fantasma", "fantasma@x.co")})
    r = _alta(client, "t", "fantasmita", "Fantasmita")
    assert r.status_code == 409, r.text

    reg = _registro()
    try:
        huerfanos = [u.email for u in reg.query(Usuario).all()]
    finally:
        reg.close()

    assert huerfanos == [], f"el 409 dejó usuarios huérfanos: {huerfanos}"


@pytest.mark.xfail(
    strict=True,
    reason=(
        "R-5 (menor hoy, latente): `crear_cliente` ADOPTA una base que ya "
        "existe en vez de rechazarla. En Postgres el «already exists» del "
        "CREATE DATABASE se traga a propósito (clientes.py:307-313) y el flujo "
        "sigue contra la base ajena; el duplicado sólo se chequea con "
        "`buscar()` (clientes.py:293), que mira el registro y no el motor. Hasta la Fase 2 esto "
        "lo llamaba un humano con acceso al servidor; ahora lo llama internet. "
        "Dos consecuencias: (1) cualquier base `recabra_<slug>` de la misma "
        "instancia que no tenga fila en `clientes` es reclamable por quien "
        "adivine el slug —y el alta le CREA LAS TABLAS adentro—; (2) si "
        "`DATABASE_URL` apuntara a una base llamada `recabra_<algo>`, fundar el "
        "slug `<algo>` devuelve `db_name == _db_por_defecto()` y `motor_de` "
        "(clientes.py:114-118) entrega el motor por defecto: el fundador nace "
        "admin SOBRE LA BASE DEL CLIENTE POR DEFECTO. Hoy no pasa porque "
        "producción se llama `retail_espacios` (render.yaml:3); es un renombre "
        "de base de distancia."
    ),
)
def test_r5_el_alta_no_debe_adoptar_una_base_que_ya_existe(client, admin):
    from sqlalchemy import create_engine, text

    from app.clientes import nombre_de_base, url_para

    # Una base que ya vive en la misma instancia y NO tiene fila en `clientes`
    # — el equivalente SQLite del «already exists» que Postgres traga.
    motor = create_engine(url_para(nombre_de_base("vecindario")))
    with motor.connect() as cx:
        cx.execute(text("CREATE TABLE secretos (dato VARCHAR)"))
        cx.execute(text("INSERT INTO secretos VALUES ('contabilidad ajena')"))
        cx.commit()
    motor.dispose()

    _usar_verificador(client, {"t": _claims("uid-okupa", "okupa@x.co")})
    r = _alta(client, "t", "vecindario", "Vecindario")

    detalle = ""
    if r.status_code == 200:
        motor = create_engine(url_para(nombre_de_base("vecindario")))
        with motor.connect() as cx:
            tablas = {f[0] for f in cx.execute(
                text("SELECT name FROM sqlite_master WHERE type='table'")
            )}
        motor.dispose()
        detalle = (
            f" — la tabla ajena sigue ahí ({'secretos' in tablas}) y el alta le "
            f"creó {len(tablas) - 1} tablas propias adentro"
        )

    assert r.status_code in (409, 422), (
        f"el alta adoptó una base preexistente: {r.status_code}{detalle}"
    )


# ════════════════════════════════════════════════════════════════════════════
# FRONTERA DE OPERADOR
# ════════════════════════════════════════════════════════════════════════════

def test_a_el_token_legado_jamas_es_operador_aunque_su_correo_este_en_la_env(client, admin, monkeypatch):
    """(a) El login por contraseña compartida no es una persona: no tiene correo.

    Se le pone TODO en la env —incluido el correo del admin de galerias y un
    comodín— y aun así el legado no pasa: `require_auth` sólo deja
    `actor_email` cuando el token trae el claim, y el legado nunca lo trae.
    """
    monkeypatch.setenv("OPERADOR_EMAILS", "admin@galerias.co,*,,op@recabra.co")

    soy = client.get("/api/plataforma/soy", headers=admin)
    assert soy.status_code == 200 and soy.json()["operador"] is False

    for metodo, ruta, cuerpo in (
        ("GET", "/api/plataforma/clientes", None),
        ("PATCH", "/api/plataforma/clientes/galerias", {"estado": "suspendido", "motivo": "x"}),
    ):
        r = _pedir(client, metodo, ruta, cuerpo, admin)
        assert r.status_code == 403, f"{metodo} {ruta} -> {r.status_code} {r.text}"
        assert r.json()["detail"] == NO_OPERADOR

    # Y el interruptor quedó donde estaba: el PATCH no escribió nada.
    from app.models.plataforma import EstadoCliente
    reg = _registro()
    try:
        assert reg.query(EstadoCliente).count() == 0
    finally:
        reg.close()


def test_a2_ningun_login_emite_un_token_con_email_pero_sin_sub(client, admin):
    """(a) La otra mitad del mismo ataque: que no exista la credencial híbrida.

    `es_operador` mira el claim `email`; `decode_token` sólo somete al chequeo
    de membresía a los tokens que traen `sub`. Un token con `email` y sin `sub`
    sería un operador inmune a la revocación individual. Ningún camino lo
    emite: ni el login legado ni el token de rescate de `PUT /auth/passwords`,
    que es el que reemite para la misma persona.
    """
    legado = client.post("/api/auth/login", json={"password": CLAVE_ADMIN}).json()["token"]
    assert "email" not in _payload(legado) and "sub" not in _payload(legado)

    rescate = client.put(
        "/api/auth/passwords", json={"admin_password": "clave-nueva-larga"}, headers=admin,
    ).json()["token"]
    p = _payload(rescate)
    assert ("email" in p) == ("sub" in p), f"token híbrido emitido: {p}"
    assert "email" not in p


def test_b_una_cuenta_con_sub_fuera_de_la_env_no_es_operadora(client, monkeypatch):
    """(b) Tener `sub` no alcanza: hay que estar en la lista."""
    monkeypatch.setenv("OPERADOR_EMAILS", "op@recabra.co")
    cuerpo = _fundar(client, "uid-x", "cualquiera@x.co", "cualquierita", "Cualquierita")
    cab = _cab(cuerpo["token"])

    assert client.get("/api/plataforma/soy", headers=cab).json()["operador"] is False
    assert client.get("/api/plataforma/clientes", headers=cab).status_code == 403
    assert client.patch(
        "/api/plataforma/clientes/galerias",
        json={"estado": "activo", "motivo": "porque sí"}, headers=cab,
    ).status_code == 403


def test_c_sin_operador_emails_no_hay_operadores(client, monkeypatch):
    """(c) Env ausente, vacía o llena de separadores: nadie es operador.

    El caso peligroso es el correo vacío contra una lista vacía: dos cadenas
    vacías son iguales, y un `in` mal escrito habría hecho operador a todo el
    mundo. `es_operador` corta por `if not email` y además filtra los vacíos de
    la env.
    """
    cuerpo = _fundar(client, "uid-y", "nadie@x.co", "nadiecita", "Nadiecita")
    cab = _cab(cuerpo["token"])

    for valor in (None, "", " ", ",", " , , ", ",,,"):
        if valor is None:
            monkeypatch.delenv("OPERADOR_EMAILS", raising=False)
        else:
            monkeypatch.setenv("OPERADOR_EMAILS", valor)
        assert client.get("/api/plataforma/soy", headers=cab).json()["operador"] is False, valor
        assert client.get("/api/plataforma/clientes", headers=cab).status_code == 403, valor

    # Y directamente contra el helper: ni el correo vacío ni el de espacios.
    from app.plataforma_estado import es_operador
    monkeypatch.setenv("OPERADOR_EMAILS", "")
    for correo in (None, "", "   ", "nadie@x.co"):
        assert es_operador(correo) is False, correo


def test_d_el_match_normaliza_espacios_y_mayusculas_pero_nunca_es_parcial(client, monkeypatch):
    """(d) " Admin@X.CO " en la env matchea "admin@x.co"; "a@x.co" no matchea "aa@x.co"."""
    from app.plataforma_estado import es_operador

    monkeypatch.setenv("OPERADOR_EMAILS", "  Admin@X.CO ,  Otra@Y.Co  ")
    assert es_operador("admin@x.co") is True
    assert es_operador("  ADMIN@x.co  ") is True
    assert es_operador("otra@y.co") is True

    # Prefijos, sufijos e infijos: ninguno alcanza.
    for impostor in ("a@x.co", "dmin@x.co", "admin@x.c", "admin@x.co.ar",
                     "xadmin@x.co", "admin@x.co ,otra@y.co", "@x.co", "x.co"):
        assert es_operador(impostor) is False, impostor

    # Y por HTTP, con tokens de verdad: "a@x.co" no entra por estar "aa@x.co".
    monkeypatch.setenv("OPERADOR_EMAILS", "aa@x.co")
    corta = _cab(_fundar(client, "uid-a", "a@x.co", "corta", "Corta")["token"])
    larga = _cab(_fundar(client, "uid-aa", "aa@x.co", "larga", "Larga")["token"])
    assert client.get("/api/plataforma/clientes", headers=corta).status_code == 403
    assert client.get("/api/plataforma/clientes", headers=larga).status_code == 200


def test_e_el_operador_no_ve_ni_toca_datos_de_negocio_de_nadie(client, monkeypatch):
    """(e) Escalada horizontal: ser operador abre el REGISTRO, no las bases.

    Se monta un cliente ajeno con un dato reconocible adentro y se comprueba
    que ni el panel ni ninguno de los caminos de negocio se lo entregan al
    operador — cuyo token sigue siendo el de SU cliente.
    """
    SECRETO = "Proveedor Confidencial SA"

    ajena = _fundar(client, "uid-ajena", "duenia@ajena.co", "ajenita", "Ajenita")
    cab_ajena = _cab(ajena["token"])
    assert client.post("/api/suppliers/", json={"name": SECRETO}, headers=cab_ajena).status_code == 201

    cab_op = _operador(client, monkeypatch)

    # 1) El panel: sólo columnas del registro, y ningún dato de adentro.
    r = client.get("/api/plataforma/clientes", headers=cab_op)
    assert r.status_code == 200, r.text
    assert SECRETO not in r.text
    # `base_principal` (2026-09-23) también es del registro: compara el
    # `db_name` de la fila con el de `DATABASE_URL`, sin abrir ninguna base.
    esperadas = {
        "slug", "nombre", "activo", "base_principal", "estado", "motivo", "cambiado_en", "cambiado_por",
    }
    for fila in r.json()["clientes"]:
        assert set(fila) == esperadas, fila
    assert {f["slug"] for f in r.json()["clientes"]} >= {"galerias", "ajenita", "operadora"}

    # 2) Su token sigue siendo el de "operadora": el negocio que ve es el suyo
    #    (vacío), no el de nadie más — ni forzando el cliente por query.
    for ruta in ("/api/suppliers/", "/api/spaces/", "/api/dashboard/spaces"):
        for sufijo in ("", "?cliente=ajenita", f"?token={ajena['token']}"):
            rr = client.get(ruta + sufijo, headers=cab_op)
            assert rr.status_code == 200, (ruta, sufijo, rr.text)
            assert SECRETO not in rr.text, (ruta, sufijo, rr.text)

    # 3) Ni la gestión de usuarios del cliente ajeno.
    miembros = client.get("/api/usuarios", headers=cab_op).json()["miembros"]
    assert all(m["email"] != "duenia@ajena.co" for m in miembros), miembros


def test_f_el_patch_del_operador_rechaza_slug_estado_y_motivo_invalidos(client, monkeypatch):
    """(f) Los tres bordes del PATCH, más los que el builder no probó."""
    cab = _operador(client, monkeypatch)

    # Slug inexistente, y slugs hostiles: nunca 200 y nunca 500. (`../galerias`
    # lo normaliza el cliente HTTP antes de salir y termina en 405 sobre la
    # ruta de la colección — igual de cerrado.)
    for slug in ("noexiste", "galerias2", "../galerias", "galerias%00", "'", "GALERIAS_"):
        r = client.patch(f"/api/plataforma/clientes/{slug}",
                         json={"estado": "suspendido", "motivo": "x"}, headers=cab)
        assert r.status_code in (404, 405), (slug, r.status_code, r.text)

    # Estados inventados.
    for estado in ("", "activo2", "SUSPENDIDO_TOTAL", "borrado", "deleted", "null", "0"):
        r = client.patch("/api/plataforma/clientes/galerias",
                         json={"estado": estado, "motivo": "x"}, headers=cab)
        assert r.status_code == 422, (estado, r.status_code, r.text)

    # Motivos vacíos: obligatorio también para "activo", que es la auditoría.
    for estado in ("activo", "gracia", "solo_lectura", "suspendido"):
        for motivo in ("", "   ", "\t\n"):
            r = client.patch("/api/plataforma/clientes/galerias",
                             json={"estado": estado, "motivo": motivo}, headers=cab)
            assert r.status_code == 422, (estado, motivo, r.status_code, r.text)

    # Nada de eso escribió una fila.
    from app.models.plataforma import EstadoCliente
    reg = _registro()
    try:
        assert reg.query(EstadoCliente).count() == 0
    finally:
        reg.close()


def test_f2_un_estado_no_canonico_nunca_queda_guardado_a_medias(client, monkeypatch):
    """(f) El PATCH normaliza antes de validar: lo que se guarda tiene que CORTAR.

    Importa porque `_aplicar_estado` deja pasar a propósito los estados que no
    reconoce (clientes.py:412, el `return cliente` final): si el PATCH guardara "SUSPENDIDO" tal cual,
    el operador vería la cuenta suspendida en el panel y el cliente seguiría
    operando — un interruptor que miente.
    """
    from app.models.plataforma import EstadoCliente

    cab = _operador(client, monkeypatch)

    for entrada in ("SUSPENDIDO", " suspendido ", "Suspendido"):
        r = client.patch("/api/plataforma/clientes/galerias",
                         json={"estado": entrada, "motivo": "impago"}, headers=cab)
        assert r.status_code in (200, 422), (entrada, r.status_code, r.text)
        if r.status_code == 422:
            continue

        reg = _registro()
        try:
            fila = reg.query(EstadoCliente).filter(EstadoCliente.slug == "galerias").first()
            assert fila.estado == "suspendido", (entrada, fila.estado)
        finally:
            reg.close()

        # Y el corte se siente de verdad, no sólo en el panel.
        legado = client.post("/api/auth/login", json={"password": CLAVE_ADMIN, "cliente": "galerias"})
        assert legado.status_code == 402, (entrada, legado.status_code, legado.text)

        client.patch("/api/plataforma/clientes/galerias",
                     json={"estado": "activo", "motivo": "al día"}, headers=cab)


def test_g_un_operador_con_su_propio_cliente_suspendido_sigue_operando_la_plataforma(client, monkeypatch):
    """(g) La exención del contrato, y su límite.

    El operador con su cuenta caída tiene que poder seguir destrabando cuentas
    (si no, un error de dedo se vuelve irreversible), pero NO tiene que poder
    seguir usando su supermercado.
    """
    cab = _operador(client, monkeypatch)
    _sembrar("suspendido", slug="operadora", motivo="su propia cuenta impaga")

    # Plataforma: entra.
    assert client.get("/api/plataforma/soy", headers=cab).json()["operador"] is True
    assert client.get("/api/plataforma/clientes", headers=cab).status_code == 200
    r = client.patch("/api/plataforma/clientes/galerias",
                     json={"estado": "gracia", "motivo": "acuerdo de pago"}, headers=cab)
    assert r.status_code == 200, r.text

    # Negocio: no entra, ni para leer.
    for ruta in LECTURAS_DE_NEGOCIO:
        rr = client.get(ruta, headers=cab)
        assert rr.status_code == 402, (ruta, rr.status_code, rr.text)
        assert rr.json()["detail"] == SUSPENDIDA
    assert client.post("/api/suppliers/", json={"name": "X"}, headers=cab).status_code == 402

    # Y puede destrabarse a sí mismo: es la contracara de la exención.
    assert client.patch("/api/plataforma/clientes/operadora",
                        json={"estado": "activo", "motivo": "pagó"}, headers=cab).status_code == 200
    assert client.get("/api/suppliers/", headers=cab).status_code == 200


# ════════════════════════════════════════════════════════════════════════════
# SUPERFICIE DE DENEGACIÓN
# ════════════════════════════════════════════════════════════════════════════

def test_h_solo_lectura_corta_una_muestra_ancha_de_mutaciones(client, admin):
    """(h) 27 mutaciones, un endpoint por router: todas 402, ninguna se cuela.

    El corte vive en `cliente_del_pedido`, que es sub-dependencia de `get_db`, y
    por eso alcanza a los routers que nadie enumeró — pero eso hay que
    verificarlo, no suponerlo: un router que abriera su propia sesión se
    saltearía el interruptor entero.
    """
    _sembrar("solo_lectura")

    fugas = []
    for metodo, ruta, cuerpo in MUTACIONES_DE_NEGOCIO:
        r = _pedir(client, metodo, ruta, cuerpo, admin)
        if r.status_code != 402 or r.json().get("detail") != SOLO_LECTURA:
            fugas.append((metodo, ruta, r.status_code, r.text[:120]))
    assert not fugas, f"mutaciones que no dieron 402 en solo_lectura: {fugas}"

    # Y las lecturas siguen abiertas: el corte es a la escritura, no al cliente.
    for ruta in LECTURAS_DE_NEGOCIO:
        assert client.get(ruta, headers=admin).status_code == 200, ruta


def test_i_suspendido_corta_los_caminos_laterales_que_no_llevan_cabecera(client, admin):
    """(i) `?token=` en la query y el enlace de la mercaderista.

    Son los dos caminos que no pasan por `require_auth` con cabecera: la foto y
    la planometría se abren en un `<img>`/`<iframe>`, y el token de montaje
    llega por la URL del correo. Si el interruptor viviera en `require_auth` en
    vez de en la resolución de cliente, los dos quedarían abiertos.
    """
    from app.auth import create_mount_token

    token_admin = client.post("/api/auth/login", json={"password": CLAVE_ADMIN}).json()["token"]
    montaje = create_mount_token("A-1", "galerias")

    _sembrar("suspendido")

    # a) Cabecera: hasta los GET.
    for ruta in LECTURAS_DE_NEGOCIO:
        r = client.get(ruta, headers=admin)
        assert r.status_code == 402, (ruta, r.status_code, r.text)
        assert r.json()["detail"] == SUSPENDIDA

    # b) `?token=` — el camino de `_credencial` sin cabecera.
    for ruta in (f"/api/catalogo/1/imagen?token={token_admin}",
                 f"/api/files/1?token={token_admin}",
                 f"/api/planometrias/1?token={token_admin}",
                 f"/api/spaces/face-images?token={token_admin}"):
        r = client.get(ruta)
        assert r.status_code == 402, (ruta, r.status_code, r.text)

    # c) El enlace de montaje: token de mercaderista, sin cabecera.
    for ruta in (f"/api/montaje/mi-espacio?token={montaje}",
                 f"/api/montaje/planometria?token={montaje}"):
        r = client.get(ruta)
        assert r.status_code == 402, (ruta, r.status_code, r.text)
    r = client.post(f"/api/montaje/reportar?token={montaje}", json={"codigo": "A-1"})
    assert r.status_code == 402, r.text


def test_j_ni_head_ni_options_abren_una_mutacion_en_solo_lectura(client, admin):
    """(j) Bypass por método: los dos verbos que `solo_lectura` deja pasar.

    HEAD y OPTIONS pasan el interruptor a propósito (son lecturas), así que la
    pregunta es si alguno alcanza un handler que escriba. No llega ninguno: a
    diferencia de `starlette.routing.Route`, el `APIRoute` de FastAPI NO le suma
    HEAD a las rutas GET, así que HEAD y OPTIONS mueren en 405 en TODO `/api`
    antes de tocar una dependencia. Los dos verbos en `_METODOS_DE_LECTURA`
    (clientes.py:362) son, en la práctica, letra muerta — inofensiva, pero letra
    muerta: si mañana alguien monta una ruta HEAD, el interruptor la deja pasar.
    """
    _sembrar("solo_lectura")
    antes = client.get("/api/suppliers/", headers=admin).json()

    fugas = []
    for metodo, ruta, _cuerpo in MUTACIONES_DE_NEGOCIO:
        for verbo in ("HEAD", "OPTIONS"):
            r = client.request(verbo, ruta, headers=admin)
            if r.status_code < 300 or r.status_code not in (402, 405):
                fugas.append((verbo, ruta, r.status_code))
    assert not fugas, f"HEAD/OPTIONS abrieron una mutación: {fugas}"

    assert client.get("/api/suppliers/", headers=admin).json() == antes

    # Y el único GET que SÍ escribe por dentro —`expire_leases()`— sigue
    # funcionando, que es la mitad que se rompe si el corte fuera a la sesión.
    assert client.get("/api/spaces/map", headers=admin).status_code == 200
    assert client.head("/api/spaces/map", headers=admin).status_code == 405


def test_k_suspendido_en_oauth_deja_afuera_a_la_gente_y_adentro_al_owner(client, admin):
    """(k) El 402 de /oauth por rol, y el motivo sólo para el owner.

    (Los tres roles, no sólo worker: `admin` por membresía es un rol distinto de
    `owner` y el contrato lo deja afuera igual.)
    """
    for rol, email, uid in (("worker", "peona@x.co", "uid-peona"),
                            ("admin", "gerenta@x.co", "uid-gerenta"),
                            ("owner", "duenia@x.co", "uid-duenia")):
        client.post("/api/usuarios/invitar", json={"email": email, "rol": rol}, headers=admin)

    _sembrar("suspendido", motivo="Mora de 120 días")

    for rol, email, uid in (("worker", "peona@x.co", "uid-peona"),
                            ("admin", "gerenta@x.co", "uid-gerenta")):
        _usar_verificador(client, {"t": _claims(uid, email)})
        # `acepta_politica: True` para no chocar con el 428 de Fase 3 (cuenta
        # nueva sin consentimiento) -- este test ataca el 402 de suspensión,
        # que en `routers/auth.py` se resuelve DESPUÉS del chequeo de consentimiento.
        r = client.post("/api/auth/oauth", json={"id_token": "t", "acepta_politica": True})
        assert r.status_code == 402, (rol, r.status_code, r.text)
        assert r.json()["detail"] == SUSPENDIDA
        assert "Mora" not in r.text, (rol, r.text)

    _usar_verificador(client, {"t": _claims("uid-duenia", "duenia@x.co")})
    r = client.post("/api/auth/oauth", json={"id_token": "t", "acepta_politica": True})
    assert r.status_code == 200, r.text
    assert r.json()["aviso_cuenta"] == {"estado": "suspendido", "motivo": "Mora de 120 días"}

    # El owner entró, pero no opera: el token vale para leer el motivo y pagar.
    cab = _cab(r.json()["token"])
    assert client.get("/api/spaces/", headers=cab).status_code == 402
    assert client.post("/api/suppliers/", json={"name": "X"}, headers=cab).status_code == 402


def test_l_el_interruptor_se_siente_en_el_pedido_siguiente_en_los_dos_sentidos(client, admin, monkeypatch):
    """(l) La carrera del cache de 60 s, movida por el PATCH real del operador.

    Sin `invalidar_cache_estado` un cliente recién suspendido seguiría operando
    hasta un minuto; y —peor para el negocio— un cliente que acaba de pagar
    seguiría cortado hasta un minuto después de destrabarlo.
    """
    cab_op = _operador(client, monkeypatch)

    # El pedido de ahora deja "activo" cacheado por 60 s.
    assert client.get("/api/spaces/", headers=admin).status_code == 200

    r = client.patch("/api/plataforma/clientes/galerias",
                     json={"estado": "suspendido", "motivo": "impago"}, headers=cab_op)
    assert r.status_code == 200, r.text
    assert client.get("/api/spaces/", headers=admin).status_code == 402

    r = client.patch("/api/plataforma/clientes/galerias",
                     json={"estado": "activo", "motivo": "pagó"}, headers=cab_op)
    assert r.status_code == 200, r.text
    assert client.get("/api/spaces/", headers=admin).status_code == 200

    # Y con el slug escrito raro: la invalidación tiene que usar el normalizado.
    assert client.patch("/api/plataforma/clientes/ GALERIAS ",
                        json={"estado": "suspendido", "motivo": "impago"},
                        headers=cab_op).status_code in (200, 404)
    if client.get("/api/plataforma/clientes", headers=cab_op).json():
        estado = next(c for c in client.get("/api/plataforma/clientes", headers=cab_op).json()["clientes"]
                      if c["slug"] == "galerias")["estado"]
        esperado = 402 if estado == "suspendido" else 200
        assert client.get("/api/spaces/", headers=admin).status_code == esperado


def test_m_sin_fila_y_con_fila_activo_la_suite_de_humo_pasa_igual(client):
    """(m) Cero denegación espuria: galerias, que no tiene fila, no se entera.

    Login legado + GET + POST, primero sin fila (el estado de producción) y
    después con una fila `activo` puesta a mano por el operador — que el
    contrato manda tratar exactamente igual que la fila ausente.
    """
    def _humo():
        r = client.post("/api/auth/login", json={"password": CLAVE_ADMIN})
        assert r.status_code == 200, r.text
        assert "aviso_cuenta" not in r.json(), r.json()
        cab = _cab(r.json()["token"])
        assert client.get("/api/spaces/", headers=cab).status_code == 200
        assert client.get("/api/spaces/map", headers=cab).status_code == 200
        assert client.get("/api/dashboard/kpis", headers=cab).status_code == 200
        return client.post("/api/suppliers/", json={"name": f"Prov {os.urandom(3).hex()}"},
                           headers=cab).status_code

    assert _humo() == 201            # sin fila
    _sembrar("activo", motivo="revisión manual")
    assert _humo() == 201            # con fila "activo"


# ════════════════════════════════════════════════════════════════════════════
# EL ALTA COMO SUPERFICIE DE ABUSO
# ════════════════════════════════════════════════════════════════════════════

SLUGS_HOSTILES = [
    "galerias", "GALERIAS", " galerias ",          # el cliente de producción
    "api", "www", "admin", "plataforma", "Admin",  # reservados
    "registro", "recabra", "app", "auth", "login", "oauth", "test", "demo",
    "",  "   ", "a", "1abc", "_abc", "-abc", ".abc",
    "a" * 40, "a" * 32,           # `SLUG_VALIDO` corta en 31
    "ñoño", "aviñón", "café", "ＡＢＣ",
    "a b", "a-b", "a.b", "a/b", "a\\b", "a:b",
    "a'; DROP TABLE clientes;--", 'a" OR "1"="1',
    "a`; CREATE DATABASE evil;--", "postgres; --",
    "../../etc/passwd", "..", ".", "a\x00b", "a\nb", "a\tb",
]


def test_n_ningun_slug_hostil_llega_al_create_database(client, monkeypatch):
    """(n) `SLUG_VALIDO` para ANTES de que el slug se acerque al paso irreversible.

    La comprobación fuerte no es el código de respuesta: es que
    `crear_cliente` —el único que interpola el slug en un `CREATE DATABASE`
    (clientes.py:307)— no se llame nunca con algo que no matchee `SLUG_VALIDO`.
    Por eso se espía la función en vez de mirar sólo el 4xx.
    """
    import app.routers.alta as alta
    from app.clientes import SLUG_VALIDO, crear_cliente as real

    vistos = []

    def _espia(slug, nombre):
        vistos.append(slug)
        return real(slug, nombre)

    monkeypatch.setattr(alta, "crear_cliente", _espia)

    _usar_verificador(client, {"t": _claims("uid-hostil", "hostil@x.co")})
    bases_antes = _bases_en_disco()

    malos = []
    for slug in SLUGS_HOSTILES:
        r = _alta(client, "t", slug, "Nombre")
        if r.status_code not in (409, 422):
            malos.append((slug, r.status_code, r.text[:120]))
    assert not malos, f"slugs hostiles que no murieron en la validación: {malos}"

    assert vistos == [], f"`crear_cliente` recibió slugs sin validar: {vistos}"
    assert _bases_en_disco() == bases_antes, "un slug hostil dejó una base en disco"
    assert _conteos()[0] == 1, "un slug hostil creó una fila de cliente"

    # Y la segunda barrera existe de verdad: `crear_cliente` valida por su
    # cuenta, así que el día que alguien agregue otro camino de alta el
    # `CREATE DATABASE` sigue cubierto.
    for slug in ("a'; DROP TABLE clientes;--", "a b", "ñoño", "a" * 40):
        assert not SLUG_VALIDO.match(slug), slug
        with pytest.raises(alta.ErrorDeAlta):
            real(slug, "Nombre")


def test_o_un_cliente_inactivo_ocupa_el_slug_y_da_409_no_500(client):
    """(o) El caso que `buscar()` no ve.

    `crear_cliente` chequea el duplicado con `buscar()` (clientes.py:293), que
    FILTRA los inactivos: si el alta hubiera usado ese mismo camino, un slug de
    cliente desactivado habría llegado hasta el UNIQUE de `clientes.slug` y
    reventado en 500 —dejando además la base creada—. El alta consulta la tabla
    cruda (routers/alta.py:120), así que contesta 409 como cualquier duplicado.
    """
    from app.models.models import ClienteRow

    _fundar(client, "uid-dorm", "dormilona@x.co", "dormilona", "Dormilona")

    reg = _registro()
    try:
        reg.query(ClienteRow).filter(ClienteRow.slug == "dormilona").first().activo = False
        reg.commit()
    finally:
        reg.close()

    from app.clientes import buscar
    assert buscar("dormilona") is None, "el escenario del ataque no se armó"

    bases_antes = _bases_en_disco()
    _usar_verificador(client, {"t2": _claims("uid-otro", "otro@x.co")})
    r = _alta(client, "t2", "dormilona", "Otra Cosa")
    assert r.status_code == 409, f"{r.status_code}: {r.text}"
    assert r.json()["detail"] == "Ese código ya está tomado. Probá con otro."
    assert _bases_en_disco() == bases_antes


def test_p_la_tercera_fundacion_del_mismo_usuario_muere(client):
    """(p) El tope de dos, por la puerta principal."""
    _usar_verificador(client, {"t": _claims("uid-avara", "avara@x.co")})
    assert _alta(client, "t", "unita", "Unita").status_code == 200
    assert _alta(client, "t", "dosita", "Dosita").status_code == 200

    bases_antes = _bases_en_disco()
    r = _alta(client, "t", "tresita", "Tresita")
    assert r.status_code == 403, r.text
    assert _bases_en_disco() == bases_antes
    assert _conteos()[2] == 2  # fundaciones


def test_q_el_freno_del_alta_no_contamina_ni_al_login_legado_ni_a_oauth(client):
    """(q) 10 tokens basura → 429, y los fallos van a `alta_attempts` y a ninguna otra."""
    from app.models.identidad import IntentoOauth
    from app.models.models import LoginAttempt
    from app.models.plataforma import IntentoAlta

    _usar_verificador(client, {})  # todo id_token da None -> 401

    codigos = [_alta(client, f"basura-{i}", f"slug{i}", "N").status_code for i in range(12)]
    assert 429 in codigos, codigos
    assert codigos[:10] == [401] * 10, codigos

    reg = _registro()
    try:
        assert reg.query(IntentoAlta).count() >= 10
        assert reg.query(IntentoOauth).count() == 0, "el alta ensució el freno de /oauth"
        assert reg.query(LoginAttempt).count() == 0, "el alta ensució el freno del login legado"
    finally:
        reg.close()

    # Y las otras dos puertas siguen abiertas para esta misma IP.
    assert client.post("/api/auth/login", json={"password": CLAVE_ADMIN}).status_code == 200
    _usar_verificador(client, {"ok": _claims("uid-ok", "ok@x.co")})
    assert client.post("/api/auth/oauth", json={"id_token": "ok"}).status_code == 403  # sin membresías


def test_r_un_correo_no_confiable_no_crea_absolutamente_nada(client):
    """(r) La vara de correo del /oauth, aplicada al alta: 401 y cero rastro."""
    antes = _conteos()
    bases_antes = _bases_en_disco()

    for proveedor in ("password", "facebook.com", "custom", None):
        _usar_verificador(client, {
            "t": _claims("uid-flojo", "flojo@x.co", verificado=False, proveedor=proveedor),
        })
        r = _alta(client, "t", "flojita", "Flojita")
        assert r.status_code == 401, (proveedor, r.status_code, r.text)

    # Correo vacío con el proveedor confiable: tampoco.
    _usar_verificador(client, {"t": _claims("uid-vacio", "", proveedor="google.com")})
    assert _alta(client, "t", "vacita", "Vacita").status_code == 401

    assert _conteos() == antes, "un 401 dejó filas en el registro"
    assert _bases_en_disco() == bases_antes


def test_s_el_tope_es_por_fundacion_y_no_por_membresia_activa(client):
    """(s) Apagarse las membresías no devuelve fundaciones.

    Si el tope se contara por membresías activas, cualquiera se fabricaría
    clientes infinitos desactivándose a sí mismo en los anteriores.
    """
    from app.models.identidad import Membresia

    _usar_verificador(client, {"t": _claims("uid-viva", "viva@x.co")})
    assert _alta(client, "t", "unaita", "Unaita").status_code == 200
    assert _alta(client, "t", "dosaita", "Dosaita").status_code == 200

    reg = _registro()
    try:
        for m in reg.query(Membresia).all():
            m.activo = False
        reg.commit()
    finally:
        reg.close()

    r = _alta(client, "t", "tresaita", "Tresaita")
    assert r.status_code == 403, f"{r.status_code}: {r.text}"


def test_t_ningun_4xx_del_alta_deja_un_cliente_a_medias(client):
    """(t) La promesa del contrato, camino por camino.

    Ni `ClienteRow`, ni `Membresia`, ni `Fundacion`, ni base en disco después de
    un 401, un 422, un 409 (reservado o duplicado) o un 403.
    """
    _usar_verificador(client, {"t": _claims("uid-medias", "medias@x.co")})
    _fundar(client, "uid-medias", "medias@x.co", "mediecita", "Mediecita")
    _usar_verificador(client, {"t": _claims("uid-medias", "medias@x.co")})

    # (etiqueta, id_token, slug, nombre, código esperado)
    casos = [
        ("token malo", "nada", "buenita", "Nombre", 401),
        ("slug inválido", "t", "Mala Suerte", "Nombre", 422),
        ("nombre vacío", "t", "buenita", "   ", 422),
        ("reservado", "t", "plataforma", "Nombre", 409),
        ("duplicado", "t", "mediecita", "Nombre", 409),
    ]
    for etiqueta, id_token, slug, nombre, esperado in casos:
        antes, bases_antes = _conteos(), _bases_en_disco()
        r = client.post("/api/clientes/alta",
                        json={"id_token": id_token, "slug": slug, "nombre": nombre})
        assert r.status_code == esperado, (etiqueta, r.status_code, r.text)
        # Después de CADA 4xx, no de todos juntos: si uno solo dejara basura, un
        # chequeo al final lo escondería detrás del que la limpió.
        assert _conteos()[:3] == antes[:3], f"{etiqueta} dejó filas: {antes} -> {_conteos()}"
        assert _bases_en_disco() == bases_antes, f"{etiqueta} dejó una base en disco"

    # Y el 403 del tope, con el usuario ya en dos.
    _fundar(client, "uid-medias", "medias@x.co", "mediecita2", "Mediecita Dos")
    _usar_verificador(client, {"t": _claims("uid-medias", "medias@x.co")})
    antes, bases_antes = _conteos(), _bases_en_disco()
    assert _alta(client, "t", "mediecita3", "Tres").status_code == 403
    assert _conteos()[:3] == antes[:3], f"el 403 del tope dejó filas: {antes} -> {_conteos()}"
    assert _bases_en_disco() == bases_antes


# ════════════════════════════════════════════════════════════════════════════
# CARACTERIZACIONES · el contrato se cumple, y tiene consecuencias
# ════════════════════════════════════════════════════════════════════════════

def test_c1_el_alta_es_una_puerta_lateral_a_la_suspension(client, admin):
    """R-6 (menor, de diseño): suspender no impide fundar otro supermercado.

    `POST /api/clientes/alta` no pasa por `cliente_del_pedido` —no puede: quien
    funda todavía no tiene cliente—, así que el interruptor no lo alcanza. Un
    owner al que le cortaron el servicio por no pagar funda un cliente nuevo y
    sigue trabajando; el tope de dos fundaciones es lo único que lo acota, y una
    cuenta de Google nueva devuelve el contador a cero.

    Esto NO contradice el contrato (que sólo topea por fundación): queda escrito
    para que la decisión sea deliberada y no un descubrimiento de producción.
    """
    cuerpo = _fundar(client, "uid-esquiva", "esquiva@x.co", "caidita", "Caidita")
    cab_viejo = _cab(cuerpo["token"])
    _sembrar("suspendido", slug="caidita", motivo="no pagó")

    assert client.get("/api/spaces/", headers=cab_viejo).status_code == 402

    # Mismo usuario, mismo id_token: funda de nuevo y vuelve a operar.
    _usar_verificador(client, {"uid-esquiva": _claims("uid-esquiva", "esquiva@x.co")})
    r = _alta(client, "uid-esquiva", "levantada", "Levantada")
    assert r.status_code == 200, r.text
    cab_nuevo = _cab(r.json()["token"])
    assert client.get("/api/spaces/", headers=cab_nuevo).status_code == 200
    assert client.post("/api/suppliers/", json={"name": "Sigue"}, headers=cab_nuevo).status_code == 201


def test_c2_solo_lectura_no_es_solo_lectura_para_auth_ni_para_usuarios(client, admin):
    """R-7 (menor, de diseño): las dos exenciones del contrato SÍ escriben.

    `/api/auth` y `/api/usuarios` quedan exentos en `solo_lectura` para que el
    owner pueda entrar y pagar (spec, decisión 3). El precio, escrito acá para
    que nadie lo redescubra: `PUT /api/auth/passwords` escribe en la base DEL
    CLIENTE (hash y época en `app_config`) y `POST /api/usuarios/invitar` sigue
    dando de alta gente en una cuenta que oficialmente no muta.
    """
    _sembrar("solo_lectura")

    r = client.put("/api/auth/passwords", json={"worker_password": "otra-clave-larga"}, headers=admin)
    assert r.status_code == 200, r.text
    assert client.post("/api/auth/login", json={"password": CLAVE_WORKER}).status_code == 401
    assert client.post("/api/auth/login", json={"password": "otra-clave-larga"}).status_code == 200

    r = client.post("/api/usuarios/invitar", json={"email": "nueva@x.co", "rol": "admin"}, headers=admin)
    assert r.status_code == 200, r.text


def test_c3_el_estado_de_un_cliente_no_se_contagia_al_de_al_lado(client, admin):
    """El aislamiento del interruptor: es por slug, y el cache también."""
    cab_vecina = _cab(_fundar(client, "uid-vec", "vecina@x.co", "vecinita", "Vecinita")["token"])

    _sembrar("suspendido", slug="vecinita")
    assert client.get("/api/spaces/", headers=cab_vecina).status_code == 402
    assert client.get("/api/spaces/", headers=admin).status_code == 200

    _sembrar("activo", slug="vecinita")
    _sembrar("suspendido", slug="galerias")
    assert client.get("/api/spaces/", headers=cab_vecina).status_code == 200
    assert client.get("/api/spaces/", headers=admin).status_code == 402
