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

/** Un contexto 2D: el del lienzo, o uno falso en `probar-muebles`. El
 *  trazado y la lectura (el panel redondeado del cabezote, la nitidez de la
 *  marca) son opcionales: el falso de las pruebas puede no tenerlos. */
type Pincel = Pick<CanvasRenderingContext2D,
  "fillRect" | "drawImage" | "createLinearGradient" | "createRadialGradient"> & { fillStyle: unknown }
  & Partial<Pick<CanvasRenderingContext2D,
    "beginPath" | "moveTo" | "arcTo" | "closePath" | "fill" | "stroke" | "getImageData" | "putImageData">>
  & { globalAlpha?: number; strokeStyle?: unknown; lineWidth?: number; canvas?: CanvasImageSource };

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
      // 4,5 cm del copete son su vuelo sobre el costado (`COPETE.vuelo`), y
      // el remate de un robatope pegado a la punta los tapa en la toma de
      // frente.
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
  // envase la tiene (la botella transparente) o la del medio de la foto, sin
  // el `CANTO_DE_LA_ETIQUETA` de cada lado: ahí la foto de un envase redondo
  // se oscurece con la curva y el recorte se leía como un rectángulo pegado.
  const f = conFranja ? et.franja() : FRANJA_DEL_MEDIO;
  const fx0 = f.x0 + (f.x1 - f.x0) * CANTO_DE_LA_ETIQUETA, fx1 = f.x1 - (f.x1 - f.x0) * CANTO_DE_LA_ETIQUETA;
  const sx = Math.round(fx0 * p.width), sw = Math.max(1, Math.round((fx1 - fx0) * p.width));
  const sy = Math.round(f.desde * p.height), sh = Math.max(1, Math.round((f.hasta - f.desde) * p.height));
  // La marca, al alto del PANEL (`PANEL_DEL_CABEZOTE.alto`) menos su margen,
  // sin ampliar la foto más de `AMPLIACION_MAXIMA` y a lo sumo un tercio del
  // ancho.
  const altoPanel = H * PANEL_DEL_CABEZOTE.alto;
  let altura = Math.min(altoPanel * 0.84, sh * AMPLIACION_MAXIMA);
  let ancho = (altura * sw) / sh;
  if (ancho > W / 3) { altura *= W / 3 / ancho; ancho = W / 3; }
  // El PANEL de la etiqueta detrás de la marca: el papel de la etiqueta (su
  // propio fondo: el rosa de la de Postobón, el blanco del vaso), saturado y
  // claro como el resto de la chapa con la luz detrás. Desde la crítica de la
  // demo (ronda 3) es un RECTÁNGULO de esquinas redondeadas con un filete
  // blanco que lo encuadra, no un halo: la mancha rosada difusa no se leía
  // como aviso. Si la marca, al tope de la ampliación, no llega al
  // `PANEL_DEL_CABEZOTE.ancho` del cabezote, se repite UNA vez a cada lado
  // al `ECO_DE_LA_MARCA` de opacidad —luz de fondo, no miniaturas—, y el
  // panel abarca las tres.
  const fondo0 = (f as { fondo?: string | null }).fondo ?? et.recorte.colorDominante;
  const fondo = /^#[0-9a-f]{6}$/i.test(fondo0) ? saturar(fondo0, 0.6, 0.5, 0.64) : fondo0;
  const panel = /^#[0-9a-f]{6}$/i.test(fondo) && distancia(fondo, base) > 40 ? fondo : aclarar(base, 0.55);
  const conEco = ancho < W * PANEL_DEL_CABEZOTE.ancho;
  const paso = ancho * 1.08;
  const anchoPanel = Math.min(W * 0.9, Math.max(W * PANEL_DEL_CABEZOTE.ancho, (conEco ? ancho + 2 * paso : ancho) + H * 0.5));
  const px0 = W / 2 - anchoPanel / 2, py0 = (H - altoPanel) / 2;
  const radio = altoPanel * 0.22;
  const trazar = (x: number, y: number, w: number, h: number, r: number) => {
    if (!g.beginPath || !g.moveTo || !g.arcTo || !g.closePath) return false;
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
    return true;
  };
  g.fillStyle = panel;
  if (trazar(px0, py0, anchoPanel, altoPanel, radio) && g.fill) g.fill();
  else g.fillRect(px0, py0, anchoPanel, altoPanel);
  // El filete blanco: el borde definido del panel.
  const filete = Math.max(2, H * 0.03);
  if (g.stroke && trazar(px0 + filete / 2, py0 + filete / 2, anchoPanel - filete, altoPanel - filete, radio - filete / 2)) {
    g.strokeStyle = "rgba(255,255,255,0.92)";
    g.lineWidth = filete;
    g.stroke();
  }
  const dy = (H - altura) / 2;
  const dx = W / 2 - ancho / 2;
  g.drawImage(p, sx, sy, sw, sh, dx, dy, ancho, altura);
  // El papel de la foto llevado al del panel (`igualarFondo`: la foto es más
  // oscura que la chapa con la luz detrás, y el recorte se veía como un
  // rectángulo bordó pegado) y nitidez leve (un realce de radio 1): la foto
  // llega reducida y, filtrada al dibujarse, la marca se leía borrosa.
  const fundido = Math.max(2, Math.min(altura * 0.12, W * BORDE_FUNDIDO));
  const papel = (f as { fondo?: string | null }).fondo;
  if (g.getImageData && g.putImageData) {
    const x0 = Math.max(0, Math.floor(dx)), y0 = Math.max(0, Math.floor(dy));
    const w = Math.min(W - x0, Math.ceil(ancho)), h = Math.min(H - y0, Math.ceil(altura));
    if (w > 2 && h > 2) {
      const img = g.getImageData(x0, y0, w, h);
      // Columna por columna: el papel de la foto de un envase redondo se
      // oscurece hacia los costados (la curva), y con un solo color de papel
      // el recorte seguía siendo un rectángulo más oscuro en los cantos.
      if (/^#[0-9a-f]{6}$/i.test(panel)) igualarFondoPorColumna(img.data, w, h, panel);
      else if (papel && /^#[0-9a-f]{6}$/i.test(papel)) igualarFondo(img.data, papel, panel);
      realzar(img.data, w, h, NITIDEZ_DE_LA_MARCA);
      g.putImageData(img, x0, y0);
    }
  }
  // El canto del recorte se funde con el panel, fino (el papel ya es el del
  // panel), sin tocar la marca.
  fundirBordes(g, dx, dy, ancho, altura, panel, fundido);
  // El eco, a cada lado: copiado de la marca YA igualada (del propio lienzo),
  // así su papel es el del panel y al 30 % sólo asoma la letra. Sin lienzo (el
  // pincel de las pruebas), de la foto.
  if (conEco) {
    const alfa = g.globalAlpha ?? 1;
    g.globalAlpha = ECO_DE_LA_MARCA;
    for (const s of [-1, 1]) {
      if (g.canvas) g.drawImage(g.canvas, dx, dy, ancho, altura, dx + s * paso, dy, ancho, altura);
      else g.drawImage(p, sx, sy, sw, sh, dx + s * paso, dy, ancho, altura);
    }
    g.globalAlpha = alfa;
  }
}

/** Qué parte del ancho de la etiqueta se deja afuera de cada lado en el
 *  cabezote: la curva de un envase redondo, más oscura en la foto. */
export const CANTO_DE_LA_ETIQUETA = 0.06;

/**
 * Lleva el papel de un recorte (`papel`, el fondo de la etiqueta en la foto)
 * al color del panel donde va pegado, canal por canal, con una curva: el
 * negro queda negro, el papel pasa a ser el panel y la tinta clara (más allá
 * de `LETRA_BLANCA_DESDE` del camino al blanco) queda BLANCA —la letra de la
 * marca no se apaga aunque el panel tenga menos de un canal que el papel—.
 * Entre esos puntos, lineal. RGBA en el lugar; el alfa no se toca.
 */
export function igualarFondo(datos: Uint8ClampedArray, papel: string, panel: string): void {
  igualarConPapel(datos, 0, datos.length / 4, 1, [1, 3, 5].map((i) => parseInt(papel.slice(i, i + 2), 16)), panel);
}

/** Desde qué fracción del camino entre el papel y el blanco una tinta clara
 *  cuenta como letra blanca: la foto de un envase redondo trae la marca más
 *  apagada en el costado que se aleja de la luz («MANZANA» blanca a la
 *  izquierda y rosa a la derecha), y en un aviso retroiluminado la letra es
 *  pareja. */
export const LETRA_BLANCA_DESDE = 0.55;

/** La curva (negro → negro, papel → panel, letra clara → blanco) sobre `n`
 *  píxeles desde `desde`, de `paso` en `paso`. */
function igualarConPapel(datos: Uint8ClampedArray, desde: number, n: number, paso: number, papel: number[], panel: string): void {
  const a = papel.map((v) => Math.min(254, Math.max(1, v)));
  const b = [1, 3, 5].map((i) => parseInt(panel.slice(i, i + 2), 16));
  const w = a.map((v) => v + LETRA_BLANCA_DESDE * (255 - v));
  const curva = (c: number, k: number) => (c <= a[k] ? (c * b[k]) / a[k]
    : c >= w[k] ? 255 : b[k] + ((c - a[k]) * (255 - b[k])) / (w[k] - a[k]));
  for (let j = 0; j < n; j++) {
    const i = (desde + j * paso) * 4;
    for (let k = 0; k < 3; k++) datos[i + k] = curva(datos[i + k], k);
  }
}

/**
 * `igualarFondo` con el papel de CADA COLUMNA: la mediana de la columna (la
 * mayoría de una franja de etiqueta es papel), suavizada a lo ancho para que
 * no queden rayas. Lleva a la vez el color del papel y la sombra de la curva
 * del envase al color del panel. RGBA (`w` × `h`) en el lugar.
 */
export function igualarFondoPorColumna(datos: Uint8ClampedArray, w: number, h: number, panel: string): void {
  const medianas: number[][] = [];
  const col = new Array<number>(h);
  for (let x = 0; x < w; x++) {
    const m: number[] = [];
    for (let k = 0; k < 3; k++) {
      for (let y = 0; y < h; y++) col[y] = datos[(y * w + x) * 4 + k];
      col.sort((p, q) => p - q);
      m.push(col[Math.floor(h / 2)]);
    }
    medianas.push(m);
  }
  const r = Math.max(1, Math.round(w / 40));
  for (let x = 0; x < w; x++) {
    const suave = [0, 0, 0];
    let n = 0;
    for (let d = -r; d <= r; d++) {
      const xx = Math.min(w - 1, Math.max(0, x + d));
      for (let k = 0; k < 3; k++) suave[k] += medianas[xx][k];
      n++;
    }
    igualarConPapel(datos, x, h, w, suave.map((v) => v / n), panel);
  }
}

/** El panel de la etiqueta del cabezote: el alto (fracción del cabezote) y
 *  el ancho mínimo que tiene que cubrir la marca (si no, lleva su eco). */
export const PANEL_DEL_CABEZOTE = { alto: 0.86, ancho: 0.4 } as const;
/** La opacidad de la marca repetida a cada lado, como luz de fondo. */
export const ECO_DE_LA_MARCA = 0.3;
/** Cuánto realza los bordes de la marca la nitidez (0 = nada). */
export const NITIDEZ_DE_LA_MARCA = 0.6;

/**
 * Un realce de nitidez (máscara de enfoque) de radio 1 sobre RGBA, en el
 * lugar: cada píxel suma `cantidad` × (él − el promedio de su cruz). El alfa
 * no se toca. Puro: lo corre `probar-muebles`.
 */
export function realzar(datos: Uint8ClampedArray, w: number, h: number, cantidad: number): void {
  const orig = Uint8ClampedArray.from(datos);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      for (let k = 0; k < 3; k++) {
        const c = orig[i + k];
        const vecinos = (x > 0 ? orig[i - 4 + k] : c) + (x < w - 1 ? orig[i + 4 + k] : c)
          + (y > 0 ? orig[i - w * 4 + k] : c) + (y < h - 1 ? orig[i + w * 4 + k] : c);
        datos[i + k] = c + cantidad * (c - vecinos / 4);
      }
    }
  }
}

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
