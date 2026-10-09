/**
 * Lo que se le hace a la foto ya recortada antes de envolver el envase.
 *
 * `recorte.ts` le quita el fondo a la foto. Esto prepara ese recorte para
 * cada FORMA de envase, porque la ronda de capturas mostró que una misma
 * textura no sirve para todos:
 *
 * - **El borde** (`erosionarYSangrar`): los últimos 2 px de la silueta traen
 *   el blanco del estudio mezclado. En la botella torneada y en la bolsa, que
 *   se ven de costado, ese borde estirado era un halo blanco y un serrucho en
 *   la base. Se encoge el alfa 2 px y se vuelve a pintar lo que quedó afuera
 *   con el color de ADENTRO.
 * - **La caja en tres cuartos** (`rectificarCaja`): una foto con el costado a
 *   la vista ponía en cada caja el frente y el panel de información, «doble
 *   lomo». Se busca la arista vertical —donde el contorno de arriba y el de
 *   abajo quiebran— y se endereza la cara grande a un rectángulo.
 * - **El costado de la caja** (`colorDeCostado`): tomaba la última columna de
 *   la foto estirada y salían rayas rojas y blancas, como una textura rota.
 *   Ahora es UN color: el dominante de la franja del borde, sin los blancos.
 * - **La botella transparente** (`llenarBotella`): por el PET de la foto se
 *   ve el blanco del estudio, y en el 3D la botella salía lechosa, como
 *   kumis. Se tiñe ese tramo con el color del líquido, que se lee abajo.
 *
 * Todo es puro —entra un RGBA, sale otro— y determinista: lo corre
 * `scripts/probar-arte.mjs`.
 */

/** Un RGBA con sus medidas. */
export interface Imagen {
  rgba: Uint8ClampedArray;
  ancho: number;
  alto: number;
}

const luminancia = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** ¿Es un blanco o gris claro de estudio (lo que se ve a través del PET, el
 *  fondo que quedó)? */
function esClaroNeutro(r: number, g: number, b: number): boolean {
  return luminancia(r, g, b) >= 170 && Math.max(r, g, b) - Math.min(r, g, b) <= 30;
}

const hex = (r: number, g: number, b: number) =>
  `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("")}`;

/**
 * Encoge la silueta `px` píxeles y repinta lo que quedó afuera con el color
 * de adentro (`pasos` píxeles; más allá queda lo que había, que ya es el
 * sangrado de `recorte.ts`).
 *
 * El alfa nuevo es el MÍNIMO de la ventana de (2·px+1)²: el borde suave se
 * corre hacia adentro sin perder su degradé, y los píxeles del nuevo borde
 * son píxeles que antes eran interiores —limpios, sin blanco—.
 */
export function erosionarYSangrar(img: Imagen, px = 2, pasos = 8): Imagen {
  const { ancho: w, alto: h, rgba } = img;
  const n = w * h;
  const p = new Uint8ClampedArray(rgba);
  if (px > 0) {
    // Mínimo separable: primero por filas, después por columnas.
    const fila = new Uint8Array(n);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let m = 255;
        for (let k = -px; k <= px; k++) {
          const xx = x + k;
          const a = xx < 0 || xx >= w ? 0 : rgba[(y * w + xx) * 4 + 3];
          if (a < m) m = a;
        }
        fila[y * w + x] = m;
      }
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let m = 255;
        for (let k = -px; k <= px; k++) {
          const yy = y + k;
          const a = yy < 0 || yy >= h ? 0 : fila[yy * w + x];
          if (a < m) m = a;
        }
        p[(y * w + x) * 4 + 3] = m;
      }
    }
  }
  // El color de lo que quedó afuera, desde lo que quedó adentro.
  let lleno = new Uint8Array(n);
  for (let i = 0; i < n; i++) lleno[i] = p[i * 4 + 3] >= 250 ? 1 : 0;
  for (let s = 0; s < pasos; s++) {
    const nuevo = lleno.slice();
    let cambio = false;
    for (let i = 0; i < n; i++) {
      if (lleno[i]) continue;
      const x = i % w;
      let c = 0, r = 0, g = 0, b = 0;
      const vs = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i >= w ? i - w : -1, i < n - w ? i + w : -1];
      for (const j of vs) {
        if (j >= 0 && lleno[j]) { r += p[j * 4]; g += p[j * 4 + 1]; b += p[j * 4 + 2]; c++; }
      }
      if (c) {
        p[i * 4] = Math.round(r / c); p[i * 4 + 1] = Math.round(g / c); p[i * 4 + 2] = Math.round(b / c);
        nuevo[i] = 1;
        cambio = true;
      }
    }
    lleno = nuevo;
    if (!cambio) break;
  }
  return { rgba: p, ancho: w, alto: h };
}

/** El RGBA con el alfa en 255: el envase sólido no lleva agujeros. */
export function aplanar(img: Imagen): Imagen {
  const p = new Uint8ClampedArray(img.rgba);
  for (let i = 3; i < p.length; i += 4) p[i] = 255;
  return { rgba: p, ancho: img.ancho, alto: img.alto };
}

// ─── El costado de la caja ───────────────────────────────────────────────────

/**
 * El color del costado y la tapa de una caja: el más presente en la franja
 * del borde del frente (el 8 % de cada lado), sin casi-blancos ni casi-negros.
 *
 * Una caja de cartón impreso suele seguir en el costado con el color del
 * borde del frente; lo que NO hace es repetir la última columna de píxeles de
 * la foto, que es lo que se veía: rayas estiradas, rojo y blanco.
 */
export function colorDeCostado(img: Imagen, franja = 0.08): string {
  const { ancho: w, alto: h, rgba } = img;
  const bx = Math.max(1, Math.round(w * franja)), by = Math.max(1, Math.round(h * franja));
  const cubetas = new Map<number, { n: number; r: number; g: number; b: number }>();
  let claros = { n: 0, r: 0, g: 0, b: 0 };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x >= bx && x < w - bx && y >= by && y < h - by) continue;
      const i = (y * w + x) * 4;
      if (rgba[i + 3] < 200) continue;
      const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
      const mx = Math.max(r, g, b);
      if (mx < 30) continue;
      if (esClaroNeutro(r, g, b)) { claros = { n: claros.n + 1, r: claros.r + r, g: claros.g + g, b: claros.b + b }; continue; }
      const k = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
      const e = cubetas.get(k) ?? { n: 0, r: 0, g: 0, b: 0 };
      e.n++; e.r += r; e.g += g; e.b += b;
      cubetas.set(k, e);
    }
  }
  let mejor: { n: number; r: number; g: number; b: number } | null = null;
  for (const k of [...cubetas.keys()].sort((a, b) => a - b)) {
    const e = cubetas.get(k)!;
    if (!mejor || e.n > mejor.n) mejor = e;
  }
  // Un borde casi todo blanco (una caja blanca) da un costado blanco, no el
  // color de una letra suelta.
  let total = 0;
  for (const e of cubetas.values()) total += e.n;
  if (!mejor || claros.n > total * 2) {
    return claros.n ? hex(claros.r / claros.n, claros.g / claros.n, claros.b / claros.n) : "#bdbab4";
  }
  return hex(mejor.r / mejor.n, mejor.g / mejor.n, mejor.b / mejor.n);
}

// ─── La caja fotografiada en tres cuartos ────────────────────────────────────

/** El contorno de arriba y el de abajo de cada columna (−1 sin producto). */
function contornos(img: Imagen) {
  const { ancho: w, alto: h, rgba } = img;
  const arriba = new Float64Array(w).fill(-1), abajo = new Float64Array(w).fill(-1);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) if (rgba[(y * w + x) * 4 + 3] > 128) { arriba[x] = y; break; }
    for (let y = h - 1; y >= 0; y--) if (rgba[(y * w + x) * 4 + 3] > 128) { abajo[x] = y; break; }
  }
  return { arriba, abajo };
}

/** Recta de mínimos cuadrados de `v[x]` en [x0, x1], con su error. */
function recta(v: Float64Array, x0: number, x1: number) {
  let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let x = x0; x <= x1; x++) {
    if (v[x] < 0) continue;
    n++; sx += x; sy += v[x]; sxx += x * x; sxy += x * v[x];
  }
  const den = n * sxx - sx * sx;
  const m = den ? (n * sxy - sx * sy) / den : 0;
  const b = n ? (sy - m * sx) / n : 0;
  let e = 0;
  for (let x = x0; x <= x1; x++) if (v[x] >= 0) e += (v[x] - (m * x + b)) ** 2;
  return { m, b, rms: n ? Math.sqrt(e / n) : Infinity, en: (x: number) => m * x + b };
}

/** Bilineal sobre un RGBA. */
function muestra(img: Imagen, x: number, y: number, out: number[]): void {
  const { ancho: w, alto: h, rgba } = img;
  const cx = Math.max(0, Math.min(w - 1, x)), cy = Math.max(0, Math.min(h - 1, y));
  const x0 = Math.floor(cx), y0 = Math.floor(cy);
  const x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1);
  const tx = cx - x0, ty = cy - y0;
  for (let c = 0; c < 4; c++) {
    const a = rgba[(y0 * w + x0) * 4 + c], b = rgba[(y0 * w + x1) * 4 + c];
    const d = rgba[(y1 * w + x0) * 4 + c], e = rgba[(y1 * w + x1) * 4 + c];
    out[c] = (a * (1 - tx) + b * tx) * (1 - ty) + (d * (1 - tx) + e * tx) * ty;
  }
}

export interface CajaRectificada extends Imagen {
  /** De qué lado de la foto estaba el costado que se descartó. */
  costado: "derecha" | "izquierda";
  /** Columna de la arista en la foto recortada. */
  arista: number;
}

/**
 * La cara grande de una caja fotografiada en tres cuartos, enderezada.
 *
 * Una caja en tres cuartos tiene el contorno de arriba hecho de DOS rectas
 * —la del frente y la del costado— que se juntan en la arista vertical más
 * cercana a la cámara, que es también la columna más alta. Si eso no está
 * clarísimo (las dos rectas, con pendientes contrarias, y la arista lejos de
 * los bordes) devuelve `null` y la caja usa la foto como venía: una foto de
 * frente no tiene arista, y enderezar algo que no lo necesita lo deforma.
 *
 * La cara se endereza con la perspectiva de verdad, no con un estiramiento:
 * la mitad lejana de un plano en perspectiva sale más comprimida que la
 * cercana. Con los altos de las dos aristas (h ∝ 1/profundidad), la columna
 * de la foto que cae en la fracción u del frente es
 * x(u) = (x₀(1−u)h₁ + x₁u·h₀) / ((1−u)h₁ + u·h₀).
 */
export function rectificarCaja(img: Imagen): CajaRectificada | null {
  const { ancho: w, alto: h } = img;
  if (w < 40 || h < 40) return null;
  const { arriba, abajo } = contornos(img);
  const altoDe = (x: number) => (arriba[x] < 0 ? 0 : abajo[x] - arriba[x]);
  let xl = 0, xr = w - 1;
  while (xl < w && altoDe(xl) < h * 0.3) xl++;
  while (xr > 0 && altoDe(xr) < h * 0.3) xr--;
  if (xr - xl < w * 0.5) return null;

  // La arista: la columna más alta, lejos de los bordes.
  const margen = Math.round((xr - xl) * 0.12);
  let xc = -1, mayor = -1;
  for (let x = xl + margen; x <= xr - margen; x++) if (altoDe(x) > mayor) { mayor = altoDe(x); xc = x; }
  if (xc < 0) return null;

  // Las cuatro rectas, a un 2 % de los bordes y de la arista (ahí el contorno
  // es el antialias de la esquina).
  const k = Math.max(2, Math.round(w * 0.02));
  const ai = recta(arriba, xl + k, xc - k), ad = recta(arriba, xc + k, xr - k);
  const bi = recta(abajo, xl + k, xc - k), bd = recta(abajo, xc + k, xr - k);
  const tolRms = h * 0.012;
  if ([ai, ad, bi, bd].some((r) => r.rms > tolRms)) return null;
  // Pendientes contrarias: hacia la arista el contorno de arriba SUBE (y baja
  // en la imagen) de los dos lados, y el de abajo baja.
  const quiebre = h * 0.035;
  const bajaHasta = (r: ReturnType<typeof recta>, desde: number) => r.en(desde) - r.en(xc);
  if (!(bajaHasta(ai, xl) > quiebre && bajaHasta(ad, xr) > quiebre)) return null;
  if (!(-bajaHasta(bi, xl) > quiebre * 0.3 && -bajaHasta(bd, xr) > quiebre * 0.3)) return null;

  // La cara grande es el frente; la chica, el costado que se descarta.
  const izquierdaEsFrente = xc - xl >= xr - xc;
  const [x0, x1, arr, aba] = izquierdaEsFrente ? [xl, xc, ai, bi] : [xr, xc, ad, bd];
  const h0 = aba.en(x0) - arr.en(x0);   // la arista lejana
  const h1 = aba.en(x1) - arr.en(x1);   // la cercana (la más alta)
  if (h0 <= 0 || h1 <= 0) return null;

  const salidaAncho = Math.max(8, Math.round(Math.abs(x1 - x0)));
  const salidaAlto = Math.max(8, Math.round(h1));
  const out = new Uint8ClampedArray(salidaAncho * salidaAlto * 4);
  const px = [0, 0, 0, 0];
  for (let i = 0; i < salidaAncho; i++) {
    // Columna de salida (de izquierda a derecha) → fracción u del frente,
    // que va de la arista lejana (u = 0) a la cercana (u = 1): si el frente
    // es la cara de la derecha, la cercana queda a la izquierda. Un 0,5 %
    // hacia adentro: el borde es antialias.
    const t = 0.005 + 0.99 * ((i + 0.5) / salidaAncho);
    const u = izquierdaEsFrente ? t : 1 - t;
    const xs = (x0 * (1 - u) * h1 + x1 * u * h0) / ((1 - u) * h1 + u * h0);
    const ya = arr.en(xs), yb = aba.en(xs);
    for (let j = 0; j < salidaAlto; j++) {
      const v = 0.008 + 0.984 * ((j + 0.5) / salidaAlto);
      muestra(img, xs, ya + v * (yb - ya), px);
      const o = (j * salidaAncho + i) * 4;
      out[o] = px[0]; out[o + 1] = px[1]; out[o + 2] = px[2]; out[o + 3] = 255;
    }
  }
  return {
    rgba: out, ancho: salidaAncho, alto: salidaAlto,
    costado: izquierdaEsFrente ? "derecha" : "izquierda",
    arista: xc,
  };
}

// ─── La botella transparente ─────────────────────────────────────────────────

/** Qué es un píxel opaco de la botella, comparado con el líquido `L`.
 *
 *  Por CROMATICIDAD —(r, g, b)/(r + g + b)— y no por la cubeta de tono con que
 *  se encuentra el líquido: el líquido [140, 38, 40] y la etiqueta rosa
 *  [225, 70, 140] caen en la misma cubeta de tono, y con ella la letra blanca
 *  de la etiqueta se teñía. En cromaticidad están a 0,14 uno del otro. */
export function claseDePixel(r: number, g: number, b: number, L: readonly number[]): "liquido" | "claro" | "otro" {
  const s = r + g + b, sL = L[0] + L[1] + L[2];
  const l = luminancia(r, g, b), lL = luminancia(L[0], L[1], L[2]);
  if (s > 0 && sL > 0) {
    const d = Math.max(Math.abs(r / s - L[0] / sL), Math.abs(g / s - L[1] / sL), Math.abs(b / s - L[2] / sL));
    if (d <= 0.06 && l >= 0.3 * lL && l <= 1.8 * lL) return "liquido";
  }
  if (esClaroNeutro(r, g, b) || (l >= 150 && Math.max(r, g, b) - Math.min(r, g, b) <= 60)) return "claro";
  return "otro";
}

/** Las filas que son ETIQUETA (o tapa): más del 40 % de lo opaco no es ni el
 *  líquido ni el claro del PET. Ésas no se tocan. */
export function filasDeEtiqueta(img: Imagen, L: readonly number[]): boolean[] {
  const { ancho: w, alto: h, rgba } = img;
  const fuera: boolean[] = [];
  for (let y = 0; y < h; y++) {
    let n = 0, otros = 0;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (rgba[i + 3] < 128) continue;
      n++;
      if (claseDePixel(rgba[i], rgba[i + 1], rgba[i + 2], L) === "otro") otros++;
    }
    fuera.push(n > 0 && otros > n * 0.4);
  }
  return fuera;
}

/** Cuántos píxeles hay hasta lo transparente (alfa < 128), con la distancia
 *  de chaflán 3-4 (casi euclídea), hasta `tope`. 0 = transparente. */
function distanciaAlBorde(img: Imagen, tope: number): Uint8Array {
  const { ancho: w, alto: h, rgba } = img;
  const T = tope * 3;
  const d = new Uint16Array(w * h);
  for (let i = 0; i < w * h; i++) d[i] = rgba[i * 4 + 3] < 128 ? 0 : T;
  const ver = (i: number, j: number, k: number) => { if (d[j] + k < d[i]) d[i] = d[j] + k; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (x > 0) ver(i, i - 1, 3);
    if (y > 0) { ver(i, i - w, 3); if (x > 0) ver(i, i - w - 1, 4); if (x < w - 1) ver(i, i - w + 1, 4); }
  }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
    const i = y * w + x;
    if (x < w - 1) ver(i, i + 1, 3);
    if (y < h - 1) { ver(i, i + w, 3); if (x < w - 1) ver(i, i + w + 1, 4); if (x > 0) ver(i, i + w - 1, 4); }
  }
  const fuera = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) fuera[i] = Math.round(d[i] / 3);
  return fuera;
}

/**
 * El color del líquido de una botella transparente, o `null` si no se ve uno
 * (agua, una botella opaca).
 *
 * El TONO que más hay en el cuarto de abajo de la silueta, entre lo saturado.
 * Por tono y no por color exacto: el líquido es un degradé —más oscuro en los
 * bordes del cuerpo, más claro donde le da la luz— y repartido en cubetas de
 * color ninguna llegaba a ser mayoría. (Para CLASIFICAR los píxeles no sirve
 * la cubeta: ver `claseDePixel`.)
 */
export function liquidoDe(img: Imagen): number[] | null {
  const { ancho: w, alto: h, rgba } = img;
  const tonos = Array.from({ length: 12 }, () => ({ n: 0, r: 0, g: 0, b: 0 }));
  let opacosAbajo = 0;
  for (let y = Math.round(h * 0.7); y < Math.round(h * 0.95); y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (rgba[i + 3] < 200) continue;
      opacosAbajo++;
      const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      if (esClaroNeutro(r, g, b) || mx - mn < 40 || mx < 40) continue;
      const d = mx - mn;
      let tono = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
      if (tono < 0) tono += 6;
      const e = tonos[Math.min(11, Math.floor(tono * 2))];
      e.n++; e.r += r; e.g += g; e.b += b;
    }
  }
  let mejor: { n: number; r: number; g: number; b: number } | null = null;
  for (const e of tonos) if (e.n > 0 && (!mejor || e.n > mejor.n)) mejor = e;
  // Un líquido de color se ve en buena parte del cuarto de abajo.
  if (!mejor || mejor.n < opacosAbajo * 0.35) return null;
  return [mejor.r / mejor.n, mejor.g / mejor.n, mejor.b / mejor.n];
}

/** La franja de la ETIQUETA de un envase: qué filas (relativas al alto, desde
 *  arriba) y qué columnas (relativas al ancho) ocupa. */
export interface FranjaDeEtiqueta { desde: number; hasta: number; x0: number; x1: number }

/**
 * Dónde está la etiqueta en la foto: con un líquido, el tramo más largo de
 * filas de ETIQUETA (`filasDeEtiqueta`, el mismo criterio que llena la
 * botella; la tapa, que también cae ahí, es un tramo corto); sin líquido (un
 * vaso, una caja), la franja del medio de siempre (34-66 %). Las columnas son
 * las de la silueta en esas filas: el cabezote recorta ahí, sin el PET de los
 * costados.
 */
export function franjaDeEtiqueta(img: Imagen, liquido: readonly number[] | null): FranjaDeEtiqueta {
  const { ancho: w, alto: h, rgba } = img;
  let desde = Math.round(h * 0.34), hasta = Math.round(h * 0.66);
  if (liquido) {
    const filas = filasDeEtiqueta(img, liquido);
    // Un hueco de una o dos filas (un renglón blanco de la etiqueta) no corta
    // el tramo.
    const hueco = Math.max(1, Math.round(h * 0.01));
    let mejor: [number, number] | null = null, inicio = -1, fallas = 0, ultimo = -1;
    for (let y = 0; y <= h; y++) {
      const si = y < h && filas[y];
      if (si) { if (inicio < 0) inicio = y; ultimo = y; fallas = 0; continue; }
      if (inicio >= 0 && (++fallas > hueco || y === h)) {
        if (!mejor || ultimo - inicio > mejor[1] - mejor[0]) mejor = [inicio, ultimo + 1];
        inicio = -1; fallas = 0;
      }
    }
    if (mejor && mejor[1] - mejor[0] >= h * 0.05) [desde, hasta] = mejor;
    // Dentro de la etiqueta, la banda donde está la MARCA: la de más letra
    // clara (en una gaseosa, «MANZANA POSTOBÓN» en blanco sobre el rosa). La
    // etiqueta entera de una 2 L es casi cuadrada, y al alto del cabezote
    // quedaba un sello de 7 cm en un aviso de 1,1 m. Si ninguna banda se
    // destaca (letra pareja, o sin letra clara), va la etiqueta entera.
    const n = hasta - desde, k = Math.max(Math.round(n * 0.45), Math.round(h * 0.05));
    if (k < n) {
      const claros: number[] = [];
      for (let y = desde; y < hasta; y++) {
        let c = 0, o = 0;
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          if (rgba[i + 3] < 128) continue;
          o++;
          if (claseDePixel(rgba[i], rgba[i + 1], rgba[i + 2], liquido) === "claro") c++;
        }
        claros.push(o ? c / o : 0);
      }
      const total = claros.reduce((a, b) => a + b, 0);
      let suma = claros.slice(0, k).reduce((a, b) => a + b, 0), mejorSuma = suma, inicio = 0;
      for (let y = k; y < n; y++) {
        suma += claros[y] - claros[y - k];
        if (suma > mejorSuma) { mejorSuma = suma; inicio = y - k + 1; }
      }
      if (total > 0 && mejorSuma / k >= 1.3 * (total / n)) {
        // Con aire arriba y abajo (un 15 % de la banda, sin salir de la
        // etiqueta): la letra al ras del corte se leía mordida.
        const aire = Math.round(k * 0.15);
        const d0 = desde;
        desde = Math.max(d0, d0 + inicio - aire);
        hasta = Math.min(d0 + n, d0 + inicio + k + aire);
      }
    }
  }
  let x0 = w, x1 = -1;
  for (let y = desde; y < hasta; y++) {
    for (let x = 0; x < w; x++) if (rgba[(y * w + x) * 4 + 3] >= 128) { if (x < x0) x0 = x; if (x > x1) x1 = x; }
  }
  if (x1 < x0) { x0 = 0; x1 = w - 1; }
  return { desde: desde / h, hasta: hasta / h, x0: x0 / w, x1: (x1 + 1) / w };
}

export interface BotellaLlena extends Imagen {
  /** El color del líquido, o `null` si no se ve uno (agua, una botella
   *  opaca): entonces la imagen vuelve sin tocar. */
  liquido: string | null;
}

/**
 * Tiñe con el color del líquido el PET por el que se veía el fondo.
 *
 * La foto de una gaseosa trae el tramo de arriba —sobre la etiqueta— casi
 * blanco: es el fondo del estudio visto a través del plástico. En el 3D eso
 * es pintura blanca, una botella de kumis; y acostada, la mitad blanca y la
 * mitad roja con el nivel en vertical. En la nevera, una botella se lee
 * LLENA.
 *
 * - El líquido se lee en el cuarto de abajo de la silueta: el color que más
 *   hay entre lo saturado. Si ahí no hay un color claro y parejo (agua, una
 *   botella blanca de shampoo) no se toca nada.
 * - Cada píxel se clasifica por cromaticidad (`claseDePixel`): como el
 *   líquido, claro (el PET con el fondo detrás) u otro. Una fila es ETIQUETA
 *   si «otro» pasa del 40 % de lo opaco (la tapa naranja también cae ahí) y
 *   queda como está.
 * - En las demás se tiñe TODO lo claro dentro de la silueta, el anillo del
 *   borde incluido. Antes se decidía por fila («transparente» si más de la
 *   mitad era claro neutro), y en el hombro la fila mezcla líquido oscuro con
 *   el anillo claro de la refracción: no contaba, y el anillo quedaba pintado
 *   como dos bandas crema, un arnés sobre cada botella de 2 L.
 * - En los 3 px del borde el líquido va un 20 % más oscuro (la pared del PET
 *   vista de canto), y lo de afuera de la silueta —el sangrado, que se ve si
 *   el torno queda un pelo más ancho que la foto— también.
 * - Un reflejo vertical de 3 px, al 30 % de blanco en el centro, a un cuarto
 *   del ancho de la silueta: el brillo que el anillo pretendía ser.
 * - El pie (el 8 % de abajo, donde los lóbulos de la base dejan ver el
 *   fondo) queda como antes: sus claros neutros se tiñen.
 * - El tinte conserva la luz de la foto (las burbujas): es el color del
 *   líquido por la luminancia relativa.
 */
export function llenarBotella(img: Imagen): BotellaLlena {
  const { ancho: w, alto: h, rgba } = img;
  const L = liquidoDe(img);
  if (!L) return { ...img, rgba: new Uint8ClampedArray(rgba), liquido: null };

  const p = new Uint8ClampedArray(rgba);
  const pie = Math.round(h * 0.92);
  const etiqueta = filasDeEtiqueta(img, L);
  // Lo que está a 3 px o menos de lo transparente: la pared del PET de canto.
  const borde = distanciaAlBorde(img, 4);
  const tinte = (i: number, k: number, oscuro: number, brillo: number) => {
    for (let c = 0; c < 3; c++) p[i + c] = Math.round(L[c] * k * oscuro * (1 - brillo) + 255 * brillo);
  };
  for (let y = 0; y < pie; y++) {
    // Las filas de ETIQUETA (y la tapa, que también cae ahí) quedan como
    // están: su letra blanca no es PET.
    if (etiqueta[y]) continue;
    let l = -1, r = -1;
    for (let x = 0; x < w; x++) if (rgba[(y * w + x) * 4 + 3] >= 128) { if (l < 0) l = x; r = x; }
    if (l < 0) continue;
    // El reflejo del PET: una franja vertical de 3 px a un cuarto del ancho
    // de la silueta, siempre del mismo lado (la luz de la tienda no se mueve
    // con cada botella).
    const xBrillo = l + (r - l) * 0.25;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r0 = rgba[i], g0 = rgba[i + 1], b0 = rgba[i + 2];
      const cerca = borde[y * w + x];
      const adentro = rgba[i + 3] >= 128;
      const clase = adentro ? claseDePixel(r0, g0, b0, L) : "afuera";
      // Lo de afuera de la silueta es el sangrado del anillo claro: si el
      // torno queda un pelo más ancho que la foto es lo que se ve, así que
      // también va del color del líquido, oscuro como la pared.
      if (clase === "otro") continue;
      const oscuro = clase === "afuera" || cerca <= 3 ? 0.8 : 1;
      const d = Math.abs(x - xBrillo);
      const brillo = clase === "afuera" ? 0 : d <= 0.5 ? 0.3 : d <= 1.5 ? 0.15 : 0;
      if (clase === "liquido") {
        // El líquido de la foto se queda, con la pared y el reflejo encima.
        if (oscuro === 1 && brillo === 0) continue;
        for (let c = 0; c < 3; c++) p[i + c] = Math.round(rgba[i + c] * oscuro * (1 - brillo) + 255 * brillo);
        continue;
      }
      // Claro (el PET con el fondo detrás, el anillo de refracción del borde)
      // o afuera: el líquido a la luz de ESE píxel, como siempre.
      const luz = clase === "afuera" ? 0.85 : luminancia(r0, g0, b0) / 235;
      tinte(i, Math.min(1.35, Math.max(0.4, luz)), oscuro, brillo);
    }
  }
  // El pie, como siempre: los lóbulos de la base dejan ver el fondo.
  for (let y = pie; y < h; y++) {
    let enFila = 0, claros = 0;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (rgba[i + 3] < 128) continue;
      enFila++;
      if (esClaroNeutro(rgba[i], rgba[i + 1], rgba[i + 2])) claros++;
    }
    if (!enFila) continue;
    const transparente = claros > enFila * 0.5;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (rgba[i + 3] < 8) continue;
      const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
      // En una fila transparente también los claros apenas teñidos (hasta
      // 60 de croma): el brillo del PET en los hombros toma el rosa de la
      // etiqueta, y quedaba como manchas blancas triangulares que de cerca
      // se leían como suciedad.
      const claroTenido = transparente && luminancia(r, g, b) >= 150 && Math.max(r, g, b) - Math.min(r, g, b) <= 60;
      if (!esClaroNeutro(r, g, b) && !claroTenido && !(transparente && Math.max(r, g, b) - Math.min(r, g, b) <= 30)) continue;
      // La luz de la foto, relativa a un blanco de estudio (~235): el
      // líquido a la luz de ESE píxel.
      const luz = luminancia(r, g, b) / 235;
      // El brillo del PET, a lo sumo un 30 % de blanco: con más, el reflejo
      // del borde de la silueta —que el torneado estira sobre el hombro—
      // quedaba como un triángulo blanco.
      const brillo = Math.max(0, (luminancia(r, g, b) - 242) / 13) * 0.3;
      const k = Math.min(1.35, Math.max(0.4, luz));
      for (let c = 0; c < 3; c++) p[i + c] = Math.round(L[c] * k * (1 - brillo) + 255 * brillo);
    }
  }
  return { rgba: p, ancho: w, alto: h, liquido: hex(L[0], L[1], L[2]) };
}

// ─── La espalda del envase torneado ──────────────────────────────────────────

/** El papel de la tabla nutricional y sus renglones. */
const PAPEL = [238, 235, 227] as const;
const RENGLON = [176, 172, 165] as const;

/**
 * La ESPALDA de un vaso, una lata, un frasco o una botella: lo que se ve al
 * girar más de 90° alrededor del envase.
 *
 * La UV del frente es plana (la foto proyectada desde −Z), así que la mitad de
 * atrás recibía la misma foto espejada: a ~70° la columna de la punta repetía
 * «esse», «nesse» y las fresas comprimidas. Pero tampoco hay foto de atrás.
 * Se arma con lo que se sabe sin inventar nada:
 *
 * - Por fila, el color de los 3 px de adentro del borde de la silueta, a la
 *   izquierda y a la derecha, interpolado a lo ancho: la columna 0 empalma
 *   con el costado +X del frente y la última con el −X (la UV de la espalda
 *   va de 0 a 1 rodeando por detrás, ver `geometriaDeEtiqueta`). En el medio,
 *   esos colores suavizados a lo alto, para que no quede rayada.
 * - En el 35 % central del alto, y lejos de los costados, una banda blanco
 *   roto con renglones grises de 1 px: la tabla nutricional, SIN texto ni
 *   números (nada que el proveedor no haya puesto). `banda`, si viene, dice
 *   en qué filas puede ir —en la botella, sólo sobre la etiqueta: sobre el
 *   líquido sería un parche blanco—.
 * - Las filas de arriba del 97 % y de abajo del 7 % se copian del frente: ahí
 *   muestrean las tapas del torno de la botella, que también tienen espalda.
 *
 * Pura: entra el RGBA del frente CON su alfa (la silueta) y sale uno opaco.
 */
export function espaldaDeEtiqueta(img: Imagen, banda?: readonly boolean[]): Imagen {
  const { ancho: w, alto: h, rgba } = img;
  const p = new Uint8ClampedArray(w * h * 4);
  const arriba = Math.floor(h * 0.03), abajo = Math.ceil(h * 0.93);
  const desdeBanda = Math.round(h * 0.325), hastaBanda = Math.round(h * 0.675);
  const promedio = (y: number, x0: number, x1: number) => {
    const c = [0, 0, 0];
    let n = 0;
    for (let x = Math.max(0, x0); x <= Math.min(w - 1, x1); x++) {
      const i = (y * w + x) * 4;
      c[0] += rgba[i]; c[1] += rgba[i + 1]; c[2] += rgba[i + 2]; n++;
    }
    return n ? c.map((v) => v / n) : c;
  };
  // Los colores de borde de cada fila; una fila sin silueta toma los de la
  // más cercana que tenga.
  const bordes: ({ izq: number[]; der: number[] } | null)[] = [];
  for (let y = 0; y < h; y++) {
    let l = -1, r = -1;
    for (let x = 0; x < w; x++) if (rgba[(y * w + x) * 4 + 3] >= 128) { if (l < 0) l = x; r = x; }
    bordes.push(l < 0 ? null : { izq: promedio(y, l, l + 2), der: promedio(y, r - 2, r) });
  }
  for (let y = 0; y < h; y++) {
    if (bordes[y]) continue;
    for (let d = 1; d < h; d++) {
      const b = bordes[y - d] ?? bordes[y + d];
      if (b) { bordes[y] = b; break; }
    }
  }
  // Los mismos colores, suavizados a lo alto (±3 % del alto): fila por fila,
  // una fresa o una gota en el borde de la foto dejaban la espalda rayada
  // como un código de barras. La costura (las columnas de las puntas) usa los
  // de la fila tal cual —empalma con el frente— y el medio, los suaves.
  const radio = Math.max(2, Math.round(h * 0.03));
  const suaves = bordes.map((_, y) => {
    const izq = [0, 0, 0], der = [0, 0, 0];
    let n = 0;
    for (let k = Math.max(0, y - radio); k <= Math.min(h - 1, y + radio); k++) {
      const b = bordes[k];
      if (!b) continue;
      for (let c = 0; c < 3; c++) { izq[c] += b.izq[c]; der[c] += b.der[c]; }
      n++;
    }
    return n ? { izq: izq.map((v) => v / n), der: der.map((v) => v / n) } : null;
  });
  for (let y = 0; y < h; y++) {
    const copia = y < arriba || y >= abajo;
    const b = bordes[y], m = suaves[y];
    const conBanda = !copia && y >= desdeBanda && y < hastaBanda && (!banda || banda[y]);
    // Un renglón cada 6 px, y el primero y el último de la tabla.
    const renglon = conBanda && ((y - desdeBanda) % 6 === 0 || y === hastaBanda - 1);
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (copia || !b) {
        p[i] = rgba[i]; p[i + 1] = rgba[i + 1]; p[i + 2] = rgba[i + 2]; p[i + 3] = 255;
        continue;
      }
      const u = w > 1 ? x / (w - 1) : 0;
      // De la punta (el color de la fila) al suave en el primer 15 %, y del
      // suave de un lado al del otro en el medio.
      const izq = m ? b.izq.map((v, c) => v + (m.izq[c] - v) * Math.min(1, u / 0.15)) : b.izq;
      const der = m ? b.der.map((v, c) => v + (m.der[c] - v) * Math.min(1, (1 - u) / 0.15)) : b.der;
      const t = Math.max(0, Math.min(1, (u - 0.15) / 0.7));
      const pIzq = u < 0.15 ? 1 : 1 - t, pDer = u > 0.85 ? 1 : t;
      const suma = pIzq + pDer || 1;
      let c0 = (izq[0] * pIzq + der[0] * pDer) / suma;
      let c1 = (izq[1] * pIzq + der[1] * pDer) / suma;
      let c2 = (izq[2] * pIzq + der[2] * pDer) / suma;
      if (conBanda) {
        // La tabla, del 30 al 70 % de la espalda (lejos de los costados, que
        // tienen que empalmar con el frente), con 4 % de borde suave.
        const k = Math.max(0, Math.min(1, (Math.min(u - 0.3, 0.7 - u)) / 0.04));
        if (k > 0) {
          const t = renglon ? RENGLON : PAPEL;
          c0 += (t[0] - c0) * k; c1 += (t[1] - c1) * k; c2 += (t[2] - c2) * k;
        }
      }
      p[i] = Math.round(c0); p[i + 1] = Math.round(c1); p[i + 2] = Math.round(c2); p[i + 3] = 255;
    }
  }
  return { rgba: p, ancho: w, alto: h };
}

// ─── La tapa del vaso ─────────────────────────────────────────────────────────

/** Lo que se sabe de la tapa de un vaso (o una lata) por su foto. */
export interface TapaDeFoto {
  /** Qué parte del alto de la foto, desde arriba, es tapa y reborde: se le
   *  saca al costado del cuerpo. */
  franja: number;
  /** El color del foil (o del aluminio), y el del reborde. */
  tapa: string;
  borde: string;
}

/** La mediana de cada canal de una lista de píxeles, como `#rrggbb`. */
function mediana(px: number[][]): string {
  if (px.length === 0) return "#9a9a9a";
  const m = (k: number) => px.map((p) => p[k]).sort((a, b) => a - b)[px.length >> 1];
  return hex(m(0), m(1), m(2));
}

const rgbDe = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

/**
 * La tapa de un vaso, leída de la foto de frente.
 *
 * La foto de un vaso trae arriba el reborde y el foil que se dobla sobre el
 * frente. Envuelta en el cuerpo, esa franja quedaba como una tapa pintada en
 * el costado, y encima el disco 3D: doble tapa, un hongo. Se busca hasta dónde
 * llega bajando desde arriba —las filas donde la mitad o más de lo opaco es
 * del color del reborde o del foil, con 1 % de tolerancia para el ruido— y el
 * cuerpo se envuelve con lo que queda debajo. Nunca más del 12 %: el resto es
 * etiqueta, aunque tenga un fondo del mismo color. Y nada si lo de arriba es
 * del color del cuerpo (una lata pareja): ahí no hay tapa que separar.
 *
 * - `borde`: la mediana de lo de más arriba (el 2,5 %) en las PUNTAS (del 5
 *   al 20 % de cada lado): el reborde, que en la foto asoma a los costados.
 * - `tapa`: la mediana de lo de más arriba (el 3 %) en el MEDIO (del 35 al
 *   65 %): el foil doblado sobre el frente. Mezclando filas más abajo la
 *   mediana caía entre el foil y las frutillas de la etiqueta, y la tapa
 *   salía marrón, como un vaso destapado de chocolate.
 */
export function tapaDeFoto(img: Imagen): TapaDeFoto {
  const { ancho: w, alto: h, rgba } = img;
  const opacos = (y0: number, y1: number, x0 = 0, x1 = w) => {
    const px: number[][] = [];
    for (let y = Math.max(0, y0); y < Math.min(h, y1); y++) {
      for (let x = Math.max(0, x0); x < Math.min(w, x1); x++) {
        const i = (y * w + x) * 4;
        if (rgba[i + 3] >= 200) px.push([rgba[i], rgba[i + 1], rgba[i + 2]]);
      }
    }
    return px;
  };
  const arriba = (frac: number) => Math.max(1, Math.round(h * frac));
  const borde = mediana([
    ...opacos(0, arriba(0.025), Math.round(w * 0.05), Math.round(w * 0.2)),
    ...opacos(0, arriba(0.025), Math.round(w * 0.8), Math.round(w * 0.95)),
  ]);
  const tapa = mediana(opacos(0, arriba(0.03), Math.round(w * 0.35), Math.round(w * 0.65)));
  const refs = [rgbDe(borde), rgbDe(tapa)];
  const cerca = (a: number[], b: number[]) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2])) <= 38;
  const parecido = (r: number, g: number, b: number) => refs.some((ref) => cerca([r, g, b], ref));
  // Si lo de arriba es del mismo color que el cuerpo (una lata roja pareja),
  // no hay franja de tapa que separar: se recortaría etiqueta.
  const cuerpo = mediana(opacos(Math.round(h * 0.15), Math.round(h * 0.35), Math.round(w * 0.35), Math.round(w * 0.65)));
  if (cerca(rgbDe(cuerpo), rgbDe(tapa))) return { franja: 0, tapa, borde };
  const tope = Math.round(h * 0.12);
  const ruido = Math.max(1, Math.round(h * 0.01));
  let franja = 0, fallas = 0;
  for (let y = 0; y < tope; y++) {
    let n = 0, si = 0;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (rgba[i + 3] < 200) continue;
      n++;
      if (parecido(rgba[i], rgba[i + 1], rgba[i + 2])) si++;
    }
    if (n > 0 && si / n >= 0.5) { franja = y + 1; fallas = 0; }
    else if (++fallas > ruido) break;
  }
  return { franja: franja / h, tapa, borde };
}

// ─── Los cantos de la caja ───────────────────────────────────────────────────

/**
 * Oscurece los cantos verticales del frente de una caja (`frac` del ancho de
 * cada lado, hasta `k` en el borde mismo).
 *
 * Cinco cajas pegadas con la misma foto se leían como un empapelado
 * continuo, «Kellogg'sKellogg'sKellogg's»: la luz de 4 mm entre dos no llega
 * a un píxel a dos metros. En tienda lo que separa una caja de la otra es el
 * canto en sombra; acá es un degradé de 1–2 px en cada lado de la foto.
 */
export function oscurecerCantos(img: Imagen, frac = 0.025, k = 0.38): Imagen {
  const { ancho: w, alto: h } = img;
  const p = new Uint8ClampedArray(img.rgba);
  const banda = Math.max(1, Math.round(w * frac));
  for (let x = 0; x < w; x++) {
    const d = Math.min(x, w - 1 - x);
    if (d >= banda) continue;
    const f = 1 - k * (1 - d / banda) ** 1.5;
    for (let y = 0; y < h; y++) {
      const i = (y * w + x) * 4;
      p[i] = p[i] * f; p[i + 1] = p[i + 1] * f; p[i + 2] = p[i + 2] * f;
    }
  }
  return { rgba: p, ancho: w, alto: h };
}

// ─── Los cantos de la bolsa ──────────────────────────────────────────────────

/**
 * Lleva hacia `color` las columnas de los costados de la foto de una bolsa
 * (`frac` del ancho de cada lado, hasta `k` en el borde).
 *
 * La bolsa se afina a cero en los costados, y con la proyección plana esos
 * pocos píxeles del borde de la foto se estiran sobre todo el canto: de
 * costado se veía la foto corrida, como una cartulina doblada. En tienda el
 * canto de una bolsa es la costura, del color del plástico: el dominante.
 */
export function tenirCantos(img: Imagen, color: string, frac = 0.08, k = 0.75): Imagen {
  const { ancho: w, alto: h } = img;
  if (!/^#[0-9a-f]{6}$/i.test(color)) return { ...img, rgba: new Uint8ClampedArray(img.rgba) };
  const [R, G, B] = rgbDe(color);
  const p = new Uint8ClampedArray(img.rgba);
  const banda = Math.max(1, Math.round(w * frac));
  for (let x = 0; x < w; x++) {
    const d = Math.min(x, w - 1 - x);
    if (d >= banda) continue;
    const f = k * (1 - d / banda) ** 1.2;
    for (let y = 0; y < h; y++) {
      const i = (y * w + x) * 4;
      p[i] += (R - p[i]) * f; p[i + 1] += (G - p[i + 1]) * f; p[i + 2] += (B - p[i + 2]) * f;
    }
  }
  return { rgba: p, ancho: w, alto: h };
}
