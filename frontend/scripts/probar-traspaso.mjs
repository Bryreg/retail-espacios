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
 *
 * El botón de la consola salió el 2026-10-02 (ver abajo); la generación del
 * caché se queda: protege de cualquier reemplazo de datos, no sólo de éste.
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

console.log("La consola, sin el traspaso");

const operativo = fuente("components", "plataforma", "cartera-operativo.tsx");

prueba("«Pasar a la base principal» ya no se ofrece (2026-10-02)", () => {
  // Sirvió UNA vez —Pepito → Galerías—. Hecha la mudanza, el botón sólo servía
  // para pisar por error los datos reales de Galerías con los de otro cliente.
  assert.doesNotMatch(operativo, /Pasar a la base principal<|abrirCiclo\(c\.slug, "principal"\)|accion === "principal"/,
    "volvió el botón del traspaso a la consola");
  assert.doesNotMatch(operativo, /pasarAlPrincipal/);
});

prueba("…ni la API del navegador sabe pegarle a la ruta", () => {
  assert.doesNotMatch(fuente("api", "plataforma.ts"), /pasar-al-principal|pasarAlPrincipal/);
});

console.log(`\n${hechas} pruebas`);
