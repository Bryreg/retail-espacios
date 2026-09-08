# Port de la CARTERA — pieza 1 de A («El informe») sobre la API real

**Fase 11 · RECABRA · frontend de la cartera · 2026-09-08**
Ruta portada: **`/plataforma`**. Referencia exacta:
`outputs/opciones/A-el-informe/index.html` (pieza 1, capítulos 1.1 a 1.7) y su
`README.md`; guion §1 y §3; comparativa §5 «A A · El informe».
Backend sin tocar. Sin commit ni push.

---

## 0. Lo que quedó

`/plataforma` es ahora **un documento con siete capítulos**, no un tablero:
índice a la izquierda con el capítulo que se está leyendo marcado, una barra
arriba con el periodo —la única fila de filtros, y manda sobre todo lo de
abajo—, y el cuerpo de arriba abajo:

| | Capítulo | Qué contesta |
|---|---|---|
| 1.1 | El titular | cuánto entra, contra el mes **comparable**, con la corrección de composición auditable |
| 1.2 | La tendencia de 12 meses, anotada | hacia dónde va, en **conteos** y no en porcentaje |
| 1.3 | La cola de llamadas | **a quién llamo primero**, con la razón en una línea y su acción |
| 1.4 | Quién cobra por debajo | el spread sobre un eje con el cero, y los que no se pueden medir, contados |
| 1.5 | La adopción | quién no usa lo que paga: unidades + tabla de cohortes, sin gráfico |
| 1.6 | Lo operativo | estados de cuenta y supresiones, plegados, fuera de la historia |
| 1.7 | De dónde sale | periodo, generación, cobertura, y lo que no se publica |

Archivos (todos míos, ninguno compartido):

| Archivo | Líneas | Qué es |
|---|---|---|
| `frontend/src/pages/Plataforma.tsx` | 1026 | la página: las cinco llamadas, el armazón y los siete capítulos |
| `frontend/src/components/plataforma/cartera-datos.ts` | 680 | **capa 0**: la cola, la corrección de composición y las anotaciones — calculadas de claves publicadas |
| `frontend/src/components/plataforma/cartera-cola.tsx` | 130 | la cola de llamadas |
| `frontend/src/components/plataforma/cartera-operativo.tsx` | 361 | el cajón de estados de cuenta y supresiones |
| ~~`components/plataforma/adopcion.tsx`~~ · ~~`tendencia.tsx`~~ | −800 | **borrados**: nadie los importaba ya (verificado con grep antes de borrar). `consola.tsx` **queda intacto**: `DetalleCliente` y `ReportePlataforma` lo siguen usando. |

---

## 1. Qué se portó TAL CUAL de A

1. **La consola es un documento.** `.plat-tapa` + `.plat-cap` numerados,
   frase-conclusión de `--t-md` arriba de cada bloque, y **debajo de la frase
   la ruta del JSON en monoespaciada** (`.plat-fuente`) — que en A la cartera
   no tenía (sólo la sesión) y acá se le puso a los cinco capítulos con
   frase, porque es lo que contesta sola la pregunta 2 del dueño.
2. **El índice como «en esta pieza»**, con el capítulo activo marcado
   (`IntersectionObserver`, no un listener de scroll).
3. **La cifra hero del ingreso** a `--t-hero`, mono, figuras proporcionales,
   con la variación al lado — y el crudo **tachado** con la palabra
   «composición distinta».
4. **La tabla de las cuatro filas** de la corrección de composición
   (clientes / espacios / ocupación / ingreso × publicado / comparable / este
   mes), con la columna del medio como la que manda.
5. **El medidor** de ocupación de cartera con su **marca de referencia** en el
   mes comparable — no unidades: 258 marcas (o 3.000 con 30 clientes) no
   señalan ningún lugar al que ir.
6. **Las dos líneas de conteo** de la tendencia + **el ingreso en su propio
   panel** con la misma rejilla de meses, con las anotaciones escritas sobre
   el dato y el aviso «por qué conteos y no un porcentaje».
7. **La cola de llamadas** entera: puesto, nombre con sus dos sublíneas,
   señal como palabra, razón en una línea, plata con su rótulo, acción
   (`Abrir la sesión` → `/plataforma/clientes/:slug`, `Revisar la conexión`
   para el que no se deja leer), reordenable por riesgo o por plata, y **la
   regla de orden escrita arriba de la lista**.
8. **El spread sobre un eje con el cero dibujado fuerte**, con los que no se
   pueden medir contados al pie del dibujo y no dibujados en cero.
9. **La adopción como unidades** (relleno / hueco / gris) con la clase como
   palabra, y **las cohortes como tabla, sin gráfico**, conteos primero y el
   porcentaje al lado con su `n`.
10. **Lo operativo en un cajón**, con el conteo en el resumen.
11. **Un solo amarillo por pantalla** (`.btn-principal`), y es la llamada #1
    de la cola.
12. **La escala de A, sin agrandar ni engrosar nada.** Todos los cuerpos son
    pasos `--t-*` de `tema.css` más `--t-hero`; en 1366 el hero baja a 40 px
    como en A.

Los tres ajustes admitidos de la comparativa están aplicados: **(a)** los
chips de señal y de estado de cuenta van en tinta gris con la palabra —la
jerarquía la llevan el peso y el borde (`--fuerte` / `--medio` / `--suave`)—,
**(b)** el rótulo de la rejilla de doce meses lleva su cifra
(`rotuloRejillaMeses`), **(c)** ni un texto usa `--ink-4`.

---

## 2. Qué hubo que adaptar a los datos reales, y por qué

**A es un prototipo con un bloque `_derivado_frontend` servido en el JSON. La
API real no lo devuelve.** Estas son las tres cuentas que hubo que hacer, y de
qué claves publicadas salen. Viven en `cartera-datos.ts`, con su porqué
escrito al lado.

### 2.1 · La cola: `orden_por_necesidad_de_asesoria` no existe, se calcula

Nueve señales, en el orden de la regla del guion §1.3 —«primero lo que no se
puede ver, después la plata que se puede ir este mes, después la que no
entra»—, y cada cliente se queda con **una**: la más urgente.

| # | señal | de dónde sale | la plata que se le pone al lado |
|---|---|---|---|
| 0 | sin dato | `clientes[].error` | «—» · *no hay cifra que mirar* |
| 1 | fantasma | `adopcion.clasificacion` | `ingreso_contratado_mes` · en riesgo, con su % de la cartera |
| 2 | dormida | ídem | ídem |
| 3 | sin cuentas | ídem + `con_contratos_activos` | ídem |
| 4 | cobra por debajo | `spread_pct < 0` | **≈** `ingreso / (1 + spread/100) − ingreso`, redondeado a la centena de miles |
| 5 | ocupación baja | `ocupacion_pct` < la del consolidado | **≈** libres × `canon_promedio_mensual` del propio cliente |
| 6 | sin tarifa | `tarifa_configurada === false` | **sin referencia** — no se estima |
| 7 | nueva | `adopcion.clasificacion` | **≈** `espacios_comercializables` × canon promedio de la cartera |
| 8 | al día | lo que queda | `ingreso_contratado_mes` · facturando |

Tres decisiones que no son de estilo:

- **Clasificar y ordenar son dos cosas distintas.** Las clases de adopción
  (que el backend calcula una vez y son excluyentes) se miran **antes** que
  las lecturas de negocio, `nueva` incluida: un cliente dado de alta hace doce
  días tiene cero contratos y por lo tanto ocupación baja, y llamarlo
  «ocupación baja» es cierto y es inútil. Su **rango**, en cambio, sigue
  siendo el último: es la llamada menos urgente de la semana.
- **La plata despejada del spread lleva «≈» y su aclaración.** Se despeja de
  la RELACIÓN publicada, nunca de la tarifa —que no cruza la frontera—, y es
  aproximada dos veces: el spread se calcula sólo sobre los contratos con
  tarifa aplicable y viene redondeado a un decimal. Cuando hay
  `contratos_sin_tarifa`, el rótulo lo dice.
- **Lo que no se puede valorar no se valora.** Sin `canon_promedio_mensual`
  (cero contratos activos) no hay precio con el que tasar un espacio libre:
  dice «sin referencia», no toma un promedio de otro lado. En el orden por
  plata esos clientes van al final **con su nombre a la vista**, nunca con un
  0 que los mezcle con los demás.

### 2.2 · La corrección de composición: se recompone con `/tendencia` por cliente

Es la cuenta más importante de la pantalla y la trampa 2 del guion. A tenía la
columna «agosto sin Guadual» servida en el JSON. Acá se arma así:

1. al total del mes anterior (`/tendencia?cliente=__consolidado__`)
2. se le **resta** lo que ese mismo mes aportaba cada cliente que hoy devuelve
   `error`, leído de **su propia serie** (`/tendencia?cliente=<slug>`, que lee
   el snapshot persistido del registro y por eso sigue contestando aunque la
   base esté rota hoy);
3. y **sólo se publica si los clientes cuadran**: `clientes_incluidos` del mes
   anterior menos los quitados tiene que dar los de este mes.

Si no cuadran —entró un cliente nuevo, por ejemplo— **no hay columna
comparable**: se escribe por qué, con los dos conteos, y el delta grande queda
tachado sin ningún número que lo reemplace. Si el mes anterior no tiene
snapshot, lo mismo. Nada se estima.

Medido con la siembra: agosto publicó 9 clientes · 346 espacios · 47,1 % ·
$ 179.900.000; el ilegible aportaba 88 espacios, 46 ocupados y $ 48.300.000;
la columna comparable da **8 · 258 · 45,3 % · $ 131.600.000**, que es
exactamente lo de septiembre. **El titular dice «el ingreso quedó plano» donde
el número crudo decía «−$ 48.300.000».**

### 2.3 · Las anotaciones de la rejilla: se buscan en la serie

A las escribía a mano («jun · +108 caras: entra el plano de TERRÓN»). Acá se
detectan los saltos de denominador que superen el umbral (5 espacios o el 3 %
del mes anterior, lo que sea mayor), se toman los tres más grandes y se
rotulan con su causa **leída del dato**: si además cambió `clientes_incluidos`
dice «N clientes entran/salen de la cuenta»; si no, «entró plano nuevo». La
línea de ingreso lleva **una sola** anotación, la del salto más grande: un
número sobre cada punto es ruido.

### 2.4 · Lo que la API no trae, y se dice

- **El total de contratos activos por cliente.** Se podría despejar (ingreso ÷
  canon promedio) y es una inferencia, no un dato: **no se muestra**, y 1.1 y
  1.7 lo escriben.
- **La participación de un proveedor.** En la cartera sólo hay
  `top_proveedores` (5) y **no** el total de contratos del cliente: un
  porcentaje sin denominador publicado es un número inventado. Esa lectura
  vive en el detalle. **El top 5 de la cartera no se dibuja** (A tampoco lo
  dibujaba en la cartera).
- **`/tendencia` y `/adopcion` no toman el periodo**: la serie termina siempre
  en el mes en curso y la adopción se calcula a hoy. El pie escribe esa
  asimetría en vez de repintar un rótulo sobre los mismos números.
- **Un mes cerrado se recalcula, no se relee.** Elegir un periodo pasado hace
  que `/metricas` vuelva a calcular sobre las bases de HOY y con los clientes
  que hay hoy — la foto de ese mes tal como se publicó vive en la rejilla de
  doce meses. Cuando el periodo no es el mes en curso, el pie lo dice con esas
  palabras. **Es un hallazgo del port**: sin esa línea, el titular de un mes
  viejo y su propio punto en la tendencia se contradicen sin explicación.

---

## 3. La frontera (brief §4), verificada

- **La tarifa de referencia no viaja a ninguna parte.** Sólo `spread_pct` y
  `tarifa_configurada`. La plata «sin cobrar» se despeja de la relación y se
  rotula como aproximada. Está escrito en el capítulo 1.4 y en el pie.
- **Los nombres se pintan tal como llegan** (el backend ya los sanea).
- **Todo es sólo lectura salvo estado de cuenta y supresiones**, que siguen
  siendo las mismas operaciones de siempre: motivo/nota obligatorios,
  `confirm()` antes del PATCH, la fila se actualiza en su lugar.
- **El reporte de transparencia se enlaza y no se rediseña**: un botón
  `Reporte` por fila en la tabla de estados de cuenta, dentro del cajón.
- **El guard `soyOperador` y el manejo de errores se conservan.** Verificado:
  con un token de no-operador y sin token, `/plataforma` no pinta **ni una
  cifra de negocio** (0 filas de cartera, 0 apariciones del ingreso).

---

## 4. Cambios en archivos del agente de gráficos (anotados, como se pidió)

Tres, todos por defectos medidos en pantalla, ninguno de gusto:

1. **`graficos.tsx` · `Unidades` con `disposicion="columnas"`: las columnas
   ahora ENVUELVEN.** Se ponían una al lado de la otra sin mirar el ancho del
   lienzo, y un `detalle` largo —la lista de nombres de la clase «activa»—
   empujaba a las últimas más allá del `viewBox`, que recorta: **la clase
   «nueva» desaparecía entera del dibujo sin decir nada**. Ahora la columna se
   limita al lienzo, lo que no cabe en la banda baja a la siguiente, y un
   detalle más largo que su columna se corta con «…» (la lista completa está
   en la tabla equivalente).
2. **`graficos.tsx` · `EjeSpread`: la cifra se voltea cuando no cabe.** El
   peor spread queda pegado al borde izquierdo del eje y su rótulo se metía
   **encima del nombre del cliente** («Superandes−18,2 %»). Ahora, si del lado
   de afuera no hay lienzo, va del lado de adentro, con **halo del color de la
   superficie** para no quedar cruzado por el trazo.
3. **`graficos.tsx` · `T`: prop `halo`** (opcional, apagada por defecto), que
   es lo que hace posible el punto 2. Es el mismo recurso que el aire de 2 px
   entre marcas que se tocan del guion §4.4.

`npm run probar:graficos` (la suite del agente de gráficos) **pasa entera** con
los tres cambios: 4 pasadas × 14 svg × 235 textos, 0 pisados, 0 fuera de caja,
0 errores.

En `plataforma.css` agregué **sólo lo que la hoja no traía porque el prototipo
es un archivo suelto y esto es una ruta del producto**: el armazón
(`.plat-pagina`, `.plat-barra`, `.plat-shell`, `.plat-indice`, `.plat-toc`), el
cajón de lo operativo (`.plat-cajon`, `.plat-editor`, `.plat-btn.fuerte`), el
contenedor `.plat-cola` y las reglas responsive de esos bloques. Cada uno lleva
su comentario con el porqué. **No toqué una sola regla existente**, ni la
escala, ni el color.

Un defecto propio corregido de paso: `.plat-fila-cli:first-of-type` no se
aplicaba nunca, porque `:first-of-type` cuenta hermanos del mismo tag y la
regla de orden era el primer `div`. Las filas van ahora en su propio
contenedor.

---

## 5. Mediciones

Backend propio sembrado (9 clientes, 12 meses de historia con dos escalones de
denominador, y una base que queda **ilegible después** de escribir su
historia, que es lo que hace falta para probar la corrección del titular);
Playwright con `chromium-1194`. Siembra y sondas en el scratchpad de la sesión
(`cartera/seed_cartera.py`, `romper.py`, `shot.mjs`, `svgtext.mjs`,
`contraste.mjs`, `inter.mjs`, `periodo.mjs`, `guards.mjs`, `ancho.mjs`).

| Medición | 1440×900 claro | 1440×900 oscuro | 1366×768 | 390×844 |
|---|---|---|---|---|
| Scroll horizontal del documento | **0** | **0** | **0** | **0** |
| `.btn-principal` visible | **1** | **1** | **1** | **1** |
| `--signal` pintado fuera de esa clase | **0** | **0** | **0** | **0** |
| Textos < 10 px (DOM) | **0** | **0** | **0** | **0** |
| Textos `<text>` < 10 px / > 30 px reales | **0 / 0** | **0 / 0** | **0 / 0** | **0 / 0** |
| Pares de `<text>` pisados dentro de un svg | **0** | **0** | **0** | **0** |
| `<text>` fuera de la caja de su svg | **0** | **0** | **0** | **0** |
| Factor de escala de los 7 svg | **1** | **1** | **1** | **1** |
| Textos bajo su piso WCAG (con TODOS los `details` abiertos) | **0** | **0** | — | — |
| Errores de consola | **1**\* | **0** | **0** | **0** |

\* El único error es `GET /favicon.ico → 404`, **preexistente**: `index.html`
no declara ícono y ninguna otra pantalla lo declara tampoco. No lo genera esta
pieza; aparece en la primera pasada de un navegador frío y no vuelve.

`npx tsc --noEmit` → **exit 0** (con la sesión y el informe del otro
constructor ya en el árbol).
`npm run probar:tema` → **24 pruebas, todas ok** — incluidas «la clase aparece
a lo sumo una vez por archivo de pantalla», «`--signal` no se usa fuera de esa
clase» y «todo `var(--x)` está definido».
`npm run probar:graficos` → **todo en orden**.

**Interacción** (`inter.mjs`, todo contra el backend real):

| Qué | Resultado |
|---|---|
| Reordenar por plata | reordena, y sigue habiendo **1** amarillo (pasa a la fila 1 del nuevo orden) |
| `Revisar la conexión` en el cliente ilegible | abre el cajón de lo operativo, abre el editor de ESE cliente y lo trae a la vista |
| Cambiar estado sin motivo | «El motivo es obligatorio.» — no llama al PATCH |
| Cambiar estado con motivo | `confirm()` con cliente, estado y motivo → PATCH → la fila se actualiza en su lugar |
| Supresiones | el cajón lista las 2 y ofrece `Atender` sólo en la pendiente |
| `Abrir la sesión` | navega a `/plataforma/clientes/<slug>` |
| Cambiar el periodo a un mes cerrado | recarga `/metricas`, desaparece el chip «parcial», el pie dice «mes cerrado» y agrega la advertencia del recálculo |
| Periodo sin mes anterior en la ventana | «Sin mes anterior publicado con qué compararlo», sin inventar un delta |
| Token de no-operador · sin token | 0 filas de cartera, 0 cifras de negocio pintadas |

---

## 6. Pendientes y huecos conscientes

1. **El bucle del guard.** Con `operador === "no"` la página hace
   `<Navigate to="/" replace />` y `App.tsx` manda `/` de vuelta a
   `/plataforma` cuando la sesión tiene `plataforma: true`. No pinta ni una
   cifra (medido), pero rebota hasta que el ingreso se hace cargo. Es
   **comportamiento preexistente** —la página anterior tenía el mismo
   `Navigate`— y arreglarlo toca `App.tsx`, que no es mío.
2. **El selector de periodo muestra el mes en el idioma del navegador**
   (`<input type="month">`). Es lo que había antes. Un `<select>` con los
   meses de la ventana lo pondría en español, pero la ventana de periodos
   disponibles no la publica ningún endpoint: habría que derivarla de
   `/tendencia`, y eso ata el selector a una llamada que no manda sobre él.
3. **`de_cache` se dice, no se puede forzar.** No hay forma desde el frontend
   de pedir una lectura fresca; el pie dice si lo que se ve salió del caché de
   5 minutos y de cuándo es.
4. **La cola escala a 30 clientes, pero no se pagina.** Con 30 filas el
   capítulo mide ~2.400 px. Si eso molesta, lo correcto es cortar en las
   primeras N y plegar «los que no necesitan llamada», no paginar: el orden ya
   es la respuesta.
5. **No hay filtro por señal.** Con 9 clientes no hace falta; con 30 puede
   hacer falta, y su lugar es la barra de arriba, junto al periodo, nunca
   dentro del capítulo.
6. **La adopción y la cartera pueden discrepar en un cliente ilegible.**
   `/adopcion` lee el registro y lo clasifica «activa» aunque `/metricas` no
   pueda abrir su base; la cola lo llama «sin dato» porque no hay cifra que
   mirar. Las dos son correctas y salen de fuentes distintas. No lo tapé: si
   se quiere una sola lectura, es una decisión de backend.
