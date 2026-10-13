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
import {
  CATALOGO_DE_MUEBLES, categoriasDeTipo, tarifaPorTipo, tiposQueSeAlquilan,
} from "../catalogo/catalogo";

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
  | "nevera_vegetales"
  | "stand_frutas"
  | "checkout"
  | "servicio_cliente"
  | "columna"
  | "exhibicion";   // legacy 2D-only type — kept for backward compat

export type GondolaType = "double" | "wall";

// `carasDe` e `isDoubleGondola` —LA respuesta a «¿tiene cara B?»— y
// `fullSpaceCode` viven en `types/espacio.ts`, sin catálogo, y se reexportan
// desde acá: quien las importaba de este archivo no cambió. Ver ese archivo.
export { carasDe, isDoubleGondola, fullSpaceCode } from "./espacio";

/**
 * Tipos que NUNCA son espacio vendible, decida lo que decida la bandera.
 *
 * No son muebles a los que hoy no se les vendió el frente: son **operación de
 * la tienda**. Una columna sostiene el techo. Una caja registradora y el
 * mostrador de servicio al cliente son puestos de trabajo del supermercado —
 * lo que pasa ahí es cobrar y atender reclamos, no exhibir la marca de un
 * proveedor. Ofrecerlos en la tabla de tarifas es ofrecer algo que no se
 * vende.
 *
 * Va por TIPO y no por bandera a propósito. La bandera se estampa al crear el
 * mueble, así que un checkout guardado ANTES de que la bandera existiera no la
 * tiene — y `rentable` ausente significa alquilable. O sea: todas las cajas de
 * los planos viejos seguían contando como espacio vendible, aparecían en «qué
 * queda por vender» y podían recibir un contrato. Mirando el tipo, esos planos
 * quedan bien sin migrar nada.
 *
 * Son los tipos con `alquilable: "nunca"` en el catálogo de muebles
 * (`catalogo/muebles.json`): columna, caja y servicio al cliente. El servidor
 * lee lo mismo de su copia (`backend/app/services/catalogo_muebles.py`).
 */
export const NUNCA_ALQUILABLE: ReadonlySet<string> = new Set<string>(tiposQueSeAlquilan("nunca"));

/** Fixture types that are infrastructure by nature — never rented to a supplier.
 *  Used as the default when a fixture is first created.
 *
 *  Los de `NUNCA_ALQUILABLE` entran acá también, para que el mueble nazca con
 *  la bandera puesta y el dato guardado diga lo mismo que la regla. La `metro`
 *  —la zona libre— es el único que sí se puede dar vuelta a mano: un metro de
 *  piso SÍ se le alquila a una marca para que plante su stand. En el catálogo
 *  es `alquilable: "no_por_defecto"`. */
export const NON_RENTABLE_BY_DEFAULT: ReadonlySet<string> = new Set<string>(
  tiposQueSeAlquilan("no_por_defecto", "nunca"),
);

/** True when the fixture can hold a commercial contract.
 *
 *  Dos preguntas, en orden. Primero el TIPO: hay muebles que son operación de
 *  la tienda y no se venden nunca (ver `NUNCA_ALQUILABLE`). Después la
 *  bandera, que es por mueble y la maneja quien arma el plano.
 *
 *  La bandera es retrocompatible a propósito: los muebles guardados antes de
 *  que existiera no la traen, y todos ésos tienen que seguir siendo
 *  alquilables. Sólo un `false` explícito marca infraestructura. El tipo tapa
 *  ese hueco justo donde importaba: una caja vieja sin bandera.
 */
export function isRentable(f: { type?: string; rentable?: boolean }): boolean {
  if (f.type && NUNCA_ALQUILABLE.has(f.type)) return false;
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

/** La clave de tarifa de cada tipo (y de los nombres viejos del 2D), del
 *  catálogo de muebles. Un `Map` y no un objeto: un tipo escrito a mano en un
 *  plano no puede caer en `toString` ni en `constructor`. */
const TARIFA_POR_TIPO: ReadonlyMap<string, string> = new Map(Object.entries(tarifaPorTipo()));

/** Rate-table key for a fixture. `negotiatedValue` is per face/contract, so
 *  double and wall gondolas (and the legacy 2D-only type names) share one
 *  per-face "gondola" rate instead of three diverging ones. Sale de `tarifa`
 *  en el catálogo de muebles; lo que no tiene tarifa —lo que no se vende, un
 *  tipo que el catálogo no conoce— contesta su propio tipo, como siempre. */
export function rateTypeOf(f: { type: string }): string {
  return TARIFA_POR_TIPO.get(f.type) ?? f.type;
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
 *  de tabla. Ninguna clave cambió: se cambia sólo lo que se lee.
 *
 *  Acá SÓLO va lo que se vende. Los muebles que son operación de la tienda
 *  —columna, caja registradora, servicio al cliente— no llevan tarifa: ver
 *  `NUNCA_ALQUILABLE`. La caja estaba listada como «Cabecera de caja» y eso
 *  era ofrecer un precio por algo que no está a la venta. La zona libre sí
 *  queda: un metro de piso se le alquila a una marca para su stand.
 *
 *  Es `tarifas` del catálogo de muebles. Con él, dos rótulos dejaron de
 *  cruzarse con los nombres de los muebles: la `isla` —que en los editores se
 *  dibuja como la estiba de piso— decía «Isla», y es «Estiba (exhibición de
 *  piso)»; la `cross` —el exhibidor en cruz— decía «Exhibición de piso», y es
 *  «Exhibidor cruz». Los informes las nombran igual («estiba», «exhibidor
 *  cruz»): la sesión manda a cargar la tarifa por ese nombre, y
 *  `probar-catalogo.mjs` falla si un nombre de informe lleva a la fila de otro
 *  mueble. Las claves no cambiaron: son las de las tarifas guardadas. */
export const RATE_TYPES: { type: string; label: string }[] =
  CATALOGO_DE_MUEBLES.tarifas.map((t) => ({ type: t.clave, label: t.rotulo }));

/** La familia comercial de cada tipo. Es el vocabulario que ya usa la
 *  biblioteca del plano (FloorPlan2D): góndolas, displays, muebles,
 *  refrigeración, frescos. Sirve para contestar «qué me queda por vender»
 *  agrupado, sin inventar un campo de zona que el mueble no tiene. Es
 *  `categoria` en el catálogo de muebles; lo que no la tiene es «Otros». */
export const CATEGORIA_DE_TIPO: Record<string, string> = categoriasDeTipo();

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

  /** EL NOMBRE VIEJO. Ya no es un nombre: es un recuerdo, y es de sólo lectura.
   *
   *  Durante meses un mueble tuvo dos nombres —el `code`, que es la llave, y
   *  esta `nomenclatura`, texto libre que lo reemplazaba **en la pantalla**— y
   *  nada obligaba a que coincidieran. De ahí salió que un contrato terminara
   *  en el mueble equivocado: quien leía el plano escribía el nombre dibujado y
   *  el sistema resolvía por el código. Ahora hay uno solo y es el `code`:
   *  renombrar un mueble edita su nombre, que es su código.
   *
   *  El campo sigue viajando en el JSON del layout —el servidor lo guarda— y
   *  sirve para exactamente dos cosas: que buscar por lo que dice la cartelería
   *  vieja de la tienda siga encontrando el mueble, y que la reconciliación
   *  pueda listar los contratos que se negociaron mirando ese texto. Nadie lo
   *  escribe desde la pantalla y nada lo dibuja. Ver `nombreDeMueble`,
   *  `nombreAnterior` y `renombrar` en `utils/nomenclatura.ts`, que son la
   *  regla y están probadas. */
  nomenclatura?: string;

  /** Cómo se llamaba este mueble ANTES DE LA PRIMERA renumeración.
   *
   *  Es la punta más vieja de la cadena, no la penúltima: la pregunta real es
   *  «qué dice el papel que tengo en la mano», y un nombre intermedio de una
   *  segunda corrida nunca estuvo escrito en una pared. La cadena completa vive
   *  en el servidor para quien la quiera entera.
   *
   *  Lo escribe el servidor al renumerar, que es cuando el nombre de un mueble
   *  cambia sin que nadie lo haya tecleado: sin este dato, el papel que firmó el
   *  proveedor y el cartel de la góndola quedan nombrando algo que ya no existe
   *  y no hay con qué reconciliarlos. Es de sólo lectura y nada lo dibuja — el
   *  mueble se llama por su `code` y por nada más. Se arrastra tal cual en los
   *  dos editores para no perderlo al abrir el plano.
   *
   *  Reemplaza a `nomenclatura` en este papel: aquélla el servidor la sigue
   *  leyendo como nombre dibujado, así que no puede sobrevivir a la
   *  renumeración. Ver `nombreAnterior` en `utils/nomenclatura.ts`. */
  nombreAnterior?: string;

  /** Physical assembly of face A — see FaceData.mountedAt. */
  mountedAt?: string;
  mountedBy?: string;

  /** Second face of a double gondola (`carasDe(f) === 2`).
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
