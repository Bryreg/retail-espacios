import { useEffect, useRef, useState, useCallback, useMemo } from "react";
// Un solo juego de íconos, 16 px y trazo 1,75 (la hoja de íconos del
// rediseño, tabla «Plano»); los de cada tipo de mueble, en `iconos.ts`.
import {
  MousePointer2, RotateCw, Trash2, Eye, Search, X, Undo2, Redo2, Pencil, Plus, Minus, Ellipsis, MapPin, Shapes,
  ChevronDown, ChevronRight, PanelLeftClose, Mouse, Focus, Captions, Maximize2, Minimize2, TriangleAlert,
  ClipboardCheck, Keyboard, ListOrdered, Lock, Handshake, Ruler, FileText, FilePenLine, Percent, Copy, ImageUp,
  Image as ImageIcon, Store, Ban,
} from "lucide-react";
import { ICONO, iconoDeFamilia, iconoDelTipo } from "./iconos";
import { TIPOS_CON_GEOMETRIA, geometriaALaVista, metros } from "../../utils/geometriaDelMueble";
import { fechaEnCurso } from "../../utils/propuesta";
import type { Space } from "../../types";
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
import { partesConEstado, textoDeLoQueNuncaSeAlquila, vendePorPartes } from "../../utils/partesDelMueble";
import {
  codigoDeParte, concordancia, dispoDeParticipacion, divisionDe, estadoParaPintar, juntasDePartes, partirCodigo, piezasDe,
  porParticipacion, puntosDePartesVendidas, sufijoDeParte, vanoDeParte,
  DONDE_SE_CARGAN, notaDeEstadoPorOcupacion, rotuloPorOcupacion, textoCortoDeParticipacion, textoDeLoComprometido,
  type DispoDeParticipacion,
} from "../../utils/partes";
// «Abrir en Distribución» (el Editor 3D en esa cara): el mismo pedido que la
// ficha de Supervisar, sólo tipos y el store de lectura.
import { useAbrirEnDistribucion } from "../Distribucion/ParticipacionesDeLaCara";
import EntradaDelPlanograma from "../Planograma/EntradaDelPlanograma";
import { tieneSuperficie } from "../../utils/superficie";
import { carasDe } from "../../types/espacio";
// La ocupación ANÓNIMA de las caras por participación (store de LECTURA): el
// color de esas caras sale de ahí (§10.8), no de un contrato `…-PC3`.
import { claveDeSede, useOcupacionStore } from "../../store/ocupacionStore";
import { cotasDeCheckout, mesaDeImpulso, montantesDeImpulso, nichosDeImpulso } from "../StoreEditor3D/muebles/medidas";
import { TOLERANCIA_CONTACTO } from "../../utils/planta";
import { buscarHuecoGrupo } from "../../utils/acomodar";
import { detectarCorridas, pasilloPorMueble } from "../../utils/pasillos";
import { useAuthStore, selectIsAdmin } from "../../store/authStore";
import { findOrCreateSpace, getSpaceByCode, guardarNotaDelEspacio, updateSpaceStatus } from "../../api/spaces";
import { fetchDeleteImpact } from "../../api/layout";
import type { DeleteImpact } from "../../api/layout";
import { avisoDelRenombre, lineasDelImpacto } from "../../utils/impactoDeSede";
import { listSpaceFiles, uploadSpaceFile, deleteSpaceFile, fileUrl, getFaceImages } from "../../api/files";
import type { SpaceFileMeta } from "../../api/files";

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

type StatusFilter2D = "all" | "free" | "occupied" | "partial" | "reserved" | "expiring" | "expired";

/** Lo que los dos filtros nuevos (decisión 3 del rediseño) saben de cada
 *  mueble, del mapa CRUDO de la base y de la ocupación anónima: algo vendido
 *  en parte (puertas, tramos o entrepaños vendidos y otros libres, o una cara
 *  por participación con algo comprometido y lugar) y algo reservado (una
 *  reserva de Vender, de la cara o de una parte, o un «Reservado» a mano de
 *  antes). */
interface MarcasDelMueble { parcial: boolean; reservado: boolean }

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
function matchesStatusFilter(item: PlacedItem2D, filter: StatusFilter2D, marcas?: MarcasDelMueble): boolean {
  if (filter === "all") return true;
  // A non-rentable fixture has no contract state — it can never match a
  // commercial filter like "libres" or "por vencer".
  if (!isRentable(item)) return false;
  if (filter === "partial") return !!marcas?.parcial;
  if (filter === "reserved") return !!marcas?.reservado || item.status === "reserved" || item.faceB?.status === "reserved";
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

/** Los filtros del lienzo, con cuántos muebles hay en cada uno (la palabra,
 *  sin color: el chip elegido va en tinta plena, como en la hoja de piezas). */
const STATUS_FILTER_CHIPS: { value: StatusFilter2D; label: string }[] = [
  { value: "all",      label: "Todos" },
  { value: "free",     label: "Libres" },
  { value: "occupied", label: "Ocupados" },
  { value: "partial",  label: "Vendido en parte" },
  { value: "reserved", label: "Reservados" },
  { value: "expiring", label: "Por vencer" },
  { value: "expired",  label: "Vencidos" },
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
    pedirVender,
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
  /** El renombre que espera confirmación (fase 2 · I5): con contratos o
   *  reservas en la sede, se dice ANTES adónde van (pasan al nombre nuevo),
   *  con lo que cuenta el servidor. */
  const [renombreEnEspera, setRenombreEnEspera] = useState<{ de: string; a: string; aviso: string } | null>(null);
  /** El renombre que el servidor no hizo, con sus motivos: la sede quedó como estaba. */
  const [renombreFallido, setRenombreFallido] = useState<{ de: string; a: string; error: string; motivos: string[] } | null>(null);
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

  // ── Renombrar la sede (fase 2 · I5) ─────────────────────────────────────────
  //
  // El renombre es del servidor (`renameSede` → `POST /layout/{sede}/renombrar`):
  // los códigos pasan al nombre nuevo y lo vendido sigue vivo. Antes era
  // «borrar + crear», y el borrado cerraba los contratos y cancelaba las
  // reservas. Con contratos o reservas en la sede, un diálogo dice antes
  // adónde van (con lo que cuenta `GET /layout/{sede}/impact`, el mismo de
  // «Borrar sede»); sin nada, directo. Si el servidor se niega, se dice por
  // qué y la sede queda como estaba. Enter y el blur del campo llegan los dos:
  // sólo cuenta el primero.
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
    const hecho = await renameSede(viejo, nuevo);
    trasElRenombre(viejo, nuevo, hecho);
  }

  /** Con éxito, el lienzo pasa al nombre nuevo; si no, se dice por qué. */
  function trasElRenombre(de: string, a: string, hecho: { ok: boolean; error?: string; motivos?: string[] }) {
    if (hecho.ok) {
      setRenombreFallido(null);
      setSede(a);
      return;
    }
    setRenombreFallido({ de, a, error: hecho.error ?? `No se pudo renombrar «${de}».`, motivos: hecho.motivos ?? [] });
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

  // «Vendido en parte» y «Reservados» (decisión 3): lo que dice la base de
  // cada mueble. Las reservas se buscan por la base del código (la cara o
  // cualquiera de sus partes, `partirCodigo`), una vez por mapa.
  const marcasDe = useMemo(() => {
    const conReserva = new Set<string>();
    for (const [codigo, e] of Object.entries(estadoCrudo)) {
      if (e?.reservado || e?.reservaHasta) conReserva.add(partirCodigo(codigo.toUpperCase()).base);
    }
    const m = new Map<string, MarcasDelMueble>();
    for (const it of items) {
      const f = muebleDelStore.get(it.id);
      if (!f) continue;
      const caras: ("A" | "B")[] = it.faceB ? ["A", "B"] : ["A"];
      const partes = partesConEstado(f, estadoCrudo, sede).filter((p) => !p.pieza);
      const parcialPorPartes = caras.some((c) => {
        const deLaCara = partes.filter((p) => p.sufijo.startsWith("B·") === (c === "B"));
        return deLaCara.some((p) => p.vendida) && deLaCara.some((p) => !p.vendida);
      });
      const parcialPorParticipacion = caras.some((c) => dispoDeLaCara(it.id, c)?.dispo === "parcial");
      m.set(it.id, {
        parcial: parcialPorPartes || parcialPorParticipacion,
        reservado: conReserva.has(fullSpaceCode(f.sede || sede, f.code).toUpperCase()),
      });
    }
    return m;
  }, [items, muebleDelStore, estadoCrudo, sede, dispoDeLaCara]);

  // Search + status filter matching (AND-combined); null set = no filter active
  const normalizedQuery = normalizeText(searchQuery.trim());
  const filterActive = normalizedQuery.length > 0 || statusFilter !== "all";
  const matchedIds = useMemo<Set<string> | null>(() => {
    if (!filterActive) return null;
    const s = new Set<string>();
    for (const it of items) {
      if (matchesQuery(it, normalizedQuery, catalogLabels) && matchesStatusFilter(it, statusFilter, marcasDe.get(it.id))) {
        s.add(it.id);
      }
    }
    return s;
  }, [items, normalizedQuery, statusFilter, filterActive, catalogLabels, marcasDe]);
  /** Cuántos muebles hay en cada filtro, con lo que se está buscando. */
  const cuentaDeFiltro = useMemo(() => {
    const n = Object.fromEntries(STATUS_FILTER_CHIPS.map((c) => [c.value, 0])) as Record<StatusFilter2D, number>;
    for (const it of items) {
      if (!matchesQuery(it, normalizedQuery, catalogLabels)) continue;
      for (const c of STATUS_FILTER_CHIPS) if (matchesStatusFilter(it, c.value, marcasDe.get(it.id))) n[c.value] += 1;
    }
    return n;
  }, [items, normalizedQuery, catalogLabels, marcasDe]);

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

  // ── Rediseño, PR 3: la barra de arriba, el catálogo plegable y el pie ─────
  // (`docs/maquetas/rediseno-2026-10/plano.html`). Nada de lo que hacía la
  // barra de abajo se fue: la sede subió a la primera pieza de arriba (sin
  // repetirse abajo, decisión 2), Editar | Mirar reemplaza a «Vista previa»,
  // Revisar · Renumerar · Atajos y el guardado subieron a la derecha, y el
  // zoom, el centrado, los códigos y la pantalla completa quedaron juntos en
  // el pie del lienzo.
  const raizRef = useRef<HTMLDivElement>(null);
  const [pantallaCompleta, setPantallaCompleta] = useState(false);
  useEffect(() => {
    const alCambiar = () => setPantallaCompleta(!!raizRef.current && document.fullscreenElement === raizRef.current);
    document.addEventListener("fullscreenchange", alCambiar);
    return () => document.removeEventListener("fullscreenchange", alCambiar);
  }, []);
  function alternarPantallaCompleta() {
    if (document.fullscreenElement) { void document.exitFullscreen().catch(() => {}); return; }
    const el = raizRef.current;
    if (!el?.requestFullscreen) { setAviso("Este navegador no deja pasar a pantalla completa"); return; }
    void el.requestFullscreen().catch(() => setAviso("Este navegador no deja pasar a pantalla completa"));
  }

  /** El catálogo se pliega a una franja con su ícono: a lo angosto arranca
   *  plegado, para que el lienzo no quede en cero. */
  const [catalogoAbierto, setCatalogoAbierto] = useState(() => typeof window === "undefined" || window.innerWidth > 760);
  /** Las familias del catálogo, en el orden del catálogo de muebles, con su ícono. */
  const familias = useMemo(() => Array.from(
    CATALOG.reduce((map, def) => {
      if (!map.has(def.category)) map.set(def.category, []);
      map.get(def.category)!.push(def);
      return map;
    }, new Map<string, typeof CATALOG>()),
  ), []);
  const [familiasAbiertas, setFamiliasAbiertas] = useState<Set<string>>(() => new Set(familias.slice(0, 1).map(([f]) => f)));
  // Lo que se está por colocar se ve: su familia se abre sola.
  useEffect(() => {
    const fam = pendingType ? CATALOG.find((c) => c.type === pendingType)?.category : undefined;
    if (fam) setFamiliasAbiertas((prev) => (prev.has(fam) ? prev : new Set([...prev, fam])));
  }, [pendingType]);

  /** El menú «⋯» de la sede: Renombrar, Agregar y Eliminar (los mismos
   *  campos y diálogos de antes). Se cierra al tocar afuera o con Esc. */
  const [menuSede, setMenuSede] = useState(false);
  const menuSedeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuSede) return;
    const fuera = (e: MouseEvent) => { if (!menuSedeRef.current?.contains(e.target as Node)) setMenuSede(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuSede(false); };
    window.addEventListener("mousedown", fuera);
    window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("mousedown", fuera); window.removeEventListener("keydown", esc); };
  }, [menuSede]);

  /** Editar | Mirar. Lo que hacía el botón «Vista previa»: soltar la
   *  herramienta, lo que se arrastraba y lo elegido. */
  function cambiarModo(editar: boolean) {
    if (editar === editMode) return;
    setEditMode(editar);
    setActiveTool("select");
    setPendingType(null);
    setDragState(null);
    setDragOrigPositions(null);
    setResizeState(null);
    setSelectionRect(null);
    setSelectedIds(new Set());
  }

  /** «Centrar en todo»: el encuadre que hacía ⊡; sin muebles, el de ⌂. */
  function centrarEnTodo() {
    const svgEl = svgRef.current;
    if (!svgEl || items.length === 0) { setZoom(1); setPanOffset({ x: 60, y: 60 }); return; }
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
    setZoom(newZoom);
    setPanOffset({ x: pad - minX * PX_PER_M * newZoom, y: pad - minY * PX_PER_M * newZoom });
  }

  /** La línea de ayuda del pie: lo que se puede hacer ahora. */
  const pista = activeTool === "place"
    ? "Hacé clic en el lienzo para colocar · Esc para cancelar"
    : selectedIds.size > 1
    ? `${selectedIds.size} elementos seleccionados · Shift+clic suma o quita · arrastrá uno para mover el grupo`
    : editMode
    ? "Arrastrá para mover · rueda para acercar · espacio + arrastre para desplazar"
    : "Clic en un mueble para ver su ficha · rueda para acercar · espacio + arrastre para desplazar";

  const posicionDeLaSede = storeSedeList.indexOf(sede);

  // ── Grid pattern defs ────────────────────────────────────────────────────────

  const gridCell = PX_PER_M; // 1m in px (at zoom=1)
  const subCell  = PX_PER_M * 0.25;

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div ref={raizRef} className="plano2d flex flex-col h-full w-full overflow-hidden" data-pantalla-completa={pantallaCompleta || undefined}>

      {/* ── La barra de arriba ─────────────────────────────────────────────
          1 · la sede (la misma pieza que Vender y Supervisar), 2 · Editar |
          Mirar, 3 · las herramientas y, a la derecha, el guardado, Revisar,
          Renumerar y Atajos. La sede se dice UNA vez, acá: abajo ya no se
          repite (decisión 2). */}
      <div className="barra-pantalla p2-barra">
        <div className="pieza p2-sede" data-sede-pieza>
          <MapPin {...ICONO} className="ico" />
          {editingSedeInline ? (
            <input
              className="p2-sede-campo"
              aria-label="Nuevo nombre de la sede"
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
            <select className="sede-sel" value={sede} onChange={(e) => setSede(e.target.value)} aria-label="Sede">
              {storeSedeList.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          {addingNewSede && (
            <input
              className="p2-sede-campo"
              aria-label="Nombre de la sede nueva"
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
          )}
          <span className="cuantos">
            {posicionDeLaSede >= 0 && <>{posicionDeLaSede + 1} de {storeSedeList.length}{" · "}</>}
            {items.length} mueble{items.length === 1 ? "" : "s"}
          </span>
          <div className="p2-menu-w" ref={menuSedeRef}>
            <button type="button" className="p2-icobtn" title="Renombrar, agregar o eliminar sede"
              aria-label="Renombrar, agregar o eliminar sede" aria-haspopup="menu" aria-expanded={menuSede}
              onClick={() => setMenuSede((v) => !v)}>
              <Ellipsis {...ICONO} />
            </button>
            {menuSede && (
              <div className="p2-menu" role="menu" data-menu-sede>
                <button type="button" role="menuitem" title="Renombrar sede"
                  onClick={() => { setMenuSede(false); renombrando.current = false; setEditingSedeInline(true); setEditingSedeVal(sede); }}>
                  <Pencil {...ICONO} /> Renombrar sede
                </button>
                <button type="button" role="menuitem" title="Agregar nueva sede"
                  onClick={() => { setMenuSede(false); setAddingNewSede(true); }}>
                  <Plus {...ICONO} /> Agregar sede
                </button>
                {/* Admin only, and never the last one standing */}
                {isAdmin && storeSedeList.length > 1 && (
                  <button type="button" role="menuitem" className="peligro" title="Eliminar sede"
                    onClick={() => { setMenuSede(false); setConfirmDeleteSede(true); }}>
                    <Trash2 {...ICONO} /> Eliminar sede
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {isAdmin && (
          <div className="p2-grupo">
            <div className="p2-seg" role="group" aria-label="Modo del plano" data-modo-del-plano>
              <button type="button" aria-pressed={editMode} onClick={() => cambiarModo(true)}>
                <Pencil {...ICONO} /> Editar
              </button>
              <button type="button" aria-pressed={!editMode} onClick={() => cambiarModo(false)}>
                <Eye {...ICONO} /> Mirar
              </button>
            </div>
          </div>
        )}

        {editMode && (
          <div className="p2-grupo" role="toolbar" aria-label="Herramientas">
            <button type="button" className="p2-icobtn" title="Seleccionar (Esc)" aria-label="Seleccionar"
              aria-pressed={activeTool === "select"}
              onClick={() => { setActiveTool("select"); setPendingType(null); }}>
              <MousePointer2 {...ICONO} />
            </button>
            <span className="p2-sepv" />
            <button type="button" className="p2-icobtn" title="Deshacer (Ctrl+Z)" aria-label="Deshacer" onClick={() => undo()}>
              <Undo2 {...ICONO} />
            </button>
            <button type="button" className="p2-icobtn" title="Rehacer (Ctrl+Y)" aria-label="Rehacer" onClick={() => redo()}>
              <Redo2 {...ICONO} />
            </button>
            <span className="p2-sepv" />
            <button type="button" className="p2-icobtn" title="Rotar (R)" aria-label="Rotar"
              onClick={() => rotateItem(selectedId)} disabled={!selectedId}>
              <RotateCw {...ICONO} />
            </button>
            <button type="button" className="p2-icobtn peligro" aria-label="Eliminar"
              title={selectedIds.size > 1 ? `Eliminar ${selectedIds.size} seleccionados (Supr)` : "Eliminar (Supr)"}
              disabled={selectedIds.size === 0}
              onClick={() => {
                if (selectedIds.size > 0) {
                  setItems((prev) => prev.filter((i) => !selectedIds.has(i.id)));
                  setSelectedIds(new Set());
                }
              }}>
              <Trash2 {...ICONO} />
            </button>
          </div>
        )}

        <div className="der">
          {/* El guardado es automático: el punto y la palabra dicen cómo va. */}
          {isAdmin && <SyncButton />}
          <button type="button" className="btn-barra" aria-pressed={revisionAbierta}
            onClick={() => { setRevisionAbierta((v) => !v); setAtajosAbiertos(false); setSelectedIds(new Set()); }}
            title="Revisar el plano: códigos repetidos, muebles encimados y pasillos angostos" aria-label="Revisar">
            <ClipboardCheck {...ICONO} className="ico" /> <span className="txt">Revisar</span>
          </button>
          {/* Al lado de «Revisar», que es donde vive la higiene del plano: uno
              lista lo que está mal, el otro lo arregla de raíz. Sólo admin —
              renumerar mueve los contratos y los montajes con su mueble. */}
          {isAdmin && (
            <button type="button" className="btn-barra" onClick={() => navigate("/renumerar")} aria-label="Renumerar"
              title="Renumerar el plano siguiendo el recorrido de la tienda, con el informe antes → después para llevar a la sede">
              <ListOrdered {...ICONO} className="ico" /> <span className="txt">Renumerar</span>
            </button>
          )}
          <button type="button" className="p2-icobtn borde" aria-pressed={atajosAbiertos}
            onClick={() => { setAtajosAbiertos((v) => !v); setRevisionAbierta(false); setSelectedIds(new Set()); }}
            title="Atajos de teclado" aria-label="Atajos de teclado">
            <Keyboard {...ICONO} />
          </button>
        </div>
      </div>

      {/* Main area */}
      <div className="p2-cuerpo flex flex-1 overflow-hidden">

        {/* El catálogo (sólo editando): familias plegables con su ícono, y
            cada tipo con su ícono, sus medidas y cuántos modelos tiene. */}
        {editMode && (
          <aside className="p2-catalogo" data-catalogo-2d data-plegado={!catalogoAbierto || undefined}>
            <div className="p2-cat-h">
              {catalogoAbierto ? (
                <>
                  <Shapes {...ICONO} />
                  <h3>Catálogo</h3>
                  <span className="sub">clic para colocar</span>
                  <button type="button" className="p2-icobtn chico" title="Plegar el catálogo" aria-label="Plegar el catálogo"
                    onClick={() => setCatalogoAbierto(false)}>
                    <PanelLeftClose {...ICONO} />
                  </button>
                </>
              ) : (
                <button type="button" className="p2-icobtn" title="Abrir el catálogo" aria-label="Abrir el catálogo"
                  onClick={() => setCatalogoAbierto(true)}>
                  <Shapes {...ICONO} />
                </button>
              )}
            </div>
            {catalogoAbierto && (
              <div className="p2-cat-b">
                {familias.map(([cat, defs]) => {
                  const IconoFamilia = iconoDeFamilia(cat, defs[0]?.type);
                  const abierta = familiasAbiertas.has(cat);
                  const modelosDeLaFamilia = defs.reduce((n, d) => n + (modelosDelPlano[d.type]?.length ?? 0), 0);
                  return (
                    <div key={cat} className="p2-fam" data-familia={cat}>
                      <button type="button" className="p2-fam-h" aria-expanded={abierta}
                        onClick={() => setFamiliasAbiertas((prev) => {
                          const next = new Set(prev);
                          if (next.has(cat)) next.delete(cat); else next.add(cat);
                          return next;
                        })}>
                        <IconoFamilia {...ICONO} />
                        <div>
                          <b>{cat}</b>
                          <span>
                            {defs.length} {defs.length === 1 ? "tipo" : "tipos"}
                            {modelosDeLaFamilia > 0 && <> · {modelosDeLaFamilia} {modelosDeLaFamilia === 1 ? "modelo" : "modelos"}</>}
                          </span>
                        </div>
                        {abierta ? <ChevronDown {...ICONO} /> : <ChevronRight {...ICONO} />}
                      </button>
                      {abierta && defs.map((def) => {
                        const displayLabel = nombrePropio(def.type, catalogLabels) ?? def.label;
                        const isEditingThis = editingCatalogType === def.type;
                        const isActive = pendingType === def.type && activeTool === "place" && !pendingModelo;
                        const modelos = modelosDelPlano[def.type] ?? [];
                        const IconoTipo = iconoDelTipo(def.type);
                        return (
                          <div key={cat + def.type} className="p2-tipo" data-tipo-2d={def.type} data-activo={isActive || undefined}>
                            <button type="button" className="p2-tipo-b"
                              onClick={() => { setActiveTool("place"); setPendingType(def.type); setPendingModelo(null); }}>
                              <IconoTipo {...ICONO} />
                              <div style={{ minWidth: 0 }}>
                                {isEditingThis ? (
                                  <input
                                    className="p2-tipo-campo"
                                    aria-label="Cómo le dicen en esta tienda"
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
                                  <b>{displayLabel}</b>
                                )}
                                <span className="med">
                                  {metros(def.w)} × {metros(def.h)} × {metros(H_DEFAULTS[def.type] ?? 0)} m
                                  {modelos.length > 0 && ` · ${modelos.length} ${modelos.length === 1 ? "modelo" : "modelos"}`}
                                </span>
                              </div>
                            </button>
                            {/* El nombre propio de la familia: el lápiz de siempre. */}
                            {!isEditingThis && (
                              <button type="button" className="p2-icobtn chico p2-lapiz"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingCatalogType(def.type);
                                  setEditingCatalogVal(displayLabel);
                                }}
                                title="Cómo le dicen en esta tienda (vacío: el nombre de RECABRA). También en Configuración."
                                aria-label="Cómo le dicen en esta tienda">
                                <Pencil {...ICONO} />
                              </button>
                            )}
                            {/* Los modelos de la familia: muebles de verdad, con las
                                medidas de su ficha —los de RECABRA y después las
                                fichas propias del supermercado—. Lo de arriba es el
                                modelo base, que se coloca como siempre. «≈»: medidas
                                deducidas. */}
                            {modelos.length > 0 && (
                              <details className="p2-modelos" data-modelos-2d={def.type}
                                open={(pendingType === def.type && !!pendingModelo) || undefined}>
                                <summary>Elegir el modelo</summary>
                                {modelos.map((m) => {
                                  const activo = pendingModelo?.id === m.id && activeTool === "place";
                                  return (
                                    <button key={m.id} data-modelo={m.id} type="button" className="p2-modelo" data-activo={activo || undefined}
                                      onClick={() => { setActiveTool("place"); setPendingType(def.type); setPendingModelo(m); }}>
                                      <span className="nom">{m.estimado ? "≈ " : ""}{m.nombre}</span>
                                      <span className="med">{metros(m.w)} × {metros(m.h)} × {metros(m.nace.h)} m</span>
                                      {/* Cómo se vende lo que se coloca desde este
                                          modelo («por puertas»): lo dice su ficha. */}
                                      {m.comoSeVende && (
                                        <span className="como" data-como-se-vende={m.comoSeVende}>{m.comoSeVende}</span>
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
                  );
                })}
                <p className="p2-nota">El nombre de cada tipo se cambia con el lápiz: es cómo le dicen en esta tienda.</p>
              </div>
            )}
          </aside>
        )}

        {/* El lienzo: arriba el buscador y los filtros con su cuenta, abajo el
            zoom, el centrado, los códigos y la pantalla completa. */}
        <div className="p2-lienzo">
          <div className="p2-sobre">
            <label className="p2-buscar">
              <Search {...ICONO} />
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
                aria-label="Buscar espacio, categoría o proveedor"
              />
              {filterActive && <span className="cuenta">{matchedIds?.size ?? 0} de {items.length}</span>}
              {searchQuery.length > 0 && (
                <button type="button" className="p2-icobtn chico" onClick={() => setSearchQuery("")} title="Limpiar búsqueda" aria-label="Limpiar búsqueda">
                  <X {...ICONO} />
                </button>
              )}
            </label>
            <div className="p2-chips" role="group" aria-label="Filtrar por estado" data-filtros-2d>
              {STATUS_FILTER_CHIPS.map((chip) => (
                <button key={chip.value} type="button" className="p2-chip" data-filtro={chip.value}
                  aria-pressed={statusFilter === chip.value} onClick={() => setStatusFilter(chip.value)}>
                  {chip.label} <span className="mono">{cuentaDeFiltro[chip.value]}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="p2-svg" style={{ background: "var(--surface-2)" }}>
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
                        Ícono del tipo (el de la biblioteca, `iconos.ts`; antes un
                        emoji): sólo cuando el código no entra.
                        Code: show only when fixture is at least 46 px wide on screen.
                        El nombre de un mueble que tiene gemelo en la sede se lee
                        en rojo, igual que la marca «×2» de su pastilla: la caja
                        de al lado dice exactamente lo mismo. */}
                    {(() => {
                      const screenW = pw * zoom;
                      const screenH = ph * zoom;
                      // «Ocultar los códigos» también apaga los de adentro (la
                      // misma regla que la pastilla de arriba): un filtro que
                      // lo encuentra, un nombre repetido o el que se está
                      // renombrando se siguen viendo. El ícono queda para el
                      // mueble donde el código no entra.
                      const codigoALaVista = showLabels || (filterActive && isFilterMatch) || !!rotulos.choque || editingCodeId === item.id;
                      const showCode = rotulos.adentro !== null && codigoALaVista;
                      const showIcono = rotulos.adentro === null && screenW > 22 && screenH > 16;
                      const lado = Math.min(12 / zoom, pw * 0.6, ph * 0.7);
                      const IconoDelMueble = iconoDelTipo(item.type);
                      // Font size: stays ~11 px on screen but capped to 45 % of fixture width
                      const fs = Math.min(11 / zoom, pw * 0.45, ph * 0.7);
                      return (
                        <>
                          {showIcono && (
                            <IconoDelMueble
                              x={px + pw / 2 - lado / 2}
                              y={py + ph / 2 - lado / 2}
                              width={lado}
                              height={lado}
                              strokeWidth={1.75}
                              color="var(--ink-2)"
                              aria-hidden
                              style={{ pointerEvents: "none" }}
                            />
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
                      <TriangleAlert
                        x={px + pw - 14 / zoom}
                        y={py + 2 / zoom}
                        width={12 / zoom}
                        height={12 / zoom}
                        strokeWidth={2}
                        color="var(--ocupado)"
                        aria-hidden
                        style={{ pointerEvents: "none" }}
                      />
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
          {aviso && <div className="p2-toast" role="status">{aviso}</div>}

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
                  marginBottom: 16,
                }}
              >
                <Shapes size={32} strokeWidth={1.75} aria-hidden />
              </div>
              <p style={{ fontSize: 14, fontWeight: 600, color: "var(--ink-1)", marginBottom: 4 }}>
                {editMode ? "El plano está vacío" : "Sin muebles en el plano"}
              </p>
              <p style={{ fontSize: 12, color: "var(--ink-3)", maxWidth: 280 }}>
                {editMode
                  ? "Elegí un mueble del catálogo para empezar a dibujar el plano."
                  : "Pasá a «Editar» para agregar muebles."}
              </p>
            </div>
          )}
          </div>

          <div className="p2-pie">
            <span className="p2-pista" title={pista}><Mouse {...ICONO} /><span>{pista}</span></span>
            <span className="p2-herr" data-pie-del-lienzo>
              <button type="button" className="p2-icobtn" title="Alejar" aria-label="Alejar"
                onClick={() => setZoom((z) => Math.max(0.25, z / 1.2))}>
                <Minus {...ICONO} />
              </button>
              <button type="button" className="p2-zoom" title="Volver al 100 %" aria-label="Volver al 100 %"
                onClick={() => { setZoom(1); setPanOffset({ x: 60, y: 60 }); }}>
                {Math.round(zoom * 100)} %
              </button>
              <button type="button" className="p2-icobtn" title="Acercar" aria-label="Acercar"
                onClick={() => setZoom((z) => Math.min(4, z * 1.2))}>
                <Plus {...ICONO} />
              </button>
              <button type="button" className="p2-icobtn" title="Centrar en todo" aria-label="Centrar en todo" onClick={centrarEnTodo}>
                <Focus {...ICONO} />
              </button>
              <button type="button" className="p2-icobtn" aria-pressed={showLabels}
                onClick={() => setShowLabels((v) => !v)}
                title={showLabels ? "Ocultar los códigos" : "Mostrar los códigos"}
                aria-label="Mostrar los códigos">
                <Captions {...ICONO} />
              </button>
              <button type="button" className="p2-icobtn" aria-pressed={pantallaCompleta}
                title={pantallaCompleta ? "Salir de pantalla completa" : "Pantalla completa"}
                aria-label="Pantalla completa" onClick={alternarPantallaCompleta}>
                {pantallaCompleta ? <Minimize2 {...ICONO} /> : <Maximize2 {...ICONO} />}
              </button>
            </span>
          </div>
        </div>

        {/* El panel de la derecha: sigue el tema claro u oscuro (dejó de ser
            el cajón oscuro de siempre). A lo angosto, una hoja desde abajo. */}
        {selectedIds.size > 1 ? (
          <aside className="p2-panel" aria-label="Varios elegidos">
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
          </aside>
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
          <aside className="p2-panel" aria-label="El mueble elegido">
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
              onVender={(cara) => pedirVender(selectedItem.id, cara)}
              onDelete={() => { deleteItem(selectedItem.id); }}
              onDuplicate={() => duplicateSelected(new Set([selectedItem.id]))}
              onClose={() => setSelectedIds(new Set())}
            />
          </aside>
        ) : null}
      </div>

      {renombreEnEspera && (
        <RenombrarSedeDialog
          {...renombreEnEspera}
          onCancel={() => setRenombreEnEspera(null)}
          onConfirm={async () => {
            const { de, a } = renombreEnEspera;
            setRenombreEnEspera(null);
            const hecho = await renameSede(de, a);
            trasElRenombre(de, a, hecho);
          }}
        />
      )}

      {renombreFallido && (
        <RenombreRechazadoDialog {...renombreFallido} onCerrar={() => setRenombreFallido(null)} />
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
 * Renombrar una sede con contratos activos o reservas provisionales de
 * participación los pasa al nombre nuevo (fase 2 · I5: el renombre es del
 * servidor y no pierde nada). Este diálogo lo dice antes, con el texto de
 * `avisoDelRenombre`, y deja seguir o no.
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
              height: 32, padding: "0 14px", borderRadius: "var(--r-md)", border: "none", background: "var(--accent)",
              color: "#fff", fontSize: 12.5, fontWeight: 600, fontFamily: "inherit", cursor: "pointer",
            }}
          >
            Renombrar
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * El renombre que el servidor no hizo (fase 2 · I5): ya hay una sede con ese
 * nombre, otro equipo guardó el plano en el medio, un código destino está
 * tomado… Se dice por qué, con sus motivos, y la sede queda como estaba.
 */
function RenombreRechazadoDialog({ de, a, error, motivos, onCerrar }: {
  de: string; a: string; error: string; motivos: string[]; onCerrar: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCerrar(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCerrar]);
  return (
    <div
      onClick={onCerrar}
      style={{
        position: "fixed", inset: 0, zIndex: 200, background: "rgba(26,24,20,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      }}
    >
      <div
        role="alertdialog" aria-modal="true" aria-label={`No se renombró «${de}»`} data-renombre-rechazado
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 440, maxWidth: "100%", background: "var(--surface)", border: "1px solid var(--line)",
          borderRadius: "var(--r-xl)", boxShadow: "var(--shadow-lg)", overflow: "hidden",
        }}
      >
        <div style={{ padding: "16px 18px 12px", borderBottom: "1px solid var(--line-soft)", fontSize: 15, fontWeight: 700, color: "var(--ink-1)" }}>
          «{de}» no se renombró a «{a}»
        </div>
        <p style={{ margin: 0, padding: "14px 18px 4px", fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.6 }}>{error}</p>
        {motivos.length > 0 && (
          <ul style={{ margin: 0, padding: "6px 18px 4px 34px", fontSize: 12, color: "var(--ink-2)", lineHeight: 1.6 }}>
            {motivos.map((m) => <li key={m}>{m}</li>)}
          </ul>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", padding: "14px 18px 16px" }}>
          <button
            onClick={onCerrar} autoFocus
            style={{
              height: 32, padding: "0 14px", borderRadius: "var(--r-md)", border: "1px solid var(--line)",
              background: "var(--surface)", color: "var(--ink-2)", fontSize: 12.5, fontWeight: 500, fontFamily: "inherit", cursor: "pointer",
            }}
          >
            Entendido
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

// ─── El estado del guardado ──────────────────────────────────────────────────

/**
 * El guardado es automático; esto dice cómo va, con un punto y su palabra
 * (rediseño, PR 3: «Guardado · Guardando… · Sin conexión», como el
 * «Sincronizado» de la barra de la app). Tocarlo sigue sincronizando en los dos
 * sentidos, como el botón de antes.
 */
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
    conflictCount > 0 ? "Conflicto"
    : rechazado ? "Rechazado por el servidor"
    : syncState === "pushing" || hasPending ? "Guardando…"
    : syncState === "pulling" ? "Actualizando…"
    : syncState === "error" ? "Sin conexión"
    : "Guardado";

  const color =
    conflictCount > 0 ? "var(--entra)"
    : rechazado || syncState === "error" ? "var(--ocupado)"
    : !hasPending && syncState === "idle" ? "var(--libre)"
    : "var(--entra)";

  return (
    <button
      type="button"
      className="p2-guardado"
      data-guardado
      onClick={handleSync}
      disabled={busy}
      style={{ ["--c" as string]: color }}
      title={
        rechazado
          ? [rechazado.message, ...rechazado.choques].join(" ")
          : lastSyncedAt
            ? `Última sincronización ${new Date(lastSyncedAt).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })}. Tocá para sincronizar.`
            : "Sincronizar con el servidor"
      }
    >
      {label}
    </button>
  );
}

// ─── Atajos ───────────────────────────────────────────────────────────────────

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

function AtajosPanel({ onClose }: { onClose: () => void }) {
  return (
    <aside className="p2-panel" aria-label="Atajos de teclado" data-panel-atajos>
      <div className="p2-panel-h">
        <Keyboard {...ICONO} />
        <div><h3>Atajos</h3><span className="sub">Casi todo pide «Editar». Deshacer y rehacer andan siempre.</span></div>
        <button type="button" className="p2-icobtn" onClick={onClose} title="Cerrar" aria-label="Cerrar"><X {...ICONO} /></button>
      </div>
      <div className="p2-panel-b">
        {ATAJOS.map((g) => (
          <div key={g.grupo}>
            <p className="p2-rotulo">{g.grupo}</p>
            <div style={{ display: "grid", gap: 6 }}>
              {g.filas.map(([tecla, que]) => (
                <div key={tecla} className="p2-tecla">
                  <kbd>{tecla}</kbd>
                  <span>{que}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}

// ─── Revisar ──────────────────────────────────────────────────────────────────

/**
 * Qué está mal en el plano, antes de que se use para negociar.
 *
 * De acá salen los espacios que se venden, el metraje que se cobra y el
 * recorrido que se le muestra al proveedor: un código repetido o un mueble
 * encima de otro no se nota hasta que ya viajó a un contrato.
 */
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
    <aside className="p2-panel" aria-label="Revisión del plano" data-panel-revision>
      <div className="p2-panel-h">
        <ClipboardCheck {...ICONO} />
        <div style={{ minWidth: 0 }}>
          <h3>Revisión del plano</h3>
          <span className="sub">{items.length} muebles · {corridas} pasillo{corridas === 1 ? "" : "s"}</span>
        </div>
        <button type="button" className="p2-icobtn" onClick={onClose} title="Cerrar" aria-label="Cerrar"><X {...ICONO} /></button>
      </div>

      <div className="p2-panel-b">
        {hallazgos.length === 0 ? (
          <p className="p2-limpio">
            El plano está limpio: sin dos muebles llamados igual, sin muebles
            encimados y con pasillos por donde se puede caminar.
          </p>
        ) : (
          <>
            <p className="p2-msj">
              {errores > 0
                ? `${errores} ${errores === 1 ? "cosa rompe" : "cosas rompen"} algo aguas abajo.`
                : "Nada roto; lo de abajo puede ser deliberado."}
            </p>
            {hallazgos.map((h, i) => (
              <button
                key={i}
                type="button"
                className="p2-hallazgo"
                data-error={h.severidad === "error" || undefined}
                onClick={() => h.ids.length && onIr(h.ids)}
                disabled={h.ids.length === 0}
              >
                {h.texto}
                {h.ids.length > 0 && <span className="ir">Tocá para ir</span>}
              </button>
            ))}
          </>
        )}

        {/* Lo que ya está cargado, que ninguna validación arregla ─────────── */}
        {aRevisar.length > 0 && (
          <div className="p2-sep" style={{ display: "grid", gap: 6 }}>
            <p className="p2-v" style={{ fontWeight: 700, fontSize: "var(--t-xs)" }}>
              Contratos para revisar uno por uno
            </p>
            <p className="p2-msj">
              {aRevisar.length} contrato{aRevisar.length === 1 ? "" : "s"} vigente
              {aRevisar.length === 1 ? "" : "s"} sobre muebles que hoy se llaman distinto
              de como se llamaban cuando se negociaron. El papel y el cartel de la
              góndola dicen el nombre viejo; el plano dice el de ahora.
            </p>
            {aRevisar.map((c) => (
              <button
                key={`${c.id}-${c.cara ?? "A"}`}
                type="button"
                className="p2-hallazgo"
                data-error={c.loTieneAhora ? true : undefined}
                onClick={() => onIr([c.id])}
              >
                <span className="mono">{c.codigo}</span>
                <span style={{ opacity: 0.8 }}> · se negoció como </span>
                <span className="mono">«{c.seNegocioComo}»</span>
                <span style={{ display: "block", marginTop: 3 }}>
                  {c.proveedor}{c.marca ? ` · ${c.marca}` : ""}
                </span>
                <span style={{ display: "block", fontFamily: "var(--f-mono)", fontSize: "var(--t-2xs)", opacity: 0.85 }}>
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
        )}

        {/* La salida de fondo. «Revisar» lista lo que está mal; renumerar es lo
            único que lo arregla de raíz —el sistema reasigna los nombres
            siguiendo el recorrido, y caminar la tienda y leer los números pasan
            a ir en el mismo orden—. Va al pie y no arriba a propósito: primero
            se mira qué hay, después se decide. */}
        {isAdmin && (
          <div className="p2-sep">
            <button type="button" className="p2-hallazgo" onClick={onRenumerar}>
              <b style={{ color: "var(--ink-1)", display: "inline-flex", alignItems: "center", gap: 6 }}>
                <ListOrdered {...ICONO} /> Renumerar el plano →
              </b>
              <span style={{ display: "block", marginTop: 3 }}>
                El sistema reasigna los nombres siguiendo el recorrido de la tienda, en todas
                las sedes. Primero muestra el antes → después completo, imprimible, y no
                escribe nada hasta que se aprueba.
              </span>
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}

// ─── Varios elegidos ──────────────────────────────────────────────────────────

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
    <div data-panel-varios>
      <div className="p2-panel-h">
        <MousePointer2 {...ICONO} />
        <div><h3>{count} elegidos</h3><span className="sub">Selección múltiple</span></div>
        <button type="button" className="p2-icobtn" onClick={onClose} title="Soltar la selección (Esc)" aria-label="Soltar la selección"><X {...ICONO} /></button>
      </div>
      <div className="p2-panel-b">
        {editMode && isAdmin && (
          <div>
            <p className="p2-rotulo">Destino de los {count}</p>
            <div className="p2-dos">
              {([true, false] as const).map((value) => (
                <button key={String(value)} type="button" className="p2-btn" onClick={() => onSetRentable(value)}>
                  {value ? <Store {...ICONO} /> : <Ban {...ICONO} />}
                  {value ? "Comercializable" : "No comercializable"}
                </button>
              ))}
            </div>
          </div>
        )}

        {editMode && (
          <button type="button" className="p2-btn peligro ancho" onClick={onDelete}>
            <Trash2 {...ICONO} /> Eliminar {count} elementos
          </button>
        )}
        <div style={{ display: "grid", gap: 6 }}>
          <div className="p2-tecla"><kbd>Shift + clic</kbd><span>agrega o quita del grupo</span></div>
          <div className="p2-tecla"><kbd>Supr</kbd><span>elimina todos</span></div>
          <div className="p2-tecla"><kbd>Esc</kbd><span>suelta la selección</span></div>
          <div className="p2-tecla"><kbd>Arrastrar</kbd><span>mueve todo el grupo</span></div>
        </div>
      </div>
    </div>
  );
}

// ─── El panel del mueble (panel B) ───────────────────────────────────────────

// Badges follow STATUS_COLORS: un estado, un color (los tokens del tema, en
// claro y en oscuro).
const STATUS_BADGE_STYLE: Record<SpaceStatus, React.CSSProperties> = {
  free:        { background: "var(--libre-suave)",   color: "var(--libre-txt)",    border: "1px solid var(--libre-borde)" },
  occupied:    { background: "var(--ocupado-suave)", color: "var(--ocupado-txt)",  border: "1px solid var(--ocupado-borde)" },
  reserved:    { background: "var(--entra-suave)",   color: "var(--entra-txt)",    border: "1px solid var(--entra-borde)" },
  maintenance: { background: "var(--resto-suave)",   color: "var(--muted-status)", border: "1px solid var(--resto-borde)" },
};

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
  const color = critical ? "var(--ocupado)" : daysLeft <= 30 ? "var(--entra)" : "var(--libre)";
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
    <div style={{ marginTop: 4, width: "100%" }}>
      <div style={{ height: 4, borderRadius: 999, background: "var(--surface-3)", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 999, transition: "width .2s" }} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
        <span className="p2-pill" style={badge}>{label}</span>
      </div>
    </div>
  );
}

// ─── Documentos (los archivos del espacio y su nota) ─────────────────────────

const ALLOWED_FILE_EXTS = [".pdf", ".xls", ".xlsx", ".csv", ".jpg", ".jpeg", ".png", ".webp"];
// Extensiones que SÍ pueden declararse como cara vigente (fix H8, Fase 3) —
// coincide con las que `files.py` acepta como imagen.
const IMAGE_FILE_EXTS = [".jpg", ".jpeg", ".png", ".webp"];

/** El tamaño de un archivo, como lo dice la lista: «240 KB», «1,2 MB». */
function tamano(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Los archivos de un espacio (la cara activa), la foto que pinta su cara en el
 * 3D y su fila de `spaces` (para la «Nota del espacio»).
 *
 * Se leen al abrir el panel y no al desplegar una sección: la pestaña
 * «Documentos» dice cuántos hay. Leer NO crea la fila de `spaces`
 * (`GET /spaces/by-code`; un espacio que nunca se vendió no tiene archivos):
 * la crea —sólo quien administra— el primer archivo que se sube o la primera
 * nota que se escribe, como antes.
 */
function useDocumentosDelEspacio(code: string, isAdmin: boolean, alta: { name: string; zone: string; sede: string; areaM2: number }) {
  const [espacio, setEspacio] = useState<Space | null>(null);
  const [files, setFiles] = useState<SpaceFileMeta[]>([]);
  // La imagen DECLARADA como la cara vigente (fix H8): la que pinta el 3D.
  const [caraId, setCaraId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const spaceIdRef = useRef<number | null>(null);

  const leer = useCallback(async (vivo: () => boolean) => {
    setLoading(true);
    setError("");
    const s = await getSpaceByCode(code);
    if (!vivo()) return;
    setEspacio(s);
    spaceIdRef.current = s?.id ?? null;
    if (!s) { setFiles([]); setCaraId(null); setLoading(false); return; }
    try {
      const [lista, caras] = await Promise.all([listSpaceFiles(s.id), getFaceImages().catch(() => [])]);
      if (!vivo()) return;
      setFiles(lista);
      const suya = caras.find((c) => c.code.trim().toUpperCase() === code.trim().toUpperCase());
      setCaraId(suya ? suya.file_id : null);
    } catch {
      if (vivo()) setError("No se pudieron cargar los archivos");
    } finally {
      if (vivo()) setLoading(false);
    }
  }, [code]);

  useEffect(() => {
    let vivo = true;
    setEspacio(null); setFiles([]); setCaraId(null); spaceIdRef.current = null;
    void leer(() => vivo);
    return () => { vivo = false; };
  }, [leer]);

  /** El id para escribir: el que ya se leyó o, para quien administra, la fila
   *  que se crea (como hacía siempre el panel). */
  const idParaEscribir = useCallback(async (): Promise<number | null> => {
    if (spaceIdRef.current != null) return spaceIdRef.current;
    if (!isAdmin) return null;
    try {
      const space = await findOrCreateSpace({ code, name: alta.name, zone: alta.zone, sede: alta.sede, area_m2: alta.areaM2 });
      spaceIdRef.current = space.id;
      setEspacio(space);
      return space.id;
    } catch {
      return null;
    }
  }, [isAdmin, code, alta.name, alta.zone, alta.sede, alta.areaM2]);

  return { espacio, setEspacio, files, setFiles, caraId, setCaraId, loading, error, setError, idParaEscribir, releer: () => leer(() => true) };
}

type Documentos = ReturnType<typeof useDocumentosDelEspacio>;

function FilesSection({ docs, isAdmin, editMode }: { docs: Documentos; isAdmin: boolean; editMode: boolean }) {
  const { files, caraId, loading, error, setError } = docs;
  const [uploading, setUploading] = useState(false);
  // Declaración explícita de "esta imagen es la cara vigente" (fix H8, Fase
  // 3) — ya no se infiere de cuándo se sube, hay que marcarla a propósito.
  const [marcarComoCara, setMarcarComoCara] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleUpload(file: File) {
    const dot = file.name.lastIndexOf(".");
    const ext = dot >= 0 ? file.name.slice(dot).toLowerCase() : "";
    if (!ALLOWED_FILE_EXTS.includes(ext)) {
      setError("Formato no permitido (.pdf, .xls, .xlsx, .csv, .jpg, .jpeg, .png, .webp)");
      return;
    }
    if (marcarComoCara && !IMAGE_FILE_EXTS.includes(ext)) {
      setError("Sólo una imagen (JPG, PNG o WEBP) puede usarse como foto de la cara en el 3D.");
      return;
    }
    setUploading(true);
    setError("");
    try {
      const id = await docs.idParaEscribir();
      if (id == null) throw new Error("space unresolved");
      const subido = await uploadSpaceFile(id, file, marcarComoCara ? "cara" : undefined);
      docs.setFiles(await listSpaceFiles(id));
      if (marcarComoCara) docs.setCaraId(subido.id);
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
      docs.setFiles((prev) => prev.filter((f) => f.id !== fileId));
      if (caraId === fileId) docs.setCaraId(null);
    } catch {
      setError("No se pudo eliminar el archivo");
    }
  }

  return (
    <div
      className="p2-docs"
      data-archivos
      onDragOver={isAdmin && editMode ? (e) => e.preventDefault() : undefined}
      onDrop={isAdmin && editMode ? (e) => {
        e.preventDefault();
        const file = e.dataTransfer.files?.[0];
        if (file) void handleUpload(file);
      } : undefined}
    >
      {loading ? (
        <p className="p2-msj">Cargando…</p>
      ) : files.length === 0 ? (
        <p className="p2-msj">Sin archivos adjuntos.</p>
      ) : (
        files.map((f) => {
          const esLaCara = f.id === caraId;
          return (
            <div key={f.id} className="p2-doc" data-archivo={f.id} data-foto-de-la-cara={esLaCara || undefined}>
              <span className="p2-mini">
                {esLaCara
                  // La foto que pinta la cara en el 3D, en chiquito.
                  ? <img src={fileUrl(f.id)} alt="" />
                  : f.content_type.startsWith("image/") ? <ImageIcon {...ICONO} /> : <FileText {...ICONO} />}
              </span>
              <button type="button" className="p2-doc-abrir" onClick={() => window.open(fileUrl(f.id), "_blank")} title={f.filename}>
                <b>{f.filename}</b>
                <span className="mono">{esLaCara ? "Foto de la cara en el 3D · " : ""}{tamano(f.size)}</span>
              </button>
              {isAdmin && editMode ? (
                <button type="button" className="p2-icobtn chico" onClick={() => void handleDelete(f.id)}
                  title="Eliminar archivo" aria-label={`Eliminar ${f.filename}`}>
                  <X {...ICONO} />
                </button>
              ) : <span />}
            </div>
          );
        })
      )}
      {error && <p className="p2-msj mal">{error}</p>}
      {/* Subir y «Usar como foto…», como eliminar: sólo editando. En «Mirar»
          se miran los archivos y nada más. */}
      {isAdmin && editMode && (
        <div className="p2-subir">
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
          <button type="button" className="p2-btn" onClick={() => inputRef.current?.click()} disabled={uploading}>
            <ImageUp {...ICONO} /> {uploading ? "Subiendo…" : "Subir archivo"}
          </button>
          <label className="p2-ck"
            title="Sólo para una imagen (JPG, PNG o WEBP). Reemplaza a la foto de la cara anterior de este espacio.">
            <input type="checkbox" checked={marcarComoCara} onChange={(e) => setMarcarComoCara(e.target.checked)} data-usar-como-cara />
            Usar como foto de la cara en el 3D
          </label>
        </div>
      )}
    </div>
  );
}

/** Junta los sufijos de las partes para leerlos de corrido: EN1, EN2, EN3 y
 *  EN5 → «EN1–3 · EN5». */
function juntarSufijos(sufijos: string[]): string {
  const tramos: string[] = [];
  let i = 0;
  while (i < sufijos.length) {
    const m = /^(.*?)(\d+)$/.exec(sufijos[i]);
    if (!m) { tramos.push(sufijos[i]); i += 1; continue; }
    let j = i;
    while (j + 1 < sufijos.length) {
      const s = /^(.*?)(\d+)$/.exec(sufijos[j + 1]);
      if (!s || s[1] !== m[1] || Number(s[2]) !== Number(m[2]) + (j + 1 - i)) break;
      j += 1;
    }
    tramos.push(j > i ? `${sufijos[i]}–${Number(m[2]) + (j - i)}` : sufijos[i]);
    i = j + 1;
  }
  return tramos.join(" · ");
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

type PestanaDelPanel = "venta" | "medidas" | "documentos";

/**
 * El panel del mueble: el B de `docs/maquetas/rediseno-2026-10/panel-plano.html`
 * (aprobado el 2026-10-20). Arriba lo importante de un vistazo —el código con
 * su lápiz, «tipo · sede (candado) · pasillo», la pastilla del estado y una
 * franja con las medidas y lo vendido— y el resto en tres pestañas, según para
 * qué se abre: **Venta** (se vende, cómo, estado, lo contratado y «Vender»),
 * **Medidas** (ancho × prof. × alto, entrepaños con − y +, módulo) y
 * **Documentos** (los archivos, la foto de la cara en el 3D y la nota). Abre
 * SIEMPRE en Venta. Ninguna sección del panel de antes se perdió: cada una
 * está en una pestaña (`probar-plano`), con las mismas guardas.
 */
function AssignmentPanel({
  item, items, sede, editMode, isAdmin, initialFace, pasillo, porParticipacion: esPc = false, dispoDeCara,
  onUpdate, onRenombrar, onIntercambiar, onVender, onDelete, onDuplicate, onClose,
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
  /** La lista de sedes. Ya no la usa el panel (la «Sede» es de sólo lectura,
   *  fase 2 · I5); queda en el tipo para no tocar a quien lo llama. */
  sedes?: string[];
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
  /** «Vender»: Sede → Vender con esta cara (`pedirVender` del store). */
  onVender: (cara: "A" | "B") => void;
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
  // El mueble del store (con su alto, sus entrepaños y sus partes) y el mapa
  // CRUDO de la base: lo vendido de cada parte (vender una parte no cambia el
  // mueble fusionado).
  const muebleDelStore = useFixtureStore((s) => selectFixtures(s).find((f) => f.id === item.id));
  const estadoCrudo = useFixtureStore((s) => s.estadoComercial);
  const IconoDelTipo = iconoDelTipo(item.type);

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

  // ── Las pestañas: abre SIEMPRE en Venta (panel B), también al elegir otro mueble.
  const [pestana, setPestana] = useState<PestanaDelPanel>("venta");
  useEffect(() => { setPestana("venta"); }, [item.id]);

  // ── El nombre del mueble ──────────────────────────────────────────────────
  // Un mueble tiene UN nombre y es su código: el encabezado lo muestra y su
  // lápiz lo cambia (reemplaza a la sección «Nombre» de antes). Pasa por
  // `onRenombrar`, que llama a `renombrar` de `utils/nomenclatura.ts`: el mismo
  // camino que el doble clic sobre la caja.
  //
  // Se escribe en un borrador y se guarda al salir del campo o con Enter, no en
  // cada tecla. Escribiendo el nombre en el propio código, tecla a tecla, el
  // mueble pasaría por «I», «IM», «IMP-1»… y cualquiera de esos podría chocar o
  // quedarse guardado. Rechazar es no escribir, no borrar lo que había.
  const [editandoNombre, setEditandoNombre] = useState(false);
  const [nombreBorrador, setNombreBorrador] = useState(item.code);
  const [rechazo, setRechazo] = useState<RechazoDeNombre<PlacedItem2D> | null>(null);
  // Sólo al cambiar de mueble: mientras se escribe, el borrador manda.
  useEffect(() => {
    setNombreBorrador(item.code);
    setRechazo(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id, item.code]);
  useEffect(() => { setEditandoNombre(false); }, [item.id]);
  useEffect(() => { if (!editMode) setEditandoNombre(false); }, [editMode]);

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
    if (!r) { setNombreBorrador(normalizarNombre(nombreBorrador)); setEditandoNombre(false); }
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
  // color en el plano (`estadoParaPintar`): la pastilla y «Estado» dicen
  // «Tomada» o «Parcial» en ese color, y «Contratado» dice cuánto está
  // comprometido y cuánto queda (`textoDeLoComprometido`).
  const dispoPc = esPc ? (dispoDeCara?.(activeFace) ?? null) : null;
  const estadoVisto: SpaceStatus = estadoParaPintar(face.status, dispoPc);
  const rotuloVisto = rotuloPorOcupacion(face.status, dispoPc) ?? STATUS_LABELS[face.status];
  const abrirEnDistribucion = useAbrirEnDistribucion();

  // ── Lo vendido por partes, de la cara que se mira (o las piezas) ──────────
  const partesDeLaCara = useMemo(() => {
    if (!muebleDelStore) return [];
    const todas = partesConEstado(muebleDelStore, estadoCrudo, sede);
    const divisiones = todas.filter((p) => !p.pieza && p.sufijo.startsWith("B·") === (activeFace === "B"));
    return divisiones.length ? divisiones : todas.filter((p) => p.pieza);
  }, [muebleDelStore, estadoCrudo, sede, activeFace]);
  const vendidas = partesDeLaCara.filter((p) => p.vendida);
  const division = muebleDelStore ? divisionDe(muebleDelStore) : null;
  const sufijoCorto = (s: string) => s.replace(/^B·/, "");
  // «Vendido en parte»: algo vendido y algo libre (o una cara por
  // participación con algo comprometido y lugar). La pastilla lo dice con la
  // palabra de Supervisar; el color y la palabra de la ocupación siguen
  // mandando en todo lo demás.
  const enParte = rentable && face.status === "free"
    && ((vendidas.length > 0 && vendidas.length < partesDeLaCara.length) || dispoPc?.dispo === "parcial");

  // ── La franja de resumen ──────────────────────────────────────────────────
  const vista = muebleDelStore && TIPOS_CON_GEOMETRIA.has(muebleDelStore.type) ? geometriaALaVista(muebleDelStore) : null;
  const ancho = muebleDelStore?.w ?? item.w;
  const fondo = muebleDelStore?.d ?? item.h;
  const alto = muebleDelStore?.h ?? H_DEFAULTS[item.type];
  // Vendido por entrepaños, la franja los cuenta como se venden —con la base,
  // el EN1 (`divisionDe`/`cantidadDe`)—, la misma cuenta que «1 de 5
  // vendido» al lado. Antes decía «4 entrepaños · 1 de 5 vendido».
  const entrepanosDeLaFranja = division?.clase === "entrepanos" ? division.n : (vista?.entrepanos ?? 0);

  // ── Documentos: los archivos de la cara y su nota ─────────────────────────
  const docs = useDocumentosDelEspacio(activeCode, isAdmin, {
    name: catDef?.label ?? item.code, zone: item.type, sede: item.sede || sede,
    areaM2: parseFloat((item.w * item.h).toFixed(2)),
  });
  /** «Nota del contrato» con un contrato o una reserva vivos (la misma de
   *  Vender, que la base manda como `observation` sólo a quien administra);
   *  sin contrato, «Nota del espacio» (`spaces.notes`). El servidor la escribe
   *  donde la lee (`PUT /spaces/{id}/nota`). Antes este campo escribía la
   *  observación en el JSON del layout, que `PUT /layout` descarta: se veía
   *  cambiar y no se guardaba. */
  const conContrato = face.status === "occupied";
  const notaGuardada = (conContrato || face.status !== "free" ? face.observation : (docs.espacio?.notes ?? face.observation)) ?? "";
  const [nota, setNota] = useState(notaGuardada);
  const [notaError, setNotaError] = useState("");
  const [guardandoNota, setGuardandoNota] = useState(false);
  useEffect(() => { setNota(notaGuardada); setNotaError(""); }, [notaGuardada, activeCode]);

  async function guardarNota() {
    if (nota.trim() === notaGuardada.trim()) return;
    setGuardandoNota(true);
    setNotaError("");
    try {
      const id = await docs.idParaEscribir();
      if (id == null) throw new Error("space unresolved");
      const r = await guardarNotaDelEspacio(id, nota);
      if (r.donde === "espacio") docs.setEspacio((e) => (e ? { ...e, notes: r.nota || null } : e));
      // El mapa se pinta de la base: se vuelve a leer y la nota llega sola.
      await useFixtureStore.getState().refrescarComercial();
    } catch {
      setNotaError("No se pudo guardar la nota. Probá de nuevo.");
    } finally {
      setGuardandoNota(false);
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
   * y sin fechas — el fantasma exacto que todo esto vino a eliminar. Y desde el
   * rediseño (PR 3, decisión 1) tampoco «Reservado»: la reserva de verdad sale
   * de Vender, con proveedor y fecha, y el servidor rechaza la de a mano.
   */
  async function cambiarEstado(nuevo: "free" | "maintenance") {
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

  const botonVender = isAdmin && rentable && (
    <button type="button" className="p2-btn" data-vender onClick={() => onVender(activeFace)}
      title="Abre Vender (en la pantalla de la sede) con este espacio">
      <FilePenLine {...ICONO} /> Vender
    </button>
  );

  return (
    <div className="p2-ficha" data-panel-b>

      {/* El encabezado: el ícono del tipo, el código con su lápiz (el código
          ES el nombre), «tipo · sede (candado) · pasillo» y el estado. */}
      <div className="p2-ficha-h">
        <IconoDelTipo {...ICONO} />
        <div className="p2-ficha-t">
          <div className="p2-codigo">
            {editMode && editandoNombre ? (
              <input
                className="p2-codigo-campo"
                aria-label="El código del mueble"
                aria-invalid={choqueEscrito || rechazo ? true : undefined}
                value={nombreBorrador}
                onChange={(e) => { setNombreBorrador(e.target.value); setRechazo(null); }}
                onBlur={guardarNombre}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); guardarNombre(); }
                  if (e.key === "Escape") { setNombreBorrador(item.code); setRechazo(null); setEditandoNombre(false); }
                }}
                autoFocus
              />
            ) : (
              <h3 data-codigo-del-mueble title={activeCode}>{nombreDeMueble(item)}{activeFace === "B" && isDouble ? "-B" : ""}</h3>
            )}
            {editMode && !editandoNombre && (
              <button type="button" className="p2-icobtn chico" title="Cambiar el código" aria-label="Cambiar el código"
                onClick={() => { setNombreBorrador(item.code); setRechazo(null); setEditandoNombre(true); }}>
                <Pencil {...ICONO} />
              </button>
            )}
          </div>
          {/* La sede es de sólo lectura (fase 2 · I5, V16): la define el plano.
              Va con su candado en la línea, sin una sección entera para un dato
              que no se cambia. Para mover la sede entera: «Renombrar sede». */}
          <span className="p2-linea" data-linea-del-mueble>
            <span data-tipo-del-mueble>{conNombrePropio(item, nombresPropios, catDef?.label ?? "")}</span>
            <span aria-hidden>·</span>
            {/* La sede y su candado no se separan: si la línea no entra, baja
                el pasillo, nunca el candado solo. */}
            <span className="p2-sede-candado">
              <span className="mono" data-sede-del-plano title="La sede la define el plano: no se cambia acá">{sede}</span>
              <Lock size={12} strokeWidth={1.75} aria-label="sólo lectura" />
            </span>
            {/* Nadie dice «PUN-07» en una reunión: dice «la punta del pasillo 4».
                Sale de la geometría, así que mover el mueble lo actualiza solo. */}
            {pasillo !== undefined && <><span aria-hidden>·</span><span>pasillo {pasillo}</span></>}
          </span>
          {/* La ficha de la que nació, si nació de una: su nombre y, si sus
              medidas son una deducción, «≈». */}
          {modeloDelMueble && (
            <span className="p2-linea" data-modelo={modeloDelMueble.id} title={textoDeFuente(modeloDelMueble)}>
              {nombreDeModelo(modeloDelMueble)}
            </span>
          )}
        </div>
        <span className="p2-pill" data-estado-del-mueble
          style={{ ...(rentable ? STATUS_BADGE_STYLE[estadoVisto] : NON_RENTABLE_BADGE_STYLE), ...(enParte ? STATUS_BADGE_STYLE.reserved : {}) }}>
          {enParte ? "Vendido en parte" : <>{rentable ? rotuloVisto : NON_RENTABLE_LABEL}</>}
        </span>
        <button type="button" className="p2-icobtn chico" onClick={onClose} title="Cerrar" aria-label="Cerrar"><X {...ICONO} /></button>
      </div>

      {/* Lo que dice el código: el rechazo, el choque mientras se escribe, el
          gemelo guardado y el nombre de antes. */}
      {(editandoNombre || rechazo || choqueGuardado || viejo) && (
        <div className="p2-avisos" data-nombre-del-mueble>
          {rechazo ? (
            <>
              <p className="p2-msj mal">
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
                    type="button"
                    className="p2-btn peligro"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onIntercambiar(item.id, (rechazo as { ocupa: PlacedItem2D }).ocupa.id);
                      setRechazo(null);
                      setEditandoNombre(false);
                    }}
                  >
                    Intercambiar con ese mueble
                  </button>
                  <p className="p2-msj">
                    {textoDelIntercambio(item, (rechazo as { ocupa: PlacedItem2D }).ocupa)}
                  </p>
                </>
              )}
            </>
          ) : choqueEscrito ? (
            <p className="p2-msj mal">
              {textoDelChoque(nombreBorrador, choqueEscrito, (m) => conNombrePropio(m, nombresPropios, ""))}
            </p>
          ) : editandoNombre ? (
            <p className="p2-msj">
              Es el nombre y es la llave: con él se arma {fullCode} y con eso viaja
              al contrato, al correo de montaje y a la lámina.
            </p>
          ) : null}
          {/* Lo que ya estaba guardado así se avisa, nunca se bloquea. */}
          {!rechazo && !choqueEscrito && choqueGuardado && (
            <p className="p2-msj ojo">
              Ojo: otro mueble de esta sede también se llama «{normalizarNombre(item.code)}»
              {choqueGuardado.label ? ` (${conNombrePropio(choqueGuardado, nombresPropios, choqueGuardado.label)})` : ""}.
              {editMode ? " Renombrá uno de los dos para que un contrato pueda decir a cuál va." : ""}
            </p>
          )}
          {/* El nombre viejo. No se edita ni se dibuja: está para reconciliar con
              la cartelería de la tienda y con el papel que firmó el proveedor. */}
          {viejo && (
            <p className="p2-msj">
              Antes se llamaba «{viejo}». Es lo que puede seguir diciendo el cartel de
              la góndola y lo que vio quien negoció lo que ya está contratado.
            </p>
          )}
        </div>
      )}

      {/* Un mueble viejo que guardó otra sede: sus espacios (y los contratos
          que cuelgan de ellos) se siguen armando con ESA sede, y sus
          participaciones con la del plano. Se dice tal cual y, a quien
          administra, se le ofrece pasarlo a la del plano —lo vendido con el
          código viejo no se muda solo: se avisa antes—. Nunca otra sede. */}
      {item.sede && normalizeSede(item.sede) !== normalizeSede(sede) && (
        <p className="p2-msj ojo" data-sede-ajena>
          Este mueble guardó la sede «{item.sede}», que no es la de su plano: sus espacios se arman como
          «{fullCode}». Si es un error, pasalo a «{sede}»; lo vendido con «{fullCode}» no se muda solo.
          {editMode && isAdmin && (
            <button type="button" data-usar-sede-del-plano onClick={() => onUpdate({ sede })} className="p2-enlace" style={{ display: "block" }}>
              Usar la sede del plano
            </button>
          )}
        </p>
      )}

      {/* Las dos caras de una góndola doble. */}
      {isDouble && rentable && (
        <div className="p2-seg ancho" role="group" aria-label="Cara" data-caras>
          {(["A", "B"] as const).map((f) => (
            <button key={f} type="button" onClick={() => setActiveFace(f)} aria-pressed={activeFace === f}>
              Cara {f}
            </button>
          ))}
        </div>
      )}

      {/* La franja de resumen: se lee sin abrir nada. */}
      <div className="p2-resumen" data-resumen>
        <span><b>{metros(ancho)} × {metros(fondo)}{alto !== undefined ? ` × ${metros(alto)}` : ""}</b> m</span>
        {vista && <span><b>{entrepanosDeLaFranja}</b> {entrepanosDeLaFranja === 1 ? "entrepaño" : "entrepaños"}</span>}
        {rentable && partesDeLaCara.length > 0 ? (
          <span><b>{vendidas.length} de {partesDeLaCara.length}</b> vendid{division ? concordancia(division.clase).o : "o"}{vendidas.length === 1 ? "" : "s"}</span>
        ) : rentable && esPc && dispoPc ? (
          <span>{dispoPc.dispo === "parcial" ? "Vendido en parte · " : ""}<b>{textoCortoDeParticipacion(dispoPc, isAdmin)}</b></span>
        ) : null}
      </div>

      {/* Las tres pestañas. */}
      <div className="p2-seg ancho" role="tablist" aria-label="Qué mirar del mueble" data-pestanas>
        <button type="button" role="tab" aria-selected={pestana === "venta"} aria-pressed={pestana === "venta"} data-pestana="venta"
          onClick={() => setPestana("venta")}>
          <Handshake {...ICONO} /> Venta
        </button>
        <button type="button" role="tab" aria-selected={pestana === "medidas"} aria-pressed={pestana === "medidas"} data-pestana="medidas"
          onClick={() => setPestana("medidas")}>
          <Ruler {...ICONO} /> Medidas
        </button>
        <button type="button" role="tab" aria-selected={pestana === "documentos"} aria-pressed={pestana === "documentos"} data-pestana="documentos"
          onClick={() => setPestana("documentos")}>
          <FileText {...ICONO} /> Documentos {rentable && <span className="n">{docs.files.length}</span>}
        </button>
      </div>

      {/* ── VENTA: se vende, cómo, estado y lo contratado ─────────────────── */}
      {pestana === "venta" && (
        <div className="p2-pestana" role="tabpanel" data-pestana-venta>
          {/* Se vende = el destino del mueble. Salvo cuando el TIPO ya lo
              decide: una columna, una caja registradora y el mostrador de
              servicio al cliente son operación de la tienda y no se venden
              nunca. Ahí el interruptor sería un control muerto —se pintaría el
              elegido y `isRentable` lo seguiría negando—, así que en su lugar
              va la razón escrita. */}
          <FilaDelPanel k="Se vende" titulo="Destino del mueble" campo="destino">
            {NUNCA_ALQUILABLE.has(item.type) ? (
              <p className="p2-v">No comercializable</p>
            ) : editMode && isAdmin ? (
              <span className="p2-sw-fila">
                <button type="button" role="switch" className="p2-sw" aria-checked={rentable}
                  aria-label="Se vende (comercializable)"
                  onClick={() => onUpdate({ rentable: !rentable })} />
                <span className="p2-ayu">{rentable ? "Comercializable" : "No comercializable"}</span>
              </span>
            ) : (
              <p className="p2-v">{rentable ? "Comercializable" : "No comercializable"}</p>
            )}
            <p className="p2-msj">
              {NUNCA_ALQUILABLE.has(item.type)
                ? textoDeLoQueNuncaSeAlquila(item.type)
                : rentable
                ? "Se puede alquilar y cuenta en la disponibilidad de la sede."
                : "Mobiliario propio del local: no admite contrato y queda fuera de la ocupación."}
            </p>
          </FilaDelPanel>

          {/* El planograma (fase 2 de la distribución): repartir cada cara
              entre destinos —categorías, marca propia, promociones— y
              publicarlo por versiones. Un mueble interno, para todos (lo que
              hay que montar); uno que se vende, sólo administración (lo libre). */}
          {muebleDelStore && tieneSuperficie(muebleDelStore.type) && (
            <FilaDelPanel k="Planograma" titulo="Planograma de la cara" campo="planograma" bloque>
              <EntradaDelPlanograma sede={sede} fixtureId={item.id} caras={carasDe(muebleDelStore)} rentable={rentable} esAdmin={isAdmin} />
            </FilaDelPanel>
          )}

          {/* Vender por partes: la nevera entera o por puertas; el mural, la
              góndola, la nevera abierta y la de vegetales, por tramos; la
              góndola y la punta, por entrepaños; por participación; y las
              piezas de la caja (sus bahías de impulso) y de la columna (su
              forro), que no se venden enteras. El mismo componente que el
              Editor 3D (`components/PartesDelMueble.tsx`), con sus guardas. */}
          {vendePorPartes(item.type) && (
            <FilaDelPanel k="Cómo" titulo="Cómo se vende" campo="como" bloque>
              <PartesDelMueble id={item.id} puedeEditar={editMode && isAdmin} sinTitulo enElTema />
            </FilaDelPanel>
          )}

          {/* El estado del espacio: Disponible o Mantenimiento (decisión 1:
              sin «Reservado» a mano). Ocupado y reservado los ponen el
              contrato y la reserva: se leen y no se tocan. */}
          {rentable && (
            <FilaDelPanel k="Estado" titulo="Estado del espacio" campo="estado">
              {editMode && face.status !== "occupied" ? (
                <>
                  <div className="p2-seg" role="group" aria-label="Estado del espacio" data-estado-a-mano>
                    {ESTADOS_A_MANO.map((s) => (
                      <button key={s} type="button" aria-pressed={face.status === s} disabled={guardandoEstado}
                        onClick={() => { if (face.status !== s) void cambiarEstado(s); }}>
                        {STATUS_LABELS[s]}
                      </button>
                    ))}
                  </div>
                  {face.status === "reserved" ? (
                    <p className="p2-msj ojo" data-reservado-a-mano>
                      Está marcado «Reservado» a mano, sin proveedor ni fecha, y ya no se marca así:
                      pasalo a Disponible o reservalo de verdad en Vender. Está también en
                      Supervisar → Para revisar → Corregir.
                    </p>
                  ) : (
                    <p className="p2-msj">Ocupado y Reservado los ponen el contrato y la reserva, no se marcan a mano.</p>
                  )}
                  {estadoError && <p className="p2-msj mal">{estadoError}</p>}
                  {/* El estado de arriba es el de la base; el que se VE de una cara
                      por participación lo pone su ocupación. Se dice, para que el
                      «Disponible» del selector no se lea como «se puede vender». */}
                  {estadoVisto !== face.status && (
                    <p data-estado-por-ocupacion className="p2-msj">
                      {notaDeEstadoPorOcupacion(rotuloVisto)}
                    </p>
                  )}
                </>
              ) : (
                <p className="p2-v">
                  {rotuloVisto}
                  {face.status === "occupied" && (
                    <small>Lo pone el contrato o la reserva. Para liberarlo hay que cancelarlo.</small>
                  )}
                  {estadoVisto !== face.status && (
                    <small data-estado-por-ocupacion>Lo dice la ocupación de hoy de sus participaciones.</small>
                  )}
                </p>
              )}
            </FilaDelPanel>
          )}

          {/* Lo contratado, de sólo lectura ───────────────────────────────────
              El plano es el lugar del DISEÑO: qué mueble es, cuánto mide, dónde
              está, qué artes lleva. El contrato se hace en Sede → Vender, sobre
              el mapa y con la disponibilidad del periodo a la vista; «Vender» lo
              abre con este espacio. Qué está tomado y hasta cuándo, qué está
              libre, y nunca un monto. */}
          {rentable && (
            <div className="p2-vend" data-contratado>
              <p className="p2-rotulo">Contratado</p>
              {face.supplierName ? (
                <>
                  <div className="p2-vend-f">
                    <span className="p2-pill ocupado mono">{activeFace === "B" && isDouble ? `${item.code}-B` : item.code}</span>
                    <span>
                      <b style={{ color: "var(--ink-1)" }}>{face.supplierName}</b>
                      {face.brandCategory && <> · {face.brandCategory}</>}
                    </span>
                    {face.endDate && <span className="r">hasta {fechaEnCurso(face.endDate)}</span>}
                  </div>
                  {face.startDate && face.endDate && (
                    <>
                      <span className="p2-codigo-completo">{face.startDate} → {face.endDate}</span>
                      <DaysLeftStrip startDate={face.startDate} endDate={face.endDate} />
                    </>
                  )}
                </>
              ) : partesDeLaCara.length > 0 && vendidas.length > 0 ? (
                <>
                  {vendidas.map((p) => {
                    const e = estadoCrudo[p.codigo];
                    return (
                      <div key={p.codigo} className="p2-vend-f" data-parte-tomada={p.codigo}>
                        <span className="p2-pill ocupado mono">{sufijoCorto(p.sufijo)}</span>
                        <span>{e?.supplierName || "Tomada"}</span>
                        {e?.endDate && <span className="r">hasta {fechaEnCurso(e.endDate)}</span>}
                      </div>
                    );
                  })}
                  {vendidas.length < partesDeLaCara.length && (
                    <div className="p2-vend-f">
                      <span className="p2-pill libre mono">
                        {juntarSufijos(partesDeLaCara.filter((p) => !p.vendida).map((p) => sufijoCorto(p.sufijo)))}
                      </span>
                      <span>{partesDeLaCara.length - vendidas.length === 1 ? "libre" : "libres"}</span>
                    </div>
                  )}
                </>
              ) : esPc ? (
                <p data-contratado-por-participacion className="p2-msj" style={{ fontSize: "var(--t-xs)", color: "var(--ink-2)" }}>
                  {textoDeLoComprometido(dispoPc, isAdmin, { propio: face.status, conLugar: false })}
                </p>
              ) : (
                <p className="p2-msj">Sin contrato activo.</p>
              )}
              {isAdmin && esPc ? (
                <>
                  <p className="p2-msj">
                    {DONDE_SE_CARGAN}
                  </p>
                  <div className="p2-vend-f">
                    <button
                      type="button"
                      className="p2-btn"
                      onClick={() => abrirEnDistribucion(item.id, activeFace)}
                      title="Abre el Editor 3D en esta cara, en Distribución"
                    >
                      <Percent {...ICONO} /> Distribuir
                    </button>
                    {botonVender}
                  </div>
                </>
              ) : isAdmin && (
                <>
                  <div className="p2-vend-f">{botonVender}</div>
                  <p className="p2-msj">
                    Los contratos se hacen en <b style={{ color: "var(--ink-2)" }}>Sede → Vender</b>, sobre el
                    mapa y con la disponibilidad del periodo a la vista.
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── MEDIDAS: ancho × prof. × alto, entrepaños y módulo ─────────────── */}
      {pestana === "medidas" && (
        <div className="p2-pestana" role="tabpanel" data-pestana-medidas>
          {(() => {
            // Ancho y fondo: los del plano (`onUpdate`, como siempre). Para la
            // góndola y la punta van en la misma fila que el «Alto» del
            // componente de la geometría.
            const anchoYFondo = editMode ? (
              <>
                <label>
                  <span className="p2-campo-l">Ancho (m)</span>
                  <input type="number" className="p2-campo" step={0.05} min={0.25} aria-label="Ancho (m)"
                    value={item.w}
                    onChange={(e) => onUpdate({ w: parseFloat(e.target.value) || 0.25 })} />
                </label>
                <span className="p2-x" aria-hidden>×</span>
                <label>
                  <span className="p2-campo-l">Prof. (m)</span>
                  <input type="number" className="p2-campo" step={0.05} min={0.25} aria-label="Profundidad (m)"
                    value={item.h}
                    onChange={(e) => onUpdate({ h: parseFloat(e.target.value) || 0.25 })} />
                </label>
              </>
            ) : null;
            // Alto, entrepaños y módulo (góndola y punta). El plano no dibuja el
            // alto, pero acá es donde se arma la tienda: el mismo componente que
            // el Editor 3D, que escribe en el store después de revisar lo vendido
            // (`components/GeometriaDelMueble.tsx`): «Cambiar igual», lo vendido
            // no se mueve sin aviso.
            const conGeometria = item.type === "gondola_doble" || item.type === "gondola_mural" || item.type === "punta";
            return (
              <FilaDelPanel k="Medidas" titulo="Dimensiones · alto, entrepaños y módulo" campo="medidas" bloque>
                {!editMode && (
                  <p className="p2-v mono" data-dimensiones>
                    {metros(ancho)} × {metros(fondo)}{alto !== undefined ? ` × ${metros(alto)}` : ""} m
                  </p>
                )}
                {conGeometria ? (
                  <GeometriaDelMueble id={item.id} puedeEditar={editMode && isAdmin} enElTema antesDelAlto={anchoYFondo} />
                ) : anchoYFondo && (
                  <div className="p2-tri dos" data-medidas-en-fila>{anchoYFondo}</div>
                )}
              </FilaDelPanel>
            );
          })()}
        </div>
      )}

      {/* ── DOCUMENTOS: los archivos, la foto de la cara y la nota ─────────── */}
      {pestana === "documentos" && (
        <div className="p2-pestana" role="tabpanel" data-pestana-documentos>
          {/* Archivos — de la cara activa: cambiar de cara cambia la lista. */}
          {rentable ? (
            <FilesSection key={activeCode} docs={docs} isAdmin={isAdmin} editMode={editMode} />
          ) : (
            <p className="p2-msj">Un mueble que no se vende no lleva documentos.</p>
          )}
          {/* La nota: la del contrato (la misma de Vender) o, sin contrato, la
              del espacio. Texto libre de administración: el servidor no se la
              manda al trabajador, y acá tampoco se le muestra. */}
          {rentable && isAdmin && (
            <div className="p2-nota-c" data-nota-del-espacio>
              <label className="k" htmlFor={`nota-${item.id}`}>{conContrato ? "Nota del contrato" : "Nota del espacio"}</label>
              {editMode ? (
                <>
                  <textarea
                    id={`nota-${item.id}`}
                    className="p2-area"
                    maxLength={LARGO_DE_LA_NOTA}
                    placeholder={conContrato ? "Algo que el montaje tenga que saber" : "Notas del espacio"}
                    value={nota}
                    disabled={guardandoNota}
                    onChange={(e) => setNota(e.target.value)}
                    onBlur={() => void guardarNota()}
                  />
                  <span className="p2-cuenta-nota">{nota.length}/{LARGO_DE_LA_NOTA}</span>
                </>
              ) : (
                <p className="p2-v" style={{ whiteSpace: "pre-wrap" }}>{nota || <span style={{ color: "var(--ink-3)" }}>—</span>}</p>
              )}
              {notaError && <p className="p2-msj mal">{notaError}</p>}
              <p className="p2-msj">
                Es la misma nota del contrato de Vender. Sin contrato, es la nota del espacio. Sólo la ven los administradores.
              </p>
            </div>
          )}
        </div>
      )}

      {/* El código completo y las acciones (admin, editando) */}
      <div className="p2-pie-ficha">
        <span className="p2-codigo-completo" data-codigo-completo>{activeCode}</span>
        {editMode && isAdmin && (
          <div className="p2-acciones">
            <button type="button" className="p2-btn" onClick={onDuplicate}>
              <Copy {...ICONO} /> Duplicar
            </button>
            <button type="button" className="p2-btn peligro" onClick={onDelete}>
              <Trash2 {...ICONO} /> Eliminar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Lo que se marca a mano en «Estado» (decisión 1: sin «Reservado»). */
const ESTADOS_A_MANO = ["free", "maintenance"] as const;

/** El largo de la nota, el mismo que la observación de Vender. */
const LARGO_DE_LA_NOTA = 500;

/** Un renglón del panel B: el rótulo a la izquierda y el control a la
 *  derecha (o debajo, `bloque`, para lo que necesita el ancho). */
function FilaDelPanel({ k, titulo, campo, bloque = false, children }: {
  k: string; titulo?: string; campo?: string; bloque?: boolean; children: React.ReactNode;
}) {
  return (
    <div className="p2-kv" data-campo={campo} data-bloque={bloque || undefined}>
      <span className="k" title={titulo}>{k}</span>
      <div className="v">{children}</div>
    </div>
  );
}

// (no localStorage loader — state is initialized from the unified Zustand store)
