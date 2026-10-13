/**
 * En qué pasillo está cada mueble.
 *
 * Un supermercado no se recorre por códigos sueltos: se recorre por pasillos.
 * Quien negocia dice «la punta del pasillo 3», no «PUN-07». El plano ya tiene
 * esa estructura —en NAVE las 56 góndolas principales forman 10 corridas
 * limpias, y quien lo dibujó las numeró en orden— pero el editor no la conocía,
 * así que no se podía filtrar, ni nombrar, ni revisar por pasillo.
 *
 * Acá se deduce de la geometría, que es la única fuente que no miente: si dos
 * góndolas comparten la coordenada perpendicular, están en la misma corrida.
 *
 * Geometría pura: se prueba sin navegador.
 */

import { huella } from "./planta";
import { tiposConBandera } from "../catalogo/catalogo";

export interface MuebleParaPasillo {
  id: string;
  cx: number;
  cz: number;
  w: number;
  d: number;
  rotY?: number;
  type: string;
}

export interface Corrida {
  /** 1, 2, 3… de izquierda a derecha (corridas verticales) o de arriba a abajo. */
  numero: number;
  /**
   * Eje a lo LARGO del cual se extiende la corrida.
   * "z" = corrida vertical en el plano, muebles girados 90°.
   */
  eje: "x" | "z";
  /** Coordenada perpendicular: la que comparten todos sus muebles. */
  posicion: number;
  /** Extremos de la corrida sobre su eje largo. */
  desde: number;
  hasta: number;
  ids: string[];
}

/** Los tipos que forman corrida. El resto se cuelga de la corrida más cercana.
 *  Es la bandera `formaCorrida` del catálogo de muebles: la góndola y sus dos
 *  nombres del plano 2D. Se exporta para que las guardas la lean. */
export const FORMAN_CORRIDA = new Set<string>(tiposConBandera("formaCorrida"));

/** Un mueble a menos de esto de una corrida se considera parte de ella. */
export const ALCANCE_CORRIDA = 3.0; // m

/** ¿Está girado de modo que se extiende sobre Z? (90° o 270°) */
function correSobreZ(rotY: number): boolean {
  const r = ((rotY % Math.PI) + Math.PI) % Math.PI;
  return Math.abs(r - Math.PI / 2) < 0.15;
}

/**
 * Agrupa en corridas y las numera.
 *
 * Se agrupa por la coordenada PERPENDICULAR: dos góndolas de la misma corrida
 * comparten x (si la corrida es vertical) aunque estén a diez metros una de
 * otra sobre el eje largo.
 *
 * Se numera sólo la orientación mayoritaria. Mezclar corridas verticales y
 * horizontales en una sola cuenta da números que no siguen ningún recorrido:
 * lo perpendicular al grueso de la tienda es la pared del fondo, no un pasillo.
 */
export function detectarCorridas(
  fixtures: MuebleParaPasillo[],
  tolerancia = 0.6,
): Corrida[] {
  const base = fixtures.filter((f) => FORMAN_CORRIDA.has(f.type));
  if (base.length === 0) return [];

  const verticales = base.filter((f) => correSobreZ(f.rotY ?? 0));
  const horizontales = base.filter((f) => !correSobreZ(f.rotY ?? 0));
  const mayoria = verticales.length >= horizontales.length ? verticales : horizontales;
  const eje: "x" | "z" = mayoria === verticales ? "z" : "x";
  // Perpendicular al eje largo.
  const perp = (f: MuebleParaPasillo) => (eje === "z" ? f.cx : f.cz);

  const grupos: MuebleParaPasillo[][] = [];
  for (const f of [...mayoria].sort((a, b) => perp(a) - perp(b))) {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && Math.abs(perp(f) - perp(ultimo[ultimo.length - 1])) <= tolerancia) {
      ultimo.push(f);
    } else {
      grupos.push([f]);
    }
  }

  return grupos.map((g, i) => {
    const extremos = g.map((f) => {
      const b = huella({ x: f.cx, z: f.cz, w: f.w, d: f.d, rotY: f.rotY });
      return eje === "z" ? [b.minZ, b.maxZ] : [b.minX, b.maxX];
    });
    return {
      numero: i + 1,
      eje,
      posicion: g.reduce((s, f) => s + perp(f), 0) / g.length,
      desde: Math.min(...extremos.map((e) => e[0])),
      hasta: Math.max(...extremos.map((e) => e[1])),
      ids: g.map((f) => f.id),
    };
  });
}

/**
 * A qué pasillo pertenece cada mueble.
 *
 * Los que forman corrida ya la tienen. Al resto —puntas, ristras, exhibidores
 * de piso— se le asigna la corrida más cercana: una punta de góndola vive en la
 * cabecera de su pasillo, y decir «la punta del pasillo 3» es exactamente cómo
 * se la nombra en la reunión. Lo que queda a más de ALCANCE_CORRIDA no se
 * fuerza: la nevera de la pared del fondo no es de ningún pasillo.
 */
export function pasilloPorMueble(
  fixtures: MuebleParaPasillo[],
  corridas?: Corrida[],
): Map<string, number> {
  const runs = corridas ?? detectarCorridas(fixtures);
  const mapa = new Map<string, number>();
  if (runs.length === 0) return mapa;

  for (const c of runs) for (const id of c.ids) mapa.set(id, c.numero);

  for (const f of fixtures) {
    if (mapa.has(f.id)) continue;
    let mejor: { numero: number; dist: number } | null = null;
    for (const c of runs) {
      const perp = c.eje === "z" ? f.cx : f.cz;
      const alLargo = c.eje === "z" ? f.cz : f.cx;
      // Distancia al SEGMENTO de la corrida, no a su centro: una punta en la
      // cabecera está lejos del medio de la corrida y pegada a su extremo.
      const dLargo = Math.max(0, Math.max(c.desde - alLargo, alLargo - c.hasta));
      const dist = Math.hypot(perp - c.posicion, dLargo);
      if (!mejor || dist < mejor.dist) mejor = { numero: c.numero, dist };
    }
    if (mejor && mejor.dist <= ALCANCE_CORRIDA) mapa.set(f.id, mejor.numero);
  }
  return mapa;
}

/** Cómo se nombra un mueble en voz alta: «Pasillo 3 · GON-17». */
export function nombreConPasillo(codigo: string, pasillo: number | undefined): string {
  return pasillo ? `Pasillo ${pasillo} · ${codigo}` : codigo;
}
