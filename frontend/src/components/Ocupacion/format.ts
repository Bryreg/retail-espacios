/** Formato de plata, igual al de `DashboardView.tsx` (`formatCOP`/`compactCOP`).
 *
 *  Se repite acá en vez de importarse porque esas dos funciones son locales a
 *  `DashboardView.tsx` y no están exportadas — y esta carpeta es territorio de
 *  componentes nuevos que no deben depender de los internos de esa página
 *  para poder probarse solos. Si algún día se exportan desde ahí, esto se
 *  reemplaza por un import de una línea. */

/** "$1.800.000" — plata completa, para filas de tabla y notas cortas. */
export function formatCOP(n: number): string {
  if (!n) return "—";
  return "$" + Math.round(n).toLocaleString("es-CO");
}

/** "$1,8 M" / "$850 k" — para columnas angostas donde el monto completo choca. */
export function compactCOP(n: number): string {
  if (!n) return "—";
  if (n >= 995_000) {
    return "$" + (n / 1e6).toLocaleString("es-CO", { maximumFractionDigits: 1 }) + " M";
  }
  if (n >= 1_000) return "$" + Math.round(n / 1e3).toLocaleString("es-CO") + " k";
  return "$" + Math.round(n).toLocaleString("es-CO");
}
