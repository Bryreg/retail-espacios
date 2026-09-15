/**
 * Pruebas de src/utils/estadoComercial.ts — la base pinta el plano.
 *   npm run probar:comercial
 *
 * El plano guarda lo que ES el mueble y la base lo que se le VENDIÓ. Durante
 * mucho tiempo las dos cosas vivieron en el mismo JSON: el mismo hecho escrito
 * dos veces, sin nada que las obligara a coincidir. Se rompía siempre igual —
 * «el espacio está libre y el sistema dice que está ocupado»— porque el plano
 * NUNCA le escribió a la base, y el parche que las emparejaba lo hacía el
 * navegador: si esa pestaña se cerraba antes de guardar, el desfase quedaba.
 *
 * Desde el corte hay una sola verdad y esta función es la que la aplica. Lo que
 * fijan estas pruebas es lo que no se puede romper sin que vuelvan los
 * fantasmas:
 *
 *  · Lo que no está en el mapa está LIBRE. La fusión REEMPLAZA, no rellena: si
 *    rellenara, un contrato cancelado seguiría pintado desde la copia vieja de
 *    `localStorage` hasta que alguien recargara.
 *  · Un mueble es único por SEDE + CÓDIGO. Casi todas las tiendas tienen un
 *    IMP-17; confundirlos fue exactamente el bug que se reportó.
 *  · Si nada cambió, devuelve lo mismo. El store refusiona cada 20 segundos.
 */
import assert from "node:assert/strict";
import { build } from "esbuild";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

const aqui = dirname(fileURLToPath(import.meta.url));
const salida = join(mkdtempSync(join(tmpdir(), "com-")), "c.mjs");
const { outputFiles } = await build({
  entryPoints: [join(aqui, "..", "src", "utils", "estadoComercial.ts")],
  bundle: true, format: "esm", write: false, platform: "neutral",
});
writeFileSync(salida, outputFiles[0].text);
const { fusionarEstadoComercial, LIBRE } = await import(pathToFileURL(salida).href);

let hechas = 0;
const prueba = (n, fn) => {
  try { fn(); hechas++; console.log("  ok   " + n); }
  catch (e) { console.error("  FALLA " + n + "\n         " + e.message); process.exitCode = 1; }
};

/** Un mueble tal como lo devuelve el servidor DESPUÉS del corte: sin una sola
 *  palabra de lo comercial. Así llega hoy de `GET /api/layout`. */
const mueble = (code, extra = {}) => ({
  id: `f-${code}`, code, label: code, type: "cross", w: 1, h: 1, d: 1, ...extra,
});

const vendido = (extra = {}) => ({
  status: "occupied", supplierName: "Colgate", brandCategory: "Aseo",
  negotiatedValue: 1_000_000, startDate: "2026-09-01", endDate: "2026-10-01",
  observation: "", ...extra,
});

console.log("\nLa base pinta el plano\n");

prueba("un espacio sin fila en la base queda LIBRE", () => {
  const [f] = fusionarEstadoComercial("NAVE", [mueble("IMP-17")], {});
  assert.equal(f.status, "free");
  assert.equal(f.supplierName, "");
  assert.equal(f.negotiatedValue, 0);
});

prueba("un espacio vendido recibe todo lo que el plano dibujaba", () => {
  const [f] = fusionarEstadoComercial(
    "NAVE", [mueble("IMP-17")], { "NAVE-IMP-17": vendido() },
  );
  assert.equal(f.status, "occupied");
  assert.equal(f.supplierName, "Colgate");
  assert.equal(f.brandCategory, "Aseo");
  assert.equal(f.negotiatedValue, 1_000_000);
  assert.equal(f.startDate, "2026-09-01");
  assert.equal(f.endDate, "2026-10-01");
  // Lo que es del plano no se toca.
  assert.equal(f.label, "IMP-17");
  assert.equal(f.w, 1);
});

prueba("EL CONTRATO CANCELADO SE BORRA: la fusión reemplaza, no rellena", () => {
  // Esto es el fantasma. La copia de `localStorage` todavía trae el contrato
  // porque se guardó antes de cancelarlo; la base ya no tiene la fila.
  const viejo = mueble("IMP-17", vendido());
  const [f] = fusionarEstadoComercial("NAVE", [viejo], {});
  assert.equal(f.status, "free");
  assert.equal(f.supplierName, "");
  assert.equal(f.endDate, "");
  assert.equal(f.negotiatedValue, 0);
});

prueba("UN IMP-17 POR TIENDA: el contrato se pinta en SU sede", () => {
  const estado = { "NAVE-IMP-17": vendido() };
  const [cj] = fusionarEstadoComercial("CIUDAD JARDIN", [mueble("IMP-17")], estado);
  const [nv] = fusionarEstadoComercial("NAVE", [mueble("IMP-17")], estado);
  assert.equal(cj.status, "free", "el de la otra tienda NO se pinta");
  assert.equal(nv.status, "occupied");
});

prueba("la sede propia del mueble le gana a la sede abierta", () => {
  // Un plano puede traer muebles de otra tienda (una propuesta copiada).
  const f = mueble("IMP-17", { sede: "NAVE" });
  const [salida] = fusionarEstadoComercial(
    "CIUDAD JARDIN", [f], { "NAVE-IMP-17": vendido() },
  );
  assert.equal(salida.status, "occupied");
});

prueba("un código que YA trae la sede adentro no se prefija dos veces", () => {
  // El editor 3D genera códigos con la sede puesta. Misma guarda que
  // `_full_code` en el servidor.
  const [f] = fusionarEstadoComercial(
    "NAVE", [mueble("NAVE-IMP-17")], { "NAVE-IMP-17": vendido() },
  );
  assert.equal(f.status, "occupied");
});

prueba("el código pelado sirve de respaldo", () => {
  const [f] = fusionarEstadoComercial("NAVE", [mueble("IMP-17")], { "IMP-17": vendido() });
  assert.equal(f.status, "occupied");
});

prueba("minúsculas y espacios no esconden un contrato", () => {
  const [f] = fusionarEstadoComercial(
    " nave ", [mueble(" imp-17 ")], { "NAVE-IMP-17": vendido() },
  );
  assert.equal(f.status, "occupied");
});

prueba("LA CARA B ES UN ESPACIO APARTE: se vende sola", () => {
  const g = mueble("GON-60", { gondolaType: "double" });
  const [f] = fusionarEstadoComercial("NAVE", [g], {
    "NAVE-GON-60-B": vendido({ supplierName: "Fabuloso" }),
  });
  assert.equal(f.status, "free", "la cara A sigue libre");
  assert.equal(f.faceB.status, "occupied");
  assert.equal(f.faceB.supplierName, "Fabuloso");
});

prueba("la cara B conserva lo que NO es comercial", () => {
  const g = mueble("GON-60", {
    gondolaType: "double",
    faceB: { montajeEstado: "montado", montajeFoto: "b.jpg" },
  });
  const [f] = fusionarEstadoComercial("NAVE", [g], { "NAVE-GON-60-B": vendido() });
  assert.equal(f.faceB.montajeEstado, "montado");
  assert.equal(f.faceB.montajeFoto, "b.jpg");
  assert.equal(f.faceB.supplierName, "Colgate");
});

prueba("una góndola simple no inventa una cara B", () => {
  const [f] = fusionarEstadoComercial("NAVE", [mueble("GON-60")], {
    "NAVE-GON-60-B": vendido(),
  });
  assert.equal(f.faceB, undefined);
});

prueba("gondola_doble por tipo también tiene cara B", () => {
  const g = mueble("GON-60", { type: "gondola_doble" });
  const [f] = fusionarEstadoComercial("NAVE", [g], { "NAVE-GON-60-B": vendido() });
  assert.equal(f.faceB.status, "occupied");
});

prueba("una cara B cancelada se limpia sin borrar el montaje", () => {
  const g = mueble("GON-60", {
    gondolaType: "double",
    faceB: { ...vendido(), montajeEstado: "montado" },
  });
  const [f] = fusionarEstadoComercial("NAVE", [g], {});
  assert.equal(f.faceB.status, "free");
  assert.equal(f.faceB.supplierName, "");
  assert.equal(f.faceB.montajeEstado, "montado");
});

prueba("SI NADA CAMBIÓ DEVUELVE EL MISMO ARREGLO, no una copia", () => {
  // El store refusiona en cada vuelta del poll. Sin esto, cada 20 segundos se
  // redibuja el plano entero y la sede queda marcada como modificada.
  const entrada = [mueble("IMP-17", vendido()), mueble("IMP-18", LIBRE)];
  const salida = fusionarEstadoComercial("NAVE", entrada, { "NAVE-IMP-17": vendido() });
  assert.equal(salida, entrada);
});

prueba("UN PLANO RECIÉN CORTADO ESTRENA LOS SIETE CAMPOS", () => {
  // El servidor devuelve el plano sin una palabra de lo comercial. Dejarlo así
  // no sirve: `isSellableToday` pregunta `status !== "free"` y con `undefined`
  // entra por la rama del contrato y declara INVENDIBLE un espacio libre. La
  // primera fusión los escribe todos; a partir de ahí no vuelve a tocar nada.
  const entrada = [mueble("IMP-17")];
  const primera = fusionarEstadoComercial("NAVE", entrada, {});
  assert.notEqual(primera, entrada);
  assert.equal(primera[0].status, "free");
  assert.equal(fusionarEstadoComercial("NAVE", primera, {}), primera);
});

prueba("el mueble que no cambió conserva su identidad", () => {
  const quieto = mueble("IMP-18", LIBRE);
  const entrada = [mueble("IMP-17"), quieto];
  const salida = fusionarEstadoComercial("NAVE", entrada, { "NAVE-IMP-17": vendido() });
  assert.notEqual(salida, entrada);
  assert.equal(salida[1], quieto);
  assert.notEqual(salida[0], entrada[0]);
});

prueba("una góndola doble estrena su cara B aunque nadie la haya vendido", () => {
  // Misma razón: sin `faceB.status` la cara B se lee como invendible.
  const primera = fusionarEstadoComercial(
    "NAVE", [mueble("GON-60", { gondolaType: "double" })], {},
  );
  assert.equal(primera[0].faceB.status, "free");
  assert.equal(fusionarEstadoComercial("NAVE", primera, {}), primera);
});

prueba("un mueble sin código queda libre y no explota", () => {
  const [f] = fusionarEstadoComercial("NAVE", [mueble("")], { "NAVE-": vendido() });
  assert.equal(f.status, "free");
});

prueba("LIBRE es el estado completo, sin campos sueltos", () => {
  assert.deepEqual(Object.keys(LIBRE).sort(), [
    "brandCategory", "endDate", "negotiatedValue", "observation",
    "startDate", "status", "supplierName",
  ]);
});

prueba("un plano vacío devuelve un plano vacío", () => {
  const entrada = [];
  assert.equal(fusionarEstadoComercial("NAVE", entrada, { "NAVE-X": vendido() }), entrada);
});

console.log(`\n${hechas} pruebas\n`);
