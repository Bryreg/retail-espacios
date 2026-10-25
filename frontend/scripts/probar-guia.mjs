/**
 * La guía de montaje «para dummies» (fase 3 de la distribución, 2026-10-24).
 *   npm run probar:guia
 *
 * ── Por qué existe este archivo ──────────────────────────────────────────────
 *
 * La hoja la lee quien monta, muchas veces sin cuenta y con el teléfono en la
 * mano. Tiene que decir exactamente dónde va cada cosa y no puede decir nada
 * comercial. Acá:
 *
 *   · los estantes se cuentan DESDE ARRIBA (decisión del dueño): el 1 es el de
 *     más arriba; «los 6 estantes», «estante 2», «estantes 2 a 4»;
 *   · cada destino tiene un número, de izquierda a derecha, y sus medidas en
 *     centímetros desde el borde izquierdo, al medio centímetro;
 *   · lo vacío a propósito, lo que cambia contra la anterior, la vigencia y el
 *     aviso de una versión vieja;
 *   · los correos que se escriben a mano para mandarla;
 *   · el enlace: se lee ANTES que el de montaje (los dos traen `t`), sale de la
 *     barra de direcciones, y su pantalla entra perezosa; las rutas del cliente
 *     existen en los routers;
 *   · la casa: la hoja va siempre en papel claro (colores fijos), sin precios
 *     ni proveedores, y al imprimir sólo sale la hoja.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = join(aqui, "..");
const leer = (p) => readFileSync(join(raiz, p), "utf8");
const sinComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

let hechas = 0;
const prueba = async (n, fn) => {
  try { await fn(); hechas++; console.log("  ok   " + n); }
  catch (e) { console.error("  FALLA " + n + "\n         " + e.message.split("\n").join("\n         ")); process.exitCode = 1; }
};

const r = await build({
  stdin: {
    contents: [
      'export * as GU from "./src/utils/guia.ts";',
      'export * as PZ from "./src/utils/piezas.ts";',
      'export * as S from "./src/utils/superficie.ts";',
    ].join("\n"),
    resolveDir: raiz, loader: "ts",
  },
  bundle: true, write: false, format: "esm", platform: "neutral", logLevel: "silent",
});
const { GU, PZ, S } = await import("data:text/javascript;base64," + Buffer.from(r.outputFiles[0].text).toString("base64"));

const GONDOLA = { type: "gondola", w: 1.8, d: 0.9, h: 1.8, entrepanos: 5 };
const sup = S.superficieDeCara(GONDOLA, "A");
const repisas = S.guiasDeCara(GONDOLA, "A").entrepanos;
const cara = { ancho: sup.ancho, alto: sup.alto, exclusiones: sup.exclusiones, estantes: repisas };
const pieza = (id, pb, rect, extra = {}) => ({ destino_id: id, pb, vertices: rect ? PZ.poligonoDeRect(rect) : null, nombre: `D${id}`, tipo: "categoria",
  color: "d1", como_se_monta: null, codigo_externo: null, ...extra });
const guia = (piezas, extra = {}) => ({ piezas, superficie: { orientacion: "frente", ancho: sup.ancho, alto: sup.alto, exclusiones: sup.exclusiones }, asignado: [], anterior: null, ...extra });

console.log("guía · lo que dice la hoja");

await prueba("los estantes se cuentan desde arriba: la góndola de 5 repisas tiene 6 niveles, el 1 arriba", () => {
  const n = GU.nivelesDesdeArriba(sup.exclusiones, repisas);
  assert.equal(n.length, 6);
  for (let i = 1; i < n.length; i++) assert.ok(n[i][0] < n[i - 1][0], "no van de arriba hacia abajo");
  const b = PZ.bordesUtiles(sup.exclusiones);
  assert.equal(n[0][1], b.v1, "el 1 llega hasta arriba de lo que se vende");
  assert.equal(n[n.length - 1][0], b.v0, "el último es la base");
  // Una franja de arriba abajo ocupa todos; una pieza en los dos de arriba, el 1 y el 2.
  assert.deepEqual(GU.estantesDe({ v0: b.v0, v1: b.v1 }, n), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(GU.estantesDe({ v0: n[1][0], v1: b.v1 }, n), [1, 2]);
  // Rozar la repisa de abajo no es ocupar ese estante.
  assert.deepEqual(GU.estantesDe({ v0: n[1][0] - 0.01, v1: b.v1 }, n), [1, 2]);
  assert.deepEqual(GU.estantesDe({ v0: n[3][0], v1: n[1][1] }, n), [2, 3, 4]);
});

await prueba("las palabras de los estantes", () => {
  assert.equal(GU.textoDeEstantes([1, 2, 3, 4, 5, 6], 6), "los 6 estantes");
  assert.equal(GU.textoDeEstantes([2], 6), "estante 2");
  assert.equal(GU.textoDeEstantes([2, 3, 4], 6), "estantes 2 a 4");
  assert.equal(GU.textoDeEstantes([1, 3, 5], 6), "estantes 1, 3 y 5");
  assert.equal(GU.textoDeEstantes([], 6), "");
  assert.equal(GU.textoDeEstantes([1], 1), "estante 1");
});

await prueba("cada destino con su número de izquierda a derecha y sus medidas al medio centímetro", () => {
  const a = PZ.franja(cara, 4000, 0, "derecha"), b = PZ.franja(cara, 2500, a.u1, "derecha");
  const ds = GU.destinosDeLaGuia(guia([pieza(7, 2500, b), pieza(3, 4000, a), pieza(9, 1000, null)]), repisas);
  assert.deepEqual(ds.map((d) => [d.destino_id, d.numero]), [[3, 1], [7, 2], [9, 3]], "se numeran por dónde están, no por el orden de la lista");
  assert.equal(ds[0].desdeCm, GU.aMedioCm(a.u0 * sup.ancho));
  assert.equal(ds[0].hastaCm, GU.aMedioCm(a.u1 * sup.ancho));
  assert.ok(Number.isInteger(ds[0].desdeCm * 2) && Number.isInteger(ds[1].hastaCm * 2), "no al medio centímetro");
  assert.equal(ds[0].textoEstantes, "los 6 estantes");
  assert.equal(ds[2].textoEstantes, "", "una sin lugar no dice estantes");
  assert.equal(GU.cm(115.5), "115,5");
  assert.equal(GU.cm(72), "72");
});

await prueba("lo vacío a propósito y lo ya asignado (que no es vacío)", () => {
  const a = PZ.franja(cara, 4000, 0, "derecha");
  const b = PZ.bordesUtiles(sup.exclusiones);
  const v = GU.vaciosDeLaGuia(guia([pieza(1, 4000, a)]));
  assert.equal(v.length, 1);
  assert.equal(v[0].desdeCm, GU.aMedioCm(a.u1 * sup.ancho));
  assert.equal(v[0].hastaCm, GU.aMedioCm(b.u1 * sup.ancho));
  const asignado = [PZ.poligonoDeRect({ u0: a.u1, u1: b.u1, v0: b.v0, v1: b.v1 })];
  assert.deepEqual(GU.vaciosDeLaGuia(guia([pieza(1, 4000, a)], { asignado })), [], "lo vendido no es vacío");
  // Menos de 5 cm no es un vacío que valga la pena decir.
  const casi = PZ.franja(cara, 9800, 0, "derecha");
  assert.ok(GU.vaciosDeLaGuia(guia([pieza(1, 9800, casi)])).every((x) => x.hastaCm - x.desdeCm >= 5));
});

await prueba("qué cambia contra la anterior (con los nombres de cada versión), la vigencia y el aviso", () => {
  const v = [[0, 0], [0.4, 0], [0.4, 1], [0, 1]];
  const ant = { numero: 1, piezas: [pieza(1, 4000, null, { vertices: v, nombre: "Lácteos" }), pieza(2, 4000, null, { vertices: v, nombre: "Viejo" })] };
  const g = guia([pieza(1, 3000, null, { vertices: v, nombre: "Lácteos" }), pieza(3, 1000, null, { vertices: v, nombre: "Snacks" })], { anterior: ant });
  assert.deepEqual(GU.cambiosDeLaGuia(g), ["Lácteos: 40 % → 30 %.", "Snacks entra con 10 %.", "Viejo sale de la cara."]);
  assert.deepEqual(GU.cambiosDeLaGuia(guia([])), [], "la primera versión no tiene «qué cambia»");
  assert.equal(GU.vigenciaDeLaGuia({ rige_desde: "2026-10-28", hasta: "2026-11-02" }), "Rige del 28 oct al 2 nov 2026");
  assert.equal(GU.vigenciaDeLaGuia({ rige_desde: "2026-12-20", hasta: "2027-01-06" }), "Rige del 20 dic 2026 al 6 ene 2027");
  assert.equal(GU.vigenciaDeLaGuia({ rige_desde: "2026-10-28", hasta: null }), "Rige desde el 28 oct 2026");
  const base = { numero: 2, estado: "vigente", vencida_hace_dias: null, hay_una_mas_nueva: false };
  assert.equal(GU.avisoDeLaGuia(base), null);
  assert.match(GU.avisoDeLaGuia({ ...base, estado: "reemplazada", hay_una_mas_nueva: true }), /ya hay una más nueva/);
  assert.match(GU.avisoDeLaGuia({ ...base, estado: "programada" }), /todavía no rige/);
  assert.match(GU.avisoDeLaGuia({ ...base, vencida_hace_dias: 3 }), /venció, pero sigue vigente/);
});

await prueba("los correos escritos a mano: separados por coma, espacio o renglón; sin repetidos; los malos aparte", () => {
  assert.deepEqual(GU.correosEscritos("a@x.co, B@y.co\nb@y.co; mal  c@z.co"), { validos: ["a@x.co", "B@y.co", "c@z.co"], malos: ["mal"] });
  assert.deepEqual(GU.correosEscritos("   "), { validos: [], malos: [] });
  assert.deepEqual(GU.correosEscritos("sin@punto"), { validos: [], malos: ["sin@punto"] });
});

console.log("guía · el enlace y la casa");

await prueba("el enlace de la guía se lee antes que el de montaje, sale de la barra y su pantalla entra perezosa", () => {
  // Sin quitar comentarios: el quitador sencillo se come el código de App (que
  // tiene «/*» adentro de cadenas). Las búsquedas son de código, no de prosa.
  const app = leer("src/App.tsx");
  const iGuia = app.indexOf("const TOKEN_GUIA"), iMontaje = app.indexOf("const TOKEN_MONTAJE");
  assert.ok(iGuia > 0 && iMontaje > 0 && iGuia < iMontaje, "TOKEN_GUIA tiene que leerse antes que TOKEN_MONTAJE (los dos traen t)");
  const cuerpo = app.slice(iGuia, iMontaje);
  assert.ok(cuerpo.includes('params.has("guia")') && cuerpo.includes('searchParams.delete("t")') && cuerpo.includes("replaceState"),
    "el token de la guía no sale de la barra de direcciones");
  assert.ok(app.indexOf("if (TOKEN_GUIA) return") < app.indexOf("if (TOKEN_MONTAJE) return"), "la pantalla de la guía no va antes que la de montaje");
  assert.ok(app.includes('lazy(() => import("./pages/GuiaDeMontaje"))'), "la pantalla de la guía tiene que entrar perezosa");
  assert.ok(/!token \|\| TOKEN_MONTAJE \|\| TOKEN_GUIA/.test(app), "con el enlace de la guía no se sincroniza el plano");
  // El token del enlace vive en memoria en su propio cliente, nunca en la sesión.
  const api = sinComentarios(leer("src/api/guia.ts"));
  assert.ok(api.includes("const guiaClient = axios.create") && !/useAuthStore|localStorage/.test(api));
});

await prueba("cada ruta del cliente existe en su router", () => {
  const api = sinComentarios(leer("src/api/guia.ts"));
  const guiaPy = readFileSync(join(raiz, "../backend/app/routers/guia.py"), "utf8");
  const planPy = readFileSync(join(raiz, "../backend/app/routers/planogramas.py"), "utf8");
  const rutas = new Set([
    ...[...guiaPy.matchAll(/@router\.(get|post)\("([^"]*)"/g)].map((m) => `${m[1]} /guia${m[2]}`),
    ...[...planPy.matchAll(/@router\.(get|post|put|patch)\("([^"]*)"/g)].map((m) => `${m[1]} /planogramas${m[2]}`),
  ]);
  const llamadas = [...api.matchAll(/(?:client|guiaClient|\(hayTokenDeGuia\(\) \? guiaClient : client\))\.(get|post)<[^>]*>\("([^"]+)"/g)].map((m) => `${m[1]} ${m[2]}`);
  assert.ok(llamadas.length >= 6, `pocas llamadas: ${llamadas.join(" | ")}`);
  for (const l of llamadas) assert.ok(rutas.has(l), `el cliente llama ${l} y no existe`);
  assert.ok(api.includes("/api/guia/foto?id="), "la foto se abre por /api/guia/foto");
});

await prueba("la hoja va en papel claro, sin precios ni proveedores, y al imprimir sólo sale la hoja", () => {
  const css = leer("src/components/Guia/guia.css");
  const usos = [...css.matchAll(/var\(--([a-z0-9-]+)/g)].map((m) => m[1]);
  const ajenos = usos.filter((v) => !["tinta", "tinta-2", "tinta-3", "papel", "c", "s", "f-mono", "f-text"].includes(v));
  assert.deepEqual([...new Set(ajenos)], [], "la hoja no puede tomar colores del tema (se imprime igual en los dos)");
  assert.ok(/color-scheme:\s*light/.test(css));
  assert.ok(/@media print[\s\S]*imprimiendo-guia body \*[\s\S]*visibility:\s*hidden[\s\S]*\[data-hoja-de-guia\][\s\S]*visibility:\s*visible/.test(css), "al imprimir tiene que salir sólo la hoja");
  assert.ok(/@page\s*\{\s*size:\s*A4 portrait/.test(css));
  for (const a of ["src/components/Guia/HojaDeGuia.tsx", "src/pages/GuiaDeMontaje.tsx", "src/components/Guia/VerGuia.tsx", "src/components/Guia/EnviarGuia.tsx", "src/utils/guia.ts", "src/api/guia.ts"]) {
    const s = sinComentarios(leer(a));
    assert.ok(!/formatCOP|negotiatedValue|valor_mensual|monthly_rent|supplierName|supplier_id|lease_id/.test(s), `${a} toca algo comercial`);
    assert.ok(!/\$\s?\d|\$\{[^}]*precio/i.test(s), `${a} dice un precio`);
    assert.ok(!/localStorage/.test(s), `${a} guarda algo en el navegador`);
    assert.ok(!/sombra/i.test(s), `${a} dice «sombra»`);
  }
  const hoja = sinComentarios(leer("src/components/Guia/HojaDeGuia.tsx"));
  assert.ok(hoja.includes("desde arriba") && hoja.includes("sin precios"), "la hoja dice cómo se cuentan los estantes y que no lleva precios");
  assert.ok(hoja.includes("Ya asignado · no tocar"), "lo vendido se dice «no tocar», sin nombres");
  // Un amarillo por pantalla: el de la foto en el enlace; el de «Mandar» en su diálogo.
  assert.equal((sinComentarios(leer("src/pages/GuiaDeMontaje.tsx")).match(/btn-principal/g) ?? []).length, 1);
  assert.equal((sinComentarios(leer("src/components/Guia/EnviarGuia.tsx")).match(/btn-principal/g) ?? []).length, 1);
  assert.equal((sinComentarios(leer("src/components/Guia/VerGuia.tsx")).match(/btn-principal/g) ?? []).length, 0);
});

console.log(`\n${hechas} pruebas pasaron${process.exitCode ? ", hay fallas" : ""}.`);
