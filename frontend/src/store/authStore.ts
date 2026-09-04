import { create } from "zustand";
import { persist } from "zustand/middleware";
import { signOutFirebase } from "../api/firebase";

export type Role = "admin" | "worker";

interface AuthState {
  token: string | null;
  role: Role | null;
  /** De qué supermercado es esta sesión. Se guarda sólo para poder mostrarlo;
   *  quien manda es el que va firmado adentro del token. */
  cliente: string | null;
  clienteNombre: string | null;
  /** Sólo presentes en sesiones nacidas de Google/correo (Fase 1 identidad):
   *  el login legado no manda ninguno de los dos, y quedan en `null`. */
  email: string | null;
  nombre: string | null;
  setAuth: (
    token: string,
    role: Role,
    cliente?: string,
    clienteNombre?: string,
    email?: string,
    nombre?: string
  ) => void;
  logout: () => void;
}

/** Session auth — token + role, persisted so a refresh keeps the session.
 *  The backend validates the token on every request; a 401 clears it. */
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      role: null,
      cliente: null,
      clienteNombre: null,
      email: null,
      nombre: null,
      setAuth: (token, role, cliente, clienteNombre, email, nombre) =>
        set({
          token,
          role,
          cliente: cliente ?? null,
          clienteNombre: clienteNombre ?? null,
          email: email ?? null,
          nombre: nombre ?? null,
        }),
      logout: () => {
        set({
          token: null, role: null, cliente: null, clienteNombre: null,
          email: null, nombre: null,
        });
        // Cierra también la sesión de Firebase, si el SDK llegó a
        // inicializarse — si nunca se usó la vía nueva esto es un no-op
        // instantáneo (ver `signOutFirebase` en api/firebase.ts). No se
        // espera la promesa: salir de la app no debe quedar colgado de una
        // llamada de red al proveedor de identidad.
        void signOutFirebase();
      },
    }),
    { name: "retail-auth-v1" }
  )
);

/** Convenience selector: true when the current session is an admin. */
export const selectIsAdmin = (s: AuthState): boolean => s.role === "admin";
