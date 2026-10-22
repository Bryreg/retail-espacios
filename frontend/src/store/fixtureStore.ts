import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ReferenceRates, UnifiedFixture } from "../types/fixtures";
import { fusionarEstadoComercial } from "../utils/estadoComercial";
import type { EstadoPorEspacio } from "../utils/estadoComercial";
import type { SeasonWindows } from "../types/seasons";
import type { Vista3D } from "../utils/planta";
import {
  deleteLayout,
  fetchAllLayouts,
  fetchLayoutSettings,
  fetchReferenceRates,
  fetchRevisions,
  fetchSeasonWindows,
  saveLayout,
  saveLayoutSettings,
  saveReferenceRates,
  saveSeasonWindows,
} from "../api/layout";
// El renombre de una sede (fase 2 · I5) por el espacio de nombres, y no con
// una importación con nombre: las pruebas que cargan este store reemplazan
// `api/layout` por una lista fija de funciones (`probar-geometria`,
// `probar-nombres`), y una importación con nombre que esa lista no tiene
// rompería su compilación aunque nunca renombren nada.
import * as servidorDeSedes from "../api/layout";
import type { SedeRenombrada } from "../api/layout";
import { fetchEstadoComercial } from "../api/spaces";
import { useAuthStore } from "./authStore";
import { conFichaQuitada, sinComercial } from "../utils/guardadoDelPlano";

const MAX_UNDO = 50;

/** Debounce before a local edit is pushed. Batches dragging and typing. */
const SAVE_DEBOUNCE_MS = 1200;
/** How often an idle tab checks whether another workstation saved something. */
const POLL_INTERVAL_MS = 20_000;

// ─── Debounced server save ────────────────────────────────────────────────────
// One timer PER SEDE. A single shared timer used to cancel the pending save of
// sede A when the user switched to sede B within the debounce window, silently
// dropping A's edits.

const _saveTimers = new Map<string, ReturnType<typeof setTimeout>>();

function scheduleSave(sede: string) {
  const existing = _saveTimers.get(sede);
  if (existing) clearTimeout(existing);
  _saveTimers.set(
    sede,
    setTimeout(() => {
      _saveTimers.delete(sede);
      void useFixtureStore.getState().pushSede(sede);
    }, SAVE_DEBOUNCE_MS),
  );
}

function cancelScheduledSave(sede: string) {
  const existing = _saveTimers.get(sede);
  if (existing) {
    clearTimeout(existing);
    _saveTimers.delete(sede);
  }
}

// ─── Lo comercial vive en la base, no en el plano ─────────────────────────────
//
// Lo que viaja en el `PUT` es el plano sin lo comercial (`sinComercial`): los
// siete campos del contrato los manda la base y el servidor también los
// recorta al recibir. Vive en `utils/guardadoDelPlano.ts`, que es puro y no
// importa nada, para que una prueba lo ejecute (`probar-geometria`).

/**
 * ¿Los dos mapas comerciales dicen lo mismo?
 *
 * Hace falta aparte de la identidad de los planos por una razón concreta: un
 * contrato para un espacio que ningún plano dibuja NO se le pega a ningún
 * mueble, así que puede aparecer, cambiar o irse sin que se mueva un solo
 * arreglo de muebles. Comparando sólo los planos, el fantasma se dibujaría una
 * vez y después se quedaría congelado en la pantalla.
 */
function mismoMapa(a: EstadoPorEspacio, b: EstadoPorEspacio): boolean {
  if (a === b) return true;
  const claves = Object.keys(a);
  if (claves.length !== Object.keys(b).length) return false;
  for (const clave of claves) {
    const x = a[clave];
    const y = b[clave];
    if (!y) return false;
    if (x.status !== y.status || x.supplierName !== y.supplierName ||
        x.brandCategory !== y.brandCategory || x.negotiatedValue !== y.negotiatedValue ||
        x.startDate !== y.startDate || x.endDate !== y.endDate ||
        x.observation !== y.observation ||
        (x.reservaHasta ?? null) !== (y.reservaHasta ?? null) ||
        !!x.reservado !== !!y.reservado ||
        // Otro contrato en el mismo espacio con los mismos datos: sin esto
        // el mapa crudo se quedaría con el `leaseId` del que ya no está.
        (x.leaseId ?? null) !== (y.leaseId ?? null) ||
        (x.proximoLeaseId ?? null) !== (y.proximoLeaseId ?? null)) return false;
  }
  return true;
}

/**
 * Repintar TODAS las sedes con lo que la base dice que está vendido.
 *
 * Se hace sobre todas y no sólo sobre las que acaban de bajar: el estado
 * comercial cambia sin que cambie una sola revisión de plano, así que atarlo a
 * la adopción dejaría una venta hecha en otro equipo sin aparecer nunca.
 *
 * Devuelve el MISMO objeto cuando ninguna sede cambió — `fusionarEstadoComercial`
 * conserva la identidad de los arreglos que no toca, y acá se propaga: sin eso,
 * cada vuelta del poll redibujaría el plano entero y marcaría todo como
 * modificado.
 */
function fusionarTodo(
  fixturesBySede: Record<string, UnifiedFixture[]>,
  estado: EstadoPorEspacio,
): Record<string, UnifiedFixture[]> {
  let cambio = false;
  const salida: Record<string, UnifiedFixture[]> = {};
  for (const [sede, fixtures] of Object.entries(fixturesBySede)) {
    const fusionado = Array.isArray(fixtures)
      ? fusionarEstadoComercial(sede, fixtures, estado)
      : fixtures;
    if (fusionado !== fixtures) cambio = true;
    salida[sede] = fusionado;
  }
  return cambio ? salida : fixturesBySede;
}

// Pushes currently awaiting a server response, per sede. Cancelling the timer
// is not enough to stop a save: a PUT already in flight lands whenever it
// lands, and one that arrives after a DELETE re-creates the snapshot it was
// meant to replace. Deleting a sede waits on this first.
const _inFlight = new Map<string, Promise<void>>();

// Sedes deleted during this session, normalised. The shared sede list is one
// value replaced whole and is only ever unioned on pull, never trimmed, so any
// copy still holding a deleted name can put it back for everyone — permanently.
// These names are subtracted whenever a list from the server is adopted or
// merged. In memory only: a reload starts from a server list that no longer
// contains them.
const _removedSedes = new Set<string>();

// Las familias a las que en esta sesión se les QUITÓ el nombre propio. Los
// nombres viajan en el mismo valor que la lista de sedes, y el 409 los fusiona
// «los del servidor, y encima los míos»: sin esto, un nombre recién borrado acá
// volvía a aparecer desde la copia del servidor. Se restan al fusionar; una
// familia que vuelve a recibir nombre sale de la lista.
const _nombresQuitados = new Set<string>();

// Sedes added (or renamed into) during this session, normalised. The mirror of
// the set above, and needed for the same reason: when a settings write is
// rejected and the two lists have to be merged, "NAVE is in my list" is
// ambiguous on its own — it means either "I just added it" or "I have not seen
// that someone deleted it yet". Only names this session actually introduced may
// be re-added to the server's list; anything else the server dropped stays
// dropped.
const _addedSedes = new Set<string>();

/** Only an admin session may write; anything else would just collect 401/403s. */
function canWrite(): boolean {
  const { token, role } = useAuthStore.getState();
  return !!token && role === "admin";
}

function canRead(): boolean {
  return !!useAuthStore.getState().token;
}

function currentRole(): string | null {
  return useAuthStore.getState().role;
}

/** Sede names are identifiers: they key the server snapshot and prefix every
 *  space code ("SEDE-CODE"). Normalising here stops "Terron" and "TERRON" from
 *  becoming two separate rows that each workstation sees differently. */
export function normalizeSede(name: string): string {
  return name.trim().toUpperCase();
}

// ─── Settings (sede list + catalog labels) ────────────────────────────────────

let _settingsTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleSettingsSave() {
  if (_settingsTimer) clearTimeout(_settingsTimer);
  _settingsTimer = setTimeout(() => {
    _settingsTimer = null;
    void useFixtureStore.getState().pushSettings();
  }, SAVE_DEBOUNCE_MS);
}

// ─── Season windows (shared, same for every sede) ─────────────────────────────

let _seasonsTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleSeasonsSave() {
  if (_seasonsTimer) clearTimeout(_seasonsTimer);
  _seasonsTimer = setTimeout(() => {
    _seasonsTimer = null;
    void useFixtureStore.getState().pushSeasons();
  }, SAVE_DEBOUNCE_MS);
}

// ─── Reference rates (admin-only money) ───────────────────────────────────────

let _ratesTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleRatesSave() {
  if (_ratesTimer) clearTimeout(_ratesTimer);
  _ratesTimer = setTimeout(() => {
    _ratesTimer = null;
    void useFixtureStore.getState().pushRates();
  }, SAVE_DEBOUNCE_MS);
}

// ─── Camera state ─────────────────────────────────────────────────────────────

export interface Camera2D {
  panX: number;
  panY: number;
  zoom: number;
}

export interface Camera3D {
  posX: number;
  posY: number;
  posZ: number;
  targetX: number;
  targetY: number;
  targetZ: number;
}

const DEFAULT_CAMERA_2D: Camera2D = { panX: 80, panY: 80, zoom: 1 };
// Camera positioned north of the store (large +Z) looking toward scene center.
// This matches the 2D floor plan orientation: small Z = far (top), large Z = near (bottom).
// STORE_W=30, STORE_D=42 → north side at Z=50, center target at (15,0,21).
const DEFAULT_CAMERA_3D: Camera3D = {
  posX: 15,
  posY: 28,
  posZ: 50,
  targetX: 15,
  targetY: 0,
  targetZ: 21,
};

// ─── Store ────────────────────────────────────────────────────────────────────

// Antes esto era ["TERRON", "CENTRO", "NORTE", "SUR"] — nombres reales de
// sedes de Galerías Plaza, el primer cliente. Con multi-tenant cualquier
// cliente nuevo sin plano cargado heredaba "TERRON" como si fuera su propia
// sede: no es un leak de datos ajenos (cada cliente tiene su propia base),
// pero sí es marca de otro cliente asomando donde no corresponde. El default
// para un cliente sin plano es un nombre genérico, no una sede real.
export const DEFAULT_SEDES = ["SEDE 1"];

export type SyncState = "idle" | "pulling" | "pushing" | "error" | "conflict";

/**
 * Un guardado que el servidor RECHAZÓ por su propia regla.
 *
 * `error` de `SyncState` significa «no se pudo hablar con el servidor», y así
 * lo dibuja la pantalla: «Sin conexión», nube tachada. Esto es lo contrario —
 * hubo conexión, el servidor contestó, no escribió nada y explicó por qué—, y
 * mostrarlo como una caída de red le miente al usuario justo cuando el sistema
 * tenía algo útil que decirle. Por eso viaja aparte y entero: `message` es la
 * frase del servidor y `choques` son sus frases, ya escritas para leerse.
 */
/** Los 409 que son «el servidor miró y dijo que no», con su lista de motivos.
 *  Se enumeran para no confundirlos con los otros dos 409 del guardado —el
 *  conflicto entre equipos y la sede borrada—, que se resuelven de otra manera.
 *
 *  Los tres de las participaciones de cara (§4.4 del diseño): sacar de «por
 *  participación» una cara con participaciones vivas, pasar a participación un
 *  mueble con espacios internos vendidos, y vender un espacio interno en un
 *  mueble que se vende por participación. Sin ellos, el 409 se mostraba como
 *  una caída del guardado y no con la frase del servidor. */
const RECHAZOS_CONOCIDOS = new Set([
  "nombres_repetidos", "contratos_vivos", "partes_vendidas", "nombre_reservado",
  "participaciones_vivas", "slots_vendidos_en_participacion", "slots_en_participacion",
  // fase 2 · I5: un ancho, fondo, alto, módulo o entrepaños que no se pueden
  // dibujar (`medidas_imposibles` de `services/layout_lookup.py`).
  "medidas_imposibles",
]);

/** Entrar a Distribución desde otra pantalla (`pedirEnfoque3D`): sólo tipos
 *  y números, nada del store de edición (que no baja con el tablero). */
export interface PedidoDeDistribucion {
  /** El id del término a renovar: abre su formulario al entrar. */
  renovar?: number;
}

export interface RechazoDelServidor {
  /** El `detail.code` del 409, tal cual: `nombres_repetidos`, `contratos_vivos`,
   *  `partes_vendidas` (movería una puerta vendida), `nombre_reservado` (un
   *  nombre que se lee como el código de una parte) o los tres de las
   *  participaciones de cara (`participaciones_vivas`,
   *  `slots_vendidos_en_participacion`, `slots_en_participacion`). */
  code: string;
  message: string;
  choques: string[];
}

interface FixtureStore {
  /** Fixtures stored per-sede — each sede has its own independent floor plan. */
  fixturesBySede: Record<string, UnifiedFixture[]>;
  /** Ordered list of sede names. Users can rename or add sedes. */
  sedes: string[];
  sede: string;
  /** User-defined labels for catalog types (overrides the hardcoded defaults). */
  catalogLabels: Record<string, string>;
  /** Monthly reference rate per fixture type (tarifa de referencia).
   *  Admin-only money: `null` for workers, fetched fresh each session and kept
   *  OUT of localStorage so a shared machine never leaks it to the next login. */
  referenceRates: ReferenceRates | null;
  /** Sales window (days before/after the anchor) per commercial season.
   *  Shared across every sede — the seasons are the same in all three. */
  seasonWindows: SeasonWindows;
  camera2D: Camera2D;
  camera3D: Camera3D;
  /** Supervisar: si el plano muestra un punto sobre cada mueble con algo en
   *  «Para revisar» («aire y pines»). Arranca APAGADO —al abrir, el plano dice
   *  sólo cómo está cada mueble— y se recuerda como las cámaras, en ESTE
   *  navegador (`retail-fixtures-v1` en localStorage), no en la cuenta: es una
   *  preferencia de vista, no un dato. */
  pendientesEnElPlano: boolean;
  setPendientesEnElPlano: (v: boolean) => void;

  /** Pedido de abrir el Editor 3D encuadrando un espacio.
   *
   *  La pantalla de sede y el editor 3D son pestañas hermanas sin props entre
   *  ellas, así que el pedido viaja por acá. Se identifica por id de mueble y
   *  no por código: el código corto se repite entre sedes y a veces llega con
   *  el prefijo puesto y a veces no. `n` sube en cada pedido para que volver a
   *  tocar el mismo espacio vuelva a encuadrar.
   *
   *  `distribucion`: además de encuadrar, entra a Distribución en esa cara
   *  (Supervisar, «Renovar» de una participación desde Vender); con `renovar`
   *  (el id del término), abre su formulario de renovación. */
  enfoque3D: { fixtureId: string; cara: "A" | "B"; n: number; distribucion?: PedidoDeDistribucion } | null;

  /** Pedido de abrir Sede → Vender con un espacio (rediseño, PR 3: «Vender» del
   *  panel del Plano). Como `enfoque3D`: el Plano y la pantalla de sede son
   *  pestañas hermanas, el pedido viaja por acá (por id de mueble, no por
   *  código) y `Dashboard.tsx` cambia de pestaña. La pantalla de sede lo arma
   *  con su `negociar` —el mismo camino que el globo del mapa— y lo suelta
   *  (`soltarPedidoVender`), para que volver a esa pestaña no lo repita. No se
   *  persiste. */
  pedidoVender: { fixtureId: string; cara: "A" | "B"; n: number } | null;

  // ── Sync bookkeeping ────────────────────────────────────────────────────────
  /** Server revision (updated_at) last seen for each sede. */
  serverRev: Record<string, string>;
  /** Server revision last seen for the shared settings (sede list + labels).
   *  Echoed back on write so a stale copy is rejected instead of applied. */
  settingsRev: string | null;
  /** Sedes holding local edits the server has not acknowledged yet. */
  dirty: Record<string, boolean>;
  /** Sedes another workstation modified while we held unsaved edits. */
  conflicts: Record<string, string>;
  /** Lo que la BASE dice de cada espacio, crudo, tal como bajó. Es la fuente;
   *  lo que queda pegado a cada mueble es la copia derivada.
   *
   *  Se conserva porque hay una pregunta que la copia no puede contestar: un
   *  contrato para un espacio que NINGÚN plano dibuja no se le pega a nada, así
   *  que desaparece en la fusión. Es justo el fantasma que hay que encontrar.
   *
   *  Fuera de `partialize` a propósito: lleva plata, y esa clave sobrevive al
   *  logout. */
  estadoComercial: EstadoPorEspacio;
  /** Sedes cuyo último guardado el SERVIDOR RECHAZÓ por una regla suya —dos
   *  muebles llamados igual, o un espacio con contrato vivo que este guardado
   *  sacaría del plano—, con lo que el servidor contestó. No es un conflicto
   *  entre dos equipos ni una caída de red: el servidor contestó, no escribió
   *  nada, y dijo qué está mal. Se guarda aparte de `syncMessage` porque hay
   *  que poder mostrarlo entero y por sede, no en un tooltip. */
  rechazos: Record<string, RechazoDelServidor>;
  syncState: SyncState;
  syncMessage: string | null;
  lastSyncedAt: number | null;
  /** Role whose (possibly redacted) data is currently cached. A worker never
   *  receives negotiatedValue, so that cache must not be reused by an admin. */
  dataRole: string | null;
  /** El slug del cliente al que pertenece el caché de planos persistido.
   *  `null` hasta que una sesión lo reclame. Ver `scopeToCliente`. */
  clienteCache: string | null;
  /** La generación de los datos de ese cliente que este caché conoce
   *  (`GET /api/layout/settings`). Cambia cuando los datos se reemplazan
   *  enteros —el traspaso a la base principal—: mismo código, otros datos.
   *  Ver `syncFromServer`. */
  generacionCache: string | null;

  // Undo / redo (session-only — not persisted to localStorage)
  past: UnifiedFixture[][];
  future: UnifiedFixture[][];

  // Non-undoable init / migration (writes to current sede)
  setFixtures: (fixtures: UnifiedFixture[]) => void;

  /**
   * Switch the active sede.
   * Clears undo/redo history because the two floor plans are independent.
   */
  setSede: (sede: string) => void;
  /** Descarta el caché de planos si la sesión pertenece a OTRO cliente.
   *  Se llama al abrir sesión, antes de sincronizar. */
  scopeToCliente: (cliente: string | null) => void;

  /** Add a new sede to the list. */
  addSede: (name: string) => void;

  /** Renombrar una sede. Es del servidor (`POST /layout/{sede}/renombrar`):
   *  los códigos pasan al nombre nuevo y lo vendido sigue vivo. Resuelve
   *  `{ ok: false, error, motivos }` cuando no se pudo —el servidor se negó,
   *  o la sede tiene cambios que el servidor todavía no guardó—, y entonces
   *  no cambió nada, ni acá ni allá. Sin permiso de escritura, sólo acá. */
  renameSede: (oldName: string, newName: string) => Promise<{ ok: boolean; error?: string; motivos?: string[] }>;

  /** Remove a sede (clears its fixtures). The active sede is moved to the first available. */
  /** Delete a sede everywhere. Resolves `{ ok: false, error }` when the server
   *  refused, in which case NOTHING was removed locally either. */
  removeSede: (name: string) => Promise<{ ok: boolean; error?: string }>;

  /** El nombre propio de una familia de muebles (la clave es la de la
   *  biblioteca del 2D). Vacío lo quita y vuelve el de RECABRA. Sólo
   *  administración: se guarda con la lista de sedes. Cómo se lee en cada
   *  pantalla: `catalogo/nombresPropios.ts`. */
  setCatalogLabel: (type: string, label: string) => void;

  /** Set one reference rate. `sede === null` edits the general rate; a value
   *  of 0 (or less) clears the entry. Admin-only — no-ops otherwise. */
  setReferenceRate: (sede: string | null, type: string, value: number) => void;

  /** Adjust one season's sales window. Admin-only — no-ops otherwise. */
  setSeasonWindow: (id: string, before: number, after: number) => void;

  // Undoable mutation — use this for all user-initiated changes
  commit: (fixtures: UnifiedFixture[]) => void;

  undo: () => void;
  redo: () => void;

  // Camera persistence
  setCamera2D: (c: Partial<Camera2D>) => void;
  setCamera3D: (c: Partial<Camera3D>) => void;

  /** Pedir el 3D encuadrando este espacio. Lo consume StoreEditor3D. Con
   *  `distribucion`, entra además a Distribución en esa cara. */
  pedirEnfoque3D: (fixtureId: string, cara: "A" | "B", opciones?: { distribucion?: PedidoDeDistribucion }) => void;
  /** Pedir Sede → Vender con este espacio. Lo consume DashboardView. */
  pedirVender: (fixtureId: string, cara: "A" | "B") => void;
  soltarPedidoVender: () => void;
  /** Guardar la cámara actual como la vista de este espacio. */
  guardarVista3D: (fixtureId: string, cara: "A" | "B", vista: Vista3D) => void;
  /** Olvidar la vista guardada: se vuelve al encuadre calculado. */
  borrarVista3D: (fixtureId: string, cara: "A" | "B") => void;

  // ── Sync actions ────────────────────────────────────────────────────────────
  /** Pull every sede from the server and adopt whatever changed. */
  syncFromServer: () => Promise<void>;
  /** Volver a leer de la base qué está vendido y repintarlo en TODAS las sedes.
   *  Lo comercial ya no viaja en el layout, así que cambia sin que cambie una
   *  sola revisión de plano: vender, cancelar o subir una planilla lo mueve. */
  refrescarComercial: () => Promise<void>;
  /** Push one sede now, bypassing the debounce. */
  pushSede: (sede: string, opts?: { force?: boolean }) => Promise<void>;
  /** Push the shared sede list / catalog labels. */
  pushSettings: () => Promise<void>;
  /** Push the reference rates (admin-only endpoint). */
  pushRates: () => Promise<void>;
  /** Push the season windows (admin-only endpoint). */
  pushSeasons: () => Promise<void>;
  /** Fetch the rates once (e.g. when the tariff editor opens and the initial
   *  sync hasn't landed yet). Never clobbers an edit waiting in the debounce. */
  loadRates: () => Promise<void>;
  /** Flush every pending debounced save immediately. */
  flushPending: () => Promise<void>;
  /** Cheap revision check; pulls only when something actually moved. */
  pollForChanges: () => Promise<void>;
  /** Resolve a conflict by keeping either the server copy or ours. */
  resolveConflict: (sede: string, keep: "server" | "mine") => Promise<void>;
  /** Begin background sync (poll + refocus). Idempotent. */
  startAutoSync: () => void;
  /** Stop background sync. */
  stopAutoSync: () => void;
}

// ─── Selector ─────────────────────────────────────────────────────────────────

/** Stable empty array — avoids creating a new reference on every selector call. */
const EMPTY_FIXTURES: UnifiedFixture[] = [];

/** Returns the fixtures for the currently active sede. */
export const selectFixtures = (state: FixtureStore): UnifiedFixture[] =>
  state.fixturesBySede[state.sede] ?? EMPTY_FIXTURES;

/** True when some sede still holds edits the server has not acknowledged. */
export const selectHasPendingWork = (state: FixtureStore): boolean =>
  Object.values(state.dirty).some(Boolean);

// ─── Store implementation ─────────────────────────────────────────────────────

/** Los planos de este navegador, en blanco: lo que se descarta cuando el caché
 *  es de OTROS datos — otro cliente (`scopeToCliente`) o el mismo cliente con
 *  sus datos reemplazados (la generación, en `syncFromServer`). El servidor
 *  repuebla lo que de verdad corresponde. */
function planosVacios(): Partial<FixtureStore> {
  // Los nombres quitados eran de esos datos: con los de otro supermercado, una
  // familia que acá se dejó sin nombre no tiene por qué perder el suyo allá.
  _nombresQuitados.clear();
  return {
    fixturesBySede: {},
    sedes: DEFAULT_SEDES,
    sede: DEFAULT_SEDES[0],
    catalogLabels: {},
    seasonWindows: {},
    serverRev: {},
    settingsRev: null,
    dirty: {},
    conflicts: {},
    estadoComercial: {},
    rechazos: {},
    past: [],
    future: [],
  };
}

/**
 * El store con la sede `oldName` pasada a `newName` (fase 2 · I5). Con `hecho`
 * —lo que contestó el servidor al renombrar—, el plano es el SUYO (con los
 * códigos y la sede de cada mueble ya mudados allá) y su revisión y la de la
 * lista son las nuevas: no hay nada que volver a subir. Sin `hecho` (una
 * sesión que no escribe), el plano local con el campo `sede` de cada mueble
 * mudado, como siempre.
 *
 * El deshacer de la sede renombrada se vacía: sus pasos tienen los códigos
 * viejos, y deshacer uno los volvería a subir.
 */
function sedeMudada(
  state: FixtureStore,
  oldName: string,
  newName: string,
  hecho: SedeRenombrada | null,
): Partial<FixtureStore> {
  const esLaVieja = (s: string) => s === oldName || normalizeSede(s) === normalizeSede(oldName);
  const fixturesBySede = { ...state.fixturesBySede };
  const dirty = { ...state.dirty };
  const serverRev = { ...state.serverRev };
  const conflicts = { ...state.conflicts };
  const rechazos = { ...state.rechazos };
  const locales = fixturesBySede[oldName];
  for (const clave of Object.keys(fixturesBySede)) if (esLaVieja(clave)) delete fixturesBySede[clave];
  for (const mapa of [dirty, serverRev, conflicts, rechazos] as Record<string, unknown>[]) {
    for (const clave of Object.keys(mapa)) if (esLaVieja(clave)) delete mapa[clave];
  }
  if (hecho) {
    fixturesBySede[newName] = fusionarEstadoComercial(newName, hecho.fixtures ?? [], state.estadoComercial);
    // Sin revisión (una sede que estaba sólo en la lista, sin plano), el
    // próximo guardado es el primero: va sin base.
    if (hecho.updated_at) serverRev[newName] = hecho.updated_at;
    else delete serverRev[newName];
  } else if (locales) {
    // Cada mueble lleva también su sede, y con ella se arma el código
    // «SEDE-CODIGO» de contratos y archivos.
    fixturesBySede[newName] = locales.map((f) => (f.sede && esLaVieja(f.sede) ? { ...f, sede: newName } : f));
  }
  const sedes: string[] = [];
  for (const s of state.sedes) {
    const nombre = esLaVieja(s) ? newName : s;
    if (!sedes.includes(nombre)) sedes.push(nombre);
  }
  if (!sedes.includes(newName)) sedes.push(newName);
  const activa = esLaVieja(state.sede);
  let referenceRates = state.referenceRates;
  const viejaEnTarifas = referenceRates ? Object.keys(referenceRates.by_sede ?? {}).find(esLaVieja) : undefined;
  if (referenceRates && viejaEnTarifas) {
    const { [viejaEnTarifas]: suyas, ...resto } = referenceRates.by_sede;
    referenceRates = { ...referenceRates, by_sede: { ...resto, [newName]: suyas } };
  }
  const conflictos = Object.keys(conflicts).length;
  return {
    sedes,
    fixturesBySede,
    dirty,
    serverRev,
    conflicts,
    rechazos,
    referenceRates,
    sede: activa ? newName : state.sede,
    ...(activa ? { past: [], future: [] } : {}),
    ...(hecho ? {
      settingsRev: hecho.settings_updated_at ?? state.settingsRev,
      syncState: conflictos ? "conflict" as const : "idle" as const,
      syncMessage: conflictos ? state.syncMessage : null,
      lastSyncedAt: Date.now(),
    } : {}),
  };
}

export const useFixtureStore = create<FixtureStore>()(
  persist(
    (set, get) => ({
      fixturesBySede: {},
      sedes: DEFAULT_SEDES,
      sede: DEFAULT_SEDES[0],
      catalogLabels: {},
      referenceRates: null,
      seasonWindows: {},
      camera2D: DEFAULT_CAMERA_2D,
      camera3D: DEFAULT_CAMERA_3D,
      pendientesEnElPlano: false,
      enfoque3D: null,
      pedidoVender: null,
      serverRev: {},
      settingsRev: null,
      dirty: {},
      conflicts: {},
      estadoComercial: {},
      rechazos: {},
      syncState: "idle",
      syncMessage: null,
      lastSyncedAt: null,
      dataRole: null,
      clienteCache: null,
      generacionCache: null,
      past: [],
      future: [],

      // ── Non-undoable ──────────────────────────────────────────────────────
      setFixtures: (fixtures) =>
        set((state) => ({
          fixturesBySede: { ...state.fixturesBySede, [state.sede]: fixtures },
        })),

      scopeToCliente: (cliente) => {
        if (get().clienteCache === cliente) return;
        // Cambió el cliente de la sesión (o es la primera vez con este caché):
        // los planos que hay en localStorage son de OTRO inquilino. Se
        // descartan ANTES de cualquier sync. Si no, no sólo se verían los
        // planos ajenos: el bootstrap de `syncFromServer` los SUBIRÍA a la
        // base del cliente nuevo (contaminación entre inquilinos). El servidor
        // repuebla lo que de verdad le corresponde a este cliente. El dinero
        // ya salía fuera de `partialize`; esto hace lo propio con los planos,
        // que en un mundo multi-cliente no pueden sobrevivir a un cambio de
        // inquilino en la misma máquina.
        set({
          ...planosVacios(),
          clienteCache: cliente,
          generacionCache: null,
          referenceRates: null,
          syncState: "idle",
          syncMessage: null,
        });
      },

      setSede: (sede) =>
        // Clear undo/redo when switching sedes — each floor plan is independent
        set({ sede, past: [], future: [] }),

      addSede: (rawName) =>
        set((state) => {
          const name = normalizeSede(rawName);
          if (!name || state.sedes.includes(name)) return state;
          _addedSedes.add(name);
          _removedSedes.delete(name);
          scheduleSettingsSave();
          return { sedes: [...state.sedes, name] };
        }),

      // ── Renombrar una sede (fase 2 · I5) ──────────────────────────────────
      //
      // Era «borrar + crear»: mover la clave local y mandar `deleteLayout` del
      // nombre viejo, y el plano subía como el primer guardado de una sede
      // nueva. El borrado archiva la sede en el servidor —cierra los contratos,
      // cancela las reservas de participación, archiva los montajes— y las
      // tarifas de la sede quedaban huérfanas. Ahora el renombre es del
      // servidor (`renombrarSede`, una transacción) y acá sólo se adopta lo que
      // contesta. Antes de pedirlo: nada pendiente de la sede vieja puede
      // llegar DESPUÉS (un guardado en vuelo con el nombre viejo daría 409
      // `layout_deleted` y se perdería), así que se cancela lo programado, se
      // espera lo que está en vuelo y se sube lo sucio.
      renameSede: async (oldName, rawNewName) => {
        const newName = normalizeSede(rawNewName);
        if (!newName || newName === oldName) return { ok: true };
        const yaExiste = (st: FixtureStore) =>
          [...st.sedes, ...Object.keys(st.fixturesBySede)]
            .some((s) => s !== oldName && normalizeSede(s) === newName);
        if (yaExiste(get())) return { ok: false, error: `Ya hay una sede «${newName}»: elegí otro nombre.` };

        // Sin permiso de escritura no hay servidor que renombre: sólo acá,
        // como siempre (el `PUT` de la lista tampoco sale).
        if (!canWrite()) {
          set((state) => sedeMudada(state, oldName, newName, null));
          return { ok: true };
        }

        cancelScheduledSave(oldName);
        const flight = _inFlight.get(oldName);
        if (flight) await flight.catch(() => {});
        if (get().dirty[oldName]) await get().pushSede(oldName);
        {
          const st = get();
          if (st.dirty[oldName] || st.conflicts[oldName] || st.rechazos[oldName]) {
            return {
              ok: false,
              error: `«${oldName}» tiene cambios que el servidor todavía no guardó: resolvelos antes de renombrar.`,
            };
          }
        }
        // La lista de sedes también: el servidor la cambia en el renombre, y una
        // copia en cola sin el nombre nuevo lo pisaría después.
        if (_settingsTimer) {
          clearTimeout(_settingsTimer);
          _settingsTimer = null;
          await get().pushSettings();
        }

        let hecho: SedeRenombrada;
        try {
          hecho = await servidorDeSedes.renombrarSede(oldName, newName, get().serverRev[oldName] ?? null);
        } catch (err: any) {
          const status = err?.response?.status;
          const rechazo = servidorDeSedes.rechazoDelRenombre(err);
          const error =
            status === 401 || status === 403
              ? `No tenés permiso para renombrar «${oldName}».`
              : rechazo?.message || `No se pudo renombrar «${oldName}» en el servidor. Sigue con el nombre de antes.`;
          return { ok: false, error, motivos: rechazo?.motivos ?? [] };
        }

        // El servidor ya renombró. El nombre viejo se recuerda como borrado y
        // el nuevo como agregado, para que una lista vieja de otro equipo no
        // devuelva el viejo al fusionar.
        _addedSedes.add(newName);
        _removedSedes.delete(newName);
        _removedSedes.add(normalizeSede(oldName));
        _addedSedes.delete(normalizeSede(oldName));
        set((state) => sedeMudada(state, oldName, newName, hecho));
        // Los códigos de la sede cambiaron en la base: lo comercial se vuelve a
        // leer con los nombres nuevos (y los muebles de otros planos que decían
        // la sede vieja llegan con la próxima vuelta del poll).
        void get().refrescarComercial();
        return { ok: true };
      },

      removeSede: async (name) => {
        const target = normalizeSede(name);
        const state = get();
        // Match case-insensitively. The sede bar can leave the active sede in
        // whatever casing the user typed while the shared list holds the
        // normalised name, and an exact filter would then delete the fixtures
        // but leave the name listed — a phantom sede nobody can remove, since
        // the sede list is only ever unioned on pull, never trimmed.
        const keys = new Set<string>();
        for (const s of state.sedes) if (normalizeSede(s) === target) keys.add(s);
        for (const s of Object.keys(state.fixturesBySede)) {
          if (normalizeSede(s) === target) keys.add(s);
        }
        if (keys.size === 0) return { ok: true };

        // Stop anything that would re-create the snapshot behind our back, and
        // let an already-issued PUT land BEFORE the DELETE: cancelling the
        // timer cannot recall a request that is already in flight, and one
        // arriving after the DELETE would upsert the sede straight back.
        for (const key of keys) {
          cancelScheduledSave(key);
          const flight = _inFlight.get(key);
          if (flight) await flight.catch(() => {});
        }

        // The server decides. A fire-and-forget DELETE that failed used to
        // leave the sede alive for everyone else while this screen showed it
        // gone — and the next pull re-adopted it and re-published the name, so
        // the sede came back ~20s later with no error shown anywhere. The
        // dialog promises "no se puede deshacer"; that has to be true before
        // anything local is touched.
        if (canWrite()) {
          try {
            for (const key of keys) await deleteLayout(key);
          } catch (err: any) {
            const status = err?.response?.status;
            const error =
              status === 401 || status === 403
                ? `No tenés permiso para eliminar «${target}».`
                : `No se pudo eliminar «${target}» en el servidor. Sigue disponible para los demás equipos.`;
            set({ syncState: "error", syncMessage: error });
            return { ok: false, error };
          }
        }

        // The server has confirmed. Remember the name so a settings list from
        // another workstation — or a queued push holding the old list — cannot
        // reinstate it before everyone has converged.
        _removedSedes.add(target);
        _addedSedes.delete(target);

        set((state) => {
          const fixturesBySede = { ...state.fixturesBySede };
          const dirty = { ...state.dirty };
          const serverRev = { ...state.serverRev };
          // A leftover conflict entry keeps the sync indicator stuck on
          // "Conflicto" forever, and its "Conservar la mía" button calls
          // pushSede(force) on a sede whose fixtures are gone — writing an
          // empty layout that resurrects the row we just deleted.
          const conflicts = { ...state.conflicts };
          // Lo mismo con el rechazo del servidor: es de una sede que ya no existe.
          const rechazos = { ...state.rechazos };
          for (const key of keys) {
            delete fixturesBySede[key];
            delete dirty[key];
            delete serverRev[key];
            delete conflicts[key];
            delete rechazos[key];
          }
          const remaining = state.sedes.filter((s) => !keys.has(s));
          const sedes = remaining.length > 0 ? remaining : [DEFAULT_SEDES[0]];
          const sede = keys.has(state.sede) || normalizeSede(state.sede) === target
            ? sedes[0]
            : state.sede;
          const conflictCount = Object.keys(conflicts).length;
          return {
            sedes,
            fixturesBySede,
            serverRev,
            dirty,
            conflicts,
            rechazos,
            sede,
            past: [],
            future: [],
            syncState: conflictCount ? "conflict" : "idle",
            syncMessage: conflictCount ? state.syncMessage : null,
          };
        });
        scheduleSettingsSave();
        return { ok: true };
      },

      setCatalogLabel: (type, label) =>
        set((state) => {
          // Lo escribe administración, como las sedes: un trabajador no lo
          // puede guardar (el PUT exige admin) y no tiene por qué verlo
          // cambiar en su pantalla como si se hubiera guardado.
          if (!canWrite()) return state;
          const next = { ...state.catalogLabels };
          if (label.trim()) {
            next[type] = label.trim();
            _nombresQuitados.delete(type);
          } else {
            delete next[type];
            _nombresQuitados.add(type);
          }
          scheduleSettingsSave();
          return { catalogLabels: next };
        }),

      setSeasonWindow: (id, before, after) =>
        set((state) => {
          if (!canWrite()) return state;
          const clean = (n: number) => Math.max(0, Math.min(180, Math.round(n) || 0));
          scheduleSeasonsSave();
          return {
            seasonWindows: {
              ...state.seasonWindows,
              [id]: { before: clean(before), after: clean(after) },
            },
          };
        }),

      setReferenceRate: (sedeOrNull, type, value) =>
        set((state) => {
          if (!canWrite()) return state;
          const rates: ReferenceRates = state.referenceRates ?? { default: {}, by_sede: {} };
          const next: ReferenceRates = {
            default: { ...rates.default },
            by_sede: { ...rates.by_sede },
          };
          if (sedeOrNull === null) {
            if (value > 0) next.default[type] = value;
            else delete next.default[type];
          } else {
            const sede = normalizeSede(sedeOrNull);
            const forSede = { ...(next.by_sede[sede] ?? {}) };
            if (value > 0) forSede[type] = value;
            else delete forSede[type];
            if (Object.keys(forSede).length > 0) next.by_sede[sede] = forSede;
            else delete next.by_sede[sede];
          }
          scheduleRatesSave();
          return { referenceRates: next };
        }),

      // ── Undoable mutation ─────────────────────────────────────────────────
      commit: (nextFixtures) =>
        set((state) => {
          scheduleSave(state.sede);
          return {
            fixturesBySede: {
              ...state.fixturesBySede,
              [state.sede]: nextFixtures,
            },
            dirty: { ...state.dirty, [state.sede]: true },
            past: [
              ...state.past.slice(-(MAX_UNDO - 1)),
              state.fixturesBySede[state.sede] ?? [],
            ],
            future: [],
          };
        }),

      // Deshacer y rehacer reponen el plano de antes TAL CUAL, salvo la
      // ficha del mueble que se va: una clave que el plano repuesto no tiene
      // y el de ahora sí vuelve en `null`. Ausente, el servidor la rellenaba
      // con la guardada y el deshacer de «Entrepaños» o «Módulo» no se
      // guardaba nunca (ver `conFichaQuitada`).
      undo: () =>
        set((state) => {
          if (state.past.length === 0) return state;
          const current = state.fixturesBySede[state.sede] ?? [];
          const prev = conFichaQuitada(state.past[state.past.length - 1], current);
          scheduleSave(state.sede);
          return {
            fixturesBySede: { ...state.fixturesBySede, [state.sede]: prev },
            dirty: { ...state.dirty, [state.sede]: true },
            past: state.past.slice(0, -1),
            future: [current, ...state.future.slice(0, MAX_UNDO - 1)],
          };
        }),

      redo: () =>
        set((state) => {
          if (state.future.length === 0) return state;
          const current = state.fixturesBySede[state.sede] ?? [];
          const next = conFichaQuitada(state.future[0], current);
          scheduleSave(state.sede);
          return {
            fixturesBySede: { ...state.fixturesBySede, [state.sede]: next },
            dirty: { ...state.dirty, [state.sede]: true },
            past: [...state.past.slice(-(MAX_UNDO - 1)), current],
            future: state.future.slice(1),
          };
        }),

      // ── Camera ────────────────────────────────────────────────────────────
      setCamera2D: (c) =>
        set((state) => ({ camera2D: { ...state.camera2D, ...c } })),
      setCamera3D: (c) =>
        set((state) => ({ camera3D: { ...state.camera3D, ...c } })),
      setPendientesEnElPlano: (v) => set({ pendientesEnElPlano: v }),

      pedirEnfoque3D: (fixtureId, cara, opciones) =>
        set((state) => ({
          enfoque3D: {
            fixtureId, cara, n: (state.enfoque3D?.n ?? 0) + 1,
            ...(opciones?.distribucion ? { distribucion: { ...opciones.distribucion } } : {}),
          },
        })),

      pedirVender: (fixtureId, cara) =>
        set((state) => ({ pedidoVender: { fixtureId, cara, n: (state.pedidoVender?.n ?? 0) + 1 } })),
      soltarPedidoVender: () => set({ pedidoVender: null }),

      // Guardar y borrar escriben el layout y lo mandan al servidor, pero NO
      // entran al historial: que Ctrl+Z deshaga un encuadre de cámara mezcla
      // dos cosas que no tienen nada que ver.
      guardarVista3D: (fixtureId, cara, vista) =>
        set((state) => {
          const sede = state.sede;
          const actuales = state.fixturesBySede[sede] ?? [];
          if (!actuales.some((f) => f.id === fixtureId)) return {};
          const siguientes = actuales.map((f) =>
            f.id === fixtureId
              ? { ...f, vista3D: { ...(f.vista3D ?? {}), [cara]: vista } }
              : f,
          );
          scheduleSave(sede);
          return {
            fixturesBySede: { ...state.fixturesBySede, [sede]: siguientes },
            dirty: { ...state.dirty, [sede]: true },
          };
        }),

      borrarVista3D: (fixtureId, cara) =>
        set((state) => {
          const sede = state.sede;
          const actuales = state.fixturesBySede[sede] ?? [];
          const objetivo = actuales.find((f) => f.id === fixtureId);
          if (!objetivo?.vista3D?.[cara]) return {};
          const siguientes = actuales.map((f) => {
            if (f.id !== fixtureId) return f;
            const { [cara]: _fuera, ...resto } = f.vista3D ?? {};
            return { ...f, vista3D: Object.keys(resto).length ? resto : undefined };
          });
          scheduleSave(sede);
          return {
            fixturesBySede: { ...state.fixturesBySede, [sede]: siguientes },
            dirty: { ...state.dirty, [sede]: true },
          };
        }),

      // ── Push one sede ─────────────────────────────────────────────────────
      pushSede: async (sede, opts) => {
        if (!canWrite()) return;
        cancelScheduledSave(sede);
        const state = get();
        // Never re-create a sede the store no longer knows. It was deleted —
        // here or from another workstation — and a stray push (a queued
        // flushPending, a bootstrap, a conflict resolution) would upsert the
        // whole snapshot back and undo the deletion for everyone.
        const stillKnown = (st: FixtureStore) =>
          st.sedes.includes(sede) ||
          Object.prototype.hasOwnProperty.call(st.fixturesBySede, sede);
        if (!stillKnown(state)) return;
        // A sede awaiting conflict resolution would just 409 again on every
        // poll; only an explicit resolution (force) may push it.
        if (state.conflicts[sede] && !opts?.force) return;
        const fixtures = state.fixturesBySede[sede] ?? [];
        // `force` resolves a conflict in our favour: overwrite whatever is there.
        const base = opts?.force ? null : (state.serverRev[sede] ?? null);

        set({ syncState: "pushing", syncMessage: null });
        const run = (async () => {
        try {
          // Geometría y nada más. Lo comercial es de la base: el servidor lo
          // recorta al recibir, y esto lo recorta al mandar — así el JSON que
          // se guarda no vuelve a tener una segunda copia del contrato ni por
          // un guardado que quedó en cola desde antes del corte.
          //
          // La ficha del mueble (`CLAVES_DE_FICHA`) viaja como está, `null`
          // incluido: `null` es «la borré a propósito» y el servidor la saca;
          // una clave ausente, en cambio, la rellena con la guardada (así no
          // la borra una pestaña de antes que no la conoce).
          const saved = await saveLayout(sede, sinComercial(fixtures), base);
          // The sede may have been deleted while this request was in flight.
          // Writing serverRev/dirty back would leave bookkeeping for a sede
          // that is gone, and the next pull would read it as live again.
          if (!stillKnown(get())) return;
          set((s) => {
            const dirty = { ...s.dirty };
            const conflicts = { ...s.conflicts };
            const rechazos = { ...s.rechazos };
            delete conflicts[sede];
            // El servidor aceptó: si esta sede venía rechazada, el nombre ya se
            // corrigió y el aviso deja de tener sentido.
            delete rechazos[sede];
            // Another edit landed while the request was in flight — stay dirty
            // so the follow-up save still happens.
            if (s.fixturesBySede[sede] === fixtures) delete dirty[sede];
            return {
              dirty,
              conflicts,
              rechazos,
              serverRev: { ...s.serverRev, [sede]: saved.updated_at ?? "" },
              syncState: Object.keys(conflicts).length ? "conflict" : "idle",
              syncMessage: null,
              lastSyncedAt: Date.now(),
            };
          });
        } catch (err: any) {
          const status = err?.response?.status;
          if (status === 409) {
            const detail = err.response?.data?.detail;
            if (typeof detail === "object" && detail?.code === "layout_deleted") {
              // Someone deleted this sede while we held unsaved edits. Raising
              // a conflict here would offer "Conservar la mía", and taking it
              // would push our copy back and undo their deletion. Accept it.
              cancelScheduledSave(sede);
              set((s) => {
                const fixturesBySede = { ...s.fixturesBySede };
                const dirty = { ...s.dirty };
                const serverRev = { ...s.serverRev };
                const conflicts = { ...s.conflicts };
                const rechazos = { ...s.rechazos };
                delete fixturesBySede[sede];
                delete dirty[sede];
                delete serverRev[sede];
                delete conflicts[sede];
                delete rechazos[sede];
                const sedes = s.sedes.filter((x) => x !== sede);
                return {
                  fixturesBySede,
                  dirty,
                  serverRev,
                  conflicts,
                  rechazos,
                  sedes: sedes.length > 0 ? sedes : s.sedes,
                  sede: s.sede === sede ? (sedes[0] ?? s.sede) : s.sede,
                  syncState: Object.keys(conflicts).length ? "conflict" : "idle",
                  syncMessage: `«${sede}» fue eliminada desde otro equipo.`,
                };
              });
              return;
            }
            // Los guardarraíles del servidor: este guardado dejaría dos muebles
            // llamados igual, o sacaría del plano un espacio con contrato vivo.
            // NO es un conflicto entre dos equipos —ofrecer «Conservar la mía»
            // sería un lazo, porque forzar vuelve a pasar por la misma
            // comprobación y vuelve a fallar—: es algo que hay que arreglar en
            // el plano, o un contrato que hay que cancelar. Se dice cuál, con
            // las frases que manda el servidor, y el guardado queda pendiente:
            // en cuanto se arregle, el reintento entra solo.
            if (typeof detail === "object" && RECHAZOS_CONOCIDOS.has(detail?.code)) {
              const choques: string[] = (Array.isArray(detail?.choques) ? detail.choques : [])
                .map((x: unknown) => String(x))
                .filter(Boolean);
              const message = String(
                detail?.message ?? `El servidor no guardó «${sede}».`,
              );
              set((s) => ({
                rechazos: {
                  ...s.rechazos,
                  [sede]: { code: String(detail.code), message, choques },
                },
                // `error` es «no se pudo hablar con el servidor» y se dibuja
                // «Sin conexión»: acá hubo conexión y hubo respuesta, así que el
                // estado no puede ser ése. El rechazo se muestra desde
                // `rechazos`, que sobrevive a los pulls que vengan después.
                syncState: Object.keys(s.conflicts).length ? "conflict" : "idle",
                syncMessage: [message, ...choques].join(" "),
              }));
              return;
            }
            const message =
              (typeof detail === "object" && detail?.message) ||
              `Otro equipo modificó «${sede}» mientras editabas.`;
            set((s) => ({
              conflicts: { ...s.conflicts, [sede]: message },
              syncState: "conflict",
              syncMessage: message,
            }));
            return;
          }
          if (status === 401 || status === 403) {
            // Session expired or read-only role — nothing to retry, but the
            // indicator must not stay stuck on "Guardando…".
            set({ syncState: "idle", syncMessage: null });
            return;
          }
          console.warn(`[layout sync] no se pudo guardar «${sede}»:`, err);
          set({
            syncState: "error",
            syncMessage: "No se pudo guardar en el servidor. Se reintentará.",
          });
        }
        })();
        // Published before the await so a concurrent removeSede can wait for
        // this request instead of racing it.
        _inFlight.set(sede, run);
        try {
          await run;
        } finally {
          if (_inFlight.get(sede) === run) _inFlight.delete(sede);
        }
      },

      // ── Push shared settings ──────────────────────────────────────────────
      pushSettings: async () => {
        if (!canWrite()) return;
        const { sedes, catalogLabels, settingsRev } = get();
        try {
          const saved = await saveLayoutSettings(sedes, catalogLabels, settingsRev);
          set({ settingsRev: saved.updated_at ?? null });
        } catch (err: any) {
          const status = err?.response?.status;
          if (status === 401 || status === 403) return;
          if (status === 409) {
            // Someone else changed the shared list while we held an older copy.
            // Retrying with ours would undo their change; adopting theirs would
            // undo ours. Merge, then write once against their revision.
            try {
              const fresh = await fetchLayoutSettings();
              const local = get();
              // Their list is the base — minus anything deleted here, which is
              // the one direction a merge cannot infer from the lists alone.
              const merged = fresh.sedes.filter(
                (name) => !_removedSedes.has(normalizeSede(name)),
              );
              // Only names this session introduced. Re-adding every local name
              // would reinstate a sede another workstation deleted while this
              // one still listed it — the exact overwrite this merge exists to
              // prevent, just arriving from the other side.
              for (const name of local.sedes) {
                const key = normalizeSede(name);
                if (_removedSedes.has(key) || !_addedSedes.has(key)) continue;
                if (!merged.includes(name)) merged.push(name);
              }
              // Labels are display names: last writer wins per key, and ours is
              // the edit that just happened.
              const labels = { ...fresh.catalog_labels, ...local.catalogLabels };
              // Menos los que se quitaron acá: «los suyos y encima los míos»
              // no sabe que un nombre ausente en los míos es uno borrado.
              for (const quitado of _nombresQuitados) delete labels[quitado];
              const saved = await saveLayoutSettings(
                merged, labels, fresh.updated_at ?? null,
              );
              set({
                sedes: merged,
                catalogLabels: labels,
                settingsRev: saved.updated_at ?? null,
                syncState: Object.keys(get().conflicts).length ? "conflict" : "idle",
                syncMessage: null,
              });
              return;
            } catch (retryErr) {
              console.warn("[layout sync] no se pudo fusionar la lista de sedes:", retryErr);
              set({
                syncState: "error",
                syncMessage:
                  "Otro equipo cambió la lista de sedes. Actualizá para ver la versión del servidor.",
              });
              return;
            }
          }
          console.warn("[layout sync] no se pudieron guardar las sedes:", err);
          // Same rule as pushSede: a failure the user cannot see is a failure
          // they will discover as missing data on the other workstation.
          set({
            syncState: "error",
            syncMessage: "No se pudo guardar la lista de sedes en el servidor.",
          });
        }
      },

      pushRates: async () => {
        if (!canWrite()) return;
        const rates = get().referenceRates;
        if (!rates) return;
        try {
          // Adopt the server's normalised copy (sede keys uppercased, zeros
          // dropped) so what this tab shows is exactly what everyone else pulls.
          const saved = await saveReferenceRates(rates);
          set((s) => (s.referenceRates === rates ? { referenceRates: saved } : s));
        } catch (err: any) {
          const status = err?.response?.status;
          if (status === 401 || status === 403) return;
          console.warn("[layout sync] no se pudieron guardar las tarifas:", err);
          set({
            syncState: "error",
            syncMessage: "No se pudieron guardar las tarifas de referencia.",
          });
        }
      },

      pushSeasons: async () => {
        if (!canWrite()) return;
        try {
          await saveSeasonWindows(get().seasonWindows);
        } catch (err: any) {
          const status = err?.response?.status;
          if (status === 401 || status === 403) return;
          console.warn("[layout sync] no se pudieron guardar las temporadas:", err);
          set({
            syncState: "error",
            syncMessage: "No se pudieron guardar las temporadas.",
          });
        }
      },

      loadRates: async () => {
        if (!canWrite()) return;
        if (_ratesTimer) return;
        try {
          const rates = await fetchReferenceRates();
          // Re-check after the await: an edit made while the request was in
          // flight owns the truth until its push resolves.
          if (!_ratesTimer) {
            set({ referenceRates: { default: rates.default, by_sede: rates.by_sede } });
          }
        } catch {
          /* keep whatever we hold; the next syncFromServer retries */
        }
      },

      flushPending: async () => {
        const pending = Object.keys(get().dirty).filter((s) => get().dirty[s]);
        if (_settingsTimer) {
          clearTimeout(_settingsTimer);
          _settingsTimer = null;
          await get().pushSettings();
        }
        if (_ratesTimer) {
          clearTimeout(_ratesTimer);
          _ratesTimer = null;
          await get().pushRates();
        }
        if (_seasonsTimer) {
          clearTimeout(_seasonsTimer);
          _seasonsTimer = null;
          await get().pushSeasons();
        }
        await Promise.all(pending.map((sede) => get().pushSede(sede)));
      },

      // ── Pull everything ───────────────────────────────────────────────────
      syncFromServer: async () => {
        if (!canRead()) return;
        set({ syncState: "pulling" });
        const role = currentRole();
        // A worker's copy has negotiatedValue stripped server-side. If that copy
        // is what localStorage holds, an admin logging in on the same machine
        // must re-download everything instead of reusing zeroed prices — and
        // above all must not push them back.
        const roleChanged = get().dataRole !== role;
        try {
          const [entries, estado, settings, rates, seasons] = await Promise.all([
            fetchAllLayouts(),
            // Lo comercial es tan obligatorio como el plano: sin esto no se sabe
            // qué está vendido, y un plano sin fusionar pinta TODO libre. Si
            // falla, falla la sincronización entera y nos quedamos con la copia
            // que ya teníamos — mentir es peor que no actualizar.
            fetchEstadoComercial(),
            fetchLayoutSettings().catch(() => null),
            // The rates endpoint is admin-only (it's money) — a worker session
            // must not even ask for it, and always holds null.
            role === "admin"
              ? fetchReferenceRates().catch(() => null)
              : Promise.resolve(null),
            // Seasons are dates, not money: every role reads them.
            fetchSeasonWindows().catch(() => null),
          ]);

          // Los datos de este supermercado se reemplazaron enteros (el traspaso a
          // la base principal, 2026-09-23): lo que este navegador guarda es de
          // ANTES —del mismo código, pero de otros datos— y no puede ni
          // mostrarse ni subirse. Se descarta ANTES de reconciliar, así la vuelta
          // de abajo sólo adopta lo del servidor y no «siembra» ninguna sede
          // vieja en la base nueva.
          const generacion = settings?.generacion ?? null;
          if (generacion && generacion !== get().generacionCache) {
            set({ ...planosVacios(), generacionCache: generacion });
          }

          const bootstrap: string[] = [];
          let settingsNeedPush = false;

          set((state) => {
            const fixturesBySede = { ...state.fixturesBySede };
            const serverRev = { ...state.serverRev };
            const seen = new Set<string>();

            for (const entry of entries) {
              seen.add(entry.sede);
              const rev = entry.updated_at ?? "";
              // Never overwrite a sede that still holds unsaved local edits —
              // its pending push (and the server's conflict check) decides.
              if (state.dirty[entry.sede]) continue;
              const known = Object.prototype.hasOwnProperty.call(
                state.fixturesBySede,
                entry.sede,
              );
              // Adopt on any revision change. Unconditionally, including a
              // SMALLER or empty array — that is what makes deletions made on
              // another workstation actually propagate here.
              if (roleChanged || !known || serverRev[entry.sede] !== rev) {
                fixturesBySede[entry.sede] = entry.fixtures;
                serverRev[entry.sede] = rev;
              }
            }

            // Local sedes the server has never heard of. Upload them once so a
            // workstation that predates server sync seeds its work, but drop
            // any sede we *used* to know server-side: that one was deleted.
            //
            // Guarded on a non-empty response: a server whose database was
            // reset (or restored from a backup) answers with an empty list, and
            // treating that as "everything was deleted" would wipe the only
            // remaining copy of the layout. An empty response means "the server
            // has nothing yet", so we bootstrap into it instead.
            const serverHasData = entries.length > 0;
            for (const [sede, fixtures] of Object.entries(state.fixturesBySede)) {
              if (seen.has(sede) || !Array.isArray(fixtures) || fixtures.length === 0) continue;
              if (serverHasData && Object.prototype.hasOwnProperty.call(serverRev, sede)) {
                delete fixturesBySede[sede];
                delete serverRev[sede];
              } else {
                bootstrap.push(sede);
              }
            }

            const next: Partial<FixtureStore> = {
              // La fusión va acá, DESPUÉS de reconciliar: sobre todas las sedes
              // y no sólo sobre las que cambiaron de revisión. Una venta no
              // toca el plano, así que no hay revisión nueva que la delate.
              fixturesBySede: fusionarTodo(fixturesBySede, estado),
              // El mapa crudo, además de fundido: la fusión no puede guardar un
              // contrato que no tiene mueble donde pegarse.
              estadoComercial: estado,
              serverRev,
              dataRole: role,
              syncState: Object.keys(state.conflicts).length ? "conflict" : "idle",
              lastSyncedAt: Date.now(),
            };

            // Shared sede list.
            //
            // The visible list is the UNION of the configured order and every
            // sede the server actually holds a snapshot for. Two reasons:
            //
            //  · A sede must never become invisible just because the shared
            //    settings do not mention it. Its fixtures were adopted right
            //    above, but the selector only lists `sedes`, so without the
            //    union a sede created before this endpoint existed would have
            //    its data downloaded and then be impossible to open.
            //  · The settings start out empty on every existing deployment, so
            //    whichever workstation happened to sync first would otherwise
            //    publish ITS local list as canonical and erase everyone else's
            //    sede names on their next pull.
            //
            // A queued local settings change still wins for the configured
            // part: adopting there would undo a sede the user just added.
            const configured =
              settings && settings.sedes.length > 0 && !_settingsTimer
                ? settings.sedes
                : state.sedes;
            // A sede this session deleted is dropped from the configured part.
            // Nothing else trims that list, so a copy published by a
            // workstation that had not yet seen the deletion would otherwise
            // reinstate the name for everyone, with no snapshot behind it and
            // no way to remove it again.
            const visible = configured.filter(
              (name) => !_removedSedes.has(normalizeSede(name)),
            );
            for (const entry of entries) {
              // The server holds a snapshot under this name again, so the sede
              // genuinely exists — recreated, or seeded by a workstation that
              // was offline during the deletion. Stop suppressing it: the
              // tombstone guards the name in the list, not real data.
              _removedSedes.delete(normalizeSede(entry.sede));
              if (!visible.includes(entry.sede)) visible.push(entry.sede);
            }
            next.sedes = visible;
            if (!visible.includes(state.sede) && visible.length > 0) {
              next.sede = visible[0];
            }
            // Republish when the union added something the server did not have,
            // so every workstation converges on the complete list.
            settingsNeedPush =
              !_settingsTimer &&
              (!settings || visible.length !== settings.sedes.length ||
                visible.some((x, i) => settings.sedes[i] !== x));

            if (settings && settings.catalog_labels && !_settingsTimer) {
              next.catalogLabels = settings.catalog_labels;
            }
            if (settings) next.settingsRev = settings.updated_at ?? null;

            // Reference rates: adopt the server copy unless an edit of ours is
            // still waiting in the debounce. A worker never holds rates — clear
            // any leftover from a previous admin login in this same tab.
            if (role !== "admin") {
              next.referenceRates = null;
            } else if (rates && !_ratesTimer) {
              next.referenceRates = { default: rates.default, by_sede: rates.by_sede };
            }

            if (seasons && !_seasonsTimer) {
              next.seasonWindows = seasons.windows ?? {};
            }
            return next as FixtureStore;
          });

          if (bootstrap.length > 0 && canWrite()) {
            console.info(
              `[layout sync] subiendo ${bootstrap.length} sede(s) local(es) por primera vez…`,
            );
            await Promise.all(bootstrap.map((sede) => get().pushSede(sede, { force: true })));
          }
          // Publish the reconciled sede list (first seeding, or a sede the
          // shared settings did not know about yet).
          if (settingsNeedPush && canWrite()) {
            await get().pushSettings();
          }
        } catch (err: any) {
          if (err?.response?.status === 401) {
            // The auth interceptor already dropped the session; just clear the
            // spinner so the indicator does not hang on "Actualizando…".
            set({ syncState: "idle", syncMessage: null });
            return;
          }
          console.warn("[layout sync] no se pudo leer del servidor:", err);
          set({
            syncState: "error",
            syncMessage: "Sin conexión con el servidor. Mostrando la copia local.",
          });
        }
      },

      // ── Sólo lo comercial ─────────────────────────────────────────────────
      // Barata: la base sólo tiene fila para lo que se vendió alguna vez, así
      // que la respuesta es del tamaño de los contratos vivos, no del plano.
      refrescarComercial: async () => {
        if (!canRead()) return;
        try {
          const estado = await fetchEstadoComercial();
          set((state) => {
            const fixturesBySede = fusionarTodo(state.fixturesBySede, estado);
            // Identidad: si nada cambió no se redibuja el plano. El mapa crudo
            // se guarda igual —es barato y es la fuente—, pero sólo cuando algo
            // se movió de verdad, para no despertar a la pantalla cada 20 s.
            const igual =
              fixturesBySede === state.fixturesBySede &&
              mismoMapa(state.estadoComercial, estado);
            return igual ? state : ({ fixturesBySede, estadoComercial: estado } as FixtureStore);
          });
        } catch (err: any) {
          if (err?.response?.status === 401) return;
          // Sin respuesta se conserva lo que ya está pintado. Pintar todo libre
          // porque la red falló sería justo el fantasma que esto vino a matar.
          console.warn("[layout sync] no se pudo leer el estado comercial:", err);
        }
      },

      // ── Cheap change detection ────────────────────────────────────────────
      pollForChanges: async () => {
        if (!canRead()) return;
        // Never pull over the top of unsaved work. Retry pushing it instead —
        // otherwise one failed save would freeze this tab out of sync forever.
        if (Object.values(get().dirty).some(Boolean)) {
          await get().flushPending();
          return;
        }
        try {
          const revisions = await fetchRevisions();
          const { serverRev } = get();
          const changed =
            revisions.some((r) => (serverRev[r.sede] ?? null) !== (r.updated_at ?? "")) ||
            // A sede vanished server-side.
            Object.keys(serverRev).some((s) => !revisions.find((r) => r.sede === s));
          if (changed) {
            await get().syncFromServer();
          } else {
            // El plano no se movió, pero lo comercial ya no vive en el plano:
            // una venta, una cancelación o una planilla cargada en otro equipo
            // no cambian ninguna revisión. Sin esta rama, esta pestaña seguiría
            // mostrando el mapa de contratos de cuando se abrió.
            await get().refrescarComercial();
          }
        } catch {
          /* offline or transient — the next tick retries */
        }
      },

      resolveConflict: async (sede, keep) => {
        if (keep === "mine") {
          await get().pushSede(sede, { force: true });
          return;
        }
        // Keep the server copy: drop our unsaved delta for this sede, then pull.
        cancelScheduledSave(sede);
        set((s) => {
          const dirty = { ...s.dirty };
          const conflicts = { ...s.conflicts };
          const serverRev = { ...s.serverRev };
          delete dirty[sede];
          delete conflicts[sede];
          // Force the next pull to adopt whatever the server holds.
          delete serverRev[sede];
          return { dirty, conflicts, serverRev, syncState: "idle", syncMessage: null };
        });
        await get().syncFromServer();
      },

      startAutoSync: () => {
        startAutoSync();
      },

      stopAutoSync: () => {
        stopAutoSync();
      },
    }),
    {
      name: "retail-fixtures-v1",
      // Exclude undo/redo stacks from localStorage — they're session-only
      partialize: (state) => ({
        fixturesBySede: state.fixturesBySede,
        sedes: state.sedes,
        sede: state.sede,
        catalogLabels: state.catalogLabels,
        // Dates, not money — safe to keep so the map still answers offline.
        seasonWindows: state.seasonWindows,
        camera2D: state.camera2D,
        camera3D: state.camera3D,
        // Persisted so a reload knows what the server already has and which
        // sedes still carry unsaved work.
        serverRev: state.serverRev,
        settingsRev: state.settingsRev,
        dirty: state.dirty,
        dataRole: state.dataRole,
        clienteCache: state.clienteCache,
        generacionCache: state.generacionCache,
        // Una preferencia de vista, como las cámaras: sin datos ni plata.
        pendientesEnElPlano: state.pendientesEnElPlano,
        // referenceRates stays out on purpose: it's admin-only money, and this
        // key survives logout — a worker on the same machine must not find it.
      }),
      // Handles both:
      //   • v1 format: { fixtures: [...], sede: "X" }  → migrates into fixturesBySede
      //   • v2 format: { fixturesBySede: {...}, sede: "X" }
      merge: (persisted, current) => {
        const p = persisted as Partial<FixtureStore> & { fixtures?: UnifiedFixture[] };

        let fixturesBySede: Record<string, UnifiedFixture[]> = p.fixturesBySede ?? {};

        // Migrate old single-array format to per-sede map
        if (
          p.fixtures &&
          Array.isArray(p.fixtures) &&
          p.fixtures.length > 0 &&
          Object.keys(fixturesBySede).length === 0
        ) {
          const oldSede = p.sede ?? DEFAULT_SEDES[0];
          fixturesBySede = { [oldSede]: p.fixtures };
        }

        return {
          ...current,
          ...p,
          fixturesBySede,
          sedes: p.sedes ?? DEFAULT_SEDES,
          catalogLabels: p.catalogLabels ?? {},
          seasonWindows: p.seasonWindows ?? {},
          serverRev: p.serverRev ?? {},
          dirty: p.dirty ?? {},
          dataRole: p.dataRole ?? null,
          conflicts: {},
          rechazos: {},
          syncState: "idle",
          syncMessage: null,
          lastSyncedAt: null,
          camera2D: { ...current.camera2D, ...(p.camera2D ?? {}) },
          camera3D: { ...current.camera3D, ...(p.camera3D ?? {}) },
          // Sólo un `true` escrito la prende: lo de antes, o lo que no se
          // entiende, arranca apagado.
          pendientesEnElPlano: p.pendientesEnElPlano === true,
        };
      },
    }
  )
);

// ─── Background sync lifecycle ────────────────────────────────────────────────
// Started once the session is authenticated (see App.tsx) — never at module
// load, because back then there is no token and every request 401s.

let _pollTimer: ReturnType<typeof setInterval> | null = null;
let _listenersBound = false;

function onFocus() {
  void useFixtureStore.getState().pollForChanges();
}

function onVisibility() {
  if (document.visibilityState === "visible") {
    void useFixtureStore.getState().pollForChanges();
  }
}

function onOnline() {
  const store = useFixtureStore.getState();
  void store.flushPending().then(() => store.pollForChanges());
}

export function startAutoSync(): void {
  if (_pollTimer) return;
  void useFixtureStore.getState().syncFromServer();
  _pollTimer = setInterval(() => {
    void useFixtureStore.getState().pollForChanges();
  }, POLL_INTERVAL_MS);
  if (!_listenersBound) {
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    _listenersBound = true;
  }
}

export function stopAutoSync(): void {
  if (_pollTimer) {
    clearInterval(_pollTimer);
    _pollTimer = null;
  }
  if (_listenersBound) {
    window.removeEventListener("focus", onFocus);
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("online", onOnline);
    _listenersBound = false;
  }
}

// ─── Legacy migration ─────────────────────────────────────────────────────────

/**
 * One-time migration from old per-editor localStorage keys to the unified store.
 * Safe to call multiple times — no-ops if the store already has data.
 * Call once at app startup (e.g. in main.tsx).
 */
export function migrateFromLegacy(): void {
  const state = useFixtureStore.getState();

  // Already has fixtures for the current sede → skip migration
  if ((state.fixturesBySede[state.sede] ?? []).length > 0) return;

  // Check if old keys even exist (avoid unnecessary work on fresh installs)
  const has3D = !!localStorage.getItem("store-editor-v3");
  const has2D = !!localStorage.getItem("floor-plan-v1");
  if (!has3D && !has2D) return;

  const merged: UnifiedFixture[] = [];

  // ── Migrate from 3D editor (store-editor-v3) ────────────────────────────────
  try {
    const raw3D = localStorage.getItem("store-editor-v3");
    const sede3D = localStorage.getItem("store-sede-v1") || DEFAULT_SEDES[0];
    if (raw3D) {
      const fixtures3D = JSON.parse(raw3D) as any[];
      for (const f of fixtures3D) {
        if (!f.id || !f.type) continue;
        const status = f.status === "available" ? "free" : (f.status ?? "free");
        merged.push({
          id: f.id,
          code: f.code ?? "???",
          type: f.type,
          gondolaType: f.gondolaType,
          label: f.label ?? f.type,
          cx: f.x ?? 5,
          cz: f.z ?? 5,
          rotY: f.rotY ?? 0,
          w: f.w ?? 1,
          d: f.d ?? 1,
          h: f.h ?? 1.8,
          color: f.color ?? "#6366f1",
          status,
          sede: sede3D,
          supplierName: f.supplierName ?? "",
          brandCategory: f.brandCategory ?? "",
          negotiatedValue: f.negotiatedValue ?? 0,
          startDate: f.startDate ?? "",
          endDate: f.endDate ?? "",
          observation: f.observation ?? "",
          slots: f.slots?.map((sl: any) => ({
            ...sl,
            status: sl.status === "available" ? "free" : (sl.status ?? "free"),
          })),
        });
      }
      if (sede3D) state.setSede(sede3D);
    }
  } catch { /* ignore corrupt data */ }

  // ── Migrate from 2D editor (floor-plan-v1) ──────────────────────────────────
  // Estas dos tablas se quedan escritas acá y NO salen del catálogo de muebles
  // (`catalogo/muebles.json`), a propósito: reproducen con qué alto y color
  // entraba un mueble del localStorage viejo del 2D, que es un dato del pasado.
  // Por eso dicen otra cosa que el catálogo (la punta de 2,00, la vitrina de
  // 2,10, el robatope verde): cambiarlas cambiaría lo que se recupera de esos
  // navegadores, no los muebles que se creen desde ahora.
  const H_DEFAULTS: Record<string, number> = {
    gondola: 1.8, punta: 2.0, robatope: 1.6, ristra: 1.6,
    cross: 1.8, metro: 0.05, mueble: 2.1, exhibicion: 1.5,
  };
  // PENDIENTE DEL PR 2, igual que su gemela de `FloorPlan2D.tsx`: es una paleta
  // categórica por TIPO de mueble, elegida a ojo y sin validar, y además cada
  // color queda GUARDADO en el mueble (`f.color`), así que moverlo toca datos y
  // no sólo pintura. Nada que ver con la terna de estado, que ya salió a tokens.
  const COLOR_DEFAULTS: Record<string, string> = {
    gondola: "#6366f1", punta: "#7c3aed", robatope: "#16a34a",
    ristra: "#d97706", cross: "#0891b2", metro: "#64748b",
    mueble: "#475569", exhibicion: "#ec4899",
  };

  try {
    const raw2D = localStorage.getItem("floor-plan-v1");
    if (raw2D) {
      const items2D = JSON.parse(raw2D) as any[];
      const existingIds = new Set(merged.map((f) => f.id));
      for (const item of items2D) {
        if (!item.id || existingIds.has(item.id)) continue;

        let type: UnifiedFixture["type"];
        let gondolaType: UnifiedFixture["gondolaType"];
        if (item.type === "gondola_doble") { type = "gondola"; gondolaType = "double"; }
        else if (item.type === "gondola_mural") { type = "gondola"; gondolaType = "wall"; }
        else { type = item.type as any; }

        const w = item.w ?? 1;
        const d = item.h ?? 1;
        const status = item.status === "available" ? "free" : (item.status ?? "free");

        merged.push({
          id: item.id,
          code: item.code ?? "???",
          type,
          gondolaType,
          label: item.label ?? item.type,
          cx: (item.x ?? 0) + w / 2,
          cz: (item.y ?? 0) + d / 2,
          rotY: 0,
          w,
          d,
          h: H_DEFAULTS[type] ?? 1.8,
          color: COLOR_DEFAULTS[type] ?? "#6366f1",
          status,
          sede: item.sede ?? DEFAULT_SEDES[0],
          supplierName: item.supplierName ?? "",
          brandCategory: item.brandCategory ?? "",
          negotiatedValue: item.negotiatedValue ?? 0,
          startDate: item.startDate ?? "",
          endDate: item.endDate ?? "",
          observation: item.observation ?? "",
        });
      }
    }
  } catch { /* ignore corrupt data */ }

  // ── Commit and clean up ──────────────────────────────────────────────────────
  if (merged.length > 0) {
    state.setFixtures(merged);
  }

  localStorage.removeItem("store-editor-v3");
  localStorage.removeItem("store-sede-v1");
  localStorage.removeItem("floor-plan-v1");
  localStorage.removeItem("floor-plan-sede-v1");
}
