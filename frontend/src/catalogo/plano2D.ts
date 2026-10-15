import type { Catalogo2D, FixType2D, NaceDeModelo } from "../utils/convertirPlano";
import { CATALOGO_DE_MUEBLES, estampaDe, formaDe, modelosDe, modelosPropiosDe, resolverTipo } from "./catalogo";
import type { FichaDeModelo } from "./catalogo";
import type { ModeloPropio } from "./propias";
import { comoSeVendeCorto } from "../utils/partes";

/**
 * Las tablas por TIPO de mueble del plano 2D, calculadas del catálogo
 * (`catalogo/muebles.json`, que lee `catalogo/catalogo.ts`).
 *
 * Vivían adentro de `FloorPlan2D.tsx`, pasaron tal cual a este archivo para
 * anotar qué hacía cada tipo (`scripts/casos/catalogo-antes.json`), y ahora
 * salen del catálogo con los mismos nombres y en el mismo orden. Las medidas,
 * el alto y el color son los del editor 3D: el plano y el 3D crean el mismo
 * mueble. El 2D parte la góndola en dos tipos —`gondola_doble` y
 * `gondola_mural`, los `alias` del catálogo—, y el rótulo de cada uno es el que
 * estampa en `label` al abrir el plano.
 *
 * Cuando eran tablas propias decían otra cosa que el 3D en tres lugares, y se
 * alinearon con el catálogo sólo para los muebles que se dibujen desde ahora
 * (lo guardado conserva su fondo, su alto y su color): el mostrador de carnes
 * nacía con 0,85 de fondo (el 3D, 0,90); el servicio al cliente nacía de 1,80
 * de alto (el 3D, 1,10) y con el color de la góndola, porque no estaba en las
 * tablas; y había un color para `nevera_mural`, un tipo que no existe. Queda una
 * diferencia a propósito: el mostrador de carnes nace en el 2D con `#1e293b`
 * (`color2D` en el catálogo) y en el 3D con `#111827`.
 */

const resolver2D = (entrada: string) => {
  const r = resolverTipo(entrada);
  if (!r) throw new Error(`catálogo de muebles: «${entrada}» no es un tipo`);
  return { ...r, forma: formaDe(r.tipo, r.variante) };
};

// ─── Catalog ──────────────────────────────────────────────────────────────────

/** La biblioteca del plano: se agrupa por `category` en el orden en que aparece. */
export const CATALOG: {
  type: FixType2D;
  label: string;
  w: number;
  h: number;      // depth (Z axis in 2D top-down; maps to UnifiedFixture.d)
  emoji: string;
  prefix: string;
  category: string;
}[] = CATALOGO_DE_MUEBLES.orden.plano2D.map((t) => {
  const { tipo, forma } = resolver2D(t);
  return {
    type: t as FixType2D,
    label: forma.rotuloEditor ?? t,
    w: forma.medidas?.w ?? 1,
    h: forma.medidas?.d ?? 1,
    emoji: forma.emoji ?? "",
    prefix: tipo.prefijo,
    category: tipo.grupo2D ?? "",
  };
});

/** Lo que el plano tiene que poder dibujar además de su biblioteca: los tipos
 *  legados que sólo traen los planos viejos (la `exhibicion`). */
const LEGADOS = Object.entries(CATALOGO_DE_MUEBLES.tipos)
  .filter(([, d]) => d.legado)
  .map(([t, d]) => ({ t, forma: d }));

/** 3D height defaults (used when promoting a 2D item to a UnifiedFixture).
 *  Keys match FixType2D so gondola_doble / gondola_mural can be distinguished. */
export const H_DEFAULTS: Record<string, number> = Object.fromEntries([
  ...CATALOGO_DE_MUEBLES.orden.plano2D.map((t) => [t, resolver2D(t).forma.medidas?.h] as const),
  ...LEGADOS.map(({ t, forma }) => [t, forma.medidas?.h] as const),
].filter((par): par is readonly [string, number] => typeof par[1] === "number"));

/* El color con que nace cada tipo dibujado en el 2D. Es una paleta CATEGÓRICA
   elegida a ojo —no validada contra daltonismo ni medida contra las dos
   superficies— y no la terna de estado (esa ya salió a tokens en
   `FloorPlan2D.tsx`). Cambiarla es reelegir una paleta con el validador en la
   mano, que es una decisión de diseño, no un cambio de piel; está anotado en
   `features/diseno-interior/outputs/frontend.md`. Y el color de cada mueble es
   dato guardado (`f.color`): moverlo acá cambia sólo los que nazcan después. */
export const COLOR_DEFAULTS: Record<string, string> = Object.fromEntries([
  ...CATALOGO_DE_MUEBLES.orden.plano2D.map((t) => {
    const { forma } = resolver2D(t);
    return [t, forma.color2D ?? forma.color] as const;
  }),
  ...LEGADOS.map(({ t, forma }) => [t, forma.color2D ?? forma.color] as const),
].filter((par): par is readonly [string, string] => typeof par[1] === "string"));

/** Lo que las conversiones de `utils/convertirPlano.ts` necesitan del plano 2D:
 *  el rótulo de cada tipo y el alto y el color con que nace. Es EL objeto que
 *  usa `FloorPlan2D.tsx` —vive acá y no en el componente para que
 *  `capturar-catalogo.mjs` corra la creación de muebles con el mismo, y
 *  `probar-muebles.mjs` exige que el componente no tenga tablas propias—: una
 *  copia vieja de los altos en el componente deshacía en silencio, por ejemplo,
 *  el alto con que nace el servicio al cliente. */
export const CATALOGO_2D: Catalogo2D = { tipos: CATALOG, altos: H_DEFAULTS, colores: COLOR_DEFAULTS };

/**
 * Los modelos de cada tipo de la biblioteca del plano (`modelos` del
 * catálogo), en el orden del archivo: la biblioteca los lista debajo de su
 * familia. Cada uno trae con qué ancho y fondo se dibuja y con qué nace en el
 * store (`nace`: alto, color, id del modelo y geometría), que es lo que
 * `itemsToStore` le estampa al mueble nuevo. El rótulo es el de su tipo, como
 * siempre: el 2D lo vuelve a escribir en `label` cada vez que abre el plano.
 */
export interface ModeloDelPlano {
  id: string;
  nombre: string;
  /** Las medidas son una deducción: en pantalla, «≈». */
  estimado: boolean;
  /** Cómo se vende, si su ficha lo dice («por puertas»): la biblioteca lo
   *  muestra al lado de las medidas. */
  comoSeVende?: string;
  /** Ancho y fondo, en la convención del 2D (`h` es el fondo). */
  w: number;
  h: number;
  nace: NaceDeModelo;
}

/** El modelo como lo lista la biblioteca del tipo `t` del plano. El MISMO
 *  para un modelo de RECABRA y para una ficha propia del supermercado. */
export function modeloDelPlano(t: string, m: FichaDeModelo): ModeloDelPlano {
  const e = estampaDe(m);
  const color = "color" in m ? m.color : undefined;
  return {
    id: m.id,
    nombre: m.nombre,
    estimado: m.fuente.confiabilidad === "estimado",
    ...comoSeVendeCorto(m),
    w: e.w,
    h: e.d,
    nace: {
      h: e.h,
      // El color del 2D, como `COLOR_DEFAULTS`: el de la ficha si lo tiene.
      color: color ?? COLOR_DEFAULTS[t] ?? e.color,
      modelo: e.modelo,
      ...(e.entrepanos !== undefined ? { entrepanos: e.entrepanos } : {}),
      ...(e.modulo !== undefined ? { modulo: e.modulo } : {}),
      ...(e.partes !== undefined ? { partes: e.partes } : {}),
    },
  };
}

export const MODELOS_2D: Record<string, ModeloDelPlano[]> = Object.fromEntries(
  CATALOGO_DE_MUEBLES.orden.plano2D.map((t) => [t, modelosDe(t).map((m) => modeloDelPlano(t, m))]),
);

/** La biblioteca con las fichas propias del supermercado: cada una debajo de
 *  su familia (la góndola central en `gondola_doble`, la de pared en
 *  `gondola_mural`), después de los modelos de RECABRA y sin las retiradas.
 *  Sin fichas propias es `MODELOS_2D` misma. */
export function modelosDelPlanoConPropias(propias: readonly ModeloPropio[]): Record<string, ModeloDelPlano[]> {
  if (propias.length === 0) return MODELOS_2D;
  return Object.fromEntries(CATALOGO_DE_MUEBLES.orden.plano2D.map((t) => {
    const suyas = modelosPropiosDe(t, propias);
    const base = MODELOS_2D[t] ?? [];
    return [t, suyas.length === 0 ? base : [...base, ...suyas.map((m) => modeloDelPlano(t, m))]];
  }));
}
