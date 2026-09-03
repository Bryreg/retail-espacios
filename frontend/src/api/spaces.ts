import client from "./client";
import type { Space, SpaceMapItem, Supplier, SpaceStatus } from "../types";

export const getMapStatus = () =>
  client.get<SpaceMapItem[]>("/spaces/map").then((r) => r.data);

export const getSpaceBySvgId = (svgId: string) =>
  client.get<Space>(`/spaces/by-svg/${svgId}`).then((r) => r.data);

export const createSpace = (payload: {
  svg_id: string;
  code: string;
  name: string;
  zone: string;
  sede?: string;
  area_m2: number;
  notes?: string;
}) => client.post<Space>("/spaces/", payload).then((r) => r.data);

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

/** El espacio por su código `SEDE-CODIGO`, o null si nunca se le guardó un
 *  contrato (sólo existe en `spaces` cuando alguno lo creó).
 *
 *  Sirve para llegar al id del contrato vigente, que el JSON del layout no
 *  guarda: ahí está el estado comercial denormalizado, no las filas. */
export const getSpaceByCode = (code: string): Promise<Space | null> =>
  client
    .get<Space>(`/spaces/by-code/${encodeURIComponent(code)}`)
    .then((r) => r.data)
    .catch(() => null);

export const updateSpaceStatus = (spaceId: number, status: SpaceStatus, notes?: string) =>
  client.patch<Space>(`/spaces/${spaceId}/status`, { status, notes }).then((r) => r.data);

export const createLease = (
  spaceId: number,
  payload: {
    supplier_id: number;
    marca?: string;
    start_date: string;
    end_date: string;
    monthly_rent: number;
    notes?: string;
  }
) => client.post(`/spaces/${spaceId}/leases`, payload).then((r) => r.data);

export const cancelLease = (spaceId: number, leaseId: number) =>
  client.delete(`/spaces/${spaceId}/leases/${leaseId}`);

export const getSuppliers = () =>
  client.get<Supplier[]>("/suppliers/").then((r) => r.data);

export const createSupplier = (payload: Omit<Supplier, "id">) =>
  client.post<Supplier>("/suppliers/", payload).then((r) => r.data);

// ─── Tarifa de referencia + ocupación por espacio (vitrina 3D) ────────────────
//
// GET /spaces/{code}/rates, construido en paralelo por el agente de backend
// de esta misma sesión (backend/app/routers/spaces.py + services/ocupacion.py)
// — degradar con gracia se mantiene igual: `getSpaceRates` nunca rechaza,
// siempre resuelve a `null` si el rol no tiene acceso o si hay cualquier otro
// error. El semáforo del 3D NO depende de esta llamada: pinta desde el store
// del layout (ver `utils/semaforo3d.ts`); esto es sólo información
// suplementaria — tarifa y su desvío — para el panel del mueble elegido.
//
// `reference_rate` es dinero: sólo llega para admin (lista blanca en el
// backend: para otro rol la clave NI SIQUIERA está en el JSON, no llega en
// null). Si el campo no viene, el panel no dibuja nada en su lugar — ni "—"
// ni "$0" — para no inventar un valor que el backend decidió no mandar.
//
// `estado` es "libre" | "se_libera" | "tomado" cuando `desde`/`hasta` van los
// dos (este cliente siempre los manda) — es OTRO vocabulario que
// `RangeAvailability` del cliente ("libre"/"parcial"/"tomado"): "se_libera"
// es la palabra del backend para la misma lectura de en medio, no un typo.
// Sin `desde`/`hasta` el backend contesta con un vocabulario de HOY distinto
// ("disponible"/"contratado"/"vencido"/"ocupado"), pero este cliente nunca
// llama así, así que ese caso no está tipado acá.
export interface SpaceOccupancyDTO {
  estado: "libre" | "se_libera" | "tomado";
  lease_desde?: string | null;
  lease_hasta?: string | null;
  se_libera_el?: string | null;
}

export interface SpaceRatesDTO {
  code: string;
  sede: string;
  type: string;
  reference_rate?: number;
  occupancy: SpaceOccupancyDTO;
}

/** Rótulo para `occupancy.estado` tal como lo devuelve ESTE endpoint — un
 *  vocabulario propio, no el `RangeAvailability` del cliente (ver arriba). */
export const OCCUPANCY_ESTADO_LABEL: Record<SpaceOccupancyDTO["estado"], string> = {
  libre: "Libre todo el periodo",
  se_libera: "Se libera en el periodo",
  tomado: "Tomado",
};

/**
 * Tarifa de referencia + lectura de ocupación de UN espacio para el periodo
 * `[desde, hasta]` (`YYYY-MM-DD`, inclusive en los dos extremos — misma
 * convención que el resto de la app). `code` ya debe venir compuesto con
 * `fullSpaceCode(sede, code)` en mayúsculas, con el sufijo `-B` para la cara
 * B de una góndola doble: este cliente no antepone la sede.
 *
 * Nunca rechaza: cualquier error (404 si el espacio no tiene fila en `spaces`
 * todavía, red caída, o un despliegue donde este endpoint aún no exista)
 * resuelve a `null`. El llamador simplemente no dibuja el bloque de tarifa —
 * nunca un placeholder.
 */
export const getSpaceRates = (
  code: string,
  desde: string,
  hasta: string
): Promise<SpaceRatesDTO | null> =>
  client
    .get<SpaceRatesDTO>(`/spaces/${encodeURIComponent(code)}/rates`, {
      params: { desde, hasta },
    })
    .then((r) => r.data)
    .catch(() => null);
