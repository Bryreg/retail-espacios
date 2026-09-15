/**
 * Pruebas de src/utils/contratosEnPlano.ts — que un contrato se pinte en SU sede.
 *   npm run probar:desfase
 *
 * El bug que estas pruebas fijan salió de la pantalla real, reportado así: «no
 * me deja alquilar la IMP-17 que está libre, el sistema la toma como ocupada y
 * no tiene ningún contrato». El servidor decía la verdad —la base tenía el
 * contrato— y el plano decía la verdad que él conocía. Los dos tenían razón, y
 * por eso no se podía arreglar mirando ninguno de los dos solo.
 *
 * El origen: la carga por planilla acepta una columna «sede», así que UNA
 * planilla crea contratos en varias tiendas. El parche del mapa se armaba con
 * el código CORTO y se aplicaba sobre la sede ABIERTA. Como los códigos se
 * repiten entre sedes —casi todas tienen un IMP-17— eso hacía dos daños de un
 * golpe: pintaba vendido el mueble de la sede equivocada, y dejaba el realmente
 * vendido viéndose libre.
 *
 * La regla, entonces: un mueble es único por SEDE + CÓDIGO. Y lo que no se
 * puede pintar se devuelve para decirlo, porque un desfase callado es el que
 * muerde meses después.
 */
import assert from "node:assert/strict";
import { build } from "esbuild";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

const aqui = dirname(fileURLToPath(import.meta.url));
const salida = join(mkdtempSync(join(tmpdir(), "desf-")), "d.mjs");
const { outputFiles } = await build({
  entryPoints: [join(aqui, "..", "src", "utils", "contratosEnPlano.ts")],
  bundle: true, format: "esm", write: false, platform: "neutral",
});
writeFileSync(salida, outputFiles[0].text);
const { aplicarContratosEnPlanos } = await import(pathToFileURL(salida).href);

let hechas = 0;
const prueba = (n, fn) => {
  try { fn(); hechas++; console.log("  ok   " + n); }
  catch (e) { console.error("  FALLA " + n + "\n         " + e.message); process.exitCode = 1; }
};

const mueble = (code, extra = {}) => ({
  id: `f-${code}`, code, label: code, type: "cross",
  status: "free", supplierName: "", brandCategory: "", negotiatedValue: 0,
  startDate: "", endDate: "", observation: "", ...extra,
});

/** Dos tiendas con un IMP-17 cada una: la situación real que rompía todo. */
const dosSedes = () => ({
  "CIUDAD JARDIN": [mueble("IMP-17"), mueble("IMP-18")],
  "NAVE": [mueble("IMP-17"), mueble("PUN-15")],
});

const vendido = {
  status: "occupied", supplierName: "MACA MANI", brandCategory: "MANI",
  negotiatedValue: 200000, startDate: "2026-09-08", endDate: "2026-10-08",
};

console.log("\ndesfase · el contrato se pinta en SU sede");

prueba("EL CONTRATO DE UNA SEDE NO PINTA EL MUEBLE DE OTRA", () => {
  // El bug entero, en una prueba: la fila es de NAVE y CIUDAD JARDIN tiene un
  // mueble con el mismo código.
  const r = aplicarContratosEnPlanos(dosSedes(), [
    { sede: "NAVE", code: "IMP-17", face: "A", patch: vendido },
  ]);
  assert.equal(r.fixturesBySede["NAVE"][0].status, "occupied", "no se pintó el de NAVE");
  assert.equal(
    r.fixturesBySede["CIUDAD JARDIN"][0].status, "free",
    "se pintó vendido el IMP-17 de la sede equivocada",
  );
});

prueba("y el realmente vendido no queda viéndose libre", () => {
  const r = aplicarContratosEnPlanos(dosSedes(), [
    { sede: "NAVE", code: "IMP-17", face: "A", patch: vendido },
  ]);
  assert.equal(r.fixturesBySede["NAVE"][0].supplierName, "MACA MANI");
  assert.deepEqual(r.tocadas, ["NAVE"]);
  assert.deepEqual(r.faltantes, []);
});

prueba("una planilla con filas de dos tiendas pinta las dos", () => {
  const r = aplicarContratosEnPlanos(dosSedes(), [
    { sede: "NAVE", code: "PUN-15", face: "A", patch: vendido },
    { sede: "CIUDAD JARDIN", code: "IMP-18", face: "A", patch: vendido },
  ]);
  assert.equal(r.fixturesBySede["NAVE"][1].status, "occupied");
  assert.equal(r.fixturesBySede["CIUDAD JARDIN"][1].status, "occupied");
  assert.equal(r.faltantes.length, 0);
  assert.deepEqual([...r.tocadas].sort(), ["CIUDAD JARDIN", "NAVE"]);
});

console.log("\ndesfase · lo que no se puede pintar se dice");

prueba("UNA SEDE QUE NO ESTÁ CARGADA SE REPORTA, NO SE INVENTA", () => {
  // Mandar un layout parcial borraría los muebles que no vinieron. Callarlo
  // deja el contrato en la base y el mapa pintándolo libre: el bug original.
  const planos = dosSedes();
  const r = aplicarContratosEnPlanos(planos, [
    { sede: "TERRON", code: "IMP-17", face: "A", patch: vendido },
  ]);
  assert.deepEqual(r.faltantes, ["TERRON"]);
  assert.deepEqual(r.tocadas, []);
  assert.equal(r.fixturesBySede["TERRON"], undefined, "se inventó un layout");
  assert.deepEqual(r.fixturesBySede, planos, "se tocó algo que no correspondía");
});

prueba("un mueble que el plano de esa sede no tiene también se reporta", () => {
  const r = aplicarContratosEnPlanos(dosSedes(), [
    { sede: "NAVE", code: "GON-99", face: "A", patch: vendido },
  ]);
  assert.deepEqual(r.faltantes, ["NAVE"]);
  assert.deepEqual(r.tocadas, []);
});

prueba("lo que sí entra se pinta aunque otra fila falle", () => {
  const r = aplicarContratosEnPlanos(dosSedes(), [
    { sede: "NAVE", code: "PUN-15", face: "A", patch: vendido },
    { sede: "TERRON", code: "IMP-17", face: "A", patch: vendido },
  ]);
  assert.equal(r.fixturesBySede["NAVE"][1].status, "occupied");
  assert.deepEqual(r.faltantes, ["TERRON"]);
});

console.log("\ndesfase · detalles que hacen que la clave falle sin avisar");

prueba("la sede se compara normalizada, no por igualdad de texto", () => {
  // El store conserva la grafía con la que se cargó («Nave»), y la planilla
  // manda lo que la persona escribió.
  const r = aplicarContratosEnPlanos(
    { "Nave": [mueble("IMP-17")] },
    [{ sede: "  nave ", code: "imp-17", face: "A", patch: vendido }],
  );
  assert.equal(r.fixturesBySede["Nave"][0].status, "occupied");
  assert.deepEqual(r.faltantes, []);
});

prueba("la cara B va a faceB y no pisa la A", () => {
  const r = aplicarContratosEnPlanos(
    { "NAVE": [mueble("GON-60", { supplierName: "ALPINA" })] },
    [{ sede: "NAVE", code: "GON-60", face: "B", patch: vendido }],
  );
  const g = r.fixturesBySede["NAVE"][0];
  assert.equal(g.supplierName, "ALPINA", "la cara A perdió su contrato");
  assert.equal(g.faceB.supplierName, "MACA MANI");
});

prueba("las dos caras del mismo mueble entran en la misma pasada", () => {
  const r = aplicarContratosEnPlanos(
    { "NAVE": [mueble("GON-60")] },
    [
      { sede: "NAVE", code: "GON-60", face: "A", patch: { ...vendido, supplierName: "A" } },
      { sede: "NAVE", code: "GON-60", face: "B", patch: { ...vendido, supplierName: "B" } },
    ],
  );
  const g = r.fixturesBySede["NAVE"][0];
  assert.equal(g.supplierName, "A");
  assert.equal(g.faceB.supplierName, "B");
});

prueba("sin filas no se toca nada", () => {
  const planos = dosSedes();
  const r = aplicarContratosEnPlanos(planos, []);
  assert.equal(r.fixturesBySede, planos);
  assert.deepEqual(r.tocadas, []);
});

console.log("\n" + hechas + " pruebas del desfase plano/base"
  + (process.exitCode ? " · CON FALLAS" : " · todo en orden") + "\n");
