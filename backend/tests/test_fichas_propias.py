"""Las fichas propias de los muebles de cada supermercado: ``/api/muebles``.

Cada supermercado arma sus muebles sin pedirnos un cambio: la ficha —familia,
nombre, medidas, la geometría de su familia y de dónde salieron, sin foto— se
guarda en su base (``modelos_mueble``) y se coloca como cualquier modelo del
catálogo, con ``cli:<clave>`` en el ``modelo`` del mueble.

Lo que se vigila acá:

* que la validación sea UNA y la misma que la del navegador (los casos de
  ``frontend/scripts/casos/fichas.json``), con las reglas del catálogo, y que
  los modelos de RECABRA la pasen;
* crear, editar, retirar y reactivar, con su bitácora; que el worker lea y no
  escriba; que la clave, la familia y la tarifa no cambien;
* que retirar o cambiar una ficha no mueva un plano que la usa;
* que la tarifa propia de una ficha llegue a la planilla y a la consola, con
  una consulta por pedido y no una por mueble;
* que la tabla esté clasificada, viaje en la copia de seguridad por una ruta
  segura y no reutilice ids.

Nada de ``from app…`` a nivel de módulo: cada prueba importa lo suyo adentro
(ver el encabezado de ``test_espacio_vendible.py``).
"""
import io
import json
import re
import zipfile
from datetime import timedelta
from pathlib import Path

from conftest import SEPTIEMBRE_DE_2026

RAIZ = Path(__file__).resolve().parents[2]
CASOS = json.loads((RAIZ / "frontend" / "scripts" / "casos" / "fichas.json").read_text(encoding="utf-8"))["casos"]
CATALOGO = RAIZ / "backend" / "app" / "catalogo" / "muebles.json"


def _nevera(**cambios):
    ficha = {
        "clave": "nevera-inducol-2p", "tipo": "nevera_puertas", "nombre": "Nevera Inducol 2 puertas",
        "w": 1.445, "d": 0.74, "h": 2.1, "partes": {"puertas": 2},
        "fuente": {"url": "https://inducol.com.co/neveras/vertical-2-puertas/", "nota": "Ficha técnica.",
                   "confiabilidad": "ficha"},
    }
    ficha.update(cambios)
    return ficha


def _media_estiba(**cambios):
    ficha = {
        "clave": "media-estiba-propia", "tipo": "isla", "nombre": "Media estiba de bodega",
        "w": 1.0, "d": 0.6, "h": 1.2, "tarifa": "estiba_media",
        "fuente": {"confiabilidad": "estimado", "nota": "La de la bodega, a ojo."},
    }
    ficha.update(cambios)
    return ficha


def _mueble(id_, code, tipo, **extra):
    base = {
        "id": id_, "code": code, "sede": "NAVE", "type": tipo, "label": tipo,
        "cx": 2 + len(id_), "cz": 3, "rotY": 0, "w": 1.0, "d": 0.6, "h": 1.2, "color": "#f59e0b",
    }
    base.update(extra)
    return base


def _crear(client, cab, ficha):
    r = client.post("/api/muebles/modelos", json=ficha, headers=cab)
    assert r.status_code == 201, r.text
    return r.json()


def _campos(r) -> set[str]:
    assert r.status_code == 422, r.text
    return {".".join(d["loc"][1:]) for d in r.json()["detail"]}


def _acciones(client, admin):
    r = client.get("/api/bitacora/", headers=admin, params={"limite": 500})
    assert r.status_code == 200, r.text
    return r.json()


# ─── Una sola validación, la del catálogo ─────────────────────────────────────

def test_los_casos_compartidos_con_el_navegador(client):
    """Los mismos casos que corre ``probar-fichas.mjs`` sobre ``fichas.ts``:
    los dos lados se quejan de los mismos campos."""
    from app.services.catalogo_muebles import problemas_de_la_ficha

    mal = []
    for caso in CASOS:
        hoy = sorted({campo for campo, _ in problemas_de_la_ficha(caso["ficha"], nueva=caso.get("nueva", True))})
        if hoy != caso["mal"]:
            mal.append(f"{caso['nombre']}: se queja de {hoy} y tenía que ser {caso['mal']}")
    assert not mal, "\n".join(mal)


def test_cada_modelo_del_catalogo_pasa_la_validacion_de_una_ficha_propia(client):
    """Las reglas son las mismas: si un modelo de RECABRA no pasara, no lo
    serían."""
    from app.services.catalogo_muebles import problemas_de_la_ficha

    cat = json.loads(CATALOGO.read_text(encoding="utf-8"))
    for m in cat["modelos"]:
        ficha = {k: v for k, v in m.items() if k not in ("id", "color", "informe", "informePlural")}
        assert problemas_de_la_ficha(ficha, nueva=False) == [], m["id"]


def test_las_reglas_salen_del_catalogo(client, tmp_path):
    """Una copia escrita a mano de las reglas que hoy coincide no pasa: con el
    catálogo adulterado, la validación cambia con él."""
    from tests.test_catalogo_muebles import _catalogo_muebles_con

    c = json.loads(CATALOGO.read_text(encoding="utf-8"))
    c["fichas"]["confiabilidad"] = ["ficha", "catalogo"]
    c["fichas"]["largoMaximo"]["nombre"] = 10
    c["fichas"]["clave"] = "^[a-z]{1,8}$"
    c["fichas"]["fuenteQueEsImagen"] = r"\.pdf$"
    c["fichas"]["geometria"]["modulo"]["entero"] = True
    c["tipos"]["nevera_puertas"]["rango"]["w"] = [0.6, 1.2]
    c["tipos"]["nevera_puertas"]["geometria"]["puertas"] = [1, 1]
    m = _catalogo_muebles_con(tmp_path, c)

    def campos(ficha, nueva=True):
        return sorted({k for k, _ in m.problemas_de_la_ficha(ficha, nueva=nueva)})

    assert campos(_media_estiba()) == ["clave", "fuente.confiabilidad", "nombre"]
    assert campos(_nevera(clave="nevera"), nueva=False) == ["nombre", "partes.puertas", "w"]
    assert campos(_nevera(clave="nevera", nombre="Nevera", fuente={
        "confiabilidad": "ficha", "url": "https://inducol.com.co/ficha.pdf"})) == ["fuente.url", "partes.puertas", "w"]
    gondola = {"clave": "gondola", "tipo": "gondola", "variante": "double", "nombre": "Góndola",
               "w": 1.0, "d": 0.8, "h": 2.0, "modulo": 0.9, "fuente": {"confiabilidad": "ficha", "nota": "medida"}}
    assert campos(gondola) == ["modulo"]
    assert m.FAMILIAS_CON_FICHA.keys() == {t for t, d in c["tipos"].items() if d.get("rango") and not d.get("legado")}


# ─── Crear, editar, retirar, reactivar ────────────────────────────────────────

def test_crear_editar_retirar_y_reactivar(client, admin):
    creada = _crear(client, admin, _nevera())
    assert creada["id"] == "cli:nevera-inducol-2p"
    assert creada["clave"] == "nevera-inducol-2p"
    assert creada["retirado"] is False and creada["retirado_en"] is None
    # La misma forma que un modelo de muebles.json, y nada de foto.
    assert {k: creada[k] for k in ("tipo", "nombre", "w", "d", "h", "partes", "fuente")} == {
        "tipo": "nevera_puertas", "nombre": "Nevera Inducol 2 puertas", "w": 1.445, "d": 0.74, "h": 2.1,
        "partes": {"puertas": 2},
        "fuente": {"confiabilidad": "ficha", "url": "https://inducol.com.co/neveras/vertical-2-puertas/",
                   "nota": "Ficha técnica."},
    }
    assert "foto" not in creada

    r = client.get("/api/muebles/modelos", headers=admin)
    assert r.status_code == 200, r.text
    assert [f["id"] for f in r.json()] == ["cli:nevera-inducol-2p"]

    # Editar: la ficha entera, sin la clave (o con la misma).
    cambio = _nevera(nombre="  Nevera Inducol de dos puertas  ", w=1.5, partes={"puertas": 3})
    del cambio["clave"]
    r = client.put("/api/muebles/modelos/nevera-inducol-2p", json=cambio, headers=admin)
    assert r.status_code == 200, r.text
    editada = r.json()
    assert (editada["nombre"], editada["w"], editada["partes"]) == ("Nevera Inducol de dos puertas", 1.5, {"puertas": 3})
    assert editada["creado_en"] == creada["creado_en"]
    r = client.put("/api/muebles/modelos/nevera-inducol-2p", json={**cambio, "clave": "nevera-inducol-2p"}, headers=admin)
    assert r.status_code == 200, r.text

    r = client.post("/api/muebles/modelos/nevera-inducol-2p/retirar", headers=admin)
    assert r.status_code == 200, r.text
    assert r.json()["retirado"] is True and r.json()["retirado_en"]
    # Retirar no borra: sigue en la lista, marcada.
    (fila,) = client.get("/api/muebles/modelos", headers=admin).json()
    assert fila["retirado"] is True
    # Retirar dos veces no hace nada (ni otra línea de bitácora).
    assert client.post("/api/muebles/modelos/nevera-inducol-2p/retirar", headers=admin).status_code == 200

    r = client.post("/api/muebles/modelos/nevera-inducol-2p/reactivar", headers=admin)
    assert r.status_code == 200, r.text
    assert r.json()["retirado"] is False and r.json()["retirado_en"] is None

    lineas = [l for l in _acciones(client, admin) if l["accion"].startswith("ficha_mueble.")]
    assert [l["accion"] for l in reversed(lineas)] == [
        "ficha_mueble.alta", "ficha_mueble.cambio", "ficha_mueble.retiro", "ficha_mueble.reactivacion",
    ]
    assert all(l["entidad_id"] == "cli:nevera-inducol-2p" for l in lineas)
    cambio_linea = next(l for l in lineas if l["accion"] == "ficha_mueble.cambio")
    assert "medidas" in cambio_linea["detalle"] and "geometría" in cambio_linea["detalle"]
    assert "nombre" in cambio_linea["detalle"] and "fuente" not in cambio_linea["detalle"]


def test_lo_mismo_otra_vez_no_es_un_cambio(client, admin):
    _crear(client, admin, _nevera())
    r = client.put("/api/muebles/modelos/nevera-inducol-2p", json=_nevera(), headers=admin)
    assert r.status_code == 200, r.text
    assert not [l for l in _acciones(client, admin) if l["accion"] == "ficha_mueble.cambio"]


def test_el_worker_lee_y_no_escribe(client, admin, worker):
    """La lista no lleva plata (la tarifa es la clave de una fila de Tarifas):
    la lee cualquier sesión. Escribir es de administración."""
    _crear(client, admin, _nevera())
    r = client.get("/api/muebles/modelos", headers=worker)
    assert r.status_code == 200, r.text
    (fila,) = r.json()
    assert fila["id"] == "cli:nevera-inducol-2p"
    assert "creado_por" not in fila
    assert "creado_por" in client.get("/api/muebles/modelos", headers=admin).json()[0]

    otra = _nevera(clave="otra-nevera")
    assert client.post("/api/muebles/modelos", json=otra, headers=worker).status_code == 403
    assert client.put("/api/muebles/modelos/nevera-inducol-2p", json=_nevera(), headers=worker).status_code == 403
    assert client.post("/api/muebles/modelos/nevera-inducol-2p/retirar", headers=worker).status_code == 403
    assert client.post("/api/muebles/modelos/nevera-inducol-2p/reactivar", headers=worker).status_code == 403
    # Sin sesión, nada.
    assert client.get("/api/muebles/modelos").status_code == 401
    assert client.post("/api/muebles/modelos", json=otra).status_code == 401
    # Y nada cambió.
    (fila,) = client.get("/api/muebles/modelos", headers=admin).json()
    assert fila["retirado"] is False and fila["nombre"] == "Nevera Inducol 2 puertas"


def test_el_rango_y_la_geometria_son_los_de_su_familia(client, admin):
    r = client.post("/api/muebles/modelos", json=_nevera(w=3.5), headers=admin)
    assert _campos(r) == {"w"}
    assert "fuera del rango de su familia" in r.json()["detail"][0]["msg"]

    gondola = {"clave": "gondola-cali", "tipo": "gondola", "variante": "double", "nombre": "Góndola Cali",
               "w": 1.0, "d": 0.8, "h": 2.0, "entrepanos": 4, "modulo": 1.0,
               "fuente": {"confiabilidad": "ficha", "nota": "medida en la tienda"}}
    assert _campos(client.post("/api/muebles/modelos", json={**gondola, "partes": {"puertas": 2}}, headers=admin)) == {"partes.puertas"}
    assert _campos(client.post("/api/muebles/modelos", json={**gondola, "entrepanos": 9}, headers=admin)) == {"entrepanos"}
    assert _campos(client.post("/api/muebles/modelos", json={**_media_estiba(), "entrepanos": 3}, headers=admin)) == {"entrepanos"}
    assert _campos(client.post("/api/muebles/modelos", json=_nevera(foto="https://x.co/n.png"), headers=admin)) == {"foto"}
    assert _campos(client.post("/api/muebles/modelos", json=_nevera(tipo="servicio_cliente"), headers=admin)) == {"tipo"}
    assert _campos(client.post("/api/muebles/modelos", json=_nevera(
        fuente={"confiabilidad": "ficha", "url": "https://inducol.com.co/nevera.jpg"}), headers=admin)) == {"fuente.url"}
    # Nada de eso se guardó.
    assert client.get("/api/muebles/modelos", headers=admin).json() == []
    assert _crear(client, admin, gondola)["entrepanos"] == 4


def test_un_numero_gigante_es_un_422_y_no_un_500(client, admin):
    """Un entero de JSON de cientos de cifras no entra en un ``float``: la
    validación lo tiene que decir por campo, como cualquier medida mala, y no
    caerse (``math.isfinite`` y ``float()`` lanzaban ``OverflowError``). El
    navegador nunca lo manda —``JSON.parse`` lo vuelve un número o Infinity—,
    así que no está en los casos compartidos."""
    from app.services.catalogo_muebles import problemas_de_la_ficha

    gigante = int("9" * 400)
    gondola = {"clave": "gondola-cali", "tipo": "gondola", "variante": "double", "nombre": "Góndola Cali",
               "w": 1.0, "d": 0.8, "h": 2.0, "fuente": {"confiabilidad": "ficha", "nota": "medida en la tienda"}}
    casos = [
        (_nevera(w=gigante), {"w"}),
        (_nevera(h=-gigante), {"h"}),
        (_nevera(partes={"puertas": gigante}), {"partes.puertas"}),
        ({**gondola, "entrepanos": gigante}, {"entrepanos"}),
        ({**gondola, "modulo": gigante}, {"modulo"}),
    ]
    for ficha, campos in casos:
        assert {c for c, _ in problemas_de_la_ficha(ficha)} == campos, ficha
        # Por la API, como texto: el cuerpo que mandaría alguien a mano.
        r = client.post("/api/muebles/modelos", content=json.dumps(ficha), headers={
            **admin, "Content-Type": "application/json"})
        assert _campos(r) == campos, r.text
    assert client.get("/api/muebles/modelos", headers=admin).json() == []


def test_la_clave_no_se_repite_ni_se_reutiliza(client, admin):
    _crear(client, admin, _nevera())
    r = client.post("/api/muebles/modelos", json=_nevera(nombre="Otra"), headers=admin)
    assert r.status_code == 409, r.text
    # Retirada tampoco: lo colocado con ella busca su tarifa por la clave.
    client.post("/api/muebles/modelos/nevera-inducol-2p/retirar", headers=admin)
    r = client.post("/api/muebles/modelos", json=_nevera(nombre="Otra"), headers=admin)
    assert r.status_code == 409, r.text
    assert "retirada" in r.json()["detail"]

    for mala in ("Nevera-2P", "cli:nevera", "../nevera", "nevera 2p", "n" * 61, "nevera\n", ""):
        assert _campos(client.post("/api/muebles/modelos", json=_nevera(clave=mala), headers=admin)) == {"clave"}, mala
    sin_clave = _nevera()
    del sin_clave["clave"]
    assert _campos(client.post("/api/muebles/modelos", json=sin_clave, headers=admin)) == {"clave"}
    assert len(client.get("/api/muebles/modelos", headers=admin).json()) == 1


def test_la_clave_la_familia_y_la_tarifa_no_se_editan(client, admin):
    _crear(client, admin, _media_estiba())
    ruta = "/api/muebles/modelos/media-estiba-propia"
    assert _campos(client.put(ruta, json=_media_estiba(clave="otra-clave"), headers=admin)) == {"clave"}
    assert _campos(client.put(ruta, json=_media_estiba(tarifa="estiba_cuarta"), headers=admin)) == {"tarifa"}
    sin_tarifa = _media_estiba()
    del sin_tarifa["tarifa"]
    assert _campos(client.put(ruta, json=sin_tarifa, headers=admin)) == {"tarifa"}
    carton = _media_estiba(tipo="impulsador", w=0.6, d=0.4, h=1.7, tarifa="exhibidor_carton")
    assert _campos(client.put(ruta, json=carton, headers=admin)) == {"tipo", "tarifa"}
    # La validación también corre al editar.
    assert _campos(client.put(ruta, json=_media_estiba(w=9), headers=admin)) == {"w"}
    # Lo que no existe.
    assert client.put("/api/muebles/modelos/no-existe", json=_media_estiba(clave="no-existe"), headers=admin).status_code == 404
    assert client.post("/api/muebles/modelos/no-existe/retirar", headers=admin).status_code == 404
    assert client.post("/api/muebles/modelos/no-existe/reactivar", headers=admin).status_code == 404
    (fila,) = client.get("/api/muebles/modelos", headers=admin).json()
    assert (fila["tipo"], fila["tarifa"], fila["w"]) == ("isla", "estiba_media", 1.0)


# ─── Lo colocado no se mueve ──────────────────────────────────────────────────

def test_retirar_o_cambiar_la_ficha_no_mueve_un_plano_que_la_usa(client, admin):
    """El mueble tiene la ficha ESTAMPADA: cambiarla o retirarla no le toca
    nada, y su tarifa sigue siendo la de la ficha."""
    from app.fechas import hoy

    _crear(client, admin, _media_estiba())
    plano = [_mueble("e1", "EXP-01", "isla", modelo="cli:media-estiba-propia", w=1.0, d=0.6, h=1.2)]
    r = client.put("/api/layout/NAVE", json={"fixtures": plano, "base_updated_at": None}, headers=admin)
    assert r.status_code == 200, r.text
    antes = client.get("/api/layout/NAVE", headers=admin).json()

    cambio = _media_estiba(w=1.1, d=0.7, h=1.4, nombre="Otra")
    del cambio["clave"]
    assert client.put("/api/muebles/modelos/media-estiba-propia", json=cambio, headers=admin).status_code == 200
    assert client.post("/api/muebles/modelos/media-estiba-propia/retirar", headers=admin).status_code == 200

    despues = client.get("/api/layout/NAVE", headers=admin).json()
    assert despues["fixtures"] == antes["fixtures"]
    (mueble,) = despues["fixtures"]
    assert (mueble["modelo"], mueble["w"], mueble["d"], mueble["h"]) == ("cli:media-estiba-propia", 1.0, 0.6, 1.2)

    # Y la planilla le sigue buscando la tarifa de la ficha, retirada y todo.
    client.put("/api/layout/rates", json={"default": {"isla": 3_000_000, "estiba_media": 900_000}, "by_sede": {}},
               headers=admin)
    desde, hasta = (hoy() + timedelta(days=10)).isoformat(), (hoy() + timedelta(days=20)).isoformat()
    r = client.post("/api/leases/bulk/validar", headers=admin, json={"sede": "NAVE", "filas": [
        {"fila": 2, "espacio": "EXP-01", "proveedor": "Alpina", "valor": 900_000, "desde": desde, "hasta": hasta},
    ]})
    assert r.status_code == 200, r.text
    assert r.json()["filas"][0]["referencia"] == 900_000


# ─── La tarifa de la ficha ────────────────────────────────────────────────────

def test_la_tarifa_del_mueble_resuelve_las_fichas_propias(client):
    """La misma regla que los modelos del catálogo: sólo si la ficha es del
    mismo tipo que el mueble. Sin las fichas del supermercado, la del tipo."""
    from app.services.catalogo_muebles import tarifa_del_mueble

    propios = {"cli:media": ("isla", "estiba_media"), "cli:carton": ("impulsador", "exhibidor_carton")}
    casos = [
        ({"type": "isla", "modelo": "cli:media"}, "estiba_media"),
        ({"type": "impulsador", "modelo": "cli:carton"}, "exhibidor_carton"),
        ({"type": "punta", "modelo": "cli:media"}, "punta"),
        ({"type": "isla", "modelo": "cli:no-existe"}, "isla"),
        ({"type": "isla"}, "isla"),
        # Un modelo del catálogo sigue mandando aunque haya fichas propias.
        ({"type": "isla", "modelo": "base:estiba-cuarta"}, "estiba_cuarta"),
    ]
    for fixture, esperado in casos:
        assert tarifa_del_mueble(fixture, propios) == esperado, fixture
    assert tarifa_del_mueble({"type": "isla", "modelo": "cli:media"}) == "isla"
    # Una ficha propia no puede hacerse pasar por un modelo del catálogo.
    assert tarifa_del_mueble({"type": "isla", "modelo": "base:estiba-media"},
                             {"base:estiba-media": ("isla", "isla_fria")}) == "estiba_media"


def test_la_tarifa_corre_los_casos_compartidos_con_el_navegador(client, worker):
    """Los mismos casos que corre ``probar-catalogo.mjs`` sobre ``rateTypeOf``
    (``frontend/scripts/casos/tarifas.json``): las fichas se guardan en la base
    como las guarda la API, se leen con ``tarifas_propias`` —lo que hacen la
    planilla y la consola— y cada mueble tiene que dar la misma tarifa que en
    el navegador. Y ``GET /modelos`` las manda con el ``id`` que el navegador
    busca (``cli:<clave>``), retiradas incluidas."""
    from datetime import datetime, timezone

    from app.database import SessionLocal
    from app.models.models import ModeloMueble
    from app.services.catalogo_muebles import tarifa_del_mueble
    from app.services.fichas_propias import tarifas_propias

    casos = json.loads((RAIZ / "frontend" / "scripts" / "casos" / "tarifas.json").read_text(encoding="utf-8"))
    db = SessionLocal()
    try:
        for p in casos["propias"]:
            datos = {"w": 1.0, "d": 1.0, "h": 1.0, "fuente": {"confiabilidad": "estimado", "nota": "x"}}
            if p.get("variante"):
                datos["variante"] = p["variante"]
            if p.get("tarifa"):
                datos["tarifa"] = p["tarifa"]
            db.add(ModeloMueble(
                clave=p["clave"], tipo=p["tipo"], nombre=p["clave"], datos_json=json.dumps(datos),
                retirado_en=datetime.now(timezone.utc) if p.get("retirado") else None,
            ))
        db.commit()
        propios = tarifas_propias(db)
    finally:
        db.close()

    mal = []
    for caso in casos["casos"]:
        hoy = tarifa_del_mueble(caso["mueble"], propios)
        if hoy != caso["tarifa"]:
            mal.append(f"{caso['nombre']}: da «{hoy}» y tenía que ser «{caso['tarifa']}»")
    assert not mal, "\n".join(mal)

    r = client.get("/api/muebles/modelos", headers=worker)
    assert r.status_code == 200, r.text
    por_id = {m["id"]: m for m in r.json()}
    for p in casos["propias"]:
        m = por_id[f"cli:{p['clave']}"]
        assert (m["tipo"], m.get("tarifa"), m["retirado"]) == (p["tipo"], p.get("tarifa"), bool(p.get("retirado"))), p


def test_la_planilla_usa_la_tarifa_de_la_ficha_con_una_consulta(client, admin):
    """La media estiba propia se cobra con la tarifa de la media estiba; una
    estiba sin modelo, con la de la estiba. Y las fichas se leen UNA vez por
    planilla, no una por fila."""
    from sqlalchemy import event

    from app.database import engine
    from app.fechas import hoy

    _crear(client, admin, _media_estiba())
    _crear(client, admin, _nevera())
    plano = [_mueble(f"e{i}", f"EXP-{i:02d}", "isla", modelo="cli:media-estiba-propia", cx=2 * i) for i in range(1, 21)]
    plano.append(_mueble("x1", "EXP-90", "isla", cx=60, w=1.2, d=0.8, h=1.4))
    r = client.put("/api/layout/NAVE", json={"fixtures": plano, "base_updated_at": None}, headers=admin)
    assert r.status_code == 200, r.text
    client.put("/api/layout/rates", json={"default": {"isla": 3_000_000, "estiba_media": 900_000}, "by_sede": {}},
               headers=admin)
    desde, hasta = (hoy() + timedelta(days=10)).isoformat(), (hoy() + timedelta(days=20)).isoformat()
    filas = [{"fila": i + 1, "espacio": f"EXP-{i:02d}", "proveedor": "Alpina", "valor": 900_000,
              "desde": desde, "hasta": hasta} for i in range(1, 21)]
    filas.append({"fila": 99, "espacio": "EXP-90", "proveedor": "Alpina", "valor": 3_000_000,
                  "desde": desde, "hasta": hasta})

    consultas = []

    def anotar(conn, cursor, sentencia, *_):
        if "modelos_mueble" in sentencia:
            consultas.append(sentencia)

    event.listen(engine, "before_cursor_execute", anotar)
    try:
        r = client.post("/api/leases/bulk/validar", json={"sede": "NAVE", "filas": filas}, headers=admin)
    finally:
        event.remove(engine, "before_cursor_execute", anotar)
    assert r.status_code == 200, r.text
    por_fila = {f["fila"]: f for f in r.json()["filas"]}
    assert all(por_fila[i + 1]["referencia"] == 900_000 for i in range(1, 21)), por_fila
    assert por_fila[99]["referencia"] == 3_000_000
    assert len(consultas) == 1, consultas


def test_el_mapa_de_la_consola_usa_la_tarifa_de_la_ficha(client, admin):
    """``_numeros_del_layout`` es lo que leen las métricas y el detalle por
    cliente: una consulta a las fichas por cliente, no una por mueble."""
    from sqlalchemy import event

    from app import plataforma_metricas
    from app.database import SessionLocal, engine

    _crear(client, admin, _media_estiba())
    _crear(client, admin, {
        "clave": "carton-alpina", "tipo": "impulsador", "nombre": "Exhibidor de cartón Alpina",
        "w": 0.6, "d": 0.4, "h": 1.7, "tarifa": "exhibidor_carton",
        "fuente": {"confiabilidad": "estimado", "nota": "El que trajo la marca."},
    })
    client.post("/api/muebles/modelos/carton-alpina/retirar", headers=admin)
    plano = [
        _mueble("e1", "EXP-01", "isla", modelo="cli:media-estiba-propia"),
        _mueble("e2", "EXP-02", "isla"),
        _mueble("c1", "IMP-01", "impulsador", modelo="cli:carton-alpina"),
        # La ficha de una estiba en una punta no le cambia la tarifa.
        _mueble("p1", "PUN-01", "punta", modelo="cli:media-estiba-propia"),
    ]
    r = client.put("/api/layout/NAVE", json={"fixtures": plano, "base_updated_at": None}, headers=admin)
    assert r.status_code == 200, r.text
    # Otra sede: las fichas se leen una vez por cliente, no una por plano.
    otra = [{**_mueble("e9", "EXP-01", "isla", modelo="cli:media-estiba-propia"), "sede": "CENTRO"}]
    r = client.put("/api/layout/CENTRO", json={"fixtures": otra, "base_updated_at": None}, headers=admin)
    assert r.status_code == 200, r.text

    consultas = []

    def anotar(conn, cursor, sentencia, *_):
        if "modelos_mueble" in sentencia:
            consultas.append(sentencia)

    db = SessionLocal()
    event.listen(engine, "before_cursor_execute", anotar)
    try:
        _sedes, _caras, mapa = plataforma_metricas._numeros_del_layout(db)
    finally:
        event.remove(engine, "before_cursor_execute", anotar)
        db.close()
    assert {k: v for k, v in mapa.items() if k.startswith("NAVE-")} == {
        "NAVE-EXP-01": ("NAVE", "estiba_media"),
        "NAVE-EXP-02": ("NAVE", "isla"),
        "NAVE-IMP-01": ("NAVE", "exhibidor_carton"),
        "NAVE-PUN-01": ("NAVE", "punta"),
    }
    assert mapa["CENTRO-EXP-01"] == ("CENTRO", "estiba_media")
    assert len(consultas) == 1, consultas


@SEPTIEMBRE_DE_2026
def test_el_spread_de_la_consola_cuenta_con_la_tarifa_de_la_ficha(client, monkeypatch):
    """De punta a punta, por la consola de la plataforma: tres medias estibas
    propias a 900.000 contra la tarifa de la media estiba (1.000.000) dan
    -10 %. Sin la ficha, quedarían sin tarifa (el plano no tiene «isla»)."""
    from app.clientes import buscar, sesion_de
    from app.models.models import ModeloMueble
    from app.plataforma_metricas import limpiar_cache_metricas
    from tests.test_plataforma_metricas import (
        Identidades, _cab, _fila, _fundar, _operador_sin_membresias, _pedir, _sembrar,
    )
    from tests.test_plataforma_spread import _tarifas

    slug = "fichas"
    ids = Identidades(client)
    _fundar(ids, f"uid-{slug}", f"duena@{slug}.co", slug, "Fichas")
    fixtures = {"S1": [{"code": f"E-0{i}", "type": "isla", "sede": "S1", "modelo": "cli:media-propia"} for i in (1, 2, 3)]}
    contratos = [(f"S1-E-0{i}", f"Prov{i}", "2026-09-01", "2026-09-30", 900_000.0, True) for i in (1, 2, 3)]
    _sembrar(slug, fixtures, contratos)
    db = sesion_de(buscar(slug))
    try:
        db.add(ModeloMueble(clave="media-propia", tipo="isla", nombre="Media estiba",
                            datos_json=json.dumps({"w": 1.0, "d": 0.6, "h": 1.2, "tarifa": "estiba_media",
                                                   "fuente": {"confiabilidad": "estimado", "nota": "a ojo"}})))
        db.commit()
    finally:
        db.close()
    _tarifas(slug, {"default": {"estiba_media": 1_000_000.0}, "by_sede": {}})
    consola = _operador_sin_membresias(ids, monkeypatch)
    limpiar_cache_metricas()

    m = _fila(_pedir(client, _cab(consola["token"])), slug)["metricas"]
    assert m["contratos_sin_tarifa"] == 0, m
    assert m["spread_pct"] == -10.0, m


# ─── La tabla ─────────────────────────────────────────────────────────────────

def test_la_tabla_es_del_supermercado_y_no_reutiliza_ids(client):
    from app.database import Base, SessionLocal
    from app.models.models import ModeloMueble
    from app.services.traspaso import TABLAS_DEL_CLIENTE, TABLAS_DEL_REGISTRO, tablas_sin_clasificar

    assert "modelos_mueble" in TABLAS_DEL_CLIENTE
    assert "modelos_mueble" not in TABLAS_DEL_REGISTRO
    assert "modelos_mueble" in Base.metadata.tables
    assert tablas_sin_clasificar() == set()

    db = SessionLocal()
    try:
        datos = json.dumps({"w": 1.0, "d": 0.6, "h": 1.2, "fuente": {"confiabilidad": "ficha", "nota": "x"}})
        a = ModeloMueble(clave="a", tipo="isla", nombre="A", datos_json=datos)
        db.add(a)
        db.commit()
        id_a = a.id
        db.delete(a)
        db.commit()
        b = ModeloMueble(clave="b", tipo="isla", nombre="B", datos_json=datos)
        db.add(b)
        db.commit()
        assert b.id > id_a, "el id de una fila borrada volvió a usarse"
    finally:
        db.close()


def test_viaja_en_la_copia_por_una_ruta_segura_y_vuelve_igual(client, tmp_path):
    """Entra sola a la copia (es de negocio) y sin archivos: una ficha no
    lleva foto, así que nada de ``archivos/modelos_mueble``. La clave nunca
    arma una ruta del ZIP."""
    from sqlalchemy import create_engine

    from app.models.models import ModeloMueble
    from app.services.copia import restaurar, tablas_de_la_copia
    from tests.test_copia_de_seguridad import _bajar, _filas, _fundar, _motor_del_cliente

    assert "modelos_mueble" in {t.name for t in tablas_de_la_copia()}
    duena = _fundar(client)
    _crear(client, duena, _nevera())
    _crear(client, duena, _media_estiba())
    client.post("/api/muebles/modelos/media-estiba-propia/retirar", headers=duena)

    r = _bajar(client, duena)
    zf = zipfile.ZipFile(io.BytesIO(r.content))
    nombres = zf.namelist()
    assert "tablas/modelos_mueble.json" in nombres
    filas = json.loads(zf.read("tablas/modelos_mueble.json"))
    assert sorted(f["clave"] for f in filas) == ["media-estiba-propia", "nevera-inducol-2p"]
    assert any(f["retirado_en"] for f in filas)
    assert not [n for n in nombres if "modelos_mueble" in n and not n.startswith("tablas/")]
    for n in nombres:
        assert not n.startswith(("/", "\\")) and ".." not in n.split("/") and ":" not in n and "\\" not in n, n
        assert re.fullmatch(r"[\w./\-]+", n), n
    manifiesto = json.loads(zf.read("MANIFIESTO.json"))
    assert manifiesto["tablas"]["modelos_mueble"] == {"filas": 2}

    copia = tmp_path / "copia.zip"
    copia.write_bytes(r.content)
    destino = create_engine(f"sqlite:///{tmp_path / 'vuelta.db'}")
    try:
        assert restaurar(copia, destino)["modelos_mueble"] == 2
        tabla = ModeloMueble.__table__
        assert _filas(destino, tabla) == _filas(_motor_del_cliente(), tabla)
    finally:
        destino.dispose()


def test_las_rutas_literales_van_antes_que_las_parametricas(client):
    from conftest import rutas_planas

    rutas = [(r.path, m) for r in rutas_planas(client.app) if r.path.startswith("/api/muebles")
             for m in sorted(r.methods - {"HEAD", "OPTIONS"})]
    assert rutas == [
        ("/api/muebles/modelos", "GET"),
        ("/api/muebles/modelos", "POST"),
        ("/api/muebles/modelos/{clave}", "PUT"),
        ("/api/muebles/modelos/{clave}/retirar", "POST"),
        ("/api/muebles/modelos/{clave}/reactivar", "POST"),
    ]


def test_el_navegador_pide_las_rutas_que_existen(client):
    """Cada pedido de ``frontend/src/api/muebles.ts`` es una ruta de verdad,
    con su método. La prueba del store reemplaza la API entera y estas pruebas
    escriben sus propias URLs, así que una errata pasaba sin que nada fallara:
    con ``/muebles/modelo`` el servidor da 404, el store se lo traga y las
    paletas quedan sin fichas en silencio; con ``/retiro``, «Retirar» dice que
    la ficha ya no está y la deja en las paletas."""
    from conftest import rutas_planas

    texto = (RAIZ / "frontend" / "src" / "api" / "muebles.ts").read_text(encoding="utf-8")
    assert "baseURL" not in texto
    base = re.search(r'baseURL:\s*"([^"]+)"', (RAIZ / "frontend" / "src" / "api" / "client.ts").read_text(encoding="utf-8")).group(1)
    ruta = re.search(r"const ruta = \(clave: string\) => `([^`]+)`;", texto).group(1)
    ruta = ruta.replace("${encodeURIComponent(clave)}", "{clave}")
    pedidos = []
    for metodo, arg in re.findall(r'client\.(get|post|put|patch|delete)<[^>]*>\(\s*("[^"]*"|`[^`]*`|ruta\(clave\))', texto):
        if arg == "ruta(clave)":
            camino = ruta
        else:
            camino = arg[1:-1].replace("${ruta(clave)}", ruta)
        assert "${" not in camino, camino
        pedidos.append((metodo.upper(), base + camino))
    assert len(pedidos) == 5, pedidos
    assert len(re.findall(r"client\.(get|post|put|patch|delete)\b", texto)) == len(pedidos)
    del_servidor = {(m, r.path) for r in rutas_planas(client.app) for m in r.methods}
    faltan = [p for p in pedidos if p not in del_servidor]
    assert not faltan, faltan
    assert sorted(pedidos) == sorted([
        ("GET", "/api/muebles/modelos"), ("POST", "/api/muebles/modelos"), ("PUT", "/api/muebles/modelos/{clave}"),
        ("POST", "/api/muebles/modelos/{clave}/retirar"), ("POST", "/api/muebles/modelos/{clave}/reactivar"),
    ])


def test_la_tabla_tiene_lo_justo_y_casi_todo_va_en_el_json(client):
    """Una vez desplegada, esta tabla tampoco va a poder ganar columnas (que
    ninguna tabla vieja ganó una lo vigila ``test_t22``): lo que puede crecer va
    en ``datos_json``. Y la clave es única y el id no se reutiliza."""
    from app.models.models import ModeloMueble

    columnas = {c.name for c in ModeloMueble.__table__.columns}
    assert columnas == {"id", "clave", "tipo", "nombre", "datos_json", "retirado_en",
                        "creado_en", "actualizado_en", "creado_por"}
    assert ModeloMueble.__table__.dialect_kwargs.get("sqlite_autoincrement") is True
    assert ModeloMueble.__table__.c.clave.unique is True
