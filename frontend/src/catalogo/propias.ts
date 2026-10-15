import type { Confiabilidad, PartesDeMueble } from "./catalogo";

/**
 * Las fichas propias de los muebles del supermercado, ya leídas de su base.
 *
 * Los modelos de RECABRA viven en `muebles.json` y cambian sólo con un
 * despliegue; los de cada supermercado —la nevera de dos puertas que tiene
 * Cañaveral y el catálogo no— los arma la dueña en el taller (pestaña
 * «Fichas») y el servidor los guarda en su base (`modelos_mueble`,
 * `/api/muebles/modelos`). Viajan en el plano como `cli:<clave>` y se colocan
 * como cualquier modelo: el mueble guarda su ficha ESTAMPADA y no se vuelve a
 * leer de acá.
 *
 * Lo que sí se busca acá, por el `modelo` del mueble, es lo mismo que se busca
 * de un modelo del catálogo (`modeloPorId` en `catalogo.ts`):
 *  · la tarifa propia (`rateTypeOf`), con la MISMA regla que el servidor
 *    (`tarifa_del_mueble`): sólo si la ficha es del tipo del mueble;
 *  · el nombre que muestra el panel del mueble;
 *  · la sugerencia de «Alto», «Entrepaños» y «Módulo» del panel.
 * Por eso las RETIRADAS también están: retirar saca la ficha de las paletas,
 * pero lo ya colocado con ella se sigue llamando así y se sigue cobrando igual.
 *
 * ── Por qué es un módulo y no el store ───────────────────────────────────────
 *
 * `rateTypeOf` es una función pura que llaman Vender, el contrato y el tablero
 * en medio de un cálculo; no puede pedir un hook. Y esto no importa nada (ni
 * el catálogo, ni la API, ni React): lo que lo llena —una vez por sesión, y de
 * nuevo al guardar una ficha— es `store/fichasPropias.ts`, que entra con las
 * pantallas de adentro y no en lo que baja la landing. Quien dibuja con las
 * fichas (las paletas, el panel, el tablero) se suscribe con
 * `useFichasPropias()`, que las devuelve y vuelve a dibujar cuando cambian.
 *
 * Nada de esto se guarda en el navegador: no sobrevive a una recarga ni pasa
 * de un supermercado a otro (`olvidarFichasPropias` al cerrar la sesión).
 */

/** De dónde salió una ficha. Una ficha propia trae la URL de la ficha técnica,
 *  una nota en palabras propias, o las dos. */
export interface FuenteDeFichaPropia {
  confiabilidad: Confiabilidad;
  url?: string;
  nota?: string;
}

/** Una ficha propia como la manda `GET /api/muebles/modelos`: la MISMA forma
 *  que un modelo de `muebles.json`, más la clave y si está retirada. Sin
 *  color (nace con el de su familia) y sin foto. */
export interface ModeloPropio {
  /** `cli:<clave>`: lo que guarda el mueble en `modelo`. No cambia nunca. */
  id: string;
  clave: string;
  /** La familia. No cambia nunca, como la tarifa. */
  tipo: string;
  /** En la góndola: `double` (central) o `wall` (de pared). */
  variante?: string;
  nombre: string;
  /** Metros: ancho, fondo y alto. En la góndola, el ancho es UN módulo. */
  w: number; d: number; h: number;
  entrepanos?: number;
  modulo?: number;
  partes?: PartesDeMueble;
  /** Una tarifa propia de su familia (la media estiba, el exhibidor de
   *  cartón). Ausente: la de su familia. */
  tarifa?: string;
  fuente: FuenteDeFichaPropia;
  /** Retirada: no se ofrece en las paletas, pero lo colocado la sigue usando. */
  retirado: boolean;
  retirado_en?: string | null;
  creado_en?: string | null;
  actualizado_en?: string | null;
  /** Sólo se lo manda el servidor a administración. */
  creado_por?: string | null;
}

/** Todas, retiradas incluidas, en el orden del servidor (familia y nombre). */
let todas: readonly ModeloPropio[] = [];
/** Un `Map` y no un objeto: un `modelo` escrito a mano en un plano no puede
 *  caer en `toString` ni en `constructor`. */
let porId: ReadonlyMap<string, ModeloPropio> = new Map();
const oyentes = new Set<() => void>();

/** Deja las fichas de esta sesión (la lista entera, retiradas incluidas) y
 *  avisa a quien dibuja con ellas. */
export function fijarFichasPropias(lista: readonly ModeloPropio[]): void {
  todas = Object.freeze([...lista]);
  porId = new Map(lista.map((m) => [m.id, m]));
  for (const oyente of [...oyentes]) oyente();
}

/** Se olvidan: la sesión se cerró, o es de otro supermercado. */
export function olvidarFichasPropias(): void {
  if (todas.length === 0) return;
  fijarFichasPropias([]);
}

/** Las fichas de esta sesión. La MISMA lista mientras no cambie: sirve de
 *  dependencia de un `useMemo` y de instantánea de `useSyncExternalStore`. */
export function fichasPropias(): readonly ModeloPropio[] {
  return todas;
}

/** La ficha propia con ese id (`cli:<clave>`), retirada o no. */
export function fichaPropiaPorId(id: string): ModeloPropio | undefined {
  return porId.get(id);
}

/** Para `useSyncExternalStore`: devuelve con qué dejar de escuchar. */
export function suscribirFichasPropias(oyente: () => void): () => void {
  oyentes.add(oyente);
  return () => { oyentes.delete(oyente); };
}
