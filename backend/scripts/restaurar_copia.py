"""Cargar una copia de seguridad en la base de un supermercado SIN datos.

    cd backend
    python scripts/restaurar_copia.py copia.zip
    python scripts/restaurar_copia.py copia.zip --cliente olimpica

Se corre donde estén `DATABASE_URL` y `JWT_SECRET` del servicio: la consola del
servicio en Render ya las tiene. La clave no se usa para nada acá, pero la app
no arranca contra Postgres sin ella.

La copia es el ZIP que baja el dueño desde Configuración → «Copia de seguridad».
Sin `--cliente` se carga en la base de `DATABASE_URL` —la del supermercado de
siempre—; con `--cliente`, en la base de ese supermercado, que tiene que estar
dado de alta en el registro.

**Se niega si la base ya tiene datos de negocio** —un espacio, un contrato, un
plano—: volver es para una base nueva, no para mezclar dos historias. La única
excepción es la configuración, con la que arranca toda base: la de la copia pisa
a la que hay.

Lo que la copia no trae: las claves compartidas (ya no abren nada) y quién tiene
acceso, que vive en el registro. La lista viene en `personas.json` adentro del
ZIP; a cada uno se lo vuelve a invitar desde Configuración → Usuarios.

**Ojo con la base de siempre:** al arrancar, la app le siembra pasillos de
ejemplo si no tiene ningún espacio, y con eso deja de estar vacía. En una base
nueva, cargar la copia ANTES del primer arranque —o vaciar esos pasillos a mano—.

**Con `LIMPIAR_FOTOS_VENCIDAS` apagado** (el valor por defecto): con el borrado
prendido, la primera pasada del mantenimiento al levantar la app sobre la copia
borraría las fotos de montaje y las planometrías de los contratos ya
terminados, que puede ser justo lo que se vino a mirar. Para saber qué borraría,
`python scripts/fotos_vencidas.py` (ensaya por defecto).

La lógica no vive acá: está en `app/services/copia.py` (`restaurar`), probada de
ida y vuelta en `tests/test_copia_de_seguridad.py`.
"""
import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("copia", type=Path, help="el ZIP de la copia de seguridad")
    ap.add_argument("--cliente", help="el código del supermercado destino (sin esto, el de siempre)")
    args = ap.parse_args()

    if not args.copia.is_file():
        sys.exit(f"No existe {args.copia}.")
    for falta in ("DATABASE_URL", "JWT_SECRET"):
        if not os.getenv(falta):
            sys.exit(f"Falta {falta}. Corré esto desde la consola del servicio en Render, que ya la tiene.")

    from app.services.copia import ErrorDeCopia, restaurar

    if args.cliente:
        from app.clientes import buscar, motor_de

        try:
            cliente = buscar(args.cliente)
        except Exception as e:  # noqa: BLE001
            sys.exit(f"No se pudo leer la lista de supermercados en DATABASE_URL: {type(e).__name__}. "
                     "Con --cliente, DATABASE_URL es la de la instancia, no la del supermercado.")
        if cliente is None:
            sys.exit(f"No hay un supermercado «{args.cliente}» en el registro. Se da de alta primero.")
        motor = motor_de(cliente)
    else:
        from app.database import engine as motor

    try:
        cuantas = restaurar(args.copia, motor)
    except ErrorDeCopia as e:
        sys.exit(f"No se cargó nada: {e}")

    for tabla, n in cuantas.items():
        print(f"  {tabla:<24} {n:>6} fila(s)")
    print(f"\nListo: {sum(cuantas.values())} filas. Los navegadores que tenían planos")
    print("guardados los descartan y toman los de la copia.")
