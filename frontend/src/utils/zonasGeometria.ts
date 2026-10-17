/**
 * La geometría de las zonas de una cara vendida por participación.
 *
 * Gemela de `backend/app/services/zonas_geometria.py`: las dos corren los
 * MISMOS casos (`scripts/casos/zonas.json`, con `probar-zonas.mjs` de este
 * lado y `tests/test_participaciones_geometria.py` del otro) y tienen que dar
 * EXACTAMENTE el mismo número, bit a bit. El porcentaje dibujado que ve la
 * dueña en el lienzo es el que el servidor acepta o rechaza al confirmar: si
 * los dos lados sumaran distinto, una zona al filo del redondeo pasaría en la
 * pantalla y rebotaría en el servidor. Por eso, y hay que cuidarlo al tocar:
 *
 *   · **Bucles explícitos, mismo orden de suma.** Nada de `reduce` sobre
 *     flotantes (Python 3.12 cambió `sum()` a suma compensada); cada cuenta
 *     está escrita con las mismas operaciones en el mismo orden que en Python.
 *   · **Cuantización a 1e-6** de todo vértice (y de las exclusiones, en
 *     `superficie.ts`): `floor(x·1e6 + 0.5) / 1e6`, escrito igual en los dos.
 *   · **Enteros para la simplicidad y la orientación**: con u,v cuantizados,
 *     `round(x·1e6)` es un entero ≤ 10⁶ y los productos cruzados (≤ 2·10¹²)
 *     son exactos en float64 y en el `int` de Python.
 *   · **Ordenamientos estables con la misma clave** (los dos lenguajes ordenan
 *     estable), y el punto medio de una franja es `(x0 + x1) / 2`.
 *
 * El algoritmo (§6.2 del diseño de participaciones): franjas verticales entre
 * todas las x de vértices y de cruces entre polígonos distintos; dentro de una
 * franja ningún borde se cruza con otro, así que cada extremo de intervalo es
 * lineal en x y el largo en el punto medio por el ancho es la integral exacta,
 * también con el recorte contra las exclusiones.
 *
 * u = 0 es el borde izquierdo de quien mira la cara; v = 0, abajo (§8.1). Las
 * coordenadas van normalizadas a [0,1]²: el área que devuelve `areaCubierta`
 * es una fracción de la cara; en m² se multiplica por ancho · alto.
 */

export type Punto = [number, number];
/** Simple, sin repetir el vértice de cierre. */
export type Poligono = Punto[];
/** Lo que no se vende de una cara (zócalo, parante, copete…), un rectángulo
 *  en u,v. Lo arma `superficie.ts`, cuantizado a 1e-6. */
export interface Exclusion { por: string; u0: number; u1: number; v0: number; v1: number }

/** Los códigos con que `validarZona` rechaza una zona (§3.7). `ZONA_MALFORMADA`
 *  es el paso 1 (no es una lista de pares de números finitos): el servidor lo
 *  contesta con 422 y no lo guarda. */
export type CodigoDeZona =
  | "ZONA_MALFORMADA" | "ZONA_POCOS_VERTICES" | "ZONA_DEMASIADOS_VERTICES"
  | "ZONA_FUERA" | "ZONA_SE_CRUZA" | "ZONA_SIN_AREA";

/** Cuantización de u,v (zonas y exclusiones). */
export const CUANTO = 1e-6;
export const MIN_VERTICES = 3;
/** Por zona. */
export const MAX_VERTICES = 24;
export const MAX_ZONAS_POR_CARA = 60;
/** La suma de todas las zonas de la capa, enviada y guardada. Con 24/240 el
 *  peor caso (estrellas que se cruzan sobre zócalo y parante) tarda ≈ 0,1 s
 *  en CPython; con los topes de antes (40/600), 1,3 s. */
export const MAX_VERTICES_POR_CARA = 240;
/** 1 cm²: zona mínima, solape mínimo y «sin superficie útil». */
export const AREA_MINIMA_M2 = 1e-4;
/** Los pb de la cara entera (1 pb = 0,01 %). */
const CARA_ENTERA_PB = 10000;
const EPS = 1e-12;

/** `floor(x·1e6 + 0.5) / 1e6`, y nunca −0 (el `+ 0` lo lleva a +0 en los dos
 *  lenguajes; Python haría lo mismo con su `int`). */
export function cuantizarNumero(x: number): number {
  return Math.floor(x * 1e6 + 0.5) / 1e6 + 0;
}

/** El área con signo (shoelace), positiva si es antihoraria en u,v. */
export function areaFirmada(p: Poligono): number {
  let a = 0;
  const n = p.length;
  for (let i = 0; i < n; i++) {
    const x1 = p[i][0], y1 = p[i][1];
    const j = i + 1 === n ? 0 : i + 1;
    const x2 = p[j][0], y2 = p[j][1];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

/** §3.7 paso 3: cada número a 1e-6. */
export function cuantizar(p: Poligono): Poligono {
  const fuera: Poligono = [];
  for (const [u, v] of p) fuera.push([cuantizarNumero(u), cuantizarNumero(v)]);
  return fuera;
}

/** Sin vértices consecutivos repetidos ni el de cierre (que repite el primero). */
function sinRepetidos(p: Poligono): Poligono {
  const fuera: Poligono = [];
  for (const q of p) {
    const ult = fuera[fuera.length - 1];
    if (ult && ult[0] === q[0] && ult[1] === q[1]) continue;
    fuera.push(q);
  }
  while (fuera.length > 1 && fuera[0][0] === fuera[fuera.length - 1][0] && fuera[0][1] === fuera[fuera.length - 1][1]) {
    fuera.pop();
  }
  return fuera;
}

/** Los vértices en enteros de 1e-6 (ya cuantizados: el redondeo es exacto). */
function enteros(p: Poligono): Punto[] {
  const fuera: Punto[] = [];
  for (const [u, v] of p) fuera.push([Math.floor(u * 1e6 + 0.5), Math.floor(v * 1e6 + 0.5)]);
  return fuera;
}

/** El doble del área con signo, en enteros de 1e-6 (exacto: ≤ 24 términos de
 *  ≤ 10¹² cada uno). */
function dobleAreaEntera(k: Punto[]): number {
  let s = 0;
  const n = k.length;
  for (let i = 0; i < n; i++) {
    const j = i + 1 === n ? 0 : i + 1;
    s += k[i][0] * k[j][1] - k[j][0] * k[i][1];
  }
  return s;
}

/** Antihoraria conservando el primer vértice: `[v0, vn-1, …, v1]` si venía
 *  horaria. El signo, en enteros: los dos lados dan el mismo. */
function antihorario(p: Poligono): Poligono {
  if (p.length < 3 || dobleAreaEntera(enteros(p)) >= 0) return p;
  const fuera: Poligono = [p[0]];
  for (let i = p.length - 1; i >= 1; i--) fuera.push(p[i]);
  return fuera;
}

/** Cuantiza, quita repetidos (y el de cierre) y orienta antihorario
 *  conservando el primer vértice. */
export function limpiar(p: Poligono): Poligono {
  return antihorario(sinRepetidos(cuantizar(p)));
}

function orientacion(a: Punto, b: Punto, c: Punto): number {
  const o = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  return o > 0 ? 1 : o < 0 ? -1 : 0;
}

/** c (colineal con ab) cae en el segmento cerrado ab. */
function enSegmento(a: Punto, b: Punto, c: Punto): boolean {
  return Math.min(a[0], b[0]) <= c[0] && c[0] <= Math.max(a[0], b[0])
    && Math.min(a[1], b[1]) <= c[1] && c[1] <= Math.max(a[1], b[1]);
}

/** Los segmentos cerrados se tocan o se cruzan (incluye tocarse en un punto). */
function seTocan(p1: Punto, p2: Punto, p3: Punto, p4: Punto): boolean {
  const d1 = orientacion(p3, p4, p1), d2 = orientacion(p3, p4, p2);
  const d3 = orientacion(p1, p2, p3), d4 = orientacion(p1, p2, p4);
  if (d1 * d2 < 0 && d3 * d4 < 0) return true;
  if (d1 === 0 && enSegmento(p3, p4, p1)) return true;
  if (d2 === 0 && enSegmento(p3, p4, p2)) return true;
  if (d3 === 0 && enSegmento(p1, p2, p3)) return true;
  if (d4 === 0 && enSegmento(p1, p2, p4)) return true;
  return false;
}

/** Polígono simple ESTRICTO (§3.7 paso 6), en enteros: dos aristas no
 *  adyacentes no se tocan ni en un punto, y dos adyacentes colineales no
 *  vuelven sobre sí mismas. Un polígono con vértices consecutivos repetidos o
 *  con menos de tres no es simple. */
export function esSimple(p: Poligono): boolean {
  const n = p.length;
  if (n < 3) return false;
  const k = enteros(p);
  for (let i = 0; i < n; i++) {
    const j = i + 1 === n ? 0 : i + 1;
    if (k[i][0] === k[j][0] && k[i][1] === k[j][1]) return false;
  }
  for (let i = 0; i < n; i++) {
    const a = k[i], b = k[i + 1 === n ? 0 : i + 1];
    for (let j = i + 1; j < n; j++) {
      const c = k[j], d = k[j + 1 === n ? 0 : j + 1];
      if (j === i + 1 || (i === 0 && j === n - 1)) {
        // Adyacentes: comparten un vértice. Sólo se pisan si son colineales y
        // la segunda vuelve sobre la primera.
        const [x, y, z] = j === i + 1 ? [a, b, d] : [c, a, b];
        const cruz = (y[0] - x[0]) * (z[1] - y[1]) - (y[1] - x[1]) * (z[0] - y[0]);
        const punto = (y[0] - x[0]) * (z[0] - y[0]) + (y[1] - x[1]) * (z[1] - y[1]);
        if (cruz === 0 && punto < 0) return false;
        continue;
      }
      if (seTocan(a, b, c, d)) return false;
    }
  }
  return true;
}

function sonParesFinitos(x: unknown): x is Poligono {
  if (!Array.isArray(x)) return false;
  for (const q of x) {
    if (!Array.isArray(q) || q.length !== 2) return false;
    if (typeof q[0] !== "number" || typeof q[1] !== "number") return false;
    if (!Number.isFinite(q[0]) || !Number.isFinite(q[1])) return false;
  }
  return true;
}

/**
 * §3.7, los pasos que son de la geometría (1, 3 a 8), en ese orden: el primero
 * que falla da el código. El 2 (que la participación sea de esta cara) lo mira
 * el servidor; el 9 (`ZONA_SIN_SUPERFICIE_UTIL`, un aviso) necesita las
 * exclusiones y lo da `medir`. Con `codigo: null`, `vertices` son los limpios:
 * cuantizados, sin repetidos y antihorarios conservando el primero.
 */
export function validarZona(vertices: unknown, ancho: number, alto: number):
  { vertices: Poligono; codigo: null } | { vertices: Poligono | null; codigo: CodigoDeZona } {
  if (!sonParesFinitos(vertices)) return { vertices: null, codigo: "ZONA_MALFORMADA" };
  const p = sinRepetidos(cuantizar(vertices));
  if (p.length < MIN_VERTICES) return { vertices: p, codigo: "ZONA_POCOS_VERTICES" };
  if (p.length > MAX_VERTICES) return { vertices: p, codigo: "ZONA_DEMASIADOS_VERTICES" };
  for (const [u, v] of p) {
    if (u < 0 || u > 1 || v < 0 || v > 1) return { vertices: p, codigo: "ZONA_FUERA" };
  }
  if (!esSimple(p)) return { vertices: p, codigo: "ZONA_SE_CRUZA" };
  if (Math.abs(dobleAreaEntera(enteros(p))) / 2e12 * ancho * alto < AREA_MINIMA_M2) {
    return { vertices: p, codigo: "ZONA_SIN_AREA" };
  }
  return { vertices: antihorario(p), codigo: null };
}

/** Las zonas que se mandan entran en los topes (§3.8 paso 0): ≤ 60 zonas,
 *  ≤ 240 vértices en total y ≤ 24 por zona, contados CRUDOS (antes de
 *  limpiar). Fuera de los topes, el servidor contesta 422 y no guarda. */
export function dentroDeLosTopes(zonas: readonly { vertices: unknown }[]): boolean {
  if (zonas.length > MAX_ZONAS_POR_CARA) return false;
  let total = 0;
  for (const z of zonas) {
    const n = Array.isArray(z.vertices) ? z.vertices.length : 0;
    if (n > MAX_VERTICES) return false;
    total += n;
  }
  return total <= MAX_VERTICES_POR_CARA;
}

/* ── Franjas verticales con barrido (§6.2) ─────────────────────────────────── */

/** Una arista no vertical: su rango en x, sus extremos, de qué polígono y de
 *  qué familia (0 = P, 1 = exclusiones, 2 = Q). */
interface Arista { xmin: number; xmax: number; ax: number; ay: number; bx: number; by: number; pid: number; fam: number }
/** Un extremo de intervalo: su y en el punto medio y la recta que lo da (una
 *  arista, o una constante: el borde de la cara o de una exclusión). La recta
 *  sólo la usa `trapecios`; las cuentas usan `y`. */
interface Extremo { y: number; linea: Arista | number }
type Intervalo = [Extremo, Extremo];

function rectangulo(e: Exclusion): Poligono {
  return [[e.u0, e.v0], [e.u1, e.v0], [e.u1, e.v1], [e.u0, e.v1]];
}

function aristasDe(familias: Poligono[][]): Arista[] {
  const fuera: Arista[] = [];
  let pid = 0;
  for (let fi = 0; fi < familias.length; fi++) {
    for (const p of familias[fi]) {
      const n = p.length;
      for (let i = 0; i < n; i++) {
        const a = p[i], b = p[i + 1 === n ? 0 : i + 1];
        if (Math.abs(a[0] - b[0]) > EPS) {
          fuera.push({ xmin: Math.min(a[0], b[0]), xmax: Math.max(a[0], b[0]), ax: a[0], ay: a[1], bx: b[0], by: b[1], pid, fam: fi });
        }
      }
      pid += 1;
    }
  }
  return fuera;
}

/** La x de un cruce PROPIO (t, u ∈ (0,1)) entre dos aristas, o null. */
function cruceX(e: Arista, f: Arista): number | null {
  const rx = e.bx - e.ax, ry = e.by - e.ay;
  const sx = f.bx - f.ax, sy = f.by - f.ay;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < EPS) return null;
  const t = ((f.ax - e.ax) * sy - (f.ay - e.ay) * sx) / den;
  const u = ((f.ax - e.ax) * ry - (f.ay - e.ay) * rx) / den;
  if (t <= 0 || t >= 1 || u <= 0 || u >= 1) return null;
  return e.ax + t * rx;
}

const porXmin = (a: Arista, b: Arista) => a.xmin - b.xmin;

/** Las x donde cambia algo: los bordes de la cara, todos los vértices y los
 *  cruces entre aristas de polígonos DISTINTOS cuyos rangos en x y en y se
 *  pisan (barrido por xmin; dentro de un polígono simple no hay cruces). */
function eventos(familias: Poligono[][], aristas: Arista[]): number[] {
  const xs = new Set<number>([0, 1]);
  for (const f of familias) for (const p of f) for (const q of p) xs.add(q[0] + 0);
  const orden = aristas.slice().sort(porXmin);
  let activas: Arista[] = [];
  for (const e of orden) {
    activas = activas.filter((f) => f.xmax > e.xmin);
    const ylo = Math.min(e.ay, e.by), yhi = Math.max(e.ay, e.by);
    for (const f of activas) {
      if (f.pid === e.pid) continue;
      if (Math.max(f.ay, f.by) < ylo || Math.min(f.ay, f.by) > yhi) continue;
      const x = cruceX(e, f);
      if (x !== null) xs.add(x + 0);
    }
    activas.push(e);
  }
  return [...xs].sort((a, b) => a - b);
}

function enX(a: Arista, x: number): number {
  return a.ay + (x - a.ax) * (a.by - a.ay) / (a.bx - a.ax);
}

/** Par-impar POR POLÍGONO en la vertical xm, con las aristas activas de UNA
 *  familia (todas cumplen xmin < xm < xmax: así las mantiene el barrido). */
function intervalosDe(activas: Arista[], xm: number): Intervalo[] {
  const porPoligono = new Map<number, Extremo[]>();
  for (const e of activas) {
    const y = enX(e, xm);
    const l = porPoligono.get(e.pid);
    if (l) l.push({ y, linea: e }); else porPoligono.set(e.pid, [{ y, linea: e }]);
  }
  const fuera: Intervalo[] = [];
  for (const ys of porPoligono.values()) {
    ys.sort((a, b) => a.y - b.y);
    for (let i = 0; i + 1 < ys.length; i += 2) fuera.push([ys[i], ys[i + 1]]);
  }
  return fuera;
}

/** Ordena por inicio (y por fin) y funde los que se pisan o se tocan. */
function unir(ints: Intervalo[]): Intervalo[] {
  const orden = ints.slice().sort((a, b) => (a[0].y - b[0].y) || (a[1].y - b[1].y));
  const fuera: Intervalo[] = [];
  for (const [a, b] of orden) {
    const ult = fuera[fuera.length - 1];
    if (ult && a.y <= ult[1].y) {
      if (b.y > ult[1].y) ult[1] = b;
    } else fuera.push([a, b]);
  }
  return fuera;
}

/** A ∩ B, las dos ya unidas (dos punteros). */
function cortar(A: Intervalo[], B: Intervalo[]): Intervalo[] {
  const fuera: Intervalo[] = [];
  let i = 0, j = 0;
  while (i < A.length && j < B.length) {
    const a = A[i][0].y > B[j][0].y ? A[i][0] : B[j][0];
    const b = A[i][1].y < B[j][1].y ? A[i][1] : B[j][1];
    if (b.y > a.y) fuera.push([a, b]);
    if (A[i][1].y < B[j][1].y) i++; else j++;
  }
  return fuera;
}

/** A − B, las dos ya unidas. */
function restar(A: Intervalo[], B: Intervalo[]): Intervalo[] {
  const fuera: Intervalo[] = [];
  for (const [a0, a1] of A) {
    let cur = a0;
    for (const [b0, b1] of B) {
      if (b1.y <= cur.y || b0.y >= a1.y) continue;
      if (b0.y > cur.y) fuera.push([cur, b0]);
      if (b1.y > cur.y) cur = b1;
    }
    if (cur.y < a1.y) fuera.push([cur, a1]);
  }
  return fuera;
}

const constante = (c: number): Extremo => ({ y: c, linea: c });
const LA_CARA: Intervalo[] = [[constante(0), constante(1)]];

function rangoX(F: Poligono[]): [number, number] {
  let lo = Infinity, hi = -Infinity;
  for (const p of F) for (const q of p) { if (q[0] < lo) lo = q[0]; if (q[0] > hi) hi = q[0]; }
  return [lo, hi];
}

/** Recorre las franjas de ∪P ∩ U [∩ ∪Q] y le pasa a `cada` cada franja con sus
 *  intervalos finales. U = [0,1]² − ∪E. */
function franjas(P: Poligono[], E: readonly Exclusion[], Q: Poligono[] | undefined,
  cada: (x0: number, x1: number, I: Intervalo[]) => void): void {
  if (P.length === 0) return;
  if (Q !== undefined && Q.length === 0) return;
  const familias: Poligono[][] = [P, E.map(rectangulo)];
  if (Q !== undefined) familias.push(Q);
  const aristas = aristasDe(familias);
  const xs = eventos(familias, aristas);
  // Fuera de la cara y del rango de P (y de Q) no hay nada que sumar. La
  // cara la recortan también los intervalos (`LA_CARA`): defensivo, las zonas
  // válidas ya están adentro.
  let [lo, hi] = rangoX(P);
  if (Q !== undefined) {
    const [q0, q1] = rangoX(Q);
    lo = Math.max(lo, q0); hi = Math.min(hi, q1);
  }
  lo = Math.max(lo, 0); hi = Math.min(hi, 1);
  // Las aristas de P y de Q, por xmin; las activas de cada familia, aparte
  // (las exclusiones se cortan por su rectángulo, no por sus aristas).
  const sinE = aristas.filter((e) => e.fam !== 1).sort(porXmin);
  let k = 0;
  let activasP: Arista[] = [];
  let activasQ: Arista[] = [];
  for (let idx = 0; idx + 1 < xs.length; idx++) {
    const x0 = xs[idx], x1 = xs[idx + 1];
    if (x1 - x0 < EPS || x1 <= lo || x0 >= hi) continue;
    const xm = (x0 + x1) / 2;
    while (k < sinE.length && sinE[k].xmin < xm) { (sinE[k].fam === 0 ? activasP : activasQ).push(sinE[k]); k++; }
    activasP = activasP.filter((e) => e.xmax > xm);
    let I = cortar(unir(intervalosDe(activasP, xm)), LA_CARA);
    const IE: Intervalo[] = [];
    for (const e of E) if (e.u0 < xm && xm < e.u1) IE.push([constante(e.v0), constante(e.v1)]);
    I = restar(I, unir(IE));
    if (Q !== undefined) {
      activasQ = activasQ.filter((e) => e.xmax > xm);
      I = cortar(I, unir(intervalosDe(activasQ, xm)));
    }
    cada(x0, x1, I);
  }
}

/** El área de ∪P ∩ U [∩ ∪Q], normalizada (fracción de la cara). Unión de las
 *  zonas de una participación: `areaCubierta(zonas, E)`; lo que se pisan dos:
 *  `areaCubierta(zonasA, E, zonasB)`; el área útil: `areaUtil(E)`. Exacta para
 *  polígonos simples (los que deja pasar `validarZona`): los cruces de un
 *  polígono consigo mismo no son eventos. */
export function areaCubierta(P: Poligono[], E: readonly Exclusion[] = [], Q?: Poligono[]): number {
  let A = 0;
  franjas(P, E, Q, (x0, x1, I) => {
    let s = 0;
    for (const [a, b] of I) s += b.y - a.y;
    A += (x1 - x0) * s;
  });
  return A;
}

const CARA_UNITARIA: Poligono = [[0, 0], [1, 0], [1, 1], [0, 1]];

/** La fracción de la cara que se vende: [0,1]² menos las exclusiones. */
export function areaUtil(E: readonly Exclusion[]): number {
  return areaCubierta([CARA_UNITARIA], E);
}

/** §3.5: `redondear(10000 · área(∪zonas ∩ U) / área_U)`; 0 sin zonas (o sin
 *  área útil, que en una superficie de verdad no pasa: `superficie` es null). */
export function dibujadoPb(zonas: Poligono[], E: readonly Exclusion[]): number {
  if (zonas.length === 0) return 0;
  const util = areaUtil(E);
  if (!(util > 0)) return 0;
  return Math.floor(CARA_ENTERA_PB * areaCubierta(zonas, E) / util + 0.5);
}

/** La caja de todos los vértices: [u0, v0, u1, v1]. */
export function cajas(P: Poligono[]): [number, number, number, number] {
  let u0 = Infinity, v0 = Infinity, u1 = -Infinity, v1 = -Infinity;
  for (const p of P) {
    for (const [u, v] of p) {
      if (u < u0) u0 = u;
      if (v < v0) v0 = v;
      if (u > u1) u1 = u;
      if (v > v1) v1 = v;
    }
  }
  return [u0, v0, u1, v1];
}

/** Sólo para dibujar (el 3D y el lienzo pintan el relleno con esto): los
 *  trapecios de ∪P ∩ U [∩ ∪Q] que salen de las mismas franjas, antihorarios.
 *  Cada punto se pinta una vez y nada cae sobre una exclusión; su área suma
 *  `areaCubierta` (lo prueba `probar-zonas.mjs`). No tiene gemelo. */
export function trapecios(P: Poligono[], E: readonly Exclusion[] = [], Q?: Poligono[]): [Punto, Punto, Punto, Punto][] {
  const fuera: [Punto, Punto, Punto, Punto][] = [];
  const en = (l: Arista | number, x: number) => (typeof l === "number" ? l : enX(l, x));
  franjas(P, E, Q, (x0, x1, I) => {
    for (const [a, b] of I) {
      fuera.push([[x0, en(a.linea, x0)], [x1, en(a.linea, x1)], [x1, en(b.linea, x1)], [x0, en(b.linea, x0)]]);
    }
  });
  return fuera;
}

/* ── Medir una distribución (§3.8) ─────────────────────────────────────────── */

/** Una zona tal como se manda: de qué participación (su espacio PC) y sus
 *  vértices crudos. */
export interface ZonaAMedir { participacionSpaceId: number; vertices: unknown }
/** La validación de la zona `k` (índice 0-based en la lista enviada: es el
 *  `zona` de los problemas). `codigo: null` = válida, con sus vértices limpios. */
export interface ValidacionDeZona { k: number; participacionSpaceId: number; vertices: Poligono | null; codigo: CodigoDeZona | null }
/** Lo que se pisan las zonas de dos participaciones (s1 < s2), en m². */
export interface Pisada { s1: number; s2: number; m2: number }
export interface Medidas {
  validaciones: ValidacionDeZona[];
  /** Por participación con alguna zona válida, de menor a mayor spaceId. */
  dibujadoPb: Map<number, number>;
  /** Por par de participaciones cuyas cajas se pisan (las demás: 0). */
  pisadas: Pisada[];
  /** Las `k` de las zonas válidas que caen enteras sobre lo que no se vende
   *  (menos de 1 cm² útil): aviso `ZONA_SIN_SUPERFICIE_UTIL`. */
  sinSuperficieUtil: number[];
  /** La fracción útil de la cara (la de `areaUtil`). */
  areaUtil: number;
}

/**
 * Lo caro de la revisión, sin mirar términos (así corre ANTES del candado en
 * el servidor, §5.4): valida cada zona, suma lo dibujado por participación y
 * mide lo que se pisan dos participaciones si sus cajas se tocan. Lo juzga
 * `participaciones.ts` (`juzgar`), que sabe de fechas y porcentajes.
 */
export function medir(zonas: readonly ZonaAMedir[], sup: { exclusiones: readonly Exclusion[]; ancho: number; alto: number }): Medidas {
  const W = sup.ancho, H = sup.alto, E = sup.exclusiones;
  const validaciones: ValidacionDeZona[] = [];
  const porS = new Map<number, Poligono[]>();
  for (let k = 0; k < zonas.length; k++) {
    const z = zonas[k];
    const r = validarZona(z.vertices, W, H);
    validaciones.push({ k, participacionSpaceId: z.participacionSpaceId, vertices: r.vertices, codigo: r.codigo });
    if (r.codigo === null) {
      const l = porS.get(z.participacionSpaceId);
      if (l) l.push(r.vertices); else porS.set(z.participacionSpaceId, [r.vertices]);
    }
  }
  const util = areaUtil(E);
  const sinSuperficieUtil: number[] = [];
  for (const v of validaciones) {
    if (v.codigo === null && v.vertices && areaCubierta([v.vertices], E) * W * H < AREA_MINIMA_M2) sinSuperficieUtil.push(v.k);
  }
  const ss = [...porS.keys()].sort((a, b) => a - b);
  const dibujado = new Map<number, number>();
  for (const s of ss) {
    dibujado.set(s, util > 0 ? Math.floor(CARA_ENTERA_PB * areaCubierta(porS.get(s)!, E) / util + 0.5) : 0);
  }
  const caja = new Map<number, [number, number, number, number]>();
  for (const s of ss) caja.set(s, cajas(porS.get(s)!));
  const pisadas: Pisada[] = [];
  for (let i = 0; i < ss.length; i++) {
    for (let j = i + 1; j < ss.length; j++) {
      const a = caja.get(ss[i])!, b = caja.get(ss[j])!;
      if (!(a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3])) continue;
      pisadas.push({ s1: ss[i], s2: ss[j], m2: areaCubierta(porS.get(ss[i])!, E, porS.get(ss[j])!) * W * H });
    }
  }
  return { validaciones, dibujadoPb: dibujado, pisadas, sinSuperficieUtil, areaUtil: util };
}
