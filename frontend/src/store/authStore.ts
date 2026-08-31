import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Role = "admin" | "worker";

interface AuthState {
  token: string | null;
  role: Role | null;
  /** De qué supermercado es esta sesión. Se guarda sólo para poder mostrarlo;
   *  quien manda es el que va firmado adentro del token. */
  cliente: string | null;
  clienteNombre: string | null;
  setAuth: (token: string, role: Role, cliente?: string, clienteNombre?: string) => void;
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
      setAuth: (token, role, cliente, clienteNombre) =>
        set({
          token,
          role,
          cliente: cliente ?? null,
          clienteNombre: clienteNombre ?? null,
        }),
      logout: () => set({ token: null, role: null, cliente: null, clienteNombre: null }),
    }),
    { name: "retail-auth-v1" }
  )
);

/** Convenience selector: true when the current session is an admin. */
export const selectIsAdmin = (s: AuthState): boolean => s.role === "admin";
