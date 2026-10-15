import { CATALOGO_DE_MUEBLES } from "./catalogo";

/**
 * Las referencias del minimapa (`components/MiniMapa/MiniMapa.tsx`): los tipos
 * de mueble que el plano del mercaderista dibuja aparte y con etiqueta.
 *
 * Salen del catálogo (`referencia` de cada tipo en `catalogo/muebles.json`), en
 * el orden de `orden.minimapa`, y el orden importa: cuando dos etiquetas chocan
 * gana la primera. El servidor lee las mismas frases de su copia del catálogo
 * (`_REFERENCIAS` en `backend/app/services/layout_lookup.py`).
 */

/** Las cajas son la referencia que todo el mundo conoce, aunque nunca haya
 *  mirado un plano. Se dibujan aparte y con etiqueta. */
export const REFERENCIAS: Record<string, { corto: string; frase: string }> = Object.fromEntries(
  CATALOGO_DE_MUEBLES.orden.minimapa.map((t) => {
    const ref = CATALOGO_DE_MUEBLES.tipos[t]?.referencia;
    if (!ref) throw new Error(`catálogo de muebles: «${t}» no tiene referencia para el minimapa`);
    return [t, { corto: ref.corto, frase: ref.frase }];
  }),
);
