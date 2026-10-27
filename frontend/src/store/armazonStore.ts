import { create } from "zustand";

/**
 * Lo que el armazón de la aplicación (menú, barra de arriba) necesita saber de
 * las pantallas, y lo que les pide (rediseño UX 2026-10).
 *
 * La pantalla comercial (`DashboardView`) es la que sabe cuánto hay para
 * revisar —lo cuenta con lo que ya bajó—; el armazón lo dibuja. No se
 * persiste: es el estado de esta pestaña, no una preferencia ni un dato.
 */
interface EstadoDelArmazon {
  /** Cuánto hay para revisar (la pastilla roja). */
  cuentaPendientes: number;
  setCuentaPendientes: (n: number) => void;
}

export const useArmazon = create<EstadoDelArmazon>()((set) => ({
  cuentaPendientes: 0,
  setCuentaPendientes: (n) => set((s) => (s.cuentaPendientes === n ? s : { cuentaPendientes: n })),
}));
