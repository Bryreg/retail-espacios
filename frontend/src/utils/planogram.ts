import type { FixtureFaceId, FixturePlanogram, Product, ProductPlacement, Shelf } from "../types/retail3d";

/** Tablero metálico y holgura de apoyo usados por el renderer de góndola. */
const SHELF_SURFACE_OFFSET = 0.013;

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
}

/** Calcula la capacidad física respetando dimensiones libres, márgenes y gap. */
export function calculateShelfCapacity(
  shelf: Pick<Shelf, "width" | "depth" | "clearance">,
  product: Pick<Product, "width" | "depth" | "height">,
  { lateralMargin = 0.02, frontMargin = 0.015, gap = 0.004 } = {},
): ShelfCapacity {
  if (product.width <= 0 || product.depth <= 0 || product.height <= 0 || product.height > shelf.clearance) {
    return { facings: 0, rows: 0, capacity: 0, occupiedWidth: 0 };
  }
  const availableWidth = Math.max(0, shelf.width - lateralMargin * 2);
  const availableDepth = Math.max(0, shelf.depth - frontMargin * 2);
  const facings = Math.max(0, Math.floor((availableWidth + gap) / (product.width + gap)));
  const rows = Math.max(0, Math.floor((availableDepth + gap) / (product.depth + gap)));
  return { facings, rows, capacity: facings * rows, occupiedWidth: facings * product.width + Math.max(0, facings - 1) * gap };
}

/** Genera placements deterministas: X se reparte en facings, Z en filas y Y queda sobre el shelf. */
export function generateProductPlacements(options: PlacementOptions): ProductPlacement[] {
  const { fixtureId, faceId, shelf, product, quantity, lateralMargin = 0.02, frontMargin = 0.015, gap = 0.004 } = options;
  const capacity = calculateShelfCapacity(shelf, product, { lateralMargin, frontMargin, gap });
  const count = Math.min(quantity ?? capacity.capacity, capacity.capacity);
  return Array.from({ length: count }, (_, index) => {
    const row = Math.floor(index / capacity.facings);
    const facing = index % capacity.facings;
    return {
      id: `${shelf.id}:${product.id}:${row}:${facing}`,
      productId: product.id, fixtureId, faceId, shelfId: shelf.id,
      position: [
        -shelf.width / 2 + lateralMargin + product.width / 2 + facing * (product.width + gap),
        // El centro queda por encima de la cara superior del tablero, nunca
        // atravesándolo. La constante incluye medio espesor y tolerancia.
        shelf.elevation + SHELF_SURFACE_OFFSET + product.height / 2,
        -shelf.depth / 2 + frontMargin + product.depth / 2 + row * (product.depth + gap),
      ],
      rotation: [0, 0, 0], scale: [1, 1, 1], facings: capacity.facings,
      quantity: count, row, depthIndex: row, renderMode: product.modelUrl ? "MODEL_3D" : "PRODUCT_2_5D",
    };
  });
}

/** Planograma inicial paramétrico para góndola/mural, sin meter reglas visuales en el tipo de fixture. */
export function createGondolaPlanogram(input: { fixtureId: string; width: number; depth: number; height: number; doubleSided: boolean }): FixturePlanogram {
  const levels = Math.max(4, Math.round((input.height - 0.18) / 0.34));
  const elevations = Array.from({ length: levels }, (_, index) => 0.14 + index * ((input.height - 0.30) / Math.max(levels - 1, 1)));
  const faces: FixtureFaceId[] = input.doubleSided ? ["A", "B"] : ["A"];
  const products: Product[] = [
    { id: "demo-cereal", name: "Cereal integral", width: 0.095, height: 0.22, depth: 0.055, color: "#d97732", sku: "DEM-CER-01" },
    { id: "demo-bebida", name: "Bebida natural", width: 0.065, height: 0.24, depth: 0.07, color: "#2f7f72", sku: "DEM-BEB-01" },
  ];
  const shelves = faces.flatMap(faceId => elevations.map((elevation, index) => ({
    id: `${input.fixtureId}-${faceId}-SH${String(index + 1).padStart(2, "0")}`,
    fixtureId: input.fixtureId, faceId, index, width: input.width - 0.09,
    depth: Math.max(0.18, input.depth / (input.doubleSided ? 2 : 1) - 0.045), elevation,
    clearance: index === levels - 1 ? 0.34 : elevations[index + 1] - elevation - 0.03, priceRail: true,
  })));
  const placements = shelves.flatMap((shelf, index) => generateProductPlacements({
    fixtureId: input.fixtureId, faceId: shelf.faceId, shelf,
    product: products[index % products.length], quantity: Math.min(12, index % 2 === 0 ? 10 : 8),
  }));
  return { version: 1, faces: faces.map(id => ({ id, fixtureId: input.fixtureId, direction: id === "A" ? "front" : "back" })), shelves, products, placements };
}
