"""
Sacarle una foto a un mueble del catálogo 3D, desde la línea de comandos.

## Por qué existe

La mitad de los defectos de forma de este catálogo NO se ven en las pruebas ni
en el typecheck: se ven mirando el mueble. La fruta que se sale del cajón, el
arte del proveedor dibujado encima del relleno, la torre de la estiba flotando
en pisos separados — todo eso compilaba y pasaba en verde. El cliente los
encontró abriendo el editor, uno por uno, y mandando capturas.

Este script cierra ese lazo sin depender de que alguien mire: levanta el
navegador, entra a `/taller` —el banco de pruebas que dibuja cualquier mueble
del catálogo sin tener que colocarlo en una sede— y guarda el PNG.

Versiones de esto se escribieron y se perdieron tres veces, porque vivían en
`/tmp` de un contenedor que se recicla. Por eso está acá.

## Uso

    # el servidor de desarrollo tiene que estar corriendo
    cd frontend && npm run dev &

    # un mueble, con el rubro del contrato que se le pinta adentro
    python scripts/taller/mirar-mueble.py --mueble "Exhib. de Piso" --rubro Galletas

    # varios de una, y girando la cámara otro tanto
    python scripts/taller/mirar-mueble.py --mueble "Góndola doble" --mueble Batea \
        --orbita 760 --salida /tmp/fotos

`--rubro` es lo que decide QUÉ producto se dibuja adentro: sin rubro el mueble
sale vacío, que es lo que ve el editor cuando el espacio no está contratado.

## El token

El taller vive detrás del login. El script siembra la sesión en
`localStorage` con un token que se le pasa por `--token` o por la variable
`TALLER_TOKEN` — **nunca se commitea uno**: se saca de la sesión del navegador
(`localStorage['retail-auth-v1']`) o se emite con las credenciales de prueba.

## El navegador

Chromium ya viene instalado en el contenedor remoto (`/opt/pw-browsers/chromium`)
y se le pasa `--use-gl=swiftshader` porque no hay GPU. NO correr
`playwright install`.
"""

import argparse
import json
import os
import sys
from pathlib import Path

CHROMIUM = os.getenv("CHROMIUM_PATH", "/opt/pw-browsers/chromium")


def principal() -> int:
    cli = argparse.ArgumentParser(description=__doc__.split("\n")[1])
    cli.add_argument("--mueble", action="append", required=True,
                     help="Nombre del mueble tal como aparece en el selector del taller. Repetible.")
    cli.add_argument("--rubro", default="",
                     help="Rubro del contrato: decide qué producto se dibuja adentro.")
    cli.add_argument("--url", default="http://localhost:5173")
    cli.add_argument("--salida", default="/tmp", type=Path)
    cli.add_argument("--orbita", type=int, default=620,
                     help="Cuántos píxeles se arrastra la cámara en horizontal antes de la foto.")
    cli.add_argument("--token", default=os.getenv("TALLER_TOKEN", ""),
                     help="Token de sesión. También se lee de TALLER_TOKEN.")
    cli.add_argument("--cliente", default="galerias")
    args = cli.parse_args()

    if not args.token:
        print("Falta el token: --token o TALLER_TOKEN. No hay ninguno guardado en el repo "
              "a propósito.", file=sys.stderr)
        return 2

    from playwright.sync_api import sync_playwright

    sesion = {"state": {"token": args.token, "role": "admin", "cliente": args.cliente,
                        "clienteNombre": args.cliente, "email": None, "nombre": None,
                        "avisoCuenta": None, "pedirConsentimiento": False, "plataforma": False},
              "version": 0}

    args.salida.mkdir(parents=True, exist_ok=True)
    fallas: list[str] = []

    with sync_playwright() as p:
        navegador = p.chromium.launch(
            executable_path=CHROMIUM,
            args=["--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
        )
        pagina = navegador.new_page(viewport={"width": 900, "height": 700})
        # Un error de JS deja el lienzo en negro y la foto sale "bien" igual: sin
        # esto, una malla rota se ve como un mueble que no llegó a dibujarse.
        pagina.on("pageerror", lambda e: fallas.append(str(e)[:160]))

        pagina.goto(args.url + "/", wait_until="domcontentloaded")
        pagina.evaluate("s => localStorage.setItem('retail-auth-v1', s)", json.dumps(sesion))
        pagina.goto(args.url + "/taller", wait_until="networkidle")
        pagina.wait_for_timeout(4000)

        # La cámara arranca de frente y de frente casi todo parece una caja. El
        # arrastre la lleva a tres cuartos, que es desde donde se ve si el
        # producto está adentro o encima.
        pagina.mouse.move(450, 400)
        pagina.mouse.down()
        pagina.mouse.move(450 + args.orbita, 400, steps=25)
        pagina.mouse.up()
        pagina.wait_for_timeout(1200)

        if args.rubro:
            pagina.fill("input[placeholder='sin contrato']", args.rubro)
            pagina.wait_for_timeout(800)

        for nombre in args.mueble:
            pagina.select_option("select >> nth=1", label=nombre)
            pagina.wait_for_timeout(2200)
            limpio = nombre.replace("/", "_").replace(" ", "_").replace(".", "")
            destino = args.salida / f"taller_{limpio}.png"
            pagina.screenshot(path=str(destino),
                              clip={"x": 120, "y": 60, "width": 660, "height": 600})
            print(destino)

        navegador.close()

    print("errores de consola:", fallas[:3] or "ninguno")
    return 1 if fallas else 0


if __name__ == "__main__":
    raise SystemExit(principal())
