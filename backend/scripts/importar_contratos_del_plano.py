"""Pasar a la base los contratos que hoy viven sólo en el JSON del layout.

    cd backend && python scripts/importar_contratos_del_plano.py --ensayo
    cd backend && python scripts/importar_contratos_del_plano.py

**La lógica no vive acá.** Está en `app/services/importar_del_plano.py`, que es
el mismo código que usa la pantalla (Supervisar → «Contrato que sólo vive en el
plano»). Esto es una cáscara de consola sobre eso: tener dos implementaciones de
algo que escribe contratos es exactamente la clase de duplicación que este
proyecto viene sacando.

La pantalla alcanza para todo. Esto queda para donde haya consola y no navegador
—una restauración, una base que todavía no se desplegó— y porque un `--ensayo`
en una terminal es la forma más rápida de mirar el panorama completo.

``--ensayo`` no escribe: dice qué haría.
"""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.database import SessionLocal  # noqa: E402
from app.services.importar_del_plano import aplicar, revisar  # noqa: E402

if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--ensayo", action="store_true", help="no escribe: dice qué haría")
    args = ap.parse_args()

    db = SessionLocal()
    try:
        plan = revisar(db) if args.ensayo else aplicar(db)
    finally:
        db.close()

    for fila in plan.importables:
        print(f"  + {fila.espacio:<22} {fila.desde} → {fila.hasta}  {fila.proveedor}")

    print("\n" + "─" * 72)
    verbo = "se crearían" if args.ensayo else "creados"
    print(f"{len(plan.importables)} contrato(s) {verbo} · "
          f"{plan.ya_estaban} ya estaban en la base")

    if plan.incompletos:
        print(f"\n{len(plan.incompletos)} que el plano da por vendidos y NO se pueden "
              f"importar. Hay que mirarlos a mano:")
        for x in plan.incompletos:
            print(f"    {x.espacio:<22} {x.motivo}")

    if args.ensayo:
        print("\n(ensayo: no se escribió nada)")
