"""Los modelos de muebles y los dos tipos nuevos, del lado del servidor.

Un MODELO es la ficha de un mueble de verdad dentro de un tipo —la media
estiba, la nevera de tres puertas de Frigomaster, el exhibidor de cartón— con
la URL de donde salieron sus medidas. Al colocarlo, el plano guarda su id en
``modelo``. Lo único que el servidor lee de un modelo es su TARIFA propia: la
media estiba, el cuarto de estiba y el exhibidor de cartón se cobran aparte de
su tipo, y la planilla y la plataforma tienen que buscar la tarifa de
referencia con la misma clave que la pantalla (``rateTypeOf`` en
``frontend/src/types/fixtures.ts``).

Lo que se vigila acá:

* que los modelos del catálogo sean válidos para lo que el servidor lee;
* que ``tarifa_del_mueble`` mire el modelo primero y, si no, el tipo —y que un
  mueble sin ``modelo`` dé exactamente lo de antes—;
* que la planilla y la plataforma usen esa tarifa;
* que la nevera de puertas (``NEV``) y el puesto de impulso (``PIM``) tengan su
  prefijo, se vendan enteros y por una sola cara.

Nada de ``from app…`` a nivel de módulo: cada prueba importa lo suyo adentro
(ver el encabezado de ``test_espacio_vendible.py``).
"""
import json
import re
from datetime import timedelta
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
CATALOGO = RAIZ / "backend" / "app" / "catalogo" / "muebles.json"


def _catalogo() -> dict:
    return json.loads(CATALOGO.read_text(encoding="utf-8"))


def _mueble(id_, code, tipo, **extra):
    base = {
        "id": id_, "code": code, "sede": "NAVE", "type": tipo, "label": tipo,
        "cx": 2 + len(id_), "cz": 3, "rotY": 0, "w": 1.0, "d": 0.6, "h": 1.2, "color": "#f59e0b",
        "status": "free", "supplierName": "", "brandCategory": "", "negotiatedValue": 0,
        "startDate": "", "endDate": "", "observation": "",
    }
    base.update(extra)
    return base


# ─── El archivo ───────────────────────────────────────────────────────────────

def test_los_modelos_son_validos_para_lo_que_lee_el_servidor():
    """La validación entera (rangos, geometría, fuente) la hace
    ``probar-catalogo.mjs``; acá va lo que rompería al servidor o lo que nunca
    puede pasar: ids repetidos, un tipo que no existe, una tarifa sin fila, y
    una imagen de terceros como fuente."""
    cat = _catalogo()
    modelos = cat["modelos"]
    assert modelos, "el catálogo no tiene modelos"
    ids = [m["id"] for m in modelos]
    assert len(ids) == len(set(ids)), "dos modelos con el mismo id"
    implicitos = {f"base:{t}" for t in [*cat["tipos"], *cat["alias"]]}
    claves_de_tarifa = {t["clave"] for t in cat["tarifas"]}
    for m in modelos:
        assert re.fullmatch(r"base:[a-z0-9]+(-[a-z0-9]+)*", m["id"]), m["id"]
        assert m["id"] not in implicitos, f"{m['id']} es el id del modelo base implícito de un tipo"
        tipo = cat["tipos"].get(m["tipo"])
        assert tipo and not tipo.get("legado"), f"{m['id']}: el tipo {m['tipo']} no existe"
        if "tarifa" in m:
            assert m["tarifa"] in claves_de_tarifa, f"{m['id']}: la tarifa {m['tarifa']} no está en `tarifas`"
            assert m["tarifa"] != tipo.get("tarifa"), m["id"]
            assert m.get("informe") and m.get("informePlural"), m["id"]
        fuente = m["fuente"]
        assert fuente["confiabilidad"] in ("ficha", "catalogo", "estimado"), m["id"]
        assert fuente["url"].startswith("https://"), m["id"]
        assert not re.search(r"\.(jpe?g|png|webp|gif|avif|svg|bmp)(\?.*)?$", fuente["url"], re.I), (
            f"{m['id']}: la fuente es una imagen; se guarda la página de la ficha, nunca una foto"
        )
        assert set(m) <= {"id", "tipo", "variante", "nombre", "w", "d", "h", "entrepanos", "modulo",
                          "partes", "color", "tarifa", "informe", "informePlural", "fuente"}, m["id"]


def test_la_tarifa_propia_de_un_modelo_es_la_suya_y_no_cambia_de_tipo():
    """Las tarifas de los modelos son las que la pantalla de Tarifas ofrece,
    y ninguna es la clave de un tipo (la media estiba no se cobra como la
    estiba entera)."""
    cat = _catalogo()
    de_tipos = {d.get("tarifa") for d in cat["tipos"].values()}
    propias = {m["id"]: m["tarifa"] for m in cat["modelos"] if "tarifa" in m}
    assert propias == {
        "base:estiba-media": "estiba_media",
        "base:estiba-cuarta": "estiba_cuarta",
        "base:exhibidor-carton": "exhibidor_carton",
    }
    assert not set(propias.values()) & de_tipos


def test_un_id_de_modelo_que_ya_salio_no_desaparece_ni_cambia_de_tipo():
    """El mueble colocado guarda el id: con él se busca la tarifa propia y el
    nombre del modelo en el panel. La lista de los que ya salieron está escrita
    aparte (``frontend/scripts/casos/modelos-ids.json``, la misma que lee
    ``probar-catalogo``): un id no se borra, no se renombra y no cambia de tipo,
    variante ni tarifa; uno nuevo se suma a la lista."""
    escritos = json.loads((RAIZ / "frontend" / "scripts" / "casos" / "modelos-ids.json").read_text(encoding="utf-8"))["modelos"]
    hoy = {}
    for m in _catalogo()["modelos"]:
        e = {"tipo": m["tipo"]}
        if m.get("variante"):
            e["variante"] = m["variante"]
        if m.get("tarifa"):
            e["tarifa"] = m["tarifa"]
        hoy[m["id"]] = e
    for id_, esperado in escritos.items():
        assert id_ in hoy, f"el modelo «{id_}» desapareció (o se renombró): lo colocado con él pierde su nombre y su tarifa"
        assert hoy[id_] == esperado, f"«{id_}» cambió: {esperado} → {hoy[id_]}"
    nuevos = sorted(set(hoy) - set(escritos))
    assert not nuevos, f"modelos nuevos sin sumar a casos/modelos-ids.json: {nuevos}"


# ─── La tarifa del mueble ─────────────────────────────────────────────────────

def test_la_tarifa_del_mueble_mira_primero_su_modelo(client):
    from app.services.catalogo_muebles import tarifa_del_mueble

    casos = [
        ({"type": "isla"}, "isla"),
        ({"type": "isla", "modelo": "base:estiba-completa"}, "isla"),
        ({"type": "isla", "modelo": "base:estiba-media"}, "estiba_media"),
        ({"type": "isla", "modelo": "base:estiba-cuarta"}, "estiba_cuarta"),
        ({"type": "impulsador", "modelo": "base:exhibidor-carton"}, "exhibidor_carton"),
        ({"type": "nevera_puertas", "modelo": "base:nevera-3p-frigomaster"}, "nevera_puertas"),
        ({"type": "nevera_puertas"}, "nevera_puertas"),
        ({"type": "puesto_impulso"}, "puesto_impulso"),
        ({"type": "gondola_mural", "modelo": "base:gondola-pared-200-m120"}, "gondola"),
        # Un id que no corresponde no le cambia la tarifa a nadie.
        ({"type": "punta", "modelo": "base:estiba-media"}, "punta"),
        ({"type": "isla", "modelo": "base:no-existe"}, "isla"),
        ({"type": "isla", "modelo": 7}, "isla"),
        ({"type": "isla", "modelo": None}, "isla"),
    ]
    for fixture, esperado in casos:
        assert tarifa_del_mueble(fixture) == esperado, fixture


def test_un_mueble_sin_modelo_da_la_tarifa_de_siempre(client):
    """La promesa del catálogo: un plano viejo no tiene ``modelo``, y su
    tarifa es exactamente la de su tipo, la que daba antes."""
    from app.services.catalogo_muebles import tarifa_del_mueble, tipo_de_tarifa

    cat = _catalogo()
    for tipo in [*cat["tipos"], *cat["alias"], "tipo_que_no_existe", ""]:
        assert tarifa_del_mueble({"type": tipo}) == tipo_de_tarifa(tipo), tipo


def test_la_planilla_busca_la_referencia_con_la_tarifa_del_modelo(client, admin):
    """La media estiba se cobra con la tarifa de la media estiba; la estiba
    sin modelo, con la de la estiba, como siempre."""
    from app.fechas import hoy

    plano = [
        _mueble("e1", "EXP-01", "isla", modelo="base:estiba-media", w=1.0, d=0.6, h=1.2),
        _mueble("e2", "EXP-02", "isla", w=1.2, d=0.8, h=1.4),
    ]
    r = client.put("/api/layout/NAVE", json={"fixtures": plano, "base_updated_at": None}, headers=admin)
    assert r.status_code == 200, r.text
    client.put("/api/layout/rates",
               json={"default": {"isla": 3_000_000, "estiba_media": 900_000}, "by_sede": {}}, headers=admin)
    desde = (hoy() + timedelta(days=10)).isoformat()
    hasta = (hoy() + timedelta(days=20)).isoformat()
    filas = [
        {"fila": 2, "espacio": "EXP-01", "proveedor": "Alpina", "valor": 900_000, "desde": desde, "hasta": hasta},
        {"fila": 3, "espacio": "EXP-02", "proveedor": "Alpina", "valor": 3_000_000, "desde": desde, "hasta": hasta},
    ]
    r = client.post("/api/leases/bulk/validar", json={"sede": "NAVE", "filas": filas}, headers=admin)
    assert r.status_code == 200, r.text
    por_fila = {f["fila"]: f for f in r.json()["filas"]}
    assert por_fila[2]["referencia"] == 900_000, por_fila[2]
    assert por_fila[3]["referencia"] == 3_000_000, por_fila[3]


def test_la_plataforma_cuenta_cada_espacio_con_la_tarifa_de_su_modelo(client):
    from app import plataforma_metricas

    plano = [
        _mueble("e1", "EXP-01", "isla", modelo="base:estiba-cuarta"),
        _mueble("e2", "EXP-02", "isla"),
        _mueble("c1", "IMP-01", "impulsador", modelo="base:exhibidor-carton"),
        _mueble("n1", "NEV-01", "nevera_puertas", modelo="base:nevera-2p-inducol", partes={"puertas": 2}),
        _mueble("p1", "PIM-01", "puesto_impulso"),
    ]
    mapa = plataforma_metricas._mapa_tipos_de_sede(plano, "NAVE")
    assert mapa == {
        "NAVE-EXP-01": ("NAVE", "estiba_cuarta"),
        "NAVE-EXP-02": ("NAVE", "isla"),
        "NAVE-IMP-01": ("NAVE", "exhibidor_carton"),
        "NAVE-NEV-01": ("NAVE", "nevera_puertas"),
        "NAVE-PIM-01": ("NAVE", "puesto_impulso"),
    }


# ─── Los tipos nuevos ─────────────────────────────────────────────────────────

def test_los_prefijos_de_los_tipos_nuevos(client):
    """``NEV`` (la nevera de puertas; la de bebidas abierta sigue siendo
    ``BEB``) y ``PIM`` (el puesto de impulso). Los prefijos de siempre no se
    tocaron."""
    from app.services import renumeracion

    assert renumeracion.prefijo_de("nevera_puertas") == "NEV"
    assert renumeracion.prefijo_de("puesto_impulso") == "PIM"
    assert renumeracion.prefijo_de("nevera_refrescos") == "BEB"
    assert renumeracion.prefijo_de("impulsador") == "IMP"
    prefijos = list(renumeracion.PREFIJO_POR_TIPO.values())
    tipos = _catalogo()["tipos"]
    assert len({tipos[t]["prefijo"] for t in tipos}) == len(tipos), "dos tipos con el mismo prefijo"
    assert "NEV" in prefijos and "PIM" in prefijos

    plano = [
        _mueble("n1", "X-1", "nevera_puertas", cx=1, cz=1),
        _mueble("n2", "X-2", "nevera_puertas", cx=4, cz=1),
        _mueble("p1", "X-3", "puesto_impulso", cx=7, cz=1),
    ]
    codigos = sorted(codigo for _, _, codigo in renumeracion.codigos_nuevos(plano))
    assert codigos == ["NEV-01", "NEV-02", "PIM-01"], codigos


def test_los_tipos_nuevos_se_venden_enteros_y_por_una_cara(client):
    """La nevera de puertas se vende ENTERA por ahora: sus puertas sólo sirven
    para dibujarla. Ni puertas ni cara B como espacio aparte."""
    from app.services.layout_lookup import caras_de, es_comercializable, espacios_ofrecidos

    plano = [
        _mueble("n1", "NEV-01", "nevera_puertas", modelo="base:nevera-4p-frigomaster", partes={"puertas": 4}),
        _mueble("p1", "PIM-01", "puesto_impulso"),
    ]
    for f in plano:
        assert es_comercializable(f) is True, f["type"]
        assert caras_de(f) == 1, f["type"]
    assert espacios_ofrecidos(plano, "NAVE") == {"NAVE-NEV-01", "NAVE-PIM-01"}


def test_las_tarifas_de_los_modelos_siguen_al_catalogo(client, tmp_path):
    """Lo que hace ``test_cada_tabla_del_servidor_cambia_cuando_cambia_el_catalogo``
    con las tablas de los tipos, con la de los modelos: una copia escrita a
    mano que hoy coincide no pasa."""
    from tests.test_catalogo_muebles import _catalogo_muebles_con

    c = _catalogo()
    media = next(m for m in c["modelos"] if m["id"] == "base:estiba-media")
    media["tarifa"] = "media_adulterada"
    m = _catalogo_muebles_con(tmp_path, c)
    assert m.TARIFA_POR_MODELO["base:estiba-media"] == ("isla", "media_adulterada")
    assert m.tarifa_del_mueble({"type": "isla", "modelo": "base:estiba-media"}) == "media_adulterada"
    assert "base:estiba-completa" not in m.TARIFA_POR_MODELO
