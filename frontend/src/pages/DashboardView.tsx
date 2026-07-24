import { useEffect, useMemo, useRef, useState } from "react";
import {
  TrendingUp,
  AlertTriangle,
  RefreshCw,
  MapPin,
  Building2,
  Clock,
  DoorOpen,
  Plus,
  Star,
  X,
  FileText,
  Percent,
  ChevronRight,
  Search,
} from "lucide-react";
import { useFixtureStore, selectFixtures } from "../store/fixtureStore";
import { useAuthStore, selectIsAdmin } from "../store/authStore";
import client from "../api/client";
import { listSpaceFiles, type SpaceFileMeta } from "../api/files";
import FileViewerModal from "../components/FileViewerModal";
import type { Space } from "../types";
import { isDoubleGondola as isDoubleGondolaShared } from "../types/fixtures";
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

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  valueColor,
  hint,
  icon,
  iconBg,
  iconColor,
  bg,
  borderColor,
}: {
  label: string;
  value: string | number;
  valueColor: string;
  hint: string;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  bg?: string;
  borderColor?: string;
}) {
  return (
    <Card
      style={{
        padding: 16,
        background: bg ?? "var(--surface)",
        borderColor: borderColor ?? "var(--line)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
        <span
          style={{
            fontSize: 10, fontWeight: 600,
            textTransform: "uppercase", letterSpacing: "0.08em",
            color: "var(--ink-3)",
          }}
        >
          {label}
        </span>
        <span
          style={{
            width: 26, height: 26, borderRadius: "var(--r-md)",
            background: iconBg, color: iconColor,
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {icon}
        </span>
      </div>
      <div
        style={{
          fontSize: 24, fontWeight: 700, color: valueColor,
          letterSpacing: "-0.02em", lineHeight: 1.1,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 5 }}>{hint}</div>
    </Card>
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
        display: "flex", alignItems: "center", gap: 8,
        padding: "12px 16px",
        borderBottom: "1px solid var(--line-soft)",
      }}
    >
      {icon}
      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-1)" }}>{title}</span>
      {sub && <span style={{ fontSize: 11, color: "var(--ink-3)" }}>{sub}</span>}
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

      const double = isDoubleGondola(f);
      const faces = facesOf(f);
      const topA = STATUS_TOP[faces[0].status];
      const topB = STATUS_TOP[faces[1]?.status ?? "free"];
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
  const double = isDoubleGondola(fixture);
  const faces = facesOf(fixture);
  const current = face === "B" && faces.length > 1 ? faces[1] : faces[0];

  const [spaceState, setSpaceState] = useState<"loading" | "ok" | "none" | "error">("loading");
  const [files, setFiles] = useState<SpaceFileMeta[]>([]);

  useEffect(() => setFace("A"), [fixture.id]);

  useEffect(() => {
    let cancelled = false;
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
  }, [current.code]);

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
      </div>
    </aside>
  );
}

// ─── Contratos por vencer ────────────────────────────────────────────────────

interface ContractEntry extends FaceEntry {
  days: number;
}

function ExpiringRow({ entry, last }: { entry: ContractEntry; last: boolean }) {
  const d = entry.days;
  const critical = d <= 7;
  const soon = d <= 30;
  const color = critical ? "var(--danger)" : soon ? "var(--warning)" : "var(--ink-2)";
  const bg = critical ? "var(--danger-50)" : soon ? "var(--warning-50)" : "transparent";

  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 14,
        padding: "12px 16px",
        background: bg,
        borderBottom: last ? "none" : "1px solid var(--line-soft)",
      }}
    >
      {/* Big days-left number */}
      <div style={{ width: 64, textAlign: "center", flexShrink: 0 }}>
        <div style={{ fontSize: 24, fontWeight: 700, lineHeight: 1, color, letterSpacing: "-0.02em" }}>
          {d < 0 ? Math.abs(d) : d}
        </div>
        <div
          style={{
            fontSize: 8.5, fontWeight: 700, marginTop: 2,
            textTransform: "uppercase", letterSpacing: "0.08em",
            color: d < 0 ? "var(--danger)" : "var(--ink-3)",
          }}
        >
          {d < 0 ? "d. vencido" : "días"}
        </div>
      </div>

      {/* Space + supplier */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 12.5, fontWeight: 600, color: "var(--ink-1)",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}
        >
          {entry.fixture.label || entry.fixture.code}
          {entry.face === "B" && (
            <span style={{ fontSize: 10, fontWeight: 700, color: "var(--accent-700)" }}> · Cara B</span>
          )}
        </div>
        <div style={{ fontSize: 10.5, color: "var(--ink-3)", marginTop: 1 }}>
          <span style={{ fontFamily: "var(--font-mono)" }}>{entry.code}</span>
          {entry.supplierName ? ` · ${entry.supplierName}` : ""}
        </div>
      </div>

      {/* INICIO / FIN dates — prominent */}
      <div style={{ display: "flex", gap: 16, flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: "0.1em", color: "var(--ink-3)" }}>
            INICIO
          </div>
          <div style={{ fontSize: 12.5, fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--ink-1)", marginTop: 1 }}>
            {formatDate(entry.startDate)}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: "0.1em", color: "var(--ink-3)" }}>
            FIN
          </div>
          <div style={{ fontSize: 12.5, fontWeight: 700, fontFamily: "var(--font-mono)", color, marginTop: 1 }}>
            {formatDate(entry.endDate)}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Supplier row (top proveedores) ──────────────────────────────────────────

function SupplierRow({
  name,
  revenue,
  count,
  rank,
  pct,
}: {
  name: string;
  revenue: number;
  count: number;
  rank: number;
  pct: number;
}) {
  const isFirst = rank === 0;
  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "8px 10px", borderRadius: "var(--r-md)",
        background: isFirst ? "rgba(180,83,9,0.06)" : "transparent",
      }}
    >
      <div
        style={{
          width: 24, height: 24, borderRadius: 99, flexShrink: 0,
          background: isFirst ? "#D97706" : "var(--surface-3)",
          color: isFirst ? "#fff" : "var(--ink-3)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 10, fontWeight: 700,
        }}
      >
        {isFirst ? <Star size={11} strokeWidth={2.5} /> : rank + 1}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
          <span
            style={{
              fontSize: 12, fontWeight: 600,
              color: isFirst ? "#92400E" : "var(--ink-1)",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}
          >
            {name}
          </span>
          <span
            style={{
              fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600,
              color: "var(--success)", flexShrink: 0,
            }}
          >
            {formatCOP(revenue)}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
          <div
            style={{
              flex: 1, height: 4, borderRadius: 2,
              background: "var(--surface-3)", overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${pct}%`, height: "100%",
                background: isFirst ? "#D97706" : "var(--accent)",
                borderRadius: 2,
                transition: "width .4s ease",
              }}
            />
          </div>
          <span style={{ fontSize: 10, color: "var(--ink-3)", flexShrink: 0 }}>
            {count} contrato{count !== 1 ? "s" : ""}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Action row (requiere atención) ──────────────────────────────────────────

function ActionRow({
  tone,
  active,
  title,
  detail,
  last = false,
}: {
  tone: "danger" | "warning" | "success";
  active: boolean;
  title: string;
  detail: string;
  last?: boolean;
}) {
  const Icon = tone === "danger" ? AlertTriangle : tone === "warning" ? Clock : DoorOpen;
  const bg = active
    ? tone === "danger" ? "var(--danger-50)"
    : tone === "warning" ? "var(--warning-50)"
    : "var(--success-50)"
    : "transparent";
  const color = active
    ? tone === "danger" ? "var(--danger)"
    : tone === "warning" ? "var(--warning)"
    : "var(--success)"
    : "var(--ink-4)";

  return (
    <div
      style={{
        padding: "12px 16px",
        display: "flex", alignItems: "flex-start", gap: 10,
        background: bg,
        borderBottom: last ? "none" : "1px solid var(--line-soft)",
      }}
    >
      <Icon size={14} style={{ color, marginTop: 1, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-1)" }}>{title}</div>
        <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>{detail}</div>
      </div>
    </div>
  );
}

// ─── Spaces table ─────────────────────────────────────────────────────────────

function SpacesTable({ fixtures, isAdmin }: { fixtures: UnifiedFixture[]; isAdmin: boolean }) {
  // One row per rentable face — doubles expand to A + B, matching the KPIs.
  const rows = useMemo(
    () =>
      fixtures.flatMap(facesOf).sort((a, b) => {
        const ad = a.endDate ? daysUntil(a.endDate) : 99999;
        const bd = b.endDate ? daysUntil(b.endDate) : 99999;
        return ad - bd;
      }),
    [fixtures],
  );

  const headers = ["Código", "Tipo", "Proveedor", "Estado", "Días"];
  if (isAdmin) headers.push("Renta / mes");

  return (
    <div style={{ maxHeight: 320, overflowY: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
        <thead style={{ position: "sticky", top: 0, zIndex: 1 }}>
          <tr style={{ background: "var(--surface-2)" }}>
            {headers.map((h, i) => (
              <th
                key={h}
                style={{
                  padding: "8px 14px",
                  textAlign: i >= 4 ? "right" : "left",
                  fontSize: 9.5, fontWeight: 700,
                  color: "var(--ink-3)",
                  textTransform: "uppercase", letterSpacing: "0.08em",
                  borderBottom: "1px solid var(--line)",
                  whiteSpace: "nowrap",
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((entry) => {
            const ds = displayStatus(entry);
            const meta = STATUS_META[ds];
            const days = entry.endDate ? daysUntil(entry.endDate) : null;
            const isDanger = ds === "expired" || ds === "no_contract";

            return (
              <tr
                key={`${entry.fixture.id}-${entry.face}`}
                style={{
                  borderBottom: "1px solid var(--line-soft)",
                  background: isDanger ? "rgba(185,28,28,0.04)" : "transparent",
                }}
              >
                <td
                  style={{
                    padding: "10px 14px",
                    fontFamily: "var(--font-mono)",
                    fontSize: 11.5,
                    color: "var(--ink-2)",
                  }}
                >
                  {entry.code}
                </td>
                <td style={{ padding: "10px 14px", color: "var(--ink-2)" }}>
                  {entry.fixture.label}
                  {entry.face === "B" && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: "var(--accent-700)" }}> · Cara B</span>
                  )}
                </td>
                <td style={{ padding: "10px 14px" }}>
                  {entry.supplierName ? (
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
                <td style={{ padding: "10px 14px" }}>
                  <span
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 4,
                      fontSize: 10.5, fontWeight: 600,
                      padding: "2px 8px", borderRadius: 999,
                      background: meta.fill, color: meta.ring,
                    }}
                  >
                    <span
                      style={{
                        width: 5, height: 5, borderRadius: 99,
                        background: meta.ring, flexShrink: 0,
                      }}
                    />
                    {meta.label}
                  </span>
                </td>
                <td
                  style={{
                    padding: "10px 14px", textAlign: "right",
                    fontFamily: "var(--font-mono)", fontSize: 11.5, fontWeight: 600,
                    color:
                      days === null ? "var(--ink-4)"
                      : days < 0 ? "var(--danger)"
                      : days <= 30 ? "var(--warning)"
                      : "var(--success)",
                  }}
                >
                  {days === null ? "—" : `${days}d`}
                </td>
                {isAdmin && (
                  <td
                    style={{
                      padding: "10px 14px", textAlign: "right",
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
      const flags = facesOf(f).map((entry) => {
        const ok = (!q || faceMatchesQuery(entry, q)) && faceMatchesFilter(entry, mapFilter);
        if (ok) count++;
        return ok;
      });
      faceFlags.set(f.id, flags);
    });
    return { faceFlags, count };
  }, [fixtures, mapQuery, mapFilter]);

  // ── KPI computation (per rentable face — doubles count as 2 units) ──
  const kpis = useMemo(() => {
    const faces = fixtures.flatMap(facesOf);
    const total = faces.length;
    const occupied    = faces.filter((x) => x.status === "occupied").length;
    const free        = faces.filter((x) => x.status === "free").length;
    const reserved    = faces.filter((x) => x.status === "reserved").length;
    const maintenance = faces.filter((x) => x.status === "maintenance").length;
    const occPct = total ? Math.round((occupied / total) * 100) : 0;
    const revenue = faces
      .filter((x) => x.status === "occupied")
      .reduce((s, x) => s + (x.negotiatedValue ?? 0), 0);

    const withEnd: ContractEntry[] = faces
      .filter((x) => x.endDate && (x.status === "occupied" || x.status === "reserved"))
      .map((x) => ({ ...x, days: daysUntil(x.endDate) }))
      .sort((a, b) => a.days - b.days);

    const expiringSoon = withEnd.filter((x) => x.days >= 0 && x.days <= 30).length;
    const expired = withEnd.filter((x) => x.days < 0 && x.status === "occupied");
    const noContract = faces.filter((x) => x.status === "occupied" && !x.endDate).length;

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
    const topRevenue = topSuppliers[0]?.revenue || 1;

    return {
      total, occupied, free, reserved, maintenance,
      occPct, revenue,
      contracts: withEnd,
      expiringSoon,
      expired: expired.length,
      expiredCodes: expired.slice(0, 4).map((x) => x.code).join(", "),
      noContract,
      topSuppliers, topRevenue,
    };
  }, [fixtures]);

  const activeSedeCount = sedes.filter((s) => (fixturesBySede[s] ?? []).length > 0).length;

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

          {/* ── KPI row ──────────────────────────────────────────────────── */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
              gap: 12,
              marginBottom: 16,
            }}
          >
            <KpiCard
              label="Total espacios"
              value={kpis.total}
              valueColor="var(--ink-1)"
              hint={`${fixtures.length} fixtures · caras dobles ×2`}
              icon={<Building2 size={14} />}
              iconBg="var(--accent-100)"
              iconColor="var(--accent-700)"
            />
            <KpiCard
              label="Ocupados"
              value={kpis.occupied}
              valueColor="var(--accent-700)"
              hint={`${kpis.free} libres · ${kpis.reserved} reservados`}
              icon={<DoorOpen size={14} />}
              iconBg="var(--accent-100)"
              iconColor="var(--accent-700)"
            />
            <KpiCard
              label="Ocupación"
              value={`${kpis.occPct}%`}
              valueColor={
                kpis.occPct >= 80 ? "var(--success)"
                : kpis.occPct >= 50 ? "var(--accent-700)"
                : kpis.occPct >= 20 ? "var(--warning)"
                : "var(--danger)"
              }
              hint={`${kpis.occupied} de ${kpis.total} espacios`}
              icon={<Percent size={14} />}
              iconBg="var(--success-100)"
              iconColor="var(--success)"
            />
            {isAdmin && (
              <KpiCard
                label="Ingreso mensual"
                value={formatCOP(kpis.revenue)}
                valueColor="var(--success)"
                hint="COP · caras ocupadas"
                icon={<TrendingUp size={14} />}
                iconBg="var(--success-100)"
                iconColor="var(--success)"
              />
            )}
            <KpiCard
              label="Por vencer ≤30d"
              value={kpis.expiringSoon}
              valueColor={kpis.expiringSoon > 0 ? "var(--warning)" : "var(--ink-4)"}
              hint={
                kpis.expiringSoon > 0
                  ? "Revisá renovaciones pronto"
                  : "Sin vencimientos próximos ✓"
              }
              icon={<Clock size={14} />}
              iconBg={kpis.expiringSoon > 0 ? "var(--warning-100)" : "var(--surface-3)"}
              iconColor={kpis.expiringSoon > 0 ? "var(--warning)" : "var(--ink-4)"}
              bg={kpis.expiringSoon > 0 ? "var(--warning-50)" : undefined}
              borderColor={kpis.expiringSoon > 0 ? "rgba(180,83,9,0.2)" : undefined}
            />
          </div>

          {/* ── Contratos por vencer ─────────────────────────────────────── */}
          <Card style={{ padding: 0, overflow: "hidden", marginBottom: 16 }}>
            <CardHeader
              icon={<Clock size={13} style={{ color: "var(--warning)" }} />}
              title="Contratos por vencer"
              sub="· ordenados por días restantes"
            />
            {kpis.contracts.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", fontSize: 12, color: "var(--ink-3)" }}>
                Sin contratos con fecha de fin registrada.
              </div>
            ) : (
              <div style={{ maxHeight: 320, overflowY: "auto" }}>
                {kpis.contracts.map((entry, i) => (
                  <ExpiringRow
                    key={`${entry.fixture.id}-${entry.face}`}
                    entry={entry}
                    last={i === kpis.contracts.length - 1}
                  />
                ))}
              </div>
            )}
          </Card>

          {/* ── Requiere atención + Top proveedores ──────────────────────── */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isAdmin ? "1fr 1fr" : "1fr",
              gap: 16,
              marginBottom: 16,
            }}
          >
            <Card style={{ padding: 0, overflow: "hidden" }}>
              <CardHeader
                icon={<AlertTriangle size={13} style={{ color: "var(--warning)" }} />}
                title="Requiere atención"
              />
              <ActionRow
                tone="danger"
                active={kpis.expired > 0 || kpis.noContract > 0}
                title={
                  kpis.expired > 0 || kpis.noContract > 0
                    ? `${kpis.expired + kpis.noContract} espacio${kpis.expired + kpis.noContract !== 1 ? "s" : ""} ocupado${kpis.expired + kpis.noContract !== 1 ? "s" : ""} con contrato vencido o sin registrar`
                    : "Sin espacios ocupados irregulares"
                }
                detail={
                  kpis.expired > 0
                    ? kpis.expiredCodes + (kpis.expired > 4 ? "…" : "")
                    : kpis.noContract > 0
                    ? "Espacios ocupados sin fecha de fin"
                    : "Todos los espacios ocupados tienen contrato ✓"
                }
              />
              <ActionRow
                tone="warning"
                active={kpis.expiringSoon > 0}
                title={
                  kpis.expiringSoon > 0
                    ? `${kpis.expiringSoon} contrato${kpis.expiringSoon !== 1 ? "s" : ""} vence${kpis.expiringSoon !== 1 ? "n" : ""} en ≤30 días`
                    : "Sin contratos por vencer"
                }
                detail={
                  kpis.expiringSoon > 0
                    ? "Revisá renovaciones antes del vencimiento"
                    : "Ningún contrato vence en los próximos 30 días ✓"
                }
              />
              <ActionRow
                tone="success"
                active={kpis.free > 0}
                title={
                  kpis.free > 0
                    ? `${kpis.free} espacio${kpis.free !== 1 ? "s" : ""} disponible${kpis.free !== 1 ? "s" : ""} para arrendar`
                    : "Toda la planta asignada"
                }
                detail={
                  kpis.free > 0
                    ? "Oportunidad de ingresos — asigná un proveedor"
                    : "Sin espacios libres"
                }
                last
              />
            </Card>

            {isAdmin && (
              <Card style={{ padding: 0, overflow: "hidden" }}>
                <CardHeader
                  icon={<TrendingUp size={13} style={{ color: "var(--accent)" }} />}
                  title="Top proveedores"
                  sub="· por ingreso mensual"
                />
                <div style={{ padding: 8 }}>
                  {kpis.topSuppliers.length === 0 ? (
                    <div style={{ padding: 24, textAlign: "center" }}>
                      <div style={{ fontSize: 24, marginBottom: 6 }}>📋</div>
                      <div style={{ fontSize: 12, fontWeight: 500, color: "var(--ink-2)" }}>
                        Sin contratos activos
                      </div>
                      <div style={{ fontSize: 11, marginTop: 2, color: "var(--ink-3)" }}>
                        Asigná proveedores desde el Plano
                      </div>
                    </div>
                  ) : (
                    kpis.topSuppliers.map((s, i) => (
                      <SupplierRow
                        key={s.name}
                        name={s.name}
                        revenue={s.revenue}
                        count={s.count}
                        rank={i}
                        pct={(s.revenue / kpis.topRevenue) * 100}
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
              sub={`— ${sede} · ${fixtures.length} fixture${fixtures.length !== 1 ? "s" : ""}`}
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
