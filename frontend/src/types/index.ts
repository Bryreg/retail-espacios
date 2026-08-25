export type SpaceStatus = "free" | "occupied" | "reserved" | "maintenance";

// Derived display status (computed from lease dates, not stored in DB)
export type DisplayStatus = "disponible" | "vigente" | "por_vencer" | "vencido";

export interface Supplier {
  id: number;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
}

export interface Lease {
  id: number;
  space_id: number;
  supplier_id: number;
  supplier: Supplier;
  marca: string | null;
  start_date: string;
  end_date: string;
  monthly_rent: number;
  is_active: boolean;
  notes: string | null;
  /** A quién se le avisó. Sólo viene al CREAR el contrato. */
  avisos?: AvisosContrato | null;
}

/** Lo que el servidor encoló al guardar un contrato. */
export interface AvisosContrato {
  smtp_listo: boolean;
  comercial: string[];
  montaje: string[];
  proveedor: string[];
}

export interface Space {
  id: number;
  code: string;
  svg_id: string;
  name: string;
  zone: string;
  sede: string | null;
  area_m2: number;
  status: SpaceStatus;
  notes: string | null;
  active_lease: Lease | null;
  /** El firmado que todavía no arranca. Separado de `active_lease` para que lo
   *  comprometido nunca se cuente como lo que está facturando. */
  upcoming_lease?: Lease | null;
}

export interface SpaceMapItem {
  svg_id: string;
  status: SpaceStatus;
  name: string;
  supplier_name: string | null;
}

export type ZoneType =
  | "gondola"
  | "punta_gondola"
  | "robatope"
  | "ristra"
  | "cross"
  | "metro_cuadrado"
  | "mueble"
  | "promo"
  | "refrigerator"
  | "register"
  | "specialty"
  | "infrastructure";

export interface ZoneDef {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  selectable: boolean;
  type: ZoneType;
}
