/**
 * Qué puede ver el proveedor que está mirando la pantalla.
 *
 * ## Por qué existe
 *
 * La prueba de producto vive en la sesión y se acumula: en una mañana la
 * dueña le prueba el yogur a Alpina en la punta, la gaseosa a Postobón en la
 * nevera y el arroz a Diana en el robatope. Las tres pruebas quedan puestas.
 * Cuando después aprieta «Mostrar al proveedor» con el arroz, el que mira es
 * Diana — y la primera versión le mostraba también los vasos de Alpina en la
 * punta vecina (el 40 % del cuadro) y las cajas de Kellogg's en la góndola de
 * enfrente: marca y producto de sus competidores, y de yapa la noticia de que
 * la punta de al lado se le está ofreciendo a otro.
 *
 * La regla: en una pantalla que mira un proveedor (Presentar, la lámina que
 * se lleva) se ve SÓLO lo suyo. Lo demás cae al relleno neutro por rubro, que
 * no nombra a nadie.
 *
 * Es puro (sin React ni three) para que `probar-muebles` lo corra.
 */

import { contenidoDelHablador } from "./habladores";
import type { ArteConFicha, ContenidoDelHablador } from "./habladores";

/** Lo que hace falta de un arte del catálogo para decidir. */
export interface ArteDeProveedor {
  id: number;
  supplier_id: number;
  proveedor: string;
}

/**
 * Para quién es la pantalla.
 *
 * - `undefined`: la pantalla de la dueña, sin filtro (el editor de siempre).
 * - un número: la pantalla que mira ESE proveedor (`supplier_id`).
 * - `null`: una pantalla de venta sin proveedor identificado — «Presentar»
 *   sin nada elegido—. No se muestra la prueba de nadie: ante la duda, no se
 *   le enseña a uno lo de otro.
 */
export type PrivadoPara = number | null | undefined;

/**
 * El arte que se puede dibujar en una cara, o `null`.
 *
 * Con la pantalla de la dueña pasa todo; con la de un proveedor, sólo sus
 * artes. Un arte que ya no está en el catálogo (borrado mientras se probaba)
 * no se muestra en una pantalla privada: no se sabe de quién es.
 */
export function arteALaVista(
  arteId: number | null | undefined,
  catalogo: readonly ArteDeProveedor[],
  privadoPara: PrivadoPara,
): number | null {
  if (arteId == null) return null;
  if (privadoPara === undefined) return arteId;
  if (privadoPara === null) return null;
  const arte = catalogo.find((a) => a.id === arteId);
  return arte && arte.supplier_id === privadoPara ? arteId : null;
}

/** Cuántos productos como mucho lleva una cara con surtido (el principal y
 *  hasta tres más). */
export const MAXIMO_DE_SURTIDO = 4;

/**
 * Los artes del surtido de una cara que se pueden dibujar.
 *
 * El surtido son productos del MISMO proveedor que el principal, en bloques
 * verticales (`bloquesDeSurtido`). Cada uno pasa por `arteALaVista` con la
 * misma pantalla, y se descarta si su `supplier_id` no es el del principal:
 * un arte de otro proveedor colado en el surtido (por un error de la sesión,
 * o el catálogo que cambió) nunca se dibuja al lado del de quien mira. Sin
 * repetidos, sin el principal y a lo sumo `MAXIMO_DE_SURTIDO − 1`.
 */
export function surtidoALaVista(
  principal: number | null | undefined,
  surtido: readonly number[] | null | undefined,
  catalogo: readonly ArteDeProveedor[],
  privadoPara: PrivadoPara,
): number[] {
  if (principal == null || !surtido?.length) return [];
  const delPrincipal = catalogo.find((a) => a.id === principal);
  if (!delPrincipal) return [];
  const fuera: number[] = [];
  for (const id of surtido) {
    if (id === principal || fuera.includes(id)) continue;
    const arte = catalogo.find((a) => a.id === id);
    if (!arte || arte.supplier_id !== delPrincipal.supplier_id) continue;
    if (arteALaVista(id, catalogo, privadoPara) == null) continue;
    fuera.push(id);
    if (fuera.length >= MAXIMO_DE_SURTIDO - 1) break;
  }
  return fuera;
}

/**
 * Lo que dice el hablador del producto en prueba (`contenidoDelHablador`), o
 * `null` si el arte no se puede mostrar en esta pantalla.
 *
 * El hablador lleva el NOMBRE del producto: en la pantalla de un proveedor,
 * el de un arte de otro no se escribe en ninguna tira, aunque la prueba se
 * haya colado (la misma regla que `arteALaVista`). En la pantalla de la dueña
 * pasa: los habladores sólo se dibujan en venta, pero la cuenta no supone de
 * dónde la llaman.
 */
export function habladorALaVista(
  arte: (ArteDeProveedor & ArteConFicha) | null | undefined,
  catalogo: readonly ArteDeProveedor[],
  privadoPara: PrivadoPara,
): ContenidoDelHablador | null {
  if (!arte) return null;
  return arteALaVista(arte.id, catalogo, privadoPara) == null ? null : contenidoDelHablador(arte);
}

/**
 * El `supplier_id` de un proveedor por su NOMBRE, o `null` si no tiene artes
 * en el catálogo.
 *
 * El selector fija al proveedor de la reunión por nombre al elegir un
 * producto (es lo que muestra su título, «Productos de Alpina»), y el
 * contrato de un espacio también lo nombra (`supplierName`); acá se lo busca
 * en el catálogo, sin mayúsculas ni espacios de más.
 */
export function supplierPorNombre(
  nombreDelProveedor: string | null | undefined,
  catalogo: readonly ArteDeProveedor[],
): number | null {
  if (!nombreDelProveedor) return null;
  const nombre = nombreDelProveedor.trim().toLowerCase();
  return catalogo.find((a) => a.proveedor.trim().toLowerCase() === nombre)?.supplier_id ?? null;
}

/**
 * ¿Hay una reunión en curso? Con una prueba puesta, con el proveedor de la
 * reunión fijado o con el selector abierto.
 *
 * La MISMA cuenta para todo lo que se vuelve discreto: el bloque «Contratado»
 * del panel y el cartel que sale al pasar el mouse por un mueble. El cartel
 * miraba sólo las pruebas, y con la reunión de Alpina en curso pero la prueba
 * recién quitada (para ponerla en otro mueble) mostraba «Bimbo · $1.500.000»
 * en la pantalla compartida, mientras el panel seguía discreto.
 */
export function hayReunion({ pruebas, proveedorDeReunion, eligiendo = false }: {
  pruebas: number;
  proveedorDeReunion: string | null | undefined;
  eligiendo?: boolean;
}): boolean {
  return pruebas > 0 || proveedorDeReunion != null || eligiendo;
}

/**
 * Las pruebas que se dibujan en la pantalla de la DUEÑA (el editor, fuera de
 * Presentar).
 *
 * Sin reunión fijada, todas. Con reunión, sólo las de ese proveedor: la
 * pantalla se comparte aunque no se haya apretado «Presentar» —por eso el
 * panel y el cartel ya se vuelven discretos—, y le probaba el arroz a Diana
 * con los 345 vasos de Alpina de la mañana y su copete al lado. Las de los
 * otros no se borran: siguen en la sesión y vuelven al cambiar de proveedor.
 */
export function pruebasDeLaReunion(
  prueba: ReadonlyMap<string, number>,
  catalogo: readonly ArteDeProveedor[],
  supplierDeReunion: number | null,
): ReadonlyMap<string, number> {
  if (supplierDeReunion == null) return prueba;
  const fuera = new Map<string, number>();
  for (const [clave, id] of prueba) {
    if (catalogo.find((a) => a.id === id)?.supplier_id === supplierDeReunion) fuera.set(clave, id);
  }
  return fuera.size === prueba.size ? prueba : fuera;
}

/**
 * A qué proveedor se le muestra la pantalla al entrar a Presentar.
 *
 * 1. El proveedor de la REUNIÓN (el selector lo fija al elegir un producto).
 *    Va primero: con la reunión de Diana en curso, un arrastre para girar que
 *    empieza sobre la punta vecina la elige, y «Presentar» le mostraba a
 *    Diana, a pantalla completa, los vasos de Alpina de la mañana.
 * 2. Sin reunión, el del producto en prueba en el mueble elegido (cara A
 *    primero, igual que el HUD): es lo que se va a encuadrar.
 * 3. Si todas las pruebas de la sesión son de UN mismo proveedor, ése: es a
 *    quien se le está mostrando, y el botón de siempre no puede esconderle
 *    su producto (la crítica de la segunda ronda: la dueña apretó
 *    «Presentar» y la punta de Alpina apareció vacía delante de Alpina).
 * 4. Si no, nadie (`null`): con pruebas de dos proveedores no se adivina a
 *    cuál se le muestra. Presentar avisa, sin nombres, que hay una prueba
 *    oculta (`ultimaPrueba`).
 */
export function proveedorParaPresentar({
  prueba, catalogo, muebleId, proveedorDeReunion,
}: {
  prueba: ReadonlyMap<string, number>;
  catalogo: readonly ArteDeProveedor[];
  muebleId: string | null | undefined;
  proveedorDeReunion: string | null | undefined;
}): number | null {
  const deReunion = supplierPorNombre(proveedorDeReunion, catalogo);
  if (deReunion != null) return deReunion;
  if (muebleId) {
    for (const cara of ["A", "B"] as const) {
      const id = prueba.get(`${muebleId}|${cara}`);
      const arte = id != null ? catalogo.find((a) => a.id === id) : undefined;
      if (arte) return arte.supplier_id;
    }
  }
  const deLaSesion = new Set<number>();
  for (const id of prueba.values()) {
    const arte = catalogo.find((a) => a.id === id);
    if (arte) deLaSesion.add(arte.supplier_id);
  }
  return deLaSesion.size === 1 ? [...deLaSesion][0] : null;
}

/**
 * La última prueba puesta en la sesión (el `Map` conserva el orden en que se
 * pusieron), o `null`. Es la que se ofrece mostrar cuando Presentar quedó sin
 * proveedor: el aviso NO nombra a nadie —la pantalla ya puede estar
 * compartida—, sólo dice que hay una prueba que no se está viendo.
 */
export function ultimaPrueba(
  prueba: ReadonlyMap<string, number>,
  catalogo: readonly ArteDeProveedor[],
): { fixtureId: string; cara: "A" | "B"; supplierId: number } | null {
  let ultima: { fixtureId: string; cara: "A" | "B"; supplierId: number } | null = null;
  for (const [clave, id] of prueba) {
    const arte = catalogo.find((a) => a.id === id);
    const corte = clave.lastIndexOf("|");
    const cara = clave.slice(corte + 1);
    if (!arte || corte < 0 || (cara !== "A" && cara !== "B")) continue;
    ultima = { fixtureId: clave.slice(0, corte), cara, supplierId: arte.supplier_id };
  }
  return ultima;
}

/**
 * La prueba de OTRO proveedor en el mueble elegido, o `null`: la pantalla es
 * de `privadoPara` y la cara se ve vacía. Es la que se avisa (sin nombres)
 * en Presentar, para que la dueña sepa por qué la punta salió pelada.
 */
export function pruebaAjenaDelMueble(
  prueba: ReadonlyMap<string, number>,
  catalogo: readonly ArteDeProveedor[],
  muebleId: string | null | undefined,
  privadoPara: number,
): { fixtureId: string; cara: "A" | "B"; supplierId: number } | null {
  if (!muebleId) return null;
  for (const cara of ["A", "B"] as const) {
    const id = prueba.get(`${muebleId}|${cara}`);
    const arte = id != null ? catalogo.find((a) => a.id === id) : undefined;
    if (arte && arte.supplier_id !== privadoPara) return { fixtureId: muebleId, cara, supplierId: arte.supplier_id };
  }
  return null;
}
