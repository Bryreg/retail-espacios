/**
 * El motor del plano de la dirección E, portado tal cual.
 *
 * UNA sola proyección con parámetro: `v = 0` es el plano isométrico y `v = 1`
 * es «Ver en 3D» — no hay dos escenas, hay un número que baja el horizonte
 * (seno 0,50 → 0,30) y sube los muebles (× 1,9). Interpolar ese número es todo
 * el efecto, y es lo que permite que la miniatura de la tarjeta 01 morfe entre
 * las dos vistas sin dibujar nada nuevo.
 *
 * Nada de acá toca el DOM ni React: son funciones puras más un lector de la
 * paleta que le pregunta al navegador por los tokens ya resueltos, para que el
 * SVG use los mismos colores que el CSS en cualquiera de los dos temas.
 */
import type { Estado, Pieza } from "./datos";

/** cos(30°): el ancho de la celda isométrica. */
const COS = 0.866;

export type Punto = readonly [number, number];

/** Proyección de sala a pantalla. `v` mezcla el plano (0) con el 3D (1). */
export function proy(x: number, y: number, z: number, v: number): Punto {
  const S = 0.5 + (0.3 - 0.5) * v;
  const HK = 1 + (1.9 - 1) * v;
  return [(x - y) * COS, (x + y) * S - z * 0.95 * HK];
}

export interface Caras {
  top: string;
  left: string;
  right: string;
}

/** Las tres caras visibles del prisma, listas para `points` de un polígono. */
export function caras(p: Pieza, v: number, oy = 0): Caras {
  const x = p.x;
  const y = p.y + oy;
  const { w, d, h } = p;
  const q = (a: number, b: number, c: number) => {
    const t = proy(a, b, c, v);
    return t[0] + "," + t[1];
  };
  return {
    top: `${q(x, y, h)} ${q(x + w, y, h)} ${q(x + w, y + d, h)} ${q(x, y + d, h)}`,
    left: `${q(x, y + d, 0)} ${q(x + w, y + d, 0)} ${q(x + w, y + d, h)} ${q(x, y + d, h)}`,
    right: `${q(x + w, y, 0)} ${q(x + w, y + d, 0)} ${q(x + w, y + d, h)} ${q(x + w, y, h)}`,
  };
}

export interface Caja {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** La caja que ocupan estas piezas ya proyectadas, con `v` puesto. */
export function bbox(lista: readonly Pieza[], v: number): Caja {
  let a = 1e9;
  let b = 1e9;
  let c = -1e9;
  let d = -1e9;
  lista.forEach((p) => {
    const esquinas: Array<[number, number, number]> = [
      [p.x, p.y, 0], [p.x + p.w, p.y, 0], [p.x, p.y + p.d, 0], [p.x + p.w, p.y + p.d, 0],
      [p.x, p.y, p.h], [p.x + p.w, p.y, p.h], [p.x, p.y + p.d, p.h], [p.x + p.w, p.y + p.d, p.h],
    ];
    esquinas.forEach((q) => {
      const t = proy(q[0], q[1], q[2], v);
      if (t[0] < a) a = t[0];
      if (t[0] > c) c = t[0];
      if (t[1] < b) b = t[1];
      if (t[1] > d) d = t[1];
    });
  });
  return { x: a, y: b, w: c - a, h: d - b };
}

/* ── la paleta, leída del CSS ─────────────────────────────────────────────
   El SVG se pinta con `fill` calculados (una cara clara y una oscura por
   pieza), así que no alcanza con una variable CSS: hay que mezclar el color
   del estado con el fondo. Se leen los tokens ya resueltos del tema vigente,
   se mezcla acá, y al cambiar de tema se vuelve a leer. */

export interface CaraColor {
  top: string;
  left: string;
  right: string;
}

export type Paleta = Record<Estado, CaraColor> & { piso: string; canto: string };

function hex2rgb(h: string): [number, number, number] {
  const s = (h || "").trim();
  if (s.charAt(0) === "#") {
    const t = s.length === 4 ? "#" + s[1] + s[1] + s[2] + s[2] + s[3] + s[3] : s;
    return [
      parseInt(t.substr(1, 2), 16),
      parseInt(t.substr(3, 2), 16),
      parseInt(t.substr(5, 2), 16),
    ];
  }
  const m = s.match(/(\d+(\.\d+)?)/g);
  return m ? [+m[0], +m[1], +m[2]] : [128, 128, 128];
}

function mezclar(rgb: [number, number, number], f: number, bg: [number, number, number]): string {
  return (
    "rgb(" +
    Math.round(rgb[0] * f + bg[0] * (1 - f)) + "," +
    Math.round(rgb[1] * f + bg[1] * (1 - f)) + "," +
    Math.round(rgb[2] * f + bg[2] * (1 - f)) + ")"
  );
}

const ESTADOS: Estado[] = ["libre", "libera", "tomado", "resto"];

/** Lee los tokens del elemento (la raíz de la landing) y arma la paleta. */
export function leerPaleta(nodo: Element): Paleta {
  const cs = getComputedStyle(nodo);
  const bg = hex2rgb(cs.getPropertyValue("--bg") || "#000");
  const fl = parseFloat(cs.getPropertyValue("--face-left")) || 0.7;
  const fr = parseFloat(cs.getPropertyValue("--face-right")) || 0.5;
  const salida = {
    piso: (cs.getPropertyValue("--floor") || "#111").trim(),
    canto: (cs.getPropertyValue("--floor-edge") || "#333").trim(),
  } as Paleta;
  ESTADOS.forEach((k) => {
    const base = hex2rgb(cs.getPropertyValue("--st-" + k));
    salida[k] = {
      top: "rgb(" + base.join(",") + ")",
      left: mezclar(base, fl, bg),
      right: mezclar(base, fr, bg),
    };
  });
  return salida;
}

/** La paleta con la que se pinta antes de poder leer el CSS (y en el servidor). */
export const PALETA_VACIA: Paleta = {
  libre: { top: "#00BE86", left: "#00BE86", right: "#00BE86" },
  libera: { top: "#F5A524", left: "#F5A524", right: "#F5A524" },
  tomado: { top: "#F4544E", left: "#F4544E", right: "#F4544E" },
  resto: { top: "#33414F", left: "#33414F", right: "#33414F" },
  piso: "#0A1015",
  canto: "rgba(255,255,255,.10)",
};

/** `prefers-reduced-motion`, preguntado cada vez (se puede cambiar en vivo). */
export function quieto(): boolean {
  return typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
