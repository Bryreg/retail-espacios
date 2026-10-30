"""El respaldo de TODA la plataforma: el registro y cada supermercado (auditoría P0-3).

    python scripts/respaldar_plataforma.py --url "$URL_EXTERNA" --salida respaldo/
    python scripts/respaldar_plataforma.py --url "$URL_EXTERNA" --listar   # sólo dice qué bajaría

Lo corre cada noche `.github/workflows/respaldo.yml` contra la URL EXTERNA de la
base de Render (la de «Connect → External»), y funciona en el plan gratuito: no
necesita consola, ni shell, ni nada pago. También se puede correr desde
cualquier máquina con `pg_dump` (de la misma versión mayor que el servidor, o
más nueva).

**Qué baja.** Un `pg_dump` en formato custom (`-Fc`: comprimido, y
`pg_restore` puede elegir qué restaurar) por cada base:

· la base de la URL, que es el REGISTRO —clientes, usuarios, membresías,
  suscripciones, facturas, consentimientos— y además la de GALERIAS;
· cada base que el registro nombra en `clientes.db_name` (activos y
  archivados: un archivado se puede reactivar);
· y toda base `recabra_*` que exista en el servidor aunque el registro no la
  nombre (un alta a medias, un borrado que no terminó): mejor de más.

Y un `MANIFIESTO.json`: cuándo se tomó (UTC), de qué servidor (sin clave), y por
base el slug, el tamaño, el sha256 del archivo y cuánto tardó. El RPO se lee de
ahí: lo que se pierde en el peor caso es lo que pasó desde `tomado_en`.

**No cifra ni sube**: eso lo hace el workflow (`gpg --symmetric` con la frase de
`RESPALDO_PASSPHRASE`, artefacto de 30 días y, si está configurado, un bucket
S3/R2). Este script sólo lee la base.

Para volver: `scripts/restaurar_plataforma.py` y `docs/operacion.md`.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

NOMBRE_VALIDO = re.compile(r"^[A-Za-z0-9_\-]{1,63}$")


def normalizar_url(url: str) -> str:
    """Render da `postgres://`; libpq y SQLAlchemy quieren `postgresql://`."""
    url = (url or "").strip()
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://"):]
    return url


def url_de_base(url: str, base: str) -> str:
    """La misma URL apuntando a otra base del mismo servidor (como
    `clientes.url_para`): cambia sólo el camino, los parámetros —
    `?sslmode=require`— se quedan."""
    partes = urlsplit(normalizar_url(url))
    return urlunsplit(partes._replace(path=f"/{base}"))


def base_de_url(url: str) -> str:
    return urlsplit(normalizar_url(url)).path.lstrip("/")


def sin_clave(url: str) -> str:
    """La URL para el manifiesto y el log: sin usuario ni contraseña."""
    partes = urlsplit(normalizar_url(url))
    host = partes.hostname or ""
    if partes.port:
        host += f":{partes.port}"
    return urlunsplit(partes._replace(netloc=host, query=""))


def para_libpq(url: str) -> tuple[str, dict]:
    """(la URL SIN contraseña, el entorno con `PGPASSWORD`): así la clave no
    aparece en la línea de comandos de `pg_dump`/`pg_restore` —que se ve en
    `ps` y en el log del runner—."""
    from urllib.parse import unquote

    partes = urlsplit(normalizar_url(url))
    entorno = dict(os.environ)
    if partes.password is not None:
        entorno["PGPASSWORD"] = unquote(partes.password)
        usuario = partes.username or ""
        host = partes.hostname or ""
        if ":" in host:  # IPv6
            host = f"[{host}]"
        netloc = f"{usuario}@{host}" if usuario else host
        if partes.port:
            netloc += f":{partes.port}"
        partes = partes._replace(netloc=netloc)
    return urlunsplit(partes), entorno


def bases_a_respaldar(cx, registro: str) -> list[dict]:
    """Qué bases bajar, leyendo el registro por `cx` (una conexión de
    SQLAlchemy a la base del registro). El registro va primero.

    Cada elemento: ``{"base", "slug", "activo", "origen"}``, donde ``origen`` es
    ``registro`` (la base de la URL), ``cliente`` (la nombra `clientes`) o
    ``huerfana`` (existe en el servidor, el registro no la nombra)."""
    from sqlalchemy import text

    salida = [{"base": registro, "slug": None, "activo": True, "origen": "registro"}]
    vistas = {registro}
    filas = cx.execute(text("SELECT slug, db_name, activo FROM clientes ORDER BY slug")).all()
    for slug, db_name, activo in filas:
        if db_name == registro:
            # El cliente de siempre vive en la base del registro: ya está.
            salida[0]["slug"] = slug
            continue
        if db_name in vistas or not NOMBRE_VALIDO.match(db_name or ""):
            continue
        vistas.add(db_name)
        salida.append({"base": db_name, "slug": slug, "activo": bool(activo), "origen": "cliente"})
    if cx.dialect.name == "postgresql":
        existentes = cx.execute(text(
            "SELECT datname FROM pg_database WHERE NOT datistemplate AND datname LIKE 'recabra\\_%' ORDER BY datname"
        )).scalars().all()
        for base in existentes:
            if base not in vistas and NOMBRE_VALIDO.match(base):
                vistas.add(base)
                salida.append({"base": base, "slug": None, "activo": False, "origen": "huerfana"})
    return salida


def _sha256(ruta: Path) -> str:
    h = hashlib.sha256()
    with ruta.open("rb") as f:
        for trozo in iter(lambda: f.read(1 << 20), b""):
            h.update(trozo)
    return h.hexdigest()


def volcar(url: str, base: str, destino: Path, pg_dump: str = "pg_dump") -> dict:
    """Un `pg_dump -Fc` de esa base a `destino/<base>.dump`."""
    archivo = destino / f"{base}.dump"
    inicio = time.monotonic()
    conexion, entorno = para_libpq(url_de_base(url, base))
    subprocess.run(
        [pg_dump, "--format=custom", "--no-owner", "--no-acl", "--file", str(archivo),
         "--dbname", conexion],
        check=True, env=entorno,
    )
    return {
        "archivo": archivo.name,
        "bytes": archivo.stat().st_size,
        "sha256": _sha256(archivo),
        "segundos": round(time.monotonic() - inicio, 1),
    }


def argumentos(argv=None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Respaldo de toda la plataforma (registro + clientes).")
    p.add_argument("--url", default=os.getenv("RESPALDO_DATABASE_URL", ""),
                   help="URL de la base del registro (por defecto, $RESPALDO_DATABASE_URL)")
    p.add_argument("--salida", type=Path, default=Path("respaldo"), help="carpeta donde dejar los .dump")
    p.add_argument("--listar", action="store_true", help="sólo lista las bases, no baja nada")
    p.add_argument("--pg-dump", default=os.getenv("PG_DUMP", "pg_dump"), help="el binario de pg_dump")
    a = p.parse_args(argv)
    a.url = normalizar_url(a.url)
    if not a.url.startswith("postgresql://"):
        p.error("falta --url (o RESPALDO_DATABASE_URL) con una URL postgresql://")
    return a


def main(argv=None) -> int:
    from sqlalchemy import create_engine
    from sqlalchemy.pool import NullPool

    a = argumentos(argv)
    registro = base_de_url(a.url)
    motor = create_engine(a.url, poolclass=NullPool)
    with motor.connect() as cx:
        bases = bases_a_respaldar(cx, registro)
    motor.dispose()

    if a.listar:
        for b in bases:
            print(f"{b['base']:<40} {b['origen']:<9} {b['slug'] or ''}")
        return 0

    a.salida.mkdir(parents=True, exist_ok=True)
    manifiesto = {
        "formato": 1,
        "tomado_en": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "servidor": sin_clave(a.url),
        "registro": registro,
        "bases": [],
    }
    inicio = time.monotonic()
    fallas = []
    for b in bases:
        try:
            hecho = volcar(a.url, b["base"], a.salida, a.pg_dump)
        except subprocess.CalledProcessError as e:
            # Una base que no se pudo bajar no deja sin respaldo a las demás,
            # pero el script sale con error: el workflow tiene que fallar.
            print(f"ERROR: no se pudo respaldar {b['base']} (pg_dump salió con {e.returncode})", file=sys.stderr)
            fallas.append(b["base"])
            continue
        manifiesto["bases"].append({**b, **hecho})
        print(f"{b['base']}: {hecho['bytes'] // 1024} KiB en {hecho['segundos']} s")
    manifiesto["segundos"] = round(time.monotonic() - inicio, 1)
    manifiesto["fallas"] = fallas
    (a.salida / "MANIFIESTO.json").write_text(json.dumps(manifiesto, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"{len(manifiesto['bases'])} bases en {manifiesto['segundos']} s; fallaron {len(fallas)}")
    return 1 if fallas else 0


if __name__ == "__main__":
    sys.exit(main())
