import { memo, useMemo } from "react";
import {
  ESPESOR_ESPINA, PARANTE,
  altoDeZonaDeSlots, filasDeProducto, fondoPorCara, vanosDeCorrido,
} from "./medidas";
import type { VentaDeMueble } from "./medidas";
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
 */
export function ventaDeGondola(w: number, d: number, h: number, esMural: boolean): VentaDeMueble {
  return {
    filas: filasDeProducto(h, fondoPorCara(d, esMural)),
    vanos: vanosDeCorrido(w),
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
  w, d, h, esMural, slots, cubiertas, ghost = false, vendidoEntero, semilla,
}: {
  w: number;
  d: number;
  h: number;
  esMural: boolean;
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
  const venta = useMemo(() => ventaDeGondola(w, d, h, esMural), [w, d, h, esMural]);

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
