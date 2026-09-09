# Las tres opciones, medidas — dirección de arte

**Fase 11 · RECABRA · 2026-09-07.** Comparación de
`opciones/A-el-informe`, `opciones/B-el-tablero-de-asesoria` y
`opciones/C-la-conversacion` contra `brief.md` (en especial §3, §3b, §6 y §8) y
`outputs/guion.md`.

**No elijo.** Acá está lo que aporta cada una, lo que se lleva contra las seis
preguntas del dueño, qué le injertaría a cada una, y las mediciones con las que
sostengo todo lo anterior.

---

## 0. Cómo se midió

Playwright con `chromium-1194` (`executablePath
/opt/pw-browsers/chromium-1194/chrome-linux/chrome`), sobre el `file://` de cada
`index.html`, sin red.

- **Capturas** (18 archivos en `outputs/capturas/`, más 9 de página completa):
  cada opción × cada pieza (cartera · sesión · informe) × 1440×900 en claro y en
  oscuro (con el *toggle* real, no `prefers-color-scheme`) × 1366×768 en claro.
- **Recorridos**: en B, además, los 5 capítulos de la sesión se abrieron uno por
  uno (`[data-cap]`) y se hizo scroll dentro de los paneles con desbordamiento
  propio, porque la hoja no crece; en A y C se barrió la página entera.
- **Impresión**: `page.pdf({format:'A4'})` y `emulateMedia({media:'print'})`.

Tres advertencias de método, para que los números se lean bien:

1. **B dibuja casi todo en HTML/CSS, no en SVG** (4 `<svg>` en el archivo, 7
   regiones `data-dibujo`). Las mediciones que sólo miran dentro del SVG
   (textos pisados, dos ejes) cubren 15 gráficos de A y 14 de C, pero sólo 4 de
   B; para B el equivalente se verificó a ojo sobre las capturas y con el
   detector de texto recortado del DOM.
2. **«Visible» = rectángulo > 0 y no `display:none`.** Una fila dentro de una
   caja con scroll cuenta como visible aunque haya que rodar para verla; por eso
   el conteo de códigos de A y de C da 254 (ver §2.4, donde lo desarmo).
3. El contraste se calcula contra el **primer ancestro con fondo opaco**, que es
   el papel `--bg #EFF1ED` o la tarjeta `#FFFFFF` según el caso — que es
   justamente donde `--ink-4` se cae, y es el hallazgo que reporta A.

---

## 1. La foto rápida

| | **A · El informe** | **B · El tablero de asesoría** | **C · La conversación** |
|---|---|---|---|
| Forma de la sesión | documento que se lee de arriba abajo | hoja sin scroll, 5 capítulos navegables | documento con tarjetas de acción y evidencia rotulada |
| Alto de página @1440 (cartera / sesión / informe) | 4.728 / 8.092 / 2.934 px | **900 / 900 / 900** (scroll interno) | 4.353 / **9.473** / 4.546 px |
| Gráficos (svg ≥140×50 px) | 15 (5 · 8 · 2) | 4 svg + 3 dibujos en HTML/CSS | 14 (4 · 7 · 3) |
| Peso del archivo | 324 KB | 476 KB | 275 KB |
| Páginas A4 del informe | 3 | 3 | **5** |
| Errores / warnings de consola (6 pasadas c/u) | **0 / 0** | **0 / 0** | **0 / 0** |

---

## 2. Las mediciones

### 2.1 · Jerarquía — ¿el primer texto de cada bloque es la frase-conclusión con número?

Medido de dos maneras. (a) Conteo de **frases-conclusión** visibles: elementos con
≥40 caracteres, al menos un dígito y peso ≥600 o cuerpo ≥15,5 px. (b) Para cada
gráfico y cada tabla, si hay una de esas frases arriba, a menos de 520 px.

| | frases-conclusión | gráficos+tablas | sin frase arriba | residuo real |
|---|---|---|---|---|
| A cartera | 9 | 11 | 4 | **0** — las 4 son tablas equivalentes puestas **debajo** de su propio gráfico |
| A sesión | 16 | 20 | 8 | **2** — los paneles 2.º y 3.º de la rejilla de doce meses |
| A informe | 15 | 3 | 0 | 0 |
| B cartera | 7 | 9 | 0 | 0 |
| B sesión (5 capítulos) | 47 | 9 | 2 | **0** — tablas equivalentes plegadas bajo su dibujo |
| B informe | 8 | 2 | 1 | **0** — ídem |
| C cartera | 16 | 10 | 2 | **1** — el panel de ingreso de doce meses |
| C sesión | 27 | 21 | 2 | **0** |
| C informe | 9 | 7 | 3 | **0** |

**Los bloques que fallan, con nombre y apellido — son tres en total:**

- **A · sesión · rejilla de doce meses.** Los tres paneles comparten un solo
  rótulo, y ese rótulo **no tiene número**: «Doce meses en una sola rejilla de
  tiempo. Tres registros, tres paneles: nunca dos ejes en un mismo dibujo».
  Es una nota de método, no un hallazgo. El hallazgo sí está escrito *sobre* la
  línea («jun · +108 caras…», «may · Higiénicos Zafra cancela 6 contratos: −$ 7,2 M
  al mes», «may · el peor saldo del año: −$ 6,7 M»), que es lo que pide la regla 4
  del brief; pero la regla 2 de §3.5 del guion («ningún gráfico sin la frase de
  arriba **con su número**») queda sin cumplir en ese bloque.
- **C · cartera · panel de ingreso.** Mismo caso: el rótulo es «Y la plata, en su
  propio panel, sobre la misma rejilla de meses. Nunca dos escalas en un
  gráfico» — método, sin cifra. La anotación sobre la línea («el ingreso NO cayó
  con la ocupación») tampoco trae número.
- **C · informe · titular.** Está arriba y tiene número, pero ver §2.9.

**Nada más falla.** En las tres opciones cada capítulo, cada hallazgo y cada
recomendación abre con su frase y su cifra. B es la única con **cero** residuos
en las tres piezas.

### 2.2 · Contexto — ¿cuántas cifras van contra algo y cuántas sueltas?

Cifras destacadas = hoja visible cuyo texto **es** un número (plata, %, pts,
«148 de 254») y cuyo cuerpo es ≥16 px. «Con referencia» = en su mismo bloque hay
un contra-qué explícito (contra / benchmark / promedio / cartera / agosto / umbral
/ «X de Y» / «sin referencia»).

| | cifras ≥16 px | con referencia | **sueltas** |
|---|---|---|---|
| A (3 piezas) | 22 | 22 | **0** |
| B (3 piezas, 5 capítulos) | 22 | 21 | **1** |
| C (3 piezas) | **106** | 106 | **0** |

La única «suelta» de B es el **ordinal «1»** de la primera fila de la cola de
llamadas — un número de orden, no un dato: es un falso positivo del detector, no
un defecto.

Lo que sí distingue a las tres no es el porcentaje (las tres dan ~100 %) sino la
**densidad**: C pone 106 cifras destacadas donde A pone 22. C rotula en cuerpo
grande casi todo (los `9 / 108 · 8,3 %` de cada sede, los `41,4 % · 46 contratos`
de cada proveedor); A y B reservan el cuerpo grande para los cuatro o cinco
números del capítulo y bajan el resto a texto corrido. Ninguna de las dos
políticas incumple el brief; son dos lecturas distintas de «prioridad visible».

**Nulos, que es donde se rompe la regla 7:** las tres los cuentan aparte y
ninguna los dibuja en el cero. A: «Provisiones del Tolima · **sin referencia** ·
no tiene tarifa cargada». B: «Sin punto en el eje, contados aparte: Almacenes
Caribe y Provisiones del Tolima — sin tarifa de referencia configurada (33
contratos de la cartera sin tarifa aplicable)». C: «**Los nulos se cuentan, no se
dibujan en el cero.** 2 clientes sin tarifa configurada… 1 cliente sin dato».
Las tres, bien.

### 2.3 · Duplicados — el mismo dato dicho dos veces

Conteo de apariciones de cada token de plata/porcentaje en el texto visible de
cada pieza, y análisis de repetición **dentro de una misma fila** de la cola de
llamadas (palabras de contenido repetidas ≥2 veces en la misma fila).

Tokens más repetidos en la cartera:

| | `47,4 %` | `17,4 %` | `$ 382.107.500` | `$ 48.360.000` |
|---|---|---|---|---|
| A | 7 | 5 | 4 | 4 |
| B | 8 | 6 | 4 | 5 |
| C | 8 | 5 | 5 | 3 |

Esa repetición es sana en las tres: `47,4 %` es el «contra qué» de toda la
pantalla y aparece cada vez que se compara algo contra la cartera.

**La repetición que sí cuesta está en la fila del cliente**, y es distinta en cada
opción:

| fila | A | B | C |
|---|---|---|---|
| Tiendas La Vereda | `fantasma` ×2, `días` ×2 | `tarifa` ×4, `entrar` ×4, `activo` ×4 (fila única de 1.356 car.) | **`fantasma` ×3**, `días` ×2 |
| Provisiones del Tolima | `tarifa` ×3, `33,8` ×2 | — | `tarifa` ×2, `ocupación` ×2, `cuentas` ×2, `medir` ×2 |
| Mercamío | `42,9` ×2, `ocupación` ×2 | — | `ocupación` ×3, `42,9` ×2 |
| largo mediano de fila | 238 car. | (una sola fila envolvente) | **254 car.** |

**C es la más redundante fila por fila.** Cada cliente lleva **tres chips**
(`FANTASMA` · `CUENTA GRACIA` · `FANTASMA · 130 DÍAS SIN ACCESO`) y además la
frase «Fantasma: 39 contratos activos y 130 días sin que nadie entre; en gracia.»
La palabra *fantasma* aparece tres veces en la misma fila y *130 días* dos veces.
A dice lo mismo con un chip y una frase; B, con un chip, una frase y la
sub-línea de métricas.

**Lo demás que se dice dos veces, en las tres por igual:** el conteo de clases de
adopción (`activa 2 · fantasma 1 · dormida 1 · sin cuentas 1 · nueva 1`) va
arriba de la cola *y* como chip en cada fila. Es agregado + detalle, no
duplicación tonta, pero es la única cosa que las tres repiten a la vez y que se
podría podar de una sola manera.

**Lo que ninguna repite:** el total de $ 386.142.500 aparece **una sola vez** en
cada opción, y siempre dentro del aviso que explica por qué no existe. Las tres
resolvieron bien la trampa más grande del guion.

### 2.4 · Listas — ¿alguna lista de más de 12 códigos sin agregar?

| | máx. códigos en un contenedor | dónde | ¿tapa el resumen? |
|---|---|---|---|
| A | **254** | `<tbody>` de la tabla de espacios, capítulo 4, a y=7.490 px | no: vive en una caja con `max-height` de 420 px, ~7.500 px por debajo del titular |
| B | **17 filas a la vista** | pestaña «Espacios 254» del capítulo 4, con 4 filtros arriba | no: es una tabla paginada por scroll dentro de un panel |
| C | **254** | `<tbody>` de la tabla de espacios, capítulo 4, a y=8.839 px | no: caja con `max-height` de 420 px |

**En las tres, el ejemplo del brief está resuelto.** Ninguna imprime nunca el
texto de `recomendaciones[].explicacion`; las 113 góndolas se cuentan como
frase + reparto por sede, y los códigos se abren por sede en un `<details>` que
no se abre solo (A: 3 grupos `TERRON 96 · NAVE 12 · VILLA 5`; B: «Ver los 113
códigos» dentro de la ficha de la acción; C: «Los 113 códigos, por sede — se abre
sólo si se pide»). Las 148 oportunidades se agrupan por sede × tipo en las tres
(A y C lo dicen; C lo cuantifica: «148 oportunidades en 30 grupos»).

**Diferencia real:** en el capítulo 4, A y C **renderizan las 254 filas de una
vez** dentro de una caja con scroll. B las **filtra** (sede · tipo · estado ·
texto libre) y las reparte en 5 pestañas con su conteo en la etiqueta
(`Espacios 254 · Contratos 111 · Proveedores 25 · Movimientos 12 meses ·
Oportunidades 148`). A 300 espacios por cliente y 30 clientes, la de B es la que
escala sin pensar; las de A y C funcionan hoy pero cargan 254 filas de DOM que
nadie pidió.

**En el informe del cliente** (donde un código suelto es ruido puro):

| | códigos impresos |
|---|---|
| A | **3** (los tres contratos que vencen dentro de septiembre) |
| B | **4** |
| C | **13** — por encima del umbral de 12 |

Los 13 de C son los 9 vencimientos + los que arrastra la lista de acciones. No es
un párrafo de códigos como el que denuncia el brief §2, pero es el único informe
de los tres que pasa la docena.

### 2.5 · Formas — qué trabajo hace el dato y si la forma es la de la guía

Contra `choosing-a-form.md` y `anti-patterns.md`:

| anti-patrón | A | B | C |
|---|---|---|---|
| dos ejes en un gráfico | **0** | **0** | **0** |
| torta / anillo para una magnitud | **0** | **0** | **0** |
| arcos (`path` con comando A) | **0** | **0** | **0** |
| color cíclico / >7 clases de color | **0** | **0** | **0** |
| gráfico sin frase arriba | 2 (§2.1) | 0 | 1 (§2.1) |

**Las tres pasan las reglas duras.** Cero tortas, cero anillos, cero dobles ejes,
ni una serie codificada con un color de estado. Las tres separaron ingreso,
conteos y movimientos en paneles distintos sobre la misma rejilla de meses.

Forma por forma, donde se separan:

| dato | forma en A | forma en B | forma en C |
|---|---|---|---|
| Ocupación de la **cartera** | medidor con pista + marca de agosto comparable | medidor con marca de agosto comparable | medidor + una nota que explica **por qué** medidor y no unidades |
| Tendencia de ocupación | 2 líneas de conteo, hueco en el mes sin dato, franja del parcial | ídem | ídem, con ejes 0/164/329/493 (derivados del dato, no redondos) |
| Ocupación **por sede** | **barras** cuyo largo son los espacios, relleno = ocupados, y una **marca negra** por barra donde terminaría lo ocupado al 42,9 % del cliente | **mapa de unidades**, una marca por espacio, sedes de peor a mejor | **mapa de unidades**, igual, con hover por marca |
| Proveedores | 5 barras + «otros 20» en gris, umbral 40 % como línea rotulada | ídem, más compacto | **dos barras por proveedor** (participación en contratos y peso en plata) sobre el mismo eje de % |
| Canon vs benchmark | dumbbell ordenado por brecha, batea sin punto | dumbbell | dumbbell, con «sin contratos de este tipo — no hay brecha que medir» escrito en el eje |
| Vencimientos | riel de 60 días con hoy y fin de mes marcados | riel de 60 días + tabla | riel de 60 días **con la plata rotulada sobre cada hito** y dos colores de estado, + tabla ordenada |
| Movimientos | barras divergentes + línea de saldo neto, en el mismo panel | barras divergentes | barras divergentes con el extremo rotulado (`−$ 11.785.000`, `+$ 6.930.000`) |

Tres observaciones de forma que sí pesan:

- **La marca de referencia por barra (A).** En el gráfico de sedes, A dibuja
  dónde terminaría lo ocupado si esa sede estuviera en el promedio del cliente.
  Es la única de las tres que pone la referencia **dentro** del dibujo en vez de
  al lado; B y C dejan el promedio como texto («34,6 pts por debajo»). Es
  exactamente lo que pide brief §3b («la media del cliente») y §3.4 («anotar
  sobre el dato»).
- **Las dos barras por proveedor (C).** El guion insiste en que participación
  (41,4 % de contratos) y peso en plata (54,8 %) **son dos cosas**. A y B lo
  dicen con palabras al lado de una sola barra; C lo **dibuja**: dos barras por
  fila sobre un eje único de %. Es el hallazgo H2 hecho forma.
- **B pierde el tercer estado en dos dibujos.** En las barras por tipo del
  capítulo 2 y en las barras de sede del informe, la leyenda dice «ocupado /
  **libre o se libera**»: los tres estados de `tema.css` colapsan a dos. En el
  mapa de unidades del capítulo 1, en cambio, B sí muestra los tres. A y C
  mantienen los tres en todos sus dibujos y le ponen su fecha al «se libera».

### 2.6 · Textos pisados en los SVG

Solape de cajas de `<text>` por encima del 30 % del área menor, en las 18
combinaciones de pieza × modo × ancho:

| | A | B | C |
|---|---|---|---|
| pares de texto pisados | **0** | **0** (4 svg; el resto es DOM) | **0** |
| textos recortados o desbordados en el DOM @1440 y @1366 | **0** | **0** | **0** |

**Una salvedad para B, vista a ojo y no por el detector:** en el riel de
vencimientos del capítulo 2, la columna de código se trunca con puntos
suspensivos — `VILLA-P…`, `CE…`. Es el precio de que la hoja no crezca: la tabla
tiene que caber en el alto que le queda. El código completo está a un clic en el
capítulo 4, pero en la pantalla donde el operador está leyendo «qué se cae y
cuándo», el código está cortado.

### 2.7 · Contraste, en los dos modos

Se recorrió cada nodo de texto visible y se comparó su color contra el fondo
opaco efectivo, con el piso WCAG que le toca (4,5:1, o 3,0:1 si es ≥24 px o
≥18,66 px en negrita).

| | nodos de texto medidos (claro) | **por debajo de su piso** | ídem en oscuro |
|---|---|---|---|
| A | 478 + 6.046 + 204 = 6.728 | **0** | **0** |
| B | 464 + 301 + 222 = 987 | **0** | **0** |
| C | 494 + 5.767 + 401 = 6.662 | **0** | **0** |

Las tres, limpias. Vale la pena registrar de dónde sale eso: **A encontró y
reportó que `--ink-4` (`#68788A`) da 4,52:1 sobre blanco pero sólo 3,98:1 sobre
el papel `--bg #EFF1ED`**, que es el fondo real del documento, y movió todo su
texto a `--ink-3` (5,36:1). Es un hallazgo sobre `tema.css`, no sobre la opción:
**vale para el port, elija el dueño lo que elija.**

### 2.8 · Un solo `var(--signal)` por pantalla

Elementos visibles cuyo fondo es el amarillo de acción (`#F2B300` / `#FFD028`),
de 40×16 px para arriba, sin contar el padre si ya es amarillo:

| pieza | A | B | C |
|---|---|---|---|
| cartera | 1 — «Revisar la conexión» | 1 — «Revisar la lectura» | 1 — «Abrir la sesión de Mercamío →» |
| sesión | 1 — «Armar el informe para el cliente» | 1 — «Preparar el informe del cliente» | 1 — «Generar el informe para Mercamío →» |
| informe | 1 — «Imprimir o guardar en PDF» | 1 — «Imprimir el informe» | 1 — «Imprimir o guardar en PDF» |

**Exactamente uno en las nueve pantallas, en claro y en oscuro, en las tres
opciones.** Y en las tres es la acción que sigue en el trabajo, no un botón
decorativo. Este punto no separa a nadie: está bien resuelto tres veces.

**Donde sí se separan es en el resto del color de estado.** A usa el rojo y el
ámbar de los estados del espacio para chips que **no son estados de espacio**:
`SIN DATO` y `FANTASMA` en rosa/rojo, `COBRA POR DEBAJO`, `OCUPACIÓN BAJA` y
`SIN TARIFA` en ámbar, y `PRIORIDAD ALTA` en rojo. `anti-patterns.md` lo prohíbe
explícitamente, y el propio guion lo escribe en §4.2 («usar un color de estado
para una serie que no es estado»). C usa chips **grises** para lo mismo y deja el
rojo/ámbar/verde sólo para libre · se libera · ocupado. B queda en el medio:
chips grises en la cola, pero conserva `se libera` en ámbar dentro de las tablas,
que sí es un estado.

### 2.9 · Confidencialidad y frontera

| | menciones de «tarifa de referencia» | ¿alguna como **cifra**? | fugas internas en el informe impreso |
|---|---|---|---|
| A | 3 (cartera 1 · sesión 2) | **no** — las tres son la advertencia | **0** |
| B | 1 (cartera) | **no** | **0** |
| C | 6 (cartera 2 · sesión 3 · informe 1) | **no** | **0** |

Las tres dicen sólo la **relación** (`spread_pct`) y si existe
(`tarifa_configurada`). La aproximación de Superandes va rotulada como
aproximación en las tres («≈ $ 23.100.000/mes · sobre 72 de 74 contratos»).

Se emuló `media:print` y se buscaron en el informe las palabras internas
(*fantasma, dormida, gracia, solo lectura, suspendido, adopción, spread,
cartera*, nombres de otros clientes, `explicacion`, `_derivado_`). **Cero fugas
en las tres.** Al imprimir, las tres esconden la barra de la app: 0 controles de
navegación y 0 botones visibles en `media:print`.

### 2.10 · El validador, corrido por mí

Las tres convergieron en la misma tinta de dato del guion —`--dato #2E63C8`
claro / `#4C89E8` oscuro— así que el resultado categórico es idéntico:

```
$ node validate_palette.js "#00805A,#CE8A0A,#D8342E,#2E63C8" --mode light --surface "#EFF1ED" --pairs all
  [PASS] Lightness band · [PASS] Chroma floor
  [PASS] CVD separation      worst #D8342E↔#00805A ΔE 9.2 (protan)
  [PASS] Normal-vision floor worst #D8342E↔#CE8A0A ΔE 17.9
  [WARN] Contrast vs surface below 3:1 — relief required: [["#CE8A0A",2.54]]
  → ALL CHECKS PASS                                                  exit=0

$ node validate_palette.js "#00BE86,#F5A524,#F4544E,#4C89E8" --mode dark --surface "#0B1116" --pairs all
  [FAIL] Lightness band  outside band: [["#00BE86",0.709],["#F5A524",0.782]]
  [WARN] CVD separation  worst #F4544E↔#00BE86 ΔE 7.5 (deutan)
  → FAILED                                                           exit=1
```

El `exit=1` de la terna oscura y el `WARN` del ámbar **son de `tema.css`, no de
las opciones**: son la desviación ya documentada en el propio token file y en el
guion §4.3, y las tres la compensan igual — la palabra siempre está al lado del
color y cada gráfico tiene su tabla equivalente.

Rampas ordinales de la tinta de dato:

| rampa | opción | resultado |
|---|---|---|
| `#8FB3E8 → #2E63C8` (claro) | A, C | **PASS** · extremo claro 2,15:1 · un solo tono (4°) |
| `#2F5EA6 → #4C89E8` (oscuro) | A | **PASS** · 2,96:1 · 0° |
| `#2F5EA6 → #7FA8EC` (oscuro) | B | **PASS** · 2,96:1 · 1° |
| `#2F5EA6 → #79A3E2` (oscuro) | C | **PASS** · 2,96:1 · 0° |
| `#EAF0FB` como paso de rampa | B | **FAIL** (1,14:1 vs blanco) |

Ese último merece la aclaración: B declara un token extra, `--dato-suave`
(`#EAF0FB` claro / `#131E2E` oscuro), que **no usa como paso de dato** — lo usa
una sola vez como fondo de un panel. Como fondo está bien; como paso de rampa
reprobaría. **No está documentado en el README de B**, que es lo único
reprochable: un token de color sin su renglón en la tabla.

### 2.11 · Las piezas transversales (§5 «Transversal»)

| | selector de periodo | qué pasa al elegir otro mes | navegación cartera → sesión |
|---|---|---|---|
| A | `<select>` con los 12 meses, todos habilitados | **aviso honesto**: «El ejemplo del analista trae un solo periodo cargado (2026-09). Todo lo que se ve abajo sigue siendo de 2026-09: cambiar el rótulo sin cambiar el dato sería mentir» | **los 6 clientes abren sesión**; los 4 sin detalle abren una sesión parcial construida con las métricas de la cartera, con un aviso «ALCANCE DE ESTE EJEMPLO» y dos botones para ir a los dos que sí tienen detalle |
| B | `<select>` con los 12 meses, **11 deshabilitados** | no se puede elegir: el control dice la verdad por construcción | 2 de 6 botones «Abrir sesión →» habilitados; los otros 4, deshabilitados |
| C | **chip `<details>`** «PERIODO septiembre 2026 · parcial ▾» que explica; **no elige** | — | 2 de 6 abren; los otros 4 dicen «detalle no cargado en este ejemplo» |

Las tres son honestas. **Sólo A demuestra que el periodo manda sobre las tres
piezas** (el control reacciona y lo explica); B lo resuelve apagando lo que no
tiene dato; C declara en el README que prefirió no prometer doce periodos
navegables. Y **sólo A hace que los seis clientes de la cola lleven a algún
lado**, que es la mitad del trabajo de la pieza 1.

### 2.12 · El informe para el cliente

| | titular | medida del cuerpo | páginas A4 | códigos |
|---|---|---|---|---|
| A | «Usted tiene 148 espacios sin vender de 254.» — **762 px, 1 línea**, + 2 líneas de bajada | ~92 car./línea | 3 | 3 |
| B | «Mercamío tiene 148 espacios sin vender de 254 y $ 166.957.500 mensuales sobre la mesa…» — 2 líneas | ~105 car./línea | 3 | 4 |
| C | mismo texto — **434 px de un contenedor de 900 px, 6 líneas** | ~78 car./línea | **5** | 13 |

**El defecto de composición más claro de las tres está acá.** El titular del
informe de C ocupa el 48 % del ancho disponible y se parte en seis líneas,
dejando 466 px de papel vacío a su derecha; en la impresión A4 se ve igual. Es la
frase más importante que el gerente va a leer, y es la peor compuesta de las
tres. El cuerpo de C, en cambio, es el que mejor medida tiene (78 car./línea,
dentro del rango cómodo); el de B es el más largo (105) y el de A queda en 92.

Los tres cambios obligatorios del guion §2.ter están en las tres: fuera la
comparación contra la cartera (reemplazada por el benchmark anónimo), fuera las
palabras internas, y el titular cambia de dueño («qué gano» en vez de «a quién
llamo»).

### 2.13 · Cobertura de las 25 recomendaciones

| | a la vista | plegadas | total alcanzable |
|---|---|---|---|
| A | 6 altas, cada una con precio · candidatos · códigos por sede | «Ver las 9 de prioridad media» · «Ver las 10 de prioridad baja» | 25 |
| B | **las 25**, agrupadas por prioridad, cada una en una línea con su valor y un chevrón | el detalle de cada una | 25 |
| C | 6 altas, con las filas rotuladas (EL PRECIO · A QUIÉN · LA EVIDENCIA) | «Las otras 19 acciones — 9 medias y 10 bajas» | 25 |

---

## 3. Qué aporta cada una

### A · El informe

**Aporta el hilo.** Es la única que se lee como un documento con autor: capítulos
numerados (1.1 … 1.7 en la cartera, 1 … 5 en la sesión), una frase-conclusión de
17,5 px arriba de cada bloque y, **debajo de la frase, la ruta exacta del JSON en
monoespaciada** (`recomendaciones[id="sede_subutilizada:TERRON"] · sedes[]`).
Eso último no lo hace ninguna otra con esa disciplina y contesta sola la pregunta
2 del dueño («¿sé de dónde sale?»).

Lo mejor de A, en orden:

1. **La escalera de las 113 góndolas, entera dentro de una tarjeta.** Frase con
   sus tres lugares y su precio → `precio` (el promedio propio, contra $ 910.000
   del benchmark, «al benchmark valdrían $ 102.830.000») → `a quién` (tres
   candidatos como fichas, **Volcán tercero y con «ojo: ya tiene el 41,4 % del
   cliente» pegado al nombre**) → `dónde` (tres grupos plegados por sede). Los
   cuatro escalones del guion §2.quater, dibujados.
2. **La marca de referencia por barra** en el gráfico de sedes (§2.5).
3. **La sesión parcial para los clientes sin detalle** (§2.11): es la única que
   convierte la cola de llamadas en algo navegable de punta a punta sin inventar
   un solo número.
4. **El informe del cliente mejor compuesto** (§2.12) y el más corto: 3 páginas
   A4, un titular en una línea, tres códigos.
5. **El hallazgo sobre `tema.css`** (`--ink-4` sobre el papel), que es un
   entregable para el port además de una decisión de la opción.

### B · El tablero de asesoría

**Aporta la hoja.** Las tres piezas caben en 900 px de alto y siguen cabiendo en
768: nada crece, todo se navega. En la sesión, los cinco capítulos son cinco
paneles y el capítulo 4 son cinco pestañas con una fila de filtros arriba de las
cinco. Es la única de las tres que **no le pide al operador que recuerde lo que
quedó arriba**.

Lo mejor de B, en orden:

1. **El capítulo 4 como herramienta, no como volcado.** Filtros (sede · tipo ·
   estado · texto) **arriba de las cinco tablas a la vez**, pestañas rotuladas
   con su conteo, y la línea de frontera al pie de la tabla («todo es de sólo
   lectura, los nombres van saneados y la tarifa de referencia no aparece en
   ninguna de estas tablas»). Es la única que escala a 300 espacios sin cargar
   300 filas.
2. **Cero residuos de jerarquía** (§2.1): en las tres piezas y los cinco
   capítulos, cada dibujo tiene su frase con número arriba.
3. **La tabla «por qué el delta va contra la columna del medio»** al lado del
   titular de la cartera, con el agosto publicado tachado y no escondido. Las
   tres la tienen; B es la que la pone **en la misma respiración** que el
   titular, sin scroll.
4. **Las 25 acciones a la vista** en una sola lista ordenada por prioridad y,
   dentro de cada prioridad, por valor.
5. **El selector de periodo que no puede mentir**: los once meses sin dato están
   deshabilitados.

### C · La conversación

**Aporta el porqué.** Cada hallazgo y cada acción es una tarjeta con las filas
rotuladas: `LA EVIDENCIA` · `CONTRA QUÉ` · `POR QUÉ` en los hallazgos; `EL
PRECIO` · `A QUIÉN` · `OJO` en las acciones. Es la que más se parece a lo que el
asesor **dice en voz alta**, y la única que escribe el razonamiento al lado del
dato en vez de dejarlo implícito en el dibujo.

Lo mejor de C, en orden:

1. **La contradicción Volcán, puesta en escena.** Entre la acción 1 y la acción 2
   hay una tarjeta con borde rojo: «**Antes de llamar a Volcán, leer esto.** La
   acción 1 lo pone de candidato porque ya tiene góndola acá; el hallazgo H2 dice
   que ya pesa 41,4 %. **Las dos son correctas y se contradicen.** … Si estas dos
   tarjetas no se ven juntas, el asesor hace exactamente lo que el sistema le
   acaba de desaconsejar.» A dice lo mismo en un aviso; C lo **coloca físicamente
   entre las dos acciones que se contradicen**.
2. **Las dos barras por proveedor** (§2.5): participación en contratos y peso en
   plata, dibujadas, no narradas.
3. **El riel de vencimientos mejor rotulado** de los tres: la plata escrita sobre
   cada hito, `hoy · 7 sep` y `fin del periodo · 30 sep` marcados, dos colores de
   estado con su palabra, y debajo la tabla ordenada por fecha con el chip
   `FUERA DEL PLANO` donde corresponde.
4. **La distinción que nadie más hace explícita**: «esto NO es la recomendación
   *precio bajo tarifa*» — dispersión interna ($ 5.915.000, contra el promedio
   del propio cliente) contra posición de mercado (contra el benchmark, **sin
   cifra de valor**, porque no se puede sumar sin decidir a cuántos contratos se
   aplica). A también lo advierte; C lo separa en dos bloques con dos nombres.
5. **Chips grises**: no gasta el color de estado en clasificaciones que no son
   estado (§2.8).
6. **La mejor medida de cuerpo** en el informe (78 car./línea).

---

## 4. Qué se lleva cada una contra el brief §8

Las seis preguntas del dueño, contestadas con lo medido.

### 1. «¿Entiendo en diez segundos cómo va este cliente y qué le propongo?»

- **A:** el titular de la sesión ocupa cinco líneas a 17,5 px y está entero sobre
  la línea de flotación en 1440 y en 1366. Pero **la propuesta** («qué le
  propongo») está a 4.500 px de scroll. En diez segundos se entiende **dónde
  está**; para saber qué se le propone hay que rodar o usar el índice.
- **B:** el capítulo 1 entra completo en 900 px y el capítulo 3 está a **un
  clic** en la columna izquierda, no a 4.500 px. Es la única donde «cómo va» y
  «qué le propongo» están a la misma distancia de la mano. **Se lleva esta
  pregunta.**
- **C:** el titular es igual de claro, con una tabla de cuatro filas
  `DATO · VALOR · CONTRA QUÉ · LECTURA` que contesta las cuatro comparaciones de
  un vistazo — la lectura más eficiente de las tres en ese bloque. Pero la sesión
  es la más larga (9.473 px) y llegar al capítulo 3 cuesta más scroll que en A.

### 2. «¿Cada número está contra algo? ¿Sé de dónde sale?»

- **Contra algo:** empate técnico — 0 cifras sueltas en A y C, 1 falso positivo
  en B (§2.2).
- **De dónde sale:** **A se la lleva.** Es la única que pone la ruta del JSON en
  monoespaciada **debajo de cada frase-conclusión**, sistemáticamente
  (`cartera.clientes[mercamio].metricas · tendencia_cliente.serie[2026-08] ·
  oportunidades[]`). C lo hace en la mayoría de sus tarjetas; B lo hace en el pie
  y en notas, no bajo cada bloque.

### 3. «¿Sobra algo? ¿Hay algo dicho dos veces? ¿Hay gráficos de adorno?»

- **Adorno:** ninguna. Cero tortas, cero anillos, cero dobles ejes en las tres.
- **Dicho dos veces:** **A y B empatan arriba; C se lleva la peor nota**, por los
  tres chips por fila en la cola (*fantasma* ×3 en una misma fila, §2.3) y por
  las notas de método largas al pie de casi cada gráfico — que son excelentes
  para el director de arte y sobran para el dueño.
- **Sobra:** en A, la caja de 254 filas del capítulo 4 que se dibuja entera; en
  B, nada medible; en C, las notas de método.

### 4. «¿Puedo llegar al detalle sin que el detalle me tape el resumen?»

**B se la lleva, y con distancia.** Filtros arriba de las cinco tablas, pestañas
con conteo, 17 filas a la vista y scroll dentro del panel. A y C llegan al mismo
detalle, pero renderizando 254 filas dentro de una caja de 420 px a 7.500–8.800
px del titular. Las tres cumplen la regla (el detalle no tapa el resumen);
sólo B lo convierte en algo con lo que se trabaja.

### 5. «¿Esto se lo puedo mostrar a un gerente de supermercado tal cual?»

- **A se la lleva:** titular en una línea, 3 páginas A4, 3 códigos, cero
  palabras internas, y todo lo que un tooltip diría está escrito.
- **B:** igual de limpio y de corto (3 páginas), con la medida de cuerpo más
  larga de las tres (105 car./línea).
- **C:** el titular mal compuesto (434 px de 900, 6 líneas), 5 páginas A4 y 13
  códigos. Es el único informe de los tres que yo **no** imprimiría tal cual.

### 6. «¿Esto lo hizo alguien que entiende de alquilar metros de góndola?»

Las tres, sí, y por razones distintas:

- **A** lo demuestra con la **auditabilidad**: la ruta del dato bajo cada frase,
  la corrección de composición con el agosto publicado tachado, el desvío
  declarado respecto del guion (§3.3 dice «otros 20 · 38 contratos · 34,2 %» y el
  JSON da 43 y 38,7 %: A calcula en vivo y muestra el dato, no el texto).
- **B** lo demuestra con el **oficio de la cola**: el orden escrito arriba de la
  lista («primero lo que no se puede ver, después la plata que se puede ir este
  mes, después la plata que no está entrando»), el separador «EL RESTO PUEDE
  ESPERAR» entre el 4.º y el 5.º cliente, y la acción en cada fila.
- **C** lo demuestra con la **tarjeta de advertencia entre las acciones 1 y 2**,
  que es la única pieza de las tres que impide activamente que el asesor haga la
  llamada equivocada.

---

## 5. Qué injertaría

### A A · El informe

1. **Los chips grises de C** para señal, estado de cuenta y prioridad. Hoy A gasta
   el rojo y el ámbar de `libre/se libera/ocupado` en `FANTASMA`, `SIN TARIFA`,
   `PRIORIDAD ALTA`. Es la única regla de color que A rompe, y se arregla
   cambiando cinco reglas de CSS.
2. **El capítulo 4 de B**: filtros arriba de las cinco tablas y pestañas con
   conteo, en vez de cinco cajas con 254, 111, 25, 30 y 148 filas renderizadas.
3. **Una cifra en el rótulo de la rejilla de doce meses** (§2.1). Hoy dice «Doce
   meses en una sola rejilla de tiempo…»; debería decir lo que dice el guion:
   «De mayo a junio la ocupación cayó 35,1 puntos, de 76,0 % a 40,9 %, y no
   perdió una sola cara». La anotación ya está sobre la línea; falta la frase.
4. **El riel de vencimientos de C**, con la plata rotulada sobre cada hito.

### A B · El tablero de asesoría

1. **El tercer estado**, en las barras por tipo del capítulo 2 y en el informe:
   «libre o se libera» tiene que volver a ser dos cosas con su color y su palabra,
   como ya lo son en el mapa de unidades del capítulo 1.
2. **La escalera de A para las 113 góndolas** dentro de la ficha de la acción: hoy
   B da la frase y el reparto por sede en una línea, y manda el precio contra el
   benchmark, los candidatos y los códigos al detalle. Los cuatro escalones de A
   caben en la ficha sin romper la hoja.
3. **La ruta del JSON bajo cada frase-conclusión**, como A. B la tiene en el pie;
   bajo cada bloque contesta sola la pregunta 2 del dueño.
4. **El código completo en el riel de vencimientos** (hoy `VILLA-P…`): o se
   ensancha esa columna, o se pone el código en la segunda línea, o se muestra
   sólo la sede y el tipo. Un código truncado no sirve para nada.
5. **La sesión parcial de A** para los cuatro clientes sin detalle, en vez del
   botón deshabilitado.
6. Documentar `--dato-suave` en la tabla de color del README.

### A C · La conversación

1. **El titular del informe a todo el ancho.** Es un `max-width` mal puesto y es
   el defecto más visible de las tres opciones: 434 px de 900, seis líneas, en la
   frase que el gerente lee primero.
2. **Un chip por fila en la cola, no tres.** La palabra de la clase, y los días
   sin acceso y el estado de cuenta como sub-línea de métricas, que es lo que ya
   hace A. Elimina *fantasma* ×3 en la misma fila.
3. **Menos códigos en el informe**: de 13 a los 3 que vencen dentro del periodo,
   agregando el resto («9 contratos vencen antes del 6 de noviembre por
   $ 19.742.500»). Y con eso probablemente baje de 5 a 4 páginas A4.
4. **Una cifra en el rótulo del panel de ingreso de la cartera** (§2.1).
5. **Las notas de método, al pie de la pieza y no bajo cada gráfico.** El «por
   qué esta forma» es oro para el equipo y ruido para el dueño; hoy vive entre el
   dibujo y el siguiente hallazgo.
6. **El selector de periodo de A o de B.** El brief pide que el periodo se elija
   y que mande sobre las tres piezas; el chip explicativo cuenta la regla pero no
   la ejecuta.

### A la fusión, si el dueño mezcla

Lo que yo pondría en la lista de «esto no se toca», venga de donde venga:

- La **corrección de composición** del titular de la cartera con el agosto
  publicado **tachado y explicado** (las tres la tienen; la de B es la más
  compacta, la de A la más auditable).
- Las **tres cifras rotuladas** de valor en juego, y el total de $ 386.142.500
  **una sola vez**, dentro del aviso que dice por qué no existe.
- La **escalera de cuatro escalones** de A para cualquier recomendación de
  espacio libre, con Volcán último y su advertencia pegada al nombre.
- La **tarjeta de advertencia entre las acciones 1 y 2** de C.
- El **capítulo 4 de B**: filtros arriba de las cinco tablas.
- La **marca de referencia por barra** de A en el gráfico de sedes.
- El **riel de 60 días** con la plata rotulada de C.
- La **sesión parcial honesta** de A para los clientes sin detalle.
- Y, fuera de las opciones, **la corrección de `--ink-4` sobre el papel**, que es
  un arreglo de `tema.css` y aplica al port entero.

---

## 6. Lo que las tres resolvieron igual (para que no se confunda con un diferenciador)

- 0 errores y 0 warnings de consola en 18 combinaciones.
- 0 scroll horizontal en 1440, 1366 y 390.
- 0 textos por debajo de su piso WCAG, en claro y en oscuro, sobre 14.377 nodos
  de texto medidos entre las tres.
- Exactamente 1 `var(--signal)` por pantalla, en las 9 pantallas, en los 2 modos.
- 0 tortas, 0 anillos, 0 dobles ejes, 0 series codificadas con un color de estado.
- 0 apariciones de la tarifa de referencia como cifra; 0 fugas internas en el
  informe impreso.
- El texto de `recomendaciones[].explicacion` **no se imprime nunca** en ninguna.
- Las 25 recomendaciones alcanzables en las tres; el hueco del plano de sede
  declarado en los tres README, sin inventar geometría.
- Las tres traen la tabla completa del brief §3b en su README (44, 47 y 69 filas
  de tabla) y las corridas literales del validador.

**El dueño va a mirar tres cosas que están bien hechas.** La decisión no es de
corrección: es de **cuál forma de trabajar quiere** — leer un documento (A),
operar una hoja (B), o seguir una conversación (C).
