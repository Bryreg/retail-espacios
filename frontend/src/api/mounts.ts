import client from "./client";

export type MountEstado = "montado" | "no_montado";

/** Por qué no se pudo montar. Se guarda como código para poder contarlos
 *  después; la etiqueta que ve la gente vive en la pantalla. */
export type MountMotivo = "sin_material" | "sin_producto" | "espacio_ocupado" | "otro";

export interface MountConfirmation {
  id: number;
  space_code: string;
  sede?: string | null;
  estado: MountEstado;
  motivo?: MountMotivo | null;
  nota?: string | null;
  file_id?: number | null;
  reportado_por?: string | null;
  rol?: string | null;
  /** Hora del servidor, no del dispositivo. */
  confirmado_en?: string | null;
}

export const fetchMounts = (sede?: string): Promise<MountConfirmation[]> =>
  client
    .get<MountConfirmation[]>("/mounts/", { params: sede ? { sede } : undefined })
    .then((r) => r.data);

export interface ConfirmMountInput {
  spaceCode: string;
  estado: MountEstado;
  sede?: string;
  motivo?: MountMotivo;
  nota?: string;
  reportadoPor?: string;
  foto?: File | null;
}

/** Cuánto se espera una subida antes de darla por perdida.
 *
 *  El axios del proyecto no tiene timeout, o sea que espera para siempre. En
 *  una tienda con señal irregular eso deja el botón deshabilitado sin salida:
 *  la única forma de volver a intentar era recargar, y recargar pierde la
 *  foto. Con un tope, el error llega, el formulario sigue lleno y el botón
 *  vuelve a andar. */
const TIMEOUT_SUBIDA = 90_000;

/** Multipart porque lleva la foto. Abierto a worker: es su trabajo. */
export const confirmMount = (input: ConfirmMountInput): Promise<MountConfirmation> => {
  const form = new FormData();
  form.append("space_code", input.spaceCode);
  form.append("estado", input.estado);
  if (input.sede) form.append("sede", input.sede);
  if (input.motivo) form.append("motivo", input.motivo);
  if (input.nota) form.append("nota", input.nota);
  if (input.reportadoPor) form.append("reportado_por", input.reportadoPor);
  if (input.foto) form.append("foto", input.foto);
  return client
    .post<MountConfirmation>("/mounts/", form, { timeout: TIMEOUT_SUBIDA })
    .then((r) => r.data);
};

/** El último reporte de cada espacio, indexado por código.
 *  El backend devuelve más reciente primero, así que el primero que aparece
 *  para cada código es el que vale. */
export function latestByCode(
  list: MountConfirmation[],
): Record<string, MountConfirmation> {
  const out: Record<string, MountConfirmation> = {};
  for (const m of list) {
    if (!out[m.space_code]) out[m.space_code] = m;
  }
  return out;
}
