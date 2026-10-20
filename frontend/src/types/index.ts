export type SpaceStatus = "free" | "occupied" | "reserved" | "maintenance";

// Derived display status (computed from lease dates, not stored in DB)
export type DisplayStatus = "disponible" | "vigente" | "por_vencer" | "vencido";

/**
 * Un proveedor.
 *
 * **Los datos de contacto sólo llegan si la sesión es de admin.** El servidor
 * no los redacta a `null`: devuelve otro esquema, con `id` y `name` y nada más
 * (`SupplierPublicOut`). Por eso van opcionales acá — el tipo dice la verdad, y
 * obliga a contemplar que no estén en vez de dejar que alguien escriba
 * `s.phone.slice(...)` y le explote en la pantalla de un mercaderista.
 *
 * Son datos personales de un tercero, con la Ley 1581 encima, y a quien monta
 * una exhibición no le hacen falta.
 */
export interface Supplier {
  id: number;
  name: string;
  contact_name?: string | null;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
}

/** El proveedor tal como viaja ANIDADO en un contrato: siempre recortado, para
 *  todos los roles. Quien necesita el contacto lo pide por `/suppliers/{id}`. */
export type SupplierPublico = Pick<Supplier, "id" | "name">;

export interface Lease {
  id: number;
  space_id: number;
  supplier_id: number;
  supplier: SupplierPublico;
  marca: string | null;
  start_date: string;
  end_date: string;
  /** `null` para un mercaderista: el valor negociado no sale de la
   *  administración. */
  monthly_rent: number | null;
  is_active: boolean;
  /** `null` para un mercaderista. Es texto libre, y ahí es donde alguien
   *  escribe «descuento del 25% cerrado por teléfono»: tachar el número y
   *  dejar pasar la nota deja la plata fugándose en castellano. */
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
  /** Los contratos cuyo aviso de montaje NO salió al guardar: espera la
   *  planometría (que se carga en Supervisar) o, en un porcentaje de cara, la
   *  distribución confirmada (`docs/rediseno/vender-api.md` §4). */
  montaje_pendiente?: number[];
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
