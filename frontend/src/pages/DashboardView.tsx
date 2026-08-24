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
} from "lucide-react";
import { useFixtureStore, selectFixtures } from "../store/fixtureStore";
import { useAuthStore, selectIsAdmin } from "../store/authStore";
import client from "../api/client";
import { listSpaceFiles, type SpaceFileMeta } from "../api/files";
import FileViewerModal from "../components/FileViewerModal";
import type { Space } from "../types";
import { isDoubleGondola as isDoubleGondolaShared, isRentable } from "../types/fixtures";
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
  | "active" | "expiring" | "expired" | "no_contract"
  | "reserved" | "maintenance" | "free";

function displayStatus(f: { status: SpaceStatus; endDate: string }): DisplayStatus {
  if (f.status === "free")        return "free";
  if (f.status === "reserved")    return "reserved";
  if (f.status === "maintenance") return "maintenance";
  if (f.status !== "occupied")    return "free";
  if (!f.endDate)                 return "no_contract";
  const days = daysUntil(f.endDate);
  if (days < 0)   return "expired";
  if (days <= 30) return "expiring";
  return "active";
}

const STATUS_META: Record<
  DisplayStatus,
  { ring: string; fill: string; label: string }
> = {
  active:      { ring: "var(--success)", fill: "rgba(21,128,61,0.10)",        label: "Activo" },
  expiring:    { ring: "var(--warning)", fill: "rgba(180,83,9,0.12)",         label: "Por vencer" },
  expired:     { ring: "var(--danger)",  fill: "rgba(185,28,28,0.10)",        label: "Vencido" },
  no_contract: { ring: "var(--danger)",  fill: "rgba(185,28,28,0.10)",        label: "Sin contrato" },
  reserved:    { ring: "var(--warning)", fill: "rgba(180,83,9,0.08)",         label: "Reservado" },
  maintenance: { ring: "var(--muted-status)", fill: "rgba(148,145,127,0.10)", label: "Mantenim." },
  free:        { ring: "var(--ink-4)",   fill: "rgba(181,174,156,0.10)",      label: "Libre" },
};

const STATUS_LABEL: Record<SpaceStatus, string> = {
  free: "Libre",
  occupied: "Ocupado",
  reserved: "Reservado",
  maintenance: "Mantenimiento",
};

// ─── Map search + status filter (product geolocation) ────────────────────────

type MapFilter = "todos" | "free" | "occupied" | "expiring" | "expired";

const FILTER_CHIPS: { id: MapFilter; label: string; ring: string; fill: string }[] = [
  { id: "todos",    label: "Todos",           ring: "var(--ink-2)",      fill: "var(--surface-3)" },
  { id: "free",     label: "Disponibles",     ring: "var(--success)",    fill: "rgba(21,128,61,0.10)" },
  { id: "occupied", label: "Ocupados",        ring: "var(--accent-700)", fill: "var(--accent-50)" },
  { id: "expiring", label: "Por vencer ≤30d", ring: "var(--warning)",    fill: "rgba(180,83,9,0.12)" },
  { id: "expired",  label: "Vencidos",        ring: "var(--danger)",     fill: "rgba(185,28,28,0.10)" },
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
  if (filter === "occupied") return entry.status === "occupied";
  const ds = displayStatus(entry);
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

// ─── KPI strip tile (single compact strip replaces padded cards) ─────────────

function KpiTile({
  label,
  value,
  sub,
  color,
  divider = false,
}: {
  label: string;
  value: string | number;
  sub?: string;
  color: string;
  divider?: boolean;
}) {
  return (
    <div
      style={{
        padding: "10px 14px",
        flex: "1 1 auto", minWidth: 100,
        borderLeft: divider ? "1px solid var(--line-soft)" : "none",
      }}
    >
      <div
        style={{
          fontSize: 9.5, fontWeight: 700,
          textTransform: "uppercase", letterSpacing: "0.08em",
          color: "var(--ink-3)", whiteSpace: "nowrap",
        }}
      >
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 2 }}>
        <span
          style={{
            fontSize: 20, fontWeight: 700, lineHeight: 1.15,
            letterSpacing: "-0.02em", color, whiteSpace: "nowrap",
          }}
        >
          {value}
        </span>
        {sub && (
          <span
            style={{
              fontSize: 10.5, color: "var(--ink-3)",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}
          >
            {sub}
          </span>
        )}
      </div>
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

/** Top-face color families per status: free → success, occupied → violet,
 *  reserved → amber, maintenance → gray. */
const STATUS_TOP: Record<SpaceStatus, string> = {
  free:        "#4CC38A",
  occupied:    "#8B5CF6",
  reserved:    "#F0B429",
  maintenance: "#A8A29E",
};

/** Infrastructure on the isometric map: present, but visibly not for sale. */
const NON_RENTABLE_TOP = "#94A3B8";

function pts(...points: [number, number][]): string {
  return points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
}

interface IsoMapProps {
  fixtures: UnifiedFixture[];
  selectedId: string | null;
  onSelect: (f: UnifiedFixture | null) => void;
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
      const topA = rentable ? STATUS_TOP[faces[0].status] : NON_RENTABLE_TOP;
      const topB = rentable ? STATUS_TOP[faces[1]?.status ?? "free"] : NON_RENTABLE_TOP;
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
                onSelect(f);
              }}
              onMouseEnter={() => setHoverId(f.id)}
              onMouseMove={(e) => handleMove(e, f.label || f.code, tooltipSub)}
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
    { c: STATUS_TOP.free,        l: "Libre" },
    { c: STATUS_TOP.occupied,    l: "Ocupado" },
    { c: STATUS_TOP.reserved,    l: "Reservado" },
    { c: STATUS_TOP.maintenance, l: "Mantenimiento" },
    { c: NON_RENTABLE_TOP,       l: "No comercializable" },
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

const DARK_STATUS: Record<SpaceStatus, string> = {
  free: "#4ADE80",
  occupied: "#A78BFA",
  reserved: "#FBBF24",
  maintenance: "#A8A29E",
};

function daysChip(days: number | null): { text: string; color: string; bg: string } {
  if (days === null)
    return { text: "Sin periodo", color: "var(--dark-ink-3)", bg: "rgba(255,255,255,0.06)" };
  if (days < 0)
    return { text: `Vencido hace ${Math.abs(days)}d`, color: "#F87171", bg: "rgba(248,113,113,0.14)" };
  if (days <= 7)
    return { text: `Vence en ${days}d`, color: "#F87171", bg: "rgba(248,113,113,0.14)" };
  if (days <= 30)
    return { text: `Vence en ${days}d`, color: "#FBBF24", bg: "rgba(251,191,36,0.14)" };
  return { text: `${days}d restantes`, color: "#4ADE80", bg: "rgba(74,222,128,0.12)" };
}

function PanelRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div
        style={{
          fontSize: 9.5, fontWeight: 700,
          textTransform: "uppercase", letterSpacing: "0.08em",
          color: "var(--dark-ink-3)", marginBottom: 3,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 12.5, color: "var(--dark-ink-1)" }}>{children}</div>
    </div>
  );
}

interface FixtureDetailPanelProps {
  fixture: UnifiedFixture;
  isAdmin: boolean;
  onClose: () => void;
  onOpenFile: (file: SpaceFileMeta) => void;
}

function FixtureDetailPanel({ fixture, isAdmin, onClose, onOpenFile }: FixtureDetailPanelProps) {
  const [face, setFace] = useState<"A" | "B">("A");
  const rentable = isRentable(fixture);
  const double = isDoubleGondola(fixture) && rentable;
  const faces = facesOf(fixture);
  const current = face === "B" && faces.length > 1 ? faces[1] : faces[0];

  const [spaceState, setSpaceState] = useState<"loading" | "ok" | "none" | "error">("loading");
  const [files, setFiles] = useState<SpaceFileMeta[]>([]);

  useEffect(() => setFace("A"), [fixture.id]);

  useEffect(() => {
    let cancelled = false;
    if (!rentable) {
      setSpaceState("none");
      return;
    }
    setSpaceState("loading");
    setFiles([]);
    client
      .get<Space>(`/spaces/by-code/${encodeURIComponent(current.code)}`)
      .then(async (r) => {
        const fl = await listSpaceFiles(r.data.id);
        if (cancelled) return;
        setFiles(fl);
        setSpaceState("ok");
      })
      .catch((err) => {
        if (cancelled) return;
        setSpaceState(err?.response?.status === 404 ? "none" : "error");
      });
    return () => {
      cancelled = true;
    };
  }, [current.code, rentable]);

  const days = current.endDate ? daysUntil(current.endDate) : null;
  const chip = daysChip(days);

  return (
    <aside
      style={{
        position: "fixed", top: 0, right: 0, bottom: 0,
        width: 340, maxWidth: "92vw", zIndex: 120,
        background: "var(--dark-bg)",
        borderLeft: "1px solid var(--dark-line)",
        boxShadow: "-12px 0 32px rgba(0,0,0,0.4)",
        display: "flex", flexDirection: "column",
        overflowY: "auto",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex", alignItems: "flex-start", gap: 10,
          padding: "16px 18px 12px",
          borderBottom: "1px solid var(--dark-line)",
          position: "sticky", top: 0, background: "var(--dark-bg)", zIndex: 2,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 14.5, fontWeight: 700, color: "var(--dark-ink-1)",
              letterSpacing: "-0.01em",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}
          >
            {fixture.label || fixture.code}
          </div>
          <div style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--dark-ink-3)", marginTop: 2 }}>
            {current.code} · {fixture.sede}
          </div>
        </div>
        <button
          onClick={onClose}
          title="Cerrar"
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 26, height: 26, borderRadius: "var(--r-md)", flexShrink: 0,
            background: "var(--dark-surface-2)", border: "1px solid var(--dark-line)",
            color: "var(--dark-ink-2)", cursor: "pointer",
          }}
        >
          <X size={13} />
        </button>
      </div>

      {/* Face tabs for double gondolas */}
      {double && (
        <div style={{ display: "flex", gap: 6, padding: "12px 18px 0" }}>
          {(["A", "B"] as const).map((id) => {
            const active = face === id;
            return (
              <button
                key={id}
                onClick={() => setFace(id)}
                style={{
                  flex: 1, height: 28,
                  borderRadius: "var(--r-md)",
                  fontSize: 11.5, fontWeight: 600, fontFamily: "inherit",
                  border: `1px solid ${active ? "var(--accent)" : "var(--dark-line-2)"}`,
                  background: active ? "rgba(124,58,237,0.22)" : "var(--dark-surface)",
                  color: active ? "#C4B5FD" : "var(--dark-ink-2)",
                  cursor: "pointer",
                  transition: "background .12s, color .12s",
                }}
              >
                Cara {id}
              </button>
            );
          })}
        </div>
      )}

      <div style={{ padding: "16px 18px", flex: 1 }}>
        {!rentable ? (
          <div
            style={{
              background: "var(--dark-surface)",
              border: "1px solid var(--dark-line)",
              borderRadius: "var(--r-lg)",
              padding: "14px 16px",
            }}
          >
            <span
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                fontSize: 11.5, fontWeight: 600,
                padding: "3px 10px", borderRadius: 999,
                background: "rgba(148,163,184,0.18)", color: "#94A3B8",
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: 99, background: "#94A3B8" }} />
              No comercializable
            </span>
            <p style={{ marginTop: 10, fontSize: 12, lineHeight: 1.55, color: "var(--dark-ink-2)" }}>
              Este mueble está marcado como parte del local, no como espacio a
              la venta. No admite contrato y no entra en los indicadores de
              disponibilidad ni de ocupación.
            </p>
            <p style={{ marginTop: 8, fontSize: 11, color: "var(--dark-ink-3)" }}>
              Para alquilarlo, cambiá su destino a «Comercializable» desde el plano.
            </p>
          </div>
        ) : (<>
        {/* Estado */}
        <PanelRow label="Estado">
          <span
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              fontSize: 11.5, fontWeight: 600,
              padding: "3px 10px", borderRadius: 999,
              background: "rgba(255,255,255,0.06)",
              color: DARK_STATUS[current.status],
            }}
          >
            <span
              style={{
                width: 6, height: 6, borderRadius: 99,
                background: DARK_STATUS[current.status], flexShrink: 0,
              }}
            />
            {STATUS_LABEL[current.status]}
          </span>
        </PanelRow>

        {/* Proveedor / marca */}
        <PanelRow label="Proveedor">
          {current.supplierName || <span style={{ color: "var(--dark-ink-3)" }}>—</span>}
        </PanelRow>
        <PanelRow label="Marca / categoría">
          {current.brandCategory || <span style={{ color: "var(--dark-ink-3)" }}>—</span>}
        </PanelRow>

        {/* Periodo */}
        <div style={{ marginBottom: 12 }}>
          <div
            style={{
              fontSize: 9.5, fontWeight: 700,
              textTransform: "uppercase", letterSpacing: "0.08em",
              color: "var(--dark-ink-3)", marginBottom: 6,
            }}
          >
            Periodo
          </div>
          <div
            style={{
              display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8,
              background: "var(--dark-surface)",
              border: "1px solid var(--dark-line)",
              borderRadius: "var(--r-lg)",
              padding: "10px 12px",
            }}
          >
            <div>
              <div style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: "0.1em", color: "var(--dark-ink-3)" }}>
                INICIO
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--dark-ink-1)", marginTop: 2 }}>
                {formatDate(current.startDate)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: "0.1em", color: "var(--dark-ink-3)" }}>
                FIN
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, fontFamily: "var(--font-mono)", color: chip.color, marginTop: 2 }}>
                {formatDate(current.endDate)}
              </div>
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <span
                style={{
                  display: "inline-flex", alignItems: "center",
                  fontSize: 11, fontWeight: 700,
                  padding: "3px 10px", borderRadius: 999,
                  background: chip.bg, color: chip.color,
                }}
              >
                {chip.text}
              </span>
            </div>
          </div>
        </div>

        {/* Valor — admin only */}
        {isAdmin && (
          <PanelRow label="Valor negociado / mes">
            <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "#4ADE80", fontSize: 14 }}>
              {formatCOP(current.negotiatedValue)}
            </span>
          </PanelRow>
        )}

        {/* Observación */}
        <PanelRow label="Observación">
          {current.observation
            ? <span style={{ color: "var(--dark-ink-2)", fontSize: 12 }}>{current.observation}</span>
            : <span style={{ color: "var(--dark-ink-3)" }}>—</span>}
        </PanelRow>

        {/* Archivos */}
        <div style={{ marginTop: 16 }}>
          <div
            style={{
              fontSize: 9.5, fontWeight: 700,
              textTransform: "uppercase", letterSpacing: "0.08em",
              color: "var(--dark-ink-3)", marginBottom: 8,
            }}
          >
            Archivos del contrato
          </div>

          {spaceState === "loading" && (
            <div style={{ fontSize: 11.5, color: "var(--dark-ink-3)" }}>Cargando…</div>
          )}
          {spaceState === "none" && (
            <div style={{ fontSize: 11.5, color: "var(--dark-ink-3)" }}>
              Sin contrato registrado en el servidor.
            </div>
          )}
          {spaceState === "error" && (
            <div style={{ fontSize: 11.5, color: "#F87171" }}>
              No se pudo consultar el servidor.
            </div>
          )}
          {spaceState === "ok" && files.length === 0 && (
            <div style={{ fontSize: 11.5, color: "var(--dark-ink-3)" }}>Sin archivos adjuntos.</div>
          )}
          {spaceState === "ok" &&
            files.map((file) => (
              <button
                key={file.id}
                onClick={() => onOpenFile(file)}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  width: "100%", padding: "8px 10px", marginBottom: 6,
                  borderRadius: "var(--r-md)",
                  background: "var(--dark-surface)",
                  border: "1px solid var(--dark-line)",
                  color: "var(--dark-ink-1)",
                  cursor: "pointer", textAlign: "left",
                  fontFamily: "inherit",
                  transition: "background .12s",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--dark-surface-2)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--dark-surface)"; }}
              >
                <FileText size={13} style={{ color: "#A78BFA", flexShrink: 0 }} />
                <span
                  style={{
                    flex: 1, minWidth: 0, fontSize: 11.5, fontWeight: 500,
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}
                >
                  {file.filename}
                </span>
                <span style={{ fontSize: 10, color: "var(--dark-ink-3)", flexShrink: 0, fontFamily: "var(--font-mono)" }}>
                  {file.size >= 1024 * 1024
                    ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
                    : `${Math.max(1, Math.round(file.size / 1024))} KB`}
                </span>
                <ChevronRight size={12} style={{ color: "var(--dark-ink-3)", flexShrink: 0 }} />
              </button>
            ))}
        </div>
        </>)}
      </div>
    </aside>
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

const TABLE_CHIP_LABELS: Record<MapFilter, string> = {
  todos: "Todos",
  free: "Libres",
  occupied: "Ocupados",
  expired: "Vencidos",
  expiring: "Por vencer",
};

/** Same colors + face-level logic as the map's chips, shorter labels. */
const TABLE_CHIPS: { id: MapFilter; label: string; ring: string; fill: string }[] =
  (["todos", "free", "occupied", "expired", "expiring"] as MapFilter[]).map((id) => {
    const base = FILTER_CHIPS.find((c) => c.id === id)!;
    return { ...base, label: TABLE_CHIP_LABELS[id] };
  });

function SpacesTable({ fixtures, isAdmin }: { fixtures: UnifiedFixture[]; isAdmin: boolean }) {
  // Independent from the map's chip state.
  const [filter, setFilter] = useState<MapFilter>("todos");
  const [query, setQuery] = useState("");
  const [searchFocus, setSearchFocus] = useState(false);

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
      {/* Search + count + status filter chips */}
      <div
        style={{
          display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap",
          padding: "8px 10px",
          borderBottom: "1px solid var(--line-soft)",
        }}
      >
        <div
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            width: 200, padding: "4px 8px", flexShrink: 0,
            background: "var(--surface-2)",
            border: `1px solid ${searchFocus ? "var(--accent)" : "var(--line)"}`,
            borderRadius: "var(--r-md)",
            transition: "border-color .12s",
          }}
        >
          <Search size={13} style={{ color: "var(--ink-3)", flexShrink: 0 }} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setSearchFocus(true)}
            onBlur={() => setSearchFocus(false)}
            placeholder="Buscar…"
            style={{
              flex: 1, minWidth: 0, padding: 0,
              border: "none", outline: "none", background: "transparent",
              fontSize: 12, fontFamily: "inherit", color: "var(--ink-1)",
            }}
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              title="Limpiar búsqueda"
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: 16, height: 16, borderRadius: 99, flexShrink: 0,
                background: "var(--surface-3)", border: "none",
                color: "var(--ink-2)", cursor: "pointer", padding: 0,
              }}
            >
              <X size={10} />
            </button>
          )}
        </div>
        {TABLE_CHIPS.map((c) => {
          const active = filter === c.id;
          return (
            <button
              key={c.id}
              onClick={() => setFilter(c.id)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                height: 24, padding: "0 9px", borderRadius: 999,
                fontSize: 10.5, fontWeight: 600, fontFamily: "inherit",
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
        <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 600, color: "var(--ink-3)" }}>
          {filtered.length} espacio{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

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
  const isAdmin = useAuthStore(selectIsAdmin);

  const [selected, setSelected] = useState<UnifiedFixture | null>(null);
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
    const occupied = faces.filter((x) => x.status === "occupied").length;
    const free     = faces.filter((x) => x.status === "free").length;
    // reserved + maintenance would otherwise vanish from the strip and
    // total would never reconcile with Libres + Ocupados.
    const held     = total - occupied - free;
    const occPct = total ? Math.round((occupied / total) * 100) : 0;
    const revenue = faces
      .filter((x) => x.status === "occupied")
      .reduce((s, x) => s + (x.negotiatedValue ?? 0), 0);

    const expired: ContractEntry[] = [];
    const expiring: ContractEntry[] = [];
    const noContract: FaceEntry[] = [];
    faces.forEach((x) => {
      const ds = displayStatus(x);
      if (ds === "expired") expired.push({ ...x, days: daysUntil(x.endDate) });
      else if (ds === "expiring") expiring.push({ ...x, days: daysUntil(x.endDate) });
      else if (ds === "no_contract") noContract.push(x);
    });
    expired.sort((a, b) => a.days - b.days);
    expiring.sort((a, b) => a.days - b.days);

    // Top suppliers (occupied faces with value)
    const supplierMap: Record<string, { revenue: number; count: number }> = {};
    faces.forEach((x) => {
      if (!x.supplierName || !x.negotiatedValue || x.status !== "occupied") return;
      if (!supplierMap[x.supplierName]) supplierMap[x.supplierName] = { revenue: 0, count: 0 };
      supplierMap[x.supplierName].revenue += x.negotiatedValue;
      supplierMap[x.supplierName].count++;
    });
    const topSuppliers = Object.entries(supplierMap)
      .map(([name, { revenue: r, count }]) => ({ name, revenue: r, count }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 6);

    return {
      total, occupied, free, held, occPct, revenue,
      rentableFixtures, nonRentable,
      expired, expiring, noContract,
      topSuppliers,
    };
  }, [fixtures]);

  const activeSedeCount = sedes.filter((s) => (fixturesBySede[s] ?? []).length > 0).length;

  const attentionCount = kpis.expired.length + kpis.expiring.length + kpis.noContract.length;
  const lastAttentionSection =
    kpis.noContract.length > 0 ? "noContract"
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
          {/* ── HERO: isometric occupancy map ─────────────────────────────── */}
          <Card
            style={{
              minHeight: "62vh",
              boxShadow: "var(--shadow-md)",
              display: "flex", flexDirection: "column",
              padding: "14px 16px 12px",
              marginBottom: 16,
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-1)" }}>
                Mapa de ocupación
              </span>
              <span style={{ fontSize: 11, color: "var(--ink-3)" }}>
                — {sede} · clic en un espacio para ver su contrato
              </span>
            </div>

            {/* Search + status filter (product geolocation) */}
            <div
              style={{
                display: "flex", alignItems: "center", gap: 8,
                flexWrap: "wrap", marginBottom: 8,
              }}
            >
              <div style={{ position: "relative", flex: "1 1 240px", minWidth: 200, maxWidth: 380 }}>
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
                        height: 26, padding: "0 10px", borderRadius: 999,
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
                <span style={{ fontSize: 11, fontWeight: 600, color: "var(--ink-2)", marginLeft: "auto" }}>
                  {mapMatch.count} espacio{mapMatch.count !== 1 ? "s" : ""} encontrado{mapMatch.count !== 1 ? "s" : ""}
                </span>
              )}
            </div>

            <IsoMap
              fixtures={fixtures}
              selectedId={selected?.id ?? null}
              onSelect={setSelected}
              match={mapMatch}
            />
            <div style={{ marginTop: 8 }}>
              <MapLegend />
            </div>
          </Card>

          {/* ── KPI strip ────────────────────────────────────────────────── */}
          <Card
            style={{
              display: "flex", flexWrap: "wrap", alignItems: "stretch",
              borderRadius: "var(--r-lg)", overflow: "hidden",
              marginBottom: 14,
            }}
          >
            <KpiTile
              label="Espacios"
              value={kpis.total}
              sub={
                kpis.nonRentable > 0
                  ? `${kpis.rentableFixtures} comercializables · ${kpis.nonRentable} no`
                  : `${fixtures.length} fixtures · dobles ×2`
              }
              color="var(--ink-1)"
            />
            <KpiTile
              divider
              label="Libres"
              value={kpis.free}
              color="var(--success)"
            />
            <KpiTile
              divider
              label="Ocupados"
              value={`${kpis.occupied} · ${kpis.occPct}%`}
              sub="ocupación"
              color="var(--accent-700)"
            />
            {kpis.held > 0 && (
              <KpiTile
                divider
                label="Reserv. / Mant."
                value={kpis.held}
                color="var(--warning)"
              />
            )}
            <KpiTile
              divider
              label="Vencidos"
              value={kpis.expired.length}
              color={kpis.expired.length > 0 ? "var(--danger)" : "var(--ink-4)"}
            />
            <KpiTile
              divider
              label="Por vencer ≤30d"
              value={kpis.expiring.length}
              color={kpis.expiring.length > 0 ? "var(--warning)" : "var(--ink-4)"}
            />
            {isAdmin && (
              <KpiTile
                divider
                label="Ingreso mensual"
                value={formatCOP(kpis.revenue)}
                sub="COP · caras ocupadas"
                color="var(--success)"
              />
            )}
          </Card>

          {/* ── Atención + Top proveedores ───────────────────────────────── */}
          <div
            style={{
              display: "flex", flexWrap: "wrap", alignItems: "flex-start",
              gap: 14, marginBottom: 14,
            }}
          >
            <Card style={{ padding: 0, overflow: "hidden", flex: isAdmin ? "58 1 380px" : "1 1 100%", minWidth: 0 }}>
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
                <div style={{ padding: "10px 14px", fontSize: 12, fontWeight: 500, color: "var(--success)" }}>
                  ✓ Sin contratos vencidos ni próximos a vencer
                </div>
              ) : (
                <div style={{ maxHeight: 340, overflowY: "auto" }}>
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
                </div>
              )}
            </Card>

            {isAdmin && (
              <Card style={{ padding: 0, overflow: "hidden", flex: "42 1 300px", minWidth: 0 }}>
                <CardHeader
                  icon={<TrendingUp size={13} style={{ color: "var(--accent)" }} />}
                  title="Top proveedores"
                  sub="por ingreso mensual"
                />
                <div style={{ padding: "6px 0" }}>
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

          {/* ── Full-width spaces table ──────────────────────────────────── */}
          <Card style={{ padding: 0, overflow: "hidden" }}>
            <CardHeader
              icon={null}
              title="Estado por espacio"
              sub={`${sede} · ${kpis.total} espacio${kpis.total !== 1 ? "s" : ""}`}
            />
            <SpacesTable fixtures={fixtures} isAdmin={isAdmin} />
          </Card>
        </>
      )}

      {/* ── Overlays ──────────────────────────────────────────────────────── */}
      {selected && (
        <FixtureDetailPanel
          fixture={selected}
          isAdmin={isAdmin}
          onClose={() => setSelected(null)}
          onOpenFile={setViewerFile}
        />
      )}
      {viewerFile && (
        <FileViewerModal file={viewerFile} onClose={() => setViewerFile(null)} />
      )}
    </div>
  );
}
