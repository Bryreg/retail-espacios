import { puertasDe, ventaDeNevera, ventaDeRobatope } from "./medidas";
import type { GeometriaDeMueble, VentaDeMueble } from "./medidas";
import { ventaDeGondola } from "./ProductoEnGondola";
import { ventaDePunta } from "./ProductoEnPunta";

/**
 * Dónde vende un mueble, por su tipo.
 *
 * Sólo despacha: cada mueble arma lo suyo con las cuentas que ya tenía, y esto
 * existe para que quien no dibuja el mueble —el panel que ofrece los
 * entrepaños, la cámara que encuadra uno— pregunte lo mismo que el mueble y no
 * una copia. Devuelve `null` para los tipos que no venden por entrepaños.
 *
 * `geometria` es lo que el mueble guardó de la ficha de su modelo o del
 * panel (`geometriaDe`): los entrepaños y el módulo de la góndola y de la
 * punta, y las puertas de la nevera de puertas. Sin ella —un mueble de un plano viejo— da lo de
 * siempre: el que pregunta tiene que pasar la MISMA que usa el dibujo, o el
 * producto queda parado donde no hay entrepaño.
 */
export function ventaDeTipo(
  type: string, w: number, d: number, h: number, gondolaType?: string, geometria?: GeometriaDeMueble,
): VentaDeMueble | null {
  switch (type) {
    case "gondola":
    case "gondola_doble":
      return ventaDeGondola(w, d, h, gondolaType === "wall", geometria);
    case "punta":
      return ventaDePunta(w, d, h, geometria);
    case "nevera_refrescos":
      return ventaDeNevera(w, d, h);
    case "nevera_puertas":
      // Se vende entera; las puertas sólo dicen dónde se para el producto:
      // un vano por hoja, detrás de su vidrio.
      return ventaDeNevera(w, d, h, puertasDe(w, geometria?.puertas));
    case "robatope":
      return ventaDeRobatope(w, d, h);
    default:
      return null;
  }
}

/** Las neveras de bebidas: la abierta (`nevera_refrescos`) y la de puertas
 *  (`nevera_puertas`). Las dos se dibujan con `NeveraReal`, se venden enteras
 *  y prueban el producto con las mismas rejillas automáticas y el mismo
 *  cabezote: lo que vale para una en el panel de la prueba vale para la
 *  otra. */
export function esNeveraDeBebidas(type: string): boolean {
  return type === "nevera_refrescos" || type === "nevera_puertas";
}
