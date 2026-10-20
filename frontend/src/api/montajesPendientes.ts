import client from "./client";

/**
 * Los avisos de montaje que esperan (`docs/rediseno/vender-api.md` §4 y
 * `docs/rediseno/decisiones.md`, Supervisar PR 2): un contrato firmado cuyo
 * correo de montaje todavía no salió porque le falta la planometría (o, en un
 * porcentaje de cara, la distribución confirmada).
 *
 * De ADMINISTRACIÓN y sin montos: lleva el proveedor. Lo lee Supervisar —«Falta
 * planometría» en «Para revisar»— y NADA de Vender (`probar-vender` falla si un
 * archivo de Vender, o la parte de `DashboardView` que Vender dibuja, llega a
 * este módulo).
 */
export interface MontajePendiente {
  lease_id: number;
  /** El código completo del espacio del contrato (`SEDE-CODE[-B][-PARTE]`). */
  espacio: string;
  /** El código de la cara (sin la parte). */
  cara: string | null;
  sede: string;
  proveedor: string | null;
  marca: string | null;
  desde: string;
  hasta: string;
  falta_planometria: boolean;
  falta_distribucion: boolean;
  /** Días de hoy (Colombia) al arranque: 0 o menos, ya corre. */
  dias_para_empezar: number;
}

/** `GET /api/montajes/pendientes?sede=`: del que arranca antes al último. */
export const montajesPendientes = (sede: string): Promise<MontajePendiente[]> =>
  client.get<MontajePendiente[]>("/montajes/pendientes", { params: { sede } }).then((r) => r.data);
