/**
 * Unified fixture type — single source of truth shared between 2D and 3D editors.
 *
 * Coordinate convention:
 *   - cx, cz  → center position in world meters (X = horizontal, Z = depth)
 *   - w       → width  (X axis)
 *   - d       → depth  (Z axis; called "h" in PlacedItem2D — see toPlan2D/fromPlan2D)
 *   - h       → height (Y axis; used by 3D only; 2D renders top-down so it ignores this)
 *
 * 2D render:   x = cx − w/2,  y = cz − d/2,  w = w,  h = d
 * 3D render:   position (cx, 0, cz)  with scale (w, h, d)
 */

export type SpaceStatus = "free" | "occupied" | "reserved" | "maintenance";

export type FixType =
  | "gondola"
  | "punta"
  | "robatope"
  | "ristra"
  | "cross"
  | "metro"
  | "mueble"
  | "isla"
  | "impulsador"
  | "batea"
  | "nevera_mural"
  | "isla_fria"
  | "stand_frutas"
  | "checkout"
  | "columna"
  | "exhibicion";   // legacy 2D-only type — kept for backward compat

export type GondolaType = "double" | "wall";

export interface ShelfSlot {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  supplierName: string;
  brandCategory: string;
  negotiatedValue: number;
  startDate: string;
  endDate: string;
  status: SpaceStatus;
}

export interface UnifiedFixture {
  // ── Identity ──────────────────────────────────────────────────────────────
  id: string;
  code: string;
  type: FixType;
  gondolaType?: GondolaType;
  label: string;

  // ── Position (center, world meters) ───────────────────────────────────────
  cx: number;
  cz: number;
  rotY: number;   // Y-axis rotation in radians (3D); not used in 2D top-down

  // ── Dimensions (meters) ───────────────────────────────────────────────────
  w: number;      // width
  d: number;      // depth  (= "h" in PlacedItem2D)
  h: number;      // height (= 3D vertical; ignored in 2D render)

  // ── Visual ────────────────────────────────────────────────────────────────
  color: string;

  // ── Commercial ────────────────────────────────────────────────────────────
  status: SpaceStatus;
  sede: string;
  supplierName: string;
  brandCategory: string;
  negotiatedValue: number;
  startDate: string;
  endDate: string;
  observation: string;

  // ── 3D-specific ───────────────────────────────────────────────────────────
  slots?: ShelfSlot[];
}
