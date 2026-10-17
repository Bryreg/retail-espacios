"""Qué códigos de hoy se leerían como una participación de cara.

    cd backend && python scripts/buscar_codigos_pc.py            # todas las sedes
    cd backend && python scripts/buscar_codigos_pc.py NAVE

**Sólo lee.** No escribe una fila ni manda un correo. Usa el mismo
``DATABASE_URL`` que la aplicación, así que contra producción hay que correrlo
donde esa variable esté puesta (la consola del servicio en Render) o contra
una base restaurada de la copia de seguridad (``scripts/restaurar_copia.py``).

── Por qué existe (riesgo R1 del diseño de participaciones) ─────────────────

Con las participaciones de cara, ``PC`` pasa a ser un token del catálogo:
``NAVE-GON-01-PC3`` es la participación 3 de la cara ``NAVE-GON-01``. Un mueble
que HOY se llame ``…-PC<n>`` (o una fila de ``spaces`` con un código así) se
leería desde ese día como una participación de otro mueble: su contrato
contaría como «lease de participación sin término», que ocupa la cara entera
de ese otro mueble, y la planilla y el contrato suelto lo rechazarían.

Desde el despliegue, ``nombres_reservados_nuevos`` impide crear un nombre así,
pero uno viejo se sigue guardando. Esto lista los viejos para renombrarlos
ANTES (la renumeración del plano lo hace sin perder nada) y lo que ya está en
la base:

· muebles de los planos cuyo código termina en ``-PC1`` … ``-PC99``;
· filas de ``spaces`` con un código así que NO son una participación creada
  por la aplicación (las que tienen su término en ``participaciones``), con
  cuántos contratos vivos cuelgan de cada una.

Las archivadas (``…-PC3#12``) se cuentan aparte: son historia, pero sus
números también los mira la numeración de las participaciones.

Sale con 0 si no encontró nada y con 1 si encontró algo, para poder usarlo de
compuerta antes de desplegar.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def _es_codigo_pc(codigo: str) -> bool:
    """¿El código (sin el sufijo ``#id`` del archivo) se lee como una
    participación de cara? La misma regla que la aplicación (``partir_codigo``
    con ``PC`` como token: ``PC1``…``PC99``)."""
    from app.services.partes import es_participacion, partir_codigo

    bruto = (codigo or "").strip().upper().split("#", 1)[0]
    return bool(bruto) and es_participacion(partir_codigo(bruto).parte)


def buscar(db, solo_sede: str | None = None) -> dict:
    """Lo que hay, sin imprimir nada (lo usan las pruebas):
    ``{"muebles": [(sede, código, rótulo)], "espacios": [(código, sede,
    contratos vivos)], "archivados": [código]}``."""
    from sqlalchemy import inspect

    from app.fechas import hoy
    from app.models.models import LayoutSnapshot, Space, SpaceLease

    objetivo = (solo_sede or "").strip().upper()
    muebles = []
    for snap in db.query(LayoutSnapshot).order_by(LayoutSnapshot.sede).all():
        sede = (snap.sede or "").strip().upper()
        if objetivo and sede != objetivo:
            continue
        try:
            fixtures = json.loads(snap.fixtures_json or "[]")
        except (ValueError, TypeError):
            continue
        if not isinstance(fixtures, list):
            continue
        for f in fixtures:
            if isinstance(f, dict) and _es_codigo_pc(str(f.get("code") or "")):
                muebles.append((sede, str(f.get("code")).strip().upper(), str(f.get("label") or "")))

    # Las filas que la aplicación creó como participación tienen su término.
    # La tabla puede no existir todavía (una base de antes del despliegue).
    legitimas: set[int] = set()
    if inspect(db.get_bind()).has_table("participaciones"):
        from app.models.participaciones import Participacion

        legitimas = {sid for (sid,) in db.query(Participacion.space_id).distinct()}

    dia = hoy()
    espacios, archivados = [], []
    for space in db.query(Space).order_by(Space.code).all():
        if not _es_codigo_pc(space.code) or space.id in legitimas:
            continue
        sede = (space.sede or "").strip().upper()
        if objetivo and sede != objetivo and not (space.code or "").upper().startswith(f"{objetivo}-"):
            continue
        if "#" in (space.code or ""):
            archivados.append(space.code)
            continue
        vivos = (db.query(SpaceLease)
                 .filter(SpaceLease.space_id == space.id, SpaceLease.is_active.is_(True),
                         SpaceLease.end_date >= dia)
                 .count())
        espacios.append((space.code, sede, vivos))
    return {"muebles": muebles, "espacios": espacios, "archivados": archivados}


def informar(hallado: dict) -> int:
    """Imprime lo hallado y devuelve cuántas cosas hay que mirar."""
    muebles, espacios, archivados = hallado["muebles"], hallado["espacios"], hallado["archivados"]
    if muebles:
        print(f"Muebles del plano con un código que se lee como participación ({len(muebles)}):")
        for sede, codigo, rotulo in muebles:
            print(f"  {sede:<16} {codigo:<20} {rotulo}")
        print("  → Renombralos antes de desplegar (el plano 2D → «Renumerar», o a mano en el editor).\n")
    if espacios:
        print(f"Espacios con un código que se lee como participación y no lo es ({len(espacios)}):")
        for codigo, sede, vivos in espacios:
            print(f"  {codigo:<28} {sede or '—':<16} {vivos} contrato(s) vivo(s)")
        print("  → Su contrato contaría como la cara entera de otro mueble: renombrá el mueble\n"
              "    (la renumeración muda el espacio con él) o cerrá el contrato a mano.\n")
    if archivados:
        print(f"Espacios archivados con un código así ({len(archivados)}): son historia; sólo se cuentan.")
        for codigo in archivados:
            print(f"  {codigo}")
        print()
    total = len(muebles) + len(espacios)
    if total == 0:
        print("Ningún mueble ni espacio vivo se lee como una participación de cara: se puede desplegar.")
    return total


def main(argv: list[str]) -> int:
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        return informar(buscar(db, argv[1] if len(argv) > 1 else None))
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(1 if main(sys.argv) else 0)
