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
/** Los temas de Ajustes (rediseño UX 2026-10, etapa 8). */
export type TemaDeAjustes = "comercial" | "sede" | "avisos" | "equipo" | "cuenta";

/** Lo que el armazón le pide a la pantalla comercial (`DashboardView`), que
 *  es la que lo sabe hacer: abrir la planilla, ir al Diccionario. */
export type PedidoALaPantalla = "planilla" | "diccionario";

/** De qué montaje se vino a Pendientes («Ubicar la zona», «Adjuntar
 *  planometría»): la bandeja marca su fila y una barra ofrece volver a
 *  Montajes mientras se resuelve (2026-10-28). */
export interface DesdeMontaje {
  /** `SEDE-CODIGO` del contrato. */
  codigo: string;
  /** Lo que se lee: `GON-04-PC1`. */
  corto: string;
  estado: "falta_zona" | "falta_planometria";
  /** Proveedor · marca. */
  quien: string;
}

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
  /** Ajustes, abierto en un tema (`null`: cerrado). */
  ajustes: TemaDeAjustes | null;
  abrirAjustes: (tema?: TemaDeAjustes) => void;
  cerrarAjustes: () => void;
  /** Lo pedido a la pantalla comercial; ella lo atiende y lo borra. */
  pedido: PedidoALaPantalla | null;
  pedir: (p: PedidoALaPantalla) => void;
  atender: () => void;
  desdeMontaje: DesdeMontaje | null;
  abrirDesdeMontaje: (d: DesdeMontaje) => void;
  olvidarMontaje: () => void;
  /** El buscador de funciones (Ctrl K) y la ayuda «?» de la pantalla. */
  buscador: boolean;
  setBuscador: (v: boolean) => void;
  ayuda: boolean;
  setAyuda: (v: boolean) => void;
}

export const useArmazon = create<EstadoDelArmazon>()((set) => ({
  cuentaPendientes: 0,
  setCuentaPendientes: (n) => set((s) => (s.cuentaPendientes === n ? s : { cuentaPendientes: n })),
  bandejaAbierta: false,
  grupoPedido: null,
  abrirBandeja: (grupo = null) => set({ bandejaAbierta: true, grupoPedido: grupo }),
  cerrarBandeja: () => set({ bandejaAbierta: false, grupoPedido: null }),
  ajustes: null,
  abrirAjustes: (tema = "comercial") => set({ ajustes: tema }),
  cerrarAjustes: () => set({ ajustes: null }),
  pedido: null,
  pedir: (p) => set({ pedido: p }),
  atender: () => set({ pedido: null }),
  desdeMontaje: null,
  abrirDesdeMontaje: (d) => set({ desdeMontaje: d, bandejaAbierta: true, grupoPedido: null }),
  olvidarMontaje: () => set({ desdeMontaje: null }),
  buscador: false,
  setBuscador: (v) => set({ buscador: v }),
  ayuda: false,
  setAyuda: (v) => set({ ayuda: v }),
}));
