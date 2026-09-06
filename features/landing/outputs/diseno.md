# Diseño de la landing de RECABRA

Insumo: `features/landing/outputs/copy.md` y `features/landing/spec.md`. Nada más — sin capturas de
la aplicación, sin la paleta actual, sin los tokens `--con-*`. Es la indicación de la spec (§Orden de
trabajo, punto 2).

Entregables de esta fase:

- este documento — dirección visual, tokens y especificación sección por sección;
- `outputs/prototipo/index.html` — prototipo estático, autocontenido, con el copy real y el plano
  isométrico funcionando (zoom, arrastre, ficha, «Ver en 3D»). Se abre con doble clic, sin servidor
  y sin red.

Lo que sigue está escrito para que el frontend pueda construir sin volver a decidir nada visual, y
para que el dueño pueda tachar lo que no le sirva antes de que se construya.

---

## 1. Concepto: **«Planta y tinta»**

### 1.1 La idea en una frase

> La página no *habla* de un plano: **es** un plano. Una hoja técnica de un supermercado, dibujada a
> tinta sobre papel, donde lo único que tiene color es lo que se vende.

### 1.2 De dónde sale

El copy define el producto con una frase que también sirve de brief visual: *«Qué mueble está libre,
quién lo ocupa, a cuánto y hasta cuándo»*. Es una pregunta **espacial** (qué mueble, dónde) y
**contable** (a cuánto, hasta cuándo). Las dos cosas viven juntas en un único artefacto real que
todos los gerentes de retail ya conocen: **el plano de la sala colgado en la oficina de atrás, con
anotaciones a mano**. La landing toma ese objeto y lo vuelve interactivo.

De ahí salen las tres decisiones de fondo:

1. **El plano es el héroe, no una ilustración de apoyo.** Ocupa la mitad derecha del hero y se puede
   tocar en el primer segundo. La spec ya lo declara vinculante; el diseño lo lleva más lejos: el
   lenguaje del plano (isometría, grises, códigos en monoespaciada, marcas de registro) se derrama
   sobre el resto de la página. Las tramas de fondo del hero y del cierre son la misma retícula
   isométrica del plano, desvanecida.
2. **El color es escaso porque el inventario es escaso.** El copy lo dice explícitamente
   (§13, regla 1): *«si todo el piso está pintado, no se entiende que lo que se vende es escaso, que
   es justamente el argumento»*. La página aplica esa misma economía a sí misma: **el 95 % de la
   superficie es papel, tinta y gris**; los únicos colores saturados son los cuatro estados del plano
   y un ultramar reservado exclusivamente para acciones. Un gerente que llega no ve una web
   colorida: ve una hoja seria con seis manchas de color, y las manchas son plata.
3. **Nada decorativo.** Cada elemento gráfico que no sea tipografía o línea tiene que explicar algo
   del producto: la cuenta del plazo, los tres correos sobre la línea de 30/15/6 días, las dos caras
   de la misma góndola con colores distintos, el hueco en la línea de tendencia. El copy §14 prohíbe
   prometer lo que no existe; el diseño extiende esa regla a las imágenes: **no se dibuja lo que el
   producto no hace**.

### 1.3 Mood

| Sí | No |
|---|---|
| Hoja técnica, papel de obra, mesa de luz | Ilustración 3D corporativa, gente sonriendo, mockups de laptop |
| Grafito, ultramar, líneas de 1 px | Degradados morados, glassmorfismo por todos lados, «AI glow» |
| Monoespaciada para códigos y plata | Tipografía de display «friendly» |
| Silencio y aire | Iconos por todos lados, cajas con sombra flotante |
| Un solo gesto de color por bloque | Cada tarjeta de un color distinto |

**Referencia mental** (para calibrar, no para copiar): planos de arquitectura de sala, cuadernos de
levantamiento, catálogos de mobiliario comercial, la señalética de un centro de distribución. Cosas
que existen para que alguien tome una decisión, no para gustar.

### 1.4 Voz visual y marca

El copy fija la voz escrita (voseo neutro, frases cortas, cero jerga). La contraparte visual es:

- **Logotipo:** `RECABRA` en versales, **monoespaciada**, tracking `+0.20em`. La monoespaciada no es
  un guiño «tech»: es la fuente en la que la propia aplicación escribe los códigos (`PUN-01`,
  `GON-04·A`). La marca queda escrita en el mismo idioma que el inventario.
- **Símbolo:** un cubo isométrico con **una sola cara pintada** (`#mk` en el prototipo). Es
  literalmente el modelo del producto: un mueble tiene caras, y una cara se vende. Sirve a 16 px.
- **Tono de las etiquetas:** todas las etiquetas menores (antetítulos, numeración de sección, pies de
  tarjeta) van en monoespaciada, versales y tracking amplio. Los títulos y el cuerpo van en la
  sans del sistema. Dos voces, ninguna fuente descargada.

---

## 2. Restricciones que el diseño respeta (y cómo)

| Restricción de la spec | Cómo la cumple este diseño |
|---|---|
| Claro y oscuro | Dos juegos completos de tokens semánticos. El oscuro no es un invertido: se re-eligió cada paso (§3). |
| 360 → 1920 px | Retícula fluida, tipografía con `clamp()`, tres puntos de quiebre reales (720 / 1080 / 1440). |
| Sin fuentes ni recursos externos (CSP) | **Cero `@font-face`, cero `@import`, cero imágenes.** Pila de fuentes del sistema + monoespaciada del sistema. Todo el arte es SVG/CSS escrito en la página. |
| Sin librerías nuevas de animación | Solo transiciones CSS, `IntersectionObserver` y un `requestAnimationFrame` para la transición a 3D. |
| `prefers-reduced-motion` | Un bloque global apaga transiciones y animaciones y deja los estados finales visibles; el 3D conmuta de golpe en lugar de interpolar. |
| LCP < 2,5 s en móvil | El LCP es el `<h1>`: texto puro, con la fuente del sistema, sin bloqueo. El plano se dibuja después del primer pintado y **no reserva ninguna descarga**. Detalle en §7. |
| Cero llamadas a `/api/*` | Los 16 espacios y los ~30 muebles de contexto están sembrados en una constante del propio archivo. |

---

## 3. Tokens

Tres capas, como pide `design-system`: **primitivo → semántico → componente**. En el prototipo están
todas en `:root`; en la aplicación conviene el mismo orden con prefijo propio para no chocar con los
`--con-*` existentes (ver §9, decisiones abiertas).

### 3.1 Primitivos — papel, tinta, noche

```
/* papel (claro) */
--p-paper-50 #FFFDF8   --p-paper-100 #F7F4EE   --p-paper-200 #EFEBE2   --p-paper-300 #E4DED1
--p-paper-400 #DED8CC  --p-paper-500 #C6BFB0   --p-paper-600 #A8A197

/* tinta */
--p-ink-900 #12151A    --p-ink-800 #1A1C22     --p-ink-700 #252932    --p-ink-600 #3A404B
--p-ink-500 #4C5059    --p-ink-400 #767B85     --p-ink-300 #A6ACB8    --p-ink-200 #C9CDD5

/* noche (oscuro) */
--p-night-950 #0B0E13  --p-night-900 #0E1116   --p-night-850 #12151A  --p-night-800 #161A21
--p-night-700 #1D222B  --p-night-600 #262C36   --p-night-500 #39414E
--p-bone-100 #ECEAE4

/* ultramar — el único color de acción */
--p-ultra-700 #2620A8  --p-ultra-600 #2F2AC0   --p-ultra-500 #3A34D6  --p-ultra-400 #6B66EA
--p-ultra-300 #8E92FF  --p-ultra-200 #B9BBFF   --p-ultra-100 #E9E8FF  --p-ultra-950 #1B1E3A
```

**Por qué el papel es cálido y la tinta es fría.** El fondo `#F7F4EE` tiene un punto de amarillo:
sobre él, los cuatro estados —verde, ámbar, rojo, gris— se leen más separados que sobre blanco puro,
y la página no tiene el brillo de pantalla de una web genérica. La tinta, en cambio, es levemente
azulada: sostiene el ultramar sin que el conjunto se vuelva sepia.

**Por qué ultramar y no verde, naranja o rojo.** Los tres colores obvios de una marca de retail ya
están ocupados por los estados del plano. Si el botón «Crear mi cuenta» fuera verde, competiría con
«Libre todo el periodo» y rompería la regla más importante de la página: *el color significa estado
del espacio*. El ultramar (`#3A34D6`) no puede confundirse con ningún estado, tiene contraste
sobrado en blanco (**7,95:1**) y lee como tinta de plano.

### 3.2 Semánticos

| Token | Claro | Oscuro | Uso |
|---|---|---|---|
| `--bg` | `#F7F4EE` | `#0E1116` | fondo de página |
| `--bg-sunken` | `#EFEBE2` | `#0B0E13` | bandas hundidas, interior de artefactos |
| `--surface` | `#FFFDF8` | `#161A21` | tarjetas, barras del plano |
| `--surface-2` | `#EFEBE2` | `#1D222B` | pistas, barras internas |
| `--ink` | `#1A1C22` | `#ECEAE4` | texto principal |
| `--ink-2` | `#4C5059` | `#A6ACB8` | texto secundario, cuerpo largo |
| `--ink-3` | `#767B85` | `#7B828E` | etiquetas, ejes, notas |
| `--line` | `#DED8CC` | `#262C36` | bordes de tarjeta |
| `--line-strong` | `#C6BFB0` | `#39414E` | bordes con peso, separadores de cuenta |
| `--line-hair` | `rgba(26,28,34,.10)` | `rgba(255,255,255,.09)` | reglas de hoja, divisiones internas |
| `--accent` | `#3A34D6` | `#8E92FF` | acción, foco, enlaces |
| `--accent-strong` | `#2F2AC0` | `#B9BBFF` | hover del primario |
| `--on-accent` | `#FFFFFF` | `#0E1116` | texto sobre acción |
| `--ring` | `#3A34D6` | `#8E92FF` | anillo de foco |

Contrastes verificados (WCAG AA para texto normal, 4,5:1):

| Par | Ratio |
|---|---|
| `--ink` sobre `--bg` (claro) | 15,5:1 |
| `--ink-2` sobre `--bg` (claro) | 5,8:1 |
| blanco sobre `--accent` (claro) | 7,95:1 |
| `--ink` sobre `--bg` (oscuro) | ~14:1 |
| `--ink-2` sobre `--bg` (oscuro) | 8,0:1 |
| `--accent` sobre `--bg` (oscuro) | 6,7:1 |

### 3.3 Los cuatro estados del plano

Es el sistema de color más importante de la página, porque el copy (§11.3) obliga a que sea **el
mismo idioma que la aplicación por dentro**. Cada estado tiene tres caras (la isometría necesita
tres tonos por sólido), un punto para las fichas y la leyenda, un tinte de fondo y un tono de texto.

**Claro**

| Estado | Cara superior | Cara izquierda | Cara derecha | Punto | Tinte | Texto sobre tinte |
|---|---|---|---|---|---|---|
| Libre todo el periodo | `#1BA97B` | `#12855F` | `#0C6247` | `#0E8A63` | `#DFF0E7` | `#0A5C41` |
| Se libera en el periodo | `#F0A63C` | `#D98A24` | `#B06B18` | `#E8992B` | `#FBEBD4` | `#8A5307` |
| Tomado | `#D6394F` | `#B92A3E` | `#8F1E2E` | `#C3283F` | `#F9E1E3` | `#8E1F2F` |
| Resto de la sala | `#CFC9BC` | `#B8B1A2` | `#9A9384` | `#A8A49B` | `#E7E3DA` | `#5F5A50` |

**Oscuro**

| Estado | Cara superior | Cara izquierda | Cara derecha | Punto | Tinte | Texto sobre tinte |
|---|---|---|---|---|---|---|
| Libre todo el periodo | `#2FBE8B` | `#1F9670` | `#146B50` | `#22A87A` | `#0F2A22` | `#6FE0B4` |
| Se libera en el periodo | `#E7AE4E` | `#C68C33` | `#95661F` | `#DDA13A` | `#2E2413` | `#F0C079` |
| Tomado | `#EE6A7B` | `#C94A5C` | `#93313F` | `#E45C6E` | `#2E1519` | `#FF98A4` |
| Resto de la sala | `#4E5560` | `#3E444E` | `#2F343C` | `#6C7480` | `#1B1F26` | `#9AA2AE` |

**Validación.** Los tres estados que llevan color se pasaron por el validador de paleta de la skill
`dataviz` (`validate_palette.js`, seis comprobaciones: banda de luminosidad, piso de croma,
separación bajo daltonismo, piso de visión normal, contraste contra la superficie).

- **Claro, sobre papel `#F7F4EE`** — `#0E8A63 · #E8992B · #C3283F`: pasa banda, croma, separación CVD
  (peor par ámbar↔verde ΔE 14,1 protan, muy por encima del piso de 8) y piso de visión normal
  (ΔE 25,6). El ámbar queda por debajo de 3:1 contra el papel → **exige relieve**, y lo tiene: el
  copy obliga a escribir la palabra del estado al lado del punto en cada ficha y en la leyenda
  (regla 7 del copy), y además existe la tabla equivalente. La condición del validador está cumplida
  por diseño, no por descuido.
- **Oscuro, sobre `#12151A`** — `#22A87A · #DDA13A · #E45C6E`: pasa croma, separación CVD, piso de
  visión normal y contraste ≥ 3:1. **Desviación registrada:** el ámbar cae en L 0,749 y la banda de
  modo oscuro del validador termina en 0,67. Se aceptó a propósito: bajarlo hasta la banda degrada
  la separación CVD hasta el piso de 7,6 y lo vuelve barro sobre el fondo nocturno. Es una paleta de
  **estado**, no de series de un gráfico —cada estado viaja siempre con su palabra— y las otras
  cuatro comprobaciones pasan. Si el dueño prefiere el cumplimiento estricto, el reemplazo es
  `#CE9231`, con la pérdida de nitidez descrita.

El gris de «Resto de la sala» está deliberadamente **por debajo del piso de croma**: tiene que leerse
como material, no como categoría. Es el fondo contra el cual el color significa dinero.

### 3.4 Tipografía — sin una sola descarga

```
--f-sans: ui-sans-serif, system-ui, -apple-system, "Segoe UI Variable Text", "Segoe UI",
          Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif;
--f-mono: ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas,
          "Liberation Mono", "DejaVu Sans Mono", monospace;
```

La CSP prohíbe fuentes externas y empaquetar una familia propia obliga a tocar la CSP en el mismo PR
(nota del copy §1). El diseño resuelve el problema convirtiéndolo en decisión: **la landing usa la
tipografía del sistema operativo del que mira**. En macOS/iOS es SF Pro, en Windows Segoe UI
Variable, en Android Roboto — tres tipografías de altísima calidad, con render nativo,
**cero bytes, cero FOIT, cero riesgo de CLS por fuente**, y son las mismas que el lector ya usa para
leer todo lo demás. La personalidad no la pone la fuente: la ponen el tamaño, el tracking negativo de
los titulares, y el contrapunto de la monoespaciada.

**Escala** (fluida; los valores son el par mínimo → máximo de `clamp()`):

| Rol | Tamaño | Interlínea | Tracking | Peso |
|---|---|---|---|---|
| Display / H1 | 2,35 → 4,40 rem | 1,01 | −0,042em | 640 |
| H2 de sección | 1,85 → 3,05 rem | 1,04 | −0,030em | 640 |
| H3 de tarjeta | 1,12 → 1,42 rem | 1,15 | −0,025em | 640 |
| Bajada / lead | 1,05 → 1,28 rem | 1,55 | −0,005em | 400 |
| Cuerpo | 1 rem (16 px) | 1,62 | 0 | 400 |
| Cuerpo chico | 0,875 rem | 1,55 | 0 | 400 |
| Etiqueta mono (antetítulo, pie de tarjeta) | 0,70 → 0,78 rem | 1,50 | **+0,15em**, versales | 500 |
| Código en el plano | 9 px (unidades del SVG) | — | +0,03em | 500 |

**Reglas duras de tipografía**

- Todo lo que sea **código, plata, fecha corta o porcentaje** va en `--f-mono` con
  `font-variant-numeric: tabular-nums`. Es la regla que hace que `$ 1.300.000` y `$ 240.000` se
  alineen en una columna y que la ficha no salte de ancho al cambiar de mueble.
- El cuerpo nunca pasa de **~70 caracteres** por línea (`.narrow`, `max-width` en `ch`).
- Los titulares usan `text-wrap: balance`.
- Nunca versales en el cuerpo. Solo en etiquetas mono de menos de 6 palabras.

### 3.5 Espaciado, retícula, radios, sombras

**Espaciado** (escala de 4, densidad «estándar» de la skill):
`4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96 · 128 · 168`.
Ritmo vertical: separación entre secciones `clamp(64px, 9vw, 128px)`; entre encabezado de sección y
contenido `clamp(32px, 4vw, 48px)`; dentro de una tarjeta, `12/16`.

**Retícula:** contenedor `max-width: 1240px`, márgenes laterales `clamp(20px, 5vw, 56px)`. Doce
columnas implícitas mediante `grid-template-columns` por sección; el bento de «Lo que hace» usa 6
columnas para poder pedir 3+3, 2+2+2 y 6.

**Radios:** `0` (caras del plano — un mueble no tiene esquinas redondeadas), `3` (chips, filas),
`6` (tarjetas del plano, artefactos), `10` (tarjetas grandes, mesa de luz), `999` (botones). Los
radios son cortos a propósito: es una hoja, no una app de consumo.

**Sombras** (dos niveles y medio, nada más):

```
--shadow-1: 0 1px 2px rgba(26,28,34,.05)
--shadow-2: 0 14px 34px -22px rgba(26,28,34,.45), 0 2px 6px rgba(26,28,34,.05)
--shadow-3: 0 34px 70px -40px rgba(26,28,34,.55), 0 3px 10px rgba(26,28,34,.06)
```

`--shadow-3` se usa **una sola vez en toda la página**: bajo la mesa de luz del plano. Es lo que la
levanta del papel y la vuelve el objeto principal. En oscuro las sombras se profundizan a negro puro
en lugar de aclararse.

### 3.6 Movimiento

```
--t-fast   120ms   /* respuesta táctil, hover de color */
--t-base   220ms   /* estados de componente */
--t-slow   420ms   /* entradas, revelados */
--t-scene  700ms   /* la transición del plano a 3D */
--e-standard  cubic-bezier(.2,.7,.2,1)     /* general */
--e-enter     cubic-bezier(.16,.84,.28,1)  /* algo que llega: desacelera */
--e-exit      cubic-bezier(.5,0,.75,0)     /* algo que se va: acelera */
```

Reglas:

1. **Solo `transform` y `opacity`.** Nada de animar `width`, `height`, `top` o `left`.
2. **Una o dos cosas por vista.** El revelado por scroll mueve el bloque, no cada palabra.
3. **La salida es más rápida que la entrada** (~65 %).
4. **El movimiento explica algo.** El mueble que sube al pasarle el mouse dice «esto se puede tocar».
   La transición a 3D dice «es la misma tienda, vista desde más abajo». Nada se mueve por adorno.
5. **`prefers-reduced-motion: reduce`** apaga transiciones y animaciones globalmente, deja todos los
   elementos revelados en su estado final y convierte la transición a 3D en un salto instantáneo.
   El copy prevé incluso un aviso opcional («Animaciones reducidas, como pediste en tu sistema»); el
   prototipo no lo muestra para no meter ruido, pero el texto está disponible si el dueño lo quiere.

---

## 4. La puesta en escena del plano isométrico

Es la pieza que hace distinta a esta página, así que va especificada al detalle.

### 4.1 Qué se ve

Una **mesa de luz**: un panel con borde de 1 px, radio 10, sombra `--shadow-3`, fondo de un papel un
punto más frío que la página, con **marcas de registro** (crop marks) en las cuatro esquinas y un
brillo suave arriba en `mix-blend-mode: soft-light`. Parece una lámina apoyada sobre la página, no un
`<div>`.

Estructura del panel, de arriba abajo:

1. **Barra superior.** A la izquierda el rótulo del copy, dentro de una píldora con un punto
   ultramar: `Supermercado de ejemplo · Tocá un mueble`. A la derecha, cuatro controles:
   `+` (Acercar), `−` (Alejar), `Centrar`, `Ver en 3D`. En pantallas táctiles los botones crecen a
   44 × 44 px.
2. **Escena.** Relación 16:11 en escritorio, 4:3,4 en móvil. `overflow: hidden`, cursor `grab` /
   `grabbing`.
3. **Pie.** La leyenda de los cuatro estados (píldoras con rombo de color + la palabra completa) y, a
   la derecha, la línea de ayuda que cambia según el dispositivo y el foco.
4. Debajo del panel, la nota chica del copy y un `<details>` con la **tabla equivalente**
   («Los mismos datos del plano, en tabla»), generada del mismo arreglo de datos.

**La escena.** Dos sedes en la misma lámina: **CENTRO** grande al frente y **PALMAS** más chica,
detrás y arriba a la derecha, cada una con su rótulo en monoespaciada versalita sobre una regla
corta. Que se vean dos sedes en un solo dibujo cuenta, sin escribirlo, la frase del copy
«manejás todas tus sedes desde la misma cuenta». En el encuadre inicial se ve CENTRO entera y PALMAS
asomando: hay algo más allá del borde, y eso es lo que invita a arrastrar.

**La proyección** es isometría 2:1 (dimetría de juego): `sx = (x − y)·U`,
`sy = ((x + y)·0,5 − z·0,66)·U`, con `U = 13`. Se eligió 2:1 sobre la isometría verdadera de 30°
porque las corridas de góndola quedan con ángulos más limpios y los códigos se leen mejor.

**Cada mueble** es un prisma dibujado con tres polígonos —cara superior, cara izquierda (sur) y cara
derecha (este)— con los tres tonos del estado, contorno de 0,6 px con `vector-effect:
non-scaling-stroke` (el contorno no engorda al acercar). Orden del pintor: primero los pisos, después
los cuerpos ordenados por `x + y` ascendente.

**Lo que la escena tiene que enseñar sin texto** (las reglas del copy §13, traducidas a dibujo):

- **El gris es mayoría.** ~30 muebles de contexto (cuatro corridas de góndola, la pared de
  refrigerados partida en dos, siete cajas, dos mostradores, nueve columnas) contra 16 de color.
- **`GON-04·A` y `GON-04·B` son la misma corrida partida en dos tiras de 0,8 de profundidad,
  pintadas de rojo y de verde.** Es el único lugar de toda la página donde se entiende de un vistazo
  que una góndola son dos espacios. Vale por un párrafo.
- **Los códigos son cortos** (`PUN-01`) y aparecen sobre la cara superior al pasar el mouse, al
  enfocar con teclado y en la vista 3D; el nombre de la sede va aparte, en el rótulo del piso.
- **Los 16 alquilables están repartidos**: no hay un rincón de verdes; el rojo y el ámbar están en
  las zonas buenas (entrada, cabeceras, refrigerados), que es como funciona de verdad.

### 4.2 Cómo se mueve

| Gesto | Comportamiento |
|---|---|
| Rueda del mouse | Zoom hacia el puntero, factor 1,14 por paso, límites 0,5×–4,5×. **Se arma con el primer clic o foco sobre el plano**: mientras no lo tocaste, la rueda hace scroll de la página como en cualquier otra sección, y al sacar el mouse del panel se desarma. Un plano en un hero nunca debe secuestrar el scroll |
| Arrastre con el mouse | Paneo 1:1 sobre el punto agarrado (la escena no «se desliza» de la mano) |
| Pinza (dos dedos) | Zoom sobre el punto medio entre los dedos |
| Arrastre táctil | Paneo. `touch-action: pan-y`: **un deslizamiento vertical hace scroll de la página**, uno horizontal panea el plano. El plano no secuestra el scroll del teléfono |
| `+` / `−` / `Centrar` | Zoom sobre el centro del encuadre; `Centrar` vuelve al encuadre inicial y cierra la ficha |
| Teclado sobre el marco | Flechas panean, `+` / `−` acercan y alejan, `Home` centra, `Esc` cierra la ficha |
| `Tab` | Recorre los 16 muebles alquilables; cada uno abre su ficha al recibir el foco |
| `Enter` / espacio sobre un mueble | Fija la ficha |

**Micro-movimiento.** Al pasar el mouse o al enfocar, el mueble **sube 5 px** (`transform:
translateY(-5px)`, 180 ms) y aparece su código. Es el gesto entero del producto en una animación: el
mueble se despega del piso porque es una cosa que se puede tomar. Al enfocar con teclado, además, el
contorno pasa a 2,4 px en ultramar.

**El primer gesto se enseña solo.** A los 700 ms de cargar se abre la ficha de `PUN-02` —el que se
libera el 26, elegido en el copy §13.6— y la pieza da **dos pulsos** de 1,5 s. Nadie tiene que
adivinar que el plano se toca. Se cierra al primer clic en cualquier otro lado. Con
`prefers-reduced-motion`, la ficha se abre de inmediato y sin pulso.

### 4.3 La ficha

Panel de 264 px, superficie de tarjeta, borde `--line-strong`, `--shadow-3`, radio 6. Se coloca
**encima del mueble** y se reposiciona sola si no entra (pasa abajo, y siempre queda dentro del
panel). En móvil (≤ 720 px) deja de flotar: se convierte en una **hoja fija abajo** con un botón
`Cerrar` de ancho completo, porque un panel flotante bajo el dedo no se ve.

Contenido y orden exactos del copy §11.2, sin variantes:

```
GON-04·A                        ← código, monoespaciada, 1rem, peso 600
Góndola, por cara               ← tipo del catálogo, 0,82rem, --ink-2
Pasillo 3 · sede CENTRO         ← ubicación en palabras · sede, 0,78rem, --ink-3
────────────────────────────────  ← regla de 1 px --line-hair
● Tomado                        ← punto de 9 px + LA PALABRA, siempre
Lácteos Monteverde              ← proveedor de ejemplo
$ 1.100.000 al mes              ← canon, monoespaciada tabular, 0,95rem
hasta el 28 sep                 ← fecha corta
────────────────────────────────
PROVEEDOR Y VALORES DE EJEMPLO  ← mono, versales, 0,68rem, --ink-3
```

Variantes por estado, tal como las fija el copy: `Libre todo el periodo` → `Tarifa de referencia` +
valor; `Se libera en el periodo` → proveedor + canon + `libre desde el …`; `Tomado` → proveedor +
canon + `hasta el …`; `Resto de la sala` → `No se alquila. Es parte del local.` sin pie de ejemplo.

El punto de color **nunca viaja solo**: siempre lleva la palabra al lado. Es la regla 7 del copy y la
condición bajo la cual el ámbar de bajo contraste es aceptable.

### 4.4 «Ver en 3D»

La transición no es un cambio de pantalla: es un **movimiento de cámara sobre la misma escena**.
Cuatro parámetros se interpolan a la vez durante 700 ms con `requestAnimationFrame` y curva
`easeOutCubic`:

| Parámetro | Plano | 3D | Qué hace |
|---|---|---|---|
| `uy` (escorzo del piso) | 0,50 | 0,34 | la cámara baja: el piso se aplasta |
| `uz` (altura) | 0,66 | 1,50 | los muebles se estiran hacia arriba |
| `hMul` (altura de los alquilables) | 1,00 | 1,50 | lo que se vende crece más que el resto |
| `ctx` (opacidad del contexto) | 1,00 | 0,32 | la sala se apaga y quedan los muebles |

Además aparecen todos los códigos y el contexto deja de recibir eventos. El botón cambia a
`Volver al plano` con `aria-pressed`, y la línea de ayuda cambia sola.

**La espera es honesta.** Antes de animar, el botón se deshabilita y dice `Cargando la vista 3D…`
durante ~420 ms. En el prototipo esa espera es simulada; en la aplicación es el tiempo real del
`import()` de three.js, que la spec exige que sea perezoso. El diseño ya reservó el estado y el
texto, así que el frontend no tiene que inventarlo.

**Sobre qué es realmente el 3D de la landing.** Este prototipo hace la transición con la misma
isometría SVG, sin three.js. Es una decisión de diseño defendible por sí sola: pesa cero, no puede
fallar, funciona en cualquier teléfono y comunica lo mismo. Si el dueño quiere el three.js real, lo
que este documento entrega igual es la coreografía —qué se mueve, en qué orden, cuánto dura, qué dice
el botón mientras carga— y los tres estados de error del copy §11.4 (`No pudimos abrir la vista 3D…`,
`Este navegador no puede mostrar la vista 3D…`, con la acción `Volver al plano`). Ver §9.

### 4.5 Cuando el plano no está

- **No se pudo dibujar:** el panel muestra el texto del copy `No pudimos dibujar el plano de ejemplo.
  El resto de la página funciona igual.` y un botón `Reintentar`. La leyenda, la nota y la tabla
  equivalente **siguen visibles**: la sección no se cae.
- **Sin JavaScript:** el `<figcaption>` con la descripción larga y la tabla equivalente ya están en el
  HTML. La página se puede leer entera.
- **Lector de pantalla:** el marco lleva el `aria-label` del copy §11.5, la descripción larga va en
  un `<figcaption>` visualmente oculto referenciado con `aria-describedby`, cada mueble alquilable
  anuncia `código, tipo, sede, estado`, y la tabla equivalente lleva los seis encabezados del copy.

---

## 5. Especificación por sección

Numeración visible de la hoja: `01 Producto · 02 Personas · 03 Puesta en marcha · 04 El diferencial ·
05 Confianza · 06 Precio`. Cada encabezado de sección es: antetítulo mono + regla de 1 px que corre
hasta el margen derecho + H2 + bajada. Es el elemento que sostiene el aire de hoja técnica en toda la
página.

### 5.0 Barra de navegación

Pegajosa, 68 px, fondo del papel al 82 % con `backdrop-filter: blur(14px)`; la línea inferior
aparece recién al hacer scroll (`data-stuck`). Izquierda: símbolo + `RECABRA`. Centro (≥ 900 px):
las cinco anclas del copy §11.6. Derecha: conmutador claro/oscuro, `Ya tengo cuenta` (fantasma) y
`Crear mi cuenta` (sólido). En < 640 px queda solo el CTA primario: en un teléfono, una barra con dos
botones compite consigo misma.

### 5.1 Hero

**Retícula:** una columna hasta 1080 px; arriba de eso `42fr / 58fr` — el texto a la izquierda, el
plano a la derecha y más ancho, porque **el plano tiene que ganar la mirada**.

**Jerarquía de la columna izquierda:**

1. Marca chica (símbolo + `RECABRA` mono) — presencia, no protagonismo.
2. Antetítulo mono: `Espacios comerciales de supermercado`.
3. **H1 a 4,4 rem con tracking −0,042em.** Se compone en dos tonos: `Qué mueble está libre, quién lo
   ocupa,` en `--ink` y `a cuánto y hasta cuándo.` en `--ink-3`. La frase es una lista de cuatro
   preguntas; el cambio de tono hace que se lean como dos respiraciones y no como un bloque.
4. Subtítulo 1 en `lead` (la frase de qué es).
5. Subtítulo 2 **con una barra ultramar de 2 px a la izquierda**, como una anotación al margen: es la
   frase que nombra el dolor («Si hoy eso vive en un Excel…») y merece un gesto distinto del resto.
6. CTAs: `Crear mi cuenta` (sólido, con flecha que avanza 3 px en hover) + `Ya tengo cuenta`
   (fantasma). Altura 48 px.
7. Línea de apoyo en `--ink-3`, ≤ 46ch.

**Fondo:** retícula isométrica de 56 px con máscara radial que se desvanece hacia abajo. Es el papel
milimetrado bajo el dibujo.

**Animación:** las dos columnas entran con `opacity 0 → 1` y `translateY(16px) → 0` en 620 ms al
cruzar el viewport. El plano no espera: se dibuja apenas hay JS.

**LCP:** el `<h1>`. No hay imagen, ni fuente descargada, ni nada que lo bloquee.

### 5.2 «Lo que hace» — bento de seis

Seis bloques, retícula de 6 columnas en ≥ 1120 px:

```
┌───────── 01 (3) ─────────┬───────── 02 (3) ─────────┐
├──── 03 (2) ────┬──── 04 (2) ────┬──── 05 (2) ──────┤
├────────────────── 06 (6, horizontal) ───────────────┤
```

En 760–1120 px pasa a 2 columnas; abajo de 760, a una. Cada tarjeta: índice mono (`01`…`06`), H3,
párrafo del copy, el artefacto que le corresponde y el **pie del bloque** separado por una regla de
1 px, en mono, pegado al fondo de la tarjeta (`margin-top:auto`) para que los seis pies queden
alineados aunque los textos tengan largos distintos. Hover: la tarjeta sube 2 px y el borde se
refuerza.

Los artefactos —esto es lo que hace que no sea una lista de features más:

| Bloque | Artefacto | Qué demuestra |
|---|---|---|
| 01 El plano de tu tienda | Campo de 52 celdas grises con 7 encendidas en verde/ámbar/rojo | La escasez, sin escribir ninguna cifra |
| 02 El contrato sobre el mueble | **La cuenta del plazo**: `Canon mensual $ 1.500.000` / `Plazo 61 días` / **`Total del plazo $ 3.050.000`** con regla arriba, todo en mono tabular | La única cifra que el copy autoriza como ejemplo, tipografiada como una cuenta de verdad |
| 03 Qué hay libre en la temporada | ninguno (tarjeta de solo texto, da aire) | — |
| 04 Tu tarifa y el desvío | `$ 955.000` · `referencia $ 1.150.000` · chip `−17 % vs referencia` en tinte rojo | Cómo se ve el desvío en la aplicación |
| 05 Los avisos salen solos | Tres chips de correo (el de montaje con borde punteado = «sin montos») + línea con tres puntos rotulados `30 días` / `15 días` / `6 días` | Los tres correos y las tres alertas, verificados en §12 del copy |
| 06 El montaje con foto | Teléfono dibujado en CSS: código, ubicación en palabras, mini-plano con un punto rojo pulsante y dos botones `Montado` / `No pude` | La pantalla del mercaderista, sin usar una captura |

Cierre de la sección: la línea del «Y además:» dentro de una caja de **borde punteado** — visualmente
es una nota al pie, no un séptimo bloque.

**Animación:** entrada escalonada de 60 ms por tarjeta (la tarjeta entera, no sus partes).

### 5.3 «Tres personas usan esto»

Tres columnas iguales. Cada perfil es una tarjeta con una **barra vertical de 3 px** en el borde
izquierdo, de distinto color: ultramar (gerente), verde (trabajador de piso), ámbar (proveedor). No
es decorativo: son los tres colores del sistema y sirven de ancla de memoria para el resto de la
página. Dentro: rótulo mono en versales, titular en 1,3 rem, párrafo.

**Los números que vas a tener a la vista.** Cinco casillas en una sola caja con divisiones de 1 px.
Sigue las reglas de `dataviz` para figuras: **una sola cifra protagonista por vista**. Solo
`Ocupación` lleva número —`35 %`, la única verificada en §12 del copy, con `8 de 23 caras vendidas
en el periodo` debajo y una barra que crece de 0 a 35 % al entrar en pantalla—. Las otras cuatro
llevan **rótulo y explicación, sin cifra**: inventar un «canon vigente» sería exactamente lo que el
copy §14.22 prohíbe. La tensión visual entre una casilla con número y cuatro sin él no es un defecto
del diseño: **es la prueba de que acá nadie promete «+30 %»**.

### 5.4 «Cómo se arranca»

Tres pasos en fila. Cada uno con una **regla superior de 2 px que se va aclarando** (tinta → `ink-3`
→ `line-strong`): el paso 1 es el más pesado visualmente porque es el que hay que dar. Numeral en
mono a 2,6 rem, título, párrafo y una **mini-interfaz dibujada** (no una captura):

- Paso 1: una tarjeta con cuatro barras, la última en ultramar (el botón).
- Paso 2: un mini-plano con tres corridas grises y tres muebles de color.
- Paso 3: el mini-plano a la izquierda y el formulario a la derecha, con el botón ultramar de ancho
  completo.

Están dibujadas a propósito. El copy (nota de §11.5) advierte que las capturas de la consola del
operador no pueden ir en la landing y que las de sede hay que generarlas. Un diagrama abstracto
**dice lo mismo, no envejece con la interfaz y no arrastra datos de nadie**. Si el dueño quiere
capturas reales, el hueco está dimensionado y basta reemplazar el bloque `.mini`.

Cierra con la nota `Cada supermercado empieza vacío…` en la misma caja punteada de la sección
anterior — consistencia de «nota al margen».

### 5.5 Asesoría — la banda invertida

**Es el único momento tonal de la página.** El fondo pasa a noche (`#0E1116`) en el tema claro. Es el
diferencial del producto y merece un cambio de superficie, no un título más grande. En el tema
oscuro se conserva el evento invirtiendo la relación: la banda se va más al negro (`#080A0E`)
mientras el resto de la página es `#0E1116`. Dentro de la banda se redefinen los tokens semánticos,
así que las tarjetas, chips y reglas funcionan sin reescribir nada.

Contenido: antetítulo del copy («Lo que ningún Excel te va a decir») + H2 + bajada, y tres bloques
A / B / C sobre la misma retícula de 6 columnas (A a lo ancho, B y C a la mitad).

- **A · Recomendaciones.** Dos filas con borde izquierdo ultramar: el texto de la recomendación a la
  izquierda y **el valor en juego a la derecha, en mono, alineado a la derecha**. Ordenadas por valor
  descendente, como dice el copy.
- **B · Oportunidades espacio por espacio.** Tres filas `código · precio sugerido · hasta tres
  proveedores` en píldoras. Pie de tarjeta: `Proveedores y valores de ejemplo`.
- **C · Tendencia mes a mes.** El gráfico, especificado abajo.
- **Cierre honesto.** El párrafo completo del copy dentro de una caja con borde y superficie propia,
  con el enlace `Ver el reporte de transparencia`. No se recorta, no se achica, no se mete en un
  acordeón: el copy es explícito en que va entero, y el diseño lo trata como contenido, no como letra
  chica.

### 5.6 El gráfico de tendencia (`dataviz`)

**Forma:** una serie, cambio en el tiempo → línea. **Una sola serie ⇒ sin leyenda**; el título
(`Ocupación mes a mes`) ya dice qué se grafica.

**Especificación de marcas**, según la skill:

- Línea de **2 px**, `--accent`, uniones y extremos redondeados.
- Marcadores de **r 3,6** (≥ 8 px de diámetro con el anillo), con **anillo de 2 px del color de la
  superficie** para que se separen de la línea. El último punto va a **r 4,6**.
- Rejilla hairline de 1 px, sólida, en `--line-hair`; la línea base en `--line`.
- **Etiqueta directa solo en el extremo** (`46 %`), en `--ink`, nunca en el color de la serie. Ningún
  otro punto lleva número: los lleva el eje y, en producción, el tooltip.
- Eje de meses en mono, 8,5 px, `--ink-3`.

**El hueco.** Es el detalle que justifica el gráfico. El mes sin datos **no baja a cero**: la línea se
corta, un tramo **punteado gris** de 1,5 px hace de puente, el punto es un **círculo hueco con borde
punteado** y encima dice `sin datos`. Es la traducción literal de la frase del copy —*«Un mes sin
datos aparece como un hueco, no como un cero: un cero sería mentira»*— y de la regla §14.18 (la
tendencia arranca vacía y no se rellena hacia atrás).

**Honestidad:** el gráfico lleva `Ejemplo · datos inventados` en el encabezado, en mono versalita,
igual que el plano lleva su rótulo. Y un `aria-label` que describe la tendencia y el hueco en
palabras.

### 5.7 Confianza

Deliberadamente **la sección menos diseñada de la página**: cinco filas separadas por reglas de 1 px,
con numeral mono a la izquierda (56 px), título en la columna del medio (máx. 28ch) y párrafo a la
derecha. Sin tarjetas, sin iconos, sin escudos, sin candados. El copy pide que cada punto suene a
decisión de ingeniería tomada; un sello de seguridad dibujado diría exactamente lo contrario. Cierra
con los dos enlaces reales como enlaces subrayados, no como botones.

### 5.8 Precio

Dos columnas. A la izquierda una **cuenta de cobro**: tarjeta con doble filete (borde sólido +
borde punteado interior a 8 px), que es como se ven los formatos de cuenta de cobro colombianos. Los
`[COMPLETAR: …]` no se disimulan: van en un **chip rayado en diagonal con borde punteado ultramar**,
imposible de pasar por alto en una revisión. La página se puede mirar con los marcadores puestos y
nadie los va a publicar por accidente.

A la derecha, `Qué pasa si un mes te atrasás` como una progresión de tres estados con punto de color
—verde, ámbar, ultramar— que reutiliza el vocabulario cromático del plano: el estado de la cuenta se
lee igual que el estado de un espacio. Debajo, la línea de contacto y el CTA `Hablemos`.

### 5.9 CTA final

Banda hundida (`--bg-sunken`), centrada, con la retícula isométrica entrando desde abajo. Símbolo a
34 px, H2 a 3,6 rem, párrafo, los dos botones y la línea de cierre. Es el único bloque centrado de
toda la página: después de siete secciones alineadas a la izquierda, el centrado se siente como un
punto final.

### 5.10 Pie

Cuatro columnas (marca + tres listas: Producto, Cuenta, Legal), después una regla y el bloque legal
en `--ink-3` a 0,82 rem: razón social / NIT / ciudad, marco legal, correo de derechos, copyright,
`Volver arriba` y la nota chica final sobre el plano inventado. Los `[COMPLETAR]` del pie quedan como
texto plano, no como chips: en el pie el chip sería ruido y el copy ya los marca.

---

## 6. Responsive

| Ancho | Qué cambia |
|---|---|
| **360–639** | Todo a una columna. Nav: solo marca + tema + `Crear mi cuenta`. La ficha del plano pasa a hoja fija abajo con botón `Cerrar`. El plano es 4:3,4. Ayuda: `Deslizá… Pellizcá… Tocá un mueble.` Controles de 44 px. Márgenes de 20 px. |
| **640–759** | Aparece `Ya tengo cuenta` en la barra. |
| **760–1079** | Bento y perfiles a 2 columnas. Pasos todavía apilados. |
| **1080–1399** | Hero a dos columnas (42/58). Pasos a 3 columnas. Cifras a 2 columnas. |
| **1400–1920** | Bento a 6 columnas (3+3 / 2+2+2 / 6). Cifras a 5 columnas. El contenedor tope en 1240 px: en 1920 la página **no se estira**, queda como una hoja centrada con margen generoso. Es intencional. |

Comprobaciones hechas por construcción: ninguna fila de la tabla equivalente desborda (scroll
horizontal propio dentro del `<details>`), ningún bloque produce scroll horizontal de página
(`overflow-x: clip` en `body`, que a diferencia de `hidden` no rompe la barra pegajosa), y ninguna
línea de cuerpo supera ~70 caracteres.

---

## 7. Rendimiento (LCP < 2,5 s en móvil)

| Decisión | Efecto |
|---|---|
| Cero fuentes web | Sin descarga, sin FOIT, sin salto de layout. El texto pinta en el primer frame. |
| Cero imágenes en la página | No hay candidato a LCP que dependa de la red. **El LCP es el `<h1>`.** |
| Todo el arte es SVG/CSS en línea | Ni una petición extra. |
| El plano se construye en JS después del parseo | El panel ya tiene su tamaño reservado (`aspect-ratio`), así que dibujarlo **no mueve nada**: CLS ≈ 0. |
| Los 46 sólidos son ~140 polígonos | Un solo pase de pintado; el paneo y el zoom son un único `transform` sobre un `<g>`, no un redibujo. |
| La transición a 3D es el único `requestAnimationFrame` | 700 ms, y solo cuando alguien la pide. |
| El 3D real (three.js) va bajo demanda | Ya está previsto el estado `Cargando la vista 3D…`. |
| `IntersectionObserver` para revelar | Sin escuchar `scroll` para animar. |

Para la aplicación: el módulo del plano debería quedar en un `import()` disparado por
`requestIdleCallback` o por la primera interacción, para que el bundle inicial de `/` sea texto y
CSS. El diseño no depende de que el plano llegue en el primer frame: el hero funciona entero sin él.

---

## 8. Accesibilidad

- **Contraste:** verificado en §3.2 y §3.3. Todo el cuerpo ≥ 4,5:1 en ambos temas; los elementos no
  textuales ≥ 3:1 salvo el ámbar, que viaja siempre con su palabra y con tabla equivalente.
- **El color nunca es la única señal.** Regla heredada del producto y aplicada en la leyenda, en la
  ficha, en los chips de correo (el «sin montos» se distingue por borde punteado, no por color) y en
  el gráfico (el hueco es un trazo punteado y la palabra `sin datos`).
- **Foco visible en todo**, anillo de 2 px en `--ring` con 3 px de separación; los muebles del plano
  engordan su contorno a 2,4 px en ultramar.
- **Enlace de salto** al contenido como primer elemento tabulable.
- **Jerarquía de encabezados** h1 → h2 → h3 sin saltos.
- **Objetivos táctiles** ≥ 44 px en pantallas táctiles (botones del plano incluidos).
- **`prefers-reduced-motion`** respetado globalmente.
- **Alternativa no gráfica** del plano: `<figcaption>` con la descripción larga + tabla con las seis
  columnas del copy.
- **Zoom del navegador** no bloqueado; `viewport` sin `maximum-scale`.

---

## 9. Decisiones abiertas para el dueño

Cosas que el diseño resolvió de una manera y que se pueden revertir sin tocar el resto:

1. **Tipografía del sistema en lugar de Chivo + Archivo Narrow.** Es lo que permite cumplir la CSP sin
   tocarla. Si se prefiere conservar las fuentes actuales, hay que empaquetarlas en el repo y ajustar
   la CSP en el mismo PR; la escala y los tracking de §3.4 se pueden trasladar tal cual.
2. **Ultramar como color de acción.** Elegido para no competir con los cuatro estados. Si la marca ya
   tiene un color propio, la única condición innegociable es que **no sea verde, ámbar ni rojo**.
3. **El «3D» de la landing es la misma isometría con la cámara movida**, no three.js. Pesa cero y no
   puede fallar. Si se quiere el three.js real, la coreografía y los estados de error ya están
   especificados.
4. **Las dos sedes en la misma lámina.** Enseña el multi-sede gratis, pero hace la escena más ancha.
   Si se prefiere una sola sede, se borra el bloque de PALMAS y el encuadre se recalcula solo.
5. **Diagramas dibujados en lugar de capturas** en «Cómo se usa». El hueco está dimensionado por si
   se prefieren capturas generadas con `docs/maquetas/generadores/pantalla.mjs`.
6. **El gráfico de tendencia usa datos de ejemplo** (rotulados como tales, igual que el plano). Si se
   considera que ni siquiera un ejemplo rotulado debe llevar cifras, el bloque C funciona solo con
   texto y la sección no pierde estructura.
7. **El conmutador claro/oscuro en la barra** es una comodidad del prototipo para revisar los dos
   temas. En producción puede quedarse o seguir solamente al sistema.
8. **La banda oscura de Asesoría.** Es el gesto más fuerte de la página. Si se quiere algo más
   sobrio, la alternativa es dejarla en papel con un borde superior grueso; se pierde el evento
   tonal, no la estructura.
9. **La rueda del mouse se arma con el primer clic.** Es lo que evita que el hero secuestre el
   scroll. El texto de ayuda del copy («Rueda para acercar») sigue siendo cierto una vez que tocaste
   el plano; si el dueño lo prefiere literal desde el primer segundo, se quita el armado en una línea.
10. **Nombre de la marca en la ficha del plano.** El copy deja `MercaFresco` como constante. En el
   prototipo el nombre del supermercado no aparece escrito en ningún lado: solo los rótulos de sede
   `CENTRO` y `PALMAS` y el rótulo `Supermercado de ejemplo`. Es más limpio y evita que alguien lea
   `MercaFresco` como un cliente real.

---

## 10. Cómo mirar el prototipo

`outputs/prototipo/index.html` — doble clic. No necesita servidor, ni red, ni instalar nada.

Qué probar, en este orden:

1. **Esperá un segundo sin tocar nada.** Se abre sola la ficha de `PUN-02` y la pieza pulsa dos
   veces. Eso es lo que ve alguien que llega por un enlace.
2. **Arrastrá el plano.** Aparece PALMAS arriba a la derecha.
3. **Rueda del mouse** para acercar; pasá el mouse por `GON-04·A` y por `GON-04·B` —la misma corrida,
   dos estados, dos fichas distintas—.
4. **`Ver en 3D`.** Mirá cómo baja la cámara y se apaga el gris.
5. **`Tab` desde la barra** hasta el plano: flechas para moverte, Tab para recorrer muebles, Enter
   para fijar la ficha, Esc para cerrarla.
6. **El botón de luna** en la barra: la página entera en oscuro, incluida la banda de Asesoría, que
   se va más al negro para no perder el contraste tonal.
7. **Achicá la ventana a 360 px.** La ficha del plano se convierte en hoja inferior con `Cerrar`.
8. **Activá «reducir movimiento»** en el sistema y recargá: nada se mueve, todo se ve.
