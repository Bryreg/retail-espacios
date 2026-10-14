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

const mismaParte = (a: ParteRef | null, b: ParteRef | null) =>
  a === b || (!!a && !!b && a.clase === b.clase && a.token === b.token && a.n === b.n);

/**
 * ¿Dos espacios no se pueden vender en fechas que se pisan? La misma regla que
 * `chocan` del servidor, con los mismos casos: el mismo espacio sí; la cara
 * entera y una de sus divisiones, sí; dos divisiones de la misma clase, no (dos
 * puertas distintas conviven); de clases distintas de la misma cara, sí (se
 * pisan); una pieza sólo consigo misma. Se decide por los códigos: quien manda
 * es el servidor, esto es para avisar antes.
 */
export function chocan(a: CodigoPartido, b: CodigoPartido): boolean {
  if (a.base !== b.base || a.cara !== b.cara) return false;
  if (mismaParte(a.parte, b.parte)) return true;
  if (!a.parte) return esDivision(b.parte);
  if (!b.parte) return esDivision(a.parte);
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
  if (!regla || !f) return null;
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
    if (!regla || regla.es !== "pieza") continue;
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

/** Lo que decide DÓNDE cae cada parte vendida, por clase: la cantidad de la
 *  división, o de las piezas (las bahías parten la mesa en partes iguales), o
 *  1 si tiene el forro. Es `firma_de_partes` del servidor. */
export function firmaDePartes(f: ConPartes): Record<string, number | null> {
  const div = divisionDe(f);
  const firma: Record<string, number | null> = Object.fromEntries(
    Object.keys(P.clases).map((clase) => [clase, div && div.clase === clase ? div.n : null]));
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
 * pieza, la de su clase, sin respaldo. Es `referencia_de_espacio` del servidor.
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
  const regla = claseDe(parte.clase);
  if (!regla) return { valor: null, origen: "" };
  const propia = referenceRateFor(rates, sede, regla.tarifa);
  if (propia !== null) return { valor: propia, origen: "clase" };
  if (regla.es !== "division") return { valor: null, origen: "" };
  const n = cantidadDe(f, parte.clase);
  const base = referenceRateFor(rates, sede, deLaCara);
  if (base === null || !n) return { valor: null, origen: "" };
  return { valor: redondear(base / n), origen: "cara/n" };
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
