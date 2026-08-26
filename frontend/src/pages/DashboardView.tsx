import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  TrendingUp,
  AlertTriangle,
  Camera,
  RefreshCw,
  MapPin,
  Building2,
  Plus,
  X,
  FileText,
  ChevronRight,
  Search,
  SlidersHorizontal,
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
} from "../types/fixtures";
import type {
  UnifiedFixture, SpaceStatus, FaceData, RangeAvailability,
} from "../types/fixtures";
import SeasonPicker, { describeRange, type DateRange } from "../components/SeasonPicker/SeasonPicker";
import ModoVender from "../components/Contrato/ModoVender";
import type { ResumenContrato } from "../components/Contrato/Contrato";
import Planometria from "../components/Contrato/Planometria";
import CancelarContrato from "../components/Contrato/CancelarContrato";
import CargaMasiva from "../components/CargaMasiva/CargaMasiva";
import { inclusiveDays } from "../types/seasons";
import { nombreDeMueble } from "../utils/nomenclatura";
import { fechaCorta } from "../utils/propuesta";

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

type MapFilter = "todos" | "free" | "occupied" | "committed" | "expiring" | "expired";

const FILTER_CHIPS: { id: MapFilter; label: string; ring: string; fill: string }[] = [
  { id: "todos",     label: "Todos",           ring: "var(--ink-2)",      fill: "var(--surface-3)" },
  { id: "free",      label: "Disponibles",     ring: "var(--success)",    fill: "rgba(21,128,61,0.10)" },
  // Ocupado es rojo en el plano, en el 3D y en el mapa de la sede; el chip que
  // lo filtra tiene que ser del mismo color o el filtro no se asocia con lo que
  // pinta. «Vencidos» comparte el rojo pero no compite: es un subconjunto de lo
  // ocupado, y se distingue por la etiqueta y por la columna Días.
  { id: "occupied",  label: "Ocupados",        ring: "var(--danger)",     fill: "rgba(185,28,28,0.10)" },
  { id: "committed", label: "Contratados",     ring: "var(--accent-700)", fill: "var(--accent-50)" },
  { id: "expiring",  label: "Por vencer ≤30d", ring: "var(--warning)",    fill: "rgba(180,83,9,0.12)" },
  { id: "expired",   label: "Vencidos",        ring: "var(--danger)",     fill: "rgba(185,28,28,0.10)" },
];

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

function faceMatchesFilter(entry: FaceEntry, filter: MapFilter): boolean {
  if (filter === "todos") return true;
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
        boxShadow: "var(--shadow-sm)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ─── Card header divider ──────────────────────────────────────────────────────

function CardHeader({
  icon,
  title,
  sub,
}: {
  icon: React.ReactNode;
  title: string;
  sub?: string;
}) {
  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 6,
        padding: "10px 14px",
        borderBottom: "1px solid var(--line-soft)",
      }}
    >
      {icon}
      <span style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-1)" }}>{title}</span>
      {sub && <span style={{ fontSize: 11, color: "var(--ink-3)" }}>· {sub}</span>}
    </div>
  );
}

// ─── Stat card (headline metrics) ────────────────────────────────────────────

/** One headline number. `meter` (0-100) draws a progress bar under the value —
 *  used for occupancy, where the ratio matters more than the raw count.
 *  `note` is a second fact on its own line: `sub` sits inline beside the value
 *  and a long one breaks across three lines in a card this narrow. */
function StatCard({
  label, value, sub, note, color, meter, tone = "plain", onClick, active,
}: {
  label: string;
  value: string | number;
  sub?: string;
  note?: string;
  color: string;
  meter?: number;
  tone?: "plain" | "alert";
  onClick?: () => void;
  active?: boolean;
}) {
  const interactive = !!onClick;
  return (
    <div
      onClick={onClick}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={interactive ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick!(); } } : undefined}
      style={{
        flex: "1 1 150px", minWidth: 140,
        padding: "12px 14px 13px",
        borderRadius: "var(--r-lg)",
        background: tone === "alert" ? "var(--surface)" : "var(--surface)",
        border: `1px solid ${active ? color : "var(--line)"}`,
        boxShadow: active ? `0 0 0 2px ${color}22` : "var(--shadow-xs)",
        cursor: interactive ? "pointer" : "default",
        transition: "border-color .12s, box-shadow .12s",
        outline: "none",
      }}
    >
      <div
        style={{
          fontSize: 9.5, fontWeight: 700, textTransform: "uppercase",
          letterSpacing: "0.08em", color: "var(--ink-3)", whiteSpace: "nowrap",
        }}
      >
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 4 }}>
        <span style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.05, letterSpacing: "-0.03em", color }}>
          {value}
        </span>
        {sub && <span style={{ fontSize: 11, color: "var(--ink-3)", fontWeight: 500 }}>{sub}</span>}
      </div>
      {note && (
        <div style={{ marginTop: 3, fontSize: 10.5, color: "var(--ink-3)", whiteSpace: "nowrap" }}>
          {note}
        </div>
      )}
      {meter !== undefined && (
        <div
          style={{
            marginTop: 9, height: 5, borderRadius: 99,
            background: "var(--surface-3)", overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${Math.max(0, Math.min(100, meter))}%`, height: "100%",
              background: color, borderRadius: 99, transition: "width .3s",
            }}
          />
        </div>
      )}
    </div>
  );
}

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
 *  `committed` is the same violet family as occupied, one step lighter: the
 *  space is sold, just not yet live. Expired turns red because the project's
 *  palette reserves red for what is wrong, and a contract past its end date
 *  is exactly that — painting it as plain "occupied" hid the problem on the
 *  one screen where it should be most visible. */
const DISPLAY_TOP: Record<DisplayStatus, string> = {
  free:        "#4CC38A",
  committed:   "#A78BFA",
  active:      "#8B5CF6",
  expiring:    "#8B5CF6",
  expired:     "#E5484D",
  no_contract: "#E5484D",
  reserved:    "#F0B429",
  maintenance: "#A8A29E",
};

function topColorFor(face: FaceEntry): string {
  return DISPLAY_TOP[displayStatus(face)];
}

/** Colours for the "available for this period" reading, which answers a
 *  different question than "what is happening today" and therefore uses its
 *  own three-way scale: sellable, negotiable, taken. */
const RANGE_TOP: Record<RangeAvailability, string> = {
  libre: "#4CC38A",
  parcial: "#F0B429",
  // Rojo, igual que «ocupado» en el plano, el 3D y el mapa de la sede: es el
  // mismo hecho —ese espacio no se puede vender— con otra etiqueta. En violeta
  // el único lugar donde de verdad se vende leía distinto que todos los demás.
  tomado: "#D93A3A",
};

const RANGE_LABEL: Record<RangeAvailability, string> = {
  libre: "Libre todo el periodo",
  parcial: "Libre parte del periodo",
  tomado: "Tomado",
};

/** Infrastructure on the isometric map: present, but visibly not for sale. */
const NON_RENTABLE_TOP = "#94A3B8";
const NON_RENTABLE_LABEL = "No comercializable";

function pts(...points: [number, number][]): string {
  return points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
}

export interface MapAnchor {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface IsoMapProps {
  fixtures: UnifiedFixture[];
  selectedId: string | null;
  /** `point` is relative to the map wrapper, and carries the wrapper's own
   *  size so the popover can flip sides and stay inside the card. */
  onSelect: (f: UnifiedFixture | null, point?: MapAnchor) => void;
  /** Active search/filter result — null when no query or filter applies. */
  match: MapMatch | null;
  /** When set, faces are painted by availability over this period instead of
   *  by what is happening today. */
  range: DateRange | null;
}

function IsoMap({ fixtures, selectedId, onSelect, match, range }: IsoMapProps) {
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
      // Sides follow the dominant (face A) hue
      const sideL = darken(topA, 0.18);
      const sideR = darken(topA, 0.3);
      const stroke = darken(topA, 0.45);

      // Top face — split into two halves for double gondolas
      let topHalves: { color: string; points: string }[];
      if (double) {
        if (f.w >= f.d) {
          const zm = (z0 + z1) / 2;
          topHalves = [
            { color: topA, points: pts(iso(x0, z0, h), iso(x1, z0, h), iso(x1, zm, h), iso(x0, zm, h)) },
            { color: topB, points: pts(iso(x0, zm, h), iso(x1, zm, h), iso(x1, z1, h), iso(x0, z1, h)) },
          ];
        } else {
          const xm = (x0 + x1) / 2;
          topHalves = [
            { color: topA, points: pts(iso(x0, z0, h), iso(xm, z0, h), iso(xm, z1, h), iso(x0, z1, h)) },
            { color: topB, points: pts(iso(xm, z0, h), iso(x1, z0, h), iso(x1, z1, h), iso(xm, z1, h)) },
          ];
        }
      } else {
        topHalves = [{ color: topA, points: pts(tA, tB, tC, tD) }];
      }

      // Label above the prism — small unlabeled fixtures still get one while matched
      const area = f.w * f.d;
      const defaultVisible = Boolean(f.nomenclatura) || area > 1.5;
      const labelText = nombreDeMueble(f);
      const [lcx, lcy] = iso(f.cx, f.cz, h);
      const label = labelText ? { text: labelText, x: lcx, y: lcy - 7, defaultVisible } : null;
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

      return {
        f,
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
    return {
      prisms,
      groundPts: pts(...groundPts),
      viewBox: `${(minX - pad).toFixed(1)} ${(minY - pad).toFixed(1)} ${(maxX - minX + pad * 2).toFixed(1)} ${(maxY - minY + pad * 2).toFixed(1)}`,
    };
  }, [fixtures, range]);

  if (!scene) return null;

  const handleMove = (e: React.MouseEvent, title: string, sub: string) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    setTip({ x: e.clientX - rect.left, y: e.clientY - rect.top, title, sub });
  };

  return (
    <div
      ref={wrapRef}
      style={{ position: "relative", flex: 1, minHeight: 0, display: "flex" }}
    >
      <svg
        viewBox={scene.viewBox}
        preserveAspectRatio="xMidYMid meet"
        style={{ width: "100%", height: "100%", display: "block" }}
        onClick={() => onSelect(null)}
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
          const selected = selectedId === f.id;
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
                if (f.id === selectedId) { setTip(null); return; }
                handleMove(e, f.label || f.code, tooltipSub);
              }}
              onMouseLeave={() => {
                setHoverId(null);
                setTip(null);
              }}
              opacity={dimmed ? 0.18 : 1}
              style={{
                cursor: "pointer",
                filter: hovered ? "brightness(1.12)" : undefined,
                transition: "filter .12s, opacity .15s",
              }}
            >
              {/* Side faces */}
              <polygon points={left} fill={sideL} stroke={stroke} strokeWidth={0.5} strokeLinejoin="round" />
              <polygon points={right} fill={sideR} stroke={stroke} strokeWidth={0.5} strokeLinejoin="round" />
              {/* Top face (1 or 2 halves) — non-matching halves of a double dim per face */}
              {topHalves.map((th, i) => (
                <polygon
                  key={i}
                  points={th.points}
                  fill={th.color}
                  fillOpacity={match && matched && topHalves.length > 1 && flags && !flags[i] ? 0.25 : 1}
                  stroke={stroke}
                  strokeWidth={0.5}
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
                    strokeWidth={3.4}
                    opacity={0.3}
                    strokeLinejoin="round"
                  />
                  <polygon
                    points={topOutline}
                    fill="none"
                    stroke="var(--accent)"
                    strokeWidth={1.3}
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
                  strokeWidth={1.6}
                  strokeLinejoin="round"
                />
              )}
              {/* Floating label — always visible on matches */}
              {label && (label.defaultVisible || (match !== null && matched)) && (
                <text
                  x={label.x}
                  y={label.y}
                  textAnchor="middle"
                  fontSize={8.5}
                  fontWeight={600}
                  fontFamily="var(--font-mono)"
                  fill="var(--ink-2)"
                  stroke="#FFFFFF"
                  strokeWidth={2.4}
                  paintOrder="stroke"
                  style={{ pointerEvents: "none", userSelect: "none" }}
                >
                  {label.text}
                </text>
              )}
            </g>
          );
        })}
      </svg>

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

function MapLegend({ range }: { range?: DateRange | null }) {
  // The legend has to describe whatever the map is actually painting: asking
  // about a period replaces the six states of "today" with a three-way answer.
  const items: { c: string; l: string }[] = range
    ? [
        { c: RANGE_TOP.libre,   l: RANGE_LABEL.libre },
        { c: RANGE_TOP.parcial, l: RANGE_LABEL.parcial },
        { c: RANGE_TOP.tomado,  l: RANGE_LABEL.tomado },
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
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center" }}>
      {items.map((o) => (
        <div
          key={o.l}
          style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10.5, color: "var(--ink-3)" }}
        >
          <span style={{ width: 9, height: 9, borderRadius: 2.5, background: o.c, flexShrink: 0 }} />
          {o.l}
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
        fontSize: 11, fontWeight: 600, padding: "2px 9px", borderRadius: 999,
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
                padding: "3px 10px", borderRadius: 999, background: pill.bg, color: pill.color,
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
                  <span style={{ marginLeft: "auto", fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: pill.bg, color: pill.color }}>
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

function AtencionSection({ label, color }: { label: string; color: string }) {
  return (
    <div
      style={{
        padding: "7px 14px 4px",
        fontSize: 9.5, fontWeight: 700,
        textTransform: "uppercase", letterSpacing: "0.08em",
        color,
      }}
    >
      {label}
    </div>
  );
}

function AtencionRow({
  entry,
  chip,
  chipColor,
  bg,
  dates,
  last,
  onFoto,
}: {
  entry: FaceEntry;
  chip: string;
  chipColor: string;
  bg: string;
  dates: string;
  last: boolean;
  /** Abre la foto del montaje. Solo la traen las filas que tienen prueba. */
  onFoto?: () => void;
}) {
  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 10,
        height: 34, padding: "0 14px",
        background: bg,
        borderBottom: last ? "none" : "1px solid var(--line-soft)",
      }}
    >
      <span
        style={{
          width: 38, flexShrink: 0, textAlign: "right",
          fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700,
          color: chipColor,
        }}
      >
        {chip}
      </span>
      <span style={{ flexShrink: 0, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-2)" }}>
        {entry.code}
      </span>
      <span
        style={{
          flex: 1, minWidth: 0, fontSize: 11.5, color: "var(--ink-1)",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}
      >
        {entry.fixture.label || entry.fixture.code}
        {entry.supplierName ? ` · ${entry.supplierName}` : ""}
      </span>
      <span
        style={{
          flexShrink: 0, textAlign: "right",
          fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--ink-3)",
        }}
      >
        {dates}
      </span>
      {onFoto && (
        <button
          onClick={onFoto}
          title="Ver la foto del reporte"
          aria-label="Ver la foto del reporte"
          style={{
            flexShrink: 0, display: "inline-flex", alignItems: "center",
            background: "none", border: "none", padding: 0, cursor: "pointer",
            color: "var(--ink-3)",
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

// ─── Supplier row (top proveedores, compact ranked) ──────────────────────────

function SupplierRow({
  name,
  revenue,
  count,
  rank,
}: {
  name: string;
  revenue: number;
  count: number;
  rank: number;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, height: 28, padding: "0 14px" }}>
      <span
        style={{
          width: 16, flexShrink: 0, textAlign: "right",
          fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--ink-4)",
        }}
      >
        {rank + 1}
      </span>
      <span
        style={{
          flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600, color: "var(--ink-1)",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}
      >
        {name}
      </span>
      <span style={{ flexShrink: 0, fontSize: 10.5, color: "var(--ink-3)" }}>
        {count} contrato{count !== 1 ? "s" : ""}
      </span>
      <span
        style={{
          flexShrink: 0, fontFamily: "var(--font-mono)", fontSize: 11.5,
          fontWeight: 600, color: "var(--success)",
        }}
      >
        {formatCOP(revenue)}
      </span>
    </div>
  );
}

// ─── Spaces table ─────────────────────────────────────────────────────────────

function SpacesTable({
  fixtures, isAdmin, query, filter, montajeDe,
}: {
  fixtures: UnifiedFixture[];
  isAdmin: boolean;
  /** El último reporte de montaje de esa cara, si lo hay. */
  montajeDe: (entry: FaceEntry) => MountConfirmation | undefined;
  /** Driven by the page-level control bar — the table no longer owns a second
   *  search box and a second row of chips doing the same job as the map's. */
  query: string;
  filter: MapFilter;
}) {
  // One row per rentable face — doubles expand to A + B, matching the KPIs.
  const rows = useMemo(
    () =>
      fixtures.flatMap(commercialFacesOf).sort((a, b) => {
        const ad = a.endDate ? daysUntil(a.endDate) : 99999;
        const bd = b.endDate ? daysUntil(b.endDate) : 99999;
        return ad - bd;
      }),
    [fixtures],
  );

  // Text search AND status chip (same face-level matcher as the map's search).
  const filtered = useMemo(() => {
    const q = normalizeText(query.trim());
    return rows.filter(
      (e) => (!q || faceMatchesQuery(e, q)) && faceMatchesFilter(e, filter),
    );
  }, [rows, filter, query]);

  // Con alineación explícita y no por índice: la regla vieja era `i >= 4`, así
  // que agregar una columna en el medio corría la alineación de todas las de
  // atrás — y ya dejaba «Montaje» con el título a la derecha y el contenido a
  // la izquierda.
  const columnas: { etiqueta: string; derecha?: boolean }[] = [
    { etiqueta: "Código" },
    { etiqueta: "Tipo" },
    { etiqueta: "Proveedor" },
    { etiqueta: "Estado" },
    { etiqueta: "Montaje" },
    { etiqueta: "Desde", derecha: true },
    { etiqueta: "Hasta", derecha: true },
    { etiqueta: "Días",  derecha: true },
  ];
  if (isAdmin) columnas.push({ etiqueta: "Renta / mes", derecha: true });

  return (
    <>
      {filtered.length === 0 && (
        <div style={{ padding: "18px 14px", fontSize: 12, color: "var(--ink-3)" }}>
          Ningún espacio coincide con la búsqueda.
        </div>
      )}
      <div style={{ maxHeight: 360, overflowY: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: 12 }}>
          <thead style={{ position: "sticky", top: 0, zIndex: 1 }}>
            <tr style={{ background: "var(--surface)" }}>
              {columnas.map((c) => (
                <th
                  key={c.etiqueta}
                  style={{
                    padding: "7px 10px",
                    textAlign: c.derecha ? "right" : "left",
                    fontSize: 9.5, fontWeight: 700,
                    color: "var(--ink-3)",
                    textTransform: "uppercase", letterSpacing: "0.08em",
                    boxShadow: "inset 0 -1px 0 var(--line-strong)",
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
                <td colSpan={columnas.length} style={{ padding: "10px 14px", fontSize: 12, color: "var(--ink-3)" }}>
                  {query.trim()
                    ? <>Sin resultados para «{query.trim()}»</>
                    : "Sin espacios con este estado."}
                </td>
              </tr>
            )}
            {filtered.map((entry) => {
              const ds = displayStatus(entry);
              const meta = STATUS_META[ds];
              const days = entry.endDate ? daysUntil(entry.endDate) : null;
              const isDanger = ds === "expired" || ds === "no_contract";
              // Libre with stale past contract data → muted note instead of red days
              const staleFreeDays = ds === "free" && days !== null && days < 0 ? Math.abs(days) : null;
              // ANY free face must not look like an active contract row: leftover
              // supplier/date data renders muted (history), días always "—".
              const freeRow = ds === "free";
              const cell: React.CSSProperties = {
                padding: "7px 10px",
                borderBottom: "1px solid var(--line-soft)",
              };

              return (
                <tr
                  key={`${entry.fixture.id}-${entry.face}`}
                  style={{ background: isDanger ? "rgba(185,28,28,0.04)" : "transparent" }}
                >
                  <td
                    style={{
                      ...cell,
                      fontFamily: "var(--font-mono)",
                      fontSize: 11.5,
                      color: "var(--ink-2)",
                    }}
                  >
                    {entry.code}
                  </td>
                  <td style={{ ...cell, color: "var(--ink-2)" }}>
                    {entry.fixture.label}
                    {entry.face === "B" && (
                      <span style={{ fontSize: 10, fontWeight: 700, color: "var(--accent-700)" }}> · Cara B</span>
                    )}
                  </td>
                  <td style={cell}>
                    {staleFreeDays !== null ? (
                      <span style={{ color: "var(--ink-4)", fontSize: 11.5 }}>
                        venció hace {staleFreeDays}d{entry.supplierName ? ` · ${entry.supplierName}` : ""}
                      </span>
                    ) : freeRow && entry.supplierName ? (
                      <span style={{ color: "var(--ink-4)", fontSize: 11.5 }}>
                        último: {entry.supplierName}
                      </span>
                    ) : entry.supplierName ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span
                          style={{
                            width: 16, height: 16, borderRadius: 3,
                            background: "var(--accent-100)", color: "var(--accent-700)",
                            display: "inline-flex", alignItems: "center", justifyContent: "center",
                            fontSize: 9, fontWeight: 700, flexShrink: 0,
                          }}
                        >
                          {entry.supplierName[0]?.toUpperCase()}
                        </span>
                        <span style={{ color: "var(--ink-1)", fontSize: 11.5 }}>{entry.supplierName}</span>
                      </div>
                    ) : ds === "no_contract" ? (
                      <span style={{ color: "var(--danger)", fontWeight: 600, fontSize: 11.5 }}>
                        ⚠ Sin contrato
                      </span>
                    ) : (
                      <span style={{ color: "var(--ink-4)", fontSize: 11.5 }}>—</span>
                    )}
                  </td>
                  <td style={cell}>
                    <span
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 5,
                        fontSize: 11.5, fontWeight: 600, color: meta.ring,
                      }}
                    >
                      <span
                        style={{
                          width: 6, height: 6, borderRadius: 99,
                          background: meta.ring, flexShrink: 0,
                        }}
                      />
                      {meta.label}
                    </span>
                  </td>
                  <td style={cell}>
                    <MontajeChip entry={entry} reporte={montajeDe(entry)} />
                  </td>
                  {/* El período. La tabla ya ordenaba por fecha de fin y contaba
                      los días, pero no decía DESDE ni HASTA cuándo — y eso es lo
                      que se necesita para renovar o para reclamar. En una cara
                      libre se muestran apagadas: son historia, igual que el
                      «último: proveedor» de la columna de al lado. */}
                  {([entry.startDate, entry.endDate] as const).map((iso, i) => (
                    <td
                      key={i}
                      style={{
                        ...cell, textAlign: "right", whiteSpace: "nowrap",
                        fontFamily: "var(--font-mono)", fontSize: 11,
                        color: !iso ? "var(--ink-4)" : freeRow ? "var(--ink-4)" : "var(--ink-2)",
                      }}
                    >
                      {iso ? fechaCorta(iso) : "—"}
                    </td>
                  ))}
                  <td
                    style={{
                      ...cell, textAlign: "right",
                      fontFamily: "var(--font-mono)", fontSize: 11.5, fontWeight: 600,
                      color:
                        days === null || freeRow ? "var(--ink-4)"
                        : days < 0 ? "var(--danger)"
                        : days <= 30 ? "var(--warning)"
                        : "var(--success)",
                    }}
                  >
                    {days === null || freeRow ? "—" : `${days}d`}
                  </td>
                  {isAdmin && (
                    <td
                      style={{
                        ...cell, textAlign: "right",
                        fontFamily: "var(--font-mono)", fontSize: 11.5,
                        color: "var(--success)", fontWeight: 600,
                      }}
                    >
                      {entry.negotiatedValue > 0 ? formatCOP(entry.negotiatedValue) : "—"}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyDashboard({ sede, isAdmin }: { sede: string; isAdmin: boolean }) {
  return (
    <div
      style={{
        flex: 1, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        padding: 40, textAlign: "center",
      }}
    >
      <div
        style={{
          width: 88, height: 88, borderRadius: 22,
          background: "var(--surface)", border: "1px solid var(--line)",
          display: "flex", alignItems: "center", justifyContent: "center",
          marginBottom: 18, color: "var(--ink-3)",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <Building2 size={36} strokeWidth={1.3} />
      </div>
      <p
        style={{
          fontSize: 16, fontWeight: 700,
          color: "var(--ink-1)", marginBottom: 6, letterSpacing: "-0.02em",
        }}
      >
        Sin fixtures en{" "}
        <span style={{ fontFamily: "var(--font-mono)" }}>{sede}</span>
      </p>
      <p style={{ fontSize: 12.5, color: "var(--ink-3)", maxWidth: 360, marginBottom: 18 }}>
        {isAdmin
          ? "Diseñá el plano desde la pestaña Plano para ver KPIs, mapa de ocupación y el detalle por espacio."
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
  const { sedes, sede, setSede, fixturesBySede, syncFromServer } = useFixtureStore();
  const referenceRates = useFixtureStore((s) => s.referenceRates);
  const commit = useFixtureStore((s) => s.commit);
  const isAdmin = useAuthStore(selectIsAdmin);
  const [ratesOpen, setRatesOpen] = useState(false);

  const [selected, setSelected] = useState<UnifiedFixture | null>(null);
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

  const selectFixture = (f: UnifiedFixture | null, point?: MapAnchor) => {
    setSelected(f);
    // En Vender el popover sobra: la ficha de la derecha ya dice todo lo que
    // ese globito decía, y encima tapa el mapa que se está mirando.
    setAnchor(modoEfectivo === "vender" ? null : point ?? null);
    setDetailFull(false);
    setDetailFace("A");
    setCerrado(null);
  };
  const closeDetail = () => {
    setSelected(null);
    setAnchor(null);
    setDetailFull(false);
  };
  /** Pasar a vender ese espacio, venga de donde venga: del popover del mapa o
   *  del panel de detalle en Supervisar. */
  const negociar = (f: UnifiedFixture, face: "A" | "B" = "A") => {
    setSelected(f);
    setDetailFace(face);
    setDetailFull(false);
    setAnchor(null);
    setCerrado(null);
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
  /** Period the map answers for; null = today. */
  const [mapRange, setMapRange] = useState<DateRange | null>(null);

  // Deselect when switching sedes: ese mueble es de la otra tienda, y un
  // contrato a medio llenar apuntaría al espacio equivocado.
  useEffect(() => {
    setSelected(null);
    setCerrado(null);
  }, [sede]);

  /** Vender siempre tiene un periodo puesto.
   *
   *  El mapa sin rango responde por hoy, y "hoy" no es una pregunta comercial:
   *  lo que se vende es una temporada. Sin esto, entrar a Vender mostraba el
   *  mapa pintado por estado de hoy y el contador de libres en cero. */
  useEffect(() => {
    if (modoEfectivo !== "vender" || mapRange) return;
    const from = new Date();
    const to = new Date(from);
    to.setDate(to.getDate() + 30);
    setMapRange({ from, to });
  }, [modoEfectivo, mapRange]);

  // ── Map search / status filter (per rentable face) ──
  const mapMatch = useMemo<MapMatch | null>(() => {
    const q = normalizeText(mapQuery.trim());
    if (!q && mapFilter === "todos") return null;
    const faceFlags = new Map<string, boolean[]>();
    let count = 0;
    fixtures.forEach((f) => {
      const flags = commercialFacesOf(f).map((entry) => {
        const ok = (!q || faceMatchesQuery(entry, q)) && faceMatchesFilter(entry, mapFilter);
        if (ok) count++;
        return ok;
      });
      faceFlags.set(f.id, flags);
    });
    return { faceFlags, count };
  }, [fixtures, mapQuery, mapFilter]);

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
      .slice(0, 6);

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

  const activeSedeCount = sedes.filter((s) => (fixturesBySede[s] ?? []).length > 0).length;

  const attentionCount =
    kpis.expired.length + kpis.expiring.length + kpis.noContract.length +
    (isAdmin ? kpis.belowReference.length + montaje.noMontado.length + montaje.sinMontar.length : 0);
  const lastAttentionSection =
    kpis.belowReference.length > 0 ? "belowRef"
    : montaje.sinMontar.length > 0 || montaje.viejosSinReporte > 0 ? "sinMontar"
    : montaje.noMontado.length > 0 ? "noMontado"
    : kpis.noContract.length > 0 ? "noContract"
    : kpis.expiring.length > 0 ? "expiring"
    : "expired";

  /** La tarjeta del mapa. Es la MISMA en los dos modos —el mapa no cambia
   *  porque cambie para qué estás mirándolo—; sólo cambia cuánto espacio se
   *  lleva al lado de lo que tenga a la derecha. */
  const tarjetaMapa = (flex: string) => (
        <Card
          style={{
            position: "relative",
            flex,
            minWidth: 0,
            display: "flex", flexDirection: "column",
            padding: "12px 14px 10px",
            minHeight: 460,
          }}
        >
          <div
            style={{
              display: "flex", alignItems: "center", gap: 8,
              flexWrap: "wrap", marginBottom: 8,
            }}
          >
            <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ink-1)" }}>
              Mapa de la sede
            </span>
            <span style={{ fontSize: 11, color: "var(--ink-3)" }}>
              {sede} ·{" "}
              {mapRange
                ? describeRange(mapRange)
                : isAdmin
                ? "tocá un espacio para venderlo o ver su contrato"
                : "clic para ver el contrato"}
            </span>
            {/* Legend next to what it explains, not stranded at the bottom */}
            <div style={{ marginLeft: "auto" }}>
              <MapLegend range={mapRange} />
            </div>
          </div>

          <IsoMap
            fixtures={fixtures}
            selectedId={selected?.id ?? null}
            onSelect={selectFixture}
            match={mapMatch}
            range={mapRange}
          />

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

  return (
    <div
      style={{
        flex: 1, overflowY: "auto", padding: 20,
        background: "var(--bg)",
      }}
    >
      {/* ── Header row: title + sede selector ────────────────────────────── */}
      <div
        style={{
          display: "flex", justifyContent: "space-between",
          alignItems: "flex-start", marginBottom: 26, gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
          <div
            style={{
              width: 44, height: 44, borderRadius: "var(--r-md)",
              background: "var(--accent)", color: "#fff",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "var(--shadow-md)",
              flexShrink: 0,
            }}
          >
            <Building2 size={18} />
          </div>
          <div>
            {/* Antes esto era un h2 de 17 px y una línea de 11,5. TODO en la
                pantalla vivía entre 11 y 13 px, así que no había jerarquía: el
                nombre de la sede pesaba lo mismo que una observación. */}
            <div style={{
              fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 500,
              letterSpacing: "0.14em", textTransform: "uppercase",
              color: "var(--ink-3)", marginBottom: 3,
            }}>
              Sede
            </div>
            <h2
              style={{
                margin: 0, fontSize: 32, fontWeight: 600,
                letterSpacing: "-0.035em", lineHeight: 1, color: "var(--ink-1)",
              }}
            >
              {sede}
            </h2>
            <p style={{ fontSize: 12.5, color: "var(--ink-3)", marginTop: 7 }}>
              {kpis.total} espacio{kpis.total !== 1 ? "s" : ""} comercializable{kpis.total !== 1 ? "s" : ""}
              {" · "}
              {fixtures.length} mueble{fixtures.length !== 1 ? "s" : ""} en el plano
              {activeSedeCount > 1 && ` · ${activeSedeCount} sedes activas`}
            </p>
          </div>

          {/* La plata que mueve la sede. `kpis.revenue` existía desde siempre y
              no se mostraba en ninguna parte de esta pantalla: había que bajar
              a las tarjetas para enterarse de cuánto entra por mes. Es la cifra
              por la que existe el sistema y ahora es lo segundo que se lee.
              Sólo admin: para el rol trabajador la plata va tachada en todo el
              resto y acá no puede ser la excepción. */}
          {isAdmin && kpis.revenue > 0 && (
            <div style={{
              paddingLeft: 20, marginLeft: 8,
              borderLeft: "1px solid var(--line)", alignSelf: "stretch",
              display: "flex", flexDirection: "column", justifyContent: "center",
            }}>
              <div style={{
                fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 500,
                letterSpacing: "0.14em", textTransform: "uppercase",
                color: "var(--ink-3)", marginBottom: 5,
              }}>
                Canon vigente
              </div>
              <div style={{
                fontSize: 30, fontWeight: 600, letterSpacing: "-0.035em",
                lineHeight: 1, color: "var(--ink-1)", whiteSpace: "nowrap",
              }}>
                ${kpis.revenue.toLocaleString("es-CO")}
                <span style={{ fontSize: 14, fontWeight: 500, color: "var(--ink-3)" }}> /mes</span>
              </div>
              {kpis.committedRevenue > 0 && (
                <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 6 }}>
                  + ${kpis.committedRevenue.toLocaleString("es-CO")} contratado sin arrancar
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {/* Sede selector */}
          <Card
            style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "6px 10px", borderRadius: "var(--r-lg)",
              boxShadow: "none",
            }}
          >
            <MapPin size={13} style={{ color: "var(--accent)", flexShrink: 0 }} />
            <select
              value={sede}
              onChange={(e) => setSede(e.target.value)}
              style={{
                background: "transparent", border: "none", outline: "none",
                fontFamily: "var(--font-mono)", fontWeight: 600, fontSize: 12,
                color: "var(--ink-1)", cursor: "pointer",
              }}
            >
              {sedes.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <span
              style={{
                display: "inline-flex", alignItems: "center",
                fontSize: 9.5, fontWeight: 600,
                padding: "2px 7px", borderRadius: 999,
                background: "var(--accent-100)", color: "var(--accent-700)",
              }}
            >
              {fixtures.length} fixtures
            </span>
          </Card>

          {isAdmin && (
            <button
              onClick={() => setRatesOpen(true)}
              title="Tarifas de referencia por tipo de mueble"
              style={{
                display: "flex", alignItems: "center", gap: 6,
                height: 34, padding: "0 12px",
                borderRadius: "var(--r-lg)",
                background: "var(--surface)", color: "var(--ink-2)",
                border: "1px solid var(--line)",
                cursor: "pointer", fontSize: 12, fontWeight: 500,
                fontFamily: "inherit",
                boxShadow: "var(--shadow-xs)",
              }}
            >
              <SlidersHorizontal size={13} /> Tarifas
            </button>
          )}

          <button
            onClick={() => syncFromServer()}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              height: 34, padding: "0 12px",
              borderRadius: "var(--r-lg)",
              background: "var(--surface)", color: "var(--ink-2)",
              border: "1px solid var(--line)",
              cursor: "pointer", fontSize: 12, fontWeight: 500,
              fontFamily: "inherit",
              boxShadow: "var(--shadow-xs)",
            }}
          >
            <RefreshCw size={13} /> Actualizar
          </button>
        </div>
      </div>

      {fixtures.length === 0 ? (
        <EmptyDashboard sede={sede} isAdmin={isAdmin} />
      ) : (
        <>
          {/* ── Para qué, y para cuándo ────────────────────────────────────
              Las dos preguntas que ordenan la pantalla, juntas y arriba. El
              modo dice qué se está haciendo —vender o supervisar— y el periodo
              es uno solo: el mismo que pinta el mapa llena después las fechas
              del contrato, así no hay dos calendarios que puedan discrepar. */}
          <Card style={{ padding: "10px 12px", marginBottom: 12, display: "flex", flexDirection: "column", gap: 9 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              {isAdmin && (
                <div style={{ display: "flex", gap: 3, padding: 3, borderRadius: "var(--r-lg)", background: "var(--surface-3)" }}>
                  {([
                    { id: "vender", label: "Vender", Icon: Handshake, badge: 0 },
                    { id: "supervisar", label: "Supervisar", Icon: TrendingUp, badge: attentionCount },
                  ] as const).map(({ id, label, Icon, badge }) => {
                    const activo = modoEfectivo === id;
                    return (
                      <button
                        key={id}
                        onClick={() => setModo(id)}
                        style={{
                          display: "inline-flex", alignItems: "center", gap: 7,
                          height: 32, padding: "0 15px", borderRadius: "var(--r-md)",
                          border: "none", cursor: "pointer", fontFamily: "inherit",
                          fontSize: 13.5, fontWeight: activo ? 700 : 600,
                          background: activo ? "var(--accent)" : "transparent",
                          color: activo ? "#fff" : "var(--ink-2)",
                          boxShadow: activo ? "var(--shadow-sm)" : "none",
                          transition: "background .12s, color .12s",
                        }}
                      >
                        <Icon size={14} />
                        {label}
                        {badge > 0 && (
                          <span
                            style={{
                              minWidth: 17, height: 17, padding: "0 4px", borderRadius: 999,
                              display: "inline-flex", alignItems: "center", justifyContent: "center",
                              fontSize: 10, fontWeight: 700,
                              background: activo ? "rgba(255,255,255,.22)" : "var(--danger-50)",
                              color: activo ? "#fff" : "var(--danger)",
                            }}
                          >
                            {badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {isAdmin && (
                <button
                  onClick={() => setCargaAbierta(true)}
                  title="Cargar una tanda de contratos desde un Excel o un CSV"
                  style={{
                    marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 7,
                    height: 32, padding: "0 13px", borderRadius: "var(--r-md)",
                    border: "1px solid var(--line)", background: "var(--surface)",
                    color: "var(--ink-2)", fontSize: 12.5, fontWeight: 600,
                    fontFamily: "inherit", cursor: "pointer",
                  }}
                >
                  <FileSpreadsheet size={14} style={{ color: "var(--accent)" }} />
                  Cargar planilla
                </button>
              )}

              <div style={{ position: "relative", flex: "1 1 240px", minWidth: 200, maxWidth: 380 }}>
                <Search
                  size={13}
                  style={{
                    position: "absolute", left: 10, top: "50%",
                    transform: "translateY(-50%)", color: "var(--ink-3)", pointerEvents: "none",
                  }}
                />
                <input
                  type="text"
                  value={mapQuery}
                  onChange={(e) => setMapQuery(e.target.value)}
                  placeholder="Buscar espacio, proveedor o categoría…"
                  style={{
                    width: "100%", height: 32, padding: "0 30px",
                    borderRadius: "var(--r-md)", border: "1px solid var(--line)",
                    background: "var(--surface-2)", color: "var(--ink-1)",
                    fontSize: 12, fontFamily: "inherit", outline: "none",
                  }}
                />
                {mapQuery && (
                  <button
                    onClick={() => setMapQuery("")}
                    title="Limpiar búsqueda"
                    style={{
                      position: "absolute", right: 6, top: "50%",
                      transform: "translateY(-50%)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      width: 20, height: 20, borderRadius: 99,
                      background: "var(--surface-3)", border: "none",
                      color: "var(--ink-2)", cursor: "pointer",
                    }}
                  >
                    <X size={11} />
                  </button>
                )}
              </div>
            </div>

            <div
              style={{
                display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
                paddingTop: 9, borderTop: "1px solid var(--line-soft)",
              }}
            >
              <SeasonPicker range={mapRange} onChange={setMapRange} />
              {mapRange && (
                <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 9, fontSize: 12.5, whiteSpace: "nowrap" }}>
                  <span>
                    <b style={{ fontFamily: "var(--font-mono)", fontSize: 15, color: "var(--success)" }}>
                      {rangeTally.libres}
                    </b>{" "}
                    <span style={{ color: "var(--ink-3)" }}>libres</span>
                  </span>
                  <span style={{ color: "var(--line-strong)" }}>·</span>
                  <span>
                    <b style={{ fontFamily: "var(--font-mono)", fontSize: 15, color: "var(--warning)" }}>
                      {rangeTally.parciales}
                    </b>{" "}
                    <span style={{ color: "var(--ink-3)" }}>parciales</span>
                  </span>
                  <span style={{ color: "var(--line-strong)" }}>·</span>
                  <span>
                    <b style={{ fontFamily: "var(--font-mono)", fontSize: 15, color: "var(--ink-2)" }}>
                      {rangeTally.tomados}
                    </b>{" "}
                    <span style={{ color: "var(--ink-3)" }}>vendidos</span>
                  </span>
                </div>
              )}
            </div>
          </Card>

          {modoEfectivo === "vender" ? (
            /* Vender: el mapa se lleva la pantalla y el contrato va al lado.
               Sin KPIs — para decidir un precio no sirve la ocupación de hoy,
               sirve ver qué hay libre en el periodo y dónde queda. */
            <ModoVender
              fixture={selected}
              face={detailFace}
              onFace={setDetailFace}
              sede={sede}
              rango={mapRange}
              cerrado={cerrado}
              onGuardado={(patch, resumen) => {
                // El JSON del layout es lo que pinta el mapa y responde la
                // disponibilidad; sin esto el contrato existiría en la base y
                // el espacio seguiría viéndose libre.
                const objetivo = selected;
                const cara = detailFace;
                if (objetivo) {
                  commit(
                    fixtures.map((f) =>
                      f.id !== objetivo.id
                        ? f
                        : cara === "B"
                        ? { ...f, faceB: { ...(f.faceB ?? {}), ...patch } as FaceData }
                        : { ...f, ...patch },
                    ),
                  );
                }
                setSelected(null);
                setAnchor(null);
                setCerrado(resumen);
              }}
              onCancelar={closeDetail}
              onSeguir={() => setCerrado(null)}
            >
              {tarjetaMapa("1 1 520px")}
            </ModoVender>
          ) : (
            <>
            {/* ── Filtros por estado ─────────────────────────────────────────
                Filtran el mapa Y la tabla a la vez: antes cada uno tenía los
                suyos y los dos podían contestar cosas distintas a la misma
                pregunta. Sólo en Supervisar — miran el estado de HOY, y en
                Vender el mapa está pintado por disponibilidad del periodo, así
                que juntos se contradirían. */}
            <Card
              style={{
                display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
                padding: "9px 12px", marginBottom: 12,
              }}
            >
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {FILTER_CHIPS.map((c) => {
                  const active = mapFilter === c.id;
                  return (
                    <button
                      key={c.id}
                      onClick={() => setMapFilter(c.id)}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 5,
                        height: 27, padding: "0 11px", borderRadius: 999,
                        fontSize: 11, fontWeight: 600, fontFamily: "inherit",
                        border: `1px solid ${active ? c.ring : "var(--line)"}`,
                        background: active ? c.fill : "var(--surface)",
                        color: active ? c.ring : "var(--ink-2)",
                        cursor: "pointer",
                        transition: "background .12s, color .12s, border-color .12s",
                      }}
                    >
                      {c.id !== "todos" && (
                        <span
                          style={{
                            width: 6, height: 6, borderRadius: 99,
                            background: active ? c.ring : "var(--ink-4)", flexShrink: 0,
                          }}
                        />
                      )}
                      {c.label}
                    </button>
                  );
                })}
              </div>

              {mapMatch && (
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--ink-2)", marginLeft: "auto" }}>
                  {mapMatch.count} espacio{mapMatch.count !== 1 ? "s" : ""} · mapa y tabla filtrados
                </span>
              )}
            </Card>

            {/* ── Headline metrics, above the fold ───────────────────────────
                These used to sit BELOW a full-screen map, so the numbers the page
                exists for were the last thing anyone saw. Admin leads with
                occupancy and money; a worker cannot see money and leads with what
                is available and what needs attention. */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
              {isAdmin ? (
                <>
                  <StatCard
                    label="Ocupación"
                    value={`${kpis.occPct}%`}
                    sub={`${kpis.occupied} de ${kpis.total}`}
                    color="var(--accent-700)"
                    meter={kpis.occPct}
                  />
                  <StatCard
                    label="Disponibles"
                    value={kpis.free}
                    sub="para vender"
                    color="var(--success)"
                    onClick={() => setMapFilter(mapFilter === "free" ? "todos" : "free")}
                    active={mapFilter === "free"}
                  />
                  <StatCard
                    label="Contratados"
                    value={kpis.committed}
                    sub="aún no inician"
                    color={kpis.committed > 0 ? "var(--accent-700)" : "var(--ink-4)"}
                    onClick={() => setMapFilter(mapFilter === "committed" ? "todos" : "committed")}
                    active={mapFilter === "committed"}
                  />
                  <StatCard
                    label="Vencidos"
                    value={kpis.expired.length}
                    color={kpis.expired.length > 0 ? "var(--danger)" : "var(--ink-4)"}
                    onClick={() => setMapFilter(mapFilter === "expired" ? "todos" : "expired")}
                    active={mapFilter === "expired"}
                  />
                  <StatCard
                    label="Por vencer ≤30d"
                    value={kpis.expiring.length}
                    color={kpis.expiring.length > 0 ? "var(--warning)" : "var(--ink-4)"}
                    onClick={() => setMapFilter(mapFilter === "expiring" ? "todos" : "expiring")}
                    active={mapFilter === "expiring"}
                  />
                  <StatCard
                    label="Ingreso mensual"
                    value={formatCOP(kpis.revenue)}
                    sub="COP"
                    // Only contracts running today count above. What is signed
                    // for later gets its own line so the two are never added up
                    // by eye.
                    note={
                      kpis.committedRevenue > 0
                        ? `+ ${compactCOP(kpis.committedRevenue)} ya pactado`
                        : undefined
                    }
                    color="var(--success)"
                  />
                </>
              ) : (
                <>
                  <StatCard
                    label="Espacios disponibles"
                    value={kpis.free}
                    sub={`de ${kpis.total}`}
                    color="var(--success)"
                    meter={kpis.total ? Math.round((kpis.free / kpis.total) * 100) : 0}
                    onClick={() => setMapFilter(mapFilter === "free" ? "todos" : "free")}
                    active={mapFilter === "free"}
                  />
                  <StatCard
                    label="Vencidos"
                    value={kpis.expired.length}
                    sub="liberar o renovar"
                    color={kpis.expired.length > 0 ? "var(--danger)" : "var(--ink-4)"}
                    onClick={() => setMapFilter(mapFilter === "expired" ? "todos" : "expired")}
                    active={mapFilter === "expired"}
                  />
                  <StatCard
                    label="Por vencer ≤30d"
                    value={kpis.expiring.length}
                    sub="avisar al proveedor"
                    color={kpis.expiring.length > 0 ? "var(--warning)" : "var(--ink-4)"}
                    onClick={() => setMapFilter(mapFilter === "expiring" ? "todos" : "expiring")}
                    active={mapFilter === "expiring"}
                  />
                  <StatCard
                    label="Ocupados"
                    value={kpis.occupied}
                    sub={`${kpis.occPct}% de ocupación`}
                    color="var(--accent-700)"
                  />
                </>
              )}
            </div>

            {/* ── Map + side rail ────────────────────────────────────────────
                Side by side instead of stacked: the map used to reserve 62vh and
                leave roughly half of it empty, pushing everything else off
                screen. */}
            <div
              style={{
                display: "flex", flexWrap: "wrap", alignItems: "stretch",
                gap: 12, marginBottom: 12,
              }}
            >
              {tarjetaMapa(isAdmin ? "62 1 480px" : "66 1 480px")}

              {/* Rail: what needs action, always visible next to the map */}
              <div
                style={{
                  flex: isAdmin ? "38 1 320px" : "34 1 300px",
                  minWidth: 0, display: "flex", flexDirection: "column", gap: 12,
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
                <Card style={{ padding: 0, overflow: "hidden" }}>
                  <CardHeader
                    icon={
                      <AlertTriangle
                        size={13}
                        style={{ color: attentionCount > 0 ? "var(--danger)" : "var(--success)" }}
                      />
                    }
                    title="Atención"
                    sub={
                      attentionCount > 0
                        ? `${attentionCount} pendiente${attentionCount !== 1 ? "s" : ""}`
                        : undefined
                    }
                  />
                  {attentionCount === 0 ? (
                    <div style={{ padding: "12px 14px", fontSize: 12, fontWeight: 500, color: "var(--success)" }}>
                      ✓ Sin contratos vencidos ni próximos a vencer
                    </div>
                  ) : (
                    <div style={{ maxHeight: isAdmin ? 300 : 420, overflowY: "auto" }}>
                      {kpis.expired.length > 0 && (
                        <>
                          <AtencionSection label={`Vencidos · ${kpis.expired.length}`} color="var(--danger)" />
                          {kpis.expired.map((entry, i) => (
                            <AtencionRow
                              key={`${entry.fixture.id}-${entry.face}`}
                              entry={entry}
                              chip={`${entry.days}d`}
                              chipColor="var(--danger)"
                              bg="var(--danger-50)"
                              dates={formatRange(entry.startDate, entry.endDate)}
                              last={lastAttentionSection === "expired" && i === kpis.expired.length - 1}
                            />
                          ))}
                        </>
                      )}
                      {kpis.expiring.length > 0 && (
                        <>
                          <AtencionSection label={`Por vencer ≤30d · ${kpis.expiring.length}`} color="var(--warning)" />
                          {kpis.expiring.map((entry, i) => (
                            <AtencionRow
                              key={`${entry.fixture.id}-${entry.face}`}
                              entry={entry}
                              chip={`${entry.days}d`}
                              chipColor="var(--warning)"
                              bg="var(--warning-50)"
                              dates={formatRange(entry.startDate, entry.endDate)}
                              last={lastAttentionSection === "expiring" && i === kpis.expiring.length - 1}
                            />
                          ))}
                        </>
                      )}
                      {kpis.noContract.length > 0 && (
                        <>
                          <AtencionSection
                            label={`Ocupados sin contrato registrado · ${kpis.noContract.length}`}
                            color="var(--danger)"
                          />
                          {kpis.noContract.map((entry, i) => (
                            <AtencionRow
                              key={`${entry.fixture.id}-${entry.face}`}
                              entry={entry}
                              chip="—"
                              chipColor="var(--ink-4)"
                              bg="transparent"
                              dates={formatRange(entry.startDate, entry.endDate)}
                              last={lastAttentionSection === "noContract" && i === kpis.noContract.length - 1}
                            />
                          ))}
                        </>
                      )}
                      {isAdmin && montaje.noMontado.length > 0 && (
                        <>
                          <AtencionSection
                            label={`No se pudo montar · ${montaje.noMontado.length}`}
                            color="var(--danger)"
                          />
                          {montaje.noMontado.map((entry, i) => (
                            <AtencionRow
                              key={`nm-${entry.fixture.id}-${entry.face}`}
                              entry={entry}
                              chip="!"
                              chipColor="var(--danger)"
                              bg="var(--danger-50)"
                              dates={
                                (entry.reporte.motivo
                                  ? MOTIVO_LABEL[entry.reporte.motivo as MountMotivo]
                                  : "Sin motivo") +
                                (entry.reporte.reportado_por ? ` · ${entry.reporte.reportado_por}` : "")
                              }
                              last={lastAttentionSection === "noMontado" && i === montaje.noMontado.length - 1}
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
                        </>
                      )}
                      {isAdmin && montaje.sinMontar.length > 0 && (
                        <>
                          <AtencionSection
                            label={`Contratado, sin montar · ${montaje.sinMontar.length}`}
                            color="var(--warning)"
                          />
                          {montaje.sinMontar.map((entry, i) => (
                            <AtencionRow
                              key={`sm-${entry.fixture.id}-${entry.face}`}
                              entry={entry}
                              chip={entry.dias === 0 ? "hoy" : `${entry.dias}d`}
                              chipColor="var(--warning)"
                              bg="var(--warning-50)"
                              dates={
                                entry.dias === 0
                                  ? "Arrancó hoy · sin reporte"
                                  : `Arrancó hace ${entry.dias} día${entry.dias === 1 ? "" : "s"} · sin reporte`
                              }
                              last={
                                lastAttentionSection === "sinMontar" &&
                                montaje.viejosSinReporte === 0 &&
                                i === montaje.sinMontar.length - 1
                              }
                            />
                          ))}
                        </>
                      )}
                      {isAdmin && montaje.viejosSinReporte > 0 && (
                        <div
                          style={{
                            padding: "8px 14px", fontSize: 11, color: "var(--ink-3)",
                            lineHeight: 1.4,
                          }}
                        >
                          Además, {montaje.viejosSinReporte} contrato
                          {montaje.viejosSinReporte === 1 ? "" : "s"} que arrancó
                          {montaje.viejosSinReporte === 1 ? "" : "n"} hace más de{" "}
                          {VENTANA_MONTAJE_DIAS} días nunca se reportó
                          {montaje.viejosSinReporte === 1 ? "" : "n"}. A esa altura el
                          espacio ya está armado: lo que falta es el reporte.
                        </div>
                      )}
                      {isAdmin && kpis.belowReference.length > 0 && (
                        <>
                          <AtencionSection
                            label={`Bajo tarifa de referencia · ${kpis.belowReference.length}`}
                            color="var(--warning)"
                          />
                          {kpis.belowReference.map((entry, i) => (
                            <AtencionRow
                              key={`${entry.fixture.id}-${entry.face}`}
                              entry={entry}
                              chip={`−${entry.gapPct}%`}
                              chipColor="var(--warning)"
                              bg="transparent"
                              dates={`${compactCOP(entry.negotiatedValue)} · ref ${compactCOP(entry.ref)}`}
                              last={lastAttentionSection === "belowRef" && i === kpis.belowReference.length - 1}
                            />
                          ))}
                        </>
                      )}
                    </div>
                  )}
                </Card>
                )}

                {isAdmin && !(selected && detailFull) && (
                  <Card style={{ padding: 0, overflow: "hidden" }}>
                    <CardHeader
                      icon={<TrendingUp size={13} style={{ color: "var(--accent)" }} />}
                      title="Top proveedores"
                      sub="por ingreso mensual"
                    />
                    <div style={{ padding: "6px 0", maxHeight: 260, overflowY: "auto" }}>
                      {kpis.topSuppliers.length === 0 ? (
                        <div style={{ padding: "4px 14px 8px", fontSize: 12, color: "var(--ink-3)" }}>
                          Sin contratos activos con valor registrado.
                        </div>
                      ) : (
                        kpis.topSuppliers.map((s, i) => (
                          <SupplierRow
                            key={s.name}
                            name={s.name}
                            revenue={s.revenue}
                            count={s.count}
                            rank={i}
                          />
                        ))
                      )}
                    </div>
                  </Card>
                )}

              </div>
            </div>

            {/* ── Full-width spaces table ──────────────────────────────────── */}
            <Card style={{ padding: 0, overflow: "hidden" }}>
              <CardHeader
                icon={null}
                title="Estado por espacio"
                sub={
                  mapMatch
                    ? `${sede} · ${mapMatch.count} de ${kpis.total} (filtrado)`
                    : `${sede} · ${kpis.total} espacio${kpis.total !== 1 ? "s" : ""}`
                }
              />
              <SpacesTable
                fixtures={fixtures}
                isAdmin={isAdmin}
                query={mapQuery}
                filter={mapFilter}
                montajeDe={montajeDe}
              />
            </Card>
            </>
          )}
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
