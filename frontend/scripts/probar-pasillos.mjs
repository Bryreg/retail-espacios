/**
 * Pruebas de src/utils/pasillos.ts — en qué pasillo está cada mueble.
 *   npm run probar:pasillos
 */
import assert from "node:assert/strict";
import { build } from "esbuild";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

const aqui = dirname(fileURLToPath(import.meta.url));
const salida = join(mkdtempSync(join(tmpdir(), "pas-")), "pas.mjs");
const { outputFiles } = await build({
  entryPoints: [join(aqui, "..", "src", "utils", "pasillos.ts")],
  bundle: true, format: "esm", write: false, platform: "neutral",
});
writeFileSync(salida, outputFiles[0].text);
const P = await import(pathToFileURL(salida).href);

let hechas = 0;
const prueba = (n, fn) => {
  try { fn(); hechas++; console.log("  ok   " + n); }
  catch (e) { console.error("  FALLA " + n + "\n         " + e.message); process.exitCode = 1; }
};

const V = Math.PI / 2;   // girada: corre a lo largo de Z
/** Una corrida vertical de n góndolas en x, arrancando en z. */
const corrida = (x, n, z0 = 0, pre = "g") =>
  Array.from({ length: n }, (_, i) => ({
    id: `${pre}${x}_${i}`, cx: x, cz: z0 + i * 1.0,
    w: 3.6, d: 0.9, rotY: V, type: "gondola",
  }));

console.log("\npasillos · detectar corridas");

prueba("góndolas que comparten x son una corrida", () => {
  const c = P.detectarCorridas(corrida(0, 6));
  assert.equal(c.length, 1);
  assert.equal(c[0].ids.length, 6);
  assert.equal(c[0].eje, "z");
});

prueba("corridas separadas se numeran de izquierda a derecha", () => {
  const c = P.detectarCorridas([...corrida(8, 4, 0, "c"), ...corrida(0, 4), ...corrida(4, 4, 0, "b")]);
  assert.equal(c.length, 3);
  assert.deepEqual(c.map(x => x.numero), [1, 2, 3]);
  assert.ok(c[0].posicion < c[1].posicion && c[1].posicion < c[2].posicion, "no quedaron en orden");
});

prueba("un desalineado de pocos centímetros sigue siendo la misma corrida", () => {
  // Nadie dibuja a x exacto: la grilla del editor es de 5 cm.
  const g = [...corrida(0, 3)];
  g[1].cx = 0.15;
  g[2].cx = -0.2;
  assert.equal(P.detectarCorridas(g).length, 1);
});

prueba("dos corridas pegadas no se funden en una", () => {
  assert.equal(P.detectarCorridas([...corrida(0, 4), ...corrida(2.5, 4, 0, "b")]).length, 2);
});

prueba("una planta sin góndolas no inventa pasillos", () => {
  const solo = [{ id:"c1", cx:0, cz:0, w:1.8, d:0.7, rotY:0, type:"checkout" }];
  assert.deepEqual(P.detectarCorridas(solo), []);
  assert.equal(P.pasilloPorMueble(solo).size, 0);
});

prueba("manda la orientación mayoritaria", () => {
  // Tres corridas verticales y una góndola contra la pared del fondo: la pared
  // no es un pasillo, y mezclarla desordena la numeración del recorrido.
  const pared = [{ id:"pared", cx:4, cz:-9, w:3.6, d:0.9, rotY:0, type:"gondola" }];
  const c = P.detectarCorridas([...corrida(0,4), ...corrida(3,4,0,"b"), ...corrida(6,4,0,"c"), ...pared]);
  assert.equal(c.length, 3, "la pared no debía ser una corrida");
  assert.ok(c.every(x => x.eje === "z"));
});

console.log("\npasillos · a qué pasillo pertenece cada mueble");

prueba("la punta de la cabecera es del pasillo de su corrida", () => {
  const g = corrida(0, 5, 0);           // z de 0 a 4
  const punta = { id:"p1", cx:0, cz:5.0, w:0.9, d:0.4, rotY:V, type:"punta" };
  const mapa = P.pasilloPorMueble([...g, punta]);
  assert.equal(mapa.get("p1"), 1, "la punta quedó fuera de su pasillo");
});

prueba("las dos cabeceras caen en el mismo pasillo", () => {
  const g = corrida(0, 5, 0);
  const arriba = { id:"pa", cx:0, cz:-1.0, w:0.9, d:0.4, rotY:V, type:"punta" };
  const abajo  = { id:"pb", cx:0, cz:5.0,  w:0.9, d:0.4, rotY:V, type:"punta" };
  const mapa = P.pasilloPorMueble([...g, arriba, abajo]);
  assert.equal(mapa.get("pa"), 1);
  assert.equal(mapa.get("pb"), 1);
});

prueba("la punta va al pasillo más cercano, no al primero", () => {
  const todos = [...corrida(0, 5), ...corrida(6, 5, 0, "b")];
  const punta = { id:"p", cx:6, cz:5.2, w:0.9, d:0.4, rotY:V, type:"punta" };
  assert.equal(P.pasilloPorMueble([...todos, punta]).get("p"), 2);
});

prueba("lo que está lejos de todo no se fuerza a un pasillo", () => {
  // La nevera de la pared del fondo no es de ningún pasillo, y decir que sí
  // manda al mercaderista a buscar donde no está.
  const lejos = { id:"beb", cx:40, cz:40, w:1.2, d:0.75, rotY:0, type:"nevera_refrescos" };
  const mapa = P.pasilloPorMueble([...corrida(0, 5), lejos]);
  assert.ok(!mapa.has("beb"), "no debía asignarle pasillo");
});

prueba("todas las góndolas de una corrida comparten número", () => {
  const g = corrida(0, 6);
  const mapa = P.pasilloPorMueble(g);
  const nums = new Set(g.map(f => mapa.get(f.id)));
  assert.equal(nums.size, 1);
});

console.log("\npasillos · cómo se dice");

prueba("se nombra como se dice en la reunión", () => {
  assert.equal(P.nombreConPasillo("GON-17", 3), "Pasillo 3 · GON-17");
  assert.equal(P.nombreConPasillo("BEB-01", undefined), "BEB-01");
});

console.log("\n" + hechas + " pruebas" + (process.exitCode ? " · CON FALLAS" : " · todo en orden") + "\n");
