import { create } from "zustand";
import type { GrupoDeRevision } from "../components/Supervisar/paraRevisar";

/**
 * Lo que el armazón de la aplicación (menú, barra de arriba) necesita saber de
 * las pantallas, y lo que les pide (rediseño UX 2026-10).
 *
 * La pantalla comercial (`DashboardView`) es la que sabe cuánto hay para
 * revisar —lo cuenta con lo que ya bajó— y la que dibuja la bandeja de
 * Pendientes; el armazón dibuja el botón y la abre. No se persiste: es el
 * estado de esta pestaña, no una preferencia ni un dato.
 */
interface EstadoDelArmazon {
  /** Cuánto hay para revisar (la pastilla roja). */
  cuentaPendientes: number;
  setCuentaPendientes: (n: number) => void;
  /** La bandeja de Pendientes, abierta encima de la pantalla. */
  bandejaAbierta: boolean;
  /** El grupo con el que se pidió abrir (`null`: el que corresponda). */
  grupoPedido: GrupoDeRevision | null;
  abrirBandeja: (grupo?: GrupoDeRevision | null) => void;
  cerrarBandeja: () => void;
}

export const useArmazon = create<EstadoDelArmazon>()((set) => ({
  cuentaPendientes: 0,
  setCuentaPendientes: (n) => set((s) => (s.cuentaPendientes === n ? s : { cuentaPendientes: n })),
  bandejaAbierta: false,
  grupoPedido: null,
  abrirBandeja: (grupo = null) => set({ bandejaAbierta: true, grupoPedido: grupo }),
  cerrarBandeja: () => set({ bandejaAbierta: false, grupoPedido: null }),
}));
