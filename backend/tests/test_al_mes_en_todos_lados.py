"""El valor guardado de un contrato es el TOTAL de su plazo: donde se lee o se
escribe «al mes», se reparte o se multiplica por sus meses (2026-10-26).

· El formulario de participación de Distribución pedía «Valor mensual» y lo
  guardaba como el total: con ``al_mes`` el servidor saca el total × los meses
  y anota que se escribió al mes.
· La consola de plataforma sumaba el total de cada contrato como el ingreso de
  un mes: ahora suma lo de un mes.
· Los meses ya guardados de la serie se recalculan UNA vez, con la proporción
  «al mes / total» de los contratos de cada mes.
"""
from datetime import date, datetime, timedelta, timezone

from tests import test_participaciones as tp

RELOJ = tp.RELOJ
D = tp.D


def _lease(lease_id):
    from app.models.models import SpaceLease
    from app.models.vender import CondicionesDeContrato

    db = tp._bd()
    try:
        c = db.get(CondicionesDeContrato, lease_id)
        return db.get(SpaceLease, lease_id).monthly_rent, (c.modo_precio, c.valor_tecleado) if c else None
    finally:
        db.close()


@RELOJ
def test_la_participacion_con_al_mes_guarda_el_total_y_la_forma(client, admin):
    tp._plano(client, admin)
    # Del 1 nov al 31 ene: 3 meses. $ 400.000 al mes → $ 1.200.000.
    t = tp._alta(client, admin, valor=400_000, al_mes=True)["termino"]
    assert _lease(t["lease_id"]) == (1_200_000, ("mensual", 400_000))
    # Sin `al_mes`, el valor es el total, como siempre (Vender y la API).
    t2 = tp._alta(client, admin, espacio="GON-01", pb=1000, valor=900_000)["termino"]
    assert _lease(t2["lease_id"]) == (900_000, None)


def test_la_consola_suma_lo_de_un_mes():
    """``_contratos_activos`` devuelve lo de UN mes: 6 meses por $ 600.000 son
    $ 100.000; un contrato de un mes, su total."""
    from types import SimpleNamespace
    from unittest import mock

    from app import plataforma_metricas as pm

    filas = [("NAVE-PUN-01", "Alpina", 600_000.0, date(2026, 5, 1), date(2026, 10, 31)),
             ("NAVE-PUN-02", "Nutresa", 250_000.0, date(2026, 10, 1), date(2026, 10, 31))]
    consulta = mock.MagicMock()
    consulta.join.return_value = consulta
    consulta.filter.return_value = consulta
    consulta.all.return_value = filas
    db = SimpleNamespace(query=lambda *a, **k: consulta)
    assert pm._contratos_activos(db, date(2026, 10, 1), date(2026, 10, 31)) == [
        ("NAVE-PUN-01", "Alpina", 100_000.0), ("NAVE-PUN-02", "Nutresa", 250_000.0)]


def _sembrar_contrato(valor, desde, hasta, codigo="NAVE-PUN-01"):
    from app.models.models import Space, SpaceLease, Supplier

    db = tp._bd()
    try:
        espacio = db.query(Space).filter(Space.code == codigo).first()
        if espacio is None:
            espacio = Space(code=codigo, svg_id=f"svg-{codigo}", name=codigo, zone="Z", sede="NAVE", area_m2=1.0)
            db.add(espacio)
            db.flush()
        prov = Supplier(name=f"Prov {codigo} {valor}")
        db.add(prov)
        db.flush()
        db.add(SpaceLease(space_id=espacio.id, supplier_id=prov.id, start_date=desde, end_date=hasta,
                          monthly_rent=valor, is_active=True))
        db.commit()
    finally:
        db.close()


def _fila(slug, periodo, canon, capturado):
    from app.clientes import sesion_registro
    from app.models.plataforma import SnapshotMetricas

    reg = sesion_registro()
    try:
        reg.add(SnapshotMetricas(cliente_slug=slug, periodo=periodo, sedes_con_plano=1, espacios_comercializables=4,
                                 ocupadas=2, contratos_activos=2, canon_total=canon, usuarios=1,
                                 proveedores_json="{}", clientes_incluidos=1, origen="cierre", capturado_en=capturado))
        reg.commit()
    finally:
        reg.close()


def _canon(slug, periodo):
    from app.clientes import sesion_registro
    from app.models.plataforma import SnapshotMetricas

    reg = sesion_registro()
    try:
        return reg.query(SnapshotMetricas).filter_by(cliente_slug=slug, periodo=periodo).one().canon_total
    finally:
        reg.close()


def test_los_meses_guardados_se_recalculan_una_vez(client, admin):
    from app.clientes import sesion_registro, unico
    from app.models.plataforma import AjusteDeSnapshot
    from app.plataforma_tendencia import CONSOLIDADO_SLUG, recalcular_canon_al_mes

    slug = unico().slug
    # Julio: uno de 6 meses por $ 600.000 y uno de 1 mes por $ 300.000.
    # Guardado con la cuenta vieja: 900.000. Al mes: 100.000 + 300.000. (El
    # arranque de la app ya cerró septiembre, con la cuenta nueva.)
    _sembrar_contrato(600_000.0, date(2026, 5, 1), date(2026, 10, 31))
    _sembrar_contrato(300_000.0, date(2026, 7, 1), date(2026, 7, 31), codigo="NAVE-PUN-02")
    antes = datetime.now(timezone.utc) - timedelta(days=30)
    _fila(slug, "2026-07", 900_000.0, antes)
    _fila(CONSOLIDADO_SLUG, "2026-07", 900_000.0, antes)
    # Un mes sin contratos con qué medir: queda como estaba.
    _fila(slug, "2025-01", 50_000.0, antes)

    assert recalcular_canon_al_mes() == {"ajustadas": 3}
    assert _canon(slug, "2026-07") == 400_000.0
    assert _canon(CONSOLIDADO_SLUG, "2026-07") == 400_000.0
    assert _canon(slug, "2025-01") == 50_000.0

    # Una sola vez: otra corrida no toca nada, y lo capturado después de la
    # marca ya viene al mes.
    _fila(slug, "2026-06", 777_000.0, datetime.now(timezone.utc) + timedelta(seconds=5))
    assert recalcular_canon_al_mes() == {"ajustadas": 0}
    assert _canon(slug, "2026-07") == 400_000.0 and _canon(slug, "2026-06") == 777_000.0

    reg = sesion_registro()
    try:
        a = reg.query(AjusteDeSnapshot).filter_by(cliente_slug=slug, periodo="2026-07").one()
        assert (a.canon_antes, a.canon_despues) == (900_000.0, 400_000.0)
        assert reg.query(AjusteDeSnapshot).filter_by(cliente_slug=slug, periodo="2025-01").one().factor is None
    finally:
        reg.close()
