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
  if (o.hacia === "derecha") return resolverLado(cara, pb, (x) => ({ u0: u, v0, u1: x, v1 }), u, 1);
  return resolverLado(cara, pb, (x) => ({ u0: x, v0, u1: u, v1 }), u, 0);
}

/** El alto exacto: con el ancho [u0, u1] fijo, el lado de arriba (o el de
 *  abajo) se corre desde `v` hasta dar `pb`. */
export function altoExacto(cara: CaraDePiezas, pb: number, o: { u0: number; u1: number; v: number; hacia: "arriba" | "abajo" }): Rect | null {
  const v = q(o.v), u0 = q(o.u0), u1 = q(o.u1);
  if (o.hacia === "arriba") return resolverLado(cara, pb, (x) => ({ u0, v0: v, u1, v1: x }), v, 1);
  return resolverLado(cara, pb, (x) => ({ u0, v0: x, u1, v1: v }), v, 0);
}

/** Una franja de arriba a abajo (toda la altura de la cara: lo que no se
 *  vende arriba y abajo no cuenta) que arranca en `u` hacia la derecha, o que
 *  termina en `u` si va hacia la izquierda. */
export function franja(cara: CaraDePiezas, pb: number, u: number, hacia: "derecha" | "izquierda" = "derecha"): Rect | null {
  return anchoExacto(cara, pb, { v0: 0, v1: 1, u, hacia });
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
  // Los huecos van de borde a borde de la cara (lo que no se vende en los
  // costados no cuenta, pero la pieza lo cubre igual que una de verdad).
  const fuera: [number, number][] = [];
  let cur = 0;
  for (const [a, z] of tapas) {
    if (a > cur + EPS) fuera.push([cur, Math.min(a, 1)]);
    if (z > cur) cur = z;
    if (cur >= 1) break;
  }
  if (cur < 1 - EPS) fuera.push([cur, 1]);
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
    const v0 = o.altura?.v0 ?? 0, v1 = o.altura?.v1 ?? 1;
    const conAltura = (desde: number, hacia: "derecha" | "izquierda") => anchoExacto(cara, pb, { v0, v1, u: desde, hacia });
    const tanteo = conAltura(Math.max(0, Math.min(u, 1)), "derecha") ?? conAltura(Math.min(1, Math.max(u, 0)), "izquierda");
    if (!tanteo) return null;
    const w = tanteo.u1 - tanteo.u0;
    const enV = (v0 + v1) / 2;
    const hueco = huecosLibres(cara, ocupados, v0 <= 0 && v1 >= 1 ? undefined : enV).find(([a, z]) => a - radio <= u && u <= z + radio) ?? null;
    const bordesU = [...lineas.us];
    if (hueco) bordesU.push(hueco[0], hueco[1]);
    let r = conAltura(u - w / 2, "derecha");
    const izq = pegar(u - w / 2, bordesU, radio);
    const der = pegar(u + w / 2, bordesU, radio);
    if (hueco && (u - w / 2 < hueco[0] || izq === hueco[0])) r = conAltura(hueco[0], "derecha");
    else if (hueco && (u + w / 2 > hueco[1] || der === hueco[1])) r = conAltura(hueco[1], "izquierda");
    else if (izq !== null) r = conAltura(izq, "derecha");
    else if (der !== null) r = conAltura(der, "izquierda");
    if (!r || r.u1 > 1) r = conAltura(1, "izquierda") ?? r;
    if (r && r.u0 < 0) r = conAltura(0, "derecha") ?? r;
    return r;
  }
  // Estantes
  const hueco = huecosLibres(cara, ocupados, v).find(([a, z]) => a - radio <= u && u <= z + radio)
    ?? [0, 1] as [number, number];
  let ancho = o.ancho ?? (hueco[1] - hueco[0]);
  ancho = Math.min(Math.max(ancho, 0.02), 1);
  let u0 = u - ancho / 2;
  const izq = pegar(u0, [...lineas.us, hueco[0], hueco[1]], radio);
  const der = pegar(u0 + ancho, [...lineas.us, hueco[0], hueco[1]], radio);
  if (u0 < hueco[0] || izq === hueco[0]) u0 = hueco[0];
  else if (u0 + ancho > hueco[1] || der === hueco[1]) u0 = hueco[1] - ancho;
  else if (izq !== null) u0 = izq;
  else if (der !== null) u0 = der - ancho;
  u0 = Math.max(0, Math.min(u0, 1 - ancho));
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

/** El contador grande de «A mano»: cuánto lleva, de cuánto, y qué decir. */
export function contadorAMano(lleva: number | null, de: number): { estado: EstadoDelContador; titulo: string; texto: string; falta: number; sobra: number } {
  const l = lleva ?? 0;
  if (l > de) {
    return { estado: "pasado", titulo: "Te pasaste", texto: `Sobra ${pct(l - de)}: mové un punto hacia adentro o tocá «Achicar a ${pct(de)}».`, falta: 0, sobra: l - de };
  }
  if (l === de) return { estado: "justo", titulo: "Justo", texto: "Cerraste la forma con el % exacto.", falta: 0, sobra: 0 };
  return {
    estado: "lleva", titulo: "Llevás",
    texto: lleva === null ? "Así la forma se cruza: mové o sacá el último punto." : `Faltan ${pct(de - l)}. Seguí tocando puntos; se pegan a los estantes y a los bordes.`,
    falta: de - l, sobra: 0,
  };
}

/** El imán de «A mano», por eje: cada coordenada se pega a la línea más
 *  cercana (estante, borde de lo que se vende, parante o lado de otra pieza)
 *  si cae a menos de `radio` (u,v). Así una L sale con ángulos rectos. */
export function imantarAMano(p: Punto, lineas: { us: readonly number[]; vs: readonly number[] }, radio: { u: number; v: number }): Punto {
  const u = pegar(p[0], lineas.us, radio.u) ?? p[0];
  const v = pegar(p[1], lineas.vs, radio.v) ?? p[1];
  return [q(Math.min(1, Math.max(0, u))), q(Math.min(1, Math.max(0, v)))];
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
