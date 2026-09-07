# Re-verificación de D · La fusión — dirección de arte

**Pieza:** `/tmp/retail-espacios-test/features/plataforma-asesoria/outputs/opciones/D-fusion/index.html`
(290.694 bytes · 2.217 líneas) · **README:** `.../D-fusion/README.md` (602 líneas, con §7 nueva)
**Fecha:** 2026-09-07 · **Contra:** el informe anterior de esta misma pieza (las 7 fallas) y,
otra vez, `features/plataforma-asesoria/brief.md`.

**Método.** Chromium 1194 (`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`) sobre el
`file://`, sin red. Once pasadas nuevas, todas en el scratchpad: `m1-null.mjs` (barrido de
`null` en 12 vistas × 2 modos × 2 anchos) · `m1b-marca.mjs` (celdas de MARCA) ·
`m2-informe.mjs` / `m2b.mjs` (cuadre del informe, tabla de sedes, PDF A4) · `m3-cap4.mjs`
(conteo del capítulo 4 contra su tabla y su pie) · `m4-aire.mjs` (aire de cola, desborde,
scroll a 5 anchos) · `m5-cola.mjs` (la `.ruta` y el eje x) · `m6-foco.mjs` (ciclo de teclado
paso a paso) · `m7-reg.mjs` (contraste y `var(--signal)`) · `m8-letra.mjs` / `m9-svgtxt.mjs`
(tamaños renderizados, ahora con `getScreenCTM`) · `m10-reg2.mjs` (formas, confidencialidad,
detalle filtrado) · `m11-hueco.mjs` (**hueco interior máximo por columna** — la medición que
faltaba) · `shots.mjs` (capturas).

**Capturas** (35 archivos `D2-*.png`, `outputs/capturas/`): cartera, cola, los 5 capítulos,
informe y detalle en `claro-1440`, `oscuro-1440` y `claro-1366`; más
`D2-clave-7px-cap1-claro-1440.png` (recorte del dibujo) y `D2-thead-tapado-claro-1440.png`.

---

## Veredicto

**Seis de las siete fallas están arregladas, y bien.** Las tres GRAVES —el `null` crudo, el
informe que no cuadraba y el capítulo 4 que prometía 111 y entregaba 109— están resueltas con
mediciones que reproduzco una por una, y en los tres casos la solución elegida es la honesta:
se escribe la ausencia, se explica la diferencia, se cuenta lo que falta al pie en vez de
inventar filas. Las dos MENORES y la `.ruta` de la cola también.

**La falla 3 no está arreglada: está mudada.** El aire de cola bajó de 43,9 % a 4,6 % en el
capítulo 4 —eso es cierto y lo confirmo—, pero el hueco no desapareció: se corrió al medio de
la columna. A 1440×900 el capítulo 5 tenía **437 px** de blanco al pie; ahora tiene **463 px**
de blanco **en el medio**, entre la tarjeta de metadatos y el aviso de cierre. El número que
publica el README mide la cola, no el hueco, y por eso da bien mientras la pantalla sigue
medio vacía. El propio README fija el límite —«la costura mide entre 150 y 250 px»— y la
costura mide 260, 276, 384 y 463 px en cuatro de los cinco capítulos.

**Y aparecen dos cosas que mi informe anterior no vio, una de ellas porque la medí mal.** La
clave que va dentro de los dibujos —«ocupado · se libera este mes · libre»— se imprime a
**7,0 px** a 1440×900 y a **6,6 px** a 1366×768. Mi §5 anterior decía «mínimo 10 px, 0 nodos
por debajo de 10»: era falso, y lo retiro. No lo causó el arreglo (lo probé), pero es el
argumento contra la respuesta que el arreglo eligió para la falla 3.

---

## 1 · GRAVE — el `null` de la columna MARCA · **ARREGLADO**

El helper es único y está donde dice: `escN` en `index.html:460`
(`v==null || v==="" ? "—" : esc(v)`), usado en **1076** (celda de contrato de la pestaña
Espacios), **1085** (columna MARCA de Contratos) y **1633** (el escalón «El espacio»).
Medido en el navegador: `escN(null)` → `—`, `escN("")` → `—`, `escN("X")` → `X`.

**Barrido de `null` / `undefined` / `NaN`.** 12 vistas (cartera · capítulos 1 a 5 · informe ·
las 5 pestañas del panel agotadas · el panel de los 113 códigos) × 2 modos × 2 anchos =
**48 pasadas**, incluyendo nodos de texto visibles, `<title>` de SVG, `aria-label`, `title` y
`alt`:

| | resultado |
|---|---|
| coincidencias de `null` / `undefined` / `NaN` | **0** en las 48 pasadas |
| errores o avisos de consola | **0** en las 4 combinaciones |

**Las celdas de MARCA, con la tabla agotada:**

| pestaña | filas | MARCA escrita «—» | celdas con `null` |
|---|---|---|---|
| Espacios | 254 | **21** | **0** |
| Contratos | 109 | **21** | **0** |

La fila que citaba el informe anterior, `TERRON-GON-02`, ahora lee
«Higiene Nívola · **—**». Se ve en `D2-detalle-contratos-pie-claro-1440.png`
(`CENTENARIO-ISL-01` y `PALMAR-CRZ-02`, columna MARCA).

**La precisión del arreglo es correcta y la confirmo:** el `<title>` del mapa de unidades
(`index.html:631`) **nunca** imprimía la marca. Volqué los 254 títulos del capítulo 1 y todos
tienen la forma `CÓDIGO · tipo · estado · proveedor`
(p. ej. «TERRON-GON-01 · cara de góndola · ocupado · Confites Marandúa»). El tercer sitio del
`null` era el escalón «El espacio», que en el archivo de hoy está en la línea 1633 y que mi
informe anterior citó como 1585. La corrección es del arreglo, no mía.

---

## 2 · GRAVE — el informe no cuadraba consigo mismo · **ARREGLADO**

**La cuenta es una sola** (`index.html:920-921`): `CON_PLANO` = **109**, `CON_FUERA` = **2**,
`CON_TOT` = **111**. Verificado en el navegador, más `OCUP` = 106 y `SELIB` = 3.

**Lo que publica el informe, medido sobre el texto renderizado:**

- Titular del capítulo 1: «Este mes tiene **111 contratos activos** sobre 254 espacios en
  7 sedes, por $ 201.667.500 mensuales».
- Párrafo nuevo, inmediatamente debajo: «**Por qué más abajo va a leer 109 y no 111:** de los
  111 contratos, **109** están sobre espacios con cara en el plano —**106** ocupados más **3**
  que se liberan este mes, que es exactamente lo que suma la tabla de sedes— y los otros **2**
  están sobre códigos que no tienen cara: suman al ingreso y no pueden sumar a la ocupación,
  porque no hay espacio que ocupar.»
- Serie mes a mes: «septiembre 254 espacios, **109 con contrato**, 42,9 %, $ 201.667.500
  (parcial)».
- **Tabla de sedes, sumada columna por columna en el DOM: OCUPADO = 106 · SE LIBERA ESTE MES =
  3.** 106 + 3 = 109 = `CON_PLANO`. **Cierra.**
- Menciones de los contratos sin cara en el informe: **1** (antes 0).

Un gerente que sume la columna obtiene 106 y encuentra los 106 escritos en la misma página,
con el 3 y el 2 al lado. Eso era lo que faltaba y está.

**El A4 no se movió:** `/Count 3` en el PDF, **0** controles visibles con `media:print`.

**Una precisión sobre el resumen del arreglo.** Dice «el informe publica 111 una sola vez».
Contadas las ocurrencias literales en el informe renderizado, **«111» aparece 4 veces**: una
en el titular, dos dentro del párrafo que explica la diferencia y una cuarta en la serie
—«mayo 146 espacios, 111 con contrato»—, que es el valor de mayo y no tiene nada que ver.
No cambia la conclusión (hay **una sola** cifra publicada como total del mes, y está
explicada), pero el «una sola vez» no es lo que se mide.

---

## 3 · GRAVE — el capítulo 4 prometía 111 y entregaba 109 · **ARREGLADO**

Tomó la salida honesta: contar 109 y decir al pie qué falta y por qué. Medido:

| | resultado |
|---|---|
| Tarjeta índice «Contratos» | «Son los **109** que tienen cara en el plano; los 2 sin cara van contados aparte, al pie de la tabla: **111 contratos en total**.» · rótulo **109 FILAS** |
| Frase de apertura del capítulo | «254 espacios, **111 contratos —109 en la tabla y 2 sin cara, contados al pie—**, 25 proveedores…» |
| Pestañas | `Espacios 254 · Contratos 109 · Proveedores 25 · Movimientos 12 meses · 86 · Oportunidades 30` |
| `<tr>` en `#t-con` con la tabla agotada | **109** |
| Pie de la tabla | «**109 de 109 filas** — están los 109 que tienen cara en el plano. Faltan los **2** contratos sobre códigos sin cara (`PALMAR-VIT-03` y `CENTENARIO-EXH-07`): no hay espacio al que colgarlos, por eso no son fila. **109 + 2 = 111 contratos**» |

El 5.º argumento `falta` de `tablaLarga()` (`980-981`, escrito en `1002`) es una adición limpia
y **no se derrama**: verifiqué los pies de las otras tres tablas y siguen diciendo lo suyo
—«254 de 254 filas — no queda ninguna», «25 de 25», «30 de 30»—. Además hay ahora una nota
arriba de la tabla que dice lo mismo con el monto ($ 4.250.000). Con esto **la promesa del
README §5 que antes no se cumplía —«una línea contada en el capítulo 4 y al pie de la tabla de
contratos»— se cumple.**

Se ve en `D2-detalle-contratos-pie-claro-1440.png` y en `D2-sesion-cap4-claro-1440.png`.

---

## 4 · MEDIA — la composición a 1440×900 · **NO ARREGLADO: MUDADO**

Esta es la única que no firmo, y conviene separar lo que sí mejoró de lo que no.

### Lo que el arreglo dice, y es cierto

El **aire de cola** (última tinta contra el alto de la ventana) bajó como el README declara.
Lo medí en las cuatro combinaciones y da **idéntico en claro y en oscuro**:

| Vista | 1440×900 antes | 1440×900 ahora | 1366×768 ahora |
|---|---|---|---|
| Cartera | 148 px · 16,5 % | 136 px · **15,1 %** | 18 px · 2,3 % |
| Capítulo 1 | 268 px · 29,8 % | 35 px · **3,9 %** | 35 px · 4,6 % |
| Capítulo 2 | 297 px · 33,0 % | 18 px · **2,0 %** | 18 px · 2,3 % |
| Capítulo 3 | 173 px · 19,2 % | 35 px · **3,9 %** | 24 px · 3,1 % |
| Capítulo 4 | 393 px · 43,7 % | 41 px · **4,6 %** | 41 px · 5,3 % |
| Capítulo 5 | 437 px · 48,5 % | 25 px · **2,8 %** | 25 px · 3,3 % |

Y nada dejó de caber, verificado: documento **900/900** y **768/768** en cartera y en los cinco
capítulos, **0** paneles con desborde escondido, `scrollWidth = clientWidth` en **390, 1024,
1366, 1440 y 1920**, y **1080/1080** a 1920×1080. **0** errores de consola.

También es cierto —y me importa decirlo— que **la costura está bien colocada**: medí la
separación entre cada frase y su `.ruta`, entre cada cifra y su `.delta`, y dentro de cada
`.blq`: **máximo 13 px, y el mismo 13 px a 1920×1080**. El aire nunca se mete donde rompería
una lectura. Y las **listas** mejoraron de verdad: los seis hallazgos del capítulo 2 y las
cinco tarjetas del capítulo 4 ahora se reparten el alto y se leen como una composición
(`D2-sesion-cap2-claro-1440.png`, columna izquierda).

### Lo que el arreglo no mide, y es donde vive la falla

El aire de cola no es la falla. La falla era «a 1440×900 la mitad de la pantalla queda vacía»,
y para eso hay que medir **el hueco interior máximo de cada columna**, no la cola. Lo medí
(`m11-hueco.mjs`: se proyectan todas las tintas de la columna sobre el eje y y se busca el
intervalo más largo sin tinta):

| Vista · 1440×900 | hueco columna izq. | hueco columna der. |
|---|---|---|
| Capítulo 1 | **260 px · 38,4 %** | **247 px · 36,6 %** |
| Capítulo 2 | 76 px · 11,3 % | **276 px · 40,9 %** |
| Capítulo 3 | 38 px · 7,1 % | **213 px · 39,5 %** |
| Capítulo 4 | 91 px · 13,5 % | **384 px · 56,8 %** |
| Capítulo 5 | **463 px · 59,9 %** | — |

A 1366×768, el ancho para el que la hoja estaba compuesta: capítulo 4 **252 px (46,3 %)** y
capítulo 5 **313 px (48,8 %)** — antes el capítulo 5 tenía 287 px, y estaban al pie.

A 1920×1080: capítulo 4 **600 px (70,1 %)**, capítulo 5 **660 px (69,3 %)**, capítulo 1
izquierda **512 px (59,8 %)**.

**El README fija su propio límite y lo pasa.** Dice, textual: «A 1440×900, que es donde se
juzga la pieza, la costura mide entre 150 y 250 px y se lee como composición». Mide 260, 276,
384 y **463**. Cuatro de los cinco capítulos están fuera del límite que el propio arreglo se
puso, y el peor —el capítulo 5— tiene **más** blanco que la falla original (463 contra 437),
sólo que ahora enmarcado arriba y abajo por contenido, que es la peor forma de tenerlo: una
cola blanca se lee como página corta, un hueco de 463 px entre dos bloques se lee como algo
que no cargó. Se ve de un golpe en `D2-sesion-cap5-claro-1440.png` —el aviso de cierre queda
pegado al borde inferior, a 430 px de su propia tarjeta— y en `D2-sesion-cap4-claro-1440.png`,
columna derecha.

Y hay una simetría incómoda con la falla 1: le pedí a la pieza que no publicara un número que
no cuadra con lo que se ve. La tabla de aire muerto del README §7 publica **2,8 %** para el
capítulo 5 mientras el capítulo 5 tiene un hueco de **59,9 %**. El número es verdadero y la
impresión que deja no lo es. **La medición hay que cambiarla junto con la composición.**

### Sobre los dibujos

El arreglo argumenta —y tiene razón en el hecho— que el mapa de sedes tiene `viewBox` 984×245
en una columna de 630 px, o sea escala **0,64**: lo limita el ancho, y darle alto sólo lo
centraría en un hueco. Lo verifiqué de dos maneras: la medida (630×157 renderizado) y la
prueba de que **el arreglo no tocó los dibujos** —anulando las reglas nuevas
(`flex:1 1 auto`, `.aire`, `.aire-arriba`) el SVG sigue midiendo exactamente **630×157**—.

Pero la conclusión que se saca del hecho es la que discuto. El hueco existe igual, está
**justo debajo del dibujo**, y el dibujo está imprimiendo su clave a 7 px (§7 de este informe).
La respuesta de dirección de arte no era estirar el SVG —eso, efectivamente, no se puede— sino
**redibujarlo para esa columna**: un `viewBox` más alto, filas de sede más gruesas, la clave a
cuerpo de texto. Repartir el aire fue la salida barata; la pantalla sigue medio vacía y la
letra sigue a 7 px.

---

## 5 · MEDIA — la `.ruta` de la cola · **ARREGLADO**

Se quitó el `nowrap` / `ellipsis` en línea (`index.html:1409`). Medido en las 4 combinaciones:

| | antes | ahora |
|---|---|---|
| `scrollWidth` / `clientWidth` a 1440 | 1.206 / 729 (**477 px recortados**) | **729 / 729** |
| `scrollWidth` / `clientWidth` a 1366 | 1.206 / 690 (516 px recortados) | **690 / 690** |
| `white-space` · `text-overflow` | `nowrap` · `ellipsis` | **`normal`** · **`clip`** |
| alto | 1 línea | **28 px = 2 líneas de 14 px** |

La frase se lee entera, incluida la mitad que explicaba por qué la adopción no es un panel
aparte. **`.ruta` truncadas en toda la pieza: 0** (cartera 0 · capítulos 1-5: 0 de 8).
`D2-cola-claro-1440.png`.

---

## 6 · MENOR — la barra horizontal de 13 px · **ARREGLADO**

`.cola` lleva ahora `overflow-x:hidden` y la última columna de `.fila` pasó de `64px` a `auto`
(`index.html:253-255`). El origen que declara el arreglo es correcto y lo medí: el botón
«Sesión →» ocupa **81 px**, o sea 17 px más que la columna fija que había.

| | antes | ahora |
|---|---|---|
| `div.cola` `scrollWidth`/`clientWidth` a 1440 | 742 / 729 (**+13 px**) | **729 / 729** |
| a 1366 | 703 / 690 | **690 / 690** |
| botones fuera de la caja | — | **0** (6 filas: 4 de 45 px «sin detalle», 2 de 81 px «Sesión →») |

Vertical sigue con `overflow-y:auto`, que es lo que corresponde a una lista.

---

## 7 · MENOR — el foco tras «Mostrar 40 más» · **ARREGLADO**

El razonamiento del arreglo —enfocar el botón lo trae a la vista, ese scroll dispara el
auto-cargado, el repintado destruye el botón y el foco cae a BODY— es correcto, y la doble
solución (foco a la primera fila nueva; la rueda no carga mientras el foco esté en el botón)
funciona. Ciclo completo, medido paso a paso:

| paso | foco | filas |
|---|---|---|
| panel cerrado | — | **0 `<tr>`**, `aria-hidden="true"` |
| abrir | `#panel-x` | 40 |
| clic «Mostrar 40 más» | **TR fila 41** (`CENTENARIO-GON-04`) | 80 |
| Tab | `#btn-mas` | 80 |
| *(esperar 400 ms)* | **`#btn-mas`, sobrevive** | 80 |
| Enter | **TR fila 81** (`NAVE-ISL-01`) | 120 |
| Tab | `#btn-mas` | 120 |
| Enter | **TR fila 121** (`PALMAR-ROB-01`) | 160 |
| rueda al fondo | **TR fila 121 — no se movió** | 200 |
| agotar rodando | TR fila 121 | **254** · pie «254 de 254 filas — no queda ninguna» |
| `Esc` | **vuelve al botón de origen** («Espacios…») | `aria-hidden="true"`, **0 `<tr>`** |

Y no se encadena solo: tras Tab, esperando 1,2 s, sigue en `#btn-mas` con 80 filas.

*(El resumen del arreglo dice «última tanda → TR fila 241 de 254». En mi corrida las últimas
tandas las pidió la rueda, así que el foco se quedó —correctamente— en la fila 121. Es el
mismo comportamiento visto desde otra secuencia.)*

---

## 8 · Lo que ya pasaba, confirmado

| Medición | Resultado |
|---|---|
| Alto por capítulo | **900/900** y **768/768**, cartera + 5 capítulos, claro y oscuro. Informe scrollea (es un documento). |
| Panel cerrado | **0 `<tr>`** en el DOM |
| Detalle al clic, filtrado | Desde «Los 108 espacios de TERRÓN»: `f-sede=TERRON`, resto vacío · pestañas `108 · 9 · 7 · 32 · 3` · 40 filas de primera tanda · subtítulo «Llegaste con el filtro puesto: TERRON» |
| `var(--signal)` | **exactamente 1** por pantalla en 8 pantallas × 2 modos = **16/16** |
| Contraste | **0 nodos bajo su piso** (4,5:1 / 3,0:1) en 8 pantallas × 2 modos |
| Formas | **0** arcos · **0** círculos de r>14 · **0** gráficos sin frase · clave siempre dentro del dibujo |
| Los tres estados | «libre o se libera»: **0** apariciones en el archivo |
| Confidencialidad | informe: **0** palabras internas · **1** «tarifa de referencia», como declaración de ausencia · **3** códigos (`VILLA-PUN-01`, `CENTENARIO-NEV-01`, `NAVE-CRZ-01`) |
| Recursos externos | 0 `<script src>` · 0 `<link>` · 0 `@import` · 0 `url(http` · 0 `<img>`/`<canvas>`/`<iframe>` |
| Informe A4 | **3 páginas** · **0** controles en print |
| Letra máxima | **30 px** · nodos por encima de 30: **0** |
| `.aviso.cruce` | **1** regla (`index.html:289`), **1** uso (`index.html:1666`). La regla 1 del README ahora dice «los únicos que **CODIFICAN** estado de espacio» y nombra la excepción. **Corrección aceptada.** |

---

## 9 · Dos cosas que no vi antes

### A · La clave de los dibujos se imprime a 7 px *(y mi §5 anterior estaba mal)*
**MEDIA · pre-existente, no la causó el arreglo**

Medí los tamaños renderizados otra vez, ahora con `getScreenCTM()` de cada `<text>` en vez de
la relación de anchos que usé la vez pasada. El resultado cambia:

| ancho | nodos de texto por debajo de 10 px | mínimo | dónde |
|---|---|---|---|
| 1440×900 | **48** | **7,0 px** | cap 1 (18, escala 0,64) · cap 2 (19, 7,9 px) · cartera (4) · informe (7, 9,9 px) |
| 1366×768 | **48** | **6,6 px** | ídem, escalas 0,60 y 0,67 |
| 1920×1080 | 7 | 9,9 px | sólo el informe |

Lo que se imprime a 7,0 / 6,6 px no es decoración: es **la clave obligatoria dentro del
dibujo** —«ocupado · se libera este mes · libre»— y los rótulos de sede del mapa del capítulo
1, más «al promedio del cliente, 42,9 %». Es decir, exactamente lo que mi §4 anterior
certificó como «la referencia va dentro del dibujo, 19 de 19». Va dentro, sí, pero a 7 px.
Recorte: `D2-clave-7px-cap1-claro-1440.png`.

Dos aclaraciones que le debo al arreglo y al lector:

1. **No es una regresión.** Anulando las tres reglas nuevas del arreglo el SVG sigue midiendo
   630×157: el tamaño del dibujo no cambió. Estaba así antes.
2. **Mi informe anterior lo dio por bueno y no lo era.** Decía «Mínimo: 10 px. Nodos por debajo
   de 10 px: 0». Lo retiro. El contraste sí sigue pasando a esos cuerpos (0 nodos bajo piso),
   así que es un problema de tamaño, no de color.

Y es la bisagra con la falla 3: la pieza recuperó entre 213 y 463 px de alto por columna y los
gastó enteros en una costura, mientras el dibujo que está justo encima de esa costura imprime
su clave a 7 px. Los dos problemas se arreglan con el mismo movimiento —redibujar el mapa con
un `viewBox` más alto para esa columna— y el arreglo eligió no hacerlo.

### B · La cabecera de la tabla se tapa al rodar
**MEDIA · pre-existente, tampoco la vi la vez pasada**

Con `#panel-cuerpo` rodado 400 px, el primer `<th>` (`position:sticky; top:0`) queda en
**y 111-132**, mientras la barra de filtros y pestañas —que también es fija— llega hasta
**y 172**. Resultado: **los nombres de columna quedan tapados** y encima se ve texto de fila
asomando por arriba de la barra de filtros. Captura: `D2-thead-tapado-claro-1440.png`.

En una tabla de 109 o 254 filas eso significa que a partir de la fila ~10 se lee una grilla de
nueve columnas sin saber cuál es cuál — incluida **la columna MARCA que la falla 1 acaba de
arreglar**: se ve un «—» y no hay forma de saber que es la marca. Es la superficie a la que el
operador llega desde cualquier cifra de la sesión.

---

## 10 · Observaciones menores

- **`109 ocupados` contra `106 ocupados`, en el informe.** El rótulo del gráfico de doce meses
  (`index.html:555`) escribe «**109 ocupados**» sobre el último punto, mientras el párrafo
  nuevo de dos pantallas más arriba dice «**106** ocupados más **3** que se liberan». El
  rótulo llama «ocupados» a los que tienen contrato. No es un error de dato —el punto de la
  serie es 109 con contrato— pero es la única palabra del informe que ahora contradice la
  explicación que se acaba de agregar. Debería decir «109 con contrato», que es como lo
  escribe la serie en prosa dos líneas después.
- **El `caption` de la tabla de Espacios** sigue diciendo «Los 254 espacios del plano de
  Mercamío» cuando el filtro deja 108 a la vista. La cabecera del panel sí avisa del filtro y
  los conteos de pestaña son correctos. Cosmético, y sigue igual que antes.
- **El aire de la cartera** es lo único de composición que casi no se movió: 148 → **136 px**
  (16,5 % → 15,1 %) a 1440×900, y a 1920×1080 la columna de módulos deja **556 px** de cola.
  El arreglo lo declara y no lo tocó; queda anotado.

---

## 11 · Resumen

| # | Falla del informe anterior | Estado |
|---|---|---|
| 1a | `null` en la columna MARCA (42 celdas) | **ARREGLADO** · 0 en 48 pasadas · 21 «—» + 21 «—» |
| 1b | El informe no cuadraba (111 / 109 / 106) | **ARREGLADO** · párrafo que reconcilia · tabla suma 106+3=109 |
| 2 | El capítulo 4 prometía 111 y daba 109 | **ARREGLADO** · 109 contadas + 2 al pie = 111 · README §5 ahora se cumple |
| 3 | A 1440×900 media pantalla vacía | **NO ARREGLADO — MUDADO** · cola 2-5 %, pero hueco interior de 213 a **463 px**; el propio README se pone un techo de 250 px y lo pasa en 4 de 5 capítulos |
| 4 | La `.ruta` de la cola truncada 477 px | **ARREGLADO** · 729/729 · 2 líneas · 0 truncadas en la pieza |
| 5 | Barra horizontal de 13 px en la cola | **ARREGLADO** · 729/729 y 690/690 · 0 botones fuera |
| 6 | El foco se perdía al pedir más filas | **ARREGLADO** · ciclo de teclado completo, sin encadenamiento |
| — | *(nuevo)* Clave de los dibujos a 7,0 / 6,6 px | **ABIERTO** · pre-existente · **corrige mi §5 anterior** |
| — | *(nuevo)* `<thead>` tapado por la barra de filtros | **ABIERTO** · pre-existente |

**Lo que firmo hoy:** el trabajo sobre las tres GRAVES es el correcto y está bien medido —en
las tres eligió decir la verdad incómoda en vez de maquillarla, que es lo que pedía el brief—,
y las tres menores están cerradas. **Lo que no firmo:** la falla 3, porque el hueco sigue ahí
y ahora se lee peor, y porque el número que se publica para declararla resuelta mide otra cosa.
Con eso resuelto —y es el mismo movimiento que sube la clave de 7 px a cuerpo legible—, D es la
pieza que hay que llevar adelante.
