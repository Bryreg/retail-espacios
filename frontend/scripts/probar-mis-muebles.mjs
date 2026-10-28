/**
 * El plano se edita en el 2D; el 3D es para mirar (2026-10-28)
 *   npm run probar:mis-muebles
 *
 * ── Por qué existe este archivo ──────────────────────────────────────────────
 *
 * Lo que pidió el dueño, aprobado sobre el lienzo «Plano 2D, taller y 3D»:
 *
 *   · La biblioteca del plano ofrece UNO de cada tipo, en su medida estándar,
 *     y aparte «Mis muebles»: sólo lo que el supermercado armó en el taller.
 *     Para otras medidas, «Crear un mueble con otras medidas» lleva al taller
 *     y la vuelta abre el catálogo con el mueble nuevo a la vista.
 *   · El 3D no coloca, mueve, gira ni borra muebles: es para mirar (recorrer,
 *     primera persona, el arte, productos y distribuciones).
 *   · El 2D muestra el mueble elegido en 3D, DENTRO de su ficha: nada se monta
 *     sobre otra cosa.
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
  stdin: { contents: 'export * as P from "./src/catalogo/plano2D.ts"; export { CATALOGO_DE_MUEBLES } from "./src/catalogo/catalogo.ts";', resolveDir: raiz, loader: "ts" },
  bundle: true, write: false, format: "esm", platform: "neutral", logLevel: "silent",
});
const { P, CATALOGO_DE_MUEBLES } = await import("data:text/javascript;base64," + Buffer.from(r.outputFiles[0].text).toString("base64"));

const plano = sinComentarios(leer("src/components/FloorPlan2D/FloorPlan2D.tsx"));
const ed3D = sinComentarios(leer("src/components/StoreEditor3D/StoreEditor3D.tsx"));
const mini = sinComentarios(leer("src/components/FloorPlan2D/Miniatura3D.tsx"));
const taller = sinComentarios(leer("src/pages/TallerMuebles.tsx"));
const css = leer("src/plano.css");

console.log("plano · uno de cada tipo y «Mis muebles»");

const propia = (clave, datos) => ({
  id: `${CATALOGO_DE_MUEBLES.fichas.prefijoPropio}${clave}`, clave, retirado: false,
  fuente: { confiabilidad: "ficha" }, ...datos,
});

await prueba("«Mis muebles» son sólo las fichas propias vigentes, cada una con su tipo del plano", () => {
  const propias = [
    propia("nev-2p", { tipo: "nevera_puertas", nombre: "Nevera 2 puertas", w: 1.4, d: 0.7, h: 2, partes: { puertas: 2, division: "puertas" } }),
    propia("mural-170", { tipo: "gondola", variante: "wall", nombre: "Mural 1,70", w: 1, d: 0.45, h: 1.7 }),
    propia("vieja", { tipo: "isla", nombre: "Estiba vieja", w: 1, d: 1, h: 1.2, retirado: true }),
  ];
  const mios = P.misMueblesDelPlano(propias);
  assert.deepEqual(mios.map((m) => `${m.tipo}|${m.modelo.id}`).sort(), ["gondola_mural|cli:mural-170", "nevera_puertas|cli:nev-2p"]);
  assert.equal(mios.find((m) => m.modelo.id === "cli:nev-2p").modelo.comoSeVende, "por puertas", "no dice cómo se vende");
  assert.deepEqual(P.misMueblesDelPlano([]), [], "sin fichas, «Mis muebles» trae algo");
});

await prueba("la biblioteca no lista los modelos de RECABRA: uno de cada tipo y «Mis muebles» arriba", () => {
  assert.ok(!/MODELOS_2D|modelosDelPlanoConPropias|data-modelos-2d|Elegir el modelo/.test(plano), "volvió el repertorio de modelos");
  assert.ok(plano.includes("data-mis-muebles") && plano.includes("Mis muebles · {misMuebles.length}"));
  const i = plano.indexOf("data-mis-muebles"), j = plano.indexOf("{familias.map(([cat, defs])", i);
  assert.ok(i > 0 && j > i, "«Mis muebles» no va arriba de las familias");
  assert.ok(plano.includes("Uno de cada tipo, con las medidas más comunes."), "vacío no explica qué hacer");
});

await prueba("crear un mueble lleva al taller con la sede y vuelve con el catálogo abierto", () => {
  assert.match(plano, /const q = new URLSearchParams\(\{ desde: "plano", sede \}\);\s*if \(pendingType\) q\.set\("tipo", pendingType\);\s*navigate\(`\/taller\?\$\{q\.toString\(\)\}`\);/);
  assert.ok(plano.includes("data-crear-en-taller") && plano.includes("data-crear-mueble"), "falta una de las dos entradas al taller");
  assert.match(plano, /useState\(vieneDelTaller\)/, "al volver del taller el catálogo no se abre");
  assert.match(taller, /useState<"mirar" \| "fichas">\(desdePlano \? "fichas" : "mirar"\)/, "el taller no abre en «Fichas»");
  assert.match(taller, /navigate\("\/plano", \{ state: \{ delTaller: true \} \}\)/, "la vuelta no abre «Mis muebles»");
  assert.ok(taller.includes("data-taller-desde-plano") && taller.includes("data-volver-al-plano"));
  assert.match(taller, /onGuardada=\{desdePlano \? setGuardadaDesdePlano : undefined\}/, "guardar no lo dice en el aviso");
});

await prueba("el pie de la tira es UN bloque pegado: «Crear mueble» y «Más» no se montan", () => {
  assert.match(css, /\.plano2d \.p2-tira-pie \{\s*position: sticky;/);
  assert.ok(!/\.p2-pieza\.mas \{[^}]*position: sticky/.test(css), "«Más» volvió a pegarse por su cuenta");
  assert.match(plano, /<div className="p2-tira-pie">[\s\S]*?data-crear-mueble[\s\S]*?data-catalogo-completo[\s\S]*?<\/div>\s*<\/nav>/);
});

console.log("\nplano · el 3D es para mirar");

await prueba("el 3D no coloca, arrastra, gira, borra ni deshace", () => {
  for (const [patron, que] of [
    [/\bplacingDef\b/, "colocar"], [/\bdraggingId\b/, "arrastrar"], [/TransformControls/, "el gizmo"],
    [/function (rotateSelected|flipSelected|deleteSelected|handleClear|handleSave)\(/, "girar, borrar, limpiar o guardar"],
    [/\bundo\(\)|\bredo\(\)/, "deshacer"], [/data-paleta-3d|paletaConPropias/, "la paleta"],
    [/<GeometriaDelMueble |<PartesDelMueble /, "editar medidas o partes"], [/onRenombrar|onIntercambiar/, "renombrar"],
  ]) assert.ok(!patron.test(ed3D), `el 3D volvió a ${que}`);
  assert.match(ed3D, /\},\[presentationMode,firstPerson\]\);/, "el atajo de teclado atiende más que Esc");
});

await prueba("el 3D dice dónde se edita y deja lo de mirar", () => {
  assert.ok(ed3D.includes("data-mirar-3d") && ed3D.includes("data-editar-en-2d") && ed3D.includes("data-editar-en-2d-panel"));
  assert.equal((ed3D.match(/navigate\("\/plano"\)/g) ?? []).length, 3, "«Editar en el 2D» / «Ir al plano 2D» no llevan al plano");
  for (const sigue of ["<VistaProveedor", "Distribuir esta cara", "alternarPresentar", "setFirstPerson(p => !p)", "exportarPropuesta"]) {
    assert.ok(ed3D.includes(sigue), `el 3D perdió «${sigue}»`);
  }
});

console.log("\nplano · la vista 3D en la ficha del 2D");

await prueba("la miniatura vive DENTRO de la ficha, perezosa, con el mismo dibujo que el 3D", () => {
  assert.match(plano, /const Miniatura3D = lazy\(\(\) => import\("\.\/Miniatura3D"\)\);/);
  const ficha = plano.slice(plano.indexOf("function AssignmentPanel("));
  const i = ficha.indexOf("<Miniatura3D "), j = ficha.indexOf('data-pestanas', i), k = ficha.indexOf('data-resumen');
  assert.ok(k > 0 && i > k && j > i, "la miniatura no va en la ficha, entre el resumen y las pestañas");
  assert.equal((plano.match(/<Miniatura3D /g) ?? []).length, 1);
  assert.match(mini, /<FixtureMesh fixture=\{fix\} \/>/, "no dibuja el mueble con el dibujo del 3D");
  assert.match(mini, /useFixtureStore\(selectFixtures\)/, "no se actualiza con el plano");
  assert.match(mini, /pedirEnfoque3D|onAbrir3D/);
  assert.match(plano, /onAbrir3D=\{\(\) => useFixtureStore\.getState\(\)\.pedirEnfoque3D\(item\.id, isDouble \? activeFace : "A"\)\}/);
});

await prueba("nada se monta: la miniatura no flota, y las hojas no tapan la tira", () => {
  const reglas = css.match(/\.plano2d \.p2-mini3d[^{]*\{[^}]*\}/g) ?? [];
  assert.ok(reglas.length >= 4, "faltan los estilos de la miniatura");
  assert.ok(!reglas.some((r) => /position:\s*(absolute|fixed)/.test(r) && !/p2-mini3d-lienzo/.test(r)), "la miniatura flota sobre el lienzo");
  assert.match(css, /\.plano2d \.p2-mini3d-lienzo \{ position: relative; height: 180px;/);
  assert.match(css, /\.plano2d \.p2-panel \{ left: var\(--ancho-tira, 0px\); \}/, "la hoja de la ficha tapa la tira (tableta)");
  assert.match(css, /\.plano2d \.p2-catalogo \{ position: absolute; z-index: 32; top: auto; left: 0; right: 0; bottom: var\(--alto-tira, 0px\);/, "el catálogo tapa la tira (teléfono)");
  assert.match(css, /\.plano2d \.p2-catalogo \{\s*position: relative;\s*flex: none;/, "el catálogo abierto vuelve a flotar sobre el lienzo");
  assert.match(css, /\.plano2d \.p2-panel \{ left: 0; bottom: var\(--alto-tira, 0px\); \}/, "la ficha tapa la tira (teléfono)");
  assert.match(plano, /cuerpo\.style\.setProperty\("--alto-tira", `\$\{tira\.offsetHeight\}px`\);/);
  assert.match(plano, /cuerpo\.style\.setProperty\("--ancho-tira", `\$\{tira\.offsetWidth\}px`\);/);
  assert.match(plano, /if \(selectedId && typeof window !== "undefined" && window\.matchMedia\("\(max-width: 860px\)"\)\.matches\) setCatalogoAbierto\(false\);/,
    "en tableta y teléfono la ficha y el catálogo se montan");
  assert.match(plano, /navigate\(location\.pathname, \{ replace: true, state: null \}\);/, "la vuelta del taller queda en el historial");
});

console.log(`\n${hechas} pruebas · el plano se edita en el 2D`);
