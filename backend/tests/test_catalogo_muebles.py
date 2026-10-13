"""El catálogo de muebles: una sola verdad, en dos copias idénticas.

El tipo de mueble estaba escrito a mano en unas veintidós tablas, cinco de este
lado: los prefijos (``renumeracion.py``), lo que nunca se alquila y las frases
de referencia (``layout_lookup.py``) y la clave de tarifa, dos veces
(``bulk_leases.py`` y ``plataforma_metricas.py``). Ahora salen de
``app/catalogo/muebles.json`` (``services/catalogo_muebles.py``), que es una
copia idéntica de ``frontend/src/catalogo/muebles.json``: la imagen de Docker
lleva ``backend/`` y ``frontend/dist``, no una carpeta compartida.

Lo que se vigila acá:

* que las dos copias sean la misma, byte a byte, y que la del servidor viaje en
  la imagen;
* que lo que calcula el servidor sobre el plano sintético sea exactamente lo de
  antes del catálogo (la parte ``python`` de
  ``frontend/scripts/casos/catalogo-antes.json``);
* que las tablas de cada módulo sean las del catálogo y no una copia;
* que el archivo sea válido para lo que el servidor lee de él.

La parte del navegador la compara ``frontend/scripts/probar-catalogo.mjs``.

Hasta las pruebas que no tocan la API piden ``client``: es el que apunta
``DATABASE_URL`` a una base descartable antes de importar ``app`` (ver
``conftest.py``).
"""
import json
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
COPIA_DEL_FRONTEND = RAIZ / "frontend" / "src" / "catalogo" / "muebles.json"
COPIA_DEL_SERVIDOR = RAIZ / "backend" / "app" / "catalogo" / "muebles.json"
ANTES = RAIZ / "frontend" / "scripts" / "casos" / "catalogo-antes.json"

#: Lo que el catálogo cambió A PROPÓSITO en la parte ``python`` de
#: ``catalogo-antes.json``: ruta (claves separadas por punto) → (antes, ahora).
#:
#: Los cambios intencionales del catálogo único —el fondo del mostrador de
#: carnes y el alto y el color del servicio al cliente cuando nacen en el 2D, el
#: color de ``nevera_mural``, los nombres de la vitrina, la zona libre y el
#: impulsador en los informes y los rótulos de las tarifas de la isla y la
#: cruz— están escritos en ``CAMBIOS_INTENCIONALES`` de
#: ``frontend/scripts/probar-catalogo.mjs``, y todos son del navegador: ningún
#: prefijo, ninguna clave de tarifa, ninguna referencia ni ninguna regla de qué
#: se alquila cambió. Por eso acá la lista está vacía y la comparación es
#: exacta. Un cambio futuro que toque al servidor se escribe acá, con su porqué.
CAMBIOS_INTENCIONALES: dict[str, tuple] = {}

_AUSENTE = object()


def _catalogo() -> dict:
    return json.loads(COPIA_DEL_SERVIDOR.read_text(encoding="utf-8"))


# ─── Las dos copias ───────────────────────────────────────────────────────────

def test_las_dos_copias_son_identicas_byte_a_byte():
    """Separadas, el servidor renumera, cobra y decide qué se vende con otro
    catálogo que el que dibuja la pantalla."""
    assert COPIA_DEL_FRONTEND.read_bytes() == COPIA_DEL_SERVIDOR.read_bytes(), (
        "backend/app/catalogo/muebles.json no es igual a frontend/src/catalogo/muebles.json: "
        "se edita uno y se copia sobre el otro"
    )


def test_la_copia_del_servidor_viaja_en_la_imagen(client):
    """El ``Dockerfile`` copia ``backend/`` entero a la imagen, el servicio lee
    la copia que está adentro de ``app/`` y ningún ``.dockerignore`` la saca."""
    from app.services import catalogo_muebles

    assert catalogo_muebles.RUTA.resolve() == COPIA_DEL_SERVIDOR.resolve()
    dockerfile = (RAIZ / "Dockerfile").read_text(encoding="utf-8")
    assert re.search(r"^COPY backend/ \./backend/\s*$", dockerfile, re.M), (
        "el Dockerfile ya no copia backend/ entero: el catálogo no llegaría a la imagen"
    )
    # Docker sólo lee el .dockerignore de la raíz del contexto, que es el repo.
    ignorar = RAIZ / ".dockerignore"
    if ignorar.exists():
        reglas = [linea.strip() for linea in ignorar.read_text(encoding="utf-8").splitlines()
                  if linea.strip() and not linea.lstrip().startswith("#")]
        sospechosas = [r for r in reglas if re.search(r"json|catalogo|backend/app", r)]
        assert not sospechosas, f".dockerignore podría sacar el catálogo de la imagen: {sospechosas}"


# ─── Lo de antes, igual ───────────────────────────────────────────────────────

def _aplicar(datos: dict, ruta: str, valor) -> None:
    *camino, ultima = ruta.split(".")
    for clave in camino:
        datos = datos[clave]
    if valor is _AUSENTE:
        datos.pop(ultima, None)
    else:
        datos[ultima] = valor


def _leer(datos: dict, ruta: str):
    for clave in ruta.split("."):
        if not isinstance(datos, dict) or clave not in datos:
            return _AUSENTE
        datos = datos[clave]
    return datos


def test_lo_que_calcula_el_servidor_es_lo_de_antes(client):
    """La promesa del catálogo único: un plano viejo da exactamente lo mismo.

    Se corre la misma captura que anotó el «antes» (``capturar``, de
    ``scripts/capturar_catalogo.py``) sobre el código de hoy y el plano guardado
    en la referencia, y se compara carácter por carácter —con el mismo formato
    que la escribió—: prefijos, lo que nunca se alquila, referencias, la
    respuesta por tipo, los espacios que se ofrecen, las caras que cuenta la
    plataforma, la renumeración, la importación del plano y la auditoría.
    """
    from scripts.capturar_catalogo import a_json, capturar

    referencia = json.loads(ANTES.read_text(encoding="utf-8"))
    esperado = json.loads(json.dumps(referencia["python"]))
    for ruta, (antes, ahora) in CAMBIOS_INTENCIONALES.items():
        assert _leer(esperado, ruta) == antes, f"{ruta}: la referencia no dice {antes!r}"
        _aplicar(esperado, ruta, ahora)

    ahora = capturar(referencia["tipos"], referencia["plano"]["sede"], referencia["plano"]["muebles"])

    if a_json(ahora) != a_json(esperado):
        distintas = [
            f"{seccion}.{clave}"
            for seccion in ("tablas", "por_tipo", "por_mueble", "plano")
            for clave in sorted(set(esperado[seccion]) | set(ahora[seccion]))
            if a_json(esperado[seccion].get(clave)) != a_json(ahora[seccion].get(clave))
        ]
        raise AssertionError(f"el servidor ya no calcula lo de antes en: {distintas}")


# ─── Las tablas son las del catálogo ──────────────────────────────────────────

def test_las_tablas_del_servidor_salen_del_catalogo(client, monkeypatch):
    """Una copia escrita a mano que hoy coincide pasa la comparación de arriba;
    ésta no: cada módulo tiene que tener LA tabla del catálogo, y la tarifa
    tiene que seguirlo si cambia."""
    from app import plataforma_metricas
    from app.routers import bulk_leases
    from app.services import catalogo_muebles, layout_lookup, renumeracion

    assert renumeracion.PREFIJO_POR_TIPO is catalogo_muebles.PREFIJO_POR_TIPO
    assert renumeracion.PREFIJO_DESCONOCIDO == catalogo_muebles.PREFIJO_DESCONOCIDO
    assert layout_lookup.NUNCA_ALQUILABLE is catalogo_muebles.NUNCA_ALQUILABLE
    assert layout_lookup._REFERENCIAS is catalogo_muebles.REFERENCIAS

    monkeypatch.setitem(catalogo_muebles.TARIFA_POR_TIPO, "punta", "tarifa_adulterada")
    assert bulk_leases._tipo_de_tarifa("punta") == "tarifa_adulterada"
    assert plataforma_metricas._tipo_de_tarifa("punta") == "tarifa_adulterada"
    # Lo que no tiene tarifa contesta su propio tipo, como siempre.
    assert bulk_leases._tipo_de_tarifa("checkout") == "checkout"
    assert plataforma_metricas._tipo_de_tarifa("tipo_que_no_existe") == "tipo_que_no_existe"


def test_las_caras_del_catalogo_son_las_de_caras_de(client):
    """La regla de la cara B es código (``caras_de``, con sus casos en
    ``caras.json``); el catálogo anota cuántas caras tiene cada variante. Si
    dicen otra cosa, uno de los dos miente."""
    from app.services.layout_lookup import caras_de

    cat = _catalogo()
    for tipo, d in cat["tipos"].items():
        if "variantes" not in d:
            assert caras_de({"type": tipo}) == 1, tipo
            continue
        for variante, forma in d["variantes"].items():
            assert caras_de({"type": tipo, "gondolaType": variante}) == forma["caras"], f"{tipo}:{variante}"
    for alias, a in cat["alias"].items():
        assert caras_de({"type": alias}) == cat["tipos"][a["tipo"]]["variantes"][a["variante"]]["caras"], alias


# ─── El archivo ───────────────────────────────────────────────────────────────

def test_el_catalogo_es_valido_para_lo_que_lee_el_servidor():
    """Lo que el servidor lee: prefijo, si se alquila, tarifa y referencia. La
    validación entera (rótulos, medidas, colores, órdenes) la hace
    ``probar-catalogo.mjs``; acá va lo que rompería al servidor."""
    cat = _catalogo()
    tipos, alias = cat["tipos"], cat["alias"]
    assert re.fullmatch(r"[A-Z]{3}", cat["prefijoDesconocido"])

    prefijos = [d["prefijo"] for d in tipos.values()]
    assert len(prefijos) == len(set(prefijos)), "dos tipos con el mismo prefijo (sólo los alias lo comparten)"
    assert cat["prefijoDesconocido"] not in prefijos
    assert all(re.fullmatch(r"[A-Z]{3}", p) for p in prefijos)

    claves_de_tarifa = [t["clave"] for t in cat["tarifas"]]
    assert len(claves_de_tarifa) == len(set(claves_de_tarifa)), "dos tarifas con la misma clave"
    for tipo, d in tipos.items():
        assert d["alquilable"] in ("si", "no_por_defecto", "nunca"), tipo
        if d["alquilable"] == "nunca":
            assert "tarifa" not in d, f"{tipo} no se vende nunca y tiene tarifa"
        elif not d.get("legado"):
            assert d.get("tarifa") in claves_de_tarifa, f"{tipo} se vende y no tiene tarifa"
        medidas = [d.get("medidas", {})] + [v["medidas"] for v in d.get("variantes", {}).values()]
        for m in medidas:
            assert all(isinstance(x, (int, float)) and x > 0 for x in m.values()), f"{tipo}: medidas no positivas"

    for nombre, a in alias.items():
        assert nombre not in tipos, f"el alias {nombre} ya es un tipo"
        assert a["variante"] in tipos[a["tipo"]].get("variantes", {}), nombre

    con_referencia = {t for t, d in tipos.items() if "referencia" in d}
    assert set(cat["orden"]["minimapa"]) == con_referencia
