"""Renumerar el plano: el código pasa a ser EL nombre, y no se pierde un mueble.

La fase 12 administró el problema de los dos nombres —rechazó el texto ambiguo,
avisó del gemelo, pintó la colisión— pero lo dejó vivo, porque mover el ``code``
arrastraba ``spaces.code``, ``spaces.svg_id``, las confirmaciones de montaje y el
histórico. El dueño dijo que los contratos cargados son de prueba, así que esa
mudanza ya se puede pagar: **el ``code`` pasa a ser EL nombre y la
``nomenclatura`` deja de existir como segundo nombre**.

Lo que se prueba acá es, palabra por palabra, lo que se le prometió:

· ningún mueble se agrega ni se borra —el conteo y el conjunto de ``id`` son los
  mismos—;
· no cambia una sola coordenada;
· una rotación pura de nombres se aplica sin chocar contra los dos UNIQUE;
· correrla dos veces no cambia nada la segunda vez;
· ``spaces.code`` sigue apuntando al MISMO mueble físico;
· el choque nuevo se rechaza y el que ya venía se guarda;
· el previo no escribe una sola fila.

El plano de prueba imita la geometría real medida en NAVE (``docs/ESTADO.md``
§«Qué hay de verdad en los planos»): corridas de góndolas giradas 90° que se
extienden sobre Z, con sus puntas en las cabeceras, una fila de cajas y una de
impulsadores.
"""

import json
import math
import re
from datetime import timedelta
from pathlib import Path

from app.fechas import hoy as hoy_en_colombia  # el «hoy» del negocio: Colombia

HOY = hoy_en_colombia()
SEDE = "NAVE"

#: Las tres corridas, y dónde cae cada góndola sobre el eje largo.
CORRIDAS = (4.0, 8.0, 12.0)
A_LO_LARGO = (3.0, 7.0, 11.0)


def _gondola(cx: float, cz: float, code: str) -> dict:
    """Góndola de 3,60 × 0,90 girada un cuarto de vuelta: se extiende sobre Z.

    Es la forma real: en NAVE las 56 góndolas principales forman 10 corridas
    verticales, y por eso ``utils/pasillos.ts`` agrupa por ``cx``.
    """
    return {
        "id": f"g{cx:.0f}-{cz:.0f}", "code": code, "sede": SEDE, "type": "gondola_doble",
        "label": "Góndola Doble", "cx": cx, "cz": cz, "rotY": math.pi / 2,
        "w": 3.6, "d": 0.9, "h": 1.8, "color": "#64748b", "status": "free",
        "supplierName": "", "brandCategory": "", "negotiatedValue": 0,
        "startDate": "", "endDate": "", "observation": "",
    }


def _punta(cx: float, cz: float, code: str) -> dict:
    return {
        "id": f"p{cx:.0f}-{cz:.0f}", "code": code, "sede": SEDE, "type": "punta",
        "label": "Punta de Góndola", "cx": cx, "cz": cz, "rotY": 0,
        "w": 1.2, "d": 0.9, "h": 1.8, "color": "#6366f1", "status": "free",
        "supplierName": "", "brandCategory": "", "negotiatedValue": 0,
        "startDate": "", "endDate": "", "observation": "",
    }


def _caja(cx: float, code: str) -> dict:
    """Las cajas corren sobre X: votan por el otro eje y pierden, 9 a 3."""
    return {
        "id": f"c{cx:.1f}", "code": code, "sede": SEDE, "type": "checkout",
        "label": "Caja", "cx": cx, "cz": 17.0, "rotY": 0, "rentable": False,
        "w": 1.8, "d": 0.7, "h": 0.9, "color": "#94a3b8", "status": "free",
        "supplierName": "", "brandCategory": "", "negotiatedValue": 0,
        "startDate": "", "endDate": "", "observation": "",
    }


def _impulsador(cx: float, code: str, nomenclatura: str | None = None) -> dict:
    f = {
        "id": f"i{cx:.0f}", "code": code, "sede": SEDE, "type": "impulsador",
        "label": "Impulsador Marca", "cx": cx, "cz": 15.0, "rotY": 0,
        "w": 0.6, "d": 0.5, "h": 1.5, "color": "#f59e0b", "status": "free",
        "supplierName": "", "brandCategory": "", "negotiatedValue": 0,
        "startDate": "", "endDate": "", "observation": "",
    }
    if nomenclatura:
        f["nomenclatura"] = nomenclatura
    return f


def _plano_desordenado() -> list[dict]:
    """El plano de prueba, con los nombres CORRIDOS a propósito.

    Las nueve góndolas llevan los nueve códigos GON-01…GON-09, pero puestos una
    posición más adelante de lo que dice el recorrido: renumerar es entonces una
    **rotación pura** —cada mueble toma el nombre que otro deja— que es
    exactamente el caso que hace chocar a ``spaces.code`` a mitad de camino.
    """
    fixtures: list[dict] = []
    n = 0
    for cx in CORRIDAS:
        for cz in A_LO_LARGO:
            n += 1
            # El que va primero en el recorrido lleva hoy el 02; el último, el 01.
            fixtures.append(_gondola(cx, cz, f"GON-{(n % 9) + 1:02d}"))
    # Puntas: cabecera y cola de cada corrida, numeradas al revés del recorrido.
    puntas = [(cx, cz) for cx in CORRIDAS for cz in (1.0, 13.0)]
    for i, (cx, cz) in enumerate(puntas):
        fixtures.append(_punta(cx, cz, f"PUN-{len(puntas) - i:02d}"))
    for i, cx in enumerate((5.0, 6.5, 8.0)):
        fixtures.append(_caja(cx, f"CAJ-{3 - i:02d}"))
    # Los tres impulsadores, con nombre escrito a mano que pisa el código de otro
    # — el caso del dueño, que después de esto deja de poder existir.
    fixtures.append(_impulsador(1.0, "IMP-03", "IMP-01"))
    fixtures.append(_impulsador(2.0, "IMP-01", "IMP-02"))
    fixtures.append(_impulsador(3.0, "IMP-02", "IMP-03"))
    return fixtures


PLANO = _plano_desordenado()

#: Lo que el recorrido tiene que dar, escrito a mano a partir de la geometría:
#: bandas sobre X de menor a mayor (1, 2, 3, 4, 5, 6.5, 8, 12) y, dentro de cada
#: banda, de menor a mayor Z.
ESPERADO = {
    "i1": "IMP-01", "i2": "IMP-02", "i3": "IMP-03",
    "p4-1": "PUN-01", "g4-3": "GON-01", "g4-7": "GON-02", "g4-11": "GON-03",
    "p4-13": "PUN-02",
    "c5.0": "CAJ-01", "c6.5": "CAJ-02",
    "p8-1": "PUN-03", "g8-3": "GON-04", "g8-7": "GON-05", "g8-11": "GON-06",
    "p8-13": "PUN-04", "c8.0": "CAJ-03",
    "p12-1": "PUN-05", "g12-3": "GON-07", "g12-7": "GON-08", "g12-11": "GON-09",
    "p12-13": "PUN-06",
}


# ─── Arnés ────────────────────────────────────────────────────────────────────

def _guardar(client, admin, fixtures, sede=SEDE, base=None):
    return client.put(f"/api/layout/{sede}",
                      json={"fixtures": fixtures, "base_updated_at": base}, headers=admin)


def _plano(client, admin, fixtures=None, sede=SEDE):
    r = _guardar(client, admin, fixtures if fixtures is not None else PLANO, sede)
    assert r.status_code == 200, r.text
    return r.json()


def _leer(client, admin, sede=SEDE):
    r = client.get(f"/api/layout/{sede}", headers=admin)
    assert r.status_code == 200, r.text
    return r.json()


def _previo(client, admin, sedes=None):
    r = client.post("/api/layout/renumeracion/previo",
                    json={"sedes": sedes}, headers=admin)
    assert r.status_code == 200, r.text
    return r.json()


def _aplicar(client, admin, sedes=None):
    r = client.post("/api/layout/renumeracion/aplicar",
                    json={"sedes": sedes}, headers=admin)
    assert r.status_code == 200, r.text
    return r.json()


#: Un PNG mínimo. La confirmación de montaje exige foto cuando el estado es
#: "montado" —es la prueba de que la exhibición quedó armada— y sólo con foto se
#: crea la fila de `spaces`, que es justo lo que estos tests necesitan mudar.
FOTO = {"foto": ("montaje.png", b"\x89PNG\r\n\x1a\n" + b"0" * 32, "image/png")}


def _montar(client, admin, codigo, sede=SEDE):
    return client.post(
        "/api/mounts/", headers=admin,
        data={"space_code": codigo, "estado": "montado", "sede": sede},
        files=FOTO,
    )


def _por_id(fixtures):
    return {f["id"]: f for f in fixtures}


def _espacios(client, admin):
    return {s["code"]: s for s in client.get("/api/spaces/", headers=admin).json()}


def _fila(n=2, espacio="GON-01", proveedor="CASA LUKER", **kw):
    base = {
        "fila": n, "espacio": espacio, "proveedor": proveedor, "marca": "ASEO",
        "valor": 200_000,
        "desde": (HOY + timedelta(days=10)).isoformat(),
        "hasta": (HOY + timedelta(days=20)).isoformat(),
    }
    base.update(kw)
    return base


def _confirmar(client, admin, filas, sede=SEDE):
    r = client.post("/api/leases/bulk/confirmar",
                    json={"sede": sede, "filas": filas}, headers=admin)
    assert r.status_code == 200, r.text
    return r.json()


# ─── La regla de recorrido ────────────────────────────────────────────────────

def test_el_recorrido_sale_de_la_geometria_y_no_de_una_corazonada(client, admin):
    """Caminar la tienda y leer los números tiene que ir en el mismo orden.

    La regla no se inventó: se copió de la que ya se midió. ``utils/pasillos.ts``
    deduce las corridas de NAVE agrupando por la coordenada perpendicular y el
    resultado **coincide con lo que hizo a mano quien numeró el plano** —nueve de
    las diez corridas calzan con los códigos existentes—. O sea que esa persona
    caminó pasillo por pasillo, y eso es lo que se reproduce: bandas sobre el eje
    perpendicular, y adentro de cada banda de menor a mayor sobre el eje que se
    camina.
    """
    _plano(client, admin)
    sede = _previo(client, admin)["sedes"][0]

    # El eje se elige mirando cómo están puestos los muebles: nueve góndolas
    # giradas 90° se extienden sobre Z, tres cajas sobre X. Gana Z.
    assert sede["eje_recorrido"] == "z"
    assert sede["eje_bandas"] == "x"
    assert "9 muebles alargados corren sobre Z y 3 sobre X" in sede["motivo_eje"]
    assert sede["bandas"] == 8

    assert {f["id"]: f["ahora"] for f in sede["filas"]} == ESPERADO

    # Y el orden en que salen las filas ES el recorrido: banda por banda.
    bandas = [f["banda"] for f in sede["filas"]]
    assert bandas == sorted(bandas)


def test_el_recorrido_es_determinista_y_estable(client, admin):
    """Dos corridas sobre el mismo plano dan lo mismo, hasta el orden de las filas.

    Sin esto el informe que el dueño imprime no sirve para nada: cada vez que lo
    pidiera diría otra cosa.
    """
    _plano(client, admin)
    uno = _previo(client, admin)["sedes"][0]
    dos = _previo(client, admin)["sedes"][0]
    assert uno["filas"] == dos["filas"]


def test_el_eje_se_decide_por_el_recinto_cuando_ningun_mueble_apunta(client, admin):
    """Una sede de puro impulsador no tiene muebles alargados que voten.

    Ahí se mira la forma del recinto: un supermercado tiene muchos pasillos
    repartidos a lo ancho y cada uno se camina a lo largo del lado corto, así
    que se camina la dimensión MENOR. Es lo mismo que pasa en NAVE, que mide
    42,4 × 15,8: las diez corridas se reparten sobre los 42,4 y cada una se
    recorre sobre los 15,8.
    """
    from app.services.renumeracion import eje_de_recorrido

    anchos = [{"cx": x, "cz": 8.0, "w": 0.6, "d": 0.5} for x in (1.0, 5.0, 20.0)]
    eje, motivo = eje_de_recorrido(anchos)
    assert eje == "z"
    assert "dimensión menor" in motivo

    altos = [{"cx": 8.0, "cz": z, "w": 0.6, "d": 0.5} for z in (1.0, 5.0, 20.0)]
    assert eje_de_recorrido(altos)[0] == "x"


def test_el_prefijo_es_el_mismo_que_usa_el_editor(client, admin):
    """Si las dos tablas se separan, el sistema vuelve a mentir.

    El servidor renumeraría un mueble a ``EXP-03`` y el editor, al agregar el
    siguiente, seguiría la serie de otro prefijo. Las dos salen del catálogo de
    muebles: el editor de ``frontend/src/catalogo/muebles.json`` y el servidor
    de su copia. Se compara contra el archivo que lee el EDITOR, no contra una
    copia de memoria, y se mira que el editor lo tome de ahí.
    """
    from app.services.renumeracion import PREFIJO_POR_TIPO

    raiz = Path(__file__).resolve().parents[2]
    catalogo = json.loads((raiz / "frontend/src/catalogo/muebles.json").read_text(encoding="utf-8"))
    del_editor = {tipo: d["prefijo"] for tipo, d in catalogo["tipos"].items()}
    for alias, a in catalogo["alias"].items():
        del_editor[alias] = catalogo["tipos"][a["tipo"]]["prefijo"]

    assert del_editor, "no se pudieron leer los prefijos del catálogo del editor"
    assert del_editor == PREFIJO_POR_TIPO

    # El editor no tiene una tabla propia: la calcula del catálogo.
    texto = (raiz / "frontend/src/utils/nomenclatura.ts").read_text(encoding="utf-8")
    assert re.search(r"export const PREFIJO_POR_TIPO[^=]*=\s*prefijosPorTipo\(\);", texto), (
        "utils/nomenclatura.ts volvió a tener su propia tabla de prefijos"
    )


# ─── Los invariantes ──────────────────────────────────────────────────────────

def test_ningun_mueble_se_agrega_ni_se_borra(client, admin):
    """La única condición que puso el dueño, afirmada contra la base."""
    _plano(client, admin)
    antes = _leer(client, admin)["fixtures"]

    _aplicar(client, admin)
    despues = _leer(client, admin)["fixtures"]

    assert len(despues) == len(antes) == len(PLANO)
    assert {f["id"] for f in despues} == {f["id"] for f in antes}


def test_no_se_mueve_una_sola_coordenada(client, admin):
    """Lo único que cambia es cómo se llama.

    Se compara campo por campo y no sólo ``cx``/``cz``: el invariante es que en
    el PLANO los únicos campos que la renumeración puede tocar son ``code`` y
    ``nomenclatura``. Cualquier otra diferencia —``rentable``, ``w``, el color—
    sería un mueble editado a espaldas de nadie.

    ``nombreAnterior`` se salta acá y se prueba aparte —y más fuerte— en
    ``test_el_nombre_viejo_no_se_guarda_en_el_plano``: no es un campo del mueble
    sino el recuerdo que el servidor agrega al leer, y ese test comprueba contra
    la base que el JSON guardado no lo tiene.
    """
    _plano(client, admin)
    antes = _por_id(_leer(client, admin)["fixtures"])

    _aplicar(client, admin)
    despues = _por_id(_leer(client, admin)["fixtures"])

    for ident, viejo in antes.items():
        nuevo = despues[ident]
        for clave in set(viejo) | set(nuevo):
            if clave in ("code", "nomenclatura", "nombreAnterior"):
                continue
            assert nuevo.get(clave) == viejo.get(clave), f"{ident}.{clave} se movió"


def test_el_invariante_frena_la_escritura_y_no_deja_nada_a_medias(client, admin):
    """Si el cálculo perdiera un mueble, no se escribe NADA.

    Se fuerza el fallo desde adentro —el servicio calcula un plano con un mueble
    de menos— y se comprueba que la operación entera se cae y que el plano
    guardado queda intacto. Es la diferencia entre un error y una tienda con un
    espacio menos.
    """
    from app.services import renumeracion

    _plano(client, admin)
    antes = _leer(client, admin)

    original = renumeracion.codigos_nuevos
    renumeracion.codigos_nuevos = lambda fx, eje=None: original(fx, eje)[:-1]
    try:
        r = client.post("/api/layout/renumeracion/aplicar", json={}, headers=admin)
    finally:
        renumeracion.codigos_nuevos = original

    assert r.status_code == 500
    assert r.json()["detail"]["code"] == "renumeracion_invariante"

    despues = _leer(client, admin)
    assert despues["fixtures"] == antes["fixtures"]
    assert despues["updated_at"] == antes["updated_at"]


def test_un_mueble_sin_identidad_bloquea_la_renumeracion(client, admin):
    """Sin ``id`` no se puede afirmar que después es el mismo mueble.

    Y sin poder afirmarlo, la promesa «no se elimina ni se agrega ninguno» no se
    puede cumplir: se para antes de tocar nada y se dice por qué.
    """
    roto = [dict(f) for f in PLANO]
    roto[0] = {k: v for k, v in roto[0].items() if k != "id"}
    _plano(client, admin, roto)

    r = client.post("/api/layout/renumeracion/previo", json={}, headers=admin)
    assert r.status_code == 409
    assert r.json()["detail"]["code"] == "renumeracion_bloqueada"
    assert "identidad" in " ".join(r.json()["detail"]["motivos"])


# ─── La rotación pura: los dos UNIQUE ─────────────────────────────────────────

def test_una_rotacion_pura_de_nombres_se_aplica_sin_chocar(client, admin):
    """Nueve góndolas que se pasan el nombre en círculo, con contratos encima.

    Es el caso que hace fallar la escritura ingenua: ``spaces.code`` y
    ``spaces.svg_id`` son UNIQUE, así que renombrar fila por fila choca contra
    la que todavía no se movió. Se resuelve con valores temporales en dos
    pasadas dentro de UNA transacción, y acá se comprueba que el resultado es la
    permutación completa, sin una fila perdida.
    """
    _plano(client, admin)
    codigos_antes = {f["id"]: f["code"] for f in _leer(client, admin)["fixtures"]}

    # Contratos sobre TODAS las góndolas: nueve filas de `spaces` que se van a
    # tener que cruzar entre ellas.
    filas = [
        _fila(n=i + 2, espacio=f"{SEDE}-GON-{i + 1:02d}", proveedor=f"PROVEEDOR {i}")
        for i in range(9)
    ]
    assert _confirmar(client, admin, filas)["creados"] == 9

    _aplicar(client, admin)
    codigos_despues = {f["id"]: f["code"] for f in _leer(client, admin)["fixtures"]}

    gondolas = [i for i in codigos_antes if i.startswith("g")]
    # Es una permutación de verdad: el conjunto de nombres es el mismo y ningún
    # mueble se quedó con el suyo.
    assert ({codigos_antes[i] for i in gondolas}
            == {codigos_despues[i] for i in gondolas}
            == {f"GON-{n:02d}" for n in range(1, 10)})
    assert all(codigos_antes[i] != codigos_despues[i] for i in gondolas)

    # Y las nueve filas de `spaces` siguen siendo nueve, cada una con su nombre.
    espacios = _espacios(client, admin)
    assert {f"{SEDE}-GON-{n:02d}" for n in range(1, 10)} <= set(espacios)


def test_el_espacio_sigue_apuntando_al_mismo_mueble_fisico(client, admin):
    """Lo que hace que la renumeración sea segura: el contrato no se muda de mueble.

    El ``id`` del mueble es la identidad real. Antes de renumerar se anota qué
    ``id`` está debajo del contrato; después se comprueba que el espacio que
    lleva ese contrato tiene el nombre NUEVO de ese MISMO ``id``.
    """
    _plano(client, admin)
    antes = _por_id(_leer(client, admin)["fixtures"])

    # El mueble de la esquina de arriba a la izquierda de la corrida del medio.
    mueble = antes["g8-3"]
    viejo = f"{SEDE}-{mueble['code']}"
    creado = _confirmar(client, admin, [_fila(espacio=viejo)])
    assert creado["creados"] == 1
    lease_id = creado["filas"][0]["lease_id"]

    _aplicar(client, admin)
    despues = _por_id(_leer(client, admin)["fixtures"])
    nuevo = f"{SEDE}-{despues['g8-3']['code']}"
    assert nuevo != viejo

    espacios = _espacios(client, admin)
    assert viejo not in espacios
    assert nuevo in espacios

    # El contrato sigue colgado del mismo espacio, que ahora se llama distinto.
    # Arranca en diez días, así que es el "próximo" y no el vigente.
    detalle = client.get(f"/api/spaces/{espacios[nuevo]['id']}", headers=admin).json()
    assert detalle["upcoming_lease"]["id"] == lease_id
    assert detalle["upcoming_lease"]["supplier"]["name"] == "CASA LUKER"


def test_el_svg_id_y_el_nombre_del_espacio_se_mudan_con_el_codigo(client, admin):
    """``svg_id`` es el otro UNIQUE, y hay un camino que lo fabrica con el código.

    El montaje crea el espacio antes de que exista contrato, con
    ``svg_id="fix-CODIGO"`` y ``name=CODIGO`` (``mounts.py``). Si el código se
    muda y el ``svg_id`` no, el dibujo queda buscando un espacio con el nombre
    viejo.
    """
    _plano(client, admin)
    antes = _por_id(_leer(client, admin)["fixtures"])
    viejo = f"{SEDE}-{antes['g4-7']['code']}"

    assert _montar(client, admin, viejo).status_code == 201

    plan = _previo(client, admin)["sedes"][0]
    mudanza = [e for e in plan["espacios"] if e["antes"] == viejo]
    assert len(mudanza) == 1
    assert mudanza[0]["svg_antes"] == f"fix-{viejo}"

    _aplicar(client, admin)
    nuevo = f"{SEDE}-{_por_id(_leer(client, admin)['fixtures'])['g4-7']['code']}"
    espacio = _espacios(client, admin)[nuevo]
    assert espacio["svg_id"] == f"fix-{nuevo}"
    assert espacio["name"] == nuevo


def test_la_confirmacion_de_montaje_no_queda_huerfana(client, admin):
    """``mount_confirmations.space_code`` guarda el código como texto suelto.

    Es a propósito —un montaje se confirma antes de que exista la fila en
    ``spaces``— y por eso hay que arrastrarlo a mano. Es la prueba de que la
    exhibición se armó: con el código viejo queda colgada de un mueble que ya no
    se llama así.
    """
    _plano(client, admin)
    antes = _por_id(_leer(client, admin)["fixtures"])
    viejo = f"{SEDE}-{antes['g12-11']['code']}"
    assert _montar(client, admin, viejo).status_code == 201

    assert _previo(client, admin)["sedes"][0]["montajes"] == 1

    _aplicar(client, admin)
    nuevo = f"{SEDE}-{_por_id(_leer(client, admin)['fixtures'])['g12-11']['code']}"
    codigos = {m["space_code"] for m in client.get("/api/mounts/", headers=admin).json()}
    assert codigos == {nuevo}


def test_un_espacio_sin_mueble_que_ocupa_el_nombre_destino_frena_todo(client, admin):
    """Quedó una fila de ``spaces`` de un mueble que ya no está en el plano.

    Pasa de verdad: se borra un mueble del plano después de haberlo contratado y
    la fila comercial sobrevive, que es a propósito —es historia—. Si la
    renumeración le diera ese nombre a otro mueble, el contrato del borrado
    quedaría colgado del mueble equivocado. Se para todo, se dice cuál es el
    espacio y no se escribe nada: es más barato archivarlo a mano que descubrir
    un mes después que dos contratos comparten historia.
    """
    tres = [_impulsador(cx, f"IMP-{n:02d}") for cx, n in ((1.0, 5), (2.0, 6), (3.0, 7))]
    _plano(client, admin, tres)
    # El nombre que la renumeración le va a dar al impulsador del medio, ocupado
    # por un espacio que ningún mueble respalda.
    assert _montar(client, admin, f"{SEDE}-IMP-02").status_code == 201

    antes = _leer(client, admin)
    r = client.post("/api/layout/renumeracion/aplicar", json={}, headers=admin)
    assert r.status_code == 409
    detalle = r.json()["detail"]
    assert detalle["code"] == "renumeracion_bloqueada"
    assert f"{SEDE}-IMP-02" in " ".join(detalle["motivos"])
    assert _leer(client, admin)["fixtures"] == antes["fixtures"]
    # Y el espacio que bloqueaba sigue entero, esperando que alguien decida.
    assert f"{SEDE}-IMP-02" in _espacios(client, admin)


def test_el_espacio_de_codigo_corto_se_avisa_y_no_se_arrastra(client, admin):
    """El agujero viejo: un ``Space`` con el código sin la sede adelante.

    La fase 12 lo tapó hacia adelante, pero los que ya existen siguen ahí. No se
    arrastran a propósito: un código sin sede no dice de qué tienda es, y
    moverlo sería mandar un contrato al supermercado equivocado. Se avisa, que
    es lo único honesto que se puede hacer con un dato ambiguo.
    """
    _plano(client, admin)
    corto = _por_id(_leer(client, admin)["fixtures"])["g4-3"]["code"]
    r = client.post("/api/spaces/find-or-create",
                    json={"code": corto, "sede": SEDE}, headers=admin)
    assert r.status_code == 200, r.text

    plan = _previo(client, admin)["sedes"][0]
    assert any(corto in a and "código corto" in a for a in plan["avisos"])

    _aplicar(client, admin)
    # Sigue existiendo con su nombre viejo, a la vista y sin tocar.
    assert corto in _espacios(client, admin)


# ─── Los dos pasos ────────────────────────────────────────────────────────────

def test_el_previo_no_escribe_una_sola_fila(client, admin):
    """El paso que existe para que la revisión ocurra ANTES de cambiar nada.

    Se compara todo lo que la renumeración toca: el plano, su revisión, los
    espacios con su ``svg_id`` y las confirmaciones de montaje.
    """
    _plano(client, admin)
    antes = _por_id(_leer(client, admin)["fixtures"])
    _confirmar(client, admin, [_fila(espacio=f"{SEDE}-{antes['g4-3']['code']}")])
    _montar(client, admin, f"{SEDE}-{antes['g8-3']['code']}")

    plano_antes = _leer(client, admin)
    espacios_antes = _espacios(client, admin)
    montajes_antes = client.get("/api/mounts/", headers=admin).json()

    salida = _previo(client, admin)
    assert salida["aplicado"] is False
    assert salida["cambian"] > 0

    # Tampoco en el registro de nombres viejos: el previo CALCULA, no escribe.
    assert _cadena("g4-3") == []
    assert _leer(client, admin) == plano_antes
    assert _espacios(client, admin) == espacios_antes
    assert client.get("/api/mounts/", headers=admin).json() == montajes_antes


def test_correrla_dos_veces_no_cambia_nada_la_segunda_vez(client, admin):
    """Idempotente, y sin tocar ni la revisión del plano.

    ``updated_at`` es lo que usan los otros equipos para saber que algo cambió:
    moverlo sin que nada haya cambiado los manda a descargar un plano idéntico y
    entrena a ignorar el aviso.
    """
    _plano(client, admin)
    primera = _aplicar(client, admin)
    assert primera["cambian"] > 0

    despues_de_la_primera = _leer(client, admin)

    segunda = _aplicar(client, admin)
    assert segunda["cambian"] == 0
    assert _leer(client, admin) == despues_de_la_primera


def test_el_informe_trae_el_antes_y_el_despues_de_cada_mueble(client, admin):
    """Es lo que el dueño imprime y camina con la tienda al lado.

    Sin ese papel, renumerar le deja el plano y la cartelería hablando idiomas
    distintos. Tiene que decir, por mueble, el nombre que tenía, el que el plano
    dibujaba y el que va a tener.
    """
    _plano(client, admin)
    sede = _previo(client, admin)["sedes"][0]

    texto = sede["texto"]
    assert f"RENUMERACIÓN · {SEDE}" in texto
    assert "0 se agregan · 0 se borran" in texto
    assert "bandas sobre X" in texto

    # El impulsador que se dibujaba «IMP-01» y cuyo código era IMP-03: las tres
    # columnas del informe son distintas entre sí, que es de lo que se trata.
    linea = [l for l in texto.splitlines() if l.strip().startswith("1  IMP-03")]
    assert len(linea) == 1
    assert "IMP-01" in linea[0]          # cómo se leía en el plano
    assert linea[0].strip().endswith("Impulsador Marca")

    fila = [f for f in sede["filas"] if f["id"] == "i1"][0]
    assert (fila["antes"], fila["se_leia"], fila["ahora"]) == ("IMP-03", "IMP-01", "IMP-01")


def test_renumera_todas_las_sedes_parejo(client, admin):
    """«En todas las sedes, parejo» fue una decisión del dueño, no una comodidad.

    Se normaliza el plano completo aunque hoy no tenga conflicto, para que la
    numeración quede con la misma lógica en todas y caminar cualquiera de las
    tiendas se lea igual.
    """
    _plano(client, admin)
    otra = [_punta(2.0, 5.0, "PUN-09"), _punta(2.0, 1.0, "PUN-07")]
    for f in otra:
        f["sede"] = "CENTRO"
    _plano(client, admin, otra, sede="CENTRO")

    salida = _aplicar(client, admin)
    assert {s["sede"] for s in salida["sedes"]} == {SEDE, "CENTRO"}

    centro = _por_id(_leer(client, admin, "CENTRO")["fixtures"])
    assert centro["p2-1"]["code"] == "PUN-01"
    assert centro["p2-5"]["code"] == "PUN-02"


# ─── El segundo nombre deja de existir ────────────────────────────────────────

def test_la_nomenclatura_desaparece_del_plano(client, admin):
    """Después de esto, un mueble tiene UN nombre y es su código.

    No se vacía el campo: se saca. Un campo vacío invita a que alguien lo vuelva
    a llenar, y con eso vuelve la clase entera de error.
    """
    _plano(client, admin)
    assert any("nomenclatura" in f for f in _leer(client, admin)["fixtures"])

    plan = _previo(client, admin)["sedes"][0]
    assert plan["nomenclaturas_borradas"] == 3

    _aplicar(client, admin)
    assert not any("nomenclatura" in f for f in _leer(client, admin)["fixtures"])


def test_la_planilla_resuelve_contra_el_nombre_unico(client, admin):
    """Con un solo campo, la ambigüedad de la fase 12 no puede existir.

    Antes de renumerar, «IMP-01» era el código de un mueble y el nombre dibujado
    de otro, y la planilla lo rechazaba —correctamente— por ambiguo. Después, el
    mismo texto resuelve un solo mueble y entra sin un aviso, porque no hay
    segundo nombre con el que confundirse.
    """
    _plano(client, admin)
    r = client.post("/api/leases/bulk/validar",
                    json={"sede": SEDE, "filas": [_fila(espacio="IMP-01")]}, headers=admin)
    fila = r.json()["filas"][0]
    assert fila["estado"] == "error"
    assert "ambiguo" in fila["mensajes"][0]

    _aplicar(client, admin)

    r = client.post("/api/leases/bulk/validar",
                    json={"sede": SEDE, "filas": [_fila(espacio="IMP-01")]}, headers=admin)
    fila = r.json()["filas"][0]
    assert fila["estado"] == "ok"
    # Ni ambigüedad ni aviso de gemelo: lo único que queda es la nota de siempre
    # ("proveedor nuevo"), que se dice y no pinta la fila.
    assert fila["mensajes"] == ["Proveedor nuevo: se va a crear."]
    assert fila["codigo"] == f"{SEDE}-IMP-01"
    assert fila["nombre_dibujado"] is None

    # Y lleva al mueble que el plano dibuja «IMP-01», que es el de la izquierda.
    assert _por_id(_leer(client, admin)["fixtures"])["i1"]["code"] == "IMP-01"


# ─── La memoria: cómo se llamaba cada mueble ──────────────────────────────────
#
# Renumerar es lo único que cambia el nombre de un mueble sin que nadie lo
# teclee, y hay dos cosas que no se enteran: el papel que firmó el proveedor y
# el cartel de la góndola. Si el nombre viejo no queda escrito, la lista
# «Contratos para revisar uno por uno» se apaga justo el día para el que existe.


def _cadena(fixture_id: str):
    """Las filas del registro para un mueble, en orden. Se lee de la base porque
    lo que se está probando es que el dato SOBREVIVE, no que la respuesta lo
    dibuje."""
    from app.database import SessionLocal
    from app.models.models import RenumeracionNombre

    db = SessionLocal()
    try:
        return [
            (f.nombre_anterior, f.codigo_anterior, f.codigo_nuevo)
            for f in db.query(RenumeracionNombre)
            .filter(RenumeracionNombre.fixture_id == fixture_id)
            .order_by(RenumeracionNombre.id.asc())
            .all()
        ]
    finally:
        db.close()


def _guardado(sede=SEDE) -> list[dict]:
    """El JSON del plano tal como quedó en la base, sin pasar por la respuesta."""
    from app.database import SessionLocal
    from app.models.models import LayoutSnapshot

    db = SessionLocal()
    try:
        snap = db.query(LayoutSnapshot).filter(LayoutSnapshot.sede == sede).first()
        return json.loads(snap.fixtures_json or "[]")
    finally:
        db.close()


def test_despues_de_renumerar_se_puede_reconstruir_el_nombre_viejo_de_cada_mueble(client, admin):
    """Mueble por mueble, el sistema contesta cómo se llamaba antes.

    Se recuerda el nombre **dibujado** —lo que el plano mostraba, que es lo que
    leyó quien negoció y lo que sigue diciendo el cartel— y no el código: en
    CIUDAD JARDIN esos dos no coincidían, y es justo el caso a reconciliar.
    """
    _plano(client, admin)
    previo = _previo(client, admin)["sedes"][0]
    esperado = {
        f["id"]: f["se_leia"].upper()
        for f in previo["filas"]
        if f["se_leia"].upper() != f["ahora"].upper()
    }
    assert esperado, "el plano de prueba tiene que cambiar nombres de verdad"

    _aplicar(client, admin)
    despues = _por_id(_leer(client, admin)["fixtures"])

    for ident, viejo in esperado.items():
        assert despues[ident].get("nombreAnterior") == viejo, ident
        # Y es un recuerdo, no un nombre: el mueble se llama por su código.
        assert despues[ident]["code"] != despues[ident]["nombreAnterior"]

    # También por el pull de todas las sedes, que es con el que arranca la app.
    todas = client.get("/api/layout/", headers=admin).json()
    de_nave = _por_id([f for s in todas if s["sede"] == SEDE for f in s["fixtures"]])
    assert {i: f.get("nombreAnterior") for i, f in de_nave.items() if f.get("nombreAnterior")} \
        == esperado

    # El que salió llamándose igual que entró no recuerda nada: los tres
    # impulsadores ya se dibujaban con el nombre que les toca.
    for f in previo["filas"]:
        if f["se_leia"].upper() == f["ahora"].upper():
            assert "nombreAnterior" not in despues[f["id"]], f["id"]


def test_la_memoria_sobrevive_a_dos_renumeraciones_seguidas(client, admin):
    """Lo que un campo pisado no podría hacer.

    Entre las dos corridas alguien renumera una corrida a mano a nombres libres.
    Si el nombre viejo viviera en un campo del mueble, la segunda corrida lo
    reemplazaría por ese intermedio —un nombre que no estuvo nunca en una
    pared— y el original quedaría perdido. Con una fila por corrida, la cadena
    entera se conserva y la reconciliación sigue contestando lo que dice el
    papel: el nombre con el que el mueble entró a la PRIMERA renumeración.
    """
    _plano(client, admin)
    _aplicar(client, admin)
    assert _por_id(_leer(client, admin)["fixtures"])["g4-3"]["nombreAnterior"] == "GON-02"

    actual = _leer(client, admin)
    a_mano = [dict(f) for f in actual["fixtures"]]
    for f in a_mano:
        if f["id"] in ("g4-3", "g4-7", "g4-11"):
            f["code"] = "GON-2" + f["code"][-1]      # GON-21, GON-22, GON-23
    assert _guardar(client, admin, a_mano, base=actual["updated_at"]).status_code == 200

    assert _aplicar(client, admin)["cambian"] > 0
    despues = _por_id(_leer(client, admin)["fixtures"])

    assert despues["g4-3"]["code"] == "GON-01"
    # El original, no el intermedio.
    assert despues["g4-3"]["nombreAnterior"] == "GON-02"
    # Y las dos corridas quedaron escritas, en orden: nada se pisó.
    assert _cadena("g4-3") == [
        ("GON-02", f"{SEDE}-GON-02", f"{SEDE}-GON-01"),
        ("GON-21", f"{SEDE}-GON-21", f"{SEDE}-GON-01"),
    ]


def test_el_nombre_viejo_no_se_guarda_en_el_plano(client, admin):
    """No es un segundo nombre: es historia, y vive en su propia tabla.

    El JSON del mueble tiene UN nombre. El recuerdo viaja en la respuesta porque
    la pantalla lo necesita, pero el editor no lo puede escribir: se lo devuelve
    al servidor en el guardado siguiente y el servidor lo saca. Si se guardara,
    el mueble volvería a tener dos campos de nombre —la clase de error que esta
    fase eliminó— y además quedaría una copia que la próxima renumeración no
    actualiza.
    """
    _plano(client, admin)
    _aplicar(client, admin)

    assert not any("nombreAnterior" in f for f in _guardado())
    assert not any("nomenclatura" in f for f in _guardado())

    actual = _leer(client, admin)
    assert any("nombreAnterior" in f for f in actual["fixtures"])

    devuelto = [dict(f) for f in actual["fixtures"]]
    for f in devuelto:
        if f["id"] == "i1":
            f["nombreAnterior"] = "INVENTADO"       # y encima uno falso
    r = _guardar(client, admin, devuelto, base=actual["updated_at"])
    assert r.status_code == 200
    # La respuesta del guardado tiene la misma forma que la de una lectura, con
    # el recuerdo del servidor y no el que mandó el cliente.
    devueltos = _por_id(r.json()["fixtures"])
    assert devueltos["g4-3"]["nombreAnterior"] == "GON-02"
    assert "nombreAnterior" not in devueltos["i1"]

    assert not any("nombreAnterior" in f for f in _guardado())
    despues = _por_id(_leer(client, admin)["fixtures"])
    # El mueble que no cambió de nombre sigue sin recordar nada: lo que manda es
    # el registro del servidor, no lo que el cliente mande.
    assert "nombreAnterior" not in despues["i1"]
    assert despues["g4-3"]["nombreAnterior"] == "GON-02"


def test_el_operario_tambien_ve_el_nombre_viejo_y_sigue_sin_ver_la_plata(client, admin, worker):
    """Quien camina la tienda es el que más necesita el nombre viejo.

    El cartel de la góndola lo tiene delante. Que el recuerdo viaje no puede, en
    cambio, abrirle nada más: el valor negociado se le sigue borrando de cada
    mueble, que es lo que el rol de operario significa.
    """
    _plano(client, admin)
    _aplicar(client, admin)

    r = client.get(f"/api/layout/{SEDE}", headers=worker)
    assert r.status_code == 200, r.text
    fixtures = _por_id(r.json()["fixtures"])
    assert fixtures["g4-3"]["nombreAnterior"] == "GON-02"
    assert not any("negotiatedValue" in f for f in fixtures.values())


# ─── La planilla vieja: el código que la renumeración retiró ──────────────────

def _centro(client, admin) -> None:
    """Una sede donde renumerar RETIRA nombres.

    El plano de NAVE es una permutación pura —los mismos nombres en otros
    muebles—, así que ahí ningún código deja de existir. Acá sí: ``PUN-07`` y
    ``PUN-09`` pasan a ``PUN-01`` y ``PUN-02``, y esos dos nombres se van del
    plano. Es el caso del dueño: la planilla de la temporada pasada los nombra.
    """
    otra = [_punta(2.0, 5.0, "PUN-09"), _punta(2.0, 1.0, "PUN-07")]
    for f in otra:
        f["sede"] = "CENTRO"
    _plano(client, admin, otra, sede="CENTRO")


def test_la_planilla_vieja_dice_en_que_se_convirtio_el_codigo_retirado(client, admin):
    """El servidor sabe en qué se convirtió el nombre que él mismo retiró.

    Rechazar la fila es correcto —adivinar el mueble es el error que esta fase
    eliminó— pero rechazarla en seco deja a la persona sin ninguna pista, y
    después de renumerar TODA planilla vieja de la casa cae en este renglón.
    """
    _centro(client, admin)
    _aplicar(client, admin, sedes=["CENTRO"])
    assert _por_id(_leer(client, admin, "CENTRO")["fixtures"])["p2-5"]["code"] == "PUN-02"

    r = client.post("/api/leases/bulk/validar",
                    json={"sede": "CENTRO", "filas": [_fila(espacio="CENTRO-PUN-09")]},
                    headers=admin)
    fila = r.json()["filas"][0]

    # Sigue siendo un error: el nombre viejo no resuelve ningún mueble.
    assert fila["estado"] == "error"
    assert fila["codigo"] == "CENTRO-PUN-09"
    mensajes = " ".join(fila["mensajes"])
    assert "No hay ningún mueble con el código «CENTRO-PUN-09»" in mensajes
    # Y ahora además explica por qué, y en qué se convirtió.
    assert "se renumeró el" in mensajes
    assert "«PUN-09» ahora se llama «PUN-02»" in mensajes


def test_la_pista_no_inventa_un_mueble_que_ya_no_esta(client, admin):
    """Si el mueble se borró del plano después de renumerar, se dice eso.

    Mandar a la persona a buscar un nombre que tampoco existe sería el mismo
    callejón sin salida, con una vuelta más.
    """
    _centro(client, admin)
    _aplicar(client, admin, sedes=["CENTRO"])

    actual = _leer(client, admin, "CENTRO")
    quedan = [f for f in actual["fixtures"] if f["id"] != "p2-5"]
    assert _guardar(client, admin, quedan, sede="CENTRO",
                    base=actual["updated_at"]).status_code == 200

    r = client.post("/api/leases/bulk/validar",
                    json={"sede": "CENTRO", "filas": [_fila(espacio="CENTRO-PUN-09")]},
                    headers=admin)
    mensajes = " ".join(r.json()["filas"][0]["mensajes"])
    assert "«PUN-09» era el nombre de un mueble que ya no está en el plano" in mensajes


def test_cuando_ese_nombre_lo_llevaban_dos_muebles_la_pista_no_elige(client, admin):
    """Un plano que YA tenía el nombre repetido: la pista dice los dos.

    Elegir uno sería mandar el contrato al mueble equivocado, que es el error
    que esta fase vino a matar. Se dicen los dos nombres de hoy y decide quien
    tiene la planilla.
    """
    gemelas = [_punta(2.0, 1.0, "PUN-09"), _punta(2.0, 5.0, "PUN-09")]
    for f in gemelas:
        f["sede"] = "CENTRO"
    _plano(client, admin, gemelas, sede="CENTRO")
    _aplicar(client, admin, sedes=["CENTRO"])

    r = client.post("/api/leases/bulk/validar",
                    json={"sede": "CENTRO", "filas": [_fila(espacio="CENTRO-PUN-09")]},
                    headers=admin)
    fila = r.json()["filas"][0]
    assert fila["estado"] == "error"
    mensajes = " ".join(fila["mensajes"])
    assert "«PUN-09» lo llevaban 2 muebles" in mensajes
    assert "«PUN-01» y «PUN-02»" in mensajes


def test_la_pista_sigue_los_dos_saltos_y_lee_el_plano_de_hoy(client, admin):
    """Después de dos renumeraciones, la pista dice el nombre de HOY.

    Se sigue al mueble por su ``id`` y el nombre final se lee del plano, no de
    la última fila del registro: así la respuesta también es cierta cuando
    alguien renombró el mueble a mano después de renumerar.
    """
    _centro(client, admin)
    _aplicar(client, admin, sedes=["CENTRO"])

    actual = _leer(client, admin, "CENTRO")
    a_mano = [dict(f) for f in actual["fixtures"]]
    for f in a_mano:
        if f["id"] == "p2-5":
            f["code"] = "PUN-30"
    assert _guardar(client, admin, a_mano, sede="CENTRO",
                    base=actual["updated_at"]).status_code == 200
    _aplicar(client, admin, sedes=["CENTRO"])

    r = client.post("/api/leases/bulk/validar",
                    json={"sede": "CENTRO", "filas": [_fila(espacio="PUN-09")]},
                    headers=admin)
    mensajes = " ".join(r.json()["filas"][0]["mensajes"])
    assert "«PUN-09» ahora se llama «PUN-02»" in mensajes
    # Y el nombre intermedio también lleva al mismo mueble.
    r = client.post("/api/leases/bulk/validar",
                    json={"sede": "CENTRO", "filas": [_fila(espacio="PUN-30")]},
                    headers=admin)
    assert "«PUN-30» ahora se llama «PUN-02»" in " ".join(r.json()["filas"][0]["mensajes"])


# ─── El guardarraíl de servidor (fase 12, F7) ────────────────────────────────

def test_el_choque_nuevo_no_se_guarda(client, admin):
    """La regla que faltaba del lado del servidor.

    Vivía sólo en el navegador, así que bastaba otra pantalla, un script o una
    versión vieja para saltarla. Ahora el servidor la aplica, y el mensaje dice
    qué nombre y en qué muebles.
    """
    _plano(client, admin)
    revision = _leer(client, admin)["updated_at"]

    roto = [dict(f) for f in PLANO]
    roto[1]["code"] = roto[0]["code"]
    r = _guardar(client, admin, roto, base=revision)
    assert r.status_code == 409, r.text
    detalle = r.json()["detail"]
    assert detalle["code"] == "nombres_repetidos"
    assert roto[0]["code"] in " ".join(detalle["choques"])

    assert _leer(client, admin)["updated_at"] == revision


def test_una_nomenclatura_que_pisa_el_codigo_de_otro_tampoco_entra(client, admin):
    """El error original de la fase 12, ahora frenado por el servidor.

    Escribir a mano «GON-01» sobre el mueble cuyo código es otro dejaba dos
    cajas rotuladas igual, y desde ahí se vendió dos veces el mismo espacio.
    """
    _plano(client, admin)
    revision = _leer(client, admin)["updated_at"]

    roto = [dict(f) for f in PLANO]
    roto[3]["nomenclatura"] = roto[0]["code"]
    r = _guardar(client, admin, roto, base=revision)
    assert r.status_code == 409
    assert roto[0]["code"] in " ".join(r.json()["detail"]["choques"])


def test_el_409_nombra_a_los_muebles_por_su_nombre_y_no_por_su_id(client, admin):
    """El rechazo tiene que nombrarlos con algo que exista para quien lo lee.

    El ``id`` (``g4-3``, ``p12-1``) es una llave interna: no aparece en el
    plano, ni en el panel, ni en un contrato, ni en el papel que se lleva a la
    tienda. Nombrar el choque con él es tan útil como no nombrarlo — la persona
    ve un nombre y un rótulo, y con eso encuentra el mueble.
    """
    _plano(client, admin)
    revision = _leer(client, admin)["updated_at"]

    roto = [dict(f) for f in PLANO]
    # El mueble que hoy se dibuja «GON-03» pasa a llamarse como el que se dibuja
    # «GON-02»: el choque es nuevo y se rechaza.
    roto[1]["code"] = roto[0]["code"]
    r = _guardar(client, admin, roto, base=revision)
    assert r.status_code == 409, r.text
    mensaje = " ".join(r.json()["detail"]["choques"])

    # Los dos muebles, por el nombre que el plano dibuja HOY, con su rótulo.
    assert "«GON-02» quedaría como nombre de 2 muebles" in mensaje
    assert "el que hoy se llama «GON-03» (Góndola Doble)" in mensaje
    assert "el que hoy se llama «GON-02» (Góndola Doble)" in mensaje
    # Y ni una llave interna.
    for ident in (roto[0]["id"], roto[1]["id"]):
        assert ident not in mensaje, ident

    assert _leer(client, admin)["updated_at"] == revision


def test_el_mueble_que_agrega_el_guardado_se_nombra_como_lo_que_es(client, admin):
    """Un mueble que todavía no está en ninguna pantalla no se puede nombrar
    «el que hoy se llama»: hoy no se llama nada, porque no está."""
    _plano(client, admin)
    revision = _leer(client, admin)["updated_at"]

    con_uno_nuevo = [dict(f) for f in PLANO]
    nuevo = _punta(20.0, 1.0, PLANO[0]["code"])
    nuevo["id"] = "recien"
    con_uno_nuevo.append(nuevo)
    r = _guardar(client, admin, con_uno_nuevo, base=revision)
    assert r.status_code == 409, r.text
    mensaje = " ".join(r.json()["detail"]["choques"])
    assert "el que se agrega en este guardado, «GON-02» (Punta de Góndola)" in mensaje
    assert "recien" not in mensaje


def test_el_plano_que_ya_esta_mal_se_sigue_guardando(client, admin):
    """La regla que no se negocia: lo que ya está mal se abre, se mueve y se guarda.

    Un guardarraíl que trabe un plano existente no es más seguro: deja al dueño
    sin poder mover un mueble en su propia tienda.
    """
    sucio = [dict(f) for f in PLANO]
    sucio[1]["code"] = sucio[0]["code"]
    # Entra la primera vez: un plano que llega por primera vez no se compara con
    # nada — así llega un plano existente, y trabarlo sería hacerlo inimportable.
    _plano(client, admin, sucio)

    revision = _leer(client, admin)["updated_at"]
    movido = [dict(f) for f in sucio]
    movido[1] = dict(movido[1], cz=movido[1]["cz"] + 0.5)
    r = _guardar(client, admin, movido, base=revision)
    assert r.status_code == 200, r.text
    assert _leer(client, admin)["updated_at"] != revision


def test_el_intercambio_de_nombres_no_es_un_choque_nuevo(client, admin):
    """Dos muebles que cambian su nombre por el del otro, y una cadena de tres.

    Comparar cuentas y no pares es lo que hace que esto pase: cruzar dos nombres
    no sube la cuenta de ninguno. Si el guardarraíl mirara pares, renumerar a
    mano sería imposible y la gente terminaría inventando nombres nuevos para
    esquivarlo.
    """
    _plano(client, admin)
    revision = _leer(client, admin)["updated_at"]

    cruzado = [dict(f) for f in PLANO]
    cruzado[0]["code"], cruzado[1]["code"] = cruzado[1]["code"], cruzado[0]["code"]
    r = _guardar(client, admin, cruzado, base=revision)
    assert r.status_code == 200, r.text

    # Y una cadena: A toma el de B, B el de C, C el de A.
    actual = _leer(client, admin)
    fixtures = [dict(f) for f in actual["fixtures"]]
    a, b, c = fixtures[0]["code"], fixtures[1]["code"], fixtures[2]["code"]
    fixtures[0]["code"], fixtures[1]["code"], fixtures[2]["code"] = b, c, a
    r = _guardar(client, admin, fixtures, base=actual["updated_at"])
    assert r.status_code == 200, r.text


def test_la_renumeracion_pasa_por_su_propio_guardarrail(client, admin):
    """Lo que la renumeración escribe tiene que ser guardable por el editor.

    Si el plano renumerado no pudiera volver a guardarse desde la pantalla, la
    renumeración habría dejado la sede en un estado que el sistema no acepta.
    """
    _plano(client, admin)
    _aplicar(client, admin)
    actual = _leer(client, admin)
    r = _guardar(client, admin, actual["fixtures"], base=actual["updated_at"])
    assert r.status_code == 200, r.text


def test_renumerar_es_solo_de_administrador(client, worker):
    for ruta in ("previo", "aplicar"):
        r = client.post(f"/api/layout/renumeracion/{ruta}", json={}, headers=worker)
        assert r.status_code == 403, ruta


def test_las_dos_caras_de_la_gondola_doble_se_mudan_juntas(client, admin):
    """Las dos caras comparten mueble y son espacios distintos.

    El ``-B`` no es parte del código del mueble: es la cara. Si al mudar el
    código se perdiera, las dos caras caerían en el mismo espacio y una taparía
    el contrato de la otra; si no se mudara, la cara B quedaría colgada de un
    nombre que ya no existe.
    """
    _plano(client, admin)
    antes = _por_id(_leer(client, admin)["fixtures"])
    viejo = f"{SEDE}-{antes['g4-11']['code']}"

    creado = _confirmar(client, admin, [
        _fila(2, espacio=viejo),
        _fila(3, espacio=f"{viejo}-B", proveedor="COLGATE"),
    ])
    assert creado["creados"] == 2

    _aplicar(client, admin)
    nuevo = f"{SEDE}-{_por_id(_leer(client, admin)['fixtures'])['g4-11']['code']}"
    espacios = _espacios(client, admin)
    assert {nuevo, f"{nuevo}-B"} <= set(espacios)
    assert not {viejo, f"{viejo}-B"} & set(espacios)
    # Y siguen siendo dos contratos distintos sobre dos espacios distintos.
    assert espacios[nuevo]["id"] != espacios[f"{nuevo}-B"]["id"]
