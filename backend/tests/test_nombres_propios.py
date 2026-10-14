"""El nombre propio de cada familia de muebles («mamut», «tope de góndola»).

Es ``catalog_labels`` de ``/api/layout/settings`` (``app_config``,
``layout_catalog_labels``), que existía como «etiquetas del catálogo» y sólo
aplicaba la biblioteca del plano 2D. Ahora lo leen todas las pantallas del
supermercado (``frontend/src/catalogo/nombresPropios.ts``; las guardas de la
pantalla están en ``frontend/scripts/probar-nombres.mjs``). Lo que se prueba
acá es lo del servidor:

* lo escribe administración y lo lee cualquier sesión del supermercado, el
  trabajador incluido (Vender y Montajes lo muestran; no es plata);
* un nombre tiene el largo del nombre de una ficha, contado en letras de verdad
  (el mismo ``largoMaximo.nombre`` de ``muebles.json`` que lee el navegador), y
  no se aceptan cientos;
* el servidor no lo usa para nada más: sólo ``routers/layout.py`` lee esa
  clave. La consola y los informes de asesoría comparan clientes con el nombre
  de RECABRA; que no lo devuelvan lo prueba ``test_plataforma_detalle.py``
  (``test_la_consola_no_usa_el_nombre_propio_del_supermercado``).
"""
import re
from pathlib import Path


def _ajustes(client, cab):
    r = client.get("/api/layout/settings", headers=cab)
    assert r.status_code == 200, r.text
    return r.json()


def _guardar(client, cab, nombres, rev=None):
    cuerpo = {"sedes": ["NAVE"], "catalog_labels": nombres}
    if rev is not None:
        cuerpo["base_updated_at"] = rev
    return client.put("/api/layout/settings", json=cuerpo, headers=cab)


def test_lo_escribe_administracion_y_lo_lee_cualquier_sesion(client, admin, worker):
    nombres = {"punta": "Tope de góndola", "isla": "Mamut", "gondola_doble": "Góndola de centro"}
    r = _guardar(client, admin, nombres)
    assert r.status_code == 200, r.text
    assert r.json()["catalog_labels"] == nombres
    # La trabajadora los ve: Vender, Supervisar y Montajes los muestran.
    assert _ajustes(client, worker)["catalog_labels"] == nombres
    # Pero no los cambia.
    rev = _ajustes(client, admin)["updated_at"]
    r = _guardar(client, worker, {"punta": "Otra cosa"}, rev)
    assert r.status_code == 403, r.text
    assert _ajustes(client, admin)["catalog_labels"] == nombres


def test_un_nombre_tiene_el_largo_del_nombre_de_una_ficha(client, admin):
    from app.services.catalogo_muebles import REGLAS_DE_FICHA

    largo = REGLAS_DE_FICHA["largoMaximo"]["nombre"]
    assert largo == 80
    # En letras de verdad: 🛒 son dos unidades para el navegador y una acá, y
    # el navegador también las cuenta como una (`[...texto].length`).
    r = _guardar(client, admin, {"punta": "🛒" * largo})
    assert r.status_code == 200, r.text
    rev = r.json()["updated_at"]
    r = _guardar(client, admin, {"punta": "🛒" * (largo + 1)}, rev)
    assert r.status_code == 422, r.text
    assert "80 letras" in r.text
    # Los espacios de los costados no cuentan.
    r = _guardar(client, admin, {"punta": "  " + "a" * largo + "  "}, rev)
    assert r.status_code == 200, r.text
    # Lo rechazado no se guardó.
    assert _ajustes(client, admin)["catalog_labels"] == {"punta": "  " + "a" * largo + "  "}


def test_no_se_guardan_cientos_ni_claves_largas(client, admin):
    r = _guardar(client, admin, {f"familia{i}": "x" for i in range(101)})
    assert r.status_code == 422, r.text
    r = _guardar(client, admin, {"f" * 61: "x"})
    assert r.status_code == 422, r.text
    # Una clave que el catálogo no conoce NO se rechaza: una entrada vieja no
    # puede trabar el guardado de la lista de sedes, que viaja en el mismo PUT.
    r = _guardar(client, admin, {"tipo_viejo": "Lo que sea", "punta": "Tope"})
    assert r.status_code == 200, r.text


def test_sin_nombres_propios_se_guarda_como_siempre(client, admin):
    r = _guardar(client, admin, {})
    assert r.status_code == 200, r.text
    assert r.json()["catalog_labels"] == {}
    assert _ajustes(client, admin)["catalog_labels"] == {}


def test_el_servidor_no_usa_los_nombres_propios_para_nada_mas():
    """Sólo ``routers/layout.py`` lee la clave: ni la consola, ni los informes
    de asesoría, ni la planilla, ni los correos, ni el enlace de montaje. El
    nombre de RECABRA es el que se compara entre supermercados."""
    app = Path(__file__).resolve().parents[1] / "app"
    quien = set()
    for archivo in app.rglob("*.py"):
        texto = archivo.read_text(encoding="utf8")
        if re.search(r"layout_catalog_labels|CATALOG_LABELS_KEY|catalog_labels", texto):
            quien.add(archivo.relative_to(app).as_posix())
    assert quien == {"routers/layout.py", "schemas/layout.py"}, quien
