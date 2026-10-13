import type {
  FaceData, FixType, GondolaType, ShelfSlot, SpaceStatus, UnifiedFixture,
} from "../types/fixtures";
import { isRotated90 } from "../types/fixtures";
import type { PartesDeMueble } from "../catalogo/catalogo";

/**
 * Del store a cada editor y de vuelta, sin perder nada en el camino.
 *
 * El store guarda el mueble entero (`UnifiedFixture`, que es el JSON del
 * layout). Cada editor trabaja con su propia forma, más chica: el plano 2D con
 * `PlacedItem2D` y el 3D con `PlacedFixture`. Ir del store al editor es elegir
 * campos; lo delicado es la VUELTA.
 *
 * ── Lo que se perdía ─────────────────────────────────────────────────────────
 *
 * Las dos vueltas armaban el mueble desde cero, con una lista fija de campos.
 * Todo lo que no estaba en la lista se borraba la primera vez que alguien
 * movía el mueble, y el guardado le mandaba la pérdida al servidor:
 *
 *  · El 2D perdía `vista3D` —la toma guardada para mostrarle el espacio al
 *    proveedor— y `mountedAt`/`mountedBy`. Mover una góndola en el plano
 *    borraba la vista que se había preparado en el 3D.
 *  · El 3D conservaba a mano cuatro campos (`nomenclatura`, `nombreAnterior`,
 *    `faceB`, `vista3D`) y perdía el resto, entre ellos el montaje de la cara A.
 *
 * Y cualquier campo nuevo del mueble —la ficha de la que nació, sus puertas o
 * tramos— habría tenido que acordarse de sumarse a las dos listas.
 *
 * ── La regla ─────────────────────────────────────────────────────────────────
 *
 * La vuelta parte del mueble GUARDADO con ese `id` y le escribe encima lo que
 * el editor sabe: `{ ...guardado, ...loQueSabe }`. Lo que el editor modela
 * manda —si lo movió, lo movió—; lo que no modela se queda como estaba.
 *
 * Lo que el editor sabe se escribe COMPLETO, también cuando vale `undefined`:
 * si el 2D le quita la cara B a una góndola que pasó a mural, ese `undefined`
 * tiene que pisar la del guardado, no dejarla asomar por debajo.
 *
 * Fuera de eso cada conversión hace exactamente lo que hacía cuando vivía
 * adentro de su editor, incluido que el 2D reescribe el `label` con el rótulo
 * de su catálogo al abrir el plano.
 *
 * ── La ficha del modelo ──────────────────────────────────────────────────────
 *
 * Un mueble colocado desde un modelo del catálogo guarda la ficha que lo
 * estampó: `modelo`, `entrepanos`, `modulo` y `partes` (ver `FichaDelMueble`).
 * La vuelta de ningún editor la escribe: se queda la guardada, así que un
 * cambio de la ficha en el catálogo no mueve lo ya colocado. Se escribe al
 * NACER el mueble —uno sin guardado con ese `id`—, de lo que trae el mueble
 * nuevo del editor (`nace` en el 2D, los campos de la ficha en el 3D), y
 * cuando alguien escribe «Alto», «Entrepaños» o «Módulo» en el panel: eso va
 * directo al store (`conGeometria` en `utils/geometriaDelMueble.ts`), después
 * de revisar lo vendido, y los dos editores se resincronizan como con un
 * deshacer. El editor 3D además la lee para dibujar (las puertas de la
 * nevera, los entrepaños y el módulo de la góndola y de la punta). Un mueble
 * sin ficha va y vuelve exactamente como antes.
 *
 * En el store, una clave de la ficha puede valer `null`: el panel la borró a
 * propósito («volver a la cuenta de siempre») y el próximo guardado se lo
 * dice así al servidor, que la saca. La vuelta la conserva como cualquier
 * otra cosa del guardado, y `fichaDe` —lo que le llega a cada editor— la
 * trata como ausente.
 *
 * ── Por qué está acá ─────────────────────────────────────────────────────────
 *
 * Es puro: ni React, ni three, ni el store. Las tablas del catálogo que cada
 * conversión necesita (rótulos, altos y colores por defecto, los muebles del
 * 3D) entran por parámetro, así que `scripts/probar-plano.mjs` lo ejecuta tal
 * cual con esbuild.
 */

// ─── La ficha del modelo ──────────────────────────────────────────────────────

/** Lo que un mueble guarda de la ficha de su modelo. */
export interface FichaDelMueble {
  modelo?: string;
  entrepanos?: number;
  modulo?: number;
  partes?: PartesDeMueble;
}

/** Las claves de la ficha. Son las que `PUT /layout` le rellena a un mueble
 *  que llega sin ellas (una pestaña de antes no las conoce) y las únicas en
 *  que un `null` significa «borrada a propósito» (ver `UnifiedFixture.modelo`
 *  y `CLAVES_DE_FICHA` en `services/layout_lookup.py`, que dice lo mismo). */
export const CLAVES_DE_FICHA = ["modelo", "partes", "entrepanos", "modulo"] as const;

/** La ficha de un mueble del store: cada clave puede venir en `null`, que es
 *  borrada a propósito (ver `UnifiedFixture.modelo`). */
export type FichaGuardada = { [K in keyof FichaDelMueble]?: FichaDelMueble[K] | null };

/** La ficha que guarda un mueble, sólo con lo que tiene: un mueble sin ficha
 *  da `{}`, y esparcirla no agrega ninguna clave. Un `null` —el panel la
 *  borró y todavía no se guardó— es no tenerla: al editor no le llega. */
export function fichaDe(f: FichaGuardada): FichaDelMueble {
  const out: FichaDelMueble = {};
  if (f.modelo != null) out.modelo = f.modelo;
  if (f.entrepanos != null) out.entrepanos = f.entrepanos;
  if (f.modulo != null) out.modulo = f.modulo;
  if (f.partes != null) out.partes = { ...f.partes };
  return out;
}

/** Con qué nace en el store un mueble que el 2D coloca desde un modelo: lo
 *  que el 2D no dibuja (el alto, el color) y la ficha. */
export interface NaceDeModelo extends FichaDelMueble {
  h: number;
  color: string;
}

// ─── El plano 2D ──────────────────────────────────────────────────────────────

/** Los tipos del plano 2D: la góndola va partida en doble y mural. */
export type FixType2D =
  | "gondola_doble"
  | "gondola_mural"
  | "punta"
  | "robatope"
  | "metro"
  | "mueble"
  | "ristra"
  | "cross"
  | "isla"
  | "impulsador"
  | "puesto_impulso"
  | "batea"
  | "isla_fria"
  | "nevera_carnes"
  | "nevera_vegetales"
  | "nevera_refrescos"
  | "nevera_puertas"
  | "stand_frutas"
  | "checkout"
  | "servicio_cliente"
  | "columna"
  | "exhibicion";   // legacy — kept for backward compat, not in catalog

export interface PlacedItem2D {
  id: string;
  type: FixType2D;
  code: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Mirrors UnifiedFixture.rotY so 2D and 3D stay in sync. */
  rotY: number;
  status: SpaceStatus;
  supplierName: string;
  brandCategory: string;
  negotiatedValue: number;
  startDate: string;
  endDate: string;
  observation: string;
  sede: string;
  /** El nombre VIEJO del mueble. Ya no es un nombre y nada lo dibuja: se
   *  arrastra tal cual para que buscar por lo que dice la cartelería siga
   *  encontrando el mueble y para que la reconciliación tenga contra qué
   *  comparar. Ver `nombreAnterior` en `utils/nomenclatura.ts`. */
  nomenclatura?: string;
  /** Lo mismo, pero escrito por la renumeración del servidor: cómo se llamaba
   *  este mueble antes de que le cambiaran el nombre. */
  nombreAnterior?: string;
  /** Face B commercial data (gondola_doble only); face A = top-level fields. */
  faceB?: FaceData;
  /** False marks infrastructure that is never rented out. Undefined = rentable. */
  rentable?: boolean;
  /** Con qué nace, si se colocó desde un modelo del catálogo: lo usa
   *  `itemsToStore` sólo para un mueble NUEVO (sin guardado con ese `id`).
   *  Del store vuelve con el modelo del mueble —el panel muestra su nombre y
   *  un duplicado nace con la misma ficha—; de un mueble sin modelo, no está. */
  nace?: NaceDeModelo;
}

/** Lo que las conversiones del 2D necesitan de su catálogo. Entra por
 *  parámetro para que este módulo no arrastre el componente. */
export interface Catalogo2D {
  /** El rótulo de cada tipo: `storeToItems` lo usa en lugar del guardado. */
  tipos: readonly { type: FixType2D; label: string }[];
  /** Alto (m) con que nace un mueble dibujado en 2D, por `FixType2D`. */
  altos: Readonly<Record<string, number>>;
  /** Color con que nace, por `FixType2D`. */
  colores: Readonly<Record<string, string>>;
}

/** Convert the unified store into the 2D internal array (run once on mount). */
export function storeToItems(fixtures: UnifiedFixture[], catalogo: Catalogo2D): PlacedItem2D[] {
  return fixtures.map((f) => {
    let type2D: FixType2D;
    if (f.type === "gondola") {
      // Para DIBUJAR, todo lo que no es mural es doble (`gondolaType` ausente
      // incluido). Las caras que se venden las cuenta `carasDe`.
      type2D = f.gondolaType === "wall" ? "gondola_mural" : "gondola_doble";
    } else {
      // All other types exist 1-to-1 in FixType2D (including new types + legacy exhibicion)
      type2D = f.type as FixType2D;
    }
    const catDef = catalogo.tipos.find((c) => c.type === type2D);
    const rot90 = isRotated90(f.rotY ?? 0);
    // Visual footprint in 2D — swap w/d when rotated 90° or 270°
    const w2d = rot90 ? f.d : f.w;
    const h2d = rot90 ? f.w : f.d;
    return {
      id: f.id,
      type: type2D,
      code: f.code,
      label: catDef?.label ?? f.label,
      x: f.cx - w2d / 2,
      y: f.cz - h2d / 2,
      w: w2d,
      h: h2d,
      rotY: f.rotY ?? 0,
      status: f.status,
      supplierName: f.supplierName,
      brandCategory: f.brandCategory,
      // Worker layout responses omit negotiatedValue — default to 0 locally.
      negotiatedValue: f.negotiatedValue ?? 0,
      startDate: f.startDate,
      endDate: f.endDate,
      observation: f.observation,
      sede: f.sede,
      nomenclatura: f.nomenclatura,
      nombreAnterior: f.nombreAnterior,
      faceB: f.faceB,
      rentable: f.rentable,
      // Sólo un mueble con modelo trae `nace`: el de un plano viejo sale como
      // siempre, sin la clave.
      ...(f.modelo != null ? { nace: { h: f.h, color: f.color, ...fichaDe(f) } } : {}),
    };
  });
}

/**
 * Convert the 2D internal array back to unified format for the store.
 *
 * Parte del mueble guardado con ese `id` (`guardados`, el store de antes de
 * este cambio): lo que el 2D no modela —el alto, el color, los `slots`, la
 * vista 3D, el montaje y cualquier campo que se sume mañana— sigue ahí.
 */
export function itemsToStore(
  items: PlacedItem2D[],
  guardados: UnifiedFixture[],
  catalogo: Catalogo2D,
): UnifiedFixture[] {
  const porId = new Map(guardados.map((f) => [f.id, f]));
  return items.map((item) => {
    let type: FixType;
    let gondolaType: GondolaType | undefined;
    if (item.type === "gondola_doble")       { type = "gondola"; gondolaType = "double"; }
    else if (item.type === "gondola_mural")  { type = "gondola"; gondolaType = "wall"; }
    else { type = item.type as FixType; }

    const guardado = porId.get(item.id);
    // La ficha de un mueble NUEVO (el colocado desde un modelo, o el duplicado
    // de uno): con guardado, manda lo guardado y `nace` no se mira.
    const nace = guardado ? undefined : item.nace;
    // item.rotY tracks rotation (incremented by rotateItem); fall back to the saved value
    const rotY = item.rotY ?? guardado?.rotY ?? 0;
    const rot90 = isRotated90(rotY);
    // Convert visual 2D dims back to canonical (unrotated) store dims
    const storeW = rot90 ? item.h : item.w;
    const storeD = rot90 ? item.w : item.h;
    const loQueSabe: UnifiedFixture = {
      // Use the FixType2D key (item.type) for defaults so gondola_doble / gondola_mural are distinct
      h:     guardado?.h     ?? nace?.h     ?? catalogo.altos[item.type]   ?? 1.8,
      color: guardado?.color ?? nace?.color ?? catalogo.colores[item.type] ?? "#6366f1",
      rotY,
      id: item.id,
      code: item.code,
      type,
      gondolaType,
      label: item.label,
      cx: item.x + item.w / 2,
      cz: item.y + item.h / 2,
      w: storeW,
      d: storeD,
      status: item.status,
      sede: item.sede,
      supplierName: item.supplierName,
      brandCategory: item.brandCategory,
      negotiatedValue: item.negotiatedValue,
      startDate: item.startDate,
      endDate: item.endDate,
      observation: item.observation,
      nomenclatura: item.nomenclatura,
      nombreAnterior: item.nombreAnterior,
      faceB: item.faceB,
      rentable: item.rentable,
    };
    return { ...(guardado ?? (nace ? fichaDe(nace) : undefined)), ...loQueSabe };
  });
}

// ─── El editor 3D ─────────────────────────────────────────────────────────────

export interface PlacedFixture {
  id:              string;
  code:            string;
  type:            FixType;
  gondolaType?:    GondolaType;
  slots?:          ShelfSlot[];
  x: number; z: number;
  rotY:            number;
  w: number; d: number; h: number;
  label:           string;
  color:           string;
  supplierName:    string;
  brandCategory:   string;
  status:          SpaceStatus;
  negotiatedValue: number;
  startDate:       string;
  endDate:         string;
  observation:     string;
  /** False marks infrastructure that is never rented out. Undefined = rentable. */
  rentable?:       boolean;
  /** La ficha del modelo (ver `FichaDelMueble`): el 3D la lee para dibujar y
   *  la estampa sólo en un mueble nuevo; nunca la reescribe. */
  modelo?:         string;
  entrepanos?:     number;
  modulo?:         number;
  partes?:         PartesDeMueble;
}

/** Lo que `storeToFixtures` necesita del catálogo del 3D: el rótulo y el color
 *  de cada mueble (para el que no los trae guardados) y los espacios internos
 *  con que nace una góndola o una punta. */
export interface Catalogo3D {
  defs: readonly { type: FixType; gondolaType?: GondolaType; label: string; color: string }[];
  slotsPorDefecto: (fix: { type: FixType; w: number; h: number; code: string }) => ShelfSlot[];
}

/**
 * Convert the unified store into the 3D internal array.
 * Filters out "exhibicion" fixtures (no 3D mesh representation).
 */
export function storeToFixtures(unifiedList: UnifiedFixture[], catalogo: Catalogo3D): PlacedFixture[] {
  return unifiedList
    .filter((f) => f.type !== "exhibicion")
    .map((f) => {
      const type = f.type as FixType;
      const def  = catalogo.defs.find(
        (d) => d.type === type && (!f.gondolaType || d.gondolaType === f.gondolaType)
      );
      return {
        id:              f.id,
        code:            f.code,
        type,
        gondolaType:     f.gondolaType,
        slots:           f.slots ?? catalogo.slotsPorDefecto({ type, w: f.w, h: f.h, code: f.code }),
        x:               f.cx,
        // Direct Z mapping — camera is on the north side (Z = STORE_D + 8),
        // so small Z = far from camera = top of viewport, which already matches
        // the 2D convention (small Y = top of canvas). No flip needed.
        z:               f.cz,
        rotY:            f.rotY,
        w:               f.w,
        d:               f.d,
        h:               f.h,
        label:           f.label || def?.label || type,
        color:           f.color || def?.color || "#6366f1",
        supplierName:    f.supplierName,
        brandCategory:   f.brandCategory,
        status:          f.status,
        negotiatedValue: f.negotiatedValue,
        startDate:       f.startDate,
        endDate:         f.endDate,
        observation:     f.observation,
        rentable:        f.rentable,
        // Sólo lo que el mueble tiene: uno sin ficha sale como siempre.
        ...fichaDe(f),
      };
    });
}

/**
 * Convert the 3D internal array back to unified format.
 * Preserves "exhibicion" fixtures from the store (2D-only, invisible in 3D).
 *
 * `PlacedFixture` modela sólo lo que la escena necesita. Todo lo demás del
 * mueble guardado —la cara B, el nombre viejo que necesita la reconciliación,
 * las vistas guardadas, el montaje de la cara A y lo que se sume mañana— sale
 * del store tal como estaba. Sin eso, abrir este editor lo borraba de cada
 * mueble y le mandaba la pérdida al servidor.
 */
export function fixturesToStore(
  fixtures: PlacedFixture[],
  sede: string,
  guardados: UnifiedFixture[],
): UnifiedFixture[] {
  // Keep 2D-only fixtures (exhibicion) so the 2D editor doesn't lose them
  const exhibicion = guardados.filter((f) => f.type === "exhibicion");
  const porId = new Map(guardados.map((f) => [f.id, f]));

  const updated: UnifiedFixture[] = fixtures.map((f) => {
    const loQueSabe: UnifiedFixture = {
      id:              f.id,
      code:            f.code,
      type:            f.type,
      gondolaType:     f.gondolaType,
      label:           f.label,
      cx:              f.x,
      cz:              f.z, // direct mapping — no flip since camera moved to north side
      rotY:            f.rotY,
      w:               f.w,
      d:               f.d,
      h:               f.h,
      color:           f.color,
      status:          f.status,
      sede,
      supplierName:    f.supplierName,
      brandCategory:   f.brandCategory,
      negotiatedValue: f.negotiatedValue,
      startDate:       f.startDate,
      endDate:         f.endDate,
      observation:     f.observation,
      slots:           f.slots,
      rentable:        f.rentable,
    };
    // La ficha no está en `loQueSabe`: la del guardado se queda como estaba.
    // Un mueble NUEVO (sin guardado) nace con la que trae del editor.
    const guardado = porId.get(f.id);
    return { ...(guardado ?? fichaDe(f)), ...loQueSabe };
  });

  return [...exhibicion, ...updated];
}
