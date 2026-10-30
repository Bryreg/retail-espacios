import client from "./client";
import type { ReferenceRates, UnifiedFixture } from "../types/fixtures";
import type { SeasonWindows } from "../types/seasons";
import type { Renumeracion } from "../utils/renumeracion";

export interface LayoutEntry {
  sede: string;
  fixtures: UnifiedFixture[];
  /** Server revision for this sede (ISO timestamp). Drives conflict detection. */
  updated_at?: string;
}

/** Lightweight polling payload — revision only, no fixture data. */
export interface LayoutRevision {
  sede: string;
  updated_at?: string;
  count: number;
}

export interface LayoutSettings {
  sedes: string[];
  catalog_labels: Record<string, string>;
  updated_at?: string;
  /** Cambia cuando los datos de este supermercado se reemplazan enteros (el
   *  traspaso a la base principal, 2026-09-23). `null`: nunca se reemplazaron.
   *  Ver `generacionCache` en `store/fixtureStore.ts`. */
  generacion?: string | null;
}

export const fetchAllLayouts = (): Promise<LayoutEntry[]> =>
  client.get("/layout/").then((r) => r.data);

export const fetchRevisions = (): Promise<LayoutRevision[]> =>
  client.get("/layout/revisions").then((r) => r.data);

/**
 * Persist one sede's fixtures.
 *
 * `baseUpdatedAt` is the revision this client started from — the server rejects
 * the write with 409 if someone else saved in between. Pass `null` to overwrite
 * unconditionally (only after the user explicitly resolves a conflict).
 */
export const saveLayout = (
  sede: string,
  fixtures: UnifiedFixture[],
  baseUpdatedAt?: string | null,
): Promise<LayoutEntry> =>
  client
    .put(`/layout/${encodeURIComponent(sede)}`, {
      fixtures,
      base_updated_at: baseUpdatedAt ?? null,
    })
    .then((r) => r.data);

/** Drop a sede's snapshot so it stops coming back on every pull. */
export const deleteLayout = (sede: string): Promise<void> =>
  client.delete(`/layout/${encodeURIComponent(sede)}`).then(() => {});

export const fetchLayoutSettings = (): Promise<LayoutSettings> =>
  client.get("/layout/settings").then((r) => r.data);

/** Season sales windows — shared by every sede. Readable by any role (they are
 *  dates, not money); only an admin may write. */
export const fetchSeasonWindows = (): Promise<{ windows: SeasonWindows }> =>
  client.get("/layout/seasons").then((r) => r.data);

export const saveSeasonWindows = (
  windows: SeasonWindows,
): Promise<{ windows: SeasonWindows }> =>
  client.put("/layout/seasons", { windows }).then((r) => r.data);

/** Admin-only in both directions — a worker request gets 403, so only call
 *  these from an admin session. */
export const fetchReferenceRates = (): Promise<ReferenceRates & { updated_at?: string | null }> =>
  client.get("/layout/rates").then((r) => r.data);

/** `base`: la revisión que se leyó (`updated_at`; `null` si nunca se
 *  guardaron). Con ella el servidor contesta 409 `rates_conflict` si otra
 *  persona guardó después (auditoría P2-17). Sin leer nada (`undefined`), no
 *  se manda y escribe como antes. */
export const saveReferenceRates = (
  rates: ReferenceRates, base?: string | null,
): Promise<ReferenceRates & { updated_at?: string | null }> =>
  client
    .put("/layout/rates", {
      default: rates.default, by_sede: rates.by_sede,
      ...(base !== undefined ? { base_updated_at: base } : {}),
    })
    .then((r) => r.data);

export const saveLayoutSettings = (
  sedes: string[],
  catalogLabels: Record<string, string>,
  baseUpdatedAt?: string | null,
): Promise<LayoutSettings> =>
  client
    .put("/layout/settings", {
      sedes,
      catalog_labels: catalogLabels,
      base_updated_at: baseUpdatedAt ?? null,
    })
    .then((r) => r.data);

export interface DeleteImpact {
  spaces: number;
  active_leases: number;
  /** Las reservas provisionales de participación que el archivo de la sede
   *  cancela (`sede_archive.count_commercial_rows`): no son leases. */
  reservas_vivas: number;
}

/** What deleting a sede would close on the commercial side. Admin only. */
export const fetchDeleteImpact = (sede: string): Promise<DeleteImpact> =>
  client.get(`/layout/${encodeURIComponent(sede)}/impact`).then((r) => r.data);

// ─── Renombrar una sede (fase 2 · I5) ────────────────────────────────────────
//
// El renombre es del servidor, en UNA transacción: los códigos de la sede
// pasan al nombre nuevo y lo vendido sigue vivo (contratos, reservas de
// participación, zonas, historial, fotos, montajes, tarifas). Antes el
// navegador lo hacía borrando la sede y creándola de nuevo, y el borrado
// cerraba los contratos y cancelaba las reservas.

/** Lo que contesta el renombre: el plano ya con el nombre nuevo, su revisión
 *  y la de la lista de sedes (las dos cambiaron), y lo que se mudó. */
export interface SedeRenombrada {
  sede: string;
  fixtures: UnifiedFixture[];
  updated_at?: string | null;
  settings_updated_at?: string | null;
  espacios: number;
  contratos: number;
  montajes: number;
  avisos: string[];
}

/** Renombra `sede` a `nuevo` en el servidor. `baseUpdatedAt`: la revisión del
 *  plano que tiene este equipo; si otro guardó en el medio, 409 y no se
 *  renombra. Admin only. */
export const renombrarSede = (
  sede: string,
  nuevo: string,
  baseUpdatedAt?: string | null,
): Promise<SedeRenombrada> =>
  client
    .post(`/layout/${encodeURIComponent(sede)}/renombrar`, {
      nuevo,
      base_updated_at: baseUpdatedAt ?? null,
    })
    .then((r) => r.data);

/** El detalle de un renombre rechazado (`sede_existe`, `renombre_bloqueado`,
 *  `layout_conflict`…), o `null` si el error es otra cosa (red, sesión). */
export function rechazoDelRenombre(err: unknown): { code: string; message: string; motivos: string[] } | null {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  if (!detail || typeof detail !== "object") return null;
  const d = detail as { code?: unknown; message?: unknown; motivos?: unknown };
  if (typeof d.code !== "string") return null;
  return {
    code: d.code,
    message: String(d.message ?? ""),
    motivos: Array.isArray(d.motivos) ? d.motivos.map(String) : [],
  };
}

// ─── Renumerar: el código pasa a ser EL nombre ───────────────────────────────
//
// DOS PASOS, y son dos endpoints distintos a propósito — la misma forma que la
// carga masiva y por la misma razón: `previo` no escribe una sola fila y
// devuelve el antes → después completo; `aplicar` escribe todo dentro de una
// transacción. Una renumeración a ciegas que sale mal no se deshace con un
// botón, así que la pantalla nunca llama al segundo sin haber mostrado el
// primero.
//
// `sedes` vacío o `null` significa TODAS, que es lo que el dueño eligió («en
// todas las sedes, parejo»): se normaliza el plano completo aunque hoy no tenga
// conflicto, para que la numeración quede con la misma lógica en todas.
//
// Los dos son de admin: una sesión worker recibe 403.

const renumeracion = (paso: "previo" | "aplicar", sedes?: string[] | null): Promise<Renumeracion> =>
  client
    .post(`/layout/renumeracion/${paso}`, { sedes: sedes && sedes.length ? sedes : null })
    .then((r) => r.data);

/** El antes → después de cada sede, SIN escribir nada. */
export const renumeracionPrevio = (sedes?: string[] | null): Promise<Renumeracion> =>
  renumeracion("previo", sedes);

/** Escribe la renumeración: el plano, los espacios y los montajes, de una vez.
 *
 *  Después de esto el plano del servidor cambió, así que quien la llame TIENE
 *  que volver a sincronizar: el caché local todavía tiene los códigos viejos y
 *  cualquier edición posterior los volvería a subir, deshaciendo lo que se
 *  acaba de hacer. */
export const renumeracionAplicar = (sedes?: string[] | null): Promise<Renumeracion> =>
  renumeracion("aplicar", sedes);

/** Lo que el servidor manda cuando se niega a renumerar (409). Son dos casos y
 *  los dos son del PLANO, no del cálculo: un espacio comercial que ya ocupa el
 *  nombre destino y no se mueve, o dos muebles con el mismo código y un espacio
 *  colgando. En los dos casos NO se escribió nada. */
export interface RenumeracionBloqueada {
  code: "renumeracion_bloqueada" | "renumeracion_invariante";
  message: string;
  motivos?: string[];
  fallas?: string[];
}

/** El detalle estructurado de un rechazo de renumeración, o `null` si el error
 *  es otra cosa (red, sesión, 403…). `describeError` alcanza para el título;
 *  esto es para poder listar los motivos uno por uno. */
export function bloqueoDeRenumeracion(err: unknown): RenumeracionBloqueada | null {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  if (!detail || typeof detail !== "object") return null;
  const code = (detail as { code?: unknown }).code;
  if (code !== "renumeracion_bloqueada" && code !== "renumeracion_invariante") return null;
  const d = detail as RenumeracionBloqueada;
  return {
    code: d.code,
    message: String(d.message ?? ""),
    motivos: Array.isArray(d.motivos) ? d.motivos.map(String) : [],
    fallas: Array.isArray(d.fallas) ? d.fallas.map(String) : [],
  };
}


// ─── Los contratos que viven sólo en el JSON del layout ──────────────────────

/** Uno que se puede importar tal como está. */
export interface ContratoDelPlano {
  espacio: string;
  sede: string;
  code: string;
  proveedor: string;
  marca: string;
  desde: string;
  hasta: string;
  valor: number;
  observacion: string;
}

/** Uno que el plano da por vendido y que la base no puede aceptar. */
export interface ContratoIncompleto {
  espacio: string;
  sede: string;
  code: string;
  proveedor: string;
  desde: string;
  hasta: string;
  /** Dicho para que se pueda arreglar: «le falta el proveedor». */
  motivo: string;
  /** Lo que sí tiene, para poder juzgarlo sin abrir el plano. */
  marca: string;
  valor: number;
  /** No es un contrato a medias: es un «Ocupado» que alguien puso a mano en el
   *  plano cuando el selector todavía lo permitía. No hay nada que completarle
   *  y se va solo al guardar ese plano — el consejo es el contrario. */
  residuo: boolean;
}

export interface Importacion {
  importables: ContratoDelPlano[];
  incompletos: ContratoIncompleto[];
  ya_estaban: number;
  aplicado: boolean;
}

/**
 * Qué contratos hay en los planos que la base no tiene. **No escribe nada.**
 *
 * Es la mitad del desfase que el navegador NO puede calcular solo: la fusión
 * del store reemplaza lo comercial con lo que dice la base, así que un contrato
 * que sólo vive en el JSON desaparece antes de que ninguna pantalla lo mire.
 * Sólo se ve leyendo el snapshot crudo, que es lo que hace el servidor acá.
 *
 * Admin-only: lleva plata.
 */
export const revisarImportacion = (): Promise<Importacion> =>
  client.get<Importacion>("/layout/importacion/previo").then((r) => r.data);

/** Crear en la base los contratos que hoy sólo existen en el JSON.
 *  Idempotente: lo que ya tiene contrato vivo no se toca. */
export const aplicarImportacion = (): Promise<Importacion> =>
  client.post<Importacion>("/layout/importacion/aplicar").then((r) => r.data);
