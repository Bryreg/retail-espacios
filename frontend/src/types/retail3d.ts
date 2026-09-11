/**
 * Dominio de visual merchandising. Todas las dimensiones y coordenadas están
 * expresadas en metros; no contiene geometría de Three.js para poder usarlo en
 * planogramas, importadores y el editor 2D sin acoplarlos al renderer.
 */
import type { SpaceStatus } from "./fixtures";

export type ProductRenderMode = "IMAGE_2D" | "PRODUCT_2_5D" | "MODEL_3D";
export type FixtureFaceId = "A" | "B";

export interface SupplierRef { id?: string; name: string; }
export interface Brand { id: string; name: string; supplierId?: string; }
export interface ProductCategory { id: string; name: string; parentId?: string; }

export interface Product {
  id: string;
  name: string;
  brand?: Brand;
  category?: ProductCategory;
  supplier?: SupplierRef;
  width: number;
  height: number;
  depth: number;
  frontImageUrl?: string;
  sideImageUrl?: string;
  modelUrl?: string;
  sku?: string;
  price?: number;
  color?: string;
  metadata?: Record<string, string | number | boolean>;
}

export interface FixtureFace {
  id: FixtureFaceId;
  fixtureId: string;
  direction: "front" | "back";
  commercialStatus?: SpaceStatus;
}

export interface Shelf {
  id: string;
  fixtureId: string;
  faceId: FixtureFaceId;
  index: number;
  width: number;
  depth: number;
  elevation: number;
  clearance: number;
  priceRail: boolean;
}

export interface CommercialSpace {
  id: string;
  fixtureId: string;
  faceId: FixtureFaceId;
  shelfId?: string;
  status: SpaceStatus;
  supplierName?: string;
  brandName?: string;
  value?: number;
  startsAt?: string;
  endsAt?: string;
}

export interface ProductPlacement {
  id: string;
  productId: string;
  fixtureId: string;
  faceId: FixtureFaceId;
  shelfId: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  facings: number;
  quantity: number;
  row: number;
  depthIndex: number;
  renderMode?: ProductRenderMode;
}

/** Datos de planograma opcionales y aditivos del fixture persistido. */
export interface FixturePlanogram {
  version: 1;
  faces: FixtureFace[];
  shelves: Shelf[];
  products: Product[];
  placements: ProductPlacement[];
  commercialSpaces?: CommercialSpace[];
}
