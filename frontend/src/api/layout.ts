import client from "./client";
import type { UnifiedFixture } from "../types/fixtures";

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

export const fetchLayoutSettings = (): Promise<LayoutSettings> =>
  client.get("/layout/settings").then((r) => r.data);

export const saveLayoutSettings = (
  sedes: string[],
  catalogLabels: Record<string, string>,
): Promise<LayoutSettings> =>
  client
    .put("/layout/settings", { sedes, catalog_labels: catalogLabels })
    .then((r) => r.data);
