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

import { huella, limitesDePlanta, chocaEn, puntoLibreCerca, normalDeCara, RADIO_PERSONA, TOLERANCIA_CONTACTO, type Caja } from "./planta";
import { duplicados, prefijoDesalineado, normalizar, muebleConCodigo } from "./nomenclatura";
import { fullSpaceCode } from "../types/fixtures";
import { carasDe } from "../types/espacio";
import { detectarCorridas, type Corrida } from "./pasillos";

export interface MuebleRevisable {
  id: string;
  code: string;
  type: string;
  cx: number; cz: number;
  w: number; d: number; h?: number;
  rotY?: number;
  /** Para saber si tiene cara B (`carasDe`): una góndola sin el campo es
   *  doble. El plano 2D no lo necesita: sus tipos ya dicen doble o mural. */
  gondolaType?: string | null;
}

export type Clase =
  | "codigo-repetido"
  | "prefijo"
  | "encimado"
  | "pasillo-angosto"
  | "zona-aislada"
  | "cara-inaccesible";

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

/**
 * Las caras de un mueble doble que no tienen dónde pararse delante (D17): una
 * góndola doble arrimada a otra, o a 30 cm, vende una cara B que nadie puede
 * mirar. Desde el centro de cada cara se mira derecho hacia afuera (la normal
 * de la cara, `normalDeCara`: la A mira a −z local) y se mide hasta la primera
 * huella de otro mueble con cuerpo (lo que se pisa, como la zona libre de
 * 5 cm, no tapa nada) o hasta el borde del plano. Con menos de un hombro de
 * persona (`HOMBRO`, 0,56 m), avisa.
 *
 * `libre` se mide desde el plano de la cara; `vecino` es el código del mueble
 * que la tapa (`null`: el borde del plano). Las paredes que no están dibujadas
 * como mueble no cuentan. Sólo avisa: nunca cambia el tipo ni un contrato.
 */
export function carasInaccesibles(fixtures: MuebleRevisable[]):
  { fixtureId: string; cara: "A" | "B"; libre: number; vecino: string | null; vecinoId: string | null }[] {
  const fuera: { fixtureId: string; cara: "A" | "B"; libre: number; vecino: string | null; vecinoId: string | null }[] = [];
  if (fixtures.length === 0) return fuera;
  const enPlanta = fixtures.map((f) => ({ x: f.cx, z: f.cz, w: f.w, d: f.d, rotY: f.rotY }));
  const lim = limitesDePlanta(enPlanta);
  const conCajas = fixtures.map((f) => ({ f, caja: caja(f) }));
  for (const f of fixtures) {
    if (carasDe(f) !== 2) continue;
    for (const cara of ["A", "B"] as const) {
      const n = normalDeCara(f.rotY ?? 0, cara);
      const o = { x: f.cx + n.x * f.d / 2, z: f.cz + n.z * f.d / 2 };
      let libre = hastaElBorde(o, n, lim);
      let vecino: MuebleRevisable | null = null;
      for (const { f: g, caja: c } of conCajas) {
        if (g === f || !conCuerpo(g)) continue;
        const t = hastaLaCaja(o, n, c);
        if (t !== null && t < libre) { libre = t; vecino = g; }
      }
      if (libre < HOMBRO) fuera.push({ fixtureId: f.id, cara, libre, vecino: vecino ? vecino.code : null, vecinoId: vecino ? vecino.id : null });
    }
  }
  return fuera;
}

/** Cuánto se avanza desde `o` en la dirección `n` hasta salir del plano. */
function hastaElBorde(o: { x: number; z: number }, n: { x: number; z: number }, lim: Caja): number {
  let t = Infinity;
  if (n.x > 1e-12) t = Math.min(t, (lim.maxX - o.x) / n.x);
  else if (n.x < -1e-12) t = Math.min(t, (lim.minX - o.x) / n.x);
  if (n.z > 1e-12) t = Math.min(t, (lim.maxZ - o.z) / n.z);
  else if (n.z < -1e-12) t = Math.min(t, (lim.minZ - o.z) / n.z);
  return Math.max(0, t);
}

/** Dónde entra el rayo `o + t·n` (t ≥ 0) en la caja, o null si no la toca.
 *  Una caja que ya contiene el centro de la cara la tapa desde el vamos: es
 *  la góndola pegada de espaldas que se mete un centímetro (dentro de la
 *  tolerancia de contacto, que no es «encimado»). Las huellas no se inflan
 *  con el cuerpo de la persona, así que un mueble arrimado al costado nunca
 *  contiene ese centro. */
function hastaLaCaja(o: { x: number; z: number }, n: { x: number; z: number }, c: Caja): number | null {
  if (o.x > c.minX && o.x < c.maxX && o.z > c.minZ && o.z < c.maxZ) return 0;
  let t0 = 0, t1 = Infinity;
  for (const [p, d, lo, hi] of [[o.x, n.x, c.minX, c.maxX], [o.z, n.z, c.minZ, c.maxZ]] as const) {
    if (Math.abs(d) < 1e-12) {
      if (p <= lo || p >= hi) return null;   // corre paralelo, por fuera (rozar el canto no tapa)
      continue;
    }
    let a = (lo - p) / d, b = (hi - p) / d;
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, b);
    if (t0 >= t1) return null;
  }
  return t0;
}

const m2 = (v: number) => v.toFixed(2).replace(".", ",");
const m = (v: number) => v.toFixed(2).replace(".", ",");

/** «Una cara de GON-01 queda a 0,30 m de GON-02: nadie se para a mirarla. Si
 *  va contra la pared o contra otra, hacela mural.» Lo usa también el panel
 *  del Editor 3D para el mueble elegido. */
export function textoDeCaraInaccesible(codigo: string, libre: number, vecino: string | null): string {
  const donde = vecino ? `de ${vecino}` : "del borde del plano";
  return `Una cara de ${codigo} queda a ${m(libre)} m ${donde}: nadie se para a mirarla. `
    + "Si va contra la pared o contra otra, hacela mural.";
}

/** La revisión completa, ordenada: primero lo que rompe, después lo que avisa. */
export function revisarPlano(fixtures: MuebleRevisable[]): Hallazgo[] {
  const hallazgos: Hallazgo[] = [];
  if (fixtures.length === 0) return hallazgos;

  // Un solo hallazgo de nombres, porque hay un solo nombre. Antes eran tres —el
  // código repetido, el nombre dibujado repetido y el nombre que pisaba el
  // código de otro— y las tres decían variantes de lo mismo desde los dos campos
  // que un mueble tenía. Con el nombre y la llave siendo la misma cosa, «dos
  // muebles se llaman igual» las cubre a las tres.
  //
  // Se avisa, nunca se traba: la regla nueva impide CREAR un nombre repetido,
  // pero un plano que ya está así se tiene que poder abrir, mirar y guardar.
  for (const d of duplicados(fixtures)) {
    hallazgos.push({
      clase: "codigo-repetido", severidad: "error", ids: d.ids,
      texto: `${d.codigo} lo llevan ${d.ids.length} muebles — en el plano no se distinguen, comparten contratos, archivos y correos, y quien lo escriba en una planilla no elige cuál`,
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

  // Una cara doble sin lugar delante para pararse (D17). Nombra al vecino:
  // «cara B» no es el mismo lado en el 2D, el tablero y el 3D.
  const porId = new Map(fixtures.map((f) => [f.id, f]));
  for (const c of carasInaccesibles(fixtures)) {
    const f = porId.get(c.fixtureId)!;
    hallazgos.push({
      clase: "cara-inaccesible", severidad: "aviso", ids: c.vecinoId ? [f.id, c.vecinoId] : [f.id],
      texto: textoDeCaraInaccesible(f.code, c.libre, c.vecino),
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
  /** Id del mueble, para poder saltar a él. El id es la identidad real: sobrevive
   *  a cualquier renumeración, que es justo lo que el nombre no hace. */
  id: string;
  /** Cómo se llama el mueble HOY. */
  code: string;
  sede?: string;
  /** Cómo se llamaba cuando se negoció esto: el nombre viejo del mueble, el que
   *  todavía está escrito en la cartelería de la tienda y en el papel que firmó
   *  el proveedor. Lo resuelve `nombreAnterior` (en `utils/nomenclatura.ts`) y
   *  tiene dos orígenes según el plano se haya renumerado o no: el registro de
   *  renumeraciones del servidor, que sabe cómo se LEÍA cada mueble antes, o la
   *  `nomenclatura` del layout, que dejó de ser un segundo nombre y queda como
   *  este recuerdo hasta que se renumere. Vacío = nunca se llamó distinto. */
  nombreAnterior?: string | null;
  /** La góndola doble tiene dos caras y cada una es un espacio. */
  cara?: "A" | "B";
  proveedor: string;
  marca?: string;
  desde?: string | null;
  hasta?: string | null;
  valor?: number;
}

export interface ContratoARevisar extends ContratoDelPlano {
  /** Cómo se llama HOY el mueble sobre el que está el contrato. */
  nombre: string;
  /** El código completo del espacio, el que viaja al contrato y a los correos. */
  codigo: string;
  /** Con qué nombre se negoció: el que la persona vio y el que dice el papel. */
  seNegocioComo: string;
  /** Si ese nombre viejo hoy lo lleva OTRO mueble, cuál. Son los peores: quien
   *  lea el papel y camine hasta el cartel va a pararse frente al mueble
   *  equivocado, y ahí no hay nada que le diga que se equivocó. */
  loTieneAhora: string | null;
}

/**
 * Los contratos vigentes cuyo mueble **ya no se llama como el contrato dice**.
 *
 * Ninguna validación arregla lo ya cargado, y renumerar tampoco: al contrario,
 * lo mueve. Esto lo LISTA —proveedor, fechas, nombre de hoy y nombre con el que
 * se negoció— para poder reconciliarlo uno por uno contra la cartelería de la
 * tienda. Es la consulta 2 del diagnóstico de la fase 12, ahora con el sentido
 * que le deja tener un solo nombre.
 *
 * Sale de lo que la pantalla ya tiene: los campos comerciales viven
 * denormalizados en el propio mueble del layout, así que no hace falta pedir los
 * contratos aparte. Lo único que necesita de afuera es `nombreAnterior` —cómo se
 * llamaba el mueble—, y esa es la pieza que la renumeración se llevaba puesta:
 * al renumerar, el servidor borra la `nomenclatura` y el navegador se quedaba
 * sin nada, así que la lista se apagaba **justo después de renumerar**, que es
 * cuando la cartelería de la tienda y el plano dicen cosas distintas y esto es
 * lo único que las reconcilia. Hoy el recuerdo lo lleva el servidor en su
 * registro de renumeraciones y lo devuelve con cada mueble del plano
 * (`nombreAnterior`, en `utils/nomenclatura.ts`); quien arme estos contratos se
 * lo pasa ya resuelto.
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
  muebles: { id: string; code: string }[],
  // En hora LOCAL: `toISOString()` pasa a UTC y en Colombia (UTC−5) eso corre la
  // fecha un día en toda la tarde, que en el borde saca de la lista un contrato
  // que todavía corre.
  hoy: string = fechaLocalISO(new Date()),
): ContratoARevisar[] {
  const out: ContratoARevisar[] = [];
  for (const c of contratos) {
    if (!(c.proveedor ?? "").trim()) continue;
    const antes = normalizar(c.nombreAnterior ?? "");
    if (!antes) continue;                                 // nunca se llamó distinto
    const nombre = normalizar(c.code);
    if (antes === nombre) continue;                       // se sigue llamando igual
    if (c.hasta && c.hasta < hoy) continue;               // ya venció
    const base = fullSpaceCode(c.sede, c.code);
    // Lo peor que puede pasar con un nombre viejo: que hoy lo lleve otro mueble.
    const otro = muebleConCodigo(antes, muebles, c.id);
    out.push({
      ...c,
      nombre,
      seNegocioComo: antes,
      codigo: c.cara === "B" ? `${base}-B` : base,
      loTieneAhora: otro ? otro.code : null,
    });
  }
  return out.sort((a, b) => {
    if (!!a.loTieneAhora !== !!b.loTieneAhora) return a.loTieneAhora ? -1 : 1;
    return a.codigo.localeCompare(b.codigo);
  });
}
