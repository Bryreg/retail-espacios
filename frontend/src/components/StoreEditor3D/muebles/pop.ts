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
 * por detrás de la base de los vasos: «una cosa sin terminar»—; en uno
 * apaisado (el cabezote de la nevera, 1,1 m × 9 cm) la franja de la
 * etiqueta repetida desde el centro. Sin la raya.
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

interface Copete { textura: THREE.CanvasTexture; material: THREE.MeshStandardMaterial }

/** Pocos: hay una punta probada a la vez, a lo sumo un par. */
const MAXIMO = 8;
const cache = new Map<string, Copete>();

/** Un color `#rrggbb` aclarado una fracción hacia el blanco. */
function aclarar(hex: string, k: number): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const f = (v: number) => Math.round(v + (255 - v) * k).toString(16).padStart(2, "0");
  return `#${f(r)}${f(g)}${f(b)}`;
}

function dibujar(et: Etiqueta, ancho: number, alto: number): HTMLCanvasElement {
  const W = 1024, H = Math.max(64, Math.round((1024 * alto) / ancho));
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d")!;
  const base = colorDe(et);
  // El degradé, en diagonal: del color de la marca a uno 18 % más claro.
  const gr = g.createLinearGradient(0, H, W, 0);
  gr.addColorStop(0, base);
  gr.addColorStop(1, aclarar(base, 0.18));
  g.fillStyle = gr;
  g.fillRect(0, 0, W, H);
  const p = et.lienzo;
  const aspecto = p.width / Math.max(1, p.height);
  const pegar = (cx: number, altura: number) => {
    const a = altura * aspecto;
    g.drawImage(p, cx - a / 2, (H - altura) / 2, a, altura);
  };
  if (W / H <= 4.5) {
    // El héroe al centro, sobre un halo claro que lo despega del fondo, y dos
    // más chicos arrimados a sus costados.
    const heroe = H * 0.9, chico = H * 0.66;
    const halo = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, heroe * 0.75);
    halo.addColorStop(0, "rgba(255,255,255,0.22)");
    halo.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = halo;
    g.fillRect(0, 0, W, H);
    const paso = (heroe * aspecto) / 2 + (chico * aspecto) / 2 + W * 0.02;
    pegar(W / 2 - paso, chico);
    pegar(W / 2 + paso, chico);
    pegar(W / 2, heroe);
  } else {
    // Apaisado (el cabezote de la nevera, 1,1 m × 9 cm): el producto entero
    // a ese alto es un palito —una botella de 2 L salía de 2 cm de ancho—.
    // Va la franja del MEDIO de la foto, que es donde está la etiqueta: el
    // arte del proveedor tal cual, repetido desde el centro hacia afuera.
    const y0 = Math.round(p.height * 0.34), alto = Math.max(1, Math.round(p.height * 0.32));
    const altura = H * 0.84;
    const ancho = (altura * p.width) / alto;
    const paso = ancho + H * 0.35;
    const cuantos = Math.max(1, Math.min(12, Math.floor((W * 0.9) / paso)));
    for (let k = 0; k < cuantos; k++) {
      const cx = W / 2 + (k - (cuantos - 1) / 2) * paso;
      g.drawImage(p, 0, y0, p.width, alto, cx - ancho / 2, (H - altura) / 2, ancho, altura);
    }
  }
  return c;
}

/** El color de la marca: el dominante de la foto, o un gris si no hay. */
function colorDe(et: Etiqueta): string {
  return /^#[0-9a-f]{6}$/i.test(et.recorte.colorDominante) ? et.recorte.colorDominante : "#808080";
}

/**
 * El material de la chapa impresa del copete para una etiqueta, o el que ya
 * estaba. Se cachea por etiqueta y medida (redondeada a 5 mm).
 */
export function materialDeCopete(
  et: Etiqueta, ancho: number, alto: number, entorno: THREE.Texture | null,
): THREE.MeshStandardMaterial {
  const mm5 = (v: number) => Math.round(v * 200);
  const clave = `${et.clave}:${mm5(ancho)}:${mm5(alto)}`;
  const ya = cache.get(clave);
  if (ya) {
    cache.delete(clave);
    cache.set(clave, ya);
    if (ya.material.envMap !== entorno) { ya.material.envMap = entorno; ya.material.needsUpdate = true; }
    return ya.material;
  }
  const textura = new THREE.CanvasTexture(dibujar(et, ancho, alto));
  textura.colorSpace = THREE.SRGBColorSpace;
  textura.anisotropy = 8;
  const material = materialImpreso(textura, entorno);
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
}
