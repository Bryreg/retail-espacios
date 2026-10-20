import client from "./client";
import type { AvisosContrato } from "../types";

/**
 * Las reservas de una cara entera o de una parte (`docs/rediseno/vender-api.md`
 * §8). Se CREAN desde Vender («Reservar hasta…», por `api/vender.ts`); acá se
 * leen, se confirman y se cancelan, desde Supervisar. Todo de ADMINISTRACIÓN:
 * lleva el proveedor y el precio acordado.
 *
 * Nada de Vender llega a este módulo (`probar-vender` lo asevera): delante del
 * proveedor, una cara reservada por otro se ve «Tomada», sin decir de quién.
 */

/** Una reserva viva (`estado = "viva"` y `caduca ≥ hoy`, fecha de Colombia). */
export interface ReservaDeEspacio {
  id: number;
  /** El código completo (`SEDE-CODE[-B][-PARTE]`). */
  espacio: string;
  sede: string;
  proveedor: string | null;
  marca: string | null;
  desde: string;
  hasta: string;
  caduca: string;
  /** Caduca dentro de 7 días. */
  caduca_pronto: boolean;
  /** El precio acordado: el TOTAL por todo el plazo. */
  valor: number | null;
  modo_precio: "mensual" | "total" | null;
  valor_tecleado: number | null;
  notas: string | null;
  creado_en: string | null;
  creado_por: string | null;
}

/** `GET /api/reservas?sede=`: las vivas, de la que caduca primero a la última. */
export const reservasDeEspacio = (sede: string): Promise<ReservaDeEspacio[]> =>
  client.get<ReservaDeEspacio[]>("/reservas", { params: { sede } }).then((r) => r.data);

/** `POST /api/reservas/{id}/confirmar`: la reserva pasa a contrato CON EL PRECIO
 *  GUARDADO (el cuerpo va vacío: no se cambia nada al confirmar desde
 *  Supervisar). Revisa choques con candado; una reserva que ya no vive da 409. */
export const confirmarReserva = (
  id: number,
): Promise<{ reserva_id: number; lease_id: number; espacio: string; avisos: AvisosContrato | null }> =>
  client.post(`/reservas/${id}/confirmar`, {}).then((r) => r.data);

/** `DELETE /api/reservas/{id}`: cancelar. Queda en el registro con su baja. */
export const cancelarReserva = (id: number): Promise<void> =>
  client.delete(`/reservas/${id}`).then(() => undefined);
