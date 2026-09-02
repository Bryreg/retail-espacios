/**
 * Pruebas de src/utils/nomenclatura.ts — cómo se llaman los muebles.
 *   npm run probar:nomenclatura
 */
import assert from "node:assert/strict";
import { build } from "esbuild";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

const aqui = dirname(fileURLToPath(import.meta.url));
const salida = join(mkdtempSync(join(tmpdir(), "nom-")), "nom.mjs");
const { outputFiles } = await build({
  entryPoints: [join(aqui, "..", "src", "utils", "nomenclatura.ts")],
  bundle: true, format: "esm", write: false, platform: "neutral",
});
writeFileSync(salida, outputFiles[0].text);
const N = await import(pathToFileURL(salida).href);

let hechas = 0;
const prueba = (n, fn) => {
  try { fn(); hechas++; console.log("  ok   " + n); }
  catch (e) { console.error("  FALLA " + n + "\n         " + e.message); process.exitCode = 1; }
};
const muebles = (...codigos) => codigos.map((c, i) => ({ id: "f" + i, code: c }));

console.log("\nnomenclatura · el siguiente código");

prueba("una sede vacía empieza en 01", () => {
  assert.equal(N.siguienteCodigo("gondola", []), "GON-01");
});

prueba("sigue al más alto", () => {
  assert.equal(N.siguienteCodigo("gondola", muebles("GON-01", "GON-02")), "GON-03");
});

prueba("BORRAR UN MUEBLE NO REPITE EL CÓDIGO", () => {
  // El editor 3D CONTABA: con GON-01 y GON-03 en el plano, contaba 2 y devolvía
  // GON-03 otra vez. Dos muebles distintos con el mismo código, y con eso dos
  // espacios distintos compartiendo contratos, archivos y correos.
  const tras = muebles("GON-01", "GON-03");
  const nuevo = N.siguienteCodigo("gondola", tras);
  assert.equal(nuevo, "GON-04");
  assert.ok(!tras.some(f => f.code === nuevo), "el código nuevo ya estaba en uso");
});

prueba("un código escrito a mano tampoco lo hace chocar", () => {
  // Alguien renombra a GON-09 con sólo GON-01 en el plano. max+1 daría GON-10,
  // que está libre; pero si además existe GON-02 el salto tiene que esquivarlo.
  const plano = muebles("GON-01", "GON-09", "GON-10");
  assert.equal(N.siguienteCodigo("gondola", plano), "GON-11");
});

prueba("no distingue mayúsculas ni espacios", () => {
  assert.equal(N.siguienteCodigo("gondola", muebles(" gon-01 ", "GON-02")), "GON-03");
});

prueba("cada tipo lleva su propia cuenta", () => {
  const plano = muebles("GON-01", "GON-02", "PUN-01");
  assert.equal(N.siguienteCodigo("punta", plano), "PUN-02");
  assert.equal(N.siguienteCodigo("gondola", plano), "GON-03");
});

prueba("las dos góndolas del plano 2D comparten numeración", () => {
  // gondola_doble y gondola_mural son un solo GON: son la misma familia y en
  // el plano se leen juntas.
  const plano = muebles("GON-01");
  assert.equal(N.siguienteCodigo("gondola_doble", plano), "GON-02");
  assert.equal(N.siguienteCodigo("gondola_mural", plano), "GON-02");
  assert.equal(N.prefijoDe("gondola_doble"), N.prefijoDe("gondola"));
});

prueba("un tipo desconocido no rompe: cae en SPC", () => {
  assert.equal(N.siguienteCodigo("marciano", []), "SPC-01");
});

prueba("pasado el 99 sigue contando", () => {
  const plano = muebles(...Array.from({ length: 99 }, (_, i) => `GON-${String(i+1).padStart(2,"0")}`));
  assert.equal(N.siguienteCodigo("gondola", plano), "GON-100");
});

console.log("\nnomenclatura · códigos repetidos");

prueba("detecta el repetido", () => {
  const d = N.duplicados([{id:"a",code:"GON-01"},{id:"b",code:"GON-01"},{id:"c",code:"PUN-01"}]);
  assert.equal(d.length, 1);
  assert.equal(d[0].codigo, "GON-01");
  assert.deepEqual(d[0].ids.sort(), ["a","b"]);
});

prueba("un plano sano no reporta nada", () => {
  assert.deepEqual(N.duplicados(muebles("GON-01","GON-02","PUN-01")), []);
});

prueba("el repetido se detecta aunque cambie la caja", () => {
  const d = N.duplicados([{id:"a",code:"gon-01"},{id:"b",code:"GON-01 "}]);
  assert.equal(d.length, 1);
});

prueba("un código vacío no cuenta como repetido", () => {
  assert.deepEqual(N.duplicados([{id:"a",code:""},{id:"b",code:"  "}]), []);
});

prueba("al renombrar avisa si el código ya es de otro", () => {
  const plano = [{id:"a",code:"GON-01"},{id:"b",code:"GON-02"}];
  assert.ok(N.codigoRepetido("GON-02", plano, "a"), "debía avisar");
  assert.ok(!N.codigoRepetido("GON-01", plano, "a"), "es su propio código, no es choque");
  assert.ok(!N.codigoRepetido("GON-07", plano, "a"), "está libre");
});

console.log("\nnomenclatura · el prefijo dice qué es");

prueba("un prefijo que no corresponde al tipo se reporta", () => {
  const r = N.prefijoDesalineado([
    { id: "a", code: "GON-01", type: "gondola" },
    { id: "b", code: "GON-02", type: "punta" },
  ]);
  assert.equal(r.length, 1);
  assert.equal(r[0].id, "b");
  assert.equal(r[0].esperado, "PUN");
});

prueba("NAVE no tiene ninguno desalineado", () => {
  // Los 104 muebles reales pasan: quien dibujó el plano siguió la convención.
  const reales = [
    { id:"1", code:"GON-46", type:"gondola" }, { id:"2", code:"PUN-01", type:"punta" },
    { id:"3", code:"CAJ-01", type:"checkout" }, { id:"4", code:"BEB-01", type:"nevera_refrescos" },
    { id:"5", code:"MET-03", type:"metro" }, { id:"6", code:"COL-01", type:"columna" },
  ];
  assert.deepEqual(N.prefijoDesalineado(reales), []);
});



console.log("\nnomenclatura · el nombre del mueble");

prueba("sin nomenclatura escrita, el nombre es el del sistema", () => {
  // Es el caso de los 109 muebles del plano real: el panel decía «—» mientras
  // el plano mostraba el código. Son la misma cosa.
  assert.equal(N.nombreDeMueble({ code: "GON-800" }), "GON-800");
  assert.equal(N.nombreDeMueble({ code: "GON-800", nomenclatura: "" }), "GON-800");
  assert.equal(N.nombreDeMueble({ code: "GON-800", nomenclatura: "   " }), "GON-800");
  assert.equal(N.nombreDeMueble({ code: "GON-800", nomenclatura: null }), "GON-800");
});

prueba("escribir una nomenclatura reemplaza el nombre", () => {
  assert.equal(N.nombreDeMueble({ code: "GON-800", nomenclatura: "P1-A" }), "P1-A");
  assert.equal(N.nombreDeMueble({ code: "GON-800", nomenclatura: "  P1-A  " }), "P1-A");
});

prueba("se distingue el nombre puesto a mano del heredado", () => {
  // Sirve para poder decir «· del sistema» sin mentir, y para saber que vaciar
  // el campo devuelve al código.
  assert.equal(N.nombrePropio({ code: "GON-800" }), false);
  assert.equal(N.nombrePropio({ code: "GON-800", nomenclatura: "" }), false);
  assert.equal(N.nombrePropio({ code: "GON-800", nomenclatura: "P1-A" }), true);
  // Escribir exactamente el código NO es un nombre propio: es el mismo.
  assert.equal(N.nombrePropio({ code: "GON-800", nomenclatura: "GON-800" }), false);
});

prueba("vaciar el campo devuelve el nombre del sistema", () => {
  const antes = { code: "GON-800", nomenclatura: "P1-A" };
  assert.equal(N.nombreDeMueble(antes), "P1-A");
  assert.equal(N.nombreDeMueble({ ...antes, nomenclatura: "" }), "GON-800");
});

console.log("\nnomenclatura · qué se dibuja en el plano");

prueba("EL NOMBRE APARECE UNA VEZ, NO DOS", () => {
  // El bicho: un mueble renombrado mostraba «ISL-01» en la pastilla de arriba y
  // «ISL-03» —el de fábrica— adentro de la caja. Dos nombres para el mismo
  // mueble, uno encima del otro, y el de abajo era el que ya no se usa.
  const renombrado = { code: "ISL-03", nomenclatura: "ISL-01" };
  const grande = N.rotulosDelPlano(renombrado, true);
  assert.equal(grande.adentro, "ISL-01");
  assert.equal(grande.pastilla, null);
});

prueba("sin nombre propio, adentro va el del sistema", () => {
  const r = N.rotulosDelPlano({ code: "GON-800" }, true);
  assert.equal(r.adentro, "GON-800");
  assert.equal(r.pastilla, null);
});

prueba("si adentro no cabe, el nombre puesto a mano se va a la pastilla", () => {
  // Para eso existe la pastilla: un mueble de 30 px no tiene lugar adentro.
  const r = N.rotulosDelPlano({ code: "ISL-03", nomenclatura: "ISL-01" }, false);
  assert.equal(r.adentro, null);
  assert.equal(r.pastilla, "ISL-01");
});

prueba("un mueble chico SIN nombre propio no lleva pastilla", () => {
  // Una pastilla por cada cajita deja el plano ilegible al alejarse, y no diría
  // nada que el emoji no diga.
  const r = N.rotulosDelPlano({ code: "GON-800" }, false);
  assert.equal(r.adentro, null);
  assert.equal(r.pastilla, null);
});

prueba("nunca se dibujan los dos a la vez", () => {
  const casos = [
    { code: "GON-01" },
    { code: "GON-01", nomenclatura: "" },
    { code: "GON-01", nomenclatura: "GON-01" },
    { code: "GON-01", nomenclatura: "Punta pasillo 3" },
  ];
  for (const m of casos) {
    for (const cabe of [true, false]) {
      const r = N.rotulosDelPlano(m, cabe);
      assert.ok(!(r.adentro && r.pastilla), `${m.nomenclatura ?? "—"} / ${cabe}`);
    }
  }
});

console.log("\nnomenclatura · dos muebles llamados igual");

prueba("renombrar a un nombre que ya se ve en otro mueble es choque", () => {
  const items = [
    { id: "a", code: "ISL-01" },
    { id: "b", code: "ISL-03", nomenclatura: "Punta pasillo 3" },
  ];
  // Contra el nombre del sistema de otro mueble.
  assert.equal(N.nombreRepetido("ISL-01", items, "c"), true);
  // Contra el nombre puesto a mano de otro mueble.
  assert.equal(N.nombreRepetido("Punta pasillo 3", items, "c"), true);
  // Un nombre libre no choca.
  assert.equal(N.nombreRepetido("ISL-02", items, "c"), false);
  // Quedarse con el nombre que uno ya tiene no es choque.
  assert.equal(N.nombreRepetido("Punta pasillo 3", items, "b"), false);
});

prueba("RENOMBRAR AL CÓDIGO DE OTRO MUEBLE ES CHOQUE", () => {
  // Es exactamente lo que pasa al renombrar ISL-03 → ISL-01 en una sala donde
  // ISL-01 ya existe: quedan dos cajas diciendo ISL-01 y nadie sabe cuál es
  // cuál. El código no choca —sigue siendo ISL-03— pero lo que se VE, sí.
  const items = [
    { id: "a", code: "ISL-01" },
    { id: "b", code: "ISL-03" },
  ];
  assert.equal(N.codigoRepetido("ISL-01", items, "b"), true);
  assert.equal(N.nombreRepetido("ISL-01", items, "b"), true);
});

prueba("un nombre vacío no cuenta como repetido", () => {
  assert.equal(N.nombreRepetido("  ", [{ id: "a", code: "ISL-01" }]), false);
});

prueba("el mueble renombrado libera su código de fábrica", () => {
  // ISL-03 se renombró a ISL-01, así que YA NO se llama ISL-03: otro mueble
  // puede llamarse así sin que se vean dos iguales en el plano.
  const items = [{ id: "b", code: "ISL-03", nomenclatura: "ISL-01" }];
  assert.equal(N.nombreRepetido("ISL-03", items, "c"), false);
  // Pero el CÓDIGO sigue tomado: es la llave del espacio, y no se toca.
  assert.equal(N.codigoRepetido("ISL-03", items, "c"), true);
});

console.log("\n" + hechas + " pruebas" + (process.exitCode ? " · CON FALLAS" : " · todo en orden") + "\n");
