# D · La fusión

`index.html` — autocontenido, se abre con doble clic. Un archivo, cero recursos
externos, cero librerías, cero llamadas de red (el único `http://` es el
namespace de SVG). Claro por defecto; el oscuro, completo, está a un clic en el
sol/luna y queda recordado en `localStorage` bajo `recabra-tema`.

**La base es B.** De A entran tres cosas, exactamente tres: el resaltado que
apaga la sala, el módulo 02 entero y el rótulo sobre el mueble. Encima van los
cuatro hallazgos que el director marcó como obligatorios contra B.

---

## 1 · Qué es de B (la base, sin discusión)

- **La composición y el presupuesto vertical.** Cuatro paneles numerados
  `01 · 02 · 03 · 04` con el conector de E, plano arriba a la izquierda,
  escalera debajo, contrato a la derecha con lugar fijo, tarifa abajo. Los
  cuatro alinean fila con fila.
- **El plano de NAVE, literal**: el SVG que sale de `riel.py` con las 106 piezas
  medidas, la sala, los muros, **ENTRADA y CAJAS** y la reja del piso. No se
  rehízo ni se regeneró: se le quitaron las 23 etiquetas flotantes de B (guía +
  punto + código al costado) y se le puso el rótulo de A encima del mueble.
- **El título grande de la escalera en el encabezado del panel**:
  «si arrancás el **26 de sep** → **17** libres», display 800 a 21 px, reescrito
  por el cursor. Es el mejor hallazgo de B y **se queda donde estaba** aunque el
  gráfico de abajo sea el de A.
- **La ficha del contrato**: filas mono con el código a 17,5 px, separador
  punteado, campos, el total en tinta a 30 px, los sellos de temporada y el
  único botón amarillo.
- **La clave de cinco estados en el encabezado del plano**, con «En el contrato»
  como cuarto estado contado.
- **Los datos reales de NAVE**: 23 espacios comercializables entre 106 muebles,
  15 libres · 5 se liberan · 3 tomados, periodo 31 ago → 30 sep, contrato de
  ALPINA / Alpinito sobre PUN-05 (`$1.050.000`) e ISL-04 (`$1.200.000`),
  15 sep → 14 nov, 61 días, `$4.575.000` calculado en la página.
- **Los tokens de `tema.css`** (los dos modos completos), la escala de ocho
  pasos `--t-3xs … --t-xl`, el rail píldora, `--ring` en tinta y el amarillo una
  sola vez.

## 2 · Qué es de A (las tres cosas, y nada más)

### 2.1 · El resaltado que apaga la sala

Pasar el mouse por **una fila de la tarifa de referencia** apaga la sala entera
al 20 % y deja encendidos los muebles de ese tipo (los libres y los que se
liberan). El **mismo mecanismo**, con el mismo código, desde **los chips de la
escalera** y desde **las filas del contrato**. Una sola función, `destacar()`:
pone `data-foco="1"` en la escena y `.mk` en las piezas y en sus rótulos. El
apagado es CSS sobre los hijos directos de `#escena`, no un repintado por JS.

El plano, por su lado, conserva el toque suave de B: pasar por un mueble lo
enciende y le dibuja el aro de tinta sobre la tapa, pero **no** apaga la sala —
apagarla al cruzar el mouse por el plano era ruido, y en A tampoco pasa.

### 2.2 · El módulo «Cuándo se libera cada espacio», entero

El panel 02 de B se reemplazó por la **escalera A·4 de A**, con sus cuatro
decisiones intactas y su cursor vivo:

- **Sin columna lateral y sin eje vertical**: cada meseta lleva su cifra al
  inicio (15 · 17 · 18 · 20) y la nota «sin cambios durante 25 días».
- **Peine de días**: un diente por día, largo cada cinco.
- **El cursor sigue al mouse de verdad** (y a `←` `→` con el teclado): línea
  punteada, anillo sobre el escalón, y la lectura se reescribe día a día.
  **La lectura no vive adentro del SVG**: sube al encabezado del panel, que es
  la aportación de B. Por eso el `gLee` de A no está.
- **Los chips de los códigos bajo su fecha** (`PUN-03`/`PUN-04` el 25,
  `PUN-17` el 27, `EXP-01`/`EXP-02` el 29), con `PUN · PUNTA DE GÓNDOLA` y
  `EXP · EXHIBICIÓN DE PISO` como rótulos de tipo a la izquierda. Pasar por un
  chip resalta ese mueble en el plano. Los que el cursor ya pasó quedan con el
  borde encendido — es lo único de B que sobrevive dentro del módulo, porque es
  parte de que el cursor esté vivo y no cambia el dibujo de A.
- **La banda de la temporada detrás** (Amor y Amistad), que explica por qué las
  entregas caen juntas.
- Se fue el subtítulo «de 15 hoy a 20 al cerrar»: el gráfico ya escribe el 15 y
  el 20 (es el hallazgo G5 del director, y era el que liberaba el alto del
  encabezado para el título grande).

**El viewBox del gráfico es exactamente su caja en pantalla** (974 × 202), así
que la escalera dibuja a escala 1 y sus tres tamaños caen sobre pasos de la
escala (10,5 · 11,5 · 15) en vez de derivar a 10,3 · 11,3 · 14,7.

### 2.3 · El rótulo sobre el mueble

Un `<text>` con **dos `<tspan>`** —el código y `libre 25 sep`—, sobre la tapa
del mueble:

- **Tamaño constante en pantalla.** El grupo publica `--lbl: 10.5px / escala`,
  donde *escala* es la del SVG por el acercamiento vigente. El rótulo mide
  **10,50 px medidos con `getScreenCTM` en los tres zooms**, no 11,7 ni 5,9.
- **Interlineado en `em`** (`dy="1.18em"`), que sigue al cuerpo: las dos líneas
  no se pisan a ningún acercamiento. La primera línea entra con `dy="-.22em"`
  cuando hay fecha y con `dy=".36em"` cuando el rótulo es de una sola línea, así
  el bloque queda centrado sobre la tapa en los dos casos.
- **Halo por `paint-order:stroke`**, en el color del piso, con el grosor atado a
  `--lbl` (`.30`, y `.42` cuando el mueble está en el contrato y el código se
  invierte). **Sin caja**: no hay rectángulo blanco de ancho fijo que pueda
  desbordar ni pintar blanco en oscuro. `GON-60·A`, de ocho caracteres, entra
  sin desbordar nada.
- **Las dos caras de una góndola se anclan en puntas opuestas.** Las tres
  góndolas de dos caras se partieron en dos grupos, uno por cara (flanco
  derecho + media tapa para la cara A, flanco izquierdo + la otra media tapa
  para la B), y cada rótulo se corre **16 unidades** hacia su propio lado sobre
  el eje que separa las dos caras. Quedan a 6,1 px, cada uno sobre su cara.
- **La misma capa para los 23.** Los rótulos viven en un `<g id="rotulos">`
  dibujado después de los 106 muebles. Es la corrección que costó una vuelta:
  con el rótulo colgando de su pieza (como en A) los prismas de adelante le
  comían media palabra a `PUN-17` y a `EXP-02`. Arriba de todo, con el halo,
  ninguna letra queda partida.

**El plano acerca y aleja** — rueda, arrastre y `+ / − / Centrar` en la esquina.
Sin eso, «tamaño constante en pantalla» sería una promesa sin manera de
probarla; con eso es la razón de ser del rótulo.

---

## 3 · Los cuatro hallazgos obligatorios contra B

| Hallazgo | Cómo se resolvió | Medición |
|---|---|---|
| **El pie de la tarifa se cortaba** dentro de un `div` con `overflow` | La fila de abajo de la retícula pasó de 246 a **254 px**; el encabezado de panel bajó un punto de relleno; las filas de la tabla bajan a `padding:2px` y el pie a 11,5 px; los anchos de columna se fijaron para que ni el encabezado ni el pie envuelvan | pie del panel a **870,5 px**, panel hasta 888: **17,5 px de aire**. `scrollHeight − clientHeight = 0` en `.tabla`, y **0 contenedores con scroll escondido en toda la página** |
| **`+5` y `20` se leían «+520»** | `th+th, td+td { padding-left:12px }`. **Las cifras no se tocaron**: dicen `15 +5` y `20 al cerrar` | 12 px entre el `+5` y el `20` |
| **El contrato sin holgura con dos espacios** | Proveedor y Marca pasan a una sola fila (como Desde/Hasta), se recortaron rellenos, y **el aire de abajo lo pone ahora un margen de `.acciones` y no el relleno del panel**: los 12 px se ven *y* se cuentan como contenido, así que la ficha avisa antes de romper. La válvula declarada de B sigue | 2 espacios → **12,0 px de holgura** medidos como el director (`fondo del cuerpo − relleno − fondo de .acciones`), `sh = ch`, en 1440×900, 1440×800 y 1366×768; 3 espacios → **0 escondido** en 1440×900 y 1440×800; 4 → rueda |
| **El objetivo del clic pasa del rótulo al mueble** | El botón es el grupo `.pz` entero: los prismas **más** una caja de impacto transparente que cubre el área del rótulo. El `<text>` es `pointer-events:none`, así que el rótulo ya no cobra el clic: lo cobra el mueble | objetivo **mínimo 2.175 px² · mediana 3.438 · máximo 4.631**; **0 de 23 por debajo de 44×44**; clic en el centro del rótulo cae en su propio mueble **23 de 23** |

---

## 4 · Cada choque de rótulos, y cómo se resolvió

**El ancla por defecto no está escrita a mano: se calcula.** Para cada mueble se
toma el centroide de su polígono de tapa, tal como sale del SVG de B. Así los 23
rótulos están **a la misma distancia del mueble —cero— y alineados igual**: al
centro de la tapa. De ahí se sale sólo cuando hay que salir, y siempre con el
mismo valor.

### 4.1 · Los tres pares que se pisaban con el ancla al centro

Medidos antes de tocar nada, a 1440×900 en el zoom inicial:

| Par | Cómo se pisaban | Qué se movió | Resultado |
|---|---|---|---|
| `PUN-03` × `EXP-01` | solape de **25,4 × 22,1 px** (misma altura, dos rótulos de dos líneas a 50 px) | `EXP-01` **20 unidades a la izquierda**, `PUN-03` **20 a la derecha** — cada uno sigue sobre su propio mueble | 10,6 px de holgura |
| `PUN-05` × `EXP-02` | solape de **13,3 × 11,5 px** | `EXP-02` **20 a la izquierda**, `PUN-05` **20 a la derecha** | 22,7 px |
| `PUN-04` × `ISL-04` | a **1,1 px** de tocarse | `ISL-04` **20 unidades hacia abajo** (al frente de su isla) | 14,0 px |

**Son cinco anclas corridas y todas exactamente 20 unidades** (18 px en el zoom
inicial), en una de las cuatro direcciones. No hay un solo desplazamiento
«a ojo» de otro valor.

### 4.2 · Las góndolas de dos caras

`GON-60`, `GON-61` y `GON-67` son un solo mueble con dos caras que se venden por
separado. Los dos rótulos se anclan **en puntas opuestas**, corridos 16 unidades
sobre el eje que separa las dos caras, cada uno del lado de la cara que nombra.
Quedan a **6,1–6,2 px** uno de otro, con separación vertical suficiente para que
las cajas no se crucen nunca. `GON-60` además se lee: la cara A está tomada
(roja) y la B libre (verde), y cada rótulo está sobre su color.

### 4.3 · El resto lo resuelve una regla, no una lista

Después de colocar, en cada acercamiento se miden las cajas y se aplica un orden
de prioridad. **Dos cajas se consideran pisadas si se cruzan o si se acercan a
menos de 2 px** — un rótulo pegado a otra letra se lee mal aunque no la toque.

1. **Lo que flota encima manda**: el pill del periodo y las herramientas
   (`+ − Centrar`).
2. **ENTRADA y CAJAS** están pintados en el piso y crecen con el plano, y juegan
   con las mismas reglas que los demás: **ceden** si pasan por debajo del
   periodo o de la herramienta, **ceden si se salen del lienzo**, y ceden
   también cuando el plano se aleja tanto que la palabra deja de serlo (por
   debajo de 8 px en pantalla). Si no, quedan como obstáculo fijo.
3. **Los 23 rótulos**, por orden: primero los que llevan fecha, después los
   libres, después los tomados. El que se cruza con algo ya aceptado, o el que
   se sale del lienzo, **cede** — y vuelve solo en cuanto el acercamiento le
   abre lugar. Nunca se achica: el cuerpo es constante.

**Y la medición no le pregunta al navegador: la calcula.** Es el cambio que
importa. Preguntar por el rect de un rótulo justo después de escribir el
`transform` —o dentro de un `requestAnimationFrame`, que corre *antes* de
rehacer el dibujo— devuelve la geometría del paso anterior: la pasada no
converge y aparecen choques reales. Ahora:

* el rótulo mide siempre lo mismo **en pantalla** (`--lbl` son 10,5 px a todo
  acercamiento), así que su ancho y su alto se miden **una vez** y ya no cambian;
* de ENTRADA y CAJAS, que sí crecen con el plano, se guarda el tamaño **en
  unidades del plano**, que tampoco cambia, y se multiplica por la escala;
* lo único que se mueve es el ancla, y el ancla la da `aPantalla()`, que aplica
  el `viewBox`, el arrastre y el acercamiento **que acabamos de escribir**.

Esa medición única es `calibrar()`: corre al arrancar, al terminar de cargar y
cuando la tipografía queda lista, encolada **dos cuadros** (el primero aplica, el
segundo ya pintó) y **repetida hasta que dos pasadas dan lo mismo**. `acomodar()`
—que decide quién cede— es desde entonces aritmética pura, sin una sola lectura
de geometría del plano, y da el mismo resultado en la primera pasada que en la
décima.

También se les quitó el «crece un punto al pasar el mouse» que traía B: cambiar
el tamaño del rótulo al apuntarlo es la manera más fácil de fabricar un choque
que la medición no ve.

---

## 5 · La tabla de mediciones

Todo medido con Playwright sobre el archivo entregado
(`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`), en **1440×900**, en los
**dos modos**.

### 5.1 · Rótulos del plano: cero intersecciones en los tres zooms

Se miden los rects de **todos** los `<text>` del plano (los 23 rótulos + ENTRADA
+ CAJAS) **y** de los textos HTML que flotan encima (el pill del periodo y los
tres botones de herramienta), y se cruzan todos contra todos.

| Zoom | Textos medidos | **Choques** | Holgura mínima | Rótulos que ceden | Tamaño del rótulo |
|---|---|---|---|---|---|
| **inicial (1×)** | 29 (25 SVG + 4 HTML) | **0** | 4,6 px (`ISL-03` ↔ ENTRADA) | **0** — los 23 se ven | **10,50 px** |
| **1,5×** | 27 | **0** | 5,0 px (entre `+` y `−`, que es fijo) | 2 (`CAR-01`, `ISL-05`, fuera del encuadre) | **10,50 px** |
| **2×** | 20 | **0** | 5,0 px (entre `+` y `−`) | 9 (todos fuera del encuadre) | **10,50 px** |

Idéntico en claro y en oscuro.

**Barrido, por si el centro del lienzo fuera un caso amable:** 7 acercamientos
(1 · 1,25 · 1,5 · 1,75 · 2 · 2,5 · 3×) × 9 puntos de la rueda repartidos por
todo el plano = **63 encuadres, 1.284 cajas de texto medidas, 0 choques**,
holgura mínima **2,4 px**, y **los 23 rótulos aparecen en algún encuadre**.

### 5.2 · Holgura de cada rótulo en el zoom inicial

Distancia al texto más cercano, sea otro rótulo, ENTRADA/CAJAS o un texto del
HUD. Ancho × alto en px de pantalla.

| Rótulo | Caja | Holgura | Vecino más cercano |
|---|---|---|---|
| `ISL-03` | 38 × 12 | **4,6** | ENTRADA |
| `GON-60·A` | 51 × 12 | 6,1 | `GON-60·B` |
| `GON-60·B` | 51 × 12 | 6,1 | `GON-60·A` |
| `GON-61·A` | 51 × 12 | 6,1 | `GON-61·B` |
| `GON-61·B` | 51 × 12 | 6,1 | `GON-61·A` |
| `GON-67·A` | 51 × 12 | 6,2 | `GON-67·B` |
| `GON-67·B` | 51 × 12 | 6,2 | `GON-67·A` |
| `FRU-05` | 38 × 12 | 6,8 | `FRU-01` |
| `FRU-01` | 38 × 12 | 6,8 | `FRU-05` |
| `EXP-01` | 76 × 24 | 9,9 | CAJAS |
| `PUN-03` | 76 × 24 | 10,6 | `EXP-01` |
| `BEB-01` | 38 × 12 | 11,9 | `BEB-02` |
| `BEB-02` | 38 × 12 | 11,9 | `BEB-01` |
| `BEB-03` | 38 × 12 | 11,9 | `BEB-02` |
| `ISL-05` | 38 × 12 | 13,6 | `ISL-03` |
| `PUN-04` | 76 × 24 | 14,0 | `ISL-04` |
| `ISL-04` | 38 × 12 | 14,0 | `PUN-04` |
| `ISL-06` | 38 × 12 | 15,0 | `ISL-03` |
| `FRU-04` | 38 × 12 | 16,7 | `FRU-01` |
| `EXP-02` | 76 × 24 | 22,7 | `PUN-05` |
| `PUN-05` | 38 × 12 | 22,7 | `EXP-02` |
| `PUN-17` | 76 × 24 | 31,3 | `GON-60·A` |
| `CAR-01` | 38 × 12 | 85,4 | `PUN-17` |

Las 23 cajas miden **12 px de alto (una línea) o 24 (dos)** y **38, 51 o 76 de
ancho** según el código: tres anchos, dos altos, un solo cuerpo. Eso es el
«se ve ordenado» en números.

### 5.3 · La pantalla · **la hoja llena la ventana, no 900 px**

El alto ya no está escrito en el archivo. La hoja toma `100dvh`, el marco se le
resta, y **la rejilla reparte lo que queda entre las dos filas en la proporción
de B (550 : 254)**, con un piso por fila:

```
hoja  = 100dvh − marco superior − rail − hueco − marco inferior
filas = minmax(--fila1, 550fr)  /  minmax(--fila2, 254fr)
ancho = 1004fr : 402fr
```

`--fila1` (448 px) y `--fila2` (240 px) son lo que miden, apretadas, la ficha del
contrato y la tabla de la tarifa. Y hay un solo apretón, en `@media
(max-height:880px)`: **cinco fichas de marco** (`--marco-t/-x/-b`, `--aire`,
`--rail-h`) y una lista de rellenos e interlineados. **Ni un cuerpo de la escala
se mueve, ni el amarillo, ni un color.** En 1440×900 la composición es
**idéntica** a la que el director aprobó: 8 + 56 + 10 + 814 + 12, filas de 550 y
254 px.

Si la ventana no da ni para los dos pisos (menos de 760 px de alto), la pantalla
deja de fingir que es una hoja fija y **rueda como cualquier documento**: nada se
esconde, todo se alcanza.

| Ventana | Documento `sh / ch` | Escondido en toda la página | Botón amarillo | «Guardalo como reserva» | Pie de la tarifa |
|---|---|---|---|---|---|
| **1440×900** | 900 / 900 | **0** | entero, 56,1 px de aire | entero, 24 px | entero, 9 px |
| **1366×768** | 768 / 768 | **0** | entero, 48,1 px | entero, 22 px | entero, 8 px |
| **1440×800** | 800 / 800 | **0** | entero, 48,1 px | entero, 22 px | entero, 8 px |
| **1600×900** | 900 / 900 | **0** | entero | entero | entero |
| **1920×1080** | 1080 / 1080 | **0** | entero | entero | entero |
| **1280×800** | 800 / 800 | **0** | entero | entero | entero |
| **390×844** | rueda (documento, visible) | **0** | entero | entero | entero |

Idéntico en los dos modos. **0 errores de consola** en las 14 sesiones.
Los tres textos que el director puso como prueba —el botón que cierra la venta,
su alternativa y la cuenta que la respalda— se ven enteros y sin rodar en las
tres resoluciones de portátil.

### 5.4 · Tipografía renderizada

| px en pantalla | Cuántos | Qué es |
|---|---|---|
| 10 | 17 | versalitas y rótulos pill (`--t-3xs`) |
| **10,5** | 32 | **los 23 rótulos del plano** (`--lbl`, constante) + los rótulos del gráfico |
| 11,2 | 2 | ENTRADA y CAJAS — pintados en el piso, escalan con el plano a propósito |
| 11,5 | 20 | notas, pies, ejes, chips (`--t-2xs`) |
| 12,5 | 9 | secundario (`--t-xs`) |
| 13,5 | 28 | cuerpo y tablas (`--t-sm`) |
| 15 | 13 | títulos de panel, campos, cifras del gráfico (`--t-base`) |
| 17,5 | 3 | códigos del contrato (`--t-md`) |
| 21 | 2 | la lectura de la escalera (`--t-lg`) |
| 30 | 1 | el total del contrato (`--t-xl`) |

**Diez tamaños renderizados** contra los 13 de B: los ocho pasos declarados, el
rótulo constante, y los nombres de sala que escalan con el plano por diseño.
Ninguno baja de 10 px.

ENTRADA y CAJAS son la única letra que **no** tiene tamaño propio: están pintados
en el piso y miden lo que mide el piso. En 1440×900 son 11,2 px; en una ventana
más chica o con el plano alejado bajan, y **por debajo de 8 px en pantalla ceden
como cualquier otro rótulo** — a 390 px, donde antes quedaban en 4,2 px, ahora
no están y el mínimo real de la pantalla vuelve a ser **10,00 px**.

### 5.5 · Que funcione

| Prueba | Resultado |
|---|---|
| Tocar `ISL-05` en el plano | `$4.575.000` → **`$7.015.000`**, la clave pasa a 3, la fila «Isla» de la tarifa se marca |
| Volver a tocarlo | `$4.575.000` |
| `Enter` sobre `BEB-02` con el teclado | `$5.429.000` |
| Tocar `GON-60·B` (cara libre) | `$5.042.667` — entra sólo esa cara |
| Tocar `GON-60·A` (cara tomada) | no entra: el contrato sigue con los mismos espacios |
| Cursor de la escalera al principio / al final | «si arrancás el **3 de sep** → **15** libres» / «el **30 de sep** → **20** libres» |
| Aritmética | (1.050.000 + 1.200.000) × 61 / 30 = **4.575.000**, exacto |
| Contraste de la «×» de quitar | **5,75 : 1** (era 4,24 en A y en B) |
| 390 px | sin desborde horizontal; **el plano mide 344 px y la escalera 974** (escala 1, rótulo de 10,5 px exactos), y arranca por los escalones; **0 choques, 0 ancho escondido en la tabla, la píldora del periodo entera** — en B el plano y la escalera quedaban en `width: 0` |

### 5.6 · Las reglas duras

| Regla | Verificación |
|---|---|
| Amarillo sólo en «Guardar contrato y avisar» | `var(--signal)` aparece **1 vez** en el archivo, en `.btn-principal` |
| `--ring` en tinta | `--ring: var(--ink-1)` en los dos modos: ni con foco de teclado hay un segundo amarillo |
| Claro por defecto con oscuro a un clic | `data-tema="claro"` en el `<html>`; el sol/luna es un `aria-pressed` real y recuerda en `localStorage` |
| Cero recursos externos | 0 `<link>`, 0 `<script src>`, 0 `@import`, 0 tipografías; ningún `src`/`href` a un archivo. El único `url()` es `url(#pta)`, la punta de flecha de ENTRADA |
| Pilas de sistema | `--f-display`, `--f-text` y `--f-mono` con `ui-monospace` y `-apple-system` a la cabeza |
| Vender la ve el proveedor | grep de proveedores ajenos, `ranking`, `canon`, `vence`, `facturación`, `recaudo`, `margen` y las cifras de la sede sobre **todo el fuente, comentarios incluidos**: **0**. El único proveedor nombrado es ALPINA, que es el que está sentado enfrente. Un mueble tomado dice que lo está y, si se libera adentro del periodo, cuándo — nunca de quién |
| HTML balanceado | 581 etiquetas, 0 sin cerrar, 0 desbalances |

---

## 6 · Lo que además se arregló, y por qué se tocó

Tres cosas del listado del director que no estaban entre las obligatorias pero
cuestan una línea y estaban medidas:

- **`ISL-04` ahora tiene su línea de ubicación** («frente a la entrada»), que ya
  estaba en los datos de B pero sólo se pintaba en la primera fila. La ficha que
  quiere ser «una sola ficha» no puede tener filas asimétricas.
- **La «×» de quitar un espacio** pasó de `--ink-4` a `--ink-3`: 4,24 → 5,75 : 1.
- **A 390 px** los paneles conservaban el `grid-area` de la retícula de dos
  columnas y el plano caía a `width: 0`. Un `grid-area:auto` en la consulta de
  medio lo devuelve.

## 7 · Lo que se decidió no tocar, y queda anotado

- **`CAR-01` es «Cabecera de caja»**, como en B. `BRIEF.md` lo llama *carnes*,
  pero los 15 libres sólo cierran si ese 1 es `CAR-01`. Sigue siendo pregunta
  para el dueño: si el tipo real es *carnes*, se corrige la tabla, no el plano.
- **31 días contra 61 días**: el plano se pinta por el periodo de la sede y el
  contrato corre 61. Viene de la maqueta y hay que decidirlo antes del port.
- **El objetivo de una cara de góndola es su segmento, no la fila entera.** En
  el plano de B una góndola larga se dibuja con varios prismas y sólo uno lleva
  el código; los demás son polígonos sueltos en orden de profundidad. Agrupar la
  fila entera por cara subiría el objetivo de 2.175 px² a varios miles, pero es
  cirugía sobre la geometría de B y no hacía falta para pasar 44×44. Queda
  apuntado para el port.
- **La banda de temporadas como control** (el injerto G1, de C) no entra: el
  encargo era la fusión de B con tres cosas de A. Los sellos «Cubre Amor y
  Amistad» siguen siendo recibo, no botón.

---

## 8 · Notas para el port a React

- `--lbl` es la pieza que hay que portar con cuidado: se escribe como propiedad
  en el `<g>` de la escena en cada `aplicar()`, **fuera de React**. La cámara
  (`zoom`, `T`) tampoco es estado de React: es escritura imperativa de un solo
  `transform`. Si entra a `useState`, el plano tiembla.
- El descolocador (`acomodar()`) **no mide DOM**: calcula. Las cajas salen de un
  tamaño medido una vez (`calibrar()`) y de la cámara vigente. Es la parte que
  hay que portar entera y sin «optimizar»: si alguien la reemplaza por
  `getBoundingClientRect()` dentro del mismo tick —o dentro de un solo
  `requestAnimationFrame`, que corre antes del dibujo— vuelve el error de medir
  un paso tarde, y con él los choques a 0,8× y a 2,44×.
- `calibrar()` sí mide DOM, pero sólo cuando puede cambiar el ancho de una letra
  (arranque, `load`, `document.fonts.ready`), en el **segundo** cuadro y
  repitiendo hasta que dos pasadas coinciden.
- La caja de impacto del rótulo también sale del cálculo (seis píxeles de
  pantalla de margen alrededor del rótulo, divididos por la escala); en React es
  un atributo derivado de la cámara, no un `style`.
- Las anclas salen del propio SVG (centroide de la tapa). La tabla `AJUSTE` tiene
  **cinco entradas y un solo valor, 20**; si mañana cambia la geometría de una
  pieza, lo que hay que revisar es esa tabla y nada más.
- Los conteos ya **no** están escritos en el HTML: `pintaConteos()` los deriva de
  `ESP` y del contrato en cada pintado, y la clave del plano, la columna
  «Libres · entran» y el pie de la tarifa salen de **la misma cuenta mirada tres
  veces**. Al portar, esa función es un selector sobre el estado; lo que no puede
  volver es el número escrito a mano.

---

## 9 · Lo que se arregló después de la verificación del director

`VERIFICACION-D.md` devolvió la pieza con cinco cosas. Están las cinco, en orden,
y ninguna de las que sí pasaron se movió.

### 9.1 · El alto ya no está clavado en 900 px

`@media (min-width:1440px){ body{height:900px} }` se fue. La hoja llena la
ventana real (`100dvh`) y la rejilla reparte el alto entre las dos filas con un
piso cada una (`minmax(--fila1, 550fr)` / `minmax(--fila2, 254fr)`) — el detalle
está en §5.3. En 1366×768 y en 1440×800 **el botón amarillo, «Guardalo como
reserva» y el pie de la tarifa se ven enteros y sin rodar**; por debajo de
760 px de alto el documento rueda normalmente en vez de esconder el final.
La composición de 1440×900 no cambió ni un píxel.

### 9.2 · `acomodar()` ya no mide un paso tarde

No se arregló encolando la medición: se arregló **quitándola**. El detalle está
en §4.3. Lo que se mide en pantalla es constante y se mide una vez; lo que se
mueve se calcula. Resultado, con las herramientas del propio plano y con la
rueda, en 1440×900, 1366×768, 1440×800 y 390:

| Encuadre | 1440×900 | 1366×768 | 1440×800 | 390×844 |
|---|---|---|---|---|
| inicial | 0 choques · 0 cortados | 0 · 0 | 0 · 0 | 0 · 0 |
| `+` ×1 · ×2 · ×3 · ×4 | 0 · 0 | 0 · 0 | 0 · 0 | 0 · 0 |
| `−` ×1 · ×2 | 0 · 0 | 0 · 0 | 0 · 0 | 0 · 0 |
| rueda 4 adentro + 8 afuera | 0 · 0 | 0 · 0 | 0 · 0 | 0 · 0 |

Los casos que el director reprodujo —`FRU-05` sobre la píldora a `+`×4,
`EXP-01 × PUN-03` a `−`×1, `EXP-02 × PUN-05` con la rueda, y los 25 pares
cruzados de 390 al cargar— **no vuelven a aparecer**. Y la regla «el que se sale
del lienzo cede» se cumple ahora contra el rect del lienzo para **los 23 rótulos
y también para ENTRADA y CAJAS**: **0 textos cortados** en las 14 sesiones y en
los 4 × 10 encuadres de la tabla.

### 9.3 · Los conteos se derivan del estado

`#cLibre`, «Se libera», «Tomado», `#cEleg`, la columna «Libres · entran» de cada
fila y el pie de la tarifa los escribe `pintaConteos()` en cada pintado, desde
`ESP` y desde el contrato. Un espacio que entra al contrato deja de estar libre
**en los tres lugares a la vez**:

| En el contrato | Clave del plano | Fila «Isla» | Pie de la tarifa |
|---|---|---|---|
| 0 | 15 libres · 0 en el contrato | 3 | 23 espacios · 15 +5 · 20 al cerrar |
| 2 *(el estado de arranque)* | **13** libres · 2 | **2** | 23 · **13 +5** · **18 al cerrar** |
| 3 *(+FRU-04)* | **12** libres · 3 | **2** | 23 · **12 +5** · **17 al cerrar** |
| 5 | 10 libres · 5 | 1 | 23 · 10 +5 · 15 al cerrar |

Es exactamente lo que pedía la verificación: con tres espacios en el contrato la
clave dice **12 libres · 3 en el contrato** y la fila Isla está en **2**.

### 9.4 · «el 26 de sep», con un espacio normal

La fecha iba entera en mono, y los espacios de la mono son cajas de ancho fijo:
se leía «el 26  de  sep». Ahora la caja la lleva **sólo la cifra** —tabular, para
que no baile al mover el cursor por la escalera— y las palabras siguen en la
display con su espacio normal:

```html
si arrancás el <b><span class="dig">26</span> de sep</b> → <b class="n dig">17</b> libres
```

### 9.5 · Los menores

| Lo que faltaba | Qué se hizo | Medición |
|---|---|---|
| El contrato con dos espacios tenía **0,0 px** de holgura | El aire de abajo pasó del relleno del panel a un `margin-bottom` de `.acciones`: se ve *y* se cuenta como contenido. El panel no gana un píxel de alto | **12,0 px** en 1440×900, 1440×800 y 1366×768; `sh = ch` |
| `.tabla` escondía **11 px** de ancho a 390 | Los anchos de columna salieron del atributo `style` a las clases `.c2`/`.c3`, y a 390 la tabla se reparte 52 / 96 con separaciones de 8 px | **0 px** escondidos; el pie cabe en una línea |
| La píldora del periodo se cortaba a media frase a 390 | No la cortaba el lienzo: la tapaba la herramienta. A este ancho **la herramienta baja al pie del plano** | «31 ago → 30 sep 2026 · 31 días» entera |
| La escalera se deslizaba 536 px y dejaba fuera los escalones | El SVG va a **974 px** (escala 1, rótulos de 10,5 px exactos) y el encuadre **arranca por los escalones**; el resto queda a un deslizamiento con su barra a la vista | `scrollLeft = 626` de 626 al cargar |
| *(de paso)* A 1280 de ancho la tarifa escondía 9 px | Debajo de 1340 las dos columnas de cifras ceden lo justo y el pie envuelve | **0** en 1280×800 y 1280×700 |

### 9.6 · Lo que no se tocó

Los tres injertos siguen medidos: **329 de 333 piezas se apagan a 0,20 exacta**
al pasar por la fila «Isla» (idéntico al original, comparado archivo contra
archivo), la lectura se reescribe día a día con mouse y con teclado
(`←` → «25 de sep → 17 libres», `→` `→` → «27 de sep → 18 libres»), y el clic
suma al contrato con la cuenta correcta
(`(1.050.000 + 1.200.000 + 380.000) × 61 / 30 = $5.347.667`).
`var(--signal)` sigue apareciendo **1 vez**. El grep de confidencialidad sobre
`innerText`, los `<text>` del SVG y los `aria-label` sigue en **0**. La escala de
ocho pasos no se movió: el apretón de ventana baja toca rellenos e
interlineados, nunca un cuerpo.

### 9.7 · La única válvula que se abre un paso antes

En **1366×768** —y sólo ahí— el contrato con **tres** espacios rueda 11 px dentro
de `.cuerpo`, con su barra a la vista. Es la válvula declarada de B, que en esa
ventana se abre en el tercero en vez del cuarto: los 12 px de holgura que pidió
el director se cuentan como contenido, y en 768 px de alto no hay de dónde
sacarlos. En 1440×900 y en 1440×800 sigue abriéndose en el cuarto.

---

## 10 · Cómo verificar

Playwright con `executablePath: /opt/pw-browsers/chromium-1194/chrome-linux/chrome`,
`reducedMotion: 'reduce'`. Un aviso para quien mida: después de apretar `+`, `−`
o de mover la rueda, **esperá un cuadro** (`requestAnimationFrame`) antes de leer
rects — no porque la página necesite ese cuadro para acomodar, sino porque el
navegador necesita ese cuadro para *dibujar* lo que ya está decidido.

Capturas del estado arreglado, en `../../capturas/`:
`D-claro-1440x900.png` · `D-claro-1366x768.png` · `D-claro-1440x800.png` ·
`D-claro-390x844.png` · `D-oscuro-1440.png` · `D-oscuro-1366x768.png` ·
`D-claro-zoom-mas4.png` · `D-claro-zoom-menos2.png` · `D-claro-1366-3espacios.png`.
Las capturas anteriores de la verificación (`D-claro-zoom-choque.png`,
`D-claro-390.png`, `D-claro-zoom07-rueda.png`…) siguen ahí y documentan los
defectos: sirven para comparar.

---

*Sin commit ni push. Fuera de `outputs/vender/opciones/D-fusion/` y de
`outputs/vender/capturas/` no se tocó nada.*
