/**
 * Pruebas de la tanda «Pantalla, accesibilidad y E2E» de la auditoría
 * pre-lanzamiento (P1-19, P2-15, P2-19, P3-9) — de COMPORTAMIENTO, no sobre el
 * texto del código (P2-24): se importan los módulos de verdad y se miran sus
 * resultados, y los componentes se dibujan con `react-dom/server`.
 *
 *   npm run probar:pantalla
 *
 * Lo que necesita un navegador (el límite atajando un error de verdad, la
 * recarga por una versión nueva, el 3D sin WebGL, las listas que no se leen)
 * lo prueban los recorridos E2E (`e2e/recuperacion.e2e.ts`).
 */
import assert from "node:assert/strict";
import { build } from "esbuild";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { writeFileSync, rmSync } from "node:fs";

const aqui = dirname(fileURLToPath(import.meta.url));
const src = join(aqui, "..", "src");
// Dentro del proyecto (no en /tmp): react y react-dom quedan externos y node
// los busca subiendo desde la carpeta del archivo.
const salida = join(aqui, ".pantalla-bundle.mjs");
const entrada = `
  export * as Salida from ${JSON.stringify(join(src, "utils", "guardadoAlCerrar.ts"))};
  export * as Leer from ${JSON.stringify(join(src, "utils", "sinLeer.ts"))};
  export * as Err from ${JSON.stringify(join(src, "components", "ErrorDeApp.tsx"))};
  export * as Lienzo from ${JSON.stringify(join(src, "components", "StoreEditor3D", "SinLienzo.tsx"))};
  export * as Aviso from ${JSON.stringify(join(src, "components", "AvisoSinLeer.tsx"))};
`;
const { outputFiles } = await build({
  stdin: { contents: entrada, resolveDir: src, loader: "ts" },
  bundle: true, format: "esm", write: false, platform: "node", jsx: "automatic",
  loader: { ".css": "empty" },
  external: ["react", "react-dom", "react/jsx-runtime", "lucide-react"],
});
writeFileSync(salida, outputFiles[0].text);
const M = await import(pathToFileURL(salida).href);
const { createElement: h } = await import("react");
const { renderToStaticMarkup } = await import("react-dom/server");

let hechas = 0;
const prueba = (n, fn) => {
  try { fn(); hechas++; console.log("  ok   " + n); }
  catch (e) { console.error("  FALLA " + n + "\n         " + e.message); process.exitCode = 1; }
};

console.log("pantalla · el guardado al cerrar la pestaña (P3-9)");

const envio = (sede, n) => ({ sede, cuerpo: "x".repeat(n) });

prueba("lo que entra en los 64 KiB va con keepalive; lo que no, queda para después", () => {
  const { mandar, quedan } = M.Salida.repartirGuardadoDeSalida(
    [envio("GRANDE", 60_000), envio("CHICA", 2_000), envio("MEDIA", 10_000)]);
  // De la más chica a la más grande: se salvan las más posibles.
  assert.deepEqual(mandar.map((e) => e.sede), ["CHICA", "MEDIA"]);
  assert.deepEqual(quedan, ["GRANDE"]);
});

prueba("un plano solo de más de 64 KiB no se manda (antes el fetch fallaba callado)", () => {
  const { mandar, quedan } = M.Salida.repartirGuardadoDeSalida([envio("ENORME", 70_000)]);
  assert.deepEqual(mandar, []);
  assert.deepEqual(quedan, ["ENORME"]);
});

prueba("lo que ya salió en el mismo cierre cuenta contra el tope (beforeunload y pagehide)", () => {
  const { mandar, quedan } = M.Salida.repartirGuardadoDeSalida([envio("OTRA", 20_000)], 50_000);
  assert.deepEqual(mandar, []);
  assert.deepEqual(quedan, ["OTRA"]);
});

prueba("los bytes son los de UTF-8 (las tildes cuentan doble), no las letras", () => {
  assert.equal(M.Salida.bytesDe("góndola"), 8);
  assert.ok(M.Salida.TOPE_KEEPALIVE_BYTES < 64 * 1024);
});

console.log("\npantalla · una versión nueva publicada con la pestaña abierta (P1-19)");

const almacen = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); } };
};

prueba("recarga UNA vez; la segunda, dentro de los 5 minutos, ya no (sin bucle)", () => {
  const s = almacen();
  assert.equal(M.Err.recargarUnaVez(1_000_000, s), true);
  assert.equal(M.Err.recargarUnaVez(1_000_000 + 60_000, s), false);
  // Pasado el rato, una versión nueva más tarde puede volver a recargar.
  assert.equal(M.Err.recargarUnaVez(1_000_000 + 6 * 60_000, s), true);
});

prueba("sin sessionStorage no recarga sola: decide la persona", () => {
  assert.equal(M.Err.recargarUnaVez(1, null), false);
  const roto = { getItem: () => { throw new Error("bloqueado"); }, setItem: () => {} };
  assert.equal(M.Err.recargarUnaVez(1, roto), false);
});

prueba("reconoce un pedazo que no bajó en Chrome, Firefox, Safari y la precarga de CSS", () => {
  for (const m of [
    "Failed to fetch dynamically imported module: https://x/assets/DashboardView-abc.js",
    "error loading dynamically imported module",
    "Importing a module script failed.",
    "Unable to preload CSS for /assets/Dashboard-x.css",
  ]) assert.ok(M.Err.esErrorDeCarga(new TypeError(m)), m);
  assert.ok(!M.Err.esErrorDeCarga(new TypeError("Cannot read properties of undefined (reading 'code')")));
});

prueba("la pantalla de la app: <main>, <h1>, UN «Recargar» amarillo y la salida al comienzo", () => {
  const html = renderToStaticMarkup(h(M.Err.PantallaDeError, { nivel: "app", error: new Error("boom") }));
  assert.match(html, /^<main class="error-app">/);
  assert.match(html, /<h1 class="error-app-titulo">Algo falló al mostrar esta pantalla<\/h1>/);
  assert.equal((html.match(/btn-principal/g) || []).length, 1);
  assert.match(html, />Recargar</);
  assert.match(html, /href="\/"[^>]*>Ir al comienzo</);
  assert.match(html, /role="alert"/);
  assert.match(html, /<code>boom<\/code>/);
});

prueba("la del módulo: <h2> con el nombre del módulo y «Probar de nuevo» (sin recargar)", () => {
  const html = renderToStaticMarkup(h(M.Err.PantallaDeError, {
    nivel: "modulo", donde: "Indicadores", error: new Error("x"), onReintentar: () => {},
  }));
  assert.match(html, /<h2[^>]*>Indicadores no se pudo mostrar<\/h2>/);
  assert.match(html, /Probar de nuevo sin recargar/);
  assert.ok(!/<main/.test(html), "el módulo va adentro del <main> del tablero: no lleva otro");
});

prueba("un pedazo que no bajó dice «versión nueva» y no ofrece reintentar sin recargar", () => {
  const html = renderToStaticMarkup(h(M.Err.PantallaDeError, {
    nivel: "modulo", donde: "Contratos", error: new TypeError("Failed to fetch dynamically imported module: /a.js"), onReintentar: () => {},
  }));
  assert.match(html, /versión nueva/);
  assert.ok(!/Probar de nuevo/.test(html));
});

console.log("\npantalla · «vacío» no es «no se pudo leer» (P2-15)");

prueba("un 404 (servidor sin la ruta) o un 401/403 (otro rol) no son fallas de lectura; un 500 o sin red, sí", () => {
  const con = (status) => ({ response: { status } });
  assert.equal(M.Leer.esFallaDeLectura(con(404)), false);
  assert.equal(M.Leer.esFallaDeLectura(con(403)), false);
  assert.equal(M.Leer.esFallaDeLectura(con(401)), false);
  assert.equal(M.Leer.esFallaDeLectura(con(500)), true);
  assert.equal(M.Leer.esFallaDeLectura(new Error("Network Error")), true);
});

prueba("el aviso dice qué no se leyó, en castellano, y no se dibuja si no falta nada", () => {
  assert.equal(M.Leer.enLista(["a", "b", "c"]), "a, b y c");
  assert.equal(renderToStaticMarkup(h(M.Aviso.AvisoSinLeer, { que: [], onReintentar: () => {} })), "");
  const html = renderToStaticMarkup(h(M.Aviso.AvisoSinLeer, { que: ["las reservas", "los cobros por ventas"], onReintentar: () => {} }));
  assert.match(html, /No se pudo leer las reservas y los cobros por ventas\./);
  assert.match(html, /role="alert"/);
  assert.match(html, /Reintentar/);
  assert.ok(!/\$/.test(html), "el aviso no lleva plata (lo ve también quien trabaja en la tienda)");
});

console.log("\npantalla · el 3D sin WebGL (P2-19)");

prueba("sin WebGL: la causa, la salida al 2D y NO «Volver a abrir el 3D» (no serviría)", () => {
  const html = renderToStaticMarkup(h(M.Lienzo.SinLienzo, { causa: "sin_webgl", irAl2D: () => {}, onReintentar: () => {} }));
  assert.match(html, /Este navegador no puede mostrar el 3D/);
  assert.match(html, /aceleración por hardware/);
  assert.match(html, /Abrir el plano 2D/);
  assert.ok(!/Volver a abrir el 3D/.test(html));
});

prueba("el contexto perdido sí ofrece volver a abrirlo; el visor de Vender no lleva al 2D", () => {
  const html = renderToStaticMarkup(h(M.Lienzo.SinLienzo, { causa: "perdido", onReintentar: () => {} }));
  assert.match(html, /El 3D se detuvo/);
  assert.match(html, /Volver a abrir el 3D/);
  assert.ok(!/Abrir el plano 2D/.test(html));
});

prueba("el error de Three al crear el contexto se reconoce como «sin WebGL»", () => {
  assert.ok(M.Lienzo.esFaltaDeWebGL(new Error("Error creating WebGL context.")));
  assert.ok(!M.Lienzo.esFaltaDeWebGL(new Error("Cannot read properties of null")));
});

rmSync(salida, { force: true });
console.log(`\n${hechas} pruebas de la pantalla`);
