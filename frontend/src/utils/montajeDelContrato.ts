import type { MountConfirmation } from "../api/mounts";

/**
 * Qué reporte de montaje es el de un contrato (2026-10-05).
 *
 * El reporte se guarda por CÓDIGO de espacio, no por contrato —no hay columna
 * para el contrato, y a las tablas viejas no se les agregan columnas—. El
 * tablero tomaba el último reporte de cada código sin mirar fechas, así que
 * cuando un espacio pasaba de un contrato a otro, el «montado» del anterior
 * sacaba al nuevo de la lista de pendientes y lo pintaba montado sin ninguna
 * prueba: justo el contrato que se está cobrando sin que nadie haya ido.
 *
 * La regla es la del enlace firmado (`routers/montaje.py::_se_confirma_desde`):
 * un reporte cuenta para un contrato si se hizo **desde la víspera de su
 * arranque**, hora de Colombia —el día en que se desarma lo anterior y se arma
 * esto—. `probar-montajes.mjs` vigila que las dos puntas digan lo mismo.
 */

/** Los reportes de cada código, el más reciente primero (el backend ya los
 *  manda en ese orden; se respeta tal cual). */
export function reportesPorCodigo(
  list: MountConfirmation[],
): Record<string, MountConfirmation[]> {
  const out: Record<string, MountConfirmation[]> = {};
  for (const m of list) (out[m.space_code] ??= []).push(m);
  return out;
}

/** Desde qué instante (ms UTC) cuenta un reporte para el contrato que arranca
 *  el `desde` (`AAAA-MM-DD`): la medianoche de Colombia (UTC−5 fijo, sin
 *  horario de verano) de la víspera. Sin fecha, null: cuenta cualquiera.
 *
 *  Se arma a mano y no con `new Date("AAAA-MM-DD")`, que toma medianoche UTC y
 *  en Colombia cae el día anterior. */
export function cuentaDesde(desde: string | null | undefined): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(desde ?? "");
  if (!m) return null;
  // Medianoche de Colombia son las 05:00 UTC; la víspera, un día antes.
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) - 1, 5, 0, 0);
}

/** El instante de un reporte, en ms UTC. Postgres manda la hora con huso;
 *  SQLite, sin él —lo guardado es UTC—, y `Date.parse` la tomaría como hora
 *  local, cinco horas corrida. */
export function instanteDe(m: MountConfirmation): number {
  const t = (m.confirmado_en ?? "").trim();
  if (!t) return NaN;
  return Date.parse(/(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(t) ? t : `${t}Z`);
}

/** El último reporte de `code` que cuenta para el contrato que arranca el
 *  `desde`. Sin fecha —un espacio libre—, el último a secas. */
export function reporteDelContrato(
  porCodigo: Record<string, MountConfirmation[]>,
  code: string,
  desde: string | null | undefined,
): MountConfirmation | undefined {
  const lista = porCodigo[code];
  if (!lista?.length) return undefined;
  const corte = cuentaDesde(desde);
  if (corte === null) return lista[0];
  return lista.find((m) => instanteDe(m) >= corte);
}

/** Lo que el enlace de montaje dice de un reporte que ya se hizo.
 *
 *  «La foto quedó guardada como prueba» sólo con la foto de verdad: un reporte
 *  «montado» puede quedar sin ella porque la limpieza la borró al terminar el
 *  contrato sin renovación (`services/fotos_vencidas.py`) o porque un admin la
 *  borró para que la repitan, con el contrato en curso. Por eso el texto sin
 *  foto no dice la causa: decir «se borra cuando el contrato termina» con el
 *  contrato vigente sería mentirle a quien la tiene que volver a sacar. */
export function textoDelReporte(
  reporte: Pick<MountConfirmation, "estado" | "file_id">,
): string {
  if (reporte.estado !== "montado") return "Quedó registrado el motivo para que se pueda reclamar.";
  return reporte.file_id
    ? "La foto quedó guardada como prueba de que la exhibición está armada."
    : "Quedó registrado como montado. La foto ya no está guardada.";
}
