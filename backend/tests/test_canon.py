"""El canon del mes (``services/canon.py``) contra los casos que comparte con
el navegador: ``frontend/scripts/casos/canon.json`` (allá los corre
``scripts/probar-canon.mjs`` sobre ``utils/canon.ts``). Si se separan, Inicio y
«Todas las sedes» vuelven a decir dos cifras de la misma sede (auditoría P1-16).

Todo ``import app.*`` va adentro de las funciones (el fixture ``client`` purga
``sys.modules`` en las otras pruebas).
"""
import json
from datetime import date
from pathlib import Path

CASOS = Path(__file__).resolve().parents[2] / "frontend/scripts/casos/canon.json"


def _fecha(x):
    return date.fromisoformat(x) if x else None


def test_los_casos_compartidos_dan_lo_mismo():
    from app.services.canon import canon_del_mes

    casos = json.loads(CASOS.read_text(encoding="utf-8"))["casos"]
    assert len(casos) >= 10
    for c in casos:
        anio, mes = map(int, c["mes"].split("-"))
        contratos = [{"valor": x["valor"], "desde": _fecha(x["desde"]), "hasta": _fecha(x["hasta"]),
                      "corta": _fecha(x.get("corta"))} for x in c["contratos"]]
        cortes = [{"monto": x["monto"], "desde": _fecha(x["desde"]), "hasta": _fecha(x["hasta"])}
                  for x in c["cortes"]]
        r = canon_del_mes(contratos, cortes, anio, mes)
        assert r == c["canon"], f"{c['por']}: dio {r}, se esperaba {c['canon']}"
        assert r == int(r), f"{c['por']}: no es un peso entero"


def test_seis_meses_cancelado_el_primero_del_cuarto_aporta_tres():
    """El criterio de P2-13 sobre la cuenta pura."""
    from app.services.canon import canon_del_mes

    c = [{"valor": 1_800_000, "desde": date(2026, 7, 1), "hasta": date(2026, 12, 31), "corta": date(2026, 9, 30)}]
    por_mes = [canon_del_mes(c, [], 2026, m) for m in range(7, 13)]
    assert por_mes == [300_000, 300_000, 300_000, 0, 0, 0]
