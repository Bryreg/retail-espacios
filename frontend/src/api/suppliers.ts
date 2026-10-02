import client from "./client";
import type { Supplier } from "../types";

export const getSuppliers = (): Promise<Supplier[]> =>
  client.get<Supplier[]>("/suppliers/").then((r) => r.data);

