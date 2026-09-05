"""Fase 6: cohortes de adopción (``GET /api/plataforma/adopcion``).

Reusa el andamiaje de ``test_plataforma_metricas.py``. Las fechas de alta y de
último acceso se siembran escribiendo directo en el registro (``Fundacion`` /
``Usuario.ultimo_login``) -- el alta self-service y el login legítimo siempre
dejan "ahora", así que para sembrar un escenario con historia hay que
retrasarlos a mano después.
"""
from datetime import datetime, timedelta, timezone

from tests.test_plataforma_metricas import (
    Identidades,
    _cab,
    _fundar,
    _operador_sin_membresias,
    _romper,
    _sembrar,
)


def _hace(dias: int) -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=dias)


def _backdate_fundacion(slug: str, dias: int) -> None:
    from app.clientes import sesion_registro
    from app.models.plataforma import Fundacion

    reg = sesion_registro()
    try:
        fila = reg.query(Fundacion).filter(Fundacion.cliente_slug == slug).first()
        assert fila is not None, slug
        fila.creado_en = _hace(dias)
        reg.commit()
    finally:
        reg.close()


def _backdate_login(email: str, dias: int | None) -> None:
    """``dias=None`` deja ``ultimo_login`` en ``NULL`` (nunca entró)."""
    from app.clientes import sesion_registro
    from app.models.identidad import Usuario

    reg = sesion_registro()
    try:
        fila = reg.query(Usuario).filter(Usuario.email == email).first()
        assert fila is not None, email
        fila.ultimo_login = None if dias is None else _hace(dias)
        reg.commit()
    finally:
        reg.close()


def _desactivar_membresias(slug: str) -> None:
    """Deja al cliente sin NINGUNA membresía activa -- el legado con claves
    compartidas, que nunca deja `ultimo_login`."""
    from app.clientes import sesion_registro
    from app.models.identidad import Membresia

    reg = sesion_registro()
    try:
        for m in reg.query(Membresia).filter(Membresia.cliente_slug == slug).all():
            m.activo = False
        reg.commit()
    finally:
        reg.close()


def _con_contratos(slug: str, cuantos: int = 1) -> None:
    """Siembra `cuantos` contratos activos hoy, sin importar la tarifa."""
    fixtures = {slug.upper(): [
        {"code": f"E-0{i}", "type": "punta", "sede": slug.upper()} for i in range(1, cuantos + 1)
    ]}
    hoy = datetime.now(timezone.utc).date()
    desde = hoy.replace(day=1).isoformat()
    contratos = [
        (f"{slug.upper()}-E-0{i}", f"Prov{i}", desde, hoy.isoformat(), 100_000.0 * i, True)
        for i in range(1, cuantos + 1)
    ]
    _sembrar(slug, fixtures, contratos)


def _pedir_adopcion(client, cab):
    r = client.get("/api/plataforma/adopcion", headers=cab)
    assert r.status_code == 200, r.text
    return r.json()


def _fila(cuerpo, slug):
    return next(c for c in cuerpo["clientes"] if c["slug"] == slug)


# ════════════════════════════════════════════════════════════════════════════
# Las cinco clasificaciones
# ════════════════════════════════════════════════════════════════════════════

def test_contratos_y_45_dias_sin_acceso_es_fantasma(client, monkeypatch):
    ids = Identidades(client)
    _fundar(ids, "uid-fan", "duena@fan.co", "fantasma1", "Fantasma Uno")
    _backdate_fundacion("fantasma1", 200)      # alta vieja: no puede ser "nueva"
    _backdate_login("duena@fan.co", 45)
    _con_contratos("fantasma1", 1)

    consola = _operador_sin_membresias(ids, monkeypatch)
    cuerpo = _pedir_adopcion(client, _cab(consola["token"]))
    fila = _fila(cuerpo, "fantasma1")

    assert fila["clasificacion"] == "fantasma"
    assert fila["con_contratos_activos"] is True
    assert fila["usuarios_activos_30d"] == 0
    assert fila["dias_sin_acceso"] == 45


def test_acceso_hace_3_dias_es_activa(client, monkeypatch):
    ids = Identidades(client)
    _fundar(ids, "uid-act", "duena@act.co", "activa1", "Activa Uno")
    _backdate_fundacion("activa1", 200)
    _backdate_login("duena@act.co", 3)
    _con_contratos("activa1", 1)   # tiene contratos Y acceso reciente: manda "activa"

    consola = _operador_sin_membresias(ids, monkeypatch)
    cuerpo = _pedir_adopcion(client, _cab(consola["token"]))
    fila = _fila(cuerpo, "activa1")

    assert fila["clasificacion"] == "activa"
    assert fila["usuarios_activos_30d"] == 1
    assert fila["dias_sin_acceso"] == 3


def test_alta_hace_10_dias_es_nueva(client, monkeypatch):
    """`nueva` manda aunque no haya accedido nunca: el alta reciente es la
    señal, no todavía una cancelación silenciosa."""
    ids = Identidades(client)
    _fundar(ids, "uid-nva", "duena@nva.co", "nueva1", "Nueva Uno")
    _backdate_fundacion("nueva1", 10)
    _backdate_login("duena@nva.co", None)   # nunca entró desde que fundó

    consola = _operador_sin_membresias(ids, monkeypatch)
    cuerpo = _pedir_adopcion(client, _cab(consola["token"]))
    fila = _fila(cuerpo, "nueva1")

    assert fila["clasificacion"] == "nueva"
    assert fila["cohorte"] is not None


def test_sin_membresias_activas_es_sin_cuentas(client, monkeypatch):
    ids = Identidades(client)
    _fundar(ids, "uid-suc", "duena@suc.co", "suc1", "Suc Uno")
    _backdate_fundacion("suc1", 200)
    _desactivar_membresias("suc1")
    _con_contratos("suc1", 1)   # ni contratos ni acceso reciente cambian esto

    consola = _operador_sin_membresias(ids, monkeypatch)
    cuerpo = _pedir_adopcion(client, _cab(consola["token"]))
    fila = _fila(cuerpo, "suc1")

    assert fila["clasificacion"] == "sin_cuentas"
    assert fila["usuarios_con_cuenta"] == 0
    assert fila["dias_sin_acceso"] is None


def test_sin_contratos_y_45_dias_sin_acceso_es_dormida(client, monkeypatch):
    ids = Identidades(client)
    _fundar(ids, "uid-dor", "duena@dor.co", "dormida1", "Dormida Uno")
    _backdate_fundacion("dormida1", 200)
    _backdate_login("duena@dor.co", 45)
    # Sin contratos: no siembra ninguno.

    consola = _operador_sin_membresias(ids, monkeypatch)
    cuerpo = _pedir_adopcion(client, _cab(consola["token"]))
    fila = _fila(cuerpo, "dormida1")

    assert fila["clasificacion"] == "dormida"
    assert fila["con_contratos_activos"] is False


# ════════════════════════════════════════════════════════════════════════════
# Cohortes y retención
# ════════════════════════════════════════════════════════════════════════════

def test_cohortes_agrupan_por_mes_de_alta_y_la_retencion_es_correcta(client, monkeypatch):
    ids = Identidades(client)
    # Dos clientes fundados el MISMO mes (hace 200 días): uno activo, uno no.
    _fundar(ids, "uid-c1", "duena@c1.co", "coh1", "Coh Uno")
    _backdate_fundacion("coh1", 200)
    _backdate_login("duena@c1.co", 3)          # activo

    _fundar(ids, "uid-c2", "duena@c2.co", "coh2", "Coh Dos")
    _backdate_fundacion("coh2", 200)
    _backdate_login("duena@c2.co", 45)         # dormido (sin contratos)

    consola = _operador_sin_membresias(ids, monkeypatch)
    cuerpo = _pedir_adopcion(client, _cab(consola["token"]))

    fila1 = _fila(cuerpo, "coh1")
    fila2 = _fila(cuerpo, "coh2")
    assert fila1["cohorte"] == fila2["cohorte"]
    cohorte_clave = fila1["cohorte"]

    cohorte = next(c for c in cuerpo["cohortes"] if c["cohorte"] == cohorte_clave)
    assert cohorte["clientes"] == 2
    assert cohorte["activa"] == 1
    assert cohorte["dormida"] == 1
    # 1 de 2 con acceso en 30d -> 50.0 %
    assert cohorte["retencion_30d_pct"] == 50.0


def test_cohortes_ascendente_y_null_al_final(client, monkeypatch):
    ids = Identidades(client)
    _fundar(ids, "uid-vie", "duena@vie.co", "viejo1", "Viejo Uno")
    _backdate_fundacion("viejo1", 400)

    _fundar(ids, "uid-rec", "duena@rec.co", "reciente1", "Reciente Uno")
    _backdate_fundacion("reciente1", 5)

    consola = _operador_sin_membresias(ids, monkeypatch)
    cuerpo = _pedir_adopcion(client, _cab(consola["token"]))

    cohortes = [c["cohorte"] for c in cuerpo["cohortes"]]
    no_nulas = [c for c in cohortes if c is not None]
    assert no_nulas == sorted(no_nulas)
    if None in cohortes:
        assert cohortes[-1] is None


# ════════════════════════════════════════════════════════════════════════════
# Cliente con la base rota
# ════════════════════════════════════════════════════════════════════════════

def test_cliente_con_base_rota_da_error_y_con_contratos_false(client, monkeypatch):
    """`roto` no tiene membresías (nunca se fundó por el alta): sale
    `sin_cuentas` de todas formas, pero con el error anotado."""
    from app.plataforma_metricas import ERROR_BASE_ILEGIBLE

    ids = Identidades(client)
    _romper()
    consola = _operador_sin_membresias(ids, monkeypatch)
    cuerpo = _pedir_adopcion(client, _cab(consola["token"]))

    fila = _fila(cuerpo, "roto")
    assert fila["error"] == ERROR_BASE_ILEGIBLE
    assert fila["con_contratos_activos"] is False


# ════════════════════════════════════════════════════════════════════════════
# Las claves exactas del contrato -- ni correos, ni nombres, ni ids
# ════════════════════════════════════════════════════════════════════════════

CLAVES_RAIZ = {"periodo", "generado_en", "cohortes", "clientes"}
CLAVES_COHORTE = {
    "cohorte", "clientes", "retencion_30d_pct", "nueva", "activa", "fantasma",
    "dormida", "sin_cuentas",
}
CLAVES_CLIENTE = {
    "slug", "nombre", "estado_cuenta", "error", "cohorte", "clasificacion",
    "usuarios_con_cuenta", "usuarios_activos_30d", "dias_sin_acceso",
    "con_contratos_activos",
}


def test_las_claves_son_exactamente_las_del_contrato(client, monkeypatch):
    ids = Identidades(client)
    _fundar(ids, "uid-k", "duena@k.co", "clavek", "Clave K")
    _backdate_fundacion("clavek", 200)
    _backdate_login("duena@k.co", 3)

    consola = _operador_sin_membresias(ids, monkeypatch)
    cuerpo = _pedir_adopcion(client, _cab(consola["token"]))

    assert set(cuerpo) == CLAVES_RAIZ
    assert cuerpo["periodo"].count("-") == 1
    assert cuerpo["generado_en"].endswith("Z")
    for cohorte in cuerpo["cohortes"]:
        assert set(cohorte) == CLAVES_COHORTE
    for fila in cuerpo["clientes"]:
        assert set(fila) == CLAVES_CLIENTE, fila["slug"]

    # Ni un correo, ni un id de usuario, en ningún string del cuerpo.
    import json
    crudo = json.dumps(cuerpo)
    assert "@" not in crudo
    assert "duena@k.co" not in crudo


# ════════════════════════════════════════════════════════════════════════════
# La puerta: 200 operador + bitácora, 401 sin token, 403 dueño con membresías
# ════════════════════════════════════════════════════════════════════════════

def test_operador_200_con_bitacora(client, monkeypatch):
    from app.clientes import sesion_registro
    from app.models.plataforma import BitacoraPlataforma

    ids = Identidades(client)
    consola = _operador_sin_membresias(ids, monkeypatch)
    cuerpo = _pedir_adopcion(client, _cab(consola["token"]))
    assert cuerpo["periodo"]

    reg = sesion_registro()
    try:
        filas = reg.query(BitacoraPlataforma).filter(BitacoraPlataforma.accion == "adopcion").all()
    finally:
        reg.close()
    assert len(filas) == 1
    assert filas[0].email == "op@recabra.co"
    assert filas[0].periodo == cuerpo["periodo"]


def test_sin_token_da_401(client):
    assert client.get("/api/plataforma/adopcion").status_code == 401


def test_dueno_con_membresias_da_403(client, monkeypatch):
    monkeypatch.setenv("OPERADOR_EMAILS", "otro@x.co")
    ids = Identidades(client)
    cab = _fundar(ids, "uid-due", "duena@due.co", "duenio", "Dueño")

    assert client.get("/api/plataforma/adopcion", headers=cab).status_code == 403
