# Opción C · «La conversación»

**Diseñador C · Fase 11 · RECABRA** · un solo archivo: `index.html`, 265 KB,
autocontenido, cero recursos externos, cero librerías, pilas de sistema, los
tokens de `frontend/src/tema.css` copiados adentro. Claro por defecto, oscuro a
un clic. Datos: `outputs/ejemplo.json` tal cual, guion: `outputs/guion.md`.

---

## 0. La decisión fuerte

**La sesión es una conversación, y una conversación no repite.** La pantalla es
un hilo de turnos —tarjetas— y cada turno dice **una cosa que ningún otro turno
dice**. Cuando un turno necesita algo que ya se dijo, **apunta al turno anterior
en vez de volver a dibujarlo**: la acción 2 dice «la evidencia está en H1 y en la
primera fila del mapa» y no redibuja las sedes; la acción de concentración dice
«ya dibujado en H2, no vuelve a contarse». Ese es el riesgo de esta dirección —
que las tarjetas repitan lo mismo con otra cara— y la respuesta es una regla que
se puede auditar leyendo: **si un número aparece dos veces, una de las dos está
de más.**

De ahí salen las tres decisiones que más se notan:

1. **Un solo gráfico hace dos trabajos: el mapa de unidades.** Siete filas, una
   marca por espacio, ordenadas de peor a mejor ocupación. El *largo* de la fila
   es cuántos espacios tiene la sede; el *relleno* es cuántos están vendidos. Con
   eso, «espacios por estado (conteo)» y «ocupación por sede (ranking de partes)»
   —dos filas distintas de la tabla §3b— se contestan con **un dibujo, no dos**.
   Y resuelve el problema que el guion mide: ARRAYÁN (8 de 12) y VILLA (16 de 24)
   dan las dos 66,7 % y **no dibujan la misma barra**.
2. **La recomendación es la unidad, y tiene cuatro escalones fijos.** Frase ·
   precio contra algo · a quién · los códigos. Sólo el primero está a la vista.
   «113 góndolas» es una línea, no 113 códigos; al abrir «TERRÓN · 96» se
   enciende el plano de esa sede con esas 96 caras y el resto en gris.
3. **La cartera es el mapa de la conversación siguiente**, no un tablero: una
   cola de llamadas ordenada por riesgo, con la regla del orden escrita arriba, la
   adopción metida adentro de la lista como señal, y un botón para dar vuelta el
   orden si el dueño prefiere la otra lectura.

**Lo que dejo afuera de la historia** (y por qué está más abajo, en §4).

---

## 1. La tabla completa: dato → forma, con mi respuesta

Leyenda: **=** coincido con el punto de partida del brief §3b · **Δ** me aparto
(el porqué, medido, va debajo de la tabla) · **G** el analista ya se apartó en
`guion.md` §3 y lo sigo.

### 1.1 · Los quince datos del brief §3b

| # | Dato | ¿Qué pregunta contesta? | Trabajo del dato | Forma que le di | Contra qué | |
|---|---|---|---|---|---|---|
| 1 | **Ingreso contratado del mes** | ¿cuánto entra? | magnitud sola | **Cifra grande** (44 px, sans, figuras proporcionales — nunca `tabular-nums` en una cifra suelta), con la variación al lado: flecha implícita en el signo + valor absoluto + %. Una por pantalla. Ni anillo ni barra de una sola barra. | **el mes anterior comparable**, no el publicado | Δ G |
| 2 | **Ocupación % · cartera** | ¿qué tan llena está? | una razón contra un límite | **Cifra + medidor**: pista en `--surface-3`, relleno en `--dato`, y la **marca de referencia** del mes anterior comparable encima. | agosto a igual composición | Δ G |
| 3 | **Ocupación % · cliente** | ¿qué tan lleno está y *dónde* está lo vacío? | parte de un total + ubicación | **El mapa de unidades**: 254 marcas, una por espacio, agrupadas por sede. | mes anterior · cartera (en el cuadro de cuatro filas del cap. 1) | = |
| 4 | **Ocupación por sede** | ¿qué sede rinde y cuál no? | ranking de partes | **La misma pieza que #3**: cada fila es una sede, el largo son sus espacios, el relleno sus ocupados, la peor arriba, la cifra y el % al final. | la media del cliente, como **marca vertical dentro de cada fila** (lo que le tocaría a esa sede si estuviera en el promedio) | Δ |
| 5 | **Tendencia 12 meses · ocupación** | ¿hacia dónde va? | cambio en el tiempo con **denominador móvil** | **Dos líneas de conteo en una sola escala de espacios**: comercializables (tenue) y ocupados (fuerte). La ocupación es la brecha. Mes parcial marcado, mes sin snapshot como **hueco rotulado**, no como recta entre vecinos. | su propio pasado | Δ G |
| 6 | **Tendencia 12 meses · ingreso** | ¿hacia dónde va la plata? | cambio en el tiempo | **Línea en su propio panel**, misma rejilla de meses. Etiqueta directa sólo en el punto final. | su propio pasado | = |
| 7 | **Movimientos (entradas/salidas)** | ¿qué se ganó y qué se perdió? | flujo con signo en el tiempo | **Barras divergentes** sobre el eje de meses, entradas arriba y salidas abajo, en pesos. Eje con signo escrito. Etiquetadas **sólo** el peor mes y el actual. | el saldo (que va como cifra de la tarjeta) | = |
| 8 | **Espacios por estado** | ¿cuánto hay para vender? | conteo | **Unidades discretas** con la **palabra** al lado del color, en la leyenda del mapa (#3). Nunca sólo color. | — | = |
| 9 | **Canon por tipo vs benchmark** | ¿cobra bien contra el mercado? | comparación contra referencia | **Dumbbell** por tipo, **ordenado por brecha, el más negativo arriba**, con la brecha en % al final y el conteo «113 libres de 154» como columna de texto. El tipo sin contratos **no dibuja punto de cliente**: dice que no lo tiene. | el benchmark de la plataforma | Δ G |
| 10 | **Spread % (cartera)** | ¿quién cobra por debajo de lo que dice que vale? | comparación contra referencia, por cliente | **Puntos sobre un eje con el cero marcado**, negativo a la izquierda, nombre al lado, y un segmento del cero al punto para que la distancia se lea. Los `null` **no se dibujan**: se cuentan aparte, con la razón. | cero | Δ G |
| 11 | **Proveedores: participación %** | ¿de quién depende? | partes de un total + ranking | **Barras horizontales ordenadas**, 5 con nombre y **«otros 20» plegados en una sola barra gris**. Umbral de 40 % como línea vertical rotulada. **Dos barras por proveedor**: participación sobre contratos y sobre ingreso — misma escala (%), dos preguntas. | el umbral de concentración | Δ G |
| 12 | **Contratos por vencer** | ¿qué se cae y cuándo? | hechos con fecha | **Riel de 60 días** (no 90) con hoy y el fin del periodo marcados; **cuadrado** = el espacio ya cambió a «se libera», **círculo** = vence después del periodo. Rotulados con plata **sólo los tres de septiembre**; los nueve, en la lista de abajo. | hoy · fin del periodo | Δ G |
| 13 | **Recomendaciones** | ¿qué hago primero? | ranking por valor y prioridad | **Tarjetas de acción numeradas** con los cuatro escalones. La prioridad es **palabra, orden y peso** (el número va en negativo cuando es alta, en gris cuando no). Las 19 medias y bajas, en una tabla plegada. | los tres totales, arriba de todo | = |
| 14 | **Oportunidades** | ¿a quién le ofrezco qué? | asignación | **Grupo sede × tipo como fila** (148 → 30 grupos), con precio sugerido, **el origen del precio escrito**, y los candidatos por nombre. El plano de la sede se enciende al abrir el grupo. | el precio sugerido y su origen | Δ G |
| 15 | **Adopción (5 clases)** | ¿quién no usa lo que paga? | clasificación con conteo | **Conteo por clase en unidades**, dentro del encabezado de la cola, con **énfasis**: las tres clases que significan «no entra nadie» en la tinta de dato, las dos que significan «está viva» en gris. Y la clase como columna de cada fila. No es un panel. | — | = |
| 16 | **Cohortes de adopción** | ¿los nuevos se quedan? | retención en el tiempo | **Tabla**, 5 filas, **conteo primero** («0 de 2») y el porcentaje en gris con su `n`. Sin gráfico. | — | = |
| 17 | **Valor en juego total** | ¿cuánto vale hacer esto? | magnitud **compuesta** | **Tres cifras rotuladas, no una**, con sus partes visibles. La suma de las tres **no se muestra**, y la suma cruda de las 25 recomendaciones se muestra **tachada** con la explicación de por qué no existe. | el ingreso contratado del mes | Δ G |

### 1.2 · Los datos del inventario §4 que **no** son gráfico

| Dato | Pregunta | Forma | Por qué no es gráfico |
|---|---|---|---|
| Estado de cuenta (activo/gracia/solo lectura/suspendido) | ¿puede operar? | **Chip con la palabra** en la fila del cliente | Cuatro estados operativos sin magnitud. Sin color propio: un color más acá compite con los cuatro del espacio. |
| Cobertura (`clientes_incluidos`, `clientes_con_error`, `de_cache`, `parcial`, `sin_dato`) | ¿de cuánto sale esto? | **Una línea de pie**, contada, en las tres piezas | Metadato. Va en el encabezado y en el pie, nunca como una serie más. |
| `contratos_fuera_del_plano` | ¿por qué no cierran ocupación e ingreso? | **Una línea contada** en la tabla de contratos | Si fuera una categoría más del gráfico de estados, sumaría a la ocupación — y no ocupa ninguna cara. |
| Zona y área m² | ¿dónde está y cuánto mide? | **Columnas de la tabla** y la lectura del mapa | Atributos, no magnitudes comparables. |
| Marca del contrato | ¿de qué marca es? | Texto en la fila, bajo el proveedor | Identidad. |
| `benchmark_plataforma` | ¿cuánto cobra el mercado? | **Nunca solo**: es el punto tenue del dumbbell (#9) y el origen del precio en las oportunidades (#14) | Un benchmark suelto no responde ninguna pregunta. |
| Último acceso / días sin acceso | ¿hace cuánto que no entran? | **Número de días + la palabra**, en la fila del cliente. `null` = «sin cuentas creadas» / «nunca entró», nunca «0 días» | Un hecho con fecha por cliente, con n = 6. Un gráfico de 6 puntos es ruido. |
| Solicitudes de supresión y cambios de estado | ¿qué hay que atender? | **Cajón plegado** al pie de la cartera, con su conteo | Operaciones, no análisis. Son además las **dos únicas cosas escribibles** de toda la plataforma, y eso se dice. |
| Reporte de transparencia | ¿qué le mostramos al cliente? | **Un enlace** en el capítulo 5 | Ya está diseñado y no se rediseña. |

### 1.3 · Los cinco desvíos, medidos

**Δ1 · Ocupación de cartera: medidor, no unidades (#2).** El brief pide unidades
que suman. Para un cliente es exactamente lo correcto — 254 marcas *señalan un
lugar*. En la cartera, 513 marcas (3.000 con 30 clientes) no señalan nada: no hay
un espacio al que ir. `choosing-a-form.md`: *«A single ratio against a limit →
Meter»*. **La forma sigue al trabajo, y el trabajo cambia con el nivel.**

**Δ2 · Ocupación por sede: el largo es espacios, no porcentaje (#4).** Con barras
de %, ARRAYÁN (8 de 12) y VILLA (16 de 24) dibujan la misma barra y **no son el
mismo negocio**. Con el largo en espacios, TERRÓN es una fila nueve veces más
larga que ARRAYÁN y casi entera libre: es el dibujo del hallazgo. Cumple además
la regla del propio brief («lo que hay que contar se cuenta en unidades»). Y
fusiona dos gráficos en uno, que es el punto de esta opción.

**Δ3 · Tendencia de ocupación: dos líneas de conteo (#5).** El denominador se
mueve tres veces en cuatro meses: **445 → 553 (jun, TERRÓN) → 587 (ago, Caribe) →
513 (sep, Guadual ilegible)**. Una línea de porcentaje sobre eso dibuja un
derrumbe de **16,4 puntos que no ocurrió**, y ninguna anotación arregla un eje
que miente. Con dos conteos en una escala, el escalón está **en el dato**. Y
respeta la regla dura: una sola escala, nunca dos ejes (`anti-patterns.md`,
primer punto).

**Δ4 · Valor en juego: tres cifras, no una (#17).** Medido:
`Σ recomendaciones[].valor_estimado_mensual` = **$ 386.142.500** contra un ingreso
de **$ 201.667.500**. El 1,9× no es una oportunidad, es un error de suma:
`sede_subutilizada:TERRON` ($ 82.960.000) son **los mismos espacios** que
`espacio_libre:gondola` + `cross` + `batea`, y `concentracion_proveedor`
($ 110.567.500) es ingreso que **ya entra**. Van tres cifras rotuladas —
oportunidad nueva / en riesgo / expuesto — y la suma cruda se muestra **tachada**,
con el porqué. Un titular con ese total se cae en la primera pregunta del dueño.

**Δ5 · Contratos por vencer: riel de 60 días, no 90 (#12).** `DIAS_POR_VENCER` es
60 y `contratos_por_vencer_60d` es la clave que trae el JSON. Un riel de 90 con
datos de 60 crea un tercio vacío que se lee como «no hay vencimientos en
noviembre», y no es cierto: es que **no se miran**.

### 1.4 · Un desvío mío, que no está en el guion

**Δ6 · «Precio bajo tarifa» y «brecha contra el benchmark» son dos hallazgos y se
llaman distinto.** El backend compara contra el promedio del **propio cliente**
(dispersión interna, $ 5.915.000 en seis tipos); el brief §4 dice «contra el
benchmark». Los dos existen y cuentan historias distintas —−15,5 % en exhibición
de piso contra el mercado, contra $ 480.000 de dispersión interna en ese mismo
tipo—. En la pantalla van **separados y nombrados**, con un aviso escrito, porque
si se confunden el asesor va a creer que ya cubrió el segundo cuando leyó el
primero. Y la brecha contra el benchmark **no lleva cifra de valor**: no se puede
sumar en plata sin decidir a cuántos contratos se le aplicaría.

---

## 2. Qué pregunta contesta cada bloque

### Pieza 1 · La cartera — «¿cómo va el negocio y a quién llamo primero?»

| Bloque | Pregunta | Forma | Por qué |
|---|---|---|---|
| **Titular** | ¿cuánto entra y qué tan llena está? | 2 cifras grandes + medidor + **tabla de composición de tres columnas** (agosto publicado, tachado · agosto comparable · septiembre) | El número crudo dice «cayó $ 45,3 M». El honesto dice «no pasó nada». La columna tachada **no se esconde: se muestra y se explica**. |
| **Tendencia** | ¿hacia dónde va? | Dos paneles con la misma rejilla: conteos + ingreso, con tres anotaciones **escritas sobre la línea** en carriles separados | Δ3. Y las anotaciones van sobre el dato, no en una leyenda. |
| **Cola de llamadas** | ¿a quién llamo primero? | Lista ordenada por **riesgo**, con la regla del orden escrita arriba, la señal y la adopción como chips con palabra, y la plata a la derecha | «Prioridad visible: por orden, por peso, por señal.» Mercamío tiene el número más grande **y va cuarto**, a propósito — y el botón «ordenar por plata» permite la otra lectura sin esconderla. |
| **Adopción** | ¿quién no usa lo que paga? | Conteo en unidades con **énfasis** (3 clases resaltadas, 2 en gris), dentro del encabezado de la cola | No es un panel aparte: un cliente fantasma no es una estadística, es una llamada. |
| **Spread** | ¿quién cobra por debajo de su propia tarifa? | Dot plot con cero + **bloque de nulos contados** | Los `null` no son ceros. 2 sin tarifa + 1 sin dato se cuentan, con la razón. |
| **Cohortes** | ¿los nuevos se quedan? | Tabla de 5 filas | Con n ≤ 2 un gráfico dibuja una tendencia que no existe. |
| **Proveedores de la cartera** | ¿de quién depende el negocio entero? | 5 barras de **conteo, sin porcentaje** | La cartera no publica el total de contratos por cliente: un porcentaje sin denominador publicado es un número inventado. Se dice en la tarjeta. |
| **Cajón operativo** | ¿qué hay que atender? | Dos tablas plegadas | Operaciones, fuera de la historia. |

### Pieza 2 · La sesión — cinco capítulos, un hilo

- **Cap. 1 · Dónde está** — hero + cuadro de cuatro filas donde **cada número
  tiene su «contra qué» y su «lectura» en columnas propias**; el mapa (el ancla
  de toda la sesión); la tendencia en dos paneles; los movimientos.
- **Cap. 2 · Qué encontramos** — cinco hallazgos. **H1 no tiene gráfico**: su
  evidencia es la primera fila del mapa y lo dice. H2 (concentración), H3 (tipos
  + precio, fusionados) y H4 (vencimientos) traen cada uno una forma que no se
  repite en ningún otro bloque. **H5 vale $ 0 y va igual**: es la medición que no
  se puede hacer.
- **Cap. 3 · Qué proponemos** — los tres totales; las 6 acciones altas como
  tarjetas de cuatro escalones; **la tarjeta del cruce** («antes de llamar a
  Volcán, leer esto»: ofrecerle las 113 caras lo subiría de 41,4 % a 71,0 %); las
  19 restantes en una tabla plegada.
- **Cap. 4 · Los datos detrás** — **una sola fila de filtros arriba de las cinco
  tablas** (sede · tipo · estado · texto), todas plegadas. Verificado: filtrar
  TERRÓN + góndola + libre da **96 filas**, que es exactamente el número de la
  acción 1. La cifra de arriba aterriza acá.
- **Cap. 5 · De dónde sale** — periodo, generado, cobertura, frontera, bitácora,
  enlace al reporte de transparencia, y los cinco endpoints.

**El otro estado de pantalla.** El selector de cliente abre **Almacenes Caribe**,
que es una pantalla distinta y no la misma con casillas vacías: el backend genera
`arranque` **sólo** cuando no hay ni un contrato, y en ese caso **no genera
ninguna de las otras seis**. Ahí todo el precio sale del benchmark y **no hay
candidatos** — «todavía no hay a quién ofrecérselo desde adentro» —, y eso se
dice con esas palabras en vez de rellenarse con proveedores de otros clientes.

### Pieza 3 · El informe — los tres cambios obligatorios

1. **Fuera la comparación contra la cartera.** «4,5 puntos por debajo de la
   cartera» sale de `/metricas` y le cuenta al gerente cómo les va a los otros
   supermercados. En su lugar entra **el benchmark de la plataforma por tipo**,
   que sí está en su propio detalle y es un promedio anónimo — y el informe
   explica qué es.
2. **Fuera «fantasma», «gracia» y el orden de la cola.** Juicios internos.
3. **El titular cambia de dueño:** del «a quién llamo» del operador al **«qué
   gano»** del cliente.

Además: **todo lo que un tooltip diría, está escrito**. Cada gráfico lleva su
tabla completa debajo, no plegada. A4 vertical, 5 páginas, `printBackground`
verificado.

---

## 3. El color

### 3.1 · La decisión

**RECABRA tiene UN sistema categórico —los cuatro estados del espacio de
`tema.css`— y UNA tinta de dato nueva.** No hay paleta de series y no hay par
divergente.

| rol | claro | oscuro | dónde | token |
|---|---|---|---|---|
| espacio **libre** | `#00805A` | `#00BE86` | mapa, chips | `--libre` |
| espacio **se libera** | `#CE8A0A` | `#F5A524` | mapa, chips, riel | `--entra` |
| espacio **ocupado** | `#D8342E` | `#F4544E` | mapa, chips | `--ocupado` |
| **sin dato / no se alquila** | `#AAB3BE` | `#33414F` | plano apagado, «otros 20» | `--resto` |
| **tinta de dato** | `#2E63C8` | `#4C89E8` | líneas, barras, puntos, dumbbells, medidor | **nuevo** `--dato` |
| **tinta de dato, paso tenue** | `#79A3E2` | `#2F5EA6` | contexto, pista, la segunda serie | **nuevo** `--dato-tenue` |
| **acción principal** | `#F2B300` + borde `#A87C00` | `#FFD028` | **un solo botón por pantalla** | `--signal` |

Los estados y la señal son literalmente los hex de `tema.css`, incluida la
corrección medida que ese archivo ya trae (`--signal` en claro es `#F2B300`, no
`#FFD028`: el `#FFD028` da 1,47:1 sobre la tarjeta blanca y el botón sería una
mancha flotando). Para **escribir** un estado se usan siempre las variantes
`-txt`. Nunca el relleno.

### 3.2 · Por qué no hay par divergente para movimientos y spread

`choosing-a-form.md` pide un par cálido↔frío para polaridad. **No queda lugar en
el espacio de color**: verde, ámbar y rojo son los estados, y el amarillo es la
acción. El candidato más obvio (azul ↔ magenta) pasa entre sí y **colisiona con
el rojo `ocupado`**:

```
$ node validate_palette.js "#00805A,#CE8A0A,#D8342E,#2E63C8,#C2487F" --mode light --surface "#FFFFFF" --pairs all
  [FAIL] Normal-vision floor    worst all-pairs #C2487F↔#D8342E ΔE 10.7 (normal) — below 15
```

Un magenta a ΔE 10,7 del rojo «ocupado» **se lee como ocupado** en la pantalla de
al lado. Y `anti-patterns.md` prohíbe usar un color de estado para una serie que
no es estado — que es lo que pasaría si reusara el rojo para «salidas».

**Entonces la polaridad la lleva la posición.** Entradas arriba del cero, salidas
abajo, la línea del cero fuerte (1,5 px `--ink-2`), el signo escrito en el eje
(`+$ 6 M` / `−$ 6 M`) y en las etiquetas, y las dos ramas en **la misma rampa
ordinal de dos pasos** de la tinta de dato. Perder un tono cuesta menos que ganar
una ambigüedad.

### 3.3 · El validador — corridas literales

**(a) Los cuatro colores que pueden compartir un gráfico, modo claro, sobre la
tarjeta blanca.**

```
$ node validate_palette.js "#00805A,#CE8A0A,#D8342E,#2E63C8" --mode light --surface "#FFFFFF" --pairs all

Palette (light, surface #FFFFFF, categorical): 4 slots
  [PASS] Lightness band         all 4 inside L 0.43–0.77
  [PASS] Chroma floor           all 4 >= 0.1
  [PASS] CVD separation         worst all-pairs #D8342E↔#00805A ΔE 9.2 (protan) · tritan 4.3
  [PASS] Normal-vision floor    worst all-pairs #D8342E↔#CE8A0A ΔE 17.9 (normal)
  [WARN] Contrast vs surface    below 3:1 — relief required (visible labels or table view): [["#CE8A0A",2.89]]

  → ALL CHECKS PASS
exit=0
```

**(b) Los mismos cuatro sobre el papel `#EFF1ED`.**

```
$ node validate_palette.js "#00805A,#CE8A0A,#D8342E,#2E63C8" --mode light --surface "#EFF1ED" --pairs all
  [PASS] Lightness band · [PASS] Chroma floor
  [PASS] CVD separation         worst all-pairs #D8342E↔#00805A ΔE 9.2 (protan) · tritan 4.3
  [PASS] Normal-vision floor    worst all-pairs #D8342E↔#CE8A0A ΔE 17.9 (normal)
  [WARN] Contrast vs surface    below 3:1 — relief required: [["#CE8A0A",2.54]]

  → ALL CHECKS PASS
exit=0
```

El `WARN` del ámbar **está cubierto de antemano y por regla**: cada estado va
siempre con su palabra (en la leyenda del mapa y en cada chip), cada relleno lleva
su `-borde`, y cada gráfico tiene su tabla equivalente. Es la regla que ya está
escrita en `tema.css` y esta propuesta no la afloja.

**(c) Los cinco que pueden compartir un gráfico, con la tinta tenue.**

```
$ node validate_palette.js "#00805A,#CE8A0A,#D8342E,#2E63C8,#79A3E2" --mode light --surface "#FFFFFF" --pairs all
  [PASS] Lightness band         all 5 inside L 0.43–0.77
  [PASS] Chroma floor           all 5 >= 0.1
  [PASS] CVD separation         worst all-pairs #D8342E↔#00805A ΔE 9.2 (protan) · tritan 4.3
  [PASS] Normal-vision floor    worst all-pairs #D8342E↔#CE8A0A ΔE 17.9 (normal)
  [WARN] Contrast vs surface    below 3:1 — relief required: [["#CE8A0A",2.89],["#79A3E2",2.58]]

  → ALL CHECKS PASS
exit=0
```

**Los dos peores pares son exactamente los mismos que sin las tintas azules, con
los mismos ΔE.** El color nuevo no empeora ni un solo par.

**(d) Modo oscuro. Reprueba, y es la desviación heredada de `tema.css`.**

```
$ node validate_palette.js "#00BE86,#F5A524,#F4544E,#4C89E8" --mode dark --surface "#0B1116" --pairs all
  [FAIL] Lightness band         outside band: [["#00BE86",0.709],["#F5A524",0.782]]
  [PASS] Chroma floor           all 4 >= 0.1
  [WARN] CVD separation         worst all-pairs #F4544E↔#00BE86 ΔE 7.5 (deutan) · tritan 9.2
  [PASS] Normal-vision floor    worst all-pairs #F4544E↔#F5A524 ΔE 18.7 (normal)
  [PASS] Contrast vs surface    all 4 >= 3:1

  → FAILED — fix the marked checks
exit=1
```

El `exit=1` lo producen **el verde y el ámbar**, no la tinta de dato. Es la
desviación que `tema.css` (líneas 55–72) documenta y mide: bajar la claridad para
entrar en la banda hunde el par ámbar↔rojo a ΔE 3,5 en deuteranopía, por debajo
del piso duro de 15. No propongo cambiar los hex: **propongo respetar sin
excepción las dos compensaciones que la desviación exige** —cada estado con su
palabra, cada relleno con su borde—, y así está construida la pantalla.

**(e) La tinta de dato sola, en las cuatro superficies.**

```
$ node validate_palette.js "#2E63C8" --mode light --surface "#FFFFFF"   → ALL CHECKS PASS  exit=0
$ node validate_palette.js "#2E63C8" --mode light --surface "#EFF1ED"   → ALL CHECKS PASS  exit=0
$ node validate_palette.js "#4C89E8" --mode dark  --surface "#0B1116"   → ALL CHECKS PASS  exit=0
$ node validate_palette.js "#4C89E8" --mode dark  --surface "#04070A"   → ALL CHECKS PASS  exit=0
```

**(f) La rampa ordinal de dos pasos — y la corrección que le hice al guion.**

El guion propone `#8FB3E8` como paso tenue en claro. **Pasa sobre la tarjeta
blanca y reprueba sobre el papel**, que es la otra superficie donde el gráfico va
a vivir:

```
$ node validate_palette.js "#8FB3E8,#2E63C8" --mode light --surface "#EFF1ED" --ordinal
  [FAIL] Light-end contrast     #8FB3E8 at 1.89:1 vs surface — below 2:1 floor
exit=1
```

Lo oscurezco un paso a **`#79A3E2`**, que pasa en las dos manteniendo el mismo
tono (3° de dispersión) y el mismo ΔL:

```
$ node validate_palette.js "#79A3E2,#2E63C8" --mode light --surface "#EFF1ED" --ordinal
  [PASS] Lightness monotone · [PASS] Adjacent ΔL >= 0.06
  [PASS] Light-end contrast     #79A3E2 at 2.27:1 vs surface
  [PASS] Single hue             hue spread 3°
  → ALL CHECKS PASS  exit=0

$ node validate_palette.js "#79A3E2,#2E63C8" --mode light --surface "#FFFFFF" --ordinal
  [PASS] Light-end contrast     #79A3E2 at 2.58:1 vs surface        → ALL CHECKS PASS  exit=0

$ node validate_palette.js "#2F5EA6,#4C89E8" --mode dark --surface "#0B1116" --ordinal
  [PASS] Light-end contrast     #2F5EA6 at 2.96:1 vs surface        → ALL CHECKS PASS  exit=0

$ node validate_palette.js "#2F5EA6,#4C89E8" --mode dark --surface "#04070A" --ordinal
  [PASS] Light-end contrast     #2F5EA6 at 3.15:1 vs surface        → ALL CHECKS PASS  exit=0
```

Los dos WARN de contraste del paso tenue (2,58:1 y 2,96:1, ambos bajo 3:1) llevan
su relevo obligatorio: **etiqueta directa en cada marca tenue y tabla equivalente
en cada gráfico**. Ninguna barra tenue existe sin su número escrito al lado.

**(g) El gris de «sin dato» — reprueba a propósito.**

```
$ node validate_palette.js "#AAB3BE" --mode light --surface "#FFFFFF"
  [FAIL] Chroma floor           below floor (reads gray): [["#AAB3BE",0.019]]
  [WARN] Contrast vs surface    below 3:1: [["#AAB3BE",2.12]]
exit=1
```

**Se lee gris, que es exactamente su trabajo.** No entra en la corrida categórica:
se verifica con contraste WCAG contra la superficie, no con el gate de croma.
Mismo razonamiento que `tema.css` ya escribe para `--resto`.

### 3.4 · Marcas, según `marks-and-anatomy.md`

Barras ≤ 24 px con extremo redondeado 4 px · líneas 2 px con unión y cabo
redondeados · marcadores r ≥ 4,5 con **anillo de 2 px del color de la
superficie** · rejilla y ejes **1 px sólidos, nunca punteados** · **2 px de aire
del color de la superficie** entre marcas que se tocan (el mapa usa paso de 8 px
para marcas de 6) · **el texto nunca lleva el color del dato** (todo en
`--ink-1/2/3`, la identidad la da la marca de al lado) · cifra grande con figuras
**proporcionales**, `tabular-nums` sólo en columnas · etiquetado **selectivo**:
el extremo, el punto actual y el que cuenta la historia, nunca un número en cada
punto.

---

## 4. Qué dejé afuera, y por qué

1. **El texto de `explicacion` del backend.** Trae los 113 códigos en un párrafo:
   es literalmente el ejemplo que el dueño puso como lo que no puede pasar. No se
   imprime nunca; se usan los campos de `datos`, que traen lo mismo estructurado.
2. **El total de «valor en juego».** Existe ($ 386.142.500) y se muestra
   **tachado, para desarmarlo**. Publicarlo como titular sería mentir con datos
   correctos.
3. **El conteo de contratos activos de la cartera consolidada.** El endpoint no
   lo devuelve. Se puede despejar (ingreso ÷ canon promedio) y por eso **por
   cliente sí lo muestro, rotulado «≈» y con la fórmula en la línea de fuente**;
   consolidado no, porque ahí el promedio pesa clientes de tamaños muy distintos.
4. **La participación % de los proveedores en la cartera.** Sin el total de
   contratos publicado por cliente, un porcentaje es inventado. En la cartera van
   cinco conteos; el porcentaje sólo existe en el detalle, donde el total viene.
5. **Un panel de adopción.** La adopción está adentro de la cola de llamadas.
   Un panel aparte obligaría a cruzar dos listas para saber a quién llamar.
6. **Un gráfico de cohortes.** Cinco filas con n ≤ 2. Un gráfico dibujaría una
   tendencia que los datos no sostienen.
7. **La séptima recomendación (`arranque`) junto a las otras seis.** Son dos
   estados de pantalla y se dibujan distinto. Una leyenda de «7 tipos» mostraría
   seis vacías.
8. **La tarifa de referencia del cliente, en cualquier forma.** Sólo su relación
   (`spread_pct`) y si existe (`tarifa_configurada`). El «≈ $ 23.100.000 sin
   cobrar» de Superandes va rotulado como aproximación y con su fórmula.
9. **El plano isométrico real.** El JSON no trae geometría (hay `zona` y
   `area_m2`, no coordenadas). El mapa de unidades hace de ancla y en el producto
   se enciende el plano de verdad en el mismo lugar: la interacción («abro el
   grupo → se resalta la sede, lo demás en gris») ya está construida y es la que
   el plano heredaría sin cambiar nada más.
10. **Un selector de periodo funcional con doce meses.** El ejemplo trae un solo
    periodo cargado; el control existe, dice qué manda y explica que la serie de
    doce meses vive en la tendencia. Prometer doce periodos navegables con datos
    de uno sería una demo mentirosa.
11. **Animaciones de entrada.** Nada se mueve solo. El único movimiento es el que
    provoca el operador: abrir un escalón, filtrar, cambiar de pieza.

---

## 5. Verificación (Playwright, `chromium-1194`)

Corrido sobre **3 anchos × 2 temas × 3 piezas = 18 combinaciones**, con todos los
`<details>` de la sesión abiertos a la fuerza:

| Comprobación | Resultado |
|---|---|
| Errores y advertencias de consola, y `pageerror` | **0** en las 18 |
| Textos pisados dentro de los SVG (texto↔texto y texto↔`rect` de dato) | **0** en las 18 |
| Texto que se sale del `viewBox` de su SVG | **0** en las 18 |
| Contraste de texto (≥ 4,5:1 normal, ≥ 3:1 grande), DOM y `<text>` de SVG, contra el fondo pintado real | **0 fallos** en las 18 |
| `var(--signal)` visible por pantalla | **exactamente 1** en las 18 (el `.btn-principal`) |
| Scroll horizontal del documento | **0 px** en 1440×900, 1366×768 y 390×844 |
| `undefined` / `NaN` en el texto renderizado | **0** |
| Recursos externos (`http`, `<link>`, `<img>`, `src=`) | **0** |
| Filtros del capítulo 4 | TERRÓN → 108 espacios · 9 contratos · 3 grupos · 7 proveedores; **+ góndola + libre → 96**, que es el número de la acción 1 |
| Impresión del informe | PDF A4 vertical, **5 páginas**, con fondos |

El único amarillo de `tema.css` que aparece más de una vez es `--entra`
(`#CE8A0A` / `#F5A524`), que **no es la señal**: es el estado «se libera» del
espacio, y va siempre con su palabra y su borde.

**Un compromiso que declaro.** Una marca del mapa mide 6 × 22 px, por debajo del
objetivo de 24 px que pide `interaction.md` para puntos sueltos. Subirla a 24 px
haría que la fila de TERRÓN midiera 2.600 px y el mapa dejaría de ser un mapa. La
compensación es la que el propio documento propone para marcas densas: **una capa
de punto-más-cercano** —el cursor sólo tiene que estar *cerca*, no acertarle—, más
el `<title>` nativo de cada marca, la lectura escrita arriba del mapa, la tabla
equivalente y las 254 filas del capítulo 4. **El tooltip no es el único camino a
ningún valor.**

---

## 6. Qué mediría para saber si funciona

**Lo que el brief pregunta, convertido en medición.**

| Pregunta del dueño | Qué mido | Umbral que me pongo |
|---|---|---|
| ¿Entiendo en diez segundos cómo va este cliente y qué le propongo? | Le tapo la pantalla a los cinco segundos y le pido las **tres cosas** que recuerda. | En 4 de 5 sesiones tienen que salir «TERRÓN vacío», «Volcán es la mitad» y una cifra de plata. Si sale un número que no existe (los $ 386 M), el diseño falló. |
| ¿Cada número está contra algo? | Señalo **cinco números al azar** de la pantalla y pregunto «¿contra qué?». | 5 de 5 contestados sin abrir nada. |
| ¿Sé de dónde sale? | De esos cinco, pregunto «¿dónde lo compruebo?». | 4 de 5 llegan al capítulo 4 en ≤ 2 clics, y el número de la tabla filtrada **coincide** con el de arriba. |
| ¿Puedo llegar al detalle sin que el detalle me tape el resumen? | Grabo la sesión y cuento **cuántas veces tiene que hacer scroll hacia arriba** después de abrir un plegado. | 0. Si tiene que volver a buscar el resumen, el plegado está mal puesto. |
| ¿Esto se lo puedo mostrar a un gerente tal cual? | Le doy el informe impreso a un gerente **sin el operador delante** y le pido que me diga qué haría el lunes. | Nombra al menos dos de las tres acciones altas y ninguna palabra interna («fantasma», «gracia», «cartera»). |
| ¿Sobra algo? ¿Hay algo dicho dos veces? | Recorro la pantalla con una regla: **cada cifra, una sola vez**. Cuento repeticiones. | Cero cifras repetidas fuera de la tabla equivalente y del informe (que por diseño repite la sesión para otro lector). |

**En producción, con 30 clientes y 300 espacios.**

- **La cola funciona si el orden cambia el comportamiento.** Mido qué proporción
  de las sesiones abiertas en la semana salen de los **primeros cuatro puestos**
  de la cola. Si es la misma que si estuviera ordenada al azar, la regla de orden
  no está diciendo nada.
- **Las recomendaciones funcionan si se cierran.** Mido, por tipo de
  recomendación, cuántos de los espacios propuestos aparecen **con contrato el mes
  siguiente**, y a qué precio contra el sugerido. `espacio_libre` y
  `contrato_por_vencer` deberían separarse mucho: si no lo hacen, el orden por
  valor está mal.
- **La honestidad se mide por lo que NO pasa.** Cuento cuántas veces el operador
  le repite al cliente una cifra que la pantalla marca como derivada o aproximada
  **sin decir que lo es**. Debería ser cero, y si no lo es el rótulo está muy
  chico.
- **El escalón 4 se mide por su tasa de apertura.** Si los 113 códigos se abren en
  más del ~20 % de las sesiones, el resumen no está alcanzando y hay algo que
  debería estar arriba. Si se abren en el 0 %, el detalle sobra y hay que
  quitarlo, no adornarlo.
- **Rendimiento con 300 espacios.** Mido el tiempo hasta que el mapa es
  interactivo. Hoy, con 254 marcas y las cinco tablas montadas, la sesión entera
  se pinta de una vez; a 300 el mapa crece un 18 % y sigue entrando en 1366 px.
  El límite real no es el mapa: es la tabla de espacios, y por eso está plegada
  y filtrada.
