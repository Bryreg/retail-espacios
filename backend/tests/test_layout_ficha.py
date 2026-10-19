"""Una pestaña vieja no borra la ficha del mueble que escribió una nueva.

La ficha —``modelo``, ``partes``, ``entrepanos``, ``modulo``
(``CLAVES_DE_FICHA``)— son claves nuevas del JSON del plano. Un editor abierto
desde antes de que existieran no las conoce y hasta el 2026-10-13 las perdía al
mover el mueble: el guardado le borraba a la góndola los entrepaños y el módulo
que otra pestaña le había puesto, y con ellos cambiaban las filas del arte de lo
que ya estaba vendido.

``PUT /api/layout/{sede}`` las cuida (``_con_la_ficha_de_antes``):

- **ausente** en un mueble que ya estaba (mismo ``id``): se rellena con la
  guardada;
- ``null``: el navegador de hoy la borró a propósito; se saca del JSON;
- un mueble **nuevo** no hereda nada;
- un plano sin ninguna de estas claves se guarda exactamente igual que antes.
"""
import json

GONDOLA = {
    "id": "g1", "code": "GON-03", "sede": "NAVE", "type": "gondola", "gondolaType": "double",
    "label": "Góndola Doble", "cx": 4, "cz": 6, "rotY": 0,
    "w": 3.0, "d": 0.9, "h": 2.0, "color": "#6366f1",
}
FICHA = {
    "modelo": "base:gondola-central-200-m100", "entrepanos": 4, "modulo": 1.0,
}
NEVERA = {
    "id": "n1", "code": "NEV-01", "sede": "NAVE", "type": "nevera_puertas",
    "label": "Nevera de Puertas", "cx": 9, "cz": 2, "rotY": 0,
    "w": 2.07, "d": 0.7, "h": 2.1, "color": "#1e293b",
    "modelo": "base:nevera-3p-frigomaster", "partes": {"puertas": 3},
}


def _guardar(client, headers, fixtures, sede="NAVE"):
    r = client.put(f"/api/layout/{sede}", headers=headers,
                   json={"fixtures": fixtures, "base_updated_at": None})
    assert r.status_code == 200, r.text
    return r.json()


def _leer(client, headers, sede="NAVE"):
    r = client.get(f"/api/layout/{sede}", headers=headers)
    assert r.status_code == 200, r.text
    return {f["id"]: f for f in r.json()["fixtures"]}


def _crudo(sede="NAVE"):
    """Lo que quedó escrito en la base, tal cual."""
    from app.database import SessionLocal
    from app.models.models import LayoutSnapshot
    db = SessionLocal()
    try:
        snap = db.query(LayoutSnapshot).filter(LayoutSnapshot.sede == sede).first()
        return snap.fixtures_json if snap else None
    finally:
        db.close()


# ─── Ausente se conserva ─────────────────────────────────────────────────────

def test_UNA_PESTANA_VIEJA_NO_BORRA_LA_FICHA(client, admin):
    """La pestaña de antes mueve la góndola y no sabe qué es `entrepanos`."""
    _guardar(client, admin, [{**GONDOLA, **FICHA}, NEVERA])
    movida = {**GONDOLA, "cx": 5.5}                    # sin ninguna clave de la ficha
    nevera_vieja = {k: v for k, v in NEVERA.items() if k not in ("modelo", "partes")}
    _guardar(client, admin, [movida, nevera_vieja])

    g = _leer(client, admin)["g1"]
    assert g["cx"] == 5.5, "el movimiento de la pestaña vieja no se guardó"
    for clave, valor in FICHA.items():
        assert g[clave] == valor, f"la pestaña vieja borró «{clave}»"
    n = _leer(client, admin)["n1"]
    assert n["modelo"] == NEVERA["modelo"] and n["partes"] == {"puertas": 3}, "la nevera perdió sus puertas"


def test_se_rellena_solo_lo_que_falta(client, admin):
    """Lo que la pestaña SÍ manda es una edición y manda."""
    _guardar(client, admin, [{**GONDOLA, **FICHA}])
    _guardar(client, admin, [{**GONDOLA, "entrepanos": 5}])   # modelo y módulo, ausentes
    g = _leer(client, admin)["g1"]
    assert g["entrepanos"] == 5, "el valor nuevo no mandó"
    assert g["modelo"] == FICHA["modelo"] and g["modulo"] == FICHA["modulo"], "se perdió lo que no venía"


# ─── null se borra ───────────────────────────────────────────────────────────

def test_NULL_ES_BORRADO_A_PROPOSITO(client, admin):
    """El panel vació «Entrepaños»: vuelve a la cuenta de siempre."""
    _guardar(client, admin, [{**GONDOLA, **FICHA}])
    _guardar(client, admin, [{**GONDOLA, **FICHA, "entrepanos": None, "modulo": None}])
    g = _leer(client, admin)["g1"]
    assert "entrepanos" not in g and "modulo" not in g, "el null no borró"
    assert g["modelo"] == FICHA["modelo"], "borrar dos claves se llevó la tercera"
    # Y el null no queda escrito: un guardado viejo después no lo «rellena».
    assert '"entrepanos"' not in _crudo() and '"modulo"' not in _crudo()
    _guardar(client, admin, [dict(GONDOLA)])
    g = _leer(client, admin)["g1"]
    assert "entrepanos" not in g and "modulo" not in g, "lo borrado volvió con un guardado viejo"


def test_un_null_en_el_primer_guardado_tampoco_se_guarda(client, admin):
    _guardar(client, admin, [{**GONDOLA, "entrepanos": None, "partes": None}])
    assert "null" not in _crudo()


# ─── Un mueble nuevo no hereda ───────────────────────────────────────────────

def test_UN_MUEBLE_NUEVO_NO_HEREDA_NADA(client, admin):
    """Borrar la góndola y dibujar otra con el mismo nombre: es otro mueble."""
    _guardar(client, admin, [{**GONDOLA, **FICHA}])
    otra = {**GONDOLA, "id": "g2"}                       # mismo código, otro id
    _guardar(client, admin, [otra])
    fixtures = _leer(client, admin)
    assert "g1" not in fixtures
    for clave in FICHA:
        assert clave not in fixtures["g2"], f"el mueble nuevo heredó «{clave}» del borrado"


def test_UN_MUEBLE_DE_OTRO_TIPO_CON_EL_MISMO_ID_NO_HEREDA(client, admin):
    """Una punta que llega con el id de una góndola guardada (un PUT armado a
    mano, una importación) no se queda con la ficha de la góndola: sus 4
    entrepaños entran en el rango de la punta y se dibujarían."""
    _guardar(client, admin, [{**GONDOLA, **FICHA}])
    punta = {**GONDOLA, "type": "punta", "gondolaType": None, "code": "PUN-01", "w": 1.0, "d": 0.6}
    _guardar(client, admin, [punta])
    p = _leer(client, admin)["g1"]
    for clave in FICHA:
        assert clave not in p, f"la punta heredó «{clave}» de la góndola con su mismo id"


def test_el_alias_del_2d_es_el_mismo_tipo_y_si_hereda(client, admin):
    """El tipo se compara por el de verdad: `gondola_doble` es `gondola`."""
    _guardar(client, admin, [{**GONDOLA, **FICHA}])
    _guardar(client, admin, [{**GONDOLA, "type": "gondola_doble"}])
    g = _leer(client, admin)["g1"]
    for clave, valor in FICHA.items():
        assert g[clave] == valor, f"el alias del 2D perdió «{clave}»"


def test_DESHACER_EL_PANEL_SE_GUARDA(client, admin):
    """Lo que manda el navegador de hoy al deshacer un «Entrepaños» escrito
    sobre una góndola que no lo tenía: `null` (ver `conFichaQuitada` en
    `utils/guardadoDelPlano.ts`). La base queda sin la clave, como el editor."""
    _guardar(client, admin, [dict(GONDOLA)])                                   # plano viejo
    _guardar(client, admin, [{**GONDOLA, "entrepanos": 4, "modulo": 1.0}])     # el panel
    _guardar(client, admin, [{**GONDOLA, "entrepanos": None, "modulo": None}])  # Ctrl+Z
    g = _leer(client, admin)["g1"]
    assert "entrepanos" not in g and "modulo" not in g, "el deshacer no se guardó"
    assert _crudo() == json.dumps([GONDOLA]), "el plano no volvió a ser el de antes, byte a byte"


def test_otra_sede_no_presta_su_ficha(client, admin):
    _guardar(client, admin, [{**GONDOLA, **FICHA}], sede="NAVE")
    _guardar(client, admin, [{**GONDOLA, "sede": "CENTRO"}], sede="CENTRO")
    g = _leer(client, admin, sede="CENTRO")["g1"]
    for clave in FICHA:
        assert clave not in g


# ─── Un plano sin ficha guarda igual que hoy ─────────────────────────────────

def test_UN_PLANO_SIN_FICHA_GUARDA_IGUAL_QUE_HOY(client, admin):
    """Ni una clave de más, ni una de menos, ni en otro orden."""
    plano = [dict(GONDOLA), {**GONDOLA, "id": "g2", "code": "GON-04", "cx": 8,
                             "faceB": {"mountedAt": "2026-10-01"}, "vista3D": {"A": {"x": 1}}}]
    _guardar(client, admin, plano)
    assert _crudo() == json.dumps(plano)
    # Y un segundo guardado, también.
    plano[0] = {**plano[0], "cx": 4.5}
    _guardar(client, admin, plano)
    assert _crudo() == json.dumps(plano)


def test_la_cara_b_no_se_toca(client, admin):
    """La ficha vive en el mueble; una clave así en la cara B no es suya."""
    _guardar(client, admin, [{**GONDOLA, **FICHA, "faceB": {"mountedAt": "2026-10-01"}}])
    _guardar(client, admin, [{**GONDOLA, "faceB": {"mountedAt": "2026-10-02"}}])
    g = _leer(client, admin)["g1"]
    assert g["faceB"] == {"mountedAt": "2026-10-02"}
    assert g["entrepanos"] == 4


# ─── Las mismas cuatro claves de los dos lados ───────────────────────────────

def test_las_claves_de_la_ficha_son_las_mismas_que_las_del_navegador():
    """El navegador manda `null` para borrar sólo en éstas, y el servidor sólo
    rellena éstas: si una lista suma una clave y la otra no, o se borra sin
    querer o no se puede borrar nunca."""
    import re
    from pathlib import Path

    from app.services.layout_lookup import CLAVES_DE_FICHA

    ts = (Path(__file__).resolve().parents[2] / "frontend" / "src" / "utils" / "guardadoDelPlano.ts").read_text(encoding="utf-8")
    m = re.search(r"export const CLAVES_DE_FICHA = \[([^\]]*)\]", ts)
    assert m, "no se encontró `CLAVES_DE_FICHA` en guardadoDelPlano.ts"
    assert sorted(re.findall(r'"(\w+)"', m.group(1))) == sorted(CLAVES_DE_FICHA)


# ─── fase 2 · I5: medidas que no se pueden dibujar ───────────────────────────
#
# `PUT /layout` recibía `fixtures: list[Any]` y no miraba las medidas: un ancho
# de 1e308 con un módulo de 1e-9 entraba con un 200 y colgaba el 3D de quien
# abriera el plano. Ahora `medidas_imposibles` frena SÓLO lo que el guardado
# crea o cambia (la política de `choques_nuevos`): un plano que ya traía una
# medida rota se sigue abriendo y guardando.

def _put(client, headers, fixtures, sede="NAVE"):
    return client.put(f"/api/layout/{sede}", headers=headers,
                      json={"fixtures": fixtures, "base_updated_at": None})


def _rechazo(r):
    assert r.status_code == 409, r.text
    detalle = r.json()["detail"]
    assert detalle["code"] == "medidas_imposibles", detalle
    return detalle["choques"]


def test_UNA_MEDIDA_IMPOSIBLE_NUEVA_NO_SE_GUARDA_Y_LA_QUE_YA_ESTABA_SI(client, admin):
    rota = {**GONDOLA, "w": 1e308, "modulo": 1e-9}
    # El primer guardado de una sede no se compara con nada: entra, como entra
    # un plano que ya existe (el arranque, otra estación, una restauración).
    _guardar(client, admin, [rota, NEVERA])
    # Guardarlo igual, mover otro mueble o mover la góndola rota misma: entra.
    _guardar(client, admin, [rota, NEVERA])
    _guardar(client, admin, [rota, {**NEVERA, "cx": 11}])
    _guardar(client, admin, [{**rota, "cx": 7}, {**NEVERA, "cx": 11}])
    base = [{**rota, "cx": 7}, {**NEVERA, "cx": 11}]

    # Cambiarle una medida a un mueble por una imposible: 409, con la frase.
    assert _rechazo(_put(client, admin, [base[0], {**base[1], "w": 0}])) == [
        "NEV-01: el ancho de 0 m no se puede dibujar (va de más de 0 a 1.000 m)."]
    # Un mueble nuevo con un módulo que lo parte en miles.
    sana = {**GONDOLA, "id": "g2", "code": "GON-04", "cx": 12}
    assert _rechazo(_put(client, admin, [*base, {**sana, "modulo": 0.001}])) == [
        "GON-04: con un módulo de 0,001 m saldrían 3.000 módulos; el tope es 200."]
    # Entrepaños de más (o rotos).
    assert _rechazo(_put(client, admin, [*base, {**sana, "entrepanos": 1e9}])) == [
        "GON-04: 1e+09 entrepaños no se pueden dibujar (van de 0 a 50, enteros)."]
    assert _rechazo(_put(client, admin, [*base, {**sana, "entrepanos": 2.5, "h": -1}])) == [
        "GON-04: el alto de -1 m no se puede dibujar (va de más de 0 a 1.000 m); "
        "2,5 entrepaños no se pueden dibujar (van de 0 a 50, enteros)."]
    # Cambiar el módulo de la góndola que ya estaba rota TAMBIÉN es cambiarla:
    # se mira entera y su ancho no se puede dibujar.
    assert _rechazo(_put(client, admin, [{**base[0], "modulo": 1.0}, base[1]])) == [
        "GON-03: el ancho de 1e+308 m no se puede dibujar (va de más de 0 a 1.000 m)."]

    # Nada de eso quedó escrito.
    crudo = {f["id"]: f for f in json.loads(_crudo())}
    assert set(crudo) == {"g1", "n1"}
    assert crudo["n1"]["w"] == NEVERA["w"] and crudo["g1"]["modulo"] == 1e-9

    # Y una medida sana nueva entra como siempre.
    _guardar(client, admin, [*base, {**sana, "modulo": 1.0, "entrepanos": 4}])


def test_los_topes_del_dibujo_son_los_del_servidor(client):
    """El 3D recorta al DIBUJAR con `MAX_VANOS_A_DIBUJAR` y
    `MAX_ENTREPANOS_A_DIBUJAR` (`muebles/medidas.ts`, no importa de
    `superficie.ts`: sería un ciclo). Si se separan de los del servidor, un
    plano que el servidor deja guardar se dibujaría recortado, o al revés."""
    import re
    from pathlib import Path

    from app.services.layout_lookup import MAX_ENTREPANOS
    from app.services.superficie import MAX_VANOS

    ts = (Path(__file__).resolve().parents[2] / "frontend" / "src" / "components" / "StoreEditor3D"
          / "muebles" / "medidas.ts").read_text(encoding="utf-8")
    vanos = re.search(r"export const MAX_VANOS_A_DIBUJAR = (\d+);", ts)
    entrepanos = re.search(r"export const MAX_ENTREPANOS_A_DIBUJAR = (\d+);", ts)
    assert vanos and entrepanos, "no están los topes del dibujo en medidas.ts"
    assert int(vanos.group(1)) == MAX_VANOS
    assert int(entrepanos.group(1)) == MAX_ENTREPANOS


# ─── fase 2 · I5: una participación de un tipo sin receta ────────────────────

def test_una_participacion_de_un_tipo_sin_superficie_no_manda_a_buscar_una_opcion_que_no_esta(client):
    """La isla (o el impulsador) no tiene receta de superficie, así que «Cómo
    se vende» no le ofrece «por participación»: la frase ya no manda a
    elegirlo ahí. Es la misma frase que `services/participaciones.py`."""
    from app.services.layout_lookup import PARTE_INEXISTENTE, TIPO_SIN_PARTICIPACION, motivo_para_no_vender_parte
    from app.services.partes import partir_codigo

    assert TIPO_SIN_PARTICIPACION == "Este tipo de mueble todavía no se vende por participación."
    isla = {"code": "ISL-01", "type": "isla", "w": 1.2, "d": 0.8, "h": 1.0}
    motivo, frase = motivo_para_no_vender_parte(isla, partir_codigo("NAVE-ISL-01-PC1"))
    assert motivo == PARTE_INEXISTENTE
    assert frase == f"«NAVE-ISL-01»: {TIPO_SIN_PARTICIPACION}"
    assert "Cómo se vende" not in frase
    # Con receta (una góndola que se vende entera) sigue diciendo dónde se elige.
    gondola = {"code": "GON-01", "type": "gondola", "gondolaType": "double", "w": 0.9, "d": 0.9, "h": 1.8}
    motivo, frase = motivo_para_no_vender_parte(gondola, partir_codigo("NAVE-GON-01-PC1"))
    assert motivo == PARTE_INEXISTENTE and "elegí «por participación» en «Cómo se vende»" in frase
