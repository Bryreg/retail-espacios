/**
 * Pruebas de la validación de una ficha de mueble (`src/catalogo/fichas.ts`).
 *   npm run probar:fichas
 *
 * ── Por qué existe este archivo ──────────────────────────────────────────────
 *
 * Cada supermercado arma las fichas de sus muebles —familia, nombre, medidas,
 * la geometría de su familia y de dónde salieron— y el servidor las guarda en
 * su base (`modelos_mueble`, `/api/muebles/modelos`). Una ficha se valida con
 * las MISMAS reglas que los modelos de `muebles.json`, y en los dos lados:
 * el navegador, para decirle a la dueña qué corregir antes de mandar, y el
 * servidor, que es el que decide (`problemas_de_la_ficha` en
 * `backend/app/services/catalogo_muebles.py`). Dos validaciones escritas a mano
 * terminan diciendo cosas distintas; por eso:
 *
 *   · **Los mismos casos en los dos lados.** `casos/fichas.json` lo corren esto
 *     y `tests/test_fichas_propias.py`, y comparan los CAMPOS con problemas.
 *   · **Las reglas salen del catálogo.** La confiabilidad, la clave, lo que es
 *     una imagen, la geometría y los largos son `fichas` de `muebles.json`; el
 *     rango y la geometría de cada familia, sus `rango` y `geometria`. Se
 *     compila el módulo con un catálogo adulterado y tiene que cambiar con él.
 *   · **Los modelos del catálogo pasan.** Si un modelo de RECABRA no pasara la
 *     validación de una ficha propia, las reglas no serían las mismas.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = join(aqui, "..");
const leer = (p) => readFileSync(p, "utf8");
const CATALOGO = JSON.parse(leer(join(raiz, "src", "catalogo", "muebles.json")));
const CASOS = JSON.parse(leer(join(aqui, "casos", "fichas.json"))).casos;

let hechas = 0;
const prueba = async (n, fn) => {
  try { await fn(); hechas++; console.log("  ok   " + n); }
  catch (e) { console.error("  FALLA " + n + "\n         " + e.message.split("\n").join("\n         ")); process.exitCode = 1; }
};

/** `src/catalogo/fichas.ts` compilado; con `catalogo`, el `muebles.json` que
 *  importa es ése y no el del disco. */
const cargar = async (catalogo) => {
  const r = await build({
    entryPoints: [join(raiz, "src", "catalogo", "fichas.ts")],
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

const F = await cargar();
const campos = (ficha, nueva = true) => [...new Set(F.problemasDeLaFicha(ficha, { nueva }).map((p) => p.campo))].sort();

await prueba(`los ${CASOS.length} casos compartidos con el servidor (casos/fichas.json)`, () => {
  const mal = [];
  for (const c of CASOS) {
    const hoy = campos(c.ficha, c.nueva ?? true);
    if (JSON.stringify(hoy) !== JSON.stringify(c.mal)) mal.push(`${c.nombre}: se queja de [${hoy}] y tenía que ser [${c.mal}]`);
  }
  assert.deepEqual(mal, [], "\n" + mal.join("\n"));
});

await prueba("los casos cubren cada campo y cada familia que admite fichas", () => {
  const conProblema = new Set(CASOS.flatMap((c) => c.mal));
  for (const k of ["clave", "tipo", "variante", "nombre", "w", "d", "h", "entrepanos", "modulo", "partes", "partes.puertas",
    "tarifa", "fuente", "fuente.url", "fuente.nota", "fuente.confiabilidad", "foto"]) {
    assert.ok(conProblema.has(k), `ningún caso se queja de «${k}»`);
  }
  const buenas = new Set(CASOS.filter((c) => !c.mal.length).map((c) => c.ficha.tipo));
  for (const t of Object.keys(F.FAMILIAS_CON_FICHA)) assert.ok(buenas.has(t), `ningún caso guarda una ficha de «${t}»`);
});

await prueba("cada modelo del catálogo pasa la validación de una ficha propia (son las mismas reglas)", () => {
  const mal = [];
  for (const m of CATALOGO.modelos) {
    const { id, color, informe, informePlural, ...ficha } = m;
    const p = F.problemasDeLaFicha(ficha, { nueva: false });
    if (p.length) mal.push(`${id}: ${p.map((x) => `${x.campo} (${x.problema})`).join("; ")}`);
  }
  assert.deepEqual(mal, [], "\n" + mal.join("\n"));
});

await prueba("las familias que admiten fichas son las que tienen rango", () => {
  const conRango = Object.entries(CATALOGO.tipos).filter(([, d]) => d.rango && !d.legado).map(([t]) => t).sort();
  assert.deepEqual(Object.keys(F.FAMILIAS_CON_FICHA).sort(), conRango);
  assert.deepEqual(F.tarifasDeFicha("isla"), ["estiba_cuarta", "estiba_media"]);
  assert.deepEqual(F.tarifasDeFicha("gondola"), []);
  assert.equal(F.idDeFichaPropia("nevera-2p"), "cli:nevera-2p");
});

await prueba("las reglas salen del catálogo, no de una copia", async () => {
  const c = structuredClone(CATALOGO);
  c.fichas.confiabilidad = ["ficha", "catalogo"];
  c.fichas.largoMaximo.nombre = 10;
  c.fichas.geometria.modulo.entero = true;
  c.fichas.prefijoPropio = "sup:";
  c.fichas.clave = "^[a-z]{1,8}$";
  c.fichas.fuenteQueEsImagen = "\\.pdf$";
  c.tipos.nevera_puertas.rango.w = [0.6, 1.2];
  c.tipos.nevera_puertas.geometria.puertas = [1, 1];
  const A = await cargar(c);
  const caso = (nombre) => structuredClone(CASOS.find((x) => x.nombre === nombre).ficha);
  const de = (ficha, nueva = true) => [...new Set(A.problemasDeLaFicha(ficha, { nueva }).map((p) => p.campo))].sort();
  const estiba = caso("una media estiba con la tarifa propia de su familia");
  assert.deepEqual(de(estiba), ["clave", "fuente.confiabilidad", "nombre"], "la confiabilidad, el nombre o la clave no salen del catálogo");
  assert.deepEqual(de(caso("una nevera de dos puertas con su ficha"), false), ["clave", "nombre", "partes.puertas", "w"],
    "el rango o la geometría de la familia no salen del catálogo");
  const gondola = { ...caso("una góndola central medida en la tienda, con una nota y sin URL"), clave: "gondola", nombre: "Góndola" };
  assert.deepEqual(de({ ...gondola, modulo: 0.9 }), ["modulo"], "si la geometría es entera no sale del catálogo");
  assert.deepEqual(de({ ...gondola, fuente: { confiabilidad: "ficha", url: "https://ejemplo.co/ficha.pdf" } }), ["fuente.url"],
    "lo que es una imagen no sale del catálogo");
  assert.equal(A.idDeFichaPropia("x"), "sup:x", "el prefijo propio no sale del catálogo");
});

await prueba("el módulo no importa nada más que el catálogo", () => {
  // Es del taller (sólo administración). Que el catálogo no viaje en el
  // pedazo de entrada lo vigila el grafo de `main.tsx` de `probar-catalogo`;
  // acá, que esto no arrastre nada más el día que alguien lo importe.
  const fuente = leer(join(raiz, "src", "catalogo", "fichas.ts"));
  const imports = [...fuente.matchAll(/^import .* from "([^"]+)";$/gm)].map((x) => x[1]);
  assert.deepEqual(imports, ["./catalogo"]);
});

console.log(`\n${hechas} pruebas de las fichas de muebles`);
