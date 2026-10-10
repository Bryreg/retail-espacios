/**
 * El copete de la punta con la marca del producto que se está probando.
 *
 * La superficie más grande de una punta es el copete, y gris liso dice
 * «maqueta» antes que cualquier otra cosa: en una punta real de Éxito o de
 * Olímpica ahí va la marca, y es justo lo que el proveedor compra. Pero el
 * sistema no tiene el arte del copete de nadie, y no lo va a inventar.
 *
 * Lo que sí tiene es la foto del producto en prueba. Con eso arma un cartel
 * honesto: un degradé del color de la marca (el dominante de la foto) y
 * recortes del producto. SIN texto ni logos: nada que el proveedor no haya
 * puesto.
 *
 * La composición (segunda ronda): en un cartel casi cuadrado, un recorte
 * HÉROE al centro con dos más chicos arrimados —la primera versión ponía dos
 * en las puntas y dejaba el centro azul vacío, con una raya blanca que pasaba
 * por detrás de la base de los vasos: «una cosa sin terminar»—. En uno
 * apaisado (el cabezote de la nevera, 1,1 m × 9 cm), desde la ronda 2 de la
 * dueña, la misma receta: UN recorte grande de la franja de la etiqueta,
 * fundido con el fondo, sobre la chapa más clara; retroiluminado, como el
 * aviso luminoso de una nevera de marca (`dibujarCartel`). Sin la raya.
 *
 * Sólo con «Toda la cara» (el mueble entero es de ese proveedor) y sólo
 * mientras dura la prueba: al quitarla, o al pasar a «Por entrepaño», el
 * copete vuelve a ser gris. Lo usan el copete de la punta, su cenefa y el
 * cabezote de la nevera; la bandera de pasillo y el cabezote del robatope
 * quedan fuera.
 */
import * as THREE from "three";
import type { Etiqueta } from "./etiqueta";
import { materialImpreso } from "./etiqueta";
import { olvidarCopeteDeTienda } from "./copeteDeTienda";

interface Copete { textura: THREE.CanvasTexture; material: THREE.MeshStandardMaterial }

/** Pocos: hay una punta probada a la vez, a lo sumo un par. */
const MAXIMO = 8;
const cache = new Map<string, Copete>();

/** Un envase es «angosto» si su foto es más alta que el doble de su ancho:
 *  la caja de 1 L, una botella. Ahí el copete lleva el abanico. */
export const ENVASE_ANGOSTO = 0.5;

/** Dónde arranca la franja del logo en el copete (fracción del ancho): más
 *  allá del vuelo, que tapa un mueble pegado. */
export const MARGEN_DE_LA_FRANJA = 0.09;

/** La franja del medio de la foto: la de un envase sin etiqueta localizada
 *  (caja, vaso), donde suele estar el logo. */
const FRANJA_DEL_MEDIO = { desde: 0.34, hasta: 0.66, x0: 0, x1: 1 };

/** Un color `#rrggbb` aclarado una fracción hacia el blanco. */
function aclarar(hex: string, k: number): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const f = (v: number) => Math.round(v + (255 - v) * k).toString(16).padStart(2, "0");
  return `#${f(r)}${f(g)}${f(b)}`;
}

/** Un color `#rrggbb` con la saturación subida (HSL) y la luminosidad
 *  acotada: el color de la marca tal como se ve en una chapa retroiluminada.
 *  Mezclado con gris (lo de antes) el rojo de Postobón era un rosa salmón
 *  sucio y el lila de Alpina, un gris. */
export function saturar(hex: string, s0 = 0.62, l0 = 0.36, l1 = 0.5): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (d < 0.03) return hex; // un gris no tiene tono que subir: no se inventa uno
  let hue = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  hue = (hue * 60 + 360) % 360;
  const sat = Math.max(s0, d / (1 - Math.abs(2 * l - 1)));
  const lum = Math.min(l1, Math.max(l0, l));
  const c = (1 - Math.abs(2 * lum - 1)) * Math.min(1, sat), x = c * (1 - Math.abs(((hue / 60) % 2) - 1)), m = lum - c / 2;
  const [rr, gg, bb] = hue < 60 ? [c, x, 0] : hue < 120 ? [x, c, 0] : hue < 180 ? [0, c, x] : hue < 240 ? [0, x, c] : hue < 300 ? [x, 0, c] : [c, 0, x];
  const f = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${f(rr)}${f(gg)}${f(bb)}`;
}

/** Cuánto se puede ampliar un recorte de la foto en el cartel: 1,5 píxeles
 *  del cartel por píxel de la foto. Más, y se ve como un JPG estirado. */
export const AMPLIACION_MAXIMA = 1.5;

/** Lo que necesita el dibujo de un cartel: la foto con alfa y dónde está la
 *  etiqueta en ella. `Etiqueta` lo cumple; las pruebas pasan uno falso. */
type FuenteDeCartel = Pick<Etiqueta, "lienzo" | "recorte" | "franja"> & Partial<Pick<Etiqueta, "colorDeMarca">>;

/** Un contexto 2D: el del lienzo, o uno falso en `probar-muebles`. */
type Pincel = Pick<CanvasRenderingContext2D,
  "fillRect" | "drawImage" | "createLinearGradient" | "createRadialGradient"> & { fillStyle: unknown };

/**
 * El dibujo del cartel, sobre un contexto 2D de W × H.
 *
 * - Casi cuadrado (el copete de la punta), con un envase ancho (el vaso): el
 *   héroe al centro con dos más chicos arrimados. Con uno ANGOSTO (la caja
 *   de 1 L, una botella; `ENVASE_ANGOSTO`): el héroe con dos por lado en
 *   abanico y, si el cartel es apaisado, la franja del logo a la izquierda.
 * - Apaisado (el cabezote de la nevera, 1,1 m × 9 cm): la receta del copete,
 *   no la de una plancha de stickers. Antes iba la franja del medio de la
 *   foto repetida en mosaico —diez miniaturas iguales sobre rojo plano—; ahora
 *   UN recorte grande de la franja de la ETIQUETA (`franja`, leída del rgba),
 *   centrado al 80 % del alto, recortado al ancho de la silueta en esas filas
 *   (sin el PET de los costados), sobre el degradé con un halo claro detrás,
 *   con los bordes fundidos (sin canto duro). Sin texto: nada que el
 *   proveedor no haya puesto.
 */
export function dibujarCartel(
  g: Pincel, W: number, H: number, et: FuenteDeCartel, conFranja: boolean,
): void {
  // El cabezote (apaisado) es un aviso RETROILUMINADO: con el color de la
  // marca tal cual (el rojo de Postobón, luminancia ~60) se leía como una
  // lámina oscura con un sticker pegado. Va un 25 % más claro, como la chapa
  // translúcida con la luz detrás.
  const apaisado = W / H > 4.5;
  const base = apaisado ? saturar(colorDe(et)) : colorDe(et);
  // El degradé: en el copete, en diagonal, del color de la marca a uno 18 %
  // más claro; en el cabezote, de arriba (más claro: la luz detrás de la chapa
  // pega arriba) hacia abajo. En diagonal, en un cartel de 13 a 1, no se veía.
  const gr = apaisado ? g.createLinearGradient(0, 0, 0, H) : g.createLinearGradient(0, H, W, 0);
  gr.addColorStop(apaisado ? 1 : 0, base);
  gr.addColorStop(apaisado ? 0 : 1, aclarar(base, apaisado ? 0.32 : 0.18));
  g.fillStyle = gr;
  g.fillRect(0, 0, W, H);
  const p = et.lienzo;
  const aspecto = p.width / Math.max(1, p.height);
  const pegar = (cx: number, altura: number) => {
    const a = altura * aspecto;
    g.drawImage(p, cx - a / 2, (H - altura) / 2, a, altura);
  };
  const halo = (radio: number, k: number, cx = W / 2) => {
    const h = g.createRadialGradient(cx, H / 2, 0, cx, H / 2, radio);
    h.addColorStop(0, `rgba(255,255,255,${k})`);
    h.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = h;
    g.fillRect(0, 0, W, H);
  };
  if (W / H <= 4.5) {
    if (aspecto >= ENVASE_ANGOSTO) {
      // Un envase ancho (el vaso): el héroe al centro, sobre un halo claro que
      // lo despega del fondo, y dos más chicos arrimados a sus costados.
      const heroe = H * 0.9, chico = H * 0.66;
      halo(heroe * 0.75, 0.22);
      const paso = (heroe * aspecto) / 2 + (chico * aspecto) / 2 + W * 0.02;
      pegar(W / 2 - paso, chico);
      pegar(W / 2 + paso, chico);
      pegar(W / 2, heroe);
      return;
    }
    // Un envase ANGOSTO (la caja de 1 L de la Avena, una botella): con la
    // receta del vaso, tres cajas de 7 cm ocupaban la cuarta parte del cartel
    // y el resto era fondo liso, «una pizarra con stickers». Va el héroe con
    // DOS unidades por lado en abanico (cada una un poco más chica y apenas
    // detrás de la de adentro) y, si el cartel es apaisado, la franja de la
    // etiqueta (el logo) recortada a la izquierda, grande, como en el
    // cabezote. Sin texto: la franja es la foto del proveedor.
    // La franja del LOGO a la izquierda va sólo si es la etiqueta de verdad
    // (la botella transparente, `conFranja`): en una caja era la banda del
    // medio de la foto de canto a canto, y en la Avena se comía la «f» de
    // «finesse» —el logo llega al borde de la foto— y salía borrosa y con un
    // halo, el titular del mueble mutilado. Sin ella, el abanico lleva TRES
    // unidades por lado (como el copete del Finesse: envases enteros).
    // Sin ampliar la foto más de `AMPLIACION_MAXIMA`: si así queda chica (menos
    // de la mitad del alto), no va.
    const f = conFranja && W / H >= 2 ? et.franja() : null;
    const altoDelLogo = f ? Math.min(H * 0.8, (f.hasta - f.desde) * p.height * AMPLIACION_MAXIMA) : 0;
    const conLogo = f && altoDelLogo >= H * 0.45 ? f : null;
    const tamanos = (conLogo ? [0.9, 0.78, 0.66] : [0.9, 0.78, 0.66, 0.56]).map((k) => H * k);
    const anchos = tamanos.map((t) => t * aspecto);
    const solape = 0.1;
    let abanico = anchos[0] + 2 * anchos.slice(1).reduce((a, b) => a + b, 0) * (1 - solape);
    let x0 = W * 0.04, x1 = W - W * 0.04;
    if (conLogo) {
      // La franja arranca más adentro (el 9 % del ancho): los primeros
      // 5 cm del copete son su vuelo sobre el costado, y el cabezote de un
      // robatope pegado a la punta los tapa en la toma de frente.
      x0 = W * MARGEN_DE_LA_FRANJA;
      const f = conLogo;
      const sx = Math.round(f.x0 * p.width), sw = Math.max(1, Math.round((f.x1 - f.x0) * p.width));
      const sy = Math.round(f.desde * p.height), sh = Math.max(1, Math.round((f.hasta - f.desde) * p.height));
      let alto = altoDelLogo, ancho = (alto * sw) / sh;
      if (ancho > W * 0.34) { alto *= (W * 0.34) / ancho; ancho = W * 0.34; }
      const cx = x0 + ancho / 2;
      const h = g.createRadialGradient(cx, H / 2, 0, cx, H / 2, Math.max(ancho, alto) * 0.75);
      h.addColorStop(0, "rgba(255,255,255,0.24)");
      h.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = h;
      g.fillRect(0, 0, W, H);
      g.drawImage(p, sx, sy, sw, sh, cx - ancho / 2, (H - alto) / 2, ancho, alto);
      // Sin canto duro (como el cabezote): el blanco de la caja de la Avena
      // era un rectángulo pegado sobre el morado.
      fundirBordes(g, cx - ancho / 2, (H - alto) / 2, ancho, alto, base, Math.max(2, Math.min(alto * 0.12, W * BORDE_FUNDIDO * 1.5)));
      x0 += ancho + W * 0.04;
    }
    // Que el abanico entre en lo que queda, sin ampliar la foto más de
    // `AMPLIACION_MAXIMA`.
    const k = Math.min(1, (x1 - x0) / abanico, (AMPLIACION_MAXIMA * p.height) / tamanos[0]);
    abanico *= k;
    const centro = (x0 + x1) / 2;
    halo(tamanos[0] * 0.75 * k, 0.22, centro);
    const pegarEn = (cx: number, t: number) => {
      const altura = t * k, a = altura * aspecto;
      g.drawImage(p, cx - a / 2, (H - altura) / 2, a, altura);
    };
    // De afuera hacia adentro: la de adentro tapa el borde de la de afuera.
    const ds = [0];
    for (let i = 1; i < tamanos.length; i++) ds.push(ds[i - 1] + (anchos[i - 1] / 2 + anchos[i] / 2 * (1 - 2 * solape)) * k);
    for (let i = tamanos.length - 1; i >= 1; i--) for (const s of [-1, 1]) pegarEn(centro + s * ds[i], tamanos[i]);
    pegarEn(centro, tamanos[0]);
    return;
  }
  // Apaisado: el cabezote retroiluminado. La franja: la de la etiqueta si el
  // envase la tiene (la botella transparente) o la del medio de la foto.
  const f = conFranja ? et.franja() : FRANJA_DEL_MEDIO;
  const sx = Math.round(f.x0 * p.width), sw = Math.max(1, Math.round((f.x1 - f.x0) * p.width));
  const sy = Math.round(f.desde * p.height), sh = Math.max(1, Math.round((f.hasta - f.desde) * p.height));
  // Al 78 % del alto, sin ampliar la foto más de `AMPLIACION_MAXIMA` (en la
  // lámina «De cerca» salía pixelado), y a lo sumo el 60 % del ancho.
  let altura = Math.min(H * 0.78, sh * AMPLIACION_MAXIMA);
  let ancho = (altura * sw) / sh;
  if (ancho > W * 0.6) { altura *= (W * 0.6) / ancho; ancho = W * 0.6; }
  halo(Math.max(ancho * 0.9, H * 1.2), 0.4);
  // El PANEL de la etiqueta detrás de la marca: su propio fondo (el rosa de
  // la etiqueta de Postobón, el blanco del vaso), de `PANEL_DEL_CABEZOTE` del
  // ancho como mínimo, con las puntas fundidas. Solo, el recorte ocupaba el 8 %
  // del aviso: «una calcomanía sobre una franja de color». No es un dibujo
  // nuevo: es el papel de la etiqueta, estirado detrás de su marca.
  // Con la luz detrás, como el resto de la chapa: el color del papel
  // saturado y claro (en la foto, el rosa del centro de la etiqueta promedia
  // #9c5063: sin luz, una banda bordó detrás de la marca).
  const fondo0 = (f as { fondo?: string | null }).fondo ?? et.recorte.colorDominante;
  const fondo = /^#[0-9a-f]{6}$/i.test(fondo0) ? saturar(fondo0, 0.6, 0.5, 0.64) : fondo0;
  const panel = /^#[0-9a-f]{6}$/i.test(fondo) && distancia(fondo, base) > 40 ? fondo : null;
  const anchoPanel = Math.max(ancho, W * PANEL_DEL_CABEZOTE);
  if (panel) {
    const px0 = W / 2 - anchoPanel / 2, py = (H - altura) / 2;
    const punta = Math.min(anchoPanel * 0.18, W * 0.06);
    const gp = g.createLinearGradient(px0, 0, px0 + anchoPanel, 0);
    gp.addColorStop(0, rgba(panel, 0));
    gp.addColorStop(punta / anchoPanel, rgba(panel, 1));
    gp.addColorStop(1 - punta / anchoPanel, rgba(panel, 1));
    gp.addColorStop(1, rgba(panel, 0));
    g.fillStyle = gp;
    g.fillRect(px0, py, anchoPanel, altura);
  }
  const dx = W / 2 - ancho / 2, dy = (H - altura) / 2;
  g.drawImage(p, sx, sy, sw, sh, dx, dy, ancho, altura);
  // Sin borde: el recorte se FUNDE con lo que tiene detrás (el panel, o la
  // chapa) en sus cuatro lados. Con el canto duro, el rectángulo de la
  // etiqueta se leía pegado encima, como un sticker. Y sin las botellitas de
  // las puntas: el aviso es la marca.
  fundirBordes(g, dx, dy, ancho, altura, panel ?? base, Math.max(2, Math.min(altura * 0.2, W * BORDE_FUNDIDO)));
}

/** Qué parte del ancho del cabezote cubre, como mínimo, el panel de la
 *  etiqueta detrás de la marca. */
export const PANEL_DEL_CABEZOTE = 0.4;

/** La distancia entre dos colores `#rrggbb` (la mayor por canal). */
function distancia(a: string, b: string): number {
  const ca = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16)), cb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return Math.max(...ca.map((v, i) => Math.abs(v - cb[i])));
}

/** Funde los cuatro bordes de un rectángulo pegado (`x, y, w, h`) con el
 *  color del fondo, en `f` px: degradés del color opaco a transparente. */
function fundirBordes(g: Pincel, x: number, y: number, w: number, h: number, color: string, f: number): void {
  const lados: [number, number, number, number, number, number, number, number][] = [
    [x, 0, x + f, 0, x, y, f, h],
    [x + w, 0, x + w - f, 0, x + w - f, y, f, h],
    [0, y, 0, y + f, x, y, w, f],
    [0, y + h, 0, y + h - f, x, y + h - f, w, f],
  ];
  for (const [x0, y0, x1, y1, rx, ry, rw, rh] of lados) {
    const gr = g.createLinearGradient(x0, y0, x1, y1);
    gr.addColorStop(0, rgba(color, 1));
    gr.addColorStop(1, rgba(color, 0));
    g.fillStyle = gr;
    g.fillRect(rx, ry, rw, rh);
  }
}

/** Cuánto del ancho del cabezote se funde el recorte en cada borde. */
export const BORDE_FUNDIDO = 0.009;

/** `#rrggbb` con alfa, para un degradé que se desvanece. */
function rgba(hex: string, a: number): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgba(${r},${g},${b},${a})`;
}

function dibujar(et: Etiqueta, ancho: number, alto: number, conFranja: boolean): HTMLCanvasElement {
  // El cabezote (apaisado) a 2048: cruza la toma «De cerca» de punta a punta,
  // y a 1024 la marca salía pixelada en la lámina.
  const lado = ancho / alto > 4.5 ? 2048 : 1024;
  const W = lado, H = Math.max(64, Math.round((lado * alto) / ancho));
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  dibujarCartel(c.getContext("2d")!, W, H, et, conFranja);
  return c;
}

/** El color de la marca: el de la etiqueta (`colorDeMarca`: el dominante, o
 *  en un envase casi blanco el de su logo), o el dominante de la foto, o un
 *  gris si no hay. Con el dominante a secas, la Avena en caja blanca daba un
 *  copete blanco sobre blanco. */
export function colorDe(et: Pick<Etiqueta, "recorte"> & Partial<Pick<Etiqueta, "colorDeMarca">>): string {
  const marca = et.colorDeMarca?.();
  if (marca && /^#[0-9a-f]{6}$/i.test(marca)) return marca;
  return /^#[0-9a-f]{6}$/i.test(et.recorte.colorDominante) ? et.recorte.colorDominante : "#808080";
}

/** La clave del caché de un cartel: etiqueta, medida (a 5 mm), si es
 *  retroiluminado y si recorta la franja de la etiqueta. */
export function claveDeCopete(
  clave: string, ancho: number, alto: number, opciones: { retroiluminado?: boolean; franja?: boolean } = {},
): string {
  const mm5 = (v: number) => Math.round(v * 200);
  return `${clave}:${mm5(ancho)}:${mm5(alto)}:${opciones.retroiluminado ? "luz" : "-"}:${opciones.franja ? "franja" : "medio"}`;
}

/**
 * El material de la chapa impresa del copete para una etiqueta, o el que ya
 * estaba. Se cachea por etiqueta, medida (redondeada a 5 mm), retroiluminado
 * y franja (`claveDeCopete`).
 */
export function materialDeCopete(
  et: Etiqueta, ancho: number, alto: number, entorno: THREE.Texture | null,
  opciones: { retroiluminado?: boolean; franja?: boolean } = {},
): THREE.MeshStandardMaterial {
  // El retroiluminado y la franja en la clave: sin ellos, el copete de la
  // punta y un cabezote de las mismas medidas se pisarían.
  const clave = claveDeCopete(et.clave, ancho, alto, opciones);
  const ya = cache.get(clave);
  if (ya) {
    cache.delete(clave);
    cache.set(clave, ya);
    if (ya.material.envMap !== entorno) { ya.material.envMap = entorno; ya.material.needsUpdate = true; }
    return ya.material;
  }
  const textura = new THREE.CanvasTexture(dibujar(et, ancho, alto, !!opciones.franja));
  textura.colorSpace = THREE.SRGBColorSpace;
  textura.anisotropy = 8;
  const material = materialImpreso(textura, entorno, !!opciones.retroiluminado);
  cache.set(clave, { textura, material });
  for (const [k, v] of cache) {
    if (cache.size <= MAXIMO) break;
    v.textura.dispose(); v.material.dispose();
    cache.delete(k);
  }
  return material;
}

/**
 * La cenefa de la punta: la tira del color de la marca que tapa el hueco de
 * 6,5 cm entre el último entrepaño y el copete.
 *
 * Ese hueco es del mueble —la punta reparte sus entrepaños así— y con el
 * producto puesto se veía como una bandeja vacía a la altura de los ojos,
 * justo debajo de la marca: una punta negociada se lee surtida hasta arriba.
 * En tienda ahí va la cenefa del proveedor; acá, su color, con un filo un
 * poco más claro abajo y sin nada escrito.
 */
export function materialDeCenefa(et: Etiqueta, entorno: THREE.Texture | null): THREE.MeshStandardMaterial {
  const clave = `cenefa:${et.clave}`;
  const ya = cache.get(clave);
  if (ya) {
    if (ya.material.envMap !== entorno) { ya.material.envMap = entorno; ya.material.needsUpdate = true; }
    return ya.material;
  }
  const c = document.createElement("canvas");
  c.width = 64; c.height = 32;
  const g = c.getContext("2d")!;
  const base = colorDe(et);
  g.fillStyle = base;
  g.fillRect(0, 0, 64, 32);
  g.fillStyle = aclarar(base, 0.35);
  g.fillRect(0, 27, 64, 5);
  const textura = new THREE.CanvasTexture(c);
  textura.colorSpace = THREE.SRGBColorSpace;
  const material = materialImpreso(textura, entorno);
  cache.set(clave, { textura, material });
  return material;
}

/** Suelta todos los copetes. La llama el desmontaje del editor. */
export function olvidarCopetes(): void {
  for (const v of cache.values()) { v.textura.dispose(); v.material.dispose(); }
  cache.clear();
  olvidarCopeteDeTienda();
}
