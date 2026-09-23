/**
 * Pruebas del lado del navegador del traspaso a la base principal.
 *   npm run probar:traspaso
 *
 * El dueño de la plataforma (2026-09-23): «quiero que quede desde el código como
 * Galerías». Los datos de `pepito` pasan a `galerias` —la base principal— y eso
 * deja un peligro del lado del navegador: un equipo que guardaba en
 * `localStorage` los planos de PRÁCTICA bajo el mismo código `galerias` los
 * mostraría, y el arranque de la sincronización podría subirlos encima de los
 * datos reales. El servidor marca cada reemplazo con una generación nueva y el
 * store descarta lo guardado de otra generación antes de sincronizar.
 *
 * Son pruebas de fuente —el store vive de `fetch` y de `localStorage`—, y se
 * verifican en reversa rompiendo el fuente a mano.
 */
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = join(aqui, "..");
const fuente = (...partes) => readFileSync(join(raiz, "src", ...partes), "utf8");

let hechas = 0;
const prueba = (n, fn) => {
  try { fn(); hechas++; console.log("  ok   " + n); }
  catch (e) { console.error("  FALLA " + n + "\n         " + e.message); process.exitCode = 1; }
};

const store = fuente("store", "fixtureStore.ts");

console.log("El caché de planos, por generación");

prueba("syncFromServer descarta lo guardado de otra generación", () => {
  assert.match(store, /const generacion = settings\?\.generacion \?\? null;/);
  assert.match(store, /if \(generacion && generacion !== get\(\)\.generacionCache\) \{\s*set\(\{ \.\.\.planosVacios\(\), generacionCache: generacion \}\);/);
});

prueba("…y lo hace ANTES de reconciliar, para que no se siembre ninguna sede vieja", () => {
  const sync = store.slice(store.indexOf("syncFromServer: async () => {"));
  const chequeo = sync.indexOf("const generacion = settings?.generacion ?? null;");
  const reconciliacion = sync.indexOf("const bootstrap: string[] = [];");
  assert.ok(chequeo > 0 && reconciliacion > chequeo, "el descarte tiene que ir antes de la vuelta que decide qué subir");
});

prueba("lo que se descarta incluye los planos, las revisiones y lo pendiente de subir", () => {
  const vacios = store.slice(store.indexOf("function planosVacios()"), store.indexOf("export const useFixtureStore"));
  for (const campo of ["fixturesBySede: {}", "serverRev: {}", "dirty: {}", "settingsRev: null", "conflicts: {}"]) {
    assert.ok(vacios.includes(campo), `planosVacios no vacía ${campo}`);
  }
});

prueba("la generación se guarda con el caché y vuelve a cero al cambiar de cliente", () => {
  const persistido = store.slice(store.indexOf("partialize: (state) => ({"));
  assert.match(persistido.slice(0, 1500), /generacionCache: state\.generacionCache,/);
  const alcance = store.slice(store.indexOf("scopeToCliente: (cliente) => {"), store.indexOf("syncFromServer: async () => {"));
  assert.match(alcance, /\.\.\.planosVacios\(\),\s*clienteCache: cliente,\s*generacionCache: null,/);
});

console.log("La consola");

const operativo = fuente("components", "plataforma", "cartera-operativo.tsx");

prueba("«Pasar a la base principal» sólo en un cliente activo que no sea el principal", () => {
  // Ni en la fila del principal, ni en la de un archivado: ése es el respaldo de
  // un traspaso, y pasarlo otra vez pisaría lo trabajado desde entonces.
  assert.match(operativo, /\{c\.activo && !c\.base_principal && principal && \(\s*<>\s*<button[\s\S]{0,300}abrirCiclo\(c\.slug, "principal"\)/);
});

prueba("se confirma con el código del PRINCIPAL, que es el que pierde lo que tenía", () => {
  assert.match(operativo, /accion === "principal" \? !!principal && valor\.toLowerCase\(\) === principal\.slug/);
  assert.match(operativo, /disabled=\{busy \|\| !valor \|\| !codigoOk\}/);
});

prueba("el botón de confirmar va con el color de peligro", () => {
  assert.match(operativo, /accion === "borrar" \|\| accion === "principal" \? "peligro" : "fuerte"/);
});

prueba("la API pega al endpoint del traspaso", () => {
  assert.match(fuente("api", "plataforma.ts"), /`\$\{rutaCliente\(slug\)\}\/pasar-al-principal`/);
});

console.log(`\n${hechas} pruebas`);
