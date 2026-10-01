"""La marca ``reloj`` de ``conftest.py`` mueve el reloj ANTES de que arranque la app.

Seis archivos de pruebas tienen sus datos en septiembre de 2026 y los piden por
la API: corren con el reloj en ese mes (``conftest.SEPTIEMBRE_DE_2026``). Si la
marca lo moviera recién después de que ``client`` levantó la app, esas pruebas
seguirían pasando —hasta el 2028-10-01— con un arranque que cerró el mes
anterior de OTRO calendario. Esta prueba lo nota el mismo día.
"""
from datetime import datetime, timezone

from conftest import SEPTIEMBRE_DE_2026


def _alta_de_la_base_por_defecto() -> datetime:
    """Cuándo la registró el arranque de la app (cada prueba tiene su base nueva)."""
    from app.clientes import SLUG_POR_DEFECTO, sesion_registro
    from app.models.models import ClienteRow

    reg = sesion_registro()
    try:
        creado = reg.query(ClienteRow).filter(ClienteRow.slug == SLUG_POR_DEFECTO).one().creado
    finally:
        reg.close()
    # SQLite no guarda la zona: vuelve sin tzinfo aunque se haya escrito en UTC.
    return creado if creado.tzinfo else creado.replace(tzinfo=timezone.utc)


@SEPTIEMBRE_DE_2026
def test_con_la_marca_la_app_arranca_en_ese_momento(client):
    from app.plataforma_metricas import periodo_actual

    creado = _alta_de_la_base_por_defecto()
    assert (creado.year, creado.month, creado.day) == (2026, 9, 15), creado
    assert periodo_actual() == "2026-09"


def test_sin_la_marca_el_reloj_es_el_de_siempre(client):
    creado = _alta_de_la_base_por_defecto()
    assert abs((datetime.now(timezone.utc) - creado).total_seconds()) < 60, creado
