# Diseñador del sistema visual — Consola de plataforma (Fase 4b, Fase A)

Pase de **diseño** sobre la consola `/plataforma` ya construida y funcional. Se
**refinó**, no se reescribió: mismos datos, mismos endpoints, mismo
comportamiento (estados, K=3, supresiones, bitácora, JWT, login legado —
intactos). Lo que cambió es el **sistema visual** y las **primitivas
reutilizables** que hereda la consola.

Territorio tocado: `frontend/src/**` exclusivamente. Backend sin tocar.
Verificación: `npx tsc --noEmit` y `npm run build` **limpios** (build de
producción incluida).

---

## 1. Sistema visual fijado

**Identidad de back-office / BI, distinta de la vista de sede.** La sede usa
tinta-como-acento sobre papel blanco. La consola tiene su propio juego de
tokens `--con-*` con:

- un **ground más profundo** (`--con-bg` = `#E8ECED` en claro, `#10151A` en
  oscuro) para que los paneles floten como instrumentos;
- un **acento de operación azul-pizarra** (`--con-accent` `#275A7A` / `#4E9FCB`)
  que **no es** ninguno de los tres estados ni la tinta de la sede — sólo lo
  llevan el borde del KPI hero y los botones primarios;
- **dos temas parejos** (claro/oscuro) con toggle en el encabezado.

**Jerarquía.** El número por el que el dueño abre la consola —**Ingreso
contratado del mes** consolidado— es un KPI `hero`: 27px, peso 900, primero y
más grande, con borde-acento a la izquierda. Los otros tres KPIs (clientes
activos, ocupación media, canon promedio) lo sostienen a 17px. **Un solo nivel
de énfasis por tarjeta**: sólo el número pesa; el rótulo va en versalita
(`.rotulo`) y el contexto en 11px apagado.

**Escala tipográfica y radios**: sin novedades — se respetan los 7 tamaños y
los radios 2px/3px del repo. Cero colores hardcodeados: **todo** por `var(--con-*)`
(o los tokens base del repo donde el color es idéntico en ambos temas, como los
radios y las fuentes).

### Tema claro/oscuro — cómo funciona
- El `<div>` raíz de la consola lleva `data-consola-tema={"claro"|"oscuro"}`.
- `index.css` define los `--con-*` en `:root` (claro) y los sobreescribe bajo
  `[data-consola-tema="oscuro"]`. **Ningún** otro componente de la app consume
  `--con-*`, así que definirlos en `:root` es inocuo y no filtra el tema.
- El tema inicial sale de la preferencia guardada del operador o, si no hay, de
  `prefers-color-scheme`. Se persiste bajo `recabra-consola-tema` (envuelto en
  try/catch). **Es preferencia de UI, no dato de cliente ni métrica** — no roza
  el guardrail de localStorage (que cubre la lista de clientes y las métricas).

---

## 2. Tokens semánticos nuevos (nombres exactos)

Todos en `frontend/src/index.css`, en **ambos temas** (`:root` = claro,
`[data-consola-tema="oscuro"]` = oscuro):

| Token | Rol |
|---|---|
| `--con-bg` | ground de la consola |
| `--con-surface` | panel / tarjeta |
| `--con-surface-2` | interior sutil, hover de fila, franjas de edición |
| `--con-surface-raised` | fondo del KPI tile |
| `--con-line` / `--con-line-soft` / `--con-line-strong` | bordes |
| `--con-ink-1` / `--con-ink-2` / `--con-ink-3` / `--con-ink-4` | tinta, 4 pesos |
| `--con-accent` / `--con-accent-ink` | acento de operación (azul-pizarra) |
| `--con-focus` | anillo de foco de teclado (azul, distinto de todo estado) |
| `--con-mag-track` / `--con-mag-fill` | **magnitud secuencial** (ocupación %) |
| `--con-bar-neutral` / `--con-bar-neutral-track` | conteos (proveedores), grafito |
| `--con-estado-activo` / `--con-estado-aviso` / `--con-estado-corte` | terna de **estado de cuenta** |
| `--con-suprimido-ink` / `--con-suprimido-hatch` | dato **K=3** suprimido |
| `--con-sindato-ink` | **sin dato** |

Clases utilitarias nuevas (también en `index.css`): `.con-focusable`
(foco de teclado visible), `.con-bar-row` (barra: hover + foco), `.con-fila`
(fila de tabla: hover).

---

## 3. Ocupación-magnitud vs. estado — cómo se resolvió

El problema que traía la consola: la ocupación se pintaba con `--libre` (el
**verde de estado**). Eso es usar un color de estado para una magnitud.

- **Ocupación (y cualquier %) = magnitud**: barra `--con-mag-*`, **un solo
  matiz azul**, la **longitud** codifica el valor. Nunca la terna.
- **Conteos (proveedores) = magnitud también**, pero en **grafito**
  (`--con-bar-neutral`) para separar de un golpe "cuántos contratos" de "qué %".
- **Estado de cuenta = la terna**, reservada a esto (`EstadoPill`): `activo`
  **neutro** a propósito (si algo lleva color, es porque hay que mirarlo),
  `gracia`/`solo_lectura` **ámbar**, `suspendido` **rojo**. Siempre **punto +
  palabra**: el color acompaña, nunca es la única señal.
- **Eje desde cero explícito**: el grupo `Barras` dibuja una línea base con las
  marcas `0 … máx` alineadas bajo los tracks.

---

## 4. K=3 vs. sin-dato vs. 0 real — los tres distinguibles a la vista

Tres tratamientos **distintos entre sí y de un 0**:

| Caso | En celda / etiqueta | En barra |
|---|---|---|
| **0 real** | `0` / `0%` en tinta plena (`--con-ink-1/2`) | track con relleno de ancho 0 |
| **K=3 suprimido** | ícono `EyeOff` + `‹3` en itálica (`--con-suprimido-ink`), tooltip que explica la regla | track con **rayado diagonal** (`--con-suprimido-hatch`), sin relleno |
| **Sin dato** | guion `—` en `--con-sindato-ink`, tooltip "sin dato" | fila sin barra, leyenda "sin dato" |

Componentes reutilizables: `<Suprimido/>`, `<SinDato/>`. La lógica de cuándo es
K=3 vs. sin-dato en un importe (`celdaPlata`) es la del repo, intacta: `null`
con `espacios_comercializables > 0` es K=3; `null` sin inventario es sin-dato.

---

## 5. Primitivas / componentes (paths absolutos + API)

### Nuevo archivo: `/tmp/retail-espacios-test/frontend/src/components/plataforma/consola.tsx`

Todas presentacionales (reciben datos ya formateados; no deciden significado):

- `temaInicial(): ConsolaTema` · `guardarTema(t)` · `<TemaToggle tema onToggle/>`
- `<Panel titulo subtitulo? aside? sinPadding? children/>` — tarjeta con cabecera.
- `<EstadoVacio texto/>` · `<EstadoError texto/>` — vacío/error dentro de panel (error con ícono + `role="alert"`).
- `<KpiTile rotulo valor contexto? hint? variante?/>` — `variante: "normal"|"hero"`. `valor` ya formateado (incluye "—"); vacío se apaga con `--con-sindato-ink`. `contexto` = línea de lectura corta (**la completa el Analista**).
- `<Barras etiquetaMax children/>` — grupo con eje 0…máx.
- `<BarraFila label valor max texto tono? estado? hint?/>` — `tono: "magnitud"|"conteo"`, `estado: "normal"|"suprimido"|"sindato"`. Enfocable con teclado (`aria-label` con el valor); el Analista puede colgar el tooltip de contenido del `hint`.
- `<EstadoPill estado/>` · `etiquetaEstado(e)` — estado de cuenta (punto + palabra).
- `<Suprimido compacto?/>` · `<SinDato/>` — K=3 / sin-dato.
- `<TablaScroll minWidth? children/>` · `<TablaHead/>` · `<TablaHeadCelda width? flex? alinear?/>` · `<Fila/>` — tabla de densidad (legible con 1 fila y con 30: ritmo vertical 8px, hairline por fila, hover).

### Reescrito: `/tmp/retail-espacios-test/frontend/src/pages/Plataforma.tsx`
Consume las primitivas y los `--con-*`. Se fueron `TarjetaResumen`,
`BarraHorizontal`, `panelStyle`, `sectionTitleStyle`, `colorEstado` locales
(reemplazados por las primitivas). El comportamiento de negocio (fetch, guard,
PATCH de estado, supresiones, K=3) quedó **idéntico**.

### Modificado: `/tmp/retail-espacios-test/frontend/src/index.css`
Bloque nuevo de tokens `--con-*` (ambos temas) + clases utilitarias.

### Estados completos por primitiva
hover (filas, barras), **foco de teclado visible** (`.con-focusable` en inputs,
selects, botones; `.con-bar-row` en barras), vacío (`EstadoVacio`), error
(`EstadoError`), y **claro + oscuro parejos**.

---

## 6. Qué queda para el Analista (Fase B)

Dejé el terreno ordenado; NO cerré el encuadre de negocio:

- **Orden de las barras.** `GraficoOcupacion` ordena hoy mayor→menor. La spec de
  consultoría sugiere menor→mayor ("el que necesita asesoría primero"). La
  primitiva `Barras` es **agnóstica al orden** — es decisión del Analista.
- **Contexto de cada KPI/gráfico.** `KpiTile.contexto` y `Panel.subtitulo`
  están cableados pero con texto mínimo. La lectura que habilita la
  recomendación (qué pregunta responde cada número) la pone el Analista.
- **Tooltips de contenido.** `BarraFila.hint` y `KpiTile.hint` existen; hoy
  llevan la definición de la métrica. El contenido de asesoría es del Analista.
- **Campos del JSON hoy sin superficie** (disponibles, no es gap): 
  `consolidado.sedes_con_plano`, `espacios_comercializables`,
  `usuarios_con_cuenta`, `clientes_total`, y los mismos por cliente. El Analista
  decide si alguno merece tile/columna.
- **Roadmap de asesoría** (computable hoy vs. necesita backend).

---

## 7. Gaps del JSON (dato que la asesoría pediría y el endpoint NO trae)

Reportados, **no inventados**:

1. **Spread canon cobrado vs. tarifa de referencia** (la "oportunidad de precio"
   que menciona la spec de consultoría). El endpoint de métricas trae
   `canon_promedio_mensual` pero **no** la tarifa de referencia: las tarifas son
   dato por-cliente, admin-only (`/layout/rates`), y traerlas al consolidado
   cruzaría la frontera de agregación de la Fase 4. **No computable** con el JSON
   actual sin decisión de backend/privacidad.
2. **Tendencia temporal.** El endpoint es una **foto** del mes elegido; el
   sistema no persiste snapshots históricos. Una serie de tiempo necesita una
   tabla nueva del registro (sin migración, patrón Fase 3). Ya anotado como
   pendiente en `docs/ESTADO.md`.
3. **Ocupación consolidada por sede.** El consolidado da un `ocupacion_pct`
   global y uno por cliente, pero no desglosa por sede dentro de un cliente
   (`sedes_con_plano` es sólo un conteo). Fuera de alcance del JSON actual.

---

## Verificación
- `cd frontend && npx tsc --noEmit` → limpio.
- `cd frontend && npm run build` → limpio (el warning de chunk >500kB es
  pre-existente, de Three.js; no lo introduce este pase).
- CSP Fase 3: sin CDNs, sin `eval`, sin recursos externos; íconos por SVG
  (lucide-react, ya bundleado); `repeating-linear-gradient` es estilo inline
  (style-src ya admite `unsafe-inline`). Sin localStorage de clientes ni
  métricas (sólo el tema, que es preferencia de UI).
