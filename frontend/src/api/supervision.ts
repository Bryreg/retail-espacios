import client from "./client";
import type { AvisoDeMontaje, Guia } from "./guia";
import type { EstadoDeMontaje } from "./planogramas";

/**
 * La supervisión de los planogramas (fase 4 de la distribución,
 * `/api/planogramas/supervision…`): quien monta avisa desde el enlace de la
 * guía y una persona pone lo planificado al lado de la foto y dice si coincide.
 * Revisa quien puede publicar esa cara.
 */

export type ResultadoDeRevision = "coincide" | "no_coincide";

export interface RevisionDeMontaje {
  id: number;
  montaje_id: number | null;
  resultado: ResultadoDeRevision;
  /** Los números de la guía que quedaron mal. */
  numeros: number[];
  otra_cosa: boolean;
  nota: string | null;
  /** La dio por buena mirándola en la tienda, sin foto. */
  en_la_tienda: boolean;
  guia_reenviada: boolean;
  por: string | null;
  en: string | null;
}

/** Una cara de «Para revisar». */
export interface CaraPorSupervisar {
  version_id: number;
  numero: number;
  fixture_id: string;
  cara: "A" | "B";
  /** «GON-12» (sin la sede). */
  codigo: string;
  /** «GON-12 · cara A». */
  nombre: string;
  estado: Extract<EstadoDeMontaje, "sin_montar" | "por_revisar" | "no_se_pudo" | "no_coincide">;
  rige_desde: string;
  dias_que_rige: number;
  aviso: AvisoDeMontaje | null;
  revision: RevisionDeMontaje | null;
  fotos_nuevas: number;
}

/** La ficha: la guía (lo planificado) con los avisos, las fotos y la historia. */
export interface FichaDeMontaje extends Omit<Guia, "fotos"> {
  fotos: { id: number; subida_en: string | null; por_enlace: boolean; nueva: boolean }[];
  montaje: {
    estado: EstadoDeMontaje;
    aviso: AvisoDeMontaje | null;
    revision: RevisionDeMontaje | null;
    avisos: AvisoDeMontaje[];
    revisiones: RevisionDeMontaje[];
  };
}

export interface RevisarIn {
  version_id: number;
  resultado: ResultadoDeRevision;
  numeros?: number[];
  otra_cosa?: boolean;
  nota?: string | null;
  en_la_tienda?: boolean;
  reenviar?: boolean;
}

export interface Revisada {
  revision: RevisionDeMontaje;
  /** Con «reenviar»: si salió la guía, o por qué no. */
  reenvio: "enviada" | "sin_contactos" | "sin_correo" | null;
  reenviada_a: string[];
}

/** Las caras de la sede para «Para revisar», y el día de hoy del servidor. */
export const leerSupervision = (sede: string): Promise<{ caras: CaraPorSupervisar[]; hoy: string }> =>
  client.get<{ caras: CaraPorSupervisar[]; hoy: string }>("/planogramas/supervision", { params: { sede } }).then((r) => r.data);

export const leerFichaDeMontaje = (id: number): Promise<FichaDeMontaje> =>
  client.get<FichaDeMontaje>("/planogramas/supervision/version", { params: { id } }).then((r) => r.data);

export const revisarMontaje = (e: RevisarIn): Promise<Revisada> =>
  client.post<Revisada>("/planogramas/supervision/revisar", e).then((r) => r.data);
