import client from "./client";
import { useAuthStore } from "../store/authStore";
// Sólo el TIPO: `producto.ts` sigue siendo puro y no arrastra la API.
import type { FichaDeArte } from "../components/StoreEditor3D/muebles/producto";

/**
 * El catálogo de artes de los proveedores.
 *
 * Es lo que se le prueba a un mueble en el 3D cuando el proveedor pregunta
 * «¿y cómo se vería mi producto acá?». El arte se carga UNA vez contra el
 * proveedor; antes había que resubir el mismo archivo en cada punta que se
 * quisiera mostrar, porque colgaba del espacio y no del producto.
 */
export interface Arte {
  id: number;
  supplier_id: number;
  /** Resuelto por el servidor: la lista se agrupa por proveedor. */
  proveedor: string;
  /** Cómo se llama el producto para quien lo elige: "Yogurt Griego 150g". */
  nombre: string;
  categoria?: string | null;
  filename: string;
  content_type: string;
  size: number;
  uploaded_at?: string | null;
  /** Forma y medidas del envase, si alguien las cargó. Sin ficha, el 3D las
   *  estima por el contenido o por el rubro y lo rotula «≈». */
  ficha?: FichaDeArte | null;
}

export const listarCatalogo = (supplierId?: number): Promise<Arte[]> =>
  client
    .get<Arte[]>("/catalogo/", { params: supplierId ? { supplier_id: supplierId } : undefined })
    .then((r) => r.data);

/** Mismo tope que el resto de las subidas: sin timeout el axios del proyecto
 *  espera para siempre y deja el botón muerto. */
const TIMEOUT_SUBIDA = 90_000;

export const subirArte = (input: {
  supplierId: number;
  nombre: string;
  categoria?: string;
  archivo: File;
  /** La ficha va en el MISMO formulario: el servidor la valida antes de leer
   *  el archivo y la guarda en el mismo commit que el arte. */
  ficha?: Partial<FichaDeArte>;
}): Promise<Arte> => {
  const form = new FormData();
  form.append("supplier_id", String(input.supplierId));
  form.append("nombre", input.nombre);
  if (input.categoria) form.append("categoria", input.categoria);
  for (const [campo, valor] of Object.entries(input.ficha ?? {})) {
    if (valor !== null && valor !== undefined) form.append(campo, String(valor));
  }
  form.append("file", input.archivo);
  return client
    .post<Arte>("/catalogo/", form, { timeout: TIMEOUT_SUBIDA })
    .then((r) => r.data);
};

/** Crea o reemplaza la ficha de un arte ya cargado. Sólo administración. */
export const guardarFicha = (arteId: number, ficha: FichaDeArte): Promise<Arte> =>
  client.put<Arte>(`/catalogo/${arteId}/ficha`, ficha).then((r) => r.data);

export const borrarArte = (id: number): Promise<void> =>
  client.delete(`/catalogo/${id}`).then(() => undefined);

/** URL de la imagen, para pintarla como textura.
 *
 *  El token va como query param porque quien la pide es el cargador de
 *  texturas de Three.js: hace un fetch del navegador y no manda la cabecera
 *  Authorization, igual que un `<img>`. */
export const arteUrl = (id: number): string => {
  const token = useAuthStore.getState().token ?? "";
  return `/api/catalogo/${id}/imagen?token=${encodeURIComponent(token)}`;
};
