import { memo, useMemo } from "react";
import {
  COPETE, PANEL_FONDO, altoDeZonaDeSlotsDePunta, filasDePunta, vanosDeCorrido,
} from "./medidas";
import type { VentaDeMueble } from "./medidas";
import { ProductoEnMueble } from "./ProductoEnMueble";
import type { SlotDeProducto } from "./ProductoEnMueble";
import type { Cubiertas } from "./frentes";

/**
 * Dónde vende una punta de góndola.
 *
 * Dos diferencias con la góndola, y las dos importan:
 *
 * 1. **Una sola cara, y montada atrás.** El cuerpo se cuelga contra el corrido
 *    y crece hacia el frente. Con el signo de la góndola —montaje adelante,
 *    crecimiento hacia afuera— el producto aparecería detrás del mueble.
 * 2. **La última fila la techa el copete**, no otro entrepaño. Por eso una
 *    punta tiene tantas filas de producto como entrepaños, y la góndola tiene
 *    una menos: sobre el entrepaño más alto de una punta también se vende.
 *
 * `h` es el alto TOTAL, copete incluido.
 */
export function ventaDePunta(w: number, d: number, h: number): VentaDeMueble {
  const altoDeCuerpo = Math.max(0.4, h - COPETE.alto);
  const fondoDeCara = Math.max(0.12, d - PANEL_FONDO.espesor);
  return {
    filas: filasDePunta(altoDeCuerpo, fondoDeCara),
    vanos: vanosDeCorrido(w),
    caras: [{ montaje: d / 2, hacia: -1 }],
    franja: altoDeZonaDeSlotsDePunta(altoDeCuerpo),
    altoDeCara: altoDeCuerpo,
  };
}

/** El producto de una punta de góndola: todo el trabajo lo hace
 *  `ProductoEnMueble`, y dónde vende lo dice `ventaDePunta`. */
export const ProductoEnPunta = memo(function ProductoEnPunta({
  w, d, h, slots, cubiertas, ghost = false,
}: {
  w: number;
  d: number;
  /** Alto TOTAL, copete incluido. */
  h: number;
  slots?: SlotDeProducto[];
  /** Lo que tapa la prueba del producto del proveedor, por cara: ahí no va
   *  relleno. Arte o relleno vale por (cara, entrepaño). */
  cubiertas?: Cubiertas;
  ghost?: boolean;
}) {
  const venta = useMemo(() => ventaDePunta(w, d, h), [w, d, h]);

  return (
    <ProductoEnMueble
      anchoTotal={w}
      filas={venta.filas}
      vanos={venta.vanos}
      caras={venta.caras}
      franja={venta.franja ?? 0}
      slots={slots}
      cubiertas={cubiertas}
      ghost={ghost}
    />
  );
});
