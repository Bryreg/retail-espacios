# Fase 5 — Frontend + Analista: gráfico de tendencia en /plataforma

Builder: **Frontend + Analista — gráfico de línea de tendencia en la consola
/plataforma**. Rama `claude/fase-5-tendencia`. Sin commit ni push (según
instrucción).

## Archivos tocados

- `/tmp/retail-espacios-test/frontend/src/api/plataforma.ts` — agregado al
  final: `CONSOLIDADO_SLUG`, `interface PuntoTendencia`, `interface
  Tendencia`, `getTendencia(cliente, meses)`.
- `/tmp/retail-espacios-test/frontend/src/components/plataforma/tendencia.tsx`
  — **NUEVO**: `LineaTendencia` (gráfico SVG propio), `LeyendaMarcadores`,
  `lecturaAccionable` + helpers de formato de delta, `PanelTendencia`, y el
  hook `useTendencia`.
- `/tmp/retail-espacios-test/frontend/src/pages/Plataforma.tsx` — importa y
  monta `PanelTendencia` debajo de la tabla de clientes; agrega
  `metricasVersion` (contador que sube al resolver `cargarMetricas`, éxito o
  error) y un `useEffect` que dispara `tend.cargar` recién ahí, y también al
  cambiar cliente/meses.
- `/tmp/retail-espacios-test/frontend/src/index.css` — dos tokens nuevos,
  `--con-linea` y `--con-linea-punto`, en `:root` (claro, `#2A6890`) y bajo
  `[data-consola-tema="oscuro"]` (`#6BB6E6`). Reusa `--con-suprimido-hatch` y
  `--con-sindato-ink` ya existentes para los marcadores de suprimido/sin dato
  — no hace falta ningún token más.

Nada tocado fuera del territorio: sin cambios en `backend/**`, `docs/**`,
`package.json` ni otros componentes de `plataforma/`.

## Conflicto encontrado y resuelto: el contrato de `api/plataforma.ts`

A mitad de la tarea, `frontend/src/api/plataforma.ts` cambió en disco (otra
sesión escribiendo el mismo archivo compartido) a un shape DISTINTO del
contrato literal que traía esta tarea: `PuntoTendencia` anidaba
`metricas: AgregadosMetricas` en vez de traer los campos planos, no tenía
`sin_dato`/`capturado_en`/`origen`, y `Tendencia` usaba `meses_pedidos` +
`suficiente` en vez de `meses`/`desde`/`hasta`/`periodo_actual`/`nombre`.

Antes de adoptarlo o de revertirlo a ciegas, leí el backend real
(`backend/app/plataforma_tendencia.py::serie()` y `_mes_vacio()`, y el router
en `backend/app/routers/plataforma.py`), que en este repo YA estaba escrito
por el otro agente. Ese código devuelve exactamente el contrato ORIGINAL de
esta tarea — plano, con `sin_dato`, `capturado_en`, `origen`,
`clientes_incluidos`, `clientes_con_error`, y el envoltorio
`cliente`/`nombre`/`meses`/`desde`/`hasta`/`periodo_actual`/`generado_en`/`serie`.
El shape que había quedado en disco no correspondía a ningún endpoint real:
era, al parecer, un borrador de otra sesión que no llegó a chequear contra el
backend ya construido.

**Restauré el bloque de tendencia en `api/plataforma.ts` al contrato
original**, verificado línea por línea contra `plataforma_tendencia.py`. Con
esto la app compila y consume el JSON real. Esto es una discrepancia entre
sesiones que el Maestro debería revisar al fusionar — dejo la traza acá en
vez de silenciarla.

## Decisiones de presentación

**Dos gráficos apilados, nunca doble eje.** Ocupación (%) e ingreso
(dinero) tienen escalas y semánticas distintas — mezclarlas en un eje
compartido (o dos ejes Y en el mismo gráfico) hace que una serie visualmente
"aplaste" a la otra según la escala relativa, y el lector termina leyendo la
FORMA de una curva contra el eje equivocado. Apilados, cada uno tiene su
propio eje desde cero, igual criterio que las barras de Fase 4.

**Las tres ausencias, tres tratamientos:**
- `sin_dato: true` → tick gris vertical (`--con-sindato-ink`), sin punto ni
  relleno, tooltip "· sin dato". La línea se corta ahí: no hay tramo hacia
  ni desde ese mes (nunca se interpola sobre un hueco real).
- Suprimido K=3 (sólo aplica al campo de ingreso: `ingreso_contratado_mes`
  null con `sin_dato=false`) → marcador cuadrado con relleno rayado
  (`<pattern>` SVG usando `--con-suprimido-hatch`), tooltip "suprimido por
  privacidad (K=3)". También corta la línea.
- `ocupacion_pct: null` con `sin_dato=false` (sin espacios comercializables
  ese mes) → mismo tratamiento visual que "sin dato" en el gráfico de
  ocupación (es un hueco real de ESA métrica), pero el tooltip NO dice "K=3"
  porque no lo es — la supresión de celda chica del backend
  (`_suprimir_celda_chica`) nunca toca `ocupacion_pct`. Decidí no inventar un
  tercer marcador visual para este caso: la leyenda de la consola ya define
  sólo dos categorías ("sin dato" / "suprimido K=3") y un tercer ícono sin
  leyenda propia sería más confuso que preciso. El texto del tooltip es la
  fuente de verdad del motivo.
- Un **0 real** (por ejemplo `ingreso_contratado_mes: 0` cuando no hubo
  contratos ese mes, con `sin_dato=false`) se dibuja como un punto normal en
  y=0 — nunca como hueco ni como suprimido. Se verificó explícitamente en el
  Caso 4 de las capturas (el "valle" del gráfico de ingreso).

**Mes parcial**: punto hueco (`fill: var(--con-surface)`, sólo el trazo en
color), el tramo que entra a él punteado (`strokeDasharray`), y la etiqueta
de mes en negrita con "· parcial" debajo. Nunca participa como "mes
anterior" ni como parte de una racha en la lectura accionable.

**Lecturas accionables mostradas y su condición exacta** (una por gráfico,
sobre el título):
- `vs mes anterior: ±X pts` (ocupación) / `±X %` (ingreso, contra la base del
  mes anterior; si esa base es 0, cae a `±$monto`) — SÓLO si el último mes
  CERRADO (no parcial) y el mes calendario inmediatamente anterior tienen
  ambos valor real (ni `sin_dato`, ni suprimido, ni null por "sin espacios").
- `subió/bajó N meses seguidos` — SÓLO con `N ≥ 2` pasos consecutivos,
  calendario-adyacentes, todos en la misma dirección, terminando en el
  último mes cerrado. Un cambio de dirección o un hueco en medio corta la
  racha ahí.
- Si ninguna de las dos condiciones se cumple, **no se muestra nada** — ni
  "estable" ni ningún texto inventado. Verificado en el Caso 3 (K=3): el
  ingreso no muestra racha porque el mes suprimido rompe la adyacencia.

**Estado vacío honesto**: con menos de 2 meses `sin_dato=false` en toda la
serie, no se dibuja ningún gráfico — se muestra el texto exacto pedido por
la spec, con el estilo `EstadoVacio` de la consola (Caso 2 en las capturas).

**Accesibilidad**: cada SVG lleva `role="img"` + `aria-label` con un resumen
textual (rango de meses, cuántos con dato, último valor), y un `<details>`
con una tabla de valores por mes debajo de cada gráfico (visible al abrir,
navegable por teclado, no depende del SVG). Cada punto/marcador lleva
`<title>` nativo como tooltip: `"YYYY-MM · {unidad} {valor} · {contexto}"`
(contexto = espacios comercializables para ocupación, clientes incluidos
para ingreso), con "· parcial (mes en curso)" agregado cuando corresponde.
Selectores de cliente/meses llevan `con-focusable` (foco de teclado visible,
mismo tratamiento que el resto de la consola).

**Ancho del eje Y dinámico**: el padding izquierdo del SVG se calcula del
largo del texto del techo del eje (`formato(ejeMax)`), no es una constante
fija — un monto grande como "$93.400.000" necesita más espacio que "100,0 %"
y un valor fijo lo recortaba contra el borde del `viewBox` (bug encontrado y
corregido durante la prueba visual, ver capturas).

**Sin librería de charts, sin scripts inline, sin recursos externos**: todo
el gráfico es SVG a mano con `<line>`/`<circle>`/`<rect>`/`<pattern>` y
colores vía `style={{ fill/stroke: "var(--con-*)" }}` (permitido por la CSP
de Fase 3, que ya admite `unsafe-inline` en `style-src`; `script-src` sigue
sin tocarse).

## Tokens agregados (`frontend/src/index.css`)

```
:root {
  --con-linea:       #2A6890;
  --con-linea-punto: #2A6890;
}
[data-consola-tema="oscuro"] {
  --con-linea:       #6BB6E6;
  --con-linea-punto: #6BB6E6;
}
```

Reusa `--con-suprimido-hatch`, `--con-sindato-ink`, `--con-surface`,
`--con-ink-*`, `--con-line*` ya existentes de Fase 4b. No se agregó ningún
token de estado nuevo (ocupación sigue siendo magnitud de un solo matiz, la
línea usa el mismo criterio).

## Verificación

```
cd /tmp/retail-espacios-test/frontend && npx tsc --noEmit   → limpio, sin salida
cd /tmp/retail-espacios-test/frontend && npm run build       → ✓ built in ~14-18s
                                                                (2215 módulos,
                                                                 mismo conteo
                                                                 que antes de
                                                                 esta fase +
                                                                 los 2 archivos
                                                                 nuevos; el
                                                                 chunk único de
                                                                 2.1 MB es
                                                                 preexistente,
                                                                 no de esta
                                                                 fase)
```

No pude correr `cd backend && python -c "import app.main"` como parte de MI
verificación porque mi territorio es exclusivamente frontend y el backend
está en construcción activa por otro agente en paralelo (archivos
`backend/**` con cambios sin terminar al momento de escribir esto) — el
Maestro/backend confirma esa pata.

### Los cuatro casos de la spec, probados con datos fixture

Armé un harness temporal (`src/DebugTendencia.tsx` + ruta `/debug-tendencia`
en `App.tsx`, resuelta ANTES del guard de sesión, igual patrón que
`/politica-datos`) con `PanelTendencia` renderizado 4 veces contra series de
prueba tipadas como `Tendencia`/`PuntoTendencia` reales:

1. **Serie completa 12 meses** — línea continua, lectura accionable con
   delta y racha ("bajó 5 meses seguidos").
2. **1 solo mes** → estado vacío honesto, sin línea de un punto.
3. **Mes con K=3** (ingreso/canon suprimidos, `top_proveedores: []` ese mes)
   intercalado entre meses con dato → marcador hatch, línea cortada a los
   dos lados, sin racha (el hueco la corta).
4. **Huecos `sin_dato`** (dos meses seguidos sin snapshot) + un mes con
   `ocupacion_pct: null`/`sin_dato: false` (sin espacios comercializables,
   con `ingreso_contratado_mes: 0` real ese mismo mes) → ticks grises en
   ocupación, un punto real en y=0 en ingreso (el "valle" de la curva, no un
   hueco).

Levanté `npm run dev` (puerto 5183) y capturé con `npx playwright screenshot`
(Chromium recién instalado en este entorno, `npx playwright install
chromium`) en `?tema=claro` y `?tema=oscuro`. Revisé contraste de línea,
puntos y etiquetas en ambos temas — visualmente correcto en las cuatro
combinaciones (line color `#2A6890`/`#6BB6E6` contra `--con-surface`
blanco/`#1A2026`, labels en `--con-ink-4`).

**Al terminar, borré el harness completo**: `src/DebugTendencia.tsx`, el
script de captura, y reverti `App.tsx` a su estado original (`git diff
frontend/src/App.tsx` sin salida) — no queda ningún rastro de código de
depuración en el árbol.

## Capturas

- `/tmp/retail-espacios-test/features/tendencia/outputs/capturas/tendencia-claro.png`
- `/tmp/retail-espacios-test/features/tendencia/outputs/capturas/tendencia-oscuro.png`

Cada una muestra los 4 casos apilados verticalmente, con la lectura
accionable, la leyenda de marcadores y el `<details>` de valores visibles.

## Párrafo para `docs/ESTADO.md` (lo pega el Maestro, no yo)

> **Frontend de Fase 5 (tendencia)**: `PanelTendencia`
> (`frontend/src/components/plataforma/tendencia.tsx`), montado en
> `/plataforma` debajo de la tabla de clientes, agrega dos gráficos de línea
> SVG propios (ocupación e ingreso contratado, NUNCA doble eje) contra
> `GET /plataforma/tendencia`. Reusa el sistema visual de Fase 4b
> (`Panel`, tokens `--con-*`) más dos tokens nuevos `--con-linea`/
> `--con-linea-punto`. Distingue visualmente sin_dato / suprimido K=3 / mes
> parcial / 0 real, nunca interpola sobre un hueco, y sólo muestra una
> lectura de delta o racha cuando los meses comparados tienen dato real y
> son calendario-adyacentes — si no se puede afirmar nada, no dice nada. Con
> menos de 2 meses de historia muestra el estado vacío honesto en vez de una
> línea de un punto. La tendencia se recarga DESPUÉS de que las métricas del
> período resuelven (el backend hace write-through del snapshot al calcular
> métricas), no antes.

## GAPS (para el backend / el Maestro)

1. **`ocupacion_pct: null` con `sin_dato: false` no tiene marcador propio en
   la leyenda de la spec** (que sólo define "sin dato" y "suprimido K=3").
   Lo tratamos visualmente como "sin dato" de esa métrica puntual (con
   tooltip que aclara el motivo real), pero si el Analista/Maestro prefiere
   un tercer marcador explícito en la leyenda ("sin espacios
   comercializables"), es un cambio menor y acotado a `LineaTendencia` +
   `LeyendaMarcadores`.
2. **El contrato de `api/plataforma.ts` se pisó una vez en disco** durante
   esta sesión con un shape distinto (ver sección "Conflicto encontrado y
   resuelto" arriba) — restaurado contra el backend real, pero vale que el
   Maestro confirme que ninguna otra sesión sigue trabajando contra el shape
   viejo (`meses_pedidos`/`suficiente`/`metricas` anidado) en algún otro
   archivo que yo no haya tocado.
3. **No pude correr la suite de backend** (fuera de mi territorio y en
   construcción activa en paralelo) — la verificación de
   `python -m pytest -q` completa queda para el backend/Maestro antes de
   fusionar.
4. **`formatoDeltaCOP`** usa "vs mes anterior" en % cuando el mes base es
   > 0, y cae a un delta en pesos (`+$monto`) si la base es 0 — no hay caso
   de esto en la spec explícitamente, es una decisión de analista para
   evitar un "% de aumento" sin sentido (división por cero / infinito) sin
   dejar de decir algo útil. Documentado acá por si el Analista humano
   prefiere otro criterio.
