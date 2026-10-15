import { CATALOGO_DE_MUEBLES, type CampoDeGeometria, type TipoDeMueble } from "./catalogo";

/**
 * Las reglas de una FICHA de mueble, del lado del navegador.
 *
 * Una ficha es lo que describe un modelo: su familia, su nombre, sus medidas,
 * la geometría que fija y de dónde salió. Las de RECABRA viven en
 * `muebles.json` (`base:…`); las de cada supermercado, en su base
 * (`modelos_mueble`, `/api/muebles/modelos`), y viajan en el plano como
 * `cli:<clave>`. Las dos se validan con las MISMAS reglas, escritas una vez en
 * `fichas` de `muebles.json`:
 *
 *   · la familia existe y admite fichas (tiene `rango`), con su variante si la
 *     tiene (la góndola: central o de pared);
 *   · las medidas, dentro del `rango` de la familia;
 *   · sólo la geometría que admite su `geometria`, dentro de su rango y entera
 *     donde corresponde (los entrepaños, las puertas, las bahías de una caja),
 *     y el sí o no de una pieza que la familia lleva (el forro de una columna);
 *   · una tarifa propia sólo si es una de las de su familia (la media estiba,
 *     el exhibidor de cartón): son las que Tarifas ya ofrece;
 *   · la fuente dice cuánto confiar y de dónde salió —una URL http(s) que no sea
 *     una imagen, o una nota—, y los textos tienen largo máximo;
 *   · ni foto ni nada que no sea de la ficha.
 *
 * El servidor valida lo mismo antes de guardar
 * (`problemas_de_la_ficha` en `backend/app/services/catalogo_muebles.py`) y los
 * dos lados corren los casos de `scripts/casos/fichas.json`
 * (`probar-fichas.mjs` y `tests/test_fichas_propias.py`), que comparan los
 * CAMPOS con problemas: los mensajes pueden decirse distinto, los campos no.
 *
 * No importa nada más que el catálogo: lo usa el taller, que ya lo carga.
 */

const C = CATALOGO_DE_MUEBLES;
const REGLAS = C.fichas;

/** Un problema de la ficha: en qué campo (`w`, `partes.puertas`,
 *  `fuente.url`…) y qué le pasa. */
export interface ProblemaDeFicha { campo: string; problema: string }

/** Lo que puede traer una ficha propia, y nada más. */
export const CAMPOS_DE_FICHA_PROPIA = [
  "clave", "tipo", "variante", "nombre", "w", "d", "h",
  "entrepanos", "modulo", "partes", "tarifa", "fuente",
] as const;
const CAMPOS_DE_FUENTE = ["url", "nota", "confiabilidad"];

const propio = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);
const objeto = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);
const numero = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const texto = (x: unknown): x is string => typeof x === "string" && x.trim().length > 0;
/** En letras de verdad (puntos de código), como `len` de Python. */
const largo = (x: string) => [...x.trim()].length;
const m = (x: number) => x.toFixed(2).replace(".", ",");

/** Las familias que admiten fichas: las que tienen `rango`. */
export const FAMILIAS_CON_FICHA: Readonly<Record<string, TipoDeMueble>> = Object.fromEntries(
  Object.entries(C.tipos).filter(([, d]) => d.rango && !d.legado),
);

/** Las tarifas propias que puede llevar una ficha de cada familia: las de los
 *  modelos de esa familia en el catálogo. */
export function tarifasDeFicha(tipo: string): string[] {
  return [...new Set(C.modelos.filter((x) => x.tipo === tipo && x.tarifa).map((x) => x.tarifa as string))].sort();
}

/** Cómo se llama una ficha propia en el `modelo` de un mueble del plano. */
export function idDeFichaPropia(clave: string): string {
  return `${REGLAS.prefijoPropio}${clave}`;
}

const NOMBRE_DE_MEDIDA = { w: "el ancho", d: "el fondo", h: "el alto" } as const;
const NOMBRE_DE_GEOMETRIA: Record<CampoDeGeometria, string> = {
  entrepanos: "los entrepaños", modulo: "el módulo", puertas: "las puertas", tramos: "los tramos",
  bahias: "las bahías de impulso", forro: "el forro", division: "cómo se vende por partes",
};

/** La lista cerrada de un campo de palabras (`division`): la de su familia
 *  (`partes.divisiones`). `undefined` si el campo es un número. Espejo de
 *  `_valores_de` del servidor. */
function valoresDe(regla: { valores?: string }, familia: TipoDeMueble): string[] | undefined {
  if (!regla.valores) return undefined;
  const lista = (familia.partes as Record<string, unknown> | undefined)?.[regla.valores];
  return Array.isArray(lista) ? lista.filter((x): x is string => typeof x === "string") : [];
}

/**
 * Lo que está mal en una ficha propia. Vacío es que se puede guardar.
 * `nueva` pide la clave (el alta); al editar, la clave no se cambia.
 */
export function problemasDeLaFicha(ficha: unknown, { nueva = true }: { nueva?: boolean } = {}): ProblemaDeFicha[] {
  const mal: ProblemaDeFicha[] = [];
  const no = (campo: string, problema: string) => { mal.push({ campo, problema }); };
  if (!objeto(ficha)) return [{ campo: "ficha", problema: "la ficha tiene que ser un objeto" }];
  for (const k of Object.keys(ficha)) {
    if ((CAMPOS_DE_FICHA_PROPIA as readonly string[]).includes(k)) continue;
    no(k, k === "foto" ? "una ficha no lleva foto: sólo medidas y de dónde salieron" : `«${k}» no es un dato de la ficha`);
  }

  const clave = ficha.clave;
  if (clave != null || nueva) {
    if (typeof clave !== "string" || !new RegExp(REGLAS.clave).test(clave)) {
      no("clave", "la clave son minúsculas, números y guiones, hasta 60: es lo que guarda el plano y no cambia nunca");
    }
  }

  const tipo = ficha.tipo;
  const familia = typeof tipo === "string" && propio(FAMILIAS_CON_FICHA, tipo) ? FAMILIAS_CON_FICHA[tipo] : undefined;
  if (!familia) {
    if (typeof tipo === "string" && propio(C.tipos, tipo)) no("tipo", `la familia «${tipo}» no admite fichas`);
    else no("tipo", "falta la familia, o no existe");
  }

  const largos = REGLAS.largoMaximo;
  const nombre = ficha.nombre;
  if (!texto(nombre)) no("nombre", "falta el nombre");
  else if (largo(nombre) > largos.nombre) no("nombre", `el nombre tiene hasta ${largos.nombre} letras`);

  if (familia) {
    const variantes = familia.variantes;
    const variante = ficha.variante;
    if (variantes) {
      if (typeof variante !== "string" || !propio(variantes, variante)) {
        no("variante", `la variante tiene que ser una de ${Object.keys(variantes).join(", ")}`);
      }
    } else if (variante != null) {
      no("variante", `«${tipo}» no tiene variantes`);
    }

    for (const k of ["w", "d", "h"] as const) {
      const v = ficha[k];
      const r = familia.rango![k];
      if (v == null) no(k, `falta ${NOMBRE_DE_MEDIDA[k]}, en metros`);
      else if (!numero(v)) no(k, `${NOMBRE_DE_MEDIDA[k]} tiene que ser un número, en metros`);
      else if (!(r[0] <= v && v <= r[1])) {
        no(k, `${NOMBRE_DE_MEDIDA[k]} (${m(v)} m) está fuera del rango de su familia (${m(r[0])} a ${m(r[1])} m)`);
      }
    }

    let partes: unknown = ficha.partes;
    if (partes != null && !(objeto(partes)
      && Object.keys(partes).every((k) => propio(REGLAS.geometria, k) && REGLAS.geometria[k as CampoDeGeometria].enPartes))) {
      no("partes", "las partes sólo llevan lo conocido (las puertas, los tramos, las bahías de impulso, el forro y cómo se vende)");
      partes = undefined;
    }
    const admite = familia.geometria ?? {};
    // Las divisiones que se cuentan en el plano y no en la ficha (los tramos
    // de una góndola: su ficha es un módulo), y los campos que las cuentan.
    const enElPlano = familia.partes?.seCuentanEnElPlano ?? [];
    const delPlano = new Set(enElPlano.map((c) => C.partes.clases[c]?.campo).filter(Boolean));
    // Los campos que cuentan las piezas de la familia (`partes.bahias` de la
    // caja, `partes.forro` de la columna).
    const deSusPiezas = new Set((familia.partes?.piezas ?? []).map((c) => C.partes.clases[c]?.campo).filter(Boolean));
    for (const [campo, regla] of Object.entries(REGLAS.geometria) as [CampoDeGeometria, { enPartes: boolean; entero: boolean; valores?: string; booleano?: boolean }][]) {
      const donde = regla.enPartes ? `partes.${campo}` : campo;
      const v = regla.enPartes ? (objeto(partes) ? partes[campo] : undefined) : ficha[campo];
      if (v == null) continue;
      if (regla.booleano) {
        // Un sí o no (el forro de una columna): lo lleva la familia que tiene
        // una pieza contada con él.
        if (!deSusPiezas.has(campo)) no(donde, `la familia «${tipo}» no lleva ${NOMBRE_DE_GEOMETRIA[campo]}`);
        else if (typeof v !== "boolean") no(donde, `${NOMBRE_DE_GEOMETRIA[campo]} es sí o no`);
        continue;
      }
      const valores = valoresDe(regla, familia);
      if (valores) {
        // Una palabra de una lista cerrada: cómo se vende por partes.
        const clases = C.partes.clases;
        if (valores.length === 0 && deSusPiezas.size > 0) no(donde, `la familia «${tipo}» no se divide: lo que se vende son sus piezas`);
        else if (valores.length === 0) no(donde, `la familia «${tipo}» se vende entera: no tiene partes`);
        else if (typeof v !== "string" || !valores.includes(v)) {
          no(donde, `se vende por ${valores.map((c) => clases[c]?.plural ?? c).join(" o por ")}`);
        } else if (!enElPlano.includes(v)) {
          // Dividir pide saber en cuántas: sin la cuenta no hay partes. La
          // cuenta vive en `partes` (las puertas, los tramos) o en la ficha
          // (los entrepaños, con la base).
          const clase = clases[v];
          const reglaDelCampo = REGLAS.geometria[clase.campo as CampoDeGeometria];
          const n = reglaDelCampo?.enPartes ? (objeto(partes) ? partes[clase.campo] : undefined) : ficha[clase.campo];
          const base = clase.base ? 1 : 0;
          if (!(numero(n) && Number.isInteger(n) && n + base >= clase.minimo)) {
            no(donde, `para venderla por ${clase.plural}, la ficha dice cuánt${clase.genero === "f" ? "a" : "o"}s `
              + `(${clase.minimo - base} o más${base ? ", sin contar la base" : ""})`);
          }
        }
        continue;
      }
      if (delPlano.has(campo)) {
        no(donde, `en la ficha de «${tipo}» no van ${NOMBRE_DE_GEOMETRIA[campo]}: dependen del largo del corrido `
          + "y se fijan en el plano, uno por módulo");
        continue;
      }
      const r = admite[campo];
      if (!r) no(donde, `la familia «${tipo}» no lleva ${NOMBRE_DE_GEOMETRIA[campo]}`);
      else if (!numero(v) || (regla.entero && !Number.isInteger(v)) || !(r[0] <= v && v <= r[1])) {
        no(donde, `${NOMBRE_DE_GEOMETRIA[campo]} van de ${r[0]} a ${r[1]}${regla.entero ? " (entero)" : ""}`);
      }
    }

    const tarifa = ficha.tarifa;
    if (tarifa != null) {
      const propias = tarifasDeFicha(tipo as string);
      if (tarifa === familia.tarifa) no("tarifa", "es la tarifa de su familia: dejala vacía");
      else if (typeof tarifa !== "string" || !propias.includes(tarifa)) {
        no("tarifa", `la tarifa propia tiene que ser una de las de su familia (${propias.join(", ") || "ninguna"})`);
      }
    }
  }

  const fuente = ficha.fuente;
  if (!objeto(fuente)) {
    no("fuente", "falta la fuente: cuánto confiar y la URL de la ficha o una nota");
  } else {
    for (const k of Object.keys(fuente)) if (!CAMPOS_DE_FUENTE.includes(k)) no(`fuente.${k}`, `«${k}» no es un dato de la fuente`);
    if (!(REGLAS.confiabilidad as unknown[]).includes(fuente.confiabilidad)) {
      no("fuente.confiabilidad", `la confiabilidad es ${REGLAS.confiabilidad.join(", ")}`);
    }
    const { url, nota } = fuente;
    if (url != null && typeof url !== "string") no("fuente.url", "la URL tiene que ser un texto");
    else if (texto(url)) {
      if (largo(url) > largos.url) no("fuente.url", `la URL tiene hasta ${largos.url} letras`);
      else if (!/^https?:\/\/\S+$/i.test(url.trim())) no("fuente.url", "la URL empieza con http:// o https://, sin espacios");
      else if (new RegExp(REGLAS.fuenteQueEsImagen, "i").test(url.trim())) {
        no("fuente.url", "la fuente es una imagen: se guarda la página de la ficha, nunca una foto");
      }
    }
    if (nota != null && typeof nota !== "string") no("fuente.nota", "la nota tiene que ser un texto");
    else if (texto(nota) && largo(nota) > largos.nota) no("fuente.nota", `la nota tiene hasta ${largos.nota} letras`);
    if (!texto(url) && !texto(nota)) no("fuente", "decí de dónde salió: la URL de la ficha o una nota");
  }
  return mal;
}
