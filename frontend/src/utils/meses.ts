/**
 * La duración de un contrato en MESES, para «al mes» (Vender) y para repartir
 * un total en sus meses (Supervisar, PR 2).
 *
 * Una sola cuenta, escrita dos veces con los mismos casos: ésta y
 * `backend/app/services/meses.py`, que corren `frontend/scripts/casos/meses.json`
 * (`probar-contrato.mjs` y su prueba de pytest). Si se separan, el contrato que
 * firma la pantalla («$ 600.000 al mes por 3 meses») y el que guarda el
 * servidor dicen totales distintos.
 *
 * La regla (`docs/rediseno/vender-api.md` §6): los meses calendario COMPLETOS
 * entre `desde` y el día siguiente a `hasta` —los dos extremos cuentan—, más los
 * días que sobran divididos por 30. Del 1 al 30 de noviembre es 1; del 1 de
 * noviembre al 31 de enero, 3; del 19 de octubre al 18 de noviembre, 1. Sumar
 * un mes a un 31 cae en el último día del mes que no lo tiene (31 ene + 1 mes =
 * 28 feb), contado siempre desde `desde` y no de mes en mes.
 *
 * Puro y sin importar nada: lo carga `probar-contrato` tal cual. Las fechas son
 * días del calendario escritos en ISO (`2026-11-01`), nunca `new Date("…")`, que
 * en Colombia es el día anterior a las 7 p. m.
 */

/** Al peso más cercano, con los medios hacia arriba (`redondear` de
 *  `utils/partes.ts` y del servidor: `Math.round` y `round` de Python no
 *  redondean igual los medios). Copiada acá para no importar el catálogo. */
function redondear(x: number): number {
  return Math.floor(x + 0.5);
}

/** El número de día (desde 1970) de una fecha ISO, en UTC: un día es un día. */
function numeroDeDia(iso: string): number {
  return Math.floor(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86_400_000);
}

const DIAS_DEL_MES = (anio: number, mes0: number) => new Date(Date.UTC(anio, mes0 + 1, 0)).getUTCDate();

/** `iso` + `n` meses, con el día recortado al último del mes de llegada. */
export function sumarMeses(iso: string, n: number): string {
  const anio0 = +iso.slice(0, 4), mes0 = +iso.slice(5, 7) - 1, dia = +iso.slice(8, 10);
  const total = mes0 + n;
  const anio = anio0 + Math.floor(total / 12);
  const mes = ((total % 12) + 12) % 12;
  const d = Math.min(dia, DIAS_DEL_MES(anio, mes));
  return `${String(anio).padStart(4, "0")}-${String(mes + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** `iso` + `n` días. */
export function sumarDias(iso: string, n: number): string {
  const d = new Date(0);
  d.setUTCFullYear(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10) + n);
  return d.toISOString().slice(0, 10);
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Cuántos meses dura el contrato de `desde` a `hasta`, los dos días incluidos.
 *  0 si las fechas no se entienden o están al revés. */
export function meses(desde: string, hasta: string): number {
  if (!ISO.test(desde) || !ISO.test(hasta) || hasta < desde) return 0;
  const fin = sumarDias(hasta, 1);
  let completos = 0;
  while (sumarMeses(desde, completos + 1) <= fin) completos++;
  const sobran = numeroDeDia(fin) - numeroDeDia(sumarMeses(desde, completos));
  return completos + sobran / 30;
}

/** Lo tecleado en un campo de plata, en pesos enteros (auditoría P2-11): al
 *  peso con los medios hacia arriba, como el servidor (`schemas/pesos.py`).
 *  Vacío, negativo o ilegible: 0. */
export function pesosEnteros(texto: string): number {
  const n = Number(String(texto).trim());
  return Number.isFinite(n) && n > 0 ? redondear(n) : 0;
}

/** El total de un precio «al mes» por todo el plazo, al peso. */
export function totalDeMensual(mensual: number, desde: string, hasta: string): number {
  return redondear(mensual * meses(desde, hasta));
}

/** «1 mes», «3 meses», «1,5 meses», «0,03 meses». */
export function textoDeMeses(m: number): string {
  if (m === 1) return "1 mes";
  const dos = Math.round(m * 100) / 100;
  return `${String(dos).replace(".", ",")} meses`;
}

/** Un total repartido en SUS meses, al peso (lo «al mes» de Supervisar,
 *  `enLaUnidad`). Sin fechas que se entiendan (`meses` da 0) se queda con el
 *  total: no se inventa un plazo. */
export function alMesDe(total: number, desde: string, hasta: string): number {
  const m = meses(desde, hasta);
  return m > 0 ? redondear(total / m) : total;
}

/** «Bajo tarifa de referencia»: el contrato AL MES (su total repartido en sus
 *  meses) contra la tarifa, que está escrita al mes. Comparaba el TOTAL con la
 *  tarifa —y la fila mostraba el valor al mes—: un contrato de tres meses a
 *  $ 500.000 al mes contra una tarifa de $ 650.000 nunca salía, y uno de
 *  quince días por encima de la tarifa salía «bajo». Sólo una brecha que se
 *  note (1 % o más). `null`: no está por debajo, o no hay con qué comparar. */
export function bajoLaTarifa(
  total: number, desde: string, hasta: string, tarifaAlMes: number | null,
): { alMes: number; brechaPct: number } | null {
  if (!(total > 0) || !(tarifaAlMes && tarifaAlMes > 0)) return null;
  const alMes = alMesDe(total, desde, hasta);
  const brechaPct = Math.round((1 - alMes / tarifaAlMes) * 100);
  return brechaPct >= 1 ? { alMes, brechaPct } : null;
}
