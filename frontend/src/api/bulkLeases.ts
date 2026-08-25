import client from "./client";
import type { FilaPlanilla } from "../utils/planilla";

/** Carga masiva de contratos: dos pasos, revisar y confirmar.
 *
 *  Validar no escribe nada. Es el paso que hace revisable la carga: cuarenta
 *  contratos creados a ciegas no se deshacen con un botón. */

export type EstadoFila = "ok" | "aviso" | "error";

export interface FilaRevisada {
  fila: number;
  estado: EstadoFila;
  mensajes: string[];
  /** Lo que el servidor entendió, no lo que la planilla decía. */
  codigo?: string | null;
  nombre?: string | null;
  sede?: string | null;
  proveedor?: string | null;
  marca?: string | null;
  correo?: string | null;
  valor?: number | null;
  desde?: string | null;
  hasta?: string | null;
  nota?: string | null;
  dias?: number | null;
  referencia?: number | null;
  proveedor_nuevo: boolean;
}

export interface Revision {
  filas: FilaRevisada[];
  ok: number;
  avisos: number;
  errores: number;
}

export interface Confirmacion {
  creados: number;
  omitidos: number;
  filas: FilaRevisada[];
}

/** Una tanda grande tarda: son cuarenta resoluciones de código contra el plano. */
const TIMEOUT = 120_000;

export const validarLote = (sede: string, filas: FilaPlanilla[]): Promise<Revision> =>
  client
    .post<Revision>("/leases/bulk/validar", { sede, filas }, { timeout: TIMEOUT })
    .then((r) => r.data);

export const confirmarLote = (sede: string, filas: FilaPlanilla[]): Promise<Confirmacion> =>
  client
    .post<Confirmacion>("/leases/bulk/confirmar", { sede, filas }, { timeout: TIMEOUT })
    .then((r) => r.data);
