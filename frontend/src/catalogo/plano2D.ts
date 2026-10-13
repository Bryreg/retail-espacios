import type { FixType2D } from "../utils/convertirPlano";
import { CATALOGO_DE_MUEBLES, formaDe, resolverTipo } from "./catalogo";

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
