/**
 * Pruebas de src/utils/espaciosSinMueble.ts — el fantasma con su nombre puesto.
 *   npm run probar:sinmueble
 *
 * El bug que estas pruebas cuidan salió de la pantalla real, reportado así: «no
 * me deja alquilar la IMP-17 que está libre, el sistema la toma como ocupada y
 * no tiene ningún contrato». El servidor decía la verdad —la base tenía el
 * contrato— y el plano decía la verdad que él conocía.
 *
 * Aquella mitad ya está resuelta de raíz: lo comercial vive sólo en la base y
 * el navegador lo fusiona al dibujar, así que el mapa y el servidor no pueden
 * discrepar. Queda la otra mitad, la que ninguna fusión arregla: un contrato
 * para un espacio que NINGÚN plano dibuja. Ahí no hay nada que pintar — hay que
 * decirlo, y hay que decir cuál.
 *
 * La regla que fijan: un mueble es único por SEDE + CÓDIGO. La carga por
 * planilla acepta una columna «sede», así que UNA planilla crea contratos en
 * varias tiendas, y casi todas tienen un IMP-17. Buscar sólo por código diría
 * «sí, existe» señalando el mueble de otra tienda, y el contrato real quedaría
 * invisible — que es exactamente el fantasma que se reportó.
 */
import assert from "node:assert/strict";
import { build } from "esbuild";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

const aqui = dirname(fileURLToPath(import.meta.url));
const salida = join(mkdtempSync(join(tmpdir(), "sinm-")), "s.mjs");
const { outputFiles } = await build({
  entryPoints: [join(aqui, "..", "src", "utils", "espaciosSinMueble.ts")],
  bundle: true, format: "esm", write: false, platform: "neutral",
});
writeFileSync(salida, outputFiles[0].text);
const { espaciosSinMueble } = await import(pathToFileURL(salida).href);
// `partirCodigo`, con el que quien arma la fila saca la parte del código.
const salidaPartes = join(dirname(salida), "p.mjs");
const { outputFiles: partes } = await build({
  entryPoints: [join(aqui, "..", "src", "utils", "partes.ts")],
  bundle: true, format: "esm", write: false, platform: "neutral",
});
writeFileSync(salidaPartes, partes[0].text);
const { partirCodigo } = await import(pathToFileURL(salidaPartes).href);

let hechas = 0;
const prueba = (n, fn) => {
  try { fn(); hechas++; console.log("  ok   " + n); }
  catch (e) { console.error("  FALLA " + n + "\n         " + e.message); process.exitCode = 1; }
};

const mueble = (code, extra = {}) => ({
  id: `f-${code}`, code, label: code, type: "cross", ...extra,
});

/** Dos tiendas con un IMP-17 cada una: la situación real que rompía todo. */
const dosSedes = () => ({
  "CIUDAD JARDIN": [mueble("IMP-17"), mueble("IMP-18")],
  "NAVE": [mueble("IMP-17"), mueble("PUN-15")],
});

const fila = (sede, code, face = "A") => ({ sede, code, face });

console.log("\nContratos sin mueble donde verse\n");

prueba("un contrato con su mueble no se reporta", () => {
  assert.deepEqual(espaciosSinMueble(dosSedes(), [fila("NAVE", "IMP-17")]), []);
});

prueba("UN CÓDIGO QUE NO EXISTE EN ESA SEDE SE REPORTA", () => {
  assert.deepEqual(
    espaciosSinMueble(dosSedes(), [fila("NAVE", "IMP-18")]),
    ["NAVE · IMP-18"],
  );
});

prueba("EL IMP-17 DE LA OTRA TIENDA NO CUENTA COMO EXISTENTE", () => {
  // Éste es el bug entero en una línea: `PUN-15` existe en NAVE, no en CIUDAD
  // JARDIN. Buscar por código solo lo daría por encontrado.
  assert.deepEqual(
    espaciosSinMueble(dosSedes(), [fila("CIUDAD JARDIN", "PUN-15")]),
    ["CIUDAD JARDIN · PUN-15"],
  );
});

prueba("una sede sin plano cargado reporta todas sus filas", () => {
  assert.deepEqual(
    espaciosSinMueble(dosSedes(), [fila("TERRON", "IMP-17")]),
    ["TERRON · IMP-17"],
  );
});

prueba("la cara B se busca por su mueble, no por un código aparte", () => {
  // `GON-60-B` no es un mueble: es la cara de atrás de `GON-60`.
  const planos = { "NAVE": [mueble("GON-60", { gondolaType: "double" })] };
  assert.deepEqual(espaciosSinMueble(planos, [fila("NAVE", "GON-60", "B")]), []);
});

prueba("una cara B sin su mueble se reporta CON el sufijo", () => {
  assert.deepEqual(
    espaciosSinMueble(dosSedes(), [fila("NAVE", "GON-60", "B")]),
    ["NAVE · GON-60-B"],
  );
});

prueba("la grafía de la sede no esconde un plano cargado", () => {
  // El store conserva la sede como se cargó: «Nave», no «NAVE».
  const planos = { "Ciudad Jardin": [mueble("IMP-17")] };
  assert.deepEqual(espaciosSinMueble(planos, [fila("CIUDAD JARDIN", "IMP-17")]), []);
});

prueba("minúsculas y espacios tampoco", () => {
  assert.deepEqual(espaciosSinMueble(dosSedes(), [fila(" nave ", " imp-17 ")]), []);
});

prueba("el mueble con sede propia cuenta para SU sede", () => {
  // Un plano copiado de otra tienda dibuja muebles que no son de la abierta.
  const planos = { "CIUDAD JARDIN": [mueble("PUN-15", { sede: "NAVE" })] };
  assert.deepEqual(espaciosSinMueble(planos, [fila("NAVE", "PUN-15")]), []);
  assert.deepEqual(
    espaciosSinMueble(planos, [fila("CIUDAD JARDIN", "PUN-15")]),
    ["CIUDAD JARDIN · PUN-15"],
  );
});

prueba("se reportan varios, sin repetidos y ordenados", () => {
  const filas = [
    fila("NAVE", "ZZZ-01"), fila("NAVE", "ZZZ-01"),
    fila("CIUDAD JARDIN", "AAA-02"),
  ];
  assert.deepEqual(
    espaciosSinMueble(dosSedes(), filas),
    ["CIUDAD JARDIN · AAA-02", "NAVE · ZZZ-01"],
  );
});

prueba("sin filas no hay nada que decir", () => {
  assert.deepEqual(espaciosSinMueble(dosSedes(), []), []);
});

prueba("una fila sin sede o sin código se ignora, no explota", () => {
  assert.deepEqual(
    espaciosSinMueble(dosSedes(), [fila("", "IMP-17"), fila("NAVE", "")]),
    [],
  );
});

prueba("un plano que no es un arreglo no rompe la cuenta", () => {
  const planos = { "NAVE": null, "CIUDAD JARDIN": [mueble("IMP-17")] };
  assert.deepEqual(
    espaciosSinMueble(planos, [fila("NAVE", "IMP-17"), fila("CIUDAD JARDIN", "IMP-17")]),
    ["NAVE · IMP-17"],
  );
});

/** La fila como la arma la pantalla al guardar la planilla
 *  (`DashboardView`): la sede, y el MUEBLE del código con `partirCodigo`. */
const filaDe = (sede, completo) => {
  const corto = completo.startsWith(`${sede}-`) ? completo.slice(sede.length + 1) : completo;
  const p = partirCodigo(corto);
  return fila(sede, p.base, p.cara);
};

prueba("una participación se busca por su mueble: `GON-01-PC3` es de `GON-01`", () => {
  const planos = { "NAVE": [mueble("GON-01", { type: "gondola", partes: { division: "participacion" } })] };
  assert.deepEqual(espaciosSinMueble(planos, [filaDe("NAVE", "NAVE-GON-01-PC3"), filaDe("NAVE", "NAVE-GON-01-B-PC1")]), []);
  // Sin el mueble se reporta el mueble (con la B si era de la B), no la participación.
  assert.deepEqual(espaciosSinMueble(planos, [filaDe("NAVE", "NAVE-GON-09-PC1")]), ["NAVE · GON-09"]);
  assert.deepEqual(espaciosSinMueble(planos, [filaDe("NAVE", "NAVE-GON-09-B-PC2")]), ["NAVE · GON-09-B"]);
  // Y la pantalla sigue partiendo el código antes de preguntar.
  const pantalla = readFileSync(join(aqui, "..", "src", "pages", "DashboardView.tsx"), "utf8");
  assert.match(pantalla, /const partido = partirCodigo\(corto\);[\s\S]{0,200}code: partido\.base,[\s\S]{0,400}espaciosSinMueble\(fixturesBySede, filas\)/,
    "la pantalla dejó de buscar la parte (una puerta, una participación) por su mueble");
});

console.log(`\n${hechas} pruebas · nada que se pinte sin mueble se calla\n`);
