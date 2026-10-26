"""Participaciones de cara, paso 4a: el modelo y lo que les hacen los caminos de siempre.

Las cuatro tablas nuevas (`app/models/participaciones.py`) y los ganchos que
las tocan desde caminos que ya existían (diseño 21-diseno-final.md §2, §4.6,
§5.5–§5.6, §12):

* las tablas tienen la forma que exigen la copia y el traspaso (tipos planos,
  `sqlite_autoincrement`, ninguna clave foránea a sí misma) y están
  clasificadas;
* cancelar el contrato de una participación por el camino de siempre
  (`DELETE /spaces/{id}/leases/{id}`) le pone `baja_en` y lo anota en el
  historial, salvo que ya hubiera vencido por fecha (se rotula «vencido»);
* una participación no se marca «Reservado» a mano (`PATCH …/status`);
* un proveedor con reservas provisionales no se borra (409, no el 500 de la
  clave foránea);
* borrar la sede cancela las reservas vivas, cierra los términos de los
  contratos que cierra, toma los candados de esas caras y lo avisa antes.

Las filas se siembran directo en la base: la API de participaciones es del
paso 4b. Todo `import app.*` va ADENTRO de las funciones (el fixture `client`
purga `sys.modules`). Con la marca `reloj`, «hoy» es el 17 de octubre de 2026
en Colombia.
"""
from datetime import date, datetime, timezone
from types import SimpleNamespace

import pytest

RELOJ = pytest.mark.reloj("2026-10-17T15:00:00+00:00")
OCT = lambda d: date(2026, 10, d)  # noqa: E731


def _espacio(db, codigo, sede="NAVE", nombre=None):
    from app.models.models import Space, SpaceStatus

    s = Space(code=codigo, svg_id=codigo, name=nombre or codigo, zone="gondola", sede=sede,
              area_m2=0.0, status=SpaceStatus.free)
    db.add(s)
    db.flush()
    return s


def _proveedor(db, nombre):
    from app.models.models import Supplier

    s = Supplier(name=nombre)
    db.add(s)
    db.flush()
    return s


def _lease(db, espacio, proveedor, desde, hasta):
    from app.models.models import SpaceLease

    lease = SpaceLease(space_id=espacio.id, supplier_id=proveedor.id, marca="Hit", start_date=desde,
                       end_date=hasta, monthly_rent=1_200_000, is_active=True)
    db.add(lease)
    db.flush()
    return lease


def _contrato(db, cara, pc, numero, proveedor, desde, hasta, pb=2500):
    """Un término `contrato`: proveedor, marca y fechas SÓLO en el lease."""
    from app.models.participaciones import Participacion

    lease = _lease(db, pc, proveedor, desde, hasta)
    t = Participacion(space_id=pc.id, cara_space_id=cara.id, numero=numero, estado="contrato",
                      puntos_basicos=pb, lease_id=lease.id)
    db.add(t)
    db.flush()
    return lease, t


def _reserva(db, cara, pc, numero, proveedor, desde, hasta, caduca, estado="reserva", pb=2500):
    from app.models.participaciones import Participacion

    t = Participacion(space_id=pc.id, cara_space_id=cara.id, numero=numero, estado=estado,
                      puntos_basicos=pb, supplier_id=proveedor.id, marca="Hit", desde=desde,
                      hasta=hasta, caduca=caduca)
    db.add(t)
    db.flush()
    return t


def _historial(db, **filtro):
    from app.models.participaciones import HistorialParticipacion

    return db.query(HistorialParticipacion).filter_by(**filtro).order_by(HistorialParticipacion.id).all()


# ─── La forma de las tablas ───────────────────────────────────────────────────

def test_las_cuatro_tablas_tienen_la_forma_que_aguanta_la_copia_y_el_traspaso(client):
    """Tipos planos (la copia serializa con `json.dumps`), ids que nunca se
    reutilizan, ninguna FK a sí misma (el traspaso copia sin `ORDER BY`), las
    unicidades del diseño, y las cuatro clasificadas como del supermercado."""
    from sqlalchemy import Date, DateTime, Integer, String, Text, inspect

    from app.database import Base, engine
    from app.models import participaciones as m
    from app.services.traspaso import TABLAS_DEL_CLIENTE, tablas_sin_clasificar

    nombres = ("participaciones", "distribuciones", "zonas", "historial_participaciones")
    permitidos = {Integer, String, Text, Date, DateTime}
    for nombre in nombres:
        tabla = Base.metadata.tables[nombre]
        assert tabla.dialect_options["sqlite"]["autoincrement"] is True, nombre
        for col in tabla.columns:
            # Exacto, no isinstance: `Enum` y `Boolean` heredan de los permitidos.
            assert type(col.type) in permitidos, (nombre, col.name, col.type)
            if isinstance(col.type, DateTime):
                assert col.type.timezone is True, (nombre, col.name)
            for fk in col.foreign_keys:
                assert fk.column.table is not tabla, f"{nombre}.{col.name} apunta a su propia tabla"
        assert nombre in TABLAS_DEL_CLIENTE, nombre
    assert tablas_sin_clasificar() == set()

    # `renueva_a` es un entero sin FK: la integridad la da el servicio.
    assert not m.Participacion.__table__.c.renueva_a.foreign_keys
    unicas = {
        (t.name, tuple(c.name for c in u.columns))
        for t in (m.Participacion.__table__, m.Distribucion.__table__)
        for u in t.constraints if u.__class__.__name__ == "UniqueConstraint"
    }
    assert ("participaciones", ("lease_id",)) in unicas
    assert ("distribuciones", ("cara_space_id",)) in unicas
    assert m.ESTADOS_DE_TERMINO == ("reserva", "reserva_cancelada", "contrato")
    assert m.CAPAS == ("borrador", "confirmada")
    assert m.TIPOS_DE_HISTORIAL == ("contractual", "geometria", "estado", "evento")

    # `create_all` del arranque las creó en la base del supermercado (el import
    # de `main.py`): sin él, la primera consulta sería un 500.
    assert set(nombres) <= set(inspect(engine).get_table_names())


def test_el_historial_no_acepta_montos_ni_tipos_inventados(client):
    """Nunca se purga y nunca pasa por la redacción de plata de `spaces.py`:
    una clave de plata, hasta anidada, frena antes de escribir."""
    from app.services.ciclo_participaciones import anotar_historial

    agregadas = []
    db = SimpleNamespace(add=agregadas.append)
    for malo in ({"valor_mensual": 1}, {"terminos": [{"monthly_rent": 5}]}, {"x": {"Valor": 2}}):
        with pytest.raises(ValueError, match="montos"):
            anotar_historial(db, tipo="contractual", accion="participacion.contrato", despues=malo)
    with pytest.raises(ValueError, match="Tipo"):
        anotar_historial(db, tipo="negociacion", accion="x")
    assert agregadas == []

    fila = anotar_historial(db, tipo="evento", accion="contrato.cancelado", actor="duena@super.co",
                            antes={"desde": OCT(1), "baja_en": datetime(2026, 10, 18, 2, tzinfo=timezone.utc)})
    assert agregadas == [fila]
    assert fila.antes_json == '{"baja_en": "2026-10-18T02:00:00+00:00", "desde": "2026-10-01"}'
    assert fila.despues_json is None


# ─── Una sola función de alta (D11) ───────────────────────────────────────────

@RELOJ
def test_el_alta_de_contrato_escribe_como_la_planilla(client):
    """Lo que el contrato de participación (paso 4b) va a llamar: lo mismo que
    hacía `bulk_leases.confirmar` fila por fila (sus pruebas lo fijan por la
    API; esto fija las funciones sueltas que quedan como contrato)."""
    from app.database import SessionLocal
    from app.models.models import SpaceStatus, Supplier
    from app.services.alta_de_contrato import (
        cache_de_proveedores, escribir_contrato, espacio_para, proveedor_por_nombre,
    )
    from app.services.partes import partir_codigo

    db = SessionLocal()
    try:
        viejo = Supplier(name="BIC", email="trade@bic.co")
        sin_correo = Supplier(name="Alpina")
        db.add_all([viejo, Supplier(name="Bic"), sin_correo])
        db.flush()
        cache = cache_de_proveedores(db)
        # Sin mayúsculas ni espacios; con dos que sólo difieren en mayúsculas, el más viejo.
        assert proveedor_por_nombre(db, "  bic ", "otro@bic.co", cache) is viejo
        assert viejo.email == "trade@bic.co", "pisó el correo que ya estaba"
        assert proveedor_por_nombre(db, "ALPINA", "ventas@alpina.co") is sin_correo
        assert sin_correo.email == "ventas@alpina.co"
        nuevo = proveedor_por_nombre(db, " Postobón ", None, cache)
        assert nuevo.id and nuevo.name == "Postobón" and cache["postobón"] is nuevo
        assert proveedor_por_nombre(db, "postobón", None, cache) is nuevo

        nevera = {"type": "nevera_puertas", "w": 2.07, "d": 0.7, "partes": {"puertas": 3, "division": "puertas"}}
        gondola = {"type": "gondola", "w": 0.9, "d": 4.0, "partes": {"division": "participacion"}}
        puerta = espacio_para(db, "NAVE-NEV-03-PU2", None, "NAVE", nevera, partir_codigo("NAVE-NEV-03-PU2").parte)
        assert (puerta.name, puerta.zone, puerta.area_m2, puerta.status) == (
            "NAVE-NEV-03-PU2", "nevera_puertas", round(round(2.07 * 0.7, 2) / 3, 2), SpaceStatus.free)
        pc = espacio_para(db, "NAVE-GON-01-PC1", "Góndola 1 · Participación 1 · cara A", "NAVE", gondola,
                          partir_codigo("NAVE-GON-01-PC1").parte)
        assert (pc.area_m2, pc.name, pc.sede) == (0.0, "Góndola 1 · Participación 1 · cara A", "NAVE")
        assert espacio_para(db, "NAVE-GON-01-PC1", "otro", "NAVE", gondola, None) is pc

        hoy_mismo = escribir_contrato(db, pc, nuevo, "Hit", OCT(17), date(2026, 12, 31), 1_200_000, None)
        assert hoy_mismo.id and pc.status == SpaceStatus.occupied
        futuro = escribir_contrato(db, puerta, nuevo, None, date(2026, 11, 1), date(2026, 11, 30), None, "nota")
        assert puerta.status == SpaceStatus.free and futuro.monthly_rent == 0.0 and futuro.notes == "nota"
        db.rollback()
    finally:
        db.close()


# ─── Los caminos de siempre ───────────────────────────────────────────────────

@RELOJ
def test_cancelar_el_contrato_de_una_participacion_lo_da_de_baja(client, admin):
    """El contrato de una participación se cancela por el camino de siempre y
    el término queda «cancelado» con su historia. Uno que ya venció por fecha
    (y que `expire_leases` todavía no cerró) queda «vencido»: sin `baja_en`.
    El que termina HOY todavía rige: cancelarlo es cancelarlo (el borde)."""
    from conftest import esperar_mantenimiento
    from app.database import SessionLocal
    from app.models.participaciones import Participacion

    # La pasada del arranque vence lo que terminó ayer: que no se cruce con la
    # siembra (el contrato de la PC2 tiene que llegar vivo al DELETE).
    esperar_mantenimiento()
    db = SessionLocal()
    try:
        prov = _proveedor(db, "Postobón")
        cara = _espacio(db, "NAVE-GON-01")
        pc1, pc2 = _espacio(db, "NAVE-GON-01-PC1"), _espacio(db, "NAVE-GON-01-PC2")
        pc3 = _espacio(db, "NAVE-GON-01-PC3")
        suelto = _espacio(db, "NAVE-GON-02")
        lease1, t1 = _contrato(db, cara, pc1, 1, prov, OCT(1), date(2026, 12, 31))
        lease2, t2 = _contrato(db, cara, pc2, 2, prov, date(2026, 8, 1), OCT(16))
        lease4, t3 = _contrato(db, cara, pc3, 3, prov, date(2026, 9, 1), OCT(17))
        lease3 = _lease(db, suelto, prov, OCT(1), date(2026, 12, 31))
        db.commit()
        ids = SimpleNamespace(pc1=pc1.id, pc2=pc2.id, pc3=pc3.id, cara=cara.id, suelto=suelto.id,
                              l1=lease1.id, l2=lease2.id, l3=lease3.id, l4=lease4.id, t1=t1.id, t2=t2.id,
                              t3=t3.id)
    finally:
        db.close()

    r = client.delete(f"/api/spaces/{ids.pc1}/leases/{ids.l1}", headers=admin)
    assert r.status_code == 204, r.text
    r = client.delete(f"/api/spaces/{ids.pc2}/leases/{ids.l2}", headers=admin)
    assert r.status_code == 204, r.text
    r = client.delete(f"/api/spaces/{ids.suelto}/leases/{ids.l3}", headers=admin)
    assert r.status_code == 204, r.text
    r = client.delete(f"/api/spaces/{ids.pc3}/leases/{ids.l4}", headers=admin)
    assert r.status_code == 204, r.text

    db = SessionLocal()
    try:
        t1 = db.get(Participacion, ids.t1)
        assert t1.baja_en is not None and t1.baja_por == "admin" and t1.version == 2
        assert t1.estado == "contrato"
        # La verdad sigue en el lease: el término no copió nada al cancelarse.
        assert (t1.supplier_id, t1.marca, t1.desde, t1.hasta) == (None, None, None, None)
        t2 = db.get(Participacion, ids.t2)
        assert t2.baja_en is None and t2.version == 1, "un contrato vencido por fecha quedó «cancelado»"
        t3 = db.get(Participacion, ids.t3)
        assert t3.baja_en is not None, "el que termina hoy todavía regía: quedó «vencido»"

        filas = _historial(db)
        assert [f.participacion_id for f in filas] == [ids.t1, ids.t3]
        fila = filas[0]
        assert (fila.tipo, fila.accion, fila.actor) == ("evento", "contrato.cancelado", "admin")
        assert (fila.participacion_id, fila.cara_space_id, fila.participacion_space_id) == (ids.t1, ids.cara, ids.pc1)
        assert "participación 1" in fila.detalle and "2026-10-01→2026-12-31" in fila.detalle
        assert f'"lease_id": {ids.l1}' in fila.antes_json and "1200000" not in fila.antes_json
        assert "baja_en" in fila.despues_json
    finally:
        db.close()

    # La bitácora sigue anotando lo de siempre para los cuatro.
    acciones = [l["accion"] for l in client.get("/api/bitacora/", headers=admin).json()]
    assert acciones.count("contrato.baja") == 4


def test_una_participacion_no_se_marca_a_mano_ni_se_borra_su_proveedor(client, admin):
    """«Reservado» a mano sobre una PC serían dos nociones de reserva sobre lo
    mismo; y un proveedor con reservas provisionales no se borra (en Postgres,
    la clave foránea lo hacía un 500)."""
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        prov = _proveedor(db, "Colombina")
        libre = _proveedor(db, "Sin nada")
        de_antes = _proveedor(db, "Alpina")
        cara = _espacio(db, "NAVE-GON-01")
        pc = _espacio(db, "NAVE-GON-01-PC1")
        _reserva(db, cara, pc, 1, prov, date(2026, 11, 1), date(2026, 11, 30), date(2026, 11, 30))
        # Una reserva ya cancelada también lo nombra: es historia, y la FK la frena igual.
        _reserva(db, cara, _espacio(db, "NAVE-GON-01-PC2"), 2, de_antes, date(2026, 11, 1),
                 date(2026, 11, 30), date(2026, 11, 30), estado="reserva_cancelada")
        db.commit()
        ids = SimpleNamespace(prov=prov.id, libre=libre.id, de_antes=de_antes.id, cara=cara.id, pc=pc.id)
    finally:
        db.close()

    r = client.patch(f"/api/spaces/{ids.pc}/status", json={"status": "reserved"}, headers=admin)
    assert r.status_code == 409, r.text
    assert r.json()["detail"] == (
        "Una participación no se marca a mano: su reserva provisional se hace en Vender («Reservar hasta…»).")
    assert client.get(f"/api/spaces/{ids.pc}", headers=admin).json()["status"] == "free"
    # La cara sí, como siempre.
    r = client.patch(f"/api/spaces/{ids.cara}/status", json={"status": "maintenance"}, headers=admin)
    assert r.status_code == 200, r.text

    r = client.delete(f"/api/suppliers/{ids.prov}", headers=admin)
    assert r.status_code == 409, r.text
    assert r.json()["detail"] == (
        "El proveedor tiene 1 reserva(s) provisional(es) de participación en el historial: "
        "no se puede eliminar sin perder ese historial.")
    r = client.delete(f"/api/suppliers/{ids.de_antes}", headers=admin)
    assert r.status_code == 409 and "1 reserva(s)" in r.json()["detail"], r.text
    assert client.delete(f"/api/suppliers/{ids.libre}", headers=admin).status_code == 204


@RELOJ
def test_borrar_la_sede_cancela_las_reservas_vivas_y_lo_dice_antes(client, admin, monkeypatch):
    """El archivo de la sede cierra los contratos y renombra los códigos; sin
    el gancho, las reservas provisionales quedaban vivas sobre espacios
    archivados, contando contra una cara que ya no existe. Los bordes de hoy:
    la reserva que caduca hoy y el contrato que termina hoy todavía rigen."""
    from sqlalchemy.orm import Session

    import app.services.sede_archive as archivo
    from conftest import esperar_mantenimiento
    from app.database import SessionLocal
    from app.models.participaciones import Participacion

    esperar_mantenimiento()
    db = SessionLocal()
    try:
        prov = _proveedor(db, "Postobón")
        cara = _espacio(db, "NAVE-GON-01")
        pcs = [_espacio(db, f"NAVE-GON-01-PC{n}") for n in range(1, 8)]
        viva = _reserva(db, cara, pcs[0], 1, prov, date(2026, 11, 1), date(2026, 11, 30), OCT(25))
        _, vigente = _contrato(db, cara, pcs[1], 2, prov, OCT(1), date(2026, 12, 31))
        caducada = _reserva(db, cara, pcs[2], 3, prov, date(2026, 11, 1), date(2026, 11, 30), OCT(16))
        _, vencido = _contrato(db, cara, pcs[3], 4, prov, date(2026, 8, 1), OCT(16))
        cancelada = _reserva(db, cara, pcs[4], 5, prov, date(2026, 11, 1), date(2026, 11, 30), OCT(25),
                             estado="reserva_cancelada")
        caduca_hoy = _reserva(db, cara, pcs[5], 6, prov, OCT(20), date(2026, 11, 30), OCT(17))
        _, termina_hoy = _contrato(db, cara, pcs[6], 7, prov, OCT(1), OCT(17))
        # Otra sede, con su reserva viva: no se toca ni se cuenta.
        cara_t = _espacio(db, "TERRON-GON-01", sede="TERRON")
        otra = _reserva(db, cara_t, _espacio(db, "TERRON-GON-01-PC1", sede="TERRON"), 1, prov,
                        date(2026, 11, 1), date(2026, 11, 30), OCT(25))
        db.commit()
        ids = SimpleNamespace(viva=viva.id, vigente=vigente.id, caducada=caducada.id, vencido=vencido.id,
                              cancelada=cancelada.id, otra=otra.id, caduca_hoy=caduca_hoy.id,
                              termina_hoy=termina_hoy.id)
    finally:
        db.close()

    # Lo dice ANTES: el diálogo de «Borrar sede» lee esto.
    impacto = client.get("/api/layout/NAVE/impact", headers=admin).json()
    assert impacto == {"spaces": 8, "active_leases": 3, "reservas_vivas": 2}

    # El orden: candado → flush → expire_all. El flush escribe el DELETE del
    # plano; antes del candado, en Postgres, se abrazaba con un PUT /layout que
    # ya tenía ese candado y esperaba esa fila. Sin el expire_all, lo que se
    # lee después del candado podía ser lo que la sesión tenía en memoria.
    candados, eventos = [], []
    tomar = archivo.tomar_candados

    def espia_candado(db, c):
        candados.append(set(c))
        eventos.append(("candado", set(c)))
        return tomar(db, c)

    flush, expire_all = Session.flush, Session.expire_all
    monkeypatch.setattr(archivo, "tomar_candados", espia_candado)
    monkeypatch.setattr(Session, "flush", lambda self, *a, **k: eventos.append("flush") or flush(self, *a, **k))
    monkeypatch.setattr(Session, "expire_all", lambda self: eventos.append("expire_all") or expire_all(self))
    assert client.delete("/api/layout/NAVE", headers=admin).status_code == 204
    assert candados == [{"NAVE-GON-01"}], "no tomó el candado de la cara antes de tocar sus términos"
    assert eventos[:3] == [("candado", {"NAVE-GON-01"}), "flush", "expire_all"], eventos[:4]

    db = SessionLocal()
    try:
        t = {k: db.get(Participacion, v) for k, v in vars(ids).items()}
        assert t["viva"].estado == "reserva_cancelada" and t["viva"].baja_en is not None
        assert t["viva"].version == 2
        assert t["vigente"].estado == "contrato" and t["vigente"].baja_en is not None
        assert t["vencido"].baja_en is None, "un contrato vencido por fecha quedó «cancelado»"
        assert (t["caducada"].estado, t["caducada"].baja_en) == ("reserva", None)
        assert (t["cancelada"].baja_en, t["cancelada"].version) == (None, 1)
        assert (t["otra"].estado, t["otra"].baja_en) == ("reserva", None)
        assert t["caduca_hoy"].estado == "reserva_cancelada", "la reserva que caduca hoy todavía regía"
        assert t["termina_hoy"].baja_en is not None, "el contrato que termina hoy todavía regía"

        filas = _historial(db, accion="sede.baja")
        assert [(f.tipo, f.participacion_id) for f in filas] == [
            ("evento", ids.viva), ("evento", ids.caduca_hoy), ("evento", ids.vigente), ("evento", ids.termina_hoy)]
        assert "Se borró la sede NAVE: la reserva provisional de la participación 1 se canceló." == filas[0].detalle
        assert "el contrato de la participación 2 se cerró" in filas[2].detalle
    finally:
        db.close()

    assert client.get("/api/layout/NAVE/impact", headers=admin).json() == {
        "spaces": 0, "active_leases": 0, "reservas_vivas": 0,
    }
    assert client.get("/api/layout/TERRON/impact", headers=admin).json()["reservas_vivas"] == 1

    # Una sede sin participaciones no toma candados (lo de siempre, igual), y
    # quien borra queda en `baja_por` cuando el llamador lo pasa.
    db = SessionLocal()
    try:
        _espacio(db, "SUR-GON-01", sede="SUR")
        candados.clear()
        archivo.archive_sede_spaces(db, "SUR")
        assert candados == []
        resumen = archivo.archive_sede_spaces(db, "TERRON", actor="duena@super.co")
        assert candados == [{"TERRON-GON-01"}]
        assert resumen["reservas_canceladas"] == 1
        db.commit()
        assert db.get(Participacion, ids.otra).baja_por == "duena@super.co"
    finally:
        db.close()
