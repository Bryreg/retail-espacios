"""Volver de un respaldo de toda la plataforma (auditoría P0-3).

    # la plataforma entera, en una instancia nueva (recuperación ante desastre):
    python scripts/restaurar_plataforma.py respaldo/ --destino "$URL_NUEVA"

    # un solo supermercado, a su base de siempre en el mismo servidor:
    python scripts/restaurar_plataforma.py respaldo/ --destino "$URL" --solo recabra_olimpica --reemplazar

    # un supermercado a una base aparte, para mirarlo sin tocar el de verdad:
    python scripts/restaurar_plataforma.py respaldo/ --destino "$URL" --solo recabra_olimpica \
        --como recabra_olimpica_revision

    # sin tocar nada: qué haría
    python scripts/restaurar_plataforma.py respaldo/ --destino "$URL" --ensayo

`respaldo/` es la carpeta que deja `respaldar_plataforma.py` (los `.dump` y su
`MANIFIESTO.json`), ya descifrada: el workflow sube un `.tar.gpg`; ver
`docs/operacion.md` para descifrarlo.

`--destino` es la URL de la base que va a ser el REGISTRO (la que va a quedar en
`DATABASE_URL`). Las bases de los clientes se crean al lado, en el mismo
servidor, con su nombre de siempre (`recabra_<slug>`), igual que las crea el
alta. Si la base del registro del destino se llama distinto que la de origen
(una instancia nueva de Render elige su propio nombre), no pasa nada: al
arrancar, la app reconoce como «el de siempre» a la base de `DATABASE_URL`
(`clientes.registrar_el_de_siempre`).

**Las guardas, antes de escribir nada:**

· cada `.dump` tiene que coincidir con el sha256 del manifiesto;
· una base del destino que YA tiene tablas no se toca, salvo con
  `--reemplazar` (que borra lo que haya: `pg_restore --clean`). Ojo: si la app
  ya arrancó contra la base nueva, le creó las tablas y le sembró los pasillos
  de ejemplo; por eso se restaura ANTES de apuntar `DATABASE_URL`, o con
  `--reemplazar`;
· cada base se restaura en una sola transacción (`--single-transaction`): si
  algo falla, esa base queda como estaba.

Dice cuánto tardó cada base y el total: es el RTO del simulacro (anotarlo en
`docs/ESTADO.md`).
"""
from __future__ import annotations

import argparse
import os
import hashlib
import json
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from respaldar_plataforma import (  # noqa: E402
    NOMBRE_VALIDO, base_de_url, normalizar_url, para_libpq, sin_clave, url_de_base,
)


class ErrorDeRestauracion(Exception):
    pass


def leer_manifiesto(carpeta: Path) -> dict:
    ruta = carpeta / "MANIFIESTO.json"
    if not ruta.exists():
        raise ErrorDeRestauracion(f"No hay MANIFIESTO.json en {carpeta}: ¿es la carpeta del respaldo descifrado?")
    manifiesto = json.loads(ruta.read_text(encoding="utf-8"))
    if manifiesto.get("formato") != 1:
        raise ErrorDeRestauracion(f"Formato de respaldo desconocido: {manifiesto.get('formato')!r}")
    return manifiesto


def verificar(carpeta: Path, manifiesto: dict, elegidas: list[dict]) -> None:
    for b in elegidas:
        ruta = carpeta / b["archivo"]
        if not ruta.exists():
            raise ErrorDeRestauracion(f"Falta {b['archivo']} en {carpeta}")
        h = hashlib.sha256()
        with ruta.open("rb") as f:
            for trozo in iter(lambda: f.read(1 << 20), b""):
                h.update(trozo)
        if h.hexdigest() != b["sha256"]:
            raise ErrorDeRestauracion(f"{b['archivo']} no coincide con el manifiesto (sha256): está dañado")


def plan(manifiesto: dict, destino: str, solo: str | None = None, como: str | None = None) -> list[dict]:
    """Qué base del respaldo va a qué base del destino.

    La del registro va a la base de `destino`; cada cliente, a su nombre de
    siempre en el mismo servidor (o a `como`, con `--solo`)."""
    bases = manifiesto["bases"]
    registro_origen = manifiesto["registro"]
    registro_destino = base_de_url(destino)
    if solo:
        bases = [b for b in bases if b["base"] == solo]
        if not bases:
            raise ErrorDeRestauracion(f"El respaldo no tiene la base {solo!r}")
    elif como:
        raise ErrorDeRestauracion("--como va con --solo")
    salida = []
    for b in bases:
        if como:
            hacia = como
        elif b["base"] == registro_origen:
            hacia = registro_destino
        else:
            hacia = b["base"]
        if not NOMBRE_VALIDO.match(hacia):
            raise ErrorDeRestauracion(f"Nombre de base inválido: {hacia!r}")
        salida.append({**b, "hacia": hacia})
    # El registro primero: si falla, lo demás no tiene a quién colgarse.
    salida.sort(key=lambda b: b["origen"] != "registro")
    return salida


def _existe_y_tiene_tablas(cx, base: str, destino: str) -> tuple[bool, bool]:
    from sqlalchemy import create_engine, text
    from sqlalchemy.pool import NullPool

    existe = bool(cx.execute(text("SELECT 1 FROM pg_database WHERE datname = :n"), {"n": base}).scalar())
    if not existe:
        return False, False
    motor = create_engine(url_de_base(destino, base), poolclass=NullPool)
    try:
        with motor.connect() as c2:
            n = c2.execute(text(
                "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'"
            )).scalar()
    finally:
        motor.dispose()
    return True, bool(n)


def argumentos(argv=None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Restaura un respaldo de la plataforma (registro + clientes).")
    p.add_argument("carpeta", type=Path, help="carpeta del respaldo descifrado (con MANIFIESTO.json)")
    p.add_argument("--destino", required=True, help="URL de la base que va a ser el registro")
    p.add_argument("--solo", help="restaurar sólo esa base (p. ej. recabra_olimpica)")
    p.add_argument("--como", help="con --solo: restaurarla con otro nombre, para revisarla")
    p.add_argument("--reemplazar", action="store_true",
                   help="pisar una base del destino que ya tiene tablas (borra lo que haya)")
    p.add_argument("--ensayo", action="store_true", help="sólo verifica y dice qué haría")
    p.add_argument("--pg-restore", default=os.getenv("PG_RESTORE", "pg_restore"), help="el binario de pg_restore")
    a = p.parse_args(argv)
    a.destino = normalizar_url(a.destino)
    if not a.destino.startswith("postgresql://"):
        p.error("--destino tiene que ser una URL postgresql://")
    if a.como and not a.solo:
        p.error("--como va con --solo")
    return a


def main(argv=None) -> int:
    from sqlalchemy import create_engine, text
    from sqlalchemy.pool import NullPool

    a = argumentos(argv)
    try:
        manifiesto = leer_manifiesto(a.carpeta)
        elegidas = plan(manifiesto, a.destino, a.solo, a.como)
        verificar(a.carpeta, manifiesto, elegidas)
    except ErrorDeRestauracion as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 2

    print(f"Respaldo del {manifiesto['tomado_en']} ({manifiesto['servidor']}) → {sin_clave(a.destino)}")
    motor = create_engine(a.destino, poolclass=NullPool, isolation_level="AUTOCOMMIT")
    try:
        with motor.connect() as cx:
            pasos = []
            for b in elegidas:
                existe, con_tablas = _existe_y_tiene_tablas(cx, b["hacia"], a.destino)
                if con_tablas and not a.reemplazar:
                    print(f"ERROR: {b['hacia']} ya tiene tablas. No se toca sin --reemplazar.", file=sys.stderr)
                    return 3
                pasos.append((b, existe, con_tablas))
            for b, existe, con_tablas in pasos:
                accion = ("crear y cargar" if not existe else "pisar" if con_tablas else "cargar")
                print(f"  {b['base']} ({b['origen']}) → {b['hacia']}: {accion}")
            if a.ensayo:
                print("Ensayo: no se tocó nada.")
                return 0

            total = time.monotonic()
            for b, existe, con_tablas in pasos:
                inicio = time.monotonic()
                if not existe:
                    cx.execute(text(f'CREATE DATABASE "{b["hacia"]}"'))
                conexion, entorno = para_libpq(url_de_base(a.destino, b["hacia"]))
                orden = [a.pg_restore, "--no-owner", "--no-acl", "--exit-on-error", "--single-transaction",
                         "--dbname", conexion]
                if con_tablas:
                    orden += ["--clean", "--if-exists"]
                subprocess.run(orden + [str(a.carpeta / b["archivo"])], check=True, env=entorno)
                print(f"  {b['hacia']}: listo en {time.monotonic() - inicio:.1f} s")
            print(f"Restauradas {len(pasos)} bases en {time.monotonic() - total:.1f} s.")
            if not a.solo:
                print("Ahora: apuntá DATABASE_URL del servicio a la base del registro y redeployá;"
                      " después, /api/health/ready tiene que dar 200.")
    except subprocess.CalledProcessError as e:
        print(f"ERROR: pg_restore salió con {e.returncode}; esa base quedó como estaba.", file=sys.stderr)
        return 1
    finally:
        motor.dispose()
    return 0


if __name__ == "__main__":
    sys.exit(main())
