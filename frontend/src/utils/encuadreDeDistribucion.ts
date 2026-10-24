/**
 * El encuadre del 3D al entrar en Distribución (o con «Encuadrar esta cara»):
 * la cara ENTERA en el panel partido. Puro, sin three ni React; lo prueba
 * `probar-superficies.mjs` con el aspecto del panel partido.
 *
 * La toma «De frente» del editor (`vistaDeVenta`) se aleja lo que hace falta
 * para que la cara entre a lo ancho, pero nunca más de lo que deja el pasillo.
 * En Distribución el 3D ocupa la mitad del área (≈ 560 px de ancho a
 * 1440 × 900): una góndola de 3 m frente al borde del salón (2,5 m de
 * pasillo, GON-01·A del recorrido) se veía al 54 % del ancho y la zona de la
 * participación 1 quedaba fuera de cuadro (revisión final, recorrido I.5).
 * Alejarse no se puede y abrir el campo visual estira la cara; lo que se
 * hace es GIRAR: si de frente no entra, la toma en tres cuartos menos oblicua
 * que la abarca entera desde donde se puede parar alguien. Si ninguna la
 * abarca, la que muestra más.
 *
 * El aspecto es el del lienzo DESPUÉS del redimensionado (el que llega con
 * cada cambio de tamaño: la escena vuelve a encuadrar si la cámara sigue
 * donde la dejó la toma), y el campo visual horizontal sale de él.
 *
 * Fase 2 (2026-10-19), tres cosas que la revisión dejó abiertas:
 *  · el tres cuartos CENTRA la cara en el cuadro (`centrarLaMira`): mirando
 *    al centro de la cara, en oblicuo el extremo cercano se agranda y quedaba
 *    pegado a un borde (GON-01·A, de −0,93 a +0,47) con un cuarto de cuadro
 *    vacío del otro lado;
 *  · con eso una cara de 6 m frente a un pasillo de 2,5 m entra entera (`ocupa`
 *    y `entera` se cuentan después de centrar): «no entra desde ningún lado»
 *    era inexacto;
 *  · lo que tapa: con los muebles de la sala (`cajas`), una toma con una
 *    esquina de la cara detrás de una estiba o un exhibidor del pasillo no
 *    cuenta como que entra (lo tapado no se toca en el 3D: `rayoTapado`).
 */
import { ALTURA_PISABLE, chocaEn, distanciaLibre, normalDeCara, proyectar, vistaDeVenta, type Caja, type Vista3D } from "./planta";
import { rayoTapado, type CajaDeMueble } from "./zonas3d";

/** Hasta dónde del cuadro (±1 es el borde) tiene que caer la cara: con aire. */
export const BORDE_DEL_ENCUADRE = 0.94;
/** El aire de arriba que «Distribuir» le pide a la toma (m): la letra de la
 *  cara (A/B) va 6 cm arriba del mueble y, con su círculo, quedaba cortada en
 *  el borde de la miniatura y del 3D en grande (corrección tras la ronda de
 *  prueba, 2026-10-24). */
export const AIRE_DE_LA_LETRA_M = 0.22;
/** Los giros del tres cuartos que se prueban, del menos al más oblicuo. */
export const GIROS_DEL_TRES_CUARTOS: readonly number[] = [30, 35, 40, 45, 50, 55, 60, 65, 70];
/** La subida mínima de la cámara por metro de distancia: el rango polar de
 *  los controles (la misma cuenta que `vistaDeVenta`, `planta.ts`). Por
 *  debajo, los controles la corrigen solos y la toma sale otra. */
const SUBIDA_MINIMA = Math.tan(Math.PI / 2 - Math.PI / 2.1) * 1.08;
const PASO_M = 0.05;
const DISTANCIA_MINIMA_M = 0.9;

export interface MuebleDelEncuadre { cx: number; cz: number; w: number; d: number; h: number; rotY?: number }
type Punto3 = { x: number; y: number; z: number };

/** Las esquinas que tienen que entrar: las de la cara (en su plano, del piso
 *  al alto del mueble) y, en un mueble bajo que se dibuja por arriba (el
 *  metro, la zona libre), las de su tapa. */
export function esquinasDeLaCara(m: MuebleDelEncuadre, cara: "A" | "B"): Punto3[] {
  const n = normalDeCara(m.rotY ?? 0, cara), t = { x: -n.z, z: n.x };
  const fuera: Punto3[] = [];
  for (const lado of [-1, 1]) {
    for (const y of [0, m.h]) {
      fuera.push({ x: m.cx + (n.x * m.d) / 2 + (t.x * lado * m.w) / 2, y, z: m.cz + (n.z * m.d) / 2 + (t.z * lado * m.w) / 2 });
    }
  }
  if (m.h < ALTURA_PISABLE) {
    for (const lado of [-1, 1]) {
      fuera.push({ x: m.cx - (n.x * m.d) / 2 + (t.x * lado * m.w) / 2, y: m.h, z: m.cz - (n.z * m.d) / 2 + (t.z * lado * m.w) / 2 });
    }
  }
  return fuera;
}

/** Cuánto del cuadro ocupa lo que tiene que entrar: el mayor |x| o |y|
 *  normalizado de sus puntos (1 es el borde); infinito si alguno queda
 *  detrás de la cámara. */
export function cuantoOcupa(v: Vista3D, fovGrados: number, aspecto: number, puntos: readonly Punto3[]): number {
  let peor = 0;
  for (const p of puntos) {
    const q = proyectar(v, fovGrados, aspecto, p);
    if (!(q.profundidad > 0)) return Infinity;
    peor = Math.max(peor, Math.abs(q.x), Math.abs(q.y));
  }
  return peor;
}

export interface EncuadreDeLaCara {
  vista: Vista3D;
  toma: "frente" | "tres_cuartos";
  /** ¿La cara entra entera (dentro de `BORDE_DEL_ENCUADRE`)? */
  entera: boolean;
  /** Lo que ocupa del cuadro (`cuantoOcupa`). */
  ocupa: number;
  /** El giro del tres cuartos, en grados (0 de frente). */
  giro: number;
}

/** ¿Algún mueble de la sala tapa alguna esquina de la cara vista desde la
 *  cámara de `v`? El rayo de la cámara a cada esquina, contra las cajas reales
 *  de los demás muebles (`rayoTapado`, la misma cuenta que descarta el clic),
 *  hasta 2 cm antes de la esquina. Sin cajas, nada tapa. */
export function esquinaTapada(v: Vista3D, esquinas: readonly Punto3[], cajas: readonly CajaDeMueble[]): boolean {
  if (cajas.length === 0) return false;
  for (const p of esquinas) {
    const d: [number, number, number] = [p.x - v.posX, p.y - v.posY, p.z - v.posZ];
    const largo = Math.hypot(d[0], d[1], d[2]);
    if (!(largo > 0.02)) continue;
    if (rayoTapado({ origen: [v.posX, v.posY, v.posZ], dir: [d[0] / largo, d[1] / largo, d[2] / largo] }, largo - 0.02, cajas)) return true;
  }
  return false;
}

/**
 * La misma toma con la cara CENTRADA a lo ancho del cuadro: la cámara no se
 * mueve; gira sobre sí misma lo justo para que los extremos de la cara queden
 * a la misma distancia de los dos bordes. Mirando al centro de la cara, en un
 * tres cuartos el extremo cercano se agranda y quedaba pegado a un borde
 * (GON-01·A a 560 × 720: de −0,93 a +0,47, con un cuarto del cuadro vacío del
 * otro lado); centrada, de −0,70 a +0,70.
 *
 * Primero la bisectriz horizontal de los rayos a las esquinas; después se
 * afina en el cuadro (por bisección), porque la inclinación de la cámara
 * corre un poco las esquinas de arriba respecto de las de abajo. La mira se
 * corre sólo de costado, a la misma distancia y a la misma altura: la
 * inclinación y el radio de la órbita son los de la toma de partida, así que
 * el rango polar de los controles no la corrige y la órbita sigue girando
 * alrededor del mueble. Correrla hasta el plano de la cara la acercaba a la
 * cámara y la inclinaba más (una góndola de 5 m pasaba a mirarse desde menos
 * de 5 m de la mira). No acerca la cámara: volvería a dejar las dos puntas en
 * el borde.
 */
export function centrarLaMira(
  vista: Vista3D, esquinas: readonly Punto3[], fovGrados: number, aspecto: number,
): Vista3D {
  const dx = vista.targetX - vista.posX, dz = vista.targetZ - vista.posZ;
  const d = Math.hypot(dx, dz);
  if (!(d > 1e-9) || esquinas.length === 0) return vista;
  const a0 = Math.atan2(dz, dx);
  const girada = (phi: number): Vista3D => ({
    ...vista, targetX: vista.posX + Math.cos(a0 + phi) * d, targetZ: vista.posZ + Math.sin(a0 + phi) * d,
  });
  const envolver = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
  // La bisectriz horizontal de los rayos extremos.
  let menor = Infinity, mayor = -Infinity;
  for (const p of esquinas) {
    const a = envolver(Math.atan2(p.z - vista.posZ, p.x - vista.posX) - a0);
    if (a < menor) menor = a;
    if (a > mayor) mayor = a;
  }
  let phi = (menor + mayor) / 2;
  // Afinada en el cuadro: la cara queda centrada cuando el x de más a la
  // izquierda y el de más a la derecha suman cero.
  const desvio = (giro: number): number => {
    const v = girada(giro);
    let xMin = Infinity, xMax = -Infinity;
    for (const p of esquinas) {
      const q = proyectar(v, fovGrados, aspecto, p);
      if (!(q.profundidad > 0)) return NaN;
      if (q.x < xMin) xMin = q.x;
      if (q.x > xMax) xMax = q.x;
    }
    return xMin + xMax;
  };
  let lo = phi - 0.15, hi = phi + 0.15;
  let fLo = desvio(lo);
  const fHi = desvio(hi);
  if (Number.isFinite(fLo) && Number.isFinite(fHi) && fLo * fHi < 0) {
    for (let k = 0; k < 40; k++) {
      const medio = (lo + hi) / 2, fMedio = desvio(medio);
      if (!Number.isFinite(fMedio)) break;
      if ((fMedio < 0) === (fLo < 0)) { lo = medio; fLo = fMedio; } else hi = medio;
    }
    phi = (lo + hi) / 2;
  }
  return girada(phi);
}

/**
 * La toma que abarca la cara entera: de frente si entra (la de siempre,
 * `vistaDeVenta`); si no, el tres cuartos de menor giro que la abarca, lo más
 * cerca que se pueda (la cara más grande en el cuadro), dentro del pasillo y
 * del salón y fuera de los muebles (`obstaculos`, ya inflados por el cuerpo:
 * `murosDeCaminata`). Con la cámara a la altura de un comprador, como la de
 * frente. El tres cuartos sale centrado (`centrarLaMira`) y lo que ocupa —y si
 * entra entera— se cuenta ya centrado: una cara de 6 m frente a un pasillo de
 * 2,5 m entra (hasta ~8 m); más larga, la toma que muestra más.
 *
 * `cajas`: los OTROS muebles de la sala con su caja real, lo mismo que mira el
 * clic (`rayoTapado`). Una toma con una esquina de la cara tapada no cuenta
 * como que entra: se deja ese lado y se prueba el otro o el giro siguiente
 * (también «De frente»). Sin cajas, como antes de mirar lo que tapa.
 */
export function encuadreDeLaCara(
  mueble: MuebleDelEncuadre,
  cara: "A" | "B",
  obstaculos: Caja[],
  limites: Caja,
  fovGrados: number,
  aspecto: number,
  cajas: readonly CajaDeMueble[] = [],
  aire = 0,
): EncuadreDeLaCara {
  // `aire`: lo que tiene que entrar arriba de la cara (la letra), en metros.
  // Lo tapado se sigue mirando sólo en las esquinas de la cara.
  const deLaCara = esquinasDeLaCara(mueble, cara);
  // La letra va al medio de la cara, arriba: entra ese punto (no todo el
  // borde de arriba más alto, que en un pasillo angosto llevaba a una toma
  // mucho más oblicua).
  const arriba = deLaCara.filter((p) => p.y === mueble.h);
  const letra = aire > 0 && arriba.length >= 2
    ? [{ x: (arriba[0].x + arriba[1].x) / 2, y: mueble.h + aire, z: (arriba[0].z + arriba[1].z) / 2 }]
    : [];
  const esquinas = [...deLaCara, ...letra];
  const frente = vistaDeVenta(mueble, cara, "frente", { yBajo: 0, yAlto: mueble.h + aire / 2 }, obstaculos, limites, fovGrados, aspecto);
  const ocupaFrente = cuantoOcupa(frente, fovGrados, aspecto, esquinas);
  if (ocupaFrente <= BORDE_DEL_ENCUADRE && !esquinaTapada(frente, deLaCara, cajas)) {
    return { vista: frente, toma: "frente", entera: true, ocupa: ocupaFrente, giro: 0 };
  }

  const n = normalDeCara(mueble.rotY ?? 0, cara);
  const centro = { x: mueble.cx + (n.x * mueble.d) / 2, z: mueble.cz + (n.z * mueble.d) / 2 };
  /** El tres cuartos elegido, centrado; lo que ocupa y si entra, contados
   *  después de centrar. Si centrado mostrara menos (la cámara no se mueve:
   *  no debería), queda el de partida. */
  const centrar = (e: EncuadreDeLaCara): EncuadreDeLaCara => {
    const vista = centrarLaMira(e.vista, esquinas, fovGrados, aspecto);
    const ocupa = cuantoOcupa(vista, fovGrados, aspecto, esquinas);
    if (!(ocupa <= e.ocupa) && !(ocupa <= BORDE_DEL_ENCUADRE)) return e;
    return { ...e, vista, ocupa, entera: ocupa <= BORDE_DEL_ENCUADRE };
  };
  const mira = mueble.h / 2;
  const yCamara = Math.min(1.6, Math.max(1.2, mira + 0.35));
  const vistaDesde = (x: number, z: number): Vista3D => {
    const dist = Math.hypot(x - centro.x, z - centro.z);
    const posY = Math.max(yCamara, mira + 0.05, mira + SUBIDA_MINIMA * dist);
    return { posX: x, posY, posZ: z, targetX: centro.x, targetY: mira, targetZ: centro.z };
  };
  const adentro = (x: number, z: number) => x > limites.minX && x < limites.maxX && z > limites.minZ && z < limites.maxZ;

  // Si nada la abarca, la que muestra más (de frente incluida: con una esquina
  // tapada puede entrar y no ser la elegida).
  let mejor: EncuadreDeLaCara = { vista: frente, toma: "frente", entera: ocupaFrente <= BORDE_DEL_ENCUADRE, ocupa: ocupaFrente, giro: 0 };
  for (const giro of GIROS_DEL_TRES_CUARTOS) {
    let entra: (EncuadreDeLaCara & { dist: number }) | null = null;
    for (const signo of [1, -1]) {
      const a = (signo * giro * Math.PI) / 180;
      const dir = { x: n.x * Math.cos(a) - n.z * Math.sin(a), z: n.x * Math.sin(a) + n.z * Math.cos(a) };
      const libre = distanciaLibre(centro, dir, obstaculos, limites);
      for (let dist = DISTANCIA_MINIMA_M; dist <= libre + 1e-9; dist += PASO_M) {
        const x = centro.x + dir.x * dist, z = centro.z + dir.z * dist;
        if (!adentro(x, z) || chocaEn(obstaculos, x, z)) break;
        const vista = vistaDesde(x, z);
        const ocupa = cuantoOcupa(vista, fovGrados, aspecto, esquinas);
        if (ocupa < mejor.ocupa) mejor = { vista, toma: "tres_cuartos", entera: false, ocupa, giro: signo * giro };
        if (ocupa <= BORDE_DEL_ENCUADRE) {
          // Con una esquina tapada, desde más lejos en la misma dirección lo
          // que tapa sigue en el medio: se deja este lado.
          if (esquinaTapada(vista, deLaCara, cajas)) break;
          // Lo más cerca que entra (la cara más grande), del lado que sea.
          if (!entra || dist < entra.dist) entra = { vista, toma: "tres_cuartos", entera: true, ocupa, giro: signo * giro, dist };
          break;
        }
      }
    }
    if (entra) return centrar({ vista: entra.vista, toma: entra.toma, entera: true, ocupa: entra.ocupa, giro: entra.giro });
  }
  return mejor.toma === "tres_cuartos" ? centrar(mejor) : mejor;
}
