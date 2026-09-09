# Port de los gráficos de A · Fase 11

Qué se entrega, qué decisión lleva adentro cada cosa, qué se midió y qué queda
para quien arme las pantallas.

**Alcance:** la hoja de estilo de la pantalla, los diez dibujos como
componentes React puros, y los formateadores. **No** se armaron pantallas
(`Plataforma.tsx`, `DetalleCliente.tsx`): eso es del agente de página.
`ReportePlataforma.tsx` no se toca. Backend, cero cambios.

---

## 1. Archivos

| Archivo | Qué es |
|---|---|
| `/tmp/retail-espacios-test/frontend/src/plataforma.css` | 650 líneas. Todo el CSS de A bajo la clase raíz `.plat`, importado desde `index.css` (patrón de `vender.css`). |
| `/tmp/retail-espacios-test/frontend/src/components/plataforma/graficos.tsx` | 1.902 líneas. Los diez componentes + los helpers de derivación. |
| `/tmp/retail-espacios-test/frontend/src/components/plataforma/formato.ts` | 188 líneas. Plata en COP, %, puntos, fechas por trozos, nombres de tipo, `—` para `null`. |
| `/tmp/retail-espacios-test/frontend/src/components/plataforma/README-graficos.md` | La tabla §1 del README de A (dato → forma → componente) y las props de cada uno. |
| `/tmp/retail-espacios-test/frontend/src/index.css` | +4 líneas: `@import "./plataforma.css";` |
| `/tmp/retail-espacios-test/frontend/scripts/probar-graficos.mjs` | El verificador propio. `npm run probar:graficos`. |
| `/tmp/retail-espacios-test/frontend/pruebas/graficos.html` · `graficos.tsx` | El banco de pruebas: los diez dibujos con los datos de `ejemplo.json`. Vive fuera de `src`, así que no entra en el bundle ni en `tsc`. |
| `/tmp/retail-espacios-test/frontend/package.json` | +1 script: `probar:graficos`. **No** se agregó a la cadena `npm run probar` (necesita navegador y servidor, que esa cadena evita a propósito). |

---

## 2. Los diez componentes

`nombre → dato que recibe → props`

| Componente | Dato | Props |
|---|---|---|
| `Medidor` | ocupación de la **cartera** | `ocupacionPct: number\|null` · `espaciosComercializables: number` · `referencia?: {pct, rotulo}\|null` · `nota?` |
| `DosLineasConteo` | `Tendencia.serie` | `serie: PuntoTendencia[]` · `anotaciones?: Anotacion[]` · `etiquetaTotal?` · `etiquetaOcupados?` · `rotulo?: string\|null` |
| `LineaIngreso` | `Tendencia.serie` | `serie: PuntoTendencia[]` · `anotaciones?` · `rotulo?` |
| `BarrasSedes` | `DetalleCliente.espacios` | `espacios: EspacioDetalle[]` · `promedioPct: number\|null` |
| `Unidades` | espacios por tipo / clientes por clase | `grupos: GrupoUnidades[]` · `disposicion?: "filas"\|"columnas"` · `clave?` — con `unidadesPorTipo(espacios, resumen)` y `unidadesAdopcion(clientes)` |
| `Dumbbell` | `resumen_por_tipo` + `benchmark_plataforma` | `resumen: ResumenTipoDetalle[]` · `benchmark: Record<string,number>` |
| `EjeSpread` | `MetricasPlataforma.clientes` | `clientes: ClienteMetricas[]` |
| `Enfasis` | `DetalleCliente.proveedores` | `proveedores: ProveedorDetalle[]` · `top?=5` · `umbralPct?=40` |
| `RielVencimientos` | `DetalleCliente.espacios` | `espacios: EspacioDetalle[]` · `hasta: string` · `hoy?: string` · `dias?=60` |
| `BarrasDivergentes` | `DetalleCliente.movimientos` | `movimientos: MovimientoMes[]` |

Todos aceptan además `titulo?`, `tabla?` (la tabla equivalente plegada) y
`tablaAbierta?` (para imprimir). Todos son puros: props → `<figure>` con un
`<svg>`; ni un `fetch`, ni un `useState`, ni un `useEffect`.

---

## 3. Lo que se respetó de A, y lo único que cambió

**Se respetó tal cual:** la escala (no se agrandó ni se engrosó nada), la
tinta de dato y su paso tenue, el medidor para la cartera y las unidades para
el cliente, la tendencia en conteos con el hueco de «sin snapshot» y la franja
«parcial», el largo de las barras de sede en espacios con **una marca de
referencia por barra**, el dumbbell con el tipo sin contratos que no dibuja
punto, el spread contra cero con los sin-tarifa contados aparte, el énfasis con
umbral en vez de 25 barras, el riel de 60 días (no de 90) con dos tramos
rotulados, las barras divergentes en pesos con la polaridad en la posición y
no en un segundo tono, y la tabla equivalente de cada dibujo.

**Los tres ajustes admitidos, y nada más:**

**(a) Los chips de señal, estado de cuenta y prioridad, en tinta gris.**
`.plat-chip--fuerte / --medio / --suave` usan `--ink-1/2/3` sobre
`--surface-2/3` con el borde como jerarquía. Los tres colores de estado
(`--libre / --entra / --ocupado`) quedan sólo en `.plat-pt--*` (la marca de una
clave) y adentro de los `<svg>`. `.plat-cand.ojo` (el aviso de concentración
sobre un candidato) también perdió el ámbar: va con borde firme y palabra.
El verificador lo afirma como regla, no como estilo.

*Una excepción, declarada:* `--entra` sigue en el chip «mes en curso · parcial»
y en la franja del mes parcial de las dos rejillas de doce meses. No es señal,
ni estado de cuenta, ni prioridad —es honestidad del dato— y **no comparte
figura con ningún estado de espacio**: `DosLineasConteo`, `LineaIngreso` y
`BarrasDivergentes` no dibujan libre/se libera/ocupado en ninguna parte. El
ámbar ahí no le enseña nada falso al ojo. Si el Verificador prefiere la lectura
estricta, es un cambio de dos declaraciones (`.plat-chip--parcial` y los dos
`fill="var(--entra)"` de las franjas).

**(b) El rótulo de la rejilla de doce meses lleva su cifra.**
`rotuloRejillaMeses(serie)` busca el salto de ocupación más grande entre dos
meses consecutivos con dato y lo escribe con sus cifras. Con los datos del
ejemplo sale, literal:

> *«De may a jun la ocupación cayó 13,2 pts, de 63,8 % a 50,6 %, y entraron 108
> espacios al denominador (ocupados 284 → 280).»*

La segunda mitad es la que desarma la trampa: la caída de 13 puntos es el plano
de TERRÓN entrando, no contratos que se perdieron. Y se escribe **sólo si el
dato la sostiene**: con 284 → 280 dice «(ocupados 284 → 280)», y sólo cuando el
conteo de ocupados no baja dice «sin perder un solo ocupado». Se calcula, no se
redacta: si el dato cambia, la frase cambia.

**(c) `--ink-4` no escribe.** Ni un `<text>` de los diez componentes usa
`--ink-4` (3,98:1 sobre el papel `--bg`). Todo el texto de los dibujos va en
`--ink-3` o más oscuro; `--ink-4` queda para rejillas y guías, que no son
texto. Es más estricto que el prototipo (donde los ejes iban en `--ink-4`
porque estaban sobre tarjeta blanca): así una figura es segura en cualquier
superficie, y el verificador lo afirma con un grep.

---

## 4. Lo que la API no trae y por eso no se pinta

El prototipo A trae un bloque `_derivado_frontend` que el backend **no**
devuelve. Se resolvió así, sin inventar campos:

- `canon_vs_benchmark_por_tipo` → se calcula en `Dumbbell` desde
  `resumen_por_tipo[].canon_promedio` y `benchmark_plataforma[tipo]`.
- ocupados por mes → `ocupadosDe(punto)` = `espacios_comercializables ×
  ocupacion_pct / 100`, redondeado, y `null` si falta cualquiera de los dos.
- estados por sede → se cuentan de `espacios[]` (el único lugar donde vive el
  tercer estado; `sedes[]` sólo trae ocupados/libres).
- `valor_en_juego`, `recomendaciones_por_prioridad`, `oportunidad_nueva` → **no
  son de un gráfico**: son cifras de DOM y las arma quien monte la sesión, con
  los formateadores de `formato.ts`.
- `libres_por_tipo_y_sede` → agrupación de `oportunidades[]`/`espacios[]`, del
  lado de la página.

**Frontera (brief §4), afirmada en el código:** la tarifa de referencia no
aparece en ninguna prop ni en ningún dibujo — sólo `spread_pct` y
`tarifa_configurada`. Los nombres de proveedor se pintan tal como llegan
(saneados por el backend), sin retoque. Todo es solo lectura: ningún componente
tiene `onClick`, ni un `input`, ni un `form`.

**Las tres ausencias, dichas y no rellenadas:** `ocupacionPct: null` dibuja la
frase «no es 0 %: es que no hay con qué calcularla»; un mes con `sin_dato`
dibuja un hueco rotulado y no una recta entre vecinos; un cliente sin
`spread_pct` se cuenta con su nombre al pie del eje y **no** se dibuja en cero.

---

## 5. El contrato de tamaño (por qué la letra mide lo que dice)

Todo `<svg>`: `viewBox="0 0 W H"` · `width:100%` · `min-width:W` · `height:H` ·
`preserveAspectRatio="xMinYMin meet"`.

El factor de escala es `min(ancho/W, alto/H)`. El alto está clavado en H, así
que **nunca pasa de 1** (un rótulo de 11,5 px no se infla a 17 px en una
ventana ancha); el `min-width` impide que **baje de 1** (no se hunde a 7 px en
una angosta) — en su lugar la caja se desliza dentro de `.plat-fig-cuerpo`.
Resultado medido: el cuerpo declarado es el cuerpo en pantalla, en todos los
anchos, y por eso la escala `--t-*` significa algo adentro de un dibujo.

Los cinco cuerpos que se usan salen de una tabla única (`VOZ`) y todos son
tokens: `--t-3xs` (10) · `--lbl-px` (10,5) · `--t-2xs` (11,5) · `--t-xs` (12,5)
· `--t-sm` (13,5). Donde A usaba un cuerpo que no está en la escala (11, 12,
13) se bajó al paso inmediatamente inferior: **nada creció**.

---

## 6. Mediciones

`cd /tmp/retail-espacios-test/frontend && npx tsc --noEmit` → **limpio**.

`npm run probar:graficos` (Chromium 1194, servidor propio en el puerto 5211,
matado al terminar) — 14 `<svg>` con los datos reales de `ejemplo.json`, 235
`<text>` medidos por pasada, 4 pasadas:

| Medición | claro 1440×900 | oscuro 1440×900 | claro 1366×768 | oscuro 1366×768 |
|---|---|---|---|---|
| textos por debajo de 10 px reales | **0** | **0** | **0** | **0** |
| textos por encima de 30 px reales | **0** | **0** | **0** | **0** |
| pares de `<text>` pisados (>1,5 px en los dos ejes) | **0** | **0** | **0** | **0** |
| textos fuera de la caja de su `<svg>` | **0** | **0** | **0** | **0** |
| errores de consola | **0** | **0** | **0** | **0** |

Afirmaciones estáticas, en la misma corrida: los 5 pasos de `VOZ` caen entre 10
y 30 px · ningún `fontSize` fuera de `VOZ` · ningún `<text>` con `--ink-4` ·
ningún segundo eje · `plataforma.css` no pinta un solo fondo con `--signal` ·
todas sus reglas cuelgan de `.plat` · ningún chip de señal usa un color de
estado de espacio. **Ocho de ocho.**

`npm run probar:tema` → **24 pruebas, verdes** (el `@import` nuevo no mueve el
amarillo ni el contraste). `npm run probar:vender` → **12 pruebas, verdes**.

Dos correcciones que salieron de la medición y no de mirar la pantalla:
el lienzo del medidor pasó de 96 a 104 px de alto (la clave dibujada adentro
se salía por el descendente), y la cifra del «otros N proveedores» del énfasis
se corre al otro lado de la línea del umbral cuando esa línea la partiría en
dos.

---

## 7. Lo que queda para quien arme las pantallas

1. **La frase-conclusión es del bloque, no del componente.** Cada figura va
   debajo de su `.plat-frase` con su número, y de la ruta del JSON en mono
   (`.plat-fuente`). Un gráfico sin la frase de arriba está incompleto.
2. **El presupuesto de ancho es 940 px** (900 el medidor). Con `.plat-doc` a
   1000 y `.plat-bloque` con `--s5` de padding quedan 950: entra justo, que es
   como entraba en A. Si la columna se angosta, la figura se desliza.
3. **`tabla` no es opcional en la práctica.** Es el camino accesible al valor;
   sin ella el dibujo queda sin tabla equivalente. Y para imprimir hay que
   pasar `tablaAbierta` (o abrir los `<details>` en `onbeforeprint`): el CSS de
   impresión ya destapa `::details-content` donde el motor lo soporta.
4. **Las clases del documento ya están**: `.plat-cap`, `.plat-frase`,
   `.plat-bloque`, `.plat-kpi.hero`, `.plat-fila-cli`, `.plat-rec`,
   `.plat-esc`, `.plat-cand`, `.plat-grupo`, `.plat-aviso`, `.plat-pie`,
   `.plat-hoja` y el bloque `@media print` de las tres páginas A4.
5. **El amarillo sigue siendo uno solo** y es `.btn-principal` de `index.css`.
   `plataforma.css` no lo define, a propósito: si se pudiera pedir desde dos
   lugares, dejaría de ser uno.
6. **`docs/ESTADO.md`** hay que actualizarlo en el mismo PR con la Fase 11: la
   hoja nueva, la clase raíz `.plat`, la regla de los chips grises y el
   hallazgo de `--ink-4` sobre el papel (que vale para todo el sistema, no sólo
   para esta pantalla).
