/**
 * La superficie comercializable de una cara: qué rectángulo de la cara se
 * vende por participación, qué partes de él no (zócalo, parantes, copete…) y
 * a qué distancia del mueble se dibujan las zonas en el 3D.
 *
 * Gemela de `backend/app/services/superficie.py`: las dos corren
 * `scripts/casos/superficies.json` (con `probar-superficies.mjs` de este lado
 * y `tests/test_participaciones_geometria.py` del otro). El servidor calcula
 * con ESTA superficie lo que se dibujó de cada participación, así que las dos
 * tienen que dar los mismos números, bit a bit (ver `zonasGeometria.ts`).
 *
 * Cada tipo que se vende por participación declara su receta en el catálogo
 * (`tipos[t].superficie.receta`, la unión `RecetaDeSuperficie` de
 * `catalogo.ts`). Las cotas salen de lo que dibuja el 3D:
 *
 *   · la góndola, la punta y el robatope, de `muebles/medidas.ts`, que este
 *     archivo IMPORTA (Python las copia, y `test_participaciones_geometria.py`
 *     compara la copia con este archivo de medidas);
 *   · la ristra, la cruz y la vitrina se dibujan con números escritos en
 *     `StoreEditor3D.tsx` (`RistraMesh`, `CrossMesh`, `MuebleMesh`): acá van
 *     con nombre, y `probar-superficies.mjs` los busca en ese archivo y
 *     EJECUTA la holgura con los que encuentra.
 *
 * El plano del dibujo queda delante de todo lo que sobresale del frente con
 * el mueble desnudo (entrepaños y porta precios, rieles y tablas del robatope,
 * postes, cenefa, tiras de estado): al menos 6 mm en los frentes (la prueba de
 * holgura lo ejecuta para los siete tipos). En la zona libre, 4 mm sobre la
 * tapa, que se mira desde arriba.
 *
 * Coordenadas (§8 del diseño): el marco local del mueble tiene el origen en el
 * centro de la huella, en el piso, `y` arriba y el frente hacia −z; la cara B
 * de una góndola doble mira a +z. u = 0 es el borde IZQUIERDO de quien mira la
 * cara de frente; v = 0, abajo (en la zona libre, el borde delantero). El
 * robatope dibuja en el marco de sus repisas, girado `giroX` alrededor de X.
 */
import { CATALOGO_DE_MUEBLES, type RecetaDeSuperficie, type TipoDeMueble } from "../catalogo/catalogo";
import {
  ANCHO_MODULO_TIPICO, ESPESOR_ESPINA, PARANTE, ROBATOPE, ZOCALO,
  cotasDeRobatope, fondoPorCara, nivelesDeEntrepano, nivelesDePunta, techoDeCara, tramosValidos,
} from "../components/StoreEditor3D/muebles/medidas";
import { carasDe } from "../types/espacio";
import { ALTURA_PISABLE } from "./planta";
import { AREA_MINIMA_M2, areaUtil, cuantizarNumero, type Exclusion } from "./zonasGeometria";

export type Receta = RecetaDeSuperficie;
export type { Exclusion };

/** El remate de arriba de una góndola, que no lleva producto (el último
 *  entrepaño queda debajo de `h − 0,10`, `nivelesDeEntrepano`). */
export const REMATE_GONDOLA = 0.10;
/** Lo que el plano del dibujo va por delante del frente de cada tipo. En la
 *  góndola, del frente de los entrepaños más hondos: el porta precios sale
 *  4 mm, así que quedan 8 mm. */
export const SEPARACION_GONDOLA = 0.012;
/** La punta: la cenefa del copete sale hasta `d/2 + 0,007`; quedan 7 mm. */
export const SEPARACION_PUNTA = 0.014;
/** El robatope, en el marco girado: lo que manda es la tira de estado (sin
 *  girar, a 8–12 cm del piso, en `−(d/2 + 0,011)`), que queda a ≥ 8 mm. */
export const SEPARACION_ROBATOPE = 0.014;
/** La ristra: la punta del gancho (`0,32·d` más su radio de 3,5 mm). */
export const SEPARACION_RISTRA = 0.012;
/** La cruz: los postes delanteros salen hasta `d/2 − 0,0045`. */
export const SEPARACION_CROSS = 0.006;
/** La vitrina: la tira de estado de la base sale hasta `d/2 + 0,014`. */
export const SEPARACION_VITRINA = 0.020;
/** La zona libre se dibuja 4 mm sobre su tapa. */
export const SOBRE_LA_TAPA = 0.004;

/** La ristra que dibuja `RistraMesh`: la lámina angosta, base y cabezal de
 *  6 cm, y el gancho que sale `0,32·d` con 3,5 mm de radio. */
export const RISTRA = { anchoMinimo: 0.076, anchoMaximo: 0.13, fraccionDelAncho: 0.45, base: 0.06, cabezal: 0.06, gancho: 0.32 } as const;
/** La cruz que dibuja `CrossMesh`: postes de 5,5 cm con el eje a 3,2 cm del
 *  costado; repisas de 2,6 cm desde 10 cm hasta `h − 0,02`. */
export const CROSS = { ejeDelPoste: 0.032, ladoDelPoste: 0.055, primerNivel: 0.10, recorrido: 0.12, medioEspesor: 0.013 } as const;
/** La vitrina que dibuja `MuebleMesh`: zócalo de `min(0,22·h, 0,40)`, marco
 *  de 3,6 cm, una puerta cada 60 cm y divisores de 1,8 cm. */
export const VITRINA = { fraccionDeBase: 0.22, baseMaxima: 0.40, marco: 0.036, puerta: 0.60, medioDivisor: 0.009 } as const;

export interface Superficie {
  orientacion: "frente" | "arriba";
  /** El rectángulo exterior de la cara, en metros (en la zona libre, `w × d`). */
  ancho: number;
  alto: number;
  /** La distancia del dibujo al eje del mueble (frentes, medida en el marco
   *  girado `giroX`) o su altura sobre el piso (zona libre). */
  plano: number;
  /** El giro alrededor de X del marco del dibujo: sólo el robatope (el de sus
   *  repisas, `ROBATOPE.giro`); los demás, 0. */
  giroX: number;
  /** Cuantizadas a 1e-6 (así viajan en la API), ordenadas por (v0, u0, v1, u1, por). */
  exclusiones: Exclusion[];
  /** El área que se vende, en m², sin redondear. */
  areaUtilM2: number;
}

/** Lo que la superficie lee de un mueble del plano. */
export interface MuebleParaSuperficie {
  type?: string;
  w?: number;
  d?: number;
  h?: number;
  gondolaType?: string | null;
  modulo?: number | null;
  entrepanos?: number | null;
  partes?: { tramos?: number | null } | null;
}

interface Rect { por: string; x0: number; x1: number; y0: number; y1: number }
interface Medidas { w: number; d: number; h: number; mural: boolean; modulo?: number; tramos?: number }
interface Dibujo {
  orientacion: "frente" | "arriba";
  exterior: { x0: number; x1: number; y0: number; y1: number };
  exclusiones: Rect[];
  plano: number;
  giroX: number;
}

const rect = (por: string, x0: number, x1: number, y0: number, y1: number): Rect => ({ por, x0, x1, y0, y1 });

/** Cuántos módulos tiene el corrido: los tramos guardados o `w / módulo`
 *  redondeado (1,25 sin módulo), con la cuenta de `vanosDeCorrido` (y su
 *  `Math.round`, que Python porta exacto). */
function vanos(w: number, modulo: number | undefined, tramos: number | undefined): number {
  const fijos = tramosValidos(tramos);
  if (fijos !== undefined) return fijos;
  const m = modulo !== undefined && modulo > 0 ? modulo : ANCHO_MODULO_TIPICO;
  return Math.max(1, Math.round(w / m));
}

/** Los ejes de los parantes: en cada unión y en las dos puntas
 *  (`parantesDeVanos` de `piezas.tsx`). */
function parantes(w: number, n: number): number[] {
  const fuera: number[] = [];
  for (let i = 0; i <= n; i++) fuera.push(-w / 2 + (w / n) * i);
  return fuera;
}

/** La banda de un parante, recortada al mueble. */
function bandas(w: number, xs: number[], y0: number, y1: number): Rect[] {
  const fuera: Rect[] = [];
  for (const x of xs) fuera.push(rect("parante", Math.max(-w / 2, x - PARANTE.ancho / 2), Math.min(w / 2, x + PARANTE.ancho / 2), y0, y1));
  return fuera;
}

/** Las recetas, en metros y en el marco del mueble (§7.3). Un `Record` sobre
 *  la unión del catálogo: una receta sin cocinar no compila. */
const RECETARIO: Record<RecetaDeSuperficie, (m: Medidas) => Dibujo | null> = {
  gondola: ({ w, d, h, mural, modulo, tramos }) => ({
    orientacion: "frente",
    exterior: { x0: -w / 2, x1: w / 2, y0: 0, y1: h },
    exclusiones: [
      rect("zocalo", -w / 2, w / 2, 0, ZOCALO.alto),
      rect("remate", -w / 2, w / 2, h - REMATE_GONDOLA, h),
      ...bandas(w, parantes(w, vanos(w, modulo, tramos)), ZOCALO.alto, h - REMATE_GONDOLA),
    ],
    plano: ESPESOR_ESPINA / 2 + fondoPorCara(d, mural) + SEPARACION_GONDOLA,
    giroX: 0,
  }),
  punta: ({ w, d, h, modulo }) => {
    const techo = techoDeCara(h);
    return {
      orientacion: "frente",
      exterior: { x0: -w / 2, x1: w / 2, y0: 0, y1: h },
      exclusiones: [
        rect("zocalo", -w / 2, w / 2, 0, ZOCALO.alto),
        rect("copete", -w / 2, w / 2, techo, h),
        ...bandas(w, parantes(w, vanos(w, modulo, undefined)), ZOCALO.alto, techo),
      ],
      plano: d / 2 + SEPARACION_PUNTA,
      giroX: 0,
    };
  },
  robatope: ({ w, d, h }) => {
    // Todo en el marco de las repisas, girado `ROBATOPE.giro` alrededor del
    // origen del mueble: ahí las repisas están en su `y`, y el plano en
    // `d/2 + 0,014` queda delante de rieles y tablas en todo el alto.
    const c = cotasDeRobatope(w, d, h);
    const apoyo = c.apoyos[0];
    return {
      orientacion: "frente",
      exterior: { x0: -w / 2, x1: w / 2, y0: 0, y1: h },
      exclusiones: [
        rect("base", -w / 2, w / 2, 0, apoyo),
        rect("remate", -w / 2, w / 2, c.cuerpo, h),
        rect("parante", -w / 2, -w / 2 + ROBATOPE.parante, apoyo, c.cuerpo),
        rect("parante", w / 2 - ROBATOPE.parante, w / 2, apoyo, c.cuerpo),
      ],
      plano: d / 2 + SEPARACION_ROBATOPE,
      giroX: ROBATOPE.giro,
    };
  },
  ristra: ({ w, d, h }) => {
    const a = Math.min(RISTRA.anchoMaximo, Math.max(RISTRA.anchoMinimo, RISTRA.fraccionDelAncho * w));
    return {
      orientacion: "frente",
      exterior: { x0: -a / 2, x1: a / 2, y0: 0, y1: h },
      exclusiones: [rect("base", -a / 2, a / 2, 0, RISTRA.base), rect("cabezal", -a / 2, a / 2, h - RISTRA.cabezal, h)],
      plano: RISTRA.gancho * d + SEPARACION_RISTRA,
      giroX: 0,
    };
  },
  cross: ({ w, d, h }) => {
    const poste = CROSS.ejeDelPoste + CROSS.ladoDelPoste / 2;
    const base = CROSS.primerNivel + CROSS.medioEspesor;
    const tapa = CROSS.primerNivel + (h - CROSS.recorrido) - CROSS.medioEspesor;
    return {
      orientacion: "frente",
      exterior: { x0: -w / 2, x1: w / 2, y0: 0, y1: h },
      exclusiones: [
        rect("base", -w / 2, w / 2, 0, base),
        rect("tapa", -w / 2, w / 2, tapa, h),
        rect("poste", -w / 2, -w / 2 + poste, base, tapa),
        rect("poste", w / 2 - poste, w / 2, base, tapa),
      ],
      plano: d / 2 + SEPARACION_CROSS,
      giroX: 0,
    };
  },
  vitrina: ({ w, d, h }) => {
    const baseH = Math.min(VITRINA.fraccionDeBase * h, VITRINA.baseMaxima);
    const techo = h - VITRINA.marco;
    const nP = Math.max(1, Math.round(w / VITRINA.puerta));
    const pw = w / nP;
    const exclusiones: Rect[] = [
      rect("zocalo", -w / 2, w / 2, 0, baseH),
      rect("marco", -w / 2, w / 2, techo, h),
      rect("marco", -w / 2, -w / 2 + VITRINA.marco, baseH, techo),
      rect("marco", w / 2 - VITRINA.marco, w / 2, baseH, techo),
    ];
    for (let i = 1; i < nP; i++) {
      const x = -w / 2 + i * pw;
      exclusiones.push(rect("divisor", x - VITRINA.medioDivisor, x + VITRINA.medioDivisor, baseH, techo));
    }
    return {
      orientacion: "frente",
      exterior: { x0: -w / 2, x1: w / 2, y0: 0, y1: h },
      exclusiones,
      plano: d / 2 + SEPARACION_VITRINA,
      giroX: 0,
    };
  },
  zona_libre: ({ w, d, h }) => {
    // La tapa entera, vista desde arriba (D16). Sólo la zona libre que se
    // pisa (h < ALTURA_PISABLE): ésa el 3D la dibuja como una placa de alto h
    // (§10.7). Una más alta se dibuja como un exhibidor con rieles que salen
    // 8 mm por encima de h (`MetroMesh`) y atravesarían el dibujo.
    if (!(h < ALTURA_PISABLE)) return null;
    return {
      orientacion: "arriba",
      exterior: { x0: -w / 2, x1: w / 2, y0: -d / 2, y1: d / 2 },
      exclusiones: [],
      plano: h + SOBRE_LA_TAPA,
      giroX: 0,
    };
  },
};

/** Las recetas que se saben calcular: las de `RecetaDeSuperficie`. */
export const RECETAS: readonly Receta[] = Object.keys(RECETARIO) as Receta[];

function tipoDelCatalogo(tipo: unknown): { clave: string; tipo: TipoDeMueble } | null {
  if (typeof tipo !== "string") return null;
  const alias = Object.prototype.hasOwnProperty.call(CATALOGO_DE_MUEBLES.alias, tipo) ? CATALOGO_DE_MUEBLES.alias[tipo] : undefined;
  const clave = alias ? alias.tipo : tipo;
  if (!Object.prototype.hasOwnProperty.call(CATALOGO_DE_MUEBLES.tipos, clave)) return null;
  return { clave, tipo: CATALOGO_DE_MUEBLES.tipos[clave] };
}

/** ¿El tipo (o el alias del 2D) tiene receta de superficie? */
export function tieneSuperficie(tipo: string): boolean {
  return !!tipoDelCatalogo(tipo)?.tipo.superficie;
}

const positivo = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x) && x > 0;
const enLaCara = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** La receta del mueble, con sus medidas; null si no se puede calcular. */
function dibujoDe(f: MuebleParaSuperficie, cara: "A" | "B"): { clave: string; receta: Receta; dibujo: Dibujo } | null {
  if (!f || typeof f !== "object" || (cara !== "A" && cara !== "B")) return null;
  const t = tipoDelCatalogo(f.type);
  const receta = t?.tipo.superficie?.receta;
  if (!t || !receta || !Object.prototype.hasOwnProperty.call(RECETARIO, receta)) return null;
  const caras = carasDe({ type: f.type, gondolaType: f.gondolaType });
  if (cara === "B" && caras !== 2) return null;
  if (!positivo(f.w) || !positivo(f.d) || !positivo(f.h)) return null;
  const dibujo = RECETARIO[receta]({
    w: f.w, d: f.d, h: f.h, mural: caras === 1,
    modulo: typeof f.modulo === "number" ? f.modulo : undefined,
    tramos: typeof f.partes?.tramos === "number" ? f.partes.tramos : undefined,
  });
  return dibujo ? { clave: t.clave, receta, dibujo } : null;
}

/**
 * La superficie comercializable de la cara A o B (§7.4), o null si: el tipo
 * no tiene receta, la cara es la B de un mueble de una cara, las medidas no
 * son números > 0, o lo útil no pasa de 1 cm² (sin división por cero en
 * `dibujadoPb`). Las exclusiones se pasan a u,v (en la B, en espejo), se
 * recortan a [0,1], se cuantizan a 1e-6 y se descartan las que quedan sin
 * ancho o sin alto.
 */
export function superficieDeCara(f: MuebleParaSuperficie, cara: "A" | "B"): Superficie | null {
  const r = dibujoDe(f, cara);
  if (!r) return null;
  const { exterior: { x0, x1, y0, y1 }, exclusiones: rects, plano, giroX, orientacion } = r.dibujo;
  const W = x1 - x0, H = y1 - y0;
  const exclusiones: Exclusion[] = [];
  for (const e of rects) {
    let u0: number, u1: number;
    if (cara === "B") { u0 = (e.x0 - x0) / W; u1 = (e.x1 - x0) / W; } else { u0 = (x1 - e.x1) / W; u1 = (x1 - e.x0) / W; }
    const v0 = (e.y0 - y0) / H, v1 = (e.y1 - y0) / H;
    const q = {
      por: e.por,
      u0: cuantizarNumero(enLaCara(u0)), u1: cuantizarNumero(enLaCara(u1)),
      v0: cuantizarNumero(enLaCara(v0)), v1: cuantizarNumero(enLaCara(v1)),
    };
    if (q.u1 <= q.u0 || q.v1 <= q.v0) continue;
    exclusiones.push(q);
  }
  exclusiones.sort((a, b) => (a.v0 - b.v0) || (a.u0 - b.u0) || (a.v1 - b.v1) || (a.u1 - b.u1) || (a.por < b.por ? -1 : a.por > b.por ? 1 : 0));
  const areaUtilM2 = W * H * areaUtil(exclusiones);
  if (!(areaUtilM2 > AREA_MINIMA_M2)) return null;
  return { orientacion, ancho: W, alto: H, plano, giroX, exclusiones, areaUtilM2 };
}

const mm = (x: number) => Math.floor(x * 1000 + 0.5);
const q4 = (x: number) => Math.floor(x * 10000 + 0.5);

/**
 * La firma de la cara (§3.9): lo que, si cambia, deja una distribución
 * confirmada «para revisar». Lleva el tipo, mural o doble (de `carasDe`,
 * nunca de `"double"` escrito), ancho y alto en mm, los entrepaños guardados
 * (un entero; otra cosa es «-») y las exclusiones a 1e-4, que llevan el
 * módulo y los tramos. El fondo no entra: mueve el plano del dibujo en el 3D
 * pero no cambia u,v.
 */
export function firmaDeCara(f: MuebleParaSuperficie, cara: "A" | "B"): string | null {
  const s = superficieDeCara(f, cara);
  const r = s && dibujoDe(f, cara);
  if (!s || !r) return null;
  const caras = carasDe({ type: f.type, gondolaType: f.gondolaType });
  const variante = caras === 2 ? "doble" : r.clave === "gondola" ? "mural" : "";
  const e = f.entrepanos;
  const entrepanos = typeof e === "number" && Number.isInteger(e) && e >= 0 && e <= 1000 ? String(e) : "-";
  const orden = s.exclusiones.map((x) => ({ ...x, k: [q4(x.v0), q4(x.u0), q4(x.v1), q4(x.u1)] }));
  orden.sort((a, b) => (a.k[0] - b.k[0]) || (a.k[1] - b.k[1]) || (a.k[2] - b.k[2]) || (a.k[3] - b.k[3])
    || (a.por < b.por ? -1 : a.por > b.por ? 1 : 0));
  const partes: string[] = [];
  for (const x of orden) partes.push(`${x.por}:${q4(x.u0)},${q4(x.u1)},${q4(x.v0)},${q4(x.v1)}`);
  return `v1|${r.clave}|${variante}|${mm(s.ancho)}|${mm(s.alto)}|e${entrepanos}|${partes.join(";")}`;
}

/**
 * Sólo para dibujar las guías del lienzo (líneas punteadas, interruptor
 * «Guías»): las alturas de los entrepaños, repisas o ganchos (`v`) y los ejes
 * de los parantes o divisores (`u`), en la cara pedida, de menor a mayor. No
 * entra en ninguna cuenta y no tiene gemelo.
 */
export function guiasDeCara(f: MuebleParaSuperficie, cara: "A" | "B"): { entrepanos: number[]; parantes: number[] } {
  const s = superficieDeCara(f, cara);
  const r = s && dibujoDe(f, cara);
  if (!s || !r || s.orientacion !== "frente") return { entrepanos: [], parantes: [] };
  const w = f.w as number, h = f.h as number;
  const W = s.ancho, H = s.alto;
  const entrepanos = typeof f.entrepanos === "number" ? f.entrepanos : undefined;
  const modulo = typeof f.modulo === "number" ? f.modulo : undefined;
  const tramos = typeof f.partes?.tramos === "number" ? f.partes.tramos : undefined;
  let ys: number[] = [];
  let xs: number[] = [];
  switch (r.receta) {
    case "gondola":
      ys = nivelesDeEntrepano(h, entrepanos);
      xs = parantes(w, vanos(w, modulo, tramos));
      break;
    case "punta":
      ys = nivelesDePunta(techoDeCara(h), entrepanos);
      xs = parantes(w, vanos(w, modulo, undefined));
      break;
    case "robatope":
      ys = cotasDeRobatope(w, f.d as number, h).apoyos;
      xs = [-w / 2 + ROBATOPE.parante / 2, w / 2 - ROBATOPE.parante / 2];
      break;
    case "ristra": {
      // Los ganchos de `RistraMesh`.
      const n = Math.max(4, Math.round(h / 0.28));
      const paso = (h - 0.10) / n;
      for (let i = 0; i < n; i++) ys.push(h - 0.08 - i * paso);
      break;
    }
    case "cross": {
      // Las repisas de `CrossMesh`.
      const n = Math.max(4, Math.round(h / 0.36));
      for (let i = 0; i < n; i++) ys.push(CROSS.primerNivel + i * ((h - CROSS.recorrido) / Math.max(n - 1, 1)));
      break;
    }
    case "vitrina": {
      // Los estantes y los divisores de puerta de `MuebleMesh`.
      const baseH = Math.min(VITRINA.fraccionDeBase * h, VITRINA.baseMaxima);
      const puertaH = h - baseH;
      const n = Math.max(2, Math.round(puertaH / 0.38));
      for (let i = 0; i < n; i++) ys.push(baseH + 0.10 + i * ((puertaH - 0.12) / Math.max(n - 1, 1)));
      const nP = Math.max(1, Math.round(w / VITRINA.puerta));
      for (let i = 1; i < nP; i++) xs.push(-w / 2 + i * (w / nP));
      break;
    }
  }
  const x0 = -W / 2, x1 = W / 2;
  const us = xs.map((x) => enLaCara(cara === "B" ? (x - x0) / W : (x1 - x) / W));
  const vs = ys.map((y) => enLaCara(y / H));
  return { entrepanos: vs.sort((a, b) => a - b), parantes: us.sort((a, b) => a - b) };
}
