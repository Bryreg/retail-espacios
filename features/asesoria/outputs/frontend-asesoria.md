# Frontend Asesoría — columna vs tarifa, tile de spread, panel Adopción

Agente: Frontend Asesoría (builder) · Fase 6 · rama `claude/fase-6-asesoria`.
Codificado contra el **contrato JSON del Maestro** (sección de la misión),
no contra una respuesta real del backend — que se implementa en paralelo.

## Archivos tocados

- `frontend/src/api/plataforma.ts` — campos nuevos + bloque Adopción.
- `frontend/src/pages/Plataforma.tsx` — columna "vs tarifa", KPI tile,
  montaje de `PanelAdopcion`.
- `frontend/src/components/plataforma/adopcion.tsx` (NUEVO) — `useAdopcion()`
  + `PanelAdopcion` + `ClasificacionPill`.

No se tocó `consola.tsx`, `tendencia.tsx`, backend ni `docs/ESTADO.md`.

## 1. `api/plataforma.ts`

- `AgregadosMetricasCliente` gana `spread_pct: number | null`,
  `tarifa_configurada: boolean`, `contratos_sin_tarifa: number` — con
  comentario explicando los DOS motivos de `null` (sin tarifa vs K=3) y que
  la tarifa en sí nunca viaja.
- `ConsolidadoMetricas` gana `spread_pct: number | null`,
  `clientes_con_tarifa: number` — comentario: ponderado Σ canon/Σ tarifa,
  nunca promedio de spreads.
- Bloque nuevo completo: `Clasificacion`, `CohorteAdopcion`, `ClienteAdopcion`,
  `Adopcion`, `getAdopcion()` — copiados literalmente del contrato del
  Maestro (mismos nombres de campo, mismo orden), con comentarios en el
  estilo del archivo (shape fijado, no ajustado a ojo) y la nota de que el
  frontend nunca re-deriva `clasificacion`.
- `getAdopcion()` sigue el mismo guardrail que `getMetricasPlataforma` /
  `getTendencia`: nunca se persiste en `localStorage`, vive sólo en el estado
  del componente.

## 2. Columna "vs tarifa" en la tabla Clientes (`Plataforma.tsx`)

- `W_SPREAD = 96`, agregada junto a las otras constantes `W_*`; el
  `TablaScroll minWidth` subió de `760` a `856` (96 + 10 de gap).
- `TablaHeadCelda width={W_SPREAD} alinear="right"` con texto "vs tarifa",
  ubicada entre "Ingreso (mes)" y "Últ. acceso" (mismo orden que la celda en
  `FilaCliente`).
- `celdaSpread(m)` — tres salidas visuales:
  - **valor** (con tarifa configurada y `spread_pct !== null`):
    `formatoSpread(n)` → signo menos tipográfico U+2212 (nunca el guion
    ASCII), coma decimal, espacio fino U+2009 antes de "%". Ejemplos:
    `−12,4 %` (negativo), `+3,1 %` (positivo), `0,0 %` (cero exacto, sin
    signo). Color: `--con-estado-aviso` (el mismo ámbar que gracia/solo
    lectura en `EstadoPill`) cuando `spread_pct < 0` — es la lectura que
    dispara la conversación de asesoría; `--con-ink-2` (neutro) en 0 o
    positivo.
  - **Suprimido** (`tarifa_configurada === true && spread_pct === null`):
    `<Suprimido compacto />` de `consola.tsx` — mismo ícono + "‹3" que ya usa
    `celdaPlata` para el canon, mismo tooltip nativo del componente.
  - **"sin tarifa"** (`tarifa_configurada === false`): texto plano en
    `--con-ink-4`, sin ícono — no es K=3 ni un error, es que el cliente no
    configuró nada todavía.
  - **"—"**: cuando `m` es `null` (antes de que `/metricas` resuelva para
    ese cliente). El caso "cliente con `error` " (base rota) sigue el mismo
    patrón que las columnas ya existentes (ocupación/canon/ingreso/acceso):
    la fila colapsa a un único mensaje de error de ancho flexible que cubre
    ese hueco — no hay un "—" separado dibujado en la columna vs-tarifa en
    ese caso puntual, igual que ya pasa hoy con "Últ. acceso" para un
    cliente con error. Es el comportamiento pre-existente del componente,
    no algo nuevo de esta fase.
  - `title` de la celda (`hintSpread`): explica el estado, y si
    `contratos_sin_tarifa > 0` agrega "N contrato(s) sin tarifa aplicable."
    al final del mismo tooltip (un solo `title`, no dos).

### Capturas de texto — los tres estados de la celda (claro y oscuro)

Los tres estados usan los mismos tokens `--con-*` que ya cambian con
`data-consola-tema`, así que no hay diferencia de comportamiento entre
temas — sólo cambia el valor de los tokens (ya validado en `index.css` para
`--con-estado-aviso`, `--con-ink-2`, `--con-ink-4`, `--con-suprimido-ink`).
Descripción textual de cada uno (no se pudo levantar el dev server con un
backend real en este sandbox — ver "Cómo verificar visualmente" abajo):

1. **Valor** — cliente con tarifa y ≥3 contratos con tarifa aplicable,
   cobrando por debajo: celda alineada a la derecha, fuente mono, texto
   `−12,4 %` en ámbar (`--con-estado-aviso`: `#B35F0A` claro / `#E8963F`
   oscuro), negrita. Si cobra por encima: `+3,1 %` en `--con-ink-2` (gris
   tinta, no ámbar — sólo lo negativo alerta). `title` al pasar el mouse:
   "Canon vs tarifa de referencia (negativo = por debajo de su tarifa)."
2. **Suprimido** — tarifa configurada, <3 contratos con tarifa aplicable:
   ícono de ojo tachado + "‹3" en cursiva, color `--con-suprimido-ink`
   (gris apagado, distinto del ámbar y del gris neutro de arriba) — idéntico
   visualmente al que ya se ve en la columna "Canon prom." para el mismo
   cliente. `title`: "Suprimido por privacidad: menos de 3 contratos con
   tarifa aplicable" (más el hint de `contratos_sin_tarifa` si aplica).
3. **Sin tarifa** — `tarifa_configurada: false`: texto plano "sin tarifa" en
   `--con-ink-4` (gris apagado, sin ícono, sin cursiva — deliberadamente
   MENOS llamativo que el Suprimido: no es un dato oculto, es una tarea
   pendiente del cliente). `title`: "Sin tarifa de referencia configurada."

## 3. KPI "vs tarifa de referencia" en el hero

Agregado como quinto `KpiTile` en la fila de KPIs consolidados (después de
"Canon promedio"), variante `normal` (no `hero` — el hero sigue siendo
"Ingreso contratado · mes", sin cambios).

- `hint` fijo (no cambia por caso): "Ponderado: Σ canon / Σ tarifa de
  referencia de los clientes con tarifa configurada (nunca promedio de
  spreads). Con menos de 3 contratos con tarifa, el número se suprime
  (K=3) -- misma regla que el canon."
- `valor` / `contexto` por caso (cuatro ramas, en este orden de prioridad):
  1. `metricas === null` (todavía no cargó) → `valor: "—"`, sin contexto.
  2. `clientes_con_tarifa === 0` → `valor: "sin tarifa"`, `contexto:
     "ningún cliente configuró tarifa de referencia"`.
  3. `spread_pct === null` (con `clientes_con_tarifa > 0`, o sea K=3) →
     `valor: "‹3"`, `contexto: "menos de 3 contratos con tarifa"`.
  4. `spread_pct` numérico → `valor: formatoSpread(spread_pct)` (mismo
     formato con signo que la celda de tabla), `contexto`:
     - negativo: `"la cartera cobra X % por debajo de sus tarifas de
       referencia"` (X = magnitud sin signo, coma decimal).
     - positivo: `"la cartera cobra X % por encima de sus tarifas de
       referencia"`.
     - cero exacto: `"la cartera cobra exactamente su tarifa de
       referencia"` (caso no pedido explícitamente en la misión, agregado
       por completitud — no debería aparecer casi nunca en la práctica).

**Gap conocido / desviación documentada:** la misión pide que el caso K=3
del tile muestre el componente `<Suprimido />` de la consola. `KpiTile.valor`
(en `consola.tsx`, territorio prohibido para este agente) está tipado como
`string` — no acepta `ReactNode` — así que no hay forma de insertar el ícono
+ estilo itálico de `Suprimido` dentro del tile sin tocar esa primitiva. Se
usó el mismo texto compacto que `Suprimido` ya usa en las celdas ("‹3") como
valor de texto plano, y se dejó la explicación completa en el `contexto`
("menos de 3 contratos con tarifa"). Mismo razonamiento para "sin tarifa":
el tile no puede aplicar el tono `--con-ink-4` sólo a ese valor (el color
del número lo decide `KpiTile` internamente, sólo distingue "—" del resto).
Si se quiere el tratamiento visual exacto de la spec, hace falta un cambio
en `KpiTile` (fuera de este territorio) — reportado acá para que el
Verificador o una fase siguiente lo evalúe.

## 4. `components/plataforma/adopcion.tsx` (nuevo)

- **`useAdopcion()`**: mismo patrón que `useTendencia` — estado
  `adopcion / loading / error` + `cargar()`. Se monta en `Plataforma.tsx` y
  se dispara en un `useEffect` que espera `metricasVersion > 0` (idéntico al
  de la tendencia, mismo comentario explicando por qué: el backend calcula
  `con_contratos_activos` con el mismo caché de 5 min de `/metricas`).
- **`PanelAdopcion`**: un solo `<Panel titulo="Adopción">` (no dos paneles
  separados) con dos secciones internas, en el orden pedido:
  1. **Tabla de cohortes** (`TablaCohortes`): columnas "Mes de alta" |
     "Clientes" | "Retención 30d" | "Desglose". `cohorte: null` se rotula
     "sin fecha de alta" y el orden de filas es el que manda el backend
     (mes ascendente) — no se reordena. Retención `null` → "—". El
     desglose es una fila de badges `ClasificacionPill` con el conteo antes
     de cada uno, omitiendo las clasificaciones en 0 (una cohorte de 40
     "activa" no necesita cinco badges en cero).
  2. **"A quién llamar hoy"** (`ListaLlamarHoy` + `FilaClienteAdopcion`):
     recorre `adopcion.clientes` **en el orden que llega** (fantasma →
     dormida → sin_cuentas → nueva → activa, ya así del backend) sin
     reordenar por ninguna otra clave — cumple la instrucción "respetá el
     orden del backend". Encabezado contextual que cuenta cuántos
     `fantasma` hay y por qué importa ("señal clásica de una cancelación
     silenciosa"), sólo si hay al menos uno. Cada fila muestra: nombre,
     `ClasificacionPill` propio, `EstadoPill` de `consola.tsx` (estado de
     cuenta — eje distinto y complementario a la clasificación de acceso),
     "sin acceso hace N días" / "acceso hoy" / "nunca entró nadie" (según
     `dias_sin_acceso`), conteo de "N cuenta(s)". Fila con `error` no nulo
     colapsa a un único mensaje en `--con-estado-corte`, igual que el patrón
     ya usado en `FilaCliente` de la propia página.
- **`ClasificacionPill`** (exportada, vive en `adopcion.tsx` porque no se
  puede tocar `consola.tsx`): punto + palabra, nunca sólo color — mismo
  principio que `EstadoPill`. Mapeo de tono, **reusando tokens `--con-*`
  existentes, ninguno nuevo**:
  - `fantasma` → `--con-estado-aviso` (el ámbar de "gracia/solo_lectura" en
    `EstadoPill` — es el tono de alerta pedido por la misión).
  - `activa` → `--con-estado-activo` (el gris que `EstadoPill` usa para
    "activo" — es el tono "ok" más cercano disponible en el sistema: no
    existe un verde `--con-*` dedicado, así que se reusa el semánticamente
    más próximo en vez de inventar uno).
  - `nueva`, `dormida`, `sin_cuentas` → `--con-ink-4` (neutro).
  Etiquetas: "nueva" / "activa" / "fantasma" / "dormida" / "sin cuentas"
  (con espacio, no guion bajo).
- **Estados vacío/error**: `EstadoVacio` cuando `cohortes.length === 0` o
  `clientes.length === 0` (mensajes distintos y honestos, no genéricos);
  `EstadoError` cuando `error !== null`; `EstadoVacio "Cargando adopción…"`
  mientras `loading || !adopcion`. Mismo patrón que `PanelTendencia`.
- **Accesibilidad**: la tabla de cohortes usa `role="row"` /
  `role="columnheader"` / `role="cell"` (grid con roles ARIA, igual criterio
  que las pseudo-tablas ya existentes de `consola.tsx`, que tampoco son
  `<table>` reales). Sin controles de formulario en este panel (no hay nada
  que enfocar aparte de los `<details>` nativos de otros paneles), así que
  no hace falta `con-focusable` acá.
- **Sin librerías nuevas, sin CSS/SVG externo**: sólo estilos inline con
  tokens `--con-*`, mismo patrón que el resto de la consola.

### Descripción del panel Adopción (claro y oscuro)

Los mismos tokens que ya validan tema claro/oscuro en `consola.tsx`
(`--con-estado-aviso`, `--con-estado-activo`, `--con-ink-4`, `--con-surface`,
`--con-line-soft`) gobiernan todo el panel — no hay color hardcodeado, así
que el comportamiento en `data-consola-tema="oscuro"` es automático.
Descripción textual del layout:

- Encabezado del panel: "Adopción", subtítulo de una línea explicando qué
  es "fantasma" y por qué importa.
- Sub-bloque "Cohortes por mes de alta": fila de cabecera en versalita gris
  (`--con-ink-4`), filas de datos con hairline (`--con-line-soft`) entre
  cada una; en la columna "Desglose", chips en línea "3 · fantasma" con
  punto ámbar, "12 · activa" con punto gris-activo, etc.
- Sub-bloque "A quién llamar hoy": si hay clientes fantasma, una línea de
  contexto en `--con-ink-3` arriba de la lista; cada fila: nombre en negrita
  tinta-1, badge de clasificación, `EstadoPill` de cuenta (punto + palabra),
  texto de acceso en tinta-3, conteo de cuentas en mono tinta-4.

## Cómo verificar visualmente (opcional, no requisito de esta entrega)

`npm run dev` con `VITE_API_TARGET` apuntando a un backend propio que ya
tenga `/metricas` con los campos nuevos y `/plataforma/adopcion`
implementado. No se intentó acá porque el backend de esta fase lo escribe
otro agente en paralelo sobre el mismo árbol — no hay servidor real contra
el cual mirar la pantalla todavía. Todo el código de este entregable está
tipado y compila limpio contra el contrato (`tsc --noEmit`), pero no fue
ejercitado en un navegador.

## Verificación realizada

- `cd /tmp/retail-espacios-test/frontend && npx tsc --noEmit` → **limpio,
  sin errores**.
- No se corrió `npm run build` (prohibido explícitamente por la regla de
  verificación: borra `frontend/dist`).
- No hay tests de frontend en el territorio de este agente (no existe un
  archivo de test de `Plataforma.tsx` / `adopcion.tsx` en el repo al momento
  de esta entrega); no se corrió ninguna suite de Python.

## Párrafo sugerido para `docs/ESTADO.md` (Frontend Fase 6)

> **Frontend Fase 6 (Asesoría).** La tabla "Clientes" de `/plataforma` suma
> la columna "vs tarifa" (oportunidad de precio: canon vs tarifa de
> referencia, `spread_pct`) con tres estados — valor con signo (ámbar si
> es negativo), `Suprimido` (K=3, mismo criterio que el canon) y "sin
> tarifa" (el cliente no configuró ninguna) — y un `KpiTile` "vs tarifa de
> referencia" en el hero con la misma lectura a nivel consolidado. La
> tarifa de referencia en sí nunca llega al frontend: sólo la relación.
> Debajo de "Tendencia" se agregó el panel "Adopción"
> (`components/plataforma/adopcion.tsx`, `useAdopcion` + `PanelAdopcion`):
> tabla de cohortes por mes de alta con retención a 30 días y desglose por
> clasificación (`ClasificacionPill` propio, tokens `--con-*` existentes,
> sin inventar colores), y la lista "A quién llamar hoy" con los clientes
> `fantasma` primero (orden que fija el backend, el frontend no re-deriva
> nada). Se carga después de que `/metricas` resuelve al menos una vez,
> igual que la tendencia. Gap conocido: `KpiTile.valor` sólo acepta
> `string`, así que el caso K=3 del tile de spread se representa con el
> texto compacto "‹3" en vez del componente `Suprimido` real — requeriría
> tocar `consola.tsx` (fuera de este territorio) para el tratamiento visual
> exacto de la spec.

## Gaps / pendientes para el Verificador

1. **KpiTile.valor es `string`**: no se pudo montar el componente
   `<Suprimido />` real dentro del tile de spread para el caso K=3 (ver
   sección 3). Documentado como desviación deliberada, no un olvido.
2. **Sin capturas de pantalla reales**: no hay backend con los endpoints
   nuevos disponible en este sandbox para levantar `npm run dev` contra él;
   las "capturas" de este documento son descripciones textuales fieles al
   código escrito, no screenshots. Recomendado que el Verificador, una vez
   que el backend esté integrado, tome capturas reales en claro y oscuro
   de: la columna vs-tarifa (los 3 estados), el tile de spread (los 4
   casos) y el panel Adopción completo.
3. **No hay archivo de test de frontend en el repo** para `Plataforma.tsx`
   ni para los componentes de `plataforma/`; este agente no escribió
   ninguno (fuera de su territorio declarado: sólo `api/plataforma.ts`,
   `pages/Plataforma.tsx`, `components/plataforma/adopcion.tsx`). Si la
   fase requiere tests de frontend, falta asignarlos a algún agente.
