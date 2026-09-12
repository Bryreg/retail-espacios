import type {
  DisplayBounds,
  DisplayZone,
  DisplayMargins,
  FixtureFaceId,
  FixturePlanogram,
  Product,
  ProductPlacement,
  Shelf,
} from "../types/retail3d";

/** Tablero metálico y tolerancia de apoyo usados por el renderer de góndola. */
const SHELF_SURFACE_OFFSET = 0.013;
const STRUCTURAL_TOP_CLEARANCE = 0.08;
const STRUCTURAL_SIDE_CLEARANCE = 0.02;
const STRUCTURAL_FRONT_CLEARANCE = 0.015;
const STRUCTURAL_BACK_CLEARANCE = 0.015;
const DEFAULT_PRODUCT_GAP = 0.004;

export interface ShelfCapacity {
  facings: number;
  rows: number;
  capacity: number;
  occupiedWidth: number;
}

export interface PlacementOptions {
  fixtureId: string;
  faceId: FixtureFaceId;
  shelf: Shelf;
  product: Product;
  quantity?: number;
  lateralMargin?: number;
  frontMargin?: number;
  gap?: number;
  displayZone?: DisplayZone;
}

export interface PlacementValidation {
  valid: boolean;
  reason?: string;
}

const EMPTY_CAPACITY: ShelfCapacity = { facings: 0, rows: 0, capacity: 0, occupiedWidth: 0 };

export function createShelfDisplayZone(
  shelf: Pick<Shelf, "id" | "fixtureId" | "faceId" | "width" | "depth" | "elevation" | "clearance">,
  options: {
    lateralMargin?: number;
    frontMargin?: number;
    backMargin?: number;
    topMargin?: number;
    bottomMargin?: number;
  } = {},
): DisplayZone {
  const lateralMargin = Math.max(0, options.lateralMargin ?? STRUCTURAL_SIDE_CLEARANCE);
  const frontMargin = Math.max(0, options.frontMargin ?? STRUCTURAL_FRONT_CLEARANCE);
  const backMargin = Math.max(0, options.backMargin ?? STRUCTURAL_BACK_CLEARANCE);
  const topMargin = Math.max(0, options.topMargin ?? 0);
  const bottomMargin = Math.max(0, options.bottomMargin ?? 0);
  const width = Math.max(0, shelf.width - lateralMargin * 2);
  const depth = Math.max(0, shelf.depth - frontMargin - backMargin);
  const height = Math.max(0, shelf.clearance - topMargin - bottomMargin);
  const minX = -shelf.width / 2 + lateralMargin;
  const maxX = shelf.width / 2 - lateralMargin;
  const minY = shelf.elevation + SHELF_SURFACE_OFFSET + bottomMargin;
  const maxY = minY + height;
  const minZ = -shelf.depth / 2 + backMargin;
  const maxZ = shelf.depth / 2 - frontMargin;

  const bounds: DisplayBounds = { width, height, depth, minX, maxX, minY, maxY, minZ, maxZ };
  const margins: DisplayMargins = {
    left: lateralMargin, right: lateralMargin, top: topMargin, bottom: bottomMargin,
    front: frontMargin, back: backMargin,
  };

  return {
    id: `${shelf.id}:ZONE`, fixtureId: shelf.fixtureId, faceId: shelf.faceId, type: "shelf",
    bounds, margins,
    productRules: {
      orientation: "front", allowMultipleRows: true, allowMultipleColumns: true, minimumGap: DEFAULT_PRODUCT_GAP,
    },
    shelfId: shelf.id, supportSurfaceY: minY,
  };
}

export function calculateShelfCapacity(
  shelf: Pick<Shelf, "width" | "depth" | "clearance">,
  product: Pick<Product, "width" | "depth" | "height">,
  { lateralMargin = STRUCTURAL_SIDE_CLEARANCE, frontMargin = STRUCTURAL_FRONT_CLEARANCE, gap = DEFAULT_PRODUCT_GAP } = {},
): ShelfCapacity {
  if (
    shelf.width <= 0 || shelf.depth <= 0 || shelf.clearance <= 0 ||
    product.width <= 0 || product.depth <= 0 || product.height <= 0
  ) return EMPTY_CAPACITY;

  const zoneWidth = shelf.width - lateralMargin * 2;
  const zoneDepth = shelf.depth - frontMargin * 2;
  if (zoneWidth <= 0 || zoneDepth <= 0 || product.height > shelf.clearance) return EMPTY_CAPACITY;

  const safeGap = Math.max(0, gap);
  const facings = Math.floor((zoneWidth + safeGap) / (product.width + safeGap));
  const rows = Math.floor((zoneDepth + safeGap) / (product.depth + safeGap));
  if (facings <= 0 || rows <= 0) return EMPTY_CAPACITY;

  return {
    facings, rows, capacity: facings * rows,
    occupiedWidth: facings * product.width + Math.max(0, facings - 1) * safeGap,
  };
}

export function canFitProduct(zone: DisplayZone, product: Pick<Product, "width" | "height" | "depth">): boolean {
  if (
    product.width <= 0 || product.height <= 0 || product.depth <= 0 ||
    zone.bounds.width <= 0 || zone.bounds.height <= 0 || zone.bounds.depth <= 0
  ) return false;
  return product.width <= zone.bounds.width && product.height <= zone.bounds.height && product.depth <= zone.bounds.depth;
}

export function validateProductPlacement(
  zone: DisplayZone,
  product: Pick<Product, "width" | "height" | "depth">,
  placement: Pick<ProductPlacement, "position" | "scale">,
): PlacementValidation {
  const scale = placement.scale ?? [1, 1, 1];
  const width = Math.abs(product.width * scale[0]);
  const height = Math.abs(product.height * scale[1]);
  const depth = Math.abs(product.depth * scale[2]);
  if (!canFitProduct(zone, { width, height, depth })) return { valid: false, reason: "product_exceeds_display_zone" };

  const [x, y, z] = placement.position;
  const minX = x - width / 2;
  const maxX = x + width / 2;
  const minY = y - height / 2;
  const maxY = y + height / 2;
  const minZ = z - depth / 2;
  const maxZ = z + depth / 2;
  const { bounds } = zone;

  if (minX < bounds.minX || maxX > bounds.maxX) return { valid: false, reason: "placement_exceeds_width" };
  if (minY < bounds.minY || maxY > bounds.maxY) return { valid: false, reason: "placement_exceeds_height" };
  if (minZ < bounds.minZ || maxZ > bounds.maxZ) return { valid: false, reason: "placement_exceeds_depth" };
  return { valid: true };
}

export function generateProductPlacements(options: PlacementOptions): ProductPlacement[] {
  const {
    fixtureId, faceId, shelf, product, quantity,
    lateralMargin = STRUCTURAL_SIDE_CLEARANCE,
    frontMargin = STRUCTURAL_FRONT_CLEARANCE,
    gap = DEFAULT_PRODUCT_GAP,
    displayZone = createShelfDisplayZone(shelf, { lateralMargin, frontMargin, backMargin: frontMargin }),
  } = options;
  const capacity = calculateShelfCapacity(shelf, product, { lateralMargin, frontMargin, gap });
  if (capacity.capacity === 0) return [];

  const count = Math.min(Math.max(0, quantity ?? capacity.capacity), capacity.capacity);
  const placements: ProductPlacement[] = [];
  for (let index = 0; index < count; index += 1) {
    const row = Math.floor(index / capacity.facings);
    const facing = index % capacity.facings;
    const placement: ProductPlacement = {
      id: `${shelf.id}:${product.id}:${row}:${facing}`,
      productId: product.id, fixtureId, faceId, shelfId: shelf.id, displayZoneId: displayZone.id,
      position: [
        displayZone.bounds.minX + product.width / 2 + facing * (product.width + gap),
        displayZone.bounds.minY + product.height / 2,
        displayZone.bounds.minZ + product.depth / 2 + row * (product.depth + gap),
      ],
      rotation: [0, 0, 0], scale: [1, 1, 1], facings: capacity.facings, quantity: count,
      row, depthIndex: row, renderMode: product.modelUrl ? "MODEL_3D" : "PRODUCT_2_5D",
    };
    if (validateProductPlacement(displayZone, product, placement).valid) placements.push(placement);
  }
  return placements;
}

export function createGondolaPlanogram(input: {
  fixtureId: string;
  width: number;
  depth: number;
  height: number;
  doubleSided: boolean;
}): FixturePlanogram {
  const safeWidth = Math.max(0.1, input.width);
  const safeDepth = Math.max(0.2, input.depth);
  const safeHeight = Math.max(0.5, input.height);
  const levels = Math.max(4, Math.round((safeHeight - 0.18) / 0.34));
  // El último nivel se deja a una distancia física del remate superior. Así
  // todas las zonas tienen un límite superior real y la última no depende de
  // un clearance mágico que permita al producto atravesar la estructura.
  const topShelfElevation = Math.max(0.20, safeHeight - 0.30);
  const elevations = Array.from(
    { length: levels },
    (_, index) => 0.14 + index * ((topShelfElevation - 0.14) / Math.max(levels - 1, 1)),
  );
  const faces: FixtureFaceId[] = input.doubleSided ? ["A", "B"] : ["A"];
  const products: Product[] = [
    { id: "demo-cereal", name: "Cereal integral", width: 0.095, height: 0.22, depth: 0.055, color: "#d97732", sku: "DEM-CER-01" },
    { id: "demo-bebida", name: "Bebida natural", width: 0.065, height: 0.24, depth: 0.07, color: "#2f7f72", sku: "DEM-BEB-01" },
  ];
  const shelves = faces.flatMap((faceId) => elevations.map((elevation, index) => {
    const nextElevation = index < levels - 1 ? elevations[index + 1] : safeHeight - STRUCTURAL_TOP_CLEARANCE;
    const clearance = Math.max(0, nextElevation - elevation - 0.03);
    return {
      id: `${input.fixtureId}-${faceId}-SH${String(index + 1).padStart(2, "0")}`,
      fixtureId: input.fixtureId, faceId, index,
      width: Math.max(0.05, safeWidth - 0.09),
      depth: Math.max(0.18, safeDepth / (input.doubleSided ? 2 : 1) - 0.045),
      elevation, clearance, priceRail: true,
    };
  }));
  const displayZones = shelves.map((shelf) => createShelfDisplayZone(shelf));
  const zonesByShelfId = new Map(displayZones.map((zone) => [zone.shelfId, zone]));
  const placements = shelves.flatMap((shelf, index) => {
    const displayZone = zonesByShelfId.get(shelf.id);
    if (!displayZone) return [];
    return generateProductPlacements({
      fixtureId: input.fixtureId, faceId: shelf.faceId, shelf, displayZone,
      product: products[index % products.length], quantity: Math.min(12, index % 2 === 0 ? 10 : 8),
    });
  });
  return {
    version: 1,
    faces: faces.map((id) => ({ id, fixtureId: input.fixtureId, direction: id === "A" ? "front" : "back" })),
    shelves, displayZones, products, placements,
  };
}
