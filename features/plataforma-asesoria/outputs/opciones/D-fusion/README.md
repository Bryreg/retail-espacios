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
**13,5 es el cuerpo declarado (`body{font-size:var(--t-sm)}`), pero la pantalla
la domina 12,5**: contando nodos de texto visibles hay **249 en 12,5** (pestañas,
celdas de tabla, chips), 137 en 11,5, 108 en 10 y sólo **32 en 13,5**. La escala
es coherente y todo pasa contraste; el cuerpo, en la práctica, se lee a 12,5.

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

1. **El rojo, el ámbar y el verde son los únicos que CODIFICAN estado de espacio.**
   Señal (`fantasma`, `sin dato`, `cobra por debajo`), estado de cuenta y prioridad
   van **grises o en tinta**. Es la regla que A rompía y C respetaba. La regla es
   sobre *codificar*, no sobre *aparecer*: hay **una** ocurrencia de rojo que no
   codifica ningún dato —el filete de `.aviso.cruce` (`index.html:289`, usado en
   `index.html:1666`), la advertencia entre la acción 1 y la 2— y es deliberada:
   marca una contradicción, no un estado. Ninguna otra.
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
| **Alto del capítulo activo · sesión** | 1440×900 → **772 / 772** los cinco · 1366×768 → **640 / 640** los cinco · 1920×1080 → **952 / 952**. Ningún capítulo desborda; ninguna lista ni panel interno queda con scroll oculto. |
| **Textos pisados dentro de los SVG** (solape > 30 % del área menor) | **0** sobre **88 SVG** |
| **Textos que se salen de su dibujo** | **0** |
| **Tamaño de letra** | máximo **30 px**. Textos > 30 px: **0**. *(Esta fila decía además «mínimo 10 px, textos < 10 px: 0» y **era falsa**: medía la relación de anchos del SVG, no la escala real. Con `getScreenCTM()` el mínimo era **7,0 px**. Está corregida y remedida en **§7.8**, donde ahora da **0 textos por debajo de 10 px** y mínimo **10,99 px**.)* |
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
| **Recursos externos** | **0** — sin `<script src>`, sin `<link rel=stylesheet>`, sin `@import`, sin `url(http…)`, sin `<img>`, `<canvas>` ni `<iframe>`. HTML autocontenido, **296 KB** |

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

---

## 7. Lo que se arregló después de la verificación

Siete arreglos de la primera vuelta y **cuatro de la segunda** (§7.4 rehecho de
raíz, §7.8, §7.9 y §7.10) sobre `VERIFICACION-D.md`. Nada más del diseño se tocó.
Todo lo de abajo está medido con el mismo Chromium 1194
(`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`) sobre el `file://`, sin red,
en **1366×768, 1440×900 y 1920×1080 × claro y oscuro**.

### 1 · GRAVE — el `null` crudo de la columna MARCA *(falla 1a)*

`e.k.m` viene nulo en 21 de los 109 contratos y se interpolaba sin guarda. Ahora
toda ausencia pasa por un solo lugar:

```js
/* index.html:460 */
const escN = v => (v==null || v==="") ? "—" : esc(v);
```

Aplicado en las cuatro interpolaciones de la marca: la celda de **Espacios**
(`index.html:1076`), la de **Contratos** (`index.html:1085`), el escalón «El
espacio» de la acción (`index.html:1633`) y el texto de búsqueda de la rebanada
(`index.html:1047`, para que buscar «null» deje de traer 21 filas).

*Una precisión sobre la verificación:* el `<title>` de las marcas del mapa de
unidades **no imprimía la marca** —lleva código, tipo, estado y proveedor
(`index.html:631`)—; el tercer `null` estaba en el escalón «El espacio» de la
acción, que es la línea que `VERIFICACION-D.md` cita como `index.html:1585`. Se
barrieron igual **todos** los `<title>` de SVG y todos los `aria-label`: cero.

| Medición | Antes | Ahora |
|---|---|---|
| cadena `null` / `undefined` / `NaN` visible — **9 vistas** (cartera, capítulos 1-5, panel·espacios, panel·contratos, informe) **× 2 modos × 2 anchos** | 21 celdas en Espacios + 21 en Contratos + el escalón «El espacio» | **0 en las 36 pasadas** (nodos de texto, `<title>` de SVG y `aria-label`) |
| celdas de MARCA escritas «—» con la tabla agotada | 0 | **21 en Espacios · 21 en Contratos** |

### 2 · GRAVE — el informe no cuadraba consigo mismo *(falla 1b)*

Decía **111 contratos activos**, la serie del mes decía **109 con contrato** y la
columna OCUPADO de la tabla de sedes sumaba **106**, sin una palabra que
reconciliara los tres. Ahora los tres salen de un solo cálculo
(`index.html:920-921`):

```js
const CON_PLANO=ESP.filter(e=>e.k).length, CON_FUERA=DET.fuera_del_plano;
const CON_TOT=CON_PLANO+CON_FUERA;          // 109 + 2 = 111
```

y el informe publica **una** cuenta —111— y explica la diferencia en una línea,
con las mismas palabras del capítulo 4 (`index.html:2016` y `2021`):

> «Este mes tiene **111 contratos activos** sobre 254 espacios…
> **Por qué más abajo va a leer 109 y no 111:** de los 111 contratos, **109** están
> sobre espacios con cara en el plano —**106** ocupados más **3** que se liberan
> este mes, que es exactamente lo que suma la tabla de sedes— y los otros **2**
> están sobre códigos que no tienen cara: suman al ingreso y no pueden sumar a la
> ocupación, porque no hay espacio que ocupar.»

| Medición sobre el informe renderizado | Resultado |
|---|---|
| cifra de contratos en el capítulo 1 del informe | **111**, una sola vez |
| serie mes a mes, septiembre | **254 espacios, 109 con contrato** — el 109 que la línea anuncia |
| suma de la columna OCUPADO de la tabla de sedes (7 filas) | **106** |
| suma de la columna SE LIBERA ESTE MES | **3** → 106 + 3 = **109** = CON_PLANO |
| menciones de los contratos sin cara en el informe | **1** (antes 0) |
| A4 con `emulateMedia('print')` | **3 páginas**, **0** controles visibles — sin cambio |

### 3 · GRAVE — el capítulo 4 prometía 111 filas y la tabla entregaba 109 *(falla 2)*

Se tomó la segunda salida de las dos que ofrece la verificación: **el conteo y el
pie dicen que faltan y por qué**, en vez de inventar dos filas sin proveedor, sin
canon y sin fechas, que el JSON no trae.

- La tarjeta índice cuenta lo que la tabla entrega: `R.conF.length` = **109**
  (`index.html:1836`), y su propio texto dice que los 2 sin cara van contados
  aparte y que el total es 111.
- `tablaLarga()` acepta un quinto argumento `falta` (`index.html:980-981`) que el
  pie escribe cuando la tabla se agota (`index.html:1002`). La tabla de contratos
  lo usa (`index.html:1088`).
- La frase de apertura del capítulo desglosa: «254 espacios, **111** contratos
  —**109** en la tabla y **2** sin cara, contados al pie—…» (`index.html:1845`).

| Medición con el panel abierto sin filtro | Resultado |
|---|---|
| pestañas, con su conteo | `Espacios 254 · Contratos 109 · Proveedores 25 · Movimientos 12 meses · 86 · Oportunidades 30` |
| `<tr>` en la tabla de contratos, agotada | **109** — el mismo número de la pestaña y de la tarjeta |
| pie de la tabla de contratos | «109 de 109 filas — **están los 109 que tienen cara en el plano. Faltan los 2 contratos sobre códigos sin cara (`PALMAR-VIT-03` y `CENTENARIO-EXH-07`): no hay espacio al que colgarlos, por eso no son fila. 109 + 2 = 111 contratos**» |
| pie de las otras cuatro tablas | «254 de 254 filas — no queda ninguna» (sin cambio: no falta nada) |

Esto además cumple lo que la tabla de §3 ya declaraba para
`contratos_fuera_del_plano` («una línea contada en el capítulo 4 **y al pie de la
tabla de contratos**») y que antes no existía.

### 4 · MEDIA — el hueco interior de cada columna *(falla 3, segunda vuelta)*

**Lo que estaba mal, y por qué el número anterior no lo decía.** El primer arreglo
empujó las tarjetas hasta abajo y publicó el **aire de cola** —la última tinta
contra el borde de la ventana—, que bajó de 43,9 % a 4,6 %. Cierto, y engañoso: el
blanco no se había ido, se había mudado al medio. La medida que manda es el
**hueco interior máximo por columna**: se proyectan todas las tintas de la columna
—texto y cada primitiva de cada SVG— sobre el eje y y se busca el intervalo más
largo sin tinta. Con esa vara, el capítulo 5 tenía **463 px** de blanco entre la
ficha de metadatos y el aviso de cierre, más que los 437 px de cola de la falla
original, y peor de leer: una cola blanca se lee como página corta; un hueco de
463 px entre dos bloques se lee como algo que no cargó.

**El movimiento: redibujar cada dibujo para su columna.** El mapa de sedes tenía
`viewBox` 984 × 245 metido en 630 px de columna: escala **0,64**, el ancho lo
limitaba y el alto no entraba en la cuenta. Ahora **el viewBox se arma con la caja
real**, medida después de montar el HTML (`figSlot()` deja el hueco,
`pintarFiguras()` lo mide y lo pinta). De ahí salen las dos cosas a la vez:
**1 unidad = 1 px** —el texto declarado a 11 px se imprime a 11 px, ver §7.8— y el
alto disponible se gasta **dentro del dibujo**.

Qué se redibujó, y por qué:

| Dibujo | Antes | Ahora | Por qué |
|---|---|---|---|
| **Mapa de sedes** (cap. 1 · módulo «Las siete sedes», y el cliente nuevo) | rótulo a la izquierda (96 u.) + cuenta a la derecha (126 u.) = **222 de las 984 unidades, el 23 % del ancho**, gastado en texto; filas de 19 u. = **12 px reales** | **rótulo de sede y cuenta ARRIBA de su fila**; las marcas se quedan con el ancho entero, y el alto sobrante engorda las filas: **9 px a 1366** (donde no sobra nada), **26 px a 1440**, **36 px a 1920** (el techo) | el rótulo lateral era un impuesto de ancho en la columna angosta; subiéndolo, la marca por espacio pasa de 5 u. a escala 0,64 (**3,2 px reales**) a **3,8 px a 1366 y 4,1 px a 1440**, y el largo de la fila sigue siendo el conteo |
| **Barras de sede** (cap. 2 · H1 y el informe) | nombre a la izquierda (104 px) y cuenta a la derecha (150 px); barras de 15 px | mismo movimiento: **nombre y cuenta arriba**, barra sobre el ancho completo y de hasta **30 px** de alto según lo que sobre | idéntico argumento; además la barra de TERRÓN (108 espacios) ya no queda comprimida por los márgenes de texto |
| **Riel de 60 días** (cap. 2 · H4) | eje a 76 px del tope, dos carriles fijos de 16 px | eje al **56 % del alto** y carriles que se reparten hasta 58 px, con **techo de 300 px**: un eje de fechas no gana con más alto | lo que sobra de ese techo lo reparte la tarjeta, no una costura |
| **Medidor de la cartera** | banda de 22 px | banda de hasta **230 px** | es una razón contra un límite: una banda gruesa la dice igual de bien y se come el sobrante de su columna |
| **Los otros ocho** (líneas de 12 meses, ingreso, movimientos, proveedores, dumbbell, spread, barras de conteo, tipos) | alto fijo | **alto de la caja**; filas, barras y área de trazado se reparten el sobrante | misma regla |
| **Los tres del informe** | `viewBox` 880 en una caja de 874 → escala 0,993 y texto a 9,9 px | `viewBox` **874 × 252 · 874 × 200 · 874 × 258**, escala **1,000** | el informe es documento: el alto es fijo (y 11 px menor que antes, para no tocar las tres páginas A4) |

Dos consecuencias de dibujar a la medida de la caja, y las dos son arreglos:

- **el margen del rótulo lo pide el nombre más largo, no una constante**
  (`margenRot()`): en 1440 los 200 px fijos del ranking de proveedores sobraban y
  en una columna angosta el nombre se salía del dibujo;
- **ningún rótulo se sale de su caja** (`rotulo()`): un valor pegado a su punto va
  a la derecha si entra, a la izquierda si no, y arrimado al borde si no entra de
  ningún lado; y las notas al pie se dicen enteras si caben y en su versión corta
  si no (`cabe()`), porque media frase cortada no dice nada. **Textos fuera de su
  dibujo: 0** en 390, 1024, 1366, 1440 y 1920, recorriendo todos los estados.

Y el sobrante que ningún dibujo puede absorber ya no se junta en una costura: se
reparte entre **todas** las juntas de la tarjeta.

```css
.cap .col>.caja,.cap .col>.panelito,.cap .col>.lista{flex:1 1 auto}
.cap .lista>.item{flex:1 1 auto;align-content:center}
.panelito{justify-content:space-around}      /* n juntas, no una */
.panelito>.esc{flex:1 1 auto;justify-content:space-evenly}
.comp.crece>table{height:100%}               /* el sobrante engorda las filas */
.pie.crece{flex:1 1 auto;align-content:space-between}
```

Las clases `.aire` y `.aire-arriba` —la costura única del arreglo anterior— **se
eliminaron**.

**Capítulo 5.** Era el peor (463 px) porque su ficha de metadatos tenía seis
casillas y el aviso de cierre estaba clavado al borde inferior. Ahora la ficha
crece a **doce casillas de metadatos reales del guion** —periodo, **fecha de
corte**, generado, **sedes leídas**, **contratos leídos**, **códigos sin cara**,
**criterio de «se libera»**, ventana de vencimientos (`DIAS_POR_VENCER = 60`),
cobertura del benchmark, sin dato, lo que nunca sale de la base y **quién lo
preparó y quién lo va a ver**— repartidas en cuatro filas que se estiran con la
tarjeta; y el aviso de cierre va **pegado a lo que lo precede**, no al borde.

#### Hueco interior máximo por columna — **hueco** · cola secundaria

Medido con Playwright sobre el `file://`, sin red, proyectando **texto + toda
primitiva SVG** de cada columna sobre el eje y, recorriendo **todos los estados**
de cada pantalla (los 5 módulos de la cartera, los 4 del capítulo 1, los 6
hallazgos, las 6 acciones) y quedándose con el peor. Idéntico en claro y en
oscuro.

| Vista · columna | 1366×768 | 1440×900 | 1920×1080 |
|---|---|---|---|
| Cartera · cola de llamadas | **23** · 2 | **33** · 2 | **68** · 2 |
| Cartera · módulos | **34** · 19 | **58** · 35 | **128** · 70 |
| Cap. 1 · las cuatro cifras | **23** · 19 | **73** · 19 | **137** · 19 |
| Cap. 1 · los cuatro módulos | **34** · 25 | **61** · 25 | **95** · 25 |
| Cap. 2 · los seis hallazgos | **54** · 2 | **76** · 2 | **106** · 2 |
| Cap. 2 · el dibujo del hallazgo | **82** · 56 | **115** · 72 | **165** · 97 |
| Cap. 3 · las acciones | **20** · 8 | **38** · 19 | **66** · 33 |
| Cap. 3 · la escalera | **68** · 25 | **112** · 25 | **185** · 25 |
| Cap. 4 · las cinco fichas | **65** · 32 | **91** · 45 | **139** · 69 |
| Cap. 4 · cómo se llega | **74** · 48 | **100** · 62 | **143** · 83 |
| Cap. 5 · la ficha de metadatos | **50** · 9 | **94** · 9 | **166** · 9 |
| **PEOR DE TODA LA PIEZA** | **82** (techo 120) | **115** (techo 150) | **185** (techo 250) |

Contra el estado anterior, en las mismas celdas: capítulo 5 **463 → 94**, capítulo 4
**384 → 100**, capítulo 2 **276 → 115**, capítulo 1 **260 → 73**, capítulo 3
**213 → 112**; a 1920 el peor pasa de **660 → 185**.

El peor caso —**115 px, capítulo 2, hallazgo H6**— es el único hallazgo **sin
dibujo**, y es a propósito: H6 dice que hay una medición que no se puede hacer, y
dibujar una ausencia sería inventarla. Ahí el sobrante se reparte entre las cuatro
juntas de la tarjeta y no hay nada que engordar.

Y nada dejó de caber:

| Medición | 1366×768 | 1440×900 | 1920×1080 |
|---|---|---|---|
| `scrollHeight` / `clientHeight` del documento · cartera y los 5 capítulos | **768 / 768** | **900 / 900** | **1080 / 1080** |
| `scrollWidth` / `clientWidth` del documento | **1366 / 1366** | **1440 / 1440** | **1920 / 1920** |
| errores y avisos de consola | **0** | **0** | **0** |

### 5 · MEDIA — la regla de orden de la cola se lee entera *(falla 4)*

Se quitó el `white-space:nowrap; overflow:hidden; text-overflow:ellipsis` en línea
de la `.ruta` de la cartera (`index.html:1409`). `.ruta` ya envolvía por hoja de
estilo (`word-break:break-word`), así que no hizo falta nada más.

| Medición de esa `.ruta` | Antes | Ahora |
|---|---|---|
| `scrollWidth` vs `clientWidth` a 1440 | 1.206 vs 729 → **477 px recortados** | **729 vs 729 — 0 recortados** |
| `scrollWidth` vs `clientWidth` a 1366 | 1.206 vs 690 → 516 px recortados | **690 vs 690 — 0** |
| líneas · alto | 1 · 14 px | **2 · 28 px** (los 148 px de aire de abajo daban de sobra) |

### 6 · MENOR — la barra horizontal de 13 px de la cola *(falla 5)*

Medido el origen antes de tocar nada: el botón «Sesión →» de cada fila mide
**81 px** y la última columna de `.fila` estaba fijada en **64 px**, así que
sobresalía hasta 742 en una caja de 729. Se dimensiona la columna al botón y se
cierra el eje x (`index.html:254-255`):

```css
.cola{… overflow-y:auto;overflow-x:hidden}
.fila{grid-template-columns:22px minmax(0,1fr) minmax(0,2fr) 134px auto}
```

| Medición de `div.cola` | Antes | Ahora |
|---|---|---|
| `scrollWidth` vs `clientWidth` a 1440 | 742 vs 729 → **13 px, barra a la vista** | **729 vs 729 — 0** |
| `scrollWidth` vs `clientWidth` a 1366 | 703 vs 690 → 13 px | **690 vs 690 — 0** |
| botones que sobresalen de la caja | 2 | **0** |

### 7 · MENOR — el foco al pedir más filas *(falla 6)*

`pintarTanda()` recibe ahora si la tanda la pidió el botón (`index.html:987`, el
bloque de `1010` a `1014`, y la llamada en `2174`) y, cuando así fue, deja el foco
en **la primera fila nueva** —no en el botón repintado—. Es deliberado y está
medido: al devolver el foco al botón, el navegador lo trae a la vista, y ese
scroll disparaba el auto-cargado por rueda del propio panel, que repinta el pie y
**vuelve a destruir el botón**; el foco caía a `BODY` otra vez y la tanda
siguiente se encadenaba sola.

El segundo arreglo cierra la misma trampa por el lado del teclado
(`index.html:1016-1023`): la rueda **no carga mientras el foco está en el botón**,
porque llegar tabulando a él también es un scroll y le pasaba lo mismo.

```js
if(document.activeElement && document.activeElement.id==="btn-mas") return;
```

Con las dos cosas, el ciclo de teclado se cierra —fila nueva → `Tab` → botón →
`Enter` → fila nueva— y está medido paso por paso sobre el panel sin filtro, 254
filas:

| Paso · panel sin filtro | Antes | Ahora |
|---|---|---|
| al abrir el panel | `BUTTON#panel-x` · 40 filas | **igual**, sin cambio |
| tras «Mostrar 40 más» (clic) | `BODY` · 80 filas | **`TR`, la fila 41** · 80 filas |
| un `Tab` desde ahí | `BODY` (el botón se destruía al enfocarlo) | **`BUTTON#btn-mas`**, y sobrevive |
| `Enter` sobre el botón | — | **`TR`, la fila 81** · 120 filas |
| `Tab` · `Enter` otra vez | — | **botón** · **`TR`, la fila 121** · 160 filas |
| rodar con la rueda hasta el fondo | carga la tanda | **carga la tanda y no toca el foco** (queda en `#panel-x`) |
| última tanda, con el botón ya inexistente | `BODY` | **`TR`, primera fila de la tanda** (fila 241 de 254) |
| `Esc` cierra y devuelve el foco al botón de origen | sí | **sí**, sin cambio |
| `<tr>` en el DOM con el panel cerrado | 0 | **0**, sin cambio |

### 8 · MEDIA — el texto de los dibujos se imprimía a 7 px *(hallazgo nuevo del director)*

La clave obligatoria dentro del dibujo —«ocupado · se libera este mes · libre»—,
los rótulos de sede y «al promedio del cliente» se declaraban a 11 px **en
unidades de viewBox**, y el viewBox de 880 (o 984) se metía en una columna de 630:
escala 0,64, y esos 11 px llegaban a la pantalla como **7,0 px**. El informe, con
`viewBox` 880 en 874 px, imprimía su nodo más chico a **9,9 px**.

El arreglo es el mismo del §7.4 y por eso van juntos: **el viewBox se arma con la
caja renderizada**, así que 1 unidad = 1 px y no hay escala que compensar. Además
el único tamaño declarado por debajo de 11 (el «4 libres de 17» del dumbbell, a
10) subió a 11.

Medido con `getScreenCTM()` de **cada** nodo `<text>` de **cada** SVG, recorriendo
cartera + los 5 capítulos + el informe en sus estados, claro y oscuro:

| | antes | ahora |
|---|---|---|
| escala del SVG (`getScreenCTM().a`) — sesión | 0,599 · 0,641 · 0,670 · 0,716 · 0,912 | **1,000** (peor caso 0,9994, por el redondeo del ancho a entero) |
| escala del SVG — informe | 0,993 | **1,000** |
| nodos de texto SVG por debajo de 10 px · 1366 | **48** (mínimo **6,6 px**) | **0** (mínimo **10,99 px**) |
| nodos por debajo de 10 px · 1440 | **48** (mínimo **7,0 px**) | **0** (mínimo **11,00 px**) |
| nodos por debajo de 10 px · 1920 | **7** (mínimo 9,9 px) | **0** (mínimo **11,00 px**) |
| máximo dentro de un SVG | 13 px | **11,5 px** en los gráficos, **13 px** la cifra del medidor |
| letra máxima de toda la pieza | 30 px | **30 px**, sin cambio |
| textos que se salen de su dibujo | — | **0** en todos los estados, en **390, 1024, 1366, 1440 y 1920**, los dos modos |

Como el informe se imprime en una caja más angosta que la pantalla (A4 menos
márgenes), los dibujos **se vuelven a medir al entrar en `media:print`**
(`matchMedia("print")`), así que el texto también sale a 11 px en papel. El alto de
esos tres dibujos es fijo, de modo que **el informe sigue siendo de tres páginas**.

### 9 · MEDIA — el `<thead>` tapado por la barra de filtros *(hallazgo nuevo del director)*

La barra de filtros, las pestañas y el `<thead>` eran tres cosas fijas que se
pisaban: el `<th>` se pegaba a `top:0` y la barra —que llega hasta y=172 dentro del
panel— le pasaba por encima. A partir de la fila ~10 se leía una grilla de nueve
columnas sin saber cuál era cuál, incluida la columna MARCA que la falla 1 acababa
de arreglar.

Se hicieron las dos cosas que pedía el director, porque se complementan:

1. **Filtros y pestañas viven en un solo contenedor pegajoso**, `.barra-panel`, que
   además se sale a los márgenes del panel para que ninguna fila asome por el
   costado. El `padding-top` del cuerpo del panel pasó al contenedor: `sticky` no
   deja subir un elemento por encima del borde de contenido de su contenedor, y en
   esa banda de 12 px asomaban las filas.
2. **El `<thead>` se pega justo debajo, con el alto real de esa barra**, medido al
   pintar el detalle: `PC.style.setProperty("--th-top", Math.ceil(alto)+"px")` y
   `.tbl thead th{top:var(--th-top,0px)}`.

Medido con `#panel-cuerpo` rodado 400 px, pestaña Espacios, 1440×900:

| | antes | ahora |
|---|---|---|
| `--th-top` | 0 px (implícito) | **91 px**, medido de la barra |
| barra de filtros + pestañas | y 111 → 172 | y **99 → 189** |
| `<th>` de la tabla | y **111 → 132** — *debajo de la barra* | y **190 → 211** — **debajo de la barra, entero** |
| ¿el `<thead>` queda tapado? | **sí** | **no** |
| filas asomando por encima de la barra | sí, en la banda de padding | **ninguna**: la barra es opaca, `z-index:5`, y cubre hasta el borde del panel |

### 10 · MENOR — dos rótulos que contradecían el texto

- **«109 ocupados» → «109 con contrato».** El rótulo del último punto del gráfico
  de doce meses llamaba «ocupados» a los que tienen contrato, mientras el párrafo
  nuevo del informe dice «**106** ocupados más **3** que se liberan». `gLineas()`
  recibe ahora la palabra del último punto: los dos gráficos de Mercamío —el del
  capítulo 1 y el del informe— dicen **«109 con contrato»**, y el de la cartera
  sigue diciendo «ocupados», que es lo que ahí significa el número (ocupación % ×
  comercializables). El `aria-label` del dibujo acompaña.
- **El `<caption>` de la tabla de Espacios cuenta el filtro.** Decía «Los 254
  espacios del plano de Mercamío» aunque el filtro dejara 108 a la vista. Ahora,
  medido: sin filtro → «**Los 254 espacios del plano de Mercamío.** Cada uno con su
  estado del periodo y su contrato si lo tiene.»; llegando desde «Los 108 espacios
  de TERRÓN» → «**108 de los 254 espacios · filtro: TERRON.** Cada uno con su
  estado del periodo y su contrato si lo tiene.»

### Lo que no se movió, verificado de nuevo

Cada arreglo se volvió a medir contra las columnas que el director ya había dado
por buenas, en **9 vistas × 2 modos × 2 anchos**:

| Medición | Resultado |
|---|---|
| `null` / `undefined` / `NaN` en pantalla | **0**, en cartera + los 5 capítulos + informe + las 5 pestañas del panel **agotadas**, claro y oscuro |
| Contraste: nodos por debajo de su piso WCAG (4,5:1 · 3,0:1) | **0 sobre 987 nodos de texto por pasada** —incluidos los `<text>` de los SVG—, en los dos modos, sobre cartera + 5 capítulos + informe + cliente nuevo |
| `var(--signal)` por pantalla | **exactamente 1** en 12 pantallas × 2 modos = **24 / 24** (Almacenes Caribe **0**, a propósito) |
| Formas | **0** arcos · **0** círculos de r > 14 · letra máxima **30 px** |
| Errores y avisos de consola | **0** en los tres anchos × los dos modos |
| Informe en A4 | **3 páginas** · **0** controles en `media:print` · alto del artículo **2.973 px**, 11 px menos que antes del arreglo |
| Detalle al clic, filtrado | desde «Los 108 espacios de TERRÓN»: `f-sede=TERRON` y el resto vacío · pestañas `108 · 9 · 7 · 32 · 3` · 40 filas de primera tanda · subtítulo «Llegaste con el filtro puesto: TERRON» |
| Foco tras «Mostrar 40 más» | clic → **`TR` de la primera fila nueva** (80 filas) · `Tab` → `#btn-mas`, **sobrevive 400 ms** · `Enter` → **`TR` de la primera fila nueva** (108 con el filtro puesto) |
| Panel cerrado | **0 `<tr>`** en el DOM, `aria-hidden="true"`, foco de vuelta en el botón de origen |
| Recursos externos | **0** — sin `<script src>`, `<link>`, `@import`, `url(http…)`, `<img>`, `<canvas>` ni `<iframe>` |

### Y las dos correcciones al README

- **§4, regla 1 del color.** Se enunciaba «el rojo, el ámbar y el verde son SÓLO
  los tres estados del espacio», y el filete de `.aviso.cruce` la contradecía. La
  regla es sobre **codificar**, no sobre aparecer: se reescribió como «son los
  únicos que **codifican estado de espacio**», con la única excepción nombrada,
  ubicada y explicada ahí mismo.
- **§0, el cuerpo.** Decía «cuerpo 13,5» a secas. Es cierto como valor declarado
  (`body{font-size:var(--t-sm)}`) pero **la pantalla la domina 12,5**: 249 nodos
  de texto visibles en 12,5 contra 32 en 13,5. Queda dicho con ese matiz, con los
  cuatro conteos.
