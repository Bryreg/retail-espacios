import { create } from "zustand";
import client from "./client";

/**
 * El token para VER archivos (auditoría pre-lanzamiento, P2-1).
 *
 * Un `<img>`, un `<iframe>` o el cargador de texturas del 3D no mandan la
 * cabecera `Authorization`, así que el archivo se pide con `?token=` en la URL.
 * Antes iba el JWT de sesión (12 horas, abre toda la API) y quedaba en los logs
 * de acceso, el historial y el `Referer`. Ahora va éste: lo da
 * `POST /api/auth/token-medios`, vive 15 minutos, sólo abre las rutas de ver
 * archivos y se renueva solo antes de vencer. Vive en memoria, nunca en
 * localStorage.
 */
interface EstadoMedios {
  token: string | null;
  /** Ya se intentó al menos una vez (con o sin suerte): la app no espera más. */
  listo: boolean;
}

export const useMedios = create<EstadoMedios>(() => ({ token: null, listo: false }));

let reloj: ReturnType<typeof setTimeout> | null = null;
let vuelta = 0;

/** Margen antes del vencimiento para pedir el siguiente. */
const ANTES_DE_VENCER_S = 120;
const REINTENTO_S = 30;

function programar(segundos: number, v: number) {
  if (reloj) clearTimeout(reloj);
  reloj = setTimeout(() => void pedir(v), Math.max(5, segundos) * 1000);
}

async function pedir(v: number) {
  try {
    const r = await client.post<{ token: string; vence_en: number }>("/auth/token-medios");
    if (v !== vuelta) return; // se cerró la sesión mientras volvía
    useMedios.setState({ token: r.data.token, listo: true });
    programar(r.data.vence_en - ANTES_DE_VENCER_S, v);
  } catch {
    if (v !== vuelta) return;
    // Un 401 ya lo maneja el interceptor (cierra la sesión). Cualquier otra
    // falla no traba la app: se sigue y se reintenta.
    useMedios.setState({ listo: true });
    programar(REINTENTO_S, v);
  }
}

/** Arranca (o reinicia) el ciclo para la sesión abierta. */
export function iniciarMedios(): void {
  vuelta += 1;
  useMedios.setState({ token: null, listo: false });
  void pedir(vuelta);
}

/** Sin sesión no hay token de medios. */
export function pararMedios(): void {
  vuelta += 1;
  if (reloj) clearTimeout(reloj);
  reloj = null;
  useMedios.setState({ token: null, listo: false });
}

/** El token para poner en `?token=`, o "" si todavía no llegó. */
export const tokenDeMedios = (): string => useMedios.getState().token ?? "";
