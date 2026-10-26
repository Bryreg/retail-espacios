"""Vender por partes, paso 2: tramos y entrepaños.

La dueña: el mural, la góndola (central o de pared), la nevera abierta y la de
vegetales se venden enteros o POR TRAMOS (``GON-05-B-TR2``: el tramo 2 de la
cara B, de izquierda a derecha mirando esa cara); la góndola y la punta,
enteras o POR ENTREPAÑOS (``PUN-02-EN1`` es la base: «cada repisa con proveedor
y precio por entrepaño, pero siempre dejando la opción de vender toda la
cara»). Un mueble se divide de UNA sola forma; la cara entera y sus partes
nunca en fechas que se pisen; dos partes distintas, sí.

Es la misma maquinaria que la nevera por puertas (``test_partes_venta.py``):
acá se prueba lo que cambia con las clases nuevas —la cuenta de los
entrepaños con la base, la cara B, la forma única, el guardado del plano, la
tarifa, el área, los espacios internos y la mercaderista—.
"""
from tests import sin_planilla  # las partes: la revisión común, sin las reglas de la planilla
from datetime import timedelta

import pytest

from app.fechas import hoy as hoy_en_colombia  # el «hoy» del negocio: Colombia

HOY = hoy_en_colombia()


def _d(dias: int) -> str:
    return (HOY + timedelta(days=dias)).isoformat()


def _gondola(code="GON-05", tipo="double", division="tramos", tramos=3, entrepanos=None, **extra):
    partes = {}
    if tramos is not None:
        partes["tramos"] = tramos
    if division is not None:
        partes["division"] = division
    f = {
        "id": f"f-{code}", "code": code, "sede": "NAVE", "type": "gondola", "gondolaType": tipo,
        "label": "Góndola", "cx": 4, "cz": 2, "rotY": 0, "w": 3.75, "d": 0.9, "h": 2.0, "color": "#6366f1",
        "partes": partes, **extra,
    }
    if entrepanos is not None:
        f["entrepanos"] = entrepanos
    return f


def _punta(code="PUN-02", entrepanos=3, division="entrepanos"):
    return {
        "id": f"f-{code}", "code": code, "sede": "NAVE", "type": "punta", "label": "Punta",
        "cx": 8, "cz": 2, "rotY": 0, "w": 0.9, "d": 0.4, "h": 1.8, "color": "#7c3aed",
        "entrepanos": entrepanos, "partes": {"division": division},
    }


def _multideck(code="BEB-01", tramos=2):
    return {
        "id": f"f-{code}", "code": code, "sede": "NAVE", "type": "nevera_refrescos", "label": "Nevera Refrescos",
        "cx": 12, "cz": 2, "rotY": 0, "w": 2.5, "d": 0.8, "h": 2.0, "color": "#1e293b",
        "partes": {"tramos": tramos, "division": "tramos"},
    }


def _plano(client, admin, fixtures):
    r = client.put("/api/layout/NAVE", headers=admin, json={"fixtures": fixtures, "base_updated_at": None})
    assert r.status_code == 200, r.text


def _guardar(client, admin, fixtures):
    return client.put("/api/layout/NAVE", headers=admin, json={"fixtures": fixtures, "base_updated_at": None})


def _fila(espacio, desde=1, hasta=30, proveedor="Alpina", valor=350_000, fila=1):
    return {"fila": fila, "espacio": espacio, "sede": "NAVE", "proveedor": proveedor,
            "valor": valor, "desde": _d(desde), "hasta": _d(hasta)}


def _validar(client, admin, *filas):
    r = sin_planilla.post("/api/leases/bulk/validar", json={"sede": "NAVE", "filas": list(filas)})
    assert r.status_code == 200, r.text
    return r.json()["filas"]


def _confirmar(client, admin, *filas):
    r = sin_planilla.post("/api/leases/bulk/confirmar", json={"sede": "NAVE", "filas": list(filas)})
    assert r.status_code == 200, r.text
    return r.json()["filas"]


def _vendido(client, admin, espacio, **kw):
    f = _confirmar(client, admin, _fila(espacio, **kw))[0]
    assert f["lease_id"] is not None, f
    return f


# ─── Tramos ───────────────────────────────────────────────────────────────────

def test_un_tramo_de_la_cara_b_frena_la_b_entera_y_no_toca_la_a(client, admin):
    _plano(client, admin, [_gondola()])
    _vendido(client, admin, "GON-05-B-TR2", desde=1, hasta=30)
    f = _validar(client, admin, _fila("GON-05-B", desde=10, hasta=40, proveedor="Colanta"))[0]
    assert f["estado"] == "error", f
    texto = " ".join(f["mensajes"])
    assert "NAVE-GON-05-B-TR2" in texto and "no se vende entera" in texto, texto
    assert "vendido" in texto and "los otros tramos" in texto, texto  # dicho bien: el tramo
    assert "Alpina" not in texto, texto
    # La cara A entera se vende en esas mismas fechas: es otra cara.
    assert _validar(client, admin, _fila("GON-05", desde=10, hasta=40, proveedor="Colanta"))[0]["estado"] != "error"


def test_dos_tramos_distintos_conviven_y_la_entera_tapa_todos(client, admin):
    _plano(client, admin, [_gondola(tipo="wall", code="GON-12")])
    f = _confirmar(client, admin, _fila("GON-12-TR1"), _fila("GON-12-TR3", fila=2, proveedor="Colanta"))
    assert all(x["lease_id"] for x in f), f
    _plano(client, admin, [_gondola(tipo="wall", code="GON-12"), _gondola(tipo="wall", code="GON-13", cx=9)])
    _vendido(client, admin, "GON-13", desde=1, hasta=30)
    for k in (1, 2, 3):
        f = _validar(client, admin, _fila(f"GON-13-TR{k}", desde=30, hasta=40))[0]
        assert f["estado"] == "error" and "está vendida entera" in " ".join(f["mensajes"]), f


def test_la_numeracion_y_el_texto_del_tramo(client, admin):
    _plano(client, admin, [_gondola()])
    f = _vendido(client, admin, "GON-05-B-TR3")
    assert f["codigo"] == "NAVE-GON-05-B-TR3"
    assert f["nombre"] == "Góndola · Tramo 3"
    assert f["parte"] == "Tramo 3 de 3, contando de izquierda a derecha mirando el frente"


def test_un_tramo_de_mas_y_la_cara_b_de_un_mural(client, admin):
    _plano(client, admin, [_gondola(), _gondola(tipo="wall", code="GON-12", cx=9)])
    f = _validar(client, admin, _fila("GON-05-TR4"))[0]
    assert f["estado"] == "error" and "tiene 3 tramos: no hay TR4" in " ".join(f["mensajes"]), f
    f = _validar(client, admin, _fila("GON-12-B-TR1"))[0]
    assert f["estado"] == "error" and "una sola cara" in " ".join(f["mensajes"]), f


def test_la_nevera_abierta_por_tramos_y_su_area(client, admin):
    _plano(client, admin, [_multideck()])
    _vendido(client, admin, "BEB-01-TR2")
    assert _validar(client, admin, _fila("BEB-01"))[0]["estado"] == "error"
    assert _validar(client, admin, _fila("BEB-01-TR1"))[0]["estado"] != "error"
    from app.database import SessionLocal
    from app.models.models import Space
    db = SessionLocal()
    try:
        s = db.query(Space).filter(Space.code == "NAVE-BEB-01-TR2").one()
        # Un tramo ocupa su parte del frente: la huella entre los tramos.
        assert s.area_m2 == pytest.approx(round(2.5 * 0.8 / 2, 2))
    finally:
        db.close()


def test_la_tarifa_del_tramo_y_su_respaldo(client, admin):
    _plano(client, admin, [_gondola()])
    client.put("/api/layout/rates", headers=admin, json={"default": {"gondola": 600_000}, "by_sede": {}})
    assert _validar(client, admin, _fila("GON-05-B-TR2"))[0]["referencia"] == 200_000
    client.put("/api/layout/rates", headers=admin,
               json={"default": {"gondola": 600_000, "parte_tramo": 250_000}, "by_sede": {}})
    assert _validar(client, admin, _fila("GON-05-TR1"))[0]["referencia"] == 250_000
    # La de la puerta no es la del tramo.
    client.put("/api/layout/rates", headers=admin,
               json={"default": {"gondola": 600_000, "parte_puerta": 90_000}, "by_sede": {}})
    assert _validar(client, admin, _fila("GON-05-TR1"))[0]["referencia"] == 200_000


# ─── Entrepaños ───────────────────────────────────────────────────────────────

def test_por_entrepanos_la_base_es_el_1_y_cuenta(client, admin):
    _plano(client, admin, [_gondola(division="entrepanos", tramos=None, entrepanos=4)])
    f = _vendido(client, admin, "GON-05-EN1")
    assert f["parte"] == "Entrepaño 1 de 5, contando de abajo hacia arriba (el 1 es la base)", f
    # Cinco: la base y los cuatro entrepaños; no hay sexto.
    assert _validar(client, admin, _fila("GON-05-EN5"))[0]["estado"] != "error"
    f = _validar(client, admin, _fila("GON-05-EN6"))[0]
    assert f["estado"] == "error" and "no hay EN6" in " ".join(f["mensajes"]), f


def test_dos_entrepanos_conviven_la_cara_no(client, admin):
    _plano(client, admin, [_punta()])
    f = _confirmar(client, admin, _fila("PUN-02-EN2"), _fila("PUN-02-EN3", fila=2, proveedor="Colanta"))
    assert all(x["lease_id"] for x in f), f
    f = _validar(client, admin, _fila("PUN-02", proveedor="Nutresa"))[0]
    assert f["estado"] == "error", f
    texto = " ".join(f["mensajes"])
    assert "no se vende entera" in texto and "los otros entrepaños" in texto, texto
    assert "Alpina" not in texto and "Colanta" not in texto, texto


def test_el_entrepano_no_tiene_huella_propia(client, admin):
    _plano(client, admin, [_punta()])
    _vendido(client, admin, "PUN-02-EN1")
    from app.database import SessionLocal
    from app.models.models import Space
    db = SessionLocal()
    try:
        assert db.query(Space).filter(Space.code == "NAVE-PUN-02-EN1").one().area_m2 == 0
    finally:
        db.close()


def test_la_tarifa_del_entrepano_con_la_base(client, admin):
    _plano(client, admin, [_gondola(division="entrepanos", tramos=None, entrepanos=4)])
    client.put("/api/layout/rates", headers=admin, json={"default": {"gondola": 1_000_000}, "by_sede": {}})
    assert _validar(client, admin, _fila("GON-05-EN1"))[0]["referencia"] == 200_000


# ─── Una sola forma de dividir ────────────────────────────────────────────────

def test_una_gondola_por_entrepanos_no_vende_tramos(client, admin):
    """Tiene los tramos dibujados, pero se vende por entrepaños: los tramos
    sólo dibujan. Y la frase dice qué pasa, no «se vende entera»."""
    _plano(client, admin, [_gondola(division="entrepanos", tramos=3, entrepanos=4)])
    f = _validar(client, admin, _fila("GON-05-TR2"))[0]
    assert f["estado"] == "error", f
    texto = " ".join(f["mensajes"])
    assert "se vende por entrepaños" in texto and "una sola forma" in texto, texto


def test_una_punta_no_se_vende_por_tramos(client, admin):
    _plano(client, admin, [_punta()])
    f = _validar(client, admin, _fila("PUN-02-TR1"))[0]
    assert f["estado"] == "error" and "no se vende por tramos" in " ".join(f["mensajes"]), f


def test_por_tramos_sin_fijar_cuantos_dice_donde_fijarlos(client, admin):
    """La ficha de una góndola dice «por tramos» sin la cantidad (es un
    módulo): hasta fijarla en el panel del plano se vende entera."""
    _plano(client, admin, [_gondola(tramos=None)])
    f = _validar(client, admin, _fila("GON-05-TR1"))[0]
    assert f["estado"] == "error" and "no tiene fijado cuántos" in " ".join(f["mensajes"]), f
    assert _validar(client, admin, _fila("GON-05"))[0]["estado"] != "error"


def test_un_tramo_y_un_entrepano_vendidos_de_antes_chocan(client, admin):
    """Una restauración o un script podrían dejar contratos de las dos formas
    en la misma cara: se pisan físicamente, y la regla es por los códigos."""
    _plano(client, admin, [_gondola()])
    _vendido(client, admin, "GON-05-TR2")
    from app.database import SessionLocal
    from app.services.layout_lookup import contratos_que_chocan
    db = SessionLocal()
    try:
        choques = contratos_que_chocan(db, "NAVE-GON-05-EN3", HOY + timedelta(days=5), HOY + timedelta(days=6))
        assert [s.code for _l, s, _p in choques] == ["NAVE-GON-05-TR2"]
        # La cara B no se pisa con la A.
        assert contratos_que_chocan(db, "NAVE-GON-05-B-EN3", HOY + timedelta(days=5), HOY + timedelta(days=6)) == []
    finally:
        db.close()


def test_las_frases_del_choque_concuerdan_y_no_nombran_a_nadie():
    """Vender lee estas frases en vivo, delante del proveedor: «la puerta 2
    está vendida», «el tramo 2 está vendido» (el género sale del catálogo), y
    un tramo contra un entrepaño dice por qué se pisan: un mueble se divide de
    una sola forma."""
    from types import SimpleNamespace

    from app.services.layout_lookup import frase_de_choque
    lease = SimpleNamespace(start_date="2026-10-01", end_date="2026-10-30", supplier_name="Alpina")
    puerta = frase_de_choque("NAVE-NEV-03", "NAVE-NEV-03-PU2", lease)
    assert "está vendida" in puerta and "las otras puertas, sí" in puerta, puerta
    tramo = frase_de_choque("NAVE-GON-05", "NAVE-GON-05-TR2", lease)
    assert "está vendido" in tramo and "los otros tramos, sí" in tramo, tramo
    cruce = frase_de_choque("NAVE-GON-05-EN3", "NAVE-GON-05-TR2", lease)
    assert "está vendido" in cruce and "un mueble se divide de una sola forma" in cruce, cruce
    assert not any("Alpina" in f for f in (puerta, tramo, cruce))


# ─── El guardado del plano ────────────────────────────────────────────────────

def test_con_un_tramo_vendido_no_se_cambian_los_tramos(client, admin):
    _plano(client, admin, [_gondola()])
    _vendido(client, admin, "GON-05-TR2")
    r = _guardar(client, admin, [_gondola(tramos=4)])
    assert r.status_code == 409, r.text
    d = r.json()["detail"]
    assert d["code"] == "partes_vendidas"
    assert "de 3 a 4 tramos" in d["choques"][0] and "un tramo vendido" in d["choques"][0], d
    # Estirarla sí: los tramos se estiran parejo y ninguno cambia de lugar.
    assert _guardar(client, admin, [_gondola(w=4.5)]).status_code == 200


def test_con_un_tramo_vendido_no_se_pasa_a_entrepanos(client, admin):
    _plano(client, admin, [_gondola()])
    _vendido(client, admin, "GON-05-TR2")
    r = _guardar(client, admin, [_gondola(division="entrepanos", entrepanos=4)])
    assert r.status_code == 409, r.text
    assert r.json()["detail"]["code"] in ("contratos_vivos", "partes_vendidas"), r.text


def test_con_un_entrepano_vendido_no_cambian_los_entrepanos_y_el_alto_si(client, admin):
    _plano(client, admin, [_gondola(division="entrepanos", tramos=None, entrepanos=4)])
    _vendido(client, admin, "GON-05-EN2")
    r = _guardar(client, admin, [_gondola(division="entrepanos", tramos=None, entrepanos=5)])
    assert r.status_code == 409 and r.json()["detail"]["code"] == "partes_vendidas", r.text
    assert "de 5 a 6 entrepaños (contando la base)" in r.json()["detail"]["choques"][0], r.text
    # Vaciarlos deja de venderla por entrepaños: el EN2 desaparece.
    # (con `null`, que es como el navegador dice «ya no está»; ausente, el
    # servidor los rellena con los guardados)
    sin = _gondola(division="entrepanos", tramos=None)
    sin["entrepanos"] = None
    r = _guardar(client, admin, [sin])
    assert r.status_code == 409, r.text
    # El alto no cambia la cuenta: se guarda (el panel avisa antes).
    assert _guardar(client, admin, [_gondola(division="entrepanos", tramos=None, entrepanos=4, h=2.2)]).status_code == 200


def test_una_pestana_vieja_no_borra_los_tramos(client, admin):
    """Una pestaña con el código de antes arma `partes` sin `tramos`: el
    servidor se los deja (y un `null` los borra)."""
    _plano(client, admin, [_gondola()])
    vieja = _gondola()
    vieja["partes"] = {"division": "tramos"}
    assert _guardar(client, admin, [vieja]).status_code == 200
    guardado = client.get("/api/layout/NAVE", headers=admin).json()["fixtures"][0]
    assert guardado["partes"] == {"tramos": 3, "division": "tramos"}, guardado


# ─── Los espacios internos y la mercaderista ──────────────────────────────────

def test_la_planilla_avisa_los_espacios_internos_vendidos_de_un_mueble_por_partes(client, admin):
    slots = [{"id": "s1", "x": 0, "w": 0.5, "y": 0, "h": 0.5, "status": "occupied", "supplierName": "X",
              "brandCategory": "", "negotiatedValue": 0, "startDate": "", "endDate": "", "observation": ""}]
    _plano(client, admin, [_gondola(slots=slots)])
    f = _validar(client, admin, _fila("GON-05-TR1"))[0]
    assert f["estado"] == "aviso", f
    assert any("espacio interno" in m for m in f["mensajes"]), f
    # La cara entera, como siempre (sin el aviso nuevo).
    f = _validar(client, admin, _fila("GON-05-B"))[0]
    assert not any("espacio interno" in m for m in f["mensajes"]), f


def test_el_enlace_de_montaje_de_un_entrepano_dice_cual_desde_abajo(client, admin):
    from app.auth import create_mount_token

    _plano(client, admin, [_punta()])
    _vendido(client, admin, "PUN-02-EN1", desde=0, hasta=30)
    r = client.get("/api/montaje/mi-espacio",
                   headers={"Authorization": f"Bearer {create_mount_token('NAVE-PUN-02-EN1', days=30)}"})
    assert r.status_code == 200, r.text
    b = r.json()
    assert b["corto"] == "PUN-02-EN1" and b["fixture_code"] == "PUN-02"
    assert b["parte"] == {
        "token": "EN", "n": 1, "de": 4,
        "texto": "Entrepaño 1 de 4, contando de abajo hacia arriba (el 1 es la base)",
    }, b["parte"]
    assert "350" not in r.text, "la plata llegó al enlace de montaje"


def test_el_enlace_de_montaje_lleva_los_tramos_tipados(client, admin):
    from app.auth import create_mount_token

    _plano(client, admin, [_gondola()])
    _vendido(client, admin, "GON-05-B-TR2", desde=0, hasta=30)
    b = client.get("/api/montaje/mi-espacio",
                   headers={"Authorization": f"Bearer {create_mount_token('NAVE-GON-05-B-TR2', days=30)}"}).json()
    assert b["parte"]["texto"] == "Tramo 2 de 3, contando de izquierda a derecha mirando el frente"
    # El plano de la mercaderista dibuja los tramos: pasan con su tipo, y nada
    # que alguien escriba adentro de `partes`.
    vecino = next(f for f in b["vecinos"] if f.get("code") == "GON-05")
    assert vecino["partes"] == {"tramos": 3, "division": "tramos"}, vecino


# ─── Las fichas propias: el mueble que arma la dueña ya viene configurado ─────

def test_una_ficha_propia_guarda_como_se_vende(client, admin):
    """Lo que pidió la dueña: que los muebles que cada supermercado arma con
    sus fichas propias queden configurados para venderse por partes. El
    servidor guarda la forma de dividir y la cuenta (`ficha_normalizada`), y
    lo colocado desde la ficha la trae estampada."""
    fuente = {"confiabilidad": "ficha", "nota": "Medido en la tienda."}
    multideck = {"clave": "multideck-250", "tipo": "nevera_refrescos", "nombre": "Multideck de bebidas 2,50",
                 "w": 2.5, "d": 0.8, "h": 2.0, "partes": {"tramos": 2, "division": "tramos"}, "fuente": fuente}
    r = client.post("/api/muebles/modelos", json=multideck, headers=admin)
    assert r.status_code == 201, r.text
    assert r.json()["partes"] == {"tramos": 2, "division": "tramos"}, r.json()
    punta = {"clave": "punta-gamma", "tipo": "punta", "nombre": "Punta Gamma", "w": 0.7, "d": 0.37, "h": 1.8,
             "entrepanos": 3, "partes": {"division": "entrepanos"}, "fuente": fuente}
    r = client.post("/api/muebles/modelos", json=punta, headers=admin)
    assert r.status_code == 201, r.text
    assert (r.json()["entrepanos"], r.json()["partes"]) == (3, {"division": "entrepanos"}), r.json()
    # La góndola, por tramos SIN la cantidad (su ficha es un módulo)…
    gondola = {"clave": "gondola-gamma", "tipo": "gondola", "variante": "wall", "nombre": "Góndola Gamma",
               "w": 1.0, "d": 0.45, "h": 2.0, "partes": {"division": "tramos"}, "fuente": fuente}
    r = client.post("/api/muebles/modelos", json=gondola, headers=admin)
    assert r.status_code == 201, r.text
    assert r.json()["partes"] == {"division": "tramos"}
    # …y con la cantidad, no.
    r = client.post("/api/muebles/modelos", json={**gondola, "clave": "gondola-gamma-2",
                                                  "partes": {"tramos": 4, "division": "tramos"}}, headers=admin)
    assert r.status_code == 422, r.text
    # Colocada desde la ficha, se vende por partes sin tocar el panel.
    _plano(client, admin, [{**_multideck(code="BEB-02"), "modelo": "cli:multideck-250"}])
    assert _validar(client, admin, _fila("BEB-02-TR2"))[0]["estado"] != "error"
