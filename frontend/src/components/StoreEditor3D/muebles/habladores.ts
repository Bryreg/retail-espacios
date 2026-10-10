/**
 * Los habladores: las etiquetas de precio que cuelgan del porta-precios.
 *
 * ## Por qué existen
 *
 * En Éxito, Olímpica o Jumbo no hay un frente sin su hablador. La tira blanca
 * y lisa en cada entrepaño era, en la toma «De cerca», la señal más clara de
 * «maqueta» que vio la crítica. Pero un hablador es justo donde un sistema de
 * venta podría MENTIR: un precio que nadie cargó, el nombre del producto de
 * otro proveedor en la pantalla que mira éste. Las tres reglas:
 *
 * - **Nunca se inventa un precio.** El hablador del producto en prueba lleva
 *   la cifra SÓLO si alguien la cargó en la ficha (`precio_publico`); si no,
 *   en ese lugar van dos barras grises. Y el nombre va sin sus números («150 g»
 *   se lee como un precio desde el otro lado de la videollamada).
 * - **Lo de otros no se lee.** Lo vendido a otros proveedores lleva habladores
 *   GENÉRICOS: etiquetas blancas con la franja amarilla y rayas grises, sin
 *   texto (`pintarHabladoresGenericos` no escribe nada).
 * - **Lo libre, vacío.** Un vano sin relleno no lleva hablador; tampoco uno
 *   con un slot vendido que cubre medio vano (`tramosConRelleno`): el hablador
 *   quedaría también sobre la mitad libre.
 *
 * Es puro (el dibujo recibe un contexto 2D) para que `probar-muebles` lo corra
 * con un contexto falso que anota lo que se escribe.
 */
import type { GrupoDeRelleno } from "./frentes";
import type { Vano } from "./medidas";
import { ENTREPANO, PORTA_PRECIOS } from "./medidas";

/** El hablador: 6 × 2,6 cm, como uno de verdad sobre una tira de 3 cm. */
export const HABLADOR = {
  ancho: 0.06,
  alto: 0.026,
  /** Delante de la cara de la tira (de su caja), para no pelearse con ella en
   *  el z-buffer. */
  delante: 0.001,
  /** Un bloque de producto más ancho que esto lleva otro hablador más. */
  cada: 0.6,
  /** El lienzo de la textura (por arte). */
  lienzo: { ancho: 256, alto: 112 },
} as const;

/** Lo que dice el hablador de un producto en prueba. */
export interface ContenidoDelHablador {
  /** El nombre, sin sus números (contenido, gramos, litros). */
  nombre: string;
  /** «$ 4.900», o `null` si nadie cargó el precio. */
  precio: string | null;
}

/** Lo que hace falta de un arte del catálogo. */
export interface ArteConFicha {
  nombre: string;
  ficha?: { precio_publico?: number | null } | null;
}

/**
 * Lo que dice el hablador de un arte: el nombre sin cifras y el precio SÓLO
 * si está cargado en la ficha. Sin precio, `precio: null` y el dibujo pone
 * dos barras grises.
 */
export function contenidoDelHablador(arte: ArteConFicha): ContenidoDelHablador {
  const nombre = arte.nombre
    // «150 g», «1,5 L», «2L», «x 6 un», «1.000 ml»: cualquier número con su
    // unidad, y después cualquier dígito suelto que quede.
    .replace(/\b(x\s*)?\d+([.,]\d+)*\s*(kg|g|gr|grs|mg|ml|cc|cl|l|lt|lts|oz|un|und|uds|unidades)?\b\.?/gi, " ")
    .replace(/\d/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const n = arte.ficha?.precio_publico;
  return { nombre, precio: n != null && Number.isFinite(n) && n > 0 ? `$ ${Math.round(n).toLocaleString("es-CO")}` : null };
}

/** Lo que usa el dibujo de un contexto 2D: el real o uno falso en las pruebas. */
export interface Lienzo2D {
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  fillRect(x: number, y: number, w: number, h: number): void;
  strokeRect(x: number, y: number, w: number, h: number): void;
  fillText(texto: string, x: number, y: number, maximo?: number): void;
  measureText(texto: string): { width: number };
}

/** Los colores del hablador: el amarillo genérico de las etiquetas de góndola
 *  y el gris de lo que no se dice. Sin color de ninguna marca. */
const AMARILLO = "#f2c230";
const GRIS = "#c8c8c4";

/**
 * Dibuja el hablador de un producto en prueba: cuerpo blanco, la franja
 * amarilla arriba, el nombre en letra chica y, sólo si está cargado, el precio
 * grande. Sin precio, dos barras grises en su lugar: NUNCA una cifra.
 */
export function pintarHablador(g: Lienzo2D, c: ContenidoDelHablador, W: number, H: number): void {
  g.fillStyle = "#fdfdfb";
  g.fillRect(0, 0, W, H);
  g.fillStyle = AMARILLO;
  g.fillRect(0, 0, W, Math.round(H * 0.2));
  g.strokeStyle = "#d9d8d2";
  g.lineWidth = 2;
  g.strokeRect(1, 1, W - 2, H - 2);
  g.fillStyle = "#3a3a3a";
  g.textAlign = "left";
  g.textBaseline = "alphabetic";
  g.font = `600 ${Math.round(H * 0.15)}px sans-serif`;
  if (c.nombre) g.fillText(recortarTexto(g, c.nombre, W - 16), 8, Math.round(H * 0.38), W - 16);
  if (c.precio) {
    g.fillStyle = "#151515";
    g.textAlign = "right";
    g.font = `800 ${Math.round(H * 0.42)}px sans-serif`;
    g.fillText(c.precio, W - 8, H - 10, W - 16);
  } else {
    g.fillStyle = GRIS;
    g.fillRect(8, Math.round(H * 0.52), Math.round(W * 0.62), Math.round(H * 0.1));
    g.fillRect(8, Math.round(H * 0.71), Math.round(W * 0.4), Math.round(H * 0.1));
  }
}

/** El texto acortado con «…» hasta que entra en `maximo` px. */
function recortarTexto(g: Lienzo2D, texto: string, maximo: number): string {
  if (g.measureText(texto).width <= maximo) return texto;
  let t = texto;
  while (t.length > 1 && g.measureText(`${t}…`).width > maximo) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

/** El tramo de tira que repite la textura genérica, en metros. */
export const TRAMO_GENERICO = 0.35;

/**
 * Lo que se VE de la tira de la góndola y la punta, como fracción de su alto
 * desde el borde de abajo (la `v` de su UV). La tira va centrada en el plano
 * de apoyo y montada detrás del labio del entrepaño (`CaraDeEstanteria`), que
 * sube 3 cm desde 2 mm por debajo de ese plano: la mitad de arriba queda
 * tapada, y a la vista sólo queda del borde de abajo hasta el espesor del
 * entrepaño, ≈ 0,43. La primera versión centraba la etiqueta en la tira
 * entera y en las capturas se veía sólo su mitad de abajo —una raya gris, sin
 * la franja amarilla—: no se leía como un hablador.
 */
export const VENTANA_DE_LA_TIRA = (PORTA_PRECIOS.alto / 2 - ENTREPANO.espesor) / PORTA_PRECIOS.alto;

/**
 * La textura de los habladores GENÉRICOS (lo vendido a otros): sobre el color
 * de la tira, una etiqueta por tramo de ~35 cm, blanca con la franja amarilla y
 * dos rayas grises, dentro de lo que se ve de la tira (`VENTANA_DE_LA_TIRA`).
 * Sin texto — no llama a `fillText` —: desde la pantalla del proveedor no se
 * lee de quién es ni cuánto cuesta lo de al lado.
 */
export function pintarHabladoresGenericos(g: Lienzo2D, W: number, H: number): void {
  g.fillStyle = "#f7f5ef";
  g.fillRect(0, 0, W, H);
  const ancho = Math.round(W * (HABLADOR.ancho / TRAMO_GENERICO));
  // La ventana va de la fila `arriba` al borde de abajo del lienzo (el lienzo
  // se sube con `flipY`: su fila 0 es la `v` = 1, el borde de arriba de la
  // tira). La etiqueta la llena con un margen de un 8 %.
  const ventana = H * VENTANA_DE_LA_TIRA, arriba = H - ventana;
  const alto = Math.max(3, Math.round(ventana * 0.84));
  const x = Math.round(W * 0.08), y = Math.round(arriba + (ventana - alto) / 2);
  g.fillStyle = "#ffffff";
  g.fillRect(x, y, ancho, alto);
  g.fillStyle = AMARILLO;
  g.fillRect(x, y, ancho, Math.max(1, Math.round(alto * 0.22)));
  g.fillStyle = GRIS;
  g.fillRect(x + 3, y + Math.round(alto * 0.45), Math.round(ancho * 0.7), Math.max(1, Math.round(alto * 0.12)));
  g.fillRect(x + 3, y + Math.round(alto * 0.7), Math.round(ancho * 0.45), Math.max(1, Math.round(alto * 0.12)));
  g.strokeStyle = "#dedcd5";
  g.lineWidth = 1;
  g.strokeRect(x + 0.5, y + 0.5, ancho - 1, alto - 1);
}

/** Una unidad del frente, con el ancho de su envase. */
export interface DelFrente { x: number; ancho: number }

/**
 * Dónde van los habladores de un producto en una fila: uno por BLOQUE
 * (unidades seguidas; un parante corta el bloque) en su borde IZQUIERDO visto
 * desde el pasillo —que es +X: la cara mira a −Z—, como se ponen en tienda, y
 * otro más cada 60 cm si el bloque es ancho. Devuelve los centros en X.
 */
export function posicionesDeHabladores(frente: readonly DelFrente[]): number[] {
  if (frente.length === 0) return [];
  const orden = [...frente].sort((a, b) => b.x - a.x);
  const bloques: { desde: number; hasta: number }[] = [];
  for (const u of orden) {
    const izq = u.x + u.ancho / 2, der = u.x - u.ancho / 2;
    const ultimo = bloques[bloques.length - 1];
    // Un hueco de más de 3 cm (un parante mide 5) es otro bloque.
    if (ultimo && ultimo.hasta - izq <= 0.03) ultimo.hasta = Math.min(ultimo.hasta, der);
    else bloques.push({ desde: izq, hasta: der });
  }
  const fuera: number[] = [];
  for (const b of bloques) {
    if (b.desde - b.hasta < HABLADOR.ancho) {
      // Un bloque más angosto que el hablador: centrado.
      fuera.push((b.desde + b.hasta) / 2);
      continue;
    }
    for (let x = b.desde - HABLADOR.ancho / 2; x - HABLADOR.ancho / 2 >= b.hasta - 1e-9; x -= HABLADOR.cada) fuera.push(x);
  }
  return fuera;
}

/** Qué cubre el relleno de un (vano, entrepaño) para llevar habladores: el
 *  80 % del ancho útil del vano o más. */
export const COBERTURA_PARA_HABLADOR = 0.8;

/**
 * Qué (entrepaño, vano) de cada cara llevan habladores genéricos: los que el
 * relleno de lo VENDIDO a otros (`rellenoPorRubro`) cubre en un 80 % o más del
 * ancho del vano. Un slot que toma medio vano deja ese porta-precios liso: si
 * no, la mitad libre tendría habladores. Devuelve, por cara, las claves
 * `${entrepaño}|${vano}`.
 */
export function tramosConRelleno(
  grupos: readonly GrupoDeRelleno[], vanos: readonly Vano[], caras: readonly { hacia: 1 | -1 }[],
): Set<string>[] {
  const extremos = new Map<string, { desde: number; hasta: number }>();
  for (const g of grupos) {
    const a = g.empaque.ancho;
    for (const p of g.posiciones) {
      // El relleno está en coordenadas del MUEBLE (`ProductoEnMueble` dibuja las
      // dos caras sin girar), pero el vano `vi` de la clave es el de la cara
      // tal como la monta el mueble: la que mira a +Z (`hacia` 1) va girada
      // media vuelta (`GondolaReal`), y su vano local `vi` queda en −x. Sin
      // esto, en la cara B de una góndola doble el hablador caía en el vano
      // OPUESTO al relleno: el porta-precios bajo lo vendido, liso, y el vano
      // libre con habladores.
      const x = caras[p.cara]?.hacia === 1 ? -p.x : p.x;
      const v = vanos.findIndex((vano) => Math.abs(x - vano.x) <= vano.ancho / 2 + 1e-6);
      if (v < 0) continue;
      const k = `${p.cara}|${p.fila}|${v}`;
      const e = extremos.get(k);
      if (e) { e.desde = Math.min(e.desde, p.x - a / 2); e.hasta = Math.max(e.hasta, p.x + a / 2); }
      else extremos.set(k, { desde: p.x - a / 2, hasta: p.x + a / 2 });
    }
  }
  const fuera = Array.from({ length: caras.length }, () => new Set<string>());
  for (const [k, e] of extremos) {
    const [c, fila, v] = k.split("|").map(Number);
    if ((e.hasta - e.desde) >= COBERTURA_PARA_HABLADOR * vanos[v].ancho) fuera[c]?.add(`${fila}|${v}`);
  }
  return fuera;
}
