import axios from "axios";
import client from "./client";
import type { SuperficieOut } from "./participaciones";
import type { ColorDeDestino, TipoDeDestino } from "./planogramas";
import type { UnifiedFixture } from "../types/fixtures";
import type { Poligono } from "../utils/zonasGeometria";

/**
 * La guía de montaje de una versión (fase 3 de la distribución,
 * `backend/app/routers/guia.py` y `/api/planogramas/guia/…`).
 *
 * Dos puertas, como el montaje: la sesión de siempre (`client`) y el ENLACE sin
 * contraseña de una versión (`guiaClient`, con su token sólo en memoria: no se
 * mezcla con la sesión de quien lo abre en su propio computador). Nada de esto
 * lleva precios ni nombres de proveedores.
 */
const guiaClient = axios.create({ baseURL: "/api" });
let TOKEN = "";

/** El token del enlace. Se llama una vez, al arrancar la pantalla del enlace. */
export function usarTokenDeGuia(token: string): void {
  TOKEN = token;
}
export const hayTokenDeGuia = (): boolean => TOKEN !== "";

guiaClient.interceptors.request.use((config) => {
  if (TOKEN) config.headers.Authorization = `Bearer ${TOKEN}`;
  if (typeof FormData !== "undefined" && config.data instanceof FormData) delete config.headers["Content-Type"];
  return config;
});

export interface PiezaDeGuia {
  destino_id: number;
  pb: number;
  vertices: Poligono | null;
  nombre: string;
  tipo: TipoDeDestino;
  color: ColorDeDestino;
  como_se_monta: string | null;
  codigo_externo: string | null;
}

export interface Guia {
  sede: string;
  hoy: string;
  cara: "A" | "B";
  /** «GON-12» (sin la sede). */
  codigo: string;
  /** El mueble, sólo su geometría (para los estantes). */
  fixture: Partial<UnifiedFixture> & { id: string; code: string | null; label: string | null; type: string };
  superficie: Pick<SuperficieOut, "orientacion" | "ancho" | "alto" | "exclusiones">;
  version: {
    id: number; numero: number; rige_desde: string; hasta: string | null;
    estado: "vigente" | "programada" | "reemplazada";
    vencida_hace_dias: number | null;
    hay_una_mas_nueva: boolean;
    para_revisar: boolean;
  };
  piezas: PiezaDeGuia[];
  anterior: { numero: number; piezas: PiezaDeGuia[] } | null;
  /** Lo ya asignado (vendido) en esas fechas: sólo dónde, nunca de quién. */
  asignado: Poligono[];
  vendida_entera: boolean;
  fotos: { id: number; subida_en: string | null; por_enlace: boolean }[];
}

export interface Destinatarios {
  sede: string;
  /** Quien monta en la sede (la libreta de contactos). */
  montaje: string[];
  /** La administración de la sede (sólo para quien administra). */
  comercial: string[];
  correo_listo: boolean;
}

/** Con sesión: la guía de cualquier versión. */
export const leerGuia = (version: number): Promise<Guia> =>
  client.get<Guia>("/guia", { params: { version } }).then((r) => r.data);

/** Con el enlace: la guía de SU versión. */
export const leerGuiaDelEnlace = (): Promise<Guia> =>
  guiaClient.get<Guia>("/guia").then((r) => r.data);

/** La foto de cómo quedó (no es obligatoria). Con el enlace o con sesión. */
export const subirFoto = (foto: File, version?: number): Promise<{ fotos: Guia["fotos"] }> => {
  const f = new FormData();
  f.append("foto", foto);
  if (version !== undefined && !hayTokenDeGuia()) f.append("version", String(version));
  return (hayTokenDeGuia() ? guiaClient : client).post<{ fotos: Guia["fotos"] }>("/guia/foto", f).then((r) => r.data);
};

/** La foto va en un `<img>`: el token por query (sólo el del enlace). */
export const urlDeFoto = (id: number, tokenDeSesion?: string | null): string =>
  `/api/guia/foto?id=${id}&token=${encodeURIComponent(TOKEN || tokenDeSesion || "")}`;

export const enlaceDeLaGuia = (versionId: number): Promise<{ url: string; dias: number }> =>
  client.post<{ url: string; dias: number }>("/planogramas/guia/enlace", { version_id: versionId }).then((r) => r.data);

export const destinatariosDeLaGuia = (version: number): Promise<Destinatarios> =>
  client.get<Destinatarios>("/planogramas/guia/destinatarios", { params: { version } }).then((r) => r.data);

export const enviarLaGuia = (versionId: number, correos: string[]): Promise<{ enviados: string[] }> =>
  client.post<{ enviados: string[] }>("/planogramas/guia/enviar", { version_id: versionId, correos }).then((r) => r.data);
