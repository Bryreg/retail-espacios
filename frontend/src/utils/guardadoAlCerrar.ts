/**
 * El guardado de salida: lo que queda sin subir cuando se cierra la pestaña
 * (auditoría pre-lanzamiento, P3-9).
 *
 * Se manda con `fetch(…, { keepalive: true })`, que es lo único que sobrevive
 * al cierre Y lleva la cabecera `Authorization` (`navigator.sendBeacon` no
 * deja poner cabeceras ni hacer un `PUT`, así que con él el servidor contestaría
 * 401 y se perdería igual). El límite: el navegador acepta a lo sumo **64 KiB
 * de cuerpos en vuelo con keepalive, sumando todos los pedidos de la página**;
 * pasado eso, el `fetch` falla en el acto. Un plano grande (o dos sedes con
 * cambios) no entraba, y se perdía sin aviso.
 *
 * Ahora: se mandan las sedes que entran (de la más chica a la más grande, para
 * salvar la mayor cantidad), y las que no entran quedan marcadas «sin guardar»
 * en el navegador (`dirty`, que se guarda en `localStorage`). Si la pestaña
 * todavía puede preguntar (`beforeunload`), se pide confirmación para salir y
 * se larga el guardado normal; si no, suben solas la próxima vez que se abra
 * la app (`startAutoSync`). Nunca se pierden calladas.
 */

/** Lo que el navegador deja en vuelo con keepalive (64 KiB), con un margen. */
export const TOPE_KEEPALIVE_BYTES = 64 * 1024 - 1024;

export interface EnvioDeSalida {
  sede: string;
  /** El cuerpo del `PUT`, ya en JSON. */
  cuerpo: string;
}

/** Bytes del cuerpo en UTF-8 (lo que cuenta el navegador, no las letras). */
export function bytesDe(cuerpo: string): number {
  return new TextEncoder().encode(cuerpo).length;
}

/**
 * Qué sedes se mandan con keepalive y cuáles quedan para después.
 * `yaEnVuelo`: bytes que ya salieron con keepalive en este cierre (el
 * `beforeunload` manda y después el `pagehide` vuelve a preguntar).
 */
export function repartirGuardadoDeSalida(
  envios: EnvioDeSalida[],
  yaEnVuelo = 0,
  tope = TOPE_KEEPALIVE_BYTES,
): { mandar: EnvioDeSalida[]; quedan: string[] } {
  const conTamano = envios.map((e) => ({ e, n: bytesDe(e.cuerpo) })).sort((a, b) => a.n - b.n);
  const mandar: EnvioDeSalida[] = [];
  const quedan: string[] = [];
  let usados = yaEnVuelo;
  for (const { e, n } of conTamano) {
    if (usados + n <= tope) { mandar.push(e); usados += n; }
    else quedan.push(e.sede);
  }
  return { mandar, quedan };
}
