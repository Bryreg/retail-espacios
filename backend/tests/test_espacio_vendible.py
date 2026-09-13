"""Qué es espacio vendible, del lado del servidor.

El frontend decide qué se DIBUJA como vendible; el backend decide qué se PUEDE
GUARDAR. Estas pruebas cubren el segundo, que es el que de verdad frena: una
pantalla se puede saltar, un ``POST`` no.

El defecto que arreglaron: la regla miraba sólo la bandera ``rentable``, y esa
bandera se estampa al CREAR el mueble. Un plano guardado antes de que la
bandera existiera no la trae, y ``rentable`` ausente significa comercializable
—tiene que significar eso, o esos planos se vaciarían—. O sea que **todas las
cajas registradoras de los planos viejos aceptaban un contrato**.

── NUNCA: nada de ``from app...`` acá arriba ────────────────────────────────

Importar código de ``app`` a nivel de MÓDULO rompe el aislamiento de toda la
suite, y de una manera que no se ve: los módulos de prueba se importan durante
la COLECCIÓN, o sea antes de que el fixture ``client`` fije ``DATABASE_URL``.
``app.database`` arma su motor al importarse y, sin la variable, cae en su
valor por defecto —``sqlite:///./retail_espacios.db``, un archivo de verdad que
sobrevive entre corridas—. Ese motor queda cacheado en ``sys.modules`` para
toda la sesión, así que el registro de clientes de CADA prueba apunta al mismo
archivo compartido: la primera que da de alta «nuevomarket» lo deja escrito
para siempre y la siguiente corrida se estrella con un 409. Pasó exactamente
así, y lo que falló fue ``test_alta``, que no tiene nada que ver con esto.

Por eso cada prueba importa lo suyo ADENTRO, que es lo que hace el resto de la
suite.
"""


def _reglas():
    from app.services.layout_lookup import NUNCA_ALQUILABLE, es_comercializable
    return NUNCA_ALQUILABLE, es_comercializable


def test_los_puestos_de_trabajo_no_se_venden():
    _, es_comercializable = _reglas()
    for tipo in ("columna", "checkout", "servicio_cliente"):
        assert es_comercializable({"type": tipo}) is False, tipo


def test_un_plano_viejo_sin_bandera_tampoco_vende_las_cajas():
    _, es_comercializable = _reglas()
    # Sin la clave `rentable`: es exactamente la forma que tienen los muebles
    # guardados antes de que la bandera existiera.
    assert es_comercializable({"type": "checkout", "code": "CAJ-01"}) is False
    assert es_comercializable({"type": "servicio_cliente", "code": "SAC-01"}) is False


def test_la_bandera_no_da_vuelta_lo_que_decide_el_tipo():
    _, es_comercializable = _reglas()
    for tipo in ("columna", "checkout", "servicio_cliente"):
        assert es_comercializable({"type": tipo, "rentable": True}) is False, tipo


def test_lo_que_si_se_vende_sigue_vendiendose():
    _, es_comercializable = _reglas()
    # El modo de falla caro de esta regla es al revés: comerse el catálogo
    # comercial vacía la disponibilidad de la sede entera, y en silencio.
    for tipo in (
        "gondola", "gondola_doble", "gondola_mural", "punta", "robatope",
        "ristra", "cross", "impulsador", "mueble", "isla", "batea",
        "isla_fria", "nevera_carnes", "nevera_vegetales", "nevera_refrescos",
        "stand_frutas", "metro",
    ):
        assert es_comercializable({"type": tipo}) is True, tipo


def test_la_bandera_sigue_mandando_donde_el_tipo_no_decide():
    _, es_comercializable = _reglas()
    assert es_comercializable({"type": "metro", "rentable": False}) is False
    assert es_comercializable({"type": "gondola", "rentable": False}) is False
    # Y un fixture sin tipo cae en la bandera, como antes.
    assert es_comercializable({}) is True
    assert es_comercializable({"rentable": False}) is False


def test_la_lista_es_la_misma_que_la_del_frontend():
    """Con dos listas, la pantalla ofrece lo que el servidor rechaza."""
    NUNCA_ALQUILABLE, _ = _reglas()
    import re
    from pathlib import Path

    ts = Path(__file__).resolve().parents[2] / "frontend" / "src" / "types" / "fixtures.ts"
    texto = ts.read_text(encoding="utf-8")
    bloque = re.search(
        r"NUNCA_ALQUILABLE:\s*ReadonlySet<string>\s*=\s*new Set<FixType>\(\[(.*?)\]\)",
        texto, re.S,
    )
    assert bloque, "el frontend perdió su lista de muebles no vendibles"
    front = {
        t.strip().strip('"').strip("'")
        for t in bloque.group(1).split(",")
        if t.strip() and not t.strip().startswith("//")
    }
    assert front == set(NUNCA_ALQUILABLE)
