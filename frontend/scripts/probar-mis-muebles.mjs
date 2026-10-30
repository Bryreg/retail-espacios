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
import { readFileSync, readdirSync } from "node:fs";
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
  stdin: { contents: 'export * as P from "./src/catalogo/plano2D.ts"; export { CATALOGO_DE_MUEBLES } from "./src/catalogo/catalogo.ts"; export * as F from "./src/utils/formularioDeFicha.ts"; export * as M from "./src/modulos.ts";', resolveDir: raiz, loader: "ts" },
  bundle: true, write: false, format: "esm", platform: "neutral", logLevel: "silent",
});
const { P, CATALOGO_DE_MUEBLES, F, M } = await import("data:text/javascript;base64," + Buffer.from(r.outputFiles[0].text).toString("base64"));

const plano = sinComentarios(leer("src/components/FloorPlan2D/FloorPlan2D.tsx"));
const ed3D = sinComentarios(leer("src/components/StoreEditor3D/StoreEditor3D.tsx"));
const mini = sinComentarios(leer("src/components/FloorPlan2D/Miniatura3D.tsx"));
const taller = sinComentarios(leer("src/pages/TallerMuebles.tsx"));
const pagina = sinComentarios(leer("src/pages/MisMuebles.tsx"));
const asistente = sinComentarios(leer("src/components/taller/AsistenteDeMueble.tsx"));
const listo = sinComentarios(leer("src/components/taller/MuebleListo.tsx"));
const retirar = sinComentarios(leer("src/components/taller/RetirarMueble.tsx"));
const vista = sinComentarios(leer("src/components/taller/VistaDeLaFicha.tsx"));
const app = sinComentarios(leer("src/App.tsx"));
const dashboard = sinComentarios(leer("src/pages/Dashboard.tsx"));
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

await prueba("crear un mueble lleva a Mis muebles con la sede y vuelve con el catálogo abierto", () => {
  assert.match(plano, /const q = new URLSearchParams\(\{ desde: "plano", sede \}\);\s*if \(pendingType\) q\.set\("tipo", pendingType\);\s*navigate\(`\/plano\/muebles\/nuevo\?\$\{q\.toString\(\)\}`\);/);
  assert.ok(plano.includes("data-crear-en-taller") && plano.includes("data-crear-mueble"), "falta una de las dos entradas al taller");
  assert.match(plano, /useState\(vieneDelTaller\)/, "al volver del taller el catálogo no se abre");
  // El asistente arranca en la familia que se estaba por colocar, con el
  // aviso de dónde se vino y la vuelta.
  assert.match(pagina, /entradaInicial=\{desdePlano \? entradaDelTipoDelPlano\(params\.get\("tipo"\)\) : undefined\}/, "no arranca en la familia del plano");
  assert.match(pagina, /navigate\("\/plano", \{ state: \{ delTaller: true, \.\.\.\(colocar \? \{ colocar \} : \{\}\) \} \}\)/, "la vuelta no abre «Mis muebles»");
  assert.ok(asistente.includes("data-taller-desde-plano") && asistente.includes("data-volver-al-plano"));
  assert.ok(!taller.includes("desdePlano"), "el banco de prueba sigue recibiendo lo del plano");
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
  // Tres botones y la salida del 3D que no se puede dibujar (P2-19, `irAl2D`).
  assert.equal((ed3D.match(/navigate\("\/plano"\)/g) ?? []).length, 4, "«Editar en el 2D» / «Ir al plano 2D» no llevan al plano");
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

await prueba("la miniatura 3D no se pierde: la rueda baja la ficha, la cámara es una y «Centrar» vuelve", () => {
  // El dueño: «hace un movimiento de cámara y se pierde». Con el acercamiento
  // prendido, la rueda sobre la miniatura acercaba o alejaba la cámara en vez
  // de bajar la ficha, sin límite: adentro del mueble o lejos.
  assert.match(mini, /c\.enableZoom = false;/, "la rueda vuelve a mover la cámara");
  assert.match(mini, /c\.maxPolarAngle = Math\.PI \/ 2 - 0\.06;/, "la cámara puede ir por debajo del piso");
  // En el teléfono un dedo desplaza la ficha; dos giran.
  assert.match(mini, /c\.touches = \{ ONE: -1 as unknown as TOUCH, TWO: TOUCH\.DOLLY_ROTATE \};/);
  assert.match(css, /\.plano2d \.p2-mini3d-lienzo canvas \{ display: block; touch-action: pan-y; \}/);
  // UNA cámara: las opciones del lienzo no cambian con cada render.
  assert.match(mini, /const \[camara\] = useState\(\(\) => \(\{/);
  assert.match(mini, /camera=\{camara\}/);
  // La toma se vuelve a poner sólo cuando cambia lo que se mira, o con «Centrar».
  assert.match(mini, /const clave = `\$\{vista\}\|\$\{\(size\.width \/ Math\.max\(1, size\.height\)\)\.toFixed\(1\)\}`;/);
  assert.match(mini, /onClick=\{\(\) => setVuelta\(\(v\) => v \+ 1\)\} data-centrar-miniatura/);
});

console.log("\nPlano › Mis muebles: el taller en tres pasos (2026-10-28)");

await prueba("Mis muebles es parte del Plano: su dirección, su lugar en 2D | 3D | Muebles y sólo para administración", () => {
  assert.equal(M.RUTA_DE.muebles, "/plano/muebles");
  for (const r of ["/plano/muebles", "/plano/muebles/", "/plano/muebles/nuevo", "/plano/muebles/nevera-de-la-entrada"]) {
    assert.equal(M.moduloDeRuta(r), "muebles", r);
  }
  assert.equal(M.moduloDeRuta("/plano/mueblesx"), null);
  assert.equal(M.moduloDeRuta("/plano"), "plano");
  assert.equal(M.puedeAbrir("muebles", true), true);
  assert.equal(M.puedeAbrir("muebles", false), false, "quien trabaja en la tienda arma muebles");
  assert.match(dashboard, /\["muebles", "Muebles", /, "falta «Muebles» al lado de 2D y 3D");
  assert.match(dashboard, /efectivo === "muebles" \? \(/, "el Dashboard no muestra Mis muebles");
  // Los enlaces viejos llevan ahí; el banco de prueba queda aparte.
  assert.match(app, /<Navigate to=\{`\/plano\/muebles\$\{desdePlano \? "\/nuevo" : ""\}\$\{search\}`\} replace \/>/);
  assert.match(leer("src/acciones.ts"), /id: "taller", texto: "Mis muebles"[^]*?hacer: \(c\) => c\.ir\("muebles"\)/);
});

await prueba("el asistente: cada paso frena con lo suyo, y guardar vuelve al paso que hay que corregir", () => {
  const f = { ...F.formularioVacio("nevera_puertas"), anchoCm: "400" };
  assert.deepEqual(F.problemasDelPaso(f, 1).map((p) => p.campo), [], "el paso 1 frena por las medidas");
  assert.deepEqual(F.problemasDelPaso(f, 2).map((p) => p.campo), ["w"]);
  const p3 = F.problemasDelPaso(f, 3).map((p) => p.campo);
  assert.ok(p3.includes("nombre") && p3.includes("fuente.confiabilidad"), p3.join(","));
  // Cada campo del formulario es de un solo paso, y todos los problemas caen en uno.
  const todos = [...F.CAMPOS_DEL_PASO[1], ...F.CAMPOS_DEL_PASO[2], ...F.CAMPOS_DEL_PASO[3]];
  assert.equal(new Set(todos).size, todos.length, "un campo en dos pasos");
  for (const campo of new Set(Object.values(F.CAMPO_DEL_FORMULARIO))) assert.ok(todos.includes(campo), `${campo} no es de ningún paso`);
  assert.equal(F.pasoDelProblema({ campo: "ficha", problema: "x" }), 3, "lo general va al último paso");
  assert.equal(F.pasoDelProblema({ campo: "partes.puertas", problema: "x" }), 2);
  assert.match(asistente, /if \(todos\.length\) setPaso\(Math\.min\(\.\.\.todos\.map\(pasoDelProblema\)\) as PasoDelAsistente\);/,
    "guardar con un problema no vuelve a su paso");
  // Para adelante sólo con los pasos de antes bien.
  assert.match(asistente, /if \(delPaso\(p\)\.length\) \{\s*setIntentados/, "se salta un paso con problemas");
});

await prueba("«Las medí en la tienda» no pide nada más: la nota sale sola y el plano lleva «≈»", () => {
  const f = { ...F.formularioVacio("nevera_puertas"), nombre: "Nevera de la entrada", clave: "nevera-de-la-entrada", confiabilidad: "estimado" };
  assert.deepEqual(F.problemasDelFormulario(F.conOrigenCompleto(f)), [], "medida en la tienda pide más");
  assert.equal(F.conOrigenCompleto(f).nota, F.NOTA_DE_LA_TIENDA);
  // Lo que se escribió manda; y las otras dos opciones siguen pidiendo lo suyo.
  assert.equal(F.conOrigenCompleto({ ...f, nota: "Con cinta" }).nota, "Con cinta");
  assert.ok(F.problemasDelFormulario(F.conOrigenCompleto({ ...f, confiabilidad: "ficha" })).some((p) => p.campo.startsWith("fuente")), "la ficha del fabricante no pide el enlace");
  assert.deepEqual(F.ORIGENES.map((o) => [o.valor, o.pide]), [["estimado", "nada"], ["ficha", "url"], ["catalogo", "url_o_nota"]]);
  const ficha = F.fichaDelFormulario(F.conOrigenCompleto(f));
  assert.deepEqual(ficha.fuente, { confiabilidad: "estimado", nota: F.NOTA_DE_LA_TIENDA });
  assert.match(asistente, /await guardarFicha\(conOrigenCompleto\(form\)/, "se guarda sin la nota de la tienda");
});

await prueba("«Empezar desde» un modelo de RECABRA copia la forma, no de dónde salió", () => {
  const [dos] = CATALOGO_DE_MUEBLES.modelos.filter((m) => m.tipo === "nevera_puertas" && m.partes?.puertas === 2);
  assert.ok(dos, "no hay nevera de 2 puertas en el catálogo");
  const f = F.formularioDesdeModelo("nevera_puertas", dos);
  assert.equal(f.anchoCm, String(Math.round(dos.w * 1000) / 10).replace(".", ","));
  assert.equal(f.puertas, "2");
  assert.deepEqual([f.nombre, f.clave, f.url, f.nota, f.confiabilidad], ["", "", "", "", ""],
    "copia el nombre o la fuente del modelo de RECABRA");
  // El tipo del plano trae su familia; lo que no admite fichas, ninguna.
  assert.equal(F.entradaDelTipoDelPlano("gondola_mural"), "gondola:wall");
  assert.equal(F.entradaDelTipoDelPlano("nevera_puertas"), "nevera_puertas");
  assert.equal(F.entradaDelTipoDelPlano("no-existe"), undefined);
  assert.equal(F.entradaDelTipoDelPlano(null), undefined);
  // − y + dentro del rango, desde el valor automático si está vacío.
  assert.equal(F.pasoDeNumero("", 1, 1, 6, 2), "3");
  assert.equal(F.pasoDeNumero("6", 1, 1, 6, 2), "6");
  assert.equal(F.pasoDeNumero("144,5", -1, 60, 320, 100), "143,5");
});

await prueba("al guardar: «Listo» lleva al plano con el mueble elegido para soltar", () => {
  assert.match(pagina, /onColocar=\{\(\) => alPlano\(listo\.id\)\}/, "«Colocar» no lleva el mueble");
  assert.ok(listo.includes("data-colocar-en-plano") && listo.includes("data-crear-otro"));
  // El plano lo busca en «Mis muebles» y lo deja elegido.
  assert.match(plano, /const mio = misMuebles\.find\(\(x\) => x\.modelo\.id === porColocar\);[^]*?setActiveTool\("place"\); setPendingType\(mio\.tipo\); setPendingModelo\(mio\.modelo\);/,
    "el plano no deja elegido el mueble recién armado");
});

await prueba("retirar se confirma en la app y dice cuántos hay colocados; un amarillo por pantalla", () => {
  assert.match(retirar, /f\.modelo === id/, "no cuenta lo colocado con esa ficha");
  assert.ok(retirar.includes("data-capa-modal") && retirar.includes('role="alertdialog"'));
  assert.match(retirar, /Se puede reactivar cuando quieras desde «Retirados»\./);
  for (const [n, t] of [["la lista", pagina], ["el asistente", asistente], ["listo", listo]]) {
    assert.equal((t.match(/"btn-principal /g) || []).length, 1, `${n}: más de un botón principal`);
  }
  // Las fotos: un solo lienzo escondido, no uno por tarjeta.
  assert.equal((pagina.match(/<Canvas/g) || []).length, 0);
  assert.match(pagina, /<FotografoDeMuebles \/>/);
  assert.match(vista, /cola\.shift\(\);/);
});

await prueba("todo lienzo 3D va a 1:1 adentro de la app escalada (la vista de la ficha no crece sin fin)", () => {
  // `escala.ts` pone `zoom` en el <body> (1,2 a 1920 × 1080): un <Canvas> sin
  // anfitrión a 1:1 se medía agrandado, se ponía ese tamaño y volvía a
  // agrandarse. En la ficha del plano crecía hasta millones de px y el mueble
  // «se iba» (el dueño, 2026-10-28).
  const tsx = readdirSync(join(raiz, "src"), { recursive: true }).filter((f) => String(f).endsWith(".tsx"));
  const conLienzo = tsx.filter((f) => /<Canvas\b/.test(sinComentarios(leer(join("src", String(f))))));
  assert.ok(conLienzo.length >= 4, "no encuentro los lienzos 3D");
  for (const f of conLienzo) {
    assert.match(sinComentarios(leer(join("src", String(f)))), /SIN_ESCALA/, `${f}: un <Canvas> sin anfitrión a 1:1`);
  }
  for (const [n, t] of [["la miniatura", mini], ["la vista de la ficha", vista]]) {
    const i = t.indexOf("<div style={ANFITRION_SIN_ESCALA}>"), j = t.indexOf("<Canvas");
    assert.ok(i >= 0 && i < j, `${n}: el <Canvas> no va adentro de su anfitrión`);
  }
  assert.match(leer("src/plano.css"), /\.p2-mini3d \{[^}]*grid-template-columns: minmax\(0, 1fr\)/, "la columna de la miniatura crece con el lienzo");
});

console.log(`\n${hechas} pruebas · el plano se edita en el 2D y los muebles se arman en Mis muebles`);
