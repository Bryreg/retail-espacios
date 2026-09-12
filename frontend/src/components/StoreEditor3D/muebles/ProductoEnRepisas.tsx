import { memo, useMemo } from "react";
import type { FilasDeProducto } from "./medidas";
import { ProductoEnMueble } from "./ProductoEnMueble";
import type { CaraDeProducto } from "./ProductoEnMueble";

/**
 * Producto sobre las repisas de un mueble que se vende ENTERO.
 *
 * ## Para quién es
 *
 * Para casi todo el catálogo fuera de la góndola y la punta: el exhibidor de
 * cruz, el impulsador de marca, el robatope, la vitrina. Son muebles chicos
 * que una marca contrata completos — compra el mueble, no un estante—, así que
 * no tienen espacios internos que consultar.
 *
 * Y por eso se llenan enteros. En la góndola el hueco vacío ES el dato, porque
 * dice qué espacio queda libre para vender; acá la disponibilidad la dice el
 * estado del mueble, y un impulsador contratado que se dibuja vacío no informa
 * nada: sólo se ve mal.
 *
 * ## Por qué no calcula nada
 *
 * Todo el trabajo —qué empaque entra, cuántos frentes caben, a qué altura va
 * cada uno— lo hace `ProductoEnMueble`, que es el mismo que usan la góndola y
 * la punta. Acá sólo se traduce «tengo repisas a estas alturas» al vocabulario
 * de filas que ese componente entiende. Si esta traducción se volviera un
 * cálculo, ya serían dos formas distintas de acomodar producto en el sistema.
 */

export interface ProductoEnRepisasProps {
  /** Altura del plano de apoyo de cada repisa, de abajo hacia arriba. */
  alturas: number[];
  /** Hasta dónde llega el hueco de la repisa de más arriba: el techo del
   *  mueble, o la parte de abajo de su cartel. */
  techo: number;
  /** Ancho útil de la repisa. */
  ancho: number;
  /** Fondo útil de la repisa. */
  fondo: number;
  /** Z del plano donde se cuelgan las repisas, y hacia dónde crecen. */
  montaje: number;
  hacia: 1 | -1;
  /** Rubro del contrato. Sin contrato, no se dibuja nada: un mueble libre se
   *  ve libre. */
  rubro?: string;
  ghost?: boolean;
}

export const ProductoEnRepisas = memo(function ProductoEnRepisas({
  alturas, techo, ancho, fondo, montaje, hacia, rubro, ghost = false,
}: ProductoEnRepisasProps) {
  const filas = useMemo<FilasDeProducto>(() => {
    const usables = alturas.filter((y) => y < techo - 0.05);
    const rows = usables.length;
    if (rows === 0) {
      return { rowBottom: 0, alturas: [0, techo], rowPitch: techo, rows: 0, fondos: [] };
    }
    return {
      rowBottom: usables[0],
      alturas: [...usables, techo],
      rowPitch: (techo - usables[0]) / rows,
      rows,
      fondos: Array.from({ length: rows }, () => fondo),
    };
  }, [alturas, techo, fondo]);

  const vanos = useMemo(() => [{ x: 0, ancho }], [ancho]);
  const caras = useMemo<CaraDeProducto[]>(() => [{ montaje, hacia }], [montaje, hacia]);

  if (!rubro || filas.rows === 0) return null;

  return (
    <ProductoEnMueble
      anchoTotal={ancho}
      filas={filas}
      vanos={vanos}
      caras={caras}
      franja={techo}
      vendidoEntero={{ rubro }}
      ghost={ghost}
    />
  );
});
