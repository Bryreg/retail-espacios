import client from "./client";

/** El canon devengado de cada mes, por sede (`GET /dashboard/serie`, sólo
 *  administración), y cuándo terminó el último contrato de cada espacio. */
export interface SerieDeCanon {
  meses: string[];
  sedes: Record<string, { canon: number[]; contratos: number[]; ultimo_fin: Record<string, string> }>;
}

export const getSerieDeCanon = (meses = 12): Promise<SerieDeCanon> =>
  client.get<SerieDeCanon>("/dashboard/serie", { params: { meses } }).then((r) => r.data);

export interface Meta { ocupacion: number; canon_tarifa: number }
export interface Metas { general: Meta; sedes: Record<string, Meta>; por_defecto: boolean }

/** Las metas de Indicadores: la general y las de cada sede. Las lee
 *  cualquiera; las cambia administración (Ajustes › Comercial). */
export const getMetas = (): Promise<Metas> => client.get<Metas>("/layout/metas").then((r) => r.data);
export const guardarMetas = (m: { general: Meta; sedes: Record<string, Meta> }): Promise<Metas> =>
  client.put<Metas>("/layout/metas", m).then((r) => r.data);

/** La meta que rige en una sede: la suya, o la general. */
export function metaDeLaSede(m: Metas | null, sede: string): Meta {
  const def = { ocupacion: 90, canon_tarifa: 95 };
  if (!m) return def;
  return m.sedes[sede.trim().toUpperCase()] ?? m.general ?? def;
}
