import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ReferenceRates, UnifiedFixture } from "../types/fixtures";
import {
  deleteLayout,
  fetchAllLayouts,
  fetchLayoutSettings,
  fetchReferenceRates,
  fetchRevisions,
  saveLayout,
  saveLayoutSettings,
  saveReferenceRates,
} from "../api/layout";
import { useAuthStore } from "./authStore";

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
function normalizeSede(name: string): string {
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

export const DEFAULT_SEDES = ["TERRON", "CENTRO", "NORTE", "SUR"];

export type SyncState = "idle" | "pulling" | "pushing" | "error" | "conflict";

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
  camera2D: Camera2D;
  camera3D: Camera3D;

  // ── Sync bookkeeping ────────────────────────────────────────────────────────
  /** Server revision (updated_at) last seen for each sede. */
  serverRev: Record<string, string>;
  /** Sedes holding local edits the server has not acknowledged yet. */
  dirty: Record<string, boolean>;
  /** Sedes another workstation modified while we held unsaved edits. */
  conflicts: Record<string, string>;
  syncState: SyncState;
  syncMessage: string | null;
  lastSyncedAt: number | null;
  /** Role whose (possibly redacted) data is currently cached. A worker never
   *  receives negotiatedValue, so that cache must not be reused by an admin. */
  dataRole: string | null;

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

  /** Add a new sede to the list. */
  addSede: (name: string) => void;

  /** Rename a sede — updates key in fixturesBySede and active sede if needed. */
  renameSede: (oldName: string, newName: string) => void;

  /** Remove a sede (clears its fixtures). The active sede is moved to the first available. */
  removeSede: (name: string) => void;

  /** Override the display label for a catalog fixture type. */
  setCatalogLabel: (type: string, label: string) => void;

  /** Set one reference rate. `sede === null` edits the general rate; a value
   *  of 0 (or less) clears the entry. Admin-only — no-ops otherwise. */
  setReferenceRate: (sede: string | null, type: string, value: number) => void;

  // Undoable mutation — use this for all user-initiated changes
  commit: (fixtures: UnifiedFixture[]) => void;
  undo: () => void;
  redo: () => void;

  // Camera persistence
  setCamera2D: (c: Partial<Camera2D>) => void;
  setCamera3D: (c: Partial<Camera3D>) => void;

  // ── Sync actions ────────────────────────────────────────────────────────────
  /** Pull every sede from the server and adopt whatever changed. */
  syncFromServer: () => Promise<void>;
  /** Push one sede now, bypassing the debounce. */
  pushSede: (sede: string, opts?: { force?: boolean }) => Promise<void>;
  /** Push the shared sede list / catalog labels. */
  pushSettings: () => Promise<void>;
  /** Push the reference rates (admin-only endpoint). */
  pushRates: () => Promise<void>;
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

export const useFixtureStore = create<FixtureStore>()(
  persist(
    (set, get) => ({
      fixturesBySede: {},
      sedes: DEFAULT_SEDES,
      sede: "TERRON",
      catalogLabels: {},
      referenceRates: null,
      camera2D: DEFAULT_CAMERA_2D,
      camera3D: DEFAULT_CAMERA_3D,
      serverRev: {},
      dirty: {},
      conflicts: {},
      syncState: "idle",
      syncMessage: null,
      lastSyncedAt: null,
      dataRole: null,
      past: [],
      future: [],

      // ── Non-undoable ──────────────────────────────────────────────────────
      setFixtures: (fixtures) =>
        set((state) => ({
          fixturesBySede: { ...state.fixturesBySede, [state.sede]: fixtures },
        })),

      setSede: (sede) =>
        // Clear undo/redo when switching sedes — each floor plan is independent
        set({ sede, past: [], future: [] }),

      addSede: (rawName) =>
        set((state) => {
          const name = normalizeSede(rawName);
          if (!name || state.sedes.includes(name)) return state;
          scheduleSettingsSave();
          return { sedes: [...state.sedes, name] };
        }),

      renameSede: (oldName, rawNewName) =>
        set((state) => {
          const newName = normalizeSede(rawNewName);
          if (!newName || newName === oldName) return state;
          const newFixturesBySede = { ...state.fixturesBySede };
          const newDirty = { ...state.dirty };
          const newRev = { ...state.serverRev };
          if (newFixturesBySede[oldName]) {
            // Each fixture also carries its own sede, and that field is what
            // builds the "SEDE-CODE" space code used for contracts and files.
            // Leaving it behind would point the renamed sede at the old codes.
            newFixturesBySede[newName] = newFixturesBySede[oldName].map((f) =>
              f.sede === oldName ? { ...f, sede: newName } : f,
            );
            delete newFixturesBySede[oldName];
          }
          // The renamed sede is a brand new snapshot server-side: it has no
          // revision yet, and its fixtures still need to be uploaded. The old
          // snapshot has to go, or both names would keep coming back on pull.
          delete newRev[oldName];
          delete newDirty[oldName];
          if (canWrite()) {
            void deleteLayout(oldName).catch((err) =>
              console.warn(`[layout sync] no se pudo eliminar «${oldName}» del servidor:`, err),
            );
          }
          if (newFixturesBySede[newName]?.length) {
            newDirty[newName] = true;
            scheduleSave(newName);
          }
          scheduleSettingsSave();
          return {
            sedes: state.sedes.map((s) => (s === oldName ? newName : s)),
            fixturesBySede: newFixturesBySede,
            serverRev: newRev,
            dirty: newDirty,
            sede: state.sede === oldName ? newName : state.sede,
          };
        }),

      removeSede: (name) =>
        set((state) => {
          const remaining = state.sedes.filter((s) => s !== name);
          const newFixturesBySede = { ...state.fixturesBySede };
          delete newFixturesBySede[name];
          const newDirty = { ...state.dirty };
          delete newDirty[name];
          cancelScheduledSave(name);
          // Drop the snapshot too. Removing the sede from the shared list is not
          // enough: every workstation would keep downloading its fixtures.
          if (canWrite()) {
            void deleteLayout(name).catch((err) =>
              console.warn(`[layout sync] no se pudo eliminar «${name}» del servidor:`, err),
            );
          }
          const newSede =
            state.sede === name ? (remaining[0] ?? "TERRON") : state.sede;
          const newRev = { ...state.serverRev };
          delete newRev[name];
          scheduleSettingsSave();
          return {
            sedes: remaining.length > 0 ? remaining : ["TERRON"],
            fixturesBySede: newFixturesBySede,
            serverRev: newRev,
            dirty: newDirty,
            sede: newSede,
            past: [],
            future: [],
          };
        }),

      setCatalogLabel: (type, label) =>
        set((state) => {
          const next = { ...state.catalogLabels };
          if (label.trim()) {
            next[type] = label.trim();
          } else {
            delete next[type];
          }
          scheduleSettingsSave();
          return { catalogLabels: next };
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

      undo: () =>
        set((state) => {
          if (state.past.length === 0) return state;
          const prev = state.past[state.past.length - 1];
          const current = state.fixturesBySede[state.sede] ?? [];
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
          const next = state.future[0];
          const current = state.fixturesBySede[state.sede] ?? [];
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

      // ── Push one sede ─────────────────────────────────────────────────────
      pushSede: async (sede, opts) => {
        if (!canWrite()) return;
        cancelScheduledSave(sede);
        const state = get();
        // A sede awaiting conflict resolution would just 409 again on every
        // poll; only an explicit resolution (force) may push it.
        if (state.conflicts[sede] && !opts?.force) return;
        const fixtures = state.fixturesBySede[sede] ?? [];
        // `force` resolves a conflict in our favour: overwrite whatever is there.
        const base = opts?.force ? null : (state.serverRev[sede] ?? null);

        set({ syncState: "pushing", syncMessage: null });
        try {
          const saved = await saveLayout(sede, fixtures, base);
          set((s) => {
            const dirty = { ...s.dirty };
            const conflicts = { ...s.conflicts };
            delete conflicts[sede];
            // Another edit landed while the request was in flight — stay dirty
            // so the follow-up save still happens.
            if (s.fixturesBySede[sede] === fixtures) delete dirty[sede];
            return {
              dirty,
              conflicts,
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
      },

      // ── Push shared settings ──────────────────────────────────────────────
      pushSettings: async () => {
        if (!canWrite()) return;
        const { sedes, catalogLabels } = get();
        try {
          await saveLayoutSettings(sedes, catalogLabels);
        } catch (err: any) {
          const status = err?.response?.status;
          if (status === 401 || status === 403) return;
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
          const [entries, settings, rates] = await Promise.all([
            fetchAllLayouts(),
            fetchLayoutSettings().catch(() => null),
            // The rates endpoint is admin-only (it's money) — a worker session
            // must not even ask for it, and always holds null.
            role === "admin"
              ? fetchReferenceRates().catch(() => null)
              : Promise.resolve(null),
          ]);

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
              fixturesBySede,
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
            const visible = [...configured];
            for (const entry of entries) {
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

            // Reference rates: adopt the server copy unless an edit of ours is
            // still waiting in the debounce. A worker never holds rates — clear
            // any leftover from a previous admin login in this same tab.
            if (role !== "admin") {
              next.referenceRates = null;
            } else if (rates && !_ratesTimer) {
              next.referenceRates = { default: rates.default, by_sede: rates.by_sede };
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
          if (changed) await get().syncFromServer();
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
        camera2D: state.camera2D,
        camera3D: state.camera3D,
        // Persisted so a reload knows what the server already has and which
        // sedes still carry unsaved work.
        serverRev: state.serverRev,
        dirty: state.dirty,
        dataRole: state.dataRole,
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
          const oldSede = p.sede ?? "TERRON";
          fixturesBySede = { [oldSede]: p.fixtures };
        }

        return {
          ...current,
          ...p,
          fixturesBySede,
          sedes: p.sedes ?? DEFAULT_SEDES,
          catalogLabels: p.catalogLabels ?? {},
          serverRev: p.serverRev ?? {},
          dirty: p.dirty ?? {},
          dataRole: p.dataRole ?? null,
          conflicts: {},
          syncState: "idle",
          syncMessage: null,
          lastSyncedAt: null,
          camera2D: { ...current.camera2D, ...(p.camera2D ?? {}) },
          camera3D: { ...current.camera3D, ...(p.camera3D ?? {}) },
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
    const sede3D = localStorage.getItem("store-sede-v1") || "TERRON";
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
  const H_DEFAULTS: Record<string, number> = {
    gondola: 1.8, punta: 2.0, robatope: 1.6, ristra: 1.6,
    cross: 1.8, metro: 0.05, mueble: 2.1, exhibicion: 1.5,
  };
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
          sede: item.sede ?? "TERRON",
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
