/**
 * Distribuir una cara «como un juego de piezas» (rediseño aprobado el
 * 2026-10-24, `docs/ESTADO.md` → *Distribuir con piezas*): cada marca que se
 * vende por participación es una PIEZA que nace con el tamaño EXACTO de su %
 * contratado, medido con la misma cuenta que el servidor
 * (`zonasGeometria.ts` ↔ `services/zonas_geometria.py`, bit a bit, con el
 * redondeo a puntos básicos incluido). Se arrastra a la cara y encaja; no hay
 * forma de pasarse.
 *
 * Todo acá es PURO (sin DOM, sin React, sin reloj): lo prueba
 * `scripts/probar-piezas.mjs` con los muebles del catálogo, y
 * `backend/tests/test_piezas_exactas.py` le pasa al servidor los mismos
 * rectángulos (`scripts/casos/piezas.json`) y comprueba que dan el % justo,
 * sin `EXCESO`.
 *
 *   · Una pieza «Franja» (de arriba a abajo) o «Estantes» (a lo ancho, pegada
 *     a un estante) es UN rectángulo en u,v (u = 0 a la izquierda de quien
 *     mira, v = 0 abajo), cuantizado a 1e-6, antihorario: lo que se ve es lo
 *     que se manda. Un lado lo elige la persona (o el acomodo) y el otro se
 *     RESUELVE para que `dibujadoPb` dé exactamente el contratado: estirarla
 *     más ancha la hace más baja sola.
 *   · «A mano» es el polígono libre de siempre: acá están el contador
 *     («Llevás 20 % de 30 %») y el imán por eje a los estantes y bordes.
 *   · Lo que no se vende (zócalo, parantes, remate…) cuenta como siempre: una
 *     franja que cruza un parante es más ancha, no más grande.
 */
import {
  AREA_MINIMA_M2, MAX_VERTICES, areaCubierta, areaUtil, cuantizarNumero, dibujadoPb, validarZona,
  type Exclusion, type Poligono, type Punto,
} from "./zonasGeometria";
import { pct } from "./participaciones";

export type FormaDePieza = "franja" | "estantes" | "a_mano";

/** Un rectángulo en u,v (u0 < u1, v0 < v1). */
export interface Rect { u0: number; v0: number; u1: number; v1: number }

/** Lo que las piezas leen de la cara: la superficie del servidor y, para el
 *  imán, las alturas de los estantes (`guiasDeCara`). */
export interface CaraDePiezas {
  ancho: number;
  alto: number;
  exclusiones: readonly Exclusion[];
  /** Las alturas (v) de los entrepaños, repisas o rejillas, si se conocen. */
  estantes?: readonly number[];
}

/** Los textos de la forma, para el segmentado. */
export const FORMAS: { forma: FormaDePieza; texto: string; ayuda: string }[] = [
  { forma: "franja", texto: "Franja", ayuda: "de arriba a abajo" },
  { forma: "estantes", texto: "Estantes", ayuda: "a lo ancho" },
  { forma: "a_mano", texto: "A mano", ayuda: "cualquier forma" },
];

const q = cuantizarNumero;
const PASO = 1e-6;
const EPS = 1e-9;

/** El rectángulo como zona: antihorario desde la esquina de abajo a la izquierda. */
export function poligonoDeRect(r: Rect): Poligono {
  return [[r.u0, r.v0], [r.u1, r.v0], [r.u1, r.v1], [r.u0, r.v1]];
}

/** El rectángulo de una zona que ES un rectángulo con lados paralelos a la
 *  cara (cuatro vértices, en cualquier orden y sentido), o null. */
export function rectDePoligono(p: readonly Punto[]): Rect | null {
  if (p.length !== 4) return null;
  const us = [...new Set(p.map((x) => x[0]))].sort((a, b) => a - b);
  const vs = [...new Set(p.map((x) => x[1]))].sort((a, b) => a - b);
  if (us.length !== 2 || vs.length !== 2) return null;
  const esquinas = new Set(p.map((x) => `${x[0]}|${x[1]}`));
  for (const u of us) for (const v of vs) if (!esquinas.has(`${u}|${v}`)) return null;
  return { u0: us[0], v0: vs[0], u1: us[1], v1: vs[1] };
}

/** Lo que el servidor diría que dibuja este rectángulo, en pb. */
export function pbDeRect(r: Rect, E: readonly Exclusion[]): number {
  return dibujadoPb([poligonoDeRect(r)], E);
}

/** ¿El servidor lo aceptaría como zona? (adentro de la cara, ≥ 1 cm², válido). */
export function rectValido(r: Rect, cara: Pick<CaraDePiezas, "ancho" | "alto">): boolean {
  return r.u0 >= 0 && r.v0 >= 0 && r.u1 <= 1 && r.v1 <= 1 && r.u1 > r.u0 && r.v1 > r.v0
    && validarZona(poligonoDeRect(r), cara.ancho, cara.alto).codigo === null;
}

/* ── Los bordes de lo que se vende ─────────────────────────────────────────── */

export interface BordesUtiles { u0: number; u1: number; v0: number; v1: number }

const bordesCache = new WeakMap<readonly Exclusion[], BordesUtiles>();

/**
 * El recuadro de lo que se vende: la v más baja y la más alta con algo
 * vendible (arriba del zócalo, abajo del remate o el copete) y lo mismo en u.
 * Se mide con la misma cuenta del área, banda por banda.
 */
export function bordesUtiles(E: readonly Exclusion[]): BordesUtiles {
  const ya = bordesCache.get(E);
  if (ya) return ya;
  const niveles = (k: "u" | "v") => {
    const s = new Set<number>([0, 1]);
    for (const e of E) { s.add(k === "u" ? e.u0 : e.v0); s.add(k === "u" ? e.u1 : e.v1); }
    return [...s].filter((x) => x >= 0 && x <= 1).sort((a, b) => a - b);
  };
  const tramos = (k: "u" | "v") => {
    const n = niveles(k);
    let lo = 1, hi = 0;
    for (let i = 0; i + 1 < n.length; i++) {
      const a = n[i], b = n[i + 1];
      if (b - a < EPS) continue;
      const banda: Poligono = k === "v" ? [[0, a], [1, a], [1, b], [0, b]] : [[a, 0], [b, 0], [b, 1], [a, 1]];
      if (areaCubierta([banda], E) > 0) { if (a < lo) lo = a; if (b > hi) hi = b; }
    }
    return hi > lo ? [lo, hi] : [0, 1];
  };
  const [u0, u1] = tramos("u"), [v0, v1] = tramos("v");
  const r = { u0, u1, v0, v1 };
  bordesCache.set(E, r);
  return r;
}

/** Las líneas a las que se pegan las piezas y los puntos «A mano»: los bordes
 *  de lo que se vende, los de cada cosa que no se vende y los estantes. */
export function lineasDeLaCara(cara: CaraDePiezas): { us: number[]; vs: number[] } {
  const b = bordesUtiles(cara.exclusiones);
  const us = new Set<number>([0, 1, b.u0, b.u1]);
  const vs = new Set<number>([0, 1, b.v0, b.v1]);
  for (const e of cara.exclusiones) {
    const alta = e.v1 - e.v0 >= 0.5 * (b.v1 - b.v0);
    const ancha = e.u1 - e.u0 >= 0.5 * (b.u1 - b.u0);
    if (alta) { us.add(e.u0); us.add(e.u1); }
    if (ancha) { vs.add(e.v0); vs.add(e.v1); }
  }
  for (const v of cara.estantes ?? []) if (v > b.v0 + EPS && v < b.v1 - EPS) vs.add(q(v));
  const orden = (s: Set<number>) => [...s].filter((x) => x >= 0 && x <= 1).sort((a, b2) => a - b2);
  return { us: orden(us), vs: orden(vs) };
}

/* ── El rectángulo EXACTO ──────────────────────────────────────────────────── */

/**
 * Mueve UN lado del rectángulo desde `desde` hacia `tope` hasta que el
 * servidor diga exactamente `pb`. El área que cuenta crece (o se queda quieta
 * sobre un parante) a medida que el lado avanza: la bisección encuentra el
 * primer punto donde se llega a `pb` y después, ya cuantizado a 1e-6, se
 * busca al lado el que redondea justo (cada 1e-6 mueve centésimas de pb, así
 * que el primero casi siempre sirve). null si ni yendo hasta el tope alcanza,
 * o si el resultado no sería una zona válida.
 */
function resolverLado(cara: CaraDePiezas, pb: number, armar: (x: number) => Rect, desde: number, tope: number): Rect | null {
  const E = cara.exclusiones;
  const util = areaUtil(E);
  if (!(util > 0) || !Number.isInteger(pb) || pb < 1 || pb > 10000) return null;
  const crudo = (x: number) => (10000 * areaCubierta([poligonoDeRect(armar(x))], E)) / util;
  const dir = tope >= desde ? 1 : -1;
  if (Math.abs(tope - desde) < PASO) return null;
  if (crudo(tope) < pb - 0.5) return null;
  let a = desde, b = tope;
  for (let i = 0; i < 64; i++) {
    const m = (a + b) / 2;
    if (crudo(m) < pb) a = m; else b = m;
  }
  const x0 = q(b);
  const dentro = (x: number) => (dir > 0 ? x > desde && x <= tope + EPS : x < desde && x >= tope - EPS);
  for (let k = 0; k <= 400; k++) {
    for (const s of k === 0 ? [0] : [k, -k]) {
      const x = q(x0 + s * PASO * dir);
      if (!dentro(x)) continue;
      const r = armar(x);
      if (pbDeRect(r, E) === pb && rectValido(r, cara)) return r;
    }
  }
  return null;
}

/** El ancho exacto: con la altura [v0, v1] fija, el lado derecho (o el
 *  izquierdo) se corre desde `u` hasta dar `pb`. */
export function anchoExacto(cara: CaraDePiezas, pb: number, o: { v0: number; v1: number; u: number; hacia: "derecha" | "izquierda" }): Rect | null {
  const u = q(o.u), v0 = q(o.v0), v1 = q(o.v1);
  // Hasta el borde de lo que se VENDE (no hasta el de la cara): más allá no
  // cuenta, y una pieza que necesita todo lo que queda (la última de
  // «Acomodar solas», con el redondeo a pb) terminaba sobre el parante.
  const b = bordesUtiles(cara.exclusiones);
  if (o.hacia === "derecha") return resolverLado(cara, pb, (x) => ({ u0: u, v0, u1: x, v1 }), u, Math.max(u, b.u1));
  return resolverLado(cara, pb, (x) => ({ u0: x, v0, u1: u, v1 }), u, Math.min(u, b.u0));
}

/** El alto exacto: con el ancho [u0, u1] fijo, el lado de arriba (o el de
 *  abajo) se corre desde `v` hasta dar `pb`. */
export function altoExacto(cara: CaraDePiezas, pb: number, o: { u0: number; u1: number; v: number; hacia: "arriba" | "abajo" }): Rect | null {
  const v = q(o.v), u0 = q(o.u0), u1 = q(o.u1);
  const b = bordesUtiles(cara.exclusiones);
  if (o.hacia === "arriba") return resolverLado(cara, pb, (x) => ({ u0, v0: v, u1, v1: x }), v, Math.max(v, b.v1));
  return resolverLado(cara, pb, (x) => ({ u0, v0: x, u1, v1: v }), v, Math.min(v, b.v0));
}

/** Una franja de arriba a abajo que arranca en `u` hacia la derecha, o que
 *  termina en `u` si va hacia la izquierda. Va de borde a borde de lo que se
 *  VENDE (arriba del zócalo, abajo del remate, adentro de los parantes de los
 *  costados): lo que se ve en la cara es lo que se guarda, y el % es el mismo
 *  que si cubriera lo que no se vende, que no cuenta (2026-10-24, la
 *  corrección tras la ronda de prueba). */
export function franja(cara: CaraDePiezas, pb: number, u: number, hacia: "derecha" | "izquierda" = "derecha"): Rect | null {
  const b = bordesUtiles(cara.exclusiones);
  const uu = Math.max(b.u0, Math.min(u, b.u1));
  return anchoExacto(cara, pb, { v0: b.v0, v1: b.v1, u: uu, hacia });
}

/** «Estantes»: con el ancho [u0, u1], apoyada en el estante `v` (la altura
 *  sale sola). Si no entra hacia arriba, se apoya arriba de todo y baja. */
export function estantes(cara: CaraDePiezas, pb: number, u0: number, u1: number, v: number): Rect | null {
  const b = bordesUtiles(cara.exclusiones);
  return altoExacto(cara, pb, { u0, u1, v, hacia: "arriba" })
    ?? altoExacto(cara, pb, { u0, u1, v: b.v1, hacia: "abajo" })
    ?? (v > b.v0 ? altoExacto(cara, pb, { u0, u1, v: b.v0, hacia: "arriba" }) : null);
}

/* ── Qué pisa qué ──────────────────────────────────────────────────────────── */

/** Lo que otra pieza ocupa: su dueño y su forma (lo que choca con ésta). */
export interface Ocupado { spaceId: number; poligonos: readonly Poligono[] }

/** La caja de varias zonas. */
export function cajaDe(P: readonly Poligono[]): Rect | null {
  let u0 = Infinity, v0 = Infinity, u1 = -Infinity, v1 = -Infinity;
  for (const p of P) for (const [u, v] of p) { u0 = Math.min(u0, u); v0 = Math.min(v0, v); u1 = Math.max(u1, u); v1 = Math.max(v1, v); }
  return u1 > u0 && v1 > v0 ? { u0, v0, u1, v1 } : null;
}

/** La primera pieza que este polígono pisa en más de 1 cm² de lo que se
 *  vende (la regla del `SOLAPE`), o null. */
export function primeraQuePisa(P: readonly Poligono[], ocupados: readonly Ocupado[], cara: CaraDePiezas): number | null {
  const m2 = cara.ancho * cara.alto;
  for (const o of ocupados) {
    if (o.poligonos.length === 0) continue;
    if (areaCubierta([...P], cara.exclusiones, [...o.poligonos]) * m2 > AREA_MINIMA_M2) return o.spaceId;
  }
  return null;
}

/** Los tramos libres en u a la altura de `v` (o, sin `v`, en toda la altura):
 *  lo que se vende menos las cajas de lo ocupado que pasa por ahí. */
export function huecosLibres(cara: CaraDePiezas, ocupados: readonly Ocupado[], v?: number): [number, number][] {
  const b = bordesUtiles(cara.exclusiones);
  if (b.u1 <= b.u0) return [];
  const tapas: [number, number][] = [];
  for (const o of ocupados) {
    const c = cajaDe(o.poligonos);
    if (!c) continue;
    if (v !== undefined && !(c.v0 - EPS <= v && v <= c.v1 + EPS)) continue;
    tapas.push([c.u0, c.u1]);
  }
  tapas.sort((x, y) => x[0] - y[0]);
  // Los huecos van de borde a borde de lo que se VENDE: una pieza no se
  // dibuja sobre el parante del costado (lo que se ve es lo que se guarda).
  const fuera: [number, number][] = [];
  let cur = b.u0;
  for (const [a, z] of tapas) {
    if (a > cur + EPS) fuera.push([cur, Math.min(a, b.u1)]);
    if (z > cur) cur = z;
    if (cur >= b.u1) break;
  }
  if (cur < b.u1 - EPS) fuera.push([cur, b.u1]);
  return fuera.filter(([a, z]) => z - a > EPS);
}

/* ── Acomodar solas ────────────────────────────────────────────────────────── */

export interface PiezaParaAcomodar { spaceId: number; pb: number }

/**
 * «Acomodar solas»: pone las piezas que se le pasan (las sin ubicar, en el
 * orden de la lista) en franjas, una al lado de la otra, de izquierda a
 * derecha, en lo libre. Una pieza choca sólo con las que rigen en fechas que
 * se cruzan (`cruzan`): dos marcas que nunca están a la vez pueden usar el
 * mismo lugar. La que no entra como franja en ningún hueco queda sin ubicar
 * (se la ubica a mano o en «Estantes»).
 */
export function acomodarSolas(cara: CaraDePiezas, piezas: readonly PiezaParaAcomodar[], fijas: readonly Ocupado[],
  cruzan: (a: number, b: number) => boolean): Map<number, Rect> {
  const puestas = new Map<number, Rect>();
  for (const p of piezas) {
    const ocupados: Ocupado[] = [];
    for (const f of fijas) if (f.spaceId !== p.spaceId && cruzan(p.spaceId, f.spaceId)) ocupados.push(f);
    for (const [s, r] of puestas) if (cruzan(p.spaceId, s)) ocupados.push({ spaceId: s, poligonos: [poligonoDeRect(r)] });
    for (const [a, z] of huecosLibres(cara, ocupados)) {
      const r = franja(cara, p.pb, a, "derecha");
      if (r && r.u1 <= z + EPS && primeraQuePisa([poligonoDeRect(r)], ocupados, cara) === null) { puestas.set(p.spaceId, r); break; }
    }
  }
  return puestas;
}

/* ── Soltar una pieza en la cara ───────────────────────────────────────────── */

const pegar = (x: number, lineas: readonly number[], radio: number): number | null => {
  let mejor: number | null = null, d = radio;
  for (const l of lineas) { const dd = Math.abs(l - x); if (dd <= d) { d = dd; mejor = l; } }
  return mejor;
};

/**
 * Dónde queda una pieza que se suelta (o se arrastra) en `(u, v)`, con su
 * forma: una Franja ocupa toda la altura y se corre de costado; una de
 * Estantes conserva su ancho (sin ancho, el del hueco donde cae) y se apoya
 * en el estante más cercano. Se pega a los bordes de lo que se vende y al
 * costado de las otras piezas si cae a menos de `radio` (u,v), y nunca sale
 * de la cara. Siempre da el % exacto; si pisa a otra pieza lo dice quien
 * llama (`primeraQuePisa`). null si en ningún lado da su %.
 */
export function encajar(cara: CaraDePiezas, pb: number, forma: "franja" | "estantes", u: number, v: number,
  ocupados: readonly Ocupado[], o: { radio?: number; ancho?: number | null; altura?: { v0: number; v1: number } | null } = {}): Rect | null {
  const b = bordesUtiles(cara.exclusiones);
  const radio = o.radio ?? 0.03;
  const lineas = lineasDeLaCara(cara);
  if (forma === "franja") {
    const v0 = o.altura?.v0 ?? b.v0, v1 = o.altura?.v1 ?? b.v1;
    const conAltura = (desde: number, hacia: "derecha" | "izquierda") => anchoExacto(cara, pb, { v0, v1, u: desde, hacia });
    const uc = Math.max(0, Math.min(u, 1));
    const todaLaAltura = v0 <= b.v0 + EPS && v1 >= b.v1 - EPS;
    const hueco = huecosLibres(cara, ocupados, todaLaAltura ? undefined : (v0 + v1) / 2)
      .find(([a, z]) => a - radio <= uc && uc <= z + radio) ?? null;
    const izqH = hueco ? hueco[0] : b.u0, derH = hueco ? hueco[1] : b.u1;
    // El ancho se mide desde el BORDE del hueco (o de lo que se vende), no
    // desde el puntero: medido desde `u` hacia un solo lado, una pieza de más
    // de la mitad no entraba soltada cerca del medio de una cara vacía.
    const tanteo = conAltura(izqH, "derecha") ?? conAltura(derH, "izquierda")
      ?? conAltura(b.u0, "derecha") ?? conAltura(b.u1, "izquierda");
    if (!tanteo) return null;
    const w = tanteo.u1 - tanteo.u0;
    const bordesU = [...lineas.us, izqH, derH];
    const izq = pegar(uc - w / 2, bordesU, radio);
    const der = pegar(uc + w / 2, bordesU, radio);
    // Centrada en el puntero, pegada a un borde cercano y recortada al hueco.
    let r: Rect | null;
    if (uc - w / 2 < izqH || izq === izqH) r = conAltura(izqH, "derecha");
    else if (uc + w / 2 > derH || der === derH) r = conAltura(derH, "izquierda");
    else if (izq !== null) r = conAltura(izq, "derecha");
    else if (der !== null) r = conAltura(der, "izquierda");
    else r = conAltura(uc - w / 2, "derecha");
    if (r && r.u1 > derH + EPS) r = conAltura(derH, "izquierda") ?? r;
    if (r && r.u0 < izqH - EPS) r = conAltura(izqH, "derecha") ?? r;
    return r ?? conAltura(b.u1, "izquierda") ?? conAltura(b.u0, "derecha");
  }
  // Estantes
  const hueco = huecosLibres(cara, ocupados, v).find(([a, z]) => a - radio <= u && u <= z + radio)
    ?? [b.u0, b.u1] as [number, number];
  let ancho = o.ancho ?? (hueco[1] - hueco[0]);
  ancho = Math.min(Math.max(ancho, 0.02), b.u1 - b.u0);
  let u0 = u - ancho / 2;
  const izq = pegar(u0, [...lineas.us, hueco[0], hueco[1]], radio);
  const der = pegar(u0 + ancho, [...lineas.us, hueco[0], hueco[1]], radio);
  if (u0 < hueco[0] || izq === hueco[0]) u0 = hueco[0];
  else if (u0 + ancho > hueco[1] || der === hueco[1]) u0 = hueco[1] - ancho;
  else if (izq !== null) u0 = izq;
  else if (der !== null) u0 = der - ancho;
  u0 = Math.max(b.u0, Math.min(u0, b.u1 - ancho));
  const u1 = Math.min(1, u0 + ancho);
  // El alto que tendría apoyada abajo, para centrarla en el puntero.
  const prueba = altoExacto(cara, pb, { u0, u1, v: b.v0, hacia: "arriba" });
  const h = prueba ? prueba.v1 - prueba.v0 : (b.v1 - b.v0) / 2;
  const apoyos = lineas.vs.filter((x) => x >= b.v0 - EPS && x < b.v1 - EPS);
  let base = b.v0, dmin = Infinity;
  for (const l of apoyos) { const d = Math.abs(l - (v - h / 2)); if (d < dmin) { dmin = d; base = l; } }
  return estantes(cara, pb, u0, u1, base);
}

/**
 * Estirar una pieza rectangular desde uno de sus lados: el lado se corre a
 * `valor` (pegado a una línea de la cara si cae cerca) y el otro eje se
 * resuelve para que el % no cambie. Más ancha → más baja; más alta → más
 * angosta. null si así no da su % (el lado no se mueve).
 */
export function estirar(cara: CaraDePiezas, pb: number, r: Rect, lado: "e" | "o" | "n" | "s", valor: number, radio = 0.02): Rect | null {
  const lineas = lineasDeLaCara(cara);
  const MIN = 0.01;
  if (lado === "e" || lado === "o") {
    let x = pegar(valor, lineas.us, radio) ?? valor;
    if (lado === "e") x = Math.min(1, Math.max(x, r.u0 + MIN)); else x = Math.max(0, Math.min(x, r.u1 - MIN));
    const u0 = lado === "o" ? x : r.u0, u1 = lado === "e" ? x : r.u1;
    return altoExacto(cara, pb, { u0, u1, v: Math.max(r.v0, 0), hacia: "arriba" })
      ?? altoExacto(cara, pb, { u0, u1, v: Math.min(r.v1, 1), hacia: "abajo" });
  }
  let y = pegar(valor, lineas.vs, radio) ?? valor;
  if (lado === "n") y = Math.min(1, Math.max(y, r.v0 + MIN)); else y = Math.max(0, Math.min(y, r.v1 - MIN));
  const v0 = lado === "s" ? y : r.v0, v1 = lado === "n" ? y : r.v1;
  return anchoExacto(cara, pb, { v0, v1, u: r.u0, hacia: "derecha" }) ?? anchoExacto(cara, pb, { v0, v1, u: r.u1, hacia: "izquierda" });
}

/* ── Ubicar sin arrastrar (teclado y menú) ─────────────────────────────────── */

/**
 * Los lugares donde una pieza Franja o Estantes entra ENTERA, sin pisar a
 * nadie y con su % exacto: pegada al borde izquierdo y al derecho de cada
 * hueco libre, de izquierda a derecha. Una de Estantes conserva su ancho y su
 * estante (sin ubicar, toma el ancho del hueco y se apoya abajo). Es la
 * alternativa a arrastrar (accesibilidad): «Ponerla en el primer hueco libre»,
 * «a la izquierda», «a la derecha» y las flechas.
 */
export function lugaresPosibles(cara: CaraDePiezas, pb: number, forma: "franja" | "estantes", ocupados: readonly Ocupado[],
  actual: Rect | null): Rect[] {
  const b = bordesUtiles(cara.exclusiones);
  const fuera: Rect[] = [];
  const enV = forma === "estantes" && actual ? (actual.v0 + actual.v1) / 2 : undefined;
  for (const [a, z] of huecosLibres(cara, ocupados, enV)) {
    let rs: (Rect | null)[];
    if (forma === "franja") rs = [franja(cara, pb, a, "derecha"), franja(cara, pb, z, "izquierda")];
    else {
      const w = actual ? actual.u1 - actual.u0 : z - a;
      if (z - a < w - EPS) continue;
      const v = actual ? actual.v0 : b.v0;
      rs = [estantes(cara, pb, a, a + w, v), estantes(cara, pb, z - w, z, v)];
    }
    for (const r of rs) {
      if (!r || r.u0 < a - EPS || r.u1 > z + EPS) continue;
      if (primeraQuePisa([poligonoDeRect(r)], ocupados, cara) !== null) continue;
      if (fuera.some((x) => x.u0 === r.u0 && x.u1 === r.u1 && x.v0 === r.v0 && x.v1 === r.v1)) continue;
      fuera.push(r);
    }
  }
  return fuera.sort((x, y) => x.u0 - y.u0 || x.v0 - y.v0);
}

/** Adónde va una pieza sin arrastrarla: «primero» (el primer hueco libre,
 *  desde la izquierda), o el lugar siguiente «izquierda» / «derecha» desde
 *  donde está (sin ubicar: el de más a la izquierda o el de más a la
 *  derecha). null si no hay a dónde (el % no cambia nunca). */
export function ubicarSinArrastrar(cara: CaraDePiezas, pb: number, forma: "franja" | "estantes", ocupados: readonly Ocupado[],
  actual: Rect | null, como: "primero" | "izquierda" | "derecha"): Rect | null {
  const L = lugaresPosibles(cara, pb, forma, ocupados, actual);
  if (L.length === 0) return null;
  if (como === "primero" || (!actual && como === "izquierda")) return L[0];
  if (!actual) return L[L.length - 1];
  if (como === "izquierda") return [...L].reverse().find((r) => r.u0 < actual.u0 - 1e-6) ?? null;
  return L.find((r) => r.u0 > actual.u0 + 1e-6) ?? null;
}

/* ── La forma de una pieza ya dibujada ─────────────────────────────────────── */

/** Qué forma tiene lo dibujado de una marca: sin zonas, null; un rectángulo
 *  que cubre toda la altura que se vende, «franja»; otro rectángulo,
 *  «estantes»; cualquier otra cosa (varias zonas, un polígono), «a mano». */
export function formaDeLoDibujado(P: readonly Poligono[], E: readonly Exclusion[]): FormaDePieza | null {
  if (P.length === 0) return null;
  if (P.length > 1) return "a_mano";
  const r = rectDePoligono(P[0]);
  if (!r) return "a_mano";
  const b = bordesUtiles(E);
  return r.v0 <= b.v0 + 1e-6 && r.v1 >= b.v1 - 1e-6 ? "franja" : "estantes";
}

/* ── «A mano»: el contador y el imán ───────────────────────────────────────── */

/** Lo que lleva un trazo a mano (cerrado con su primer punto): el % que el
 *  servidor le contaría, o null si todavía no es una forma (menos de tres
 *  puntos, o se cruza). */
export function llevaAMano(puntos: readonly Punto[], cara: CaraDePiezas): number | null {
  if (puntos.length < 3) return puntos.length === 0 ? 0 : null;
  const r = validarZona(puntos.map(([u, v]) => [u, v] as Punto), cara.ancho, cara.alto);
  if (r.codigo !== null || !r.vertices) return null;
  return dibujadoPb([r.vertices], cara.exclusiones);
}

export type EstadoDelContador = "lleva" | "justo" | "pasado";

/** El contador grande de «A mano»: cuánto lleva, de cuánto, y qué decir.
 *  `cerrada`: la forma ya está cerrada (se mira, no se dibuja): ahí no hay
 *  puntos que tocar ni mover; se achica, se lleva al % o se rehace. */
export function contadorAMano(lleva: number | null, de: number, cerrada = false): { estado: EstadoDelContador; titulo: string; texto: string; falta: number; sobra: number } {
  const l = lleva ?? 0;
  if (l > de) {
    return {
      estado: "pasado", titulo: "Te pasaste",
      texto: cerrada ? `Sobra ${pct(l - de)}: tocá «Achicar a ${pct(de)}» o «Rehacer a mano».`
        : `Sobra ${pct(l - de)}: sacá el último punto (Retroceso) o cerrala y tocá «Achicar a ${pct(de)}».`,
      falta: 0, sobra: l - de,
    };
  }
  if (l === de) return { estado: "justo", titulo: "Justo", texto: "Cerraste la forma con el % exacto.", falta: 0, sobra: 0 };
  return {
    estado: "lleva", titulo: "Llevás",
    texto: lleva === null ? "Así la forma se cruza: sacá el último punto (Retroceso)."
      : cerrada ? `Faltan ${pct(de - l)}: tocá «Llevar a ${pct(de)}» o «Rehacer a mano».`
        : `Faltan ${pct(de - l)}. Seguí tocando puntos; se pegan a los estantes, a los bordes y a la otra forma, y la línea punteada azul avisa cuando el lado va recto.`,
    falta: de - l, sobra: 0,
  };
}

/** Cuánto puede ir torcido el lado que se dibuja para que el imán lo deje
 *  recto: 7° (la tangente). */
const TORCIDO_MAX = Math.tan((7 * Math.PI) / 180);

/** Por dónde pasa cada pegada del imán: la línea vertical (u) y la
 *  horizontal (v) que se dibujan como guía, o null en el eje que quedó suelto. */
export interface GuiasDelIman { u: number | null; v: number | null }

/**
 * El imán de «A mano», por eje, con sus guías: cada coordenada se pega a la
 * línea más cercana (estante, borde de lo que se vende, parante, lado o
 * esquina de otra pieza) si cae a menos de `radio` (u,v). Así una L sale con
 * ángulos rectos y una forma empalma con la de al lado.
 *
 * Con el `trazo` en curso (el dueño, 2026-10-29: «intenté dejar el punto lo
 * más recto posible pero siempre queda diferente») también se pega a los
 * puntos ya puestos —el lado que cierra sale recto— y el lado que se está
 * dibujando, si va casi vertical u horizontal (menos de 7°), se endereza
 * aunque el punto quede lejos. `guias` dice por dónde pasó cada pegada, para
 * dibujarla mientras se apunta.
 */
export function imantarConGuias(p: Punto, lineas: { us: readonly number[]; vs: readonly number[] },
  radio: { u: number; v: number }, trazo: readonly Punto[] = []): { punto: Punto; guias: GuiasDelIman } {
  let u = pegar(p[0], [...lineas.us, ...trazo.map((t) => t[0])], radio.u);
  let v = pegar(p[1], [...lineas.vs, ...trazo.map((t) => t[1])], radio.v);
  const ultimo = trazo[trazo.length - 1];
  if (ultimo) {
    // En radios de cada eje: la misma escala que en la pantalla.
    const du = Math.abs(p[0] - ultimo[0]) / radio.u, dv = Math.abs(p[1] - ultimo[1]) / radio.v;
    if (u === null && dv > 0 && du <= TORCIDO_MAX * dv) u = ultimo[0];
    if (v === null && du > 0 && dv <= TORCIDO_MAX * du) v = ultimo[1];
  }
  const punto: Punto = [q(Math.min(1, Math.max(0, u ?? p[0]))), q(Math.min(1, Math.max(0, v ?? p[1])))];
  return { punto, guias: { u: u === null ? null : punto[0], v: v === null ? null : punto[1] } };
}

/** El punto de `imantarConGuias`, sin las guías. */
export function imantarAMano(p: Punto, lineas: { us: readonly number[]; vs: readonly number[] }, radio: { u: number; v: number },
  trazo: readonly Punto[] = []): Punto {
  return imantarConGuias(p, lineas, radio, trazo).punto;
}

/**
 * Dejar JUSTA una forma a mano corriendo UN lado: el lado recto (vertical u
 * horizontal) que no está pegado a ninguna línea —el que la persona puso a
 * ojo, como el brazo de una L— se corre hasta que el servidor diga exactamente
 * `pb`, lo menos posible (hasta `tope` en u,v), sin cruzarse y sin pisar a las
 * `otras` más de 1 cm². Los lados pegados a un estante, a un borde o a otra
 * pieza no se tocan. null si ningún lado alcanza (entonces «Achicar» o
 * seguir a mano).
 */
export function ajustarUnLado(P: readonly Punto[], cara: CaraDePiezas, pb: number, otras: readonly Poligono[],
  fijas: { us: readonly number[]; vs: readonly number[] }, tope = 0.3): Poligono | null {
  const E = cara.exclusiones;
  const util = areaUtil(E);
  const n = P.length;
  if (n < 3 || !(util > 0) || pb < 1 || pb > 10000) return null;
  const enLinea = (x: number, ls: readonly number[]) => ls.some((l) => Math.abs(l - x) < 1e-9);
  const m2 = cara.ancho * cara.alto;
  let mejor: { poly: Poligono; d: number } | null = null;
  for (let i = 0; i < n; i++) {
    const a = P[i], b = P[(i + 1) % n];
    if (!a || !b) continue;
    const vertical = a[0] === b[0] && !enLinea(a[0], fijas.us);
    const horizontal = a[1] === b[1] && !enLinea(a[1], fijas.vs);
    if (!vertical && !horizontal) continue;
    const eje: 0 | 1 = vertical ? 0 : 1;
    const c: number = eje === 0 ? a[0] : a[1];
    const j = (i + 1) % n;
    const armar = (x: number): Poligono => P.map((p, k) => (k === i || k === j
      ? (eje === 0 ? [x, p[1]] : [p[0], x]) : [p[0], p[1]]) as Punto);
    const crudo = (x: number) => (10000 * areaCubierta([armar(x)], E)) / util;
    const c0 = crudo(c);
    const sube = crudo(Math.min(1, c + 1e-3)) >= crudo(Math.max(0, c - 1e-3));
    const hacia = (c0 < pb) === sube ? 1 : -1;
    const lim = Math.min(1, Math.max(0, c + hacia * tope));
    if ((crudo(lim) - pb) * (c0 - pb) > 0) continue;            // corriéndolo no se llega
    let lo = c, hi = lim;
    for (let k = 0; k < 60; k++) {
      const mm = (lo + hi) / 2;
      if ((crudo(mm) - pb) * (c0 - pb) > 0) lo = mm; else hi = mm;
    }
    const x0 = q(hi);
    for (let k = 0; k <= 400; k++) {
      let listo = false;
      for (const sg of k === 0 ? [0] : [k, -k]) {
        const x = q(x0 + sg * PASO);
        if (x < 0 || x > 1) continue;
        const poly = armar(x);
        const v = validarZona(poly, cara.ancho, cara.alto);
        if (v.codigo !== null || !v.vertices || dibujadoPb([v.vertices], E) !== pb) continue;
        if (otras.length > 0 && areaCubierta([v.vertices], E, [...otras]) * m2 > AREA_MINIMA_M2) continue;
        const d = Math.abs(x - c);
        if (!mejor || d < mejor.d) mejor = { poly, d };
        listo = true;
        break;
      }
      if (listo) break;
    }
  }
  return mejor ? mejor.poly : null;
}

/**
 * Lo que dice el rótulo de una pieza (en la cara y en el 3D): justa, su %; si
 * no, lo que HAY y cuánto sobra o falta («42,42 % · sobra 12,42 %»). Antes
 * decía el contratado aunque lo dibujado fuera otra cosa.
 */
export function rotuloDeLoQueHay(pb: number, hay: number): { texto: string; justo: boolean } {
  if (hay === pb) return { texto: pct(pb), justo: true };
  if (hay > pb) return { texto: `${pct(hay)} · sobra ${pct(hay - pb)}`, justo: false };
  return { texto: `${pct(hay)} · faltan ${pct(pb - hay)}`, justo: false };
}

/** Cuánto puede faltar o sobrar al cerrar una forma a mano para que se deje
 *  justa SOLA (3 % de la cara): más que eso, lo decide la persona. */
export const AJUSTE_SOLO_PB = 300;

/**
 * Dejar justa una forma a mano: primero corriendo un lado que no esté pegado a
 * nada (`lineas`); si todos lo están, cualquier lado recto. null si no se
 * puede así (queda el contador y «Achicar»).
 */
export function dejarJustaAMano(P: readonly Punto[], cara: CaraDePiezas, pb: number, otras: readonly Poligono[],
  lineas: { us: readonly number[]; vs: readonly number[] }): Poligono | null {
  return ajustarUnLado(P, cara, pb, otras, lineas) ?? ajustarUnLado(P, cara, pb, otras, { us: [], vs: [] });
}

/** Las líneas de lo ocupado (los lados de las otras piezas), para el imán. */
export function lineasDeOcupados(ocupados: readonly Ocupado[]): { us: number[]; vs: number[] } {
  const us: number[] = [], vs: number[] = [];
  for (const o of ocupados) for (const p of o.poligonos) for (const [u, v] of p) { us.push(u); vs.push(v); }
  return { us, vs };
}

/** El tope de puntos de una forma a mano (el del servidor). */
export const PUNTOS_A_MANO = MAX_VERTICES;
