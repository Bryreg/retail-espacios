import client from "./client";

/**
 * «Editar contrato» (`docs/rediseno/vender-api.md` §9): lo que Supervisar lee
 * de UN contrato para reabrirlo en Vender. `GET /api/contratos/{lease_id}/edicion`
 * — de ADMINISTRACIÓN (lleva plata) y SIN la nota interna (Vender lo mira el
 * proveedor).
 *
 * Lo lee Supervisar —el botón «Editar contrato» de «Para revisar» y de la
 * ficha— y NADA de Vender (`probar-vender` falla si un archivo de Vender, o la
 * parte de `DashboardView` que Vender dibuja, llega a este módulo). Vender
 * guarda la edición con su propio módulo (`api/vender.ts`, `edita`).
 */
export interface ContratoParaEditar {
  lease_id: number;
  /** El código completo del espacio del contrato (de un porcentaje, el `…-PC<n>`). */
  espacio: string;
  sede: string;
  /** El código completo de la cara. */
  cara: string;
  forma: "entera" | "parte" | "pieza" | "participacion";
  /** La parte («EN2», «BI1»), o `null`. */
  parte: string | null;
  proveedor: string;
  correo: string | null;
  marca: string | null;
  desde: string;
  hasta: string;
  /** El TOTAL del plazo (0 con cobro por ventas). */
  valor: number;
  modo_precio: "total" | "mensual" | null;
  valor_tecleado: number | null;
  cobro: { porcentaje: number; corte: "mensual" | "al_final" } | null;
  puntos_basicos: number | null;
  termino_id: number | null;
  /** Vigente o por arrancar (ni cancelado, ni reemplazado, ni vencido). */
  activo: boolean;
  /** Ya arrancó (Colombia): el «Desde» no se mueve. */
  arranco: boolean;
  ultimo_corte: string | null;
  cortes: number;
  planometria: string | null;
  montaje_pendiente: boolean;
  hoy: string;
}

export const contratoParaEditar = (leaseId: number): Promise<ContratoParaEditar> =>
  client.get<ContratoParaEditar>(`/contratos/${leaseId}/edicion`).then((r) => r.data);
