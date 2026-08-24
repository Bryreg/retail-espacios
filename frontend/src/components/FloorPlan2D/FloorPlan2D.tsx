import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  MousePointer2,
  RotateCw,
  Trash2,
  Save,
  Eye,
  EyeOff,
  Search,
  X,
} from "lucide-react";
import { useFixtureStore, selectFixtures, selectHasPendingWork } from "../../store/fixtureStore";
import type { UnifiedFixture, FixType, GondolaType, FaceData } from "../../types/fixtures";
import { isRentable, NON_RENTABLE_BY_DEFAULT } from "../../types/fixtures";
import { useAuthStore, selectIsAdmin } from "../../store/authStore";
import { findOrCreateSpace, createLease } from "../../api/spaces";
import { findOrCreateSupplier } from "../../api/suppliers";
import { listSpaceFiles, uploadSpaceFile, deleteSpaceFile, fileUrl } from "../../api/files";
import type { SpaceFileMeta } from "../../api/files";
import client from "../../api/client";

// ─── Constants ────────────────────────────────────────────────────────────────

const PX_PER_M = 40;

// ─── Types ────────────────────────────────────────────────────────────────────

type FixType2D =
  | "gondola_doble"
  | "gondola_mural"
  | "punta"
  | "robatope"
  | "metro"
  | "mueble"
  | "ristra"
  | "cross"
  | "isla"
  | "impulsador"
  | "batea"
  | "isla_fria"
  | "nevera_carnes"
  | "nevera_refrescos"
  | "stand_frutas"
  | "checkout"
  | "columna"
  | "exhibicion";   // legacy — kept for backward compat, not in catalog

type SpaceStatus = "free" | "occupied" | "reserved" | "maintenance";

interface PlacedItem2D {
  id: string;
  type: FixType2D;
  code: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Mirrors UnifiedFixture.rotY so 2D and 3D stay in sync. */
  rotY: number;
  status: SpaceStatus;
  supplierName: string;
  brandCategory: string;
  negotiatedValue: number;
  startDate: string;
  endDate: string;
  observation: string;
  sede: string;
  /** Short label rendered OUTSIDE the shape as a pill above the rect. */
  nomenclatura?: string;
  /** Face B commercial data (gondola_doble only); face A = top-level fields. */
  faceB?: FaceData;
  /** False marks infrastructure that is never rented out. Undefined = rentable. */
  rentable?: boolean;
}

// ─── Catalog ──────────────────────────────────────────────────────────────────

const CATALOG: {
  type: FixType2D;
  label: string;
  w: number;
  h: number;      // depth (Z axis in 2D top-down; maps to UnifiedFixture.d)
  emoji: string;
  prefix: string;
  category: string;
}[] = [
  // ── Góndolas ──────────────────────────────────────────────────────────
  { type: "gondola_doble", label: "Góndola Doble",    w: 0.90, h: 0.90, emoji: "📚", prefix: "GON", category: "Góndolas" },
  { type: "gondola_mural", label: "Góndola Mural",    w: 1.00, h: 0.40, emoji: "🧱", prefix: "GON", category: "Góndolas" },
  { type: "punta",         label: "Punta Góndola",    w: 0.90, h: 0.40, emoji: "🏷️",  prefix: "PUN", category: "Góndolas" },
  { type: "robatope",      label: "Robatope",          w: 0.30, h: 0.40, emoji: "🛡️", prefix: "ROB", category: "Góndolas" },
  // ── Displays & Cross-selling ────────────────────────────────────────
  { type: "ristra",        label: "Ristra",            w: 0.40, h: 0.40, emoji: "🪝",  prefix: "RIS", category: "Displays" },
  { type: "cross",         label: "Exhibidor Cruz",    w: 0.80, h: 0.80, emoji: "➕", prefix: "CRS", category: "Displays" },
  { type: "impulsador",   label: "Impulsador Marca",  w: 0.60, h: 0.40, emoji: "🏷️", prefix: "IMP", category: "Displays" },
  // ── Muebles ───────────────────────────────────────────────────────────
  { type: "mueble",        label: "Vitrina",           w: 1.20, h: 0.60, emoji: "🗄️", prefix: "MUE", category: "Muebles" },
  { type: "isla",          label: "Exhib. de Piso",    w: 1.20, h: 0.80, emoji: "🏪", prefix: "EXP", category: "Muebles" },
  { type: "batea",         label: "Batea",             w: 0.80, h: 0.60, emoji: "🧺", prefix: "BAT", category: "Muebles" },
  // ── Refrigeración ─────────────────────────────────────────────────────
  { type: "isla_fria",        label: "Isla Helados/Cong.", w: 1.80, h: 1.00, emoji: "🍦", prefix: "ISL", category: "Refrigeración" },
  { type: "nevera_carnes",    label: "Nevera Carnes",      w: 2.00, h: 0.85, emoji: "🥩", prefix: "CAR", category: "Refrigeración" },
  { type: "nevera_refrescos", label: "Nevera Refrescos",   w: 1.20, h: 0.75, emoji: "🥤", prefix: "BEB", category: "Refrigeración" },
  // ── Servicio ──────────────────────────────────────────────────────────
  { type: "stand_frutas",  label: "Stand Frutas/Verd", w: 1.50, h: 1.20, emoji: "🍎", prefix: "FRU", category: "Frescos" },
  { type: "checkout",      label: "Checkout / Caja",   w: 1.80, h: 0.70, emoji: "🛒", prefix: "CAJ", category: "Servicio" },
  // ── Infraestructura ───────────────────────────────────────────────────
  { type: "metro",         label: "Zona Libre",        w: 1.00, h: 1.00, emoji: "⬜", prefix: "MET", category: "Infraestructura" },
  { type: "columna",       label: "Columna",           w: 0.30, h: 0.30, emoji: "🏛️", prefix: "COL", category: "Infraestructura" },
];

// Warm semantic palette — matches design tokens
const STATUS_COLORS: Record<SpaceStatus, string> = {
  free:        "#15803D",   // --success
  occupied:    "#B91C1C",   // --danger
  reserved:    "#B45309",   // --warning
  maintenance: "#94917F",   // --muted-status
};

const STATUS_FILL: Record<SpaceStatus, string> = {
  free:        "rgba(21,128,61,0.10)",
  occupied:    "rgba(185,28,28,0.12)",
  reserved:    "rgba(180,83,9,0.10)",
  maintenance: "rgba(148,145,127,0.10)",
};

const STATUS_LABELS: Record<SpaceStatus, string> = {
  free:        "Disponible",
  occupied:    "Ocupado",
  reserved:    "Reservado",
  maintenance: "Mantenimiento",
};

// Non-rentable fixtures are store infrastructure, not sellable space. They get
// a neutral slate treatment so they read as "background" against the coloured
// commercial states instead of competing with them.
const NON_RENTABLE_LABEL = "No comercializable";
const NON_RENTABLE_STROKE = "#64748B";
const NON_RENTABLE_FILL = "rgba(100,116,139,0.10)";
const NON_RENTABLE_BADGE_STYLE: React.CSSProperties = {
  background: "rgba(100,116,139,0.18)",
  color: "#94A3B8",
};

// ─── Search + status filter (canvas control bar) ─────────────────────────────

type StatusFilter2D = "all" | "free" | "occupied" | "expiring" | "expired";

/** Accent/case-insensitive normalization: NFD + strip combining marks. */
function normalizeText(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/** Whole days from today (local midnight) until `dateStr`; null when unset/invalid.
 *  Same date math as DaysLeftStrip (T00:00:00 parse, round by MS_PER_DAY). */
function daysUntil(dateStr: string): number | null {
  if (!dateStr) return null;
  const end = new Date(`${dateStr}T00:00:00`);
  if (isNaN(end.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((end.getTime() - today.getTime()) / 86_400_000);
}

/** True when ANY face (A = top-level fields, B = faceB) passes the chip filter. */
function matchesStatusFilter(item: PlacedItem2D, filter: StatusFilter2D): boolean {
  if (filter === "all") return true;
  // A non-rentable fixture has no contract state — it can never match a
  // commercial filter like "libres" or "por vencer".
  if (!isRentable(item)) return false;
  const faces: { status: SpaceStatus; endDate: string }[] = [
    { status: item.status, endDate: item.endDate },
  ];
  if (item.faceB) faces.push({ status: item.faceB.status, endDate: item.faceB.endDate });
  return faces.some((f) => {
    if (filter === "free")     return f.status === "free";
    if (filter === "occupied") return f.status === "occupied";
    const d = daysUntil(f.endDate);
    if (d === null) return false;
    if (filter === "expiring") return d >= 0 && d <= 30;
    return d < 0 && f.status === "occupied"; // "expired"
  });
}

/** True when the pre-normalized query matches any searchable field on either face. */
function matchesQuery(item: PlacedItem2D, normalizedQuery: string): boolean {
  if (!normalizedQuery) return true;
  const fields = [
    item.code,
    item.label,
    item.nomenclatura ?? "",
    item.supplierName,
    item.brandCategory,
    item.faceB?.supplierName ?? "",
    item.faceB?.brandCategory ?? "",
  ];
  return fields.some((f) => normalizeText(f).includes(normalizedQuery));
}

const STATUS_FILTER_CHIPS: { value: StatusFilter2D; label: string; color: string; fill: string }[] = [
  { value: "all",      label: "Todos",      color: "var(--accent)",        fill: "var(--accent-50)" },
  { value: "free",     label: "Libres",     color: STATUS_COLORS.free,     fill: STATUS_FILL.free },
  { value: "occupied", label: "Ocupados",   color: STATUS_COLORS.occupied, fill: STATUS_FILL.occupied },
  { value: "expiring", label: "Por vencer", color: STATUS_COLORS.reserved, fill: STATUS_FILL.reserved },
  { value: "expired",  label: "Vencidos",   color: STATUS_COLORS.occupied, fill: STATUS_FILL.occupied },
];

// SEDES is now managed in the store — see storeSedeList below.

// ─── Store ↔ PlacedItem2D adapters ───────────────────────────────────────────

/**
 * Returns true when the fixture is visually rotated 90° or 270°.
 * In that case `w` and `d` must be swapped to get the 2D visual footprint.
 */
function isRotated90(rotY: number): boolean {
  // Normalize to [0, π) then check proximity to π/2
  const r = ((rotY % Math.PI) + Math.PI) % Math.PI;
  return Math.abs(r - Math.PI / 2) < 0.15;
}

/** Quantize rotY to quarter-turn steps (0 = south, 1 = west, 2 = north, 3 = east). */
function rotationSteps(rotY?: number): number {
  return Math.round(((rotY ?? 0) % (2 * Math.PI)) / (Math.PI / 2)) % 4;
}

/** 3D height defaults (used when promoting a 2D item to a UnifiedFixture).
 *  Keys match FixType2D so gondola_doble / gondola_mural can be distinguished. */
const H_DEFAULTS: Record<string, number> = {
  gondola_doble: 1.80, gondola_mural: 1.90,
  punta: 1.80, robatope: 1.60, ristra: 1.60,
  cross: 1.80, metro: 0.05, mueble: 2.00, exhibicion: 1.50,
  isla: 1.40, impulsador: 1.50,
  batea: 0.80, isla_fria: 0.90,
  nevera_carnes: 1.05, nevera_refrescos: 1.80,
  stand_frutas: 0.95, checkout: 0.90, columna: 3.00,
};

const COLOR_DEFAULTS: Record<string, string> = {
  gondola_doble: "#6366f1", gondola_mural: "#818cf8",
  punta: "#7c3aed", robatope: "#c0c0bc",
  ristra: "#d97706", cross: "#0891b2", impulsador: "#e11d48", metro: "#64748b",
  mueble: "#475569", exhibicion: "#ec4899",
  isla: "#f59e0b", batea: "#84cc16", nevera_mural: "#06b6d4",
  isla_fria: "#e5e7eb", nevera_carnes: "#1e293b", nevera_refrescos: "#1e293b",
  stand_frutas: "#84cc16",
  checkout: "#8b5cf6", columna: "#94a3b8",
};

/** Convert the unified store into the 2D internal array (run once on mount). */
function storeToItems(fixtures: UnifiedFixture[]): PlacedItem2D[] {
  return fixtures.map((f) => {
    let type2D: FixType2D;
    if (f.type === "gondola") {
      // Same undefined-defaults-to-double rule as isDoubleGondola() in types/fixtures.
      type2D = f.gondolaType === "wall" ? "gondola_mural" : "gondola_doble";
    } else {
      // All other types exist 1-to-1 in FixType2D (including new types + legacy exhibicion)
      type2D = f.type as FixType2D;
    }
    const catDef = CATALOG.find((c) => c.type === type2D);
    const rot90 = isRotated90(f.rotY ?? 0);
    // Visual footprint in 2D — swap w/d when rotated 90° or 270°
    const w2d = rot90 ? f.d : f.w;
    const h2d = rot90 ? f.w : f.d;
    return {
      id: f.id,
      type: type2D,
      code: f.code,
      label: catDef?.label ?? f.label,
      x: f.cx - w2d / 2,
      y: f.cz - h2d / 2,
      w: w2d,
      h: h2d,
      rotY: f.rotY ?? 0,
      status: f.status,
      supplierName: f.supplierName,
      brandCategory: f.brandCategory,
      // Worker layout responses omit negotiatedValue — default to 0 locally.
      negotiatedValue: f.negotiatedValue ?? 0,
      startDate: f.startDate,
      endDate: f.endDate,
      observation: f.observation,
      sede: f.sede,
      nomenclatura: f.nomenclatura,
      faceB: f.faceB,
      rentable: f.rentable,
    };
  });
}

/**
 * Convert the 2D internal array back to unified format for the store.
 * Preserves 3D-specific fields (h, color, slots, rotY) from the existing
 * store entry so the 3D editor doesn't lose its data on roundtrip.
 */
function itemsToStore(
  items: PlacedItem2D[],
  existingStore: UnifiedFixture[],
): UnifiedFixture[] {
  const existingMap = new Map(existingStore.map((f) => [f.id, f]));
  return items.map((item) => {
    let type: FixType;
    let gondolaType: GondolaType | undefined;
    if (item.type === "gondola_doble")       { type = "gondola"; gondolaType = "double"; }
    else if (item.type === "gondola_mural")  { type = "gondola"; gondolaType = "wall"; }
    else { type = item.type as FixType; }

    const existing = existingMap.get(item.id);
    // item.rotY tracks rotation (incremented by rotateItem); fall back to existing store value
    const rotY = item.rotY ?? existing?.rotY ?? 0;
    const rot90 = isRotated90(rotY);
    // Convert visual 2D dims back to canonical (unrotated) store dims
    const storeW = rot90 ? item.h : item.w;
    const storeD = rot90 ? item.w : item.h;
    // Use the FixType2D key (item.type) for defaults so gondola_doble / gondola_mural are distinct
    return {
      h:     existing?.h     ?? H_DEFAULTS[item.type]     ?? 1.8,
      color: existing?.color ?? COLOR_DEFAULTS[item.type] ?? "#6366f1",
      slots: existing?.slots,
      rotY,
      id: item.id,
      code: item.code,
      type,
      gondolaType,
      label: item.label,
      cx: item.x + item.w / 2,
      cz: item.y + item.h / 2,
      w: storeW,
      d: storeD,
      status: item.status,
      sede: item.sede,
      supplierName: item.supplierName,
      brandCategory: item.brandCategory,
      negotiatedValue: item.negotiatedValue,
      startDate: item.startDate,
      endDate: item.endDate,
      observation: item.observation,
      nomenclatura: item.nomenclatura,
      faceB: item.faceB,
      rentable: item.rentable,
    };
  });
}

// ─── Smart alignment guides (PowerPoint-style) ───────────────────────────────

const ALIGN_TOL_M = 0.005;    // exactness tolerance for active alignment (post-snap)
const GUIDE_EXTEND_M = 0.4;   // guide line overshoot past both items (m)
const MAX_GUIDES = 4;         // clutter cap — nearest alignments win

interface AlignmentGuide {
  axis: "v" | "h";
  /** Aligned coordinate in metres (x for vertical guides, y for horizontal). */
  pos: number;
  /** Span along the other axis (m), already extended by GUIDE_EXTEND_M. */
  start: number;
  end: number;
  /** Center-center alignment → render ⊕ markers at both item centers. */
  isCenter: boolean;
  centers: { x: number; y: number }[];
}

/**
 * Detect the alignments EXACTLY in effect (±ALIGN_TOL_M, i.e. after snapping)
 * between the active item (drag leader / resized item) and every other
 * non-dragged item. Per axis+type only the nearest neighbor (perpendicular
 * gap) is kept; the result is capped to the MAX_GUIDES nearest guides.
 * O(n) over items, no state — derived in render via useMemo.
 */
function computeAlignmentGuides(
  active: { id: string; x: number; y: number; w: number; h: number },
  others: PlacedItem2D[],
  excludeIds: Set<string> | null,
  mode: "drag" | "resize",
): AlignmentGuide[] {
  const aL = active.x, aR = active.x + active.w, aCX = active.x + active.w / 2;
  const aT = active.y, aB = active.y + active.h, aCY = active.y + active.h / 2;

  const best = new Map<string, { dist: number; guide: AlignmentGuide }>();

  for (const o of others) {
    if (o.id === active.id || excludeIds?.has(o.id)) continue;
    const oL = o.x, oR = o.x + o.w, oCX = o.x + o.w / 2;
    const oT = o.y, oB = o.y + o.h, oCY = o.y + o.h / 2;
    // Perpendicular rect-to-rect gaps (0 when overlapping on that axis)
    const gapY = Math.max(oT - aB, aT - oB, 0);
    const gapX = Math.max(oL - aR, aL - oR, 0);

    // Vertical guides (constant X): left-left, right-right, centerX-centerX,
    // left-right / right-left (adjacency). Resize: right edge only.
    const vPairs: { type: string; a: number; o: number; center?: boolean }[] =
      mode === "drag"
        ? [
            { type: "ll", a: aL, o: oL },
            { type: "rr", a: aR, o: oR },
            { type: "cc", a: aCX, o: oCX, center: true },
            { type: "lr", a: aL, o: oR },
            { type: "rl", a: aR, o: oL },
          ]
        : [
            { type: "rr", a: aR, o: oR },
            { type: "rl", a: aR, o: oL },
          ];
    for (const p of vPairs) {
      if (Math.abs(p.a - p.o) > ALIGN_TOL_M) continue;
      const key = `v:${p.type}`;
      const prev = best.get(key);
      if (prev && prev.dist <= gapY) continue;
      best.set(key, {
        dist: gapY,
        guide: {
          axis: "v",
          pos: p.o,
          start: Math.min(aT, oT) - GUIDE_EXTEND_M,
          end: Math.max(aB, oB) + GUIDE_EXTEND_M,
          isCenter: !!p.center,
          centers: p.center ? [{ x: p.o, y: aCY }, { x: p.o, y: oCY }] : [],
        },
      });
    }

    // Horizontal guides (constant Y): top-top, bottom-bottom, centerY-centerY,
    // top-bottom / bottom-top (adjacency). Resize: bottom edge only.
    const hPairs: { type: string; a: number; o: number; center?: boolean }[] =
      mode === "drag"
        ? [
            { type: "tt", a: aT, o: oT },
            { type: "bb", a: aB, o: oB },
            { type: "cc", a: aCY, o: oCY, center: true },
            { type: "tb", a: aT, o: oB },
            { type: "bt", a: aB, o: oT },
          ]
        : [
            { type: "bb", a: aB, o: oB },
            { type: "bt", a: aB, o: oT },
          ];
    for (const p of hPairs) {
      if (Math.abs(p.a - p.o) > ALIGN_TOL_M) continue;
      const key = `h:${p.type}`;
      const prev = best.get(key);
      if (prev && prev.dist <= gapX) continue;
      best.set(key, {
        dist: gapX,
        guide: {
          axis: "h",
          pos: p.o,
          start: Math.min(aL, oL) - GUIDE_EXTEND_M,
          end: Math.max(aR, oR) + GUIDE_EXTEND_M,
          isCenter: !!p.center,
          centers: p.center ? [{ x: aCX, y: p.o }, { x: oCX, y: p.o }] : [],
        },
      });
    }
  }

  return [...best.values()]
    .sort((e1, e2) => e1.dist - e2.dist)
    .slice(0, MAX_GUIDES)
    .map((e) => e.guide);
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface FloorPlan2DProps {
  defaultEditMode?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function FloorPlan2D({ defaultEditMode = false }: FloorPlan2DProps) {
  // ── Unified store (read once on mount; write on every change) ────────────────
  const {
    setSede: pushSedeToStore,
    commit,
    undo,
    redo,
    camera2D,
    setCamera2D,
    sedes: storeSedeList,
    addSede,
    renameSede,
    catalogLabels,
    setCatalogLabel,
  } = useFixtureStore();

  // Same array object seeds the state AND the "came from the store" ref below,
  // so the first items→store effect recognises it as an echo and stays quiet.
  const initialItems = useMemo(
    () => storeToItems(selectFixtures(useFixtureStore.getState())),
    [],
  );
  const [items, setItems]             = useState<PlacedItem2D[]>(initialItems);
  const [selectedIds, setSelectedIds]   = useState<Set<string>>(new Set());
  const [editMode, setEditMode]       = useState(defaultEditMode);
  const [activeTool, setActiveTool]   = useState<"select" | "place" | "draw">("select");
  const [pendingType, setPendingType] = useState<FixType2D | null>(null);
  const [editingCodeId, setEditingCodeId] = useState<string | null>(null);
  const [editingCodeVal, setEditingCodeVal] = useState("");
  // CHANGE 1: initialize pan/zoom from store so view is preserved on tab switch
  const [panOffset, setPanOffset]     = useState(() => ({ x: camera2D.panX, y: camera2D.panY }));
  const [zoom, setZoom]               = useState(() => camera2D.zoom);
  const [drawing, setDrawing]         = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [dragState, setDragState]     = useState<{ id: string; ox: number; oy: number } | null>(null);
  const [dragOrigPositions, setDragOrigPositions] = useState<Map<string, { x: number; y: number }> | null>(null);
  const [isColliding, setIsColliding] = useState(false);
  const [selectionRect, setSelectionRect] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [resizeState, setResizeState] = useState<{ id: string; ox: number; oy: number; origW: number; origH: number } | null>(null);
  const [panState, setPanState]       = useState<{ startX: number; startY: number; startPanX: number; startPanY: number } | null>(null);
  const [spaceDown, setSpaceDown]     = useState(false);
  const [ghostPos, setGhostPos]       = useState<{ x: number; y: number } | null>(null);
  const [sede, setSede]               = useState(() => useFixtureStore.getState().sede);
  // Sede management UI state
  const [editingSedeInline, setEditingSedeInline] = useState(false);
  const [editingSedeVal, setEditingSedeVal]       = useState("");
  const [addingNewSede, setAddingNewSede]         = useState(false);
  const [newSedeVal, setNewSedeVal]               = useState("");
  const [clipboard, setClipboard]               = useState<PlacedItem2D[]>([]);
  // Catalog label editing state
  const [editingCatalogType, setEditingCatalogType] = useState<string | null>(null);
  const [editingCatalogVal, setEditingCatalogVal]   = useState("");
  // Nomenclatura pills visibility (bottom-bar "Etiquetas" toggle, default ON)
  const [showLabels, setShowLabels] = useState(true);
  // Canvas search + status filter (local UI state — never touches the store)
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter2D>("all");
  // Which face of a double gondola the panel opens on (set by half-click detection)
  const [panelFace, setPanelFace] = useState<"A" | "B">("A");
  const svgRef = useRef<SVGSVGElement>(null);
  const cachedSvgRect = useRef<DOMRect | null>(null);
  // The exact items array we last derived FROM the store. Sending it back would
  // be an echo, so the items→store effect skips it by identity.
  //
  // This replaces a single `isFirstRender` boolean that could not survive the
  // mount sequence: the store→items effect calls setItems() with a fresh array,
  // which re-runs the items→store effect a second time — and the boolean had
  // already been consumed by the first run. On a browser with empty
  // localStorage that second run committed an EMPTY layout ~16 ms after mount
  // and pushed it, wiping the sede on the server before the pull had even
  // landed. Identity comparison cannot be consumed by the wrong pass.
  const itemsFromStoreRef = useRef<PlacedItem2D[] | null>(initialItems);
  // Holds the exact array we last pushed to the store, so the store→items
  // effect can tell our own echo apart from a genuine external change. A plain
  // boolean could not: it was consumed by whichever update arrived first, so a
  // layout pulled from the server while we were editing got swallowed and the
  // canvas kept showing stale fixtures.
  const lastCommittedRef = useRef<UnifiedFixture[] | null>(null);

  // ── Role gating: workers get a strictly read-only plan ───────────────────────
  const isAdmin = useAuthStore(selectIsAdmin);
  useEffect(() => {
    if (!isAdmin && editMode) setEditMode(false);
  }, [isAdmin, editMode]);

  // ── Sync store → items (for undo/redo/syncFromServer) ────────────────────────
  // When the store changes from outside (undo, redo, server sync), update local items.
  const storeFixtures = useFixtureStore(selectFixtures);
  useEffect(() => {
    // commit() stores the array by reference, so identity equality means this
    // update is the echo of our own commit and must not rebuild the canvas.
    if (lastCommittedRef.current === storeFixtures) return;
    // External change (undo/redo/server sync) — update canvas to match
    const next = storeToItems(storeFixtures);
    itemsFromStoreRef.current = next; // suppress the items→store echo
    setItems(next);
  }, [storeFixtures]);

  // ── Sync items → unified store ───────────────────────────────────────────────

  // CHANGE 2: use commit() so items sync is undoable for all user-initiated mutations.
  // Debounced (16 ms) so rapid mousemove events during drag collapse into one commit (B1).
  // Snapshot existingStore BEFORE the timeout to avoid reading a stale store value
  // if another commit lands in those 16 ms.
  useEffect(() => {
    // These items came from the store, not from the user — do not send them back.
    if (itemsFromStoreRef.current === items) return;
    const snapshot = selectFixtures(useFixtureStore.getState());
    const timer = setTimeout(() => {
      const converted = itemsToStore(items, snapshot);
      lastCommittedRef.current = converted;
      commit(converted);
    }, 16);
    return () => clearTimeout(timer);
  }, [items, commit]);

  // When sede changes: push to store AND reinitialize canvas with that sede's fixtures.
  // The identity ref above prevents the re-init from echoing back to the store.
  const prevSedeRef = useRef(sede);
  useEffect(() => {
    if (prevSedeRef.current === sede) return;
    prevSedeRef.current = sede;
    // setSede in the store clears undo/redo and switches the active sede.
    pushSedeToStore(sede);
    // Re-init canvas from the new sede's saved fixtures (may be empty = blank canvas).
    const newFixtures = useFixtureStore.getState().fixturesBySede[sede] ?? [];
    const next = storeToItems(newFixtures);
    itemsFromStoreRef.current = next;   // suppress the items→store echo
    setItems(next);
  }, [sede, pushSedeToStore]);

  // CHANGE 1: persist camera state to store so view survives tab switches
  useEffect(() => {
    setCamera2D({ panX: panOffset.x, panY: panOffset.y, zoom });
  }, [panOffset.x, panOffset.y, zoom, setCamera2D]); // W2: setCamera2D is a stable Zustand action

  // ── Helper: compute next code for a type ────────────────────────────────────

  const nextCode = useCallback((type: FixType2D, currentItems: PlacedItem2D[]): string => {
    const prefix = CATALOG.find((c) => c.type === type)?.prefix ?? "SPC";
    const nums = currentItems
      .filter((i) => i.code.startsWith(prefix + "-"))
      .map((i) => parseInt(i.code.slice(prefix.length + 1), 10))
      .filter((n) => !isNaN(n));
    const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
    return `${prefix}-${String(next).padStart(2, "0")}`;
  }, []);

  // ── Invalidate cached rect on container resize ───────────────────────────────
  useEffect(() => {
    if (!svgRef.current) return;
    const observer = new ResizeObserver(() => { cachedSvgRect.current = null; });
    observer.observe(svgRef.current);
    return () => observer.disconnect();
  }, []);

  // ── Helper: SVG point from mouse event ──────────────────────────────────────

  const svgPoint = useCallback(
    (e: React.MouseEvent): { x: number; y: number } => {
      const rect = cachedSvgRect.current ?? svgRef.current!.getBoundingClientRect();
      if (!cachedSvgRect.current) cachedSvgRect.current = rect;
      return {
        x: (e.clientX - rect.left - panOffset.x) / (PX_PER_M * zoom),
        y: (e.clientY - rect.top  - panOffset.y) / (PX_PER_M * zoom),
      };
    },
    [panOffset, zoom]
  );

  // ── Helper: snap to grid ─────────────────────────────────────────────────────

  // 0.05 m (5 cm) — LCM of all catalog dimensions (0.90, 0.60, 0.45 are all
  // multiples of 0.05 but NOT of 0.25, which caused misalignment).
  function snapTo(v: number, grid = 0.05): number {
    return Math.round(v / grid) * grid;
  }

  // ── Helper: collision detection ───────────────────────────────────────────────

  function hasCollision(
    item: { id: string; x: number; y: number; w: number; h: number },
    others: PlacedItem2D[],
    tol = 0.01,
  ): boolean {
    return others.some(
      (o) =>
        o.id !== item.id &&
        item.x + tol          < o.x + o.w &&
        item.x + item.w - tol > o.x &&
        item.y + tol          < o.y + o.h &&
        item.y + item.h - tol > o.y,
    );
  }

  // ── Helper: magnetic edge snapping during drag ────────────────────────────────

  const EDGE_SNAP_M = 0.15; // snap radius in metres

  function snapToEdges(
    item: { id: string; x: number; y: number; w: number; h: number },
    others: PlacedItem2D[],
  ): { x: number; y: number } {
    let { x, y } = item;
    let bestDX = EDGE_SNAP_M;
    let bestDY = EDGE_SNAP_M;
    // Track which fixture triggered a side-adjacency snap (not just alignment)
    let xSideFixture: PlacedItem2D | null = null;
    let ySideFixture: PlacedItem2D | null = null;

    for (const o of others) {
      if (o.id === item.id) continue;

      // X: side-adjacency candidates (touch left/right edge) — tracked separately
      for (const cx of [o.x - item.w, o.x + o.w]) {
        const d = cx - x;
        if (Math.abs(d) < Math.abs(bestDX)) { bestDX = d; xSideFixture = o; }
      }
      // X: alignment candidates (same left/right edge or centerX) — clears the fixture tracker
      for (const cx of [o.x, o.x + o.w - item.w, o.x + (o.w - item.w) / 2]) {
        const d = cx - x;
        if (Math.abs(d) < Math.abs(bestDX)) { bestDX = d; xSideFixture = null; }
      }

      // Y: side-adjacency candidates
      for (const cy of [o.y - item.h, o.y + o.h]) {
        const d = cy - y;
        if (Math.abs(d) < Math.abs(bestDY)) { bestDY = d; ySideFixture = o; }
      }
      // Y: alignment candidates (same top/bottom edge or centerY)
      for (const cy of [o.y, o.y + o.h - item.h, o.y + (o.h - item.h) / 2]) {
        const d = cy - y;
        if (Math.abs(d) < Math.abs(bestDY)) { bestDY = d; ySideFixture = null; }
      }
    }

    let snappedX = Math.abs(bestDX) < EDGE_SNAP_M ? snapTo(x + bestDX) : x;
    let snappedY = Math.abs(bestDY) < EDGE_SNAP_M ? snapTo(y + bestDY) : y;

    // Compound snap: when X side-snapped and Y didn't primary-snap, pull Y to
    // align with the side-snapped fixture (top / center / bottom).
    // Guard: skip compound if Y already has a primary snap — don't overwrite it.
    const COMPOUND = 0.5;
    if (xSideFixture && Math.abs(bestDX) < EDGE_SNAP_M && Math.abs(bestDY) >= EDGE_SNAP_M) {
      const o = xSideFixture;
      let bestCY = COMPOUND;
      for (const cy of [o.y, o.y + (o.h - item.h) / 2, o.y + o.h - item.h]) {
        const d = cy - y;
        if (Math.abs(d) < Math.abs(bestCY)) bestCY = d;
      }
      if (Math.abs(bestCY) < COMPOUND) snappedY = snapTo(y + bestCY);
    }

    // Compound snap: when Y side-snapped and X didn't primary-snap, pull X to align.
    // Guard: skip compound if X already has a primary snap — don't overwrite it.
    if (ySideFixture && Math.abs(bestDY) < EDGE_SNAP_M && Math.abs(bestDX) >= EDGE_SNAP_M) {
      const o = ySideFixture;
      let bestCX = COMPOUND;
      for (const cx of [o.x, o.x + (o.w - item.w) / 2, o.x + o.w - item.w]) {
        const d = cx - x;
        if (Math.abs(d) < Math.abs(bestCX)) bestCX = d;
      }
      if (Math.abs(bestCX) < COMPOUND) snappedX = snapTo(x + bestCX);
    }

    return { x: snappedX, y: snappedY };
  }

  // ── Place item ───────────────────────────────────────────────────────────────

  const placeItem = useCallback(
    (type: FixType2D, x: number, y: number, w?: number, h?: number) => {
      const def = CATALOG.find((c) => c.type === type)!;
      setItems((prev) => {
        const code = nextCode(type, prev);
        const newItem: PlacedItem2D = {
          id: `${type}-${Date.now()}`,
          type,
          code,
          label: def.label,
          x: snapTo(x - (w ?? def.w) / 2),
          y: snapTo(y - (h ?? def.h) / 2),
          w: w ?? def.w,
          h: h ?? def.h,
          rotY: 0,
          status: "free",
          supplierName: "",
          brandCategory: "",
          negotiatedValue: 0,
          startDate: "",
          endDate: "",
          observation: "",
          sede,
          // Columns, checkouts and free zones are part of the store, not stock
          // to sell. Everything else stays rentable (flag left absent) so the
          // saved payload keeps its historical shape.
          ...(NON_RENTABLE_BY_DEFAULT.has(type) ? { rentable: false } : {}),
        };
        // Reject placement if it would overlap an existing fixture
        if (hasCollision(newItem, prev)) return prev;
        return [...prev, newItem];
      });
      setPendingType(null);
      setActiveTool("select");
    },
    [nextCode, sede]
  );

  // ── Delete / rotate / duplicate ──────────────────────────────────────────────

  const deleteItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    setSelectedIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
  }, []);

  const rotateItem = useCallback((id: string | null) => {
    if (!id) return;
    setItems((prev) =>
      prev.map((i) =>
        i.id === id
          ? { ...i, w: i.h, h: i.w, rotY: ((i.rotY ?? 0) + Math.PI / 2) % (2 * Math.PI) }
          : i
      )
    );
  }, []);

  /** Duplicate one or more fixtures, shifting each by 0.5m. Supports multi-selection. */
  const duplicateSelected = useCallback(
    (ids: Set<string>) => {
      if (ids.size === 0) return;
      const sources = items.filter((i) => ids.has(i.id));
      if (sources.length === 0) return;
      const nextItems = [...items];
      const newIds: string[] = [];
      for (const src of sources) {
        const code = nextCode(src.type, nextItems);
        const copy: PlacedItem2D = {
          ...src,
          id: `${src.type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          code,
          x: src.x + 0.5,
          y: src.y + 0.5,
        };
        if (!hasCollision(copy, nextItems)) {
          nextItems.push(copy);
          newIds.push(copy.id);
        }
      }
      if (newIds.length === 0) return;
      // Set both states outside any updater to avoid React violation
      setItems(nextItems);
      setSelectedIds(new Set(newIds));
    },
    [items, nextCode]
  );

  /** Copy selected items to clipboard. */
  const copySelected = useCallback(() => {
    const selected = items.filter((i) => selectedIds.has(i.id));
    if (selected.length > 0) setClipboard(selected);
  }, [items, selectedIds]);

  /** Paste clipboard items with a collision-aware offset. */
  const pasteClipboard = useCallback(() => {
    if (clipboard.length === 0) return;
    // Find an offset that avoids collisions (try +1 up to +5)
    let offsetX = 1, offsetY = 1;
    const others = items.filter((i) => !clipboard.some((c) => c.id === i.id));
    while (offsetX < 6) {
      const trial = clipboard.map((src) => ({ ...src, x: src.x + offsetX, y: src.y + offsetY }));
      if (!trial.some((t) => hasCollision(t, others))) break;
      offsetX++; offsetY++;
    }
    const nextItems = [...items];
    const newIds: string[] = [];
    for (const src of clipboard) {
      const code = nextCode(src.type, nextItems);
      const copy: PlacedItem2D = {
        ...src,
        id: `${src.type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        code,
        x: src.x + offsetX,
        y: src.y + offsetY,
      };
      nextItems.push(copy);
      newIds.push(copy.id);
    }
    // Set both states outside any updater to avoid React violation
    setItems(nextItems);
    setSelectedIds(new Set(newIds));
  }, [clipboard, items, nextCode]);

  // ── Keyboard shortcuts ───────────────────────────────────────────────────────

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;

      if (e.key === " ") { setSpaceDown(true); e.preventDefault(); return; }

      // CHANGE 2: undo/redo shortcuts (work regardless of editMode)
      if (e.ctrlKey && e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); return; }
      if (e.ctrlKey && (e.key === "y" || (e.key === "z" && e.shiftKey))) { e.preventDefault(); redo(); return; }

      if (!editMode) return;

      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedIds.size > 0) {
          setItems((prev) => prev.filter((i) => !selectedIds.has(i.id)));
          setSelectedIds(new Set());
        }
      }
      const singleId = selectedIds.size === 1 ? [...selectedIds][0] : null;
      if (e.key === "r" || e.key === "R") rotateItem(singleId);
      if (e.key === "Escape") {
        setSelectedIds(new Set());
        setSelectionRect(null);
        setActiveTool("select");
        setPendingType(null);
        setDrawing(null);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "a") {
        e.preventDefault();
        setSelectedIds(new Set(items.map((i) => i.id)));
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "d") {
        duplicateSelected(selectedIds);
        e.preventDefault();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "c") {
        copySelected();
        e.preventDefault();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "v") {
        pasteClipboard();
        e.preventDefault();
      }
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.key === " ") setSpaceDown(false);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [editMode, selectedIds, items, deleteItem, rotateItem, duplicateSelected, copySelected, pasteClipboard, undo, redo]);

  // ── SVG mouse handlers ───────────────────────────────────────────────────────

  function handleSvgMouseDown(e: React.MouseEvent<SVGSVGElement>) {
    // Middle button or space+drag → pan
    if (e.button === 1 || (spaceDown && e.button === 0)) {
      e.preventDefault();
      setPanState({
        startX: e.clientX,
        startY: e.clientY,
        startPanX: panOffset.x,
        startPanY: panOffset.y,
      });
      return;
    }

    if (e.button !== 0) return;

    if (activeTool === "place" && pendingType !== null) {
      const pt = svgPoint(e);
      placeItem(pendingType, pt.x, pt.y);
      return;
    }

    if (activeTool === "draw") {
      const pt = svgPoint(e);
      setDrawing({ x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y });
      return;
    }

    // Background drag in select mode:
    //   · Shift+drag → rubber-band selection
    //   · plain drag  → pan (same as always)
    if (activeTool === "select") {
      if (e.shiftKey) {
        const pt = svgPoint(e);
        setSelectionRect({ x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y });
        return;
      }
      // plain background click/drag → pan; deselect on mouseup if no movement
      setPanState({
        startX: e.clientX,
        startY: e.clientY,
        startPanX: panOffset.x,
        startPanY: panOffset.y,
      });
      return;
    }

    // Other tools: deselect + pan on background drag
    setSelectedIds(new Set());
    setPanState({
      startX: e.clientX,
      startY: e.clientY,
      startPanX: panOffset.x,
      startPanY: panOffset.y,
    });
  }

  function handleSvgMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    // Pan
    if (panState) {
      setPanOffset({
        x: panState.startPanX + (e.clientX - panState.startX),
        y: panState.startPanY + (e.clientY - panState.startY),
      });
      return;
    }

    // Drag item — with edge-snapping and live collision feedback
    if (dragState) {
      const pt = svgPoint(e);
      const rawX = snapTo(pt.x - dragState.ox);
      const rawY = snapTo(pt.y - dragState.oy);
      const dragged = items.find((i) => i.id === dragState.id)!;
      const snapped = snapToEdges({ ...dragged, x: rawX, y: rawY }, items);
      const colliding = hasCollision({ ...dragged, ...snapped }, items);
      setIsColliding(colliding);

      if (dragOrigPositions && dragOrigPositions.size > 1) {
        // Multi-drag: apply the same delta to all selected items
        const origLeader = dragOrigPositions.get(dragState.id);
        if (origLeader) {
          const dx = snapped.x - origLeader.x;
          const dy = snapped.y - origLeader.y;
          setItems((prev) =>
            prev.map((i) => {
              const orig = dragOrigPositions.get(i.id);
              if (!orig) return i;
              return { ...i, x: orig.x + dx, y: orig.y + dy };
            }),
          );
        }
      } else {
        setItems((prev) =>
          prev.map((i) =>
            i.id === dragState.id ? { ...i, x: snapped.x, y: snapped.y } : i,
          ),
        );
      }
      return;
    }

    // Rubber-band selection
    if (selectionRect) {
      const pt = svgPoint(e);
      setSelectionRect((prev) => (prev ? { ...prev, x1: pt.x, y1: pt.y } : null));
      return;
    }

    // Resize item
    if (resizeState) {
      const pt = svgPoint(e);
      const dw = pt.x - resizeState.ox;
      const dh = pt.y - resizeState.oy;
      setItems((prev) =>
        prev.map((i) =>
          i.id === resizeState.id
            ? {
                ...i,
                w: Math.max(0.25, snapTo(resizeState.origW + dw)),
                h: Math.max(0.25, snapTo(resizeState.origH + dh)),
              }
            : i
        )
      );
      return;
    }

    // Drawing rect
    if (drawing) {
      const pt = svgPoint(e);
      setDrawing((d) => d ? { ...d, x1: pt.x, y1: pt.y } : null);
      return;
    }

    // Ghost cursor
    if (activeTool === "place" && pendingType !== null) {
      const pt = svgPoint(e);
      setGhostPos({ x: pt.x, y: pt.y });
    }
  }

  function handleSvgMouseUp(e: React.MouseEvent<SVGSVGElement>) {
    if (panState) {
      // If movement was tiny it was a click → deselect (select tool, no shift)
      const moved =
        Math.abs(e.clientX - panState.startX) > 4 ||
        Math.abs(e.clientY - panState.startY) > 4;
      if (!moved && activeTool === "select" && !e.shiftKey) {
        setSelectedIds(new Set());
      }
      setPanState(null);
      return;
    }
    if (dragState) {
      // If the drop position collides, revert all dragged items to their start positions
      if (isColliding && dragOrigPositions) {
        setItems((prev) =>
          prev.map((i) => {
            const orig = dragOrigPositions.get(i.id);
            return orig ? { ...i, x: orig.x, y: orig.y } : i;
          }),
        );
      }
      setDragState(null);
      setDragOrigPositions(null);
      setIsColliding(false);
      return;
    }
    if (resizeState) { setResizeState(null); return; }

    // Rubber-band selection finalize
    if (selectionRect) {
      const x0 = Math.min(selectionRect.x0, selectionRect.x1);
      const y0 = Math.min(selectionRect.y0, selectionRect.y1);
      const x1 = Math.max(selectionRect.x0, selectionRect.x1);
      const y1 = Math.max(selectionRect.y0, selectionRect.y1);
      const hasArea = (x1 - x0) > 0.05 && (y1 - y0) > 0.05;
      if (hasArea) {
        const hit = new Set(
          items
            .filter((i) => i.x < x1 && i.x + i.w > x0 && i.y < y1 && i.y + i.h > y0)
            .map((i) => i.id),
        );
        if (e.shiftKey) {
          setSelectedIds((prev) => new Set([...prev, ...hit]));
        } else {
          setSelectedIds(hit);
        }
      } else {
        // Plain click on background → deselect unless shift
        if (!e.shiftKey) setSelectedIds(new Set());
      }
      setSelectionRect(null);
      return;
    }

    if (drawing) {
      const rawX = Math.min(drawing.x0, drawing.x1);
      const rawY = Math.min(drawing.y0, drawing.y1);
      const rawW = Math.abs(drawing.x1 - drawing.x0);
      const rawH = Math.abs(drawing.y1 - drawing.y0);
      const w = Math.max(0.5, snapTo(rawW));
      const h = Math.max(0.5, snapTo(rawH));
      if (w >= 0.5 && h >= 0.5) {
        placeItem("exhibicion", rawX + rawW / 2, rawY + rawH / 2, w, h);
      }
      setDrawing(null);
    }
  }

  function handleSvgWheel(e: React.WheelEvent<SVGSVGElement>) {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    setZoom((z) => Math.min(4, Math.max(0.25, z * factor)));
  }

  // ── Item drag ────────────────────────────────────────────────────────────────

  function handleItemMouseDown(e: React.MouseEvent, id: string) {
    if (!editMode || activeTool !== "select") return;
    e.stopPropagation();
    const item = items.find((i) => i.id === id)!;
    const pt = svgPoint(e);

    // Determine the set of items that will be dragged
    // If shift: keep existing selection as-is (will be toggled in onClick)
    // If no shift and item not in selection: select only this one for the drag
    const draggingIds = e.shiftKey || selectedIds.has(id)
      ? (selectedIds.has(id) ? [...selectedIds] : [...selectedIds, id])
      : [id];

    const origPositions = new Map(
      items
        .filter((i) => draggingIds.includes(i.id))
        .map((i) => [i.id, { x: i.x, y: i.y }]),
    );

    setDragOrigPositions(origPositions);
    setIsColliding(false);
    setDragState({ id, ox: pt.x - item.x, oy: pt.y - item.y });
  }

  // ── Resize handle ────────────────────────────────────────────────────────────

  function handleResizeStart(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    const item = items.find((i) => i.id === id)!;
    const pt = svgPoint(e);
    setResizeState({ id, ox: pt.x - item.w, oy: pt.y - item.h, origW: item.w, origH: item.h });
  }

  // ── Double-click: edit code ──────────────────────────────────────────────────

  function handleItemDblClick(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    const item = items.find((i) => i.id === id)!;
    setEditingCodeId(id);
    setEditingCodeVal(item.code);
  }

  function commitCodeEdit() {
    if (!editingCodeId) return;
    const val = editingCodeVal.trim();
    if (val) {
      setItems((prev) =>
        prev.map((i) => (i.id === editingCodeId ? { ...i, code: val } : i))
      );
    }
    setEditingCodeId(null);
    setEditingCodeVal("");
  }

  // ── Panel update helper ──────────────────────────────────────────────────────

  // Derived single-selection ID (null when 0 or 2+ items selected)
  const selectedId = selectedIds.size === 1 ? [...selectedIds][0] : null;

  function updateSelected(patch: Partial<PlacedItem2D>) {
    if (!selectedId) return;
    setItems((prev) =>
      prev.map((i) => (i.id === selectedId ? { ...i, ...patch } : i))
    );
  }

  // ── Derived ──────────────────────────────────────────────────────────────────

  const selectedItem = selectedId ? (items.find((i) => i.id === selectedId) ?? null) : null;
  const ghostDef = pendingType ? CATALOG.find((c) => c.type === pendingType) : null;

  // Search + status filter matching (AND-combined); null set = no filter active
  const normalizedQuery = normalizeText(searchQuery.trim());
  const filterActive = normalizedQuery.length > 0 || statusFilter !== "all";
  const matchedIds = useMemo<Set<string> | null>(() => {
    if (!filterActive) return null;
    const s = new Set<string>();
    for (const it of items) {
      if (matchesQuery(it, normalizedQuery) && matchesStatusFilter(it, statusFilter)) {
        s.add(it.id);
      }
    }
    return s;
  }, [items, normalizedQuery, statusFilter, filterActive]);

  // Smart alignment guides — derived from the live drag/resize state so no
  // extra setState happens inside mousemove. Empty outside drag/resize (and
  // in view mode), so guides vanish on mouseup. Multi-drag: leader only.
  const alignmentGuides = useMemo<AlignmentGuide[]>(() => {
    if (!editMode) return [];
    if (dragState) {
      const leader = items.find((i) => i.id === dragState.id);
      if (!leader) return [];
      const excludeIds = dragOrigPositions && dragOrigPositions.size > 1
        ? new Set(dragOrigPositions.keys())
        : null;
      return computeAlignmentGuides(leader, items, excludeIds, "drag");
    }
    if (resizeState) {
      const active = items.find((i) => i.id === resizeState.id);
      if (!active) return [];
      return computeAlignmentGuides(active, items, null, "resize");
    }
    return [];
  }, [items, dragState, resizeState, dragOrigPositions, editMode]);

  // ── Grid pattern defs ────────────────────────────────────────────────────────

  const gridCell = PX_PER_M; // 1m in px (at zoom=1)
  const subCell  = PX_PER_M * 0.25;

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full w-full overflow-hidden">

      {/* Toolbar */}
      {editMode && (
        <div
          className="flex items-center gap-1 flex-shrink-0 flex-wrap"
          style={{
            padding: "6px 10px",
            background: "var(--surface)",
            borderBottom: "1px solid var(--line)",
          }}
        >
          <ToolbarBtn
            active={activeTool === "select"}
            onClick={() => { setActiveTool("select"); setPendingType(null); }}
            title="Seleccionar (Esc)"
          >
            <MousePointer2 size={14} /> <span className="text-xs">Seleccionar</span>
          </ToolbarBtn>

          <div style={{ width: 1, height: 18, background: "var(--line)", margin: "0 6px" }} />

          <ToolbarBtn
            active={false}
            onClick={() => undo()}
            title="Deshacer (Ctrl+Z)"
          >
            <span className="text-xs">↩ Deshacer</span>
          </ToolbarBtn>
          <ToolbarBtn
            active={false}
            onClick={() => redo()}
            title="Rehacer (Ctrl+Y)"
          >
            <span className="text-xs">↪ Rehacer</span>
          </ToolbarBtn>

          <div style={{ width: 1, height: 18, background: "var(--line)", margin: "0 6px" }} />

          <ToolbarBtn
            active={false}
            onClick={() => rotateItem(selectedId)}
            disabled={!selectedId}
            title="Rotar (R)"
          >
            <RotateCw size={14} /> <span className="text-xs">Rotar</span>
          </ToolbarBtn>
          <ToolbarBtn
            active={false}
            onClick={() => {
              if (selectedIds.size > 0) {
                setItems((prev) => prev.filter((i) => !selectedIds.has(i.id)));
                setSelectedIds(new Set());
              }
            }}
            disabled={selectedIds.size === 0}
            title={selectedIds.size > 1 ? `Eliminar ${selectedIds.size} seleccionados (Del)` : "Eliminar (Del)"}
            danger
          >
            <Trash2 size={14} />
            <span className="text-xs">
              {selectedIds.size > 1 ? `Eliminar (${selectedIds.size})` : "Eliminar"}
            </span>
          </ToolbarBtn>

          <div style={{ width: 1, height: 18, background: "var(--line)", margin: "0 6px" }} />

          <ToolbarBtn
            active={false}
            onClick={() => {/* auto-saved via store */}}
            title="Guardado automático"
          >
            <Save size={14} /> <span className="text-xs">Guardado ✓</span>
          </ToolbarBtn>

          <div className="ml-auto flex items-center gap-2">
            <span style={{ fontSize: 11, color: "var(--ink-3)" }}>
              {activeTool === "place"
                ? "Hacé clic en el canvas para colocar · Esc para cancelar"
                : selectedIds.size > 1
                ? `${selectedIds.size} elementos seleccionados`
                : "Drag: mover vista · Shift+drag: abarcar área · Shift+clic: multi-sel"}
            </span>
          </div>
        </div>
      )}

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden">

        {/* Sidebar: catalog (edit mode only) */}
        {editMode && (
          <div
            className="flex-shrink-0 overflow-y-auto"
            style={{
              width: 178,
              background: "var(--surface)",
              borderRight: "1px solid var(--line)",
            }}
          >
            <div style={{ padding: "10px 12px 6px", borderBottom: "1px solid var(--line-soft)" }}>
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ink-3)" }}>Catálogo</div>
              <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>Click para colocar</div>
            </div>
            {Array.from(
              CATALOG.reduce((map, def) => {
                if (!map.has(def.category)) map.set(def.category, []);
                map.get(def.category)!.push(def);
                return map;
              }, new Map<string, typeof CATALOG>()),
            ).map(([cat, defs]) => (
              <div key={cat} style={{ borderBottom: "1px solid var(--line-soft)" }}>
                <p style={{ padding: "8px 12px 4px", margin: 0, fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ink-3)" }}>
                  {cat}
                </p>
                {defs.map((def) => {
                  const displayLabel = catalogLabels[def.type] ?? def.label;
                  const isEditingThis = editingCatalogType === def.type;
                  const isActive = pendingType === def.type && activeTool === "place";
                  return (
                    <div
                      key={cat + def.type}
                      className="group relative"
                      style={{
                        background: isActive ? "var(--accent-50)" : "transparent",
                        borderLeft: isActive ? "2px solid var(--accent)" : "2px solid transparent",
                      }}
                    >
                      <button
                        onClick={() => { setActiveTool("place"); setPendingType(def.type); }}
                        style={{
                          width: "100%", textAlign: "left",
                          padding: "6px 12px",
                          display: "flex", alignItems: "center", gap: 8,
                          background: "transparent", border: "none", cursor: "pointer",
                          fontFamily: "inherit",
                        }}
                        onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "var(--surface-2)"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
                      >
                        {/* Glyph box */}
                        <div style={{
                          width: 24, height: 24, borderRadius: "var(--r-sm)",
                          background: isActive ? "var(--accent-100)" : "var(--surface-3)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 12, flexShrink: 0,
                        }}>
                          {def.emoji}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          {isEditingThis ? (
                            <input
                              style={{
                                width: "100%", fontSize: 11.5,
                                border: "1px solid var(--accent)",
                                borderRadius: "var(--r-xs)",
                                padding: "2px 4px",
                                background: "var(--surface)",
                                outline: "none",
                                color: "var(--ink-1)",
                              }}
                              value={editingCatalogVal}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => setEditingCatalogVal(e.target.value)}
                              onBlur={() => {
                                if (editingCatalogVal.trim()) setCatalogLabel(def.type, editingCatalogVal.trim());
                                setEditingCatalogType(null);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") { if (editingCatalogVal.trim()) setCatalogLabel(def.type, editingCatalogVal.trim()); setEditingCatalogType(null); }
                                if (e.key === "Escape") setEditingCatalogType(null);
                                e.stopPropagation();
                              }}
                              autoFocus
                            />
                          ) : (
                            <div style={{ fontSize: 11.5, fontWeight: 500, color: "var(--ink-1)", lineHeight: 1.2 }}>
                              {displayLabel}
                            </div>
                          )}
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--ink-4)", marginTop: 1 }}>
                            {def.w}×{def.h}×{H_DEFAULTS[def.type] ?? '?'}m
                          </div>
                        </div>
                      </button>
                      {/* Rename button */}
                      {!isEditingThis && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingCatalogType(def.type);
                            setEditingCatalogVal(displayLabel);
                          }}
                          className="absolute top-1 right-1 opacity-0 group-hover:opacity-100"
                          style={{
                            padding: 2, borderRadius: 4, border: "none",
                            background: "transparent", cursor: "pointer",
                            color: "var(--ink-4)",
                            transition: "opacity .12s",
                          }}
                          title="Renombrar en catálogo"
                          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--accent)"; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--ink-4)"; }}
                        >
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        {/* SVG Canvas */}
        <div className="flex-1 relative overflow-hidden" style={{ background: "var(--surface-2)" }}>
          <svg
            ref={svgRef}
            width="100%"
            height="100%"
            className="absolute inset-0"
            style={{
              cursor:
                panState      ? "grabbing" :
                spaceDown     ? "grab" :
                activeTool === "place" ? "crosshair" :
                activeTool === "draw"  ? "crosshair" :
                "default",
            }}
            onMouseDown={handleSvgMouseDown}
            onMouseMove={handleSvgMouseMove}
            onMouseUp={handleSvgMouseUp}
            onMouseLeave={handleSvgMouseUp}
            onWheel={handleSvgWheel}
          >
            <defs>
              {/* Sub-grid (0.25m) — warm tones */}
              <pattern
                id="subgrid"
                width={subCell}
                height={subCell}
                patternUnits="userSpaceOnUse"
              >
                <path
                  d={`M ${subCell} 0 L 0 0 0 ${subCell}`}
                  fill="none"
                  stroke="rgba(28,27,22,0.04)"
                  strokeWidth="0.5"
                />
              </pattern>
              {/* Main grid (1m) */}
              <pattern
                id="grid"
                width={gridCell}
                height={gridCell}
                patternUnits="userSpaceOnUse"
              >
                <rect width={gridCell} height={gridCell} fill="url(#subgrid)" />
                <path
                  d={`M ${gridCell} 0 L 0 0 0 ${gridCell}`}
                  fill="none"
                  stroke="rgba(28,27,22,0.09)"
                  strokeWidth="1"
                />
              </pattern>
            </defs>

            {/* Grid background */}
            <rect
              width="100%"
              height="100%"
              fill="url(#grid)"
              transform={`translate(${panOffset.x % gridCell}, ${panOffset.y % gridCell})`}
            />

            {/* Content group */}
            <g transform={`translate(${panOffset.x},${panOffset.y}) scale(${zoom})`}>

              {/* Items */}
              {items.map((item) => {
                const px = item.x * PX_PER_M;
                const py = item.y * PX_PER_M;
                const pw = item.w * PX_PER_M;
                const ph = item.h * PX_PER_M;
                const isSelected = selectedIds.has(item.id);
                const isCollidingDrag = isColliding && dragState?.id === item.id;
                const catDef = CATALOG.find((c) => c.type === item.type);
                const isFilterMatch = matchedIds === null || matchedIds.has(item.id);
                const isDimmed = filterActive && !isFilterMatch;

                return (
                  <g
                    key={item.id}
                    opacity={isDimmed ? 0.15 : 1}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (e.shiftKey) {
                        setSelectedIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(item.id)) next.delete(item.id);
                          else next.add(item.id);
                          return next;
                        });
                      } else {
                        // Double gondola: detect which half was clicked so the
                        // panel opens with that face pre-selected.
                        if (item.type === "gondola_doble") {
                          const pt = svgPoint(e);
                          const steps = rotationSteps(item.rotY);
                          const relX = pt.x - item.x;
                          const relY = pt.y - item.y;
                          let face: "A" | "B";
                          switch (steps) {
                            case 0:  face = relY >= item.h / 2 ? "A" : "B"; break; // stripe south
                            case 1:  face = relX <  item.w / 2 ? "A" : "B"; break; // stripe west
                            case 2:  face = relY <  item.h / 2 ? "A" : "B"; break; // stripe north
                            default: face = relX >= item.w / 2 ? "A" : "B"; break; // stripe east
                          }
                          setPanelFace(face);
                        } else {
                          setPanelFace("A");
                        }
                        setSelectedIds(new Set([item.id]));
                      }
                    }}
                    onMouseDown={(e) => handleItemMouseDown(e, item.id)}
                    onDoubleClick={(e) => editMode && handleItemDblClick(e, item.id)}
                    style={{ cursor: editMode ? "move" : "pointer" }}
                  >
                    {/* Double gondola: two halves colored per face.
                        Face A = half on the front-stripe side (rotY convention below);
                        Face B = opposite half, colored by faceB.status. */}
                    {item.type === "gondola_doble" && isRentable(item) && !isCollidingDrag && (() => {
                      const steps = rotationSteps(item.rotY);
                      const aFill = STATUS_FILL[item.status];
                      const bFill = STATUS_FILL[item.faceB?.status ?? "free"];
                      const noPtr = { style: { pointerEvents: "none" as const } };
                      const dividerStroke = "rgba(28,27,22,0.30)";
                      if (steps === 0 || steps === 2) {
                        // Divider parallel to X — split top/bottom (stripe south → A = bottom)
                        const topFill = steps === 2 ? aFill : bFill;
                        const botFill = steps === 2 ? bFill : aFill;
                        return (
                          <>
                            <rect x={px} y={py} width={pw} height={ph / 2} fill={topFill} rx={3 / zoom} {...noPtr} />
                            <rect x={px} y={py + ph / 2} width={pw} height={ph / 2} fill={botFill} rx={3 / zoom} {...noPtr} />
                            <line x1={px} y1={py + ph / 2} x2={px + pw} y2={py + ph / 2} stroke={dividerStroke} strokeWidth={1 / zoom} {...noPtr} />
                          </>
                        );
                      }
                      // Divider parallel to Y — split left/right (stripe west → A = left)
                      const leftFill  = steps === 1 ? aFill : bFill;
                      const rightFill = steps === 1 ? bFill : aFill;
                      return (
                        <>
                          <rect x={px} y={py} width={pw / 2} height={ph} fill={leftFill} rx={3 / zoom} {...noPtr} />
                          <rect x={px + pw / 2} y={py} width={pw / 2} height={ph} fill={rightFill} rx={3 / zoom} {...noPtr} />
                          <line x1={px + pw / 2} y1={py} x2={px + pw / 2} y2={py + ph} stroke={dividerStroke} strokeWidth={1 / zoom} {...noPtr} />
                        </>
                      );
                    })()}
                    <rect
                      x={px}
                      y={py}
                      width={pw}
                      height={ph}
                      fill={
                        isCollidingDrag
                          ? "rgba(185,28,28,0.18)"
                          : !isRentable(item)
                          ? NON_RENTABLE_FILL
                          : item.type === "gondola_doble"
                          ? "transparent" // halves painted above; keep pointer target
                          : STATUS_FILL[item.status]
                      }
                      stroke={
                        isCollidingDrag
                          ? "var(--danger)"
                          : isSelected
                          ? "var(--accent)"
                          : !isRentable(item)
                          ? NON_RENTABLE_STROKE
                          : STATUS_COLORS[item.status]
                      }
                      strokeWidth={(isSelected || isCollidingDrag ? 2.5 : 1.5) / zoom}
                      strokeDasharray={
                        isCollidingDrag
                          ? `${4 / zoom},${2 / zoom}`
                          : !isRentable(item)
                          // Dashed outline reads as "not part of the sellable
                          // inventory" even in greyscale printouts.
                          ? `${5 / zoom},${3 / zoom}`
                          : undefined
                      }
                      rx={4 / zoom}
                    />

                    {/* Search/filter match highlight — accent outline + soft outer glow */}
                    {filterActive && isFilterMatch && (
                      <>
                        <rect
                          x={px} y={py} width={pw} height={ph}
                          fill="none" stroke="var(--accent)"
                          strokeWidth={6 / zoom} opacity={0.22}
                          rx={4 / zoom}
                          style={{ pointerEvents: "none" }}
                        />
                        <rect
                          x={px} y={py} width={pw} height={ph}
                          fill="none" stroke="var(--accent)"
                          strokeWidth={2.5 / zoom}
                          rx={4 / zoom}
                          style={{ pointerEvents: "none" }}
                        />
                      </>
                    )}

                    {/* Front-face indicator — colored stripe on the accessible/product face.
                        Convention: rotY=0 → south (bottom); rotates clockwise each 90°.
                        Hidden for types where orientation has no customer-facing meaning. */}
                    {item.type !== "metro" && item.type !== "columna" && (() => {
                      const steps = rotationSteps(item.rotY);
                      const sw = Math.max(2.5, 4 / zoom);
                      const inset = sw / 2;
                      const stroke = "rgba(99,102,241,0.85)";
                      const lp = { stroke, strokeWidth: sw, strokeLinecap: "round" as const, style: { pointerEvents: "none" as const } };
                      switch (steps) {
                        case 0: return <line x1={px + inset} y1={py + ph - inset} x2={px + pw - inset} y2={py + ph - inset} {...lp} />;
                        case 1: return <line x1={px + inset} y1={py + inset} x2={px + inset} y2={py + ph - inset} {...lp} />;
                        case 2: return <line x1={px + inset} y1={py + inset} x2={px + pw - inset} y2={py + inset} {...lp} />;
                        case 3: return <line x1={px + pw - inset} y1={py + inset} x2={px + pw - inset} y2={py + ph - inset} {...lp} />;
                        default: return null;
                      }
                    })()}

                    {/* Nomenclatura pill — floats above the rect at constant screen
                        size, with a small leader line down to the top edge.
                        Filter matches always show their pill, Etiquetas toggle aside. */}
                    {(showLabels || (filterActive && isFilterMatch)) && item.nomenclatura && (() => {
                      // Property narrowing doesn't cross the closure — re-default here.
                      const text = item.nomenclatura ?? "";
                      const fs = 10.5 / zoom;
                      const padX = 7 / zoom;
                      const bh = 16 / zoom;
                      const bw = text.length * fs * 0.62 + padX * 2;
                      const leader = 6 / zoom;
                      const cxPx = px + pw / 2;
                      const by = py - leader - bh;
                      return (
                        <g style={{ pointerEvents: "none" }}>
                          <line
                            x1={cxPx} y1={py} x2={cxPx} y2={py - leader}
                            stroke="var(--line-strong)" strokeWidth={1 / zoom}
                          />
                          <rect
                            x={cxPx - bw / 2} y={by} width={bw} height={bh}
                            rx={bh / 2}
                            fill="var(--surface)" stroke="var(--line-strong)" strokeWidth={1 / zoom}
                          />
                          <text
                            x={cxPx} y={by + bh / 2}
                            textAnchor="middle" dominantBaseline="central"
                            fontSize={fs} fontWeight={600} fill="var(--ink-1)"
                            style={{ userSelect: "none" }}
                          >
                            {text}
                          </text>
                        </g>
                      );
                    })()}

                    {/* CHANGE 3: Dimension label during resize */}
                    {resizeState?.id === item.id && (
                      <text
                        x={px + pw / 2}
                        y={py - 6 / zoom}
                        textAnchor="middle"
                        fontSize={10 / zoom}
                        fill="#1e293b"
                        fontWeight="600"
                        style={{ pointerEvents: "none", userSelect: "none" }}
                      >
                        {item.w.toFixed(2)}m × {item.h.toFixed(2)}m
                      </text>
                    )}

                    {/* Labels — progressive disclosure based on on-screen size.
                        pw/ph are SVG coords; multiply by zoom for screen pixels.
                        Emoji: show only when code isn't visible (avoids double clutter).
                        Code: show only when fixture is at least 46 px wide on screen. */}
                    {(() => {
                      const screenW = pw * zoom;
                      const screenH = ph * zoom;
                      const showCode = screenW > 46 && screenH > 12;
                      const showEmoji = !showCode && screenW > 22 && screenH > 16;
                      // Font size: stays ~11 px on screen but capped to 45 % of fixture width
                      const fs = Math.min(11 / zoom, pw * 0.45, ph * 0.7);
                      return (
                        <>
                          {showEmoji && (
                            <text
                              x={px + pw / 2}
                              y={py + ph / 2}
                              textAnchor="middle"
                              dominantBaseline="middle"
                              fontSize={Math.min(10 / zoom, pw * 0.6, ph * 0.7)}
                              style={{ userSelect: "none", pointerEvents: "none" }}
                            >
                              {catDef?.emoji ?? ""}
                            </text>
                          )}
                          {showCode && (
                            editingCodeId === item.id ? (
                              <foreignObject
                                x={px + pw / 2 - 30}
                                y={py + ph / 2 - 10}
                                width={60}
                                height={20}
                              >
                                <input
                                  className="w-full h-full text-center text-xs border border-accent rounded-sm bg-white outline-none px-1"
                                  value={editingCodeVal}
                                  onChange={(e) => setEditingCodeVal(e.target.value)}
                                  onBlur={commitCodeEdit}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") commitCodeEdit();
                                    if (e.key === "Escape") { setEditingCodeId(null); }
                                  }}
                                  autoFocus
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </foreignObject>
                            ) : (
                              <text
                                x={px + pw / 2}
                                y={py + ph / 2}
                                textAnchor="middle"
                                dominantBaseline="middle"
                                fontSize={fs}
                                fill="#1e293b"
                                fontWeight="600"
                                style={{ userSelect: "none", pointerEvents: "none" }}
                              >
                                {item.code}
                              </text>
                            )
                          )}
                        </>
                      );
                    })()}

                    {/* CHANGE 4: Unauthorized placement badge */}
                    {item.status === "occupied" && (
                      !item.supplierName ||
                      !item.endDate ||
                      new Date(item.endDate) < new Date()
                    ) && (
                      <text
                        x={px + pw - 2 / zoom}
                        y={py + 14 / zoom}
                        textAnchor="end"
                        fontSize={12 / zoom}
                        style={{ pointerEvents: "none", userSelect: "none" }}
                      >
                        ⚠️
                      </text>
                    )}

                    {/* Resize handle */}
                    {editMode && isSelected && (
                      <rect
                        x={px + pw - 6 / zoom}
                        y={py + ph - 6 / zoom}
                        width={10 / zoom}
                        height={10 / zoom}
                        fill="var(--accent)"
                        rx={2 / zoom}
                        style={{ cursor: "se-resize" }}
                        onMouseDown={(e) => { e.stopPropagation(); handleResizeStart(e, item.id); }}
                      />
                    )}
                  </g>
                );
              })}

              {/* Smart alignment guides — only while dragging/resizing */}
              {alignmentGuides.length > 0 && (
                <g style={{ pointerEvents: "none" }} opacity={0.9}>
                  {alignmentGuides.map((g, idx) => {
                    const stroke = "#E11D8F";           // smart-guide magenta
                    const sw = 1.25 / zoom;
                    const dash = `${5 / zoom},${3 / zoom}`;
                    const tick = 4 / zoom;              // perpendicular end-tick size
                    const r = 3 / zoom;                 // ⊕ center-marker radius
                    if (g.axis === "v") {
                      const gx = g.pos * PX_PER_M;
                      const gy1 = g.start * PX_PER_M;
                      const gy2 = g.end * PX_PER_M;
                      return (
                        <g key={`guide-v-${idx}`}>
                          <line x1={gx} y1={gy1} x2={gx} y2={gy2} stroke={stroke} strokeWidth={sw} strokeDasharray={dash} />
                          <line x1={gx - tick / 2} y1={gy1} x2={gx + tick / 2} y2={gy1} stroke={stroke} strokeWidth={sw} />
                          <line x1={gx - tick / 2} y1={gy2} x2={gx + tick / 2} y2={gy2} stroke={stroke} strokeWidth={sw} />
                          {g.isCenter && g.centers.map((c, ci) => (
                            <g key={ci}>
                              <circle cx={c.x * PX_PER_M} cy={c.y * PX_PER_M} r={r} fill="none" stroke={stroke} strokeWidth={sw} />
                              <line x1={c.x * PX_PER_M - r} y1={c.y * PX_PER_M} x2={c.x * PX_PER_M + r} y2={c.y * PX_PER_M} stroke={stroke} strokeWidth={sw} />
                            </g>
                          ))}
                        </g>
                      );
                    }
                    const gy = g.pos * PX_PER_M;
                    const gx1 = g.start * PX_PER_M;
                    const gx2 = g.end * PX_PER_M;
                    return (
                      <g key={`guide-h-${idx}`}>
                        <line x1={gx1} y1={gy} x2={gx2} y2={gy} stroke={stroke} strokeWidth={sw} strokeDasharray={dash} />
                        <line x1={gx1} y1={gy - tick / 2} x2={gx1} y2={gy + tick / 2} stroke={stroke} strokeWidth={sw} />
                        <line x1={gx2} y1={gy - tick / 2} x2={gx2} y2={gy + tick / 2} stroke={stroke} strokeWidth={sw} />
                        {g.isCenter && g.centers.map((c, ci) => (
                          <g key={ci}>
                            <circle cx={c.x * PX_PER_M} cy={c.y * PX_PER_M} r={r} fill="none" stroke={stroke} strokeWidth={sw} />
                            <line x1={c.x * PX_PER_M} y1={c.y * PX_PER_M - r} x2={c.x * PX_PER_M} y2={c.y * PX_PER_M + r} stroke={stroke} strokeWidth={sw} />
                          </g>
                        ))}
                      </g>
                    );
                  })}
                </g>
              )}

              {/* Drawing preview rect */}
              {drawing && (() => {
                const rx = Math.min(drawing.x0, drawing.x1) * PX_PER_M;
                const ry = Math.min(drawing.y0, drawing.y1) * PX_PER_M;
                const rw = Math.abs(drawing.x1 - drawing.x0) * PX_PER_M;
                const rh = Math.abs(drawing.y1 - drawing.y0) * PX_PER_M;
                return (
                  <rect
                    x={rx} y={ry} width={rw} height={rh}
                    fill="var(--accent-100)"
                    stroke="var(--accent)"
                    strokeWidth={1.5 / zoom}
                    strokeDasharray={`${4 / zoom},${3 / zoom}`}
                    rx={3 / zoom}
                    style={{ pointerEvents: "none" }}
                  />
                );
              })()}

              {/* Rubber-band selection rect */}
              {selectionRect && (() => {
                const rx = Math.min(selectionRect.x0, selectionRect.x1) * PX_PER_M;
                const ry = Math.min(selectionRect.y0, selectionRect.y1) * PX_PER_M;
                const rw = Math.abs(selectionRect.x1 - selectionRect.x0) * PX_PER_M;
                const rh = Math.abs(selectionRect.y1 - selectionRect.y0) * PX_PER_M;
                if (rw < 2 && rh < 2) return null;
                return (
                  <rect
                    x={rx} y={ry} width={rw} height={rh}
                    fill="rgba(124,58,237,0.08)"
                    stroke="var(--accent)"
                    strokeWidth={1 / zoom}
                    strokeDasharray={`${3 / zoom},${2 / zoom}`}
                    style={{ pointerEvents: "none" }}
                  />
                );
              })()}

              {/* Ghost cursor */}
              {activeTool === "place" && ghostDef && ghostPos && (
                <rect
                  x={(ghostPos.x - ghostDef.w / 2) * PX_PER_M}
                  y={(ghostPos.y - ghostDef.h / 2) * PX_PER_M}
                  width={ghostDef.w * PX_PER_M}
                  height={ghostDef.h * PX_PER_M}
                  fill="var(--accent-100)"
                  stroke="var(--accent)"
                  strokeWidth={1.5 / zoom}
                  strokeDasharray={`${4 / zoom},${3 / zoom}`}
                  rx={4 / zoom}
                  style={{ pointerEvents: "none" }}
                />
              )}

            </g>
          </svg>

          {/* Search + status filter — floating card, top-left over the canvas */}
          <div
            style={{
              position: "absolute", top: 12, left: 12, zIndex: 10,
              maxWidth: "calc(100% - 24px)",
              display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6,
              background: "var(--surface)", border: "1px solid var(--line)",
              borderRadius: "var(--r-lg)", padding: "6px 8px",
              boxShadow: "var(--shadow-md)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
              <Search size={13} style={{ color: "var(--ink-3)", flexShrink: 0 }} />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setSearchQuery("");
                    e.currentTarget.blur();
                    e.stopPropagation();
                  }
                }}
                placeholder="Buscar espacio, categoría o proveedor…"
                style={{
                  width: 230, fontSize: 12, background: "transparent",
                  border: "none", outline: "none", color: "var(--ink-1)",
                  fontFamily: "inherit",
                }}
              />
              {searchQuery.length > 0 && (
                <button
                  onClick={() => setSearchQuery("")}
                  title="Limpiar búsqueda"
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center",
                    padding: 2, borderRadius: 4, border: "none",
                    background: "transparent", cursor: "pointer", color: "var(--ink-4)",
                    flexShrink: 0,
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--ink-1)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--ink-4)"; }}
                >
                  <X size={12} />
                </button>
              )}
              {filterActive && (
                <span style={{ fontSize: 10.5, color: "var(--ink-3)", whiteSpace: "nowrap", flexShrink: 0 }}>
                  {matchedIds?.size ?? 0} de {items.length}
                </span>
              )}
            </div>

            <div style={{ width: 1, height: 16, background: "var(--line)", flexShrink: 0 }} />

            {STATUS_FILTER_CHIPS.map((chip) => {
              const active = statusFilter === chip.value;
              return (
                <button
                  key={chip.value}
                  onClick={() => setStatusFilter(chip.value)}
                  style={{
                    fontSize: 11, fontWeight: 500, fontFamily: "inherit",
                    padding: "2px 9px", borderRadius: 999, cursor: "pointer",
                    border: `1px solid ${active ? chip.color : "var(--line)"}`,
                    background: active ? chip.fill : "transparent",
                    color: active ? chip.color : "var(--ink-3)",
                    transition: "all .12s", whiteSpace: "nowrap",
                  }}
                >
                  {chip.label}
                </button>
              );
            })}
          </div>

          {/* Zoom indicator */}
          <div
            style={{
              position: "absolute", bottom: 14, right: 14,
              display: "flex", alignItems: "center", gap: 2,
              background: "var(--surface)", border: "1px solid var(--line)",
              borderRadius: "var(--r-md)", padding: "2px 4px",
              fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--ink-2)",
              boxShadow: "var(--shadow-sm)",
            }}
          >
            <span style={{ padding: "0 6px" }}>{Math.round(zoom * 100)}%</span>
            <button
              onClick={() => setZoom((z) => Math.min(4, z * 1.2))}
              style={{ padding: "0 4px", background: "none", border: "none", cursor: "pointer", color: "var(--ink-2)" }}
            >+</button>
            <button
              onClick={() => setZoom((z) => Math.max(0.25, z / 1.2))}
              style={{ padding: "0 4px", background: "none", border: "none", cursor: "pointer", color: "var(--ink-2)" }}
            >−</button>
            <button
              onClick={() => { setZoom(1); setPanOffset({ x: 60, y: 60 }); }}
              style={{
                padding: "0 4px", background: "none", border: "none", cursor: "pointer",
                color: "var(--ink-2)", borderLeft: "1px solid var(--line)", paddingLeft: 6,
              }}
              title="Restablecer vista"
            >⌂</button>
            {items.length > 0 && (
              <button
                onClick={() => {
                  const svgEl = svgRef.current;
                  if (!svgEl) return;
                  const rect = svgEl.getBoundingClientRect();
                  const pad = 60;
                  const minX = Math.min(...items.map(i => i.x));
                  const minY = Math.min(...items.map(i => i.y));
                  const maxX = Math.max(...items.map(i => i.x + i.w));
                  const maxY = Math.max(...items.map(i => i.y + i.h));
                  const bbW = (maxX - minX) * PX_PER_M;
                  const bbH = (maxY - minY) * PX_PER_M;
                  const scaleX = (rect.width  - pad * 2) / Math.max(bbW, 1);
                  const scaleY = (rect.height - pad * 2) / Math.max(bbH, 1);
                  const newZoom = Math.min(4, Math.max(0.1, Math.min(scaleX, scaleY)));
                  const newPanX = pad - minX * PX_PER_M * newZoom;
                  const newPanY = pad - minY * PX_PER_M * newZoom;
                  setZoom(newZoom);
                  setPanOffset({ x: newPanX, y: newPanY });
                }}
                style={{
                  padding: "0 4px", background: "none", border: "none", cursor: "pointer",
                  color: "var(--ink-2)", borderLeft: "1px solid var(--line)", paddingLeft: 6,
                }}
                title="Ajustar a todos los fixtures"
              >⊡</button>
            )}
          </div>

          {/* Empty state */}
          {items.length === 0 && (
            <div
              style={{
                position: "absolute", inset: 0,
                display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center",
                textAlign: "center", pointerEvents: "none",
              }}
            >
              <div
                style={{
                  width: 72, height: 72, borderRadius: 16,
                  background: "var(--surface-3)", color: "var(--ink-3)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  marginBottom: 16, fontSize: 32,
                }}
              >
                🏪
              </div>
              <p style={{ fontSize: 14, fontWeight: 600, color: "var(--ink-1)", marginBottom: 4 }}>
                {editMode ? "Catálogo vacío" : "Sin fixtures en el plano"}
              </p>
              <p style={{ fontSize: 12, color: "var(--ink-3)", maxWidth: 280 }}>
                {editMode
                  ? "Elegí un fixture del catálogo para empezar a diseñar el plano."
                  : "Activá el modo edición para agregar elementos."}
              </p>
            </div>
          )}
        </div>

        {/* Right panel — dark drawer */}
        {selectedIds.size > 1 ? (
          <div
            style={{
              width: "clamp(200px, 24vw, 280px)", flexShrink: 0,
              overflowX: "hidden", overflowY: "auto", display: "flex", flexDirection: "column",
              background: "var(--dark-bg)",
              borderLeft: "1px solid var(--dark-line)",
            }}
          >
            <MultiSelectPanel
              count={selectedIds.size}
              editMode={editMode}
              isAdmin={isAdmin}
              onDelete={() => {
                setItems((prev) => prev.filter((i) => !selectedIds.has(i.id)));
                setSelectedIds(new Set());
              }}
              onSetRentable={(rentable) => {
                setItems((prev) =>
                  prev.map((i) =>
                    selectedIds.has(i.id)
                      // Store `undefined` rather than `true` so a rentable
                      // fixture keeps the shape it had before the flag existed.
                      ? { ...i, rentable: rentable ? undefined : false }
                      : i,
                  ),
                );
              }}
              onClose={() => setSelectedIds(new Set())}
            />
          </div>
        ) : selectedItem ? (
          <div
            style={{
              width: "clamp(220px, 26vw, 300px)", flexShrink: 0,
              overflowX: "hidden", overflowY: "auto", display: "flex", flexDirection: "column",
              background: "var(--dark-bg)",
              borderLeft: "1px solid var(--dark-line)",
            }}
          >
            <AssignmentPanel
              item={selectedItem}
              sede={sede}
              sedes={storeSedeList}
              editMode={editMode}
              isAdmin={isAdmin}
              initialFace={panelFace}
              onUpdate={updateSelected}
              onDelete={() => { deleteItem(selectedItem.id); }}
              onDuplicate={() => duplicateSelected(new Set([selectedItem.id]))}
              onClose={() => setSelectedIds(new Set())}
            />
          </div>
        ) : null}
      </div>

      {/* Bottom bar */}
      <div
        className="flex items-center gap-3 flex-shrink-0"
        style={{
          padding: "6px 12px",
          background: "var(--surface)",
          borderTop: "1px solid var(--line)",
          fontSize: 11.5,
          overflow: "hidden",
          minWidth: 0,
        }}
      >
        {isAdmin && (
          <>
            <button
              onClick={() => {
                setEditMode((m) => !m);
                setActiveTool("select");
                setPendingType(null);
                setDragState(null);
                setDragOrigPositions(null);
                setResizeState(null);
                setSelectionRect(null);
                setSelectedIds(new Set());
              }}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                height: 26, padding: "0 10px",
                borderRadius: "var(--r-md)",
                border: "1px solid",
                fontSize: 11.5, fontWeight: 500, cursor: "pointer",
                fontFamily: "inherit",
                background: editMode ? "var(--accent)" : "var(--surface-2)",
                color: editMode ? "#fff" : "var(--ink-2)",
                borderColor: editMode ? "var(--accent)" : "var(--line)",
                transition: "all .12s",
              }}
            >
              {editMode ? <EyeOff size={12} /> : <Eye size={12} />}
              {editMode ? "Vista previa" : "Editar plano"}
            </button>

            <div style={{ width: 1, height: 14, background: "var(--line)" }} />
          </>
        )}
        <span style={{ color: "var(--ink-3)" }}>
          <span style={{ color: "var(--ink-1)", fontWeight: 600 }}>{items.length}</span>{" "}
          fixture{items.length !== 1 ? "s" : ""}
        </span>

        <div style={{ width: 1, height: 14, background: "var(--line)" }} />
        <div className="flex items-center gap-1.5" style={{ color: "var(--ink-3)" }}>
          <span>Sede:</span>
          {editingSedeInline ? (
            <input
              style={{
                borderRadius: "var(--r-xs)", border: "1px solid var(--accent)",
                background: "var(--surface)", padding: "1px 6px",
                fontSize: 11.5, color: "var(--ink-1)", outline: "none", width: 96,
              }}
              value={editingSedeVal}
              onChange={(e) => setEditingSedeVal(e.target.value)}
              onBlur={() => {
                if (editingSedeVal.trim() && editingSedeVal !== sede) { renameSede(sede, editingSedeVal.trim()); setSede(editingSedeVal.trim()); }
                setEditingSedeInline(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") { if (editingSedeVal.trim() && editingSedeVal !== sede) { renameSede(sede, editingSedeVal.trim()); setSede(editingSedeVal.trim()); } setEditingSedeInline(false); }
                if (e.key === "Escape") setEditingSedeInline(false);
              }}
              autoFocus
            />
          ) : (
            <select
              value={sede}
              onChange={(e) => setSede(e.target.value)}
              style={{
                borderRadius: "var(--r-xs)", border: "1px solid var(--line)",
                background: "var(--surface)", padding: "1px 6px",
                fontSize: 11.5, color: "var(--ink-1)", outline: "none", cursor: "pointer",
                fontFamily: "var(--font-mono)", fontWeight: 600,
              }}
            >
              {storeSedeList.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          {/* Rename sede */}
          {!editingSedeInline && (
            <button
              onClick={() => { setEditingSedeInline(true); setEditingSedeVal(sede); }}
              style={{
                padding: 2, borderRadius: 4, border: "none",
                background: "transparent", cursor: "pointer", color: "var(--ink-4)",
              }}
              title="Renombrar sede"
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--accent)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--ink-4)"; }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
          )}
          {/* Add sede */}
          {addingNewSede ? (
            <input
              style={{
                borderRadius: "var(--r-xs)", border: "1px solid var(--success)",
                background: "var(--surface)", padding: "1px 6px",
                fontSize: 11.5, color: "var(--ink-1)", outline: "none", width: 96, marginLeft: 4,
              }}
              placeholder="Nueva sede…"
              value={newSedeVal}
              onChange={(e) => setNewSedeVal(e.target.value)}
              onBlur={() => {
                if (newSedeVal.trim()) { addSede(newSedeVal.trim()); setSede(newSedeVal.trim()); }
                setAddingNewSede(false); setNewSedeVal("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") { if (newSedeVal.trim()) { addSede(newSedeVal.trim()); setSede(newSedeVal.trim()); } setAddingNewSede(false); setNewSedeVal(""); }
                if (e.key === "Escape") { setAddingNewSede(false); setNewSedeVal(""); }
              }}
              autoFocus
            />
          ) : (
            <button
              onClick={() => setAddingNewSede(true)}
              style={{
                padding: 2, borderRadius: 4, border: "none",
                background: "transparent", cursor: "pointer", color: "var(--ink-4)",
              }}
              title="Agregar nueva sede"
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--success)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--ink-4)"; }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
          )}
        </div>

        <div style={{ width: 1, height: 14, background: "var(--line)" }} />
        <button
          onClick={() => setShowLabels((v) => !v)}
          title={showLabels ? "Ocultar etiquetas de nomenclatura" : "Mostrar etiquetas de nomenclatura"}
          style={{
            display: "flex", alignItems: "center", gap: 4,
            padding: "2px 8px", borderRadius: "var(--r-md)",
            border: "1px solid var(--line)", fontSize: 11.5, fontWeight: 500,
            cursor: "pointer", fontFamily: "inherit",
            background: showLabels ? "var(--accent-50)" : "var(--surface-2)",
            color: showLabels ? "var(--accent-700)" : "var(--ink-3)",
            transition: "all .12s",
          }}
        >
          {showLabels ? <Eye size={12} /> : <EyeOff size={12} />} Etiquetas
        </button>

        {isAdmin && <SyncButton />}

        <div style={{
          marginLeft: "auto", fontSize: 10.5, color: "var(--ink-3)",
          overflow: "hidden", minWidth: 0, whiteSpace: "nowrap", textOverflow: "ellipsis",
          flexShrink: 1,
        }}>
          {editMode
            ? "Rueda: zoom · Espacio+drag: mover · Shift+clic: multi-sel · Ctrl+A: todos · R: rotar · Del: eliminar"
            : "Clic en fixture para ver detalles"}
        </div>
      </div>
    </div>
  );
}

// ─── Sync Button ─────────────────────────────────────────────────────────────

function SyncButton() {
  // Two-way on purpose. The old version only PUT the active sede and always
  // ended up showing "✓ Sincronizado", even when the request failed or when
  // another workstation held newer data this tab had never downloaded.
  const syncState = useFixtureStore((s) => s.syncState);
  const hasPending = useFixtureStore(selectHasPendingWork);
  const lastSyncedAt = useFixtureStore((s) => s.lastSyncedAt);
  const conflictCount = useFixtureStore((s) => Object.keys(s.conflicts).length);
  const isAdmin = useAuthStore(selectIsAdmin);

  const busy = syncState === "pulling" || syncState === "pushing";

  const handleSync = async () => {
    if (busy) return;
    const store = useFixtureStore.getState();
    if (isAdmin) await store.flushPending();
    await store.syncFromServer();
  };

  const label =
    conflictCount > 0 ? "⚠ Conflicto"
    : syncState === "pushing" ? "Subiendo…"
    : syncState === "pulling" ? "Actualizando…"
    : syncState === "error" ? "Sin conexión"
    : hasPending ? "↑ Cambios sin subir"
    : "✓ Sincronizado";

  const color =
    conflictCount > 0 ? "var(--warning)"
    : syncState === "error" ? "#ef4444"
    : !hasPending && syncState === "idle" ? "var(--success)"
    : "var(--ink-2)";

  return (
    <button
      onClick={handleSync}
      disabled={busy}
      title={
        lastSyncedAt
          ? `Última sincronización ${new Date(lastSyncedAt).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })}`
          : "Sincronizar con el servidor"
      }
      style={{
        display: "flex", alignItems: "center", gap: 4,
        padding: "2px 8px", borderRadius: "var(--r-md)",
        border: "1px solid var(--line)", fontSize: 11.5, fontWeight: 500,
        cursor: busy ? "wait" : "pointer",
        fontFamily: "inherit",
        background: "var(--surface-2)",
        color,
        transition: "all .15s",
      }}
    >
      {label}
    </button>
  );
}

// ─── Multi-select Panel ───────────────────────────────────────────────────────

function MultiSelectPanel({
  count,
  editMode,
  isAdmin,
  onDelete,
  onSetRentable,
  onClose,
}: {
  count: number;
  editMode: boolean;
  isAdmin: boolean;
  onDelete: () => void;
  onSetRentable: (rentable: boolean) => void;
  onClose: () => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", color: "var(--dark-ink-1)", minHeight: "100%" }}>
      <div style={{ padding: "16px 16px 12px", borderBottom: "1px solid var(--dark-line)", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <p style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--dark-ink-3)", marginBottom: 2 }}>SELECCIÓN MÚLTIPLE</p>
          <p style={{ fontSize: 14, fontWeight: 600, color: "var(--dark-ink-1)" }}>{count} elementos</p>
        </div>
        <button onClick={onClose} style={{ color: "var(--dark-ink-3)", fontSize: 18, lineHeight: 1, marginTop: 2, background: "none", border: "none", cursor: "pointer" }}>×</button>
      </div>
      <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: 12 }}>
        {editMode && isAdmin && (
          <div>
            <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--dark-ink-3)", marginBottom: 6 }}>
              Destino de los {count}
            </p>
            <div style={{ display: "flex", gap: 6 }}>
              {([true, false] as const).map((value) => (
                <button
                  key={String(value)}
                  onClick={() => onSetRentable(value)}
                  style={{
                    flex: 1, padding: "7px 4px", borderRadius: "var(--r-sm)",
                    fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                    border: "1px solid var(--dark-line-2)",
                    background: "transparent",
                    color: "var(--dark-ink-2)",
                  }}
                >
                  {value ? "Comercializable" : "No comercial."}
                </button>
              ))}
            </div>
          </div>
        )}

        {editMode && (
          <button
            onClick={onDelete}
            style={{
              width: "100%", borderRadius: "var(--r-sm)", padding: "8px 0",
              fontSize: 12, fontWeight: 500, cursor: "pointer", transition: "background .12s",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              background: "rgba(185,28,28,0.12)", border: "1px solid rgba(185,28,28,0.3)", color: "var(--danger)",
            }}
          >
            <Trash2 size={13} /> Eliminar {count} elementos
          </button>
        )}
        <div style={{ fontSize: 11, color: "var(--dark-ink-3)", display: "flex", flexDirection: "column", gap: 4 }}>
          <p>· <kbd style={{ fontFamily: "var(--font-mono)", background: "var(--dark-surface-2)", padding: "0 4px", borderRadius: "var(--r-xs)" }}>Shift+clic</kbd> agrega o quita del grupo</p>
          <p>· <kbd style={{ fontFamily: "var(--font-mono)", background: "var(--dark-surface-2)", padding: "0 4px", borderRadius: "var(--r-xs)" }}>Del</kbd> elimina todos</p>
          <p>· <kbd style={{ fontFamily: "var(--font-mono)", background: "var(--dark-surface-2)", padding: "0 4px", borderRadius: "var(--r-xs)" }}>Esc</kbd> deselecciona</p>
          <p>· Arrastrá cualquiera para mover todo el grupo</p>
        </div>
      </div>
    </div>
  );
}

// ─── Assignment Panel (dark, unified edit + view) ─────────────────────────────

const STATUS_BADGE_STYLE: Record<SpaceStatus, React.CSSProperties> = {
  free:        { background: "rgba(21,128,61,0.15)",   color: "var(--success)",      border: "1px solid rgba(21,128,61,0.35)" },
  occupied:    { background: "rgba(185,28,28,0.15)",   color: "var(--danger)",       border: "1px solid rgba(185,28,28,0.35)" },
  reserved:    { background: "rgba(180,83,9,0.15)",    color: "var(--warning)",      border: "1px solid rgba(180,83,9,0.35)" },
  maintenance: { background: "rgba(148,145,127,0.12)", color: "var(--muted-status)", border: "1px solid rgba(148,145,127,0.3)" },
};

function Field({ label, icon, children }: { label: string; icon?: string; children: React.ReactNode }) {
  return (
    <div style={{ borderBottom: "1px solid var(--dark-line)", padding: "10px 16px" }}>
      <p style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--dark-ink-3)", marginBottom: 6, display: "flex", alignItems: "center", gap: 4 }}>
        {icon && <span>{icon}</span>}{label}
      </p>
      {children}
    </div>
  );
}

// ─── Days-left strip (contract dates emphasis) ────────────────────────────────

function DaysLeftStrip({ startDate, endDate }: { startDate: string; endDate: string }) {
  const MS_PER_DAY = 86_400_000;
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const totalDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / MS_PER_DAY));
  const elapsedDays = Math.min(totalDays, Math.max(0, Math.round((today.getTime() - start.getTime()) / MS_PER_DAY)));
  const daysLeft = Math.round((end.getTime() - today.getTime()) / MS_PER_DAY);
  const pct = Math.min(100, Math.max(0, (elapsedDays / totalDays) * 100));
  const expired = daysLeft < 0;
  const critical = expired || daysLeft <= 7;
  const color = critical ? "var(--danger)" : daysLeft <= 30 ? "var(--warning)" : "var(--success)";
  // Same visual language as the status badges
  const badge = critical
    ? STATUS_BADGE_STYLE.occupied
    : daysLeft <= 30
    ? STATUS_BADGE_STYLE.reserved
    : STATUS_BADGE_STYLE.free;
  const label = expired
    ? `Vencido hace ${Math.abs(daysLeft)} día${Math.abs(daysLeft) === 1 ? "" : "s"}`
    : `${daysLeft} día${daysLeft === 1 ? "" : "s"} restantes`;
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ height: 4, borderRadius: 999, background: "var(--dark-surface-2)", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 999, transition: "width .2s" }} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
        {daysLeft <= 30 && (
          <span className="animate-pulse" style={{ width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0 }} />
        )}
        <span style={{ ...badge, display: "inline-flex", alignItems: "center", borderRadius: 999, padding: "1px 8px", fontSize: 10.5, fontWeight: 600 }}>
          {label}
        </span>
      </div>
    </div>
  );
}

// ─── Files section (contract documents per space) ─────────────────────────────

const ALLOWED_FILE_EXTS = [".pdf", ".xls", ".xlsx", ".csv", ".jpg", ".jpeg", ".png", ".webp"];

function FilesSection({
  code, name, zone, sedeName, areaM2, isAdmin, editMode,
}: {
  code: string;
  name: string;
  zone: string;
  sedeName: string;
  areaM2: number;
  isAdmin: boolean;
  editMode: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [files, setFiles] = useState<SpaceFileMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  // Space id resolved lazily on first expand/upload — ref so callbacks stay stable
  const spaceIdRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const resolveSpaceId = useCallback(async (): Promise<number | null> => {
    if (spaceIdRef.current != null) return spaceIdRef.current;
    try {
      if (isAdmin) {
        const space = await findOrCreateSpace({ code, name, zone, sede: sedeName, area_m2: areaM2 });
        spaceIdRef.current = space.id;
      } else {
        // Workers cannot create spaces — only resolve existing ones by code.
        const r = await client.get<{ id: number }>(`/spaces/by-code/${encodeURIComponent(code)}`);
        spaceIdRef.current = r.data.id;
      }
      return spaceIdRef.current;
    } catch {
      return null;
    }
  }, [isAdmin, code, name, zone, sedeName, areaM2]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    const id = await resolveSpaceId();
    if (id == null) {
      setFiles([]);
      setLoading(false);
      return;
    }
    try {
      setFiles(await listSpaceFiles(id));
    } catch {
      setError("No se pudieron cargar los archivos");
    } finally {
      setLoading(false);
    }
  }, [resolveSpaceId]);

  useEffect(() => {
    if (expanded) void refresh();
  }, [expanded, refresh]);

  async function handleUpload(file: File) {
    const dot = file.name.lastIndexOf(".");
    const ext = dot >= 0 ? file.name.slice(dot).toLowerCase() : "";
    if (!ALLOWED_FILE_EXTS.includes(ext)) {
      setError("Formato no permitido (.pdf, .xls, .xlsx, .csv, .jpg, .jpeg, .png, .webp)");
      return;
    }
    setUploading(true);
    setError("");
    try {
      const id = await resolveSpaceId();
      if (id == null) throw new Error("space unresolved");
      await uploadSpaceFile(id, file);
      setFiles(await listSpaceFiles(id));
    } catch {
      setError("Error al subir el archivo");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(fileId: number) {
    try {
      await deleteSpaceFile(fileId);
      setFiles((prev) => prev.filter((f) => f.id !== fileId));
    } catch {
      setError("No se pudo eliminar el archivo");
    }
  }

  return (
    <div
      style={{ borderBottom: "1px solid var(--dark-line)" }}
      onDragOver={isAdmin ? (e) => e.preventDefault() : undefined}
      onDrop={isAdmin ? (e) => {
        e.preventDefault();
        if (!expanded) setExpanded(true);
        const file = e.dataTransfer.files?.[0];
        if (file) void handleUpload(file);
      } : undefined}
    >
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{
          width: "100%", textAlign: "left", padding: "10px 16px",
          background: "none", border: "none", cursor: "pointer", fontFamily: "inherit",
          fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em",
          color: "var(--dark-ink-3)", display: "flex", alignItems: "center", gap: 4,
        }}
      >
        <span>📎</span>Archivos
        <span style={{ marginLeft: "auto", fontSize: 11 }}>{expanded ? "▾" : "▸"}</span>
      </button>
      {expanded && (
        <div style={{ padding: "0 16px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
          {loading ? (
            <p style={{ fontSize: 11, color: "var(--dark-ink-3)" }}>Cargando…</p>
          ) : files.length === 0 ? (
            <p style={{ fontSize: 11, color: "var(--dark-ink-3)" }}>Sin archivos adjuntos</p>
          ) : (
            files.map((f) => (
              <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                <button
                  onClick={() => window.open(fileUrl(f.id), "_blank")}
                  title={f.filename}
                  style={{
                    flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 6,
                    background: "none", border: "none", cursor: "pointer", padding: 0,
                    fontFamily: "inherit", textAlign: "left",
                  }}
                >
                  <span style={{ fontSize: 12, flexShrink: 0 }}>📄</span>
                  <span style={{ fontSize: 12, color: "var(--dark-ink-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {f.filename}
                  </span>
                  <span style={{ fontSize: 10, color: "var(--dark-ink-3)", flexShrink: 0, fontFamily: "var(--font-mono)" }}>
                    {Math.max(1, Math.round(f.size / 1024))} KB
                  </span>
                </button>
                {isAdmin && editMode && (
                  <button
                    onClick={() => void handleDelete(f.id)}
                    title="Eliminar archivo"
                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--danger)", fontSize: 12, padding: "0 2px", flexShrink: 0 }}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))
          )}
          {error && <p style={{ fontSize: 10, color: "var(--danger)" }}>{error}</p>}
          {isAdmin && (
            <>
              <input
                ref={inputRef}
                type="file"
                accept=".pdf,.xls,.xlsx,.csv,.jpg,.jpeg,.png,.webp"
                style={{ display: "none" }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleUpload(file);
                  e.target.value = "";
                }}
              />
              <button
                onClick={() => inputRef.current?.click()}
                disabled={uploading}
                style={{
                  marginTop: 2, borderRadius: "var(--r-sm)", border: "1px dashed var(--dark-line-2)",
                  background: "transparent", color: uploading ? "var(--dark-ink-3)" : "var(--dark-ink-2)",
                  padding: "6px 0", fontSize: 11.5, fontWeight: 500,
                  cursor: uploading ? "wait" : "pointer", fontFamily: "inherit",
                }}
              >
                {uploading ? "Subiendo…" : "＋ Subir archivo"}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Empty defaults used when face B is edited for the first time. */
const EMPTY_FACE: FaceData = {
  supplierName: "",
  brandCategory: "",
  negotiatedValue: 0,
  startDate: "",
  endDate: "",
  observation: "",
  status: "free",
};

function AssignmentPanel({
  item, sede, sedes, editMode, isAdmin, initialFace, onUpdate, onDelete, onDuplicate, onClose,
}: {
  item: PlacedItem2D;
  sede: string;
  sedes: string[];
  editMode: boolean;
  isAdmin: boolean;
  initialFace?: "A" | "B";
  onUpdate: (patch: Partial<PlacedItem2D>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onClose: () => void;
}) {
  const catDef = CATALOG.find((c) => c.type === item.type);
  const fullCode = `${item.sede || sede}-${item.code}`;
  const inp = "w-full bg-transparent border-b border-dark-line-2 text-dark-ink-1 text-sm py-1 focus:outline-none focus:border-accent placeholder:text-dark-ink-3";
  const sel = "w-full bg-dark-surface-2 border border-dark-line-2 text-dark-ink-1 text-sm rounded px-2 py-1.5 focus:outline-none focus:border-accent";

  // ── Faces (gondola doble) ─────────────────────────────────────────────────
  // Face A maps to the item's top-level commercial fields; face B lives in
  // item.faceB. Backend space code for face B is fullCode + "-B".
  const isDouble = item.type === "gondola_doble";
  // Infrastructure fixtures hold no contract, so the whole commercial half of
  // this panel collapses for them.
  const rentable = isRentable(item);
  const [activeFace, setActiveFace] = useState<"A" | "B">(isDouble ? (initialFace ?? "A") : "A");
  useEffect(() => {
    setActiveFace(isDouble ? (initialFace ?? "A") : "A");
  }, [item.id, initialFace, isDouble]);

  const face: FaceData = activeFace === "B"
    ? (item.faceB ?? EMPTY_FACE)
    : {
        supplierName: item.supplierName,
        brandCategory: item.brandCategory,
        negotiatedValue: item.negotiatedValue,
        startDate: item.startDate,
        endDate: item.endDate,
        observation: item.observation,
        status: item.status,
      };
  const activeCode = activeFace === "B" ? `${fullCode}-B` : fullCode;

  function updateFace(patch: Partial<FaceData>) {
    if (activeFace === "B") {
      onUpdate({ faceB: { ...(item.faceB ?? EMPTY_FACE), ...patch } });
    } else {
      onUpdate(patch as Partial<PlacedItem2D>);
    }
  }

  // ── Contract persistence ──────────────────────────────────────────────────
  const [saveState, setSaveState] = useState<"idle" | "saving" | "ok" | "error">("idle");
  const [saveError, setSaveError] = useState("");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); }, []);

  const canSave =
    face.supplierName.trim().length > 0 &&
    face.startDate.length > 0 &&
    face.endDate.length > 0 &&
    (face.negotiatedValue ?? 0) > 0;

  async function handleSaveContract() {
    if (!canSave) return;
    setSaveState("saving");
    setSaveError("");
    try {
      const space = await findOrCreateSpace({
        code: activeCode,
        name: catDef?.label ?? item.code,
        zone: item.type,
        sede: item.sede || sede,
        area_m2: parseFloat((item.w * item.h).toFixed(2)),
      });
      const supplier = await findOrCreateSupplier(face.supplierName.trim());
      await createLease(space.id, {
        supplier_id: supplier.id,
        marca: face.brandCategory || undefined,
        start_date: face.startDate,
        end_date: face.endDate,
        monthly_rent: face.negotiatedValue,
        notes: face.observation || undefined,
      });
      updateFace({ status: "occupied" });
      setSaveState("ok");
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => setSaveState("idle"), 3500);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        "Error al guardar el contrato";
      setSaveError(msg);
      setSaveState("error");
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => setSaveState("idle"), 5000);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", color: "var(--dark-ink-1)", minHeight: "100%" }}>

      {/* Header */}
      <div style={{ padding: "16px 16px 12px", borderBottom: "1px solid var(--dark-line)", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <p style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--dark-ink-3)", marginBottom: 2 }}>{activeCode}</p>
          <p style={{ fontSize: 14, fontWeight: 600, color: "var(--dark-ink-1)" }}>
            {catDef?.emoji} {catDef?.label}
          </p>
        </div>
        <button onClick={onClose} style={{ color: "var(--dark-ink-3)", fontSize: 18, lineHeight: 1, marginTop: 2, background: "none", border: "none", cursor: "pointer" }}>×</button>
      </div>

      {/* Face tabs (gondola doble) */}
      {isDouble && rentable && (
        <div style={{ display: "flex", borderBottom: "1px solid var(--dark-line)" }}>
          {(["A", "B"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setActiveFace(f)}
              style={{
                flex: 1, padding: "9px 0", fontSize: 12, fontWeight: 600,
                background: "none", border: "none", cursor: "pointer",
                fontFamily: "inherit",
                color: activeFace === f ? "var(--accent)" : "var(--dark-ink-3)",
                borderBottom: activeFace === f ? "2px solid var(--accent)" : "2px solid transparent",
                transition: "color .12s, border-color .12s",
              }}
            >
              Cara {f}
            </button>
          ))}
        </div>
      )}

      {/* Status badge */}
      <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--dark-line)" }}>
        <span style={{
          ...(rentable ? STATUS_BADGE_STYLE[face.status] : NON_RENTABLE_BADGE_STYLE),
          display: "inline-flex", alignItems: "center", borderRadius: 999,
          padding: "2px 10px", fontSize: 11, fontWeight: 600,
        }}>
          {rentable ? STATUS_LABELS[face.status] : NON_RENTABLE_LABEL}
        </span>
      </div>

      {/* Destino del mueble — decides whether it can ever hold a contract */}
      <Field label="Destino del mueble" icon="🎯">
        {editMode && isAdmin ? (
          <div style={{ display: "flex", gap: 6 }}>
            {([true, false] as const).map((value) => (
              <button
                key={String(value)}
                onClick={() => onUpdate({ rentable: value })}
                style={{
                  flex: 1, padding: "7px 4px", borderRadius: "var(--r-sm)",
                  fontSize: 11.5, fontWeight: 600, cursor: "pointer",
                  fontFamily: "inherit", transition: "background .12s, border-color .12s",
                  border: rentable === value
                    ? "1px solid var(--accent)"
                    : "1px solid var(--dark-line-2)",
                  background: rentable === value ? "var(--accent)" : "transparent",
                  color: rentable === value ? "var(--accent-ink)" : "var(--dark-ink-3)",
                }}
              >
                {value ? "Comercializable" : "No comercializable"}
              </button>
            ))}
          </div>
        ) : (
          <p style={{ fontSize: 14, color: "var(--dark-ink-1)" }}>
            {rentable ? "Comercializable" : "No comercializable"}
          </p>
        )}
        <p style={{ marginTop: 6, fontSize: 10, color: "var(--dark-ink-3)", lineHeight: 1.45 }}>
          {rentable
            ? "Se puede alquilar y cuenta en la disponibilidad de la sede."
            : "Mobiliario propio del local: no admite contrato y queda fuera de la ocupación."}
        </p>
      </Field>

      {/* Estado */}
      {rentable && (
      <Field label="Estado del espacio" icon="◉">
        {editMode ? (
          <select className={sel} value={face.status}
            onChange={(e) => updateFace({ status: e.target.value as SpaceStatus })}>
            <option value="free">Disponible</option>
            <option value="occupied">Ocupado</option>
            <option value="reserved">Reservado</option>
            <option value="maintenance">Mantenimiento</option>
          </select>
        ) : (
          <p style={{ fontSize: 14, color: "var(--dark-ink-1)" }}>{STATUS_LABELS[face.status]}</p>
        )}
      </Field>
      )}

      {/* Sede */}
      <Field label="Sede" icon="🏢">
        {editMode ? (
          <select className={sel} value={item.sede || sede}
            onChange={(e) => onUpdate({ sede: e.target.value })}>
            {sedes.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        ) : (
          <p style={{ fontSize: 14, color: "var(--dark-ink-1)" }}>{item.sede || sede}</p>
        )}
      </Field>

      {/* Nomenclatura (per fixture, rendered as a pill on the plan) */}
      <Field label="Nomenclatura" icon="🔖">
        {editMode ? (
          <input className={inp} placeholder="ej: FRU-01 · visible en el plano"
            value={item.nomenclatura ?? ""}
            onChange={(e) => onUpdate({ nomenclatura: e.target.value })} />
        ) : (
          <p style={{ fontSize: 14, color: "var(--dark-ink-1)" }}>{item.nomenclatura || <span style={{ color: "var(--dark-ink-3)" }}>—</span>}</p>
        )}
      </Field>

      {/* Proveedor */}
      {rentable && (
      <Field label="Proveedor" icon="🏭">
        {editMode ? (
          <input className={inp} placeholder="Nombre del proveedor"
            value={face.supplierName}
            onChange={(e) => updateFace({ supplierName: e.target.value })} />
        ) : (
          <p style={{ fontSize: 14, color: "var(--dark-ink-1)" }}>{face.supplierName || <span style={{ color: "var(--dark-ink-3)" }}>—</span>}</p>
        )}
      </Field>
      )}

      {/* Categoría */}
      {rentable && (
      <Field label="Categoría" icon="🏷️">
        {editMode ? (
          <input className={inp} placeholder="Marca / rubro"
            value={face.brandCategory}
            onChange={(e) => updateFace({ brandCategory: e.target.value })} />
        ) : (
          <p style={{ fontSize: 14, color: "var(--dark-ink-1)" }}>{face.brandCategory || <span style={{ color: "var(--dark-ink-3)" }}>—</span>}</p>
        )}
      </Field>
      )}

      {/* Valor — hidden entirely for workers */}
      {isAdmin && rentable && (
        <Field label="$ Valor (COP/mes)" icon="">
          {editMode ? (
            <input type="number" className={inp} placeholder="0"
              value={face.negotiatedValue || ""}
              onChange={(e) => updateFace({ negotiatedValue: parseFloat(e.target.value) || 0 })} />
          ) : (
            <p style={{ fontSize: 14, color: "var(--dark-ink-1)" }}>
              {face.negotiatedValue ? `$${face.negotiatedValue.toLocaleString()}` : <span style={{ color: "var(--dark-ink-3)" }}>—</span>}
            </p>
          )}
        </Field>
      )}

      {/* Fechas */}
      {rentable && (
      <Field label="Periodo" icon="📅">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <p style={{ fontSize: 10, color: "var(--dark-ink-3)", marginBottom: 4 }}>INICIO</p>
            {editMode ? (
              <input type="date" className={inp}
                value={face.startDate}
                onChange={(e) => updateFace({ startDate: e.target.value })} />
            ) : (
              <p style={{ fontSize: 14, color: "var(--dark-ink-1)" }}>{face.startDate || <span style={{ color: "var(--dark-ink-3)" }}>—</span>}</p>
            )}
          </div>
          <div>
            <p style={{ fontSize: 10, color: "var(--dark-ink-3)", marginBottom: 4 }}>FIN</p>
            {editMode ? (
              <input type="date" className={inp}
                value={face.endDate}
                onChange={(e) => updateFace({ endDate: e.target.value })} />
            ) : (
              <p style={{ fontSize: 14, color: "var(--dark-ink-1)" }}>{face.endDate || <span style={{ color: "var(--dark-ink-3)" }}>—</span>}</p>
            )}
          </div>
        </div>
        {face.startDate && face.endDate && (
          <DaysLeftStrip startDate={face.startDate} endDate={face.endDate} />
        )}
      </Field>
      )}

      {/* Dimensiones */}
      {editMode && (
        <Field label="Dimensiones" icon="📐">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <p style={{ fontSize: 10, color: "var(--dark-ink-3)", marginBottom: 4 }}>ANCHO (m)</p>
              <input type="number" className={inp} step={0.05} min={0.25}
                value={item.w}
                onChange={(e) => onUpdate({ w: parseFloat(e.target.value) || 0.25 })} />
            </div>
            <div>
              <p style={{ fontSize: 10, color: "var(--dark-ink-3)", marginBottom: 4 }}>PROF. (m)</p>
              <input type="number" className={inp} step={0.05} min={0.25}
                value={item.h}
                onChange={(e) => onUpdate({ h: parseFloat(e.target.value) || 0.25 })} />
            </div>
          </div>
        </Field>
      )}

      {/* Observación */}
      <Field label="Observación" icon="📝">
        {editMode ? (
          <textarea rows={2} className={`${inp} resize-none`}
            style={{ border: "1px solid var(--dark-line-2)", borderRadius: "var(--r-sm)", padding: "4px 8px" }}
            placeholder="Notas adicionales"
            value={face.observation}
            onChange={(e) => updateFace({ observation: e.target.value })} />
        ) : (
          <p style={{ fontSize: 14, color: "var(--dark-ink-1)" }}>{face.observation || <span style={{ color: "var(--dark-ink-3)" }}>—</span>}</p>
        )}
      </Field>

      {/* Archivos — keyed by active face code so state resets on face switch */}
      {rentable && (
      <FilesSection
        key={activeCode}
        code={activeCode}
        name={catDef?.label ?? item.code}
        zone={item.type}
        sedeName={item.sede || sede}
        areaM2={parseFloat((item.w * item.h).toFixed(2))}
        isAdmin={isAdmin}
        editMode={editMode}
      />
      )}

      {/* Save contract (admin only — mutations are admin-gated) */}
      {isAdmin && rentable && (
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--dark-line)" }}>
        <button
          onClick={handleSaveContract}
          disabled={!canSave || saveState === "saving"}
          style={{
            width: "100%", borderRadius: "var(--r-sm)", padding: "8px 0",
            fontSize: 12, fontWeight: 600, cursor: !canSave ? "not-allowed" : saveState === "saving" ? "wait" : "pointer",
            transition: "background .12s", border: "none",
            ...(
              !canSave
                ? { background: "var(--dark-surface-2)", color: "var(--dark-ink-3)" }
                : saveState === "ok"
                ? { background: "rgba(21,128,61,0.25)", color: "var(--success)" }
                : saveState === "error"
                ? { background: "rgba(185,28,28,0.2)", color: "var(--danger)" }
                : saveState === "saving"
                ? { background: "var(--accent)", color: "var(--accent-ink)", opacity: 0.7 }
                : { background: "var(--accent)", color: "var(--accent-ink)" }
            ),
          }}
        >
          {saveState === "saving"
            ? "Guardando…"
            : saveState === "ok"
            ? "✓ Contrato guardado"
            : saveState === "error"
            ? "Error — reintentar"
            : "Guardar contrato"}
        </button>
        {saveState === "error" && (
          <p style={{ marginTop: 4, fontSize: 10, color: "var(--danger)" }}>{saveError}</p>
        )}
        {!canSave && saveState === "idle" && (
          <p style={{ marginTop: 4, fontSize: 10, color: "var(--dark-ink-3)" }}>
            Requiere proveedor, fechas y valor &gt; 0.
          </p>
        )}
      </div>
      )}

      {/* Code chip */}
      <div style={{ padding: "12px 16px", marginTop: "auto" }}>
        <span style={{ display: "inline-block", borderRadius: "var(--r-sm)", background: "var(--dark-surface-2)", padding: "4px 10px", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--dark-ink-2)" }}>
          {activeCode}
        </span>
      </div>

      {/* Actions (admin edit mode only) */}
      {editMode && isAdmin && (
        <div style={{ padding: "0 16px 16px", display: "flex", gap: 8 }}>
          <button onClick={onDuplicate}
            style={{ flex: 1, borderRadius: "var(--r-sm)", border: "1px solid var(--dark-line-2)", padding: "6px 0", fontSize: 12, fontWeight: 500, color: "var(--dark-ink-2)", background: "transparent", cursor: "pointer", transition: "background .12s" }}>
            Duplicar
          </button>
          <button onClick={onDelete}
            style={{ flex: 1, borderRadius: "var(--r-sm)", border: "1px solid rgba(185,28,28,0.35)", background: "rgba(185,28,28,0.12)", padding: "6px 0", fontSize: 12, fontWeight: 500, color: "var(--danger)", cursor: "pointer", transition: "background .12s" }}>
            Eliminar
          </button>
        </div>
      )}
    </div>
  );
}


// ─── Toolbar Button ───────────────────────────────────────────────────────────

function ToolbarBtn({
  children,
  active,
  onClick,
  disabled,
  title,
  danger,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
        active
          ? "bg-accent-50 text-accent-700 ring-1 ring-accent-200"
          : danger
          ? "text-danger hover:bg-danger-50"
          : "text-ink-2 hover:bg-surface-3"
      }`}
    >
      {children}
    </button>
  );
}

// (no localStorage loader — state is initialized from the unified Zustand store)
