# Generadores y verificadores de las maquetas

Nada de esto corre en producción: son las herramientas con las que se armó y se
revisó `docs/maquetas/`. Quedan versionadas porque una vez se perdieron.

| Archivo | Qué hace |
|---|---|
| `riel.py` | Genera el SVG de «Cuándo se libera cada espacio» en su forma elegida (A·4). Escribe `libera.svg` junto al script; el resultado se pega dentro de `<div class="graf">` en la maqueta. Su docstring lleva las cuatro decisiones que conviene no deshacer |
| `ver.mjs` | Captura la maqueta, mide alto y desborde horizontal, y reporta errores de página y recursos que no cargaron |
| `recorte.mjs` | Marca los elementos que se salen de su panel (ignora el interior de los SVG) |
| `solape.mjs` | Cruza todos los `<text>` de un SVG entre sí y contra el viewBox: choques y desbordes |
| `opciones.py` + `opciones.css` | Generan `opciones-libera.html`: las cinco formas candidatas para «cuándo se libera cada espacio», cada una dentro de la caja real de 1024×274 |
| `variantes.py` + `variantes.css` | Generan `variantes-a.html`: cuatro maneras de hacer legible la escalera (opción A) sin cambiarle la forma. La A·4 la toma de `riel.py`, así que no hay dos copias que se desincronicen |
| `rotulos.mjs` | Revisa los rótulos del plano isométrico: que el texto entre en su plaquita y que no se pisen entre sí |
| `tamanos.mjs` | Lista los tamaños de letra tal como se renderizan, incluido lo que va dentro de un SVG (se escala con el viewBox). Sirve para no dejar entrar un octavo tamaño |
| `medir.mjs` · `huecos.mjs` | Miden los paneles y el aire muerto, para saber dónde sobra espacio |
| `supervisar.py` + `sistema.css` + `plano.svg` | Generan `elegida-supervisar.html`. `sistema.css` es la hoja de estilos de Vender extraída, más lo propio de Supervisar; `plano.svg` es el isométrico sacado de la maqueta de Vender, para no mantener dos copias |
| `pantalla.mjs` + `sede-demo.mjs` | Miran las pantallas YA CONSTRUIDAS, sin backend, para poder compararlas contra las maquetas de al lado. Sirven `frontend/dist` y contestan `/api/*` con una sede sintética que lleva los ocho contratos reales de NAVE. Lo que no está en el mapa de rutas contesta **404** y no `[]`, que es lo que hace que un componente tome su camino de error en vez de recibir algo que parece un dato — así encontró el primer bicho. En modo `trabajador` replica lo que el servidor le borra a un mercaderista y verifica que no le quede un solo peso en pantalla. En `multi` y `guardar` afirma sobre el contrato multiespacio: que el total sea la suma prorrateada, que el plano marque todos los elegidos, y que al guardar salga **un solo pedido** al servidor con un proveedor y un periodo |
| `paleta.py` | Genera `paleta-plano.html`: los cuatro colores del mapa dibujados como los dibuja el sistema, antes y después, y las mismas dos filas pasadas por una simulación de deuteranopía |
| `vista.mjs` | Captura una página larga cualquiera de estas y reporta errores |
| `cuanto.mjs` | Compara el alto del contenido contra el de su caja, panel por panel. Es lo que dice cuánto hay que crecer o achicar en vez de tantear |
| `ver-largo.mjs` | Igual que los tres anteriores juntos, pero sobre una página larga de varios paneles (la de opciones) |

```bash
cd docs/maquetas/generadores
npm install                         # sólo la primera vez (trae Playwright)
python3 riel.py                     # regenera libera.svg
node ver.mjs      elegida-vender.html   # deja el .png junto a la maqueta
node recorte.mjs  elegida-vender.html
node solape.mjs   elegida-vender.html
node rotulos.mjs  elegida-vender.html
node tamanos.mjs  elegida-vender.html

cd ../../../frontend && npm run build && cd -
node pantalla.mjs                   # admin: Vender y Supervisar
node pantalla.mjs trabajador        # rol mercaderista, y la regla de la plata
node pantalla.mjs ficha             # Vender con un espacio elegido
node pantalla.mjs multi             # un contrato sobre dos espacios
node pantalla.mjs codigos           # el contrato armado desde la lista de precios
node pantalla.mjs guardar           # el mismo, guardado de punta a punta

python3 opciones.py                      # regenera la página de opciones
node ver-largo.mjs opciones-libera.html  # captura y revisa los 5 paneles

python3 variantes.py                     # regenera las variantes de la A
node ver-largo.mjs variantes-a.html
```

Los `.mjs` lanzan el Chromium del contenedor
(`/opt/pw-browsers/chromium`, con `--use-gl=swiftshader`). En otra máquina hay
que ajustar `executablePath` y correr `npx playwright install chromium`.

`node_modules/` y el `libera.svg` intermedio están ignorados.
