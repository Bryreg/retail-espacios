/**
 * Qué está mal en el plano, antes de que se use para negociar.
 *
 * El plano es el origen de todo: de acá salen los espacios que se venden, el
 * metraje que se cobra, el recorrido que se le muestra al proveedor y el mapa
 * con el que el mercaderista encuentra la exhibición. Un error acá no se nota
 * hasta que ya viajó a un contrato.
 *
 * Cada hallazgo trae los ids para poder saltar al mueble.
 */

import { huella, limitesDePlanta, chocaEn, puntoLibreCerca, RADIO_PERSONA, TOLERANCIA_CONTACTO } from "./planta";
import { duplicados, prefijoDesalineado } from "./nomenclatura";
import { detectarCorridas, type Corrida } from "./pasillos";

export interface MuebleRevisable {
  id: string;
  code: string;
  type: string;
  cx: number; cz: number;
  w: number; d: number; h?: number;
  rotY?: number;
}

export type Clase =
  | "codigo-repetido"
  | "prefijo"
  | "encimado"
  | "pasillo-angosto"
  | "zona-aislada";

export interface Hallazgo {
  clase: Clase;
  /** `error` rompe algo aguas abajo; `aviso` es una decisión que puede ser deliberada. */
  severidad: "error" | "aviso";
  texto: string;
  ids: string[];
}

/** Hombro de una persona caminando: es lo que usa la cámara en primera persona. */
export const HOMBRO = RADIO_PERSONA * 2;   // 0,56 m
/** Debajo de esto un pasillo es intransitable para un cliente con carrito. */
export const PASILLO_MINIMO = 0.90;        // m

/** El modelo unificado usa cx/cz; la geometría de planta.ts usa x/z. */
function caja(f: MuebleRevisable) {
  return huella({ x: f.cx, z: f.cz, w: f.w, d: f.d, rotY: f.rotY });
}

/** Muebles que estorban el paso. Lo bajo se pisa (Zona Libre mide 5 cm). */
function conCuerpo(f: MuebleRevisable): boolean {
  return (f.h ?? 9) > 0.25;
}

/** Pares de muebles cuyas huellas se montan. Devuelve el área en m². */
export function encimados(
  fixtures: MuebleRevisable[],
  tolerancia = TOLERANCIA_CONTACTO,
): { a: MuebleRevisable; b: MuebleRevisable; m2: number }[] {
  const cajas = fixtures.map((f) => ({ f, b: caja(f) }));
  const pares: { a: MuebleRevisable; b: MuebleRevisable; m2: number }[] = [];
  for (let i = 0; i < cajas.length; i++) {
    for (let j = i + 1; j < cajas.length; j++) {
      const A = cajas[i].b, B = cajas[j].b;
      const ix = Math.min(A.maxX, B.maxX) - Math.max(A.minX, B.minX);
      const iz = Math.min(A.maxZ, B.maxZ) - Math.max(A.minZ, B.minZ);
      if (ix > tolerancia && iz > tolerancia) {
        pares.push({ a: cajas[i].f, b: cajas[j].f, m2: ix * iz });
      }
    }
  }
  return pares.sort((x, y) => y.m2 - x.m2);
}

/** El hueco libre entre dos corridas consecutivas. */
export function huecosEntreCorridas(
  fixtures: MuebleRevisable[],
  corridas: Corrida[],
): { entre: [number, number]; hueco: number }[] {
  const porId = new Map(fixtures.map((f) => [f.id, f]));
  const borde = (c: Corrida) => {
    const cajas = c.ids.map((id) => porId.get(id)).filter(Boolean).map((f) => caja(f as MuebleRevisable));
    if (!cajas.length) return null;
    return c.eje === "z"
      ? { min: Math.min(...cajas.map((b) => b.minX)), max: Math.max(...cajas.map((b) => b.maxX)) }
      : { min: Math.min(...cajas.map((b) => b.minZ)), max: Math.max(...cajas.map((b) => b.maxZ)) };
  };
  const out: { entre: [number, number]; hueco: number }[] = [];
  for (let i = 0; i + 1 < corridas.length; i++) {
    const a = borde(corridas[i]), b = borde(corridas[i + 1]);
    if (!a || !b) continue;
    out.push({ entre: [corridas[i].numero, corridas[i + 1].numero], hueco: b.min - a.max });
  }
  return out;
}

/**
 * Cuánto del piso libre NO se alcanza caminando desde la entrada.
 *
 * Es la prueba que importa para la caminata en primera persona y para el
 * recorrido que se le muestra al proveedor: un rincón encerrado entre muebles
 * se ve en el plano pero no se puede visitar.
 */
export function zonasAisladas(
  fixtures: MuebleRevisable[],
  hombro = HOMBRO,
  paso = 0.25,
): { celdas: number; total: number; punto: { x: number; z: number } | null } {
  const cuerpos = fixtures.filter(conCuerpo);
  if (!cuerpos.length) return { celdas: 0, total: 0, punto: null };
  const enPlanta = cuerpos.map((f) => ({ x: f.cx, z: f.cz, w: f.w, d: f.d, rotY: f.rotY }));
  const lim = limitesDePlanta(enPlanta);
  const radio = hombro / 2;
  const muros = cuerpos.map((f) => {
    const b = caja(f);
    return { minX: b.minX - radio, maxX: b.maxX + radio, minZ: b.minZ - radio, maxZ: b.maxZ + radio };
  });

  const nx = Math.ceil((lim.maxX - lim.minX) / paso);
  const nz = Math.ceil((lim.maxZ - lim.minZ) / paso);
  const libre = (i: number, j: number) =>
    !chocaEn(muros, lim.minX + (i + 0.5) * paso, lim.minZ + (j + 0.5) * paso);

  let total = 0;
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) if (libre(i, j)) total++;

  const e = puntoLibreCerca(lim, muros, lim.cx, lim.cz);
  const visto = new Set<string>();
  const i0 = Math.floor((e.x - lim.minX) / paso), j0 = Math.floor((e.z - lim.minZ) / paso);
  const cola: [number, number][] = [[i0, j0]];
  visto.add(`${i0},${j0}`);
  while (cola.length) {
    const [i, j] = cola.pop()!;
    for (const [di, dj] of [[1,0],[-1,0],[0,1],[0,-1]] as const) {
      const a = i + di, b = j + dj, k = `${a},${b}`;
      if (a < 0 || b < 0 || a >= nx || b >= nz || visto.has(k) || !libre(a, b)) continue;
      visto.add(k); cola.push([a, b]);
    }
  }

  const aisladas = total - visto.size;
  let punto: { x: number; z: number } | null = null;
  if (aisladas > 0) {
    for (let i = 0; i < nx && !punto; i++)
      for (let j = 0; j < nz && !punto; j++)
        if (libre(i, j) && !visto.has(`${i},${j}`))
          punto = { x: lim.minX + (i + 0.5) * paso, z: lim.minZ + (j + 0.5) * paso };
  }
  return { celdas: aisladas, total, punto };
}

const m2 = (v: number) => v.toFixed(2).replace(".", ",");
const m = (v: number) => v.toFixed(2).replace(".", ",");

/** La revisión completa, ordenada: primero lo que rompe, después lo que avisa. */
export function revisarPlano(fixtures: MuebleRevisable[]): Hallazgo[] {
  const hallazgos: Hallazgo[] = [];
  if (fixtures.length === 0) return hallazgos;

  for (const d of duplicados(fixtures)) {
    hallazgos.push({
      clase: "codigo-repetido", severidad: "error", ids: d.ids,
      texto: `${d.codigo} lo usan ${d.ids.length} muebles — comparten contratos, archivos y correos`,
    });
  }

  for (const p of prefijoDesalineado(fixtures)) {
    hallazgos.push({
      clase: "prefijo", severidad: "aviso", ids: [p.id],
      texto: `${p.code} no arranca con ${p.esperado}-, que es lo que corresponde a su tipo`,
    });
  }

  for (const e of encimados(fixtures.filter(conCuerpo))) {
    hallazgos.push({
      clase: "encimado", severidad: e.m2 >= 0.05 ? "error" : "aviso", ids: [e.a.id, e.b.id],
      texto: `${e.a.code} y ${e.b.code} se montan ${m2(e.m2)} m²`,
    });
  }

  const corridas = detectarCorridas(fixtures);
  for (const h of huecosEntreCorridas(fixtures, corridas)) {
    if (h.hueco >= PASILLO_MINIMO) continue;
    const ids = corridas
      .filter((c) => h.entre.includes(c.numero))
      .flatMap((c) => c.ids);
    hallazgos.push({
      clase: "pasillo-angosto",
      severidad: h.hueco < HOMBRO ? "error" : "aviso",
      ids,
      texto: h.hueco < 0
        ? `Los pasillos ${h.entre[0]} y ${h.entre[1]} se tocan`
        : `Entre los pasillos ${h.entre[0]} y ${h.entre[1]} quedan ${m(h.hueco)} m` +
          (h.hueco < HOMBRO ? " — no pasa una persona" : " — no pasa un carrito"),
    });
  }

  const aisladas = zonasAisladas(fixtures);
  if (aisladas.celdas > 0) {
    const pct = Math.round((100 * aisladas.celdas) / Math.max(1, aisladas.total));
    hallazgos.push({
      clase: "zona-aislada", severidad: "aviso", ids: [],
      texto: `Queda ${pct}% del piso encerrado entre muebles: se ve en el plano pero no se puede caminar`,
    });
  }

  return hallazgos.sort((a, b) =>
    a.severidad === b.severidad ? 0 : a.severidad === "error" ? -1 : 1,
  );
}
