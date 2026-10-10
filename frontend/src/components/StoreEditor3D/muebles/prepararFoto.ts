/**
 * El recorte de una foto, sin trabar la pantalla: en el worker
 * (`recorte.worker.ts`) si el navegador puede; si no, en el hilo principal
 * partido en etapas.
 *
 * Vive aparte de `etiqueta.ts` para que la vista previa del alta
 * (`EditorDeFicha`) use el MISMO worker sin arrastrar three ni la API, y para
 * que nada cree el worker al importarse: se crea en el primer uso (las pruebas
 * importan estos módulos en node, donde un `new Worker` al cargar los rompía).
 */
import { prepararFotoPorEtapas } from "./recorte";
import type { FotoPreparada, ModoDeFondo, PistaDeEnvase } from "./recorte";
import type { PedidoAlWorker, RespuestaDelWorker } from "./recorte.worker";

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

