"""Vender por partes, paso 4: cómo se vende, configurado desde la ficha.

La dueña: «ahora que los clientes pueden armar sus propios muebles, que quede
configurado el poder vender por partes dichos muebles». La ficha —un modelo de
RECABRA en ``muebles.json`` o una ficha propia del supermercado en
``modelos_mueble``— dice cómo se vende lo que se coloque desde ella, y al
colocar se ESTAMPA en el mueble. Lo que se vigila acá, del lado del servidor:

* que los modelos de RECABRA traigan su configuración (las neveras de 2, 3 y 4
  puertas, por puertas; las góndolas de pared, los murales, por tramos, uno por
  módulo, que se fijan en el plano) y pasen la validación de una ficha;
* que **lo ya colocado no cambie solo**: el servidor nunca relee la ficha de un
  mueble del plano para venderlo (sólo su tarifa propia), así que un mural o
  una nevera colocados antes se siguen vendiendo enteros;
* que una ficha propia guardada antes de vender por partes (sin ``division``)
  se lea igual y se venda entera, que al editarla se guarde cómo se vende, y
  que «Usar lo de la ficha» —lo que el panel escribe en el plano— pase por las
  mismas guardas que cualquier cambio: 409 ``partes_vendidas`` con una parte
  vendida;
* que retirar la ficha no toque lo colocado ni sus partes vendidas.

Nada de ``from app…`` a nivel de módulo salvo la fecha del negocio (ver el
encabezado de ``test_espacio_vendible.py``).
"""
from tests import sin_planilla  # las partes: la revisión común, sin las reglas de la planilla
import json
from datetime import timedelta
from pathlib import Path

from app.fechas import hoy as hoy_en_colombia  # el «hoy» del negocio: Colombia

HOY = hoy_en_colombia()
CATALOGO = Path(__file__).resolve().parents[1] / "app" / "catalogo" / "muebles.json"


def _d(dias: int) -> str:
    return (HOY + timedelta(days=dias)).isoformat()


def _mural(code="GON-07", w=4.0, **extra):
    """Un mural colocado desde el modelo de RECABRA de pared de 1,80 · módulo 1,00."""
    return {
        "id": f"f-{code}", "code": code, "sede": "NAVE", "type": "gondola", "gondolaType": "wall",
        "label": "Góndola Mural", "cx": 4, "cz": 2, "rotY": 0, "w": w, "d": 0.4, "h": 1.8, "color": "#818cf8",
        "entrepanos": 4, "modulo": 1.0, "modelo": "base:gondola-pared-180-m100", **extra,
    }


def _nevera(code="NEV-09", modelo="base:nevera-3p-frigomaster", partes=None, cx=9, **extra):
    return {
        "id": f"f-{code}", "code": code, "sede": "NAVE", "type": "nevera_puertas", "label": "Nevera de Puertas",
        "cx": cx, "cz": 2, "rotY": 0, "w": 2.07, "d": 0.7, "h": 2.1, "color": "#1e293b",
        "modelo": modelo, "partes": {"puertas": 3} if partes is None else partes, **extra,
    }


def _guardar(client, admin, fixtures):
    return client.put("/api/layout/NAVE", headers=admin, json={"fixtures": fixtures, "base_updated_at": None})


def _plano(client, admin, fixtures):
    r = _guardar(client, admin, fixtures)
    assert r.status_code == 200, r.text


def _fila(espacio, desde=1, hasta=30, proveedor="Postobón", valor=350_000, fila=1):
    return {"fila": fila, "espacio": espacio, "sede": "NAVE", "proveedor": proveedor,
            "valor": valor, "desde": _d(desde), "hasta": _d(hasta)}


def _validar(client, admin, *filas):
    r = sin_planilla.post("/api/leases/bulk/validar", json={"sede": "NAVE", "filas": list(filas)})
    assert r.status_code == 200, r.text
    return r.json()["filas"]


def _vender(client, admin, espacio, **kw):
    r = sin_planilla.post("/api/leases/bulk/confirmar", json={"sede": "NAVE", "filas": [_fila(espacio, **kw)]})
    assert r.status_code == 200, r.text
    f = r.json()["filas"][0]
    assert f["lease_id"] is not None, f
    return f


# ─── Los modelos de RECABRA ───────────────────────────────────────────────────

def test_los_modelos_de_recabra_traen_como_se_venden_y_pasan_la_ficha(client):
    from app.services.catalogo_muebles import problemas_de_la_ficha
    modelos = json.loads(CATALOGO.read_text(encoding="utf-8"))["modelos"]
    por_id = {m["id"]: m for m in modelos}
    for n in (2, 3, 4):
        (m,) = [x for x in modelos if x["tipo"] == "nevera_puertas" and (x.get("partes") or {}).get("puertas") == n]
        assert m["partes"]["division"] == "puertas", m["id"]
    assert "division" not in por_id["base:nevera-1p-inducol"]["partes"], "la nevera de una puerta se divide"
    murales = [m for m in modelos if m["tipo"] == "gondola" and m.get("variante") == "wall"]
    assert len(murales) == 12
    for m in murales:
        # Por tramos, sin la cantidad: la ficha es un módulo, se fijan en el plano.
        assert m["partes"] == {"division": "tramos"}, m["id"]
    for m in modelos:
        if m["tipo"] == "gondola" and m.get("variante") == "double":
            assert "partes" not in m, f"{m['id']}: una central nace por partes (lo decide la dueña)"
        ficha = {k: v for k, v in m.items() if k not in ("id", "color", "informe", "informePlural")}
        assert problemas_de_la_ficha({**ficha, "clave": "x"}) == [], m["id"]


# ─── Lo ya colocado no cambia solo ────────────────────────────────────────────

def test_lo_colocado_antes_se_sigue_vendiendo_entero_aunque_su_ficha_diga_partes(client, admin):
    """El mural y la nevera se colocaron antes de que su modelo dijera cómo se
    vende: el mural sin ``partes``, la nevera con sus puertas y sin
    ``division``. El servidor no relee el modelo: se venden enteros."""
    from app.services.layout_lookup import espacios_ofrecidos
    plano = [_mural(), _nevera()]
    assert espacios_ofrecidos(plano, "NAVE") == {"NAVE-GON-07", "NAVE-NEV-09"}
    _plano(client, admin, plano)
    for espacio in ("GON-07-TR1", "NEV-09-PU1"):
        f = _validar(client, admin, _fila(espacio))[0]
        assert f["estado"] == "error" and "se vende entera" in " ".join(f["mensajes"]), f
    assert _validar(client, admin, _fila("GON-07"))[0]["estado"] != "error"
    assert _validar(client, admin, _fila("NEV-09", fila=1))[0]["estado"] != "error"


def test_un_mural_colocado_desde_el_modelo_nuevo_se_vende_entero_hasta_fijar_sus_tramos(client, admin):
    """Colocado desde el modelo de hoy, el mural lleva ``division: "tramos"`` y
    ninguna cantidad (la ficha es un módulo). Hasta que el panel los fije —uno
    por módulo del corrido—, se vende entero y la planilla dice qué falta."""
    from app.services.layout_lookup import espacios_ofrecidos
    sin_fijar = _mural(partes={"division": "tramos"})
    assert espacios_ofrecidos([sin_fijar], "NAVE") == {"NAVE-GON-07"}
    _plano(client, admin, [sin_fijar])
    f = _validar(client, admin, _fila("GON-07-TR1"))[0]
    assert f["estado"] == "error" and "no tiene fijado cuántos" in " ".join(f["mensajes"]), f
    # «Fijar 4 tramos, uno por módulo» (lo que escribe el panel).
    fijado = _mural(partes={"division": "tramos", "tramos": 4})
    _plano(client, admin, [fijado])
    assert espacios_ofrecidos([fijado], "NAVE") == {"NAVE-GON-07", *(f"NAVE-GON-07-TR{k}" for k in range(1, 5))}
    _vender(client, admin, "GON-07-TR2")
    assert _validar(client, admin, _fila("GON-07-TR3", proveedor="Alpina"))[0]["estado"] != "error"
    assert _validar(client, admin, _fila("GON-07", proveedor="Alpina"))[0]["estado"] == "error"


# ─── Las fichas propias ───────────────────────────────────────────────────────

def _ficha_de_antes(client):
    """Una ficha propia guardada antes de vender por partes: las puertas que
    dibujan y nada de cómo se vende. Va directo a la tabla, como quedó."""
    from datetime import datetime, timezone
    from app.database import SessionLocal
    from app.models.models import ModeloMueble
    db = SessionLocal()
    try:
        ahora = datetime.now(timezone.utc)
        db.add(ModeloMueble(
            clave="nevera-de-antes", tipo="nevera_puertas", nombre="Nevera de antes",
            datos_json=json.dumps({"w": 1.445, "d": 0.74, "h": 2.1, "partes": {"puertas": 2},
                                   "fuente": {"confiabilidad": "ficha", "url": "https://inducol.com.co/nevera/"}}),
            creado_en=ahora, actualizado_en=ahora, creado_por="admin",
        ))
        db.commit()
    finally:
        db.close()


def test_una_ficha_propia_de_antes_se_lee_y_lo_colocado_con_ella_se_vende_entero(client, admin):
    _ficha_de_antes(client)
    (fila,) = client.get("/api/muebles/modelos", headers=admin).json()
    assert fila["id"] == "cli:nevera-de-antes" and fila["partes"] == {"puertas": 2}
    colocada = _nevera(code="NEV-11", modelo="cli:nevera-de-antes", partes={"puertas": 2}, w=1.445)
    _plano(client, admin, [colocada])
    f = _validar(client, admin, _fila("NEV-11-PU1"))[0]
    assert f["estado"] == "error" and "se vende entera" in " ".join(f["mensajes"]), f

    # La dueña la edita en el taller: «se vende por puertas». Se guarda...
    r = client.put("/api/muebles/modelos/nevera-de-antes", headers=admin, json={
        "tipo": "nevera_puertas", "nombre": "Nevera de antes", "w": 1.445, "d": 0.74, "h": 2.1,
        "partes": {"puertas": 2, "division": "puertas"},
        "fuente": {"confiabilidad": "ficha", "url": "https://inducol.com.co/nevera/"},
    })
    assert r.status_code == 200, r.text
    assert r.json()["partes"] == {"puertas": 2, "division": "puertas"}
    # ...pero lo colocado no cambia solo: sigue entera hasta «Usar lo de la ficha».
    assert _validar(client, admin, _fila("NEV-11-PU1"))[0]["estado"] == "error"
    _plano(client, admin, [{**colocada, "partes": {"puertas": 2, "division": "puertas"}}])
    assert _validar(client, admin, _fila("NEV-11-PU1"))[0]["estado"] != "error"


def test_las_fichas_propias_guardan_como_se_venden_sus_partes_y_sus_piezas(client, admin):
    fuente = {"confiabilidad": "estimado", "nota": "Medida en la tienda."}
    casos = [
        ({"clave": "nevera-3p", "tipo": "nevera_puertas", "nombre": "Nevera 3", "w": 2.07, "d": 0.7, "h": 2.1,
          "partes": {"puertas": 3, "division": "puertas"}}, {"puertas": 3, "division": "puertas"}),
        ({"clave": "mural-125", "tipo": "gondola", "variante": "wall", "nombre": "Mural", "w": 1.25, "d": 0.45, "h": 1.9,
          "entrepanos": 4, "modulo": 1.25, "partes": {"division": "tramos"}}, {"division": "tramos"}),
        ({"clave": "multideck-2t", "tipo": "nevera_refrescos", "nombre": "Multideck", "w": 2.5, "d": 0.8, "h": 2.0,
          "partes": {"tramos": 2, "division": "tramos"}}, {"tramos": 2, "division": "tramos"}),
        ({"clave": "caja-2b", "tipo": "checkout", "nombre": "Caja", "w": 1.8, "d": 0.7, "h": 0.9,
          "partes": {"bahias": 2}}, {"bahias": 2}),
        ({"clave": "columna-40", "tipo": "columna", "nombre": "Columna", "w": 0.4, "d": 0.4, "h": 3.0,
          "partes": {"forro": True}}, {"forro": True}),
    ]
    for ficha, partes in casos:
        r = client.post("/api/muebles/modelos", headers=admin, json={**ficha, "fuente": fuente})
        assert r.status_code == 201, r.text
        assert r.json()["partes"] == partes, ficha["clave"]
    leidas = {m["clave"]: m["partes"] for m in client.get("/api/muebles/modelos", headers=admin).json()}
    assert leidas == {f["clave"]: p for f, p in casos}


def test_usar_lo_de_la_ficha_con_una_puerta_vendida_es_un_409(client, admin):
    """Una nevera de 2 puertas por puertas, colocada desde la de 3: «Usar lo de
    la ficha» la pasaría a 3 y la PU1 vendida quedaría en otro lugar. El panel
    lo frena antes; si llega igual (otra pestaña), el servidor también."""
    nev = _nevera(partes={"puertas": 2, "division": "puertas"})
    _plano(client, admin, [nev])
    _vender(client, admin, "NEV-09-PU1")
    r = _guardar(client, admin, [{**nev, "partes": {"puertas": 3, "division": "puertas"}}])
    assert r.status_code == 409, r.text
    d = r.json()["detail"]
    assert d["code"] == "partes_vendidas", d
    assert "de 2 a 3 puertas" in " ".join(d["choques"]), d


def test_retirar_la_ficha_no_toca_lo_colocado_ni_sus_partes_vendidas(client, admin):
    fuente = {"confiabilidad": "estimado", "nota": "Medida en la tienda."}
    r = client.post("/api/muebles/modelos", headers=admin, json={
        "clave": "nevera-3p", "tipo": "nevera_puertas", "nombre": "Nevera 3", "w": 2.07, "d": 0.7, "h": 2.1,
        "partes": {"puertas": 3, "division": "puertas"}, "fuente": fuente})
    assert r.status_code == 201, r.text
    nev = _nevera(modelo="cli:nevera-3p", partes={"puertas": 3, "division": "puertas"})
    _plano(client, admin, [nev])
    _vender(client, admin, "NEV-09-PU2")
    antes = client.get("/api/layout/NAVE", headers=admin).json()["fixtures"]
    assert client.post("/api/muebles/modelos/nevera-3p/retirar", headers=admin).status_code == 200
    assert client.get("/api/layout/NAVE", headers=admin).json()["fixtures"] == antes
    # Las otras puertas se siguen vendiendo; la PU2 vendida y la entera, no.
    assert _validar(client, admin, _fila("NEV-09-PU1", proveedor="Alpina"))[0]["estado"] != "error"
    assert _validar(client, admin, _fila("NEV-09-PU2", proveedor="Alpina"))[0]["estado"] == "error"
    assert _validar(client, admin, _fila("NEV-09", proveedor="Alpina"))[0]["estado"] == "error"
