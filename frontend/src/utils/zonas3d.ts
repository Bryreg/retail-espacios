/**
 * Las zonas de una cara en el 3D: dónde se montan, qué forma tiene cada una y
 * qué punto de la cara toca un clic (§8.2 y §10.3 del diseño de
 * participaciones). Puro: sin three, sin React; lo prueba
 * `probar-superficies.mjs` armando con three la misma jerarquía de grupos que
 * va a montar la escena.
 *
 * ── El marco ─────────────────────────────────────────────────────────────────
 *
 * El del `<group>` del mueble: origen en el centro de la huella, en el piso,
 * `y` arriba y el frente hacia −z (la cara B de una góndola doble mira a +z).
 * u = 0 es el borde IZQUIERDO de quien mira la cara de frente; v = 0, abajo
 * (en la tapa de la zona libre, el borde delantero). El robatope dibuja en el
 * marco de sus repisas, girado `giroX` alrededor de X con el pivote en el
 * origen del mueble: ahí va un grupo de afuera con ese giro y, adentro, el de
 * la cara. En los demás tipos `giroX = 0` y el grupo de afuera no se monta.
 *
 * | Cara        | Punto (x, y, z) en el marco de la superficie | Forma (sx, sy)            | position      | rotation    |
 * |-------------|----------------------------------------------|---------------------------|---------------|-------------|
 * | A (frente)  | ((0,5 − u)·W, v·H, −plano)                   | ((u − 0,5)·W, v·H)        | [0, 0, −plano]| [0, π, 0]   |
 * | B (frente)  | ((u − 0,5)·W, v·H, +plano)                   | ((u − 0,5)·W, v·H)        | [0, 0, +plano]| [0, 0, 0]   |
 * | A (arriba)  | ((0,5 − u)·W, plano, −D/2 + v·D)             | ((0,5 − u)·W, (0,5 − v)·D)| [0, plano, 0] | [−π/2, 0, 0]|
 *
 * (`ShapeGeometry` mira a +z de su forma y la invierte sola si viene horaria:
 * con esa rotación la cara visible da siempre hacia quien mira.)
 */
import type { Superficie } from "./superficie";
import type { Poligono, Punto } from "./zonasGeometria";

export type V3 = [number, number, number];

/** La tolerancia de un clic alrededor de la cara, EN METROS (en u,v
 *  normalizados eran 2,6 mm en la ristra y 6 cm en una góndola de 3 m). */
export const TOLERANCIA_DEL_CLIC_M = 0.02;
/** Cuánto por encima del borde de arriba va la letra «A»/«B». */
export const ALTO_DE_LA_LETRA = 0.06;

type Cara = "A" | "B";

/** Rx(θ) aplicado a un vector: el giro de las repisas del robatope. */
function girarX([x, y, z]: V3, t: number): V3 {
  if (t === 0) return [x, y, z];
  const c = Math.cos(t), s = Math.sin(t);
  return [x, y * c - z * s, y * s + z * c];
}

/**
 * Cómo se montan las zonas de una cara: `giro` es la rotación del grupo de
 * afuera (sólo el robatope; `null` = no se monta) y `position`/`rotation`, las
 * del grupo de la cara, adentro. Todo en el marco del mueble.
 */
export function transformDeCara(sup: Superficie, cara: Cara):
  { giro: V3 | null; position: V3; rotation: V3 } {
  const giro: V3 | null = sup.giroX !== 0 ? [sup.giroX, 0, 0] : null;
  if (sup.orientacion === "arriba") return { giro, position: [0, sup.plano, 0], rotation: [-Math.PI / 2, 0, 0] };
  if (cara === "B") return { giro, position: [0, 0, sup.plano], rotation: [0, 0, 0] };
  return { giro, position: [0, 0, -sup.plano], rotation: [0, Math.PI, 0] };
}

/** La forma 2D (sx, sy) de una zona para `ShapeGeometry`, en metros (§8.2):
 *  los vértices en el plano del grupo de la cara. */
export function formaDeZona(sup: Superficie, _cara: Cara, p: Poligono): [number, number][] {
  const W = sup.ancho, H = sup.alto;
  const fuera: [number, number][] = [];
  if (sup.orientacion === "arriba") {
    for (const [u, v] of p) fuera.push([(0.5 - u) * W, (0.5 - v) * H]);
  } else {
    for (const [u, v] of p) fuera.push([(u - 0.5) * W, v * H]);
  }
  return fuera;
}

/** Un punto (u, v) de la cara, en el marco del MUEBLE (con el giro del
 *  robatope ya aplicado). Es lo que dibuja la escena con `transformDeCara` y
 *  `formaDeZona`; sirve para encuadrar y para probar. */
export function puntoDeLaCara(sup: Superficie, cara: Cara, u: number, v: number): V3 {
  const W = sup.ancho, H = sup.alto;
  let p: V3;
  if (sup.orientacion === "arriba") p = [(0.5 - u) * W, sup.plano, -H / 2 + v * H];
  else if (cara === "B") p = [(u - 0.5) * W, v * H, sup.plano];
  else p = [(0.5 - u) * W, v * H, -sup.plano];
  return girarX(p, sup.giroX);
}

const enLaCara = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/**
 * Qué cara y qué punto (u, v) toca un rayo, en el marco del mueble (el
 * llamador lo lleva ahí con la inversa de la matriz del grupo del mueble).
 * Rayo contra plano, nunca contra las mallas de las zonas: para cada cara se
 * lleva el rayo al marco de la superficie (la inversa del giro del robatope),
 * se corta con su plano —A en z = −plano, viniendo de −z; B en z = +plano,
 * viniendo de +z; la tapa en y = plano, viniendo de arriba— y vale si cae
 * dentro del rectángulo de la cara con 2 cm de tolerancia en metros (u y v se
 * recortan a [0,1]). Gana el corte más cercano; `null` si no toca ninguna.
 */
export function elegirCaraYPunto(rayo: { origen: V3; dir: V3 }, caras: { A?: Superficie | null; B?: Superficie | null }):
  { cara: Cara; u: number; v: number } | null {
  const r = corteConLaCara(rayo, caras);
  return r && { cara: r.cara, u: r.u, v: r.v };
}

/**
 * Lo mismo que `elegirCaraYPunto`, con `t`: a qué distancia del origen (en
 * las unidades de `dir`; con `dir` normalizado y el marco del mueble rígido,
 * en metros del mundo) corta el rayo la cara. Con eso se sabe si algo lo
 * corta ANTES (`rayoTapado`).
 */
export function corteConLaCara(rayo: { origen: V3; dir: V3 }, caras: { A?: Superficie | null; B?: Superficie | null }):
  { cara: Cara; u: number; v: number; t: number } | null {
  let mejor: { t: number; cara: Cara; u: number; v: number } | null = null;
  const tol = TOLERANCIA_DEL_CLIC_M;
  for (const cara of ["A", "B"] as const) {
    const sup = caras[cara];
    if (!sup) continue;
    const W = sup.ancho, H = sup.alto;
    const o = girarX(rayo.origen, -sup.giroX);
    const d = girarX(rayo.dir, -sup.giroX);
    let t: number, u: number, v: number, adentro: boolean;
    if (sup.orientacion === "arriba") {
      if (!(d[1] < 0)) continue;
      t = (sup.plano - o[1]) / d[1];
      if (!(t > 0)) continue;
      const x = o[0] + t * d[0], z = o[2] + t * d[2];
      adentro = Math.abs(x) <= W / 2 + tol && Math.abs(z) <= H / 2 + tol;
      u = 0.5 - x / W; v = (z + H / 2) / H;
    } else {
      const plano = cara === "A" ? -sup.plano : sup.plano;
      if (cara === "A" ? !(d[2] > 0) : !(d[2] < 0)) continue;
      t = (plano - o[2]) / d[2];
      if (!(t > 0)) continue;
      const x = o[0] + t * d[0], y = o[1] + t * d[1];
      adentro = Math.abs(x) <= W / 2 + tol && y >= -tol && y <= H + tol;
      u = cara === "A" ? 0.5 - x / W : 0.5 + x / W;
      v = y / H;
    }
    if (!adentro) continue;
    if (mejor === null || t < mejor.t) mejor = { t, cara, u: enLaCara(u), v: enLaCara(v) };
  }
  return mejor;
}

/**
 * Dónde corta el rayo el plano de ESA cara, en u,v SIN recortar y sin mirar
 * el rectángulo de la cara: es para ARRASTRAR («Editar en el 3D»), que sigue
 * al puntero más allá del borde (el reductor recorta). `corteConLaCara` es
 * para empezar un gesto: recorta y descarta lo que cae a más de 2 cm. Rayo en
 * el marco del mueble; se lleva al marco girado del robatope como en
 * `corteConLaCara`. `null` si el rayo es paralelo, va hacia atrás o llega por
 * la espalda de la cara (A sólo desde −z, B desde +z, la tapa desde arriba).
 */
export function uvEnElPlano(rayo: { origen: V3; dir: V3 }, sup: Superficie, cara: Cara): { u: number; v: number; t: number } | null {
  const W = sup.ancho, H = sup.alto;
  const o = girarX(rayo.origen, -sup.giroX);
  const d = girarX(rayo.dir, -sup.giroX);
  if (sup.orientacion === "arriba") {
    if (!(d[1] < 0)) return null;
    const t = (sup.plano - o[1]) / d[1];
    if (!(t > 0)) return null;
    const x = o[0] + t * d[0], z = o[2] + t * d[2];
    return { u: 0.5 - x / W, v: (z + H / 2) / H, t };
  }
  const plano = cara === "A" ? -sup.plano : sup.plano;
  if (cara === "A" ? !(d[2] > 0) : !(d[2] < 0)) return null;
  const t = (plano - o[2]) / d[2];
  if (!(t > 0)) return null;
  const x = o[0] + t * d[0], y = o[1] + t * d[1];
  return { u: cara === "A" ? 0.5 - x / W : 0.5 + x / W, v: y / H, t };
}

/**
 * El radio del imán en u,v que mide `px` píxeles de pantalla alrededor de p:
 * la escala local de la proyección, por diferencias finitas en u y en v (en
 * tres cuartos u se achica y v no, y el radio se agranda en el eje que se
 * achica). `aPantalla` lleva un punto de la cara a píxeles. `null` si la
 * proyección no sirve (detrás de la cámara, o degenerada).
 */
export function radioEnLaCara(aPantalla: (p: Punto) => { x: number; y: number } | null, p: Punto, px: number):
  { u: number; v: number } | null {
  const h = 1e-3;
  const a = aPantalla(p), bu = aPantalla([p[0] + h, p[1]]), bv = aPantalla([p[0], p[1] + h]);
  if (!a || !bu || !bv) return null;
  const su = Math.hypot(bu.x - a.x, bu.y - a.y) / h, sv = Math.hypot(bv.x - a.x, bv.y - a.y) / h;
  if (!(su > 0) || !(sv > 0) || !Number.isFinite(su) || !Number.isFinite(sv)) return null;
  return { u: px / su, v: px / sv };
}

/** Un mueble del plano como caja: centro de la huella en el piso, medidas y
 *  giro (el de su `<group>`). */
export interface CajaDeMueble { x: number; z: number; w: number; d: number; h: number; rotY?: number }

/**
 * ¿Algún OTRO mueble corta el rayo antes de `hasta`? Rayo y muebles en el
 * marco del mundo. Cada mueble es su caja real (la huella `w × d` girada
 * `rotY`, del piso a `h`), sin el margen de su volumen de toque. En
 * Distribución los volúmenes de toque de los vecinos no reciben el rayo (si
 * lo recibieran, R3F le daría el clic al vecino y se perdería el del mueble
 * distribuido, que mide +8 cm), así que nada tapaba al mueble: un clic sobre
 * la góndola que se ve delante elegía la cara de atrás del mueble
 * distribuido —y cambiaba de cara— (revisión final, escena-uso). Con esto el
 * editor descarta ese clic. Un rayo que nace adentro de una caja no cuenta
 * esa caja (se ve a través de ella: sus caras dan la espalda).
 */
export function rayoTapado(rayo: { origen: V3; dir: V3 }, hasta: number, muebles: readonly CajaDeMueble[]): boolean {
  const [ox, oy, oz] = rayo.origen, [dx, dy, dz] = rayo.dir;
  for (const m of muebles) {
    const r = m.rotY ?? 0, c = Math.cos(r), s = Math.sin(r);
    // Al marco del mueble: R_y(−rotY)·(p − centro).
    const px = ox - m.x, pz = oz - m.z;
    const o: V3 = [px * c - pz * s, oy, px * s + pz * c];
    const d: V3 = [dx * c - dz * s, dy, dx * s + dz * c];
    const min: V3 = [-m.w / 2, 0, -m.d / 2], max: V3 = [m.w / 2, m.h, m.d / 2];
    let t0 = -Infinity, t1 = Infinity, fuera = false;
    for (let i = 0; i < 3; i++) {
      if (Math.abs(d[i]) < 1e-12) {
        if (o[i] < min[i] || o[i] > max[i]) { fuera = true; break; }
        continue;
      }
      let ta = (min[i] - o[i]) / d[i], tb = (max[i] - o[i]) / d[i];
      if (ta > tb) [ta, tb] = [tb, ta];
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1) { fuera = true; break; }
    }
    if (fuera) continue;
    if (t0 >= 0 && t0 < hasta - 1e-6) return true;
  }
  return false;
}

/** Cuánto se achica el cuerpo para decidir si tapa la letra: rozar un canto
 *  no la tapa. */
const ROCE_M = 0.005;

/**
 * La letra de una cara queda TAPADA por el mueble: el segmento de la cámara a
 * la letra pasa por adentro del cuerpo que hay entre las dos caras (en los
 * frentes, |x| < ancho/2, 0 < y < alto, |z| < plano, en el marco girado de la
 * superficie). El `Html` de drei se dibuja encima del lienzo y no sabe de
 * profundidad: sin esto la letra de la cara de atrás se veía a través del
 * mueble (verificación del paso 6a). Mirando desde arriba, por encima del
 * mueble, la de atrás se ve, como se vería de verdad. La tapa (zona libre)
 * tiene una sola cara: nada que tapar. `camara` y `letra`, en el marco del
 * mueble.
 */
export function letraTapada(sup: Superficie, camara: V3, letra: V3): boolean {
  if (sup.orientacion === "arriba") return false;
  const a = girarX(camara, -sup.giroX), b = girarX(letra, -sup.giroX);
  const min: V3 = [-sup.ancho / 2 + ROCE_M, ROCE_M, -sup.plano + ROCE_M];
  const max: V3 = [sup.ancho / 2 - ROCE_M, sup.alto - ROCE_M, sup.plano - ROCE_M];
  let t0 = 0, t1 = 1;
  for (let i = 0; i < 3; i++) {
    const d = b[i] - a[i];
    if (Math.abs(d) < 1e-12) {
      if (a[i] <= min[i] || a[i] >= max[i]) return false;
      continue;
    }
    let ta = (min[i] - a[i]) / d, tb = (max[i] - a[i]) / d;
    if (ta > tb) [ta, tb] = [tb, ta];
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 >= t1) return false;
  }
  return true;
}

/** Cuánto más cerca que el borde hay que volver para que los rótulos de las
 *  zonas reaparezcan (sin titileo en el borde). */
export const HISTERESIS_DE_LEJOS_M = 1;

/**
 * ¿Las zonas siguen LEJOS de la cámara? Se apagan al pasar `maxima` y
 * vuelven al acercarse `HISTERESIS_DE_LEJOS_M` más: con un solo borde, una
 * órbita que roza los 40 m montaba y desmontaba los rótulos `Html` en cada
 * cuadro. `antes`, lo que se decidió el cuadro anterior.
 */
export function sigueLejos(antes: boolean, distancia: number, maxima: number, histeresis = HISTERESIS_DE_LEJOS_M): boolean {
  return antes ? distancia > maxima - histeresis : distancia > maxima;
}

/** Dónde va la letra «A»/«B» de la cara, en el marco del mueble: arriba al
 *  centro, sobre el plano del dibujo (en la tapa, sobre su borde delantero). */
export function letraDeCara(sup: Superficie, cara: Cara): V3 {
  if (sup.orientacion === "arriba") return girarX([0, sup.plano + ALTO_DE_LA_LETRA, -sup.alto / 2], sup.giroX);
  const p: V3 = [0, sup.alto + ALTO_DE_LA_LETRA, cara === "B" ? sup.plano : -sup.plano];
  return girarX(p, sup.giroX);
}
