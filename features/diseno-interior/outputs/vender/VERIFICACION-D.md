# Verificación de D · «La fusión» — dirección de arte · SEGUNDA PASADA

Archivo verificado: `features/diseno-interior/outputs/vender/opciones/D-fusion/index.html`
(96.368 bytes, 1.221 líneas — antes 84.793 / 991).
Playwright + Chromium 1194, `reducedMotion:reduce`, deviceScaleFactor 1, sin tocar el archivo.
El modo oscuro se entra **por el botón `#tema`** (es `html[data-tema]`, no `prefers-color-scheme`):
esta pasada lo aprieta de verdad en cada sesión.
Toda medición de encuadre se toma **después de dos `requestAnimationFrame`**, como pide el aviso del diseñador.
Capturas nuevas en `capturas/D2-*.png`.

**Veredicto: PASA.** Los cinco puntos del informe anterior están arreglados y medidos. El alto
dejó de estar clavado: en 1366×768 el botón amarillo, «Guardalo como reserva» y el pie de la tarifa
se ven enteros. `acomodar()` dejó de decidir un paso tarde: **0 choques y 0 rótulos cortados en los
102 encuadres medidos**, y la decisión es idempotente y no depende del camino. Los conteos se derivan
y la pantalla ya no se contradice. Quedan **dos roces de contraste de 0,2–0,4 puntos** y tres deudas
declaradas, ninguna bloqueante; están en §7.

Prueba independiente de que el arreglo es determinista: cinco de mis capturas salieron
**byte a byte idénticas** (mismo md5) a las del diseñador —`D2-claro-1440x900` = `D-claro-1440x900`,
`D2-claro-1366x768` = `D-claro-1366x768`, `D2-oscuro-1440x900` = `D-oscuro-1440`,
`D2-claro-zoom07` = `D-claro-zoom-menos2`, `D2-claro-zoom2` = `D-claro-zoom-mas4`.

---

## 0 · Resumen contra el informe anterior

| # | Lo que fallaba | Ahora |
|---|---|---|
| 1 | Alto clavado en 900 px: en 1366×768 se comía el botón y el pie | **Arreglado.** 7 resoluciones, 0 escondido, botón y pie enteros |
| 2 | `acomodar()` medía un paso tarde: choques a 0,8× y 2,44× | **Arreglado.** 102 encuadres, 0 choques, 0 cortados, idempotente |
| 3 | «El que se sale del lienzo cede» no se aplicaba | **Arreglado.** 0 cortados; ENTRADA/CAJAS también ceden |
| 4 | Conteos fijos: la clave decía 15 libres con 3 en el contrato | **Arreglado.** Los cuatro conteos derivan del estado y suman 23 |
| 5a | `.tabla` escondía 11 px de ancho a 390 | **Arreglado.** 372/372, 0 px escondidos |
| 5b | Píldora del periodo cortada a 390 | **Arreglado.** Se lee entera |
| 5c | Contrato con dos espacios: 0,0 px de holgura | **Arreglado.** 12,0 px en las tres resoluciones |
| 5d | 4 objetivos de clic bajan de 44 px por el lado corto | **Sigue** (41,4 / 43,8 × 3) — declarado, no se pidió |
| 5e | En oscuro el amarillo de acción y el ámbar se parecen | **Sigue** — nota de dirección, no defecto |

Errores de consola: **0** en las 41 sesiones. Recursos externos: **0** peticiones fuera de `file://`;
los únicos `http://` del fuente siguen siendo los dos namespaces de SVG (líneas 563 y 663).
`var(--signal)`: **1 uso**, `.btn-principal` (index.html:380), definido por modo en 86 y 121.

---

## 1 · El alto — arreglado

`body{height:900px}` se fue. La hoja toma `100dvh`, la rejilla reparte
`minmax(--fila1,550fr) minmax(--fila2,254fr)` con pisos de 448 y 240 px (index.html:210), y el apretón
vive en un solo `@media (max-height:880px)` (index.html:428) que toca marco, rellenos e interlineados.

### La composición aprobada, intacta

| Ventana | marco (arr/lat/ab) | rail | hoja (top / alto) | filas de la rejilla | gap |
|---|---|---|---|---|---|
| **1440×900** | 8 / 12 / 12 | **56** | 74 / **814** | **550 · 254** | 10 |
| 1600×900 · 1920×1080 | 8 / 12 / 12 | 56 | 74 / 814 · 994 | 550·254 · 673,1·310,9 | 10 |
| 1440×800 | 6 / 10 / 10 | 44 | 58 / 736 | 488 · 240 | 8 |
| 1366×768 | 6 / 10 / 10 | 44 | 58 / 704 | 456 · 240 | 8 |

En 1440×900 la medición da exactamente 8 + 56 + 10 + 814 + 12 = 900 y las filas 550/254: **la
composición aprobada no se movió un píxel.**

### Nada cortado, nada escondido

Cada elemento HTML medido con `scrollHeight − clientHeight` y `scrollWidth − clientWidth`, y cada
pieza clave medida contra el recorte real (viewport ∩ todos los ancestros con `overflow != visible`).

| Ventana | documento | escondido | botón amarillo | «Guardalo como reserva» | pie de la tarifa | holgura del contrato |
|---|---|---|---|---|---|---|
| 1440×900 | 900/900 | **0** | entero | entero | entero | **12,0 px** |
| 1600×900 | 900/900 | **0** | entero | entero | entero | 12,0 px |
| 1920×1080 | 1080/1080 | **0** | entero | entero | entero | 12,0 px |
| **1440×800** | 800/800 | **0** | **entero** | **entero** | **entero** | 12,0 px |
| **1366×768** | 768/768 | **0** | **entero** | **entero** | **entero** | 12,0 px |
| 1280×800 | 800/800 | **0** | entero | entero | entero | 12,0 px |
| 1280×700 | 824/700 | 0 · el **documento rueda** 124 px (`overflow:visible`) | entero | entero | entero, 107,4 px bajo el pliegue | 12,0 px |
| 390×844 | 1516/844 | 0 · el documento rueda | entero en su caja | entero | entero | 12,0 px |

Idéntico en los dos modos. Comparar `D2-claro-1366x768.png` con la evidencia vieja del defecto: donde
antes el amarillo aparecía partido por la mitad y la última fila era «Góndola, por cara», ahora se leen
el botón entero, «Guardalo como reserva» y **«23 espacios comercializables · 13 +5 · 18 al cerrar»**.

**Choques de texto en HTML: 0** en las 16 sesiones (media 96 cajas de texto por sesión, comparando
rangos de tinta, no cajas de elemento).

Nota, no fallo: por debajo de 880 px de alto el interlineado de `#total` se aprieta a 30 px mientras la
caja del glifo mide 34, así que `scrollHeight − clientHeight` da 2 px en `.total`. El `overflow` es
`visible`, ningún ancestro lo recorta y no toca ningún otro texto: **$4.575.000 se dibuja entero**.
Es una caja de línea corta, no un corte.

---

## 2 · `acomodar()` — arreglado, y ahora converge

La medición salió del camino caliente: `calibrar()` (index.html:917) mide una vez el tamaño en pantalla
de cada rótulo y el de ENTRADA/CAJAS en unidades del plano, en el segundo cuadro y repitiendo hasta
converger; `acomodar()` (index.html:932) es aritmética contra `aPantalla()`, sin una sola lectura de
geometría del plano.

### 102 encuadres, 0 choques, 0 cortados

Se miden las cajas de **todos** los `<text>` visibles de `#svgPlano` más la píldora del periodo y la
herramienta. Dos cajas chocan si sus rects se cruzan con área > 0. «Cortado» = sale del rect de `#lienzo`.

**1440×900 claro** (idéntico en oscuro y en 1366×768 y 1920×1080):

| Acción | zoom | cajas (rótulos + sala) | choques | cortados | holgura mínima | cuerpo del rótulo |
|---|---|---|---|---|---|---|
| carga | 1× | 27 (23 + 2) | **0** | **0** | 4,63 px | 10,50 px |
| API 1,5× | 1,5 | 24 (21 + 1) | **0** | **0** | 15,20 px | 10,50 px |
| API 2× | 2 | 16 (14 + 0) | **0** | **0** | 24,26 px | 10,50 px |
| `+` ×1 | 1,25 | 26 (22 + 2) | **0** | **0** | 7,26 px | 10,50 px |
| `+` ×2 | 1,5625 | 23 (20 + 1) | **0** | **0** | 16,33 px | 10,50 px |
| `+` ×3 | 1,9531 | 18 (15 + 1) | **0** | **0** | 12,29 px | 10,50 px |
| **`+` ×4** | 2,4414 | 14 (12 + 0) | **0** | **0** | 28,37 px | 10,50 px |
| **`−` ×1** | 0,8 | 26 (22 + 2) | **0** | **0** | 2,35 px | 10,50 px |
| **`−` ×2** | 0,7 | 19 (17 + 0) | **0** | **0** | 4,29 px | 10,50 px |
| `−` ×3 | 0,7 (tope) | 19 (17 + 0) | **0** | **0** | 4,29 px | 10,50 px |
| **rueda 4 adentro** | 1,4641 | 24 (21 + 1) | **0** | **0** | 14,55 px | 10,50 px |
| **rueda +8 afuera** | 0,7 | 19 (17 + 0) | **0** | **0** | 4,29 px | 10,50 px |
| `Centrar` (tras +×4, −×3 y rueda) | 1 | 27 (23 + 2) | **0** | **0** | 4,63 px | 10,50 px |

Los cuatro encuadres que antes rompían —`+`×4, `−`×1, `−`×2 y la rueda— dan **cero**. El
`FRU-05` encima de la píldora y el `EXP-01 × PUN-03` de 6,5 × 23,6 px no vuelven a aparecer.
El rótulo mide **10,50 px en pantalla en los 102 encuadres**, en las cuatro ventanas y en los dos modos:
la promesa que justificaba el injerto se cumple ahora también con las herramientas, no sólo con la API.

**Arrastre** (1440×900, tres tirones de 220/380/260 px con el puntero): 23, 23 y 10 rótulos visibles,
**0 choques y 0 cortados** en los tres.

### Converge y no depende del camino

Por cada uno de 21 estados (3 ventanas × 7 pasos) se repitió la decisión dos veces más disparando
`resize`, y se comparó el conjunto exacto de rótulos visibles:

**21 de 21 con `igual12 = igual23 = true`.** La primera pasada da el mismo resultado que la décima.
Aquel «saltar a 2× deja 4 cortados, un `resize` los arregla» quedó cerrado. A 390 al cargar, sin
resize: 9 rótulos, **0 choques, 0 cortados**, e idéntico tras dos repintados.

### La regla del borde, ahora sí

0 cortados en los 102 encuadres, incluidos los que antes fallaban (1,5625× con 2 cortados, 1,9531× con
3, 2× con 4 — `FRU-04` 5,4 px, `CAJAS` 7,9, `ISL-06` 36,1, `BEB-02` 52,5). ENTRADA y CAJAS entran en la
misma regla y además ceden por debajo de 8 px en pantalla: a 0,7× y a 390 desaparecen, como debe ser.

Consecuencia de diseño que conviene saber, no defecto: la regla es más severa que antes, así que al
acercar quedan menos rótulos en pantalla (a 2× quedan 14 de 23; a 2,44×, 12). Los que se van están
fuera del encuadre o pisando algo. A 0,7×, con el plano entero a la vista, quedan 17 de 23: seis ceden
por apretujamiento, que es exactamente lo que la regla promete.

---

## 3 · Los conteos — arreglados

`pintaConteos()` (index.html:1021) deriva de `ESP` y del contrato en cada pintado: clave del plano,
columna «Libres · entran» de las siete filas y pie de la tarifa. Medido a 1440×900, 1440×800 y 1366×768,
con resultados idénticos en las tres:

| Espacios en el contrato | clave del plano | Isla | Frutas | pie de la tarifa | total | ¿suma 23? |
|---|---|---|---|---|---|---|
| **2** (arranque) | 13 libres · 5 se libera · 3 tomado · 2 en el contrato | 2 | 3 | 23 · 13 +5 · **18 al cerrar** | $4.575.000 | 13+5+3+2 = **23** ✓ |
| **3** (+FRU-04) | **12** · 5 · 3 · **3** | 2 | **2** | 23 · **12 +5** · **17 al cerrar** | $5.347.667 | 12+5+3+3 = **23** ✓ |
| **4** (+FRU-05) | 11 · 5 · 3 · 4 | 2 | **1** | 23 · 11 +5 · 16 al cerrar | $6.120.333 | **23** ✓ |
| **5** (+ISL-06) | **10** · 5 · 3 · **5** | **1** | 1 | 23 · **10 +5** · **15 al cerrar** | $8.560.333 | 10+5+3+5 = **23** ✓ |

La contradicción del informe anterior («Libre todo el periodo 15 · En el contrato 3» con 12 libres
reales) desapareció: los cuatro números de la clave, las siete filas y las tres celdas del pie cuentan
lo mismo. Ver `D2-claro-1366-3espacios.png` y `D2-claro-1440-5espacios.png`.

### La válvula del contrato

| Ventana | `.cuerpo` con 2 | con 3 | con 4 | con 5 |
|---|---|---|---|---|
| 1440×900 | 508/508 · 0 | 508/508 · **0** | 557/508 · rueda 49 | 609/508 · rueda 101 |
| 1440×800 | 451/451 · 0 | 451/451 · **0** | 475/451 · rueda 24 | 520/451 · rueda 69 |
| **1366×768** | 419/419 · 0 | 430/419 · **rueda 11** | 475/419 · rueda 56 | 520/419 · rueda 101 |

`overflow-y:auto`: rueda con barra a la vista, no esconde. Lo que rueda en 1366×768 con tres espacios
son los 12 px de holgura que se pidieron; el botón amarillo y «Guardalo como reserva» siguen enteros
en pantalla (medido: `entero = true` en los dos). Es la deuda que el diseñador declaró y es el precio
correcto: la holgura se cuenta como contenido.

---

## 4 · Las tres interacciones — siguen funcionando

**4.1 · El resaltado.** Con el mouse real sobre la fila `Isla`: `data-foco` pasa a `"1"`,
**329 de 333 hijos de `#escena` quedan en opacidad 0,20 exacta** y 4 en 1,0 (los 3 `.pz.mk` y la capa
`#rotulos`); de los 23 rótulos, **3 en 1,0 y 20 en 0,20**. Al salir vuelve a 333/333 en 1,0. Desde una
fila del contrato: 331 apagados, 1 encendido, 1 rótulo. **El hover sobre el plano no apaga la sala**:
`data-foco` se queda en `"0"`, 0 piezas atenuadas. Exactamente lo declarado.

**4.2 · El cursor de la escalera.** Siete posiciones del mouse sobre `#esc` dan siete lecturas
distintas; con teclado, `←` y `→` mueven día a día: 26 → 24 → 23 → 24 → 25 → 26. La lectura se lee
**«si arrancás el 26 de sep → 17 libres»**, con espacio normal: el HTML es
`el <b><span class="dig">26</span> de sep</b>`, la cifra sola en mono tabular y las palabras en la
display. El punto (4) del encargo está cumplido.
Medición de baile: el número de libres (`17`) **no se mueve nunca** —su `<b>` queda clavado en x=917,3
en las siete posiciones— y el bloque de la fecha se corre 12,0 px (un dígito tabular) sólo al pasar de
día de una cifra a día de dos. Dentro del mismo largo, 0,0 px.

**4.3 · Tocar un mueble libre.** Clic sobre `FRU-04`: 2 → 3 `.eitem`, `#cEleg` 2 → 3, plazo
«61 días · 3 espacios», total **$4.575.000 → $5.347.667**, `data-sel="1"` y la pista se esconde.
La cuenta es correcta: (1.050.000 + 1.200.000 + 380.000) × 61 / 30 = 5.347.666,7.
La `×` devuelve todo al estado exacto anterior (13 libres, 2 espacios, $4.575.000). Con teclado,
`Enter` sobre `ISL-06` suma ($7.015.000) y `Enter` otra vez quita. Clic sobre un tomado (`GON-60·A`) y
sobre uno que se libera (`PUN-17`): no pasa nada.

Objetivos de clic: 23 piezas, área mínima 2.518 px². Por el lado corto siguen bajando 4:
**PUN-05 60,7 × 41,4** y las tres caras `GON-6x·A` **64,5 × 43,8**. Sin cambios; no se pidió.

---

## 5 · 390 px — arreglado

Tal como carga, sin un solo `resize`, reproducible en claro y en oscuro:

| Medición | Antes | Ahora |
|---|---|---|
| Choques entre textos del plano | 25 pares cruzados | **0** |
| Rótulos cortados por el lienzo | varios | **0** |
| Píldora del periodo | «31 ago → 30 sep 2026 · 3» | **«31 ago → 30 sep 2026 · 31 días», entera** |
| `.tabla` | escondía 11 px de ancho | **372/372 — 0 px escondidos** |
| Pie de la tarifa | — | las tres celdas en **una línea** (20,9 px de alto cada una) |
| Escalera | arrancaba en la meseta plana | SVG a **974 px**, arranca por los escalones (`scrollLeft` 626 de 626), 12 de 18 textos en el encuadre |
| Herramienta `+ − Centrar` | tapaba la píldora | baja al pie del plano, entera |
| Rótulos visibles | — | 9 de 23, todos a **10,50 px**; ENTRADA/CAJAS ceden (medirían 4,2 px) |

El documento rueda normalmente (1516/844) y `.graf` desliza 626 px, las dos cosas declaradas.
Ver `D2-claro-390.png`.

---

## 6 · Confidencialidad, señal, contraste, tipografía

**Grep sobre el fuente entero (comentarios incluidos) + `innerText` + los `<text>` del SVG + los
`aria-label`**, contra: anthropic · claude · opus · sonnet · haiku · fable · openai · copilot · LLM ·
GPT · inteligencia artificial · generado con/por · asistente · prompt · agente · maqueta · mockup ·
lorem · placeholder · TODO · FIXME · confidencial · no distribuir · borrador · draft · demo.
**Cero coincidencias reales.** Los únicos aciertos son «todo» dentro de «Libre **todo** el periodo» y
de ocho comentarios del código. Limpio.

**`var(--signal)`: 1 uso.** `.btn-principal` (index.html:380).

**Contraste** (color compuesto sobre el fondo real, alfa incluido; los rótulos del plano medidos contra
**la tapa de su mueble**, no contra el panel): 138 textos por modo.

| | claro | oscuro |
|---|---|---|
| Textos que fallan AA | **2** (§7.1) | **1** (§7.1) |
| Piso, sin contar los rótulos | 4,14:1 | 4,29:1 |
| Rótulos del plano, tinta contra la tapa | 5,47 – 17,96:1 | **1,91 – 17,29:1** |
| Rótulos, tinta contra el halo | 17,57 – 17,96:1 | 13,07 – 17,04:1 |

Se confirma el matiz del informe anterior: **en oscuro los 23 rótulos viven del halo** (`paint-order:stroke`,
trazo de 3,51 px del color del piso, index.html:255-256). Si algún día se toca ese grosor, en oscuro los
rótulos se caen. En claro la tinta sola ya cumple.

**Tamaños de letra en pantalla** — 1440×900, los mismos diez pasos de antes:

| px en pantalla | n | contexto |
|---|---|---|
| **10,00** | 17 | «Sede», `01…04`, rótulos de campo |
| 10,50 | 27 | los rótulos del plano (constante a todo zoom y a toda ventana) |
| 11,21 | 2 | ENTRADA · CAJAS |
| 11,50 | 26 | fecha, píldora, fechas de la escalera |
| 12,50 | 14 | RECABRA, «Galerías» |
| 13,50 | 29 | tabla, filas del contrato |
| 15,00 | 13 | títulos de panel, cifras 15·17·18·20 |
| 17,50 | 3 | NAVE, PUN-05, ISL-04 |
| 21,00 | 6 | la lectura de la escalera |
| 30,00 | 1 | $4.575.000 |

**Mínimo real: 10,00 px.** El rótulo se mantiene en 10,50 px en las siete resoluciones.

---

## 7 · Lo que queda — nada bloqueante

**7.1 · Dos roces de contraste con `--ink-4`, de 0,2 a 0,4 puntos.** El token está afinado justo en el
umbral (4,52:1 claro / 4,71:1 oscuro sobre superficie limpia) y pierde AA en cuanto el fondo deja de
ser la superficie limpia:

| Texto | Fondo real | claro | oscuro | AA |
|---|---|---|---|---|
| El `0` de «Libres · entran» **en una fila marcada** (`tr.mk td{background:var(--panel-2)}`, index.html:410) | superficie + `--panel-2` (4,5 % de tinta) | **4,14:1** | **4,29:1** | 4,5 |
| El mismo `0` en una fila sin marcar | superficie | 4,52:1 | 4,71:1 | pasa |
| **ENTRADA · CAJAS** (`--pl-sala` = `--ink-4`, index.html:259) | el piso `--floor` #F7F8F5 | **4,24:1** | 4,74:1 | 4,5 |

El del `0` no es una clase nueva —ya existía en «Exhibición de piso»— pero **los conteos derivados lo
volvieron alcanzable sobre fila marcada**: con PUN-05 en el contrato, la fila «Punta de góndola» queda
marcada y su libre baja a `0`. El de ENTRADA/CAJAS es anterior al arreglo y **el informe pasado lo dio
por bueno midiéndolo mal** (lo comparaba contra blanco puro en vez de contra el piso); lo corrijo acá.
Los dos se arreglan con un solo punto de tinta en `--ink-4`, sin tocar composición.

**7.2 · ENTRADA y CAJAS bajan del piso de 10 px de la escala.** Están pintados en el piso y escalan con
la ventana: 13,97 px a 1920×1080 · 11,21 a 1440×900 · 10,51 a 1280×700 · 9,98 a 1440×800 y 1280×800 ·
**9,26 a 1366×768** · ceden a 390. Es inherente a que el plano escale, y el diseñador lo declaró. Piso
duro de 10 px sólo se consigue dándoles tamaño constante en pantalla, como al rótulo — y eso los
desengancha del piso, que es justamente lo que los hace leer como sala y no como etiqueta. **Lo dejo
como está y lo anoto**, pero la escala de ocho pasos ya no se cumple por debajo de 800 px de alto.

**7.3 · El umbral de scroll quedó en 760 px de alto, no en 700.** Entre 700 y 759 la página rueda
normalmente (medido a 1280×700: documento 824/700, `overflow:visible`, todo dentro de su caja, el pie
a 107,4 px bajo el pliegue). Es el comportamiento pedido —rodar en vez de esconder— pero «entrar» no
entra. Bajarlo a 700 pide ~54 px que sólo salen de la escala de letra: **no vale la pena**.

**7.4 · Cuatro objetivos de clic por debajo de 44 px por el lado corto** (PUN-05 41,4; las tres caras
`GON-6x·A` 43,8). Sin cambios; arreglarlo es cirugía sobre la geometría de B.

**7.5 · En oscuro el amarillo de acción `#FFD028` y el ámbar de «se libera» `#F5A524` siguen
pareciéndose.** Visible en `D2-oscuro-1366x768.png`: el botón y los rótulos «libre 25 sep» comparten
familia. Nota de dirección de arte, no defecto medible.

**7.6 · Dos capturas de evidencia del informe anterior fueron sobreescritas.** `D-claro-1366x768.png` y
`D-oscuro-1440.png` muestran hoy el estado arreglado, no el defecto que documentaban. El diseñador lo
declaró. La demás evidencia vieja sigue intacta: `D-claro-zoom-choque.png`, `D-claro-390.png`,
`D-claro-390-completa.png`, `D-claro-zoom07.png`, `D-claro-zoom15.png`, `D-claro-zoom2.png`,
`D-claro-arrastre.png`, `D-claro-1440-3espacios.png`, `D-claro-1440-5espacios.png`.
Para la próxima: la evidencia de un defecto no se pisa, se archiva.

---

## 8 · Cómo verificar esto de nuevo

1. Chromium 1194 en `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`, `reducedMotion:reduce`,
   `deviceScaleFactor:1`.
2. **El oscuro se entra apretando `#tema`**, no con `colorScheme:'dark'` — la hoja es
   `html[data-tema="oscuro"]`. Una verificación que use `prefers-color-scheme` mide el claro dos veces.
3. **Leer los rects después de dos `requestAnimationFrame`.** La decisión de `acomodar()` es síncrona,
   pero el navegador necesita un cuadro para dibujarla.
4. Al medir scroll escondido, **descartar los elementos SVG**: `scrollHeight`/`clientHeight` no
   significan nada en ellos y producen falsos positivos (38, 113, 14 px «escondidos» que no existen).
5. «Nada cortado» se mide contra el recorte real —viewport ∩ todos los ancestros con
   `overflow != visible`—, distinguiendo *cortado por un contenedor* de *abajo del pliegue con scroll
   normal*, que es legítimo a 1280×700 y a 390.
6. El fondo de un rótulo del plano es **la tapa de su mueble**, no el panel; el de ENTRADA/CAJAS es
   `--pl-piso`. Medirlos contra blanco da 4,52 donde en realidad hay 4,24.

### Capturas de esta pasada

`D2-claro-1440x900.png` · `D2-oscuro-1440x900.png` · `D2-claro-1366x768.png` ·
`D2-oscuro-1366x768.png` · `D2-claro-1440x800.png` · `D2-claro-1920x1080.png` · `D2-claro-390.png` ·
`D2-claro-zoom07.png` (−×2) · `D2-claro-zoom2.png` (+×4) · `D2-claro-1366-3espacios.png` ·
`D2-claro-1440-5espacios.png`
