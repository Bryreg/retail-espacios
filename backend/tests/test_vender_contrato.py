"""El guardado de Vender de una vez, todo o nada (``POST /api/contratos/vender``,
``docs/rediseno/vender-api.md`` §1, §2, §4, §5).

El plano es el de ``test_participaciones`` (NAVE): ``GON-01`` se vende por
participación (cara A y B), ``GON-02`` entera, ``NEV-03`` por puertas. «Hoy» es
el 17 de octubre de 2026 en Colombia (marca ``reloj``).

Todo ``import app.*`` va ADENTRO de las funciones (el fixture ``client`` purga
``sys.modules``).
"""
from datetime import date

from tests import test_participaciones as tp

RELOJ = tp.RELOJ
D = tp.D
NOV = {"desde": D(2026, 11, 1), "hasta": D(2026, 11, 30)}


def _pedido(*lineas, **extra):
    cuerpo = {"sede": "NAVE", "proveedor": "Lácteos del Valle", "correo": "compras@valle.co", "marca": "Yogur Valle",
              "tipo": "contrato", **NOV, "lineas": list(lineas)}
    cuerpo.update(extra)
    return cuerpo


def _entera(espacio, valor=130_000, **extra):
    return {"espacio": espacio, "valor": valor, "modo_precio": "total", "valor_tecleado": valor, **extra}


def _pct(cara, pb, valor=600_000, **extra):
    return {"participacion": {"cara": cara, "puntos_basicos": pb, "renueva": None}, "valor": valor,
            "modo_precio": "mensual", "valor_tecleado": valor, **extra}


def _vender(client, admin, cuerpo, codigo=200, validar=False):
    url = "/api/contratos/vender" + ("?validar=1" if validar else "")
    r = client.post(url, headers=admin, json=cuerpo)
    assert r.status_code == codigo, r.text
    return r.json()


def _correos(monkeypatch, client, admin):
    import app.routers.bulk_leases as bl

    enviados = []
    monkeypatch.setattr(bl, "correo_configurado", lambda: True)
    monkeypatch.setattr(bl, "send_mail_to_bg", lambda to, asunto, html: enviados.append((to, asunto, html)))
    assert client.put(
        "/api/notifications/contacts",
        json={"gerente": ["g@x.co"], "by_sede": {"NAVE": {"admin": ["a@x.co"], "mercaderista": ["m@x.co"]}}},
        headers=admin,
    ).status_code == 200
    return enviados


def _planometria(client, admin, lease_id):
    r = client.post(f"/api/leases/{lease_id}/planometria", headers=admin,
                    files={"file": ("plano.jpg", b"\xff\xd8\xff\xe0 jpg", "image/jpeg")})
    assert r.status_code == 201, r.text
    return r.json()


def _cuantos(modelo):
    db = tp._bd()
    try:
        return db.query(modelo).count()
    finally:
        db.close()


# ─── Todo de una vez ──────────────────────────────────────────────────────────

@RELOJ
def test_guarda_enteras_partes_y_porcentajes_de_una_vez(client, admin, monkeypatch):
    from app.models.models import AuditEntry, SpaceLease
    from app.models.vender import CondicionesDeContrato, MontajePendiente

    tp._plano(client, admin)
    enviados = _correos(monkeypatch, client, admin)
    cuerpo = _pedido(_entera("GON-02", 500_000, modo_precio="mensual", valor_tecleado=500_000),
                     _entera("NEV-03-PU1", 300_000),
                     _pct("GON-01", 2500, 600_000))

    assert _vender(client, admin, cuerpo, validar=True) == {"ok": True, "filas": []}
    assert _cuantos(SpaceLease) == 0, "validar no escribe nada"

    r = _vender(client, admin, cuerpo)
    assert [c["espacio"] for c in r["contratos"]] == ["NAVE-GON-02", "NAVE-NEV-03-PU1"]
    (p,) = r["participaciones"]
    assert (p["cara"], p["espacio"], p["tipo"]) == ("NAVE-GON-01", "NAVE-GON-01-PC1", "contrato")
    assert p["lease_id"] and p["reserva_id"] is None, "el contrato de un porcentaje lleva su lease_id"
    assert r["reservas"] == []

    db = tp._bd()
    try:
        assert db.query(SpaceLease).count() == 3
        assert db.get(SpaceLease, r["contratos"][0]["lease_id"]).monthly_rent == 500_000
        modos = {c.lease_id: c.modo_precio for c in db.query(CondicionesDeContrato).all()}
        assert modos == {r["contratos"][0]["lease_id"]: "mensual", r["contratos"][1]["lease_id"]: "total",
                         p["lease_id"]: "mensual"}
        acciones = sorted(a for (a,) in db.query(AuditEntry.accion).filter(
            AuditEntry.accion.in_(["contrato.alta", "participacion.contrato"])))
        assert acciones == ["contrato.alta", "contrato.alta", "participacion.contrato"]
        # El montaje de los tres espera su planometría (y el porcentaje, su zona).
        assert sorted(m.lease_id for m in db.query(MontajePendiente).all()) == sorted(
            [r["contratos"][0]["lease_id"], r["contratos"][1]["lease_id"], p["lease_id"]])
    finally:
        db.close()

    # Un solo envío: un correo por rol, con todas las filas.
    comercial = [h for to, asunto, h in enviados if to == ["g@x.co", "a@x.co"] or "contratos nuevos" in asunto]
    assert len(comercial) == 1
    assert "Valor del contrato" in comercial[0] and "Total mensual" not in comercial[0]
    assert "$ 500.000 ($ 500.000 al mes)" in comercial[0]
    assert not [1 for _to, asunto, _h in enviados if "por montar" in asunto], "salió el montaje sin planometría"
    assert r["avisos"]["montaje_pendiente"] == sorted(
        [r["contratos"][0]["lease_id"], r["contratos"][1]["lease_id"], p["lease_id"]])
    assert r["avisos"]["montaje"] == [], "el de montaje espera la planometría"


@RELOJ
def test_una_linea_mala_y_no_se_escribe_nada(client, admin):
    from app.models.models import AuditEntry, Space, SpaceLease, Supplier
    from app.models.participaciones import Participacion

    tp._plano(client, admin)
    antes_espacios = _cuantos(Space)
    r = _vender(client, admin, _pedido(_entera("GON-02"), _pct("GON-01", 2500), _entera("NEV-09")), codigo=409)
    detalle = r["detail"]
    assert detalle["code"] == "contrato_invalido"
    assert [f["indice"] for f in detalle["filas"]] == [2]
    assert "NEV-09" in detalle["filas"][0]["mensaje"]
    assert (_cuantos(SpaceLease), _cuantos(Participacion), _cuantos(Supplier)) == (0, 0, 0)
    assert _cuantos(Space) == antes_espacios
    db = tp._bd()
    try:
        assert db.query(AuditEntry).filter(AuditEntry.accion.in_(
            ["contrato.alta", "participacion.contrato"])).count() == 0
    finally:
        db.close()


@RELOJ
def test_un_error_al_escribir_hace_rollback_de_todo(client, admin, monkeypatch):
    """Todo o nada también si algo falla DESPUÉS de revisar, en la mitad de la escritura."""
    import app.services.participaciones as part
    from app.models.models import SpaceLease

    tp._plano(client, admin)

    def revienta(*a, **k):
        raise RuntimeError("se cayó la base")

    monkeypatch.setattr(part, "escribir_alta", revienta)
    try:
        client.post("/api/contratos/vender", headers=admin, json=_pedido(_entera("GON-02"), _pct("GON-01", 2500)))
    except RuntimeError:
        pass
    assert _cuantos(SpaceLease) == 0, "quedó escrita la cara entera de un pedido que falló"


@RELOJ
def test_el_pedido_entero_se_revisa_antes_de_las_lineas(client, admin):
    tp._plano(client, admin)
    sin_caduca = _vender(client, admin, _pedido(_pct("GON-01", 2500), tipo="reserva"), codigo=422)
    assert sin_caduca["detail"]["code"] == "caduca"
    mezcla = {"espacio": "GON-02", "participacion": {"cara": "GON-01", "puntos_basicos": 100}, "valor": 1}
    assert _vender(client, admin, _pedido(mezcla), codigo=422)["detail"]["code"] == "linea"
    r = _vender(client, admin, _pedido(_entera("GON-02", 0)), codigo=409)
    assert r["detail"]["filas"][0]["mensaje"] == "Falta el valor, o quedó en cero."
    # «Al mes» × meses tiene que dar el total.
    mal = _entera("GON-02", 900_000, modo_precio="mensual", valor_tecleado=500_000)
    assert _vender(client, admin, _pedido(mal), codigo=409)["detail"]["filas"][0]["code"] == "valor"
    tres_meses = _entera("GON-02", 1_500_000, modo_precio="mensual", valor_tecleado=500_000)
    _vender(client, admin, _pedido(tres_meses, desde=D(2026, 11, 1), hasta=D(2027, 1, 31)))


# ─── La capacidad de una cara ────────────────────────────────────────────────

@RELOJ
def test_dos_porcentajes_de_la_misma_cara_se_suman(client, admin):
    from app.models.participaciones import Participacion

    tp._plano(client, admin)
    r = _vender(client, admin, _pedido(_pct("GON-01", 6000), _pct("GON-01", 5000)), codigo=409)
    (fila,) = r["detail"]["filas"]
    assert (fila["indice"], fila["code"], fila["queda_pb"], fila["desde_dia"]) == (
        1, "capacidad_excedida", 4000, "2026-11-01")
    assert fila["mensaje"] == "Ya no entra el 50 %: desde el 1 nov queda 40 %."
    assert _cuantos(Participacion) == 0
    # La cara B es otra cara: no suma con la A.
    r = _vender(client, admin, _pedido(_pct("GON-01", 6000), _pct("GON-01-B", 5000), _pct("GON-01", 4000)))
    assert [p["espacio"] for p in r["participaciones"]] == ["NAVE-GON-01-PC1", "NAVE-GON-01-B-PC1",
                                                            "NAVE-GON-01-PC2"]


@RELOJ
def test_lo_que_otra_sesion_vendio_en_el_medio_lo_frena_la_revision_de_adentro(client, admin, monkeypatch):
    """Entre la revisión de afuera y el candado, otra sesión vende 30 % de la
    cara: la de adentro (después de ``expire_all``) lo ve y contesta 409 con lo
    que queda, sin nombrar a nadie."""
    import app.services.vender as vender
    from app.database import SessionLocal
    from app.models.models import SpaceLease
    from app.services import participaciones as part

    tp._plano(client, admin)
    original = vender.tomar_candados

    def otra_sesion_vende_primero(db, codigos):
        otra = SessionLocal()
        try:
            part.alta(otra, {"sede": "NAVE", "espacio": "GON-01", "tipo": "contrato", "proveedor": "Competidor SA",
                             "correo": None, "marca": "Otra", "puntos_basicos": 3000, "desde": date(2026, 11, 1),
                             "hasta": date(2026, 11, 30), "caduca": None, "valor_mensual": 1, "notas": None},
                     "otra@x.co")
            otra.commit()
        finally:
            otra.close()
        return original(db, codigos)

    monkeypatch.setattr(vender, "tomar_candados", otra_sesion_vende_primero)
    r = _vender(client, admin, _pedido(_entera("GON-02"), _pct("GON-01", 7500)), codigo=409)
    (fila,) = r["detail"]["filas"]
    assert (fila["code"], fila["queda_pb"]) == ("capacidad_excedida", 7000)
    assert fila["mensaje"] == "Ya no entra el 75 %: desde el 1 nov queda 70 %."
    assert "Competidor" not in str(r) and "30 %" not in str(r)
    assert _cuantos(SpaceLease) == 1, "sólo el de la otra sesión: GON-02 no se escribió"


@RELOJ
def test_los_candados_se_toman_una_vez_todos_juntos_y_en_orden(client, admin, monkeypatch):
    import app.services.vender as vender
    from app.services.candado import clave_de_candado, claves_de_candado

    tp._plano(client, admin)
    llamadas = []
    original = vender.tomar_candados

    def espia(db, codigos):
        codigos = set(codigos)
        llamadas.append(codigos)
        return original(db, codigos)

    monkeypatch.setattr(vender, "tomar_candados", espia)
    _vender(client, admin, _pedido(_entera("NEV-03-PU2"), _pct("GON-01", 2500), _entera("GON-02")))
    assert len(llamadas) == 1, "un solo llamado con todos los muebles"
    assert {"NAVE-NEV-03-PU2", "NAVE-GON-01", "NAVE-GON-02"} <= llamadas[0]
    # En orden y sin repetir (las dos caras de GON-01 y la parte de NEV-03 son
    # el candado de su mueble): dos pedidos con muebles cruzados no se traban.
    assert claves_de_candado(llamadas[0]) == sorted({clave_de_candado(c) for c in llamadas[0]})


# ─── Reservas de porcentaje con precio ───────────────────────────────────────

@RELOJ
def test_la_reserva_guarda_su_precio_y_confirmar_lo_usa(client, admin, monkeypatch):
    from app.models.vender import CondicionesDeContrato, PrecioDeReserva

    tp._plano(client, admin)
    enviados = _correos(monkeypatch, client, admin)
    r = _vender(client, admin, _pedido(_pct("GON-01", 2500, 900_000, modo_precio="total"), tipo="reserva",
                                       caduca=D(2026, 10, 25)))
    (p,) = r["participaciones"]
    assert p["tipo"] == "reserva" and p["reserva_id"] == p["termino_id"] and p["lease_id"] is None
    assert r["avisos"] is None and enviados == [], "una reserva no manda correos"

    t = tp._participacion(tp._cara(client, admin), 1)["terminos"][0]
    assert (t["estado"], t["valor_acordado"], t["valor_mensual"]) == ("reserva", 900_000.0, None)
    # La ocupación anónima no lleva el precio.
    assert "900000" not in client.get("/api/participaciones/ocupacion", params={"sede": "NAVE"},
                                      headers=admin).text

    c = client.post(f"/api/participaciones/{t['id']}/confirmar", headers=admin, json={"version": t["version"]})
    assert c.status_code == 200, c.text
    assert c.json()["termino"]["valor_mensual"] == 900_000.0
    assert _cuantos(PrecioDeReserva) == 0, "el precio se borra al confirmar"
    db = tp._bd()
    try:
        (cond,) = db.query(CondicionesDeContrato).all()
        assert cond.modo_precio == "total"
    finally:
        db.close()


@RELOJ
def test_por_la_ruta_de_siempre_una_reserva_sigue_sin_valor(client, admin):
    tp._plano(client, admin)
    tp._alta(client, admin, tipo="reserva", valor_mensual=100, codigo=422)


# ─── Cobro por ventas ────────────────────────────────────────────────────────

@RELOJ
def test_cobro_por_ventas_va_en_cero_y_se_dice_en_los_correos(client, admin, monkeypatch):
    from app.models.models import SpaceLease
    from app.models.vender import CobroPorVenta

    tp._plano(client, admin)
    enviados = _correos(monkeypatch, client, admin)
    ventas = {"modo": "ventas", "porcentaje": 8, "corte": "mensual"}
    r = _vender(client, admin, _pedido({"espacio": "GON-02", "valor": 0}, _pct("GON-01", 2500, 0), cobro=ventas))
    db = tp._bd()
    try:
        assert {L.monthly_rent for L in db.query(SpaceLease).all()} == {0.0}
        assert {(c.porcentaje, c.corte) for c in db.query(CobroPorVenta).all()} == {(8.0, "mensual")}
        assert db.query(CobroPorVenta).count() == 2
    finally:
        db.close()
    assert len(r["contratos"]) == 1
    (comercial,) = [h for _to, asunto, h in enviados if "contrato" in asunto]
    assert "8 % de las ventas (corte mensual)" in comercial and "$ 0" not in comercial
    # Con valor no va: lo que se cobra sale de los cortes.
    malo = _vender(client, admin, _pedido(_entera("NEV-03-PU1", 5), cobro=ventas), codigo=409)
    assert malo["detail"]["filas"][0]["code"] == "valor"
    # Una reserva también puede cobrar por ventas (decisión del dueño, 2026-10-20): sin precio.
    r = _vender(client, admin, _pedido(_pct("GON-01-B", 100, 0), cobro=ventas, tipo="reserva",
                                       caduca=D(2026, 10, 25)))
    assert r["participaciones"][0]["tipo"] == "reserva"
    sin_porcentaje = {"modo": "ventas", "corte": "mensual"}
    assert _vender(client, admin, _pedido(_entera("NEV-03-PU2", 0), cobro=sin_porcentaje),
                   codigo=422)["detail"]["code"] == "cobro"


# ─── El aviso de montaje de un porcentaje ────────────────────────────────────

@RELOJ
def test_el_montaje_de_un_porcentaje_sale_al_confirmar_la_distribucion(client, admin, monkeypatch):
    from app.models.vender import MontajePendiente

    tp._plano(client, admin)
    enviados = _correos(monkeypatch, client, admin)
    a = tp._alta(client, admin, pb=2500, correo="trade@postobon.co")["termino"]
    # Con la planometría cargada, el porcentaje todavía espera su zona.
    assert _planometria(client, admin, a["lease_id"])["aviso_de_montaje"] == {
        "estado": "espera_distribucion", "smtp_listo": False, "montaje": []}
    assert not [1 for _to, asunto, _h in enviados if "por montar" in asunto], "salió el montaje sin zona"
    assert [1 for _to, asunto, _h in enviados if "Confirmación" in asunto], "el proveedor sí recibe su constancia"
    assert _cuantos(MontajePendiente) == 1

    sup = tp._cara(client, admin)["superficie"]
    zonas = tp._zonas((a["space_id"], tp._franja(sup, 0, 0.2)))
    # Un borrador no alcanza; ni una confirmación con errores.
    tp._distribuir(client, admin, "borrador", "GON-01", 0, zonas)
    assert _cuantos(MontajePendiente) == 1
    tp._distribuir(client, admin, "confirmar", "GON-01", 1, zonas)
    (montaje,) = [(to, h) for to, asunto, h in enviados if "por montar" in asunto]
    assert montaje[0] == ["m@x.co"] and "NAVE-GON-01-PC1" in montaje[1]
    assert _cuantos(MontajePendiente) == 0, "sale una vez"
    # Confirmar de nuevo no lo repite.
    tp._distribuir(client, admin, "confirmar", "GON-01", 2, zonas)
    assert len([1 for _to, asunto, _h in enviados if "por montar" in asunto]) == 1

    # Una renovación conserva la zona: su montaje sale al cargar su planometría.
    t = tp._participacion(tp._cara(client, admin), 1)["terminos"][0]
    r = client.post(f"/api/participaciones/{t['id']}/renovar", headers=admin, json={
        "version": t["version"], "tipo": "contrato", "desde": D(2027, 2, 1), "hasta": D(2027, 2, 28),
        "valor_mensual": 1_000_000})
    assert r.status_code == 201, r.text
    assert len([1 for _to, asunto, _h in enviados if "por montar" in asunto]) == 1
    assert _cuantos(MontajePendiente) == 1
    assert _planometria(client, admin, r.json()["termino"]["lease_id"])["aviso_de_montaje"]["estado"] == "salio"
    assert len([1 for _to, asunto, _h in enviados if "por montar" in asunto]) == 2
    assert _cuantos(MontajePendiente) == 0


# ─── Completar el proveedor ──────────────────────────────────────────────────

@RELOJ
def test_completar_devuelve_un_solo_nombre_y_es_de_administracion(client, admin, worker):
    tp._plano(client, admin)
    _vender(client, admin, _pedido(_entera("GON-02"), proveedor="Lácteos del Valle"))
    _vender(client, admin, _pedido(_entera("NEV-03-PU1"), proveedor="Lácteos del Valle"))
    _vender(client, admin, _pedido(_entera("NEV-03-PU2"), proveedor="Lacteos Andinos"))

    def completar(prefijo, cab=admin):
        return client.get("/api/suppliers/completar", params={"prefijo": prefijo}, headers=cab)

    assert completar("lac").json() == {"nombre": "Lácteos del Valle"}, "el de más contratos, sin tildes"
    assert completar("LÁCTEOS A").json() == {"nombre": "Lacteos Andinos"}
    assert completar("la").json() == {"nombre": None}, "desde 3 letras"
    assert completar("zzz").json() == {"nombre": None}
    assert completar("lac", worker).status_code == 403
    assert set(completar("lac").json()) == {"nombre"}, "nunca una lista ni montos"


@RELOJ
def test_el_trabajador_no_entra_al_guardado(client, admin, worker):
    tp._plano(client, admin)
    assert client.post("/api/contratos/vender", headers=worker, json=_pedido(_entera("GON-02"))).status_code == 403


# ─── Delante del proveedor: un choque es «tomado», sea contrato o reserva ─────

@RELOJ
def test_un_choque_en_vender_se_dice_tomado_sin_decir_contrato_ni_reserva(client, admin):
    """Lo que choca se dice con UNA frase (``frase_tomada``): no distingue un
    contrato de una reserva, no nombra a nadie y las fechas van como se leen
    («1 nov», nunca ISO). La planilla (administración) sigue con la suya."""
    tp._plano(client, admin)
    _vender(client, admin, _pedido(_entera("GON-02"), _entera("NEV-03-PU1"), proveedor="Postobón"))
    _vender(client, admin, _pedido(_entera("GON-02-B"), proveedor="Postobón", tipo="reserva",
                                   caduca=D(2026, 10, 25)))

    r = _vender(client, admin, _pedido(_entera("GON-02"), _entera("NEV-03"), _entera("GON-02-B")), codigo=409)
    mensajes = [f["mensaje"] for f in r["detail"]["filas"]]
    assert mensajes == [
        "«GON-02» está tomado del 1 nov al 30 nov: ajustá las fechas.",
        "«NEV-03-PU1» está tomado del 1 nov al 30 nov: ajustá las fechas.",
        "«GON-02-B» está tomado del 1 nov al 30 nov: ajustá las fechas.",
    ], mensajes
    todo = " ".join(m for f in r["detail"]["filas"] for m in [f["mensaje"], *f.get("mensajes", [])])
    for prohibido in ("contrato", "reserv", "Postobón", "vendid", "2026-11"):
        assert prohibido not in todo, (prohibido, todo)
    # La vista previa (?validar=1) dice lo mismo.
    previa = _vender(client, admin, _pedido(_entera("GON-02")), codigo=409, validar=True)
    assert previa["detail"]["filas"][0]["mensaje"] == "«GON-02» está tomado del 1 nov al 30 nov: ajustá las fechas."
    # La planilla de administración no cambia.
    fila = tp._planilla(client, admin, "GON-02")["filas"][0]
    assert any("ya tiene un contrato" in m for m in fila["mensajes"]), fila


def test_rompe_distribucion_no_nombra_participaciones_en_vender():
    """Una renovación que rompe la distribución: en Vender, sin números de
    participación («las zonas de la participación 3 pisan las de la 2»)."""
    from fastapi import HTTPException

    from app.services.vender import _fila_de_rechazo

    e = HTTPException(409, detail={"code": "rompe_distribucion", "message":
                                   "Con esas fechas, las zonas de la participación 3 pisan las de la 2 desde el 1 nov."})
    fila = _fila_de_rechazo(0, "NAVE-GON-01", 2500, e)
    assert fila["mensaje"] == "Con esas fechas no entra: revisá la distribución en Supervisar."
    assert "participación" not in fila["mensaje"] and "problemas" not in fila
