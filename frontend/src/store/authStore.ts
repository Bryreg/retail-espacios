import { create } from "zustand";
import { persist } from "zustand/middleware";
import { signOutFirebase } from "../api/firebase";

export type Role = "admin" | "worker";

/** Fase 2 clientes: lo que trae el login cuando el cliente NO está
 *  `activo`. `motivo` lo escribió el operador al mover el interruptor;
 *  `suspendido` sólo lo puede traer una sesión de owner (worker/admin
 *  reciben 402 al loguearse y nunca llegan a guardar sesión). No es un claim
 *  del JWT — campo de RESPUESTA nada más, ver contrato Fase 2 §2.2 F. */
export type EstadoCuentaAviso = "gracia" | "solo_lectura" | "suspendido";

export interface AvisoCuenta {
  estado: EstadoCuentaAviso;
  motivo: string;
}

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
  /** `null` cuando el cliente está `activo` (el caso normal). Se persiste
   *  junto con el resto de la sesión a propósito — a diferencia de la lista
   *  de clientes del panel de plataforma (que NUNCA toca localStorage), esto
   *  es sólo el estado de ESTA cuenta, tan sensible como el rol o el cliente
   *  que ya se guardan acá mismo. */
  avisoCuenta: AvisoCuenta | null;
  setAuth: (
    token: string,
    role: Role,
    cliente?: string,
    clienteNombre?: string,
    email?: string,
    nombre?: string,
    avisoCuenta?: AvisoCuenta | null
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
      avisoCuenta: null,
      setAuth: (token, role, cliente, clienteNombre, email, nombre, avisoCuenta) =>
        set({
          token,
          role,
          cliente: cliente ?? null,
          clienteNombre: clienteNombre ?? null,
          email: email ?? null,
          nombre: nombre ?? null,
          avisoCuenta: avisoCuenta ?? null,
        }),
      logout: () => {
        set({
          token: null, role: null, cliente: null, clienteNombre: null,
          email: null, nombre: null, avisoCuenta: null,
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
