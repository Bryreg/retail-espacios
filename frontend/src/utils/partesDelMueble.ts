import { CATALOGO_DE_MUEBLES, modeloPorId, nombreDeModelo, type PartesDeMueble } from "../catalogo/catalogo";
import { puertasDe, tramosValidos, vanosDeCorrido } from "../components/StoreEditor3D/muebles/medidas";
import { fullSpaceCode } from "../types/espacio";
import type { EstadoPorEspacio } from "./estadoComercial";
import { geometriaALaVista } from "./geometriaDelMueble";
import {
  claseDe, codigoDeParte, comoSeVendeLaFicha, concordancia, divisionDe, esDivision, firmaDePartes, partesDe, piezasDe,
  piezasDeLaFamilia, sufijoDeParte, textoDeComoSeVende,
} from "./partes";

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
 *  · **Las piezas de lo que no se vende entero** (paso 3): la caja tiene sus
 *    bahías de impulso (`partes.bahias`, de 1 a 4) y la columna su forro
 *    (`partes.forro`). Con una bahía vendida no cambia la cantidad de bahías
 *    (la «bahía 1» quedaría en otro lugar), y con el forro vendido la columna
 *    no se queda sin forro. «Aplicar a todas las cajas de la sede» escribe la
 *    misma cantidad en las demás, salta las que tienen una bahía vendida y lo
 *    dice.
 */

type Mueble = {
  id: string; code: string; type: string; sede?: string; w: number; h?: number;
  gondolaType?: string | null; rentable?: boolean; partes?: PartesDeMueble | null;
  entrepanos?: number | null; modulo?: number | null;
  slots?: readonly { status: string }[] | null;
  /** La ficha con que se colocó (`base:…` de RECABRA o `cli:…` propia). */
  modelo?: string | null;
};

const tipoBase = (tipo: string) => CATALOGO_DE_MUEBLES.alias[tipo]?.tipo ?? tipo;

/** Las formas en que se puede vender por partes un mueble de esa familia. */
export function divisionesDe(tipo: string): string[] {
  const t = CATALOGO_DE_MUEBLES.tipos[tipoBase(tipo)];
  return t?.partes?.divisiones ?? [];
}

/** Las piezas que lleva un mueble de esa familia (vive en `partes.ts`). */
export { piezasDeLaFamilia };

/** ¿El panel «Cómo se vende» tiene algo que decir de esa familia? Las que se
 *  dividen y las que tienen piezas: también la caja y la columna, que no son
 *  comercializables pero venden sus piezas. */
export function vendePorPartes(tipo: string): boolean {
  return divisionesDe(tipo).length > 0 || piezasDeLaFamilia(tipo).length > 0;
}

/** Lo que el panel dice de un mueble que nunca se alquila (`alquilable:
 *  "nunca"`): la caja y la columna no se venden enteras, pero sus piezas sí;
 *  el mostrador de servicio al cliente, nada. */
export function textoDeLoQueNuncaSeAlquila(tipo: string): string {
  const piezas = piezasDeLaFamilia(tipo);
  if (piezas.includes("bahias")) {
    return "Puesto de trabajo de la tienda: no se alquila entero ni cuenta en la ocupación. Sus bahías de impulso, sí: "
      + "se venden una por una, configuradas abajo en «Cómo se vende».";
  }
  if (piezas.includes("forro")) {
    return "Estructura del local: no se alquila ni cuenta en la ocupación. Su forro, sí: se vende marcándolo abajo en «Cómo se vende».";
  }
  return "Puesto de trabajo de la tienda: no se alquila, no lleva tarifa y queda fuera de la ocupación.";
}

/** Hasta cuántas bahías de impulso admite la familia (`geometria.bahias`). */
export function bahiasMaximas(tipo: string): number {
  const r = (CATALOGO_DE_MUEBLES.tipos[tipoBase(tipo)]?.geometria as Record<string, [number, number]> | undefined)?.bahias;
  return r ? r[1] : 0;
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
  /** Las bahías de impulso de una caja (`null`: ninguna). */
  bahias?: number | null;
  /** El forro de una columna (`null`: sin forro). */
  forro?: boolean | null;
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
): { codigo: string; sufijo: string; vendida: boolean; pieza: boolean }[] {
  const completo = fullSpaceCode(f.sede || sede, f.code);
  return partesDe(f).map(({ cara, parte }) => {
    const codigo = codigoDeParte(completo, cara, parte);
    return { codigo, sufijo: sufijoDeParte(parte), vendida: estado[codigo]?.status === "occupied", pieza: !esDivision(parte) };
  });
}

/** ¿Hay algo vendido de esa clase en el mueble? Mira el mapa crudo por
 *  código (también lo que hoy no se ofrece: un `TR4` vendido de antes), en
 *  las dos caras. Una pieza única (el forro) va sin número: `COL-07-FO`. */
export function vendidasDeLaClase(f: Mueble, estado: EstadoPorEspacio, sede: string, token: string): string[] {
  const prefijo = `${fullSpaceCode(f.sede || sede, f.code)}-`;
  const unica = Object.values(CATALOGO_DE_MUEBLES.partes.clases).some((c) => c.token === token && c.unico);
  const deLaClase = unica ? new RegExp(`^${token}$`) : new RegExp(`^(?:B-)?${token}[1-9][0-9]?$`);
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
  // Las piezas: con una vendida, su clase no cambia de cantidad (las bahías
  // parten la mesa parejo: la «bahía 1» quedaría en otro lugar) ni desaparece
  // (el forro vendido).
  const piezasAntes = piezasDe(f);
  const piezasDespues = piezasDe(conElCambio(f, cambio));
  for (const clase of new Set(piezasAntes.map((p) => p.clase))) {
    const cuantas = (lista: typeof piezasAntes) => lista.filter((p) => p.clase === clase).length;
    if (cuantas(piezasAntes) === cuantas(piezasDespues)) continue;
    const regla = claseDe(clase)!;
    const g = concordancia(clase);
    const vendidas = vendidasDeLaClase(f, estado, sede, regla.token);
    if (vendidas.length === 0) continue;
    return {
      bloqueo: regla.unico
        ? `Con ${g.el} ${regla.singular} vendid${g.o} (contrato vivo o firmado), no se puede sacar. Esperá a que termine o cancelá su contrato.`
        : `Con ${vendidas.length === 1 ? `${g.un} ${regla.singular} vendid${g.o}` : `${vendidas.length} ${regla.plural} vendid${g.o}s`} ` +
          `(contrato vivo o firmado), la cantidad de ${regla.plural} no cambia: ${g.el} ${regla.singular} vendid${g.o} quedaría ` +
          "en otro lugar. Esperá a que termine o cancelá su contrato.",
      aviso: null,
    };
  }
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
    // La de una góndola, un tramo por módulo (su ficha es un módulo): con un
    // solo módulo dibujado no hay tramos que vender, se estira primero. Antes
    // proponía partir ese módulo en dos.
    if (seCuentaEnElPlano(f.type, clase) && tramosDibujados(f) < regla.minimo) {
      return { problema: `Tiene un solo módulo: para venderla por ${regla.plural} (uno por módulo), estirala en el plano a ${regla.minimo} módulos o más.` };
    }
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

/**
 * «Aplicar a todas las cajas de la sede»: la misma cantidad de bahías (o el
 * mismo forro) en todos los muebles de ese tipo, en un solo cambio. Salta los
 * que tienen una pieza de esa clase vendida (el cambio la movería: lo mismo
 * que frena `revisarCambioDePartes`) y los nombra; los que ya la tienen así
 * quedan como están.
 */
export function aplicarATodos<T extends Mueble>(
  fixtures: readonly T[], tipo: string, cambio: CambioDePartes, estado: EstadoPorEspacio, sede: string,
): { fixtures: T[]; aplicados: string[]; saltados: string[] } {
  const aplicados: string[] = [];
  const saltados: string[] = [];
  const base = tipoBase(tipo);
  const nuevos = fixtures.map((f) => {
    if (tipoBase(f.type) !== base) return f;
    const conCambio = conElCambio(f, cambio);
    const igual = JSON.stringify(piezasDe(f)) === JSON.stringify(piezasDe(conCambio));
    if (igual) return f;
    if (revisarCambioDePartes(f, cambio, estado, sede).bloqueo) { saltados.push(f.code); return f; }
    aplicados.push(f.code);
    return conCambio;
  });
  return { fixtures: nuevos, aplicados, saltados };
}

/** ¿La cantidad de esa división se cuenta en el plano y no en la ficha? Los
 *  tramos de una góndola (`seCuentanEnElPlano` del catálogo): uno por módulo. */
export function seCuentaEnElPlano(tipo: string, clase: string): boolean {
  return CATALOGO_DE_MUEBLES.tipos[tipoBase(tipo)]?.partes?.seCuentanEnElPlano?.includes(clase) ?? false;
}

/** La división que el mueble pidió pero no puede usar todavía: eligió «por
 *  tramos» en su ficha (la de una góndola no trae la cantidad: depende del
 *  largo del corrido) y nadie la fijó. Se vende entera hasta fijarla. */
export function divisionSinFijar(f: Mueble): string | null {
  const pedida = f.partes?.division;
  if (typeof pedida !== "string" || !divisionesDe(f.type).includes(pedida)) return null;
  return divisionDe(f) ? null : pedida;
}

// ─── Lo que dice su ficha ────────────────────────────────────────────────────

/** Lo que el panel le ofrece a un mueble colocado desde una ficha (un modelo
 *  de RECABRA o una ficha propia) que dice cómo se vende. */
export interface LoDeLaFicha {
  /** El nombre de la ficha, como lo nombra el panel («≈ Góndola de pared…»). */
  nombre: string;
  /** Lo que dice: «entera o por puertas (3)», «2 bahías de impulso». */
  texto: string;
  /** Lo que hay que escribirle al mueble para venderse así; `null` si ya se
   *  vende así o si todavía no se puede (`problema`). */
  cambio: CambioDePartes | null;
  /** Por qué no se puede todavía: una góndola de un solo módulo no tiene
   *  tramos que vender. */
  problema: string | null;
}

/** Qué decide DÓNDE cae cada parte y si se vende por partes: la forma y la
 *  cuenta de cada clase. Dos muebles con la misma se venden igual. */
const firmaDeVenta = (f: Mueble) => JSON.stringify({ d: divisionDe(f), p: firmaDePartes(f) });

/**
 * Lo que dice la ficha del mueble de cómo se vende, y qué hay que escribirle
 * para que se venda así: «Usar lo de la ficha» del panel.
 *
 * **Lo ya colocado no cambia solo.** El mueble lleva estampado lo que su ficha
 * decía al colocarlo; si la ficha cambió después —la dueña la pasó a «por
 * puertas» en el taller, o el modelo de RECABRA ahora viene por tramos—, el
 * panel lo dice y espera a que alguien lo elija. Esto sólo lo calcula.
 *
 * Lo que va: la forma de dividir y, si la ficha la cuenta (las puertas, los
 * tramos de una nevera abierta, las bahías), su cantidad; los tramos de una
 * góndola, uno por módulo del corrido (`cambioParaDividir`: la ficha es un
 * módulo); los entrepaños, los que tiene el mueble o, si no tiene, los de la
 * ficha. `null` si el mueble no tiene ficha, si es de otra familia o si la
 * ficha no dice nada de partes.
 */
export function loDeLaFicha(f: Mueble): LoDeLaFicha | null {
  const m = modeloPorId(f.modelo ?? undefined);
  if (!m || m.tipo !== tipoBase(f.type)) return null;
  if (m.variante !== undefined && (f.gondolaType === "wall" ? "wall" : "double") !== m.variante) return null;
  const como = comoSeVendeLaFicha(m);
  if (!como) return null;
  const cambio: CambioDePartes = {};
  let problema: string | null = null;
  if (como.division) {
    const regla = claseDe(como.division)!;
    if (como.n === null) {
      const r = cambioParaDividir(f, como.division);
      if ("problema" in r) problema = r.problema;
      else Object.assign(cambio, r.cambio);
    } else if (regla.campo === "entrepanos") {
      cambio.division = como.division;
      if (typeof f.entrepanos !== "number") cambio.entrepanos = m.entrepanos ?? null;
    } else {
      cambio.division = como.division;
      (cambio as Record<string, unknown>)[regla.campo] = (m.partes as Record<string, unknown>)[regla.campo];
    }
  }
  for (const p of como.piezas) {
    if (p.clase === "bahias") cambio.bahias = p.n;
    if (p.clase === "forro") cambio.forro = true;
  }
  const igual = !problema && firmaDeVenta(f) === firmaDeVenta(conElCambio(f, cambio));
  return {
    nombre: nombreDeModelo(m),
    texto: textoDeComoSeVende(como),
    cambio: igual || problema ? null : cambio,
    problema: igual ? null : problema,
  };
}

/**
 * «Aplicar a todos los colocados con esta ficha en la sede»: lo de su ficha
 * en cada mueble colocado con ella (`loDeLaFicha`), en un solo cambio. Salta
 * los que tienen algo vendido que se movería o cambiaría cómo se ve
 * (`revisarCambioDePartes` frena o avisa: eso se hace de a uno, desde su
 * panel) y los que todavía no pueden (una góndola de un solo módulo), y los
 * nombra; los que ya se venden así quedan como están.
 */
export function aplicarLoDeLaFicha<T extends Mueble>(
  fixtures: readonly T[], modelo: string, estado: EstadoPorEspacio, sede: string,
): { fixtures: T[]; aplicados: string[]; saltados: string[]; sinPoder: string[] } {
  const aplicados: string[] = [];
  const saltados: string[] = [];
  const sinPoder: string[] = [];
  const nuevos = fixtures.map((f) => {
    if (!modelo || f.modelo !== modelo) return f;
    const ficha = loDeLaFicha(f);
    if (!ficha) return f;
    if (ficha.problema) { sinPoder.push(f.code); return f; }
    if (!ficha.cambio) return f;
    const r = revisarCambioDePartes(f, ficha.cambio, estado, sede);
    if (r.bloqueo || r.aviso) { saltados.push(f.code); return f; }
    aplicados.push(f.code);
    return conElCambio(f, ficha.cambio);
  });
  return { fixtures: nuevos, aplicados, saltados, sinPoder };
}

/** Los colocados con esa ficha en el plano (la sede de la pantalla), y
 *  cuántos todavía no se venden como ella dice. */
export function colocadosConLaFicha(fixtures: readonly Mueble[], modelo: string | null | undefined): { todos: number; distintos: number } {
  if (!modelo) return { todos: 0, distintos: 0 };
  const con = fixtures.filter((f) => f.modelo === modelo);
  return { todos: con.length, distintos: con.filter((f) => !!loDeLaFicha(f)?.cambio).length };
}
