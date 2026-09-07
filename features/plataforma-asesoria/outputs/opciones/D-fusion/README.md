# D · La fusión — decisiones

**Fase 11 · RECABRA · 2026-09-07.** Entregable: `index.html` autocontenido con las
tres piezas (cartera · sesión · informe) navegables entre sí, con los datos de
`outputs/ejemplo.json` tal cual.

---

## 0. La decisión, en una frase

> **El operador no lee un documento ni opera un tablero: recorre cinco capítulos.
> Cada capítulo cabe en una pantalla y dice UNA cosa con el gráfico que la
> sostiene. Todo lo demás —las tablas, los 254 espacios, los 113 códigos, cada
> contrato— vive detrás de UN panel lateral al que se llega desde cualquier
> cifra de cualquier capítulo, y que llega ya filtrado por lo que se tocó.**

Eso es lo que pidió el dueño, traducido a una regla constructiva: la organización
y el UX de **C**, la presentación del dato de **A**, y el detalle que escala de
**B** — pero el detalle de B deja de ser un capítulo y pasa a ser una superficie
única a la que llegan todos los capítulos.

**La letra baja a la escala del producto** (`vender.css`): cuerpo 13,5;
frases-conclusión 15 o 17,5 en display 800; rótulos 10 en monoespaciada; la
cifra grande 30 y **una sola por pantalla**. Nada por encima de 30 px, medido.

---

## 1. Qué es de C, qué de A, qué de B

### De **C · La conversación** — la organización y el UX

| Qué | Dónde vive en D |
|---|---|
| **El rail de capítulos** a la izquierda, 5 entradas con título y subtítulo | `nav.rail` en la sesión. En C era un índice de anclas sobre una página de 9.473 px; en D es el **conmutador**: cada capítulo es un panel que se muestra solo. |
| **Las tarjetas de acción con las filas rotuladas** — `EL PRECIO` · `A QUIÉN` · `OJO` · `LA EVIDENCIA` | `panelAccion()` en el capítulo 3. La escalera es la de A (§1.2); los rótulos y el tono son de C. |
| **La advertencia entre las dos acciones que se contradicen** | `CRUCE` — la tarjeta de borde rojo va **físicamente entre la acción 1 y la 2** en la lista, no en un aviso al pie. Y además reordena: `candChips()` manda al proveedor concentrado **al último lugar** de la lista de candidatos, en la sesión y en el informe. C decía «Volcán va tercero» y lo dibujaba primero; acá lo dibuja tercero. |
| **Las dos barras por proveedor** (participación en contratos ≠ peso en plata) sobre un único eje de % | `gProveedores()`, hallazgo H2. |
| **Los chips grises** | Señal, estado de cuenta y prioridad van en gris o en tinta (`.chip`). El rojo, el ámbar y el verde son **sólo** los tres estados del espacio. |
| **El riel de vencimientos rotulado en plata** | `gRiel()`: la cifra del canon escrita **sobre** cada hito de septiembre, `hoy · 7 sep` y `fin del periodo · 30 sep` marcados. |
| **El cuadro `DATO · VALOR · CONTRA QUÉ · LECTURA`** | Capítulo 1, columna izquierda: las cuatro comparaciones de un vistazo. |
| **La nota de método que explica por qué esa forma** | Se queda, pero **debajo del gráfico y en una sola nota**, no entre el dibujo y el hallazgo siguiente (era el injerto 5 del director para C). |

### De **A · El informe** — la presentación del dato

| Qué | Dónde vive en D |
|---|---|
| **La referencia DENTRO del dibujo** | `claveSVG()`: cada gráfico lleva su clave (cuadradito + palabra) escrita adentro del SVG. Ninguno tiene leyenda HTML al lado. El umbral de concentración, el promedio del cliente, «parcial», «sin dato» y la escala del medidor también van escritos adentro. |
| **La ruta del dato en mono bajo cada frase-conclusión** | `.ruta`, 10 px en `--f-mono`, sistemáticamente bajo cada frase de cada capítulo, cada módulo, cada hallazgo y cada acción: `detalle_cliente.recomendaciones[id="sede_subutilizada:TERRON"] · sedes[]`. |
| **La marca de referencia por barra** (el injerto que el director quería conservar) | `gSedes()`: el largo es **espacios**, el relleno son **los tres estados**, y la marca negra es dónde terminaría lo ocupado si esa sede estuviera en el promedio del cliente. En TERRÓN, la distancia entre la marca y donde termina el rojo **es** el hallazgo. |
| **La escalera de cuatro escalones de las 113 góndolas** | `accEspacioLibre()`: 1 la frase con tres lugares y un precio · 2 el precio contra el benchmark · 3 los tres candidatos con el «ojo» pegado al nombre · 4 los códigos, **sólo si se piden**. |
| **Las anotaciones sobre la línea de tendencia** | `gLineas()` / `gIngreso()`: «+108 caras · plano de TERRÓN», «Higiénicos Zafra cancela 6 contratos», «−74 · Guadual ilegible», cada una en su propio carril para que no se pisen. |
| **El informe en 3 páginas A4 con el titular a todo el ancho** | Medido: **3 páginas**, titular de 30 px que ocupa **874 de 940 px (93 %)** del ancho del papel en 2 líneas. Era el defecto más visible de C (434 px de 900, 6 líneas, 5 páginas). |
| **La corrección de `--ink-4`** | `--ink-4` (`#68788A`) da 3,98:1 sobre el papel `--bg #EFF1ED`. En D **no se usa para texto**: todo el texto secundario es `--ink-3` (5,39:1). El token queda documentado en el CSS con el motivo. |

### De **B · El tablero de asesoría** — el detalle que escala

| Qué | Dónde vive en D |
|---|---|
| **Una sola fila de filtros arriba de todo lo que alcanza** (sede · tipo · estado · texto) | `pintarDetalle()`, dentro del panel. Las cinco tablas se recalculan contra **la misma rebanada**, así que los conteos siempre concuerdan. |
| **Pestañas con su conteo** | `Espacios 254 · Contratos 109 · Proveedores 25 · Movimientos 12 meses · 86 · Oportunidades 30`. Con el filtro `TERRON` puesto: `108 · 9 · 7 · 32 · 3`. |
| **El selector de periodo que no puede mentir** | `<select>` con los 12 meses, **11 deshabilitados**; el habilitado dice «septiembre 2026 · parcial» y los otros «sin snapshot» o «sin detalle cargado». |
| **Que nada crezca** | La hoja no scrollea: el documento mide exactamente el alto de la ventana en las cuatro combinaciones medidas. |

**Y una cosa que no es de ninguna de las tres:** el panel **no se abre en blanco**.
Se abre desde el gráfico, con el filtro puesto. «Los espacios de TERRÓN» abre la
pestaña Espacios con `sede=TERRON`; «los 46 contratos de Volcán» abre Proveedores
con el texto `Volcán`; «rastrear en las tablas» abre Contratos con el código del
contrato. El capítulo 4 es el único lugar que lo abre vacío.

---

## 2. «Módulo + detalle al clic», capítulo por capítulo

La regla es la misma en todas partes: **en la pantalla está la conclusión y el
dibujo; el detalle se abre al clic, sin salir de la página.** Hay dos superficies
de detalle y ninguna más:

- **el conmutador de módulos** — dentro de un capítulo, cambia el dibujo sin
  cambiar de pantalla (chips arriba del panel);
- **el panel lateral** — tablas, listas de códigos, cada contrato, cada espacio.
  Se cierra con Esc o con el fondo, y **el foco vuelve al botón que lo abrió**
  (medido).

### La cartera — «¿cómo va el negocio y a quién llamo primero?»

| Zona | Qué está a la vista | Qué se abre al clic |
|---|---|---|
| Franja del titular | La frase-conclusión con su ruta · la **única cifra de 30 px** (`$ 382.107.500`) con su delta contra agosto **a igual composición** · la corrección escrita con las cifras de agosto **tachadas** | «Las cuatro filas» → la tabla completa `agosto publicado / a igual composición / septiembre` con el porqué del cálculo |
| Cola de llamadas | Las 6 filas, con el orden como regla escrita arriba, **un solo chip de señal por fila** y las métricas + estado de cuenta + días sin acceso en una sub-línea monoespaciada | «Ordenar por plata» reordena en vivo · «Cohortes» · «Operaciones» (estados de cuenta y supresiones) · «Sesión →» por cliente |
| Módulos (5 chips) | Ocupación (medidor) · Doce meses · espacios (dos conteos) · Doce meses · plata (línea) · Quién cobra por debajo (spread) · De quién depende la cartera (conteos) | Cada módulo trae su **tabla equivalente** |

**El injerto 2 del director para C, aplicado:** un chip por fila, no tres. La
palabra *fantasma* aparecía 3 veces en la misma fila de C; acá aparece **una**,
y los 130 días viven en la sub-línea.

### Capítulo 1 · Dónde está

- **A la vista:** la frase con los cinco números · la cifra de 30 px del ingreso
  con su delta · el cuadro de cuatro filas `DATO · VALOR · CONTRA QUÉ · LECTURA`.
- **Módulos (4):** *Las siete sedes* (mapa de unidades, una marca por espacio,
  con la marca de referencia) · *Doce meses · espacios* · *Doce meses · plata* ·
  *Movimientos*.
- **Al clic:** «Los 108 espacios de TERRÓN» y «Los 145 libres del cliente» abren
  el panel filtrado; «Ver la tabla equivalente» abre la tabla del gráfico activo.

### Capítulo 2 · Qué encontramos

- **A la vista:** los **seis hallazgos como seis líneas** (chip de orden, título,
  evidencia en una línea, valor rotulado) y, a la derecha, **el dibujo del
  hallazgo elegido** — nunca los seis dibujos a la vez.
- **Al clic:** elegir otro hallazgo cambia el panel; «Ver la tabla equivalente» y
  «Los espacios de TERRÓN / los 46 contratos de Volcán / las 113 góndolas libres»
  abren el panel filtrado.

### Capítulo 3 · Qué proponemos

- **A la vista:** las **tres cifras rotuladas** del valor en juego (nunca la
  suma), el aviso del total que no existe con `$ 386.142.500` **tachado**, las
  **6 acciones altas** como seis líneas, **la tarjeta de advertencia entre la 1 y
  la 2**, y la fila `+19` para las medias y bajas.
- **A la derecha:** la escalera completa de la acción elegida.
- **Al clic:** «Los 113 códigos de caras de góndola, por sede» abre el panel con
  **el plano de cada sede** y sus códigos · «Rastrear en las tablas» · «Las otras
  19 acciones» abre la tabla de las 19.

### Capítulo 4 · Los datos detrás

Es el **índice** de la superficie de detalle, no el volcado. Cinco tarjetas
(Espacios 254 · Contratos 111 · Proveedores 25 · Movimientos 12 meses ·
Oportunidades 148 en 30 grupos), cada una con lo que trae; a la derecha, cómo se
llega ahí desde cualquier capítulo y **la línea de las dos filas que hay que
contar y no esconder** (los 2 contratos fuera del plano, `$ 4.250.000` al mes).

### Capítulo 5 · De dónde sale

Periodo, generado, cobertura del benchmark, qué está «sin dato» y por qué, qué no
sale nunca de la base del cliente, y la bitácora con el enlace al reporte de
transparencia. Al clic: los nueve endpoints, las reglas de frontera y la
corrección de composición de la cartera.

### El otro estado de pantalla · Almacenes Caribe

`arranque` **no puede convivir** con los otros seis tipos de recomendación
(`if not del_periodo: return _rec_arranque(...)`), así que es **otra pantalla, no
la misma con casillas vacías**. Y es la única sin acción amarilla: el informe son
los capítulos 1 → 3 y este cliente todavía no tiene ninguno. Se dice con esas
palabras.

---

## 3. La tabla dato → forma, con mi respuesta

Leyenda: **=** coincido con el punto de partida del brief §3b · **Δ** me aparto,
con el motivo.

| Dato | Pregunta | Trabajo del dato | Forma que le doy | Contra qué | |
|---|---|---|---|---|---|
| **Ingreso contratado del mes** (cliente y cartera) | ¿cuánto entra? | magnitud sola | **Cifra de 30 px, una por pantalla**, con la variación al lado: absoluto + %. Figuras proporcionales, no tabulares. Nunca un anillo. | mes anterior **comparable** (cartera) · agosto (cliente) | **Δ** |
| **Ocupación % · cliente** | ¿qué tan lleno está? | parte de un total | **Mapa de unidades**: una marca por espacio, agrupadas por sede, los tres estados con su palabra escrita dentro del dibujo. 254 marcas caben; a 300 también. | cartera · agosto · el promedio del propio cliente, como marca en cada fila | **=** |
| **Ocupación % · cartera** | ¿qué tan llena está la cartera? | razón contra un límite | **Medidor** con la marca de agosto a igual composición. **No unidades:** 513 marcas —3.000 con 30 clientes— no señalan ningún lugar al que ir. | agosto comparable | **Δ** |
| **Ocupación por sede** | ¿qué sede rinde y cuál no? | ranking de partes | **Barras ordenadas de peor a mejor**, largo = espacios de la sede, relleno = **los tres estados**, y una marca negra por barra en el promedio del cliente. Con barras de % ARRAYÁN (8/12) y VILLA (16/24) dibujarían lo mismo y no son el mismo negocio. | la media del cliente, **dentro** del dibujo | **Δ** |
| **Valor en juego total** | ¿cuánto vale hacer esto? | magnitud compuesta | **Tres cifras rotuladas de 21 px**, nunca una. La suma cruda (`$ 386.142.500`) aparece **una sola vez, tachada**, dentro del aviso que explica por qué no existe. | el ingreso del mes | **Δ** |
| **Tendencia 12 meses · ocupación** | ¿hacia dónde va? | cambio en el tiempo con **denominador móvil** | **Dos líneas de conteo en una sola escala de espacios** (comercializables tenue, ocupados fuerte). La ocupación se lee como la brecha. El mes sin snapshot es un **hueco rotulado**, no una recta entre vecinos. | su propio pasado | **Δ** |
| **Tendencia 12 meses · ingreso** | ¿hacia dónde va la plata? | cambio en el tiempo | **Línea en su propio panel**, misma rejilla de meses, mes parcial marcado, movimientos anotados sobre la línea. Nunca dos ejes. | su propio pasado | **=** |
| **Movimientos (entradas / salidas)** | ¿qué se ganó y qué se perdió? | flujo con signo en el tiempo | **Barras divergentes** sobre el eje de meses, entradas arriba y salidas abajo, con «entradas, arriba del cero» y «salidas, abajo del cero» escritos dentro. Se rotulan **sólo** el peor mes y el actual. | el saldo | **=** |
| **Espacios por estado** | ¿cuánto hay para vender? | conteo | **Unidades discretas**, una marca por espacio, con la palabra al lado del color. Los tres estados, **siempre tres**: nunca «libre o se libera». | — | **=** |
| **Espacios por tipo** | ¿de qué está hecho el inventario? | conteo por clase | **Barras apiladas de conteo**, ordenadas por total, con los tres estados y el canon del cliente al final de cada barra. | el total del cliente | *(agregado)* |
| **Canon promedio por tipo vs benchmark** | ¿cobra bien? | comparación contra referencia | **Dumbbell** ordenado por brecha, el más negativo arriba, la brecha en % al final. El tipo sin contratos **no dibuja punto de cliente**: dice que no lo tiene. La clave («lo que cobra Mercamío» / «promedio de la plataforma») va dentro. | benchmark de la plataforma | **Δ** (orden y nulos) |
| **Spread % (cartera)** | ¿quién cobra por debajo de lo que dice que vale? | comparación contra referencia, por cliente | **Puntos sobre un eje con el cero marcado y rotulado** («cobra lo que dice su tarifa»), negativo a la izquierda. Los nulos **se cuentan aparte, no se dibujan en el cero**. | cero | **Δ** (los nulos) |
| **Proveedores: participación %** | ¿de quién depende? | partes de un total, ranking | **Dos barras por proveedor sobre un eje único de %**: arriba contratos, abajo plata. Cinco con nombre y **los otros 20 en una sola barra gris**. Umbral de 40 % como línea negra rotulada. | el umbral de concentración | **Δ** |
| **Proveedores de la cartera** | ¿quién manda en toda la cartera? | ranking, conteo | **Barras de conteo, sin porcentaje.** La cartera publica el top 5 por cliente pero **no el total de contratos de cada cliente**: un porcentaje sin denominador publicado es un número inventado. | — | **Δ** |
| **Contratos por vencer** | ¿qué se cae y cuándo? | hechos con fecha | **Riel de 60 días** (no 90: `DIAS_POR_VENCER = 60`), con `hoy` y el **corte de fin de mes** marcados, la plata escrita sobre cada hito de septiembre y la marca cuadrada para el espacio que **ya cambió de estado**. Debajo, la tabla por fecha. | hoy · fin del periodo | **Δ** |
| **Recomendaciones** | ¿qué hago primero? | ranking por valor y prioridad | **Lista ordenada**: número + acción + evidencia en una línea + valor rotulado. La prioridad es **palabra, orden y peso**, nunca sólo color. Las 6 altas a la vista, las 19 restantes en el panel. | los tres totales del capítulo 3 | **=** |
| **Oportunidades (espacio libre + candidatos)** | ¿a quién le ofrezco qué? | asignación | **Tabla agrupada por sede × tipo** (148 filas → 30 grupos) con precio sugerido, **origen del precio** y candidatos por nombre. El grupo es la fila; los códigos y **el plano de la sede** se abren un clic más adentro. | el precio sugerido y su origen | **Δ** (el grupo es la fila) |
| **Adopción (clases)** | ¿quién no usa lo que paga? | clasificación con conteo | **No es un panel:** es el chip de señal de cada fila de la cola y los días sin acceso de su sub-línea. El conteo por clase se dice en una línea. | — | **=** |
| **Cohortes de adopción** | ¿los nuevos se quedan? | retención en el tiempo | **Tabla de 5 filas, sin gráfico.** El conteo manda («0 de 2»); el porcentaje va en gris con su `n`. Cinco puntos con n ≤ 2 dibujan una tendencia que no existe. | — | **=** |
| **Último acceso / días sin acceso** | ¿hace cuánto que no entran? | hecho con fecha | **Número de días + la palabra**, en la sub-línea del cliente. `null` = «nunca entró» o «sin cuentas creadas», no «0 días». | el umbral de 30 días | *(agregado)* |
| **Estado de cuenta** | ¿puede operar? | clasificación operativa | **Palabra en la sub-línea** de la fila; el cajón operativo completo se abre al clic. Sin color propio. | — | *(agregado)* |
| **Cobertura y metadatos** | ¿de cuánto sale esto? | metadato | **Capítulo 5** más una línea en la cabecera de cada pieza: «6 clientes, 5 leídos y 1 con error · mes en curso, parcial». | — | *(agregado)* |
| **`contratos_fuera_del_plano`** | ¿por qué no cierran ocupación e ingreso? | conteo excepcional | **Una línea contada** en el capítulo 4 y al pie de la tabla de contratos. **Nunca una categoría más del gráfico de estados.** | — | *(agregado)* |
| **Zona, cara y área m²** | ¿dónde está y cuánto mide? | atributos | **Columnas de la tabla** del panel. Jamás un gráfico. | — | *(agregado)* |
| **`benchmark_plataforma`** | ¿cuánto cobra el mercado? | referencia | **Nunca solo.** Siempre como el punto o la línea de referencia de otro dato. | — | *(agregado)* |
| **Reporte de transparencia** | ¿qué le mostramos? | documento | **Un enlace** en el capítulo 5. No se rediseña. | — | *(agregado)* |

### Los cinco desvíos, con su motivo

1. **Ocupación de cartera → medidor, no unidades.** `choosing-a-form.md`: *a
   single ratio against a limit → meter*. La forma sigue al trabajo, y el trabajo
   cambia con el nivel: en el cliente cada marca **es** un espacio al que ir; en
   la cartera no hay a dónde ir.
2. **Ocupación por sede → el largo son espacios, no el porcentaje.** Medido:
   ARRAYÁN 8/12 y VILLA 16/24 dan las dos 66,7 %. Con el largo en espacios,
   TERRÓN es una barra nueve veces más larga que ARRAYÁN y casi vacía: **es el
   dibujo del hallazgo.**
3. **Tendencia de ocupación → dos conteos, no una línea de %.** El denominador
   se mueve tres veces en cuatro meses (445 → 553 → 587 → 513). Una línea de
   porcentaje dibuja un derrumbe de 16,4 puntos que no ocurrió, y ninguna
   anotación arregla un eje que miente.
4. **Valor en juego → tres cifras, nunca una.** `Σ recomendaciones[].valor` =
   `$ 386.142.500` contra un ingreso de `$ 201.667.500`. El 1,9× no es una
   oportunidad, es un error de suma: `sede_subutilizada:TERRON` son los mismos
   espacios que `espacio_libre:gondola` + `cross` + `batea`, y
   `concentracion_proveedor` es ingreso que **ya entra**.
5. **Vencimientos → riel de 60 días, no de 90.** El backend no mira más allá
   (`DIAS_POR_VENCER = 60`). Un riel de 90 con datos de 60 dibuja un tercio vacío
   que se lee como «no hay vencimientos en noviembre», y no es cierto: es que no
   se miran.

---

## 4. El color

**Un sistema categórico y una tinta de dato. No hay paleta de series.**

| rol | claro | oscuro | dónde | token |
|---|---|---|---|---|
| espacio **libre** | `#00805A` | `#00BE86` | mapa, barras de sede y de tipo, chips | `--libre` |
| espacio **se libera** | `#CE8A0A` | `#F5A524` | ídem + la marca cuadrada del riel | `--entra` |
| espacio **ocupado** | `#D8342E` | `#F4544E` | ídem | `--ocupado` |
| **no se alquila / sin dato** | `#AAB3BE` | `#33414F` | «otros 20 proveedores», marcas apagadas del plano | `--resto` |
| **tinta de dato** | `#2E63C8` | `#4C89E8` | líneas, barras, puntos, dumbbells, medidor | **nuevo** — `--dato` |
| **tinta de dato, paso tenue** | `#8FB3E8` | `#2F5EA6` | la serie de contexto, la segunda barra, la pista | **nuevo** — `--dato-tenue` |
| **acción principal** | `#F2B300` sobre `#120E00` | `#FFD028` | **un botón por pantalla** | `--signal` |

**Las tres reglas que sostienen el color:**

1. **El rojo, el ámbar y el verde son SÓLO los tres estados del espacio.** Señal
   (`fantasma`, `sin dato`, `cobra por debajo`), estado de cuenta y prioridad van
   **grises o en tinta**. Es la regla que A rompía y C respetaba.
2. **La palabra siempre está al lado del color**, y todo relleno de estado lleva
   su `-borde`. Es la compensación que `tema.css` ya exige para la desviación del
   modo oscuro.
3. **La polaridad de los movimientos la lleva la posición, no el tono.** No queda
   un par divergente cálido↔frío libre: el candidato obvio (azul ↔ magenta
   `#C2487F`) colisiona con el rojo `ocupado` a ΔE 10,7, bajo el piso de 15.
   Arriba/abajo del cero es un canal más fuerte que el tono, y el signo va escrito.

**`--ink-4` no se usa para texto.** Da 4,52:1 sobre blanco pero **3,98:1 sobre el
papel `--bg #EFF1ED`**, que es el fondo real. Todo el texto secundario va con
`--ink-3` (5,39:1). El token queda en el CSS con el motivo escrito al lado: es un
hallazgo sobre `tema.css`, no sobre esta opción, y vale para el port.

### El validador, corrido

```
$ node validate_palette.js "#00805A,#CE8A0A,#D8342E,#2E63C8" --mode light --surface "#EFF1ED" --pairs all
  [PASS] Lightness band         all 4 inside L 0.43–0.77
  [PASS] Chroma floor           all 4 >= 0.1
  [PASS] CVD separation         worst all-pairs #D8342E↔#00805A ΔE 9.2 (protan) · tritan 4.3
  [PASS] Normal-vision floor    worst all-pairs #D8342E↔#CE8A0A ΔE 17.9 (normal)
  [WARN] Contrast vs surface    below 3:1 — relief required: [["#CE8A0A",2.54]]
  → ALL CHECKS PASS                                                            exit=0

$ node validate_palette.js "#00BE86,#F5A524,#F4544E,#4C89E8" --mode dark --surface "#0B1116" --pairs all
  [FAIL] Lightness band         outside band: [["#00BE86",0.709],["#F5A524",0.782]]
  [PASS] Chroma floor · [PASS] Normal-vision floor · [PASS] Contrast vs surface
  [WARN] CVD separation         worst all-pairs #F4544E↔#00BE86 ΔE 7.5 (deutan)
  → FAILED                                                                     exit=1

$ node validate_palette.js "#8FB3E8,#2E63C8" --mode light --surface "#FFFFFF" --ordinal
  [PASS] Lightness monotone · [PASS] Adjacent ΔL · [PASS] Light-end contrast 2.15:1 · [PASS] Single hue (4°)
  → ALL CHECKS PASS                                                            exit=0

$ node validate_palette.js "#2F5EA6,#4C89E8" --mode dark --surface "#0B1116" --ordinal
  [PASS] Lightness monotone · [PASS] Adjacent ΔL · [PASS] Light-end contrast 2.96:1 · [PASS] Single hue (0°)
  → ALL CHECKS PASS                                                            exit=0

$ node validate_palette.js "#AAB3BE" --mode light --surface "#FFFFFF"
  [FAIL] Chroma floor           below floor (reads gray): [["#AAB3BE",0.019]]
  → FAILED                                                                     exit=1
```

**Los dos `exit=1` no son defectos de D.**

- El de la **terna oscura** es la desviación ya documentada en `tema.css`
  (líneas 55-72) y en el guion §4.3: bajar la claridad para entrar en la banda
  hunde el par ámbar↔rojo a ΔE 3,5 en deuteranopía, por debajo del piso duro de
  15. Las dos compensaciones son regla en D y están medidas: la palabra siempre
  al lado del color, y cada relleno con su `-borde`.
- El del **gris `--resto`** es a propósito: reprueba el gate de croma porque
  **se lee gris, que es exactamente su trabajo**. No entra en la corrida
  categórica; se verifica con contraste WCAG, y pasa.

El `WARN` del ámbar (2,54:1 contra el papel) está cubierto: cada marca ámbar
lleva su borde `--entra-borde` y su palabra, y cada gráfico tiene su tabla
equivalente a un clic.

---

## 5. El validador de la pieza — Playwright, y qué dio

Chromium 1194 (`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`) sobre el
`file://`, sin red. Tres pasadas:

- **`val.js`** — cada pieza y cada capítulo en 1440×900 y 1366×768, claro y
  oscuro: alto del documento, alto del capítulo activo, `--signal`, letra,
  contraste, textos pisados, informe en A4, panel por tandas.
- **`val2.js`** — el barrido profundo: **los 5 módulos de la cartera + los 4 del
  capítulo 1 + los 6 hallazgos + las 6 acciones + los capítulos 4 y 5 + el cliente
  nuevo + las 5 pestañas del panel + el panel de códigos + una tabla equivalente
  + el informe**, en las 4 combinaciones de ancho × modo. **88 SVG medidos.**
- **`val3.js`** — móvil, `--signal` pantalla por pantalla, alcance de las 25
  recomendaciones, foco del teclado, frontera.

### Lo que se midió

| Medición | Resultado |
|---|---|
| **Alto del documento · cartera** | 1440×900 → **900 / 900** · 1366×768 → **768 / 768**. Cero scroll de documento, en claro y en oscuro. |
| **Alto del capítulo activo · sesión** | 1440×900 → **772 / 772** los cinco · 1366×768 → **640 / 640** los cinco. Ningún capítulo desborda; ninguna lista ni panel interno queda con scroll oculto. |
| **Textos pisados dentro de los SVG** (solape > 30 % del área menor) | **0** sobre **88 SVG** |
| **Textos que se salen de su dibujo** | **0** |
| **Tamaño de letra** | máximo **30 px**, mínimo **10 px**. Textos > 30 px: **0**. Textos < 10 px: **0**. |
| **Contraste** | **0** nodos por debajo de su piso WCAG (4,5:1, o 3,0:1 si ≥ 24 px o ≥ 18,66 px en negrita), en claro y en oscuro, sobre todos los módulos |
| **Un solo `var(--signal)` por pantalla** | cartera **1** · sesión capítulos 1-5 **1** cada uno · con el panel abierto **1** · informe **1** · sesión de Almacenes Caribe **0**, a propósito y explicado en pantalla |
| **Errores y avisos de consola** | **0** en las 4 combinaciones × todas las rutas |
| **Scroll horizontal** | **0** en 390, 1024, 1366 y 1440 |
| **Informe en A4** | **3 páginas** · titular de **30 px en 2 líneas ocupando 874 de 940 px (93 %)** · **~64 caracteres por línea** en el cuerpo impreso · **3 códigos** (`VILLA-PUN-01`, `CENTENARIO-NEV-01`, `NAVE-CRZ-01`) · **0** palabras internas (*fantasma, dormida, gracia, solo lectura, suspendido, adopción, spread, cartera*, nombres de otros clientes) · **0** controles visibles en `media:print` |
| **El panel no dibuja de una vez** | abre con **40 filas de 254**; «Mostrar 40 más» → **80**; el resto llega al rodar. Con el filtro `TERRON`: **40 de 108** y las pestañas recuentan a `108 · 9 · 7 · 32 · 3` |
| **Las 25 recomendaciones alcanzables** | **6 altas a la vista + 19 en el panel = 25** |
| **Teclado** | al abrir el panel el foco va al botón de cerrar; con `Esc` **vuelve al botón que lo abrió** |
| **`recomendaciones[].explicacion`** | el párrafo de 113 códigos **NO** aparece nunca en pantalla |
| **«tarifa de referencia»** | **5** menciones recorriendo cartera + 5 capítulos + 6 hallazgos + informe, **las cinco como la advertencia; 0 como cifra** |
| **Recursos externos** | **0** — sin `<script src>`, sin `<link rel=stylesheet>`, sin `@import`, sin `url(http…)`, sin `<img>`, `<canvas>` ni `<iframe>`. HTML autocontenido, **286 KB** |

### Cómo se reproducen

Los tres scripts viven fuera del entregable (son andamios de medición, no parte
de la pieza). El resumen literal de cada corrida es el de la tabla de arriba.

---

## 6. Qué dejé afuera, y por qué

- **El plano geométrico de la sede.** El JSON no trae coordenadas. El mapa de
  unidades es una marca por espacio agrupada por sede, y cuando se abre un grupo
  de códigos se enciende **ese** mapa con los espacios del grupo en color y el
  resto en gris. No invento geometría que no está.
- **La serie de 12 meses en el informe del cliente, como tabla.** Está el gráfico
  con su anotación y **su equivalente escrito en una línea** (cinco meses con sus
  cuatro cifras cada uno). Una tabla de 12 filas costaba media página A4 para
  decir lo que la frase ya dice, y el informe tenía que caber en tres.
- **El conteo de contratos activos de la cartera.** No existe en el endpoint. Se
  despeja (`ingreso ÷ canon promedio`) y **va rotulado con «≈» y declarado como
  derivado** en la ruta del dato. Donde no se puede rotular, no se muestra.
- **El porcentaje de participación en la cartera.** Sin el total de contratos por
  cliente no hay denominador: cinco conteos y se dice por qué.
- **La suma de las 25 recomendaciones como titular.** Aparece **una vez, tachada**,
  dentro del aviso que explica por qué no existe.
- **Los doce periodos navegables.** El ejemplo trae uno con detalle. El selector
  los muestra los doce y **deshabilita once**, diciendo cuál es «sin snapshot» y
  cuál «sin detalle cargado». Prefiero un control que no puede mentir a uno que
  promete lo que no hay.
- **La sesión parcial para los cuatro clientes sin detalle** (el injerto que A
  aportaba). En D esas cuatro filas dicen «sin detalle en el ejemplo» y no abren
  nada. Construir una sesión con las métricas de la cartera duplicaría la lectura
  del capítulo 1 con datos de otra llamada, y con la estructura de un capítulo por
  pantalla eso serían cinco pantallas de las cuales tres estarían vacías. Es el
  compromiso que asumo, y es el único injerto de la lista del director que no tomé.
