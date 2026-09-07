# A · «q1 vestida de E»

`index.html` — autocontenido, se abre con doble clic. Un archivo, sin librerías,
sin fuentes, sin una sola llamada de red. Claro por defecto, oscuro a un clic.

La consigna era la composición de `docs/maquetas/elegida-vender.html` con la
tipografía, los materiales y el ritmo de `features/landing/outputs/opciones/E-fusion`.
El riesgo declarado era quedar tibio de tanta fidelidad a q1. **Lo gasté en dos
lugares donde se ve desde lejos: la escala de letra y el aire.** Todo lo demás
—qué panel va dónde, qué dato entra, qué está prohibido— es q1 tal cual.

---

## 1. La escala: seis pasos, no siete, y con saltos grandes arriba

Es la decisión que más cambia la foto. q1 tenía **siete tamaños apretados entre
9,5 y 27** —9,5 · 11 · 12 · 13 · 14,5 · 17 · 27—: cuatro de ellos separados por
menos de 1,5 px, que a esa distancia es ruido, no jerarquía. La escala de E es lo
contrario: un racimo corto abajo y saltos francos arriba.

| Paso | px | Dónde vive |
|---|---|---|
| `--t-2xs` | **10,5** | rótulos pill, rótulos del plano, ejes y rótulos del gráfico |
| `--t-xs` | **12** | notas, pies, fechas del gráfico, chips, descripción del espacio |
| `--t-sm` | **13,5** | cuerpo y filas de tabla |
| `--t-base` | **15** | campos, botón, códigos de espacio, navegación de modo |
| `--t-lg` | **20** | títulos de panel, el nombre de la sede, las cifras del gráfico |
| `--t-2xl` | **34** | el total del contrato — **y nada más en toda la pantalla** |

Razones de los tamaños: 10,5 → 12 → 13,5 → 15 son pasos de ~1,12 (el racimo
denso, donde vive el dato); de 15 a 20 el salto es **1,33** y de 20 a 34 es
**1,70**. Dos saltos grandes es lo que hace que una pantalla tenga voz.

**Lo que se fue: el tamaño 17 «código de espacio».** Era un paso entero de la
escala vieja gastado en una sola cosa. Acá el código va en `--t-base` **pero en
mono 700 con `+.03em`**, que a igual cuerpo pinta más ancho y más negro que la
sans del texto: se sigue leyendo como el elemento más fuerte de su fila sin
consumir un tamaño. Es la regla de E —«el contraste lo dan la familia, el peso y
el color»— aplicada para bajar de siete pasos a seis.

**Y `--t-2xl` (34) aparece una sola vez.** `generadores/tamanos.mjs` sobre esta
página devuelve exactamente:

```
  10.5px  ×24   Sede · 23 caras comercializables · 2 elegidos
    12px  ×24   Galerías · de 7 · lunes 31 de agosto de 2026
  13.5px  ×121  RECABRA · (tabla equivalente) · GON-60·A
    15px  ×8    Vender · Supervisar · ×
    20px  ×9    NAVE · Piso de NAVE · Cuándo se libera cada espacio
    34px  ×1    $4.575.000
```

(El script lista además `0.5px ×28`: son los rótulos del plano, que viven dentro
de un `<g>` escalado. **En pantalla miden 10,5 px** —caja de 12 px medida con
`getBoundingClientRect`— y **no cambian al acercar**, porque el `<g>` publica
`--lbl: 10.5px / escala`. Es el truco de E, y resuelve de paso el pendiente del
PR 1: los códigos de 8 caracteres —`GON-60·A`— entran en 39,1 px sin desbordar.)

## 2. El aire, y con qué se pagó

E respira; q1 apretaba. Tres movidas:

- **La cabecera de panel es una franja de 44 px** con el título en display 800 a
  `-.03em`, su rótulo y una línea fina abajo. q1 metía título y subtítulo en
  11 px de padding y la pantalla se leía como una planilla.
- **El plano va a sangre dentro de su panel**, sin padding lateral, y la clave y
  las herramientas **flotan encima** en pill de vidrio, como el HUD de E. El
  plano ganó ~28 px de ancho y ~24 de alto, y es lo primero que se ve.
- **Los rótulos pill.** Toda la versalita de q1 (que iba en Archivo Narrow) pasó
  a mono 10,5 px con `.16em`, y donde flota o titula va encapsulada en un pill de
  línea fina. Cambia la textura de la pantalla entera.

Eso cuesta píxeles, y en 1440×900 no hay de dónde sacarlos. Se pagaron **quitando
tres cosas que decían un dato que ya estaba dicho** (criterio 1: si dos elementos
dicen lo mismo, uno sobra):

1. **El subtítulo de la escalera** («de 15 disponibles hoy a 20 al cerrar»). El
   gráfico escribe `15` al inicio y `20` al final: la frase era una leyenda de un
   gráfico que ya se lee. En su lugar quedó el pill del periodo, que es otro dato.
2. **«23 espacios comercializables» en el pie de la tarifa.** El encabezado del
   plano ya lo dice. El pie pasó a `Total de la sede` y se quedó con lo suyo:
   `15 +5 · 20 al cerrar`, que es lo que amarra la tabla con el gráfico.
3. **La línea `61 días · 2 espacios`.** «2 espacios» lo dicen las dos filas de
   arriba; los días se mudaron al rótulo del total, que es la cifra que
   prorratean. El rótulo quedó en dos líneas —`TOTAL DEL CONTRATO` / `61 DÍAS`—
   y el número, solo, a 34 px.

## 3. Qué conserva de q1 (todo lo estructural)

- **La composición exacta**: barra · columna izquierda de 992 px con el plano
  arriba y la escalera abajo · columna derecha con el contrato arriba y la tarifa
  de referencia abajo. Nada se movió de lugar.
- **El plano isométrico protagonista**, con **las fechas de liberación escritas
  sobre el propio mueble** (`PUN-03` / `libre 25 sep`). Código y fecha **miden lo
  mismo** y se distinguen por peso y color: es la regla de q1, y da la casualidad
  de que es también la de E.
- **Contrato con varios espacios y lugar fijo.** Nunca es un globo: la columna
  derecha existe siempre, con o sin selección. Tocar un mueble libre lo suma o lo
  quita, y el total, el plazo y los sellos de temporada se recalculan solos.
- **La escalera A·4** con sus cuatro decisiones intactas: a todo el ancho **sin
  columna lateral**, **sin eje vertical** (cada tramo rotulado con su cifra, al
  inicio de su meseta), **peine de días** y **el cursor escribe la lectura** —acá
  sigue al mouse de verdad: «si arranca el 26 sep → 17 libres», recalculado día a
  día, y al salir vuelve a la lectura de la maqueta.
- **La tarifa de referencia con los 7 tipos** y su pie.
- **Los datos reales de NAVE**, sin tocar: 23 caras entre 106 muebles, 15 libres ·
  5 se liberan · 3 tomados; los cinco que entran son PUN-03 y PUN-04 el 25 sep,
  PUN-17 el 27 y EXP-01 y EXP-02 el 29; el contrato de ALPINA / Alpinito sobre
  PUN-05 ($1.050.000) e ISL-04 ($1.200.000), 15 sep → 14 nov, 61 días,
  **$4.575.000** (= 2.250.000 × 61/30, prorrateo real, calculado en la página).

## 4. Qué trae de E

- **Tipografía**: display de sistema 800 con tracking negativo para títulos
  (`-.03em`), mono con `tabular-nums` para **todo** lo que es código, plata,
  fecha o cifra que se compara.
- **Rótulos pill**, líneas finas (`--hair`), tarjetas con radio y sombra apenas
  perceptible, HUD de vidrio moderado sobre el plano.
- **El motor isométrico**: proyección `[(x−y)·0,866, (x+y)·0,44 − z·0,95]`, cada
  estado dibujado como **tres caras del mismo color** —tapa con el color de
  identidad, izquierda y derecha mezcladas hacia el fondo por `--face-left` /
  `--face-right`—, no como tres colores nuevos. Rótulo de tamaño constante en
  pantalla. Rueda, arrastre, `+ / − / Centrar`, `Tab`+`Enter` sobre cada mueble.
- **Conectores, traducidos.** En la landing un conector nombra el título de la
  sección siguiente; en una herramienta eso sería adorno. Acá el conector es el
  **código**, que es el mismo objeto en cuatro sitios y ahora se comporta como
  tal: pasar el mouse por un chip de la escalera, por una fila del contrato o por
  una fila de la tarifa **apaga la sala y enciende esos muebles en el plano**. Un
  filo de tinta a la izquierda ata las filas del mismo contrato.
- **El oscuro entero**, con los semánticos de `tema.css`, y el toggle sol/luna que
  pone `data-tema="oscuro"` en `<html>` y lo recuerda en `localStorage`
  (`recabra-tema`). **No lee `prefers-color-scheme`**: claro por defecto, spec §0.

**Lo que dejé afuera de E, a propósito:** la cámara guiada por scroll y las capas
de prueba (son de una página que convence a alguien; esto es una herramienta que
se abre cuarenta veces al día), el `beam` animado, el velo radial y la retícula de
fondo. La landing tiene ocho secciones para respirar; acá cada píxel del alto está
comprometido.

## 5. Una decisión de modelo que se ve dibujada

**Una góndola de dos caras se dibuja como dos medios prismas**, cada uno con su
código y su estado. `GON-60·A` está tomada y `GON-60·B` libre: en el plano se ven
la franja roja y la verde formando un solo mueble. Es el hecho central del
producto —«la cara A y la cara B se venden por separado»— explicado sin una sola
oración, que es el criterio 2 llevado al dibujo. Los rótulos de las dos caras se
anclan en puntas opuestas del mueble (`anc`), así nunca se pisan.

## 6. Confidencialidad — Vender la ve el proveedor

- **Un espacio tomado dice QUE está tomado y HASTA CUÁNDO. Nunca de quién.** La
  ficha de `BEB-01` dice literalmente: «Tomado todo el periodo · Se libera:
  después del periodo». No hay nombre en ninguna parte.
- El único proveedor nombrado es **el que está sentado enfrente**: ALPINA /
  Alpinito, en su contrato.
- **La palabra «vence» no aparece** en toda la página. Todo está dicho como
  liberación —«se libera», «libre 25 sep»—, que es disponibilidad (permitida) y no
  vencimiento de contrato ajeno (prohibido). Los mismos cinco espacios, la lectura
  correcta para quien lee la pantalla del otro lado del escritorio.
- Grep sobre el HTML final: **0** coincidencias de `coca[ -]?cola|brayan|camilop|
  nutresa|postob|colanta|recamier|colombiana de comercio`; **0** de
  `5\.300\.001|14\.234\.060|5\.107\.310|9\.126\.750|294\.411|8\.730\.000|ranking|
  bajo tarifa|por debajo|canon de la sede|se evapora|no se recupera|vencid|vence`.

## 7. El amarillo

`var(--signal)` se consume **una sola vez en todo el archivo** (línea 372, junto a
`--signal-borde` en la 373), dentro de `.btn-principal`, que es «Guardar contrato
y avisar». Nada más lo usa: el anillo de
foco es tinta (`--fg`), el aro del mueble elegido es tinta, «+ agregar otro
espacio» es tinta (es una acción, no un estado — regla escrita en `ESTADO.md`), y
los sellos de temporada van en el verde suave de «libre».

---

## 8. El validador de dataviz sobre los colores de estado

Los tres estados usan **los hex validados de `tema.css`**, que es lo que la spec
pide: claro `#00805A · #CE8A0A · #D8342E`, oscuro `#00BE86 · #F5A524 · #F4544E`.
Corrí el validador de `dataviz` contra las **dos** superficies.

### Claro — `ALL CHECKS PASS`

```
$ node scripts/validate_palette.js "#00805A,#CE8A0A,#D8342E" --mode light

Palette (light, surface #fcfcfb, categorical): 3 slots
  [PASS] Lightness band         all 3 inside L 0.43–0.77
  [PASS] Chroma floor           all 3 >= 0.1
  [PASS] CVD separation         worst adjacent #D8342E↔#CE8A0A ΔE 10.4 (deutan) · tritan 14.4
  [PASS] Normal-vision floor    worst adjacent #D8342E↔#CE8A0A ΔE 17.9 (normal)
  [WARN] Contrast vs surface    below 3:1 — relief required (visible labels or table view): [["#CE8A0A",2.82]]

  → ALL CHECKS PASS
```

Y contra la superficie real de esta pantalla, con **todos** los pares (el plano es
un mapa, no una barra apilada: cualquier par se puede tocar):

```
$ node scripts/validate_palette.js "#00805A,#CE8A0A,#D8342E" --mode light --surface "#FFFFFF" --pairs all

Palette (light, surface #FFFFFF, categorical): 3 slots
  [PASS] Lightness band         all 3 inside L 0.43–0.77
  [PASS] Chroma floor           all 3 >= 0.1
  [PASS] CVD separation         worst all-pairs #D8342E↔#00805A ΔE 9.2 (protan) · tritan 14.4
  [PASS] Normal-vision floor    worst all-pairs #D8342E↔#CE8A0A ΔE 17.9 (normal)
  [WARN] Contrast vs surface    below 3:1 — relief required (visible labels or table view): [["#CE8A0A",2.89]]

  → ALL CHECKS PASS
```

(Contra el papel `#EFF1ED` da lo mismo, con `#CE8A0A` en 2,54:1.)

**El WARN está atendido, y no por casualidad: el relief que el validador exige es
exactamente la regla dura del producto.** «Cada estado con su palabra al lado»:
la clave del plano escribe *Libre todo el periodo* / *Se libera en el periodo* /
*Tomado todo el periodo* con su cifra; los cinco muebles de `#CE8A0A` llevan
`libre 25 sep` escrita encima; la ficha repite la palabra; los chips de la
escalera van rotulados; y hay una tabla equivalente de los 23 espacios con estado
y fecha para lector de pantalla. El color nunca está solo.

### Oscuro — pasa todo menos la banda de luminosidad, y esa no aplica

```
$ node scripts/validate_palette.js "#00BE86,#F5A524,#F4544E" --mode dark

Palette (dark, surface #1a1a19, categorical): 3 slots
  [FAIL] Lightness band         outside band: [["#00BE86",0.709],["#F5A524",0.782]]
  [PASS] Chroma floor           all 3 >= 0.1
  [PASS] CVD separation         worst adjacent #F5A524↔#00BE86 ΔE 9.3 (protan) · tritan 16.5
  [PASS] Normal-vision floor    worst adjacent #F4544E↔#F5A524 ΔE 18.7 (normal)
  [PASS] Contrast vs surface    all 3 >= 3:1

  → FAILED — fix the marked checks
```

```
$ node scripts/validate_palette.js "#00BE86,#F5A524,#F4544E" --mode dark --surface "#0B1116" --pairs all

Palette (dark, surface #0B1116, categorical): 3 slots
  [FAIL] Lightness band         outside band: [["#00BE86",0.709],["#F5A524",0.782]]
  [PASS] Chroma floor           all 3 >= 0.1
  [WARN] CVD separation         worst all-pairs #F4544E↔#00BE86 ΔE 7.5 (deutan) · tritan 16.5
  [PASS] Normal-vision floor    worst all-pairs #F4544E↔#F5A524 ΔE 18.7 (normal)
  [PASS] Contrast vs surface    all 3 >= 3:1

  → FAILED — fix the marked checks
```

**Dos cosas que hay que leer, y no maquillar.**

**a) El `FAIL` de la banda es del banco de pruebas, no de la paleta.** El
validador usa `BAND.dark = [0.48, 0.67]` en OKLCH L, y esa banda está calibrada
para su superficie oscura por defecto, `#1a1a19` (L ≈ 0,23). La superficie oscura
de RECABRA es mucho más profunda —`#04070A` de papel, `#0B1116` de panel—, y sobre
ella lo correcto es subir la luminosidad de la marca, no bajarla. La prueba está
en el propio informe: **el chequeo de contraste, que sí depende de la superficie
que le paso, pasa con holgura**:

| | vs `#04070A` (papel) | vs `#0B1116` (panel) |
|---|---|---|
| `#00BE86` libre | 8,38:1 | 7,87:1 |
| `#F5A524` se libera | 9,89:1 | 9,30:1 |
| `#F4544E` tomado | 5,99:1 | 5,63:1 |

Bajarlos a la banda [0,48 – 0,67] los llevaría a 3–4:1 sobre este papel: se
cumpliría un chequeo empeorando lo que ese chequeo protege. **No los toqué**, y
tampoco podía: son los hex de `tema.css`, que la spec fija como no discutibles.
Queda anotado como desvío declarado, con su medición al lado.

**b) El `WARN` de separación CVD a 7,5 ΔE (banda 6–8) es real y está cubierto.**
Aparece sólo con `--pairs all`, en el par `#F4544E ↔ #00BE86` bajo deuteranopía —
el par rojo/verde de siempre, que es justo el que separa «no puedo venderlo» de
«puedo venderlo». La regla del validador dice que la banda 6–8 es legal
**únicamente con codificación secundaria**, y acá hay cuatro capas encima del
color: la palabra escrita en la clave con su cifra, el código en mono sobre cada
mueble, la fecha de liberación escrita sobre los que entran, y la tabla
equivalente. Además, en el plano los dos estados **nunca se tocan**: el rojo está
en tres muebles sueltos (`GON-60·A`, `ISL-03`, `BEB-01`) separados por sala gris.
En claro el mismo par da 9,2 ΔE y pasa.

**c) El gris del resto de la sala no es un color de estado y no entra en la
terna.** Corrido junto a los tres, `#AAB3BE` (claro) y `#33414F` (oscuro) fallan
el piso de croma —0,019 y 0,030— **porque son grises a propósito**: la
infraestructura que no se alquila se va al fondo y el color queda para lo que se
vende. Lleva su palabra en la clave («Resto de la sala — no se alquila») y no es
clicable ni aparece en ninguna cuenta.

---

## 9. Verificado

Con Playwright, sobre el HTML entregado:

- **1440×900: `scrollHeight` 900 = `clientHeight` 900, `scrollWidth` 1440.**
  Cero scroll en claro y en oscuro. Se cierra trato y se revisa sin bajar la
  página.
- **Cero paneles recortados**: los cuatro dan `scrollHeight − clientHeight = 0`
  en los dos temas (el chequeo que importa cuando el panel es `overflow:hidden`).
- **Cero elementos fuera de la ventana**, cero errores de consola, cero errores
  de página, en los tres tamaños.
- **Cero choques de texto** en el plano y en el gráfico, medidos cruzando todos
  los `<text>`/`<tspan>` entre sí — **también con el plano acercado 2,4×**, que es
  donde el interlineado en `em` se gana el sueldo.
- **Ningún tamaño de letra baja de 10,5 px reales** (el piso del proyecto es 9,4).
- **390×844**: sin desborde horizontal (`scrollWidth` 390). Los paneles se apilan,
  el plano baja a 340 px y apaga las fechas sobre el mueble (quedan en la ficha),
  y **la escalera no se achica hasta ser ilegible: se desliza a lo ancho** con un
  mínimo de 880 px. No es perfecto y no tiene que serlo; no se rompe.
- **Las interacciones**, probadas de punta a punta: tocar `ISL-05` en el plano lo
  suma al contrato y el total pasa de `$4.575.000` a `$7.015.000`; tocar `BEB-01`
  abre su ficha **sin un nombre de proveedor**; estirar el contrato a `30 nov 2026`
  recalcula 77 días y **agrega solo el sello «Cubre Black Friday»**; quitar el
  espacio deja todo como estaba.

## 10. Notas para el port

- El motor del plano es el de E y se porta igual: `cam`/`base` **fuera** de React,
  escritura imperativa de un solo `transform` sobre `<g id="escena">`, nunca en
  `useState`. Nada de `setPointerCapture` en el contenedor: le roba el click a los
  botones del HUD y se pierde en silencio.
- Los rótulos del mueble son **un `<text>` con dos `<tspan>`** y el interlineado en
  `em` (`dy="1.22em"`). Con el tamaño constante en pantalla (`--lbl`), eso es lo
  único que garantiza que el código y su fecha no se pisen a ningún zoom. Con un
  `dy` en unidades de mundo se pisan al alejar.
- Los seis pasos van como `--t-2xs … --t-2xl`. Chocan con los ocho de `tema.css`
  (que todavía trae la escala vieja, con `--t-3xs` 9,5 y `--t-md` 17): al portar,
  o `tema.css` adopta estos seis, o esta pantalla los declara en su ámbito. Es
  decisión del dueño, y arrastra a Supervisar.
- Las columnas «libres · entran» de la tarifa **se cuentan del propio plano**, no
  se escriben a mano: no pueden contradecirlo. El pie sí es literal.
- El único número escrito a mano que podría desincronizarse es el `15 +5 / 20 al
  cerrar` del pie de la tarifa. Al portar sale de la misma cuenta.
