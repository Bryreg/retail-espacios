import type { UnifiedFixture } from "../types/fixtures";

/**
 * Cuáles de estos contratos caen sobre un espacio que NINGÚN plano dibuja.
 *
 * Es el fantasma con su nombre puesto. El contrato existe —está en la base, es
 * plata y es un compromiso con un proveedor— pero no hay mueble que lo muestre,
 * así que la pantalla va a decir «libre» y el servidor va a rechazar la venta
 * nombrando un contrato que la ficha jura que no existe. Se reportó así: «no me
 * deja alquilar la IMP-17 que está libre».
 *
 * ── Por qué sigue existiendo esta comprobación ───────────────────────────────
 *
 * El desfase de antes —el plano pintaba una cosa y la base otra— se terminó:
 * lo comercial vive sólo en la base y el navegador lo fusiona al dibujar. Queda
 * el otro desfase, el que ninguna fusión arregla: un contrato para un espacio
 * que el plano no tiene. Ahí no hay nada que pintar, y por eso hay que decirlo.
 *
 * ── La regla que no se puede romper ──────────────────────────────────────────
 *
 * Un mueble es único por SEDE + CÓDIGO, nunca por el código solo. Casi todas
 * las tiendas tienen un IMP-17; buscar sólo por código diría «sí, existe»
 * señalando el mueble de otra tienda, y el contrato real quedaría invisible.
 *
 * Se mira contra TODOS los planos cargados, no contra el que esté en pantalla:
 * una planilla con columna «sede» crea contratos en varias tiendas de una vez,
 * y el store baja todas las sedes en cada sincronización.
 */

export interface FilaContrato {
  /** La sede del contrato, no la que esté abierta. */
  sede: string;
  /** El código corto del mueble: `IMP-17`, sin la sede y sin el `-B`. */
  code: string;
  face: "A" | "B";
}

/** La misma regla que `normalizeSede` del store. Se pasa como parámetro para no
 *  arrastrar el store entero a una función pura, y así hay UNA definición. */
const NORMALIZAR = (s: string) => s.trim().toUpperCase();

/**
 * Los espacios sin mueble, como `NAVE · IMP-17`, sin repetidos y ordenados.
 * Vacío cuando todo lo cargado tiene dónde verse.
 */
export function espaciosSinMueble(
  fixturesBySede: Record<string, UnifiedFixture[]>,
  filas: FilaContrato[],
  normalizar: (s: string) => string = NORMALIZAR,
): string[] {
  if (filas.length === 0) return [];

  // Un índice por sede normalizada: la clave del store conserva la grafía con
  // la que se cargó («Nave»), así que comparar por igualdad se perdería la mitad.
  const codigosPorSede = new Map<string, Set<string>>();
  for (const [clave, fixtures] of Object.entries(fixturesBySede)) {
    if (!Array.isArray(fixtures)) continue;
    const sede = normalizar(clave);
    const codigos = codigosPorSede.get(sede) ?? new Set<string>();
    for (const f of fixtures) {
      const code = (f.code || "").trim().toUpperCase();
      if (!code) continue;
      // El mueble puede traer su propia sede: un plano copiado de otra tienda
      // dibuja muebles que no son de la sede abierta.
      const propia = f.sede ? normalizar(f.sede) : sede;
      if (propia === sede) codigos.add(code);
      else {
        const otros = codigosPorSede.get(propia) ?? new Set<string>();
        otros.add(code);
        codigosPorSede.set(propia, otros);
      }
    }
    codigosPorSede.set(sede, codigos);
  }

  const faltan = new Set<string>();
  for (const fila of filas) {
    const sede = normalizar(fila.sede ?? "");
    const code = (fila.code ?? "").trim().toUpperCase();
    if (!sede || !code) continue;
    // La cara B no es un mueble aparte: se dibuja en el mismo. Alcanza con que
    // el mueble esté.
    if (!codigosPorSede.get(sede)?.has(code)) {
      faltan.add(`${sede} · ${code}${fila.face === "B" ? "-B" : ""}`);
    }
  }
  return [...faltan].sort();
}
