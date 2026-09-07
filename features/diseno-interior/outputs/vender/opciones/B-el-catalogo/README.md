# B · «El catálogo»

`index.html` — autocontenido, se abre con doble clic. Un archivo, cero recursos
externos, cero librerías, cero llamadas de red (el único `href` que hay son tres
`#`, y el único `http://` es el namespace de SVG). Claro por defecto; el oscuro,
completo, está a un clic en el sol/luna de la barra y queda recordado en
`localStorage` bajo `recabra-tema`, la misma llave del interior.

---

## La apuesta

**Vender es la pieza que el proveedor mira desde el otro lado del escritorio.**
El administrador gira el portátil y lo que queda enfrente tiene que ser un
catálogo: acá está la sala, acá está lo que te puedo dar, acá está lo que te
cuesta, acá está lo que se te libera si esperás dos semanas.

De ahí salen las tres decisiones que ordenan todo lo demás:

1. **El plano manda.** Ocupa 1004 × 558 de los 1440 × 900 — el 43 % de la
   pantalla en una sola pieza. Es el argumento que una planilla no tiene: el
   inventario tiene domicilio, y el proveedor reconoce la tienda que conoce.
   Las fechas de liberación van escritas **sobre el mueble** (`libre 27 sep`),
   no en una tabla al costado.
2. **El contrato es la ficha de E.** «Una sola ficha»: filas mono con separador
   punteado, campos apilados, y el total del plazo grande abajo — `$4.575.000`
   en mono 800 a 30 px. La cuenta que se hacía de cabeza con el proveedor
   esperando queda hecha y a la vista.
3. **La escalera es el argumento de venta.** No es un gráfico de estado: es la
   respuesta a «¿y si arranco más adelante?». Por eso la lectura del cursor no
   vive adentro del SVG a 12 px: vive en el encabezado del panel, en display
   800 a 21 px — **«si arrancás el 26 de sep → 17 libres»** — y se reescribe
   con el cursor.

**El riesgo que me tocaba gastar era volverme vitrina.** Las tres cosas que lo
compensan, y que son para el que abre esto cuarenta veces al día:

- **Se cierra el trato tocando.** Cada espacio libre del plano es un botón
  (`role="button"`, `tabindex`, Enter/Espacio): se toca y entra al contrato con
  su tarifa; se vuelve a tocar y sale. El total, el plazo, el conteo «en el
  contrato» y la fila de la tarifa se recalculan solos.
- **Todo lo que se toca está conectado.** Pasar por un escalón de la escalera
  enciende, en el plano, los espacios que se liberan ese día. Mover el cursor
  enciende los chips de los códigos que ya entraron. Pasar por una fila del
  contrato enciende su mueble. No hay un solo elemento decorativo que se
  encienda sin decir algo.
- **Cero navegación.** Nada se abre, nada se despliega, nada hace scroll.

---

## Qué conservo de q1 (la maqueta elegida)

- **La estructura entera**: plano arriba a la izquierda, «cuándo se libera cada
  espacio» debajo, contrato a la derecha con lugar fijo, tarifa de referencia
  abajo a la derecha. Los cuatro paneles y ninguno más.
- **El plano isométrico de NAVE, literal.** Las 106 piezas, la sala, los muros,
  ENTRADA y CAJAS salen del SVG de `docs/maquetas/elegida-vender.html`, no de un
  motor nuevo: es geometría medida de la tienda real y rehacerla sería inventar
  un piso. Lo que cambié es de qué está hecha, no dónde está (ver «Cómo está
  hecho»).
- **Las fechas de liberación sobre el mueble** — el aporte de q1 que ninguna
  otra propuesta mejoró.
- **La escalera A·4 con sus cuatro decisiones intactas**: sin columna lateral
  (los chips de código van bajo su fecha: entre el 25 y el 27 quedan 65 px y un
  chip mide 56), sin eje vertical (el rango es 15→20; cada meseta lleva su cifra
  al inicio), peine de días (un diente por día, largo cada cinco), y el cursor
  escribe la lectura.
- **El contrato con varios espacios** (injerto de q3) y sus sellos de temporada.
- **Los datos reales**: 23 espacios, 106 muebles, 15 libres / 5 se liberan / 3
  tomados, 31 ago → 30 sep, PUN-05 a `$1.050.000` + ISL-04 a `$1.200.000`,
  61 días, `$4.575.000`, la tarifa de los siete tipos con su pie 15 · +5 · 20.

## Qué traigo de la landing E

| De E | Dónde vive acá |
|---|---|
| Display de sistema, peso 800, tracking cerrado | `NAVE` en la barra, los cuatro títulos de panel, y sobre todo **la lectura de la escalera** |
| Mono con cifras tabulares para códigos, plata y fechas | los 23 códigos del plano, las columnas de la tarifa, el total, el plazo, la fecha de la barra, los chips de la escalera |
| Rótulos pill | el modo activo, `sin firmar`, `al mes`, los sellos «Cubre Amor y Amistad», el periodo flotando sobre el plano |
| La barra píldora | el rail superior entero (marca, sede, modos, fecha, sol/luna) |
| Tarjetas con aire y líneas finas | `--r-lg` 16 px, borde `--brd` de 1 px, sin sombras ambientales: la separación la hace la línea |
| Los conectores numerados | `01 · 02 · 03 · 04` con la regla de 14 px de E, y una línea de 1 px que baja del panel 01 al número del 02 (y del 03 al 04) a través del hueco de 10 px |
| «Una sola ficha» | el panel del contrato completo |
| El rótulo del plano con halo (`paint-order: stroke`) | los códigos sobre el mueble — resuelve de paso el desborde de 7 px que el PR 1 dejó pendiente: sin chip blanco, sin caja que desbordar |

**Lo que dejé afuera de E, con razón escrita:**

- **El vidrio (`backdrop-filter`) queda en un solo lugar**: el pill del periodo
  sobre el plano, que es el único elemento que flota encima de otro. En una
  herramienta de trabajo el vidrio sobre paneles opacos es niebla, no material.
- **El amarillo como color de la plata.** En E el total del plazo va en
  `--signal-ink`. Acá **no**: la regla del dueño es que el amarillo sea una cosa
  sola. El total va en tinta a 30 px, y el amarillo aparece exactamente una vez
  en toda la pantalla.
- **La escala fluida (`clamp`)**. Adentro los paneles tienen alturas medidas;
  una escala que respira relayoutea la tabla y la ficha. Los pasos son fijos.

## La escala de letra: ocho pasos, `--t-*`

Los siete tamaños de la maqueta vieja estaban calculados para Chivo + Archivo
Narrow. Con las pilas de sistema y la voz de E la escala se rehace, con los
nombres de E:

| Token | px | Trabajo |
|---|---|---|
| `--t-3xs` | 10 | versalitas y rótulos pill (a 9,5 la versalita del sistema se empasta; 10 con `.16em` es el piso legible) |
| `--t-2xs` | 11,5 | notas, pies, ejes, y el código sobre el mueble |
| `--t-xs` | 12,5 | secundario: subtítulos de panel, ubicaciones |
| `--t-sm` | 13,5 | cuerpo y tablas |
| `--t-base` | 15 | títulos de panel, campos y botón |
| `--t-md` | 17,5 | códigos de espacio y `NAVE` (el mono pide medio punto más que la condensada para la misma mancha) |
| `--t-lg` | 21 | la lectura de la escalera — el argumento de venta |
| `--t-xl` | 30 | el total del contrato |

El contraste lo dan la familia, el peso y el color, no el tamaño: en el plano el
código y su fecha de liberación miden casi lo mismo y se distinguen por peso y
por color. **Ningún rótulo baja de 9,4 px reales**: el plano se dibuja a escala
0,911 (viewBox 1032,5 × 557,8 dentro de 976 × 508), así que el código a 11 px de
viewBox cae en **10,0 px reales** y la fecha a 10,5 en **9,6**. La escalera se
dibuja a 0,917: las cifras de meseta a 15 caen en 13,8 y las fechas del eje a
11,5 en 10,5.

## Sin scroll en 1440 × 900

Presupuesto exacto, todo en `border-box`:

```
900 = 8 (padding sup) + 56 (rail) + 10 (hueco) + 814 (hoja) + 12 (padding inf)
814 = 558 (fila 1) + 10 + 246 (fila 2)
1440 = 12 + 1004 (columna izquierda) + 10 + 402 (derecha) + 12
```

`html, body { overflow: hidden }` a partir de 1440 px, y `body { height: 900px }`.
Los cuatro paneles alinean fila con fila: el plano con el contrato, la escalera
con la tarifa.

Con los **dos** espacios del contrato el panel cierra con ~10 px de aire. Si el
vendedor agrega un tercero, la pista de uso («Agregá otro espacio tocándolo en
el plano») se retira sola —ya cumplió— y los tres siguen entrando. Del cuarto en
adelante el panel del contrato, y sólo él, hace scroll interno: es una decisión
consciente de válvula, porque la alternativa era recortar el total o el botón.

## Confidencialidad

`grep -i 'coca\|brayan\|camilop\|nutresa\|postob\|colanta\|5\.300\.001\|ranking'`
sobre el HTML final: **0 coincidencias**. En la pantalla no hay ningún nombre de
proveedor salvo **ALPINA**, que es el proveedor sentado enfrente y su contrato;
no hay canon ajeno, ni ranking, ni quién está bajo tarifa, ni el canon de la
sede, ni la plata del periodo, ni cuántos contratos vencen. Lo que un mueble
ocupado dice es «tomado» y, si se libera dentro del periodo, **cuándo** — nunca
de quién.

El amarillo aparece una sola vez: `var(--signal)` + `var(--signal-borde)` en
`Guardar contrato y avisar`. Ni siquiera el anillo de foco es amarillo — en
`tema.css` `--ring` sigue a `--signal-ink`, y acá lo reapunté a `--ink-1` para
que no exista un segundo amarillo ni en una captura de teclado. Es la única
desviación deliberada respecto de `tema.css`, y va en esta dirección porque la
regla del dueño es más dura que el token.

---

## El validador de dataviz

Terna de estado, **claro** (`--libre #00805A · --entra #CE8A0A · --ocupado #D8342E`,
los hex de `tema.css`):

```
$ node .../dataviz/scripts/validate_palette.js "#00805A,#CE8A0A,#D8342E" --mode light
Palette (light, surface #fcfcfb, categorical): 3 slots
  [PASS] Lightness band         all 3 inside L 0.43–0.77
  [PASS] Chroma floor           all 3 >= 0.1
  [PASS] CVD separation         worst adjacent #D8342E↔#CE8A0A ΔE 10.4 (deutan) · tritan 14.4
  [PASS] Normal-vision floor    worst adjacent #D8342E↔#CE8A0A ΔE 17.9 (normal)
  [WARN] Contrast vs surface    below 3:1 — relief required (visible labels or table view): [["#CE8A0A",2.82]]

  → ALL CHECKS PASS
exit 0
```

Terna de estado, **oscuro** (`#00BE86 · #F5A524 · #F4544E`):

```
$ node .../dataviz/scripts/validate_palette.js "#00BE86,#F5A524,#F4544E" --mode dark
Palette (dark, surface #1a1a19, categorical): 3 slots
  [FAIL] Lightness band         outside band: [["#00BE86",0.709],["#F5A524",0.782]]
  [PASS] Chroma floor           all 3 >= 0.1
  [PASS] CVD separation         worst adjacent #F5A524↔#00BE86 ΔE 9.3 (protan) · tritan 16.5
  [PASS] Normal-vision floor    worst adjacent #F4544E↔#F5A524 ΔE 18.7 (normal)
  [PASS] Contrast vs surface    all 3 >= 3:1

  → FAILED — fix the marked checks
exit 1
```

**Los dos resultados son los que `tema.css` ya tiene documentados y no los
muevo.** El `WARN` del claro y el `FAIL` del oscuro tienen la misma respuesta y
está medida en `outputs/tema.md` §4: bajar la claridad del verde y del ámbar
para entrar en la banda OKLCH hunde el par ámbar↔rojo a ΔE 3,5 en deuteranopía,
que es exactamente el error que costó dieciséis propuestas descubrir. La banda
está calibrada para marcas de un gráfico categórico sobre la superficie
estándar; acá son rellenos de estado sobre una sala casi negra, donde el trabajo
del color es verse encendido.

Las **dos compensaciones que la desviación exige** están cumplidas en esta
pantalla, y son verificables sin leer el código:

1. **Cada estado va siempre con su palabra.** En la clave del plano
   («Libre todo el periodo 15», «Se libera 5», «Tomado 3», «Resto de la sala»,
   «En el contrato 2»); en el nombre accesible de cada mueble
   (`aria-label="PUN-17 · Punta de góndola · se libera en el periodo"`); y sobre
   el propio mueble, donde la fecha empieza con la palabra: `libre 27 sep`.
2. **Todo relleno de estado lleva su `-borde`.** Los cinco cuadraditos de la
   clave llevan `--libre-borde`, `--entra-borde`, `--ocupado-borde`, `--resto` e
   `--ink-3`; los chips de código de la escalera llevan `--entra-borde` y suben a
   `--entra` cuando el cursor ya los pasó; los prismas del plano llevan su cara
   oscura, que es su contorno por construcción.

**El gris no entra en la corrida categórica, y hace bien.** Corrido con los
cuatro (`#00805A,#CE8A0A,#D8342E,#AAB3BE --mode light`) el validador devuelve
`[FAIL] Chroma floor  below floor (reads gray): [["#AAB3BE",0.019]]` — que es su
trabajo: el no comercializable **tiene** que leerse gris. Ese par se verifica por
contraste WCAG contra la superficie, como manda `tema.css`. Medido sobre las
caras que efectivamente se pintan (la cara izquierda de cada prisma):

| Par | Claro | Oscuro |
|---|---|---|
| libre ↔ resto de la sala | **3,50 : 1** | **5,18 : 1** |
| tomado ↔ resto | 3,33 : 1 | 3,71 : 1 |
| se libera ↔ resto | 2,04 : 1 | 6,13 : 1 |
| en el contrato ↔ piso | 13,32 : 1 | 12,38 : 1 |

El par que ESTADO.md señala como el que de verdad importa —«lo que puedo vender»
contra «lo que ni siquiera se alquila»— pasa 3:1 en los dos modos. El que no
llega es *se libera ↔ resto* en claro (2,04), que es el mismo ámbar del `WARN`
de arriba y está cubierto por las dos compensaciones: es el único estado del
plano que además lleva **texto propio sobre el mueble** («libre 25 sep») y una
polilínea de contorno en `--pl-ad` que el generador de q1 ya le dibujaba.

---

## Cómo está hecho (para el port a React)

- **El plano no se rehízo: se tokenizó.** Tomé el SVG generado por
  `docs/maquetas/generadores/riel.py` y lo pasé por una transformación mecánica:
  cada `fill="#00786A"` / `stroke="rgba(20,24,28,.30)"` de la paleta vieja pasó a
  una clase (`.pl-li`, `.pl-ssep`, …) que resuelve contra un token del tema. Los
  hex viejos ya no existen en el archivo; los nuevos salen de `tema.css`. Eso es
  lo que hace que el mismo plano se repinte entero al cambiar de modo.
- **Tres caras por estado, no tres colores nuevos.** `--pl-*-i` es el color de
  identidad (`--libre`, `--entra`, `--ocupado`), `-t` es la tapa (mezcla con
  blanco) y `-d` la cara derecha (mezcla con negro). Están escritos en hex y no
  con `color-mix()` a propósito: son doce valores que un auditor tiene que poder
  medir sin abrir un navegador.
- **Las 106 piezas quedaron agrupadas.** El SVG plano se reagrupó en
  `<g class="pz" data-cod="…" data-est="…">` (las góndolas de dos caras llevan
  los dos códigos separados por `|`), y las 23 etiquetas en
  `<g class="etq" role="button" tabindex="0">` con un rectángulo de impacto
  transparente. La selección **no** repinta nada por JS: pone `data-sel="1"` y el
  CSS hace el resto (`.pz[data-sel="1"] .pl-li{fill:var(--pl-ei)}`). En React esto
  es un atributo derivado del estado del contrato, no un `style` calculado.
- **Se fueron los 23 chips blancos** que el generador dibujaba detrás de cada
  código. Un rectángulo blanco de ancho fijo calculado para Archivo Narrow no
  sobrevive al cambio a mono (era el desborde de 7 px del PR 1) y además pinta
  blanco en modo oscuro. En su lugar, el tratamiento de E: `paint-order: stroke`
  con el halo en el color del piso. Sin caja, no hay caja que desbordar, y la
  regla de `tema.css` («ninguna caja con un código lleva `overflow:hidden` con
  ancho fijo en px») se cumple por construcción.
- **Dos rótulos se corrieron a mano**: `EXP-01` −17 y `PUN-03` +15 en unidades de
  viewBox, porque a mono sus fechas se pisaban (`libre 29 sep` contra
  `libre 25 sep`, dos muebles vecinos a la misma altura). La guía se inclina con
  ellos. Está verificado por código: un detector de solapes sobre las 28 cajas de
  texto del plano da **0 choques entre etiquetas distintas**.
- **La escalera se dibuja en JS desde los datos**, no está copiada: `EV` son los
  tres eventos (25 sep → 17, 27 sep → 18, 29 sep → 20) y de ahí salen el área, la
  polilínea, los puntos, las cifras, el peine, las fechas y los chips. La
  geometría cae exactamente sobre la de la maqueta (x del 25 sep = 823,0; del 27 =
  888,2; del 29 = 953,4; el cursor de ejemplo del 26 = 855,6) porque el eje es el
  mismo: 31 días entre x 8 y x 986.
- **El cursor es estado, no render.** `curD` (0–30) vive fuera del dibujo; cada
  movimiento reescribe tres atributos y un `innerHTML`. Teclado completo: la
  escalera es `tabindex="0"` y responde a ← →.
- **El total se calcula, no se escribe**: `Σ canon mensual × 61 / 30`. Con
  PUN-05 (`$1.050.000`, precio negociado con este proveedor) e ISL-04
  (`$1.200.000`, la tarifa) da `$4.575.000`, que es la cifra de la maqueta.
  Un espacio agregado desde el plano entra a **tarifa de referencia**.

### Dos cosas que hay que decidir antes del port

1. **`CAR-01` es «Cabecera de caja» acá.** `BRIEF.md` lo llama «carnes» en la
   lista de códigos, pero la tabla de tarifas de la maqueta elegida tiene
   «Cabecera de caja · 1 libre · $850.000» y la aritmética de los 15 libres sólo
   cierra si ese 1 es CAR-01 (3 islas + 1 punta + 1 cabecera + 2 neveras +
   3 frutas + 5 caras de góndola = 15). Preferí que el plano y la tabla no se
   contradigan delante del proveedor. **Si el tipo real es «carnes», hay que
   corregir la tabla, no el plano.**
2. **La ubicación se muestra sólo en la fila principal** del contrato («pasillo
   5, de cara a las cajas»). Es el único texto de ubicación que la maqueta trae;
   no inventé ubicaciones para los otros 22 espacios. Cuando el dato exista en la
   base, la fila de abajo lo acepta sin cambiar de alto.

## Accesibilidad y comportamiento

- **Cada mueble alquilable es un botón** con nombre accesible
  (`código · tipo · palabra del estado`), foco visible (el código crece un punto
  y la guía se enciende) y Enter/Espacio.
- El plano es un `role="group"` con `aria-label` que dice qué es y qué se puede
  hacer; la escalera es un `role="img"` con la descripción larga de los cuatro
  tramos.
- El sol/luna es un `aria-pressed` que cambia de etiqueta según el modo.
- **390 px**: la retícula se desarma en una columna, el rail envuelve, el plano
  toma 52 vw (mínimo 230 px), la escalera 190 px y los conectores se apagan. No
  es la pantalla de trabajo —no hay uso móvil real— pero no se rompe ni desborda
  horizontalmente.

## Verificado

- HTML balanceado (parser de tags: 0 errores, 0 etiquetas sin cerrar).
- 0 recursos externos, 0 `<link>`, 0 `<script src>`, 0 `@import`, 0 tipografías
  descargadas. El único `url()` del archivo es `url(#pta)`, la punta de flecha de
  ENTRADA, que vive en el mismo SVG.
- Plano renderizado fuera del navegador (CairoSVG) en claro y en oscuro, con la
  selección aplicada: 106 piezas, 23 etiquetas, los 15/5/3 en su sitio, los dos
  prismas del contrato en tinta y legibles contra los verdes en los dos modos.
- Escalera renderizada aparte con el cursor en el 26 de sep: los cinco chips en
  su columna sin pisarse, los dos del 25 encendidos y los otros tres apagados.
- Aritmética: `$4.575.000` = (1.050.000 + 1.200.000) × 61 / 30, exacto.
