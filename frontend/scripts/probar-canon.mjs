/**
 * El canon del mes: la gemela del navegador contra los casos del servidor.
 *   npm run probar:canon
 *
 * Inicio y «Todas las sedes» decían dos cifras de la misma sede (auditoría
 * P1-16): una sumaba el valor al mes completo de lo vigente hoy y la otra
 * prorrateaba por días. Queda UNA definición, `utils/canon.ts` y
 * `backend/app/services/canon.py`, y las dos corren `scripts/casos/canon.json`
 * (allá, `tests/test_canon.py`). Además se afirma que Inicio usa ESTA cuenta y
 * no vuelve a sumar «al mes» por su lado, y que no usa la fecha del navegador.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = join(aqui, "..");
const leer = (...p) => readFileSync(join(raiz, ...p), "utf8");

let hechas = 0;
function prueba(nombre, fn) {
  fn();
  hechas += 1;
  console.log(`  ✓ ${nombre}`);
}

const { build } = await import("esbuild");
const r = await build({
  entryPoints: [join(raiz, "src", "utils", "canon.ts")], bundle: true, write: false, format: "esm",
  platform: "neutral", logLevel: "silent",
});
const C = await import("data:text/javascript;base64," + Buffer.from(r.outputFiles[0].text).toString("base64"));
const casos = JSON.parse(leer("scripts", "casos", "canon.json")).casos;

prueba(`el canon del mes da lo mismo que el servidor (${casos.length} casos de casos/canon.json)`, () => {
  assert.ok(casos.length >= 10, "casos/canon.json tiene muy pocos casos");
  const mal = casos.filter((c) => C.canonDelMes(c.contratos, c.cortes, c.mes) !== c.canon)
    .map((c) => `${c.mes}: ${C.canonDelMes(c.contratos, c.cortes, c.mes)} (se esperaba ${c.canon}; ${c.por})`);
  assert.deepEqual(mal, [], `\n         ${mal.join("\n         ")}`);
});

prueba("siempre pesos enteros", () => {
  for (const c of casos) assert.ok(Number.isInteger(C.canonDelMes(c.contratos, c.cortes, c.mes)), c.por);
});

prueba("«hoy» es el de Colombia: a las 8 p. m. del 31 en Bogotá sigue siendo el 31", () => {
  // 2026-11-01 01:00 UTC = 2026-10-31 20:00 en Bogotá.
  assert.equal(C.hoyEnColombia(Date.UTC(2026, 10, 1, 1, 0)), "2026-10-31");
  assert.equal(C.hoyEnColombia(Date.UTC(2026, 10, 1, 5, 0)), "2026-11-01");
});

prueba("Inicio saca el canon del mes con ESTA cuenta, sin la fecha del navegador", () => {
  const tablero = leer("src", "pages", "DashboardView.tsx");
  const i = tablero.indexOf("const canonDelMes = useMemo(");
  assert.ok(i > 0, "no se encontró el canon del mes de Inicio");
  const cuerpo = tablero.slice(i, tablero.indexOf("}, [", i));
  assert.match(cuerpo, /calcularCanonDelMes\(/, "Inicio no usa la gemela (utils/canon.ts)");
  assert.doesNotMatch(cuerpo, /enLaUnidad\(/, "Inicio vuelve a sumar «al mes» por su lado");
  assert.doesNotMatch(cuerpo, /new Date\(\)/, "Inicio usa la fecha del navegador");
});

console.log(`\n${hechas} pruebas del canon del mes`);
