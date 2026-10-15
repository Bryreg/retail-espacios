import client from "./client";
import type { ModeloPropio } from "../catalogo/propias";
import type { PartesDeMueble } from "../catalogo/catalogo";

/**
 * Las fichas propias de los muebles del supermercado: `/api/muebles/modelos`
 * (`backend/app/routers/muebles.py`).
 *
 * La lista la puede leer cualquier sesión —una ficha no lleva plata: la tarifa
 * es la clave de una fila de Tarifas— y la trae, retiradas incluidas,
 * `store/fichasPropias.ts`, una vez por sesión. Escribir es de
 * administración, desde el taller (pestaña «Fichas»). El servidor valida con
 * las MISMAS reglas que el formulario (`catalogo/fichas.ts`) y, si algo no
 * pasa, contesta 422 con el campo de cada problema en `loc`; una clave que ya
 * existe, aunque esté retirada, 409. Cómo se le dice eso a la dueña lo decide
 * `utils/formularioDeFicha.ts` (`problemasDelServidor`).
 *
 * El prefijo es `/muebles` porque `/catalogo` es el catálogo de ARTES de los
 * proveedores (`api/catalogo.ts`).
 */

/** Lo que se manda al guardar: la ficha sin el id ni lo que pone el servidor.
 *  Al editar, la clave no viaja (no cambia nunca). */
export interface FichaParaGuardar {
  clave?: string;
  tipo: string;
  variante?: string;
  nombre: string;
  w: number; d: number; h: number;
  entrepanos?: number;
  modulo?: number;
  /** Las puertas, los tramos, las bahías, el forro y cómo se vende por partes
   *  (`division`): lo que la familia admite (`fichas.geometria`). */
  partes?: PartesDeMueble;
  tarifa?: string;
  fuente: { confiabilidad: string; url?: string; nota?: string };
}

/** La clave va en la ruta: `encodeURIComponent` aunque la validación sólo
 *  deje pasar minúsculas, números y guiones. */
const ruta = (clave: string) => `/muebles/modelos/${encodeURIComponent(clave)}`;

export const listarModelosPropios = (): Promise<ModeloPropio[]> =>
  client.get<ModeloPropio[]>("/muebles/modelos").then((r) => r.data);

export const crearModeloPropio = (ficha: FichaParaGuardar): Promise<ModeloPropio> =>
  client.post<ModeloPropio>("/muebles/modelos", ficha).then((r) => r.data);

export const cambiarModeloPropio = (clave: string, ficha: FichaParaGuardar): Promise<ModeloPropio> =>
  client.put<ModeloPropio>(ruta(clave), ficha).then((r) => r.data);

/** No borra nada: deja de ofrecerse en las paletas y lo colocado sigue igual. */
export const retirarModeloPropio = (clave: string): Promise<ModeloPropio> =>
  client.post<ModeloPropio>(`${ruta(clave)}/retirar`).then((r) => r.data);

export const reactivarModeloPropio = (clave: string): Promise<ModeloPropio> =>
  client.post<ModeloPropio>(`${ruta(clave)}/reactivar`).then((r) => r.data);
