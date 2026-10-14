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
import { fileURLToPath } from "node:url";
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
  "rango", "geometria",
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
const CAMPOS_DE_GEOMETRIA = ["entrepanos", "modulo", "puertas"];
const reglasDeFicha = (cat) => {
  const r = cat.fichas ?? {};
  const geometria = Object.fromEntries(Object.entries(r.geometria ?? {}).map(([campo, g]) => [campo, {
    leer: (m) => (g.enPartes ? m.partes?.[campo] : m[campo]), entero: g.entero === true,
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
  const claves = new Set(["version", "leeme", "prefijoDesconocido", "tipos", "alias", "tarifas", "modelos", "fichas", "orden"]);
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
    && Object.values(rf.geometria).every((g) => typeof g?.enPartes === "boolean" && typeof g?.entero === "boolean"),
    `\`fichas.geometria\` tiene que decir de ${CAMPOS_DE_GEOMETRIA.join(", ")} si va en \`partes\` y si es entero`);
  si(expresionValida(rf.fuenteQueEsImagen), "`fichas.fuenteQueEsImagen` no es una expresión");
  si(["nombre", "url", "nota"].every((k) => Number.isInteger(rf.largoMaximo?.[k]) && rf.largoMaximo[k] > 0),
    "`fichas.largoMaximo` tiene que tener nombre, url y nota, enteros positivos");
  const { confiabilidad: CONFIABILIDAD, geometria: GEOMETRIA, esImagen: ES_IMAGEN, largo: LARGO } = reglasDeFicha(cat);

  const tarifas = new Map((cat.tarifas ?? []).map((t) => [t.clave, t]));
  si((cat.tarifas ?? []).length === tarifas.size, "hay dos tarifas con la misma clave");
  for (const t of cat.tarifas ?? []) si(texto(t.clave) && texto(t.rotulo), `tarifa sin clave o sin rótulo: ${JSON.stringify(t)}`);

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
      si(Object.entries(d.geometria).every(([k, r]) => k in GEOMETRIA && rangoValido(r)),
        `${t}: \`geometria\` sólo admite ${Object.keys(GEOMETRIA).join(", ")}, cada uno [mínimo, máximo]`);
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
    si(Object.values(tipos).some((d) => d.tarifa === t) || modelos.some((m) => m.tarifa === t),
      `la tarifa \`${t}\` no es de ningún tipo ni de ningún modelo`);
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
      const r = d.geometria?.[campo];
      si(!!r, `${donde}: \`${campo}\` no es geometría de \`${m.tipo}\``);
      if (r) si(typeof v === "number" && (!g.entero || Number.isInteger(v)) && v >= r[0] && v <= r[1],
        `${donde}: \`${campo}\` = ${v} está fuera de su rango (${r[0]} a ${r[1]})`);
    }
    if (m.partes !== undefined) {
      si(m.partes && typeof m.partes === "object" && Object.keys(m.partes).every((k) => k === "puertas")
        && Object.values(m.partes).every((v) => typeof v === "number"), `${donde}: \`partes\` sólo lleva números conocidos (puertas)`);
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
    ["algo comercial en las partes", (c) => { c.modelos.find((m) => m.tipo === "nevera_puertas").partes.proveedor = "Postobón"; }, /`partes` sólo lleva números/],
    ["una tarifa de modelo sin fila", (c) => { c.modelos.find((m) => m.tarifa).tarifa = "estiba_octava"; }, /la tarifa `estiba_octava` no está en `tarifas`/],
    ["una tarifa de modelo sin nombre de informe", (c) => { delete c.modelos.find((m) => m.tarifa).informePlural; }, /tiene tarifa propia y los informes/],
    ["una tarifa de modelo que lleva a otra fila", (c) => { c.modelos.find((m) => m.tarifa === "estiba_media").informe = "cuarto de estiba"; },
      /los informes lo llaman «cuarto de estiba» y en Tarifas eso es `estiba_cuarta`/],
    ["una tarifa que no es de nadie", (c) => { c.tarifas.push({ clave: "huerfana", rotulo: "Huérfana" }); }, /la tarifa `huerfana` no es de ningún tipo ni de ningún modelo/],
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
    { modelo: ID, w: 2.07, d: 0.7, h: 2.1, partes: { puertas: 3 } }, "el 3D no estampó la ficha");
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
  // camino como `x.fixture`), nunca un objeto armado ni su `.type`.
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
