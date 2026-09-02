import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  RefreshCw,
  Building2,
  Plus,
  X,
  FileText,
  ChevronRight,
  Search,
  SlidersHorizontal,
  CalendarRange,
  ChevronDown,
  Handshake,
  FileSpreadsheet,
  Box,
} from "lucide-react";
import { useFixtureStore, selectFixtures } from "../store/fixtureStore";
import { useAuthStore, selectIsAdmin } from "../store/authStore";
import client from "../api/client";
import { listSpaceFiles, type SpaceFileMeta } from "../api/files";
import FileViewerModal from "../components/FileViewerModal";
import {
  fetchMounts, latestByCode, estadoMontaje, MOTIVO_LABEL,
  type MountConfirmation, type MountMotivo,
} from "../api/mounts";
import RatesModal from "../components/RatesModal/RatesModal";
import type { Space } from "../types";
import {
  contractPhase,
  daysTakenInRange,
  footprint2D,
  fullSpaceCode,
  isDoubleGondola as isDoubleGondolaShared,
  isRentable,
  rangeAvailability,
  rateTypeOf,
  referenceRateFor,
  rateTypeLabel,
} from "../types/fixtures";
import type {
  UnifiedFixture, SpaceStatus, FaceData, RangeAvailability,
} from "../types/fixtures";
import SeasonPicker, { describeRange, hoyComoRango, type DateRange } from "../components/SeasonPicker/SeasonPicker";
import Libera from "../components/Libera/Libera";
import ModoVender from "../components/Contrato/ModoVender";
import type { ResumenContrato } from "../components/Contrato/Contrato";
import Planometria from "../components/Contrato/Planometria";
import CancelarContrato from "../components/Contrato/CancelarContrato";
import CargaMasiva from "../components/CargaMasiva/CargaMasiva";
import { inclusiveDays, toISODate, upcomingSeasons } from "../types/seasons";
/* El parte —la zona superior escrita en prosa— salió de las dos pantallas.
   En Supervisar lo reemplaza la franja de cinco cifras: quien pone el canon no
   necesita que se le explique el negocio, necesita el dato a mano. En Vender
   lo reemplazan la escalera y el panel de tarifas, que contestan la misma
   pregunta con la fecha adentro.

   La redacción que lo armaba —`utils/parte.ts`, `utils/redaccion.ts` y
   `components/Parte/`, con sus dos suites— no viene a esta rama: cuatrocientas
   líneas que no importa nadie, más dos suites que las prueban, se leen como
   código vivo hasta que alguien pierde media hora averiguando que no lo es.
   Quedan en la historia de `claude/retail-espacios-continue-jdn085`, que es
   donde hay que ir a buscarlas si el parte vuelve. */
import { nombreDeMueble } from "../utils/nomenclatura";
import { fechaEnCurso } from "../utils/propuesta";

// ─── Date / money helpers ────────────────────────────────────────────────────

function daysUntil(dateStr: string): number {
  // Parse both sides as local date components to avoid UTC-vs-local off-by-one.
  const [y, m, d] = dateStr.split("-").map(Number);
  const target = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

function formatCOP(n: number): string {
  if (!n) return "—";
  return "$" + n.toLocaleString("es-CO");
}

/** "$1,4 M" / "$850 k" — for narrow columns where full amounts collide. */
function compactCOP(n: number): string {
  if (!n) return "—";
  if (n >= 995_000) {
    return "$" + (n / 1e6).toLocaleString("es-CO", { maximumFractionDigits: 1 }) + " M";
  }
  if (n >= 1_000) return "$" + Math.round(n / 1e3).toLocaleString("es-CO") + " k";
  return "$" + n.toLocaleString("es-CO");
}

const MONTHS_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function formatDate(s: string): string {
  if (!s) return "—";
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d || m < 1 || m > 12) return s;
  return `${d} ${MONTHS_ES[m - 1]} ${y}`;
}

/** Compact contract period for one-line rows: "8 jul → 15 jul 2026". */
function formatRange(start: string, end: string): string {
  if (!start && !end) return "—";
  const short = (s: string) => {
    const [, m, d] = s.split("-").map(Number);
    return d && m >= 1 && m <= 12 ? `${d} ${MONTHS_ES[m - 1]}` : s;
  };
  return `${start ? short(start) : "—"} → ${end ? formatDate(end) : "—"}`;
}

// ─── Faces (a double gondola counts as 2 rentable units) ─────────────────────

interface FaceEntry {
  fixture: UnifiedFixture;
  face: "A" | "B";
  /** Backend Space code: face A = full fixture code, face B = code + "-B". */
  code: string;
  status: SpaceStatus;
  supplierName: string;
  brandCategory: string;
  negotiatedValue: number;
  startDate: string;
  endDate: string;
  observation: string;
}

/** Shared check (undefined gondolaType counts as double) + legacy
 *  "gondola_doble" type kept for old persisted layouts. */
function isDoubleGondola(f: UnifiedFixture): boolean {
  return isDoubleGondolaShared(f) || (f.type as string) === "gondola_doble";
}

const EMPTY_FACE: FaceData = {
  supplierName: "", brandCategory: "", negotiatedValue: 0,
  startDate: "", endDate: "", observation: "", status: "free",
};

function facesOf(f: UnifiedFixture): FaceEntry[] {
  const faceA: FaceEntry = {
    fixture: f, face: "A", code: f.code,
    status: f.status,
    supplierName: f.supplierName, brandCategory: f.brandCategory,
    negotiatedValue: f.negotiatedValue,
    startDate: f.startDate, endDate: f.endDate, observation: f.observation,
  };
  if (!isDoubleGondola(f)) return [faceA];
  const b = f.faceB ?? EMPTY_FACE;
  return [
    faceA,
    {
      fixture: f, face: "B", code: `${f.code}-B`,
      status: b.status,
      supplierName: b.supplierName, brandCategory: b.brandCategory,
      negotiatedValue: b.negotiatedValue,
      startDate: b.startDate, endDate: b.endDate, observation: b.observation,
    },
  ];
}

/** El código como se LEE, no como se guarda.
 *
 *  Una góndola doble guarda la cara A con el código pelado (`GON-60`) y la B
 *  con sufijo (`GON-60-B`), porque así se llaman los espacios en la base. En
 *  pantalla eso queda asimétrico: dos filas contiguas, una «GON-60» y otra
 *  «GON-60-B», y hay que deducir que la primera es una cara y no el mueble
 *  entero. Se muestran `GON-60·A` y `GON-60·B`, que es como las nombra
 *  cualquiera que las esté mirando. El código de la base no se toca: es el que
 *  viaja a la API y en los enlaces de los correos. */
function codigoVisible(entry: FaceEntry): string {
  if (!isDoubleGondola(entry.fixture)) return entry.code;
  return entry.face === "B" ? `${entry.fixture.code}·B` : `${entry.fixture.code}·A`;
}

/** Una cara que se puede ofrecer en el periodo elegido. */
interface Disponible {
  code: string;
  fixture: UnifiedFixture;
  face: "A" | "B";
  /** El primer día en que queda libre. Ausente = libre desde el arranque. */
  desde?: Date;
}

/** Desde cuándo se puede ofrecer una cara que está tomada parte del periodo.
 *
 *  Se cuenta día por día en vez de sumarle uno a la fecha de fin del contrato,
 *  que es lo que uno escribiría primero: esa cuenta se equivoca en los dos
 *  casos que de verdad aparecen —un contrato que ARRANCA en el medio de la
 *  ventana, donde el día libre es el primero y no el último, y una cara con dos
 *  contratos que dejan un hueco entre medio—. Son 31 días y cinco caras: la
 *  cuenta directa cuesta nada y no puede estar mal. */
function primerDiaLibre(
  face: { status: SpaceStatus; startDate?: string; endDate?: string },
  from: Date,
  to: Date,
): Date | undefined {
  const dia = 86_400_000;
  const d0 = new Date(from); d0.setHours(0, 0, 0, 0);
  const fin = new Date(to); fin.setHours(0, 0, 0, 0);
  for (let t = d0.getTime(); t <= fin.getTime(); t += dia) {
    const d = new Date(t);
    if (daysTakenInRange(face, d, d) === 0) return d;
  }
  return undefined;
}

/** Faces that take part in the COMMERCIAL picture.
 *
 *  A non-rentable fixture (a column, a checkout, a free zone) is part of the
 *  store but is not sellable space, so it must not inflate the totals, dilute
 *  the occupancy percentage or turn up as an available space in search. It is
 *  still drawn on the map — see `facesOf`, which every render path uses. */
function commercialFacesOf(f: UnifiedFixture): FaceEntry[] {
  return isRentable(f) ? facesOf(f) : [];
}

/** Cuántos días atrás sigue teniendo sentido reclamar un montaje sin reportar.
 *
 *  Pasado ese plazo el espacio está armado hace rato y lo que falta es el
 *  papel, no la exhibición. */
const VENTANA_MONTAJE_DIAS = 30;

// ─── Display status (used by the table) ──────────────────────────────────────

type DisplayStatus =
  | "active" | "committed" | "expiring" | "expired" | "no_contract"
  | "reserved" | "maintenance" | "free";

/** Reading of one face TODAY.
 *
 *  `committed` is the state that used to be missing: a contract that is signed
 *  but has not started yet. Without it, booking a December end-cap in August
 *  painted the space occupied for four months — the plan said "taken" while
 *  the backend would happily have sold those months to someone else. */
function displayStatus(f: { status: SpaceStatus; startDate?: string; endDate: string }): DisplayStatus {
  if (f.status === "free")        return "free";
  if (f.status === "reserved")    return "reserved";
  if (f.status === "maintenance") return "maintenance";
  if (f.status !== "occupied")    return "free";
  const phase = contractPhase(f);
  if (phase === "sin_contrato")   return "no_contract";
  if (phase === "pendiente")      return "committed";
  if (phase === "vencido")        return "expired";
  // Running with a start date but no end: an open-ended contract, not a
  // missing one. Calling it "no_contract" here contradicted contractPhase,
  // which already counted its money as current revenue, and polluted the
  // very alert meant to surface spaces occupied without paperwork.
  if (!f.endDate)                 return "active";
  return daysUntil(f.endDate) <= 30 ? "expiring" : "active";
}

/** Cada estado con su terna: color de tinta, fondo tintado y borde.
 *
 *  `fill` estaba declarado desde siempre y no lo usaba nadie: la pastilla de
 *  estado salía del MISMO fondo para los ocho, y lo único que cambiaba era un
 *  punto de 6 px. Un «Vencido» y un «Activo» se veían iguales de reojo, que es
 *  justo como se mira una tabla de 126 filas.
 *
 *  Fondo tintado MÁS borde —y no fondo solo— es el patrón que usan los
 *  tableros comerciales que se ven caros; el borde es lo que le da el canto y
 *  evita que la pastilla se disuelva contra la fila. */
const STATUS_META: Record<
  DisplayStatus,
  { ring: string; fill: string; edge: string; label: string }
> = {
  active:      { ring: "var(--success)",      fill: "var(--success-50)", edge: "var(--success-100)", label: "Activo" },
  committed:   { ring: "var(--accent-700)",   fill: "var(--accent-50)",  edge: "var(--accent-100)",  label: "Contratado" },
  expiring:    { ring: "var(--warning)",      fill: "var(--warning-50)", edge: "var(--warning-100)", label: "Por vencer" },
  expired:     { ring: "var(--danger)",       fill: "var(--danger-50)",  edge: "var(--danger-100)",  label: "Vencido" },
  no_contract: { ring: "var(--danger)",       fill: "var(--danger-50)",  edge: "var(--danger-100)",  label: "Sin contrato" },
  reserved:    { ring: "var(--warning)",      fill: "var(--warning-50)", edge: "var(--warning-100)", label: "Reservado" },
  maintenance: { ring: "var(--muted-status)", fill: "var(--surface-3)",  edge: "var(--line)",        label: "Mantenim." },
  free:        { ring: "var(--ink-3)",        fill: "var(--surface-2)",  edge: "var(--line)",        label: "Libre" },
};

// ─── Map search + status filter (product geolocation) ────────────────────────

/** Los filtros que comparten el plano y la tabla.
 *
 *  `sin_montar` no sale del estado del contrato sino de los reportes del
 *  mercaderista, así que es el único que necesita un dato de afuera: quien
 *  filtra pasa el conjunto de caras sin reportar. Está acá y no en una lista
 *  aparte porque es una de las cuatro preguntas que se le hacen a esta tabla,
 *  y tener tres filtros en un lugar y el cuarto en otro es de las cosas que
 *  obligan a aprenderse la pantalla. */
type MapFilter =
  | "todos" | "free" | "occupied" | "committed" | "expiring" | "expired"
  | "sin_montar";


/** Accent- and case-insensitive comparison base. */
function normalizeText(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** `q` must already be normalized. Checks face fields plus fixture identity. */
function faceMatchesQuery(entry: FaceEntry, q: string): boolean {
  return [
    entry.brandCategory,
    entry.supplierName,
    entry.fixture.label,
    entry.fixture.nomenclatura ?? "",
    entry.code,
  ].some((s) => s && normalizeText(s).includes(q));
}

function faceMatchesFilter(
  entry: FaceEntry,
  filter: MapFilter,
  /** Claves `${fixture.id}-${face}` de las caras contratadas y sin reportar. */
  sinMontar?: Set<string>,
): boolean {
  if (filter === "todos") return true;
  if (filter === "sin_montar") {
    return sinMontar ? sinMontar.has(`${entry.fixture.id}-${entry.face}`) : false;
  }
  const ds = displayStatus(entry);
  // "Ocupados" means earning today. A committed-but-not-started contract is
  // neither occupied nor available, so it answers to its own chip.
  if (filter === "occupied") return ds === "active" || ds === "expiring";
  if (filter === "committed") return ds === "committed";
  if (filter === "free") return ds === "free";
  if (filter === "expiring") return ds === "expiring";
  return ds === "expired";
}

/** Per-fixture face flags (aligned with facesOf order) + matched-face count. */
interface MapMatch {
  faceFlags: Map<string, boolean[]>;
  count: number;
}

// ─── Card shell ───────────────────────────────────────────────────────────────

/** Un panel. Blanco sobre el papel, una línea de 1px y 3px de esquina.
 *
 *  No lleva sombra: separar con una línea dice dónde termina una cosa y
 *  empieza otra sin fingir profundidad. Es la única caja del sistema —el mapa,
 *  el contrato, la tabla y los pendientes son todos esto—, y por eso ninguno
 *  se lee como «el widget importante»: la jerarquía la dan el tamaño y la
 *  posición, no el peso del borde. */
function Card({
  children,
  style = {},
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--line)",
        borderRadius: "var(--r-xl)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ─── Encabezado de panel ──────────────────────────────────────────────────────

/** Título, aclaración y lo que vaya a la derecha, todos sobre la misma línea
 *  de base.
 *
 *  Sin línea divisoria abajo: el encabezado y su contenido son la misma cosa,
 *  y una regla entre los dos los parte en dos bloques que hay que volver a
 *  juntar leyendo. El aire alcanza para separarlos.
 *
 *  El ícono se fue. Había un triangulito, una flechita y una lupa —uno por
 *  panel— y ninguno decía nada que el título no dijera; es el patrón que se
 *  pone cuando hay que llenar un renglón. */
function CardHeader({
  title,
  sub,
  right,
}: {
  title: string;
  sub?: React.ReactNode;
  /** La zona derecha: la clave del plano, los chips de filtro, «al mes». */
  right?: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex", alignItems: "baseline", gap: 12,
        padding: "11px 15px 9px", flexShrink: 0,
      }}
    >
      <h2 style={{
        fontSize: 14.5, fontWeight: 700, letterSpacing: "-0.005em",
        color: "var(--ink-1)", margin: 0, whiteSpace: "nowrap", flexShrink: 0,
      }}>
        {title}
      </h2>
      {/* El subtítulo es lo primero que cede. Sin esto el título se partía en
          dos renglones antes de que la aclaración soltara un solo píxel — y el
          título es lo único de este renglón que no se puede leer a medias. */}
      {sub && (
        <span style={{
          fontSize: 12, color: "var(--ink-3)", minWidth: 0,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {sub}
        </span>
      )}
      {right && (
        <div style={{
          marginLeft: "auto", display: "flex", alignItems: "center", gap: 14,
          flexWrap: "wrap", justifyContent: "flex-end",
          fontSize: 12, color: "var(--ink-3)", flexShrink: 0,
        }}>
          {right}
        </div>
      )}
    </div>
  );
}

// ─── Stat card (headline metrics) ────────────────────────────────────────────

/** One headline number. `meter` (0-100) draws a progress bar under the value —
 *  used for occupancy, where the ratio matters more than the raw count.
 *  `note` is a second fact on its own line: `sub` sits inline beside the value
 *  and a long one breaks across three lines in a card this narrow. */
// ─── Isometric occupancy map (hero) ──────────────────────────────────────────

const S = 14;

function iso(x: number, z: number, y: number): [number, number] {
  return [(x - z) * 0.866 * S, (x + z) * 0.5 * S - y * S * 0.55];
}

function darken(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * (1 - amt));
  const g = Math.round(((n >> 8) & 255) * (1 - amt));
  const b = Math.round((n & 255) * (1 - amt));
  return `rgb(${r},${g},${b})`;
}

/** What the map paints, keyed on the READING of the face rather than its
 *  stored status — so the plan tells the same story as the cards.
 *
 *  Esta lectura —«qué pasa HOY»— tiene siete clases, y siete clases es más de
 *  lo que el color solo puede sostener: en la escala anterior `free` contra
 *  `maintenance` daba ΔE 3.6 en deuteranopía. La maqueta resolvió eso sin
 *  arreglar la escala: el mapa dejó de responder por hoy. Las dos pantallas
 *  tienen SIEMPRE un periodo puesto, así que el plano pinta la lectura de tres
 *  clases —libre, se libera, tomado—, y el detalle por estado vive escrito en
 *  la tabla, donde cada fila lleva su palabra.
 *
 *  Esto queda como respaldo —el anillo del popover y la leyenda si algún día
 *  no hubiera periodo— y sale de la misma paleta de tres, sin el violeta que
 *  arrastraba del sistema anterior. */
const DISPLAY_TOP: Record<DisplayStatus, string> = {
  free:        "#00786A",
  committed:   "#17A18C",
  active:      "#8E1226",
  expiring:    "#F08519",
  expired:     "#B7364A",
  no_contract: "#B7364A",
  reserved:    "#F79E45",
  maintenance: "#9AA3A7",
};

function topColorFor(face: FaceEntry): string {
  return DISPLAY_TOP[displayStatus(face)];
}

/** Colours for the "available for this period" reading, which answers a
 *  different question than "what is happening today" and therefore uses its
 *  own three-way scale: sellable, negotiable, taken.
 *
 *  Verde se puede, naranja a medias, rojo no. El rojo es OSCURO a propósito:
 *  cuando el tono se colapsa —un deuteranope no separa rojo de verde por
 *  color— lo que queda es la luminosidad, y un rojo claro contra un verde
 *  medio se vuelven el mismo bloque. Medida con la misma cuenta, esta terna
 *  separa mejor que la que estaba desplegada en TODOS los pares: el peor par
 *  pasa de 13,5 a 19,9 en dicromacia y de 27,4 a 33,8 en visión normal.
 *
 *  Antes de mover uno hay que volver a correr la cuenta sobre los cinco
 *  colores del plano —los tres estados, el cuerpo y lo no comercializable—.
 *  Que «se vean distintos» no es evidencia. */
const RANGE_TOP: Record<RangeAvailability, string> = {
  libre: "#00786A",
  parcial: "#F08519",
  tomado: "#8E1226",
};

const RANGE_LABEL: Record<RangeAvailability, string> = {
  libre: "Libre todo el periodo",
  // Decía «Libre parte del periodo», que nombra el estado. «Se libera en el
  // periodo» nombra el HECHO, que es lo que se está por vender: dentro de esta
  // ventana esa cara queda disponible, y esa es la razón para mirarla.
  parcial: "Se libera en el periodo",
  tomado: "Tomado",
};

/** Infrastructure on the isometric map: present, but visibly not for sale.
 *
 *  La distinción que carga el peso no es este gris contra el del cuerpo —es
 *  color contra ausencia de color: un mueble comercializable SIEMPRE tiene la
 *  tapa pintada de un estado, y uno que no se alquila está gris entero—. Aun
 *  así los dos grises se separan más que los que estaban desplegados (7,0
 *  contra 4,1), y el orden es el correcto: la infraestructura es la más clara
 *  y se va al fondo, el mueble que se vende es más oscuro y se adelanta.
 *
 *  Las caras y el contorno salen de acá por `darken()`, así que el prisma
 *  sigue leyéndose en tres dimensiones y no queda una silueta plana. */
const NON_RENTABLE_TOP = "#E4E8E9";

/** El material del mueble. El cuerpo no toma el color del estado: se queda en
 *  el gris del acero y el color va en la CARA, que es lo que de verdad se
 *  vende. Una góndola doble con la cara A libre y la B tomada se veía toda
 *  roja; así se ve el mueble, y el rojo sólo en el lado que está tomado. */
const CUERPO = "#C4CBCE";
const CUERPO_LN = "#9AA3A7";
const NON_RENTABLE_LABEL = "Resto de la sala";

function pts(...points: [number, number][]): string {
  return points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
}

export interface MapAnchor {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Cuántos rótulos se dibujan sobre el plano.
 *
 *  `todos` es Vender: el plano ES el directorio —se busca un espacio para
 *  ofrecerlo— y hay que poder leer los códigos sin tocar nada.
 *
 *  `elegido` es Supervisar: ahí la tabla de abajo ya lista las veintitrés
 *  caras con su código, su estado y su plata, así que el plano no es un
 *  directorio sino un UBICADOR — contesta «¿dónde queda ésta?»— y le alcanza
 *  con rotular la fila que está abierta. De paso resuelve un problema de
 *  medida: veintitrés rótulos en un panel de 700 px caen a un cuerpo ilegible,
 *  y sacarlos deja lugar para agrandar el que importa. */
type Rotulos = "todos" | "elegido";

interface IsoMapProps {
  fixtures: UnifiedFixture[];
  /** Los muebles marcados. En Supervisar es uno —el que se está mirando—; en
   *  Vender son todos los que van en el contrato que se está armando. */
  selectedIds: string[];
  /** `point` is relative to the map wrapper, and carries the wrapper's own
   *  size so the popover can flip sides and stay inside the card. */
  onSelect: (f: UnifiedFixture | null, point?: MapAnchor) => void;
  /** Active search/filter result — null when no query or filter applies. */
  match: MapMatch | null;
  /** When set, faces are painted by availability over this period instead of
   *  by what is happening today. */
  range: DateRange | null;
  rotulos?: Rotulos;
  /** ¿La cámara se acerca al mueble elegido?
   *
   *  En Supervisar sí: se abre UNA fila de la tabla y la pregunta es dónde
   *  queda. En Vender no, y no es una preferencia: ahí tocar un espacio lo suma
   *  al contrato, así que el gesto siguiente es tocar OTRO — y acercarse al
   *  primero esconde justamente los que faltan elegir. */
  enfocar?: boolean;
}

function IsoMap({
  fixtures, selectedIds, onSelect, match, range,
  rotulos = "todos", enfocar = true,
}: IsoMapProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number; title: string; sub: string } | null>(null);

  const scene = useMemo(() => {
    if (fixtures.length === 0) return null;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const addPt = ([x, y]: [number, number]) => {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    };

    // Ground plate covering the plan footprint + 1 m margin
    const gx0 = Math.min(...fixtures.map((f) => f.cx - f.w / 2)) - 1;
    const gx1 = Math.max(...fixtures.map((f) => f.cx + f.w / 2)) + 1;
    const gz0 = Math.min(...fixtures.map((f) => f.cz - f.d / 2)) - 1;
    const gz1 = Math.max(...fixtures.map((f) => f.cz + f.d / 2)) + 1;
    const groundPts: [number, number][] = [
      iso(gx0, gz0, 0), iso(gx1, gz0, 0), iso(gx1, gz1, 0), iso(gx0, gz1, 0),
    ];
    groundPts.forEach(addPt);

    // Painter's algorithm: draw back-to-front
    const sorted = [...fixtures].sort((a, b) => a.cx + a.cz - (b.cx + b.cz));

    const prisms = sorted.map((f) => {
      // La huella va con el giro aplicado. Sin esto, una góndola rotada un
      // cuarto de vuelta —un pasillo cruzado, que es común— se dibujaba
      // atravesada respecto del plano real.
      const fp = footprint2D(f);
      const x0 = f.cx - fp.w / 2, x1 = f.cx + fp.w / 2;
      const z0 = f.cz - fp.d / 2, z1 = f.cz + fp.d / 2;
      const h = Math.max(f.h || 1, 0.4);

      const tA = iso(x0, z0, h), tB = iso(x1, z0, h);
      const tC = iso(x1, z1, h), tD = iso(x0, z1, h);
      const bB = iso(x1, z0, 0), bC = iso(x1, z1, 0), bD = iso(x0, z1, 0);
      [tA, tB, tC, tD, bB, bC, bD].forEach(addPt);

      const rentable = isRentable(f);
      // A non-rentable fixture is drawn as one neutral block: no face split, no
      // commercial hue.
      const double = isDoubleGondola(f) && rentable;
      const faces = facesOf(f);
      const paint = (face: FaceEntry) =>
        range ? RANGE_TOP[rangeAvailability(face, range.from, range.to)] : topColorFor(face);
      const topA = rentable ? paint(faces[0]) : NON_RENTABLE_TOP;
      const topB = rentable && faces[1] ? paint(faces[1]) : NON_RENTABLE_TOP;
      // La cara que da al frente en isométrico: cuando el mueble es más ancho
      // que hondo el corte va por Z y la mitad de adelante es la B; si es más
      // hondo que ancho el corte va por X y la B queda a la derecha. El otro
      // lado visible es la tapa, que no se vende y va del color del material.
      // Sobre la huella GIRADA, no sobre las medidas crudas. El prisma se
      // dibuja con `fp`, así que preguntarle a `f.w`/`f.d` por el eje largo
      // deja el color en la cara equivocada en todo mueble rotado un cuarto
      // de vuelta —un pasillo cruzado, que es común.
      const anchoManda = fp.w >= fp.d;
      const cuerpo = rentable ? CUERPO : NON_RENTABLE_TOP;
      const caraFrente = double ? topB : topA;
      const pintaCara = rentable ? caraFrente : cuerpo;
      const sideL = anchoManda ? darken(pintaCara, 0.14) : darken(cuerpo, 0.14);
      const sideR = anchoManda ? darken(cuerpo, 0.26) : darken(pintaCara, 0.26);
      const stroke = rentable ? CUERPO_LN : darken(NON_RENTABLE_TOP, 0.42);

      // Top face — split into two halves for double gondolas
      const mitad = (color: string, esquinas: [number, number][]) => ({
        color,
        points: pts(...esquinas),
        cx: esquinas.reduce((a, q) => a + q[0], 0) / esquinas.length,
        cy: esquinas.reduce((a, q) => a + q[1], 0) / esquinas.length,
      });
      let topHalves: { color: string; points: string; cx: number; cy: number }[];
      if (double) {
        if (anchoManda) {
          const zm = (z0 + z1) / 2;
          topHalves = [
            mitad(topA, [iso(x0, z0, h), iso(x1, z0, h), iso(x1, zm, h), iso(x0, zm, h)]),
            mitad(topB, [iso(x0, zm, h), iso(x1, zm, h), iso(x1, z1, h), iso(x0, z1, h)]),
          ];
        } else {
          const xm = (x0 + x1) / 2;
          topHalves = [
            mitad(topA, [iso(x0, z0, h), iso(xm, z0, h), iso(xm, z1, h), iso(x0, z1, h)]),
            mitad(topB, [iso(xm, z0, h), iso(x1, z0, h), iso(x1, z1, h), iso(xm, z1, h)]),
          ];
        }
      } else {
        topHalves = [mitad(topA, [tA, tB, tC, tD])];
      }

      // Label above the prism — small unlabeled fixtures still get one while matched.
      //
      // Sólo lo comercializable. Una sala tiene sesenta góndolas de pared, una
      // fila de cajas y las columnas; rotularlas llenaba el plano de códigos
      // de cosas que no se venden y enterraba los veintitrés que sí. El resto
      // de la sala es el CONTEXTO donde está lo que se vende, y el contexto no
      // se rotula: se dibuja.
      const area = f.w * f.d;
      const defaultVisible = rentable && (Boolean(f.nomenclatura) || area > 1.5);
      const labelText = rentable ? nombreDeMueble(f) : "";
      const [lcx, lcy] = iso(f.cx, f.cz, h);
      const label = labelText ? { text: labelText, x: lcx, y: lcy, defaultVisible } : null;
      if (label) addPt([label.x, label.y - 8]);

      // Asking about a period changes the question the tooltip should answer:
      // not "who is here" but "can I sell this, and if not, how much of it".
      const rangeSub = (face: FaceEntry) => {
        if (!range) return face.supplierName || "Sin proveedor";
        // A column or a checkout is not for sale, so it must never answer
        // "libre los 24 días" — the colour already excludes it, the words
        // have to as well.
        if (!rentable) return NON_RENTABLE_LABEL;
        const total = inclusiveDays(range.from, range.to);
        const taken = daysTakenInRange(face, range.from, range.to);
        if (taken <= 0) return `libre los ${total} día${total === 1 ? "" : "s"}`;
        if (taken >= total) return `tomado${face.supplierName ? ` · ${face.supplierName}` : ""}`;
        return `libre ${total - taken} de ${total} días`;
      };
      const tooltipSub = double
        ? `A: ${rangeSub(faces[0])} · B: ${faces[1] ? rangeSub(faces[1]) : "—"}`
        : rangeSub(faces[0]);

      // Dónde cae el mueble ya proyectado, para poder encuadrarlo.
      const proy = [tA, tB, tC, tD, bB, bC, bD];
      const ex0 = Math.min(...proy.map((q) => q[0])), ex1 = Math.max(...proy.map((q) => q[0]));
      const ey0 = Math.min(...proy.map((q) => q[1])), ey1 = Math.max(...proy.map((q) => q[1]));
      const foco = {
        x: (ex0 + ex1) / 2,
        y: (ey0 + ey1) / 2,
        r: Math.max(ex1 - ex0, ey1 - ey0, 1) / 2,
      };

      return {
        f,
        foco,
        topHalves,
        // Visible sides: the z1 face (front-left) and the x1 face (front-right)
        left:  pts(tD, tC, bC, bD),
        right: pts(tB, bB, bC, tC),
        sideL, sideR, stroke,
        topOutline: pts(tA, tB, tC, tD),
        label,
        tooltipSub,
      };
    });

    const pad = 26;
    const vb = {
      x: minX - pad, y: minY - pad,
      w: maxX - minX + pad * 2, h: maxY - minY + pad * 2,
    };
    return {
      prisms,
      groundPts: pts(...groundPts),
      vb,
      viewBox: `${vb.x.toFixed(1)} ${vb.y.toFixed(1)} ${vb.w.toFixed(1)} ${vb.h.toFixed(1)}`,
    };
  }, [fixtures, range]);

  if (!scene) return null;

  // Al elegir un mueble el mapa se le acerca. `k` es cuánto se agranda; todo
  // lo que tiene que seguir midiendo lo mismo en pantalla —rótulos, anillos,
  // las pastillas de cara— se divide por él.
  // La cámara se acerca SÓLO cuando hay un mueble elegido. Con dos o más
  // —un contrato sobre varias puntas— acercarse a uno esconde al resto y, peor,
  // esconde los que todavía faltan tocar. Ahí el trabajo es seguir eligiendo
  // sobre el plano entero.
  const enfocado = enfocar && selectedIds.length === 1
    ? scene.prisms.find((q) => q.f.id === selectedIds[0])?.foco ?? null
    : null;
  // El tope importa más que la fórmula. Estaba en 3.4 y era demasiado: a esa
  // distancia se ven cuatro muebles y el resto de la sala queda afuera, así que
  // el plano deja de contestar «dónde queda esto» —que es su único trabajo— y
  // pasa a ser un primer plano de un prisma. Con 1.9 el mueble se distingue y
  // el pasillo entero sigue en pantalla.
  const k = enfocado
    ? Math.min(1.9, Math.max(1, 0.17 * Math.min(scene.vb.w, scene.vb.h) / enfocado.r))
    : 1;
  // Sintaxis CSS, no de atributo SVG: `translate(10 20)` sin unidades ni coma
  // es válido como atributo pero inválido como propiedad, y el navegador
  // descarta la declaración entera sin decir nada.
  const camara = enfocado
    ? `translate(${(scene.vb.x + scene.vb.w / 2 - enfocado.x * k).toFixed(2)}px, ${(scene.vb.y + scene.vb.h / 2 - enfocado.y * k).toFixed(2)}px) scale(${k.toFixed(3)})`
    : "translate(0px, 0px) scale(1)";

  const handleMove = (e: React.MouseEvent, title: string, sub: string) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    setTip({ x: e.clientX - rect.left, y: e.clientY - rect.top, title, sub });
  };

  /** El lienzo toma la PROPORCIÓN DEL PLANO, no la de la tarjeta.
   *
   *  Con alto fijo el panel quedaba de 1450×430 —una ranura de 3.4:1— y el
   *  plano de esta sede es de 1.7:1, así que `meet` lo encajaba por el alto y
   *  dejaba el 55% del ancho en blanco: el dibujo se veía chico y lejos, con
   *  medio panel vacío alrededor. La proporción no se puede fijar en el código
   *  porque depende de la sede: una tienda larga y angosta y una cuadrada
   *  proyectan distinto.
   *
   *  El tope de alto existe para que una sede casi cuadrada no empuje una
   *  tarjeta de mil píxeles; el piso, para que una muy alargada no la deje
   *  como una tira. Entre los dos, el plano llena su caja. */
  const proporcion = scene.vb.w / scene.vb.h;

  return (
    <div
      ref={wrapRef}
      style={{
        position: "relative", width: "100%", margin: "0 auto",
        aspectRatio: `${scene.vb.w.toFixed(1)} / ${scene.vb.h.toFixed(1)}`,
        maxHeight: 720, minHeight: 360, display: "flex",
      }}
      data-proporcion={proporcion.toFixed(2)}
    >
      <svg
        viewBox={scene.viewBox}
        preserveAspectRatio="xMidYMid meet"
        style={{ width: "100%", height: "100%", display: "block" }}
        onClick={() => onSelect(null)}
      >
        <g
          className="mapa-camara"
          style={{
            transform: camara,
            transformBox: "view-box",
            transformOrigin: "0 0",
            transition: "transform 620ms cubic-bezier(.22,.72,.24,1)",
          }}
        >
        {/* Ground */}
        <polygon
          points={scene.groundPts}
          fill="var(--surface-2)"
          stroke="var(--line)"
          strokeWidth={0.8}
        />

        {scene.prisms.map(({ f, topHalves, left, right, sideL, sideR, stroke, topOutline, label, tooltipSub }) => {
          const hovered = hoverId === f.id;
          const selected = selectedIds.includes(f.id);
          const flags = match?.faceFlags.get(f.id);
          const matched = !match || (flags?.some(Boolean) ?? false);
          const dimmed = match !== null && !matched;
          return (
            <g
              key={f.id}
              onClick={(e) => {
                e.stopPropagation();
                const rect = wrapRef.current?.getBoundingClientRect();
                onSelect(
                  f,
                  rect
                    ? {
                        x: e.clientX - rect.left,
                        y: e.clientY - rect.top,
                        w: rect.width,
                        h: rect.height,
                      }
                    : undefined,
                );
              }}
              onMouseEnter={() => setHoverId(f.id)}
              onMouseMove={(e) => {
                // The popover already describes this one — a tooltip on top of
                // it would just be two cards saying the same thing.
                if (selected) { setTip(null); return; }
                handleMove(e, f.label || f.code, tooltipSub);
              }}
              onMouseLeave={() => {
                setHoverId(null);
                setTip(null);
              }}
              opacity={dimmed ? 0.18 : enfocado && !selected ? 0.45 : 1}
              style={{
                cursor: "pointer",
                filter: hovered ? "brightness(1.12)" : undefined,
                transition: "filter .12s, opacity .15s",
              }}
            >
              {/* Side faces */}
              <polygon points={left} fill={sideL} stroke={stroke} strokeWidth={0.5 / k} strokeLinejoin="round" />
              <polygon points={right} fill={sideR} stroke={stroke} strokeWidth={0.5 / k} strokeLinejoin="round" />
              {/* Top face (1 or 2 halves) — non-matching halves of a double dim per face */}
              {topHalves.map((th, i) => (
                <polygon
                  key={i}
                  points={th.points}
                  fill={th.color}
                  fillOpacity={match && matched && topHalves.length > 1 && flags && !flags[i] ? 0.25 : 1}
                  stroke={stroke}
                  strokeWidth={0.5 / k}
                  strokeLinejoin="round"
                />
              ))}
              {/* Match highlight — accent glow + outline */}
              {match !== null && matched && !selected && (
                <>
                  <polygon
                    points={topOutline}
                    fill="none"
                    stroke="var(--accent)"
                    strokeWidth={3.4 / k}
                    opacity={0.3}
                    strokeLinejoin="round"
                  />
                  <polygon
                    points={topOutline}
                    fill="none"
                    stroke="var(--accent)"
                    strokeWidth={1.3 / k}
                    strokeLinejoin="round"
                  />
                </>
              )}
              {/* Selection ring */}
              {selected && (
                <polygon
                  points={topOutline}
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth={1.6 / k}
                  strokeLinejoin="round"
                />
              )}
              {/* Cuál cara es cuál. Sólo al acercarse, que es cuando hay
                  espacio y cuando de verdad hace falta saberlo. */}
              {selected && k > 1.6 && topHalves.length > 1 && topHalves.map((th, i) => (
                <g key={`cara-${i}`} style={{ pointerEvents: "none" }}>
                  <circle
                    cx={th.cx} cy={th.cy} r={9 / k}
                    fill="var(--surface)" stroke={th.color} strokeWidth={2.2 / k}
                  />
                  <text
                    x={th.cx} y={th.cy + 3 / k}
                    textAnchor="middle" fontSize={9 / k} fontWeight={700}
                    fontFamily="var(--font-mono)" fill="var(--ink-1)"
                  >
                    {i === 0 ? "A" : "B"}
                  </text>
                </g>
              ))}
              {/* Floating label — always visible on matches */}
              {label
                && (rotulos === "elegido"
                      ? selected || (match !== null && matched)
                      : label.defaultVisible || (match !== null && matched))
                && !(selected && k > 1.6 && topHalves.length > 1) && (
                <text
                  x={label.x}
                  y={label.y - 7 / k}
                  textAnchor="middle"
                  fontSize={8.5 / k}
                  fontWeight={600}
                  fontFamily="var(--font-mono)"
                  fill="var(--ink-2)"
                  stroke="#FFFFFF"
                  strokeWidth={2.4 / k}
                  paintOrder="stroke"
                  style={{ pointerEvents: "none", userSelect: "none" }}
                >
                  {label.text}
                </text>
              )}
            </g>
          );
        })}
        </g>
      </svg>

      {/* Volver a ver la sede entera. Sólo aparece cuando hay algo enfocado. */}
      {enfocado && (
        <button
          onClick={(e) => { e.stopPropagation(); onSelect(null); }}
          style={{
            position: "absolute", left: 8, top: 8, zIndex: 4,
            background: "var(--surface)", border: "1px solid var(--line)",
            borderRadius: "var(--r-sm)", padding: "4px 10px",
            fontSize: 11.5, color: "var(--ink-2)", cursor: "pointer",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          ‹ Ver la sede
        </button>
      )}

      {/* Tooltip */}
      {tip && (
        <div
          style={{
            position: "absolute",
            left: tip.x + 14,
            top: tip.y + 14,
            pointerEvents: "none",
            background: "var(--dark-bg)",
            border: "1px solid var(--dark-line)",
            borderRadius: "var(--r-md)",
            padding: "6px 10px",
            zIndex: 5,
            whiteSpace: "nowrap",
            boxShadow: "var(--shadow-lg)",
          }}
        >
          <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--dark-ink-1)" }}>{tip.title}</div>
          <div style={{ fontSize: 10.5, color: "var(--dark-ink-2)", marginTop: 1 }}>{tip.sub}</div>
        </div>
      )}
    </div>
  );
}

/** La clave del plano: qué quiere decir cada color y CUÁNTAS caras hay de
 *  cada uno.
 *
 *  El número al lado del color es lo que la vuelve un dato en vez de un
 *  glosario. Sin él hay que contar prismas a ojo para saber si «se libera en
 *  el periodo» son dos o son veinte, que es justo la pregunta que se le hace
 *  a esta pantalla.
 *
 *  Las palabras cambian con el modo porque la pregunta cambia: quien vende
 *  mira hacia adelante —«esta cara SE LIBERA dentro de la ventana, la puedo
 *  ofrecer»— y quien supervisa mira el contrato que se le está por caer
 *  —«VENCE dentro»—. Es el mismo hecho y el mismo color; lo que cambia es de
 *  qué lado del negocio se lo nombra. */
function MapLegend({
  range, tally, modo,
}: {
  range?: DateRange | null;
  tally?: { libres: number; parciales: number; tomados: number } | null;
  modo: "vender" | "supervisar";
}) {
  const items: { c: string; l: string; n?: number }[] = range
    ? [
        { c: RANGE_TOP.libre,   l: modo === "vender" ? RANGE_LABEL.libre : "Libre",
          n: tally?.libres },
        { c: RANGE_TOP.parcial, l: modo === "vender" ? RANGE_LABEL.parcial : "Vence dentro",
          n: tally?.parciales },
        { c: RANGE_TOP.tomado,  l: RANGE_LABEL.tomado, n: tally?.tomados },
        { c: NON_RENTABLE_TOP,  l: NON_RENTABLE_LABEL },
      ]
    : [
    { c: DISPLAY_TOP.free,        l: "Libre" },
    { c: DISPLAY_TOP.committed,   l: "Contratado" },
    { c: DISPLAY_TOP.active,      l: "Ocupado" },
    { c: DISPLAY_TOP.expired,     l: "Vencido" },
    { c: DISPLAY_TOP.reserved,    l: "Reservado" },
    { c: DISPLAY_TOP.maintenance, l: "Mantenimiento" },
    { c: NON_RENTABLE_TOP,        l: NON_RENTABLE_LABEL },
  ];
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
      {items.map((o) => (
        <div
          key={o.l}
          style={{
            display: "flex", alignItems: "center", gap: 5, fontSize: 11.5,
            color: "var(--ink-2)", whiteSpace: "nowrap",
          }}
        >
          <span style={{ width: 10, height: 10, borderRadius: 2, background: o.c, flexShrink: 0 }} />
          {o.l}
          {o.n !== undefined && (
            <b style={{ fontWeight: 700, color: "var(--ink-1)" }}>{o.n}</b>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Fixture detail drawer (dark, right side) ────────────────────────────────

// ─── Space files (shared by the popover and the full detail) ────────────────

type FilesState = "loading" | "ok" | "none" | "error";

/** Look up the Space behind a face code and list its contract files.
 *  Skipped entirely when the fixture cannot hold a contract. */
function useSpaceFiles(code: string, enabled: boolean) {
  const [state, setState] = useState<FilesState>("loading");
  const [files, setFiles] = useState<SpaceFileMeta[]>([]);

  useEffect(() => {
    if (!enabled) {
      setState("none");
      setFiles([]);
      return;
    }
    let cancelled = false;
    setState("loading");
    setFiles([]);
    client
      .get<Space>(`/spaces/by-code/${encodeURIComponent(code)}`)
      .then(async (r) => {
        const fl = await listSpaceFiles(r.data.id);
        if (cancelled) return;
        setFiles(fl);
        setState("ok");
      })
      .catch((err) => {
        if (cancelled) return;
        setState(err?.response?.status === 404 ? "none" : "error");
      });
    return () => { cancelled = true; };
  }, [code, enabled]);

  return { state, files };
}

function fileTint(f: SpaceFileMeta): string {
  if (f.content_type?.startsWith("image/")) return "var(--accent)";
  if (/sheet|excel|csv/i.test(f.content_type ?? "")) return "var(--success)";
  return "var(--danger)";
}

function FileRow({ file, onOpen }: { file: SpaceFileMeta; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      style={{
        display: "flex", alignItems: "center", gap: 8, width: "100%",
        padding: "8px 10px", borderRadius: "var(--r-md)",
        border: "1px solid var(--line)", background: "var(--surface)",
        cursor: "pointer", textAlign: "left", fontFamily: "inherit",
      }}
    >
      <FileText size={13} style={{ color: fileTint(file), flexShrink: 0 }} />
      <span
        style={{
          flex: 1, minWidth: 0, fontSize: 11.5, fontWeight: 500, color: "var(--ink-1)",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}
      >
        {file.filename}
      </span>
      <span style={{ fontSize: 10, color: "var(--ink-3)", flexShrink: 0, fontFamily: "var(--font-mono)" }}>
        {file.size >= 1024 * 1024
          ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
          : `${Math.max(1, Math.round(file.size / 1024))} KB`}
      </span>
    </button>
  );
}

/** Status pill in the page's light theme (the old panel was dark-on-light).
 *  Reads the face, not the raw status, so a contract signed for later says
 *  "Contratado" here exactly as it does on the map and in the cards. */
function StatusPill({ fixture, face }: { fixture: UnifiedFixture; face: FaceEntry }) {
  const rentable = isRentable(fixture);
  const ds = displayStatus(face);
  const ring = rentable ? DISPLAY_TOP[ds] : NON_RENTABLE_TOP;
  const meta = STATUS_META[ds];
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", gap: 5, flexShrink: 0,
        fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: "var(--r-sm)",
        background: rentable ? meta.fill : "var(--surface-3)",
        color:      rentable ? meta.ring : "var(--ink-2)",
        border: `1px solid ${rentable ? meta.edge : "var(--line)"}`,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: 99, background: ring }} />
      {rentable ? meta.label : NON_RENTABLE_LABEL}
    </span>
  );
}

function SupplierLine({ entry, size = 34 }: { entry: FaceEntry; size?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
      <div
        style={{
          width: size, height: size, borderRadius: "var(--r-lg)", flexShrink: 0,
          background: "var(--accent-100)", color: "var(--accent-700)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: size * 0.42, fontWeight: 700,
        }}
      >
        {entry.supplierName.trim().charAt(0).toUpperCase() || "—"}
      </div>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 14, fontWeight: 600, color: "var(--ink-1)",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}
        >
          {entry.supplierName}
        </div>
        {entry.brandCategory && (
          <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{entry.brandCategory}</div>
        )}
      </div>
    </div>
  );
}

/** Light-theme day chip — replaces the dark drawer's daysChip(). */
function daysPill(days: number | null): { text: string; color: string; bg: string } | null {
  if (days === null) return null;
  if (days < 0)
    return { text: `Vencido hace ${Math.abs(days)}d`, color: "var(--danger)", bg: "var(--danger-100)" };
  if (days <= 30)
    return { text: `Vence en ${days}d`, color: "var(--warning)", bg: "var(--warning-100)" };
  return { text: `${days}d restantes`, color: "var(--success)", bg: "var(--success-100)" };
}

function PeriodBox({ entry }: { entry: FaceEntry }) {
  const pill = daysPill(entry.endDate ? daysUntil(entry.endDate) : null);
  return (
    <div>
      <div
        style={{
          fontSize: 9.5, fontWeight: 700, textTransform: "uppercase",
          letterSpacing: "0.08em", color: "var(--ink-3)", marginBottom: 6,
        }}
      >
        Periodo
      </div>
      <div
        style={{
          border: "1px solid var(--line)", background: "var(--surface-2)",
          borderRadius: "var(--r-lg)", padding: "10px 12px",
          display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8,
        }}
      >
        <div>
          <div style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: "0.1em", color: "var(--ink-3)" }}>INICIO</div>
          <div style={{ fontSize: 13.5, fontWeight: 600, fontFamily: "var(--font-mono)", color: "var(--ink-1)", marginTop: 2 }}>
            {formatDate(entry.startDate)}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: "0.1em", color: "var(--ink-3)" }}>FIN</div>
          <div style={{ fontSize: 13.5, fontWeight: 600, fontFamily: "var(--font-mono)", color: pill?.color ?? "var(--ink-1)", marginTop: 2 }}>
            {formatDate(entry.endDate)}
          </div>
        </div>
        {pill && (
          <div style={{ gridColumn: "1 / -1" }}>
            <span
              style={{
                display: "inline-flex", alignItems: "center", fontSize: 11, fontWeight: 700,
                padding: "3px 9px", borderRadius: "var(--r-sm)", background: pill.bg, color: pill.color,
              }}
            >
              {pill.text}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/** Shown instead of a wall of "—" when there is nothing to report. */
function NoContractState({ fixture, isAdmin }: { fixture: UnifiedFixture; isAdmin: boolean }) {
  const rentable = isRentable(fixture);
  return (
    <div style={{ padding: "22px 4px 8px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
      <div
        style={{
          width: 46, height: 46, borderRadius: "var(--r-xl)", marginBottom: 13,
          background: rentable ? "var(--success-50)" : "var(--surface-3)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <Building2 size={22} style={{ color: rentable ? "var(--success)" : "var(--ink-2)" }} />
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink-1)" }}>
        {rentable ? "Disponible para vender" : "Parte del local"}
      </div>
      <div style={{ fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.55, marginTop: 6 }}>
        {rentable
          ? "Este espacio no tiene contrato activo."
          : "Está marcado como no comercializable: no admite contrato y no cuenta en la ocupación."}
      </div>
      {isAdmin && (
        <div style={{ fontSize: 11.5, color: "var(--ink-3)", lineHeight: 1.5, marginTop: 10 }}>
          {rentable
            ? "Con «Negociar este espacio» llenás el contrato acá mismo."
            : "Para alquilarlo, cambiá su destino a «Comercializable» desde el plano."}
        </div>
      )}
    </div>
  );
}

// ─── Quick-look popover, anchored to the fixture on the map ─────────────────

function FixturePopover({
  fixture, anchor, isAdmin, onExpand, onNegociar, onClose,
}: {
  fixture: UnifiedFixture;
  anchor: MapAnchor;
  isAdmin: boolean;
  onExpand: () => void;
  /** Abre el contrato en el riel. Ausente para el mercaderista, que no vende. */
  onNegociar?: () => void;
  onClose: () => void;
}) {
  const rentable = isRentable(fixture);
  const faces = facesOf(fixture);
  const entry = faces[0];
  // Por el código COMPLETO, igual que el panel de detalle: `by-code` guarda
  // `NAVE-PUN-04`, y buscando `PUN-04` contestaba 404 siempre — el contador de
  // archivos decía "Sin archivos" aunque hubiera.
  const { files } = useSpaceFiles(
    fullSpaceCode(fixture.sede, entry.code),
    rentable && entry.status === "occupied",
  );
  const pill = daysPill(entry.endDate ? daysUntil(entry.endDate) : null);
  const hasContract = rentable && entry.supplierName.trim().length > 0;

  const W = 296;
  // Alto estimado, sólo para no dejarlo colgando fuera del mapa. Creció con el
  // botón de negociar; si se queda corto el popover se sale por abajo.
  const EST_H = rentable && isAdmin ? 296 : 250;
  // Flip to whichever side has room, measured against the real map width.
  const flip = anchor.x + 18 + W > anchor.w - 8;
  const left = Math.max(8, flip ? anchor.x - W - 18 : anchor.x + 18);
  const top = Math.min(Math.max(8, anchor.y - 70), Math.max(8, anchor.h - EST_H));

  return (
    <div
      style={{
        position: "absolute", left, top, width: W, zIndex: 30,
        background: "var(--surface)", border: "1px solid var(--line-strong)",
        borderRadius: "var(--r-xl)", boxShadow: "var(--shadow-lg)",
      }}
    >
      <div
        style={{
          position: "absolute", [flip ? "right" : "left"]: -7, top: 82,
          width: 12, height: 12, background: "var(--surface)",
          borderLeft: flip ? "none" : "1px solid var(--line-strong)",
          borderBottom: flip ? "none" : "1px solid var(--line-strong)",
          borderRight: flip ? "1px solid var(--line-strong)" : "none",
          borderTop: flip ? "1px solid var(--line-strong)" : "none",
          transform: "rotate(45deg)",
        } as React.CSSProperties}
      />

      <div style={{ padding: "12px 14px 11px", borderBottom: "1px solid var(--line-soft)", display: "flex", alignItems: "flex-start", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--ink-1)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {fixture.label || fixture.code}
          </div>
          <div
            style={{
              fontSize: 10.5, fontFamily: "var(--font-mono)", color: "var(--ink-3)", marginTop: 2,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}
          >
            {entry.code} · {fixture.sede}
          </div>
          <div style={{ marginTop: 7 }}>
            <StatusPill fixture={fixture} face={entry} />
          </div>
        </div>
        <button
          onClick={onClose}
          title="Cerrar"
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 22, height: 22, flexShrink: 0, borderRadius: "var(--r-sm)",
            border: "1px solid var(--line)", background: "var(--surface-2)",
            color: "var(--ink-2)", cursor: "pointer", padding: 0,
          }}
        >
          <X size={11} />
        </button>
      </div>

      <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 11 }}>
        {hasContract ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <SupplierLine entry={entry} size={30} />
              {isAdmin && entry.negotiatedValue > 0 && (
                <span style={{ marginLeft: "auto", fontSize: 13, fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--success)" }}>
                  {formatCOP(entry.negotiatedValue)}
                </span>
              )}
            </div>
            {(entry.startDate || entry.endDate) && (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 11.5, fontFamily: "var(--font-mono)", color: "var(--ink-2)" }}>
                  {formatRange(entry.startDate, entry.endDate)}
                </span>
                {pill && (
                  <span style={{ marginLeft: "auto", fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: "var(--r-sm)", background: pill.bg, color: pill.color }}>
                    {pill.text}
                  </span>
                )}
              </div>
            )}
          </>
        ) : (
          <div style={{ fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.5 }}>
            {rentable ? "Sin contrato activo — disponible para vender." : "Parte del local, no admite contrato."}
          </div>
        )}

        {/* La acción principal del mapa es vender: el popover es lo que se abre
            al tocar un espacio, y antes lo único que ofrecía era mirar. */}
        {rentable && onNegociar && (
          <button
            onClick={onNegociar}
            style={{
              width: "100%", height: 34, borderRadius: "var(--r-md)", border: "none",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              background: "var(--accent)", color: "#fff",
              fontSize: 12.5, fontWeight: 700, fontFamily: "inherit", cursor: "pointer",
            }}
          >
            <Handshake size={13} />
            {hasContract ? "Nuevo contrato" : "Negociar este espacio"}
          </button>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 6, borderTop: "1px solid var(--line-soft)", paddingTop: 10 }}>
          {rentable && (
            <>
              <FileText size={13} style={{ color: "var(--ink-3)" }} />
              <span style={{ fontSize: 11, color: "var(--ink-3)" }}>
                {files.length > 0 ? `${files.length} archivo${files.length !== 1 ? "s" : ""}` : "Sin archivos"}
              </span>
            </>
          )}
          <button
            onClick={onExpand}
            style={{
              marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 4,
              background: "none", border: "none", padding: 0, cursor: "pointer",
              fontSize: 11.5, fontWeight: 600, fontFamily: "inherit", color: "var(--accent-700)",
            }}
          >
            Ver todo <ChevronRight size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Full detail, rendered in the right-hand rail ────────────────────────────

function FixtureDetailCard({
  fixture, isAdmin, face, onFace, onBack, onNegociar, onCancelado, onOpenFile,
}: {
  fixture: UnifiedFixture;
  isAdmin: boolean;
  face: "A" | "B";
  onFace: (f: "A" | "B") => void;
  onBack: () => void;
  /** Cambia este panel por el del contrato, sobre la cara que se está viendo. */
  onNegociar?: () => void;
  /** El contrato se canceló: hay que escribir el JSON del layout para que el
   *  mapa repinte el mueble como libre. */
  onCancelado?: (patch: Partial<FaceData>) => void;
  onOpenFile: (f: SpaceFileMeta) => void;
}) {
  const rentable = isRentable(fixture);
  const faces = facesOf(fixture);
  const double = isDoubleGondola(fixture) && rentable;
  const entry = face === "B" && faces.length > 1 ? faces[1] : faces[0];
  // Por el código COMPLETO. Buscaba por el corto —`PUN-04` en vez de
  // `NAVE-PUN-04`— y `by-code` devolvía 404 siempre, así que "Archivos del
  // contrato" nunca mostró nada: los que se suben desde el plano quedaban
  // invisibles acá. El corto además se repite entre sedes.
  const { state, files } = useSpaceFiles(fullSpaceCode(fixture.sede, entry.code), rentable);
  const hasContract = rentable && entry.supplierName.trim().length > 0;
  const pedirEnfoque3D = useFixtureStore((s) => s.pedirEnfoque3D);

  return (
    <Card style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "11px 14px", borderBottom: "1px solid var(--line-soft)" }}>
        <button
          onClick={onBack}
          title="Volver"
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 26, height: 26, flexShrink: 0, marginTop: 1, borderRadius: "var(--r-md)",
            border: "1px solid var(--line)", background: "var(--surface-2)",
            color: "var(--ink-2)", cursor: "pointer", padding: 0,
          }}
        >
          <ChevronRight size={14} style={{ transform: "rotate(180deg)" }} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink-1)", letterSpacing: "-0.01em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {fixture.label || fixture.code}
          </div>
          <div style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--ink-3)", marginTop: 2 }}>
            {entry.code} · {fixture.sede}
          </div>
        </div>
        <StatusPill fixture={fixture} face={entry} />
      </div>

      {double && (
        <div style={{ display: "flex", gap: 6, padding: "10px 14px 0" }}>
          {(["A", "B"] as const).map((id) => {
            const active = face === id;
            const other = faces[id === "A" ? 0 : 1];
            return (
              <button
                key={id}
                onClick={() => onFace(id)}
                style={{
                  flex: 1, minWidth: 0, height: 28, borderRadius: "var(--r-md)",
                  fontSize: 11.5, fontWeight: 600, fontFamily: "inherit", cursor: "pointer",
                  border: `1px solid ${active ? "var(--accent)" : "var(--line)"}`,
                  background: active ? "var(--accent-50)" : "var(--surface)",
                  color: active ? "var(--accent-700)" : "var(--ink-2)",
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}
              >
                {/* The supplier on the tab saves a click just to find out
                    whether the other face holds anything. */}
                Cara {id}{other?.supplierName ? ` · ${other.supplierName}` : ""}
              </button>
            );
          })}
        </div>
      )}

      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 13, overflowY: "auto" }}>
        {rentable && onNegociar && (
          <button
            onClick={onNegociar}
            style={{
              width: "100%", height: 36, borderRadius: "var(--r-md)", border: "none",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
              background: hasContract ? "var(--accent-50)" : "var(--accent)",
              color: hasContract ? "var(--accent-700)" : "#fff",
              fontSize: 13, fontWeight: 700, fontFamily: "inherit", cursor: "pointer",
            }}
          >
            <Handshake size={14} />
            {hasContract ? "Nuevo contrato para esta cara" : "Negociar este espacio"}
          </button>
        )}

        {/* Ver la exhibición como la va a ver el proveedor. El 3D es la única
            pantalla que muestra el arte puesto sobre el mueble, y hasta ahora
            había que entrar a mano y buscar el espacio entre 104 muebles. */}
        {rentable && (
          <button
            onClick={() => pedirEnfoque3D(fixture.id, face)}
            style={{
              width: "100%", height: 32, borderRadius: "var(--r-md)",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
              border: "1px solid var(--line)", background: "var(--surface-2)",
              color: "var(--ink-2)", fontSize: 12, fontWeight: 600,
              fontFamily: "inherit", cursor: "pointer",
            }}
          >
            <Box size={13} />
            Ver la exhibición en 3D
          </button>
        )}
        {!hasContract ? (
          <NoContractState fixture={fixture} isAdmin={isAdmin} />
        ) : (
          <>
            <SupplierLine entry={entry} />
            {(entry.startDate || entry.endDate) && <PeriodBox entry={entry} />}
            {isAdmin && entry.negotiatedValue > 0 && (
              <div
                style={{
                  display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8,
                  padding: "10px 12px", border: "1px solid var(--success-100)",
                  background: "var(--success-50)", borderRadius: "var(--r-lg)",
                }}
              >
                <span style={{ fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--success)" }}>
                  Valor / mes
                </span>
                <span style={{ fontSize: 16, fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--success)" }}>
                  {formatCOP(entry.negotiatedValue)}
                </span>
              </div>
            )}
            {entry.observation && (
              <div>
                <div style={{ fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ink-3)", marginBottom: 5 }}>
                  Observación
                </div>
                <div style={{ fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.55 }}>{entry.observation}</div>
              </div>
            )}
          </>
        )}

        {/* Qué le prometimos armar al proveedor. Se resuelve por el código del
            espacio —el layout no guarda ids de contrato— y sólo aparece si hay
            algo que mostrar o algo a lo que adjuntarle. */}
        {rentable && hasContract && (
          <Planometria
            key={entry.code}
            spaceCode={fullSpaceCode(fixture.sede, entry.code)}
            isAdmin={isAdmin}
          />
        )}

        {rentable && (state === "loading" || files.length > 0) && (
          <div>
            <div style={{ fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ink-3)", marginBottom: 7 }}>
              Archivos del contrato
            </div>
            {state === "loading" ? (
              <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>Cargando…</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {files.map((f) => (
                  <FileRow key={f.id} file={f} onOpen={() => onOpenFile(f)} />
                ))}
              </div>
            )}
          </div>
        )}
        {rentable && state === "error" && (
          <div style={{ fontSize: 11.5, color: "var(--danger)" }}>No se pudo consultar el servidor.</div>
        )}

        {/* Soltar el espacio. Al final del panel y con confirmación: es
            destructivo, y hasta ahora no existía en ninguna pantalla pese a que
            el backend lo soporta —el mensaje de choque de fechas mandaba a
            «cancelalo primero» señalando algo que no se podía hacer. */}
        {isAdmin && rentable && hasContract && onCancelado && (
          <CancelarContrato
            key={entry.code}
            spaceCode={fullSpaceCode(fixture.sede, entry.code)}
            onCancelado={onCancelado}
          />
        )}
      </div>
    </Card>
  );
}

// ─── Atención (vencidos + por vencer + anomalías, one-line rows) ─────────────

interface ContractEntry extends FaceEntry {
  days: number;
}

/** El encabezado de un grupo de pendientes: qué son, y cuánto pesan.
 *
 *  El número de la derecha es la razón de ser del grupo. «Por vencer en 30
 *  días» sin cifra es una categoría; con «$3.700.000» al lado es una alarma
 *  con tamaño, y ése es el dato con el que se decide a quién llamar primero. */
function AtencionSection({
  label, color, monto,
}: {
  label: string;
  color: string;
  /** Lo que ese grupo vale: plata en los que vencen, cantidad en el resto. */
  monto?: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex", alignItems: "baseline", justifyContent: "space-between",
        gap: 10, padding: "0 6px 6px", margin: "0 0 2px",
        borderBottom: "1px solid var(--line)",
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-mono)", fontWeight: 600, fontSize: 9.5,
          letterSpacing: "0.11em", textTransform: "uppercase", color,
        }}
      >
        {label}
      </span>
      {monto !== undefined && (
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-1)" }}>{monto}</span>
      )}
    </div>
  );
}

/** Una fila de «Para revisar»: días, código, quién, y cuándo.
 *
 *  Es un BOTÓN, no un renglón. Antes la lista y el plano eran dos paneles que
 *  no se hablaban: se leía «PUN-03 vence en 24 días» y para ver dónde quedaba
 *  ese espacio había que buscarlo a ojo entre 106 muebles. Ahora tocar la fila
 *  lo selecciona en el plano de al lado —y el plano, al seleccionarlo, lo
 *  rotula—. La lista dice QUÉ y el plano dice DÓNDE; sueltos no servían.
 *
 *  Los días van primero y en una plaquita: es por lo que se ordena la lista y
 *  lo único que decide si esto se mira hoy o la semana que viene. */
function AtencionRow({
  entry,
  chip,
  tono = "alarma",
  dates,
  selected,
  onSelect,
  onFoto,
}: {
  entry: FaceEntry;
  chip: string;
  /** `alarma` = rojo (vence, vencido). `sordo` = gris (esperando algo). */
  tono?: "alarma" | "sordo";
  dates: string;
  selected?: boolean;
  onSelect?: () => void;
  /** Abre la foto del montaje. Solo la traen las filas que tienen prueba. */
  onFoto?: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      style={{
        display: "flex", alignItems: "center",
        borderTop: "1px solid var(--line-soft)",
        background: selected ? "var(--surface-2)" : hover ? "#F6F8F8" : "transparent",
        borderLeft: `2px solid ${selected ? "var(--ink-1)" : "transparent"}`,
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <button
        type="button"
        onClick={onSelect}
        disabled={!onSelect}
        title={onSelect ? "Verlo en el plano" : undefined}
        style={{
          flex: 1, minWidth: 0,
          display: "flex", alignItems: "center", gap: 9,
          padding: "5px 6px", border: "none", background: "none",
          textAlign: "left", color: "inherit", fontFamily: "inherit",
          cursor: onSelect ? "pointer" : "default",
        }}
      >
        <span
          style={{
            flexShrink: 0, minWidth: 38, textAlign: "center", padding: "2px 5px",
            fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 14.5,
            borderRadius: "var(--r-xs)",
            color: tono === "alarma" ? "var(--ocupado)" : "var(--ink-2)",
            background: tono === "alarma" ? "var(--ocupado-suave)" : "var(--surface-3)",
          }}
        >
          {chip}
        </span>
        <span
          style={{
            flexShrink: 0, width: 56,
            fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 13,
            letterSpacing: "0.02em", color: "var(--ink-1)",
          }}
        >
          {codigoVisible(entry)}
        </span>
        <span
          style={{
            flex: 1, minWidth: 0, fontSize: 12, color: "var(--ink-2)",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}
        >
          {entry.supplierName || entry.fixture.label || entry.fixture.code}
        </span>
        <span style={{ flexShrink: 0, fontSize: 12, color: "var(--ink-3)", whiteSpace: "nowrap" }}>
          {dates}
        </span>
      </button>
      {onFoto && (
        <button
          onClick={onFoto}
          title="Ver la foto del reporte"
          aria-label="Ver la foto del reporte"
          style={{
            flexShrink: 0, display: "inline-flex", alignItems: "center",
            background: "none", border: "none", padding: "0 8px 0 2px",
            cursor: "pointer", color: "var(--ink-3)",
          }}
        >
          <Camera size={12} />
        </button>
      )}
    </div>
  );
}

/** Estado de montaje de una cara, en la tabla.
 *
 *  Solo dice algo cuando hay algo que decir: un espacio libre, uno vencido o
 *  uno cuyo contrato todavía no arrancó no están "sin montar" — no les toca
 *  todavía, y marcarlos llenaría la columna de ruido. */
function MontajeChip({
  entry, reporte,
}: {
  entry: FaceEntry;
  reporte: MountConfirmation | undefined;
}) {
  const fase = contractPhase(entry);
  const aplica = fase === "vigente" || fase === "pendiente";
  if (!aplica && !reporte) {
    return <span style={{ color: "var(--ink-4)", fontSize: 11.5 }}>—</span>;
  }
  const estado = estadoMontaje(reporte);
  // Firmado pero sin arrancar y sin reporte: no le toca todavía.
  if (estado === "pendiente" && fase !== "vigente") {
    return <span style={{ color: "var(--ink-4)", fontSize: 11.5 }}>—</span>;
  }
  const pinta =
    estado === "montado" ? { c: "var(--success)", t: "Montado" }
    : estado === "no_montado" ? { c: "var(--danger)", t: "No se pudo" }
    : { c: "var(--warning)", t: "Pendiente" };
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        fontSize: 11.5, fontWeight: 600, color: pinta.c,
      }}
      title={
        reporte
          ? [reporte.reportado_por, reporte.motivo ? MOTIVO_LABEL[reporte.motivo as MountMotivo] : "",
             reporte.nota].filter(Boolean).join(" · ")
          : "El contrato ya arrancó y nadie reportó el montaje"
      }
    >
      <span style={{ width: 6, height: 6, borderRadius: 99, background: pinta.c, flexShrink: 0 }} />
      {pinta.t}
    </span>
  );
}

// ─── Quién paga el canon ─────────────────────────────────────────────────────

/** Un proveedor y lo que pone, con la parte del canon que representa.
 *
 *  El panel se llamaba «Los que más pagan» y estaba ordenado por plata, con un
 *  1-2-3 al costado. Ese ranking contesta una pregunta de vanidad. La que
 *  importa es de quién depende la sede: por eso el porcentaje —«COCA COLA es
 *  el 23% del canon»— y el sello VENCE, que juntos dicen cuánta plata se
 *  levanta y se va si esa renovación no se cierra.
 *
 *  El número de contratos se fue de la fila: ocupaba lugar y no cambia
 *  ninguna decisión. Está en la tabla de abajo, que es donde se mira. */
function SupplierRow({
  name, revenue, pct, vence,
}: {
  name: string;
  revenue: number;
  /** Qué parte del canon vigente pone este proveedor. */
  pct: number;
  /** Tiene al menos una cara que vence dentro de los 30 días. */
  vence: boolean;
}) {
  return (
    <div
      style={{
        display: "grid", gridTemplateColumns: "1fr auto auto 36px",
        alignItems: "center", columnGap: 8,
        padding: "4px 0", borderTop: "1px solid var(--line-soft)",
      }}
    >
      <span
        style={{
          fontSize: 13, color: "var(--ink-1)", minWidth: 0,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}
        title={name}
      >
        {name}
      </span>
      {vence ? (
        <span
          title="Tiene al menos un contrato que vence dentro de 30 días"
          style={{
            fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 9.5,
            letterSpacing: "0.09em", textTransform: "uppercase",
            color: "var(--ocupado)", background: "var(--ocupado-suave)",
            borderRadius: "var(--r-xs)", padding: "1px 4px",
          }}
        >
          vence
        </span>
      ) : (
        <span />
      )}
      <span style={{ fontSize: 13, fontWeight: 700, textAlign: "right", whiteSpace: "nowrap" }}>
        {formatCOP(revenue)}
      </span>
      <span style={{ fontSize: 11, color: "var(--ink-3)", textAlign: "right" }}>{pct}%</span>
    </div>
  );
}

// ─── Estado por espacio ──────────────────────────────────────────────────────

/** Cómo se dice cada estado en la tabla, y de qué color va el punto.
 *
 *  El punto es el MISMO color que el mueble en el plano de arriba: es lo que
 *  permite leer una fila y encontrarla en la sala sin volver a pensar. Nunca
 *  va solo —al lado está la palabra, y a la derecha los días—, así que la
 *  identidad del estado no depende del color en ningún momento. */
const PIN: Record<DisplayStatus, { punto: string; texto: string; palabra: string }> = {
  free:        { punto: RANGE_TOP.libre,   texto: "var(--libre)",   palabra: "Libre" },
  active:      { punto: RANGE_TOP.tomado,  texto: "var(--ink-2)",   palabra: "Activo" },
  expiring:    { punto: RANGE_TOP.parcial, texto: "var(--ocupado)", palabra: "Por vencer" },
  committed:   { punto: DISPLAY_TOP.committed, texto: "var(--ink-2)", palabra: "Contratado" },
  expired:     { punto: RANGE_TOP.tomado,  texto: "var(--ocupado)", palabra: "Vencido" },
  no_contract: { punto: RANGE_TOP.tomado,  texto: "var(--ocupado)", palabra: "Sin contrato" },
  reserved:    { punto: DISPLAY_TOP.reserved, texto: "var(--ink-2)", palabra: "Reservado" },
  maintenance: { punto: DISPLAY_TOP.maintenance, texto: "var(--ink-3)", palabra: "Mantenim." },
};

/** El orden de la tabla: primero lo que pide acción.
 *
 *  Ordenar sólo por «días que faltan» ponía arriba lo vencido —que ya no se
 *  puede evitar— y enterraba lo que vence la semana que viene, que es lo único
 *  sobre lo que todavía se puede hacer algo. Van por grupo y adentro del grupo
 *  por urgencia; lo libre al final, alfabético, porque ahí no hay urgencia:
 *  hay inventario. */
function ordenDeFila(e: FaceEntry): [number, number, string] {
  const ds = displayStatus(e);
  const dias = e.endDate ? daysUntil(e.endDate) : 99999;
  const grupo =
    ds === "no_contract" ? 0
    : ds === "expired" ? 1
    : ds === "expiring" ? 2
    : ds === "free" ? 5
    : ds === "maintenance" ? 4
    : 3;
  return [grupo, dias, e.code];
}

function SpacesTable({
  fixtures, isAdmin, query, filter, montajeDe, tarifaDe,
  selectedId, onSelect, sinMontar,
}: {
  fixtures: UnifiedFixture[];
  isAdmin: boolean;
  /** El último reporte de montaje de esa cara, si lo hay. */
  montajeDe: (entry: FaceEntry) => MountConfirmation | undefined;
  /** Driven by the page-level control bar — the table no longer owns a second
   *  search box and a second row of chips doing the same job as the map's. */
  query: string;
  filter: MapFilter;
  /** El mueble abierto en el plano: la fila se marca y el plano la rotula. */
  selectedId?: string | null;
  onSelect?: (f: UnifiedFixture) => void;
  /** Claves de las caras contratadas y sin reportar, para el filtro. */
  sinMontar?: Set<string>;
  /** La tarifa de referencia de esa cara. Sin esto la columna de plata queda
   *  vacía en las filas libres, que suelen ser la mayoría de la tabla, y no
   *  se puede contestar «¿cuánto pido por ésta?» sin salir a otra pantalla. */
  tarifaDe: (entry: FaceEntry) => number | null;
}) {
  // One row per rentable face — doubles expand to A + B, matching the KPIs.
  const rows = useMemo(
    () =>
      fixtures.flatMap(commercialFacesOf).sort((a, b) => {
        const [ga, da, ca] = ordenDeFila(a);
        const [gb, db, cb] = ordenDeFila(b);
        return ga - gb || da - db || ca.localeCompare(cb);
      }),
    [fixtures],
  );

  // Text search AND status chip (same face-level matcher as the map's search).
  const filtered = useMemo(() => {
    const q = normalizeText(query.trim());
    return rows.filter(
      (e) => (!q || faceMatchesQuery(e, q)) && faceMatchesFilter(e, filter, sinMontar),
    );
  }, [rows, filter, query, sinMontar]);

  // Los anchos van en el `th` y no en el `td`: con `table-layout:fixed` el
  // navegador toma las medidas de la PRIMERA fila, que es la del encabezado.
  // Puestos en las celdas se ignoran en silencio y la tabla vuelve a repartir
  // el ancho a ojo — que es exactamente lo que hacía antes de esto.
  const columnas: { etiqueta: string; ancho?: number; derecha?: boolean }[] = [
    { etiqueta: "Código", ancho: 104 },
    { etiqueta: "Tipo", ancho: 150 },
    { etiqueta: "Proveedor" },
    { etiqueta: "Estado", ancho: 104 },
    { etiqueta: "Montaje", ancho: 92 },
    { etiqueta: "Desde", ancho: 96 },
    { etiqueta: "Hasta", ancho: 96 },
    { etiqueta: "Días", ancho: 56, derecha: true },
  ];
  if (isAdmin) columnas.push({ etiqueta: "Renta / mes", ancho: 110, derecha: true });

  const vacio = <span style={{ color: "var(--ink-vacio)" }}>—</span>;

  return (
    <div style={{ padding: "0 15px 12px", overflowX: "auto" }}>
      <table
        style={{
          width: "100%", minWidth: 880,
          borderCollapse: "collapse", tableLayout: "fixed",
        }}
      >
        <thead>
          <tr>
            {columnas.map((c) => (
              <th
                key={c.etiqueta}
                style={{
                  width: c.ancho,
                  padding: "0 8px 5px",
                  textAlign: c.derecha ? "right" : "left",
                  fontFamily: "var(--font-mono)", fontSize: 9.5, fontWeight: 600,
                  color: "var(--ink-3)",
                  textTransform: "uppercase", letterSpacing: "0.1em",
                  borderBottom: "1px solid var(--line-strong)",
                  whiteSpace: "nowrap",
                }}
              >
                {c.etiqueta}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 && (
            <tr>
              <td colSpan={columnas.length} style={{ padding: "14px 8px", fontSize: 12, color: "var(--ink-3)" }}>
                {query.trim()
                  ? <>Sin resultados para «{query.trim()}»</>
                  : "Sin espacios con este estado."}
              </td>
            </tr>
          )}
          {filtered.map((entry) => {
            const ds = displayStatus(entry);
            const pin = PIN[ds];
            const libre = ds === "free";
            const days = entry.endDate && !libre ? daysUntil(entry.endDate) : null;
            const sel = selectedId === entry.fixture.id;

            const celda: React.CSSProperties = {
              padding: "0 8px", height: 28,
              borderBottom: "1px solid var(--line-soft)",
              fontSize: 12.5, color: libre ? "var(--ink-3)" : "var(--ink-2)",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              background: sel ? "var(--surface-2)" : undefined,
            };

            return (
              <tr
                key={`${entry.fixture.id}-${entry.face}`}
                onClick={onSelect ? () => onSelect(entry.fixture) : undefined}
                style={{ cursor: onSelect ? "pointer" : "default" }}
                onMouseEnter={(e) => {
                  if (sel) return;
                  e.currentTarget.querySelectorAll("td").forEach((td) => {
                    (td as HTMLElement).style.background = "#F6F8F8";
                  });
                }}
                onMouseLeave={(e) => {
                  if (sel) return;
                  e.currentTarget.querySelectorAll("td").forEach((td) => {
                    (td as HTMLElement).style.background = "";
                  });
                }}
              >
                <td
                  style={{
                    ...celda,
                    fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 13,
                    letterSpacing: "0.02em", color: "var(--ink-1)",
                    boxShadow: sel ? "inset 2px 0 0 var(--ink-1)" : undefined,
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      display: "inline-block", width: 7, height: 7, borderRadius: "50%",
                      marginRight: 8, verticalAlign: 1, background: pin.punto,
                    }}
                  />
                  {codigoVisible(entry)}
                </td>
                {/* El TIPO, no el nombre propio del mueble. La maqueta dice
                    «Punta de góndola» y no «Punta 3 del pasillo 5»: el nombre
                    propio ya está en la columna del código, y repetirlo acá
                    dejaba la columna sin contestar de qué clase de espacio se
                    trata —que es lo que se compara entre filas—. El nombre
                    completo queda al pasar por encima. */}
                <td style={celda} title={entry.fixture.label || undefined}>
                  {rateTypeLabel(rateTypeOf(entry.fixture))}
                </td>
                <td style={{ ...celda, color: libre ? "var(--ink-3)" : "var(--ink-1)" }}
                    title={entry.supplierName || undefined}>
                  {entry.supplierName
                    ? libre
                      ? <span style={{ color: "var(--ink-4)" }}>último: {entry.supplierName}</span>
                      : entry.supplierName
                    : vacio}
                </td>
                <td style={celda}>
                  <span style={{
                    fontSize: 12, color: pin.texto,
                    fontWeight: ds === "expiring" || ds === "expired" || ds === "no_contract" ? 600 : 400,
                  }}>
                    {pin.palabra}
                  </span>
                </td>
                <td style={celda}>
                  <MontajeChip entry={entry} reporte={montajeDe(entry)} />
                </td>
                {/* El período. La tabla ya ordenaba por fecha de fin y contaba
                    los días, pero no decía DESDE ni HASTA cuándo — y eso es lo
                    que se necesita para renovar o para reclamar. */}
                {([entry.startDate, entry.endDate] as const).map((iso, i) => (
                  <td key={i} style={celda}>
                    {iso && !libre ? fechaEnCurso(iso) : vacio}
                  </td>
                ))}
                <td
                  style={{
                    ...celda, textAlign: "right", fontWeight: 700,
                    color: days === null ? "var(--ink-vacio)"
                      : days < 0 ? "var(--ocupado)"
                      : days <= 30 ? "var(--ocupado)"
                      : "var(--ink-2)",
                  }}
                >
                  {days === null ? vacio : (
                    <>{days}<i style={{ fontStyle: "normal", fontSize: 10, fontWeight: 600, color: "var(--ink-3)" }}>d</i></>
                  )}
                </td>
                {isAdmin && (
                  <td style={{ ...celda, textAlign: "right", fontWeight: 700, color: "var(--ink-1)" }}>
                    {/* En una cara libre esto no es lo que se cobra sino lo que
                        se pediría: va en gris y sin negrita, para que no se
                        sume con la vista a lo que sí está entrando. */}
                    {libre
                      ? <span style={{ color: "var(--ink-3)", fontWeight: 400 }}>
                          {(() => { const t = tarifaDe(entry); return t ? formatCOP(t) : "—"; })()}
                        </span>
                      : entry.negotiatedValue > 0 ? formatCOP(entry.negotiatedValue) : vacio}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Un espacio libre, como pastilla: el código y —si se libera adentro del
 *  periodo— desde cuándo.
 *
 *  Se toca y entra al contrato, igual que tocarlo en el plano. Es la misma
 *  acción por dos caminos a propósito: el plano contesta «dónde queda» y la
 *  lista contesta «cuáles hay», y según cuál de las dos preguntas traiga el
 *  proveedor uno arranca por un lado o por el otro.
 *
 *  El que se libera adentro del periodo va en naranja y con su fecha. No se
 *  esconde: es inventario vendible —«te lo puedo dar desde el 25»— y esconderlo
 *  es dejar de vender cinco espacios de veinte. */
function ChipEspacio({
  code, desde, puesto, onClick,
}: {
  code: string;
  desde?: Date;
  /** Ya está en el contrato que se está armando. */
  puesto: boolean;
  onClick: () => void;
}) {
  const entra = desde !== undefined;
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title={puesto
        ? `Sacar ${code} del contrato`
        : entra
        ? `Sumar ${code} al contrato · se libera el ${fechaEnCurso(toISODate(desde))}`
        : `Sumar ${code} al contrato`}
      style={{
        display: "inline-flex", alignItems: "baseline", gap: 4,
        padding: "2px 6px", borderRadius: "var(--r-xs)", cursor: "pointer",
        fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 12,
        letterSpacing: "0.02em", lineHeight: 1.5,
        border: `1px solid ${puesto ? "var(--ink-1)" : entra ? "var(--entra-borde)" : "var(--libre-borde)"}`,
        background: puesto ? "var(--ink-1)" : entra ? "var(--entra-suave)" : "var(--libre-suave)",
        color: puesto ? "#fff" : entra ? "var(--entra-txt)" : "var(--libre)",
      }}
    >
      {code}
      {entra && (
        <span style={{ fontFamily: "var(--font-sans)", fontWeight: 500, fontSize: 10 }}>
          {fechaEnCurso(toISODate(desde))}
        </span>
      )}
    </button>
  );
}

// ─── La franja de cifras ─────────────────────────────────────────────────────

/** Una cifra de la franja: cómo se llama, cuánto es, y qué quiere decir.
 *
 *  El rótulo va arriba y en versalita, el número abajo y grande. Al revés
 *  —número primero— la fila se lee como una hilera de importes sin nombre y
 *  hay que volver a subir para saber de qué es cada uno.
 *
 *  `tasa` es el segundo renglón de «Sin alquilar»: lo que se evapora mientras
 *  la cara sigue vacía. No dice «perdido» a propósito — con el periodo por
 *  delante todavía no se perdió nada, y llamarle pérdida a lo que aún se puede
 *  vender es la clase de exageración que hace que después nadie crea el resto
 *  de los números. */
function Cifra({
  rotulo, valor, notas, tasa, alarma, barra,
}: {
  rotulo: string;
  valor: string;
  notas: string[];
  tasa?: string;
  /** Rojo: es plata que se puede caer. */
  alarma?: boolean;
  /** 0-100. Dibuja la barrita bajo el número. */
  barra?: number;
}) {
  const cero = valor === "0" || valor === "$0" || valor === "0%";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 130 }}>
      <span className="rotulo" style={alarma ? { color: "var(--ocupado)" } : undefined}>
        {rotulo}
      </span>
      <b style={{
        fontSize: 17, fontWeight: cero ? 700 : 900, letterSpacing: "-0.015em", lineHeight: 1.15,
        color: alarma ? "var(--ocupado)" : cero ? "var(--ink-3)" : "var(--ink-1)",
      }}>
        {valor}
      </b>
      {notas.map((n) => (
        <i key={n} style={{
          fontStyle: "normal", fontSize: 11, color: "var(--ink-3)",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>
          {n}
        </i>
      ))}
      {tasa && (
        <i style={{ fontStyle: "normal", fontSize: 11, fontWeight: 600, color: "var(--ink-2)" }}>
          {tasa}
        </i>
      )}
      {barra !== undefined && (
        <div style={{
          height: 4, background: "var(--surface-3)", borderRadius: 2,
          marginTop: 4, overflow: "hidden",
        }}>
          <span style={{
            display: "block", height: "100%", width: `${Math.max(0, Math.min(100, barra))}%`,
            background: "var(--ocupado)", borderRadius: 2,
          }} />
        </div>
      )}
    </div>
  );
}

function Separador() {
  return <div aria-hidden style={{ width: 1, alignSelf: "stretch", background: "var(--line)", flexShrink: 0 }} />;
}

/** Los botones de la barra: lo que se le hace A LA SEDE —cargar una planilla,
 *  editar tarifas, traer los cambios—. Van juntos y al final porque ninguno
 *  cambia lo que se está leyendo; sólo lo actualizan. */
const botonBarra: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6,
  height: 26, padding: "0 10px", borderRadius: "var(--r-md)",
  border: "1px solid var(--line)", background: "var(--surface)",
  color: "var(--ink-2)", fontSize: 12, fontWeight: 500,
  fontFamily: "inherit", cursor: "pointer", whiteSpace: "nowrap",
};

const celdaTarifa: React.CSSProperties = {
  padding: "3.5px 0", borderBottom: "1px solid var(--line-soft)",
  fontSize: 13, height: 22, color: "var(--ink-1)",
};

const pieTarifa: React.CSSProperties = {
  borderTop: "1px solid var(--line-strong)", paddingTop: 6,
  color: "var(--ink-3)", fontSize: 12,
};

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyDashboard({ sede, isAdmin }: { sede: string; isAdmin: boolean }) {
  return (
    <div
      style={{
        flex: 1, display: "flex", flexDirection: "column",
        alignItems: "flex-start", justifyContent: "center",
        padding: "40px 44px", textAlign: "left",
      }}
    >
      {/* Tenía un cuadrado de 88px con un ícono de edificio adentro. El catálogo
          de tells lo nombra tal cual —«estado vacío: ícono centrado en una caja»—
          y tiene razón en por qué: el ícono no enseña nada. Lo que le falta a
          quien llega acá es saber qué hacer, y eso lo dicen las palabras. */}
      <p
        style={{
          fontSize: 16, fontWeight: 600,
          color: "var(--ink-1)", marginBottom: 6,
        }}
      >
        Todavía no hay muebles en{" "}
        <span style={{ fontFamily: "var(--font-mono)" }}>{sede}</span>
      </p>
      <p style={{ fontSize: 12.5, color: "var(--ink-3)", maxWidth: 360, marginBottom: 18 }}>
        {isAdmin
          ? "Dibujá la tienda desde la pestaña Plano. Con el plano cargado aparece el mapa de la sede, qué está libre y cuánto entra por cada espacio."
          : "Todavía no hay un plano cargado para esta sede. Pedile a un administrador que lo diseñe."}
      </p>
      {isAdmin && (
        <button
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            height: 36, padding: "0 16px",
            borderRadius: "var(--r-md)",
            background: "var(--accent)", color: "#fff",
            border: "none", cursor: "pointer",
            fontSize: 12, fontWeight: 500, fontFamily: "inherit",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <Plus size={14} /> Diseñar plano
        </button>
      )}
    </div>
  );
}

// ─── Main view ────────────────────────────────────────────────────────────────

export default function DashboardView() {
  const fixtures = useFixtureStore(selectFixtures);
  const { sedes, sede, setSede, fixturesBySede, syncFromServer, seasonWindows } = useFixtureStore();
  const referenceRates = useFixtureStore((s) => s.referenceRates);
  const commit = useFixtureStore((s) => s.commit);
  const isAdmin = useAuthStore(selectIsAdmin);
  const [ratesOpen, setRatesOpen] = useState(false);

  const [selected, setSelected] = useState<UnifiedFixture | null>(null);
  /** Los espacios que van en el contrato que se está armando, en el orden en
   *  que se fueron tocando.
   *
   *  Guarda `id` y cara, no el mueble: el objeto lo reemplaza el store en cada
   *  sincronización, y una referencia vieja dejaría la ficha mostrando el
   *  estado de hace un minuto. Se resuelve contra `fixtures` en cada render.
   *
   *  Vive acá y no adentro de la ficha porque el que la arma es el PLANO: se
   *  toca un espacio y entra a la lista. Un contrato con un proveedor sobre
   *  tres puntas de góndola es un solo acuerdo —un proveedor, un periodo, una
   *  firma— y tecleado de a uno eran tres veces el mismo formulario. */
  const [enContrato, setEnContrato] = useState<{ id: string; face: "A" | "B" }[]>([]);
  // Where on the map the click landed (anchors the quick-look popover).
  const [anchor, setAnchor] = useState<MapAnchor | null>(null);
  // false = quick popover, true = full detail in the rail ("Ver todo").
  const [detailFull, setDetailFull] = useState(false);
  const [detailFace, setDetailFace] = useState<"A" | "B">("A");
  /** Para qué está abierta la pantalla ahora mismo.
   *
   *  Negociar y Resumen eran dos pestañas que abrían las dos con el plano de la
   *  misma sede, y la pregunta "¿en cuál de las dos hago el contrato?" no tenía
   *  buena respuesta. Es una sola pantalla con dos modos declarados: en Vender
   *  el mapa manda y el contrato va al lado; en Supervisar mandan los números y
   *  lo que está pendiente. El mercaderista no vende, así que sólo ve el
   *  segundo. */
  const [modo, setModo] = useState<"vender" | "supervisar">("vender");
  const modoEfectivo: "vender" | "supervisar" = isAdmin ? modo : "supervisar";
  /** El contrato que se acaba de cerrar.
   *
   *  Vive en la pantalla y no adentro del formulario a propósito: al guardar,
   *  el mueble cambia de estado y el formulario se desmontaría con el mensaje
   *  adentro, justo cuando hay que leer a quién le llegó el aviso. */
  const [cerrado, setCerrado] = useState<ResumenContrato | null>(null);
  /** La planilla de la reunión comercial, cargada de una tanda. */
  const [cargaAbierta, setCargaAbierta] = useState(false);
  /** La fila de temporadas, desplegada. Arranca cerrada: el periodo se lee en
   *  la barra y se cambia de a ratos. */
  const [periodoAbierto, setPeriodoAbierto] = useState(false);

  const selectFixture = (f: UnifiedFixture | null, point?: MapAnchor) => {
    setSelected(f);
    // En Vender el popover sobra: la ficha de la derecha ya dice todo lo que
    // ese globito decía, y encima tapa el mapa que se está mirando.
    setAnchor(modoEfectivo === "vender" ? null : point ?? null);
    setDetailFull(false);
    setDetailFace("A");
    setCerrado(null);

    // En Vender tocar un espacio lo SUMA al contrato; tocarlo de nuevo lo
    // saca. Antes reemplazaba la selección, y con eso un contrato sobre tres
    // puntas había que tipearlo tres veces. Lo que no se alquila no entra —la
    // ficha explica por qué—, y una góndola doble entra por su cara A: la B se
    // elige en el renglón, que es donde se ve cuál se está vendiendo.
    if (modoEfectivo !== "vender" || !f) return;
    if (!isRentable(f)) { setEnContrato([]); return; }
    setEnContrato((lista) =>
      lista.some((x) => x.id === f.id)
        ? lista.filter((x) => x.id !== f.id)
        : [...lista, { id: f.id, face: "A" }],
    );
  };

  /** Quitar una cara del contrato. */
  const quitarDelContrato = useCallback((id: string, face: "A" | "B") => {
    setEnContrato((lista) => lista.filter((x) => !(x.id === id && x.face === face)));
  }, []);

  /** Sumar o sacar una cara de una góndola doble.
   *
   *  Es un interruptor por cara y no un selector entre las dos: las dos caras
   *  de una góndola son DOS espacios, y vendérselas al mismo proveedor en el
   *  mismo contrato es lo normal —una marca que quiere el pasillo entero—.
   *  Con un selector eso obligaba a hacer dos contratos. Sacar la última cara
   *  saca el mueble del contrato, que es lo que uno espera al apagar la
   *  única que quedaba prendida. */
  const alternarCara = useCallback((id: string, face: "A" | "B") => {
    setEnContrato((lista) =>
      lista.some((x) => x.id === id && x.face === face)
        ? lista.filter((x) => !(x.id === id && x.face === face))
        : [...lista, { id, face }],
    );
  }, []);

  /** Los espacios del contrato resueltos contra el layout de ahora. */
  const espaciosDelContrato = useMemo(
    () =>
      enContrato
        .map(({ id, face }) => {
          const fixture = fixtures.find((f) => f.id === id);
          return fixture ? { fixture, face } : null;
        })
        .filter((x): x is { fixture: UnifiedFixture; face: "A" | "B" } => x !== null),
    [enContrato, fixtures],
  );


  const closeDetail = () => {
    setSelected(null);
    setAnchor(null);
    setDetailFull(false);
    setEnContrato([]);
  };
  /** Pasar a vender ese espacio, venga de donde venga: del popover del mapa o
   *  del panel de detalle en Supervisar. */
  const negociar = (f: UnifiedFixture, face: "A" | "B" = "A") => {
    setSelected(f);
    setDetailFace(face);
    setDetailFull(false);
    setAnchor(null);
    setCerrado(null);
    // Arranca un contrato NUEVO con ese espacio. Sumarlo a uno que estuviera a
    // medio armar mezclaría dos negociaciones sin avisar.
    setEnContrato([{ id: f.id, face }]);
    setModo("vender");
  };
  const [viewerFile, setViewerFile] = useState<SpaceFileMeta | null>(null);

  // ── Estado de montaje ────────────────────────────────────────────────────
  // El mercaderista ya reportaba y nadie leía: el reporte caía en una tabla que
  // ninguna pantalla mostraba. Se pide una sola vez, para todas las sedes —
  // son unas pocas filas y el enlace del correo puede apuntar a cualquiera.
  const [montajes, setMontajes] = useState<MountConfirmation[]>([]);
  useEffect(() => {
    let vivo = true;
    fetchMounts()
      .then((m) => { if (vivo) setMontajes(m); })
      .catch(() => { if (vivo) setMontajes([]); });
    return () => { vivo = false; };
  }, []);
  const ultimoMontaje = useMemo(() => latestByCode(montajes), [montajes]);

  /** El último reporte de una cara, buscado por su código COMPLETO.
   *
   *  `FaceEntry.code` es la nomenclatura corta, que se repite entre sedes; los
   *  reportes se guardan con la sede adentro. Buscar por el corto mezclaría
   *  tiendas — es el mismo error que ya costó un arreglo en la pantalla del
   *  mercaderista. */
  const montajeDe = useCallback(
    (entry: FaceEntry): MountConfirmation | undefined =>
      ultimoMontaje[fullSpaceCode(entry.fixture.sede || sede, entry.code)],
    [ultimoMontaje, sede],
  );

  const [mapQuery, setMapQuery] = useState("");
  const [mapFilter, setMapFilter] = useState<MapFilter>("todos");
  const [mapCategoria, setMapCategoria] = useState<string | null>(null);
  /** Period the map answers for; null = today. */
  const [mapRange, setMapRange] = useState<DateRange | null>(null);

  // Deselect when switching sedes: ese mueble es de la otra tienda, y un
  // contrato a medio llenar apuntaría al espacio equivocado.
  useEffect(() => {
    setSelected(null);
    setCerrado(null);
    setEnContrato([]);
  }, [sede]);

  /** Las dos pantallas tienen SIEMPRE un periodo puesto.
   *
   *  Sin periodo el plano contestaba con la otra escala —«qué pasa hoy», siete
   *  clases— donde `free` contra `maintenance` da ΔE 3.6 en deuteranopía: el
   *  mismo color para dos estados opuestos. Con periodo pinta la escala de
   *  tres, que es la única que la separación aguanta. «Hoy» sigue existiendo:
   *  es un periodo de un día, que es lo que de verdad es.
   *
   *  En Vender arranca en treinta días porque «hoy» no es una pregunta
   *  comercial —lo que se vende es una temporada— y sin eso entrar a Vender
   *  mostraba el contador de libres en cero. En Supervisar arranca en hoy, que
   *  es de lo que ese tablero habla. */
  useEffect(() => {
    if (mapRange) return;
    if (modoEfectivo !== "vender") { setMapRange(hoyComoRango()); return; }
    const from = new Date();
    const to = new Date(from);
    to.setDate(to.getDate() + 30);
    setMapRange({ from, to });
  }, [modoEfectivo, mapRange]);

  // ── Map search / status filter (per rentable face) ──
  const mapMatch = useMemo<MapMatch | null>(() => {
    const q = normalizeText(mapQuery.trim());
    if (!q && mapFilter === "todos" && !mapCategoria) return null;
    const faceFlags = new Map<string, boolean[]>();
    let count = 0;
    fixtures.forEach((f) => {
      // Por tipo de TARIFA y no por familia: la fila que se toca dice «Isla
      // · $1.200.000», así que filtrar por «Muebles» —la familia a la que la
      // isla pertenece— dejaría en el plano bateas y muebles que no son lo
      // que se pidió. El rótulo y el filtro tienen que nombrar lo mismo.
      const deLaCategoria = !mapCategoria || rateTypeOf(f) === mapCategoria;
      const flags = commercialFacesOf(f).map((entry) => {
        const ok = deLaCategoria
          && (!q || faceMatchesQuery(entry, q))
          && faceMatchesFilter(entry, mapFilter);
        if (ok) count++;
        return ok;
      });
      faceFlags.set(f.id, flags);
    });
    return { faceFlags, count };
  }, [fixtures, mapQuery, mapFilter, mapCategoria]);

  // La lista de precios de la sede: qué familias hay, cuántas caras de cada una
  // están libres en el periodo, cuántas se liberan adentro, y a cuánto sale.
  //
  // Usa la misma `rangeAvailability` que el mapa y que la clave del plano, así
  // que los números no pueden discrepar entre sí.
  //
  // Ordenada por TARIFA, de mayor a menor. Antes iba por cantidad de caras
  // libres, y eso contestaba «de qué me sobra», que no es la pregunta: cuando
  // hay un proveedor del otro lado del teléfono lo que se busca es qué es lo
  // caro que todavía está disponible. La cantidad ya se ve en la columna de al
  // lado y no necesita mandar el orden.
  const porCategoria = useMemo(() => {
    if (!mapRange) return [];
    const acum = new Map<string, {
      libres: Disponible[]; parciales: Disponible[]; total: number; tarifa: number | null;
    }>();
    fixtures.forEach((f) => {
      const cat = rateTypeOf(f);
      const ref = referenceRateFor(referenceRates, f.sede || sede, cat);
      commercialFacesOf(f).forEach((face) => {
        const e = acum.get(cat) ?? { libres: [], parciales: [], total: 0, tarifa: ref };
        const a = rangeAvailability(face, mapRange.from, mapRange.to);
        if (a === "libre") {
          e.libres.push({ code: codigoVisible(face), fixture: f, face: face.face });
        } else if (a === "parcial") {
          e.parciales.push({
            code: codigoVisible(face), fixture: f, face: face.face,
            desde: primerDiaLibre(face, mapRange.from, mapRange.to),
          });
        }
        e.total++;
        if (e.tarifa === null) e.tarifa = ref;
        acum.set(cat, e);
      });
    });
    return [...acum].map(([cat, v]) => ({ cat, ...v }))
      .sort((a, b) => (b.tarifa ?? -1) - (a.tarifa ?? -1));
  }, [fixtures, mapRange, referenceRates, sede]);

  // ── KPI computation (per rentable face — doubles count as 2 units) ──
  // Buckets use displayStatus() so KPIs, Atención, map chips and table agree.
  const kpis = useMemo(() => {
    const faces = fixtures.flatMap(commercialFacesOf);
    const total = faces.length;
    // Kept separate so the strip can explain why "Espacios" is lower than the
    // number of fixtures drawn on the plan.
    const rentableFixtures = fixtures.filter(isRentable).length;
    const nonRentable = fixtures.length - rentableFixtures;
    // Every bucket comes from displayStatus(), which now reads the contract's
    // dates. That single source is what keeps the cards, the map chips and the
    // table agreeing — counting "expired" as available here while the chip of
    // the same name excluded it made the two disagree on screen.
    const ds = faces.map((x) => displayStatus(x));
    const phases = faces.map((x) => contractPhase(x));
    const occupied  = ds.filter((s) => s === "active" || s === "expiring").length;
    const committed = ds.filter((s) => s === "committed").length;
    const free      = ds.filter((s) => s === "free").length;
    // reserved + maintenance + expired + occupied-without-dates. Kept as the
    // remainder so Libres + Ocupados + Contratados never overstate the total.
    const held = total - occupied - committed - free;
    const occPct = total ? Math.round((occupied / total) * 100) : 0;
    // Money actually being earned this month — a signed contract that has not
    // started yet is not revenue, and counting it overstated the monthly income.
    const revenue = faces
      .filter((_, i) => phases[i] === "vigente")
      .reduce((s, x) => s + (x.negotiatedValue ?? 0), 0);
    const committedRevenue = faces
      .filter((_, i) => phases[i] === "pendiente")
      .reduce((s, x) => s + (x.negotiatedValue ?? 0), 0);

    const expired: ContractEntry[] = [];
    const expiring: ContractEntry[] = [];
    const noContract: FaceEntry[] = [];
    faces.forEach((x, i) => {
      if (ds[i] === "expired") expired.push({ ...x, days: daysUntil(x.endDate) });
      else if (ds[i] === "expiring") expiring.push({ ...x, days: daysUntil(x.endDate) });
      else if (ds[i] === "no_contract") noContract.push(x);
    });
    expired.sort((a, b) => a.days - b.days);
    expiring.sort((a, b) => a.days - b.days);

    // Top suppliers — by what they are paying NOW, so the ranking matches the
    // monthly revenue figure above instead of mixing in future commitments.
    const supplierMap: Record<string, { revenue: number; count: number }> = {};
    faces.forEach((x, i) => {
      if (!x.supplierName || !x.negotiatedValue || phases[i] !== "vigente") return;
      if (!supplierMap[x.supplierName]) supplierMap[x.supplierName] = { revenue: 0, count: 0 };
      supplierMap[x.supplierName].revenue += x.negotiatedValue;
      supplierMap[x.supplierName].count++;
    });
    const topSuppliers = Object.entries(supplierMap)
      .map(([name, { revenue: r, count }]) => ({ name, revenue: r, count }))
      .sort((a, b) => b.revenue - a.revenue)
      // Diez y no seis: el panel contesta «de quién depende la sede», y con
      // un corte en seis un proveedor que pone el 8% quedaba afuera sin que
      // nada dijera que había más. Lo que no entra en el alto, scrollea.
      .slice(0, 10);

    // Contracts paying below the reference rate for their type + sede.
    // Only meaningful gaps (≥1%) — a peso of rounding is not an anomaly.
    // Workers hold no rates, so for them this list is always empty.
    // Includes contracts already signed for a future period: catching an
    // under-priced deal before it starts is the only moment it can still be
    // renegotiated.
    const belowReference: (FaceEntry & { ref: number; gapPct: number })[] = [];
    faces.forEach((x, i) => {
      if ((phases[i] !== "vigente" && phases[i] !== "pendiente") || !(x.negotiatedValue > 0)) return;
      const ref = referenceRateFor(referenceRates, x.fixture.sede || sede, rateTypeOf(x.fixture));
      if (ref === null) return;
      const gapPct = Math.round((1 - x.negotiatedValue / ref) * 100);
      if (gapPct >= 1) belowReference.push({ ...x, ref, gapPct });
    });
    belowReference.sort((a, b) => b.gapPct - a.gapPct);

    return {
      total, occupied, committed, free, held, occPct, revenue, committedRevenue,
      rentableFixtures, nonRentable,
      expired, expiring, noContract,
      topSuppliers, belowReference,
    };
  }, [fixtures, referenceRates, sede]);

  // How much of the sede can actually be sold for the chosen period. Counted
  // per face, like every other total on this page.
  const rangeTally = useMemo(() => {
    if (!mapRange) return { libres: 0, parciales: 0, tomados: 0 };
    let libres = 0, parciales = 0, tomados = 0;
    fixtures.flatMap(commercialFacesOf).forEach((face) => {
      const a = rangeAvailability(face, mapRange.from, mapRange.to);
      if (a === "libre") libres++;
      else if (a === "parcial") parciales++;
      else tomados++;
    });
    return { libres, parciales, tomados };
  }, [fixtures, mapRange]);

  // ── Montaje: lo que hay que mirar ────────────────────────────────────────
  //
  // Dos listas distintas porque piden dos cosas distintas. "No se pudo" es un
  // problema que alguien tiene que resolver hoy —el proveedor no entregó, el
  // espacio está ocupado por otra cosa— y trae su motivo. "Sin montar" es
  // silencio: el contrato ya arrancó, se está cobrando, y nadie dijo nada.
  const montaje = useMemo(() => {
    const noMontado: (FaceEntry & { reporte: MountConfirmation })[] = [];
    const sinMontar: (FaceEntry & { dias: number })[] = [];
    let viejosSinReporte = 0;
    fixtures.flatMap(commercialFacesOf).forEach((entry) => {
      const fase = contractPhase(entry);
      // Lo vencido ya no se monta y lo libre no tiene qué montar.
      if (fase !== "vigente" && fase !== "pendiente") return;
      const reporte = montajeDe(entry);
      if (reporte && reporte.estado === "no_montado") {
        noMontado.push({ ...entry, reporte });
        return;
      }
      if (reporte) return; // montado
      // Solo lo que YA arrancó: un contrato que empieza en tres semanas no
      // está sin montar, está esperando.
      if (fase !== "vigente") return;
      const dias = Math.max(0, -daysUntil(entry.startDate));
      // Un contrato que arrancó hace meses y sigue corriendo se montó hace
      // meses: lo que falta es el reporte, no la exhibición. Nadie va a ir a
      // fotografiarlo ahora. Mezclarlos con los de esta semana enterraría lo
      // accionable — en NAVE hay contratos de enero, de antes de que el
      // montaje existiera. No se descartan en silencio: se cuentan aparte.
      if (dias > VENTANA_MONTAJE_DIAS) {
        viejosSinReporte++;
        return;
      }
      sinMontar.push({ ...entry, dias });
    });
    noMontado.sort((a, b) =>
      (b.reporte.confirmado_en ?? "").localeCompare(a.reporte.confirmado_en ?? ""));
    sinMontar.sort((a, b) => b.dias - a.dias);
    return { noMontado, sinMontar, viejosSinReporte };
  }, [fixtures, montajeDe]);


  // ─── Lo que la franja de Supervisar necesita saber ──────────────────────

  /** La tarifa de referencia de una cara. Es lo que se pediría por ella, no lo
   *  que se cobra: para una cara libre es el único precio que existe. */
  const tarifaDe = useCallback(
    (e: FaceEntry): number | null =>
      referenceRateFor(referenceRates, e.fixture.sede || sede, rateTypeOf(e.fixture)),
    [referenceRates, sede],
  );

  /** Lo que la sede NO está cobrando: las caras libres hoy, valoradas a tarifa.
   *
   *  Es la cifra que faltaba. «Ocupación 35%» dice que sobra sala; «$8.730.000
   *  al mes sin alquilar» dice cuánto vale esa sala, y ése es el número con el
   *  que se decide si vale la pena salir a buscar proveedores.
   *
   *  La tasa diaria divide por 30 y no por los días del periodo elegido: la
   *  tarifa está expresada al mes, así que su valor por día es tarifa/30 mire
   *  uno una ventana de siete días o de tres meses. Es la misma cuenta que usa
   *  el resto de la pantalla para prorratear.
   *
   *  Las caras cuyo tipo no tiene tarifa cargada se cuentan aparte y se dicen:
   *  sin eso el total parece chico y nadie sabe por qué. */
  const sinAlquilar = useMemo(() => {
    let plata = 0, caras = 0, sinTarifa = 0;
    fixtures.flatMap(commercialFacesOf).forEach((face) => {
      if (displayStatus(face) !== "free") return;
      caras++;
      const ref = tarifaDe(face);
      if (ref) plata += ref; else sinTarifa++;
    });
    return { plata, caras, sinTarifa, porDia: Math.round(plata / 30) };
  }, [fixtures, tarifaDe]);

  /** Lo que se cae si no se renueva, en plata y en porcentaje del canon. */
  const porVencer = useMemo(() => {
    const plata = kpis.expiring.reduce((t, e) => t + (e.negotiatedValue ?? 0), 0);
    return { plata, pct: kpis.revenue ? Math.round((plata * 100) / kpis.revenue) : 0 };
  }, [kpis]);

  /** De quién depende el canon. Con el sello de vencimiento, que es lo que
   *  convierte un ranking en una alarma: «COCA COLA es el 23%» es un dato;
   *  «brayan es el 19% y vence» es una llamada que hay que hacer. */
  const proveedores = useMemo(() => {
    const venciendo = new Set(kpis.expiring.map((e) => e.supplierName).filter(Boolean));
    const total = kpis.revenue || 1;
    return kpis.topSuppliers.map((x) => ({
      ...x,
      pct: Math.round((x.revenue / total) * 100),
      vence: venciendo.has(x.name),
    }));
  }, [kpis]);

  /** Las caras contratadas y sin reportar, para que el chip «Sin montar» de la
   *  tabla filtre exactamente la misma lista que muestran los pendientes. */
  const sinMontarSet = useMemo(
    () => new Set(montaje.sinMontar.map((e) => `${e.fixture.id}-${e.face}`)),
    [montaje.sinMontar],
  );

  /** Las temporadas comerciales que pisan el periodo, para el fondo del riel. */
  const temporadasDelPeriodo = useMemo(() => {
    if (!mapRange) return [];
    return upcomingSeasons(new Date(), seasonWindows).filter(
      (t) => t.from <= mapRange.to && t.to >= mapRange.from,
    );
  }, [mapRange, seasonWindows]);

  const attentionCount =
    kpis.expired.length + kpis.expiring.length + kpis.noContract.length +
    (isAdmin ? kpis.belowReference.length + montaje.noMontado.length + montaje.sinMontar.length : 0);

  /** Cuántas caras contesta cada chip de la tabla. Un filtro que no puede
   *  devolver nada no se dibuja: es la misma regla que ya gobernaba el parte,
   *  y es lo que evita que alguien toque «Sin montar 0» y crea que se rompió. */
  const chipsTabla = useMemo(() => {
    const todos: { id: MapFilter; label: string; n: number }[] = [
      { id: "todos", label: "Todas", n: kpis.total },
      { id: "expiring", label: "Por vencer", n: kpis.expiring.length },
      { id: "sin_montar", label: "Sin montar", n: montaje.sinMontar.length },
      { id: "free", label: "Libres", n: kpis.free },
    ];
    return todos.filter((c) => c.id === "todos" || c.n > 0);
  }, [kpis, montaje.sinMontar.length]);

  /** «lunes 31 de agosto de 2026». Es el único lugar de la pantalla donde se
   *  dice qué día es, y hace falta: todo lo demás —los días que faltan, lo que
   *  vence, el periodo— se cuenta contra hoy. */
  const hoyLargo = useMemo(() => {
    const t = new Date().toLocaleDateString("es-CO", {
      weekday: "long", day: "numeric", month: "long", year: "numeric",
    });
    return t.replace(",", "");
  }, []);

  /** La tarjeta del mapa. Es la MISMA en los dos modos —el mapa no cambia
   *  porque cambie para qué estás mirándolo—; sólo cambian el subtítulo y las
   *  palabras de la clave, porque la pregunta que se le hace sí cambia. */
  /** La tarjeta del plano. No lleva alto: lo pone el lienzo, que se mide con
   *  la proporción del plano de la sede. Fijarlo dejaba medio panel en blanco
   *  alrededor de un dibujo chico. */
  const tarjetaMapa = () => (
        <Card style={{ position: "relative", flex: "1 1 480px", minWidth: 0 }}>
          <CardHeader
            title={`Piso de ${sede}`}
            sub={modoEfectivo === "vender"
              ? `${kpis.total} comercializables · ${fixtures.length} muebles`
              : undefined}
            right={
              <>
                {/* El filtro estaba arriba, en la franja de controles, junto a
                    cosas que no filtran el mapa. Filtrar tacha los muebles del
                    plano: es un control DEL mapa y vive en el borde del mapa,
                    como la regla al costado de un plano impreso.

                    Sin caja y con una línea abajo: vacío —que es como está el
                    95% del tiempo— no ocupa. Y dice «filtrar», que es lo que
                    hace, y no «buscar», que promete llevarte a otra pantalla. */}
                <div style={{ position: "relative", width: 118, flexShrink: 0 }}>
                  <Search
                    size={12}
                    style={{
                      position: "absolute", left: 1, top: "50%",
                      transform: "translateY(-50%)", color: "var(--ink-4)", pointerEvents: "none",
                    }}
                  />
                  <input
                    type="text"
                    value={mapQuery}
                    onChange={(e) => setMapQuery(e.target.value)}
                    placeholder="Filtrar"
                    style={{
                      width: "100%", height: 24, padding: "0 20px 0 17px",
                      borderRadius: 0, border: "none",
                      borderBottom: "1px solid var(--line)",
                      background: "transparent", color: "var(--ink-1)",
                      fontSize: 12, fontFamily: "inherit", outline: "none",
                    }}
                    onFocus={(e) => { e.currentTarget.style.borderBottomColor = "var(--ink-1)"; }}
                    onBlur={(e) => { e.currentTarget.style.borderBottomColor = "var(--line)"; }}
                  />
                  {mapQuery && (
                    <button
                      onClick={() => setMapQuery("")}
                      title="Limpiar el filtro"
                      style={{
                        position: "absolute", right: 0, top: "50%",
                        transform: "translateY(-50%)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        width: 18, height: 18, borderRadius: 99,
                        background: "var(--surface-3)", border: "none",
                        color: "var(--ink-2)", cursor: "pointer",
                      }}
                    >
                      <X size={10} />
                    </button>
                  )}
                </div>
                <MapLegend range={mapRange} tally={rangeTally} modo={modoEfectivo} />
              </>
            }
          />

          <div style={{ padding: "0 14px 12px", display: "flex" }}>
            <IsoMap
              fixtures={fixtures}
              /* En Vender se marcan TODOS los del contrato; en Supervisar, el
                 que se está mirando. */
              selectedIds={modoEfectivo === "vender"
                ? espaciosDelContrato.map((e) => e.fixture.id)
                : selected ? [selected.id] : []}
              onSelect={selectFixture}
              match={mapMatch}
              range={mapRange}
              rotulos={modoEfectivo === "vender" ? "todos" : "elegido"}
              enfocar={modoEfectivo !== "vender"}
            />
          </div>

          {/* Quick look, anchored to the fixture. Hidden once the full
              detail takes over the rail so the two never compete. */}
          {selected && anchor && !detailFull && (
            <FixturePopover
              fixture={selected}
              anchor={anchor}
              isAdmin={isAdmin}
              onExpand={() => setDetailFull(true)}
              onNegociar={isAdmin ? () => negociar(selected) : undefined}
              onClose={closeDetail}
            />
          )}
        </Card>
  );

  /** El panel de tarifas de Vender: qué hay de cada tipo, cuánto entra en el
   *  periodo, y a cuánto sale.
   *
   *  Está en la pantalla de vender y no en un modal porque es la respuesta a
   *  «¿qué le ofrezco?». Tenerlo detrás de un botón obligaba a abrir, mirar,
   *  cerrar y volver a mirar el plano — cuatro gestos para un dato que se usa
   *  en cada llamada. */
  /** Las pastillas de un tipo: primero lo libre todo el periodo, después lo
   *  que se libera adentro, con su fecha. */
  const chipsDe = (g: { libres: Disponible[]; parciales: Disponible[] }) =>
    [...g.libres, ...g.parciales].map((d) => (
      <ChipEspacio
        key={`${d.fixture.id}-${d.face}`}
        code={d.code}
        desde={d.desde}
        onClick={() => alternarCara(d.fixture.id, d.face)}
        puesto={enContrato.some((x) => x.id === d.fixture.id && x.face === d.face)}
      />
    ));

  /** Los códigos sólo mientras no hay contrato armado: ahí la hoja de la
   *  derecha está vacía y la pregunta es cuáles hay. Con la ficha abierta la
   *  pregunta ya es otra y los códigos la empujarían fuera de la pantalla. */
  const conCodigos = espaciosDelContrato.length === 0 && !cerrado;

  const panelTarifas = (
    <Card style={{ flex: "1 1 auto", minHeight: 0 }}>
      <CardHeader title="Tarifa de referencia" right={<span>al mes</span>} />
      <div style={{ padding: "0 15px 12px", overflowY: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {[
                { t: "Tipo de espacio" },
                { t: "Libres · entran", w: 92, der: true },
                { t: "Tarifa", w: 96, der: true },
              ].map((c) => (
                <th
                  key={c.t}
                  style={{
                    width: c.w, padding: "0 0 5px", textAlign: c.der ? "right" : "left",
                    fontFamily: "var(--font-mono)", fontWeight: 600, fontSize: 9.5,
                    letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ink-3)",
                    borderBottom: "1px solid var(--line)", whiteSpace: "nowrap",
                  }}
                >
                  {c.t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Tocar una familia la aísla en el plano. Es lo que hacían los
                chips de «lo que queda en este periodo», que vivían sueltos
                arriba de la pantalla, lejos de los números que explicaban.
                Acá el filtro está SOBRE el dato: se lee «Isla · 3 libres ·
                $1.200.000», se toca, y el plano se queda sólo con las islas. */}
            {porCategoria.map(({ cat, libres, parciales, tarifa }) => {
              const activa = mapCategoria === cat;
              const cuantas = libres.length + parciales.length;
              return (
              <Fragment key={cat}>
              <tr
                onClick={() => setMapCategoria(activa ? null : cat)}
                title={activa
                  ? "Ver todos los tipos en el plano"
                  : `Ver sólo ${rateTypeLabel(cat)} en el plano`}
                style={{ cursor: "pointer", background: activa ? "var(--surface-2)" : undefined }}
              >
                <td style={{
                  ...celdaTarifa,
                  fontWeight: activa ? 700 : 400,
                  boxShadow: activa ? "inset 2px 0 0 var(--ink-1)" : undefined,
                  paddingLeft: activa ? 8 : 0,
                  borderBottom: conCodigos && cuantas > 0 ? "none" : celdaTarifa.borderBottom,
                }}>
                  {rateTypeLabel(cat)}
                </td>
                <td style={{
                  ...celdaTarifa, textAlign: "right",
                  borderBottom: conCodigos && cuantas > 0 ? "none" : celdaTarifa.borderBottom,
                }}>
                  <span style={{ color: libres.length === 0 ? "var(--ink-3)" : "var(--ink-2)" }}>
                    {libres.length}
                  </span>
                  {parciales.length > 0 && (
                    <>
                      {" "}
                      <span
                        title={`${parciales.length} se libera${parciales.length === 1 ? "" : "n"} adentro del periodo`}
                        style={{ color: "var(--entra-txt)", fontWeight: 700 }}
                      >
                        +{parciales.length}
                      </span>
                    </>
                  )}
                </td>
                <td style={{
                  ...celdaTarifa, textAlign: "right",
                  borderBottom: conCodigos && cuantas > 0 ? "none" : celdaTarifa.borderBottom,
                }}>
                  {tarifa ? formatCOP(tarifa) : <span style={{ color: "var(--ink-vacio)" }}>sin tarifa</span>}
                </td>
              </tr>

              {/* Los códigos de lo que está libre, debajo de su tipo.
                  «Isla · 3» dice cuántas quedan y no CUÁLES, y para averiguarlo
                  había que buscar los prismas verdes a ojo entre ciento seis
                  muebles. Van acá y no en un panel aparte porque el panel
                  aparte repetiría los mismos siete tipos con los mismos siete
                  precios: es el mismo dato con una vuelta más de detalle.

                  Sólo mientras no hay contrato armado. Después son ruido —lo
                  que se necesita entonces es el formulario— y encima empujan
                  la ficha fuera de la pantalla. */}
              {conCodigos && cuantas > 0 && (
                <tr>
                  <td colSpan={3} style={{
                    padding: "0 0 7px", borderBottom: "1px solid var(--line-soft)",
                  }}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {chipsDe({ libres, parciales })}
                    </div>
                  </td>
                </tr>
              )}
              </Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td style={{ ...pieTarifa }}>
                {kpis.total} espacio{kpis.total === 1 ? "" : "s"} comercializable{kpis.total === 1 ? "" : "s"}
              </td>
              <td style={{ ...pieTarifa, textAlign: "right", color: "var(--ink-1)", fontWeight: 700 }}>
                {rangeTally.libres}
                {rangeTally.parciales > 0 && (
                  <> <span style={{ color: "var(--entra-txt)" }}>+{rangeTally.parciales}</span></>
                )}
              </td>
              <td style={{ ...pieTarifa, textAlign: "right", color: "var(--ink-1)", fontWeight: 700 }}>
                {rangeTally.libres + rangeTally.parciales} al cerrar
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  );

  /** «Qué está libre», como panel propio.
   *
   *  Es el mismo contenido que cuelga de la lista de precios, mudado de
   *  columna: con la ficha del contrato abierta la columna derecha mide medio
   *  metro más que la izquierda, y ese desnivel dejaba la esquina de abajo a la
   *  izquierda en gris. Los códigos van donde falta alto, que es también donde
   *  sirven — se sigue eligiendo espacios con el contrato a medio llenar.
   *
   *  A todo el ancho de la columna las pastillas entran en una o dos filas por
   *  tipo, así que ocupa menos que en la columna angosta y se lee de un golpe. */
  const panelCodigos = (
    <Card style={{ flex: "1 1 auto", minHeight: 0 }}>
      <CardHeader
        title="Qué está libre"
        sub={`${rangeTally.libres + rangeTally.parciales} de ${kpis.total}`}
        right={<span>tocá uno para sumarlo al contrato</span>}
      />
      <div style={{ padding: "0 15px 12px", overflowY: "auto" }}>
        {porCategoria
          .filter((g) => g.libres.length + g.parciales.length > 0)
          .map((g) => (
            <div
              key={g.cat}
              style={{
                display: "flex", alignItems: "baseline", gap: 12,
                padding: "6px 0", borderTop: "1px solid var(--line-soft)",
              }}
            >
              <span style={{ fontSize: 13, color: "var(--ink-2)", width: 150, flexShrink: 0 }}>
                {rateTypeLabel(g.cat)}
              </span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, flex: 1, minWidth: 0 }}>
                {chipsDe(g)}
              </div>
              <span style={{
                fontSize: 12, color: "var(--ink-3)", flexShrink: 0, whiteSpace: "nowrap",
              }}>
                {g.tarifa ? `${formatCOP(g.tarifa)} al mes` : "sin tarifa"}
              </span>
            </div>
          ))}
      </div>
    </Card>
  );

  return (
    <div
      style={{
        flex: 1, overflowY: "auto", padding: "10px 12px 16px",
        background: "var(--bg)",
      }}
    >
      {/* ── La barra de la pantalla ────────────────────────────────────────
          Dónde estás, para qué estás, y de qué periodo se está hablando. Las
          tres cosas de las que depende todo lo que se lee abajo, en un solo
          renglón y en ese orden.

          Acá vivía un titular de $12.400.000 en cuerpo 27 con «TERRON · 16
          espacios · 2 sedes activas» debajo. Ese número tenía el tamaño de un
          titular y el contenido de un pie de página: no se decide nada con el
          canon total de la sede, y encima repetía datos que están en la tabla.
          El nombre de la sede tampoco es un hecho, es el estado de un control:
          se dice UNA vez, acá, y no vuelve a aparecer. */}
      <div
        style={{
          display: "flex", alignItems: "center", gap: 0,
          marginBottom: 10, flexWrap: "wrap",
          background: "var(--surface)", border: "1px solid var(--line)",
          borderRadius: "var(--r-xl)", padding: "0 14px", minHeight: 46,
        }}
      >
        <div
          style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "0 16px 0 0", borderRight: "1px solid var(--line)",
            alignSelf: "stretch",
          }}
        >
          <span className="rotulo">Sede</span>
          <select
            value={sede}
            onChange={(e) => setSede(e.target.value)}
            aria-label="Sede"
            style={{
              background: "transparent", border: "none", outline: "none",
              fontFamily: "inherit", fontWeight: 700, fontSize: 17,
              letterSpacing: "-0.01em", color: "var(--ink-1)", cursor: "pointer",
              padding: 0,
            }}
          >
            {/* Cada sede con cuántos muebles tiene: el selector lista TODAS,
                tengan plano o no, así que acá se ve de una cuál está cargada y
                cuál está en cero. */}
            {/* Sólo el nombre. El conteo iba adentro de la opción y un
                `select` muestra el texto de la elegida: en pantalla se leía
                «TERRON · 0» en cuerpo 17, con un número pegado al nombre que
                parecía parte del nombre. El dato no se pierde —va al lado, en
                cuerpo chico— y ahí se lee como lo que es. */}
            {sedes.map((x) => (
              <option key={x} value={x}>{x}</option>
            ))}
          </select>
          <span style={{ fontSize: 12, color: "var(--ink-3)", whiteSpace: "nowrap" }}>
            de {sedes.length}
            {" · "}
            {(fixturesBySede[sede] ?? []).length} mueble
            {(fixturesBySede[sede] ?? []).length === 1 ? "" : "s"}
          </span>
        </div>

        {isAdmin && (
          <nav style={{ display: "flex", marginLeft: 20, alignSelf: "stretch" }}>
            {([
              { id: "vender", label: "Vender", badge: 0 },
              { id: "supervisar", label: "Supervisar", badge: attentionCount },
            ] as const).map(({ id, label, badge }) => {
              const activo = modoEfectivo === id;
              return (
                <button
                  key={id}
                  onClick={() => setModo(id)}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    padding: "0 18px", border: "none",
                    borderBottom: `3px solid ${activo ? "var(--ink-1)" : "transparent"}`,
                    marginBottom: -1, background: "transparent",
                    cursor: "pointer", fontFamily: "inherit",
                    fontSize: 14.5, fontWeight: activo ? 700 : 500,
                    color: activo ? "var(--ink-1)" : "var(--ink-3)",
                    transition: "color .12s, border-color .12s",
                  }}
                >
                  {label}
                  {badge > 0 && (
                    <span style={{
                      fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700,
                      color: "var(--ocupado)",
                    }}>
                      {badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        )}

        {/* El periodo, en los dos modos. El mercaderista está SIEMPRE en
            Supervisar, así que sacarlo de ahí lo dejaría sin control de
            periodo para siempre.

            Va como TEXTO y no como la fila de siete temporadas: esa fila mide
            700 px y partía la barra en dos renglones, con la fecha y los
            botones caídos abajo. El periodo hay que verlo siempre —todo lo
            que se lee está medido contra él— pero elegirlo es algo que se
            hace de a ratos, así que se ve siempre y se despliega al tocarlo. */}
        <button
          onClick={() => setPeriodoAbierto((x) => !x)}
          title="Elegir el periodo"
          style={{
            marginLeft: 20, display: "inline-flex", alignItems: "center", gap: 7,
            border: "none", background: "transparent", cursor: "pointer",
            fontFamily: "inherit", fontSize: 13, color: "var(--ink-1)",
            padding: "4px 0", borderBottom: `1px solid ${periodoAbierto ? "var(--ink-1)" : "var(--line-strong)"}`,
          }}
        >
          <CalendarRange size={13} style={{ color: "var(--ink-4)" }} />
          {mapRange ? describeRange(mapRange) : "Hoy"}
          <ChevronDown
            size={12}
            style={{
              color: "var(--ink-4)",
              transform: periodoAbierto ? "rotate(180deg)" : "none",
              transition: "transform .12s",
            }}
          />
        </button>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 13, color: "var(--ink-1)", fontWeight: 500, whiteSpace: "nowrap" }}>
            {hoyLargo}
          </span>
          {isAdmin && (
            <button
              onClick={() => setCargaAbierta(true)}
              title="Cargar una tanda de contratos desde un Excel o un CSV"
              style={botonBarra}
            >
              <FileSpreadsheet size={13} style={{ color: "var(--ink-3)" }} />
              Planilla
            </button>
          )}
          {isAdmin && (
            <button
              onClick={() => setRatesOpen(true)}
              title="Tarifas de referencia por tipo de mueble"
              style={botonBarra}
            >
              <SlidersHorizontal size={13} style={{ color: "var(--ink-3)" }} /> Tarifas
            </button>
          )}
          <button onClick={() => syncFromServer()} title="Traer los cambios del servidor" style={botonBarra}>
            <RefreshCw size={13} style={{ color: "var(--ink-3)" }} /> Actualizar
          </button>
        </div>
      </div>

      {periodoAbierto && (
        <div style={{
          display: "flex", alignItems: "center", flexWrap: "wrap",
          padding: "8px 14px", marginBottom: 10,
          background: "var(--surface)", border: "1px solid var(--line)",
          borderRadius: "var(--r-xl)",
        }}>
          <SeasonPicker range={mapRange} onChange={setMapRange} />
        </div>
      )}

      {fixtures.length === 0 ? (
        <EmptyDashboard sede={sede} isAdmin={isAdmin} />
      ) : modoEfectivo === "vender" ? (
        /* Vender: el plano y la escalera a la izquierda, el contrato y las
           tarifas a la derecha. Sin KPIs — para poner un precio no sirve la
           ocupación de hoy, sirve ver qué hay libre en el periodo, cuándo se
           suelta lo que falta y a cuánto sale. */
        <ModoVender
          espacios={espaciosDelContrato}
          ultimo={selected}
          onQuitar={quitarDelContrato}
          onCambiarCara={alternarCara}
          sede={sede}
          rango={mapRange}
          cerrado={cerrado}
          panelTarifas={panelTarifas}
          onGuardado={(parches, resumen) => {
            // El JSON del layout es lo que pinta el mapa y responde la
            // disponibilidad; sin esto el contrato existiría en la base y los
            // espacios seguirían viéndose libres. Se aplican TODOS los parches
            // en un solo `commit`: uno por espacio dispararía N guardados del
            // layout, y el último pisaría a los anteriores.
            if (parches.length > 0) {
              const porMueble = new Map<string, { face: "A" | "B"; patch: Partial<FaceData> }[]>();
              for (const p of parches) {
                porMueble.set(p.fixtureId, [
                  ...(porMueble.get(p.fixtureId) ?? []),
                  { face: p.face, patch: p.patch },
                ]);
              }
              commit(
                fixtures.map((f) => {
                  const suyos = porMueble.get(f.id);
                  if (!suyos) return f;
                  let siguiente = f;
                  for (const { face, patch } of suyos) {
                    siguiente = face === "B"
                      ? { ...siguiente, faceB: { ...(siguiente.faceB ?? {}), ...patch } as FaceData }
                      : { ...siguiente, ...patch };
                  }
                  return siguiente;
                }),
              );
            }
            setSelected(null);
            setAnchor(null);
            setEnContrato([]);
            setCerrado(resumen);
          }}
          onCancelar={closeDetail}
          onSeguir={() => setCerrado(null)}
        >
          <div style={{ flex: "1 1 520px", minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>
            {tarjetaMapa()}

            {/* ── Cuándo se libera cada espacio ────────────────────────────
                La escalera. Contesta la pregunta con la que se negocia una
                fecha de arranque —«¿cuánto tengo si empiezo el 26?»— que
                ninguna cifra suelta contesta: «15 libres» es cierto hoy y
                deja de serlo el martes.

                No se dibuja si el periodo no tiene un solo cambio: una
                escalera sin escalón es una línea recta con un título. */}
            {mapRange && (
              <Card style={{ height: 274, flex: "0 0 auto" }}>
                <CardHeader
                  title="Cuándo se libera cada espacio"
                  sub={rangeTally.parciales > 0
                    ? `de ${rangeTally.libres} disponibles hoy a ${rangeTally.libres + rangeTally.parciales} al cerrar el periodo`
                    : `${rangeTally.libres} disponible${rangeTally.libres === 1 ? "" : "s"}, sin cambios en el periodo`}
                  right={<span>{describeRange(mapRange)}</span>}
                />
                <div style={{ flex: 1, minHeight: 0, padding: "0 15px 12px", display: "flex", overflow: "hidden" }}>
                  <Libera
                    fixtures={fixtures}
                    facesOf={commercialFacesOf}
                    tipoDe={(f) => rateTypeLabel(rateTypeOf(f))}
                    desde={mapRange.from}
                    hasta={mapRange.to}
                    temporadas={temporadasDelPeriodo}
                  />
                </div>
              </Card>
            )}

            {/* Con la ficha abierta la columna derecha mide medio metro más
                que ésta, y ese desnivel dejaba la esquina de abajo en gris. Los
                códigos se mudan acá: donde falta alto, que es también donde
                sirven —se sigue eligiendo espacios con el contrato a medio
                llenar—. Es el último panel de la columna, así que es el que
                absorbe la diferencia y deja las dos parejas abajo. */}
            {!conCodigos && porCategoria.length > 0 && panelCodigos}
          </div>
        </ModoVender>
      ) : (
        <>
          {/* ── La franja ──────────────────────────────────────────────────
              Cinco cifras y ninguna oración. Acá había un parte escrito en
              prosa; el que pone el canon sabe lo que hace y no necesita que
              se le explique el negocio, necesita el dato a mano.

              El orden no es decorativo: lo que entra, lo que no entra, lo que
              se puede caer, cuánto de la sala está trabajando, y qué se está
              cobrando sin haberlo armado. De izquierda a derecha, de lo
              seguro a lo que hay que ir a resolver. */}
          <Card style={{ flexShrink: 0, marginBottom: 10 }}>
            <CardHeader
              title={sede}
              sub={mapRange ? describeRange(mapRange) : "Hoy"}
              right={
                <span>
                  {kpis.occupied + kpis.committed} contrato
                  {kpis.occupied + kpis.committed === 1 ? "" : "s"} · {kpis.total} caras
                </span>
              }
            />
            {/* La plata sólo para quien la maneja. El servidor ya le borra el
                `negotiatedValue` a un mercaderista y nunca le manda las
                tarifas, así que estas tres cifras le llegarían en cero — y
                «CANON VIGENTE $0» no es discreción, es una sede que parece
                quebrada. Lo que él necesita saber es qué hay que montar y qué
                se está por caer, y eso sí lo ve, contado en espacios. */}
            <div style={{
              padding: "0 15px 12px", display: "flex", alignItems: "flex-start",
              gap: 16, flexWrap: "wrap",
            }}>
              {isAdmin ? (
                <>
                  <Cifra
                    rotulo="Canon vigente"
                    valor={formatCOP(kpis.revenue)}
                    notas={["al mes"]}
                  />
                  <Separador />
                  <Cifra
                    rotulo="Sin alquilar"
                    valor={formatCOP(sinAlquilar.plata)}
                    notas={[
                      `al mes a tarifa · ${sinAlquilar.caras} cara${sinAlquilar.caras === 1 ? "" : "s"}`,
                      ...(sinAlquilar.sinTarifa > 0
                        ? [`${sinAlquilar.sinTarifa} sin tarifa, fuera de la cuenta`] : []),
                    ]}
                    tasa={`${formatCOP(sinAlquilar.porDia)} por día vacío`}
                  />
                  <Separador />
                  <Cifra
                    rotulo="Vence en 30 días"
                    valor={formatCOP(porVencer.plata)}
                    notas={[`${porVencer.pct}% del canon · ${kpis.expiring.length} espacio${kpis.expiring.length === 1 ? "" : "s"}`]}
                    alarma
                  />
                </>
              ) : (
                <>
                  <Cifra
                    rotulo="Vence en 30 días"
                    valor={String(kpis.expiring.length)}
                    notas={["contratos que se caen"]}
                    alarma
                  />
                  <Separador />
                  <Cifra
                    rotulo="Libres"
                    valor={String(kpis.free)}
                    notas={[`de ${kpis.total} caras`]}
                  />
                </>
              )}
              <Separador />
              <Cifra
                rotulo="Ocupación"
                valor={`${kpis.occPct}%`}
                notas={[`${kpis.occupied} de ${kpis.total} caras`]}
                barra={kpis.occPct}
              />
              <Separador />
              <Cifra
                rotulo="Sin montar"
                valor={String(montaje.sinMontar.length)}
                notas={["contratados y sin armar"]}
              />
            </div>
          </Card>

          {/* ── El plano y lo que hay que revisar ─────────────────────────── */}
          <div
            style={{
              display: "flex", flexWrap: "wrap", alignItems: "stretch",
              gap: 10, marginBottom: 10,
            }}
          >
            {tarjetaMapa()}

            <div
              style={{
                flex: "0 1 382px", minWidth: 300,
                display: "flex", flexDirection: "column", gap: 10,
              }}
            >
              {selected && detailFull ? (
                <FixtureDetailCard
                  fixture={selected}
                  isAdmin={isAdmin}
                  face={detailFace}
                  onFace={setDetailFace}
                  onBack={closeDetail}
                  onNegociar={isAdmin ? () => negociar(selected, detailFace) : undefined}
                  onCancelado={(patch) => {
                    // Igual que al guardar: el JSON del layout es lo que
                    // pinta el mapa, así que soltar el contrato en la base
                    // sin tocarlo dejaría el mueble vendido en pantalla.
                    const objetivo = selected;
                    const cara = detailFace;
                    commit(
                      fixtures.map((f) =>
                        f.id !== objetivo.id
                          ? f
                          : cara === "B"
                          ? { ...f, faceB: { ...(f.faceB ?? {}), ...patch } as FaceData }
                          : { ...f, ...patch },
                      ),
                    );
                    closeDetail();
                  }}
                  onOpenFile={setViewerFile}
                />
              ) : (
              <Card style={{ height: 490, flexShrink: 0 }}>
                <CardHeader title="Para revisar" right={<span>{attentionCount}</span>} />
                {attentionCount === 0 ? (
                  <div style={{ padding: "0 15px 14px", fontSize: 13, color: "var(--libre)" }}>
                    Sin contratos vencidos ni próximos a vencer.
                  </div>
                ) : (
                  <div style={{
                    flex: 1, minHeight: 0, padding: "0 9px 10px",
                    display: "flex", flexDirection: "column", gap: 12, overflowY: "auto",
                  }}>
                    {kpis.noContract.length > 0 && (
                      <div>
                        <AtencionSection
                          label="Ocupado sin contrato"
                          color="var(--ocupado)"
                          monto={kpis.noContract.length}
                        />
                        {kpis.noContract.map((entry) => (
                          <AtencionRow
                            key={`nc-${entry.fixture.id}-${entry.face}`}
                            entry={entry}
                            chip="—"
                            dates="sin papeles"
                            selected={selected?.id === entry.fixture.id}
                            onSelect={() => selectFixture(entry.fixture)}
                          />
                        ))}
                      </div>
                    )}
                    {kpis.expired.length > 0 && (
                      <div>
                        <AtencionSection
                          label="Vencidos"
                          color="var(--ocupado)"
                          monto={isAdmin
                            ? formatCOP(kpis.expired.reduce((t, e) => t + (e.negotiatedValue ?? 0), 0))
                            : kpis.expired.length}
                        />
                        {kpis.expired.map((entry) => (
                          <AtencionRow
                            key={`v-${entry.fixture.id}-${entry.face}`}
                            entry={entry}
                            chip={`${Math.abs(entry.days)}d`}
                            dates={entry.endDate ? fechaEnCurso(entry.endDate) : "—"}
                            selected={selected?.id === entry.fixture.id}
                            onSelect={() => selectFixture(entry.fixture)}
                          />
                        ))}
                      </div>
                    )}
                    {kpis.expiring.length > 0 && (
                      <div>
                        <AtencionSection
                          label="Por vencer en 30 días"
                          color="var(--ocupado)"
                          monto={isAdmin ? formatCOP(porVencer.plata) : kpis.expiring.length}
                        />
                        {kpis.expiring.map((entry) => (
                          <AtencionRow
                            key={`pv-${entry.fixture.id}-${entry.face}`}
                            entry={entry}
                            chip={`${entry.days}d`}
                            dates={entry.endDate ? fechaEnCurso(entry.endDate) : "—"}
                            selected={selected?.id === entry.fixture.id}
                            onSelect={() => selectFixture(entry.fixture)}
                          />
                        ))}
                      </div>
                    )}
                    {isAdmin && montaje.noMontado.length > 0 && (
                      <div>
                        <AtencionSection
                          label="No se pudo montar"
                          color="var(--ocupado)"
                          monto={montaje.noMontado.length}
                        />
                        {montaje.noMontado.map((entry) => (
                          <AtencionRow
                            key={`nm-${entry.fixture.id}-${entry.face}`}
                            entry={entry}
                            chip="!"
                            dates={entry.reporte.motivo
                              ? MOTIVO_LABEL[entry.reporte.motivo as MountMotivo]
                              : "sin motivo"}
                            selected={selected?.id === entry.fixture.id}
                            onSelect={() => selectFixture(entry.fixture)}
                            onFoto={
                              entry.reporte.file_id
                                ? () => setViewerFile({
                                    id: entry.reporte.file_id as number,
                                    filename: entry.reporte.foto_nombre ?? "montaje.jpg",
                                    content_type: entry.reporte.foto_tipo ?? "image/jpeg",
                                    size: 0,
                                    uploaded_at: entry.reporte.confirmado_en ?? "",
                                  })
                                : undefined
                            }
                          />
                        ))}
                      </div>
                    )}
                    {isAdmin && montaje.sinMontar.length > 0 && (
                      <div>
                        <AtencionSection
                          label="Contratado sin montar"
                          color="var(--ink-3)"
                          monto={montaje.sinMontar.length}
                        />
                        {montaje.sinMontar.map((entry) => (
                          <AtencionRow
                            key={`sm-${entry.fixture.id}-${entry.face}`}
                            entry={entry}
                            chip={entry.dias === 0 ? "hoy" : `${entry.dias}d`}
                            /* Más de dos meses cobrando algo que nadie
                               reportó armado deja de ser un pendiente y pasa
                               a ser un problema. */
                            tono={entry.dias > 60 ? "alarma" : "sordo"}
                            dates="sin montar"
                            selected={selected?.id === entry.fixture.id}
                            onSelect={() => selectFixture(entry.fixture)}
                          />
                        ))}
                        {montaje.viejosSinReporte > 0 && (
                          <div style={{ padding: "8px 6px 0", fontSize: 11, color: "var(--ink-3)", lineHeight: 1.4 }}>
                            Además, {montaje.viejosSinReporte} contrato
                            {montaje.viejosSinReporte === 1 ? "" : "s"} que arrancó
                            {montaje.viejosSinReporte === 1 ? "" : "n"} hace más de{" "}
                            {VENTANA_MONTAJE_DIAS} días nunca se reportó
                            {montaje.viejosSinReporte === 1 ? "" : "n"}. A esa altura el
                            espacio ya está armado: lo que falta es el reporte.
                          </div>
                        )}
                      </div>
                    )}
                    {isAdmin && kpis.belowReference.length > 0 && (
                      <div>
                        <AtencionSection
                          label="Bajo tarifa de referencia"
                          color="var(--ink-3)"
                          monto={kpis.belowReference.length}
                        />
                        {kpis.belowReference.map((entry) => (
                          <AtencionRow
                            key={`bt-${entry.fixture.id}-${entry.face}`}
                            entry={entry}
                            chip={`−${entry.gapPct}%`}
                            tono="sordo"
                            dates={`${compactCOP(entry.negotiatedValue)} · ref ${compactCOP(entry.ref)}`}
                            selected={selected?.id === entry.fixture.id}
                            onSelect={() => selectFixture(entry.fixture)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </Card>
              )}

              {isAdmin && !(selected && detailFull) && (
                <Card style={{ flex: 1, minHeight: 0 }}>
                  <CardHeader title="Quién paga el canon" right={<span>al mes</span>} />
                  <div style={{ flex: 1, minHeight: 0, padding: "0 15px 12px", overflowY: "auto" }}>
                    {proveedores.length === 0 ? (
                      <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
                        Sin contratos vigentes con valor registrado.
                      </div>
                    ) : (
                      proveedores.map((x) => (
                        <SupplierRow
                          key={x.name}
                          name={x.name}
                          revenue={x.revenue}
                          pct={x.pct}
                          vence={x.vence}
                        />
                      ))
                    )}
                  </div>
                </Card>
              )}
            </div>
          </div>

          {/* ── Estado por espacio, a todo el ancho ───────────────────────── */}
          <Card>
            <CardHeader
              title="Estado por espacio"
              sub={`${sede} · ${kpis.total} espacio${kpis.total !== 1 ? "s" : ""}`}
              right={
                <div style={{ display: "flex", alignItems: "center" }}>
                  {chipsTabla.map((c, i) => {
                    const on = mapFilter === c.id;
                    return (
                      <button
                        key={c.id}
                        onClick={() => setMapFilter(c.id)}
                        style={{
                          fontSize: 11, fontFamily: "inherit", cursor: "pointer",
                          padding: "3px 8px", whiteSpace: "nowrap",
                          border: "1px solid var(--line)",
                          borderRight: i === chipsTabla.length - 1 ? "1px solid var(--line)" : 0,
                          borderRadius:
                            i === 0 ? "2px 0 0 2px"
                            : i === chipsTabla.length - 1 ? "0 2px 2px 0"
                            : 0,
                          background: on ? "var(--ink-1)" : "transparent",
                          borderColor: on ? "var(--ink-1)" : "var(--line)",
                          color: on ? "#fff" : "var(--ink-3)",
                          fontWeight: on ? 600 : 400,
                        }}
                      >
                        {c.label} {c.n}
                      </button>
                    );
                  })}
                </div>
              }
            />
            <SpacesTable
              fixtures={fixtures}
              isAdmin={isAdmin}
              query={mapQuery}
              filter={mapFilter}
              montajeDe={montajeDe}
              tarifaDe={tarifaDe}
              sinMontar={sinMontarSet}
              selectedId={selected?.id ?? null}
              onSelect={selectFixture}
            />
          </Card>
        </>
      )}

      {/* ── Overlays ──────────────────────────────────────────────────────── */}
      {viewerFile && (
        <FileViewerModal file={viewerFile} onClose={() => setViewerFile(null)} />
      )}
      {ratesOpen && isAdmin && <RatesModal onClose={() => setRatesOpen(false)} />}
      {cargaAbierta && isAdmin && (
        <CargaMasiva
          sede={sede}
          onCerrar={() => setCargaAbierta(false)}
          onGuardado={({ creados }) => {
            // Igual que al vender de a uno: el JSON del layout es lo que pinta
            // el mapa y responde la disponibilidad. Sin esto los contratos
            // existirían en la base y los espacios seguirían viéndose libres.
            const patches = new Map<string, { face: "A" | "B"; patch: Partial<FaceData> }[]>();
            for (const c of creados) {
              const completo = (c.codigo || "").toUpperCase();
              const sedeFila = (c.sede || sede || "").toUpperCase();
              const corto = sedeFila && completo.startsWith(`${sedeFila}-`)
                ? completo.slice(sedeFila.length + 1)
                : completo;
              const face: "A" | "B" = corto.endsWith("-B") ? "B" : "A";
              const base = face === "B" ? corto.slice(0, -2) : corto;
              const patch = {
                status: "occupied",
                supplierName: c.proveedor || "",
                brandCategory: c.marca || "",
                negotiatedValue: c.valor || 0,
                startDate: c.desde || "",
                endDate: c.hasta || "",
                observation: c.nota || "",
              } as Partial<FaceData>;
              patches.set(base, [...(patches.get(base) ?? []), { face, patch }]);
            }
            if (patches.size) {
              commit(
                fixtures.map((f) => {
                  const suyos = patches.get(f.code.toUpperCase());
                  if (!suyos) return f;
                  let siguiente = f;
                  for (const { face, patch } of suyos) {
                    siguiente = face === "B"
                      ? { ...siguiente, faceB: { ...(siguiente.faceB ?? {}), ...patch } as FaceData }
                      : { ...siguiente, ...patch };
                  }
                  return siguiente;
                }),
              );
            }
          }}
        />
      )}
    </div>
  );
}
