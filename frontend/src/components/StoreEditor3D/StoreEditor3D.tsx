import React, { useState, useRef, useEffect, useMemo, memo, useCallback } from "react";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { OrbitControls as ThreeOrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";
import {
  Trash2, RotateCw, FlipHorizontal2, Save, X,
  Building2, DollarSign, Calendar, Tag, Info, AlertTriangle, Boxes,
  Eye, EyeOff, Camera, User, Package, Plus, Search, Upload, Loader2,
} from "lucide-react";
import { Html } from "@react-three/drei";
import { useFixtureStore, selectFixtures } from "../../store/fixtureStore";
import { useModalAbierto } from "../../tema";
import { isDoubleGondola, isRentable, fullSpaceCode, NON_RENTABLE_BY_DEFAULT } from "../../types/fixtures";
import type { UnifiedFixture, FixType, GondolaType, SpaceStatus } from "../../types/fixtures";
import {
  nombreDeMueble, renombrar, intercambiarNombres, choqueDeNombre,
  textoDelChoque, textoDelIntercambio, normalizar as normalizarNombre,
} from "../../utils/nomenclatura";
import type { RechazoDeNombre } from "../../utils/nomenclatura";
import { fileUrl, getFaceImages } from "../../api/files";
import { arteUrl, listarCatalogo, subirArte, type Arte } from "../../api/catalogo";
import { getSuppliers } from "../../api/suppliers";
import { describeError } from "../../api/client";
// Extensión real del local y física de la caminata — geometría pura, probada
// aparte. STORE_W/STORE_D describen una tienda ficticia que ninguna sede ocupa.
import {
  huella, limitesDePlanta, lugarDeLaFigura, murosDeCaminata, puntoDeEntrada, puntoLibreCerca, resolverPaso,
  TOLERANCIA_CONTACTO,
  vistaGeneral, miradaSensata, vistaDeCara,
  type Vista3D,
  VEL_CAMINANDO, VEL_APURADA,
  type LimitesPlanta,
} from "../../utils/planta";
import { useAuthStore, selectIsAdmin } from "../../store/authStore";
import MiniMapa, { type CamaraEnPlanta } from "../MiniMapa/MiniMapa";
import { componerPropuesta, descargar, nombreDeArchivo } from "../../utils/propuesta";
import { siguienteCodigo } from "../../utils/nomenclatura";
import { calculateShelfCapacity, createGondolaPlanogram, generateProductPlacements } from "../../utils/planogram";
import type { FixturePlanogram } from "../../types/retail3d";
import { ProductShelfContents } from "./ProductShelfContents";

// ─── Scene constants ──────────────────────────────────────────────────────────

const STORE_W = 30;
const STORE_D = 42;
const SNAP    = 0.05;   // matches FloorPlan2D's snapTo grid (5 cm)
// Camera is placed on the far (north) side so that the Z axis matches the 2D view:
// small Z (2D-top) → far from camera → appears at top of 3D scene.
// Previously the camera was at Z=-8 (south side), which flipped the 2D/3D relationship.
/** Caja de respaldo cuando la planta está vacía: no hay muebles de donde deducirla. */
const PLANTA_NOMINAL = { minX: 0, maxX: STORE_W, minZ: 0, maxZ: STORE_D };
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

// ─── La lámina de producto ───────────────────────────────────────────────────
//
// El producto se pintaba sobre el panel TRASERO de cada mueble —la espina de la
// góndola, la placa de la punta, la pared de la nevera—. Es el sitio cómodo:
// esos paneles ya existen y ya heredan la transformación del mueble. Pero en
// una góndola de 0.9 m de fondo eso deja el producto **44 cm detrás del filo
// del entrepaño**, y al mirarla de frente se ve un estante vacío con algo
// pintado al fondo. En una tienda el producto está adelante: eso es lo que
// significa un «facing», y es lo que el proveedor viene a comprar.
//
// Ahora la imagen va en una lámina propia, parada al frente del entrepaño. No
// repite la matemática de ubicación del mueble —el error que hundió los dos
// intentos anteriores de poner geometría nueva—: es hija del mismo grupo, así
// que sólo conoce coordenadas locales.

/** Cuánto atrás del plano exterior del mueble se para el producto.
 *  Cinco centímetros: lo justo para que el riel de precio y el filo del
 *  entrepaño queden por delante, como en un lineal de verdad. */
const RETRANQUEO = 0.05;
/** Espesor de la lámina. No es el envase: es lo mínimo para que de perfil no
 *  se vea un papel. */
const ESPESOR_LAMINA = 0.03;

/** Material invisible para las caras de la lámina que NO llevan la textura.
 *  Sin esto la lámina sería una placa opaca tapando el estante entero. */
let matInvisible: THREE.MeshBasicMaterial | null = null;
function getInvisible(): THREE.MeshBasicMaterial {
  if (!matInvisible) {
    matInvisible = new THREE.MeshBasicMaterial({
      transparent: true, opacity: 0, depthWrite: false,
    });
  }
  return matInvisible;
}

/**
 * El producto parado al frente del mueble, en una o en las dos caras.
 *
 * `y` y `alto` son los MISMOS que tenía el panel pintado de antes: la textura
 * viene compuesta con las filas alineadas a los entrepaños reales
 * (`getPanelShelfSpan`) en el espacio local de ese panel, así que mover la
 * lámina en Z no toca la alineación. Cambiar `y` o `alto` sí la rompería.
 */
function LaminaDeProducto({
  ancho, alto, y, fondo, doble = false, facePaint,
}: {
  ancho: number;
  alto: number;
  /** Centro vertical del panel, en local. */
  y: number;
  /** Fondo del mueble: la lámina se para a `RETRANQUEO` de su plano exterior. */
  fondo: number;
  /** El mueble se vende por las dos caras (góndola doble). */
  doble?: boolean;
  facePaint?: FacePaint | null;
}) {
  const caraA = facePaint?.front ?? null;
  const caraB = doble ? (facePaint?.back ?? null) : null;

  // La cara pintada es la EXTERIOR de la lámina (índice 5 = -Z, 4 = +Z), así
  // que el centro se corre medio espesor hacia adentro para que la imagen
  // quede exactamente sobre el retranqueo.
  const zA = -(fondo / 2 - RETRANQUEO) + ESPESOR_LAMINA / 2;
  const zB =  (fondo / 2 - RETRANQUEO) - ESPESOR_LAMINA / 2;

  const matsA = useMemo(
    () => (caraA ? facePaintArray(getInvisible(), caraA, null) : null), [caraA],
  );
  const matsB = useMemo(
    () => (caraB ? facePaintArray(getInvisible(), null, caraB) : null), [caraB],
  );

  return (
    <>
      {matsA && (
        <mesh position={[0, y, zA]} material={matsA}>
          <boxGeometry args={[ancho, alto, ESPESOR_LAMINA]} />
        </mesh>
      )}
      {matsB && (
        <mesh position={[0, y, zB]} material={matsB}>
          <boxGeometry args={[ancho, alto, ESPESOR_LAMINA]} />
        </mesh>
      )}
    </>
  );
}

/**
 * El producto a granel, visto desde arriba.
 *
 * Es la forma que le faltaba al sistema. Una batea, una isla de piso o un
 * mostrador de carnes no tienen ninguna cara vertical donde pegar un facing:
 * el producto se ve desde arriba, volcado. Sin esto, la mitad del catálogo
 * —justo la mitad promocional— no se podía vestir.
 *
 * `y` es la altura de la superficie y `hundido` cuánto queda por debajo del
 * borde del canasto: un volcado al ras del borde se ve como una tapa impresa.
 */
function VolcadoDeProducto({
  ancho, fondo, y, material,
}: {
  ancho: number;
  fondo: number;
  y: number;
  material: THREE.Material | null | undefined;
}) {
  if (!material) return null;
  return (
    <mesh position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]} material={material}>
      <planeGeometry args={[ancho, fondo]} />
    </mesh>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

// FixType, GondolaType, SpaceStatus imported from ../../types/fixtures

// Same palette as the 2D plan and the Dashboard map — one colour language for
// the whole app. Slightly brighter values than the 2D strokes because these are
// lit 3D materials, not flat SVG fills.
const STATUS_COLORS: Record<SpaceStatus, string> = {
  free:        "#4CC38A",
  occupied:    "#E24B4B",   // rojo: ocupado no se puede vender
  reserved:    "#F0B429",
  maintenance: "#A8A29E",
};

// Non-rentable fixtures are store infrastructure. Painting them slate keeps the
// commercial colour language (green/red/amber) meaningful: every coloured mesh
// in the scene is sellable space.
const NON_RENTABLE_COLOR = "#64748b";

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
  planogram?:      FixturePlanogram;
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
  /** False marks infrastructure that is never rented out. Undefined = rentable. */
  rentable?:       boolean;
}

// ─── Fixture catalogue ────────────────────────────────────────────────────────

const FIXTURE_DEFS: FixtureDef[] = [
  // ── Góndolas ──────────────────────────────────────────────────────────────
  { type:"gondola", gondolaType:"double", label:"Góndola Doble",    w:1.20, d:0.90, h:1.80, color:"#6366f1", emoji:"📚", desc:"Módulo de estante central, doble cara",   code:"GON" },
  { type:"gondola", gondolaType:"wall",   label:"Góndola Mural",    w:1.20, d:0.45, h:1.90, color:"#818cf8", emoji:"🧱", desc:"Módulo de estante contra pared",           code:"GON" },
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
  { type:"servicio_cliente",              label:"Servicio al Cliente", w:1.60, d:0.70, h:1.10, color:"#0ea5e9", emoji:"💁", desc:"Mostrador de atención: devoluciones, reclamos e información", code:"SAC" },
  // ── Infraestructura ───────────────────────────────────────────────────────
  { type:"metro",                         label:"Zona Libre",       w:1.00, d:1.00, h:0.05, color:"#64748b", emoji:"⬜", desc:"Área de suelo demarcada",                  code:"MET" },
  { type:"columna",                       label:"Columna",          w:0.30, d:0.30, h:3.00, color:"#94a3b8", emoji:"🏛️", desc:"Columna estructural",                      code:"COL" },
  // ── Accesorios de góndola ─────────────────────────────────────────────────
  // Robatope: w=0.30 (ancho del panel), d=0.40 (= profundidad de la Punta → encaja al ras)
  { type:"robatope",                      label:"Robatope",         w:0.30, d:0.40, h:1.60, color:"#c0c0bc", emoji:"🛡️", desc:"Panel lateral de protección — flanquea la Punta de Góndola", code:"ROB" },
];

// Chip styling mirrors STATUS_COLORS: ocupado se lee rojo, igual que el mueble.
const STATUS_META: Record<SpaceStatus, { bg: string; text: string; label: string }> = {
  free:        { bg:"bg-success/20",  text:"text-success",  label:"Disponible"    },
  occupied:    { bg:"bg-danger/20",   text:"text-danger",   label:"Ocupado"       },
  reserved:    { bg:"bg-warning/20",  text:"text-warning",  label:"Reservado"     },
  maintenance: { bg:"bg-dark-surface-2", text:"text-dark-ink-2", label:"Mantenimiento" },
};

// ─── Code & slot generation ───────────────────────────────────────────────────

/**
 * El código de un mueble nuevo.
 *
 * Antes acá se CONTABA cuántos había del mismo prefijo y se sumaba uno, y
 * además se anteponía la sede: dos problemas. Borrar `GON-02` hacía que el
 * siguiente volviera a ser `GON-02` —dos muebles con el mismo código, y con
 * eso dos espacios compartiendo contratos y correos— y el plano 2D generaba
 * `GON-01` donde éste generaba `NAVE-GON-001`, así que el mismo plano quedaba
 * con dos maneras de nombrar según por dónde se hubiera dibujado.
 *
 * La sede no va en el código: se antepone al guardar el espacio
 * (`fullSpaceCode`), que es donde hace falta que sea único entre sedes.
 */
function generateCode(_sede: string, def: FixtureDef, existing: PlacedFixture[]): string {
  return siguienteCodigo(def.gondolaType ? "gondola" : def.type, existing);
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
    // Contra la caja nominal, en una sede real esta advertencia salía siempre:
    // las paredes están donde terminan los muebles, no en x = 30 / z = 42.
    const margin = 3;
    const lim = limitesDePlanta(existing, 0, PLANTA_NOMINAL);
    const nearWall = pos.x < lim.minX + margin || pos.x > lim.maxX - margin ||
                     pos.z < lim.minZ + margin || pos.z > lim.maxZ - margin;
    if (!nearWall)
      return "⚠️ Góndola Mural recomendada cerca de una pared";
  }
  if (def.type === "columna") {
    // Columns are fine anywhere — no validation needed
  }
  return null;
}

// ─── MEJORA 2: AABB collision helpers ────────────────────────────────────────

/**
 * ¿Este mueble se monta encima de otro?
 *
 * Mide la huella YA ROTADA. Antes comparaba `w` y `d` crudos, y la mayoría de
 * las góndolas de una sede real están giradas 90°: una góndola de 3,6 × 0,9 se
 * leía como 0,9 de ancho, así que se podía soltar atravesada sobre otra y el
 * editor no decía nada. (El plano 2D nunca tuvo el problema porque intercambia
 * ancho y alto al rotar, así que ahí las medidas ya venían giradas.)
 */
function hasAABBCollision(
  pos: {x:number; z:number},
  def: { w:number; d:number; rotY?: number },
  existing: PlacedFixture[],
  excludeId?: string
): boolean {
  // Pegados sí, encimados no: hasta TOLERANCIA_CONTACTO es contacto. Era 1 mm,
  // que no alcanza para absorber el ruido de las rotaciones ni el redondeo de
  // la grilla, así que armar una corrida al ras podía rebotar sin motivo.
  const TOL = TOLERANCIA_CONTACTO;
  const a = huella({ x: pos.x, z: pos.z, w: def.w, d: def.d, rotY: def.rotY ?? 0 });
  return existing
    .filter(f => f.id !== excludeId)
    .some(f => {
      const b = huella({ x: f.x, z: f.z, w: f.w, d: f.d, rotY: f.rotY });
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
  planogram?:     FixturePlanogram;
  selectedSlotId?: string | null;
  hoveredSlotId?:  string | null;
  onSlotClick?:    (slotId: string) => void;
  onSlotHover?:    (slotId: string | null) => void;
}

const GondolaMesh = memo(function GondolaMesh({
  w, d, h, statusColor, ghost,
  gondolaType = "double",
  facePaint,
  slots, planogram, selectedSlotId, hoveredSlotId,
  onSlotClick, onSlotHover,
}: GondolaMeshProps) {
  const op     = ghost ? 0.42 : 1;
  const isWall = gondolaType === "wall";
  const resolvedPlanogram = useMemo(() => planogram ?? createGondolaPlanogram({
    fixtureId: "preview", width: w, depth: d, height: h, doubleSided: !isWall,
  }), [planogram, w, d, h, isWall]);

  const G_WHITE = "#e6e6e3";
  const G_FRAME = "#c8c8c5";
  const G_PANEL = isWall ? "#d5d5d2" : "#dcdcda";
  const G_RAIL  = "#b8b8b5";
  const STEEL = "#7a8388";

  // La misma entidad Shelf gobierna la elevación del tablero y la base de los
  // productos. Así el auto-facing nunca deja envases flotando o atravesados.
  const { shelves, topH, shelfT } = useMemo(() => {
    const topH   = 0.08;
    const shelfT = 0.022;
    const n      = Math.max(4, Math.round((h - topH) / 0.38));
    const generated = Array.from({ length: n }, (_, i) =>
      0.14 + i * ((h - topH - 0.16) / Math.max(n - 1, 1))
    );
    const faceAShelves = resolvedPlanogram.shelves
      .filter(shelf => shelf.faceId === "A")
      .sort((a, b) => a.index - b.index)
      .map(shelf => shelf.elevation);
    return { shelves: faceAShelves.length ? faceAShelves : generated, topH, shelfT };
  }, [h, resolvedPlanogram.shelves]);

  const slotAreaH  = h - topH - 0.06;
  const SLOT_PROTO = 0.12;
  const backT = isWall ? d * 0.42 : 0.055;
  // Wall gondola: solid back panel flush with rear face (goes against the wall).
  // Double gondola: thin center spine at z=0 so both faces are open (symmetric).
  const backPosZ = isWall ? d / 2 - backT / 2 : 0;

  // El producto ya NO se pinta acá: la espina es estructura y queda al fondo
  // del estante. Va en `LaminaDeProducto`, parado al frente del entrepaño.
  const pinta = !ghost && !!facePaint && !!(facePaint.front || facePaint.back);
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
      {/* Remate superior. Antes era una barra blanca suspendida por encima del
          mueble, sin apoyarse en nada; una góndola de verdad se cierra con una
          tapa al ras que descansa sobre los montantes. */}
      <mesh position={[0, h + 0.016, 0]} castShadow>
        <boxGeometry args={[w, 0.032, isWall ? d : d * 0.94]} />
        <meshStandardMaterial color={G_FRAME} metalness={0.12} roughness={0.58} transparent opacity={op} />
      </mesh>

      {/* Indicadores comerciales discretos: el estado nunca repinta el acero. */}
      {([-1, 1] as const).map((side) => (
        <mesh key={`status-${side}`} position={[side * (w / 2 - 0.065), h - 0.10, -(d / 2 + 0.006)]} castShadow>
          <boxGeometry args={[0.035, 0.070, 0.012]} />
          <meshStandardMaterial color={statusColor} emissive={statusColor} emissiveIntensity={0.18} roughness={0.35} transparent opacity={op} />
        </mesh>
      ))}

      {/* Panel posterior modular: las líneas horizontales evocan panel metálico
          ranurado y rompen la apariencia de bloque plano sin sumar texturas. */}
      <mesh position={[0, h / 2, backPosZ]} castShadow>
        <boxGeometry args={[w, h, backT]} />
        <meshStandardMaterial color={G_PANEL} metalness={0.46} roughness={0.48} transparent opacity={op} />
      </mesh>
      {Array.from({ length: Math.max(3, Math.round(h / 0.32)) }, (_, index) => {
        const y = 0.13 + index * ((h - 0.26) / Math.max(2, Math.round(h / 0.32) - 1));
        const z = backPosZ + (isWall ? -1 : -1) * (backT / 2 + 0.002);
        return <mesh key={`panel-seam-${index}`} position={[0, y, z]}>
          <boxGeometry args={[w - 0.08, 0.012, 0.004]} />
          <meshStandardMaterial color="#9da3a3" metalness={0.55} roughness={0.36} transparent opacity={op * 0.7} />
        </mesh>;
      })}

      {/* El producto, al frente del entrepaño. La góndola mural va contra la
          pared: sólo se vende su cara de adelante. */}
      {pinta && (
        <LaminaDeProducto
          ancho={w} alto={h} y={h / 2} fondo={d}
          doble={!isWall} facePaint={facePaint}
        />
      )}

      {/* Shelf boards + price rails */}
      {shelves.map((sy, i) => (
        <group key={`sh${i}`}>
          <mesh position={[0, sy, 0]} castShadow>
            <boxGeometry args={[w - 0.055, shelfT, d - 0.015]} />
            <meshStandardMaterial color={G_WHITE} metalness={0.38} roughness={0.42} transparent opacity={op} />
          </mesh>
          {/* Refuerzos bajo cada entrepaño: ménsulas visibles desde el pasillo. */}
          {([-1, 1] as const).flatMap(side => ([-1, 1] as const).map(face => (
            <mesh key={`bracket-${side}-${face}`} position={[side * (w / 2 - 0.10), sy - 0.035, face * (d / 2 - 0.10)]} rotation={[0, 0, side * 0.22]} castShadow>
              <boxGeometry args={[0.11, 0.055, 0.018]} />
              <meshStandardMaterial color={STEEL} metalness={0.75} roughness={0.28} transparent opacity={op} />
            </mesh>
          )))}
          <mesh position={[0, sy + shelfT * 0.5 + 0.019, -(d / 2 - 0.010)]} castShadow>
            <boxGeometry args={[w - 0.07, 0.038, 0.009]} />
            <meshStandardMaterial color={G_RAIL} metalness={0.48} roughness={0.34} transparent opacity={op} />
          </mesh>
          <mesh position={[0, sy + shelfT * 0.5 + 0.019, -(d / 2 + 0.0005)]}>
            <boxGeometry args={[w - 0.13, 0.023, 0.004]} />
            <meshStandardMaterial color="#f6f4ed" metalness={0.02} roughness={0.72} transparent opacity={op} />
          </mesh>
          {!isWall && (
            <mesh position={[0, sy + shelfT * 0.5 + 0.019, d / 2 - 0.010]} castShadow>
              <boxGeometry args={[w - 0.07, 0.038, 0.009]} />
              <meshStandardMaterial color={G_RAIL} metalness={0.48} roughness={0.34} transparent opacity={op} />
            </mesh>
            <mesh position={[0, sy + shelfT * 0.5 + 0.019, d / 2 + 0.0005]}>
              <boxGeometry args={[w - 0.13, 0.023, 0.004]} />
              <meshStandardMaterial color="#f6f4ed" metalness={0.02} roughness={0.72} transparent opacity={op} />
            </mesh>
          )}
        </group>
      ))}

      {/* Los envases nacen del planograma, no de una textura sobre el respaldo.
          Repeticiones del mismo SKU comparten InstancedMesh. */}
      {!ghost && <ProductShelfContents planogram={resolvedPlanogram} depth={d} />}

      {/* End-cap uprights.
          Wall gondola  → full-depth slab (the upright runs along the wall).
          Double gondola → thin post (≈ 5 cm × 5 cm cross-section) so adjacent
          modules don't create visible vertical dividers between them. */}
      {([-1, 1] as const).map(side => (
        <group key={`up${side}`}>
          <mesh position={[side * (w / 2 - 0.026), h / 2, 0]} castShadow>
            <boxGeometry args={[0.052, h, isWall ? d : 0.058]} />
            <meshStandardMaterial color={STEEL} metalness={0.78} roughness={0.26} transparent opacity={op} />
          </mesh>
          {Array.from({ length: Math.max(4, Math.floor(h / 0.16)) }, (_, index) => (
            <mesh key={`slot-${index}`} position={[side * (w / 2 + 0.001), 0.12 + index * 0.16, -(isWall ? d / 2 - 0.012 : 0.031)]}>
              <boxGeometry args={[0.006, 0.028, 0.012]} />
              <meshStandardMaterial color="#3f474a" metalness={0.4} roughness={0.55} transparent opacity={op} />
            </mesh>
          ))}
        </group>
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

      {/* Zócalo. Antes eran dos patas y el mueble quedaba flotando con el
          pasillo visible por debajo; una góndola se apoya en una base corrida
          que va de punta a punta, retranqueada para el pie de quien compra. */}
      <mesh position={[0, 0.055, 0]} castShadow receiveShadow>
        <boxGeometry args={[w - 0.02, 0.110, d - 0.055]} />
        <meshStandardMaterial color="#8e8e8a" metalness={0.20} roughness={0.68} transparent opacity={op} />
      </mesh>
      {/* Tapa del zócalo: el borde donde se apoya el entrepaño más bajo */}
      <mesh position={[0, 0.118, 0]} castShadow>
        <boxGeometry args={[w, 0.016, d - 0.020]} />
        <meshStandardMaterial color={STEEL} metalness={0.68} roughness={0.30} transparent opacity={op} />
      </mesh>

      {/* Patas niveladoras retranqueadas: un detalle pequeño pero clave para que
          el módulo se lea como mobiliario comercial, no como una caja apoyada. */}
      {([-1, 1] as const).flatMap(xSide => ([-1, 1] as const).map(zSide => (
        <group key={`foot-${xSide}-${zSide}`} position={[xSide * (w / 2 - 0.12), 0, zSide * (d / 2 - 0.12)]}>
          <mesh position={[0, 0.045, 0]} castShadow><cylinderGeometry args={[0.032, 0.038, 0.09, 12]} /><meshStandardMaterial color={STEEL} metalness={0.8} roughness={0.24} transparent opacity={op} /></mesh>
          <mesh position={[0, 0.006, 0]} castShadow><cylinderGeometry args={[0.055, 0.055, 0.012, 16]} /><meshStandardMaterial color="#42494b" metalness={0.55} roughness={0.44} transparent opacity={op} /></mesh>
        </group>
      )))}

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

  const pinta = !ghost && !!facePaint?.front;

  return (
    <group>
      {/* Structural back plate (faces the gondola) — estructura, lisa */}
      <mesh position={[0, bodyH / 2, d * 0.40]} castShadow>
        <boxGeometry args={[w, bodyH, d * 0.22]} />
        <meshLambertMaterial color={G_BACK} transparent opacity={op} />
      </mesh>

      {/* El producto, al frente del entrepaño */}
      {pinta && (
        <LaminaDeProducto ancho={w} alto={bodyH} y={bodyH / 2} fondo={d} facePaint={facePaint} />
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

  const pinta = !ghost && !!facePaint?.front;

  return (
    <group>
      {/* Back structural panel (faces the gondola aisle) — estructura, lisa */}
      <mesh position={[0, bodyH / 2, d * 0.40]} castShadow>
        <boxGeometry args={[w, bodyH, d * 0.20]} />
        <meshLambertMaterial color={G_BACK} transparent opacity={op} />
      </mesh>

      {/* El producto, al frente del entrepaño */}
      {pinta && (
        <LaminaDeProducto ancho={w} alto={bodyH} y={bodyH / 2} fondo={d} facePaint={facePaint} />
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

      {/* Indicador de estado, abajo. Arriba se montaba encima del producto:
          el estado es del sistema, y no tiene por qué taparle la cara al
          proveedor. */}
      <mesh position={[0, 0.100, -(d / 2 + 0.006)]}>
        <boxGeometry args={[w * 0.70, 0.040, 0.010]} />
        <meshLambertMaterial color={statusColor} transparent opacity={0.88 * op} />
      </mesh>
    </group>
  );
}

// ─── Mesh: Ristra ─────────────────────────────────────────────────────────────

function RistraMesh({ w, d, h, statusColor, ghost, facePaint }: { w:number;d:number;h:number;statusColor:string;ghost?:boolean;facePaint?:FacePaint|null }) {
  const op     = ghost ? 0.42 : 1;
  // Una ristra es una TIRA: unidades colgadas una debajo de otra. Sin producto
  // era un riel con ganchos vacíos, que no se parece a nada.
  const RISTRA_W = w * 0.55;
  const RISTRA_H = h - 0.12;
  const RAIL   = "#8a8a88";
  const HOOK   = "#9e9e9c";
  const nHooks = Math.max(4, Math.round(h / 0.28));
  const sp     = (h - 0.10) / nHooks;

  return (
    <group>
      <LaminaDeProducto
        ancho={RISTRA_W} alto={RISTRA_H} y={RISTRA_H / 2 + 0.06} fondo={d}
        facePaint={ghost ? null : facePaint}
      />
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

function CrossMesh({ w, d, h, statusColor, ghost, facePaint }: { w:number;d:number;h:number;statusColor:string;ghost?:boolean;facePaint?:FacePaint|null }) {
  const op      = ghost ? 0.42 : 1;
  // Era casi negro y se leía como un librero, no como un exhibidor. Un metal
  // claro con estantes blancos es lo que se ve en una punta de pasillo, y
  // además deja que el producto del proveedor sea lo que resalta.
  const DARK    = "#7c8085";   // perfil, cartelería
  const LADO    = "#cbced2";   // montantes laterales
  const SHELF_C = "#eceef0";
  const nLevels = Math.max(4, Math.round(h / 0.36));

  return (
    <group>
      {/* Fondo. Sin él, detrás del producto quedaba un hueco negro y el
          exhibidor se leía como un nicho vacío en vez de como un rack. */}
      <mesh position={[0, h / 2, d / 2 - 0.012]} castShadow>
        <boxGeometry args={[w - 0.05, h, 0.024]} />
        <meshLambertMaterial color="#dfe2e5" transparent={ghost} opacity={op} />
      </mesh>

      <LaminaDeProducto
        ancho={w - 0.07} alto={h} y={h / 2} fondo={d}
        facePaint={ghost ? null : facePaint}
      />
      {/* Montantes. Eran dos paneles del fondo entero, en gris casi negro: dos
          paredes oscuras enmarcando el producto. Un rack se para en cuatro
          postes de esquina, y en metal claro el que resalta es lo que exhibe. */}
      {([-1, 1] as const).flatMap(side =>
        ([-1, 1] as const).map(dz => (
          <mesh key={`${side}|${dz}`}
            position={[side * (w / 2 - 0.032), h / 2, dz * (d / 2 - 0.032)]} castShadow>
            <boxGeometry args={[0.055, h, 0.055]} />
            <meshStandardMaterial color={LADO} metalness={0.12} roughness={0.62}
              transparent={ghost} opacity={op} />
          </mesh>
        )),
      )}
      {/* Travesaños que amarran los postes de cada lado */}
      {([-1, 1] as const).flatMap(side =>
        ([0.06, h - 0.06] as const).map((ty, i) => (
          <mesh key={`tv${side}|${i}`} position={[side * (w / 2 - 0.032), ty, 0]} castShadow>
            <boxGeometry args={[0.045, 0.045, d - 0.064]} />
            <meshStandardMaterial color={LADO} metalness={0.12} roughness={0.62}
              transparent={ghost} opacity={op} />
          </mesh>
        )),
      )}

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
          <meshStandardMaterial color={LADO} metalness={0.12} roughness={0.62}
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
  // Una vitrina de supermercado es acero claro y vidrio. En gris pizarra se
  // leía como un electrodoméstico negro y le robaba todo el contraste al
  // producto que va adentro, que es lo único que tiene que llamar la atención.
  const METAL     = "#c3c7cc";   // cuerpo y marco, acero claro
  const METAL_D   = "#8d9299";   // zócalo y patas
  const METAL_L   = "#e8eaec";   // manija pulida
  const GLASS_C   = "#bae6fd";

  return (
    <group>
      {/* Plinth / base cabinet */}
      <mesh position={[0, baseH / 2, 0]} castShadow>
        <boxGeometry args={[w, baseH, d]} />
        <meshStandardMaterial color={METAL_D} metalness={0.35} roughness={0.55} transparent opacity={op} />
      </mesh>
      {/* Zócalo retranqueado */}
      <mesh position={[0, 0.055, -(d / 2 - 0.010)]}>
        <boxGeometry args={[w - 0.04, 0.100, 0.012]} />
        <meshStandardMaterial color={METAL_D} metalness={0.40} roughness={0.50} transparent opacity={op} />
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

      {/* Back panel (inside) — estructura, lisa. El producto va adelante, contra
          el vidrio, que es donde se lo ve. */}
      {!ghost && facePaint?.front ? (
        <>
          <mesh position={[0, baseH + doorH / 2, d / 2 - 0.020]}>
            <boxGeometry args={[w - 0.036, doorH - 0.036, 0.018]} />
            <meshLambertMaterial color="#f0f0ee" transparent opacity={op} />
          </mesh>
          <LaminaDeProducto
            ancho={w - 0.036} alto={doorH - 0.036}
            y={baseH + doorH / 2} fondo={d} facePaint={facePaint}
          />
        </>
      ) : (
        <mesh position={[0, baseH + doorH / 2, d / 2 - 0.020]}>
          <boxGeometry args={[w - 0.036, doorH - 0.036, 0.018]} />
          <meshLambertMaterial color="#f0f0ee" transparent opacity={op} />
        </mesh>
      )}

      {/* Tira LED del techo. Era una losa del fondo entero que le tapaba el
          estante de arriba al producto; una tira va pegada al frente, mirando
          hacia adentro. */}
      <mesh position={[0, baseH + doorH - 0.048, -(d / 2 - 0.055)]}>
        <boxGeometry args={[w - 0.060, 0.014, 0.016]} />
        <meshStandardMaterial color="#fffde7" emissive="#fffde7" emissiveIntensity={0.55}
          transparent opacity={0.85 * op} />
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

function IslaMesh({ w, d, h, ghost, facePaint }: { w:number;d:number;h:number;statusColor:string;ghost?:boolean;facePaint?:FacePaint|null }) {
  const op       = ghost ? 0.42 : 1;
  const CARTON   = "#c9a06a";   // cartón corrugado
  const CARTON_D = "#a97c46";   // canto, más oscuro
  const CINTA    = "#8a6234";
  // Escalonado real de un exhibidor de piso: la base más ancha y cada nivel
  // metido hacia atrás, para que desde el pasillo se vean los tres a la vez.
  const niveles  = Math.max(2, Math.min(4, Math.round(h / 0.42)));
  const altoNiv  = h / niveles;

  // El producto va como VOLCADO sobre cada andén. Antes esta malla traía
  // botellas y cajas de colores fijos INCRUSTADAS en la geometría: no era
  // textura, así que el arte del proveedor no las podía reemplazar y la isla
  // mostraba siempre el mismo producto inventado, alquilada por quien fuera.
  const producto = ghost ? null : (facePaint?.front ?? null);

  return (
    <group>
      {Array.from({ length: niveles }, (_, i) => {
        const escala = 1 - i * 0.16;
        const lw = w * escala;
        const ld = d * escala;
        // Cada nivel se recuesta contra el fondo: el frente queda escalonado.
        const cz = (d - ld) / 2;
        const baseY = i * altoNiv;
        // Cada nivel es un cajón MACIZO que va del piso del nivel a su tapa, no
        // una bandeja: apilados sin hueco entre uno y otro es como se ve un
        // exhibidor de cartón. Con bandejas separadas se veían tres platos
        // flotando uno sobre otro.
        const tapa = baseY + altoNiv;
        return (
          <group key={i} position={[0, 0, cz]}>
            <mesh position={[0, baseY + altoNiv / 2, 0]} castShadow>
              <boxGeometry args={[lw, altoNiv, ld]} />
              <meshLambertMaterial color={i === 0 ? CARTON_D : CARTON} transparent opacity={op} />
            </mesh>
            {/* Cinta del canto frontal — lo que hace que se lea «cartón» */}
            <mesh position={[0, tapa - 0.045, -(ld / 2 + 0.004)]}>
              <boxGeometry args={[lw - 0.02, 0.045, 0.006]} />
              <meshLambertMaterial color={CINTA} transparent opacity={0.75 * op} />
            </mesh>
            {/* El producto, volcado sobre la tapa del nivel */}
            <VolcadoDeProducto
              ancho={lw - 0.05} fondo={ld - 0.05}
              y={tapa + 0.004} material={producto}
            />
          </group>
        );
      })}

      {/* Cartel de precio, pegado al frente del nivel de abajo */}
      <mesh position={[0, altoNiv * 0.45, -(d / 2 + 0.006)]}>
        <boxGeometry args={[Math.min(0.32, w * 0.44), 0.13, 0.006]} />
        <meshLambertMaterial color="#ffffff" transparent opacity={0.94 * op} />
      </mesh>
      <mesh position={[0, altoNiv * 0.45, -(d / 2 + 0.010)]}>
        <boxGeometry args={[Math.min(0.28, w * 0.38), 0.055, 0.004]} />
        <meshLambertMaterial color="#1e293b" transparent opacity={0.85 * op} />
      </mesh>
    </group>
  );
}

// ─── Mesh: Impulsador de Marca ────────────────────────────────────────────────
// Narrow central spine + cantilevered shelves (wider than spine) + mushroom topper.
// Inspired by Nestlé Fitness / brand impulse floor display style.

function ImpulsadorMesh({ w, d, h, statusColor, ghost, facePaint }: { w:number;d:number;h:number;statusColor:string;ghost?:boolean;facePaint?:FacePaint|null }) {
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

  return (
    <group>
      <LaminaDeProducto
        ancho={w} alto={h - topperH} y={(h - topperH) / 2} fondo={d}
        facePaint={ghost ? null : facePaint}
      />
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
            {/* Acá había un bloque de color por estante: producto inventado,
                metido en la geometría, que ninguna arte del proveedor podía
                reemplazar. El producto real lo pone `LaminaDeProducto`. */}
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

function BateaMesh({ w, d, h, statusColor, ghost, facePaint }: { w:number;d:number;h:number;statusColor:string;ghost?:boolean;facePaint?:FacePaint|null }) {
  const op    = ghost ? 0.42 : 1;
  const WIRE  = "#6b7280";
  const WHEEL = "#374151";
  const wheelR = 0.045;
  // Producto volcado dentro del canasto, un poco por debajo del borde: al ras
  // se ve como una tapa impresa y no como una batea llena.
  const producto = ghost ? null : (facePaint?.front ?? null);
  /** Fondo falso. Una batea se llena hasta cerca del borde, así que abajo lleva
   *  una bandeja que sube el producto; sin ella el volcado quedaba flotando en
   *  el aire, en el medio de la jaula, sin nada que lo sostuviera. */
  const fondoY = wheelR + h * 0.72;

  return (
    <group>
      {/* Bandeja del fondo falso */}
      <mesh position={[0, fondoY, 0]} castShadow receiveShadow>
        <boxGeometry args={[w - 0.05, 0.016, d - 0.05]} />
        <meshStandardMaterial color={WIRE} metalness={0.45} roughness={0.50} transparent opacity={op} />
      </mesh>
      <VolcadoDeProducto
        ancho={w - 0.06} fondo={d - 0.06}
        y={fondoY + 0.012} material={producto}
      />
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
        // Sobre el montante, no 4,5 cm por encima: el riel de arriba tiene que
        // ser el borde del canasto, no un aro suelto flotando.
        const ry = wheelR + t * h;
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
      <mesh position={[0, wheelR + h - 0.02, -(d / 2 - 0.02)]}>
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

function IslaFriaMesh({ w, d, h, statusColor, ghost, facePaint }: { w:number;d:number;h:number;statusColor:string;ghost?:boolean;facePaint?:FacePaint|null }) {
  const op      = ghost ? 0.42 : 1;
  const BODY    = "#f3f4f6";   // blanco/gris claro — cuerpo superior
  const COMP    = "#374151";   // compresor oscuro
  const FRAME   = "#9ca3af";   // rim de acero
  const GLASS_C = "#bae6fd";   // guarda de acrílico
  const INNER   = "#dbeafe";   // interior frío
  const compH   = h * 0.30;
  const wellH   = h - compH;
  const guardH  = 0.20;        // guarda siempre 20 cm, se posa sobre el borde
  /** Cuánto se hunde el pozo. Una isla de helados de verdad es un hueco al que
   *  te asomás desde arriba, no un cajón cerrado: acá el hueco es geometría, y
   *  el producto se apoya en su piso. */
  const pozo    = Math.min(0.30, wellH * 0.45);
  const PARED   = 0.055;       // espesor de la pared del pozo
  const pisoY   = h - pozo;    // el piso del pozo, donde queda el producto

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

      {/* Cuerpo blanco, hasta donde arranca el hueco */}
      <mesh position={[0, compH + (wellH - pozo) / 2, 0]} castShadow>
        <boxGeometry args={[w, wellH - pozo, d]} />
        <meshStandardMaterial color={BODY} roughness={0.55} metalness={0.10} transparent opacity={op} />
      </mesh>

      {/* Las cuatro paredes del pozo. Dejan el hueco abierto arriba: es lo que
          hace que se lea como isla de congelados y no como cajón cerrado. */}
      {([
        [0, -(d / 2 - PARED / 2), w, PARED],
        [0,   d / 2 - PARED / 2,  w, PARED],
      ] as const).map(([px, pz, pw, pd], i) => (
        <mesh key={`zw${i}`} position={[px, pisoY + pozo / 2, pz]} castShadow>
          <boxGeometry args={[pw, pozo, pd]} />
          <meshStandardMaterial color={BODY} roughness={0.55} metalness={0.10} transparent opacity={op} />
        </mesh>
      ))}
      {([-(w / 2 - PARED / 2), w / 2 - PARED / 2] as const).map((px, i) => (
        <mesh key={`xw${i}`} position={[px, pisoY + pozo / 2, 0]} castShadow>
          <boxGeometry args={[PARED, pozo, d - PARED * 2]} />
          <meshStandardMaterial color={BODY} roughness={0.55} metalness={0.10} transparent opacity={op} />
        </mesh>
      ))}

      {/* Piso del pozo, con el tinte frío del acero esmaltado */}
      <mesh position={[0, pisoY + 0.006, 0]} receiveShadow>
        <boxGeometry args={[w - PARED * 2, 0.012, d - PARED * 2]} />
        <meshStandardMaterial color={INNER} roughness={0.18} metalness={0.20} transparent opacity={op} />
      </mesh>

      {/* Y el producto encima de ese piso, visto desde arriba */}
      <VolcadoDeProducto
        ancho={w - PARED * 2 - 0.02} fondo={d - PARED * 2 - 0.02}
        y={pisoY + 0.014} material={ghost ? null : (facePaint?.front ?? null)}
      />

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

function NeveraCarnesMesh({ w, d, h, statusColor, ghost, facePaint }: { w:number;d:number;h:number;statusColor:string;ghost?:boolean;facePaint?:FacePaint|null }) {
  const op    = ghost ? 0.42 : 1;
  const DARK  = "#111827";
  const FRAME = "#1f2937";
  const GLASS = "#bae6fd";

  const bodyH  = h * 0.52;                   // cuerpo bajo oscuro
  const glassH = h - bodyH + 0.05;           // panel de vidrio, solapa ligeramente el borde

  return (
    <group>
      {/* Cuerpo principal oscuro */}
      <mesh position={[0, bodyH / 2, 0]} castShadow>
        <boxGeometry args={[w, bodyH, d]} />
        <meshStandardMaterial color={DARK} roughness={0.55} metalness={0.25} transparent opacity={op} />
      </mesh>

      {/* La bandeja fría, y el producto volcado encima. Antes era una tapa
          roja translúcida —«carne» genérica— que tapaba el mostrador entero. */}
      <mesh position={[0, bodyH + 0.015, 0]}>
        <boxGeometry args={[w - 0.08, 0.03, d - 0.06]} />
        <meshStandardMaterial color="#e8eaed" roughness={0.55} metalness={0.20} transparent opacity={op} />
      </mesh>
      <VolcadoDeProducto
        ancho={w - 0.10} fondo={d - 0.08}
        y={bodyH + 0.033} material={ghost ? null : (facePaint?.front ?? null)}
      />

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
  /** Relleno genérico. Una nevera vacía no se lee como nevera, así que cuando
   *  el espacio todavía no tiene producto cargado se muestran botellas mudas
   *  —un solo tono frío, sin marca—. En cuanto entra el arte del proveedor
   *  desaparecen: lo que se ve por los huecos entre facings tiene que ser el
   *  fondo iluminado de la nevera, no un producto que nadie compró. */
  const RELLENO = "#94a3b8";
  const pinta   = !ghost && !!facePaint?.front;

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

      {/* Pared interior iluminada (back wall de la zona fría) — queda lisa: el
          producto va adelante, contra el vidrio, no pegado al fondo. */}
      {!ghost && facePaint?.front ? (
        <>
          <mesh position={[0, compH + dispH / 2, d / 2 - 0.055]}>
            <boxGeometry args={[w - 0.040, dispH, 0.010]} />
            <meshStandardMaterial color="#f0f9ff" emissive={LED_C} emissiveIntensity={0.30}
              transparent opacity={0.85 * op} />
          </mesh>
          <LaminaDeProducto
            ancho={w - 0.040} alto={dispH}
            y={compH + dispH / 2} fondo={d} facePaint={facePaint}
          />
        </>
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
            {/* Botellas mudas — sólo mientras el espacio esté sin vender */}
            {!pinta && Array.from({ length: nItems }, (_, bi) => {
              const bx = -w / 2 + 0.04 + bi * ((w - 0.05) / nItems) + (w - 0.05) / nItems / 2;
              return (
                <mesh key={bi} position={[bx, sy + 0.070, 0]}>
                  <boxGeometry args={[0.068, 0.13, d * 0.65]} />
                  <meshStandardMaterial color={RELLENO} roughness={0.40} transparent opacity={0.88 * op} />
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

function StandFrutasMesh({ w, d, h, statusColor, ghost, facePaint }: { w:number;d:number;h:number;statusColor:string;ghost?:boolean;facePaint?:FacePaint|null }) {
  const op      = ghost ? 0.42 : 1;
  const WOOD    = "#c8a465";   // madera clara
  const WOOD_D  = "#a07c3a";   // madera oscura (costillas)
  const METAL   = "#1f2937";   // esquineros / ángulos metálicos negros

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

  // Un stand de frutas de verdad no es un cajón hondo de un metro: es un mesón
  // con un cajón poco profundo arriba, para que la fruta quede a la vista y al
  // alcance de la mano. Apilando costillas hasta la altura total se leía como
  // una ruma de tablas.
  const cajonH = Math.min(0.26, (h - legH) * 0.32);   // el cajón, poco profundo
  const mesaTop = h - cajonH;                          // tapa del mesón = piso del cajón
  const mesaH   = mesaTop - legH;

  // Costillas del cajón: pocas y gruesas, con hueco entre ellas
  const plankT = 0.040;
  const gap    = 0.022;
  const pitch  = plankT + gap;
  const nPlanks = Math.max(2, Math.floor(cajonH / pitch));
  const planks  = Array.from({ length: nPlanks }, (_, i) => mesaTop + i * pitch + plankT / 2);

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

      {/* El mesón: el cuerpo macizo sobre el que se apoya el cajón */}
      <mesh position={[0, legH + mesaH / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w - 0.02, mesaH, d - 0.02]} />
        <meshStandardMaterial color={WOOD_D} roughness={0.85} transparent opacity={op} />
      </mesh>
      {/* Tapa del mesón, en madera clara: es el piso del cajón */}
      <mesh position={[0, mesaTop - 0.014, 0]} castShadow>
        <boxGeometry args={[w, 0.028, d]} />
        <meshStandardMaterial color={WOOD} roughness={0.75} transparent opacity={op} />
      </mesh>

      {/* Costillas del cajón — cara delantera y trasera */}
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
        <mesh key={`crn${i}`} position={[cx, mesaTop + cajonH / 2, cz]} castShadow>
          <boxGeometry args={[crnW, cajonH, crnW]} />
          <meshStandardMaterial color={METAL} metalness={0.6} roughness={0.3} transparent opacity={op} />
        </mesh>
      ))}

      {/* El producto, adentro del cajón. Iba al ras del borde de arriba, y así
          no se veía fruta en un cajón sino una tapa impresa. Acá había además
          un bloque verde fijo: un cajón genérico que ningún proveedor podía
          reemplazar. */}
      <VolcadoDeProducto
        ancho={w - 0.07} fondo={d - 0.07}
        y={mesaTop + 0.006} material={ghost ? null : (facePaint?.front ?? null)}
      />

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

/**
 * Mostrador de servicio al cliente: devoluciones, reclamos e información.
 *
 * Es más alto que una caja (1.10 m contra 0.90) porque se atiende de pie y de
 * frente, no de costado con una cinta; lleva un mostrador bajo accesible de un
 * lado y un cartel colgante, que es como se lo reconoce desde el pasillo.
 */
function ServicioClienteMesh({ w, d, h, ghost }: { w:number;d:number;h:number;ghost?:boolean }) {
  const op    = ghost ? 0.42 : 1;
  const BODY  = "#e8eef3";
  const TAPA  = "#8fa3b0";
  const SENAL = "#0ea5e9";
  const TINTA = "#0b3d54";
  // Tramo bajo accesible: un tercio del frente a la altura de una silla de
  // ruedas. No es adorno — es lo que distingue este mueble de una caja.
  const bajoW = w * 0.34;
  const bajoH = h - 0.28;

  return (
    <group>
      {/* Cuerpo del mostrador */}
      <mesh position={[bajoW / 2, h / 2, 0]} castShadow>
        <boxGeometry args={[w - bajoW, h, d]} />
        <meshStandardMaterial color={BODY} metalness={0.10} roughness={0.65} transparent opacity={op} />
      </mesh>
      {/* Tramo bajo accesible */}
      <mesh position={[-(w / 2 - bajoW / 2), bajoH / 2, 0]} castShadow>
        <boxGeometry args={[bajoW, bajoH, d]} />
        <meshStandardMaterial color={BODY} metalness={0.10} roughness={0.65} transparent opacity={op} />
      </mesh>

      {/* Tapas */}
      <mesh position={[bajoW / 2, h + 0.012, 0]} castShadow>
        <boxGeometry args={[w - bajoW + 0.05, 0.024, d + 0.05]} />
        <meshStandardMaterial color={TAPA} metalness={0.35} roughness={0.40} transparent opacity={op} />
      </mesh>
      <mesh position={[-(w / 2 - bajoW / 2), bajoH + 0.012, 0]} castShadow>
        <boxGeometry args={[bajoW + 0.05, 0.024, d + 0.05]} />
        <meshStandardMaterial color={TAPA} metalness={0.35} roughness={0.40} transparent opacity={op} />
      </mesh>

      {/* Franja de color al frente: lo que hace que se lea «acá se pregunta» */}
      <mesh position={[0, h * 0.62, -(d / 2 + 0.004)]}>
        <boxGeometry args={[w * 0.98, 0.09, 0.010]} />
        <meshStandardMaterial color={SENAL} emissive={SENAL} emissiveIntensity={0.18}
          transparent opacity={op} />
      </mesh>

      {/* Cartel, montado sobre parantes que salen del propio mostrador.
          Colgado del techo quedaba flotando: acá no se dibuja techo, así que un
          cartel suspendido se ve suelto en el aire. */}
      {([-1, 1] as const).map(sx => (
        <mesh key={sx} position={[sx * (w * 0.30), h + 0.235, 0]} castShadow>
          <boxGeometry args={[0.030, 0.47, 0.030]} />
          <meshStandardMaterial color={TAPA} metalness={0.45} roughness={0.35} transparent opacity={op} />
        </mesh>
      ))}
      <mesh position={[0, h + 0.62, 0]} castShadow>
        <boxGeometry args={[w * 0.72, 0.30, 0.05]} />
        <meshStandardMaterial color={SENAL} metalness={0.20} roughness={0.50} transparent opacity={op} />
      </mesh>
      {/* Renglón oscuro del cartel: de lejos se lee como un letrero escrito */}
      <mesh position={[0, h + 0.62, -(0.028)]}>
        <boxGeometry args={[w * 0.58, 0.13, 0.006]} />
        <meshStandardMaterial color={TINTA} transparent opacity={0.85 * op} />
      </mesh>

      {/* Monitor de consulta */}
      <mesh position={[w * 0.22, h + 0.20, d * 0.10]} rotation={[0.22, 0, 0]} castShadow>
        <boxGeometry args={[0.26, 0.17, 0.030]} />
        <meshStandardMaterial color="#1f2937" metalness={0.45} roughness={0.35} transparent opacity={op} />
      </mesh>
      <mesh position={[w * 0.22, h + 0.11, d * 0.10]}>
        <boxGeometry args={[0.10, 0.020, 0.10]} />
        <meshStandardMaterial color={TAPA} metalness={0.40} roughness={0.40} transparent opacity={op} />
      </mesh>

      {/* Zócalo */}
      <mesh position={[0, 0.045, 0]}>
        <boxGeometry args={[w - 0.06, 0.09, d - 0.06]} />
        <meshStandardMaterial color="#6b7785" metalness={0.20} roughness={0.70} transparent opacity={op} />
      </mesh>
    </group>
  );
}

function FixtureMesh({ fixture, ghost, facePaint, selectedSlotId, hoveredSlotId, onSlotClick, onSlotHover }: FixtureMeshProps) {
  const sc = isRentable(fixture)
    ? (STATUS_COLORS[fixture.status] ?? STATUS_COLORS.free)
    : NON_RENTABLE_COLOR;
  const base = { w:fixture.w, d:fixture.d, h:fixture.h, statusColor:sc, ghost };
  switch (fixture.type) {
    case "gondola": return (
      <GondolaMesh {...base}
        gondolaType={fixture.gondolaType ?? "double"}
        facePaint={facePaint}
        slots={fixture.slots}
        planogram={fixture.planogram}
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
    case "ristra":        return <RistraMesh         {...base} facePaint={facePaint} />;
    case "cross":         return <CrossMesh          {...base} facePaint={facePaint} />;
    case "metro":         return <MetroMesh          {...base} />;
    case "mueble":        return <MuebleMesh         {...base} facePaint={facePaint} />;
    case "isla":          return <IslaMesh           {...base} facePaint={facePaint} />;
    case "impulsador":    return <ImpulsadorMesh     {...base} facePaint={facePaint} />;
    case "batea":         return <BateaMesh          {...base} facePaint={facePaint} />;
    case "isla_fria":        return <IslaFriaMesh         {...base} facePaint={facePaint} />;
    case "nevera_carnes":    return <NeveraCarnesMesh     {...base} facePaint={facePaint} />;
    case "nevera_refrescos": return <NeveraRefrescosMesh  {...base} facePaint={facePaint} />;
    case "stand_frutas":     return <StandFrutasMesh       {...base} facePaint={facePaint} />;
    case "checkout":      return <CheckoutMesh       {...base} />;
    case "servicio_cliente": return <ServicioClienteMesh {...base} />;
    case "columna":       return <ColumnaMesh        {...base} />;
    default:              return <IslaMesh           {...base} facePaint={facePaint} />;  // legacy exhibicion + unknown
  }
}

// ─── Store room ───────────────────────────────────────────────────────────────

/** Lado de la baldosa, en metros. Es la medida de una baldosa de piso comercial,
 *  y de paso la unidad con la que el ojo mide distancias al caminar: sin una
 *  retícula en el suelo, avanzar por la tienda se siente como flotar porque no
 *  hay contra qué comparar el paso. */
const LADO_BALDOSA = 0.60;

/** La textura del piso: baldosa con junta, dibujada una sola vez en un canvas.
 *
 *  Dos baldosas por lado en la imagen y no una: así las juntas quedan por
 *  dentro del dibujo y no sobre el borde, que es donde el filtrado bilineal
 *  deja costura al repetir. Las líneas de los bordes se dibujan a media caña,
 *  y al repetirse se suman en una junta completa.
 */
function usarTexturaDePiso(): THREE.Texture {
  const { gl } = useThree();
  return useMemo(() => {
    const CELDA = 256;                 // px por baldosa
    const lienzo = document.createElement("canvas");
    lienzo.width = lienzo.height = CELDA * 2;
    const c = lienzo.getContext("2d")!;
    c.fillStyle = "#ddd8cc";           // el mismo tono que tenía el piso liso
    c.fillRect(0, 0, lienzo.width, lienzo.height);
    c.strokeStyle = "#cbc5b6";         // junta: apenas más oscura, no un enrejado
    c.lineWidth = 5;
    for (const v of [0, CELDA, CELDA * 2]) {
      c.beginPath(); c.moveTo(v, 0); c.lineTo(v, lienzo.height); c.stroke();
      c.beginPath(); c.moveTo(0, v); c.lineTo(lienzo.width, v); c.stroke();
    }
    const t = new THREE.CanvasTexture(lienzo);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    // Sin anisotropía, mirando el piso casi de canto —que es todo el rato en
    // primera persona— la retícula lejana se deshace en moaré.
    t.anisotropy = gl.capabilities.getMaxAnisotropy();
    return t;
  }, [gl]);
}

/** Floor + border that adapts to the bounding box of all placed fixtures.
 *  `muros` los levanta sólo en primera persona: al caminar ya te frena
 *  `murosDeCaminata` en el perímetro, y hasta ahora ese tope era invisible —
 *  chocabas contra nada. En la vista orbital estorban, así que ahí no van. */
function StoreRoom({ fixtures, muros = false }: { fixtures: PlacedFixture[]; muros?: boolean }) {
  const PAD = 2.5; // metres of padding around fixture bbox
  const MIN_SIZE = 8;
  // 4,5 m: la altura de un supermercado de verdad, y suficiente para que el
  // remate del muro salga del cuadro salvo mirando de lejos.
  const ALTO_MURO = 4.5;
  const ESPESOR    = 0.12;
  const ZOCALO     = 0.12;

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

  const piso = usarTexturaDePiso();
  const { invalidate } = useThree();
  useEffect(() => {
    // Repetir por metro real, no por lámina: la baldosa mide lo mismo en una
    // sede de 12 m que en una de 40.
    piso.repeat.set(fw / (LADO_BALDOSA * 2), fd / (LADO_BALDOSA * 2));
    piso.needsUpdate = true;
    invalidate();
  }, [piso, fw, fd, invalidate]);

  type V3 = [number, number, number];
  return (
    <group>
      <mesh rotation={[-Math.PI/2,0,0]} position={[cx,0,cz] as V3} receiveShadow>
        <planeGeometry args={[fw,fd]} />
        <meshLambertMaterial map={piso} />
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

      {/* Los muros, con su zócalo. La cara interior queda justo sobre el borde
          del piso, y los del eje X se alargan un espesor para cerrar esquina. */}
      {muros && ([
        { pos:[cx, ALTO_MURO/2, cz - fd/2 - ESPESOR/2] as V3, args:[fw + ESPESOR*2, ALTO_MURO, ESPESOR] as V3,
          zoc:[cx, ZOCALO/2, cz - fd/2 + 0.012] as V3,        zargs:[fw, ZOCALO, 0.024] as V3 },
        { pos:[cx, ALTO_MURO/2, cz + fd/2 + ESPESOR/2] as V3, args:[fw + ESPESOR*2, ALTO_MURO, ESPESOR] as V3,
          zoc:[cx, ZOCALO/2, cz + fd/2 - 0.012] as V3,        zargs:[fw, ZOCALO, 0.024] as V3 },
        { pos:[cx - fw/2 - ESPESOR/2, ALTO_MURO/2, cz] as V3, args:[ESPESOR, ALTO_MURO, fd] as V3,
          zoc:[cx - fw/2 + 0.012, ZOCALO/2, cz] as V3,        zargs:[0.024, ZOCALO, fd] as V3 },
        { pos:[cx + fw/2 + ESPESOR/2, ALTO_MURO/2, cz] as V3, args:[ESPESOR, ALTO_MURO, fd] as V3,
          zoc:[cx + fw/2 - 0.012, ZOCALO/2, cz] as V3,        zargs:[0.024, ZOCALO, fd] as V3 },
      ]).map((m, i) => (
        <group key={`mu${i}`}>
          {/* El `emissive` no es un efecto: la direccional principal cuelga a
              40 m casi a plomo, así que una cara vertical recibe N·L ≈ 0 y el
              muro quedaba sólo con el ambiente —marrón sucio, más oscuro que
              el piso, al revés de cualquier tienda—. Levantarlo acá lo arregla
              sin tocar la luz de la escena, que ya está calibrada para los
              muebles. */}
          <mesh position={m.pos} receiveShadow>
            <boxGeometry args={m.args} />
            <meshLambertMaterial color="#efeae0" emissive="#a8a294" />
          </mesh>
          <mesh position={m.zoc}>
            <boxGeometry args={m.zargs} />
            <meshLambertMaterial color="#b9b2a3" emissive="#6e695d" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// ─── Figura humana ────────────────────────────────────────────────────────────

/**
 * Una persona de 1,70 m al lado del mueble elegido.
 *
 * Es lo que vuelve legible la escala. Un render sin nada humano al lado se ve
 * como una maqueta: el proveedor no sabe si su exhibidor le llega al pecho o a
 * la rodilla, y «1,80 m de alto» escrito en una ficha no se lee igual que
 * verlo. Va al COSTADO y no adelante a propósito —adelante taparía justo la
 * cara que se está vendiendo, que es lo único que la lámina tiene que mostrar—.
 *
 * No es chrome: sale en la captura para el proveedor, que es donde hace falta.
 */
const ALTURA_PERSONA = 1.70;

function FiguraHumana({ x, z, rotY }: { x: number; z: number; rotY: number }) {
  // Proporciones que suman exactamente 1,70: piernas 0→0,85, torso 0,85→1,50,
  // cabeza 1,50→1,70.
  const PIEL = "#8b9096";
  return (
    <group position={[x, 0, z]} rotation={[0, rotY, 0]}>
      {([-1, 1] as const).map((s) => (
        <mesh key={`p${s}`} position={[s * 0.092, 0.425, 0]} castShadow>
          <capsuleGeometry args={[0.085, 0.68, 4, 12]} />
          <meshStandardMaterial color={PIEL} roughness={0.85} metalness={0.02} />
        </mesh>
      ))}
      <mesh position={[0, 1.175, 0]} castShadow>
        <capsuleGeometry args={[0.155, 0.34, 4, 16]} />
        <meshStandardMaterial color={PIEL} roughness={0.85} metalness={0.02} />
      </mesh>
      {([-1, 1] as const).map((s) => (
        <mesh key={`b${s}`} position={[s * 0.205, 1.18, 0]} castShadow>
          <capsuleGeometry args={[0.052, 0.40, 4, 10]} />
          <meshStandardMaterial color={PIEL} roughness={0.85} metalness={0.02} />
        </mesh>
      ))}
      {/* La coronilla cae exactamente en ALTURA_PERSONA: si alguien toca una
          proporción, que sea la altura la que mande y no al revés. */}
      <mesh position={[0, ALTURA_PERSONA - 0.10, 0]} castShadow>
        <sphereGeometry args={[0.10, 20, 16]} />
        <meshStandardMaterial color={PIEL} roughness={0.85} metalness={0.02} />
      </mesh>
    </group>
  );
}


// ─── Selection wireframe ──────────────────────────────────────────────────────

/** Marca lo que NO debe salir en una captura: es herramienta, no tienda. */
const CHROME = { chrome: true };

function SelectionBox({ w, d, h }: { w:number;d:number;h:number }) {
  return (
    <mesh position={[0,h/2,0]} userData={CHROME}>
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

function ScreenshotCapture({ onReady }: { onReady: (fn: () => string) => void }) {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    onReady(() => {
      // Esconder el gizmo y la caja de selección ACÁ, y no con un estado de
      // React, es lo único que funciona: apagarlos por estado deja la captura
      // a merced de cuándo React confirma el cambio, y el gizmo salía dibujado
      // en la primera de las dos tomas. Esto es sincrónico y no falla.
      const ocultos: THREE.Object3D[] = [];
      scene.traverse((o) => {
        if (o.userData?.chrome && o.visible) { o.visible = false; ocultos.push(o); }
      });
      try {
        // Dibujar y leer en el MISMO turno. El lienzo no se creó con
        // preserveDrawingBuffer, así que el búfer se limpia al componer y un
        // toDataURL suelto devuelve una imagen en blanco — que es lo que venía
        // bajando el botón de captura.
        gl.render(scene, camera);
        return gl.domElement.toDataURL('image/png');
      } finally {
        ocultos.forEach((o) => { o.visible = true; });
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, scene, camera, onReady]);
  return null;
}

/** Estilo de las etiquetas del panel derecho, compartido por sus bloques. */
const ETIQUETA_CLS = "mb-0.5 block text-[10px] uppercase tracking-widest text-dark-ink-3 font-medium";

/**
 * La vista con la que se le muestra este espacio a un proveedor.
 *
 * Sin esto, cada vez que alguien arma una propuesta tiene que volver a buscar
 * el ángulo a mano, y dos propuestas del mismo espacio salen distintas. La
 * cámara se guarda en el layout, así que viaja al servidor y aparece en la
 * laptop del que arma la propuesta.
 *
 * Se guarda la cámara ORBITAL. En primera persona la cámara no se persiste —
 * la caminata escribiría cientos de veces por recorrido — así que el botón
 * avisa en vez de guardar algo viejo.
 */
/**
 * Elegir qué producto se le prueba a la cara del mueble.
 *
 * Se abre como ventana y no dentro de la barra lateral porque acá se elige
 * MIRANDO: la barra tiene 208 px y una miniatura de producto ahí no se
 * distingue de la de al lado. En una reunión, esta ventana es lo que se
 * proyecta mientras el proveedor decide.
 */
function SelectorDeProducto({
  catalogo, cargando, isAdmin, onElegir, onCerrar, onSubido,
}: {
  catalogo: Arte[];
  cargando: boolean;
  isAdmin: boolean;
  onElegir: (arteId: number) => void;
  onCerrar: () => void;
  onSubido: () => void;
}) {
  const [busca, setBusca] = useState("");
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState("");
  const [abrirCarga, setAbrirCarga] = useState(false);

  const filtrado = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return catalogo;
    return catalogo.filter(a =>
      `${a.proveedor} ${a.nombre} ${a.categoria ?? ""}`.toLowerCase().includes(q));
  }, [catalogo, busca]);

  // Agrupado por proveedor: es como se piensa el catálogo cuando se está
  // negociando con uno de ellos.
  const porProveedor = useMemo(() => {
    const m = new Map<string, Arte[]>();
    for (const a of filtrado) {
      const lista = m.get(a.proveedor) ?? [];
      lista.push(a);
      m.set(a.proveedor, lista);
    }
    return [...m.entries()];
  }, [filtrado]);

  // Mientras el catálogo está abierto, ÉL es la pantalla: se lleva el amarillo
  // y cualquier botón principal de atrás pasa a tinta.
  useModalAbierto();

  return (
    <div
      data-cajon-oscuro
      data-capa-modal
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
      onClick={onCerrar}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-dark-line bg-dark-surface shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-dark-line px-4 py-3">
          <Package size={15} className="text-accent" />
          <h3 className="text-sm font-semibold text-dark-ink-1">Probar un producto</h3>
          <div className="relative ml-auto">
            <Search size={12} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-dark-ink-3" />
            <input
              autoFocus
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Proveedor o producto"
              className="w-52 rounded border border-dark-line-2 bg-dark-bg py-1.5 pl-7 pr-2 text-xs text-dark-ink-1 placeholder:text-dark-ink-3 focus:border-accent focus:outline-none"
            />
          </div>
          <button onClick={onCerrar} className="text-dark-ink-3 hover:text-dark-ink-1" aria-label="Cerrar">
            <X size={15} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {cargando ? (
            <p className="py-10 text-center text-xs text-dark-ink-3">Cargando el catálogo…</p>
          ) : catalogo.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm text-dark-ink-2">Todavía no hay artes cargadas.</p>
              <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-dark-ink-3">
                Subí la imagen del producto —la que manda el proveedor— y desde
                acá se la probás a cualquier mueble, en cualquier sede.
              </p>
            </div>
          ) : porProveedor.length === 0 ? (
            <p className="py-10 text-center text-xs text-dark-ink-3">
              Nada que coincida con «{busca}».
            </p>
          ) : (
            porProveedor.map(([proveedor, artes]) => (
              <div key={proveedor} className="mb-5 last:mb-0">
                <p className={ETIQUETA_CLS}>{proveedor}</p>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(116px,1fr))] gap-2.5">
                  {artes.map(a => (
                    <button
                      key={a.id}
                      onClick={() => onElegir(a.id)}
                      className="group overflow-hidden rounded-lg border border-dark-line-2 bg-dark-bg text-left transition-colors hover:border-accent"
                    >
                      <div className="flex h-20 items-center justify-center bg-dark-surface-2 p-1.5">
                        <img
                          src={arteUrl(a.id)}
                          alt={a.nombre}
                          loading="lazy"
                          className="max-h-full max-w-full object-contain"
                        />
                      </div>
                      <div className="px-2 py-1.5">
                        <p className="truncate text-[11px] font-semibold text-dark-ink-1" title={a.nombre}>
                          {a.nombre}
                        </p>
                        {a.categoria && (
                          <p className="truncate text-[10px] text-dark-ink-3">{a.categoria}</p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {isAdmin && (
          <div className="border-t border-dark-line px-4 py-3">
            {abrirCarga ? (
              <FormularioDeArte
                subiendo={subiendo}
                error={error}
                onError={setError}
                onSubiendo={setSubiendo}
                onListo={() => { setAbrirCarga(false); setError(""); onSubido(); }}
                onCancelar={() => { setAbrirCarga(false); setError(""); }}
              />
            ) : (
              <button
                onClick={() => setAbrirCarga(true)}
                className="flex items-center gap-1.5 text-xs font-semibold text-accent hover:opacity-80"
              >
                <Plus size={13} /> Subir el arte de un producto
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Cargar un arte nueva sin salir de la ventana.
 *
 *  Va acá y no en otra pantalla porque el momento en que se descubre que falta
 *  es este: el proveedor pregunta cómo se vería su producto y no está cargado.
 *  Mandarlo a otro lado a subirlo termina la demostración. */
function FormularioDeArte({
  subiendo, error, onError, onSubiendo, onListo, onCancelar,
}: {
  subiendo: boolean;
  error: string;
  onError: (m: string) => void;
  onSubiendo: (v: boolean) => void;
  onListo: () => void;
  onCancelar: () => void;
}) {
  const [proveedores, setProveedores] = useState<{ id: number; name: string }[]>([]);
  const [supplierId, setSupplierId] = useState<number | "">("");
  const [nombre, setNombre] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getSuppliers()
      .then(list => setProveedores(list.map(p => ({ id: p.id, name: p.name }))))
      .catch(() => setProveedores([]));
  }, []);

  const campo = "rounded border border-dark-line-2 bg-dark-bg px-2 py-1.5 text-xs text-dark-ink-1 placeholder:text-dark-ink-3 focus:border-accent focus:outline-none";

  async function enviar() {
    if (subiendo) return;
    if (supplierId === "") { onError("Elegí de qué proveedor es."); return; }
    if (!nombre.trim())    { onError("Ponele nombre al producto: es lo que se elige de la lista."); return; }
    if (!archivo)          { onError("Falta la imagen del producto."); return; }
    onSubiendo(true);
    onError("");
    try {
      await subirArte({ supplierId, nombre: nombre.trim(), archivo });
      setNombre("");
      setArchivo(null);
      onListo();
    } catch (e) {
      onError(describeError(e, "No se pudo subir el arte."));
    } finally {
      onSubiendo(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={supplierId}
          onChange={e => setSupplierId(e.target.value ? Number(e.target.value) : "")}
          className={campo}
        >
          <option value="">Proveedor…</option>
          {proveedores.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <input
          value={nombre}
          onChange={e => setNombre(e.target.value)}
          placeholder="Nombre del producto"
          className={`${campo} flex-1 min-w-[10rem]`}
        />
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={e => { setArchivo(e.target.files?.[0] ?? null); onError(""); }}
        />
        <button
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-1.5 rounded border border-dark-line-2 px-2 py-1.5 text-xs text-dark-ink-2 hover:text-dark-ink-1"
        >
          <Upload size={12} /> {archivo ? "Cambiar" : "Imagen"}
        </button>
        {archivo && (
          <span className="max-w-[9rem] truncate text-[11px] text-dark-ink-3" title={archivo.name}>
            {archivo.name}
          </span>
        )}
        {/* El botón principal del editor de zonas: el único amarillo de esta
            pantalla (`outputs/tema.md` §2). «Cambiar / Imagen» y «Cancelar»
            quedan en tinta sobre el cajón oscuro. */}
        <button
          onClick={enviar}
          disabled={subiendo}
          className="btn-principal flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs"
        >
          {subiendo && <Loader2 size={12} className="animate-spin" />}
          {subiendo ? "Subiendo…" : "Guardar"}
        </button>
        <button onClick={onCancelar} className="text-xs text-dark-ink-3 hover:text-dark-ink-1">
          Cancelar
        </button>
      </div>
      {error && <p className="text-[11px] text-danger">{error}</p>}
      <p className="text-[10px] leading-relaxed text-dark-ink-3">
        Una foto del empaque de frente, sin fondo si se puede (PNG con
        transparencia). El 3D la repite sobre cada entrepaño del mueble, así que
        una sola unidad basta — no hace falta una foto de la góndola llena.
      </p>
    </div>
  );
}

function VistaProveedor({
  fix, enCaminata, catalogo, cargandoCatalogo, prueba, onProbar, onRecargarCatalogo,
}: {
  fix: PlacedFixture;
  enCaminata: boolean;
  catalogo: Arte[];
  cargandoCatalogo: boolean;
  /** `${fixtureId}|A` → id del arte que se está probando en esa cara. */
  prueba: Map<string, number>;
  onProbar: (fixtureId: string, cara: "A" | "B", arteId: number | null) => void;
  onRecargarCatalogo: () => void;
}) {
  const camara3D      = useFixtureStore((s) => s.camera3D);
  const guardarVista  = useFixtureStore((s) => s.guardarVista3D);
  const borrarVista   = useFixtureStore((s) => s.borrarVista3D);
  const pedirEnfoque  = useFixtureStore((s) => s.pedirEnfoque3D);
  const unificados    = useFixtureStore(selectFixtures);
  const isAdmin       = useAuthStore(selectIsAdmin);

  const uf     = unificados.find((f) => f.id === fix.id);
  const doble  = isDoubleGondola(fix);
  const [cara, setCara] = useState<"A" | "B">("A");
  const [eligiendo, setEligiendo] = useState(false);
  const caraUsada = doble ? cara : "A";
  const guardada = uf?.vista3D?.[caraUsada];
  const probandoId = prueba.get(`${fix.id}|${caraUsada}`);
  const probando = probandoId != null ? catalogo.find(a => a.id === probandoId) : undefined;

  if (!uf || !isRentable(fix)) return null;

  return (
    <div className="rounded-lg border border-dark-line/50 bg-dark-bg/60 p-3">
      <p className={ETIQUETA_CLS}><Eye size={9} className="inline mr-1"/>Vista para el proveedor</p>

      {doble && (
        <div className="mb-2 flex gap-1.5">
          {(["A", "B"] as const).map((id) => (
            <button
              key={id}
              onClick={() => setCara(id)}
              className={`flex-1 rounded px-1 py-1 text-[10.5px] font-semibold transition-colors ${
                caraUsada === id ? "bg-accent text-accent-ink"
                                 : "border border-dark-line-2 text-dark-ink-3 hover:text-dark-ink-1"
              }`}
            >
              Cara {id}{uf.vista3D?.[id] ? " ✓" : ""}
            </button>
          ))}
        </div>
      )}

      {/* Qué producto se está probando. Va ARRIBA del encuadre: primero se
          pone el producto y después se busca el ángulo desde donde se lo
          muestra, no al revés. */}
      <div className="mb-2 border-b border-dark-line/50 pb-2">
        {probando ? (
          <div className="flex items-center gap-2">
            <img
              src={arteUrl(probando.id)}
              alt=""
              className="h-9 w-9 flex-shrink-0 rounded bg-dark-surface-2 object-contain p-0.5"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-semibold text-dark-ink-1" title={probando.nombre}>
                {probando.nombre}
              </p>
              <p className="truncate text-[10px] text-dark-ink-3">{probando.proveedor}</p>
            </div>
            <button
              onClick={() => onProbar(fix.id, caraUsada, null)}
              aria-label="Quitar el producto de prueba"
              className="flex-shrink-0 text-dark-ink-3 hover:text-dark-ink-1"
            >
              <X size={13} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setEligiendo(true)}
            className="flex w-full items-center justify-center gap-1.5 rounded border border-dashed border-dark-line-2 px-2 py-2 text-[11px] font-semibold text-dark-ink-2 hover:border-accent hover:text-dark-ink-1"
          >
            <Package size={12} /> Probar un producto
          </button>
        )}
        {probando && (
          <button
            onClick={() => setEligiendo(true)}
            className="mt-1.5 w-full text-[10px] text-dark-ink-3 hover:text-dark-ink-1"
          >
            Probar otro
          </button>
        )}
      </div>

      {eligiendo && (
        <SelectorDeProducto
          catalogo={catalogo}
          cargando={cargandoCatalogo}
          isAdmin={isAdmin}
          onElegir={(arteId) => { onProbar(fix.id, caraUsada, arteId); setEligiendo(false); }}
          onCerrar={() => setEligiendo(false)}
          onSubido={onRecargarCatalogo}
        />
      )}

      <div className="flex flex-col gap-1.5">
        <button
          onClick={() => pedirEnfoque(fix.id, caraUsada)}
          className="rounded border border-dark-line-2 bg-dark-surface-2 px-2 py-1.5 text-[11px] font-semibold text-dark-ink-2 hover:text-dark-ink-1">
          Encuadrar esta cara
        </button>

        {enCaminata ? (
          <p className="text-[10px] leading-relaxed text-dark-ink-3">
            Salí de la caminata para guardar una vista: en primera persona la
            cámara no se guarda.
          </p>
        ) : (
          <button
            onClick={() => guardarVista(fix.id, caraUsada, { ...camara3D })}
            className="rounded-md bg-accent px-2 py-1.5 text-[11px] font-semibold text-accent-ink hover:opacity-90">
            {guardada ? "Reemplazar por la vista actual" : "Guardar esta vista"}
          </button>
        )}

        {guardada && (
          <button
            onClick={() => borrarVista(fix.id, caraUsada)}
            className="rounded border border-dark-line-2 px-2 py-1 text-[10px] text-dark-ink-3 hover:text-dark-ink-1">
            Olvidar la vista guardada
          </button>
        )}
      </div>

      <p className="mt-2 text-[10px] leading-relaxed text-dark-ink-3">
        {guardada
          ? "Esta cara abre siempre en el ángulo guardado."
          : "Sin vista guardada abre de frente a la exhibición, calculado."}
      </p>
    </div>
  );
}

// ─── MEJORA 6: Transform Controls (Gizmo) ────────────────────────────────────

function FixtureTransformControls({
  fixture, orbitRef, onMove, limites
}: {
  fixture: PlacedFixture;
  orbitRef: React.MutableRefObject<ThreeOrbitControls|null>;
  onMove: (id: string, x: number, z: number) => void;
  limites: LimitesPlanta;
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
    // TransformControls dejó de ser un Object3D: en three 0.184 extiende
    // Controls, y lo que va a la escena es su ayudante. El `as unknown as`
    // que había acá silenciaba el error de tipos pero no el de runtime — la
    // escena rechazaba el objeto y **el gizmo nunca se dibujó**. Sólo se veía
    // al seleccionar un mueble, que hasta ahora era raro.
    const ayudante = ctrl.getHelper();
    ayudante.userData.chrome = true;   // fuera de las capturas
    scene.add(ayudante);
    ctrlRef.current = ctrl;

    const onDragging = (e: THREE.Event) => {
      if (orbitRef.current) orbitRef.current.enabled = !(e as any).value;
    };
    const onObjectChange = () => {
      if (!groupRef.current) return;
      const p = groupRef.current.position;
      onMove(fixture.id, snap(p.x), snap(p.z));
      // Contra STORE_W/STORE_D esto encerraba el gizmo en x ≥ 0, y la mitad
      // izquierda de una sede real quedaba fuera de alcance al arrastrar.
      p.x = Math.max(limites.minX, Math.min(limites.maxX, p.x));
      p.z = Math.max(limites.minZ, Math.min(limites.maxZ, p.z));
      p.y = 0;
    };

    ctrl.addEventListener('dragging-changed', onDragging);
    ctrl.addEventListener('objectChange', onObjectChange);

    return () => {
      ctrl.removeEventListener('dragging-changed', onDragging);
      ctrl.removeEventListener('objectChange', onObjectChange);
      ctrl.detach();
      scene.remove(ayudante);
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
// La caminata se apoya en tres cosas que antes no existían: los límites salen
// de la planta real (no de STORE_W/STORE_D), los muebles frenan, y el paso se
// mide en metros por segundo en vez de metros por frame.

function FirstPersonControls({
  orbitRef, active, fixtures, limites, onCamara, saltarA
}: {
  orbitRef: React.MutableRefObject<ThreeOrbitControls|null>;
  active:   boolean;
  fixtures: PlacedFixture[];
  limites:  LimitesPlanta;
  /** Avisa dónde está y hacia dónde mira, para el minimapa. */
  onCamara: (c: CamaraEnPlanta | null) => void;
  /** Pedido de teletransporte. `n` cambia en cada clic para que tocar dos
   *  veces el mismo punto del plano vuelva a saltar. */
  saltarA:  { x: number; z: number; n: number } | null;
}) {
  const { camera, gl, invalidate } = useThree();
  const ctrlRef = useRef<PointerLockControls|null>(null);
  const keys    = useRef<Record<string, boolean>>({});
  const CAM_Y   = 1.65;

  const muros   = useMemo(() => murosDeCaminata(fixtures), [fixtures]);
  const entrada = useMemo(() => puntoDeEntrada(limites, muros), [limites, muros]);

  /** Último estado informado al minimapa, para no re-renderizar en cada cuadro. */
  const ultimo = useRef<CamaraEnPlanta | null>(null);
  const avisar = useCallback(() => {
    const d = camera.getWorldDirection(new THREE.Vector3());
    const p = camera.position;
    const previo = ultimo.current;
    // Un umbral por posición y otro por giro: caminar redibuja el minimapa unas
    // pocas veces por metro en vez de 60 veces por segundo.
    if (previo) {
      const movio = Math.hypot(p.x - previo.x, p.z - previo.z) > 0.12;
      const giro  = Math.hypot(d.x - previo.dirX, d.z - previo.dirZ) > 0.04;
      if (!movio && !giro) return;
    }
    const c = { x: p.x, z: p.z, dirX: d.x, dirZ: d.z };
    ultimo.current = c;
    onCamara(c);
  }, [camera, onCamara]);

  useEffect(() => {
    if (!active) return;

    camera.position.set(entrada.x, CAM_Y, entrada.z);
    // Mirar a lo largo del lado más largo del local, no contra una pared.
    if (limites.w >= limites.d) camera.lookAt(limites.maxX, CAM_Y, entrada.z);
    else                        camera.lookAt(entrada.x, CAM_Y, limites.maxZ);

    const ctrl = new PointerLockControls(camera, gl.domElement);
    ctrlRef.current = ctrl;

    // Con frameloop="demand" el lienzo sólo dibuja cuando se lo pide alguien.
    // PointerLockControls mueve la cámara en el mousemove, fuera del bucle de
    // cuadros: sin esto, parado y mirando alrededor la imagen quedaba
    // congelada hasta que uno tocaba una tecla de movimiento.
    const alMirar = () => { invalidate(); avisar(); };
    ctrl.addEventListener('change', alMirar);

    if (orbitRef.current) orbitRef.current.enabled = false;
    avisar();

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
      ctrl.removeEventListener('change', alMirar);
      ctrl.unlock();
      ctrl.dispose();
      ctrlRef.current = null;
      keys.current = {};
      ultimo.current = null;
      onCamara(null);
      gl.domElement.removeEventListener('click', lockOnClick);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('keyup',   onKey);
      // Volver a una vista general de ESTA planta. CAM_POS apunta al centro de
      // la tienda ficticia; en una sede real dejaba la cámara mirando al vacío.
      const { pos, mirada } = vistaGeneral(limites);
      camera.position.set(pos.x, pos.y, pos.z);
      const orbit = orbitRef.current;
      if (orbit) {
        orbit.enabled = true;
        // Apuntar al centro real del local. Una cámara guardada de antes trae
        // el centro de la tienda ficticia y deja la sede corrida a un lado.
        orbit.target.set(mirada.x, mirada.y, mirada.z);
        // Sin update() la cámara conserva la rotación de la caminata y sigue
        // mirando la góndola que uno tenía enfrente; sin invalidate() el cuadro
        // nuevo nunca se dibuja, porque el lienzo sólo renderiza bajo demanda.
        orbit.update();
      }
      invalidate();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, camera, gl, invalidate, entrada, limites, avisar, onCamara]);

  // Teletransporte: aterriza en el lugar despejado más cercano a lo que se
  // tocó en el plano. Quien apunta al medio de una góndola quiere el pasillo
  // de al lado, no que no pase nada. La mirada no se toca: uno salta, no gira.
  const saltoAtendido = useRef<number>(-1);
  useEffect(() => {
    if (!active || !saltarA || saltoAtendido.current === saltarA.n) return;
    saltoAtendido.current = saltarA.n;
    const destino = puntoLibreCerca(limites, muros, saltarA.x, saltarA.z);
    camera.position.set(destino.x, CAM_Y, destino.z);
    avisar();
    invalidate();
  }, [active, saltarA, limites, muros, camera, avisar, invalidate]);

  useFrame((_, delta) => {
    if (!active || !ctrlRef.current?.isLocked) return;
    const k = keys.current;
    const adelante = k['KeyW'] || k['ArrowUp'];
    const atras    = k['KeyS'] || k['ArrowDown'];
    const izq      = k['KeyA'] || k['ArrowLeft'];
    const der      = k['KeyD'] || k['ArrowRight'];
    if (!adelante && !atras && !izq && !der) return;

    // delta acotado: si la pestaña estuvo en segundo plano, un salto de varios
    // segundos atravesaría media tienda de un tirón.
    const vel  = (k['ShiftLeft'] || k['ShiftRight']) ? VEL_APURADA : VEL_CAMINANDO;
    const paso = vel * Math.min(delta, 0.1);

    const antesX = camera.position.x;
    const antesZ = camera.position.z;

    if (adelante) ctrlRef.current.moveForward(paso);
    if (atras)    ctrlRef.current.moveForward(-paso);
    if (izq)      ctrlRef.current.moveRight(-paso);
    if (der)      ctrlRef.current.moveRight(paso);

    const { x, z } = resolverPaso(
      { x: antesX, z: antesZ },
      { x: camera.position.x, z: camera.position.z },
      limites, muros,
    );

    camera.position.set(x, CAM_Y, z);
    avisar();
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

/**
 * Los muebles que pueden llevar el producto del proveedor.
 *
 * Antes eran DOS listas que se cruzaban —una de «tiene estantes» y otra de
 * «tiene cara pintable»— y bastaba faltar en cualquiera para quedar afuera. El
 * resultado: 8 de los 13 tipos que se venden no mostraban nada al cargarles el
 * arte, y justo los promocionales (isla, batea, impulsador, ristra). Una sola
 * lista, y lo que decide CÓMO se pinta es `getPanelShelfSpan`.
 *
 * Lo que no está acá es infraestructura: no se alquila, así que no lleva
 * producto de nadie.
 */
const TIPOS_CON_PRODUCTO = new Set<string>([
  "gondola", "gondola_doble", "punta", "robatope", "mueble", "nevera_refrescos",
  "isla", "batea", "impulsador", "ristra", "cross",
  "stand_frutas", "nevera_carnes", "isla_fria", "exhibicion",
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

/** De dónde sale una textura de producto.
 *
 *  Hay dos orígenes y el compositor no distingue entre ellos: el archivo del
 *  espacio (`archivo:<id>`, el camino viejo) y el catálogo del proveedor
 *  (`catalogo:<id>`, el que se usa para vender). La clave NO puede llevar `|`
 *  porque la evicción borra los materiales derivados por prefijo. */
interface FuenteTextura {
  clave: string;
  url:   string;
}

/** Base photo texture per source — loaded at most once per session. */
const photoTexCache = new Map<string, PhotoTexEntry>();
/** Cover-fitted photo material per (source × face-aspect bucket). */
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
  // Drop every derived material for that source — photoMatCache keys are
  // `${clave}|${type}|<span>`, so match on the clave prefix.
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

/**
 * Cómo lleva producto un mueble. No todos llevan estantes, y ésa es la razón
 * por la que la mitad del catálogo no se podía vestir: el compositor sólo sabía
 * apilar filas sobre entrepaños, así que una batea —que no tiene ninguna cara
 * vertical que pintar— nunca pudo entrar.
 *
 * · `estante` — filas de facings sobre entrepaños. Góndola, punta, vitrina.
 * · `volcado` — producto a granel visto DESDE ARRIBA. Batea, isla de piso,
 *               isla fría, mostrador de carnes, cajón de frutas.
 * · `tira`    — una columna de unidades colgadas. Ristra.
 */
type ModoProducto = "estante" | "volcado" | "tira";

interface PanelShelfSpan {
  /** Ausente = "estante", que es como se comportaba todo hasta ahora. */
  modo?:     ModoProducto;
  panelW:    number;
  /** Alto de la cara pintada, o FONDO de la superficie en un volcado. */
  panelH:    number;
  rowBottom: number;
  rowPitch:  number;
  rows:      number;
}

/** Ancho de una unidad de producto vista desde arriba, en metros. Un frente de
 *  paquete típico; a granel se ven de ese tamaño y con eso la batea se lee
 *  llena en vez de con cuatro paquetes gigantes. */
const ANCHO_UNIDAD = 0.13;

function getPanelShelfSpan(type: string, w: number, h: number, d: number): PanelShelfSpan {
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
    case "ristra": {
      // RistraMesh — tira colgante: una columna de unidades, no filas.
      return { modo: "tira", panelW: w * 0.55, panelH: h - 0.12, rowBottom: 0, rowPitch: 0, rows: 0 };
    }
    case "cross": {
      // CrossMesh — estantes en `py = 0.10 + i·((h-0.12)/(n-1))`, tabla de
      // 0.026, n = max(4, round(h/0.36)). Mantener en sync con la malla.
      const n     = Math.max(4, Math.round(h / 0.36));
      const pitch = (h - 0.12) / Math.max(n - 1, 1);
      return { panelW: w - 0.07, panelH: h, rowBottom: 0.10 + 0.013, rowPitch: pitch, rows: Math.max(1, n - 1) };
    }
    case "impulsador": {
      // ImpulsadorMesh — panel [w, h - topperH]; estantes en
      // `baseH + i·shelfGap`, tabla de 0.018. Mantener en sync con la malla.
      const topperH = 0.24, baseH = 0.10;
      const bodyH   = h - topperH - baseH;
      const n       = Math.max(3, Math.round(bodyH / 0.30));
      const pitch   = bodyH / Math.max(n - 1, 1);
      return { panelW: w, panelH: h - topperH, rowBottom: baseH + 0.009, rowPitch: pitch, rows: Math.max(1, n - 1) };
    }
    case "stand_frutas": {
      // StandFrutasMesh — el cajón poco profundo de arriba del mesón; el
      // producto se ve desde arriba, apoyado en su piso.
      return { modo: "volcado", panelW: w - 0.07, panelH: d - 0.07, rowBottom: 0, rowPitch: 0, rows: 0 };
    }
    case "nevera_carnes": {
      // NeveraCarnesMesh — mostrador con bandeja fría bajo el vidrio curvo.
      return { modo: "volcado", panelW: w - 0.10, panelH: d - 0.08, rowBottom: 0, rowPitch: 0, rows: 0 };
    }
    case "isla_fria": {
      // IslaFriaMesh — pozo abierto de verdad: el producto se apoya en su piso,
      // entre paredes de 0.055 y con 1 cm de aire por lado.
      return { modo: "volcado", panelW: w - 0.13, panelH: d - 0.13, rowBottom: 0, rowPitch: 0, rows: 0 };
    }
    case "isla": {
      // IslaMesh — exhibidor de piso escalonado. El producto va VOLCADO sobre
      // cada andén, así que lo que se compone es una superficie horizontal: acá
      // `panelH` es el FONDO, no un alto. Se describe el andén más grande —el
      // de abajo— y los de arriba usan la misma textura a su tamaño; como es un
      // montón a granel y no una grilla, la diferencia de escala no se lee.
      return { modo: "volcado", panelW: w, panelH: d, rowBottom: 0, rowPitch: 0, rows: 0 };
    }
    case "batea": {
      // BateaMesh — canasto. Una sola superficie: el fondo falso, cerca del borde.
      return { modo: "volcado", panelW: w - 0.06, panelH: d - 0.06, rowBottom: 0, rowPitch: 0, rows: 0 };
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
  fuente: FuenteTextura,
  fixType: string,
  faceW: number,
  faceH: number,
  faceD: number,
  notify: () => void,
): THREE.MeshBasicMaterial | null {
  let entry = photoTexCache.get(fuente.clave);
  if (!entry) {
    evictOldestPhotoIfFull();
    const fresh: PhotoTexEntry = { status: "loading", aspect: 1, waiters: new Set() };
    photoTexCache.set(fuente.clave, fresh);
    entry = fresh;
    // Same-origin URL; the JWT rides in the ?token= query.
    new THREE.TextureLoader().load(
      fuente.url,
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
  const raw = getPanelShelfSpan(fixType, faceW, faceH, faceD);
  const span: PanelShelfSpan = {
    modo:      raw.modo,
    panelW:    Math.max(0.05, q(raw.panelW)),
    panelH:    Math.max(0.05, q(raw.panelH)),
    rowBottom: q(raw.rowBottom),
    rowPitch:  Math.max(0.05, q(raw.rowPitch)),
    rows:      raw.rows,
  };
  // Key carries the type + full span: types with different board layouts must
  // never share a wrongly-offset canvas for the same photo.
  const key = `${fuente.clave}|${fixType}|${span.modo ?? "estante"}|${span.rows}|${span.panelW}|${span.panelH}|${span.rowBottom}|${span.rowPitch}`;
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

    if (span.modo === "volcado") {
      // Producto a granel visto desde arriba. Se dibuja en cuadrícula con un
      // giro alterno chico y solape: sin eso se ve una plantilla de imprenta y
      // no un canasto lleno. El giro es determinista —depende de la celda, no
      // del azar— para que la misma batea se dibuje siempre igual.
      const cellW = Math.min(ANCHO_UNIDAD, span.panelW / 2);
      const cellH = Math.max(0.04, cellW / Math.max(0.2, entry.aspect));
      const pasoX = cellW * 0.88;
      const pasoY = cellH * 0.80;
      let fila = 0;
      for (let y = -cellH * 0.3; y < span.panelH; y += pasoY, fila++) {
        const corrida = fila % 2 === 0 ? 0 : pasoX / 2;   // traba, como se apila
        let col = 0;
        for (let x = -cellW * 0.3 + corrida; x < span.panelW; x += pasoX, col++) {
          const giro = (((fila * 7 + col * 5) % 5) - 2) * 0.055;   // ±6°
          ctx.save();
          ctx.translate((x + cellW / 2) * px, (y + cellH / 2) * px);
          ctx.rotate(giro);
          ctx.drawImage(image, (-cellW / 2) * px, (-cellH / 2) * px, cellW * px, cellH * px);
          ctx.restore();
        }
      }
      const texV = new THREE.CanvasTexture(canvas);
      texV.colorSpace = THREE.SRGBColorSpace;
      texV.anisotropy = 4;
      texV.wrapS = THREE.ClampToEdgeWrapping;
      texV.wrapT = THREE.ClampToEdgeWrapping;
      mat = new THREE.MeshBasicMaterial({ map: texV, toneMapped: false, transparent: true });
      photoMatCache.set(key, mat);
      return mat;
    }

    if (span.modo === "tira") {
      // Una columna de unidades colgadas, de arriba hacia abajo. El ancho lo
      // manda el panel: una ristra es angosta por definición.
      const cellW = span.panelW;
      const cellH = Math.max(0.04, cellW / Math.max(0.2, entry.aspect));
      for (let y = 0; y + cellH <= span.panelH + 0.001; y += cellH) {
        ctx.drawImage(image, 0, y * px, cellW * px, cellH * px);
      }
      const texT = new THREE.CanvasTexture(canvas);
      texT.colorSpace = THREE.SRGBColorSpace;
      texT.anisotropy = 4;
      texT.wrapS = THREE.ClampToEdgeWrapping;
      texT.wrapT = THREE.ClampToEdgeWrapping;
      mat = new THREE.MeshBasicMaterial({ map: texT, toneMapped: false, transparent: true });
      photoMatCache.set(key, mat);
      return mat;
    }

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

/**
 * Resolve the material for ONE face, by priority:
 *   producto en prueba → supplier photo → category pattern → null (plain color).
 *
 * El producto en prueba va PRIMERO porque es una elección explícita hecha en
 * ese momento, delante del proveedor: tiene que ganarle a lo que haya cargado
 * de antes, que es justamente lo que se está proponiendo reemplazar.
 */
function resolveFaceMaterial(
  arteId:   number | null,
  faceCode: string | null,
  fixType:  string,
  category: string,
  label:    string,
  faceW:    number,
  faceH:    number,
  faceD:    number,
  faceImages: Map<string, number> | null,
  notify:     () => void,
): THREE.Material | null {
  const aspect = faceW / Math.max(0.05, faceH);
  // El patrón de categoría dibuja estantes con paquetes: sobre la superficie de
  // un volcado o en una ristra sería un dibujo de góndola pegado donde no va.
  // Sin foto, esos muebles quedan pelados, que es lo honesto.
  const soloFoto = getPanelShelfSpan(fixType, faceW, faceH, faceD).modo !== undefined
    && getPanelShelfSpan(fixType, faceW, faceH, faceD).modo !== "estante";
  if (arteId != null) {
    const arte = getPhotoFaceMaterial(
      { clave: `catalogo:${arteId}`, url: arteUrl(arteId) },
      fixType, faceW, faceH, faceD, notify,
    );
    // Si todavía carga —o si alguien borró el arte del catálogo— se cae al
    // camino de siempre en vez de dejar el mueble pelado a mitad de una
    // reunión.
    if (arte) return arte;
  }
  if (faceCode && faceImages) {
    const fileId = faceImages.get(faceCode);
    if (fileId !== undefined) {
      const photo = getPhotoFaceMaterial(
        { clave: `archivo:${fileId}`, url: fileUrl(fileId) },
        fixType, faceW, faceH, faceD, notify,
      );
      if (photo) return photo;
      // still loading or failed → fall through to the category pattern
    }
  }
  if (soloFoto) return null;
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
  screenshotReady:   (fn: () => string) => void;
  topViewReady:      (fn: () => void) => void;
  firstPerson:       boolean;
  /** Apaga las artes del proveedor: el «antes» del antes y después. */
  sinArte:           boolean;
  /** Producto que se está probando en cada cara: `${fixtureId}|A` → id del
   *  arte del catálogo. Se indexa por id de mueble y cara, y NO por código de
   *  espacio: el código se compone en tres lugares con reglas de prefijo y
   *  mayúsculas, y basta que una difiera para pintar el mueble equivocado. */
  prueba:            Map<string, number>;
  onCamaraFP:        (c: CamaraEnPlanta | null) => void;
  saltarA:           { x: number; z: number; n: number } | null;
  onHoverFixture:    (id: string|null, x: number, y: number) => void;
  fixtures:          import("../../types/fixtures").UnifiedFixture[];
}

function Scene({
  placedFixtures, selectedId, selectedSlotId,
  placingDef, ghostX, ghostZ, ghostRotY, ghostCollides,
  draggingId, orbitRef, onFloorMove, onFloorClick,
  onSelectFixture, setPlacedFixtures,
  screenshotReady, topViewReady, firstPerson, sinArte, prueba, onCamaraFP, saltarA,
  onHoverFixture, fixtures,
}: SceneProps) {
  const { gl, camera, invalidate } = useThree();
  const { setCamera3D } = useFixtureStore();

  // Extensión real del local. De aquí salen la grilla, el piso que recibe
  // clics, la vista superior y los límites de la caminata en primera persona.
  const limites = useMemo(() => limitesDePlanta(placedFixtures, 2.5, PLANTA_NOMINAL), [placedFixtures]);

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
    // Sin arte no se pinta NADA sobre las caras: ni la foto del proveedor ni el
    // patrón de categoría. El «antes» tiene que ser el mueble pelado, que es
    // contra lo que se compara la marca puesta.
    if (sinArte) return map;
    const storeSede = useFixtureStore.getState().sede;
    for (const fix of placedFixtures) {
      const type = fix.type as string;
      if (!TIPOS_CON_PRODUCTO.has(type)) continue;
      // Infrastructure never carries a supplier planogram.
      if (!isRentable(fix)) continue;
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
        prueba.get(`${fix.id}|A`) ?? null,
        pickCode(fullCode, codeUC), type, fix.brandCategory, fix.label,
        fix.w, fix.h, fix.d, faceImages, notifyTexLoaded,
      );
      const back = isDouble
        ? resolveFaceMaterial(
            prueba.get(`${fix.id}|B`) ?? null,
            pickCode(`${fullCode}-B`, `${codeUC}-B`), type, uf?.faceB?.brandCategory ?? "", fix.label,
            fix.w, fix.h, fix.d, faceImages, notifyTexLoaded,
          )
        : null;
      if (front || back) map.set(fix.id, { front, back });
    }
    return map;
  // texVersion re-runs this memo when an async photo texture settles
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placedFixtures, unifiedById, faceImages, texVersion, notifyTexLoaded, sinArte, prueba]);

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
      camera.position.set(limites.cx, Math.max(limites.w, limites.d) * 0.9, limites.cz);
      ctrl.target.set(limites.cx, 0, limites.cz);
      ctrl.update();
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topViewReady, limites]);

  // CHANGE 2A — Encuadrar el local al abrir.
  //
  // Antes esto sólo actuaba si el punto de mira estaba exactamente en el
  // origen. Una cámara guardada apuntando al centro de la tienda ficticia
  // (15, 21) pasaba el filtro y la sede quedaba arrinconada en una esquina de
  // la pantalla al entrar. Ahora se reencuadra siempre que la mira caiga fuera
  // del local; si el usuario la dejó adentro, se respeta su encuadre.
  useEffect(() => {
    const orbit = orbitRef.current;
    if (!orbit || placedFixtures.length === 0) return;
    const t = orbit.target;
    if (miradaSensata(limites, t.x, t.z)) return;
    const { pos, mirada } = vistaGeneral(limites);
    camera.position.set(pos.x, pos.y, pos.z);
    orbit.target.set(mirada.x, mirada.y, mirada.z);
    orbit.update();
    invalidate();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placedFixtures, limites]);

  /** Deja la cámara en una vista concreta y redibuja. */
  const aplicarVista = useCallback((v: Vista3D) => {
    const orbit = orbitRef.current;
    camera.position.set(v.posX, v.posY, v.posZ);
    if (orbit) {
      orbit.target.set(v.targetX, v.targetY, v.targetZ);
      orbit.update();
    }
    invalidate();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, invalidate]);

  // Encuadrar el espacio que se pidió desde la pantalla de sede.
  //
  // Se espera a estar fuera de la primera persona: al salir de la caminata su
  // limpieza también mueve la cámara, y las dos escrituras en el mismo commit
  // se pisan. Con el pedido atendido por número, entrar y salir de la caminata
  // no vuelve a encuadrar solo.
  const enfoque3D = useFixtureStore((st) => st.enfoque3D);
  const enfoqueAtendido = useRef<number>(-1);
  useEffect(() => {
    if (!enfoque3D || firstPerson) return;
    if (enfoqueAtendido.current === enfoque3D.n) return;
    const uf = fixtures.find((f) => f.id === enfoque3D.fixtureId);
    if (!uf) return;   // todavía no cargó la sede — se reintenta al llegar
    enfoqueAtendido.current = enfoque3D.n;
    // La vista guardada manda: alguien la eligió a mano para este espacio.
    aplicarVista(uf.vista3D?.[enfoque3D.cara] ?? vistaDeCara(uf, enfoque3D.cara));
  }, [enfoque3D, firstPerson, fixtures, aplicarVista]);

  // CHANGE 2B — Double-click to reset orbit pivot to clicked point
  function handleSceneDoubleClick(e: any) {
    if (!orbitRef.current || !e.point) return;
    orbitRef.current.target.set(e.point.x, 0, e.point.z);
    orbitRef.current.update();
  }

  // Two-level grid: major 1 m lines (visible) + minor 0.5 m lines (faint).
  // Se dimensiona y se centra sobre la planta real. El centro y el tamaño se
  // redondean a 1 m para no reconstruir la grilla en cada frame de un arrastre.
  const gridCX   = Math.round(limites.cx);
  const gridCZ   = Math.round(limites.cz);
  const gridSize = Math.ceil(Math.max(limites.w, limites.d)) + 4;
  const { gridMajor, gridMinor } = useMemo(() => {
    const DIVS = gridSize; // 1 m per cell
    const major = new THREE.GridHelper(gridSize, DIVS, "#a09890", "#cbc6be");
    major.position.set(gridCX, 0.004, gridCZ);
    (major.material as THREE.LineBasicMaterial).transparent = true;
    (major.material as THREE.LineBasicMaterial).opacity = 0.55;

    const minor = new THREE.GridHelper(gridSize, DIVS * 2, "#dbd8d4", "#dbd8d4");
    minor.position.set(gridCX, 0.002, gridCZ);
    (minor.material as THREE.LineBasicMaterial).transparent = true;
    (minor.material as THREE.LineBasicMaterial).opacity = 0.35;

    return { gridMajor: major, gridMinor: minor };
  }, [gridCX, gridCZ, gridSize]);

  // Liberar la grilla anterior cuando cambia el tamaño de la planta.
  useEffect(() => () => {
    [gridMajor, gridMinor].forEach(g => {
      g.geometry.dispose();
      (g.material as THREE.Material).dispose();
    });
  }, [gridMajor, gridMinor]);

  const ghostFixture: PlacedFixture | null = placingDef ? {
    id:"ghost", code:"", type:placingDef.type,
    gondolaType: placingDef.gondolaType,
    x:ghostX, z:ghostZ, rotY:ghostRotY,
    w:placingDef.w, d:placingDef.d, h:placingDef.h,
    label:placingDef.label, color:placingDef.color,
    supplierName:"", brandCategory:"",
    status:"free", negotiatedValue:0,
    startDate:"", endDate:"", observation:"",
    ...(NON_RENTABLE_BY_DEFAULT.has(placingDef.type) ? { rentable: false } : {}),
  } : null;

  return (
    <>
      {/* MEJORA 1: Rebalanced lights */}
      <ambientLight intensity={0.55} color="#fff8f0" />
      {/* La luz principal y su cámara de sombras se cuelgan de la planta real:
          ancladas a STORE_W/STORE_D iluminaban una tienda que no existe y
          recortaban la sombra justo donde empieza la mitad izquierda de NAVE. */}
      <directionalLight position={[limites.cx,40,limites.cz]} intensity={1.6} castShadow
        shadow-mapSize-width={1024} shadow-mapSize-height={1024}
        shadow-camera-near={0.5} shadow-camera-far={120}
        shadow-camera-left={-limites.w/2 - 4} shadow-camera-right={limites.w/2 + 4}
        shadow-camera-top={limites.d/2 + 4} shadow-camera-bottom={-limites.d/2 - 4} />
      <directionalLight position={[limites.minX,25,limites.minZ]} intensity={0.3} color="#fffaee" />
      <directionalLight position={[limites.maxX,25,limites.maxZ]} intensity={0.2} color="#e0eeff" />

      <StoreRoom fixtures={placedFixtures} muros={firstPerson} />

      {/* La persona, al lado del mueble elegido. En primera persona no va: la
          persona sos vos, y una segunda parada al lado del estante distrae. */}
      {!firstPerson && (() => {
        const sel = placedFixtures.find((f) => f.id === selectedId);
        if (!sel) return null;
        // Sin el propio mueble: su huella inflada cubre justo el costado donde
        // la figura tiene que pararse, y se bloquearía a sí misma.
        const p = lugarDeLaFigura(sel, murosDeCaminata(
          placedFixtures.filter((f) => f.id !== sel.id),
        ));
        return p ? <FiguraHumana x={p.x} z={p.z} rotY={p.rotY} /> : null;
      })()}
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
        position={[limites.cx,0.005,limites.cz]}
        onDoubleClick={handleSceneDoubleClick}
        onPointerMove={e=>{
          e.stopPropagation();
          const cx=Math.max(limites.minX,Math.min(limites.maxX,snap(e.point.x)));
          const cz=Math.max(limites.minZ,Math.min(limites.maxZ,snap(e.point.z)));
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
            const cx=Math.max(limites.minX,Math.min(limites.maxX,snap(e.point.x)));
            const cz=Math.max(limites.minZ,Math.min(limites.maxZ,snap(e.point.z)));
            onFloorClick(cx,cz);
          }
        }}
      >
        <planeGeometry args={[limites.w+40,limites.d+40]} />
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
                isRentable(unifiedFix) &&
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
              // El mueble se selecciona en `pointerdown`, pero el `click` que
              // viene después seguía bajando hasta el piso —que está detrás y
              // sí tiene onClick— y ahí `onFloorClick` hacía `setSelectedId(null)`.
              // O sea: un clic sobre un mueble lo seleccionaba y lo
              // deseleccionaba en el mismo gesto, y el panel comercial del 3D
              // no se abría nunca por ese camino. Cortar la propagación acá lo
              // arregla sin tocar ninguna de las dos puntas.
              //
              // Mientras se está COLOCANDO un mueble no se corta: ahí el clic
              // tiene que llegar al piso, que es quien detecta que se está
              // montando sobre otro y lo avisa.
              onClick={e=>{
                if (placingDef || firstPerson) return;
                e.stopPropagation();
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
            limites={limites}
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
      <FirstPersonControls
        orbitRef={orbitRef}
        active={firstPerson}
        fixtures={placedFixtures}
        limites={limites}
        onCamara={onCamaraFP}
        saltarA={saltarA}
      />

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
        planogram:       f.planogram,
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
        rentable:        f.rentable,
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

  // PlacedFixture models only what the 3D scene needs. Any UnifiedFixture field
  // the 3D editor does not know about (face B contracts, the old name kept for
  // reconciliation) must be carried over from the store, otherwise simply
  // opening this editor would blank it out for every fixture and push the loss
  // to the server.
  const existingMap = new Map(existingStore.map((f) => [f.id, f]));

  const updated: UnifiedFixture[] = fixtures.map((f) => {
    const existing = existingMap.get(f.id);
    return {
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
      planogram:       f.planogram ?? existing?.planogram,
      rentable:        f.rentable,
      // ── Preserved from the store (not modelled in 3D) ──────────────────────
      // El nombre VIEJO: nadie lo escribe ya, pero borrarlo dejaría sin fuente a
      // la reconciliación de los contratos que se negociaron con ese nombre.
      nomenclatura:    existing?.nomenclatura,
      nombreAnterior:  existing?.nombreAnterior,
      faceB:           existing?.faceB,
      // Las vistas guardadas viven en el layout pero no las modela el 3D: sin
      // esta línea, mover un mueble borraba todos los encuadres de la sede y
      // le mandaba la pérdida al servidor.
      vista3D:         existing?.vista3D,
    };
  });

  return [...exhibicion, ...updated];
}

// ─── CommercialPanel ──────────────────────────────────────────────────────────

interface CommercialPanelProps {
  fix:           PlacedFixture;
  /** En primera persona la cámara no se persiste: el bloque de vista lo avisa. */
  enCaminata:    boolean;
  catalogo:          Arte[];
  cargandoCatalogo:  boolean;
  prueba:            Map<string, number>;
  onProbar:          (fixtureId: string, cara: "A" | "B", arteId: number | null) => void;
  onRecargarCatalogo: () => void;
  selectedSlot:  ShelfSlot | null;
  onUpdate:      (id:string, u:Partial<PlacedFixture>) => void;
  /** Todo el plano de la sede: sin los demás muebles no se puede decir si el
   *  nombre que se está escribiendo ya es de otro. */
  muebles:       PlacedFixture[];
  /** El nombre NO se escribe con `onUpdate`. Va por acá, que es el mismo camino
   *  que el doble clic del plano 2D y el campo de su panel: `renombrar`
   *  comprueba y escribe en la misma llamada. Null = se pudo. */
  onRenombrar:   (id:string, nombre:string) => RechazoDeNombre<PlacedFixture> | null;
  /** Los dos nombres a la vez, que es cómo se renumera una corrida a mano. */
  onIntercambiar:(esteId:string, otroId:string) => void;
  onUpdateSlot:  (fixtureId:string, slotId:string, u:Partial<ShelfSlot>) => void;
  onRotate:      () => void;
  onFlip:        () => void;
  onDelete:      () => void;
  onClose:       () => void;
  onSlotClose:   () => void;
}

/** Biblioteca de producto inicial y acciones de auto-facing por repisa.
 * Vive sobre el modelo `planogram`, no sobre `slots`: un slot es un espacio
 * comercial y una shelf es la superficie física que sostiene producto. */
function PlanogramPanel({ fix, onChange }: { fix: PlacedFixture; onChange: (planogram: FixturePlanogram) => void }) {
  const planogram = useMemo(() => fix.planogram ?? createGondolaPlanogram({
    fixtureId: fix.id, width: fix.w, depth: fix.d, height: fix.h,
    doubleSided: fix.gondolaType !== "wall",
  }), [fix]);
  const [shelfId, setShelfId] = useState(planogram.shelves[0]?.id ?? "");
  const [productId, setProductId] = useState(planogram.products[0]?.id ?? "");
  const shelf = planogram.shelves.find(item => item.id === shelfId) ?? planogram.shelves[0];
  const product = planogram.products.find(item => item.id === productId) ?? planogram.products[0];
  const capacity = shelf && product ? calculateShelfCapacity(shelf, product) : null;

  useEffect(() => {
    setShelfId(current => planogram.shelves.some(item => item.id === current) ? current : (planogram.shelves[0]?.id ?? ""));
    setProductId(current => planogram.products.some(item => item.id === current) ? current : (planogram.products[0]?.id ?? ""));
  }, [planogram]);

  if (!shelf || !product || !capacity) return null;
  const fillShelf = (quantity = capacity.capacity) => {
    const placements = generateProductPlacements({ fixtureId: fix.id, faceId: shelf.faceId, shelf, product, quantity });
    onChange({ ...planogram, placements: [...planogram.placements.filter(item => item.shelfId !== shelf.id), ...placements] });
  };
  const itemsOnShelf = planogram.placements.filter(item => item.shelfId === shelf.id).length;
  return (
    <section className="rounded-lg border border-dark-line bg-dark-bg/50 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-dark-ink-3">Planograma · productos</p>
        <span className="rounded bg-accent/15 px-1.5 py-0.5 font-mono text-[9px] text-accent-200">{planogram.placements.length} uds.</span>
      </div>
      <label className={ETIQUETA_CLS}>Repisa</label>
      <select value={shelf.id} onChange={event => setShelfId(event.target.value)} className="mb-2 w-full rounded border border-dark-line-2 bg-dark-bg px-2 py-1 text-xs text-dark-ink-1">
        {planogram.shelves.map(item => <option key={item.id} value={item.id}>Cara {item.faceId} · repisa {item.index + 1}</option>)}
      </select>
      <label className={ETIQUETA_CLS}>Producto</label>
      <select value={product.id} onChange={event => setProductId(event.target.value)} className="w-full rounded border border-dark-line-2 bg-dark-bg px-2 py-1 text-xs text-dark-ink-1">
        {planogram.products.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      <p className="mt-2 text-[10px] leading-relaxed text-dark-ink-3">
        {capacity.facings} facings × {capacity.rows} filas = <b className="text-dark-ink-1">{capacity.capacity}</b> unidades · {itemsOnShelf} colocadas.
      </p>
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <button onClick={() => fillShelf(1)} className="rounded border border-dark-line-2 px-2 py-1 text-[10px] font-semibold text-dark-ink-2 hover:text-dark-ink-1">Colocar 1</button>
        <button onClick={() => fillShelf()} className="rounded bg-accent px-2 py-1 text-[10px] font-bold text-accent-ink hover:brightness-110">Auto-llenar</button>
      </div>
    </section>
  );
}

function CommercialPanel({
  fix, enCaminata, catalogo, cargandoCatalogo, prueba, onProbar, onRecargarCatalogo,
  selectedSlot, onUpdate, muebles, onRenombrar, onIntercambiar, onUpdateSlot,
  onRotate, onFlip, onDelete, onClose, onSlotClose,
}: CommercialPanelProps) {
  const isAdmin = useAuthStore(selectIsAdmin);
  const u  = useCallback((up: Partial<PlacedFixture>) => onUpdate(fix.id, up), [fix.id, onUpdate]);
  const us = useCallback((up: Partial<ShelfSlot>) => selectedSlot && onUpdateSlot(fix.id, selectedSlot.id, up), [fix.id, selectedSlot, onUpdateSlot]);

  const sm  = STATUS_META[fix.status];
  const def = FIXTURE_DEFS.find(d=>d.type===fix.type && (fix.type!=="gondola"||d.gondolaType===fix.gondolaType)) ?? FIXTURE_DEFS[0];
  // Infrastructure holds no contract: the commercial half of the panel hides.
  const rentable = isRentable(fix);

  const inputCls = "w-full border-0 border-b border-dark-line-2 bg-transparent rounded-none px-0 py-1 text-sm text-dark-ink-1 focus:border-accent focus:outline-none placeholder:text-dark-ink-3 transition-colors";
  const labelCls = ETIQUETA_CLS;

  // ── El nombre del mueble ──────────────────────────────────────────────────
  // El editor 3D no tenía cómo renombrar: mostraba el nombre y punto, así que
  // para cambiarlo había que ir al plano 2D. Ahora se puede desde acá y pasa por
  // la MISMA regla —`renombrar`—, que es el punto: que no haya un tercer camino
  // que escriba sin comprobar, como pasó con el campo del panel del 2D.
  const [nombreBorrador, setNombreBorrador] = useState(fix.code);
  const [rechazo, setRechazo] = useState<RechazoDeNombre<PlacedFixture> | null>(null);
  useEffect(() => { setNombreBorrador(fix.code); setRechazo(null); }, [fix.id, fix.code]);
  const choqueEscrito = useMemo(
    () => (normalizarNombre(nombreBorrador) === normalizarNombre(fix.code)
      ? null
      : choqueDeNombre(nombreBorrador, muebles, fix.id)),
    [nombreBorrador, muebles, fix.id, fix.code],
  );
  function guardarNombre() {
    const r = onRenombrar(fix.id, nombreBorrador);
    setRechazo(r);
    if (!r) setNombreBorrador(normalizarNombre(nombreBorrador));
  }

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
            <p className="text-xs font-bold text-dark-ink-1 mt-0.5">Slot — {nombreDeMueble(fix)}</p>
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
            <label className={labelCls}><DollarSign size={9} className="inline mr-1"/>Valor (COP/mes)</label>
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
      style={{ borderLeftWidth: "4px", borderLeftColor: rentable ? STATUS_COLORS[fix.status] : NON_RENTABLE_COLOR }}>

      <div className="flex items-center gap-2 border-b border-dark-line p-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl bg-dark-surface-2 flex-shrink-0">
          {def.emoji}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-bold text-dark-ink-1">{fix.label}</p>
          <p className="font-mono text-[10px] text-dark-ink-3">{nombreDeMueble(fix)}</p>
        </div>
        <button onClick={onClose} className="text-dark-ink-3 hover:text-dark-ink-1"><X size={14}/></button>
      </div>

      <div className="flex items-center gap-2 border-b border-dark-line px-3 py-2">
        {rentable ? (
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold flex items-center gap-1 ${sm.bg} ${sm.text}`}>
            {fix.status === "occupied" && <span className="animate-pulse inline-block w-2 h-2 rounded-full mr-0.5" style={{ background: STATUS_COLORS[fix.status] }}/>}
            {sm.label}
          </span>
        ) : (
          <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: "rgba(100,116,139,0.18)", color: "#94A3B8" }}>
            No comercializable
          </span>
        )}
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

        {/* Nombre — el del mueble, que es su código. Uno solo, y el mismo que
            dibuja el plano 2D, la pantalla de montaje y la lámina. */}
        <div>
          <p className={labelCls}>Nombre</p>
          <input
            className={inputCls}
            value={nombreBorrador}
            style={choqueEscrito ? { color: "var(--danger)", borderBottomColor: "var(--danger)" } : undefined}
            onChange={e => { setNombreBorrador(e.target.value); setRechazo(null); }}
            onBlur={guardarNombre}
            onKeyDown={e => {
              if (e.key === "Enter") { e.preventDefault(); guardarNombre(); }
              if (e.key === "Escape") { setNombreBorrador(fix.code); setRechazo(null); }
            }}
          />
          {rechazo ? (
            <>
              <p className="mt-1 text-[11px] leading-snug text-danger">
                No se guardó: {textoDelChoque(nombreBorrador, rechazo)} Sigue
                llamándose «{fix.code}».
              </p>
              {rechazo.razon === "ocupado" && (
                <>
                  <button
                    onClick={() => { onIntercambiar(fix.id, rechazo.ocupa.id); setRechazo(null); }}
                    className="mt-1.5 rounded border border-danger/50 bg-danger/10 px-2 py-1 text-[11px] font-bold text-danger hover:bg-danger/20"
                  >
                    Intercambiar con ese mueble
                  </button>
                  <p className="mt-1 text-[11px] leading-snug text-dark-ink-3">
                    {textoDelIntercambio(fix, rechazo.ocupa)}
                  </p>
                </>
              )}
            </>
          ) : choqueEscrito ? (
            <p className="mt-1 text-[11px] leading-snug text-danger">
              {textoDelChoque(nombreBorrador, choqueEscrito)}
            </p>
          ) : (
            <p className="mt-1 text-[11px] leading-snug text-dark-ink-3">
              Es el nombre y es la llave: con él se arma{" "}
              {fullSpaceCode(useFixtureStore.getState().sede, fix.code)} y con eso viaja
              al contrato y al correo de montaje.
            </p>
          )}
        </div>

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

        {fix.type === "gondola" && (
          <PlanogramPanel fix={fix} onChange={(planogram) => u({ planogram })} />
        )}

        <div>
          <label className={labelCls}>Destino del mueble</label>
          <div className="flex gap-1.5">
            {([true, false] as const).map((value) => (
              <button
                key={String(value)}
                onClick={() => u({ rentable: value })}
                className={`flex-1 rounded px-1 py-1.5 text-[10.5px] font-semibold transition-colors ${
                  rentable === value
                    ? "bg-accent text-accent-ink"
                    : "border border-dark-line-2 text-dark-ink-3 hover:text-dark-ink-1"
                }`}
              >
                {value ? "Comercializable" : "No comercial."}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[9.5px] leading-relaxed text-dark-ink-3">
            {rentable
              ? "Se puede alquilar y cuenta en la disponibilidad de la sede."
              : "Mobiliario propio del local: no admite contrato y queda fuera de la ocupación."}
          </p>
        </div>

        {rentable && (
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
        )}

        {rentable && (<>

        {/* Lo contratado, de sólo lectura. El editor 3D es de diseño: las artes,
            las dimensiones, dónde va cada mueble. El contrato se hace en
            Sede → Vender, que es donde está el mapa con la disponibilidad del
            periodo. Antes se podía llenar acá, en el plano 2D y en Sede: tres
            lugares para lo mismo, y los de acá creaban un contrato nuevo cada
            vez que se tocaba el botón en vez de editar el que había. */}
        <div className="rounded-lg border border-dark-line/50 bg-dark-bg/60 p-3">
          <p className={labelCls}><Building2 size={9} className="inline mr-1"/>Contratado</p>
          {fix.supplierName ? (
            <>
              <p className="text-sm font-semibold text-dark-ink-1">{fix.supplierName}</p>
              {fix.brandCategory && (
                <p className="text-xs text-dark-ink-2 mt-0.5">{fix.brandCategory}</p>
              )}
              {fix.startDate && fix.endDate && (
                <>
                  <p className="mt-1.5 font-mono text-[11px] text-dark-ink-2">
                    {fix.startDate} → {fix.endDate}
                  </p>
                  {days > 0 && (
                    <>
                      <div className="mt-1.5 h-1.5 rounded-full bg-dark-surface-2">
                        <div className={`rounded-full h-full transition-all ${progressColor}`} style={{ width: `${progressPct}%` }} />
                      </div>
                      <p className={`mt-1 text-[10px] ${daysLeftColor}`}>{daysLeft} días restantes</p>
                    </>
                  )}
                </>
              )}
              {isAdmin && fix.negotiatedValue > 0 && (
                <p className="mt-2 font-mono text-sm font-bold text-success">
                  ${fix.negotiatedValue.toLocaleString()} / mes
                </p>
              )}
            </>
          ) : (
            <p className="text-xs text-dark-ink-3">Sin contrato activo.</p>
          )}
          {isAdmin && (
            <p className="mt-2 text-[10px] leading-relaxed text-dark-ink-3">
              Los contratos se hacen en <b className="text-dark-ink-2">Sede → Vender</b>, sobre el mapa.
            </p>
          )}
        </div>

        <VistaProveedor
          fix={fix}
          enCaminata={enCaminata}
          catalogo={catalogo}
          cargandoCatalogo={cargandoCatalogo}
          prueba={prueba}
          onProbar={onProbar}
          onRecargarCatalogo={onRecargarCatalogo}
        />

        <div>
          <label className={labelCls}>Observaciones</label>
          <textarea rows={2} value={fix.observation} placeholder="Notas…"
            onChange={e=>u({observation:e.target.value})} className={`${inputCls} resize-none`} />
        </div>
        </>)}

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
  // Antes y después: apagar las artes muestra el espacio como está hoy, que es
  // contra lo que el proveedor compara su marca puesta.
  const [sinArte, setSinArte] = useState(false);

  // ── El producto que se está probando ──────────────────────────────────────
  // Vive en la sesión y NO en el layout, a propósito. El layout es lo que está
  // montado de verdad: si probar un producto lo escribiera ahí, la góndola que
  // Nutresa tiene alquilada aparecería con producto de Alpina en la pantalla de
  // todos, y el 3D dejaría de servir para saber qué hay puesto en la tienda.
  // Acá se prueban tres ubicaciones en una reunión y al cerrar no queda nada.
  const [prueba, setPrueba] = useState<Map<string, number>>(new Map());
  const [catalogo, setCatalogo] = useState<Arte[]>([]);
  const [cargandoCatalogo, setCargandoCatalogo] = useState(true);

  const recargarCatalogo = useCallback(() => {
    setCargandoCatalogo(true);
    listarCatalogo()
      .then(setCatalogo)
      .catch(() => setCatalogo([]))
      .finally(() => setCargandoCatalogo(false));
  }, []);
  useEffect(recargarCatalogo, [recargarCatalogo]);

  const probarProducto = useCallback(
    (fixtureId: string, cara: "A" | "B", arteId: number | null) => {
      setPrueba(prev => {
        const siguiente = new Map(prev);
        // Mapa nuevo y no mutación: el memo de materiales compara por
        // identidad, y mutar el mismo Map no repinta nada.
        if (arteId == null) siguiente.delete(`${fixtureId}|${cara}`);
        else siguiente.set(`${fixtureId}|${cara}`, arteId);
        return siguiente;
      });
    },
    [],
  );

  // MEJORA 8: First-person mode
  const [firstPerson, setFirstPerson] = useState(false);
  // Dónde está y hacia dónde mira quien camina — lo dibuja el minimapa.
  const [camaraFP, setCamaraFP] = useState<CamaraEnPlanta | null>(null);
  // Pedido de teletransporte. El contador hace que tocar dos veces el mismo
  // punto del plano vuelva a saltar, en vez de quedarse quieto.
  const [saltarA, setSaltarA] = useState<{ x: number; z: number; n: number } | null>(null);
  // Con el mouse capturado no hay puntero que pueda tocar el plano: el
  // navegador lo esconde y manda todo al lienzo. El minimapa sigue orientando,
  // pero el salto sólo se ofrece cuando el mouse está suelto.
  const [mouseSuelto, setMouseSuelto] = useState(true);
  // Al salir de la caminata se olvida el último salto pedido. Si no, cambiar de
  // sede remonta la escena y al volver a entrar uno aparecía en el punto que
  // había tocado en el plano de la sede anterior.
  useEffect(() => { if (!firstPerson) setSaltarA(null); }, [firstPerson]);

  // Al pedir «Ver la exhibición en 3D» se selecciona el mueble —así el panel
  // de la derecha ya habla de ese espacio— y se sale de la caminata, que tiene
  // su propia cámara. El encuadre lo aplica la escena.
  const enfoquePedido = useFixtureStore((s) => s.enfoque3D);
  useEffect(() => {
    if (!enfoquePedido) return;
    setFirstPerson(false);
    setSelectedId(enfoquePedido.fixtureId);
    setSelectedSlotId(null);
  }, [enfoquePedido]);
  useEffect(() => {
    const alCambiar = () => setMouseSuelto(document.pointerLockElement === null);
    document.addEventListener("pointerlockchange", alCambiar);
    alCambiar();
    return () => document.removeEventListener("pointerlockchange", alCambiar);
  }, []);

  // MEJORA 9: Hover tooltip
  const [hoveredFixtureId, setHoveredFixtureId] = useState<string|null>(null);
  const [tooltipPos, setTooltipPos]             = useState<{x:number;y:number}>({x:0,y:0});

  // MEJORA 5: Screenshot
  const screenshotFnRef = useRef<(() => string) | null>(null);
  const setScreenshotFn  = useCallback((fn: () => string) => { screenshotFnRef.current = fn; }, []);

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
  // The exact array we last wrote to the store, so the mirror effect below can
  // recognise its own echo by identity.
  const lastCommittedRef = useRef<UnifiedFixture[] | null>(null);
  // Set right after adopting server state, so re-serialising it does not bounce
  // straight back to the server (two open 3D editors would ping-pong forever).
  const suppressCommitRef = useRef(false);
  // Merely opening this editor must not dirty the layout.
  const isFirstRender3D = useRef(true);

  const prevSede3DRef = useRef(sede);
  useEffect(() => {
    if (isFirstRender3D.current) { isFirstRender3D.current = false; return; }
    if (suppressCommitRef.current) { suppressCommitRef.current = false; return; }
    const existingStore = selectFixtures(useFixtureStore.getState());
    const converted = fixturesToStore(placedFixtures, sede, existingStore);
    lastCommittedRef.current = converted;
    if (draggingId.current) {
      // During drag: update display without creating an undo entry or triggering server sync
      pushToStore(converted);
    } else {
      // Drag ended or fixtures changed outside drag: commit properly (undoable, server sync)
      commit(converted);
    }
  }, [placedFixtures, sede, pushToStore, commit]);

  // ── Sync unified store → fixtures (server pulls, undo/redo) ─────────────────
  // Without this the 3D canvas kept rendering whatever it loaded on mount, so a
  // layout saved on another workstation never appeared here.
  useEffect(() => {
    if (lastCommittedRef.current === fixtures) return; // our own echo
    if (draggingId.current) return;                    // never yank geometry mid-drag
    suppressCommitRef.current = true;
    setPlacedFixtures(storeToFixtures(fixtures));
  }, [fixtures]);

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
      // Con el giro del fantasma: se puede rotar ANTES de soltar, y sin esto la
      // vista previa se pintaba en verde mientras el mueble ya pisaba a otro.
      const collides = hasAABBCollision(
        {x, z}, { ...placingDef, rotY: ghostRotY }, placedFixtures,
      );
      setGhostCollides(collides);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placingDef, placedFixtures, ghostRotY]);

  function onFloorClick(x:number, z:number){
    if(placingDef){
      // El fantasma se pintaba rojo al pisar a otro mueble y el clic lo soltaba
      // igual: el aviso era decorativo. El plano 2D siempre lo bloqueó; acá no.
      // Un mueble encima de otro rompe el plano para todo lo que viene después
      // —la caminata, el encuadre del proveedor, el metraje que se cobra.
      if (hasAABBCollision({x, z}, { ...placingDef, rotY: ghostRotY }, placedFixtures)) {
        setWarning("⚠️ Ahí se monta sobre otro mueble — movelo o giralo (R)");
        return;
      }
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
        // Columns, checkouts and free zones are part of the store, not stock to
        // sell. Everything else stays rentable (flag left absent).
        ...(NON_RENTABLE_BY_DEFAULT.has(placingDef.type) ? { rentable: false } : {}),
      };
      newFix.slots = defaultSlots({ type:newFix.type, w:newFix.w, h:newFix.h, code:newCode });
      if (newFix.type === "gondola") {
        newFix.planogram = createGondolaPlanogram({
          fixtureId: newFix.id, width: newFix.w, depth: newFix.d, height: newFix.h,
          doubleSided: newFix.gondolaType !== "wall",
        });
      }
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

  // ── Renombrar, por el mismo camino que el plano 2D ──────────────────────────
  // La regla vive en `utils/nomenclatura.ts` y comprueba y escribe en la misma
  // llamada: acá no se decide nada, sólo se guarda el resultado por `u` para que
  // el renombre entre en el historial de deshacer como cualquier otro cambio.
  const renombrarFixture = useCallback((id:string, nombre:string) => {
    const r = renombrar(placedFixtures, id, nombre);
    if (!r.ok) return r.rechazo;
    u(() => r.muebles);
    return null;
  }, [placedFixtures, u]);

  /** Los dos nombres a la vez: en ningún momento intermedio hay dos iguales. */
  const intercambiarFixtures = useCallback((esteId:string, otroId:string) => {
    u(prev => intercambiarNombres(prev, esteId, otroId));
  }, [u]);

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
  const isAdmin      = useAuthStore(selectIsAdmin);

  /**
   * Baja la lámina para el proveedor.
   *
   * Con un mueble seleccionado saca DOS tomas desde la misma cámara —sin arte
   * y con arte— porque la comparación es lo que cierra la negociación. Sin
   * selección se queda con la vista de pantalla, que sigue sirviendo para
   * mostrar la sede entera.
   */
  const [exportando, setExportando] = useState(false);
  const exportarPropuesta = useCallback(async () => {
    const capturar = screenshotFnRef.current;
    if (!capturar || exportando) return;
    setExportando(true);
    const arteOriginal = sinArte;
    try {
      const fix = selectedFix;
      const uf  = fix ? fixtures.find(f => f.id === fix.id) : null;

      // Sin mueble elegido: una sola toma de lo que se ve.
      if (!fix || !uf) {
        const blob = await componerPropuesta(
          [{ titulo: "Vista general", dataUrl: capturar() }],
          { sede, espacio: sede, mueble: "", proveedor: "", categoria: "",
            desde: "", hasta: "", valorMensual: null },
        );
        descargar(blob, `${sede}_vista.png`);
        return;
      }

      // Con mueble elegido: el par. Entre toma y toma hay que dejar que React
      // rearme los materiales y que el lienzo vuelva a dibujar.
      const esperarCuadro = () =>
        new Promise<void>(ok => requestAnimationFrame(() => requestAnimationFrame(() => ok())));

      setSinArte(true);
      await esperarCuadro();
      const antes = capturar();

      setSinArte(false);
      await esperarCuadro();
      const despues = capturar();

      // Qué producto se está probando en este mueble. Cualquiera de las dos
      // caras sirve: la lámina muestra la que quedó encuadrada.
      const arte = (["A", "B"] as const)
        .map(c => prueba.get(`${fix.id}|${c}`))
        .filter((id): id is number => id != null)
        .map(id => catalogo.find(a => a.id === id))
        .find(Boolean);

      // Cuando se está PROPONIENDO un producto, el pie habla de esa propuesta y
      // no del contrato que hoy ocupa el espacio. Sin esto la lámina salía con
      // la foto del yogur de Alpina y, debajo, «Proveedor: Nutresa» con las
      // fechas del contrato de Nutresa: el error más caro posible en el único
      // papel que el proveedor se lleva.
      //
      // El período y el valor se omiten a propósito: de lo que se está
      // proponiendo todavía no hay nada acordado, y poner las fechas del
      // contrato de al lado sería inventarlas. Se negocian en la reunión.
      const mismoProveedor =
        !!arte && (uf.supplierName ?? "").trim().toLowerCase() === arte.proveedor.trim().toLowerCase();
      const proponiendo = !!arte && !mismoProveedor;

      const datos = {
        sede,
        espacio: fullSpaceCode(uf.sede || sede, uf.code),
        mueble: uf.label || uf.code,
        proveedor: arte ? arte.proveedor : (uf.supplierName ?? ""),
        producto: arte?.nombre,
        categoria: proponiendo ? (arte?.categoria ?? "") : (uf.brandCategory ?? ""),
        desde: proponiendo ? "" : (uf.startDate ?? ""),
        hasta: proponiendo ? "" : (uf.endDate ?? ""),
        // La plata se tacha para el trabajador, igual que en todas las demás
        // pantallas. Una lámina es un archivo que se reenvía.
        valorMensual: proponiendo ? null : (isAdmin ? (uf.negotiatedValue || null) : null),
      };
      // Sin arte cargada las dos tomas salen idénticas: mostrar el mismo
      // dibujo dos veces con los rótulos «Hoy» y «Con la marca» es mentirle
      // al que recibe la lámina. Ahí va una sola imagen.
      const hayComparacion = antes !== despues;
      const tomas = hayComparacion
        ? [
            { titulo: "Hoy", dataUrl: antes },
            { titulo: arte ? `Con ${arte.proveedor}` : "Con la marca", dataUrl: despues },
          ]
        : [{ titulo: "El espacio hoy", dataUrl: despues }];
      const blob = await componerPropuesta(tomas, datos);
      descargar(blob, nombreDeArchivo(datos, hayComparacion));
    } catch {
      // Sin alertas: el botón vuelve a su estado y se puede reintentar.
    } finally {
      setSinArte(arteOriginal);
      setExportando(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exportando, sinArte, selectedFix, fixtures, sede, isAdmin, prueba, catalogo]);
  const selectedSlot = selectedFix?.slots?.find(s=>s.id===selectedSlotId)??null;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    /* `data-cajon-oscuro`: el editor es oscuro en los dos temas (ver el
       bloque del mismo nombre en `tema.css`). Adentro de esta marca la tinta
       se invierte, así que `bg-accent` es una pestaña CLARA sobre el panel
       oscuro y no un rectángulo negro invisible. */
    <div data-cajon-oscuro className="flex flex-1 overflow-hidden rounded-xl border border-dark-line bg-dark-bg" style={{minHeight:0}}>

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
            <span
              className="flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-medium"
              style={{ background: "rgba(100,116,139,0.18)", color: "#94A3B8" }}
            >
              <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: NON_RENTABLE_COLOR }} />
              No comercializable
            </span>
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
            className="flex items-center justify-center gap-1.5 rounded-lg bg-accent hover:bg-accent-600 shadow-lg active:scale-[0.98] transition-all py-2 text-xs font-semibold text-accent-ink">
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
                Colocando <strong className="text-dark-ink-1">{placingDef.label}</strong>
                <span className="text-accent/40">·</span>
                <kbd className="rounded border border-dark-line-2 bg-dark-surface px-1 text-dark-ink-2">clic</kbd> ubicar ·
                <kbd className="rounded border border-dark-line-2 bg-dark-surface px-1 text-dark-ink-2">R</kbd> rotar ·
                <kbd className="rounded border border-dark-line-2 bg-dark-surface px-1 text-dark-ink-2">Esc</kbd> cancelar
              </span>
            ) : (
              <span className="flex items-center gap-2 text-dark-ink-2">
                {placedFixtures.length} mueble{placedFixtures.length!==1?"s":""}
                {selectedFix&&(
                  <span className="flex items-center gap-1 ml-2">
                    <span className="text-dark-ink-3">·</span>
                    <span className="font-mono text-xs bg-dark-surface rounded px-2 py-0.5 text-accent-200">{nombreDeMueble(selectedFix)}</span>
                    {selectedSlot&&<span className="text-warning">› {selectedSlot.id}</span>}
                  </span>
                )}
              </span>
            )}
            <span className="ml-auto hidden text-dark-ink-3 lg:block">drag → orbitar · scroll → zoom</span>

            {/* Vista superior — alinea cámara cenital para mover fixtures fácil */}
            <button onClick={handleTopView}
              title="Vista superior (cenital) — ideal para mover los muebles"
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

            {/* Antes y después: el mismo encuadre con la marca puesta y sin
                ella. Es la comparación que cierra una negociación, y hasta
                ahora había que imaginársela. */}
            <button onClick={() => setSinArte(p => !p)}
              title={sinArte ? "Volver a mostrar las artes del proveedor" : "Ver el espacio sin las artes (el «antes»)"}
              className={`flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] transition-all ${
                sinArte
                  ? 'border-warning/50 bg-warning/15 text-warning'
                  : 'border-dark-line-2 bg-dark-surface text-dark-ink-2 hover:bg-dark-surface-2'
              }`}>
              {sinArte ? <EyeOff size={10}/> : <Eye size={10}/>} {sinArte ? 'Sin arte' : 'Con arte'}
            </button>

            {/* La lámina para el proveedor: la exhibición encuadrada con un
                pie que dice de qué espacio se habla. Con un mueble
                seleccionado sale el par antes/después; sin selección, la
                imagen sola de lo que hay en pantalla. */}
            <button onClick={exportarPropuesta} disabled={exportando}
              title={selectedFix
                ? "Bajar la lámina de este espacio, con el antes y el después"
                : "Bajar la vista actual como imagen"}
              className="flex items-center gap-1 rounded border border-dark-line-2 bg-dark-surface px-2 py-0.5 text-[10px] text-dark-ink-2 hover:bg-dark-surface-2 transition-colors disabled:opacity-50">
              <Camera size={10}/> {exportando ? "Armando…" : selectedFix ? "Propuesta" : "PNG"}
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
              sinArte={sinArte}
              prueba={prueba}
              onCamaraFP={setCamaraFP}
              saltarA={saltarA}
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
              <p className="font-mono font-bold text-accent-200">{nombreDeMueble(fix)}</p>
              <p className="text-dark-ink-1">{fix.label}</p>
              {fix.supplierName && <p className="text-dark-ink-2 mt-0.5">🏢 {fix.supplierName}</p>}
              {fix.negotiatedValue > 0 && <p className="text-success mt-0.5">💵 ${fix.negotiatedValue}/mes</p>}
              <span className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${sm.bg} ${sm.text}`}>
                {sm.label}
              </span>
            </div>
          );
        })()}

        {/* MEJORA 4: Presentation mode overlay pill.
            El HUD flota SOBRE la escena 3D, no sobre una superficie del tema:
            blanco al 60-90% y negro translúcido son lo correcto encima de un
            render, en los dos temas. Es la única familia de colores literales
            de Tailwind que queda fuera de la landing, y queda a propósito. */}
        {presentationMode && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 rounded-full border border-white/10 bg-black/40 px-4 py-2 backdrop-blur-sm">
            <span className="text-xs text-white/60">Modo presentación</span>
            <button onClick={() => setPresentationMode(false)}
              className="rounded-full bg-dark-ink-1/10 px-3 py-1 text-xs text-white hover:bg-dark-ink-1/20 transition-colors">
              Salir
            </button>
          </div>
        )}

        {/* MEJORA 8: First-person overlay instructions */}
        {firstPerson && (
          <div className="absolute inset-0 flex flex-col items-end justify-end p-4 pointer-events-none z-10">
            <div className="rounded-xl border border-white/10 bg-black/50 p-3 backdrop-blur-sm text-xs text-white/70 space-y-1">
              <p className="font-semibold text-white/90 mb-2">Modo Primera Persona</p>
              <p><kbd className="bg-dark-ink-1/10 rounded px-1">Clic</kbd> para capturar el mouse</p>
              <p><kbd className="bg-dark-ink-1/10 rounded px-1">WASD</kbd> para caminar</p>
              <p><kbd className="bg-dark-ink-1/10 rounded px-1">Shift</kbd> para ir más rápido</p>
              <p><kbd className="bg-dark-ink-1/10 rounded px-1">Esc</kbd> para soltar el mouse</p>
              <p><kbd className="bg-dark-ink-1/10 rounded px-1">Esc</kbd> y clic en el plano para saltar ahí</p>
              <button onClick={() => setFirstPerson(false)} className="pointer-events-auto mt-2 w-full rounded bg-dark-ink-1/10 hover:bg-dark-ink-1/20 px-2 py-1 text-center">
                Volver a vista orbital
              </button>
            </div>
          </div>
        )}

        {/* Minimapa: dónde estoy y para dónde miro.
            Es lo que evita perderse en primera persona, y además es el atajo
            para moverse: con el mouse suelto, un clic en el plano teletransporta.
            Caminar 40 m con WASD para ver la otra punta no lo hace nadie. */}
        {firstPerson && fixtures.length > 0 && (
          <div className="absolute bottom-4 left-4 z-10 w-[316px] overflow-hidden rounded-xl border border-white/10 bg-black/50 p-2 backdrop-blur-sm">
            <MiniMapa
              fixtures={fixtures}
              ancho={300}
              altoMax={240}
              camara={camaraFP ?? undefined}
              onIrA={mouseSuelto
                ? (x, z) => setSaltarA(p => ({ x, z, n: (p?.n ?? 0) + 1 }))
                : undefined}
            />
            <p className="mt-1.5 text-center text-[10px] leading-tight text-white/60">
              {mouseSuelto
                ? "Clic en el plano para ir ahí"
                : "Esc suelta el mouse y el plano se vuelve clickeable"}
            </p>
          </div>
        )}
      </div>

      {/* ── Right panel — hidden in presentation mode ── */}
      {selectedFix && !presentationMode && (
        <CommercialPanel
          fix={selectedFix}
          enCaminata={firstPerson}
          catalogo={catalogo}
          cargandoCatalogo={cargandoCatalogo}
          prueba={prueba}
          onProbar={probarProducto}
          onRecargarCatalogo={recargarCatalogo}
          selectedSlot={selectedSlot}
          onUpdate={updateFixture}
          muebles={placedFixtures}
          onRenombrar={renombrarFixture}
          onIntercambiar={intercambiarFixtures}
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
