import client from "./client";
import { useAuthStore } from "../store/authStore";

/** La planometría de un contrato: cómo debe quedar armada esa exhibición.
 *
 *  Cuelga del CONTRATO y no del mueble: la misma punta recibe una distinta cada
 *  vez que se alquila, y guardada en el mueble habría un solo casillero que se
 *  sobreescribe —al entrar el proveedor siguiente se pierde la prueba de qué se
 *  acordó armar con el anterior—. */
export interface Planometria {
  id: number;
  lease_id: number;
  filename: string;
  content_type: string;
  size: number;
  subido_por?: string | null;
  uploaded_at?: string | null;
  /** Sólo al CARGARLA, y sólo si el contrato esperaba la planometría para
   *  avisar al montaje (`docs/rediseno/vender-api.md` §4): `salio` (a quién se
   *  encoló; vacío sin correo o sin mercaderista) o `espera_distribucion` (un
   *  porcentaje de cara con la zona sin confirmar). `null`: no había nada que
   *  avisar (un contrato de antes, o ya avisado). */
  aviso_de_montaje?: AvisoDeMontaje | null;
}

export interface AvisoDeMontaje {
  estado: "salio" | "espera_distribucion";
  smtp_listo: boolean;
  montaje: string[];
}

/** Mismo tope que la foto de montaje: en tienda la señal es irregular y sin
 *  timeout el axios del proyecto espera para siempre, dejando el botón muerto
 *  sin forma de reintentar que no sea recargar. */
const TIMEOUT_SUBIDA = 90_000;

export const subirPlanometria = (
  leaseId: number,
  archivo: File,
  subidoPor?: string,
): Promise<Planometria> => {
  const form = new FormData();
  form.append("file", archivo);
  if (subidoPor) form.append("subido_por", subidoPor);
  return client
    .post<Planometria>(`/leases/${leaseId}/planometria`, form, { timeout: TIMEOUT_SUBIDA })
    .then((r) => r.data);
};

/** La del contrato que corre HOY sobre ese espacio, o null si no hay.
 *
 *  Es el camino de todo el que no acaba de firmar el contrato: el mercaderista
 *  llega con el código en el enlace del correo, y el tablero tampoco tiene a
 *  mano el id del contrato —el JSON del layout no lo guarda—. */
export const planometriaDelEspacio = (spaceCode: string): Promise<Planometria | null> =>
  client
    .get<Planometria>(`/planometrias/por-espacio/${encodeURIComponent(spaceCode)}`)
    .then((r) => r.data)
    .catch(() => null);

/** URL para mostrarla. Se sirve inline, así que sirve tanto para un <img> como
 *  para abrirla en otra pestaña (el PDF del proveedor cae en el visor del
 *  navegador).
 *
 *  El token va como query param porque ni un <img> ni un <iframe> mandan el
 *  header Authorization; el backend lo acepta sólo para servir archivos. */
export const planometriaUrl = (id: number): string => {
  const token = useAuthStore.getState().token ?? "";
  return `/api/planometrias/${id}?token=${encodeURIComponent(token)}`;
};

export const borrarPlanometria = (leaseId: number): Promise<void> =>
  client.delete(`/leases/${leaseId}/planometria`).then(() => undefined);
