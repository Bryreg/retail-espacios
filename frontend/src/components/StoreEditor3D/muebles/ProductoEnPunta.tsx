import { memo, useMemo } from "react";
import {
  COPETE, PANEL_FONDO, altoDeZonaDeSlotsDePunta, filasDePunta, vanosDeCorrido,
} from "./medidas";
import { ProductoEnMueble } from "./ProductoEnMueble";
import type { CaraDeProducto, SlotDeProducto } from "./ProductoEnMueble";

/**
 * El producto de una punta de góndola.
 *
 * Dos diferencias con la góndola, y las dos importan:
 *
 * 1. **Una sola cara, y montada atrás.** El cuerpo se cuelga contra el corrido
 *    y crece hacia el frente. Con el signo de la góndola —montaje adelante,
 *    crecimiento hacia afuera— el producto aparecería detrás del mueble.
 * 2. **La última fila la techa el copete**, no otro entrepaño. Por eso una
 *    punta tiene tantas filas de producto como entrepaños, y la góndola tiene
 *    una menos: sobre el entrepaño más alto de una punta también se vende.
 */
export const ProductoEnPunta = memo(function ProductoEnPunta({
  w, d, h, slots, ghost = false,
}: {
  w: number;
  d: number;
  /** Alto TOTAL, copete incluido. */
  h: number;
  slots?: SlotDeProducto[];
  ghost?: boolean;
}) {
  const altoDeCuerpo = Math.max(0.4, h - COPETE.alto);
  const fondoDeCara = Math.max(0.12, d - PANEL_FONDO.espesor);

  const filas = useMemo(
    () => filasDePunta(altoDeCuerpo, fondoDeCara), [altoDeCuerpo, fondoDeCara],
  );
  const vanos = useMemo(() => vanosDeCorrido(w), [w]);
  const caras = useMemo<CaraDeProducto[]>(
    () => [{ montaje: d / 2, hacia: -1 }], [d],
  );

  return (
    <ProductoEnMueble
      anchoTotal={w}
      filas={filas}
      vanos={vanos}
      caras={caras}
      franja={altoDeZonaDeSlotsDePunta(altoDeCuerpo)}
      slots={slots}
      ghost={ghost}
    />
  );
});
