import { CATALOGO_DE_MUEBLES, type PartesDeMueble } from "../catalogo/catalogo";
import { puertasDe, tramosValidos, vanosDeCorrido } from "../components/StoreEditor3D/muebles/medidas";
import { fullSpaceCode } from "../types/espacio";
import type { EstadoPorEspacio } from "./estadoComercial";
import { geometriaALaVista } from "./geometriaDelMueble";
import { claseDe, codigoDeParte, concordancia, divisionDe, partesDe, sufijoDeParte } from "./partes";

/**
 * «Cómo se vende» un mueble que se puede vender por partes, en el panel del
 * plano 2D y en el del Editor 3D: entero, o entero o por sus partes —la nevera
 * por puertas; el mural, la góndola, la nevera abierta y la de vegetales por
 * tramos; la góndola y la punta por entrepaños—. Puro: lo prueban
 * `probar-partes.mjs` y `probar-geometria.mjs`, y lo dibuja
 * `components/PartesDelMueble.tsx`.
 *
 * Las reglas de la dueña, de vender por partes:
 *
 *  · **Lo ya colocado no cambia solo.** Un mueble sin `partes.division` se
 *    vende entero aunque su ficha traiga las puertas o los tramos; sólo se
 *    vende por partes cuando alguien lo elige acá.
 *  · **Una sola forma de dividir.** Un mueble se divide por puertas, por
 *    tramos o por entrepaños, nunca por dos a la vez: elegir otra forma
 *    reemplaza la anterior. La entera siempre se puede vender.
 *  · **Con una parte vendida no se mueve lo vendido.** No cambia la cantidad
 *    de partes de esa clase ni la forma de dividir —el «tramo 2» pasaría a
 *    ser otro pedazo del mueble, o dejaría de existir— hasta que termine o se
 *    cancele su contrato. El servidor frena lo mismo (409 `partes_vendidas` y
 *    `contratos_vivos`); acá se dice antes, sin nombrar a nadie.
 */

type Mueble = {
  id: string; code: string; type: string; sede?: string; w: number; h?: number;
  gondolaType?: string | null; rentable?: boolean; partes?: PartesDeMueble | null;
  entrepanos?: number | null; modulo?: number | null;
  slots?: readonly { status: string }[] | null;
};

const tipoBase = (tipo: string) => CATALOGO_DE_MUEBLES.alias[tipo]?.tipo ?? tipo;

/** Las formas en que se puede vender por partes un mueble de esa familia. */
export function divisionesDe(tipo: string): string[] {
  const t = CATALOGO_DE_MUEBLES.tipos[tipoBase(tipo)];
  return t?.partes?.divisiones ?? [];
}

/** Cuántas puertas tiene: las de su ficha o las que se dibujan por el ancho. */
export function puertasDibujadas(f: Mueble): number {
  const p = f.partes?.puertas;
  return puertasDe(f.w, typeof p === "number" ? p : undefined);
}

/** El tramo más angosto que se ofrece: menos de 60 cm no es un tramo que una
 *  marca compre (en NAVE el mural de refrigerados mide 26 m de corrido). */
export const TRAMO_MINIMO = 0.6;

/** Hasta cuántos tramos admite ese ancho: uno cada 60 cm como mínimo, y no
 *  más que los de su familia (`geometria.tramos` del catálogo). */
export function tramosQueEntran(f: Mueble): number {
  const rango = (CATALOGO_DE_MUEBLES.tipos[tipoBase(f.type)]?.geometria as Record<string, [number, number]> | undefined)?.tramos;
  const tope = rango ? rango[1] : 40;
  return Math.max(2, Math.min(tope, Math.floor(f.w / TRAMO_MINIMO + 1e-9)));
}

/** Los tramos que se dibujan hoy: los guardados o, en una góndola, uno por
 *  módulo del corrido (`vanosDeCorrido`); en la nevera abierta o la de
 *  vegetales, uno cada 1,25 m. Es lo que se propone al elegir «por tramos»:
 *  queda escrito lo que se ve. */
export function tramosDibujados(f: Mueble): number {
  const guardados = tramosValidos(f.partes?.tramos);
  if (guardados !== undefined) return guardados;
  if (tipoBase(f.type) === "gondola") {
    return vanosDeCorrido(f.w, typeof f.modulo === "number" ? f.modulo : undefined).length;
  }
  return Math.max(1, Math.round(f.w / 1.25));
}

/** Los entrepaños con producto sobre la base que se dibujan hoy (la misma
 *  unidad que «Entrepaños» del panel): por entrepaños se venden ésos y la
 *  base. */
export function entrepanosDibujados(f: Mueble): number {
  return geometriaALaVista({ ...f, h: f.h ?? 1.8 }).entrepanos;
}

/** Lo que el panel escribe: la forma de venderse y la cantidad, adentro de
 *  `partes`; y, al elegir «por entrepaños» un mueble sin entrepaños guardados,
 *  los que se dibujan (`entrepanos`, en el mueble). `null` es borrar a
 *  propósito (el servidor rellena lo AUSENTE). */
export interface CambioDePartes {
  division?: string | null;
  puertas?: number | null;
  tramos?: number | null;
  entrepanos?: number | null;
}

/** El mueble con el cambio escrito encima (sin tocar el original). */
function conElCambio<T extends { partes?: PartesDeMueble | null; entrepanos?: number | null }>(f: T, cambio: CambioDePartes): T {
  const { entrepanos, ...dePartes } = cambio;
  return {
    ...f,
    partes: { ...(f.partes ?? {}), ...dePartes },
    ...(entrepanos !== undefined ? { entrepanos } : {}),
  };
}

/** El mismo plano con ese cambio en `partes` de ese mueble. `partes` se
 *  escribe ENTERA a partir de la que tiene (`{...f.partes, ...cambio}`): un
 *  panel que la armara sólo con lo que conoce borraría lo demás. */
export function conPartes<T extends { id: string; partes?: PartesDeMueble | null; entrepanos?: number | null }>(
  fixtures: readonly T[], id: string, cambio: CambioDePartes,
): T[] {
  if (!fixtures.some((f) => f.id === id)) return fixtures as T[];
  return fixtures.map((f) => (f.id !== id ? f : conElCambio(f, cambio)));
}

/** Las partes del mueble y si están vendidas (contrato vivo o firmado: el
 *  mapa crudo dice `occupied`). Sin nombres ni fechas: lo mira quien arma el
 *  plano, y la pantalla puede estar compartida. */
export function partesConEstado(
  f: Mueble, estado: EstadoPorEspacio, sede: string,
): { codigo: string; sufijo: string; vendida: boolean }[] {
  const completo = fullSpaceCode(f.sede || sede, f.code);
  return partesDe(f).map(({ cara, parte }) => {
    const codigo = codigoDeParte(completo, cara, parte);
    return { codigo, sufijo: sufijoDeParte(parte), vendida: estado[codigo]?.status === "occupied" };
  });
}

/** ¿Hay algo vendido de esa clase en el mueble? Mira el mapa crudo por
 *  código (también lo que hoy no se ofrece: un `TR4` vendido de antes), en
 *  las dos caras. */
export function vendidasDeLaClase(f: Mueble, estado: EstadoPorEspacio, sede: string, token: string): string[] {
  const prefijo = `${fullSpaceCode(f.sede || sede, f.code)}-`;
  const deLaClase = new RegExp(`^(?:B-)?${token}[1-9][0-9]?$`);
  return Object.entries(estado)
    .filter(([c, e]) => e.status === "occupied" && c.startsWith(prefijo) && deLaClase.test(c.slice(prefijo.length)))
    .map(([c]) => c.slice(prefijo.length));
}

/** Los espacios internos del Editor 3D que figuran vendidos (sin contrato:
 *  viven sólo en el plano). Son los mismos que avisa Vender. */
function internosVendidos(f: Mueble): number {
  return (f.slots ?? []).filter((s) => s.status === "occupied" || s.status === "reserved").length;
}

export interface RevisionDePartes {
  /** No se puede: hay una parte vendida que se movería o desaparecería. */
  bloqueo: string | null;
  /** Se puede, y conviene decir qué cambia. */
  aviso: string | null;
}

/**
 * Qué pasa si se escribe ese cambio. Con una parte de esa clase vendida, no se
 * cambia ni la forma ni la cantidad (bloqueo). Con la cara vendida entera,
 * cambiar las partes cambia cómo se dibuja lo que se vendió (aviso). Con
 * espacios internos vendidos, dividir avisa que pueden caer encima de una
 * parte. Lo demás, se escribe.
 */
export function revisarCambioDePartes(
  f: Mueble, cambio: CambioDePartes, estado: EstadoPorEspacio, sede: string,
): RevisionDePartes {
  const antes = divisionDe(f);
  const despues = divisionDe(conElCambio(f, cambio));
  const mismaForma = (antes?.clase ?? null) === (despues?.clase ?? null) && (antes?.n ?? null) === (despues?.n ?? null);
  if (antes && !mismaForma) {
    const clase = claseDe(antes.clase)!;
    const g = concordancia(antes.clase);
    const vendidas = vendidasDeLaClase(f, estado, sede, clase.token);
    if (vendidas.length > 0) {
      return {
        bloqueo: `Con ${vendidas.length === 1 ? `${g.un} ${clase.singular} vendid${g.o}` : `${vendidas.length} ${clase.plural} vendid${g.o}s`} ` +
          `(contrato vivo o firmado), la cantidad de ${clase.plural} no cambia ni deja de venderse por ` +
          `${clase.plural}: ${g.el} ${clase.singular} vendid${g.o} quedaría en otro lugar. Esperá a que termine o cancelá su contrato.`,
        aviso: null,
      };
    }
  }
  const completo = fullSpaceCode(f.sede || sede, f.code);
  const entera = estado[completo]?.status === "occupied" || estado[`${completo}-B`]?.status === "occupied";
  const cambiaLoQueSeDibuja =
    (cambio.puertas !== undefined && cambio.puertas !== (f.partes?.puertas ?? undefined)) ||
    (cambio.tramos !== undefined && cambio.tramos !== (f.partes?.tramos ?? undefined)) ||
    (cambio.entrepanos !== undefined && cambio.entrepanos !== (f.entrepanos ?? undefined));
  if (cambiaLoQueSeDibuja && entera) {
    const que = cambio.puertas !== undefined ? "las hojas del frente"
      : cambio.tramos !== undefined ? "los tramos del frente" : "la altura de los entrepaños, repartidos parejo";
    return { bloqueo: null, aviso: `Está vendida entera: cambia cómo se dibuja lo que se vendió (${que}).` };
  }
  const internos = internosVendidos(f);
  if (despues && !antes && internos > 0) {
    const clase = claseDe(despues.clase)!;
    return {
      bloqueo: null,
      aviso: `Tiene ${internos === 1 ? "1 espacio interno vendido" : `${internos} espacios internos vendidos`} en el Editor 3D, ` +
        `sin contrato. Los ${clase.plural} se venden igual: revisá que no caigan encima de lo que ya se vendió.`,
    };
  }
  return { bloqueo: null, aviso: null };
}

/**
 * Lo que se escribe al elegir vender por esa clase: la forma y la cantidad
 * que se dibuja hoy (queda escrito lo que se ve, y no cambia si mañana se
 * estira el mueble). Para los entrepaños, si el mueble no los tiene
 * guardados, se escriben los que se dibujan: sin cuenta no hay entrepaños que
 * vender. `null` si con lo que se dibuja no se puede dividir (una nevera de
 * una puerta, un mural de un solo tramo), con el porqué.
 */
export function cambioParaDividir(f: Mueble, clase: string): { cambio: CambioDePartes } | { problema: string } {
  const regla = claseDe(clase);
  if (!regla) return { problema: "Esa forma de vender no existe." };
  if (clase === "puertas") {
    const n = puertasDibujadas(f);
    if (n < regla.minimo) {
      return { problema: `Con una ${regla.singular} se vende entera: para venderla por ${regla.plural}, que tenga ${regla.minimo} o más.` };
    }
    return { cambio: { division: clase, puertas: n } };
  }
  if (clase === "tramos") {
    const n = Math.min(tramosQueEntran(f), Math.max(regla.minimo, tramosDibujados(f)));
    if (n < regla.minimo) {
      return { problema: `Es muy angosto para venderlo por ${regla.plural}: cada uno mide al menos ${TRAMO_MINIMO.toFixed(2).replace(".", ",")} m.` };
    }
    return { cambio: { division: clase, tramos: n } };
  }
  if (clase === "entrepanos") {
    const guardados = typeof f.entrepanos === "number";
    const n = guardados ? f.entrepanos! : entrepanosDibujados(f);
    if (n + 1 < regla.minimo) return { problema: `Con la base sola no se vende por ${regla.plural}.` };
    return { cambio: guardados ? { division: clase } : { division: clase, entrepanos: n } };
  }
  return { cambio: { division: clase } };
}

/** La división que el mueble pidió pero no puede usar todavía: eligió «por
 *  tramos» en su ficha (la de una góndola no trae la cantidad: depende del
 *  largo del corrido) y nadie la fijó. Se vende entera hasta fijarla. */
export function divisionSinFijar(f: Mueble): string | null {
  const pedida = f.partes?.division;
  if (typeof pedida !== "string" || !divisionesDe(f.type).includes(pedida)) return null;
  return divisionDe(f) ? null : pedida;
}
