/**
 * El relleno neutro de lo vendido a otros, en la pantalla de venta: que se lea
 * como EMPAQUE y no como fichas de LEGO.
 *
 * ## Lo que vio la crítica
 *
 * Lo vendido a otros proveedores se dibujaba como bloques de UN color por
 * rubro —morado eléctrico, oliva, azul rey, chocolate— con una banda un poco
 * más clara. En cada toma abierta ocupaban un 20–35 % del cuadro: el envase
 * del proveedor se veía real y el pasillo de al lado, de juguete. La regla no
 * cambia —sin marcas, sin texto, ilegible a distancia: «ningún mueble inventa
 * producto», y lo vendido a otros no muestra a otros—, pero el relleno tiene
 * que parecer mercadería.
 *
 * ## Qué cambia (sólo en venta; el editor sigue como siempre)
 *
 * - **Un color por «producto», en bloques** (`coloresDelRelleno`): cada rubro
 *   tiene una paleta de cinco colores APAGADOS (saturación ≤ 0,45, como un
 *   pasillo colombiano: el aseo en blancos, celestes y verdes; los enlatados
 *   en rojos y amarillos; las galletas en azules, rojos y dorados), y a lo
 *   largo de cada entrepaño los frentes van en bloques de 2 a 5 del mismo
 *   color, como un planograma. Un bloque no cruza un parante.
 * - **Una etiqueta pintada en la cara del frente** (`pintarEtiquetaDeRelleno`):
 *   cuatro diseños abstractos —banda clara con una mancha de «logo», ventana
 *   de «foto», sello redondo, franjas— con rayas grises que no dicen nada. Una
 *   sola textura para toda la tienda, y el diseño va por bloque.
 * - **Cero llamadas nuevas**: el color y el diseño viajan en el color por
 *   instancia de la MISMA `InstancedMesh` (`parcheDeRellenoDeVenta`).
 */
import * as THREE from "three";
import { azarDe } from "./frentes";
import { hashTexto } from "./producto";

// ─── Las paletas ──────────────────────────────────────────────────────────────

/**
 * Las paletas por rubro, en sRGB. Cinco colores apagados por familia: la
 * saturación HSV de cada uno no pasa de 0,45 (`SATURACION_MAXIMA`) —con
 * colores puros un lineal parece un gráfico de barras, que es lo que se veía—.
 * El rojo y el verde están permitidos: en la pantalla de venta el estado
 * comercial no se dibuja (el porta-precios lleva habladores).
 */
export const PALETAS: Record<string, readonly string[]> = {
  aseo: ["#e6e9ec", "#9cc3d9", "#8fbfae", "#5d7fa8", "#b7a9cc"],
  enlatados: ["#a8645d", "#c7ad6e", "#7d8a5a", "#5f7396", "#e3dccd"],
  galletas: ["#56709a", "#a86262", "#c4a86e", "#e5d8bd", "#806252"],
  bebidas: ["#aa6560", "#5c8a66", "#c99870", "#6283a6", "#d1be7a"],
  lacteos: ["#e8ecef", "#6f8fb5", "#a9c6dd", "#b87575", "#dccb8a"],
  cereales: ["#cdb172", "#a86060", "#5f7aa0", "#7a9466", "#c89e72"],
  snacks: ["#d4c078", "#ad6161", "#c99c70", "#6f9468", "#6680a8"],
  panaderia: ["#ebe6dc", "#6a85ad", "#b06a66", "#d9c27e", "#8a6a52"],
  abarrotes: ["#e4ddd0", "#a86a5e", "#cbb478", "#6a80a3", "#7d9070"],
  otros: ["#6683a8", "#c4a974", "#7c9472", "#94606a", "#b8b6b0"],
};

/** Ninguna paleta pasa de esta saturación (HSV). */
export const SATURACION_MAXIMA = 0.45;
/** Ni de esta luminancia para abajo (luma sRGB, 0–255): en un vecino atenuado
 *  el café de las galletas (#6e5040, 85) y el azul de los enlatados quedaban
 *  como manchas casi negras —el p5 del relleno en 24—. */
export const LUMA_MINIMA = 100;

/**
 * La exposición del relleno en un mueble VECINO (el que no se muestra). El
 * mueble vecino va con `EXPOSICION_DEL_VECINO` (0,38) para que no compita;
 * su producto con eso caía a casi negro en los colores oscuros. El relleno es
 * mercadería vendida, con color: queda un poco más arriba que su mueble, que
 * sigue siendo lo que se apaga.
 */
export const EXPOSICION_DEL_RELLENO_VECINO = 0.55;

/** Qué palabras del rubro (el COMIENZO de cada una, sin tildes, como
 *  `rubroQueCasa`) llevan a qué paleta. El rubro es texto libre: puede traer
 *  una marca, y la marca NUNCA se dibuja; sólo elige colores. */
const FAMILIAS: [readonly string[], string][] = [
  [["aseo", "limpi", "detergente", "jabon", "suavizante", "cloro", "shampoo", "blanqueador", "desinfect", "higien", "papel"], "aseo"],
  [["atun", "conserva", "enlatad", "sardina", "arveja", "lata"], "enlatados"],
  [["galleta", "wafer", "bizcoch"], "galletas"],
  [["gaseosa", "refresco", "bebida", "cola", "soda", "agua", "jugo", "isotonic", "energiz", "hidrat", "cerveza"], "bebidas"],
  [["leche", "lacteo", "yogur", "crema", "kumis", "queso"], "lacteos"],
  [["cereal", "avena", "granola"], "cereales"],
  [["snack", "papa", "pasabocas", "chip", "mecato", "dulce", "confite", "chocolate"], "snacks"],
  [["pan", "panader", "tostad", "ponque", "tajado"], "panaderia"],
  [["arroz", "frijol", "lenteja", "harina", "azucar", "sal", "pasta", "fideo", "aceite", "cafe", "grano"], "abarrotes"],
];

const sinTildes = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** La paleta de un rubro (texto libre): la de su familia, o la de «otros». */
export function paletaDeRubro(rubro: string | null | undefined): readonly string[] {
  const palabras = sinTildes(rubro ?? "").split(/[^a-z0-9]+/).filter(Boolean);
  for (const [prefijos, familia] of FAMILIAS) {
    if (prefijos.some((p) => palabras.some((w) => w.startsWith(p)))) return PALETAS[familia];
  }
  return PALETAS.otros;
}

// ─── Los bloques ──────────────────────────────────────────────────────────────

/** Cuántos frentes seguidos lleva un mismo «producto»: de 2 a 5. */
export const BLOQUE = { min: 2, max: 5 } as const;

/** Los diseños de etiqueta de la textura (`pintarEtiquetaDeRelleno`). */
export const DISENOS = 4;

/** Cuánto varía el tono de una unidad a otra dentro del bloque (±): el
 *  desorden de lo que se repuso en tandas distintas. */
export const VARIACION_EN_EL_BLOQUE = 0.04;

/** El color (sRGB, 0–1) y el diseño de etiqueta de cada unidad del relleno;
 *  `producto` es el color de la paleta (su índice), sin la variación. */
export interface ColorDeRelleno { rgb: [number, number, number]; diseno: number; producto: number }

/**
 * El color y el diseño de etiqueta de cada posición de un grupo del relleno,
 * en el MISMO orden que `posiciones` (pura, sembrada: el mismo mueble se ve
 * igual siempre).
 *
 * Por (cara, entrepaño), los frentes se ordenan a lo ancho y se reparten en
 * bloques de `BLOQUE.min` a `BLOQUE.max` del mismo color y diseño, cada bloque
 * distinto del anterior. Un salto de más de 1,6 pasos entre dos frentes es un
 * parante: ahí empieza otro bloque. Las unidades de atrás (la misma x) llevan
 * el color de su frente.
 */
export function coloresDelRelleno(
  posiciones: readonly { cara: number; fila: number; x: number }[],
  rubro: string | null | undefined,
  semilla: string,
): ColorDeRelleno[] {
  const paleta = paletaDeRubro(rubro).map(rgbDe);
  const azar = azarDe(hashTexto(`bloques|${semilla}`));
  const fuera: ColorDeRelleno[] = new Array(posiciones.length);
  const porTira = new Map<string, number[]>();
  posiciones.forEach((p, i) => {
    const k = `${p.cara}|${p.fila}`;
    const lista = porTira.get(k) ?? [];
    lista.push(i);
    porTira.set(k, lista);
  });
  // Recorrido en orden de clave: el azar se consume siempre igual.
  for (const k of [...porTira.keys()].sort()) {
    const indices = porTira.get(k)!;
    const xs = [...new Set(indices.map((i) => Math.round(posiciones[i].x * 1e4)))].sort((a, b) => a - b);
    const pasos = xs.slice(1).map((x, j) => x - xs[j]).sort((a, b) => a - b);
    const paso = pasos.length ? pasos[Math.floor(pasos.length / 2)] : 0;
    const deX = new Map<number, ColorDeRelleno>();
    let quedan = 0, color = -1, diseno = -1;
    xs.forEach((x, j) => {
      const parante = j > 0 && paso > 0 && x - xs[j - 1] > paso * 1.6;
      if (quedan <= 0 || parante) {
        quedan = BLOQUE.min + Math.floor(azar() * (BLOQUE.max - BLOQUE.min + 1));
        let c = Math.floor(azar() * paleta.length);
        if (c === color) c = (c + 1 + Math.floor(azar() * (paleta.length - 1))) % paleta.length;
        color = c;
        diseno = Math.floor(azar() * DISENOS);
      }
      const t = 1 + (azar() * 2 - 1) * VARIACION_EN_EL_BLOQUE;
      const [r, g, b] = paleta[color];
      deX.set(x, { rgb: [r * t, g * t, b * t], diseno, producto: color });
      quedan--;
    });
    for (const i of indices) fuera[i] = deX.get(Math.round(posiciones[i].x * 1e4))!;
  }
  return fuera;
}

function rgbDe(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/**
 * El color por instancia que lleva el diseño de etiqueta ADENTRO: el rojo
 * (lineal) más 2 × diseño. El rojo de un color está entre 0 y 1, así que
 * `floor(r / 2)` devuelve el diseño y `r − 2·diseño` el rojo, sin un atributo
 * por instancia (que obligaría a clonar la geometría, compartida por caché).
 * Lo decodifica `parcheDeRellenoDeVenta`.
 */
export function colorConDiseno(linealRgb: readonly [number, number, number], diseno: number): [number, number, number] {
  return [linealRgb[0] + 2 * diseno, linealRgb[1], linealRgb[2]];
}

// ─── La etiqueta ──────────────────────────────────────────────────────────────

/** Un contexto 2D: el del lienzo, o uno falso en las pruebas. */
type Pincel = Pick<CanvasRenderingContext2D, "fillRect" | "beginPath" | "ellipse" | "fill"> & { fillStyle: unknown };

/**
 * Los cuatro diseños de etiqueta, uno al lado del otro (W × H, cada celda de
 * W/4). La textura es un DATO, no una imagen: el rojo es cuánto se oscurece
 * el color del envase (1 = nada; el «logo» y las rayas, menos) y el verde,
 * cuánto se lleva a blanco (la banda, la ventana, el sello). Abajo, el 5 %
 * de cada celda queda liso: ahí miran los costados, la tapa y la base.
 *
 * Sin texto: rayas grises de un par de píxeles que a la distancia del pasillo
 * se leen como letra impresa y de cerca no dicen nada.
 *
 * ## Empaque desenfocado, no pictograma (la crítica de la demo, ronda 3)
 *
 * La primera versión pintaba el «logo» y la «ventana» con 0,42–0,55 de luz y
 * bordes duros: óvalos y rectángulos casi negros, y en la caja la banda clara
 * con corte neto. En «De cerca» del robatope el relleno ocupaba media pantalla
 * al lado del arroz real y se leía como un juguete. Ahora:
 *
 * - nada baja de `SOMBRA_MINIMA` (0,62) de la luz del envase: el «logo» es un
 *   tono medio del mismo color, no un agujero;
 * - lo claro es papel a medias (a lo sumo `BLANCO_MAXIMO` hacia el blanco) y
 *   la franja del diseño 3 apenas se despega (+10 %);
 * - la ventana de la «foto» va en degradé;
 * - y todo se suaviza 3–4 px después de pintar (`suavizarPorCelda`, sólo en
 *   la textura de verdad): de lejos se lee como un empaque fuera de foco.
 */
export const SOMBRA_MINIMA = 0.62;
/** Lo más que una zona clara de la etiqueta se lleva hacia el blanco. */
export const BLANCO_MAXIMO = 0.5;

export function pintarEtiquetaDeRelleno(g: Pincel, W: number, H: number): void {
  const celda = W / DISENOS;
  const pintar = (sombra: number, blanco: number) => {
    const r = Math.round(Math.max(SOMBRA_MINIMA, sombra) * 255);
    const v = Math.round(Math.min(BLANCO_MAXIMO, blanco) * 255);
    g.fillStyle = `rgb(${r},${v},${r})`;
  };
  // v (0 abajo, 1 arriba) → y del lienzo.
  const y = (v: number) => (1 - v) * H;
  const rect = (d: number, u0: number, v0: number, u1: number, v1: number) =>
    g.fillRect(d * celda + u0 * celda, y(v1), (u1 - u0) * celda, (v1 - v0) * H);
  const elipse = (d: number, u: number, v: number, ru: number, rv: number) => {
    g.beginPath();
    g.ellipse(d * celda + u * celda, y(v), ru * celda, rv * H, 0, 0, Math.PI * 2);
    g.fill();
  };
  const rayas = (d: number, u0: number, u1: number, vs: number[]) => {
    vs.forEach((v, i) => rect(d, u0, v, u1 - (i % 2) * 0.12, v + 0.018));
  };
  /** Un rectángulo en degradé vertical (de `abajo` a `arriba` de blanco), en
   *  franjas finas: el suavizado de después las funde. */
  const degrade = (d: number, u0: number, v0: number, u1: number, v1: number, sombra: number, abajo: number, arriba: number) => {
    const n = 8;
    for (let i = 0; i < n; i++) {
      pintar(sombra, abajo + ((arriba - abajo) * (i + 0.5)) / n);
      rect(d, u0, v0 + ((v1 - v0) * i) / n, u1, v0 + ((v1 - v0) * (i + 1)) / n);
    }
  };
  // El fondo de todo: el color del envase, sin tocar.
  pintar(1, 0);
  g.fillRect(0, 0, W, H);

  // 0 · Banda clara con el «logo» en un tono medio y rayas abajo.
  pintar(1, 0.45); rect(0, 0, 0.36, 1, 0.66);
  pintar(0.78, 0.22); elipse(0, 0.5, 0.51, 0.3, 0.085);
  pintar(0.78, 0.3); rayas(0, 0.2, 0.8, [0.27, 0.21, 0.15]);

  // 1 · Franja más oscura arriba, «logo» claro y la ventana de la «foto», en
  //     degradé (la de antes era un hueco negro con borde duro).
  pintar(0.74, 0); rect(1, 0, 0.86, 1, 0.97);
  pintar(1, 0.34); elipse(1, 0.5, 0.71, 0.32, 0.07);
  pintar(0.76, 0.45); rayas(1, 0.32, 0.68, [0.695]);
  degrade(1, 0.14, 0.12, 0.86, 0.55, 1, 0.2, 0.45);
  pintar(0.86, 0.32); elipse(1, 0.42, 0.3, 0.2, 0.1);
  pintar(0.92, 0.2); elipse(1, 0.62, 0.36, 0.16, 0.09);

  // 2 · Sello redondo claro con su aro, y una banda con rayas arriba.
  pintar(1, 0.45); elipse(2, 0.5, 0.44, 0.34, 0.2);
  pintar(0.8, 0.3); elipse(2, 0.5, 0.44, 0.22, 0.13);
  pintar(1, 0.45); elipse(2, 0.5, 0.44, 0.15, 0.09);
  pintar(1, 0.4); rect(2, 0, 0.76, 1, 0.92);
  pintar(0.76, 0.45); rayas(2, 0.18, 0.82, [0.85, 0.8]);

  // 3 · Franja apenas más clara a la izquierda (+10 %: la de antes se leía
  //     como una capa transparente), «logo» en tono medio arriba y faja clara
  //     abajo.
  pintar(1, 0.12); rect(3, 0.06, 0.05, 0.3, 1);
  degrade(3, 0.38, 0.7, 0.92, 0.84, 0.7, 0.08, 0);
  pintar(1, 0.45); rect(3, 0, 0.1, 1, 0.26);
  pintar(0.76, 0.45); rayas(3, 0.36, 0.88, [0.19, 0.14]);

  // Lo liso de abajo, en todas las celdas: costados, tapa y base.
  pintar(1, 0);
  g.fillRect(0, y(0.05), W, 0.05 * H);
}

/** El suavizado de la etiqueta, en píxeles de la textura (radio de la caja, y
 *  cuántas pasadas: tres cajas de radio 3 son casi una gaussiana de σ ≈ 3,5). */
export const SUAVIZADO = { radio: 3, pasadas: 3 } as const;

/**
 * Suaviza la etiqueta pintada SIN mezclar un diseño con el de al lado: un
 * desenfoque de caja separable, a lo ancho dentro de cada celda (los bordes
 * de la celda se repiten) y a lo alto en toda la textura. Puro (RGBA, en el
 * lugar): lo corre `probar-muebles` y mide que no queden saltos duros.
 */
export function suavizarPorCelda(
  datos: Uint8ClampedArray, W: number, H: number, celdas: number,
  radio: number = SUAVIZADO.radio, pasadas: number = SUAVIZADO.pasadas,
): void {
  const celda = W / celdas;
  const tmp = new Float32Array(Math.max(W, H) * 4);
  for (let p = 0; p < pasadas; p++) {
    // A lo ancho, celda por celda.
    for (let fila = 0; fila < H; fila++) {
      for (let c = 0; c < celdas; c++) {
        const x0 = Math.round(c * celda), x1 = Math.round((c + 1) * celda) - 1;
        for (let x = x0; x <= x1; x++) {
          for (let k = 0; k < 4; k++) {
            let suma = 0;
            for (let d = -radio; d <= radio; d++) {
              const xx = Math.min(x1, Math.max(x0, x + d));
              suma += datos[(fila * W + xx) * 4 + k];
            }
            tmp[x * 4 + k] = suma / (2 * radio + 1);
          }
        }
      }
      for (let x = 0; x < W; x++) for (let k = 0; k < 4; k++) datos[(fila * W + x) * 4 + k] = tmp[x * 4 + k];
    }
    // A lo alto.
    for (let x = 0; x < W; x++) {
      for (let fila = 0; fila < H; fila++) {
        for (let k = 0; k < 4; k++) {
          let suma = 0;
          for (let d = -radio; d <= radio; d++) {
            const ff = Math.min(H - 1, Math.max(0, fila + d));
            suma += datos[(ff * W + x) * 4 + k];
          }
          tmp[fila * 4 + k] = suma / (2 * radio + 1);
        }
      }
      for (let fila = 0; fila < H; fila++) for (let k = 0; k < 4; k++) datos[(fila * W + x) * 4 + k] = tmp[fila * 4 + k];
    }
  }
}

let texturaDeEtiqueta: THREE.CanvasTexture | null = null;

/** La textura de las etiquetas, UNA para toda la tienda y toda la sesión (se
 *  arma la primera vez que hace falta; son 64 KB). */
export function texturaDeEtiquetaDeRelleno(): THREE.CanvasTexture {
  if (texturaDeEtiqueta) return texturaDeEtiqueta;
  const c = document.createElement("canvas");
  c.width = 512; c.height = 128;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  pintarEtiquetaDeRelleno(g, c.width, c.height);
  // Suavizada; y lo liso de abajo (costados, tapa, base) se repinta liso,
  // que el desenfoque lo manchaba con el diseño de arriba.
  const img = g.getImageData(0, 0, c.width, c.height);
  suavizarPorCelda(img.data, c.width, c.height, DISENOS);
  g.putImageData(img, 0, 0);
  g.fillStyle = "rgb(255,0,255)";
  g.fillRect(0, c.height * 0.95, c.width, c.height * 0.05);
  const t = new THREE.CanvasTexture(c);
  // Es un dato (sombra y blanco), no un color: sin conversión de sRGB.
  t.colorSpace = THREE.NoColorSpace;
  t.anisotropy = 4;
  texturaDeEtiqueta = t;
  return t;
}

/** El blanco de la etiqueta del relleno (lineal): un papel, no un foco. */
export const BLANCO_DE_ETIQUETA = 0.78;

/**
 * El parche del relleno de venta, que va DESPUÉS del de la luz de venta
 * (`conLuzDeVenta`): decodifica el diseño del rojo del color por instancia
 * (`colorConDiseno`), arma la coordenada de la etiqueta con la `uv` del envase
 * y, después del color de vértice, mezcla: el color del envase hacia el blanco
 * donde la etiqueta es blanca, y oscurecido donde hay «logo» o rayas.
 *
 * Si three cambia los nombres de los trozos, el relleno queda como antes, con
 * su color por instancia (lo vigila `probar-muebles`).
 */
export function parcheDeRellenoDeVenta(textura: THREE.Texture | null) {
  return (shader: { vertexShader?: string; fragmentShader: string; uniforms?: Record<string, unknown> }) => {
    const v = shader.vertexShader;
    if (!v || !v.includes("#include <color_vertex>") || !shader.fragmentShader.includes("#include <color_fragment>")) return;
    if (shader.uniforms) shader.uniforms.uEtiquetaRelleno = { value: textura };
    shader.vertexShader = v
      .replace("void main() {", `varying vec2 vEtiquetaRelleno;
void main() {`)
      .replace("#include <color_vertex>", `#include <color_vertex>
#ifdef USE_INSTANCING_COLOR
  {
    float disenoEt = floor( instanceColor.r * 0.5 );
    vColor.r *= ( instanceColor.r - 2.0 * disenoEt ) / max( instanceColor.r, 1e-4 );
    vEtiquetaRelleno = vec2( ( clamp( uv.x, 0.0, 1.0 ) + disenoEt ) / ${DISENOS.toFixed(1)}, uv.y );
  }
#else
  vEtiquetaRelleno = vec2( 0.5 / ${DISENOS.toFixed(1)}, 0.0 );
#endif`);
    shader.fragmentShader = shader.fragmentShader
      .replace("void main() {", `uniform sampler2D uEtiquetaRelleno;
varying vec2 vEtiquetaRelleno;
void main() {`)
      .replace("#include <color_fragment>", `#include <color_fragment>
{
  vec3 et = texture2D( uEtiquetaRelleno, vEtiquetaRelleno ).rgb;
  diffuseColor.rgb = mix( diffuseColor.rgb, vec3( ${BLANCO_DE_ETIQUETA.toFixed(3)} ), et.g ) * et.r;
}`);
  };
}

/** La clave de programa del relleno de venta: es otro shader que el de los
 *  muebles (`CLAVE_DE_VENTA`), así que su propio programa. Uno solo para todo
 *  el relleno de la tienda. */
export const CLAVE_DE_RELLENO = "relleno-de-venta";
