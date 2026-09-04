import client from "./client";

// ─── Derechos del titular (Fase 3 compliance) ───────────────────────────────
//
// Owner-only en el backend, con la MISMA definición para las dos cosas: JWT
// con `sub` + membresía ACTIVA `rol == "owner"` sobre el cliente del pedido.
// El rol `admin` del token no alcanza -- el owner viaja como admin desde la
// Fase 1, así que acá abajo un 403 es "no sos el owner", no "no sos admin".

/** Baja el export completo del cliente (spaces, leases, suppliers, layouts)
 *  y dispara la descarga del navegador con el nombre que manda el backend.
 *
 *  `responseType: "blob"` es necesario para poder guardar el archivo, pero
 *  tiene un efecto colateral: cuando el backend contesta un error (403/429),
 *  axios igual lo entrega como Blob en vez de JSON -- `describeError` no
 *  sabe leer eso. Se lo destraduce acá antes de dejar subir el error, así
 *  quien llama sigue usando `describeError` como con cualquier otro pedido. */
export async function descargarMiExport(): Promise<void> {
  try {
    const r = await client.get("/clientes/mi-export", { responseType: "blob" });
    const disposicion: string = r.headers["content-disposition"] || "";
    const match = /filename="([^"]+)"/.exec(disposicion);
    const nombre = match?.[1] || "recabra-export.json";

    const url = URL.createObjectURL(r.data as Blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    const data = (err as { response?: { data?: unknown } })?.response?.data;
    if (data instanceof Blob) {
      try {
        const texto = await data.text();
        (err as { response: { data: unknown } }).response.data = JSON.parse(texto);
      } catch {
        // No era JSON -- se deja el error tal cual, `describeError` cae al mensaje por defecto.
      }
    }
    throw err;
  }
}

export interface SolicitudSupresion {
  id: number;
  cliente_slug: string;
  usuario_id: number;
  email: string;
  motivo: string | null;
  estado: "pendiente" | "atendida" | "rechazada";
  creado_en: string;
  atendido_en: string | null;
  atendido_por: string | null;
  nota: string | null;
}

/** El owner PIDE la supresión de su cliente. No borra nada -- sólo queda
 *  registrada para que el operador la atienda a mano. 409 si ya hay una
 *  pendiente para este cliente. */
export const solicitarSupresion = (motivo?: string): Promise<SolicitudSupresion> =>
  client
    .post<SolicitudSupresion>("/clientes/solicitar-supresion", { motivo: motivo || undefined })
    .then((r) => r.data);

// ─── Panel del operador ─────────────────────────────────────────────────────

export const getSolicitudesSupresion = (): Promise<SolicitudSupresion[]> =>
  client
    .get<{ solicitudes: SolicitudSupresion[] }>("/plataforma/supresiones")
    .then((r) => r.data.solicitudes);

export const atenderSupresion = (
  id: number,
  payload: { estado: "atendida" | "rechazada"; nota: string }
): Promise<SolicitudSupresion> =>
  client
    .patch<SolicitudSupresion>(`/plataforma/supresiones/${id}`, payload)
    .then((r) => r.data);
