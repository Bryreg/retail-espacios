import {
  MURAL_VEGETALES, NEVERA, altoUtilDeNevera, nivelesDeMural,
} from "./medidas";

/**
 * Dónde están las bandejas de un mural de vegetales y cuánto entra en cada una.
 *
 * Devuelve descripciones, no geometría. El que dibuja es el mismo
 * `VolcadoDeProducto` que usan la batea, el cajón de frutas y el mostrador —
 * y por eso el mural hereda gratis las dos cosas que ese componente ya
 * resuelve: el arte del proveedor cuando lo hay, y producto genérico cuando
 * no. Con un componente propio, el mural se quedaba sin arte: el mueble
 * calculaba si el proveedor había subido el suyo y después no lo dibujaba en
 * ningún lado.
 *
 * Lo que el mural sí tiene de propio es la INCLINACIÓN. La fruta suelta rueda
 * y hay que verla desde arriba, así que la bandeja cae quince grados — y el
 * producto tiene que caer con ella, o la fila de atrás flota y la de adelante
 * se hunde.
 */
export interface BandejaDeMural {
  /** Altura del plano de apoyo, antes de inclinar. */
  y: number;
  ancho: number;
  fondo: number;
  /** Z del centro de la bandeja. */
  z: number;
  /** Cuánto se puede amontonar encima. */
  altoLibre: number;
  /** Inclinación hacia el cliente, en radianes. */
  caida: number;
}

export function bandejasDeMural(w: number, d: number, h: number): BandejaDeMural[] {
  const niveles = nivelesDeMural(h);
  const techo = NEVERA.zocalo + altoUtilDeNevera(h);
  const ancho = Math.max(0.1, w - NEVERA.chapa * 2 - 0.04);
  const fondo = Math.max(0.1, d - NEVERA.chapa - NEVERA.fondoPuerta - 0.05);

  return niveles.map((y, i) => ({
    y: y + 0.014,
    ancho,
    fondo,
    z: NEVERA.chapa / 2,
    // No hasta la bandeja de arriba: sobre un plano inclinado un montón alto
    // se vuelca. En tienda se cargan dos o tres capas y se repone.
    altoLibre: Math.min(0.2, Math.max(0.08, ((niveles[i + 1] ?? techo) - y) * 0.5)),
    caida: MURAL_VEGETALES.caida,
  }));
}
