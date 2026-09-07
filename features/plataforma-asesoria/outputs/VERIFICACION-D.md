# Verificación de D · La fusión — dirección de arte

**Pieza:** `/tmp/retail-espacios-test/features/plataforma-asesoria/outputs/opciones/D-fusion/index.html`
(286.590 bytes · 2.164 líneas) · **README:** `.../D-fusion/README.md` (359 líneas)
**Fecha:** 2026-09-07 · **Contra:** `features/plataforma-asesoria/brief.md` y el pedido del dueño
(organización y UX de C · presentación de datos de A · letra a la escala del producto ·
módulos de una pantalla con el detalle al clic).

**Método.** Chromium 1194 (`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`) sobre el
`file://`, sin red. Seis pasadas de medición y una de captura, todas en el scratchpad:
`D-shot.mjs` (capturas) · `D-med.mjs` (alto, letra, contraste, signal, 4 combinaciones) ·
`D-letra.mjs` (letra por origen HTML/SVG) · `D-svg.mjs` (19 estados de gráfico) ·
`D-color.mjs` (uso de token de color, 2 modos × 7 vistas) · `D-panel.mjs` / `D-contr.mjs` /
`D-null.mjs` (panel) · `D-jer.mjs` (jerarquía) · `D-aire2.mjs` (aire muerto) ·
`D-str.mjs` (bordes de estado) · `D-int.mjs` (detalle al clic) · `D-texto.mjs` (volcado de
texto + PDF A4). Validador de paleta: el de la skill `dataviz`, corrido con los mismos
argumentos que declara el README.

**Capturas** (27 archivos, `outputs/capturas/`): `D-cartera-{claro,oscuro}-1440.png`,
`D-cartera-claro-1366.png`, `D-sesion-cap{1..5}-{claro,oscuro}-1440.png`,
`D-sesion-cap{1..5}-claro-1366.png`, `D-informe-{claro,oscuro}-1440.png`,
`D-informe-claro-1366.png`, `D-informe-completa-*.png`,
`D-detalle-{claro,oscuro}-1440.png` (panel abierto al clic),
`D-codigos-claro-1440.png` (los 113 códigos con el plano encendido).

---

## Veredicto

**D cumple el encargo y es la mejor construida de las cuatro.** La decisión —cinco capítulos
conmutados, UNA superficie de detalle que llega filtrada— es fuerte y está sostenida en el
código, no sólo en el README. Las 12 mediciones pedidas dan bien o muy bien: cero scroll de
documento en las cuatro combinaciones, cero contraste por debajo de piso en 21 estados × 2
modos, un solo `var(--signal)` por pantalla, nada por encima de 30 px, cero recursos externos,
informe en 3 páginas A4 con el titular al 93 % del ancho, y el validador reproduce el README
línea por línea.

**No firmo sin cuatro arreglos.** Dos son de honestidad del dato —que es la regla 7 del
brief— y uno de ellos vive en la pieza que se le deja al cliente. Los otros dos son de
composición: al ancho de referencia (1440×900) la mitad de la pantalla queda en blanco en dos
capítulos, y en la cartera hay una línea que se corta con puntos suspensivos.

---

## 1 · Alto por capítulo activo — documento y paneles

`scrollHeight` vs `clientHeight` del documento, con el capítulo activo pintado. Cuatro
combinaciones (1440×900 y 1366×768, claro y oscuro): los cuatro dan **idénticos**.

| Vista | 1440×900 | 1366×768 | scroll de documento |
|---|---|---|---|
| Cartera | 900 / 900 | 768 / 768 | **0** |
| Capítulo 1 | 900 / 900 | 768 / 768 | **0** |
| Capítulo 2 | 900 / 900 | 768 / 768 | **0** |
| Capítulo 3 | 900 / 900 | 768 / 768 | **0** |
| Capítulo 4 | 900 / 900 | 768 / 768 | **0** |
| Capítulo 5 | 900 / 900 | 768 / 768 | **0** |
| Informe | 3.086 / 900 | 3.086 / 768 | rueda, con barra a la vista (es un documento, corresponde) |

`scrollWidth` = `clientWidth` (1440/1440 y 1366/1366): **cero scroll horizontal de página**.

**Paneles internos con desborde escondido: cero en los cinco capítulos**, en los dos modos.
En la cartera hay dos, medidos:

- `div.cola` (la cola de llamadas): `scrollWidth` 742 vs `clientWidth` 729 → **13 px de
  desborde horizontal** con `overflow:auto` (`index.html:235`). Aparece barra horizontal en
  una lista que no tiene nada que mostrar a la derecha. Vertical: 357/357, sin desborde.
- `p.ruta` de la cola: `scrollWidth` 1.206 vs `clientWidth` 729 → **477 px de texto
  recortados** (516 a 1366). Ver §13, falla 2.

**Aire muerto** (última tinta —texto o SVG— contra el alto de la ventana). Es la medición que
el README no hace y que un director de arte sí mira:

| Vista | 1440×900 · px en blanco | % | 1366×768 · px en blanco | % |
|---|---|---|---|---|
| Cartera | 148 | 16,5 % | 16 | 2,1 % |
| Capítulo 1 | 268 | 29,8 % | 63 | 8,3 % |
| Capítulo 2 | 297 | 33,0 % | 156 | 20,3 % |
| Capítulo 3 | 173 | 19,2 % | 25 | 3,2 % |
| **Capítulo 4** | **393** | **43,7 %** | 261 | 34,0 % |
| **Capítulo 5** | **437** | **48,5 %** | 287 | 37,3 % |

La composición está afinada para 1366×768 y no crece a 1440×900. Ver §13, falla 3.

---

## 2 · El detalle al clic

**Cerrado, no está renderizado.** Con la aplicación recién cargada y en cada capítulo:
`#panel-cuerpo` tiene **0 `<tr>`** en el DOM (0 filas de cuerpo, 0 filas totales),
`aria-hidden="true"`. No hay 254 filas escondidas.

**Se abre al clic y llega filtrado.** Desde el capítulo 1, botón «Los 108 espacios de
TERRÓN» (`[data-detalle='{"sede":"TERRON"}']`):

- título «Las cinco tablas de Mercamío», subtítulo «…Llegaste con el filtro puesto: TERRON.»
- **filtros:** una sola fila — `f-sede="TERRON"`, `f-tipo=""`, `f-estado=""`, `f-q=""`, «Limpiar»
- **pestañas con conteo, recalculadas contra la misma rebanada:**
  `Espacios 108 · Contratos 9 · Proveedores 7 · Movimientos 12 meses · 32 · Oportunidades 3`
- sin filtro (desde el capítulo 4): `Espacios 254 · Contratos 109 · Proveedores 25 ·
  Movimientos 12 meses · 86 · Oportunidades 30`
- filas por pestaña, contadas en el DOM: 40 (de 108) · 9 · 7 · 32 · 3

**Por tandas, medido:** abre con **40** filas → «Mostrar 40 más» → **80** → al rodar hasta el
fondo → **108** (y **254** sin filtro), con el pie «109 de 109 filas — no queda ninguna» /
«N de M filas · el resto llega al rodar» (`index.html:972-975`).

**Teclado:** al abrir, el foco va a `#panel-x`; con `Esc` el panel cierra (`aria-hidden="true"`,
0 filas) y **el foco vuelve al botón que lo abrió** (`.btn.lupa`). Verificado.
*Salvedad:* tras pulsar «Mostrar 40 más» el foco cae a `BODY` — el botón se repinta y el
teclado pierde el lugar (menor, §13 falla 6).

**Otras dos superficies de detalle, verificadas al clic:**
«Las otras 19 acciones» → panel con **19 filas** (6 a la vista + 19 = **25** recomendaciones
alcanzables, que es el total del ejemplo). «Los 113 códigos de caras de góndola, por sede» →
**113 códigos** agrupados en 3 sedes con **3 planos SVG** encendidos («El plano de TERRON, con
estos 96 encendidos y el resto en gris»). El párrafo crudo de 113 códigos de
`recomendaciones[].explicacion` **no aparece nunca** en pantalla — el defecto que el dueño
citó por su nombre está resuelto.

---

## 3 · Jerarquía — la conclusión primero

El primer texto de cada capítulo es la frase-conclusión con su número, y debajo la ruta del
dato en mono de 10 px. Volcado literal:

| | Primera línea |
|---|---|
| Cartera | «La cartera factura **$ 382.107.500** sobre **513** espacios en **15** sedes, al **47,4 %**…» |
| Cap. 1 | «Mercamío factura **$ 201.667.500** este mes con **111** contratos sobre **254** espacios en **7** sedes: **42,9 %** de ocupación, **−4,5** puntos…» |
| Cap. 2 | «Seis hallazgos, en orden de lo que pesan: todo lo vacío está en una sola sede (**$ 82.960.000**)…» |
| Cap. 3 | «Hacer todo esto no vale un número: vale **tres**, y no se suman…» |
| Cap. 4 | «Cada cifra de los tres capítulos de arriba aterriza acá: **254** espacios, **111** contratos…» |
| Cap. 5 | «Esta sesión sale de dos llamadas, no de una…» |
| Informe | «Usted tiene **148** espacios sin vender de **254** y **$ 166.957.500** mensuales sobre la mesa: el **83 %** de lo que factura hoy.» |

**Gráficos sin frase de arriba: 0 sobre 19 estados de gráfico medidos** (5 módulos de cartera,
4 del capítulo 1, 6 hallazgos, informe). Los módulos de la derecha (`.panelito`) abren siempre
con su propia `.frase` + `.ruta`; la cadena se cumple sin excepción.

Única observación: el capítulo 3 es el único cuya frase de apertura no lleva cifra en la frase
misma («vale tres»). Es deliberado —las tres cifras van rotuladas inmediatamente debajo, y la
suma falsa `$ 386.142.500` aparece tachada— y lo doy por bueno.

---

## 4 · Las formas contra la guía

Barrido de los 19 estados de gráfico, en los dos modos:

| Anti-patrón | Resultado |
|---|---|
| Dos ejes en un gráfico | **0.** Cada SVG tiene una sola escala. Las dos barras por proveedor (H2) son dos series sobre **un mismo eje de %** (0–60 %), no dos ejes. Las dos líneas de doce meses son **dos conteos sobre una escala de espacios**. |
| Torta o anillo | **0.** `path` con arco: **0**. `circle` de radio > 14: **0**. |
| Color categórico cíclico | **0.** No hay paleta de series: tinta de dato (`--dato` / `--dato-tenue` / `--resto`) y los tres estados. Máximo 7 rellenos distintos en un dibujo (H2), y son roles, no una rueda. |
| Gráfico sin frase que diga qué se ve | **0 sobre 19.** |
| Referencia fuera del dibujo (leyenda HTML al lado) | **0.** Todas las claves están **dentro del SVG**: «ocupado / se libera este mes / libre», «al promedio del cliente, 42,9 %», «la línea negra es el umbral de concentración, 40 %», «lo que cobra Mercamío / promedio de la plataforma», «entradas, arriba del cero / salidas, abajo del cero», «sin dato», «parcial», «100 % de los 513 espacios comercializables». |
| Anotación sobre el dato | Cumplido: «+108 caras · plano de TERRÓN», «Higiénicos Zafra cancela 6 contratos», «−74 · Guadual ilegible», «el escalón del inventario no tocó la plata», cada una escrita sobre su línea y en su carril. |
| Textos pisados o fuera del dibujo | **0** dentro de los SVG. |

Los cinco desvíos que el README declara (medidor en cartera, largo en espacios y no en %, dos
conteos en vez de línea de %, tres cifras en vez de una suma, riel de 60 y no de 90) están
efectivamente construidos así y cada uno lleva su motivo escrito **en pantalla**, no sólo en
el README. Los apruebo los cinco: el de la ocupación por sede (ARRAYÁN 8/12 y VILLA 16/24 dan
las dos 66,7 % pero no son el mismo negocio) es el que mejor demuestra que hay alguien que
entiende de alquilar metros de góndola.

---

## 5 · Tamaños de letra renderizados

Recorriendo cartera + 5 capítulos + informe, contando nodos de texto visibles:

- **Máximo: 30 px.** Nodos por encima de 30 px: **0**.
- **Mínimo: 10 px** (`.ruta` y `.rotulo`, en monoespaciada). Nodos por debajo de 10 px: **0**.
- **Pasos usados: 13** — 10 · 11 · 11,5 · 12,5 · 13 · 13,5 · 14,1 · 15 · 16,5 · 17,5 · 21 · 27 · 30.

Contra la escala declarada de `vender.css` (10 · 11,5 · 12,5 · 13,5 · 15 · 17,5 · 21 · 30 =
**8 pasos**), sobran cinco valores renderizados. Origen medido, y ninguno es un descuido de
token:

- **11 px y 13 px** salen de `<text>` dentro de SVG con `viewBox`: el token 11,5 / 13,5 se
  escala con el dibujo. Es consecuencia de dibujar responsivo, no de elegir otro tamaño.
- **14,1 · 16,5 · 27 px** salen de `.frase em{font-size:.94em}` (`index.html:133`) y de
  `.titular em{font-size:.9em}` (`index.html:341`) — la cifra en monoespaciada dentro de la
  frase. Es un ajuste óptico legítimo (la mono corre más grande a igual cuerpo) y ninguno pasa
  de 30.

**Cuerpo:** `body{font-size:var(--t-sm)}` = **13,5 px** (`index.html:85`), como declara el
README. El tamaño más frecuente en pantalla es 12,5 px (249 nodos: pestañas, celdas de tabla,
chips), después 11,5 (137) y 10 (108); 13,5 tiene 32 nodos. Es decir: **el cuerpo es 13,5 pero
la pantalla la domina 12,5**. No es una falla —la escala es coherente y todo pasa contraste—
pero el README debería decirlo así.

**Una sola cifra de 30 px por pantalla:** cartera **1** (`$ 382.107.500`) · capítulo 1 **1**
(`$ 201.667.500`) · capítulos 2, 3, 4 y 5 **0** (el máximo ahí es 21 px) · informe **1** (el
titular). Cumplido con holgura.

---

## 6 · Contraste, en los dos modos

Recorrido de cada nodo de texto visible, color efectivo contra el fondo real heredado (con
mezcla por alfa), piso WCAG 4,5:1 o 3,0:1 si ≥ 24 px o ≥ 18,66 px en negrita.

**Nodos por debajo de su piso: 0.** En los dos modos, sobre **21 estados de pantalla**:
5 módulos de la cartera, 4 módulos del capítulo 1, los 6 hallazgos, capítulos 3-4-5, el
**panel abierto** y el informe. Total 42 mediciones, todas limpias.

`--ink-4` (`#68788A`, 3,98:1 sobre el papel `--bg #EFF1ED`) **no se usa**: la única aparición
en todo el archivo es el comentario que explica por qué no se usa (`index.html:45`). El
hallazgo sobre `tema.css` es correcto y vale para el port.

**Compensaciones del modo oscuro, verificadas:** de **324 rellenos de estado** medidos en
`<rect>`/`<circle>`/`<path>` (capítulo 1 sedes 257, H1 20, H3 19, H4 4, informe 24),
**324 llevan borde** y **0 van sin borde**. Y la palabra va siempre al lado del color, escrita
dentro del dibujo. La desviación de banda del oscuro está compensada como el README dice.

---

## 7 · `var(--signal)` — un amarillo por pantalla

Contando elementos visibles cuyo `background-color` resuelve al token `--signal`:

| Pantalla | claro | oscuro | cuál |
|---|---|---|---|
| Cartera | 1 | 1 | «Abrir la sesión de Mercamío →» |
| Capítulos 1 a 5 | 1 cada uno | 1 cada uno | «Generar el informe →» |
| Informe | 1 | 1 | el botón de imprimir |
| Panel abierto | 1 | 1 | el de la pantalla de abajo, sin sumar otro |

**Cumplido: exactamente uno, en las 4 combinaciones.** En el código hay una sola regla que lo
usa (`index.html:162`, `.btn-signal`); no hay un segundo amarillo suelto.

---

## 8 · Rojo, ámbar y verde sólo en los tres estados del espacio

Barrido de `fill`, `stroke`, `color`, `background-color` y bordes, en los dos modos, sobre las
7 pantallas:

- `--ocupado` / `--entra` / `--libre` (y sus `-suave` / `-txt`) aparecen **sólo** en marcas de
  estado de espacio: el mapa de unidades (107 ocupado + 4 se libera + 146 libre), las barras
  de sede y de tipo, la marca cuadrada del riel, y el chip «113 libres» del capítulo 3.
- La cartera **no usa ni un rojo ni un ámbar ni un verde**: la señal (`SIN DATO`, `FANTASMA`,
  `COBRA POR DEBAJO`, `OCUPACIÓN BAJA`, `SIN TARIFA`, `NUEVA`), el estado de cuenta y la
  prioridad van en gris o en tinta. Es la regla que A rompía; acá se cumple.
- **Una excepción, y es a propósito:** `.aviso.cruce{border-left-color:var(--ocupado)}`
  (`index.html:270`, usado en `index.html:1618`) — la tarjeta de advertencia entre la acción 1
  y la 2 lleva filete rojo. Es **1** ocurrencia, no codifica ningún dato y el propio README la
  describe. La dejo pasar, pero contradice la regla tal como el README la enuncia («SÓLO los
  tres estados»); la regla debería decir «sólo los tres estados **codifican dato**».

---

## 9 · Los tres estados, siempre tres

- La cadena «libre o se libera»: **0 apariciones** en todo el archivo.
- Cada dibujo de estado lleva su clave con **los tres**: «ocupado · se libera este mes · libre»
  (capítulo 1 sedes, capítulo 2 H1 y H3, informe).
- Las filas rotulan el tercero por separado cuando existe: «15 de 30 · 50,0 % · **1 se libera**»,
  «16 de 24 · 66,7 % · **1 se libera**», «27 de 34 · 79,4 % · **1 se libera**».
- El riel de vencimientos distingue con marca cuadrada el espacio «ya está en «se libera»».
- La tabla del informe tiene columna propia `SE LIBERA ESTE MES`.

**Cumplido.**

---

## 10 · Confidencialidad y frontera

- **«tarifa de referencia»:** aparece en 3 vistas (hallazgo H6, capítulo 5, informe) y las
  tres veces **como declaración de ausencia o de frontera**, nunca como cifra:
  «robatope y batea no tienen tarifa de referencia cargada», «NUNCA SALE DE LA BASE DEL
  CLIENTE: la tarifa de referencia. Sólo su relación (`spread_pct`) y si existe».
  **Cifras de tarifa de referencia en pantalla: 0.**
- El pie de las cinco tablas repite la frontera: sólo lectura, nombres saneados, la tarifa no
  aparece, la consulta queda en bitácora (`index.html:1087`).
- **Informe del cliente:** 0 apariciones de *fantasma, dormida, gracia, solo lectura,
  suspendido, adopción, spread, cartera, bitácora, supresión, endpoint*, y **0 nombres de
  otros clientes** (Superandes, Tiendas La Vereda, Almacenes Caribe, Provisiones Tolima,
  Mercado El Guadual). Tampoco `GET /api`.
- Códigos de espacio en el informe: **3** (`VILLA-PUN-01`, `CENTENARIO-NEV-01`,
  `NAVE-CRZ-01`), los tres contratos que vencen. No hay volcado.
- Nombres de proveedor saneados; **pero** ver §13 falla 1: la columna MARCA imprime `null`.

---

## 11 · El informe en A4

Impreso con `emulateMedia('print')` y `page.pdf({format:'A4'})`:

- **Páginas: 3** (`/Count 3` en el PDF). El defecto de C (5 páginas) está arreglado.
- **Titular:** 30 px, **874 px de 940 px de ancho de papel = 93,0 %**, en **2 líneas**. El
  defecto más visible de C (434 px de 900, 6 líneas) está arreglado.
- **Controles visibles en `media:print`: 0** — ni cabecera, ni rail, ni botones.
- Estructura: cabecera RECABRA / Mercamío / periodo → titular → bajada → «1 · Dónde está su
  negocio hoy» → gráfico de sedes con su clave dentro + **tabla equivalente** → 2 → 3.
- Nada interno, nada de la cartera, nada del capítulo 4. Se lo puede mostrar a un gerente
  **salvo por la falla 1 de §13**, que está justo en la primera frase del capítulo 1.

---

## 12 · El validador

Corrí el validador de la skill `dataviz`
(`.../dataviz/scripts/validate_palette.js`) con **exactamente** los argumentos que el README
declara. **Las cinco corridas reproducen el README línea por línea, incluidos los dos `exit=1`
y el `WARN` del ámbar:**

| corrida | resultado | coincide con el README |
|---|---|---|
| `"#00805A,#CE8A0A,#D8342E,#2E63C8" --mode light --surface "#EFF1ED" --pairs all` | ALL CHECKS PASS · `exit=0` · WARN contraste `#CE8A0A` 2,54 · CVD peor ΔE 9,2 protan · normal ΔE 17,9 | **sí** |
| `"#00BE86,#F5A524,#F4544E,#4C89E8" --mode dark --surface "#0B1116" --pairs all` | FAILED · `exit=1` · FAIL banda de claridad (`#00BE86` 0,709 · `#F5A524` 0,782) · WARN CVD ΔE 7,5 deutan | **sí** |
| `"#8FB3E8,#2E63C8" --mode light --surface "#FFFFFF" --ordinal` | ALL PASS · `exit=0` · extremo claro 2,15:1 · un solo tono 4° | **sí** |
| `"#2F5EA6,#4C89E8" --mode dark --surface "#0B1116" --ordinal` | ALL PASS · `exit=0` · extremo claro 2,96:1 · un solo tono 0° | **sí** |
| `"#AAB3BE" --mode light --surface "#FFFFFF"` | FAILED · `exit=1` · FAIL piso de croma 0,019 | **sí** |

Las dos justificaciones de los `exit=1` son correctas y están medidas: la terna oscura es la
desviación ya documentada en `tema.css` (y las dos compensaciones están construidas — ver §6:
324 de 324 rellenos con borde, y la palabra siempre al lado), y el gris `--resto` reprueba el
piso de croma **porque se lee gris, que es su trabajo**. No inventó resultados: los verifiqué
uno por uno.

Única elisión cosmética: en la corrida 5 el README omite el `WARN Contrast vs surface 2,12` y
las tres líneas `PASS`; en la 2 omite `tritan 9,2`. No cambia ninguna conclusión.

---

## 13 · Lo que quedó mal

### Falla 1 — `null` en la columna MARCA: 42 celdas, y el informe no cierra sus propias cuentas
**GRAVE · honestidad del dato (brief §3 regla 7) · `index.html:1032`, `1041`, `1585`, `1968`**

Dos problemas de un mismo origen, los dos en la superficie que más se mira.

**(a) `null` literal en pantalla.** `index.html:1032` y `index.html:1041` interpolan
`esc(e.k.m)` sin guarda de nulo. Medido abriendo el panel y rodando hasta el fondo:

- pestaña **Espacios: 21 celdas** con la cadena `null` («Higiene Nívola · **null**»,
  «Galletas Timbó · **null**», «Enlatados Corvina · **null**»…)
- pestaña **Contratos: 21 celdas** con `null` en la columna MARCA
- Proveedores, Movimientos y Oportunidades: 0 (limpias)
- además `index.html:1585` mete `· marca null` en el `<title>` de las marcas del mapa de
  unidades del capítulo 1 — el globo que sale al pasar el mouse.

En toda la pieza la ausencia se escribe «—», «sin dato», «sin canon propio», «sin
referencia». Acá se escapa el `null` crudo del JSON. Es exactamente lo que el brief prohíbe en
la regla 7, y ocurre en la pantalla a la que el operador llega desde cualquier cifra.
Se ve en `capturas/D-detalle-claro-1440.png`, fila `TERRON-GON-02`.

**(b) El informe del cliente no cuadra consigo mismo.** `index.html:1968` escribe «Este mes
tiene **111 contratos activos** sobre 254 espacios». En la misma página:

- la línea equivalente de la serie dice «septiembre 254 espacios, **109 con contrato**, 42,9 %»
- la columna OCUPADO de la tabla de sedes suma **106** (9+14+8+12+15+22+26)

Tres números para la misma cosa, y el informe **no menciona ni una vez** los 2 contratos fuera
del plano ni los 3 espacios que se liberan que explican la diferencia (0 apariciones de «fuera
del plano» o «sin cara» en todo el informe). La sesión sí lo explica (capítulo 4); la pieza que
el gerente lee solo, no. Un gerente que suma la columna obtiene 106 y deja de creerle al resto.

**Arreglo:** guarda de nulo en las tres interpolaciones de `k.m` («—» o «sin marca»), y una
línea en el informe que reconcilie 111 / 109 / 106 con las mismas palabras que ya usa el
capítulo 4.

---

### Falla 2 — el capítulo 4 promete 111 filas y la tabla entrega 109, en la pantalla cuya promesa es que los números concuerdan
**GRAVE · `index.html:1788` vs `index.html:973`**

`index.html:1788` calcula el conteo de la tarjeta índice como
`R.conF.length + DET.fuera_del_plano` = 109 + 2 = **111**, y su propio copy dice
«**Incluye los 2 que no están en el plano** y no suman a la ocupación».

La tabla que esa tarjeta abre tiene **109 filas**, la pestaña dice **«Contratos 109»**, y el
pie (`index.html:973`) cierra con «**109 de 109 filas — no queda ninguna**». Los 2 contratos
fuera del plano **no están en la tabla**, y el pie afirma que no falta nada.

Y ocurre justo debajo de la nota del capítulo 4: «cada pestaña lleva su conteo: se recalculan
contra la misma rebanada, **así que los números siempre concuerdan**».

El README §5 además declara que la línea de `contratos_fuera_del_plano` va «una línea contada
en el capítulo 4 **y al pie de la tabla de contratos**». Al pie de la tabla de contratos sólo
está la nota de frontera (`index.html:1087`); esa línea no existe. **La afirmación del README
no se cumple.**

**Arreglo:** o la tabla incluye las 2 filas (y el conteo 111 es verdad), o la tarjeta dice 109
y la línea de los 2 fuera del plano va al pie de la tabla, como el README promete.

---

### Falla 3 — a 1440×900 la mitad de la pantalla queda vacía en dos capítulos
**MEDIA · composición · `index.html:1787-1800` (cap. 4), `index.html:1839-1855` (cap. 5)**

Medido (§1): al ancho de referencia del brief (1440×900) queda en blanco el **43,7 %** de la
pantalla en el capítulo 4 y el **48,5 %** en el capítulo 5; también 33,0 % en el 2 y 29,8 % en
el 1. A 1366×768 la misma pantalla queda entre 2 % y 37 %.

La pieza está compuesta contra 1366×768 y a 1440×900 no crece: el bloque conserva su alto y
la diferencia se va al pie. «Cabe en una pantalla» es cierto y es un logro real —el documento
mide 900/900 exactos, cero scroll— pero el README lo presenta como si la pantalla estuviera
llena, y no lo está. Se ve de un golpe en `capturas/D-sesion-cap5-claro-1440.png`: el contenido
termina a 463 px de 900.

No es un error de dato ni de accesibilidad; es un problema de dirección de arte. El capítulo 5
en particular es media pantalla de aire debajo de tres columnas de metadatos.

**Arreglo:** que el aire sobrante se reparta (más aire entre bloques, gráficos más altos) o que
el capítulo 4 muestre una muestra viva de la tabla en el espacio libre.

---

### Falla 4 — la regla de orden de la cola se corta con puntos suspensivos
**MEDIA · `index.html:1361`**

La `.ruta` de la cola de llamadas lleva `white-space:nowrap; overflow:hidden;
text-overflow:ellipsis` en línea. Medido: `scrollWidth` **1.206 px** contra `clientWidth`
**729 px** → se pierden **477 px** a 1440 y **516 px** a 1366, o sea **el 40 % de la frase**.

Lo que se ve: `cartera.clientes[] · adopcion.clientes[] ·
_derivado_frontend.cartera.orden_por_necesid…`
Lo que nunca se lee: `…ad_de_asesoria — la adopción no es un panel aparte: es la señal de cada
fila y los días sin acceso de su sub-línea`.

Justamente la mitad que explica una de las decisiones que el README defiende (que la adopción
no sea un panel aparte) es la que se corta. Es la **única** `.ruta` truncada de la pieza: en
los cinco capítulos hay 0. Se ve al pie de `capturas/D-cartera-claro-1440.png`.

**Arreglo:** quitar el `nowrap` en línea y dejarla envolver en dos líneas — hay 148 px de aire
justo debajo (§1).

---

### Falla 5 — barra horizontal de 13 px en la cola de llamadas
**MENOR · `index.html:235`**

`.cola{…overflow:auto}` con `scrollWidth` 742 contra `clientWidth` 729: **13 px** de desborde
horizontal, en las cuatro combinaciones. Aparece una barra horizontal en una lista que no
tiene nada que mostrar a la derecha. El documento no scrollea horizontalmente (1440/1440), así
que el README puede decir «0 scroll horizontal» sin mentir, pero la barra está.

**Arreglo:** `overflow-x:hidden` o descontar los 13 px de la grilla de la fila.

---

### Falla 6 — el foco se pierde al pedir más filas
**MENOR · `index.html:971-975` + `index.html:2122` (`btn-mas`)**

Al pulsar «Mostrar 40 más» el pie se repinta, el botón se destruye y el foco cae a `BODY`. Con
teclado hay que volver a tabular desde el principio del panel para pedir la tanda siguiente.
El resto del teclado está bien resuelto (foco al abrir, `Esc`, retorno al botón de origen), así
que este es el único agujero.

**Arreglo:** devolver el foco al `#btn-mas` recién pintado después de `pintarTanda()`.

---

### Observaciones que no son fallas

- **`.aviso.cruce` en rojo** (`index.html:270`): 1 ocurrencia, no codifica dato. Lo apruebo,
  pero el README debería enunciar la regla como «el rojo, el ámbar y el verde son los únicos
  que **codifican estado de espacio**», no «sólo aparecen en los tres estados».
- **Trece pasos de letra en vez de ocho** (§5): cinco vienen del escalado de SVG y del `em`
  óptico de la mono. Correcto en la práctica; el README dice «la escala del producto» y son
  trece valores renderizados.
- **«El cuerpo es 13,5»** es cierto como default (`index.html:85`), pero la pantalla la domina
  12,5 px (249 nodos contra 32). Vale decirlo con ese matiz.
- **`$ 110.567.500 · EXPUESTO A UN PROVEEDOR`** es una de las tres cifras del capítulo 3 y su
  propio rótulo dice «Ya está entrando: no es oportunidad, es dependencia». Es honesto, pero
  entonces son dos cifras de valor en juego y una de riesgo, no tres del mismo tipo.
- **El sub-título del panel** dice «Los 254 espacios del plano de Mercamío» aunque la pestaña
  esté en 108 por el filtro TERRÓN. La cabecera sí avisa «Llegaste con el filtro puesto:
  TERRON» y el conteo de la pestaña es correcto. Cosmético.

---

## 14 · Resumen de las 12 mediciones pedidas

| # | Medición | Resultado |
|---|---|---|
| 1 | Alto por capítulo activo, documento y paneles | **900/900 y 768/768**, los cinco capítulos, claro y oscuro. 0 desborde escondido en capítulos. En la cartera: `.cola` +13 px en x (barra a la vista) y una `.ruta` recortada 477 px. Aire muerto de 16,5 % a 48,5 % a 1440×900. |
| 2 | El detalle se abre al clic; qué muestra; cerrado no está renderizado | **Cerrado: 0 filas en el DOM.** Abre filtrado (1 fila de filtros + 5 pestañas con conteo, `108·9·7·32·3` con TERRÓN, `254·109·25·86·30` sin filtro). Por tandas 40 → 80 → 108/254. `Esc` cierra y el foco vuelve al botón de origen. |
| 3 | Jerarquía: primer texto = frase-conclusión con número | **Cumplido en 7/7 vistas.** 0 gráficos sin frase sobre 19. |
| 4 | Formas contra la guía | **0** dos ejes · **0** tortas · **0** anillos · **0** color cíclico · **0** gráficos sin frase · **19/19** con la referencia dentro del dibujo. |
| 5 | Tamaños de letra | máx **30**, mín **10**, **13 pasos** (8 de token + 5 derivados de SVG y `em`). Cuerpo 13,5. Una cifra de 30 px por pantalla como máximo. |
| 6 | Contraste, dos modos | **0 nodos bajo piso** en 21 estados × 2 modos. `--ink-4` sin usar. 324/324 rellenos de estado con borde. |
| 7 | `var(--signal)` | **Exactamente 1 por pantalla**, en las 4 combinaciones. |
| 8 | Rojo y ámbar sólo en estados de espacio | **Cumplido**, con 1 excepción declarada que no codifica dato (`.aviso.cruce`). |
| 9 | Los tres estados siempre tres | **Cumplido.** 0 apariciones de «libre o se libera». |
| 10 | Confidencialidad | **0 cifras de tarifa de referencia.** 0 palabras internas en el informe. 3 códigos. Pero 42 celdas con `null` (falla 1a). |
| 11 | Informe en A4 | **3 páginas** · titular 30 px al **93 %** del ancho en 2 líneas · **0** controles en print · nada interno. Falla: 111/109/106 sin reconciliar (falla 1b). |
| 12 | Validador | **5/5 corridas reproducen el README**, incluidos los dos `exit=1` justificados. |

**Extras verificados:** 0 errores y 0 avisos de consola en las 3 combinaciones capturadas ·
0 `<script src>`, 0 `<link>`, 0 `@import`, 0 `url(http…)`, 0 `<img>`/`<canvas>`/`<iframe>` ·
25 recomendaciones alcanzables (6 + 19) · los 113 códigos sólo al pedirlos, con 3 planos ·
el párrafo crudo de 113 códigos no aparece nunca.
