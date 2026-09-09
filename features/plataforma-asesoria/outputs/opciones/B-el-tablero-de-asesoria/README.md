# Opción B · «El tablero de asesoría»

**Diseñador B · Fase 11 · RECABRA — Plataforma.** Entrega: `index.html`
(autocontenido, 460 KB, cero recursos externos, cero librerías, tipografías de
sistema, tokens de `frontend/src/tema.css` copiados adentro, claro por defecto
con un toggle a oscuro) y este README.

Datos: `outputs/ejemplo.json` **incrustado tal cual** en un
`<script type="application/json">`. Todo número de la pantalla se calcula en el
navegador a partir de ese JSON; no hay cifras transcritas a mano salvo las
cuatro de «agosto a igual composición», que el endpoint no publica y vienen del
guion (§5.g de este documento). Historia: `outputs/guion.md`, seguido capítulo
por capítulo; los cinco lugares donde me aparto están en §5.

---

## 1. La decisión fuerte

**La cartera no es un dashboard: es una cola de trabajo.** El operador no abre
la consola a mirar cómo va el negocio; la abre a decidir a quién llama primero.
Así que la pantalla de entrada es **una lista ordenada por necesidad de
asesoría, con la razón escrita en una línea y la plata al lado**, y la regla de
orden impresa arriba de la lista para que el orden no sea magia. Todo lo demás
—la tendencia, el spread, las cohortes, la adopción— es la columna de contexto
que sostiene esa lista, no un panel que compite con ella.

**El cliente no es una página larga: es una hoja de una pantalla con capítulos.**
La sesión de asesoría tiene los cinco capítulos del brief en un riel a la
izquierda; el capítulo ocupa la pantalla y **no hay scroll de documento**: el
encabezado, el nombre del cliente y el botón de la acción principal no se van
nunca. Se navega por capítulo, no por scroll.

**Mi riesgo, y qué hice con él.** La densidad se puede comer la historia. La
respuesta es una regla que no se rompe en ningún bloque: **cada bloque abre con
una frase que dice el hallazgo con su número**, en negrita, arriba del dibujo.
Si la frase no está, el bloque no se publica. Son **22 bloques y 22 frases** (5 en la cartera, 14 en la sesión, 3 en el informe), con **15 tablas equivalentes** colgando de ellos.

Tres cosas que esta opción hace y que probablemente ninguna otra haga igual:

1. **El titular corrige un número que parece malo y no lo es.** La cartera
   «pierde» $ 45,3 M contra agosto y no perdió nada: Mercado El Guadual no se
   dejó leer. El delta grande va contra el agosto recompuesto y **el agosto
   publicado se muestra tachado, no escondido**, en una tabla de tres columnas.
2. **Las 113 góndolas se cuentan en cuatro escalones** y sólo el primero está a
   la vista (la frase con tres números, tres sedes y un precio). El párrafo de
   113 códigos que trae `explicacion` **no se imprime nunca**; los códigos viven
   en tres cajones plegados por sede.
3. **El «valor en juego» no es un número, son tres**, y la suma cruda se muestra
   tachada con el motivo: $ 386.142.500 cuenta TERRÓN dentro de las góndolas y
   cuenta como oportunidad la plata que Volcán ya paga.

---

## 2. Las tres piezas y qué contesta cada bloque

### A · La cartera — «¿cómo va y a quién llamo primero?»

| Bloque | Pregunta que contesta | Forma |
|---|---|---|
| Titular + cifra grande | ¿cuánto entra este mes y contra qué se compara? | cifra grande (48 px) + delta con signo, contra **agosto a igual composición** |
| Medidor de ocupación | ¿qué tan llena está la cartera? | medidor con marca de referencia en el mes anterior comparable |
| Tabla de corrección | ¿por qué el delta va contra esa columna y no contra la publicada? | tres columnas: publicada (tachada) · comparable · septiembre |
| La cola de llamadas | ¿a quién llamo primero y por qué? | lista ordenada, razón en una línea, plata al lado, corte visible después del cuarto |
| Adopción | ¿quién no usa lo que paga? | conteo por clase en unidades, y la clase como columna de cada fila |
| Tendencia 12 meses | ¿hacia dónde va? | dos paneles (conteos e ingreso) sobre **una sola rejilla de meses**, anotados |
| Spread | ¿quién cobra por debajo de lo que él mismo dice que vale? | puntos sobre un eje con el cero marcado + los nulos contados aparte |
| Cohortes | ¿los nuevos se quedan? | tabla de 5 filas, conteos primero |
| Cajón operativo | ¿qué cuentas hay que tocar? | plegado: estados de cuenta y supresiones, fuera de la historia |

### B · La sesión de asesoría — cinco capítulos

1. **Dónde está** — frase, cuatro cifras cada una contra algo, la ocupación
   dibujada espacio por espacio y la tendencia de 12 meses con dos anotaciones.
2. **Qué encontramos** — seis hallazgos (H1…H6) más **la contradicción**: la
   recomendación de las 113 góndolas propone dárselas a Volcán y la de
   concentración dice que Volcán ya pesa 41,4 %. Se muestran juntas, con la
   cuenta de qué pasaría (71 %) y la salida (el segundo candidato).
3. **Qué proponemos** — tres cifras rotuladas y las 25 acciones por prioridad;
   cada una se abre en sus escalones (precio contra el benchmark · candidatos ·
   códigos por sede).
4. **Los datos detrás** — una fila de filtros arriba de cinco tablas (254
   espacios, 111 contratos, 25 proveedores, 12 meses de movimientos, 148
   oportunidades en 30 grupos).
5. **De dónde sale** — periodo, generación, cobertura, sin-dato, frontera,
   bitácora y el enlace al reporte de transparencia.

El selector del riel cambia entre **Mercamío** (cliente grande) y **Almacenes
Caribe** (cliente nuevo). No es un capricho: el backend genera `arranque`
**sólo** cuando no hay ni un contrato y entonces no genera ninguna de las otras
seis recomendaciones. Son dos estados de pantalla distintos, y la opción los
muestra los dos.

### C · El informe para el cliente

La misma historia 1 → 3, imprimible en A4 (probado con `page.pdf()`), con los
tres cambios obligatorios del guion: fuera la comparación contra la cartera (la
referencia pasa a ser el benchmark por tipo), fuera las palabras «fantasma»,
«gracia» y el orden de la cola, y el titular cambia de dueño: del «a quién
llamo» del operador al **«qué gano»** del gerente.

---

## 3. La tabla del brief §3b, con mi respuesta

**=** coincido con el punto de partida · **Δ** me aparto, con el motivo.

| Dato | Pregunta | Trabajo | Forma que le di | Contra qué | |
|---|---|---|---|---|---|
| **Ingreso contratado del mes** | ¿cuánto entra? | magnitud sola | Cifra grande de 48 px, una por pantalla, figuras proporcionales; al lado, el delta absoluto y el % con flecha de signo. Nunca un anillo. | mes anterior **comparable** (no el publicado) | **=** |
| **Ocupación % (cartera)** | ¿qué tan llena está? | ratio contra un límite | **Medidor**: pista del paso tenue, relleno en la tinta de dato, marca de referencia en el mes anterior comparable. | mes anterior comparable | **Δ** |
| **Ocupación % (cliente)** | ¿qué tan lleno está? | parte de un total | **Unidades**: una marca por espacio (254 marcas de 7 px), agrupadas por sede, coloreadas por estado. | mes anterior · cartera, en las cifras de arriba | **=** |
| **Ocupación por sede** | ¿qué sede rinde y cuál no? | ranking de partes | **La misma fila de unidades**, con las sedes ordenadas de peor a mejor. El largo de la fila son los espacios de la sede: TERRÓN es nueve veces más largo que ARRAYÁN y está casi todo verde. | el promedio del cliente, dibujado aparte en H1 | **Δ** |
| **Tendencia 12 meses (ocupación)** | ¿hacia dónde va? | cambio en el tiempo con denominador móvil | **Dos líneas de conteo en una escala**: comercializables (paso tenue) y ocupados (tinta fuerte). La ocupación se lee como la brecha. | su propio pasado | **Δ** (del brief; **=** con el guion) |
| **Tendencia 12 meses (ingreso)** | ¿hacia dónde va la plata? | cambio en el tiempo | **Línea** en su propio panel, misma rejilla de meses, mes parcial en banda gris, mes sin snapshot en hueco. | su propio pasado | **=** |
| **Movimientos (entradas/salidas)** | ¿qué se ganó y qué se perdió? | flujo con signo en el tiempo | **Barras divergentes** sobre el eje de meses, rotuladas en plata (sólo los dos extremos), con la línea de saldo neto. Una sola escala. | el saldo | **=** |
| **Espacios por estado** | ¿cuánto hay para vender? | conteo | **Unidades discretas** con la palabra al lado del color, y el «se libera» con su cuenta por sede. | — | **=** |
| **Canon promedio por tipo vs benchmark** | ¿cobra bien? | comparación contra referencia | **Dumbbell**: punto lleno = el cliente, punto hueco = el benchmark, barra entre los dos, brecha escrita en %. Ordenado por brecha, el peor arriba. Batea no dibuja punto de cliente: dice «sin contratos de este tipo». | benchmark de la plataforma | **Δ** (orden y nulos) |
| **Spread % (cartera)** | ¿quién cobra por debajo? | comparación contra referencia | **Puntos sobre un eje con el cero marcado**, nombre al lado; los 2 clientes sin tarifa se cuentan aparte con la razón, no se dibujan en cero. | cero | **Δ** (los nulos, contados) |
| **Proveedores: participación %** | ¿de quién depende? | partes de un total, ranking | **Barras ordenadas**: el primero en la tinta de dato, los otros cuatro en el paso tenue, los 20 restantes en **un solo bloque gris**. Umbral del 40 % como línea vertical rotulada. | umbral de concentración | **Δ** |
| **Contratos por vencer** | ¿qué se cae y cuándo? | hechos con fecha | **Riel de 60 días** (no 90: `DIAS_POR_VENCER = 60`) con hoy y el corte de fin de mes marcados, y la lista ordenada por fecha debajo. | hoy · fin del periodo | **Δ** |
| **Recomendaciones** | ¿qué hago primero? | ranking por valor y prioridad | **Lista**: acción · evidencia en una línea · valor. La prioridad es palabra, orden y peso tipográfico; nunca sólo color. Se abre en escalones. | los tres totales del capítulo 3 | **=** |
| **Oportunidades** | ¿a quién le ofrezco qué? | asignación | **Tabla agrupada por sede × tipo**: 148 filas → **30 grupos**, con precio sugerido, **origen del precio** y los candidatos por nombre. | precio sugerido y su origen | **Δ** (el grupo es la fila) |
| **Adopción (5 clases)** | ¿quién no usa lo que paga? | clasificación con conteo | **Conteo por clase en unidades** en el encabezado de la cola, y la clase como palabra en la fila de cada cliente. No es un panel. | — | **=** |
| **Cohortes** | ¿los nuevos se quedan? | retención en el tiempo | **Tabla** de 5 filas: primero «0 de 2», después el % en gris. | — | **=** |
| **Valor en juego total** | ¿cuánto vale hacer esto? | magnitud compuesta | **Tres cifras rotuladas** (oportunidad nueva con sus dos partes · ingreso en riesgo · ingreso expuesto), y la suma cruda tachada con el motivo. | ingreso contratado del mes | **Δ** |

**Los que no son gráfico** (y por qué): estado de cuenta → chip con la palabra;
cobertura → una línea contada al pie; `contratos_fuera_del_plano` → una línea
contada bajo la tabla de contratos, nunca una categoría más del gráfico de
estados; zona y m² → columnas de tabla; marca → texto bajo el proveedor;
benchmark → nunca solo, siempre como la referencia de otro dato; reporte de
transparencia → un enlace.

### Los cinco desvíos, con su medición

**Δ 1 · Ocupación de cartera: medidor, no unidades.** 513 marcas (3.000 con 30
clientes) no señalan ningún lugar al que ir. `choosing-a-form.md`: *a single
ratio against a limit → meter*. Para **un cliente** las unidades sí son lo
correcto, porque señalan una sede: por eso el cliente lleva las 254 marcas y la
cartera lleva el medidor. La forma sigue al trabajo, y el trabajo cambia con el
nivel.

**Δ 2 · Ocupación por sede y espacios por estado son UN solo gráfico.** El brief
las pide como dos (barras ordenadas + unidades). Dibujadas por separado dicen lo
mismo dos veces: las dos ordenan sedes y las dos cuentan espacios. Fusionadas,
la fila de unidades tiene el largo del ranking y el color del estado; el bloque
vacío de TERRÓN se ve sin leer un número. Lo que se pierde —la línea de la media
del cliente, que no cabe en un eje de conteos— se recupera en H1, donde el 8,3 %
de TERRÓN es un punto sobre un eje de 0 a 100 con el promedio del cliente como
línea vertical: −34,6 pts.

**Δ 3 · Proveedores: 6 barras, no 25.** `choosing-a-form.md` y
`anti-patterns.md` coinciden: más de ~7 clases con significado → tabla. Y la
pregunta («¿de quién depende?») tiene una respuesta: Volcán. Lo correcto es
énfasis: uno en la tinta de dato, cuatro en el paso tenue, veinte en un bloque
gris. Las 25 filas están en la tabla del capítulo 4.

**Δ 4 · Valor en juego: tres cifras.** Medido sobre el JSON:
`Σ recomendaciones[].valor_estimado_mensual` = **$ 386.142.500** contra un
ingreso de $ 201.667.500. Ese 1,9× no es una oportunidad, es un error de suma
(`sede_subutilizada:TERRON` son los mismos espacios que `espacio_libre:*`, y
`concentracion_proveedor` es ingreso que ya entra). Se muestra tachado y
explicado, y se publican las tres cifras que sí existen.

**Δ 5 · Riel de 60 días, no de 90.** El backend sólo mira 60
(`DIAS_POR_VENCER`). Un riel de 90 con datos de 60 dibuja un tercio vacío que se
lee como «no hay vencimientos en noviembre», y lo que pasa es que no se miran.

---

## 4. El color, con el validador corrido

**Un sistema categórico (los cuatro estados del espacio de `tema.css`) y una
tinta de dato nueva.** Sin paleta de series y sin par divergente: la polaridad
de los movimientos la lleva la **posición sobre la línea del cero** y el signo
escrito, no el tono. Sigo la decisión del guion §4 y la verifiqué acá.

| rol | claro | oscuro | dónde |
|---|---|---|---|
| espacio **libre** | `#00805A` | `#00BE86` | unidades, barras, chips |
| espacio **se libera** | `#CE8A0A` | `#F5A524` | ídem — **y sólo ahí**: ningún aviso ni chip usa el ámbar |
| espacio **ocupado** | `#D8342E` | `#F4544E` | ídem |
| **no se alquila / sin dato** | `#AAB3BE` | `#33414F` | «otros 20 proveedores», bandas de mes sin snapshot |
| **tinta de dato** (nueva) | `#2E63C8` | `#4C89E8` | líneas, barras, puntos, dumbbells, medidor |
| **paso tenue** (nueva) | `#7FA8EC` | `#2F5EA6` | contexto: comercializables, salidas, el 2.º al 5.º proveedor |
| **acción principal** | `#F2B300` sobre `#120E00` | `#FFD028` | **un solo botón por pantalla** |

Comandos y salida **literal** de
`dataviz/scripts/validate_palette.js`.

**(a) Los tres estados + la tinta de dato, modo claro, sobre la tarjeta.**

```
$ node validate_palette.js "#00805A,#CE8A0A,#D8342E,#2E63C8" --mode light --surface "#FFFFFF" --pairs all

Palette (light, surface #FFFFFF, categorical): 4 slots
  [PASS] Lightness band         all 4 inside L 0.43–0.77
  [PASS] Chroma floor           all 4 >= 0.1
  [PASS] CVD separation         worst all-pairs #D8342E↔#00805A ΔE 9.2 (protan) · tritan 4.3
  [PASS] Normal-vision floor    worst all-pairs #D8342E↔#CE8A0A ΔE 17.9 (normal)
  [WARN] Contrast vs surface    below 3:1 — relief required (visible labels or table view): [["#CE8A0A",2.89]]

  → ALL CHECKS PASS
exit=0
```

**(b) Lo mismo sobre el papel `#EFF1ED`.**

```
$ node validate_palette.js "#00805A,#CE8A0A,#D8342E,#2E63C8" --mode light --surface "#EFF1ED" --pairs all

  [PASS] Lightness band · [PASS] Chroma floor
  [PASS] CVD separation         worst all-pairs #D8342E↔#00805A ΔE 9.2 (protan) · tritan 4.3
  [PASS] Normal-vision floor    worst all-pairs #D8342E↔#CE8A0A ΔE 17.9 (normal)
  [WARN] Contrast vs surface    below 3:1 — relief required: [["#CE8A0A",2.54]]

  → ALL CHECKS PASS
exit=0
```

El `WARN` del ámbar está cubierto por regla, no por suerte: **cada estado va
siempre con su palabra** (la leyenda dice «se libera en el periodo», la tabla de
espacios trae la palabra al lado del punto) y la marca se separa de sus vecinas
con 2 px de aire del color de la superficie, no con un borde.

**(c) Modo oscuro sobre el panel: reprueba, y es una desviación conocida.**

```
$ node validate_palette.js "#00BE86,#F5A524,#F4544E,#4C89E8" --mode dark --surface "#0B1116" --pairs all

  [FAIL] Lightness band         outside band: [["#00BE86",0.709],["#F5A524",0.782]]
  [PASS] Chroma floor           all 4 >= 0.1
  [WARN] CVD separation         worst all-pairs #F4544E↔#00BE86 ΔE 7.5 (deutan) · tritan 9.2
  [PASS] Normal-vision floor    worst all-pairs #F4544E↔#F5A524 ΔE 18.7 (normal)
  [PASS] Contrast vs surface    all 4 >= 3:1

  → FAILED — fix the marked checks
exit=1
```

**No lo introduce esta opción y no propongo tocar los hex.** `tema.css`
(líneas 55-72) documenta por qué: bajar la claridad para entrar en la banda
hunde el par ámbar↔rojo por debajo del piso duro en deuteranopía. Los dos peores
pares son exactamente los mismos con y sin la tinta de dato, con los mismos ΔE:
**el azul no empeora ni un solo par**. Las dos compensaciones que exige
`tema.css` —la palabra siempre presente y el borde en todo relleno de estado—
se respetan sin excepción. Sobre la sala oscura `#04070A` la corrida es idéntica
(mismos ΔE, contraste ≥ 3:1 en los cuatro).

**(d) La tinta de dato sola, en las cuatro superficies.**

```
$ node validate_palette.js "#2E63C8" --mode light --surface "#FFFFFF"   → ALL CHECKS PASS  exit=0   (contraste 5,62:1)
$ node validate_palette.js "#2E63C8" --mode light --surface "#EFF1ED"   → ALL CHECKS PASS  exit=0   (contraste 4,95:1)
$ node validate_palette.js "#4C89E8" --mode dark  --surface "#0B1116"   → ALL CHECKS PASS  exit=0   (contraste 5,47:1)
$ node validate_palette.js "#4C89E8" --mode dark  --surface "#04070A"   → ALL CHECKS PASS  exit=0
```

**(e) La rampa ordinal de dos pasos (fuerte / tenue), en los dos modos.**

```
$ node validate_palette.js "#7FA8EC,#2E63C8" --mode light --surface "#FFFFFF" --ordinal
  [PASS] Lightness monotone · [PASS] Adjacent ΔL · [PASS] Light-end contrast 2.41:1 · [PASS] Single hue (1°)
  → ALL CHECKS PASS   exit=0

$ node validate_palette.js "#2F5EA6,#4C89E8" --mode dark --surface "#0B1116" --ordinal
  [PASS] Lightness monotone · [PASS] Adjacent ΔL · [PASS] Light-end contrast 2.96:1 · [PASS] Single hue (0°)
  → ALL CHECKS PASS   exit=0
```

**(f) Un cambio contra el guion, medido.** El guion propone `#8FB3E8` como paso
tenue en claro. Como **rampa ordinal** pasa; pero ese paso no sólo es contexto:
también identifica una serie (los espacios comercializables en la tendencia, las
salidas en los movimientos), así que tiene que aguantar el piso de croma
categórico, y no lo aguanta:

```
$ node validate_palette.js "#8FB3E8" --mode light --surface "#FFFFFF"
  [FAIL] Chroma floor           below floor (reads gray): [["#8FB3E8",0.086]]   exit=1

$ node validate_palette.js "#7FA8EC" --mode light --surface "#FFFFFF"
  [PASS] Chroma floor           all 1 >= 0.1                                    exit=0
```

Uso **`#7FA8EC`**: pasa las dos puertas (ordinal y categórica) y mantiene el
mismo tono que la tinta fuerte (1° de diferencia). En oscuro el paso tenue del
guion, `#2F5EA6`, pasa las dos y queda igual.

**(g) El gris `#AAB3BE` reprueba el piso de croma a propósito** (`C 0.019`,
«reads gray»): ese es exactamente su trabajo. No entra en la corrida categórica;
se verifica con contraste WCAG contra la superficie, como ya dice `tema.css`
para `--resto`.

**Texto:** ningún texto lleva el color del dato. La identidad la da la marca de
color al lado. Los tokens de texto usados son `--ink-1` (19,1:1 sobre la
tarjeta), `--ink-2` (7,06:1) e `--ink-3` (6,13:1 tarjeta / 5,39:1 papel).
**`--ink-4` no se usa como texto en ninguna parte**: da 3,98:1 sobre el papel
`#EFF1ED` y no llega al piso de 4,5.

---

## 5. Qué dejé afuera, y por qué

**a) El plano de la sede.** El guion pide encender el plano al abrir «TERRÓN ·
96». `detalle_cliente.espacios[]` trae código, sede, cara, tipo, zona y m²,
**pero no coordenadas**: no hay con qué dibujar un plano. Dibujar uno inventado
sería el peor pecado posible en una pantalla que se juzga por honestidad. En su
lugar, el ancla es la **sede**: los códigos se agrupan por sede y la fila de
unidades del capítulo 1 muestra dónde está el hueco.

**b) El selector de periodo, funcionando.** Está en la barra con los 12 meses de
la serie, pero sólo `2026-09` queda habilitado: el ejemplo trae un periodo con
detalle. Un selector que finge que hay 12 periodos es una promesa falsa.

**c) El total de contratos por cliente en la cartera.** `/metricas` publica
`top_proveedores` sin denominador, así que en la cartera **no hay participación
%**: la barra de «otros» sólo se puede calcular en el detalle. En la cola se
muestran los conteos y nada más.

**d) Los $ 4.250.000 de los dos contratos fuera del plano.** El endpoint publica
`contratos_fuera_del_plano = 2` y nada más; de esos dos, sólo `PALMAR-VIT-03`
aparece con canon ($ 1.850.000) porque está en vencimientos. La línea al pie de
la tabla de contratos dice el conteo, dice que suman al ingreso y no a la
ocupación, y dice que la lista no la publica el endpoint. La cifra total del
guion no la imprimo porque no la puedo rastrear.

**e) La tarifa de referencia del cliente.** Nunca aparece. Sólo su relación
(`spread_pct`) y si existe (`tarifa_configurada`). El «≈ $ 23.100.000 sin
cobrar» de Superandes va rotulado como aproximación y con su denominador
(72 de 74 contratos con tarifa aplicable), redondeado a la centena de mil.

**f) Colores para la señal de la cola.** La prioridad va por **orden, peso
tipográfico y palabra**, con un corte visible después del cuarto cliente («el
resto puede esperar»). No inventé una escala de colores de urgencia: habría que
meter un rojo o un ámbar que ya significan «ocupado» y «se libera» en la misma
pantalla. Por la misma razón, el aviso de la contradicción y el candidato con
«ojo» usan una regla gruesa en tinta de texto, no el ámbar.

**g) Cuatro cifras que no salen del JSON.** Las de la columna «ago. comparable»
(5 clientes · 513 espacios · 47,4 % · $ 375.100.000). El recálculo de agosto sin
Guadual no lo devuelve `/metricas` ni `/tendencia`, y sin él el titular miente.
Están en una constante `GUION` marcada en el código, y en pantalla la nota dice
de dónde salen y que las calcula el frontend.

**h) Movimientos en el capítulo 1.** El guion los pone en el mapa de formas
junto a la tendencia; el gráfico divergente vive en el capítulo 4, con la tabla
de movimientos que le corresponde. En el capítulo 1 la cancelación de mayo es
**una anotación sobre la línea de ingreso**, que es lo que la historia necesita
ahí. El capítulo 1 ya tiene dos paneles; un tercero lo volvía un dashboard.

**i) Una diferencia con el guion, dicha en voz alta.** El guion cuenta que en
mayo «se perdieron $ 7.200.000: Higiénicos Zafra canceló 6 contratos». Los dos
datos son ciertos pero no son el mismo número: las 6 cancelaciones suman
**$ 9.422.500** (`movimientos[2026-05].salidas`) y los $ 7.200.000 son la caída
del ingreso entre mayo y junio, ya neta de las entradas del mes. La pantalla
dice los dos y no afirma que uno cause exactamente al otro.

---

## 6. Cómo está hecho

- **Un archivo.** HTML + CSS + JS en línea; el JSON incrustado como
  `application/json` y parseado en el arranque. Ningún `fetch`, ninguna fuente
  remota, ninguna librería.
- **Los gráficos son SVG escritos a mano a la escala del dato.** Los paneles de
  líneas y las barras divergentes se dibujan al ancho medido del contenedor y se
  repintan al redimensionar; las barras, dumbbells, puntos, riel, medidor y
  unidades son SVG **sin `viewBox`**, con los largos en porcentaje y los
  redondeos en px, así que escalan sin deformar el extremo de 4 px.
- **Marcas, según `marks-and-anatomy.md`**: barras de 14 px (tope 24), extremo
  del dato redondeado 4 px y base recta sobre el cero; líneas de 2 px con
  uniones redondeadas; marcador de extremo r=4,5 con anillo de 2 px del color de
  la superficie; 2 px de aire entre relleno y resto; rejilla de 1 px sólida
  (nunca punteada); etiquetas sólo en el extremo y en los puntos que cuentan la
  historia.
- **Accesibilidad.** Cada gráfico tiene su tabla equivalente en un `<details>`
  alcanzable sin hover; los `<title>` de las marcas son un extra, nunca el único
  camino a un valor. Los nombres de proveedor y de espacio se insertan
  escapados (son dato, no plantilla). `role="img"` + `aria-label` con la frase
  del bloque en los gráficos que no son decorativos; los que duplican un valor
  ya escrito van `aria-hidden`. Foco visible con el token `--ring`.
- **Interacción según `interaction.md`.** Una sola fila de filtros arriba de las
  cinco tablas que alcanza (nunca un filtro por tarjeta); el periodo manda sobre
  las tres piezas; los objetivos de clic son la fila entera.

### Verificación (Playwright, Chromium 1194)

`node verificar.mjs` abre el archivo en 1440×900, 1366×768 y 390×844, en claro y
en oscuro, recorre las tres piezas, los cinco capítulos, los dos clientes y las
cinco pestañas de datos —36 pantallas, todas guardadas como captura— y comprueba:

| Comprobación | Resultado |
|---|---|
| Errores y advertencias de consola | **0** |
| Textos pisados dentro de los SVG (entre sí, contra los `rect`, o fuera del lienzo) | **0** |
| Cajas de anotación pisadas o fuera del panel | **0** |
| Contraste de texto < 4,5:1 (3:1 en texto grande), calculado sobre el fondo real | **0** |
| Elementos con `var(--signal)` por pantalla visible | **exactamente 1** en cada una |
| Scroll horizontal del documento | **0 px** en las tres anchuras |

Además, `node imprimir.mjs` genera el informe en A4 con `printBackground` y sin
errores: dos páginas, sin nada cortado.

---

## 7. Qué mediría para saber si funciona

1. **Tiempo hasta la primera llamada.** Segundos entre abrir la cartera y abrir
   una sesión. Hoy la queja es «un montón de información sin orden»: si la cola
   funciona, esto baja y se estabiliza en menos de 15 s.
2. **Coincidencia con el orden propuesto.** Qué porcentaje de las sesiones
   abiertas en el día son de los cuatro primeros de la cola. Si es bajo de
   forma sostenida, mi regla de orden es la equivocada, no el operador.
3. **Profundidad de la sesión.** Cuántos de los cinco capítulos se visitan y en
   qué orden. Si el capítulo 4 se abre antes que el 2, el resumen no está
   convenciendo y la gente sigue yendo a la tabla cruda.
4. **Aperturas del escalón 4.** Cuántas veces se abre la lista de códigos de una
   recomendación. Si es casi siempre, la frase agregada no alcanza; si es casi
   nunca, sobra el cajón (pero no la posibilidad).
5. **Recomendaciones que terminan en algo.** Marcar «propuesta enviada» sobre la
   acción y medir el valor propuesto contra el valor contratado el mes
   siguiente. Es la única medición que dice si la asesoría sirve.
6. **La contradicción.** Cuántas veces se le ofrece a Volcán un espacio después
   de haber visto el aviso. Si el aviso no cambia la conducta, hay que subirlo
   de lugar o dejar de ponerlo.
7. **El informe.** Cuántas sesiones terminan en un informe impreso o compartido,
   y si el cliente vuelve a entrar a la plataforma en los 7 días siguientes
   (`adopcion.dias_sin_acceso` antes y después).
8. **Prueba de pasillo, sin README.** Sentar a un gerente de supermercado
   delante del informe y pedirle que diga en voz alta qué haría este mes. Si no
   nombra TERRÓN y las góndolas en el primer minuto, el titular falló.
