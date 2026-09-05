# Frontend — Fase 7 (Transparencia): consola sin supresión y vista imprimible del reporte

Builder: `frontend`. Repo `/tmp/retail-espacios-test`, rama `claude/fase-7-transparencia`. Sin commit/push (según instrucción). Territorio: `frontend/src/**` excepto `frontend/src/legal/**` (no tocado).

## Parte A — quitar K=3 de la consola

### Archivos tocados

- `frontend/src/components/plataforma/consola.tsx`
  - Eliminado el componente `Suprimido` entero (ícono `EyeOff` + texto "‹3").
  - `EstadoBarra`: `"normal" | "suprimido" | "sindato"` → `"normal" | "sindato"`.
  - `BarraFila`: quitada la rama de renderizado del hatch (`--con-suprimido-hatch`) y el chip `Suprimido` en la etiqueta derecha; `aria-label` simplificado.
  - `SinDato` ahora acepta un `title` opcional (`{ title = "Sin dato para este período" }`) para poder distinguir el motivo puntual (p. ej. "Sin contratos activos en el período") sin crear un componente nuevo.
  - Comentarios de cabecera reescritos (ya no mencionan K=3 como regla vigente).
  - Import de `EyeOff` quitado (sin usuarios tras borrar `Suprimido`).
- `frontend/src/components/plataforma/tendencia.tsx`
  - `EstadoPunto`: quitado el estado `"suprimido"`.
  - `estadoDePunto`: ya no distingue supresión en `ingreso_contratado_mes` (siempre es un número real cuando `sin_dato` es `false`, per contrato Parte A); sólo `ocupacion_pct` puede seguir siendo `null` (sin espacios comercializables ese mes, no es privacidad).
  - `LineaTendencia`: quitado el patrón hatch SVG (`idHatch`, `useId` ya no se usa), el `<rect>` con el patrón y su `<title>` de "suprimido por privacidad (K=3)"; tabla accesible y `LeyendaMarcadores` simplificadas (ya no listan "suprimido").
  - Comentarios reescritos (mencionan "cero contratos ese mes" en vez de supresión).
- `frontend/src/pages/Plataforma.tsx`
  - Import de `Suprimido` quitado de `consola.tsx`.
  - `celdaPlata(v)`: firma simplificada (ya no recibe `m`); `null` → `<SinDato title="Sin contratos activos en el período" />`; con valor, número exacto.
  - `celdaSpread`/`hintSpread`: los dos estados de `null` ahora son "sin tarifa" (no configurada) y "sin contratos con tarifa aplicable" (configurada, cero contratos con tarifa) — ninguno es un chip de K=3.
  - Llamadas a `celdaPlata` para `canon_promedio_mensual` e `ingreso_contratado_mes` actualizadas a la nueva firma.
  - Tile hero "vs tarifa de referencia": quitada la mención a K=3 en el `hint`; `spread_pct === null` ahora muestra "—" con contexto "ningún contrato con tarifa aplicable en el período" (antes "menos de 3 contratos con tarifa").
  - Comentarios de cabecera reescritos.
- `frontend/src/api/plataforma.ts`
  - `AgregadosMetricas.ingreso_contratado_mes`: tipo cambiado de `number | null` a `number` (contrato Parte A: siempre número, 0.0 con 0 contratos).
  - Comentarios de `AgregadosMetricas`, `ConsolidadoMetricas.spread_pct`/`clientes_con_tarifa`, `AgregadosMetricasCliente.spread_pct` y el bloque de semántica de `/tendencia` (líneas ~180-197) reescritos: ya no mencionan K=3/`_suprimir_celda_chica`, describen la regla nueva (agregados exactos, `null` sólo por ausencia real de dato).
- `frontend/src/index.css`
  - Tokens `--con-suprimido-ink` y `--con-suprimido-hatch` **borrados** (claro y oscuro) — sin usuarios tras quitar `Suprimido`/el hatch. `--con-sindato-ink` se mantiene (sigue en uso).
  - Comentario de esa sección reescrito.

### Verificación de la Parte A

```
$ grep -rn "Suprimido\|suprimido\|K=3\|--con-suprimido" frontend/src | grep -v "frontend/src/legal/"
(vacío)
```

## Parte B — Reporte de transparencia

### API

- `frontend/src/api/plataforma.ts` (agregado al final):
  - `CatalogoEntrada`, `ValorReporte`, `SpreadActualReporte`, `LineaAccesoReporte`, `ReporteTransparencia` (shape EXACTO del contrato del Maestro, verificado campo a campo contra `backend/app/plataforma_reporte.py::armar_reporte` ya presente en el árbol — coincide).
  - **Ajuste iteración 2 (C-1)**: `ValorReporte.top_proveedores` NO usa `ProveedorTop` (el shape de `/metricas` y `/tendencia`, `{nombre, contratos_activos}`) — el reporte remapea a `{nombre, contratos}` (`plataforma_reporte.py::_top_reporte`, fijado en `backend/tests/test_plataforma_reporte.py:41` con `CLAVES_TOP_PROVEEDOR = {"nombre", "contratos"}`). Se agregó `export interface ProveedorTopReporte { nombre: string; contratos: number; }` (con comentario que explica el remapeo) y `ValorReporte.top_proveedores` ahora es `ProveedorTopReporte[]`. `ProveedorTop` (línea 73-76) queda intacto — sigue siendo el shape correcto de `/metricas` y `/tendencia`.
  - `getReporteCliente(slug, meses = 12)` → `GET /plataforma/clientes/${encodeURIComponent(slug)}/reporte?meses=N`.
- `frontend/src/api/derechos.ts`:
  - `export type { ReporteTransparencia }` reexportado desde `api/plataforma.ts`.
  - `getMiReportePlataforma(meses = 12)` → `GET /clientes/mi-reporte-plataforma?meses=N`.

### Rutas (`frontend/src/App.tsx`)

- `/reporte-plataforma` → `<ReportePlataforma modo="dueno" />` (usa `getMiReportePlataforma`).
- `/plataforma/reporte/:slug` → `<ReportePlataforma modo="operador" />` (usa `getReporteCliente`).
- Las dos declaradas antes del `*` catch-all, como rutas hermanas de `/` y `/plataforma` dentro del mismo `<BrowserRouter>` — heredan el guard de sesión existente (sin `token` → `Login`, antes de que se monte el Router) sin código nuevo.

### Página nueva: `frontend/src/pages/ReportePlataforma.tsx`

- Recibe el modo por prop (`"dueno" | "operador"`); en modo operador lee `:slug` con `useParams`.
- Fuera del layout de sede/consola: sin Topbar de cliente, sin Encabezado de `/plataforma`; es su propio doc-frame.
- Reusa `temaInicial()`, `EstadoVacio`, `EstadoError` de `components/plataforma/consola.tsx` (mismo tema claro/oscuro guardado que `/plataforma`).
- Cabecera de documento: título "Reporte de transparencia — {nombre}", slug, `generado_en`, ventana, versión de política vigente/aceptada (+fecha), base legal con link a `politica.url` (que el backend fija en `/politica-datos`).
- Sección 1 (catálogo): tabla nombre/definición/fuente/finalidad legible/endpoints/tratamiento legible (mapas `FINALIDAD_LABEL`/`TRATAMIENTO_LABEL`).
- Sección 2 (valores mes a mes): tabla período/contratos/ingreso (COP)/canon promedio/ocupación %/caras/usuarios/top proveedores "nombre (n)" — el "n" es `p.contratos` (ajuste C-1, no `p.contratos_activos`); fila con `sin_dato: true` colapsa a "sin captura" (`colSpan`); bloque aparte para `spread_actual` si no es `null`.
- Sección 3 (accesos): tabla fecha/operador/acción legible/período; `EstadoVacio` con "Ningún acceso del operador en la ventana." si `total === 0`.
- Sección 4 (derechos): los 4 strings de `derechos` tal cual llegan del backend.
- Pie: versión de política + fecha de generación.
- Controles en pantalla (clase `reporte-controles`, oculta en impresión): "Volver" (navega a `/` en modo dueño, a `/plataforma` en modo operador), selector de meses 3/6/12/24 (refetch en `useEffect`), "Imprimir / Guardar como PDF" (`window.print()`), "Descargar JSON" (Blob + `<a download>`, mismo patrón que `descargarMiExport`; nombre `recabra-reporte-transparencia-{slug}-{YYYY-MM-DD}.json`).
- `@media print` (dentro de un `<style>` inline del componente — permitido por la CSP existente, `style-src 'self' 'unsafe-inline' ...`): fuerza los tokens `--con-*` a sus valores claros con `!important` (independiente de `data-consola-tema`), fondo blanco, tinta oscura, oculta `.reporte-controles`, `page-break-inside: avoid` en `.reporte-tabla`.
- Manejo de error: mismo patrón que la consola (`describeError`, `EstadoError`/`EstadoVacio`). Caso especial spec-driven: en modo `"dueno"`, un 403 se traduce SIEMPRE a "Sólo el owner del cliente puede generar este reporte." (el backend hoy comparte `MENSAJE_NO_OWNER` = "Solo el owner del cliente puede hacer esto." con `/mi-export`, que `describeError` mostraría tal cual si no se interceptara antes). El 429 del freno (si el backend lo dispara) cae al `describeError` genérico, que ya lo muestra legible porque FastAPI manda el detail como string.

### Botones

- `frontend/src/pages/Dashboard.tsx::TusDatosSection`: botón "Reporte de transparencia" (icono `FileText`, nuevo import de `lucide-react`) que navega a `/reporte-plataforma`, con la línea de ayuda "Qué tomó la plataforma de tu cliente, cómo lo calculó y quién lo consultó." Se agregó `useNavigate()` local a la función (el resto del archivo ya lo usa).
- `frontend/src/pages/Plataforma.tsx::FilaCliente`: botón "Reporte" por fila que navega a `/plataforma/reporte/${slug}`. Ancho nuevo `W_BTN_REPORTE = 74`, `W_BTN` (Cambiar/Cerrar) reducido de 84 a 76 para compensar, agrupados en un solo `<div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>` (antes sólo el botón "Cambiar" tenía `marginLeft: auto`). `TablaScroll minWidth` y el spacer de `TablaHead` ajustados con la nueva constante `W_BOTONES = W_BTN_REPORTE + 6 + W_BTN` para no romper la fila.

## Verificación

```
$ cd frontend && npx tsc --noEmit
(sin salida — limpio, exit 0)

$ grep -rn "Suprimido\|suprimido\|K=3\|--con-suprimido" frontend/src | grep -v "frontend/src/legal/"
(vacío)
```

### Verificación del ajuste iteración 2 (C-1)

```
$ cd frontend && npx tsc --noEmit
EXIT_TSC=0

$ grep -n "contratos_activos" frontend/src/pages/ReportePlataforma.tsx frontend/src/api/derechos.ts
frontend/src/pages/ReportePlataforma.tsx:232:                    <td style={tdNum}>{v.contratos_activos ?? "—"}</td>
```

Único resultado: `v.contratos_activos` es el campo del valor mensual (correcto, no se toca). Ningún `p.contratos_activos` sobre elementos de `top_proveedores` queda en el árbol.

No se corrió `npm run build` ni la suite de backend (instrucción explícita: `npm run build` borra `frontend/dist`, que otros agentes usan en paralelo). No se creó ninguna base `.db` desde este builder.

## Capturas

No se generaron — no se levantó un backend local (`uvicorn`) desde este builder porque el backend de Fase 7 (K=3 fuera + `/mi-reporte-plataforma` + `/plataforma/clientes/{slug}/reporte`) lo está terminando otro agente en paralelo sobre el mismo árbol; levantar un backend propio con una base vacía no habría ejercitado nada real del reporte (sin snapshots, sin bitácora, sin consentimientos) y corría el riesgo de enmascarar un desajuste de shape en vez de mostrarlo. El shape de `ReporteTransparencia` en `api/plataforma.ts` se verificó por lectura directa contra `backend/app/plataforma_reporte.py::armar_reporte` (ya presente en el árbol al momento de escribir esto) y coincide campo a campo, incluidos los endpoints `GET /clientes/mi-reporte-plataforma` y `GET /plataforma/clientes/{slug}/reporte` (confirmados en `backend/app/routers/derechos.py` y `backend/app/routers/plataforma.py`).

## Dependencias con el backend / gaps

- El shape de `ReporteTransparencia` y las dos rutas ya estaban implementados en el árbol al momento de este trabajo (`backend/app/plataforma_reporte.py`, `routers/derechos.py::mi_reporte_plataforma`, `routers/plataforma.py::reporte_de_transparencia_del_cliente`) — coinciden con el contrato. Si el backend cambia el shape después de este punto, el frontend necesita release-sync (no hay contrato de versión).
- El 403 de `require_owner` en el backend hoy es un mensaje genérico (`MENSAJE_NO_OWNER`, compartido con `/mi-export`/`solicitar-supresion`), no el texto específico que pide la spec para este reporte. Se resolvió del lado frontend interceptando el status 403 en modo `"dueno"` (ver arriba) en vez de depender de `describeError` con el detail crudo del backend — dejo la nota por si el Verificador prefiere que el backend emita un detail dedicado en su lugar.
- No toqué `docs/ESTADO.md`: la Parte A/C de la spec le asigna la reescritura de la "enmienda de la regla dura del operador" (Fase 4) y la sección de auditoría (marcar `frontera-5` como resuelto) a quien consolide el estado del proyecto; no está en mi lista de "archivos esperados" como builder frontend. Si nadie más lo toca, falta antes de mergear a `main` (la instrucción del CLAUDE.md del repo pide actualizarlo en el mismo PR cuando un cambio altera una regla/flujo descrito ahí, y Fase 7 sí lo hace).
- No toqué `frontend/src/legal/politica-datos.md` (territorio del agente legal) ni nada de `backend/`.

## Archivos tocados/creados (resumen)

- Modificados: `frontend/src/App.tsx`, `frontend/src/api/derechos.ts`, `frontend/src/api/plataforma.ts`, `frontend/src/components/plataforma/consola.tsx`, `frontend/src/components/plataforma/tendencia.tsx`, `frontend/src/index.css`, `frontend/src/pages/Dashboard.tsx`, `frontend/src/pages/Plataforma.tsx`.
- Nuevo: `frontend/src/pages/ReportePlataforma.tsx`.
