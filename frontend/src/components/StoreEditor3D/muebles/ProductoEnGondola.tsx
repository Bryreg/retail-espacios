import { memo, useMemo } from "react";
import {
  ESPESOR_ESPINA, PARANTE,
  altoDeZonaDeSlots, filasDeProducto, fondoPorCara, vanosDeCorrido,
} from "./medidas";
import { ProductoEnMueble } from "./ProductoEnMueble";
import type { CaraDeProducto, SlotDeProducto } from "./ProductoEnMueble";

export type { SlotDeProducto } from "./ProductoEnMueble";

/**
 * El producto de una góndola: dónde están sus caras y sus entrepaños.
 *
 * Todo el trabajo lo hace `ProductoEnMueble`. Acá vive sólo lo que es propio
 * de una góndola: que el fondo se reparte entre dos caras con una espina en el
 * medio, que cada cara se monta en su lado de la espina y crece hacia afuera,
 * y que la mural vende por una sola porque la otra da contra la pared.
 */
export const ProductoEnGondola = memo(function ProductoEnGondola({
  w, d, h, esMural, slots, ghost = false,
}: {
  w: number;
  d: number;
  h: number;
  esMural: boolean;
  slots?: SlotDeProducto[];
  ghost?: boolean;
}) {
  const fondoCara = fondoPorCara(d, esMural);
  const filas = useMemo(() => filasDeProducto(h, fondoCara), [h, fondoCara]);
  const vanos = useMemo(() => vanosDeCorrido(w), [w]);

  // Cada cara se monta en su lado de la espina y crece hacia afuera.
  const caras = useMemo<CaraDeProducto[]>(
    () => (esMural
      ? [{ montaje: -ESPESOR_ESPINA / 2, hacia: -1 }]
      : [
          { montaje: -ESPESOR_ESPINA / 2, hacia: -1 },
          { montaje: ESPESOR_ESPINA / 2, hacia: 1 },
        ]),
    [esMural],
  );

  return (
    <ProductoEnMueble
      anchoTotal={w}
      filas={filas}
      vanos={vanos}
      caras={caras}
      franja={altoDeZonaDeSlots(h)}
      slots={slots}
      ghost={ghost}
    />
  );
});

/** El ancho útil de un corrido, descontando los parantes de las puntas. Lo usa
 *  quien necesita saber cuánto frente hay realmente para vender. */
export function anchoUtilDeCorrido(w: number): number {
  return Math.max(0, w - PARANTE.ancho * 2);
}
