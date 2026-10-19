/**
 * Lo que se dice antes de borrar o renombrar una sede, con lo que cuenta el
 * servidor (`GET /layout/{sede}/impact`, `sede_archive.count_commercial_rows`):
 * los contratos activos y las reservas provisionales de participación de la
 * sede (§2.5 del diseño de participaciones). Puro: lo prueba
 * `probar-distribucion.mjs` sin navegador.
 *
 * Borrar la sede los cierra y las cancela (`lineasDelImpacto`, el diálogo de
 * «Borrar sede»). Renombrarla, desde la fase 2 de las participaciones, ya no:
 * el renombre es del servidor (`POST /layout/{sede}/renombrar`,
 * `services/renombre_sede.py`) y los códigos pasan al nombre nuevo con todo lo
 * que cuelga de ellos. Antes era «borrar + crear» y heredaba el archivo de la
 * sede; `avisoDelRenombre` ahora sólo dice adónde va lo vendido.
 */

/** Lo que devuelve el servidor (`reservas_vivas` puede faltar en uno viejo). */
export interface ImpactoDeSede {
  spaces: number;
  active_leases: number;
  reservas_vivas?: number;
}

/** Una línea por cosa que se pierde al BORRAR: «2 contratos activos se
 *  cerrarán», «1 reserva provisional de participación se cancela». Vacía si
 *  no hay nada. */
export function lineasDelImpacto(i: ImpactoDeSede | null | undefined): string[] {
  if (!i) return [];
  const fuera: string[] = [];
  const c = i.active_leases ?? 0;
  if (c > 0) fuera.push(`${c} contrato${c !== 1 ? "s" : ""} activo${c !== 1 ? "s" : ""} se cerrará${c !== 1 ? "n" : ""}`);
  const r = i.reservas_vivas ?? 0;
  if (r > 0) {
    fuera.push(r === 1
      ? "1 reserva provisional de participación se cancela"
      : `${r} reservas provisionales de participación se cancelan`);
  }
  return fuera;
}

/** Lo que el renombre promete y cumple: el enlace de montaje que dice su
 *  contrato toma el código del contrato (`routers/montaje.py`). Los de antes
 *  del 2026-10-02 no lo dicen —llevan sólo el código— y con el código viejo ya
 *  no encuentran el espacio: se avisa que hay que volver a mandarlos. */
export const SIGUEN_LOS_ENLACES =
  "Los enlaces de montaje enviados desde el 2 de octubre siguen andando; los anteriores hay que volver a mandarlos.";

/**
 * Lo que se dice antes de renombrar `de` a `a` (fase 2 · I5): adónde va lo
 * vendido. Nada se pierde, así que no hay «no se puede deshacer» ni nada que
 * se cierre o se cancele. `null` si la sede no tiene contratos ni reservas
 * (se renombra sin preguntar). `impacto: null` es que no se pudo saber: se
 * dice igual, sin números.
 */
export function avisoDelRenombre(de: string, a: string, impacto: ImpactoDeSede | null): string | null {
  if (impacto === null) {
    return `Los contratos y las reservas provisionales de participación de «${de}», si tiene, pasan a «${a}». ${SIGUEN_LOS_ENLACES}`;
  }
  const c = impacto.active_leases ?? 0;
  const r = impacto.reservas_vivas ?? 0;
  if (c <= 0 && r <= 0) return null;
  const partes: string[] = [];
  if (c > 0) partes.push(c === 1 ? "el contrato activo" : `los ${c} contratos activos`);
  if (r > 0) {
    partes.push(r === 1
      ? "la reserva provisional de participación"
      : `las ${r} reservas provisionales de participación`);
  }
  const quienes = partes.join(" y ");
  const verbo = c + r > 1 ? "pasan" : "pasa";
  return `${quienes.charAt(0).toUpperCase()}${quienes.slice(1)} de «${de}» ${verbo} a «${a}». ${SIGUEN_LOS_ENLACES}`;
}
