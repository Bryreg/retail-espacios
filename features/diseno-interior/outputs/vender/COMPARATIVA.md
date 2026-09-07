# Vender · Ronda 1 · Comparativa de las tres direcciones

Dirección de arte, 2026-09-07. Tres direcciones entregadas a ciegas del sistema
actual: **A · «q1 vestida de E»**, **B · «El catálogo»**, **C · «La mesa de
trabajo»**. Este documento **no elige**: mide, dice qué aporta y qué se lleva
cada una, y propone los injertos. **Elige el dueño.**

Capturas en `outputs/vender/capturas/`:
`<A|B|C>-claro-1440.png` · `<A|B|C>-oscuro-1440.png` · `<A|B|C>-claro-390.png` ·
`<A|B|C>-claro-completa.png` (página completa) · `trio-claro-1440.png` (las tres
apiladas, que es como el dueño las va a mirar).

---

## 0 · Lo que hay que saber antes de mirar

**Las tres son la misma pantalla.** Mismos datos de NAVE, misma estructura de
cuatro bloques (plano · escalera · contrato · tarifa), mismo total de
$4.575.000, mismos tres hexes de estado de `tema.css`. El plano ocupa
**35,9 % (A) · 37,9 % (B) · 37,4 % (C)** de la pantalla: la promesa de B de que
«el plano domina» **no se cumple en píxeles** — domina lo mismo en las tres. Lo
que de verdad separa a las tres es **el tratamiento del rótulo del mueble, la
escala tipográfica y qué se sacó**.

**El validador da idéntico en las tres**, porque las tres usan los hexes fijados
por la spec. No discrimina. Lo que discrimina es **el relief** que cada una pone
encima del color (§4).

---

## 1 · Las mediciones

### 1.1 · Cerrar trato y revisar sin scroll — 1440×900

| | A | B | C |
|---|---|---|---|
| `documentElement.scrollHeight` | **900** = 900 | **900** = 900 | **900** = 900 |
| `scrollWidth` | 1440 | 1440 | 1440 |
| Igual en oscuro | sí | sí | sí |
| Elementos fuera de la ventana | 0 | 0 | 0 |
| Errores de consola / de página | 0 | 0 | 0 |

Al nivel del documento, **las tres pasan**. Pero el scroll de documento no es el
único scroll, y ahí se separan:

| Contenedor con contenido escondido | A | B | C |
|---|---|---|---|
| `div.sr` (tabla para lector de pantalla) | 513 px ↓ *(intencional, invisible)* | — | — |
| `div.cuerpo` (contrato) | — | **18 px ↓** `overflow:auto` | — |
| `div.tabla` (tarifa de referencia) | — | **22 px ↓** `overflow:auto` | 5 px ↓ `overflow:hidden` |

**El hallazgo duro de esta ronda está en B.** El pie de la tarifa —
`23 espacios comercializables · 15 +5 · 20 al cerrar`, que es la respuesta a la
pregunta 4 del dueño («¿puedo ver cómo va la sede sin hacer scroll?») — vive en
**872,8–897,1 px** dentro de un contenedor que **termina en 887 px**. Se corta
por la mitad, en claro y en oscuro, y para leerlo hay que rodar dentro del
panel. Se ve en `B-claro-1440.png` y en `B-oscuro-1440.png`, abajo a la derecha.
Además, `+5` y `20` se tocan y se leen como **«+520»**.

En B el contrato además ya está **sin holgura con dos espacios** (`clientHeight`
512, `scrollHeight` 530): el tercero entra rodando. En A la holgura es
exactamente 0 y el panel está dimensionado para eso; en C el hueco entre el
plazo y el total **es** la capacidad reservada y crece al tocar el plano.

En C los 5 px de `div.tabla` son padding de la última fila y no esconden texto,
pero están en `overflow:hidden`: si mañana entra una fila más, desaparece sin
scrollbar que lo avise.

### 1.2 · Textos recortados o pisados en el plano

| | A | B | C |
|---|---|---|---|
| Textos en el SVG del plano | 47 | 47 | 52 |
| Choques reales de caja (1440) | **0** | **0** | 0 *(8 falsos positivos: 1,9 px entre el código y su fecha dentro del mismo chip — es solape de caja de línea, no de tinta; verificado por recorte)* |
| Rótulos recortados | 0 | 0 | 0 |
| Tamaño mínimo renderizado | **10,5 px** | 9,3 px | 9,5 px |
| Tamaños distintos renderizados | **6** | **13** | 9 |
| Pasos `--t-*` declarados | 6 *(+2 overrides a 390)* | 8 | 8 |

A es la única sin deriva: 6 pasos declarados, 6 renderizados, porque fija el
rótulo a tamaño constante en pantalla (`--lbl = 10,5px / escala`). En B los
10 px de `--t-3xs` aterrizan en **9,3 · 9,9 · 10,0 · 10,1** según el `transform`
del grupo — cuatro tamaños donde debía haber uno. En C sólo deriva un valor
(9,8).

### 1.3 · El objetivo del clic

| | A | B | C |
|---|---|---|---|
| Espacios con objetivo (de 23) | 23 | 23 | **20** — `GON-60·A`, `ISL-03`, `BEB-01` no lo son (ocupados, decisión declarada) |
| Clic sobre el **mueble** | entra al contrato | entra al contrato | entra al contrato |
| Clic sobre el **rótulo** | entra *(el rótulo está encima del mueble; cae al mueble)* | entra *(el rótulo **es** el botón)* | **no pasa nada** |
| Área del objetivo (mín / mediana) | **3.953 / 5.787 px²** | 1.324 / 1.324 px² | 1.309 / 1.938 px² |
| Objetivos por debajo de 44×44 | **0** | **15** de 23 | 9 de 23 |

Éste es el hallazgo duro de C. El rótulo de C es un **chip blanco flotante con
línea guía**, separado del mueble y con `pointer-events:none`: apuntar al código
—que es lo más visible del plano— deja caer el clic en un `polygon.muro` y no
pasa nada. Hay que acertarle al prisma, que para una punta de góndola mide
34×38 px y encima está parcialmente tapado por su propio chip.

B tiene el problema espejo y más chico: el mueble **y** el rótulo funcionan,
pero el objetivo declarado es el rótulo, de 1.324 px² (≈36×37) — 15 de 23 por
debajo del mínimo táctil.

A es la única sin el problema: el rótulo va **sobre** el mueble con halo
(`paint-order:stroke`), así que apuntes donde apuntes le pegás, y el objetivo
más chico es de 63×63.

### 1.4 · Contraste de texto (WCAG, ambos modos)

| Textos por debajo del umbral | A | B | C |
|---|---|---|---|
| Claro | 2 | 2 | **0** |
| Oscuro | 2 | 2 | **0** |

En A y en B es el mismo elemento y el mismo arreglo: la **«×»** de quitar un
espacio del contrato, a 4,24:1 en claro y 4,44:1 en oscuro contra 4,5 pedido.
Un tono de tinta y se cierra.

### 1.5 · El amarillo

| | A | B | C |
|---|---|---|---|
| `var(--signal)` en el archivo | 1 vez | 1 vez | 1 vez |
| Anillo de foco de teclado | `var(--fg)` — tinta | `--ring` reapuntado a `--ink-1` — tinta | **`#8A6100` claro / `#FFE067` oscuro — ocre** |

Las tres cumplen la regla en reposo. **C es la única que enciende un segundo
amarillo en cuanto alguien usa el teclado**, porque conserva `--ring` como viene
de `tema.css`. C lo declara en su README; B tomó la decisión contraria y lo
anotó como desviación deliberada del token. Es una decisión de dueño: o el token
manda, o la regla del amarillo manda. **No pueden mandar los dos.**

### 1.6 · A 390 px (fuera del encargo, pero dice cómo está construida)

| | A | B | C |
|---|---|---|---|
| Desborde horizontal | no (390 = 390) | no | no |
| El plano sobrevive | sí, 368 px | **no: el SVG queda en `width: 0`** | sí, 352 px |
| La escalera sobrevive | sí (se desliza a 880 px) | **no: `width: 0`** | sí |
| Choques de rótulo | **6** | — | 1 (`ENTRADA`×`CAJAS`, del piso) |
| Tamaño mínimo | 8,1 px (15 rótulos < 10 px) | 10,5 px | 7,1 px (35 rótulos < 10 px) |

En B, a 390, **el plano y la escalera desaparecen** y queda el contrato pidiendo
«Agregá otro espacio tocándolo en el plano» — sobre un plano que no está.
En A el plano sigue ahí pero seis rótulos se pisan y el más chico cae a 8,1 px,
lo que contradice lo que su README dice (que a 390 apaga las fechas: no las
apaga). En C el plano aguanta sin pisarse pero baja a 7,1 px.

### 1.7 · Confidencialidad — `grep` sobre el HTML y sobre el texto renderizado

Patrón corrido: proveedores colombianos ajenos (coca-cola, postobón, nutresa,
colanta, alquería, bavaria, nestlé, unilever, quala, éxito…), `ranking`,
`bajo tarifa`, `canon`, `vence`/`vencimiento`, `facturación`, `recaudo`,
`ingresos`, `margen`, `rentabilidad`, y las cifras de la sede.

| | A | B | C |
|---|---|---|---|
| En el **texto renderizado** (innerText + aria/title/alt) | **0** | **0** | **0** |
| En el **fuente** | 1 · comentario JS `/* negociado bajo la tarifa: es el suyo */` | 0 | 1 · comentario JS que **enumera lo prohibido** |
| Único proveedor nombrado | ALPINA / Alpinito | ALPINA / Alpinito | ALPINA / Alpinito |

**Las tres pasan.** Los dos hits del fuente son comentarios de código, invisibles
en pantalla, y ninguno nombra a un tercero: el de A habla del precio del propio
proveedor sentado enfrente. Aun así **los dos se borran antes del port**: el
HTML se sirve al navegador del proveedor y «bajo la tarifa» es una de las
palabras que la spec prohíbe, aunque esté detrás de un `/* */`.

Ninguna imprime plata de la sede: los únicos pesos en pantalla son los del
contrato de ALPINA y la lista de tarifas públicas por tipo de espacio.

### 1.8 · Que funcionen de verdad

| | A | B | C |
|---|---|---|---|
| Tocar un espacio libre lo suma al contrato ($4.575.000 → $7.015.000) | sí | sí | sí *(desde el mueble)* |
| El cursor de la escalera reescribe la lectura al mover el mouse | sí | sí | sí |
| Aritmética | (1.050.000+1.200.000)×61/30 = 4.575.000 ✔ | ✔ | ✔ |

---

## 2 · El validador de dataviz

Las tres declaran los mismos hexes de `tema.css`, así que **el resultado es
literalmente el mismo para las tres**. Corrido por dirección de arte, no copiado
de los README:

**Claro `#00805A · #CE8A0A · #D8342E`** — contra la superficie por defecto
(`#fcfcfb`), contra la tarjeta (`#FFFFFF`) y contra el papel (`#EFF1ED`), con
`--pairs all`:

```
[PASS] Lightness band      todos dentro de L 0.43–0.77
[PASS] Chroma floor        todos >= 0.1
[PASS] CVD separation      peor par #D8342E↔#00805A ΔE 9.2 (protan) · tritan 14.4
[PASS] Normal-vision floor peor par #D8342E↔#CE8A0A ΔE 17.9
[WARN] Contrast vs surface #CE8A0A a 2.82 / 2.89 / 2.54 : 1 — relief required
→ ALL CHECKS PASS
```

**Oscuro `#00BE86 · #F5A524 · #F4544E`** — superficie por defecto y las reales
de RECABRA (`#0B1116` panel, `#04070A` papel):

```
[FAIL] Lightness band      fuera de banda: #00BE86 L 0.709 · #F5A524 L 0.782
[PASS] Chroma floor
[WARN] CVD separation      peor par #F4544E↔#00BE86 ΔE 7.5 (deutan) — con --pairs all
[PASS] Normal-vision floor ΔE 18.7
[PASS] Contrast vs surface los tres >= 3:1
→ FAILED
```

**Con el gris de sala** (`+#AAB3BE`, claro): `[FAIL] Chroma floor 0.019`. Es lo
correcto: el no comercializable **tiene** que leerse gris. No es un color de
estado y no entra en la terna.

**Diagnóstico de dirección de arte.** El FAIL de la banda oscura es del banco de
pruebas: `BAND.dark` está calibrada contra una superficie tipo `#1a1a19`, y la
de RECABRA es `#04070A`/`#0B1116`, mucho más profunda. Los tres diseñadores
llegaron a la misma conclusión por caminos distintos, y C hizo el experimento
que lo cierra: con los tres **dentro** de la banda (`#00A170,#B87A0A,#D9433D`)
la banda pasa **pero** `[FAIL] CVD #D9433D↔#B87A0A ΔE 3.9 (deutan)` y
`[FAIL] Normal-vision ΔE 13.9`. Meter el ámbar en la banda **colapsa ocre contra
rojo**, que es justo el par que la banda existe para proteger. **Los hexes se
quedan como están**; queda como desvío declarado con su medición al lado.

El WARN de contraste del claro es lo que hay que atender de verdad, y ahí las
tres **no** son iguales — ver §4.

---

## 3 · Qué aporta cada una que las otras no

### A · «q1 vestida de E» — *la que mejor resiste que le acerquen la cara*

1. **El rótulo sobre el mueble, con halo, sin caja.** Es la única de las tres
   donde el código y su fecha viven **encima** del objeto que nombran, en un
   `<text>` con dos `<tspan>` y el interlineado en `em`. Consecuencias medidas:
   0 choques a 1440, tamaño mínimo 10,5 px (el más alto de las tres), el rótulo
   no roba el clic, y el objetivo más chico es 3.953 px² contra 1.309 de C.
   Es la respuesta al pendiente del PR 1 (los 7 px de desborde) y sirve tal cual
   para el port.
2. **La góndola de dos caras dibujada como dos medios prismas.** `GON-60·A`
   tomada y `GON-60·B` libre se ven como **un solo mueble mitad rojo mitad
   verde**. El hecho central del negocio —la cara A y la B se venden por
   separado— queda dibujado en lugar de explicado. Ninguna otra lo hace.
3. **Seis pasos de tipografía y ninguno de más.** El único archivo donde lo
   declarado y lo renderizado coinciden. Mató el paso «código de espacio» y lo
   resolvió con familia + peso (mono 700 a `--t-base`), que es la regla de E
   usada para *bajar* pasos, no para subirlos. `--t-2xl` (34 px) aparece **una
   sola vez en toda la pantalla**: el total del contrato.
4. **Es la única que borró duplicados de verdad.** Se fueron el subtítulo de la
   escalera («de 15 a 20», que el gráfico ya escribe), el «23 espacios
   comercializables» del pie de la tarifa, y la línea «61 días · 2 espacios».
   B y C conservan el subtítulo «de 15 hoy a 20 al cerrar» **al lado de un
   gráfico que ya rotula el 15 y el 20**: eso es el criterio 2 del dueño
   incumplido, en las dos, en el mismo lugar.
5. **Tabla equivalente de los 23 espacios** (código · tipo · estado · se libera)
   para lector de pantalla. Es exactamente el «table view» que el validador pide
   como relief del WARN, y es la única que lo tiene.
6. **Los 23 `aria-label` más completos**: `«PUN-17, Punta de góndola, Se libera
   en el periodo, libre desde el 27 sep»` — estado **y** fecha.

### B · «El catálogo» — *la que trae la voz de E más adentro*

1. **La lectura de la escalera sacada del SVG y puesta en el encabezado del
   panel, en display 800 a 21 px**: «si arrancás el 26 de sep → 17 libres».
   Adentro del gráfico caía a ~12 px y no podía ser el argumento de venta; acá
   el gráfico dice **dónde** y el encabezado dice **qué**. Es el mejor injerto
   de toda la ronda y **A y C deberían tomarlo**.
2. **«En el contrato» como cuarto estado con su swatch en la clave.** Los dos
   espacios elegidos se pintan aparte (casi negro en claro, blanco en oscuro) y
   la clave los cuenta: «En el contrato 2». Es el único plano donde *lo que
   estoy vendiendo ahora mismo* se ve como un estado y no como un aro de
   selección.
3. **El plano no se rehizo: se transformó.** Tomó el SVG que genera `riel.py`
   con la geometría medida de NAVE (106 muebles) y cambió cada hex por una clase
   que resuelve contra un token, así el mismo plano se repinta entero al cambiar
   de modo. Para el port es el camino más corto y el menos inventado.
4. **Mató los 23 chips blancos** que el generador dibujaba detrás de cada código
   y los reemplazó por halo. Resuelve de una los 7 px de desborde del PR 1, el
   chip blanco pintando blanco en oscuro, y la regla de anchos fijos en px.
5. **Reapuntó `--ring` a `--ink-1`** para que no exista un segundo amarillo ni
   en una captura con foco de teclado. Es la lectura más estricta de la regla
   del dueño de las tres.
6. **Honestidad declarada sobre `CAR-01`**: `BRIEF.md` lo llama *carnes*, pero
   la tabla de tarifas trae «Cabecera de caja · 1 libre» y los 15 libres sólo
   cierran si ese 1 es `CAR-01`. Prefirió que el plano y la tabla no se
   contradigan delante del proveedor y lo dejó anotado. **Hay que resolverlo
   antes del port, en cualquiera de las tres.**

### C · «La mesa de trabajo» — *la que entendió que esto se abre cuarenta veces al día*

1. **El periodo dejó de ser un rótulo repetido tres veces y pasó a ser un
   control.** Una banda de 38 px arriba con `31 ago → 30 sep 2026` y **las seis
   temporadas colombianas al lado como botones** (Amor y Amistad · Halloween ·
   Black Friday · Navidad · Escolar · Semana Santa): tocar una **estira el
   contrato hasta cubrirla**. Es la idea más fuerte de la ronda y la más difícil
   de que se lea como generada: sale de este negocio y de ningún otro.
   A y B tienen las temporadas como **sellos** («Cubre Amor y Amistad»), o sea
   como recibo; C tiene el recibo **y** el botón que lo produce.
2. **La palabra «ocupado» escrita sobre los tres muebles rojos.** Es la única
   que rotula el estado prohibitivo **sobre el objeto**. Contra el par rojo↔verde
   que el validador marca a ΔE 7,5 en deuteranopía, eso es relief de verdad, no
   una clave al pie.
3. **Cuatro paneles numerados 01–04 sobre una retícula de hairlines, cero
   sombras.** Los ordinales son el conector de E convertido en algo útil: se
   puede decir «mirá el 02» con el teléfono en la oreja. Y es la única
   composición que mete el isométrico, la escalera y el contrato en 1440×900
   **sin una sola sombra**.
4. **El hueco del contrato es capacidad declarada, no aire muerto**: crece al
   tocar el plano, rueda dentro de su caja a partir del tercero o cuarto, y el
   total queda anclado. Es la única que no tiene el problema de holgura cero.
5. **La tarifa pública del mismo espacio al lado del precio negociado**
   (`tarifa $1.150.000` bajo `$1.050.000`). Es lista de precios y es del
   proveedor que está enfrente: dice «te estoy haciendo precio» sin comparar
   contra nadie.
6. **Contraste WCAG limpio en los dos modos** — la única con 0 textos bajo el
   umbral.
7. **Cero errores de consola, ningún rótulo pisado, y el `getBBox()` real
   calculando el viewBox**: el motor de rótulos deschoca por código con
   `getComputedTextLength()` colocando de cerca hacia el fondo.

---

## 4 · Qué se lleva cada una

Contra los cuatro criterios (**1** la forma la manda el dato · **2** pulcro ·
**3** cerrar trato y revisar a la vez · **4** que no se lea como generado) y las
reglas duras de la spec.

### A se lleva

- **La menos arriesgada.** Es q1 con ropa de E, y ése era su encargo, pero al
  lado de la banda de temporadas de C se nota que **no propone una idea nueva
  sobre el negocio**, sólo la ejecuta mejor. Contra el criterio 4, «que no se
  lea como generado» se gana también con una decisión que sorprenda, y A no
  tiene ninguna.
- **El periodo sigue siendo un rótulo** («31 AGO → 30 SEP 2026» en la escalera)
  y no un control. Cambiar el periodo obliga a editar las fechas del contrato a
  mano.
- **Las temporadas sólo aparecen como sello** en el contrato; no se puede
  contratar «hasta cubrir Black Friday» de un toque.
- **A 390 se rompe más que las otras**: 6 choques de rótulo y 8,1 px de mínimo,
  y su README afirma que apaga las fechas a ese ancho — no las apaga.
- La **«×»** a 4,24:1 (criterio menor, un tono de tinta).
- Comentario `/* negociado bajo la tarifa */` en el fuente: se borra.

### B se lleva

- **El pie de la tarifa cortado** (§1.1). Es la única falla de esta ronda que
  toca de frente un criterio del dueño: *«¿puedo ver cómo va la sede sin hacer
  scroll?»*. Se arregla bajando dos filas de padding o subiendo el panel 12 px,
  pero **hoy, tal como está, la respuesta es no**.
- **El contrato sin holgura con dos espacios** (`sh` 530 > `ch` 512): el tercero
  entra rodando, y B es la dirección que más apuesta a que el contrato sea la
  ficha protagonista.
- **La deriva tipográfica**: 8 pasos declarados, **13 renderizados**. Los 10 px
  del rótulo del plano aterrizan en cuatro tamaños distintos. Contra el criterio
  4 (consistencia tipográfica), es lo que más se nota si el dueño acerca la cara.
- **El objetivo del clic es el rótulo, de 1.324 px²**, 15 de 23 por debajo de
  44×44. El mueble grande y de color es lo que la mano busca; el botón es la
  palabrita de al lado.
- **A 390 el plano y la escalera desaparecen** (`width: 0`) y queda un contrato
  que invita a «tocar el plano».
- **Góndolas contiguas de estado distinto se leen como un solo mueble bicolor**
  (ver `B-claro-1440.png`, la fila de `GON-60`), que es exactamente el
  significado que A le reservó a la góndola de dos caras. Dos cosas distintas
  con el mismo dibujo.
- **Conserva el subtítulo «de 15 hoy a 20 al cerrar»** al lado de un gráfico que
  ya escribe 15 y 20 — criterio 2.
- **`ISL-04` sin línea de ubicación** mientras `PUN-05` tiene dos: filas
  asimétricas en la ficha que quiere ser «una sola ficha».
- **`+5` y `20` pegados**, se lee «+520», a 1440 y a 390.

### C se lleva

- **El rótulo no es el objetivo del clic.** `pointer-events:none` sobre el chip
  que lleva el código: apuntar a lo más visible del plano no hace nada. Contra
  el criterio 3 —cerrar trato al teléfono, sin esperar— es el defecto de
  interacción más caro de la ronda, aunque sea el más fácil de arreglar
  (una línea).
- **El chip flotante con línea guía es una decisión que hay que sostener.**
  Convierte el plano en un campo de post-its: 33 chips blancos sobre la sala,
  que tapan el mueble que nombran y compiten con él. Es lo contrario del rótulo
  a sangre de A y B, y es lo primero que un ojo entrenado va a llamar «hecho por
  una plantilla». Contra el criterio 2: el chip es un borde que separa lo que el
  halo ya separaba.
- **Un segundo amarillo en el foco de teclado** (`--ring: #8A6100 / #FFE067`).
  Está declarado, pero es la regla más dura que puso el dueño.
- **Tres espacios sin objetivo de teclado** (`GON-60·A`, `ISL-03`, `BEB-01`):
  ver su ficha con el teclado no se puede.
- **`overflow:hidden` en la tarifa** — si entra una fila más, desaparece callada.
- **A 390 baja a 7,1 px** con 35 rótulos por debajo de 10 px.
- **Dos cuentas de días en la misma pantalla** (`31 días` del periodo de sede
  arriba, `61 días` del contrato a la derecha) sin nada que diga que son cosas
  distintas. B tiene el mismo problema; A lo evita no imprimiendo «31 días».
- **Conserva el subtítulo «de 15 hoy a 20 al cerrar»** — mismo criterio 2 que B.
- Comentario en el fuente que **enumera lo prohibido**: se borra antes del port.

---

## 5 · Los injertos

Ordenados por lo que ganan. Ninguno requiere rehacer una dirección.

### 5.1 · A los tres, venga la que venga

| # | Injerto | De → a | Por qué |
|---|---|---|---|
| **G1** | **La banda de periodo + temporadas como control**, no como sello | **C → A, B** | Es la única idea de la ronda que sale de *este* negocio (temporadas colombianas) y que convierte un rótulo repetido tres veces en una acción. Contesta el criterio 4 mejor que cualquier decisión tipográfica. |
| **G2** | **La lectura de la escalera en el encabezado del panel, display 800 a 21 px** | **B → A, C** | Adentro del SVG el argumento de venta caía a 12 px. A ya lo tiene a 15 px alineado a la derecha; subirlo al encabezado lo termina. |
| **G3** | **El rótulo sobre el mueble, `<text>` + dos `<tspan>` + `dy` en `em` + `--lbl` constante en pantalla** | **A → C** *(B ya usa halo)* | 0 choques, mínimo 10,5 px, y el rótulo deja de robar el clic. Resuelve de paso los 7 px de desborde del PR 1 y mata los 33 chips flotantes. |
| **G4** | **La palabra «ocupado» sobre los tres muebles rojos** | **C → A, B** | Es el relief que el validador exige contra el par rojo↔verde a ΔE 7,5 en deuteranopía. Cuesta tres `<text>` y cierra el único WARN que importa. |
| **G5** | **Borrar el subtítulo «de 15 hoy a 20 al cerrar»** | **A → B, C** | El gráfico ya rotula el 15 y el 20. Criterio 2, literal. |
| **G6** | **`--ring` en tinta, no en ocre** | **A/B → C** | La regla del amarillo es del dueño y es más dura que el token. |
| **G7** | **La tabla equivalente de los 23 espacios (sr-only)** | **A → B, C** | Es el «table view» que el validador nombra como relief aceptable. Cuesta un `<table>` invisible. |
| **G8** | **Borrar los comentarios de código con vocabulario prohibido** | — | El HTML se sirve al navegador del proveedor. |
| **G9** | **Resolver `CAR-01`: ¿carnes o cabecera de caja?** | pregunta de B | Los 15 libres sólo cierran si ese 1 es `CAR-01`. Si el tipo real es *carnes*, se corrige la tabla, no el plano. |

### 5.2 · Si el dueño elige A

- **G1** (banda de temporadas) y **G4** (la palabra sobre el rojo) son los dos
  que le faltan y los dos que le darían la idea que hoy no tiene.
- **G2**: subir «si arranca el 26 sep → 17 libres» al encabezado del panel 02.
- Arreglar la **«×»** a 4,5:1 y los **6 choques a 390** (o apagar de verdad las
  fechas a ese ancho, como dice el README).

### 5.3 · Si el dueño elige B

- **Primero, sin discusión: el pie de la tarifa** (12 px, o dos filas de
  padding). Hoy incumple el criterio 4 del dueño.
- **G3**: pasar el objetivo del clic del rótulo al grupo `g.pz` completo, o
  meter los dos en un `<g role="button">`. 1.324 px² → ~3.600 px².
- **Fijar la deriva tipográfica**: el rótulo del plano a tamaño constante en
  pantalla (`--lbl`, de A), 13 tamaños → 8.
- **G1**, **G4**, **G5**, **G7**.
- Separar el `+5` del `20`; darle a `ISL-04` su línea de ubicación; distinguir
  góndolas contiguas de la góndola de dos caras (el corte de A).
- A 390: el plano y la escalera no pueden quedar en `width: 0`.

### 5.4 · Si el dueño elige C

- **Primero, una línea: sacarle `pointer-events:none` al chip** o meter chip y
  prisma en el mismo `<g role="button">`.
- **G3**: bajar el rótulo al mueble y sacar los 33 chips. Es la decisión más
  grande de las cuatro y la que más cambia la cara de C — vale la pena
  discutirla con el dueño antes de ejecutarla, porque es su firma visual.
  Alternativa mínima: dejar el chip pero pegarlo al mueble y hacerlo clicable.
- **G6** (`--ring` en tinta) y **G5**.
- Dar objetivo de teclado a los tres ocupados; cambiar el `overflow:hidden` de
  la tarifa por `auto`; **G2**; **G7**.

---

## 6 · Dos cosas que no puede decidir la dirección de arte

1. **El ámbar.** `CRITERIOS.md` dice, con todas las letras, que *«el ámbar, el
   oro y el ocre están prohibidos»* y que *«los fondos oscuros también»*. La
   spec de este PR, que es posterior, fija los tres hexes de estado de
   `tema.css` —uno de los cuales es `#CE8A0A`, ocre— y ordena claro por defecto
   **con oscuro a un clic**. Las tres direcciones siguieron la spec, que es lo
   correcto. Pero el dueño va a mirar tres capturas con un mueble ocre y un modo
   oscuro, y **conviene que sepa de antemano que eso viene de la spec y no del
   gusto de nadie**, y que el color se sostiene con la palabra al lado en las
   tres.

2. **31 días contra 61 días.** El plano se pinta por el periodo de la sede
   (31 ago → 30 sep, 31 días) mientras el contrato corre 61 días (15 sep →
   14 nov). «Libre todo el periodo» y «61 días» hablan de dos periodos
   distintos en la misma pantalla. B y C imprimen las dos cifras; A imprime sólo
   una. **No lo inventó ninguna de las tres: viene de la maqueta.** Antes del
   port hay que decidir si el plano se pinta por el periodo del contrato (y
   entonces cambia al estirar las fechas) o si «el periodo» se nombra de dos
   maneras distintas para que no se confundan.

---

*Sin commit ni push. Fuera de `outputs/vender/` no se tocó nada.*
