import client from "./client";
import type { Supplier } from "../types";

export const getSuppliers = (): Promise<Supplier[]> =>
  client.get<Supplier[]>("/suppliers/").then((r) => r.data);

export const createSupplier = (payload: Omit<Supplier, "id">): Promise<Supplier> =>
  client.post<Supplier>("/suppliers/", payload).then((r) => r.data);

/**
 * Finds a supplier by name or creates one if it doesn't exist.
 * The backend guarantees idempotency — safe to call multiple times.
 */
export const findOrCreateSupplier = (name: string): Promise<Supplier> =>
  client
    .post<Supplier>("/suppliers/find-or-create", { name })
    .then((r) => r.data);
