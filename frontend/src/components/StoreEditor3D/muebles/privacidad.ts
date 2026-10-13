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
 * La reunión sigue, pero todavía sin proveedor: es lo que deja «Cambiar de
 * proveedor» en `proveedorDeReunion` (un `""`, que no es `null`).
 *
 * Antes ese botón lo dejaba en `null`, que es «no hay reunión»: en cuanto se
 * cerraba el selector sin elegir un producto —para ir primero a otro
 * mueble—, el editor volvía a dibujar las pruebas de TODOS, el panel volvía a
 * nombrar la de Alpina con su foto y «Presentar» le pasaba la pantalla a
 * Alpina delante de Diana. Con el centinela la reunión no se pierde: no se
 * dibuja ninguna prueba (`pruebasDeLaReunion`), el panel trata toda prueba
 * como ajena y Presentar no adivina a quién mostrarle (`proveedorParaPresentar`).
 * Se sale eligiendo un producto (que fija al proveedor siguiente) o con
 * «Terminar la reunión».
 *
 * Vacío y no un texto cualquiera: el selector, el título y el precalentado
 * ya tratan un proveedor vacío como «sin proveedor», y `supplierPorNombre`
 * no encuentra a nadie con ese nombre.
 */
export const REUNION_SIN_PROVEEDOR = "";

/** ¿Hay una reunión fijada —con proveedor o abierta sin él—? */
export function reunionFijada(proveedorDeReunion: string | null | undefined): boolean {
  return proveedorDeReunion != null;
}

/**
 * Las pruebas de los muebles que siguen en el plano.
 *
 * Una prueba vive en la sesión con la clave `${fixtureId}|cara`; si el mueble
 * se borra (o es de otra sede), la entrada queda huérfana: no hay panel desde
 * donde quitarla, mantenía la reunión abierta para siempre (`hayReunion`
 * cuenta pruebas) y «Mostrarla» encuadraba un mueble que ya no existe. Se
 * cuentan sólo las de muebles presentes; el mismo `Map` si no sobra ninguna.
 */
export function pruebasDelPlano<T>(
  prueba: ReadonlyMap<string, T>,
  enElPlano: ReadonlySet<string>,
): ReadonlyMap<string, T> {
  let sobra = false;
  for (const clave of prueba.keys()) {
    if (!enElPlano.has(clave.slice(0, clave.lastIndexOf("|")))) { sobra = true; break; }
  }
  if (!sobra) return prueba;
  const fuera = new Map<string, T>();
  for (const [clave, v] of prueba) {
    if (enElPlano.has(clave.slice(0, clave.lastIndexOf("|")))) fuera.set(clave, v);
  }
  return fuera;
}

/** Ninguna prueba: una sola instancia, para que el memo de la escena no vea
 *  un `Map` nuevo en cada render. */
const SIN_PRUEBAS: ReadonlyMap<string, number> = new Map();

/**
 * Las pruebas que se dibujan en la pantalla de la DUEÑA (el editor, fuera de
 * Presentar).
 *
 * Sin reunión fijada, todas. Con reunión, sólo las de ese proveedor: la
 * pantalla se comparte aunque no se haya apretado «Presentar» —por eso el
 * panel y el cartel ya se vuelven discretos—, y le probaba el arroz a Diana
 * con los 345 vasos de Alpina de la mañana y su copete al lado. Las de los
 * otros no se borran: siguen en la sesión y vuelven al cambiar de proveedor.
 *
 * `eligiendo` (el selector de productos abierto) SIN proveedor: ninguna. Es
 * el rato que deja «Cambiar de proveedor» —la reunión queda sin proveedor
 * hasta elegir un producto del siguiente—, y en ese rato el editor volvía a
 * dibujar las pruebas de TODOS detrás del velo del selector, con el
 * proveedor nuevo ya mirando la pantalla. Lo mismo al abrir el selector por
 * primera vez: todavía no se sabe a quién se le muestra.
 *
 * `fijada` (la reunión sigue aunque el selector se cierre): «Cambiar de
 * proveedor» y cerrar el selector sin elegir volvía a dibujar las pruebas de
 * todos. Ver `REUNION_SIN_PROVEEDOR`.
 */
export function pruebasDeLaReunion(
  prueba: ReadonlyMap<string, number>,
  catalogo: readonly ArteDeProveedor[],
  supplierDeReunion: number | null,
  eligiendo = false,
  fijada = false,
): ReadonlyMap<string, number> {
  // Sin un proveedor que se pueda buscar: con el selector abierto, o con la
  // reunión fijada (abierta sin proveedor —`REUNION_SIN_PROVEEDOR`— o con un
  // proveedor que ya no tiene artes en el catálogo), ninguna. Sólo sin
  // reunión de ninguna clase se dibujan todas.
  if (supplierDeReunion == null) return (eligiendo || fijada) && prueba.size > 0 ? SIN_PRUEBAS : prueba;
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
 *
 * Con la reunión abierta SIN proveedor (`REUNION_SIN_PROVEEDOR`) no se pasa
 * de 1: nadie.
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
  // Reunión abierta sin proveedor («Cambiar de proveedor», o el de la reunión
  // ya sin artes): no se adivina con los pasos 2 y 3. Todas las pruebas de la
  // sesión eran de Alpina, y «Presentar» se las mostraba a Diana.
  if (reunionFijada(proveedorDeReunion)) return null;
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
 * de `privadoPara` y la cara se ve vacía.
 *
 * Se le avisa a la DUEÑA antes de entrar a Presentar (el título del botón y
 * el panel), nunca en el HUD: el HUD lo lee el proveedor, y «hay una prueba
 * que no se está mostrando» escrito sobre la punta vacía le decía que esa
 * punta se le está ofreciendo a otro.
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

/**
 * Para quién es la lámina de un mueble elegido, y si su pie puede llevar los
 * datos del contrato que hoy ocupa el espacio.
 *
 * - Con un producto en prueba (de la reunión, si hay una): para su proveedor.
 * - Sin prueba y sin reunión: para el que tiene el contrato (si tiene artes),
 *   con sus datos — es su espacio y su lámina.
 * - Sin prueba y CON reunión: para el proveedor de la reunión (o nadie), y el
 *   pie sin los datos de un contrato AJENO. Antes salía para el del contrato:
 *   en la reunión de Diana, con la punta de Alpina elegida, el lienzo que
 *   Diana miraba dibujaba los vasos de Alpina mientras se sacaban las tomas y
 *   bajaba «…_Alpina.png» con «Proveedor: Alpina», sus fechas y su valor.
 *   Si el contrato es del mismo proveedor de la reunión (una renovación), sus
 *   datos van.
 */
export function laminaDelMueble({
  arteSupplierId, contratoDe, proveedorDeReunion, catalogo,
}: {
  arteSupplierId: number | null | undefined;
  /** `supplierName` del contrato vigente (vacío si el espacio está libre). */
  contratoDe: string | null | undefined;
  proveedorDeReunion: string | null | undefined;
  catalogo: readonly ArteDeProveedor[];
}): { para: number | null; contratoALaVista: boolean } {
  const nombre = (t: string | null | undefined) => (t ?? "").trim().toLowerCase();
  const delContrato = supplierPorNombre(contratoDe, catalogo);
  if (!reunionFijada(proveedorDeReunion)) {
    return { para: arteSupplierId ?? delContrato, contratoALaVista: true };
  }
  const deReunion = supplierPorNombre(proveedorDeReunion, catalogo);
  const contratoDeLaReunion = !nombre(contratoDe)
    || (!!nombre(proveedorDeReunion) && nombre(contratoDe) === nombre(proveedorDeReunion));
  return { para: arteSupplierId ?? deReunion, contratoALaVista: contratoDeLaReunion };
}

/**
 * La cara que encuadran las tomas (el HUD de Presentar y la lámina): la que
 * se pidió, si se ve; si no, A y después B.
 *
 * Con pruebas del mismo proveedor en las dos caras de una góndola doble (Müsli
 * en la A, Zucaritas en la B), «Mostrar al proveedor» encuadraba la B y «De
 * cerca» saltaba al otro lado de la góndola, a otro producto; la lámina bajada
 * mientras se hablaba de la B salía con la A.
 */
export function caraDeLasTomas(
  ve: (cara: "A" | "B") => boolean,
  pedida?: "A" | "B" | null,
): "A" | "B" | null {
  if (pedida && ve(pedida)) return pedida;
  return ve("A") ? "A" : ve("B") ? "B" : null;
}

// ─── El visor 3D de Vender ────────────────────────────────────────────────────
//
// Vender es una pantalla que mira el PROVEEDOR: la dueña gira el monitor o
// comparte la pestaña. El visor que se abre desde la fila de una cara del
// contrato (`components/Contrato/VisorDeVenta.tsx`) dibuja la tienda con la
// misma escena del editor, pero los muebles que recibe ya vienen sin un solo
// dato comercial: no alcanza con que la escena «no los pinte» —el relleno
// neutro, por ejemplo, usa el rubro del contrato ajeno como color—; si el dato
// no llega, no hay forma de que se cuele.

/** Un espacio interno (repisa) del mueble, como lo modela el 3D. */
export interface EspacioVendible {
  id: string;
  x: number; y: number; w: number; h: number;
  status: string;
  supplierName: string;
  brandCategory: string;
  negotiatedValue: number;
  startDate: string;
  endDate: string;
}

/** Lo que hace falta de un mueble del 3D para dibujarlo en el visor. */
export interface MuebleVendible {
  id: string;
  code: string;
  type: string;
  gondolaType?: string;
  slots?: readonly EspacioVendible[];
  x: number; z: number; rotY: number;
  w: number; d: number; h: number;
  label: string;
  color: string;
  status: string;
  supplierName: string;
  brandCategory: string;
  negotiatedValue: number;
  startDate: string;
  endDate: string;
  observation: string;
  rentable?: boolean;
  /** La ficha del modelo: geometría, no comercio (ver `sinDatosComerciales`). */
  modelo?: string;
  entrepanos?: number;
  modulo?: number;
  partes?: { puertas?: number };
}

/**
 * Los muebles con lo comercial en blanco: proveedor, rubro, valor, fechas y
 * observación, en el mueble y en cada repisa.
 *
 * Pasan la geometría, el código, la etiqueta, el color y el ESTADO (libre,
 * ocupado…): Vender ya pinta la ocupación en el plano, así que el estado no
 * dice nada nuevo; quién, cuánto y hasta cuándo, sí. La ficha del modelo
 * (`modelo`, `entrepanos`, `modulo`, `partes.puertas`) también pasa: es
 * geometría, y sin ella el visor le mostraría al proveedor una góndola con
 * otros entrepaños o una nevera con otras puertas que las que se le venden.
 * `partes` pasa SÓLO con sus números conocidos, copiados uno por uno. Con el rubro vacío el
 * relleno neutro y el del contrato entero (`rubroDeContratoEntero`) caen al
 * gris genérico, sin la categoría del que hoy ocupa el espacio.
 *
 * Es una LISTA de lo que pasa, no una de lo que se borra: un campo comercial
 * que alguien agregue mañana al mueble no se cuela por omisión. No muta la
 * entrada.
 */
export function sinDatosComerciales<T extends MuebleVendible>(muebles: readonly T[]): T[] {
  return muebles.map((m) => {
    const limpio: MuebleVendible = {
      id: m.id,
      code: m.code,
      type: m.type,
      gondolaType: m.gondolaType,
      x: m.x, z: m.z, rotY: m.rotY,
      w: m.w, d: m.d, h: m.h,
      label: m.label,
      color: m.color,
      status: m.status,
      rentable: m.rentable,
      supplierName: "",
      brandCategory: "",
      negotiatedValue: 0,
      startDate: "",
      endDate: "",
      observation: "",
      slots: m.slots?.map((s) => ({
        id: s.id,
        x: s.x, y: s.y, w: s.w, h: s.h,
        status: s.status,
        supplierName: "",
        brandCategory: "",
        negotiatedValue: 0,
        startDate: "",
        endDate: "",
      })),
    };
    // Sin `slots` en la entrada, sin `slots` en la salida (y lo mismo con
    // `gondolaType` y `rentable`): un `undefined` explícito no es lo mismo
    // para quien pregunta con `in`.
    if (m.slots === undefined) delete limpio.slots;
    if (m.gondolaType === undefined) delete limpio.gondolaType;
    if (m.rentable === undefined) delete limpio.rentable;
    if (typeof m.modelo === "string") limpio.modelo = m.modelo;
    if (typeof m.entrepanos === "number") limpio.entrepanos = m.entrepanos;
    if (typeof m.modulo === "number") limpio.modulo = m.modulo;
    if (typeof m.partes?.puertas === "number") limpio.partes = { puertas: m.partes.puertas };
    return limpio as T;
  });
}

/**
 * Los muebles del contrato con sus espacios internos LIBRES: lo que Vender
 * vende es la cara entera.
 *
 * Los espacios internos (`slots`) viven sólo en el layout —se marcan en el
 * Editor 3D, sin contrato en la base— y son del MUEBLE, no de una cara. El
 * plano de Vender mira contratos y ofrece GON-02·B libre de punta a punta;
 * el visor, que dibuja el layout, la mostraba con un 60 % de relleno de
 * «otros» en «Hoy», «vendido» en los cinco entrepaños de «Por entrepaño» y
 * una lámina con un entrepaño de Alpina en una cara llena de mercadería
 * ajena. Al proveedor se le estaba diciendo que lo que se le vende ya está
 * vendido. Con los espacios internos libres en los muebles de `ids`, el
 * relleno de esas repisas y la marca «vendido» no salen (la misma regla de
 * `VENDIDO`). A la dueña se le avisa en la fila del contrato.
 *
 * Pasa todo lo demás igual —la geometría de cada espacio y el estado del
 * mueble, que dice si HOY lo ocupa otro entero— y no muta la entrada. Los
 * vecinos (los que no están en `ids`) quedan como están.
 */
export function sinRepisasVendidas<T extends Pick<MuebleVendible, "id" | "slots">>(
  muebles: readonly T[],
  ids: ReadonlySet<string>,
): T[] {
  return muebles.map((m) => (ids.has(m.id) && m.slots?.length
    ? ({ ...m, slots: m.slots.map((s) => ({ ...s, status: "free" })) } as T)
    : m));
}

/**
 * Las pruebas de las caras que siguen en el contrato.
 *
 * La prueba del visor vive en la ficha del contrato con la clave del editor
 * (`${fixtureId}|cara`). Si la dueña saca una cara del contrato, su producto
 * no tiene por qué seguir dibujado en el 3D: no es parte de lo que se está
 * vendiendo. Se conserva en la sesión —si la vuelve a sumar, vuelve— pero no
 * se muestra.
 */
export function pruebasDelContrato(
  prueba: ReadonlyMap<string, number>,
  caras: readonly { fixtureId: string; face: "A" | "B" }[],
): Map<string, number> {
  const enContrato = new Set(caras.map((c) => `${c.fixtureId}|${c.face}`));
  const fuera = new Map<string, number>();
  for (const [clave, id] of prueba) if (enContrato.has(clave)) fuera.set(clave, id);
  return fuera;
}

/** El nombre del proveedor como lo compara «Guardar contrato»: sin espacios
 *  de más y sin mayúsculas. Cambiar el proveedor de la ficha a otro nombre
 *  (no a otra forma de escribir el mismo) vacía la prueba del visor. Vive en
 *  `utils/proveedor.ts`, que no importa nada: la ficha de Vender la usa al
 *  entrar sin arrastrar este archivo (ver ahí). */
export { normalizarProveedor } from "../../../utils/proveedor";
