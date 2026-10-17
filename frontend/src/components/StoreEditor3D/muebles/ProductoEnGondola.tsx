import { memo, useContext, useMemo } from "react";
import { DesnudoDelMueble } from "./desnudo";
import {
  ESPESOR_ESPINA, PARANTE,
  altoDeZonaDeSlots, filasDeProducto, fondoPorCara, vanosDeCorrido,
} from "./medidas";
import type { GeometriaDeMueble, VentaDeMueble } from "./medidas";
import { ProductoEnMueble } from "./ProductoEnMueble";
import type { SlotDeProducto } from "./ProductoEnMueble";
import type { Cubiertas, VendidoEntero } from "./frentes";

export type { SlotDeProducto } from "./ProductoEnMueble";

/**
 * Dónde vende una góndola: lo que es propio de ella y de nadie más.
 *
 * Que el fondo se reparte entre dos caras con una espina en el medio, que cada
 * cara se monta en su lado de la espina y crece hacia afuera, y que la mural
 * vende por una sola porque la otra da contra la pared. Lo usan el relleno por
 * rubro de acá abajo y el producto de prueba del proveedor: con una sola
 * cuenta, los dos se paran en los mismos entrepaños.
 *
 * Con `geometria` (los entrepaños y el módulo que la góndola guardó de su
 * ficha) las filas y los vanos son los de la ficha, los mismos que dibuja
 * `GondolaReal`; sin ella, la cuenta de siempre.
 */
export function ventaDeGondola(
  w: number, d: number, h: number, esMural: boolean, geometria?: GeometriaDeMueble,
): VentaDeMueble {
  return {
    filas: filasDeProducto(h, fondoPorCara(d, esMural), geometria?.entrepanos),
    vanos: vanosDeCorrido(w, geometria?.modulo, geometria?.tramos),
    // Cada cara se monta en su lado de la espina y crece hacia afuera.
    caras: esMural
      ? [{ montaje: -ESPESOR_ESPINA / 2, hacia: -1 }]
      : [
          { montaje: -ESPESOR_ESPINA / 2, hacia: -1 },
          { montaje: ESPESOR_ESPINA / 2, hacia: 1 },
        ],
    franja: altoDeZonaDeSlots(h),
    altoDeCara: h,
  };
}

/**
 * El producto de una góndola: dónde están sus caras y sus entrepaños.
 *
 * Todo el trabajo lo hace `ProductoEnMueble`; dónde vende la góndola lo dice
 * `ventaDeGondola`.
 */
export const ProductoEnGondola = memo(function ProductoEnGondola({
  w, d, h, esMural, slots, cubiertas, ghost = false, vendidoEntero, semilla, entrepanos, modulo, tramos,
}: {
  w: number;
  d: number;
  h: number;
  esMural: boolean;
  /** Lo que la góndola guardó de su ficha (ver `ventaDeGondola`). */
  entrepanos?: number;
  modulo?: number;
  /** Los tramos en que se vende (`partes.tramos`): parten el corrido. */
  tramos?: number;
  slots?: SlotDeProducto[];
  /** Lo que tapa la prueba del producto del proveedor, por cara: ahí no va
   *  relleno. Arte o relleno vale por (cara, entrepaño). */
  cubiertas?: Cubiertas;
  ghost?: boolean;
  /** Contratado ENTERO con los slots libres (sólo en venta): el relleno
   *  neutro de su rubro en todos los entrepaños. */
  vendidoEntero?: VendidoEntero;
  /** El mueble (su id): siembra la variación del relleno en venta. */
  semilla?: string;
}) {
  // El mueble desnudo de Distribución (`desnudo.ts`): nada encima. Después de
  // los hooks, para que entrar y salir del modo no cambie su orden.
  const desnudo = useContext(DesnudoDelMueble);
  const venta = useMemo(
    () => ventaDeGondola(w, d, h, esMural, { entrepanos, modulo, tramos }),
    [w, d, h, esMural, entrepanos, modulo, tramos],
  );
  if (desnudo) return null;

  return (
    <ProductoEnMueble
      anchoTotal={w}
      filas={venta.filas}
      vanos={venta.vanos}
      caras={venta.caras}
      franja={venta.franja ?? 0}
      slots={slots}
      cubiertas={cubiertas}
      vendidoEntero={vendidoEntero}
      ghost={ghost}
      semilla={semilla}
    />
  );
});

/** El ancho útil de un corrido, descontando los parantes de las puntas. Lo usa
 *  quien necesita saber cuánto frente hay realmente para vender. */
export function anchoUtilDeCorrido(w: number): number {
  return Math.max(0, w - PARANTE.ancho * 2);
}
