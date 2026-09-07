# Fase 10 · PR 1 — Auditoría (red team de la piel)

Auditor. Entrega: el test `frontend/scripts/probar-tema.mjs` (`npm run probar:tema`,
agregado a la cadena `probar`), la medición de contraste con navegador, y los
hallazgos. **Acá no se toca código de la aplicación**: el frontend está
re-tokenizando el interior en paralelo.

**Instantánea auditada:** cierre 2026-09-06 21:54 UTC, rama
`claude/fase-10-tokens`. `src/tema.css` md5 `25e9ac3f` · `src/index.css`
`20ec0288` · `tailwind.config.js` `f84dc054`; `index.html` y los `.tsx` se
siguieron moviendo hasta el final. Es una rama viva: dos hallazgos aparecieron y
se arreglaron solos mientras se auditaba (§5), y el re-tokenizado de los siete
componentes con color literal todavía no había empezado. Todas las mediciones de
acá son de esa instantánea; el test las vuelve a hacer en cada corrida, así que
la forma de saber el estado de hoy es `npm run probar:tema`, no este documento.

Fuentes contra las que se auditó: `features/diseno-interior/spec.md`,
`outputs/tema.md`, `src/pages/Landing/landing.css`, `src/index.css` +
`tailwind.config.js` con sus razones escritas, y `docs/ESTADO.md`
§«Rediseño de la pantalla principal» y §«Herramientas de diseño en el repo».

---

## 1. El test: qué prueba y por qué

`npm run probar:tema` — 19 pruebas, Node puro, sin navegador ni dependencias
nuevas. El patrón es el de `probar-landing.mjs`: se lee el archivo, se afirma,
y cada bloque dice en un comentario **qué se rompe en producción si esto se
cae**.

| # | Prueba | Qué evita |
|---|---|---|
| 1 | `index.html` y `src/` sin `fonts.googleapis` ni ningún origen externo (sin `@import` remoto, sin `url(http…)`, sin `@font-face`) | tocar la CSP de Fase 3 sin darse cuenta; que el LCP de la landing vuelva a depender de una descarga |
| 1b | No queda `Chivo` ni `Archivo Narrow` en `src/`, `index.html` ni `tailwind.config.js` | que se saque el `<link>` y queden treinta `font-family` pidiendo una fuente que ya no baja: el navegador cae al respaldo y nadie se entera |
| 2 | `tema.css` existe, alguien lo importa, publica los **52 nombres viejos** y los **23 nombres nuevos** de E, hay bloque `html[data-tema="oscuro"]`, y **ningún token vive sólo en un modo** (ni sólo en oscuro, ni un color sin valor de oscuro) | el bug de «blanco sobre blanco»: el modo por defecto es CLARO, así que un token que sólo existe en oscuro no existe el 95 % del tiempo |
| 2b | Cada triplete `--x-rgb` sigue a su `--x` en oscuro | el tema partido en dos: el CSS suelto se pone oscuro y **todas las clases de Tailwind se quedan claras** (ver §5.1) |
| 2c | Todo `var(--x)` leído desde `src/` está definido en alguna parte | re-tokenizar treinta archivos a mano deja nombres fantasma que fallan en silencio |
| 2d | La consola de plataforma cambia con el mismo interruptor | §3.3 |
| 3 | Cero `bg-white / text-slate-* / border-slate-* / bg-indigo-* / text-indigo-* / text-amber-* / bg-gray-*` fuera de `pages/Landing/`, con conteo y los peores archivos; y las paletas `indigo/teal/coral` fuera de `tailwind.config.js` | que quede la mitad del interior blanca adentro del modo oscuro, y que el config invite a volver a escribirlas |
| 4 | La clase del botón principal **se descubre** (la que pinta el fondo con `var(--signal)`; hoy `.btn-principal`), aparece **a lo sumo una vez por archivo de pantalla**, y `--signal` / `--on-signal` no se usan fuera de ella ni desde JSX | que el amarillo se derrame: si hay dos, deja de decir «acá está el trabajo» |
| 5 | `landing.css` sigue colgando entero de `.lp`; y `tema.css` no escribe selectores `.lp` ni `!important` | que este PR —el único con la tentación de hacerlo— repinte la landing |
| 6 | `tailwind.config.js` y `tema.css` se parsean y se comparan token por token; `darkMode` = `["selector", '[data-tema="oscuro"]']`; y **un color que cambia con el modo no puede ser un hex literal en el config** | la regla escrita «si tocás uno, tocá los dos», ahora verificada en vez de recordada |
| 7 | Contraste WCAG de 40 pares texto/fondo en los dos modos, calculado con la fórmula (luminancia relativa sRGB + alfa compuesto) | lo que ningún grep ve |
| 7b | El botón principal tiene contorno propio (relleno **o** borde ≥ 3:1) contra la tarjeta **y** contra el papel | §3.2 |

**Sobre el contraste, tres clases y ninguna categoría-escondite.** `texto` exige
4,5:1 y falla; `objeto` (control o dato gráfico) exige 3:1 y falla; `aviso` se
mide, se imprime y **no** falla — pero son sólo las desviaciones que ya están
documentadas y medidas en `tema.md` y que dependen de un refuerzo **no
cromático** (la palabra al lado, el borde, la línea del piso). Cada una lleva
escrito en el test por qué se acepta. Si mañana desaparece el refuerzo, vuelve a
ser `objeto`.

**El tope por archivo, y las dos excepciones que no son laxitud.** Un archivo
lleva **un** botón amarillo. Suman al tope: (a) `MULTIPASO`, hoy sólo
`src/pages/Login.tsx: 4`, porque `tema.md` §2 lista cuatro pasos **excluyentes**
(elegir cliente / crear cuenta / entrar con clave / entrar con correo); y (b)
**cada capa de modal del archivo**, contada por su marca `data-capa-modal` —
mientras un modal está abierto ÉL es la pantalla, y la regla
`html[data-modal-abierto]` de `index.css` apaga el amarillo de atrás.

Se cuenta la **marca del modal** y no el botón a propósito: un modal que se
olvide de marcar su raíz no sube el tope, y el test lo caza. Así apareció que
`Login.tsx` tiene 5 usos y no 4 — el quinto es el botón de aceptar del
consentimiento (`Login.tsx:908`), y su capa **sí** está marcada
(`Login.tsx:851`), o sea que está bien.

**Lo que igual hay que confirmar a mano:** que los cuatro pasos de Login sean
excluyentes de verdad. Si dos pueden verse a la vez, hay dos amarillos y el test
lo está dejando pasar.

---

## 2. Estado del test al cerrar la auditoría

**19 pruebas. 14 en verde**, y las verdes incluyen todo lo que este PR cambió de
raíz: cero orígenes externos, `index.html` sin Google Fonts, las tres pilas de
sistema, los 52 nombres viejos y los 23 nuevos publicados, ningún token con una
sola cara, los tripletes `-rgb` siguiendo al modo, `darkMode` apuntando a
`[data-tema="oscuro"]`, el config y el tema diciendo el mismo color token por
token, ningún hex literal mode-ciego, un solo `.btn-principal` por pantalla, el
amarillo sin derramarse, y la landing intacta.

Cinco en rojo:

```
FALLA la consola sigue colgando de [data-consola-tema="oscuro"]      ← §3.3
FALLA quedan 155 colores literales de Tailwind fuera de la landing   ← gap §6.1
       bg-white 26 · text-slate- 58 · border-slate- 41 · bg-indigo- 16
       · text-indigo- 7 · text-amber- 7 · bg-gray- 0
       ZoneEditorPanel 60 · SpacePanel 39 · FloorMap 28 · StoreView 12
       · StoreEditor3D 9 · Legend 6 · FloorPlan2D 1
FALLA --ink-3 sobre --surface-3 en claro: 4,44:1                     ← §3.1
FALLA --ink-3 sobre --surface-2 y --surface-3 en oscuro: 4,24 y 3,87 ← §3.1
FALLA el botón amarillo sobre el papel: 2,82:1                       ← §3.2
```

El conteo de 155 es **el mismo que antes del PR**: el re-tokenizado de los siete
componentes todavía no arrancó cuando se cerró esto. Es el gap principal (§6.1).
Las otras cuatro son hallazgos y están abajo.

---

## 3. Hallazgos abiertos

### 3.1 `--ink-3` no llega a 4,5:1 sobre la tercera superficie, en los dos modos

Medido con navegador y con parseo estático (coinciden al centésimo):

| | sobre `--surface` | sobre `--surface-2` | sobre `--surface-3` | sobre `--bg` |
|---|---|---|---|---|
| claro `#5A6B74` | 5,54 | 5,20 | **4,44** | 4,87 |
| oscuro `#6C7E88` | 4,50 | **4,24** | **3,87** | 4,79 |

`tema.md` §1.3 declara «5,54:1 / 4,50:1» y las dos cifras son correctas — pero
están medidas **sólo contra la tarjeta**. `--surface-2` es la fila alterna y el
hover; `--surface-3` es el hueco, lo deshabilitado y la pista de una barra, y en
todos ellos también se escribe. Peor: `--ink-3` es el color de `.rotulo`, que va
a **9,5 px** — texto chico, sin la tolerancia del texto grande.

Y en oscuro sobre el panel da **exactamente 4,50**: cero margen. Un ajuste de un
punto en cualquiera de los dos hex lo vuelve rojo.

**Arreglo medido** (dos hex, nada más):

| | propuesto | s/`--surface` | s/`--surface-2` | s/`--surface-3` | s/`--bg` |
|---|---|---|---|---|---|
| claro | `#54646D` | 6,14 | 5,76 | **4,92** | 5,40 |
| oscuro | `#7C8D96` | 5,52 | 5,20 | **4,75** | 5,87 |

### 3.2 El borde del botón principal se midió contra la tarjeta, no contra el papel

`tema.md` §1.5 agrega `--signal-borde #B88800` justamente porque el relleno
`#F2B300` da 1,87:1 sobre blanco, y declara «3,20:1 sobre `#FFFFFF`». Correcto.
Sobre **el papel `#EFF1ED`** —que es donde se apoya el botón cada vez que no
está adentro de una tarjeta: la barra, un formulario a fondo, el pie de un
panel— da **2,82:1**, por debajo del piso de 3:1 de WCAG 1.4.11 para el límite
de un control. El botón principal de la pantalla se queda sin contorno.

En oscuro no hay problema: `--signal-borde: transparent` y el relleno `#FFD028`
da 12,93:1 sobre el panel y 13,76:1 sobre la sala.

**Arreglo:** `#AD8000` (3,15:1 sobre el papel · 3,58:1 sobre la tarjeta), o
reusar el primitivo que ya existe, `--y-700 #8A6100` (4,87 · 5,54), que además
es el mismo hex de `--signal-ink` y `--ring` — un hex menos en el sistema.

La prueba 7b del test verifica exactamente esto: relleno **o** borde ≥ 3:1
contra las dos superficies, en los dos modos.

### 3.3 La consola de plataforma se queda clara adentro del modo oscuro

`src/tema.tsx` escribe `data-tema` en `<html>` y unifica la llave en
`recabra-tema` (bien: es lo que pide `tema.md` §1.6). Pero el tema oscuro de la
consola sigue colgando de `[data-consola-tema="oscuro"]` en `src/index.css`, y
**ya nadie escribe ese atributo**. Resultado: `/plataforma` y el reporte quedan
en claro adentro del interior oscuro, con `--con-surface #FFFFFF` y texto
oscuro sobre el resto oscuro.

**Arreglo:** cambiar el selector del bloque `--con-*` oscuro a
`html[data-tema="oscuro"]`. La prueba 2d falla mientras quede un selector
`data-consola-tema` en el CSS de la app.

### 3.4 El «relief» del ámbar no lo da el borde: lo da la palabra

`tema.md` §4 acepta el `[WARN] Contrast vs surface` del validador de dataviz
(`#CE8A0A` = 2,54:1 sobre el papel) apoyándose en dos refuerzos: la palabra al
lado —que es regla dura del producto— y el borde del chip: *«un chip o una cara
pintada de `--entra` necesita borde (`--entra-borde #ECD3A2`) para tener
contorno contra el papel; sin borde, un mueble ámbar sobre el piso claro se
pierde»*.

Medido, **el borde no da contorno**:

| borde | sobre el papel `#EFF1ED` | sobre la tarjeta `#FFFFFF` |
|---|---|---|
| `--entra-borde #ECD3A2` | **1,28:1** | 1,46:1 |
| `--libre-borde #9ECFC0` | 1,52:1 | 1,73:1 |
| `--ocupado-borde #F0B2B0` | 1,58:1 | 1,79:1 |

Los tres `-borde` son rellenos suaves, no trazos. La aceptación del WARN sigue
en pie —la palabra al lado **sí** es refuerzo válido y es regla escrita— pero la
frase del documento hay que corregirla, porque la próxima sesión la va a leer
como si el contorno existiera.

**Arreglo:** el trazo del chip y de la cara del plano usa la variante de texto
(`--entra-txt #8A5A06` = 5,21:1 sobre el papel), o el contorno lo pone
`--floor-edge`. Si se elige eso, `-borde` se queda para el relleno del hover y
se documenta así.

### 3.5 `--line` es el borde de campos y botones, y da 1,3:1

`--line` (`#DDDEDE` claro, `#262B30` oscuro) da **1,35:1 / 1,33:1** contra la
tarjeta. Como divisor está bien y la razón escrita en `index.css` —«separar con
una línea de 1px es más preciso y más honesto que una sombra»— es buena. El
problema es que hoy es también el borde de **controles**:
`SeasonPicker.tsx:109,224`, `SeasonsModal.tsx:64,93`, `RatesModal.tsx:50,80`.
WCAG 1.4.11 pide 3:1 para el límite de un control, y ninguno lo tiene.

Esto es **piel, no forma**: entra en este PR. **Arreglo:** un token nuevo
`--brd-control` ≥ 3:1 en los dos modos —`--ink-4` ya sirve (3,62 / 3,18 en
claro; 3,23 / 3,43 en oscuro)— y los seis lugares pasan a usarlo. `--line` se
queda para separar filas.

### 3.6 Menor: `signal.ink` y `accent.ink` no quieren decir lo mismo

En `tailwind.config.js`, `accent.ink` es **la tinta que va ENCIMA del acento**
(`#FFFFFF`, el texto del botón de tinta) y `signal.ink` es **la señal escrita**
(`--signal-ink #8A6100`, el ámbar tostado de la plata). Mismo sufijo, dos
significados opuestos. Quien escriba `text-signal-ink` esperando «el texto que
va sobre el amarillo» se lleva `#8A6100` sobre `#F2B300` = **2,96:1** — que el
propio `tema.md` §1.5 marca como el error a evitar («ni siquiera la propia señal
se puede escribir encima de sí misma»).

Hoy no lo usa nadie, así que es barato: renombrar uno de los dos
(`signal.escrita`, o `accent.on` / `signal.on` para los «encima de»). El test
mapea `signal.ink → --signal-ink`, que es la lectura del config.

### 3.7 Menor: una cifra mal copiada en `tema.md` §1.5

`--ring` claro declarado «4,87:1» en la columna que dice *tarjeta*. `#8A6100`
sobre `#FFFFFF` es **5,54:1**; 4,87:1 es el valor sobre el papel. No cambia
ninguna decisión (pasa los dos pisos) — se anota porque las otras 40 cifras del
documento están bien y esta desentona.

---

## 4. La aritmética de `tema.md`, recalculada

Se recalcularon **41 de las contrastes declaradas** con una implementación
independiente de la fórmula WCAG. **40 coinciden al centésimo**; la única que no
es §3.6. Es un documento con los números hechos, no estimados — vale decirlo.

Lo que ninguna de esas 41 cubría, y por eso son hallazgos: la tercera superficie
(§3.1), el papel bajo el botón (§3.2) y el contorno de los `-borde` (§3.4).

**El navegador coincide con el parseo estático en los 39 pares que comparten, en
los dos modos.** Se midió con Playwright (Chromium `/opt/pw-browsers/chromium-1194`)
contra un `vite` en el puerto **5233** (`--strictPort`, muerto al terminar),
inyectando `tema.css` y leyendo `getComputedStyle` con
`document.documentElement.dataset.tema` en `claro` y en `oscuro`. Es decir: la
cascada real resuelve lo mismo que el test lee del archivo, así que el test
puede correr sin navegador sin perder verdad.

Contraste de los pares principales, tal como los resolvió el navegador:

| par | claro | oscuro |
|---|---|---|
| `--ink-1` sobre `--surface` / `--bg` | 19,14 · 16,84 | 16,91 · 17,99 |
| `--ink-2` sobre `--surface` / `--bg` | 7,06 · 6,21 | 8,29 · 8,81 |
| `--ink-3` sobre `--surface` / `--bg` | 5,54 · 4,87 | 4,50 · 4,79 |
| `--accent-ink` sobre `--accent` | 19,14 | 17,99 |
| `--on-signal` sobre `--signal` | 10,31 | 13,39 |
| `--signal-ink` sobre `--surface` / `--bg` | 5,54 · 4,87 | 12,93 · 13,76 |
| `--libre-txt` sobre tarjeta / papel / `-suave` | 6,55 · 5,76 · 5,56 | 7,87 · 8,38 · 6,14 |
| `--entra-txt` sobre tarjeta / papel / `-suave` | 5,92 · 5,21 · 5,28 | 9,30 · 9,89 · 7,07 |
| `--ocupado-txt` sobre tarjeta / papel / `-suave` | 6,51 · 5,72 · 5,46 | 5,63 · 5,99 · 4,75 |
| `--ring` sobre tarjeta / papel | 5,54 · 4,87 | 14,57 · 15,49 |
| `--ink-4` (no textual) sobre tarjeta / papel | 3,62 · 3,18 | 3,23 · 3,43 |

**Todo lo que es texto pasa 4,5:1 salvo `--ink-3` en §3.1.** La decisión de la
terna de estados —conservar los hex de E aunque reprueben la banda de claridad
de dataviz— está bien argumentada y bien medida en `tema.md` §4, y las tres
alternativas que probó muestran el costo de «arreglarla». No se refuta.

---

## 5. Dos cosas que aparecieron y se arreglaron durante la auditoría

Quedan escritas porque el test las cubre de ahora en más y porque son el tipo de
error que vuelve.

**5.1 El tema partido en dos.** En una instantánea intermedia, `tema.css`
publicaba los colores como `rgb(var(--x-rgb))` —la forma correcta, la que hace
que `tailwind.config.js` pueda leerlos con `<alpha-value>` y que `bg-accent/20`
siga funcionando— pero el bloque oscuro redefinía `--ink-1: #EDF3F2` **sin
redefinir `--ink-1-rgb`**. Consecuencia: `--accent` (que colgaba de
`--accent-rgb → --ink-1-rgb`) se quedaba en `#0A1014` en modo oscuro, o sea
negro sobre negro en el botón de acción, y **todas** las clases de Tailwind que
entran por el triplete se quedaban en su valor claro. Estaban 34 tripletes en
`:root` y 10 en el bloque oscuro. Lo cubre la prueba 2b.

**Y hay que decir que la refutación de fondo es correcta:** la razón escrita en
`tailwind.config.js` —«estos valores son los MISMOS que las variables, escritos
literales y no como `var(--x)` a propósito, porque `bg-accent/20` necesita un
color legible»— era verdadera con la sintaxis vieja y **ya no lo es**: Tailwind
3.4 resuelve `rgb(var(--x-rgb) / <alpha-value>)` y da las dos cosas, el alfa y
el modo. Si el config se hubiera quedado en hex literales, el modo oscuro habría
sido imposible: `bg-surface` habría emitido `#FFFFFF` fijo. La prueba 6b falla
si alguien vuelve a poner un hex literal en un token que cambia con el modo.

**5.2 Nombres fantasma y falsos positivos de grep.** Dos cosas menores del
oficio, anotadas para quien toque el test: `«archivo»` contiene `«chivo»`
(cualquier grep de la fuente vieja da 20 falsos positivos), y los comentarios de
este PR nombran a Chivo, a Google Fonts y a `var(--otro-token)` **a propósito**
— el test quita los comentarios antes de buscar, o falla contra la documentación
que el mismo PR pide escribir.

---

## 6. Gaps — lo que este test NO cubre

1. **Los 155 literales de Tailwind siguen ahí.** La prueba 3 está escrita y en
   rojo; el re-tokenizado de `ZoneEditorPanel` (60), `SpacePanel` (39),
   `FloorMap` (28), `StoreView` (12), `StoreEditor3D` (9), `Legend` (6) y
   `FloorPlan2D` (1) es del frontend y estaba en curso al cerrar. **Declarado
   como gap:** el test falla hasta que lleguen a 0.
2. **No se midió ninguna pantalla real.** El interior está detrás del ingreso y
   los componentes están a medio re-tokenizar; medir hoy sería medir el estado
   viejo. Las capturas por pantalla, en claro y oscuro, a 1440 y 390, con datos
   sembrados, son del Verificador (spec §Verificación 2).
3. **Recortes de códigos en el FloorMap** (la condensada → mono, la columna de
   56 px → `9ch`): no medido acá. Es del Verificador, con rects y no
   `scrollWidth`, como pide `tema.md` §3.3.
4. **Capturas antes/después de la landing.** El test verifica el guardarraíl
   estructural (`.lp`, sin `!important`, sin selectores de landing en
   `tema.css`), no los pixeles. La comparación es del Verificador.
5. **El test mide tokens, no composiciones.** Un texto `--ink-2` adentro de un
   chip `--libre-suave`, o cualquier texto sobre `--panel` translúcido con
   `--blur`, no está en la lista de 40 pares. Tampoco están los `--con-*` de la
   consola ni los resultados de los modificadores de opacidad (`bg-accent/20`,
   `/40`…), que son composiciones y hay que mirarlas en pantalla.
6. **El tope por archivo es un grep, no una medición de lo que se ve a la vez.**
   La excepción `MULTIPASO` de `Login.tsx` (§1) necesita confirmación humana de
   que los cuatro pasos son excluyentes; y las capas de modal se cuentan por su
   marca `data-capa-modal`, que es una convención, no una garantía de que el
   modal esté realmente encima.
7. **`.btn-principal:disabled`** usa `--ink-4` sobre `--surface-3` (2,90:1 en
   claro). WCAG exceptúa los controles inactivos, así que no se reporta como
   falla — pero si el botón deshabilitado tiene que **leerse**, no alcanza.
8. **La regla `[data-modal-abierto]`** (el amarillo que se apaga detrás de un
   modal) está implementada en `index.css` y verificada sólo por lectura: que el
   contador de modales abiertos suba y baje bien es comportamiento, y se prueba
   en pantalla.

---

## 7. Qué se corrió

```
cd /tmp/retail-espacios-test/frontend
npx tsc --noEmit          → limpio al empezar; al cerrar, un error del trabajo
                            en curso del frontend:
                            src/pages/ReportePlataforma.tsx(137,7) TS6133
                            'botonPrimarioStyle' declarado y sin usar.
                            No es de esta auditoría — se avisa porque `tsc`
                            tiene que quedar limpio antes del Verificador.
npm run probar:tema       → 19 pruebas, 14 verdes (estado en §2)
npm run probar:landing    → 21 pruebas, todas verdes (la landing no se movió)
```

Más la medición con Playwright descrita en §4, con `vite` en el puerto 5233,
apagado al terminar. **No** se corrió la suite del backend ni `npm run build`
(los corre el Verificador, en serie). **No** hay commit ni push.

## 8. Archivos que dejo

- `frontend/scripts/probar-tema.mjs` — el test (660 líneas, sin dependencias
  nuevas).
- `frontend/package.json` — `probar:tema` agregado, y sumado al final de la
  cadena `probar`.
- `features/diseno-interior/outputs/auditor.md` — este documento.
