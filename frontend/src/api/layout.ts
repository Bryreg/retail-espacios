import client from "./client";
import type { UnifiedFixture } from "../types/fixtures";

export interface LayoutEntry {
  sede: string;
  fixtures: UnifiedFixture[];
  updated_at?: string;
}

export const fetchAllLayouts = (): Promise<LayoutEntry[]> =>
  client.get("/layout").then((r) => r.data);

export const saveLayout = (sede: string, fixtures: UnifiedFixture[]): Promise<void> =>
  client.put(`/layout/${encodeURIComponent(sede)}`, { fixtures }).then(() => {});
