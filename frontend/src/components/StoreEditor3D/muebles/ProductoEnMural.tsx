import { memo, useMemo } from "react";
import {
  MURAL_VEGETALES, NEVERA, altoUtilDeNevera, nivelesDeMural,
} from "./medidas";
import { ProductoAGranel } from "./ProductoAGranel";

/**
 * La fruta y la verdura sobre las bandejas de un mural refrigerado.
 *
 * Va a GRANEL y no en frentes, que es la diferencia con cualquier otro mueble
 * de repisas: lo que se carga sobre una bandeja de vegetales es producto
 * suelto, amontonado, que rueda. Alinearlo en filas de frentes —como se hace
 * con una caja de galletas— se ve peor que dejarlo vacío.
 *
 * Y va INCLINADO con su bandeja. Ésa es la razón de que el montón no se
 * dibuje derecho: si el producto se para a plomo sobre una bandeja que cae
 * quince grados, la fila de atrás flota y la de adelante se hunde.
 */
export const ProductoEnMural = memo(function ProductoEnMural({
  w, d, h, rubro, semilla, ghost = false,
}: {
  w: number;
  d: number;
  h: number;
  /** Rubro del contrato. Sin uno, se cargan frutas: es un mural de vegetales y
   *  vacío no se parece a nada. */
  rubro?: string;
  semilla: string;
  ghost?: boolean;
}) {
  const niveles = useMemo(() => nivelesDeMural(h), [h]);
  const techo = NEVERA.zocalo + altoUtilDeNevera(h);
  const anchoInterior = Math.max(0.1, w - NEVERA.chapa * 2 - 0.04);
  const fondoInterior = Math.max(0.1, d - NEVERA.chapa - NEVERA.fondoPuerta - 0.05);

  if (ghost || niveles.length === 0) return null;

  return (
    <>
      {niveles.map((y, i) => {
        // La bandeja de arriba sólo tiene el copete encima; las de abajo, la
        // siguiente bandeja. De ahí sale cuánto se puede amontonar.
        const libre = (niveles[i + 1] ?? techo) - y;
        return (
          // El giro va sobre la bandeja, con el grupo ya puesto en su altura.
          // Rotando desde el origen del mueble, la fruta de las bandejas altas
          // sale disparada por el costado.
          <group
            key={y.toFixed(3)}
            position={[0, y, NEVERA.chapa / 2]}
            rotation={[MURAL_VEGETALES.caida, 0, 0]}
          >
            <ProductoAGranel
              ancho={anchoInterior}
              fondo={fondoInterior}
              y={0.014}
              // No hasta el techo: sobre una bandeja inclinada, un montón alto
              // se vuelca. En tienda se cargan dos o tres capas y se repone.
              altoLibre={Math.min(0.2, Math.max(0.08, libre * 0.5))}
              rubro={rubro || "Frutas"}
              semilla={`${semilla}|mural|${i}`}
            />
          </group>
        );
      })}
    </>
  );
});
