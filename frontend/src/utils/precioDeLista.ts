/**
 * El precio con el que arranca cada espacio del contrato en Vender: su tarifa
 * de referencia, escrita en el campo del valor acordado.
 *
 * No es una comodidad: el precio de lista es el punto de partida real de la
 * negociación, y dejar el campo vacío obliga a ir a buscar la tarifa en otro
 * panel y a teclearla — que es donde se cuela un cero de más.
 *
 * **El campo sigue a la tarifa mientras nadie lo toque.** Antes se escribía
 * una sola vez por espacio, y eso andaba mientras la tarifa dependía sólo de
 * lo que ya estaba al abrir. Con las fichas propias del supermercado depende
 * también de `GET /api/muebles/modelos`, que llega aparte (y puede fallar y
 * reintentarse): una media estiba propia tocada antes de que llegaran se
 * quedaba con la tarifa de la estiba entera —3.000.000 en vez de 900.000—
 * aunque llegaran un segundo después, y el navegador guardaba un precio
 * distinto del que dan la planilla y la consola para el mismo mueble.
 *
 * Lo `tocado` es de alguien y no se pisa: lo que se tecleó (también borrarlo:
 * si alguien lo borra a mano, se queda borrado) y lo que trae la semilla de
 * una renovación, que es lo que se está pagando hoy y no la tarifa de lista.
 *
 * Puro, sin React: lo prueba `probar-vender.mjs`.
 */

/** Lo que hace falta saber de cada renglón del contrato. */
export interface RenglonConPrecio {
  /** El código completo del espacio (`NAVE-NEV-01`). */
  codigo: string;
  /** La tarifa de referencia de ese espacio, o `null` si no hay. */
  ref: number | null;
  /** Lo que dice hoy el campo del valor acordado. */
  valor: string;
}

/** La tarifa como se escribe en el campo (`900.000`). */
export const textoDePrecio = (n: number): string => n.toLocaleString("es-CO");

/** Los campos que hay que reescribir con la tarifa de lista: los que nadie
 *  tocó y no dicen ya esa tarifa. Vacío si no hay nada que cambiar. */
export function valoresDeLista(
  renglones: readonly RenglonConPrecio[],
  tocados: ReadonlySet<string>,
): Record<string, string> {
  const nuevos: Record<string, string> = {};
  for (const r of renglones) {
    if (tocados.has(r.codigo) || r.ref === null) continue;
    const deLista = textoDePrecio(r.ref);
    if (r.valor !== deLista) nuevos[r.codigo] = deLista;
  }
  return nuevos;
}
