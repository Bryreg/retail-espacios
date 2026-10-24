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

/* ── Lo tecleado, con sus centavos ─────────────────────────────────────────
   El campo del precio se escribe como acá (es-CO): el punto es de miles y la
   coma, de los decimales. Un contrato de POBLADO guardó «$ 0,5»: al reabrirlo
   en «Editar contrato» el campo decía «1» (`Math.round`) y «Qué cambia» salía
   «$ 0,5 → $ 1» sin tocar nada. Ni al escribirlo ni al leerlo se redondea a
   pesos: hasta el centavo. */

const miles = (digitos: string): string => (digitos.replace(/^0+(?=\d)/, "") || "0").replace(/\B(?=(\d{3})+(?!\d))/g, ".");

/** Lo que dice el campo, como número: «1.000.000» → 1000000, «0,5» → 0.5,
 *  «7,25» → 7.25. Lo que no se entiende, 0. */
export function numeroDePrecio(texto: string): number {
  const [ent = "", dec = ""] = (texto ?? "").replace(/[^\d,]/g, "").split(",");
  const n = Number(`${ent || "0"}.${dec.slice(0, 2) || "0"}`);
  return Number.isFinite(n) ? n : 0;
}

/** Un número como se escribe en el campo, sin redondear a pesos: 0.5 →
 *  «0,5», 6 → «6», 1000000 → «1.000.000», 7.25 → «7,25». Hasta el centavo. */
export function textoDePrecioExacto(n: number): string {
  const v = Number.isFinite(n) && n > 0 ? n : 0;
  const centavos = Math.round(v * 100);
  const ent = Math.floor(centavos / 100), dec = centavos % 100;
  const base = miles(String(ent));
  return dec === 0 ? base : `${base},${String(dec).padStart(2, "0").replace(/0$/, "")}`;
}

/** Mientras se teclea: sólo dígitos y UNA coma (con hasta dos decimales), y
 *  los miles con punto. «1000000» → «1.000.000», «0,5» → «0,5», «7,» → «7,». */
export function precioTecleado(txt: string): string {
  const limpio = (txt ?? "").replace(/[^\d,]/g, "");
  if (!limpio) return "";
  const i = limpio.indexOf(",");
  if (i < 0) return miles(limpio);
  const ent = limpio.slice(0, i), dec = limpio.slice(i + 1).replace(/,/g, "").slice(0, 2);
  return `${miles(ent || "0")},${dec}`;
}
