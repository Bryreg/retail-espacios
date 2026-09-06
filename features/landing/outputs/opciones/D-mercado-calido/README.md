# Opción D — «El mercado»

## El concepto, en 10 líneas

1. La landing no es un folleto de funcionalidades: es **un día en la tienda**, de 7:40 a. m. a 8:00 p. m.
2. Cada sección lleva una **hora** («9:15 a. m. · entran los primeros proveedores») y la página se va aclarando y oscureciendo con esa hora: crema de mañana → ámbar de tarde → un **atardecer literal** (franja `.horizonte` con el sol bajando) → azul profundo de noche en el cierre y el pie.
3. El lenguaje visual es de **mercado de barrio**: toldo de festón naranja y crema arriba de todo, formas redondeadas, mucho aire, tipografía amable y grande.
4. Todas las ilustraciones son **SVG vectorial propio, dibujado acá**, con un mismo estilo: relleno plano, contorno oscuro grueso, esquinas redondeadas, sobre medallón crema.
5. Las tres personas del producto están dibujadas (gerente con el portátil, trabajador de piso con chaleco naranja y celular, mercaderista con su caja de fruta), no son íconos genéricos.
6. El **plano isométrico de MercaFresco** es el protagonista del hero: dos sedes, 16 muebles alquilables rodeados de gris, con acercar/alejar (rueda, pellizco, botones), arrastre, ficha al tocar y una vista «Ver en 3D» que baja la cámara y estira las alturas.
7. Cada sección termina en un **gancho** narrativo: una pregunta con el reloj adentro y una flecha que baja. Nunca se cierra una sección sin abrir la siguiente.
8. El copy es **literal y en el mismo orden** que `outputs/copy.md`. Lo único agregado son los ganchos, las horas y los rótulos de las ilustraciones.
9. Cero fotos de stock, cero testimonios, cero cifras de impacto: la única cifra grande de la página es `35 %`, que sale de `§12` del copy.
10. Cálida y confiable, hecha para un gerente que hoy lleva esto en un chat de WhatsApp: la página tiene que sonar a alguien que conoce su tienda, no a un proveedor de software.

## Por qué engancha

- **El día avanza.** Bajar por la página es avanzar de hora. Cuando llegás a «5:45 p. m. · cae la tarde» ya querés ver cómo cierra. Es la única mecánica de la página que no se puede resumir en una captura, y es gratis en términos de peso.
- **El plano se toca antes de leer.** El hero abre con la ficha de `PUN-02` ya desplegada (el mueble que se libera el 26): el gesto se entiende sin descubrirlo. Después se puede arrastrar, acercar y mirar en 3D. Es lo primero que un gerente va a hacer, y es lo que la competencia no puede mostrar.
- **Los ganchos son preguntas, no flechas decorativas.** «Son las 7:40 y en ese plano hay 7 muebles verdes. Nadie los está vendiendo todavía» abre una duda que solo se cierra en la sección de abajo.
- **Un contador que se completa.** En «Lo que hace», seis pistas se van encendiendo (`1 de 6` → `6 de 6 · las seis`) a medida que los bloques entran en pantalla. Da la sensación de estar terminando algo.
- **Las dos caras de la góndola se ven.** `GON-04·A` (rojo) y `GON-04·B` (verde) son dos barras de la misma góndola con estados distintos, y el cuerpo gris del mueble es más bajo a propósito para que las dos se vean. Ese detalle enseña el modelo de datos sin una sola línea de texto.
- **El atardecer.** La franja `.horizonte` con el sol bajando entre «Cuánto cuesta» y «Empezá por una sede» es el pago del recorrido: la página termina de noche, con el botón encendido.

## Tokens

Arquitectura de tres capas (primitivo → semántico → componente), toda en variables CSS sobre `:root`, con el tema claro completo en `:root` desnudo y el oscuro redefinido dos veces (`@media (prefers-color-scheme: dark)` guardado con `:root:not([data-theme="claro"])` y `:root[data-theme="oscuro"]`), para que el interruptor gane en los dos sentidos.

### Primitivos

| Familia | Valores |
|---|---|
| Mandarina | `--p-man-50 #FFF3E5` · `100 #FCE2C6` · `300 #F5A960` · `500 #E8792B` · `600 #CF6318` · `700 #A44B0F` · `900 #2B1508` |
| Verde hoja | `--p-hoj-100 #DCEFE0` · `300 #7FC392` · `500 #2F7D4F` · `600 #24643E` · `700 #1B4C2F` |
| Crema / estraza | `--p-cre-50 #FFFBF2` · `75 #FFF6E6` · `100 #FBF3E4` · `200 #F5EAD6` · `300 #E7D6BB` · `400 #D6C2A2` |
| Azul profundo | `--p-azu-400 #2C5B7E` · `500 #1B4160` · `700 #14324B` · `900 #0C2033` |
| Tinta | `--p-tin-900 #2A2118` · `700 #4A3D2E` · `500 #6E5E4A` |
| Rojo tomate | `--p-roj-400 #E4695E` · `500 #D2453B` · `600 #B3372E` |
| Gris cartón | `--p-gri-300 #C9C2B6` · `400 #B9B2A6` · `500 #9A9184` · `600 #6E6559` |
| Nocturnos | `--p-noc-900 #16130F` · `800 #1C1814` · `700 #221D18` · `600 #2A241E` · `500 #3A322A` |

### Semánticos

`--fondo` `--fondo-alto` `--papel` `--papel-2` · `--texto` `--texto-2` `--texto-3` · `--borde` `--borde-fuerte` · `--marca` `--marca-tinta` `--sobre-marca` · `--azul` `--azul-claro` · estados: `--est-libre` / `--est-libera` / `--est-tomado` / `--est-resto`, cada uno con su `-txt` (versión con contraste ≥ 4,5:1 para texto) y su `-suave` (fondo de pastilla). Los estados **nunca** se dicen solo con color: la palabra va siempre al lado del punto, tanto en la leyenda como en la ficha (regla heredada del producto).

Botón primario: fondo `--marca #E8792B` con texto `--sobre-marca #2B1508` (5,5:1) y sombra sólida de 4 px en `--marca-tinta`; se hunde 2 px al presionar. El blanco sobre mandarina **no** pasa contraste, por eso el texto del CTA es marrón muy oscuro.

### Escalas

- Espacio: `--s-1 4` `--s-2 8` `--s-3 12` `--s-4 16` `--s-5 24` `--s-6 32` `--s-7 48` `--s-8 64` `--s-9 88` `--s-10 120`
- Radios: `--r-sm 10` `--r-md 16` `--r-lg 24` `--r-xl 34` `--r-pill 999`
- Tipografía (sin recursos externos, stacks de sistema):
  - `--f-titulo`: `ui-rounded, "SF Pro Rounded", "Segoe UI Variable Display", "Segoe UI", system-ui, -apple-system, "Trebuchet MS", …` — en Apple da SF Rounded, que es exactamente el tono amable buscado; en Windows cae en Segoe UI.
  - `--f-texto`: `system-ui, -apple-system, "Segoe UI", Roboto, …`
  - `--f-codigo`: `ui-monospace, "SF Mono", "Cascadia Mono", "Segoe UI Mono", Menlo, Consolas, monospace` — códigos de mueble, plata, horas y rótulos.
  - Cuerpo 17 px / 1.62. Títulos con `clamp()` y `text-wrap:balance`.
- Movimiento: `--transicion 220ms cubic-bezier(.2,.7,.3,1)`. Entradas al scroll de 520 ms con desfase de 55 ms. Todo anulado bajo `prefers-reduced-motion`.

### Ilustración

`--il-piel #EBBD92` · `--il-piel-2 #D19A6C` · `--il-pelo #3B2B1E` · `--il-azul #1B4160` · `--il-naranja #E8792B` · `--il-verde #2F7D4F` · `--il-linea #2A2118` · `--il-papel #FFF6E6` · `--il-carton #D9BE95`.

En el prototipo estos valores están **escritos en hexadecimal dentro del sprite**, no como `var()`: las ilustraciones viven siempre sobre un medallón crema en los dos temas, así que no necesitan cambiar, y los atributos de presentación de SVG con `var()` tienen soporte irregular. En React conviene mantener esa decisión.

## Qué tener en cuenta al construirlo en React

**Rutas y funcional.** Nada de la estética toca lo funcional: los CTA van a `/login#registro` y `/login`, los legales a `/politica-datos` y `/politica-datos#derechos`, y las anclas son las de `§11.6` (`#que-hace` `#para-quien` `#como-se-usa` `#asesoria` `#confianza` `#precio`). El pie ya las usa.

**El plano.**
- Es un componente propio (`PlanoEjemplo.tsx`), sin librerías: proyección isométrica a mano (`sx=(x−y)·K`, `sy=(x+y)·K·KY − z·KZ`), algoritmo del pintor ordenando por `x+w/2 + y+d/2`, y tres polígonos por mueble (techo, cara izquierda, cara derecha) con `vector-effect="non-scaling-stroke"` para que el trazo no engorde al acercar.
- Los datos (`MUEBLES`, `CONTEXTO`, `PISOS`) son constantes sembradas; **`MercaFresco` está en una sola constante** para que el dueño lo cambie en un lugar. Cero llamadas a `/api/*`.
- El repintado por tema no reconstruye el DOM: `pintar()` solo cambia `fill`/`stroke`. En React esto es natural si los colores salen de un `useMemo` sobre el tema; conviene **no** meter el plano en un re-render por cada movimiento de cámara: la cámara es un `transform` sobre un `<g>` que se puede escribir por `ref` (`setAttribute`) en vez de por estado, o el arrastre va a ir a tirones.
- `getScreenCTM()` del grupo de cámara es lo que posiciona la ficha; hay que recalcular en `resize` y al terminar cada gesto.
- La vista 3D del prototipo **no es three.js**: es la misma escena con otro ángulo de cámara (`KY 0.5→0.33`, `KZ 17→27`) interpolado en 520 ms. Si en la app se quiere el 3D de verdad, el botón es el mismo y three.js entra por carga diferida; si no, esta versión ya cumple sin sumar bundle. Decisión del dueño.
- Accesibilidad ya resuelta: `role="application"` con `aria-label` y `aria-describedby`, cada mueble alquilable es un `<g role="button" tabindex="0">` con nombre accesible, flechas/`+`/`−`/`Enter`/`Esc` en el contenedor, y la **tabla equivalente** dentro de un `<details>` con los seis encabezados de `§11.5`.

**Rendimiento (LCP < 2,5 s).** El hero es HTML y CSS puros: título, subtítulos y CTA no dependen de JS ni llevan animación de entrada. El plano se construye recién en el segundo `requestAnimationFrame` después del primer pintado, dentro de un contenedor con `aspect-ratio` reservado (no hay salto de maqueta). En React: el bloque de texto del hero se renderiza en el servidor o en el primer paint y el plano entra con `useEffect` + `startTransition`, nunca en el mismo commit.

**Temas.** El interruptor escribe `data-theme="claro"|"oscuro"` en `<html>` y guarda en `localStorage` dentro de `try/catch`; sin preferencia guardada manda `prefers-color-scheme`. Hay que replicar el patrón de las tres definiciones o el modo oscuro se rompe al alternar desde «sistema».

**Trampas que ya están resueltas y conviene no deshacer.**
- `--azul` se invierte en oscuro (pasa a azul claro): por eso las superficies azules fijas (el cierre honesto de asesoría, el globo de los pasos, el pie) usan `--p-azu-700` directo, no `--azul`.
- El atardecer es una **franja propia** (`.horizonte`) entre precio y cierre. Si se pone como degradado del propio `#cierre`, el texto claro de la sección cae sobre fondo claro.
- `overflow-x:hidden` en `body` convierte al body en contenedor de scroll y rompe la barra pegajosa: va `overflow-x:clip` en `html`.
- La tabla equivalente lleva `min-width` y su contenedor `overflow-x:auto`, o desborda en 360 px.
- El SVG del plano tiene `touch-action:none` para que el arrastre de un dedo funcione; es deliberado y coincide con el microcopy («Deslizá para moverte»).

**CSP de Fase 3.** No hay ninguna fuente, script, imagen ni hoja externa: todo es SVG en línea, CSS en línea y JS vanilla. La única `data:` URI es el festón del toldo (un SVG de 300 bytes). Si se conserva el stack de sistema no hace falta tocar la CSP ni empaquetar fuentes.

**Lo que falta cerrar antes de publicar.** Los `[COMPLETAR: …]` están marcados en la página con una pastilla rayada naranja (`.completar`) para que se vean de lejos: precio, unidad del precio, correo de contacto, correo de protección de datos, razón social, NIT y ciudad. El `mailto:` del botón «Hablemos» queda vacío a propósito.
