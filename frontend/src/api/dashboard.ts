import client from "./client";

export interface TopSupplier {
  name: string;
  leases: number;
  revenue: number;
}

export interface KpiData {
  total_spaces: number;
  occupied: number;
  free: number;
  reserved: number;
  maintenance: number;
  monthly_revenue: number;
  expiring_soon: number;
  top_suppliers: TopSupplier[];
}

export interface SpaceLeaseSummary {
  supplier: string | null;
  start_date: string | null;
  end_date: string | null;
  days_remaining: number | null;
  monthly_rent: number | null;
}

export interface SpaceOccupancy {
  id: number;
  code: string;
  name: string;
  zone: string;
  status: "free" | "occupied" | "reserved" | "maintenance";
  unauthorized: boolean;
  lease: SpaceLeaseSummary | null;
}

export const getKpis = (): Promise<KpiData> =>
  client.get<KpiData>("/dashboard/kpis").then((r) => r.data);

export const getSpaces = (): Promise<SpaceOccupancy[]> =>
  client.get<SpaceOccupancy[]>("/dashboard/spaces").then((r) => r.data);

// ─── Ocupación real vs esperada (GET /dashboard/ocupacion) ────────────────

/** Agregado de una sede para el período pedido.
 *
 *  `ingreso_contratado` / `ingreso_a_referencia` sólo viajan para admin — la
 *  CLAVE está AUSENTE del objeto para worker, nunca en `null`. Por eso son
 *  opcionales acá y el consumidor debe chequear presencia
 *  (`"ingreso_contratado" in fila`), nunca `!== null`: un admin sin tarifa de
 *  referencia configurada también puede dar un número en 0, y eso no
 *  significa "sos worker". Ver
 *  `features/vitrinas-3d/outputs/builder-rates-api.md`. */
export interface OcupacionSede {
  sede: string;
  /** Por CARA comercializable, no por mueble — una góndola doble suma dos. */
  caras_comercializables: number;
  /** Caras con algún contrato activo que toca el período pedido. */
  contratadas: number;
  /** De las contratadas, cuántas tienen el ÚLTIMO reporte de montaje en "montado". */
  montadas: number;
  /** Caras cuyo último contrato ya venció, mirado desde el final del período. */
  vencidas: number;
  /** contratadas / caras_comercializables × 100, redondeado a 1 decimal. */
  ocupacion_esperada_pct: number;
  /** montadas / caras_comercializables × 100 — MISMO denominador que la esperada. */
  ocupacion_real_pct: number;
  /** admin only: DEVENGADO PRORRATEADO del período — suma, sobre los contratos
   *  que tocan `[desde, hasta]`, de `monthly_rent / 30 × días de intersección`
   *  (inclusiva en los dos extremos). NO es el canon mensual completo: un
   *  contrato de 6 días dentro de un período de 30 aporta 6/30 de su canon, no
   *  el mes entero. Distinto de "Canon vigente" (la franja de arriba, que
   *  siempre es HOY sin prorratear) — no comparar ni sumar ambas cifras. */
  ingreso_contratado?: number;
  /** admin only: mismo prorrateo `/30 × días`, aplicado a la tarifa de
   *  referencia de TODAS las caras comercializables (contratadas o no) — el
   *  techo de P&L del período si todo se hubiera vendido a tarifa de lista.
   *  Con el prorrateo puede quedar por DEBAJO del ingreso contratado según el
   *  período (p. ej. un contrato corto a tarifa alta dentro de un rango
   *  largo) — no asumir que "a referencia" es siempre el mayor de los dos. */
  ingreso_a_referencia?: number;
}

export interface OcupacionParams {
  /** Sin esto, todas las sedes con plano guardado. */
  sede?: string;
  /** YYYY-MM-DD. Van los dos juntos o ninguno — sin ninguno, el período es HOY. */
  desde?: string;
  hasta?: string;
}

/** GET /dashboard/ocupacion — ocupación esperada vs real, agregada por sede.
 *
 *  El backend responde SIEMPRE una lista — una fila por sede con
 *  `layout_snapshots` guardado — aunque `sede` filtre a como mucho una. No es
 *  el objeto singular `{ sede, caras_comercializables, ... }` que sugiere la
 *  redacción original del contrato de esta feature: fue una desviación
 *  deliberada del builder de backend, documentada en
 *  `features/vitrinas-3d/outputs/builder-rates-api.md` — "agregado por sede"
 *  es naturalmente un agrupamiento y el Dashboard sin filtro necesita las N
 *  sedes en una sola llamada.
 *
 *  Degrada con gracia si el endpoint todavía no existe: un 404 vuelve `null`
 *  en vez de propagar el error, para que la sección pueda ocultarse sin
 *  romper el resto del Dashboard mientras ese endpoint no esté desplegado. */
export const getOcupacion = (params: OcupacionParams = {}): Promise<OcupacionSede[] | null> =>
  client
    .get<OcupacionSede[]>("/dashboard/ocupacion", { params })
    .then((r) => r.data)
    .catch((err) => {
      if (err?.response?.status === 404) return null;
      throw err;
    });
