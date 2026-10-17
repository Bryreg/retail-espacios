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
 */
import { ALTURA_PISABLE, chocaEn, distanciaLibre, normalDeCara, proyectar, vistaDeVenta, type Caja, type Vista3D } from "./planta";

/** Hasta dónde del cuadro (±1 es el borde) tiene que caer la cara: con aire. */
export const BORDE_DEL_ENCUADRE = 0.94;
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

/**
 * La toma que abarca la cara entera: de frente si entra (la de siempre,
 * `vistaDeVenta`); si no, el tres cuartos de menor giro que la abarca, lo más
 * cerca que se pueda (la cara más grande en el cuadro), dentro del pasillo y
 * del salón y fuera de los muebles (`obstaculos`, ya inflados por el cuerpo:
 * `murosDeCaminata`). Mira al centro de la cara a media altura, con la cámara
 * a la altura de un comprador, como la de frente.
 */
export function encuadreDeLaCara(
  mueble: MuebleDelEncuadre,
  cara: "A" | "B",
  obstaculos: Caja[],
  limites: Caja,
  fovGrados: number,
  aspecto: number,
): EncuadreDeLaCara {
  const esquinas = esquinasDeLaCara(mueble, cara);
  const frente = vistaDeVenta(mueble, cara, "frente", { yBajo: 0, yAlto: mueble.h }, obstaculos, limites, fovGrados, aspecto);
  const ocupaFrente = cuantoOcupa(frente, fovGrados, aspecto, esquinas);
  if (ocupaFrente <= BORDE_DEL_ENCUADRE) return { vista: frente, toma: "frente", entera: true, ocupa: ocupaFrente, giro: 0 };

  const n = normalDeCara(mueble.rotY ?? 0, cara);
  const centro = { x: mueble.cx + (n.x * mueble.d) / 2, z: mueble.cz + (n.z * mueble.d) / 2 };
  const mira = mueble.h / 2;
  const yCamara = Math.min(1.6, Math.max(1.2, mira + 0.35));
  const vistaDesde = (x: number, z: number): Vista3D => {
    const dist = Math.hypot(x - centro.x, z - centro.z);
    const posY = Math.max(yCamara, mira + 0.05, mira + SUBIDA_MINIMA * dist);
    return { posX: x, posY, posZ: z, targetX: centro.x, targetY: mira, targetZ: centro.z };
  };
  const adentro = (x: number, z: number) => x > limites.minX && x < limites.maxX && z > limites.minZ && z < limites.maxZ;

  // Si nada la abarca, la que muestra más (de frente incluida).
  let mejor: EncuadreDeLaCara = { vista: frente, toma: "frente", entera: false, ocupa: ocupaFrente, giro: 0 };
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
          // Lo más cerca que entra (la cara más grande), del lado que sea.
          if (!entra || dist < entra.dist) entra = { vista, toma: "tres_cuartos", entera: true, ocupa, giro: signo * giro, dist };
          break;
        }
      }
    }
    if (entra) return { vista: entra.vista, toma: entra.toma, entera: true, ocupa: entra.ocupa, giro: entra.giro };
  }
  return mejor;
}
