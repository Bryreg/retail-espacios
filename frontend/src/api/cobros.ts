import client from "./client";

/**
 * Los contratos que se cobran por un % de las ventas, y sus cortes
 * (`docs/rediseno/vender-api.md` §3). Todo de ADMINISTRACIÓN: es plata y lleva
 * el nombre del proveedor.
 *
 * Lo lee Supervisar —«Ventas por cargar» en «Para revisar» y la nota del canon
 * vigente («+ 2 por % de venta»)— y NADA de Vender: Vender la mira el
 * proveedor y esto trae lo que pagan los demás. `probar-vender` falla si un
 * archivo de Vender, o la parte de `DashboardView` que Vender dibuja, llega a
 * este módulo.
 */

/** Un corte vencido sin cargar: lo vendido en ese período todavía no se escribió. */
export interface CortePendiente {
  lease_id: number;
  /** El código completo del espacio (`SEDE-CODE[-B][-PARTE]`). */
  espacio: string;
  proveedor: string | null;
  /** El % de las ventas que se cobra (8 = 8 %). */
  porcentaje: number;
  periodo_desde: string;
  periodo_hasta: string;
}

/** Un corte ya cargado. */
export interface CorteCargado {
  periodo_desde: string;
  periodo_hasta: string;
  ventas: number;
  monto: number;
  cargado_en: string | null;
  cargado_por: string | null;
}

/** Un contrato que se cobra por ventas, con sus cortes y el próximo. */
export interface CobroPorVentas {
  lease_id: number;
  espacio: string;
  sede: string;
  proveedor: string | null;
  marca: string | null;
  desde: string;
  hasta: string;
  porcentaje: number;
  corte: "mensual" | "al_final";
  cortes: CorteCargado[];
  cobrado: number;
  proximo_corte: { periodo_desde: string; periodo_hasta: string } | null;
}

/** `GET /api/cobros/pendientes?sede=`: los cortes vencidos sin cargar, del más viejo al más nuevo. */
export const cortesPendientes = (sede: string): Promise<CortePendiente[]> =>
  client.get<CortePendiente[]>("/cobros/pendientes", { params: { sede } }).then((r) => r.data);

/** `GET /api/cobros?sede=`: por contrato, el porcentaje, los cortes cargados y el próximo. */
export const cobrosPorVentas = (sede: string): Promise<CobroPorVentas[]> =>
  client.get<CobroPorVentas[]>("/cobros", { params: { sede } }).then((r) => r.data);

/** `POST /api/cobros/{lease_id}/cortes`: carga lo vendido en UN período ya
 *  terminado y devuelve lo que se cobra (ventas × porcentaje, al peso). Un
 *  período que no es del contrato o que no terminó da 422; uno ya cargado, 409. */
export const cargarCorte = (
  leaseId: number, corte: { periodo_desde: string; periodo_hasta: string; ventas: number },
): Promise<{ monto: number }> =>
  client.post<{ monto: number }>(`/cobros/${leaseId}/cortes`, corte).then((r) => r.data);

/** Lo que contesta `pasarAVentas`: el contrato como quedó. */
export interface PasadoAVentas {
  lease_id: number;
  espacio: string | null;
  sede: string | null;
  proveedor: string | null;
  marca: string | null;
  desde: string;
  hasta: string;
  /** Siempre 0: lo que se cobra sale de los cortes. */
  monthly_rent: number;
  /** La nota con la constancia al final: «Pasado a % de ventas el … (valor anterior: $ 8)». */
  notes: string | null;
  porcentaje: number;
  corte: "mensual" | "al_final";
  valor_anterior: number;
}

/** `POST /api/cobros/{lease_id}/pasar-a-ventas`: un contrato de valor fijo pasa
 *  a cobrarse por un % de las ventas (Supervisar → «Para revisar» → Corregir →
 *  «Bajo tarifa de referencia»). El valor queda en 0, nace su fila de cobro y
 *  el valor viejo queda escrito al final de la nota. 422 `cobro` con un % fuera
 *  de (0, 100]; 409 si ya se cobra por ventas, si está cancelado o terminado;
 *  404 si no existe. */
export const pasarAVentas = (
  leaseId: number, cobro: { porcentaje: number; corte: "mensual" | "al_final" },
): Promise<PasadoAVentas> =>
  client.post<PasadoAVentas>(`/cobros/${leaseId}/pasar-a-ventas`, cobro).then((r) => r.data);
