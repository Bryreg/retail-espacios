import { create } from "zustand";
import { describeError } from "../api/client";
import { ocupacion as leerOcupacion, resumen as leerResumen, type OcupacionOut, type ParametrosDeResumen, type ResumenOut } from "../api/participaciones";
import type { OcupacionDeCara } from "../utils/participaciones";
import { useAuthStore } from "./authStore";

/**
 * La LECTURA de las participaciones de cara: la ocupación anónima de cada sede
 * (Vender, Supervisar, el plano 2D y las bandas de estado del 3D, §4.8 y
 * §10.8) y el resumen de Supervisar en caché. Lo importan el tablero, el plano
 * 2D y el Editor 3D; la EDICIÓN vive aparte (`distribucionStore.ts`, sólo en
 * el pedazo del 3D), así el tablero no se baja el editor.
 *
 *   · Sin `persist`: nada de esto va a `localStorage` ni a `sessionStorage`.
 *   · Las claves llevan el cliente (`${cliente}|${sede}`), y el store se
 *     vacía entero al cambiar de sesión o de cliente (la regla dura «los planos
 *     del store están scoped por cliente»: `logout` no recarga la página). Una
 *     respuesta que llega después de cambiar de sesión se tira.
 *   · Se lee una vez por sede (los pedidos simultáneos comparten el mismo) y
 *     otra vez cada vez que vuelve una escritura de participaciones
 *     (`recargarOcupacion`).
 */

interface OcupacionStore {
  /** Por `${cliente}|${sede}`. */
  ocupacion: Record<string, OcupacionOut>;
  /** Lo que falló la última vez, por la misma clave. */
  error: Record<string, string>;
  /** El resumen de Supervisar, por `${cliente}|${sede}|${dia}|${desde}|${hasta}|${proveedor}|${espacio}`. */
  resumen: Record<string, ResumenOut>;
  /** Lee la ocupación de la sede si esta sesión todavía no la tiene. */
  cargarOcupacion: (sede: string) => Promise<OcupacionOut | null>;
  /** La vuelve a leer: acaba de volver una escritura de participaciones. */
  recargarOcupacion: (sede: string) => Promise<OcupacionOut | null>;
  /** Lee el resumen (o lo devuelve de la caché). */
  cargarResumen: (params: ParametrosDeResumen, opciones?: { forzar?: boolean }) => Promise<ResumenOut | null>;
  /** Olvida los resúmenes de la sede (cambió algo que los cuenta). */
  invalidarResumen: (sede: string) => void;
  /** Vacía todo (cambio de sesión o de cliente). */
  reiniciar: () => void;
}

/** La sesión de ahora: el token y el cliente (los dos deciden de quién son
 *  los datos). */
function sesion(): { token: string | null; cliente: string } {
  const { token, cliente } = useAuthStore.getState();
  return { token, cliente: cliente ?? "" };
}

export const claveDeSede = (cliente: string, sede: string) => `${cliente}|${sede}`;
export const claveDeResumen = (cliente: string, p: ParametrosDeResumen) =>
  [cliente, p.sede, p.dia ?? "", p.desde ?? "", p.hasta ?? "", p.proveedor_id ?? "", p.espacio ?? ""].join("|");

/** Los pedidos en vuelo, por clave (y de qué sesión son). */
const enVuelo = new Map<string, { token: string | null; pedido: Promise<OcupacionOut | null> }>();
/** Cada pedido lleva un número que sólo crece; por clave, el del último que
 *  se escribió. Una lectura VIEJA que tarda y llega después de la que trajo
 *  una escritura de recién (`recargarOcupacion`) no la pisa: si la pisara,
 *  Vender mostraría libre una cara que ya se vendió hasta recargar la página. */
let numeroDePedido = 0;
const escrito = new Map<string, number>();
const esViejo = (clave: string, n: number) => n < (escrito.get(clave) ?? 0);

export const useOcupacionStore = create<OcupacionStore>()((set, get) => {
  const leer = (sede: string): Promise<OcupacionOut | null> => {
    const { token, cliente } = sesion();
    if (!token) return Promise.resolve(null);
    const clave = claveDeSede(cliente, sede);
    const n = ++numeroDePedido;
    const pedido = leerOcupacion(sede)
      .then((o) => {
        const ahora = sesion();
        if (ahora.token !== token || ahora.cliente !== cliente) return null;   // es de otra sesión
        if (esViejo(clave, n)) return get().ocupacion[clave] ?? null;          // ya llegó una más nueva
        escrito.set(clave, n);
        set((s) => {
          const error = { ...s.error };
          delete error[clave];
          return { ocupacion: { ...s.ocupacion, [clave]: o }, error };
        });
        return o;
      })
      .catch((e) => {
        const ahora = sesion();
        if (ahora.token === token && ahora.cliente === cliente && !esViejo(clave, n)) {
          set((s) => ({ error: { ...s.error, [clave]: describeError(e, "No se pudo leer la ocupación de las participaciones.") } }));
        }
        return null;
      })
      .finally(() => { if (enVuelo.get(clave)?.pedido === pedido) enVuelo.delete(clave); });
    enVuelo.set(clave, { token, pedido });
    return pedido;
  };
  return {
    ocupacion: {},
    error: {},
    resumen: {},
    cargarOcupacion: (sede) => {
      const { token, cliente } = sesion();
      if (!token) return Promise.resolve(null);
      const clave = claveDeSede(cliente, sede);
      const ya = get().ocupacion[clave];
      if (ya) return Promise.resolve(ya);
      const vuelo = enVuelo.get(clave);
      if (vuelo && vuelo.token === token) return vuelo.pedido;
      return leer(sede);
    },
    recargarOcupacion: (sede) => leer(sede),
    cargarResumen: async (params, opciones) => {
      const { token, cliente } = sesion();
      if (!token) return null;
      const clave = claveDeResumen(cliente, params);
      const ya = get().resumen[clave];
      if (ya && !opciones?.forzar) return ya;
      const n = ++numeroDePedido;
      const r = await leerResumen(params);
      const ahora = sesion();
      if (ahora.token !== token || ahora.cliente !== cliente) return null;
      const k = `resumen|${clave}`;
      if (esViejo(k, n)) return get().resumen[clave] ?? r;   // ya llegó uno más nuevo con los mismos parámetros
      escrito.set(k, n);
      set((s) => ({ resumen: { ...s.resumen, [clave]: r } }));
      return r;
    },
    invalidarResumen: (sede) => {
      const { cliente } = sesion();
      const prefijo = `${cliente}|${sede}|`;
      const resumen = Object.fromEntries(Object.entries(get().resumen).filter(([k]) => !k.startsWith(prefijo)));
      set({ resumen });
    },
    reiniciar: () => {
      enVuelo.clear();
      escrito.clear();
      set({ ocupacion: {}, error: {}, resumen: {} });
    },
  };
});

/** La ocupación de una cara (código completo, `NAVE-GON-01` o `NAVE-GON-01-B`)
 *  en la sesión de ahora, o undefined si la sede no se leyó o la cara no se
 *  vende por participación. */
export function ocupacionDeLaCara(s: Pick<OcupacionStore, "ocupacion">, sede: string, codigoCara: string): OcupacionDeCara | undefined {
  const o = s.ocupacion[claveDeSede(sesion().cliente, sede)];
  if (!o) return undefined;
  return Object.prototype.hasOwnProperty.call(o.caras, codigoCara) ? o.caras[codigoCara] : undefined;
}

// Al cambiar de sesión o de cliente se vacía, aunque no haya ninguna pantalla
// montada: lo de un supermercado no se le muestra a otro en la misma pestaña.
useAuthStore.subscribe((s, antes) => {
  if (s.token !== antes.token || s.cliente !== antes.cliente) useOcupacionStore.getState().reiniciar();
});
