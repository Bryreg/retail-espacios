"""La suite no puede volver a quedarse con una app entera por prueba.

Cada prueba con ``client`` importa la app de nuevo y, al terminar, la saca de
``sys.modules``. Si algo de afuera sigue apuntando a sus clases o funciones, la
app vieja no se libera nunca: hasta el 2026-10-18 cada prueba dejaba ~7 MB
(un registro de SQLAlchemy sin tope más los cachés de ``typing`` y de FastAPI),
la suite pasaba los 4 GB, el runner de GitHub entraba en swap y el job tardaba
más de una hora, con un cuarto de hora extra para salir después del 100 %.

Esta prueba levanta la app dos veces como lo hace ``client`` y exige que, al
bajarlas, no quede viva ninguna. Si falla después de actualizar una librería,
hay una referencia nueva: la cadena se encuentra subiendo desde una clase vieja
con ``gc.get_referrers`` hasta un módulo que siga en ``sys.modules``, y se corta
en ``conftest.soltar_la_app_vieja``.

Una excepción logueada durante el arranque también retiene la app —pytest guarda
el registro con su traceback hasta que termina la fase, y el traceback apunta a
los módulos de la app—, así que eso se mira antes y se reporta como lo que es:
el arranque falló, no hay fuga.
"""
import gc
import weakref

from conftest import app_de_prueba


def _una_vuelta():
    """Levanta y baja la app; devuelve sólo referencias débiles a lo que tiene
    que morir (nada de esta función la mantiene viva al volver)."""
    with app_de_prueba() as c:
        assert c.get("/api/health").status_code == 200
        from app.main import app as la_app
        from app.models.models import Space

        return weakref.ref(la_app), weakref.ref(Space)


def test_la_app_de_una_prueba_se_libera_cuando_termina(caplog):
    vueltas = [_una_vuelta() for _ in range(2)]

    errores = [r.getMessage() for r in caplog.records if r.exc_info]
    assert errores == [], f"el arranque de la app logueó excepciones (no es una fuga): {errores}"

    gc.collect()

    vivas = [i for i, (app, modelo) in enumerate(vueltas) if app() is not None or modelo() is not None]
    assert vivas == [], (
        f"quedaron vivas las apps de las vueltas {vivas}: algo fuera de app.* "
        "las retiene y cada prueba de la suite acumula memoria (ver el docstring)"
    )
