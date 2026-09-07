# Auditoría del port de Vender (Fase 10 · PR 2)

**Rol:** red team de forma y de frontera sobre el port de **D · «La fusión»** a
`pages/DashboardView.tsx`, `components/Contrato/`, `components/Libera/`.
**Referencia exacta:** `outputs/vender/opciones/D-fusion/index.html` + su
`README.md` (lo aprobado por el dueño) y `VERIFICACION-D.md`.
**Rama:** `claude/fase-10-vender`, base `82349a9`. **Sin commit ni push.**

El frontend portó **en paralelo** con esta auditoría, así que hay dos estados
medidos y conviene no confundirlos:

| | |
|---|---|
| **BASE** | `82349a9` (el código antes del port), medido en un worktree aparte |
| **PORT EN CURSO** | el árbol de trabajo al cerrar esta auditoría (`DashboardView.tsx`, `ModoVender.tsx`, `Contrato.tsx`, `Libera.tsx`, `tema.css`, `index.css` modificados + `vender.css` nuevo; `StoreView.tsx` y `Legend.tsx` borrados) |

---

## 1 · El entregable: `frontend/scripts/probar-vender.mjs`

Escrito con el patrón de `probar-landing.mjs` / `probar-tema.mjs`. Agregado como
`probar:vender` y **al final de la cadena `probar`** en `package.json`.

```bash
cd frontend && npm run probar:vender          # sólo lo estático, sin navegador
```

**Diez pruebas estáticas** (grep con recorte, cero dependencias nuevas) y
**once con navegador**, que sólo corren cuando se pasan las variables — así
`npm run probar` no necesita ni servidor ni Chromium ni `playwright-core`
(que **no** se agregó como dependencia a propósito):

```bash
PROBAR_VENDER_URL=http://localhost:5211 \
PROBAR_VENDER_SEDE=NAVE \
PROBAR_VENDER_TOKEN="$(cat token.txt)" \
PROBAR_VENDER_AJENOS="POSTOBON,ALQUERIA" \
PROBAR_VENDER_PLAYWRIGHT=/ruta/a/playwright-core/index.mjs \
node scripts/probar-vender.mjs
```

### Cómo recorta «la superficie de Vender»

Es la parte que hay que entender antes de tocar el archivo. El test **no**
mira `DashboardView.tsx` entero: recorta la rama del ternario
`modoEfectivo === "vender" ? ( … )` contando paréntesis, y desde ahí camina los
identificadores hacia las definiciones que alcanza (nivel 0 y las del propio
componente de pantalla), más los cuatro archivos que el modo dibuja enteros
(`ModoVender`, `Contrato`, `Planometria`, `Libera`). Poda las líneas guardadas
por modo (`=== "supervisar"`, `!== "vender"`, y la rama falsa de
`modo === "vender" ? … : …`).

Tres decisiones que sostienen todo lo demás:

1. **Si no encuentra el anclaje, falla.** Un test que no puede afirmar nada
   falla; no pasa. Lo mismo si el recorte sale vacío o si cambian los nombres
   (`IsoMap`) o el formato de las definiciones.
2. **`PROBAR_VENDER_REGIONES=1`** imprime qué entró en la superficie y por qué
   — es lo primero que hay que mirar cuando una falla parece venir de un
   archivo ajeno.
3. **Los tipos y el store quedan afuera.** Ahí `supplierName` es el nombre de un
   campo del modelo, no una letra en pantalla.

### Qué comprueba, y por qué así

| # | Prueba | La trampa que evita |
|---|---|---|
| 1 | **Ningún campo ajeno LLEGA A PANTALLA** (`supplierName`, `supplierEmail`, `brandName`, `brandCategory`, `negotiatedValue`) | Buscar el nombre del campo a secas da 30 falsos positivos: `facesOf` lo copia, `kpis` lo suma y `Contrato` lo **escribe** con el proveedor que está sentado enfrente. Se buscan las **tres formas de pintar**: interpolado en plantilla, con texto de respaldo (`x \|\| "Sin proveedor"`, que es una cadena para leer) y como hijo de JSX. Las claves de objeto quedan fuera |
| 2 | **Ni un texto** de ranking / «bajo tarifa» / canon / vencimiento ajeno / plata del periodo | Sólo se miran **cadenas que se pintan**: se descartan los miembros de una unión de tipos (`\| "vencido"`) y las comparaciones (`phase === "vencido"`), que son valores del dominio, no letras |
| 3 | **La lista de componentes que Vender dibuja es cerrada** | Meter en la rama de Vender un panel escrito para Supervisar cuesta una línea de este archivo y una lectura, en vez de pasar sin que nadie lo mire |
| 4 | **El guarda de modo está en el sitio del render** | Ver §2.1: el guarda de `FixturePopover` vivía a tres mil líneas de distancia, en un `setState` |
| 5-6 | **Un amarillo**: ningún componente pinta dos `.btn-principal`; cero `--signal*` fuera de esa clase | «Uno por pantalla» es una regla sobre lo que se ve **a la vez**, y eso sólo lo sabe el DOM: la cuenta dura está en la prueba con navegador; la estática avisa |
| 7-8 | **La letra sale de la escala `--t-*`**, leída de `tema.css` (no hay números escritos en el test: si el port mueve la escala, el test la sigue) | Un `fontSize: 12.5` a mano es un paso que nadie declaró y que el modo oscuro, el apretón de ventana baja y la próxima pantalla no van a respetar |
| 9-10 | **El rótulo del plano**: sin caja de ancho fijo y con cuerpo constante en pantalla | Un `<rect>` NO es de por sí un problema —D usa uno transparente como caja de impacto—; molesta el que **pinta** o el que trae ancho literal. Y el cuerpo tiene que salir de `--lbl` o de una división por el acercamiento |
| 11 | **`StoreView` / `Legend` borrados o sin importadores** | Pendiente escrito de `ESTADO.md` |

Con navegador, además: que **Vender se dibuje sin un solo error**, el grep de
confidencialidad sobre `innerText` **+ los `<text>` del SVG + los `aria-label`,
`title`, `placeholder` y `alt`** (que no están en `innerText`), el mismo grep
**pasando el mouse por el plano** y **con el contrato armado**, el conteo de
botones amarillos visibles, la geometría de los rótulos en cuatro encuadres, y
el contraste WCAG de **todos** los pares texto/fondo en claro y en oscuro.

**Una prueba que pasa sobre una página en blanco es peor que ninguna.** Si la
pantalla no se reconoce, todas las de abajo fallan con *«este resultado NO vale
como medición»* en vez de dar verde. Pasó de verdad durante la auditoría: en
una corrida intermedia el port tenía un `ReferenceError: Lectura is not
defined` y el grep de confidencialidad daba 0 sobre nada.

---

## 2 · Hallazgos

### 2.1 · GRAVE (BASE) · El globito del plano nombraba al proveedor ajeno, en Vender

`pages/DashboardView.tsx`, dentro de `IsoMap`, en `82349a9`:

```ts
const rangeSub = (face: FaceEntry) => {
  if (!range) return face.supplierName || "Sin proveedor";
  …
  if (taken >= total) return `tomado${face.supplierName ? ` · ${face.supplierName}` : ""}`;
```

`tooltipSub` se calculaba **igual en los dos modos** —`IsoMap` ni siquiera
recibía `modo`—, así que pasar el mouse por un mueble ocupado todo el periodo
escribía **«tomado · POSTOBON»** en la pantalla que el administrador gira hacia
el proveedor. Es exactamente lo que la spec §0 prohíbe («nada de otros
proveedores»), y no lo veía ningún grep de fuente porque el texto no existe
hasta el `mousemove`.

**Reproducido en el navegador** contra `82349a9`, con dos proveedores sembrados:
`el globito del plano nombró a un proveedor ajeno al pasar el mouse: tomado ·
POSTOBON`. Captura:
`/tmp/claude-0/…/scratchpad/aud-vender/fuga-tooltip.png`.

**El port ya lo cerró**: `rangeSub` devuelve `"tomado"` a secas y la rama
`!range` desapareció. **Queda el test**, estático y con navegador, para que no
vuelva.

### 2.2 · MEDIO (BASE) · El guarda de `FixturePopover` no estaba donde se pinta

`tarjetaMapa` renderizaba `{selected && anchor && !detailFull && <FixturePopover …/>}`,
y `FixturePopover` dibuja `SupplierLine` → `{entry.supplierName}` y
`{entry.brandCategory}`. Lo único que lo mantenía fuera de Vender era, a tres
mil líneas de distancia:

```ts
setAnchor(modoEfectivo === "vender" ? null : point ?? null);
```

Un guarda **de dato**, no de modo, y en otro archivo mental. El día que alguien
quiera el globito en Vender «para ver el código», el nombre del proveedor ajeno
sale con él y nadie se entera. La prueba 4 lo exige en el sitio del render.
En el port en curso el problema ya no existe (Vender no dibuja `tarjetaMapa`).

### 2.3 · MEDIO (BASE) · La clave del plano tenía un respaldo de siete estados

Con `range` en `null`, `MapLegend` caía a la lista de ocho: `Libre`,
`Contratado`, `Ocupado`, **`Vencido`**, `Reservado`, `Mantenimiento`… El
vencimiento de un contrato ajeno, en Vender. Alcanzable sólo un cuadro (el
efecto pone el periodo enseguida), pero es el mismo respaldo que
`ESTADO.md` manda borrar («el mapa siempre tiene periodo») y el que sostenía el
pendiente de `DISPLAY_TOP` (**8 clases sobre 6 colores**, con
`active`/`expired`/`no_contract` en el mismo rojo).

**El port lo cerró**: `MapLegend` pide `tally` y `modo` sin `range` opcional,
y son las **cinco** de D, con «En el contrato» como quinta contada.

### 2.4 · ABIERTO · La escala tipográfica: **19 cuerpos** todavía escritos a mano dentro de Vender

Es la única falla dura que queda del test al cerrar la auditoría. La escala de
`tema.css` ya es la de D (**10 · 11.5 · 12.5 · 13.5 · 15 · 17.5 · 21 · 30**);
lo que falta es que la usen. `ModoVender.tsx` y `Contrato.tsx` están **en cero**,
así que el trabajo restante está localizado:

| Archivo | Cuántos | Cuáles |
|---|---|---|
| `components/Libera/Libera.tsx` | 7 | `372`, `383`, `387` → **10.5 px, fuera de la escala**; `376` = `--t-base`; `379`, `380`, `381` = `--t-2xs` |
| `components/Contrato/Planometria.tsx` | 7 | `145` → **11 px, fuera de la escala**; `103` = `--t-3xs`; `125`, `156` = `--t-xs`; `179`, `200`, `210` = `--t-2xs` |
| `src/vender.css` | 2 | `337` `font-size: 11.5px` = `--t-2xs` · `415` `font-size: 15px` = `--t-base` |
| `pages/DashboardView.tsx` (el globito del plano) | 3 | `1403` = `--t-2xs`; `1428` = `--t-2xs`; `1429` → **10.5 px, fuera de la escala** |

Los otros **76** literales del archivo son de Supervisar y **no bloquean este
PR**: el test los cuenta aparte y lo dice en un aviso. Las dos fallas están
partidas a propósito —«fuera de la escala» y «en la escala pero escrito a
mano»— para que se vea cuál es un paso inventado y cuál es sólo un token sin
usar.

### 2.5 · DECISIÓN DEL DUEÑO · El foco de teclado es un segundo amarillo

`tema.css` define `--ring: var(--signal-ink)` en claro y `var(--y-400)` en
oscuro. La referencia aprobada dice lo contrario, con la razón escrita
(D README §5.6): **`--ring: var(--ink-1)` en los dos modos, «ni con foco de
teclado hay un segundo amarillo»**. Hoy, tabulando por Vender, cada control
enfocado pinta ámbar además del botón principal.

Viene del PR 1 y toca todas las pantallas, así que el test **avisa y no falla**:
no es mi decisión, es una línea y es del dueño.

### 2.6 · DECISIÓN DEL DUEÑO · Dos acciones distintas con el mismo amarillo

`ModoVender.tsx` pinta `.btn-principal` dos veces: **«Guardar contrato y
avisar»** (`:521`) y **«Vender otro espacio»** (`:313`, la tarjeta de contrato
guardado). Son estados excluyentes —el conteo del DOM confirma **un solo
amarillo visible**— así que la regla «uno por pantalla» se cumple. Pero el
amarillo pasó de significar *«acá se cierra la venta»* a significar *«acá está
el botón»*: en BASE ese segundo botón era contorno verde. Avisa, no falla.

### 2.7 · MENOR · El botón principal deshabilitado se lee a 3,6 : 1

Con el contrato vacío —que es el estado de arranque de Vender, el primero que
alguien ve— «Guardar contrato y avisar» da **3,62 : 1** en claro y **4,05 : 1**
en oscuro. WCAG 1.4.3 exime los controles inactivos, así que el test lo saca del
assert y lo reporta como aviso. Queda anotado porque es el texto más grande de
la mitad derecha de la pantalla en el estado inicial.

### 2.8 · Código muerto: **cerrado**

`StoreView.tsx` y `Legend.tsx` están borrados en el árbol de trabajo. El test
sigue puesto y acepta las dos salidas (borrado, o presente y sin importadores).

---

## 3 · Lo que se midió y está bien

Contra la referencia D, en el port en curso, con datos reales del store
(fixtures, caras, temporadas, contrato) y **dos proveedores ajenos sembrados**:

| Lo que dice D | Medido |
|---|---|
| El rótulo mide **10,5 px constantes en pantalla** a todo acercamiento (README §2.3) | **10,50 px** en los cuatro encuadres (inicial, `+`×2, `+`×4, `−`×3). Medido con `getScreenCTM`, no con `getComputedStyle`: adentro de un SVG escalado el segundo devuelve unidades de usuario (4,63 · 2,96 · 1,90 px) y no dice nada |
| **Cero choques** y «el que choca o se sale cede» (§4.3) | **0 cruces** y **0 rótulos cortados** por el borde del lienzo en los cuatro encuadres, con el margen de **2 px** que usa D (dos cajas se consideran pisadas si se acercan a menos de eso). A `+`×4 quedan 9 de 12 textos: **3 ceden**, que es la regla funcionando |
| Rótulo **sin caja**, con halo | Ningún `<rect>` con relleno ni con ancho literal; `--lbl` publicado en `.iso-escena` y consumido por `font-size: var(--lbl)` en `vender.css`, con el trazo del halo atado a `calc(var(--lbl) * .30 / .42)` |
| El resaltado **apaga la sala** desde la tarifa y desde los chips | `data-foco` pasa a `1`, **13 hijos de la escena a `opacity: .20`** y las piezas del tipo marcadas: fila «Isla» → 2 marcadas, «Punta de góndola» → 6, chip de la escalera → 1 |
| **Composición 01 · 02 · 03 · 04** con el conector, encabezados, tarjeta del contrato, tabla de tarifa con su pie, escalera A·4 con la lectura chica en mono a la derecha | Presente en claro y en oscuro a 1440×900 (capturas en el scratchpad: `port-claro.png`, `port-oscuro.png`) |
| **Conteos derivados del estado** | La clave del plano (`8 · 3 · 1 · En el contrato 0`), la columna «Libres · entran» y el pie (`12 espacios comercializables · 8 +3 · 11 al cerrar`) son la misma cuenta mirada tres veces |
| **Confidencialidad** | 0 en el texto renderizado, 0 pasando el mouse por los 12 muebles, 0 con el contrato armado. Ni «POSTOBON» ni «ALQUERIA» ni ranking / canon / «bajo tarifa» / vencimiento |
| **Contraste** | Todos los pares texto/fondo pasan 4,5 : 1 (3 : 1 para texto grande) **en claro y en oscuro**, salvo el control inactivo de §2.7 |
| **Un amarillo** | 1 `.btn-principal` visible en el DOM; 0 referencias a `--signal*` fuera de esa clase en toda la superficie de Vender |
| **Sin errores** | 0 errores de consola y 0 `pageerror` en la sesión de Vender |

---

## 4 · Estado del test al cerrar

```
21 pruebas ok · 2 FALLA
```

Las dos que fallan son **§2.4** (la escala tipográfica: 19 cuerpos dentro de
Vender). Todo lo demás pasa. El test está escrito para quedar en verde en
cuanto esos 19 se conviertan en `var(--t-*)`, y para volverse rojo el día que
alguien devuelva a Vender un dato que el proveedor no puede ver.

**Verificación corrida (sólo lo mío, como pide la regla):**
`cd frontend && npx tsc --noEmit` → **0 errores**; `npm run probar:vender`.
No se corrió la suite del backend ni `npm run build`.

---

## 5 · Cómo reproducir la parte con navegador

Backend con SQLite propio, sede sembrada con **dos** proveedores ajenos, y
servidor de dev en un puerto propio (>5200). El sembrado está en
`/tmp/claude-0/…/scratchpad/aud-vender/seed.py`: 12 muebles en `NAVE`
—6 libres, uno tomado **todo el periodo** (el caso que dispara «tomado ·
PROVEEDOR»), uno vencido, uno que se libera adentro, una góndola de dos caras
con la A tomada y la B libre, y una caja no comercializable—.

```bash
# 1 · base + token de admin
cd backend && python3 …/aud-vender/seed.py

# 2 · backend
DATABASE_URL="sqlite:///…/aud.db" JWT_SECRET=dev uvicorn app.main:app --port 8311

# 3 · frontend, puerto propio
cd frontend && VITE_API_TARGET=http://localhost:8311 npx vite --port 5211 --strictPort

# 4 · el test
PROBAR_VENDER_URL=http://localhost:5211 PROBAR_VENDER_SEDE=NAVE \
PROBAR_VENDER_TOKEN="$(cat …/token.txt)" PROBAR_VENDER_AJENOS="POSTOBON,ALQUERIA" \
PROBAR_VENDER_PLAYWRIGHT=…/playwright-core/index.mjs node scripts/probar-vender.mjs
```

La sesión se pone en `localStorage` bajo `retail-auth-v1` con
`plataforma: false` y el `cliente` real: con `plataforma: true` la app manda a
`/plataforma` y Vender no se monta nunca. Y `waitUntil: "networkidle"` no llega
jamás —la app sincroniza sola—: se espera a que la pantalla exista.

**Dos avisos para quien mida:**

1. **El cuerpo del rótulo hay que multiplicarlo por `getScreenCTM().a`.** Es el
   error que hace parecer que el rótulo cambia de tamaño con el zoom cuando no
   lo hace.
2. **Después de tocar `+`, `−` o la rueda, esperá un cuadro** (dos
   `requestAnimationFrame`) antes de leer rects: no porque la página necesite
   ese cuadro para acomodar, sino porque el navegador lo necesita para dibujar
   lo que ya está decidido. Es la misma advertencia de D §10.

**Elegir la sede.** La app abre en la primera sede de la lista, que puede ser
una de ejemplo y sin muebles: sin `PROBAR_VENDER_SEDE` el test mide la pantalla
de «todavía no hay muebles» y —correctamente— se niega a opinar.

---

## 6 · Falsos positivos que se probaron y se sacaron

Quedan escritos para que nadie los reintroduzca al «endurecer» el test:

- **`supplierName` a secas** → 30 hits, todos legítimos (`facesOf`, `EMPTY_FACE`,
  `kpis`, y el `Contrato` que escribe el proveedor **propio**). Se busca cómo se
  pinta, no cómo se llama.
- **`phase === "vencido"`** y **`| "vencido"`** → comparar contra un valor del
  dominio, o declararlo en una unión de tipos, no es pintarlo.
- **`Partial<FaceData>`** contado como componente JSX → la detección de etiquetas
  exige que delante del `<` no haya un carácter de identificador.
- **Todo `<rect>` del plano** → D usa uno transparente como caja de impacto del
  rótulo (README §3). Sólo molesta el que pinta o el que trae ancho literal.
- **El botón principal deshabilitado** en el contraste → WCAG 1.4.3 exime los
  controles inactivos; se mide igual, pero como aviso.
- **Sembrar «NUTRESA»** como proveedor ajeno → choca con el `placeholder`
  «Alpina, Nutresa…» del campo Proveedor. Si se cambia el placeholder, hay que
  cambiar los nombres sembrados: son datos del arnés, no del producto.
