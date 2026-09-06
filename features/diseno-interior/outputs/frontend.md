# Fase 10 · PR 1 — Frontend: la piel de la landing adentro

Implementación del contrato de `outputs/tema.md`. **Este PR es piel**: no se
movió ningún layout, ningún flujo, ningún texto y ninguna forma de presentar
datos. Todo lo que pidió forma está en §5, para el PR 2.

Verificación corrida acá: `npx tsc --noEmit` limpio · `npm run probar:tema`
24/24 · `probar:landing`, `probar:planta`, `probar:propuesta`,
`probar:nomenclatura`, `probar:pasillos`, `probar:revision`, `probar:acomodar`
en verde. `npm run build` y la suite del backend **no** se corrieron acá: son
del Verificador, en serie.

**Lo que NO pude hacer y hay que hacer:** este entorno no tiene navegador
(Playwright no baja Chromium: `Download failure`), así que **no miré ni una
pantalla renderizada**. Verifiqué que cada módulo transforma y se sirve (200 en
`/src/pages/*` con el dev server en 5273), los tokens con el suite del auditor y
los contrastes con la cuenta WCAG, pero las capturas claro/oscuro de Login,
Vender, Montaje, Plataforma, reporte y detalle **las tiene que sacar el
Verificador**, y hay tres cosas concretas que sólo se ven mirando: §6.1 (los
rótulos del plano con la mono), §6.2 (el salto de `--r-md` de 2 a 10 px) y §6.3
(el editor 3D).

---

## 1. Qué se tocó

### Los tres archivos del sistema

| Archivo | Qué |
|---|---|
| `frontend/src/tema.css` | **nuevo**, ~660 líneas. Capa 1 (primitivos `--n-*`, `--p-*`, `--y-*`, `--st-*`, tipografía, `--t-*`, `--s*`, `--r-*`, duraciones) y capa 2 (semánticos claro en `:root`, oscuro en `html[data-tema="oscuro"]`). Publica los dos juegos de nombres —los viejos (`--bg`, `--surface*`, `--line*`, `--ink-*`, `--accent*`, `--libre/--entra/--ocupado` + `-suave`/`-borde`, `--font-sans`, `--font-mono`) y los nuevos (`--signal`, `--on-signal`, `--panel`, `--brd*`, `--fg*`, `--t-*`, `--s*`, `--r-*`, `--sh-*`)— apuntando al mismo valor. Incluye el bloque `[data-cajon-oscuro]` (§3.3). |
| `frontend/src/index.css` | Arranca con `@import "./tema.css"` y queda sólo con la capa 3: `body` con la tipografía nueva, `.rotulo`, `.fig`, `.codigo`/`.codigo-col`, `.btn-principal`, `.foco-tema`, la regla `[data-modal-abierto]`, y los `--con-*` de la consola (cuyo bloque oscuro pasó a colgar de `html[data-tema="oscuro"]`). |
| `frontend/tailwind.config.js` | `darkMode: ["selector", '[data-tema="oscuro"]']`; las tres pilas de sistema (+ `fontFamily.display`); los colores ahora entran por `rgb(var(--x-rgb) / <alpha-value>)`; radios 4/6/10/16 + `pill`; sombras desde `--sh-*`; `indigo-*`/`teal-*`/`coral-*` eliminados. |
| `frontend/index.html` | Se fueron los dos `preconnect` y la hoja `css2` de Google Fonts. Cero orígenes externos nuevos; la CSP de Fase 3 no se toca. |

### El interruptor

| Archivo | Qué |
|---|---|
| `frontend/src/tema.tsx` | **nuevo**. `LLAVE_TEMA = "recabra-tema"`, `temaInicial()` (claro por defecto, **sin** `prefers-color-scheme`), `temaActual()`, `aplicarTema()`, `iniciarTema()`, `useTema()` (un `useSyncExternalStore` sobre `document.documentElement.dataset.tema`), `<TemaToggle>` (sol/luna, `aria-label` con la acción, `aria-pressed`, foco visible con `--ring`), y `useModalAbierto()` / `useModalAbiertoSi()` con contador para modales apilados. |
| `frontend/src/main.tsx` | `iniciarTema()` antes del primer render, para que no haya un parpadeo de claro al cargar en oscuro. |
| `frontend/src/pages/Dashboard.tsx` | `<TemaToggle />` en la barra, entre `SyncStatus` y los íconos. `SettingsModal` marca `data-capa-modal` y llama `useModalAbierto()`. |
| `frontend/src/pages/Montaje.tsx` | `<TemaToggle />` en el encabezado. Es la pantalla del celular en el pasillo, que es donde más falta hace. |
| `frontend/src/components/plataforma/consola.tsx` | La consola **dejó de tener interruptor propio**: `temaInicial`/`guardarTema` son alias del módulo compartido y `guardarTema` además pinta la raíz. Se fue `recabra-consola-tema` y se fue `prefers-color-scheme`. |
| `Plataforma.tsx`, `DetalleCliente.tsx`, `ReportePlataforma.tsx` | Se les quitó el atributo `data-consola-tema`, que quedó muerto cuando el bloque oscuro de la consola pasó a colgar de `html[data-tema="oscuro"]`. La impresión del reporte sigue siendo clara siempre (`IMPRESION_CLARA_VARS` en su `@media print`, que no depende del tema de pantalla). |

### El barrido de color (259 clases literales de Tailwind → 0)

| Archivo | Usos |
|---|---|
| `components/FloorMap/ZoneEditorPanel.tsx` | 92 |
| `components/SpacePanel/SpacePanel.tsx` | 74 |
| `components/FloorMap/FloorMap.tsx` | 39 |
| `components/StoreEditor3D/StoreEditor3D.tsx` | 27 + 9 del HUD |
| `components/StoreView/StoreView.tsx` | 19 |
| `components/Legend/Legend.tsx` | 7 |
| `components/FloorPlan2D/FloorPlan2D.tsx` | 1 |

El mapeo: `slate` → `ink-*`/`line*`/`surface*`; `bg-white` → `bg-surface`;
`text-white` sobre acento → `text-accent-ink`; `indigo` → `accent` (y las
selecciones a `--signal-ink`); `amber` → `entra`; `green`/`emerald` → `libre`;
`red` → `ocupado`; el azul suelto de «vigente» → tinta, porque *vigente no es un
estado de color*. En `StoreView.tsx` los `slate-*` fueron a `dark-*`: ese chrome
es oscuro siempre, a propósito.

### Los hex sueltos que también rompían el oscuro

Además de las clases, había **cuatro copias distintas de la terna de estado**
escritas a mano. Ahora salen todas del token:

- `pages/DashboardView.tsx` — el plano isométrico. Las ternas quedan en JS
  (`darken()` necesita un hex de verdad para las caras del prisma) pero en
  **dos versiones**, clara y oscura, elegidas al pintar con `temaActual()`;
  `DashboardView` llama `useTema()` para repintar cuando alguien toca el
  sol/luna. También: `#F6F8F8` → `--surface-2`, `stroke="#FFFFFF"` →
  `var(--surface)`, y la columna del código pasó de `width: 56` a
  `minWidth: "9ch"`.
- `components/FloorPlan2D/FloorPlan2D.tsx` — `STATUS_COLORS`, `STATUS_FILL`,
  `NON_RENTABLE_*` y `STATUS_BADGE_STYLE` (donde «ocupado» era **violeta**, una
  quinta versión del mismo estado).
- `components/FloorMap/zones.ts` + `FloorMap.tsx` — `STATUS_COLORS`,
  `STATUS_COLORS_SOLID`, y el indigo de selección → `--signal-ink`.
- `Libera.tsx`, `SyncStatus.tsx`, `ReferenceRateHint.tsx`, `MiniMapa.tsx`,
  `Contrato.tsx`, `SpacePanel.tsx`, `FileViewerModal.tsx`.

Y la regla de uso de `outputs/tema.md` §1.6 aplicada: 7 lugares que **escribían**
con el relleno (`color: var(--ocupado)`) pasaron a la variante `-txt`. El grep
`color: "var(--libre|--entra|--ocupado)"` fuera del plano da cero; el único que
queda es `FloorMap.tsx:115`, que es un **trazo de SVG**, no texto.

---

## 2. La lista de botones amarillos, con archivo:línea

Un solo lugar pinta amarillo: la clase `.btn-principal` (`src/index.css`). Eso
es la mitad del punto — contar los amarillos de una pantalla es un `grep`, no
una lectura de estilos en línea.

| # | Pantalla / ruta | Botón | Dónde quedó |
|---|---|---|---|
| 1a | **Login** · elegir cliente | Continuar | `src/pages/Login.tsx:602` |
| 1b | **Login** · crear cuenta | Crear y entrar | `src/pages/Login.tsx:563` |
| 1c | **Login** · entrar con clave | Ingresar | `src/pages/Login.tsx:812` |
| 1d | **Login** · entrar con correo | Ingresar / Crear cuenta | `src/pages/Login.tsx:691` |
| 1e | **Login** · aviso de política (modal) | Aceptar | `src/pages/Login.tsx:908` |
| 2 | **Vender** (`/`, modo Vender) | Guardar contrato y avisar | `src/components/Contrato/ModoVender.tsx:432` |
| 3 | **Supervisar** (`/`, modo Supervisar) | **ninguno** — pantalla de lectura | — |
| 4 | **Montaje** (`/montaje/:token`) | Confirmar | `src/components/Montaje/FormularioMontaje.tsx:494` |
| 5 | **Montajes** (lista en el tablero) | **ninguno propio** | — |
| 6 | **Plataforma** (`/plataforma`) | **ninguno** — consola de lectura | — |
| 7 | **Reporte de plataforma** | Descargar JSON | `src/pages/ReportePlataforma.tsx:430` |
| 8 | **Detalle de cliente** | Reporte de transparencia | `src/pages/DetalleCliente.tsx:728` |
| 9 | **Política de datos** | **ninguno** — texto legal | — |
| 10 | **Landing** | fuera de alcance, no se tocó | — |
| M1 | Modal Carga masiva | Guardar N y avisar | `src/components/CargaMasiva/CargaMasiva.tsx:391` |
| M2 | Modal Consentimiento (con sesión) | Aceptar | `src/components/ModalConsentimiento.tsx:105` |
| M3 | Modal Catálogo de artes (editor 3D) | Guardar | `src/components/StoreEditor3D/StoreEditor3D.tsx:2640` |
| M4 | Modal Tarifas de referencia | **ninguno** — ver abajo | — |
| M5 | Modal Configuración | **ninguno** — interruptores que guardan solos | — |

**Login tiene cinco y no es una violación de la regla**: son cinco pasos
excluyentes del mismo formulario; en pantalla nunca hay más de uno. El
`probar:tema` lo verifica con su propia cuenta y pasa.

**La regla de comportamiento nueva está implementada.** `useModalAbierto()`
(contador, para modales apilados) pone `data-modal-abierto` en el `<html>`; el
modal marca su raíz con `data-capa-modal`; el CSS apaga el amarillo de la
pantalla de atrás y lo deja sólo adentro del modal. Puesto en: `SettingsModal`
(`Dashboard.tsx:871/875`), `CargaMasiva:68/140`, `RatesModal:69/73`,
`ModalConsentimiento:43/47`, el catálogo de artes (`StoreEditor3D:2444/2449`) y
el aviso de política de Login (`Login.tsx:175/851`, con la variante
`useModalAbiertoSi` porque ese vive dentro del render de la pantalla).

### Tres correcciones a `outputs/tema.md` §2

1. **El modal de Tarifas de referencia NO tiene botón «Guardar».** `tema.md` le
   asigna uno; no existe. El encabezado de `RatesModal.tsx` lo explica: cada
   tecla va al store y empuja con el mismo *debounce* que las sedes y las
   etiquetas — *«there is no explicit save button»*. Su único botón es «Cerrar»,
   que es salida y no acción. Queda **sin amarillo**, y lo que sí hace es apagar
   el de atrás mientras está abierto.
2. **`StoreEditor3D.tsx:2633` es el modal del catálogo de artes, no el editor.**
   La línea que `tema.md` señala cae dentro del diálogo `fixed inset-0` de subir
   un arte, que efectivamente es un modal (por eso está bien listado en la tabla
   de modales). Ahí quedó el amarillo.
3. **Consecuencia de (2), y es una pregunta para el diseñador:** la pantalla
   «Editor 3D» —que es una pestaña de `/` y por lo tanto una pantalla— tiene su
   propio «Guardar» (el que guarda el plano, `StoreEditor3D.tsx` ≈ línea 5230) y
   quedó **en tinta**. O sea que en esa pestaña el amarillo aparece sólo al
   abrir un modal, y la acción que de verdad cierra el trabajo no lo lleva. No
   lo cambié por mi cuenta —la lista de botones la firma el diseñador—, pero
   creo que está al revés. **Decisión pendiente.**

---

## 3. Las tres decisiones que tomé y hay que aprobar o revertir

### 3.1 Tailwind consume los tokens por canales, no por hex literales

`tailwind.config.js` traía escrita esta regla: *«los mismos hex, literales y no
`var(--x)` a propósito, porque media docena de clases usa el modificador de
opacidad (`bg-accent/20`) y Tailwind sólo sabe separarle el alfa a un color que
puede leer. Si tocás uno, tocá los dos.»*

**La razón se respeta entera; la consecuencia se cae.** Desde que el interior
tiene modo oscuro, un hex congelado en el config es un color que no se entera
del tema: `bg-accent` seguiría siendo casi negro sobre una sala casi negra, y
son ~80 clases de token en `StoreEditor3D.tsx` y `FloorPlan2D.tsx` las que
quedarían muertas. La salida que conserva las dos cosas es la que Tailwind 3
documenta para exactamente esto: el token se publica en canales
(`--accent-rgb: 10 16 20`) y el config escribe
`rgb(var(--accent-rgb) / <alpha-value>)`. **`bg-accent/20` sigue funcionando
igual** —lo verifiqué en el CSS generado: `background-color: rgb(var(--accent-rgb) / 0.2)`—
y el color pasa a vivir en un solo lugar, que es estrictamente mejor que «tocá
los dos». El hex de cada uno va al lado del canal, en el comentario, para que
`tema.css` se siga leyendo como una paleta.

Los `dark-*` son la excepción y siguen siendo hex literales: son el cajón que se
pinta oscuro **siempre**, y un token que cambiara con el tema los rompería.

### 3.2 Dos hex de `outputs/tema.md` corregidos, con la medición

Los dos venían medidos contra la tarjeta y el papel, que es donde vive casi todo
— pero no contra las cuatro superficies:

| Token | En `tema.md` | Ahora | Por qué |
|---|---|---|---|
| `--ink-3` claro | `#5A6B74` | **`#54646E`** | `#5A6B74` da **4,44:1** sobre `--surface-3` (`#E4E7E1`), que también lleva texto (el hueco, lo deshabilitado, la pista de una barra). Reprueba por seis centésimas. El nuevo pasa en las cuatro: 4,91 · 5,39 · 5,75 · 6,13. |
| `--ink-3` oscuro | `#6C7E88` | **`#788A94`** | Peor: 4,50:1 sobre el panel (en el filo), pero **4,24:1** sobre `--surface-2` y **3,87:1** sobre `--surface-3`. El nuevo es `--n-400`, o sea que no estrena un tono: 5,64 · 5,30 · 4,99 · 4,56. |
| `--signal-borde` | `#B88800` | **`#A87C00`** | Medido sólo contra la tarjeta (3,20:1). Contra el papel `#EFF1ED` da **2,82:1**, bajo el piso de 3:1 — y ese borde **es** el contorno del botón (el relleno da 1,87:1 y nunca va a dibujarlo), así que el botón principal de la barra de Vender y la del reporte quedaba sin forma. El nuevo: 3,33 sobre el papel, 3,79 sobre la tarjeta, 3,55 sobre la fila alterna. |

### 3.3 El editor 3D: `[data-cajon-oscuro]`

El editor es oscuro en los dos temas, a propósito (una cinta clara alrededor de
una sala oscura pelea con lo que se está mirando). El problema que eso dejaba es
que `--accent` es la tinta, y en claro la tinta es casi negra: una pestaña activa
`bg-accent` sobre un panel `#0B1116` es invisible. **Ya lo era antes** (la tinta
vieja era `#14181C` sobre `#1E2429`), así que no es un bug que este PR introduce.

En vez de tocar los ~35 lugares que escriben `bg-accent` / `text-accent-200`, la
marca `data-cajon-oscuro` invierte los tokens **una vez** adentro del cajón, en
los dos temas: la tinta es clara y el papel es la sala. Es lo que «cajón oscuro»
ya significaba. `outputs/tema.md` §1.6 autoriza explícitamente rehacer el editor
**en color**.

---

## 4. Riesgos

1. **Los rótulos del plano isométrico con una mono.** Es el riesgo número uno y
   el que sólo se ve mirando. La etiqueta flotante sobre el mueble
   (`DashboardView.tsx` ≈ 1018) ya iba a 8,5 px de unidad SVG y ahora la familia
   es monoespaciada, ~15-20 % más ancha que la condensada que se fue. **No la
   achiqué**: la regla del dueño es «se ajusta la columna, no la tipografía», y
   sobre el mueble no hay columna que ajustar. Si el Verificador mide recorte en
   alguna de las 23 caras, la respuesta es de forma (código corto sobre el
   mueble, completo en la ficha) y va al PR 2. **Lo que sí se ajustó** es la
   columna de código de la tabla: de `width: 56` a `minWidth: "9ch"`, que con
   `--f-mono` puesto es el ancho de `GON-60·A` por construcción, resuelva el
   sistema SF Mono, Cascadia o Liberation Mono.
2. **`--r-md` salta de 2 px a 10 px, y tiene ~80 usos.** Es el cambio visual más
   extendido del PR y donde más hay que mirar las capturas: botones, campos y
   chips de todo el interior.
3. **Las siete clases de `DISPLAY_TOP` se apoyan ahora en cuatro colores.** Es
   el cambio más discutible que hice. `DISPLAY_TOP` tenía siete matices elegidos
   uno por uno (`#17A18C`, `#B7364A`, `#F79E45`…), y tener una versión oscura
   pedía elegir siete colores nuevos a ojo — que es exactamente lo que este
   proyecto tiene prohibido. Los mapeé a los tres estados validados + el resto,
   más dos tintes al 60 % (que no son un color nuevo: son el mismo estado ya
   validado mezclado con su superficie, la misma construcción que los `-suave`).
   **Costo:** `active`, `expired` y `no_contract` quedan del mismo rojo, y
   `free` / `committed` se separan por claridad y no por matiz. Los tres van
   siempre con su palabra al lado. El propio comentario del archivo ya decía que
   «siete clases es más de lo que el color solo puede sostener» — pero recuperar
   una lectura de siete, o borrar el respaldo, es decisión de diseño (§5.1).
4. **La desviación de la banda de claridad sigue en pie y hay que escribirla en
   `docs/ESTADO.md`.** La terna oscura reprueba `--mode dark` del validador
   (`exit=1`), la razón está medida en `tema.md` §4, y quedó copiada entera en
   el encabezado de `tema.css` — pero **ESTADO.md todavía no la tiene**, y la
   spec la pide junto con la revocación de la regla 4 y el gotcha de la
   condensada. **No lo escribí: no es mi archivo en este PR.**
5. **El toggle de la consola cambió de llave.** Quien tenga
   `recabra-consola-tema` guardado lo pierde: la consola abre en claro la
   primera vez. Es una preferencia de UI, no un dato; no hay migración y creo
   que no la merece, pero es un cambio observable.
6. **El `body` no fija `font-size`.** Lo dejé así a propósito: bajarlo a 13 px
   movería todo lo que ninguna pieza declara, y eso es forma. Efecto: cualquier
   texto que hoy herede los 16 px del navegador los sigue heredando, con otra
   familia.
7. **`components/StoreView/StoreView.tsx` y `components/Legend/Legend.tsx` son
   código muerto** — no los importa nadie. Los barrí igual (26 clases) para no
   dejar una trampa, pero lo que corresponde es borrarlos (§5.6).

---

## 5. Pendientes de FORMA para el PR 2

1. **La lectura de siete clases del plano** (riesgo 3): o se recupera con una
   paleta de siete validada, o se borra el respaldo. Hoy el mapa siempre tiene
   un periodo puesto y el respaldo casi no se alcanza; la leyenda sin periodo
   mostraría swatches repetidos.
2. **El «Guardar» del editor 3D** (§2, corrección 3): decidir si el amarillo de
   esa pantalla es el que guarda el plano.
3. **Las paletas categóricas por TIPO de mueble** —
   `FloorPlan2D.tsx:COLOR_DEFAULTS` (20 entradas),
   `fixtureStore.ts:COLOR_DEFAULTS` (8) y
   `FloorMap/zones.ts:INFRASTRUCTURE_COLORS` (10). No son la terna de estado:
   son un color por tipo, elegidos a ojo, sin validar contra daltonismo ni
   contra ninguna superficie, y en oscuro varias son igual de brillantes.
   Cambiarlas es reelegir una paleta con el validador en la mano. Ojo: el color
   de cada mueble queda **guardado** (`f.color`), así que moverlo toca datos.
   Están anotadas en el código, en los tres lugares.
4. **El desfase de espacios:** `tailwind.config.js` define `5: 20px` / `6: 24px`
   y `tema.css` define `--s5: 24px` / `--s6: 32px`. Conviven a propósito: mover
   `p-6` de 24 a 32 px relayoutea, y eso es forma.
5. **La escala tipográfica de la landing no bajó al interior** (refutación de
   `tema.md` §3.4, que hice mía): los ocho pasos son fijos, sin `clamp`, con los
   tamaños que la app ya usaba. Subir el cuerpo de 13 a 14,5 px es el PR 2.
6. **Borrar `StoreView.tsx` y `Legend.tsx`** (código muerto).
7. **Los materiales 3D de `StoreEditor3D.tsx`** (~170 hex: acero, cartón,
   vidrio, ruedas) **no son tokens y no deberían serlo**: son colores de objetos
   físicos en una escena renderizada, y la escena vive adentro del cajón oscuro.
   Lo mismo el HUD sobre el visor (blanco al 60-90 % sobre un render). Lo dejo
   escrito para que la próxima sesión no los «arregle».
8. **`utils/propuesta.ts`** dibuja la lámina que se le manda al proveedor en un
   `<canvas>`: es **papel**, y el papel es blanco siempre. Si siguiera al tema,
   el proveedor recibiría una lámina negra porque el vendedor tenía el modo
   oscuro puesto. Sólo se le alineó la pila tipográfica. Anotado en el archivo.
9. **Texto escrito en `--ink-4`,** si lo hay: `--ink-4` no es color de texto
   (3,62:1 claro / 3,23:1 oscuro, que es piso de elemento no textual). Es un bug
   de contraste **preexistente** que este PR hereda; el auditor lo tiene que
   listar.

---

## 6. Qué mirar en las capturas, en orden

1. **Los 23 códigos del FloorMap**, claro y oscuro, con la mono puesta (riesgo 1).
   Medido con rects, no con `scrollWidth`.
2. **`--r-md` en botones, campos y chips** de Vender y del panel de un espacio
   (riesgo 2).
3. **El editor 3D en tema CLARO**: es donde el cajón oscuro y la tinta invertida
   se tocan (§3.3). Pestañas activas, el botón de guardar, el catálogo de artes.
4. **El botón amarillo sobre las dos superficies**: la barra de Vender (papel) y
   la barra del reporte (tarjeta). Es lo que motivó `--signal-borde #A87C00`.
5. **Un modal abierto sobre Vender** (Carga masiva): el amarillo tiene que estar
   sólo adentro del modal.
6. **El tablero y `/plataforma` seguidos**, con un solo clic en el sol/luna: los
   dos sistemas de color tienen que cambiar juntos.
7. **La landing a 360 y 1440, claro y oscuro, antes y después**: `pages/Landing/`
   no tiene ni un byte de diferencia (`git diff --quiet` da limpio) y
   `probar:landing` pasa, pero el guardrail pide las capturas.
