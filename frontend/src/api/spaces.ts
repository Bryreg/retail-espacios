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
 *  trae: ahí está el estado, no las filas. */
export const getSpaceByCode = (code: string): Promise<Space | null> =>
  client
    .get<Space>(`/spaces/by-code/${encodeURIComponent(code)}`)
    .then((r) => r.data)
    .catch(() => null);

export const updateSpaceStatus = (spaceId: number, status: SpaceStatus, notes?: string) =>
  client.patch<Space>(`/spaces/${spaceId}/status`, { status, notes }).then((r) => r.data);

export const cancelLease = (spaceId: number, leaseId: number) =>
  client.delete(`/spaces/${spaceId}/leases/${leaseId}`);

export const getSuppliers = () =>
  client.get<Supplier[]>("/suppliers/").then((r) => r.data);
