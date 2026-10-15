import { useEffect, useSyncExternalStore } from "react";
import { listarModelosPropios } from "../api/muebles";
import {
  fichasPropias, fijarFichasPropias, olvidarFichasPropias, suscribirFichasPropias,
  type ModeloPropio,
} from "../catalogo/propias";
import { useAuthStore } from "./authStore";

/**
 * Dónde viven, en el navegador, las fichas propias del supermercado: se leen
 * UNA vez por sesión (`GET /api/muebles/modelos`, retiradas incluidas) y otra
 * vez cada vez que el taller guarda, retira o reactiva una
 * (`recargarFichasPropias`). Las guarda `catalogo/propias.ts`, que es donde
 * las busca `rateTypeOf` (por eso no son un estado de React).
 *
 * No entra en lo que baja la landing: lo importan el tablero, los dos editores
 * y el taller, que se cargan aparte. Tampoco se guarda en `localStorage`: el
 * plano sí sobrevive a cerrar la sesión (para verlo sin red), las fichas no, y
 * así no hay forma de que la sesión de otro supermercado en la misma máquina
 * herede las del anterior. Si la lectura falla (sin red, un 502), se queda sin
 * ellas —las paletas ofrecen sólo los modelos de RECABRA, los muebles
 * colocados se dibujan igual porque tienen la ficha estampada— y **reintenta
 * sola**, con espera creciente (2 s, 4 s, 8 s… hasta un minuto), mientras siga
 * la misma sesión. Antes sólo reintentaba al montar otra pantalla que las
 * pidiera, y en Vender eso no pasa nunca: `Ficha` está siempre montada, y toda
 * la sesión de venta cobraba la media estiba propia como estiba entera.
 */

/** La primera espera antes de reintentar una lectura fallida, y el tope. */
export const ESPERA_INICIAL_MS = 2_000;
export const ESPERA_MAXIMA_MS = 60_000;

/** La sesión para la que se leyeron (o se están leyendo): el token, que
 *  cambia con cada ingreso. */
let sesionLeida: string | null = null;
let enCurso: Promise<void> | null = null;
/** El reintento programado después de una lectura fallida (de qué sesión),
 *  y cuánto espera el próximo de esa sesión. Una lectura buena, cerrar la
 *  sesión o la falla de OTRA sesión vuelven a la espera inicial. */
let reintento: { sesion: string; reloj: ReturnType<typeof setTimeout> } | null = null;
let espera = ESPERA_INICIAL_MS;
let sesionDeLaEspera: string | null = null;

function cancelarReintento(): void {
  if (reintento !== null) clearTimeout(reintento.reloj);
  reintento = null;
}

function olvidarReintentos(): void {
  cancelarReintento();
  sesionDeLaEspera = null;
  espera = ESPERA_INICIAL_MS;
}

/** Vuelve a leer más tarde, si para entonces sigue la misma sesión y nadie
 *  las leyó en el medio. Uno solo por sesión: el de otra sesión se cancela
 *  (si no, el reintento de la sesión anterior tapaba el de la nueva y,
 *  al dispararse, no hacía nada). */
function reintentarDespues(sesion: string): void {
  if (reintento?.sesion === sesion) return;
  cancelarReintento();
  if (sesionDeLaEspera !== sesion) {
    sesionDeLaEspera = sesion;
    espera = ESPERA_INICIAL_MS;
  }
  const ms = espera;
  espera = Math.min(espera * 2, ESPERA_MAXIMA_MS);
  reintento = {
    sesion,
    reloj: setTimeout(() => {
      reintento = null;
      if (sesionDeAhora() === sesion && sesionLeida === null) void leer(sesion);
    }, ms),
  };
}

/** La sesión de ahora, o `null` si no hay (o es de la consola de la
 *  plataforma, que no tiene fichas). */
function sesionDeAhora(): string | null {
  const { token, plataforma } = useAuthStore.getState();
  return token && !plataforma ? token : null;
}

function leer(sesion: string): Promise<void> {
  sesionLeida = sesion;
  const pedido = listarModelosPropios()
    .then((lista) => {
      // Si la sesión cambió mientras se leía, la respuesta es de la otra.
      if (sesionDeAhora() === sesion) {
        olvidarReintentos();
        fijarFichasPropias(Array.isArray(lista) ? lista : []);
      }
    })
    .catch(() => {
      // Sin red, o un 5xx: se queda con lo que tenía y reintenta sola más
      // tarde (o antes, si otra pantalla las pide).
      if (sesionLeida === sesion) {
        sesionLeida = null;
        if (sesionDeAhora() === sesion) reintentarDespues(sesion);
      }
    })
    .finally(() => { if (enCurso === pedido) enCurso = null; });
  enCurso = pedido;
  return pedido;
}

/** Las lee si esta sesión todavía no las leyó. Una sesión nueva (otro
 *  ingreso, otro supermercado) olvida las de la anterior ANTES de leer. */
export function cargarFichasPropias(): Promise<void> {
  const sesion = sesionDeAhora();
  if (!sesion) {
    sesionLeida = null;
    olvidarReintentos();
    olvidarFichasPropias();
    return Promise.resolve();
  }
  if (sesionLeida === sesion) return enCurso ?? Promise.resolve();
  olvidarFichasPropias();
  return leer(sesion);
}

/** Las vuelve a leer: el taller acaba de guardar, retirar o reactivar una. */
export function recargarFichasPropias(): Promise<void> {
  const sesion = sesionDeAhora();
  if (!sesion) return Promise.resolve();
  return leer(sesion);
}

// Al cerrar la sesión se olvidan, aunque no haya ninguna pantalla montada.
useAuthStore.subscribe((s) => {
  if (!s.token) olvidarReintentos();
  if (!s.token && sesionLeida !== null) {
    sesionLeida = null;
    olvidarFichasPropias();
  }
});

/**
 * Las fichas propias de esta sesión, retiradas incluidas, para dibujar con
 * ellas: las lee si hace falta y vuelve a dibujar cuando cambian. Quien las
 * usa en un `useMemo` (las paletas, lo que pregunta la tarifa) las pone en
 * sus dependencias: es la MISMA lista mientras no cambien.
 */
export function useFichasPropias(): readonly ModeloPropio[] {
  const token = useAuthStore((s) => s.token);
  const cliente = useAuthStore((s) => s.cliente);
  useEffect(() => { void cargarFichasPropias(); }, [token, cliente]);
  return useSyncExternalStore(suscribirFichasPropias, fichasPropias, fichasPropias);
}
