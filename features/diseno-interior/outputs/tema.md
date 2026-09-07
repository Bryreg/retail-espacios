# Fase 10 · PR 1 — El tema compartido

Diseñador de sistema. Entrega del mapeo de tokens, la lista de botones amarillos
y la decisión de tipografía. **Acá no hay código de la aplicación**: esto es el
contrato que el frontend implementa en `frontend/src/tema.css`,
`frontend/src/index.css` y `frontend/tailwind.config.js`.

Fuentes: `features/diseno-interior/spec.md` (decisiones del dueño),
`frontend/src/pages/Landing/landing.css` (sistema de E, tres capas),
`frontend/src/index.css` + `frontend/tailwind.config.js` (lo que la app usa hoy,
con sus razones escritas), `docs/ESTADO.md` §«Rediseño de la pantalla principal»
y §«Herramientas de diseño en el repo».

---

## 0. Las tres reglas de las que cuelga todo

1. **Claro por defecto adentro.** Oscuro a un clic, guardado en `localStorage`
   bajo `recabra-tema`, sin leer `prefers-color-scheme`. El interior cuelga de
   `[data-tema="oscuro"]` en `<html>`; la landing sigue con `.lp` +
   `data-lp-tema` y **no cambia**.
2. **Amarillo sólo en el botón principal de cada pantalla.** Uno por pantalla.
   `--accent` sigue siendo tinta para todo lo demás. Lista en §2.
3. **Este PR es piel, no forma.** Ningún tamaño de letra, ninguna caja, ningún
   layout se mueve. Todo lo que quiera moverse se anota para el PR 2.

De (3) salen dos refutaciones a la spec que están argumentadas más abajo y que
hay que aprobar o rechazar antes de escribir el CSS: **la escala tipográfica de
E no baja al interior** (§3.4) y **los radios de E bajan capados en 16 px**
(§1.7).

---

## 1. Tabla de tokens · viejo → nuevo

Convención del archivo compartido: `tema.css` define **los primitivos de E en
`:root`** (capa 1) y **los semánticos en `:root` (claro) y
`[data-tema="oscuro"]` (oscuro)** (capa 2), publicando **los dos juegos de
nombres a la vez** — el que usa la app hoy (para que treinta archivos sigan
compilando) y el de E (para que un componente nuevo se escriba en el idioma de
la landing). Los dos nombres apuntan al mismo primitivo; no hay dos verdades.

`landing.css` no se toca: sus `--t-*`, `--bg`, `--fg`… viven dentro de `.lp` y
**sombrean** por cascada a los de `:root`. Es exactamente el mecanismo que su
propio encabezado ya describe, así que la landing queda blindada sin mover una
línea (lo verifica `probar-landing.mjs` + las capturas del guardrail).

### 1.1 Fondos y superficies

| Token app (viejo) | Alias E | Claro | Oscuro | Nota |
|---|---|---|---|---|
| `--bg` | `--bg` | `#EFF1ED` (`--p-100`) | `#04070A` (`--n-1000`) | el papel / la sala a media luz |
| `--surface` | `--panel-solid` | `#FFFFFF` (`--p-000`) | `#0B1116` (`--n-900`) | la tarjeta |
| `--surface-2` | *(nuevo)* `--panel-2-solid` | `#F7F8F5` (`--p-050`) | `#101820` (`--n-850`) | fila alterna, hover |
| `--surface-3` | `--bg-deep` | `#E4E7E1` (`--p-200`) | `#16212A` (`--n-800`) | hueco, deshabilitado, pista de barra |
| *(nuevo)* | `--panel` | `rgba(255,255,255,.82)` | `rgba(12,19,25,.72)` | tarjeta translúcida + `--blur` |
| *(nuevo)* | `--panel-2` | `rgba(11,17,22,.045)` | `rgba(255,255,255,.045)` | relleno fantasma |
| *(nuevo)* | `--floor` | `#F7F8F5` | `#0A1015` | el piso del plano isométrico |
| *(nuevo)* | `--blur` | `14px` | `16px` | |

`--panel`/`--panel-2` se agregan **con** su gemelo sólido porque Tailwind no
sabe separarle el alfa a un `rgba()` escrito a mano: la clase va contra el
sólido, el CSS suelto puede usar el translúcido.

### 1.2 Líneas

E las escribe con alfa (`--brd: rgba(11,17,22,.14)`). La app las necesita
**sólidas** por la regla escrita de `tailwind.config.js` («los mismos hex,
literales y no `var(--x)`, porque `bg-accent/20` necesita un color legible»).
Se publican las dos formas: el alfa para el CSS de componente, el sólido —el
mismo valor aplanado sobre la superficie de referencia— para Tailwind.

| Token app (viejo) | Alias E | Claro (sólido) | Claro (alfa) | Oscuro (sólido) | Oscuro (alfa) |
|---|---|---|---|---|---|
| `--line-soft` | *(nuevo)* `--brd-soft` | `#F0F1F1` | `rgba(11,17,22,.06)` | `#1A1F24` | `rgba(255,255,255,.06)` |
| `--line` | `--brd` | `#DDDEDE` | `rgba(11,17,22,.14)` | `#262B30` | `rgba(255,255,255,.11)` |
| `--line-strong` | `--brd-strong` | `#BBBCBE` | `rgba(11,17,22,.28)` | `#3E4347` | `rgba(255,255,255,.21)` |
| *(nuevo)* | `--floor-edge` | `rgba(11,17,22,.16)` | — | `rgba(255,255,255,.10)` | — |

Los sólidos claros están aplanados sobre `#FFFFFF` (la tarjeta, que es donde
vive el 90 % de las líneas). Sobre el papel `#EFF1ED` la misma tinta da
`#E1E4E0 / #CFD2CF / #AFB2B1`; si una separación sobre el fondo se ve lavada, la
respuesta es usar el alfa, no un cuarto token.

### 1.3 Tinta

| Token app (viejo) | Alias E | Claro | Oscuro | Contraste medido |
|---|---|---|---|---|
| `--ink-1` | `--fg` | `#0A1014` | `#EDF3F2` | 19,14:1 / 16,91:1 sobre la tarjeta |
| `--ink-2` | `--fg-2` | `#4A5B65` | `#9DAEB6` | 7,06:1 / 8,29:1 |
| `--ink-3` | `--fg-3` | `#5A6B74` | `#6C7E88` | 5,54:1 / 4,50:1 |
| `--ink-4` | *(nuevo)* `--fg-4` | `#788994` (`--n-400`) | `#556772` | 3,62:1 / 3,23:1 |
| `--ink-vacio` | `--fg-4` | `#788994` | `#556772` | idem |

`--ink-1..3` pasan 4,5:1 en las dos superficies y en los dos modos. **`--ink-4`
no es un color de texto** y nunca lo fue: es el placeholder, el «sin dato» y lo
deshabilitado. Queda por encima de 3:1 en ambos modos, que es el piso de un
elemento no textual. Si hoy hay texto normal escrito en `--ink-4`, es un bug de
contraste preexistente y lo tiene que listar el auditor.

`--ink-vacio` deja de tener valor propio (era `#BEC5C8`) y se vuelve alias de
`--ink-4`: decían lo mismo con dos hex distintos.

### 1.4 Acento = tinta

La razón escrita en `index.css` —«un cuarto color saturado en un botón le
robaría señal a los tres que sí la cargan»— **sigue en pie y se refuerza**: el
amarillo entra acotado a un botón por pantalla justamente para no ser un cuarto
color de estado. Todo el resto de la acción sigue siendo tinta.

| Token app (viejo) | Claro | Oscuro | Nota |
|---|---|---|---|
| `--accent` | `#0A1014` | `#EDF3F2` | = `--ink-1`. En oscuro la tinta es clara: el botón de acción se invierte |
| `--accent-ink` | `#FFFFFF` | `#04070A` | el texto encima del acento |
| `--accent-50` | `#F7F8F5` | `#101820` | = `--surface-2` |
| `--accent-100` | `#E4E7E1` | `#16212A` | = `--surface-3` |
| `--accent-200` | `#BBBCBE` | `#3E4347` | = `--line-strong`; bordes punteados |
| `--accent-600` | `#0A1014` | `#EDF3F2` | = `--accent` |
| `--accent-700` | `#0A1014` | `#EDF3F2` | = `--accent`; se usa como color de texto de enlace |

### 1.5 Señal = amarillo

| Token nuevo | Claro | Oscuro | Contraste medido |
|---|---|---|---|
| `--signal` | `#F2B300` | `#FFD028` (`--y-500`) | relleno del botón principal |
| `--signal-borde` *(nuevo, no está en E)* | `#B88800` | `transparent` | 3,20:1 sobre `#FFFFFF` |
| `--on-signal` | `#120E00` | `#0A0C06` | 10,31:1 / 13,39:1 sobre su relleno |
| `--signal-ink` | `#8A6100` (`--y-700`) | `#FFD028` | 5,54:1 sobre tarjeta / 12,93:1 sobre panel |
| `--ring` (foco) | `#8A6100` | `#FFE067` (`--y-400`) | 4,87:1 / 14,57:1 |

Primitivos: `--y-400 #FFE067 · --y-500 #FFD028 · --y-600 #E0B000 · --y-700 #8A6100`.

**Dos correcciones a la letra de la spec, con la medición al lado:**

- La spec dice «`--signal` (`--y-500 #FFD028`)». En **claro** eso está mal y E
  ya lo había resuelto: su tema claro define `--signal: #F2B300`. Se respeta a E.
  `#FFD028` sobre la tarjeta blanca da **1,47:1** y sobre el papel **1,29:1** —
  el botón no tendría borde contra el fondo, sería una mancha flotando. En
  **oscuro** sí es `#FFD028` tal cual. `--y-500` queda como primitivo y como
  valor del modo oscuro.
- Aun con `#F2B300`, el botón amarillo sobre una **tarjeta blanca** da
  **1,87:1**: adentro no hay el fondo profundo ni el halo (`box-shadow` con
  `color-mix`) que en la landing le dibujan el contorno. Por eso se agrega
  `--signal-borde #B88800` (**3,20:1** sobre blanco) como `1px` del botón
  principal en claro. En oscuro no hace falta: `#FFD028` sobre el panel da
  **12,93:1**, el borde va `transparent`.
- `--signal-ink` es la señal **escrita** (un total, un «$», una etiqueta de
  precio). Nunca se escribe con `--signal`: `#8A6100` sobre `#F2B300` da 2,96:1,
  o sea que ni siquiera la propia señal se puede escribir encima de sí misma. En
  claro se escribe `--on-signal #120E00` sobre el relleno (10,31:1), y
  `--signal-ink #8A6100` sobre papel o tarjeta (4,87:1 / 5,54:1).

### 1.6 Los tres estados + el resto

Los rellenos son los hex de E validados con dataviz (§4). Se agrega **una
variante `-txt` por estado en claro**, que E no necesitaba y la app sí: sus
rellenos claros no llegan a 4,5:1 como texto sobre el papel.

**Modo claro** (`-suave` = estado al 12 % sobre `#FFFFFF`; `-borde` = al 38 %):

| Token app (viejo) | Alias E | Valor viejo | Valor nuevo | Contraste |
|---|---|---|---|---|
| `--libre` | `--st-libre` (`--st-libre-l`) | `#00786A` | **`#00805A`** | 4,96:1 tarjeta · 4,36:1 papel (relleno) |
| `--libre-suave` | `--st-libre-soft` | `#D8F0EA` | **`#E0F0EB`** | |
| `--libre-borde` | — | `#A8DCD0` | **`#9ECFC0`** | |
| `--libre-txt` *(nuevo)* | — | — | **`#006B4C`** | 6,55:1 tarjeta · 5,76:1 papel · 5,56:1 sobre `-suave` |
| `--entra` | `--st-libera` (`--st-libera-l`) | `#F08519` | **`#CE8A0A`** | 2,89:1 tarjeta (relleno, ver abajo) |
| `--entra-suave` | — | `#FCEEDD` | **`#F9F1E2`** | |
| `--entra-borde` | — | `#F2C79A` | **`#ECD3A2`** | |
| `--entra-txt` | — | `#B35F0A` | **`#8A5A06`** | 5,92:1 tarjeta · 5,21:1 papel · 5,28:1 sobre `-suave` |
| `--ocupado` | `--st-tomado` (`--st-tomado-l`) | `#8E1226` | **`#D8342E`** | 4,72:1 tarjeta · 4,15:1 papel (relleno) |
| `--ocupado-suave` | — | `#F7E4E7` | **`#FAE7E6`** | |
| `--ocupado-borde` | — | `#E0B4BD` | **`#F0B2B0`** | |
| `--ocupado-txt` *(nuevo)* | — | — | **`#B32720`** | 6,51:1 tarjeta · 5,72:1 papel · 5,46:1 sobre `-suave` |
| `--resto` | `--st-resto` (`--st-resto-l`) | `#D3D9DB` | **`#AAB3BE`** | lo que no se alquila |
| `--resto-suave` *(nuevo)* | `--st-resto-soft` | — | **`#ECEEF1`** | |
| `--resto-borde` *(nuevo)* | — | — | **`#D5D9DF`** | |

**Modo oscuro** (`-suave` = estado al 16 % sobre `#0B1116`; `-borde` = al 42 %):

| Token app | Alias E | Oscuro | Contraste sobre el panel |
|---|---|---|---|
| `--libre` | `--st-libre-d` | **`#00BE86`** | 7,87:1 |
| `--libre-suave` | `--st-libre-soft` | **`#092D28`** | (texto `--libre` encima: 6,14:1) |
| `--libre-borde` | — | **`#065A45`** | |
| `--libre-txt` | — | **`#00BE86`** | = el relleno |
| `--entra` | `--st-libera-d` | **`#F5A524`** | 9,30:1 |
| `--entra-suave` | — | **`#302918`** | (texto `--entra` encima: 7,07:1) |
| `--entra-borde` | — | **`#6D4F1C`** | |
| `--entra-txt` | — | **`#F5A524`** | = el relleno |
| `--ocupado` | `--st-tomado-d` | **`#F4544E`** | 5,63:1 |
| `--ocupado-suave` | — | **`#301C1F`** | (texto `--ocupado` encima: 4,75:1) |
| `--ocupado-borde` | — | **`#6D2D2E`** | |
| `--ocupado-txt` | — | **`#F4544E`** | = el relleno |
| `--resto` | `--st-resto-d` | **`#33414F`** | |
| `--resto-suave` | `--st-resto-soft` | **`#1B242D`** | |
| `--resto-borde` | — | **`#293541`** | |

**En oscuro no hace falta `-txt`**: los tres rellenos ya pasan 4,5:1 sobre el
panel. Los tokens existen igual, apuntando al relleno, para que un componente se
escriba una sola vez.

**La regla de uso, que es lo que evita el bug:** `--libre / --entra / --ocupado`
pintan **caras del plano, puntos, barras y chips**. Para **escribir** se usa
siempre `--*-txt`. En claro son colores distintos; en oscuro son el mismo. Un
grep del auditor sobre `color: var(--libre)` / `var(--ocupado)` fuera del plano
debería dar cero.

Los alias semánticos apuntan a las variantes de texto, que es como ya estaba
escrito para `--warning` («el naranja de relleno no se puede leer como texto
sobre blanco; para escribir con él está la versión oscura»). Se extiende la
misma regla a los otros dos:

| Alias | Apunta a | Claro | Oscuro |
|---|---|---|---|
| `--success` | `--libre-txt` | `#006B4C` | `#00BE86` |
| `--success-50` | `--libre-suave` | `#E0F0EB` | `#092D28` |
| `--success-100` | `--libre-borde` | `#9ECFC0` | `#065A45` |
| `--warning` | `--entra-txt` | `#8A5A06` | `#F5A524` |
| `--warning-50` | `--entra-suave` | `#F9F1E2` | `#302918` |
| `--warning-100` | `--entra-borde` | `#ECD3A2` | `#6D4F1C` |
| `--danger` | `--ocupado-txt` | `#B32720` | `#F4544E` |
| `--danger-50` | `--ocupado-suave` | `#FAE7E6` | `#301C1F` |
| `--danger-100` | `--ocupado-borde` | `#F0B2B0` | `#6D2D2E` |
| `--muted-status` | `--ink-4` | `#788994` | `#556772` |

Los nombres `success/warning/danger` se conservan por la razón ya escrita —los
piden treinta archivos— y **siguen sin querer decir «bien / cuidado / error»**:
quieren decir libre, se libera, tomado.

**El rojo deja de ser oscuro y hay que decir por qué.** La razón escrita en
`index.css` era buena: «el rojo es OSCURO a propósito, porque cuando el tono se
colapsa lo que queda es la luminosidad». La paleta de E resuelve lo mismo por
otro lado —separa **el ámbar del rojo** en vez de separar el rojo del verde— y
lo hace mejor medido: el peor par pasa de ΔE 5,3 (verde+naranja, que reprobó) a
**10,4 en deuteranopía** y **17,9 en visión normal** (§4). El rojo `#D8342E`
puede ser más claro porque quien carga la diferencia es el ámbar tostado
`#CE8A0A`, no la luminosidad del rojo. La regla de producto —**cada estado va
SIEMPRE con su palabra al lado**— no cambia y sigue siendo la que garantiza la
identidad.

Los `indigo-* / teal-* / coral-*` de `tailwind.config.js` **se van**. La razón
escrita («se van cuando se rehagan esas pantallas») se cumple: este PR rehace el
editor de zonas y el panel de espacios **en color**, que es lo que esos tokens
pintaban. La forma queda para el PR 2. El azul del editor pasa a `--accent`
(tinta) y las selecciones a `--signal-ink`.

Los `--con-*` de la consola de plataforma **no se tocan en este PR**: son un
sistema deliberadamente distinto («un acento instrumento azul-pizarra que NO es
ninguno de los tres estados») y su tema oscuro ya existe y funciona. Lo único
que cambia es que su toggle pasa a leer la misma llave (`recabra-tema`) en vez
de `data-consola-tema` propio, para que el interior no tenga dos interruptores.

### 1.7 Radios

Razón escrita a refutar: «dos valores: 2 px para lo que se toca, 3 px para el
panel. Un plano de supermercado y una tabla de contratos no son objetos
blandos».

**Se refuta a medias.** Lo que hace que E no se vea blando no es el radio: es la
línea de 1 px, el panel plano y el papel frío — E usa `--r-md: 10px` en botones
y `--r-lg: 16px` en tarjetas y sigue leyéndose como un plano. Lo que sí es cierto
es que el escalón de arriba de E (`--r-xl: 24px`) está calculado para una página
con 96 px de aire entre bloques; en el interior los paneles están a 10 px y una
esquina de 24 px se come el renglón del encabezado. **Se adopta la escala de E
capada en 16 px.**

| Token app (viejo) | Viejo | Nuevo | Equivale a | Usos hoy (fuera de Landing) |
|---|---|---|---|---|
| `--r-xs` | 2px | **4px** | `--r-xs` de E | 16 |
| `--r-sm` | 2px | **6px** | `--r-sm` de E | 23 |
| `--r-md` | 2px | **10px** | `--r-md` de E | 80 — botones, campos, chips |
| `--r-lg` | 2px | **16px** | `--r-lg` de E | 27 — botones grandes, tarjetas |
| `--r-xl` | 3px | **16px** | `--r-lg` de E | 20 — modales y paneles |
| `--r-2xl` | 3px | **16px** | `--r-lg` de E | 1 |
| `--r-pill` *(nuevo)* | — | **999px** | `--r-pill` de E | 0 |
| `--r-hero` *(nuevo)* | — | **24px** | `--r-xl` de E | 0 — disponible, sin uso |
| `--hair` *(nuevo)* | — | **1px** | `--hair` de E | |

### 1.8 Sombras

Razón escrita a refutar: «separar con una línea de 1 px es más preciso y más
honesto que una sombra ambiental… queda una sola sombra de verdad, para el
modal».

**Se respeta el principio y se cambia la implementación.** La línea sigue siendo
el separador de todo lo que está apoyado; la sombra queda para lo que flota. Lo
que cambia es que ahora hay **dos** alturas de flote (el desplegable y el modal)
en vez de una, porque el interior tiene desplegables (periodo, temporadas,
cliente) que hoy se apoyan en un borde y se confunden con la tabla de atrás.

| Token app (viejo) | Viejo | Nuevo (claro) | Nuevo (oscuro) | Para qué |
|---|---|---|---|---|
| `--shadow-xs` | `none` | **`none`** | **`none`** | lo apoyado: sigue siendo la línea |
| `--shadow-sm` | `none` | `--sh-1` `0 1px 2px rgba(16,21,30,.07)` | `0 1px 2px rgba(0,0,0,.5)` | el chip levantado |
| `--shadow-md` | `none` | `--sh-2` `0 10px 28px -14px rgba(16,21,30,.24), 0 2px 6px rgba(16,21,30,.05)` | `0 12px 34px -14px rgba(0,0,0,.8), 0 2px 8px rgba(0,0,0,.4)` | desplegables y popovers |
| `--shadow-lg` | `0 18px 44px rgba(20,24,28,.22), 0 4px 12px rgba(20,24,28,.12)` | `--sh-3` `0 28px 64px -26px rgba(16,21,30,.32), 0 4px 12px rgba(16,21,30,.07)` | `0 30px 70px -24px rgba(0,0,0,.85), 0 4px 14px rgba(0,0,0,.5)` | el modal |

Nombres de E publicados en paralelo: `--sh-1 / --sh-2 / --sh-3`.

### 1.9 Espacios, duraciones y varios

Se adoptan tal cual de E, sin equivalente viejo (hoy la app escribe los px a
mano y Tailwind tiene su propia escala 1–6 de 4 px, que **coincide** con la de E
hasta `--s5`):

`--s1 4px · --s2 8px · --s3 12px · --s4 16px · --s5 24px · --s6 32px · --s7 48px · --s8 64px · --s9 96px`

> Ojo, hay un desfase real: la escala de `tailwind.config.js` define `5: 20px` y
> `6: 24px`, mientras que E define `--s5: 24px` y `--s6: 32px`. **No se toca la
> escala de Tailwind en este PR** (mover `p-6` de 24 a 32 px es forma, no piel).
> Las dos conviven; se anota para el PR 2.

`--dur-1 140ms · --dur-2 260ms · --dur-3 420ms · --dur-4 640ms · --dur-5 900ms`
`--ease cubic-bezier(.22,.68,.24,1)` · `--ease-out cubic-bezier(.16,.84,.44,1)`

---

## 2. Pantalla → botón principal amarillo

Regla: **uno por pantalla, y sólo uno visible a la vez**. Lleva `--signal` de
fondo, `--on-signal` de texto y, en claro, `1px solid --signal-borde`. Todo lo
demás de la pantalla —incluido lo que hoy es «primario»— queda en `--accent`
(tinta) o fantasma.

| # | Pantalla / ruta | Botón amarillo | Dónde está hoy |
|---|---|---|---|
| 1a | **Login** · paso «elegir cliente» | **Continuar** | `pages/Login.tsx:598` |
| 1b | **Login** · paso «crear cuenta» | **Crear y entrar** | `pages/Login.tsx:557` |
| 1c | **Login** · paso «entrar con clave» | **Entrar** | `pages/Login.tsx:812` |
| 1d | **Login** · paso «entrar con correo» | **Entrar** | `pages/Login.tsx:689` |
| 2 | **Vender** (`/`, modo Vender) | **Guardar contrato y avisar** | `components/Contrato/ModoVender.tsx:426` |
| 3 | **Supervisar** (`/`, modo Supervisar) | **ninguno** — ver abajo | — |
| 4 | **Montaje** (`/montaje/:token`, el mercaderista) | **Confirmar** | `components/Montaje/FormularioMontaje.tsx:499` |
| 5 | **Montajes** (lista dentro del tablero) | **ninguno propio** — ver abajo | `pages/MountView.tsx` |
| 6 | **Plataforma** (`/plataforma`) | **ninguno** — ver abajo | — |
| 7 | **Reporte de plataforma** (`/reporte-plataforma`, `/plataforma/reporte/:slug`) | **Descargar JSON** | `pages/ReportePlataforma.tsx:417` |
| 8 | **Detalle de cliente** (`/plataforma/clientes/:slug`) | **Reporte de transparencia** | `pages/DetalleCliente.tsx:716` |
| 9 | **Política de datos** (`/politica-datos`) | **ninguno** — es texto legal | — |
| 10 | **Landing** (`/` sin sesión) | *fuera de alcance* — ya tiene el suyo y no se toca | `.lp .btn--primary` |

**Modales.** Mientras un modal está abierto **él es la pantalla**, así que su
botón principal se lleva el amarillo:

| Modal | Botón amarillo |
|---|---|
| Carga masiva de contratos | **Guardar N y avisar** (`components/CargaMasiva/CargaMasiva.tsx:396`) |
| Tarifas de referencia | **Guardar** (`components/RatesModal/RatesModal.tsx`) |
| Editor de zonas 3D | **Guardar** (`components/StoreEditor3D/StoreEditor3D.tsx:2633`) |
| Consentimiento de datos | **el botón de aceptar** (`components/ModalConsentimiento.tsx`) |
| Configuración (panel del tablero) | **ninguno** — son interruptores que guardan solos |
| Visor de archivos | **ninguno** — es lectura |

**La única regla de comportamiento que este PR agrega:** mientras hay un modal
abierto, el botón principal de la pantalla de atrás **pierde el amarillo y pasa
a tinta**. Si no, hay dos amarillos en pantalla y la regla del dueño deja de
significar algo. Se resuelve con un atributo en la raíz (`[data-modal-abierto]`)
y una regla de CSS; no toca ningún componente.

### Las pantallas sin botón principal, y por qué

- **Supervisar (3).** Es una pantalla de **lectura**: la franja de cifras, el
  plano y la tabla de las 23 caras. No hay una acción que *cierre* nada. Lo que
  parece acción —Planilla, Tarifas, Actualizar, el selector de periodo
  (`pages/DashboardView.tsx:3401/3418/3446`)— son herramientas de la barra, y
  pintarlas de amarillo diría que ahí está el trabajo, que es justo lo que no.
  Liberar y editar viven **dentro del panel de un espacio**: son la acción de un
  panel, no de la pantalla, y siguen en tinta. Vender y Supervisar son dos modos
  de la misma ruta, así que en la práctica sólo hay un amarillo en `/`, y
  aparece exactamente cuando se está armando un contrato. Es la lectura correcta
  de la intención del dueño.
- **Montajes (5).** Es la lista de pendientes: cada fila abre el formulario, y
  el amarillo ya está adentro del formulario (fila 4). Un amarillo en la lista
  competiría con el del formulario que abre. Si se quiere destacar la fila, eso
  es forma → PR 2.
- **Plataforma (6).** Es una consola de lectura (métricas, tendencia, adopción,
  supresiones). No tiene una acción principal: los «Guardar» que aparecen
  (`pages/Plataforma.tsx:177` y `:530`) son de **una fila que se está editando**,
  no de la pantalla, y se quedan en `--con-accent`. Esto es exactamente el caso
  que la spec pide documentar.
- **Política de datos (9).** Texto legal, sin acción.

---

## 3. Tipografía

### 3.1 La decisión

**Se quitan Chivo y Archivo Narrow y se adoptan las tres pilas de sistema de E.**
Con ellas se va el `<link>` a Google Fonts de `frontend/index.html` (líneas
35, 36 y 43: los dos `preconnect` y la hoja `css2?family=Archivo+Narrow…&family=Chivo…`).

```
--f-display  "Helvetica Neue", "Segoe UI Variable Display", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans", Arial, sans-serif
--f-text     -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans", "Helvetica Neue", Arial, sans-serif
--f-mono     ui-monospace, SFMono-Regular, "SF Mono", "Cascadia Mono", "JetBrains Mono", Menlo, Consolas, "Liberation Mono", monospace
```

Alias para los ochenta lugares que ya los piden: `--font-sans → --f-text`,
`--font-mono → --f-mono`. En `tailwind.config.js`, `fontFamily.sans` y
`fontFamily.mono` toman las mismas dos pilas, y se agrega `fontFamily.display`.

`font-variant-numeric: tabular-nums` + `font-feature-settings: "tnum"` **se
quedan en el `body`**, por la razón que ya está escrita y que no cambia: «la
mitad de lo que se lee acá son códigos, fechas y plata en columna, y con cifras
proporcionales las columnas bailan». Todas las pilas de arriba lo soportan.

### 3.2 Las dos razones escritas, contestadas

**(a) «Chivo tiene un 900 de verdad —no un 700 engordado— y ahí se apoya el
único número grande de la pantalla, el total del contrato: sin ese peso el panel
entero se queda sin jerarquía.»**

**Refutada, con reemplazo.** Dos cosas:

1. El peso no se pierde. `--f-display` con `font-weight: 800` resuelve al corte
   más pesado disponible en cada sistema (Helvetica Neue Bold en macOS, el eje
   de peso de Segoe UI Variable Display en Windows, Roboto Black en Android y
   en la mayoría de los Linux con fontconfig). E lo usa así en su `h1`/`h2` y
   pesa igual.
2. Y sobre todo: **el total del contrato es una cifra, no un título**, y E le da
   a las cifras su propio tratamiento, que es más fuerte que un 900 sans —
   `.fig`: `--f-mono` + `tabular-nums` + `700` + `letter-spacing: -.02em`. Una
   cifra mono con tracking negativo se lee como una cifra de sistema de caja, no
   como un titular. La jerarquía la da el tamaño (`--t-xl`, 27 px), la familia
   distinta y el color, no el peso de una foundry.

Se publica `--peso-display: 800` para que el reemplazo sea un token y no una
decisión repetida en cada componente.

**(b) «Archivo Narrow aprieta `GON-60·A` en una columna de 56 px, y de eso
depende que las 23 caras entren sin cortar un código; además es la voz de los
rótulos en versalita.»**

**Se respeta como medición y se le contesta separando los dos trabajos.**
Archivo Narrow hacía tres cosas distintas y sólo una necesita ser condensada:

| Trabajo | Hoy | Nuevo | Por qué |
|---|---|---|---|
| **Cifras** (plata, tarifas, fechas, cantidades) | Archivo Narrow + `tnum` | **`--f-mono` + `tabular-nums`** | Es una mejora clara: la retícula del mono es real, no simulada con `tnum` sobre una proporcional. Es lo que la propia razón escrita dice que necesitaba («lo que se necesitaba de un mono acá era que las CIFRAS alinearan») |
| **Rótulos en versalita** (`.rotulo`, 9,5 px, `uppercase`, `+0.11em`) | Archivo Narrow 600 | **`--f-text` 600** — *no* mono | Un mono en versalita a 9,5 px es ~18 % más ancho que Archivo Narrow y rompería los encabezados de columna. La voz de «plano impreso» la dan la versalita y el tracking, no la condensación. La pila de texto de sistema en 600 uppercase es **más angosta** que cualquier mono y no pierde carácter a ese tamaño. E hace lo mismo en su `.eyebrow` sólo porque ahí el rótulo va a 12 px y tiene aire de sobra |
| **Códigos de espacio** (`GON-60·A`) | Archivo Narrow | **`--f-mono`** | Acá el problema de ancho es real y se aplica la regla del dueño |

### 3.3 El ancho de los códigos: se ajusta la columna, no la tipografía

La medición: `GON-60·A` son 9 caracteres. Un mono típico avanza ~0,60 em, así
que a 11 px ocupa **≈ 59 px** y a 12 px **≈ 65 px**. La columna de 56 px se
queda corta por unos 3–9 px. La regla de la spec es explícita: **se ajusta la
columna**.

Cómo, en concreto y sin depender de qué mono resuelva el sistema operativo:

1. **Toda columna que muestre un código se mide en `ch`, no en px.** Con
   `--f-mono` aplicado, `1ch` es exactamente un avance de carácter, así que
   `min-width: 9ch` (+ el padding) es el ancho del código **por construcción**,
   resuelva el navegador SF Mono, Cascadia o Liberation Mono. Es la única forma
   de que la medida sobreviva a los tres sistemas operativos. La columna de
   56 px pasa a `9ch`.
2. **En el FloorMap**, donde la etiqueta va sobre el mueble y no hay columna que
   ensanchar, el rótulo baja a `--t-2xs` (11 px) con `--f-mono`. Si el
   verificador (que mide **rects**, no `scrollWidth`) sigue reportando recorte en
   alguna de las 23 caras, **eso no se arregla achicando la letra**: se anota en
   `outputs/frontend.md` como pendiente del PR 2, donde la respuesta es de forma
   —mostrar el código corto sobre el mueble y el completo en la ficha—, no de
   piel.
3. **Regla de sistema, para que no vuelva a pasar:** ninguna caja que contenga
   un código lleva `overflow: hidden` con ancho fijo en px. O `ch`, o se
   envuelve.

### 3.4 La escala tipográfica: la de E se queda en la landing

**Refutación a la lectura literal de la spec.** La escala de E es fluida
(`--t-base: clamp(15.5px, 1.02vw, 17px)`, `--t-3xl` hasta 78 px) y está hecha
para una página de venta que respira. Bajarla al interior mueve **todos** los
tamaños —el cuerpo de 13 a 14,5 px, el rótulo de 9,5 a 11— y relayoutea cada
tabla, cada ficha y cada columna del plano. Eso es **forma**, y la regla 3 de
este PR dice que la forma es el PR 2.

Se adoptan **los nombres** de E con **los siete pasos que la app ya usa**, fijos
(sin `clamp`, porque el interior es una herramienta de densidad fija), más un
octavo que hoy está suelto:

| Token | Valor | Reemplaza a | Uso |
|---|---|---|---|
| `--t-3xs` | `9.5px` | 9.5 suelto | versalitas y rótulos (`.rotulo`) |
| `--t-2xs` | `11px` | 11 suelto | notas, ejes, pies, código sobre el mueble |
| `--t-xs` | `12px` | 12 suelto | secundario |
| `--t-sm` | `13px` | 13 suelto | cuerpo |
| `--t-base` | `14.5px` | 14.5 suelto | títulos de panel, campos, botón |
| `--t-md` | `17px` | 17 suelto | códigos de espacio, cifras jefe |
| `--t-lg` | `21px` | los 19–20 sueltos de los títulos de pantalla | título de pantalla |
| `--t-xl` | `27px` | 27 suelto | el total del contrato |

`--t-2xl` y `--t-3xl` **no se definen en `:root`**: son de la landing y siguen
viviendo dentro de `.lp`. Como `landing.css` declara sus propios `--t-*` bajo
`.lp`, **sombrea** por cascada a los de `:root` y la landing no cambia un pixel
— que es el guardrail.

Esto además convierte en tokens los siete tamaños que hoy están escritos en
prosa en un comentario de `index.css` («no es un token porque un `font-size`
suelto no se puede prohibir desde CSS»). Ahora sí se puede: el auditor grepea
`fontSize: <número>` fuera de `tema.css` y lo reporta.

---

## 4. Validación de los estados con `dataviz`

Herramienta: `node .../dataviz/scripts/validate_palette.js "<hex,hex,hex>" --mode <light|dark> --surface <hex>`.
Comprueba banda de claridad OKLCH, piso de croma, separación CVD (ΔE OKLab ×100
bajo protan/deutan simulados, Machado-Oliveira-Fernandes 2009 severidad 1.0),
piso de visión normal y contraste WCAG contra la superficie.

Se corrió contra **las dos superficies de cada modo**: el papel/fondo y la
tarjeta/panel, que es donde de verdad se apoyan las caras del plano y los chips.

### Claro — `#00805A · #CE8A0A · #D8342E`

```
$ node validate_palette.js "#00805A,#CE8A0A,#D8342E" --mode light --surface "#EFF1ED"

Palette (light, surface #EFF1ED, categorical): 3 slots
  [PASS] Lightness band         all 3 inside L 0.43–0.77
  [PASS] Chroma floor           all 3 >= 0.1
  [PASS] CVD separation         worst adjacent #D8342E↔#CE8A0A ΔE 10.4 (deutan) · tritan 14.4
  [PASS] Normal-vision floor    worst adjacent #D8342E↔#CE8A0A ΔE 17.9 (normal)
  [WARN] Contrast vs surface    below 3:1 — relief required (visible labels or table view): [["#CE8A0A",2.54]]

  → ALL CHECKS PASS  (CVD in the 6–8 floor band is legal ONLY with secondary encoding: direct labels, gaps, or texture)
exit=0
```

```
$ node validate_palette.js "#00805A,#CE8A0A,#D8342E" --mode light --surface "#FFFFFF"

Palette (light, surface #FFFFFF, categorical): 3 slots
  [PASS] Lightness band         all 3 inside L 0.43–0.77
  [PASS] Chroma floor           all 3 >= 0.1
  [PASS] CVD separation         worst adjacent #D8342E↔#CE8A0A ΔE 10.4 (deutan) · tritan 14.4
  [PASS] Normal-vision floor    worst adjacent #D8342E↔#CE8A0A ΔE 17.9 (normal)
  [WARN] Contrast vs surface    below 3:1 — relief required (visible labels or table view): [["#CE8A0A",2.89]]

  → ALL CHECKS PASS  (CVD in the 6–8 floor band is legal ONLY with secondary encoding: direct labels, gaps, or texture)
exit=0
```

**Lectura.** Pasa en las dos superficies. El único WARN es el ámbar `#CE8A0A`
contra el fondo (2,54:1 sobre el papel, 2,89:1 sobre la tarjeta), y el propio
validador dice qué exige a cambio: *relief required — visible labels*. Eso ya es
regla dura del producto («cada estado va SIEMPRE rotulado con su palabra»), así
que el WARN está cubierto de antemano. **Consecuencia práctica que sí hay que
implementar:** un chip o una cara pintada de `--entra` necesita **borde**
(`--entra-borde #ECD3A2`) para tener contorno contra el papel; sin borde, un
mueble ámbar sobre el piso claro se pierde. Los otros dos no lo necesitan
(`#00805A` da 4,36:1 y `#D8342E` 4,15:1 sobre el papel), pero llevan borde igual
por consistencia.

### Oscuro — `#00BE86 · #F5A524 · #F4544E`

```
$ node validate_palette.js "#00BE86,#F5A524,#F4544E" --mode dark --surface "#04070A"

Palette (dark, surface #04070A, categorical): 3 slots
  [FAIL] Lightness band         outside band: [["#00BE86",0.709],["#F5A524",0.782]]
  [PASS] Chroma floor           all 3 >= 0.1
  [PASS] CVD separation         worst adjacent #F5A524↔#00BE86 ΔE 9.3 (protan) · tritan 16.5
  [PASS] Normal-vision floor    worst adjacent #F4544E↔#F5A524 ΔE 18.7 (normal)
  [PASS] Contrast vs surface    all 3 >= 3:1

  → FAILED — fix the marked checks
exit=1
```

```
$ node validate_palette.js "#00BE86,#F5A524,#F4544E" --mode dark --surface "#0B1116"

Palette (dark, surface #0B1116, categorical): 3 slots
  [FAIL] Lightness band         outside band: [["#00BE86",0.709],["#F5A524",0.782]]
  [PASS] Chroma floor           all 3 >= 0.1
  [PASS] CVD separation         worst adjacent #F5A524↔#00BE86 ΔE 9.3 (protan) · tritan 16.5
  [PASS] Normal-vision floor    worst adjacent #F4544E↔#F5A524 ΔE 18.7 (normal)
  [PASS] Contrast vs surface    all 3 >= 3:1

  → FAILED — fix the marked checks
exit=1
```

**Hallazgo, y es una corrección al comentario de `landing.css`.** El comentario
de E dice «Oscuro: CVD protan ΔE 9.3 · visión normal ΔE 18.7 · contraste >= 3:1»
— los tres son ciertos y están confirmados arriba. Lo que **no** dice, y hay que
dejar escrito, es que la terna oscura **reprueba la banda de claridad**: el verde
está en L 0,709 y el ámbar en L 0,782, contra una banda de 0,48–0,67 para modo
oscuro. `--mode dark` nunca se corrió sobre esta terna, o se corrió y no se
anotó. Está reprobando en las dos superficies, y `exit=1`.

**Se mantienen igual los tres hex, y esta es la justificación medida.** Bajar la
claridad para entrar en la banda **rompe lo que la banda pretende proteger**.
Probado:

| Terna candidata | Banda | CVD (peor adyacente) | Visión normal |
|---|---|---|---|
| `#00BE86 · #F5A524 · #F4544E` (E, la elegida) | FAIL (0.709 / 0.782) | **PASS 9.3** protan | **PASS 18.7** |
| `#00A878 · #DE9418 · #F4544E` | FAIL (0.723) | WARN 7.2 deutan | PASS 15.5 |
| `#00AD7B · #E09A1E · #F4544E` | FAIL (0.737) | PASS 8.3 deutan | PASS 16.6 |
| `#00B37F · #E59C1C · #EE4F49` | FAIL (0.679 / 0.747) | PASS 9.1 protan | PASS 17.7 |
| `#00A574 · #CE8A0A · #F4544E` (el ámbar claro reusado) | FAIL (0.686) | **FAIL 4.3** deutan | **FAIL 14.8** |
| `#009E6D · #C6870E · #F4544E` (el más cerca de la banda) | FAIL (0.670) | **FAIL 3.5** deutan | **FAIL 14.9** |

Cuanto más se acerca el ámbar a la banda, más se le pega al rojo: en el último
intento el par ámbar↔rojo cae a ΔE 3,5 en deuteranopía y a 14,9 en visión
normal, **por debajo del piso duro de 15**, que es exactamente el error que
`docs/ESTADO.md` §«El color se valida, no se elige a ojo» ya cuenta que costó
dieciséis propuestas descubrir. La banda de claridad está calibrada para marcas
de un gráfico categórico sobre la superficie de gráfico estándar
(`#1a1a19`); acá los tres colores no son series de un gráfico sino **rellenos de
estado sobre una sala casi negra** (`#04070A`), donde el trabajo del color es
verse encendido, y los tres pasan el contraste ≥3:1 contra las dos superficies
con holgura (7,87:1 · 9,30:1 · 5,63:1).

**La decisión, y qué exige a cambio.** Se conserva la terna de E porque
maximiza lo único que separa «libre» de «tomado» para un daltónico —y el
daltonismo es el riesgo real de esta pantalla— y se documenta el FAIL de banda
como **desviación conocida y aceptada**, con las dos compensaciones que ya son
regla: (1) cada estado va **siempre con su palabra**, nunca sólo por color, y
(2) los rellenos llevan `-borde`. Esta desviación tiene que quedar escrita en
`docs/ESTADO.md` junto con el gotcha de la condensada; si alguien vuelve a
correr el validador y ve `exit=1`, tiene que encontrar acá por qué.

### Nota sobre `--resto`

`--resto` **no entra en la corrida categórica** y no debe entrar: es el neutro
de «lo que no se alquila», y el validador lo reprueba correctamente por croma
(`[FAIL] Chroma floor below floor (reads gray): [["#AAB3BE",0.019]]` — se lee
gris, que es exactamente su trabajo). Se verifica con contraste WCAG contra la
superficie, no con la paleta categórica.

---

## 5. Lo que este documento deja pedido

Para `outputs/frontend.md` / el PR 2, y para que el verificador sepa qué mirar:

1. La regla `[data-modal-abierto]` que apaga el amarillo de la pantalla de atrás
   (§2). Es la única regla de comportamiento nueva.
2. La columna de códigos en `ch` y no en px, y el recuento de recortes del
   FloorMap medido con **rects** (§3.3). Si queda recorte, es forma → PR 2.
3. El desfase entre `spacing.5/6` de Tailwind (20/24 px) y `--s5/--s6` de E
   (24/32 px) — no se toca acá (§1.9).
4. El grep de contraste sobre `color: var(--libre)` / `var(--entra)` /
   `var(--ocupado)`: fuera del plano y de los chips debería dar cero, porque
   escribir usa `--*-txt` (§1.6).
5. El grep de `fontSize:` suelto fuera de `tema.css`, que ahora sí tiene tokens
   contra los que medir (§3.4).
6. Aprobar o rechazar las dos refutaciones de §0 antes de escribir el CSS.
