import { useRef, useState, useEffect, useMemo } from "react";
import { RotateCcw, Eye, EyeOff } from "lucide-react";
import type { SpaceMapItem, ZoneDef } from "../../types";

// ─── Config ───────────────────────────────────────────────────────────────────

const SVG_W   = 1300;
const SVG_H   = 900;
const FOCAL   = 380;    // focal length px  (~75° HFOV)
const NEAR    = 0.20;   // near clip plane (m)
const EYE_H   = 1.65;   // camera eye height (m)
const STORE_W = 30;     // store width  (m)
const STORE_D = 42;     // store depth  (m)
const STORE_H = 4.0;    // ceiling height (m)
const MOVE_SP = 0.10;   // movement speed (m/frame)
const LERP    = 0.13;

const PRODUCT_COLORS = [
  "#e74c3c","#3498db","#f39c12","#2ecc71","#9b59b6",
  "#e67e22","#1abc9c","#e91e63","#f1c40f","#8bc34a",
];

// ─── Types ────────────────────────────────────────────────────────────────────

type P3 = [number, number, number];
type P2 = [number, number];

interface Camera { x: number; y: number; z: number; yaw: number; pitch: number; }

interface Face {
  corners:   P3[];
  normal:    P3;
  color:     string;
  stroke:    string;
  strokeW:   number;
  opacity:   number;
  fixtureId?: string;
}

// ─── Scene fixtures ───────────────────────────────────────────────────────────

type FixType = "gondola" | "robatope" | "cross" | "promo" | "mueble" | "ristra";

interface Fixture {
  id:    string;
  type:  FixType;
  x:     number;   // world X (m)
  y:     number;   // world Y (m, depth into store)
  w:     number;
  d:     number;
  h:     number;
  label: string;
  color: string;
}

const SCENE: Fixture[] = [
  // ── Aisle A (left)
  { id:"gA1", type:"gondola",  x: 3,  y:10, w:7,   d:0.9, h:1.80, label:"Abarrotes",    color:"#6366f1" },
  { id:"gA2", type:"gondola",  x: 3,  y:14, w:7,   d:0.9, h:1.80, label:"Granos",        color:"#6366f1" },
  { id:"gA3", type:"gondola",  x: 3,  y:18, w:7,   d:0.9, h:1.80, label:"Aceites",       color:"#6366f1" },
  // ── Aisle B (center)
  { id:"gB1", type:"gondola",  x:13,  y:10, w:7,   d:0.9, h:1.80, label:"Limpieza",      color:"#10b981" },
  { id:"gB2", type:"gondola",  x:13,  y:14, w:7,   d:0.9, h:1.80, label:"Cuidado Pers.", color:"#10b981" },
  { id:"gB3", type:"gondola",  x:13,  y:18, w:7,   d:0.9, h:1.80, label:"Aseo BB",       color:"#10b981" },
  // ── Aisle C (right)
  { id:"gC1", type:"gondola",  x:22,  y:10, w:5,   d:0.9, h:1.80, label:"Lácteos",       color:"#3b82f6" },
  { id:"gC2", type:"gondola",  x:22,  y:14, w:5,   d:0.9, h:1.80, label:"Refrigerados",  color:"#3b82f6" },
  { id:"gC3", type:"gondola",  x:22,  y:18, w:5,   d:0.9, h:1.80, label:"Congelados",    color:"#3b82f6" },
  // ── Special fixtures
  { id:"r1",  type:"robatope", x:11,  y: 8, w:1.2, d:1.2, h:1.60, label:"Display",       color:"#16a34a" },
  { id:"r2",  type:"robatope", x:20,  y: 8, w:1.2, d:1.2, h:1.60, label:"Oferta",        color:"#dc2626" },
  { id:"cr1", type:"cross",    x: 1,  y:24, w:2.4, d:1.8, h:0.90, label:"Pallet",        color:"#f59e0b" },
  { id:"pr1", type:"promo",    x: 8,  y: 7, w:5,   d:1.2, h:0.85, label:"Zona Promo",    color:"#ec4899" },
  { id:"mu1", type:"mueble",   x:27,  y:10, w:1,   d:0.6, h:2.00, label:"Vitrina",       color:"#1e293b" },
  { id:"mu2", type:"mueble",   x:27,  y:14, w:1,   d:0.6, h:2.00, label:"Vitrina",       color:"#1e293b" },
];

// ─── Projection ───────────────────────────────────────────────────────────────

function camCoords(p: P3, cam: Camera): [number, number, number] {
  const dx = p[0] - cam.x, dy = p[1] - cam.y, dz = p[2] - cam.z;
  const cY = Math.cos(cam.yaw),  sY = Math.sin(cam.yaw);
  const cP = Math.cos(cam.pitch), sP = Math.sin(cam.pitch);
  const right   = dx * cY - dy * sY;
  const forward = dx * sY + dy * cY;
  const depth   = forward * cP + dz * sP;
  const up      = -forward * sP + dz * cP;
  return [right, depth, up];
}

function project(p: P3, cam: Camera): [P2, number] | null {
  const [r, depth, u] = camCoords(p, cam);
  if (depth < NEAR) return null;
  return [[SVG_W / 2 + (r / depth) * FOCAL, SVG_H / 2 - (u / depth) * FOCAL], depth];
}

// Sutherland–Hodgman near-plane clip — returns clipped world-space polygon
function clipNear(corners: P3[], cam: Camera): P3[] {
  const out: P3[] = [];
  const n = corners.length;
  for (let i = 0; i < n; i++) {
    const a = corners[i], b = corners[(i + 1) % n];
    const da = camCoords(a, cam)[1], db = camCoords(b, cam)[1];
    if (da >= NEAR) out.push(a);
    if ((da >= NEAR) !== (db >= NEAR)) {
      const t = (NEAR - da) / (db - da);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
    }
  }
  return out;
}

// Backface culling: face visible when camera is on the side the normal points toward
function frontFacing(face: Face, cam: Camera): boolean {
  const n = face.corners.length;
  const cx = face.corners.reduce((s, p) => s + p[0], 0) / n;
  const cy = face.corners.reduce((s, p) => s + p[1], 0) / n;
  const cz = face.corners.reduce((s, p) => s + p[2], 0) / n;
  const [nx, ny, nz] = face.normal;
  return (cam.x - cx) * nx + (cam.y - cy) * ny + (cam.z - cz) * nz > 0;
}

// ─── Colour helpers ───────────────────────────────────────────────────────────

function shade(hex: string, f: number): string {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  const cl = (v: number) => Math.min(255, Math.max(0, Math.round(v * f)));
  return `rgb(${cl(r)},${cl(g)},${cl(b)})`;
}
function mixW(hex: string, t: number): string {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  const m = (v: number) => Math.round(v + (255 - v) * t);
  return `rgb(${m(r)},${m(g)},${m(b)})`;
}

// ─── Face generators ──────────────────────────────────────────────────────────

function box(
  x: number, y: number, z0: number, z1: number, w: number, d: number,
  topC: string, frontC: string, sideC: string,
  st = "rgba(0,0,0,0.12)", stW = 0.5, id?: string, op = 1
): Face[] {
  return [
    { corners: [[x,y,z1],[x+w,y,z1],[x+w,y+d,z1],[x,y+d,z1]],   normal:[0,0,1],  color:topC,   stroke:st, strokeW:stW, opacity:op, fixtureId:id },
    { corners: [[x,y,z0],[x+w,y,z0],[x+w,y,z1],[x,y,z1]],        normal:[0,-1,0], color:frontC, stroke:st, strokeW:stW, opacity:op, fixtureId:id },
    { corners: [[x+w,y+d,z0],[x,y+d,z0],[x,y+d,z1],[x+w,y+d,z1]],normal:[0,1,0],  color:frontC, stroke:st, strokeW:stW, opacity:op, fixtureId:id },
    { corners: [[x,y+d,z0],[x,y,z0],[x,y,z1],[x,y+d,z1]],        normal:[-1,0,0], color:sideC,  stroke:st, strokeW:stW, opacity:op, fixtureId:id },
    { corners: [[x+w,y,z0],[x+w,y+d,z0],[x+w,y+d,z1],[x+w,y,z1]],normal:[1,0,0],  color:sideC,  stroke:st, strokeW:stW, opacity:op, fixtureId:id },
  ];
}

function gondolaFaces(fix: Fixture): Face[] {
  const { x, y, w, d, h, color, id } = fix;
  const frameC = "#2c3a47";
  const shelfC = mixW(color, 0.55);
  const numShelves = Math.max(3, Math.round(h / 0.5));
  const topH = 0.14, shelfT = 0.035;
  const faces: Face[] = [];

  // Main back panel + sides (full height, shallow depth)
  faces.push(...box(x, y, 0, h, w, d * 0.10,
    shade(frameC, 1.1), "#dde1e7", shade("#dde1e7", 0.88),
    "rgba(0,0,0,0.08)", 0.3, id));

  // Top housing cap
  faces.push(...box(x, y, h - topH, h, w, d,
    shade(frameC, 1.25), frameC, shade(frameC, 0.78),
    "rgba(0,0,0,0.12)", 0.4, id));

  // Shelf boards
  for (let i = 1; i <= numShelves; i++) {
    const sz = i * (h - topH) / (numShelves + 1);
    faces.push(...box(x, y, sz, sz + shelfT, w, d,
      "#e4e8ee", shelfC, shade(shelfC, 0.82),
      "rgba(0,0,0,0.06)", 0.2, id));
  }

  // Product strips between shelves (front face only, per section)
  const shelfZs = Array.from({ length: numShelves }, (_, i) => (i + 1) * (h - topH) / (numShelves + 1));
  const gaps: [number, number][] = [
    [0.02, shelfZs[0]],
    ...Array.from({ length: numShelves - 1 }, (_, i) =>
      [shelfZs[i] + shelfT, shelfZs[i + 1]] as [number, number]),
    [shelfZs[numShelves - 1] + shelfT, h - topH - 0.02],
  ];
  const hash = id.split("").reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7) & 0xfff;
  const nSec = Math.max(4, Math.round(w / 0.45));
  gaps.forEach(([z0, z1], gi) => {
    if (z1 - z0 < 0.08) return;
    for (let si = 0; si < nSec; si++) {
      const f0 = si / nSec, f1 = (si + 1) / nSec;
      const pc = PRODUCT_COLORS[(hash + gi * 7 + si * 3) % PRODUCT_COLORS.length];
      // Front product face (y-facing toward entrance, normal 0,-1,0)
      faces.push({ corners: [[x+w*f0,y,z0],[x+w*f1,y,z0],[x+w*f1,y,z1],[x+w*f0,y,z1]], normal:[0,-1,0], color:pc, stroke:"rgba(0,0,0,0.04)", strokeW:0.2, opacity:0.85, fixtureId:id });
      // Back product face
      faces.push({ corners: [[x+w*f1,y+d,z0],[x+w*f0,y+d,z0],[x+w*f0,y+d,z1],[x+w*f1,y+d,z1]], normal:[0,1,0], color:pc, stroke:"rgba(0,0,0,0.04)", strokeW:0.2, opacity:0.85, fixtureId:id });
    }
  });

  return faces;
}

function robatopeFaces(fix: Fixture): Face[] {
  const { x, y, w, d, h, color, id } = fix;
  const SIGN = Math.min(h * 0.22, 0.9);
  const bodyH = h - SIGN;
  const faces: Face[] = [];
  // Body
  faces.push(...box(x, y, 0, bodyH, w, d, mixW(color, 0.3), shade(color, 0.72), shade(color, 0.50), "rgba(0,0,0,0.14)", 0.5, id));
  // Sign
  faces.push(...box(x, y, bodyH, h, w, d, shade(color, 1.3), mixW(color, 0.18), shade(color, 0.60), "rgba(0,0,0,0.1)", 0.4, id));
  // White label panel on sign front face
  const px = x + w * 0.1, pw = w * 0.8, pz0 = bodyH + SIGN * 0.12, pz1 = h - SIGN * 0.12;
  faces.push({ corners:[[px,y,pz0],[px+pw,y,pz0],[px+pw,y,pz1],[px,y,pz1]], normal:[0,-1,0], color:"rgba(255,255,255,0.86)", stroke:"none", strokeW:0, opacity:1, fixtureId:id });
  faces.push({ corners:[[px+pw,y+d,pz0],[px,y+d,pz0],[px,y+d,pz1],[px+pw,y+d,pz1]], normal:[0,1,0], color:"rgba(255,255,255,0.86)", stroke:"none", strokeW:0, opacity:1, fixtureId:id });
  return faces;
}

function crossFaces(fix: Fixture): Face[] {
  const { x, y, w, d, h, id } = fix;
  const palH = 0.15;
  const hash = id.split("").reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7) & 0xfff;
  const c0 = PRODUCT_COLORS[hash % PRODUCT_COLORS.length];
  const c1 = PRODUCT_COLORS[(hash + 4) % PRODUCT_COLORS.length];
  const c2 = PRODUCT_COLORS[(hash + 7) % PRODUCT_COLORS.length];
  const layH = (h - palH) / 3;
  const P = w * 0.06;
  return [
    ...box(x, y, 0, palH, w, d, "#1d4ed8", "#2563eb", "#1e40af", "rgba(0,0,0,0.12)", 0.4, id),
    ...box(x+P,   y+P,   palH,          palH+layH,   w-P*2,   d-P*2,   mixW(c0,0.3), c0, shade(c0,0.68), "rgba(0,0,0,0.12)", 0.4, id),
    ...box(x+P*2, y+P*2, palH+layH,     palH+layH*2, w-P*4,   d-P*4,   mixW(c1,0.3), c1, shade(c1,0.68), "rgba(0,0,0,0.12)", 0.4, id),
    ...box(x+P*3, y+P*3, palH+layH*2,   h,           w-P*6,   d-P*6,   mixW(c2,0.3), c2, shade(c2,0.68), "rgba(0,0,0,0.12)", 0.4, id),
  ];
}

function promoFaces(fix: Fixture): Face[] {
  const { x, y, w, d, h, color, id } = fix;
  return box(x, y, 0, h, w, d, mixW(color, 0.4), color, shade(color, 0.72), "rgba(0,0,0,0.15)", 0.5, id);
}

function muebleFaces(fix: Fixture): Face[] {
  const { x, y, w, d, h, id } = fix;
  const color = "#1e293b";
  const FOOT = 0.12, SIGN = 0.25, bodyZ0 = FOOT, bodyZ1 = h - SIGN;
  const faces: Face[] = [];
  // Solid frame
  faces.push(...box(x, y, 0, h, w, d, shade(color, 1.2), shade(color, 0.65), shade(color, 0.45), "rgba(0,0,0,0.2)", 0.5, id));
  // Glass front
  const gx = x, gz0 = bodyZ0, gz1 = bodyZ1;
  faces.push({ corners:[[gx,y,gz0],[gx+w,y,gz0],[gx+w,y,gz1],[gx,y,gz1]], normal:[0,-1,0], color:"rgba(186,230,253,0.22)", stroke:"rgba(147,210,240,0.7)", strokeW:0.5, opacity:1, fixtureId:id });
  faces.push({ corners:[[gx+w,y+d,gz0],[gx,y+d,gz0],[gx,y+d,gz1],[gx+w,y+d,gz1]], normal:[0,1,0], color:"rgba(186,230,253,0.22)", stroke:"rgba(147,210,240,0.7)", strokeW:0.5, opacity:1, fixtureId:id });
  return faces;
}

function storeRoom(): Face[] {
  const W = STORE_W, D = STORE_D, H = STORE_H;
  const fl = "#e8e0d0", wall = "#f4f2ee", ceil = "#ffffff";
  return [
    { corners:[[0,0,0],[W,0,0],[W,D,0],[0,D,0]],   normal:[0,0,1],  color:fl,   stroke:"#d4cec4", strokeW:1,   opacity:1 },
    { corners:[[W,0,H],[0,0,H],[0,D,H],[W,D,H]],   normal:[0,0,-1], color:ceil, stroke:"#ebebeb", strokeW:0.3, opacity:1 },
    { corners:[[W,D,0],[0,D,0],[0,D,H],[W,D,H]],   normal:[0,-1,0], color:wall, stroke:"#e2e0db", strokeW:0.5, opacity:1 },
    { corners:[[0,0,0],[W,0,0],[W,0,H],[0,0,H]],   normal:[0,1,0],  color:shade(wall,0.96), stroke:"#e2e0db", strokeW:0.5, opacity:1 },
    { corners:[[0,D,0],[0,0,0],[0,0,H],[0,D,H]],   normal:[1,0,0],  color:shade(wall,0.98), stroke:"#e2e0db", strokeW:0.5, opacity:1 },
    { corners:[[W,0,0],[W,D,0],[W,D,H],[W,0,H]],   normal:[-1,0,0], color:shade(wall,0.98), stroke:"#e2e0db", strokeW:0.5, opacity:1 },
  ];
}

// Floor tile grid (rendered as extra face-like lines via very thin horizontal faces)
function floorGrid(): Face[] {
  const faces: Face[] = [];
  const gc = "rgba(180,170,155,0.5)";
  for (let x = 0; x <= STORE_W; x += 3) {
    faces.push({ corners:[[x,0,-0.001],[x+0.04,0,-0.001],[x+0.04,STORE_D,-0.001],[x,STORE_D,-0.001]], normal:[0,0,1], color:gc, stroke:"none", strokeW:0, opacity:0.6 });
  }
  for (let y = 0; y <= STORE_D; y += 3) {
    faces.push({ corners:[[0,y,-0.001],[STORE_W,y,-0.001],[STORE_W,y+0.04,-0.001],[0,y+0.04,-0.001]], normal:[0,0,1], color:gc, stroke:"none", strokeW:0, opacity:0.6 });
  }
  return faces;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  zones:         ZoneDef[];
  mapData:       SpaceMapItem[];
  selectedSvgId: string | null;
  onSelect:      (id: string | null) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function StoreView({ selectedSvgId, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  const camRef    = useRef<Camera>({ x: 15, y: 2.5, z: EYE_H, yaw: 0, pitch: -0.06 });
  const targetRef = useRef<Camera>({ x: 15, y: 2.5, z: EYE_H, yaw: 0, pitch: -0.06 });
  const keysRef   = useRef(new Set<string>());
  const [, setTick]       = useState(0);
  const [showLabels, setShowLabels] = useState(true);
  const [isDragging, setIsDragging] = useState(false);

  const dragRef    = useRef<{ sx: number; sy: number; startYaw: number; startPitch: number; moved: boolean } | null>(null);
  const wasDragRef = useRef(false); // survives pointerup so onClick can read it

  // Keyboard
  useEffect(() => {
    const dn = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const k = e.key.toLowerCase();
      keysRef.current.add(k);
      if (["arrowup","arrowdown","arrowleft","arrowright"," "].includes(k)) e.preventDefault();
    };
    const up = (e: KeyboardEvent) => keysRef.current.delete(e.key.toLowerCase());
    window.addEventListener("keydown", dn);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", dn); window.removeEventListener("keyup", up); };
  }, []);

  // rAF loop
  useEffect(() => {
    let rid: number;
    function loop() {
      const t = targetRef.current;
      const c = camRef.current;
      const keys = keysRef.current;
      if (keys.size > 0) {
        const cY = Math.cos(t.yaw), sY = Math.sin(t.yaw);
        if (keys.has("w") || keys.has("arrowup"))    { t.x += sY * MOVE_SP; t.y += cY * MOVE_SP; }
        if (keys.has("s") || keys.has("arrowdown"))  { t.x -= sY * MOVE_SP; t.y -= cY * MOVE_SP; }
        if (keys.has("a") || keys.has("arrowleft"))  { t.x -= cY * MOVE_SP; t.y += sY * MOVE_SP; }
        if (keys.has("d") || keys.has("arrowright")) { t.x += cY * MOVE_SP; t.y -= sY * MOVE_SP; }
        t.x = Math.max(0.4, Math.min(STORE_W - 0.4, t.x));
        t.y = Math.max(0.4, Math.min(STORE_D - 0.4, t.y));
      }
      const px = c.x, py = c.y, pyaw = c.yaw, ppitch = c.pitch;
      c.x     += (t.x     - c.x)     * LERP;
      c.y     += (t.y     - c.y)     * LERP;
      c.yaw   += (t.yaw   - c.yaw)   * LERP;
      c.pitch += (t.pitch - c.pitch) * LERP;
      const moved = Math.abs(c.x-px)>0.001 || Math.abs(c.y-py)>0.001 ||
                    Math.abs(c.yaw-pyaw)>0.0001 || Math.abs(c.pitch-ppitch)>0.0001 || keys.size > 0;
      if (moved) setTick(n => n + 1);
      rid = requestAnimationFrame(loop);
    }
    rid = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rid);
  }, []);

  // Scroll → walk forward/back
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const t = targetRef.current;
      const step = e.deltaY < 0 ? 0.6 : -0.6;
      t.x = Math.max(0.4, Math.min(STORE_W-0.4, t.x + Math.sin(t.yaw) * step));
      t.y = Math.max(0.4, Math.min(STORE_D-0.4, t.y + Math.cos(t.yaw) * step));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Mouse look — handlers on the container div so drags over polygons work too
  function onDivPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    wasDragRef.current = false;
    dragRef.current = { sx: e.clientX, sy: e.clientY, startYaw: targetRef.current.yaw, startPitch: targetRef.current.pitch, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onDivPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.sx;
    const dy = e.clientY - dragRef.current.sy;
    if (!dragRef.current.moved && Math.abs(dx) + Math.abs(dy) > 3) {
      dragRef.current.moved = true;
      wasDragRef.current = true;
      setIsDragging(true);
    }
    if (!dragRef.current.moved) return;
    targetRef.current.yaw   = dragRef.current.startYaw + dx * 0.004;
    targetRef.current.pitch = Math.max(-1.05, Math.min(0.75, dragRef.current.startPitch - dy * 0.003));
  }
  function onDivPointerUp() { dragRef.current = null; setIsDragging(false); }

  function resetView() {
    targetRef.current = { x: 15, y: 2.5, z: EYE_H, yaw: 0, pitch: -0.06 };
  }

  // ── Static geometry (memoised — camera-independent) ──────────────────────────
  const allFaces = useMemo<Face[]>(() => {
    const f: Face[] = [];
    f.push(...storeRoom());
    f.push(...floorGrid());
    for (const fix of SCENE) {
      if (fix.type === "gondola")  f.push(...gondolaFaces(fix));
      else if (fix.type === "robatope") f.push(...robatopeFaces(fix));
      else if (fix.type === "cross")    f.push(...crossFaces(fix));
      else if (fix.type === "mueble")   f.push(...muebleFaces(fix));
      else                              f.push(...promoFaces(fix));
    }
    return f;
  }, []);

  // ── Per-frame: cull → clip → project → sort ──────────────────────────────────
  const cam = camRef.current;

  const rendered = (() => {
    const vis: { screenPts: P2[]; depth: number; face: Face }[] = [];
    for (const face of allFaces) {
      if (!frontFacing(face, cam)) continue;
      const clipped = clipNear(face.corners, cam);
      if (clipped.length < 3) continue;
      const pts: P2[] = [];
      let sumD = 0, ok = true;
      for (const p of clipped) {
        const r = project(p, cam);
        if (!r) { ok = false; break; }
        pts.push(r[0]); sumD += r[1];
      }
      if (!ok || pts.length < 3) continue;
      vis.push({ screenPts: pts, depth: sumD / pts.length, face });
    }
    vis.sort((a, b) => b.depth - a.depth);
    return vis;
  })();

  const yawDeg = Math.round(((cam.yaw * 180 / Math.PI) % 360 + 360) % 360);

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col rounded-xl border border-dark-line bg-dark-bg shadow-lg overflow-hidden" style={{ minHeight: 0 }}>

      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-dark-line bg-dark-surface px-3 py-1.5 flex-shrink-0">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-dark-ink-3">Vista 3D · Primera Persona</span>
        <div className="mx-2 h-4 border-l border-dark-line-2" />
        <span className="font-mono text-[11px] text-dark-ink-2">
          ({cam.x.toFixed(1)} , {cam.y.toFixed(1)}) m · {yawDeg}°
        </span>
        <button onClick={() => setShowLabels(v => !v)}
          className={`ml-2 flex h-6 items-center gap-1 rounded border px-2 text-[10px] font-medium transition-colors ${
            showLabels ? "border-accent-200 bg-dark-surface-2 text-dark-ink-1" : "border-dark-line-2 bg-dark-surface-2 text-dark-ink-3 hover:bg-dark-line-2"
          }`}>
          {showLabels ? <Eye size={10}/> : <EyeOff size={10}/>}
          <span>Labels</span>
        </button>
        <button onClick={resetView} title="Restablecer vista"
          className="flex h-6 w-6 items-center justify-center rounded border border-dark-line-2 bg-dark-surface-2 text-dark-ink-2 hover:bg-dark-line-2">
          <RotateCcw size={10}/>
        </button>
        <span className="ml-auto hidden text-[10px] text-dark-ink-3 lg:block">
          WASD · ↑↓←→ mover · arrastrar mirar · rueda avanzar
        </span>
      </div>

      {/* 3D canvas */}
      <div ref={containerRef}
        className="relative flex-1 overflow-hidden"
        style={{ minHeight: 0, background: "#0f172a", cursor: isDragging ? "grabbing" : "grab" }}
        onPointerDown={onDivPointerDown}
        onPointerMove={onDivPointerMove}
        onPointerUp={onDivPointerUp}
      >
        <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          style={{ width: "100%", height: "100%", display: "block" }}>

          {/* Sky gradient background */}
          <defs>
            <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1e3a5f"/>
              <stop offset="100%" stopColor="#3b6ea5"/>
            </linearGradient>
          </defs>
          {/* Sky rect — click on empty sky deselects (guarded against drag-release) */}
          <rect x={0} y={0} width={SVG_W} height={SVG_H} fill="url(#sky)"
            onClick={() => { if (!wasDragRef.current) onSelect(null); }} style={{ pointerEvents: "all" }}/>

          {/* Rendered geometry */}
          {rendered.map(({ screenPts, face }, i) => (
            <polygon key={i}
              points={screenPts.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(" ")}
              fill={face.color}
              stroke={face.stroke}
              strokeWidth={face.strokeW}
              opacity={face.opacity}
              onClick={() => { if (wasDragRef.current) return; face.fixtureId ? onSelect(face.fixtureId === selectedSvgId ? null : face.fixtureId) : onSelect(null); }}
              style={{ cursor: face.fixtureId ? "pointer" : "default" }}
            />
          ))}

          {/* Labels */}
          {showLabels && SCENE.map(fix => {
            const lp = project([fix.x + fix.w / 2, fix.y + fix.d / 2, fix.h + 0.25], cam);
            if (!lp) return null;
            const [[sx, sy], depth] = lp;
            if (depth < NEAR || depth > 18) return null;
            const fs = Math.max(7, Math.min(15, 500 / depth));
            const selected = fix.id === selectedSvgId;
            return (
              <text key={fix.id} x={sx} y={sy}
                textAnchor="middle" fontSize={fs} fontWeight="700"
                fill={selected ? "#a5b4fc" : "white"}
                stroke={selected ? "rgba(79,70,229,0.9)" : "rgba(0,0,0,0.75)"}
                strokeWidth={selected ? 3 : 2.5} paintOrder="stroke"
                style={{ pointerEvents: "none", userSelect: "none" }}>
                {fix.label}
              </text>
            );
          })}

          {/* Crosshair */}
          <g opacity={0.45}>
            <line x1={SVG_W/2-10} y1={SVG_H/2} x2={SVG_W/2+10} y2={SVG_H/2} stroke="white" strokeWidth={1}/>
            <line x1={SVG_W/2} y1={SVG_H/2-10} x2={SVG_W/2} y2={SVG_H/2+10} stroke="white" strokeWidth={1}/>
          </g>

          {/* HUD: selected fixture */}
          {selectedSvgId && (() => {
            const fix = SCENE.find(f => f.id === selectedSvgId);
            if (!fix) return null;
            return (
              <g>
                <rect x={20} y={SVG_H - 70} width={220} height={55} rx={8}
                  fill="rgba(15,23,42,0.85)" stroke="rgba(99,102,241,0.6)" strokeWidth={1}/>
                <text x={32} y={SVG_H - 48} fontSize={10} fontWeight="600" fill="#818cf8" style={{userSelect:"none"}}>
                  SELECCIONADO
                </text>
                <text x={32} y={SVG_H - 31} fontSize={13} fontWeight="700" fill="white" style={{userSelect:"none"}}>
                  {fix.label}
                </text>
                <text x={32} y={SVG_H - 17} fontSize={10} fill="#94a3b8" style={{userSelect:"none"}}>
                  {fix.w}m × {fix.d}m × {fix.h}m · {fix.type}
                </text>
              </g>
            );
          })()}
        </svg>
      </div>
    </div>
  );
}
