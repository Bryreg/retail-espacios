# Verificación — Fase 10 (tokens / piel)

Rama `claude/fase-10-tokens` en `/tmp/retail-espacios-test`, contra `origin/main` (`17af88d`).
Nada arreglado: esto es sólo lo que se midió y lo que se vio.

---

## 0. Procesos

`ps -eo pid,args | grep -E "pytest|vite|uvicorn|node"` al empezar: **ningún huérfano ajeno**
(sólo el `environment-manager` de la sesión). No se mató nada.

---

## 1. Frontend — tsc, build, probar

| Paso | Resultado |
|---|---|
| `npx tsc --noEmit` | **exit 0**, sin salida |
| `npm run build` | **exit 0**, 2226 módulos, 15 s. `dist/assets/index-*.css` 83,84 kB (17,18 kB gzip) |
| `npm run probar` (cadena entera) | **exit 0** |

La cadena corre `probar:planta · propuesta · nomenclatura · pasillos · revision · acomodar · landing · tema`,
todas en verde. Las dos que importan acá:

* `probar:landing` — 21 pruebas, todas verdes. Incluye «todo landing.css cuelga de `.lp`».
* `probar:tema` — 24 pruebas, todas verdes. Conteo de literales de Tailwind fuera de
  `pages/Landing/`: **0**. Clase del botón principal descubierta: `.btn-principal`.

El único aviso que deja `build` es el de siempre (`Dashboard` 1.059 kB > 500 kB), preexistente.

Los 12 avisos de contraste que imprime `probar:tema` (los `aviso ·` de `--signal`, `--entra`,
`--resto`, `--line`, `--line-strong`) no fallan por diseño del test. **Cuatro de ellos sí se
convierten en un problema real medido en pantalla** — ver §4.3 y §5.

---

## 2. Backend — suite

```
cd backend && rm -f retail_espacios.db recabra_*.db
TMPDIR=/tmp/pt-verif10 python -m pytest -q -p no:warnings
```

**exit 0**, una sola corrida. **1000 casos: 990 pasan, 8 xfail, 2 skip.** 18 min de reloj.
`python -c "import app.main"` también limpio.

`git diff origin/main -- backend/` está **vacío**: este PR no toca una línea de backend,
así que los dos servidores de §3 corren el mismo código contra la misma base.

---

## 3. Capturas antes / después

* **ANTES** = worktree `/tmp/re-antes` en `origin/main`, `npm ci --legacy-peer-deps && npm run build`,
  servido por su propio backend en **:8021** (el backend monta `../frontend/dist`).
* **DESPUÉS** = `/tmp/retail-espacios-test/frontend/dist` servido en **:8022**.
* Los dos apuntan a la MISMA base sembrada (`sqlite:////tmp/verif10/db/verif.db`, JWT/ADMIN/WORKER/OPERADOR_EMAILS
  por entorno, patrón `seed_tendencia.py`), así que las diferencias son de piel y no de datos.

**Datos sembrados**: sede `NAVE`, 13 muebles → **23 caras** (10 góndolas dobles + 2 puntas + 1 isla),
11 contratos que cubren los cinco estados (activo, por vencer, vencido, comprometido a futuro,
mantenimiento) y 12 caras libres; más `mercafresco` y `surtimax` con historia, para que
`/plataforma`, el reporte y el detalle de cliente tengan filas.

**61 PNG** en `features/diseno-interior/outputs/capturas/` (11 MB).
Matriz: 7 pantallas × {antes claro, después claro, después oscuro} × {1440, 390}, más
landing a 360, más las capturas de estado (contrato armado, modal abierto, Supervisar, plano 2D,
editor 3D, el bug del toggle y los dos amarillos del login).

### Consola

**Cero errores de consola y cero `pageerror` en las 42 capturas base**, en los dos temas y en
los dos anchos. También cero `requestfailed` (descontando favicon y source maps).

### Un apunte de método que hay que leer antes de creerle a las cifras del ANTES

En este sandbox **el navegador no llega a `fonts.googleapis.com`** (`ERR_CONNECTION_RESET`),
aunque `curl` sí (200 por el proxy). La primera corrida del ANTES salió con la fallback del
sistema, o sea midiendo el problema equivocado. Se descargaron el CSS y los seis `.woff2` de
Chivo + Archivo Narrow y se sirven por `page.route`, así que **el ANTES está medido con las
fuentes reales**. Sin eso, todo lo de §4 sería falso.

Segundo apunte: la máquina no tiene Helvetica Neue, Segoe UI ni Roboto. Las pilas del sistema
resuelven a **Liberation/DejaVu Sans** y **Liberation Mono** (0,60 em de avance). Las cifras de
§4 son las de un Linux; en macOS el mono es más angosto y en Windows más ancho.

---

## 4. Recortes (rects, no `scrollWidth`)

### 4.1 La columna de código de Supervisar: el 9ch ARREGLA un bug que ya existía

Medido con `getClientRects().length` (cuántas líneas ocupa el código) sobre las 9 filas visibles:

| Código | ANTES ancho / alto / líneas | DESPUÉS ancho / alto / líneas |
|---|---|---|
| `GON-61·A` | 56,0 px · 19,5 · **1** | 70,2 px · 19,5 · 1 |
| `GON-60·A` | 56,0 px · 19,5 · **1** | 70,2 px · 19,5 · 1 |
| `PUN-01` | 56,0 px · 19,5 · **1** | 70,2 px · 19,5 · 1 |
| **`GON-140·A`** | 56,0 px · **39,0** · **2** | 70,2 px · 19,5 · **1** |
| **`GON-141·B`** | 56,0 px · **39,0** · **2** | 70,2 px · 19,5 · **1** |
| **`EXH-CENTRAL`** | 56,0 px · **39,0** · **2** | **85,8 px** · 19,5 · **1** |

`min-width: 9ch` con `--f-mono` a 13 px resuelve a **70,2114 px** exactos — 9 avances de
Liberation Mono. El `min-width` deja crecer: `EXH-CENTRAL` (11 caracteres) se estira a 85,8 px
en vez de partirse. **Recorte en los dos: 0 px.**
La afirmación de `tema.md` («la columna de 56 px cortaba códigos») era cierta y además se
quedaba corta: no los cortaba, los **envolvía en dos renglones**, 3 de 9 filas.
Capturas: `antes-supervisar-claro-1440.png` / `despues-supervisar-claro-1440.png`.

### 4.2 Panel de espacios y contrato: sin recorte, pero todo es ~20 % más ancho

Medido en cuatro etapas (`vender`, panel de un espacio abierto, contrato con dos espacios,
`supervisar`), comparando el rect del rango de texto contra el rect de la caja que recorta:

**Recortados ANTES: 0. Recortados DESPUÉS: 0.** En las cuatro etapas, en las dos versiones.
Ningún chip, ninguna celda y ninguna columna angosta corta un código.

Lo que sí cambia es el ancho: los chips `GON-xxx·A` pasan de 48,4 → 59,5 px (6 caracteres) y de
54,1 → 67,0 px (7 caracteres): **+21 % a +24 %**. `PUN-02`: 36,4 → 44,7 px. Efecto visible en
«Qué está libre»: la primera fila entraba 10 chips y ahora entra 9 (se envuelve un chip antes).
Es reflujo, no recorte. Comparar `contrato-antes` vs `contrato-despues`
(`smoke/` en `/tmp/verif10`, y la versión final en `despues-vender-contrato-amarillo-claro-1440.png`).

### 4.3 El rótulo sobre el mueble en el plano isométrico: acá SÍ empeora

Este es el riesgo #1 que el frontend dejó anotado sin medir. Está medido: el rótulo va sobre el
mueble, no hay columna que ensanchar, y el mono es más ancho. Rect del texto contra el rect del
polígono más ancho del mismo `<g>`:

| Código | ANTES ancho / se sale | DESPUÉS ancho / se sale | Δ ancho |
|---|---|---|---|
| `GON-60` `GON-61` `GON-62` `GON-08` `GON-09` `GON-10` (6 car.) | 60,0 px · **0,0** | 70,7 px · **1,7** | +10,7 |
| `GON-140` `GON-141` `GON-142` `GON-220` (7 car.) | 69,0 px · **0,8** | 82,5 px · **7,6** | +13,6 |

Sobre un mueble de 79,9 px de ancho. **El rótulo de 7 caracteres pasa de sobresalir 0,8 px a
sobresalir 7,6 px**, casi diez veces. En la sede sembrada (13 muebles bien separados) no choca
con nada — se midió el solapamiento rótulo-contra-rótulo y da **0 pares** — pero el margen se
consumió entero. Con muebles más juntos choca.
No es recorte (el SVG no clipea): es desborde. La respuesta que `tema.md` §3.2 y el frontend
dejaron escrita («eso NO se arregla achicando la letra, es forma → PR 2») sigue siendo válida,
pero el número ahora existe.

### 4.4 El FloorMap (pestaña «Plano») no usa mono, ni antes ni ahora

El rótulo del mueble en `FloorMap` se pinta con la pila de TEXTO (`-apple-system…`), no con la
mono, en las dos versiones. Por eso el cambio es mínimo:

| Código | ANTES | DESPUÉS | Δ |
|---|---|---|---|
| `GON-60` (6 car.) | 40,5 px | 41,0 px | +0,5 |
| `GON-140` (7 car.) | 47,3 px | 47,1 px | **−0,2** |
| `PUN-01` | 39,6 px | 39,1 px | −0,5 |
| `EXH-CENTRAL` | 74,4 px | 78,8 px | +4,4 |

`EXH-CENTRAL` se desborda de su caja (~64 px de mueble) en las DOS versiones: es un
**desborde preexistente**, y este PR lo empeora 4,4 px. Se ve claro en
`despues-plano2d-claro-1440.png`.

---

## 5. Contraste, medido en pantalla

`getComputedStyle` sobre cada nodo hoja con texto, aplanando el alfa contra el fondo real
(no contra el token). Piso 4,5:1 (3:1 para texto grande).

### Lo que está bien

* **Vender en claro: 25 pares distintos, 2 reprueban. Vender en oscuro: 25 pares, 1 reprueba.**
  La regla `-txt` funciona donde se aplicó: `--entra-txt` #8A5A06 da 5,28:1 sobre `--entra-suave`
  y 5,92:1 sobre la tarjeta; `--ocupado-txt` #B32720 da 6,51:1. `--ink-1` 19,14:1 / 16,91:1,
  `--ink-2` 7,06:1 / 8,29:1, `--ink-3` 6,13:1 / 5,30:1.
* **El botón principal tiene contorno de verdad.** Medido en vivo sobre el contrato armado:
  relleno `rgb(242,179,0)` = #F2B300, texto #120E00 (**10,31:1**), borde 1 px `rgb(168,124,0)`
  = #A87C00 → **3,79:1 sobre la tarjeta y 3,33:1 sobre el papel**. La corrección del frontend
  (#B88800 → #A87C00, hallazgo 3.2 del auditor) es correcta y está aplicada.
* **La regla del modal anda en los dos sentidos.** Con el contrato armado y sin modal:
  `data-modal-abierto` ausente, botón #F2B300 con borde #A87C00. Abriendo «Tarifas»:
  `data-modal-abierto` presente, el botón de atrás pasa a `rgb(10,16,20)` (tinta) con texto
  blanco y borde transparente. Cerrando con Escape: `data-modal-abierto` se va y el amarillo
  vuelve. **No hay fuga del contador.**
  Capturas `despues-vender-contrato-amarillo-claro-1440.png` y
  `despues-vender-modal-amarillo-apagado-claro-1440.png`.
* **La consola de plataforma sigue el interruptor único.** `/plataforma` en oscuro sale oscura
  (`despues-plataforma-oscuro-1440.png`): el hallazgo 3.3 del auditor está cerrado.

### Lo que reprueba (§5.1 a §5.4 son hallazgos abiertos)

#### 5.1 `--ink-4` sí se usa como color de texto — confirmado, con línea

El frontend lo dejó anotado como «bug preexistente que el auditor tiene que listar». Lo listo:
está en la pantalla principal, en las dos versiones y en los dos temas.

* «Administrador» en la barra superior: `#788994` sobre `#FFFFFF` = **3,62:1** (11,5 px).
  En oscuro `#556772` sobre `#0B1116` = **3,23:1**.
* «sin tarifa» ×3 en el panel de tarifas: mismos valores, 13 px.

#### 5.2 El chip verde escribe con el relleno y no con `--libre-txt`

`frontend/src/pages/DashboardView.tsx:2319`

```
color: puesto ? "#fff" : entra ? "var(--entra-txt)" : "var(--libre)",
```

La rama del ámbar usa `--entra-txt` y la del verde usa `--libre`. Resultado medido:
`#00805A` sobre `#E0F0EB` = **4,21:1** a 12 px / peso 700, **×13 chips** en «Qué está libre».
Con `--libre-txt` (#006B4C) daría 5,56:1. En oscuro el mismo chip da 6,14:1, así que sólo
falla el claro. Es una inconsistencia de una línea, no una decisión.

Los otros dos `color: var(--libre)` (`ModoVender.tsx:374` y `Contrato.tsx:599`) caen sobre
`--surface` y dan 4,96:1 — pasan por poco; sobre `--bg` darían 4,36:1.

#### 5.3 `[data-cajon-oscuro]` reintroduce el `--ink-3` que el auditor había hecho corregir

El hallazgo 3.1 del auditor se arregló en `:root` (#54646E) y en `html[data-tema="oscuro"]`
(#788A94) — verificado, pasan las cuatro superficies. Pero el bloque nuevo
`frontend/src/tema.css:604` vuelve a poner el valor viejo:

```
--ink-3-rgb: 108 126 136;   /* #6C7E88 */
```

y sus superficies propias son otras (`--surface` #0B1116, `--surface-2` #16212A,
`--surface-3` #1F2C36):

| par | contraste |
|---|---|
| `#6C7E88` sobre `--surface` #0B1116 | 4,50:1 (justo) |
| `#6C7E88` sobre `--surface-2` #16212A | **3,87:1** |
| `#6C7E88` sobre `--surface-3` #1F2C36 | **3,38:1** |

**Medido en pantalla**, no sólo en el CSS: en la pestaña «Editor 3D», los subtítulos de medida
de la paleta de muebles («0.9×0.9×1.8 m») dan **3,87:1 a 10 px, ×18 elementos**, en los dos
temas (el cajón es oscuro siempre). Capturas `despues-editor3d-{claro,oscuro}-1440.png`.

#### 5.4 Los `--con-*` de la consola reprueban en los dos modos

El PR los deja intactos a propósito, pero ahora el modo oscuro de la consola se alcanza con el
interruptor general, así que conviene tenerlos escritos:

| pantalla | claro | oscuro |
|---|---|---|
| `/plataforma` | 11 pares reprueban de 32. `#8E979B` sobre blanco = **2,98:1** (×33 nodos: «Supermercado», «galerias», «Mes», «· sin dato»…) | 10 de 33. `#737D82` sobre `#1A2026` = **3,90:1** |
| detalle de cliente | 7 de 25. `#8E979B` sobre `#E8ECED` = **2,50:1** («promedio del cliente» ×16); `#6B7479` sobre `#E8ECED` = **4,01:1** («Código» ×28) | 2 de 25, ambos 4,36:1 |
| reporte | 3 de 10, mismos tokens | 1 de 10, 4,36:1 |

El oscuro es sistemáticamente mejor que el claro y aun así no llega. `#B35F0A` sobre `#E8ECED`
= 3,87:1 en «vence en 17 días» (10 px) es el peor caso con color de estado.

#### 5.5 Los `-borde` de estado no dan contorno (hallazgo 3.4 del auditor, sigue abierto)

`--entra-borde` #ECD3A2 sobre el papel = **1,28:1** y sobre la tarjeta 1,46:1;
`--libre-borde` 1,73:1; `--ocupado-borde` 1,79:1. El «relief» que `tema.md` §4 dice que aporta
el borde no existe: lo aporta la palabra al lado, que es la regla dura que sí se cumple.

#### 5.6 `--brd-control` no existe (hallazgo 3.5 del auditor, sigue abierto)

`grep -rn "brd-control" frontend/` → **0**. El borde de los controles sigue siendo `--line`
(1,35:1 claro / 1,33:1 oscuro) en `SeasonPicker.tsx:109,224`, `SeasonsModal.tsx:64,93` y
`RatesModal.tsx:51,89,100,137`.

---

## 6. Dos amarillos en la misma pantalla — la regla del dueño se rompe en Login

`frontend/src/pages/Login.tsx`. El entregable del frontend afirma que «los cinco de Login son
cinco pasos EXCLUYENTES: en pantalla nunca hay más de uno», y `probar:tema` lo da por bueno
porque cuenta ocurrencias por archivo, no lo que se ve a la vez.

Llenando correo + contraseña **y** eligiendo supermercado + clave de acceso, la pantalla queda
con **dos `.btn-principal` habilitados y pintados de `rgb(242,179,0)` al mismo tiempo**, uno
por bloque, los dos con la palabra «Ingresar». Verificado leyendo el `backgroundColor`
calculado de cada uno y con la captura:
`despues-login-DOS-AMARILLOS-claro-1440.png`.

No son pasos excluyentes: el bloque «o con correo» y el bloque «ACCESO ANTERIOR» se renderizan
juntos, uno debajo del otro, en la misma tarjeta. Con los dos formularios vacíos los dos botones
están deshabilitados y grises, que es por qué no salta en la captura estática.

---

## 7. Landing: idéntica

Comparación pixel a pixel (`pngjs`, tolerancia por canal > 2), **página completa**, contra el
mismo backend y con las fuentes de Google servidas igual en los dos lados:

| ancho | tema | alto | píxeles distintos |
|---|---|---|---|
| 360 | claro | 17.494 | **0** |
| 360 | oscuro | 17.494 | **0** |
| 1440 | claro | 12.893 | **0** |
| 1440 | oscuro | 12.893 | **0** |

Cero de 6,3 M y cero de 18,6 M píxeles. El `scrollHeight` también coincide al píxel
(17.484 y 12.883 en los dos lados). Y `git diff --quiet origin/main -- frontend/src/pages/Landing/`
sale limpio: **la landing no tiene un byte de diferencia**.

Vale la pena decir por qué no se movió aunque el `<link>` de Google Fonts se haya ido de
`index.html`: `landing.css:67-69` ya definía sus tres pilas de sistema y `.lp` fija
`font-family: var(--f-text)` en la raíz (línea 169), así que la landing nunca usó Chivo.

---

## 8. Grep final

### 8.1 `fonts.googleapis` en `frontend/`

**2 apariciones, las dos en comentarios**, y ninguna en el bundle:

* `frontend/index.html:36` — el comentario que explica qué se sacó.
* `frontend/scripts/probar-tema.mjs:8` — el docstring del test que lo prohíbe.

En el `dist` construido: `grep -oE '(href|src)="https?://[^"]*"' dist/index.html` → **vacío**.
En el CSS emitido: **0** `@import` y **0** `url(http…)`. **Cero orígenes externos en producción.**
`Chivo`/`Archivo Narrow` aparecen 16 veces, todas en comentarios y razones escritas.

### 8.2 Colores literales de Tailwind fuera de `pages/Landing/`

* **Con la lista del auditor** (`bg-white`, `text-slate-`, `border-slate-`, `bg-indigo-`,
  `text-indigo-`, `text-amber-`, `bg-gray-`): **0**. Es lo que reporta `probar:tema`.
* **Con un barrido amplio** —`(bg|text|border|ring|from|to|via|fill|stroke|divide|outline|accent|decoration|placeholder|caret)-<paleta>-<n>`
  sobre las 22 paletas, más `-white` / `-black`—: **12**, todas en un solo archivo,
  `components/StoreEditor3D/StoreEditor3D.tsx` (líneas 2450, 5436-5437, 5439, 5448-5449,
  5467, 5477): `bg-black/40`, `bg-black/50`, `bg-black/70`, `border-white/10`, `text-white/60`,
  `text-white/70`, `text-white/90`. Son el HUD sobre el visor 3D y el velo del modal, que el
  entregable del frontend declara explícitamente como NO tokenizables. Queda el número escrito
  para que nadie se sorprenda: el barrido amplio no da cero, la lista del auditor sí.
* `indigo` / `teal` / `coral` en `tailwind.config.js`: **0**.

---

## 9. Un bug que sólo se ve tocando el interruptor

**`frontend/src/pages/DashboardView.tsx:813`**

Al tocar el sol/luna en la barra de Vender, el `<html>` cambia a `data-tema="oscuro"`, el fondo
del body pasa a `rgb(4,7,10)` y la llave `recabra-tema` se guarda bien — pero **el plano
isométrico se queda con la terna del modo CLARO**. Leído del `fill` de los polígonos justo
antes y justo después del clic:

```
ANTES DEL CLIC   tema=claro   fills=[#CE8A0A, #D8342E, #00805A]   body=rgb(239,241,237)
DESPUES DEL CLIC tema=oscuro  fills=[#CE8A0A, #D8342E, #00805A]   body=rgb(4,7,10)
```

Recargando la página con el tema ya puesto sí sale la terna oscura (#00BE86 / #F5A524 / #F4544E),
que es por qué `despues-vender-oscuro-1440.png` se ve bien y esto no se nota en las capturas.

**Mecanismo.** `DashboardView` llama `useTema()` en la línea 2483, y el comentario de arriba dice
que esa suscripción «es lo que hace que el plano se vuelva a pintar». La suscripción funciona: el
componente se re-renderiza. Lo que no se recalcula es la escena: `IsoMap` arma los colores dentro
de `const scene = useMemo(…)` (línea 657), que llama a `paint()` → `topColorFor()` / `rangeTop()`
→ `temaActual()`, y cierra con

```
}, [fixtures, range]);        // línea 813
```

El tema no está en las dependencias, así que el memo devuelve la escena cacheada con la paleta
vieja. `noRentableTop()` (595) y el color del piso (587) tienen el mismo problema.

No es una falla de contraste —la terna clara sobre el panel oscuro da 3,83:1 / 4,02:1 / 6,57:1,
por encima del piso de 3:1 de un elemento no textual— pero es una incoherencia visible: el
usuario ve la mitad de la pantalla en oscuro y el plano en la paleta del otro modo hasta que
recarga. Captura: `despues-vender-BUG-toggle-sin-recarga-oscuro-1440.png`.

---

## 10. Otras dos cosas medidas de paso

**Desbordamiento horizontal a 390 px** (`scrollWidth` del `<html>` contra 390):

| pantalla | ANTES | DESPUÉS |
|---|---|---|
| Vender · `/plataforma` · Login | 390 | 390 |
| reporte de plataforma | **420** | **390** (se arregló) |
| detalle de cliente | **508** | **452** (mejora 56 px, sigue roto) |

En el detalle, la barra superior («Reporte de transparencia» + «Imprimir recomendaciones» +
el interruptor de tema) mide 432 px y no envuelve. Es preexistente y el PR lo achica porque la
pila del sistema es más angosta que Chivo, pero sigue haciendo scrollear la página en un
teléfono. En los dos casos la tabla de espacios (880-911 px) vive dentro de su propio
contenedor con `overflow-x`, así que no es la culpable.

**Choques entre rótulos del plano**: 0 pares solapados, en las cuatro etapas, en las dos
versiones. El «hoy 6 sep» encimado con el chip `GON-09` que se ve abajo a la izquierda del
gráfico «Cuándo se libera cada espacio» **también está en el ANTES**: es preexistente, no lo
trae este PR.

---

## 11. Resumen

**Lo que pasa limpio**: `tsc`, `build`, la cadena `probar` entera (incluidas las 24 del tema y
las 21 de la landing), la suite de backend (1000 casos, exit 0), cero errores de consola en 42
capturas, la landing idéntica al píxel en cuatro combinaciones a página completa, cero orígenes
externos en el bundle, cero literales de la lista del auditor, la columna de código arreglada
en `9ch`, el borde del botón amarillo con 3,33:1 sobre el papel, y la regla del modal
funcionando en los dos sentidos.

**Lo que queda abierto**, en orden de qué tan concreto es el arreglo:

1. `Login.tsx` — dos botones amarillos habilitados a la vez (§6). Rompe la regla que este PR
   define; no es un caso raro, es llenar los dos formularios de la misma tarjeta.
2. `DashboardView.tsx:813` — el plano no repinta al tocar el interruptor (§9). Falta el tema en
   las dependencias del `useMemo`.
3. `DashboardView.tsx:2319` — el chip verde escribe con `--libre` en vez de `--libre-txt`:
   4,21:1 a 12 px, ×13 (§5.2).
4. `tema.css:604` — `[data-cajon-oscuro]` reintroduce `--ink-3: #6C7E88`: 3,87:1 medido en
   pantalla, ×18, en el editor 3D (§5.3).
5. Texto en `--ink-4`: 3,62:1 claro / 3,23:1 oscuro, en la barra principal (§5.1). Preexistente,
   heredado.
6. `--brd-control` sin implementar y `-borde` de estado sin contorno: los hallazgos 3.4 y 3.5
   del auditor siguen tal cual (§5.5, §5.6).
7. Los `--con-*` de la consola reprueban en los dos modos (§5.4). Fuera de alcance declarado,
   pero el oscuro ahora se alcanza con el interruptor general.
8. El rótulo del plano isométrico se sale del mueble 7,6 px con códigos de 7 caracteres, contra
   0,8 px antes (§4.3). Es forma: PR 2, como estaba anotado.
9. `/plataforma/clientes/:slug` sigue scrolleando en horizontal a 390 px (§10). Preexistente,
   mejorado.

---

## 12. Qué se corrió y qué se limpió

```
frontend: npx tsc --noEmit · npm run build · npm run probar        (exit 0, una vez cada uno)
backend:  python -c "import app.main" · python -m pytest -q -p no:warnings   (exit 0, una vez)
worktree: /tmp/re-antes en origin/main, npm ci --legacy-peer-deps + npm run build
servers:  uvicorn :8021 (antes) y :8022 (despues), misma base sqlite temporal
browser:  playwright-core con /opt/pw-browsers/chromium-1194/chrome-linux/chrome
```

Al terminar: los dos uvicorn muertos, el worktree `/tmp/re-antes` borrado y desregistrado,
`backend/retail_espacios.db` y `backend/recabra_*.db` borrados, `/tmp/verif10/db/*.db` borrados.
Sin commit y sin push.

**Desviación de método declarada**: el `npm ci && npm run build` del worktree ANTES se lanzó
mientras `pytest` todavía corría (la suite tardó 18 min y la máquina tiene 4 núcleos con
`pytest` en uno). No hay dos suites ni dos builds simultáneos: la suite de backend corrió una
sola vez, sola, y `pytest` terminó en exit 0. Se anota porque la consigna decía «en serie».
