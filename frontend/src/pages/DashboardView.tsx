import { useEffect, useMemo, useRef, useState } from "react";
import {
  TrendingUp,
  AlertTriangle,
  RefreshCw,
  MapPin,
  Building2,
  Plus,
  X,
  FileText,
  ChevronRight,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { useFixtureStore, selectFixtures } from "../store/fixtureStore";
import { useAuthStore, selectIsAdmin } from "../store/authStore";
import client from "../api/client";
import { listSpaceFiles, type SpaceFileMeta } from "../api/files";
import FileViewerModal from "../components/FileViewerModal";
import RatesModal from "../components/RatesModal/RatesModal";
import type { Space } from "../types";
import {
  contractPhase,
  isDoubleGondola as isDoubleGondolaShared,
  isRentable,
  rateTypeOf,
  referenceRateFor,
} from "../types/fixtures";
import type { UnifiedFixture, SpaceStatus, FaceData } from "../types/fixtures";

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
  if (!f.endDate)                 return "no_contract";
  return daysUntil(f.endDate) <= 30 ? "expiring" : "active";
}

const STATUS_META: Record<
  DisplayStatus,
  { ring: string; fill: string; label: string }
> = {
  active:      { ring: "var(--success)", fill: "rgba(21,128,61,0.10)",        label: "Activo" },
  committed:   { ring: "var(--accent-700)", fill: "var(--accent-50)",         label: "Contratado" },
  expiring:    { ring: "var(--warning)", fill: "rgba(180,83,9,0.12)",         label: "Por vencer" },
  expired:     { ring: "var(--danger)",  fill: "rgba(185,28,28,0.10)",        label: "Vencido" },
  no_contract: { ring: "var(--danger)",  fill: "rgba(185,28,28,0.10)",        label: "Sin contrato" },
  reserved:    { ring: "var(--warning)", fill: "rgba(180,83,9,0.08)",         label: "Reservado" },
  maintenance: { ring: "var(--muted-status)", fill: "rgba(148,145,127,0.10)", label: "Mantenim." },
  free:        { ring: "var(--ink-4)",   fill: "rgba(181,174,156,0.10)",      label: "Libre" },
};

// ─── Map search + status filter (product geolocation) ────────────────────────

type MapFilter = "todos" | "free" | "occupied" | "committed" | "expiring" | "expired";

const FILTER_CHIPS: { id: MapFilter; label: string; ring: string; fill: string }[] = [
  { id: "todos",     label: "Todos",           ring: "var(--ink-2)",      fill: "var(--surface-3)" },
  { id: "free",      label: "Disponibles",     ring: "var(--success)",    fill: "rgba(21,128,61,0.10)" },
  { id: "occupied",  label: "Ocupados",        ring: "var(--accent-700)", fill: "var(--accent-50)" },
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

/** Infrastructure on the isometric map: present, but visibly not for sale. */
const NON_RENTABLE_TOP = "#94A3B8";

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
}

function IsoMap({ fixtures, selectedId, onSelect, match }: IsoMapProps) {
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
      const x0 = f.cx - f.w / 2, x1 = f.cx + f.w / 2;
      const z0 = f.cz - f.d / 2, z1 = f.cz + f.d / 2;
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
      const topA = rentable ? topColorFor(faces[0]) : NON_RENTABLE_TOP;
      const topB = rentable && faces[1] ? topColorFor(faces[1]) : NON_RENTABLE_TOP;
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
      const labelText = f.nomenclatura || f.code;
      const [lcx, lcy] = iso(f.cx, f.cz, h);
      const label = labelText ? { text: labelText, x: lcx, y: lcy - 7, defaultVisible } : null;
      if (label) addPt([label.x, label.y - 8]);

      const tooltipSub = double
        ? `A: ${faces[0].supplierName || "—"} · B: ${faces[1]?.supplierName || "—"}`
        : faces[0].supplierName || "Sin proveedor";

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
  }, [fixtures]);

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

function MapLegend() {
  const items: { c: string; l: string }[] = [
    { c: DISPLAY_TOP.free,        l: "Libre" },
    { c: DISPLAY_TOP.committed,   l: "Contratado" },
    { c: DISPLAY_TOP.active,      l: "Ocupado" },
    { c: DISPLAY_TOP.expired,     l: "Vencido" },
    { c: DISPLAY_TOP.reserved,    l: "Reservado" },
    { c: DISPLAY_TOP.maintenance, l: "Mantenimiento" },
    { c: NON_RENTABLE_TOP,        l: "No comercializable" },
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
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", gap: 5, flexShrink: 0,
        fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 999,
        background: rentable ? "var(--accent-50)" : "var(--surface-3)",
        color: rentable ? "var(--accent-700)" : "var(--ink-2)",
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: 99, background: ring }} />
      {rentable ? STATUS_META[ds].label : "No comercializable"}
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
            ? "Asignale un proveedor desde la pestaña Plano."
            : "Para alquilarlo, cambiá su destino a «Comercializable» desde el plano."}
        </div>
      )}
    </div>
  );
}

// ─── Quick-look popover, anchored to the fixture on the map ─────────────────

function FixturePopover({
  fixture, anchor, isAdmin, onExpand, onClose,
}: {
  fixture: UnifiedFixture;
  anchor: MapAnchor;
  isAdmin: boolean;
  onExpand: () => void;
  onClose: () => void;
}) {
  const rentable = isRentable(fixture);
  const faces = facesOf(fixture);
  const entry = faces[0];
  const { files } = useSpaceFiles(entry.code, rentable && entry.status === "occupied");
  const pill = daysPill(entry.endDate ? daysUntil(entry.endDate) : null);
  const hasContract = rentable && entry.supplierName.trim().length > 0;

  const W = 296;
  const EST_H = 250;
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
  fixture, isAdmin, face, onFace, onBack, onOpenFile,
}: {
  fixture: UnifiedFixture;
  isAdmin: boolean;
  face: "A" | "B";
  onFace: (f: "A" | "B") => void;
  onBack: () => void;
  onOpenFile: (f: SpaceFileMeta) => void;
}) {
  const rentable = isRentable(fixture);
  const faces = facesOf(fixture);
  const double = isDoubleGondola(fixture) && rentable;
  const entry = face === "B" && faces.length > 1 ? faces[1] : faces[0];
  const { state, files } = useSpaceFiles(entry.code, rentable);
  const hasContract = rentable && entry.supplierName.trim().length > 0;

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
}: {
  entry: FaceEntry;
  chip: string;
  chipColor: string;
  bg: string;
  dates: string;
  last: boolean;
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
    </div>
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
  fixtures, isAdmin, query, filter,
}: {
  fixtures: UnifiedFixture[];
  isAdmin: boolean;
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

  const headers = ["Código", "Tipo", "Proveedor", "Estado", "Días"];
  if (isAdmin) headers.push("Renta / mes");

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
              {headers.map((h, i) => (
                <th
                  key={h}
                  style={{
                    padding: "7px 10px",
                    textAlign: i >= 4 ? "right" : "left",
                    fontSize: 9.5, fontWeight: 700,
                    color: "var(--ink-3)",
                    textTransform: "uppercase", letterSpacing: "0.08em",
                    boxShadow: "inset 0 -1px 0 var(--line-strong)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={headers.length} style={{ padding: "10px 14px", fontSize: 12, color: "var(--ink-3)" }}>
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
  const isAdmin = useAuthStore(selectIsAdmin);
  const [ratesOpen, setRatesOpen] = useState(false);

  const [selected, setSelected] = useState<UnifiedFixture | null>(null);
  // Where on the map the click landed (anchors the quick-look popover).
  const [anchor, setAnchor] = useState<MapAnchor | null>(null);
  // false = quick popover, true = full detail in the rail ("Ver todo").
  const [detailFull, setDetailFull] = useState(false);
  const [detailFace, setDetailFace] = useState<"A" | "B">("A");

  const selectFixture = (f: UnifiedFixture | null, point?: MapAnchor) => {
    setSelected(f);
    setAnchor(point ?? null);
    setDetailFull(false);
    setDetailFace("A");
  };
  const closeDetail = () => {
    setSelected(null);
    setAnchor(null);
    setDetailFull(false);
  };
  const [viewerFile, setViewerFile] = useState<SpaceFileMeta | null>(null);
  const [mapQuery, setMapQuery] = useState("");
  const [mapFilter, setMapFilter] = useState<MapFilter>("todos");

  // Deselect when switching sedes
  useEffect(() => {
    setSelected(null);
  }, [sede]);

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

  const activeSedeCount = sedes.filter((s) => (fixturesBySede[s] ?? []).length > 0).length;

  const attentionCount =
    kpis.expired.length + kpis.expiring.length + kpis.noContract.length +
    kpis.belowReference.length;
  const lastAttentionSection =
    kpis.belowReference.length > 0 ? "belowRef"
    : kpis.noContract.length > 0 ? "noContract"
    : kpis.expiring.length > 0 ? "expiring"
    : "expired";

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
          alignItems: "flex-start", marginBottom: 16, gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <div
            style={{
              width: 40, height: 40, borderRadius: "var(--r-lg)",
              background: "var(--accent)", color: "#fff",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "var(--shadow-md)",
              flexShrink: 0,
            }}
          >
            <Building2 size={18} />
          </div>
          <div>
            <h2
              style={{
                margin: 0, fontSize: 17, fontWeight: 700,
                letterSpacing: "-0.02em", color: "var(--ink-1)",
              }}
            >
              Resumen operativo
            </h2>
            <p style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>
              {activeSedeCount} sede{activeSedeCount !== 1 ? "s" : ""} · {kpis.total} espacio{kpis.total !== 1 ? "s" : ""} arrendable{kpis.total !== 1 ? "s" : ""}
            </p>
          </div>
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
          {/* ── Control bar: ONE search + ONE set of chips for the whole page ──
              Previously the map and the table each had their own, so the same
              question had to be asked twice and the two could disagree. */}
          <Card
            style={{
              display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
              padding: "9px 12px", marginBottom: 12,
            }}
          >
            <div style={{ position: "relative", flex: "1 1 260px", minWidth: 210, maxWidth: 420 }}>
              <Search
                size={13}
                style={{
                  position: "absolute", left: 10, top: "50%",
                  transform: "translateY(-50%)",
                  color: "var(--ink-3)", pointerEvents: "none",
                }}
              />
              <input
                type="text"
                value={mapQuery}
                onChange={(e) => setMapQuery(e.target.value)}
                placeholder="Buscar producto, categoría, proveedor o espacio…"
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
            <Card
              style={{
                position: "relative",
                flex: isAdmin ? "62 1 480px" : "66 1 480px",
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
                  Mapa de ocupación
                </span>
                <span style={{ fontSize: 11, color: "var(--ink-3)" }}>
                  {sede} · clic para ver el contrato
                </span>
                {/* Legend next to what it explains, not stranded at the bottom */}
                <div style={{ marginLeft: "auto" }}>
                  <MapLegend />
                </div>
              </div>

              <IsoMap
                fixtures={fixtures}
                selectedId={selected?.id ?? null}
                onSelect={selectFixture}
                match={mapMatch}
              />

              {/* Quick look, anchored to the fixture. Hidden once the full
                  detail takes over the rail so the two never compete. */}
              {selected && anchor && !detailFull && (
                <FixturePopover
                  fixture={selected}
                  anchor={anchor}
                  isAdmin={isAdmin}
                  onExpand={() => setDetailFull(true)}
                  onClose={closeDetail}
                />
              )}
            </Card>

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
                            dates="sin fechas"
                            last={lastAttentionSection === "noContract" && i === kpis.noContract.length - 1}
                          />
                        ))}
                      </>
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
            />
          </Card>
        </>
      )}

      {/* ── Overlays ──────────────────────────────────────────────────────── */}
      {viewerFile && (
        <FileViewerModal file={viewerFile} onClose={() => setViewerFile(null)} />
      )}
      {ratesOpen && isAdmin && <RatesModal onClose={() => setRatesOpen(false)} />}
    </div>
  );
}
