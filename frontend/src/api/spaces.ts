import client from "./client";
import type { EstadoPorEspacio } from "../utils/estadoComercial";
import type { Space, Supplier, SpaceStatus } from "../types";

/**
 * Finds the Space whose `code` matches, or creates a new one on the fly.
 * Use this when persisting a contract from the 2D/3D editors.
 */
export const findOrCreateSpace = (payload: {
  code: string;
  name?: string;
  zone?: string;
  sede?: string;
  area_m2?: number;
}): Promise<Space> =>
  client.post<Space>("/spaces/find-or-create", payload).then((r) => r.data);

/** Lo que la BASE dice de cada espacio, por código completo.
 *
 *  Es la única verdad sobre lo comercial desde que el layout dejó de guardarlo.
 *  Lo que no viene en el mapa está libre: la base sólo tiene fila para lo que se
 *  vendió alguna vez.
 *
 *  **No se traga el error a propósito.** Si esto falla, el navegador no sabe qué
 *  está vendido, y el plano sin fusionar pinta TODO libre. Mentir así es peor
 *  que no actualizar: el que llama corta la sincronización entera y se queda con
 *  la copia que ya tenía. */
export const fetchEstadoComercial = (sede?: string): Promise<EstadoPorEspacio> =>
  client
    .get<EstadoPorEspacio>("/spaces/comercial", { params: sede ? { sede } : undefined })
    .then((r) => r.data);

/** El espacio por su código `SEDE-CODIGO`, o null si nunca se le guardó un
 *  contrato (sólo existe en `spaces` cuando alguno lo creó).
 *
 *  Sirve para llegar al id del contrato vigente, que el mapa comercial no
 *  trae: ahí está el estado, no las filas.
 *
 *  Con `si_existe=1` el servidor contesta `null` (200) en vez de 404: abrir el
 *  panel de un espacio que nunca se vendió es lo normal, no un error, y el 404
 *  ensuciaba la consola en cada clic. Leer no crea la fila. */
export const getSpaceByCode = (code: string): Promise<Space | null> =>
  client
    .get<Space | null>(`/spaces/by-code/${encodeURIComponent(code)}`, { params: { si_existe: 1 } })
    .then((r) => r.data ?? null)
    .catch(() => null);

export const updateSpaceStatus = (spaceId: number, status: SpaceStatus, notes?: string) =>
  client.patch<Space>(`/spaces/${spaceId}/status`, { status, notes }).then((r) => r.data);

/** La nota del panel del Plano («Nota del contrato» / «Nota del espacio»): el
 *  servidor la guarda donde la lee el mapa comercial —el contrato que manda, si
 *  no la reserva viva, si no el espacio— y dice dónde quedó. Sólo administración. */
export const guardarNotaDelEspacio = (spaceId: number, nota: string) =>
  client
    .put<{ donde: "contrato" | "reserva" | "espacio"; nota: string }>(`/spaces/${spaceId}/nota`, { nota })
    .then((r) => r.data);

export const cancelLease = (spaceId: number, leaseId: number) =>
  client.delete(`/spaces/${spaceId}/leases/${leaseId}`);

export const getSuppliers = () =>
  client.get<Supplier[]>("/suppliers/").then((r) => r.data);

/** Un contrato del historial de un espacio (`GET /spaces/by-code/{code}/historial`). */
export interface ContratoDelHistorial {
  lease_id: number;
  /** El código del espacio o de la parte (`CENTRO-GON-03-PC1`). */
  espacio: string;
  estado: "vigente" | "proximo" | "terminado" | "cancelado";
  proveedor: string | null;
  marca: string | null;
  desde: string | null;
  hasta: string | null;
  /** Sólo para administración. */
  valor_total?: number;
  valor_al_mes?: number | null;
}

/** Todos los contratos de un espacio y de sus partes —vivos, futuros,
 *  terminados y cancelados—, del más nuevo al más viejo (rediseño UX, etapa 0:
 *  la línea de tiempo de la ficha y «libre desde»). Lee, no crea. */
export const getHistorialDelEspacio = (code: string): Promise<ContratoDelHistorial[]> =>
  client
    .get<ContratoDelHistorial[]>(`/spaces/by-code/${encodeURIComponent(code)}/historial`, { params: { partes: true } })
    .then((r) => r.data);

/** Un contrato o una reserva viva en la línea de la sede (`GET /spaces/linea`):
 *  sólo fechas, nunca proveedor ni plata (la línea vive en Contratos, que la
 *  mira el proveedor). */
export interface FilaDeLaLinea {
  espacio: string;
  tipo: "contrato" | "reserva";
  id: number;
  desde: string;
  hasta: string;
  /** Sólo en las reservas: hasta cuándo se sostiene. */
  caduca?: string;
}

export const getLineaDeLaSede = (sede: string): Promise<{ desde: string; hasta: string; filas: FilaDeLaLinea[] }> =>
  client.get(`/spaces/linea`, { params: { sede } }).then((r) => r.data);
