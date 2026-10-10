/**
 * El recorte de la foto del proveedor, fuera del hilo principal.
 *
 * Elegir un producto en el selector trababa la pantalla medio segundo: el
 * recorte del fondo (~100 ms) y las variantes de cada envase (el borde, la
 * caja enderezada, la botella llena, la espalda: otros 150-200) corrían en el
 * hilo principal, con la pantalla compartida por videollamada. Acá corren en
 * un Worker de módulo: entra el Blob de la foto (el `fetch` con `res.ok` se
 * queda en el hilo principal, que es asíncrono) y salen el recorte y las
 * variantes con sus buffers TRANSFERIDOS, sin copiarlos. Los lienzos y las
 * texturas siguen en el hilo principal: son del DOM y de WebGL.
 *
 * Lo crea `etiqueta.ts` la primera vez que hace falta, nunca al importarse:
 * probar-muebles y probar-arte importan etiqueta.ts con esbuild en node, y un
 * `new Worker` al cargar el módulo las rompía. Vite lo empaqueta en /assets
 * (mismo origen: la CSP ya permite `worker-src 'self' blob:`).
 *
 * La cuenta es `prepararFoto` (`recorte.ts`, pura): la misma que corre el
 * camino troceado del hilo principal cuando no hay Worker u OffscreenCanvas.
 */
import { buffersDe, prepararFoto } from "./recorte";
import type { FotoPreparada, ModoDeFondo, PistaDeEnvase } from "./recorte";

/** Lo que pide el hilo principal. */
export interface PedidoAlWorker {
  id: number;
  blob: Blob;
  modo: ModoDeFondo;
  /** Lado máximo de la foto reducida (1024 para la etiqueta, 512 para la
   *  vista previa del alta). */
  lado: number;
  pista: PistaDeEnvase | null;
}

export type RespuestaDelWorker =
  | { id: number; ok: true; foto: FotoPreparada }
  | { id: number; ok: false; error: string };

/** Lo mínimo del ámbito de un worker. Sumar la lib WebWorker al tsconfig choca
 *  con la del DOM (las dos declaran `self`, `onmessage`, `postMessage`), así
 *  que se tipa a mano lo que se usa. */
interface AmbitoDelWorker {
  onmessage: ((e: MessageEvent<PedidoAlWorker>) => void) | null;
  postMessage(mensaje: RespuestaDelWorker, transferir: Transferable[]): void;
}
const ambito = self as unknown as AmbitoDelWorker;

ambito.onmessage = async (e) => {
  const { id, blob, modo, lado, pista } = e.data;
  try {
    const bmp = await createImageBitmap(blob);
    const k = Math.min(1, lado / Math.max(bmp.width, bmp.height));
    const w = Math.max(2, Math.round(bmp.width * k)), h = Math.max(2, Math.round(bmp.height * k));
    const lienzo = new OffscreenCanvas(w, h);
    const g = lienzo.getContext("2d", { willReadFrequently: true });
    if (!g) throw new Error("el worker no dio contexto 2D");
    g.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    const foto = prepararFoto(g.getImageData(0, 0, w, h).data, w, h, modo, pista);
    ambito.postMessage({ id, ok: true, foto }, buffersDe(foto));
  } catch (err) {
    ambito.postMessage({ id, ok: false, error: String(err) }, []);
  }
};
