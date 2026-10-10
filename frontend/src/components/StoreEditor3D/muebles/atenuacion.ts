import { useContext, useEffect } from "react";
import { useThree } from "@react-three/fiber";
import { ATENUACION, atenuarUniformes, FocoDeVenta, uniformesDe } from "./luzDeVenta";
import type { UniformesDeVenta } from "./luzDeVenta";

/**
 * Atenúa los materiales de venta de un mueble VECINO (`FocoDeVenta`) sin
 * rehacerlos: un efecto escribe sus uniformes (`atenuarUniformes`) y pide un
 * cuadro. `fuentes` son materiales, props de materiales declarativos (las del
 * robatope) o los uniformes mismos; lo que no tiene luz de venta se ignora.
 * Devuelve el foco, por si el mueble tiene algo más que apagar (la nevera).
 *
 * Aparte de `luzDeVenta.ts` porque ése se prueba en node y esto necesita el
 * `invalidate` de la escena.
 */
export function useAtenuacion(
  fuentes: readonly ({ userData?: { luzDeVenta?: UniformesDeVenta } } | null | undefined)[],
  exposicion: number = ATENUACION.exposicion,
): boolean {
  const foco = useContext(FocoDeVenta);
  const { invalidate } = useThree();
  useEffect(() => {
    if (atenuarUniformes(fuentes.map(uniformesDe), foco, exposicion) > 0) invalidate();
  // Las fuentes son las de un memo (cambian cuando cambian los materiales).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...fuentes, foco, exposicion, invalidate]);
  return foco;
}
