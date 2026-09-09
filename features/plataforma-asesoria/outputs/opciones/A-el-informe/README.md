# Opción A · **El informe**

`index.html` — un solo archivo, cero recursos externos, cero librerías, tipografías de
sistema, tokens de `frontend/src/tema.css` copiados adentro. Claro por defecto, oscuro a
un clic (recordado en `localStorage` bajo `recabra-tema`, la misma llave del interior).
Todos los gráficos son SVG dibujados a mano a la escala del dato: no hay imágenes.

---

## 0. La decisión fuerte

**La consola es un documento, no un tablero.** Se lee de arriba abajo, cada capítulo abre
con su frase-conclusión, los gráficos van anotados sobre el dato y el detalle va plegado.
La cartera es el **índice**: la columna de la izquierda lista las tres piezas y, dentro de
«La cola de llamadas», los seis clientes por nombre — hacer clic en uno abre su sesión.

El riesgo que esto tiene es volverse un PDF. Contra eso, tres cosas que **no** son
decorativas y están siempre a mano:

- **el periodo se elige** en la barra superior y manda sobre las tres piezas;
- **la cola de llamadas es operativa**: cada fila tiene su acción (`Abrir la sesión`, y
  `Revisar la conexión` para el que no se deja leer) y se reordena por riesgo o por plata
  con un clic;
- **una sola acción principal por pantalla**, en amarillo, y es la que sigue en el trabajo:
  en la cartera, la llamada #1 de la cola; en la sesión, «Armar el informe para el
  cliente»; en el informe, «Imprimir o guardar en PDF».

Lo demás es documento: se lee, se cita, se imprime.

### Cómo está armado

| Pieza | Qué contesta | Capítulos |
|---|---|---|
| **1 · La cartera** | ¿cómo va el negocio y a quién llamo primero? | 1.1 titular · 1.2 tendencia anotada · 1.3 cola de llamadas · 1.4 spread · 1.5 adopción · 1.6 lo operativo · 1.7 de dónde sale |
| **2 · La sesión** | ¿qué le propongo a este cliente? | 1 dónde está · 2 qué encontramos (H1–H6) · 3 qué proponemos · 4 los datos detrás · 5 de dónde sale |
| **3 · El informe del cliente** | ¿qué gano yo, gerente de supermercado? | 1 → 3, sin la cartera y sin «los datos detrás» |

La sesión tiene **dos estados de pantalla distintos**, no uno con huecos: Mercamío (los seis
tipos de recomendación) y Almacenes Caribe (**sólo** `arranque`, que el backend genera
excluyendo a los otros seis). De los otros cuatro clientes la cartera publica métricas pero
no detalle: esa sesión dice exactamente eso en vez de dibujar capítulos con datos que el
endpoint no devolvió.

---

## 1. La tabla del brief §3b — dato → forma, con mi respuesta

Sigo el mapa de formas del guion (`outputs/guion.md` §3). Donde me aparto **del guion**, lo
marco `Δ-guion` y lo justifico. La columna «dónde» dice en qué bloque de `index.html` vive.

| Dato | Pregunta | Trabajo del dato | Forma que le di | Contra qué | Dónde |
|---|---|---|---|---|---|
| **Ingreso contratado del mes** (cartera y cliente) | ¿cuánto entra? | magnitud sola | **Cifra hero** (48 px, misma sans, figuras proporcionales — nunca `tabular-nums` a ese tamaño) con la variación al lado: absoluto + %. **Una sola por pantalla.** | mes anterior **comparable**; el crudo va al lado, tachado | 1.1 · S-cap1 |
| **Ocupación % (cartera)** | ¿qué tan llena está? | ratio contra un límite | **Medidor**: pista en el paso tenue de la tinta de dato, relleno en la tinta, y la marca de referencia de agosto publicado con su rótulo. 513 marcas no señalarían ningún lugar al que ir. | agosto comparable (47,4 %) y agosto publicado (49,2 %) | 1.1 |
| **Ocupación % (cliente)** | ¿qué tan lleno está? | parte de un total | **Cifra + unidades discretas**: una marca por espacio, 254 marcas agrupadas por tipo, lo ocupado primero. Acá sí hay un lugar al que ir. | cartera (−4,5 pts) · agosto (−0,4 pts) | S-cap1 (cifra) · S-cap2 H3 (unidades) |
| **Ocupación por sede** | ¿qué sede rinde y cuál no? | ranking de partes | **Barras apiladas ordenadas, la peor arriba.** El largo son **espacios**, no porcentaje; el relleno son los tres estados con 2 px de aire de la superficie entre segmentos. Cifra y % al final, fuera de la barra. | una marca vertical por barra: **dónde terminaría lo ocupado si esa sede estuviera en el 42,9 % del cliente** | S-cap2 H1 · Informe §1 |
| **Tendencia 12 meses — ocupación** | ¿hacia dónde va? | cambio en el tiempo con **denominador móvil** | **Dos líneas de conteo en una sola escala de espacios** (comercializables tenue, ocupados fuerte). La ocupación se lee como la brecha. El mes sin snapshot es un **hueco**, no una recta entre vecinos; el mes en curso lleva su franja «parcial». | su propio pasado | 1.2 · S-cap1 |
| **Tendencia 12 meses — ingreso** | ¿hacia dónde va la plata? | cambio en el tiempo | **Línea en su propio panel**, misma rejilla de meses. Etiqueta sólo en el punto actual. | su propio pasado | 1.2 · S-cap1 |
| **Movimientos (entradas/salidas)** | ¿qué se ganó y qué se perdió? | flujo con signo en el tiempo | **Barras divergentes en pesos** sobre el eje de meses (entradas arriba, salidas abajo, ≤ 22 px de grosor) + **línea de saldo neto** en la misma escala. Etiquetas sólo en los dos extremos. | la línea del cero, dibujada fuerte | S-cap1 |
| **Espacios por estado** (libre / se libera / ocupado) | ¿cuánto hay para vender? | conteo | **Unidades discretas**, 9 px por espacio con 3 px de aire, agrupadas por tipo, con la **palabra** en la leyenda y el conteo por grupo. | — | S-cap2 H3 |
| **Canon promedio por tipo vs benchmark** | ¿cobra bien? | comparación contra referencia, por tipo | **Dumbbell** ordenado por brecha, el más negativo arriba: punto lleno = el cliente, punto hueco (anillo de la superficie) = la plataforma. La brecha escrita en % y las dos cifras al lado. El tipo sin contratos **no dibuja punto**: dice «sin contratos de este tipo». | benchmark de la plataforma | S-cap2 H5 · Informe §2 |
| **Spread % (cartera)** | ¿quién cobra por debajo de lo que dice que vale? | comparación contra referencia, por cliente | **Puntos sobre un eje con el cero marcado**, negativo a la izquierda, nombre al lado, y el ingreso sobre el que se calcula a la derecha. Los que no tienen tarifa **se cuentan aparte, en la frase y en la tabla**: no se dibujan en cero. | cero = su propia tarifa | 1.4 |
| **Proveedores: participación %** | ¿de quién depende? | partes de un total, ranking | **Énfasis**: Volcán en la tinta de dato, los cuatro siguientes en el paso tenue, los otros 20 en un solo bloque gris. Umbral de 40 % como línea vertical rotulada. Las 25 filas viven en la tabla. | umbral de concentración del sistema (40 % / 60 %) | S-cap2 H2 |
| **Contratos por vencer** | ¿qué se cae y cuándo? | hechos con fecha | **Riel de 60 días** (no 90) con hoy y el corte de fin de periodo marcados, cada contrato como un punto, y **dos tramos rotulados con su conteo y su plata**. Debajo, la lista ordenada por fecha: proveedor · código · tipo · plata · días · estado del espacio. | hoy (2026-09-07) y el fin del periodo (30-sep) | S-cap2 H4 |
| **Recomendaciones** | ¿qué hago primero? | ranking por valor y prioridad | **Lista ordenada**: acción · evidencia en una línea · valor. La prioridad es **palabra, orden y peso tipográfico**, nunca sólo color. Las medias y las bajas van plegadas en tabla. | los tres totales del capítulo 3 | S-cap3 |
| **Oportunidades** (espacio libre + candidatos) | ¿a quién le ofrezco qué? | asignación | **La fila es el grupo sede × tipo**, no el espacio: 148 filas → 20 grupos con cuántos, precio, **origen del precio**, candidatos por nombre y los códigos detrás de un `<details>`. | precio sugerido y de dónde sale | S-cap3 (escalones) · S-cap4 |
| **Adopción** (activa/dormida/fantasma/sin cuentas/nueva) | ¿quién no está usando lo que paga? | clasificación con conteo | **Unidades**: una marca por cliente, agrupadas por clase con la palabra y los nombres debajo. Relleno = entró en 30 días; hueco = no entró; **gris = no tiene cuentas, no se puede saber**. Y la clase es además la **columna «señal»** de la cola: no es un panel aparte. | — | 1.5 + columna de 1.3 |
| **Cohortes de adopción** | ¿los nuevos se quedan? | retención en el tiempo | **Tabla, 5 filas, sin gráfico.** Conteos primero («0 de 2»), porcentaje al lado con su `n`. | — | 1.5 |
| **Valor en juego total** | ¿cuánto vale hacer esto? | magnitud **compuesta** | **Tres cifras rotuladas, no una**, cada una con sus partes: oportunidad nueva ($ 172.872.500 = 166.957.500 de espacio + 5.915.000 de canon bajo su propio promedio) · ingreso en riesgo a 60 días ($ 19.742.500) · ingreso expuesto a un proveedor ($ 110.567.500). **La suma de las tres no se muestra.** | el ingreso contratado del mes (85,7 % · 9,8 % · 54,8 %) | S-cap3 |

### Lo que no es un gráfico y por qué

| Dato | Forma |
|---|---|
| Estado de cuenta (activo/gracia/solo lectura/suspendido) | **Chip con la palabra** en la fila del cliente. Sin color propio: no es un estado de espacio. |
| Cobertura (`clientes_incluidos`, `clientes_con_error`, `parcial`, `sin_dato`, `de_cache`) | **Una franja de pie contada**, en las tres piezas. |
| `contratos_fuera_del_plano` | **Una línea contada** al pie de la tabla de contratos. Nunca una categoría más del gráfico de estados: no hay cara que ocupar. |
| Zona, área m², marca | **Columnas de la tabla** del capítulo 4. |
| `benchmark_plataforma` | **Nunca solo.** Siempre como el punto hueco, la línea o el «contra qué» de otro dato. |
| Último acceso / días sin acceso | **Número de días + la palabra**, en la fila. `null` = «sin cuentas de usuario», no «0 días». |
| Reporte de transparencia | **Un enlace** en el capítulo 5. No se rediseña. |
| Estados de cuenta y supresiones | **Un cajón aparte** (1.6), con su conteo. Son operaciones, no análisis. |

---

## 2. Los cinco desvíos, con su medición

**Δ1 · La ocupación de la cartera es un medidor; la del cliente, unidades.** El brief pide
unidades que suman para las dos. Para un cliente es exactamente lo correcto: las 254 marcas
*señalan un lugar* (el bloque verde de la góndola es el hallazgo). Para la cartera, 513
marcas —3.000 con 30 clientes— no señalan nada: no hay un espacio al que ir.
`choosing-a-form.md`: *«a single ratio against a limit → meter»*. La forma sigue al trabajo,
y el trabajo cambia con el nivel.

**Δ2 · La tendencia de ocupación se dibuja en conteos, no en porcentaje.** El denominador se
mueve tres veces en cuatro meses: 445 → 553 (junio, TERRÓN) → 587 (agosto, Caribe) → 513
(septiembre, Guadual ilegible). Una línea de porcentaje dibuja un derrumbe de 16,4 puntos que
no ocurrió, y **ninguna anotación arregla un eje que miente**. Con dos líneas de conteo en una
sola escala, el escalón está en el dato. Cumple además la regla dura: una escala por gráfico,
nunca dos ejes.

**Δ3 · Las barras de sede miden espacios, no porcentaje.** Con barras de %, ARRAYÁN (8 de 12)
y VILLA (16 de 24) dibujan la misma barra y no son el mismo negocio. Con el largo en espacios,
TERRÓN es una barra nueve veces más larga que ARRAYÁN y casi vacía: **es el dibujo del
hallazgo**. El «contra qué» (la media del cliente) no puede ser una línea vertical única en un
eje de conteos, así que es **una marca por barra**, en la posición donde terminaría lo ocupado
si esa sede estuviera en el 42,9 %.

**Δ4 · El riel de vencimientos es de 60 días, no de 90.** `DIAS_POR_VENCER` es 60 y
`contratos_por_vencer_60d` es lo que trae el JSON. Un riel de 90 con datos de 60 deja un
tercio vacío que se lee como «no hay vencimientos en noviembre», y no es cierto: es que no se
miran.

**Δ5 · El valor en juego son tres cifras, no una.** Medido: `Σ recomendaciones[].valor_estimado_mensual`
= **$ 386.142.500** contra un ingreso de $ 201.667.500. El 1,9× no es una oportunidad, es un
error de suma: `sede_subutilizada:TERRON` ($ 82.960.000) son los mismos espacios que
`espacio_libre:gondola` + `cross` + `batea`, y `concentracion_proveedor` ($ 110.567.500) es
ingreso que **ya entra**. El total crudo se muestra **una vez, en el aviso que explica por qué
no existe**, y nunca como titular.

### Un desvío mío respecto del guion

**Δ-guion · «otros 20 proveedores» son 43 contratos y 38,7 %, no 38 y 34,2 %.** El guion §3.3
dice «otros 20 · 38 contratos · 34,2 %». Sumando `proveedores[5..24]` del JSON dan **43
espacios y 38,7 %** (y 68 + 43 = 111, que cierra con `contratos_activos_total`). La barra se
calcula en vivo desde el JSON, así que muestra 43 · 38,7 %. Cifra del dato, no del texto.

---

## 3. El ejemplo del brief: «113 góndolas libres», en cuatro escalones

Es el caso que el dueño puso como lo que **no** puede pasar. El texto de `explicacion` —que
trae los 113 códigos en un párrafo— **no se imprime nunca**: todo sale de `datos`.

1. **La frase** (siempre visible, una línea): *«Ofrecer 113 caras de góndola en oferta a
   $ 827.500 c/u — 96 en TERRON · 12 en NAVE · 5 en VILLA»*, con **$ 93.507.500 al mes** a la
   derecha. Tres números, tres lugares, un precio.
2. **El precio, contra algo** (misma tarjeta, un renglón): sale del promedio que Mercamío ya
   cobra; el de la plataforma es $ 910.000; **está cobrando 9,1 % menos que el mercado**; al
   benchmark las mismas 113 valdrían $ 102.830.000.
3. **A quién**: los tres candidatos por nombre con su canon promedio actual — y **Gaseosas
   Volcán va último, con «ojo: ya tiene el 41,4 % del cliente» pegado al nombre**. El sistema
   no puede recomendar en una tarjeta lo que desaconseja en la de al lado; el orden de los
   candidatos lo resuelve en el dibujo, no en una nota al pie.
4. **Los códigos**: tres `<details>` plegados, uno por sede, con el conteo a la derecha. Nunca
   se abren solos. Los que se liberan llevan su chip y su fecha.

La misma mecánica sirve para las otras seis recomendaciones de espacio y para las 148
oportunidades del capítulo 4: **la unidad que se muestra es el grupo (sede × tipo)**, y el
operador llega a cualquiera de los 148 espacios en dos clics.

---

## 4. El color, y el validador

Un solo sistema categórico —los cuatro estados de espacio de `tema.css`— y **una tinta de
dato** para todo lo que no es estado (`--dato` `#2E63C8` claro / `#4C89E8` oscuro) con su paso
tenue (`--dato-tenue` `#8FB3E8` / `#2F5EA6`). **No hay paleta de series y no hay par
divergente**: la polaridad de los movimientos y del spread la lleva la **posición sobre el
cero**, que es un canal más fuerte que el tono y no se puede confundir con nada. Un segundo
polo cálido colisionaría con el rojo `ocupado` (el guion §4.2 lo mide: ΔE 10,7 claro y 10,4
oscuro, bajo el piso de 15).

Un amarillo por pantalla, en la acción principal. **Verificado con Playwright: exactamente un
`.btn.principal` visible en cada una de las cinco pantallas, en claro y en oscuro.**

Corridas de `dataviz/scripts/validate_palette.js`, literales:

```
$ node validate_palette.js "#00805A,#CE8A0A,#D8342E,#2E63C8" --mode light --surface "#FFFFFF" --pairs all
Palette (light, surface #FFFFFF, categorical): 4 slots
  [PASS] Lightness band         all 4 inside L 0.43–0.77
  [PASS] Chroma floor           all 4 >= 0.1
  [PASS] CVD separation         worst all-pairs #D8342E↔#00805A ΔE 9.2 (protan) · tritan 4.3
  [PASS] Normal-vision floor    worst all-pairs #D8342E↔#CE8A0A ΔE 17.9 (normal)
  [WARN] Contrast vs surface    below 3:1 — relief required (visible labels or table view): [["#CE8A0A",2.89]]
  → ALL CHECKS PASS                                                                    exit=0

$ node validate_palette.js "#00805A,#CE8A0A,#D8342E,#2E63C8" --mode light --surface "#EFF1ED" --pairs all
  [PASS] Lightness band · [PASS] Chroma floor
  [PASS] CVD separation         worst all-pairs #D8342E↔#00805A ΔE 9.2 (protan) · tritan 4.3
  [PASS] Normal-vision floor    worst all-pairs #D8342E↔#CE8A0A ΔE 17.9 (normal)
  [WARN] Contrast vs surface    below 3:1 — relief required: [["#CE8A0A",2.54]]
  → ALL CHECKS PASS                                                                    exit=0

$ node validate_palette.js "#00BE86,#F5A524,#F4544E,#4C89E8" --mode dark --surface "#0B1116" --pairs all
  [FAIL] Lightness band         outside band: [["#00BE86",0.709],["#F5A524",0.782]]
  [PASS] Chroma floor           all 4 >= 0.1
  [WARN] CVD separation         worst all-pairs #F4544E↔#00BE86 ΔE 7.5 (deutan) · tritan 9.2
  [PASS] Normal-vision floor    worst all-pairs #F4544E↔#F5A524 ΔE 18.7 (normal)
  [PASS] Contrast vs surface    all 4 >= 3:1
  → FAILED — fix the marked checks                                                     exit=1

$ node validate_palette.js "#8FB3E8,#2E63C8" --mode light --surface "#FFFFFF" --ordinal
  [PASS] Lightness monotone · [PASS] Adjacent ΔL · [PASS] Light-end contrast 2.15:1 · [PASS] Single hue (4°)
  → ALL CHECKS PASS                                                                    exit=0

$ node validate_palette.js "#2F5EA6,#4C89E8" --mode dark --surface "#0B1116" --ordinal
  [PASS] Lightness monotone · [PASS] Adjacent ΔL · [PASS] Light-end contrast 2.96:1 · [PASS] Single hue (0°)
  → ALL CHECKS PASS                                                                    exit=0

$ node validate_palette.js "#AAB3BE" --mode light --surface "#FFFFFF"
  [PASS] Lightness band
  [FAIL] Chroma floor           below floor (reads gray): [["#AAB3BE",0.019]]
  [WARN] Contrast vs surface    below 3:1: [["#AAB3BE",2.12]]
  → FAILED                                                                             exit=1

$ node validate_palette.js "#2E63C8" --mode light --surface "#FFFFFF"   → ALL CHECKS PASS  exit=0
$ node validate_palette.js "#2E63C8" --mode light --surface "#EFF1ED"   → ALL CHECKS PASS  exit=0
$ node validate_palette.js "#4C89E8" --mode dark  --surface "#0B1116"   → ALL CHECKS PASS  exit=0
$ node validate_palette.js "#4C89E8" --mode dark  --surface "#04070A"   → ALL CHECKS PASS  exit=0
```

**Los tres `exit=1` son esperados y están cubiertos:**

- **El gris `--resto`** reprueba el piso de croma porque **se lee gris, que es exactamente su
  trabajo**: «no se alquila / sin dato». No entra en la corrida categórica; se verifica con
  contraste WCAG, no con el gate de croma.
- **La terna oscura** sale de la banda de claridad. Es una **desviación conocida y ya
  documentada en `tema.css` (líneas 55-72)**: bajar la claridad para entrar en banda hunde el
  par ámbar↔rojo a ΔE 3,5 en deuteranopía, muy por debajo del piso de 15. Las dos
  compensaciones son regla acá, sin excepción: **(1)** cada estado va siempre con su palabra
  (leyenda y tabla), **(2)** todo relleno de estado lleva su borde o su aire de 2 px. No propongo
  cambiar los hex.
- **El `WARN` del ámbar** (2,89:1 sobre la tarjeta, 2,54:1 sobre el papel) está cubierto por lo
  mismo: el «se libera» nunca aparece sin la palabra al lado y sin su fecha.

**La tinta de dato no empeora ni un solo par:** los dos peores pares con `#2E63C8` adentro son
exactamente los mismos que sin él (rojo↔verde 9,2 protan; rojo↔ámbar 17,9 normal), con los
mismos ΔE.

### Una corrección medida sobre `tema.css`

`--ink-4` (`#68788A`) está anotado en `tema.css` como **4,52:1 sobre blanco — «es TEXTO
(rótulos chicos, placeholders)»**. Sobre el **papel** (`--bg` `#EFF1ED`), que es el fondo del
documento, el mismo color da **3,98:1** y no llega al piso de 4,5:1. Medido con Playwright:
26 textos en la cartera y 67 en la sesión por debajo del piso. **Todo el texto de esta opción
usa `--ink-3` (`#54646E`, 5,36:1 sobre el papel) como escalón más tenue**; `--ink-4` queda
sólo para trazos y guías dentro de los SVG, que están sobre `--surface` blanco. Es un hallazgo
para el port, no un problema de esta maqueta.

---

## 5. Qué dejé afuera, y por qué

- **La torta, el anillo y cualquier gráfico de una sola barra.** Una magnitud sola es una
  cifra. `anti-patterns.md`, y el brief lo pide igual.
- **Una línea de porcentaje de ocupación en el tiempo.** Ver Δ2: con este denominador miente.
  El porcentaje sigue estando, rotulado, en la tabla de los 12 meses.
- **Un total de «valor en juego».** Ver Δ5. El número crudo aparece una sola vez, adentro del
  aviso que explica por qué no existe.
- **Veinticinco barras de proveedores.** `choosing-a-form.md` y `anti-patterns.md` cortan en
  ~7 clases; y la pregunta «¿de quién depende?» tiene **una** respuesta. Énfasis + tabla.
- **Un gráfico de cohortes.** Cinco filas con n = 1 o 2. Una tabla dice más, y con menos
  mentira: «0 de 2» en vez de «0 %».
- **La barra «otros» de proveedores en la CARTERA.** Ahí sólo hay `top_proveedores` (5) y **no**
  el total de contratos por cliente: un porcentaje sin denominador publicado es un número
  inventado. En la cartera el top 5 son conteos; la participación sólo existe en el detalle.
- **El conteo de contratos activos de la cartera.** Se puede despejar
  (382.107.500 ÷ 1.540.756 ≈ 248) y no es un dato. La pantalla lo dice y no lo muestra.
- **El texto de `recomendaciones[].explicacion`.** Es literalmente el ejemplo que el dueño puso
  como lo que no puede pasar. Todo se arma desde `datos`.
- **La tarifa de referencia del cliente.** Nunca sale de su base: sólo su relación
  (`spread_pct`) y si existe (`tarifa_configurada`). En el informe del cliente, además, **fuera
  la comparación contra la cartera**: le contaría cómo les va a los otros supermercados. Su
  «contra qué» es el benchmark anónimo por tipo.
- **Las palabras «fantasma», «gracia», «dormida» y el orden de la cola, en el informe del
  cliente.** Son juicios internos del operador.
- **Un tooltip como único camino a un valor.** No hay ninguno: todo gráfico tiene su tabla
  equivalente alcanzable sin hover (abierta en el informe impreso, plegada en pantalla), y
  cada marca lleva su etiqueta directa o vive en una tabla del capítulo 4.
- **Un selector de periodo que miente.** El JSON del analista trae **un solo periodo cargado**.
  Elegir otro mes muestra un aviso que lo dice con todas las letras en vez de repintar el
  rótulo sobre los mismos números.
- **El plano de la sede.** El JSON no trae geometría (sólo `sede`, `zona`, `area_m2`), así que
  el ancla de las 96 caras de TERRÓN es el grupo plegable y no el dibujo. **Es el hueco
  consciente de esta opción**: el guion pide «el plano se enciende al abrir un grupo» y eso
  necesita datos que este ejemplo no tiene. El lugar donde iría está reservado: el `<details>`
  de cada sede.

---

## 6. Verificación (Playwright, `chromium-1194`)

Nueve pasadas: cartera / sesión / informe / sesión-arranque en 1440×900 claro; cartera y
sesión en 1440×900 oscuro; cartera y sesión en 1366×768; cartera en 390×844.

| Medición | Resultado |
|---|---|
| Errores y *warnings* de consola | **0** en las nueve pasadas |
| Textos pisados dentro de los SVG (pares de `<text>` con solapamiento > 1,5 px) | **0** |
| Textos que desbordan la caja de su figura | **0** |
| Textos por debajo de su piso WCAG (4,5:1, o 3:1 si ≥ 24 px / ≥ 18,66 px en negrita), DOM y SVG | **0** |
| `--signal` (el amarillo) visible por pantalla | **1**, siempre en la acción principal |
| Scroll horizontal del documento | ninguno: `scrollWidth == innerWidth` en 1440, 1366 y 390 |
| Titular de la cartera visible sin scroll en 1366×768 | sí (termina en y = 373 de 768) |
| Impresión del informe (A4, media `print`) | 4 páginas; barra, índice y botón ocultos; la hoja entera con sus tablas abiertas |

Ejecutable: `node probar.mjs` (en el scratchpad de la sesión) contra
`file://…/opciones/A-el-informe/index.html`.

---

## 7. Qué mediría para saber si funciona

Esto no se decide mirando la pantalla: se decide mirando lo que hace el operador.

**En los primeros diez segundos** (test de pasillo, sin explicar nada, con el cronómetro):

1. **Nombre de la primera llamada.** Se le muestra la cartera 10 s y se le tapa. ¿Dice
   «Mercado El Guadual» o «Tiendas La Vereda»? Meta: 8 de cada 10.
2. **La trampa del titular.** «¿La cartera perdió plata este mes?» La respuesta correcta es
   *no, subió 1,9 %; el que cayó fue el número crudo porque Guadual no se dejó leer*. Meta: 7
   de cada 10 sin leer la tabla de composición. Si falla, la corrección está demasiado abajo.
3. **La trampa de la ocupación.** «¿Por qué cayó la ocupación de 63,8 % a 47,4 %?» Si alguien
   contesta «se perdieron contratos», el gráfico de conteos no está haciendo su trabajo y hay
   que volver a la anotación.

**En la sesión, con un cliente delante:**

4. **Tiempo hasta la primera acción dicha en voz alta.** Desde que abre Mercamío hasta que
   dice «te ofrezco las 113 góndolas de TERRÓN a $ 827.500». Meta: < 30 s.
5. **La contradicción de Volcán.** ¿Nombra a Café Tinajo o a Gaseosas Volcán como primer
   candidato? Si nombra a Volcán, el orden de las tarjetas de candidato falló y hay que
   subir el aviso.
6. **Profundidad de uso del capítulo 4.** Con telemetría: ¿cuántas sesiones abren «Los datos
   detrás»? Si es **casi ninguna**, el resumen está funcionando; si es **casi todas**, el
   resumen no está contestando y el detalle lo está tapando. Las dos son señales, y la
   segunda es una alarma.
7. **Cuántos clics hasta un espacio concreto.** Debe ser 2 (grupo → código). Si aparecen
   sesiones con 5+ clics buscando un código, falta el buscador arriba, no más tabla.

**En el informe del cliente:**

8. **Cuántos informes se imprimen o comparten por sesión de asesoría.** Si el operador arma
   el informe y no lo manda, la pieza no está lista para el gerente.
9. **Preguntas que el gerente devuelve por escrito.** Cada pregunta del tipo «¿de dónde sale
   este número?» es un «contra qué» que falta. Meta: cero en el segundo mes.

**Transversal:**

10. **Errores de lectura reportados por el equipo.** Cualquier frase del tipo «pensé que…»
    (que la cartera perdió plata, que Mercamío tiene $ 386 millones en juego, que la cohorte
    2025-02 es un problema estadístico) se anota como **trampa de lectura** y se arregla en el
    dibujo, no en un pie de página. Las seis que el guion ya identificó están desarmadas en la
    pantalla; la lista tiene que quedar abierta.
