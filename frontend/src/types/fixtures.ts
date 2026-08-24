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
  | "isla_fria"
  | "nevera_carnes"
  | "nevera_refrescos"
  | "stand_frutas"
  | "checkout"
  | "columna"
  | "exhibicion";   // legacy 2D-only type — kept for backward compat

export type GondolaType = "double" | "wall";

/** Shared double-gondola check — single source of truth for every editor/view.
 *  An undefined gondolaType defaults to "double" (matches both editors' behavior). */
export function isDoubleGondola(f: { type: FixType; gondolaType?: GondolaType }): boolean {
  return f.type === "gondola" && (f.gondolaType ?? "double") === "double";
}

/** Fixture types that are infrastructure by nature — never rented to a supplier.
 *  Used only as the default when a fixture is first created; the user can always
 *  override the flag per fixture from the editor panels. */
export const NON_RENTABLE_BY_DEFAULT: ReadonlySet<string> = new Set<FixType>([
  "metro",
  "columna",
  "checkout",
]);

/** True when the fixture can hold a commercial contract.
 *
 *  Backward compatible on purpose: fixtures saved before this flag existed have
 *  no `rentable` property, and every one of them must stay rentable. Only an
 *  explicit `false` marks a fixture as infrastructure.
 */
export function isRentable(f: { rentable?: boolean }): boolean {
  return f.rentable !== false;
}

/** Commercial data for one face of a double gondola.
 *  Face A is the fixture's existing top-level fields; face B lives here. */
export interface FaceData {
  supplierName: string;
  brandCategory: string;
  negotiatedValue: number;
  startDate: string;
  endDate: string;
  observation: string;
  status: SpaceStatus;
}

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

  /** Whether this fixture may be rented out / hold a contract.
   *  Absent means rentable (see `isRentable`) so pre-existing layouts keep
   *  working unchanged. Set to `false` for infrastructure: columns, checkouts,
   *  free zones — anything that is part of the store but never sold as space. */
  rentable?: boolean;

  /** Short label rendered OUTSIDE the shape in the 2D plan so it stays legible
   *  from afar even on tiny fixtures. Optional — falls back to nothing. */
  nomenclatura?: string;

  /** Second face of a double gondola (type === "gondola" && gondolaType === "double").
   *  Top-level commercial fields represent face A; this holds face B. */
  faceB?: FaceData;

  // ── 3D-specific ───────────────────────────────────────────────────────────
  slots?: ShelfSlot[];
}
