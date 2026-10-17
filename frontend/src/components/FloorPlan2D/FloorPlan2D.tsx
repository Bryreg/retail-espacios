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
import { ClipboardCheck, Keyboard, ListOrdered } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useFixtureStore, selectFixtures, selectHasPendingWork, normalizeSede, DEFAULT_SEDES } from "../../store/fixtureStore";
import type { UnifiedFixture, FaceData } from "../../types/fixtures";
import { fullSpaceCode, isRentable, isRotated90, NON_RENTABLE_BY_DEFAULT, NUNCA_ALQUILABLE } from "../../types/fixtures";
import {
  siguienteCodigo, nombreDeMueble, nombreAnterior, choqueDeNombre, textoDelChoque,
  renombrar, intercambiarNombres, textoDelIntercambio, rotulosDelPlano, nombresChocados,
  muebleConCodigo, normalizar as normalizarNombre,
} from "../../utils/nomenclatura";
import type { RechazoDeNombre } from "../../utils/nomenclatura";
import { revisarPlano, contratosConNombreAjeno, type ContratoDelPlano } from "../../utils/revision";
import { storeToItems, itemsToStore, type FixType2D, type PlacedItem2D } from "../../utils/convertirPlano";
import { CATALOG, CATALOGO_2D, H_DEFAULTS, modelosDelPlanoConPropias, type ModeloDelPlano } from "../../catalogo/plano2D";
import { modeloPorId, nombreDeModelo, textoDeFuente } from "../../catalogo/catalogo";
import { useFichasPropias } from "../../store/fichasPropias";
// Cómo le dice este supermercado a cada familia: la biblioteca, el panel y la
// búsqueda (`catalogo/nombresPropios.ts`).
import {
  LARGO_DEL_NOMBRE_PROPIO, conNombrePropio, nombrePropio, nombreParaGuardar, type NombresPropios,
} from "../../catalogo/nombresPropios";
import { GeometriaDelMueble } from "../GeometriaDelMueble";
import { PartesDelMueble } from "../PartesDelMueble";
import { textoDeLoQueNuncaSeAlquila, vendePorPartes } from "../../utils/partesDelMueble";
import {
  codigoDeParte, concordancia, dispoDeParticipacion, divisionDe, estadoParaPintar, juntasDePartes, piezasDe,
  porParticipacion, puntosDePartesVendidas, sufijoDeParte, vanoDeParte,
  DONDE_SE_CARGAN, rotuloPorOcupacion, textoDeLoComprometido, type DispoDeParticipacion,
} from "../../utils/partes";
// «Abrir en Distribución» (el Editor 3D en esa cara): el mismo pedido que la
// ficha de Supervisar, sólo tipos y el store de lectura.
import { useAbrirEnDistribucion } from "../Distribucion/ParticipacionesDeLaCara";
// La ocupación ANÓNIMA de las caras por participación (store de LECTURA): el
// color de esas caras sale de ahí (§10.8), no de un contrato `…-PC3`.
import { claveDeSede, useOcupacionStore } from "../../store/ocupacionStore";
import { cotasDeCheckout, mesaDeImpulso, montantesDeImpulso, nichosDeImpulso } from "../StoreEditor3D/muebles/medidas";
import { TOLERANCIA_CONTACTO } from "../../utils/planta";
import { buscarHuecoGrupo } from "../../utils/acomodar";
import { detectarCorridas, pasilloPorMueble } from "../../utils/pasillos";
import { useAuthStore, selectIsAdmin } from "../../store/authStore";
import { findOrCreateSpace, updateSpaceStatus } from "../../api/spaces";
import { fetchDeleteImpact } from "../../api/layout";
import type { DeleteImpact } from "../../api/layout";
import { avisoDelRenombre, lineasDelImpacto } from "../../utils/impactoDeSede";
import { listSpaceFiles, uploadSpaceFile, deleteSpaceFile, fileUrl } from "../../api/files";
import type { SpaceFileMeta } from "../../api/files";
import client from "../../api/client";

// ─── Constants ────────────────────────────────────────────────────────────────

const PX_PER_M = 40;

// ─── Types ────────────────────────────────────────────────────────────────────

type SpaceStatus = "free" | "occupied" | "reserved" | "maintenance";

// `FixType2D` y `PlacedItem2D` —la forma con que este plano trabaja cada
// mueble— viven en `utils/convertirPlano.ts`, junto con las conversiones desde
// y hacia el store.

// `CATALOG` —los muebles que se pueden colocar en el plano: rótulo, ancho,
// fondo, emoji, prefijo y familia—, y `H_DEFAULTS` y `COLOR_DEFAULTS` —el alto
// y el color con que nace un mueble dibujado acá— viven en `catalogo/plano2D.ts`,
// calculados del catálogo de muebles (`catalogo/muebles.json`): el plano y el
// editor 3D crean el mismo mueble. Las conversiones reciben `CATALOGO_2D`, de
// ahí mismo. Este componente no declara tablas propias: una copia vieja acá
// pisaba las del catálogo sin que fallara nada (`probar-muebles.mjs` lo vigila).

// Status palette, shared with the Dashboard's occupancy map y con el editor 3D.
//
// Ocupado es ROJO: es la convención de cualquier mapa de disponibilidad —verde
// se puede vender, rojo no—. Estuvo un tiempo en violeta para no chocar con el
// rojo de «vencido», pero el mapa de la sede nunca dejó de pintarlo rojo, así
// que el mismo estado tenía dos colores según la pestaña. Vencido se distingue
// por otro lado: la tabla lo dice con todas las letras y el filtro «Vencidos»
// lo aísla.
// Fase 10: acá había una CUARTA copia de la terna, con sus propios hex
// (`#2E9E6B / #D93A3A / #D19A17`), apenas distintos de los del mapa isométrico
// y de los de los chips. El mismo estado con cuatro colores según la pestaña es
// exactamente el bug que este comentario ya contaba a medias («el mismo estado
// tenía dos colores según la pestaña»). Ahora salen del token, que es uno solo,
// está validado contra daltonismo y cambia con el tema.
const STATUS_COLORS: Record<SpaceStatus, string> = {
  free:        "var(--libre)",     // se puede vender
  occupied:    "var(--ocupado)",   // bajo contrato, no se puede vender
  reserved:    "var(--entra)",     // apartado
  maintenance: "var(--resto)",
};

const STATUS_FILL: Record<SpaceStatus, string> = {
  free:        "rgb(var(--libre-rgb) / 0.16)",
  occupied:    "rgb(var(--ocupado-rgb) / 0.16)",
  reserved:    "rgb(var(--entra-rgb) / 0.16)",
  maintenance: "rgb(var(--resto-rgb) / 0.14)",
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
const NON_RENTABLE_STROKE = "var(--resto)";
const NON_RENTABLE_FILL = "rgb(var(--resto-rgb) / 0.10)";
const NON_RENTABLE_BADGE_STYLE: React.CSSProperties = {
  background: "rgb(var(--resto-rgb) / 0.18)",
  color: "var(--ink-3)",
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

/** True when the pre-normalized query matches any searchable field on either face.
 *  Con `nombres`, también por el nombre propio de la familia («mamut»). */
function matchesQuery(item: PlacedItem2D, normalizedQuery: string, nombres: NombresPropios): boolean {
  if (!normalizedQuery) return true;
  const fields = [
    item.code,
    item.label,
    conNombrePropio(item, nombres, ""),
    // El nombre VIEJO. Ya no se dibuja, pero el cartel de la góndola puede
    // seguir diciéndolo: buscar por él tiene que llevar igual al mueble. Y
    // tiene que seguir sirviendo DESPUÉS de renumerar, que es justo cuando la
    // tienda y el plano dejan de decir lo mismo: ahí la `nomenclatura` ya no
    // está —la renumeración la borra— y el recuerdo llega en `nombreAnterior`,
    // que el servidor deriva de su registro de renumeraciones.
    nombreAnterior(item) ?? "",
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
// La definición vive en types/fixtures.ts: el mapa isométrico del Dashboard y
// el mini-plano del montaje necesitan la misma, y tenerla acá adentro fue la
// razón de que el Dashboard dibujara mal los muebles rotados.

/** Quantize rotY to quarter-turn steps (0 = south, 1 = west, 2 = north, 3 = east). */
function rotationSteps(rotY?: number): number {
  return Math.round(((rotY ?? 0) % (2 * Math.PI)) / (Math.PI / 2)) % 4;
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
    removeSede,
    catalogLabels,
    setCatalogLabel,
  } = useFixtureStore();

  // Same array object seeds the state AND the "came from the store" ref below,
  // so the first items→store effect recognises it as an echo and stays quiet.
  const initialItems = useMemo(
    () => storeToItems(selectFixtures(useFixtureStore.getState()), CATALOGO_2D),
    [],
  );
  const [items, setItems]             = useState<PlacedItem2D[]>(initialItems);
  const [selectedIds, setSelectedIds]   = useState<Set<string>>(new Set());
  const [editMode, setEditMode]       = useState(defaultEditMode);
  const [activeTool, setActiveTool]   = useState<"select" | "place" | "draw">("select");
  const [pendingType, setPendingType] = useState<FixType2D | null>(null);
  /** El modelo del catálogo que se está por colocar (de la familia
   *  `pendingType`), o null para el modelo base, que es colocarlo como
   *  siempre. Se suelta junto con el tipo. */
  const [pendingModelo, setPendingModelo] = useState<ModeloDelPlano | null>(null);
  useEffect(() => { if (pendingType === null) setPendingModelo(null); }, [pendingType]);
  /** La biblioteca de modelos: los de RECABRA y, después, las fichas propias
   *  del supermercado que no están retiradas, debajo de su familia. */
  const fichasPropias = useFichasPropias();
  const modelosDelPlano = useMemo(() => modelosDelPlanoConPropias(fichasPropias), [fichasPropias]);
  const [editingCodeId, setEditingCodeId] = useState<string | null>(null);
  const [editingCodeVal, setEditingCodeVal] = useState("");
  /** Por qué no se pudo poner ese nombre, y qué se puede hacer al respecto.
   *
   *  `intercambio` es la otra mitad del rechazo: cuando el nombre lo tiene otro
   *  mueble, casi siempre lo que la persona quiere es que se llamen al revés
   *  —renumerar una corrida es exactamente eso— y sin una acción que escriba
   *  los dos nombres a la vez la regla correcta vuelve imposible el trabajo
   *  normal. Null es que el nombre se pudo poner. */
  const [avisoDeNombre, setAvisoDeNombre] = useState<
    { texto: string; intercambio: { esteId: string; otroId: string; detalle: string } | null } | null
  >(null);
  const [revisionAbierta, setRevisionAbierta] = useState(false);
  const [atajosAbiertos, setAtajosAbiertos] = useState(false);
  /** Renumerar vive en su propia ruta (`/renumerar`) y se entra desde acá, que
   *  es donde vive la higiene del plano: al lado de «Revisar», que lista lo que
   *  está mal, va lo único que además lo arregla. La pantalla es una ruta y no
   *  un panel porque se imprime y se camina la tienda con ella — ver el
   *  encabezado de `pages/Renumerar.tsx`. */
  const navigate = useNavigate();
  /** Mensaje corto de lo que acaba de pasar. El plano no tenía ninguno: un
   *  atajo que no hacía nada no se distinguía de uno que no existía. */
  const [aviso, setAviso] = useState<string | null>(null);
  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 2600);
    return () => clearTimeout(t);
  }, [aviso]);
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
  const [confirmDeleteSede, setConfirmDeleteSede] = useState(false);
  /** El renombre que espera confirmación: renombrar una sede la borra y la
   *  crea de nuevo (cierra contratos, cancela reservas; D21/D22, tarea aparte),
   *  así que se dice ANTES con lo que cuenta el servidor. */
  const [renombreEnEspera, setRenombreEnEspera] = useState<{ de: string; a: string; aviso: string } | null>(null);
  const renombrando = useRef(false);
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
  // Vender por partes: el mueble del store (con su `partes`) por id, y el mapa
  // CRUDO de la base: las juntas entre puertas o tramos y qué parte está
  // vendida (vender una parte no cambia el mueble fusionado).
  const muebleDelStore = useMemo(() => new Map(storeFixtures.map((f) => [f.id, f])), [storeFixtures]);
  const estadoCrudo = useFixtureStore((s) => s.estadoComercial);

  // ── El color de una cara por participación (§10.8) ──────────────────────────
  // Su estado no cambia (un contrato `…-PC3` nunca la pinta ocupada: la fusión
  // busca la cara por código exacto); cambia sólo el color que se pinta, con
  // la ocupación anónima de HOY: sin lugar, el de ocupado; con algo
  // comprometido, el ámbar de «parcial»; sin nada, el suyo. Así cuatro
  // participaciones del 25 % no se ven verdes, «libres».
  const clienteActual = useAuthStore((s) => s.cliente) ?? "";
  const ocupacionDeSede = useOcupacionStore((s) => s.ocupacion[claveDeSede(clienteActual, sede)]);
  const cargarOcupacion = useOcupacionStore((s) => s.cargarOcupacion);
  const hayParticipaciones = useMemo(() => storeFixtures.some((f) => porParticipacion(f)), [storeFixtures]);
  useEffect(() => {
    if (hayParticipaciones) void cargarOcupacion(sede);
  }, [hayParticipaciones, sede, cargarOcupacion]);
  /** Cómo está HOY una cara por participación, o `null` si el mueble no se
   *  vende así o la sede todavía no se leyó. La leen el color (`pintadoDe`) y
   *  la ficha del panel: el estado que se ve y lo comprometido. */
  const dispoDeLaCara = useCallback((itemId: string, cara: "A" | "B"): DispoDeParticipacion | null => {
    const f = muebleDelStore.get(itemId);
    if (!f || !ocupacionDeSede || !porParticipacion(f)) return null;
    const codigo = fullSpaceCode(sede, codigoDeParte(f.code, cara, null));
    const o = Object.prototype.hasOwnProperty.call(ocupacionDeSede.caras, codigo)
      ? ocupacionDeSede.caras[codigo] : { intervalos: [], fisicos: [] };
    const hoy = ocupacionDeSede.hoy;
    return dispoDeParticipacion(f, { ocupacion: o, hoy }, hoy, hoy);
  }, [muebleDelStore, ocupacionDeSede, sede]);
  const pintadoDe = useCallback((itemId: string, cara: "A" | "B", propio: SpaceStatus): SpaceStatus =>
    estadoParaPintar(propio, dispoDeLaCara(itemId, cara)), [dispoDeLaCara]);
  const esPorParticipacion = useCallback((itemId: string): boolean => {
    const f = muebleDelStore.get(itemId);
    return !!f && porParticipacion(f);
  }, [muebleDelStore]);
  useEffect(() => {
    // commit() stores the array by reference, so identity equality means this
    // update is the echo of our own commit and must not rebuild the canvas.
    if (lastCommittedRef.current === storeFixtures) return;
    // External change (undo/redo/server sync) — update canvas to match
    const next = storeToItems(storeFixtures, CATALOGO_2D);
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
      const converted = itemsToStore(items, snapshot, CATALOGO_2D);
      lastCommittedRef.current = converted;
      commit(converted);
    }, 16);
    return () => clearTimeout(timer);
  }, [items, commit]);

  // The sede mirror used to run one way only (local -> store), which was fine
  // while the local select was the only thing that could change it. Deleting a
  // sede broke that: when another workstation removes the one we are viewing,
  // syncFromServer moves the store onto a survivor, and without this the local
  // state stayed on the dead name — the select showed a value with no matching
  // option, and anything placed on the canvas was stamped with a sede that no
  // longer exists (its contracts would be filed under it).
  const storeSede = useFixtureStore((s) => s.sede);
  useEffect(() => {
    setSede((current) => (storeSede !== current ? storeSede : current));
  }, [storeSede]);

  // ...and if the sede vanishes underfoot, the confirmation dialog is about a
  // sede that is already gone.
  useEffect(() => {
    if (!storeSedeList.includes(sede)) setConfirmDeleteSede(false);
  }, [storeSedeList, sede]);

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
    const next = storeToItems(newFixtures, CATALOGO_2D);
    itemsFromStoreRef.current = next;   // suppress the items→store echo
    setItems(next);
  }, [sede, pushSedeToStore]);

  // CHANGE 1: persist camera state to store so view survives tab switches
  useEffect(() => {
    setCamera2D({ panX: panOffset.x, panY: panOffset.y, zoom });
  }, [panOffset.x, panOffset.y, zoom, setCamera2D]); // W2: setCamera2D is a stable Zustand action

  // ── Helper: compute next code for a type ────────────────────────────────────

  // Un solo generador para los dos editores (utils/nomenclatura). Devuelve el
  // primer número LIBRE, no `max + 1`: con `max + 1` bastaba una edición manual
  // para que el siguiente mueble chocara con un código ya escrito a mano.
  const nextCode = useCallback(
    (type: FixType2D, currentItems: PlacedItem2D[]): string =>
      siguienteCodigo(type, currentItems),
    [],
  );

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

  /**
   * ¿Este mueble se monta sobre otro?
   *
   * Pegados sí, encimados no: una corrida se arma poniendo las góndolas al ras
   * y eso tiene que salir siempre, así que hasta TOLERANCIA_CONTACTO se
   * considera contacto y no solape. La misma regla rige en el editor 3D.
   */
  function hasCollision(
    item: { id: string; x: number; y: number; w: number; h: number },
    others: PlacedItem2D[],
    tol = TOLERANCIA_CONTACTO,
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
    (type: FixType2D, x: number, y: number, w?: number, h?: number, modelo?: ModeloDelPlano | null) => {
      const def = CATALOG.find((c) => c.type === type)!;
      // Desde un modelo: el ancho y el fondo de su ficha, y con qué nace en el
      // store (alto, color, id y geometría: `nace`, que `itemsToStore` le
      // estampa al mueble nuevo). El rótulo es el de su tipo, como siempre.
      const ancho = w ?? modelo?.w ?? def.w;
      const fondo = h ?? modelo?.h ?? def.h;
      setItems((prev) => {
        const code = nextCode(type, prev);
        const newItem: PlacedItem2D = {
          id: `${type}-${Date.now()}`,
          type,
          code,
          label: def.label,
          x: snapTo(x - ancho / 2),
          y: snapTo(y - fondo / 2),
          w: ancho,
          h: fondo,
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
          ...(modelo ? { nace: modelo.nace } : {}),
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

  /** Rotar todo lo seleccionado. Antes sólo giraba si había EXACTAMENTE un
   *  mueble elegido: con dos o más, la R no hacía nada y no decía por qué. */
  const rotarSeleccion = useCallback((ids: Set<string>) => {
    if (ids.size === 0) return;
    setItems((prev) =>
      prev.map((i) =>
        ids.has(i.id)
          ? { ...i, w: i.h, h: i.w, rotY: ((i.rotY ?? 0) + Math.PI / 2) % (2 * Math.PI) }
          : i,
      ),
    );
  }, []);

  /**
   * Duplicar. La copia cae al ras al lado, que es para lo que se usa: seguir
   * armando una corrida.
   *
   * Antes se desplazaba 0,5 m en los dos ejes y se descartaba si chocaba. Una
   * Góndola Doble mide 0,90 × 0,90, así que la copia siempre se solapaba con su
   * original y se tiraba **sin decir nada**: fallaba para 11 de los 17 tipos
   * del catálogo y andaba para los seis flacos. De ahí el «a veces funciona».
   */
  const duplicateSelected = useCallback(
    (ids: Set<string>) => {
      if (ids.size === 0) return;
      const sources = items.filter((i) => ids.has(i.id));
      if (sources.length === 0) return;

      const desplazo = buscarHuecoGrupo(sources, items);
      if (!desplazo) {
        setAviso("No hay lugar libre cerca para la copia — hacé espacio y probá de nuevo");
        return;
      }

      const nextItems = [...items];
      const newIds: string[] = [];
      for (const src of sources) {
        const code = nextCode(src.type, nextItems);
        const copy: PlacedItem2D = {
          ...src,
          id: `${src.type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          code,
          x: +(src.x + desplazo.dx).toFixed(4),
          y: +(src.y + desplazo.dy).toFixed(4),
        };
        nextItems.push(copy);
        newIds.push(copy.id);
      }
      // Set both states outside any updater to avoid React violation
      setItems(nextItems);
      setSelectedIds(new Set(newIds));
      setAviso(`${newIds.length} ${newIds.length === 1 ? "mueble duplicado" : "muebles duplicados"}`);
    },
    [items, nextCode]
  );

  /** Copy selected items to clipboard. */
  const copySelected = useCallback(() => {
    const selected = items.filter((i) => selectedIds.has(i.id));
    if (selected.length === 0) { setAviso("Elegí un mueble primero"); return; }
    setClipboard(selected);
    setAviso(`${selected.length} ${selected.length === 1 ? "mueble copiado" : "muebles copiados"}`);
  }, [items, selectedIds]);

  /**
   * Pegar. El grupo se mueve entero por el mismo vector, así que media corrida
   * copiada vuelve como media corrida y no como muebles sueltos.
   *
   * Antes se probaban cinco desplazamientos en diagonal y, si ninguno servía,
   * **se pegaba igual encima de lo que hubiera**.
   */
  const pasteClipboard = useCallback(() => {
    if (clipboard.length === 0) {
      setAviso("No hay nada copiado — Ctrl+C primero");
      return;
    }
    const desplazo = buscarHuecoGrupo(clipboard, items);
    if (!desplazo) {
      setAviso("No hay lugar libre cerca para pegar — hacé espacio y probá de nuevo");
      return;
    }
    const nextItems = [...items];
    const newIds: string[] = [];
    for (const src of clipboard) {
      const code = nextCode(src.type, nextItems);
      const copy: PlacedItem2D = {
        ...src,
        id: `${src.type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        code,
        x: +(src.x + desplazo.dx).toFixed(4),
        y: +(src.y + desplazo.dy).toFixed(4),
      };
      nextItems.push(copy);
      newIds.push(copy.id);
    }
    // Set both states outside any updater to avoid React violation
    setItems(nextItems);
    setSelectedIds(new Set(newIds));
    setAviso(`${newIds.length} ${newIds.length === 1 ? "mueble pegado" : "muebles pegados"}`);
  }, [clipboard, items, nextCode]);

  // ── Keyboard shortcuts ───────────────────────────────────────────────────────

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;

      if (e.key === " ") { setSpaceDown(true); e.preventDefault(); return; }

      // Deshacer y rehacer andan siempre, con o sin modo edición.
      // Aceptan Cmd además de Ctrl: los otros atajos ya lo hacían, y con sólo
      // ctrlKey ⌘Z no hacía nada en Mac mientras ⌘A, ⌘D, ⌘C y ⌘V sí andaban.
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z" && !e.shiftKey) { e.preventDefault(); undo(); return; }
      if (mod && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) {
        e.preventDefault(); redo(); return;
      }

      if (!editMode) return;

      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();   // Backspace no debe navegar hacia atrás
        if (selectedIds.size > 0) {
          const cuantos = selectedIds.size;
          setItems((prev) => prev.filter((i) => !selectedIds.has(i.id)));
          setSelectedIds(new Set());
          setAviso(`${cuantos} ${cuantos === 1 ? "mueble eliminado" : "muebles eliminados"} · Ctrl+Z para volver atrás`);
        }
      }
      // Rotar: sin modificadores —si no, Ctrl+R (recargar) también rotaba— y
      // sobre TODA la selección, no sólo cuando hay exactamente un mueble.
      if (!mod && !e.altKey && e.key.toLowerCase() === "r" && selectedIds.size > 0) {
        rotarSeleccion(selectedIds);
      }
      if (e.key === "Escape") {
        setSelectedIds(new Set());
        setSelectionRect(null);
        setActiveTool("select");
        setPendingType(null);
        setDrawing(null);
      }
      if (mod && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setSelectedIds(new Set(items.map((i) => i.id)));
      }
      if (mod && e.key.toLowerCase() === "d") { e.preventDefault(); duplicateSelected(selectedIds); }
      if (mod && e.key.toLowerCase() === "c") { e.preventDefault(); copySelected(); }
      if (mod && e.key.toLowerCase() === "v") { e.preventDefault(); pasteClipboard(); }
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
  }, [editMode, selectedIds, items, deleteItem, rotarSeleccion, duplicateSelected, copySelected, pasteClipboard, undo, redo]);

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
      placeItem(pendingType, pt.x, pt.y, undefined, undefined, pendingModelo);
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

  // ── Renombrar la sede ───────────────────────────────────────────────────────
  //
  // El renombre es «borrar + crear» (`renameSede` borra el plano del nombre
  // viejo en el servidor, y el archivo de la sede cierra sus contratos y
  // cancela sus reservas provisionales de participación). Arreglarlo es una
  // tarea aparte (D21/D22); acá se dice antes: con algo comercial en juego, un
  // diálogo con lo que cuenta el servidor (`GET /layout/{sede}/impact`, el
  // mismo de «Borrar sede»). Sin nada en juego, como siempre. Enter y el blur
  // del campo llegan los dos: sólo cuenta el primero.
  async function pedirRenombre(nuevo: string) {
    if (renombrando.current) return;
    renombrando.current = true;
    const viejo = sede;
    if (!nuevo || nuevo === viejo) return;
    let impacto: DeleteImpact | null = null;
    if (isAdmin) {
      try { impacto = await fetchDeleteImpact(viejo); } catch { impacto = null; }
    }
    const aviso = isAdmin ? avisoDelRenombre(viejo, nuevo, impacto) : null;
    if (aviso) { setRenombreEnEspera({ de: viejo, a: nuevo, aviso }); return; }
    renameSede(viejo, nuevo);
    setSede(nuevo);
  }

  // ── Renombrar un mueble ─────────────────────────────────────────────────────
  //
  //  Un mueble tiene UN nombre y es su código. Hubo una época en la que el doble
  //  clic escribía el `code` y el campo «Nomenclatura» del panel escribía otro
  //  campo, sin comprobar nada: dos maneras de nombrar el mismo mueble, cada una
  //  escribiendo algo distinto y sólo una protegida. Por ahí se metió el error
  //  que mandó un contrato al mueble equivocado.
  //
  //  Ahora los tres caminos —doble clic, campo del panel, panel del editor 3D—
  //  pasan por `renombrar` de `utils/nomenclatura.ts`, que comprueba y escribe
  //  en la misma llamada. Acá sólo se decide qué se muestra.

  /** El ÚNICO lugar del plano 2D que escribe un nombre. Lo llaman el doble clic
   *  sobre la caja y el campo del panel lateral, que es lo que faltaba: antes el
   *  panel escribía por su cuenta, sin comprobar nada. Devuelve el rechazo, o
   *  null si se pudo, para que cada uno lo cuente donde le corresponde. */
  function aplicarRenombre(id: string, nombre: string): RechazoDeNombre<PlacedItem2D> | null {
    const r = renombrar(items, id, nombre);
    if (r.ok) { setItems(r.muebles); setAvisoDeNombre(null); return null; }
    return r.rechazo;
  }

  /** El intercambio: los dos nombres se escriben a la vez, nunca uno primero. */
  function aplicarIntercambio(esteId: string, otroId: string) {
    const otro = items.find((i) => i.id === otroId);
    setItems(intercambiarNombres(items, esteId, otroId));
    setAvisoDeNombre(null);
    setEditingCodeId(null);
    setEditingCodeVal("");
    const este = items.find((i) => i.id === esteId);
    if (este && otro) {
      setAviso(`Intercambiados: ${normalizarNombre(otro.code)} ↔ ${normalizarNombre(este.code)}`);
    }
  }

  function handleItemDblClick(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    const item = items.find((i) => i.id === id)!;
    setEditingCodeId(id);
    setAvisoDeNombre(null);
    // Se abre con lo que dice la caja: el que hace doble clic está editando
    // exactamente lo que vio.
    setEditingCodeVal(nombreDeMueble(item));
  }

  function commitCodeEdit() {
    if (!editingCodeId) return;
    const item = items.find((i) => i.id === editingCodeId);
    const val = editingCodeVal.trim();
    const cerrar = () => {
      setEditingCodeId(null);
      setEditingCodeVal("");
      setAvisoDeNombre(null);
    };
    // El mismo nombre que ya tenía: no es un renombre, es cerrar el campo.
    if (item && normalizarNombre(val) === normalizarNombre(item.code)) { cerrar(); return; }
    // Dos muebles con el mismo nombre no se distinguen, y un contrato cargado
    // con ese nombre no elige cuál: se rechaza, se dice quién lo tiene y se
    // deja el campo abierto —con el intercambio a mano— para resolverlo.
    const rechazo = aplicarRenombre(editingCodeId, val);
    if (!rechazo) { cerrar(); return; }
    setAvisoDeNombre({
      texto: textoDelChoque(val, rechazo, (m) => conNombrePropio(m, catalogLabels, "")),
      // El intercambio se ofrece sólo cuando hay con quién: un nombre vacío no
      // se intercambia con nadie.
      intercambio: rechazo.razon === "ocupado" && item
        ? { esteId: item.id, otroId: rechazo.ocupa.id, detalle: textoDelIntercambio(item, rechazo.ocupa) }
        : null,
    });
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

  // En qué pasillo está cada mueble. Se deduce de la geometría en vez de
  // guardarse: mover una góndola cambia su pasillo, y un dato guardado se
  // quedaría viejo sin que nadie se entere.
  const enPlanta = useMemo(
    () => items.map((i) => ({
      id: i.id, type: i.type,
      cx: i.x + i.w / 2, cz: i.y + i.h / 2,
      w: isRotated90(i.rotY ?? 0) ? i.h : i.w,
      d: isRotated90(i.rotY ?? 0) ? i.w : i.h,
      rotY: i.rotY ?? 0,
    })),
    [items],
  );
  const corridas = useMemo(() => detectarCorridas(enPlanta), [enPlanta]);
  const pasilloDe = useMemo(() => pasilloPorMueble(enPlanta, corridas), [enPlanta, corridas]);
  // Qué nombres los lleva más de un mueble. Se arma UNA vez por plano y lo
  // consulta cada caja al dibujarse: de los dos muebles que se llaman igual,
  // el plano dibujaba uno solo y el otro quedaba mudo, así que quien miraba no
  // podía sospechar que había dos. La regla vive en `nomenclatura.ts`.
  const chocados = useMemo(() => nombresChocados(items), [items]);
  const ghostTipo = pendingType ? CATALOG.find((c) => c.type === pendingType) : null;
  const ghostDef = ghostTipo && pendingModelo ? { ...ghostTipo, w: pendingModelo.w, h: pendingModelo.h } : ghostTipo;

  // Search + status filter matching (AND-combined); null set = no filter active
  const normalizedQuery = normalizeText(searchQuery.trim());
  const filterActive = normalizedQuery.length > 0 || statusFilter !== "all";
  const matchedIds = useMemo<Set<string> | null>(() => {
    if (!filterActive) return null;
    const s = new Set<string>();
    for (const it of items) {
      if (matchesQuery(it, normalizedQuery, catalogLabels) && matchesStatusFilter(it, statusFilter)) {
        s.add(it.id);
      }
    }
    return s;
  }, [items, normalizedQuery, statusFilter, filterActive, catalogLabels]);

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
                  const displayLabel = nombrePropio(def.type, catalogLabels) ?? def.label;
                  const isEditingThis = editingCatalogType === def.type;
                  const isActive = pendingType === def.type && activeTool === "place" && !pendingModelo;
                  const modelos = modelosDelPlano[def.type] ?? [];
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
                        onClick={() => { setActiveTool("place"); setPendingType(def.type); setPendingModelo(null); }}
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
                              maxLength={LARGO_DEL_NOMBRE_PROPIO}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => setEditingCatalogVal(e.target.value)}
                              onBlur={() => {
                                // Vacío, o el de RECABRA, deja la familia sin nombre propio.
                                setCatalogLabel(def.type, nombreParaGuardar(def.type, editingCatalogVal));
                                setEditingCatalogType(null);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") { setCatalogLabel(def.type, nombreParaGuardar(def.type, editingCatalogVal)); setEditingCatalogType(null); }
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
                          title="Cómo le dicen en esta tienda (vacío: el nombre de RECABRA). También en Configuración."
                          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--accent)"; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--ink-4)"; }}
                        >
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                      )}
                      {/* Los modelos de la familia: muebles de verdad, con las
                          medidas de su ficha —los de RECABRA y después las
                          fichas propias del supermercado—. Lo de arriba es el
                          modelo base, que se coloca como siempre. «≈»: medidas
                          deducidas. */}
                      {modelos.length > 0 && (
                        <details data-modelos-2d={def.type}
                          open={(pendingType === def.type && !!pendingModelo) || undefined}
                          style={{ padding: "0 12px 6px 44px" }}>
                          <summary style={{ cursor: "pointer", fontSize: 10, color: "var(--ink-3)", userSelect: "none" }}>
                            {modelos.length} {modelos.length === 1 ? "modelo" : "modelos"}
                          </summary>
                          {modelos.map((m) => {
                            const activo = pendingModelo?.id === m.id && activeTool === "place";
                            return (
                              <button key={m.id} data-modelo={m.id}
                                onClick={() => { setActiveTool("place"); setPendingType(def.type); setPendingModelo(m); }}
                                style={{
                                  width: "100%", textAlign: "left", display: "block",
                                  padding: "3px 6px", marginTop: 2,
                                  background: activo ? "var(--accent-50)" : "transparent",
                                  border: "none", borderLeft: activo ? "2px solid var(--accent)" : "2px solid transparent",
                                  cursor: "pointer", fontFamily: "inherit",
                                }}>
                                <span style={{ display: "block", fontSize: 11, color: "var(--ink-1)", lineHeight: 1.2 }}>
                                  {m.estimado ? "≈ " : ""}{m.nombre}
                                </span>
                                <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--ink-4)" }}>
                                  {m.w}×{m.h}×{m.nace.h}m
                                </span>
                                {/* Cómo se vende lo que se coloca desde este
                                    modelo («por puertas»): lo dice su ficha. */}
                                {m.comoSeVende && (
                                  <span data-como-se-vende={m.comoSeVende} style={{ display: "block", fontSize: 9.5, color: "var(--ink-3)" }}>
                                    {m.comoSeVende}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </details>
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
                // Qué se dibuja sobre el mueble: el nombre adentro de la caja
                // cuando entra, y si no, en la pastilla que flota arriba. Nunca
                // los dos. El umbral —46 px de ancho, 12 de alto en pantalla—
                // es de acá porque es lo único que sabe cuánto mide el mueble
                // con el zoom que hay; la REGLA vive en `nomenclatura.ts`, con
                // sus pruebas.
                const rotulos = rotulosDelPlano(
                  item,
                  pw * zoom > 46 && ph * zoom > 12,
                  chocados,
                );

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
                      const aFill = STATUS_FILL[pintadoDe(item.id, "A", item.status)];
                      const bFill = STATUS_FILL[pintadoDe(item.id, "B", item.faceB?.status ?? "free")];
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
                          : STATUS_FILL[pintadoDe(item.id, "A", item.status)]
                      }
                      stroke={
                        isCollidingDrag
                          ? "var(--danger)"
                          : isSelected
                          ? "var(--accent)"
                          : !isRentable(item)
                          ? NON_RENTABLE_STROKE
                          : STATUS_COLORS[pintadoDe(item.id, "A", item.status)]
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

                    {/* Vender por partes: las juntas entre puertas o tramos, a lo
                        ancho del mueble, y un punto en el frente de cada parte
                        vendida (contrato vivo o firmado, del mapa crudo). Sin
                        nombres: el plano lo mira quien lo arma. */}
                    {(() => {
                      const f = muebleDelStore.get(item.id);
                      if (!f || !isRentable(item)) return null;
                      const juntas = juntasDePartes(f);
                      const div = divisionDe(f);
                      if (!div) return null;
                      // Del mueble (x a lo largo, z de fondo, centrado) al
                      // plano: el giro de three.js sobre Y, en pasos de 90°.
                      const th = rotationSteps(item.rotY) * Math.PI / 2;
                      const cx = px + pw / 2;
                      const cy = py + ph / 2;
                      const largo = f.w * PX_PER_M;
                      const fondo = f.d * PX_PER_M;
                      const aPlano = (x: number, z: number) => ({
                        x: cx + x * Math.cos(th) + z * Math.sin(th),
                        y: cy - x * Math.sin(th) + z * Math.cos(th),
                      });
                      const noPtr = { style: { pointerEvents: "none" as const } };
                      // El punto de cada puerta o tramo vendido, con la cuenta de
                      // la cara (`puntosDePartesVendidas`, probada): el TR1 de la
                      // B cae a la izquierda de quien mira la B.
                      const vendidas = puntosDePartesVendidas(f, estadoCrudo, sede);
                      return (
                        <g data-partes-en-planta={item.id}>
                          {juntas.map((t) => {
                            const x = -largo / 2 + t * largo;
                            const a = aPlano(x, -fondo / 2);
                            const b = aPlano(x, fondo / 2);
                            return <line key={`j${t}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                              stroke="rgba(28,27,22,0.45)" strokeWidth={1 / zoom} strokeDasharray={`${3 / zoom},${2 / zoom}`} {...noPtr} />;
                          })}
                          {vendidas.map(({ cara, parte, a, lado }) => {
                            const p = aPlano(a * largo, lado * fondo * 0.3);
                            return <circle key={`v${cara}${parte.n}`} cx={p.x} cy={p.y} r={Math.max(2, 3.2 / zoom)}
                              fill={STATUS_COLORS.occupied} {...noPtr}><title>{sufijoDeParte(parte)} vendid{concordancia(parte.clase).o}</title></circle>;
                          })}
                        </g>
                      );
                    })()}

                    {/* Vender por partes, las piezas de lo que no se vende
                        entero: las bahías de impulso de la caja (las juntas
                        entre nicho y nicho del lado del cliente, con la misma
                        cuenta que el 3D) y el forro de la columna (un anillo).
                        Un punto o el anillo en rojo si está vendida. */}
                    {(() => {
                      const f = muebleDelStore.get(item.id);
                      if (!f) return null;
                      const piezas = piezasDe(f);
                      if (piezas.length === 0) return null;
                      const th = rotationSteps(item.rotY) * Math.PI / 2;
                      const cx = px + pw / 2;
                      const cy = py + ph / 2;
                      const aPlano = (x: number, z: number) => ({
                        x: cx + (x * Math.cos(th) + z * Math.sin(th)) * PX_PER_M,
                        y: cy + (-x * Math.sin(th) + z * Math.cos(th)) * PX_PER_M,
                      });
                      const noPtr = { style: { pointerEvents: "none" as const } };
                      const completo = fullSpaceCode(f.sede || sede, f.code);
                      const vendida = (p: (typeof piezas)[number]) =>
                        estadoCrudo[codigoDeParte(completo, "A", p)]?.status === "occupied";
                      const bahias = piezas.filter((p) => p.clase === "bahias");
                      const forro = piezas.find((p) => p.clase === "forro");
                      const c = bahias.length ? mesaDeImpulso(f.w, cotasDeCheckout(f.w, f.d, f.h)) : null;
                      const zCliente = -f.d / 2 + 0.06;
                      return (
                        <g data-piezas-en-planta={item.id}>
                          {c && montantesDeImpulso(c, bahias.length).map((x) => {
                            const a = aPlano(x, -f.d / 2);
                            const b = aPlano(x, -f.d / 2 + 0.2);
                            return <line key={`m${x}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                              stroke="rgba(28,27,22,0.55)" strokeWidth={1 / zoom} {...noPtr} />;
                          })}
                          {c && bahias.filter(vendida).map((p) => {
                            const nicho = nichosDeImpulso(c, bahias.length)[vanoDeParte("A", p.n ?? 1, bahias.length)];
                            const q = aPlano(nicho.x, zCliente);
                            return <circle key={`b${p.n}`} cx={q.x} cy={q.y} r={Math.max(2, 3.2 / zoom)}
                              fill={STATUS_COLORS.occupied} {...noPtr}><title>{sufijoDeParte(p)} vendida</title></circle>;
                          })}
                          {forro && (
                            <rect x={px - 2 / zoom} y={py - 2 / zoom} width={pw + 4 / zoom} height={ph + 4 / zoom}
                              fill="none" rx={3 / zoom} strokeWidth={1.6 / zoom}
                              stroke={vendida(forro) ? STATUS_COLORS.occupied : "rgba(28,27,22,0.55)"} {...noPtr}>
                              <title>{vendida(forro) ? "Forro vendido" : "Forro: se vende"}</title>
                            </rect>
                          )}
                        </g>
                      );
                    })()}

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
                    {(showLabels || (filterActive && isFilterMatch) || rotulos.choque) &&
                     (rotulos.pastilla || rotulos.choque) && (() => {
                      // La pastilla existe para los muebles CHICOS, donde el
                      // nombre no entra adentro y se dibuja un emoji. Cuando
                      // entra, va adentro y la pastilla no se dibuja: si no, el
                      // mismo mueble queda diciendo su nombre dos veces.
                      // Quién decide qué va dónde: `rotulosDelPlano`.
                      //
                      // La pastilla tiene un segundo trabajo, y es el que cierra
                      // el hallazgo grave de la fase 12: cuando el nombre lo
                      // lleva OTRO mueble de la sede, sale en los dos y sale
                      // marcada —«IMP-08 ×2», en rojo—. Si el nombre ya entra
                      // adentro de la caja no se repite acá: sube sólo la marca,
                      // que no es un nombre sino la cuenta. Y no se apaga con
                      // «Etiquetas»: una etiqueta se puede ocultar, un aviso de
                      // que dos espacios se leen igual, no.
                      const choque = rotulos.choque;
                      const text = [rotulos.pastilla, choque?.marca].filter(Boolean).join(" ");
                      const fs = 10.5 / zoom;
                      const padX = 7 / zoom;
                      const bh = 16 / zoom;
                      const bw = text.length * fs * 0.62 + padX * 2;
                      const leader = 6 / zoom;
                      const cxPx = px + pw / 2;
                      const by = py - leader - bh;
                      const linea = choque ? "var(--danger)" : "var(--line-strong)";
                      return (
                        <g style={{ pointerEvents: "none" }}>
                          {choque && <title>{choque.texto}</title>}
                          <line
                            x1={cxPx} y1={py} x2={cxPx} y2={py - leader}
                            stroke={linea} strokeWidth={1 / zoom}
                          />
                          <rect
                            x={cxPx - bw / 2} y={by} width={bw} height={bh}
                            rx={bh / 2}
                            fill={choque ? "var(--danger-50)" : "var(--surface)"}
                            stroke={linea} strokeWidth={(choque ? 1.5 : 1) / zoom}
                          />
                          <text
                            x={cxPx} y={by + bh / 2}
                            textAnchor="middle" dominantBaseline="central"
                            fontSize={fs} fontWeight={choque ? 700 : 600}
                            fill={choque ? "var(--danger)" : "var(--ink-1)"}
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
                        fill="var(--ink-1)"
                        fontWeight="600"
                        style={{ pointerEvents: "none", userSelect: "none" }}
                      >
                        {item.w.toFixed(2)}m × {item.h.toFixed(2)}m
                      </text>
                    )}

                    {/* Labels — progressive disclosure based on on-screen size.
                        pw/ph are SVG coords; multiply by zoom for screen pixels.
                        Emoji: show only when code isn't visible (avoids double clutter).
                        Code: show only when fixture is at least 46 px wide on screen.
                        El nombre de un mueble que tiene gemelo en la sede se lee
                        en rojo, igual que la marca «×2» de su pastilla: la caja
                        de al lado dice exactamente lo mismo. */}
                    {(() => {
                      const screenW = pw * zoom;
                      const screenH = ph * zoom;
                      const showCode = rotulos.adentro !== null;
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
                                  className={`w-full h-full text-center text-xs rounded-sm outline-none px-1 border ${
                                    avisoDeNombre
                                      ? "border-danger bg-danger-50 text-danger"
                                      : "border-accent bg-surface"
                                  }`}
                                  title={avisoDeNombre?.texto ?? undefined}
                                  value={editingCodeVal}
                                  onChange={(e) => { setEditingCodeVal(e.target.value); setAvisoDeNombre(null); }}
                                  onBlur={commitCodeEdit}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") commitCodeEdit();
                                    if (e.key === "Escape") { setEditingCodeId(null); setAvisoDeNombre(null); }
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
                                fill={rotulos.choque ? "var(--danger)" : "var(--ink-1)"}
                                fontWeight="600"
                                style={{ userSelect: "none", pointerEvents: "none" }}
                              >
                                {rotulos.adentro}
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
                    const stroke = "var(--signal-ink)";  // la guía de alineación: el mismo trazo
                                        // de señal que la selección del plano
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

          {/* Lo que acaba de pasar. Antes no había ninguno: un atajo que no
              hacía nada era indistinguible de uno que no existía. */}
          {aviso && (
            <div style={{
              position: "absolute", bottom: 14, left: "50%", transform: "translateX(-50%)",
              zIndex: 20, pointerEvents: "none",
              padding: "7px 14px", borderRadius: 999,
              background: "var(--ink-1)", color: "var(--surface)",
              fontSize: 12, fontWeight: 600, whiteSpace: "nowrap",
              boxShadow: "0 4px 14px rgba(0,0,0,.18)",
            }}>
              {aviso}
            </div>
          )}

          {/* El nombre que se rechazó, quién lo tiene, y la salida.
              No se va solo: el campo sigue abierto hasta que se corrija, y un
              aviso que se desvanece en dos segundos no alcanza para decidir qué
              escribir.

              El botón es la mitad que faltaba. Renumerar una corrida a mano es
              intercambiar nombres entre muebles que YA existen, así que con la
              regla puesta y sin intercambio no habría forma de hacerlo: todos
              los nombres del medio de la corrida están tomados. Debajo del botón
              va, con todas las letras, qué va a pasar con los DOS muebles —uno
              de ellos no está seleccionado y nadie lo está mirando. */}
          {avisoDeNombre && (
            <div style={{
              position: "absolute", bottom: 14, left: "50%", transform: "translateX(-50%)",
              zIndex: 21, maxWidth: "min(520px, calc(100% - 28px))",
              padding: "9px 14px", borderRadius: "var(--r-lg)",
              background: "var(--danger)", color: "var(--surface)",
              fontSize: 12, fontWeight: 600, lineHeight: 1.45, textAlign: "center",
              boxShadow: "0 4px 14px rgba(0,0,0,.18)",
              pointerEvents: avisoDeNombre.intercambio ? "auto" : "none",
            }}>
              {avisoDeNombre.texto}
              {avisoDeNombre.intercambio && (
                <>
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => aplicarIntercambio(
                      avisoDeNombre.intercambio!.esteId,
                      avisoDeNombre.intercambio!.otroId,
                    )}
                    style={{
                      display: "block", margin: "8px auto 0", padding: "5px 12px",
                      borderRadius: "var(--r-sm)", cursor: "pointer",
                      border: "1px solid var(--surface)", background: "var(--surface)",
                      color: "var(--danger)", fontSize: 12, fontWeight: 700,
                      fontFamily: "inherit",
                    }}
                  >
                    Intercambiar con ese mueble
                  </button>
                  <span style={{ display: "block", marginTop: 5, fontSize: 11, fontWeight: 500, opacity: 0.92 }}>
                    {avisoDeNombre.intercambio.detalle}
                  </span>
                </>
              )}
            </div>
          )}

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
        ) : atajosAbiertos ? (
          <AtajosPanel onClose={() => setAtajosAbiertos(false)} />
        ) : revisionAbierta ? (
          <RevisionPanel
            items={items}
            sede={sede}
            corridas={corridas.length}
            isAdmin={isAdmin}
            onIr={(ids) => { setSelectedIds(new Set(ids)); }}
            onRenumerar={() => navigate("/renumerar")}
            onClose={() => setRevisionAbierta(false)}
          />
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
              items={items}
              sede={sede}
              sedes={storeSedeList}
              editMode={editMode}
              isAdmin={isAdmin}
              initialFace={panelFace}
              pasillo={pasilloDe.get(selectedItem.id)}
              porParticipacion={esPorParticipacion(selectedItem.id)}
              dispoDeCara={(cara) => dispoDeLaCara(selectedItem.id, cara)}
              onUpdate={updateSelected}
              onRenombrar={aplicarRenombre}
              onIntercambiar={aplicarIntercambio}
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
              onBlur={() => { void pedirRenombre(normalizeSede(editingSedeVal)); setEditingSedeInline(false); }}
              onKeyDown={(e) => {
                if (e.key === "Enter") { void pedirRenombre(normalizeSede(editingSedeVal)); setEditingSedeInline(false); }
                if (e.key === "Escape") { renombrando.current = true; setEditingSedeInline(false); }
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
              onClick={() => { renombrando.current = false; setEditingSedeInline(true); setEditingSedeVal(sede); }}
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
          {/* Delete sede — admin only, and never the last one standing */}
          {!editingSedeInline && isAdmin && storeSedeList.length > 1 && (
            <button
              onClick={() => setConfirmDeleteSede(true)}
              style={{
                padding: 2, borderRadius: 4, border: "none",
                background: "transparent", cursor: "pointer", color: "var(--ink-4)",
              }}
              title="Eliminar sede"
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--danger)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--ink-4)"; }}
            >
              <Trash2 size={11} />
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
                const n = normalizeSede(newSedeVal);
                if (n) { addSede(n); setSede(n); }
                setAddingNewSede(false); setNewSedeVal("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") { const n = normalizeSede(newSedeVal); if (n) { addSede(n); setSede(n); } setAddingNewSede(false); setNewSedeVal(""); }
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
          onClick={() => { setAtajosAbiertos((v) => !v); setRevisionAbierta(false); setSelectedIds(new Set()); }}
          title="Ver todos los atajos de teclado"
          style={{
            display: "flex", alignItems: "center", gap: 4,
            padding: "2px 8px", borderRadius: "var(--r-md)",
            border: "1px solid var(--line)", fontSize: 11.5, fontWeight: 500,
            cursor: "pointer", fontFamily: "inherit",
            background: atajosAbiertos ? "var(--accent-50)" : "var(--surface-2)",
            color: atajosAbiertos ? "var(--accent-700)" : "var(--ink-3)",
            transition: "all .12s",
          }}
        >
          <Keyboard size={12} /> Atajos
        </button>

        <button
          onClick={() => { setRevisionAbierta((v) => !v); setAtajosAbiertos(false); setSelectedIds(new Set()); }}
          title="Revisar el plano: códigos repetidos, muebles encimados y pasillos angostos"
          style={{
            display: "flex", alignItems: "center", gap: 4,
            padding: "2px 8px", borderRadius: "var(--r-md)",
            border: "1px solid var(--line)", fontSize: 11.5, fontWeight: 500,
            cursor: "pointer", fontFamily: "inherit",
            background: revisionAbierta ? "var(--accent-50)" : "var(--surface-2)",
            color: revisionAbierta ? "var(--accent-700)" : "var(--ink-3)",
            transition: "all .12s",
          }}
        >
          <ClipboardCheck size={12} /> Revisar
        </button>

        {/* Al lado de «Revisar», que es donde vive la higiene del plano: uno
            lista lo que está mal, el otro lo arregla de raíz. Sólo admin —
            renumerar mueve los contratos y los montajes con su mueble. */}
        {isAdmin && (
          <button
            onClick={() => navigate("/renumerar")}
            title="Renumerar el plano siguiendo el recorrido de la tienda, con el informe antes → después para llevar a la sede"
            style={{
              display: "flex", alignItems: "center", gap: 4,
              padding: "2px 8px", borderRadius: "var(--r-md)",
              border: "1px solid var(--line)", fontSize: 11.5, fontWeight: 500,
              cursor: "pointer", fontFamily: "inherit",
              background: "var(--surface-2)", color: "var(--ink-3)",
              transition: "all .12s",
            }}
          >
            <ListOrdered size={12} /> Renumerar
          </button>
        )}

        <button
          onClick={() => setShowLabels((v) => !v)}
          title={showLabels ? "Ocultar las etiquetas de nombre" : "Mostrar las etiquetas de nombre"}
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
          {editMode ? RESUMEN_ATAJOS : "Clic en fixture para ver detalles"}
        </div>
      </div>

      {renombreEnEspera && (
        <RenombrarSedeDialog
          {...renombreEnEspera}
          onCancel={() => setRenombreEnEspera(null)}
          onConfirm={() => {
            const { de, a } = renombreEnEspera;
            setRenombreEnEspera(null);
            renameSede(de, a);
            setSede(a);
          }}
        />
      )}

      {confirmDeleteSede && (
        <DeleteSedeDialog
          sede={sede}
          // The canonical fixtures, not `items`: PlacedItem2D has no `slots`,
          // and a gondola commercialised shelf by shelf carries every one of
          // its contracts there. Counting the 2D projection reported "0 con
          // proveedor" for a fully booked sede — in the one number whose whole
          // job is informed consent.
          fixtures={useFixtureStore.getState().fixturesBySede[sede] ?? []}
          onCancel={() => setConfirmDeleteSede(false)}
          onConfirm={async () => {
            // Pick the survivor BEFORE the store mutates, and move this
            // component's local `sede` onto it in the same event. Without that
            // the canvas would keep the deleted sede selected while the store
            // had already switched, and the next commit would write these
            // fixtures back into the wrong floor plan.
            const next = storeSedeList.find((s) => s !== sede) ?? DEFAULT_SEDES[0];
            const result = await removeSede(sede);
            // The server refused and nothing was removed. Say so and stay open
            // rather than closing as if it had worked.
            if (!result.ok) return result.error ?? "No se pudo eliminar la sede.";
            setSelectedIds(new Set());
            setConfirmDeleteSede(false);
            setSede(next);
            return null;
          }}
        />
      )}
    </div>
  );
}

// ─── Renombrar sede: el aviso ────────────────────────────────────────────────

/**
 * Renombrar una sede con contratos activos o reservas provisionales los cierra
 * y las cancela (es «borrar + crear»; D21/D22, tarea aparte). Este diálogo lo
 * dice antes, con el texto de `avisoDelRenombre`, y deja seguir o no.
 */
function RenombrarSedeDialog({ de, a, aviso, onCancel, onConfirm }: {
  de: string; a: string; aviso: string; onCancel: () => void; onConfirm: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);
  return (
    <div
      onClick={onCancel}
      style={{
        position: "fixed", inset: 0, zIndex: 200, background: "rgba(26,24,20,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      }}
    >
      <div
        role="dialog" aria-modal="true" aria-label={`Renombrar la sede «${de}»`} data-renombrar-sede
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 440, maxWidth: "100%", background: "var(--surface)", border: "1px solid var(--line)",
          borderRadius: "var(--r-xl)", boxShadow: "var(--shadow-lg)", overflow: "hidden",
        }}
      >
        <div style={{ padding: "16px 18px 12px", borderBottom: "1px solid var(--line-soft)", fontSize: 15, fontWeight: 700, color: "var(--ink-1)" }}>
          Renombrar «{de}» a «{a}»
        </div>
        <p style={{ margin: 0, padding: "14px 18px 4px", fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.6 }}>{aviso}</p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", padding: "14px 18px 16px" }}>
          <button
            onClick={onCancel} autoFocus
            style={{
              height: 32, padding: "0 14px", borderRadius: "var(--r-md)", border: "1px solid var(--line)",
              background: "var(--surface)", color: "var(--ink-2)", fontSize: 12.5, fontWeight: 500, fontFamily: "inherit", cursor: "pointer",
            }}
          >
            Dejar el nombre
          </button>
          <button
            onClick={onConfirm}
            style={{
              height: 32, padding: "0 14px", borderRadius: "var(--r-md)", border: "none", background: "var(--danger)",
              color: "#fff", fontSize: 12.5, fontWeight: 600, fontFamily: "inherit", cursor: "pointer",
            }}
          >
            Renombrar igual
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Delete sede confirmation ────────────────────────────────────────────────

/**
 * Deleting a sede drops its whole floor plan, for everyone, and cannot be
 * undone. It asks for the name to be typed back on purpose: this project has
 * already lost a sede's real data to an accidental wipe, and a one-click bin
 * next to the rename pencil is exactly how that happens again.
 */
function DeleteSedeDialog({
  sede, fixtures, onCancel, onConfirm,
}: {
  sede: string;
  fixtures: UnifiedFixture[];
  /** Resolves to an error message when the deletion failed, or null on success. */
  onConfirm: () => Promise<string | null>;
  onCancel: () => void;
}) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Contracts saved with "Guardar contrato" live in the normalised tables, a
  // different set from the layout snapshot this dialog counts. Deleting the
  // sede closes them, so the number belongs here — and only the server has it.
  const [impact, setImpact] = useState<DeleteImpact | null>(null);

  useEffect(() => {
    let live = true;
    fetchDeleteImpact(sede)
      .then((r) => { if (live) setImpact(r); })
      .catch(() => { /* the counts below still stand on their own */ });
    return () => { live = false; };
  }, [sede]);

  // Contracts hide in three places: the fixture itself (face A), `faceB` on a
  // double gondola, and one per shelf in `slots` when the mueble is
  // commercialised shelf by shelf. Counting only the first two reported zero
  // for a sede whose every shelf was sold.
  const filled = (v?: string) => (v ?? "").trim().length > 0;
  const withContract = fixtures.filter(
    (f) => filled(f.supplierName) || filled(f.faceB?.supplierName),
  ).length;
  const slotsWithContract = fixtures.reduce(
    (n, f) => n + (f.slots ?? []).filter((sl) => filled(sl.supplierName)).length,
    0,
  );
  const armed = typed.trim().toUpperCase() === sede.trim().toUpperCase();

  const confirm = async () => {
    if (!armed || busy) return;
    setBusy(true);
    setError(null);
    const err = await onConfirm();
    // On success the dialog is unmounted by the parent; only a failure returns.
    if (err) { setError(err); setBusy(false); }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, busy]);

  return (
    <div
      onClick={() => { if (!busy) onCancel(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(26,24,20,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 440, maxWidth: "100%", background: "var(--surface)",
          border: "1px solid var(--line)", borderRadius: "var(--r-xl)",
          boxShadow: "var(--shadow-lg)", overflow: "hidden",
        }}
      >
        <div style={{ padding: "16px 18px 12px", borderBottom: "1px solid var(--line-soft)" }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--ink-1)", letterSpacing: "-0.01em" }}>
            Eliminar la sede «{sede}»
          </div>
        </div>

        <div style={{ padding: "14px 18px 4px", fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.6 }}>
          <p style={{ margin: 0 }}>
            Se borra el plano completo de esta sede{" "}
            <strong style={{ color: "var(--ink-1)" }}>en todos los computadores</strong>. No se puede deshacer.
          </p>

          <div
            style={{
              margin: "12px 0", padding: "10px 12px", borderRadius: "var(--r-lg)",
              border: "1px solid var(--danger-100)", background: "var(--danger-50)",
            }}
          >
            <div style={{ fontSize: 12.5, color: "var(--ink-1)", fontWeight: 600 }}>
              {fixtures.length} mueble{fixtures.length !== 1 ? "s" : ""} en el plano
            </div>
            {withContract > 0 && (
              <div style={{ fontSize: 12, color: "var(--danger)", marginTop: 3 }}>
                {withContract} con proveedor asignado
              </div>
            )}
            {slotsWithContract > 0 && (
              <div style={{ fontSize: 12, color: "var(--danger)", marginTop: 3 }}>
                {slotsWithContract} balda{slotsWithContract !== 1 ? "s" : ""} con proveedor asignado
              </div>
            )}
            {/* Lo que cuenta el servidor: los contratos que se cierran y las
                reservas provisionales de participación que se cancelan. */}
            {lineasDelImpacto(impact).map((linea) => (
              <div key={linea} data-impacto style={{ fontSize: 12, color: "var(--danger)", marginTop: 3 }}>
                {linea}
              </div>
            ))}
          </div>

          <p style={{ margin: "0 0 12px" }}>
            {impact !== null && impact.active_leases > 0
              ? "Los contratos se cierran y quedan archivados: siguen en la base de datos con su valor y sus fechas, pero dejan de avisar por vencimiento. "
              : ""}
            {impact !== null && (impact.reservas_vivas ?? 0) > 0
              ? "Las reservas provisionales pasan a canceladas y quedan en el historial de su cara. "
              : ""}
            El tablero pierde los ingresos, la ocupación y los vencimientos de esta sede.
          </p>

          <label style={{ display: "block", fontSize: 11.5, color: "var(--ink-3)", marginBottom: 6 }}>
            Escribí <strong style={{ fontFamily: "var(--font-mono)", color: "var(--ink-1)" }}>{sede}</strong> para confirmar:
          </label>
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void confirm(); }}
            autoFocus
            disabled={busy}
            style={{
              width: "100%", height: 34, padding: "0 10px", boxSizing: "border-box",
              borderRadius: "var(--r-md)", border: `1px solid ${armed ? "var(--danger)" : "var(--line)"}`,
              background: "var(--surface-2)", color: "var(--ink-1)",
              fontSize: 12.5, fontFamily: "var(--font-mono)", outline: "none",
            }}
          />

          {error && (
            <div
              role="alert"
              style={{
                marginTop: 10, padding: "8px 10px", borderRadius: "var(--r-md)",
                border: "1px solid var(--danger-100)", background: "var(--danger-50)",
                fontSize: 12, color: "var(--danger)", lineHeight: 1.5,
              }}
            >
              {error}
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", padding: "14px 18px 16px" }}>
          <button
            onClick={onCancel}
            disabled={busy}
            style={{
              height: 32, padding: "0 14px", borderRadius: "var(--r-md)",
              border: "1px solid var(--line)", background: "var(--surface)",
              color: "var(--ink-2)", fontSize: 12.5, fontWeight: 500,
              fontFamily: "inherit", cursor: "pointer",
            }}
          >
            Cancelar
          </button>
          <button
            onClick={() => void confirm()}
            disabled={!armed || busy}
            style={{
              height: 32, padding: "0 14px", borderRadius: "var(--r-md)", border: "none",
              background: armed && !busy ? "var(--danger)" : "var(--surface-3)",
              color: armed && !busy ? "#fff" : "var(--ink-4)",
              fontSize: 12.5, fontWeight: 600, fontFamily: "inherit",
              cursor: armed && !busy ? "pointer" : "not-allowed",
            }}
          >
            {busy ? "Eliminando…" : "Eliminar sede"}
          </button>
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
  // Un guardado que el servidor rechazó por una regla suya: nombres repetidos,
  // o un espacio con contrato vivo que este guardado sacaría del plano. No es
  // estar sin conexión: hubo respuesta y dice qué está mal. El detalle entero
  // se lee en el panel del estado de sincronización, arriba; acá cabe la
  // palabra y el motivo en el título.
  const rechazos = useFixtureStore((s) => s.rechazos);
  const rechazado = Object.values(rechazos)[0] ?? null;
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
    : rechazado ? "⚠ Rechazado por el servidor"
    : syncState === "pushing" ? "Subiendo…"
    : syncState === "pulling" ? "Actualizando…"
    : syncState === "error" ? "Sin conexión"
    : hasPending ? "↑ Cambios sin subir"
    : "✓ Sincronizado";

  const color =
    conflictCount > 0 ? "var(--warning)"
    : rechazado || syncState === "error" ? "var(--danger)"
    : !hasPending && syncState === "idle" ? "var(--success)"
    : "var(--ink-2)";

  return (
    <button
      onClick={handleSync}
      disabled={busy}
      title={
        rechazado
          ? [rechazado.message, ...rechazado.choques].join(" ")
          : lastSyncedAt
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

/**
 * Qué está mal en el plano, antes de que se use para negociar.
 *
 * De acá salen los espacios que se venden, el metraje que se cobra y el
 * recorrido que se le muestra al proveedor: un código repetido o un mueble
 * encima de otro no se nota hasta que ya viajó a un contrato.
 */
/**
 * Los atajos, escritos en un solo lugar.
 *
 * Hasta ahora la única ayuda era una línea en la barra de estado, con
 * `white-space: nowrap` y `text-overflow: ellipsis`: en una ventana angosta se
 * cortaba, y de entrada no mencionaba deshacer, duplicar, copiar, pegar ni
 * Escape. Esta lista es la fuente única — la barra muestra un resumen sacado de
 * acá, así que no se pueden desfasar.
 */
const ATAJOS: { grupo: string; filas: [string, string][] }[] = [
  {
    grupo: "Moverse por el plano",
    filas: [
      ["Rueda", "Acercar y alejar"],
      ["Espacio + arrastrar", "Desplazar el plano"],
      ["Botón del medio", "Desplazar el plano"],
    ],
  },
  {
    grupo: "Elegir",
    filas: [
      ["Clic", "Elegir un mueble"],
      ["Shift + clic", "Sumar o quitar de la selección"],
      ["Shift + arrastrar", "Elegir por área"],
      ["Ctrl / ⌘ + A", "Elegir todo"],
      ["Esc", "Soltar la selección y la herramienta"],
    ],
  },
  {
    grupo: "Editar",
    filas: [
      ["R", "Rotar 90° lo elegido"],
      ["Doble clic", "Cambiar el código"],
      ["Supr o Retroceso", "Eliminar lo elegido"],
      ["Ctrl / ⌘ + D", "Duplicar al lado"],
      ["Ctrl / ⌘ + C", "Copiar"],
      ["Ctrl / ⌘ + V", "Pegar"],
      ["Arrastrar", "Mover — se pega a los bordes vecinos"],
    ],
  },
  {
    grupo: "Deshacer",
    filas: [
      ["Ctrl / ⌘ + Z", "Deshacer"],
      ["Ctrl / ⌘ + Y", "Rehacer"],
      ["Ctrl / ⌘ + Shift + Z", "Rehacer"],
    ],
  },
];

/** El resumen de la barra de estado, sacado de la misma lista. */
const RESUMEN_ATAJOS = [
  "Rueda: zoom",
  "Espacio+arrastrar: mover",
  "Shift+clic: multi",
  "R: rotar",
  "Ctrl+D: duplicar",
  "Ctrl+Z: deshacer",
].join(" · ");

function AtajosPanel({ onClose }: { onClose: () => void }) {
  return (
    <div style={{
      width: "clamp(240px, 28vw, 340px)", flexShrink: 0,
      overflowX: "hidden", overflowY: "auto", display: "flex", flexDirection: "column",
      background: "var(--dark-bg)", borderLeft: "1px solid var(--dark-line)",
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 8, padding: "11px 13px",
        borderBottom: "1px solid var(--dark-line)",
      }}>
        <p style={{ flex: 1, fontSize: 13, fontWeight: 700, color: "var(--dark-ink-1)" }}>Atajos</p>
        <button onClick={onClose} title="Cerrar"
          style={{ background: "none", border: "none", color: "var(--dark-ink-3)", cursor: "pointer", padding: 2 }}>
          <X size={14} />
        </button>
      </div>
      <div style={{ padding: 13, display: "flex", flexDirection: "column", gap: 14 }}>
        {ATAJOS.map((g) => (
          <div key={g.grupo}>
            <p style={{
              fontSize: 9.5, fontWeight: 700, textTransform: "uppercase",
              letterSpacing: "0.08em", color: "var(--dark-ink-3)", marginBottom: 6,
            }}>{g.grupo}</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {g.filas.map(([tecla, que]) => (
                <div key={tecla} style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <kbd style={{
                    flexShrink: 0, minWidth: 92, padding: "2px 6px", borderRadius: 4,
                    border: "1px solid var(--dark-line-2)", background: "var(--dark-surface)",
                    color: "var(--dark-ink-2)", fontSize: 10.5,
                    fontFamily: "var(--font-mono)", textAlign: "center",
                  }}>{tecla}</kbd>
                  <span style={{ fontSize: 11.5, color: "var(--dark-ink-2)", lineHeight: 1.4 }}>{que}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
        <p style={{ fontSize: 10.5, color: "var(--dark-ink-3)", lineHeight: 1.5 }}>
          Casi todo pide el modo edición. Deshacer y rehacer andan siempre.
        </p>
      </div>
    </div>
  );
}

function RevisionPanel({
  items, sede, corridas, isAdmin, onIr, onRenumerar, onClose,
}: {
  items: PlacedItem2D[];
  sede: string;
  corridas: number;
  isAdmin: boolean;
  onRenumerar: () => void;
  onIr: (ids: string[]) => void;
  onClose: () => void;
}) {
  const hallazgos = useMemo(
    () => revisarPlano(items.map((i) => ({
      id: i.id, code: i.code, type: i.type,
      // El plano 2D guarda esquina + huella ya girada; la revisión trabaja con
      // centro + medidas sin girar, igual que el resto del sistema.
      cx: i.x + i.w / 2, cz: i.y + i.h / 2,
      w: isRotated90(i.rotY ?? 0) ? i.h : i.w,
      d: isRotated90(i.rotY ?? 0) ? i.w : i.h,
      h: H_DEFAULTS[i.type] ?? 1.8,
      rotY: i.rotY ?? 0,
    }))),
    [items],
  );
  const errores = hallazgos.filter((h) => h.severidad === "error").length;

  // La reconciliación: los contratos que YA están cargados sobre un mueble que
  // hoy se llama distinto de como se llamaba cuando se negociaron. Ninguna
  // validación los arregla, y renumerar tampoco —al contrario, los mueve—: se
  // listan para revisarlos uno por uno contra la cartelería de la tienda. Sale
  // de lo que la pantalla ya tiene: los campos comerciales viven denormalizados
  // en el mueble del layout, que es de donde se pinta el mapa.
  const aRevisar = useMemo(() => {
    const contratos: ContratoDelPlano[] = [];
    for (const i of items) {
      const base = {
        id: i.id, code: i.code, sede: i.sede || sede,
        nombreAnterior: nombreAnterior(i),
      };
      if (i.supplierName?.trim()) {
        contratos.push({
          ...base, cara: "A", proveedor: i.supplierName, marca: i.brandCategory,
          desde: i.startDate, hasta: i.endDate, valor: i.negotiatedValue,
        });
      }
      if (i.faceB?.supplierName?.trim()) {
        contratos.push({
          ...base, cara: "B", proveedor: i.faceB.supplierName, marca: i.faceB.brandCategory,
          desde: i.faceB.startDate, hasta: i.faceB.endDate, valor: i.faceB.negotiatedValue,
        });
      }
    }
    return contratosConNombreAjeno(contratos, items);
  }, [items, sede]);

  return (
    <div style={{
      width: "clamp(240px, 28vw, 340px)", flexShrink: 0,
      overflowX: "hidden", overflowY: "auto", display: "flex", flexDirection: "column",
      background: "var(--dark-bg)", borderLeft: "1px solid var(--dark-line)",
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 8, padding: "11px 13px",
        borderBottom: "1px solid var(--dark-line)",
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: "var(--dark-ink-1)" }}>Revisión del plano</p>
          <p style={{ fontSize: 11, color: "var(--dark-ink-3)", marginTop: 2 }}>
            {items.length} muebles · {corridas} pasillo{corridas === 1 ? "" : "s"}
          </p>
        </div>
        <button onClick={onClose} title="Cerrar"
          style={{ background: "none", border: "none", color: "var(--dark-ink-3)", cursor: "pointer", padding: 2 }}>
          <X size={14} />
        </button>
      </div>

      <div style={{ padding: 13, display: "flex", flexDirection: "column", gap: 8 }}>
        {hallazgos.length === 0 ? (
          <p style={{ fontSize: 12.5, color: "var(--success)", lineHeight: 1.5 }}>
            El plano está limpio: sin dos muebles llamados igual, sin muebles
            encimados y con pasillos por donde se puede caminar.
          </p>
        ) : (
          <>
            <p style={{ fontSize: 11.5, color: "var(--dark-ink-3)", lineHeight: 1.5 }}>
              {errores > 0
                ? `${errores} ${errores === 1 ? "cosa rompe" : "cosas rompen"} algo aguas abajo.`
                : "Nada roto; lo de abajo puede ser deliberado."}
            </p>
            {hallazgos.map((h, i) => (
              <button
                key={i}
                onClick={() => h.ids.length && onIr(h.ids)}
                disabled={h.ids.length === 0}
                style={{
                  textAlign: "left", padding: "8px 10px", borderRadius: "var(--r-md)",
                  border: `1px solid ${h.severidad === "error" ? "var(--danger)" : "var(--dark-line-2)"}`,
                  background: h.severidad === "error" ? "var(--danger-50)" : "var(--dark-surface)",
                  color: h.severidad === "error" ? "var(--danger)" : "var(--dark-ink-2)",
                  fontSize: 11.5, lineHeight: 1.45, fontFamily: "inherit",
                  cursor: h.ids.length ? "pointer" : "default",
                }}
              >
                {h.texto}
                {h.ids.length > 0 && (
                  <span style={{ display: "block", marginTop: 3, fontSize: 10, opacity: 0.75 }}>
                    Tocá para ir
                  </span>
                )}
              </button>
            ))}
          </>
        )}

        {/* Lo que ya está cargado, que ninguna validación arregla ─────────── */}
        {aRevisar.length > 0 && (
          <div style={{ marginTop: 6, paddingTop: 11, borderTop: "1px solid var(--dark-line)" }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: "var(--dark-ink-1)" }}>
              Contratos para revisar uno por uno
            </p>
            <p style={{ fontSize: 11, color: "var(--dark-ink-3)", marginTop: 3, lineHeight: 1.5 }}>
              {aRevisar.length} contrato{aRevisar.length === 1 ? "" : "s"} vigente
              {aRevisar.length === 1 ? "" : "s"} sobre muebles que hoy se llaman distinto
              de como se llamaban cuando se negociaron. El papel y el cartel de la
              góndola dicen el nombre viejo; el plano dice el de ahora.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
              {aRevisar.map((c) => (
                <button
                  key={`${c.id}-${c.cara ?? "A"}`}
                  onClick={() => onIr([c.id])}
                  style={{
                    textAlign: "left", padding: "8px 10px", borderRadius: "var(--r-md)",
                    border: `1px solid ${c.loTieneAhora ? "var(--danger)" : "var(--dark-line-2)"}`,
                    background: c.loTieneAhora ? "var(--danger-50)" : "var(--dark-surface)",
                    color: c.loTieneAhora ? "var(--danger)" : "var(--dark-ink-2)",
                    fontSize: 11.5, lineHeight: 1.45, fontFamily: "inherit", cursor: "pointer",
                  }}
                >
                  <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>{c.codigo}</span>
                  <span style={{ opacity: 0.8 }}> · se negoció como </span>
                  <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>«{c.seNegocioComo}»</span>
                  <span style={{ display: "block", marginTop: 3 }}>
                    {c.proveedor}{c.marca ? ` · ${c.marca}` : ""}
                  </span>
                  <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 10.5, opacity: 0.85 }}>
                    {c.desde || "—"} → {c.hasta || "—"}
                  </span>
                  {c.loTieneAhora && (
                    <span style={{ display: "block", marginTop: 3, fontWeight: 600 }}>
                      Cuidado: «{c.seNegocioComo}» hoy es el nombre de OTRO mueble
                      ({c.loTieneAhora}). Quien lea el papel y camine hasta el cartel se
                      va a parar frente al mueble equivocado.
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* La salida de fondo. «Revisar» lista lo que está mal; renumerar es lo
            único que lo arregla de raíz —el sistema reasigna los nombres
            siguiendo el recorrido, y caminar la tienda y leer los números pasan
            a ir en el mismo orden—. Va al pie y no arriba a propósito: primero
            se mira qué hay, después se decide. */}
        {isAdmin && (
          <div style={{ marginTop: 6, paddingTop: 11, borderTop: "1px solid var(--dark-line)" }}>
            <button
              onClick={onRenumerar}
              style={{
                width: "100%", textAlign: "left", padding: "9px 10px",
                borderRadius: "var(--r-md)", border: "1px solid var(--dark-line-2)",
                background: "var(--dark-surface)", color: "var(--dark-ink-2)",
                fontSize: 11.5, lineHeight: 1.45, fontFamily: "inherit", cursor: "pointer",
              }}
            >
              <b style={{ color: "var(--dark-ink-1)" }}>Renumerar el plano →</b>
              <span style={{ display: "block", marginTop: 3 }}>
                El sistema reasigna los nombres siguiendo el recorrido de la tienda, en todas
                las sedes. Primero muestra el antes → después completo, imprimible, y no
                escribe nada hasta que se aprueba.
              </span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

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

// Badges follow STATUS_COLORS: occupied is violet everywhere, so red stays
// reserved for what is actually wrong (an expired contract — see DaysLeftStrip).
// El violeta de «ocupado» se va con el resto de la copia de la paleta: era una
// quinta versión del mismo estado, esta vez para que no chocara con el rojo de
// «vencido». Vencido se distingue por otro lado —la tabla lo dice con todas las
// letras y el filtro lo aísla—, que es lo que el comentario de STATUS_COLORS ya
// decía. Un estado, un color.
const STATUS_BADGE_STYLE: Record<SpaceStatus, React.CSSProperties> = {
  free:        { background: "var(--libre-suave)",   color: "var(--libre-txt)",    border: "1px solid var(--libre-borde)" },
  occupied:    { background: "var(--ocupado-suave)", color: "var(--ocupado-txt)",  border: "1px solid var(--ocupado-borde)" },
  reserved:    { background: "var(--entra-suave)",   color: "var(--entra-txt)",    border: "1px solid var(--entra-borde)" },
  maintenance: { background: "var(--resto-suave)",   color: "var(--muted-status)", border: "1px solid var(--resto-borde)" },
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
// Extensiones que SÍ pueden declararse como cara vigente (fix H8, Fase 3) —
// coincide con las que `files.py` acepta como imagen.
const IMAGE_FILE_EXTS = [".jpg", ".jpeg", ".png", ".webp"];

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
  // Declaración explícita de "esta imagen es la cara vigente" (fix H8, Fase
  // 3) — ya no se infiere de cuándo se sube, hay que marcarla a propósito.
  const [marcarComoCara, setMarcarComoCara] = useState(false);
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
    if (marcarComoCara && !IMAGE_FILE_EXTS.includes(ext)) {
      setError("Sólo una imagen (JPG, PNG o WEBP) puede marcarse como cara del mueble.");
      return;
    }
    setUploading(true);
    setError("");
    try {
      const id = await resolveSpaceId();
      if (id == null) throw new Error("space unresolved");
      await uploadSpaceFile(id, file, marcarComoCara ? "cara" : undefined);
      setFiles(await listSpaceFiles(id));
    } catch {
      setError("Error al subir el archivo");
    } finally {
      setUploading(false);
      setMarcarComoCara(false);
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
              <label
                title="Sólo aplica si el próximo archivo que subís es una imagen. Reemplaza la cara designada anterior de este espacio."
                style={{
                  display: "flex", alignItems: "center", gap: 5, marginTop: 2,
                  fontSize: 10.5, color: "var(--dark-ink-3)", cursor: "pointer", userSelect: "none",
                }}
              >
                <input
                  type="checkbox"
                  checked={marcarComoCara}
                  onChange={(e) => setMarcarComoCara(e.target.checked)}
                  style={{ margin: 0 }}
                />
                Es la cara del mueble (textura del 3D)
              </label>
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
  item, items, sede, sedes, editMode, isAdmin, initialFace, pasillo, porParticipacion: esPc = false, dispoDeCara,
  onUpdate, onRenombrar, onIntercambiar, onDelete, onDuplicate, onClose,
}: {
  /** En qué pasillo cae, deducido de la geometría. */
  pasillo?: number;
  /** El mueble se vende por participación (`porParticipacion` del mueble del
   *  store: el del plano no trae `partes`). Su cara nunca tiene proveedor: lo
   *  que tiene lo dice la ocupación. */
  porParticipacion?: boolean;
  /** La ocupación anónima de HOY de una cara por participación (o `null`). */
  dispoDeCara?: (cara: "A" | "B") => DispoDeParticipacion | null;
  item: PlacedItem2D;
  /** Todo el plano: sin los demás muebles no se puede decir si el nombre que se
   *  está escribiendo ya es de otro, que es la comprobación que faltaba acá. */
  items: PlacedItem2D[];
  sede: string;
  sedes: string[];
  editMode: boolean;
  isAdmin: boolean;
  initialFace?: "A" | "B";
  onUpdate: (patch: Partial<PlacedItem2D>) => void;
  /** El nombre NO se escribe con `onUpdate`. Va por acá, que es el mismo camino
   *  que el doble clic sobre la caja: comprueba y escribe en la misma llamada.
   *  Devuelve el rechazo, o null si se pudo. */
  onRenombrar: (id: string, nombre: string) => RechazoDeNombre<PlacedItem2D> | null;
  /** Los dos nombres a la vez, que es cómo se renumera una corrida a mano. */
  onIntercambiar: (esteId: string, otroId: string) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onClose: () => void;
}) {
  const catDef = CATALOG.find((c) => c.type === item.type);
  // El nombre del modelo de una ficha propia llega cuando se leen las fichas
  // del supermercado: escucharlas vuelve a dibujar el panel.
  useFichasPropias();
  // El nombre propio de la familia, en el encabezado. Lo que va a la base
  // (`FilesSection`, que crea la fila de `spaces`) sigue con el de RECABRA.
  const nombresPropios = useFixtureStore((s) => s.catalogLabels);
  const modeloDelMueble = modeloPorId(item.nace?.modelo);
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

  // ── El nombre del mueble ──────────────────────────────────────────────────
  // Este campo escribía DIRECTO en el layout, sin ninguna comprobación, mientras
  // el doble clic sobre la caja del plano sí validaba. Dos maneras de poner el
  // mismo nombre y una sola protegida: por acá se metieron los nombres que eran
  // el código de otro mueble. Ahora los dos caminos son el mismo: `onRenombrar`,
  // que llama a `renombrar` de `utils/nomenclatura.ts`.
  //
  // Se escribe en un borrador y se guarda al salir del campo o con Enter, no en
  // cada tecla. Escribiendo el nombre en el propio código, tecla a tecla, el
  // mueble pasaría por «I», «IM», «IMP-1»… y cualquiera de esos podría chocar o
  // quedarse guardado. Rechazar es no escribir, no borrar lo que había.
  const [nombreBorrador, setNombreBorrador] = useState(item.code);
  const [rechazo, setRechazo] = useState<RechazoDeNombre<PlacedItem2D> | null>(null);
  // Sólo al cambiar de mueble: mientras se escribe, el borrador manda.
  useEffect(() => {
    setNombreBorrador(item.code);
    setRechazo(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id, item.code]);

  // Lo que se está tecleando, para teñir el campo antes de intentar guardarlo.
  // No escribe nada: es el mismo `choqueDeNombre` que usa `renombrar`.
  const choqueEscrito = useMemo(
    () => (normalizarNombre(nombreBorrador) === normalizarNombre(item.code)
      ? null
      : choqueDeNombre(nombreBorrador, items, item.id)),
    [nombreBorrador, items, item.id, item.code],
  );
  // Lo que YA está guardado y choca: otro mueble de la sede se llama igual que
  // éste. La regla nueva lo impide de ahora en adelante, pero un plano guardado
  // antes puede tenerlo, y hay que verlo desde los DOS muebles — el que no sabe
  // que tiene un gemelo es justamente el que se vende por error.
  const choqueGuardado = useMemo(
    () => muebleConCodigo(item.code, items, item.id),
    [items, item.code, item.id],
  );
  // El nombre viejo, si lo hay. No se edita ni se dibuja: se muestra para poder
  // reconciliar con la cartelería de la tienda y con lo que dice el papel.
  // Después de renumerar no sale de la `nomenclatura` —la renumeración la
  // borra— sino de `nombreAnterior`, que el servidor deriva de su registro de
  // renumeraciones y agrega al plano al leerlo.
  const viejo = nombreAnterior(item);

  const [guardandoEstado, setGuardandoEstado] = useState(false);
  const [estadoError, setEstadoError] = useState("");

  function guardarNombre() {
    const r = onRenombrar(item.id, nombreBorrador);
    setRechazo(r);
    if (!r) setNombreBorrador(normalizarNombre(nombreBorrador));
  }

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

  // ── Una cara POR PARTICIPACIÓN ────────────────────────────────────────────
  // Su `status` sigue «libre» en la base (un contrato `…-PC3` no la pinta, D6),
  // y la ficha decía «Disponible» en verde y «Sin contrato activo… Sede →
  // Vender» sobre un robatope tomado al 100 % (la revisión final, 2026-10-17).
  // Lo que se ve sale de su ocupación anónima de HOY, la misma regla que su
  // color en el plano (`estadoParaPintar`): la pastilla y «Estado del espacio»
  // dicen «Tomada» o «Parcial» en ese color, y «Contratado» dice cuánto está
  // comprometido y cuánto queda (`textoDeLoComprometido`).
  const dispoPc = esPc ? (dispoDeCara?.(activeFace) ?? null) : null;
  const estadoVisto: SpaceStatus = estadoParaPintar(face.status, dispoPc);
  const rotuloVisto = rotuloPorOcupacion(face.status, dispoPc) ?? STATUS_LABELS[face.status];
  const abrirEnDistribucion = useAbrirEnDistribucion();

  function updateFace(patch: Partial<FaceData>) {
    if (activeFace === "B") {
      onUpdate({ faceB: { ...(item.faceB ?? EMPTY_FACE), ...patch } });
    } else {
      onUpdate(patch as Partial<PlacedItem2D>);
    }
  }

  /**
   * Retirar el espacio de circulación, o devolverlo.
   *
   * Va a la BASE —`PATCH /spaces/{id}/status`— y no al plano. Acá se escribía
   * `status` en el JSON del layout: era una segunda copia del mismo hecho, sin
   * nada que la obligara a coincidir con `spaces`, y desde el corte el servidor
   * la descarta al guardar, así que el select se veía cambiar y no cambiaba
   * nada. Un control que miente es peor que no tenerlo.
   *
   * «Ocupado» no está entre las opciones y es a propósito: un espacio se ocupa
   * vendiéndolo. Ponerlo a mano crearía un ocupado sin contrato, sin proveedor
   * y sin fechas — el fantasma exacto que todo esto vino a eliminar.
   */
  async function cambiarEstado(nuevo: SpaceStatus) {
    setEstadoError("");
    setGuardandoEstado(true);
    try {
      const espacio = await findOrCreateSpace({
        code: activeCode, name: item.code, sede: item.sede || sede,
      });
      await updateSpaceStatus(espacio.id, nuevo);
      // El mapa se pinta de la base: se vuelve a leer y aparece solo.
      await useFixtureStore.getState().refrescarComercial();
    } catch {
      setEstadoError("No se pudo guardar el estado. Probá de nuevo.");
    } finally {
      setGuardandoEstado(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", color: "var(--dark-ink-1)", minHeight: "100%" }}>

      {/* Header */}
      <div style={{ padding: "16px 16px 12px", borderBottom: "1px solid var(--dark-line)", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <p style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--dark-ink-3)", marginBottom: 2 }}>{activeCode}</p>
          <p style={{ fontSize: 14, fontWeight: 600, color: "var(--dark-ink-1)" }}>
            {catDef?.emoji} {conNombrePropio(item, nombresPropios, catDef?.label ?? "")}
          </p>
          {/* La ficha de la que nació, si nació de una: su nombre y, si sus
              medidas son una deducción, «≈». */}
          {modeloDelMueble && (
            <p data-modelo={modeloDelMueble.id}
              title={textoDeFuente(modeloDelMueble)}
              style={{ fontSize: 11, color: "var(--dark-ink-2)", marginTop: 2 }}>
              {nombreDeModelo(modeloDelMueble)}
            </p>
          )}
          {/* Nadie dice «PUN-07» en una reunión: dice «la punta del pasillo 4».
              Sale de la geometría, así que mover el mueble lo actualiza solo. */}
          {pasillo !== undefined && (
            <p style={{
              display: "inline-block", marginTop: 6, padding: "2px 8px", borderRadius: 999,
              background: "var(--accent-50)", color: "var(--accent-700)",
              fontSize: 11, fontWeight: 700,
            }}>
              Pasillo {pasillo}
            </p>
          )}
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
          ...(rentable ? STATUS_BADGE_STYLE[estadoVisto] : NON_RENTABLE_BADGE_STYLE),
          display: "inline-flex", alignItems: "center", borderRadius: 999,
          padding: "2px 10px", fontSize: 11, fontWeight: 600,
        }}>
          {rentable ? rotuloVisto : NON_RENTABLE_LABEL}
        </span>
      </div>

      {/* Destino del mueble — decides whether it can ever hold a contract.
          Salvo cuando el TIPO ya lo decide: una columna, una caja registradora
          y el mostrador de servicio al cliente son operación de la tienda y no
          se venden nunca. Ahí el par de botones sería un control muerto —se
          pintaría el elegido y `isRentable` lo seguiría negando—, así que en
          su lugar va la razón escrita. */}
      <Field label="Destino del mueble" icon="🎯">
        {NUNCA_ALQUILABLE.has(item.type) ? (
          <p style={{ fontSize: 14, color: "var(--dark-ink-1)" }}>No comercializable</p>
        ) : editMode && isAdmin ? (
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
          {NUNCA_ALQUILABLE.has(item.type)
            ? textoDeLoQueNuncaSeAlquila(item.type)
            : rentable
            ? "Se puede alquilar y cuenta en la disponibilidad de la sede."
            : "Mobiliario propio del local: no admite contrato y queda fuera de la ocupación."}
        </p>
      </Field>

      {/* Estado */}
      {rentable && (
      <Field label="Estado del espacio" icon="◉">
        {editMode && face.status !== "occupied" ? (
          <>
            <select className={sel} value={face.status} disabled={guardandoEstado}
              onChange={(e) => void cambiarEstado(e.target.value as SpaceStatus)}>
              <option value="free">Disponible</option>
              <option value="reserved">Reservado</option>
              <option value="maintenance">Mantenimiento</option>
            </select>
            {estadoError && (
              <p style={{ fontSize: 11, color: "var(--danger, #b91c1c)", marginTop: 4 }}>
                {estadoError}
              </p>
            )}
            {/* El estado de arriba es el de la base; el que se VE de una cara
                por participación lo pone su ocupación. Se dice, para que el
                «Disponible» del selector no se lea como «se puede vender». */}
            {estadoVisto !== face.status && (
              <p data-estado-por-ocupacion style={{ fontSize: 11, color: "var(--dark-ink-3)", marginTop: 4, lineHeight: 1.45 }}>
                Hoy se ve «{rotuloVisto}»: lo dice la ocupación de sus participaciones.
              </p>
            )}
          </>
        ) : (
          <p style={{ fontSize: 14, color: "var(--dark-ink-1)" }}>
            {rotuloVisto}
            {face.status === "occupied" && (
              <span style={{ fontSize: 11, color: "var(--dark-ink-3)", display: "block", marginTop: 2 }}>
                Lo pone el contrato. Para liberarlo hay que cancelarlo.
              </span>
            )}
            {estadoVisto !== face.status && (
              <span data-estado-por-ocupacion style={{ fontSize: 11, color: "var(--dark-ink-3)", display: "block", marginTop: 2 }}>
                Lo dice la ocupación de hoy de sus participaciones.
              </span>
            )}
          </p>
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

      {/* Nombre — el del mueble, que es su código. Uno solo.
          Este campo decía «Nomenclatura» y escribía OTRA cosa, sin comprobar
          nada, mientras el plano dibujaba el código: dos nombres para el mismo
          mueble y sólo uno protegido. Ahora escribe el nombre —el código— por el
          mismo camino que el doble clic sobre la caja. */}
      <Field label="Nombre" icon="🔖">
        {editMode ? (
          <>
            <input
              className={inp}
              value={nombreBorrador}
              style={choqueEscrito ? { color: "var(--danger)", borderBottomColor: "var(--danger)" } : undefined}
              onChange={(e) => { setNombreBorrador(e.target.value); setRechazo(null); }}
              onBlur={guardarNombre}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); guardarNombre(); }
                if (e.key === "Escape") { setNombreBorrador(item.code); setRechazo(null); }
              }} />
            {rechazo ? (
              <>
                <p style={{ fontSize: 11, color: "var(--danger)", marginTop: 4, lineHeight: 1.45 }}>
                  No se guardó: {textoDelChoque(nombreBorrador, rechazo, (m) => conNombrePropio(m, nombresPropios, ""))}
                  {" "}Sigue llamándose «{item.code}».
                </p>
                {/* Renumerar una corrida es intercambiar nombres entre muebles
                    que ya existen: sin esto, con todos los nombres del medio
                    tomados, no habría forma de hacerlo. Debajo del botón dice
                    qué le pasa al OTRO mueble, que nadie está mirando. */}
                {rechazo.razon === "ocupado" && (
                  <>
                    <button
                      onClick={() => {
                        onIntercambiar(item.id, (rechazo as { ocupa: PlacedItem2D }).ocupa.id);
                        setRechazo(null);
                      }}
                      style={{
                        marginTop: 6, padding: "5px 10px", borderRadius: "var(--r-sm)",
                        border: "1px solid var(--danger)", background: "var(--danger-50)",
                        color: "var(--danger)", fontSize: 11.5, fontWeight: 700,
                        cursor: "pointer", fontFamily: "inherit",
                      }}
                    >
                      Intercambiar con ese mueble
                    </button>
                    <p style={{ fontSize: 11, color: "var(--dark-ink-3)", marginTop: 4, lineHeight: 1.45 }}>
                      {textoDelIntercambio(item, (rechazo as { ocupa: PlacedItem2D }).ocupa)}
                    </p>
                  </>
                )}
              </>
            ) : choqueEscrito ? (
              <p style={{ fontSize: 11, color: "var(--danger)", marginTop: 4, lineHeight: 1.45 }}>
                {textoDelChoque(nombreBorrador, choqueEscrito, (m) => conNombrePropio(m, nombresPropios, ""))}
              </p>
            ) : (
              <p style={{ fontSize: 11, color: "var(--dark-ink-3)", marginTop: 4, lineHeight: 1.45 }}>
                Es el nombre y es la llave: con él se arma {fullCode} y con eso viaja
                al contrato, al correo de montaje y a la lámina.
              </p>
            )}
            {/* Lo que ya estaba guardado así se avisa, nunca se bloquea. */}
            {!rechazo && !choqueEscrito && choqueGuardado && (
              <p style={{ fontSize: 11, color: "var(--warning)", marginTop: 4, lineHeight: 1.45 }}>
                Ojo: otro mueble de esta sede también se llama «{normalizarNombre(item.code)}»
                {choqueGuardado.label ? ` (${conNombrePropio(choqueGuardado, nombresPropios, choqueGuardado.label)})` : ""}. Renombrá
                uno de los dos para que un contrato pueda decir a cuál va.
              </p>
            )}
          </>
        ) : (
          <>
            <p style={{ fontSize: 14, color: "var(--dark-ink-1)" }}>{nombreDeMueble(item)}</p>
            {choqueGuardado && (
              <p style={{ fontSize: 11, color: "var(--warning)", marginTop: 4, lineHeight: 1.45 }}>
                Ojo: otro mueble de esta sede también se llama «{normalizarNombre(item.code)}»
                {choqueGuardado.label ? ` (${conNombrePropio(choqueGuardado, nombresPropios, choqueGuardado.label)})` : ""}.
              </p>
            )}
          </>
        )}
        {/* El nombre viejo. No se edita ni se dibuja: está para reconciliar con
            la cartelería de la tienda y con el papel que firmó el proveedor. */}
        {viejo && (
          <p style={{ fontSize: 11, color: "var(--dark-ink-3)", marginTop: 6, lineHeight: 1.45 }}>
            Antes se llamaba «{viejo}». Es lo que puede seguir diciendo el cartel de
            la góndola y lo que vio quien negoció lo que ya está contratado.
          </p>
        )}
      </Field>

      {/* Lo contratado, de sólo lectura ─────────────────────────────────────
          El plano es el lugar del DISEÑO: qué mueble es, cuánto mide, dónde
          está, qué artes lleva. El contrato se hace en Sede → Vender, sobre el
          mapa y con la disponibilidad del periodo a la vista.

          Tenerlo editable acá no era "también se puede": los campos escribían
          el JSON del layout sin tocar la base, y el botón de guardar creaba un
          contrato NUEVO cada vez —nunca editó ninguno—. Dos lugares para lo
          mismo, y uno de los dos mentía. */}
      {rentable && (
        <Field label="Contratado" icon="🤝">
          {face.supplierName ? (
            <>
              <p style={{ fontSize: 14, fontWeight: 600, color: "var(--dark-ink-1)" }}>
                {face.supplierName}
                {face.brandCategory && (
                  <span style={{ fontWeight: 400, color: "var(--dark-ink-2)" }}> · {face.brandCategory}</span>
                )}
              </p>
              {face.startDate && face.endDate && (
                <>
                  <p style={{ fontSize: 12, color: "var(--dark-ink-2)", marginTop: 3, fontFamily: "var(--font-mono)" }}>
                    {face.startDate} → {face.endDate}
                  </p>
                  <DaysLeftStrip startDate={face.startDate} endDate={face.endDate} />
                </>
              )}
              {isAdmin && face.negotiatedValue > 0 && (
                <p style={{ fontSize: 13, fontWeight: 600, color: "var(--success)", marginTop: 6, fontFamily: "var(--font-mono)" }}>
                  ${face.negotiatedValue.toLocaleString()} / mes
                </p>
              )}
            </>
          ) : esPc ? (
            <p data-contratado-por-participacion style={{ fontSize: 13, color: "var(--dark-ink-2)", lineHeight: 1.45 }}>
              {textoDeLoComprometido(dispoPc, isAdmin)}
            </p>
          ) : (
            <p style={{ fontSize: 13, color: "var(--dark-ink-3)" }}>Sin contrato activo.</p>
          )}
          {isAdmin && esPc ? (
            <>
              <p style={{ fontSize: 11, color: "var(--dark-ink-3)", marginTop: 8, lineHeight: 1.45 }}>
                {DONDE_SE_CARGAN}
              </p>
              <button
                onClick={() => abrirEnDistribucion(item.id, activeFace)}
                title="Abre el Editor 3D en esta cara, en Distribución"
                style={{
                  marginTop: 8, padding: "5px 10px", borderRadius: "var(--r-sm)",
                  border: "1px solid var(--dark-line-2)", background: "transparent",
                  color: "var(--dark-ink-1)", fontSize: 11.5, fontWeight: 600,
                  fontFamily: "inherit", cursor: "pointer",
                }}
              >
                Abrir en Distribución
              </button>
            </>
          ) : isAdmin && (
            <p style={{ fontSize: 11, color: "var(--dark-ink-3)", marginTop: 8, lineHeight: 1.45 }}>
              Los contratos se hacen en <b style={{ color: "var(--dark-ink-2)" }}>Sede → Vender</b>, sobre el
              mapa y con la disponibilidad del periodo a la vista.
            </p>
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

      {/* Alto, entrepaños y módulo (góndola y punta). El plano no dibuja el
          alto, pero acá es donde se arma la tienda: el mismo componente que el
          Editor 3D, que escribe en el store después de revisar lo vendido
          (`components/GeometriaDelMueble.tsx`). */}
      {(item.type === "gondola_doble" || item.type === "gondola_mural" || item.type === "punta") && (
        <Field label="Alto, entrepaños y módulo" icon="📏">
          <GeometriaDelMueble id={item.id} puedeEditar={editMode && isAdmin} />
        </Field>
      )}

      {/* Vender por partes: la nevera entera o por puertas; el mural, la
          góndola, la nevera abierta y la de vegetales, por tramos; la góndola
          y la punta, por entrepaños; y las piezas de la caja (sus bahías de
          impulso) y de la columna (su forro), que no se venden enteras. Fuera
          de lo comercial del panel a propósito: es cómo ES el mueble —y la
          caja y la columna no son comercializables—, y el mismo componente
          que el Editor 3D (`components/PartesDelMueble.tsx`). */}
      {vendePorPartes(item.type) && (
        <Field label="Cómo se vende" icon="🧩">
          <PartesDelMueble id={item.id} puedeEditar={editMode && isAdmin} sinTitulo />
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
