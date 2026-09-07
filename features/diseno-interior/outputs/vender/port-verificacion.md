# Verificación del port de Vender (PR 2)

Rama `claude/fase-10-vender`, árbol de trabajo `/tmp/retail-espacios-test` (sin commit).
Base de comparación: `origin/main` = `64943d7`, sacado a un worktree en `/tmp/re-antes-v`.
Verificador: única sesión que corrió la suite del backend y `npm run build`.

**Veredicto: NO pasa como está.** Una sola cosa lo bloquea —`npm run probar` termina en 1— y
la falla no está en el port sino en el guardarraíl que el auditor agregó. Todo lo demás
—tipos, build, suite del backend, hoja sin scroll, rótulos sin choques, las tres
interacciones, confidencialidad, un amarillo, contraste, consola— se midió y da bien
sobre datos sembrados de verdad. Aparecen dos hallazgos que ninguno de los dos informes
previos tenía: el CSS de Vender **no** está acotado a `.vender` y sí alcanza a Supervisar,
y la escalera se pisa a sí misma a 390.

---

## 0 · Qué se corrió

| Paso | Comando | Resultado |
|---|---|---|
| Tipos | `cd frontend && npx tsc --noEmit` | **0 errores** |
| Build | `cd frontend && npm run build` | **OK**, 2227 módulos, 8,73 s. Sólo el aviso de siempre de chunks > 500 kB (`Dashboard-BSh3N3cI.js` 1.058 kB) |
| Suite del frontend | `cd frontend && npm run probar` | **FALLA · exit 1** (detalle en §1) |
| Suite del backend | `cd backend && rm -f retail_espacios.db recabra_*.db && TMPDIR=/tmp/pt-verif-v python -m pytest -q -p no:warnings` | **exit 0** · 1000 casos: 991 ✓, 7 xfail, 2 skip. Una sola corrida. |

Huérfanos: `ps -eo pid,args` no encontró ningún `pytest`, `vite`, `uvicorn` ni `node`
ajeno antes de empezar. Nada que matar.

---

## 1 · La única falla dura: `npm run probar` termina en 1

La cadena entera pasa hasta el último eslabón:

```
probar:planta 33 ✓ · probar:propuesta 18 ✓ · probar:nomenclatura 29 ✓ · probar:pasillos 12 ✓
probar:revision 19 ✓ · probar:acomodar 11 ✓ · probar:landing 21 ✓ · probar:tema 24 ✓
probar:vender 21 ok / 2 FALLA        ← acá corta
```

`probar:tema` pasa, así que la regla de «un `.btn-principal` por archivo de pantalla»
está satisfecha: el segundo `.btn-principal` que el auditor había marcado como aviso ya
no existe (hoy hay uno solo, `ModoVender.tsx:561`; en `ModoVender.tsx:325-331` quedó
escrito el porqué).

Las dos que fallan son **de la propia herramienta, no del port**. Confirmado leyendo el
código y corriéndolo:

- `frontend/scripts/probar-vender.mjs:413-415` define `enSuperficie(x)`, que recorta lo
  que de verdad pinta Vender.
- `frontend/scripts/probar-vender.mjs:417` — `const fuera = LIT.filter((x) => !ESCALA.has(x.v));`
- `frontend/scripts/probar-vender.mjs:418` — `const dentro = LIT.filter((x) => ESCALA.has(x.v));`

Las dos líneas aseveran sobre **`LIT` completo** en vez de `LIT.filter(enSuperficie)`. Su
propio aviso, tres líneas más arriba, imprime la respuesta:

```
aviso · cuerpos literales: 69 en total · 0 dentro de lo que pinta Vender · 69 sólo en Supervisar (PR 3)
FALLA cero cuerpos de letra fuera de la escala `--t-*` en Vender   → 46 !== 0
FALLA los cuerpos que SÍ caen en un paso están escritos con el token → 23 !== 0
```

Los 69 literales que lista son todos de `src/pages/DashboardView.tsx` y todos de
Supervisar (413, 423, 433, 1574…2818). Comprobado a mano: los cinco archivos de la
superficie de Vender están **en cero literales de cuerpo de letra**:

```
src/components/Contrato/ModoVender.tsx   0
src/components/Contrato/Contrato.tsx     0
src/components/Contrato/Planometria.tsx  0
src/components/Libera/Libera.tsx         0
src/vender.css                           0
```

El arreglo es de una línea en cada una de las dos, como decía el frontend. **No lo toqué**
(la orden era no arreglar nada). Mientras siga así, `npm run probar` —y con él cualquier
CI que lo llame— queda en rojo por una razón que no es el port.

---

## 2 · El arnés de medición

Todo lo de abajo se midió contra **datos sembrados reales**, no contra stubs — que es
justo el hueco que el frontend dejó abierto.

- Semilla: `/tmp/claude-0/-home-user/ec50873b-2574-5c04-9eb9-9bb14f1c55a8/scratchpad/v/seed_v.py`
  → sede `NAVE`, **19 muebles · 22 caras comercializables** (≥ 20), **dos proveedores
  ajenos** (`POSTOBON`, `ALQUERIA`) y **tarifas por tipo** con override de sede
  (`default: gondola 900.000 · punta 1.200.000 · isla 1.500.000 · cross 700.000`;
  `by_sede.NAVE.punta = 1.350.000`).
- Los **cinco estados** de la clave quedan poblados con el periodo por defecto de Vender
  (hoy → hoy+30): 14 libres · 5 se liberan adentro · 3 tomados todo el periodo · 2 muebles
  no comercializables (`CAJ-01` checkout, `ZON-01` metro) · «En el contrato» se llena al
  tocar el plano. Además hay dos caras **vencidas** (`GON-02·B`, `PUN-06`) y dos
  **contratadas a futuro** (`GON-03·A`, `EXP-02`) para que `displayStatus` recorra todo.
- ANTES: `git worktree add /tmp/re-antes-v origin/main` + `npm ci --legacy-peer-deps` +
  `npm run build`, servido por su propio `uvicorn` en **:8031**.
  DESPUÉS: el `dist` de la rama servido por el `uvicorn` del árbol de trabajo en **:8032**.
  Los dos apuntan a la **misma** sqlite sembrada, así que la única variable es el código.
- Playwright con `executablePath /opt/pw-browsers/chromium-1194/chrome-linux/chrome`,
  sesión por `localStorage` (`retail-auth-v1`, rol `admin`, cliente `galerias`), y el modo
  oscuro **por el toggle real** (`button[aria-label="Cambiar a modo oscuro"]`), no por
  `colorScheme` ni por escribir la llave.
- Capturas en `features/diseno-interior/outputs/vender/capturas/`:
  `port-{antes,despues}-{claro,oscuro}-{1440x900,1366x768,1440x800,390x844}.png` (16),
  `port-{antes,despues}-supervisar-1440x900.png` (2),
  `port-despues-contrato-1440x900.png`, y la referencia `port-D-{claro,oscuro}-1440x900.png`.

---

## 3 · Scroll de documento y contenido escondido en paneles

Medido con el toggle real en los dos modos: `scrollHeight − clientHeight` del documento y
del `body`, y todo elemento de la pantalla cuyo `overflow` tape alto o ancho.

| Resolución | Modo | ANTES doc / escondido | DESPUÉS doc / escondido |
|---|---|---|---|
| 1440×900 | claro | 0 px / **1 panel esconde 162 px de alto** | 0 px / **0** |
| 1440×900 | oscuro | 0 px / 1 panel, 162 px | 0 px / **0** |
| 1366×768 | claro | 0 px / **2** (248 px de alto + 38 px de ancho) | 0 px / **0** |
| 1366×768 | oscuro | 0 px / 2 (248 px + 38 px) | 0 px / **0** |
| 1440×800 | claro | 0 px / **1 panel esconde 262 px** | 0 px / **0** |
| 1440×800 | oscuro | 0 px / 1 panel, 262 px | 0 px / **0** |

**La promesa se cumple:** en los tres tamaños pedidos, en claro y en oscuro, el documento
no rueda y ningún panel esconde nada. El «antes» sí escondía entre 162 y 262 px dentro de
un contenedor con `overflow:auto`, que es exactamente lo que este PR vino a arreglar.

**Un matiz honesto:** con el contrato **armado** (2 espacios, proveedor escrito) aparecen
dos `<span>` que tapan **24 px de ancho cada uno** — son las líneas de ubicación de la
ficha («A unos 21 m de la…», «A unos 15 m de la…»), truncadas con puntos suspensivos.
Es el gap que el propio frontend declaró (`describirUbicacion` devuelve textos largos).
No es scroll escondido: es una línea recortada con `text-overflow`. Pero D **no** recorta:
ahí la ubicación va en dos líneas («pasillo 5, de cara a las cajas»). Queda en §7.

A 390×844: el documento no rueda, pero **`.vender` rueda 507 px** en su propio contenedor
y **0 px de ancho escondido**. En el «antes», a 390, había **6 nodos tapando ancho**
(hasta 745 px). Mejora clara.

---

## 4 · Rótulos del plano: choques y textos cortados

Rects de **todos** los `<text>` visibles del plano más el HTML que va encima (los botones
`+ − Centrar`). Choque = intersección real de rects, margen 0. Cortado = texto que se sale
de la caja del lienzo. Los acercamientos se hicieron con los botones reales (`+` × 1,25,
`−` ÷ 1,25) partiendo siempre de `Centrar`.

**30 combinaciones (3 resoluciones × 2 modos × 5 encuadres): 0 choques y 0 textos cortados.**

| Encuadre | Zoom de cámara | Escala de pantalla (1440×900) | Textos | Choques | Cortados |
|---|---|---|---|---|---|
| 1× | 1,000 | 1,481 | 22 + 3 HTML | 0 | 0 |
| «+» ×2 (≈1,5×) | 1,5625 | 2,314 | 21 + 3 | 0 | 0 |
| «+» ×3 (≈2×) | 1,953 | 2,892 | 19 + 3 | 0 | 0 |
| «−» ×1 | 0,800 | 1,185 | 22 + 3 | 0 | 0 |
| «−» ×2 | 0,700 * | 1,037 | 22 + 3 | 0 | 0 |

\* `ponerZoom` (`DashboardView.tsx:1158`) recorta a `Math.max(0.7, …)`, así que el segundo
«−» no llega a 0,64 sino que topa en 0,70. No es un defecto, pero conviene saberlo: dos
clics de «−» y tres dan el mismo encuadre.

La cesión de rótulos funciona y es la que evita los choques: de 22 textos a 1× quedan 21 a
1,56× y 19 a 1,95× (a 1366×768 y 1440×800, 18 con «−» ×2). Nadie se pisa en ningún paso.

**El cuerpo del rótulo mide 10,50 px en pantalla en los quince encuadres**, medido con
`getScreenCTM()` (`font-size` × escala del `<g class="iso-escena">`). La promesa de `--lbl`
se cumple exactamente.

0 errores de consola en las 6 sesiones de esta medición.

---

## 5 · Las tres interacciones

Las tres andan, en claro y en oscuro, con 0 errores de consola.

### 5.1 · El mouse sobre una fila de tarifa apaga la sala

| Acción | `data-foco` | Hijos a **opacidad 0,20 exacta** | Hijos a 1 | Muebles encendidos | Rótulos marcados |
|---|---|---|---|---|---|
| en reposo | `0` | 0 de 22 (todos a 1) | 22 | — | — |
| fila **Isla** | `1` | **18 de 22** | 4 | **3** | ISL-01 · ISL-02 · ISL-04 |
| fila **Punta de góndola** | `1` | 18 | 4 | **5** | PUN-01 · 02 · 03 · 05 · 06 |
| mouse afuera | `0` | 0 | 22 | — | — |

Lo importante: `ISL-03` y `PUN-04` están tomadas todo el periodo y **no** se encienden;
`ISL-04` y `PUN-05` sí, porque se liberan adentro. El resaltado dice «lo que le podés
ofrecer», no «lo que hay de ese tipo». Idéntico en los dos modos.

### 5.2 · El cursor de la escalera reescribe la lectura

Lectura en el encabezado del panel 02, en mono a la derecha. Con el mouse, cinco posiciones
sobre el gráfico → **cinco lecturas distintas de cinco**:

```
si arrancás el  9 de sep → 16 libres
si arrancás el 16 de sep → 15 libres
si arrancás el 22 de sep → 15 libres
si arrancás el 29 de sep → 17 libres
si arrancás el  5 de oct → 17 libres
```

Con **teclado** (foco en el `<svg>` del panel, `→` ×6 y `←` ×3): **7 lecturas distintas de
10 pasos**, avanzando día a día y volviendo (16 → 17 → 18 → 19 → 20 → 21 → 22 → 21 → 20 → 19
de sep). Topa correctamente en el último día del periodo. Igual en claro y en oscuro.

### 5.3 · Un clic en un mueble libre suma al contrato y actualiza los conteos

Clic sobre `PUN-01` (libre) en el plano. Los tres lugares se mueven **a la vez**:

| Lugar | Antes | Después de 1 clic | Después de 2 (PUN-01 + ISL-01) |
|---|---|---|---|
| Clave · Libre todo el periodo | 14 | **13** | **12** |
| Clave · En el contrato | 0 | **1** | **2** |
| Tarifa · fila Punta de góndola | `4 +1` | **`3 +1`** | `3 +1` |
| Tarifa · fila Isla | `2 +1` | `2 +1` | **`1 +1`** |
| Pie de la tarifa | `22 comercializables · 14 +5 · 19 al cerrar` | **`13 +5 · 18 al cerrar`** | **`12 +5 · 17 al cerrar`** |
| Plazo de la ficha | `31 días · 0 espacios` | `31 días · 1 espacio` | `31 días · 2 espacios` |
| Total del contrato | `—` | **`$1.395.000`** | **`$2.945.000`** |

Aritmética exacta contra las tarifas sembradas y los 31 días del periodo:
`1.350.000 ÷ 30 × 31 = 1.395.000`; `+ 1.500.000 ÷ 30 × 31 = 1.550.000` → `2.945.000`. ✓
La fila del contrato trae el código, el tipo, la ubicación y el precio, con la × para
sacarlo. El botón amarillo pasa de deshabilitado a habilitado al escribir el proveedor.

---

## 6 · Confidencialidad, amarillo, letra, contraste, consola

### 6.1 · Confidencialidad — **0 fugas** (y el hallazgo grave del auditor está cerrado)

Cosecha sobre `innerText` de `.vender` + todo `<text>`/`<tspan>` del SVG +
`aria-label` / `title` / `placeholder` / `alt`. Se buscó: los dos proveedores sembrados,
las dos categorías de marca, y `canon`, `ranking`, `facturación`, `recaudo`, `margen`,
`ocupación`, `sin alquilar`, `bajo tarifa`, `por debajo de tarifa`.

| Estado | Claro | Oscuro |
|---|---|---|
| Arranque | 0 | 0 |
| Pasando el mouse por los 22 muebles | 0 | 0 |
| Con el contrato armado (3 espacios + proveedor escrito) | 0 | 0 |

**Reproduje la fuga del auditor en `origin/main` y confirmé que el port la cierra.** Con el
mouse sobre los muebles tomados **todo el periodo**, que es el disparador:

| Mueble | ANTES (`origin/main`), en Vender | DESPUÉS |
|---|---|---|
| `GON-01` | `GON-01 A: tomado · POSTOBON · B: libre los 31 días` | (sin globito de proveedor) |
| `PUN-04` | `PUN-04 tomado · POSTOBON` | `PUN-04 tomado` |
| `ISL-03` | `ISL-03 tomado · ALQUERIA` | `ISL-03 tomado` |

El nombre del proveedor ajeno salía en la pantalla que el administrador gira hacia el
proveedor. Hoy dice `tomado` a secas. Los dos proveedores sí siguen a la vista en
**Supervisar**, que es donde corresponde (columna «Proveedor», 22 filas).

### 6.2 · Un solo amarillo

- `.btn-principal` en el DOM de Vender: **1** — «Guardar contrato y avisar». En el código
  también hay uno solo (`ModoVender.tsx:561`); `probar:tema` pasa.
- Nodos de `.vender` que pintan `--signal` resuelto: **1**, y es ese botón.
  Claro `rgb(242 179 0)`, oscuro `rgb(255 208 40)`.
- **El aviso del auditor sobre `--ring` está cerrado dentro de Vender**: `tema.css:359`
  sigue con `--ring: var(--signal-ink)`, pero `vender.css:44` lo redefine a
  `var(--ink-1)`. Resuelto: `rgb(10 16 20)` en claro, `rgb(237 243 242)` en oscuro.
  Tabulando por toda la pantalla (**14 paradas en claro, 20 en oscuro**) el máximo de nodos
  amarillos a la vez es **0** además del botón. Ni con foco de teclado hay un segundo
  amarillo, como pide D §5.6.

### 6.3 · Tamaño de letra

137 nodos con texto propio, en los dos modos. Cuerpos renderizados en pantalla
(los del SVG convertidos con `getScreenCTM`):

```
10 · 10,5 · 11,5 · 12,5 · 13,5 · 15 · 17,5 · 30
```

Ocho cuerpos, los ocho de la escala `--t-*` de `tema.css` más el rótulo constante del plano
(10,5). **Mínimo real: 10,00 px. Cero textos por debajo de 10 px.**

### 6.4 · Contraste

88 pares de texto/fondo por modo, midiendo el fondo real subiendo por los ancestros y
mezclando alfas. Piso WCAG AA (4,5:1; 3:1 para texto grande).

| Modo | Pares | Mínimo | Por debajo del piso |
|---|---|---|---|
| Claro | 88 | **4,52:1** | **0** |
| Oscuro | 88 | **4,71:1** | **0** |

Los rótulos del plano se midieron aparte porque su fondo efectivo es el **halo**
(`paint-order: stroke`, 2,13 px): peor caso **17,96:1 en claro** y **15,94:1 en oscuro**.

**Aviso que sigue abierto** (es el del auditor, y lo confirmo): el botón principal
**deshabilitado** —el estado de arranque de Vender— se lee a **3,62:1 en claro** y
**4,05:1 en oscuro** (`rgb(104 120 138)` sobre `rgb(228 231 225)` / `rgb(110 129 144)`
sobre `rgb(22 33 42)`). WCAG 1.4.3 exime los controles inactivos, por eso es aviso y no
falla; pero es lo primero que ve quien abre la pantalla.

### 6.5 · Consola

**0 errores** en las **34 sesiones** de navegador de esta verificación (captura, scroll,
rótulos, interacciones, textos, teclado, Supervisar, 390), en los dos modos, en los dos
lados. También 0 en el «antes».

---

## 7 · Fidelidad contra `opciones/D-fusion/index.html`

D capturado a 1440×900 en claro y oscuro:
`capturas/port-D-{claro,oscuro}-1440x900.png`. La comparación con
`capturas/port-despues-contrato-1440x900.png` (mismo estado: dos espacios y proveedor).

**Lo que está portado y coincide** (verificado nodo a nodo, no de ojo): los cuatro paneles
`01 · 02 · 03 · 04` con el ojo numerado y el conector; la rejilla 2×2 con el plano arriba a
la izquierda, la escalera abajo, el contrato a la derecha y la tarifa abajo a la derecha;
la clave de cinco estados con separador antes de «En el contrato»; las herramientas
`+ − Centrar` arriba a la derecha del lienzo; la lectura chica en mono a la derecha del
encabezado de 02, con la misma frase («si arrancás el N de mes → N libres»); el peine de
días con los chips; la ficha con la pastilla «sin firmar», los cuatro campos, el plazo, el
`TOTAL DEL CONTRATO` a 30 px en mono, los sellos y el botón amarillo adentro; la tabla de
tarifa con la columna «Libres · entran» y el pie de tres cifras; la escala de ocho pasos
(D usa `10 · 10,5 · 11,5 · 11,7 · 12,5 · 13,5 · 15 · 17,5 · 30`, el port
`10 · 10,5 · 11,5 · 12,5 · 13,5 · 15 · 17,5 · 30` — el 11,7 de D es un `em` calculado).
Geometría casi calcada: lienzo 1002×510 en D contra 1002×481 en el port; `graf` 1002×216
contra 1002×210.

**Diferencias visibles, en orden de peso:**

1. **Las dos barras.** D tiene **una** barra (`.rail`: marca · sede · Vender/Supervisar ·
   fecha · toggle). El port tiene **dos**: la barra de la aplicación (RECABRA · Sede ·
   Montajes · Plano · Editor 3D · Sincronizado · tema · Administrador · ⚙ · salir) **más**
   la barra de la pantalla. El techo del panel 01 baja de **y=113 a y=148 (35 px)** y el
   lienzo pierde **29 px de alto**. Es el pendiente que el frontend declaró; se ve en toda
   captura.
2. **El periodo cambió de lugar.** En D es un `<p class="periodo">` **dentro del lienzo**,
   arriba a la izquierda, y dice «31 ago → 30 sep 2026 **· 31 días**». En el port subió a
   la barra de pantalla como botón desplegable «7 sep → 7 oct 2026», **sin los días**.
3. **La acción secundaria es otra.** D: «**Guardalo como reserva**» (guardar sin firmar).
   El port: «**Empezar de nuevo**» (descartar). No es un cambio de rótulo: es otra acción.
4. **La ubicación se trunca.** D pinta «pasillo 5, de cara a las cajas» en dos líneas; el
   port la recorta con puntos suspensivos en una («A unos 21 m de la…»), escondiendo 24 px
   por fila. Es la única cosa escondida que encontré en toda la hoja.
5. **El plano no rotula las salas.** D dibuja `ENTRADA` y `CAJAS` sobre el piso con el
   mismo halo del rótulo; el port no dibuja nombres de sala. Pendiente ya declarado.
6. **Rótulo de la clave más largo.** D: «Se libera». El port: «Se libera en el periodo».
7. **Un afluente de más en la ficha.** El port agrega «+ Correo, nota y planometría», que
   en D no existe.
8. **Diferencias que son de datos, no de diseño** (la semilla no es la de D): D tiene 106
   muebles / 23 comercializables / 7 filas de tarifa y dos filas de chips en el peine; la
   semilla tiene 19 / 22 / 4 filas y una fila de chips. D muestra dos sellos («Cubre Amor y
   Amistad» y «Cubre Halloween») porque su periodo es de 61 días; el port muestra uno con
   31 días.

---

## 8 · Supervisar: sigue funcionando, pero **no** quedó intacta

### 8.1 · Funcionalmente, idéntica

Comparando ANTES (:8031) y DESPUÉS (:8032) sobre la misma base:

- `innerText` del `main`: **idéntico carácter por carácter** (2641 caracteres).
- Cabeceras de la tabla: idénticas (`Código · Tipo · Proveedor · Estado · Montaje · Desde ·
  Hasta · Días · Renta / mes`).
- **22 filas**, idénticas las dos veces.
- Lista de botones: idéntica.
- Documento no rueda (900/900) en los dos.
- **0 errores de consola** en los dos.
- La franja de cinco cifras (`Canon vigente $9.650.000 · Sin alquilar $13.150.000 ·
  Vence en 30 días $4.550.000 · Ocupación 27% · Sin montar 2`): **idéntica al píxel**.
- El plano de Supervisar: **idéntico al píxel** (la región del lienzo no aparece en el
  diff).

### 8.2 · Hallazgo nuevo: el CSS de Vender **no** está acotado a `.vender`

El informe del frontend dice: *«Todo el CSS nuevo cuelga de `.vender` … así que Supervisar,
Montaje y el editor 3D no ven una sola regla nueva»*. **Eso no es cierto.**

En `frontend/src/vender.css` hay **46 selectores globales**, sin `.vender` ni `.vp` ni
`.iso-` delante. Entre ellos:

```
frontend/src/vender.css:196  .herr            frontend/src/vender.css:226  .clave
frontend/src/vender.css:204  .herr button     frontend/src/vender.css:235  .clave i
frontend/src/vender.css:295  .rotulos         frontend/src/vender.css:243  .clave b
frontend/src/vender.css:314  .rotulos .p-cod  frontend/src/vender.css:249  .clave span
… más .eitem, .espacios, .acciones, .sello, .ojo, .lectura, .gChip, .pl-hit, .corte,
  .cubre, .btn2, .plazo-fila, .p-cod, .p-fec, .x, .total
```

Y **tres de esas clases llegan de verdad a Supervisar hoy**: `.clave`, `.iso-escena` y
`.rotulos` (las dos últimas por el `IsoMap` compartido). En el «antes» no había ninguna.

**Consecuencia medida:** la clave de Supervisar cambió de aspecto.

| | ANTES | DESPUÉS |
|---|---|---|
| Marcador de color | `<span>` 10×10, radio 2 px, **sin borde** | `<i>` 10×10, radio 2 px, **borde de 1 px** en el token del estado |
| Separación entre ítems | 14 px | **11 px** (`vender.css:229`) |
| Cuerpo del texto | 12 px | **12,5 px** (`--t-xs`, `vender.css:230`) |
| Los conteos | tipografía del cuerpo | **mono, negrita** (`vender.css:243`) |
| Ancho de la fila | 485,4 px | **512,6 px** (+27,2 px, empieza 27 px más a la izquierda) |

Diff de píxeles de las dos capturas de Supervisar: **34.731 px distintos (2,68 %)**,
concentrados en la clave, los rótulos de la barra y el riel derecho (el resto son
corrimientos de sub-píxel en el texto). Nada se rompe y nada se pierde —por eso digo que
Supervisar «sigue funcionando»— pero **no es la misma pantalla**, y el PR dice que sí lo es.
El riesgo real no es lo que se ve hoy: es que `.eitem`, `.sello`, `.acciones`, `.total`,
`.x` o `.espacios` son nombres genéricos que van a chocar con lo próximo que se escriba en
Montaje o en el editor 3D. Acotar el archivo entero bajo `.vender` es una tarde de trabajo;
descubrirlo por un choque, no.

---

## 9 · Hallazgo nuevo: la escalera se pisa a sí misma a 390

A **390×844** el panel 02 tiene **10 choques reales de texto** (descontados los pares
padre/hijo). A 1440×900, **0**.

```
«AMOR Y AMISTAD»            × «sin cambios durante 9 días»   106,6 × 11,0 px
«AMOR Y AMISTAD»            × «15»                            16,6 ×  7,4 px
«AMOR Y AMISTAD»            × «16»                            16,6 × 11,0 px
«sin cambios durante 9 días»× «15» / «16» (tres pares)         16,6 × 8-12 px
«16 sep» × «19 sep»                                             7,4 × 12,0 px
«19 sep» × «21 sep»                                            18,1 × 12,0 px
«26 sep» × «29 sep»                                             7,4 × 12,0 px
«GON-03» × «GON · GÓNDOLA, POR CARA»                           39,9 × 12,0 px
```

Se ve a simple vista en `capturas/port-despues-claro-390x844.png`: la banda de temporada,
la leyenda «sin cambios durante 9 días» y los números se superponen; el peine de fechas se
apelmaza; y el chip `GON-03` tapa el pie del glosario. La escalera no reduce ni cede a
ancho chico como sí hace el plano. El resto de la pantalla a 390 está bien: el documento no
rueda, `.vender` rueda 507 px en su propio contenedor y **0 px de ancho escondido**
(el «antes» tenía 6 nodos tapando hasta 745 px de ancho).

---

## 10 · Resumen para el que decide

**Lo que hay que hacer antes de mezclar:**

1. `frontend/scripts/probar-vender.mjs:417-418` — `LIT.filter(enSuperficie)` en las dos
   líneas. Es lo único que tiene rojo el `npm run probar`, y no es del port.

**Lo que hay que decidir:**

2. `frontend/src/vender.css` — 46 selectores globales; `.clave`, `.iso-escena` y `.rotulos`
   ya cambiaron el aspecto de la clave de Supervisar. O se acotan bajo `.vender`, o se deja
   escrito que la capa es compartida y se acepta el cambio en Supervisar (§8.2).
3. La escalera a 390 (§9): 10 choques de texto. Si el dueño mira Vender en el teléfono, es
   un defecto; si no, es deuda.
4. Las diferencias 2, 3, 4 y 7 de §7 (el periodo fuera del lienzo, «Empezar de nuevo» en
   lugar de «Guardalo como reserva», la ubicación truncada, el afluente de más) son
   decisiones de producto, no defectos: hay que confirmarlas contra la pieza aprobada.
5. El botón principal deshabilitado a 3,62:1 (§6.4).

**Lo que quedó comprobado y no hay que volver a mirar:** tipos, build, 1000 casos del
backend, la hoja sin scroll ni nada escondido en 1440×900 / 1366×768 / 1440×800 en los dos
modos, 0 choques y 0 cortados en los cinco encuadres del plano, el rótulo a 10,50 px
constantes, las tres interacciones con la aritmética exacta, la fuga del globito cerrada,
un solo amarillo también con foco de teclado, 0 textos bajo 10 px, 0 pares bajo el piso de
contraste, y 0 errores de consola en 34 sesiones.

---

## 11 · Limpieza

Servidores `uvicorn` de :8031 y :8032 matados; worktree `/tmp/re-antes-v` eliminado
(`git worktree remove`); la sqlite sembrada y los `recabra_*.db` borrados; `/tmp/pt-verif-v`
borrado. El árbol de trabajo queda como estaba: **no se tocó una sola línea de código**.
Los scripts de medición quedan en
`/tmp/claude-0/-home-user/ec50873b-2574-5c04-9eb9-9bb14f1c55a8/scratchpad/v/`
(`seed_v.py`, `lib.mjs`, `m1-scroll.mjs` … `m15.mjs`).
