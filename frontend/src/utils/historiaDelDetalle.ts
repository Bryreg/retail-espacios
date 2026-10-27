/**
 * Las cuentas del Detalle de Indicadores contado como una historia (2026-10-27).
 *
 * Puras, para que `probar-detalle` las corra con números a mano: cómo se
 * reparte lo que la sede podría cobrar a tarifa, cuánto canon sigue entrando
 * semana a semana si no se renueva nada, dónde cambian los espacios
 * disponibles y la frase que encabeza la pantalla. Ninguna inventa un dato:
 * todo sale de lo que la pantalla comercial ya contó.
 */

export interface PartesDelPotencial {
  /** Lo que la sede podría cobrar al mes si todo estuviera alquilado a tarifa
   *  (o lo cobrado más lo vacío, si se cobra por encima de la tarifa). */
  potencial: number;
  /** El canon al mes de todos los contratos. */
  cobrado: number;
  /** Lo que se deja de cobrar por alquilar bajo la tarifa. */
  precio: number;
  /** Lo que vale a tarifa lo que hoy no tiene contrato. */
  vacio: number;
  /** Lo que se cobra POR ENCIMA de la tarifa (si pasa, `precio` es 0). */
  sobreTarifa: number;
}

/** Cómo se reparte el potencial a tarifa, con UNA base: la tarifa de cada
 *  espacio. Lo alquilado vale a tarifa `potencial − vacío`; lo que no se
 *  cobra de eso es «bajo la tarifa». Las tres partes suman el potencial (salvo
 *  que se cobre más que la tarifa: entonces la barra es lo cobrado más lo
 *  vacío, y `sobreTarifa` dice cuánto de más). */
export function repartoDelPotencial(d: { potencial: number; cobrado: number; vacio: number }): PartesDelPotencial {
  const potencialATarifa = Math.max(0, d.potencial);
  const vacio = Math.min(Math.max(0, d.vacio), potencialATarifa);
  const cobrado = Math.max(0, d.cobrado);
  const alquilado = potencialATarifa - vacio;
  const precio = Math.max(0, alquilado - cobrado);
  const sobreTarifa = Math.max(0, cobrado - alquilado);
  return { potencial: cobrado + precio + vacio, cobrado, precio, vacio, sobreTarifa };
}

export interface PuntoQueVence { codigo: string; dias: number; alMes: number; renovado: boolean }

/** El canon (o los contratos) que sigue corriendo día a día, desde hoy hasta
 *  `dias`, si no se renueva ni se vende nada: baja el día DESPUÉS del último
 *  día de cada contrato sin renovar. Devuelve los escalones (día y valor). */
export function loQueSigue(base: number, puntos: readonly PuntoQueVence[], dias = 91): { dia: number; valor: number }[] {
  const out: { dia: number; valor: number }[] = [{ dia: 0, valor: base }];
  let v = base;
  const bajas = puntos.filter((p) => !p.renovado && p.dias >= 0 && p.dias < dias)
    .map((p) => ({ dia: p.dias + 1, menos: p.alMes }))
    .sort((a, b) => a.dia - b.dia);
  for (const b of bajas) {
    v = Math.max(0, v - b.menos);
    const ult = out[out.length - 1];
    if (ult.dia === b.dia) ult.valor = v; else out.push({ dia: b.dia, valor: v });
  }
  return out;
}

/** Los días en que cambia la cantidad de espacios disponibles, con cuánto. */
export function cambiosDeDisponibles(porDia: readonly number[]): { dia: number; antes: number; despues: number }[] {
  const out: { dia: number; antes: number; despues: number }[] = [];
  for (let d = 1; d < porDia.length; d++) if (porDia[d] !== porDia[d - 1]) out.push({ dia: d, antes: porDia[d - 1], despues: porDia[d] });
  return out;
}

/** «7 %» con redondeo a entero, o «menos de 1 %». */
export function porciento(parte: number, total: number): string {
  if (!(total > 0)) return "0 %";
  const p = (parte / total) * 100;
  if (p > 0 && p < 1) return "menos de 1 %";
  return `${Math.round(p)} %`;
}

/** La frase que encabeza el Detalle: lo más importante primero, con números
 *  completos. Para administración habla de plata; para el trabajador, de
 *  espacios. */
export function titularDelDetalle(d: {
  sede: string; esAdmin: boolean;
  reparto: PartesDelPotencial | null; canonTotal: number | null;
  ocupacionPct: number; metaOcupacion: number;
  sinRenovar13: number; contratosQueVencen13: number;
  pesos: (n: number) => string;
}): string[] {
  const f: string[] = [];
  if (d.esAdmin && d.reparto && d.canonTotal !== null && d.reparto.potencial > 0) {
    const r = d.reparto;
    f.push(r.sobreTarifa > 0
      ? `${d.sede} cobra ${d.pesos(d.canonTotal)} al mes: lo alquilado rinde más que su tarifa.`
      : `${d.sede} cobra ${d.pesos(d.canonTotal)} al mes: el ${porciento(r.cobrado, r.potencial)} de lo que podría cobrar a tarifa (${d.pesos(r.potencial)}).`);
    if (r.precio > 0 || r.vacio > 0) {
      f.push(r.precio >= r.vacio
        ? `Lo que más falta no son los espacios vacíos (${d.pesos(r.vacio)}) sino el precio: lo alquilado se cobra ${d.pesos(r.precio)} por debajo de su tarifa.`
        : `Lo que más falta son los espacios vacíos: valen ${d.pesos(r.vacio)} al mes a tarifa.`);
    }
  } else {
    f.push(`${d.sede} tiene ocupado el ${d.ocupacionPct} % de lo que se vende${d.ocupacionPct >= d.metaOcupacion ? ", en la meta" : `, ${d.metaOcupacion - d.ocupacionPct} puntos bajo la meta de ${d.metaOcupacion} %`}.`);
  }
  if (d.contratosQueVencen13 > 0) {
    f.push(d.esAdmin
      ? `En las próximas 13 semanas vencen ${d.contratosQueVencen13} contrato${d.contratosQueVencen13 === 1 ? "" : "s"} sin renovar: ${d.pesos(d.sinRenovar13)} al mes.`
      : `En las próximas 13 semanas vencen ${d.contratosQueVencen13} contrato${d.contratosQueVencen13 === 1 ? "" : "s"} sin renovar.`);
  } else {
    f.push("Nada vence sin renovar en las próximas 13 semanas.");
  }
  return f;
}
