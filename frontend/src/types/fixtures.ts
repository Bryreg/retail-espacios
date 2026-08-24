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

// ─── Reference rates (tarifa de referencia) ──────────────────────────────────

/** Monthly reference rate (COP) per fixture type. `default` applies everywhere;
 *  `by_sede[sede]` overrides individual types for one sede. This mirrors the
 *  backend wire format verbatim (snake_case included) so the two never drift.
 *
 *  Rates are money: the backend serves them admin-only, the store never
 *  persists them to localStorage, and a worker session always holds `null`. */
export interface ReferenceRates {
  default: Record<string, number>;
  by_sede: Record<string, Record<string, number>>;
}

/** Rate-table key for a fixture. `negotiatedValue` is per face/contract, so
 *  double and wall gondolas (and the legacy 2D-only type names) share one
 *  per-face "gondola" rate instead of three diverging ones. */
export function rateTypeOf(f: { type: string }): string {
  return f.type === "gondola_doble" || f.type === "gondola_mural" ? "gondola" : f.type;
}

/** Effective reference for one sede + rate type, or null when none is set.
 *  A sede override wins over the general rate. */
export function referenceRateFor(
  rates: ReferenceRates | null,
  sede: string,
  type: string,
): number | null {
  if (!rates) return null;
  const override = rates.by_sede[sede]?.[type];
  if (typeof override === "number" && override > 0) return override;
  const base = rates.default[type];
  return typeof base === "number" && base > 0 ? base : null;
}

/** Rate types offered in the tariff editor, in display order. Infrastructure
 *  types are still listed (any fixture can be flipped to "comercializable"),
 *  columns excepted — a column is never sellable space. */
export const RATE_TYPES: { type: string; label: string }[] = [
  { type: "gondola",          label: "Góndola (por cara)" },
  { type: "punta",            label: "Punta Góndola" },
  { type: "robatope",         label: "Robatope" },
  { type: "ristra",           label: "Ristra" },
  { type: "cross",            label: "Exhibidor Cruz" },
  { type: "impulsador",       label: "Impulsador Marca" },
  { type: "mueble",           label: "Vitrina" },
  { type: "isla",             label: "Exhib. de Piso" },
  { type: "batea",            label: "Batea" },
  { type: "isla_fria",        label: "Isla Helados/Cong." },
  { type: "nevera_carnes",    label: "Nevera Carnes" },
  { type: "nevera_refrescos", label: "Nevera Refrescos" },
  { type: "stand_frutas",     label: "Stand Frutas/Verd" },
  { type: "checkout",         label: "Checkout / Caja" },
  { type: "metro",            label: "Zona Libre" },
];

export function rateTypeLabel(type: string): string {
  return RATE_TYPES.find((t) => t.type === type)?.label ?? type;
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
