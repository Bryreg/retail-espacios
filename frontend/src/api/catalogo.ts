import client from "./client";
import { tokenDeMedios } from "./medios";
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

/**
 * Los productos de UN proveedor, por el nombre que se tecleó en el contrato.
 *
 * Es el del visor 3D de Vender: esa pantalla la mira el proveedor, y no puede
 * bajar el catálogo entero —la lista de clientes de la tienda— ni la de
 * proveedores para buscar el suyo. El servidor resuelve el nombre con la misma
 * regla que «Guardar contrato» (sin mayúsculas ni espacios de más; con dos
 * iguales, el más viejo) y con el nombre vacío o desconocido contesta una
 * lista vacía, nunca todo. Acá, con el nombre vacío ni se pregunta.
 */
export const listarDelProveedor = (nombre: string): Promise<Arte[]> => {
  const n = nombre.trim();
  if (!n) return Promise.resolve([]);
  return client.get<Arte[]>("/catalogo/", { params: { proveedor: n } }).then((r) => r.data);
};

/**
 * Sube un producto a nombre del proveedor del contrato (visor de Vender).
 *
 * Igual que `subirArte`, pero con el NOMBRE y no el id: el visor no conoce
 * ids de proveedores ni puede listarlos. El servidor usa el que va a usar el
 * contrato; si el nombre no está, contesta 409 (`esProveedorNuevo`) y sólo lo
 * da de alta —en el mismo commit que el arte— con `crearProveedor`, que es la
 * confirmación de la dueña: «Postobon» sin tilde no es «Postobón», y crearlo
 * solo duplicaba al proveedor en plena reunión.
 */
export const subirArteDelProveedor = (input: {
  proveedor: string;
  nombre: string;
  categoria?: string;
  archivo: File;
  ficha?: Partial<FichaDeArte>;
  crearProveedor?: boolean;
}): Promise<Arte> => {
  const form = new FormData();
  form.append("proveedor", input.proveedor);
  if (input.crearProveedor) form.append("crear_proveedor", "true");
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

/** El 409 de `subirArteDelProveedor`: no hay ningún proveedor con ese nombre
 *  y hay que confirmar el alta. */
export function esProveedorNuevo(err: unknown): boolean {
  const r = (err as { response?: { status?: number; data?: { detail?: { codigo?: unknown } } } })?.response;
  return r?.status === 409 && r.data?.detail?.codigo === "proveedor_nuevo";
}

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
export const arteUrl = (id: number): string =>
  `/api/catalogo/${id}/imagen?token=${encodeURIComponent(tokenDeMedios())}`;
