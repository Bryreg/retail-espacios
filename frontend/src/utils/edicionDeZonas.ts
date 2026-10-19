/**
 * El editor de zonas de una cara como un reductor puro: dibujar, mover,
 * escalar, borrar, deshacer y rehacer, sin DOM ni React (lo prueba
 * `probar-zonas.mjs`). El lienzo SVG y el 3D sólo traducen el puntero a
 * acciones en u,v y dibujan el estado (§9.1, §9.4 y §9.8 del diseño de
 * participaciones).
 *
 *   · **u,v en [0,1]²**, u = 0 a la IZQUIERDA de quien mira la cara, v = 0
 *     abajo. Todo vértice que escribe el editor queda recortado a la cara y
 *     cuantizado a 1e-6 (`cuantizarNumero`, el mismo redondeo que el
 *     servidor): lo que se ve es exactamente lo que se manda y se mide.
 *   · **Un arrastre entero es UN paso de deshacer**: `empezarArrastre` guarda
 *     la foto, los movimientos no apilan nada y `terminarArrastre` apila una
 *     vez (sólo si algo cambió). 100 pasos de deshacer, sólo de la
 *     distribución: nada de esto toca el plano.
 *   · **Mirar no edita**: en «Mirar» sólo se elige y se mira.
 *   · **Esc nunca saca del modo**: cancela el trazo o suelta la zona elegida.
 *
 * También viven acá, puras, las cuentas del editor que no son del servidor:
 * la fusión de tres vías ante `version_vieja` (§9.8), «Ajustar al
 * contratado», «Ajustar el borde a la vecina», el imán (también el de una
 * zona que se mueve entera, el mismo en el lienzo y en el 3D) y el punto
 * interior donde va el rótulo.
 */
import type { ZonaOut } from "../api/participaciones";
import { juzgar, type OpcionesDeJuicio, type Juicio, type Termino } from "./participaciones";
import {
  AREA_MINIMA_M2, MAX_VERTICES, areaCubierta, areaFirmada, cajas, cuantizarNumero, limpiar, medir, validarZona,
  type Exclusion, type Medidas, type Poligono, type Punto,
} from "./zonasGeometria";

/* ── El estado ─────────────────────────────────────────────────────────────── */

export interface ZonaEnEdicion {
  /** Identidad en esta edición: `z<id>` si vino del servidor, `n<k>` si se
   *  dibujó acá. No viaja: el servidor numera al guardar. */
  clave: string;
  /** La participación (su espacio PC) a la que pertenece la zona. */
  participacionSpaceId: number;
  vertices: Poligono;
}

export type Herramienta = "seleccionar" | "rectangulo" | "poligono";
/** Las manijas de escala del recuadro: n arriba (v grande), s abajo, e a la
 *  derecha (u grande), o a la izquierda. */
export type Manija = "n" | "s" | "e" | "o" | "ne" | "no" | "se" | "so";

export interface EstadoDeEdicion {
  zonas: ZonaEnEdicion[];
  /** Lo cargado del servidor (o lo último que se le guardó): contra esto se
   *  mide `sucio` y se fusiona ante `version_vieja`. */
  base: ZonaEnEdicion[];
  seleccion: { zona: string; vertice: number | null } | null;
  herramienta: Herramienta;
  modo: "mirar" | "editar";
  /** El trazo en curso: en «Rectángulo», [esquina, esquina opuesta]; en
   *  «Polígono», los puntos puestos. */
  trazo: Poligono | null;
  arrastre: { antes: ZonaEnEdicion[] } | null;
  atras: ZonaEnEdicion[][];
  adelante: ZonaEnEdicion[][];
  /** La participación (spaceId) con la que se dibuja. */
  activa: number | null;
  /** Imán a vértices y bordes de OTRAS zonas y al borde de la cara: prendido. */
  iman: boolean;
  /** Imán también a entrepaños y parantes: apagado. El pedido no deja imponer
   *  la atracción a baldas; se prende a pedido (y se dibujen o no las guías). */
  imanAGuias: boolean;
  /** Dibujar las guías (entrepaños y parantes): prendido, para VER. */
  guias: boolean;
  /** Las zonas difieren de `base` (sin contar el orden ni el sentido de los
   *  vértices). */
  sucio: boolean;
  /** Ancho y alto de la cara en metros (las flechas mueven en metros). */
  medidas: { ancho: number; alto: number } | null;
  /** Por qué la última acción no hizo nada (un triángulo que no pierde un
   *  punto, una zona de 24 puntos), para la pista del lienzo. */
  aviso: string | null;
  /** El número de la próxima zona dibujada acá (`n<k>`). */
  proxima: number;
}

export type Accion =
  | { tipo: "cargar"; zonas: readonly ZonaOut[]; medidas?: { ancho: number; alto: number } | null }
  | { tipo: "guardado"; base: readonly ZonaEnEdicion[] }
  | { tipo: "fusionar"; zonas: readonly ZonaEnEdicion[]; base: readonly ZonaEnEdicion[] }
  | { tipo: "seleccionar"; zona: string | null; vertice?: number | null }
  | { tipo: "empezarTrazo"; punto: Punto }
  | { tipo: "estirarTrazo"; punto: Punto }
  | { tipo: "agregarPunto"; punto: Punto }
  | { tipo: "quitarPunto" }
  | { tipo: "cerrarTrazo" }
  | { tipo: "cancelarTrazo" }
  | { tipo: "empezarArrastre" }
  | { tipo: "moverZona"; clave: string; du: number; dv: number }
  | { tipo: "empujar"; dx: number; dy: number }
  | { tipo: "moverVertice"; clave: string; vertice: number; punto: Punto }
  | { tipo: "escalar"; clave: string; manija: Manija; punto: Punto; proporcional?: boolean }
  | { tipo: "terminarArrastre" }
  | { tipo: "insertarVertice"; clave: string; despuesDe: number; punto: Punto }
  | { tipo: "borrarVertice"; clave: string; vertice: number }
  | { tipo: "borrarZona"; clave: string }
  | { tipo: "ajustarZonas"; spaceId: number; vertices: readonly Poligono[] }
  /** «Ajustar el borde a la vecina»: `ignorar`, las claves de las zonas que
   *  no cuentan como vecinas (participaciones cuyas fechas no se cruzan). */
  | { tipo: "ajustarBorde"; clave: string; ignorar?: readonly string[] }
  | { tipo: "usarZonas"; spaceId: number; zonas: readonly ZonaEnEdicion[] }
  | { tipo: "deshacer" }
  | { tipo: "rehacer" }
  | { tipo: "elegirHerramienta"; herramienta: Herramienta }
  | { tipo: "elegirModo"; modo: "mirar" | "editar" }
  | { tipo: "elegirActiva"; spaceId: number | null }
  | { tipo: "alternarIman" }
  | { tipo: "alternarImanAGuias" }
  | { tipo: "alternarGuias" }
  | { tipo: "descartarCambios" };

/** Pasos de deshacer. */
export const PASOS_DE_DESHACER = 100;
/** Un clic agrega o elige sólo si el puntero se movió menos que esto (px)
 *  entre bajar y subir; más es un arrastre. */
export const UMBRAL_CLIC_PX = 4;
/** Lo que mueve una flecha (Shift: diez veces), en metros. */
export const PASO_DE_FLECHA_M = 0.01;
/** El radio del imán, en píxeles de pantalla (el lienzo lo pasa a u,v). */
export const RADIO_DEL_IMAN_PX = 6;
/** Distancia (px de pantalla) para tocar una manija, el primer punto del
 *  polígono o un borde: la misma en el lienzo y en el 3D. */
export const TOQUE_PX = 8;
/** Ni el escalado ni un rectángulo dejan una zona más angosta que esto (u,v). */
const MIN_EXTENSION = 0.001;

export const AVISO_TRIANGULO = "Un triángulo no puede perder un punto: borrá la zona entera con Supr sin un punto elegido.";
export const AVISO_SIN_ACTIVA = "Elegí una participación en la lista para dibujar su zona.";
export const AVISO_TOPE_DE_PUNTOS = `Una zona tiene hasta ${MAX_VERTICES} puntos: cerrala (Enter o un clic en el primero) o partila en dos.`;
export const AVISO_POCOS_PUNTOS = "Una zona necesita al menos tres puntos.";
export const AVISO_SIN_VECINA = "No hay una zona vecina a menos de 5 cm con un borde de frente a éste: acercala con el imán.";
export const AVISO_YA_PEGADA = "La zona ya está pegada a su vecina.";
export const AVISO_NO_QUEDA_LIMPIA = "Ajustar ese borde pisaría otra zona o cruzaría la zona: ajustalo a mano.";

export function estadoInicial(): EstadoDeEdicion {
  return {
    zonas: [], base: [], seleccion: null, herramienta: "seleccionar", modo: "editar",
    trazo: null, arrastre: null, atras: [], adelante: [], activa: null,
    iman: true, imanAGuias: false, guias: true, sucio: false, medidas: null, aviso: null, proxima: 1,
  };
}

/* ── Ayudas de forma ───────────────────────────────────────────────────────── */

const q = cuantizarNumero;
const recorte = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const finito = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
/** Un punto llevado a la cara y cuantizado. */
export function enLaCara(p: Punto): Punto {
  return [q(recorte(finito(p[0]) ? p[0] : 0)), q(recorte(finito(p[1]) ? p[1] : 0))];
}

/**
 * Mueve la zona (du, dv) sin cambiarle la forma: el VECTOR se recorta con la
 * caja de la zona contra [0,1]², así una zona empujada contra el borde se
 * frena entera en vez de aplastarse.
 */
export function trasladar(z: Poligono, du: number, dv: number): Poligono {
  if (z.length === 0) return [];
  const [u0, v0, u1, v1] = cajas([z]);
  const a = Math.min(Math.max(finito(du) ? du : 0, -u0), 1 - u1);
  const b = Math.min(Math.max(finito(dv) ? dv : 0, -v0), 1 - v1);
  const fuera: Poligono = [];
  for (const [u, v] of z) fuera.push([q(recorte(u + a)), q(recorte(v + b))]);
  return fuera;
}

/** La zona escalada desde la manija hasta `punto`, con el lado (o la esquina)
 *  opuesto fijo. Shift (`proporcional`) en una esquina conserva la
 *  proporción. Nunca se da vuelta ni sale de la cara. */
export function escalarZona(z: Poligono, manija: Manija, punto: Punto, proporcional = false): Poligono {
  if (z.length === 0) return [];
  const [u0, v0, u1, v1] = cajas([z]);
  const p = enLaCara(punto);
  const W = u1 - u0, H = v1 - v0;
  let au = u0, av = v0, sx = 1, sy = 1;
  const este = manija.includes("e"), oeste = manija.includes("o"), norte = manija.includes("n"), sur = manija.includes("s");
  if (este && W > 0) { au = u0; sx = (Math.max(u0 + MIN_EXTENSION, p[0]) - u0) / W; }
  if (oeste && W > 0) { au = u1; sx = (u1 - Math.min(u1 - MIN_EXTENSION, p[0])) / W; }
  if (norte && H > 0) { av = v0; sy = (Math.max(v0 + MIN_EXTENSION, p[1]) - v0) / H; }
  if (sur && H > 0) { av = v1; sy = (v1 - Math.min(v1 - MIN_EXTENSION, p[1])) / H; }
  if (proporcional && manija.length === 2 && W > 0 && H > 0) {
    let s = Math.max(sx, sy);
    // Que no salga de la cara por el otro eje.
    s = Math.min(s, este ? (1 - u0) / W : u1 / W, norte ? (1 - v0) / H : v1 / H);
    sx = s; sy = s;
  }
  const fuera: Poligono = [];
  for (const [u, v] of z) fuera.push([q(recorte(au + sx * (u - au))), q(recorte(av + sy * (v - av)))]);
  return fuera;
}

/** Par-impar: ¿el punto cae dentro del polígono? (el borde, como caiga). */
export function adentro([x, y]: Punto, p: Poligono): boolean {
  let d = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, yi] = p[i], [xj, yj] = p[j];
    if ((yi > y) !== (yj > y) && x < xj + (y - yj) * (xi - xj) / (yi - yj)) d = !d;
  }
  return d;
}

/** La zona de arriba (la última de la lista) que contiene el punto, o null.
 *  Es «la de arriba si se pisan» del lienzo y el toque en el 3D. */
export function zonaEnPunto(zonas: readonly ZonaEnEdicion[], p: Punto): string | null {
  for (let i = zonas.length - 1; i >= 0; i--) if (adentro(p, zonas[i].vertices)) return zonas[i].clave;
  return null;
}

/** ¿Lo que se movió el puntero entre bajar y subir es un clic? */
export function esClic(desde: { x: number; y: number }, hasta: { x: number; y: number }): boolean {
  return Math.hypot(hasta.x - desde.x, hasta.y - desde.y) < UMBRAL_CLIC_PX;
}

function distanciaASegmento(p: Punto, a: Punto, b: Punto, W: number, H: number): number {
  const px = p[0] * W, py = p[1] * H, ax = a[0] * W, ay = a[1] * H, bx = b[0] * W, by = b[1] * H;
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

const cruz = (a: Punto, b: Punto, c: Punto) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

/** Triangulación por orejas (n ≤ 24): los triángulos quedan dentro del
 *  polígono si es simple; si no lo es, corta lo que puede. */
function triangular(p: Poligono): [Punto, Punto, Punto][] {
  const n = p.length;
  if (n < 3) return [];
  const idx = Array.from({ length: n }, (_, i) => i);
  if (areaFirmada(p) < 0) idx.reverse();
  const fuera: [Punto, Punto, Punto][] = [];
  while (idx.length > 3) {
    let corto = false;
    for (let k = 0; k < idx.length; k++) {
      const ia = idx[(k + idx.length - 1) % idx.length], ib = idx[k], ic = idx[(k + 1) % idx.length];
      const a = p[ia], b = p[ib], c = p[ic];
      if (cruz(a, b, c) <= 0) continue;
      let tapa = false;
      for (const m of idx) {
        if (m === ia || m === ib || m === ic) continue;
        const r = p[m];
        if (cruz(a, b, r) >= 0 && cruz(b, c, r) >= 0 && cruz(c, a, r) >= 0) { tapa = true; break; }
      }
      if (tapa) continue;
      fuera.push([a, b, c]);
      idx.splice(k, 1);
      corto = true;
      break;
    }
    if (!corto) break;
  }
  if (idx.length === 3) fuera.push([p[idx[0]], p[idx[1]], p[idx[2]]]);
  return fuera;
}

/**
 * El punto interior de la zona más lejos de su borde (aproximado en una
 * grilla de 16 × 16 sobre su caja, midiendo en metros): ahí va el rótulo
 * «3 · 25 %» y hacia ahí escala «Ajustar al contratado» (en una L el
 * centroide cae afuera). Si la zona es tan fina que ninguna celda cae
 * adentro, el centroide del triángulo más grande de su triangulación.
 */
export function puntoInterior(p: Poligono, ancho = 1, alto = 1): Punto {
  if (p.length === 0) return [0.5, 0.5];
  const [u0, v0, u1, v1] = cajas([p]);
  const N = 16;
  const mu = (u0 + u1) / 2, mv = (v0 + v1) / 2;
  const alMedio = (c: Punto) => Math.hypot((c[0] - mu) * ancho, (c[1] - mv) * alto);
  let mejor: Punto | null = null, dmax = -1;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const c: Punto = [u0 + ((i + 0.5) / N) * (u1 - u0), v0 + ((j + 0.5) / N) * (v1 - v0)];
      if (!adentro(c, p)) continue;
      let d = Infinity;
      for (let k = 0; k < p.length; k++) d = Math.min(d, distanciaASegmento(c, p[k], p[(k + 1) % p.length], ancho, alto));
      // A igual distancia (un rectángulo empata toda una columna), la más
      // cercana al medio de la caja: el rótulo y el escalado quedan centrados.
      if (d > dmax + 1e-12 || (mejor !== null && Math.abs(d - dmax) <= 1e-12 && alMedio(c) < alMedio(mejor) - 1e-12)) {
        dmax = Math.max(d, dmax); mejor = c;
      }
    }
  }
  if (mejor) return mejor;
  let grande: [Punto, Punto, Punto] | null = null, amax = -1;
  for (const t of triangular(p)) {
    const a = Math.abs(cruz(t[0], t[1], t[2]));
    if (a > amax) { amax = a; grande = t; }
  }
  if (grande) return [(grande[0][0] + grande[1][0] + grande[2][0]) / 3, (grande[0][1] + grande[1][1] + grande[2][1]) / 3];
  let su = 0, sv = 0;
  for (const [u, v] of p) { su += u; sv += v; }
  return [su / p.length, sv / p.length];
}

/* ── Comparar zonas ────────────────────────────────────────────────────────── */

/** Un polígono comparable: limpio (cuantizado, sin repetidos, antihorario) y
 *  arrancando por su vértice menor (u, después v): el mismo polígono escrito
 *  desde otro vértice o al revés da la misma firma. */
function firmaDePoligono(v: Poligono): string {
  const p = limpiar(v);
  let k = 0;
  for (let i = 1; i < p.length; i++) if (p[i][0] < p[k][0] || (p[i][0] === p[k][0] && p[i][1] < p[k][1])) k = i;
  return JSON.stringify([...p.slice(k), ...p.slice(0, k)]);
}

/** Las zonas de cada participación, comparables: el orden de la lista y el
 *  sentido de los vértices no cuentan (el servidor guarda antihorario). */
function porParticipacion(zs: readonly { participacionSpaceId: number; vertices: Poligono }[]): Map<number, string> {
  const listas = new Map<number, string[]>();
  for (const z of zs) {
    const l = listas.get(z.participacionSpaceId);
    const f = firmaDePoligono(z.vertices);
    if (l) l.push(f); else listas.set(z.participacionSpaceId, [f]);
  }
  const fuera = new Map<number, string>();
  for (const [s, l] of listas) fuera.set(s, l.sort().join("|"));
  return fuera;
}

/** ¿Las dos listas dicen lo mismo, participación por participación? */
export function mismasZonas(a: readonly ZonaEnEdicion[], b: readonly ZonaEnEdicion[]): boolean {
  const A = porParticipacion(a), B = porParticipacion(b);
  if (A.size !== B.size) return false;
  for (const [s, f] of A) if (B.get(s) !== f) return false;
  return true;
}

function identicas(a: readonly ZonaEnEdicion[], b: readonly ZonaEnEdicion[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i], y = b[i];
    if (x.clave !== y.clave || x.participacionSpaceId !== y.participacionSpaceId || x.vertices.length !== y.vertices.length) return false;
    for (let k = 0; k < x.vertices.length; k++) {
      if (x.vertices[k][0] !== y.vertices[k][0] || x.vertices[k][1] !== y.vertices[k][1]) return false;
    }
  }
  return true;
}

/** Las zonas del servidor, como zonas del editor (en su `orden`). */
export function desdeElServidor(zonas: readonly ZonaOut[]): ZonaEnEdicion[] {
  const orden = [...zonas].sort((a, b) => (a.orden - b.orden) || (a.id - b.id));
  return orden.map((z) => ({
    clave: `z${z.id}`, participacionSpaceId: z.participacion_space_id,
    vertices: z.vertices.map(([u, v]) => [u, v] as Punto),
  }));
}

/** Lo que se manda en el borrador o al confirmar (el orden es el `zona` de
 *  los problemas que vuelven). */
export function zonasParaEnviar(zonas: readonly ZonaEnEdicion[]): { participacion_space_id: number; vertices: Poligono }[] {
  return zonas.map((z) => ({ participacion_space_id: z.participacionSpaceId, vertices: z.vertices.map(([u, v]) => [u, v] as Punto) }));
}

/* ── El reductor ───────────────────────────────────────────────────────────── */

/** La selección que sigue valiendo con estas zonas (la zona existe y el
 *  vértice también). */
function seleccionValida(sel: EstadoDeEdicion["seleccion"], zonas: readonly ZonaEnEdicion[]): EstadoDeEdicion["seleccion"] {
  if (!sel) return null;
  const z = zonas.find((x) => x.clave === sel.zona);
  if (!z) return null;
  return { zona: sel.zona, vertice: sel.vertice !== null && sel.vertice >= 0 && sel.vertice < z.vertices.length ? sel.vertice : null };
}

/** Escribe zonas nuevas: dentro de un arrastre no apila nada (lo apila
 *  `terminarArrastre`); fuera, es un paso de deshacer. */
function conZonas(e: EstadoDeEdicion, zonas: ZonaEnEdicion[], extra: Partial<EstadoDeEdicion> = {}): EstadoDeEdicion {
  const enArrastre = e.arrastre !== null;
  const atras = enArrastre ? e.atras : [...e.atras, e.zonas].slice(-PASOS_DE_DESHACER);
  const adelante = enArrastre ? e.adelante : [];
  const sel = seleccionValida(extra.seleccion !== undefined ? extra.seleccion : e.seleccion, zonas);
  return { ...e, ...extra, zonas, atras, adelante, seleccion: sel, sucio: !mismasZonas(zonas, e.base), aviso: extra.aviso ?? null };
}

const conAviso = (e: EstadoDeEdicion, aviso: string): EstadoDeEdicion => (e.aviso === aviso ? e : { ...e, aviso });

function reemplazarZona(zonas: readonly ZonaEnEdicion[], clave: string, f: (z: ZonaEnEdicion) => ZonaEnEdicion | null): ZonaEnEdicion[] {
  const fuera: ZonaEnEdicion[] = [];
  for (const z of zonas) {
    if (z.clave !== clave) { fuera.push(z); continue; }
    const n = f(z);
    if (n) fuera.push(n);
  }
  return fuera;
}

/** Las acciones que cambian zonas: en «Mirar» no hacen nada. */
const EDITAN = new Set<Accion["tipo"]>([
  "empezarTrazo", "estirarTrazo", "agregarPunto", "quitarPunto", "cerrarTrazo", "empezarArrastre", "moverZona", "empujar",
  "moverVertice", "escalar", "insertarVertice", "borrarVertice", "borrarZona", "ajustarZonas", "ajustarBorde", "usarZonas",
  "deshacer", "rehacer", "descartarCambios",
]);

/** El reductor del editor. Devuelve el MISMO objeto si la acción no cambia
 *  nada (así la pantalla no se redibuja de balde). */
export function reducir(e: EstadoDeEdicion, a: Accion): EstadoDeEdicion {
  if (e.modo === "mirar" && EDITAN.has(a.tipo)) return e;
  switch (a.tipo) {
    case "cargar": {
      const zonas = desdeElServidor(a.zonas);
      return {
        ...e, zonas, base: zonas, seleccion: null, trazo: null, arrastre: null, atras: [], adelante: [],
        sucio: false, aviso: null, medidas: a.medidas !== undefined ? a.medidas : e.medidas,
      };
    }
    case "guardado": {
      const base = [...a.base];
      return { ...e, base, sucio: !mismasZonas(e.zonas, base) };
    }
    case "fusionar": {
      const zonas = [...a.zonas];
      const base = [...a.base];
      const atras = identicas(zonas, e.zonas) ? e.atras : [...e.atras, e.zonas].slice(-PASOS_DE_DESHACER);
      return {
        ...e, zonas, base, atras, adelante: identicas(zonas, e.zonas) ? e.adelante : [], trazo: null, arrastre: null,
        seleccion: seleccionValida(e.seleccion, zonas), sucio: !mismasZonas(zonas, base), aviso: null,
      };
    }
    case "seleccionar": {
      if (a.zona === null) return e.seleccion === null && e.aviso === null ? e : { ...e, seleccion: null, aviso: null };
      const sel = seleccionValida({ zona: a.zona, vertice: e.modo === "mirar" ? null : a.vertice ?? null }, e.zonas);
      if (sel && e.seleccion && sel.zona === e.seleccion.zona && sel.vertice === e.seleccion.vertice && e.aviso === null) return e;
      return { ...e, seleccion: sel, aviso: null };
    }
    case "empezarTrazo": {
      if (e.herramienta === "seleccionar") return e;
      if (e.activa === null) return conAviso(e, AVISO_SIN_ACTIVA);
      const p = enLaCara(a.punto);
      return { ...e, trazo: e.herramienta === "rectangulo" ? [p, p] : [p], seleccion: null, aviso: null };
    }
    case "estirarTrazo": {
      if (e.herramienta !== "rectangulo" || !e.trazo) return e;
      return { ...e, trazo: [e.trazo[0], enLaCara(a.punto)] };
    }
    case "agregarPunto": {
      if (e.herramienta !== "poligono") return e;
      if (e.activa === null) return conAviso(e, AVISO_SIN_ACTIVA);
      const p = enLaCara(a.punto);
      if (!e.trazo) return { ...e, trazo: [p], seleccion: null, aviso: null };
      const ult = e.trazo[e.trazo.length - 1];
      if (ult[0] === p[0] && ult[1] === p[1]) return e;          // el doble clic repite el punto
      if (e.trazo.length >= MAX_VERTICES) return conAviso(e, AVISO_TOPE_DE_PUNTOS);
      return { ...e, trazo: [...e.trazo, p], aviso: null };
    }
    case "quitarPunto": {
      if (e.herramienta !== "poligono" || !e.trazo) return e;
      return { ...e, trazo: e.trazo.length > 1 ? e.trazo.slice(0, -1) : null, aviso: null };
    }
    case "cancelarTrazo":
      return e.trazo === null ? e : { ...e, trazo: null, aviso: null };
    case "cerrarTrazo": {
      if (!e.trazo || e.activa === null) return e;
      let vertices: Poligono;
      if (e.herramienta === "rectangulo") {
        const [[ua, va], [ub, vb]] = [e.trazo[0], e.trazo[e.trazo.length - 1]];
        const u0 = Math.min(ua, ub), u1 = Math.max(ua, ub), v0 = Math.min(va, vb), v1 = Math.max(va, vb);
        if (u1 - u0 < MIN_EXTENSION || v1 - v0 < MIN_EXTENSION) return { ...e, trazo: null };   // un clic sin arrastre
        vertices = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
      } else {
        if (e.trazo.length < 3) return conAviso(e, AVISO_POCOS_PUNTOS);
        vertices = e.trazo.map((p) => [p[0], p[1]] as Punto);
      }
      const clave = `n${e.proxima}`;
      const zona: ZonaEnEdicion = { clave, participacionSpaceId: e.activa, vertices };
      return conZonas({ ...e, arrastre: null }, [...e.zonas, zona], { trazo: null, proxima: e.proxima + 1, seleccion: { zona: clave, vertice: null } });
    }
    case "empezarArrastre":
      return e.arrastre ? e : { ...e, arrastre: { antes: e.zonas } };
    case "moverZona": {
      const desde = e.arrastre ? e.arrastre.antes : e.zonas;
      const z = desde.find((x) => x.clave === a.clave);
      if (!z) return e;
      const movida = { ...z, vertices: trasladar(z.vertices, a.du, a.dv) };
      return conZonas(e, reemplazarZona(e.zonas, a.clave, () => movida));
    }
    case "empujar": {
      if (!e.seleccion || !e.medidas || !(e.medidas.ancho > 0) || !(e.medidas.alto > 0)) return e;
      const du = a.dx / e.medidas.ancho, dv = a.dy / e.medidas.alto;
      const { zona, vertice } = e.seleccion;
      const zonas = reemplazarZona(e.zonas, zona, (z) => (vertice === null
        ? { ...z, vertices: trasladar(z.vertices, du, dv) }
        : { ...z, vertices: z.vertices.map((p, i) => (i === vertice ? enLaCara([p[0] + du, p[1] + dv]) : p)) }));
      return identicas(zonas, e.zonas) ? e : conZonas(e, zonas);
    }
    case "moverVertice": {
      const p = enLaCara(a.punto);
      const zonas = reemplazarZona(e.zonas, a.clave, (z) => (a.vertice >= 0 && a.vertice < z.vertices.length
        ? { ...z, vertices: z.vertices.map((v, i) => (i === a.vertice ? p : v)) } : z));
      return identicas(zonas, e.zonas) ? e : conZonas(e, zonas);
    }
    case "escalar": {
      const desde = e.arrastre ? e.arrastre.antes : e.zonas;
      const z = desde.find((x) => x.clave === a.clave);
      if (!z) return e;
      const escalada = { ...z, vertices: escalarZona(z.vertices, a.manija, a.punto, !!a.proporcional) };
      return conZonas(e, reemplazarZona(e.zonas, a.clave, () => escalada));
    }
    case "terminarArrastre": {
      if (!e.arrastre) return e;
      const antes = e.arrastre.antes;
      if (identicas(antes, e.zonas)) return { ...e, arrastre: null };
      return { ...e, arrastre: null, atras: [...e.atras, antes].slice(-PASOS_DE_DESHACER), adelante: [] };
    }
    case "insertarVertice": {
      const z = e.zonas.find((x) => x.clave === a.clave);
      if (!z || a.despuesDe < 0 || a.despuesDe >= z.vertices.length) return e;
      if (z.vertices.length >= MAX_VERTICES) return conAviso(e, AVISO_TOPE_DE_PUNTOS);
      const vertices = [...z.vertices];
      vertices.splice(a.despuesDe + 1, 0, enLaCara(a.punto));
      return conZonas(e, reemplazarZona(e.zonas, a.clave, () => ({ ...z, vertices })), { seleccion: { zona: a.clave, vertice: a.despuesDe + 1 } });
    }
    case "borrarVertice": {
      const z = e.zonas.find((x) => x.clave === a.clave);
      if (!z || a.vertice < 0 || a.vertice >= z.vertices.length) return e;
      if (z.vertices.length <= 3) return conAviso(e, AVISO_TRIANGULO);
      const vertices = z.vertices.filter((_, i) => i !== a.vertice);
      return conZonas(e, reemplazarZona(e.zonas, a.clave, () => ({ ...z, vertices })), { seleccion: { zona: a.clave, vertice: null } });
    }
    case "borrarZona": {
      if (!e.zonas.some((z) => z.clave === a.clave)) return e;
      return conZonas(e, e.zonas.filter((z) => z.clave !== a.clave), { seleccion: null });
    }
    case "ajustarZonas": {
      const propias = e.zonas.filter((z) => z.participacionSpaceId === a.spaceId);
      if (propias.length !== a.vertices.length) return e;
      let k = 0;
      const zonas = e.zonas.map((z) => (z.participacionSpaceId === a.spaceId
        ? { ...z, vertices: a.vertices[k++].map((p) => enLaCara(p)) } : z));
      return identicas(zonas, e.zonas) ? e : conZonas(e, zonas);
    }
    case "ajustarBorde": {
      // «Ajustar el borde a la vecina»: un borde por clic, un paso de
      // deshacer; si no se puede, la pista dice por qué (el aviso sólo lo
      // escribe el reductor).
      const z = e.zonas.find((x) => x.clave === a.clave);
      if (!z || !e.medidas || !(e.medidas.ancho > 0) || !(e.medidas.alto > 0)) return e;
      const fuera = new Set(a.ignorar ?? []);
      const vecinas = e.zonas.filter((x) => x.clave !== a.clave && !fuera.has(x.clave)).map((x) => x.vertices);
      const r = ajustarBordeAVecina(z.vertices, vecinas, e.medidas);
      if ("motivo" in r) return conAviso(e, AVISOS_DEL_AJUSTE[r.motivo]);
      return conZonas({ ...e, arrastre: null }, reemplazarZona(e.zonas, a.clave, () => ({ ...z, vertices: r.vertices })),
        { seleccion: { zona: a.clave, vertice: null } });
    }
    case "usarZonas": {
      const otras = e.zonas.filter((z) => z.participacionSpaceId !== a.spaceId);
      const usadas = new Set(otras.map((z) => z.clave));
      let proxima = e.proxima;
      const nuevas = a.zonas.filter((z) => z.participacionSpaceId === a.spaceId).map((z) => {
        if (!usadas.has(z.clave)) { usadas.add(z.clave); return { ...z, vertices: z.vertices.map(([u, v]) => [u, v] as Punto) }; }
        const clave = `n${proxima++}`;
        usadas.add(clave);
        return { ...z, clave };
      });
      const zonas = [...otras, ...nuevas];
      return identicas(zonas, e.zonas) ? e : conZonas(e, zonas, { proxima });
    }
    case "deshacer": {
      if (e.atras.length === 0) return e;
      const zonas = e.atras[e.atras.length - 1];
      return {
        ...e, zonas, atras: e.atras.slice(0, -1), adelante: [...e.adelante, e.zonas], trazo: null, arrastre: null,
        seleccion: seleccionValida(e.seleccion, zonas), sucio: !mismasZonas(zonas, e.base), aviso: null,
      };
    }
    case "rehacer": {
      if (e.adelante.length === 0) return e;
      const zonas = e.adelante[e.adelante.length - 1];
      return {
        ...e, zonas, adelante: e.adelante.slice(0, -1), atras: [...e.atras, e.zonas].slice(-PASOS_DE_DESHACER), trazo: null,
        arrastre: null, seleccion: seleccionValida(e.seleccion, zonas), sucio: !mismasZonas(zonas, e.base), aviso: null,
      };
    }
    case "elegirHerramienta": {
      if (a.herramienta === e.herramienta && e.trazo === null) return e;
      if (a.herramienta !== "seleccionar" && (e.modo !== "editar" || e.activa === null)) {
        return e.modo === "editar" ? conAviso(e, AVISO_SIN_ACTIVA) : e;
      }
      return { ...e, herramienta: a.herramienta, trazo: null, aviso: null };
    }
    case "elegirModo": {
      if (a.modo === e.modo) return e;
      if (a.modo === "editar") return { ...e, modo: "editar", aviso: null };
      // A «Mirar»: sin herramientas, sin trazo; un arrastre a medias vuelve atrás.
      const zonas = e.arrastre ? e.arrastre.antes : e.zonas;
      return {
        ...e, modo: "mirar", herramienta: "seleccionar", trazo: null, arrastre: null, zonas,
        seleccion: e.seleccion ? seleccionValida({ zona: e.seleccion.zona, vertice: null }, zonas) : null,
        sucio: !mismasZonas(zonas, e.base), aviso: null,
      };
    }
    case "elegirActiva": {
      if (a.spaceId === e.activa) return e;
      if (a.spaceId === null && e.herramienta !== "seleccionar") return { ...e, activa: null, herramienta: "seleccionar", trazo: null };
      return { ...e, activa: a.spaceId, trazo: null, aviso: null };
    }
    case "alternarIman": return { ...e, iman: !e.iman };
    case "alternarImanAGuias": return { ...e, imanAGuias: !e.imanAGuias };
    case "alternarGuias": return { ...e, guias: !e.guias };
    case "descartarCambios": {
      if (identicas(e.zonas, e.base) && e.trazo === null) return e;
      return conZonas({ ...e, arrastre: null }, [...e.base], { trazo: null, seleccion: null });
    }
  }
}

/**
 * «Descartarlos» de la pregunta al salir o al cambiar de cara: vuelve a lo
 * último que se cargó o se guardó AUNQUE la edición esté en «Mirar». El
 * reductor no edita en «Mirar» (`EDITAN`), y con eso lo que se pidió
 * descartar seguía `sucio`: salir o cambiar de cara lo guardaba como borrador
 * (revisión final, escena-uso 1). Esto no es una acción del reductor —el
 * botón «Descartar mis cambios» sigue sin andar en «Mirar»—: es la respuesta
 * explícita a esa pregunta, y el modo queda como estaba.
 */
export function descartarEnCualquierModo(e: EstadoDeEdicion): EstadoDeEdicion {
  const enEditar: EstadoDeEdicion = e.modo === "editar" ? e : { ...e, modo: "editar" };
  const r = reducir(enEditar, { tipo: "descartarCambios" });
  if (r === enEditar) return e;
  return r.modo === e.modo ? r : { ...r, modo: e.modo };
}

/* ── El teclado ────────────────────────────────────────────────────────────── */

/**
 * La acción de una tecla, o null si la tecla no es del editor (y entonces
 * sigue su camino: letras, Tab, Enter en un botón). Esc nunca saca del modo:
 * cancela el trazo o suelta la zona elegida, y si no hay nada no hace nada.
 * Sin participación activa, R y P no hacen nada.
 */
export function accionDeTecla(e: EstadoDeEdicion, tecla: { key: string; ctrl: boolean; shift: boolean }): Accion | null {
  const k = tecla.key;
  if (tecla.ctrl) {
    if (e.modo !== "editar") return null;
    if ((k === "z" || k === "Z") && !tecla.shift) return { tipo: "deshacer" };
    if (k === "z" || k === "Z" || k === "y" || k === "Y") return { tipo: "rehacer" };
    return null;
  }
  if (k === "Escape") {
    if (e.trazo) return { tipo: "cancelarTrazo" };
    if (e.seleccion) return { tipo: "seleccionar", zona: null };
    return null;
  }
  if (k === "g" || k === "G") return { tipo: "alternarIman" };
  if (e.modo !== "editar") return null;
  switch (k) {
    case "v": case "V": return { tipo: "elegirHerramienta", herramienta: "seleccionar" };
    case "r": case "R": return e.activa !== null ? { tipo: "elegirHerramienta", herramienta: "rectangulo" } : null;
    case "p": case "P": return e.activa !== null ? { tipo: "elegirHerramienta", herramienta: "poligono" } : null;
    case "Enter": return e.trazo && e.herramienta === "poligono" ? { tipo: "cerrarTrazo" } : null;
    case "Backspace": case "Delete": {
      // Retroceso, en medio de un polígono, saca el último punto.
      if (k === "Backspace" && e.trazo && e.herramienta === "poligono") return { tipo: "quitarPunto" };
      if (e.trazo || !e.seleccion) return null;
      const { zona, vertice } = e.seleccion;
      return vertice !== null ? { tipo: "borrarVertice", clave: zona, vertice } : { tipo: "borrarZona", clave: zona };
    }
    case "ArrowLeft": case "ArrowRight": case "ArrowUp": case "ArrowDown": {
      if (!e.seleccion || e.trazo) return null;
      const paso = PASO_DE_FLECHA_M * (tecla.shift ? 10 : 1);
      const dx = k === "ArrowLeft" ? -paso : k === "ArrowRight" ? paso : 0;
      const dy = k === "ArrowDown" ? -paso : k === "ArrowUp" ? paso : 0;
      return { tipo: "empujar", dx, dy };
    }
  }
  return null;
}

/* ── El imán ───────────────────────────────────────────────────────────────── */

/**
 * Lleva el punto al vértice más cercano dentro del radio y, si no hay, al
 * punto más cercano de una arista dentro del radio; si nada cae adentro, lo
 * deja como está. `radioUV` en u,v: un número, o `{u, v}` cuando la cara no es
 * cuadrada (el radio de 6 px de pantalla mide distinto en u y en v). No es una
 * cuadrícula ni una atracción a baldas: los objetivos los arma
 * `objetivosDelIman` (otras zonas y el borde; guías sólo a pedido), se apaga
 * con G y nunca cambia una zona ya dibujada.
 */
export function imantar(p: Punto, objetivos: readonly Punto[], segmentos: readonly (readonly [Punto, Punto])[],
  radioUV: number | { u: number; v: number }): Punto {
  const ru = typeof radioUV === "number" ? radioUV : radioUV.u;
  const rv = typeof radioUV === "number" ? radioUV : radioUV.v;
  if (!(ru > 0) || !(rv > 0)) return p;
  const lejos = (a: Punto, b: Punto) => Math.hypot((a[0] - b[0]) / ru, (a[1] - b[1]) / rv);
  let mejor: Punto | null = null, dmin = Infinity;
  for (const o of objetivos) {
    const d = lejos(p, o);
    if (d <= 1 && d < dmin) { dmin = d; mejor = o; }
  }
  if (mejor) return [mejor[0], mejor[1]];
  for (const [a, b] of segmentos) {
    // La proyección, en el espacio donde el radio es un círculo.
    const ax = a[0] / ru, ay = a[1] / rv, bx = b[0] / ru, by = b[1] / rv, px = p[0] / ru, py = p[1] / rv;
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
    const c: Punto = [q((ax + t * dx) * ru), q((ay + t * dy) * rv)];
    const d = lejos(p, c);
    if (d <= 1 && d < dmin) { dmin = d; mejor = c; }
  }
  return mejor ?? p;
}

const BORDE: Poligono = [[0, 0], [1, 0], [1, 1], [0, 1]];

/** A qué imanta un punto: los vértices y las aristas de las OTRAS zonas (no
 *  la que se mueve, `excluir`), las esquinas y el borde de la cara y, sólo
 *  con el imán a guías prendido, los entrepaños y los parantes. */
export function objetivosDelIman(e: Pick<EstadoDeEdicion, "zonas" | "imanAGuias">, excluir: string | null,
  guias?: { entrepanos: readonly number[]; parantes: readonly number[] }):
  { objetivos: Punto[]; segmentos: [Punto, Punto][] } {
  const objetivos: Punto[] = [], segmentos: [Punto, Punto][] = [];
  const conPoligono = (p: Poligono) => {
    for (let i = 0; i < p.length; i++) {
      objetivos.push(p[i]);
      segmentos.push([p[i], p[(i + 1) % p.length]]);
    }
  };
  for (const z of e.zonas) if (z.clave !== excluir) conPoligono(z.vertices);
  conPoligono(BORDE);
  if (e.imanAGuias && guias) {
    for (const v of guias.entrepanos) segmentos.push([[0, v], [1, v]]);
    for (const u of guias.parantes) segmentos.push([[u, 0], [u, 1]]);
  }
  return { objetivos, segmentos };
}

/**
 * El imán de una zona que se MUEVE entera: se imanta cada vértice desplazado
 * (du, dv) y gana el que queda más cerca de su objetivo, medido en metros
 * (`ancho` × `alto`); los demás lo siguen. Devuelve el desplazamiento ya
 * imantado (el mismo si nada cae en el radio). Es la cuenta que antes vivía
 * en línea en el lienzo: la usan el lienzo y el 3D («Editar en el 3D»), así
 * los dos pegan igual. `radio` en u,v, como en `imantar`.
 */
export function imantarTraslado(z: Poligono, du: number, dv: number, objetivos: readonly Punto[],
  segmentos: readonly (readonly [Punto, Punto])[], radio: number | { u: number; v: number }, ancho: number, alto: number): [number, number] {
  let mejor: [number, number] | null = null, dmin = Infinity;
  for (const q of z) {
    const a: Punto = [q[0] + du, q[1] + dv];
    const b = imantar(a, objetivos, segmentos, radio);
    const dd = Math.hypot((b[0] - a[0]) * ancho, (b[1] - a[1]) * alto);
    if ((b[0] !== a[0] || b[1] !== a[1]) && dd < dmin) { dmin = dd; mejor = [b[0] - a[0], b[1] - a[1]]; }
  }
  return mejor ? [du + mejor[0], dv + mejor[1]] : [du, dv];
}

/* ── Ajustar al contratado ─────────────────────────────────────────────────── */

/**
 * Achica las zonas de UNA participación hasta que lo dibujado no pase su
 * contratado. Cada zona escala hacia su punto interior (`puntoInterior`, no
 * el centroide: en una L cae afuera), con búsqueda binaria sobre el factor y
 * sobre vértices YA cuantizados, y se queda con el mayor factor cuyo valor
 * crudo `10000 · área / areaUtil` es ≤ tope, sin redondear: queda al menos
 * medio pb lejos del filo donde `floor(x + 0.5)` pasa a `tope + 1`, y una
 * diferencia de un bit con el servidor no lo cambia.
 *
 * Si el resultado pisa a otra participación con fechas cruzadas (`otras`: sus
 * zonas, ya filtradas por fechas), sigue achicando hasta que no (con `cara`,
 * el umbral es el del servidor, 1 cm²; sin ella, cualquier pisada). Escalar
 * hacia un punto puede meter una zona que no es estrellada (una U) en su
 * propio hueco, y ahí puede estar otra marca. Si no se puede —el punto
 * interior de una zona cae dentro de otra, o para no pisar habría que dejarla
 * con menos de la mitad del contratado (`MIN_FRACCION_SIN_PISAR`): una U con
 * otra marca adentro de su hueco—, devuelve lo que tenía (lo que ya no pasa
 * el tope) y la revisión marca el solape. Sin exceso, devuelve las zonas como
 * estaban.
 */
/** «Ajustar al contratado» no deja una participación con menos de esta
 *  fracción de su contratado sólo para no pisar a otra: prefiere dejar el
 *  solape a la vista (lo marca la revisión) antes que borrarle la zona. */
export const MIN_FRACCION_SIN_PISAR = 0.5;

export function ajustarAlContratado(zonasS: readonly Poligono[], E: readonly Exclusion[], topePb: number, areaUtil: number,
  otras: readonly (readonly Poligono[])[], cara?: { ancho: number; alto: number }): Poligono[] {
  const copia = () => zonasS.map((z) => z.map(([u, v]) => [u, v] as Punto));
  if (zonasS.length === 0 || !(areaUtil > 0)) return copia();
  const crudo = (P: Poligono[]) => (10000 * areaCubierta(P, E)) / areaUtil;
  if (crudo(copia()) <= topePb) return copia();
  const W = cara?.ancho ?? 1, H = cara?.alto ?? 1;
  const centros = zonasS.map((z) => puntoInterior(z, W, H));
  const escalado = (f: number): Poligono[] => zonasS.map((z, i) => {
    const [cu, cv] = centros[i];
    return z.map(([u, v]) => [q(recorte(cu + f * (u - cu))), q(recorte(cv + f * (v - cv)))] as Punto);
  });
  let lo = 0, hi = 1;
  for (let k = 0; k < 40; k++) {
    const m = (lo + hi) / 2;
    if (crudo(escalado(m)) <= topePb) lo = m; else hi = m;
  }
  let mejor = escalado(lo);
  const Q: Poligono[] = [];
  for (const l of otras) for (const p of l) Q.push(p);
  if (Q.length > 0) {
    // La mitad del umbral del servidor (1 cm²): lejos de su filo, como el
    // medio pb del tope.
    const umbral = cara ? AREA_MINIMA_M2 / (W * H) / 2 : 0;
    const pisa = (P: Poligono[]) => areaCubierta(P, E, Q) > umbral;
    const sePuede = centros.every((c) => !Q.some((p) => adentro(c, p)));
    if (pisa(mejor) && sePuede) {
      let lo2 = 0, hi2 = lo;
      for (let k = 0; k < 40; k++) {
        const m = (lo2 + hi2) / 2;
        if (pisa(escalado(m))) hi2 = m; else lo2 = m;
      }
      const sinPisar = escalado(lo2);
      const minima = cara ? AREA_MINIMA_M2 / (W * H) : 1e-12;
      const vivas = sinPisar.every((z) => Math.abs(areaFirmada(z)) >= minima);
      if (lo2 > 0 && vivas && !pisa(sinPisar) && crudo(sinPisar) >= MIN_FRACCION_SIN_PISAR * topePb) mejor = sinPisar;
    }
  }
  return mejor;
}

/* ── Ajustar el borde a la vecina ──────────────────────────────────────────── */

/** Hasta dónde se ajusta un borde (hueco o solape), en metros. */
export const DISTANCIA_MAXIMA_DE_AJUSTE_M = 0.05;
/** Cuánto pueden diferir de «de frente» las normales de los dos bordes. */
export const ANGULO_MAXIMO_DE_AJUSTE_RAD = (10 * Math.PI) / 180;
/** El tramo que comparten los dos bordes, como fracción del más corto. */
export const TRAMO_MINIMO_DE_AJUSTE = 0.3;
/** Más cerca que esto (en metros) el borde ya está pegado. */
const YA_PEGADA_M = 1e-4;
/** Un punto se desliza por su otra arista sólo si ésta corta al borde de la
 *  vecina con al menos 20°; si no, va perpendicular al borde. */
const SENO_RASANTE = Math.sin((20 * Math.PI) / 180);
/** Ni deslizándose un punto se va más lejos que esto (metros). */
const DESLIZ_MAXIMO_M = 3 * DISTANCIA_MAXIMA_DE_AJUSTE_M;

export type AjusteDeBorde =
  | { vertices: Poligono; borde: number; vecina: number; distanciaM: number }
  | { motivo: "SIN_VECINA" | "YA_PEGADA" | "NO_QUEDA_LIMPIA" };

const AVISOS_DEL_AJUSTE: Record<"SIN_VECINA" | "YA_PEGADA" | "NO_QUEDA_LIMPIA", string> = {
  SIN_VECINA: AVISO_SIN_VECINA, YA_PEGADA: AVISO_YA_PEGADA, NO_QUEDA_LIMPIA: AVISO_NO_QUEDA_LIMPIA,
};

type Metros = [number, number];
/** +1 si el polígono (en metros) es antihorario, −1 si es horario. */
const sentido = (p: readonly Metros[]): number => {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s >= 0 ? 1 : -1;
};
/** La normal hacia AFUERA del borde a → b de un polígono de ese sentido. */
const normalAfuera = (a: Metros, b: Metros, s: number): Metros => {
  const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
  return [(s * dy) / l, (-s * dx) / l];
};

/**
 * «Ajustar el borde a la vecina»: pega UN borde de la zona al borde de
 * enfrente de una vecina, hasta 5 cm (hueco o solape), moviendo sólo los dos
 * puntos de ese borde. Todo en METROS (u·ancho, v·alto), así los ángulos y
 * las distancias son los de verdad:
 *
 *   1. Candidatos: cada par (borde e de la zona, borde f de una vecina) que se
 *      MIRAN de frente (normales hacia afuera opuestas, hasta 10°; el sentido
 *      de cada polígono se calcula, así una zona horaria da lo mismo), se
 *      ACOMPAÑAN (la proyección de f sobre la recta de e comparte al menos el
 *      30 % del más corto) y están CERCA (0,1 mm < |λ| ≤ 5 cm, λ desde el
 *      medio del tramo compartido hasta la recta de f, a lo largo de la
 *      normal de e: + hueco, − se pisan; |λ| ≤ 0,1 mm es «ya pegada»).
 *   2. Orden: menor |λ|; a igual, mayor tramo; después el menor índice de
 *      borde, de vecina y de borde de la vecina (determinista).
 *   3. El movimiento: los dos puntos de e van hasta la recta de f, cada uno
 *      DESLIZÁNDOSE por su otra arista (un rectángulo sigue rectángulo y las
 *      esquinas sobre el borde de la cara se quedan ahí); si esa arista es casi
 *      paralela a f (menos de 20°) o el deslizamiento pasa de 15 cm, el punto
 *      va perpendicular a e. Después, recorte a la cara y cuantización, y se
 *      sacan los puntos consecutivos repetidos (si quedan tres o más).
 *   4. Se acepta el primer candidato cuyo resultado pasa `validarZona`, pisa a
 *      esa vecina menos de medio cm² (la mitad del umbral del servidor, como
 *      «Ajustar al contratado») y no pisa a ninguna otra más que antes (o más
 *      que medio cm²). Si ninguno, no cambia nada y dice por qué.
 *
 * No pega a entrepaños, parantes ni zócalo (el pedido no deja imponer la
 * atracción a baldas) ni al borde de la cara (eso lo hace el imán), y no mira
 * lo contratado: es dibujo, no comercio (cerrar un hueco agranda la zona; la
 * revisión en vivo lo marca y Ctrl+Z lo deshace).
 */
export function ajustarBordeAVecina(zona: Poligono, vecinas: readonly Poligono[], cara: { ancho: number; alto: number }): AjusteDeBorde {
  const W = cara.ancho, H = cara.alto;
  if (!(W > 0) || !(H > 0)) return { motivo: "SIN_VECINA" };
  const aMetros = (p: Punto): Metros => [p[0] * W, p[1] * H];
  const Z = zona.map(aMetros);
  const n = Z.length;
  if (n < 3) return { motivo: "SIN_VECINA" };
  const sZ = sentido(Z);
  const cosFrente = Math.cos(ANGULO_MAXIMO_DE_AJUSTE_RAD);
  type Candidato = { i: number; k: number; j: number; lam: number; largo: number; c: Metros; nf: Metros };
  const candidatos: Candidato[] = [];
  let pegada = false;
  vecinas.forEach((vp, k) => {
    const N = vp.map(aMetros);
    if (N.length < 3) return;
    const sN = sentido(N);
    for (let i = 0; i < n; i++) {
      const a = Z[i], b = Z[(i + 1) % n];
      const le = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (le < 1e-9) continue;
      const te: Metros = [(b[0] - a[0]) / le, (b[1] - a[1]) / le];
      const ne = normalAfuera(a, b, sZ);
      for (let j = 0; j < N.length; j++) {
        const c = N[j], d = N[(j + 1) % N.length];
        const lf = Math.hypot(d[0] - c[0], d[1] - c[1]);
        if (lf < 1e-9) continue;
        const nf = normalAfuera(c, d, sN);
        const cos = ne[0] * nf[0] + ne[1] * nf[1];
        if (!(cos <= -cosFrente)) continue;                                   // no se miran de frente
        const sc = (c[0] - a[0]) * te[0] + (c[1] - a[1]) * te[1];
        const sd = (d[0] - a[0]) * te[0] + (d[1] - a[1]) * te[1];
        const s0 = Math.max(0, Math.min(sc, sd)), s1 = Math.min(le, Math.max(sc, sd));
        const largo = s1 - s0;
        if (!(largo >= TRAMO_MINIMO_DE_AJUSTE * Math.min(le, lf))) continue;   // no se acompañan
        const sm = (s0 + s1) / 2;
        const p: Metros = [a[0] + sm * te[0], a[1] + sm * te[1]];
        const lam = ((c[0] - p[0]) * nf[0] + (c[1] - p[1]) * nf[1]) / cos;  // + hueco, − se pisan
        if (Math.abs(lam) > DISTANCIA_MAXIMA_DE_AJUSTE_M) continue;
        if (Math.abs(lam) <= YA_PEGADA_M) { pegada = true; continue; }
        candidatos.push({ i, k, j, lam, largo, c, nf });
      }
    }
  });
  if (candidatos.length === 0) return { motivo: pegada ? "YA_PEGADA" : "SIN_VECINA" };
  candidatos.sort((x, y) => (Math.abs(x.lam) - Math.abs(y.lam)) || (y.largo - x.largo) || (x.i - y.i) || (x.k - y.k) || (x.j - y.j));
  const umbral = AREA_MINIMA_M2 / (W * H) / 2;
  const pisa = (P: Poligono, Q: Poligono) => areaCubierta([P], [], [Q]);
  for (const cd of candidatos) {
    const { i, c, nf } = cd;
    const ne = normalAfuera(Z[i], Z[(i + 1) % n], sZ);
    const hastaF = (p: Metros, w: Metros): Metros | null => {
      const den = w[0] * nf[0] + w[1] * nf[1];
      if (Math.abs(den) < 1e-12) return null;
      const mu = ((c[0] - p[0]) * nf[0] + (c[1] - p[1]) * nf[1]) / den;
      return [p[0] + mu * w[0], p[1] + mu * w[1]];
    };
    /** El punto p llevado a la recta de f, deslizándose hacia `vecino`. */
    const llevar = (p: Metros, vecino: Metros): Metros => {
      const perpendicular = hastaF(p, ne) ?? p;
      const dx = vecino[0] - p[0], dy = vecino[1] - p[1], l = Math.hypot(dx, dy);
      if (!(l > 1e-12)) return perpendicular;
      const w: Metros = [dx / l, dy / l];
      if (Math.abs(w[0] * nf[0] + w[1] * nf[1]) < SENO_RASANTE) return perpendicular;
      const q = hastaF(p, w);
      if (!q || Math.hypot(q[0] - p[0], q[1] - p[1]) > DESLIZ_MAXIMO_M) return perpendicular;
      return q;
    };
    const ia = i, ib = (i + 1) % n;
    const nuevoA = llevar(Z[ia], Z[(ia - 1 + n) % n]);
    const nuevoB = llevar(Z[ib], Z[(ib + 1) % n]);
    const crudo: Poligono = zona.map((p, idx) => (
      idx === ia ? enLaCara([nuevoA[0] / W, nuevoA[1] / H]) : idx === ib ? enLaCara([nuevoB[0] / W, nuevoB[1] / H]) : [p[0], p[1]]
    ) as Punto);
    const V = sinPuntosRepetidos(crudo);
    if (validarZona(V, W, H).codigo !== null) continue;
    let limpia = true;
    for (let k = 0; k < vecinas.length && limpia; k++) {
      const antes = pisa(zona, vecinas[k]), despues = pisa(V, vecinas[k]);
      if (despues > umbral && despues > antes + 1e-12) limpia = false;   // no pisa a nadie más que antes
      if (k === cd.k && despues > umbral) limpia = false;               // y con la elegida queda sin pisarse
    }
    if (!limpia) continue;
    return { vertices: V, borde: i, vecina: cd.k, distanciaM: cd.lam };
  }
  return { motivo: "NO_QUEDA_LIMPIA" };
}

/** Sin puntos consecutivos repetidos (tampoco el último igual al primero),
 *  si quedan tres o más; si no, como estaba (y `validarZona` lo rechaza). */
function sinPuntosRepetidos(p: Poligono): Poligono {
  const fuera: Poligono = [];
  for (const q of p) {
    const ult = fuera[fuera.length - 1];
    if (ult && ult[0] === q[0] && ult[1] === q[1]) continue;
    fuera.push(q);
  }
  while (fuera.length > 1 && fuera[0][0] === fuera[fuera.length - 1][0] && fuera[0][1] === fuera[fuera.length - 1][1]) fuera.pop();
  return fuera.length >= 3 ? fuera : p;
}

/* ── Fusión de tres vías (§9.8) ────────────────────────────────────────────── */

/**
 * Otra sesión guardó mientras se editaba (409 `version_vieja`): se combina por
 * participación. Si acá no se tocó (mías = base), gana lo del servidor; si la
 * otra sesión no la tocó (suyas = base), gana lo de acá; si las dos la
 * cambiaron igual, da lo mismo; si la cambiaron distinto es un CONFLICTO:
 * queda lo del servidor, y `conflictos` dice qué participaciones (spaceId)
 * para ofrecer «Usar lo mío». Se compara sin mirar el orden de la lista ni el
 * sentido de los vértices.
 */
export function fusionarZonas(base: readonly ZonaEnEdicion[], mias: readonly ZonaEnEdicion[], suyas: readonly ZonaOut[]):
  { zonas: ZonaEnEdicion[]; conflictos: number[] } {
  const delServidor = desdeElServidor(suyas);
  const B = porParticipacion(base), M = porParticipacion(mias), S = porParticipacion(delServidor);
  const todas = new Set<number>([...B.keys(), ...M.keys(), ...S.keys()]);
  const mio = new Set<number>(), conflictos: number[] = [];
  for (const s of todas) {
    const b = B.get(s) ?? "", m = M.get(s) ?? "", x = S.get(s) ?? "";
    if (m === b || m === x) continue;          // gana (o coincide con) lo del servidor
    if (x === b) { mio.add(s); continue; }     // la otra sesión no la tocó
    conflictos.push(s);                        // las dos la cambiaron distinto: queda lo suyo
  }
  const zonas: ZonaEnEdicion[] = [];
  for (const z of delServidor) if (!mio.has(z.participacionSpaceId)) zonas.push(z);
  const usadas = new Set(zonas.map((z) => z.clave));
  for (const z of mias) {
    if (!mio.has(z.participacionSpaceId)) continue;
    // Una zona mía con la misma clave que una del servidor (las dos salieron
    // de la misma `z<id>`): la clave sigue siendo única porque la del
    // servidor de esa participación no entró.
    if (usadas.has(z.clave)) continue;
    usadas.add(z.clave);
    zonas.push(z);
  }
  return { zonas, conflictos: conflictos.sort((a, b) => a - b) };
}

/* ── Qué cambia al confirmar ───────────────────────────────────────────────── */

export interface CambioDeParticipacion {
  spaceId: number;
  dibujadoAntes: number;
  dibujadoDespues: number;
  agregadas: number;
  borradas: number;
  cambiadas: number;
}
export interface ResumenDeCambios {
  participaciones: CambioDeParticipacion[];
  agregadas: number;
  borradas: number;
  cambiadas: number;
  hayCambios: boolean;
}

/**
 * Lo que cambia al confirmar, por participación: «dibujado 20 % → 24,1 %» y
 * cuántas zonas se agregan, se borran o cambian. `antes` es la capa
 * confirmada del servidor; `despues`, lo que se va a mandar. Las cuentas son
 * las de `juzgar` (o cualquier mapa con `dibujado`) de cada lado.
 */
export function diferencias(antes: readonly ZonaOut[], despues: readonly ZonaEnEdicion[],
  cuentasAntes: ReadonlyMap<number, { dibujado: number }>, cuentasDespues: ReadonlyMap<number, { dibujado: number }>): ResumenDeCambios {
  const porId = new Map<string, ZonaOut>();
  for (const z of antes) porId.set(`z${z.id}`, z);
  const filas = new Map<number, CambioDeParticipacion>();
  const fila = (s: number) => {
    let f = filas.get(s);
    if (!f) {
      f = { spaceId: s, dibujadoAntes: cuentasAntes.get(s)?.dibujado ?? 0, dibujadoDespues: cuentasDespues.get(s)?.dibujado ?? 0, agregadas: 0, borradas: 0, cambiadas: 0 };
      filas.set(s, f);
    }
    return f;
  };
  const vistas = new Set<string>();
  const sueltas: ZonaEnEdicion[] = [];
  for (const z of despues) {
    const viejo = porId.get(z.clave);
    if (!viejo || viejo.participacion_space_id !== z.participacionSpaceId) { sueltas.push(z); continue; }
    vistas.add(z.clave);
    if (firmaDePoligono(viejo.vertices) !== firmaDePoligono(z.vertices)) fila(z.participacionSpaceId).cambiadas++;
  }
  // Las claves sólo se reconocen si la edición salió de ESA capa: cargada del
  // borrador, o después de un guardado o una confirmación (el servidor numera
  // las zonas de nuevo cada vez), una zona idéntica tiene otra clave. Una zona
  // que sigue igual, de la misma participación, es la misma zona: ni se
  // agregó ni se borró.
  const sinPareja = new Map<string, { spaceId: number; n: number }>();
  for (const [clave, z] of porId) {
    if (vistas.has(clave)) continue;
    const k = `${z.participacion_space_id}|${firmaDePoligono(z.vertices)}`;
    const ya = sinPareja.get(k);
    if (ya) ya.n++; else sinPareja.set(k, { spaceId: z.participacion_space_id, n: 1 });
  }
  for (const z of sueltas) {
    const ya = sinPareja.get(`${z.participacionSpaceId}|${firmaDePoligono(z.vertices)}`);
    if (ya && ya.n > 0) { ya.n--; continue; }
    fila(z.participacionSpaceId).agregadas++;
  }
  for (const { spaceId, n } of sinPareja.values()) if (n > 0) fila(spaceId).borradas += n;
  for (const s of new Set([...cuentasAntes.keys(), ...cuentasDespues.keys()])) {
    if ((cuentasAntes.get(s)?.dibujado ?? 0) !== (cuentasDespues.get(s)?.dibujado ?? 0)) fila(s);
  }
  const participaciones = [...filas.values()].sort((a, b) => a.spaceId - b.spaceId);
  let agregadas = 0, borradas = 0, cambiadas = 0;
  for (const f of participaciones) { agregadas += f.agregadas; borradas += f.borradas; cambiadas += f.cambiadas; }
  return { participaciones, agregadas, borradas, cambiadas, hayCambios: participaciones.length > 0 };
}

/* ── La revisión en vivo ───────────────────────────────────────────────────── */

/** Medir y juzgar las zonas de la edición con las mismas funciones que el
 *  servidor (al soltar, al cerrar un trazo, al borrar; nunca por movimiento). */
export function revisarZonas(zonas: readonly ZonaEnEdicion[],
  sup: { exclusiones: readonly Exclusion[]; ancho: number; alto: number; orientacion?: "frente" | "arriba" },
  terminosPorS: ReadonlyMap<number, readonly Termino[]>, hoy: string, opciones: OpcionesDeJuicio = {}):
  { medidas: Medidas; juicio: Juicio } {
  const medidas = medir(zonas.map((z) => ({ participacionSpaceId: z.participacionSpaceId, vertices: z.vertices })), sup);
  const juicio = juzgar(medidas, terminosPorS, hoy, { orientacion: sup.orientacion, ...opciones });
  return { medidas, juicio };
}
