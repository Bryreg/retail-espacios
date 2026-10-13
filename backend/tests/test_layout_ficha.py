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

    ts = (Path(__file__).resolve().parents[2] / "frontend" / "src" / "utils" / "convertirPlano.ts").read_text(encoding="utf-8")
    m = re.search(r"export const CLAVES_DE_FICHA = \[([^\]]*)\]", ts)
    assert m, "no se encontró `CLAVES_DE_FICHA` en convertirPlano.ts"
    assert sorted(re.findall(r'"(\w+)"', m.group(1))) == sorted(CLAVES_DE_FICHA)
