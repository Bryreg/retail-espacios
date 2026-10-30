"""Plazos de conservación aplicados por el mantenimiento (auditoría
pre-lanzamiento, P2-23) y el registro de accesos sin tokens."""
import logging
from datetime import datetime, timedelta, timezone


def _hace(dias: float) -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=dias)


def test_los_plazos_se_cambian_por_variable_y_un_cero_no_vacia_nada(monkeypatch):
    from app.services import retencion

    assert retencion.dias("RETENCION_BITACORA_DIAS") == 365
    assert retencion.dias("RETENCION_BITACORA_PLATAFORMA_DIAS") == 760
    monkeypatch.setenv("RETENCION_BITACORA_DIAS", "730")
    assert retencion.dias("RETENCION_BITACORA_DIAS") == 730
    for malo in ("0", "-3", "mucho"):
        monkeypatch.setenv("RETENCION_BITACORA_DIAS", malo)
        assert retencion.dias("RETENCION_BITACORA_DIAS") == 365


def test_el_registro_purga_lo_que_no_es_prueba_de_nada(client):
    from app.clientes import sesion_registro
    from app.models.identidad import IntentoOauth
    from app.models.plataforma import AltaEnEspera, SesionCerrada
    from app.models.supresion import IntentoExport
    from app.services import retencion

    reg = sesion_registro()
    try:
        reg.add_all([
            IntentoOauth(ip="1.1.1.1", at=_hace(3)), IntentoOauth(ip="1.1.1.2", at=_hace(0.01)),
            IntentoExport(usuario_id=1, at=_hace(3)),
            AltaEnEspera(email="vieja@x.example", nombre="Vieja", slug="vieja", creado_en=_hace(120)),
            AltaEnEspera(email="nueva@x.example", nombre="Nueva", slug="nueva", creado_en=_hace(10)),
            SesionCerrada(jti="vencida", vence=_hace(1)),
            SesionCerrada(jti="viva", vence=_hace(-1)),
        ])
        reg.commit()
    finally:
        reg.close()

    hecho = retencion.purgar_registro()
    assert hecho == {"intentos": 2, "altas_en_espera": 1, "sesiones_cerradas": 1}

    reg = sesion_registro()
    try:
        assert [i.ip for i in reg.query(IntentoOauth)] == ["1.1.1.2"]
        assert [a.slug for a in reg.query(AltaEnEspera)] == ["nueva"]
        assert [s.jti for s in reg.query(SesionCerrada)] == ["viva"]
    finally:
        reg.close()


def test_la_bitacora_del_operador_cubre_la_ventana_del_reporte(client):
    """El reporte de transparencia muestra 24 meses de accesos: con el año de
    antes, la mitad de su ventana ya estaba borrada."""
    from app.clientes import sesion_registro
    from app.models.plataforma import BitacoraPlataforma
    from app.plataforma_tendencia import purgar_registro

    reg = sesion_registro()
    try:
        reg.add_all([
            BitacoraPlataforma(email="op@x.example", accion="metricas", periodo="2025-01", en=_hace(400)),
            BitacoraPlataforma(email="op@x.example", accion="metricas", periodo="2024-01", en=_hace(800)),
        ])
        reg.commit()
    finally:
        reg.close()

    purgar_registro()

    reg = sesion_registro()
    try:
        assert sorted(f.periodo for f in reg.query(BitacoraPlataforma).filter(
            BitacoraPlataforma.email == "op@x.example")) == ["2025-01"]
    finally:
        reg.close()


def test_el_cliente_purga_bitacora_e_intentos_con_sus_plazos(client, monkeypatch):
    from app.clientes import buscar, sesion_de
    from app.models.models import AuditEntry, LoginAttempt
    from app.services import retencion
    from app.services.bitacora import purgar

    db = sesion_de(buscar("galerias"))
    try:
        db.add_all([
            AuditEntry(at=_hace(200), rol="admin", ip="x", accion="plano.guardado"),
            AuditEntry(at=_hace(20), rol="admin", ip="x", accion="plano.guardado"),
            LoginAttempt(ip="2.2.2.2", at=_hace(5)),
        ])
        db.commit()
        monkeypatch.setenv("RETENCION_BITACORA_DIAS", "100")
        assert purgar(db, retencion.dias("RETENCION_BITACORA_DIAS")) >= 1
        assert retencion.purgar_cliente(db) == {"intentos_de_login": 1}
        assert db.query(AuditEntry).filter(AuditEntry.at < _hace(100)).count() == 0
        assert db.query(AuditEntry).filter(AuditEntry.accion == "plano.guardado").count() == 1
    finally:
        db.close()


def test_el_mantenimiento_corre_la_purga_del_registro(client):
    from conftest import esperar_mantenimiento

    import app.main as main

    esperar_mantenimiento()
    resumen = main.correr_mantenimiento("prueba")
    assert resumen["corrio"] is True
    assert set(resumen["retencion_registro"]) == {"intentos", "altas_en_espera", "sesiones_cerradas"}


def test_el_registro_de_accesos_no_guarda_tokens_ni_correos():
    from app.observabilidad import SinTokensEnLaRuta, sin_tokens

    assert sin_tokens("/?montar=NAVE-PUN-01&t=eyJhbGciOi.xx.yy") == "/?montar=NAVE-PUN-01&t=***"
    assert sin_tokens("/api/files/3?token=abc&x=1") == "/api/files/3?token=***&x=1"
    assert "ana@" not in sin_tokens("/algo?de=ana@acme.example")

    registro = logging.LogRecord("uvicorn.access", logging.INFO, __file__, 1,
                                 '%s - "%s %s HTTP/%s" %d',
                                 ("1.2.3.4:5", "GET", "/?guia=7&t=secreto", "1.1", 200), None)
    assert SinTokensEnLaRuta().filter(registro) is True
    assert "secreto" not in registro.getMessage()
    assert "t=***" in registro.getMessage()


def test_el_log_json_tacha_los_correos_tambien_en_la_traza():
    from app.observabilidad import FormatoJSON

    try:
        raise RuntimeError("rechazado: ana@acme.example no existe")
    except RuntimeError:
        import sys

        registro = logging.LogRecord("x", logging.ERROR, __file__, 1, "para %s", ("b@c.example",), sys.exc_info())
    linea = FormatoJSON().format(registro)
    assert "@acme.example" in linea and "ana@" not in linea
    assert "b@" not in linea
