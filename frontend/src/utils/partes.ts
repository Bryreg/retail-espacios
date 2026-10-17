import { CATALOGO_DE_MUEBLES, type ClaseDeParte, type PartesDeMueble } from "../catalogo/catalogo";
import { carasDe, fullSpaceCode } from "../types/espacio";
import {
  isRentable, rangeAvailability as dispoDeCara, rateTypeOf, referenceRateFor,
  type RangeAvailability, type ReferenceRates, type SpaceStatus,
} from "../types/fixtures";
import { LIBRE, type EstadoComercial, type EstadoPorEspacio } from "./estadoComercial";

/**
 * Vender por partes: la nevera entera o por puertas; el mural, la góndola, la
 * nevera abierta o la de vegetales, enteros o por tramos; la góndola y la
 * punta, enteras o por entrepaños. Y las PIEZAS de lo que nunca se vende
 * entero: cada bahía de impulso de una caja (`CAJ-04-BI1`, de izquierda a
 * derecha mirando la caja desde la fila) y el forro de una columna
 * (`COL-07-FO`). Una pieza no parte ninguna cara: no choca con nada más que
 * consigo misma, se ofrece aunque el mueble no sea comercializable (la caja y
 * la columna no lo son nunca) y su tarifa es la de su clase, sin respaldo.
 *
 * La dueña lo pidió así: **las marcas pagan la nevera entera o por puertas,
 * pero nunca las dos en las mismas fechas; dos puertas distintas, sí.** Y
 * eligió el código: `NEV-03-PU2` es la puerta 2 de la nevera `NEV-03`,
 * contando de izquierda a derecha mirando su frente. Queda para siempre en
 * contratos, correos, planillas y enlaces de montaje. Lo mismo con los tramos
 * (`GON-05-B-TR2`, de izquierda a derecha mirando esa cara) y los entrepaños
 * (`PUN-02-EN1` es la base, contando de abajo hacia arriba). Un mueble se
 * divide de UNA sola forma, y la cara entera siempre se puede vender.
 *
 * Una parte es un espacio más: una fila de `spaces` con su código derivado y
 * un contrato como cualquier otro. La relación entre la cara y sus partes se
 * DEDUCE del código (`partirCodigo`), sin columnas nuevas.
 *
 * Tres niveles: la FAMILIA (`muebles.json`, `tipos[t].partes.divisiones`)
 * dice de qué formas se puede dividir; el MODELO (de RECABRA o una ficha
 * propia) dice cuál usa y en cuántas; el MUEBLE del plano lo guarda estampado
 * en `partes` y es lo único que cuenta para vender. Sin `partes.division`, el
 * mueble se vende entero, como siempre.
 *
 * Y la PARTICIPACIÓN de una cara (`NAVE-GON-01-PC3`, `NAVE-GON-01-B-PC1`): el
 * porcentaje de la cara vendido a un proveedor. No es una división física ni
 * una pieza: `partesDe` no la enumera (sus números los da el servidor) y
 * `divisionDe` da `null` para la cara que se vende así. La cara se vende por
 * participación cuando el mueble dice `partes.division: "participacion"` y su
 * tipo tiene `superficie` en el catálogo (`porParticipacion`).
 *
 * Es el espejo de `backend/app/services/partes.py`. Los dos corren los casos
 * de `scripts/casos/partes.json` (`probar-partes.mjs`, `tests/test_partes.py`).
 *
 * El store NO importa este archivo: va en el pedazo de entrada y esto trae el
 * catálogo. Quien necesita el estado de una parte lo lee del mapa crudo
 * (`estadoComercial` del store) por su código completo.
 */

const P = CATALOGO_DE_MUEBLES.partes;

/** Una parte de una cara: su clase (`puertas`), su token (`PU`) y su número
 *  (1 es la de la izquierda mirando el frente). `n` es `null` en una pieza
 *  única (el forro de una columna, cuando llegue). */
export interface ParteRef { clase: string; token: string; n: number | null }

/** Un código de espacio, partido: el del mueble (con la sede si la traía), la
 *  cara y la parte (`null` es la cara entera). */
export interface CodigoPartido { base: string; cara: "A" | "B"; parte: ParteRef | null }

/** token → clase (`PU` → `puertas`). Sólo las clases que el catálogo tiene
 *  HOY: un `TR2` antes de que existan los tramos es parte del nombre. */
const CLASE_POR_TOKEN: ReadonlyMap<string, string> = new Map(
  Object.entries(P.clases).map(([clase, c]) => [c.token, clase]),
);

export function claseDe(clase: string): ClaseDeParte | undefined {
  return Object.prototype.hasOwnProperty.call(P.clases, clase) ? P.clases[clase] : undefined;
}

const normalizar = (x: unknown) => (x == null ? "" : String(x)).trim().toUpperCase();

/** `PU2`, `FO`: lo que la parte le agrega al código de la cara. */
export function sufijoDeParte(p: ParteRef): string {
  return p.n !== null ? `${p.token}${p.n}` : p.token;
}

/** El último tramo de un código, si es una parte de una clase que existe. */
export function parteDeSufijo(sufijo: string): ParteRef | null {
  const s = normalizar(sufijo);
  const m = /^([A-Z]{2})([1-9][0-9]?)$/.exec(s);
  if (m) {
    const clase = CLASE_POR_TOKEN.get(m[1]);
    if (clase && !P.clases[clase].unico) return { clase, token: m[1], n: Number(m[2]) };
    return null;
  }
  const clase = CLASE_POR_TOKEN.get(s);
  return clase && P.clases[clase].unico ? { clase, token: s, n: null } : null;
}

/**
 * `NAVE-NEV-03-PU2` → (`NAVE-NEV-03`, A, PU2); `GON-05-B` → (`GON-05`, B, entera).
 *
 * De derecha a izquierda y sin necesitar la sede: si el último tramo es una
 * parte de una clase que existe, es la parte; después, si lo que queda termina
 * en `-B`, es la cara B. Quien resuelve contra el plano prueba primero el
 * texto tal cual: esto es sólo la forma.
 */
export function partirCodigo(codigo: string): CodigoPartido {
  const c = normalizar(codigo);
  let parte: ParteRef | null = null;
  let resto = c;
  const corte = c.lastIndexOf("-");
  if (corte > 0) {
    parte = parteDeSufijo(c.slice(corte + 1));
    if (parte) resto = c.slice(0, corte);
  }
  if (resto.endsWith("-B") && resto.length > 2) return { base: resto.slice(0, -2), cara: "B", parte };
  return { base: resto, cara: "A", parte };
}

/** Al revés: (`NAVE-GON-05`, B, TR2) → `NAVE-GON-05-B-TR2`. La cara B va
 *  antes que la parte. */
export function codigoDeParte(base: string, cara: "A" | "B", parte: ParteRef | null): string {
  let c = normalizar(base);
  if (cara === "B") c += "-B";
  if (parte) c += `-${sufijoDeParte(parte)}`;
  return c;
}

/** ¿La parte divide la cara? Las piezas (bahía, forro) no. */
export function esDivision(p: ParteRef | null | undefined): boolean {
  return !!p && claseDe(p.clase)?.es === "division";
}

/** ¿Es una pieza de un mueble que no se vende entero (la bahía de impulso de
 *  una caja, el forro de una columna)? */
export function esPieza(p: ParteRef | null | undefined): boolean {
  return !!p && claseDe(p.clase)?.es === "pieza";
}

/** ¿Es una participación de la cara (`GON-01-PC3`: el porcentaje de la cara
 *  vendido a un proveedor)? No divide la cara físicamente ni es una pieza. Es
 *  `es_participacion` del servidor. */
export function esParticipacion(p: ParteRef | null | undefined): boolean {
  return !!p && claseDe(p.clase)?.es === "participacion";
}

const mismaParte = (a: ParteRef | null, b: ParteRef | null) =>
  a === b || (!!a && !!b && a.clase === b.clase && a.token === b.token && a.n === b.n);

/**
 * ¿Dos espacios no se pueden vender en fechas que se pisan? La misma regla que
 * `chocan` del servidor, con los mismos casos: el mismo espacio sí; la cara
 * entera y una de sus divisiones, sí; dos divisiones de la misma clase, no (dos
 * puertas distintas conviven); de clases distintas de la misma cara, sí (se
 * pisan); una pieza sólo consigo misma. Una participación choca con la cara
 * entera y con una división física de su cara, pero no con otra participación
 * (a ésas las frena la regla de capacidad) ni con una pieza. Se decide por los
 * códigos: quien manda es el servidor, esto es para avisar antes.
 */
export function chocan(a: CodigoPartido, b: CodigoPartido): boolean {
  if (a.base !== b.base || a.cara !== b.cara) return false;
  if (mismaParte(a.parte, b.parte)) return true;
  if (esParticipacion(a.parte) && esParticipacion(b.parte)) return false;
  if (!a.parte) return esDivision(b.parte) || esParticipacion(b.parte);
  if (!b.parte) return esDivision(a.parte) || esParticipacion(a.parte);
  if (esParticipacion(a.parte)) return esDivision(b.parte);
  if (esParticipacion(b.parte)) return esDivision(a.parte);
  return esDivision(a.parte) && esDivision(b.parte) && a.parte.clase !== b.parte.clase;
}

// ─── La configuración del mueble del plano ───────────────────────────────────

type ConPartes = {
  type: string;
  gondolaType?: string | null;
  rentable?: boolean;
  partes?: PartesDeMueble | null;
  /** Los entrepaños guardados: cuentan los `EN` (con la base). */
  entrepanos?: number | null;
};

const tipoBase = (tipo: string) => CATALOGO_DE_MUEBLES.alias[tipo]?.tipo ?? tipo;

/** Lo que el mueble guardó en ese campo de la ficha: adentro de `partes`
 *  (las puertas, los tramos) o en el mueble (los entrepaños), según
 *  `fichas.geometria` del catálogo. Es `valor_del_campo` del servidor. */
export function valorDelCampo(f: ConPartes, campo: string): unknown {
  const reglas = CATALOGO_DE_MUEBLES.fichas.geometria as Record<string, { enPartes: boolean } | undefined>;
  const regla = Object.prototype.hasOwnProperty.call(reglas, campo) ? reglas[campo] : undefined;
  if (!regla) return undefined;
  if (regla.enPartes) {
    const partes = f.partes as Record<string, unknown> | null | undefined;
    return partes && typeof partes === "object" ? partes[campo] : undefined;
  }
  return (f as Record<string, unknown>)[campo];
}

/** Cuántas partes de esa clase tiene la cara, o `null` si el mueble no lo
 *  dice bien: el campo que la cuenta es un entero dentro del rango de su
 *  familia, y con la base (los entrepaños) da al menos el mínimo de la clase.
 *  No se recorta ni se adivina: una góndola con 4 entrepaños guardados vende
 *  5 (la base, `EN1`, y los 4); sin entrepaños guardados, entera. */
export function cantidadDe(f: ConPartes, clase: string): number | null {
  const regla = claseDe(clase);
  // Una clase sin `campo` (la participación) no la cuenta el mueble.
  if (!regla || !regla.campo || !f) return null;
  const v = valorDelCampo(f, regla.campo);
  if (typeof v !== "number" || !Number.isInteger(v)) return null;
  const tipo = CATALOGO_DE_MUEBLES.tipos[tipoBase(f.type)];
  const rango = (tipo?.geometria as Record<string, [number, number]> | undefined)?.[regla.campo];
  if (rango && !(rango[0] <= v && v <= rango[1])) return null;
  const total = v + (regla.base ? 1 : 0);
  return total < regla.minimo ? null : total;
}

/** La forma en que se divide la cara y en cuántas, o `null` si se vende
 *  entera. Vale sólo una `division` que su familia admite, con su cuenta. */
export function divisionDe(f: ConPartes): { clase: string; n: number } | null {
  const clase = f.partes?.division;
  if (typeof clase !== "string") return null;
  const tipo = CATALOGO_DE_MUEBLES.tipos[tipoBase(f.type)];
  if (!tipo?.partes?.divisiones?.includes(clase)) return null;
  const n = cantidadDe(f, clase);
  return n === null ? null : { clase, n };
}

/** Las piezas que lleva un mueble de esa familia (`partes.piezas` del
 *  catálogo): la caja, sus bahías de impulso; la columna, su forro. */
export function piezasDeLaFamilia(tipo: string): string[] {
  return CATALOGO_DE_MUEBLES.tipos[tipoBase(tipo)]?.partes?.piezas ?? [];
}

/** Las PIEZAS que el mueble pone a la venta: `BI1`, `BI2` de una caja con
 *  dos bahías de impulso; `FO` de una columna forrada. Sólo las que su familia
 *  lleva (`partes.piezas` del catálogo) y con su campo bien escrito: un entero
 *  dentro del rango de la familia (las bahías) o un `true` (el forro). No
 *  dependen de que el mueble sea comercializable. Es `piezas_de` del servidor. */
export function piezasDe(f: ConPartes): ParteRef[] {
  if (!f) return [];
  const fuera: ParteRef[] = [];
  for (const clase of piezasDeLaFamilia(f.type)) {
    const regla = claseDe(clase);
    if (!regla || regla.es !== "pieza" || !regla.campo) continue;
    if (regla.unico) {
      if (valorDelCampo(f, regla.campo) === true) fuera.push({ clase, token: regla.token, n: null });
      continue;
    }
    const n = cantidadDe(f, clase);
    if (n) for (let k = 1; k <= n; k++) fuera.push({ clase, token: regla.token, n: k });
  }
  return fuera;
}

/** Las partes que el mueble pone a la venta, por cara: las divisiones de sus
 *  caras (un mueble no comercializable no ofrece ninguna: una división parte
 *  una cara que se vende) y, al final, sus PIEZAS, en la cara A (se ofrecen
 *  aunque el mueble no sea comercializable). Es `partes_de` del servidor. */
export function partesDe(f: ConPartes): { cara: "A" | "B"; parte: ParteRef }[] {
  const fuera: { cara: "A" | "B"; parte: ParteRef }[] = [];
  const div = isRentable(f) ? divisionDe(f) : null;
  if (div) {
    const token = P.clases[div.clase].token;
    const caras: ("A" | "B")[] = carasDe(f) === 2 ? ["A", "B"] : ["A"];
    for (const cara of caras) {
      for (let k = 1; k <= div.n; k++) fuera.push({ cara, parte: { clase: div.clase, token, n: k } });
    }
  }
  for (const parte of piezasDe(f)) fuera.push({ cara: "A", parte });
  return fuera;
}

/** ¿Se vende algo de este mueble? Sus caras, si es comercializable; si no,
 *  sus piezas (la caja con sus bahías de impulso, la columna con su forro). Es
 *  la compuerta de tocarlo en Vender. */
export function seVendeAlgo(f: ConPartes): boolean {
  return isRentable(f) || piezasDe(f).length > 0;
}

/** Los códigos COMPLETOS que el mueble pone a la venta: sus caras y sus
 *  partes. Un mueble que no es comercializable no da sus caras, pero sí sus
 *  piezas. Es `espacios_de` del servidor (`espacios_ofrecidos`). */
export function espaciosDe(f: ConPartes & { code: string; sede?: string }, sede: string): string[] {
  const code = normalizar(f.code);
  if (!code) return [];
  const completo = fullSpaceCode(f.sede || sede, code);
  const fuera: string[] = [];
  if (isRentable(f)) {
    fuera.push(completo);
    if (carasDe(f) === 2) fuera.push(`${completo}-B`);
  }
  for (const { cara, parte } of partesDe(f)) fuera.push(codigoDeParte(completo, cara, parte));
  return fuera;
}

/**
 * ¿La cara se vende por participación? Lo dice el mueble
 * (`partes.division === "participacion"`), su tipo tiene receta de superficie
 * (`superficie` en el catálogo) y es comercializable. Una sola forma de
 * dividir: vale para las dos caras de una doble. Es `por_participacion` del
 * servidor. `divisionDe` sigue dando `null` para ese mueble (no es una
 * división física) y `espaciosDe` da sus caras, no sus participaciones.
 */
export function porParticipacion(f: ConPartes): boolean {
  if (!f || f.partes?.division !== "participacion") return false;
  const tipo = tipoBase(String(f.type ?? ""));
  const familia = Object.prototype.hasOwnProperty.call(CATALOGO_DE_MUEBLES.tipos, tipo)
    ? CATALOGO_DE_MUEBLES.tipos[tipo] : undefined;
  return !!familia?.superficie && isRentable(f);
}

/** Los códigos COMPLETOS de las caras que se venden por participación
 *  (`NAVE-GON-01`, `NAVE-GON-01-B`), armados con la sede que se pasa: la del
 *  plano, nunca el campo `sede` del mueble, como `caras_por_participacion` del
 *  servidor. Una participación (`…-PC3`) se ofrece si su cara está acá. */
export function carasPorParticipacion(
  fixtures: readonly (ConPartes & { code: string })[], sede: string,
): Set<string> {
  const caras = new Set<string>();
  for (const f of fixtures) {
    if (!f || typeof f !== "object" || !porParticipacion(f)) continue;
    const code = normalizar(f.code);
    if (!code) continue;
    const completo = fullSpaceCode(sede, code);
    caras.add(completo);
    if (carasDe(f) === 2) caras.add(`${completo}-B`);
  }
  return caras;
}

/** Lo que decide DÓNDE cae cada parte vendida, por clase: la cantidad de la
 *  división, o de las piezas (las bahías parten la mesa en partes iguales), o
 *  1 si tiene el forro. Sólo las clases con lugar físico (divisiones y
 *  piezas): una participación no cae en un lugar fijo del mueble, y la firma
 *  de siempre no cambia. Es `firma_de_partes` del servidor. */
export function firmaDePartes(f: ConPartes): Record<string, number | null> {
  const div = divisionDe(f);
  const firma: Record<string, number | null> = Object.fromEntries(
    Object.entries(P.clases).filter(([, c]) => c.es === "division" || c.es === "pieza")
      .map(([clase]) => [clase, div && div.clase === clase ? div.n : null]));
  for (const p of piezasDe(f)) firma[p.clase] = Math.max(firma[p.clase] ?? 0, p.n ?? 1);
  return firma;
}

/** De `partes`, sólo lo conocido y con su tipo: lo que dicen las reglas de la
 *  ficha (`fichas.geometria` con `enPartes`). Lo usa `sinDatosComerciales`: un
 *  objeto entero en una lista blanca se llevaría lo que le escriban adentro. */
export function partesTipadas(partes: unknown): PartesDeMueble | undefined {
  if (!partes || typeof partes !== "object" || Array.isArray(partes)) return undefined;
  const fuera: Record<string, unknown> = {};
  for (const [campo, regla] of Object.entries(CATALOGO_DE_MUEBLES.fichas.geometria)) {
    if (!regla.enPartes) continue;
    const v = (partes as Record<string, unknown>)[campo];
    if (regla.valores) {
      if (typeof v === "string" && claseDe(v)) fuera[campo] = v;
    } else if (regla.booleano) {
      if (typeof v === "boolean") fuera[campo] = v;
    } else if (typeof v === "number" && Number.isFinite(v) && (!regla.entero || Number.isInteger(v))) {
      fuera[campo] = v;
    }
  }
  return Object.keys(fuera).length ? (fuera as PartesDeMueble) : undefined;
}

// ─── Lo que dice la ficha ────────────────────────────────────────────────────

/** Cómo se vende lo que se coloque desde una FICHA (un modelo de RECABRA o una
 *  ficha propia del supermercado): la forma de dividir la cara y en cuántas
 *  partes, y las piezas que vende. */
export interface ComoSeVende {
  /** `puertas`, `tramos` o `entrepanos`; `null`: la cara se vende entera. */
  division: string | null;
  /** Cuántas partes por cara (con la base, en los entrepaños), o `null` si
   *  se cuentan en el plano: los tramos de una góndola, uno por módulo (su
   *  ficha es UN módulo; cuántos tiene depende del largo del corrido). */
  n: number | null;
  /** Las piezas de lo que no se vende entero: las bahías de impulso de una
   *  caja (`n` cuántas) y el forro de una columna (`n` es `null`: uno solo). */
  piezas: { clase: string; n: number | null }[];
}

/**
 * Cómo se vende lo que se coloque desde esa ficha, con las MISMAS reglas que
 * cuentan las partes de un mueble del plano (`divisionDe`, `cantidadDe`,
 * `piezasDe`): una ficha es lo que se le estampa al mueble. `null` si la
 * ficha no dice nada de partes (se vende entera, como siempre) o lo dice mal.
 * No mira si es comercializable: eso es del mueble colocado.
 */
export function comoSeVendeLaFicha(
  m: { tipo: string; partes?: PartesDeMueble | null; entrepanos?: number | null },
): ComoSeVende | null {
  if (!m || typeof m.tipo !== "string") return null;
  const f: ConPartes = { type: m.tipo, partes: m.partes ?? null, entrepanos: m.entrepanos ?? null };
  const familia = CATALOGO_DE_MUEBLES.tipos[tipoBase(m.tipo)];
  let division: string | null = null;
  let n: number | null = null;
  const pedida = m.partes?.division;
  if (typeof pedida === "string" && familia?.partes?.divisiones?.includes(pedida)) {
    if (familia.partes.seCuentanEnElPlano?.includes(pedida)) {
      division = pedida;
    } else {
      const cuantas = cantidadDe(f, pedida);
      if (cuantas !== null) { division = pedida; n = cuantas; }
    }
  }
  const piezas: { clase: string; n: number | null }[] = [];
  for (const p of piezasDe(f)) {
    const ya = piezas.find((x) => x.clase === p.clase);
    if (ya) ya.n = Math.max(ya.n ?? 0, p.n ?? 0);
    else piezas.push({ clase: p.clase, n: p.n });
  }
  return division || piezas.length ? { division, n, piezas } : null;
}

/** Lo que dice esa ficha de cómo se vende, en palabras. `corto` es lo que
 *  acompaña al nombre en las paletas («por puertas», «2 bahías de impulso»);
 *  si no, lo que lee el panel del plano («entera o por puertas (3)»). */
export function textoDeComoSeVende(c: ComoSeVende, { corto = false }: { corto?: boolean } = {}): string {
  const dichos: string[] = [];
  if (c.division) {
    const regla = claseDe(c.division);
    const plural = regla?.plural ?? c.division;
    if (corto) dichos.push(`por ${plural}`);
    else if (c.n === null) dichos.push(`entera o por ${plural}, ${concordancia(c.division).un === "un" ? "uno" : "una"} por módulo`);
    else dichos.push(`entera o por ${plural} (${c.n}${regla?.base ? ", con la base" : ""})`);
  }
  for (const p of c.piezas) {
    const regla = claseDe(p.clase);
    if (!regla) continue;
    if (p.n === null) dichos.push(corto ? `con ${regla.singular}` : `${concordancia(p.clase).el} ${regla.singular} se vende`);
    else dichos.push(`${p.n} ${p.n === 1 ? regla.singular : regla.plural}`);
  }
  return dichos.join(corto ? " · " : "; ");
}

/** Lo que acompaña al nombre de un modelo en las paletas del plano 2D y del
 *  Editor 3D: `{ comoSeVende: "por puertas" }`, o nada si se vende entera. */
export function comoSeVendeCorto(
  m: { tipo: string; partes?: PartesDeMueble | null; entrepanos?: number | null },
): { comoSeVende?: string } {
  const como = comoSeVendeLaFicha(m);
  return como ? { comoSeVende: textoDeComoSeVende(como, { corto: true }) } : {};
}

// ─── Cómo se dice ────────────────────────────────────────────────────────────

/** Las palabras que concuerdan con la clase: «una puerta vendida, la otra,
 *  esta», «un tramo vendido, el otro, este». Del catálogo (`genero`); es
 *  `concordancia` del servidor. */
export function concordancia(clase: string): { un: string; el: string; los: string; o: string; este: string } {
  const f = claseDe(clase)?.genero !== "m";
  return f
    ? { un: "una", el: "la", los: "las", o: "a", este: "esta" }
    : { un: "un", el: "el", los: "los", o: "o", este: "este" };
}

/** `Puerta 2 de 3`; sin el «de» si no se sabe cuántas hay. */
export function textoDeParte(p: ParteRef, de?: number | null): string {
  const regla = claseDe(p.clase);
  const s = regla?.singular ?? p.token;
  const nombre = s.charAt(0).toUpperCase() + s.slice(1);
  if (p.n === null) return nombre;
  return `${nombre} ${p.n}${de ? ` de ${de}` : ""}`;
}

/** Lo que lee la mercaderista: cuál es, contada desde dónde. Los entrepaños,
 *  de abajo hacia arriba con la base como el 1; las bahías de una caja,
 *  mirándola desde la fila; el forro, que es uno solo, con el nombre de los
 *  informes («Forro de columna»). Es `texto_para_montar` del servidor. */
export function textoParaMontar(p: ParteRef, de?: number | null): string {
  const texto = textoDeParte(p, de);
  const regla = claseDe(p.clase);
  if (p.n === null) {
    const nombre = regla?.informe || regla?.singular || p.token;
    return nombre.charAt(0).toUpperCase() + nombre.slice(1);
  }
  if (regla?.eje === "ancho") return `${texto}, contando de izquierda a derecha mirando ${regla.mirando || "el frente"}`;
  if (regla?.eje === "alto") return `${texto}, contando de abajo hacia arriba${regla.base ? " (el 1 es la base)" : ""}`;
  return texto;
}

/** Cómo se lee el código de un espacio en pantalla: `NEV-03·PU2`,
 *  `GON-05·B·TR2`, `GON-60·A`. El de la base sigue siendo el que es. */
export function codigoVisibleDe(code: string, cara: "A" | "B", doble: boolean, parte: ParteRef | null): string {
  const partes = [code];
  if (doble) partes.push(cara);
  if (parte) partes.push(sufijoDeParte(parte));
  return partes.length === 1 ? code : partes.join("·");
}

// ─── Dónde cae cada parte ────────────────────────────────────────────────────

/**
 * Qué vano del DIBUJO es la parte `k` de `n` de esa cara.
 *
 * Se cuenta de izquierda a derecha mirando el frente de esa cara. El frente de
 * la A mira a −Z local (`normalDeCara` en `utils/planta.ts`) y, parado ahí, la
 * izquierda es +X; el de la B mira a +Z y la izquierda es −X. Los editores
 * dibujan de −X a +X (`NeveraReal` pone la hoja 0 en `−w/2`), así que la `PU1`
 * de la cara A es la hoja de dibujo `n − 1`. `probar-partes` lo comprueba
 * proyectando con la cámara de `vistaDeCara`.
 */
export function vanoDeParte(cara: "A" | "B", k: number, n: number): number {
  return cara === "A" ? n - k : k - 1;
}

/**
 * Qué vano del dibujo DE LA CARA es la parte `k` de `n`: el índice en los
 * vanos con que se para el producto de esa cara (`unidadesDePrueba`).
 *
 * No es `vanoDeParte`: el producto de la cara B se dibuja en un grupo girado
 * media vuelta (`ProductoDePrueba`, `hacia: 1`), así que en SU dibujo el
 * frente también mira a −Z y la izquierda de quien la mira es +X, como en la
 * A. En las dos caras es `n − k`; en el mueble, la B es la del espejo
 * (`vanoDeParte`). `probar-partes` lo comprueba con la cámara de las dos.
 */
export function vanoEnLaCara(_cara: "A" | "B", k: number, n: number): number {
  return n - k;
}

/** Dónde cae la parte `k` de `n` de esa cara a lo ancho del mueble, como
 *  fracción de su largo medida desde −X (`[desde, hasta]`). Es la cuenta con
 *  que el plano 2D marca las juntas y las partes vendidas, y con que se ve qué
 *  espacio interno cae en qué tramo. */
export function fraccionDeParte(cara: "A" | "B", k: number, n: number): [number, number] {
  const i = vanoDeParte(cara, k, n);
  return [i / n, (i + 1) / n];
}

/**
 * Dónde va, en planta, el punto rojo de cada división vendida a lo ancho
 * (puertas, tramos), del mapa crudo de la base: a lo largo del mueble como
 * fracción de su largo desde el centro (`a`, de −½ a ½, hacia +X del mueble)
 * y de qué lado (`lado`: −1 el frente de la cara A, +1 el de la B). Con
 * `fraccionDeParte`, la cuenta del mueble: el TR1 de la B cae a la izquierda
 * de quien mira la B, que es la derecha del mueble. Los entrepaños (a lo alto)
 * no tienen punto: en planta no se ven.
 */
export function puntosDePartesVendidas(
  f: ConPartes & { code: string; sede?: string }, estado: EstadoPorEspacio, sede: string,
): { cara: "A" | "B"; parte: ParteRef; a: number; lado: -1 | 1 }[] {
  const div = divisionDe(f);
  if (!div || claseDe(div.clase)?.eje !== "ancho") return [];
  const completo = fullSpaceCode(f.sede || sede, f.code);
  return partesDe(f)
    .filter(({ cara, parte }) => esDivision(parte)
      && estado[codigoDeParte(completo, cara, parte)]?.status === "occupied")
    .map(({ cara, parte }) => {
      const [t0, t1] = fraccionDeParte(cara, parte.n ?? 1, div.n);
      return { cara, parte, a: (t0 + t1) / 2 - 0.5, lado: cara === "A" ? -1 : 1 };
    });
}

/** Las juntas entre parte y parte a lo ancho (puertas, tramos), como
 *  fracciones del largo del mueble. Sin división a lo ancho, ninguna: los
 *  entrepaños se cuentan de abajo hacia arriba y no se ven desde arriba. */
export function juntasDePartes(f: ConPartes): number[] {
  const div = divisionDe(f);
  if (!div || claseDe(div.clase)?.eje !== "ancho") return [];
  return Array.from({ length: div.n - 1 }, (_, i) => (i + 1) / div.n);
}

/** La fila de producto (de abajo hacia arriba, la base es la 0) de un
 *  entrepaño `EN k`: `EN1` es la base. */
export function filaDeEntrepano(k: number): number {
  return k - 1;
}

/**
 * Qué le marca el visor de Vender al proveedor en una cara del contrato, por
 * los sufijos de sus renglones (`["PU2"]`, `["TR1", "TR3"]`, `["BI1"]`):
 *
 * · las divisiones a lo ancho (puertas, tramos), por el vano del dibujo DE LA
 *   CARA (`vanoEnLaCara`: el producto de la B se dibuja girado);
 * · los entrepaños, por su fila (`filaDeEntrepano`: el `EN1` es la base, la 0);
 * · una pieza (la bahía de una caja), por el nicho del dibujo, que va de −X a
 *   +X (`vanoDeParte` de la cara A: la BI1 mirando desde la fila es la de +X);
 *   el forro, el 0.
 *
 * Vacío con la cara entera. `dePiezas` dice que es una pieza: no prueba
 * producto, sólo se marca su lugar. Era una cuenta suelta en `ModoVender` y
 * tres mutaciones que le mostraban al proveedor OTRA parte (el tramo de la B
 * espejado, el entrepaño una fila más arriba, la bahía del otro lado) pasaban
 * todas las pruebas: ahora la prueban `probar-partes` con la cámara de venta.
 */
export function marcasDelContrato(
  f: ConPartes, cara: "A" | "B", sufijos: string[],
): { vanos: number[]; filas: number[]; dePiezas: boolean } {
  const div = divisionDe(f);
  const piezas = piezasDe(f);
  const partes = sufijos.map((x) => parteDeSufijo(x));
  if (!div && piezas.length) {
    const nBahias = piezas.filter((p) => p.clase === "bahias").length;
    const vanos = partes.filter((p): p is ParteRef => !!p && esPieza(p))
      .map((p) => (p.n === null ? 0 : vanoDeParte("A", p.n, nBahias)));
    return { vanos, filas: [], dePiezas: true };
  }
  const n = div?.n ?? 0;
  const delRenglon = partes.filter((p): p is ParteRef & { n: number } =>
    !!p && p.n !== null && n > 0 && p.clase === div?.clase);
  const porAlto = claseDe(div?.clase ?? "")?.eje === "alto";
  return {
    vanos: porAlto ? [] : delRenglon.map((p) => vanoEnLaCara(cara, p.n, n)),
    filas: porAlto ? delRenglon.map((p) => filaDeEntrepano(p.n)) : [],
    dePiezas: false,
  };
}

// ─── La tarifa ───────────────────────────────────────────────────────────────

/** Al peso más cercano, con los medios hacia arriba, como `redondear` del
 *  servidor (`Math.round` y `round` de Python no redondean igual los medios). */
export function redondear(x: number): number {
  return Math.floor(x + 0.5);
}

export type OrigenDeTarifa = "cara" | "clase" | "cara/n" | "";

/**
 * La tarifa de referencia de un espacio y de dónde salió: la cara entera, la
 * de su mueble (`rateTypeOf`); una división, la de su clase (`parte_puerta`)
 * y, si está vacía, la de la cara dividida por la cantidad de partes; una
 * pieza, la de su clase, sin respaldo. Una participación no tiene referencia
 * propia: compararla con la tarifa de la cara la listaría «75 % por debajo»
 * (el mismo error que cuenta `tarifaDeLaFila` para las puertas); la de la cara
 * se pide para la cara (`parte = null`). Es `referencia_de_espacio` del servidor.
 *
 * Pregunta la tarifa del mueble (`rateTypeOf`): quien la llama desde un
 * `useMemo` pone `fichasPropias` en las dependencias.
 */
export function tarifaDeEspacio(
  rates: ReferenceRates | null, sede: string,
  f: ConPartes & { modelo?: string | null }, parte: ParteRef | null,
): { valor: number | null; origen: OrigenDeTarifa } {
  const deLaCara = rateTypeOf(f);
  if (!parte) return { valor: referenceRateFor(rates, sede, deLaCara), origen: "cara" };
  if (esParticipacion(parte)) return { valor: null, origen: "" };
  const regla = claseDe(parte.clase);
  if (!regla?.tarifa) return { valor: null, origen: "" };
  const propia = referenceRateFor(rates, sede, regla.tarifa);
  if (propia !== null) return { valor: propia, origen: "clase" };
  if (regla.es !== "division") return { valor: null, origen: "" };
  const n = cantidadDe(f, parte.clase);
  const base = referenceRateFor(rates, sede, deLaCara);
  if (base === null || !n) return { valor: null, origen: "" };
  return { valor: redondear(base / n), origen: "cara/n" };
}

/** La tarifa de referencia de una fila de Supervisar (una cara o una parte
 *  vendida): la de ESA parte, nunca la del mueble entero. «Bajo la tarifa» y
 *  la franja la preguntan por acá; pasarle `null` en vez de la parte listaba
 *  cada puerta un 67 % por debajo de la referencia y nada fallaba. */
export function tarifaDeLaFila(
  rates: ReferenceRates | null, sede: string,
  fila: { fixture: ConPartes & { modelo?: string | null; sede?: string }; parte?: ParteRef | null },
): { valor: number | null; origen: OrigenDeTarifa } {
  return tarifaDeEspacio(rates, fila.fixture.sede || sede, fila.fixture, fila.parte ?? null);
}

/** El índice de partes de un mapa de la base, uno por mapa: cada renglón de
 *  Vender lo pide y el mapa cambia sólo cuando llega otro. */
const INDICES = new WeakMap<EstadoPorEspacio, IndiceDePartes>();
function indiceDe(estado: EstadoPorEspacio): IndiceDePartes {
  let i = INDICES.get(estado);
  if (!i) { i = indiceDePartes(estado); INDICES.set(estado, i); }
  return i;
}

/**
 * Lo comercial de un renglón del contrato en Vender: su código, la tarifa de
 * referencia de ESE espacio (una puerta, la de su clase o la de la nevera ÷
 * puertas) y si se puede vender en el periodo mirando lo que choca con él (la
 * nevera entera para una puerta, las puertas para la entera), con el porqué.
 * Sin partes es la cuenta de siempre: la de la cara.
 *
 * Arma el índice de partes del mismo mapa que recibe: armado aparte en la
 * pantalla, un índice vacío dejaba el renglón de la nevera entera «libre» con
 * puertas vendidas, y sólo el servidor lo frenaba al validar.
 */
export function comercialDelEspacio(
  fixture: ConPartes & MuebleConEstado & { modelo?: string | null }, cara: "A" | "B", sufijo: string | null,
  ctx: { rates: ReferenceRates | null; sede: string; estado: EstadoPorEspacio; desde: Date; hasta: Date },
): {
  parte: ParteRef | null; corto: string; codigo: string;
  ref: number | null; origenRef: OrigenDeTarifa;
  disponibilidad: RangeAvailability; porQue: "propio" | "entera" | "partes" | null;
} {
  const parte = sufijo ? parteDeSufijo(sufijo) : null;
  const corto = codigoDeParte(fixture.code, cara, parte);
  const sedeDe = fixture.sede || ctx.sede;
  const tarifa = tarifaDeEspacio(ctx.rates, sedeDe, fixture, parte);
  const indice = indiceDe(ctx.estado);
  return {
    parte, corto, codigo: fullSpaceCode(sedeDe, corto),
    ref: tarifa.valor, origenRef: tarifa.origen,
    disponibilidad: disponibilidadDeEspacio(fixture, cara, parte, ctx.estado, indice, ctx.sede, ctx.desde, ctx.hasta),
    porQue: porQueNoEstaLibre(fixture, cara, parte, ctx.estado, indice, ctx.sede, ctx.desde, ctx.hasta),
  };
}

/** ¿El nombre termina como el código de una parte o de la cara B? Un mueble
 *  no puede llamarse así: su código se confundiría con el de una parte. */
export function terminaReservado(nombre: string): boolean {
  const c = normalizar(nombre);
  const corte = c.lastIndexOf("-");
  if (corte <= 0) return false;
  const m = /^([A-Z]{1,2})([0-9]*)$/.exec(c.slice(corte + 1));
  return !!m && P.reservados.includes(m[1]);
}

// ─── Lo que va en el contrato y lo que muestra el plano ──────────────────────

/** La llave con que el plano, la tarifa, la escalera y la ficha nombran un
 *  espacio: `${id}-${cara}` para la cara, `${id}-${cara}-PU2` para una parte. */
export function claveDeEspacio(id: string, cara: "A" | "B", parte?: string | null): string {
  return parte ? `${id}-${cara}-${parte}` : `${id}-${cara}`;
}

/** Al revés de `claveDeEspacio`. Un `id` puede tener guiones: se parte desde
 *  la derecha, y la cara es la letra que queda antes de la parte. */
export function partirClave(clave: string): { id: string; cara: "A" | "B"; parte: string | null } {
  const tramos = clave.split("-");
  let parte: string | null = null;
  if (tramos.length >= 3 && tramos[tramos.length - 1] !== "A" && tramos[tramos.length - 1] !== "B") {
    parte = tramos.pop()!;
  }
  const cara = tramos.pop() === "B" ? "B" : "A";
  return { id: tramos.join("-"), cara, parte };
}

/** Un espacio del contrato que se está armando: el mueble, la cara y, si es
 *  una parte, su sufijo (`PU2`). */
export interface EnContrato { id: string; face: "A" | "B"; parte?: string }

/**
 * Tocar un mueble en el plano de Vender: lo suma al contrato o, tocado de
 * nuevo, lo saca. Lo que no se vende vacía el contrato (la ficha explica por
 * qué), como siempre.
 *
 * · Un mueble comercializable suma su CARA ENTERA (la que se tocó); las
 *   partes se prenden en el renglón («Entera · PU1 · PU2…»).
 * · Una caja o una columna, que nunca se venden enteras, suman su primera
 *   PIEZA libre en el periodo (`libre`; si ninguna, la primera): la BI1, o la
 *   que siga, o el forro. Nunca la caja entera, que el servidor rechaza.
 */
export function alTocarEnVender(
  lista: EnContrato[], f: ConPartes & { id: string }, cara: "A" | "B", libre: (p: ParteRef) => boolean,
): EnContrato[] {
  if (!seVendeAlgo(f)) return [];
  if (!isRentable(f)) {
    const piezas = piezasDe(f);
    const primera = piezas.find(libre) ?? piezas[0];
    return lista.some((x) => x.id === f.id)
      ? lista.filter((x) => x.id !== f.id)
      : [...lista, { id: f.id, face: "A", parte: sufijoDeParte(primera) }];
  }
  return lista.some((x) => x.id === f.id && x.face === cara)
    ? lista.filter((x) => !(x.id === f.id && x.face === cara))
    : [...lista, { id: f.id, face: cara }];
}

/** Los interruptores de una cara en el renglón de Vender: «Entera» (`null`)
 *  si el mueble se vende entero, y después cada parte de esa cara. Una caja o
 *  una columna, que nunca se venden enteras, ofrecen sólo sus piezas («BI1 ·
 *  BI2», sin «Entera»). Vacío si la cara no tiene partes: no hay nada que
 *  elegir. */
export function interruptoresDeLaCara(f: ConPartes, cara: "A" | "B"): (string | null)[] {
  const partes = partesDe(f).filter((p) => p.cara === cara).map((p) => sufijoDeParte(p.parte));
  return partes.length === 0 ? [] : [...(isRentable(f) ? [null] : []), ...partes];
}

const mismo = (a: EnContrato, b: EnContrato) =>
  a.id === b.id && a.face === b.face && (a.parte ?? null) === (b.parte ?? null);

/**
 * Sumar o sacar un espacio del contrato, con la regla de la dueña: prender una
 * división apaga la cara entera (de ese mueble y esa cara) y prender la entera
 * apaga sus divisiones. Divisiones distintas conviven. Lo demás, intacto.
 */
export function alternarParte(lista: EnContrato[], item: EnContrato): EnContrato[] {
  if (lista.some((x) => mismo(x, item))) return lista.filter((x) => !mismo(x, item));
  const yo = { base: item.id, cara: item.face, parte: item.parte ? parteDeSufijo(item.parte) : null };
  const sigue = lista.filter((x) => {
    if (x.id !== item.id || x.face !== item.face) return true;
    const otro = { base: x.id, cara: x.face, parte: x.parte ? parteDeSufijo(x.parte) : null };
    return !chocan(yo, otro);
  });
  return [...sigue, item];
}

// ─── La disponibilidad, con lo que choca ─────────────────────────────────────

/** Lo que la base sabe de ese código, o LIBRE: primero el completo y después
 *  el pelado, como `loSuyo` de la fusión. */
function loSuyo(estado: EstadoPorEspacio, completo: string, corto: string): EstadoComercial {
  return estado[completo] ?? estado[corto] ?? LIBRE;
}

/** Las partes con algo dicho en el mapa crudo, por el código de su cara:
 *  `NAVE-NEV-03` → [{PU2, su estado}]. Se arma una vez por mapa. */
export type IndiceDePartes = ReadonlyMap<string, { partido: CodigoPartido; estado: EstadoComercial }[]>;

export function indiceDePartes(estado: EstadoPorEspacio): IndiceDePartes {
  const indice = new Map<string, { partido: CodigoPartido; estado: EstadoComercial }[]>();
  for (const [codigo, e] of Object.entries(estado)) {
    const partido = partirCodigo(codigo);
    if (!partido.parte) continue;
    const cara = codigoDeParte(partido.base, partido.cara, null);
    indice.set(cara, [...(indice.get(cara) ?? []), { partido, estado: e }]);
  }
  return indice;
}

const GRAVEDAD: Record<RangeAvailability, number> = { libre: 0, parcial: 1, tomado: 2 };

/** La disponibilidad de lo que dice la base de un espacio en el periodo: la
 *  misma `rangeAvailability` de las caras (el mapa crudo trae el estado como
 *  texto). */
const rangeAvailability = (e: EstadoComercial, desde: Date, hasta: Date): RangeAvailability =>
  dispoDeCara({ status: e.status as SpaceStatus, startDate: e.startDate, endDate: e.endDate }, desde, hasta);
const peor = (a: RangeAvailability, b: RangeAvailability) => (GRAVEDAD[b] > GRAVEDAD[a] ? b : a);

/** Lo comercial que un mueble del plano trae pegado por la fusión
 *  (`fusionarEstadoComercial`): la cara A arriba, la B en `faceB`. */
type DatosDeLaFusion = { status?: unknown; startDate?: unknown; endDate?: unknown };
export type MuebleConEstado = {
  code: string; sede?: string;
  status?: unknown; startDate?: unknown; endDate?: unknown;
  faceB?: DatosDeLaFusion | null;
};

/**
 * El estado propio de un espacio del mueble (la cara o una parte).
 *
 * La CARA se lee de lo que el mueble trae pegado por la fusión, si lo trae:
 * es lo que el plano leyó siempre (también con la copia guardada, antes de
 * que llegue el mapa de la base o si no llega), así que un mueble sin partes
 * se pinta y se vende exactamente como antes. Una PARTE no está en el mueble:
 * se lee del mapa crudo, por su código.
 */
export function estadoDeEspacio(
  f: MuebleConEstado, cara: "A" | "B", parte: ParteRef | null,
  estado: EstadoPorEspacio, sede: string,
): EstadoComercial {
  if (!parte) {
    const d: DatosDeLaFusion | null | undefined = cara === "B" ? f.faceB : f;
    if (d && typeof d.status === "string") {
      return {
        ...LIBRE, status: d.status,
        startDate: typeof d.startDate === "string" ? d.startDate : "",
        endDate: typeof d.endDate === "string" ? d.endDate : "",
      };
    }
  }
  const corto = codigoDeParte(f.code, cara, parte);
  return loSuyo(estado, fullSpaceCode(f.sede || sede, corto), corto);
}

/**
 * Si un espacio se puede vender en el periodo: lo suyo y lo que choca con él
 * (la cara entera para una puerta; las puertas para la cara entera). Sin
 * nombres: dice «tomado», nunca de quién.
 */
export function disponibilidadDeEspacio(
  f: MuebleConEstado, cara: "A" | "B", parte: ParteRef | null,
  estado: EstadoPorEspacio, indice: IndiceDePartes, sede: string, desde: Date, hasta: Date,
): RangeAvailability {
  let d = rangeAvailability(estadoDeEspacio(f, cara, parte, estado, sede), desde, hasta);
  // La cara entera vendida tapa todas sus divisiones.
  if (esDivision(parte)) d = peor(d, rangeAvailability(estadoDeEspacio(f, cara, null, estado, sede), desde, hasta));
  // Y lo vendido por partes de esa cara (el índice está por el código de la
  // cara: base y cara son las mismas), con la regla de `chocan`.
  const caraCompleta = fullSpaceCode(f.sede || sede, codigoDeParte(f.code, cara, null));
  const mio: CodigoPartido = { base: "", cara, parte };
  for (const otro of indice.get(caraCompleta) ?? []) {
    if (mismaParte(otro.partido.parte, parte)) continue;
    if (chocan(mio, { base: "", cara, parte: otro.partido.parte })) {
      d = peor(d, rangeAvailability(otro.estado, desde, hasta));
    }
  }
  return d;
}

/**
 * Cómo se pinta una CARA en el plano y en la lista de precios, mirando sus
 * partes: «tomado» si está vendida entera o vendidas todas sus divisiones en
 * el periodo; «parcial» si hay algo vendido (días o partes): se puede vender
 * una parte; «libre» si no hay nada. Un mueble sin divisiones da exactamente
 * lo de `rangeAvailability` de la cara.
 */
export function disponibilidadDeCara(
  f: ConPartes & MuebleConEstado, cara: "A" | "B",
  estado: EstadoPorEspacio, indice: IndiceDePartes, sede: string, desde: Date, hasta: Date,
): RangeAvailability {
  const entera = rangeAvailability(estadoDeEspacio(f, cara, null, estado, sede), desde, hasta);
  const caraCompleta = fullSpaceCode(f.sede || sede, codigoDeParte(f.code, cara, null));
  // Sólo las divisiones: una pieza (la bahía de una caja) no es de ninguna
  // cara que se venda entera.
  const divisiones = partesDe(f).filter((p) => p.cara === cara && esDivision(p.parte));
  const conAlgo = (indice.get(caraCompleta) ?? []).filter((o) => esDivision(o.partido.parte));
  if (entera === "tomado") return "tomado";
  if (divisiones.length === 0 && conAlgo.length === 0) return entera;
  const deCadaUna = divisiones.map(({ parte }) =>
    rangeAvailability(estadoDeEspacio(f, cara, parte, estado, sede), desde, hasta));
  if (deCadaUna.length > 0 && deCadaUna.every((x) => x === "tomado")) return "tomado";
  const algo = conAlgo.some((o) => rangeAvailability(o.estado, desde, hasta) !== "libre");
  return entera !== "libre" || algo ? "parcial" : "libre";
}

/**
 * Cuántas divisiones de una cara están vendidas en el periodo, cuando la cara
 * está «parcial» POR SUS PARTES y no por sus días: el rótulo del plano y la
 * lista de precios dicen «1 de 3 puertas vendida» en vez de «libre 14 oct»,
 * que leía como que la nevera entera se libera hoy (el recorrido en el
 * navegador, 2026-10-14). `null` si la cara tiene días tomados ella misma —ahí
 * la fecha en que se libera es la respuesta— o si no hay división vendida.
 * Una cuenta, sin nombres ni plata: vale para la pantalla de Vender.
 */
export function partesVendidasDeLaCara(
  f: ConPartes & MuebleConEstado, cara: "A" | "B",
  estado: EstadoPorEspacio, sede: string, desde: Date, hasta: Date,
): { vendidas: number; de: number; clase: string } | null {
  if (rangeAvailability(estadoDeEspacio(f, cara, null, estado, sede), desde, hasta) !== "libre") return null;
  return divisionesVendidas(f, cara, estado, sede, desde, hasta);
}

/** Cuántas divisiones de la cara tienen días tomados en el periodo, sin mirar
 *  la cara entera. `null` si ninguna. */
function divisionesVendidas(
  f: ConPartes & MuebleConEstado, cara: "A" | "B",
  estado: EstadoPorEspacio, sede: string, desde: Date, hasta: Date,
): { vendidas: number; de: number; clase: string } | null {
  const divisiones = partesDe(f).filter((p) => p.cara === cara && esDivision(p.parte));
  const vendidas = divisiones.filter(({ parte }) =>
    rangeAvailability(estadoDeEspacio(f, cara, parte, estado, sede), desde, hasta) !== "libre").length;
  return vendidas > 0 ? { vendidas, de: divisiones.length, clase: divisiones[0].parte.clase } : null;
}

/**
 * Los días del periodo en que la CARA ENTERA se puede vender: ni ella ni nada
 * de lo que choca con ella (una puerta, un tramo, un entrepaño) está tomado
 * ese día —`disponibilidadDeEspacio` de la entera, día por día—. Sin partes
 * es exactamente `primerDiaLibre` de Supervisar (los días de la cara).
 *
 * La revisión de la rama (2026-10-14): con la entera vendida del 15 al 20 y
 * la puerta 2 del 21 en adelante, el plano y la lista de precios decían «libre
 * 21 oct» —miraban sólo los días de la cara— y ese día la entera no se puede
 * vender. «Cuándo se libera» ya lo contaba bien; ahora es la misma cuenta.
 */
export function diasLibresDeLaCara(
  f: ConPartes & MuebleConEstado, cara: "A" | "B",
  estado: EstadoPorEspacio, indice: IndiceDePartes, sede: string, desde: Date, hasta: Date,
): Date[] {
  const dia = 86_400_000;
  const d0 = new Date(desde); d0.setHours(0, 0, 0, 0);
  const fin = new Date(hasta); fin.setHours(0, 0, 0, 0);
  const libres: Date[] = [];
  for (let t = d0.getTime(); t <= fin.getTime(); t += dia) {
    const d = new Date(t);
    if (disponibilidadDeEspacio(f, cara, null, estado, indice, sede, d, d) === "libre") libres.push(d);
  }
  return libres;
}

/** Lo que dice una cara «parcial» en el rótulo del plano, el cartel del mouse
 *  y la ficha de la lista de precios: el día en que se libera la ENTERA (con
 *  cuántos días libres tiene) o, si la entera está libre todo el periodo o no
 *  se libera en él, cuántas divisiones hay vendidas («1 de 3 puertas
 *  vendida»: se vende otra parte, no la entera). `null` si no hay nada que
 *  decir. Una cuenta, sin nombres ni plata. */
export type ComoSeLibera = { porPartes: string; desde?: undefined; diasLibres?: undefined }
  | { desde: Date; diasLibres: number; porPartes?: undefined };

export function comoSeLiberaLaCara(
  f: ConPartes & MuebleConEstado, cara: "A" | "B",
  estado: EstadoPorEspacio, indice: IndiceDePartes, sede: string, desde: Date, hasta: Date,
): ComoSeLibera | null {
  const r = partesVendidasDeLaCara(f, cara, estado, sede, desde, hasta);
  if (r) return { porPartes: textoDePartesVendidas(r) };
  const libres = diasLibresDeLaCara(f, cara, estado, indice, sede, desde, hasta);
  if (libres.length > 0) return { desde: libres[0], diasLibres: libres.length };
  const vendidas = divisionesVendidas(f, cara, estado, sede, desde, hasta);
  return vendidas ? { porPartes: textoDePartesVendidas(vendidas) } : null;
}

/** «1 de 3 puertas vendida», «2 de 5 entrepaños vendidos». */
export function textoDePartesVendidas(r: { vendidas: number; de: number; clase: string }): string {
  const c = claseDe(r.clase);
  return `${r.vendidas} de ${r.de} ${c?.plural ?? r.clase} vendid${concordancia(r.clase).o}${r.vendidas === 1 ? "" : "s"}`;
}

/**
 * Por qué un espacio no está libre en el periodo, para decirlo en el renglón
 * de Vender sin nombrar a nadie: lo suyo (`propio`), la nevera vendida entera
 * (`entera`, para una puerta) o puertas vendidas (`partes`, para la entera).
 * `null` si está libre.
 */
export function porQueNoEstaLibre(
  f: MuebleConEstado, cara: "A" | "B", parte: ParteRef | null,
  estado: EstadoPorEspacio, indice: IndiceDePartes, sede: string, desde: Date, hasta: Date,
): "propio" | "entera" | "partes" | null {
  if (rangeAvailability(estadoDeEspacio(f, cara, parte, estado, sede), desde, hasta) !== "libre") return "propio";
  if (esDivision(parte) && rangeAvailability(estadoDeEspacio(f, cara, null, estado, sede), desde, hasta) !== "libre") {
    return "entera";
  }
  return disponibilidadDeEspacio(f, cara, parte, estado, indice, sede, desde, hasta) === "libre" ? null : "partes";
}
