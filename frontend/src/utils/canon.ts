/**
 * El canon de un mes: UNA definición, escrita dos veces (auditoría P1-16).
 *
 * Inicio sumaba acá el valor al mes COMPLETO de cada contrato vigente hoy, y
 * «Todas las sedes» y la curva de 12 meses usaban `GET /dashboard/serie`, que
 * prorratea por días: la misma sede decía dos cifras. Queda la del servidor
 * (`backend/app/services/canon.py`), al peso:
 *
 * · cada contrato aporta su canon AL MES (el total repartido en los meses de
 *   su plazo FIRMADO, `meses`) por los días del mes que corre ÷ los días del
 *   mes; si se dio de baja, corre hasta `corta`;
 * · lo cobrado en los cortes de ventas, repartido por días si cruzan meses;
 * · la suma, al peso con los medios hacia arriba.
 *
 * Las dos corren `frontend/scripts/casos/canon.json` (`probar-canon.mjs` y
 * `backend/tests/test_canon.py`). El orden de las operaciones es el mismo que
 * allá (`alMes * dias / diasDelMes`): con dobles IEEE dan el mismo número.
 *
 * Puro: fechas ISO de calendario (`2026-11-01`), nunca `new Date("…")`.
 */
import { meses } from "./meses";

export interface ContratoDelMes {
  /** El TOTAL del contrato por todo su plazo (`monthly_rent`). */
  valor: number;
  desde: string;
  hasta: string;
  /** El último día que corrió, si se dio de baja antes de `hasta`. */
  corta?: string | null;
}

export interface CorteDelMes {
  monto: number;
  desde: string;
  hasta: string;
}

function numeroDeDia(iso: string): number {
  return Math.floor(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86_400_000);
}

function diasDelMes(mes: string): number {
  return new Date(Date.UTC(+mes.slice(0, 4), +mes.slice(5, 7), 0)).getUTCDate();
}

function limites(mes: string): [string, string] {
  return [`${mes}-01`, `${mes}-${String(diasDelMes(mes)).padStart(2, "0")}`];
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Lo que un contrato devenga en `mes` (`AAAA-MM`), sin redondear. */
export function devengadoDelContrato(c: ContratoDelMes, mes: string): number {
  if (!ISO.test(c.desde) || !ISO.test(c.hasta)) return 0;
  const [ini, fin] = limites(mes);
  const ultimo = c.corta && c.corta < c.hasta ? c.corta : c.hasta;
  const a = c.desde > ini ? c.desde : ini;
  const b = ultimo < fin ? ultimo : fin;
  if (a > b) return 0;
  const total = Number(c.valor) || 0;
  const m = meses(c.desde, c.hasta);
  // `meses.al_mes_de` del servidor: sin plazo que contar, el total.
  const alMes = m > 0 && total > 0 ? total / m : total;
  return alMes * (numeroDeDia(b) - numeroDeDia(a) + 1) / diasDelMes(mes);
}

/** Lo de un corte de ventas que cae en `mes`, repartido por días. */
export function devengadoDelCorte(c: CorteDelMes, mes: string): number {
  if (!ISO.test(c.desde) || !ISO.test(c.hasta)) return 0;
  const [ini, fin] = limites(mes);
  const dias = numeroDeDia(c.hasta) - numeroDeDia(c.desde) + 1;
  const cruce = numeroDeDia(c.hasta < fin ? c.hasta : fin) - numeroDeDia(c.desde > ini ? c.desde : ini) + 1;
  if (dias <= 0 || cruce <= 0) return 0;
  return (Number(c.monto) || 0) * cruce / dias;
}

/** El canon de `mes` (`AAAA-MM`), en pesos enteros. */
export function canonDelMes(contratos: readonly ContratoDelMes[], cortes: readonly CorteDelMes[], mes: string): number {
  let total = 0;
  for (const c of contratos) total += devengadoDelContrato(c, mes);
  for (const c of cortes) total += devengadoDelCorte(c, mes);
  return total > 0 ? Math.floor(total + 0.5) : total;
}

/** El día de hoy en Colombia (UTC−5 fijo, sin horario de verano), en ISO: el
 *  «hoy» del negocio, el mismo de `backend/app/fechas.py` (auditoría P3-8). El
 *  del navegador cambia de día a las 7 p. m. si la máquina está en UTC. */
export function hoyEnColombia(ahora: number = Date.now()): string {
  return new Date(ahora - 5 * 3_600_000).toISOString().slice(0, 10);
}
