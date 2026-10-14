/**
 * Pruebas del catálogo de muebles (`src/catalogo/muebles.json`).
 *   npm run probar:catalogo
 *
 * ── Por qué existe este archivo ──────────────────────────────────────────────
 *
 * El tipo de mueble estaba escrito a mano en unas veintidós tablas —el
 * catálogo del 3D y el del 2D, los altos y colores con que nace, los prefijos,
 * las tarifas, lo que no se alquila, los nombres de los informes…— y varias ya
 * no decían lo mismo. Ahora hay UN archivo y las tablas se calculan de él,
 * con el mismo nombre y el mismo orden. La promesa es doble:
 *
 *   · **Un plano viejo da exactamente lo mismo que antes.** Se corre la misma
 *     captura que anotó el «antes» (`capturarTS`, de `capturar-catalogo.mjs`)
 *     sobre el código de hoy y se compara contra `casos/catalogo-antes.json`.
 *     Cualquier diferencia falla, salvo las de `CAMBIOS_INTENCIONALES`, que
 *     están escritas acá una por una con su porqué y su valor de antes: si la
 *     referencia no tiene ese valor de antes, también falla.
 *   · **Las tablas salen del archivo, no de una copia.** Se compilan los
 *     módulos con un catálogo adulterado y cada tabla tiene que cambiar con él.
 *     Una tabla escrita a mano que hoy coincide pasaría la comparación de
 *     arriba; ésta no.
 *
 * Y el archivo se valida: prefijos únicos (los alias de la góndola comparten
 * el suyo), cada tipo con rótulos y tarifa o «nunca», medidas positivas, las
 * tres listas de orden completas, y los tipos de TypeScript y `carasDe`
 * diciendo lo mismo que el catálogo. La copia del servidor tiene que ser
 * idéntica byte a byte (también lo exige `tests/test_catalogo_muebles.py`).
 *
 * Los MODELOS (las fichas de muebles de verdad) se validan con el esquema:
 * id único y estable, tipo que existe, medidas dentro del rango de su familia,
 * sólo la geometría que su tipo admite y dentro de su rango, tarifa propia con
 * su fila y sus nombres de informe, y la fuente con su URL y su confiabilidad
 * (nunca una imagen). La referencia compara sólo los tipos que conoce: los
 * nuevos también pasan por acá. La confiabilidad, la geometría que puede fijar
 * un modelo, lo que es una imagen y los largos de los textos son las reglas de
 * `fichas` en el mismo archivo: las mismas con que el servidor valida las
 * fichas propias de cada supermercado (`probar-fichas.mjs`).
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { armarPlano, capturarTS, TIPOS } from "./capturar-catalogo.mjs";

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = join(aqui, "..");
const repo = join(raiz, "..");
const leer = (p) => readFileSync(p, "utf8");

const RUTA_CATALOGO = join(raiz, "src", "catalogo", "muebles.json");
const RUTA_COPIA = join(repo, "backend", "app", "catalogo", "muebles.json");
const CATALOGO = JSON.parse(leer(RUTA_CATALOGO));
const ANTES = JSON.parse(leer(join(aqui, "casos", "catalogo-antes.json")));

let hechas = 0;
const prueba = async (n, fn) => {
  try { await fn(); hechas++; console.log("  ok   " + n); }
  catch (e) { console.error("  FALLA " + n + "\n         " + e.message.split("\n").join("\n         ")); process.exitCode = 1; }
};

/** Un módulo de `src`, compilado con esbuild y corrido acá. Con `catalogo`,
 *  el `muebles.json` que importa es ése y no el del disco. */
const cargar = async (rel, catalogo) => {
  const r = await build({
    entryPoints: [join(raiz, rel)],
    bundle: true, write: false, format: "esm", platform: "neutral", logLevel: "silent",
    plugins: catalogo ? [{
      name: "catalogo-adulterado",
      setup(b) {
        b.onLoad({ filter: /[\\/]catalogo[\\/]muebles\.json$/ },
          () => ({ contents: JSON.stringify(catalogo), loader: "json" }));
      },
    }] : [],
  });
  return import("data:text/javascript;base64," + Buffer.from(r.outputFiles[0].text).toString("base64"));
};

// ═══════════════════════════════════════════════════════════════════════════
// 1 · EL ARCHIVO
// ═══════════════════════════════════════════════════════════════════════════

const ALQUILABLE = ["si", "no_por_defecto", "nunca"];
const BANDERAS = ["producto", "prueba3D", "surtido", "frio", "formaCorrida"];
const CLAVES_DE_TIPO = new Set([
  "prefijo", "alquilable", "tarifa", "informe", "informePlural", "categoria", "grupo2D",
  "referencia", "banderas", "legado", "variantes",
  "rotuloEditor", "medidas", "color", "color2D", "emoji", "descripcion",
  "rango", "geometria", "partes",
]);
const CLAVES_DE_MODELO = new Set([
  "id", "tipo", "variante", "nombre", "w", "d", "h", "entrepanos", "modulo", "partes", "color",
  "tarifa", "informe", "informePlural", "fuente",
]);
/** La geometría que un modelo puede fijar, dónde vive y si es un número
 *  entero, la confiabilidad, lo que es una imagen (el catálogo guarda medidas,
 *  nunca fotos de terceros) y los largos de los textos NO están acá: son las
 *  reglas de `fichas` del catálogo, las mismas que el servidor aplica a las
 *  fichas propias de cada supermercado. */
const CAMPOS_DE_GEOMETRIA = ["entrepanos", "modulo", "puertas", "tramos", "bahias", "forro", "division"];
const reglasDeFicha = (cat) => {
  const r = cat.fichas ?? {};
  const geometria = Object.fromEntries(Object.entries(r.geometria ?? {}).map(([campo, g]) => [campo, {
    leer: (m) => (g.enPartes ? m.partes?.[campo] : m[campo]), entero: g.entero === true,
    enPartes: g.enPartes === true, valores: g.valores, booleano: g.booleano === true,
  }]));
  let esImagen = /(?!)/;
  try { esImagen = new RegExp(r.fuenteQueEsImagen, "i"); } catch { /* lo dice la validación de `fichas` */ }
  return { confiabilidad: Array.isArray(r.confiabilidad) ? r.confiabilidad : [], geometria, esImagen, largo: r.largoMaximo ?? {} };
};
const expresionValida = (x) => { try { new RegExp(x); return typeof x === "string" && x.length > 0; } catch { return false; } };
const CLAVES_DE_FORMA = new Set(["caras", "rotuloEditor", "medidas", "color", "color2D", "emoji", "descripcion"]);
const COLOR = /^#[0-9a-f]{6}$/;
const texto = (x) => typeof x === "string" && x.trim().length > 0;
const positivo = (x) => typeof x === "number" && Number.isFinite(x) && x > 0;

/** Lo que está mal en un catálogo, en palabras. Vacío es que está bien. */
function validar(cat) {
  const mal = [];
  const si = (cond, msj) => { if (!cond) mal.push(msj); };
  si(cat.version === 1, "`version` no es 1");
  si(Array.isArray(cat.leeme) && cat.leeme.every(texto), "`leeme` no es una lista de textos");
  si(/^[A-Z]{3}$/.test(cat.prefijoDesconocido ?? ""), "`prefijoDesconocido` no son tres mayúsculas");
  const tipos = cat.tipos ?? {};
  const claves = new Set(["version", "leeme", "prefijoDesconocido", "tipos", "alias", "tarifas", "modelos", "partes", "fichas", "orden"]);
  for (const k of Object.keys(cat)) si(claves.has(k), `clave desconocida \`${k}\` en el catálogo`);

  // ── Las reglas de las fichas ──
  const rf = cat.fichas ?? {};
  for (const k of Object.keys(rf)) {
    si(["leeme", "prefijoPropio", "clave", "confiabilidad", "geometria", "fuenteQueEsImagen", "largoMaximo"].includes(k),
      `clave desconocida \`${k}\` en \`fichas\``);
  }
  si(Array.isArray(rf.leeme) && rf.leeme.every(texto), "`fichas.leeme` no es una lista de textos");
  si(/^[a-z]+:$/.test(rf.prefijoPropio ?? "") && rf.prefijoPropio !== "base:", "`fichas.prefijoPropio` tiene que ser una palabra con dos puntos, y no `base:`");
  si(expresionValida(rf.clave) && rf.clave.startsWith("^") && rf.clave.endsWith("$") && !new RegExp(rf.clave).test("a:b"),
    "`fichas.clave` tiene que ser una expresión anclada que no deje pasar «:»");
  si(Array.isArray(rf.confiabilidad) && rf.confiabilidad.length > 0 && rf.confiabilidad.every(texto),
    "`fichas.confiabilidad` tiene que ser una lista de textos");
  si(rf.geometria && Object.keys(rf.geometria).sort().join() === [...CAMPOS_DE_GEOMETRIA].sort().join()
    && Object.values(rf.geometria).every((g) => typeof g?.enPartes === "boolean" && typeof g?.entero === "boolean"
      && Object.keys(g).every((k) => ["enPartes", "entero", "valores", "booleano"].includes(k))
      && (g.valores === undefined || (texto(g.valores) && g.enPartes && !g.entero))
      // Un sí o no (el forro): en `partes`, ni entero ni palabra.
      && (g.booleano === undefined || (g.booleano === true && g.enPartes && !g.entero && g.valores === undefined))),
    `\`fichas.geometria\` tiene que decir de ${CAMPOS_DE_GEOMETRIA.join(", ")} si va en \`partes\` y si es entero (y, si es una palabra, dónde está su lista: \`valores\`; si es un sí o no, \`booleano\`)`);
  si(expresionValida(rf.fuenteQueEsImagen), "`fichas.fuenteQueEsImagen` no es una expresión");
  si(["nombre", "url", "nota"].every((k) => Number.isInteger(rf.largoMaximo?.[k]) && rf.largoMaximo[k] > 0),
    "`fichas.largoMaximo` tiene que tener nombre, url y nota, enteros positivos");
  const { confiabilidad: CONFIABILIDAD, geometria: GEOMETRIA, esImagen: ES_IMAGEN, largo: LARGO } = reglasDeFicha(cat);

  const tarifas = new Map((cat.tarifas ?? []).map((t) => [t.clave, t]));
  si((cat.tarifas ?? []).length === tarifas.size, "hay dos tarifas con la misma clave");
  for (const t of cat.tarifas ?? []) si(texto(t.clave) && texto(t.rotulo), `tarifa sin clave o sin rótulo: ${JSON.stringify(t)}`);

  // ── Vender por partes: las clases ──
  // Cada clase dice su token (dos letras, único, reservado), si divide la
  // cara o es una pieza, el campo de `partes` que la cuenta (uno de los de
  // `fichas.geometria` que van en `partes`, entero), su tarifa (con su fila)
  // y cómo la nombran los informes.
  const pc = cat.partes ?? {};
  for (const k of Object.keys(pc)) si(["leeme", "clases", "reservados"].includes(k), `clave desconocida \`${k}\` en \`partes\``);
  si(Array.isArray(pc.leeme) && pc.leeme.every(texto), "`partes.leeme` no es una lista de textos");
  const reservados = Array.isArray(pc.reservados) ? pc.reservados : [];
  si(Array.isArray(pc.reservados) && reservados.every((r) => /^[A-Z]{1,2}$/.test(r)) && new Set(reservados).size === reservados.length
    && reservados.includes("B"), "`partes.reservados` son finales de una o dos mayúsculas, sin repetir, con la `B` de la cara B");
  const clases = pc.clases ?? {};
  const tokens = new Set();
  const CLAVES_DE_CLASE = ["token", "es", "eje", "mirando", "campo", "base", "minimo", "unico", "singular", "plural", "genero", "tarifa", "informe", "informePlural"];
  for (const [clase, c] of Object.entries(clases)) {
    const donde = `parte ${clase}`;
    for (const k of Object.keys(c ?? {})) si(CLAVES_DE_CLASE.includes(k), `${donde}: clave desconocida \`${k}\``);
    si(/^[A-Z]{2}$/.test(c?.token ?? ""), `${donde}: el token son dos mayúsculas`);
    si(!tokens.has(c?.token), `${donde}: el token ${c?.token} ya es de otra clase`);
    tokens.add(c?.token);
    si(reservados.includes(c?.token), `${donde}: el token ${c?.token} no está entre los reservados`);
    si(["division", "pieza"].includes(c?.es), `${donde}: \`es\` es division o pieza`);
    si([null, "ancho", "alto"].includes(c?.eje), `${donde}: \`eje\` es ancho, alto o null`);
    // El campo que la cuenta es un entero de la ficha: en `partes` (las
    // puertas, los tramos, las bahías) o en el mueble (los entrepaños, con la
    // base). Una pieza ÚNICA (el forro: una por mueble, sin número) se cuenta
    // con un sí o no, y sólo una pieza puede ser única.
    const regla = (cat.fichas?.geometria ?? {})[c?.campo];
    if (c?.unico) {
      si(!!regla && regla.booleano === true, `${donde}: una pieza única se cuenta con un sí o no de \`fichas.geometria\` (\`booleano\`)`);
    } else {
      si(!!regla && regla.entero && !regla.valores && !regla.booleano, `${donde}: \`campo\` tiene que ser un entero de \`fichas.geometria\``);
    }
    si(c?.unico === undefined || (c.unico === true && c.es === "pieza"), `${donde}: \`unico\` es true y sólo en una pieza`);
    si(c?.mirando === undefined || (texto(c.mirando) && c.eje === "ancho"),
      `${donde}: \`mirando\` es un texto, y sólo en lo que se cuenta a lo ancho`);
    si(c?.base === undefined || c.base === true, `${donde}: \`base\` es true o no va`);
    si(c?.genero === "f" || c?.genero === "m", `${donde}: \`genero\` es f o m (para decirla bien: «una puerta», «un tramo»)`);
    si(Number.isInteger(c?.minimo) && c.minimo >= 1, `${donde}: \`minimo\` es un entero de 1 o más`);
    si(texto(c?.singular) && texto(c?.plural), `${donde}: sin singular o plural`);
    si(texto(c?.tarifa) && tarifas.has(c.tarifa), `${donde}: su tarifa no está en \`tarifas\``);
    si(texto(c?.informe) && texto(c?.informePlural), `${donde}: los informes no tienen cómo nombrarla`);
  }

  /** La forma con que nace: rótulo, medidas, color, emoji y descripción. */
  const forma = (f, donde, { conCaras }) => {
    for (const k of Object.keys(f)) if (conCaras) si(CLAVES_DE_FORMA.has(k), `${donde}: clave desconocida \`${k}\``);
    si(texto(f.rotuloEditor), `${donde}: sin rótulo de editor`);
    si(f.medidas && ["w", "d", "h"].every((m) => positivo(f.medidas[m])), `${donde}: las medidas tienen que ser w, d y h positivas`);
    si(COLOR.test(f.color ?? ""), `${donde}: color inválido`);
    si(f.color2D === undefined || COLOR.test(f.color2D), `${donde}: color2D inválido`);
    si(texto(f.emoji), `${donde}: sin emoji`);
    si(texto(f.descripcion), `${donde}: sin descripción`);
    if (conCaras) si(f.caras === 1 || f.caras === 2, `${donde}: \`caras\` tiene que ser 1 o 2`);
  };

  const prefijos = new Map();
  for (const [t, d] of Object.entries(tipos)) {
    for (const k of Object.keys(d)) si(CLAVES_DE_TIPO.has(k), `${t}: clave desconocida \`${k}\``);
    si(/^[a-z][a-z0-9_]*$/.test(t), `${t}: la clave del tipo no es un slug`);
    si(/^[A-Z]{3}$/.test(d.prefijo ?? ""), `${t}: el prefijo no son tres mayúsculas`);
    if (prefijos.has(d.prefijo)) mal.push(`${t}: el prefijo ${d.prefijo} ya es de ${prefijos.get(d.prefijo)}`);
    prefijos.set(d.prefijo, t);
    si(d.prefijo !== cat.prefijoDesconocido, `${t}: usa el prefijo de lo desconocido`);
    si(ALQUILABLE.includes(d.alquilable), `${t}: \`alquilable\` no es si, no_por_defecto ni nunca`);
    si(Array.isArray(d.banderas) && d.banderas.every((b) => BANDERAS.includes(b))
      && new Set(d.banderas).size === d.banderas.length, `${t}: banderas inválidas`);
    si(d.referencia === undefined || (texto(d.referencia.corto) && texto(d.referencia.frase)), `${t}: referencia incompleta`);
    if (d.alquilable === "nunca") {
      si(d.tarifa === undefined, `${t}: no se vende nunca y tiene tarifa`);
    } else if (!d.legado) {
      si(texto(d.tarifa) && tarifas.has(d.tarifa), `${t}: se vende y no tiene una tarifa de \`tarifas\``);
      si(texto(d.informe) && texto(d.informePlural), `${t}: se vende y los informes no tienen cómo nombrarlo`);
      si(texto(d.categoria), `${t}: se vende y no tiene categoría`);
    }
    const rangoValido = (r) => Array.isArray(r) && r.length === 2 && r.every((x) => typeof x === "number" && x > 0) && r[0] <= r[1];
    if (d.rango !== undefined) {
      si(Object.keys(d.rango).every((k) => ["w", "d", "h"].includes(k)) && ["w", "d", "h"].every((k) => rangoValido(d.rango[k])),
        `${t}: \`rango\` tiene que tener w, d y h, cada uno [mínimo, máximo] positivos`);
    }
    if (d.geometria !== undefined) {
      si(Object.entries(d.geometria).every(([k, r]) => k in GEOMETRIA && !GEOMETRIA[k].valores && !GEOMETRIA[k].booleano && rangoValido(r)),
        `${t}: \`geometria\` sólo admite ${Object.keys(GEOMETRIA).filter((k) => !GEOMETRIA[k].valores && !GEOMETRIA[k].booleano).join(", ")}, cada uno [mínimo, máximo]`);
    }
    if (d.partes !== undefined) {
      const divs = d.partes?.divisiones;
      const piezas = d.partes?.piezas;
      si(d.partes && Object.keys(d.partes).every((k) => ["divisiones", "seCuentanEnElPlano", "piezas"].includes(k))
        && ((Array.isArray(divs) && divs.length > 0) || (Array.isArray(piezas) && piezas.length > 0)),
        `${t}: \`partes\` dice sus divisiones o sus piezas (y nada más)`);
      // Las divisiones de la familia: clases que dividen, contadas por un
      // campo que la familia tiene en su `geometria`, en un tipo que se vende.
      if (divs !== undefined) {
        si(Array.isArray(divs) && divs.length > 0
          && divs.every((x) => clases[x]?.es === "division" && d.geometria?.[clases[x].campo] !== undefined)
          && d.alquilable !== "nunca",
          `${t}: \`partes.divisiones\` son clases que dividen, contadas con un campo de su \`geometria\`, en un tipo que se vende`);
      }
      // Las piezas (la bahía de una caja, el forro de una columna): clases que
      // son piezas, contadas por un campo de su `geometria` o, la única, por
      // un sí o no. Pueden ir en un tipo que nunca se vende entero.
      if (piezas !== undefined) {
        si(Array.isArray(piezas) && piezas.length > 0
          && piezas.every((x) => clases[x]?.es === "pieza"
            && (clases[x].unico ? GEOMETRIA[clases[x].campo]?.booleano === true : d.geometria?.[clases[x].campo] !== undefined)),
          `${t}: \`partes.piezas\` son clases que son piezas, contadas con un campo de su \`geometria\` o con un sí o no`);
      }
      // Las que se cuentan en el plano (no en la ficha) son de las suyas.
      const enElPlano = d.partes?.seCuentanEnElPlano;
      si(enElPlano === undefined || (Array.isArray(enElPlano) && enElPlano.every((x) => divs?.includes(x))),
        `${t}: \`partes.seCuentanEnElPlano\` son divisiones de la familia`);
    }
    if (d.legado) {
      si(d.tarifa === undefined && d.variantes === undefined, `${t}: un legado no tiene tarifa ni variantes`);
      si(d.medidas === undefined || Object.values(d.medidas).every(positivo), `${t}: medidas no positivas`);
      continue;
    }
    si(texto(d.grupo2D), `${t}: sin grupo en la biblioteca del 2D`);
    if (d.variantes) {
      si(Object.keys(d.variantes).length > 0, `${t}: \`variantes\` vacío`);
      for (const k of CLAVES_DE_FORMA) si(d[k] === undefined, `${t}: \`${k}\` va en cada variante, no en el tipo`);
      for (const [v, f] of Object.entries(d.variantes)) forma(f, `${t}:${v}`, { conCaras: true });
    } else {
      forma(d, t, { conCaras: false });
    }
  }
  const modelos = Array.isArray(cat.modelos) ? cat.modelos : [];
  si(Array.isArray(cat.modelos), "`modelos` no es una lista");
  for (const t of tarifas.keys()) {
    si(Object.values(tipos).some((d) => d.tarifa === t) || modelos.some((m) => m.tarifa === t)
      || Object.values(clases).some((c) => c?.tarifa === t),
      `la tarifa \`${t}\` no es de ningún tipo, ni de ningún modelo, ni de ninguna clase de parte`);
  }

  // ── Los modelos ──
  // El modelo base implícito de cada familia se llama `base:<tipo>` o
  // `base:<alias>`: ningún modelo del archivo puede llamarse así.
  const implicitos = new Set([...Object.keys(tipos), ...Object.keys(cat.alias ?? {})].map((t) => `base:${t}`));
  const ids = new Set();
  for (const [i, m] of modelos.entries()) {
    const donde = `modelo ${m?.id ?? `#${i}`}`;
    if (!m || typeof m !== "object") { mal.push(`${donde}: no es un objeto`); continue; }
    for (const k of Object.keys(m)) si(CLAVES_DE_MODELO.has(k), `${donde}: clave desconocida \`${k}\``);
    si(/^base:[a-z0-9]+(-[a-z0-9]+)*$/.test(m.id ?? ""), `${donde}: el id tiene que ser \`base:\` y palabras en minúscula con guiones`);
    si(!ids.has(m.id), `${donde}: el id está repetido`);
    ids.add(m.id);
    si(!implicitos.has(m.id), `${donde}: el id es el del modelo base implícito de un tipo`);
    const d = tipos[m.tipo];
    si(!!d && !d.legado, `${donde}: el tipo \`${m.tipo}\` no existe`);
    if (!d || d.legado) continue;
    if (d.variantes) si(m.variante in d.variantes, `${donde}: \`variante\` tiene que ser una de ${Object.keys(d.variantes).join(", ")}`);
    else si(m.variante === undefined, `${donde}: \`${m.tipo}\` no tiene variantes`);
    si(texto(m.nombre), `${donde}: sin nombre`);
    si(!texto(m.nombre) || [...m.nombre.trim()].length <= LARGO.nombre, `${donde}: el nombre tiene hasta ${LARGO.nombre} letras`);
    si(!!d.rango, `${donde}: su tipo no tiene \`rango\` contra el que medirlo`);
    for (const k of ["w", "d", "h"]) {
      const r = d.rango?.[k];
      si(positivo(m[k]) && (!r || (m[k] >= r[0] && m[k] <= r[1])),
        `${donde}: \`${k}\` = ${m[k]} está fuera del rango de su familia${r ? ` (${r[0]} a ${r[1]})` : ""}`);
    }
    for (const [campo, g] of Object.entries(GEOMETRIA)) {
      const v = g.leer(m);
      if (v === undefined) continue;
      if (g.booleano) {
        // Un sí o no de una pieza que su familia lleva (el forro).
        si(typeof v === "boolean" && (d.partes?.piezas ?? []).some((c) => clases[c]?.campo === campo),
          `${donde}: \`${campo}\` es un sí o no de una pieza de \`${m.tipo}\``);
        continue;
      }
      if (g.valores) {
        // Una palabra de la lista de su familia, y con su cuenta.
        const lista = d.partes?.[g.valores] ?? [];
        si(lista.includes(v), `${donde}: \`${campo}\` = ${JSON.stringify(v)} no es de la lista de \`${m.tipo}\``);
        // La cuenta, donde vive (en `partes` o en el modelo) y con la base;
        // la de una división que se cuenta en el plano no va en la ficha.
        const c = clases[v];
        const enElPlano = (d.partes?.seCuentanEnElPlano ?? []).includes(v);
        const cuenta = c ? (GEOMETRIA[c.campo]?.leer(m)) : undefined;
        si(!c || enElPlano || (Number.isInteger(cuenta) && cuenta + (c.base ? 1 : 0) >= c.minimo),
          `${donde}: se vende por ${c?.plural ?? v} y no dice cuántas (${c?.minimo ?? 2} o más)`);
        continue;
      }
      const r = d.geometria?.[campo];
      si(!!r, `${donde}: \`${campo}\` no es geometría de \`${m.tipo}\``);
      if (r) si(typeof v === "number" && (!g.entero || Number.isInteger(v)) && v >= r[0] && v <= r[1],
        `${donde}: \`${campo}\` = ${v} está fuera de su rango (${r[0]} a ${r[1]})`);
    }
    if (m.partes !== undefined) {
      si(m.partes && typeof m.partes === "object"
        && Object.entries(m.partes).every(([k, v]) => GEOMETRIA[k]?.enPartes
          && (GEOMETRIA[k].valores ? typeof v === "string" : GEOMETRIA[k].booleano ? typeof v === "boolean" : typeof v === "number")),
        `${donde}: \`partes\` sólo lleva lo conocido de \`fichas.geometria\`, con su tipo`);
    }
    si(m.color === undefined || COLOR.test(m.color), `${donde}: color inválido`);
    if (m.tarifa !== undefined) {
      si(tarifas.has(m.tarifa), `${donde}: la tarifa \`${m.tarifa}\` no está en \`tarifas\``);
      si(m.tarifa !== d.tarifa, `${donde}: la tarifa propia es la misma de su tipo: sacala`);
      si(texto(m.informe) && texto(m.informePlural), `${donde}: tiene tarifa propia y los informes no tienen cómo nombrarla`);
    } else {
      si(m.informe === undefined && m.informePlural === undefined, `${donde}: nombres de informe sin tarifa propia`);
    }
    const f = m.fuente ?? {};
    si(typeof f.url === "string" && /^https:\/\/[^\s]+$/.test(f.url), `${donde}: la fuente no tiene una URL https`);
    si(!ES_IMAGEN.test(f.url ?? ""), `${donde}: la fuente es una imagen; se guarda la página de la ficha, nunca una foto`);
    si(CONFIABILIDAD.includes(f.confiabilidad), `${donde}: la confiabilidad tiene que ser ficha, catalogo o estimado`);
    si(texto(f.nota), `${donde}: la fuente no tiene nota`);
    si(!texto(f.nota) || [...f.nota.trim()].length <= LARGO.nota, `${donde}: la nota tiene hasta ${LARGO.nota} letras`);
    si(typeof f.url !== "string" || [...f.url.trim()].length <= LARGO.url, `${donde}: la URL tiene hasta ${LARGO.url} letras`);
    si(Object.keys(f).every((k) => ["url", "confiabilidad", "nota"].includes(k)), `${donde}: la fuente lleva sólo url, confiabilidad y nota`);
  }
  // En una familia, el ALTO decide cuántos entrepaños van; el módulo, no (es
  // el ancho de cada tramo). Dos góndolas de la misma variante y el mismo alto
  // con otra cantidad de entrepaños son una ficha mal copiada: pasó con las
  // centrales estimadas de 1,50, que decían tomar los entrepaños de la de alto
  // parecido (cuatro y la base) y tenían tres.
  const porAlto = new Map();
  for (const m of modelos) {
    if (!m || m.entrepanos === undefined) continue;
    const k = `${m.tipo}:${m.variante ?? ""}:${m.h}`;
    porAlto.set(k, [...(porAlto.get(k) ?? []), m]);
  }
  for (const [k, ms] of porAlto) {
    const cuantos = new Set(ms.map((m) => m.entrepanos));
    si(cuantos.size === 1, `${k}: los modelos del mismo alto tienen distintos entrepaños (${ms.map((m) => `${m.id}: ${m.entrepanos}`).join(", ")})`);
  }

  // Lo que dicen los informes tiene que llevar a la fila de Tarifas de ESE
  // mueble. La sesión le dice a la dueña «dejar la tarifa cargada en
  // <nombre de informe>» y ella busca esas palabras en Tarifas: si están en el
  // rótulo de OTRO tipo y no en el suyo, carga la tarifa equivocada. Pasó:
  // «exhibición de piso» era la cruz en los informes y la estiba en Tarifas, e
  // «isla» llevaba a «Isla de congelados». Un nombre que no aparece en ningún
  // rótulo («stand de frutas») no confunde a nadie.
  const conNombre = [
    ...Object.entries(tipos).map(([t, d]) => [t, d]),
    ...modelos.filter((m) => m?.tarifa).map((m) => [`modelo ${m.id}`, m]),
    ...Object.entries(clases).map(([c, x]) => [`parte ${c}`, x]),
  ];
  for (const [t, d] of conNombre) {
    for (const nombre of [d.informe, d.informePlural].filter(texto)) {
      const n = nombre.toLowerCase();
      const conEsasPalabras = (cat.tarifas ?? [])
        .filter((x) => (x.rotulo ?? "").toLowerCase().includes(n)).map((x) => x.clave);
      si(!conEsasPalabras.length || conEsasPalabras.includes(d.tarifa),
        `${t}: los informes lo llaman «${nombre}» y en Tarifas eso es \`${conEsasPalabras.join("`, `")}\``);
    }
  }

  for (const [a, x] of Object.entries(cat.alias ?? {})) {
    si(!(a in tipos), `alias \`${a}\`: ya es un tipo`);
    si(tipos[x.tipo]?.variantes?.[x.variante] !== undefined, `alias \`${a}\`: no es una variante de un tipo`);
    si(Array.isArray(x.banderas) && x.banderas.every((b) => BANDERAS.includes(b)), `alias \`${a}\`: banderas inválidas`);
  }

  // Las tres listas de orden: completas y sin repetidos.
  const formas3D = [];
  const formas2D = [];
  for (const [t, d] of Object.entries(tipos)) {
    if (d.legado) continue;
    if (d.variantes) {
      for (const v of Object.keys(d.variantes)) {
        formas3D.push(`${t}:${v}`);
        const alias = Object.entries(cat.alias ?? {}).find(([, x]) => x.tipo === t && x.variante === v)?.[0];
        formas2D.push(alias ?? `(${t}:${v} no tiene nombre en el 2D)`);
      }
    } else {
      formas3D.push(t);
      formas2D.push(t);
    }
  }
  const mismaLista = (nombre, lista, esperada) => {
    const l = lista ?? [];
    si(new Set(l).size === l.length, `\`orden.${nombre}\` repite una entrada`);
    const sobran = l.filter((x) => !esperada.includes(x));
    const faltan = esperada.filter((x) => !l.includes(x));
    si(!sobran.length && !faltan.length,
      `\`orden.${nombre}\`: ${faltan.length ? `faltan ${faltan.join(", ")}` : ""}${sobran.length ? ` sobran ${sobran.join(", ")}` : ""}`);
  };
  mismaLista("editor3D", cat.orden?.editor3D, formas3D);
  mismaLista("plano2D", cat.orden?.plano2D, formas2D);
  mismaLista("minimapa", cat.orden?.minimapa,
    Object.entries(tipos).filter(([, d]) => d.referencia).map(([t]) => t));
  return mal;
}

await prueba("el catálogo es válido", () => {
  const mal = validar(CATALOGO);
  assert.deepEqual(mal, [], "\n" + mal.join("\n"));
});

await prueba("la validación rechaza lo que tiene que rechazar", () => {
  // Una validación que deja pasar todo es peor que ninguna: se rompe a
  // propósito un catálogo por cada regla y tiene que quejarse.
  const roto = (cambiar) => { const c = structuredClone(CATALOGO); cambiar(c); return validar(c); };
  const casos = [
    // Cuál de los dos se queja depende del orden de las claves: cualquiera vale.
    ["un prefijo repetido", (c) => { c.tipos.punta.prefijo = "GON"; }, /(gondola|punta): el prefijo GON ya es de (punta|gondola)/],
    ["un tipo que se vende sin tarifa", (c) => { delete c.tipos.batea.tarifa; }, /batea: se vende y no tiene una tarifa/],
    ["un tipo que no se vende con tarifa", (c) => { c.tipos.checkout.tarifa = "checkout"; }, /checkout: no se vende nunca y tiene tarifa/],
    ["un tipo que se vende sin nombre de informe", (c) => { delete c.tipos.ristra.informePlural; }, /ristra: se vende y los informes/],
    ["una medida en cero", (c) => { c.tipos.batea.medidas.h = 0; }, /batea: las medidas/],
    ["una medida negativa en una variante", (c) => { c.tipos.gondola.variantes.wall.medidas.d = -0.4; }, /gondola:wall: las medidas/],
    ["un tipo fuera de la paleta del 3D", (c) => { c.orden.editor3D = c.orden.editor3D.filter((t) => t !== "robatope"); },
      /orden\.editor3D`: faltan robatope/],
    ["un alias a una variante que no existe", (c) => { c.alias.gondola_mural.variante = "isla"; }, /gondola_mural`: no es una variante/],
    ["una clave mal escrita", (c) => { c.tipos.punta.prefjio = "PUN"; }, /clave desconocida `prefjio`/],
    ["un nombre de informe que en Tarifas es otro mueble", (c) => { c.tipos.cross.informe = "exhibición de piso"; },
      /cross: los informes lo llaman «exhibición de piso» y en Tarifas eso es `isla`/],
    ["un nombre de informe que lleva a otra fila de Tarifas", (c) => { c.tipos.isla.informe = "isla"; },
      /isla: los informes lo llaman «isla» y en Tarifas eso es `isla_fria`/],
    // Los modelos.
    ["dos modelos con el mismo id", (c) => { c.modelos[1].id = c.modelos[0].id; }, /el id está repetido/],
    ["un modelo con el id del base implícito", (c) => { c.modelos.find((m) => m.tipo === "punta").id = "base:punta"; }, /el id es el del modelo base implícito/],
    ["un id con otra forma", (c) => { c.modelos[0].id = "Góndola grande"; }, /el id tiene que ser `base:`/],
    ["un modelo de un tipo que no existe", (c) => { c.modelos[0].tipo = "gondolita"; }, /el tipo `gondolita` no existe/],
    ["un modelo de un tipo legado", (c) => { c.modelos[0].tipo = "exhibicion"; delete c.modelos[0].variante; }, /el tipo `exhibicion` no existe/],
    ["una góndola sin variante", (c) => { delete c.modelos.find((m) => m.tipo === "gondola").variante; }, /`variante` tiene que ser/],
    ["una medida fuera del rango de la familia", (c) => { c.modelos.find((m) => m.tipo === "nevera_puertas").h = 3.4; }, /`h` = 3.4 está fuera del rango/],
    ["una medida en cero", (c) => { c.modelos[0].w = 0; }, /`w` = 0 está fuera del rango/],
    ["geometría que el tipo no admite", (c) => { c.modelos.find((m) => m.tipo === "isla").entrepanos = 3; }, /`entrepanos` no es geometría de `isla`/],
    ["puertas en una góndola", (c) => { c.modelos.find((m) => m.tipo === "gondola").partes = { puertas: 2 }; }, /`puertas` no es geometría de `gondola`/],
    ["entrepaños fuera de rango", (c) => { c.modelos.find((m) => m.tipo === "gondola").entrepanos = 9; }, /`entrepanos` = 9 está fuera de su rango/],
    ["otros entrepaños en el mismo alto", (c) => { c.modelos.find((m) => m.id === "base:gondola-central-150-m120").entrepanos = 3; },
      /gondola:double:1\.5: los modelos del mismo alto tienen distintos entrepaños/],
    ["puertas que no son enteras", (c) => { c.modelos.find((m) => m.tipo === "nevera_puertas").partes.puertas = 2.5; }, /`puertas` = 2.5 está fuera/],
    ["algo comercial en las partes", (c) => { c.modelos.find((m) => m.tipo === "nevera_puertas").partes.proveedor = "Postobón"; }, /`partes` sólo lleva lo conocido/],
    // Vender por partes.
    ["un modelo que se vende por algo que su familia no admite", (c) => { c.modelos.find((m) => m.id === "base:nevera-3p-frigomaster").partes.division = "tramos"; }, /`division` = "tramos" no es de la lista/],
    ["un modelo por puertas sin decir cuántas", (c) => { delete c.modelos.find((m) => m.id === "base:nevera-3p-frigomaster").partes.puertas; }, /se vende por puertas y no dice cuántas/],
    ["una puerta sola, por puertas", (c) => { c.modelos.find((m) => m.id === "base:nevera-1p-inducol").partes.division = "puertas"; }, /se vende por puertas y no dice cuántas/],
    ["la división como un número", (c) => { c.modelos.find((m) => m.id === "base:nevera-3p-frigomaster").partes.division = 3; }, /`partes` sólo lleva lo conocido/],
    ["un token de tres letras", (c) => { c.partes.clases.puertas.token = "PUE"; }, /el token son dos mayúsculas/],
    ["un token sin reservar", (c) => { c.partes.reservados = c.partes.reservados.filter((r) => r !== "PU"); }, /no está entre los reservados/],
    ["sin la B reservada", (c) => { c.partes.reservados = c.partes.reservados.filter((r) => r !== "B"); }, /con la `B` de la cara B/],
    ["una clase con una tarifa sin fila", (c) => { c.partes.clases.puertas.tarifa = "parte_inventada"; }, /su tarifa no está en `tarifas`/],
    ["una clase contada con un campo que no es un entero de la ficha", (c) => { c.partes.clases.puertas.campo = "modulo"; }, /`campo` tiene que ser un entero de `fichas.geometria`/],
    ["una clase contada con la palabra de cómo se vende", (c) => { c.partes.clases.tramos.campo = "division"; }, /`campo` tiene que ser un entero de `fichas.geometria`/],
    ["una clase sin género", (c) => { delete c.partes.clases.tramos.genero; }, /parte tramos: `genero` es f o m/],
    ["la base como un número", (c) => { c.partes.clases.entrepanos.base = 1; }, /parte entrepanos: `base` es true o no va/],
    ["una división que se cuenta en el plano y no es de la familia", (c) => { c.tipos.gondola.partes.seCuentanEnElPlano = ["puertas"]; }, /`partes.seCuentanEnElPlano` son divisiones de la familia/],
    ["un modelo por entrepaños sin entrepaños", (c) => { c.modelos.find((m) => m.tipo === "punta").partes = { division: "entrepanos" }; }, /se vende por entrepaños y no dice cuántas/],
    ["una familia que se divide en algo que no es una clase", (c) => { c.tipos.nevera_puertas.partes.divisiones = ["cajones"]; }, /`partes.divisiones` son clases que dividen/],
    ["una familia que nunca se vende, por partes", (c) => { c.tipos.checkout.partes = { divisiones: ["puertas"] }; c.tipos.checkout.geometria = { puertas: [1, 6] }; }, /`partes.divisiones` son clases que dividen/],
    ["la división como un rango de familia", (c) => { c.tipos.nevera_puertas.geometria.division = [1, 2]; }, /`geometria` sólo admite/],
    // Las piezas (paso 3).
    ["una pieza que dice dividir la cara", (c) => { c.partes.clases.bahias.es = "division"; }, /checkout: `partes.piezas` son clases que son piezas/],
    ["el forro contado con un entero", (c) => { c.partes.clases.forro.campo = "bahias"; }, /parte forro: una pieza única se cuenta con un sí o no/],
    ["las bahías contadas con un sí o no", (c) => { c.partes.clases.bahias.campo = "forro"; }, /parte bahias: `campo` tiene que ser un entero/],
    ["una división única", (c) => { c.partes.clases.puertas.unico = true; }, /parte puertas: `unico` es true y sólo en una pieza/],
    ["un sí o no como rango de familia", (c) => { c.tipos.columna.geometria = { forro: [0, 1] }; }, /columna: `geometria` sólo admite/],
    ["una caja con bahías y sin su rango", (c) => { delete c.tipos.checkout.geometria; }, /checkout: `partes.piezas` son clases que son piezas/],
    ["`mirando` en lo que se cuenta de abajo hacia arriba", (c) => { c.partes.clases.entrepanos.mirando = "la góndola"; }, /parte entrepanos: `mirando` es un texto/],
    ["una familia con `partes` vacío", (c) => { c.tipos.columna.partes = {}; }, /columna: `partes` dice sus divisiones o sus piezas/],
    ["el forro como un número en la ficha", (c) => { c.fichas.geometria.forro = { enPartes: true, entero: true, booleano: true }; }, /`fichas.geometria`/],
    ["el nombre de informe de la bahía lleva a otra fila", (c) => { c.partes.clases.bahias.informe = "forro de columna"; }, /parte bahias: los informes lo llaman «forro de columna»/],
    ["el nombre de informe de la puerta lleva a otra fila", (c) => { c.partes.clases.puertas.informe = "nevera de puertas"; }, /parte puertas: los informes lo llaman «nevera de puertas»/],
    ["una tarifa de modelo sin fila", (c) => { c.modelos.find((m) => m.tarifa).tarifa = "estiba_octava"; }, /la tarifa `estiba_octava` no está en `tarifas`/],
    ["una tarifa de modelo sin nombre de informe", (c) => { delete c.modelos.find((m) => m.tarifa).informePlural; }, /tiene tarifa propia y los informes/],
    ["una tarifa de modelo que lleva a otra fila", (c) => { c.modelos.find((m) => m.tarifa === "estiba_media").informe = "cuarto de estiba"; },
      /los informes lo llaman «cuarto de estiba» y en Tarifas eso es `estiba_cuarta`/],
    ["una tarifa que no es de nadie", (c) => { c.tarifas.push({ clave: "huerfana", rotulo: "Huérfana" }); }, /la tarifa `huerfana` no es de ningún tipo, ni de ningún modelo, ni de ninguna clase de parte/],
    ["una fuente sin URL https", (c) => { c.modelos[0].fuente.url = "http://ejemplo.co/ficha"; }, /la fuente no tiene una URL https/],
    ["una fuente que es una imagen", (c) => { c.modelos[0].fuente.url = "https://ejemplo.co/gondola.JPG"; }, /la fuente es una imagen/],
    ["una confiabilidad inventada", (c) => { c.modelos[0].fuente.confiabilidad = "segura"; }, /la confiabilidad tiene que ser/],
    ["una foto en el modelo", (c) => { c.modelos[0].foto = "https://ejemplo.co/g.png"; }, /clave desconocida `foto`/],
    ["un tipo con modelos y sin rango", (c) => { delete c.tipos.punta.rango; }, /su tipo no tiene `rango`/],
    // Las reglas de las fichas: las mismas para los modelos de acá y para las
    // fichas propias que valida el servidor.
    ["la confiabilidad sale de las reglas de las fichas", (c) => { c.fichas.confiabilidad = ["ficha", "catalogo"]; },
      /base:gondola-central-150-m090: la confiabilidad tiene que ser/],
    ["lo que es una imagen sale de las reglas de las fichas", (c) => { c.fichas.fuenteQueEsImagen = "\\.co/"; }, /la fuente es una imagen/],
    ["la geometría entera sale de las reglas de las fichas", (c) => {
      c.fichas.geometria.modulo.entero = true; }, /`modulo` = 0\.9 está fuera de su rango/],
    ["un nombre más largo que el de una ficha", (c) => { c.modelos[0].nombre = "x".repeat(81); }, /el nombre tiene hasta 80 letras/],
    ["una nota más larga que la de una ficha", (c) => { c.modelos[0].fuente.nota = "x".repeat(601); }, /la nota tiene hasta 600 letras/],
    ["las reglas de las fichas sin confiabilidad", (c) => { delete c.fichas.confiabilidad; }, /`fichas\.confiabilidad`/],
    ["una clave de ficha que deja pasar los dos puntos", (c) => { c.fichas.clave = "^[a-z0-9:-]{1,60}$"; }, /`fichas\.clave`/],
    ["una clave de ficha que no es una expresión", (c) => { c.fichas.clave = "^([a-z$"; }, /`fichas\.clave`/],
    ["una geometría de ficha sin decir dónde vive", (c) => { delete c.fichas.geometria.puertas.enPartes; }, /`fichas\.geometria`/],
    ["el prefijo propio igual al de los modelos", (c) => { c.fichas.prefijoPropio = "base:"; }, /`fichas\.prefijoPropio`/],
    ["una regla de ficha mal escrita", (c) => { c.fichas.largoMaxmo = {}; }, /clave desconocida `largoMaxmo` en `fichas`/],
  ];
  for (const [que, cambiar, motivo] of casos) {
    const mal = roto(cambiar);
    assert.ok(mal.some((m) => motivo.test(m)), `no se queja de ${que}: ${JSON.stringify(mal)}`);
  }
});

await prueba("la copia del servidor es idéntica byte a byte", () => {
  // La imagen de Docker lleva `backend/` y `frontend/dist`: el servidor no ve
  // `src/`, así que tiene su copia. Separadas, el servidor renumera, cobra y
  // decide qué se vende con otro catálogo que el de la pantalla.
  assert.ok(readFileSync(RUTA_CATALOGO).equals(readFileSync(RUTA_COPIA)),
    "backend/app/catalogo/muebles.json no es igual a frontend/src/catalogo/muebles.json: copiá el que cambiaste sobre el otro");
});

// ═══════════════════════════════════════════════════════════════════════════
// 2 · LOS TIPOS DE TYPESCRIPT Y LA REGLA DE LAS CARAS
// ═══════════════════════════════════════════════════════════════════════════

const F = await cargar("src/types/fixtures.ts");

/** Los miembros de un `export type X = "a" | "b" | …;`: es un tipo, no corre. */
const unionDe = (rel, nombre) => {
  const m = new RegExp(`export type ${nombre} =([^;]*);`).exec(leer(join(raiz, rel)));
  assert.ok(m, `no se encontró \`${nombre}\` en ${rel}`);
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]).sort();
};

await prueba("los tipos de TypeScript son los del catálogo", () => {
  const tipos = Object.keys(CATALOGO.tipos);
  assert.deepEqual(unionDe("src/types/fixtures.ts", "FixType"), [...tipos].sort(),
    "`FixType` no tiene los mismos tipos que el catálogo");
  const legados = tipos.filter((t) => CATALOGO.tipos[t].legado);
  assert.deepEqual(unionDe("src/utils/convertirPlano.ts", "FixType2D"), [...CATALOGO.orden.plano2D, ...legados].sort(),
    "`FixType2D` no es la biblioteca del 2D más los legados");
  const variantes = new Set(Object.values(CATALOGO.tipos).flatMap((d) => Object.keys(d.variantes ?? {})));
  assert.deepEqual(unionDe("src/types/fixtures.ts", "GondolaType"), [...variantes].sort(),
    "`GondolaType` no son las variantes del catálogo");
});

await prueba("`carasDe` dice lo mismo que el catálogo", () => {
  // La regla de la cara B es código (`carasDe`, con sus casos compartidos en
  // `casos/caras.json`); el catálogo anota cuántas caras tiene cada variante.
  // Si dicen otra cosa, uno de los dos miente.
  for (const [t, d] of Object.entries(CATALOGO.tipos)) {
    if (!d.variantes) { assert.equal(F.carasDe({ type: t }), 1, `${t} tiene cara B`); continue; }
    for (const [v, f] of Object.entries(d.variantes)) {
      assert.equal(F.carasDe({ type: t, gondolaType: v }), f.caras, `${t}:${v}`);
    }
  }
  for (const [a, x] of Object.entries(CATALOGO.alias)) {
    assert.equal(F.carasDe({ type: a }), CATALOGO.tipos[x.tipo].variantes[x.variante].caras, a);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 3 · LAS TABLAS SALEN DEL ARCHIVO
// ═══════════════════════════════════════════════════════════════════════════

await prueba("cada tabla cambia cuando cambia el catálogo", async () => {
  const c = structuredClone(CATALOGO);
  const p = c.tipos.punta;
  Object.assign(p, {
    prefijo: "PNX", rotuloEditor: "Punta adulterada", medidas: { w: 0.91, d: 0.41, h: 1.77 },
    color: "#010203", emoji: "X", descripcion: "adulterada", grupo2D: "Grupo adulterado",
    categoria: "Familia adulterada", informe: "puntica", informePlural: "punticas",
    banderas: ["frio", "formaCorrida"], referencia: { corto: "Puntas", frase: "las puntas" },
  });
  c.tipos.metro.alquilable = "nunca";
  c.tipos.batea.alquilable = "no_por_defecto";
  c.tipos.isla.tarifa = "estiba";
  c.tarifas.push({ clave: "estiba", rotulo: "Estiba adulterada" });
  c.tipos.nevera_carnes.color2D = "#0a0b0c";
  c.tipos.exhibicion.medidas.h = 1.23;
  c.tipos.exhibicion.color = "#abcdef";
  c.tipos.gondola.variantes.wall.medidas.h = 2.22;
  c.alias.gondola_mural.banderas.push("producto");
  c.prefijoDesconocido = "ZZZ";
  // Los modelos: una ficha con otras medidas y otras puertas, y una tarifa
  // propia con otra clave y otro nombre.
  const nev = c.modelos.find((m) => m.id === "base:nevera-3p-frigomaster");
  Object.assign(nev, { w: 2.11, color: "#0d0e0f", partes: { puertas: 5 } });
  const media = c.modelos.find((m) => m.id === "base:estiba-media");
  Object.assign(media, { tarifa: "media_adulterada", informe: "medita", informePlural: "meditas" });
  c.tarifas.push({ clave: "media_adulterada", rotulo: "Medita" });
  // Al revés: lo primero pasa a ser lo que hoy es último, sea cual sea.
  const ultimo3D = c.orden.editor3D.at(-1).split(":")[0];
  const ultimo2D = c.orden.plano2D.at(-1);
  c.orden.editor3D.reverse();
  c.orden.plano2D.reverse();
  c.orden.minimapa = ["punta", ...c.orden.minimapa];

  const [Fa, Na, FMTa, Pa, PASa, C3a, C2a, CMa] = await Promise.all([
    "src/types/fixtures.ts", "src/utils/nomenclatura.ts", "src/components/plataforma/formato.ts",
    "src/components/StoreEditor3D/muebles/producto.ts", "src/utils/pasillos.ts",
    "src/catalogo/editor3D.ts", "src/catalogo/plano2D.ts", "src/catalogo/minimapa.ts",
  ].map((rel) => cargar(rel, c)));

  // types/fixtures.ts
  assert.ok(Fa.NUNCA_ALQUILABLE.has("metro"), "NUNCA_ALQUILABLE no sale del catálogo");
  assert.ok(Fa.NON_RENTABLE_BY_DEFAULT.has("batea"), "NON_RENTABLE_BY_DEFAULT no sale del catálogo");
  assert.equal(Fa.rateTypeOf({ type: "isla" }), "estiba", "rateTypeOf no sale del catálogo");
  assert.equal(Fa.rateTypeOf({ type: "gondola_mural" }), "gondola", "rateTypeOf perdió los alias");
  assert.ok(Fa.RATE_TYPES.some((t) => t.type === "estiba" && t.label === "Estiba adulterada"), "RATE_TYPES no sale del catálogo");
  assert.equal(Fa.CATEGORIA_DE_TIPO.punta, "Familia adulterada", "CATEGORIA_DE_TIPO no sale del catálogo");
  assert.equal(Fa.rateTypeOf({ type: "isla", modelo: "base:estiba-media" }), "media_adulterada",
    "la tarifa del modelo no sale del catálogo");
  // utils/nomenclatura.ts
  assert.equal(Na.PREFIJO_POR_TIPO.punta, "PNX", "PREFIJO_POR_TIPO no sale del catálogo");
  assert.equal(Na.siguienteCodigo("punta", []), "PNX-01");
  assert.equal(Na.prefijoDe("nada"), "ZZZ", "el prefijo de lo desconocido no sale del catálogo");
  // plataforma/formato.ts
  assert.equal(FMTa.tipoN("punta"), "puntica", "los nombres de los informes no salen del catálogo");
  assert.equal(FMTa.tipoP("punta", 2), "punticas");
  assert.equal(FMTa.tipoN("fuera_del_plano"), "fuera del plano", "se perdió `fuera_del_plano`");
  assert.equal(FMTa.tipoN("media_adulterada"), "medita", "los nombres de las tarifas de los modelos no salen del catálogo");
  assert.equal(FMTa.tipoP("media_adulterada", 3), "meditas");
  // muebles/producto.ts y utils/pasillos.ts
  assert.ok(Pa.MUEBLES_FRIOS.has("punta"), "MUEBLES_FRIOS no sale del catálogo");
  assert.ok(PASa.FORMAN_CORRIDA.has("punta"), "FORMAN_CORRIDA no sale del catálogo");
  // catalogo/editor3D.ts
  assert.equal(C3a.FIXTURE_DEFS[0].type, ultimo3D, "FIXTURE_DEFS no sigue `orden.editor3D`");
  assert.deepEqual(C3a.FIXTURE_DEFS.find((d) => d.type === "punta"), {
    type: "punta", label: "Punta adulterada", w: 0.91, d: 0.41, h: 1.77,
    color: "#010203", emoji: "X", desc: "adulterada", code: "PNX",
  }, "FIXTURE_DEFS no sale del catálogo");
  assert.equal(C3a.FIXTURE_DEFS.find((d) => d.gondolaType === "wall").h, 2.22, "las variantes no salen del catálogo");
  assert.ok(C3a.TIPOS_CON_PRODUCTO.has("gondola_mural") && !C3a.TIPOS_CON_PRODUCTO.has("punta"), "TIPOS_CON_PRODUCTO no sale del catálogo");
  assert.ok(!C3a.TIPOS_CON_PRUEBA_3D.has("punta"), "TIPOS_CON_PRUEBA_3D no sale del catálogo");
  assert.ok(!C3a.TIPOS_CON_SURTIDO.has("punta"), "TIPOS_CON_SURTIDO no sale del catálogo");
  const nev3D = C3a.PALETA_3D.find((f) => f.entrada === "nevera_puertas")?.modelos.find((m) => m.modelo === nev.id);
  assert.ok(nev3D && nev3D.w === 2.11 && nev3D.color === "#0d0e0f" && nev3D.partes?.puertas === 5,
    "la paleta del 3D no sale de los modelos del catálogo");
  // catalogo/plano2D.ts
  assert.equal(C2a.CATALOG[0].type, ultimo2D, "CATALOG no sigue `orden.plano2D`");
  assert.deepEqual(C2a.CATALOG.find((x) => x.type === "punta"), {
    type: "punta", label: "Punta adulterada", w: 0.91, h: 0.41, emoji: "X", prefix: "PNX", category: "Grupo adulterado",
  }, "CATALOG no sale del catálogo");
  assert.equal(C2a.H_DEFAULTS.punta, 1.77, "H_DEFAULTS no sale del catálogo");
  assert.equal(C2a.H_DEFAULTS.gondola_mural, 2.22, "H_DEFAULTS no sigue a la variante del alias");
  assert.equal(C2a.H_DEFAULTS.exhibicion, 1.23, "H_DEFAULTS no sigue al legado");
  assert.equal(C2a.COLOR_DEFAULTS.punta, "#010203", "COLOR_DEFAULTS no sale del catálogo");
  assert.equal(C2a.COLOR_DEFAULTS.nevera_carnes, "#0a0b0c", "COLOR_DEFAULTS no usa `color2D`");
  assert.equal(C2a.COLOR_DEFAULTS.exhibicion, "#abcdef", "COLOR_DEFAULTS no sigue al legado");
  const nev2D = C2a.MODELOS_2D.nevera_puertas?.find((m) => m.id === nev.id);
  assert.ok(nev2D && nev2D.w === 2.11 && nev2D.nace.color === "#0d0e0f" && nev2D.nace.partes?.puertas === 5,
    "la biblioteca del 2D no sale de los modelos del catálogo");
  // catalogo/minimapa.ts
  assert.equal(Object.keys(CMa.REFERENCIAS)[0], "punta", "REFERENCIAS no sigue `orden.minimapa`");
  assert.deepEqual(CMa.REFERENCIAS.punta, { corto: "Puntas", frase: "las puntas" }, "REFERENCIAS no sale del catálogo");
});

// ═══════════════════════════════════════════════════════════════════════════
// 3a · LOS MODELOS
// ═══════════════════════════════════════════════════════════════════════════

/** La entrada de paleta de un modelo: `tipo:variante` en el 3D, y en el 2D el
 *  alias de esa variante (`gondola_doble`). */
const entrada3D = (m) => (m.variante ? `${m.tipo}:${m.variante}` : m.tipo);
const entrada2D = (m) => (m.variante
  ? Object.entries(CATALOGO.alias).find(([, x]) => x.tipo === m.tipo && x.variante === m.variante)[0]
  : m.tipo);

await prueba("las paletas listan cada modelo una vez, bajo su familia, después de su modelo base", async () => {
  const [C3, C2] = await Promise.all(["src/catalogo/editor3D.ts", "src/catalogo/plano2D.ts"].map((r) => cargar(r)));
  // El 3D: la familia es su modelo base, que es EL de `FIXTURE_DEFS` (mismo
  // objeto y mismo orden: `/taller` elige por posición, y colocarlo es colocar
  // el mueble como siempre).
  assert.equal(C3.PALETA_3D.length, C3.FIXTURE_DEFS.length);
  C3.PALETA_3D.forEach((f, i) => {
    assert.deepEqual(f.base, C3.FIXTURE_DEFS[i], `${f.entrada}: el modelo base no es el de FIXTURE_DEFS`);
    for (const k of ["modelo", "entrepanos", "modulo", "partes"]) assert.equal(f.base[k], undefined, `${f.entrada}: el modelo base estampa «${k}»`);
  });
  const en3D = C3.PALETA_3D.flatMap((f) => f.modelos.map((m) => [m.modelo, f.entrada, m, f.base]));
  const en2D = Object.entries(C2.MODELOS_2D).flatMap(([t, ms]) => ms.map((m) => [m.id, t, m]));
  const ids = CATALOGO.modelos.map((m) => m.id).sort();
  assert.deepEqual(en3D.map((x) => x[0]).sort(), ids, "la paleta del 3D no tiene cada modelo una vez");
  assert.deepEqual(en2D.map((x) => x[0]).sort(), ids, "la biblioteca del 2D no tiene cada modelo una vez");
  for (const [id, entrada, def, base] of en3D) {
    const m = CATALOGO.modelos.find((x) => x.id === id);
    assert.equal(entrada, entrada3D(m), `${id}: está en la familia ${entrada} del 3D`);
    // Con el rótulo y el emoji de su tipo (el 2D estampa el rótulo en `label`
    // al abrir el plano: tiene que ser el de siempre), y las medidas, el
    // color y la geometría de la ficha.
    assert.deepEqual(
      { label: def.label, emoji: def.emoji, type: def.type, gondolaType: def.gondolaType, code: def.code },
      { label: base.label, emoji: base.emoji, type: base.type, gondolaType: base.gondolaType, code: base.code },
      `${id}: no se coloca como su tipo`);
    assert.deepEqual([def.w, def.d, def.h], [m.w, m.d, m.h], `${id}: no se coloca con las medidas de su ficha`);
    assert.equal(def.color, m.color ?? base.color, `${id}: no nace con el color de su ficha o el de su tipo`);
    assert.equal(def.entrepanos, m.entrepanos, id);
    assert.equal(def.modulo, m.modulo, id);
    assert.deepEqual(def.partes, m.partes, id);
    assert.equal(def.estimado, m.fuente.confiabilidad === "estimado", `${id}: el «≈» no sigue a la confiabilidad`);
  }
  for (const [id, t, m2] of en2D) {
    const m = CATALOGO.modelos.find((x) => x.id === id);
    assert.equal(t, entrada2D(m), `${id}: está en la familia ${t} del 2D`);
    assert.deepEqual([m2.w, m2.h, m2.nace.h], [m.w, m.d, m.h], `${id}: el 2D no lo dibuja con las medidas de su ficha`);
    assert.equal(m2.nace.modelo, id);
    assert.equal(m2.nace.color, m.color ?? C2.COLOR_DEFAULTS[t], `${id}: el 2D no lo hace nacer con su color`);
    assert.equal(m2.nace.entrepanos, m.entrepanos, id);
    assert.equal(m2.nace.modulo, m.modulo, id);
    assert.deepEqual(m2.nace.partes, m.partes, id);
  }
});

const libre = { status: "free", supplierName: "", brandCategory: "", negotiatedValue: 0, startDate: "", endDate: "", observation: "" };

await prueba("colocar un modelo estampa su ficha, y cambiar la ficha no mueve lo ya colocado", async () => {
  const [CP, C3, C2] = await Promise.all(["src/utils/convertirPlano.ts", "src/catalogo/editor3D.ts", "src/catalogo/plano2D.ts"].map((r) => cargar(r)));
  const ID = "base:nevera-3p-frigomaster";
  // El 3D: lo que arma `onFloorClick` con la entrada de la paleta.
  const def = C3.PALETA_3D.find((f) => f.entrada === "nevera_puertas").modelos.find((m) => m.modelo === ID);
  const colocado = {
    id: "nev-1", code: "NEV-01", type: def.type, x: 3, z: 4, rotY: 0, w: def.w, d: def.d, h: def.h,
    label: def.label, color: def.color, ...libre, ...CP.fichaDe(def),
  };
  const [f] = CP.fixturesToStore([colocado], "NAVE", []);
  assert.deepEqual({ modelo: f.modelo, w: f.w, d: f.d, h: f.h, partes: f.partes },
    { modelo: ID, w: 2.07, d: 0.7, h: 2.1, partes: { puertas: 3, division: "puertas" } }, "el 3D no estampó la ficha");
  assert.equal(f.label, "Nevera de Puertas", "el 3D no estampó el rótulo de su tipo");

  // El 2D: lo que arma `placeItem` con el modelo de la biblioteca.
  const m2 = C2.MODELOS_2D.gondola_doble.find((m) => m.id === "base:gondola-central-200-m100");
  const item = { id: "g-1", type: "gondola_doble", code: "GON-01", label: "Góndola Doble", x: 0, y: 0,
    w: m2.w, h: m2.h, rotY: 0, ...libre, sede: "NAVE", nace: m2.nace };
  const [g] = CP.itemsToStore([item], [], C2.CATALOGO_2D);
  assert.deepEqual(
    { modelo: g.modelo, type: g.type, gondolaType: g.gondolaType, w: g.w, d: g.d, h: g.h, entrepanos: g.entrepanos, modulo: g.modulo },
    { modelo: m2.id, type: "gondola", gondolaType: "double", w: 1, d: 1, h: 2, entrepanos: 4, modulo: 1 },
    "el 2D no estampó la ficha");
  assert.equal("nace" in g, false, "`nace` es del editor: no va al plano");
  // Con guardado, `nace` no pisa nada: la ficha la manda lo guardado.
  const otra = CP.itemsToStore([{ ...item, nace: { ...m2.nace, h: 1.5, modelo: "base:otra", entrepanos: 2 } }], [g], C2.CATALOGO_2D)[0];
  assert.deepEqual([otra.h, otra.modelo, otra.entrepanos], [2, m2.id, 4], "con guardado, `nace` pisó la ficha");
  // Un duplicado nace con la ficha del original.
  const [vuelta] = CP.storeToItems([g], C2.CATALOGO_2D);
  const dup = CP.itemsToStore([{ ...vuelta, id: "g-2", code: "GON-02" }], [g], C2.CATALOGO_2D)[0];
  assert.deepEqual([dup.modelo, dup.h, dup.entrepanos, dup.modulo], [m2.id, 2, 4, 1], "el duplicado no nace con la ficha del original");
  // Uno sin modelo no trae `nace` del store y nace como siempre.
  const [sin] = CP.storeToItems([{ ...g, modelo: undefined, entrepanos: undefined, modulo: undefined }], C2.CATALOGO_2D);
  assert.equal("nace" in sin, false, "un mueble sin modelo sale del store con `nace`");

  // Y lo de arriba es lo que arman los editores DE VERDAD: las líneas que
  // estampan la ficha al colocar (si se pierden, una media estiba colocada
  // desde la paleta se guarda sin `modelo` y la planilla la compara con la
  // tarifa de la estiba entera; la nevera de 4 puertas, sin `partes`).
  const sinComent = (t) => t.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, (m, p1) => p1);
  const ed3D = sinComent(leer(join(raiz, "src", "components", "StoreEditor3D", "StoreEditor3D.tsx")));
  const ed2D = sinComent(leer(join(raiz, "src", "components", "FloorPlan2D", "FloorPlan2D.tsx")));
  const entre = (t, desde, hasta) => {
    const i = t.indexOf(desde);
    assert.ok(i >= 0, `no se encontró \`${desde}\``);
    const j = t.indexOf(hasta, i + desde.length);
    assert.ok(j > i, `no se encontró \`${hasta}\` después de \`${desde}\``);
    return t.slice(i, j + hasta.length);
  };
  const clic3D = entre(ed3D, "function onFloorClick(", "u(prev=>[...prev,newFix]);");
  assert.match(entre(clic3D, "const newFix: PlacedFixture = {", "};"), /\.\.\.fichaDe\(placingDef\),\s*\};$/,
    "el Editor 3D coloca sin estampar la ficha del modelo (`...fichaDe(placingDef)` en `newFix`)");
  assert.match(entre(ed3D, "const ghostFixture: PlacedFixture | null = placingDef ? {", "} : null;"), /\.\.\.fichaDe\(placingDef\),/,
    "el fantasma del 3D no se ve con la ficha del modelo");
  const coloca2D = entre(ed2D, "const placeItem = useCallback(", "[nextCode, sede]");
  assert.match(entre(coloca2D, "const newItem: PlacedItem2D = {", "};"), /\.\.\.\(modelo \? \{ nace: modelo\.nace \} : \{\}\),\s*\};$/,
    "el plano 2D coloca sin `nace` (la ficha del modelo no llega al store)");
  assert.match(coloca2D, /const ancho = w \?\? modelo\?\.w \?\? def\.w;\s*const fondo = h \?\? modelo\?\.h \?\? def\.h;/,
    "el plano 2D no coloca el modelo con las medidas de su ficha");
  assert.match(ed2D, /placeItem\(pendingType, pt\.x, pt\.y, undefined, undefined, pendingModelo\);/,
    "el clic del plano 2D no le pasa el modelo elegido a `placeItem`");
  assert.match(ed2D, /onClick=\{\(\) => \{ setActiveTool\("place"\); setPendingType\(def\.type\); setPendingModelo\(m\); \}\}/,
    "la biblioteca del 2D no elige el modelo");
  assert.match(ed3D, /onClick=\{\(\)=>\{ setPlacingDef\(activo\?null:m\);/, "la paleta del 3D no coloca el modelo elegido");

  // La ficha cambia en el catálogo: lo colocado va y vuelve por los dos
  // editores tal como se guardó.
  const c = structuredClone(CATALOGO);
  Object.assign(c.modelos.find((m) => m.id === ID), { w: 2.5, h: 1.9, partes: { puertas: 4 } });
  Object.assign(c.modelos.find((m) => m.id === m2.id), { h: 1.8, entrepanos: 3, modulo: 1.2 });
  const [C3a, C2a] = await Promise.all([cargar("src/catalogo/editor3D.ts", c), cargar("src/catalogo/plano2D.ts", c)]);
  const plano = [f, g];
  const ficha = (x) => ({ w: x.w, d: x.d, h: x.h, modelo: x.modelo, entrepanos: x.entrepanos, modulo: x.modulo, partes: x.partes });
  const tras3D = CP.fixturesToStore(CP.storeToFixtures(plano, { defs: C3a.FIXTURE_DEFS, slotsPorDefecto: () => [] }), "NAVE", plano);
  const tras2D = CP.itemsToStore(CP.storeToItems(tras3D, C2a.CATALOGO_2D), tras3D, C2a.CATALOGO_2D);
  for (const x of plano) {
    assert.deepEqual(ficha(tras3D.find((y) => y.id === x.id)), ficha(x), `${x.id}: el 3D releyó la ficha`);
    assert.deepEqual(ficha(tras2D.find((y) => y.id === x.id)), ficha(x), `${x.id}: el 2D releyó la ficha`);
  }
});

await prueba("la tarifa sale del modelo del mueble si tiene una propia, y si no, la del tipo", async () => {
  const [F2, FMT] = await Promise.all(["src/types/fixtures.ts", "src/components/plataforma/formato.ts"].map((r) => cargar(r)));
  const casos = [
    [{ type: "isla" }, "isla"],
    [{ type: "isla", modelo: "base:estiba-completa" }, "isla"],
    [{ type: "isla", modelo: "base:estiba-media" }, "estiba_media"],
    [{ type: "isla", modelo: "base:estiba-cuarta" }, "estiba_cuarta"],
    [{ type: "impulsador", modelo: "base:exhibidor-carton" }, "exhibidor_carton"],
    [{ type: "nevera_puertas", modelo: "base:nevera-3p-frigomaster" }, "nevera_puertas"],
    [{ type: "nevera_puertas" }, "nevera_puertas"],
    [{ type: "puesto_impulso", modelo: "base:puesto-impulso-80" }, "puesto_impulso"],
    [{ type: "gondola_mural", modelo: "base:gondola-pared-200-m120" }, "gondola"],
    // Un id que no corresponde no le cambia la tarifa a nadie.
    [{ type: "punta", modelo: "base:estiba-media" }, "punta"],
    [{ type: "isla", modelo: "base:no-existe" }, "isla"],
    [{ type: "isla", modelo: "constructor" }, "isla"],
  ];
  for (const [f, esperado] of casos) assert.equal(F2.rateTypeOf(f), esperado, JSON.stringify(f));
  // Tarifas las muestra todas, con su rótulo, y los informes las nombran.
  for (const [clave, rotulo] of [["nevera_puertas", "Nevera de puertas"], ["puesto_impulso", "Puesto de impulso"],
    ["estiba_media", "Media estiba"], ["estiba_cuarta", "Cuarto de estiba"], ["exhibidor_carton", "Exhibidor de cartón"]]) {
    assert.ok(F2.RATE_TYPES.some((r) => r.type === clave && r.label === rotulo), `Tarifas no muestra «${rotulo}»`);
    assert.equal(F2.rateTypeLabel(clave), rotulo);
    assert.notEqual(FMT.tipoN(clave), clave, `los informes dicen «${clave}» tal cual`);
  }
});

await prueba("un id de modelo que ya salió no desaparece ni cambia de tipo, variante o tarifa", () => {
  // Lo colocado guarda el id: con él se buscan la tarifa propia y el nombre
  // del modelo en el panel. La lista escrita (`casos/modelos-ids.json`, la
  // misma que lee `test_modelos_de_muebles.py`) sólo admite sumar.
  const comoHoy = (c) => Object.fromEntries(c.modelos.map((m) => [m.id, {
    tipo: m.tipo, ...(m.variante ? { variante: m.variante } : {}), ...(m.tarifa ? { tarifa: m.tarifa } : {}),
  }]));
  const escritos = JSON.parse(leer(join(aqui, "casos", "modelos-ids.json"))).modelos;
  const revisar = (c) => {
    const hoy = comoHoy(c);
    for (const [id, esperado] of Object.entries(escritos)) {
      assert.ok(id in hoy, `el modelo «${id}» desapareció o se renombró: lo colocado con él pierde su nombre y su tarifa`);
      assert.deepEqual(hoy[id], esperado, `«${id}» cambió de tipo, variante o tarifa`);
    }
    const nuevos = Object.keys(hoy).filter((id) => !(id in escritos));
    assert.deepEqual(nuevos, [], `modelos nuevos sin sumar a casos/modelos-ids.json: ${nuevos}`);
  };
  revisar(CATALOGO);
  // Y se queja: un id renombrado, uno que cambia de variante, uno sin anotar.
  for (const [que, romper] of [
    ["un id renombrado", (c) => { c.modelos.find((m) => m.id === "base:gondola-pared-150-m090").id = "base:gondola-pared-150-m095"; }],
    ["otra variante", (c) => { c.modelos.find((m) => m.id === "base:gondola-pared-150-m090").variante = "double"; }],
    ["una tarifa propia nueva", (c) => { c.modelos.find((m) => m.id === "base:nevera-1p-inducol").tarifa = "nevera_puertas"; }],
  ]) {
    const c = structuredClone(CATALOGO);
    romper(c);
    assert.throws(() => revisar(c), undefined, `${que} no se notó`);
  }
});

await prueba("quien pregunta la tarifa le pasa el MUEBLE, no sólo su tipo", () => {
  // `rateTypeOf` mira primero el `modelo` del mueble. Pasarle `{ type }`
  // compila igual y pierde la tarifa propia: la ficha del contrato, «por debajo
  // de la referencia» y el agrupado del tablero comparaban la media estiba con
  // la estiba entera. Cada llamada recibe el mueble tal cual (un nombre o un
  // camino como `x.fixture`), nunca un objeto armado ni su `.type`. Lo mismo
  // `tipoDelMueble` (`catalogo/nombresPropios.ts`), que es como las pantallas
  // dicen el tipo de una cara desde que cada supermercado le pone su nombre a
  // cada familia: su primer argumento es el mueble.
  const archivos = [];
  const recorrer = (d) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) recorrer(p);
      else if (/\.(ts|tsx)$/.test(n)) archivos.push(p);
    }
  };
  recorrer(join(raiz, "src"));
  const llamadas = [];
  for (const a of archivos) {
    const t = leer(a).replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, (m, p1) => p1);
    for (const m of t.matchAll(/rateTypeOf\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g)) {
      if (t.slice(Math.max(0, m.index - 9), m.index) === "function ") continue;
      llamadas.push([a.slice(raiz.length + 1), m[1].trim()]);
    }
    for (const m of t.matchAll(/tipoDelMueble\(([^,()]*(?:\([^()]*\)[^,()]*)*),/g)) {
      if (t.slice(Math.max(0, m.index - 9), m.index) === "function ") continue;
      llamadas.push([a.slice(raiz.length + 1), m[1].trim()]);
    }
  }
  assert.ok(llamadas.length >= 10, `se esperaban las llamadas de Vender, el contrato y el tablero; hay ${llamadas.length}`);
  for (const [a, arg] of llamadas) {
    assert.match(arg, /^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*$/, `${a}: \`rateTypeOf(${arg})\` no le pasa el mueble tal cual`);
    assert.ok(!/\.(type|modelo)$/.test(arg), `${a}: \`rateTypeOf(${arg})\` le pasa un campo, no el mueble`);
  }
});

await prueba("cada tipo tiene quién lo dibuja en el 3D", () => {
  // Un tipo sin su `case` en `FixtureMesh` cae en el `default` y se dibuja
  // como una estiba: el tipo nuevo «andaba» y se veía otro mueble.
  const src = leer(join(raiz, "src", "components", "StoreEditor3D", "StoreEditor3D.tsx"));
  const ini = src.indexOf("export function FixtureMesh(");
  assert.ok(ini >= 0, "no se encontró FixtureMesh");
  const cuerpo = src.slice(ini, src.indexOf("default:", ini));
  for (const [t, d] of Object.entries(CATALOGO.tipos)) {
    if (d.legado) continue;
    assert.match(cuerpo, new RegExp(`case "${t}":`), `\`${t}\` no tiene su case en FixtureMesh`);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 3a' · LAS FICHAS PROPIAS DEL SUPERMERCADO
// ═══════════════════════════════════════════════════════════════════════════
//
// La dueña arma en el taller las fichas de los muebles que su supermercado
// tiene y el catálogo no (`cli:<clave>`, en su base). Se ofrecen en las dos
// paletas debajo de su familia —después de las de RECABRA, y nunca las
// retiradas—, se colocan ESTAMPANDO la ficha como un modelo del catálogo, el
// panel las nombra y la tarifa las resuelve con la misma regla que el servidor.

/** Varios módulos de `src` en UN paquete: comparten `catalogo/propias.ts` (lo
 *  que el store llena y `rateTypeOf` lee), como en el navegador. */
const cargarJuntos = async (modulos) => {
  const r = await build({
    stdin: {
      contents: Object.entries(modulos).map(([n, rel]) => `export * as ${n} from "./${rel}";`).join("\n"),
      resolveDir: raiz, loader: "ts",
    },
    bundle: true, write: false, format: "esm", platform: "neutral", logLevel: "silent",
  });
  return import("data:text/javascript;base64," + Buffer.from(r.outputFiles[0].text).toString("base64"));
};

/** Una ficha propia como la manda `GET /api/muebles/modelos`. */
const propia = (clave, datos) => ({
  id: `${CATALOGO.fichas.prefijoPropio}${clave}`, clave, retirado: false,
  fuente: { confiabilidad: "ficha", url: `https://fabricante.example.co/${clave}` }, ...datos,
});
const PROPIAS = [
  propia("nevera-inducol-2p", { tipo: "nevera_puertas", nombre: "Nevera Inducol 2 puertas", w: 1.445, d: 0.74, h: 2.1, partes: { puertas: 2 } }),
  propia("gondola-pared-170", { tipo: "gondola", variante: "wall", nombre: "Góndola de pared 1,70", w: 1, d: 0.45, h: 1.7, entrepanos: 4, modulo: 1,
    fuente: { confiabilidad: "estimado", nota: "Medida en la tienda con metro." } }),
  propia("cuarto-viejo", { tipo: "isla", nombre: "Cuarto de estiba viejo", w: 0.6, d: 0.5, h: 1.2, tarifa: "estiba_cuarta", retirado: true }),
  propia("media-bodega", { tipo: "isla", nombre: "Media estiba de bodega", w: 1, d: 0.6, h: 1.2, tarifa: "estiba_media" }),
];

await prueba("la paleta del 3D y la biblioteca del 2D muestran las fichas propias, después de las de RECABRA y sin las retiradas", async () => {
  const [C3, C2] = await Promise.all(["src/catalogo/editor3D.ts", "src/catalogo/plano2D.ts"].map((r) => cargar(r)));
  assert.equal(C3.paletaConPropias([]), C3.PALETA_3D, "sin fichas propias la paleta no es la de siempre");
  assert.equal(C2.modelosDelPlanoConPropias([]), C2.MODELOS_2D, "sin fichas propias la biblioteca no es la de siempre");
  const p3 = C3.paletaConPropias(PROPIAS);
  const p2 = C2.modelosDelPlanoConPropias(PROPIAS);
  const fam = (e) => p3.find((f) => f.entrada === e);
  // 3D: debajo de su familia, al final; las demás familias, el mismo objeto.
  for (const [entrada, clave] of [["nevera_puertas", "nevera-inducol-2p"], ["gondola:wall", "gondola-pared-170"], ["isla", "media-bodega"]]) {
    const f = fam(entrada);
    const base = C3.PALETA_3D.find((x) => x.entrada === entrada);
    assert.deepEqual(f.modelos.slice(0, base.modelos.length), base.modelos, `${entrada}: los modelos de RECABRA no van primero`);
    assert.equal(f.modelos.at(-1).modelo, `cli:${clave}`, `${entrada}: la ficha propia no está al final de su familia`);
    assert.equal(f.base, base.base, `${entrada}: el modelo base cambió`);
  }
  assert.equal(fam("punta"), C3.PALETA_3D.find((x) => x.entrada === "punta"), "una familia sin fichas propias no es el mismo objeto");
  assert.ok(!fam("gondola:double").modelos.some((m) => m.modelo === "cli:gondola-pared-170"), "la góndola de pared aparece en la central");
  const todas3D = p3.flatMap((f) => f.modelos.map((m) => m.modelo));
  assert.ok(!todas3D.includes("cli:cuarto-viejo"), "una ficha retirada se ofrece en la paleta del 3D");
  // Lo que coloca: el rótulo de su familia, las medidas y la geometría de la
  // ficha, el color de la familia (una ficha propia no lleva color), su nombre
  // y el «≈» si es estimada.
  const nev = fam("nevera_puertas").modelos.at(-1);
  const baseNev = fam("nevera_puertas").base;
  assert.deepEqual(
    { label: nev.label, type: nev.type, w: nev.w, d: nev.d, h: nev.h, color: nev.color, partes: nev.partes, nombre: nev.nombreModelo, est: nev.estimado },
    { label: baseNev.label, type: "nevera_puertas", w: 1.445, d: 0.74, h: 2.1, color: baseNev.color, partes: { puertas: 2 }, nombre: "Nevera Inducol 2 puertas", est: false },
    "la nevera propia no se coloca con su ficha");
  const gon = fam("gondola:wall").modelos.at(-1);
  assert.deepEqual([gon.gondolaType, gon.entrepanos, gon.modulo, gon.estimado], ["wall", 4, 1, true], "la góndola propia no trae su geometría o su «≈»");
  // 2D: la central y la de pared son dos entradas de la biblioteca.
  assert.equal(p2.nevera_puertas.at(-1).id, "cli:nevera-inducol-2p");
  assert.deepEqual(p2.nevera_puertas.slice(0, C2.MODELOS_2D.nevera_puertas.length), C2.MODELOS_2D.nevera_puertas, "el 2D no pone primero los de RECABRA");
  assert.equal(p2.gondola_mural.at(-1).id, "cli:gondola-pared-170");
  assert.ok(!p2.gondola_doble.some((m) => m.id === "cli:gondola-pared-170"), "la góndola de pared aparece en la doble del 2D");
  assert.ok(!Object.values(p2).flat().some((m) => m.id === "cli:cuarto-viejo"), "una ficha retirada se ofrece en la biblioteca del 2D");
  assert.equal(p2.punta, C2.MODELOS_2D.punta, "una familia del 2D sin fichas propias no es la misma lista");
  const g2 = p2.gondola_mural.at(-1);
  assert.deepEqual([g2.w, g2.h, g2.nace.h, g2.nace.modelo, g2.nace.entrepanos, g2.nace.modulo, g2.estimado, g2.nombre],
    [1, 0.45, 1.7, "cli:gondola-pared-170", 4, 1, true, "Góndola de pared 1,70"], "el 2D no dibuja la ficha propia con sus medidas");
  // Una ficha con un id que no es propio no se ofrece: no se la encontraría.
  const trucha = { ...PROPIAS[0], id: "base:nevera-1p-inducol", clave: "x" };
  assert.ok(!C3.paletaConPropias([trucha]).flatMap((f) => f.modelos).some((m) => m === trucha || (m.modelo === trucha.id && m.nombreModelo === trucha.nombre)),
    "una ficha con id de modelo del catálogo se ofrece en la paleta");
});

await prueba("colocar una ficha propia estampa su ficha con modelo «cli:<clave>», y cambiarla o retirarla no mueve lo colocado", async () => {
  const J = await cargarJuntos({ CP: "src/utils/convertirPlano.ts", C3: "src/catalogo/editor3D.ts", C2: "src/catalogo/plano2D.ts",
    P: "src/catalogo/propias.ts", C: "src/catalogo/catalogo.ts" });
  J.P.fijarFichasPropias(PROPIAS);
  // El 3D: lo que arma `onFloorClick` con la entrada de la paleta.
  const def = J.C3.paletaConPropias(PROPIAS).find((f) => f.entrada === "nevera_puertas").modelos.at(-1);
  const colocado = { id: "nev-9", code: "NEV-09", type: def.type, x: 3, z: 4, rotY: 0, w: def.w, d: def.d, h: def.h,
    label: def.label, color: def.color, ...libre, ...J.CP.fichaDe(def) };
  const [f] = J.CP.fixturesToStore([colocado], "NAVE", []);
  assert.deepEqual({ modelo: f.modelo, w: f.w, d: f.d, h: f.h, partes: f.partes },
    { modelo: "cli:nevera-inducol-2p", w: 1.445, d: 0.74, h: 2.1, partes: { puertas: 2 } }, "el 3D no estampó la ficha propia");
  // El 2D: lo que arma `placeItem` con el modelo de la biblioteca.
  const m2 = J.C2.modelosDelPlanoConPropias(PROPIAS).gondola_mural.at(-1);
  const item = { id: "g-9", type: "gondola_mural", code: "GON-09", label: "Góndola Mural", x: 0, y: 0, w: m2.w, h: m2.h, rotY: 0,
    ...libre, sede: "NAVE", nace: m2.nace };
  const [g] = J.CP.itemsToStore([item], [], J.C2.CATALOGO_2D);
  assert.deepEqual({ modelo: g.modelo, type: g.type, gondolaType: g.gondolaType, w: g.w, d: g.d, h: g.h, entrepanos: g.entrepanos, modulo: g.modulo },
    { modelo: "cli:gondola-pared-170", type: "gondola", gondolaType: "wall", w: 1, d: 0.45, h: 1.7, entrepanos: 4, modulo: 1 },
    "el 2D no estampó la ficha propia");
  // El panel la nombra: el nombre, el «≈» si es estimada, y la fuente.
  assert.equal(J.C.nombreDeModelo(J.C.modeloPorId(g.modelo)), "≈ Góndola de pared 1,70", "el panel no nombra la ficha propia");
  assert.match(J.C.textoDeFuente(J.C.modeloPorId(g.modelo)), /Medida en la tienda con metro\.\nFuente \(estimado\)$/);
  assert.match(J.C.textoDeFuente(J.C.modeloPorId(f.modelo)), /^Fuente \(ficha\): https:\/\/fabricante\.example\.co\/nevera-inducol-2p$/);
  // La ficha cambia (otras medidas, otras puertas) o se retira: lo colocado va
  // y vuelve por los dos editores tal como se guardó, y el panel la sigue
  // nombrando, diciendo que está retirada.
  const cambiadas = PROPIAS.map((p) => (p.clave === "nevera-inducol-2p" ? { ...p, w: 2.5, h: 1.9, partes: { puertas: 4 }, retirado: true }
    : p.clave === "gondola-pared-170" ? { ...p, h: 2.2, entrepanos: 5, modulo: 1.2 } : p));
  J.P.fijarFichasPropias(cambiadas);
  const plano = [f, g];
  const ficha = (x) => ({ w: x.w, d: x.d, h: x.h, modelo: x.modelo, entrepanos: x.entrepanos, modulo: x.modulo, partes: x.partes });
  const tras3D = J.CP.fixturesToStore(J.CP.storeToFixtures(plano, { defs: J.C3.FIXTURE_DEFS, slotsPorDefecto: () => [] }), "NAVE", plano);
  const tras2D = J.CP.itemsToStore(J.CP.storeToItems(tras3D, J.C2.CATALOGO_2D), tras3D, J.C2.CATALOGO_2D);
  for (const x of plano) {
    assert.deepEqual(ficha(tras3D.find((y) => y.id === x.id)), ficha(x), `${x.id}: el 3D releyó la ficha propia`);
    assert.deepEqual(ficha(tras2D.find((y) => y.id === x.id)), ficha(x), `${x.id}: el 2D releyó la ficha propia`);
  }
  assert.equal(J.C.nombreDeModelo(J.C.modeloPorId(f.modelo)), "Nevera Inducol 2 puertas (retirada)", "el panel no nombra la retirada");
  // Una ficha propia no puede hacerse pasar por un modelo del catálogo.
  J.P.fijarFichasPropias([{ ...PROPIAS[0], id: "base:estiba-media", tipo: "isla", tarifa: "estiba_cuarta" }]);
  assert.equal(J.C.modeloPorId("base:estiba-media").nombre, CATALOGO.modelos.find((m) => m.id === "base:estiba-media").nombre,
    "una ficha propia pisó un modelo del catálogo");
  J.P.olvidarFichasPropias();
  assert.equal(J.C.modeloPorId("cli:gondola-pared-170"), undefined, "olvidar las fichas no las olvida");
});

await prueba("los editores ofrecen las fichas propias, y el panel del mueble las nombra (el código de verdad)", () => {
  // Lo de arriba es lo que arman `paletaConPropias` y `modelosDelPlanoConPropias`;
  // esto, que los editores las USEN, con las fichas que trae la sesión, y que el
  // panel del mueble vuelva a dibujarse cuando llegan (si no, una nevera propia
  // colocada no dice qué es hasta que se toque otra cosa).
  const sinComent = (t) => t.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, (m, p1) => p1);
  const ed3D = sinComent(leer(join(raiz, "src", "components", "StoreEditor3D", "StoreEditor3D.tsx")));
  const ed2D = sinComent(leer(join(raiz, "src", "components", "FloorPlan2D", "FloorPlan2D.tsx")));
  assert.match(ed3D, /const fichasPropias = useFichasPropias\(\);\s*const paleta = useMemo\(\(\) => paletaConPropias\(fichasPropias\), \[fichasPropias\]\);/,
    "el Editor 3D no arma su paleta con las fichas propias");
  assert.match(ed3D, /\{paleta\.map\(\(familia\) => \{/, "la paleta del Editor 3D no es la que tiene las fichas propias");
  assert.ok(!/PALETA_3D\.map\(/.test(ed3D), "el Editor 3D dibuja la paleta sin las fichas propias");
  assert.match(ed2D, /const fichasPropias = useFichasPropias\(\);\s*const modelosDelPlano = useMemo\(\(\) => modelosDelPlanoConPropias\(fichasPropias\), \[fichasPropias\]\);/,
    "el plano 2D no arma su biblioteca con las fichas propias");
  assert.match(ed2D, /const modelos = modelosDelPlano\[def\.type\] \?\? \[\];/, "la biblioteca del 2D no es la que tiene las fichas propias");
  assert.ok(!/MODELOS_2D\[/.test(ed2D), "el plano 2D lista los modelos sin las fichas propias");
  // Y dibujan la familia ENTERA: un filtro en el JSX que escondiera las `cli:`
  // pasaba todo lo de arriba, y la dueña guardaba la nevera, el taller le decía
  // «Ya está en la paleta» y no estaba en ninguna de las dos.
  for (const [n, t, lista, id] of [["3D", ed3D, "familia\\.modelos", "m\\.modelo"], ["2D", ed2D, "\\bmodelos", "m\\.id"]]) {
    const usos = [...t.matchAll(new RegExp(`${lista}\\.(\\w+)`, "g"))].map((m) => m[1]);
    assert.ok(usos.length > 0 && usos.every((u) => u === "length" || u === "map" || u === "some"),
      `la paleta del ${n} hace algo más que contar y recorrer los modelos de la familia: ${usos.join(", ")}`);
    // (`some` sólo pregunta si el elegido está adentro, para abrir el desplegable.)
    const mapa = t.match(new RegExp(`\\{${lista}\\.map\\(\\(m\\) => \\{([^]*?)return \\(\\s*<button key=\\{${id}\\} data-modelo=\\{${id}\\}`));
    assert.ok(mapa, `la paleta del ${n} no dibuja un botón por cada modelo de la familia`);
    assert.ok(!/\breturn\b|startsWith|retirad|prefijoPropio|cli:/.test(mapa[1]), `la paleta del ${n} se saltea algunos modelos de la familia`);
  }
  const panel3D = ed3D.slice(ed3D.indexOf("function CommercialPanel("), ed3D.indexOf("const modeloDelMueble = modeloPorId(fix.modelo);") + 60);
  assert.match(panel3D, /useFichasPropias\(\);/, "el panel del Editor 3D no escucha las fichas propias");
  const panel2D = ed2D.slice(ed2D.indexOf("function AssignmentPanel("), ed2D.indexOf("const modeloDelMueble = modeloPorId(item.nace?.modelo);") + 60);
  assert.match(panel2D, /useFichasPropias\(\);/, "el panel del plano 2D no escucha las fichas propias");
  for (const [n, t] of [["3D", ed3D], ["2D", ed2D]]) {
    assert.match(t, /\{nombreDeModelo\(modeloDelMueble\)\}/, `el panel del ${n} no nombra el modelo`);
    assert.match(t, /title=\{textoDeFuente\(modeloDelMueble\)\}/, `el panel del ${n} arma la fuente a mano (una ficha propia puede no tener URL)`);
  }
});

await prueba("la tarifa de un mueble con ficha propia: los casos compartidos con el servidor (casos/tarifas.json)", async () => {
  const CASOS_TARIFA = JSON.parse(leer(join(aqui, "casos", "tarifas.json")));
  const J = await cargarJuntos({ F: "src/types/fixtures.ts", P: "src/catalogo/propias.ts" });
  // Como las manda `GET /api/muebles/modelos`: `id` = prefijo + clave.
  J.P.fijarFichasPropias(CASOS_TARIFA.propias.map((p) => ({
    id: `${CATALOGO.fichas.prefijoPropio}${p.clave}`, nombre: p.clave, w: 1, d: 1, h: 1,
    fuente: { confiabilidad: "estimado", nota: "x" }, ...p,
  })));
  const mal = [];
  for (const c of CASOS_TARIFA.casos) {
    const hoy = J.F.rateTypeOf(c.mueble);
    if (hoy !== c.tarifa) mal.push(`${c.nombre}: da «${hoy}» y tenía que ser «${c.tarifa}»`);
  }
  assert.deepEqual(mal, [], "\n" + mal.join("\n"));
  // Los casos tocan lo que importa: una propia con tarifa, una retirada, una de
  // otra familia, una sin prefijo, un modelo del catálogo.
  assert.ok(CASOS_TARIFA.casos.length >= 10 && CASOS_TARIFA.propias.some((p) => p.retirado && p.tarifa));
  // Sin las fichas (otra sesión, o antes de leerlas), la del tipo.
  J.P.olvidarFichasPropias();
  assert.equal(J.F.rateTypeOf({ type: "isla", modelo: "cli:media-estiba-bodega" }), "isla");
});

await prueba("las fichas se leen una vez por sesión, se releen al guardar y no pasan de un supermercado a otro", async () => {
  // `store/fichasPropias.ts` con la API cambiada por una que anota y contesta
  // lo que le digan, y sin Firebase (el cierre de sesión lo llama).
  const r = await build({
    stdin: {
      contents: 'export * as S from "./src/store/fichasPropias.ts"; export * as P from "./src/catalogo/propias.ts"; export { useAuthStore } from "./src/store/authStore.ts";',
      resolveDir: raiz, loader: "ts",
    },
    bundle: true, write: false, format: "esm", platform: "node", logLevel: "silent",
    plugins: [{
      name: "sin-red",
      setup(b) {
        b.onResolve({ filter: /api[\\/](muebles|firebase)$/ }, (a) => ({ path: a.path, namespace: "sin-red" }));
        b.onLoad({ filter: /muebles$/, namespace: "sin-red" }, () => ({ contents:
          "export const listarModelosPropios = () => globalThis.__pedirFichas();", loader: "js" }));
        b.onLoad({ filter: /firebase$/, namespace: "sin-red" }, () => ({ contents: "export const signOutFirebase = async () => {};", loader: "js" }));
      },
    }],
  });
  const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const dir = mkdtempSync(join(tmpdir(), "fichas-"));
  const archivo = join(dir, "fichasPropias.mjs");
  writeFileSync(archivo, r.outputFiles[0].text);
  // La sesión se guarda en `window.localStorage`: uno en memoria, para que no
  // avise en cada cambio de sesión. Se saca al terminar.
  const guardado = new Map();
  const habiaWindow = "window" in globalThis;
  if (!habiaWindow) globalThis.window = { localStorage: {
    getItem: (k) => guardado.get(k) ?? null, setItem: (k, v) => { guardado.set(k, String(v)); },
    removeItem: (k) => { guardado.delete(k); },
  } };
  let J;
  try { J = await import(pathToFileURL(archivo).href); } finally { rmSync(dir, { recursive: true, force: true }); }
  const setTimeoutReal = globalThis.setTimeout, clearTimeoutReal = globalThis.clearTimeout;
  try {
    const pedidos = [];
    let contestar = null;
    globalThis.__pedirFichas = () => new Promise((ok) => { pedidos.push(ok); contestar = ok; });
    const A = [{ ...PROPIAS[0] }];
    const B = [{ ...PROPIAS[1], clave: "de-otro", id: "cli:de-otro" }];
    J.useAuthStore.getState().setAuth("token-a", "admin", "galerias");
    let p = J.S.cargarFichasPropias();
    J.S.cargarFichasPropias();
    assert.equal(pedidos.length, 1, "dos pantallas que las piden leen dos veces");
    contestar(A); await p;
    assert.equal(J.P.fichasPropias().length, 1);
    await J.S.cargarFichasPropias();
    assert.equal(pedidos.length, 1, "en la misma sesión se vuelven a leer");
    // Guardar una ficha las relee.
    p = J.S.recargarFichasPropias(); contestar([...A, { ...PROPIAS[3] }]); await p;
    assert.equal(pedidos.length, 2, "guardar una ficha no las relee");
    assert.equal(J.P.fichasPropias().length, 2);
    // Otra sesión (otro supermercado): se olvidan ANTES de leer las suyas, y una
    // respuesta vieja que llega tarde no las pisa.
    p = J.S.recargarFichasPropias();
    const tarde = contestar;
    J.useAuthStore.getState().setAuth("token-b", "admin", "canaveral");
    const q = J.S.cargarFichasPropias();
    assert.equal(J.P.fichasPropias().length, 0, "la sesión de otro supermercado ve las fichas del anterior");
    tarde(A); await p;
    assert.equal(J.P.fichasPropias().length, 0, "la respuesta de la sesión anterior pisó la de ahora");
    contestar(B); await q;
    assert.deepEqual(J.P.fichasPropias().map((m) => m.id), ["cli:de-otro"]);
    // Cerrar la sesión las olvida, aunque no haya ninguna pantalla montada.
    J.useAuthStore.getState().logout();
    assert.equal(J.P.fichasPropias().length, 0, "cerrar la sesión no olvida las fichas");
    // Sin red: se queda sin ellas y la próxima pantalla reintenta.
    J.useAuthStore.getState().setAuth("token-c", "admin", "galerias");
    globalThis.__pedirFichas = () => Promise.reject(new Error("sin red"));
    await J.S.cargarFichasPropias();
    globalThis.__pedirFichas = () => Promise.resolve(A);
    await J.S.cargarFichasPropias();
    assert.equal(J.P.fichasPropias().length, 1, "después de un error de red no se reintenta");

    // Y reintenta SOLA, sin que se monte otra pantalla: en Vender `Ficha` está
    // siempre montada, y con un 502 en la primera lectura toda la sesión de
    // venta cobraba la media estiba propia como estiba entera. Con espera
    // creciente y tope; lo cancela cerrar la sesión.
    const relojes = [];
    globalThis.setTimeout = (fn, ms) => { const t = { fn, ms, vivo: true }; relojes.push(t); return t; };
    globalThis.clearTimeout = (t) => { if (t) t.vivo = false; };
    const correr = async () => {
      const t = relojes.filter((x) => x.vivo).at(-1);
      assert.ok(t, "una lectura fallida no programa otro intento");
      t.vivo = false; t.fn();
      await new Promise((ok) => setImmediate(ok));
    };
    let leidas = 0;
    J.useAuthStore.getState().setAuth("token-d", "admin", "galerias");
    globalThis.__pedirFichas = () => { leidas++; return Promise.reject(new Error("502")); };
    await J.S.cargarFichasPropias();
    await new Promise((ok) => setImmediate(ok));
    assert.deepEqual(relojes.filter((x) => x.vivo).map((x) => x.ms), [J.S.ESPERA_INICIAL_MS]);
    await correr();
    assert.equal(leidas, 2, "el reintento no volvió a leer");
    assert.deepEqual(relojes.filter((x) => x.vivo).map((x) => x.ms), [J.S.ESPERA_INICIAL_MS * 2], "la espera no crece");
    for (let i = 0; i < 8; i++) await correr();
    assert.equal(relojes.filter((x) => x.vivo)[0].ms, J.S.ESPERA_MAXIMA_MS, "la espera no tiene tope");
    globalThis.__pedirFichas = () => { leidas++; return Promise.resolve(A); };
    await correr();
    assert.equal(J.P.fichasPropias().length, 1, "el reintento no trajo las fichas");
    assert.equal(relojes.filter((x) => x.vivo).length, 0, "con las fichas leídas sigue reintentando");
    // Cerrar la sesión cancela el reintento pendiente.
    globalThis.__pedirFichas = () => Promise.reject(new Error("502"));
    await J.S.recargarFichasPropias();
    await new Promise((ok) => setImmediate(ok));
    assert.equal(relojes.filter((x) => x.vivo).length, 1);
    J.useAuthStore.getState().logout();
    assert.equal(relojes.filter((x) => x.vivo).length, 0, "cerrar la sesión no cancela el reintento");
    // Otra sesión con un reintento de la anterior pendiente: el de la anterior
    // no tapa el de la nueva (al dispararse no haría nada), y la nueva arranca
    // con la espera inicial.
    J.useAuthStore.getState().setAuth("token-e", "admin", "galerias");
    await J.S.cargarFichasPropias();
    for (let i = 0; i < 3; i++) await correr();
    J.useAuthStore.getState().setAuth("token-f", "admin", "canaveral");
    await J.S.cargarFichasPropias();
    await new Promise((ok) => setImmediate(ok));
    assert.deepEqual(relojes.filter((x) => x.vivo).map((x) => x.ms), [J.S.ESPERA_INICIAL_MS],
      "la falla de la sesión nueva no programa su propio reintento");
    globalThis.__pedirFichas = () => Promise.resolve(B);
    await correr();
    assert.deepEqual(J.P.fichasPropias().map((m) => m.id), ["cli:de-otro"], "el reintento de la sesión nueva no las trajo");
  } finally {
    globalThis.setTimeout = setTimeoutReal;
    globalThis.clearTimeout = clearTimeoutReal;
    delete globalThis.__pedirFichas;
    if (!habiaWindow) delete globalThis.window;
  }
});

await prueba("montar una pantalla con `useFichasPropias` las pide una vez por sesión, y quien dibuja con ellas se entera", async () => {
  // Lo de arriba llama al cargador a mano; esto es el HOOK, que es lo único
  // que las lee al abrir la aplicación: sin su efecto, después de recargar
  // ninguna sesión pide `GET /api/muebles/modelos` —las paletas sin la nevera
  // propia, el panel sin nombrarla, Vender con la tarifa del tipo— y nada
  // fallaba. Con un React de mentira que corre el efecto cuando cambian sus
  // dependencias y suscribe la pantalla, y una sesión que se puede cambiar.
  const r = await build({
    stdin: {
      contents: 'export * as S from "./src/store/fichasPropias.ts"; export * as P from "./src/catalogo/propias.ts"; export * as R from "react";',
      resolveDir: raiz, loader: "ts",
    },
    bundle: true, write: false, format: "esm", platform: "neutral", logLevel: "silent",
    plugins: [{
      name: "falsos",
      setup(b) {
        b.onResolve({ filter: /^react$/ }, () => ({ path: "react", namespace: "falso" }));
        b.onResolve({ filter: /api[\\/]muebles$/ }, () => ({ path: "api", namespace: "falso" }));
        b.onResolve({ filter: /[\\/]authStore$/ }, () => ({ path: "auth", namespace: "falso" }));
        b.onLoad({ filter: /^react$/, namespace: "falso" }, () => ({ loader: "js", contents: `
          let actual = null;
          export const pantalla = () => ({ deps: [], dejar: [], avisos: 0 });
          export function dibujar(p, fn) { actual = p; p.i = 0; try { return fn(); } finally { actual = null; } }
          export function useEffect(fn, deps) {
            const p = actual, i = p.i++;
            const antes = p.deps[i];
            if (!antes || deps.length !== antes.length || deps.some((d, k) => d !== antes[k])) { p.deps[i] = deps; fn(); }
          }
          export function useSyncExternalStore(suscribir, instantanea) {
            const p = actual, i = p.i++;
            if (!p.dejar[i]) p.dejar[i] = suscribir(() => { p.avisos++; });
            return instantanea();
          }` }));
        b.onLoad({ filter: /^api$/, namespace: "falso" }, () => ({ loader: "js", contents:
          "export const listarModelosPropios = () => { globalThis.__pedidos.push(globalThis.__sesion.token); return Promise.resolve(globalThis.__respuesta); };" }));
        b.onLoad({ filter: /^auth$/, namespace: "falso" }, () => ({ loader: "js", contents: `
          const oyentes = new Set();
          export const useAuthStore = Object.assign((sel) => sel(globalThis.__sesion), {
            getState: () => globalThis.__sesion,
            subscribe: (fn) => { oyentes.add(fn); return () => oyentes.delete(fn); },
          });` }));
      },
    }],
  });
  const J = await import("data:text/javascript;base64," + Buffer.from(r.outputFiles[0].text).toString("base64"));
  globalThis.__pedidos = [];
  globalThis.__respuesta = [PROPIAS[0]];
  globalThis.__sesion = { token: "tok-1", plataforma: false, cliente: "canaveral" };
  const listo = () => new Promise((ok) => setImmediate(ok));
  try {
    // El tablero se monta: pide UNA vez, y cuando llegan, el tablero se entera.
    const tablero = J.R.pantalla();
    assert.equal(J.R.dibujar(tablero, () => J.S.useFichasPropias()).length, 0);
    assert.deepEqual(globalThis.__pedidos, ["tok-1"], "montar una pantalla no pide las fichas");
    await listo();
    assert.equal(J.P.fichasPropias().length, 1, "las fichas no llegaron a memoria");
    assert.equal(tablero.avisos, 1, "la pantalla no se enteró de que llegaron las fichas");
    assert.equal(J.R.dibujar(tablero, () => J.S.useFichasPropias()).length, 1, "la pantalla no dibuja con las fichas que llegaron");
    // Otra pantalla (el Editor 3D) y otro dibujo de la misma: no vuelven a pedir.
    const editor = J.R.pantalla();
    J.R.dibujar(editor, () => J.S.useFichasPropias());
    J.R.dibujar(tablero, () => J.S.useFichasPropias());
    await listo();
    assert.equal(globalThis.__pedidos.length, 1, "cada pantalla las vuelve a pedir");
    // Otro ingreso (otro token) o otro supermercado: sí.
    globalThis.__sesion = { ...globalThis.__sesion, token: "tok-2" };
    J.R.dibujar(tablero, () => J.S.useFichasPropias());
    await listo();
    globalThis.__sesion = { ...globalThis.__sesion, token: "tok-3", cliente: "galerias" };
    J.R.dibujar(editor, () => J.S.useFichasPropias());
    await listo();
    assert.deepEqual(globalThis.__pedidos, ["tok-1", "tok-2", "tok-3"], "otra sesión no lee las suyas");

    // `catalogo/propias.ts` avisa a cada suscripto al fijarlas y al olvidarlas
    // (si había), y deja de avisar a quien se fue.
    let avisos = 0;
    const dejar = J.P.suscribirFichasPropias(() => { avisos++; });
    J.P.fijarFichasPropias(PROPIAS);
    assert.equal(avisos, 1, "fijar las fichas no avisa a quien dibuja con ellas");
    J.P.olvidarFichasPropias();
    assert.equal(avisos, 2, "olvidar las fichas no avisa");
    J.P.olvidarFichasPropias();
    assert.equal(avisos, 2, "olvidar lo que ya estaba vacío avisa de nuevo");
    dejar();
    J.P.fijarFichasPropias(PROPIAS);
    assert.equal(avisos, 2, "quien dejó de escuchar sigue recibiendo avisos");
    J.P.olvidarFichasPropias();
  } finally {
    delete globalThis.__pedidos; delete globalThis.__respuesta; delete globalThis.__sesion;
  }
});

await prueba("quien pregunta la tarifa vuelve a preguntar cuando llegan las fichas del supermercado", () => {
  // Las fichas propias llegan del servidor DESPUÉS del primer dibujo. Un
  // `useMemo` que le pregunta la tarifa a `rateTypeOf` —directo, por una
  // función del mismo archivo o por `tipoDelMueble` (`catalogo/nombresPropios.ts`,
  // el tipo de la cara con el nombre propio de su familia)— y no tiene
  // `fichasPropias` en sus dependencias se queda con la tarifa del tipo hasta
  // que cambie otra cosa: la media estiba propia se mostraba y se comparaba
  // como estiba entera.
  const archivos = [];
  const recorrer = (d) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) recorrer(p);
      else if (/\.tsx$/.test(n)) archivos.push(p);
    }
  };
  recorrer(join(raiz, "src"));
  const sinComent = (t) => t.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, (m, p1) => p1 + " ".repeat(m.length - p1.length));
  let memos = 0;
  for (const a of archivos) {
    const t = sinComent(leer(a));
    // `tarifaDeEspacio` (vender por partes) pregunta `rateTypeOf` adentro: quien
    // la llama desde un memo también depende de las fichas.
    if (!/(rateTypeOf|tipoDelMueble|tarifaDeEspacio)\(/.test(t)) continue;
    const rel = a.slice(raiz.length + 1);
    // Las funciones del archivo que la preguntan (en minúscula: los componentes
    // se vigilan por sus propios `useMemo`).
    const fns = [...t.matchAll(/\nfunction ([a-z]\w*)\(/g)]
      .filter((m) => /(rateTypeOf|tipoDelMueble|tarifaDeEspacio)\(/.test(t.slice(m.index, t.indexOf("\n}\n", m.index))))
      .map((m) => m[1]);
    const pregunta = new RegExp(`\\b(${["rateTypeOf", "tipoDelMueble", "tarifaDeEspacio", ...fns].join("|")})\\(`);
    for (const m of t.matchAll(/\b(useMemo|useCallback)(<[^>]*>)?\(/g)) {
      let i = m.index + m[0].length, prof = 1;
      while (prof > 0 && i < t.length) { if (t[i] === "(") prof++; else if (t[i] === ")") prof--; i++; }
      const cuerpo = t.slice(m.index, i);
      if (!pregunta.test(cuerpo)) continue;
      memos++;
      const linea = t.slice(0, m.index).split("\n").length;
      const deps = cuerpo.slice(cuerpo.lastIndexOf("["), cuerpo.lastIndexOf("]") + 1);
      assert.match(deps, /\bfichasPropias\b/, `${rel}:${linea}: un ${m[1]} pregunta la tarifa y no depende de \`fichasPropias\``);
    }
    if (memos) assert.match(t, /const fichasPropias = useFichasPropias\(\);/, `${rel}: pregunta la tarifa y no escucha las fichas del supermercado`);
  }
  assert.ok(memos >= 10, `se esperaban los cálculos del tablero, el contrato y Vender; hay ${memos}`);
});

await prueba("el formulario de la ficha valida el rango (y los entrepaños a 25 cm) antes de mandar", async () => {
  const FF = await cargar("src/utils/formularioDeFicha.ts");
  const llamadas = [];
  const api = {
    crear: async (ficha) => { llamadas.push(["crear", ficha]); return { ...ficha, id: `cli:${ficha.clave}`, retirado: false }; },
    cambiar: async (clave, ficha) => { llamadas.push(["cambiar", clave, ficha]); return { ...ficha, clave, id: `cli:${clave}`, retirado: false }; },
  };
  const buena = {
    ...FF.formularioVacio("nevera_puertas"), nombre: "Nevera Inducol 2 puertas", clave: "nevera-inducol-2p",
    anchoCm: "144,5", fondoCm: "74", altoCm: "210", puertas: "2",
    url: "https://inducol.com.co/neveras/vertical-2-puertas/", confiabilidad: "ficha",
  };
  // Fuera del rango de su familia (la nevera de puertas, de 0,60 a 3,20 de ancho): no se manda.
  let r = await FF.guardarFicha({ ...buena, anchoCm: "400" }, null, api);
  assert.equal(r.ok, false);
  assert.deepEqual(r.problemas.map((p) => p.campo), ["w"], "el ancho fuera de rango no se marcó");
  assert.match(r.problemas[0].problema, /\(400 cm\).*\(60 a 320 cm\)/, "el problema no se dice en centímetros");
  assert.equal(llamadas.length, 0, "la ficha fuera de rango llegó a la API");
  // Las puertas fuera de la geometría de su familia, la fuente sin URL ni nota y sin confiabilidad: tampoco.
  r = await FF.guardarFicha({ ...buena, puertas: "9", url: "", confiabilidad: "" }, null, api);
  assert.deepEqual(r.problemas.map((p) => p.campo).sort(), ["fuente", "fuente.confiabilidad", "partes.puertas"]);
  assert.equal(llamadas.length, 0);
  // Una góndola de 1,20 con 6 entrepaños: el rango de la familia los deja,
  // pero quedan a menos de 25 cm. El servidor no lo puede ver; el formulario sí.
  const gon = { ...FF.formularioVacio("gondola:wall"), nombre: "Góndola baja", clave: "gondola-baja",
    anchoCm: "100", fondoCm: "45", altoCm: "120", entrepanos: "6", moduloCm: "100", nota: "Medida en la tienda.", confiabilidad: "estimado" };
  r = await FF.guardarFicha(gon, null, api);
  assert.deepEqual(r.problemas.map((p) => p.campo), ["entrepanos"], "los entrepaños que no caben a 25 cm no se marcaron");
  assert.match(r.problemas[0].problema, /entran hasta \d entrepaños/);
  assert.equal(llamadas.length, 0, "la góndola con entrepaños apretados llegó a la API");
  // El módulo en centímetros, dicho en centímetros.
  r = await FF.guardarFicha({ ...gon, entrepanos: "2", moduloCm: "200" }, null, api);
  assert.deepEqual(r.problemas.map((p) => [p.campo, p.problema]), [["modulo", "el módulo va de 60 a 150 cm"]]);
  // Bien: se manda UNA vez, en metros, con su clave y sólo lo que admite su familia.
  r = await FF.guardarFicha({ ...buena, entrepanos: "4", moduloCm: "90" }, null, api);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(llamadas, [["crear", {
    clave: "nevera-inducol-2p", tipo: "nevera_puertas", nombre: "Nevera Inducol 2 puertas", w: 1.445, d: 0.74, h: 2.1,
    partes: { puertas: 2 }, fuente: { confiabilidad: "ficha", url: "https://inducol.com.co/neveras/vertical-2-puertas/" },
  }]], "la ficha no viajó como la espera el servidor");
  // Al editar no viaja la clave, y va a la de la ficha que se edita.
  llamadas.length = 0;
  r = await FF.guardarFicha({ ...gon, entrepanos: "2" }, "gondola-baja", api);
  assert.equal(r.ok, true);
  assert.equal(llamadas[0][0], "cambiar");
  assert.equal(llamadas[0][1], "gondola-baja");
  assert.equal("clave" in llamadas[0][2], false, "al editar se manda la clave");
  assert.deepEqual([llamadas[0][2].variante, llamadas[0][2].w, llamadas[0][2].modulo, llamadas[0][2].entrepanos], ["wall", 1, 1, 2]);
  // Lo que dice el servidor vuelve por campo, con sus palabras.
  const fallar = (respuesta) => ({ crear: async () => { throw { response: respuesta }; }, cambiar: async () => { throw { response: respuesta }; } });
  r = await FF.guardarFicha(buena, null, fallar({ status: 422, data: { detail: [
    { loc: ["body", "fuente", "url"], msg: "la fuente es una imagen: se guarda la página de la ficha, nunca una foto" },
    { loc: ["body", "w"], msg: "el ancho (3,50 m) está fuera del rango de su familia (0,60 a 3,20 m)" },
  ] } }));
  assert.deepEqual(r.problemas.map((p) => p.campo), ["fuente.url", "w"]);
  assert.match(r.problemas[1].problema, /\(350 cm\).*\(60 a 320 cm\)/);
  r = await FF.guardarFicha(buena, null, fallar({ status: 409, data: { detail: "Ya hay una ficha con la clave «nevera-inducol-2p» (retirada)." } }));
  assert.deepEqual(r.problemas, [{ campo: "clave", problema: "Ya hay una ficha con la clave «nevera-inducol-2p» (retirada)." }]);
  r = await FF.guardarFicha(buena, null, { crear: async () => { throw new Error("red"); }, cambiar: async () => { throw new Error("red"); } });
  assert.match(r.problemas[0].problema, /no se guardó/);
  // Cada campo con problema tiene dónde mostrarse en el formulario.
  for (const c of ["clave", "tipo", "variante", "nombre", "w", "d", "h", "entrepanos", "modulo", "partes", "partes.puertas", "tarifa",
    "fuente", "fuente.url", "fuente.nota", "fuente.confiabilidad"]) {
    assert.ok(FF.CAMPO_DEL_FORMULARIO[c], `el formulario no tiene dónde mostrar un problema de «${c}»`);
  }
  // La clave sale del nombre, sin tildes, y la acepta la regla del catálogo.
  assert.equal(FF.claveDeNombre("  Góndola de pared 1,70 — Cañaveral "), "gondola-de-pared-1-70-canaveral");
  assert.match(FF.claveDeNombre("Ñandú ".repeat(30)), new RegExp(CATALOGO.fichas.clave));
  // Las familias del formulario son las que admiten fichas, y la góndola va por variante.
  assert.deepEqual(FF.FAMILIAS_DEL_FORMULARIO.map((f) => f.entrada),
    CATALOGO.orden.editor3D.filter((e) => CATALOGO.tipos[e.split(":")[0]]?.rango));
  // Una ficha guardada vuelve al formulario igual: guardarla sin tocar nada no cambia nada.
  const guardada = { ...PROPIAS[1] };
  const ida = FF.fichaDelFormulario(FF.formularioDe(guardada), { nueva: false });
  for (const k of ["tipo", "variante", "nombre", "w", "d", "h", "entrepanos", "modulo"]) assert.equal(ida[k], guardada[k], k);
  assert.deepEqual(ida.fuente, guardada.fuente);
});

// ═══════════════════════════════════════════════════════════════════════════
// 3b · EL CATÁLOGO VIAJA SÓLO DONDE SE USA
// ═══════════════════════════════════════════════════════════════════════════

/** El grafo de lo que se baja: `src/main.tsx` empaquetado como lo parte el
 *  build, con cada `import()` (las pantallas de adentro, `React.lazy`) en su
 *  pedazo. Lo que no es código se reemplaza por nada. */
const vacio = {
  name: "vacio",
  setup(b) {
    b.onResolve({ filter: /\?(raw|worker|url|inline)$/ }, (a) => ({ path: a.path, namespace: "vacio" }));
    b.onLoad({ filter: /.*/, namespace: "vacio" }, () => ({ contents: "export default ''", loader: "js" }));
  },
};
const conCatalogo = (inputs) => Object.entries(inputs)
  .some(([m, x]) => /catalogo[\\/]muebles\.json$/.test(m) && x.bytesInOutput > 0);

await prueba("retirar y reactivar una ficha: el pedido que corresponde, y DESPUÉS releer las fichas", async () => {
  // El taller decía «quedó retirada» y la ficha seguía en las dos paletas si
  // «Retirar» llamaba a `/reactivar` (que sobre una vigente no hace nada y
  // contesta 200) o si releía las fichas antes del pedido.
  const FF = await cargar("src/utils/formularioDeFicha.ts");
  const orden = [];
  const api = {
    retirar: async (clave) => { orden.push(["retirar", clave]); return {}; },
    reactivar: async (clave) => { orden.push(["reactivar", clave]); return {}; },
  };
  const recargar = async () => { orden.push(["releer"]); };
  const vigente = { clave: "nevera-inducol-2p", nombre: "Nevera Inducol 2 puertas", retirado: false };
  assert.equal(await FF.retirarOReactivarFicha(vigente, api, recargar), "«Nevera Inducol 2 puertas» quedó retirada.");
  assert.deepEqual(orden, [["retirar", "nevera-inducol-2p"], ["releer"]], "retirar no pide retirar y después relee");
  orden.length = 0;
  assert.equal(await FF.retirarOReactivarFicha({ ...vigente, retirado: true }, api, recargar), "«Nevera Inducol 2 puertas» vuelve a la paleta.");
  assert.deepEqual(orden, [["reactivar", "nevera-inducol-2p"], ["releer"]], "reactivar no pide reactivar y después relee");
  // Si el servidor dice que no, el error llega al taller y no se relee.
  orden.length = 0;
  const conError = { ...api, retirar: async () => { orden.push(["retirar"]); throw Object.assign(new Error("404"), { response: { status: 404 } }); } };
  await assert.rejects(FF.retirarOReactivarFicha(vigente, conError, recargar));
  assert.deepEqual(orden, [["retirar"]], "con el retiro rechazado igual relee (o no pidió)");
});

await prueba("Vender escribe la tarifa de lista y la sigue hasta que alguien toca el campo", async () => {
  // La tarifa de un mueble de una ficha propia llega con las fichas, después
  // del primer dibujo. Escrita una sola vez, la media estiba propia tocada
  // antes de que llegaran quedaba en 3.000.000 (la de la estiba entera) en vez
  // de 900.000, y ése era el precio que se guardaba.
  const J = await cargarJuntos({ L: "src/utils/precioDeLista.ts", F: "src/types/fixtures.ts", P: "src/catalogo/propias.ts" });
  const tarifas = { default: { isla: 3_000_000, estiba_media: 900_000 }, by_sede: {} };
  const exp1 = { type: "isla", modelo: "cli:media-estiba-bodega" };
  const exp2 = { type: "isla" };
  const renglones = (valores) => [["NAVE-EXP-01", exp1], ["NAVE-EXP-02", exp2], ["NAVE-EXP-03", exp2]].map(([codigo, f]) => ({
    codigo, ref: J.F.referenceRateFor(tarifas, "NAVE", J.F.rateTypeOf(f)), valor: valores[codigo] ?? "",
  }));
  J.P.olvidarFichasPropias();
  // La renovación trae su valor: es de alguien.
  const tocados = new Set(["NAVE-EXP-03"]);
  let valores = { "NAVE-EXP-03": "2.500.000" };
  valores = { ...valores, ...J.L.valoresDeLista(renglones(valores), tocados) };
  assert.deepEqual(valores, { "NAVE-EXP-01": "3.000.000", "NAVE-EXP-02": "3.000.000", "NAVE-EXP-03": "2.500.000" });
  assert.deepEqual(J.L.valoresDeLista(renglones(valores), tocados), {}, "reescribe lo que ya dice la tarifa");
  // Llegan las fichas: el campo que nadie tocó pasa a la tarifa de la ficha.
  J.P.fijarFichasPropias([{ id: "cli:media-estiba-bodega", clave: "media-estiba-bodega", tipo: "isla", tarifa: "estiba_media",
    nombre: "Media estiba", w: 1, d: 0.6, h: 1.2, retirado: false, fuente: { confiabilidad: "estimado", nota: "x" } }]);
  assert.deepEqual(J.L.valoresDeLista(renglones(valores), tocados), { "NAVE-EXP-01": "900.000" },
    "el precio de la media estiba propia se queda con la tarifa de la estiba entera");
  // Lo que se tecleó (también borrarlo) no se pisa.
  tocados.add("NAVE-EXP-01");
  valores = { ...valores, "NAVE-EXP-01": "" };
  assert.deepEqual(J.L.valoresDeLista(renglones(valores), tocados), {}, "pisó lo que alguien escribió");
  // Sin tarifa, nada.
  assert.deepEqual(J.L.valoresDeLista([{ codigo: "X", ref: null, valor: "" }], new Set()), {});
  J.P.olvidarFichasPropias();
  // Y el contrato la usa así: cada vez que cambian los renglones, y lo
  // tecleado entra en `tocados`.
  const sinComent = (t) => t.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, (m, p1) => p1);
  const contrato = sinComent(leer(join(raiz, "src", "components", "Contrato", "Contrato.tsx")));
  assert.match(contrato, /const tocados = useRef\(new Set<string>\(Object\.keys\(semilla\?\.valores \?\? \{\}\)\)\);/,
    "la semilla de la renovación no cuenta como tocada");
  assert.match(contrato, /useEffect\(\(\) => \{\s*const nuevos = valoresDeLista\(lineas, tocados\.current\);\s*if \(Object\.keys\(nuevos\)\.length\) setValores\(\(v\) => \(\{ \.\.\.v, \.\.\.nuevos \}\)\);\s*\}, \[lineas\]\);/,
    "el contrato no escribe la tarifa de lista con `valoresDeLista`");
  assert.match(contrato, /const escribirValor = useCallback\(\(codigo: string, txt: string\) => \{\s*tocados\.current\.add\(codigo\);/,
    "lo que se teclea no cuenta como tocado: la tarifa lo pisaría");
  assert.equal((contrato.match(/\bsetValores\(/g) ?? []).length, 2, "otro camino escribe el valor acordado");
});

await prueba("el catálogo no viaja en lo primero que baja la landing", async () => {
  // El catálogo trae descripciones, emojis, medidas y rótulos que sólo usan los
  // editores, que se cargan aparte. Entró en el pedazo de entrada —el que baja
  // todo visitante anónimo, y lo que más pesa en el LCP de la landing— porque
  // la fusión con la base (`estadoComercial.ts`, que va de entrada) le pedía
  // `carasDe` y `fullSpaceCode` a `types/fixtures.ts`, que calcula sus tablas
  // del catálogo. Ahora salen de `types/espacio.ts`, que no importa nada.
  const r = await build({
    entryPoints: [join(raiz, "src", "main.tsx")], bundle: true, write: false, splitting: true,
    format: "esm", outdir: join(raiz, ".probar-catalogo"), metafile: true, logLevel: "silent", plugins: [vacio],
    loader: { ".css": "empty", ".svg": "empty", ".png": "empty", ".jpg": "empty", ".webp": "empty", ".woff2": "empty", ".md": "text" },
  });
  const salidas = r.metafile.outputs;
  const entrada = Object.keys(salidas).find((k) => salidas[k].entryPoint?.endsWith("src/main.tsx"));
  assert.ok(entrada, "no se encontró la salida de `src/main.tsx`");
  const deEntrada = new Set();
  const seguir = (k) => {
    if (deEntrada.has(k)) return;
    deEntrada.add(k);
    for (const i of salidas[k].imports) if (i.kind === "import-statement") seguir(i.path);
  };
  seguir(entrada);
  const mal = [...deEntrada].filter((k) => conCatalogo(salidas[k].inputs));
  assert.deepEqual(mal, [], "el catálogo de muebles entra en lo que se baja de entrada");
  // Las fichas propias del supermercado tampoco: las lee el tablero, los
  // editores y el taller, que se cargan aparte (`store/fichasPropias.ts`).
  const propiasDeEntrada = [...deEntrada].flatMap((k) => Object.keys(salidas[k].inputs)
    .filter((m) => /(store[\\/]fichasPropias|api[\\/]muebles|catalogo[\\/]propias|utils[\\/]formularioDeFicha)\.ts$/.test(m)));
  assert.deepEqual(propiasDeEntrada, [], "las fichas propias entran en lo que se baja de entrada");
  const tarde = Object.keys(salidas).filter((k) => !deEntrada.has(k));
  assert.ok(tarde.some((k) => conCatalogo(salidas[k].inputs)), "el catálogo no aparece en ningún pedazo: la prueba no está mirando lo que cree");
});

await prueba("el catálogo no viaja en el worker del recorte", async () => {
  // El worker importa `muebles/producto.ts` por `empaqueDeArte` y nunca mira el
  // frío; `MUEBLES_FRIOS` lleva las marcas `@__PURE__` para que el empaquetador
  // pueda dejar afuera la tabla y, con ella, el catálogo.
  const r = await build({
    entryPoints: [join(raiz, "src", "components", "StoreEditor3D", "muebles", "recorte.worker.ts")],
    bundle: true, write: false, format: "esm", platform: "browser", metafile: true, logLevel: "silent",
    outdir: join(raiz, ".probar-catalogo"), treeShaking: true,
  });
  const [salida] = Object.values(r.metafile.outputs);
  assert.ok(!conCatalogo(salida.inputs), "el worker del recorte se lleva el catálogo de muebles");
});

// ═══════════════════════════════════════════════════════════════════════════
// 4 · UN PLANO VIEJO DA LO MISMO QUE ANTES
// ═══════════════════════════════════════════════════════════════════════════

/** Lo que no estaba (o ya no está). */
const AUSENTE = Symbol("ausente");

/**
 * Lo que el catálogo cambió A PROPÓSITO respecto de `catalogo-antes.json`.
 * Cada ruta es dentro de la parte `ts`; `[clave=valor]` elige el elemento de
 * una lista. El primer valor es el de antes —tiene que ser el que dice la
 * referencia—, el segundo el de ahora. Todo lo demás tiene que dar igual.
 *
 * Ninguno toca lo guardado: las medidas, el alto y el color con que nace un
 * mueble se usan al crearlo, y los rótulos de tarifa y de informe no se
 * guardan. Los rótulos que el 2D estampa en `label` no cambian.
 */
const CAMBIOS_INTENCIONALES = [
  {
    porque: "El mostrador de carnes que se dibuja en el 2D nace con el fondo del 3D: 0,90 (era 0,85).",
    cambios: [
      ["tablas.CATALOG_2D.valor[type=nevera_carnes].h", 0.85, 0.9],
      ["nace_en_2D.valor.nevera_carnes.d", 0.85, 0.9],
    ],
  },
  {
    porque: "El servicio al cliente dibujado en el 2D nace con el alto del 3D (1,10) y su color: no estaba en las tablas del 2D y caía en 1,80 y en el color de la góndola.",
    cambios: [
      ["tablas.H_DEFAULTS_2D.valor.servicio_cliente", AUSENTE, 1.1],
      ["tablas.COLOR_DEFAULTS_2D.valor.servicio_cliente", AUSENTE, "#0ea5e9"],
      ["nace_en_2D.valor.servicio_cliente.h", 1.8, 1.1],
      ["nace_en_2D.valor.servicio_cliente.color", "#6366f1", "#0ea5e9"],
    ],
  },
  {
    porque: "Los colores del 2D tenían `nevera_mural`, un tipo que no existe.",
    cambios: [
      ["tablas.COLOR_DEFAULTS_2D.valor.nevera_mural", "#06b6d4", AUSENTE],
    ],
  },
  {
    porque: "Los informes nombran la vitrina, la zona libre y el impulsador (salían «mueble», «metro» e «impulsadors»). La ristra entra al diccionario y se sigue llamando igual.",
    cambios: [
      ["tablas.nombres_de_informe.valor.mueble", { singular: "mueble", plural: "muebles" }, { singular: "vitrina", plural: "vitrinas" }],
      ["tablas.nombres_de_informe.valor.metro", { singular: "metro", plural: "metros" }, { singular: "zona libre", plural: "zonas libres" }],
      ["tablas.nombres_de_informe.valor.impulsador.plural", "impulsadors", "impulsadores"],
      ["por_tipo.mueble.informe", { singular: "mueble", plural: "muebles" }, { singular: "vitrina", plural: "vitrinas" }],
      ["por_tipo.metro.informe", { singular: "metro", plural: "metros" }, { singular: "zona libre", plural: "zonas libres" }],
      ["por_tipo.impulsador.informe.plural", "impulsadors", "impulsadores"],
    ],
  },
  {
    porque: "Las tarifas de la isla y de la cruz se cruzaban con los nombres de los muebles: la `isla` es la estiba de piso y la `cross` el exhibidor en cruz. Las claves no cambian.",
    cambios: [
      ["tablas.RATE_TYPES.valor[type=isla].label", "Isla", "Estiba (exhibición de piso)"],
      ["tablas.RATE_TYPES.valor[type=cross].label", "Exhibición de piso", "Exhibidor cruz"],
      ["por_tipo.isla.rateTypeLabel", "Isla", "Estiba (exhibición de piso)"],
      ["por_tipo.cross.rateTypeLabel", "Exhibición de piso", "Exhibidor cruz"],
    ],
  },
  {
    porque: "Los informes nombran la cruz y la estiba como Tarifas (plan §1.4.3: los nombres nuevos van en el rótulo, el informe y la tarifa). Con sólo las tarifas renombradas, «exhibición de piso» era la cruz en los informes y la estiba en Tarifas, y la sesión mandaba a cargar la tarifa en la fila de otro mueble; «isla» llevaba a «Isla de congelados».",
    cambios: [
      ["tablas.nombres_de_informe.valor.cross", { singular: "exhibición de piso", plural: "exhibiciones de piso" }, { singular: "exhibidor cruz", plural: "exhibidores cruz" }],
      ["tablas.nombres_de_informe.valor.isla", { singular: "isla", plural: "islas" }, { singular: "estiba", plural: "estibas" }],
      ["por_tipo.cross.informe", { singular: "exhibición de piso", plural: "exhibiciones de piso" }, { singular: "exhibidor cruz", plural: "exhibidores cruz" }],
      ["por_tipo.isla.informe", { singular: "isla", plural: "islas" }, { singular: "estiba", plural: "estibas" }],
    ],
  },
];

/**
 * Las tablas que se comparan sin mirar el orden. Los conjuntos se consultan
 * con `.has`, y estos diccionarios por clave: ningún código los recorre, así
 * que el orden en que salen del catálogo no se ve. Las listas que SÍ se
 * recorren —`FIXTURE_DEFS` (`/taller` elige por posición), `CATALOG`,
 * `RATE_TYPES`, `REFERENCIAS` (ante dos etiquetas que chocan gana la
 * primera)— y `PREFIJO_POR_TIPO` se comparan con su orden.
 */
const SIN_ORDEN = {
  conjuntos: ["NUNCA_ALQUILABLE", "NON_RENTABLE_BY_DEFAULT", "TIPOS_CON_PRODUCTO", "TIPOS_CON_PRUEBA_3D",
    "TIPOS_CON_SURTIDO", "MUEBLES_FRIOS", "FORMAN_CORRIDA"],
  diccionarios: ["H_DEFAULTS_2D", "COLOR_DEFAULTS_2D", "CATEGORIA_DE_TIPO"],
};

/** `a.b[k=v].c` → pasos. */
const pasos = (ruta) => [...ruta.matchAll(/([^.[\]]+)|\[([^=\]]+)=([^\]]+)\]/g)]
  .map((m) => (m[1] !== undefined ? { clave: m[1] } : { campo: m[2], valor: m[3] }));

/** El contenedor y la clave final de una ruta. */
function ubicar(raizObj, ruta) {
  const ps = pasos(ruta);
  let actual = raizObj;
  for (const p of ps.slice(0, -1)) {
    if (p.clave !== undefined) actual = actual?.[p.clave];
    else {
      const hallados = (actual ?? []).filter((x) => String(x?.[p.campo]) === p.valor);
      if (hallados.length !== 1) throw new Error(`${ruta}: [${p.campo}=${p.valor}] elige ${hallados.length} elementos`);
      actual = hallados[0];
    }
    if (actual === undefined) throw new Error(`${ruta}: la ruta no existe en la referencia`);
  }
  return { donde: actual, clave: ps[ps.length - 1].clave };
}

const leerRuta = (obj, ruta) => {
  const { donde, clave } = ubicar(obj, ruta);
  return Object.prototype.hasOwnProperty.call(donde, clave) ? donde[clave] : AUSENTE;
};
const escribirRuta = (obj, ruta, valor) => {
  const { donde, clave } = ubicar(obj, ruta);
  if (valor === AUSENTE) delete donde[clave]; else donde[clave] = structuredClone(valor);
};

const mostrar = (v) => (v === AUSENTE ? "(no está)" : JSON.stringify(v)?.slice(0, 160));

/** Las tablas sin orden, ordenadas igual de los dos lados. */
function sinOrden(ts) {
  const out = structuredClone(ts);
  for (const n of SIN_ORDEN.conjuntos) out.tablas[n].valor = [...out.tablas[n].valor].sort();
  for (const n of SIN_ORDEN.diccionarios) {
    const v = out.tablas[n].valor;
    out.tablas[n].valor = Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]]));
  }
  return out;
}

/** Todas las diferencias entre dos valores JSON, con su ruta. El orden de las
 *  claves cuenta: lo que no tiene orden ya pasó por `sinOrden`. */
function diferencias(a, b, ruta = "", out = []) {
  if (Object.is(a, b)) return out;
  const esObjeto = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) out.push({ ruta, antes: a, ahora: b });
    else a.forEach((x, i) => diferencias(x, b[i], `${ruta}[${i}]`, out));
  } else if (esObjeto(a) && esObjeto(b)) {
    const n = out.length;
    const sub = (k) => (ruta ? `${ruta}.${k}` : k);
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (!(k in b)) out.push({ ruta: sub(k), antes: a[k], ahora: AUSENTE });
      else if (!(k in a)) out.push({ ruta: sub(k), antes: AUSENTE, ahora: b[k] });
      else diferencias(a[k], b[k], sub(k), out);
    }
    if (out.length === n && Object.keys(a).join("|") !== Object.keys(b).join("|")) {
      out.push({ ruta: ruta + " (orden de las claves)", antes: Object.keys(a), ahora: Object.keys(b) });
    }
  } else {
    out.push({ ruta, antes: a, ahora: b });
  }
  return out;
}

await prueba("la lista de cambios intencionales es fiel a la referencia", () => {
  // Cada cambio dice qué había antes. Si la referencia dice otra cosa, la
  // lista está mal escrita o alguien recapturó la referencia con el código
  // nuevo (y entonces ya no compara nada).
  for (const { cambios } of CAMBIOS_INTENCIONALES) {
    for (const [ruta, antes] of cambios) {
      assert.deepEqual(leerRuta(ANTES.ts, ruta), antes, `${ruta}: la referencia no dice ${mostrar(antes)}`);
    }
  }
});

// ─── Lo que la referencia no conoce ──────────────────────────────────────────
//
// La referencia anotó los tipos que existían al capturarla. Un tipo que se
// suma después (la nevera de puertas, el puesto de impulso) aparece en las
// tablas de hoy —en `FixType`, en la paleta, en los prefijos, en `por_tipo`—
// y la comparación lo tomaba por un cambio de lo de antes, aunque ningún plano
// viejo cambiara. Se compara entonces SÓLO lo de los tipos que la referencia
// conoce, que tiene que seguir idéntico; los nuevos los valida el esquema
// (`validar`, arriba) y las pruebas de abajo.
//
// Qué se saca está escrito tabla por tabla, y no se adivina: una tabla que se
// sume a la captura sin clasificar acá hace fallar la prueba. Se saca sólo lo
// que es de un tipo NUEVO —no lo que no estaba en esa tabla—: si la punta
// entrara en `MUEBLES_FRIOS`, eso es un cambio de un tipo viejo y tiene que
// verse.

/** Las tablas de la captura y cómo se les saca lo nuevo. */
const LO_NUEVO_POR_TABLA = {
  /** Listas de tipos. */
  tipos: ["FixType", "FixType2D", "NUNCA_ALQUILABLE", "NON_RENTABLE_BY_DEFAULT", "TIPOS_CON_PRODUCTO",
    "TIPOS_CON_PRUEBA_3D", "TIPOS_CON_SURTIDO", "MUEBLES_FRIOS", "FORMAN_CORRIDA"],
  /** Diccionarios por tipo. */
  porTipo: ["CATEGORIA_DE_TIPO", "PREFIJO_POR_TIPO", "H_DEFAULTS_2D", "COLOR_DEFAULTS_2D",
    "REFERENCIAS_minimapa", "nombres_de_informe"],
  /** Listas de filas con `type`. */
  filas: ["FIXTURE_DEFS", "CATALOG_2D"],
  /** Las filas de Tarifas: `type` es la clave de la tarifa. */
  tarifas: ["RATE_TYPES"],
  /** Las que no dependen de qué tipos hay: se comparan enteras. */
  enteras: ["GondolaType", "COLOR_DEFAULTS_migracion"],
};

/** Los tipos (y alias) y las claves de tarifa del catálogo que la referencia
 *  no conoce. */
function loNuevoDe(cat) {
  const tiposDeAntes = new Set(ANTES.tipos);
  const tarifasDeAntes = new Set(ANTES.ts.tablas.RATE_TYPES.valor.map((r) => r.type));
  return {
    tipos: new Set([...Object.keys(cat.tipos), ...Object.keys(cat.alias)].filter((t) => !tiposDeAntes.has(t))),
    tarifas: new Set(cat.tarifas.map((t) => t.clave).filter((k) => !tarifasDeAntes.has(k))),
  };
}

/** La captura sin lo que es de un tipo o una tarifa nuevos. */
function soloLoDeAntes(ts, nuevo) {
  const out = structuredClone(ts);
  const fuera = (t) => !nuevo.tipos.has(t);
  const sinClaves = (o, quedan) => Object.fromEntries(Object.entries(o).filter(([k]) => quedan(k)));
  for (const n of Object.keys(out.tablas)) {
    const t = out.tablas[n];
    if (LO_NUEVO_POR_TABLA.tipos.includes(n)) t.valor = t.valor.filter(fuera);
    else if (LO_NUEVO_POR_TABLA.porTipo.includes(n)) t.valor = sinClaves(t.valor, fuera);
    else if (LO_NUEVO_POR_TABLA.filas.includes(n)) t.valor = t.valor.filter((x) => fuera(x.type));
    else if (LO_NUEVO_POR_TABLA.tarifas.includes(n)) t.valor = t.valor.filter((x) => !nuevo.tarifas.has(x.type));
    else if (!LO_NUEVO_POR_TABLA.enteras.includes(n)) {
      throw new Error(`la tabla \`${n}\` no dice cómo se le saca lo nuevo: sumala a LO_NUEVO_POR_TABLA`);
    }
  }
  out.por_tipo = sinClaves(out.por_tipo, fuera);
  out.nace_en_2D.valor = sinClaves(out.nace_en_2D.valor, fuera);
  return out;
}

/** Lo que la referencia dice, con los cambios escritos ya aplicados. */
function esperadoDeAntes() {
  const esperado = structuredClone(ANTES.ts);
  for (const { cambios } of CAMBIOS_INTENCIONALES) {
    for (const [ruta, , ahora] of cambios) escribirRuta(esperado, ruta, ahora);
  }
  return esperado;
}

const listarDiferencias = (difs) => difs.slice(0, 15)
  .map((d) => `${d.ruta}: antes ${mostrar(d.antes)} · ahora ${mostrar(d.ahora)}`).join("\n");

await prueba("el plano sintético se arma igual que cuando se capturó (con los tipos de antes)", () => {
  const nuevo = loNuevoDe(CATALOGO);
  assert.deepEqual(TIPOS.filter((t) => !nuevo.tipos.has(t)), ANTES.tipos,
    "los tipos de antes que se consultan no son los de la referencia: se perdió o se renombró uno");
  assert.deepEqual(JSON.parse(JSON.stringify(armarPlano({ soloTipos: ANTES.tipos }))), ANTES.plano.muebles,
    "el plano sintético cambió: las medidas, colores o rótulos con que nace un mueble del 3D no son los de antes");
});

await prueba("los tipos que la referencia no conoce son tipos del catálogo, completos", () => {
  // Un tipo nuevo no se compara contra nada: tiene que estar entero en el
  // catálogo (lo pide `validar`) y en los tipos de TypeScript, y no puede ser
  // un tipo viejo con otro nombre.
  const nuevo = loNuevoDe(CATALOGO);
  for (const t of nuevo.tipos) {
    assert.ok(TIPOS.includes(t), `${t}: está en el catálogo y no en \`FixType\` ni en \`FixType2D\``);
    const d = CATALOGO.tipos[t];
    assert.ok(d && !d.legado, `${t}: un tipo nuevo no puede ser legado ni un alias`);
    assert.ok(!Object.values(ANTES.ts.tablas.PREFIJO_POR_TIPO.valor).includes(d.prefijo),
      `${t}: usa el prefijo ${d.prefijo}, que ya era de un tipo de antes`);
  }
  for (const k of nuevo.tarifas) {
    assert.ok(CATALOGO.tarifas.some((x) => x.clave === k), `la tarifa \`${k}\` no está en \`tarifas\``);
  }
});

await prueba("un plano viejo da lo mismo que antes, salvo los cambios escritos", () => {
  const ahora = soloLoDeAntes(JSON.parse(JSON.stringify(capturarTS(ANTES.plano.muebles))), loNuevoDe(CATALOGO));
  const difs = diferencias(sinOrden(esperadoDeAntes()), sinOrden(ahora));
  assert.equal(difs.length, 0, `${difs.length} diferencia(s) que no están en CAMBIOS_INTENCIONALES:\n`
    + listarDiferencias(difs));
});

await prueba("la comparación saca SÓLO lo nuevo: un cambio en un tipo de antes se sigue viendo", () => {
  // Que sacar lo nuevo no se convierta en no mirar nada. Sobre la captura de
  // hoy se inventa un tipo y una tarifa que aparecen en todas las tablas —eso
  // no tiene que verse— y después se cambia, de a una, una cosa de un tipo de
  // antes en cada clase de tabla —eso sí—.
  const nuevo = loNuevoDe(CATALOGO);
  const base = JSON.parse(JSON.stringify(capturarTS(ANTES.plano.muebles)));
  const conInventado = structuredClone(base);
  const tb = conInventado.tablas;
  for (const n of LO_NUEVO_POR_TABLA.tipos) tb[n].valor.push("tipo_inventado");
  for (const n of LO_NUEVO_POR_TABLA.porTipo) tb[n].valor.tipo_inventado = "algo";
  for (const n of LO_NUEVO_POR_TABLA.filas) tb[n].valor.push({ ...tb[n].valor[0], type: "tipo_inventado" });
  tb.RATE_TYPES.valor.push({ type: "tarifa_inventada", label: "Inventada" });
  conInventado.por_tipo.tipo_inventado = conInventado.por_tipo.punta;
  conInventado.nace_en_2D.valor.tipo_inventado = conInventado.nace_en_2D.valor.punta;
  const conEso = { tipos: new Set([...nuevo.tipos, "tipo_inventado"]), tarifas: new Set([...nuevo.tarifas, "tarifa_inventada"]) };
  assert.deepEqual(diferencias(sinOrden(esperadoDeAntes()), sinOrden(soloLoDeAntes(conInventado, conEso))), [],
    "lo de un tipo nuevo se toma por un cambio de lo de antes");

  const cambios = [
    ["un prefijo de un tipo viejo", (x) => { x.tablas.PREFIJO_POR_TIPO.valor.punta = "PNX"; }],
    ["un tipo viejo que pasa a ser frío", (x) => { x.tablas.MUEBLES_FRIOS.valor.push("punta"); }],
    ["una medida con que nace un tipo viejo", (x) => { x.tablas.FIXTURE_DEFS.valor.find((d) => d.type === "batea").w = 0.81; }],
    ["el rótulo de una tarifa vieja", (x) => { x.tablas.RATE_TYPES.valor.find((r) => r.type === "punta").label = "Punta"; }],
    ["lo que contesta un tipo viejo", (x) => { x.por_tipo.isla.rateTypeOf = "estiba_media"; }],
    ["con qué nace en el 2D un tipo viejo", (x) => { x.nace_en_2D.valor.batea.h = 0.81; }],
    ["lo que calcula un mueble del plano viejo", (x) => { x.por_mueble[Object.keys(x.por_mueble)[0]].isRentable = false; }],
  ];
  for (const [que, cambiar] of cambios) {
    const x = structuredClone(conInventado);
    cambiar(x);
    assert.ok(diferencias(sinOrden(esperadoDeAntes()), sinOrden(soloLoDeAntes(x, conEso))).length > 0,
      `no se ve ${que}`);
  }
});

console.log(`\n${hechas} pruebas del catálogo de muebles`);
