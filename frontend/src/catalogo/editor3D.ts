import type { FixType, GondolaType } from "../types/fixtures";
import { CATALOGO_DE_MUEBLES, formaDe, resolverTipo, tiposConBandera } from "./catalogo";

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
