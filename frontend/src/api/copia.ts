import client from "./client";

// ─── Copia de seguridad (sólo el dueño) ─────────────────────────────────────
//
// `GET /clientes/mi-copia` devuelve un ZIP con todo lo del supermercado: cada
// tabla en JSON y los documentos, fotos, planometrías y artes como archivos.
// Owner-only en el backend con la misma regla que «Descargar mis datos»
// (`api/derechos.ts`): la membresía `owner`, no el rol del token. Qué trae y
// qué no, en `backend/app/services/copia.py`.

export interface CopiaBajada {
  nombre: string;
  bytes: number;
}

/** Baja la copia y dispara la descarga del navegador con el nombre que manda
 *  el servidor. `alAvanzar` recibe lo bajado y el total (si el servidor lo dijo).
 *
 *  Como en `descargarMiExport`: con `responseType: "blob"` un error (403, 429)
 *  también llega como Blob, y `describeError` no sabe leerlo. Se lo destraduce
 *  acá antes de dejarlo subir. */
export async function descargarCopia(
  alAvanzar?: (bajado: number, total: number | null) => void
): Promise<CopiaBajada> {
  try {
    const r = await client.get("/clientes/mi-copia", {
      responseType: "blob",
      onDownloadProgress: (e) => alAvanzar?.(e.loaded, e.total ?? null),
    });
    const disposicion: string = r.headers["content-disposition"] || "";
    const nombre = /filename="([^"]+)"/.exec(disposicion)?.[1] || "recabra-copia.zip";
    const archivo = r.data as Blob;

    const url = URL.createObjectURL(archivo);
    const a = document.createElement("a");
    a.href = url;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // No en el mismo instante: con un archivo grande, algún navegador todavía
    // lo está escribiendo a disco cuando vuelve el click.
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return { nombre, bytes: archivo.size };
  } catch (err) {
    const data = (err as { response?: { data?: unknown } })?.response?.data;
    if (data instanceof Blob) {
      try {
        (err as { response: { data: unknown } }).response.data = JSON.parse(await data.text());
      } catch {
        // No era JSON: queda el error tal cual y `describeError` usa su texto por defecto.
      }
    }
    throw err;
  }
}
