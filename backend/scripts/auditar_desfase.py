"""Qué contratos tiene la base que el plano no muestra.

    cd backend && python scripts/auditar_desfase.py            # todas las sedes
    cd backend && python scripts/auditar_desfase.py "CIUDAD JARDIN"

**Sólo lee.** No escribe una fila ni manda un correo. Usa el mismo
``DATABASE_URL`` que la aplicación, así que contra producción hay que correrlo
donde esa variable esté puesta (la consola del servicio en Render).

── Por qué existe ───────────────────────────────────────────────────────────

El plano sale del **JSON del layout**, que es una copia que mantiene al día el
navegador que vende. La **base** (``space_leases``) es la que manda: es la que
valida al guardar. Cuando las dos no coinciden, la pantalla y el servidor dicen
cosas distintas y las dos tienen razón — por eso no se arregla mirando una sola.

Se reportó así: *«no me deja alquilar la IMP-17 que está libre, el sistema la
toma como ocupada y no tiene ningún contrato»*. La base tenía el contrato.

La auditoría encontró que **toda edición del plano que saca un espacio de
circulación deja su contrato vivo en la base**, por tres puertas distintas:
borrar el mueble, pasar una góndola de doble a simple (la cara B desaparece) y
marcarlo «no comercializable». Ninguna avisa, porque el layout NO escribe en la
base: nunca lo hizo.

Este script no arregla nada — dice **dónde** está el desfase, para resolverlo
uno por uno desde la pantalla. Cancelar un contrato es plata y un compromiso con
un proveedor: no lo puede decidir un script.
"""
import json
import sys
from collections import defaultdict
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.database import SessionLocal  # noqa: E402
from app.models.models import LayoutSnapshot, Space, SpaceLease  # noqa: E402


def caras_del_plano(fixtures: list[dict]) -> dict[str, dict]:
    """Los códigos CORTOS que el plano ofrece hoy, con lo que dice de cada uno.

    Una góndola doble son dos espacios: ``GON-60`` y ``GON-60-B``. Un mueble
    marcado no comercializable NO está acá: sale de la venta, y ése es
    justamente uno de los casos que hay que encontrar.
    """
    caras: dict[str, dict] = {}
    for f in fixtures:
        code = (f.get("code") or "").strip().upper()
        if not code or f.get("rentable") is False:
            continue
        caras[code] = f
        if f.get("gondolaType") == "double" or f.get("type") == "gondola_doble":
            caras[f"{code}-B"] = f.get("faceB") or {}
    return caras


def contratos_del_plano(caras: dict[str, dict]) -> dict[str, dict]:
    """Los espacios que el PLANO da por vendidos hoy, con fecha de fin vigente.

    Es la dirección contraria, y la que más pesa para decidir arquitectura: un
    contrato que vive SÓLO en el JSON del layout no está en ninguna tabla. Si
    algún día la base pasa a ser la única verdad, ése es el que se pierde.

    Existe porque existió: el panel del plano 2D tuvo campos de contrato
    editables que escribían el layout sin tocar la base —se quitaron justamente
    por esto—, y cualquier contrato cargado así sigue viviendo sólo ahí.
    """
    hoy = date.today()
    vendidos = {}
    for corto, cara in caras.items():
        if (cara.get("status") or "free") != "occupied":
            continue
        fin = (cara.get("endDate") or "").strip()
        if not fin:
            continue
        try:
            if date.fromisoformat(fin[:10]) < hoy:
                continue  # vencido: es historia, no desfase
        except ValueError:
            continue
        vendidos[corto] = cara
    return vendidos


def auditar(db, solo_sede: str | None = None) -> int:
    hoy = date.today()
    planos = {
        (s.sede or "").strip().upper(): json.loads(s.fixtures_json or "[]")
        for s in db.query(LayoutSnapshot).all()
    }

    # Contratos que la base considera vivos: corriendo, o firmados y por
    # arrancar. Un vencido no es desfase — es historia.
    vivos = (
        db.query(SpaceLease, Space)
        .join(Space, Space.id == SpaceLease.space_id)
        .filter(SpaceLease.is_active.is_(True), SpaceLease.end_date >= hoy)
        .all()
    )
    por_sede: dict[str, list] = defaultdict(list)
    for lease, space in vivos:
        por_sede[(space.sede or "").strip().upper()].append((lease, space))

    sedes = sorted(set(planos) | set(por_sede))
    if solo_sede:
        objetivo = solo_sede.strip().upper()
        sedes = [s for s in sedes if s == objetivo]
        if not sedes:
            print(f"No hay ninguna sede «{solo_sede}».")
            return 0

    total = 0
    for sede in sedes:
        fixtures = planos.get(sede)
        contratos = por_sede.get(sede, [])

        if fixtures is None:
            if contratos:
                print(f"\n■ {sede} — sin plano guardado, y la base tiene "
                      f"{len(contratos)} contrato(s) vivo(s).")
                total += len(contratos)
            continue

        caras = caras_del_plano(fixtures)
        fantasmas = []
        for lease, space in contratos:
            code = (space.code or "").strip().upper()
            corto = code[len(sede) + 1:] if code.startswith(f"{sede}-") else code
            if corto not in caras:
                fantasmas.append((corto, lease, "el plano no lo ofrece"))
            elif ((caras[corto].get("status") or "free") != "occupied"):
                # El plano lo ofrece pero lo pinta libre: la pantalla dice
                # «vendé esto» y el servidor lo va a rechazar.
                fantasmas.append((corto, lease, "el plano lo pinta LIBRE"))

        # ── La dirección contraria: contratos que sólo tiene el PLANO ──────
        con_fila = set()
        for _lease, space in contratos:
            code = (space.code or "").strip().upper()
            con_fila.add(code[len(sede) + 1:] if code.startswith(f"{sede}-") else code)
        solo_plano = [
            (corto, cara) for corto, cara in contratos_del_plano(caras).items()
            if corto not in con_fila
        ]

        if not fantasmas and not solo_plano:
            print(f"\n■ {sede} — {len(caras)} espacios, {len(contratos)} "
                  f"contrato(s) vivo(s), sin desfase ✓")
            continue

        print(f"\n■ {sede}")
        if fantasmas:
            print(f"  {len(fantasmas)} que la BASE tiene vendidos y el plano no:")
            for corto, lease, motivo in sorted(fantasmas, key=lambda x: x[0]):
                prov = lease.supplier.name if lease.supplier else "—"
                print(f"    {corto:<14} {lease.start_date} → {lease.end_date}  "
                      f"{prov:<26} ({motivo})")
        if solo_plano:
            print(f"  {len(solo_plano)} que el PLANO tiene vendidos y la base no"
                  f"  ← estos NO están en ninguna tabla:")
            for corto, cara in sorted(solo_plano, key=lambda x: x[0]):
                print(f"    {corto:<14} {cara.get('startDate') or '—'} → "
                      f"{cara.get('endDate') or '—'}  "
                      f"{(cara.get('supplierName') or '—'):<26} (sólo en el JSON)")
        total += len(fantasmas) + len(solo_plano)

    print("\n" + "─" * 72)
    if total == 0:
        print("Sin desfase: todo lo que la base tiene vendido, el plano lo muestra.")
    else:
        print(
            f"{total} espacio(s) con desfase.\n\n"
            "Cada uno se resuelve desde la pantalla: Sede → Supervisar, abrir la\n"
            "ficha del espacio. Cuando la base tiene un contrato que el plano no\n"
            "muestra, la ficha lo NOMBRA y ofrece cancelarlo.\n\n"
            "Antes de cancelar: un contrato es plata y un acuerdo con un proveedor.\n"
            "Si el contrato es real y el que está mal es el plano, lo que hay que\n"
            "corregir es el plano.\n\n"
            "Los «sólo en el JSON» son distintos y más delicados: no están en\n"
            "ninguna tabla, así que no salen en ningún reporte, no generan aviso de\n"
            "vencimiento y no existen para nada que consulte la base. Si algún día\n"
            "la base pasa a ser la única verdad, ésos son los que se pierden."
        )
    return total


if __name__ == "__main__":
    db = SessionLocal()
    try:
        auditar(db, sys.argv[1] if len(sys.argv) > 1 else None)
    finally:
        db.close()
