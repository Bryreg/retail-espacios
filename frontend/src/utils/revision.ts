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
import {
  duplicados, prefijoDesalineado, nombreDeMueble, nombrePropio,
  nombresRepetidos, nombresQuePisanCodigo, muebleConCodigo,
} from "./nomenclatura";
import { fullSpaceCode } from "../types/fixtures";
import { detectarCorridas, type Corrida } from "./pasillos";

export interface MuebleRevisable {
  id: string;
  code: string;
  type: string;
  cx: number; cz: number;
  w: number; d: number; h?: number;
  rotY?: number;
  /** El nombre puesto a mano, que REEMPLAZA al código en todo lo que se dibuja.
   *  Faltaba: sin él la revisión miraba códigos contra códigos y declaraba
   *  limpio un plano donde cuatro muebles se dibujaban con el nombre de otro. */
  nomenclatura?: string | null;
}

export type Clase =
  | "codigo-repetido"
  | "nombre-repetido"
  | "nombre-pisa-codigo"
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

  // Los nombres, que es lo que se LEE. Un plano puede no tener un solo código
  // repetido y aun así tener cuatro cajas rotuladas igual: el rótulo sale de la
  // nomenclatura y la revisión miraba el código.
  for (const n of nombresRepetidos(fixtures)) {
    hallazgos.push({
      clase: "nombre-repetido", severidad: "error", ids: n.ids,
      texto: `${n.nombre} se dibuja en ${n.ids.length} muebles — en el plano no se distinguen, y quien lo escriba en una planilla no elige cuál`,
    });
  }

  // El caso del diagnóstico: el nombre de un mueble es el CÓDIGO de otro. En el
  // plano puede no verse ninguna repetición, y sin embargo escribir ese texto en
  // la planilla firma sobre el otro mueble, porque la planilla resuelve por código.
  for (const n of nombresQuePisanCodigo(fixtures)) {
    hallazgos.push({
      clase: "nombre-pisa-codigo", severidad: "error", ids: [n.id, n.otroId],
      texto: `${n.code} se dibuja «${n.nombre}», que es el código de otro mueble (${n.otroCode}) — un contrato cargado como «${n.nombre}» se firma sobre ${n.otroCode}`,
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


// ─── La reconciliación de lo que ya está cargado ─────────────────────────────

/**
 * Un contrato del plano, visto desde la revisión.
 *
 * Los campos comerciales viven denormalizados en el propio mueble del layout
 * (es de ahí que el mapa se pinta), así que esto se arma en el navegador con lo
 * que la pantalla ya tiene: no hace falta ningún endpoint nuevo.
 */
export interface ContratoDelPlano {
  /** Id del mueble, para poder saltar a él. */
  id: string;
  code: string;
  sede?: string;
  nomenclatura?: string | null;
  /** La góndola doble tiene dos caras y cada una es un espacio. */
  cara?: "A" | "B";
  proveedor: string;
  marca?: string;
  desde?: string | null;
  hasta?: string | null;
  valor?: number;
}

export interface ContratoARevisar extends ContratoDelPlano {
  /** El nombre con el que el plano dibuja ese mueble. */
  nombre: string;
  /** El código real del espacio, el que viaja al contrato y a los correos. */
  codigo: string;
  /** Si ese nombre además es el código de otro mueble, cuál. Son los peores:
   *  hay otro mueble al que ese texto apunta de verdad. */
  pisaCodigoDe: string | null;
}

/**
 * Los contratos vigentes cuyo mueble se dibuja con un nombre distinto de su
 * código: los sospechosos de haber caído en el espacio equivocado.
 *
 * Ninguna validación arregla lo ya cargado. Esto no lo arregla tampoco: lo
 * LISTA, con el proveedor, las fechas, el código real y el nombre dibujado,
 * para poder revisarlos uno por uno. Es la consulta 2 del diagnóstico de la
 * fase 12, hecha con los datos que la pantalla ya tiene.
 *
 * Vigente = todavía no venció (`hasta >= hoy`), igual que la consulta. Un
 * contrato que arranca el mes que viene también cuenta: es el que todavía se
 * puede corregir sin que nadie haya montado nada.
 */
function fechaLocalISO(d: Date): string {
  const dosDigitos = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${dosDigitos(d.getMonth() + 1)}-${dosDigitos(d.getDate())}`;
}

export function contratosConNombreAjeno(
  contratos: ContratoDelPlano[],
  muebles: { id: string; code: string; nomenclatura?: string | null }[],
  // En hora LOCAL: `toISOString()` pasa a UTC y en Colombia (UTC−5) eso corre la
  // fecha un día en toda la tarde, que en el borde saca de la lista un contrato
  // que todavía corre.
  hoy: string = fechaLocalISO(new Date()),
): ContratoARevisar[] {
  const out: ContratoARevisar[] = [];
  for (const c of contratos) {
    if (!(c.proveedor ?? "").trim()) continue;
    if (!nombrePropio(c)) continue;                       // se dibuja con su código: nada que revisar
    if (c.hasta && c.hasta < hoy) continue;               // ya venció
    const nombre = nombreDeMueble(c);
    const base = fullSpaceCode(c.sede, c.code);
    const otro = muebleConCodigo(nombre, muebles, c.id);
    out.push({
      ...c,
      nombre,
      codigo: c.cara === "B" ? `${base}-B` : base,
      pisaCodigoDe: otro ? otro.code : null,
    });
  }
  return out.sort((a, b) => {
    if (!!a.pisaCodigoDe !== !!b.pisaCodigoDe) return a.pisaCodigoDe ? -1 : 1;
    return a.codigo.localeCompare(b.codigo);
  });
}
