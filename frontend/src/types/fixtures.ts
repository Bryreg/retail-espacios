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

import { dayNumber, inclusiveDays, parseISODate } from "./seasons";
import type { Vista3D } from "../utils/planta";

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
  | "servicio_cliente"
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
  // El punto de servicio al cliente es operación de la tienda, no espacio que
  // se le venda a un proveedor. Como con las cajas, la bandera se puede
  // cambiar a mano si alguna sede decide alquilar ese frente.
  "servicio_cliente",
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

/** ¿El mueble está girado un cuarto de vuelta?
 *
 *  En ese caso su huella vista desde arriba tiene el ancho y el fondo
 *  intercambiados. Vivía privada dentro de FloorPlan2D, y por eso el mapa
 *  isométrico del Dashboard —que no la tenía— dibujaba cualquier mueble
 *  rotado con la huella equivocada: en un mapa cuyo único trabajo es decir
 *  dónde están las cosas, ese es justo el error que no se puede cometer.
 *
 *  `rotY` está en RADIANES, no en grados. La tolerancia absorbe el error de
 *  redondeo que deja rotar el mueble muchas veces seguidas. */
export function isRotated90(rotY: number): boolean {
  const r = ((rotY % Math.PI) + Math.PI) % Math.PI;
  return Math.abs(r - Math.PI / 2) < 0.15;
}

/** Ancho y fondo de la huella vista desde arriba, ya con el giro aplicado. */
export function footprint2D(f: { w: number; d: number; rotY?: number }): { w: number; d: number } {
  return isRotated90(f.rotY ?? 0) ? { w: f.d, d: f.w } : { w: f.w, d: f.d };
}

/** El código con el que el espacio existe FUERA del plano: `SEDE-CODIGO`.
 *
 *  Dentro del layout un mueble se llama por su nomenclatura corta (`PUN-01`),
 *  que se repite en las tres sedes. Lo que se guarda en `spaces`, lo que viaja
 *  en el enlace de los correos y lo que se reporta como montado es siempre el
 *  código con sede, porque es el único único.
 *
 *  Convención de guardado de contratos (AssignmentPanel de FloorPlan2D):
 *  `` `${item.sede || sede}-${item.code}` ``, con `-B` para la cara B. Los
 *  códigos que genera el editor 3D ya traen la sede adentro, así que el guard
 *  evita el doble prefijo — y todo se compara en mayúsculas porque el prefijo
 *  se genera en mayúsculas pero la sede puede venir escrita como sea. */
export function fullSpaceCode(sede: string | undefined, code: string): string {
  const codeUC = (code ?? "").trim().toUpperCase();
  const sedeUC = (sede ?? "").trim().toUpperCase();
  if (!sedeUC || codeUC.startsWith(`${sedeUC}-`)) return codeUC;
  return `${sedeUC}-${codeUC}`;
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

/** Rate types offered in the tariff editor, in display order.
 *
 *  Los rótulos se escriben como se dicen. Decían «Stand Frutas/Verd», «Exhib.
 *  de Piso», «Isla Helados/Cong.»: abreviaturas con barra y punto, con
 *  mayúscula en el medio de la frase. Eso es cómo se nombra una columna de
 *  base de datos, no cómo un encargado nombra un espacio por teléfono — y esa
 *  clase de abreviatura es lo que hace que una pantalla se lea como un volcado
 *  de tabla. Ninguna clave cambió: se cambia sólo lo que se lee. Infrastructure
 *  types are still listed (any fixture can be flipped to "comercializable"),
 *  columns excepted — a column is never sellable space. */
export const RATE_TYPES: { type: string; label: string }[] = [
  { type: "gondola",          label: "Góndola, por cara" },
  { type: "punta",            label: "Punta de góndola" },
  { type: "robatope",         label: "Robatope" },
  { type: "ristra",           label: "Ristra" },
  { type: "cross",            label: "Exhibición de piso" },
  { type: "impulsador",       label: "Impulsador de marca" },
  { type: "mueble",           label: "Vitrina" },
  { type: "isla",             label: "Isla" },
  { type: "batea",            label: "Batea" },
  { type: "isla_fria",        label: "Isla de congelados" },
  { type: "nevera_carnes",    label: "Nevera de carnes" },
  { type: "nevera_refrescos", label: "Nevera de bebidas" },
  { type: "stand_frutas",     label: "Frutas y verduras" },
  { type: "checkout",         label: "Cabecera de caja" },
  { type: "metro",            label: "Zona libre" },
];

/** La familia comercial de cada tipo. Es el vocabulario que ya usa la
 *  biblioteca del plano (FloorPlan2D): góndolas, displays, muebles,
 *  refrigeración, frescos. Sirve para contestar «qué me queda por vender»
 *  agrupado, sin inventar un campo de zona que el mueble no tiene. */
export const CATEGORIA_DE_TIPO: Record<string, string> = {
  gondola: "Góndolas", punta: "Góndolas", robatope: "Góndolas",
  ristra: "Displays", cross: "Displays", impulsador: "Displays",
  mueble: "Muebles", isla: "Muebles", batea: "Muebles",
  isla_fria: "Refrigeración", nevera_carnes: "Refrigeración",
  nevera_refrescos: "Refrigeración",
  stand_frutas: "Frescos",
  metro: "Zona libre",
};

export function categoriaDeTipo(type: string): string {
  return CATEGORIA_DE_TIPO[type] ?? "Otros";
}

export function rateTypeLabel(type: string): string {
  return RATE_TYPES.find((t) => t.type === type)?.label ?? type;
}

// ─── Contract phase (derived from the dates, never stored) ───────────────────

/** Where a face's contract sits in time, relative to today.
 *
 *  DERIVED on purpose. `status === "occupied"` only means "this face has a
 *  contract"; whether that contract already started is a question the dates
 *  answer, and they are already saved per face. Storing a phase instead would
 *  need something to flip it when the start date arrives — and until it ran,
 *  the map would lie. Deriving is also retroactive: layouts saved before this
 *  existed get the right reading with no migration and no backfill. */
export type ContractPhase =
  | "sin_contrato"   // marked occupied but no dates recorded
  | "pendiente"      // signed, starts in the future — committed, not yet live
  | "vigente"        // running today
  | "vencido";       // end date already passed

const parseLocalDate = parseISODate;

export function contractPhase(
  face: { status: SpaceStatus; startDate?: string; endDate?: string },
  today: Date = new Date(),
): ContractPhase {
  if (face.status !== "occupied") return "sin_contrato";
  const ref = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const start = face.startDate ? parseLocalDate(face.startDate) : null;
  const end = face.endDate ? parseLocalDate(face.endDate) : null;
  if (!start && !end) return "sin_contrato";
  if (end && end < ref) return "vencido";
  if (start && start > ref) return "pendiente";
  return "vigente";
}

/** True when the face holds a contract that is actually running today.
 *  This is the test for "is this space earning money right now". */
export function isCurrentlyOccupied(
  face: { status: SpaceStatus; startDate?: string; endDate?: string },
  today?: Date,
): boolean {
  return contractPhase(face, today) === "vigente";
}

/** True when the space can be sold for a period starting today — no contract,
 *  or one that already ended. A "pendiente" face is NOT free: it is committed. */
export function isSellableToday(
  face: { status: SpaceStatus; startDate?: string; endDate?: string },
  today?: Date,
): boolean {
  if (face.status !== "free") {
    const phase = contractPhase(face, today);
    return phase === "vencido";
  }
  return true;
}

// ─── Availability over a date RANGE ──────────────────────────────────────────

export type RangeAvailability = "libre" | "parcial" | "tomado";

/** How much of [from, to] this face already has committed.
 *
 *  Both ends are INCLUSIVE on purpose. A shelf is not a hotel room: the
 *  supplier going out and the one coming in cannot share the last day, because
 *  somebody has to physically dismount one display and mount the other. So a
 *  contract ending the 30th blocks the 30th, and the next one starts the 31st.
 *
 *  Reserved and maintenance also block: they are not for sale either. */
export function daysTakenInRange(
  face: { status: SpaceStatus; startDate?: string; endDate?: string },
  from: Date,
  to: Date,
  today: Date = new Date(),
): number {
  const total = inclusiveDays(from, to);
  if (total <= 0) return 0;

  // "Reservado" and "mantenimiento" carry no dates: they describe the state
  // right now, not a period. So they block a span that includes today — we
  // cannot promise a space that is held as we speak — but they say nothing
  // about December, and blocking the future on them would hide sellable
  // inventory behind a flag someone set months earlier and forgot.
  if (face.status === "reserved" || face.status === "maintenance") {
    const t = dayNumber(today);
    return t >= dayNumber(from) && t <= dayNumber(to) ? total : 0;
  }
  if (face.status !== "occupied") return 0;

  const start = face.startDate ? parseISODate(face.startDate) : null;
  const end = face.endDate ? parseISODate(face.endDate) : null;
  // Marked occupied with no dates recorded: treat it as taken rather than
  // offering a space someone may physically be using.
  if (!start && !end) return total;
  // Dates entered backwards. The intersection below would come out empty and
  // the space would read as free for every period ever asked about, which is
  // the expensive direction of being wrong. Same policy as above: if the data
  // makes no sense, assume the space is in use.
  if (start && end && dayNumber(end) < dayNumber(start)) return total;

  const a = Math.max(dayNumber(from), start ? dayNumber(start) : -Infinity);
  const b = Math.min(dayNumber(to), end ? dayNumber(end) : Infinity);
  return b < a ? 0 : b - a + 1;
}

/** Reading of one face for a whole period: only "libre" is sellable as asked.
 *  "parcial" is a real answer, not a fudge — it tells the operator there is a
 *  conversation to have ("te lo puedo dar 5 de los 7 días"). */
export function rangeAvailability(
  face: { status: SpaceStatus; startDate?: string; endDate?: string },
  from: Date,
  to: Date,
  today?: Date,
): RangeAvailability {
  const total = inclusiveDays(from, to);
  if (total <= 0) return "libre";
  const taken = daysTakenInRange(face, from, to, today);
  if (taken <= 0) return "libre";
  return taken >= total ? "tomado" : "parcial";
}

/** Commercial data for one face of a double gondola.
 *  Face A is the fixture's existing top-level fields; face B lives here.
 *
 *  `mountedAt` / `mountedBy` record the physical assembly — the one fact the
 *  dates cannot derive. A contract can be running while nothing is on the
 *  shelf yet, and that gap is exactly what the merchandiser confirms. */
export interface FaceData {
  supplierName: string;
  brandCategory: string;
  negotiatedValue: number;
  startDate: string;
  endDate: string;
  observation: string;
  status: SpaceStatus;

  /** Physical assembly confirmed: ISO timestamp and who reported it.
   *  Absent means "not mounted yet" — which is the honest default for every
   *  layout saved before this existed, since nobody confirmed anything. */
  mountedAt?: string;
  mountedBy?: string;
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

  /** Physical assembly of face A — see FaceData.mountedAt. */
  mountedAt?: string;
  mountedBy?: string;

  /** Second face of a double gondola (type === "gondola" && gondolaType === "double").
   *  Top-level commercial fields represent face A; this holds face B. */
  faceB?: FaceData;

  // ── 3D-specific ───────────────────────────────────────────────────────────
  slots?: ShelfSlot[];

  /** Cámara guardada para mostrarle este espacio a un proveedor, por cara.
   *
   *  Vive acá y no en una tabla nueva porque el JSON del layout ya viaja al
   *  servidor y ya se sincroniza entre estaciones: una vista guardada en la
   *  reunión aparece en la laptop del que arma la propuesta. Ausente = se usa
   *  el encuadre calculado (`vistaDeCara`). */
  vista3D?: Partial<Record<"A" | "B", Vista3D>>;
}
