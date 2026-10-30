import client from "./client";

// ─── Términos del servicio y datos de cada persona ──────────────────────────
//
// Auditoría pre-lanzamiento (P0-2, P1-14). Los términos están APAGADOS hasta
// que el dueño los marca vigentes en el servidor (`TERMINOS_VIGENTES`, y un
// texto sin marcas de borrador): mientras tanto `leerTerminos` dice
// `vigente: false` y ninguna pantalla los pide. Ver
// `backend/app/services/terminos.py`.

export interface Terminos {
  vigente: boolean;
  version: string | null;
  texto: string | null;
}

/** Pública, sin sesión: la usan la página `/terminos` y el alta. Si el pedido
 *  falla, se trata como «no hay términos»: el alta sigue como siempre, y si el
 *  servidor sí los exige, lo dice al fundar (422). */
export async function leerTerminos(): Promise<Terminos> {
  try {
    const r = await client.get<Terminos>("/auth/terminos");
    return r.data;
  } catch {
    return { vigente: false, version: null, texto: null };
  }
}

/** La dueña acepta la versión que leyó, para su supermercado. 204. */
export const aceptarTerminos = (version: string): Promise<void> =>
  client.post("/auth/aceptar-terminos", { version }).then(() => undefined);

/** «Descargar mis datos»: lo de quien tiene la sesión abierta, como archivo.
 *  Mismo trato del error que `descargarMiExport` (un 429 llega como Blob). */
export async function descargarMisDatos(): Promise<void> {
  try {
    const r = await client.get("/auth/mis-datos", { responseType: "blob" });
    const disposicion: string = r.headers["content-disposition"] || "";
    const match = /filename="([^"]+)"/.exec(disposicion);
    const url = URL.createObjectURL(r.data as Blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = match?.[1] || "recabra-mis-datos.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    const data = (err as { response?: { data?: unknown } })?.response?.data;
    if (data instanceof Blob) {
      try {
        (err as { response: { data: unknown } }).response.data = JSON.parse(await data.text());
      } catch {
        // No era JSON: queda el mensaje por defecto.
      }
    }
    throw err;
  }
}

// ─── El operador atiende a una persona (consola de plataforma) ──────────────

/** A quién: el correo (o el teléfono), o el supermercado y el número del
 *  proveedor del que es contacto. `cliente` sólo limita la búsqueda. */
export interface TitularPedido {
  correo?: string;
  telefono?: string;
  cliente?: string;
  proveedor_id?: number;
  referencia?: string;
}

export interface ConstanciaDeTitular {
  id: number;
  tipo: "export" | "supresion";
  sujeto: "persona" | "contacto";
  huella: string;
  supermercado: string | null;
  atendido_por: string;
  atendido_en: string | null;
  referencia: string | null;
  resumen: Record<string, unknown>;
}

/** Baja como archivo todo lo que hay de la persona y devuelve el número de la
 *  constancia. Va por POST: el correo nunca en la URL. */
export async function exportarTitular(pedido: TitularPedido): Promise<number> {
  const r = await client.post<Record<string, unknown> & { constancia: number }>(
    "/plataforma/titulares/exportar", pedido,
  );
  const blob = new Blob([JSON.stringify(r.data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `recabra-titular-${r.data.constancia}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return r.data.constancia;
}

export interface ResultadoSupresion {
  constancia: number;
  huella: string;
  registro: Record<string, number>;
  supermercados: Record<string, Record<string, number>>;
  no_revisados: string[];
  membresias_apagadas: string[];
}

export const suprimirTitular = (
  pedido: TitularPedido & { aunque_sea_la_unica_duena?: boolean },
): Promise<ResultadoSupresion> =>
  client.post<ResultadoSupresion>("/plataforma/titulares/suprimir", pedido).then((r) => r.data);

export const listarConstancias = (): Promise<ConstanciaDeTitular[]> =>
  client.get<ConstanciaDeTitular[]>("/plataforma/titulares").then((r) => r.data);
