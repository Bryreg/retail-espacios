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
  /** `false` = archivado: nadie entra, no sale en el ingreso ni en el
   *  análisis de la consola, y los datos siguen intactos. */
  activo: boolean;
  /** El cliente de la instalación original, que vive en la base del
   *  registro: se archiva, pero nunca se borra. */
  base_principal: boolean;
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

// ─── El ciclo de vida de un cliente (2026-09-23) ────────────────────────────
//
// Renombrar cambia sólo el nombre visible (el código queda: va adentro de
// cada token). Archivar se deshace; borrar no, y el backend sólo lo acepta
// sobre un cliente ya archivado, que no sea el de la base principal, y con el
// código escrito a mano en `confirmacion`.

export interface ClienteDeConsola {
  slug: string;
  nombre: string;
  activo: boolean;
}

const rutaCliente = (slug: string) => `/plataforma/clientes/${encodeURIComponent(slug)}`;

export const renombrarCliente = (slug: string, nombre: string): Promise<ClienteDeConsola> =>
  client.put<ClienteDeConsola>(`${rutaCliente(slug)}/nombre`, { nombre }).then((r) => r.data);

export const archivarCliente = (slug: string, motivo: string): Promise<ClienteDeConsola> =>
  client.post<ClienteDeConsola>(`${rutaCliente(slug)}/archivar`, { motivo }).then((r) => r.data);

export const reactivarCliente = (slug: string, motivo: string): Promise<ClienteDeConsola> =>
  client.post<ClienteDeConsola>(`${rutaCliente(slug)}/reactivar`, { motivo }).then((r) => r.data);

/** Filas copiadas por tabla de negocio. Se nombran las tres que la consola
 *  cuenta al terminar; las demás tablas viajan igual, sin nombre acá. */
export interface FilasTraspaso {
  spaces?: number;
  space_leases?: number;
  suppliers?: number;
  [tabla: string]: number | undefined;
}

export interface ResultadoTraspaso {
  principal: string;
  origen: string;
  filas: FilasTraspaso;
}

/** Los datos de este cliente reemplazan a los de la base principal; este queda
 *  archivado, intacto, de respaldo. `confirmacion` es el código del PRINCIPAL,
 *  que es el que pierde lo que tenía. Ver `backend/app/services/traspaso.py`. */
export const pasarAlPrincipal = (slug: string, confirmacion: string): Promise<ResultadoTraspaso> =>
  client
    .post<ResultadoTraspaso>(`${rutaCliente(slug)}/pasar-al-principal`, { confirmacion })
    .then((r) => r.data);

export const borrarCliente = (slug: string, confirmacion: string): Promise<{ ok: boolean; slug: string }> =>
  client
    .post<{ ok: boolean; slug: string }>(`${rutaCliente(slug)}/borrar`, { confirmacion })
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

/** Shape del reporte de transparencia (`GET .../reporte`), DISTINTO del de
 *  /metricas y /tendencia: el backend remapea `contratos_activos` -> `contratos`
 *  al armar `valores[].top_proveedores` (plataforma_reporte.py::_top_reporte). */
export interface ProveedorTopReporte {
  nombre: string;
  contratos: number;
}

export interface PeriodoMetricas {
  anio_mes: string;
  desde: string;
  hasta: string;
}

/** Agregados taxativos de la spec. Fase 7 quitó la supresión de celda chica:
 *  el operador ve los agregados EXACTOS de todos los clientes, sin umbral.
 *  `ocupacion_pct` puede venir `null` (sin espacios comercializables o sin
 *  contratos activos que la calculen ese período) -- nunca se asume un 0 en
 *  su lugar, porque 0% de ocupación y "no hay dato" no son lo mismo.
 *  `ingreso_contratado_mes` es SIEMPRE un número (0.0 con cero contratos
 *  activos): es la suma exacta del canon de los contratos activos, así que
 *  con un contrato es ese contrato, sin ocultarlo. `canon_promedio_mensual`
 *  es un número con 1 o más contratos activos y `null` SOLO con cero (no
 *  existe el promedio de cero cosas). */
export interface AgregadosMetricas {
  sedes_con_plano: number;
  espacios_comercializables: number;
  ocupacion_pct: number | null;
  canon_promedio_mensual: number | null;
  ingreso_contratado_mes: number;
  top_proveedores: ProveedorTop[];
  usuarios_con_cuenta: number;
}

export interface ConsolidadoMetricas extends AgregadosMetricas {
  clientes_total: number;
  clientes_con_error: number;
  /** Oportunidad de precio (Fase 6), consolidada Σ canon / Σ tarifa de los
   *  clientes con tarifa configurada -- NUNCA promedio de spreads (ver
   *  `clientes_con_tarifa`); Fase 7: suma a TODOS los clientes legibles con
   *  tarifa configurada, sin umbral. `null` cuando ningún cliente legible
   *  tiene tarifa configurada, o hay tarifa pero ningún contrato con tarifa
   *  aplicable. La tarifa de referencia en sí JAMÁS sale de la base del
   *  cliente -- esto es sólo la relación canon/tarifa, 1 decimal, negativo =
   *  por debajo. */
  spread_pct: number | null;
  /** Cuántos clientes del consolidado tienen tarifa de referencia
   *  configurada -- distingue "nadie configuró tarifa" de "configuraron
   *  pero ningún contrato tiene tarifa aplicable" cuando `spread_pct` es
   *  `null`. */
  clientes_con_tarifa: number;
}

/** Agregados por cliente -- superset de `AgregadosMetricas` con
 *  `ultimo_acceso`, que sólo tiene sentido por cliente (el consolidado no
 *  tiene una fecha única que lo resuma). Es SOLO la fecha, nunca quién --
 *  la spec es explícita: "la fecha, no quién". */
export interface AgregadosMetricasCliente extends AgregadosMetricas {
  ultimo_acceso: string | null;
  /** Oportunidad de precio (Fase 6): `(Σ canon / Σ tarifa aplicable − 1) ×
   *  100` sobre los contratos activos con tarifa aplicable de este cliente,
   *  1 decimal. Negativo = cobra por debajo de su tarifa de referencia.
   *  `null` por CUALQUIERA de dos motivos taxativos -- distinguilos con
   *  `tarifa_configurada`, nunca se adivina cuál fue:
   *   (i) `tarifa_configurada === false` -- el cliente no configuró tarifa;
   *   (ii) hay tarifa pero cero contratos con tarifa aplicable en el
   *        período (Fase 7: ya no hay umbral -- con 1 contrato con tarifa
   *        aplicable, el número sale exacto).
   *  La tarifa de referencia NUNCA viaja en este campo ni en ningún otro --
   *  sólo la relación. */
  spread_pct: number | null;
  /** Si el cliente tiene tarifa de referencia configurada (default o por
   *  sede) en `/api/layout/rates`. `false` es el estado más común al
   *  principio -- la consola lo dice, no inventa un spread. */
  tarifa_configurada: boolean;
  /** Contratos activos de este cliente cuyo espacio no tiene tarifa
   *  aplicable (ni por sede ni default) -- no entran en la cuenta del
   *  spread. Conteo, nunca un monto. */
  contratos_sin_tarifa: number;
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
// recta sobre la ausencia. Fase 7 quitó la supresión de celda chica: los
// agregados de un mes con snapshot son EXACTOS, sin umbral. Dos ausencias
// distintas por mes, nunca un 0 inventado en su lugar:
//   (a) `sin_dato: true`                              -- no hay snapshot ese mes.
//   (b) `sin_dato: false`, `canon_promedio_mensual: null` y
//       `top_proveedores: []`                         -- cero contratos activos
//       ese mes (NUNCA supresión -- `ingreso_contratado_mes` sigue siendo un
//       número exacto, 0.0 en ese caso, nunca `null`).
//   (c) `sin_dato: false`, `ocupacion_pct: null`       -- sin espacios
//       comercializables ese mes (distinto de (b): ver `publicar_fila`).
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

// ─── Cohortes de adopción (Fase 6 plataforma) ───────────────────────────────
//
// Shape FIJADO por el contrato vinculante de la Fase 6 (mensaje del Maestro,
// campo por campo) -- codificado contra el contrato, no contra una respuesta
// real (el backend lo implementa en paralelo). Todo sale del registro
// (usuarios, membresías, fundaciones, estados_cliente) -- ninguna base de
// cliente se abre para esto salvo lo que `/metricas` ya abre para
// `con_contratos_activos`. Ningún correo, nombre ni id de usuario en el
// cuerpo -- sólo conteos y fechas sin hora. La clasificación se calcula UNA
// vez en el backend: el frontend NUNCA re-deriva estados a partir de fechas,
// sólo pinta `clasificacion` tal cual llega.

export type Clasificacion = "nueva" | "activa" | "fantasma" | "dormida" | "sin_cuentas";

export interface CohorteAdopcion {
  /** Mes de alta `"YYYY-MM"`, o `null` = "sin fecha de alta" (se muestra con
   *  ese texto, al final -- no se inventa un mes). */
  cohorte: string | null;
  clientes: number;
  /** % de la cohorte con algún acceso en los últimos 30 días. `null` cuando
   *  no aplica (p. ej. cohorte vacía) -- nunca se asume 0. */
  retencion_30d_pct: number | null;
  nueva: number;
  activa: number;
  fantasma: number;
  dormida: number;
  sin_cuentas: number;
}

export interface ClienteAdopcion {
  slug: string;
  nombre: string;
  estado_cuenta: EstadoCuenta;
  /** Mensaje de la base rota, o `null` si se leyó bien (mismo patrón que
   *  `ClienteMetricas.error`). */
  error: string | null;
  cohorte: string | null;
  clasificacion: Clasificacion;
  usuarios_con_cuenta: number;
  usuarios_activos_30d: number;
  /** Desde el último acceso de CUALQUIER usuario del cliente. `null` si
   *  nunca entró nadie -- no es lo mismo que 0. */
  dias_sin_acceso: number | null;
  con_contratos_activos: boolean;
}

export interface Adopcion {
  periodo: string; // "YYYY-MM"
  generado_en: string; // ISO 8601 UTC
  /** Ya vienen ordenadas por mes ascendente -- no reordenar. */
  cohortes: CohorteAdopcion[];
  /** Ya vienen ordenados fantasma → dormida → sin_cuentas → nueva → activa
   *  (es "a quién llamar hoy" primero) -- respetar el orden del backend, no
   *  reordenar por otra cosa. */
  clientes: ClienteAdopcion[];
}

/** Sin parámetros: el backend fija `periodo` al mes actual. 401 sin token,
 *  403 quien no es operador. **Nunca se guarda en localStorage**: mismo
 *  guardrail que `getClientesPlataforma`/`getMetricasPlataforma`/
 *  `getTendencia` -- vive sólo en el estado de quien la pide. */
export const getAdopcion = (): Promise<Adopcion> =>
  client.get<Adopcion>("/plataforma/adopcion").then((r) => r.data);

// ─── Reporte de transparencia (Fase 7 plataforma) ───────────────────────────
//
// Shape FIJADO por el contrato vinculante de la Fase 7 (mensaje del Maestro,
// campo por campo) -- idéntico en backend y frontend, y el MISMO JSON para
// las dos vías de acceso: el dueño del cliente (`getMiReportePlataforma` en
// `api/derechos.ts`, que reexporta este tipo) y el operador
// (`getReporteCliente`, acá abajo). Es la contrapartida de haber quitado la
// supresión de celda chica (Fase 7, Parte A): cada cliente puede auditar exactamente qué
// agregado tomó la plataforma de él, cómo lo calculó, de dónde, para qué, y
// quién del operador lo consultó y cuándo. Sin filas de contratos, sin PII de
// usuarios finales, proveedor SANEADO -- misma frontera que `/metricas`.

export interface CatalogoEntrada {
  clave: string;
  nombre: string;
  definicion: string;
  fuente: string;
  finalidad: "asesoria" | "salud_cartera" | "cobranza";
  endpoints: string[];
  tratamiento: "exacto" | "saneado" | "sin_hora" | "conteo" | "relacion";
}

/** Un mes de la ventana del reporte. `sin_dato: true` -- sin snapshot ese mes
 *  (no hay fila en `snapshot_metricas`) -- deja el resto en `null`/`[]`,
 *  mismo patrón que `PuntoTendencia`. Con `sin_dato: false`, los crudos que
 *  vienen de `snapshot_metricas` para ese cliente: caras, ocupadas,
 *  contratos, canon total, usuarios, top de proveedores SANEADO. Sin filas de
 *  contratos individuales. */
export interface ValorReporte {
  periodo: string; // "YYYY-MM"
  sin_dato: boolean;
  origen: "vista" | "cierre" | null;
  capturado_en: string | null;
  sedes_con_plano: number | null;
  espacios_comercializables: number | null;
  ocupadas: number | null;
  ocupacion_pct: number | null;
  contratos_activos: number | null;
  canon_total: number | null;
  canon_promedio_mensual: number | null;
  usuarios_con_cuenta: number | null;
  top_proveedores: ProveedorTopReporte[];
}

export interface SpreadActualReporte {
  periodo: string; // "YYYY-MM"
  tarifa_configurada: boolean;
  spread_pct: number | null;
  contratos_sin_tarifa: number;
}

export interface LineaAccesoReporte {
  fecha: string; // sin hora -- "YYYY-MM-DD"
  operador: string; // email del operador que consultó
  accion: string;
  periodo: string;
}

export interface ReporteTransparencia {
  cliente: { slug: string; nombre: string };
  generado_en: string; // ISO 8601 UTC
  ventana: { desde: string; hasta: string; meses: number }; // "YYYY-MM"
  politica: {
    version_vigente: string;
    version_aceptada: string | null;
    aceptada_en: string | null;
    base_legal: string;
    url: string;
  };
  /** Lista TAXATIVA de agregados de `/metricas`, `/tendencia` y `/adopcion`
   *  -- estática en el código del backend (`plataforma_reporte.py::CATALOGO`),
   *  no prosa suelta armada acá. */
  catalogo: CatalogoEntrada[];
  /** Mes a mes en la ventana, del más viejo al más nuevo -- mismo patrón que
   *  `Tendencia.serie`: siempre `ventana.meses` puntos consecutivos. */
  valores: ValorReporte[];
  /** Spread del mes en curso, o `null` si no aplica (sin tarifa configurada
   *  ni contratos con tarifa aplicable en ningún mes de la ventana). La
   *  tarifa de referencia en sí NUNCA sale -- sólo la relación, igual que en
   *  `/metricas`. */
  spread_actual: SpreadActualReporte | null;
  /** Cada línea de `bitacora_plataforma` que alcanzó a este cliente en la
   *  ventana -- fecha SIN hora, correo del operador, acción y período. */
  accesos: { total: number; lineas: LineaAccesoReporte[] };
  /** Los 4 derechos del titular, como texto ya armado para mostrar. */
  derechos: { export: string; supresion: string; reporte: string; contacto: string };
}

/** Para el OPERADOR: `GET /plataforma/clientes/{slug}/reporte?meses=N`
 *  (`require_operador`, ruta declarada DESPUÉS de las literales de
 *  `/metricas`/`/tendencia`/`/adopcion`, antes de `/clientes/{slug}` a secas).
 *  El propio reporte queda anotado en la bitácora (`accion="reporte"`) --
 *  el reporte siguiente del dueño lo va a listar como un acceso más. `meses`
 *  1..24, 12 por defecto. Ningún otro slug se abre -- sólo el que se pide. */
export const getReporteCliente = (slug: string, meses = 12): Promise<ReporteTransparencia> =>
  client
    .get<ReporteTransparencia>(`/plataforma/clientes/${encodeURIComponent(slug)}/reporte`, { params: { meses } })
    .then((r) => r.data);

// ─── Detalle por cliente para asesoría (Fase 8) ─────────────────────────────
//
// Shape FIJADO por el contrato vinculante de la Fase 8 (mensaje del Maestro,
// campo por campo) -- codificado contra el contrato, no contra una respuesta
// real (el backend lo implementa en paralelo, contra el MISMO shape). Abre UNA
// sola base de cliente, solo lectura -- espacio por espacio, contrato por
// contrato, con oportunidades y recomendaciones ya calculadas por el backend.
// Nunca viaja acá: datos de contacto de proveedor, notas, fotos, ningún dato
// de usuario del supermercado, ni el valor de una tarifa de referencia (sólo
// `tarifa_configurada` sí/no). El nombre del proveedor ya llega SANEADO
// (`sanear_nombre_proveedor`) -- no se retoca en el frontend.

export interface ClienteDetalle {
  slug: string;
  nombre: string;
  estado_cuenta: EstadoCuenta;
}

/** Agregado por sede dentro del detalle -- distinto de `AgregadosMetricas`
 *  (que es del cliente entero): acá es SOLO conteo de espacios de esa sede,
 *  sin canon ni proveedores. `ocupacion_pct` es `null` con cero espacios
 *  comercializables en esa sede. */
export interface SedeDetalle {
  sede: string;
  espacios: number;
  ocupados: number;
  libres: number;
  ocupacion_pct: number | null;
}

/** Contrato vigente de un espacio ocupado (o que arranca/vence en el
 *  período). `dias_para_vencer` puede ser negativo si ya venció dentro del
 *  período mostrado (el backend decide el signo; el frontend lo muestra tal
 *  cual). `arranca_en_periodo`: el contrato empezó dentro de la ventana
 *  pedida -- un espacio así cuenta como ocupado igual. */
export interface ContratoEspacioDetalle {
  proveedor: string;
  marca: string | null;
  canon_mensual: number;
  inicio: string; // "YYYY-MM-DD"
  fin: string; // "YYYY-MM-DD"
  dias_para_vencer: number;
  arranca_en_periodo: boolean;
}

/** Un espacio comercializable del plano (cara `-B` incluida). `codigo` es el
 *  código completo `SEDE-CODE`; `codigo_corto` es sin el prefijo de sede.
 *  `contrato` es `null` sólo cuando `estado === "libre"` -- con `"ocupado"` o
 *  `"se_libera"` siempre viene el contrato que sustenta ese estado. */
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

/** Resumen por tipo de espacio de ESTE cliente. `canon_promedio/minimo/maximo`
 *  son de los contratos VIGENTES de ese tipo -- `null` con cero contratos
 *  vigentes de ese tipo (no existe el promedio/mínimo/máximo de cero cosas).
 *  `tarifa_configurada`: sí/no -- JAMÁS el valor de la tarifa en sí. */
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

/** Proveedor de este cliente. `desde`: fecha (sin hora) del primer contrato
 *  de este proveedor con este cliente, o `null` si no se pudo determinar. */
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

/** Un mes de la ventana de movimientos (siempre 12, del más viejo al más
 *  nuevo -- mismo patrón que `Tendencia.serie`, pero acá no hay `sin_dato`:
 *  un mes sin movimientos simplemente trae `entradas`/`salidas` vacíos, y el
 *  frontend lo colapsa en una línea ("sin movimientos"). */
export interface MovimientoMes {
  mes: string; // "YYYY-MM"
  entradas: MovimientoEntrada[];
  salidas: MovimientoSalida[];
}

/** Candidato a ocupar un espacio libre/que se libera: un proveedor de este
 *  mismo cliente que todavía no ocupa ESE espacio. `mismo_tipo`: ya ocupa
 *  otro espacio del mismo tipo que el ofrecido (candidato más natural). */
export interface OportunidadCandidato {
  proveedor: string;
  canon_actual: number;
  mismo_tipo: boolean;
}

/** Oportunidad sobre un espacio libre o que se libera, ya ordenadas por
 *  `valor_estimado_mensual` descendente por el backend -- no reordenar.
 *  `precio_sugerido` es `null` sólo si ni este cliente ni la plataforma
 *  tienen una referencia calculable para ese tipo (entonces
 *  `origen_precio` también es `null`); con precio, `origen_precio` distingue
 *  "promedio de ESTE cliente" de "benchmark de la plataforma" -- el texto de
 *  la oportunidad (y su matiz) se arma en el frontend a partir de estos
 *  campos, nunca viaja como prosa desde el backend. */
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

/** Recomendación ya calculada y priorizada por el backend -- `explicacion`
 *  SÍ viaja como texto (a diferencia de las oportunidades), generada por el
 *  backend a partir de los datos, sin PII. `datos` es de forma libre por
 *  `tipo` (los campos que sustentan esa recomendación puntual) -- el
 *  frontend nunca depende de una clave particular de `datos` para pintar la
 *  lista, sólo la usa si quiere enriquecer (no es parte del contrato de
 *  render mínimo). Ya vienen ordenadas por prioridad y luego valor -- no
 *  reordenar. */
export interface Recomendacion {
  id: string;
  tipo: TipoRecomendacion;
  prioridad: PrioridadRecomendacion;
  valor_estimado_mensual: number;
  explicacion: string;
  datos: Record<string, unknown>;
}

/** `GET /plataforma/clientes/{slug}/detalle?periodo=YYYY-MM` -- shape
 *  VINCULANTE de la Fase 8 (spec `features/asesoria-detalle/spec.md`).
 *  `benchmark_plataforma`: UN número por tipo de espacio (promedio de TODOS
 *  los clientes legibles de ese tipo) -- sin desglose ni nombres de otros
 *  clientes; es el mapa `{tipo: promedio}` que usan las oportunidades de este
 *  cliente cuando él mismo no tiene contratos vigentes de ese tipo. */
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

/** `periodo` en formato `"YYYY-MM"`; sin él, el backend usa el mes actual
 *  (misma ventana que `/metricas`). 401 sin token (interceptor), 403 quien no
 *  es operador, 404 slug inexistente (texto fijo), 422 período inválido,
 *  503 base ilegible (texto fijo) -- todos con el `detail` del backend, que
 *  se muestra tal cual en `EstadoError`. Cada llamada anota
 *  `accion="detalle"` en la bitácora del registro (el backend, no hay nada
 *  que mandar acá para eso). **Nunca se guarda en localStorage**: mismo
 *  guardrail que el resto de `/plataforma/*` -- vive sólo en el estado de
 *  quien la pide. */
export const getDetalleCliente = (slug: string, periodo?: string): Promise<DetalleCliente> =>
  client
    .get<DetalleCliente>(`/plataforma/clientes/${encodeURIComponent(slug)}/detalle`, {
      params: periodo ? { periodo } : undefined,
    })
    .then((r) => r.data);
