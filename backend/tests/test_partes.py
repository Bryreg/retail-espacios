"""Vender por partes: la regla, con los MISMOS casos que el navegador.

La dueña pidió vender la nevera entera o por puertas, nunca las dos en las
mismas fechas, y eligió el código: ``NEV-03-PU2`` es la puerta 2 contando de
izquierda a derecha mirando el frente. La regla está escrita dos veces —en
``app/services/partes.py`` (y ``espacios_de`` de ``layout_lookup.py``), que es
el que decide, y en ``frontend/src/utils/partes.ts``, que avisa en Vender antes
de guardar— y las dos corren ``frontend/scripts/casos/partes.json``
(``probar-partes.mjs`` del otro lado).

Y la red de todo el paso: **un plano sin configuración de partes da exactamente
lo de antes** (los espacios que ofrece, la tarifa, lo que ve la mercaderista).

Las pruebas piden ``client`` aunque no usen la API: es el que apunta la base a
una descartable antes de importar ``app`` (ver ``conftest.py``).
"""
import json
from pathlib import Path

CASOS = json.loads(
    (Path(__file__).resolve().parents[2] / "frontend/scripts/casos/partes.json").read_text(encoding="utf-8")
)
ANTES = json.loads(
    (Path(__file__).resolve().parents[2] / "frontend/scripts/casos/catalogo-antes.json").read_text(encoding="utf-8")
)


def _sufijo(p):
    return p.sufijo if p is not None else None


def test_como_se_parte_un_codigo(client):
    from app.services.partes import codigo_de_parte, partir_codigo

    for c in CASOS["codigos"]:
        r = partir_codigo(c["codigo"])
        assert (r.base, r.cara, _sufijo(r.parte)) == (c["base"], c["cara"], c["parte"]), c["codigo"]
        assert codigo_de_parte(r.base, r.cara, r.parte) == c.get("armado", c["codigo"]), c["codigo"]


def test_que_ofrece_cada_mueble(client):
    from app.services.layout_lookup import caras_por_participacion, espacios_de
    from app.services.partes import division_de, firma_de_partes

    for c in CASOS["muebles"]:
        assert espacios_de(c["mueble"], "NAVE") == c["espacios"], c["nombre"]
        d = division_de(c["mueble"])
        assert (list(d) if d else None) == c["division"], c["nombre"]
        if "firma" in c:
            assert firma_de_partes(c["mueble"]) == c["firma"], c["nombre"]
        if "carasPorParticipacion" in c:
            assert sorted(caras_por_participacion([c["mueble"]], "NAVE")) == c["carasPorParticipacion"], c["nombre"]


def test_que_choca_con_que(client):
    from app.services.partes import chocan, partir_codigo

    for c in CASOS["chocan"]:
        assert chocan(partir_codigo(c["a"]), partir_codigo(c["b"])) is c["chocan"], f"{c['a']} / {c['b']}: {c['por']}"


def test_la_tarifa_de_cada_espacio(client):
    from app.services.partes import partir_codigo, referencia_de_espacio

    for c in CASOS["tarifas"]:
        parte = partir_codigo(f"X-{c['parte']}").parte if c["parte"] else None
        assert referencia_de_espacio(c["rates"], c["sede"], c["mueble"], parte) == (c["valor"], c["origen"]), c["nombre"]


def test_los_nombres_reservados(client):
    from app.services.partes import termina_reservado

    for c in CASOS["reservados"]:
        assert termina_reservado(c["nombre"]) is c["reservado"], c["nombre"]


def test_de_partes_solo_pasa_lo_conocido(client):
    from app.services.partes import partes_tipadas

    for c in CASOS["tipadas"]:
        assert partes_tipadas(c["partes"]) == c["salida"], c["nombre"]


def test_los_textos_de_una_parte(client):
    from app.services.partes import partir_codigo, texto_de_parte, texto_para_montar

    pu2 = partir_codigo("NEV-03-PU2").parte
    assert texto_de_parte(pu2, 3) == "Puerta 2 de 3"
    assert texto_para_montar(pu2, 3) == "Puerta 2 de 3, contando de izquierda a derecha mirando el frente"


def test_la_compuerta_de_una_cara_por_participacion(client):
    """Una cara que se vende por participación no se vende entera ni por
    partes físicas; su participación (``…-PC3``) existe. Y una participación
    de una cara que NO se vende así no existe. Las frases dicen qué hacer y no
    nombran a nadie (Vender las lee delante del proveedor)."""
    from app.services.layout_lookup import (
        NO_COMERCIALIZABLE, PARTE_INEXISTENTE, POR_PARTICIPACION, SIN_CARA_B, caras_por_participacion,
        motivo_para_no_vender_parte, ofrece, por_participacion,
    )
    from app.services.partes import cantidad_de, partir_codigo, texto_de_parte, texto_para_montar

    doble = {"code": "GON-01", "type": "gondola", "entrepanos": 4, "partes": {"division": "participacion"}}
    mural = {"code": "GON-02", "type": "gondola", "gondolaType": "wall", "partes": {"division": "participacion"}}
    nevera = {"code": "NEV-03", "type": "nevera_puertas", "partes": {"puertas": 3, "division": "puertas"}}
    tapada = {**doble, "rentable": False}

    def motivo(f, codigo):
        m = motivo_para_no_vender_parte(f, partir_codigo(codigo))
        return m[0] if m else None

    entera = motivo_para_no_vender_parte(doble, partir_codigo("NAVE-GON-01"))
    assert entera[0] == POR_PARTICIPACION
    assert "se vende por participación" in entera[1] and "Vender" in entera[1], entera
    assert motivo(doble, "NAVE-GON-01-B") == POR_PARTICIPACION
    assert motivo(doble, "NAVE-GON-01-PC1") is None
    assert motivo(doble, "NAVE-GON-01-B-PC7") is None
    # Con entrepaños guardados no se vende por entrepaños: una sola forma.
    en = motivo_para_no_vender_parte(doble, partir_codigo("NAVE-GON-01-EN1"))
    assert en[0] == PARTE_INEXISTENTE and "no hay EN1" in en[1], en
    assert motivo(doble, "NAVE-GON-01-TR2") == PARTE_INEXISTENTE
    # El mural no tiene cara B, tampoco por participación.
    assert motivo(mural, "NAVE-GON-02-B-PC1") == SIN_CARA_B
    assert motivo(mural, "NAVE-GON-02-PC1") is None
    # Una participación de lo que no se vende así: no existe.
    pc = motivo_para_no_vender_parte(nevera, partir_codigo("NAVE-NEV-03-PC1"))
    assert pc[0] == PARTE_INEXISTENTE and "no se vende por participación" in pc[1], pc
    # Lo de siempre de la nevera no cambia.
    assert motivo(nevera, "NAVE-NEV-03") is None and motivo(nevera, "NAVE-NEV-03-PU2") is None
    # No comercializable: ni la cara ni sus participaciones.
    assert not por_participacion(tapada)
    assert motivo(tapada, "NAVE-GON-01") == NO_COMERCIALIZABLE
    assert motivo(tapada, "NAVE-GON-01-PC1") == NO_COMERCIALIZABLE
    # Una caja no se vende por participación (no tiene receta ni es comercializable).
    caja = {"code": "CAJ-04", "type": "checkout", "partes": {"bahias": 2, "division": "participacion"}}
    assert motivo(caja, "NAVE-CAJ-04-PC1") == NO_COMERCIALIZABLE
    assert motivo(caja, "NAVE-CAJ-04-BI1") is None

    # «Ofrecido»: una participación, si su cara se vende por participación.
    caras = caras_por_participacion([doble, mural, nevera], "NAVE")
    assert caras == {"NAVE-GON-01", "NAVE-GON-01-B", "NAVE-GON-02"}
    assert ofrece(set(), caras, "NAVE-GON-01-PC9") and ofrece(set(), caras, "nave-gon-01-b-pc1")
    assert not ofrece(set(), caras, "NAVE-NEV-03-PC1") and not ofrece(set(), caras, "NAVE-GON-02-B-PC1")
    assert ofrece({"NAVE-NEV-03"}, caras, "NAVE-NEV-03") and not ofrece(set(), caras, "NAVE-GON-01")

    # La participación no la cuenta ningún campo del mueble, y se lee así.
    p3 = partir_codigo("NAVE-GON-01-PC3").parte
    assert cantidad_de(doble, "participacion") is None
    assert texto_de_parte(p3) == "Participación 3" and texto_para_montar(p3) == "Participación 3"


def test_un_plano_sin_partes_ofrece_lo_mismo_que_antes(client):
    """El plano sintético de la referencia del catálogo (``catalogo-antes.json``,
    un mueble de cada tipo y los legados) ofrece lo mismo que antes de la venta
    por partes —lo compara entero ``test_catalogo_muebles``—, y también si cada
    mueble trae ``partes`` sin ``division`` (las puertas de una ficha, que sólo
    dibujan) o con una división que su familia no admite."""
    from app import plataforma_metricas
    from app.services import layout_lookup

    sede, muebles = ANTES["plano"]["sede"], ANTES["plano"]["muebles"]
    esperado = ANTES["python"]["plano"]["espacios_ofrecidos"]["valor"]
    assert sorted(layout_lookup.espacios_ofrecidos(muebles, sede)) == esperado
    con_partes = [{**f, "partes": {"puertas": 3}} for f in muebles]
    assert sorted(layout_lookup.espacios_ofrecidos(con_partes, sede)) == esperado
    mal_divididos = [{**f, "partes": {"puertas": 3, "division": "tramos"}} for f in muebles]
    assert sorted(layout_lookup.espacios_ofrecidos(mal_divididos, sede)) == esperado
    assert plataforma_metricas._mapa_partes_de_sede(con_partes, sede) == {}
    assert plataforma_metricas._mapa_partes_de_sede(mal_divididos, sede) == {}


def test_la_ficha_propia_guarda_como_se_vende(client):
    """Hasta vender por partes, ``ficha_normalizada`` guardaba de ``partes``
    sólo las puertas: la manera de venderla que la dueña eligió en el taller
    se perdía sin aviso."""
    from app.services.catalogo_muebles import ficha_normalizada, problemas_de_la_ficha

    ficha = {
        "clave": "inducol-2p", "tipo": "nevera_puertas", "nombre": "Nevera Inducol 2 puertas",
        "w": 1.445, "d": 0.74, "h": 2.1, "partes": {"puertas": 2, "division": "puertas"},
        "fuente": {"confiabilidad": "ficha", "nota": "de la ficha"},
    }
    assert problemas_de_la_ficha(ficha) == []
    assert ficha_normalizada(ficha)["partes"] == {"puertas": 2, "division": "puertas"}
    # Una puerta sola no se divide, y una góndola no se vende por puertas.
    campos = lambda f: sorted(k for k, _ in problemas_de_la_ficha(f))  # noqa: E731
    assert campos({**ficha, "partes": {"puertas": 1, "division": "puertas"}}) == ["partes.division"]
    assert campos({**ficha, "partes": {"division": "puertas"}}) == ["partes.division"]
    assert campos({**ficha, "partes": {"puertas": 2, "division": "tramos"}}) == ["partes.division"]
    gondola = {"clave": "g", "tipo": "gondola", "variante": "double", "nombre": "G",
               "w": 1.0, "d": 0.8, "h": 2.0, "partes": {"division": "puertas"},
               "fuente": {"confiabilidad": "ficha", "nota": "medida"}}
    assert campos(gondola) == ["partes.division"]


# ─── La consola: por cara, con la tarifa de la puerta y sin «fuera del plano» ──

def test_la_consola_cuenta_las_puertas_por_cara_con_su_tarifa_y_sobre_el_plano():
    """La consola de la plataforma mira los mismos planos: una puerta vendida es
    un contrato SOBRE el plano (no «fuera»), ocupa su nevera (la ocupación es
    por cara: dos puertas son una cara ocupada) y su spread se mide contra la
    tarifa de la puerta, no contra la de la nevera entera."""
    from datetime import date

    from app import plataforma_detalle as pd
    from app import plataforma_metricas as pm

    nevera = {"code": "NEV-03", "sede": "NAVE", "type": "nevera_puertas", "w": 2.07, "d": 0.7,
              "partes": {"puertas": 3, "division": "puertas"}}
    partes = pm._mapa_partes_de_sede([nevera], "NAVE")
    assert set(partes) == {"NAVE-NEV-03-PU1", "NAVE-NEV-03-PU2", "NAVE-NEV-03-PU3"}
    sede, clase, tarifa_cara, n = partes["NAVE-NEV-03-PU2"]
    assert (sede, clase, n) == ("NAVE", "parte_puerta", 3)

    # Sin tarifa de la puerta: la de la nevera entre sus puertas, al peso.
    tarifas = {"default": {tarifa_cara: 1_000_000}, "by_sede": {}}
    assert pm.tarifa_de_parte(tarifas, partes["NAVE-NEV-03-PU2"]) == 333_333
    # Con la de la puerta en la sede, ésa.
    tarifas["by_sede"] = {"NAVE": {"parte_puerta": 250_000}}
    assert pm.tarifa_de_parte(tarifas, partes["NAVE-NEV-03-PU2"]) == 250_000
    assert pm.tarifa_de_parte({"default": {}, "by_sede": {}}, partes["NAVE-NEV-03-PU2"]) is None

    # La ocupación es por cara.
    assert pm.cara_ocupada("NAVE-NEV-03-PU2") == "NAVE-NEV-03"
    assert pm.cara_ocupada("NAVE-GON-01-B") == "NAVE-GON-01-B"
    assert pm.cara_ocupada("NAVE-NEV-03") == "NAVE-NEV-03"

    # Lo que puede tener contrato: las caras y las puertas.
    mapa_tipos = pm._mapa_tipos_de_sede([nevera], "NAVE")
    tipos = pd._tipos_de_contrato(mapa_tipos, partes)
    assert {"NAVE-NEV-03", "NAVE-NEV-03-PU2"} <= set(tipos)
    assert set(mapa_tipos) == {"NAVE-NEV-03"}, "las puertas no son espacios nuevos del universo"

    # El detalle: la cara está ocupada por sus puertas, que van debajo, sin tarifa.
    desde, hasta = date(2026, 9, 1), date(2026, 9, 30)
    c = pd._Contrato("NAVE-NEV-03-PU2", "Postobón", None, 300_000.0, date(2026, 9, 1), date(2026, 12, 31), True,
                     date(2026, 12, 31))  # corre_hasta: corrió su plazo entero (P1-17)
    espacios = pd._armar_espacios(mapa_tipos, {"NAVE-NEV-03": nevera}, {}, {"NAVE-NEV-03-PU2": c},
                                  desde, hasta, partes)
    (e,) = espacios
    assert e["estado"] == "ocupado" and e["contrato"] is None
    assert [(p["parte"], p["codigo"], p["codigo_corto"]) for p in e["partes"]] == [
        ("PU2", "NAVE-NEV-03-PU2", "NEV-03-PU2")]
    assert "tarifa" not in json.dumps(e)
    # Sin puertas vendidas, las claves de siempre.
    (libre,) = pd._armar_espacios(mapa_tipos, {"NAVE-NEV-03": nevera}, {}, {}, desde, hasta, partes)
    assert "partes" not in libre and libre["estado"] == "libre"
