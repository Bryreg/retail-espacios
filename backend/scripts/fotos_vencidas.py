"""Qué fotos de montaje y qué planometrías borraría la limpieza, por supermercado.

    cd backend && python scripts/fotos_vencidas.py
    cd backend && python scripts/fotos_vencidas.py --hoy 2026-10-12
    cd backend && python scripts/fotos_vencidas.py --cliente galerias
    cd backend && LIMPIAR_FOTOS_VENCIDAS=1 python scripts/fotos_vencidas.py --borrar

**Por defecto ENSAYA**: no escribe una sola fila, dice qué borraría. Sirve para
saber qué va a hacer la primera pasada antes de prender el borrado: la dueña
baja la copia de seguridad de cada supermercado, se carga en local con
`scripts/restaurar_copia.py` y se corre esto contra esa base, sin tocar
producción.

``--hoy`` es para ensayar otro día (el del despliegue, por ejemplo) y sólo vale
en ensayo: borrar con el reloj adelantado daría por terminados contratos que hoy
están vigentes. ``--borrar`` hace lo mismo que la pasada del mantenimiento y
exige el interruptor prendido (``LIMPIAR_FOTOS_VENCIDAS=1``): si la pasada
automática no tiene permiso para borrar, la consola tampoco.

**La lógica no vive acá.** Está en `app/services/fotos_vencidas.py`, que es lo
mismo que corre el mantenimiento cada 12 horas. Esto es una cáscara de consola.
"""
import argparse
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def _imprimir(slug: str, plan) -> None:
    from app.services.fotos_vencidas import _mb

    print(f"\n── {slug} " + "─" * max(4, 66 - len(slug)))
    for t in plan.terminadas:
        quien = " / ".join(t.proveedores) or "(sin proveedor)"
        print(f"  {t.codigo:<24} {t.desde} → {t.hasta}  {quien}: "
              f"{t.fotos} foto(s), {t.planometrias} planometría(s)")
    pdf = f" ({plan.planometrias_pdf} en PDF: miralas antes, por si es un contrato firmado)" \
        if plan.planometrias_pdf else ""
    verbo = "se borrarían" if plan.ensayo else "borradas"
    print(f"  {verbo}: {len(plan.fotos)} foto(s) de montaje ({_mb(plan.bytes_fotos)} MB) · "
          f"{len(plan.planometrias)} planometría(s){pdf} ({_mb(plan.bytes_planometrias)} MB)")
    if plan.conservadas:
        print("  conservadas: " + ", ".join(f"{k} {v}" for k, v in sorted(plan.conservadas.items())))


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--hoy", type=date.fromisoformat, help="ensayar como si fuera este día (AAAA-MM-DD)")
    ap.add_argument("--cliente", help="sólo este supermercado (por su código)")
    ap.add_argument("--borrar", action="store_true",
                    help="borrar de verdad (exige LIMPIAR_FOTOS_VENCIDAS=1; sin --hoy)")
    args = ap.parse_args()

    from app.services.fotos_vencidas import INTERRUPTOR, borrado_prendido, limpiar_fotos_vencidas

    if args.borrar and args.hoy:
        sys.exit("--hoy sólo vale para ensayar: borrar con otro día daría por terminados contratos vigentes.")
    if args.borrar and not borrado_prendido():
        sys.exit(f"El borrado está apagado ({INTERRUPTOR}). Se prende en el servicio cuando la dueña "
                 "lo decide; sin él, esto sólo ensaya.")

    from app.clientes import listar, sesion_de

    clientes = [c for c in listar() if not args.cliente or c.slug == args.cliente]
    if not clientes:
        sys.exit(f"No hay ningún supermercado activo con el código {args.cliente!r}.")

    for cliente in clientes:
        db = sesion_de(cliente)
        try:
            plan = limpiar_fotos_vencidas(db, args.hoy, ensayo=not args.borrar)
        except Exception as e:  # noqa: BLE001 — un cliente roto no frena a los demás
            print(f"\n── {cliente.slug}: no se pudo revisar ({type(e).__name__}: {e})")
            continue
        finally:
            db.close()
        _imprimir(cliente.slug, plan)

    if not args.borrar:
        print("\n(ensayo: no se escribió nada)")
