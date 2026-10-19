"""Renombrar una sede de verdad (participaciones fase 2 · I5, frente F1b).

Hasta acá el navegador renombraba «borrando + creando»: movía la clave local y
mandaba ``DELETE /layout/{viejo}``. El borrado archiva la sede —cierra los
contratos, cancela las reservas provisionales de participación, da de baja sus
términos, archiva los montajes— y las tarifas de ``by_sede[VIEJO]`` quedaban
huérfanas. La pantalla sólo podía avisarlo antes.

``POST /api/layout/{sede}/renombrar`` (``services/renombre_sede.py``) cambia
sólo lo que lleva el nombre escrito, en UNA transacción: los códigos con el
prefijo de la sede, la columna ``sede``, los montajes, el registro de nombres
de la renumeración, el plano (su fila, el campo ``sede`` de los muebles y los
de otros planos que decían la sede vieja), la lista de sedes y las tarifas. Lo
demás va por ``id`` y sobrevive: contratos, participaciones, zonas, historial,
fotos.

Lo que se prueba:

· con un contrato y una reserva de participación, una zona confirmada, un
  contrato entero, un montaje con foto y las tarifas de la sede: todo vivo
  bajo el nombre nuevo, sin ``baja_en`` y sin «sede.baja»;
· lo que no se puede (el nombre ya existe, un código destino tomado, otro
  equipo guardó en el medio, una sede que no existe) no escribe nada;
· «SAN» no se lleva lo de «SAN-JOSE», y el mueble del plano que dice ser de
  otra sede queda como está (también su código, aunque empiece con «SAN-»);
· una fila vacía que repite un código con otras mayúsculas se archiva en vez
  de frenar el renombre; si las dos tienen algo, se frena;
· los candados son los de los códigos viejos y los nuevos, y la ruta va antes
  que las paramétricas de un segmento.

Todo ``import app.*`` va ADENTRO de las funciones (el fixture ``client`` purga
``sys.modules``).
"""
from datetime import date, timedelta

import pytest

from app.fechas import hoy as hoy_en_colombia  # el «hoy» del negocio: Colombia

RELOJ = pytest.mark.reloj("2026-10-17T15:00:00+00:00")


def D(y, m, d) -> str:
    return date(y, m, d).isoformat()


def _mueble(code, tipo, w, d, h, cx, division="participacion", sede="NAVE", **extra):
    f = {"id": f"f-{code}", "code": code, "sede": sede, "type": tipo, "label": code,
         "cx": cx, "cz": 2, "rotY": 0, "w": w, "d": d, "h": h, "color": "#818cf8", **extra}
    if division:
        f["partes"] = {"division": division}
    return f


#: GON-01 se vende por participación; GON-02, entera.
GON_01 = _mueble("GON-01", "gondola", 0.9, 0.9, 1.8, 2, gondolaType="double")
GON_02 = _mueble("GON-02", "gondola", 0.9, 0.9, 1.8, 4, division=None, gondolaType="double")
PUN_01 = _mueble("PUN-01", "punta", 0.9, 0.4, 1.8, 6, division=None)


def _guardar(client, admin, sede, fixtures):
    r = client.put(f"/api/layout/{sede}", headers=admin, json={"fixtures": fixtures, "base_updated_at": None})
    assert r.status_code == 200, r.text
    return r.json()


def _sedes(client, admin, sedes):
    r = client.put("/api/layout/settings", headers=admin, json={"sedes": sedes, "catalog_labels": {}})
    assert r.status_code == 200, r.text


def _alta(client, admin, tipo="contrato", pb=2500, desde=D(2026, 11, 1), hasta=D(2027, 1, 31),
          proveedor="Postobón", caduca=None):
    cuerpo = {"sede": "NAVE", "espacio": "GON-01", "tipo": tipo, "proveedor": proveedor, "marca": "Hit",
              "puntos_basicos": pb, "desde": desde, "hasta": hasta}
    if tipo == "reserva":
        cuerpo["caduca"] = caduca or D(2026, 10, 25)
    else:
        cuerpo["valor_mensual"] = 1_200_000
    r = client.post("/api/participaciones/", headers=admin, json=cuerpo)
    assert r.status_code == 201, r.text
    return r.json()["termino"]


def _cara(client, admin, sede, espacio="GON-01"):
    r = client.get("/api/participaciones/cara", headers=admin, params={"sede": sede, "espacio": espacio})
    assert r.status_code == 200, r.text
    return r.json()


def _franja(sup, a, b):
    """La franja de ``a`` a ``b`` (fracciones del ancho útil, entre los
    parantes), de arriba abajo."""
    izq = max((e["u1"] for e in sup["exclusiones"] if e["por"] == "parante" and e["u0"] == 0), default=0.0)
    der = min((e["u0"] for e in sup["exclusiones"] if e["por"] == "parante" and e["u1"] == 1), default=1.0)
    u0, u1 = izq + a * (der - izq), izq + b * (der - izq)
    return [[u0, 0.0], [u1, 0.0], [u1, 1.0], [u0, 1.0]]


def _fila_a_mano(code, sede=None, *, contrato=False, proveedor="Doria"):
    """Una fila de ``spaces`` escrita directo en la base (como las dejaron los
    caminos de antes, sin la columna ``sede`` o con el código en minúsculas).
    Con ``contrato``, un lease activo colgando."""
    from app.database import SessionLocal
    from app.models.models import Space, SpaceLease, SpaceStatus, Supplier

    db = SessionLocal()
    try:
        space = Space(code=code, svg_id=code, name=code, zone="Z", sede=sede, area_m2=1.0,
                      status=SpaceStatus.free)
        db.add(space)
        db.flush()
        lease_id = None
        if contrato:
            prov = db.query(Supplier).filter_by(name=proveedor).first()
            if prov is None:
                prov = Supplier(name=proveedor)
                db.add(prov)
                db.flush()
            lease = SpaceLease(
                space_id=space.id, supplier_id=prov.id, marca="Marca",
                start_date=hoy_en_colombia() - timedelta(days=5),
                end_date=hoy_en_colombia() + timedelta(days=30),
                monthly_rent=500_000, is_active=True,
            )
            db.add(lease)
            db.flush()
            lease_id = lease.id
        db.commit()
        return space.id, lease_id
    finally:
        db.close()


#: Un PNG mínimo: un «montado» exige foto.
FOTO = {"foto": ("montaje.png", b"\x89PNG\r\n\x1a\n" + b"0" * 32, "image/png")}


def _montar(client, admin, codigo, sede):
    r = client.post("/api/mounts/", headers=admin, data={"space_code": codigo, "estado": "montado", "sede": sede},
                    files=FOTO)
    assert r.status_code == 201, r.text


def _renombrar(client, admin, sede, nuevo, base="leer"):
    if base == "leer":
        base = client.get(f"/api/layout/{sede}", headers=admin).json()["updated_at"]
    return client.post(f"/api/layout/{sede}/renombrar", headers=admin,
                       json={"nuevo": nuevo, "base_updated_at": base})


def _bd():
    from app.database import SessionLocal

    return SessionLocal()


# ─── 1 · Lo vendido sigue vivo ────────────────────────────────────────────────

@RELOJ
def test_renombrar_muda_los_codigos_y_lo_vendido_sigue_vivo(client, admin):
    from app.models.models import (
        AuditEntry, MountConfirmation, RenumeracionNombre, Space, SpaceFile, SpaceLease,
    )
    from app.models.participaciones import Participacion, Zona

    _guardar(client, admin, "NAVE", [GON_01, GON_02, PUN_01])
    # Otro plano: su góndola es de SUR, y uno de sus muebles dice ser de NAVE
    # (la «Sede» del panel, V16): ése pasa a decir el nombre nuevo.
    sur_propio = _mueble("GON-01", "gondola", 0.9, 0.9, 1.8, 2, division=None, sede="SUR", id="s-GON-01")
    sur_dice_nave = _mueble("GON-05", "gondola", 0.9, 0.9, 1.8, 6, division=None, sede="NAVE", id="s-GON-05")
    _guardar(client, admin, "SUR", [sur_propio, sur_dice_nave])
    _sedes(client, admin, ["NAVE", "SUR"])
    r = client.put("/api/layout/rates", headers=admin, json={
        "default": {"gondola": 400_000}, "by_sede": {"NAVE": {"gondola": 900_000}, "SUR": {"gondola": 500_000}}})
    assert r.status_code == 200, r.text
    r = client.put("/api/notifications/contacts", headers=admin, json={"gerente": ["g@x.co"], "by_sede": {
        "NAVE": {"admin": ["a@x.co"], "mercaderista": ["m@x.co"]}, "SUR": {"admin": ["s@x.co"], "mercaderista": []}}})
    assert r.status_code == 200, r.text

    contrato = _alta(client, admin, pb=3000, desde=D(2026, 10, 1), hasta=D(2026, 12, 31))
    reserva = _alta(client, admin, tipo="reserva", pb=2000, proveedor="Alpina")
    sup = _cara(client, admin, "NAVE")["superficie"]
    r = client.post("/api/participaciones/distribucion/confirmar", headers=admin, json={
        "sede": "NAVE", "espacio": "GON-01", "version": 0,
        "zonas": [{"participacion_space_id": contrato["space_id"], "vertices": _franja(sup, 0, 0.2)}]})
    assert r.status_code == 200, r.text
    entero, lease_entero = _fila_a_mano("NAVE-GON-02", "NAVE", contrato=True, proveedor="Colgate")
    _montar(client, admin, "NAVE-GON-02", "NAVE")
    sur, lease_sur = _fila_a_mano("SUR-GON-01", "SUR", contrato=True)
    db = _bd()
    try:
        db.add(RenumeracionNombre(sede="NAVE", fixture_id="f-GON-01", nombre_anterior="GON-09",
                                  codigo_anterior="NAVE-GON-09", codigo_nuevo="NAVE-GON-01"))
        db.commit()
        cara = db.get(Participacion, contrato["id"]).cara_space_id
        fotos = db.query(SpaceFile).filter(SpaceFile.space_id == entero).count()
        zonas = db.query(Zona).filter(Zona.participacion_space_id == contrato["space_id"]).count()
    finally:
        db.close()
    assert fotos == 1 and zonas >= 1, (fotos, zonas)
    ids = {"cara": cara, "pc1": contrato["space_id"], "pc2": reserva["space_id"], "entero": entero}

    r = _renombrar(client, admin, "NAVE", "  nave norte ")
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["sede"] == "NAVE NORTE"
    assert (out["espacios"], out["montajes"]) == (4, 1), out
    assert out["updated_at"] and out["settings_updated_at"]
    assert {f["code"] for f in out["fixtures"]} == {"GON-01", "GON-02", "PUN-01"}, "el código corto del plano cambió"
    assert {f["sede"] for f in out["fixtures"]} == {"NAVE NORTE"}
    assert any("«SUR»" in a and "NAVE NORTE" in a for a in out["avisos"]), out["avisos"]

    db = _bd()
    try:
        assert {k: db.get(Space, v).code for k, v in ids.items()} == {
            "cara": "NAVE NORTE-GON-01", "pc1": "NAVE NORTE-GON-01-PC1", "pc2": "NAVE NORTE-GON-01-PC2",
            "entero": "NAVE NORTE-GON-02"}
        assert {db.get(Space, v).sede for v in ids.values()} == {"NAVE NORTE"}
        # Lo vendido, vivo: ni baja ni cancelación ni contrato cerrado.
        assert (db.get(Participacion, contrato["id"]).estado, db.get(Participacion, contrato["id"]).baja_en) == (
            "contrato", None)
        assert (db.get(Participacion, reserva["id"]).estado, db.get(Participacion, reserva["id"]).baja_en) == (
            "reserva", None)
        assert db.get(SpaceLease, lease_entero).is_active
        assert db.query(Zona).filter(Zona.participacion_space_id == contrato["space_id"]).count() == zonas
        assert db.query(SpaceFile).filter(SpaceFile.space_id == entero).count() == fotos
        conf = db.query(MountConfirmation).one()
        assert (conf.space_code, conf.sede, conf.archivado_en) == ("NAVE NORTE-GON-02", "NAVE NORTE", None)
        assert db.query(RenumeracionNombre).one().sede == "NAVE NORTE"
        # La otra sede, intacta.
        assert (db.get(Space, sur).code, db.get(Space, sur).sede) == ("SUR-GON-01", "SUR")
        assert db.get(SpaceLease, lease_sur).is_active
        # La bitácora: el renombre, y ningún borrado.
        detalle = db.query(AuditEntry).filter_by(accion="sede.renombrar").one().detalle
        assert detalle.startswith("NAVE → NAVE NORTE · 4 espacios · 1 montajes"), detalle
        assert db.query(AuditEntry).filter_by(accion="sede.baja").count() == 0
    finally:
        db.close()

    # La cara se pide con el nombre nuevo y trae lo mismo, distribución incluida.
    b = _cara(client, admin, "NAVE NORTE")
    assert [p["codigo"] for p in b["participaciones"]] == ["NAVE NORTE-GON-01-PC1", "NAVE NORTE-GON-01-PC2"]
    assert (b["distribucion"]["estado"], b["distribucion"]["otro_mueble"]) == ("confirmada", False)
    impacto = client.get("/api/layout/NAVE NORTE/impact", headers=admin).json()
    assert (impacto["spaces"], impacto["reservas_vivas"]) == (4, 1), impacto
    # El plano viejo ya no está; la lista y las tarifas, con el nombre nuevo.
    assert client.get("/api/layout/NAVE", headers=admin).json()["fixtures"] == []
    assert client.get("/api/layout/settings", headers=admin).json()["sedes"] == ["NAVE NORTE", "SUR"]
    tarifas = client.get("/api/layout/rates", headers=admin).json()
    assert tarifas["by_sede"] == {"NAVE NORTE": {"gondola": 900_000.0}, "SUR": {"gondola": 500_000.0}}
    # La libreta de contactos de la sede también: si no, nadie de la sede recibía avisos.
    libreta = client.get("/api/notifications/contacts", headers=admin).json()
    assert libreta["by_sede"] == {"NAVE NORTE": {"admin": ["a@x.co"], "mercaderista": ["m@x.co"]},
                                  "SUR": {"admin": ["s@x.co"], "mercaderista": []}}, libreta
    assert libreta["gerente"] == ["g@x.co"]
    # El mueble de SUR que decía «NAVE» dice el nombre nuevo; el de SUR, SUR.
    otros = {f["id"]: f for f in client.get("/api/layout/SUR", headers=admin).json()["fixtures"]}
    assert (otros["s-GON-01"]["sede"], otros["s-GON-05"]["sede"]) == ("SUR", "NAVE NORTE")
    # La pantalla de la bitácora la nombra.
    assert "sede.renombrar" in client.get("/api/bitacora/acciones", headers=admin).json()


# ─── 2 · Lo que no se puede, no escribe nada ──────────────────────────────────

def test_el_renombre_que_no_se_puede_no_escribe_nada(client, admin, worker):
    from app.models.models import AuditEntry, Space

    _guardar(client, admin, "NAVE", [GON_02])
    _guardar(client, admin, "SUR", [_mueble("GON-01", "gondola", 0.9, 0.9, 1.8, 2, division=None, sede="SUR")])
    _sedes(client, admin, ["NAVE", "SUR"])
    nave, lease = _fila_a_mano("NAVE-GON-02", "NAVE", contrato=True)
    # El código al que iría GON-02 con el nombre «NORTE» ya lo tiene una fila
    # que no es de NAVE (una sede que no tiene plano ni está en la lista).
    ocupada, _ = _fila_a_mano("NORTE-GON-02", "NORTE")
    antes = client.get("/api/layout/NAVE", headers=admin).json()

    # El nombre ya existe, escrito como sea.
    r = _renombrar(client, admin, "NAVE", "sur")
    assert (r.status_code, r.json()["detail"]["code"]) == (409, "sede_existe"), r.text
    # Un código destino tomado: se frena con el motivo, sin escribir.
    r = _renombrar(client, admin, "NAVE", "norte")
    assert (r.status_code, r.json()["detail"]["code"]) == (409, "renombre_bloqueado"), r.text
    assert any("NORTE-GON-02" in m for m in r.json()["detail"]["motivos"]), r.json()["detail"]
    # Otro equipo guardó el plano en el medio.
    r = _renombrar(client, admin, "NAVE", "OESTE", base="2020-01-01T00:00:00+00:00")
    assert (r.status_code, r.json()["detail"]["code"]) == (409, "layout_conflict"), r.text
    # Vacío, el mismo nombre, una sede que no existe.
    r = _renombrar(client, admin, "NAVE", "   ")
    assert (r.status_code, r.json()["detail"]["code"]) == (422, "sede_vacia"), r.text
    r = _renombrar(client, admin, "NAVE", "nave")
    assert (r.status_code, r.json()["detail"]["code"]) == (422, "mismo_nombre"), r.text
    r = client.post("/api/layout/NO EXISTE/renombrar", headers=admin, json={"nuevo": "OTRA"})
    assert (r.status_code, r.json()["detail"]["code"]) == (404, "sede_inexistente"), r.text
    # Sólo administración.
    r = client.post("/api/layout/NAVE/renombrar", headers=worker, json={"nuevo": "OTRA"})
    assert r.status_code in (401, 403), r.text

    assert client.get("/api/layout/NAVE", headers=admin).json() == antes
    assert client.get("/api/layout/settings", headers=admin).json()["sedes"] == ["NAVE", "SUR"]
    db = _bd()
    try:
        assert (db.get(Space, nave).code, db.get(Space, nave).sede) == ("NAVE-GON-02", "NAVE")
        assert db.get(Space, ocupada).code == "NORTE-GON-02"
        assert db.query(AuditEntry).filter_by(accion="sede.renombrar").count() == 0
    finally:
        db.close()
    assert client.get(f"/api/spaces/{nave}", headers=admin).json()["active_lease"]["id"] == lease


# ─── 3 · SAN no se lleva lo de SAN-JOSE ───────────────────────────────────────

def test_renombrar_SAN_no_toca_lo_de_SAN_JOSE_ni_al_mueble_que_dice_ser_de_otra_sede(client, admin):
    """La selección es la del archivo de la sede, corregida: el prefijo cuenta
    sólo para las filas sin sede y no para las de una sede más larga."""
    from app.models.models import Space

    ajeno_en_el_plano = _mueble("GON-03", "gondola", 0.9, 0.9, 1.8, 6, division=None, sede="SAN-JOSE")
    # Su código completo es «SAN-JOSE-SAN-GON-04»: el renombre de SAN no lo cambia.
    ajeno_con_prefijo = _mueble("SAN-GON-04", "gondola", 0.9, 0.9, 1.8, 8, division=None, sede="SAN-JOSE")
    _guardar(client, admin, "SAN", [_mueble("GON-01", "gondola", 0.9, 0.9, 1.8, 2, division=None, sede="SAN"),
                                    ajeno_en_el_plano, ajeno_con_prefijo])
    _guardar(client, admin, "SAN-JOSE", [_mueble("GON-01", "gondola", 0.9, 0.9, 1.8, 2, division=None,
                                                 sede="SAN-JOSE", id="j-GON-01")])
    suyo, _ = _fila_a_mano("SAN-GON-01", "SAN", contrato=True)
    suya_sin_sede, _ = _fila_a_mano("san-imp-02")
    ajeno, _ = _fila_a_mano("SAN-JOSE-GON-01", "SAN-JOSE", contrato=True, proveedor="Colgate")
    ajena_sin_sede, _ = _fila_a_mano("SAN-JOSE-IMP-03")

    r = _renombrar(client, admin, "SAN", "Santo")
    assert r.status_code == 200, r.text
    out = r.json()
    assert (out["sede"], out["espacios"]) == ("SANTO", 2), out
    assert any("GON-03" in a and "otra sede" in a for a in out["avisos"]), out["avisos"]

    db = _bd()
    try:
        fila = lambda i: (db.get(Space, i).code, db.get(Space, i).sede)  # noqa: E731
        assert fila(suyo) == ("SANTO-GON-01", "SANTO")
        assert fila(suya_sin_sede) == ("SANTO-IMP-02", "SANTO")
        assert fila(ajeno) == ("SAN-JOSE-GON-01", "SAN-JOSE"), "el renombre de SAN tocó una fila de SAN-JOSE"
        assert fila(ajena_sin_sede) == ("SAN-JOSE-IMP-03", None), "el renombre de SAN se llevó una fila de SAN-JOSE"
    finally:
        db.close()
    plano = {f["code"]: f for f in client.get("/api/layout/SANTO", headers=admin).json()["fixtures"]}
    assert (plano["GON-01"]["sede"], plano["GON-03"]["sede"]) == ("SANTO", "SAN-JOSE")
    assert plano["SAN-GON-04"]["sede"] == "SAN-JOSE", "el renombre reescribió el código de un mueble de otra sede"
    assert len(client.get("/api/layout/SAN-JOSE", headers=admin).json()["fixtures"]) == 1


def test_la_fila_vacia_que_repite_el_codigo_con_otras_mayusculas_se_archiva(client, admin):
    """Un ``find-or-create`` de antes comparaba tal cual y dejó «nave-gon-02»
    al lado de «NAVE-GON-02». Las dos irían a «NORTE-GON-02»: la vacía se
    archiva (como en la renumeración) y la que tiene el contrato se muda. Si
    las dos tienen algo, unirlas es un arreglo a mano: se frena."""
    from app.models.models import ArchivedSpace, Space

    _guardar(client, admin, "NAVE", [GON_02])
    _sedes(client, admin, ["NAVE"])
    con_contrato, lease = _fila_a_mano("NAVE-GON-02", "NAVE", contrato=True)
    vacia, _ = _fila_a_mano("nave-gon-02", "NAVE")

    r = _renombrar(client, admin, "NAVE", "Norte")
    assert r.status_code == 200, r.text
    assert any("archivaron 1" in a and "nave-gon-02" in a for a in r.json()["avisos"]), r.json()["avisos"]
    db = _bd()
    try:
        assert db.get(Space, con_contrato).code == "NORTE-GON-02"
        assert db.get(Space, vacia).code.startswith("nave-gon-02#")
        assert db.query(ArchivedSpace).filter_by(space_id=vacia).count() == 1
    finally:
        db.close()
    assert client.get(f"/api/spaces/{con_contrato}", headers=admin).json()["active_lease"]["id"] == lease

    # Las dos con contrato: se frena, nada escrito.
    _guardar(client, admin, "SUR", [_mueble("GON-02", "gondola", 0.9, 0.9, 1.8, 4, division=None, sede="SUR")])
    a, _ = _fila_a_mano("SUR-GON-02", "SUR", contrato=True)
    b, _ = _fila_a_mano("sur-gon-02", "SUR", contrato=True, proveedor="Colgate")
    r = _renombrar(client, admin, "SUR", "OESTE")
    assert (r.status_code, r.json()["detail"]["code"]) == (409, "renombre_bloqueado"), r.text
    assert any("más de uno tiene algo" in m for m in r.json()["detail"]["motivos"]), r.json()["detail"]
    db = _bd()
    try:
        assert (db.get(Space, a).code, db.get(Space, b).code) == ("SUR-GON-02", "sur-gon-02")
    finally:
        db.close()


# ─── 4 · Candados y la ruta ───────────────────────────────────────────────────

def test_el_renombre_toma_los_candados_de_los_codigos_viejos_y_nuevos(client, admin, monkeypatch):
    """Un alta de participación de una cara sin términos todavía no tiene
    fila, pero sí mueble: los candados salen del plano, con los dos nombres, y
    después se relee la sesión (`expire_all`), como en la renumeración."""
    from sqlalchemy.orm import Session

    import app.services.renombre_sede as renombre
    from conftest import esperar_mantenimiento

    esperar_mantenimiento()
    _guardar(client, admin, "NAVE", [GON_01, GON_02])
    _fila_a_mano("NAVE-GON-02", "NAVE", contrato=True)

    eventos = []
    tomar, expire_all = renombre.tomar_candados, Session.expire_all
    monkeypatch.setattr(renombre, "tomar_candados", lambda db, c: eventos.append(("candado", set(c))) or tomar(db, c))
    monkeypatch.setattr(Session, "expire_all", lambda self: eventos.append("expire_all") or expire_all(self))
    r = _renombrar(client, admin, "NAVE", "OESTE")
    assert r.status_code == 200, r.text
    assert eventos[:2] == [
        ("candado", {"NAVE-GON-01", "NAVE-GON-02", "OESTE-GON-01", "OESTE-GON-02"}), "expire_all"], eventos[:3]


def test_la_ruta_del_renombre_va_antes_de_las_parametricas_de_un_segmento(client):
    """Dos segmentos con la cola literal: no choca con «/{sede}», y se declara
    antes, como manda la regla del router."""
    from conftest import rutas_planas
    from app.main import app

    rutas = rutas_planas(app)
    renombre = next(i for i, r in enumerate(rutas)
                    if r.path == "/api/layout/{sede}/renombrar" and "POST" in r.methods)
    for metodo in ("GET", "PUT", "DELETE"):
        param = next(i for i, r in enumerate(rutas) if r.path == "/api/layout/{sede}" and metodo in r.methods)
        assert renombre < param, metodo


def test_un_contrato_que_espera_el_candado_mientras_se_renombra_no_se_guarda(client, admin, monkeypatch):
    """El candado del contrato suelto es del CÓDIGO. Si mientras esperaba otro
    equipo renombró la sede (o renumeró), la fila ya tiene otro código y ese
    candado no serializa con quien venda el nuevo: 409 y nada escrito."""
    import app.routers.spaces as rutas
    from app.database import SessionLocal
    from app.models.models import Space

    _guardar(client, admin, "NAVE", [GON_01])
    s = client.post("/api/spaces/find-or-create", headers=admin, json={
        "code": "NAVE-GON-01", "name": "GON-01", "zone": "Z", "sede": "NAVE", "area_m2": 1}).json()
    sup = client.post("/api/suppliers/find-or-create", headers=admin, json={"name": "Postobón"}).json()

    tomar = rutas.tomar_candados

    def tomar_y_que_otro_renombre(db, codigos):
        tomar(db, codigos)
        otra = SessionLocal()
        try:
            otra.query(Space).filter(Space.id == s["id"]).update({"code": "OESTE-GON-01", "sede": "OESTE"})
            otra.commit()
        finally:
            otra.close()

    monkeypatch.setattr(rutas, "tomar_candados", tomar_y_que_otro_renombre)
    hoy = hoy_en_colombia()
    r = client.post(f"/api/spaces/{s['id']}/leases", headers=admin, json={
        "supplier_id": sup["id"], "start_date": hoy.isoformat(),
        "end_date": (hoy + timedelta(days=30)).isoformat(), "monthly_rent": 1})
    assert r.status_code == 409, r.text
    assert "cambió de código" in r.json()["detail"]
    assert client.get("/api/spaces/comercial", headers=admin).json() == {}
