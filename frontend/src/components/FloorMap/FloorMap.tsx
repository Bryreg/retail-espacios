import { useRef, useState, useEffect } from "react";
import { ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import type { ZoneDef, SpaceMapItem } from "../../types";
import { ZONES, IMG_W, IMG_H, STATUS_COLORS, STATUS_COLORS_SOLID } from "./zones";

// ─── Types ───────────────────────────────────────────────────────────────────

type HandleId = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
type Point = { x: number; y: number };

type DragState =
  | { kind: "move"; zoneId: string; startSvg: Point; startZone: ZoneDef }
  | { kind: "resize"; zoneId: string; handle: HandleId; startSvg: Point; startZone: ZoneDef }
  | { kind: "create"; startSvg: Point; currentSvg: Point }
  | null;

interface HandleDef {
  id: HandleId;
  cx: number;
  cy: number;
  cursor: string;
}

export interface SplitConfig {
  zoneId: string;
  vCuts: number;
  hCuts: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const HANDLE_SIZE = 10;
const MIN_SIZE = 12;
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 5;
const ZOOM_STEP = 0.15;

const HANDLE_DEFS: HandleDef[] = [
  { id: "nw", cx: 0,   cy: 0,   cursor: "nw-resize" },
  { id: "n",  cx: 0.5, cy: 0,   cursor: "n-resize"  },
  { id: "ne", cx: 1,   cy: 0,   cursor: "ne-resize" },
  { id: "e",  cx: 1,   cy: 0.5, cursor: "e-resize"  },
  { id: "se", cx: 1,   cy: 1,   cursor: "se-resize" },
  { id: "s",  cx: 0.5, cy: 1,   cursor: "s-resize"  },
  { id: "sw", cx: 0,   cy: 1,   cursor: "sw-resize" },
  { id: "w",  cx: 0,   cy: 0.5, cursor: "w-resize"  },
];

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  mapData: SpaceMapItem[];
  selectedSvgId: string | null;
  onSelect: (svgId: string | null) => void;
  editMode?: boolean;
  editZones?: ZoneDef[];
  onZonesChange?: (zones: ZoneDef[]) => void;
  splitConfig?: SplitConfig | null;
  /** Zones to render in view (non-edit) mode. Defaults to the static ZONES constant. */
  mapZones?: ZoneDef[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toSvgCoords(svg: SVGSVGElement, clientX: number, clientY: number): Point {
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const m = svg.getScreenCTM();
  if (!m) return { x: 0, y: 0 };
  const svgPt = pt.matrixTransform(m.inverse());
  return { x: svgPt.x, y: svgPt.y };
}

function applyDrag(zone: ZoneDef, handle: HandleId | "body", dx: number, dy: number): ZoneDef {
  if (handle === "body") {
    return { ...zone, x: Math.round(zone.x + dx), y: Math.round(zone.y + dy) };
  }
  let { x, y, width, height } = zone;
  if (handle === "nw" || handle === "sw" || handle === "w") {
    const newW = Math.max(MIN_SIZE, width - dx);
    x = x + width - newW; width = newW;
  }
  if (handle === "ne" || handle === "se" || handle === "e") {
    width = Math.max(MIN_SIZE, width + dx);
  }
  if (handle === "nw" || handle === "n" || handle === "ne") {
    const newH = Math.max(MIN_SIZE, height - dy);
    y = y + height - newH; height = newH;
  }
  if (handle === "se" || handle === "s" || handle === "sw") {
    height = Math.max(MIN_SIZE, height + dy);
  }
  return { ...zone, x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
}

function overlayFill(svgId: string, mapData: SpaceMapItem[], selectedId: string | null, editMode: boolean): string {
  if (editMode) return "rgba(99,102,241,0.12)";
  if (svgId === selectedId) return "rgba(99,102,241,0.55)";
  const item = mapData.find((m) => m.svg_id === svgId);
  if (!item) return "rgba(34,197,94,0.20)";
  return STATUS_COLORS[item.status] ?? "rgba(34,197,94,0.20)";
}

function overlayStroke(svgId: string, mapData: SpaceMapItem[], selectedId: string | null, editMode: boolean): { color: string; width: number } {
  if (editMode && svgId === selectedId) return { color: "#4f46e5", width: 2 };
  if (editMode) return { color: "#818cf8", width: 1 };
  if (svgId === selectedId) return { color: "#4f46e5", width: 3 };
  const item = mapData.find((m) => m.svg_id === svgId);
  if (!item) return { color: "#16a34a", width: 1.5 };
  return { color: STATUS_COLORS_SOLID[item.status] ?? "#16a34a", width: 1.5 };
}

// ─── New-zone dialog ──────────────────────────────────────────────────────────

function NewZoneDialog({ zone, onConfirm, onCancel }: {
  zone: ZoneDef;
  onConfirm: (z: ZoneDef) => void;
  onCancel: () => void;
}) {
  const [zid, setZid] = useState(zone.id);
  const [label, setLabel] = useState(zone.label);
  const [type, setType] = useState<ZoneDef["type"]>(zone.type);
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/30">
      <div className="w-72 rounded-xl bg-white p-5 shadow-xl">
        <h3 className="mb-3 font-semibold text-slate-800">New Zone</h3>
        <div className="space-y-2 text-sm">
          <label className="block">
            <span className="text-xs text-slate-500">ID</span>
            <input className="mt-0.5 w-full rounded border border-slate-200 px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-indigo-400"
              value={zid} onChange={(e) => setZid(e.target.value)} />
          </label>
          <label className="block">
            <span className="text-xs text-slate-500">Label</span>
            <input className="mt-0.5 w-full rounded border border-slate-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400"
              value={label} onChange={(e) => setLabel(e.target.value)} />
          </label>
          <label className="block">
            <span className="text-xs text-slate-500">Type</span>
            <select className="mt-0.5 w-full rounded border border-slate-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400"
              value={type} onChange={(e) => setType(e.target.value as ZoneDef["type"])}>
              <option value="gondola">gondola</option>
              <option value="promo">promo</option>
              <option value="refrigerator">refrigerator</option>
              <option value="specialty">specialty</option>
            </select>
          </label>
          <p className="text-xs text-slate-400">x:{zone.x} y:{zone.y} w:{zone.width} h:{zone.height}</p>
        </div>
        <div className="mt-4 flex gap-2">
          <button onClick={onCancel} className="flex-1 rounded border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
          <button onClick={() => onConfirm({ ...zone, id: zid.trim() || zone.id, label: label.trim() || "Zone", type })}
            className="flex-1 rounded bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700">Add Zone</button>
        </div>
      </div>
    </div>
  );
}

// ─── Split preview lines ──────────────────────────────────────────────────────

function SplitLines({ zone, vCuts, hCuts }: { zone: ZoneDef; vCuts: number; hCuts: number }) {
  const cols = vCuts + 1;
  const rows = hCuts + 1;
  return (
    <g style={{ pointerEvents: "none" }}>
      {/* Vertical cut lines */}
      {Array.from({ length: vCuts }, (_, i) => {
        const x = zone.x + ((i + 1) * zone.width) / cols;
        return (
          <line key={`v${i}`}
            x1={x} y1={zone.y} x2={x} y2={zone.y + zone.height}
            stroke="#f59e0b" strokeWidth={2} strokeDasharray="5 3" />
        );
      })}
      {/* Horizontal cut lines */}
      {Array.from({ length: hCuts }, (_, i) => {
        const y = zone.y + ((i + 1) * zone.height) / rows;
        return (
          <line key={`h${i}`}
            x1={zone.x} y1={y} x2={zone.x + zone.width} y2={y}
            stroke="#f59e0b" strokeWidth={2} strokeDasharray="5 3" />
        );
      })}
      {/* Cell count badge */}
      {(vCuts > 0 || hCuts > 0) && (
        <>
          <rect
            x={zone.x + zone.width / 2 - 18} y={zone.y + zone.height / 2 - 9}
            width={36} height={18} rx={4}
            fill="#f59e0b" opacity={0.9} />
          <text
            x={zone.x + zone.width / 2} y={zone.y + zone.height / 2}
            textAnchor="middle" dominantBaseline="middle"
            fontSize={10} fontWeight="700" fill="white">
            {cols * rows}
          </text>
        </>
      )}
    </g>
  );
}

// ─── FloorMap ─────────────────────────────────────────────────────────────────

export default function FloorMap({
  mapData, selectedSvgId, onSelect,
  editMode = false, editZones, onZonesChange,
  splitConfig, mapZones,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState>(null);
  const zonesRef = useRef<ZoneDef[]>([]);

  // ── Zoom state ───────────────────────────────────────────────────────────────
  const [zoom, setZoom] = useState(1);

  function clampZoom(z: number) {
    return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
  }

  // Non-passive wheel listener for zoom
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    function onWheel(e: WheelEvent) {
      // Only zoom when Ctrl is held (natural scroll otherwise)
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const delta = e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
      setZoom((z) => clampZoom(z + delta));
    }

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // ── Zones ref ────────────────────────────────────────────────────────────────
  const zones = editMode && editZones ? editZones : (mapZones ?? ZONES);
  zonesRef.current = zones;

  // ── Create-preview & dialog state ────────────────────────────────────────────
  const [createPreview, setCreatePreview] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [pendingZone, setPendingZone] = useState<ZoneDef | null>(null);

  // ── Coordinate helper ────────────────────────────────────────────────────────
  function svgCoords(e: React.PointerEvent): Point {
    return toSvgCoords(svgRef.current!, e.clientX, e.clientY);
  }

  // ── Drag start from zone ─────────────────────────────────────────────────────
  function startZoneDrag(zoneId: string, handle: HandleId | "body", e: React.PointerEvent) {
    e.stopPropagation();
    const zone = zonesRef.current.find((z) => z.id === zoneId);
    if (!zone) return;
    dragRef.current = handle === "body"
      ? { kind: "move", zoneId, startSvg: svgCoords(e), startZone: { ...zone } }
      : { kind: "resize", zoneId, handle, startSvg: svgCoords(e), startZone: { ...zone } };
    svgRef.current?.setPointerCapture(e.pointerId);
  }

  // ── SVG pointer events ───────────────────────────────────────────────────────
  function onSvgPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    if (!editMode) return;
    const tag = (e.target as Element).tagName.toLowerCase();
    if (tag !== "svg" && tag !== "image") return;
    onSelect(null);
    const pos = svgCoords(e);
    dragRef.current = { kind: "create", startSvg: pos, currentSvg: pos };
    setCreatePreview(null);
    svgRef.current?.setPointerCapture(e.pointerId);
  }

  function onSvgPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const curr = svgCoords(e);
    const dx = curr.x - drag.startSvg.x;
    const dy = curr.y - drag.startSvg.y;

    if (drag.kind === "create") {
      dragRef.current = { ...drag, currentSvg: curr };
      setCreatePreview({
        x: Math.round(Math.min(drag.startSvg.x, curr.x)),
        y: Math.round(Math.min(drag.startSvg.y, curr.y)),
        width: Math.round(Math.abs(dx)),
        height: Math.round(Math.abs(dy)),
      });
      return;
    }
    if (!onZonesChange) return;
    if (drag.kind === "move") {
      onZonesChange(zonesRef.current.map((z) =>
        z.id === drag.zoneId ? applyDrag(drag.startZone, "body", dx, dy) : z));
    } else if (drag.kind === "resize") {
      onZonesChange(zonesRef.current.map((z) =>
        z.id === drag.zoneId ? applyDrag(drag.startZone, drag.handle, dx, dy) : z));
    }
  }

  function onSvgPointerUp(e: React.PointerEvent<SVGSVGElement>) {
    const drag = dragRef.current;
    svgRef.current?.releasePointerCapture(e.pointerId);
    dragRef.current = null;
    setCreatePreview(null);
    if (drag?.kind === "create") {
      const curr = svgCoords(e);
      const x = Math.round(Math.min(drag.startSvg.x, curr.x));
      const y = Math.round(Math.min(drag.startSvg.y, curr.y));
      const width = Math.round(Math.abs(curr.x - drag.startSvg.x));
      const height = Math.round(Math.abs(curr.y - drag.startSvg.y));
      if (width > 10 && height > 10) {
        setPendingZone({ id: `zone-${Date.now()}`, label: "Nueva Zona", x, y, width, height, selectable: true, type: "gondola" });
      }
    }
  }

  function confirmNewZone(zone: ZoneDef) {
    onZonesChange?.([...zonesRef.current, zone]);
    onSelect(zone.id);
    setPendingZone(null);
  }

  // ── Split preview zone lookup ─────────────────────────────────────────────
  const splitZone = splitConfig ? zones.find((z) => z.id === splitConfig.zoneId) : null;

  // ── Render ────────────────────────────────────────────────────────────────
  const svgW = Math.round(IMG_W * zoom);
  const svgH = Math.round(IMG_H * zoom);

  return (
    <div className="flex flex-col rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">

      {/* ── Zoom toolbar ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 border-b border-slate-100 bg-slate-50 px-3 py-1.5">
        <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide mr-1">Zoom</span>
        <button
          onClick={() => setZoom((z) => clampZoom(z - 0.25))}
          className="flex h-6 w-6 items-center justify-center rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40"
          disabled={zoom <= ZOOM_MIN}
          title="Zoom out"
        >
          <ZoomOut size={12} />
        </button>
        <span className="min-w-[3rem] text-center text-xs font-mono text-slate-700">
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={() => setZoom((z) => clampZoom(z + 0.25))}
          className="flex h-6 w-6 items-center justify-center rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40"
          disabled={zoom >= ZOOM_MAX}
          title="Zoom in"
        >
          <ZoomIn size={12} />
        </button>
        <button
          onClick={() => setZoom(1)}
          className="flex h-6 w-6 items-center justify-center rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
          title="Reset zoom"
        >
          <Maximize2 size={11} />
        </button>

        {/* Zoom slider */}
        <input
          type="range"
          min={ZOOM_MIN}
          max={ZOOM_MAX}
          step={0.05}
          value={zoom}
          onChange={(e) => setZoom(parseFloat(e.target.value))}
          className="ml-1 h-1 w-28 accent-indigo-600"
        />

        <span className="ml-auto text-[10px] text-slate-400">
          Ctrl + scroll para hacer zoom
        </span>
      </div>

      {/* ── Scrollable SVG area ───────────────────────────────────────────── */}
      <div ref={scrollRef} className="relative overflow-auto">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${IMG_W} ${IMG_H}`}
          width={svgW}
          height={svgH}
          style={{ display: "block", cursor: editMode ? "crosshair" : "default", fontFamily: "system-ui, sans-serif" }}
          onPointerDown={onSvgPointerDown}
          onPointerMove={onSvgPointerMove}
          onPointerUp={onSvgPointerUp}
        >
          {/* Floor plan */}
          <image href="/plano.png" x={0} y={0} width={IMG_W} height={IMG_H} preserveAspectRatio="xMidYMid meet" />

          {/* Zone overlays */}
          {zones.map((zone) => {
            const fill = overlayFill(zone.id, mapData, selectedSvgId, editMode);
            const stroke = overlayStroke(zone.id, mapData, selectedSvgId, editMode);
            const isSelected = zone.id === selectedSvgId;
            return (
              <g key={zone.id}>
                <rect
                  x={zone.x} y={zone.y} width={zone.width} height={zone.height}
                  fill={fill} stroke={stroke.color} strokeWidth={stroke.width} rx={3}
                  style={{ cursor: editMode ? "move" : "pointer" }}
                  onPointerDown={(e) => {
                    if (editMode) { onSelect(zone.id); startZoneDrag(zone.id, "body", e); }
                    else onSelect(zone.id);
                  }}
                />
                {editMode && (
                  <text
                    x={zone.x + zone.width / 2} y={zone.y + zone.height / 2}
                    textAnchor="middle" dominantBaseline="middle"
                    fontSize={Math.min(9, zone.height * 0.55, zone.width / (zone.id.length * 0.65))}
                    fill="#312e81" style={{ pointerEvents: "none", userSelect: "none" }}>
                    {zone.id}
                  </text>
                )}
                {!editMode && isSelected && (
                  <text x={zone.x + zone.width / 2} y={zone.y - 4}
                    textAnchor="middle" fontSize={10} fontWeight="700" fill="#4f46e5"
                    style={{ pointerEvents: "none" }}>▼</text>
                )}
                {editMode && isSelected && HANDLE_DEFS.map((h) => {
                  const hx = zone.x + h.cx * zone.width;
                  const hy = zone.y + h.cy * zone.height;
                  return (
                    <rect key={h.id}
                      x={hx - HANDLE_SIZE / 2} y={hy - HANDLE_SIZE / 2}
                      width={HANDLE_SIZE} height={HANDLE_SIZE}
                      fill="white" stroke="#4f46e5" strokeWidth={1.5} rx={2}
                      style={{ cursor: h.cursor }}
                      onPointerDown={(e) => { onSelect(zone.id); startZoneDrag(zone.id, h.id, e); }}
                    />
                  );
                })}
              </g>
            );
          })}

          {/* Split preview lines */}
          {splitZone && splitConfig && (splitConfig.vCuts > 0 || splitConfig.hCuts > 0) && (
            <SplitLines zone={splitZone} vCuts={splitConfig.vCuts} hCuts={splitConfig.hCuts} />
          )}

          {/* New zone draw preview */}
          {createPreview && createPreview.width > 4 && createPreview.height > 4 && (
            <rect
              x={createPreview.x} y={createPreview.y}
              width={createPreview.width} height={createPreview.height}
              fill="rgba(99,102,241,0.18)" stroke="#4f46e5"
              strokeWidth={1.5} strokeDasharray="6 3" rx={3}
              style={{ pointerEvents: "none" }}
            />
          )}
        </svg>

        {/* New zone dialog */}
        {pendingZone && (
          <NewZoneDialog
            zone={pendingZone}
            onConfirm={confirmNewZone}
            onCancel={() => setPendingZone(null)}
          />
        )}
      </div>
    </div>
  );
}
