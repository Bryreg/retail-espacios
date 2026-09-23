/**
 * Dónde va cada letra de la escalera, sin que ninguna pise a otra.
 *
 * Sale de una captura del dueño (2026-09-23, TERRON): un contrato que arranca
 * MAÑANA pone su fecha y su chip a 43 px del borde izquierdo, y ahí vivían otras
 * dos cosas —«hoy · 23 sep» en el renglón de las fechas y «PUN · PUNTA DE
 * GÓNDOLA» en el de los chips—. Las tres se dibujaban encimadas y no se leía
 * ninguna. No es un caso raro: los contratos arrancan y se caen cerca de hoy
 * todo el tiempo, y el borde izquierdo es justamente donde caen.
 *
 * Las reglas, que es todo lo que hace este archivo:
 *
 *   · **La leyenda de los tipos no comparte renglón con los chips.** Sube al
 *     del título, a la derecha, que está vacío desde que la lectura del cursor
 *     se mudó al encabezado del panel. En el renglón de los chips sólo hay
 *     chips.
 *   · **Una fecha sólo se dibuja si entra.** «hoy · 23 sep» cede su lugar a
 *     la fecha del primer cambio: ésa es el dato del gráfico, y hoy es el borde
 *     izquierdo aunque no lo diga. No se acorta a «hoy»: pegado a «24 sep» se
 *     lee «hoy 24 sep», que dice que hoy es otro día. Dos cambios que caen más
 *     cerca de lo que miden sus fechas se quedan con una sola columna —la de
 *     más a la izquierda—, con su fecha y sus chips JUNTOS: una fecha sin chips
 *     o chips sin fecha no dicen qué pasa ese día.
 *   · **Las cifras de los escalones no se tapan entre sí** ni con la nota del
 *     primer tramo. La que no entra cede: el cursor la lee igual.
 *
 * Aritmética pura y sin DOM, para poder probarla sin navegador
 * (`scripts/probar-libera.mjs`). Los anchos salen de la cuenta de letras: la
 * familia es mono, así que el ancho es letras × avance, y el avance de las
 * monos del sistema (SF Mono, Menlo, Cascadia, JetBrains, Liberation) es 0,6
 * em. Consolas mide 0,55: sobra aire, que es el error del lado bueno.
 */

export interface Caja {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/** Aire mínimo entre dos textos del mismo renglón, en px de pantalla. */
export const AIRE = 8;

/** El avance de una letra mono, en em. */
export const AVANCE_MONO = 0.6;

/** Ancho de un texto mono de `px` de cuerpo con `espaciado` em entre letras. */
export function anchoMono(txt: string, px: number, espaciado = 0): number {
  return [...txt].length * px * (AVANCE_MONO + espaciado);
}

export function chocan(a: Caja, b: Caja, aire = 0): boolean {
  return a.x0 - aire < b.x1 && b.x0 - aire < a.x1
      && a.y0 - aire < b.y1 && b.y0 - aire < a.y1;
}

const entre = (v: number, lo: number, hi: number) =>
  hi < lo ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v));

// ─── El renglón de las fechas y las columnas de chips ────────────────────────

export interface FechasIn {
  X0: number;
  X1: number;
  /** Dónde cae cada día sobre el eje. */
  x: (i: number) => number;
  /** Los días en que la cuenta cambia, en orden, con su fecha escrita. */
  cambios: { i: number; fecha: string }[];
  /** La fecha de hoy, escrita igual que las otras («23 sep»). */
  hoy: string;
  /** Cuerpo de las fechas en px. */
  pxFecha: number;
  /** Ancho de un chip de código. */
  chipW: number;
}

export interface Columna {
  /** El día del cambio. */
  i: number;
  /** Centro de la columna: la fecha bajo el eje y los chips debajo. */
  cx: number;
}

export interface FechasOut {
  /** «hoy · 23 sep», o nada si el primer cambio necesita ese lugar. */
  hoy: string | null;
  columnas: Columna[];
}

/**
 * Las columnas: una por cambio que entre, con la fecha y los chips centrados
 * en el mismo eje.
 *
 * Una columna se puede correr a la derecha para esquivar a la anterior, pero
 * poco: su fecha tiene que seguir TAPANDO su diente del peine (a 2 px de cada
 * borde como mínimo). Más corrida, la fecha se lee como la del día de al lado.
 * Si no alcanza, el cambio se queda sin columna —su escalón y su cifra siguen
 * ahí, y el cursor lo lee— en vez de dibujarse encima de otro.
 *
 * Los bordes del panel sí pueden correrla más: ahí no hay día de al lado con
 * el cual confundirla, y cortarla por la mitad sería peor.
 */
export function acomodarFechas(e: FechasIn): FechasOut {
  const { X0, X1, x, cambios, hoy, pxFecha, chipW } = e;
  const ancho = (t: string) => anchoMono(t, pxFecha);
  const largo = `hoy · ${hoy}`;

  /** Dónde cae la columna del cambio `c` si la última fecha termina en
   *  `finFecha` y la última columna de chips está centrada en `chipPrevio`, o
   *  `null` si no entra. */
  const ubicar = (c: { i: number; fecha: string }, finFecha: number, chipPrevio: number) => {
    const w = ancho(c.fecha);
    const medio = Math.max(w, chipW) / 2;
    const xi = x(c.i);
    const lo = X0 + medio;
    const hi = X1 - medio;
    const minimo = Math.max(xi, finFecha + AIRE + w / 2, chipPrevio + chipW + 2);
    const cx = entre(minimo, lo, hi);
    // Cedió ante el borde izquierdo o el derecho: se acepta tal cual.
    const porBorde = (cx === lo && minimo <= lo) || (cx === hi && xi >= hi);
    if (!porBorde && cx - xi > w / 2 - 2) return null;
    // No puede quedar encima de lo anterior aunque el borde la haya empujado.
    if (cx - w / 2 < finFecha + AIRE || cx - chipPrevio < chipW + 2) return null;
    return { cx, fin: cx + w / 2 };
  };

  let rotHoy: string | null = largo;
  /** Borde derecho de la última fecha puesta. Detrás de «hoy · 23 sep» va el
   *  doble de aire: es la única fecha que no está debajo de un escalón, y
   *  pegada a la siguiente se leían como una sola. */
  let fin = X0 + ancho(largo) + AIRE;
  /** Centro de la última columna de chips. */
  let chipPrevio = -Infinity;
  const columnas: Columna[] = [];

  for (const c of cambios) {
    let puesto = ubicar(c, fin, chipPrevio);
    // El primer cambio le gana el lugar a «hoy». La fecha del cambio es el
    // dato; hoy es el borde izquierdo aunque no lo diga.
    if (!puesto && columnas.length === 0 && rotHoy !== null) {
      puesto = ubicar(c, -Infinity, chipPrevio);
      if (puesto) rotHoy = null;
    }
    if (!puesto) continue;
    columnas.push({ i: c.i, cx: puesto.cx });
    fin = puesto.fin;
    chipPrevio = puesto.cx;
  }

  return { hoy: rotHoy, columnas };
}

// ─── Las cifras de los escalones ─────────────────────────────────────────────

export interface Cifra {
  /** Donde arranca el texto (ancla a la izquierda). */
  x: number;
  /** Línea de base. */
  y: number;
  txt: string;
}

/** La caja de una cifra de `px` de cuerpo. Arriba de la base va el ojo de la
 *  cifra (0,75 em); abajo, casi nada. */
export function cajaDeCifra(c: Cifra, px: number, espaciado = 0): Caja {
  return { x0: c.x, x1: c.x + anchoMono(c.txt, px, espaciado), y0: c.y - 0.78 * px, y1: c.y + 0.22 * px };
}

/** Cuáles se dibujan. La primera siempre: es el punto de partida. Las demás,
 *  si no tapan a ninguna de las ya puestas. */
export function cifrasQueEntran(cifras: Cifra[], px: number, espaciado = 0): boolean[] {
  const puestas: Caja[] = [];
  return cifras.map((c, k) => {
    const b = cajaDeCifra(c, px, espaciado);
    if (k > 0 && puestas.some((o) => chocan(b, o, 3))) return false;
    puestas.push(b);
    return true;
  });
}

/** La primera variante de la nota que cabe entre `desde` y `hasta`. */
export function notaQueEntra(desde: number, hasta: number, variantes: string[], px: number): string | null {
  for (const v of variantes) {
    if (desde + anchoMono(v, px) + AIRE <= hasta) return v;
  }
  return null;
}

// ─── La leyenda de los tipos, en el renglón del título ───────────────────────

export interface Rotulo {
  /** Donde arranca (ancla a la izquierda). */
  x: number;
  txt: string;
}

/** Las entradas que caben a la derecha del título, en orden de lectura y
 *  alineadas contra `hasta`. Se sueltan desde la última: la primera es la del
 *  primer cambio, que es la que más se mira. */
export function leyendaQueEntra(
  desde: number,
  hasta: number,
  entradas: string[],
  px: number,
  espaciado: number,
  separacion: number,
): Rotulo[] {
  const anchos = entradas.map((t) => anchoMono(t, px, espaciado));
  let n = entradas.length;
  const total = (k: number) =>
    anchos.slice(0, k).reduce((a, w) => a + w, 0) + separacion * Math.max(0, k - 1);
  while (n > 0 && hasta - total(n) < desde + 3 * AIRE) n--;
  const salida: Rotulo[] = [];
  let xx = hasta - total(n);
  for (let k = 0; k < n; k++) {
    salida.push({ x: xx, txt: entradas[k] });
    xx += anchos[k] + separacion;
  }
  return salida;
}
