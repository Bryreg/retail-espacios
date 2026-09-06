# Opción B — «Góndola» (cartel de supermercado)

Prototipo: `index.html` (autocontenido, se abre con doble clic; sin fuentes ni recursos externos, sin librerías).

---

## El concepto en 10 líneas

1. **La página es una tienda y se recorre como una tienda.** Cada sección es un *pasillo* numerado (01 → 06) con su **cabecera de góndola**: una banda de color plano, pegajosa (`sticky`), que queda colgando sobre el pasillo mientras lo leés, igual que el cartel que cuelga del techo en un supermercado.
2. **El lenguaje visual es señalética de retail, no software.** Tipografía condensada enorme en versales, bloques de color plano y saturado, bordes gruesos de 3–5 px, sombras duras sin desenfoque, cero esquinas redondeadas, cero degradados.
3. **La paleta de marca es la de un cartel de oferta**: amarillo, negro y hueso, con rojo y azul como colores de pasillo. Los colores del producto (verde libre / naranja se libera / rojo tomado / gris resto) quedan **reservados** para el plano y las etiquetas de estado: nunca decoran.
4. **El titular enseña el código de color.** El H1 es el copy literal, pero cada tramo va sobre su bloque: `libre` en verde, `quién lo ocupa` en rojo, `a cuánto` en negro, `hasta cuándo` en naranja. En un segundo ya aprendiste la leyenda sin haberla leído.
5. **El plano isométrico es el protagonista y es de verdad**: SVG dibujado a mano, 16 muebles alquilables sobre ~25 de contexto gris, dos sedes (CENTRO y PALMAS), rueda/botones para zoom, arrastre, pinch, ficha al pasar o tocar, teclado, y un botón **«Ver en 3D»** que levanta la tienda en volumen con una interpolación de 380 ms.
6. **Los precios son titulares.** `$ 1.500.000 × 61 días = $ 3.050.000`, `−17 % vs referencia`, `$ 6.000.000 en juego`: la plata se compone como en una etiqueta de precio, no como texto corrido.
7. **Las etiquetas apuntan hacia abajo.** El gancho de cada sección es un *colgante* recortado en pentágono invertido (`clip-path`), colgado de un hilo, con una pregunta y un chevrón que rebota. Es literalmente un cartel que señala el pasillo siguiente.
8. **Arriba corre el «recorrido de la tienda»**: una barra que se llena con el scroll y ocho paradas que se encienden al entrar en cada pasillo. Es el contador que se completa; da la sensación de estar avanzando por la sala hasta la **caja** (el CTA final).
9. **Colombiano sin folclore**: el amarillo y el rojo salen de la señalética de oferta y de la tarifa, no de la bandera; el vocabulario es el del oficio (canon, sede, punta de góndola, mercaderista, cuenta de cobro).
10. **Todo el copy es el literal aprobado, en el mismo orden.** Lo único que cambia es la puesta en escena.

---

## Por qué engancha (y por qué no aburre a mitad de página)

- **Nunca hay dos pantallas seguidas del mismo color.** El ritmo es amarillo → blanco/negro → amarillo → claro → azul → negro → amarillo → rojo → negro. Cada scroll cambia el fondo entero: se siente que pasaste a otro pasillo.
- **Cada sección cierra con una pregunta que la siguiente contesta.** «Ese plano ya es la mitad del producto» → «Seis cosas. ¿Pero quién las toca?» → «¿Cuánto tarda en estar andando?» → «Un sistema te muestra lo que pasó» → «Alguien mira tus números. ¿Dónde quedan?» → «Bien. ¿Y cuánto cuesta?» → «Última góndola: la caja». El colgante es un botón: quien no quiere leer, salta.
- **Hay tres cosas que se mueven solas y ninguna es decorativa**: el plano (se toca), la ocupación (23 celdas que se llenan hasta `35 %` cuando la sección entra en pantalla) y el mini-plano del paso 3 (un mueble que cambia de color = «vendiste tocando el mapa»). Todas se apagan con `prefers-reduced-motion`.
- **El plano de arriba promete y el «Ver en 3D» cumple.** Es el momento en el que el gerente entiende que esto no es un mockup: la tienda se levanta.
- **Las cabeceras `sticky` sostienen el contexto.** Nunca perdés de vista en qué pasillo estás ni cuántos faltan («PASILLO 03 DE 06»).

---

## Tokens (tres capas, en `:root` del prototipo)

**Capa 1 · primitivos**

| Token | Claro | Uso |
|---|---|---|
| `--p-amarillo` | `#FFD100` | color de marca / cartel |
| `--p-negro` | `#0E0E0D` | tinta, bordes, sombras duras |
| `--p-hueso` | `#FFFCF2` | papel sobre color |
| `--p-rojo` | `#D8232A` | pasillo rojo · estado **tomado** |
| `--p-azul` | `#1B3FD8` | pasillo de asesoría |
| `--p-verde` | `#0B7A3E` | estado **libre** |
| `--p-naranja` | `#E06A00` | estado **se libera** |
| `--p-gris` | `#B5B1A6` | resto de la sala |

**Capa 2 · semánticos** (cambian con el tema)

`--papel` `--papel-2` `--papel-3` · `--tinta` `--tinta-2` · `--borde` `--borde-suave` · `--sombra-dura` · `--libre` `--libre-cara` · `--libera` `--libera-cara` · `--tomado` `--tomado-cara` · `--resto` · `--piso` · `--sel-anillo`

Oscuro: `--papel #0C0C0B`, `--tinta #FBF7EC`, y los estados suben de luminosidad (`--libre #2FBE72`, `--libera #FF8A1F`, `--tomado #F2545B`) para pasar 3:1 contra el fondo oscuro.

**Fijos** (no cambian con el tema, porque viven *dentro* de un bloque de color): `--fijo-negro` `--fijo-hueso` `--fijo-amarillo` `--fijo-rojo` `--fijo-azul`. Regla: cualquier texto sobre un bloque plano usa un token fijo, nunca `--tinta`.

**Hero** (capa de componente): `--h-bg` `--h-fg` `--h-lin` `--h-inv` `--h-som`. En claro el hero es amarillo con tinta negra; en oscuro es negro con tinta hueso. Toda la sección (antetítulo, marcas del H1, botones, borde y sombra de la caja del plano, hilo y flecha del gancho) lee de esos cinco tokens, así que el modo oscuro del hero es un bloque de 3 líneas.

**Tipografía** — solo stacks de sistema, sin `@font-face`:

- `--f-cartel`: `"Avenir Next Condensed", "Roboto Condensed", "Archivo Narrow", "Liberation Sans Narrow", "DejaVu Sans Condensed", "Arial Narrow", "Franklin Gothic Demi Cond", Impact, Haettenschweiler, system-ui` — con `font-weight:800`, `text-transform:uppercase`, `font-stretch:condensed`. Cae de pie en macOS/iOS, Windows, Android y Linux; si no hay nada condensado, Impact mantiene el registro de afiche.
- `--f-texto`: stack de sistema (`-apple-system` / `Segoe UI` / `Roboto` / …).
- `--f-mono`: `ui-monospace, SFMono-Regular, Menlo, Consolas, …` para códigos (`GON-04·A`) y precios, con `font-variant-numeric: tabular-nums`.

**Escala** — `--t-mega: clamp(2rem, 5.6vw, 4.6rem)` (H1 y cierre) · `--t-xl` (cabeceras) · `--t-l` · `--t-m`. Espaciado `--e-1…--e-6` (0.5 → 5 rem). Bordes `--bw: 3px`, `--bw-g: 5px`, `--radio: 0`.

**Gráficos** (validados con el validador de la skill `dataviz`): la trinca verde/naranja/rojo es una paleta **de estado**, no categórica, y por eso lleva siempre codificación secundaria — la palabra al lado del punto (regla 7 del copy), una trama diagonal de 45° sobre las caras «se libera», y luminosidad monótona (libre > se libera > tomado) para que se lea en escala de grises. El mes sin datos de la tendencia es un hueco rayado con etiqueta «sin datos», nunca una barra de altura cero.

---

## Qué tener en cuenta al construirlo en React

**El plano**

- El prototipo pinta el SVG con concatenación de strings porque es un archivo suelto. En React esto es un componente `<PlanoIsometrico datos={...} />` que devuelve JSX: una `<g>` por mueble con tres `<polygon>` (`top` / `izq` / `der`). La proyección es `P(x,y) = [(x−y)·32, (x+y)·16]` y la altura resta `h·17·mul` en Y. El orden de pintado es *painter's algorithm*: ordenar por `(x + w/2) + (y + d/2)`.
- **La vista y el estado seleccionado tienen que vivir en `useRef`, no en `useState`**: la vista (`{s, tx, ty}`) se escribe en cada `pointermove` y en cada tick de rueda; si eso dispara un render por evento, el arrastre se traba. Solo el `transform` del grupo raíz se escribe imperativamente (`ref.current.setAttribute('transform', …)`). Lo que sí es estado de React es el mueble seleccionado (la ficha).
- **`setPointerCapture` retarget­ea el `pointerup` al contenedor.** Hay que guardar el `closest('g.fx')` en el `pointerdown` y usarlo en el `pointerup`, o el clic en un mueble nunca lo selecciona. (Fue un bug real de este prototipo.)
- La rueda necesita `{ passive: false }`, así que el listener va con `addEventListener` en un `useEffect`, no como prop `onWheel`.
- Los colores se leen de las CSS variables en tiempo de pintado (`getComputedStyle(document.documentElement)`) para que el cambio de tema repinte con la paleta correcta. En React conviene pasarlos como props desde un hook de tema, o repintar cuando cambie el atributo `data-tema`.
- El «Ver en 3D» del prototipo es una **interpolación de altura**, no three.js: sube el multiplicador de altura de 1 a 2,6 en 380 ms. En la app real este botón debe cargar three.js con `React.lazy` / `import()` según la spec; el efecto del prototipo sirve como estado intermedio mientras el chunk baja (y como fallback si el dispositivo no lo soporta, con el texto de §11.4).
- La escena de ejemplo (16 muebles + contexto + pisos) es **una constante del módulo de la landing**, nunca una llamada a `/api/*`. Está tipada como `{c, t, u, s, p, n, f, sede, x, y, w, d, h, la?}`.

**Estructura y estilos**

- Las cabeceras `sticky` necesitan que `--nav-h` sea el mismo valor que la altura real de la barra; si la barra cambia de alto en algún breakpoint, hay que actualizar el token, no un `top` suelto.
- `scroll-padding-top: calc(var(--nav-h) + 8px)` en `html` es lo que hace que los anclas del pie (`#que-hace`, `#precio`, …) no queden tapados.
- **Cuidado con los nombres de clase genéricos.** `.pie` (pie del sitio) pisó `.pie` (pie de la leyenda) y dejó texto gris sobre negro. En React con CSS Modules o `data-` scopes esto no pasa, pero si se usa una hoja global hay que prefijar.
- Los revelados al scroll son un `IntersectionObserver` con `unobserve` al disparar. Un hook `useReveal()` que devuelva un `ref` y una clase alcanza. **Requisito**: si el observer no existe o falla, el contenido tiene que quedar visible — el prototipo lo resuelve con la clase `sinjs` / `js` en `<html>` puesta por un script inline de 1 línea en el `<head>`.
- El primer pintado no depende de JS: hero, titular, CTAs y toda la tipografía son HTML/CSS estáticos. El plano, los observers y los contadores arrancan en un `requestAnimationFrame` después de `load`. En la app hay que mantener esa separación (el plano no puede entrar en el bundle crítico) para el LCP < 2,5 s que pide la spec.
- `prefers-reduced-motion` apaga el rebote del gancho, el revelado, el contador (que salta a `35 %`), el mini-plano y la interpolación del 3D. Está resuelto con una sola media query más tres `if (reduce)` en el JS.

**Copy y datos**

- Todo el texto visible es el literal de `copy.md`, en el orden de la spec. Los `[COMPLETAR: …]` están puestos como texto, no como placeholders inventados.
- Los cuatro estados llevan siempre la palabra escrita, en la leyenda, en la ficha y en la tabla equivalente (`<details>` «Los mismos datos del plano, en tabla»), que es la alternativa accesible del SVG. El SVG va `aria-hidden` con `aria-describedby` a la descripción larga.
- La nota «Proveedor y valores de ejemplo» aparece solo en las fichas con contrato (tomado / se libera), como dice §11.2.
- El gráfico de tendencia usa datos inventados y lo declara en el `figcaption`; no dibuja mejora sostenida a propósito, para no insinuar una promesa de impacto (§14.22).

**Lo que este prototipo no trae y la app sí necesita**

Meta OG con imagen local 1200×630, la ruta `/login#registro` real, el `mailto:` del contacto, y las capturas de «Cómo se usa» si el dueño las quiere (acá los tres pasos funcionan sin capturas; si se agregan, van con los `alt` de §11.5 y generadas con `docs/maquetas/generadores/pantalla.mjs`, nunca contra producción).
