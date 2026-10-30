"""Operación: lo que hace falta para que el servicio aguante solo
(auditoría P1-3, P1-5, P1-6, P1-7, P2-5, P2-6, P2-7, P2-10).

· `GET /api/health/ready` hace `SELECT 1` en el registro y da 503 si no
  contesta; `/api/health` sigue siendo liveness (P1-3).
· El logging va en líneas JSON y sin direcciones de correo (P1-3).
· `POST /api/interno/mantenimiento`: 404 sin `MANTENIMIENTO_TOKEN`, 401 con
  otro token, y corre UNA vuelta con el candado de líder (P1-5).
· Un cliente con la base rota no impide arrancar: queda degradado con 503 y
  los demás atienden (P1-6).
· El motor por defecto tiene `pool_pre_ping`, los de Postgres el
  `statement_timeout`, y `buscar()` se cachea sin quedar viejo (P1-7, P2-10).
· El sondeo no parsea el plano en cada pedido, `/spaces/comercial` no hace una
  consulta por reserva, y las respuestas grandes salen comprimidas (P2-5).
· El tamaño de la base y el de un plano grande dejan su WARNING (P2-6, P2-7).
"""
import json
import logging
import os
import threading
import time

import pytest

from tests.conftest import CLAVE_ADMIN, esperar_mantenimiento

PG = os.environ.get("DATABASE_URL_PG_PRUEBA", "")
SIN_PG = pytest.mark.skipif(not PG.startswith("postgresql"),
                            reason="el candado y el tope de consulta se prueban contra un Postgres descartable")


# ─── Health ───────────────────────────────────────────────────────────────────

def test_ready_contesta_con_el_registro_vivo(client):
    r = client.get("/api/health/ready")
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "ok"
    assert r.json()["clientes_degradados"] == 0


def test_ready_da_503_si_el_registro_no_contesta_y_health_sigue_vivo(client, monkeypatch):
    import app.main as principal

    class Caido:
        def connect(self):
            raise ConnectionError("server closed the connection unexpectedly")

    monkeypatch.setattr(principal, "engine", Caido())
    r = client.get("/api/health/ready")
    assert r.status_code == 503
    # No cuenta qué falló: es público.
    assert "server closed" not in r.text
    assert client.get("/api/health").status_code == 200


# ─── Logging ──────────────────────────────────────────────────────────────────

def test_el_log_sale_en_json_y_sin_correos(client, capsys):
    from app.observabilidad import FormatoJSON, resumen_de_destinatarios, sin_correos

    registro = logging.LogRecord("recabra.x", logging.WARNING, __file__, 1,
                                 "Correo no salió: %s", (sin_correos("rechazó a ana@alpina.com"),), None)
    linea = json.loads(FormatoJSON().format(registro))
    assert linea["level"] == "WARNING" and linea["logger"] == "recabra.x"
    assert "ana@" not in linea["message"] and "***@alpina.com" in linea["message"]
    assert resumen_de_destinatarios(["a@x.co", "b@x.co", "c@y.com"]) == "3 destinatarios (x.co, y.com)"


def test_configurar_logging_no_pisa_un_logging_ya_configurado():
    from app.observabilidad import configurar_logging

    # pytest ya puso sus handlers en el raíz: no se toca.
    raiz = logging.getLogger()
    antes = list(raiz.handlers)
    assert configurar_logging() is False
    assert raiz.handlers == antes


def test_configurar_logging_en_un_raiz_limpio_escribe_json(monkeypatch, capsys):
    import sys

    from app.observabilidad import configurar_logging

    raiz = logging.getLogger()
    guardados, nivel = list(raiz.handlers), raiz.level
    for h in guardados:
        raiz.removeHandler(h)
    try:
        assert configurar_logging() is True
        assert configurar_logging() is False  # una sola vez
        logging.getLogger("recabra.prueba").info("hola %s", "mundo")
        sys.stdout.flush()
    finally:
        for h in list(raiz.handlers):
            raiz.removeHandler(h)
        for h in guardados:
            raiz.addHandler(h)
        raiz.setLevel(nivel)
    lineas = [json.loads(l) for l in capsys.readouterr().out.splitlines() if l.startswith("{")]
    assert any(l["message"] == "hola mundo" and l["level"] == "INFO" for l in lineas), lineas


def test_sentry_no_hace_nada_sin_dsn(monkeypatch):
    from app import observabilidad

    monkeypatch.delenv("SENTRY_DSN", raising=False)
    assert observabilidad.configurar_sentry() is False


# ─── El mantenimiento desde afuera ───────────────────────────────────────────

def test_sin_token_configurado_el_endpoint_no_existe(client, monkeypatch):
    monkeypatch.delenv("MANTENIMIENTO_TOKEN", raising=False)
    r = client.post("/api/interno/mantenimiento", headers={"X-Mantenimiento-Token": "lo-que-sea"})
    assert r.status_code == 404


def test_con_otro_token_401_y_con_el_bueno_corre_una_vuelta(client, monkeypatch):
    import app.main as principal

    esperar_mantenimiento()
    monkeypatch.setenv("MANTENIMIENTO_TOKEN", "s3cr3t-del-cron")
    assert client.post("/api/interno/mantenimiento").status_code == 401
    assert client.post("/api/interno/mantenimiento",
                       headers={"X-Mantenimiento-Token": "s3cr3t-del-cro"}).status_code == 401
    vueltas = []
    original = principal._run_lease_maintenance
    monkeypatch.setattr(principal, "_run_lease_maintenance", lambda: vueltas.append(1) or original())
    r = client.post("/api/interno/mantenimiento", headers={"X-Mantenimiento-Token": "s3cr3t-del-cron"})
    assert r.status_code == 200, r.text
    cuerpo = r.json()
    assert cuerpo["corrio"] is True and cuerpo["origen"] == "cron"
    assert cuerpo["clientes"] >= 1 and cuerpo["con_falla"] == 0
    assert vueltas == [1]
    assert principal.ultimo_mantenimiento["origen"] == "cron"


def test_dos_vueltas_a_la_vez_corre_una_sola(client, monkeypatch):
    """El hilo y el cron al mismo tiempo: la segunda no hace nada."""
    import app.main as principal

    esperar_mantenimiento()
    monkeypatch.setenv("MANTENIMIENTO_TOKEN", "tok")
    adentro, soltar, vueltas = threading.Event(), threading.Event(), []

    def lenta():
        vueltas.append(1)
        adentro.set()
        soltar.wait(10)
        return {}

    monkeypatch.setattr(principal, "_run_lease_maintenance", lenta)
    hilo = threading.Thread(target=principal.correr_mantenimiento, args=("hilo",))
    hilo.start()
    assert adentro.wait(10)
    r = client.post("/api/interno/mantenimiento", headers={"X-Mantenimiento-Token": "tok"})
    soltar.set()
    hilo.join(10)
    assert r.status_code == 200 and r.json() == {"corrio": False, "motivo": "ya_corriendo"}
    assert vueltas == [1]


@pytest.mark.xdist_group("postgres")
@SIN_PG
def test_en_postgres_el_candado_es_de_la_instancia_entera(client):
    """Dos «instancias» (dos motores, dos conexiones): el advisory lock deja
    entrar a una sola, y se suelta al salir."""
    from sqlalchemy import create_engine

    from app.services import lider

    motor_a, motor_b = create_engine(PG), create_engine(PG)
    try:
        with lider.ser_lider("prueba-instancias", motor_a) as primera:
            assert primera is True
            # Otro proceso no comparte el candado local: se simula con otro nombre
            # de candado local pero el mismo advisory lock.
            lider._locales.pop("prueba-instancias", None)
            with lider.ser_lider("prueba-instancias", motor_b) as segunda:
                assert segunda is False
        lider._locales.pop("prueba-instancias", None)
        with lider.ser_lider("prueba-instancias", motor_b) as de_nuevo:
            assert de_nuevo is True
    finally:
        motor_a.dispose()
        motor_b.dispose()


# ─── Un cliente roto no tumba a los demás ─────────────────────────────────────

def test_un_cliente_con_la_base_rota_queda_degradado_y_los_demas_arrancan(monkeypatch):
    """Se funda un cliente, se le rompe la base (el archivo deja de ser SQLite)
    y se reinicia la app: arranca, el de siempre atiende, el roto da 503 con un
    mensaje claro, y health/ready lo cuenta."""
    from tests.conftest import app_de_prueba

    with app_de_prueba() as client:
        from app.clientes import crear_cliente, url_para

        crear_cliente("roto", "Roto")
        ruta = url_para("recabra_roto")[len("sqlite:///"):]
        import app.main as principal
        from app.clientes import olvidar_motores

        esperar_mantenimiento()
        olvidar_motores()
        with open(ruta, "wb") as f:
            f.write(b"esto no es una base de datos " * 100)

        # Un segundo arranque de la MISMA app contra las mismas bases.
        from fastapi.testclient import TestClient

        with TestClient(principal.app) as otra:
            from app.auth import create_token
            from app.clientes import degradados

            assert "roto" in degradados()
            r = otra.post("/api/auth/login", json={"password": CLAVE_ADMIN, "cliente": "galerias"})
            assert r.status_code == 200, r.text
            sano = {"Authorization": f"Bearer {r.json()['token']}"}
            assert otra.get("/api/spaces/comercial", headers=sano).status_code == 200
            roto = {"Authorization": f"Bearer {create_token('admin', cliente='roto')}"}
            r = otra.get("/api/spaces/comercial", headers=roto)
            assert r.status_code == 503, r.text
            assert "no está disponible" in r.json()["detail"]
            assert "sqlite" not in r.text.lower() and "database" not in r.text.lower()
            assert otra.get("/api/health/ready").json()["clientes_degradados"] == 1
            esperar_mantenimiento()


# ─── Motores y caché ──────────────────────────────────────────────────────────

def test_los_motores_de_postgres_llevan_pre_ping_y_tope_de_consulta(client, monkeypatch):
    from app.database import argumentos_de_conexion, argumentos_de_pool

    url = "postgresql://u:p@h/db"
    assert argumentos_de_pool(url) == {"pool_pre_ping": True, "pool_recycle": 1800}
    assert argumentos_de_conexion(url) == {"options": "-c statement_timeout=30000"}
    monkeypatch.setenv("STATEMENT_TIMEOUT_S", "5")
    assert argumentos_de_conexion(url) == {"options": "-c statement_timeout=5000"}
    monkeypatch.setenv("STATEMENT_TIMEOUT_S", "0")
    assert argumentos_de_conexion(url) == {}
    # SQLite: ni tope ni pre-ping; sólo lo de siempre.
    assert argumentos_de_conexion("sqlite:///x.db") == {"check_same_thread": False}
    assert argumentos_de_pool("sqlite:///x.db") == {}


@pytest.mark.xdist_group("postgres")
@SIN_PG
def test_en_postgres_el_tope_corta_la_consulta_lenta(client, monkeypatch):
    from sqlalchemy import create_engine, text
    from sqlalchemy.exc import OperationalError

    from app.database import argumentos_de_conexion

    monkeypatch.setenv("STATEMENT_TIMEOUT_S", "1")
    motor = create_engine(PG, connect_args=argumentos_de_conexion(PG))
    try:
        with motor.connect() as cx:
            assert cx.execute(text("SHOW statement_timeout")).scalar() == "1s"
            with pytest.raises(OperationalError, match="statement timeout"):
                cx.execute(text("SELECT pg_sleep(3)"))
    finally:
        motor.dispose()


def test_buscar_se_cachea_y_archivar_lo_invalida_al_instante(client):
    from app.clientes import buscar, crear_cliente, sesion_registro
    from app.models.models import ClienteRow
    import app.clientes as clientes

    crear_cliente("cacheado", "Cacheado")
    assert buscar("cacheado") is not None
    consultas = []
    original = clientes._buscar_en_el_registro
    clientes._buscar_en_el_registro = lambda slug: consultas.append(slug) or original(slug)
    try:
        for _ in range(5):
            assert buscar("cacheado") is not None
        assert consultas == [], "cada pedido volvía a consultar el registro"
        reg = sesion_registro()
        try:
            reg.query(ClienteRow).filter(ClienteRow.slug == "cacheado").first().activo = False
            reg.commit()
        finally:
            reg.close()
        assert buscar("cacheado") is None, "archivado, pero la caché lo seguía dando por activo"
    finally:
        clientes._buscar_en_el_registro = original


# ─── El sondeo y lo comercial (P2-5) ──────────────────────────────────────────

def _admin(client):
    r = client.post("/api/auth/login", json={"password": CLAVE_ADMIN})
    return {"Authorization": f"Bearer {r.json()['token']}"}


def test_revisions_no_parsea_el_plano_si_no_cambio(client, monkeypatch):
    import app.routers.layout as rl

    cab = _admin(client)
    muebles = [{"id": f"f{i}", "code": f"GON-{i:02d}", "sede": "NAVE", "type": "gondola", "label": "G",
                "cx": i, "cz": 0, "rotY": 0, "w": 1, "d": 1, "h": 1, "color": "#000"} for i in range(1, 4)]
    assert client.put("/api/layout/NAVE", json={"fixtures": muebles}, headers=cab).status_code == 200
    parseos = []
    original = rl.json.loads

    def contando(s, *a, **k):
        # Sólo los parseos del PLANO (el módulo `json` es uno solo para todos).
        if isinstance(s, str) and '"GON-01"' in s:
            parseos.append(1)
        return original(s, *a, **k)

    monkeypatch.setattr(rl.json, "loads", contando)
    primera = client.get("/api/layout/revisions", headers=cab).json()
    n = len(parseos)
    segunda = client.get("/api/layout/revisions", headers=cab).json()
    assert segunda == primera and len(parseos) == n, "el segundo sondeo volvió a parsear el plano"
    assert [r["count"] for r in primera if r["sede"] == "NAVE"] == [3]
    # Cambia el plano: el conteo sigue al día.
    assert client.put("/api/layout/NAVE", json={"fixtures": muebles[:2]}, headers=cab).status_code == 200
    tercera = client.get("/api/layout/revisions", headers=cab).json()
    assert [r["count"] for r in tercera if r["sede"] == "NAVE"] == [2]


def test_comercial_no_hace_una_consulta_por_reserva_ni_por_contrato(client):
    """Con 1 o con 6 contratos y reservas, la misma cantidad de consultas."""
    from datetime import timedelta

    from sqlalchemy import event

    from app.clientes import sesion_registro  # noqa: F401 — la app ya está arriba
    from app.database import engine
    from app.fechas import hoy
    from app.models.models import Space, SpaceLease, SpaceStatus, Supplier
    from app.models.vender import ReservaDeEspacio
    from app.database import SessionLocal

    cab = _admin(client)
    esperar_mantenimiento()

    def sembrar(n):
        db = SessionLocal()
        try:
            for i in range(n):
                p = Supplier(name=f"Prov {n}-{i}")
                s = Space(code=f"NAVE-X{n}-{i}", svg_id=f"x{n}-{i}", name="x", zone="z", sede="NAVE",
                          area_m2=1, status=SpaceStatus.occupied)
                r = Space(code=f"NAVE-R{n}-{i}", svg_id=f"r{n}-{i}", name="r", zone="z", sede="NAVE",
                          area_m2=1, status=SpaceStatus.free)
                db.add_all([p, s, r])
                db.flush()
                db.add(SpaceLease(space_id=s.id, supplier_id=p.id, start_date=hoy() - timedelta(days=1),
                                  end_date=hoy() + timedelta(days=30), monthly_rent=1000))
                # Un contrato viejo, ya vencido: es historia, no se baja.
                db.add(SpaceLease(space_id=s.id, supplier_id=p.id, start_date=hoy() - timedelta(days=90),
                                  end_date=hoy() - timedelta(days=60), monthly_rent=1, is_active=False))
                db.add(ReservaDeEspacio(space_id=r.id, supplier_id=p.id, desde=hoy(), hasta=hoy() + timedelta(days=9),
                                        caduca=hoy() + timedelta(days=3), estado="viva"))
            db.commit()
        finally:
            db.close()

    def contar():
        n = {"q": 0}

        def antes(*_a, **_k):
            n["q"] += 1

        event.listen(engine, "before_cursor_execute", antes)
        try:
            r = client.get("/api/spaces/comercial", headers=cab)
        finally:
            event.remove(engine, "before_cursor_execute", antes)
        assert r.status_code == 200, r.text
        return n["q"], r.json()

    sembrar(1)
    contar()  # el primero llena la caché del registro (`buscar`): no se cuenta
    con_uno, cuerpo = contar()
    assert cuerpo["NAVE-X1-0"]["supplierName"] == "Prov 1-0"
    assert cuerpo["NAVE-R1-0"]["reservado"] is True and cuerpo["NAVE-R1-0"]["supplierName"] == "Prov 1-0"
    sembrar(5)
    con_seis, cuerpo = contar()
    assert con_seis == con_uno, (con_uno, con_seis)
    assert cuerpo["NAVE-X5-4"]["status"] == "occupied" and cuerpo["NAVE-R5-4"]["reservado"] is True


def test_las_respuestas_grandes_salen_comprimidas(client):
    cab = _admin(client)
    muebles = [{"id": f"f{i}", "code": f"GON-{i:02d}", "sede": "NAVE", "type": "gondola", "label": "Góndola",
                "cx": i, "cz": 0, "rotY": 0, "w": 1, "d": 1, "h": 1, "color": "#000"} for i in range(1, 60)]
    assert client.put("/api/layout/NAVE", json={"fixtures": muebles}, headers=cab).status_code == 200
    r = client.get("/api/layout/", headers={**cab, "Accept-Encoding": "gzip"})
    assert r.status_code == 200
    assert r.headers.get("content-encoding") == "gzip"
    # Y las cabeceras de seguridad siguen ahí.
    assert "Content-Security-Policy" in r.headers
    chico = client.get("/api/health", headers={"Accept-Encoding": "gzip"})
    assert "content-encoding" not in chico.headers


# ─── Tamaños (P2-6, P2-7) ─────────────────────────────────────────────────────

def test_un_plano_que_pasa_la_mitad_del_tope_deja_un_warning(client, caplog):
    cab = _admin(client)
    relleno = "x" * 2000
    muebles = [{"id": f"f{i}", "code": f"GON-{i:03d}", "sede": "NAVE", "type": "gondola", "label": relleno,
                "cx": i, "cz": 0, "rotY": 0, "w": 1, "d": 1, "h": 1, "color": "#000"} for i in range(600)]
    with caplog.at_level(logging.WARNING, logger="recabra.subidas"):
        r = client.put("/api/layout/NAVE", json={"fixtures": muebles}, headers=cab)
    assert r.status_code == 200, r.text[:200]
    avisos = [x.getMessage() for x in caplog.records if x.name == "recabra.subidas"]
    assert avisos and "sede NAVE" in avisos[0] and "% del tope" in avisos[0], avisos
    caplog.clear()
    with caplog.at_level(logging.WARNING, logger="recabra.subidas"):
        client.put("/api/layout/NAVE", json={"fixtures": muebles[:3]}, headers=cab)
    assert not [x for x in caplog.records if x.name == "recabra.subidas"]


def test_la_base_cerca_de_su_cuota_deja_un_warning(client, monkeypatch, caplog):
    from app.services import tamano_de_base

    monkeypatch.setenv("CUOTA_BASE_MB", "1")  # una base de prueba pasa de 700 KB
    with caplog.at_level(logging.INFO, logger="recabra.tamano"):
        m = tamano_de_base.revisar()
    assert m["alerta"] is True and m["cuota_mb"] == 1
    assert any(x.levelno == logging.WARNING and "CUOTA_BASE_MB" in x.getMessage() for x in caplog.records)
    monkeypatch.setenv("CUOTA_BASE_MB", "100000")
    assert tamano_de_base.revisar()["alerta"] is False


def test_la_consola_ve_la_salud_de_la_plataforma(client, monkeypatch):
    """`GET /api/plataforma/salud`: sólo operadores (un admin de supermercado,
    403), y trae la base, los degradados, el último mantenimiento y la cola."""
    from types import SimpleNamespace

    from app.services.firebase_tokens import get_verificador

    cab = _admin(client)
    assert client.get("/api/plataforma/salud", headers=cab).status_code in (401, 403)

    class Verificador:
        def verificar(self, id_token):
            return SimpleNamespace(uid="uid-op", email="op@plataforma.co", email_verificado=True,
                                   proveedor="google.com", nombre=None)

    client.app.dependency_overrides[get_verificador] = lambda: Verificador()
    try:
        r = client.post("/api/clientes/alta", json={"id_token": "uid-op", "slug": "consola",
                                                    "nombre": "Consola", "acepta_politica": True})
        assert r.status_code == 200, r.text
        operadora = {"Authorization": f"Bearer {r.json()['token']}"}
        monkeypatch.setenv("OPERADOR_EMAILS", "op@plataforma.co")
        esperar_mantenimiento()
        r = client.get("/api/plataforma/salud", headers=operadora)
        assert r.status_code == 200, r.text
        cuerpo = r.json()
        assert set(cuerpo) == {"base", "clientes_degradados", "ultimo_mantenimiento", "correos_pendientes"}
        assert cuerpo["base"]["cuota_mb"] >= 1 and cuerpo["clientes_degradados"] == []
        assert cuerpo["ultimo_mantenimiento"]["origen"] == "hilo"
        assert cuerpo["correos_pendientes"] == 0
    finally:
        client.app.dependency_overrides.pop(get_verificador, None)
