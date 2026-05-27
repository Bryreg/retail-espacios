import client from "./client";

export interface TopSupplier {
  name: string;
  leases: number;
  revenue: number;
}

export interface KpiData {
  total_spaces: number;
  occupied: number;
  free: number;
  reserved: number;
  maintenance: number;
  monthly_revenue: number;
  expiring_soon: number;
  top_suppliers: TopSupplier[];
}

export interface SpaceLeaseSummary {
  supplier: string | null;
  start_date: string | null;
  end_date: string | null;
  days_remaining: number | null;
  monthly_rent: number | null;
}

export interface SpaceOccupancy {
  id: number;
  code: string;
  name: string;
  zone: string;
  status: "free" | "occupied" | "reserved" | "maintenance";
  unauthorized: boolean;
  lease: SpaceLeaseSummary | null;
}

export const getKpis = (): Promise<KpiData> =>
  client.get<KpiData>("/dashboard/kpis").then((r) => r.data);

export const getSpaces = (): Promise<SpaceOccupancy[]> =>
  client.get<SpaceOccupancy[]>("/dashboard/spaces").then((r) => r.data);
