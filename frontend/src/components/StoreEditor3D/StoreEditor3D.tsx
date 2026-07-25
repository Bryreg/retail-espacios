import React, { useState, useRef, useEffect, useMemo, memo, useCallback } from "react";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { OrbitControls as ThreeOrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";
import {
  Trash2, RotateCw, FlipHorizontal2, Save, X,
  Building2, DollarSign, Calendar, Tag, Info, AlertTriangle, Boxes,
  Eye, EyeOff, Camera, User,
} from "lucide-react";
import { Html } from "@react-three/drei";
import { useFixtureStore, selectFixtures } from "../../store/fixtureStore";
import { isDoubleGondola } from "../../types/fixtures";
import type { UnifiedFixture, FixType, GondolaType, SpaceStatus } from "../../types/fixtures";
import { findOrCreateSpace, createLease } from "../../api/spaces";
import { findOrCreateSupplier } from "../../api/suppliers";
import { fileUrl, getFaceImages } from "../../api/files";

// ─── Scene constants ──────────────────────────────────────────────────────────

const STORE_W = 30;
const STORE_D = 42;
const SNAP    = 0.05;   // matches FloorPlan2D's snapTo grid (5 cm)
// Camera is placed on the far (north) side so that the Z axis matches the 2D view:
// small Z (2D-top) → far from camera → appears at top of 3D scene.
// Previously the camera was at Z=-8 (south side), which flipped the 2D/3D relationship.
const CAM_POS: [number, number, number] = [STORE_W / 2, 28, STORE_D + 8];
const CAM_TARGET: [number, number, number] = [STORE_W / 2, 0, STORE_D / 2];

function snap(v: number) { return Math.round(v / SNAP) * SNAP; }

// ─── Visual helpers ───────────────────────────────────────────────────────────


function computeDays(start: string, end: string): number {
  if (!start || !end) return 0;
  return Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86_400_000));
}

function euclidean(ax: number, az: number, bx: number, bz: number) {
  return Math.sqrt((ax-bx)**2+(az-bz)**2);
}

// ─── Face paint (per-face material arrays) ───────────────────────────────────
// Imagery (supplier photo or category pattern) is painted ONTO an existing box
// of the fixture mesh via a material array — never onto new positioned
// geometry — so it inherits the fixture group's transform and cannot float.

interface FacePaint {
  /** Material for the fixture's FRONT face (this file's convention: -Z at rotY 0). */
  front: THREE.Material | null;
  /** Material for the BACK face (+Z) — only set for double gondolas (face B). */
  back:  THREE.Material | null;
}

/** Cached plain Lambert materials — the "everything else stays as today" faces. */
const plainLambertCache = new Map<string, THREE.MeshLambertMaterial>();
function getPlainLambert(color: string): THREE.MeshLambertMaterial {
  let m = plainLambertCache.get(color);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color });
    plainLambertCache.set(color, m);
  }
  return m;
}

/** Cached plain Standard materials (for panels that use emissive/standard). */
const plainStandardCache = new Map<string, THREE.MeshStandardMaterial>();
function getPlainStandard(
  color: string, emissive: string, emissiveIntensity: number, opacity: number,
): THREE.MeshStandardMaterial {
  const key = `${color}|${emissive}|${emissiveIntensity}|${opacity}`;
  let m = plainStandardCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color, emissive, emissiveIntensity, transparent: true, opacity,
    });
    plainStandardCache.set(key, m);
  }
  return m;
}

/**
 * Build the 6-material array for a painted box.
 * BoxGeometry face order: [+X, -X, +Y, -Y, +Z, -Z].
 * Front (-Z, index 5) ← face A texture; back (+Z, index 4) ← face B texture.
 */
function facePaintArray(
  plain: THREE.Material,
  front: THREE.Material | null,
  back:  THREE.Material | null,
): THREE.Material[] {
  return [plain, plain, plain, plain, back ?? plain, front ?? plain];
}

// ─── Types ────────────────────────────────────────────────────────────────────

// FixType, GondolaType, SpaceStatus imported from ../../types/fixtures

const STATUS_COLORS: Record<SpaceStatus, string> = {
  free:        "#22c55e",
  occupied:    "#ef4444",
  reserved:    "#f59e0b",
  maintenance: "#94a3b8",
};

interface ShelfSlot {
  id:              string;
  x:               number;
  y:               number;
  w:               number;
  h:               number;
  supplierName:    string;
  brandCategory:   string;
  negotiatedValue: number;
  startDate:       string;
  endDate:         string;
  status:          SpaceStatus;
}

interface FixtureDef {
  type:         FixType;
  gondolaType?: GondolaType;
  label:        string;
  w: number; d: number; h: number;
  color:        string;
  emoji:        string;
  desc:         string;
  code:         string;
}

interface PlacedFixture {
  id:              string;
  code:            string;
  type:            FixType;
  gondolaType?:    GondolaType;
  slots?:          ShelfSlot[];
  x: number; z: number;
  rotY:            number;
  w: number; d: number; h: number;
  label:           string;
  color:           string;
  supplierName:    string;
  brandCategory:   string;
  status:          SpaceStatus;
  negotiatedValue: number;
  startDate:       string;
  endDate:         string;
  observation:     string;
}

// ─── Fixture catalogue ────────────────────────────────────────────────────────

const FIXTURE_DEFS: FixtureDef[] = [
  // ── Góndolas ──────────────────────────────────────────────────────────────
  { type:"gondola", gondolaType:"double", label:"Góndola Doble",    w:0.90, d:0.90, h:1.80, color:"#6366f1", emoji:"📚", desc:"Módulo de estante central, doble cara",   code:"GON" },
  { type:"gondola", gondolaType:"wall",   label:"Góndola Mural",    w:1.00, d:0.40, h:1.90, color:"#818cf8", emoji:"🧱", desc:"Módulo de estante contra pared",           code:"GON" },
  { type:"punta",                         label:"Punta Góndola",    w:0.90, d:0.40, h:1.80, color:"#7c3aed", emoji:"🏷️",  desc:"Cabecera de góndola con topper promocional", code:"PUN" },
  // ── Displays ──────────────────────────────────────────────────────────────
  { type:"ristra",                        label:"Ristra",           w:0.40, d:0.40, h:1.60, color:"#d97706", emoji:"🪝",  desc:"Colgante de productos",                   code:"RIS" },
  { type:"cross",                         label:"Exhibidor Cruz",   w:0.80, d:0.80, h:1.80, color:"#0891b2", emoji:"➕", desc:"Display lateral cross-selling",            code:"CRS" },
  // ── Muebles ───────────────────────────────────────────────────────────────
  { type:"mueble",                        label:"Vitrina",          w:1.20, d:0.60, h:2.00, color:"#475569", emoji:"🗄️", desc:"Vitrina con puertas de vidrio",            code:"MUE" },
  { type:"isla",                          label:"Exhib. de Piso",   w:1.20, d:0.80, h:1.40, color:"#f59e0b", emoji:"🏪", desc:"Exhibidor de piso con estantes y productos", code:"EXP" },
  { type:"impulsador",                    label:"Impulsador Marca",  w:0.60, d:0.40, h:1.50, color:"#e11d48", emoji:"🏷️",  desc:"Display compacto de impulso de marca",         code:"IMP" },
  { type:"batea",                         label:"Batea",            w:0.80, d:0.60, h:0.80, color:"#84cc16", emoji:"🧺", desc:"Canasto metálico con ruedas",              code:"BAT" },
  // ── Refrigeración ─────────────────────────────────────────────────────────
  { type:"isla_fria",        label:"Isla Helados/Cong.",  w:1.80, d:1.00, h:0.90, color:"#e5e7eb", emoji:"🍦", desc:"Isla abierta refrigerada con guarda de acrílico",code:"ISL" },
  { type:"nevera_carnes",    label:"Nevera Carnes",       w:2.00, d:0.90, h:1.05, color:"#111827", emoji:"🥩", desc:"Mostrador con vidrio curvo para carnes y deli",  code:"CAR" },
  { type:"nevera_refrescos", label:"Nevera Refrescos",    w:1.20, d:0.75, h:1.80, color:"#1e293b", emoji:"🥤", desc:"Vitrina multideck abierta para bebidas",         code:"BEB" },
  // ── Servicio ──────────────────────────────────────────────────────────────
  { type:"stand_frutas",                  label:"Stand Frutas/Verd",w:1.50, d:1.20, h:0.95, color:"#84cc16", emoji:"🍎", desc:"Cajón expositor de frutas y verduras", code:"FRU" },
  { type:"checkout",                      label:"Checkout / Caja",  w:1.80, d:0.70, h:0.90, color:"#8b5cf6", emoji:"🛒", desc:"Caja registradora con cinta transportadora", code:"CAJ" },
  // ── Infraestructura ───────────────────────────────────────────────────────
  { type:"metro",                         label:"Zona Libre",       w:1.00, d:1.00, h:0.05, color:"#64748b", emoji:"⬜", desc:"Área de suelo demarcada",                  code:"MET" },
  { type:"columna",                       label:"Columna",          w:0.30, d:0.30, h:3.00, color:"#94a3b8", emoji:"🏛️", desc:"Columna estructural",                      code:"COL" },
  // ── Accesorios de góndola ─────────────────────────────────────────────────
  // Robatope: w=0.30 (ancho del panel), d=0.40 (= profundidad de la Punta → encaja al ras)
  { type:"robatope",                      label:"Robatope",         w:0.30, d:0.40, h:1.60, color:"#c0c0bc", emoji:"🛡️", desc:"Panel lateral de protección — flanquea la Punta de Góndola", code:"ROB" },
];

const STATUS_META: Record<SpaceStatus, { bg: string; text: string; label: string }> = {
  free:        { bg:"bg-success/20",  text:"text-success",  label:"Disponible"    },
  occupied:    { bg:"bg-danger/20",   text:"text-danger",   label:"Ocupado"       },
  reserved:    { bg:"bg-warning/20",  text:"text-warning",  label:"Reservado"     },
  maintenance: { bg:"bg-dark-surface-2", text:"text-dark-ink-2", label:"Mantenimiento" },
};

// ─── Code & slot generation ───────────────────────────────────────────────────

function generateCode(sede: string, def: FixtureDef, existing: PlacedFixture[]): string {
  const prefix = `${sede.toUpperCase()}-${def.code}-`;
  const count  = existing.filter(f => f.code.startsWith(prefix)).length;
  return `${prefix}${String(count + 1).padStart(3,"0")}`;
}

function defaultSlots(fix: { type: FixType; w: number; h: number; code: string }): ShelfSlot[] {
  if (fix.type !== "gondola" && fix.type !== "punta") return [];
  const cols = fix.type === "gondola" ? Math.max(2, Math.round(fix.w / 2.5)) : 2;
  const rows = 4;
  return Array.from({ length: cols * rows }, (_, idx) => {
    const r = Math.floor(idx / cols);
    const c = idx % cols;
    return {
      id:              `${fix.code}-S${String(idx+1).padStart(2,"0")}`,
      x:               c / cols,
      y:               r / rows,
      w:               1 / cols,
      h:               1 / rows,
      supplierName:    "",
      brandCategory:   "",
      negotiatedValue: 0,
      startDate:       "",
      endDate:         "",
      status:          "free" as SpaceStatus,
    };
  });
}

// ─── Business rule validation ─────────────────────────────────────────────────

function validatePlacement(
  def: FixtureDef,
  pos: {x:number; z:number},
  existing: PlacedFixture[],
): string | null {
  if (def.type === "ristra") {
    const gondolas = existing.filter(f => f.type === "gondola" || f.type === "punta");
    if (!gondolas.some(g => euclidean(pos.x, pos.z, g.x, g.z) < 4))
      return "⚠️ Una Ristra debe estar cerca de una Góndola";
  }
  if (def.type === "cross") {
    const gondolas = existing.filter(f => f.type === "gondola");
    if (!gondolas.some(g => euclidean(pos.x, pos.z, g.x, g.z) < 4))
      return "⚠️ Un Cross debe estar cerca de una Góndola";
  }
  if (def.type === "gondola" && def.gondolaType === "wall") {
    const margin = 3;
    const nearWall = pos.x < margin || pos.x > STORE_W - margin ||
                     pos.z < margin || pos.z > STORE_D - margin;
    if (!nearWall)
      return "⚠️ Góndola Mural recomendada cerca de una pared";
  }
  if (def.type === "columna") {
    // Columns are fine anywhere — no validation needed
  }
  return null;
}

// ─── MEJORA 2: AABB collision helpers ────────────────────────────────────────

function getAABB(x: number, z: number, w: number, d: number) {
  return { minX: x - w/2, maxX: x + w/2, minZ: z - d/2, maxZ: z + d/2 };
}

function hasAABBCollision(
  pos: {x:number; z:number},
  def: { w:number; d:number },
  existing: PlacedFixture[],
  excludeId?: string
): boolean {
  // TOL: 1 mm tolerance so that fixtures touching exactly at their boundary
  // (overlap = 0) don't falsely trigger due to IEEE-754 floating-point noise.
  // Only real overlaps (> 1 mm) are flagged.
  const TOL = 0.001;
  const a = getAABB(pos.x, pos.z, def.w, def.d);
  return existing
    .filter(f => f.id !== excludeId)
    .some(f => {
      const b = getAABB(f.x, f.z, f.w, f.d);
      return (
        a.minX < b.maxX - TOL && a.maxX > b.minX + TOL &&
        a.minZ < b.maxZ - TOL && a.maxZ > b.minZ + TOL
      );
    });
}

// ─── Mesh: Góndola (Double + Wall + Slots) ───────────────────────────────────

interface GondolaMeshProps {
  w: number; d: number; h: number;
  statusColor: string;
  ghost?:         boolean;
  gondolaType?:   GondolaType;
  facePaint?:     FacePaint | null;
  slots?:         ShelfSlot[];
  selectedSlotId?: string | null;
  hoveredSlotId?:  string | null;
  onSlotClick?:    (slotId: string) => void;
  onSlotHover?:    (slotId: string | null) => void;
}

const GondolaMesh = memo(function GondolaMesh({
  w, d, h, ghost,
  gondolaType = "double",
  facePaint,
  slots, selectedSlotId, hoveredSlotId,
  onSlotClick, onSlotHover,
}: GondolaMeshProps) {
  const op     = ghost ? 0.42 : 1;
  const isWall = gondolaType === "wall";

  const G_WHITE = "#e6e6e3";
  const G_FRAME = "#c8c8c5";
  const G_PANEL = isWall ? "#d5d5d2" : "#dcdcda";
  const G_RAIL  = "#b8b8b5";

  // Board layout mirrored by getPanelShelfSpan("gondola") — keep in sync.
  const { shelves, topH, shelfT } = useMemo(() => {
    const topH   = 0.08;
    const shelfT = 0.022;
    const n      = Math.max(4, Math.round((h - topH) / 0.38));
    const shelfYs = Array.from({ length: n }, (_, i) =>
      0.14 + i * ((h - topH - 0.16) / Math.max(n - 1, 1))
    );
    return { shelves: shelfYs, topH, shelfT };
  }, [h]);

  const slotAreaH  = h - topH - 0.06;
  const SLOT_PROTO = 0.12;
  const backT = isWall ? d * 0.42 : 0.055;
  // Wall gondola: solid back panel flush with rear face (goes against the wall).
  // Double gondola: thin center spine at z=0 so both faces are open (symmetric).
  const backPosZ = isWall ? d / 2 - backT / 2 : 0;

  // Painted panel materials: front (-Z) ← face A, back (+Z) ← face B (double
  // only). All remaining faces keep the plain panel color. The paint lives on
  // the gondola's OWN back/spine panel, so it inherits every transform.
  const panelMats = useMemo(() => {
    if (ghost || !facePaint || (!facePaint.front && !facePaint.back)) return null;
    return facePaintArray(
      getPlainLambert(G_PANEL),
      facePaint.front,
      isWall ? null : facePaint.back,
    );
  }, [ghost, facePaint, isWall, G_PANEL]);
  // No mid-posts — gondola modules only have structural uprights at each end,
  // not internal vertical dividers.
  const nMidPosts = 0;

  function renderSlotFace(faceSign: -1 | 1) {
    if (!slots || ghost || !onSlotClick) return null; // slots disabled → skip
    const panelZ = faceSign * (d / 2 + SLOT_PROTO);
    return slots.map(slot => {
      const sw    = slot.w * w - 0.04;
      const sh    = slot.h * slotAreaH - 0.025;
      const cx    = (slot.x + slot.w * 0.5) * w - w / 2;
      const cy    = 0.06 + (slot.y + slot.h * 0.5) * slotAreaH;
      const sc    = STATUS_COLORS[slot.status] ?? STATUS_COLORS.free;
      const isSel = slot.id === selectedSlotId;
      const isHov = slot.id === hoveredSlotId;
      return (
        <mesh
          key={`${faceSign}|${slot.id}`}
          position={[cx, cy, panelZ]}
          onClick={e  => { e.stopPropagation(); onSlotClick?.(slot.id); }}
          onPointerOver={e => { e.stopPropagation(); onSlotHover?.(slot.id); }}
          onPointerOut={e  => { e.stopPropagation(); onSlotHover?.(null); }}
        >
          <boxGeometry args={[Math.max(0.01, sw), Math.max(0.01, sh), 0.016]} />
          <meshStandardMaterial
            color={sc} transparent
            opacity={isSel ? 0.94 : isHov ? 0.80 : 0.72}
            emissive={sc}
            emissiveIntensity={isSel ? 0.35 : isHov ? 0.18 : 0}
            depthWrite={false}
          />
        </mesh>
      );
    });
  }

  return (
    <group>
      {/* Top light rail — centered for double gondola, front-offset for wall gondola */}
      <mesh position={[0, h + 0.045, isWall ? -(d * 0.08) : 0]} castShadow>
        <boxGeometry args={[w + 0.02, 0.065, 0.14]} />
        <meshStandardMaterial color="#f2f2f0" metalness={0.05} roughness={0.30} transparent opacity={op} />
      </mesh>

      {/* Back / wall panel — painted with face imagery when available */}
      {panelMats ? (
        <mesh position={[0, h / 2, backPosZ]} castShadow material={panelMats}>
          <boxGeometry args={[w, h, backT]} />
        </mesh>
      ) : (
        <mesh position={[0, h / 2, backPosZ]} castShadow>
          <boxGeometry args={[w, h, backT]} />
          <meshLambertMaterial color={G_PANEL} transparent opacity={op} />
        </mesh>
      )}

      {/* Shelf boards + price rails */}
      {shelves.map((sy, i) => (
        <group key={`sh${i}`}>
          <mesh position={[0, sy, 0]} castShadow>
            <boxGeometry args={[w - 0.055, shelfT, d - 0.015]} />
            <meshLambertMaterial color={G_WHITE} transparent opacity={op} />
          </mesh>
          <mesh position={[0, sy + shelfT * 0.5 + 0.019, -(d / 2 - 0.010)]} castShadow>
            <boxGeometry args={[w - 0.07, 0.038, 0.009]} />
            <meshLambertMaterial color={G_RAIL} transparent opacity={op} />
          </mesh>
          {!isWall && (
            <mesh position={[0, sy + shelfT * 0.5 + 0.019, d / 2 - 0.010]} castShadow>
              <boxGeometry args={[w - 0.07, 0.038, 0.009]} />
              <meshLambertMaterial color={G_RAIL} transparent opacity={op} />
            </mesh>
          )}
        </group>
      ))}

      {/* End-cap uprights.
          Wall gondola  → full-depth slab (the upright runs along the wall).
          Double gondola → thin post (≈ 5 cm × 5 cm cross-section) so adjacent
          modules don't create visible vertical dividers between them. */}
      {([-1, 1] as const).map(side => (
        <mesh key={`up${side}`} position={[side * (w / 2 - 0.026), h / 2, 0]} castShadow>
          <boxGeometry args={[0.052, h, isWall ? d : 0.058]} />
          <meshStandardMaterial color={G_FRAME} metalness={0.15} roughness={0.72} transparent opacity={op} />
        </mesh>
      ))}

      {/* Intermediate uprights */}
      {Array.from({ length: nMidPosts }, (_, i) => {
        const px = ((i + 1) / (nMidPosts + 1)) * w - w / 2;
        return (
          <mesh key={`mp${i}`} position={[px, h / 2, 0]} castShadow>
            <boxGeometry args={[0.038, h, d * 0.10]} />
            <meshStandardMaterial color={G_FRAME} metalness={0.15} roughness={0.72} transparent opacity={op} />
          </mesh>
        );
      })}

      {/* Corner base feet */}
      {isWall
        ? ([-1, 1] as const).map(sx => (
            <mesh key={`ft${sx}`} position={[sx * (w / 2 - 0.10), 0.055, 0]} castShadow>
              <boxGeometry args={[0.18, 0.11, d * 0.55]} />
              <meshLambertMaterial color={G_FRAME} transparent opacity={op} />
            </mesh>
          ))
        // Double gondola: two base feet centred on each side (matching the spine),
        // not four corner feet (which would visually close both end faces).
        : ([-1, 1] as const).map(sx => (
            <mesh key={`ft${sx}`}
              position={[sx * (w / 2 - 0.10), 0.055, 0]} castShadow>
              <boxGeometry args={[0.18, 0.11, d * 0.45]} />
              <meshLambertMaterial color={G_FRAME} transparent opacity={op} />
            </mesh>
          ))
      }

      {/* Slot panels */}
      {renderSlotFace(-1)}
      {!isWall && renderSlotFace(1)}
    </group>
  );
});

// ─── Mesh: Punta de Góndola ───────────────────────────────────────────────────

interface PuntaMeshProps {
  w: number; d: number; h: number;
  statusColor: string; ghost?: boolean;
  facePaint?: FacePaint | null;
  slots?: ShelfSlot[];
  selectedSlotId?: string | null;
  hoveredSlotId?:  string | null;
  onSlotClick?:    (slotId: string) => void;
  onSlotHover?:    (slotId: string | null) => void;
}

function PuntaMesh({ w, d, h, ghost, facePaint, slots, selectedSlotId, hoveredSlotId, onSlotClick, onSlotHover }: PuntaMeshProps) {
  const op      = ghost ? 0.42 : 1;
  // Board layout mirrored by getPanelShelfSpan("punta") — keep in sync.
  const topperH = 0.36;              // promotional header height
  const bodyH   = h - topperH;
  const nShelves = Math.max(3, Math.round(bodyH / 0.38));
  const slotAreaH = bodyH - 0.08;
  const panelZ  = -(d / 2 + 0.10);  // slot projection forward

  const G_WHITE = "#efefed";
  const G_FRAME = "#c0c0bc";
  const G_BACK  = "#d8d8d5";

  const plateMats = useMemo(() => {
    if (ghost || !facePaint?.front) return null;
    return facePaintArray(getPlainLambert(G_BACK), facePaint.front, null);
  }, [ghost, facePaint, G_BACK]);

  return (
    <group>
      {/* Structural back plate (faces the gondola) — front (-Z) face painted */}
      {plateMats ? (
        <mesh position={[0, bodyH / 2, d * 0.40]} castShadow material={plateMats}>
          <boxGeometry args={[w, bodyH, d * 0.22]} />
        </mesh>
      ) : (
        <mesh position={[0, bodyH / 2, d * 0.40]} castShadow>
          <boxGeometry args={[w, bodyH, d * 0.22]} />
          <meshLambertMaterial color={G_BACK} transparent opacity={op} />
        </mesh>
      )}

      {/* Left & right uprights */}
      {([-1, 1] as const).map(side => (
        <mesh key={side} position={[side * (w / 2 - 0.025), bodyH / 2, 0]} castShadow>
          <boxGeometry args={[0.050, bodyH, d]} />
          <meshStandardMaterial color={G_FRAME} metalness={0.18} roughness={0.70} transparent opacity={op} />
        </mesh>
      ))}

      {/* Shelf boards — angled slightly toward viewer */}
      {Array.from({ length: nShelves }, (_, i) => {
        const sy = 0.12 + (i + 1) * (bodyH - 0.16) / (nShelves + 1);
        return (
          <group key={i} rotation={[-0.08, 0, 0]}>
            <mesh position={[0, sy, 0]} castShadow>
              <boxGeometry args={[w - 0.055, 0.022, d - 0.01]} />
              <meshLambertMaterial color={G_WHITE} transparent opacity={op} />
            </mesh>
            {/* Front price rail */}
            <mesh position={[0, sy + 0.030, -(d / 2 - 0.008)]}>
              <boxGeometry args={[w - 0.06, 0.036, 0.007]} />
              <meshLambertMaterial color="#b0b0ad" transparent opacity={op} />
            </mesh>
          </group>
        );
      })}

      {/* Promotional topper — dark frame + white face */}
      <mesh position={[0, bodyH + topperH / 2, 0]} castShadow>
        <boxGeometry args={[w + 0.10, topperH, d * 0.09]} />
        <meshStandardMaterial color="#2e2e2c" metalness={0.30} roughness={0.55} transparent opacity={op} />
      </mesh>
      {/* White printable face */}
      <mesh position={[0, bodyH + topperH / 2, -(d * 0.045 + 0.004)]}>
        <boxGeometry args={[w + 0.02, topperH * 0.80, 0.006]} />
        <meshLambertMaterial color="#f8f8f6" transparent opacity={op} />
      </mesh>
      {/* Top light bar */}
      <mesh position={[0, bodyH + topperH + 0.030, -(d * 0.04)]}>
        <boxGeometry args={[w + 0.04, 0.050, 0.100]} />
        <meshStandardMaterial color="#eeeeed" metalness={0.08} roughness={0.25} transparent opacity={op} />
      </mesh>

      {/* Corner feet */}
      {([-1, 1] as const).map(sx => (
        <mesh key={`ft${sx}`} position={[sx * (w / 2 - 0.09), 0.045, 0]} castShadow>
          <boxGeometry args={[0.16, 0.090, d * 0.60]} />
          <meshLambertMaterial color={G_FRAME} transparent opacity={op} />
        </mesh>
      ))}

      {/* Slot panels (same as GondolaMesh pattern) — disabled when onSlotClick is absent */}
      {!ghost && !!onSlotClick && slots?.map(slot => {
        const sw    = slot.w * w - 0.04;
        const sh    = slot.h * slotAreaH - 0.025;
        const cx    = (slot.x + slot.w * 0.5) * w - w / 2;
        const cy    = 0.06 + (slot.y + slot.h * 0.5) * slotAreaH;
        const sc    = STATUS_COLORS[slot.status] ?? STATUS_COLORS.free;
        const isSel = slot.id === selectedSlotId;
        const isHov = slot.id === hoveredSlotId;
        return (
          <mesh key={slot.id} position={[cx, cy, panelZ]}
            onClick={e => { e.stopPropagation(); onSlotClick?.(slot.id); }}
            onPointerOver={e => { e.stopPropagation(); onSlotHover?.(slot.id); }}
            onPointerOut={e  => { e.stopPropagation(); onSlotHover?.(null); }}>
            <boxGeometry args={[Math.max(0.01, sw), Math.max(0.01, sh), 0.014]} />
            <meshStandardMaterial color={sc} transparent
              opacity={isSel ? 0.94 : isHov ? 0.80 : 0.72}
              emissive={sc} emissiveIntensity={isSel ? 0.35 : isHov ? 0.18 : 0}
              depthWrite={false} />
          </mesh>
        );
      })}
    </group>
  );
}

// ─── Mesh: Robatope ───────────────────────────────────────────────────────────

// ─── Mesh: Robatope ───────────────────────────────────────────────────────────
// Panel lateral que flanquea la Punta de Góndola.
// Comparte el mismo lenguaje visual (uprights, shelves, pies, colores) para
// que al colocarlo junto a la Punta forme una unidad coherente.
// Dimensiones: w=0.30 (ancho panel), d=0.40 (= profundidad Punta → encaja ras)

function RobatopeMesh({ w, d, h, statusColor, ghost, facePaint }: { w:number;d:number;h:number;statusColor:string;ghost?:boolean;facePaint?:FacePaint|null }) {
  const op      = ghost ? 0.42 : 1;
  // Board layout mirrored by getPanelShelfSpan("robatope") — keep in sync.
  const capH    = 0.055;                 // thin dark cap at top (no promotional topper)
  const bodyH   = h - capH;
  const nShelves = Math.max(2, Math.round(bodyH / 0.40));

  // Mismo paleta de colores que PuntaMesh → coherencia visual garantizada
  const G_WHITE = "#efefed";
  const G_FRAME = "#c0c0bc";
  const G_BACK  = "#d8d8d5";

  const panelMats = useMemo(() => {
    if (ghost || !facePaint?.front) return null;
    return facePaintArray(getPlainLambert(G_BACK), facePaint.front, null);
  }, [ghost, facePaint, G_BACK]);

  return (
    <group>
      {/* Back structural panel (faces the gondola aisle) — front face painted */}
      {panelMats ? (
        <mesh position={[0, bodyH / 2, d * 0.40]} castShadow material={panelMats}>
          <boxGeometry args={[w, bodyH, d * 0.20]} />
        </mesh>
      ) : (
        <mesh position={[0, bodyH / 2, d * 0.40]} castShadow>
          <boxGeometry args={[w, bodyH, d * 0.20]} />
          <meshLambertMaterial color={G_BACK} transparent opacity={op} />
        </mesh>
      )}

      {/* Left & right uprights — identical profile to PuntaMesh */}
      {([-1, 1] as const).map(side => (
        <mesh key={side} position={[side * (w / 2 - 0.025), bodyH / 2, 0]} castShadow>
          <boxGeometry args={[0.050, bodyH, d]} />
          <meshStandardMaterial color={G_FRAME} metalness={0.18} roughness={0.70} transparent opacity={op} />
        </mesh>
      ))}

      {/* Shelf boards + front price rails */}
      {Array.from({ length: nShelves }, (_, i) => {
        const sy = 0.12 + (i + 1) * (bodyH - 0.16) / (nShelves + 1);
        return (
          <group key={i} rotation={[-0.06, 0, 0]}>
            <mesh position={[0, sy, 0]} castShadow>
              <boxGeometry args={[w - 0.055, 0.022, d - 0.01]} />
              <meshLambertMaterial color={G_WHITE} transparent opacity={op} />
            </mesh>
            <mesh position={[0, sy + 0.030, -(d / 2 - 0.008)]}>
              <boxGeometry args={[w - 0.06, 0.036, 0.007]} />
              <meshLambertMaterial color="#b0b0ad" transparent opacity={op} />
            </mesh>
          </group>
        );
      })}

      {/* Thin dark cap at top — same dark trim as Punta topper frame */}
      <mesh position={[0, bodyH + capH / 2, 0]} castShadow>
        <boxGeometry args={[w + 0.08, capH, d + 0.04]} />
        <meshStandardMaterial color="#2e2e2c" metalness={0.30} roughness={0.55} transparent opacity={op} />
      </mesh>

      {/* Corner feet — same style as PuntaMesh */}
      {([-1, 1] as const).map(sx => (
        <mesh key={`ft${sx}`} position={[sx * (w / 2 - 0.06), 0.045, 0]} castShadow>
          <boxGeometry args={[0.10, 0.090, d * 0.60]} />
          <meshLambertMaterial color={G_FRAME} transparent opacity={op} />
        </mesh>
      ))}

      {/* Status indicator strip on front face */}
      <mesh position={[0, bodyH * 0.90, -(d / 2 + 0.006)]}>
        <boxGeometry args={[w * 0.70, 0.040, 0.010]} />
        <meshLambertMaterial color={statusColor} transparent opacity={0.88 * op} />
      </mesh>
    </group>
  );
}

// ─── Mesh: Ristra ─────────────────────────────────────────────────────────────

function RistraMesh({ w, d, h, statusColor, ghost }: { w:number;d:number;h:number;statusColor:string;ghost?:boolean }) {
  const op     = ghost ? 0.42 : 1;
  const RAIL   = "#8a8a88";
  const HOOK   = "#9e9e9c";
  const nHooks = Math.max(4, Math.round(h / 0.28));
  const sp     = (h - 0.10) / nHooks;

  return (
    <group>
      <mesh position={[0, h + 0.03, 0]} castShadow>
        <boxGeometry args={[w * 0.55, 0.06, 0.04]} />
        <meshStandardMaterial color={RAIL} metalness={0.65} roughness={0.30} transparent opacity={op} />
      </mesh>

      <mesh position={[0, h / 2, 0]} castShadow>
        <boxGeometry args={[0.028, h, 0.012]} />
        <meshStandardMaterial color={RAIL} metalness={0.65} roughness={0.28} transparent opacity={op} />
      </mesh>
      {w > 0.12 && (
        <mesh position={[0, h / 2, 0]}>
          <boxGeometry args={[w * 0.70, h, 0.006]} />
          <meshStandardMaterial color={RAIL} metalness={0.55} roughness={0.35} transparent opacity={0.35 * op} />
        </mesh>
      )}

      {Array.from({ length: nHooks }, (_, i) => {
        const py = h - 0.08 - i * sp;
        return (
          <group key={i} position={[0, py, 0]}>
            <mesh position={[0, 0, -d * 0.28]} castShadow>
              <boxGeometry args={[w * 0.82, 0.010, d * 0.55]} />
              <meshStandardMaterial color={HOOK} metalness={0.60} roughness={0.32} transparent opacity={op} />
            </mesh>
            <mesh position={[0, -0.018, -d * 0.50]}>
              <boxGeometry args={[w * 0.70, 0.030, 0.006]} />
              <meshLambertMaterial color="#f0f0ee" transparent opacity={0.88 * op} />
            </mesh>
            <mesh position={[(w * 0.28), -0.018, -d * 0.50]}>
              <boxGeometry args={[0.018, 0.018, 0.008]} />
              <meshLambertMaterial color={statusColor} transparent opacity={0.80 * op} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

// ─── Mesh: Cross ──────────────────────────────────────────────────────────────

function CrossMesh({ w, d, h, statusColor, ghost }: { w:number;d:number;h:number;statusColor:string;ghost?:boolean }) {
  const op      = ghost ? 0.42 : 1;
  // Lifted from near-black to dark espresso so the fixture doesn't vanish on a light background
  const DARK    = "#2c2c2a";
  const SHELF_C = "#3a3a37";
  const nLevels = Math.max(4, Math.round(h / 0.36));

  return (
    <group>
      {/* Side uprights — wider so they're visible */}
      {([-1, 1] as const).map(side => (
        <mesh key={side} position={[side * (w / 2 - 0.032), h / 2, 0]} castShadow>
          <boxGeometry args={[0.060, h, d]} />
          <meshStandardMaterial color={DARK} metalness={0.60} roughness={0.35}
            transparent={ghost} opacity={op} />
        </mesh>
      ))}

      {Array.from({ length: nLevels }, (_, i) => {
        const py = 0.10 + i * ((h - 0.12) / Math.max(nLevels - 1, 1));
        return (
          <group key={i} position={[0, py, 0]} rotation={[-0.09, 0, 0]}>
            {/* Shelf surface — slightly thicker */}
            <mesh castShadow>
              <boxGeometry args={[w - 0.068, 0.026, d - 0.04]} />
              <meshStandardMaterial color={SHELF_C} metalness={0.50} roughness={0.40}
                transparent={ghost} opacity={op} />
            </mesh>
            {/* Front label panel */}
            <mesh position={[0, 0.032, -(d / 2 - 0.020)]}>
              <boxGeometry args={[w - 0.06, 0.062, 0.013]} />
              <meshStandardMaterial color={DARK} metalness={0.55} roughness={0.35}
                transparent={ghost} opacity={op} />
            </mesh>
            {/* Status color strip inside front panel */}
            <mesh position={[0, 0.032, -(d / 2 - 0.040)]}>
              <boxGeometry args={[w * 0.60, 0.024, 0.009]} />
              <meshLambertMaterial color={statusColor} transparent opacity={0.70 * op} />
            </mesh>
          </group>
        );
      })}

      {/* Feet */}
      {([-1, 1] as const).map(sx => (
        <mesh key={`ft${sx}`} position={[sx * (w / 2 - 0.055), 0.052, 0]}>
          <boxGeometry args={[0.065, 0.104, d * 0.60]} />
          <meshStandardMaterial color={DARK} metalness={0.55} roughness={0.40}
            transparent={ghost} opacity={op} />
        </mesh>
      ))}
    </group>
  );
}

// ─── Mesh: Metro cuadrado ─────────────────────────────────────────────────────

function MetroMesh({ w, d, h, statusColor, ghost }: { w:number;d:number;h:number;statusColor:string;ghost?:boolean }) {
  const op       = ghost ? 0.42 : 1;
  const BODY     = "#e6e6e3";
  const FR       = "#c8c8c5";
  const RAIL     = "#b8b8b5";
  const nShelves = Math.max(3, Math.round(h / 0.40));
  const shelfYs  = Array.from({ length: nShelves }, (_, i) =>
    0.16 + i * ((h - 0.20) / Math.max(nShelves - 1, 1)));

  const faces: { ax: 'x'|'z'; sg: -1|1 }[] = [
    { ax:'z', sg:-1 }, { ax:'z', sg: 1 },
    { ax:'x', sg:-1 }, { ax:'x', sg: 1 },
  ];

  return (
    <group>
      {/* Central spine */}
      <mesh position={[0, h / 2, 0]} castShadow>
        <boxGeometry args={[w * 0.22, h, d * 0.22]} />
        <meshLambertMaterial color="#dcdcda" transparent opacity={op} />
      </mesh>

      {/* 4 corner uprights */}
      {([-1,1] as const).flatMap(sx => ([-1,1] as const).map(sz => (
        <mesh key={`u${sx}${sz}`} position={[sx*(w/2-0.03), h/2, sz*(d/2-0.03)]} castShadow>
          <boxGeometry args={[0.05, h, 0.05]} />
          <meshStandardMaterial color={FR} metalness={0.18} roughness={0.70}
            transparent opacity={op} />
        </mesh>
      )))}

      {/* Per-face: back panel + shelves + price rail */}
      {faces.map(({ ax, sg }) => {
        const half = ax==='z' ? d/2 : w/2;
        const fw   = ax==='z' ? w   : d;
        const px   = ax==='x' ? sg*half*0.92 : 0;
        const pz   = ax==='z' ? sg*half*0.92 : 0;
        const shPx = ax==='x' ? sg*half*0.68 : 0;
        const shPz = ax==='z' ? sg*half*0.68 : 0;
        return (
          <group key={`${ax}${sg}`}>
            {/* Back panel */}
            <mesh position={[px, h/2, pz]} castShadow>
              <boxGeometry args={[ax==='z'?fw-0.04:0.032, h, ax==='z'?0.032:fw-0.04]} />
              <meshLambertMaterial color={BODY} transparent opacity={op} />
            </mesh>
            {/* Shelves */}
            {shelfYs.map((sy, i) => (
              <group key={i}>
                <mesh position={[shPx, sy, shPz]} castShadow>
                  <boxGeometry args={[ax==='z'?fw-0.08:half*0.52, 0.020, ax==='z'?half*0.52:fw-0.08]} />
                  <meshLambertMaterial color={BODY} transparent opacity={op} />
                </mesh>
                {/* Price rail */}
                <mesh position={[
                  ax==='x' ? sg*(half-0.015) : shPx,
                  sy + 0.030,
                  ax==='z' ? sg*(half-0.015) : shPz,
                ]}>
                  <boxGeometry args={[ax==='z'?fw-0.10:0.009, 0.036, ax==='z'?0.009:fw-0.10]} />
                  <meshLambertMaterial color={RAIL} transparent opacity={op} />
                </mesh>
              </group>
            ))}
          </group>
        );
      })}

      {/* Corner feet */}
      {([-1,1] as const).flatMap(sx => ([-1,1] as const).map(sz => (
        <mesh key={`f${sx}${sz}`} position={[sx*(w/2-0.08), 0.05, sz*(d/2-0.08)]} castShadow>
          <boxGeometry args={[0.14, 0.10, 0.14]} />
          <meshLambertMaterial color={FR} transparent opacity={op} />
        </mesh>
      )))}

      {/* Status indicator: thin top band only */}
      <mesh position={[0, h - 0.03, 0]}>
        <boxGeometry args={[w * 0.94, 0.05, d * 0.94]} />
        <meshLambertMaterial color={statusColor} transparent opacity={0.88 * op} />
      </mesh>
    </group>
  );
}

// ─── Mesh: Mueble ─────────────────────────────────────────────────────────────

function MuebleMesh({ w, d, h, statusColor, ghost, facePaint }: { w:number;d:number;h:number;statusColor:string;ghost?:boolean;facePaint?:FacePaint|null }) {
  const op        = ghost ? 0.42 : 1;
  // Board layout mirrored by getPanelShelfSpan("mueble") — keep in sync.
  const baseH     = Math.min(h * 0.22, 0.40);   // solid plinth
  const doorH     = h - baseH;
  const nShelves  = Math.max(2, Math.round(doorH / 0.38));
  const nDoors    = Math.max(1, Math.round(w / 0.60));
  const doorW     = w / nDoors;
  const METAL     = "#6b7280";
  const METAL_L   = "#9ca3af";
  const GLASS_C   = "#bae6fd";

  return (
    <group>
      {/* Plinth / base cabinet */}
      <mesh position={[0, baseH / 2, 0]} castShadow>
        <boxGeometry args={[w, baseH, d]} />
        <meshStandardMaterial color={METAL} metalness={0.35} roughness={0.55} transparent opacity={op} />
      </mesh>
      {/* Kick plate recess */}
      <mesh position={[0, 0.055, -(d / 2 - 0.010)]}>
        <boxGeometry args={[w - 0.04, 0.100, 0.012]} />
        <meshStandardMaterial color="#374151" metalness={0.40} roughness={0.50} transparent opacity={op} />
      </mesh>

      {/* Outer frame — left/right uprights + top/bottom rails */}
      {([-1, 1] as const).map(side => (
        <mesh key={side} position={[side * (w / 2 - 0.018), baseH + doorH / 2, 0]} castShadow>
          <boxGeometry args={[0.036, doorH, d]} />
          <meshStandardMaterial color={METAL} metalness={0.35} roughness={0.50} transparent opacity={op} />
        </mesh>
      ))}
      {/* Top rail */}
      <mesh position={[0, baseH + doorH - 0.018, 0]} castShadow>
        <boxGeometry args={[w, 0.036, d]} />
        <meshStandardMaterial color={METAL} metalness={0.35} roughness={0.50} transparent opacity={op} />
      </mesh>

      {/* Glass door panels */}
      {Array.from({ length: nDoors }, (_, i) => {
        const dx = (i + 0.5) * doorW - w / 2;
        return (
          <group key={i}>
            {/* Glass pane */}
            <mesh position={[dx, baseH + doorH / 2, -(d / 2 - 0.018)]}>
              <boxGeometry args={[doorW - 0.010, doorH - 0.036, 0.008]} />
              <meshStandardMaterial color={GLASS_C} roughness={0.04} metalness={0.02}
                transparent opacity={0.22 * op} />
            </mesh>
            {/* Door divider rail */}
            {i > 0 && (
              <mesh position={[dx - doorW / 2, baseH + doorH / 2, -(d / 2 - 0.018)]}>
                <boxGeometry args={[0.018, doorH, 0.018]} />
                <meshStandardMaterial color={METAL} metalness={0.35} roughness={0.50} transparent opacity={op} />
              </mesh>
            )}
            {/* Door handle */}
            <mesh position={[dx - doorW * 0.28, baseH + doorH * 0.48, -(d / 2 - 0.034)]}>
              <boxGeometry args={[0.012, 0.120, 0.010]} />
              <meshStandardMaterial color={METAL_L} metalness={0.60} roughness={0.25} transparent opacity={op} />
            </mesh>
          </group>
        );
      })}

      {/* Internal shelves (visible through glass) */}
      {Array.from({ length: nShelves }, (_, i) => {
        const sy = baseH + 0.10 + i * ((doorH - 0.12) / Math.max(nShelves - 1, 1));
        return (
          <mesh key={i} position={[0, sy, 0]} castShadow>
            <boxGeometry args={[w - 0.042, 0.014, d - 0.042]} />
            <meshLambertMaterial color="#e8e8e5" transparent opacity={0.90 * op} />
          </mesh>
        );
      })}

      {/* Back panel (inside) — front (-Z) face painted, visible through glass */}
      {!ghost && facePaint?.front ? (
        <mesh
          position={[0, baseH + doorH / 2, d / 2 - 0.020]}
          material={facePaintArray(getPlainLambert("#f0f0ee"), facePaint.front, null)}
        >
          <boxGeometry args={[w - 0.036, doorH - 0.036, 0.018]} />
        </mesh>
      ) : (
        <mesh position={[0, baseH + doorH / 2, d / 2 - 0.020]}>
          <boxGeometry args={[w - 0.036, doorH - 0.036, 0.018]} />
          <meshLambertMaterial color="#f0f0ee" transparent opacity={op} />
        </mesh>
      )}

      {/* Internal LED lighting strip (top) */}
      <mesh position={[0, baseH + doorH - 0.055, 0]}>
        <boxGeometry args={[w - 0.040, 0.018, d - 0.040]} />
        <meshStandardMaterial color="#fffde7" emissive="#fffde7" emissiveIntensity={0.30}
          transparent opacity={0.70 * op} />
      </mesh>

      {/* Status indicator on base front */}
      <mesh position={[0, 0.090, -(d / 2 + 0.008)]}>
        <boxGeometry args={[w * 0.75, 0.048, 0.012]} />
        <meshLambertMaterial color={statusColor} transparent opacity={0.88 * op} />
      </mesh>
    </group>
  );
}

// ─── Mesh: Exhibición de Piso ─────────────────────────────────────────────────
// Stepped promotional floor display — cardboard base boxes + product rows per level,
// narrowing like stairs as it goes up. Front price card at bottom.

function IslaMesh({ w, d, h, statusColor, ghost }: { w:number;d:number;h:number;statusColor:string;ghost?:boolean }) {
  const op       = ghost ? 0.42 : 1;
  const CBOARD   = "#d4a96e";   // cardboard box color
  const CBOARD_D = "#b8894e";   // darker edge
  const nLevels  = Math.max(2, Math.min(4, Math.round(h / 0.38)));
  const levelH   = h / nLevels;
  const PROD_C   = ["#1d4ed8","#dc2626","#16a34a","#d97706","#7c3aed","#0891b2"];

  return (
    <group>
      {Array.from({ length: nLevels }, (_, li) => {
        // Each level narrows by ~15% per step (bottom widest)
        const factor = 1 - li * 0.15;
        const lw = w * factor;
        const ld = d * factor;
        const baseY = li * levelH;
        // Cardboard base box for this level
        const boxH = 0.14;
        // Number of product columns on this level
        const nCols = Math.max(2, Math.floor((lw - 0.06) / 0.16));
        const prodH  = levelH - boxH - 0.02;
        const isBottle = li % 2 === 0;

        return (
          <group key={li}>
            {/* Cardboard base box */}
            <mesh position={[0, baseY + boxH/2, 0]} castShadow>
              <boxGeometry args={[lw, boxH, ld]} />
              <meshLambertMaterial color={li === 0 ? CBOARD_D : CBOARD} transparent opacity={op} />
            </mesh>
            {/* Front face of cardboard box (brand label area) */}
            <mesh position={[0, baseY + boxH*0.50, -(ld/2 - 0.004)]}>
              <boxGeometry args={[lw - 0.01, boxH * 0.80, 0.006]} />
              <meshLambertMaterial color={PROD_C[li % PROD_C.length]} transparent opacity={0.55 * op} />
            </mesh>

            {/* Products sitting on the cardboard box */}
            {Array.from({ length: nCols }, (_, ci) => {
              const px = -lw/2 + 0.04 + ci * (lw - 0.04) / nCols + (lw-0.04)/nCols/2;
              const col = PROD_C[(ci + li) % PROD_C.length];
              const cy  = baseY + boxH + (isBottle ? prodH*0.48 : prodH*0.38);
              return isBottle ? (
                <mesh key={ci} position={[px, cy, 0]} castShadow>
                  <cylinderGeometry args={[0.042, 0.047, prodH * 0.85, 8]} />
                  <meshStandardMaterial color={col} roughness={0.18} metalness={0.04}
                    transparent opacity={0.90 * op} />
                </mesh>
              ) : (
                <mesh key={ci} position={[px, cy, 0]} castShadow>
                  <boxGeometry args={[0.13, prodH * 0.72, ld * 0.78]} />
                  <meshLambertMaterial color={col} transparent opacity={0.88 * op} />
                </mesh>
              );
            })}
          </group>
        );
      })}

      {/* Front price card (bottom level) */}
      <mesh position={[0, 0.18, -(d * 0.5 * 1.0 + 0.006)]}>
        <boxGeometry args={[Math.min(0.30, w * 0.42), 0.11, 0.006]} />
        <meshLambertMaterial color="#ffffff" transparent opacity={0.92 * op} />
      </mesh>
      <mesh position={[0, 0.18, -(d * 0.5 + 0.010)]}>
        <boxGeometry args={[Math.min(0.28, w * 0.38), 0.065, 0.004]} />
        <meshLambertMaterial color="#1e293b" transparent opacity={0.85 * op} />
      </mesh>

      {/* Status indicator */}
      <mesh position={[0, 0.035, -(d/2 + 0.006)]}>
        <boxGeometry args={[w * 0.60, 0.025, 0.008]} />
        <meshLambertMaterial color={statusColor} transparent opacity={0.85 * op} />
      </mesh>
    </group>
  );
}

// ─── Mesh: Impulsador de Marca ────────────────────────────────────────────────
// Narrow central spine + cantilevered shelves (wider than spine) + mushroom topper.
// Inspired by Nestlé Fitness / brand impulse floor display style.

function ImpulsadorMesh({ w, d, h, statusColor, ghost }: { w:number;d:number;h:number;statusColor:string;ghost?:boolean }) {
  const op      = ghost ? 0.42 : 1;
  const WHITE   = "#f0f0ef";
  const LIGHT   = "#e2e8f0";
  const SPINE_W = Math.min(0.10, w * 0.18);   // narrow central column
  const SPINE_D = d * 0.55;
  const topperH = 0.24;
  const baseH   = 0.10;
  const bodyH   = h - topperH - baseH;
  const nShelves = Math.max(3, Math.round(bodyH / 0.30));
  const shelfGap = bodyH / (nShelves - 1);
  // Shelves protrude beyond spine — full fixture width
  const PROD_C   = ["#dc2626","#1d4ed8","#16a34a","#d97706","#7c3aed"];

  return (
    <group>
      {/* Wedge base — wider than spine, smaller than shelves */}
      <mesh position={[0, baseH/2, 0]} castShadow>
        <boxGeometry args={[w * 0.65, baseH, d * 0.70]} />
        <meshStandardMaterial color={LIGHT} roughness={0.75} transparent opacity={op} />
      </mesh>

      {/* Central back spine — full height column */}
      <mesh position={[0, h/2, SPINE_D * 0.25]} castShadow>
        <boxGeometry args={[SPINE_W, h, SPINE_D]} />
        <meshStandardMaterial color={WHITE} roughness={0.70} transparent opacity={op} />
      </mesh>
      {/* Brand color stripe on spine front */}
      <mesh position={[0, h * 0.45, -(SPINE_D * 0.25) + 0.004]}>
        <boxGeometry args={[SPINE_W * 0.70, h * 0.55, 0.006]} />
        <meshLambertMaterial color={statusColor} transparent opacity={0.85 * op} />
      </mesh>
      {/* Round brand medallion on spine side */}
      <mesh position={[SPINE_W/2 + 0.006, h * 0.42, SPINE_D * 0.10]}
        rotation={[0, Math.PI/2, 0]}>
        <cylinderGeometry args={[0.065, 0.065, 0.010, 20]} />
        <meshStandardMaterial color={statusColor} roughness={0.50} transparent opacity={op} />
      </mesh>
      <mesh position={[SPINE_W/2 + 0.010, h * 0.42, SPINE_D * 0.10]}
        rotation={[0, Math.PI/2, 0]}>
        <cylinderGeometry args={[0.050, 0.050, 0.008, 20]} />
        <meshStandardMaterial color="#ffffff" roughness={0.70} transparent opacity={0.88 * op} />
      </mesh>

      {/* Cantilevered shelves — much wider than spine, angled slightly up */}
      {Array.from({ length: nShelves }, (_, si) => {
        const sy  = baseH + si * shelfGap;
        const col = PROD_C[si % PROD_C.length];
        return (
          <group key={si} rotation={[0.035, 0, 0]}>    {/* slight upward tilt */}
            {/* Shelf board */}
            <mesh position={[0, sy, 0]} castShadow>
              <boxGeometry args={[w, 0.018, d]} />
              <meshStandardMaterial color={LIGHT} roughness={0.65} transparent opacity={op} />
            </mesh>
            {/* Front lip / price strip */}
            <mesh position={[0, sy + 0.030, -(d/2 - 0.006)]}>
              <boxGeometry args={[w, 0.050, 0.008]} />
              <meshLambertMaterial color={WHITE} transparent opacity={op} />
            </mesh>
            {/* Product stack on shelf (only non-top shelves) */}
            {si < nShelves - 1 && (
              <mesh position={[0, sy + 0.080, 0]} castShadow>
                <boxGeometry args={[w * 0.88, 0.135, d * 0.82]} />
                <meshLambertMaterial color={col} transparent opacity={0.86 * op} />
              </mesh>
            )}
          </group>
        );
      })}

      {/* Mushroom topper — wide flat panel cantilevered above spine */}
      {/* Back brace from spine up to topper */}
      <mesh position={[0, h - topperH * 0.30, SPINE_D * 0.10]} castShadow>
        <boxGeometry args={[w * 1.05, topperH, 0.018]} />
        <meshStandardMaterial color={statusColor} roughness={0.60} transparent opacity={op} />
      </mesh>
      {/* Topper front face (white brand label) */}
      <mesh position={[0, h - topperH * 0.30, -(d/2 - 0.008) + 0.005]}>
        <boxGeometry args={[w * 0.92, topperH * 0.72, 0.008]} />
        <meshStandardMaterial color="#ffffff" roughness={0.80} transparent opacity={0.88 * op} />
      </mesh>
      {/* Topper top cap */}
      <mesh position={[0, h - 0.010, SPINE_D * 0.10]} castShadow>
        <boxGeometry args={[w * 1.05, 0.018, d * 0.60]} />
        <meshStandardMaterial color={LIGHT} roughness={0.65} transparent opacity={op} />
      </mesh>

      {/* Status strip front */}
      <mesh position={[0, 0.035, -(d/2 + 0.005)]}>
        <boxGeometry args={[w * 0.70, 0.022, 0.007]} />
        <meshLambertMaterial color={statusColor} transparent opacity={0.88 * op} />
      </mesh>
    </group>
  );
}

// ─── Mesh: Batea ──────────────────────────────────────────────────────────────

function BateaMesh({ w, d, h, statusColor, ghost }: { w:number;d:number;h:number;statusColor:string;ghost?:boolean }) {
  const op    = ghost ? 0.42 : 1;
  const WIRE  = "#6b7280";
  const WHEEL = "#374151";
  const wheelR = 0.045;

  return (
    <group>
      {/* Wheels (4 corners) */}
      {([-1, 1] as const).flatMap(sx =>
        ([-1, 1] as const).map(sz => (
          <mesh key={`w${sx}${sz}`} position={[sx * (w / 2 - 0.08), wheelR, sz * (d / 2 - 0.06)]}
            rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[wheelR, wheelR, 0.030, 12]} />
            <meshStandardMaterial color={WHEEL} metalness={0.50} roughness={0.40} transparent opacity={op} />
          </mesh>
        ))
      )}

      {/* Bottom frame */}
      <mesh position={[0, wheelR * 2 + 0.020, 0]} castShadow>
        <boxGeometry args={[w, 0.030, d]} />
        <meshStandardMaterial color={WIRE} metalness={0.45} roughness={0.45} transparent opacity={op} />
      </mesh>

      {/* 4 corner uprights */}
      {([-1, 1] as const).flatMap(sx =>
        ([-1, 1] as const).map(sz => (
          <mesh key={`u${sx}${sz}`} position={[sx * (w / 2 - 0.018), h / 2 + wheelR, sz * (d / 2 - 0.018)]} castShadow>
            <boxGeometry args={[0.022, h, 0.022]} />
            <meshStandardMaterial color={WIRE} metalness={0.45} roughness={0.45} transparent opacity={op} />
          </mesh>
        ))
      )}

      {/* Wire mesh sides — represented by thin horizontal rails */}
      {[0.25, 0.50, 0.75, 1.00].map((t, ri) => {
        const ry = wheelR * 2 + t * h;
        const sideW = w - 0.036;
        const sideD = d - 0.036;
        return (
          <group key={ri}>
            <mesh position={[0, ry, -(d / 2 - 0.018)]} castShadow>
              <boxGeometry args={[sideW, 0.012, 0.012]} />
              <meshStandardMaterial color={WIRE} metalness={0.45} roughness={0.45} transparent opacity={op} />
            </mesh>
            <mesh position={[0, ry, (d / 2 - 0.018)]} castShadow>
              <boxGeometry args={[sideW, 0.012, 0.012]} />
              <meshStandardMaterial color={WIRE} metalness={0.45} roughness={0.45} transparent opacity={op} />
            </mesh>
            <mesh position={[-(w / 2 - 0.018), ry, 0]} castShadow>
              <boxGeometry args={[0.012, 0.012, sideD]} />
              <meshStandardMaterial color={WIRE} metalness={0.45} roughness={0.45} transparent opacity={op} />
            </mesh>
            <mesh position={[(w / 2 - 0.018), ry, 0]} castShadow>
              <boxGeometry args={[0.012, 0.012, sideD]} />
              <meshStandardMaterial color={WIRE} metalness={0.45} roughness={0.45} transparent opacity={op} />
            </mesh>
          </group>
        );
      })}

      {/* Status indicator on front rail top */}
      <mesh position={[0, wheelR * 2 + h - 0.02, -(d / 2 - 0.02)]}>
        <boxGeometry args={[w * 0.60, 0.024, 0.014]} />
        <meshLambertMaterial color={statusColor} transparent opacity={0.88 * op} />
      </mesh>
    </group>
  );
}

// ─── Mesh: Nevera Mural ───────────────────────────────────────────────────────
// Branded glass-door refrigerator: dark body, large topper, wheels, cans & bottles
// visible on wire shelves through semi-transparent glass doors.

// ─── Mesh: Isla Fría / Helados ────────────────────────────────────────────────
// Isla abierta refrigerada (tipo supermercado): cuerpo blanco con sección
// inferior oscura de compresor, rejillas perimetrales y guarda de acrílico.

function IslaFriaMesh({ w, d, h, statusColor, ghost }: { w:number;d:number;h:number;statusColor:string;ghost?:boolean }) {
  const op      = ghost ? 0.42 : 1;
  const BODY    = "#f3f4f6";   // blanco/gris claro — cuerpo superior
  const COMP    = "#374151";   // compresor oscuro
  const FRAME   = "#9ca3af";   // rim de acero
  const GLASS_C = "#bae6fd";   // guarda de acrílico
  const INNER   = "#dbeafe";   // interior frío
  const compH   = h * 0.30;
  const wellH   = h - compH;
  const guardH  = 0.20;        // guarda siempre 20 cm, se posa sobre el borde
  const PRODS   = ["#facc15","#f97316","#a78bfa","#ec4899","#34d399","#60a5fa"];

  return (
    <group>
      {/* Bloque compresor inferior (oscuro) */}
      <mesh position={[0, compH / 2, 0]} castShadow>
        <boxGeometry args={[w, compH, d]} />
        <meshStandardMaterial color={COMP} roughness={0.60} metalness={0.25} transparent opacity={op} />
      </mesh>

      {/* Rejillas de ventilación — 5 tiras por las 4 caras del compresor */}
      {Array.from({ length: 5 }, (_, i) => {
        const yp = compH * 0.10 + i * (compH * 0.18);
        return (
          <group key={i}>
            {/* frente */}
            <mesh position={[0, yp, -(d / 2 - 0.002)]}>
              <boxGeometry args={[w * 0.82, 0.012, 0.006]} />
              <meshStandardMaterial color="#1f2937" metalness={0.45} transparent opacity={op} />
            </mesh>
            {/* atrás */}
            <mesh position={[0, yp, d / 2 - 0.002]}>
              <boxGeometry args={[w * 0.82, 0.012, 0.006]} />
              <meshStandardMaterial color="#1f2937" metalness={0.45} transparent opacity={op} />
            </mesh>
            {/* izquierda */}
            <mesh position={[-(w / 2 - 0.002), yp, 0]}>
              <boxGeometry args={[0.006, 0.012, d * 0.82]} />
              <meshStandardMaterial color="#1f2937" metalness={0.45} transparent opacity={op} />
            </mesh>
            {/* derecha */}
            <mesh position={[w / 2 - 0.002, yp, 0]}>
              <boxGeometry args={[0.006, 0.012, d * 0.82]} />
              <meshStandardMaterial color="#1f2937" metalness={0.45} transparent opacity={op} />
            </mesh>
          </group>
        );
      })}

      {/* Cuerpo superior blanco (pozo frío) */}
      <mesh position={[0, compH + wellH / 2, 0]} castShadow>
        <boxGeometry args={[w, wellH, d]} />
        <meshStandardMaterial color={BODY} roughness={0.55} metalness={0.10} transparent opacity={op} />
      </mesh>

      {/* Interior del pozo (tinte frío azulado) */}
      <mesh position={[0, h - 0.10, 0]}>
        <boxGeometry args={[w - 0.10, 0.24, d - 0.10]} />
        <meshStandardMaterial color={INNER} transparent opacity={0.55 * op} roughness={0.05} />
      </mesh>

      {/* Productos dentro de la isla (cajas de helado coloridas) */}
      {Array.from({ length: Math.floor((w - 0.14) / 0.28) }, (_, i) => {
        const px  = -w / 2 + 0.12 + i * 0.28 + 0.09;
        const col = PRODS[i % PRODS.length];
        return (
          <mesh key={i} position={[px, h - 0.17, 0]}>
            <boxGeometry args={[0.22, 0.14, d * 0.55]} />
            <meshStandardMaterial color={col} roughness={0.55} transparent opacity={0.75 * op} />
          </mesh>
        );
      })}

      {/* Rim de acero — 4 perfiles delgados en las aristas superiores (no tapa el pozo) */}
      {/* Frente */}
      <mesh position={[0, h + 0.009, -(d / 2 - 0.006)]}>
        <boxGeometry args={[w + 0.012, 0.018, 0.018]} />
        <meshStandardMaterial color={FRAME} metalness={0.55} roughness={0.25} transparent opacity={op} />
      </mesh>
      {/* Atrás */}
      <mesh position={[0, h + 0.009, d / 2 - 0.006]}>
        <boxGeometry args={[w + 0.012, 0.018, 0.018]} />
        <meshStandardMaterial color={FRAME} metalness={0.55} roughness={0.25} transparent opacity={op} />
      </mesh>
      {/* Izquierda */}
      <mesh position={[-(w / 2 - 0.006), h + 0.009, 0]}>
        <boxGeometry args={[0.018, 0.018, d + 0.012]} />
        <meshStandardMaterial color={FRAME} metalness={0.55} roughness={0.25} transparent opacity={op} />
      </mesh>
      {/* Derecha */}
      <mesh position={[w / 2 - 0.006, h + 0.009, 0]}>
        <boxGeometry args={[0.018, 0.018, d + 0.012]} />
        <meshStandardMaterial color={FRAME} metalness={0.55} roughness={0.25} transparent opacity={op} />
      </mesh>

      {/* Guarda de acrílico — 4 paneles muy transparentes sobre el rim */}
      <mesh position={[0, h + 0.018 + guardH / 2, -(d / 2 - 0.010)]}>
        <boxGeometry args={[w - 0.020, guardH, 0.007]} />
        <meshStandardMaterial color={GLASS_C} roughness={0.05} metalness={0.01}
          transparent opacity={0.14 * op} />
      </mesh>
      <mesh position={[0, h + 0.018 + guardH / 2, d / 2 - 0.010]}>
        <boxGeometry args={[w - 0.020, guardH, 0.007]} />
        <meshStandardMaterial color={GLASS_C} roughness={0.05} metalness={0.01}
          transparent opacity={0.14 * op} />
      </mesh>
      <mesh position={[-(w / 2 - 0.010), h + 0.018 + guardH / 2, 0]}>
        <boxGeometry args={[0.007, guardH, d - 0.020]} />
        <meshStandardMaterial color={GLASS_C} roughness={0.05} metalness={0.01}
          transparent opacity={0.14 * op} />
      </mesh>
      <mesh position={[w / 2 - 0.010, h + 0.018 + guardH / 2, 0]}>
        <boxGeometry args={[0.007, guardH, d - 0.020]} />
        <meshStandardMaterial color={GLASS_C} roughness={0.05} metalness={0.01}
          transparent opacity={0.14 * op} />
      </mesh>

      {/* Indicador de estado en frente del compresor */}
      <mesh position={[0, compH * 0.50, -(d / 2 + 0.008)]}>
        <boxGeometry args={[w * 0.60, 0.034, 0.010]} />
        <meshLambertMaterial color={statusColor} transparent opacity={0.88 * op} />
      </mesh>
    </group>
  );
}

// ─── Mesh: Nevera Carnes ──────────────────────────────────────────────────────
// Mostrador negro con gran vidrio curvo al frente (foto real): cuerpo oscuro bajo,
// dos paneles de vidrio simulando la curva, arcos laterales de metal negro.

function NeveraCarnesMesh({ w, d, h, statusColor, ghost }: { w:number;d:number;h:number;statusColor:string;ghost?:boolean }) {
  const op    = ghost ? 0.42 : 1;
  const DARK  = "#111827";
  const FRAME = "#1f2937";
  const GLASS = "#bae6fd";
  const MEAT  = "#f87171";  // color de la carne expuesta

  const bodyH  = h * 0.52;                   // cuerpo bajo oscuro
  const glassH = h - bodyH + 0.05;           // panel de vidrio, solapa ligeramente el borde

  return (
    <group>
      {/* Cuerpo principal oscuro */}
      <mesh position={[0, bodyH / 2, 0]} castShadow>
        <boxGeometry args={[w, bodyH, d]} />
        <meshStandardMaterial color={DARK} roughness={0.55} metalness={0.25} transparent opacity={op} />
      </mesh>

      {/* Interior frío con carnes expuestas */}
      <mesh position={[0, bodyH - 0.07, 0]}>
        <boxGeometry args={[w - 0.08, 0.20, d - 0.06]} />
        <meshStandardMaterial color={MEAT} roughness={0.80} transparent opacity={0.75 * op} />
      </mesh>

      {/* Rejillas de ventilación en el frente inferior del cuerpo */}
      {Array.from({ length: 4 }, (_, i) => (
        <mesh key={i} position={[0, bodyH * 0.12 + i * (bodyH * 0.16), -(d / 2 - 0.002)]}>
          <boxGeometry args={[w * 0.70, 0.010, 0.006]} />
          <meshStandardMaterial color={FRAME} metalness={0.50} transparent opacity={op} />
        </mesh>
      ))}

      {/* Borde superior del cuerpo */}
      <mesh position={[0, bodyH + 0.007, 0]}>
        <boxGeometry args={[w + 0.010, 0.014, d + 0.010]} />
        <meshStandardMaterial color="#374151" metalness={0.55} roughness={0.30} transparent opacity={op} />
      </mesh>

      {/* Panel de vidrio PLANO vertical al frente — SIN rotación */}
      <mesh position={[0, bodyH + glassH / 2, -(d / 2 - 0.005)]}>
        <boxGeometry args={[w - 0.020, glassH, 0.008]} />
        <meshStandardMaterial color={GLASS} roughness={0.03} metalness={0.01}
          transparent opacity={0.28 * op} />
      </mesh>

      {/* Marco del vidrio — 4 perfiles delgados oscuros alrededor del panel */}
      {/* Riel superior */}
      <mesh position={[0, h + 0.007, -(d / 2 - 0.005)]}>
        <boxGeometry args={[w, 0.014, 0.014]} />
        <meshStandardMaterial color={DARK} metalness={0.55} roughness={0.30} transparent opacity={op} />
      </mesh>
      {/* Riel inferior (sobre el borde del cuerpo) */}
      <mesh position={[0, bodyH + 0.007, -(d / 2 - 0.005)]}>
        <boxGeometry args={[w, 0.014, 0.014]} />
        <meshStandardMaterial color={DARK} metalness={0.55} roughness={0.30} transparent opacity={op} />
      </mesh>
      {/* Poste izquierdo */}
      <mesh position={[-(w / 2 - 0.015), bodyH + glassH / 2, -(d / 2 - 0.005)]}>
        <boxGeometry args={[0.016, glassH, 0.014]} />
        <meshStandardMaterial color={DARK} metalness={0.55} roughness={0.30} transparent opacity={op} />
      </mesh>
      {/* Poste derecho */}
      <mesh position={[w / 2 - 0.015, bodyH + glassH / 2, -(d / 2 - 0.005)]}>
        <boxGeometry args={[0.016, glassH, 0.014]} />
        <meshStandardMaterial color={DARK} metalness={0.55} roughness={0.30} transparent opacity={op} />
      </mesh>

      {/* Indicador de estado en el frente inferior */}
      <mesh position={[0, 0.08, -(d / 2 + 0.008)]}>
        <boxGeometry args={[w * 0.60, 0.032, 0.010]} />
        <meshLambertMaterial color={statusColor} transparent opacity={0.88 * op} />
      </mesh>
    </group>
  );
}

// ─── Mesh: Nevera Refrescos ───────────────────────────────────────────────────
// Vitrina multideck de frente abierto para bebidas y lácteos: cuerpo oscuro,
// estantes iluminados con tiras LED, productos visibles desde el pasillo.

function NeveraRefrescosMesh({ w, d, h, statusColor, ghost, facePaint }: { w:number;d:number;h:number;statusColor:string;ghost?:boolean;facePaint?:FacePaint|null }) {
  const op      = ghost ? 0.42 : 1;
  const BODY    = "#1e293b";
  const SHELF_C = "#334155";
  const LED_C   = "#e0f2fe";
  // Board layout mirrored by getPanelShelfSpan("nevera_refrescos") — keep in sync.
  const compH   = h * 0.14;
  const topH    = h * 0.05;
  const dispH   = h - compH - topH;
  const nShelves = Math.max(3, Math.floor(dispH / 0.35));
  const PRODS   = ["#ef4444","#f97316","#22c55e","#3b82f6","#f8fafc","#a855f7"];

  return (
    <group>
      {/* Paneles laterales */}
      {([-1, 1] as const).map(sx => (
        <mesh key={sx} position={[sx * (w / 2 - 0.017), h / 2, 0]} castShadow>
          <boxGeometry args={[0.032, h, d]} />
          <meshStandardMaterial color={BODY} roughness={0.55} transparent opacity={op} />
        </mesh>
      ))}
      {/* Panel trasero */}
      <mesh position={[0, h / 2, d / 2 - 0.017]} castShadow>
        <boxGeometry args={[w, h, 0.032]} />
        <meshStandardMaterial color={BODY} roughness={0.55} transparent opacity={op} />
      </mesh>
      {/* Panel superior */}
      <mesh position={[0, h - topH / 2, 0]} castShadow>
        <boxGeometry args={[w, topH, d]} />
        <meshStandardMaterial color={BODY} roughness={0.55} transparent opacity={op} />
      </mesh>
      {/* Bloque compresor (parte inferior) */}
      <mesh position={[0, compH / 2, 0]} castShadow>
        <boxGeometry args={[w, compH, d]} />
        <meshStandardMaterial color={BODY} roughness={0.65} transparent opacity={op} />
      </mesh>
      {/* Rejilla de ventilación del compresor */}
      {Array.from({ length: 5 }, (_, i) => (
        <mesh key={i} position={[0, compH * 0.22 + i * (compH * 0.16), -(d / 2 + 0.005)]}>
          <boxGeometry args={[w * 0.68, 0.011, 0.009]} />
          <meshStandardMaterial color="#475569" metalness={0.40} transparent opacity={op} />
        </mesh>
      ))}

      {/* Pared interior iluminada (back wall de la zona fría) — cara frontal pintada */}
      {!ghost && facePaint?.front ? (
        <mesh
          position={[0, compH + dispH / 2, d / 2 - 0.055]}
          material={facePaintArray(
            getPlainStandard("#f0f9ff", LED_C, 0.30, 0.85),
            facePaint.front,
            null,
          )}
        >
          <boxGeometry args={[w - 0.040, dispH, 0.010]} />
        </mesh>
      ) : (
        <mesh position={[0, compH + dispH / 2, d / 2 - 0.055]}>
          <boxGeometry args={[w - 0.040, dispH, 0.010]} />
          <meshStandardMaterial color="#f0f9ff" emissive={LED_C} emissiveIntensity={0.30}
            transparent opacity={0.85 * op} />
        </mesh>
      )}

      {/* Estantes + tira LED + productos */}
      {Array.from({ length: nShelves }, (_, si) => {
        const sy      = compH + 0.06 + (si + 1) * dispH / (nShelves + 1);
        const rowCol  = PRODS[si % PRODS.length];
        const nItems  = Math.max(2, Math.floor((w - 0.06) / 0.085));
        return (
          <group key={si}>
            {/* Estante */}
            <mesh position={[0, sy, 0]} castShadow>
              <boxGeometry args={[w - 0.040, 0.010, d - 0.060]} />
              <meshStandardMaterial color={SHELF_C} metalness={0.40} roughness={0.55} transparent opacity={op} />
            </mesh>
            {/* Tira LED bajo el estante */}
            <mesh position={[0, sy - 0.009, -(d / 2 - 0.040)]}>
              <boxGeometry args={[w - 0.060, 0.005, 0.008]} />
              <meshStandardMaterial color={LED_C} emissive={LED_C} emissiveIntensity={0.70}
                transparent opacity={0.75 * op} />
            </mesh>
            {/* Productos sobre el estante */}
            {Array.from({ length: nItems }, (_, bi) => {
              const bx = -w / 2 + 0.04 + bi * ((w - 0.05) / nItems) + (w - 0.05) / nItems / 2;
              return (
                <mesh key={bi} position={[bx, sy + 0.070, 0]}>
                  <boxGeometry args={[0.068, 0.13, d * 0.65]} />
                  <meshStandardMaterial color={rowCol} roughness={0.40} transparent opacity={0.88 * op} />
                </mesh>
              );
            })}
          </group>
        );
      })}

      {/* Indicador de estado — parte frontal inferior */}
      <mesh position={[0, compH * 0.50, -(d / 2 + 0.008)]}>
        <boxGeometry args={[w * 0.60, 0.028, 0.010]} />
        <meshLambertMaterial color={statusColor} transparent opacity={0.88 * op} />
      </mesh>
    </group>
  );
}

// ─── Mesh: Stand Frutas / Verduras ───────────────────────────────────────────
// Cajón estilo madera (tipo Alkosto): costillas horizontales, esquineros metálicos,
// patas cortas, relleno de producto con tinte verde/amarillo.

function StandFrutasMesh({ w, d, h, statusColor, ghost }: { w:number;d:number;h:number;statusColor:string;ghost?:boolean }) {
  const op      = ghost ? 0.42 : 1;
  const WOOD    = "#c8a465";   // madera clara
  const WOOD_D  = "#a07c3a";   // madera oscura (costillas)
  const METAL   = "#1f2937";   // esquineros / ángulos metálicos negros
  const PRODUCE = "#8fbc52";   // relleno producto (mezcla verde-amarillo)

  // Patas cortas en las 4 esquinas
  const legH  = 0.12;
  const legSz = 0.06;
  const legY  = legH / 2;
  const legs  = [
    [-w / 2 + legSz / 2,  -d / 2 + legSz / 2],
    [ w / 2 - legSz / 2,  -d / 2 + legSz / 2],
    [-w / 2 + legSz / 2,   d / 2 - legSz / 2],
    [ w / 2 - legSz / 2,   d / 2 - legSz / 2],
  ] as const;

  // Costillas horizontales: N tablas apiladas en cada cara
  const plankT = 0.028;   // grosor de cada tabla
  const gap    = 0.018;   // hueco entre tablas
  const pitch  = plankT + gap;
  const boxH   = h - legH;
  const nPlanks = Math.max(2, Math.floor(boxH / pitch));
  const planks  = Array.from({ length: nPlanks }, (_, i) => legH + i * pitch + plankT / 2);

  // Esquineros metálicos verticales (8 aristas del cajón)
  const crnW = 0.030;
  const corners = [
    [-w / 2,  -d / 2],
    [ w / 2,  -d / 2],
    [-w / 2,   d / 2],
    [ w / 2,   d / 2],
  ] as const;

  return (
    <group>
      {/* Patas */}
      {legs.map(([lx, lz], i) => (
        <mesh key={`leg${i}`} position={[lx, legY, lz]} castShadow>
          <boxGeometry args={[legSz, legH, legSz]} />
          <meshStandardMaterial color={WOOD_D} roughness={0.8} transparent opacity={op} />
        </mesh>
      ))}

      {/* Costillas horizontales — cara delantera y trasera */}
      {planks.map((py, i) => (
        <group key={`plk${i}`}>
          {/* Delantera */}
          <mesh position={[0, py, -d / 2 + plankT / 2]} castShadow>
            <boxGeometry args={[w, plankT, plankT]} />
            <meshStandardMaterial color={WOOD} roughness={0.75} transparent opacity={op} />
          </mesh>
          {/* Trasera */}
          <mesh position={[0, py, d / 2 - plankT / 2]} castShadow>
            <boxGeometry args={[w, plankT, plankT]} />
            <meshStandardMaterial color={WOOD} roughness={0.75} transparent opacity={op} />
          </mesh>
          {/* Lateral izquierdo */}
          <mesh position={[-w / 2 + plankT / 2, py, 0]} castShadow>
            <boxGeometry args={[plankT, plankT, d]} />
            <meshStandardMaterial color={WOOD} roughness={0.75} transparent opacity={op} />
          </mesh>
          {/* Lateral derecho */}
          <mesh position={[w / 2 - plankT / 2, py, 0]} castShadow>
            <boxGeometry args={[plankT, plankT, d]} />
            <meshStandardMaterial color={WOOD} roughness={0.75} transparent opacity={op} />
          </mesh>
        </group>
      ))}

      {/* Esquineros metálicos verticales */}
      {corners.map(([cx, cz], i) => (
        <mesh key={`crn${i}`} position={[cx, legH + boxH / 2, cz]} castShadow>
          <boxGeometry args={[crnW, boxH, crnW]} />
          <meshStandardMaterial color={METAL} metalness={0.6} roughness={0.3} transparent opacity={op} />
        </mesh>
      ))}

      {/* Fondo del cajón */}
      <mesh position={[0, legH + 0.010, 0]}>
        <boxGeometry args={[w - 0.04, 0.018, d - 0.04]} />
        <meshStandardMaterial color={WOOD_D} roughness={0.9} transparent opacity={op} />
      </mesh>

      {/* Relleno de producto (fruta/verdura) — ligeramente por encima del borde */}
      <mesh position={[0, h + 0.04, 0]}>
        <boxGeometry args={[w - 0.06, 0.12, d - 0.06]} />
        <meshStandardMaterial color={PRODUCE} roughness={1.0} transparent opacity={0.82 * op} />
      </mesh>

      {/* Indicador de estado en la cara delantera */}
      <mesh position={[0, legH + 0.045, -(d / 2 + 0.008)]}>
        <boxGeometry args={[w * 0.60, 0.036, 0.010]} />
        <meshLambertMaterial color={statusColor} transparent opacity={0.88 * op} />
      </mesh>
    </group>
  );
}

// ─── Mesh: Checkout ───────────────────────────────────────────────────────────

function CheckoutMesh({ w, d, h, statusColor, ghost }: { w:number;d:number;h:number;statusColor:string;ghost?:boolean }) {
  const op     = ghost ? 0.42 : 1;
  const BODY   = "#e5e7eb";
  const BELT_C = "#374151";
  const STEEL  = "#9ca3af";
  const beltW  = w * 0.60;
  const beltD  = d * 0.50;
  const posH   = h + 0.22;          // POS terminal height above counter
  const posW   = 0.25;
  const posD   = 0.04;

  return (
    <group>
      {/* Main counter body */}
      <mesh position={[0, h / 2, 0]} castShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color={BODY} metalness={0.15} roughness={0.60} transparent opacity={op} />
      </mesh>

      {/* Counter top surface */}
      <mesh position={[0, h + 0.010, 0]} castShadow>
        <boxGeometry args={[w + 0.008, 0.020, d + 0.008]} />
        <meshStandardMaterial color={STEEL} metalness={0.40} roughness={0.35} transparent opacity={op} />
      </mesh>

      {/* Conveyor belt strip */}
      <mesh position={[-(w / 2 - beltW / 2) + 0.04, h + 0.022, 0]}>
        <boxGeometry args={[beltW, 0.018, beltD]} />
        <meshStandardMaterial color={BELT_C} metalness={0.30} roughness={0.70} transparent opacity={op} />
      </mesh>
      {/* Belt divider / pusher */}
      <mesh position={[-0.04, h + 0.052, 0]}>
        <boxGeometry args={[0.020, 0.060, beltD + 0.05]} />
        <meshStandardMaterial color={STEEL} metalness={0.45} roughness={0.35} transparent opacity={op} />
      </mesh>

      {/* POS terminal base / arm */}
      <mesh position={[w * 0.30, h + posH * 0.40, -(d * 0.20)]} castShadow>
        <boxGeometry args={[0.040, posH * 0.75, 0.040]} />
        <meshStandardMaterial color={STEEL} metalness={0.40} roughness={0.35} transparent opacity={op} />
      </mesh>
      {/* POS screen */}
      <mesh position={[w * 0.30, h + posH, -(d * 0.20)]} rotation={[0.25, 0, 0]} castShadow>
        <boxGeometry args={[posW, 0.180, posD]} />
        <meshStandardMaterial color="#1f2937" metalness={0.50} roughness={0.30} transparent opacity={op} />
      </mesh>
      {/* Screen display area */}
      <mesh position={[w * 0.30, h + posH, -(d * 0.20 - posD * 0.1)]} rotation={[0.25, 0, 0]}>
        <boxGeometry args={[posW - 0.020, 0.150, 0.004]} />
        <meshStandardMaterial color="#1e40af" emissive="#1e40af" emissiveIntensity={0.20}
          transparent opacity={0.80 * op} />
      </mesh>

      {/* Card reader */}
      <mesh position={[w * 0.30 + 0.14, h + 0.065, -(d * 0.20)]}>
        <boxGeometry args={[0.070, 0.110, 0.030]} />
        <meshStandardMaterial color="#1f2937" metalness={0.50} roughness={0.30} transparent opacity={op} />
      </mesh>

      {/* Status indicator on front face */}
      <mesh position={[0, h * 0.12, -(d / 2 + 0.008)]}>
        <boxGeometry args={[w * 0.60, 0.040, 0.012]} />
        <meshLambertMaterial color={statusColor} transparent opacity={0.88 * op} />
      </mesh>
    </group>
  );
}

// ─── Mesh: Columna ────────────────────────────────────────────────────────────

function ColumnaMesh({ w, d, h, statusColor, ghost }: { w:number;d:number;h:number;statusColor:string;ghost?:boolean }) {
  const op      = ghost ? 0.42 : 1;
  const plinthH = Math.min(h * 0.06, 0.18);
  const capitalH = Math.min(h * 0.05, 0.15);
  const shaftH   = h - plinthH - capitalH;
  const overhang = 0.06;  // how much plinth/capital overhang the shaft

  return (
    <group>
      {/* Plinth (base) */}
      <mesh position={[0, plinthH / 2, 0]} castShadow>
        <boxGeometry args={[w + overhang * 2, plinthH, d + overhang * 2]} />
        <meshStandardMaterial color="#b8b5ae" metalness={0.10} roughness={0.70} transparent opacity={op} />
      </mesh>

      {/* Shaft */}
      <mesh position={[0, plinthH + shaftH / 2, 0]} castShadow>
        <boxGeometry args={[w, shaftH, d]} />
        <meshStandardMaterial color="#d1cec8" metalness={0.08} roughness={0.75} transparent opacity={op} />
      </mesh>

      {/* Capital (top) */}
      <mesh position={[0, plinthH + shaftH + capitalH / 2, 0]} castShadow>
        <boxGeometry args={[w + overhang * 2, capitalH, d + overhang * 2]} />
        <meshStandardMaterial color="#b8b5ae" metalness={0.10} roughness={0.70} transparent opacity={op} />
      </mesh>

      {/* Status indicator (subtle thin ring at base) */}
      <mesh position={[0, plinthH + 0.02, 0]}>
        <boxGeometry args={[w + 0.004, 0.018, d + 0.004]} />
        <meshLambertMaterial color={statusColor} transparent opacity={0.70 * op} />
      </mesh>
    </group>
  );
}

// ─── FixtureMesh dispatcher ───────────────────────────────────────────────────

interface FixtureMeshProps {
  fixture:         PlacedFixture;
  ghost?:          boolean;
  facePaint?:      FacePaint | null;
  selectedSlotId?: string | null;
  hoveredSlotId?:  string | null;
  onSlotClick?:    (slotId: string) => void;
  onSlotHover?:    (slotId: string | null) => void;
}

function FixtureMesh({ fixture, ghost, facePaint, selectedSlotId, hoveredSlotId, onSlotClick, onSlotHover }: FixtureMeshProps) {
  const sc = STATUS_COLORS[fixture.status] ?? STATUS_COLORS.free;
  const base = { w:fixture.w, d:fixture.d, h:fixture.h, statusColor:sc, ghost };
  switch (fixture.type) {
    case "gondola": return (
      <GondolaMesh {...base}
        gondolaType={fixture.gondolaType ?? "double"}
        facePaint={facePaint}
        slots={fixture.slots}
        selectedSlotId={selectedSlotId}
        hoveredSlotId={hoveredSlotId}
        onSlotClick={onSlotClick}
        onSlotHover={onSlotHover}
      />
    );
    case "punta": return (
      <PuntaMesh {...base}
        facePaint={facePaint}
        slots={fixture.slots}
        selectedSlotId={selectedSlotId}
        hoveredSlotId={hoveredSlotId}
        onSlotClick={onSlotClick}
        onSlotHover={onSlotHover}
      />
    );
    case "robatope":      return <RobatopeMesh      {...base} facePaint={facePaint} />;
    case "ristra":        return <RistraMesh         {...base} />;
    case "cross":         return <CrossMesh          {...base} />;
    case "metro":         return <MetroMesh          {...base} />;
    case "mueble":        return <MuebleMesh         {...base} facePaint={facePaint} />;
    case "isla":          return <IslaMesh           {...base} />;
    case "impulsador":    return <ImpulsadorMesh     {...base} />;
    case "batea":         return <BateaMesh          {...base} />;
    case "isla_fria":        return <IslaFriaMesh         {...base} />;
    case "nevera_carnes":    return <NeveraCarnesMesh     {...base} />;
    case "nevera_refrescos": return <NeveraRefrescosMesh  {...base} facePaint={facePaint} />;
    case "stand_frutas":     return <StandFrutasMesh       {...base} />;
    case "checkout":      return <CheckoutMesh       {...base} />;
    case "columna":       return <ColumnaMesh        {...base} />;
    default:              return <IslaMesh           {...base} />;  // legacy exhibicion + unknown
  }
}

// ─── Store room ───────────────────────────────────────────────────────────────

/** Floor + border that adapts to the bounding box of all placed fixtures. */
function StoreRoom({ fixtures }: { fixtures: PlacedFixture[] }) {
  const PAD = 2.5; // metres of padding around fixture bbox
  const MIN_SIZE = 8;

  const { cx, cz, fw, fd } = useMemo(() => {
    if (fixtures.length === 0) {
      return { cx: STORE_W / 2, cz: STORE_D / 2, fw: MIN_SIZE, fd: MIN_SIZE };
    }
    const xs = fixtures.flatMap(f => [f.x - f.w / 2, f.x + f.w / 2]);
    const zs = fixtures.flatMap(f => [f.z - f.d / 2, f.z + f.d / 2]);
    const minX = Math.min(...xs) - PAD;
    const maxX = Math.max(...xs) + PAD;
    const minZ = Math.min(...zs) - PAD;
    const maxZ = Math.max(...zs) + PAD;
    return {
      cx: (minX + maxX) / 2,
      cz: (minZ + maxZ) / 2,
      fw: Math.max(MIN_SIZE, maxX - minX),
      fd: Math.max(MIN_SIZE, maxZ - minZ),
    };
  }, [fixtures]);

  type V3 = [number, number, number];
  return (
    <group>
      <mesh rotation={[-Math.PI/2,0,0]} position={[cx,0,cz] as V3} receiveShadow>
        <planeGeometry args={[fw,fd]} />
        <meshLambertMaterial color="#ddd8cc" />
      </mesh>
      {[
        { pos:[cx,       0.001, cz-fd/2] as V3, args:[fw,   0.001, 0.06] as V3 },
        { pos:[cx,       0.001, cz+fd/2] as V3, args:[fw,   0.001, 0.06] as V3 },
        { pos:[cx-fw/2,  0.001, cz]      as V3, args:[0.06, 0.001, fd]   as V3 },
        { pos:[cx+fw/2,  0.001, cz]      as V3, args:[0.06, 0.001, fd]   as V3 },
      ].map((b,i)=>(
        <mesh key={i} position={b.pos}>
          <boxGeometry args={b.args} />
          <meshLambertMaterial color="#b8b0a4" />
        </mesh>
      ))}
    </group>
  );
}

// ─── Selection wireframe ──────────────────────────────────────────────────────

function SelectionBox({ w, d, h }: { w:number;d:number;h:number }) {
  return (
    <mesh position={[0,h/2,0]}>
      <boxGeometry args={[w+0.24, h+0.24, d+0.24]} />
      <meshBasicMaterial color="#818cf8" wireframe />
    </mesh>
  );
}

// ─── Camera controls ──────────────────────────────────────────────────────────

function CameraControls({
  orbitRef,
  onReady,
}: {
  orbitRef: React.MutableRefObject<ThreeOrbitControls|null>;
  onReady?: (ctrl: ThreeOrbitControls) => (() => void) | void;
}) {
  const { camera, gl, invalidate } = useThree();
  useEffect(() => {
    const ctrl = new ThreeOrbitControls(camera, gl.domElement);
    ctrl.target.set(...CAM_TARGET);
    ctrl.minPolarAngle = Math.PI / 6;
    ctrl.maxPolarAngle = Math.PI / 2.1;
    ctrl.minDistance   = 4;
    ctrl.maxDistance   = 80;
    ctrl.enablePan     = true;
    ctrl.panSpeed      = 1.4;
    ctrl.update();
    orbitRef.current   = ctrl;
    // With frameloop="demand", re-render only when the camera actually moves.
    const onCtrlChange = () => invalidate();
    ctrl.addEventListener('change', onCtrlChange);
    // B3: capture the disposer returned by onReady (removes the 'change' listener)
    const disposeListener = onReady?.(ctrl);
    return () => {
      ctrl.removeEventListener('change', onCtrlChange);
      disposeListener?.();
      ctrl.dispose();
      orbitRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // No useFrame needed — OrbitControls fires 'change' on every user interaction
  // (already calls update() internally), and we invalidate from that event.
  return null;
}

// ─── MEJORA 5: Screenshot capture ────────────────────────────────────────────

function ScreenshotCapture({ onReady }: { onReady: (fn: () => void) => void }) {
  const { gl } = useThree();
  useEffect(() => {
    onReady(() => {
      const link = document.createElement('a');
      link.download = `tienda-${new Date().toISOString().slice(0,10)}.png`;
      link.href = gl.domElement.toDataURL('image/png');
      link.click();
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, onReady]);
  return null;
}

// ─── MEJORA 6: Transform Controls (Gizmo) ────────────────────────────────────

function FixtureTransformControls({
  fixture, orbitRef, onMove
}: {
  fixture: PlacedFixture;
  orbitRef: React.MutableRefObject<ThreeOrbitControls|null>;
  onMove: (id: string, x: number, z: number) => void;
}) {
  const { camera, gl, scene } = useThree();
  const groupRef = useRef<THREE.Group>(null);
  const ctrlRef  = useRef<TransformControls|null>(null);

  useEffect(() => {
    if (!groupRef.current) return;
    const ctrl = new TransformControls(camera, gl.domElement);
    ctrl.setMode('translate');
    ctrl.setSpace('world');
    ctrl.showY = false;
    ctrl.attach(groupRef.current);
    scene.add(ctrl as unknown as THREE.Object3D);
    ctrlRef.current = ctrl;

    const onDragging = (e: THREE.Event) => {
      if (orbitRef.current) orbitRef.current.enabled = !(e as any).value;
    };
    const onObjectChange = () => {
      if (!groupRef.current) return;
      const p = groupRef.current.position;
      onMove(fixture.id, snap(p.x), snap(p.z));
      p.x = Math.max(0, Math.min(STORE_W, p.x));
      p.z = Math.max(0, Math.min(STORE_D, p.z));
      p.y = 0;
    };

    ctrl.addEventListener('dragging-changed', onDragging);
    ctrl.addEventListener('objectChange', onObjectChange);

    return () => {
      ctrl.removeEventListener('dragging-changed', onDragging);
      ctrl.removeEventListener('objectChange', onObjectChange);
      ctrl.detach();
      scene.remove(ctrl as unknown as THREE.Object3D);
      ctrl.dispose();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fixture.id, camera, gl, scene]);

  return (
    <group ref={groupRef} position={[fixture.x, 0, fixture.z]} />
  );
}

// ─── Snap crosshair ───────────────────────────────────────────────────────────

/**
 * Small amber crosshair drawn exactly at the snap-target position.
 * Gives a clear visual "magnetic" feel — the object will land here.
 */
function SnapCrosshair({ x, z }: { x: number; z: number }) {
  const SIZE = 1.2;
  const pts1 = useMemo(() => [new THREE.Vector3(x-SIZE, 0.07, z), new THREE.Vector3(x+SIZE, 0.07, z)], [x, z]);
  const pts2 = useMemo(() => [new THREE.Vector3(x, 0.07, z-SIZE), new THREE.Vector3(x, 0.07, z+SIZE)], [x, z]);
  const geo1 = useMemo(() => new THREE.BufferGeometry().setFromPoints(pts1), [pts1]);
  const geo2 = useMemo(() => new THREE.BufferGeometry().setFromPoints(pts2), [pts2]);
  const mat  = useMemo(() => new THREE.LineBasicMaterial({ color: '#f59e0b', depthTest: false }), []);
  // B4: dispose geometries and material when they change or component unmounts
  useEffect(() => () => { geo1.dispose(); geo2.dispose(); }, [geo1, geo2]);
  useEffect(() => () => { mat.dispose(); }, [mat]);
  return (
    <>
      <primitive object={new THREE.Line(geo1, mat)} />
      <primitive object={new THREE.Line(geo2, mat)} />
    </>
  );
}

// ─── MEJORA 7: Alignment guides ──────────────────────────────────────────────

function AlignmentGuides({
  ghostX, ghostZ,
  fixtures, active
}: {
  ghostX: number; ghostZ: number; ghostW?: number; ghostD?: number;
  fixtures: PlacedFixture[]; active: boolean;
}) {
  const lines = useMemo(() => {
    if (!active || !fixtures.length) return [];
    const result: { points: [THREE.Vector3, THREE.Vector3]; color: string }[] = [];
    const TOL = 0.35;

    fixtures.forEach(f => {
      if (Math.abs(ghostX - f.x) < TOL) {
        result.push({
          points: [
            new THREE.Vector3(f.x, 0.05, Math.min(ghostZ, f.z) - 2),
            new THREE.Vector3(f.x, 0.05, Math.max(ghostZ, f.z) + 2),
          ],
          color: '#38bdf8',
        });
      }
      if (Math.abs(ghostZ - f.z) < TOL) {
        result.push({
          points: [
            new THREE.Vector3(Math.min(ghostX, f.x) - 2, 0.05, f.z),
            new THREE.Vector3(Math.max(ghostX, f.x) + 2, 0.05, f.z),
          ],
          color: '#38bdf8',
        });
      }
    });
    return result;
  }, [ghostX, ghostZ, fixtures, active]);

  // B4: pre-build Line objects in useMemo so they aren't recreated every render,
  // then dispose them when lines change or the component unmounts.
  const lineObjects = useMemo(
    () => lines.map(l => {
      const geo = new THREE.BufferGeometry().setFromPoints(l.points);
      const mat = new THREE.LineBasicMaterial({ color: l.color, depthTest: false });
      return new THREE.Line(geo, mat);
    }),
    [lines]
  );
  useEffect(() => {
    return () => {
      lineObjects.forEach(o => {
        (o.geometry as THREE.BufferGeometry).dispose();
        (o.material as THREE.LineBasicMaterial).dispose();
      });
    };
  }, [lineObjects]);

  if (!lineObjects.length) return null;

  return (
    <>
      {lineObjects.map((line, i) => <primitive key={i} object={line} />)}
    </>
  );
}

// ─── MEJORA 8: First-person controls ─────────────────────────────────────────

function FirstPersonControls({
  orbitRef, active
}: {
  orbitRef: React.MutableRefObject<ThreeOrbitControls|null>;
  active: boolean;
}) {
  const { camera, gl, invalidate } = useThree();
  const ctrlRef = useRef<PointerLockControls|null>(null);
  const keys    = useRef<Record<string, boolean>>({});
  const SPEED   = 0.08;
  const CAM_Y   = 1.65;

  useEffect(() => {
    if (!active) return;

    camera.position.set(STORE_W/2, CAM_Y, STORE_D/4);

    const ctrl = new PointerLockControls(camera, gl.domElement);
    ctrlRef.current = ctrl;

    if (orbitRef.current) orbitRef.current.enabled = false;

    const lockOnClick = () => ctrl.lock();
    gl.domElement.addEventListener('click', lockOnClick);

    const onKey = (e: KeyboardEvent) => {
      keys.current[e.code] = e.type === 'keydown';
      // Kickstart the render loop when a movement key is pressed in first-person mode.
      if (e.type === 'keydown' && ctrl.isLocked) invalidate();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('keyup',   onKey);

    return () => {
      ctrl.unlock();
      ctrl.dispose();
      ctrlRef.current = null;
      gl.domElement.removeEventListener('click', lockOnClick);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('keyup',   onKey);
      if (orbitRef.current) orbitRef.current.enabled = true;
      camera.position.set(...CAM_POS);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, camera, gl, invalidate]);

  useFrame(() => {
    if (!active || !ctrlRef.current?.isLocked) return;
    const anyKey =
      keys.current['KeyW'] || keys.current['ArrowUp']    ||
      keys.current['KeyS'] || keys.current['ArrowDown']  ||
      keys.current['KeyA'] || keys.current['ArrowLeft']  ||
      keys.current['KeyD'] || keys.current['ArrowRight'];
    if (!anyKey) return;
    if (keys.current['KeyW'] || keys.current['ArrowUp'])    ctrlRef.current.moveForward(SPEED);
    if (keys.current['KeyS'] || keys.current['ArrowDown'])  ctrlRef.current.moveForward(-SPEED);
    if (keys.current['KeyA'] || keys.current['ArrowLeft'])  ctrlRef.current.moveRight(-SPEED);
    if (keys.current['KeyD'] || keys.current['ArrowRight']) ctrlRef.current.moveRight(SPEED);
    camera.position.y = CAM_Y;
    camera.position.x = Math.max(-2, Math.min(STORE_W+2, camera.position.x));
    camera.position.z = Math.max(-2, Math.min(STORE_D+2, camera.position.z));
    invalidate(); // sustain the loop while keys are held
  });

  return null;
}

// ─── Face imagery sources (photos + category patterns) ───────────────────────
// Replaces BOTH earlier attempts (InstancedMesh products, CategoryStrips
// planes): any NEW positioned geometry had to replicate the fixture placement
// math and kept floating detached. Now the imagery is painted directly onto an
// EXISTING box of each fixture through a per-face material array (see
// facePaintArray above), so it inherits the fixture group's full transform and
// cannot misalign. Texture priority per face:
//   1. supplier photo   — GET /api/spaces/face-images, loaded via fileUrl()
//   2. category pattern — square canvas texture, "stocked shelves" look
//   3. none             — plain color material, exactly as today

const SHELF_LIKE_TYPES = new Set<string>([
  "gondola", "punta", "mueble", "isla", "batea", "robatope",
  "isla_fria", "nevera_carnes", "nevera_refrescos", "stand_frutas", "exhibicion",
]);

/** Lowercase + strip accents so "Lácteos" matches "lacteo". */
function normalizeText(s: string): string {
  // NFD splits accented letters into base char + combining mark (U+0300..U+036F);
  // drop the marks so "lácteo" -> "lacteo".
  let out = "";
  for (const ch of s.toLowerCase().normalize("NFD")) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp < 0x0300 || cp > 0x036f) out += ch;
  }
  return out;
}

type CategoryKey =
  | "snacks" | "bebidas" | "lacteos" | "enlatados"
  | "abarrotes" | "aseo" | "fruver" | "generico";

const CATEGORY_KEYWORDS: [CategoryKey, string[]][] = [
  ["snacks",    ["papas", "snack", "chips", "frito"]],
  ["bebidas",   ["bebida", "gaseosa", "refresco", "agua", "jugo", "cerveza"]],
  ["lacteos",   ["leche", "lacteo", "yogur", "queso", "huevo"]],
  ["enlatados", ["enlatado", "conserva", "atun", "lata"]],
  ["abarrotes", ["galleta", "cereal", "pasta", "harina", "arroz", "grano"]],
  ["aseo",      ["detergente", "aseo", "jabon", "limpia", "suavizante", "cloro"]],
  ["fruver",    ["fruta", "verdura", "fruver"]],
];

/** Keyword match on the category (fallback: fixture label). Default: "generico". */
function categoryKeyFor(category: string, label: string): CategoryKey {
  const text = normalizeText(category || label);
  for (const [key, kws] of CATEGORY_KEYWORDS) {
    if (kws.some(k => text.includes(k))) return key;
  }
  return "generico";
}

// Per-category look: large emoji + subdued (saturated but not neon) palette.
const CATEGORY_STYLE: Record<CategoryKey, { emoji: string; palette: string[] }> = {
  snacks:    { emoji: "🍟", palette: ["#c2703d", "#b3543a", "#c9932f", "#a34b2e"] },
  bebidas:   { emoji: "🥤", palette: ["#b13a3a", "#2f6f4f", "#3a5fa8", "#c07a2c"] },
  lacteos:   { emoji: "🥛", palette: ["#7fa3c4", "#a4b8cc", "#8caf9f", "#b9c4d6"] },
  enlatados: { emoji: "🥫", palette: ["#a84a3b", "#8a8f96", "#b98a3a", "#6f7d6a"] },
  abarrotes: { emoji: "🍪", palette: ["#a5793c", "#8a5f3c", "#b3924f", "#7d6748"] },
  aseo:      { emoji: "🧴", palette: ["#4f8fae", "#6aa8a0", "#7f6fae", "#5b9c7a"] },
  fruver:    { emoji: "🍎", palette: ["#5f8f3f", "#b0522f", "#c9932f", "#4f7d4a"] },
  generico:  { emoji: "📦", palette: ["#9a8f80", "#8a7f70", "#a89c88", "#7f7568"] },
};

function traceRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.arcTo(x + w, y, x + w, y + rr, rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
  ctx.lineTo(x + rr, y + h);
  ctx.arcTo(x, y + h, x, y + h - rr, rr);
  ctx.lineTo(x, y + rr);
  ctx.arcTo(x, y, x + rr, y, rr);
  ctx.closePath();
}

// Deterministic per-tile height factors → slightly irregular "product skyline".
const TILE_HEIGHT_VAR = [0.86, 0.97, 0.90, 1.00, 0.84, 0.94, 0.88, 0.99];

/** Square "stocked shelves" face texture per category — session-level cache. */
const faceTextureCache = new Map<CategoryKey, THREE.CanvasTexture>();

function getCategoryFaceTexture(key: CategoryKey): THREE.CanvasTexture {
  const cached = faceTextureCache.get(key);
  if (cached) return cached;

  const S = 512, ROWS = 4, COLS = 4;
  const canvas = document.createElement("canvas");
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext("2d")!;

  // Opaque neutral background — the texture replaces the panel color entirely.
  ctx.fillStyle = "#e3e0da";
  ctx.fillRect(0, 0, S, S);

  const { emoji, palette } = CATEGORY_STYLE[key];
  const rowH  = S / ROWS;
  const tileW = S / COLS;

  for (let r = 0; r < ROWS; r++) {
    const baseline = (r + 1) * rowH - 10;

    // Shelf board under each row of packages
    ctx.fillStyle = "#b7b3ab";
    ctx.fillRect(0, baseline, S, 7);

    for (let c = 0; c < COLS; c++) {
      const idx   = r * COLS + c;
      const tileH = (rowH - 26) * TILE_HEIGHT_VAR[idx % TILE_HEIGHT_VAR.length];
      const x     = c * tileW + 8;
      const bw    = tileW - 16;
      const y     = baseline - tileH;

      // Package silhouette (rounded rect)
      ctx.fillStyle = palette[idx % palette.length];
      traceRoundedRect(ctx, x, y, bw, tileH, 10);
      ctx.fill();

      // Subtle top highlight → reads as a lid / label band
      ctx.fillStyle = "rgba(255,255,255,0.16)";
      traceRoundedRect(ctx, x + 5, y + 5, bw - 10, Math.max(8, tileH * 0.16), 6);
      ctx.fill();

      // Large centered emoji
      ctx.font = `${Math.round(tileH * 0.50)}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(emoji, x + bw / 2, y + tileH * 0.55);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  faceTextureCache.set(key, tex);
  return tex;
}

/**
 * Category material per (category × face-aspect bucket). repeat.x tracks the
 * face's w/h so package tiles keep a roughly square world shape instead of
 * stretching with the panel. Aspect is bucketed (0.25 steps) to bound cache size.
 *
 * NOTE: unlike photo faces (getPhotoFaceMaterial), category patterns are NOT
 * board-aligned — they tile a pre-drawn decorative square canvas whose row
 * artwork (packages + painted board) is baked in. Aligning them would mean
 * regenerating that canvas per fixture span, a separate generator change; the
 * abstract pattern reads fine slightly offset, so it keeps whole-face tiling.
 */
const categoryFaceMaterialCache = new Map<string, THREE.MeshBasicMaterial>();

function getCategoryFaceMaterial(key: CategoryKey, faceAspect: number): THREE.MeshBasicMaterial {
  const bucket = Math.max(0.25, Math.round(faceAspect * 4) / 4);
  const cacheKey = `${key}|${bucket}`;
  let mat = categoryFaceMaterialCache.get(cacheKey);
  if (!mat) {
    const tex = getCategoryFaceTexture(key).clone();
    tex.repeat.x = bucket;
    tex.offset.x = bucket < 1 ? (1 - bucket) / 2 : 0;
    tex.needsUpdate = true;
    mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
    categoryFaceMaterialCache.set(cacheKey, mat);
  }
  return mat;
}

// ─── Supplier photo textures (lazy, deduped, async) ──────────────────────────

interface PhotoTexEntry {
  status:   "loading" | "ok" | "error";
  texture?: THREE.Texture;
  aspect:   number;
  waiters:  Set<() => void>;
}

/** Base photo texture per file_id — loaded at most once per session. */
const photoTexCache = new Map<number, PhotoTexEntry>();
/** Cover-fitted photo material per (file_id × face-aspect bucket). */
const photoMatCache = new Map<string, THREE.MeshBasicMaterial>();

/**
 * Cap the photo caches: long sessions browsing many supplier photos would
 * otherwise accumulate GPU textures without bound (nothing ever disposed).
 * Insertion-order eviction — Map preserves it, so the first key is the oldest.
 */
const MAX_PHOTO_TEX = 64;

function evictOldestPhotoIfFull(): void {
  if (photoTexCache.size < MAX_PHOTO_TEX) return;
  const oldestId = photoTexCache.keys().next().value;
  if (oldestId === undefined) return;
  photoTexCache.get(oldestId)?.texture?.dispose();
  photoTexCache.delete(oldestId);
  // Drop every derived material for that file — photoMatCache keys are
  // `${fileId}|${type}|<span>`, so match on the fileId prefix.
  const prefix = `${oldestId}|`;
  for (const [key, mat] of photoMatCache) {
    if (key.startsWith(prefix)) {
      mat.map?.dispose(); // cloned texture owned by this material
      mat.dispose();
      photoMatCache.delete(key);
    }
  }
}

// ─── Painted-panel shelf spans (per fixture type) ────────────────────────────
// The planogram texture rows must land EXACTLY on the shelf boards each mesh
// component draws, or products cross the boards mid-body and the stocked-shelf
// illusion dies. These formulas mirror the board math inside each mesh — every
// mirrored mesh carries a matching "keep in sync" reminder next to its layout.
//
// All values are in the painted panel's LOCAL space (metres, 0 = panel bottom):
//   panelW/panelH — size of the box face that receives the material (NOT
//                   always the full fixture w×h — punta/robatope/mueble/nevera
//                   paint a sub-panel)
//   rowBottom     — top surface of the lowest shelf board (first row's floor)
//   rowPitch      — uniform board spacing = row cell height
//   rows          — number of product rows (board gaps that display product)
// Bands outside [rowBottom, rowBottom + rows·rowPitch] (plinth, header) stay
// transparent so the plain panel color shows through — no floating products.

interface PanelShelfSpan {
  panelW:    number;
  panelH:    number;
  rowBottom: number;
  rowPitch:  number;
  rows:      number;
}

function getPanelShelfSpan(type: string, w: number, h: number): PanelShelfSpan {
  switch (type) {
    case "gondola":
    case "gondola_doble": {
      // GondolaMesh — painted panel: back/spine box [w, h] spanning 0..h.
      // Boards: n = max(4, round((h-topH)/0.38)) centres at
      // 0.14 + i·(h-topH-0.16)/(n-1); topH = 0.08, shelfT = 0.022.
      // The top board (h-0.10) has no display room above it → rows = n-1
      // (the gaps BETWEEN boards); wall and double share the same layout.
      const topH = 0.08, shelfT = 0.022;
      const n     = Math.max(4, Math.round((h - topH) / 0.38));
      const pitch = (h - topH - 0.16) / Math.max(n - 1, 1);
      return { panelW: w, panelH: h, rowBottom: 0.14 + shelfT / 2, rowPitch: pitch, rows: Math.max(1, n - 1) };
    }
    case "punta": {
      // PuntaMesh — painted panel: back plate [w, bodyH] spanning 0..bodyH,
      // bodyH = h - topperH (0.36). Boards: n = max(3, round(bodyH/0.38))
      // centres at 0.12 + (i+1)·(bodyH-0.16)/(n+1), thickness 0.022 (the
      // -0.08 rad board tilt shifts edges <1 cm — visually negligible).
      // Every board incl. the top one has display room above it → rows = n.
      const bodyH = h - 0.36;
      const n     = Math.max(3, Math.round(bodyH / 0.38));
      const pitch = (bodyH - 0.16) / (n + 1);
      return { panelW: w, panelH: bodyH, rowBottom: 0.12 + pitch + 0.011, rowPitch: pitch, rows: n };
    }
    case "robatope": {
      // RobatopeMesh — same layout language as PuntaMesh: panel [w, bodyH],
      // bodyH = h - capH (0.055). Boards: n = max(2, round(bodyH/0.40))
      // centres at 0.12 + (i+1)·(bodyH-0.16)/(n+1), thickness 0.022 → rows = n.
      const bodyH = h - 0.055;
      const n     = Math.max(2, Math.round(bodyH / 0.40));
      const pitch = (bodyH - 0.16) / (n + 1);
      return { panelW: w, panelH: bodyH, rowBottom: 0.12 + pitch + 0.011, rowPitch: pitch, rows: n };
    }
    case "mueble": {
      // MuebleMesh — painted panel: inner back [w-0.036, doorH-0.036] whose
      // bottom sits at world baseH+0.018 (panel centred at baseH+doorH/2);
      // baseH = min(0.22h, 0.40), doorH = h - baseH. Shelves:
      // n = max(2, round(doorH/0.38)) at baseH + 0.10 + i·(doorH-0.12)/(n-1),
      // thickness 0.014; the top shelf is the cabinet ceiling (h-0.02) →
      // rows = n-1 gaps. rowBottom = (baseH+0.10) - (baseH+0.018) + 0.007.
      const baseH = Math.min(h * 0.22, 0.40);
      const doorH = h - baseH;
      const n     = Math.max(2, Math.round(doorH / 0.38));
      const pitch = (doorH - 0.12) / Math.max(n - 1, 1);
      return { panelW: w - 0.036, panelH: doorH - 0.036, rowBottom: 0.10 - 0.018 + 0.007, rowPitch: pitch, rows: Math.max(1, n - 1) };
    }
    case "nevera_refrescos": {
      // NeveraRefrescosMesh — painted panel: lit back wall [w-0.040, dispH]
      // whose bottom sits at world compH; compH = 0.14h, topH = 0.05h,
      // dispH = h - compH - topH. Shelves: n = max(3, floor(dispH/0.35)) at
      // compH + 0.06 + (i+1)·dispH/(n+1), thickness 0.010. The 3D product
      // boxes stand on every shelf → rows = n (top row shrinks to fit the
      // panel top; see getPhotoFaceMaterial).
      const dispH = h - h * 0.14 - h * 0.05;
      const n     = Math.max(3, Math.floor(dispH / 0.35));
      const pitch = dispH / (n + 1);
      return { panelW: w - 0.040, panelH: dispH, rowBottom: 0.06 + pitch + 0.005, rowPitch: pitch, rows: n };
    }
    default: {
      // Unknown paintable type — legacy whole-face grid (pre-alignment rules).
      const rows = Math.min(5, Math.max(1, Math.floor(h / 0.45)));
      return { panelW: w, panelH: h, rowBottom: 0, rowPitch: h / Math.max(rows, 1), rows };
    }
  }
}

/**
 * Returns the photo material as a PLANOGRAM GRID aligned to the REAL shelf
 * boards of the fixture type (getPanelShelfSpan): one row per board gap, each
 * product image bottom-anchored so it "stands" on its board. The grid is
 * composited onto a canvas so the plinth/header bands outside the shelf region
 * stay fully transparent (plain wrap modes cannot mask sub-ranges of V).
 * Columns keep the product's real aspect; the last one may be cut at the
 * fixture edge, like a real shelf.
 * Null while the texture is still loading / after a load error (callers fall
 * through to the category pattern). `notify` fires once when the load settles.
 */
function getPhotoFaceMaterial(
  fileId: number,
  fixType: string,
  faceW: number,
  faceH: number,
  notify: () => void,
): THREE.MeshBasicMaterial | null {
  let entry = photoTexCache.get(fileId);
  if (!entry) {
    evictOldestPhotoIfFull();
    const fresh: PhotoTexEntry = { status: "loading", aspect: 1, waiters: new Set() };
    photoTexCache.set(fileId, fresh);
    entry = fresh;
    // Same-origin URL; the JWT rides in the ?token= query (fileUrl helper).
    new THREE.TextureLoader().load(
      fileUrl(fileId),
      tex => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 4;
        tex.center.set(0.5, 0.5);
        const img = tex.image as { width?: number; height?: number } | undefined;
        fresh.aspect  = img?.width && img?.height ? img.width / img.height : 1;
        fresh.texture = tex;
        fresh.status  = "ok";
        fresh.waiters.forEach(w => w());
        fresh.waiters.clear();
      },
      undefined,
      () => {
        fresh.status = "error";
        fresh.waiters.forEach(w => w());
        fresh.waiters.clear();
      },
    );
  }
  if (entry.status === "loading") { entry.waiters.add(notify); return null; }
  if (entry.status === "error" || !entry.texture) return null;
  const image = entry.texture.image as CanvasImageSource | undefined;
  if (!image) return null;

  // Board-aligned span for THIS fixture type, quantised to 5 mm buckets so
  // near-identical fixtures share a canvas (bounds the cache like the old
  // repeatX bucketing did). Boards are 10-22 mm thick and occlude the row
  // boundary, so 5 mm of quantisation error is invisible.
  const q   = (v: number) => Math.round(v / 0.005) * 0.005;
  const raw = getPanelShelfSpan(fixType, faceW, faceH);
  const span: PanelShelfSpan = {
    panelW:    Math.max(0.05, q(raw.panelW)),
    panelH:    Math.max(0.05, q(raw.panelH)),
    rowBottom: q(raw.rowBottom),
    rowPitch:  Math.max(0.05, q(raw.rowPitch)),
    rows:      raw.rows,
  };
  // Key carries the type + full span: types with different board layouts must
  // never share a wrongly-offset canvas for the same photo.
  const key = `${fileId}|${fixType}|${span.rows}|${span.panelW}|${span.panelH}|${span.rowBottom}|${span.rowPitch}`;
  let mat = photoMatCache.get(key);
  if (!mat) {
    const PPM = 512; // texture pixels per metre, capped so no side exceeds 2048
    const px  = Math.min(PPM, 2048 / span.panelW, 2048 / span.panelH);
    const canvas = document.createElement("canvas");
    canvas.width  = Math.max(2, Math.round(span.panelW * px));
    canvas.height = Math.max(2, Math.round(span.panelH * px));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.imageSmoothingQuality = "high";
    for (let r = 0; r < span.rows; r++) {
      const rowFloor = span.rowBottom + r * span.rowPitch; // board top surface (m)
      // Each row cell fills its board gap. A cell that would poke past the
      // panel top (constrained top shelves) shrinks to fit — the bottom stays
      // anchored on the board; spare room only ever appears at the cell TOP.
      const cellH = Math.min(span.rowPitch, span.panelH - rowFloor);
      if (cellH < 0.02) continue;
      const cellW = Math.max(0.05, cellH * entry.aspect); // real product aspect
      const yTop  = canvas.height - (rowFloor + cellH) * px; // canvas Y is top-down
      for (let x = 0; x < canvas.width; x += cellW * px) {
        ctx.drawImage(image, x, yTop, cellW * px, cellH * px); // last column cut at edge
      }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    // transparent: the plinth/header bands (and real-alpha PNG margins) show
    // the panel color behind each product, reading as stocked shelves.
    mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, transparent: true });
    photoMatCache.set(key, mat);
  }
  return mat;
}

/** Shelf-like types whose mesh has a paintable full-face panel. */
const FACE_PAINTABLE_TYPES = new Set<string>([
  "gondola", "gondola_doble", "punta", "robatope", "mueble", "nevera_refrescos",
]);

/**
 * Resolve the material for ONE face, by priority:
 *   supplier photo → category pattern → null (keep plain color).
 */
function resolveFaceMaterial(
  faceCode: string | null,
  fixType:  string,
  category: string,
  label:    string,
  faceW:    number,
  faceH:    number,
  faceImages: Map<string, number> | null,
  notify:     () => void,
): THREE.Material | null {
  const aspect = faceW / Math.max(0.05, faceH);
  if (faceCode && faceImages) {
    const fileId = faceImages.get(faceCode);
    if (fileId !== undefined) {
      const photo = getPhotoFaceMaterial(fileId, fixType, faceW, faceH, notify);
      if (photo) return photo;
      // still loading or failed → fall through to the category pattern
    }
  }
  const cat = (category || "").trim();
  if (cat) return getCategoryFaceMaterial(categoryKeyFor(cat, label), aspect);
  return null;
}

// ─── "Sin contrato" badge ────────────────────────────────────────────────────
// Anchored INSIDE the fixture's group (top center), scales with distance,
// occluded by geometry, and hidden entirely beyond BADGE_MAX_DIST so the
// scene never fills with billboards.

const BADGE_MAX_DIST = 25; // metres

function FixtureBadge({ x, z, h }: { x: number; z: number; h: number }) {
  const [visible, setVisible] = useState(false);
  useFrame(({ camera }) => {
    // Scalar math only — no allocations in the frame loop.
    const dx = camera.position.x - x;
    const dy = camera.position.y - h;
    const dz = camera.position.z - z;
    const near = dx * dx + dy * dy + dz * dz < BADGE_MAX_DIST * BADGE_MAX_DIST;
    setVisible(v => (v === near ? v : near));
  });
  if (!visible) return null;
  return (
    <Html
      position={[0, h + 0.35, 0]}
      center
      distanceFactor={6}
      occlude
      zIndexRange={[5, 0]}
      style={{ pointerEvents: "none" }}
    >
      <div style={{
        background: "#ef4444",
        color: "#fff",
        fontSize: 11,
        fontWeight: 700,
        padding: "2px 6px",
        borderRadius: 4,
        whiteSpace: "nowrap",
        maxWidth: 90,
        overflow: "hidden",
        textOverflow: "ellipsis",
        pointerEvents: "none",
        boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
      }}>
        ⚠ Sin contrato
      </div>
    </Html>
  );
}

// ─── Scene ───────────────────────────────────────────────────────────────────

interface SceneProps {
  placedFixtures:    PlacedFixture[];
  selectedId:        string | null;
  selectedSlotId:    string | null;
  hoveredSlotId:     string | null;
  setHoveredSlotId:  (id: string|null) => void;
  placingDef:        FixtureDef | null;
  ghostX:            number;
  ghostZ:            number;
  ghostRotY:         number;
  ghostCollides:     boolean;
  draggingId:        React.MutableRefObject<string|null>;
  orbitRef:          React.MutableRefObject<ThreeOrbitControls|null>;
  onFloorMove:       (x:number, z:number) => void;
  onFloorClick:      (x:number, z:number) => void;
  onSelectFixture:   (id:string) => void;
  onSelectSlot:      (fixtureId:string, slotId:string) => void;
  setPlacedFixtures: React.Dispatch<React.SetStateAction<PlacedFixture[]>>;
  screenshotReady:   (fn: () => void) => void;
  topViewReady:      (fn: () => void) => void;
  firstPerson:       boolean;
  onHoverFixture:    (id: string|null, x: number, y: number) => void;
  fixtures:          import("../../types/fixtures").UnifiedFixture[];
}

function Scene({
  placedFixtures, selectedId, selectedSlotId,
  placingDef, ghostX, ghostZ, ghostRotY, ghostCollides,
  draggingId, orbitRef, onFloorMove, onFloorClick,
  onSelectFixture, setPlacedFixtures,
  screenshotReady, topViewReady, firstPerson, onHoverFixture, fixtures,
}: SceneProps) {
  const { gl, camera, invalidate } = useThree();
  const { setCamera3D } = useFixtureStore();

  // Unified fixtures by id — sede/code/faceB metadata + badge checks.
  const unifiedById = useMemo(() => {
    const m = new Map<string, UnifiedFixture>();
    fixtures.forEach(f => m.set(f.id, f));
    return m;
  }, [fixtures]);

  // Supplier face images: code → file_id (most recent image per space).
  // null until the fetch settles; failures degrade to category patterns.
  const [faceImages, setFaceImages] = useState<Map<string, number> | null>(null);
  useEffect(() => {
    let alive = true;
    getFaceImages()
      .then((rows: { code: string; file_id: number }[]) => {
        if (alive) setFaceImages(new Map(rows.map(r => [r.code.toUpperCase(), r.file_id])));
      })
      .catch(() => { if (alive) setFaceImages(new Map()); });
    return () => { alive = false; };
  }, []);

  // Bumped when an async photo texture settles → re-resolve materials + redraw.
  const [texVersion, setTexVersion] = useState(0);
  const notifyTexLoaded = useCallback(() => {
    setTexVersion(v => v + 1);
    invalidate();
  }, [invalidate]);

  // Face-paint materials per fixture id (photo → category pattern → plain).
  const facePaintById = useMemo(() => {
    const map = new Map<string, FacePaint>();
    const storeSede = useFixtureStore.getState().sede;
    for (const fix of placedFixtures) {
      const type = fix.type as string;
      if (!SHELF_LIKE_TYPES.has(type) || !FACE_PAINTABLE_TYPES.has(type)) continue;
      const uf = unifiedById.get(fix.id);
      // Contract-save convention (FloorPlan2D AssignmentPanel):
      //   fullCode = `${item.sede || sede}-${item.code}`; face B appends "-B".
      // 3D-generated codes already embed the sede prefix — guard against
      // double-prefixing so both editors' fixtures resolve their space code.
      const sedeVal = uf?.sede || storeSede;
      // Case-insensitive: generateCode embeds the sede UPPERCASED in fix.code,
      // so compare/compose in uppercase on both sides (faceImages keys are
      // uppercased too) — a raw-case sede must never double-prefix the code.
      const codeUC = fix.code.toUpperCase();
      const sedeUC = (sedeVal ?? "").toUpperCase();
      const fullCode = sedeUC && !codeUC.startsWith(`${sedeUC}-`)
        ? `${sedeUC}-${codeUC}`
        : codeUC;
      // Fallback: 2D-created spaces saved with a raw-case sede prefix may
      // uppercase to a key that differs from the computed fullCode — try the
      // bare uppercased code too. First hit wins.
      const pickCode = (primary: string, fallback: string) =>
        faceImages && !faceImages.has(primary) && faceImages.has(fallback)
          ? fallback
          : primary;
      const isDouble = isDoubleGondola(fix) || type === "gondola_doble";
      const front = resolveFaceMaterial(
        pickCode(fullCode, codeUC), type, fix.brandCategory, fix.label,
        fix.w, fix.h, faceImages, notifyTexLoaded,
      );
      const back = isDouble
        ? resolveFaceMaterial(
            pickCode(`${fullCode}-B`, `${codeUC}-B`), type, uf?.faceB?.brandCategory ?? "", fix.label,
            fix.w, fix.h, faceImages, notifyTexLoaded,
          )
        : null;
      if (front || back) map.set(fix.id, { front, back });
    }
    return map;
  // texVersion re-runs this memo when an async photo texture settles
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placedFixtures, unifiedById, faceImages, texVersion, notifyTexLoaded]);

  // CHANGE 1 — Restore camera + wire persistence once OrbitControls are ready.
  // W1: Read camera3D from getState() at call time (not from closure) to avoid stale values.
  // B3: Returns a disposer so the caller can remove the listener on unmount.
  const handleOrbitReady = useCallback((ctrl: ThreeOrbitControls) => {
    const { camera3D: c3d } = useFixtureStore.getState();
    // Migrate old camera states. The new correct position is north of the store
    // at posZ = STORE_D + 8 = 50. Any saved posZ < STORE_D (42) means the camera
    // was saved from the old south-facing setup (including any in-store orbit positions).
    const needsMigration = c3d.posZ < STORE_D;
    const posX = needsMigration ? STORE_W / 2 : c3d.posX;
    const posY = needsMigration ? 28 : c3d.posY;
    const posZ = needsMigration ? STORE_D + 8 : c3d.posZ;
    const targetX = needsMigration ? STORE_W / 2 : c3d.targetX;
    const targetY = needsMigration ? 0 : c3d.targetY;
    const targetZ = needsMigration ? STORE_D / 2 : c3d.targetZ;
    camera.position.set(posX, posY, posZ);
    ctrl.target.set(targetX, targetY, targetZ);
    ctrl.update();
    const handler = () => {
      const p = camera.position;
      const t = ctrl.target;
      setCamera3D({ posX: p.x, posY: p.y, posZ: p.z, targetX: t.x, targetY: t.y, targetZ: t.z });
    };
    ctrl.addEventListener('change', handler);
    // Return cleanup so CameraControls can remove the listener on unmount (B3)
    return () => ctrl.removeEventListener('change', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Vista superior — register handler so the toolbar button can trigger it
  useEffect(() => {
    topViewReady(() => {
      const ctrl = orbitRef.current;
      if (!ctrl) return;
      const cx = STORE_W / 2;
      const cz = STORE_D / 2;
      camera.position.set(cx, Math.max(STORE_W, STORE_D) * 0.9, cz);
      ctrl.target.set(cx, 0, cz);
      ctrl.update();
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topViewReady]);

  // CHANGE 2A — Auto-center orbit target on fixture centroid (only when target is at origin)
  useEffect(() => {
    if (!orbitRef.current || placedFixtures.length === 0) return;
    const cx = placedFixtures.reduce((s, f) => s + f.x, 0) / placedFixtures.length;
    const cz = placedFixtures.reduce((s, f) => s + f.z, 0) / placedFixtures.length;
    const t = orbitRef.current.target;
    if (Math.abs(t.x) < 0.01 && Math.abs(t.z) < 0.01) {
      orbitRef.current.target.set(cx, 0, cz);
      orbitRef.current.update();
    }
  }, [placedFixtures]);

  // CHANGE 2B — Double-click to reset orbit pivot to clicked point
  function handleSceneDoubleClick(e: any) {
    if (!orbitRef.current || !e.point) return;
    orbitRef.current.target.set(e.point.x, 0, e.point.z);
    orbitRef.current.update();
  }

  // Two-level grid: major 1 m lines (visible) + minor 0.5 m lines (faint).
  // Size is capped to store bounds + a small margin to avoid drawing unnecessary geometry.
  const { gridMajor, gridMinor } = useMemo(() => {
    const SIZE = Math.ceil(Math.max(STORE_W, STORE_D)) + 4; // ~46 instead of 120
    const DIVS = SIZE; // 1 m per cell
    const major = new THREE.GridHelper(SIZE, DIVS, "#a09890", "#cbc6be");
    major.position.set(STORE_W/2, 0.004, STORE_D/2);
    (major.material as THREE.LineBasicMaterial).transparent = true;
    (major.material as THREE.LineBasicMaterial).opacity = 0.55;

    const minor = new THREE.GridHelper(SIZE, DIVS * 2, "#dbd8d4", "#dbd8d4");
    minor.position.set(STORE_W/2, 0.002, STORE_D/2);
    (minor.material as THREE.LineBasicMaterial).transparent = true;
    (minor.material as THREE.LineBasicMaterial).opacity = 0.35;

    return { gridMajor: major, gridMinor: minor };
  }, []);

  const ghostFixture: PlacedFixture | null = placingDef ? {
    id:"ghost", code:"", type:placingDef.type,
    gondolaType: placingDef.gondolaType,
    x:ghostX, z:ghostZ, rotY:ghostRotY,
    w:placingDef.w, d:placingDef.d, h:placingDef.h,
    label:placingDef.label, color:placingDef.color,
    supplierName:"", brandCategory:"",
    status:"free", negotiatedValue:0,
    startDate:"", endDate:"", observation:"",
  } : null;

  return (
    <>
      {/* MEJORA 1: Rebalanced lights */}
      <ambientLight intensity={0.55} color="#fff8f0" />
      <directionalLight position={[STORE_W/2,40,STORE_D/2]} intensity={1.6} castShadow
        shadow-mapSize-width={1024} shadow-mapSize-height={1024}
        shadow-camera-near={0.5} shadow-camera-far={120}
        shadow-camera-left={-STORE_W/2 - 4} shadow-camera-right={STORE_W/2 + 4}
        shadow-camera-top={STORE_D/2 + 4} shadow-camera-bottom={-STORE_D/2 - 4} />
      <directionalLight position={[0,25,0]} intensity={0.3} color="#fffaee" />
      <directionalLight position={[STORE_W,25,STORE_D]} intensity={0.2} color="#e0eeff" />

      <StoreRoom fixtures={placedFixtures} />
      <primitive object={gridMinor} />
      <primitive object={gridMajor} />

      {/* Alignment guides + snap crosshair: during placement AND during drag */}
      {(() => {
        const draggedFix = draggingId.current
          ? placedFixtures.find(f => f.id === draggingId.current)
          : null;
        const guideX = draggedFix ? draggedFix.x : ghostX;
        const guideZ = draggedFix ? draggedFix.z : ghostZ;
        const guideActive = !!placingDef || !!draggedFix;
        const compareFixtures = draggedFix
          ? placedFixtures.filter(f => f.id !== draggingId.current)
          : placedFixtures;
        return guideActive ? (
          <>
            <AlignmentGuides
              ghostX={guideX}
              ghostZ={guideZ}
              fixtures={compareFixtures}
              active
            />
            <SnapCrosshair x={guideX} z={guideZ} />
          </>
        ) : null;
      })()}

      {/* Invisible raycast floor */}
      <mesh
        rotation={[-Math.PI/2,0,0]}
        position={[STORE_W/2,0.005,STORE_D/2]}
        onDoubleClick={handleSceneDoubleClick}
        onPointerMove={e=>{
          e.stopPropagation();
          const cx=Math.max(0,Math.min(STORE_W,snap(e.point.x)));
          const cz=Math.max(0,Math.min(STORE_D,snap(e.point.z)));
          if(draggingId.current) {
            const id = draggingId.current;
            setPlacedFixtures(prev => {
              const dragged = prev.find(f => f.id === id);
              if (!dragged) return prev;
              // Block the move if it would overlap another fixture
              if (hasAABBCollision({x:cx, z:cz}, dragged, prev, id)) return prev;
              return prev.map(f => f.id === id ? {...f, x:cx, z:cz} : f);
            });
          } else {
            onFloorMove(cx,cz);
          }
        }}
        onPointerUp={e=>{
          if(draggingId.current){
            e.stopPropagation();
            draggingId.current=null;
            if(orbitRef.current) orbitRef.current.enabled=true;
          }
        }}
        onClick={e=>{
          e.stopPropagation();
          if(!draggingId.current){
            const cx=Math.max(0,Math.min(STORE_W,snap(e.point.x)));
            const cz=Math.max(0,Math.min(STORE_D,snap(e.point.z)));
            onFloorClick(cx,cz);
          }
        }}
      >
        <planeGeometry args={[STORE_W+40,STORE_D+40]} />
        <meshBasicMaterial visible={false} side={THREE.DoubleSide} />
      </mesh>

      {/* Placed fixtures */}
      {placedFixtures.map(fix => {
        const hasSlots = fix.type==="gondola"||fix.type==="punta";
        return (
          <group key={fix.id} position={[fix.x,0,fix.z]} rotation={[0,fix.rotY,0]}>
            <FixtureMesh
              fixture={fix}
              facePaint={facePaintById.get(fix.id) ?? null}
              /* slots disabled — omit onSlotClick/onSlotHover to skip all slot meshes */
            />
            {fix.id===selectedId && !selectedSlotId && <SelectionBox w={fix.w} d={fix.d} h={fix.h} />}
            {/* CHANGE 4 — Unauthorized placement badge (distance-gated + occluded) */}
            {(() => {
              const unifiedFix = unifiedById.get(fix.id);
              if (!unifiedFix) return null;
              const isUnauthorized =
                unifiedFix.status === "occupied" &&
                (!unifiedFix.supplierName || !unifiedFix.endDate || new Date(unifiedFix.endDate) < new Date());
              if (!isUnauthorized) return null;
              return <FixtureBadge x={fix.x} z={fix.z} h={fix.h} />;
            })()}
            {/* Hit volume */}
            <mesh
              position={[0, fix.h/2, hasSlots ? 0.03 : 0]}
              onDoubleClick={handleSceneDoubleClick}
              onPointerDown={e=>{
                if (firstPerson) return;
                e.stopPropagation();
                onSelectFixture(fix.id);
                draggingId.current=fix.id;
                if(orbitRef.current) orbitRef.current.enabled=false;
              }}
              onPointerOver={e=>{
                e.stopPropagation();
                if (!draggingId.current && !placingDef && !firstPerson) {
                  const rect = gl.domElement.getBoundingClientRect();
                  onHoverFixture(fix.id, e.clientX - rect.left, e.clientY - rect.top - 16);
                }
              }}
              onPointerOut={e=>{
                e.stopPropagation();
                onHoverFixture(null, 0, 0);
              }}
              onPointerMove={e=>{
                if (!draggingId.current && !placingDef && !firstPerson) {
                  const rect = gl.domElement.getBoundingClientRect();
                  onHoverFixture(fix.id, e.clientX - rect.left, e.clientY - rect.top - 16);
                }
              }}
            >
              <boxGeometry args={[
                fix.w + (hasSlots ? 0.08 : 0.30),
                fix.h + 0.20,
                fix.d + (hasSlots ? 0.08 : 0.30),
              ]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
          </group>
        );
      })}

      {/* MEJORA 2: Ghost with collision overlay — only when not in first-person */}
      {ghostFixture && !firstPerson && (
        <group position={[ghostFixture.x,0,ghostFixture.z]} rotation={[0,ghostFixture.rotY,0]}>
          {ghostCollides && (
            <mesh position={[0, 0.02, 0]} rotation={[-Math.PI/2, 0, 0]}>
              <planeGeometry args={[ghostFixture.w + 0.2, ghostFixture.d + 0.2]} />
              <meshBasicMaterial color="#ef4444" transparent opacity={0.25} depthWrite={false} />
            </mesh>
          )}
          {!ghostCollides && (
            <mesh position={[0, 0.01, 0]} rotation={[-Math.PI/2, 0, 0]}>
              <planeGeometry args={[ghostFixture.w + 0.1, ghostFixture.d + 0.1]} />
              <meshBasicMaterial color="#22c55e" transparent opacity={0.15} depthWrite={false} />
            </mesh>
          )}
          <FixtureMesh fixture={ghostFixture} ghost />
        </group>
      )}

      {/* MEJORA 6: Transform gizmo — only when not first-person and not placing */}
      {selectedId && !placingDef && !firstPerson && (() => {
        const fix = placedFixtures.find(f => f.id === selectedId);
        return fix ? (
          <FixtureTransformControls
            fixture={fix}
            orbitRef={orbitRef}
            onMove={(id, x, z) => setPlacedFixtures(prev => {
              const dragged = prev.find(f => f.id === id);
              if (!dragged) return prev;
              if (hasAABBCollision({x, z}, dragged, prev, id)) return prev;
              return prev.map(f => f.id === id ? {...f, x, z} : f);
            })}
          />
        ) : null;
      })()}

      {/* MEJORA 8: First-person controls */}
      <FirstPersonControls orbitRef={orbitRef} active={firstPerson} />

      {/* MEJORA 5: Screenshot capture */}
      <ScreenshotCapture onReady={screenshotReady} />

      <CameraControls orbitRef={orbitRef} onReady={handleOrbitReady} />
    </>
  );
}

// ─── Persistence ──────────────────────────────────────────────────────────────

// ─── Store ↔ PlacedFixture adapters ──────────────────────────────────────────

/**
 * Convert the unified store into the 3D internal array.
 * Filters out "exhibicion" fixtures (no 3D mesh representation).
 */
function storeToFixtures(unifiedList: UnifiedFixture[]): PlacedFixture[] {
  return unifiedList
    .filter((f) => f.type !== "exhibicion")
    .map((f) => {
      const type = f.type as FixType;
      const def  = FIXTURE_DEFS.find(
        (d) => d.type === type && (!f.gondolaType || d.gondolaType === f.gondolaType)
      );
      return {
        id:              f.id,
        code:            f.code,
        type,
        gondolaType:     f.gondolaType,
        slots:           f.slots ?? defaultSlots({ type, w: f.w, h: f.h, code: f.code }),
        x:               f.cx,
        // Direct Z mapping — camera is on the north side (Z = STORE_D + 8),
        // so small Z = far from camera = top of viewport, which already matches
        // the 2D convention (small Y = top of canvas). No flip needed.
        z:               f.cz,
        rotY:            f.rotY,
        w:               f.w,
        d:               f.d,
        h:               f.h,
        label:           f.label || def?.label || type,
        color:           f.color || def?.color || "#6366f1",
        supplierName:    f.supplierName,
        brandCategory:   f.brandCategory,
        status:          f.status,
        negotiatedValue: f.negotiatedValue,
        startDate:       f.startDate,
        endDate:         f.endDate,
        observation:     f.observation,
      };
    });
}

/**
 * Convert the 3D internal array back to unified format.
 * Preserves "exhibicion" fixtures from the store (2D-only, invisible in 3D).
 */
function fixturesToStore(
  fixtures: PlacedFixture[],
  sede: string,
  existingStore: UnifiedFixture[],
): UnifiedFixture[] {
  // Keep 2D-only fixtures (exhibicion) so the 2D editor doesn't lose them
  const exhibicion = existingStore.filter((f) => f.type === "exhibicion");

  const updated: UnifiedFixture[] = fixtures.map((f) => ({
    id:              f.id,
    code:            f.code,
    type:            f.type,
    gondolaType:     f.gondolaType,
    label:           f.label,
    cx:              f.x,
    cz:              f.z, // direct mapping — no flip since camera moved to north side
    rotY:            f.rotY,
    w:               f.w,
    d:               f.d,
    h:               f.h,
    color:           f.color,
    status:          f.status,
    sede,
    supplierName:    f.supplierName,
    brandCategory:   f.brandCategory,
    negotiatedValue: f.negotiatedValue,
    startDate:       f.startDate,
    endDate:         f.endDate,
    observation:     f.observation,
    slots:           f.slots,
  }));

  return [...exhibicion, ...updated];
}

// ─── CommercialPanel ──────────────────────────────────────────────────────────

interface CommercialPanelProps {
  fix:           PlacedFixture;
  sede:          string;
  selectedSlot:  ShelfSlot | null;
  onUpdate:      (id:string, u:Partial<PlacedFixture>) => void;
  onUpdateSlot:  (fixtureId:string, slotId:string, u:Partial<ShelfSlot>) => void;
  onRotate:      () => void;
  onFlip:        () => void;
  onDelete:      () => void;
  onClose:       () => void;
  onSlotClose:   () => void;
}

function CommercialPanel({
  fix, sede, selectedSlot, onUpdate, onUpdateSlot,
  onRotate, onFlip, onDelete, onClose, onSlotClose,
}: CommercialPanelProps) {
  const u  = useCallback((up: Partial<PlacedFixture>) => onUpdate(fix.id, up), [fix.id, onUpdate]);
  const us = useCallback((up: Partial<ShelfSlot>) => selectedSlot && onUpdateSlot(fix.id, selectedSlot.id, up), [fix.id, selectedSlot, onUpdateSlot]);

  const sm  = STATUS_META[fix.status];
  const def = FIXTURE_DEFS.find(d=>d.type===fix.type && (fix.type!=="gondola"||d.gondolaType===fix.gondolaType)) ?? FIXTURE_DEFS[0];

  // ── Contract persistence ──────────────────────────────────────────────────
  const [saveState, setSaveState] = useState<"idle"|"saving"|"ok"|"error">("idle");
  const [saveError, setSaveError] = useState("");

  const canSave =
    fix.supplierName.trim().length > 0 &&
    fix.startDate.length > 0 &&
    fix.endDate.length > 0 &&
    (fix.negotiatedValue ?? 0) > 0;

  async function handleSaveContract() {
    if (!canSave) return;
    setSaveState("saving");
    setSaveError("");
    try {
      const space = await findOrCreateSpace({
        code: fix.code,
        name: fix.label,
        zone: fix.type,
        sede,
        area_m2: parseFloat((fix.w * fix.d).toFixed(2)),
      });
      const supplier = await findOrCreateSupplier(fix.supplierName.trim());
      await createLease(space.id, {
        supplier_id: supplier.id,
        marca: fix.brandCategory || undefined,
        start_date: fix.startDate,
        end_date: fix.endDate,
        monthly_rent: fix.negotiatedValue,
        notes: fix.observation || undefined,
      });
      u({ status: "occupied" });
      setSaveState("ok");
      setTimeout(() => setSaveState("idle"), 3500);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        "Error al guardar el contrato";
      setSaveError(msg);
      setSaveState("error");
      setTimeout(() => setSaveState("idle"), 5000);
    }
  }

  const inputCls = "w-full border-0 border-b border-dark-line-2 bg-transparent rounded-none px-0 py-1 text-sm text-dark-ink-1 focus:border-accent focus:outline-none placeholder:text-dark-ink-3 transition-colors";
  const labelCls = "mb-0.5 block text-[10px] uppercase tracking-widest text-dark-ink-3 font-medium";

  function handleSlotStatusChange(newStatus: SpaceStatus) {
    if (!selectedSlot) return;
    if (selectedSlot.status==="occupied" && newStatus==="free") {
      if (!confirm("¿Estás seguro de liberar este espacio ocupado?")) return;
    }
    us({ status: newStatus });
  }

  if (selectedSlot) {
    const slotSm   = STATUS_META[selectedSlot.status];
    const slotDays = computeDays(selectedSlot.startDate, selectedSlot.endDate);
    const slotStatusBorder = selectedSlot.status === "occupied" ? "border-l-4 border-danger" : selectedSlot.status === "reserved" ? "border-l-4 border-warning" : "border-l-4 border-accent";
    const slotSelectBorder = selectedSlot.status === "occupied" ? "border-danger/50" : selectedSlot.status === "reserved" ? "border-warning/50" : "border-success/50";
    return (
      <div className={`flex w-64 flex-shrink-0 flex-col overflow-y-auto border-l border-dark-line bg-dark-surface ${slotStatusBorder}`}>
        <div className="flex items-center gap-2 border-b border-dark-line p-3">
          <div className="flex h-7 w-7 items-center justify-center rounded bg-accent/20 text-xs font-mono font-bold text-accent-200">S</div>
          <div className="min-w-0 flex-1">
            <span className="bg-dark-bg rounded px-2 py-0.5 text-[10px] font-mono text-accent-200">{selectedSlot.id}</span>
            <p className="text-xs font-bold text-dark-ink-1 mt-0.5">Slot — {fix.code}</p>
          </div>
          <button onClick={onSlotClose} className="text-dark-ink-3 hover:text-dark-ink-1" title="Volver al fixture">
            <X size={14} />
          </button>
        </div>

        <div className="flex items-center gap-2 border-b border-dark-line px-3 py-2">
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${slotSm.bg} ${slotSm.text}`}>
            {slotSm.label}
          </span>
        </div>

        <div className="flex flex-col gap-3 p-3">
          <div>
            <label className={labelCls}>Estado del slot</label>
            <select value={selectedSlot.status} onChange={e=>handleSlotStatusChange(e.target.value as SpaceStatus)}
              className={`w-full rounded border ${slotSelectBorder} bg-dark-bg px-2 py-1 text-xs text-dark-ink-1 focus:outline-none`}>
              <option value="free">Disponible</option>
              <option value="occupied">Ocupado</option>
              <option value="reserved">Reservado</option>
            </select>
          </div>

          <div>
            <label className={labelCls}><Building2 size={9} className="inline mr-1"/>Proveedor</label>
            <input type="text" value={selectedSlot.supplierName} placeholder="Nombre del proveedor"
              onChange={e => {
                us({ supplierName: e.target.value });
                if (e.target.value && selectedSlot.status==="free")
                  us({ status:"occupied", supplierName: e.target.value });
              }} className={inputCls} />
          </div>

          <div>
            <label className={labelCls}><Tag size={9} className="inline mr-1"/>Categoría</label>
            <input type="text" value={selectedSlot.brandCategory||""} placeholder="Marca / rubro"
              onChange={e=>us({brandCategory:e.target.value})} className={inputCls} />
          </div>

          <div>
            <label className={labelCls}><DollarSign size={9} className="inline mr-1"/>Valor (USD/mes)</label>
            <input type="number" min={0} value={selectedSlot.negotiatedValue||""}
              onChange={e=>us({negotiatedValue:parseFloat(e.target.value)||0})}
              className={`${inputCls} ${selectedSlot.negotiatedValue > 0 ? "text-success text-base font-bold" : ""}`} />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelCls}><Calendar size={9} className="inline mr-1"/>Inicio</label>
              <input type="date" value={selectedSlot.startDate||""}
                onChange={e=>us({startDate:e.target.value})} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Fin</label>
              <input type="date" value={selectedSlot.endDate||""}
                onChange={e=>us({endDate:e.target.value})} className={inputCls} />
            </div>
          </div>

          {slotDays > 0 && (
            <p className="text-center text-[10px] text-dark-ink-2">
              <span className="font-bold text-accent-200">{slotDays}</span> días en el espacio
            </p>
          )}

          <div className="rounded-lg border border-dark-line/50 bg-dark-bg/60 p-2 font-mono text-[10px] text-dark-ink-3">
            {selectedSlot.id}
          </div>
        </div>
      </div>
    );
  }

  const days = computeDays(fix.startDate, fix.endDate);

  let progressPct = 0;
  let daysLeft    = 0;
  let progressColor = "bg-success";
  if (fix.startDate && fix.endDate) {
    const start    = new Date(fix.startDate).getTime();
    const end      = new Date(fix.endDate).getTime();
    const now      = Date.now();
    const total    = end - start;
    const elapsed  = now - start;
    progressPct    = total > 0 ? Math.min(100, Math.max(0, (elapsed / total) * 100)) : 0;
    daysLeft       = Math.max(0, Math.ceil((end - now) / 86_400_000));
    if (progressPct > 90) progressColor = "bg-danger";
    else if (progressPct > 70) progressColor = "bg-warning";
  }
  const daysLeftColor = progressPct > 90 ? "text-danger" : progressPct > 70 ? "text-warning" : "text-success";

  return (
    <div className="flex w-64 flex-shrink-0 flex-col overflow-y-auto border-l border-dark-line bg-dark-surface"
      style={{ borderLeftWidth: "4px", borderLeftColor: STATUS_COLORS[fix.status] }}>

      <div className="flex items-center gap-2 border-b border-dark-line p-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl bg-dark-surface-2 flex-shrink-0">
          {def.emoji}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-bold text-dark-ink-1">{fix.label}</p>
          <p className="font-mono text-[10px] text-dark-ink-3">{fix.code}</p>
        </div>
        <button onClick={onClose} className="text-dark-ink-3 hover:text-dark-ink-1"><X size={14}/></button>
      </div>

      <div className="flex items-center gap-2 border-b border-dark-line px-3 py-2">
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold flex items-center gap-1 ${sm.bg} ${sm.text}`}>
          {fix.status === "occupied" && <span className="animate-pulse inline-block w-2 h-2 rounded-full mr-0.5" style={{ background: STATUS_COLORS[fix.status] }}/>}
          {sm.label}
        </span>
        <div className="ml-auto flex gap-1">
          <button onClick={onRotate} title="Rotar 90° (R)"
            className="rounded border border-dark-line-2 bg-dark-surface-2 p-1 text-dark-ink-2 hover:bg-dark-line hover:text-dark-ink-1 active:scale-90 transition-transform duration-100">
            <RotateCw size={11}/>
          </button>
          <button onClick={onFlip} title="Flip (F)"
            className="rounded border border-dark-line-2 bg-dark-surface-2 p-1 text-dark-ink-2 hover:bg-dark-line hover:text-dark-ink-1 active:scale-90 transition-transform duration-100">
            <FlipHorizontal2 size={11}/>
          </button>
          <button onClick={onDelete} title="Eliminar (Del)"
            className="rounded border border-danger/40 bg-danger/10 p-1 text-danger hover:bg-danger/25 active:scale-90 transition-all duration-100">
            <Trash2 size={11}/>
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-3 p-3">

        {fix.slots && fix.slots.length > 0 && (
          <div className="rounded border border-dark-line bg-dark-bg/40 p-2">
            <p className="mb-1.5 text-[10px] font-semibold text-dark-ink-3">Slots internos</p>
            <div className="flex flex-wrap gap-1.5 text-[10px]">
              {(["free","occupied","reserved"] as SpaceStatus[]).map(s=>{
                const cnt = fix.slots!.filter(sl=>sl.status===s).length;
                if (!cnt) return null;
                const sm2 = STATUS_META[s];
                return (
                  <span key={s} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${sm2.bg} ${sm2.text}`}>
                    {cnt} {sm2.label.toLowerCase()}
                  </span>
                );
              })}
            </div>
            <p className="mt-1 text-[9px] text-dark-ink-3 italic">Hacé clic en un slot del panel frontal para editarlo</p>
          </div>
        )}

        <div>
          <label className={labelCls}><Info size={9} className="inline mr-1"/>Estado fixture</label>
          <select value={fix.status} onChange={e=>u({status:e.target.value as SpaceStatus})}
            className="w-full rounded border border-dark-line-2 bg-dark-bg px-2 py-1 text-xs text-dark-ink-1 focus:border-accent focus:outline-none">
            <option value="free">Disponible</option>
            <option value="occupied">Ocupado</option>
            <option value="reserved">Reservado</option>
            <option value="maintenance">Mantenimiento</option>
          </select>
        </div>

        <div>
          <label className={labelCls}><Building2 size={9} className="inline mr-1"/>Proveedor</label>
          <input type="text" value={fix.supplierName} placeholder="Nombre del proveedor"
            onChange={e=>u({supplierName:e.target.value})} className={inputCls} />
        </div>

        <div>
          <label className={labelCls}><Tag size={9} className="inline mr-1"/>Marca / Categoría</label>
          <input type="text" value={fix.brandCategory} placeholder="Marca o rubro"
            onChange={e=>u({brandCategory:e.target.value})} className={inputCls} />
        </div>

        <div>
          <label className={labelCls}><DollarSign size={9} className="inline mr-1"/>Valor (USD/mes)</label>
          <input type="number" min={0} value={fix.negotiatedValue||""}
            onChange={e=>u({negotiatedValue:parseFloat(e.target.value)||0})}
            className={`${inputCls} ${fix.negotiatedValue > 0 ? "text-success text-base font-bold" : ""}`} />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelCls}><Calendar size={9} className="inline mr-1"/>Inicio</label>
            <input type="date" value={fix.startDate} onChange={e=>u({startDate:e.target.value})} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Fin</label>
            <input type="date" value={fix.endDate} onChange={e=>u({endDate:e.target.value})} className={inputCls} />
          </div>
        </div>

        {fix.startDate && fix.endDate && days > 0 && (
          <div>
            <div className="h-1.5 rounded-full bg-dark-surface-2">
              <div className={`rounded-full h-full transition-all ${progressColor}`} style={{ width: `${progressPct}%` }} />
            </div>
            <p className={`mt-1 text-[10px] ${daysLeftColor}`}>{daysLeft} días restantes</p>
          </div>
        )}

        <div>
          <label className={labelCls}>Observaciones</label>
          <textarea rows={2} value={fix.observation} placeholder="Notas…"
            onChange={e=>u({observation:e.target.value})} className={`${inputCls} resize-none`} />
        </div>

        {/* Save contract */}
        <div>
          <button
            onClick={handleSaveContract}
            disabled={!canSave || saveState==="saving"}
            className={`w-full rounded py-2 text-xs font-semibold transition-colors ${
              !canSave
                ? "bg-dark-surface-2 text-dark-ink-3 cursor-not-allowed"
                : saveState==="ok"
                ? "bg-success/20 text-success"
                : saveState==="error"
                ? "bg-danger/20 text-danger"
                : saveState==="saving"
                ? "bg-accent/70 text-white cursor-wait"
                : "bg-accent hover:bg-accent-600 text-white"
            }`}
          >
            {saveState==="saving" ? "Guardando…"
             : saveState==="ok"   ? "✓ Contrato guardado"
             : saveState==="error"? "Error — reintentar"
             : "Guardar contrato"}
          </button>
          {saveState==="error" && (
            <p className="mt-1 text-[10px] text-danger">{saveError}</p>
          )}
          {!canSave && saveState==="idle" && (
            <p className="mt-1 text-[10px] text-dark-ink-3">
              Requiere proveedor, fechas y valor &gt; 0.
            </p>
          )}
        </div>

        <div className="rounded-lg border border-dark-line/50 bg-dark-bg/60 p-2 font-mono text-[10px] text-dark-ink-3">
          <p>{fix.w.toFixed(1)} × {fix.d.toFixed(1)} × {fix.h.toFixed(1)} m</p>
          <p>pos ({fix.x.toFixed(1)}, {fix.z.toFixed(1)}) · {Math.round(((fix.rotY*180/Math.PI)%360+360)%360)}°</p>
          {fix.gondolaType && <p className="font-mono uppercase">{fix.gondolaType}</p>}
        </div>
      </div>
    </div>
  );
}

// ─── Canvas error boundary ────────────────────────────────────────────────────

class CanvasErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", height: "100%", gap: 12, color: "var(--ink-2)",
        }}>
          <span style={{ fontSize: 32 }}>⚠️</span>
          <span style={{ fontSize: 14, fontWeight: 600 }}>Error en el editor 3D</span>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              padding: "6px 16px", borderRadius: 6, border: "1px solid var(--line)",
              background: "var(--surface-2)", cursor: "pointer", fontSize: 13,
            }}
          >
            Reintentar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function StoreEditor3D() {
  // ── Unified store (read once on mount; write on every change) ────────────────
  const { setFixtures: pushToStore, setSede: pushSedeToStore, commit, undo, redo } = useFixtureStore();
  // Reactive subscription — re-renders when fixtures change (replaces getState() calls in JSX)
  const fixtures = useFixtureStore(selectFixtures);

  const [placedFixtures, setPlacedFixtures] = useState<PlacedFixture[]>(() =>
    storeToFixtures(selectFixtures(useFixtureStore.getState()))
  );
  const [selectedId, setSelectedId]         = useState<string|null>(null);
  const [selectedSlotId, setSelectedSlotId] = useState<string|null>(null);
  const [hoveredSlotId, setHoveredSlotId]   = useState<string|null>(null);
  const [placingDef, setPlacingDef]         = useState<FixtureDef|null>(null);
  const [ghostX, setGhostX]                 = useState(STORE_W/2);
  const [ghostZ, setGhostZ]                 = useState(STORE_D/2);
  const [ghostRotY, setGhostRotY]           = useState(0);
  const [ghostCollides, setGhostCollides]   = useState(false);
  const [savedAt, setSavedAt]               = useState<Date|null>(null);
  const [showSavedFeedback, setShowSavedFeedback] = useState(false);
  const [warning, setWarning]               = useState<string|null>(null);
  const [sede, setSede]                     = useState(()=>useFixtureStore.getState().sede);

  // MEJORA 4: Presentation mode
  const [presentationMode, setPresentationMode] = useState(false);

  // MEJORA 8: First-person mode
  const [firstPerson, setFirstPerson] = useState(false);

  // MEJORA 9: Hover tooltip
  const [hoveredFixtureId, setHoveredFixtureId] = useState<string|null>(null);
  const [tooltipPos, setTooltipPos]             = useState<{x:number;y:number}>({x:0,y:0});

  // MEJORA 5: Screenshot
  const screenshotFnRef = useRef<(() => void) | null>(null);
  const handleScreenshot = useCallback(() => { screenshotFnRef.current?.(); }, []);
  const setScreenshotFn  = useCallback((fn: () => void) => { screenshotFnRef.current = fn; }, []);

  // Vista superior: same pattern — Scene registers the fn, toolbar button calls it
  const topViewFnRef = useRef<(() => void) | null>(null);
  const handleTopView  = useCallback(() => { topViewFnRef.current?.(); }, []);
  const setTopViewFn   = useCallback((fn: () => void) => { topViewFnRef.current = fn; }, []);

  const orbitRef   = useRef<ThreeOrbitControls|null>(null);
  const draggingId = useRef<string|null>(null);

  // CHANGE 3 — u: undoable mutation helper
  // Updates local state AND records an undoable snapshot in the store.
  const u = useCallback((fn: (prev: PlacedFixture[]) => PlacedFixture[]) => {
    setPlacedFixtures(prev => {
      const next = fn(prev);
      // Commit to store immediately so undo history captures this snapshot
      const existingStore = selectFixtures(useFixtureStore.getState());
      commit(fixturesToStore(next, useFixtureStore.getState().sede, existingStore));
      return next;
    });
  }, [commit]);

  // ── Sync fixtures + sede → unified store ─────────────────────────────────────
  const prevSede3DRef = useRef(sede);
  useEffect(() => {
    const existingStore = selectFixtures(useFixtureStore.getState());
    const converted = fixturesToStore(placedFixtures, sede, existingStore);
    if (draggingId.current) {
      // During drag: update display without creating an undo entry or triggering server sync
      pushToStore(converted);
    } else {
      // Drag ended or fixtures changed outside drag: commit properly (undoable, server sync)
      commit(converted);
    }
  }, [placedFixtures, sede, pushToStore, commit]);

  useEffect(() => {
    if (prevSede3DRef.current === sede) return;
    prevSede3DRef.current = sede;
    // Switch sede in store (clears undo/redo) then reinit canvas
    pushSedeToStore(sede);
    const newFixtures = useFixtureStore.getState().fixturesBySede[sede] ?? [];
    setPlacedFixtures(storeToFixtures(newFixtures));
  }, [sede, pushSedeToStore]);

  useEffect(() => {
    if (!warning) return;
    const t = setTimeout(()=>setWarning(null), 4000);
    return ()=>clearTimeout(t);
  }, [warning]);

  useEffect(()=>{
    const up=()=>{
      if(draggingId.current){ draggingId.current=null; if(orbitRef.current) orbitRef.current.enabled=true; }
    };
    window.addEventListener("pointerup",up);
    return ()=>window.removeEventListener("pointerup",up);
  },[]);

  useEffect(()=>{
    function onKey(e: KeyboardEvent){
      const tag=(e.target as HTMLElement).tagName.toLowerCase();
      if(tag==="input"||tag==="textarea"||tag==="select") return;
      // CHANGE 3 — Undo / Redo
      if(e.ctrlKey && e.key==="z" && !e.shiftKey){
        e.preventDefault();
        undo();
        // Sync store state back to local after undo
        setPlacedFixtures(storeToFixtures(selectFixtures(useFixtureStore.getState())));
        return;
      }
      if(e.ctrlKey && (e.key==="y" || (e.key==="z" && e.shiftKey))){
        e.preventDefault();
        redo();
        // Sync store state back to local after redo
        setPlacedFixtures(storeToFixtures(selectFixtures(useFixtureStore.getState())));
        return;
      }
      if(e.key==="Escape"){
        setPlacingDef(null); setSelectedId(null); setSelectedSlotId(null);
        setFirstPerson(false);
      }
      if((e.key==="r"||e.key==="R")&&!e.ctrlKey){
        e.preventDefault();
        if(placingDef) setGhostRotY(r=>r+Math.PI/2);
        else if(selectedId) u(p=>p.map(f=>f.id===selectedId?{...f,rotY:f.rotY+Math.PI/2}:f));
      }
      if((e.key==="f"||e.key==="F")&&!e.ctrlKey&&selectedId){
        e.preventDefault();
        u(p=>p.map(f=>f.id===selectedId?{...f,w:f.d,d:f.w}:f));
      }
      if((e.key==="Delete"||e.key==="Backspace")&&selectedId&&!placingDef){
        e.preventDefault();
        u(p=>p.filter(f=>f.id!==selectedId));
        setSelectedId(null); setSelectedSlotId(null);
      }
    }
    window.addEventListener("keydown",onKey);
    return ()=>window.removeEventListener("keydown",onKey);
  },[placingDef,selectedId,u,undo,redo]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const onFloorMove = useCallback((x:number, z:number) => {
    setGhostX(x);
    setGhostZ(z);
    if (placingDef) {
      const collides = hasAABBCollision({x, z}, placingDef, placedFixtures);
      setGhostCollides(collides);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placingDef, placedFixtures]);

  function onFloorClick(x:number, z:number){
    if(placingDef){
      const warn = validatePlacement(placingDef, {x,z}, placedFixtures);
      if(warn) setWarning(warn);
      const newCode = generateCode(sede, placingDef, placedFixtures);
      const newFix: PlacedFixture = {
        id:              `${placingDef.type}-${Date.now()}`,
        code:            newCode,
        type:            placingDef.type,
        gondolaType:     placingDef.gondolaType,
        x, z, rotY:     ghostRotY,
        w:               placingDef.w,
        d:               placingDef.d,
        h:               placingDef.h,
        label:           placingDef.label,
        color:           placingDef.color,
        supplierName:    "",
        brandCategory:   "",
        status:          "free",
        negotiatedValue: 0,
        startDate:       "",
        endDate:         "",
        observation:     "",
      };
      newFix.slots = defaultSlots({ type:newFix.type, w:newFix.w, h:newFix.h, code:newCode });
      u(prev=>[...prev,newFix]);
    } else {
      setSelectedId(null);
      setSelectedSlotId(null);
    }
  }

  function onSelectFixture(id:string){
    if(!placingDef && !firstPerson){ setSelectedId(id); setSelectedSlotId(null); }
  }

  function onSelectSlot(fixtureId:string, slotId:string){
    setSelectedId(fixtureId);
    setSelectedSlotId(slotId);
  }

  // B2: route through u() so commercial panel edits (supplier, dates, status) are undoable
  const updateFixture = useCallback((id:string, updates:Partial<PlacedFixture>)=>{
    u(prev=>prev.map(f=>f.id===id?{...f,...updates}:f));
  },[u]);

  const updateSlot = useCallback((fixtureId:string, slotId:string, updates:Partial<ShelfSlot>)=>{
    u(prev=>prev.map(f=>{
      if(f.id!==fixtureId||!f.slots) return f;
      return {...f, slots:f.slots.map(s=>s.id===slotId?{...s,...updates}:s)};
    }));
  },[u]);

  function rotateSelected(){ if(!selectedId) return; u(p=>p.map(f=>f.id===selectedId?{...f,rotY:f.rotY+Math.PI/2}:f)); }
  function flipSelected(){   if(!selectedId) return; u(p=>p.map(f=>f.id===selectedId?{...f,w:f.d,d:f.w}:f)); }
  function deleteSelected(){
    if(!selectedId) return;
    u(p=>p.filter(f=>f.id!==selectedId));
    setSelectedId(null); setSelectedSlotId(null);
  }
  function handleSave(){
    // Fixtures are auto-saved to the store on every change via useEffect.
    // This button gives explicit visual feedback.
    setSavedAt(new Date());
    setShowSavedFeedback(true);
    setTimeout(() => setShowSavedFeedback(false), 3000);
  }
  function handleClear(){
    if(confirm("¿Limpiar todo el espacio?")){ setPlacedFixtures([]); setSelectedId(null); setSelectedSlotId(null); setSavedAt(null); }
  }

  // MEJORA 9: hover callback
  const onHoverFixture = useCallback((id: string|null, x: number, y: number) => {
    setHoveredFixtureId(id);
    if (id) setTooltipPos({ x, y });
  }, []);

  const selectedFix  = placedFixtures.find(f=>f.id===selectedId)??null;
  const selectedSlot = selectedFix?.slots?.find(s=>s.id===selectedSlotId)??null;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-1 overflow-hidden rounded-xl border border-dark-line bg-dark-bg" style={{minHeight:0}}>

      {/* ── Left sidebar — hidden in presentation mode ── */}
      <div className={`flex w-52 flex-shrink-0 flex-col gap-3 overflow-y-auto border-r border-dark-line bg-dark-surface p-3 ${presentationMode ? 'hidden' : ''}`}>

        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-dark-ink-3">Sede</label>
          <input type="text" value={sede} maxLength={10} onChange={e=>setSede(e.target.value.toUpperCase())}
            className="w-full border-0 border-b-2 border-dark-line-2 bg-transparent rounded-none px-0 font-mono text-sm text-accent-200 focus:border-accent focus:outline-none"
            placeholder="TERRON" />
        </div>

        <div className="border-t border-dark-line" />

        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-dark-ink-3">Fixtures</p>
          <div className="flex flex-col gap-1.5">
            {FIXTURE_DEFS.map((def,idx) => {
              const active=placingDef?.type===def.type&&placingDef?.gondolaType===def.gondolaType&&(def.type!=="gondola"||placingDef?.label===def.label);
              return (
                <button key={idx}
                  onClick={()=>{ setPlacingDef(active?null:def); setSelectedId(null); setSelectedSlotId(null); if(!active) setGhostRotY(0); }}
                  className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition-all duration-150 ${
                    active
                      ? "ring-2 ring-accent ring-offset-1 ring-offset-dark-surface bg-accent/20 border-accent text-accent-200"
                      : "border-dark-line-2 bg-dark-surface-2 text-dark-ink-2 hover:bg-dark-line hover:border-dark-line-2"}`}>
                  <span className="w-8 h-8 rounded-lg flex items-center justify-center text-lg bg-dark-line/50 flex-shrink-0">{def.emoji}</span>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-dark-ink-1">{def.label}</p>
                    <p className="text-[10px] text-dark-ink-3">{def.w}×{def.d}×{def.h} m</p>
                  </div>
                  {active&&<span className="ml-auto h-2.5 w-2.5 flex-shrink-0 animate-pulse rounded-full bg-accent"/>}
                </button>
              );
            })}
          </div>
        </div>

        <div className="border-t border-dark-line" />

        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-dark-ink-3">Estados</p>
          <div className="flex flex-col gap-1">
            {(["free","occupied","reserved"] as SpaceStatus[]).map(s=>{
              const sm=STATUS_META[s];
              return (
                <span key={s} className={`flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-medium ${sm.bg} ${sm.text}`}>
                  <span className="h-2 w-2 rounded-full flex-shrink-0" style={{background:STATUS_COLORS[s]}}/>
                  {sm.label}
                </span>
              );
            })}
          </div>
        </div>

        <div className="border-t border-dark-line" />

        <div className="text-[10px] text-dark-ink-3 space-y-0.5">
          <p><kbd className="rounded-md border border-dark-line-2 bg-dark-surface-2 px-1.5 py-0.5 text-[10px] font-mono text-dark-ink-2 shadow-sm">R</kbd> Rotar 90°</p>
          <p><kbd className="rounded-md border border-dark-line-2 bg-dark-surface-2 px-1.5 py-0.5 text-[10px] font-mono text-dark-ink-2 shadow-sm">F</kbd> Flip ancho/fondo</p>
          <p><kbd className="rounded-md border border-dark-line-2 bg-dark-surface-2 px-1.5 py-0.5 text-[10px] font-mono text-dark-ink-2 shadow-sm">Del</kbd> Eliminar</p>
          <p><kbd className="rounded-md border border-dark-line-2 bg-dark-surface-2 px-1.5 py-0.5 text-[10px] font-mono text-dark-ink-2 shadow-sm">Esc</kbd> Cancelar</p>
        </div>

        <div className="mt-auto flex flex-col gap-1.5">
          <button onClick={handleSave}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-accent hover:bg-accent-600 shadow-lg active:scale-[0.98] transition-all py-2 text-xs font-semibold text-white">
            {showSavedFeedback
              ? <><span className="text-success-100">✓</span> <span className="text-success-100">Guardado</span></>
              : <><Save size={12}/> Guardar</>
            }
          </button>
          {savedAt && !showSavedFeedback && <p className="text-center text-[9px] text-dark-ink-3">Guardado {savedAt.toLocaleTimeString()}</p>}
          <button onClick={handleClear} className="text-center text-[10px] text-dark-ink-3 transition-colors hover:text-danger">Limpiar todo</button>
        </div>
      </div>

      {/* ── Canvas ── */}
      <div className="relative flex-1 overflow-hidden">

        {/* MEJORA 4: Status bar — hidden in presentation mode */}
        {!presentationMode && (
          <div className={`absolute inset-x-0 top-0 z-10 flex items-center gap-3 border-b px-4 py-1.5 text-[10px] backdrop-blur-sm ${
            warning
              ? "bg-warning/10 border-warning/30"
              : placingDef
                ? "bg-accent/10 border-accent/30"
                : "bg-dark-bg/85 border-dark-line/60"
          }`}>
            {warning ? (
              <span className="flex items-center gap-1.5 text-warning">
                <AlertTriangle size={12} className="text-warning"/> {warning}
              </span>
            ) : placingDef ? (
              <span className="flex items-center gap-2 text-accent-200">
                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-accent flex-shrink-0"/>
                Colocando <strong className="text-white">{placingDef.label}</strong>
                <span className="text-accent/40">·</span>
                <kbd className="rounded border border-dark-line-2 bg-dark-surface px-1 text-dark-ink-2">clic</kbd> ubicar ·
                <kbd className="rounded border border-dark-line-2 bg-dark-surface px-1 text-dark-ink-2">R</kbd> rotar ·
                <kbd className="rounded border border-dark-line-2 bg-dark-surface px-1 text-dark-ink-2">Esc</kbd> cancelar
              </span>
            ) : (
              <span className="flex items-center gap-2 text-dark-ink-2">
                {placedFixtures.length} fixture{placedFixtures.length!==1?"s":""}
                {selectedFix&&(
                  <span className="flex items-center gap-1 ml-2">
                    <span className="text-dark-ink-3">·</span>
                    <span className="font-mono text-xs bg-dark-surface rounded px-2 py-0.5 text-accent-200">{selectedFix.code}</span>
                    {selectedSlot&&<span className="text-warning">› {selectedSlot.id}</span>}
                  </span>
                )}
              </span>
            )}
            <span className="ml-auto hidden text-dark-ink-3 lg:block">drag → orbitar · scroll → zoom</span>

            {/* Vista superior — alinea cámara cenital para mover fixtures fácil */}
            <button onClick={handleTopView}
              title="Vista superior (cenital) — ideal para mover fixtures"
              className="flex items-center gap-1 rounded border border-dark-line-2 bg-dark-surface px-2 py-0.5 text-[10px] text-dark-ink-2 hover:bg-dark-surface-2 transition-colors">
              ⊞ Top
            </button>

            {/* MEJORA 8: First-person button */}
            <button onClick={() => setFirstPerson(p => !p)}
              title="Modo primera persona (WASD)"
              className={`flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] transition-all ${
                firstPerson
                  ? 'border-success/50 bg-success/15 text-success'
                  : 'border-dark-line-2 bg-dark-surface text-dark-ink-2 hover:bg-dark-surface-2'
              }`}>
              <User size={10}/> {firstPerson ? 'Orbital' : '1ª Persona'}
            </button>

            {/* MEJORA 5: Screenshot button */}
            <button onClick={handleScreenshot} title="Capturar imagen"
              className="flex items-center gap-1 rounded border border-dark-line-2 bg-dark-surface px-2 py-0.5 text-[10px] text-dark-ink-2 hover:bg-dark-surface-2 transition-colors">
              <Camera size={10}/> PNG
            </button>

            {/* MEJORA 4: Presentation mode button */}
            <button
              onClick={() => setPresentationMode(p => !p)}
              title="Modo presentación"
              className={`flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] transition-all ${
                presentationMode
                  ? 'border-accent/50 bg-accent/15 text-accent-200'
                  : 'border-dark-line-2 bg-dark-surface text-dark-ink-2 hover:bg-dark-surface-2'
              }`}
            >
              {presentationMode ? <EyeOff size={10}/> : <Eye size={10}/>}
              {presentationMode ? 'Salir' : 'Presentar'}
            </button>

            {placingDef && (
              <button onClick={()=>setPlacingDef(null)}
                className="flex items-center gap-1 rounded border border-dark-line-2 bg-dark-surface-2 hover:bg-dark-line px-2 py-0.5 text-[10px] text-dark-ink-2 active:scale-95 transition-all">
                <X size={10}/> Cancelar
              </button>
            )}
          </div>
        )}

        {placedFixtures.length === 0 && !placingDef && !presentationMode && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10">
            <div className="flex flex-col items-center gap-4 text-center max-w-xs">
              <div className="w-20 h-20 rounded-2xl bg-dark-surface border border-dark-line flex items-center justify-center">
                <Boxes size={36} className="text-dark-ink-3" />
              </div>
              <div>
                <p className="text-dark-ink-2 font-medium text-sm">Tu tienda está vacía</p>
                <p className="text-dark-ink-3 text-xs mt-1">Seleccioná un fixture del panel izquierdo y hacé clic en el piso para colocarlo</p>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-dark-ink-3">
                <kbd className="rounded border border-dark-line-2 bg-dark-surface px-1.5 py-0.5 font-mono">R</kbd>
                <span>rotar antes de colocar</span>
              </div>
            </div>
          </div>
        )}

        <CanvasErrorBoundary>
          <Canvas
            camera={{ position:CAM_POS, fov:50, near:0.1, far:500 }}
            onCreated={({ camera })=>{ camera.lookAt(...CAM_TARGET); }}
            gl={{ antialias:true, preserveDrawingBuffer: true }}
            shadows={{ type: THREE.PCFSoftShadowMap }}
            frameloop="demand"
            dpr={[1, 1.5]}
            style={{ background:"#e8e4dc", width:"100%", height:"100%" }}
          >
            <Scene
              placedFixtures={placedFixtures}
              selectedId={selectedId}
              selectedSlotId={selectedSlotId}
              hoveredSlotId={hoveredSlotId}
              setHoveredSlotId={setHoveredSlotId}
              placingDef={placingDef}
              ghostX={ghostX}
              ghostZ={ghostZ}
              ghostRotY={ghostRotY}
              ghostCollides={ghostCollides}
              draggingId={draggingId}
              orbitRef={orbitRef}
              onFloorMove={onFloorMove}
              onFloorClick={onFloorClick}
              onSelectFixture={onSelectFixture}
              onSelectSlot={onSelectSlot}
              setPlacedFixtures={setPlacedFixtures}
              screenshotReady={setScreenshotFn}
              topViewReady={setTopViewFn}
              firstPerson={firstPerson}
              onHoverFixture={onHoverFixture}
              fixtures={fixtures}
            />
          </Canvas>
        </CanvasErrorBoundary>

        {/* MEJORA 9: Tooltip on hover */}
        {hoveredFixtureId && (() => {
          const fix = placedFixtures.find(f => f.id === hoveredFixtureId);
          if (!fix || fix.id === selectedId) return null;
          const sm = STATUS_META[fix.status];
          return (
            <div
              className="pointer-events-none absolute z-30 rounded-lg border border-dark-line bg-dark-surface/95 px-3 py-2 text-xs shadow-xl backdrop-blur-sm"
              style={{ left: tooltipPos.x + 12, top: tooltipPos.y - 8, transform: 'translateY(-100%)' }}
            >
              <p className="font-mono font-bold text-accent-200">{fix.code}</p>
              <p className="text-dark-ink-1">{fix.label}</p>
              {fix.supplierName && <p className="text-dark-ink-2 mt-0.5">🏢 {fix.supplierName}</p>}
              {fix.negotiatedValue > 0 && <p className="text-success mt-0.5">💵 ${fix.negotiatedValue}/mes</p>}
              <span className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${sm.bg} ${sm.text}`}>
                {sm.label}
              </span>
            </div>
          );
        })()}

        {/* MEJORA 4: Presentation mode overlay pill */}
        {presentationMode && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 rounded-full border border-white/10 bg-black/40 px-4 py-2 backdrop-blur-sm">
            <span className="text-xs text-white/60">Modo presentación</span>
            <button onClick={() => setPresentationMode(false)}
              className="rounded-full bg-white/10 px-3 py-1 text-xs text-white hover:bg-white/20 transition-colors">
              Salir
            </button>
          </div>
        )}

        {/* MEJORA 8: First-person overlay instructions */}
        {firstPerson && (
          <div className="absolute inset-0 flex flex-col items-end justify-end p-4 pointer-events-none z-10">
            <div className="rounded-xl border border-white/10 bg-black/50 p-3 backdrop-blur-sm text-xs text-white/70 space-y-1">
              <p className="font-semibold text-white/90 mb-2">Modo Primera Persona</p>
              <p><kbd className="bg-white/10 rounded px-1">Clic</kbd> para capturar el mouse</p>
              <p><kbd className="bg-white/10 rounded px-1">WASD</kbd> para moverse</p>
              <p><kbd className="bg-white/10 rounded px-1">Esc</kbd> para soltar el mouse</p>
              <button onClick={() => setFirstPerson(false)} className="pointer-events-auto mt-2 w-full rounded bg-white/10 hover:bg-white/20 px-2 py-1 text-center">
                Volver a vista orbital
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Right panel — hidden in presentation mode ── */}
      {selectedFix && !presentationMode && (
        <CommercialPanel
          fix={selectedFix}
          sede={sede}
          selectedSlot={selectedSlot}
          onUpdate={updateFixture}
          onUpdateSlot={updateSlot}
          onRotate={rotateSelected}
          onFlip={flipSelected}
          onDelete={deleteSelected}
          onClose={()=>{ setSelectedId(null); setSelectedSlotId(null); }}
          onSlotClose={()=>setSelectedSlotId(null)}
        />
      )}
    </div>
  );
}
