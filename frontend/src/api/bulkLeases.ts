import client from "./client";
import type { FilaPlanilla } from "../utils/planilla";
import type { AvisosContrato } from "../types";

/** Contratos de a varios: dos pasos, revisar y confirmar.
 *
 *  Validar no escribe nada. Es el paso que hace revisable la carga: cuarenta
 *  contratos creados a ciegas no se deshacen con un botón.
 *
 *  Lo usan las DOS puertas por las que entran varios contratos de una vez: la
 *  planilla de la reunión comercial y el contrato multiespacio de la pantalla
 *  de Vender. Es el mismo problema —N espacios, un proveedor, un periodo— y
 *  sobre todo el mismo problema de correos: por el camino de a uno, tres
 *  espacios son nueve correos para un solo acuerdo. Acá sale uno por rol. */

export type EstadoFila = "ok" | "aviso" | "error";

export interface FilaRevisada {
  fila: number;
  estado: EstadoFila;
  mensajes: string[];
  /** Lo que el servidor entendió, no lo que la planilla decía. */
  codigo?: string | null;
  nombre?: string | null;
  /** El nombre con el que el PLANO dibuja ese mueble, cuando alguien se lo puso
   *  a mano y es distinto del código. `null` es que se dibuja con su código.
   *
   *  Es el dato que faltaba para que la revisión sirva: `codigo` le devuelve a
   *  la persona lo que ella tecleó con la sede antepuesta, y `nombre` es el
   *  nombre del TIPO («Impulsador Marca»), idéntico en los cuarenta
   *  impulsadores de la sede. Ninguno de los dos distingue un mueble de otro.
   *  Éste sí: es lo que la persona leyó en el plano. */
  nombre_dibujado?: string | null;
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
  /** El contrato que quedó creado. Sólo viene de `confirmar`, y es lo que hace
   *  falta para colgarle la planometría: existe recién después del contrato. */
  lease_id?: number | null;
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
  /** A quién se le avisó, de verdad. Un correo por rol para toda la tanda —o
   *  para todo el contrato multiespacio—, no uno por espacio. */
  avisos?: AvisosContrato | null;
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
