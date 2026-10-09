/**
 * La foto del proveedor, sin fondo: lo que hace que el producto se vea parado
 * en el estante y no pegado como una calcomanía.
 *
 * ## Por qué hace falta
 *
 * Los packshots llegan en JPG, sin transparencia, con el fondo blanco del
 * estudio. Usada tal cual como etiqueta, cada unidad es un rectángulo blanco
 * pegado al siguiente y la cara del mueble se lee como papel tapiz. Era el
 * defecto central del «antes».
 *
 * ## Por qué así y no de otra manera
 *
 * - **En el navegador, sobre los píxeles ya bajados.** El servidor no tiene
 *   Pillow ni nada que segmente, y meter una dependencia de segmentación es
 *   superficie de ataque por un problema que, para un packshot sobre fondo
 *   parejo, se resuelve con un relleno desde el borde.
 * - **Puro y determinista**: entra un `Uint8ClampedArray`, sale otro. La misma
 *   foto da los mismos bytes siempre — se prueba ejecutándolo
 *   (`scripts/probar-arte.mjs`) — y el original no se toca nunca.
 * - **Conservador.** Si el fondo no es parejo y claro, NO se quita: un recorte
 *   equivocado es peor que un fondo blanco. Se dice en palabras (`estado`,
 *   `avisos`) y la ficha del arte tiene la salida (`fondo_foto`: quitar o
 *   dejar).
 *
 * Las cuentas salen de lo medido sobre las cuatro fotos de prueba
 * (`scratchpad/realismo/fondo`, `eval-fondo`): el relleno desde el borde se
 * come el cuerpo blanco de un vaso de yogur, y lo que lo devuelve es tomar como
 * producto todo lo que cae en el tramo de su fila O de su columna.
 */

/** Qué se hizo con el fondo, para decirlo en el panel. */
export type EstadoDelRecorte =
  /** Había un fondo parejo y claro, y se quitó. */
  | "fondo-quitado"
  /** La foto ya traía transparencia: se respetó y sólo se recortó. */
  | "ya-tenia-alfa"
  /** No se quitó: el fondo no es parejo o claro, o la ficha pidió dejarlo. */
  | "conservado"
  /** Se intentó y el resultado no es confiable: se dejó la foto como estaba. */
  | "dudoso";

export type ModoDeFondo = "auto" | "quitar" | "conservar";

export interface Recorte {
  /** Los píxeles ya recortados a la caja del producto, RGBA. */
  rgba: Uint8ClampedArray;
  ancho: number;
  alto: number;
  estado: EstadoDelRecorte;
  /** Ancho/alto del producto (no de la foto con márgenes). */
  aspecto: number;
  /** Fracción opaca de la caja: cerca de 1 es un envase rectangular. */
  relleno: number;
  /** 0 = silueta simétrica respecto del eje vertical. */
  simetria: number;
  /** 24 semianchos de 0 a 1, de abajo hacia arriba: la silueta, para tornear
   *  una botella o un vaso. */
  perfil: number[];
  /** El color de la marca: el más presente entre los saturados. */
  colorDominante: string;
  avisos: string[];
}

/** Cuántos semianchos lleva el perfil. */
export const PUNTOS_DE_PERFIL = 24;

/** Luminancia aproximada en 0–255, sobre sRGB tal cual: alcanza para decidir
 *  «claro» u «oscuro», que es lo único que se le pregunta. */
function luminancia(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Los índices de los píxeles del borde, una vez cada uno. */
function indicesDelBorde(w: number, h: number): number[] {
  const fuera: number[] = [];
  for (let x = 0; x < w; x++) fuera.push(x);
  if (h > 1) for (let x = 0; x < w; x++) fuera.push((h - 1) * w + x);
  for (let y = 1; y < h - 1; y++) {
    fuera.push(y * w);
    if (w > 1) fuera.push(y * w + w - 1);
  }
  return fuera;
}

function mediana(valores: number[]): number {
  const v = valores.slice().sort((a, b) => a - b);
  return v.length ? v[v.length >> 1] : 0;
}

function percentil(valores: number[], p: number): number {
  const v = valores.slice().sort((a, b) => a - b);
  return v.length ? v[Math.min(v.length - 1, Math.floor(v.length * p))] : 0;
}

/** Los cuatro vecinos de un píxel (−1 donde no hay). */
function vecinos(i: number, w: number, n: number, fuera: Int32Array): void {
  const x = i % w;
  fuera[0] = x > 0 ? i - 1 : -1;
  fuera[1] = x < w - 1 ? i + 1 : -1;
  fuera[2] = i >= w ? i - w : -1;
  fuera[3] = i < n - w ? i + w : -1;
}

/** El tramo (izquierda, derecha) de cada fila de una máscara, o −1. */
function tramosPorFila(m: Uint8Array, w: number, h: number) {
  const l = new Int32Array(h).fill(-1);
  const r = new Int32Array(h).fill(-1);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (m[y * w + x]) { if (l[y] < 0) l[y] = x; r[y] = x; }
    }
  }
  return { l, r };
}

/** El perfil: 24 semianchos de abajo hacia arriba, sacados del tramo de cada
 *  banda de filas de la máscara, relativos al ancho de la caja. */
function perfilDe(m: Uint8Array, w: number, h: number): number[] {
  const { l, r } = tramosPorFila(m, w, h);
  let y0 = -1, y1 = -1, x0 = w, x1 = -1;
  for (let y = 0; y < h; y++) {
    if (l[y] < 0) continue;
    if (y0 < 0) y0 = y;
    y1 = y;
    x0 = Math.min(x0, l[y]);
    x1 = Math.max(x1, r[y]);
  }
  if (y0 < 0) return Array.from({ length: PUNTOS_DE_PERFIL }, () => 1);
  const bw = x1 - x0 + 1;
  const bh = y1 - y0 + 1;
  const fuera: number[] = [];
  for (let k = 0; k < PUNTOS_DE_PERFIL; k++) {
    // Banda k contando desde ABAJO; se toma el tramo más ancho de la banda,
    // que es la silueta (un renglón suelto puede caer en una muesca).
    const desde = y1 - Math.floor(((k + 1) * bh) / PUNTOS_DE_PERFIL) + 1;
    const hasta = y1 - Math.floor((k * bh) / PUNTOS_DE_PERFIL);
    let ancho = 0;
    for (let y = Math.max(y0, desde); y <= Math.min(y1, hasta); y++) {
      if (l[y] >= 0) ancho = Math.max(ancho, r[y] - l[y] + 1);
    }
    fuera.push(Math.min(1, ancho / bw));
  }
  return fuera;
}

/** El color de la marca: histograma de 4 bits por canal sobre lo opaco,
 *  pesado por saturación y sin casi-blancos ni casi-negros (que son el fondo
 *  que quedó, la letra y la sombra, no la marca). */
function colorDominanteDe(p: Uint8ClampedArray): string {
  const cubetas = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i < p.length; i += 4) {
    if (p[i + 3] < 200) continue;
    const r = p[i], g = p[i + 1], b = p[i + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const sat = mx ? (mx - mn) / mx : 0;
    if ((mx > 235 && sat < 0.12) || mx < 30) continue;
    const k = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const e = cubetas.get(k) ?? { n: 0, r: 0, g: 0, b: 0 };
    const peso = 0.25 + sat;
    e.n += peso; e.r += r * peso; e.g += g * peso; e.b += b * peso;
    cubetas.set(k, e);
  }
  let mejor: { n: number; r: number; g: number; b: number } | null = null;
  // Recorrido en orden de clave: ante un empate, gana siempre la misma.
  for (const k of [...cubetas.keys()].sort((a, b) => a - b)) {
    const e = cubetas.get(k)!;
    if (!mejor || e.n > mejor.n) mejor = e;
  }
  if (!mejor) return "#808080";
  const hx = (v: number) => Math.round(v / mejor!.n).toString(16).padStart(2, "0");
  return `#${hx(mejor.r)}${hx(mejor.g)}${hx(mejor.b)}`;
}

/** Simetría y relleno de una máscara ya recortada a su caja. */
function metricas(alfa: (i: number) => number, w: number, h: number) {
  let opacos = 0, asim = 0, filas = 0;
  for (let y = 0; y < h; y++) {
    let l = -1, r = -1;
    for (let x = 0; x < w; x++) {
      if (alfa(y * w + x) > 128) { opacos++; if (l < 0) l = x; r = x; }
    }
    if (l >= 0) { asim += Math.abs(l - (w - 1 - r)) / w; filas++; }
  }
  return { relleno: opacos / Math.max(1, w * h), simetria: filas ? asim / filas : 1 };
}

/** Pinta lo transparente con el color de sus vecinos opacos, `pasos` píxeles
 *  hacia afuera, y lo que queda más lejos con el color de la marca. Sin esto,
 *  al filtrar la textura el borde trae el blanco del fondo y cada envase queda
 *  con un halo; y la etiqueta OPACA (la de la caja o la botella torneada, que
 *  no lleva transparencia) mostraría el blanco del estudio donde la silueta
 *  torneada se pasa un poco de la de la foto. El alfa no se toca. */
function sangrar(p: Uint8ClampedArray, w: number, h: number, pasos: number): void {
  const n = w * h;
  let lleno = new Uint8Array(n);
  for (let i = 0; i < n; i++) lleno[i] = p[i * 4 + 3] > 0 ? 1 : 0;
  const v = new Int32Array(4);
  for (let s = 0; s < pasos; s++) {
    const nuevo = lleno.slice();
    for (let i = 0; i < n; i++) {
      if (lleno[i]) continue;
      vecinos(i, w, n, v);
      let c = 0, r = 0, g = 0, b = 0;
      for (let k = 0; k < 4; k++) {
        const j = v[k];
        if (j >= 0 && lleno[j]) { r += p[j * 4]; g += p[j * 4 + 1]; b += p[j * 4 + 2]; c++; }
      }
      if (c) {
        p[i * 4] = Math.round(r / c); p[i * 4 + 1] = Math.round(g / c); p[i * 4 + 2] = Math.round(b / c);
        nuevo[i] = 1;
      }
    }
    lleno = nuevo;
  }
  const marca = colorDominanteDe(p);
  const [mr, mg, mb] = [1, 3, 5].map((k) => parseInt(marca.slice(k, k + 2), 16));
  for (let i = 0; i < n; i++) {
    if (lleno[i]) continue;
    p[i * 4] = mr; p[i * 4 + 1] = mg; p[i * 4 + 2] = mb;
  }
}

/** Recorta un RGBA a una caja. */
function recortar(p: Uint8ClampedArray, w: number, x0: number, y0: number, bw: number, bh: number) {
  const fuera = new Uint8ClampedArray(bw * bh * 4);
  for (let y = 0; y < bh; y++) {
    const desde = ((y0 + y) * w + x0) * 4;
    fuera.set(p.subarray(desde, desde + bw * 4), y * bw * 4);
  }
  return fuera;
}

/** Un borde de la foto suavizado con una mediana corrida de 9: el ruido del
 *  JPEG y una mota pegada al borde no deciden el fondo. `canal` 0–2. */
function bordeSuave(rgba: Uint8ClampedArray, indices: number[], canal: number): number[] {
  const v = indices.map((i) => rgba[i * 4 + canal]);
  return v.map((_, k) => mediana(v.slice(Math.max(0, k - 4), k + 5)));
}

/**
 * Lo que se distingue del FONDO en una foto cuyo fondo no se quita, y su caja.
 *
 * El fondo se modela como una superficie que une los cuatro bordes (un
 * parche de Coons: cada punto mezcla los bordes de su fila y su columna).
 * Un estudio con degradé —el caso que hace que el fondo no sea «parejo» y no
 * se quite— es justo eso: con la mediana del borde como fondo, la mitad del
 * degradé se distinguía del «fondo» y la caja del producto era la foto
 * entera. Con la caja de la foto entera el envase salía con el ancho de la
 * foto: una botella de 10 cm, de 30 cm de diámetro, y 2 frentes por
 * entrepaño en vez de 8 (la revisión de la tercera ronda).
 *
 * La tolerancia sale del ruido del propio borde, entre 18 y 60: una foto de
 * celular sobre una mesa tiene ±40 de ruido, y el producto se despega igual.
 * Las filas y columnas con menos del 1,5 % de píxeles distintos no cuentan:
 * son motas, no producto.
 */
function productoSobreFondo(rgba: Uint8ClampedArray, w: number, h: number) {
  const n = w * h;
  const arriba = Array.from({ length: w }, (_, x) => x);
  const abajo = Array.from({ length: w }, (_, x) => (h - 1) * w + x);
  const izquierda = Array.from({ length: h }, (_, y) => y * w);
  const derecha = Array.from({ length: h }, (_, y) => y * w + w - 1);
  const B = [0, 1, 2].map((c) => ({
    t: bordeSuave(rgba, arriba, c), b: bordeSuave(rgba, abajo, c),
    l: bordeSuave(rgba, izquierda, c), r: bordeSuave(rgba, derecha, c),
  }));
  // El ruido: cuánto se aparta el borde crudo de su versión suave.
  const desvios: number[] = [];
  for (const [indices, lado] of [[arriba, "t"], [abajo, "b"], [izquierda, "l"], [derecha, "r"]] as const) {
    indices.forEach((i, k) => {
      desvios.push(Math.max(...[0, 1, 2].map((c) => Math.abs(rgba[i * 4 + c] - B[c][lado][k]))));
    });
  }
  const tol = Math.min(60, Math.max(18, percentil(desvios, 0.95) * 2));
  const crudo = new Uint8Array(n);
  for (let y = 0; y < h; y++) {
    const v = h > 1 ? y / (h - 1) : 0;
    for (let x = 0; x < w; x++) {
      const u = w > 1 ? x / (w - 1) : 0;
      const i = y * w + x;
      let d = 0;
      for (let c = 0; c < 3; c++) {
        const b = B[c];
        const fondo = (1 - v) * b.t[x] + v * b.b[x] + (1 - u) * b.l[y] + u * b.r[y]
          - ((1 - u) * (1 - v) * b.t[0] + u * (1 - v) * b.t[w - 1] + (1 - u) * v * b.b[0] + u * v * b.b[w - 1]);
        d = Math.max(d, Math.abs(rgba[i * 4 + c] - fondo));
      }
      if (d > tol) crudo[i] = 1;
    }
  }
  // Las manchas chicas sueltas no son producto: el ruido de una foto de
  // celular deja píxeles por encima de la tolerancia en casi todas las filas,
  // y con ellos la caja volvía a ser la foto entera. Quedan las de al menos
  // el 2 % de la mayor, igual que en el recorte de verdad (paso 5a de
  // `recortarFondo`).
  const pieza = new Int32Array(n).fill(-1);
  const areas: number[] = [];
  const cola = new Int32Array(n);
  const v4 = new Int32Array(4);
  let mayor = 0;
  for (let i = 0; i < n; i++) {
    if (!crudo[i] || pieza[i] >= 0) continue;
    const id = areas.length;
    let a = 0, b = 0, area = 0;
    cola[b++] = i; pieza[i] = id;
    while (a < b) {
      const q = cola[a++]; area++;
      vecinos(q, w, n, v4);
      for (let k = 0; k < 4; k++) {
        const j = v4[k];
        if (j >= 0 && crudo[j] && pieza[j] < 0) { pieza[j] = id; cola[b++] = j; }
      }
    }
    areas.push(area);
    if (area > mayor) mayor = area;
  }
  const mascara = new Uint8Array(n);
  const porFila = new Int32Array(h), porColumna = new Int32Array(w);
  for (let i = 0; i < n; i++) {
    if (pieza[i] < 0 || areas[pieza[i]] < mayor * 0.02) continue;
    mascara[i] = 1; porFila[(i / w) | 0]++; porColumna[i % w]++;
  }
  const minFila = Math.max(2, Math.round(w * 0.015)), minColumna = Math.max(2, Math.round(h * 0.015));
  let y0 = -1, y1 = -1, x0 = -1, x1 = -1;
  for (let y = 0; y < h; y++) if (porFila[y] >= minFila) { if (y0 < 0) y0 = y; y1 = y; }
  for (let x = 0; x < w; x++) if (porColumna[x] >= minColumna) { if (x0 < 0) x0 = x; x1 = x; }
  return { mascara, caja: y0 < 0 || x0 < 0 ? null : { x0, y0, x1, y1 } };
}

/** La foto tal cual, opaca: es lo que se devuelve cuando no se quita el fondo.
 *
 *  «Conservado» se RECORTA a la caja del producto (`productoSobreFondo`), con
 *  un 2 % de aire: el fondo se deja —es lo que se pidió, o lo que no se pudo
 *  quitar—, pero los márgenes de la foto no son el producto, y el aspecto
 *  decide el ancho del envase y cuántos frentes entran. Sólo si la caja deja
 *  afuera algo de verdad (más del 4 % de un lado) y no es una mota (más del
 *  12 % de cada lado).
 *
 *  «Dudoso» no se recorta: es el producto claro que toca los bordes, así que
 *  la foto entera ES su caja. En los dos casos el aspecto queda marcado como
 *  poco confiable (`estado`) y `empaqueDeArte` lo acota y lo rotula «≈». */
function sinQuitar(
  rgba: Uint8ClampedArray, w: number, h: number, med: number[],
  estado: "conservado" | "dudoso", avisos: string[],
): Recorte {
  const n = w * h;
  if (estado === "conservado") {
    const { mascara, caja } = productoSobreFondo(rgba, w, h);
    if (caja) {
      const bw = caja.x1 - caja.x0 + 1, bh = caja.y1 - caja.y0 + 1;
      const recorta = (bw <= w * 0.96 || bh <= h * 0.96) && bw >= w * 0.12 && bh >= h * 0.12;
      if (recorta) {
        const mx = Math.round(bw * 0.02), my = Math.round(bh * 0.02);
        const x0 = Math.max(0, caja.x0 - mx), y0 = Math.max(0, caja.y0 - my);
        const cw = Math.min(w, caja.x1 + mx + 1) - x0, ch = Math.min(h, caja.y1 + my + 1) - y0;
        const p = recortar(rgba, w, x0, y0, cw, ch);
        for (let i = 3; i < p.length; i += 4) p[i] = 255;
        const m = new Uint8Array(cw * ch);
        for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) m[y * cw + x] = mascara[(y0 + y) * w + x0 + x];
        return {
          rgba: p, ancho: cw, alto: ch, estado,
          // El aspecto es el del PRODUCTO, sin el aire agregado.
          aspecto: bw / bh, relleno: 1,
          simetria: metricas((i) => (m[i] ? 255 : 0), cw, ch).simetria,
          perfil: perfilDe(m, cw, ch),
          colorDominante: colorDominanteDe(p),
          avisos,
        };
      }
    }
  }
  const p = new Uint8ClampedArray(rgba);
  for (let i = 3; i < p.length; i += 4) p[i] = 255;
  const distinto = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const d = Math.max(
      Math.abs(rgba[i * 4] - med[0]), Math.abs(rgba[i * 4 + 1] - med[1]), Math.abs(rgba[i * 4 + 2] - med[2]),
    );
    distinto[i] = d > 6 ? 1 : 0;
  }
  return {
    rgba: p, ancho: w, alto: h, estado,
    aspecto: w / h, relleno: 1,
    simetria: metricas((i) => (distinto[i] ? 255 : 0), w, h).simetria,
    perfil: perfilDe(distinto, w, h),
    colorDominante: colorDominanteDe(p),
    avisos,
  };
}

/**
 * Quita el fondo parejo y claro de una foto de producto.
 *
 * `rgba` es la imagen ya reducida (≤ 1024 px de lado); no se modifica.
 * `modo` es lo que pide la ficha del arte: `auto` decide solo, `quitar`
 * insiste aunque el borde no sea parejo, `conservar` no toca nada.
 */
export function recortarFondo(
  rgba: Uint8ClampedArray, w: number, h: number, modo: ModoDeFondo = "auto",
): Recorte {
  const n = w * h;
  const borde = indicesDelBorde(w, h);
  const avisos: string[] = [];

  // ── 1. ¿Ya traía transparencia? ───────────────────────────────────────────
  const transparentes = borde.filter((i) => rgba[i * 4 + 3] < 16).length;
  if (transparentes / borde.length > 0.02) {
    const p = new Uint8ClampedArray(rgba);
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let i = 0; i < n; i++) {
      if (p[i * 4 + 3] <= 12) continue;
      const x = i % w, y = (i / w) | 0;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    if (x1 < 0) { x0 = 0; y0 = 0; x1 = w - 1; y1 = h - 1; }
    // El alfa se RESPETA: el sangrado sólo pinta el color de lo transparente.
    sangrar(p, w, h, 6);
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    const fuera = recortar(p, w, x0, y0, bw, bh);
    const mascara = new Uint8Array(bw * bh);
    for (let i = 0; i < bw * bh; i++) mascara[i] = fuera[i * 4 + 3] > 128 ? 1 : 0;
    const m = metricas((i) => fuera[i * 4 + 3], bw, bh);
    return {
      rgba: fuera, ancho: bw, alto: bh, estado: "ya-tenia-alfa",
      aspecto: bw / bh, relleno: m.relleno, simetria: m.simetria,
      perfil: perfilDe(mascara, bw, bh), colorDominante: colorDominanteDe(fuera), avisos,
    };
  }

  // ── 2. El fondo: la mediana del borde y su ruido ──────────────────────────
  const med = [0, 1, 2].map((c) => mediana(borde.map((i) => rgba[i * 4 + c])));
  const dist = (i: number) => Math.max(
    Math.abs(rgba[i * 4] - med[0]), Math.abs(rgba[i * 4 + 1] - med[1]), Math.abs(rgba[i * 4 + 2] - med[2]),
  );
  const ruido = percentil(borde.map(dist), 0.95);
  // ── 3. La tolerancia ──────────────────────────────────────────────────────
  let tol = Math.min(24, Math.max(6, ruido * 1.5 + 4));
  const parejo = borde.filter((i) => dist(i) <= tol).length / borde.length >= 0.9;
  const claro = luminancia(med[0], med[1], med[2]) >= 200;
  const neutro = Math.max(...med) - Math.min(...med) <= 20;

  if (modo === "conservar") {
    avisos.push("Se dejó el fondo como está: lo pide la ficha del arte.");
    return sinQuitar(rgba, w, h, med, "conservado", avisos);
  }
  if (modo === "quitar") {
    tol = 22;
  } else if (!(parejo && claro && neutro)) {
    avisos.push(
      !claro || !neutro
        ? "El fondo de la foto no es blanco ni claro: no se quitó."
        : "El fondo de la foto no es parejo: no se quitó.",
    );
    return sinQuitar(rgba, w, h, med, "conservado", avisos);
  }

  // ── 4. Relleno 4-conexo desde todo el borde ──────────────────────────────
  const fondo = new Uint8Array(n);
  const cola = new Int32Array(n);
  const v = new Int32Array(4);
  let a = 0, b = 0;
  for (const i of borde) if (!fondo[i] && dist(i) <= tol) { fondo[i] = 1; cola[b++] = i; }
  while (a < b) {
    const i = cola[a++];
    vecinos(i, w, n, v);
    for (let k = 0; k < 4; k++) {
      const j = v[k];
      if (j >= 0 && !fondo[j] && dist(j) <= tol) { fondo[j] = 1; cola[b++] = j; }
    }
  }

  // ── 5a. Se queda con la pieza mayor (y lo que no sea una mota) ─────────────
  // Las motas de JPEG pegadas al borde son piezas chicas sueltas; al rellenar
  // huecos se volverían rectángulos. Pero «la mayor» a secas tampoco: cuando
  // el relleno se come el cuerpo blanco de un vaso, la etiqueta queda suelta
  // de la tapa y del contorno, y puede ser más grande que ellos. Se quedan las
  // piezas de al menos el 2 % de la mayor (lo medido en las fotos de prueba).
  const pieza = new Int32Array(n).fill(-1);
  const areas: number[] = [];
  let areaMayor = 0, piezas = 0;
  for (let i = 0; i < n; i++) {
    if (fondo[i] || pieza[i] >= 0) continue;
    const id = piezas++;
    let area = 0;
    a = 0; b = 0; cola[b++] = i; pieza[i] = id;
    while (a < b) {
      const q = cola[a++]; area++;
      vecinos(q, w, n, v);
      for (let k = 0; k < 4; k++) {
        const j = v[k];
        if (j >= 0 && !fondo[j] && pieza[j] < 0) { pieza[j] = id; cola[b++] = j; }
      }
    }
    areas.push(area);
    if (area > areaMayor) areaMayor = area;
  }
  const fg = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (pieza[i] >= 0 && areas[pieza[i]] >= areaMayor * 0.02) fg[i] = 1;

  // ── 5b. Los huecos: producto es lo que cae en el tramo de su fila O de su
  // columna. Es lo que devuelve el cuerpo blanco de un vaso que el relleno se
  // comió por el costado: la tapa y el borde de abajo siguen siendo producto,
  // y la columna entre los dos lo recupera.
  {
    const tramo = new Uint8Array(n);
    const { l, r } = tramosPorFila(fg, w, h);
    for (let y = 0; y < h; y++) if (l[y] >= 0) for (let x = l[y]; x <= r[y]; x++) tramo[y * w + x] = 1;
    for (let x = 0; x < w; x++) {
      let t = -1, u = -1;
      for (let y = 0; y < h; y++) if (fg[y * w + x]) { if (t < 0) t = y; u = y; }
      if (t >= 0) for (let y = t; y <= u; y++) tramo[y * w + x] = 1;
    }
    for (let i = 0; i < n; i++) if (tramo[i]) fg[i] = 1;
  }

  // ── 6. La sombra de apoyo ────────────────────────────────────────────────
  // Sólo si la franja de abajo es MÁS ANCHA que el cuerpo: una sombra de
  // estudio se abre a los costados de la base. Ahí se borra el gris neutro
  // pegado al fondo; un envase gris de verdad no es más ancho abajo.
  {
    const { l, r } = tramosPorFila(fg, w, h);
    let yMin = -1, yMax = -1;
    for (let y = 0; y < h; y++) if (l[y] >= 0) { if (yMin < 0) yMin = y; yMax = y; }
    if (yMax > yMin) {
      const alto = yMax - yMin;
      const yCorte = yMax - Math.round(alto * 0.12);
      const medios: number[] = [];
      for (let y = yMin + (alto >> 2); y <= yMin + ((3 * alto) >> 2); y++) {
        if (l[y] >= 0) medios.push(r[y] - l[y] + 1);
      }
      let base = 0;
      for (let y = yCorte; y <= yMax; y++) if (l[y] >= 0) base = Math.max(base, r[y] - l[y] + 1);
      if (base > (mediana(medios) || 1) * 1.15) {
        const esSombra = (i: number) => {
          const R = rgba[i * 4], G = rgba[i * 4 + 1], B = rgba[i * 4 + 2];
          return Math.max(R, G, B) - Math.min(R, G, B) <= 14 && (R + G + B) / 3 >= 120;
        };
        a = 0; b = 0;
        for (let i = yCorte * w; i < n; i++) {
          if (!fg[i] || !esSombra(i)) continue;
          vecinos(i, w, n, v);
          for (let k = 0; k < 4; k++) if (v[k] < 0 || !fg[v[k]]) { cola[b++] = i; break; }
        }
        while (a < b) {
          const i = cola[a++];
          if (!fg[i]) continue;
          fg[i] = 0;
          vecinos(i, w, n, v);
          for (let k = 0; k < 4; k++) {
            const j = v[k];
            if (j >= 0 && fg[j] && ((j / w) | 0) >= yCorte && esSombra(j)) cola[b++] = j;
          }
        }
        avisos.push("Se borró la sombra de apoyo de la foto.");
      }
    }
  }

  // ── 7. ¿Es confiable? ────────────────────────────────────────────────────
  let opacos = 0;
  for (let i = 0; i < n; i++) opacos += fg[i];
  // Producto claro tocando un borde: es por donde el relleno se mete cuando el
  // envase es del color del fondo, y si pasa en tres lados ya no se sabe qué
  // es producto y qué es estudio.
  const claroEn = (i: number) => fg[i] && luminancia(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]) >= 200;
  let lados = 0;
  const lado = (indices: number[]) => indices.filter(claroEn).length / indices.length > 0.05;
  const arriba = Array.from({ length: w }, (_, x) => x);
  const abajo = Array.from({ length: w }, (_, x) => (h - 1) * w + x);
  const izquierda = Array.from({ length: h }, (_, y) => y * w);
  const derecha = Array.from({ length: h }, (_, y) => y * w + w - 1);
  for (const indices of [arriba, abajo, izquierda, derecha]) if (lado(indices)) lados++;
  if (opacos / n < 0.2 || lados >= 3) {
    avisos.push(opacos / n < 0.2
      ? "Dudoso: el recorte se llevó casi toda la foto. Se dejó como está; elegí Quitar o Dejar."
      : "Dudoso: el producto claro toca varios bordes de la foto. Se dejó como está; elegí Quitar o Dejar.");
    return sinQuitar(rgba, w, h, med, "dudoso", avisos);
  }

  // ── 8. Alfa suave de 2 px, descontaminado ────────────────────────────────
  // El borde del envase trae mezclado el blanco del estudio. Se le baja el
  // alfa según cuánto se parece al fondo y se le RESTA el fondo al color
  // —c' = (c − (1−a)·fondo)/a—, que es lo que quita el halo claro.
  const alfa = new Float32Array(n);
  for (let i = 0; i < n; i++) alfa[i] = fg[i];
  let frente: number[] = [];
  for (let i = 0; i < n; i++) {
    if (!fg[i]) continue;
    vecinos(i, w, n, v);
    for (let k = 0; k < 4; k++) if (v[k] < 0 || !fg[v[k]]) { frente.push(i); break; }
  }
  const visto = new Uint8Array(n);
  for (let paso = 0; paso < 2 && frente.length; paso++) {
    const sig: number[] = [];
    for (const i of frente) {
      if (visto[i]) continue;
      visto[i] = 1;
      alfa[i] = Math.min(1, Math.max(0.15, (dist(i) - tol * 0.35) / (tol * 1.3)));
      vecinos(i, w, n, v);
      for (let k = 0; k < 4; k++) { const j = v[k]; if (j >= 0 && fg[j] && !visto[j]) sig.push(j); }
    }
    frente = sig;
  }
  const p = new Uint8ClampedArray(rgba);
  for (let i = 0; i < n; i++) {
    const A = alfa[i];
    if (A > 0 && A < 1) {
      for (let c = 0; c < 3; c++) {
        p[i * 4 + c] = Math.max(0, Math.min(255, Math.round((rgba[i * 4 + c] - (1 - A) * med[c]) / A)));
      }
    }
    p[i * 4 + 3] = Math.round(A * 255);
  }

  // ── 9. Recorte a la caja del alfa ────────────────────────────────────────
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let i = 0; i < n; i++) {
    if (p[i * 4 + 3] <= 12) continue;
    const x = i % w, y = (i / w) | 0;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  if (x1 < 0) {
    avisos.push("Dudoso: no quedó nada después de quitar el fondo. Se dejó como está.");
    return sinQuitar(rgba, w, h, med, "dudoso", avisos);
  }
  sangrar(p, w, h, 6);
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  const fuera = recortar(p, w, x0, y0, bw, bh);
  const mascara = new Uint8Array(bw * bh);
  for (let i = 0; i < bw * bh; i++) mascara[i] = fuera[i * 4 + 3] > 128 ? 1 : 0;
  const m = metricas((i) => fuera[i * 4 + 3], bw, bh);
  return {
    rgba: fuera, ancho: bw, alto: bh, estado: "fondo-quitado",
    aspecto: bw / bh, relleno: m.relleno, simetria: m.simetria,
    perfil: perfilDe(mascara, bw, bh),
    colorDominante: colorDominanteDe(fuera),
    avisos,
  };
}
