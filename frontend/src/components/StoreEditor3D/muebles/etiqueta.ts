/**
 * La etiqueta del producto que se prueba: la foto del proveedor sin fondo,
 * como textura, y el material con luz propia con que se dibuja el envase.
 *
 * ## Qué hay acá
 *
 * - `etiquetaDeArte`: baja la foto, le quita el fondo (`recorte.ts`) y deja
 *   lista la textura. Una vez por arte y por modo de fondo: el recorte cuesta
 *   ~100 ms y la reunión no puede trabarse cada vez que se prueba en otro
 *   mueble. Caché chico (16) que no suelta lo que está en prueba.
 * - `useEntornoDeProducto`: un mapa de entorno propio del PRODUCTO —un cuarto
 *   gris con tiras de luz, como el techo de una tienda—, armado una vez por
 *   lienzo. Se le asigna SÓLO al material del envase: la luz de la tienda ya
 *   está calibrada para los muebles y no se toca (ni `scene.environment`, ni
 *   el tone mapping global).
 * - `materialDeEtiqueta`: el material del envase. Con luz —no el
 *   `MeshBasicMaterial` sin sombra de la lámina vieja, que brillaba más que
 *   todo lo demás—, un poco de emisión para que la marca se lea por
 *   videollamada, y tono NEUTRO sólo en este material, porque el ACES de la
 *   escena corre el amarillo y el naranja de las marcas.
 * - La sombra de contacto: una mancha suave bajo cada envase, que es lo que
 *   lo APOYA en el entrepaño. Sin ella flota.
 *
 * ## Por qué no se hace en el servidor
 *
 * No hay Pillow ni nada que segmente, y meterlo es superficie de ataque. La
 * imagen viene del mismo origen (`/api/catalogo/{id}/imagen?token=`), así que
 * el canvas no queda contaminado y se pueden leer sus píxeles.
 */
import { useState } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { prepararFotoPorEtapas } from "./recorte";
import type { FotoPreparada, ModoDeFondo, PistaDeEnvase, Recorte } from "./recorte";
import type { PedidoAlWorker, RespuestaDelWorker } from "./recorte.worker";
import { RECETAS } from "./texturas";
import type { BotellaLlena, FranjaDeEtiqueta } from "./texturas";
import type { Imagen, TapaDeFoto } from "./texturas";
import { empaqueDeArte } from "./producto";
import type { FormaDeEnvase } from "./producto";
import { arteUrl } from "../../../api/catalogo";
import { HABLADOR, pintarHablador } from "./habladores";
import type { ContenidoDelHablador } from "./habladores";
import { BRILLO, conLuzDeVenta, K_ENTORNO_MUEBLE } from "./luzDeVenta";

// ─── La calibración ───────────────────────────────────────────────────────────
//
// Medida en /taller con la «Carta de color» (8 parches: rojo #D0103A, azul
// #1F4E9A, amarillo #FFD100, verde #00A651, naranja, blanco, lechoso y negro)
// bajo la luz del EDITOR, de frente y a la altura del ojo, con
// `scratchpad/realismo/medir-color.mjs`. Los valores y lo medido quedan al
// pie de este bloque.

/** Cuánto pesa el entorno propio del producto. */
export const K_ENTORNO = 0.9;
/** Emisión de la propia etiqueta. Baja a propósito: con mucha más, las
 *  unidades de atrás dejan de oscurecerse y el entrepaño se lee plano (la
 *  emisión va teñida por el color de la instancia, que es lo que las
 *  oscurece; ver `parchear`). */
export const K_EMISION = 0.26;
/** Tono neutro sólo en la etiqueta: con el ACES de la escena el amarillo y el
 *  naranja de las marcas se corren de tono. */
export const TONO_NEUTRO = true;
//
// Lo medido (punta de 0,9 m, carta en caja de 10 × 20 cm, toma «de cerca»,
// unidades del frente; los parches lechoso y negro quedan tapados por el
// labio del entrepaño y no entran en la cuenta):
//
//   K_ENTORNO 0,6 · K_EMISION 0,18 → blanco rgb(211,208,204), ΔE2000 medio
//     9,8 en los seis visibles: todo un 16 % más oscuro, con el tono bien
//     (corrimiento máximo 1,4°).
//   K_ENTORNO 0,9 · K_EMISION 0,26 → blanco rgb(237,234,230), ΔE2000 medio
//     3,3 (rojo 2,2 · azul 3,2 · amarillo 4,2 · verde 2,5 · naranja 3,2 ·
//     blanco 4,8), corrimiento de tono máximo 1,3°. Es lo que queda.
//
// El blanco en 235–245 y no en 255 a propósito: un blanco «quemado» es lo
// que hacía brillar la lámina vieja más que todo lo demás del local.

// ─── Las etiquetas ────────────────────────────────────────────────────────────

export interface Etiqueta {
  /** `catalogo:${id}:${modo}` o `local:${nombre}:${tamaño}:${modo}`. */
  clave: string;
  /** Las métricas del recorte: aspecto, relleno, simetría, perfil, color. */
  recorte: Omit<Recorte, "rgba">;
  /** El recorte con su alfa, listo para pintar. */
  lienzo: HTMLCanvasElement;
  /** Para el recorte plano y la bolsa: la silueta con transparencia, con el
   *  borde encogido 2 px (`erosionarYSangrar`): ahí venía el halo blanco. */
  texturaConAlfa(): THREE.CanvasTexture;
  /** Para el vaso, la lata y la botella opaca: el alfa aplanado sobre el
   *  color de adentro. Un envase sólido no lleva agujeros. */
  texturaOpaca(): THREE.CanvasTexture;
  /** Para la caja: el FRENTE, enderezado si la foto venía en tres cuartos
   *  (`rectificarCaja`). */
  texturaDeCaja(): THREE.CanvasTexture;
  /** Para la bolsa: la silueta con alfa y los costados llevados al color
   *  del plástico (`tenirCantos`). */
  texturaDeBolsa(): THREE.CanvasTexture;
  /** Para la botella transparente: el PET teñido con el color del líquido
   *  (`llenarBotella`), que en la foto dejaba ver el blanco del estudio. */
  texturaDeBotella(): THREE.CanvasTexture;
  /** La espalda de un envase torneado (`espaldaDeEtiqueta`): el color de
   *  los costados con la tabla nutricional sin texto. De la botella llena si
   *  es transparente. */
  texturaDeEspalda(transparente: boolean): THREE.CanvasTexture;
  /** El color del costado y la tapa de la caja (`colorDeCostado`). */
  colorDeCostado(): string;
  /** Vaso o lata: la franja de tapa de la foto y sus colores (`tapaDeFoto`). */
  tapa(): TapaDeFoto;
  /** La tapa del vaso, dibujada: el foil con su reborde (`dibujarTapa`). */
  texturaDeTapa(): THREE.CanvasTexture;
  /** Si la foto de la caja venía en tres cuartos y se enderezó el frente. */
  cajaEnderezada(): boolean;
  /** Dónde está la etiqueta en la foto (`franjaDeEtiqueta`): las filas y la
   *  silueta en ellas. Sale del `rgba` del recorte —pop.ts no lo tiene, y
   *  releer el lienzo devuelve NEGRO en lo transparente—, la primera vez que
   *  alguien la pide (el cabezote de la nevera). */
  franja(): FranjaDeEtiqueta;
}

/** «reintentando» es «cargando» después de un error: quien dibuja la trata
 *  como el error (sigue mostrando la lámina de siempre) para que la cara no
 *  parpadee vacía cada vez que se vuelve a pedir la foto. */
export type EstadoDeEtiqueta = "cargando" | "lista" | "error" | "reintentando";

interface Entrada {
  estado: "cargando" | "lista" | "error";
  /** Lo que se sabe del arte para elegir las variantes de su envase (y
   *  precalentar sus texturas). `undefined` si quien la pidió no lo dijo. */
  pista?: PistaDeEnvase | null;
  /** Cuándo falló, para reintentar solo después de `REINTENTO_MS`. */
  fallo?: number;
  etiqueta?: Etiqueta;
  esperando: Set<() => void>;
  texturas: THREE.Texture[];
  materiales: Map<string, THREE.Material | THREE.Material[]>;
}

/** Cuántas etiquetas se guardan. Cada una es una textura de hasta 1024 px en
 *  la GPU: en una reunión se prueban unos pocos productos, no cien. */
const MAXIMO = 16;
const cache = new Map<string, Entrada>();
/** De la etiqueta a su entrada: los materiales se cuelgan de ahí aunque quien
 *  los pida tenga la etiqueta y no la clave. */
const entradaDe = new WeakMap<Etiqueta, Entrada>();
/** Lo que está en prueba ahora: no se desaloja aunque sea lo más viejo. */
let enUso = new Set<string>();
/** Cuánto se espera antes de volver a pedir una foto que falló. Render
 *  despertando da 502 unos segundos, un token vencido da 401 hasta que se
 *  renueva: un error no puede quedar en el caché para siempre, que es lo que
 *  pasaba —la cara de la punta vacía hasta recargar la página—. */
const REINTENTO_MS = 15000;
/** Las claves cuya última carga falló, hasta que una cargue bien. */
const fallaron = new Set<string>();

/** Declara qué etiquetas se están mostrando (las de las pruebas vigentes). */
export function marcarEnUso(claves: Iterable<string>): void {
  enUso = new Set(claves);
}

function soltar(e: Entrada): void {
  for (const t of e.texturas) t.dispose();
  for (const m of e.materiales.values()) for (const x of Array.isArray(m) ? m : [m]) x.dispose();
  e.texturas.length = 0;
  e.materiales.clear();
}

function desalojar(): void {
  if (cache.size <= MAXIMO) return;
  // Map conserva el orden de inserción y cada uso re-inserta: lo primero es
  // lo menos usado.
  for (const [clave, e] of cache) {
    if (cache.size <= MAXIMO) break;
    if (enUso.has(clave) || e.estado === "cargando") continue;
    soltar(e);
    cache.delete(clave);
  }
}

/** Suelta todas las etiquetas. La llama el desmontaje del editor. */
export function olvidarEtiquetas(): void {
  for (const e of cache.values()) soltar(e);
  cache.clear();
  fallaron.clear();
  enUso = new Set();
}

/** Un lienzo con los píxeles de una imagen. */
function lienzoDe(img: Imagen): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = img.ancho; c.height = img.alto;
  c.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(img.rgba), img.ancho, img.alto), 0, 0);
  return c;
}

/**
 * La tapa de un vaso, dibujada a partir de los colores de la foto.
 *
 * No hay foto de la tapa —el proveedor manda el frente—, y un disco de un
 * color liso era lo más claro del cuadro y se leía como plástico de juguete.
 * Un foil de verdad tiene un degradé (tensado al centro), un brillo en
 * diagonal, una textura fina y el reborde del vaso alrededor: es lo que se
 * dibuja, SIN texto ni logos (nada que el proveedor no haya puesto).
 */
function dibujarTapa(t: TapaDeFoto): HTMLCanvasElement {
  const N = 256;
  const c = document.createElement("canvas");
  c.width = c.height = N;
  // `willReadFrequently`: el lienzo vive en la CPU. Sin eso Chrome lo arma en
  // la GPU y el `getImageData` del ruido de abajo la hace esperar entera: era
  // la tarea más larga de elegir un producto (792 ms de 987 en swiftshader,
  // medido con un perfil de CPU; ver «2026-10-10» en ESTADO.md).
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.fillStyle = t.tapa;
  g.fillRect(0, 0, N, N);
  const radial = g.createRadialGradient(N * 0.44, N * 0.4, N * 0.04, N / 2, N / 2, N * 0.5);
  radial.addColorStop(0, "rgba(255,255,255,0.12)");
  radial.addColorStop(0.65, "rgba(0,0,0,0)");
  radial.addColorStop(1, "rgba(0,0,0,0.22)");
  g.fillStyle = radial;
  g.fillRect(0, 0, N, N);
  const brillo = g.createLinearGradient(0, N, N, 0);
  brillo.addColorStop(0.3, "rgba(255,255,255,0)");
  brillo.addColorStop(0.48, "rgba(255,255,255,0.10)");
  brillo.addColorStop(0.62, "rgba(255,255,255,0)");
  g.fillStyle = brillo;
  g.fillRect(0, 0, N, N);
  // La textura del foil: un ruido fino y determinista (sin Math.random).
  const d = g.getImageData(0, 0, N, N);
  let a = 0x9e3779b9;
  for (let i = 0; i < d.data.length; i += 4) {
    a = (Math.imul(a ^ (a >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) | 0;
    const k = 1 + (((a >>> 8) & 0xff) / 255 - 0.5) * 0.08;
    d.data[i] *= k; d.data[i + 1] *= k; d.data[i + 2] *= k;
  }
  g.putImageData(d, 0, 0);
  // El sellado (un anillo hundido) y el reborde del vaso.
  g.strokeStyle = "rgba(0,0,0,0.14)";
  g.lineWidth = 2;
  g.beginPath(); g.arc(N / 2, N / 2, N * 0.4, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = t.borde;
  g.lineWidth = N * 0.075;
  g.beginPath(); g.arc(N / 2, N / 2, N / 2 - N * 0.0375, 0, Math.PI * 2); g.stroke();
  return c;
}

function textura(lienzo: HTMLCanvasElement, e: Entrada): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(lienzo);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  e.texturas.push(t);
  return t;
}

// ─── El recorte, fuera del hilo principal ─────────────────────────────────────

/** El worker del recorte (`recorte.worker.ts`): `undefined` mientras nadie lo
 *  pidió, `null` si este navegador no puede (sin Worker u OffscreenCanvas, o
 *  el módulo no arrancó). Se crea en el PRIMER USO y no al importar: las
 *  pruebas importan este archivo en node, donde un `new Worker` al cargar las
 *  rompía. */
let worker: Worker | null | undefined;
let siguientePedido = 1;
const pedidosAlWorker = new Map<number, (f: FotoPreparada | null) => void>();

function elWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    if (typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined") return (worker = null);
    const w = new Worker(new URL("./recorte.worker.ts", import.meta.url), { type: "module" });
    w.onmessage = (e: MessageEvent<RespuestaDelWorker>) => {
      const responder = pedidosAlWorker.get(e.data.id);
      pedidosAlWorker.delete(e.data.id);
      // Un error del worker (una foto que no decodifica ahí, un Safari sin
      // contexto 2D en OffscreenCanvas) no es un error de la foto: cae al
      // camino troceado, que decide.
      responder?.(e.data.ok ? e.data.foto : null);
    };
    w.onerror = () => {
      // El módulo no arrancó: lo pendiente y lo que venga va por el camino
      // troceado.
      worker = null;
      for (const responder of pedidosAlWorker.values()) responder(null);
      pedidosAlWorker.clear();
      w.terminate();
    };
    return (worker = w);
  } catch {
    return (worker = null);
  }
}

/** Recorte y variantes en el worker, o `null` si no hay worker o falló. */
function prepararEnElWorker(
  blob: Blob, modo: ModoDeFondo, lado: number, pista: PistaDeEnvase | null,
): Promise<FotoPreparada | null> {
  const w = elWorker();
  if (!w) return Promise.resolve(null);
  const id = siguientePedido++;
  return new Promise((ok) => {
    pedidosAlWorker.set(id, ok);
    const pedido: PedidoAlWorker = { id, blob, modo, lado, pista };
    w.postMessage(pedido);
  });
}

/** Cede el hilo principal entre etapas del camino troceado: `scheduler.yield`
 *  donde existe y, si no (Safari, Firefox), un `setTimeout` de 0. */
export function ceder(): Promise<void> {
  const s = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  return s?.yield ? s.yield() : new Promise((ok) => setTimeout(ok, 0));
}

/**
 * Recorta una foto (Blob) reducida a ≤ `lado` px: en el worker si se puede;
 * si no, en el hilo principal partido en etapas (`prepararFotoPorEtapas`).
 * Lo usan la etiqueta (1024 px, con las variantes de su envase) y la vista
 * previa del alta (`EditorDeFicha`, 512 px, sólo el recorte).
 */
export async function prepararFotoDe(
  blob: Blob, modo: ModoDeFondo, pista: PistaDeEnvase | null, lado = 1024,
): Promise<FotoPreparada> {
  const enElWorker = await prepararEnElWorker(blob, modo, lado, pista);
  if (enElWorker) return enElWorker;
  const bmp = await createImageBitmap(blob);
  const k = Math.min(1, lado / Math.max(bmp.width, bmp.height));
  const w = Math.max(2, Math.round(bmp.width * k)), h = Math.max(2, Math.round(bmp.height * k));
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const datos = g.getImageData(0, 0, w, h).data;
  await ceder();
  return prepararFotoPorEtapas(datos, w, h, modo, pista, ceder);
}

async function cargar(fuente: string | Blob, modo: ModoDeFondo, pista: PistaDeEnvase | null): Promise<FotoPreparada> {
  // Con `res.ok`: un 502 o un 401 traen un HTML o un JSON, y
  // `createImageBitmap` fallaba sobre eso con un error que no decía nada. El
  // `fetch` se queda en el hilo principal (es asíncrono); al worker va el Blob.
  let blob: Blob;
  if (typeof fuente === "string") {
    const res = await fetch(fuente);
    if (!res.ok) throw new Error(`la foto respondió ${res.status}`);
    blob = await res.blob();
  } else blob = fuente;
  return prepararFotoDe(blob, modo, pista);
}

/**
 * La etiqueta de un arte, o `null` mientras se prepara.
 *
 * Es el patrón de las texturas de foto del editor (`getPhotoFaceMaterial`):
 * se pide en el render, devuelve `null` la primera vez y llama a `avisar`
 * cuando está lista, para que quien la pidió vuelva a armar sus materiales.
 * La clave no lleva `|`.
 */
export function etiquetaDeArte(
  clave: string, fuente: string | Blob, modo: ModoDeFondo, avisar: () => void,
  pista?: PistaDeEnvase | null,
): Etiqueta | null {
  const ya = cache.get(clave);
  if (ya && ya.estado === "error" && Date.now() - (ya.fallo ?? 0) >= REINTENTO_MS) {
    // Pasó el rato: se vuelve a pedir, y quien esperaba se entera.
    cache.delete(clave);
    const esperaban = [...ya.esperando];
    const nueva = etiquetaDeArte(clave, fuente, modo, avisar, pista ?? ya.pista);
    const entrada = cache.get(clave);
    if (entrada) esperaban.forEach((f) => entrada.esperando.add(f));
    return nueva;
  }
  if (ya) {
    if (ya.estado === "lista") {
      // Uso reciente: al final del orden de desalojo.
      cache.delete(clave);
      cache.set(clave, ya);
      return ya.etiqueta!;
    }
    // Cargando o con error: quien la pidió se entera cuando termine, o cuando
    // alguien aprieta «Reintentar» (`reintentarEtiqueta`).
    ya.esperando.add(avisar);
    return null;
  }
  const e: Entrada = { estado: "cargando", pista, esperando: new Set([avisar]), texturas: [], materiales: new Map() };
  cache.set(clave, e);
  cargar(fuente, modo, pista ?? null)
    .then(({ recorte, variantes: ya_ }) => {
      // Las variantes que pide el envase llegan hechas del worker (`ya_`). Las
      // demás —o todas, si la pidió alguien que no sabía el arte— se arman la
      // primera vez que alguien las pide, con las MISMAS recetas (`RECETAS`):
      // una caja no necesita la botella llena, ni un vaso el frente enderezado.
      //
      // Todas salen del `rgba` del recorte y NO releyendo el lienzo: el
      // canvas 2D guarda el color premultiplicado por el alfa, así que lo
      // transparente vuelve NEGRO al leerlo. Ahí están el sangrado y el color
      // de la marca: sin esto, la tapa de la caja y la base de la botella
      // salían negras.
      let borde: Imagen | null = ya_.borde ?? null;
      const conBorde = () => (borde ??= RECETAS.borde(recorte));
      let caja: Imagen | null = ya_.caja ?? null;
      let enderezada = ya_.enderezada ?? false;
      const frente = () => {
        if (!caja) ({ caja, enderezada } = RECETAS.caja(conBorde()));
        return caja;
      };
      let costado: string | null = ya_.costado ?? null;
      let deLaTapa: TapaDeFoto | null = ya_.tapa ?? null;
      const tapa = () => (deLaTapa ??= RECETAS.tapa(conBorde()));
      // La botella llena, con su alfa: de ella salen el frente y la espalda.
      let llena: BotellaLlena | null = ya_.llena ?? null;
      const conLiquido = () => (llena ??= RECETAS.llena(recorte));
      let franja: FranjaDeEtiqueta | null = ya_.franja ?? null;
      let lienzo: HTMLCanvasElement | null = null;
      const texturas: Record<string, THREE.CanvasTexture> = {};
      const una = (k: string, hacer: () => Imagen) => (texturas[k] ??= textura(lienzoDe(hacer()), e));
      const { rgba: _rgba, ...metricas } = recorte;
      void _rgba;
      e.etiqueta = {
        clave,
        recorte: metricas,
        // Perezoso: sólo lo usan el copete y /taller, y armarlo es copiar el
        // recorte entero a un lienzo.
        get lienzo() { return (lienzo ??= lienzoDe(recorte)); },
        texturaConAlfa: () => una("alfa", conBorde),
        texturaOpaca: () => una("opaca", () => ya_.opaca ?? RECETAS.opaca(conBorde())),
        texturaDeBolsa: () => una("bolsa", () => ya_.bolsa ?? RECETAS.bolsa(conBorde(), recorte.colorDominante)),
        texturaDeCaja: () => una("caja", frente),
        texturaDeBotella: () => una("botella", () => ya_.botella ?? RECETAS.botella(conLiquido())),
        texturaDeEspalda: (transparente: boolean) => (transparente
          ? una("espalda-llena", () => ya_.espaldaLlena ?? RECETAS.espaldaLlena(conLiquido()))
          : una("espalda", () => ya_.espalda ?? RECETAS.espalda(conBorde()))),
        colorDeCostado: () => (costado ??= RECETAS.costado(frente())),
        tapa,
        texturaDeTapa: () => (texturas.tapa ??= textura(dibujarTapa(tapa()), e)),
        cajaEnderezada: () => { frente(); return enderezada; },
        franja: () => (franja ??= RECETAS.franja(recorte)),
      };
      entradaDe.set(e.etiqueta, e);
      e.estado = "lista";
      fallaron.delete(clave);
      precalentar(e);
    })
    .catch(() => {
      e.estado = "error";
      e.fallo = Date.now();
      fallaron.add(clave);
      // Se vuelve a pedir sola: a los que la esperan se les avisa cuando pasó
      // el rato, la vuelven a pedir y `etiquetaDeArte` la recarga.
      setTimeout(() => {
        if (cache.get(clave) !== e || e.estado !== "error") return;
        const quienes = [...e.esperando];
        e.esperando.clear();
        quienes.forEach((f) => f());
      }, REINTENTO_MS);
    })
    .finally(() => {
      const quienes = [...e.esperando];
      e.esperando.clear();
      desalojar();
      quienes.forEach((f) => f());
    });
  return null;
}

/** En qué está la etiqueta de una clave: `null` si nadie la pidió todavía.
 *  `etiquetaDeArte` devuelve `null` igual mientras carga y cuando falló; quien
 *  dibuja necesita la diferencia: con un error, la cara cae a la lámina de
 *  siempre (`resolveFaceMaterial`) en vez de quedar vacía a mitad de una
 *  reunión, y el panel ofrece «Reintentar» en vez de «Preparando…» eterno. */
export function estadoDeEtiqueta(clave: string): EstadoDeEtiqueta | null {
  const e = cache.get(clave);
  if (!e) return null;
  return e.estado === "cargando" && fallaron.has(clave) ? "reintentando" : e.estado;
}

/** Vuelve a pedir una etiqueta que falló, ya: avisa a todos los que la
 *  esperaban para que la pidan de nuevo. */
export function reintentarEtiqueta(clave: string): void {
  const e = cache.get(clave);
  if (!e || e.estado !== "error") return;
  cache.delete(clave);
  const quienes = [...e.esperando];
  e.esperando.clear();
  quienes.forEach((f) => f());
}

/** La clave de un arte del catálogo con su modo de fondo. */
export const claveDeArte = (arteId: number | string, modo: ModoDeFondo) => `catalogo:${arteId}:${modo}`;

/**
 * La etiqueta para un panel FUERA del lienzo (el resumen «Entran 10 por
 * entrepaño»): se vuelve a dibujar cuando termina de cargar.
 */
export function useEtiqueta(
  arteId: number | null | undefined, modo: ModoDeFondo, pista?: PistaDeEnvase | null,
): Etiqueta | null {
  const [, setVersion] = useState(0);
  const [avisar] = useState(() => () => setVersion((v) => v + 1));
  if (arteId == null) return null;
  return etiquetaDeArte(claveDeArte(arteId, modo), arteUrl(arteId), modo, avisar, pista);
}

// ─── El precalentado ─────────────────────────────────────────────────────────
//
// Elegir un arte trababa el hilo principal: además del recorte (ahora en el
// worker), en el cuadro del clic se armaban las texturas del envase, se
// subían a la GPU y se compilaba el programa de la etiqueta. Con el lienzo
// registrado (`registrarRenderer`, desde `onCreated`), eso se adelanta en los
// ratos libres: cuando una etiqueta queda lista se arman sus materiales y se
// suben sus texturas (`initTexture`), y una vez por sesión se compilan los
// programas del envase con una malla fuera de cuadro (`compileAsync`). Con el
// selector abierto y el proveedor de la reunión fijado, además se piden de
// antemano las etiquetas de sus artes (`precalentarEtiquetas`).

let lienzoGl: { gl: THREE.WebGLRenderer; escena: THREE.Scene; camara: THREE.Camera } | null = null;

/** El lienzo del editor, para precalentar en él. Lo llama `onCreated`. */
export function registrarRenderer(gl: THREE.WebGLRenderer, escena: THREE.Scene, camara: THREE.Camera): void {
  lienzoGl = { gl, escena, camara };
  enReposo(() => { if (lienzoGl) compilarProgramas(lienzoGl); });
}

/** Corre `f` en un rato libre: `requestIdleCallback` donde existe y, si no
 *  (Safari no lo tiene), un `setTimeout` de reserva. */
export function enReposo(f: () => void): void {
  const ric = (globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
  if (ric) ric(f, { timeout: 1500 });
  else setTimeout(f, 50);
}

/** El entorno del producto de un lienzo (el de `useEntornoDeProducto`). */
function entornoDe(gl: THREE.WebGLRenderer): THREE.Texture {
  let t = entornos.get(gl);
  if (!t) {
    const pmrem = new THREE.PMREMGenerator(gl);
    const fuente = new EntornoDeTienda();
    t = pmrem.fromScene(fuente, 0.04, 0.1, 100, { size: 64 }).texture;
    fuente.soltar();
    pmrem.dispose();
    entornos.set(gl, t);
  }
  return t;
}

/** Los materiales del envase de una etiqueta lista, con sus texturas ya en la
 *  GPU, en un rato libre. Sin pista (no se sabe el arte) no se adivina. */
function precalentar(e: Entrada): void {
  if (!lienzoGl || !e.pista || !e.etiqueta) return;
  const et = e.etiqueta, pista = e.pista;
  enReposo(() => {
    const l = lienzoGl;
    if (!l || cache.get(et.clave) !== e || e.estado !== "lista") return;
    const emp = empaqueDeArte(pista.arte, pista.ficha, et.recorte);
    const materiales = materialDeEtiqueta(et, emp.envase, entornoDe(l.gl), { transparente: emp.transparente });
    for (const m of materiales) for (const t of [m.map, m.emissiveMap]) if (t) l.gl.initTexture(t);
    compilarProgramas(l, materiales);
  });
}

/** Los programas ya compilados (por la clave de three), para no pedir dos
 *  veces lo mismo. */
const compilados = new Set<string>();
let deSesion = false;

/**
 * Compila los programas de la etiqueta sin dibujar: una `InstancedMesh` con
 * color por instancia (como `ProductoDePrueba`) fuera de cuadro, compilada
 * contra las luces de la escena (`compileAsync(…, escena)`), que usa
 * `KHR_parallel_shader_compile` donde está. Sin materiales, una vez por
 * sesión: los del envase con una textura de 1 × 1 (el programa no depende de
 * la imagen) — la foto, el costado de la caja, la tapa y la bolsa —.
 */
function compilarProgramas(
  l: NonNullable<typeof lienzoGl>, materiales?: THREE.Material[],
): void {
  let lista = materiales;
  if (!lista) {
    if (deSesion) return;
    deSesion = true;
    const px = new THREE.DataTexture(new Uint8Array([200, 200, 200, 255]), 1, 1);
    px.needsUpdate = true;
    const entorno = entornoDe(l.gl);
    const blanco = new THREE.Color(1, 1, 1);
    lista = [
      materialConLuz("revolucion", entorno, { map: px, emissive: blanco, emissiveMap: px }),
      materialConLuz("caja", entorno, { color: blanco, emissive: blanco, vertexColors: true }),
      materialConLuz("revolucion", entorno, { map: px, color: blanco, metalness: 0.3, roughness: 0.45 }),
      materialConLuz("almohada", entorno, {
        map: px, emissive: blanco, emissiveMap: px, alphaTest: 0.5, alphaToCoverage: true,
        side: THREE.DoubleSide, vertexColors: true,
      }),
    ];
  }
  const nuevos = lista.filter((m) => !compilados.has(m.uuid));
  if (nuevos.length === 0) return;
  const geo = new THREE.BoxGeometry(0.01, 0.01, 0.01);
  geo.setAttribute("color", new THREE.Float32BufferAttribute(new Array(geo.attributes.position.count * 3).fill(1), 3));
  const escena = new THREE.Scene();
  for (const m of nuevos) {
    const malla = new THREE.InstancedMesh(geo, m, 1);
    malla.setColorAt(0, new THREE.Color(1, 1, 1));
    malla.position.set(0, -1000, 0);
    malla.frustumCulled = false;
    escena.add(malla);
    compilados.add(m.uuid);
  }
  l.gl.compileAsync(escena, l.camara, l.escena)
    .catch(() => { /* sin compilar: se compila al dibujar, como antes */ })
    .finally(() => {
      for (const o of escena.children) (o as THREE.InstancedMesh).dispose();
      geo.dispose();
    });
}

/** Cuántas etiquetas se piden de antemano al abrir el selector: las de los
 *  artes del proveedor de la reunión, nunca más que esto ni pasando el
 *  `MAXIMO` del caché, y sin desalojar lo que está en uso. */
export const PRECALENTAR_HASTA = 6;
let colaDePrecalentado: { clave: string; fuente: string; modo: ModoDeFondo; pista: PistaDeEnvase }[] = [];
let precalentando = false;

/**
 * Pide de antemano las etiquetas de estos artes, en cola y de a una (el
 * worker hace una por vez de todos modos). Lo que ya está en el caché se
 * salta; si el caché está lleno de lo que se está usando, no se pide más.
 */
export function precalentarEtiquetas(
  artes: readonly { id: number; nombre: string; categoria?: string | null; ficha?: (PistaDeEnvase["ficha"] & { fondo_foto?: ModoDeFondo }) | null }[],
): void {
  const nuevos = artes.slice(0, PRECALENTAR_HASTA).map((a) => {
    const modo: ModoDeFondo = a.ficha?.fondo_foto ?? "auto";
    return { clave: claveDeArte(a.id, modo), fuente: arteUrl(a.id), modo, pista: { arte: a, ficha: a.ficha ?? null } };
  }).filter((x) => !cache.has(x.clave) && !colaDePrecalentado.some((y) => y.clave === x.clave));
  colaDePrecalentado.push(...nuevos);
  if (!precalentando) siguienteDeLaCola();
}

function siguienteDeLaCola(): void {
  const x = colaDePrecalentado.shift();
  if (!x) { precalentando = false; return; }
  // Sin lugar libre en el caché (lo que hay está en uso), no se desaloja nada.
  const libres = MAXIMO - [...cache.keys()].filter((k) => enUso.has(k)).length;
  if (libres <= 0 || cache.size >= MAXIMO) { colaDePrecalentado = []; precalentando = false; return; }
  precalentando = true;
  if (cache.has(x.clave)) { siguienteDeLaCola(); return; }
  etiquetaDeArte(x.clave, x.fuente, x.modo, () => {}, x.pista);
  const e = cache.get(x.clave);
  const seguir = () => enReposo(siguienteDeLaCola);
  if (!e || e.estado !== "cargando") seguir();
  else e.esperando.add(seguir);
}

// ─── El entorno del producto ─────────────────────────────────────────────────

/** La luz de una tienda sin HDR: un cuarto gris cálido con cuatro tiras de
 *  luz en el techo. Es lo que el envase refleja: los brillos de una botella
 *  se leen como tubos fluorescentes y no como un cielo. */
class EntornoDeTienda extends THREE.Scene {
  constructor() {
    super();
    const caja = new THREE.BoxGeometry(1, 1, 1);
    const cuarto = new THREE.Mesh(caja, new THREE.MeshBasicMaterial({
      color: new THREE.Color(0.55, 0.54, 0.52), side: THREE.BackSide,
    }));
    cuarto.scale.set(24, 4.2, 24);
    cuarto.position.y = 0.9;
    this.add(cuarto);
    const piso = new THREE.Mesh(new THREE.PlaneGeometry(24, 24), new THREE.MeshBasicMaterial({
      color: new THREE.Color(0.32, 0.31, 0.3),
    }));
    piso.rotation.x = -Math.PI / 2;
    piso.position.y = -1.19;
    this.add(piso);
    const luz = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.97, 0.92).multiplyScalar(6) });
    for (const x of [-4.5, -1.5, 1.5, 4.5]) {
      const tira = new THREE.Mesh(caja, luz);
      tira.scale.set(0.18, 0.04, 18);
      tira.position.set(x, 2.95, 0);
      this.add(tira);
    }
  }
  soltar() {
    this.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); }
    });
  }
}

const entornos = new WeakMap<THREE.WebGLRenderer, THREE.Texture>();

/** El mapa de entorno del producto, UNO por lienzo. PMREM de 64 px: en
 *  swiftshader uno de 256 cuesta cuatro veces más y en un envase de 9 cm no
 *  se nota la diferencia. */
export function useEntornoDeProducto(): THREE.Texture {
  const { gl } = useThree();
  return entornoDe(gl);
}

// ─── El material ──────────────────────────────────────────────────────────────

let avisoDeShader = false;

/** El parche del shader: tono neutro (sólo acá) y la emisión teñida por el
 *  color de la instancia, para que lo de atrás se oscurezca entero y no sólo
 *  la parte iluminada. Depende de nombres internos de three
 *  (`#include <tonemapping_fragment>`, `#include <emissivemap_fragment>`,
 *  `NeutralToneMapping`): `probar-muebles` vigila que sigan existiendo, y si
 *  un día no aparecen se avisa una vez y el shader queda como está. */
function parchear(shader: { fragmentShader: string }): void {
  const tono = "#include <tonemapping_fragment>";
  const emision = "#include <emissivemap_fragment>";
  if (!shader.fragmentShader.includes(tono) || !shader.fragmentShader.includes(emision)) {
    if (!avisoDeShader) {
      avisoDeShader = true;
      console.warn("etiqueta: three cambió sus shaders; el producto se dibuja con el tono de la escena");
    }
    return;
  }
  shader.fragmentShader = shader.fragmentShader.replace(
    emision,
    // En el fragmento three define USE_COLOR —no USE_INSTANCING_COLOR— cuando
    // la malla lleva color por instancia (WebGLProgram).
    `${emision}\n#if defined( USE_COLOR )\n\ttotalEmissiveRadiance *= vColor.rgb;\n#endif`,
  );
  if (TONO_NEUTRO) {
    shader.fragmentShader = shader.fragmentShader.replace(
      tono,
      "#if defined( TONE_MAPPING )\n\tgl_FragColor.rgb = NeutralToneMapping( gl_FragColor.rgb );\n#endif",
    );
  }
}

/** Lo común a los materiales del envase: luz propia (entorno del producto),
 *  un poco de emisión y el parche del tono neutro. */
function materialConLuz(
  envase: FormaDeEnvase, entorno: THREE.Texture | null, extra: THREE.MeshStandardMaterialParameters,
): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({
    metalness: 0,
    roughness: envase === "revolucion" ? 0.35 : envase === "almohada" ? 0.45 : 0.6,
    envMap: entorno,
    envMapIntensity: K_ENTORNO,
    emissiveIntensity: K_EMISION,
    ...extra,
  });
  m.onBeforeCompile = parchear;
  m.customProgramCacheKey = () => (TONO_NEUTRO ? "etiqueta-neutro" : "etiqueta");
  return m;
}

/** Un material impreso con la luz del producto (el copete de la punta, en
 *  `pop.ts`): lo mismo que la etiqueta, para que la marca de arriba y la del
 *  envase se vean del mismo color. `retroiluminado` (el cabezote de la
 *  nevera, que es un aviso luminoso): el doble de emisión, sólo en esa chapa. */
export function materialImpreso(
  map: THREE.Texture, entorno: THREE.Texture | null, retroiluminado = false,
): THREE.MeshStandardMaterial {
  return materialConLuz("caja", entorno, {
    map, emissive: new THREE.Color(1, 1, 1), emissiveMap: map,
    ...(retroiluminado ? { emissiveIntensity: 2 * K_EMISION } : {}),
  });
}

/**
 * Los materiales del envase, por etiqueta y forma. Es una LISTA, y en los
 * envases torneados con ÍNDICES FIJOS: 0 la foto, 1 la tapa y 2 la espalda.
 *
 * - **caja**: [frente, costado]. El frente enderezado (`texturaDeCaja`); el
 *   costado es UN color con un degradé hacia atrás (colores de vértice): con
 *   la última columna de la foto estirada salían rayas, como una textura rota.
 * - **revolución**: [foto, tapa, espalda]. La foto es la textura opaca o la
 *   botella llena si es transparente; la tapa, el foil dibujado del vaso y la
 *   lata (`dibujarTapa`), y en la botella —que no tiene tapa aparte— la misma
 *   foto; la espalda, la de `espaldaDeEtiqueta`. Antes el orden cambiaba por
 *   envase (el vaso [foto, tapa], la botella [foto]) y un grupo con el índice 2
 *   habría apuntado a nada sin que tsc lo viera.
 * - **almohada**: la silueta CON alfa, que corta la bolsa por la forma de la
 *   foto —el sello ondulado de arriba, las esquinas redondeadas—: en
 *   rectángulo, las esquinas vacías de la foto eran parches de color.
 * - **recorte**: la silueta con alfa, en la pasada opaca (`alphaTest` +
 *   `alphaToCoverage`, que pide el `antialias` que el lienzo del editor ya
 *   tiene): sin ordenar instancias y sin halos.
 *
 * Quien dibuja elige POR GEOMETRÍA: la lista si la geometría tiene grupos, y
 * si no el primero (una `InstancedMesh` con lista y sin grupos no dibuja).
 */
export function materialDeEtiqueta(
  et: Etiqueta, envase: FormaDeEnvase, entorno: THREE.Texture | null,
  opciones: { transparente?: boolean } = {},
): THREE.MeshStandardMaterial[] {
  const e = entradaDe.get(et);
  const transparente = envase === "revolucion" && !!opciones.transparente;
  const clave = `${envase}:${transparente ? "llena" : "-"}`;
  const ya = e?.materiales.get(clave) as THREE.MeshStandardMaterial[] | undefined;
  if (ya) {
    for (const m of ya) if (m.envMap !== entorno) { m.envMap = entorno; m.needsUpdate = true; }
    return ya;
  }
  const conAlfa = envase === "recorte" || envase === "almohada";
  const map = envase === "almohada" ? et.texturaDeBolsa() : conAlfa ? et.texturaConAlfa()
    : envase === "caja" ? et.texturaDeCaja()
      : transparente ? et.texturaDeBotella() : et.texturaOpaca();
  const foto = materialConLuz(envase, entorno, {
    map,
    emissive: new THREE.Color(1, 1, 1),
    emissiveMap: map,
    ...(conAlfa ? { alphaTest: 0.5, alphaToCoverage: true, side: THREE.DoubleSide } : {}),
    // La bolsa: el sello un 8 % más claro, por color de vértice (`almohada`).
    ...(envase === "almohada" ? { vertexColors: true } : {}),
  });
  const lista = [foto];
  if (envase === "caja") {
    const color = new THREE.Color(et.colorDeCostado());
    lista.push(materialConLuz(envase, entorno, { color, emissive: color, vertexColors: true }));
  }
  if (envase === "revolucion") {
    // 1 · La tapa del vaso o la lata: el foil dibujado, SIN emisión —el disco
    // era lo más claro del cuadro— y con algo de brillo metálico. Un poco más
    // oscuro que la foto: mira al techo pero en tienda la tapa queda bajo el
    // entrepaño de arriba. La botella repite la foto (su torno no tiene tapa
    // aparte: el índice 1 no se usa, pero existe).
    lista.push(transparente ? foto : materialConLuz(envase, entorno, {
      map: et.texturaDeTapa(), color: new THREE.Color(0.8, 0.8, 0.8),
      metalness: 0.3, roughness: 0.45,
    }));
    // 2 · La espalda, con la misma luz que la foto.
    const espalda = et.texturaDeEspalda(transparente);
    lista.push(materialConLuz(envase, entorno, {
      map: espalda, emissive: new THREE.Color(1, 1, 1), emissiveMap: espalda,
    }));
  }
  e?.materiales.set(clave, lista);
  return lista;
}

// ─── El hablador del producto en prueba ──────────────────────────────────────

/**
 * El material del hablador de un arte (`pintarHablador`): la textura es UNA
 * por arte y por lo que dice, y vive en la entrada de su etiqueta —se suelta
 * con ella, como sus otras texturas—. Papel mate con la luz de los muebles de
 * venta (los habladores sólo se dibujan ahí): en la tira es un papel más, no
 * una calcomanía con luz propia.
 */
export function materialDeHablador(et: Etiqueta, c: ContenidoDelHablador): THREE.MeshStandardMaterial {
  const e = entradaDe.get(et);
  const clave = `hablador:${c.nombre}|${c.precio ?? "-"}`;
  const ya = e?.materiales.get(clave) as THREE.MeshStandardMaterial | undefined;
  if (ya) return ya;
  const lienzo = document.createElement("canvas");
  lienzo.width = HABLADOR.lienzo.ancho;
  lienzo.height = HABLADOR.lienzo.alto;
  pintarHablador(lienzo.getContext("2d")!, c, lienzo.width, lienzo.height);
  const t = new THREE.CanvasTexture(lienzo);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (e) e.texturas.push(t);
  const m = new THREE.MeshStandardMaterial({
    map: t, metalness: 0, roughness: 0.85,
    ...conLuzDeVenta(true, K_ENTORNO_MUEBLE, BRILLO.precios),
  });
  e?.materiales.set(clave, m);
  return m;
}

let geometriaDelHablador: THREE.BufferGeometry | null = null;
/** El plano del hablador, mirando al pasillo (−Z). Uno para todos. */
export function planoDeHablador(): THREE.BufferGeometry {
  return (geometriaDelHablador ??= new THREE.PlaneGeometry(HABLADOR.ancho, HABLADOR.alto).rotateY(Math.PI));
}

// ─── La sombra de contacto ───────────────────────────────────────────────────

let sombra: { textura: THREE.CanvasTexture; material: THREE.MeshBasicMaterial; geometria: THREE.BufferGeometry } | null = null;

/** Una mancha radial bajo cada envase. Se dibuja con su material propio, sin
 *  escribir profundidad y un poco adelante del entrepaño (polygonOffset), para
 *  que no titile contra la bandeja. Las sombras de verdad no sirven acá: el
 *  mapa de 1024 px que cubre toda la tienda no resuelve un envase de 9 cm. */
export function sombraDeContacto() {
  if (sombra) return sombra;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  gr.addColorStop(0, "rgba(0,0,0,0.85)");
  gr.addColorStop(0.55, "rgba(0,0,0,0.35)");
  gr.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  const textura = new THREE.CanvasTexture(c);
  const material = new THREE.MeshBasicMaterial({
    color: 0x000000, map: textura, transparent: true, opacity: 0.45, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  });
  const geometria = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  return (sombra = { textura, material, geometria });
}

let tira: { textura: THREE.CanvasTexture; material: THREE.MeshBasicMaterial; geometria: THREE.BufferGeometry } | null = null;

/**
 * La sombra de la FILA: una tira oscura sobre el entrepaño, a lo largo de las
 * unidades del frente, que se desvanece hacia el pasillo en 2 cm.
 *
 * La mancha de cada envase sola no alcanzaba: la crítica midió la base de los
 * vasos con el mismo gris que el resto de la bandeja, y el producto se leía
 * apoyado en el aire. En tienda lo que apoya una fila es la oclusión: la luz
 * de arriba no llega al pie de una fila apretada. 5 cm de fondo: 2 por
 * delante del frente (el degradé) y 3 por debajo de las unidades (que las
 * tapan). La geometría es un plano de 1 × 1 acostado; quien la usa la escala.
 */
export function tiraDeContacto() {
  if (tira) return tira;
  const c = document.createElement("canvas");
  c.width = 4; c.height = 64;
  const g = c.getContext("2d")!;
  // Arriba de la textura es el lado del pasillo (−Z, ver abajo).
  const gr = g.createLinearGradient(0, 0, 0, 64);
  gr.addColorStop(0, "rgba(0,0,0,0)");
  gr.addColorStop(0.4, "rgba(0,0,0,1)");
  gr.addColorStop(1, "rgba(0,0,0,0.5)");
  g.fillStyle = gr;
  g.fillRect(0, 0, 4, 64);
  const textura = new THREE.CanvasTexture(c);
  const material = new THREE.MeshBasicMaterial({
    color: 0x000000, map: textura, transparent: true, opacity: 0.36, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  });
  // Acostado, el +Y del plano (arriba de la textura) queda hacia −Z: el pasillo.
  const geometria = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  return (tira = { textura, material, geometria });
}
