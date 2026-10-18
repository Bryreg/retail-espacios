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
from app.fechas import hoy as hoy_en_colombia  # noqa: E402
from app.models.models import LayoutSnapshot, Space, SpaceLease  # noqa: E402
from app.services.layout_lookup import (  # noqa: E402
    caras_de, caras_por_participacion, es_comercializable, ofrece, sin_prefijo_de_sede,
)
from app.services.partes import codigo_de_parte, partes_de, termina_reservado  # noqa: E402


def caras_del_plano(fixtures: list[dict]) -> dict[str, dict]:
    """Los códigos CORTOS que el plano ofrece hoy, con lo que dice de cada uno.

    Una góndola doble son dos espacios: ``GON-60`` y ``GON-60-B`` (``caras_de``,
    la misma regla que la aplicación). Un mueble que no se alquila NO está acá:
    sale de la venta, y ése es justamente uno de los casos que hay que
    encontrar. Se pregunta con ``es_comercializable``, como ``espacios_ofrecidos``
    y la pantalla: primero el TIPO (la caja, la columna y el servicio al cliente
    nunca se alquilan, aunque un plano viejo no tenga la bandera) y después la
    bandera. Mirando sólo la bandera, una caja de un plano viejo contaba como
    espacio ofrecido y su contrato no salía acá aunque la pantalla sí lo diera
    por «Contrato sin mueble».

    Y las partes que el plano pone a la venta (vender por partes: la puerta 2
    de una nevera que se vende por puertas, ``NEV-03-PU2``), sin contrato en
    el JSON: el plano nunca guardó contratos de partes. Las PIEZAS de lo que no
    se vende entero (la bahía de impulso de una caja, ``CAJ-04-BI1``; el forro
    de una columna, ``COL-07-FO``) también: la caja no se ofrece, sus bahías sí.

    Las participaciones de una cara que se vende por participación
    (``GON-01-PC3``) no están acá —sus números no tienen tope—: las cuenta
    ``participaciones_del_plano`` y las decide ``ofrecido``.
    """
    caras: dict[str, dict] = {}
    for f in fixtures:
        code = (f.get("code") or "").strip().upper()
        if not code:
            continue
        comercializable = es_comercializable(f)
        if comercializable:
            caras[code] = f
            if caras_de(f) == 2:
                caras[f"{code}-B"] = f.get("faceB") or {}
        for cara, parte in partes_de(f, caras_de(f), comercializable):
            caras[codigo_de_parte(code, cara, parte)] = {}
    return caras


def participaciones_del_plano(fixtures: list[dict], sede: str) -> set[str]:
    """Los códigos CORTOS de las caras que el plano vende por participación
    (``GON-01``, ``GON-01-B``): una participación de una de ellas
    (``GON-01-PC3``) tiene mueble. La misma regla que la aplicación
    (``caras_por_participacion``)."""
    return {sin_prefijo_de_sede(c, sede) for c in caras_por_participacion(fixtures, sede)}


def ofrecido(caras: dict[str, dict], caras_pc: set[str], corto: str) -> bool:
    """¿El plano muestra este código corto? Lo de ``caras_del_plano`` o una
    participación de una cara que se vende por participación (``ofrece`` de
    la aplicación, con códigos cortos)."""
    return ofrece(set(caras), caras_pc, corto)


def nombres_que_parecen_partes(fixtures: list[dict]) -> list[str]:
    """Los muebles cuyo código termina como el de una parte o de la cara B
    (``GON-01-TR2``, ``CAJ-04-FO``, ``GON-01-B``). Desde vender por partes no
    se puede renombrar uno así, pero un plano de antes puede tenerlo: su código
    se leería como una parte de otro mueble. Se cuentan para mirarlos."""
    return sorted({
        (f.get("code") or "").strip().upper() for f in fixtures
        if isinstance(f, dict) and termina_reservado(f.get("code") or "")
    })


def contratos_del_plano(caras: dict[str, dict]) -> dict[str, dict]:
    """Los espacios que el PLANO da por vendidos hoy, con fecha de fin vigente.

    Es la dirección contraria, y la que más pesa para decidir arquitectura: un
    contrato que vive SÓLO en el JSON del layout no está en ninguna tabla. Si
    algún día la base pasa a ser la única verdad, ése es el que se pierde.

    Existe porque existió: el panel del plano 2D tuvo campos de contrato
    editables que escribían el layout sin tocar la base —se quitaron justamente
    por esto—, y cualquier contrato cargado así sigue viviendo sólo ahí.
    """
    hoy = hoy_en_colombia()  # el día de Colombia, como la app (app/fechas.py)
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
    hoy = hoy_en_colombia()  # el día de Colombia, como la app (app/fechas.py)
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
        caras_pc = participaciones_del_plano(fixtures, sede)
        raros = nombres_que_parecen_partes(fixtures)
        if raros:
            print(f"\n■ {sede} — {len(raros)} mueble(s) con un código que se lee como una "
                  f"parte: {', '.join(raros)}. Conviene renombrarlos.")
        fantasmas = []
        for lease, space in contratos:
            code = (space.code or "").strip().upper()
            corto = code[len(sede) + 1:] if code.startswith(f"{sede}-") else code
            if not ofrecido(caras, caras_pc, corto):
                fantasmas.append((corto, lease, "el plano no lo ofrece"))
            elif corto in caras and "status" in caras[corto] and caras[corto].get("status") != "occupied":
                # El plano lo ofrece y lo pinta LIBRE: la pantalla dice «vendé
                # esto» y el servidor lo va a rechazar.
                #
                # Sólo cuenta si el plano OPINA. Desde que lo comercial es de la
                # base, el layout no guarda `status` y no opinar es lo correcto:
                # tomar la ausencia por «libre» marcaría como desfasado todo lo
                # vendido de todas las sedes. Esta rama queda para los planos
                # viejos, guardados cuando el JSON todavía llevaba el contrato.
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
