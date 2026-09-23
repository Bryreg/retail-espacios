/**
 * Cuánto mide cada columna de «Estado por espacio» para LLENAR su caja.
 *
 * Dos pedidos del dueño seguidos (2026-09-23) que se contestan con la misma
 * regla. Primero: «la tabla maneja demasiado espaciado sin utilizar» —la
 * columna Proveedor se llevaba todo lo que sobraba y quedaba un hueco de mil
 * píxeles entre el proveedor y su estado—. Después, con la tabla ya apretada a
 * la izquierda: «quedó con un hueco grande a la derecha vacío». Ninguna de las
 * dos: la tabla llena su caja y lo que sobra se reparte PAREJO entre todas las
 * columnas, así no aparece un hueco en ningún lado.
 *
 * Y cuando la caja es más angosta que lo que las columnas quieren, ceden
 * primero las de texto largo —Proveedor, después Tipo—, que se cortan con «…»
 * y muestran el nombre entero al pasar por encima; las cifras y las fechas no
 * se cortan nunca. Si ni así entra, la tabla mide la suma de sus mínimos y se
 * desliza de costado.
 *
 * Aritmética pura, para probarla sin navegador (`scripts/probar-camara.mjs`).
 */

export interface Columna {
  /** Lo que la columna quiere medir: su texto más largo, o su ancho de siempre. */
  ancho: number;
  /** Lo menos que puede medir. Igual a `ancho` en las que no ceden. */
  minimo: number;
  /** Orden en que ceden cuando falta lugar: 1 primero, 2 después. Las que no
   *  ceden no lo llevan. */
  cede?: number;
}

export function repartirAnchos(columnas: Columna[], disponible: number): number[] {
  const quiere = columnas.reduce((t, c) => t + c.ancho, 0);
  if (!(disponible > 0) || columnas.length === 0) return columnas.map((c) => c.ancho);

  if (disponible >= quiere) {
    const extra = (disponible - quiere) / columnas.length;
    return columnas.map((c) => c.ancho + extra);
  }

  const anchos = columnas.map((c) => c.ancho);
  let falta = quiere - disponible;
  const turnos = [...new Set(columnas.map((c) => c.cede).filter((n): n is number => n !== undefined))]
    .sort((a, b) => a - b);
  for (const turno of turnos) {
    columnas.forEach((c, i) => {
      if (c.cede !== turno || falta <= 0) return;
      const puede = anchos[i] - c.minimo;
      const quita = Math.min(puede, falta);
      anchos[i] -= quita;
      falta -= quita;
    });
    if (falta <= 0) break;
  }
  return anchos;
}
