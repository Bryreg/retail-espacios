import { useCallback, useState } from "react";
import type { UnidadDePlata } from "./plata";

/**
 * La unidad de la plata que eligió quien mira («Al mes | Total»), recordada en
 * ESTE navegador: es una comodidad de quien mira, no un dato. Si el
 * almacenamiento no está (ventana privada, bloqueado), arranca en «Al mes» y
 * vale para esta visita.
 */

/** La llave del navegador donde se recuerda la unidad. */
export const LLAVE_DE_LA_UNIDAD = "recabra-supervisar-plata";

function leerUnidad(): UnidadDePlata {
  try {
    return window.localStorage.getItem(LLAVE_DE_LA_UNIDAD) === "total" ? "total" : "mes";
  } catch {
    return "mes";
  }
}

/** La unidad elegida, recordada por quien mira. */
export function useUnidadDePlata(): [UnidadDePlata, (u: UnidadDePlata) => void] {
  const [unidad, setUnidad] = useState<UnidadDePlata>(leerUnidad);
  const elegir = useCallback((u: UnidadDePlata) => {
    setUnidad(u);
    try {
      window.localStorage.setItem(LLAVE_DE_LA_UNIDAD, u);
    } catch {
      /* sin almacenamiento: vale para esta visita */
    }
  }, []);
  return [unidad, elegir];
}
