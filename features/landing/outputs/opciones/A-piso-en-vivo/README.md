# A · El piso en vivo

**Prototipo:** `index.html` — autocontenido, se abre con doble clic. Sin librerías, sin fuentes ni
recursos externos, sin una sola llamada de red.

---

## El concepto en 10 líneas

1. La página **no tiene secciones con ilustraciones: tiene una sola sala, y la sala es la página.**
2. El plano isométrico de MercaFresco queda pegado (`sticky`) a la pantalla desde el hero hasta el CTA final.
3. Al bajar, **la cámara se mueve sobre ese mismo plano**: se acerca a una punta de góndola, viaja de CENTRO a PALMAS, se aleja hasta ver las dos sedes.
4. Cada sección tiene su encuadre. El texto entra en una tarjeta a la derecha (abajo en móvil) y el plano ya está a mitad de camino hacia el encuadre siguiente: **nunca queda quieto en el borde de una sección.**
5. El plano no ilustra: **demuestra**. En «el contrato se arma sobre el mueble» aparece la ficha sobre `PUN-01`; en «la temporada» los 16 muebles se repintan mientras scrolleás las nueve temporadas; en «los avisos» salen los tres correos sobre la línea 30/15/6; en «el montaje» aparece el celular con la foto; en «cómo se arranca» la sala se vacía, se vuelve a dibujar en gris y se pinta; en «asesoría» los muebles libres se etiquetan con la plata en juego; en «tus datos» las dos sedes se separan de la base de otro cliente.
6. Fondo oscuro profundo (sala a media luz), tipografía grande y contundente, y **el único color saturado fuera del plano es el amarillo de etiqueta de precio**: es la plata y es el botón.
7. Los cuatro estados del producto (verde / naranja / rojo / gris) son los únicos colores del piso, y el gris es mayoría: 33 muebles de contexto contra 16 alquilables. Lo que se vende se ve escaso.
8. El H1 está pintado con esos mismos cuatro colores («libre», «lo ocupa», «a cuánto», «hasta cuándo»), así que la leyenda ya está enseñada antes de leerla.
9. El plano es de verdad interactivo desde el primer segundo: rueda, arrastre, pinza, `+ / − / Centrar`, `Ver en 3D`, ficha al tocar, teclado completo y tabla equivalente.
10. Claro y oscuro con un toggle; `prefers-reduced-motion` apaga la cámara y deja la página quieta y legible, sin perder nada.

## Por qué engancha

- **Continuidad.** El motivo del rechazo anterior fue «no me mantiene enganchado a lo que sigue». Acá el objeto que mirás no cambia nunca; lo que cambia es tu punto de vista. Cortar el scroll es abandonar un plano a medio girar, y eso cuesta.
- **Cada sección termina con un gancho concreto:** un contador que se completa (16 espacios · 7/3/6 en la leyenda), un viaje `CENTRO → PALMAS`, la sala que se vacía antes del paso 1, las etiquetas de plata que se encienden sobre los libres, las dos sedes que se separan de la base de otro cliente. Ninguno agrega copy: son números verificados, movimiento y chrome (`01/09`, chevron).
- **Prueba, no promesa.** El copy prohíbe cifras de impacto. El sustituto es enseñar el producto funcionando: el gerente toca `GON-04·A` y `GON-04·B` y entiende en dos segundos que una góndola son dos espacios. Eso convence más que un «+30 %» que además no se puede escribir.
- **Reconocimiento.** El plano es el idioma de la aplicación de adentro, con los prefijos reales (`PUN`, `GON`, `EXP`, `CRS`, `BEB`, `FRU`, `CAJ`, `SAC`, `COL`) y los mismos textos de estado. Quien lo mira ya sabe leer la pantalla que va a comprar.

## Tokens

Tres capas: **primitivo → semántico → componente** (todos son variables CSS en `:root`, y el modo claro
sólo redefine la capa semántica).

**Primitivos**

| Grupo | Valores |
|---|---|
| Neutros fríos | `--n-1000 #04070A` … `--n-000 #FFFFFF` (12 pasos) |
| Verde (libre) | `--g-500 #3FD98A` · `--g-600 #22A96A` · `--g-700 #166F47` |
| Naranja (se libera) | `--o-500 #FF9A46` · `--o-600 #DD6F26` · `--o-700 #93481A` |
| Rojo (tomado) | `--r-500 #FF6B67` · `--r-600 #D8413D` · `--r-700 #8E2724` |
| Señal (etiqueta de precio) | `--y-400 #FFE067` · `--y-500 #FFD028` · `--y-600 #E0B000` |

**Semánticos (oscuro / claro)**

`--bg` `#04070A` / `#EFF1ED` · `--surface` vidrio 74 % / 82 % · `--ink` `#EDF3F2` / `#0A1014` ·
`--ink-2` `#9DAEB6` / `#4A5B65` · `--ink-3` `#6C7E88` / `#5A6B74` · `--line` blanco 11 % / tinta 14 % ·
`--floor` `#0A1015` / `#F7F8F5` · `--signal` `#FFD028` / `#F2B300` ·
`--signal-ink` `#FFD028` / `#8A6100` (**la señal como texto o trazo usa siempre este**, el amarillo brillante
no llega a 4,5:1 sobre fondo claro) · `--on-signal` casi negro en los dos modos.

**Componente:** cada cara del mueble toma su color de `--f-<estado>-top | -r | -l`, así que **repintar el
plano entero es cambiar una clase** (`.fx.st-libre`, `.st-libera`, `.st-tomado`, sin clase = resto de la
sala). Eso es lo que hace baratos el modo claro, el repintado por temporada y el «paso 2 en gris».

**Escalas.** Espaciado 4/8: `--s1 4` → `--s9 96`. Tipografía fluida con `clamp()`:
`--t-3xs 11` `--t-2xs 12` `--t-xs 13` `--t-sm 14,5` `--t-base 16–17,5` `--t-md 17,5–20`
`--t-lg 20–24` `--t-xl 24–34` `--t-2xl 29–52` `--t-3xl 36–84`. Radios `3 / 6 / 12`.
Movimiento: `--dur-1 140ms` (feedback), `--dur-2 260ms` (estado), `--dur-3 520ms` (escena),
`--dur-4 900ms` (entrada de tarjeta), easing único `cubic-bezier(.22,.68,.24,1)`.

**Tipografía sin descargas.** Display y texto en stacks de sistema
(`Helvetica Neue / Segoe UI Variable / -apple-system / Roboto`), con peso 800, `letter-spacing` de −0,022 a
−0,035 em y `line-height` 1,02 en los titulares: la contundencia viene del peso y del tracking, no de una
fuente comprada. **Los códigos, la plata y las fechas van en monoespaciada de sistema** con
`font-variant-numeric: tabular-nums` — es lo que le da el aire de etiqueta de góndola y evita saltos en las
columnas de cifras.

## Qué hay que tener en cuenta para construirlo en React

1. **Un componente por capa, no uno por sección.** `<Escenario>` (SVG del plano + cámara + capas de efecto),
   `<Guion>` (los 24 paneles de texto) y `<Hud>` (rótulo, leyenda, controles, ficha). El acoplamiento entre
   los tres es un solo dato: el `id` de escena activa + su progreso 0→1.
2. **La cámara es estado derivado del scroll, no del render de React.** En el prototipo se escribe un único
   `transform` sobre un `<g id="cam">` dentro de un `requestAnimationFrame` con interpolación (lerp 0,14).
   En React: `useRef` sobre el nodo y escritura imperativa; **no** poner la posición de cámara en `useState`
   (serían 60 renders por segundo del árbol entero).
3. **El plano se genera por datos.** `FIXTURES` es un array de 49 objetos (`x, y, sx, sy, h, estado`,
   más los campos de la ficha). Cambiar `MercaFresco` por otro nombre, o los proveedores, es tocar una
   constante — como pide `copy.md` §13. Conviene que viva en `frontend/src/landing/planoEjemplo.ts` y que
   un test verifique lo que verifica el prototipo: 16 alquilables, 10 en CENTRO y 6 en PALMAS, 7 libres /
   3 se liberan / 6 tomados, y contexto gris en mayoría.
4. **`Ver en 3D` acá está resuelto sin librería**: se reconstruye la misma geometría con otro ángulo
   isométrico (`IH 15 → 8,6`) y los muebles 1,9× más altos. En la app este botón es el punto exacto donde
   entra el `three.js` con `React.lazy` + `Suspense`; el estado vacío `Cargando la vista 3D…` y los tres
   textos de error del §11.4 ya están previstos. **La vista 2D no debe depender de que el 3D cargue.**
5. **Scroll y gestos, sin secuestrar la página.** La regla que sostiene todo: el plano sólo captura la rueda
   en «modo libre» (que se enciende al arrastrar o al tocar `+`/`−`, y se apaga con `Centrar`) o con
   `Ctrl/⌘`; en táctil, un dedo siempre hace scroll de la página y el pellizco funciona porque el SVG usa
   `touch-action: pan-y`. Si el frontend cambia esto, en móvil se traba la página.
6. **`prefers-reduced-motion` no es apagar transiciones: es otra puesta en escena.** Con la preferencia
   activa la cámara deja de seguir al scroll (el plano queda en su encuadre general y sigue siendo
   explorable con los botones), las capas de efecto no se muestran y las tarjetas aparecen sin desplazarse.
   Hay que probarlo antes de dar por terminada la sección.
7. **Rendimiento y LCP.** El LCP es el H1, que es HTML estático dentro de la primera tarjeta; el SVG del
   plano (167 polígonos) se construye después del primer pintado. En React eso significa **no** renderizar
   el plano en el primer commit: `useEffect` + `requestIdleCallback`/`rAF`. Nada de animar `width`,
   `height`, `top` o `left`: sólo `transform` y `opacity`.
8. **Accesibilidad que ya está resuelta y no se puede perder al portar:** cada mueble alquilable es un
   `role="button"` con `tabIndex` y `aria-label` (`«PUN-01, Punta de góndola, Tomado, sede CENTRO»`);
   flechas mueven y `+`/`−` acercan con el plano enfocado; `Esc` cierra la ficha; el estado **siempre lleva
   la palabra al lado del punto de color**; y la tabla equivalente del §11.5 está en un `<details>` al final.
   Los botones `+`, `−`, `Centrar` son además la alternativa a arrastrar que exige la WCAG 2.2.
9. **Contraste:** revisar `--signal-ink` si se retoca la paleta. El amarillo de marca funciona como fondo de
   botón en los dos modos, pero como **texto** en modo claro hay que usar la variante oscura. Es el único
   punto donde el diseño se rompe fácil.
10. **Copy.** El texto del prototipo es literal de `copy.md` y en su orden. Lo único que se agregó son
    números de capítulo (`01/09`), contadores con cifras verificadas y un chevron: **si un texto no entra en
    el espacio, se pide el recorte en `copy.md`, no se reescribe en el `.tsx`.** Los `[COMPLETAR: …]` están
    marcados con un estilo propio (`.slot`) justamente para que se vean y no se publiquen por accidente.

### Detalles menores para no repetir el trabajo

- Las capas de efecto centradas se posicionan sobre el **centro del plano** (`--ax`, que se recalcula en
  `measure()`), no sobre el centro del viewport: si no, en escritorio chocan con la columna de texto.
- La ficha se posiciona a partir del `getBoundingClientRect()` del grupo SVG del mueble, y se reubica en cada
  frame mientras está abierta.
- El HUD se oculta solo cuando el pie entra en pantalla (si no, la leyenda flota sobre el footer).
- El repintado por temporada usa un hash determinista sobre el código del mueble: el mismo mueble muestra
  siempre el mismo estado en la misma temporada, y al salir de la escena se restauran los estados reales de
  `copy.md` §13. No es dato inventado presentado como real — es el plano de ejemplo mostrando el mecanismo.
- La tendencia de la sección de asesoría es una sparkline mínima (una serie, un solo color, punto final
  etiquetado, sin grilla ni degradados) y **el mes sin datos es un hueco punteado, no un cero**, tal como lo
  exige el copy.
