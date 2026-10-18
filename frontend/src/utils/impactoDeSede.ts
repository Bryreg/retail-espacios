/**
 * Lo que se dice antes de borrar o renombrar una sede, con lo que cuenta el
 * servidor (`GET /layout/{sede}/impact`, `sede_archive.count_commercial_rows`):
 * los contratos activos que se cierran y las reservas provisionales de
 * participación que se cancelan (§2.5 del diseño de participaciones). Puro:
 * lo prueba `probar-distribucion.mjs` sin navegador.
 *
 * El renombre de una sede es, en el navegador, «borrar + crear»
 * (`renameSede` de `fixtureStore.ts` llama a `deleteLayout` del nombre
 * viejo): hereda el archivo de sede, que cierra los contratos y cancela las
 * reservas. Ese defecto es una tarea aparte (D21/D22); acá sólo se dice antes.
 */

/** Lo que devuelve el servidor (`reservas_vivas` puede faltar en uno viejo). */
export interface ImpactoDeSede {
  spaces: number;
  active_leases: number;
  reservas_vivas?: number;
}

/** Una línea por cosa que se pierde: «2 contratos activos se cerrarán»,
 *  «1 reserva provisional de participación se cancela». Vacía si no hay nada. */
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

/**
 * El aviso del renombre de `de` a `a`, o null si no se pierde nada (entonces
 * se renombra sin preguntar, como siempre). `impacto: null` es que no se pudo
 * saber: ante la duda se avisa igual, sin números.
 */
export function avisoDelRenombre(de: string, a: string, impacto: ImpactoDeSede | null): string | null {
  const lineas = lineasDelImpacto(impacto);
  const comoFunciona = `Renombrar «${de}» a «${a}» borra la sede y la vuelve a crear con el nombre nuevo`;
  if (impacto === null) {
    return `${comoFunciona}: si tiene contratos activos se cierran, y sus reservas provisionales de participación se cancelan. No se pudo saber cuántos hay.`;
  }
  if (lineas.length === 0) return null;
  return `${comoFunciona}: ${lineas.join(" y ")}. No se puede deshacer.`;
}
