import client from "./client";

// ─── Panel del operador de plataforma (Fase 2 clientes) ─────────────────────
//
// Shapes fijados por el contrato vinculante de la Fase 2
// (features/clientes/outputs/equipo-fase-2.md §2.2 B/C/D). Sólo datos del
// registro — nunca dinero ni datos de negocio de un cliente.

/** ¿Esta cuenta es operador de plataforma? El legado (token sin email)
 *  siempre da `false` — no hace falta filtrarlo antes de preguntar, el
 *  backend ya lo resuelve así. */
export const soyOperador = (): Promise<boolean> =>
  client.get<{ operador: boolean }>("/plataforma/soy").then((r) => r.data.operador);

export type EstadoCuenta = "activo" | "gracia" | "solo_lectura" | "suspendido";

export const ESTADOS_CUENTA: EstadoCuenta[] = ["activo", "gracia", "solo_lectura", "suspendido"];

export interface ClientePlataforma {
  slug: string;
  nombre: string;
  activo: boolean;
  estado: EstadoCuenta;
  motivo: string | null;
  cambiado_en: string | null;
  cambiado_por: string | null;
}

/** Todos los clientes del registro con su estado — 403 si quien pregunta no
 *  es operador. **Nunca se guarda en localStorage**: es la lista completa de
 *  clientes de la plataforma, y persistirla filtraría eso entre sesiones de
 *  la misma máquina (ver guardrail en el mismo espíritu que `referenceRates`
 *  en `store/fixtureStore.ts`). Vive sólo en el estado del componente que la
 *  pide, tan fresca como la última vez que se abrió el panel. */
export const getClientesPlataforma = (): Promise<ClientePlataforma[]> =>
  client
    .get<{ clientes: ClientePlataforma[] }>("/plataforma/clientes")
    .then((r) => r.data.clientes);

export interface CambiarEstadoPayload {
  estado: EstadoCuenta;
  motivo: string;
}

/** La fila actualizada — sin `nombre` ni `activo`: quien llama ya los tiene
 *  y los conserva al mezclar la respuesta en su copia local. */
export interface EstadoClienteActualizado {
  slug: string;
  estado: EstadoCuenta;
  motivo: string;
  cambiado_en: string;
  cambiado_por: string;
}

export const patchEstadoCliente = (
  slug: string,
  payload: CambiarEstadoPayload
): Promise<EstadoClienteActualizado> =>
  client
    .patch<EstadoClienteActualizado>(`/plataforma/clientes/${encodeURIComponent(slug)}`, payload)
    .then((r) => r.data);

// ─── Métricas del negocio (Fase 4 plataforma) ───────────────────────────────
//
// Shape FIJADO por el contrato vinculante de la Fase 4 (mensaje del Maestro,
// campo por campo) -- no se ajusta a ojo mirando una respuesta real. El
// backend arma estos agregados recorriendo las bases de cliente en secuencia,
// solo lectura, tolerante a fallos: una base rota deja su fila con `error` y
// `metricas: null`, el resto sigue (patrón `_run_lease_maintenance`). El JSON
// JAMÁS trae filas de negocio ni datos de usuarios finales -- sólo números y
// el top-5 de proveedores (nombre + conteo).

export interface ProveedorTop {
  nombre: string;
  contratos_activos: number;
}

export interface PeriodoMetricas {
  anio_mes: string;
  desde: string;
  hasta: string;
}

/** Agregados taxativos de la spec. `ocupacion_pct` y los montos pueden venir
 *  `null` (p. ej. sin contratos activos en el período) -- nunca se asume un
 *  0 en su lugar, porque 0% de ocupación y "no hay dato" no son lo mismo. */
export interface AgregadosMetricas {
  sedes_con_plano: number;
  espacios_comercializables: number;
  ocupacion_pct: number | null;
  canon_promedio_mensual: number | null;
  ingreso_contratado_mes: number | null;
  top_proveedores: ProveedorTop[];
  usuarios_con_cuenta: number;
}

export interface ConsolidadoMetricas extends AgregadosMetricas {
  clientes_total: number;
  clientes_con_error: number;
}

/** Agregados por cliente -- superset de `AgregadosMetricas` con
 *  `ultimo_acceso`, que sólo tiene sentido por cliente (el consolidado no
 *  tiene una fecha única que lo resuma). Es SOLO la fecha, nunca quién --
 *  la spec es explícita: "la fecha, no quién". */
export interface AgregadosMetricasCliente extends AgregadosMetricas {
  ultimo_acceso: string | null;
}

export interface ClienteMetricas {
  slug: string;
  nombre: string;
  estado_cuenta: EstadoCuenta;
  /** Mensaje de la base rota, o `null` si se leyó bien. Cuando hay error,
   *  `metricas` es siempre `null` -- nunca los dos a la vez. */
  error: string | null;
  metricas: AgregadosMetricasCliente | null;
}

export interface MetricasPlataforma {
  periodo: PeriodoMetricas;
  /** ISO 8601 UTC -- cuándo se armó esta respuesta (si `de_cache`, cuándo se
   *  armó la que quedó en caché, no cuándo se sirvió esta llamada). */
  generado_en: string;
  /** `true` en un hit del caché de 5 min del registro. */
  de_cache: boolean;
  consolidado: ConsolidadoMetricas;
  clientes: ClienteMetricas[];
}

/** `periodo` en formato `"YYYY-MM"`; sin él, el backend usa el mes actual.
 *  Cada llamada anota en la bitácora del registro quién (el operador, por el
 *  JWT), cuándo y qué período -- eso lo hace el backend, no hay nada que
 *  mandar acá para eso. */
export const getMetricasPlataforma = (periodo?: string): Promise<MetricasPlataforma> =>
  client
    .get<MetricasPlataforma>("/plataforma/metricas", { params: periodo ? { periodo } : undefined })
    .then((r) => r.data);

// ─── Tendencia temporal (Fase 5 plataforma) ─────────────────────────────────
//
// Shape verificado contra el backend real (`backend/app/plataforma_tendencia.py`
// -- funciones `serie()` y `_mes_vacio()`, ambas leídas antes de escribir este
// bloque): `GET /plataforma/tendencia` SIEMPRE trae `meses` puntos
// consecutivos, del más viejo al más nuevo, terminando en el mes en curso --
// nunca se omite un mes, un hueco se rellena con `_mes_vacio()` (`sin_dato:
// true`, todo lo demás `null`/`[]`) para que el gráfico no interpole una
// recta sobre la ausencia. Tres ausencias distintas por mes, nunca un 0
// inventado en su lugar:
//   (a) `sin_dato: true`                              -- no hay snapshot ese mes.
//   (b) `sin_dato: false`, `ingreso_contratado_mes`/`canon_promedio_mensual`
//       null y `top_proveedores: []`                  -- suprimido por K=3.
//   (c) `sin_dato: false`, `ocupacion_pct: null`       -- sin espacios
//       comercializables ese mes (no es K=3: `ocupacion_pct` no participa
//       de la supresión de celda chica, ver `publicar_fila`).
// `parcial: true` es el mes en curso, cuyos números todavía pueden cambiar.

/** Slug reservado para el consolidado ponderado (Σ/Σ) de todos los clientes;
 *  el mismo valor que usa el backend como default de `cliente`
 *  (`plataforma_tendencia.CONSOLIDADO_SLUG`). */
export const CONSOLIDADO_SLUG = "__consolidado__";

export interface PuntoTendencia {
  periodo: string; // "YYYY-MM"
  parcial: boolean;
  sin_dato: boolean;
  capturado_en: string | null;
  origen: "vista" | "cierre" | null;
  clientes_incluidos: number | null;
  clientes_con_error: number | null;
  sedes_con_plano: number | null;
  espacios_comercializables: number | null;
  ocupacion_pct: number | null;
  canon_promedio_mensual: number | null;
  ingreso_contratado_mes: number | null;
  top_proveedores: ProveedorTop[];
  usuarios_con_cuenta: number | null;
}

export interface Tendencia {
  cliente: string; // slug pedido, o CONSOLIDADO_SLUG
  nombre: string;
  meses: number;
  desde: string; // "YYYY-MM"
  hasta: string; // "YYYY-MM"
  periodo_actual: string; // "YYYY-MM"
  generado_en: string; // ISO 8601 UTC
  serie: PuntoTendencia[];
}

/** `cliente`: slug del cliente o `CONSOLIDADO_SLUG` (default del backend si
 *  se omite). `meses`: 1..24, 12 por defecto -- fuera de rango el backend
 *  responde 422 (`MesesInvalidos`), un slug inexistente responde 404
 *  (`ClienteDesconocido`), y quien no es operador, 403. **Nunca se guarda en
 *  localStorage**: son métricas de clientes, el mismo guardrail que
 *  `getClientesPlataforma` y `getMetricasPlataforma` -- vive sólo en el
 *  estado de quien la pide. */
export const getTendencia = (cliente: string = CONSOLIDADO_SLUG, meses = 12): Promise<Tendencia> =>
  client
    .get<Tendencia>("/plataforma/tendencia", { params: { cliente, meses } })
    .then((r) => r.data);
