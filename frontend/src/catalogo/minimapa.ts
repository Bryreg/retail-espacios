/**
 * Las referencias del minimapa (`components/MiniMapa/MiniMapa.tsx`): los tipos
 * de mueble que el plano del mercaderista dibuja aparte y con etiqueta.
 *
 * Está acá, tal cual estaba en el componente, para que node la lea:
 * `scripts/capturar-catalogo.mjs` la vuelca a `scripts/casos/catalogo-antes.json`.
 * El servidor tiene su copia de las frases en `_REFERENCIAS`
 * (`backend/app/services/layout_lookup.py`).
 */

/** Las cajas son la referencia que todo el mundo conoce, aunque nunca haya
 *  mirado un plano. Se dibujan aparte y con etiqueta. */
export const REFERENCIAS: Record<string, { corto: string; frase: string }> = {
  checkout: { corto: "Cajas", frase: "las cajas" },
  nevera_refrescos: { corto: "Neveras", frase: "las neveras" },
  nevera_carnes: { corto: "Carnes", frase: "el mostrador de carnes" },
  nevera_vegetales: { corto: "Vegetales", frase: "el mural de frutas y verduras" },
  stand_frutas: { corto: "Frutas", frase: "las frutas" },
};
