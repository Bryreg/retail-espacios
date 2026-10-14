"""Vender por partes, paso 3: las PIEZAS de lo que nunca se vende entero.

La dueña: la caja registradora nunca se vende entera, pero sus bahías de
impulso (el zócalo abierto del lado del cliente: chicles, pilas, revistas) sí,
una por una (``CAJ-04-BI1``, de izquierda a derecha mirando la caja desde la
fila), con el atajo de venderle la misma bahía de todas las cajas de la sede a
una marca en un solo contrato. La columna nunca se vende; su forro
(``COL-07-FO``, sin número: es uno por columna), sí.

Una pieza no parte ninguna cara: no choca con nada más que consigo misma, se
ofrece aunque el mueble no sea comercializable (la caja no lo es nunca), su
tarifa es la de su clase sin respaldo, no cuenta en la ocupación y una caja
sin ``partes.bahias`` —todas las de los planos de antes— no ofrece nada, como
siempre. Es la maquinaria de los pasos 1 y 2 (``test_partes_venta.py`` y
``test_partes_tramos.py``): acá se prueba lo que cambia con las piezas.
"""
from datetime import timedelta

import pytest

from app.fechas import hoy as hoy_en_colombia  # el «hoy» del negocio: Colombia

HOY = hoy_en_colombia()


def _d(dias: int) -> str:
    return (HOY + timedelta(days=dias)).isoformat()


def _caja(code="CAJ-04", bahias=2, cx=1.0, **extra):
    f = {
        "id": f"f-{code}", "code": code, "sede": "NAVE", "type": "checkout", "label": "Checkout / Caja",
        "cx": cx, "cz": 1, "rotY": 0, "w": 1.8, "d": 0.7, "h": 0.9, "color": "#8b5cf6", **extra,
    }
    if bahias is not None:
        f["partes"] = {"bahias": bahias}
    return f


def _columna(code="COL-07", forro=True, **extra):
    f = {
        "id": f"f-{code}", "code": code, "sede": "NAVE", "type": "columna", "label": "Columna",
        "cx": 6, "cz": 6, "rotY": 0, "w": 0.4, "d": 0.4, "h": 3.0, "color": "#94a3b8", **extra,
    }
    if forro is not None:
        f["partes"] = {"forro": forro}
    return f


def _plano(client, admin, fixtures):
    r = client.put("/api/layout/NAVE", headers=admin, json={"fixtures": fixtures, "base_updated_at": None})
    assert r.status_code == 200, r.text


def _guardar(client, admin, fixtures):
    return client.put("/api/layout/NAVE", headers=admin, json={"fixtures": fixtures, "base_updated_at": None})


def _fila(espacio, desde=1, hasta=30, proveedor="Colombina", valor=180_000, fila=1):
    return {"fila": fila, "espacio": espacio, "sede": "NAVE", "proveedor": proveedor,
            "valor": valor, "desde": _d(desde), "hasta": _d(hasta)}


def _validar(client, admin, *filas):
    r = client.post("/api/leases/bulk/validar", headers=admin, json={"sede": "NAVE", "filas": list(filas)})
    assert r.status_code == 200, r.text
    return r.json()["filas"]


def _confirmar(client, admin, *filas):
    r = client.post("/api/leases/bulk/confirmar", headers=admin, json={"sede": "NAVE", "filas": list(filas)})
    assert r.status_code == 200, r.text
    return r.json()["filas"]


def _vendido(client, admin, espacio, **kw):
    f = _confirmar(client, admin, _fila(espacio, **kw))[0]
    assert f["lease_id"] is not None, f
    return f


def _texto(fila) -> str:
    return " ".join(fila["mensajes"])


def _suelto(client, admin, code, desde=1, hasta=30):
    s = client.post("/api/spaces/find-or-create", headers=admin,
                    json={"code": code, "name": code, "zone": "Z", "sede": "NAVE", "area_m2": 1}).json()
    sup = client.post("/api/suppliers/find-or-create", headers=admin, json={"name": "Colombina"}).json()
    return client.post(f"/api/spaces/{s['id']}/leases", headers=admin, json={
        "supplier_id": sup["id"], "start_date": _d(desde), "end_date": _d(hasta), "monthly_rent": 1,
    })


# ─── La caja: sus bahías, nunca ella ──────────────────────────────────────────

def test_la_caja_vende_sus_bahias_de_a_una_y_nunca_entera(client, admin):
    _plano(client, admin, [_caja()])
    entera = _validar(client, admin, _fila("CAJ-04"))[0]
    assert entera["estado"] == "error", entera
    assert "no se vende" in _texto(entera) and "NAVE-CAJ-04-BI1, NAVE-CAJ-04-BI2" in _texto(entera), entera
    # Las dos bahías en el mismo contrato: no chocan entre sí.
    f = _confirmar(client, admin, _fila("CAJ-04-BI1"), _fila("CAJ-04-BI2", fila=2, proveedor="Bimbo"))
    assert all(x["lease_id"] for x in f), f
    assert f[0]["parte"] == "Bahía de impulso 1 de 2, contando de izquierda a derecha mirando la caja desde la fila"
    # La misma bahía en fechas que se pisan, no; sin nombrar a quién la tiene.
    otra = _validar(client, admin, _fila("CAJ-04-BI1", desde=10, hasta=40, proveedor="Nestlé"))[0]
    assert otra["estado"] == "error" and "ya tiene un contrato" in _texto(otra), otra
    assert "Colombina" not in _texto(otra), otra
    # Una que no existe, y la cara B de una caja (tiene una sola).
    assert "no hay BI3" in _texto(_validar(client, admin, _fila("CAJ-04-BI3"))[0])
    assert _validar(client, admin, _fila("CAJ-04-B-BI1"))[0]["estado"] == "error"


def test_la_bahia_1_de_todas_las_cajas_en_un_solo_contrato(client, admin):
    """El atajo de Vender («Sumar la BI1 de todas las cajas de la sede») es un
    contrato multiespacio: una fila por caja, y el servidor las crea juntas."""
    cajas = [_caja(f"CAJ-0{k}", cx=float(k * 2)) for k in range(1, 9)]
    _plano(client, admin, cajas)
    f = _confirmar(client, admin, *[_fila(f"CAJ-0{k}-BI1", fila=k) for k in range(1, 9)])
    assert [x["estado"] for x in f] == ["ok"] * 8 and all(x["lease_id"] for x in f), f
    from app.database import SessionLocal
    from app.models.models import Space
    db = SessionLocal()
    try:
        s = db.query(Space).filter(Space.code == "NAVE-CAJ-03-BI1").one()
        # Una pieza no es un pedazo del piso: no tiene huella propia.
        assert s.area_m2 == 0
        assert "Bahía de impulso 1" in s.name, s.name
    finally:
        db.close()


def test_una_caja_de_un_plano_de_antes_no_ofrece_nada_y_dice_como(client, admin):
    _plano(client, admin, [_caja("CAJ-01", bahias=None)])
    bahia = _validar(client, admin, _fila("CAJ-01-BI1"))[0]
    assert bahia["estado"] == "error" and "no tiene bahías de impulso en el plano" in _texto(bahia), bahia
    entera = _validar(client, admin, _fila("CAJ-01"))[0]
    assert "no comercializable" in _texto(entera) and "Cómo se vende" in _texto(entera), entera
    # El contrato suelto, lo mismo: nunca se alquila, y cómo se venden sus bahías.
    r = _suelto(client, admin, "NAVE-CAJ-01")
    assert r.status_code == 409 and "nunca se alquila" in r.json()["detail"], r.text
    assert "bahías de impulso" in r.json()["detail"], r.text
    r = _suelto(client, admin, "NAVE-CAJ-01-BI1")
    assert r.status_code == 409 and "no tiene bahías" in r.json()["detail"], r.text


def test_el_contrato_suelto_vende_una_bahia_y_frena_la_caja_entera(client, admin):
    _plano(client, admin, [_caja()])
    assert _suelto(client, admin, "NAVE-CAJ-04-BI2").status_code == 201
    r = _suelto(client, admin, "NAVE-CAJ-04")
    assert r.status_code == 409 and "se venden sus bahías de impulso" in r.json()["detail"], r.text
    r = _suelto(client, admin, "NAVE-CAJ-04-BI2", desde=5, hasta=8)
    assert r.status_code == 409, r.text


def test_la_tarifa_de_la_bahia_es_la_de_su_clase_sin_respaldo(client, admin):
    _plano(client, admin, [_caja()])
    client.put("/api/layout/rates", headers=admin, json={"default": {"gondola": 600_000}, "by_sede": {}})
    assert _validar(client, admin, _fila("CAJ-04-BI1"))[0]["referencia"] is None
    client.put("/api/layout/rates", headers=admin,
               json={"default": {"parte_bahia": 150_000}, "by_sede": {"NAVE": {"parte_bahia": 170_000}}})
    assert _validar(client, admin, _fila("CAJ-04-BI2"))[0]["referencia"] == 170_000


# ─── La columna: su forro ─────────────────────────────────────────────────────

def test_la_columna_vende_su_forro_y_nunca_ella(client, admin):
    _plano(client, admin, [_columna()])
    entera = _validar(client, admin, _fila("COL-07"))[0]
    assert entera["estado"] == "error" and "se vende su forro (NAVE-COL-07-FO)" in _texto(entera), entera
    f = _vendido(client, admin, "COL-07-FO")
    assert f["parte"] == "Forro de columna", f
    assert _validar(client, admin, _fila("COL-07-FO", desde=5, hasta=8))[0]["estado"] == "error"
    # Sin forro en el plano, no hay forro que vender.
    _plano(client, admin, [_columna(), _columna("COL-08", forro=None, cx=9)])
    sin = _validar(client, admin, _fila("COL-08-FO"))[0]
    assert sin["estado"] == "error" and "no tiene forro en el plano" in _texto(sin), sin


def test_una_nevera_no_tiene_bahias_ni_forro(client, admin):
    nevera = {"id": "n1", "code": "NEV-03", "sede": "NAVE", "type": "nevera_puertas", "label": "Nevera",
              "cx": 3, "cz": 3, "rotY": 0, "w": 2.07, "d": 0.7, "h": 2.1, "color": "#1e293b",
              "partes": {"puertas": 3, "division": "puertas", "bahias": 2}}
    _plano(client, admin, [nevera])
    f = _validar(client, admin, _fila("NEV-03-BI1"))[0]
    assert f["estado"] == "error" and "no lleva bahías de impulso" in _texto(f), f
    assert "no lleva forro" in _texto(_validar(client, admin, _fila("NEV-03-FO"))[0])


# ─── El guardado del plano ────────────────────────────────────────────────────

def test_con_una_bahia_vendida_no_cambian_las_bahias(client, admin):
    _plano(client, admin, [_caja()])
    _vendido(client, admin, "CAJ-04-BI1")
    r = _guardar(client, admin, [_caja(bahias=3)])
    assert r.status_code == 409, r.text
    d = r.json()["detail"]
    assert d["code"] == "partes_vendidas", d
    assert "de 2 a 3 bahías de impulso" in d["choques"][0] and "una bahía de impulso vendida" in d["choques"][0], d
    # Sacarlas deja la bahía vendida sin mueble: el de siempre.
    sin = _caja()
    sin["partes"] = {"bahias": None}
    r = _guardar(client, admin, [sin])
    assert r.status_code == 409 and r.json()["detail"]["code"] == "contratos_vivos", r.text
    # Estirar la caja no mueve qué bahía es cuál: se guarda.
    assert _guardar(client, admin, [_caja(w=2.2)]).status_code == 200


def test_con_el_forro_vendido_la_columna_no_se_queda_sin_forro(client, admin):
    _plano(client, admin, [_columna()])
    _vendido(client, admin, "COL-07-FO")
    r = _guardar(client, admin, [_columna(forro=False)])
    assert r.status_code == 409 and r.json()["detail"]["code"] == "contratos_vivos", r.text
    assert "COL-07-FO" in r.json()["detail"]["choques"][0], r.text


def test_una_pestana_vieja_no_borra_las_bahias(client, admin):
    """Una pestaña con el código de antes arma `partes` sin `bahias`: el
    servidor se las deja (y un `null` las borra)."""
    _plano(client, admin, [_caja()])
    vieja = _caja()
    vieja["partes"] = {}
    assert _guardar(client, admin, [vieja]).status_code == 200
    guardado = client.get("/api/layout/NAVE", headers=admin).json()["fixtures"][0]
    assert guardado["partes"] == {"bahias": 2}, guardado


def test_un_plano_con_cajas_y_columnas_sin_piezas_se_guarda_igual(client, admin):
    _plano(client, admin, [_caja("CAJ-01", bahias=None), _columna("COL-01", forro=None)])
    guardado = client.get("/api/layout/NAVE", headers=admin).json()["fixtures"]
    assert all("partes" not in f for f in guardado), guardado


# ─── La mercaderista ──────────────────────────────────────────────────────────

def test_el_enlace_de_montaje_de_una_bahia_dice_cual_desde_la_fila(client, admin):
    from app.auth import create_mount_token

    _plano(client, admin, [_caja()])
    _vendido(client, admin, "CAJ-04-BI2", desde=0, hasta=30)
    r = client.get("/api/montaje/mi-espacio",
                   headers={"Authorization": f"Bearer {create_mount_token('NAVE-CAJ-04-BI2', days=30)}"})
    assert r.status_code == 200, r.text
    b = r.json()
    assert b["corto"] == "CAJ-04-BI2" and b["fixture_code"] == "CAJ-04"
    assert b["parte"] == {
        "token": "BI", "n": 2, "de": 2,
        "texto": "Bahía de impulso 2 de 2, contando de izquierda a derecha mirando la caja desde la fila",
    }, b["parte"]
    assert "180" not in r.text, "la plata llegó al enlace de montaje"
    vecino = next(f for f in b["vecinos"] if f.get("code") == "CAJ-04")
    assert vecino["partes"] == {"bahias": 2}, vecino


def test_el_enlace_de_montaje_del_forro(client, admin):
    from app.auth import create_mount_token

    _plano(client, admin, [_columna()])
    _vendido(client, admin, "COL-07-FO", desde=0, hasta=30)
    b = client.get("/api/montaje/mi-espacio",
                   headers={"Authorization": f"Bearer {create_mount_token('NAVE-COL-07-FO', days=30)}"}).json()
    assert b["corto"] == "COL-07-FO"
    assert b["parte"] == {"token": "FO", "n": None, "de": None, "texto": "Forro de columna"}, b["parte"]


# ─── La consola y la auditoría ────────────────────────────────────────────────

def test_la_consola_cuenta_las_piezas_con_su_tarifa_y_fuera_de_la_ocupacion():
    """Una bahía vendida es un contrato SOBRE el plano (no «fuera»), cuenta
    canon y spread contra la tarifa de su clase —sin respaldo: la caja no tiene
    tarifa que dividir— y nunca ocupación: no es una cara."""
    from app import plataforma_metricas as pm

    caja = _caja()
    columna = _columna()
    partes = pm._mapa_partes_de_sede([caja, columna], "NAVE")
    assert set(partes) == {"NAVE-CAJ-04-BI1", "NAVE-CAJ-04-BI2", "NAVE-COL-07-FO"}, partes
    assert partes["NAVE-CAJ-04-BI1"] == ("NAVE", "parte_bahia", None, None)
    assert partes["NAVE-COL-07-FO"] == ("NAVE", "parte_forro", None, None)
    tarifas = {"default": {"parte_bahia": 150_000, "checkout": 900_000}, "by_sede": {}}
    assert pm.tarifa_de_parte(tarifas, partes["NAVE-CAJ-04-BI1"]) == 150_000
    assert pm.tarifa_de_parte({"default": {"checkout": 900_000}, "by_sede": {}}, partes["NAVE-CAJ-04-BI1"]) is None
    caras = pm._caras_comercializables([caja, columna], "NAVE")
    assert caras == set()
    assert pm.cara_ocupada("NAVE-CAJ-04-BI1") not in caras
    # Una caja sin bahías (todas las de antes): nada, como siempre.
    assert pm._mapa_partes_de_sede([_caja(bahias=None)], "NAVE") == {}


def test_la_auditoria_de_consola_conoce_las_piezas_que_se_ofrecen():
    from scripts.auditar_desfase import caras_del_plano

    caras = caras_del_plano([_caja(), _columna(), _caja("CAJ-05", bahias=None)])
    assert set(caras) == {"CAJ-04-BI1", "CAJ-04-BI2", "COL-07-FO"}, caras


def test_renumerar_la_caja_muda_sus_bahias():
    from app.services.renumeracion import _base_y_cara

    assert _base_y_cara("NAVE-CAJ-04-BI2") == ("NAVE-CAJ-04", "-BI2")
    assert _base_y_cara("NAVE-COL-07-FO") == ("NAVE-COL-07", "-FO")


# ─── La ficha propia: la caja que arma la dueña ya viene configurada ──────────

def test_una_ficha_propia_de_caja_y_de_columna_guarda_sus_piezas(client, admin):
    fuente = {"confiabilidad": "estimado", "nota": "Medida en la tienda."}
    caja = {"clave": "caja-ocana", "tipo": "checkout", "nombre": "Caja Ocaña 1,80 con dos bahías",
            "w": 1.8, "d": 0.7, "h": 0.9, "partes": {"bahias": 2}, "fuente": fuente}
    r = client.post("/api/muebles/modelos", json=caja, headers=admin)
    assert r.status_code == 201, r.text
    assert r.json()["partes"] == {"bahias": 2}, r.json()
    columna = {"clave": "columna-40", "tipo": "columna", "nombre": "Columna de 40 forrada",
               "w": 0.4, "d": 0.4, "h": 3.0, "partes": {"forro": True}, "fuente": fuente}
    r = client.post("/api/muebles/modelos", json=columna, headers=admin)
    assert r.status_code == 201, r.text
    assert r.json()["partes"] == {"forro": True}, r.json()
    # Cinco bahías no; un forro escrito como texto, tampoco.
    r = client.post("/api/muebles/modelos", json={**caja, "clave": "caja-5", "partes": {"bahias": 5}}, headers=admin)
    assert r.status_code == 422, r.text
    r = client.post("/api/muebles/modelos", json={**columna, "clave": "col-2", "partes": {"forro": "si"}}, headers=admin)
    assert r.status_code == 422, r.text
    # Colocada desde la ficha, la caja ya vende sus bahías sin tocar el panel.
    _plano(client, admin, [{**_caja("CAJ-09"), "modelo": "cli:caja-ocana"}])
    assert _validar(client, admin, _fila("CAJ-09-BI2"))[0]["estado"] != "error"


@pytest.mark.parametrize("codigo", ["NAVE-CAJ-04-BI1", "NAVE-COL-07-FO"])
def test_una_pieza_choca_solo_consigo_misma_en_la_base(client, admin, codigo):
    """`contratos_que_chocan` de una pieza: la misma pieza, nada más (ni la
    caja, ni otra bahía)."""
    from app.database import SessionLocal
    from app.services.layout_lookup import contratos_que_chocan

    _plano(client, admin, [_caja(), _columna()])
    _vendido(client, admin, codigo.removeprefix("NAVE-"), desde=1, hasta=30)
    if codigo.endswith("BI1"):
        _vendido(client, admin, "CAJ-04-BI2", desde=1, hasta=30)
    db = SessionLocal()
    try:
        choques = contratos_que_chocan(db, codigo, HOY + timedelta(days=5), HOY + timedelta(days=6))
        assert [s.code for _l, s, _p in choques] == [codigo], choques
    finally:
        db.close()
