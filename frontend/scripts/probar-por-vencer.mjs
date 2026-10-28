/**
 * Por vencer en el plano (2026-10-28)
 *   npm run probar:por-vencer
 *
 * ── Por qué existe este archivo ──────────────────────────────────────────────
 *
 * El dueño: «cuando voy a revisar los "Por vencer" sólo me sale en la barra
 * lateral, pero no me muestra en el mapa cuál mueble es». Lo aprobado sobre el
 * lienzo «RECABRA · Por vencer en el plano», UN solo lugar entre por donde se
 * entre:
 *
 *   1. «Por vencer · Ver cuáles» del Inicio (y tocar una fila de Pendientes)
 *      lleva a Indicadores › Plano: lo que vence, resaltado en el plano.
 *   2. Tocar una fila lleva el plano al mueble y la ficha queda AL LADO, sin
 *      velo, con «← Por vencer · 1 de 4 ‹ ›».
 *   3. Donde la ficha se abre sin plano, suma «Dónde está» con «Ver en el
 *      plano».
 *   4. En el teléfono, el plano arriba y la ficha como hoja.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = join(aqui, "..");
const leer = (p) => readFileSync(join(raiz, p), "utf8");
const sinComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

let hechas = 0;
const prueba = async (n, fn) => {
  try { await fn(); hechas++; console.log("  ok   " + n); }
  catch (e) { console.error("  FALLA " + n + "\n         " + e.message.split("\n").join("\n         ")); process.exitCode = 1; }
};

const r = await build({
  stdin: { contents: 'export * as R from "./src/components/Supervisar/paraRevisar.ts";', resolveDir: raiz, loader: "ts" },
  bundle: true, write: false, format: "esm", platform: "neutral", logLevel: "silent",
});
const { R } = await import("data:text/javascript;base64," + Buffer.from(r.outputFiles[0].text).toString("base64"));

const vista = sinComentarios(leer("src/pages/DashboardView.tsx"));
const donde = sinComentarios(leer("src/components/Supervisar/DondeEsta.tsx"));
const css = leer("src/supervisar.css");

console.log("por vencer · ‹ › entre los de la misma sección");

await prueba("los vecinos de un aviso son los de su sección con mueble, en el orden de la lista y sin repetir lugar", () => {
  const avisos = [
    { seccion: "por_vencer", clave: "pv-1", fixtureId: "a", cara: "A" },
    { seccion: "sin_montar", clave: "sm-1", fixtureId: "b", cara: "A" },
    { seccion: "por_vencer", clave: "pv-2", fixtureId: "c", cara: "B" },
    { seccion: "por_vencer", clave: "pv-2b", fixtureId: "c", cara: "B" },
    { seccion: "por_vencer", clave: "pv-x" },
    { seccion: "por_vencer", clave: "pv-3", fixtureId: "d", cara: "A" },
  ];
  const v = R.vecinosDelAviso(avisos, "pv-2");
  assert.deepEqual(v.lista.map((a) => a.clave), ["pv-1", "pv-2", "pv-3"]);
  assert.equal(v.indice, 1);
  // Otra parte del MISMO lugar del plano cae en ese lugar.
  assert.equal(R.vecinosDelAviso(avisos, "pv-2b").indice, 1);
  // Sin mueble, o sin aviso: sin vecinos (la ficha dice «Para revisar»).
  assert.deepEqual(R.vecinosDelAviso(avisos, "pv-x"), { lista: [], indice: -1 });
  assert.deepEqual(R.vecinosDelAviso(avisos, null), { lista: [], indice: -1 });
  assert.deepEqual(R.vecinosDelAviso(avisos, "sm-1").lista.map((a) => a.clave), ["sm-1"]);
});

console.log("\npor vencer · un solo plano, se entre por donde se entre");

await prueba("«Por vencer · Ver cuáles» del Inicio abre Indicadores › Plano con el filtro y «30 días»", () => {
  assert.match(vista, /onVerPorVencer=\{\(\) => abrirPlanoDesde\("expiring", "Por vencer \(30 días\)"\)\}/);
  const f = vista.slice(vista.indexOf("const abrirPlanoDesde = "), vista.indexOf("const abrirTablaDesde = "));
  for (const x of ['setModo("supervisar")', 'setPestanaInd("plano")', "setMapFilter(filtro)", 'setGrupoElegido("dias30")', 'setLlegada({ desde: "Inicio", cifra })']) {
    assert.ok(f.includes(x), `abrirPlanoDesde no hace ${x}`);
  }
  // El filtro se dice en el borde del plano y se quita ahí.
  assert.match(vista, /data-filtro-del-plano=\{mapFilter\}/);
  assert.match(vista, /\{filtroDelPlano\.label\} · \{filtroDelPlano\.n\}/);
});

await prueba("tocar una fila de Pendientes (la bandeja) lleva al plano, no abre la ficha encima de la pantalla", () => {
  const f = vista.slice(vista.indexOf("const revisar = "), vista.indexOf("const negociar = "));
  assert.match(f, /if \(useArmazon\.getState\(\)\.bandejaAbierta\) \{\s*useArmazon\.getState\(\)\.cerrarBandeja\(\);[^]*?setPestanaInd\("plano"\);\s*setModo\("supervisar"\);/);
});

await prueba("en Indicadores › Plano la ficha va AL LADO del plano, sin cajón, y el plano va al mueble", () => {
  assert.match(vista, /const fichaEnPlano = enIndicadores && pestanaInd === "plano" && !bandejaAbierta;/);
  assert.match(vista, /\{fichaAlLado \? \(\s*<div className="ficha-al-lado" data-ficha-al-lado>\{fichaDelEspacio\}<\/div>/);
  assert.match(vista, /\{fichaDelEspacio && modoEfectivo !== "vender" && !fichaAlLado && \(/, "la ficha al lado se abre también en el cajón");
  assert.match(vista, /irAlMueble=\{irAlMuebleEnElPlano\}/, "el plano de Indicadores no recibe «irAlMueble»");
  assert.match(vista, /const ok = irAlMuebleEnElPlano\.current\?\.\(idAlLado\) \?\? false;/);
  // La cámara vuelve a como estaba al cerrar la ficha.
  assert.match(vista, /if \(!idAlLado\) \{\s*irAlMuebleEnElPlano\.current\?\.\(null\);/);
  // Se anima, salvo con «reducir movimiento».
  assert.match(vista, /prefers-reduced-motion: reduce/);
});

await prueba("la ficha al lado dice de qué lista vino, cuál es y pasa al siguiente", () => {
  assert.match(vista, /const vecinos = useMemo\(\(\) => vecinosDelAviso\(avisos, avisoAbierto\), \[avisos, avisoAbierto\]\);/);
  assert.ok(vista.includes("data-ficha-nav") && vista.includes("data-volver-a-la-lista") && vista.includes("data-ficha-siguiente"));
  assert.match(vista, /\{vecinos\.indice \+ 1\} de \{vecinos\.lista\.length\}/);
  // La fila tocada se anota antes de que `revisar` la lea, y se olvida si no se usó.
  assert.match(vista, /onClickCapture=\{\(e\) => \{[^]*?avisoTocado\.current = fila\?\.dataset\.aviso \?\? null;[^]*?window\.setTimeout\(\(\) => \{ avisoTocado\.current = null; \}, 0\);/);
  // Una sola flecha de volver.
  assert.match(css, /\.sup \.ficha-al-lado \.ficha-cab > \.icobtn:first-child \{ display: none; \}/);
});

await prueba("donde no hay plano, la ficha dice «Dónde está», con «Ver en el plano»", () => {
  assert.match(vista, /dondeEsta=\{fichaAlLado \? undefined : \(\s*<DondeEsta fixtures=\{fixtures\} fixtureId=\{selected\.id\}/);
  assert.match(vista, /onVerEnPlano=\{verEnElPlano\}/);
  const v = vista.slice(vista.indexOf("const verEnElPlano = "), vista.indexOf("const fichaDelEspacio = "));
  assert.ok(v.includes('setPestanaInd("plano")') && v.includes('setModo("supervisar")'), "«Ver en el plano» no lleva al plano");
  // El dibujo: el mueble marcado y su anillo, los demás de fondo, sin texto inventado.
  assert.ok(donde.includes('className="propio"') && donde.includes('className="anillo"') && donde.includes('className="otro"'));
  assert.ok(donde.includes("data-ver-en-el-plano"));
  // El estilo del dibujo no le pega al ícono de la flecha.
  assert.match(css, /\.donde-esta > svg \{/);
});

await prueba("en una columna el plano va primero, y en el teléfono la ficha es una hoja encima de la barra", () => {
  assert.match(css, /\.supervisar-hoja\[data-ficha\] > \.col-revisar,\s*\.supervisar-hoja\[data-plano-primero\] > \.col-revisar \{ order: 1; \}/);
  assert.match(css, /\.sup \.supervisar-hoja\[data-ficha\] \.ficha-al-lado \{\s*position: fixed; left: 0; right: 0; top: 50%; bottom: var\(--alto-barra-abajo, 61px\);/);
});

console.log(`\n${hechas} pruebas · por vencer en el plano`);
