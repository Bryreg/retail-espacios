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

// A 401 means the token expired or was revoked — drop the session so the
// route guard sends the user back to the login screen.
client.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      useAuthStore.getState().logout();
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
