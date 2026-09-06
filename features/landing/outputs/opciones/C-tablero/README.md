# C-tablero — «El tablero encendido»

## El concepto en 10 líneas

1. La landing **no habla del software: es el software**. Toda la página está montada como un tablero de control oscuro, con superficies de vidrio sobre una retícula técnica y una barra de estado pegada arriba que lleva la ocupación del plano de ejemplo mientras leés.
2. El héroe es el **plano isométrico interactivo**, dentro de un marco de dispositivo con controles reales (Acercar, Alejar, Centrar, Ver en 3D) y su leyenda: lo que el visitante toca en la landing es exactamente lo que va a tocar adentro.
3. El gesto de firma es **la transformación del plano**: «Ver en 3D» / «Volver al plano» interpola en 760 ms entre la planta plana y la isometría extruida. No son dos dibujos, es una sola proyección con un parámetro `k` animado.
4. Las secciones son **paneles del tablero que se encienden al bajar**: la ocupación sube en un contador, el total del plazo se acumula hasta `$ 3.050.000`, la lista de recomendaciones entra ordenada por lo que hay en juego, los tres correos aparecen escalonados, el plano de los pasos se dibuja en gris y después se pinta.
5. La grilla es **bento asimétrico** (6 columnas, tarjetas de 2/4/6): rompe el ritmo de «seis cajas iguales» que hacía genérica la versión anterior.
6. Cada bloque de «Lo que hace» trae una **microdemo real**, no un ícono decorativo: una ficha de contrato que suma, una tarifa con su desvío `−17 %`, un selector de temporada que repinta un plano chico, un teléfono que exige foto.
7. Cada sección termina en un **gancho**: un conector con el número de la sección siguiente y su **título literal** —nada de texto inventado— más un haz que baja y una flecha que se mueve al pasar el mouse.
8. La tipografía es **técnica pero cálida**: pila sans del sistema para la prosa, pila mono del sistema con cifras tabulares para códigos, plata y rótulos. Cero fuentes externas, cero archivos, cero red.
9. El color de marca es **azul señal**, elegido a propósito para **no chocar** con verde/naranja/rojo/gris, que quedan reservados al estado del mueble. Y el estado nunca va solo: siempre lleva la palabra al lado.
10. Claro y oscuro son **dos diseños**, no una inversión: cada modo tiene su propia paleta de estado validada y sus propios multiplicadores de luz para las caras del isométrico.

## Por qué engancha

- **Hay algo vivo antes de leer.** El plano ya está pintado, con la ficha de `PUN-02` abierta, la barra de estado contando y el pulso verde del rótulo. La primera reacción no es «leo», es «toco».
- **Cada tarjeta anticipa la siguiente.** El conector no dice «seguí bajando»: dice `03 → Cómo se arranca`. El dueño ya sabe qué viene y quiere confirmarlo.
- **Todo lo que se muestra es retail.** Ninguna ilustración abstracta de SaaS: góndolas, puntas, neveras, cabeceras de caja, un teléfono de mercaderista, un correo de constancia. El vocabulario visual es el del glosario del copy.
- **Los premios están repartidos a lo largo del scroll.** El morfeo 2D↔3D arriba, el contador del total en el bloque 2, el repintado por temporada en el 3, la foto del montaje en el 6, el conmutador de los tres permisos en la sección 02, la cadena de estados de la cuenta en «Cuánto cuesta». No hay tramo muerto.
- **La honestidad es parte del diseño.** Las tres tarjetas con `[COMPLETAR: …]` se ven como ranuras vacías del tablero, no como errores; el mes sin datos es un hueco punteado; el dinero del mercaderista aparece tachado en la propia página.

## Tokens

Arquitectura de tres capas (primitivo → semántico → componente), toda en `:root` y en `[data-theme]`.

**Primitivos**

| Grupo | Valores |
|---|---|
| Tinta | `--p-ink-1000 #05070B` · `950 #080B11` · `900 #0C1017` · `850 #11161F` · `800 #161C27` · `750 #1C2331` · `700 #242D3D` · `600 #334054` · `500 #4A5A73` · `400 #6B7C97` · `300 #93A3BB` · `200 #BFCADA` · `100 #DDE4EE` · `050 #EFF2F7` |
| Papel | `--p-paper-000 #FFFFFF` · `050 #FAFAFB` · `100 #F3F4F7` · `200 #E8EAF0` · `300 #D8DCE6` |
| Señal (marca) | `--p-signal-300 #A6C8FF` · `400 #7FAEFF` · `500 #4E8DF5` · `600 #2E6BD1` · `700 #1E4FA3` · `--p-violet-400 #A08CFF` · `--p-violet-600 #6A50D6` |
| Estado oscuro | `--p-libre-d #00BE86` · `--p-libera-d #F5A524` · `--p-tomado-d #F4544E` · `--p-resto-d #5B6980` |
| Estado claro | `--p-libre-l #00805A` · `--p-libera-l #CE8A0A` · `--p-tomado-l #D8342E` · `--p-resto-l #9AA3B2` |

**Semánticos** (los mismos nombres en los dos temas): `--bg`, `--bg-veil`, `--grid-line`, `--panel`, `--panel-solid`, `--panel-2`, `--panel-hi`, `--brd`, `--brd-strong`, `--fg`, `--fg-2`, `--fg-3`, `--acc`, `--acc-2`, `--acc-ink`, `--acc-soft`, `--ring`, `--st-libre|libera|tomado|resto` (+ `-soft`), `--floor`, `--floor-edge`, `--face-top|left|right`, `--sh-1|2|3`, `--glow`, `--blur`.

**Escalas**

| Escala | Valores |
|---|---|
| Espacio | 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96 · 128 (`--s-1 … --s-10`) |
| Radio | 4 · 8 · 12 · 18 · 26 · full |
| Texto | 11 · 12 · 13 · 15 · 17 · 20 · clamp(22–28) · clamp(26–38) · clamp(32–54) · clamp(38–72) |
| Duración | 120 · 200 · 320 · 520 · 800 ms |
| Curvas | `--ease-out cubic-bezier(.16,.84,.44,1)` · `--ease-in-out cubic-bezier(.65,.05,.36,1)` |

**Tipografía**

```
--font-ui:   ui-sans-serif, system-ui, -apple-system, "Segoe UI Variable Text",
             "Segoe UI", Roboto, "Helvetica Neue", "Noto Sans", Arial, sans-serif
--font-mono: ui-monospace, "SF Mono", SFMono-Regular, "Cascadia Mono",
             "JetBrains Mono", Menlo, Consolas, "Liberation Mono", monospace
```

Sans para prosa; mono con `font-variant-numeric: tabular-nums` para códigos, plata, fechas, rótulos de sección y etiquetas de panel. La marca `RECABRA` va en mono con `letter-spacing: .34em` (versales con tracking positivo).

**Por qué la paleta de estado quedó así.** Los cuatro colores se pasaron por el validador de `dataviz` (`scripts/validate_palette.js`) contra la superficie de cada modo:

- oscuro `#00BE86 · #F5A524 · #F4544E` → CVD protan ΔE 9.3, visión normal ΔE 18.7, contraste ≥ 3:1 (**pasa**);
- claro `#00805A · #CE8A0A · #D8342E` → CVD deutan ΔE 10.4, visión normal ΔE 17.9 (**pasa**); el naranja queda en 2.82:1 contra el papel, que el validador marca como WARN con «relieve obligatorio». El relieve está: **la palabra siempre acompaña al punto** y existe la tabla equivalente del plano. Es la regla del propio producto («los estados se escriben, no solo se pintan»).
- La banda de luminosidad falla a propósito en oscuro: los estados son marcas luminosas sobre un tablero negro, no series de un gráfico sobre superficie clara.

**Por qué no hay gráfico de tendencia.** `dataviz` prohíbe graficar lo que no se puede sostener, y el copy (§12) prohíbe escribir números que no estén verificados. Un gráfico de ocupación mes a mes obligaría a inventar doce valores. La sección muestra en cambio **la tira de meses con un hueco punteado en abril**, que es exactamente lo que el copy quiere enseñar: «un mes sin datos aparece como un hueco, no como un cero». El único dato graficado en la página es la barra apilada del reparto del plano (7 libres / 3 se liberan / 6 tomados), que sí sale de los datos sembrados en §13, con separadores de 2 px y etiquetas directas.

## El plano: cómo está hecho

- **Datos sembrados** en la constante `PIEZAS` (45 piezas: 16 alquilables + 29 de contexto gris, o sea el gris es mayoría, como pide §13.1). Dos sedes, `CENTRO` y `PALMAS`, en una sola escena; el encuadre inicial enmarca CENTRO y deja PALMAS asomando: eso mismo invita a arrastrar.
- **Proyección** con un parámetro `k` que interpola entre planta (`X=x, Y=y`) e isometría (`X=(x−y)·cos30, Y=(x+y)·sin30 − z·0.95`). Con `k=0` las caras laterales tienen área cero y desaparecen solas: no hay dos dibujos, hay uno.
- **Orden de pintor** por `(x+w/2)+(y+d/2)`. Las dos caras de `GON-04` son dos piezas independientes a los lados del núcleo gris, con altura mayor: se ven las dos y se entiende que `·A` puede estar tomada y `·B` libre.
- **Sombreado** sin filtros: los tres tonos de cada cara se calculan en JS mezclando el color de estado con el fondo según `--face-left` / `--face-right`, y se recalculan al cambiar de tema.
- **Zoom / arrastre**: transformación `translate(T) scale(S)` sobre un `<g>`, con `S = base·usuario`. La rueda hace zoom **sólo con el plano activo** (después de un clic, un toque o el foco); antes de eso la página scrollea normal y nunca se traga el scroll. Pellizco con dos punteros, botones `+ / − / Centrar`, teclado con flechas, `+`, `−`, `Enter` y `Esc`.
- **Accesible**: cada mueble alquilable es un `<g role="button" tabindex="0">` con nombre accesible; el contenedor tiene `aria-label` y `aria-describedby` con la descripción larga; hay tabla equivalente en un `<details>`; y el arrastre tiene alternativa por teclado y por botones (WCAG 2.2 `dragging-alternative`).
- **Rendimiento**: el plano se construye en el primer `requestAnimationFrame` después de `DOMContentLoaded`, así el H1 y los CTA pintan antes. Si la construcción falla, aparece el texto de error del copy (§11.4) con su botón «Reintentar».

## Qué tener en cuenta al construirlo en React

1. **Componentes.** `RailEstado`, `HeroPlano` (contenedor + `PlanoIso` + `FichaMueble` + `LeyendaEstados` + `TablaEquivalente`), `BentoQueHace`, `PerfilesTabs`, `PasosPipeline`, `Asesoria`, `Confianza`, `Precio`, `CierreCTA`, `PieLegal`, `GanchoSeccion`.
2. **El plano no se reconstruye en cada render.** `PIEZAS` es un módulo constante fuera del componente. La geometría (`points`) se escribe imperativamente sobre refs dentro del bucle de animación: si `k`, `pan` y `scale` viven en `useState`, cada frame dispara un render de 180 polígonos y se cae a 20 fps. Estado de interacción en `useRef` + escritura directa al DOM; sólo el mueble activo (para la ficha) va a `useState`.
3. **La ficha sí es React.** Un solo `useState` con el código del mueble activo. La posición se calcula en un `useLayoutEffect` a partir de la transformación vigente.
4. **Tokens.** Todo el bloque `:root` / `[data-theme]` entra como hoja de tokens de la landing. Choca con los `--con-*` de la app: la decisión de si la landing vive con su propia paleta o si la app adopta esta la toma el dueño; mientras tanto, prefijar (`--lp-*`) y montar la landing en su propio ámbito.
5. **Tema.** El script inline que fija `data-theme` antes del primer pintado tiene que sobrevivir al build (va en `index.html`, no en un componente), o hay flash de tema. El toggle escribe `localStorage` y vuelve a leer la paleta para repintar el isométrico.
6. **Fuentes.** Esta opción **no usa `fonts.googleapis.com`**: si se elige, se puede sacar el `<link>` de fuentes de `frontend/index.html` y ajustar la CSP de Fase 3 en el mismo PR. Si el dueño prefiere conservar Chivo + Archivo Narrow, hay que empaquetarlas locales; las pilas de sistema están pensadas para que no haga falta.
7. **`Ver en 3D`.** Acá el 3D es la misma isometría extruida, sin three.js. Si el frontend quiere el 3D real de la app, el botón puede quedar como está para el primer pintado y cargar three.js bajo demanda detrás del mismo control, con `Cargando la vista 3D…` y los textos de error de §11.4 ya escritos.
8. **`prefers-reduced-motion`.** Está respetado en dos niveles: la media query anula transiciones y animaciones, y el JS consulta `matchMedia` para saltar contadores, escalonados y el morfeo, pintando el estado final de una. Cualquier animación nueva tiene que hacer las dos cosas.
9. **CSP y red.** Cero recursos externos, cero `fetch`, cero `/api/*`. Los únicos enlaces salientes son `/login`, `/login#registro`, `/politica-datos`, `/politica-datos#transparencia`, `/politica-datos#derechos` y el `mailto:` del contacto.
10. **Copy.** Todos los textos son literales de `copy.md` y en su orden. Los conectores entre secciones usan el **título de la sección siguiente**, no frases nuevas: si alguien cambia un título en `copy.md`, hay que cambiarlo también en el gancho de la sección anterior. Los siete `[COMPLETAR: …]` están puestos como ranuras visibles y la página no se despliega con ellos.
11. **Rendimiento en móvil.** El vidrio (`backdrop-filter`) se apaga por media query en las nueve tarjetas del bento por debajo de 720 px; conviene medir LCP con el plano activado y confirmar que sigue por debajo de 2,5 s.
12. **Responsive.** Probado por composición de 360 a 1920: el rail esconde los contadores vivos bajo 1120 px y la navegación bajo 900 px; el bento pasa a 2 columnas bajo 1000 px y a 1 bajo 720; el plano usa `clamp(320px, 52vh, 540px)`.
