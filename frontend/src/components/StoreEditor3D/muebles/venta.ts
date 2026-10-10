import { ventaDeNevera, ventaDeRobatope } from "./medidas";
import type { VentaDeMueble } from "./medidas";
import { ventaDeGondola } from "./ProductoEnGondola";
import { ventaDePunta } from "./ProductoEnPunta";

/**
 * Dónde vende un mueble, por su tipo.
 *
 * Sólo despacha: cada mueble arma lo suyo con las cuentas que ya tenía, y esto
 * existe para que quien no dibuja el mueble —el panel que ofrece los
 * entrepaños, la cámara que encuadra uno— pregunte lo mismo que el mueble y no
 * una copia. Devuelve `null` para los tipos que no venden por entrepaños.
 */
export function ventaDeTipo(
  type: string, w: number, d: number, h: number, gondolaType?: string,
): VentaDeMueble | null {
  switch (type) {
    case "gondola":
    case "gondola_doble":
      return ventaDeGondola(w, d, h, gondolaType === "wall");
    case "punta":
      return ventaDePunta(w, d, h);
    case "nevera_refrescos":
      return ventaDeNevera(w, d, h);
    case "robatope":
      return ventaDeRobatope(w, d, h);
    default:
      return null;
  }
}
