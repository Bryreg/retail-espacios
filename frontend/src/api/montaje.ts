import axios from "axios";
import type { MountConfirmation, MountMotivo } from "./mounts";
import type { UnifiedFixture } from "../types/fixtures";

/**
 * El enlace firmado del correo de montaje.
 *
 * Cliente aparte del de la sesión, y a propósito. Guardar este token donde vive
 * el de la sesión tendría dos costos: al admin que abre el enlace en su propio
 * computador para revisar algo lo sacaría de su sesión, y dejaría la credencial
 * de un enlace repartido por correo en el `localStorage` del navegador.
 *
 * Acá vive sólo en memoria: la credencial es la URL, y recargar la vuelve a
 * leer de ahí.
 */
const montajeClient = axios.create({ baseURL: "/api" });

let TOKEN = "";

/** Lo que venía en el enlace. Se llama una vez, al arrancar la pantalla. */
export function usarToken(token: string): void {
  TOKEN = token;
}

montajeClient.interceptors.request.use((config) => {
  if (TOKEN) config.headers.Authorization = `Bearer ${TOKEN}`;
  // Multipart necesita su boundary, y sólo el navegador puede generarlo.
  if (typeof FormData !== "undefined" && config.data instanceof FormData) {
    delete config.headers["Content-Type"];
  }
  return config;
});

/** Lo que la pantalla muestra, en una sola llamada.
 *
 *  Una y no cuatro: del otro lado hay un celular con señal de supermercado, y
 *  cada viaje es una oportunidad de quedarse a mitad de camino. */
export interface EspacioMontaje {
  /** `SEDE-CODIGO`. Lo pone el servidor desde el token, no el cliente. */
  code: string;
  corto: string;
  sede: string;
  /** El mueble del plano, sin el sufijo de cara. */
  fixture_code: string;
  label: string;
  /** El nombre VIEJO del mueble, que el servidor sigue guardando. Ya no es un
   *  nombre: el mueble se llama por su código. Nadie lo lee del lado del
   *  navegador — está acá porque el servidor lo manda. */
  nomenclatura?: string | null;
  proveedor: string;
  marca: string;
  desde?: string | null;
  hasta?: string | null;
  /** "A unos 4 m de las cajas" — la misma frase que iba en el correo. */
  donde?: string | null;
  /** Vender por partes: qué parte del mueble es (`texto`: «Puerta 2 de 3,
   *  contando de izquierda a derecha mirando el frente»). Sin esto, la cara. */
  parte?: { token: string; n: number | null; de: number | null; texto: string } | null;
  /** Los muebles de la sede, sólo geometría: alcanza para dibujar el plano y
   *  no lleva ni proveedor ni fechas ni valores de los espacios ajenos. */
  vecinos: UnifiedFixture[];
  tiene_planometria: boolean;
  planometria_tipo?: string | null;
  ultimo?: MountConfirmation | null;
  /** Cuándo se vence el enlace, en ISO. */
  vence?: string | null;
  /** `AAAA-MM-DD` desde el que se puede confirmar, sólo mientras todavía no
   *  se puede: la víspera del arranque del contrato del enlace (2026-10-02).
   *  Antes, el espacio puede seguir siendo de otro contrato. */
  se_confirma_desde?: string | null;
}

export const miEspacio = (): Promise<EspacioMontaje> =>
  montajeClient.get<EspacioMontaje>("/montaje/mi-espacio").then((r) => r.data);

/** Igual que la subida del tablero: en tienda la señal es irregular y sin
 *  timeout el axios espera para siempre, dejando el botón muerto. */
const TIMEOUT_SUBIDA = 90_000;

export interface ReporteInput {
  estado: "montado" | "no_montado";
  motivo?: MountMotivo;
  nota?: string;
  reportadoPor?: string;
  foto?: File | null;
}

/** El código del espacio NO se manda: lo pone el servidor desde el token.
 *  Un campo del formulario lo elige el cliente, y con un enlace repartido por
 *  correo eso alcanzaría para escribir sobre el espacio de otro proveedor. */
export const reportar = (input: ReporteInput): Promise<MountConfirmation> => {
  const form = new FormData();
  form.append("estado", input.estado);
  if (input.motivo) form.append("motivo", input.motivo);
  if (input.nota) form.append("nota", input.nota);
  if (input.reportadoPor) form.append("reportado_por", input.reportadoPor);
  if (input.foto) form.append("foto", input.foto);
  return montajeClient
    .post<MountConfirmation>("/montaje/reportar", form, { timeout: TIMEOUT_SUBIDA })
    .then((r) => r.data);
};

/** La planometría del propio espacio. Va por query param porque ni un `<img>`
 *  ni un `<iframe>` mandan la cabecera Authorization. */
export const planometriaUrl = (): string =>
  `/api/montaje/planometria?token=${encodeURIComponent(TOKEN)}`;
