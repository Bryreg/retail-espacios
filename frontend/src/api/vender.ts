import client from "./client";
import type { AvisosContrato } from "../types";

/**
 * Lo único que Vender escribe: el contrato entero, de una vez (rediseño de
 * Vender, PR 1; el acuerdo con el servidor está en `docs/rediseno/vender-api.md`).
 *
 * Antes el contrato de Vender iba por la tanda de la planilla
 * (`/leases/bulk/confirmar`), que guarda lo que pasa y salta lo demás: con una
 * cara entera y un porcentaje en el mismo contrato, si uno fallaba quedaba
 * medio contrato firmado y el correo ya había salido. `POST /contratos/vender`
 * es todo o nada —un candado para todas las caras, una revisión y un commit— y
 * con `?validar=1` contesta lo mismo sin escribir nada: es la vista previa
 * mientras se arma.
 *
 * Y la única lectura de proveedores de Vender: completar UN nombre desde la
 * tercera letra (`/suppliers/completar`). Nunca la lista: Vender la mira el
 * proveedor, y una lista de coincidencias le mostraría a su competencia.
 *
 * `probar-vender` exige que los archivos del contrato no importen otro módulo
 * de escritura que éste.
 */

/** Cómo se escribió el precio de una línea: el total del plazo o «al mes»
 *  (× los meses de `utils/meses.ts`). Lo que se guarda es siempre el total. */
export type ModoPrecio = "total" | "mensual";

/** Una cara entera o una parte (PU/TR/EN/BI/FO), con su código completo. */
export interface LineaDeEspacio {
  espacio: string;
  /** El TOTAL de la línea por todo el plazo. */
  valor: number;
  modo_precio: ModoPrecio;
  valor_tecleado: number;
}

/** Un porcentaje de una cara (la B con `-B`). El número `PC` lo pone el servidor. */
export interface LineaDePorcentaje {
  participacion: { cara: string; puntos_basicos: number; renueva: number | null };
  valor: number;
  modo_precio: ModoPrecio;
  valor_tecleado: number;
}

export type LineaDeVenta = LineaDeEspacio | LineaDePorcentaje;

export type Cobro =
  | { modo: "fijo" }
  | { modo: "ventas"; porcentaje: number; corte: "mensual" | "al_final" };

export interface PedidoDeVenta {
  sede: string;
  proveedor: string;
  correo?: string;
  marca?: string;
  nota?: string;
  desde: string;
  hasta: string;
  /** Todo el pedido es un contrato o todo es una reserva (§1, §8). */
  tipo: "contrato" | "reserva";
  /** Obligatorio en una reserva: hoy ≤ caduca ≤ hasta. Sin valor por defecto. */
  caduca: string | null;
  cobro: Cobro;
  lineas: LineaDeVenta[];
}

export interface VentaGuardada {
  contratos: { espacio: string; lease_id: number }[];
  /** `lease_id`: el contrato del porcentaje (Supervisar le carga la planometría),
   *  `null` en una reserva; `reserva_id`: en una reserva, el mismo término. */
  participaciones: {
    cara: string; espacio: string; termino_id: number; tipo: "contrato" | "reserva";
    lease_id?: number | null; reserva_id?: number | null;
  }[];
  /** Las reservas de una cara entera o de una parte (§8); vacío en un contrato. */
  reservas?: { espacio: string; reserva_id: number }[];
  avisos?: AvisosContrato | null;
}

/** Una línea que el servidor rechazó. `indice` es su lugar en `lineas` (desde 0).
 *  Sin nombres ni el % de otro: lo que queda y desde cuándo. */
export interface FilaRechazada {
  indice: number;
  espacio: string;
  code: string;
  mensaje: string;
  queda_pb?: number | null;
  desde_dia?: string | null;
}

/** Lo que contesta la vista previa: todo bien, o las filas que no pasan. */
export interface Revision { ok: boolean; filas: FilaRechazada[] }

/** Si el error es el 409 `contrato_invalido`, sus filas; si no, `null`. */
export function filasRechazadas(e: unknown): FilaRechazada[] | null {
  const r = (e as { response?: { status?: number; data?: { detail?: unknown } } })?.response;
  if (r?.status !== 409) return null;
  const d = r.data?.detail as { code?: string; filas?: unknown } | undefined;
  if (!d || d.code !== "contrato_invalido" || !Array.isArray(d.filas)) return null;
  return d.filas.filter((f): f is FilaRechazada =>
    !!f && typeof f === "object" && typeof (f as FilaRechazada).indice === "number");
}

/** Guarda TODO el contrato o nada. Un 409 `contrato_invalido` se lee con
 *  `filasRechazadas`: no se escribió ninguna línea. */
export const guardarContrato = (pedido: PedidoDeVenta): Promise<VentaGuardada> =>
  client.post<VentaGuardada>("/contratos/vender", pedido, { timeout: 60_000 }).then((r) => r.data);

/** La misma revisión, sin escribir nada. El 409 no es un error acá: es la
 *  respuesta («esto no pasa»), y se devuelve como tal. */
export const validarContrato = (pedido: PedidoDeVenta): Promise<Revision> =>
  client
    .post<Revision>("/contratos/vender", pedido, { params: { validar: 1 }, timeout: 60_000 })
    .then((r) => ({ ok: r.data?.ok !== false, filas: r.data?.filas ?? [] }))
    .catch((e) => {
      const filas = filasRechazadas(e);
      if (filas) return { ok: false, filas };
      throw e;
    });

/** UN nombre de proveedor que empieza con lo escrito (desde 3 letras), o `null`.
 *  Nunca una lista. */
export const completarProveedor = (prefijo: string): Promise<string | null> =>
  client
    .get<{ nombre: string | null }>("/suppliers/completar", { params: { prefijo } })
    .then((r) => (typeof r.data?.nombre === "string" && r.data.nombre.trim() ? r.data.nombre : null));
