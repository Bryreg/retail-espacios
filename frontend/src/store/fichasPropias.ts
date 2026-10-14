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
 * herede las del anterior. Si la lectura falla (sin red), se queda sin ellas
 * —las paletas ofrecen sólo los modelos de RECABRA, los muebles colocados se
 * dibujan igual porque tienen la ficha estampada— y se reintenta la próxima
 * vez que se monte una pantalla que las pida.
 */

/** La sesión para la que se leyeron (o se están leyendo): el token, que
 *  cambia con cada ingreso. */
let sesionLeida: string | null = null;
let enCurso: Promise<void> | null = null;

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
      if (sesionDeAhora() === sesion) fijarFichasPropias(Array.isArray(lista) ? lista : []);
    })
    .catch(() => {
      // Sin red, o un 5xx: se queda con lo que tenía y se reintenta la
      // próxima vez que alguien las pida.
      if (sesionLeida === sesion) sesionLeida = null;
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
