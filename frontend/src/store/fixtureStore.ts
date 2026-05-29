import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { UnifiedFixture } from "../types/fixtures";
import { fetchAllLayouts, saveLayout } from "../api/layout";

const MAX_UNDO = 50;

// ─── Debounced server save ────────────────────────────────────────────────────
// Batches rapid changes (dragging, typing) into a single PUT every 1.5 s.

let _saveTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleSave(sede: string, fixtures: UnifiedFixture[]) {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    saveLayout(sede, fixtures).catch((err) =>
      console.warn("[layout sync] save failed:", err)
    );
  }, 1500);
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

interface FixtureStore {
  /** Fixtures stored per-sede — each sede has its own independent floor plan. */
  fixturesBySede: Record<string, UnifiedFixture[]>;
  /** Ordered list of sede names. Users can rename or add sedes. */
  sedes: string[];
  sede: string;
  /** User-defined labels for catalog types (overrides the hardcoded defaults). */
  catalogLabels: Record<string, string>;
  camera2D: Camera2D;
  camera3D: Camera3D;

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

  // Undoable mutation — use this for all user-initiated changes
  commit: (fixtures: UnifiedFixture[]) => void;
  undo: () => void;
  redo: () => void;

  // Camera persistence
  setCamera2D: (c: Partial<Camera2D>) => void;
  setCamera3D: (c: Partial<Camera3D>) => void;

  /**
   * Load all sede layouts from the server and merge into local state.
   * Server data wins — call once on app startup.
   */
  syncFromServer: () => Promise<void>;
}

// ─── Selector ─────────────────────────────────────────────────────────────────

/** Stable empty array — avoids creating a new reference on every selector call. */
const EMPTY_FIXTURES: UnifiedFixture[] = [];

/** Returns the fixtures for the currently active sede. */
export const selectFixtures = (state: FixtureStore): UnifiedFixture[] =>
  state.fixturesBySede[state.sede] ?? EMPTY_FIXTURES;

// ─── Store implementation ─────────────────────────────────────────────────────

export const useFixtureStore = create<FixtureStore>()(
  persist(
    (set, get) => ({
      fixturesBySede: {},
      sedes: DEFAULT_SEDES,
      sede: "TERRON",
      catalogLabels: {},
      camera2D: DEFAULT_CAMERA_2D,
      camera3D: DEFAULT_CAMERA_3D,
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

      addSede: (name) =>
        set((state) => ({
          sedes: state.sedes.includes(name) ? state.sedes : [...state.sedes, name],
        })),

      renameSede: (oldName, newName) =>
        set((state) => {
          if (!newName.trim() || newName === oldName) return state;
          const newFixturesBySede = { ...state.fixturesBySede };
          if (newFixturesBySede[oldName]) {
            newFixturesBySede[newName] = newFixturesBySede[oldName];
            delete newFixturesBySede[oldName];
          }
          return {
            sedes: state.sedes.map((s) => (s === oldName ? newName : s)),
            fixturesBySede: newFixturesBySede,
            sede: state.sede === oldName ? newName : state.sede,
          };
        }),

      removeSede: (name) =>
        set((state) => {
          const remaining = state.sedes.filter((s) => s !== name);
          const newFixturesBySede = { ...state.fixturesBySede };
          delete newFixturesBySede[name];
          const newSede =
            state.sede === name ? (remaining[0] ?? "TERRON") : state.sede;
          return {
            sedes: remaining.length > 0 ? remaining : ["TERRON"],
            fixturesBySede: newFixturesBySede,
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
          return { catalogLabels: next };
        }),

      // ── Undoable mutation ─────────────────────────────────────────────────
      commit: (nextFixtures) =>
        set((state) => {
          scheduleSave(state.sede, nextFixtures);
          return {
            fixturesBySede: {
              ...state.fixturesBySede,
              [state.sede]: nextFixtures,
            },
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
          return {
            fixturesBySede: { ...state.fixturesBySede, [state.sede]: prev },
            past: state.past.slice(0, -1),
            future: [current, ...state.future.slice(0, MAX_UNDO - 1)],
          };
        }),

      redo: () =>
        set((state) => {
          if (state.future.length === 0) return state;
          const next = state.future[0];
          const current = state.fixturesBySede[state.sede] ?? [];
          return {
            fixturesBySede: { ...state.fixturesBySede, [state.sede]: next },
            past: [...state.past.slice(-(MAX_UNDO - 1)), current],
            future: state.future.slice(1),
          };
        }),

      // ── Camera ────────────────────────────────────────────────────────────
      setCamera2D: (c) =>
        set((state) => ({ camera2D: { ...state.camera2D, ...c } })),
      setCamera3D: (c) =>
        set((state) => ({ camera3D: { ...state.camera3D, ...c } })),

      // ── Server sync ───────────────────────────────────────────────────────
      syncFromServer: () =>
        fetchAllLayouts()
          .then((entries) => {
            const fromServer: Record<string, UnifiedFixture[]> = {};
            for (const entry of entries) {
              if (Array.isArray(entry.fixtures) && entry.fixtures.length > 0) {
                fromServer[entry.sede] = entry.fixtures;
              }
            }

            // Snapshot local state BEFORE any merge so we can detect what to push.
            const localBySede = get().fixturesBySede;

            if (Object.keys(fromServer).length > 0) {
              // Server wins — overwrite local data for any sede that has server data
              set((state) => ({
                fixturesBySede: { ...state.fixturesBySede, ...fromServer },
              }));
            }

            // Initial upload: push any local sede that the server doesn't know about yet.
            const toPush = Object.entries(localBySede).filter(
              ([sede, fixtures]) =>
                !fromServer[sede] && Array.isArray(fixtures) && fixtures.length > 0
            );
            if (toPush.length > 0) {
              console.info(
                `[layout sync] uploading ${toPush.length} local sede(s) to server for the first time…`
              );
              void Promise.all(
                toPush.map(([sede, fixtures]) =>
                  saveLayout(sede, fixtures).catch((err) =>
                    console.warn(`[layout sync] initial push for "${sede}" failed:`, err)
                  )
                )
              );
            }
          })
          .catch((err) =>
            console.warn("[layout sync] initial load failed, using localStorage:", err)
          ),
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
          camera2D: { ...current.camera2D, ...(p.camera2D ?? {}) },
          camera3D: { ...current.camera3D, ...(p.camera3D ?? {}) },
        };
      },
    }
  )
);

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
