/**
 * El copete de una punta SIN prueba en la pantalla de venta: la chapa de la
 * tienda, no la de un proveedor.
 *
 * La crítica: los copetes blancos lisos y enormes de las puntas libres se
 * leían como marcadores de posición sin terminar. En una tienda ahí va la
 * señalética de la cadena. El sistema no tiene el arte de la sede ni sabe qué
 * categoría va —el rubro de un contrato es texto libre y puede traer la marca
 * de otro proveedor, que el que mira no puede ver—, así que va SIN TEXTO: el
 * color de la tienda en degradé, una faja más clara abajo (la cenefa) y dos
 * filetes. Nada que diga algo que nadie decidió.
 *
 * Vive aparte de `pop.ts` (que arrastra la etiqueta del producto) para que la
 * punta no cargue el envase sólo por su chapa.
 */
import * as THREE from "three";
import { BRILLO, conLuzDeVenta, K_ENTORNO_MUEBLE } from "./luzDeVenta";

/** El color de la chapa de la tienda: un azul petróleo apagado. No es de
 *  ningún proveedor ni de ninguna cadena; el sistema no tiene el color de la
 *  sede, y lo que hace falta es que no sea un blanco liso. */
export const COLOR_DE_TIENDA = "#2f5868";

/** Un color `#rrggbb` aclarado una fracción hacia el blanco. */
function aclarar(hex: string, k: number): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const f = (v: number) => Math.round(v + (255 - v) * k).toString(16).padStart(2, "0");
  return `#${f(r)}${f(g)}${f(b)}`;
}

type Pincel = Pick<CanvasRenderingContext2D, "fillRect" | "createLinearGradient" | "createRadialGradient"> & { fillStyle: unknown };

/** El dibujo de la chapa de la tienda, sobre un contexto 2D de W × H. */
export function pintarCopeteDeTienda(g: Pincel, W: number, H: number): void {
  const gr = g.createLinearGradient(0, H, W, 0);
  gr.addColorStop(0, COLOR_DE_TIENDA);
  gr.addColorStop(1, aclarar(COLOR_DE_TIENDA, 0.22));
  g.fillStyle = gr;
  g.fillRect(0, 0, W, H);
  // Un brillo suave arriba a la derecha: chapa impresa, no un plano de color.
  const h = g.createRadialGradient(W * 0.72, H * 0.2, 0, W * 0.72, H * 0.2, W * 0.45);
  h.addColorStop(0, "rgba(255,255,255,0.16)");
  h.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = h;
  g.fillRect(0, 0, W, H);
  // La faja de abajo y dos filetes claros.
  g.fillStyle = aclarar(COLOR_DE_TIENDA, 0.55);
  g.fillRect(0, H * 0.8, W, H * 0.2);
  g.fillStyle = aclarar(COLOR_DE_TIENDA, 0.75);
  g.fillRect(0, H * 0.76, W, H * 0.018);
  g.fillRect(W * 0.06, H * 0.14, W * 0.18, H * 0.02);
}

let copete: { textura: THREE.CanvasTexture; material: THREE.MeshStandardMaterial } | null = null;

/** El material de la chapa de la tienda: UNO para todas las puntas libres de
 *  la sesión, con la luz de los muebles de venta (es chapa del mueble, como el
 *  porta-precios). Sólo se pide en venta. */
export function materialDeCopeteDeTienda(): THREE.MeshStandardMaterial {
  if (copete) return copete.material;
  const c = document.createElement("canvas");
  c.width = 512; c.height = 192;
  pintarCopeteDeTienda(c.getContext("2d")!, c.width, c.height);
  const textura = new THREE.CanvasTexture(c);
  textura.colorSpace = THREE.SRGBColorSpace;
  textura.anisotropy = 8;
  const material = new THREE.MeshStandardMaterial({
    map: textura, metalness: 0, roughness: 0.6,
    ...conLuzDeVenta(true, K_ENTORNO_MUEBLE, BRILLO.precios),
  });
  copete = { textura, material };
  return material;
}

/** Suelta la chapa de la tienda (con los copetes, al desmontar el editor). */
export function olvidarCopeteDeTienda(): void {
  if (!copete) return;
  copete.textura.dispose();
  copete.material.dispose();
  copete = null;
}
