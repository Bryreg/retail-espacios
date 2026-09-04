# Fase 4 · Consola de Plataforma — frontend

Territorio: `frontend/src/**` (excepto `frontend/src/legal/**`, del agente legal — no tocado).
No se hizo commit ni push. `cd frontend && npx tsc --noEmit` → limpio.

## Qué se construyó

### 1. Ruta propia `/plataforma`

Página completa nueva: `frontend/src/pages/Plataforma.tsx`. Vive **dentro** del
`<BrowserRouter>` de `App.tsx` (junto a `Dashboard`), pero **sin** el `Topbar`
de sede ni ningún layout de cliente — encabezado propio y mínimo (`RECABRA ·
Plataforma`, el email del operador si `authStore.email` lo trae, botón
"Salir" que llama a `logout()`).

El modal `frontend/src/components/Plataforma/PlataformaPanel.tsx` **se
borró**. Su contenido se mudó a la página, con el mismo comportamiento:

- Tabla de clientes con estado (`FilaEditor`: selector de los 4 estados,
  motivo obligatorio, `confirm()` antes del `PATCH`) — mismo código, mismo
  flujo, ahora integrado en `FilaCliente` (ver más abajo).
- Sección "Solicitudes de supresión" (`SupresionesSection`,
  `FilaEditorSupresion`) — copiada tal cual, sin cambios de comportamiento.

Guard de SPA: al montar, `Plataforma.tsx` llama `GET /api/plataforma/soy`.
Mientras se resuelve muestra "Verificando acceso…"; si `operador !== true`,
`<Navigate to="/" replace />`. Es cortesía nada más — cada endpoint del
panel sigue devolviendo su propio 403 si igual se llega (carrera entre
pestañas, revocación a media sesión), y ese mensaje se muestra tal cual via
`describeError`, no se inventa uno nuevo. El caso "sin sesión" no aplica
dentro de este componente: la ruta sólo se monta adentro del `Router`, que
`App.tsx` sólo arma cuando ya hay `token` — sin token, `App.tsx` devuelve
`<Login/>` mucho antes de que exista ningún `<Route>`.

### 2. Panel de métricas del negocio

Mismo `Plataforma.tsx`. Contra el contrato JSON exacto de
`GET /api/plataforma/metricas?periodo=YYYY-MM`, tipado campo por campo en
`frontend/src/api/plataforma.ts` (`MetricasPlataforma`, `ConsolidadoMetricas`,
`ClienteMetricas`, `AgregadosMetricasCliente`, `ProveedorTop`, `PeriodoMetricas`).
`ocupacion_pct` y los montos son `number | null` en los dos niveles
(consolidado y por cliente), tal como especifica la nota del contrato.

- **Selector de período**: `<input type="month">`, con el mes actual
  (`mesActual()`, formato `"YYYY-MM"`) como valor por defecto. Cambiarlo
  dispara `getMetricasPlataforma(periodo)` de nuevo.
- **Frescura**: junto al selector, "Actualizado hace X min" a partir de
  `generado_en`, con el sufijo "(caché)" cuando `de_cache === true` — la
  nota del contrato lo pide sólo para el caso de caché, pero mostrarlo
  siempre (con o sin el sufijo) es más simple y no contradice la spec: la
  frase nunca miente sobre cuándo se armaron los números.
- **Tarjetas de resumen consolidado**: clientes activos, ocupación media,
  canon promedio, ingreso contratado total.
  - **"Clientes activos" se cuenta desde la lista de `GET
    /plataforma/clientes`** (`clientes.filter(c => c.estado === "activo").length`),
    tal como pide la misión — **no** desde `consolidado.clientes_total` de
    métricas, que cuenta TODOS los clientes sin importar su estado (incluye
    suspendidos, spec: "un cliente suspendido TAMBIÉN aparece en métricas").
  - Ocupación media / canon promedio / ingreso contratado salen directo de
    `metricas.consolidado`, con `formatoPct` / `formatoCOP` (`Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 })`)
    y `null → "—"`.
- **Tabla combinada "Clientes"** (`FilaCliente`): una sola fila por
  supermercado con nombre/slug, estado de cuenta (color + texto), ocupación,
  canon promedio, ingreso contratado, último acceso, y el botón **Cambiar**
  en la misma fila — que abre el mismo `FilaEditor` mudado del modal. La
  spec pedía "tabla por supermercado con sus métricas + estado_cuenta + el
  botón Cambiar existente en la misma fila/bloque"; en vez de dos tablas
  (una para editar estado, otra para métricas) se armó **una sola**, con
  `GET /plataforma/clientes` como fuente de verdad para estado/edición
  (trae `motivo`/`cambiado_en`/`cambiado_por`, que métricas no expone) y
  `GET /plataforma/metricas` completando por `slug` las columnas numéricas
  vía un `Map` (`metricasPorSlug`). Si falla el fetch de métricas, la tabla
  de estados sigue funcionando igual (el operador puede seguir cambiando
  estados aunque las métricas no hayan cargado) — el error de métricas se
  muestra aparte, arriba de las tarjetas.
  - **Fila con `error`** (base de cliente rota): se marca con el mensaje del
    backend en las columnas de métricas de esa fila, en rojo — el resto del
    panel (las demás filas, la edición de estado) sigue funcionando. Nunca
    se muestran a la vez `error` y números de esa fila.
  - **"Último acceso con cuenta"**: sólo fecha, sin hora
    (`toLocaleDateString("es-CO", …)`), rotulado tal como pide el contrato.
  - **Ocupación `null` → `"—"`**, nunca `0%`.
- **Gráficos sobrios, SVG/CSS propio, sin librería nueva**
  (`BarraHorizontal`, reutilizado por `GraficoOcupacion` y
  `GraficoProveedores`): una fila = etiqueta + barra (`<div>` con `width:
  ${pct}%` sobre un track, ambos con tokens de `index.css`) + valor. Nada de
  `<svg>` ni canvas porque un `div` con ancho relativo ya es "propio" y más
  simple de mantener en tokens; la instrucción dice "SVG/CSS propio", CSS
  puro cumple igual sin la complejidad de coordenadas de un `<svg>` a mano.
  - **Ocupación por cliente**: barras horizontales, una por cliente con
    métricas válidas (se excluyen los que tienen `error` o `ocupacion_pct:
    null`), ordenadas de mayor a menor. Color `var(--ocupado)` sobre
    `var(--ocupado-suave)` — reutiliza el rojo oscuro que el resto del
    sistema ya usa para "tomado/ocupado" (mismo vocabulario visual, ningún
    color nuevo).
  - **Top-5 proveedores (consolidado)**: `consolidado.top_proveedores`
    (recortado a 5 por las dudas, aunque el backend ya lo entrega así),
    barra proporcional al máximo del propio top. Color `var(--ink-1)` sobre
    `var(--surface-3)` — monocromo, porque esto no es un estado del plano
    (verde/naranja/rojo), es un ranking de negocio: se mantiene la regla
    "el color significa algo" no gastando el vocabulario de estados en algo
    que no lo es.

### 3. Bifurcación post-login (operador sin membresías)

`frontend/src/api/auth.ts`: `OauthOk` gana el campo opcional
`plataforma?: boolean` (top-level, junto a `token`/`role`/`cliente`/etc. —
el `cliente` que llega en este caso es el string `"plataforma"`, que el
backend inventa y no es un supermercado real).

`frontend/src/pages/Login.tsx` (`completarOauth`): si `r.plataforma ===
true`, rama nueva ANTES de la rama normal de éxito:

```ts
if (r.plataforma) {
  try { window.history.replaceState(null, "", "/plataforma"); } catch {}
  setAuth(r.token, r.role, r.cliente, undefined, r.email, r.nombre,
          r.aviso_cuenta, r.pedir_consentimiento, true);
  return;
}
```

**Decisión del aterrizaje** (la misión daba a elegir entre dos caminos):
se usó `history.replaceState` para escribir `/plataforma` en la barra
**antes** de `setAuth`. Como `App.tsx` recién monta el `<BrowserRouter>`
cuando `token` deja de ser `null` (efecto de `setAuth`), en el instante en
que React Router arranca la URL ya dice `/plataforma`, así que resuelve esa
ruta directo — no hace falta ningún estado adicional de "adónde ir" ni una
redirección posterior. Se prefirió esto sobre la alternativa (ruta inicial
condicional leída de la marca del store) porque con la marca sola el primer
render de `<Routes>` tendría que decidir entre `"/"` y `"/plataforma"` de
todas formas, y `"/"` con la marca puesta YA redirige a `/plataforma`
(mismo `<Route path="/">` que cualquier otra navegación de vuelta a raíz
usa como red de seguridad) — con lo cual el camino con `replaceState`
llega directo sin ese salto intermedio, y el camino sin él habría hecho
exactamente lo mismo un tick después. Los dos convergen en el mismo lugar;
se documenta acá cuál se implementó.

La rama del 403 (`manejarErrorOauth` → `sinCliente = true`, "fundá tu
supermercado") **no se tocó**: sigue exactamente igual, y como el backend ya
no contesta 403 para un operador sin membresías (contesta 200 con
`plataforma: true`), esa rama en los hechos sólo la ve una cuenta que NO es
operadora — tal como pide la enmienda.

La nueva marca `plataforma: boolean` vive en `authStore` (persistida junto
al resto de la sesión, igual que `avisoCuenta`): `setAuth` gana un noveno
parámetro opcional, `logout()` la resetea a `false`.

### 4. Operador CON membresías: el botón del Topbar navega

`frontend/src/pages/Dashboard.tsx`: se sacó el estado `plataformaOpen` y el
`import` de `PlataformaPanel`. `Topbar` gana `useNavigate()` (Dashboard ya
vive adentro del `<BrowserRouter>`, así que está disponible sin cambiar
dónde se monta nada) y el botón "Plataforma" del Topbar (`onIrPlataforma`)
llama `navigate("/plataforma")` en vez de abrir el modal. El resto del
Topbar (tabs, configuración, logout) no cambió.

### 5 y 6. Guard SPA + supresión del autosync

Guard: cubierto en el punto 1 (`GET /plataforma/soy` al montar
`Plataforma.tsx`, `<Navigate to="/">` si no es operador).

Supresión del autosync (`frontend/src/App.tsx`): el `useEffect` que decide
`startAutoSync()`/`stopAutoSync()` ya frenaba por `!token || TOKEN_MONTAJE`
(el enlace de montaje no tiene layout que sincronizar) — se le agregó la
marca `plataforma` a la MISMA condición:

```ts
const plataforma = useAuthStore((s) => s.plataforma);
useEffect(() => {
  if (!token || TOKEN_MONTAJE || plataforma) { stopAutoSync(); return; }
  startAutoSync();
  return () => stopAutoSync();
}, [token, plataforma]);
```

Verificado a mano: `startAutoSync` (`store/fixtureStore.ts`) es lo único que
dispara fetches de layout/spaces en el arranque de la app fuera de un
componente de negocio, y `Plataforma.tsx` no importa `fixtureStore` en
absoluto — ningún componente de la consola toca ese store. Con la marca en
`false` (cualquier sesión que no sea de operador-sin-membresías) el
comportamiento es idéntico a antes de este cambio.

"La sesión plataforma tampoco debe renderizar Dashboard": el `<Route
path="/">` de `App.tsx` queda `plataforma ? <Navigate to="/plataforma"
replace /> : <Dashboard />` — cualquier navegación a `/` (atrás del
navegador, un enlace guardado, escribir la barra a mano) redirige antes de
montar `Dashboard`.

## Verificación

- `cd frontend && npx tsc --noEmit` → **limpio**.
- `grep -rn "PlataformaPanel" src/` → sólo un comentario en
  `Plataforma.tsx` que documenta el borrado; cero imports, cero uso.
- `git diff package.json` → vacío. No se agregó ninguna dependencia
  (ni de charts ni de ningún otro tipo) — los dos gráficos son `<div>`s con
  `width` relativo sobre tokens de `index.css`, sin `<svg>` de librería ni
  canvas.
- Imports de `frontend/src/pages/Plataforma.tsx`: `react`,
  `react-router-dom` (`Navigate`), `lucide-react` (`LogOut`, ya usado en el
  resto del repo), y los módulos propios `api/plataforma`, `api/derechos`,
  `api/client`, `store/authStore`. Nada fuera del repo ni de los hosts
  permitidos.
- Colores usados en la consola: sólo variables de `index.css`
  (`--ink-*`, `--surface*`, `--line*`, `--accent`, `--danger`, `--warning`,
  `--ocupado`/`--ocupado-suave`, `--r-*`) — ningún literal hexadecimal
  nuevo, ninguna variable inventada.

## Archivos tocados

- `frontend/src/pages/Plataforma.tsx` — **nuevo**: la página completa.
- `frontend/src/components/Plataforma/PlataformaPanel.tsx` — **borrado**.
- `frontend/src/App.tsx` — ruta `/plataforma`, redirect de `/` por la marca,
  supresión del autosync.
- `frontend/src/pages/Dashboard.tsx` — botón del Topbar navega en vez de
  abrir modal; sin `PlataformaPanel`.
- `frontend/src/pages/Login.tsx` — rama `plataforma: true` en
  `completarOauth`.
- `frontend/src/api/auth.ts` — `OauthOk.plataforma?: boolean`.
- `frontend/src/api/plataforma.ts` — tipos y `getMetricasPlataforma()`
  contra el contrato JSON exacto.
- `frontend/src/store/authStore.ts` — marca `plataforma: boolean`
  persistida, `setAuth` con noveno parámetro, `logout()` la resetea.

## Gaps / pendientes que le tocan a otro builder

- El endpoint `GET /api/plataforma/metricas` y la bitácora del operador son
  del builder de backend (`app/routers/plataforma.py`,
  `app/plataforma_metricas.py`) — no se tocó nada de `backend/`.
- La Política de Tratamiento de Datos (`docs/legal/politica-datos.md` +
  `frontend/src/legal/politica-datos.md`) y la decisión de
  `VERSION_POLITICA` son del agente legal — `frontend/src/legal/**` no se
  tocó, tal como manda el territorio exclusivo.
- No se corrió la suite de backend (fuera de mi territorio); la
  verificación de este entregable es sólo `tsc --noEmit` + el grep de
  dependencias/tokens.
