/**
 * Pruebas de src/utils/acomodar.ts — dónde cae una copia.
 *   npm run probar:acomodar
 */
import assert from "node:assert/strict";
import { build } from "esbuild";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

const aqui = dirname(fileURLToPath(import.meta.url));
const salida = join(mkdtempSync(join(tmpdir(), "aco-")), "aco.mjs");
const { outputFiles } = await build({
  entryPoints: [join(aqui, "..", "src", "utils", "acomodar.ts")],
  bundle: true, format: "esm", write: false, platform: "neutral",
});
writeFileSync(salida, outputFiles[0].text);
const A = await import(pathToFileURL(salida).href);

let hechas = 0;
const prueba = (n, fn) => {
  try { fn(); hechas++; console.log("  ok   " + n); }
  catch (e) { console.error("  FALLA " + n + "\n         " + e.message); process.exitCode = 1; }
};
const caja = (x, y, w = 0.9, h = 0.9) => ({ x, y, w, h });
const cerca = (a, b, t = 1e-6) => Math.abs(a - b) < t;

/** Los 17 tipos del catálogo, con sus medidas reales. */
const CATALOGO = [
  ["Góndola Doble",0.90,0.90], ["Góndola Mural",1.00,0.40], ["Punta Góndola",0.90,0.40],
  ["Robatope",0.30,0.40], ["Ristra",0.40,0.40], ["Exhibidor Cruz",0.80,0.80],
  ["Impulsador",0.60,0.40], ["Vitrina",1.20,0.60], ["Exhib. de Piso",1.20,0.80],
  ["Batea",0.80,0.60], ["Isla Helados",1.80,1.00], ["Nevera Carnes",2.00,0.90],
  ["Nevera Refrescos",1.20,0.75], ["Stand Frutas",1.50,1.20], ["Checkout",1.80,0.70],
  ["Zona Libre",1.00,1.00], ["Columna",0.30,0.30],
];

console.log("\nacomodar · duplicar un mueble");

prueba("TODOS los tipos del catálogo se pueden duplicar", () => {
  // Con el desplazamiento fijo de 0,5 m fallaban 11 de 17 —todos los que miden
  // más de 50 cm en los dos lados— y no se avisaba: el atajo «a veces andaba».
  const fallan = [];
  for (const [nombre, w, h] of CATALOGO) {
    const original = caja(0, 0, w, h);
    const hueco = A.buscarHueco(original, [original]);
    if (!hueco || A.seMontan({ ...original, ...hueco }, original)) fallan.push(nombre);
  }
  assert.deepEqual(fallan, [], "no se pueden duplicar: " + fallan.join(", "));
});

prueba("la copia cae al ras a la derecha, para seguir la corrida", () => {
  const o = caja(0, 0);
  const h = A.buscarHueco(o, [o]);
  assert.ok(cerca(h.x, 0.9) && cerca(h.y, 0), `cayó en (${h.x}, ${h.y})`);
});

prueba("si la derecha está ocupada, va abajo", () => {
  const o = caja(0, 0);
  const h = A.buscarHueco(o, [o, caja(0.9, 0)]);
  assert.ok(cerca(h.x, 0) && cerca(h.y, 0.9), `cayó en (${h.x}, ${h.y})`);
});

prueba("rodeado por los cuatro lados, busca más lejos", () => {
  const o = caja(0, 0);
  const alrededor = [o, caja(0.9,0), caja(-0.9,0), caja(0,0.9), caja(0,-0.9)];
  const h = A.buscarHueco(o, alrededor);
  assert.ok(h, "no encontró lugar");
  assert.ok(!alrededor.some(c => A.seMontan({ ...o, ...h }, c)), "cayó encima de algo");
});

prueba("en una fila apretada encuentra el final", () => {
  const fila = Array.from({ length: 10 }, (_, i) => caja(i * 0.9, 0));
  const h = A.buscarHueco(fila[0], fila);
  assert.ok(h, "no encontró lugar");
  assert.ok(!fila.some(c => A.seMontan({ ...fila[0], ...h }, c)));
});

prueba("dice que NO hay lugar en vez de callarse", () => {
  // Un mueble gigante en una zona tapada: sin lugar, devuelve null y quien
  // llama avisa. Antes se descartaba la copia sin decir nada.
  const grande = caja(0, 0, 30, 30);
  const tapado = [grande, caja(-40, -40, 100, 100)];
  assert.equal(A.buscarHueco(grande, tapado, 0.5, 2), null);
});

console.log("\nacomodar · pegar un grupo");

prueba("el grupo conserva su forma", () => {
  // Media corrida pegada tiene que devolver media corrida, no muebles sueltos.
  const grupo = [caja(0,0), caja(0,0.9), caja(0,1.8)];
  const d = A.buscarHuecoGrupo(grupo, grupo);
  assert.ok(d, "no encontró lugar");
  const movido = grupo.map(c => ({ ...c, x: c.x + d.dx, y: c.y + d.dy }));
  // Mismas distancias relativas.
  assert.ok(cerca(movido[1].y - movido[0].y, 0.9));
  assert.ok(cerca(movido[2].y - movido[1].y, 0.9));
  // Y ninguno encima del original.
  assert.ok(!movido.some(m => grupo.some(g => A.seMontan(m, g))), "quedó encima");
});

prueba("el grupo se pega al lado, no encima", () => {
  const grupo = [caja(0,0), caja(0.9,0)];
  const d = A.buscarHuecoGrupo(grupo, grupo);
  assert.ok(cerca(d.dx, 1.8) && cerca(d.dy, 0), `movió (${d.dx}, ${d.dy})`);
});

prueba("un grupo vacío no inventa nada", () => {
  assert.equal(A.buscarHuecoGrupo([], []), null);
});

console.log("\nacomodar · pegados sí, encima no");

prueba("al ras no cuenta como montado", () => {
  assert.ok(!A.seMontan(caja(0,0), caja(0.9,0)), "al ras se leyó como solape");
});

prueba("cinco centímetros adentro sí", () => {
  assert.ok(A.seMontan(caja(0,0), caja(0.85,0)));
});

console.log("\n" + hechas + " pruebas" + (process.exitCode ? " · CON FALLAS" : " · todo en orden") + "\n");
