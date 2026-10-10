import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { ALTO_CIELO_RASO } from "../../../utils/planta";
import { COLOR_DE_TIENDA } from "./copeteDeTienda";

/**
 * La sala de la pantalla de venta: los muros y el cielo raso que cierran la
 * tienda en Presentar y en la lámina (`StoreRoom` los dibuja; en el editor no
 * existen). Geometría pura, aparte del editor para poder probarla sin montar
 * la escena.
 *
 * Todo es de UNA cara y mira hacia ADENTRO: desde la órbita alejada —por
 * fuera, o por encima del cielo raso— no se dibuja, y la tienda se ve como
 * una maqueta abierta en vez de una caja cerrada. Nada arroja ni recibe
 * sombra: el mapa de sombras de la tienda y su calibración no se tocan.
 */

/** Lo que hace falta de la planta (`LimitesPlanta`). */
export interface CajaDeSala {
  cx: number; cz: number; w: number; d: number;
  minX: number; maxX: number; minZ: number; maxZ: number;
}

/**
 * Los cuatro muros como PLANOS que miran hacia adentro, unidos en una
 * geometría (una llamada de dibujo). `adentro` corre cada plano hacia el
 * interior: el zócalo va 1,2 cm delante del muro.
 */
export function geometriaDeMurosDeVenta(l: CajaDeSala, alto: number, adentro = 0): THREE.BufferGeometry {
  const plano = (ancho: number, giro: number, x: number, z: number) => {
    const g = new THREE.PlaneGeometry(ancho, alto);
    g.rotateY(giro);
    g.translate(x, alto / 2, z);
    return g;
  };
  const partes = [
    plano(l.w, 0, l.cx, l.minZ + adentro),               // mira a +Z
    plano(l.w, Math.PI, l.cx, l.maxZ - adentro),         // mira a −Z
    plano(l.d, Math.PI / 2, l.minX + adentro, l.cz),     // mira a +X
    plano(l.d, -Math.PI / 2, l.maxX - adentro, l.cz),    // mira a −X
  ];
  const g = mergeGeometries(partes)!;
  partes.forEach((p) => p.dispose());
  return g;
}

/** El cielo raso: un plano a `ALTO_CIELO_RASO` que mira ABAJO. Desde arriba
 *  (la vista superior, la órbita) no se dibuja. */
export function geometriaDeCieloRaso(l: Pick<CajaDeSala, "cx" | "cz" | "w" | "d">): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(l.w, l.d);
  g.rotateX(Math.PI / 2);
  g.translate(l.cx, ALTO_CIELO_RASO, l.cz);
  return g;
}

/** El color del muro de venta en la pantalla (sRGB): el que daba el Lambert
 *  de los muros con su `emissive`, ahora sin luz y con el degradé encima. */
export const COLOR_DEL_MURO_DE_VENTA = "#cfccc4";

/**
 * El degradé del muro de venta: cuánto de su color le queda a cada altura
 * (lineal), de abajo arriba. Más claro arriba, bajo las luminarias, y más
 * oscuro hacia el zócalo, que es como se ve un muro iluminado desde el cielo
 * raso. La crítica de la demo (ronda 2): un muro beige del mismo tono de
 * arriba abajo «dice render de arquitectura».
 */
export const DEGRADE_DEL_MURO: readonly (readonly [number, number])[] = [
  [0, 0.74], [1.2, 0.86], [2.4, 1], [ALTO_CIELO_RASO, 1.05],
];

/** El factor del degradé a la altura `y` (interpolado entre las paradas). */
export function luzDelMuro(y: number): number {
  const d = DEGRADE_DEL_MURO;
  if (y <= d[0][0]) return d[0][1];
  for (let i = 1; i < d.length; i++) {
    if (y <= d[i][0]) {
      const t = (y - d[i - 1][0]) / (d[i][0] - d[i - 1][0]);
      return d[i - 1][1] + (d[i][1] - d[i - 1][1]) * t;
    }
  }
  return d[d.length - 1][1];
}

/**
 * Los muros de venta CON el degradé: los mismos cuatro planos que miran hacia
 * adentro (`geometriaDeMurosDeVenta`), partidos en franjas de 40 cm a lo alto
 * y con un color de vértice por altura (`luzDelMuro`). Una geometría, una
 * llamada.
 */
export function geometriaDeMurosConDegradado(l: CajaDeSala, alto: number): THREE.BufferGeometry {
  const filas = Math.max(1, Math.round(alto / 0.4));
  const plano = (ancho: number, giro: number, x: number, z: number) => {
    const g = new THREE.PlaneGeometry(ancho, alto, 1, filas);
    g.rotateY(giro);
    g.translate(x, alto / 2, z);
    const pos = g.getAttribute("position");
    const color = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) color.fill(luzDelMuro(pos.getY(i)), i * 3, i * 3 + 3);
    g.setAttribute("color", new THREE.BufferAttribute(color, 3));
    return g;
  };
  const partes = [
    plano(l.w, 0, l.cx, l.minZ),
    plano(l.w, Math.PI, l.cx, l.maxZ),
    plano(l.d, Math.PI / 2, l.minX, l.cz),
    plano(l.d, -Math.PI / 2, l.maxX, l.cz),
  ];
  const g = mergeGeometries(partes)!;
  partes.forEach((p) => p.dispose());
  return g;
}

/**
 * La cenefa perimetral de la pantalla de venta: una faja de 35 cm a 2,45 m
 * sobre los cuatro muros, en paneles de la chapa de la tienda (dos tonos que
 * se alternan cada `CENEFA.panel`) con un filete claro abajo y otro arriba.
 *
 * En un supermercado el muro perimetral lleva una cenefa sobre las neveras y
 * los murales; sin ella, una nevera contra un muro beige liso parecía un
 * electrodoméstico en un salón vacío. Va SIN TEXTO y sin colores por
 * categoría: decir «bebidas frías» o «lácteos» es señalética, y la
 * nomenclatura por pasillo es una conversación abierta con el dueño
 * («Dónde retomar», punto 1). Son los tonos de la chapa de las puntas libres
 * (`COLOR_DE_TIENDA`): la tienda, no un proveedor.
 */
export const CENEFA = {
  desde: 2.45,
  alto: 0.35,
  /** Delante del muro, para que no pelee con él en profundidad. */
  delante: 0.015,
  /** Cada panel de un tono, a lo largo del muro. */
  panel: 2.4,
  filete: 0.025,
  tonos: [COLOR_DE_TIENDA, "#46768a"] as const,
  claro: "#dfe7e8",
} as const;

/** Un `#rrggbb` (sRGB) a lineal, que es como three usa el color de vértice. */
function lineal(hex: string): [number, number, number] {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
}

export function geometriaDeCenefa(l: CajaDeSala): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [], col: number[] = [];
  const quad = (
    a: [number, number], b: [number, number], y0: number, y1: number, n: [number, number], c: [number, number, number],
  ) => {
    // Dos triángulos que miran hacia `n` (adentro).
    const v = [[a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]]];
    const lado = (b[0] - a[0]) * n[1] - (b[1] - a[1]) * n[0];
    const orden = lado > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
    for (const k of orden) { pos.push(...v[k]); nor.push(n[0], 0, n[1]); col.push(...c); }
  };
  const d = CENEFA.delante;
  // Cada muro: de un extremo al otro y su normal hacia adentro.
  const muros: { a: [number, number]; b: [number, number]; n: [number, number] }[] = [
    { a: [l.minX, l.minZ + d], b: [l.maxX, l.minZ + d], n: [0, 1] },
    { a: [l.maxX, l.maxZ - d], b: [l.minX, l.maxZ - d], n: [0, -1] },
    { a: [l.minX + d, l.maxZ], b: [l.minX + d, l.minZ], n: [1, 0] },
    { a: [l.maxX - d, l.minZ], b: [l.maxX - d, l.maxZ], n: [-1, 0] },
  ];
  const tonos = CENEFA.tonos.map(lineal), claro = lineal(CENEFA.claro);
  const y0 = CENEFA.desde, y1 = CENEFA.desde + CENEFA.alto, f = CENEFA.filete;
  let k = 0;
  for (const m of muros) {
    const largo = Math.hypot(m.b[0] - m.a[0], m.b[1] - m.a[1]);
    const n = Math.max(1, Math.round(largo / CENEFA.panel));
    for (let i = 0; i < n; i++) {
      const p = (t: number): [number, number] => [m.a[0] + (m.b[0] - m.a[0]) * t, m.a[1] + (m.b[1] - m.a[1]) * t];
      const a = p(i / n), b = p((i + 1) / n);
      quad(a, b, y0 + f, y1 - f * 0.6, m.n, tonos[k++ % tonos.length]);
    }
    quad(m.a, m.b, y0, y0 + f, m.n, claro);
    quad(m.a, m.b, y1 - f * 0.6, y1, m.n, claro);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  return g;
}
