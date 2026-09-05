# Frontend — Página de detalle y recomendaciones (Fase 8)

Builder: agente "Frontend — Página de detalle y recomendaciones".
Repo: `/tmp/retail-espacios-test`, rama `claude/fase-7-transparencia` (Fase 8 encima de Fase 7, sin commit ni push).

## Archivos tocados (SOLO mi territorio)

- **`frontend/src/pages/DetalleCliente.tsx`** (NUEVO) — la página completa.
- **`frontend/src/api/plataforma.ts`** — tipos del shape de `/detalle` + `getDetalleCliente`.
- **`frontend/src/App.tsx`** — ruta `/plataforma/clientes/:slug`, antes del catch-all `*`.
- **`frontend/src/pages/Plataforma.tsx`** — botón "Ver detalle" en cada fila de la tabla de clientes, junto a "Reporte" (navega a `/plataforma/clientes/${encodeURIComponent(slug)}`); ajusté los anchos de columna (`W_BTN_DETALLE`) y el `minWidth` de `TablaScroll` para que entre el botón nuevo.
- **`frontend/src/components/plataforma/consola.tsx`** — extraje el bloque de overrides `--con-*` de impresión clara (Fase 7) a una constante exportada `IMPRESION_CLARA_VARS` (sólo el cuerpo de declaraciones, sin el `@media print` en sí — cada página decide qué oculta).
- **`frontend/src/pages/ReportePlataforma.tsx`** — usa `IMPRESION_CLARA_VARS` en vez del bloque inline, **sin cambiar su comportamiento** (mismos valores de color, byte a byte, sólo movidos a la constante compartida).

No toqué `backend/`, `docs/`, `frontend/src/legal/` ni tests de backend. `backend/app/plataforma_metricas.py` aparece modificado en `git status` pero es de otro agente en paralelo — no lo toqué.

## Ruta agregada

`/plataforma/clientes/:slug` → `<DetalleCliente />`, declarada después de `/plataforma/reporte/:slug` y antes del `*` catch-all en `App.tsx`.

## Tipos definidos (interfaz `DetalleCliente` completa, en `api/plataforma.ts`)

```ts
export interface ClienteDetalle {
  slug: string;
  nombre: string;
  estado_cuenta: EstadoCuenta;
}

export interface SedeDetalle {
  sede: string;
  espacios: number;
  ocupados: number;
  libres: number;
  ocupacion_pct: number | null;
}

export interface ContratoEspacioDetalle {
  proveedor: string;
  marca: string | null;
  canon_mensual: number;
  inicio: string; // "YYYY-MM-DD"
  fin: string; // "YYYY-MM-DD"
  dias_para_vencer: number;
  arranca_en_periodo: boolean;
}

export interface EspacioDetalle {
  codigo: string;
  sede: string;
  codigo_corto: string;
  cara: "A" | "B" | null;
  tipo: string;
  zona: string | null;
  area_m2: number | null;
  estado: "ocupado" | "libre" | "se_libera";
  contrato: ContratoEspacioDetalle | null;
}

export interface ResumenTipoDetalle {
  tipo: string;
  total: number;
  ocupados: number;
  libres: number;
  canon_promedio: number | null;
  canon_minimo: number | null;
  canon_maximo: number | null;
  tarifa_configurada: boolean;
}

export interface ProveedorDetalle {
  nombre: string;
  espacios: number;
  tipos: string[];
  sedes: string[];
  canon_total: number;
  canon_promedio: number;
  participacion_pct: number;
  desde: string | null;
  contratos_por_vencer_60d: number;
}

export interface MovimientoEntrada {
  proveedor: string;
  codigo: string;
  tipo: string;
  canon_mensual: number;
  fecha: string; // "YYYY-MM-DD"
  cancelado: boolean;
}

export interface MovimientoSalida {
  proveedor: string;
  codigo: string;
  tipo: string;
  canon_mensual: number;
  fecha: string; // "YYYY-MM-DD"
  motivo: "vencimiento" | "cancelacion";
}

export interface MovimientoMes {
  mes: string; // "YYYY-MM"
  entradas: MovimientoEntrada[];
  salidas: MovimientoSalida[];
}

export interface OportunidadCandidato {
  proveedor: string;
  canon_actual: number;
  mismo_tipo: boolean;
}

export interface Oportunidad {
  codigo: string;
  sede: string;
  tipo: string;
  estado: "libre" | "se_libera";
  precio_sugerido: number | null;
  origen_precio: "cliente" | "benchmark" | null;
  valor_estimado_mensual: number;
  candidatos: OportunidadCandidato[];
}

export type TipoRecomendacion =
  | "espacio_libre"
  | "contrato_por_vencer"
  | "precio_bajo_tarifa"
  | "concentracion_proveedor"
  | "sede_subutilizada"
  | "sin_tarifa"
  | "arranque";

export type PrioridadRecomendacion = "alta" | "media" | "baja";

export interface Recomendacion {
  id: string;
  tipo: TipoRecomendacion;
  prioridad: PrioridadRecomendacion;
  valor_estimado_mensual: number;
  explicacion: string;
  datos: Record<string, unknown>;
}

export interface DetalleCliente {
  cliente: ClienteDetalle;
  periodo: string; // "YYYY-MM"
  desde: string; // "YYYY-MM-DD"
  hasta: string; // "YYYY-MM-DD"
  generado_en: string; // ISO 8601 UTC
  sedes_con_plano: number;
  sedes: SedeDetalle[];
  espacios: EspacioDetalle[];
  contratos_fuera_del_plano: number;
  resumen_por_tipo: ResumenTipoDetalle[];
  proveedores: ProveedorDetalle[];
  movimientos: MovimientoMes[];
  benchmark_plataforma: Record<string, number>;
  oportunidades: Oportunidad[];
  recomendaciones: Recomendacion[];
}

export const getDetalleCliente = (slug: string, periodo?: string): Promise<DetalleCliente> =>
  client
    .get<DetalleCliente>(`/plataforma/clientes/${encodeURIComponent(slug)}/detalle`, {
      params: periodo ? { periodo } : undefined,
    })
    .then((r) => r.data);
```

Cero `any`. `getDetalleCliente` nunca guarda el resultado en `localStorage` (mismo guardrail que `getClientesPlataforma`/`getMetricasPlataforma`/`getTendencia`/`getReporteCliente`): vive sólo en el estado de `DetalleCliente.tsx`.

## Cómo se arma el texto de cada oportunidad (frontend, no viaja como prosa)

`textoOportunidad(op: Oportunidad)` en `DetalleCliente.tsx`:

```
Ofrecer {op.codigo} ({op.tipo}) {a <primer candidato> | en <sede>}{ a unos <precio sugerido> si existe}.
```

- Con al menos un candidato: `"Ofrecer NAVE-PUN-02 (punta) a Alpina a unos $ 900.000."` (el ejemplo literal de la spec).
- Sin candidatos: cae a nombrar la sede en vez del proveedor — `"Ofrecer NAVE-PUN-02 (punta) en Sede Norte a unos $ 900.000."`
- Sin `precio_sugerido` (ni cliente ni benchmark): se omite la cláusula de precio entero, nunca se inventa un monto.

El origen del precio (`origen_precio`) se muestra en una columna separada de la tabla de Oportunidades (`etiquetaOrigenPrecio`): "promedio del cliente" / "benchmark de plataforma" / "sin referencia" (cuando `precio_sugerido === null`). Los candidatos se pintan como chips (`ChipCandidato`): `proveedor · canon actual`, resaltados con borde/color de acento cuando `mismo_tipo === true`.

## Cómo funciona la impresión ("Imprimir recomendaciones")

- `IMPRESION_CLARA_VARS` (nueva constante exportada en `consola.tsx`) es el mismo cuerpo de overrides `--con-*` que ya fijaba `ReportePlataforma.tsx` en su `@media print` (Fase 7) — extraído para no duplicar la lista de tokens entre las dos páginas. Verifiqué que `ReportePlataforma.tsx` queda con el mismo comportamiento (mismos valores hex, sólo movidos a la constante).
- `DetalleCliente.tsx` cuelga su propio bloque `@media print` de la clase raíz `.detalle-cliente`:
  - `.detalle-controles { display: none !important; }` — oculta la barra de controles (Volver, período, Reporte de transparencia, Imprimir, TemaToggle).
  - `.detalle-cliente { ${IMPRESION_CLARA_VARS} }` — fuerza la paleta clara, sin depender del tema en pantalla.
  - `.detalle-seccion { display: none !important; }` oculta TODAS las secciones por defecto (cada `<section>` lleva la clase `detalle-seccion`), y `.detalle-recomendaciones, .detalle-oportunidades { display: block !important; }` las vuelve a mostrar — son las únicas dos secciones marcadas también con esas clases extra.
  - `.detalle-item { page-break-inside: avoid; }` — cada recomendación y cada fila de la tabla de oportunidades lleva esta clase.
  - `.detalle-pie-impresion { display: block !important; }` — el pie (`display:none` en pantalla) sólo aparece impreso, con el texto `"RECABRA · Recomendaciones de asesoría · <período> · generado <fecha>"`.
  - La cabecera (nombre, slug, estado de cuenta, período, fecha `generado_en`) no lleva ninguna de esas clases de ocultamiento — siempre visible, en pantalla e impresión.

## Página — resumen de lo construido

`DetalleCliente.tsx`, fuera del layout de sede, misma familia visual que `ReportePlataforma.tsx`/`Plataforma.tsx` (`data-consola-tema`, `TemaToggle`, `temaInicial`/`guardarTema`, fondo `var(--con-bg)`, sin librerías nuevas más allá de `lucide-react` ya presente — usé `ArrowLeft`, `FileText`, `Printer`, `Search`, todos ya en el paquete instalado).

Cabecera: botón Volver (a `/plataforma`), nombre + slug + estado de cuenta, selector de período (`input type="month"`, default `mesActual()`, recarga al cambiar vía `useEffect`), botón "Reporte de transparencia" (navega a `/plataforma/reporte/:slug`), botón "Imprimir recomendaciones" (`window.print()`), `TemaToggle`.

Secciones, en el orden de la spec:

1. **Recomendaciones** — tile resumen (Σ valor en juego + conteo "Prioridad alta" con media/baja en el contexto), lista priorizada con badge de prioridad (`BadgePrioridad`, punto + palabra, tono `--con-estado-corte`/`--con-estado-aviso`/`--con-ink-3` para alta/media/baja), etiqueta legible del tipo (`TIPO_RECOMENDACION_LABEL`), valor formateado como plata y la `explicacion` tal cual llega del backend. Estado vacío "Sin recomendaciones para este período."
2. **Oportunidades** — tabla: código, sede, tipo, estado (pill `PillEstadoEspacio`, reusada de la de espacios), precio sugerido + origen, candidatos (chips), valor estimado, y la oración de la oportunidad (`textoOportunidad`). Σ valor arriba de la tabla.
3. **Espacios** — filtrable por sede/tipo/estado (selects poblados desde `espacios` con `useMemo`) + buscador case-insensitive por código (completo o corto) o proveedor. Columnas: código (+cara si aplica), sede, tipo, zona, área, estado (pill + "vence en N días" cuando `se_libera`), proveedor, marca, canon, inicio, fin. Contador "N de M espacios". Nota ámbar "K contratos fuera del plano" si `contratos_fuera_del_plano > 0`.
4. **Por tipo** — tabla `resumen_por_tipo`: total/ocupados/libres/ocupación %(derivada en frontend: `ocupados/total*100`, `null` con `total === 0` — no viaja en el shape)/canon promedio-mín-máx/tarifa configurada como "Sí"/"No" — **nunca** un valor de tarifa.
5. **Proveedores** — tabla: nombre, espacios, participación %, tipos, sedes, canon total, promedio, desde, por vencer 60d (resaltado ámbar si > 0).
6. **Movimientos** — 12 meses, con una vista de barras opcional arriba (`Barras`/`BarraFila` de `consola.tsx`, valor = `|entradas − salidas|`, tono "conteo", etiqueta `"N↑ / M↓"`) y debajo, mes a mes: entradas (proveedor, código, tipo, canon, fecha, "cancelado" si aplica) y salidas (motivo vencimiento/cancelación); meses sin nada colapsan en `"sin movimientos"`.

Estados: `loading` → "Cargando detalle…"; `sedes_con_plano === 0` → `EstadoVacio "Sin plano cargado."` arriba de las secciones (que igual se pintan — un cliente sin plano puede tener una recomendación `arranque`); error → `EstadoError` con el `detail` del backend tal cual (404/503 con el texto fijo del backend, 422 con su propio detail, todo vía `describeError`).

## Qué asumí del backend (gaps — el Verificador/backend deben confirmar)

- **`resumen_por_tipo` no trae `ocupacion_pct`** según el shape fijado por el Maestro — lo derivo en el frontend (`ocupados/total*100`, `null` si `total === 0`). Si el backend decide mandarlo de todas formas, es un campo extra que hoy no leo (no rompe tipos porque no lo tipé); si en cambio el nombre del campo derivado difiere de mi cálculo por algún redondeo, es cosmético.
- **`estado_cuenta` en la cabecera** se pinta como texto plano (`{detalle.cliente.estado_cuenta}`), no con el `EstadoPill` de `consola.tsx` (que exige `EstadoCuenta`, que sí es el tipo — podría haber usado `EstadoPill` directamente; lo dejé como texto simple por tiempo, es un cambio de una línea si el Verificador lo prefiere con el pill de la consola. **Nota para mí mismo**: es fácil de mejorar, no es un bug, pero lo señalo como posible pulido visual pendiente.)
- **`dias_para_vencer` en `se_libera`**: asumo que siempre es no-negativo cuando `estado === "se_libera"` (el contrato vence *dentro* del período, no ya vencido) — lo muestro tal cual venga, sin `Math.abs` ni validación adicional; si el backend manda un negativo ahí, se vería "vence en -3 días" (no lo intercepté porque la spec no aclara ese caso y el Maestro dijo "el backend decide el signo").
- **`contrato.arranca_en_periodo`**: no lo muestro explícitamente en la tabla de Espacios (no hay columna dedicada en la spec para esto) — queda disponible en el tipo pero sin render específico. Si el Verificador quiere una marca visual para "arranca en el período", es un `<span>` adicional fácil de agregar en la celda de "Inicio".
- **Orden de `espacios`/`proveedores`/`resumen_por_tipo`**: no asumí ningún orden particular del backend más allá de que `oportunidades` y `recomendaciones` ya vienen ordenadas (per spec, "ya ordenadas por...") — no las reordeno. Para `espacios`, `proveedores` y `resumen_por_tipo` los pinto en el orden que llegan (no aplico ningún `sort` propio), asumiendo que el backend no promete un orden particular ahí.
- **Formato de plata**: usé `Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 })`, igual que `Plataforma.tsx`/`ReportePlataforma.tsx` (con símbolo `$` y puntos de miles, sin decimales) — no existe un formateador exportado y compartido en `consola.tsx`, así que lo dupliqué localmente en `DetalleCliente.tsx`, siguiendo el mismo patrón que ya usan las otras dos páginas (cada una define su propio `COP`/`formatoCOP`).
- **`benchmark_plataforma`** no se pinta en ninguna tabla directamente (la spec no pide una sección para él) — sólo se usa indirectamente a través de `origen_precio === "benchmark"` en Oportunidades. El tipo queda definido y disponible por si el Verificador quiere una vista adicional.

## Lo que el Verificador tiene que capturar

- **URL**: `/plataforma/clientes/<slug-de-un-cliente-sembrado>` (con el período por defecto, mes actual) — pantalla completa con las 6 secciones, idealmente con un cliente que tenga al menos: una recomendación de cada tipo posible en la siembra de la spec (`espacio_libre`, `contrato_por_vencer`, `concentracion_proveedor`, `sin_tarifa`), al menos una oportunidad con candidatos (uno `mismo_tipo`), un espacio `se_libera` (para ver "vence en N días"), y algún mes con movimientos.
- **Claro y oscuro**: alternar con `TemaToggle` en esa misma URL — confirmar que ninguna sección queda con texto invisible o contraste roto (todo usa tokens `--con-*`, nada hardcodeado fuera del bloque de impresión).
- **Impresión**: abrir el diálogo de impresión (`Imprimir recomendaciones` o Ctrl/Cmd+P) sobre esa misma URL y confirmar: (a) la barra de controles desaparece, (b) la paleta se ve clara sin importar el tema activo en pantalla, (c) sólo aparecen cabecera + Recomendaciones + Oportunidades (Espacios/Por tipo/Proveedores/Movimientos no deben aparecer), (d) el pie `"RECABRA · Recomendaciones de asesoría · <período> · generado <fecha>"` aparece al final, (e) ningún item de Recomendaciones ni fila de Oportunidades se corta a la mitad entre dos páginas.
- **Filtros de Espacios**: probar sede/tipo/estado + buscador por código y por proveedor, confirmar que el contador "N de M espacios" cuadra con lo filtrado.
- **Botón "Ver detalle"** en `/plataforma` (tabla de Clientes): confirmar que navega a la URL correcta por slug, y que el botón "Reporte" sigue funcionando igual que antes (no debería haber cambiado su comportamiento, sólo su posición/ancho de columna).
- **Errores**: forzar 404 (slug inexistente vía URL a mano), 403 (con un token que no sea operador, si el Verificador tiene forma de simular esto), y confirmar que el texto que se muestra es el `detail` del backend tal cual, sin traducción del frontend (a diferencia del 403 de `ReportePlataforma.tsx`, que sí traduce un caso puntual — acá no hay ninguna traducción especial).

## Verificación corrida (mi territorio, builder)

```
cd /tmp/retail-espacios-test/frontend && npx tsc --noEmit
```

Exit code 0, cero errores. No corrí `npm run build` ni `npm install` ni la suite de backend (regla de verificación del builder). No agregué tests nuevos (no hay lógica de negocio propia del frontend que amerite un test unitario aparte del contrato de tipos, que `tsc` ya cubre).
