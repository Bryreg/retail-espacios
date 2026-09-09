import axios from "axios";
import { useAuthStore } from "../store/authStore";

const client = axios.create({
  baseURL: "/api",
  headers: { "Content-Type": "application/json" },
});

// Attach the session token to every request.
client.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  // A file upload must NOT carry the instance's default JSON content type:
  // multipart needs a boundary, and only the browser can generate it. Leaving
  // the default in place produced a body the server could not parse at all,
  // which came back as a 422 that looked like missing fields.
  if (typeof FormData !== "undefined" && config.data instanceof FormData) {
    delete config.headers["Content-Type"];
  }
  return config;
});

/** Los dos estados que contestan 402. Llegan en `X-Estado-Cuenta`, que pone
 *  `_aplicar_estado` en `backend/app/clientes.py`. `gracia` no está porque
 *  nunca corta: avisa y deja pasar. */
const ESTADOS_QUE_CORTAN = ["suspendido", "solo_lectura"] as const;

type EstadoQueCorta = (typeof ESTADOS_QUE_CORTAN)[number];

/** Qué decir cuando el corte llega a mitad de sesión.
 *
 *  El `detail` del 402 no sirve como texto: es la misma frase que el título
 *  que ya muestra `BloqueoCuenta` ("La cuenta de este cliente está
 *  suspendida"), y el motivo que escribió el operador NO viaja acá a propósito
 *  —es información de la relación comercial y sólo se le cuenta al owner, en
 *  la respuesta del login—. Así que en caliente se dice lo único que se sabe
 *  de cierto: que el corte pasó recién y dónde está el detalle. */
const MOTIVO_EN_CALIENTE: Record<EstadoQueCorta, string> = {
  suspendido:
    "El servicio se suspendió mientras esta sesión estaba abierta. Volvé a entrar para ver el motivo.",
  solo_lectura: "Pago pendiente: se puede ver y consultar, pero no guardar cambios.",
};

function estadoDelCorte(err: unknown): EstadoQueCorta | null {
  const res = (err as { response?: { status?: number; headers?: unknown } })?.response;
  if (res?.status !== 402) return null;
  // Axios normaliza los nombres a minúsculas, pero un `AxiosHeaders` no es un
  // objeto pelado: se lee por índice igual, y si el día de mañana no viniera
  // la cabecera (un 402 de otro origen, un proxy que la corta) esto devuelve
  // null y el error sigue su camino como cualquier otro.
  const crudo = (res.headers as Record<string, unknown> | undefined)?.["x-estado-cuenta"];
  const valor = typeof crudo === "string" ? crudo.trim().toLowerCase() : "";
  return (ESTADOS_QUE_CORTAN as readonly string[]).includes(valor)
    ? (valor as EstadoQueCorta)
    : null;
}

// A 401 means the token expired or was revoked — drop the session so the
// route guard sends the user back to the login screen.
//
// Un 402 es el interruptor de estado de cuenta (Fase 2). El servidor ya cortaba
// bien; lo que faltaba era que la pantalla lo acusara. `aviso_cuenta` viaja una
// sola vez, en el login, así que una suspensión aplicada MIENTRAS alguien está
// adentro no se notaba: cada pedido daba 402, nadie los miraba, y la app seguía
// dibujada con lo que ya tenía en memoria y en `localStorage` — navegación
// entera, pestañas, botones. Se veía como un problema de red, no como un corte.
//
// Acá se escribe el estado en el store y de ahí lo toman los que ya existían:
// `App.tsx` reemplaza la app entera con `BloqueoCuenta` si es `suspendido`, y
// `AvisoCuentaBanner` pone la franja si es `solo_lectura`. NO se cierra la
// sesión: el owner tiene que poder seguir adentro para ver el motivo y pagar,
// que es la misma razón por la que el login lo deja entrar.
client.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      useAuthStore.getState().logout();
    } else {
      const estado = estadoDelCorte(err);
      if (estado) {
        useAuthStore.getState().marcarEstadoCuenta(estado, MOTIVO_EN_CALIENTE[estado]);
      }
    }
    return Promise.reject(err);
  }
);

/** Mensaje legible de un error de la API.
 *
 *  `detail` no siempre es una cadena: en los errores de validación FastAPI
 *  devuelve una LISTA de objetos, y meterla directo en el JSX rompe el render
 *  con "Objects are not valid as a React child" — la pantalla se cae justo
 *  cuando había que mostrar por qué falló. */
export function describeError(err: unknown, fallback = "No se pudo completar la operación."): string {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    const msgs = detail
      .map((d) => (d && typeof d === "object" && "msg" in d ? String((d as { msg: unknown }).msg) : ""))
      .filter(Boolean);
    if (msgs.length) return msgs.join(". ");
  }
  if (detail && typeof detail === "object" && "message" in detail) {
    return String((detail as { message: unknown }).message);
  }
  return fallback;
}

export default client;
