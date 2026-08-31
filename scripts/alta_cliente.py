#!/usr/bin/env python3
"""Da de alta un supermercado nuevo: su base, sus tablas y sus contraseñas.

    cd backend
    DATABASE_URL="<la de producción>" python ../scripts/alta_cliente.py olimpica "Olímpica"

Se hace desde acá y no desde una pantalla a propósito. Crear un cliente no es
una operación de todos los días, y una pantalla para hacerlo pediría inventar un
rol por encima del administrador —alguien que pueda tocar a TODOS los
supermercados—, que es justo la clase de llave que no conviene que ande dando
vueltas en un navegador.

Las contraseñas se generan acá y se imprimen UNA vez. No se guardan en ningún
lado en claro: adentro de la base queda el hash Argon2, igual que las de todos.
"""
import os
import secrets
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))


def main() -> int:
    if len(sys.argv) < 3:
        print(__doc__)
        print("Faltan argumentos: <codigo> <nombre>", file=sys.stderr)
        return 2

    slug, nombre = sys.argv[1].strip().lower(), sys.argv[2].strip()

    if not os.getenv("DATABASE_URL"):
        print(
            "Falta DATABASE_URL. Es la de la instancia de Postgres donde ya viven\n"
            "los demás clientes: la base nueva se crea adentro de ésa.",
            file=sys.stderr,
        )
        return 2
    if not os.getenv("JWT_SECRET"):
        print("Falta JWT_SECRET (la misma del servicio).", file=sys.stderr)
        return 2

    # Las lee `bootstrap_claves` al armar la base nueva. Se generan acá para
    # poder mostrarlas: si las inventara el arranque, sólo quedarían en el log.
    clave_admin = secrets.token_urlsafe(12)
    clave_worker = secrets.token_urlsafe(12)
    os.environ["ADMIN_PASSWORD"] = clave_admin
    os.environ["WORKER_PASSWORD"] = clave_worker

    from app.clientes import ErrorDeAlta, crear_cliente

    try:
        cliente = crear_cliente(slug, nombre)
    except ErrorDeAlta as e:
        print(f"No se pudo: {e}", file=sys.stderr)
        return 1

    print()
    print(f"  Listo: {cliente.nombre}  ({cliente.slug})")
    print(f"  Base:  {cliente.db_name}")
    print()
    print("  Contraseñas iniciales — anotalas, no vuelven a aparecer:")
    print(f"    administrador : {clave_admin}")
    print(f"    trabajador    : {clave_worker}")
    print()
    print("  Que las cambien desde Configuración apenas entren.")
    print("  El selector de supermercado aparece solo en la pantalla de ingreso.")
    print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
