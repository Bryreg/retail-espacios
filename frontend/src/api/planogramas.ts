import client from "./client";
import type { SuperficieOut } from "./participaciones";
import type { Poligono } from "../utils/zonasGeometria";

/**
 * Los planogramas con destinos contra el servidor (`/api/planogramas/…`,
 * `backend/app/routers/planogramas.py`). No confundir con `api/planograms.ts`,
 * que es la PLANOMETRÍA de un contrato (un archivo).
 *
 *   · Los GET reciben todo por query, nunca por ruta.
 *   · Porcentajes en puntos básicos enteros (1 pb = 0,01 %); fechas
 *     `YYYY-MM-DD`; la geometría en u,v normalizados, como las zonas.
 *   · Lo lee cualquier sesión; un mueble que se vende, sólo administración.
 *     Escribe administración (y el equipo, si la dueña lo habilitó, sólo en
 *     muebles internos).
 *
 * Nada de esto se guarda en el navegador: el borrador vive en el servidor.
 */

export type TipoDeDestino = "marca_propia" | "categoria" | "producto" | "promocion" | "otro";
export type ColorDeDestino = "d1" | "d2" | "d3" | "d4" | "d5" | "d6";
export type QuienPublica = "admin" | "equipo";

export interface DestinoOut {
  id: number;
  sede?: string;
  nombre: string;
  tipo: TipoDeDestino;
  color: ColorDeDestino;
  como_se_monta: string | null;
  codigo_externo: string | null;
  en_la_sede?: boolean;
}

export interface PiezaOut {
  destino_id: number;
  pb: number;
  /** null: todavía sin ubicar (sólo en un borrador). */
  vertices: Poligono | null;
  /** En una versión publicada: el destino como era al publicar. */
  destino: DestinoOut | null;
}

export type EstadoDeVersion = "vigente" | "programada" | "reemplazada";

export interface VersionOut {
  id: number;
  numero: number;
  rige_desde: string;
  hasta: string | null;
  estado: EstadoDeVersion;
  publicada_en: string | null;
  publicada_por: string | null;
  /** Vigente con su «hasta» vencido: hace cuántos días (sigue rigiendo). */
  vencida_hace_dias: number | null;
  /** El mueble cambió desde que se publicó (medidas, entrepaños, tipo). */
  para_revisar: boolean;
  piezas?: PiezaOut[];
  /** Sólo la vigente: lo vendido después de publicar que la pisa. */
  choca_con_lo_vendido?: string[];
}

export interface ProblemaDePlanograma {
  codigo: string;
  frase: string;
  destinos: number[];
}

export interface VendidoOut {
  /** Vendida entera (o por partes, o reservada entera), desde hoy. */
  entera: { desde: string; hasta: string }[];
  participaciones: {
    space_id: number;
    /** «Proveedor · marca» para quien administra. */
    nombre: string;
    pb: number;
    intervalos: { desde: string; hasta: string; pb: number }[];
    /** Su lugar confirmado; vacío si todavía no se ubicó (su % queda guardado). */
    poligonos: Poligono[];
  }[];
}

export interface CaraDelPlanograma {
  sede: string;
  hoy: string;
  cara: "A" | "B";
  codigo_cara: string;
  fixture: { id: string; code: string | null; label: string | null; type: string | null; caras: number };
  comercializable: boolean;
  por_participacion: boolean;
  superficie: SuperficieOut;
  firma: string | null;
  permisos: { planificar: boolean; quien_publica: QuienPublica };
  vendido: VendidoOut;
  planograma: {
    version: number;
    borrador: { en: string | null; por: string | null; piezas: PiezaOut[] } | null;
    vigente: VersionOut | null;
    programadas: VersionOut[];
    versiones: VersionOut[];
  };
  destinos: Record<string, DestinoOut>;
  biblioteca: DestinoOut[];
  revision: { errores: ProblemaDePlanograma[]; dibujado: Record<string, number> } | null;
  /** Sólo al publicar: el número de la versión nueva. */
  publicada?: number;
}

export interface ResumenDePlanogramas {
  caras: {
    fixture_id: string;
    cara: "A" | "B";
    codigo: string;
    borrador: boolean;
    vigente: VersionOut | null;
    programada: VersionOut | null;
  }[];
  quien_publica: QuienPublica;
  puede_planificar: boolean;
}

export interface CaraIn {
  sede: string;
  fixture_id: string;
  cara: "A" | "B";
  version: number;
}

export interface PiezaIn {
  destino_id: number;
  pb: number;
  vertices: Poligono | null;
}

export interface DestinoIn {
  sede: string;
  nombre: string;
  tipo: TipoDeDestino;
  color: ColorDeDestino;
  como_se_monta?: string | null;
  codigo_externo?: string | null;
  en_la_sede?: boolean;
}

const P = "/planogramas";

export const leerCara = (sede: string, fixtureId: string, cara: "A" | "B"): Promise<CaraDelPlanograma> =>
  client.get<CaraDelPlanograma>(`${P}/cara`, { params: { sede, fixture_id: fixtureId, cara } }).then((r) => r.data);

export const leerResumen = (sede: string): Promise<ResumenDePlanogramas> =>
  client.get<ResumenDePlanogramas>(`${P}/resumen`, { params: { sede } }).then((r) => r.data);

export const leerVersion = (id: number): Promise<VersionOut> =>
  client.get<VersionOut>(`${P}/version`, { params: { id } }).then((r) => r.data);

export const leerDestinos = (sede: string): Promise<DestinoOut[]> =>
  client.get<DestinoOut[]>(`${P}/destinos`, { params: { sede } }).then((r) => r.data);

export const guardarBorrador = (body: CaraIn & { piezas: PiezaIn[]; automatico?: boolean }): Promise<CaraDelPlanograma> =>
  client.put<CaraDelPlanograma>(`${P}/borrador`, body).then((r) => r.data);

export const publicar = (body: CaraIn & { rige_desde: string; hasta: string | null }): Promise<CaraDelPlanograma> =>
  client.post<CaraDelPlanograma>(`${P}/publicar`, body).then((r) => r.data);

export const descartar = (body: CaraIn): Promise<CaraDelPlanograma> =>
  client.post<CaraDelPlanograma>(`${P}/descartar`, body).then((r) => r.data);

export const crearDestino = (body: DestinoIn): Promise<DestinoOut> =>
  client.post<DestinoOut>(`${P}/destinos`, body).then((r) => r.data);

export const cambiarDestino = (id: number, body: Partial<Omit<DestinoIn, "sede">>): Promise<DestinoOut> =>
  client.patch<DestinoOut>(`${P}/destinos/${id}`, body).then((r) => r.data);

export const ponerQuienPublica = (quien: QuienPublica): Promise<{ quien_publica: QuienPublica }> =>
  client.put<{ quien_publica: QuienPublica }>(`${P}/ajustes`, { quien_publica: quien }).then((r) => r.data);
