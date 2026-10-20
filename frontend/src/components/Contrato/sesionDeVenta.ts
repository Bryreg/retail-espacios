import { useCallback, useEffect, useMemo, useRef, useState } from "react";
// Sólo el TIPO: el editor 3D no puede entrar al paquete de Vender por acá.
import type { ComoSePrueba } from "../StoreEditor3D/StoreEditor3D";
// De `utils/` y no de `muebles/privacidad.ts` (que la reexporta): importada
// de ahí, el paquete de Vender arrastraba la privacidad del 3D, los
// habladores y las medidas de los muebles al entrar.
import { normalizarProveedor } from "../../utils/proveedor";

/**
 * La prueba de producto del visor 3D de Vender: qué producto se le probó a
 * cada cara del contrato y CÓMO (en qué entrepaños, acostado, el surtido, las
 * rejillas de la nevera).
 *
 * Vive en la FICHA del contrato y no en el visor, y es a propósito: el visor
 * se abre y se cierra muchas veces en una llamada —«a ver cómo queda», volver
 * a las fechas, «a ver la otra punta»— y al reabrirlo el yogur tiene que
 * seguir en la punta. Con el estado adentro del visor, cada cierre lo perdía.
 * Y vive en la ficha y no más arriba porque se olvida con ella: al guardar el
 * contrato, al cambiar de sede o al «Empezar de nuevo» la ficha se va o se
 * vacía, y la prueba también.
 *
 * Es la MISMA forma que la sesión del editor —la clave `${fixtureId}|cara`, el
 * `ComoSePrueba`—, porque la escena que la dibuja es la misma. Y como en el
 * editor, NO va al layout: no hay una sola línea acá que escriba el plano, el
 * store o el servidor. El plano es lo que está montado de verdad.
 */
export interface SesionDeVenta {
  prueba: ReadonlyMap<string, number>;
  como: ReadonlyMap<string, ComoSePrueba>;
  /** Prueba un producto en una cara (`null` lo quita). Un producto nuevo
   *  arranca en «Toda la cara» y parado: es lo primero que se muestra. */
  probar: (fixtureId: string, cara: "A" | "B", arteId: number | null) => void;
  ajustar: (fixtureId: string, cara: "A" | "B", cambios: Partial<ComoSePrueba>) => void;
  vaciar: () => void;
}

export function useSesionDeVenta(proveedor: string): SesionDeVenta {
  const [prueba, setPrueba] = useState<ReadonlyMap<string, number>>(() => new Map());
  const [como, setComo] = useState<ReadonlyMap<string, ComoSePrueba>>(() => new Map());

  // Siempre un mapa NUEVO y nunca una mutación: el memo de materiales de la
  // escena compara por identidad, y mutar el mismo Map no repinta nada
  // (igual que `probarProducto` y `ajustarPrueba` del editor).
  const probar = useCallback((fixtureId: string, cara: "A" | "B", arteId: number | null) => {
    const clave = `${fixtureId}|${cara}`;
    setPrueba((prev) => {
      const siguiente = new Map(prev);
      if (arteId == null) siguiente.delete(clave);
      else siguiente.set(clave, arteId);
      return siguiente;
    });
    setComo((prev) => {
      const siguiente = new Map(prev);
      if (arteId == null) siguiente.delete(clave);
      else siguiente.set(clave, { donde: "todas" });
      return siguiente;
    });
  }, []);

  const ajustar = useCallback((fixtureId: string, cara: "A" | "B", cambios: Partial<ComoSePrueba>) => {
    const clave = `${fixtureId}|${cara}`;
    setComo((prev) => {
      const siguiente = new Map(prev);
      siguiente.set(clave, { donde: "todas", ...prev.get(clave), ...cambios });
      return siguiente;
    });
  }, []);

  const vaciar = useCallback(() => {
    setPrueba(new Map());
    setComo(new Map());
  }, []);

  // Otro PROVEEDOR, otra prueba: si la ficha pasa de «Alpina» a «Postobón»,
  // el yogur de Alpina no puede quedar puesto en la punta que se le muestra a
  // Postobón. Escribirlo distinto («alpina », «ALPINA») no es otro proveedor
  // —es la regla de «Guardar contrato»— y no vacía nada. El ref arranca con
  // el nombre del primer render: montar la ficha no vacía (y en desarrollo,
  // con StrictMode, el efecto doble tampoco: compara contra el mismo nombre).
  const anterior = useRef(normalizarProveedor(proveedor));
  useEffect(() => {
    const ahora = normalizarProveedor(proveedor);
    if (ahora === anterior.current) return;
    anterior.current = ahora;
    vaciar();
  }, [proveedor, vaciar]);

  return useMemo(
    () => ({ prueba, como, probar, ajustar, vaciar }),
    [prueba, como, probar, ajustar, vaciar],
  );
}
