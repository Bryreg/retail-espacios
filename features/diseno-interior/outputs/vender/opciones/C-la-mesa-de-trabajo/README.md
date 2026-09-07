# C · La mesa de trabajo

**Prototipo:** `index.html` — autocontenido, se abre con doble clic. Un archivo, cero recursos
externos, cero librerías, cero llamadas de red. Los tokens de `frontend/src/tema.css` están
copiados adentro con **los mismos nombres y los mismos hex**.

> Para quien la abre cuarenta veces al día, entre llamada y llamada.

Vender no es una página: es una **mesa de trabajo** que se mira de reojo mientras se habla por
teléfono, y que en mitad de la conversación se gira hacia el proveedor. Eso manda tres cosas:
que todo esté puesto al mismo tiempo, que lo comparable esté en mono y alineado, y que no haya
un solo píxel que no conteste una pregunta.

---

## La decisión

**Cuatro paneles numerados, una sola retícula de líneas finas, cero sombras.** `01` el piso,
`02` cuándo se libera, `03` el contrato, `04` la tarifa. Los números no son adorno: son el
idioma para decir «mirá el 02» con el teléfono en la oreja, y son el conector de E convertido
en algo que hace trabajo.

**El plano manda y ocupa 526 × 1010 px** — más de la mitad de la pantalla. Es lo único que este
sistema tiene y una planilla no puede tener. Los 23 códigos van rotulados sobre su mueble; los
cinco que se liberan llevan la fecha debajo del código, y los tres tomados llevan la palabra
`ocupado`. Se toca un mueble y **entra al contrato ahí mismo**, sin globos ni pasos.

**El contrato tiene lugar fijo a la derecha, y el aire que le sobra es el sitio donde crece.**
Con dos espacios queda un hueco entre el plazo y el total: ese hueco es la lista de espacios,
que es lo que se llena cuando el proveedor dice «y dame también la isla». Con cuatro espacios
la lista rueda dentro de su caja y el total no se mueve de su sitio. No es aire muerto: es
capacidad reservada, y se ve funcionar tocando el plano.

**La densidad se paga con líneas, no con cajas.** No hay una sola sombra en la pantalla. Las
tarjetas son un borde de 1 px con radio 6; las filas del contrato se separan con punteado; las
de la tarifa con una línea de 1 px del tono más flojo. Es lo que permite meter cuatro paneles,
un isométrico de 94 muebles y una escalera de 31 días en 1440 × 900 sin que se sienta apretado.

**La banda del periodo es un control, no un rótulo.** En la maqueta, «31 ago → 30 sep 2026»
estaba escrito tres veces como encabezado de tres paneles. Acá se dice **una sola vez**, arriba,
y al lado van las seis temporadas que vienen. **Tocar una estira el contrato hasta cubrirla** y
la temporada se prende: es el argumento de venta convertido en botón. Las que ya están cubiertas
se marcan solas, y los sellos del contrato son el recibo de esa acción, no una segunda copia.

---

## Qué conserva de q1 (y de los injertos de q3)

Las cuatro cosas que el rediseño dio por decididas, sin tocarlas:

| Lo decidido | Cómo está acá |
|---|---|
| **Plano isométrico con las fechas de liberación sobre el mueble** | Presente y protagonista. `PUN-03 / libre 25 sep`, `PUN-17 / libre 27 sep`, `EXP-01 · EXP-02 / libre 29 sep`, sobre su propio mueble, con guía de 1 px al volumen |
| **Contrato con varios espacios y lugar fijo** | Columna derecha, siempre visible, nunca un globo. `PUN-05` + `ISL-04`, «+ agregar otro espacio» en tinta, `×` por renglón, total que se recalcula |
| **Escalera A·4** | Sin columna lateral, sin eje vertical, peine de un diente por día, cada meseta rotulada con su cifra al inicio, los códigos bajo su fecha, y **el cursor escribe la lectura** siguiendo el mouse |
| **Tarifa de referencia con su pie** | Los 7 tipos, con `Libres · entran` y el pie que amarra la tabla con el gráfico: `15 +5 → 20 al cerrar` |

Los **datos de NAVE son los de la maqueta, tal cual**: 23 comercializables, 15 libres / 5 se
liberan / 3 tomados, periodo 31 ago → 30 sep, contrato `PUN-05` a `$1.050.000` + `ISL-04` a
`$1.200.000` por 61 días = **`$4.575.000`**, las siete tarifas, los tres hitos de liberación.

**La geometría del isométrico también es la de la maqueta.** No la dibujé de nuevo: extraje del
SVG de `elegida-vender.html` la posición, el tamaño y la altura reales de las 94 piezas
(23 alquilables + 71 de sala) invirtiendo la proyección, y las volví a dibujar con un motor
propio de 40 líneas. Por eso el piso es el mismo, la entrada y las cajas están donde estaban, y
las góndolas siguen partidas en dos caras. Lo que cambió es que ahora **cada cara se pinta desde
un token** en vez de tener el hex quemado, así que el plano se da vuelta entero al cambiar de
tema. Cada estado son tres caras del mismo color —tapa más clara, cara derecha con la identidad,
cara izquierda más oscura—, calculadas con `color-mix(in oklch, …)`; no hay colores nuevos.

---

## Qué trae de E

1. **Display de sistema en 800 con tracking cerrado** (`-.022em`) en «Piso de NAVE», «Contrato»,
   «Tarifa de referencia» y en `NAVE`. Es lo primero que hace que esto se vea como la landing.
2. **Mono con cifras tabulares en todo lo que se compara**: códigos, plata, fechas, contadores,
   el rango del periodo, las cifras de la escalera, la columna de tarifas. Ésa es la regla dura
   de esta opción — si dos cosas se van a comparar, van en mono y alineadas a la derecha.
3. **Rótulos pill en versalita** (9,5 px, peso 600, tracking `.13em`): `PERIODO`, `TEMPORADAS`,
   `PROVEEDOR`, `DESDE`, `TOTAL DEL CONTRATO`, `TIPO DE ESPACIO`, `SIN FIRMAR`.
4. **Líneas finas en vez de sombras.** `--sh-*` no se usa ni una vez.
5. **Los conectores**, traducidos: los ordinales `01…04`, la guía de 1 px del rótulo a su
   mueble, y la fila de la tarifa que se sombrea cuando su tipo está en el contrato.
6. **Un solo amarillo, el de etiqueta de precio, en un solo sitio**: `Guardar contrato y avisar`.
7. **Claro por defecto, oscuro a un clic**, toggle sol/luna que escribe `data-tema="oscuro"` en
   `<html>` y lo recuerda en `localStorage` bajo `recabra-tema` (la llave de PR 1). Sin leer
   `prefers-color-scheme`, como manda la spec.

**El riesgo que se me pidió cuidar** —que la densidad se coma la identidad— se cuida en tres
sitios concretos: la display de los títulos no baja de 800, los pill no pierden el tracking
abierto aunque cuesten 3 px de alto, y **el total del contrato se queda en 27 px**. Todo lo
demás se apretó; esos tres no.

---

## La escala de letra

Los siete tamaños de la maqueta vieja eran de otra tipografía. Acá la escala es la de E, con los
nombres de `tema.css`. **Ocho pasos y ninguno más**, verificados sobre el DOM renderizado:

| Token | px | Dónde |
|---|---|---|
| `--t-3xs` | 9,5 | rótulos pill y versalitas (`PERIODO`, `PROVEEDOR`, cabeceras de tabla, rótulos del gráfico) |
| `--t-2xs` | 11 | notas, pies, fechas del eje, **el código y su fecha de liberación sobre el mueble**, la descripción del espacio |
| `--t-xs` | 12 | mono secundaria: chips de la escalera, el rango del periodo, «Guardalo como reserva» |
| `--t-sm` | 13 | cuerpo, filas de la tarifa |
| `--t-base` | 14,5 | títulos de panel, campos, botón principal, cifras de la escalera |
| `--t-md` | 17 | código de espacio en el contrato |
| `--t-lg` | 21 | `NAVE` en la barra |
| `--t-xl` | 27 | el total del contrato |

Dos decisiones dentro de la escala:

- **Sobre el mueble, el código y su fecha miden lo mismo (11 px) y se distinguen por peso y
  color** — mono 700 en tinta contra texto 600 en el color del estado. Es literalmente la regla
  que quedó escrita en `ESTADO.md`; acá se cumple porque el rótulo se dimensiona en píxeles
  reales dividiendo por la escala vigente del SVG (la técnica de `--lbl` de E), así que **nada
  baja de 11 px reales por más que el plano se achique**.
- **Ningún rótulo del plano se coloca a ojo.** Los 23 chips se miden con
  `getComputedTextLength()` y se deschocan por código: se colocan de cerca hacia el fondo y el
  que choca sube en pasos de 3 px, así el que se aparta es siempre el mueble más lejano. Después
  el `viewBox` se recalcula desde el `getBBox()` real. Es la costumbre de `docs/maquetas`
  —verificar por script y no a ojo— traída adentro del propio prototipo.

---

## El color de estado, validado

Los cuatro estados son los de `tema.css`, sin mover un hex:

| Estado | Claro | Oscuro |
|---|---|---|
| Libre todo el periodo | `#00805A` (`--st-libre-l`) | `#00BE86` (`--st-libre-d`) |
| Se libera en el periodo | `#CE8A0A` (`--st-libera-l`) | `#F5A524` (`--st-libera-d`) |
| Ocupado | `#D8342E` (`--st-tomado-l`) | `#F4544E` (`--st-tomado-d`) |
| Resto de la sala | `#AAB3BE` (`--st-resto-l`) | `#33414F` (`--st-resto-d`) |

```
$ node .../dataviz/scripts/validate_palette.js "#00805A,#CE8A0A,#D8342E" --mode light

Palette (light, surface #fcfcfb, categorical): 3 slots
  [PASS] Lightness band         all 3 inside L 0.43–0.77
  [PASS] Chroma floor           all 3 >= 0.1
  [PASS] CVD separation         worst adjacent #D8342E↔#CE8A0A ΔE 10.4 (deutan) · tritan 14.4
  [PASS] Normal-vision floor    worst adjacent #D8342E↔#CE8A0A ΔE 17.9 (normal)
  [WARN] Contrast vs surface    below 3:1 — relief required (visible labels or table view): [["#CE8A0A",2.82]]

  → ALL CHECKS PASS  (CVD in the 6–8 floor band is legal ONLY with secondary encoding: direct labels, gaps, or texture)


$ node .../dataviz/scripts/validate_palette.js "#00BE86,#F5A524,#F4544E" --mode dark

Palette (dark, surface #1a1a19, categorical): 3 slots
  [FAIL] Lightness band         outside band: [["#00BE86",0.709],["#F5A524",0.782]]
  [PASS] Chroma floor           all 3 >= 0.1
  [PASS] CVD separation         worst adjacent #F5A524↔#00BE86 ΔE 9.3 (protan) · tritan 16.5
  [PASS] Normal-vision floor    worst adjacent #F4544E↔#F5A524 ΔE 18.7 (normal)
  [PASS] Contrast vs surface    all 3 >= 3:1

  → FAILED — fix the marked checks
```

Y sobre **las superficies reales de esta pantalla**, con todos los pares y no sólo los vecinos:

```
$ ... --mode light --surface "#FFFFFF" --pairs all        (la tarjeta)

  [PASS] Lightness band         all 3 inside L 0.43–0.77
  [PASS] Chroma floor           all 3 >= 0.1
  [PASS] CVD separation         worst all-pairs #D8342E↔#00805A ΔE 9.2 (protan) · tritan 14.4
  [PASS] Normal-vision floor    worst all-pairs #D8342E↔#CE8A0A ΔE 17.9 (normal)
  [WARN] Contrast vs surface    below 3:1 — relief required: [["#CE8A0A",2.89]]

  → ALL CHECKS PASS


$ ... --mode dark --surface "#0B1116" --pairs all         (el panel oscuro)

  [FAIL] Lightness band         outside band: [["#00BE86",0.709],["#F5A524",0.782]]
  [PASS] Chroma floor           all 3 >= 0.1
  [WARN] CVD separation         worst all-pairs #F4544E↔#00BE86 ΔE 7.5 (deutan) · tritan 16.5
  [PASS] Normal-vision floor    worst all-pairs #F4544E↔#F5A524 ΔE 18.7 (normal)
  [PASS] Contrast vs surface    all 3 >= 3:1

  → FAILED — fix the marked checks
```

**Claro: `ALL CHECKS PASS`.** El único `WARN` es el ocre `#CE8A0A` a 2,82:1 sobre el papel y
2,89:1 sobre la tarjeta — el mismo punto que E dejó anotado. El validador pide relieve
(«visible labels or table view») y acá lo hay tres veces: **cada estado lleva su palabra al
lado** en la leyenda, la fecha escrita sobre el propio mueble (`libre 25 sep`) y el código
listado otra vez en la escalera bajo su fecha. La identidad de un estado no depende nunca sólo
del color.

**Oscuro: no pasa la banda de luminosidad, y el arreglo obvio es peor que la falla.** La banda
oscura del validador es `L 0.48–0.67`, calibrada contra una superficie tipo `#1a1a19`; la de
acá es `#0B1116`, bastante más profunda, y por eso los tres tokens viven arriba de la banda
(`#00BE86` L 0.709, `#F5A524` L 0.782). Lo probé: **bajar el ámbar a la banda mata la
separación que la banda existe para proteger.**

```
$ ... --mode dark --surface "#0B1116" --pairs all     (los tres DENTRO de la banda)
    #00A170, #B87A0A, #D9433D

  [PASS] Lightness band         all 3 inside L 0.48–0.67
  [FAIL] CVD separation         worst all-pairs #D9433D↔#B87A0A ΔE 3.9 (deutan) · tritan 12.1
  [FAIL] Normal-vision floor    worst all-pairs #D9433D↔#B87A0A ΔE 13.9 (normal)
```

De ΔE 18,7 a 13,9 en visión normal y de 7,5 a 3,9 en deuteranopía: ocre y rojo se colapsan.
Los tokens del PR 1 eligieron la separación por encima de la banda, y en esta pantalla —donde
lo que se separa es «te lo puedo vender» de «está tomado»— es la elección correcta. **No moví
ningún hex**: los tokens son de PR 1 y cambiarlos arrastra la auditoría entera. Queda anotado
para el director de arte, con el número que hace falta para decidir.

Un detalle más: `--ring` (el foco del teclado) es `#8A6100` en claro y `--y-400` en oscuro.
Viene así de `tema.css`; es la única amarillez fuera del botón principal y no es una decisión
mía. Si el dueño la quiere en tinta, es un token.

---

## Lo que dejé afuera, y por qué

| Qué | Por qué |
|---|---|
| Cualquier ficha flotante al pasar el mouse sobre el plano | El chip ya dice el código y el estado; el resto aparece en el contrato al tocar. Una ficha sería un segundo sitio diciendo lo mismo. Queda el `<title>` nativo y el `aria-label`, que no ocupan píxeles |
| Zoom y arrastre sobre el plano | En 1440 × 900 la sala entera cabe con los 23 códigos legibles a 11 px. Un zoom sería un control que no contesta ninguna pregunta |
| El calendario del mes | Ya descartado tras probarlo; la banda de temporada del gráfico y los sellos del contrato dicen lo mismo mejor |
| Una barra comparando el canon ofrecido contra otros | Es la fuga confidencial que el rediseño ya identificó. Lo único que va al lado del precio negociado es **la tarifa pública del mismo espacio** (`tarifa $1.150.000` bajo `$1.050.000`), que es lista de precios y es del proveedor que está enfrente |
| Un anillo o barra de ocupación | 15 de 23 se cuenta, no se grafica. Los contadores discretos van en la leyenda del plano, que es donde se miran |
| El techo en 23 en la escalera | Ya descartado en el rediseño: aplasta el escalón, que es el dato que se negocia |
| Íconos | Salvo el sol/luna del interruptor, que es el único sitio donde no hay una palabra que pueda ir en su lugar |

---

## Los dos puntos donde se puede mover el dial

**1 · La banda de temporadas.** Hoy es una fila de 38 px con las seis temporadas y estira el
contrato al tocarla. **Hacia menos:** borrarla y dejar sólo el rango del periodo — se ganan
38 px de alto para el plano y se pierde el gesto de venta («te lo dejo cubriendo Navidad»),
que es el que más se usa entre llamada y llamada. **Hacia más:** que la banda también mueva
el periodo que mira el gráfico, no sólo el contrato. Lo dejé sin hacer porque entonces cambia
la escalera bajo los pies de quien está leyendo, y en esta pantalla eso desorienta.

**2 · Cuánto grita el gris.** El resto de la sala está al 72 % de opacidad en claro y al 100 %
en oscuro, con la tapa apenas aclarada. **Hacia atrás:** bajarlo más lo vuelve casi papel y los
16 alquilables saltan solos, pero la sala deja de reconocerse como la tienda que el proveedor
conoce, que es justo para lo que está el isométrico. **Hacia adelante:** subirle el contraste
hace el plano más «maqueta de arquitectura» y menos tablero. Es un número (`--resto-op`).

---

## Verificado

- **1440 × 900, claro y oscuro: `scrollWidth 1440`, `scrollHeight 900`.** Cero scroll para
  cerrar trato y revisar. Ningún panel recorta a su contenido (medido hijo por hijo: el
  desborde máximo es −1 px, es decir, no hay).
- **Cero errores de consola** en los tres tamaños, en los dos temas.
- **390 px:** una sola columna, `scrollWidth 390` (ningún desborde horizontal); el plano se
  queda con los rótulos que tienen algo que decir —los que se liberan, los ocupados y los del
  contrato— y la escalera rueda dentro de su caja en vez de encogerse hasta lo ilegible. No es
  perfecto, y no se rompe.
- **Confidencialidad, por `grep` sobre el HTML entero:** cero apariciones de `COCA COLA`,
  `Postobón`, `Colanta`, `nutresa`, `brayan`, `camilop`, `RECAMIER`; cero de `5.300.001`,
  `14.234.060`, `5.107.310`, `9.126.750`, `294.411`, `2.649.699`; cero de `ranking`, `vencidos`
  y `por debajo de la tarifa`. El único proveedor nombrado es **ALPINA**, que es el que está
  del otro lado del escritorio.
- **Amarillo:** `--signal` aparece exactamente una vez en toda la hoja de estilos, en
  `.btn-principal`.
- **Sin recursos externos:** cero `<link>`, cero `<script src>`, cero `@import`, cero `url(`.
  La única `http://` del archivo es el namespace `http://www.w3.org/2000/svg`.
- **Tamaños de letra renderizados:** 9,5 · 11 · 12 · 13 · 14,5 · 17 · 21 · 27. Ocho, los ocho
  de la tabla, ni uno más. Nada por debajo de 9,5.
- **Interacción probada por script:** tocar `ISL-06` y `PUN-03` en el plano los mete en el
  contrato (4 espacios), tocar `Navidad` estira el plazo a 101 días y el total pasa a
  `$15.486.667` con cinco sellos, y el panel sigue sin recortar (la lista rueda). Quitar con
  `×` deshace. El cursor de la escalera escribe la lectura al mover el mouse y vuelve al 26 de
  septiembre al salir.
- **Accesibilidad:** cada mueble vendible es `role="button"` con `tabindex` y nombre accesible
  («PUN-03, Punta de góndola, pasillo 3 de cara a las cajas, se libera el 25 sep»); los ocupados
  no son botones porque no se pueden vender en el periodo; `Enter` y espacio los alternan; el
  foco tiene anillo visible; `prefers-reduced-motion` apaga las transiciones.

## Cómo está hecho (para el port a React)

- **`ESPACIOS` (23) y `RESTO` (71) son constantes**: código, celda, tamaño, alto, tipo, estado,
  fecha de liberación y ubicación. Cambiar la sede es cambiar dos arrays.
- **El isométrico es una función de 40 líneas** (`caja()` + `dibujarPlano()`), sin librería. La
  proyección es `x = 38(a−b)`, `y = 19(a+b) − 19·alto`; el orden de pintado es `a+b` creciente.
- **El color de las caras sale de un token y dos porcentajes** (`--tapa-p`, `--cara-p`), así que
  el tema oscuro no necesita un segundo juego de hex. Hay `fill` plano antes del `color-mix`
  como respaldo si el navegador no lo soporta.
- **Los rótulos se dimensionan y se deschocan después del render**, en un `requestAnimationFrame`
  y en un `ResizeObserver`. En React: `useRef` + escritura imperativa, **no** `useState` (sería
  un render por cuadro al redimensionar).
- **El total es `suma mensual × días / 30`** y los sellos salen de intersectar el plazo con las
  seis temporadas. Nada está escrito a mano dos veces: la cifra de la tarifa, el pie de la tabla
  y los contadores de la leyenda salen todos de las mismas constantes.
