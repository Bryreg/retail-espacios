import { CATALOGO_DE_MUEBLES, formaDe, resolverTipo, tarifaPorTipo } from "./catalogo";
import { rateTypeLabel, rateTypeOf } from "../types/fixtures";

/**
 * El nombre propio de cada familia de muebles: cómo le dice ESTE supermercado
 * («mamut», «tope de góndola», «exhibición especial») a lo que RECABRA llama
 * «Estiba», «Punta de góndola» o «Isla».
 *
 * ── De dónde sale ────────────────────────────────────────────────────────────
 *
 * Es `catalogLabels` del store (`store/fixtureStore.ts`), que existía desde
 * antes como «etiquetas del catálogo» y sólo aplicaba la biblioteca del plano
 * 2D. Vive en la base del supermercado, en `app_config`
 * (`layout_catalog_labels`), y viaja con la lista de sedes por `GET`/`PUT
 * /api/layout/settings`: lo lee cualquier sesión, lo escribe administración
 * (Configuración → «Cómo se llaman los muebles acá», o el lápiz de la
 * biblioteca del 2D). Las claves son las de la biblioteca del 2D
 * (`orden.plano2D`): la góndola tiene dos —`gondola_doble` y `gondola_mural`—
 * porque la central y la de pared se llaman distinto en la tienda.
 *
 * ── Dónde se usa, y dónde no ─────────────────────────────────────────────────
 *
 * En TODAS las pantallas del supermercado donde sale el nombre de la familia:
 * la paleta y el panel del plano 2D y del Editor 3D, Vender (la lista del
 * contrato, el visor y la lámina que se lleva el proveedor), Supervisar, Estado
 * por espacio, Montajes y Tarifas. NO en la consola de la plataforma ni en los
 * informes de asesoría: ahí manda el nombre de RECABRA, para poder comparar
 * supermercados (`scripts/probar-nombres.mjs` falla si la consola llega a este
 * archivo o a `catalogLabels`).
 *
 * Es SÓLO lo que se lee: nada de esto se guarda en el plano. El `label` del
 * mueble sigue siendo el rótulo de RECABRA (el 2D lo vuelve a escribir cada vez
 * que abre el plano), la fila de `spaces` se crea con él, y el servidor no lo
 * mira para nada. Cambiar un nombre propio no mueve ni un mueble, ni un código,
 * ni una tarifa.
 *
 * Sin nombre propio —una familia sin entrada, o con una vacía— cada función
 * devuelve EXACTAMENTE lo que esa pantalla mostraba antes: el que llama le pasa
 * su texto de siempre (`conNombrePropio`) o la cuenta de siempre es la de acá
 * (`tipoDelMueble` es `rateTypeLabel(rateTypeOf(f))`).
 */

/** `catalogLabels`: el nombre propio de cada familia, por su clave del 2D. */
export type NombresPropios = Readonly<Record<string, string>>;

/** La clave de la familia de un mueble: la de la biblioteca del plano 2D.
 *  Recibe el mueble del store (`gondola` con su `gondolaType`) o el del 2D
 *  (`gondola_doble`, `gondola_mural`). Para el nombre, como para dibujar, todo
 *  lo que no es mural es la central (`gondolaType` ausente incluido). */
export function familiaDe(f: { type: string; gondolaType?: string | null }): string {
  if (f.type === "gondola") return f.gondolaType === "wall" ? "gondola_mural" : "gondola_doble";
  return f.type;
}

/** El nombre propio de esa familia, o `undefined` si no tiene. Una entrada
 *  vacía o de puros espacios es «no tiene»; y la clave se mira con
 *  `hasOwnProperty`: un tipo escrito a mano en un plano no puede caer en
 *  `toString` ni en `constructor`. */
export function nombrePropio(familia: string, nombres: NombresPropios | null | undefined): string | undefined {
  if (!nombres || !Object.prototype.hasOwnProperty.call(nombres, familia)) return undefined;
  const n = nombres[familia];
  return typeof n === "string" && n.trim() ? n.trim() : undefined;
}

/** El nombre de la familia del mueble como lo dicen acá: el propio o, sin él,
 *  `deSiempre` —el texto que esa pantalla mostraba antes (`f.label`,
 *  `f.label || f.code`, el rótulo del catálogo del 2D)—, tal cual. */
export function conNombrePropio(
  f: { type: string; gondolaType?: string | null },
  nombres: NombresPropios | null | undefined,
  deSiempre: string,
): string {
  return nombrePropio(familiaDe(f), nombres) ?? deSiempre;
}

/** El TIPO de espacio de un mueble, como lo leen las columnas «Tipo» (Estado
 *  por espacio, la lista de Vender, el visor, «Cuándo se libera»): el nombre
 *  propio de su familia o, sin él, el rótulo de su tarifa, como siempre.
 *
 *  Un mueble colocado desde una ficha con tarifa PROPIA (la media estiba, el
 *  cuarto de estiba, el exhibidor de cartón) sigue diciendo la de su ficha:
 *  dice más que la familia, y es la fila de Tarifas que le pone precio.
 *
 *  Pregunta la tarifa (`rateTypeOf`): quien la llama desde un `useMemo` pone
 *  `fichasPropias` en las dependencias, además de los nombres. */
export function tipoDelMueble(
  f: { type: string; gondolaType?: string | null; modelo?: string | null },
  nombres: NombresPropios | null | undefined,
): string {
  const tarifa = rateTypeOf(f);
  const propio = nombrePropio(familiaDe(f), nombres);
  if (propio && tarifa === tarifaDeLaFamilia(f.type)) return propio;
  return rateTypeLabel(tarifa);
}

/** La tarifa del TIPO, sin mirar el modelo: la misma cuenta que `rateTypeOf`
 *  cuando el mueble no tiene ficha con tarifa propia (lo que no se vende
 *  contesta su propio tipo). Un `Map`: un tipo escrito a mano no cae en
 *  `toString`. */
let tarifasDeLasFamilias: ReadonlyMap<string, string> | null = null;
function tarifaDeLaFamilia(tipo: string): string {
  tarifasDeLasFamilias ??= new Map(Object.entries(tarifaPorTipo()));
  return tarifasDeLasFamilias.get(tipo) ?? tipo;
}

/** Las familias que cobran con esa clave de tarifa, en el orden de la
 *  biblioteca del 2D: `gondola` son la central y la de pared; una tarifa
 *  propia de un modelo (`estiba_media`) no es de ninguna familia. */
function familiasDeLaTarifa(clave: string): string[] {
  return CATALOGO_DE_MUEBLES.orden.plano2D.filter((t) => resolverTipo(t)?.tipo.tarifa === clave);
}

/** El nombre de una fila de TARIFA (Tarifas, «Tarifa de referencia» de
 *  Vender), que junta las familias que cobran con ella. Sin ningún nombre
 *  propio entre ellas, el rótulo de siempre. Con alguno, el de cada familia
 *  —el propio o, si esa no tiene, su rótulo de RECABRA—, sin repetir y unidos
 *  por « · »: con la central llamada «góndola de centro» y la de pared sin
 *  nombre, la fila de la góndola dice «góndola de centro · Góndola Mural», y no
 *  le pone a la de pared un nombre que no es el suyo. */
export function nombreDeTarifa(clave: string, nombres: NombresPropios | null | undefined): string {
  const deParte = nombreDeTarifaDeParte(clave, nombres);
  if (deParte !== undefined) return deParte;
  const familias = familiasDeLaTarifa(clave);
  if (!familias.some((fam) => nombrePropio(fam, nombres) !== undefined)) return rateTypeLabel(clave);
  const dichos = familias.map((fam) => nombrePropio(fam, nombres) ?? rotuloDeRecabra(fam));
  return [...new Set(dichos)].join(" · ");
}

/**
 * El nombre de la fila de tarifa de una CLASE DE PARTE (vender por partes),
 * con el nombre propio de su familia donde el nombre de la parte la nombra:
 * «Puerta de nevera (cada una)» es, donde a la nevera de puertas le dicen
 * «Enfriador vertical», «Puerta de Enfriador vertical (cada una)»; la bahía
 * de impulso «de caja» y el forro «de columna», igual. La familia es la única
 * que tiene esa clase (`partes.divisiones` o `partes.piezas` del catálogo), y
 * la palabra es la que dicen los informes después de la parte («puerta de
 * nevera»): el tramo y el entrepaño son de varias familias y no nombran
 * ninguna, así que no cambian. `undefined` si la clave no es de una parte;
 * sin nombre propio, el rótulo de siempre.
 */
function nombreDeTarifaDeParte(clave: string, nombres: NombresPropios | null | undefined): string | undefined {
  const entrada = Object.entries(CATALOGO_DE_MUEBLES.partes.clases).find(([, c]) => c.tarifa === clave);
  if (!entrada) return undefined;
  const [claseClave, clase] = entrada;
  const rotulo = rateTypeLabel(clave);
  const familias = CATALOGO_DE_MUEBLES.orden.plano2D.filter((t) => {
    const p = resolverTipo(t)?.tipo.partes;
    return !!p && ((p.divisiones ?? []).includes(claseClave) || (p.piezas ?? []).includes(claseClave));
  });
  const prefijo = `${clase.singular} de `;
  if (familias.length !== 1 || !clase.informe.startsWith(prefijo)) return rotulo;
  const propio = nombrePropio(familias[0], nombres);
  const palabra = ` de ${clase.informe.slice(prefijo.length)}`;
  if (!propio || !rotulo.includes(palabra)) return rotulo;
  return rotulo.replace(palabra, ` de ${propio}`);
}

/** El rótulo de RECABRA de una familia (el de los editores). */
export function rotuloDeRecabra(familia: string): string {
  const r = resolverTipo(familia);
  return (r && formaDe(r.tipo, r.variante).rotuloEditor) || familia;
}

/** Las familias que pueden tener nombre propio, en el orden de la biblioteca
 *  del 2D, con su rótulo de RECABRA y su emoji: las filas de Configuración. */
export interface FamiliaConNombre { clave: string; rotulo: string; emoji: string; grupo: string }
export function familiasConNombre(): FamiliaConNombre[] {
  return CATALOGO_DE_MUEBLES.orden.plano2D.map((clave) => {
    const r = resolverTipo(clave);
    const forma = r ? formaDe(r.tipo, r.variante) : undefined;
    return {
      clave,
      rotulo: forma?.rotuloEditor || clave,
      emoji: forma?.emoji ?? "",
      grupo: r?.tipo.grupo2D ?? "",
    };
  });
}

/** El largo máximo de un nombre propio, en letras de verdad: el mismo que el
 *  nombre de una ficha (`fichas.largoMaximo.nombre` del catálogo), que es el
 *  que también valida el servidor (`schemas/layout.py`). */
export const LARGO_DEL_NOMBRE_PROPIO: number = CATALOGO_DE_MUEBLES.fichas.largoMaximo.nombre;

/** Lo que se guarda de lo que se escribió: sin espacios a los costados y
 *  cortado al largo máximo (contado en letras, no en unidades UTF-16). Vacío,
 *  o igual al rótulo de RECABRA, es «sin nombre propio». */
export function nombreParaGuardar(familia: string, escrito: string): string {
  const limpio = [...escrito.trim()].slice(0, LARGO_DEL_NOMBRE_PROPIO).join("").trim();
  return limpio === rotuloDeRecabra(familia) ? "" : limpio;
}
