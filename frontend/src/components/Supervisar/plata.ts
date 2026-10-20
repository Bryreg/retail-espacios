import { meses } from "../../utils/meses";

/**
 * La plata de Supervisar en UNA unidad a la vez (rediseño, PR 2; dibujo
 * aprobado en `docs/maquetas/rediseno-2026-10/supervisar.html`, paso 4).
 *
 * Lo que guarda un contrato es el TOTAL de todo su plazo (`monthly_rent`, que
 * Vender nunca prorrateó: `docs/rediseno/vender-api.md` §1). Supervisar decía
 * «al mes» al lado de ese total, y con un contrato de tres meses la cifra
 * salía tres veces más grande de lo que entra en un mes. Ahora hay UN selector
 * en la franja —«Plata: Al mes | Total»— y lo siguen las tres cosas que dicen
 * plata: las cifras, la columna de valor de «Estado por espacio» y «Quién
 * paga el canon». Nunca dos unidades en pantalla a la vez.
 *
 *  · **Al mes**: el total de cada contrato repartido en SUS meses, con la
 *    cuenta de `utils/meses.ts` (la gemela de `services/meses.py`, con los
 *    mismos casos). Nada de dividir por 30 a mano: del 1 al 30 de noviembre es
 *    un mes, del 1 de noviembre al 31 de enero son tres.
 *  · **Total**: lo firmado.
 *
 * Un contrato que se cobra por % de las ventas no tiene total: cuenta lo que ya
 * se cargó en sus cortes (`GET /api/cobros`), con la misma regla —al mes es lo
 * cargado repartido en los meses del contrato—. Una reserva no cuenta nunca
 * (`conLaReserva` en `DashboardView`). La tarifa de referencia está escrita al
 * mes: en «Total» se multiplica por los meses del periodo que se está mirando.
 *
 * Sólo para quien administra: el trabajador no ve plata, ni el selector. Lo
 * que se elige se recuerda en este navegador (`useUnidadDePlata.ts`).
 *
 * Puro y sin React: lo carga `probar-comercial` tal cual.
 */

export type UnidadDePlata = "mes" | "total";

/** El encabezado de la columna de valor de la tabla. */
export const ROTULO_DEL_VALOR: Record<UnidadDePlata, string> = {
  mes: "Valor al mes",
  total: "Valor total",
};

/** Al peso, con los medios hacia arriba (la cuenta de `utils/meses.ts`). */
function alPeso(x: number): number {
  return Math.floor(x + 0.5);
}

/** El total de un contrato en la unidad elegida. Sin fechas que se entiendan
 *  (`meses` da 0) se queda con el total: no se inventa un plazo. */
export function enLaUnidad(total: number, desde: string, hasta: string, unidad: UnidadDePlata): number {
  if (!(total > 0)) return 0;
  if (unidad === "total") return total;
  const m = meses(desde, hasta);
  return m > 0 ? alPeso(total / m) : total;
}

/** Una tarifa de referencia (que es AL MES) en la unidad elegida: en «Total»,
 *  por los meses del periodo que se está mirando. */
export function tarifaEnLaUnidad(tarifaAlMes: number, desde: string, hasta: string, unidad: UnidadDePlata): number {
  if (!(tarifaAlMes > 0)) return 0;
  if (unidad === "mes") return tarifaAlMes;
  const m = meses(desde, hasta);
  return m > 0 ? alPeso(tarifaAlMes * m) : tarifaAlMes;
}

/** «8 % de las ventas», con la coma de acá («7,5 %»). */
export function textoDelCobro(porcentaje: number): string {
  return `${Number(porcentaje).toLocaleString("es-CO", { maximumFractionDigits: 2 })} % de las ventas`;
}

/** «8 % ventas»: la celda de la tabla, donde no entra la frase entera. */
export function textoCortoDelCobro(porcentaje: number): string {
  return `${Number(porcentaje).toLocaleString("es-CO", { maximumFractionDigits: 2 })} % ventas`;
}
