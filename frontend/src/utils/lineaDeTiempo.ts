/**
 * Las cuentas de la línea de tiempo de la ficha (rediseño UX 2026-10, etapa
 * 3), sin React: de qué cara es cada fila del historial y desde qué día queda
 * disponible la cara entera. `probar-armazon` las corre sin navegador.
 */
import type { ContratoDelHistorial } from "../api/spaces";

/** `YYYY-MM-DD` como fecha local (medianoche de ese día, no la de Greenwich). */
export function aFecha(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** ¿Esa fila es de esta cara (o de una de sus partes) y no de la otra? */
export function esDeLaCara(espacio: string, codigo: string): boolean {
  const e = espacio.toUpperCase();
  const c = codigo.toUpperCase();
  if (e === c) return true;
  if (!e.startsWith(c + "-")) return false;
  // `CENTRO-GON-01-B` y sus partes son de la cara B, no de la A.
  return !(e === c + "-B" || e.startsWith(c + "-B-"));
}

/** Desde qué día queda disponible la cara ENTERA: el primer día, desde hoy,
 *  que ningún contrato vivo o futuro de la cara cubre. */
export function libreDesde(filas: readonly Pick<ContratoDelHistorial, "espacio" | "estado" | "desde" | "hasta">[], codigo: string, hoy: Date): Date {
  const vivos = filas
    .filter((f) => f.espacio.toUpperCase() === codigo.toUpperCase())
    .filter((f) => (f.estado === "vigente" || f.estado === "proximo") && f.desde && f.hasta)
    .map((f) => ({ desde: aFecha(f.desde!), hasta: aFecha(f.hasta!) }));
  let cursor = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  for (let vueltas = 0; vueltas < 100; vueltas++) {
    const cubre = vivos.find((v) => v.desde <= cursor && cursor <= v.hasta);
    if (!cubre) return cursor;
    cursor = new Date(cubre.hasta.getFullYear(), cubre.hasta.getMonth(), cubre.hasta.getDate() + 1);
  }
  return cursor;
}

