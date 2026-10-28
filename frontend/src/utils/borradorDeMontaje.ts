/**
 * El reporte de montaje guardado en el teléfono (2026-10-28).
 *
 * Quien monta reporta desde el piso del supermercado, donde la señal va y
 * viene. Si el envío falla por la red, el reporte —con su foto— queda guardado
 * acá hasta que llega al servidor: se manda solo cuando vuelve la señal, y si
 * la página se cierra o se recarga, el formulario lo ofrece para mandarlo.
 *
 * IndexedDB y no `localStorage`: la foto es un archivo (cientos de KB) y
 * `localStorage` sólo guarda texto, con un tope de pocos MB. Sin IndexedDB
 * (navegación privada en algunos teléfonos) todo esto no hace nada y el
 * formulario sigue como antes: el reporte sigue en pantalla mientras no se
 * cierre.
 */
import type { MountMotivo } from "../api/mounts";

export interface BorradorDeMontaje {
  estado: "montado" | "no_montado";
  motivo?: MountMotivo;
  nota?: string;
  /** El nombre que escribió quien monta (por el enlace del correo). */
  quien?: string;
  foto: Blob | null;
  fotoNombre?: string;
  /** Cuándo se guardó (ISO). */
  guardado: string;
}

const BASE = "recabra-montaje";
const ALMACEN = "borradores";

function abrirBase(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") { resolve(null); return; }
      const pedido = indexedDB.open(BASE, 1);
      pedido.onupgradeneeded = () => { pedido.result.createObjectStore(ALMACEN); };
      pedido.onsuccess = () => resolve(pedido.result);
      pedido.onerror = () => resolve(null);
      pedido.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function conAlmacen<T>(modo: IDBTransactionMode, hacer: (a: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  const db = await abrirBase();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(ALMACEN, modo);
      const pedido = hacer(tx.objectStore(ALMACEN));
      tx.oncomplete = () => { db.close(); resolve(pedido.result ?? null); };
      tx.onerror = () => { db.close(); resolve(null); };
      tx.onabort = () => { db.close(); resolve(null); };
    } catch {
      db.close();
      resolve(null);
    }
  });
}

/** Guarda el reporte. Devuelve si quedó guardado (sin IndexedDB, no). */
export async function guardarBorrador(clave: string, b: BorradorDeMontaje): Promise<boolean> {
  const r = await conAlmacen("readwrite", (a) => a.put(b, clave));
  return r !== null;
}

export async function leerBorrador(clave: string): Promise<BorradorDeMontaje | null> {
  const r = await conAlmacen<BorradorDeMontaje | undefined>("readonly", (a) => a.get(clave));
  return r && typeof r === "object" && (r.estado === "montado" || r.estado === "no_montado") ? r : null;
}

export async function borrarBorrador(clave: string): Promise<void> {
  await conAlmacen("readwrite", (a) => a.delete(clave));
}

/** Un error de red (no llegó respuesta del servidor), a diferencia de un
 *  «no» del servidor (403, 409, 422), que guardarlo no arregla. */
export function esErrorDeRed(e: unknown): boolean {
  const x = e as { response?: unknown; code?: string; message?: string } | null;
  if (!x || x.response) return false;
  return x.code === "ERR_NETWORK" || x.code === "ECONNABORTED" || x.code === "ETIMEDOUT"
    || /network|timeout|internet|failed to fetch/i.test(x.message ?? "");
}

/** «5:12 p. m.» si es de hoy; si no, «27 oct, 5:12 p. m.». */
export function cuandoSeGuardo(iso: string): string {
  const d = new Date(iso);
  const hora = d.toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit" });
  return d.toDateString() === new Date().toDateString()
    ? `hoy a las ${hora}`
    : `el ${d.toLocaleDateString("es-CO", { day: "numeric", month: "short" })} a las ${hora}`;
}
