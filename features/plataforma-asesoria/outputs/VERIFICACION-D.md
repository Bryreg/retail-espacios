# Re-verificación de D · La fusión — dirección de arte · segunda ronda

**Pieza:** `/tmp/retail-espacios-test/features/plataforma-asesoria/outputs/opciones/D-fusion/index.html`
(302.897 bytes · 2.386 líneas) · **README:** `.../D-fusion/README.md` (738 líneas)
**Fecha:** 2026-09-07 · **Contra:** los cinco puntos que quedaron abiertos en mi informe anterior
(§4 hueco interior, §9A clave a 7 px, §9B `thead` tapado, §10 «109 ocupados», §10 caption de Espacios)
y toda la batería de regresión que ya pasaba.

**Método.** Chromium 1194 (`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`) sobre el `file://`,
sin red. Scripts en `scratchpad/d3v/`: `hueco2.mjs` y `full.mjs` (hueco interior, éste recorriendo
los 24 estados de módulo por ancho) · `m9-svgtxt.mjs` y `svgmin.mjs` (texto SVG con `getScreenCTM`) ·
`m8-letra.mjs` (escala tipográfica completa) · `thead.mjs` / `thead2.mjs` (cabecera pegajosa) ·
`rotulos.mjs` / `rot2-4.mjs` / `cap.mjs` (rótulos y captions) · `cap5d.mjs` (ficha de metadatos) ·
`formas.mjs` (arcos, círculos, texto fuera de su dibujo) · `print.mjs` (medias de impresión y A4) ·
`contar.mjs` (nodos evaluados) · más los nueve scripts de la ronda anterior corridos sin tocar
(`m1-null`, `m1b-marca`, `m2-informe`, `m2b`, `m3-cap4`, `m4-aire`, `m5-cola`, `m6-foco`, `m7-reg`,
`m10-reg2`) · `shots3.mjs` (capturas).

**Capturas** (17 archivos `D3-*.png`, `outputs/capturas/`): cartera, los 5 capítulos, informe,
informe completo y detalle a 1440 claro; `D3-thead-rodado-claro-1440.png`;
`D3-clave-11px-cap1-claro-1440.png` (el recorte que antes mostraba los 7 px); y capítulos 1, 4 y 5
a 1366 y a 1920.

---

## Veredicto

**Firmo D.** Los cinco puntos abiertos están cerrados, y los cinco están cerrados por donde había que
cerrarlos, no por donde era barato. Todo lo que ya pasaba sigue pasando: lo remedí entero, no de a
muestras.

Lo que más me importa decir es esto: **la falla 3 no se volvió a mudar, se resolvió con el movimiento
correcto.** En mi informe anterior escribí que el arreglo no era estirar el SVG sino redibujarlo para
su columna —`viewBox` más alto, filas de sede más gruesas, la clave a cuerpo de texto— y que ése era
además el mismo movimiento que subía la letra de 7 px. Es exactamente lo que se hizo: los dibujos ya
no son una lámina fija que se encoge, se pintan con la caja real (`figSlot` / `pintarFiguras`), y de
ahí salen las dos cosas juntas —el alto se gasta dentro del dibujo y 1 unidad pasa a ser 1 px—. El
hueco cayó de 463 a 94 px en el capítulo 5 y la clave subió de 6,6 px a 11 px. **Un solo movimiento,
dos fallas cerradas.** Eso es trabajo de composición, no de parche.

Y el número que se publica ahora mide lo que dice medir, que era mi otra objeción: el techo se fijó
sobre el hueco interior, y el hueco interior es lo que se verificó.

---

## 1 · El hueco interior de cada columna · **ARREGLADO**

Repetí la medición del informe anterior (`m11-hueco.mjs`: se proyectan todas las tintas de la columna
sobre el eje y y se busca el intervalo más largo sin tinta) y después la extendí a **los 24 estados
de módulo por ancho** —los 5 de la cartera, los 4 del capítulo 1, los 6 hallazgos, las 6 acciones,
capítulos 4 y 5 e informe—, porque es donde vive el peor caso y es como lo declaró el diseñador.

| ancho | techo pedido | **peor hueco medido** | dónde | |
|---|---|---|---|---|
| 1366×768 | ≤ 120 px | **82 px** | cap2 · hallazgo 6 | **PASA** |
| 1440×900 | ≤ 150 px | **115 px** | cap2 · hallazgo 6 | **PASA** |
| 1920×1080 | ≤ 250 px | **185 px** | cap3 · acción 2 | **PASA** |

**Idéntico en claro y en oscuro** (24 estados × 3 anchos × 2 modos). Reproduce exactamente los
82 / 115 / 185 que declaró el diseñador: el número que publica es el que se mide.

En el estado por defecto de cada pantalla, contra mi medición anterior a 1440×900:

| Vista · 1440×900 | antes | ahora |
|---|---|---|
| Capítulo 1 | 260 px · 38,4 % | **73 px · 10,9 %** |
| Capítulo 2 | 276 px · 40,9 % | **76 px · 11,3 %** |
| Capítulo 3 | 213 px · 39,5 % | **84 px · 15,6 %** |
| Capítulo 4 | 384 px · 56,8 % | **100 px · 14,8 %** |
| Capítulo 5 | **463 px · 59,9 %** | **94 px · 12,2 %** |
| Cartera | — | 58 px · 9,3 % |

A 1366: máximo 74 px en el estado por defecto (antes cap4 252 px y cap5 313 px). A 1920: máximo
166 px (antes cap4 600 px, cap5 660 px, cap1 512 px).

**Cómo se ganó.** Verificado en el archivo: `.aire` y `.aire-arriba` **ya no existen** (0 apariciones);
el sobrante se reparte entre todas las juntas (`space-around`, `space-evenly`, `table height:100%`,
`align-content:space-between`) en vez de caer en una sola costura. Y sobre todo, el alto se gasta
**dentro** del dibujo: el mapa del capítulo 1 mide ahora **630 × 392** donde antes medía 630 × 157.

**Y se ve.** El capítulo 5 —el peor caso, 463 px de blanco enmarcado entre dos bloques— es ahora una
ficha de 12 casillas en tres columnas que llena la página, con el aviso de cierre pegado a lo que lo
precede: **33 px** de separación, contra los ~430 px a los que quedaba de su propia tarjeta.
`D3-sesion-cap5-claro-1440.png` y `D3-sesion-cap5-claro-1366.png`.

---

## 2 · La clave de los dibujos a 7 px · **ARREGLADO**

Repetí la medición con `getScreenCTM()`, que es la que corrigió mi §5 equivocada de la primera ronda.

| ancho | nodos < 10 px · antes | **ahora** | mínimo | máximo |
|---|---|---|---|---|
| 1366×768 | 48 (mínimo **6,6 px**) | **0** | **10,99 px** | 12,99 px |
| 1440×900 | 48 (mínimo **7,0 px**) | **0** | **11,00 px** | 13,00 px |
| 1920×1080 | 7 (mínimo 9,9 px) | **0** | **11,00 px** | 13,00 px |

106 nodos `<text>` medidos por ancho. **Escalas de los SVG: 0,999 – 1,001**, o sea 1 unidad = 1 px,
que es lo que hace que un texto declarado a 11 px se imprima a 11 px.

Lo que estaba a 6,6 / 7,0 px era la clave obligatoria del dibujo —«ocupado · se libera este mes ·
libre»— y los rótulos de sede. Hoy están a **11 px** y se leen: `D3-clave-11px-cap1-claro-1440.png`.

**La escala tipográfica completa de la pieza** (12 vistas, texto de pantalla y de SVG):
10 · 11 · 11,5 · 12,5 · 13 · 13,5 · 14,1 · 15 · 16,5 · 17,5 · 21 · 27 · **30**.
**Máximo 30 px · mínimo 10 px · nodos por encima de 30: 0 · por debajo de 10: 0.**

**En papel también.** Con `media:print`, los 65 nodos de texto SVG del informe salen entre **11 y
11,5 px**, **0 por debajo de 10**: los dibujos se vuelven a medir al entrar en print, así que la
promesa vale para la pantalla y para el PDF.

**Ningún texto se sale de su dibujo:** 0 sobre los 17 gráficos pintados, en los tres anchos
(`margenRot()`, `rotulo()` y `cabe()` hacen lo que dicen).

---

## 3 · El `<thead>` tapado por la barra de filtros · **ARREGLADO**

Con `#panel-cuerpo` rodado 400 px, que es la posición exacta en la que lo encontré roto:

| | antes | **ahora** |
|---|---|---|
| barra de filtros + pestañas | y 99 → **172** | y 99 → **189** |
| primer `<th>` | y **111 → 132** (debajo de la barra: **tapado**) | y **190 → 211** (**entero y visible**) |
| solape barra → th | +40 px | **−0,2 px** |
| banda visible por encima de la barra | 12 px, con filas asomando | **0 px** |
| filas asomando | sí | **0** |

Filtros y pestañas viven ahora en un solo contenedor pegajoso (`.barra-panel`) y el `thead` se pega
justo debajo con el alto real medido (`top: 91px`). La barra es **opaca** (`rgb(255,255,255)`,
`z-index 5`): `elementFromPoint` en su centro devuelve `DIV.filtros`, no una fila. Y el `padding-top`
se movió al contenedor (`#panel-cuerpo` queda en `padding-top: 0`), que era la banda de 12 px por
donde asomaban las filas.

Igual a **1366, 1440 y 1920**, en claro y en oscuro. `D3-thead-rodado-claro-1440.png`: los nueve
nombres de columna se leen enteros, incluida MARCA.

---

## 4 · «109 ocupados» y el caption de Espacios · **ARREGLADOS**

**El rótulo.** «**109 ocupados**»: **0 apariciones** en toda la pieza. El último punto del gráfico de
doce meses dice «**109 con contrato**» en el informe (rótulo del SVG) y en el capítulo 1 (módulo
«Doce meses · espacios»). La cartera conserva «**243 ocupados**» en su módulo de espacios, y está
bien: ahí el número es otro y la palabra es la que corresponde.

**El caption.** Cambia con el filtro, que era lo que faltaba:

- sin filtro → «**Los 254 espacios del plano de Mercamío.** Cada uno con su estado del periodo y su contrato si lo tiene.»
- con filtro → «**108 de los 254 espacios · filtro: TERRON.** Cada uno con su estado del periodo y su contrato si lo tiene.»

---

## 5 · La ficha de metadatos del capítulo 5 · **ARREGLADA**

De 6 a **12 casillas**, y las 12 son del guion, no relleno: periodo · fecha de corte · generado ·
sedes leídas · contratos leídos · códigos sin cara · criterio de «se libera» · ventana de
vencimientos (`DIAS_POR_VENCER = 60`) · cobertura del benchmark · sin dato · lo que nunca sale de la
base del cliente · quién lo preparó y quién lo va a ver. Repartidas en filas que se estiran, con el
aviso de cierre pegado al contenido.

---

## 6 · Lo que ya pasaba, remedido entero

| Medición | Resultado |
|---|---|
| Barrido `null` / `undefined` / `NaN` | **0** en **48 pasadas** (12 vistas × 2 modos × 2 anchos) |
| Errores o avisos de consola | **0** en las 4 combinaciones · **0** en los 24 estados × 3 anchos × 2 modos |
| Columna MARCA | 21 «—» en Espacios · 21 en Contratos · **0** celdas con `null` · 254 `<title>` de SVG correctos |
| El informe cuadra | `CON_PLANO` 109 · `CON_FUERA` 2 · `CON_TOT` 111 · `OCUP` 106 · `SELIB` 3 · **tabla de sedes sumada en el DOM: OCUPADO 106 + SE LIBERA 3 = 109** |
| Capítulo 4 | **109 `<tr>`** · pie «109 + 2 = 111 contratos» · los otros tres pies intactos (254/254, 25/25, 30/30) |
| Alto por pantalla | **768/768**, **900/900** y **1080/1080** en cartera y los 5 capítulos, claro y oscuro |
| Scroll horizontal | **0** a **390, 1024, 1366, 1440 y 1920** · **0** paneles con desborde escondido |
| `.ruta` | 690/690 y 729/729 · `white-space: normal` · **0 truncadas** (8 en los capítulos) |
| Cola | `overflow-x: hidden` · 729/729 y 690/690 · **0** botones fuera de la caja |
| Foco tras «Mostrar 40 más» | ciclo completo: TR 41 → Tab → sobrevive 400 ms y 1,2 s → Enter → TR 81 → TR 121 · la rueda no lo mueve · `Esc` devuelve el foco al botón de origen y deja **0 `<tr>`** |
| Panel cerrado | **0 `<tr>`** · `aria-hidden="true"` |
| Detalle al clic, filtrado | `f-sede = TERRON` · pestañas **108 · 9 · 7 · 32 · 3** · 40 filas de primera tanda |
| Contraste | **0 nodos bajo su piso** (4,5:1 / 3,0:1) sobre **2.071 nodos de texto por pasada**, claro y oscuro |
| `var(--signal)` | **exactamente 1** por pantalla · **16/16** |
| Formas | **0** arcos · **0** círculos r>14 · **0** texto fuera de su dibujo · **0** gráficos sin frase |
| Confidencialidad | informe en print: **0** palabras internas · **1** «tarifa de referencia» como declaración de ausencia · **3** códigos (`VILLA-PUN-01`, `CENTENARIO-NEV-01`, `NAVE-CRZ-01`), cada uno en el hallazgo y en su acción |
| Informe A4 | **3 páginas** · **0** controles visibles en print |
| «libre o se libera» | **0** apariciones |
| Recursos externos | **0** `<script src>` · 0 `<link>` · 0 `@import` · 0 `url(http` · 0 `<img>` / `<canvas>` / `<iframe>` |

*(Sobre las «palabras internas»: un barrido en pantalla encuentra una vez la palabra «cartera», pero
es la pestaña de navegación de la aplicación, no el informe; en `media:print` no queda ninguna, y los
controles visibles en print son 0.)*

---

## 7 · Resumen

| # | Punto abierto del informe anterior | Estado |
|---|---|---|
| 3 | A 1440×900 media pantalla vacía (hueco de 213 a 463 px) | **ARREGLADO** · 82 / 115 / 185 px contra techos de 120 / 150 / 250 |
| 9A | Clave de los dibujos a 7,0 / 6,6 px | **ARREGLADO** · 0 nodos < 10 px · mínimo 11 px · también en papel |
| 9B | `<thead>` tapado por la barra de filtros | **ARREGLADO** · th 190→211 entero · 0 filas asomando |
| 10a | «109 ocupados» contra «106 ocupados» en el informe | **ARREGLADO** · «109 con contrato» · 0 «109 ocupados» |
| 10b | Caption de Espacios sin avisar del filtro | **ARREGLADO** · «108 de los 254 espacios · filtro: TERRON» |
| — | Ficha del capítulo 5 | **De 6 a 12 casillas reales · aviso de cierre pegado** |
| — | Las 7 fallas de la primera ronda | **siguen arregladas**, remedidas una por una |

**Firmo D.** No quedan puntos abiertos. Las tres GRAVES de la primera ronda siguen resueltas por la
vía honesta —se escribe la ausencia, se explica la diferencia entre 109 y 111, se cuenta al pie lo
que falta en vez de inventar filas—, las menores están cerradas, y la composición dejó de ser una
promesa medida con el instrumento equivocado: el hueco se midió donde vive y se bajó redibujando los
gráficos para su columna, que es lo que había que hacer. **D es la pieza que hay que llevar adelante.**
