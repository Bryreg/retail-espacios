"""Pasar a la base los contratos que hoy viven sólo en el JSON del layout.

    cd backend && python scripts/importar_contratos_del_plano.py --ensayo
    cd backend && python scripts/importar_contratos_del_plano.py

Se corre **una vez**, antes de que el layout deje de guardar estado comercial.
Sin esto, al invertir la verdad esos contratos desaparecerían de la pantalla:
no están en ninguna tabla, así que nada los podría volver a dibujar.

Es idempotente: un espacio que ya tiene su contrato en la base no se toca. Se
puede correr dos veces sin duplicar nada.

``--ensayo`` no escribe: dice qué haría. Conviene mirarlo antes.

── Qué NO hace ──────────────────────────────────────────────────────────────

No inventa lo que el JSON no tiene. Un contrato del plano sin fechas o sin
proveedor no se puede volver una fila de ``space_leases`` —esas columnas son
obligatorias— así que se reporta y se deja afuera. Son casos para mirar a mano.

Tampoco borra nada del JSON: eso pasa solo, en el primer guardado, cuando el
servidor deje de aceptar esos campos.
"""
import argparse
import json
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.database import SessionLocal  # noqa: E402
from app.models.models import (  # noqa: E402
    LayoutSnapshot, Space, SpaceLease, SpaceStatus, Supplier,
)


def caras_vendidas(fixtures: list[dict]) -> list[tuple[str, dict]]:
    """Los espacios que el plano da por vendidos, con su contrato.

    Una góndola doble son dos espacios: la cara A vive en el mueble y la B en
    ``faceB``. Un mueble no comercializable no cuenta: no se vende.
    """
    out: list[tuple[str, dict]] = []
    for f in fixtures:
        code = (f.get("code") or "").strip().upper()
        if not code or f.get("rentable") is False:
            continue
        if (f.get("status") or "free") == "occupied":
            out.append((code, f))
        if f.get("gondolaType") == "double" or f.get("type") == "gondola_doble":
            b = f.get("faceB") or {}
            if (b.get("status") or "free") == "occupied":
                out.append((f"{code}-B", b))
    return out


def _fecha(v) -> date | None:
    try:
        return date.fromisoformat((v or "")[:10])
    except ValueError:
        return None


def importar(db, ensayo: bool = False) -> tuple[int, int, list[str]]:
    creados = 0
    ya_estaban = 0
    incompletos: list[str] = []

    for snap in db.query(LayoutSnapshot).all():
        sede = (snap.sede or "").strip().upper()
        fixtures = json.loads(snap.fixtures_json or "[]")

        for corto, cara in caras_vendidas(fixtures):
            completo = f"{sede}-{corto}"
            desde, hasta = _fecha(cara.get("startDate")), _fecha(cara.get("endDate"))
            proveedor = (cara.get("supplierName") or "").strip()

            if not desde or not hasta or desde > hasta or not proveedor:
                incompletos.append(
                    f"{completo}: proveedor={proveedor or '—'} "
                    f"{cara.get('startDate') or '—'}→{cara.get('endDate') or '—'}"
                )
                continue

            space = db.query(Space).filter(Space.code == completo).first()
            if space and (space.active_lease or space.upcoming_lease):
                ya_estaban += 1
                continue

            print(f"  + {completo:<22} {desde} → {hasta}  {proveedor}")
            creados += 1
            if ensayo:
                continue

            if space is None:
                space = Space(
                    code=completo, svg_id=f"fix-{completo}",
                    name=cara.get("label") or corto, zone="Sin zona",
                    sede=sede, area_m2=4.0, status=SpaceStatus.free,
                )
                db.add(space)
                db.flush()

            prov = db.query(Supplier).filter(Supplier.name == proveedor).first()
            if prov is None:
                prov = Supplier(name=proveedor)
                db.add(prov)
                db.flush()

            db.add(SpaceLease(
                space_id=space.id, supplier_id=prov.id,
                marca=(cara.get("brandCategory") or "").strip() or None,
                start_date=desde, end_date=hasta,
                monthly_rent=float(cara.get("negotiatedValue") or 0),
                is_active=True,
                notes=(cara.get("observation") or "").strip() or None,
            ))
            if desde <= date.today() <= hasta:
                space.status = SpaceStatus.occupied

    if not ensayo and creados:
        db.commit()
    return creados, ya_estaban, incompletos


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--ensayo", action="store_true", help="no escribe: dice qué haría")
    args = ap.parse_args()

    db = SessionLocal()
    try:
        creados, ya, incompletos = importar(db, args.ensayo)
    finally:
        db.close()

    print("\n" + "─" * 72)
    verbo = "se crearían" if args.ensayo else "creados"
    print(f"{creados} contrato(s) {verbo} · {ya} ya estaban en la base")
    if incompletos:
        print(f"\n{len(incompletos)} que el plano da por vendidos y NO se pueden "
              f"importar — les falta proveedor o fechas, que en la base son\n"
              f"obligatorios. Hay que mirarlos a mano:")
        for x in incompletos:
            print(f"    {x}")
    if args.ensayo:
        print("\n(ensayo: no se escribió nada)")
