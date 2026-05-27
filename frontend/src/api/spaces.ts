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
