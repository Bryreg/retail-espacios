# El port de D al sistema — Vender de `/` (administrador)

D es un prototipo con NAVE escrita adentro; acá los datos salen del store real
(fixtures, caras, temporadas, contratos, tarifas). Lo que se portó es el
**tratamiento**: la composición, el rótulo del plano, el resaltado, la escalera,
la ficha del contrato, la tabla de tarifa y la escala de letra.

Archivos: `frontend/src/vender.css` (nuevo, capa 3 de Vender),
`pages/DashboardView.tsx`, `components/Contrato/ModoVender.tsx`,
`components/Contrato/Contrato.tsx`, `components/Libera/Libera.tsx`,
`src/tema.css`, `src/index.css`. Borrados: `components/StoreView/`,
`components/Legend/`.

Mediciones: `medicion/` (cómo se corren) · capturas `capturas/port-*.png`.

---

## 1 · Lo que se portó tal cual

| De D | Dónde vive ahora |
|---|---|
| La hoja: cuatro paneles `01 · 02 · 03 · 04`, plano arriba a la izquierda, escalera debajo, contrato a la derecha con lugar fijo, tarifa abajo; `1004fr : 402fr`, filas `550 : 254` con un piso cada una | `.vender-hoja` en `vender.css` |
| El conector: la línea fina que baja del panel de arriba al número del de abajo | `.vp.conect::before` |
| El encabezado de panel: `ojo` en mono con su rayita, display 800 para el título, la aclaración que cede primero | `.vp > header`, `.ojo` |
| La clave de **cinco** estados con sus conteos, «En el contrato» como quinto | `MapLegend` + `.clave` |
| El rótulo sobre el mueble: dos `<tspan>`, interlineado en `em`, halo por `paint-order:stroke`, **sin caja**, cuerpo constante en pantalla (`--lbl` = 10,5 px ÷ escala) | `IsoMap` + `.p-cod` |
| Las anclas: **centroide de la tapa**, calculado del propio SVG | `IsoMap → labels` |
| Las dos caras de una góndola **en puntas opuestas**, corridas sobre el eje que las separa | `SEP_CARA` |
| La regla de cesión **calculada, no medida un paso tarde**: `calibrar()` mide una vez (segundo cuadro, repitiendo hasta que dos pasadas coinciden) y `acomodar()` es aritmética pura sobre la cámara recién escrita | `IsoMap → calibrar / acomodar / aPantalla` |
| La cámara imperativa (rueda, arrastre, `+ − Centrar`), fuera de `useState` | `IsoMap → cam`, `escribir()` |
| La caja de impacto: el clic lo cobra el mueble, no el rótulo (`pointer-events:none` en el texto) | `.pl-hit` |
| El resaltado: apagar la sala al 20 % por CSS sobre los hijos de la escena y encender con `classList`, desde la tarifa, los chips y las filas del contrato | `destacar()` + `.iso-escena[data-foco="1"]` |
| La escalera A·4 entera: sin columna lateral, sin eje vertical, peine de días, cifra al inicio de cada meseta, «sin cambios durante N días», banda de temporada, chips bajo su fecha con el estado `paso` | `Libera.tsx` |
| La lectura chica, en mono, a la derecha del encabezado, con la cifra tabular y las palabras en la familia de texto («el 25 **de** sep», no «el 25  de  sep») | `Lectura` + `.lectura` |
| La ficha: filas mono con el código a 17,5, separador punteado, `Proveedor \| Marca` y `Desde \| Hasta` en dos pares, total en tinta a 30, sellos de temporada, botón amarillo con «Guardalo…» debajo | `ModoVender.tsx` + `.eitem/.corte/.total/.sello/.acciones` |
| Los **12 px de holgura** puestos por el margen de `.acciones` y no por el relleno del panel: se ven *y* se cuentan como contenido, así que la ficha avisa antes de romper | `.acciones{margin-bottom:12px}` |
| La tabla de tarifa con `th+th, td+td{padding-left:12px}` (para que `+5` y `20` no se lean «+520»), anchos de columna fijos y el pie entero | `.vender .tabla` |
| Los conteos **derivados**, la misma cuenta mirada tres veces | `tallyVender`, `porCategoria`, el pie |
| El apretón en ventana baja: sólo rellenos e interlineados, ni un cuerpo de la escala | `@media (max-height:880px)` |
| La escala de ocho pasos de D (10 · 11,5 · 12,5 · 13,5 · 15 · 17,5 · 21 · 30) | `tema.css` |
| `--ring` en tinta: ni con foco de teclado hay un segundo amarillo | `.vender{--ring:var(--ink-1)}` |

---

## 2 · Lo que se adaptó, y por qué

**El marco: D no tenía barra de aplicación.** Su rail de 56 px ERA la barra.
Acá arriba de la hoja hay dos: la de la aplicación (51 px, compartida con
Montajes / Plano / Editor 3D, que este PR no toca) y la de la pantalla (Sede ·
Vender/Supervisar · periodo · fecha · Planilla/Tarifas/Actualizar). O sea **~43
px menos de hoja** que la pieza que el dueño aprobó. Consecuencias, todas
declaradas y medidas: la barra de la pantalla va apretada en Vender (40 px, 36
en ventana baja), el umbral de «rueda como documento» pasa de 760 a **790**, y
la válvula de la ficha se abre un espacio antes en 1440×800. Fusionar las dos
barras es PR 3 y está anotado en `ESTADO.md`.

**Rueda la pantalla, no el documento.** El armazón de la aplicación es
`height:100dvh; overflow:hidden`: un documento más alto que la ventana no se
puede alcanzar, se recorta. Por debajo de 790 px de alto la barra la pone
`.vender`. Es la misma promesa de D —nada escondido, todo alcanzable— por el
único camino que este armazón permite.

**La tabla `AJUSTE` no se puede portar: se calcula.** D corría cinco anclas a
mano —siempre 20 unidades, en una de cuatro direcciones— porque conocía sus 23
muebles. Acá los muebles los pone el usuario en el editor de plano, así que la
misma regla va calculada: el ancla natural es el centroide de la tapa y, si
choca, se prueban **las cuatro desviaciones de un único valor** (`DESVIO`, las
mismas 20 unidades de D expresadas en milésimas del ancho del plano) antes de
ceder. Un solo valor, cuatro direcciones, ninguna lista.

**Las cajas de impacto suben a una capa propia.** En D vivían adentro del grupo
del mueble. Acá los prismas se pintan de atrás hacia adelante sobre un plano que
cambia con la sede, y una caja metida en el grupo de un mueble del fondo queda
tapada por los de adelante: el clic sobre el rótulo elegía el mueble equivocado
—y si ese mueble no se alquilaba, **vaciaba el contrato**—. Medido antes de
moverlas: `GON-61·B` no entraba y el contrato se borraba. Ahora la capa
`impactos` va encima de todo y cada caja lleva su propio mueble y su cara.

**El plano suma por CARA.** Cada mitad de tapa y cada caja de impacto llevan
`data-cara`, así que tocar la mitad de atrás de una góndola suma la cara B.
Antes entraba siempre la A y la B había que ir a buscarla al renglón. Los dos
interruptores `A`/`B` del renglón siguen ahí: ya no son el único camino.

**Se fueron las pastillas de código y el panel «Qué está libre».** Colgaban de
cada fila de la tarifa y contestaban «cuáles son»; en la hoja de D lo contesta
el plano, que escribe los 23 códigos sobre el mueble, y el resaltado de la fila
los señala. Repetir 23 códigos que ya están dibujados es el caso de manual de
«si dos elementos dicen el mismo dato, uno sobra». Con ellas se fue el filtro
por tipo al hacer clic: dos mecanismos de apagado sobre el mismo plano.

**Correo, nota y planometría van en un desplegable.** D tiene cuatro campos;
este contrato tiene además correo, nota, planometría y el aviso de a quién se le
va a avisar. Con los cuatro siempre abiertos la ficha no cierra con dos espacios
sin esconder algo, y esconder sin avisar es lo que este PR vino a sacar. Cerrado
—que es la llamada típica— la composición es la de D con sus 12 px de holgura;
abrirlo es un gesto deliberado y ahí sí el cuerpo rueda, con su barra a la vista.

**El botón volvió adentro de la ficha** y desapareció la barra flotante del pie.
Esa barra existía porque la pantalla rodaba; con la hoja de D no rueda.
«Guardalo como reserva» no existe en este producto: su lugar lo ocupa «Empezar
de nuevo», que es la acción que sí hay.

**La fila del contrato tiene dos renglones y ni uno más.** Arriba el tipo, abajo
la ubicación y —sólo si lo hay— el desvío contra la referencia. La referencia
entera («referencia $1.200.000») era un tercer renglón para un número que ya
está en el panel de al lado; con él, dos espacios ya hacían rodar la ficha 82
px. Los dos renglones van con puntos suspensivos: una ubicación larga no puede
hacer crecer la fila.

**Un espacio tomado SÍ puede entrar al contrato** (D lo prohibía). Acá el
periodo del plano y las fechas del contrato son dos cosas distintas: se puede
vender para noviembre una punta que está tomada en septiembre. La fila lo dice
(«vendido en el periodo») y el formulario avisa antes de guardar.

**No se portó la píldora del periodo sobre el plano.** El periodo ya está en la
barra de la pantalla, y ahí además es el CONTROL que lo cambia. La píldora sería
el mismo dato dos veces.

**`ENTRADA` y `CAJAS` no existen en este plano.** El isométrico se genera de los
muebles del editor, no del SVG de `riel.py`: no hay nombres de sala pintados en
el piso, así que la parte de la regla de cesión que los gobierna no tiene a
quién gobernar. El resto de la regla —los rótulos, el lienzo, lo que flota
encima— sí está.

**La escalera mide su propia caja.** D fijó `viewBox = 974 × 202` porque conocía
el ancho de su panel. Acá el panel cambia con la ventana, así que el SVG se mide
con un `ResizeObserver` y su viewBox ES su caja: dibuja a escala 1 y sus cuerpos
son 10,5 · 11,5 · 15 exactos, no 10,3 · 11,3 · 14,7.

---

## 3 · Los pendientes del PR 1 que este port cierra

**Los 7,6 px de desborde del rótulo.** No se arreglaron achicando la letra: el
rótulo se rehizo como el de D —halo por `paint-order` en vez de caja, dos
`<tspan>` con interlineado en `em`, cuerpo constante en pantalla— y encima se
portó el deschocador. La caja de ancho fijo, que era lo que desbordaba, no
existe. **0 choques y 0 textos cortados** en todo el barrido (§4.1).

**Las siete clases de `DISPLAY_TOP`.** Resuelto por las dos puntas, y escrito
sobre `ESTADO_CLARO` en `DashboardView.tsx`:

1. **Del plano se borró.** Las dos pantallas ponen siempre un periodo, así que
   `topColorFor()` no se pintaba nunca desde que ese efecto existe: un respaldo
   que no corre es un respaldo que nadie prueba. El plano pinta siempre
   `RANGE_TOP`, que es la terna validada.
2. **De la tabla y del popover se quedó** —ahí se lee el CONTRATO, no el color
   del plano— pero **sobre los cuatro colores validados**: se fueron los dos
   tintes al 60 % (`#66B39C`, `#E2B96C`), los únicos dos hex del archivo que no
   había validado nadie. Que cuatro de los siete compartan color no pierde
   información: cada estado va siempre con su palabra al lado, que es la regla
   del sistema; inventar tres matices más sería elegir color a ojo, que es lo
   que este proyecto tiene prohibido desde que verde + naranja reprobó.

**La escala tipográfica.** Los ocho pasos `--t-*` pasaron a los valores de D. El
token se lee desde dos lugares del sistema (`.rotulo` y el total del contrato),
así que el cambio de valor no relayoutea nada fuera de Vender; Vender los
consume enteros desde `vender.css`. Se agregó `--lbl-px: 10,5px`, que **no es un
noveno paso**: es el cuerpo que un rótulo dibujado adentro de un SVG tiene que
medir en pantalla, y lo comparten el plano (dividido por la escala) y la
escalera (tal cual).

**`StoreView.tsx` y `Legend.tsx`**: borrados (nadie los importaba).

---

## 4 · Mediciones propias

Playwright con `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`,
`reducedMotion:'reduce'`, contra el dev server del repo en `:5231` con la API en
stubs y un layout con la forma de NAVE (106 muebles · 23 caras · 15 libres · 5
se liberan · 3 tomados). Scripts en `medicion/`.

### 4.1 · Rótulos del plano: cero choques, cero cortes

Se miden los rects de **todos** los `<text>` del plano más los textos HTML que
flotan encima (las tres herramientas) y se cruzan todos contra todos; dos cajas
se consideran pisadas si se cruzan o si se acercan a menos de 2 px.

| Encuadre | Textos | **Choques** | Cortados | Holgura mín. | Cuerpo del rótulo |
|---|---|---|---|---|---|
| inicial (1×) | 26 | **0** | 0 | 2,9 px | **10,50 px** |
| 1,56× (`+`×2) | 24 | **0** | 0 | 5,0 px | **10,50 px** |
| 1,95× (`+`×3) | 22 | **0** | 0 | 5,0 px | **10,50 px** |

**Barrido con la rueda:** 9 puntos del lienzo × 3 recorridos (3 adentro, 6
adentro, 3 afuera) = **27 encuadres, 0 choques, 0 textos cortados**. Idéntico en
claro y en oscuro, y en 1440×900, 1440×800 y 1366×768.

El cuerpo se mide con `getScreenCTM` (font-size del SVG × escala de la matriz):
**10,50 px en los tres acercamientos**, que es la promesa entera de `--lbl`.

**Un defecto encontrado y arreglado midiendo:** la primera versión daba 1 choque
a 1× y 2 en el barrido. No era el algoritmo: `calibrar()` medía rótulos que
`acomodar()` ya había corrido, así que el desplazamiento se contaba dos veces y
las cajas quedaban corridas justo lo necesario para que dos se cruzaran sin que
la cuenta lo viera. Se arregla devolviendo todos al ancla natural antes de
medir. Es la misma clase de error que D documenta en su §4.3, un paso más atrás.

**Y otro:** la rueda iba como `onWheel` de React, que en React 18 es un oyente
**pasivo**: el `preventDefault()` no hacía nada (108 avisos de consola por
sesión) y la página rodaba mientras uno creía estar acercando el plano. Va como
oyente nativo con `{passive:false}` sobre el lienzo. **0 errores de consola** en
todas las corridas desde entonces.

### 4.2 · La pantalla: nada escondido

`sh/ch` del documento, y un barrido de **todos** los elementos buscando
contenedores que escondan alto o ancho.

| Ventana | Documento | Escondido | Botón amarillo | Pie de la tarifa | Filas de la rejilla |
|---|---|---|---|---|---|
| **1440×900** | 900 / 900 | **0** | entero | entero | 521 + 248 |
| 1600×900 | 900 / 900 | **0** | entero | entero | 521 + 248 |
| 1920×1080 | 1080 / 1080 | **0** | entero | entero | 649 + 300 |
| **1440×800** | 800 / 800 | **0** | entero | entero | 443 + 240 |
| 1280×800 | 800 / 800 | **0** | entero | entero | 443 + 240 |
| **1366×768** | 768 / 768 | la pantalla rueda 11 px, con barra | entero | entero | 430 + 240 |
| 390×844 | 844 / 844 · **0 px de ancho escondido** | rueda 567 px, con barra | — (rodando) | — (rodando) | apiladas |

Idéntico en los dos modos. **0 errores de consola** en las 14 sesiones.

A 390 la barra de la pantalla empujaba **93 px** de ancho (el grupo
Planilla·Tarifas·Actualizar no envolvía): ahora envuelve y el ancho escondido es
**0**.

### 4.3 · La ficha del contrato: la válvula

Holgura medida como el director de D: `fondo del cuerpo − fondo de .acciones`.
Con el proveedor escrito, que es cuando la pista se retira (regla de D:
`.pista` se va del tercer espacio en adelante).

| Espacios | 1440×900 | 1440×800 | 1366×768 |
|---|---|---|---|
| 1 | **0 px rueda · 12 de holgura** | 0 · 12 | 0 · 12 |
| 2 | **0 px rueda · 12 de holgura** | 0 · 12 | rueda 5 px |
| 3 | **0 px rueda · 12 de holgura** | rueda 15 px | rueda 28 px |
| 4 | rueda 48 px, con barra | rueda 60 px | rueda 73 px |
| 5 | rueda 97 px | rueda 105 px | rueda 118 px |

En **1440×900 —la resolución que el dueño aprobó— la válvula se abre en el
cuarto espacio, igual que en D**. En 1440×800 se abre en el tercero y en
1366×768 en el segundo: son los 43 px de barra de aplicación que D no tenía
(§2), y es la misma excepción declarada que D anotó en su §9.7 para 1366×768.

### 4.4 · Los conteos se derivan

| En el contrato | Clave del plano | Fila «Isla» | Pie de la tarifa |
|---|---|---|---|
| 0 | 15 libres · 0 en el contrato | 3 | 23 espacios · 15 +5 · 20 al cerrar |
| 1 *(ISL-05)* | **14** libres · 1 | **2** | 23 · **14 +5** · **19 al cerrar** |
| 2 *(+ISL-04)* | **13** libres · 2 | **1** | 23 · **13 +5** · **18 al cerrar** |

Lo que entra al contrato deja de estar libre en los tres lugares a la vez, y
**no se cuenta como tomado**: tiene su propio estado en la clave.

Aritmética: una isla a `$1.200.000` por 31 días = `1.200.000 / 30 × 31` =
**$1.240.000**; con `PUN-05` (`$1.150.000`) = **$2.428.333**. Exacto.

### 4.5 · Que funcione

| Prueba | Resultado |
|---|---|
| Hover en la fila «Isla» de la tarifa | `data-foco=1`, **105 de 108 hijos de la escena al 0,20**, 3 muebles encendidos, rótulos `ISL-04 · ISL-05 · ISL-06` |
| Salir de la fila | `data-foco=0` |
| Hover en el chip `PUN-03` de la escalera | apaga la sala, enciende `PUN-03` |
| Hover en una fila del contrato | apaga la sala, enciende ese mueble, y la fila toma `.hl` |
| Tocar `ISL-05` / volver a tocarlo | entra y sale del contrato, con la cuenta correcta |
| Tocar la cara B de `GON-61` en el plano | entra `GON-61·B` (no la A) |
| Escalera con el mouse | «si arrancás el **19 de sep** → **15** libres» |
| Escalera con `→` `→` y `←` | 19 → **21 de sep** → **20 de sep** |
| Cambiar a Supervisar y volver | la franja de cinco cifras, «Para revisar» y la tabla intactas; ninguna regla de `vender.css` la alcanza; **0 errores** |

### 4.6 · Las reglas duras

| Regla | Verificación |
|---|---|
| **Vender la ve el proveedor** | Grep sobre el DOM renderizado —`innerText`, los `<text>` del SVG, `aria-label`, `title`, `placeholder`, `alt`— con el contrato armado, en los dos modos: **0 apariciones** de proveedores ajenos (`COCA COLA`, `NUTRESA`, que sí están en los datos y sí se ven en Supervisar), `canon`, `ranking`, `vence`, `facturación`, `recaudo`, `margen`, `ocupación`, `sin alquilar`, `por debajo de tarifa` |
| **Un amarillo** | Un solo nodo de toda la pantalla pinta con `--signal` resuelto (`rgb(242,179,0)`): `.btn-principal`, «Guardar contrato y avisar». Con el contrato guardado, «Vender otro espacio» va en **tinta** |
| **El anillo de foco tampoco es amarillo** | `--ring` dentro de `.vender` resuelve a `rgb(10 16 20)` en claro y `rgb(237 243 242)` en oscuro |
| **Claro por defecto** | `data-tema="claro"` sin `prefers-color-scheme`; el oscuro entero a un clic |
| **Ningún texto del plano pisa otro** | §4.1 |
| **Contraste ≥ 4,5:1** | Barrido de todo texto visible de Vender contra su fondo real, en los dos modos: **0 por debajo del piso**. Los dos que el barrido marca son los rótulos de los muebles elegidos, cuyo fondo el script no puede ver (es un polígono del SVG): medidos a mano dan **8,02:1** en claro (`#FFFFFF` sobre `--pl-et #46525B`) y **17,29:1** en oscuro. El «0» de la columna libres sobre fila marcada: **5,59:1** en claro y **4,81:1** en oscuro — es `--ink-3` y no `--ink-4`, que ahí daba **4,12:1** |
| **La escala** | Nueve cuerpos renderizados en toda la pantalla: **10 · 11,5 · 12,5 · 13,5 · 15 · 17,5 · 30**, los ocho pasos declarados menos `--t-lg` (que Vender no usa), más el rótulo constante del plano (9,43 px en unidades del SVG = **10,50 px en pantalla**) y los 10,5 de la escalera |
| **Sin librerías nuevas** | `package.json` sin dependencias nuevas |

### 4.7 · Las suites

`npx tsc --noEmit` limpio. `probar:tema` 24 ✓ · `probar:landing` 21 ✓ ·
`probar:acomodar` 11 ✓ · `probar:nomenclatura` 29 ✓ · `probar:planta`,
`probar:propuesta`, `probar:pasillos`, `probar:revision` ✓ (0 fallas).

`probar:tema` marcó un defecto real y se arregló: la tarjeta «contrato
guardado» usaba `.btn-principal` para «Vender otro espacio», o sea dos amarillos
declarados en el mismo archivo. Pasó a tinta.

---

## 5 · Lo que queda anotado

**`probar:vender` (el guardarraíl del auditor) queda en dos fallas, y las dos
son de su propio alcance.** Los siete guardas de fondo pasan —confidencialidad,
un amarillo, `--signal` acotado, la lista de componentes, el guarda de modo, el
rótulo sin caja, el rótulo constante, el código muerto—. Las dos que fallan son
las de la escala de letra, y el propio test imprime al lado el aviso que lo
explica: **«69 cuerpos literales, 0 dentro de lo que pinta Vender, 69 sólo en
Supervisar (PR 3)»**. El test calcula bien qué está adentro de la superficie de
Vender (`enSuperficie`) pero después asevera sobre la lista completa:

```js
const fuera  = LIT.filter((x) => !ESCALA.has(x.v));   // scripts/probar-vender.mjs:417
const dentro = LIT.filter((x) =>  ESCALA.has(x.v));   // :418
```

Con `LIT.filter(enSuperficie)` en esas dos líneas, el test mide lo que dice
medir y queda verde. **Los 19 literales que sí estaban adentro de Vender ya se
tokenizaron** (el tooltip del plano, `Libera`, `Planometria`, `vender.css`):
`PROBAR_VENDER_REGIONES=1` lo confirma en 0. Tokenizar los 69 de Supervisar
—8,5 px → 10, 14 → 15, 16 → 17,5…— es mover la tipografía de una pantalla que
este PR tiene prohibido rediseñar, y el propio test la marca como PR 3.

**Las dos barras.** Es el pendiente que más paga: fusionar la barra de la
aplicación con la de la pantalla devolvería ~43 px a la hoja, y con ellos la
válvula del contrato se abriría en el cuarto espacio también en 1440×800 y el
umbral de rodar volvería a los 760 de D.

**`EXH-CENTRAL` en el FloorMap** sigue desbordando: es otro componente y no
entra en Vender.

**El plano no tiene `ENTRADA` ni `CAJAS`** (§2). Si algún día el isométrico
dibuja nombres de sala, la parte de la regla de cesión que los gobierna —ceden
si pasan por debajo de lo que flota, si se salen del lienzo, o si el
acercamiento los deja por debajo de 8 px— hay que traerla de D §4.3.

**La escalera aprieta a dos chips por fecha** (D mostraba dos por columna
también, pero con `+N` cuando sobran). Con una sede donde se liberen tres caras
el mismo día, la tercera queda en el `+1`. Está medido y es el comportamiento
declarado, no un corte.

*Sin commit ni push. Fuera de `frontend/src`, `docs/ESTADO.md` y
`features/diseno-interior/outputs/vender/` no se tocó nada.*
