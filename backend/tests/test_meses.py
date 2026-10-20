"""La duración en meses (``services/meses.py``) contra los casos que comparte con
el frontend: ``frontend/scripts/casos/meses.json``. Si la cuenta de acá y la de
``frontend/src/utils/meses.ts`` se separan, «al mes» de Vender y «al mes» de
Supervisar dirían dos cosas distintas del mismo contrato.

Todo ``import app.*`` va adentro de las funciones (el fixture ``client`` purga
``sys.modules`` en las otras pruebas).
"""
import json
from datetime import date
from pathlib import Path

CASOS = Path(__file__).resolve().parents[2] / "frontend/scripts/casos/meses.json"


def test_los_casos_compartidos_dan_lo_mismo():
    from app.services.meses import meses_entre

    casos = json.loads(CASOS.read_text(encoding="utf-8"))["casos"]
    assert len(casos) >= 12
    for c in casos:
        r = meses_entre(date.fromisoformat(c["desde"]), date.fromisoformat(c["hasta"]))
        assert abs(r - c["meses"]) < 1e-6, f"{c['por']}: dio {r}, se esperaba {c['meses']}"


def test_al_mes_por_los_meses_da_el_total():
    """«Al mes» × meses = el total, redondeado al peso (vender-api.md §6)."""
    from app.services.meses import meses_entre

    meses = meses_entre(date(2026, 11, 1), date(2027, 1, 31))
    assert round(600_000 * meses) == 1_800_000
    meses = meses_entre(date(2026, 10, 19), date(2026, 11, 30))
    assert round(500_000 * meses) == 700_000
