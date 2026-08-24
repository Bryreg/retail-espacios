import client from "./client";
import type { Supplier } from "../types";

export const getSuppliers = (): Promise<Supplier[]> =>
  client.get<Supplier[]>("/suppliers/").then((r) => r.data);

export const createSupplier = (payload: Omit<Supplier, "id">): Promise<Supplier> =>
  client.post<Supplier>("/suppliers/", payload).then((r) => r.data);

/** Busca el proveedor por nombre y lo crea si no está. Idempotente.
 *
 *  El correo es opcional y solo se usa para COMPLETAR el que falta: el servidor
 *  no pisa uno ya cargado. Sin poder mandarlo desde acá, la constancia de
 *  contrato al proveedor no salía nunca. */
export const findOrCreateSupplier = (name: string, email?: string): Promise<Supplier> =>
  client
    .post<Supplier>("/suppliers/find-or-create", email ? { name, email } : { name })
    .then((r) => r.data);
