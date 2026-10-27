/**
 * Indicadores › Detalle contado como una historia (2026-10-27).
 *   npm run probar:detalle
 *
 *  · La barra del potencial cierra: lo cobrado, lo que se cobra bajo la
 *    tarifa y lo vacío suman el potencial (salvo que se cobre por encima).
 *  · El titular usa los números de la misma barra (no mezcla bases).
 *  · Lo que sigue baja el día DESPUÉS de cada contrato sin renovar; los
 *    renovados no bajan.
 *  · Quien no administra no ve plata en el Detalle.
 */
import assert from "node:assert/strict";
import { build } from "esbuild";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { writeFileSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const leer = (...p) => readFileSync(join(raiz, "src", ...p), "utf8");
const sinComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
async function cargar(entrada) {
  const salida = join(mkdtempSync(join(tmpdir(), "det-")), "m.mjs");
  const { outputFiles } = await build({ entryPoints: [join(raiz, "src", entrada)], bundle: true, format: "esm", write: false, platform: "neutral" });
  writeFileSync(salida, outputFiles[0].text);
  return import(pathToFileURL(salida).href);
}
let fallas = 0, n = 0;
async function prueba(nombre, fn) {
  n++;
  try { await fn(); console.log(`  ok   ${nombre}`); }
  catch (e) { fallas++; console.log(`  FALLA ${nombre}\n         ${e.message.split("\n").join("\n         ")}`); }
}
const H = await cargar("utils/historiaDelDetalle.ts");
const pesos = (x) => "$ " + Math.round(x).toLocaleString("es-CO");
console.log("El Detalle como una historia");

await prueba("la barra del potencial cierra (el caso de TERRON)", () => {
  const r = H.repartoDelPotencial({ potencial: 24_900_000, cobrado: 1_652_162, vacio: 7_400_000 });
  assert.equal(r.cobrado + r.precio + r.vacio, 24_900_000);
  assert.equal(r.precio, 24_900_000 - 7_400_000 - 1_652_162);
  assert.equal(r.sobreTarifa, 0);
  assert.equal(H.porciento(r.cobrado, r.potencial), "7 %");
});

await prueba("si se cobra por encima de la tarifa, no hay «bajo la tarifa»", () => {
  const r = H.repartoDelPotencial({ potencial: 1_000_000, cobrado: 900_000, vacio: 200_000 });
  assert.equal(r.precio, 0);
  assert.equal(r.sobreTarifa, 100_000);
  assert.equal(r.potencial, 1_100_000);
  // Lo vacío nunca supera el potencial.
  assert.equal(H.repartoDelPotencial({ potencial: 100, cobrado: 0, vacio: 500 }).vacio, 100);
});

await prueba("el titular dice el hueco más grande con los números de la barra", () => {
  const r = H.repartoDelPotencial({ potencial: 24_900_000, cobrado: 1_652_162, vacio: 7_400_000 });
  const t = H.titularDelDetalle({ sede: "TERRON", esAdmin: true, reparto: r, canonTotal: 1_652_162, ocupacionPct: 55, metaOcupacion: 90, sinRenovar13: 1_172_676, contratosQueVencen13: 2, pesos });
  assert.equal(t[0], "TERRON cobra $ 1.652.162 al mes: el 7 % de lo que podría cobrar a tarifa ($ 24.900.000).");
  assert.match(t[1], /no son los espacios vacíos \(\$ 7\.400\.000\) sino el precio/);
  assert.match(t[2], /vencen 2 contratos sin renovar: \$ 1\.172\.676 al mes/);
  const w = H.titularDelDetalle({ sede: "TERRON", esAdmin: false, reparto: null, canonTotal: null, ocupacionPct: 55, metaOcupacion: 90, sinRenovar13: 2, contratosQueVencen13: 2, pesos });
  assert.ok(!w.join(" ").includes("$"), "el trabajador ve plata en el titular");
  assert.match(w[0], /35 puntos bajo la meta de 90 %/);
});

await prueba("lo que sigue baja el día después de cada vencimiento sin renovar", () => {
  const s = H.loQueSigue(1000, [
    { codigo: "A", dias: 3, alMes: 200, renovado: false },
    { codigo: "B", dias: 3, alMes: 100, renovado: false },
    { codigo: "C", dias: 10, alMes: 500, renovado: true },
    { codigo: "D", dias: 40, alMes: 300, renovado: false },
    { codigo: "E", dias: 200, alMes: 999, renovado: false },
  ], 91);
  assert.deepEqual(s, [{ dia: 0, valor: 1000 }, { dia: 4, valor: 700 }, { dia: 41, valor: 400 }]);
});

await prueba("los cambios de disponibles, día a día", () => {
  assert.deepEqual(H.cambiosDeDisponibles([4, 4, 5, 5, 7]), [{ dia: 2, antes: 4, despues: 5 }, { dia: 4, antes: 5, despues: 7 }]);
});

await prueba("quien no administra no ve plata en el Detalle", () => {
  const d = sinComentarios(leer("components/Indicadores/Detalle.tsx"));
  assert.match(d, /const reparto = useMemo\(\(\) => \(esAdmin && /);
  assert.match(d, /const fmt = \(n: number\) => \(esAdmin \? pesos\(n\) : String\(Math\.round\(n\)\)\)/);
  const v = sinComentarios(leer("pages/DashboardView.tsx"));
  assert.match(v, /alMes: isAdmin \? p\.alMes : 1/);
  assert.match(v, /baseQueSigue: isAdmin \? vigentesHoy\.reduce/);
  assert.match(v, /canon: isAdmin \? _cobrado : null,\s*potencial: isAdmin \? _potencial : null/);
});

await prueba("cada gráfico tiene su tabla", () => {
  const d = sinComentarios(leer("components/Indicadores/Detalle.tsx"));
  assert.equal((d.match(/<ConTabla /g) ?? []).length, 3);
  assert.ok(!/fontSize=\{?["']?[0-9](?!\d)/.test(d), "un rótulo de menos de 10 px");
});

console.log(`\n${n} pruebas · ${fallas ? `${fallas} FALLA(N)` : "el detalle cuenta su historia"}`);
process.exit(fallas ? 1 : 0);
