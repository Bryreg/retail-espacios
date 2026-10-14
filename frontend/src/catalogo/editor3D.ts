import type { FixType, GondolaType } from "../types/fixtures";
import {
  CATALOGO_DE_MUEBLES, estampaDe, formaDe, idDeModeloBase, modelosDe, modelosPropiosDe, resolverTipo, tiposConBandera,
} from "./catalogo";
import type { FichaDeModelo, PartesDeMueble } from "./catalogo";
import type { ModeloPropio } from "./propias";
import { comoSeVendeCorto } from "../utils/partes";

/**
 * Las tablas por TIPO de mueble del editor 3D, calculadas del catálogo
 * (`catalogo/muebles.json`, que lee `catalogo/catalogo.ts`).
 *
 * Vivían adentro de `StoreEditor3D.tsx` —casi ocho mil líneas con three y
 * React—, después pasaron tal cual a este archivo para poder anotar qué hacía
 * cada tipo (`scripts/casos/catalogo-antes.json`), y ahora salen del catálogo
 * con los mismos nombres, los mismos valores y el mismo orden.
 *
 * El orden de `FIXTURE_DEFS` importa: `/taller` (`pages/TallerMuebles.tsx`)
 * elige el mueble por su POSICIÓN en la lista. Es `orden.editor3D` del
 * catálogo, y `probar-catalogo.mjs` lo compara contra el de antes.
 *
 * El editor las reexporta, así que quien las tomaba de ahí —`/taller`, el
 * visor de Vender— no cambió.
 */

export interface FixtureDef {
  type:         FixType;
  gondolaType?: GondolaType;
  label:        string;
  w: number; d: number; h: number;
  color:        string;
  emoji:        string;
  desc:         string;
  code:         string;
  /** Sólo en los modelos de la paleta (`PALETA_3D`): el id que se estampa en
   *  el mueble, su nombre, si sus medidas son una deducción, y su geometría.
   *  Los de `FIXTURE_DEFS` —los modelos base— no los llevan: colocarlos es
   *  colocar el mueble como siempre. */
  modelo?:      string;
  nombreModelo?: string;
  estimado?:    boolean;
  /** Cómo se vende lo que se coloca desde este modelo, si su ficha lo dice
   *  («por puertas», «2 bahías de impulso»): la paleta lo muestra al lado de
   *  las medidas. Vender por partes. */
  comoSeVende?: string;
  entrepanos?:  number;
  modulo?:      number;
  partes?:      PartesDeMueble;
}

// ─── Fixture catalogue ────────────────────────────────────────────────────────

/** La paleta del editor 3D, con lo que estampa en cada mueble que se coloca.
 *  El robatope mide 0,30 de ancho (el panel) y 0,40 de fondo: la profundidad
 *  de la punta, para que encaje al ras. */
export const FIXTURE_DEFS: FixtureDef[] = CATALOGO_DE_MUEBLES.orden.editor3D.map((entrada) => {
  const r = resolverTipo(entrada);
  if (!r) throw new Error(`catálogo de muebles: «${entrada}» no es un tipo`);
  const f = formaDe(r.tipo, r.variante);
  return {
    type: r.clave as FixType,
    ...(r.variante !== undefined ? { gondolaType: r.variante as GondolaType } : {}),
    label: f.rotuloEditor ?? r.clave,
    w: f.medidas?.w ?? 1, d: f.medidas?.d ?? 1, h: f.medidas?.h ?? 1,
    color: f.color ?? "",
    emoji: f.emoji ?? "",
    desc: f.descripcion ?? "",
    code: r.tipo.prefijo,
  };
});

/**
 * Los muebles que pueden llevar el producto del proveedor.
 *
 * Antes eran DOS listas que se cruzaban —una de «tiene estantes» y otra de
 * «tiene cara pintable»— y bastaba faltar en cualquiera para quedar afuera. El
 * resultado: 8 de los 13 tipos que se venden no mostraban nada al cargarles el
 * arte, y justo los promocionales (isla, batea, impulsador, ristra). Una sola
 * lista, y lo que decide CÓMO se pinta es `getPanelShelfSpan`.
 *
 * Lo que no está acá es infraestructura: no se alquila, así que no lleva
 * producto de nadie. Es la bandera `producto` del catálogo.
 */
export const TIPOS_CON_PRODUCTO = new Set<string>(tiposConBandera("producto"));

/**
 * Los muebles donde el producto de PRUEBA se para como envases 3D
 * (`ProductoDePrueba`). Son los que venden por entrepaños y tienen su cuenta
 * en `ventaDeTipo`: ahí el producto se apoya en la altura exacta de cada
 * entrepaño. La vitrina, la ristra, los volcados, la cruz, el impulsador y la
 * isla siguen con la lámina, como antes: no tienen entrepaños donde pararlo.
 * Es la bandera `prueba3D` del catálogo.
 */
export const TIPOS_CON_PRUEBA_3D = new Set<string>(tiposConBandera("prueba3D"));

/** Dónde se ofrece el surtido (varios productos del proveedor en bloques).
 *  No en la nevera —las rejillas automáticas se acomodan a UN producto, y
 *  con alturas distintas los demás no entrarían— ni en el robatope, que
 *  tiene un solo vano de 30 cm. Es la bandera `surtido` del catálogo. */
export const TIPOS_CON_SURTIDO = new Set<string>(tiposConBandera("surtido"));

/**
 * La paleta del editor 3D: por familia —cada entrada de `orden.editor3D`—, su
 * modelo base (el de `FIXTURE_DEFS`, que se coloca como siempre) y los modelos
 * de muebles de verdad que tiene el catálogo (`modelos`).
 *
 * Un modelo se coloca con las medidas, el color y la geometría de su ficha, y
 * con el rótulo y el emoji de su tipo: el rótulo es el que el plano 2D estampa
 * en `label` al abrirse, así que es el mismo de siempre. El nombre del modelo
 * se lee de la ficha, por el `modelo` que guarda el mueble.
 */
export interface FamiliaDePaleta {
  /** `tipo` o `tipo:variante`, como en `orden.editor3D`. */
  entrada: string;
  /** El id del modelo base implícito (`base:<tipo>`). */
  idBase: string;
  base: FixtureDef;
  modelos: FixtureDef[];
}

/** La entrada de la paleta de un modelo: lo que coloca. La MISMA para un
 *  modelo de RECABRA y para una ficha propia del supermercado: el mueble nace
 *  con el rótulo y el emoji de su familia y con las medidas, el color y la
 *  geometría de la ficha, y guarda su id (`base:…` o `cli:…`). */
export function defDeModelo(base: FixtureDef, m: FichaDeModelo): FixtureDef {
  const e = estampaDe(m);
  return {
    ...base,
    w: e.w, d: e.d, h: e.h,
    color: e.color,
    desc: m.fuente.nota ?? m.fuente.url ?? "",
    modelo: m.id,
    nombreModelo: m.nombre,
    estimado: m.fuente.confiabilidad === "estimado",
    ...comoSeVendeCorto(m),
    ...(e.entrepanos !== undefined ? { entrepanos: e.entrepanos } : {}),
    ...(e.modulo !== undefined ? { modulo: e.modulo } : {}),
    ...(e.partes !== undefined ? { partes: e.partes } : {}),
  };
}

export const PALETA_3D: FamiliaDePaleta[] = CATALOGO_DE_MUEBLES.orden.editor3D.map((entrada, i) => {
  const base = FIXTURE_DEFS[i];
  return {
    entrada,
    idBase: idDeModeloBase(entrada),
    base,
    modelos: modelosDe(entrada).map((m) => defDeModelo(base, m)),
  };
});

/**
 * La paleta con las fichas propias del supermercado: cada una debajo de su
 * familia, DESPUÉS de los modelos de RECABRA, y sin las retiradas. Sin fichas
 * propias es `PALETA_3D` misma; con ellas, las familias que no tienen ninguna
 * siguen siendo el mismo objeto, y sus modelos también (el editor compara la
 * entrada elegida por identidad). Se arma una vez por cambio de las fichas
 * (`useMemo` sobre `useFichasPropias()`).
 */
export function paletaConPropias(propias: readonly ModeloPropio[]): FamiliaDePaleta[] {
  if (propias.length === 0) return PALETA_3D;
  return PALETA_3D.map((familia) => {
    const suyas = modelosPropiosDe(familia.entrada, propias);
    return suyas.length === 0 ? familia
      : { ...familia, modelos: [...familia.modelos, ...suyas.map((m) => defDeModelo(familia.base, m))] };
  });
}
