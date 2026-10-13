/**
 * Pruebas de lo que se puede editar del mueble y lo que no se puede perder.
 *   npm run probar:geometria
 *
 * La góndola y la punta tienen «Alto», «Entrepaños» y «Módulo» en el panel
 * del plano 2D y en el del Editor 3D (`components/GeometriaDelMueble.tsx`,
 * con la cuenta en `utils/geometriaDelMueble.ts`). Lo que fijan estas pruebas:
 *
 *  · Lo vendido no se mueve sin aviso. Una cara con contrato vivo o firmado,
 *    con arte pintado o un mueble con espacios internos vendidos: cambiar el
 *    alto, los entrepaños o el módulo pide «Cambiar igual» y dice qué se
 *    mueve («cambian las filas del arte de esta cara»). Con espacios internos
 *    vendidos, la CANTIDAD de entrepaños no se cambia (tampoco la que arrastra
 *    el alto cuando no hay entrepaños guardados) hasta liberarlos.
 *  · Sin nada vendido, se escribe sin preguntar; lo mismo que había no es un
 *    cambio.
 *  · Vaciar un campo escribe `null` (borrado a propósito), no borra la clave:
 *    ausente, el servidor la rellena con la guardada.
 *  · Lo que se escribe se dibuja: la punta, como la góndola, usa sus
 *    entrepaños y su módulo en el dibujo, el producto, el relleno, los
 *    habladores, la lámina y la cámara. Sin los campos, la cuenta de siempre.
 *  · Los dos paneles usan el mismo componente, y el componente no escribe sin
 *    pasar por la revisión.
 *
 * Se ejecuta: el módulo es puro y se compila con esbuild, como `probar-plano`.
 */
import assert from "node:assert/strict";
import { build } from "esbuild";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = join(aqui, "..");
const leer = (p) => readFileSync(join(raiz, p), "utf8");
const sinComentarios = (t) => t
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, (m, p1) => p1);

const cargar = async (rel, opciones = {}) => {
  const r = await build({
    entryPoints: [join(raiz, rel)],
    bundle: true, write: false, format: "esm", platform: "neutral", logLevel: "silent", ...opciones,
  });
  return import("data:text/javascript;base64," + Buffer.from(r.outputFiles[0].text).toString("base64"));
};

const G = await cargar("src/utils/geometriaDelMueble.ts");
const M = await cargar("src/components/StoreEditor3D/muebles/medidas.ts");
const V = await cargar("src/components/StoreEditor3D/muebles/venta.ts", { platform: "node", jsx: "automatic" });
const C = await cargar("src/catalogo/catalogo.ts");

let hechas = 0;
const prueba = (n, fn) => {
  try { fn(); hechas++; console.log("  ok   " + n); }
  catch (e) { console.error("  FALLA " + n + "\n         " + e.message); process.exitCode = 1; }
};

// ─── Los muebles de prueba ────────────────────────────────────────────────────

const LIBRE = { status: "free", supplierName: "", brandCategory: "", negotiatedValue: 0, startDate: "", endDate: "", observation: "" };
const gondola = (extra = {}) => ({
  id: "g1", code: "GON-03", sede: "NAVE", type: "gondola", gondolaType: "double",
  w: 3.0, d: 0.9, h: 1.8, ...LIBRE, ...extra,
});
const punta = (extra = {}) => ({
  id: "p1", code: "PUN-02", sede: "NAVE", type: "punta", w: 0.9, d: 0.4, h: 1.8, ...LIBRE, ...extra,
});
const CONTRATO = {
  status: "occupied", supplierName: "ALPINA", brandCategory: "Lácteos",
  negotiatedValue: 2_500_000, startDate: "2026-10-01", endDate: "2027-03-31", observation: "descuento del 25%",
};
const slots = (...estados) => estados.map((status, i) => ({ id: `s${i}`, x: i / estados.length, y: 0, w: 1 / estados.length, h: 1, status }));
const NADA = new Set();
const revisar = (f, cambio, conArte = NADA) => G.revisarCambioDeGeometria(f, cambio, G.loVendidoDe(f, "NAVE", conArte));
const texto = (r) => (r.aviso ? G.textoDelAviso(r.aviso) : "");

// ═════════════════════════════════════════════════════════════════════════════
// 1 · LO VENDIDO NO SE MUEVE SIN AVISO
// ═════════════════════════════════════════════════════════════════════════════

prueba("sin nada vendido se escribe sin preguntar", () => {
  for (const cambio of [{ h: 2.0 }, { entrepanos: 4 }, { modulo: 1.0 }, { entrepanos: 4, modulo: 1.0 }]) {
    const r = revisar(gondola(), cambio);
    assert.ok(r.cambios.length > 0, `${JSON.stringify(cambio)} no se reconoció como cambio`);
    assert.equal(r.bloqueo, null);
    assert.equal(r.aviso, null, `${JSON.stringify(cambio)} pidió confirmación en un mueble libre`);
  }
});

prueba("lo mismo que había no es un cambio, y no pregunta nada", () => {
  const f = gondola({ ...CONTRATO, entrepanos: 4, modulo: 1.0 });
  for (const cambio of [{ h: 1.8 }, { entrepanos: 4 }, { modulo: 1.0 }, {}]) {
    const r = revisar(f, cambio);
    assert.deepEqual([r.cambios.length, r.bloqueo, r.aviso], [0, null, null], JSON.stringify(cambio));
  }
  // Vaciar lo que ya estaba vacío, tampoco.
  assert.equal(revisar(gondola(CONTRATO), { entrepanos: null }).cambios.length, 0);
});

prueba("UNA CARA CON CONTRATO VIVO O FIRMADO pide confirmar y dice qué cambia", () => {
  // La fusión pinta «occupied» la cara con el contrato que corre o, si no
  // hay, con el próximo: los dos cuentan.
  const f = gondola({ ...CONTRATO, entrepanos: 4 });
  const r = revisar(f, { entrepanos: 5 });
  assert.equal(r.bloqueo, null);
  assert.ok(r.aviso, "cambiar los entrepaños de una cara vendida no pidió confirmación");
  const t = texto(r);
  assert.match(t, /cambian las filas del arte de esta cara/, "el aviso no dice qué le pasa al arte");
  assert.match(t, /Cara A \(contrato vivo o firmado\)/);
  assert.match(t, /los entrepaños, de 4 a 5/, "el aviso no dice qué se cambia");
  // El alto, también.
  assert.match(texto(revisar(gondola(CONTRATO), { h: 2.0 })), /cambian las filas del arte de esta cara/);
  // El módulo: el producto y los habladores se reparten en otros módulos.
  const m = texto(revisar(gondola(CONTRATO), { modulo: 1.0 }));
  assert.match(m, /otros módulos/);
  assert.match(m, /los módulos, de 2 de 1,50 m a 3 de 1,00 m/);
});

prueba("la cara B cuenta en la góndola doble, y no en la mural", () => {
  const doble = gondola({ faceB: { ...CONTRATO } });
  const r = revisar(doble, { h: 2.0 });
  assert.ok(r.aviso, "una góndola con la cara B vendida cambió el alto sin preguntar");
  assert.match(texto(r), /Cara B \(contrato vivo o firmado\)/);
  assert.ok(!/Cara A/.test(texto(r)), "la cara A libre aparece como vendida");
  // Una mural tiene una cara: un `faceB` viejo colgado no es una cara vendida.
  const mural = gondola({ gondolaType: "wall", faceB: { ...CONTRATO } });
  assert.equal(revisar(mural, { h: 2.0 }).aviso, null);
});

prueba("el ARTE PINTADO en la cara pide confirmar, aunque no haya contrato", () => {
  const conArte = new Set(["NAVE-GON-03-B"]);
  const r = revisar(gondola(), { entrepanos: 4 }, conArte);
  assert.ok(r.aviso, "una cara con arte pintado cambió de filas sin preguntar");
  assert.match(texto(r), /Cara B \(arte pintado\): cambian las filas del arte de esta cara/);
  // El código lleva la sede, como lo guarda la base; el del mueble, si ya la
  // trae, no se duplica.
  assert.ok(revisar(gondola({ code: "NAVE-GON-03" }), { h: 2.0 }, new Set(["NAVE-GON-03"])).aviso);
  // Contrato y arte, en la misma cara: se dicen los dos.
  assert.match(texto(revisar(gondola(CONTRATO), { h: 2.0 }, new Set(["NAVE-GON-03"]))), /contrato vivo o firmado y arte pintado/);
});

prueba("si no se pudo revisar el arte, se pregunta igual (ante la duda, se pregunta)", () => {
  const r = revisar(gondola(), { h: 2.0 }, null);
  assert.ok(r.aviso, "sin saber si hay arte pintado, se escribió sin preguntar");
  assert.match(texto(r), /No se pudo revisar si alguna cara tiene arte pintado/);
});

prueba("CON ESPACIOS INTERNOS VENDIDOS no se cambia la cantidad de entrepaños", () => {
  for (const estado of ["occupied", "reserved"]) {
    const f = gondola({ slots: slots(estado, "free"), entrepanos: 4 });
    const r = revisar(f, { entrepanos: 5 });
    assert.ok(r.bloqueo, `con un interno «${estado}» se cambiaron los entrepaños`);
    assert.match(r.bloqueo, /no se puede cambiar la cantidad de entrepaños hasta liberarlos/);
    assert.equal(r.aviso, null);
    // Vaciarlo (volver a la cuenta de siempre) también es cambiarla.
    assert.ok(revisar(f, { entrepanos: null }).bloqueo, "vaciar los entrepaños pasó con internos vendidos");
  }
  // Sin entrepaños guardados, el alto decide cuántos entran: un alto que suma
  // uno es cambiar la cantidad.
  const auto = gondola({ slots: slots("occupied") });
  assert.equal(G.geometriaALaVista(auto).entrepanos, 5);
  const r = revisar(auto, { h: 2.2 });
  assert.ok(r.bloqueo, "un alto que suma un entrepaño pasó con internos vendidos");
  assert.match(r.bloqueo, /pasaría de 5 a 6 entrepaños/);
  // Un alto que no cambia la cantidad, o el módulo: con aviso, no bloqueo.
  const alto = revisar(auto, { h: 2.0 });
  assert.equal(alto.bloqueo, null);
  assert.ok(alto.aviso, "con internos vendidos se cambió el alto sin preguntar");
  assert.match(texto(alto), /con otro alto quedan en otro lugar del mueble/);
  const modulo = revisar(auto, { modulo: 1.0 });
  assert.equal(modulo.bloqueo, null);
  assert.ok(modulo.aviso, "con internos vendidos se cambió el módulo sin preguntar");
  // Los libres no cuentan.
  assert.equal(revisar(gondola({ slots: slots("free", "free") }), { entrepanos: 4 }).aviso, null);
});

prueba("el aviso no nombra a nadie: ni proveedor, ni marca, ni fechas, ni plata", () => {
  // Se lee con la pantalla compartida: en reunión el panel del 3D calla los
  // contratos, y esto no puede decir lo que el panel calla.
  const f = gondola({ ...CONTRATO, faceB: { ...CONTRATO, supplierName: "NUTRESA" } });
  const t = texto(revisar(f, { h: 2.0 }, new Set(["NAVE-GON-03"])));
  for (const fuga of ["ALPINA", "Alpina", "NUTRESA", "Lácteos", "2026", "2027", "2500000", "2.500.000", "25%"]) {
    assert.ok(!t.includes(fuga), `el aviso dice «${fuga}»: ${t}`);
  }
});

prueba("la punta: una cara, y lo vendido pregunta igual", () => {
  const r = revisar(punta(CONTRATO), { entrepanos: 3 });
  assert.ok(r.aviso);
  assert.match(texto(r), /Cara A \(contrato vivo o firmado\): cambian las filas del arte de esta cara/);
  assert.ok(!/Cara B/.test(texto(r)));
  assert.ok(revisar(punta({ slots: slots("occupied") }), { entrepanos: 3 }).bloqueo);
});

// ═════════════════════════════════════════════════════════════════════════════
// 2 · VALIDAR
// ═════════════════════════════════════════════════════════════════════════════

prueba("el alto, los entrepaños y el módulo, dentro de lo que dice el catálogo", () => {
  const f = gondola();
  assert.match(G.problemaDelCambio(f, { h: 3.5 }), /El alto va de 1,20 a 2,60 m/);
  assert.match(G.problemaDelCambio(f, { entrepanos: 7 }), /Los entrepaños van de 2 a 6/);
  assert.match(G.problemaDelCambio(f, { entrepanos: 3.5 }), /Los entrepaños van/);
  assert.match(G.problemaDelCambio(f, { modulo: 2.0 }), /El módulo va de 0,60 a 1,50 m/);
  assert.equal(G.problemaDelCambio(f, { h: 2.0, entrepanos: 4, modulo: 1.0 }), null);
  assert.equal(G.problemaDelCambio(f, { entrepanos: null, modulo: null }), null, "vaciar un campo no es un problema");
  // La punta tiene sus propios límites (los de `geometria` en el catálogo).
  assert.equal(G.problemaDelCambio(punta(), { entrepanos: 1, modulo: 0.45 }), null);
  assert.match(G.problemaDelCambio(punta(), { modulo: 0.3 }), /El módulo va de 0,40 a 1,40 m/,
    "la punta no tiene sus límites del catálogo");
  assert.match(G.problemaDelCambio(punta(), { entrepanos: 7 }), /Los entrepaños van de 1 a 6/);
});

prueba("no entran más entrepaños que los que caben a 25 cm (ni bajando el alto)", () => {
  assert.equal(G.entrepanosQueEntran("gondola", 1.8), 5);
  assert.match(G.problemaDelCambio(gondola(), { entrepanos: 6 }), /Con 1,80 m de alto entran hasta 5 entrepaños/);
  // Bajar el alto de una que tiene 5 guardados.
  const cinco = gondola({ h: 2.0, entrepanos: 5 });
  assert.match(G.problemaDelCambio(cinco, { h: 1.5 }), /no entran los 5 entrepaños que tiene/);
  assert.equal(G.problemaDelCambio(cinco, { h: 1.5, entrepanos: 4 }), null, "bajando los dos juntos no se pudo");
});

prueba("toda ficha del catálogo pasa la validación del panel (son los mismos límites)", () => {
  const modelos = C.CATALOGO_DE_MUEBLES.modelos.filter((m) => G.TIPOS_CON_GEOMETRIA.has(m.tipo));
  assert.ok(modelos.length > 20, "no se encontraron los modelos de góndola y punta");
  for (const m of modelos) {
    const f = m.tipo === "punta" ? punta({ w: m.w, h: 1.8 }) : gondola({ w: m.w, h: 1.8, gondolaType: m.variante });
    const cambio = { h: m.h };
    if (m.entrepanos !== undefined) cambio.entrepanos = m.entrepanos;
    if (m.modulo !== undefined) cambio.modulo = m.modulo;
    assert.equal(G.problemaDelCambio(f, cambio), null, `${m.id}: el panel no deja escribir lo que dice su ficha`);
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// 3 · ESCRIBIR
// ═════════════════════════════════════════════════════════════════════════════

prueba("VACIAR ES null: borrado a propósito, no una clave borrada", () => {
  const otra = gondola({ id: "g2" });
  const plano = [gondola({ entrepanos: 4, modulo: 1.0, modelo: "base:gondola-central-200-m100" }), otra];
  const nuevo = G.conGeometria(plano, "g1", { entrepanos: null });
  assert.ok("entrepanos" in nuevo[0] && nuevo[0].entrepanos === null,
    "vaciar borró la clave: ausente, el servidor la rellena con la guardada y el cambio no se guarda nunca");
  assert.equal(nuevo[0].modulo, 1.0, "vaciar los entrepaños tocó el módulo");
  assert.equal(nuevo[0].modelo, "base:gondola-central-200-m100", "vaciar los entrepaños tocó el modelo");
  assert.equal(nuevo[1], otra, "otro mueble cambió de identidad (los espejos de los editores comparan por identidad)");
  assert.equal(plano[0].entrepanos, 4, "conGeometria mutó el plano");
  // JSON.stringify lo manda como null.
  assert.match(JSON.stringify(nuevo[0]), /"entrepanos":null/);
});

prueba("escribir toca sólo los tres campos de ese mueble", () => {
  const plano = [gondola(CONTRATO)];
  const [g] = G.conGeometria(plano, "g1", { h: 2.0, entrepanos: 4, modulo: 1.0 });
  assert.deepEqual([g.h, g.entrepanos, g.modulo], [2.0, 4, 1.0]);
  for (const k of Object.keys(plano[0])) if (!["h"].includes(k)) assert.deepEqual(g[k], plano[0][k], `cambió \`${k}\``);
  // Un `undefined` no toca nada.
  const [mismo] = G.conGeometria([gondola({ entrepanos: 4 })], "g1", { h: 2.0 });
  assert.equal(mismo.entrepanos, 4);
  // Un id que no está: el mismo plano.
  assert.equal(G.conGeometria(plano, "nadie", { h: 2.0 }), plano);
});

prueba("lo que se dibuja hoy: lo guardado, o la cuenta de siempre (y null es la cuenta de siempre)", () => {
  assert.deepEqual(
    [G.geometriaALaVista(gondola()).entrepanos, G.geometriaALaVista(gondola()).entrepanosGuardados],
    [M.nivelesDeEntrepano(1.8).length - 1, false]);
  assert.equal(G.geometriaALaVista(gondola({ entrepanos: null })).entrepanos, M.nivelesDeEntrepano(1.8).length - 1);
  assert.deepEqual([G.geometriaALaVista(gondola({ entrepanos: 3 })).entrepanos, G.geometriaALaVista(gondola({ entrepanos: 3 })).entrepanosGuardados], [3, true]);
  const v = G.geometriaALaVista(gondola({ modulo: 1.0 }));
  assert.deepEqual([v.modulos, v.anchoDeModulo], [3, 1.0]);
  assert.equal(G.geometriaALaVista(punta()).entrepanos, M.nivelesDePunta(M.techoDeCara(1.8)).length - 1);
  // La sugerencia es la ficha del modelo.
  assert.deepEqual(G.fichaSugerida(gondola({ modelo: "base:gondola-central-200-m100" })),
    { h: 2.0, entrepanos: 4, modulo: 1.0 });
  assert.deepEqual(G.fichaSugerida(gondola()), {});
});

// ═════════════════════════════════════════════════════════════════════════════
// 4 · LO QUE SE ESCRIBE SE DIBUJA (la punta, como la góndola)
// ═════════════════════════════════════════════════════════════════════════════

prueba("la punta vende con sus entrepaños y su módulo, y sin ellos como siempre (ejecutado)", () => {
  const [w, d, h] = [0.9, 0.4, 1.8];
  const techo = M.techoDeCara(h);
  // Sin geometría: la cuenta de siempre, idéntica.
  const siempre = V.ventaDeTipo("punta", w, d, h);
  assert.deepEqual(siempre.filas, M.filasDePunta(techo, Math.max(0.12, d - M.PANEL_FONDO.espesor)));
  assert.deepEqual(siempre.vanos, M.vanosDeCorrido(w));
  assert.deepEqual(V.ventaDeTipo("punta", w, d, h, undefined, {}), siempre, "una geometría vacía cambió la punta");
  // Con 3 entrepaños y la base: 4 filas, todas con producto, la última hasta el copete.
  const ficha = V.ventaDeTipo("punta", w, d, h, undefined, { entrepanos: 3, modulo: 0.45 });
  assert.equal(ficha.filas.rows, 4, "la punta no vende sobre sus 3 entrepaños y la base");
  assert.deepEqual(ficha.filas.alturas, [...M.nivelesDePunta(techo, 3), techo], "las filas no son los entrepaños que se dibujan");
  assert.deepEqual(ficha.vanos, M.vanosDeCorrido(w, 0.45));
  assert.equal(ficha.vanos.length, 2, "el módulo de 0,45 no partió la punta de 0,90 en dos");
  // La cámara de venta no corta el cartel donde no está.
  assert.ok(M.pisoDelCartelDePunta(h, 3) <= techo);
  assert.notDeepEqual(M.nivelesDePunta(techo, 2), M.nivelesDePunta(techo), "con 2 la punta sigue con la cuenta de siempre");
});

prueba("la góndola, igual: las filas son los entrepaños que dibuja y los vanos sus módulos (ejecutado)", () => {
  const venta = V.ventaDeTipo("gondola", 3.0, 0.9, 2.0, "double", { entrepanos: 4, modulo: 1.0 });
  assert.deepEqual(venta.filas.alturas, [...M.nivelesDeEntrepano(2.0, 4), 2.0 - 0.1]);
  assert.deepEqual(venta.vanos, M.vanosDeCorrido(3.0, 1.0));
  assert.equal(venta.vanos.length, 3);
});

const editor = sinComentarios(leer("src/components/StoreEditor3D/StoreEditor3D.tsx"));
const puntaReal = sinComentarios(leer("src/components/StoreEditor3D/muebles/PuntaReal.tsx"));
const enPunta = sinComentarios(leer("src/components/StoreEditor3D/muebles/ProductoEnPunta.tsx"));
const recorte = (texto, desde, hasta) => {
  const i = texto.indexOf(desde);
  assert.ok(i >= 0, `no se encontró \`${desde}\``);
  const j = hasta ? texto.indexOf(hasta, i + desde.length) : -1;
  return texto.slice(i, j > i ? j : undefined);
};

prueba("la punta se DIBUJA con lo que guardó: estructura, producto, relleno, habladores, lámina y cámara", () => {
  assert.match(puntaReal, /vanosDeCorrido\(w, modulo\)/, "`PuntaReal` parte el frente sin el módulo guardado");
  assert.match(puntaReal, /nivelesDePunta\(altoDeCuerpo, entrepanos\)/, "`PuntaReal` dibuja los entrepaños de siempre");
  assert.match(enPunta, /filasDePunta\(altoDeCuerpo, fondoDeCara, geometria\?\.entrepanos\)/, "`ventaDePunta` vende en otros entrepaños");
  assert.match(enPunta, /vanosDeCorrido\(w, geometria\?\.modulo\)/, "`ventaDePunta` vende en otros módulos");
  assert.match(enPunta, /ventaDePunta\(w, d, h, \{ entrepanos, modulo \}\)/, "el relleno de la punta no usa lo que guardó");
  const mesh = recorte(editor, "function PuntaMesh(", "function ChapaDeRobatope");
  assert.match(mesh, /filasDePunta\(altoDeCuerpo, fondoDeCara, entrepanos\)/, "la lámina de la punta (filas) no usa sus entrepaños");
  assert.match(mesh, /ventaDePunta\(w, d, h, \{ entrepanos, modulo \}\)/, "el producto en prueba y los habladores no usan lo que guardó");
  assert.match(mesh, /useHabladoresDeRelleno\(\s*!pinta && !ghost, ventaPunta,/, "los habladores no salen de la misma venta");
  assert.match(mesh, /<PuntaReal [^>]*entrepanos=\{entrepanos\} modulo=\{modulo\}/, "`PuntaMesh` no le pasa la geometría al dibujo");
  assert.match(mesh, /<ProductoEnPunta [^>]*entrepanos=\{entrepanos\} modulo=\{modulo\}/, "`PuntaMesh` no le pasa la geometría al relleno");
  const despacho = recorte(editor, "export function FixtureMesh(", "// ─── Store room");
  assert.match(despacho, /const geometria = geometriaDe\(fixture\);/, "`FixtureMesh` no lee la geometría por `geometriaDe`");
  assert.match(recorte(despacho, 'case "punta"', 'case "robatope"'), /entrepanos=\{geometria\.entrepanos\}\s*modulo=\{geometria\.modulo\}/,
    "`FixtureMesh` no le pasa a la punta lo que guardó");
  assert.match(recorte(despacho, 'case "gondola"', 'case "punta"'), /entrepanos=\{geometria\.entrepanos\}\s*modulo=\{geometria\.modulo\}/,
    "`FixtureMesh` le pasa a la góndola la ficha cruda (un null se dibujaría con un solo entrepaño)");
  const span = recorte(editor, "function getPanelShelfSpan(", 'case "robatope"');
  assert.match(recorte(span, 'case "punta"'), /filasDePunta\(\s*altoDeCuerpo, Math\.max\(0\.12, d - PANEL_FONDO\.espesor\), geometria\?\.entrepanos,?\s*\)/,
    "la lámina de la punta (`getPanelShelfSpan`) no usa sus entrepaños");
  assert.match(editor, /pisoDelCartelDePunta\(fix\.h, geometriaDe\(fix\)\.entrepanos\)/, "«De cerca» de la punta mira otros entrepaños");
});

// ═════════════════════════════════════════════════════════════════════════════
// 5 · LOS DOS PANELES, EL MISMO COMPONENTE, Y NO ESCRIBE SIN REVISAR
// ═════════════════════════════════════════════════════════════════════════════

const componente = sinComentarios(leer("src/components/GeometriaDelMueble.tsx"));
const plano2D = sinComentarios(leer("src/components/FloorPlan2D/FloorPlan2D.tsx"));

prueba("el plano 2D y el Editor 3D muestran «Alto», «Entrepaños» y «Módulo» con el mismo componente", () => {
  assert.match(plano2D, /<GeometriaDelMueble id=\{item\.id\} puedeEditar=\{editMode && isAdmin\} \/>/,
    "el panel del plano 2D no tiene los campos (o los deja editar sin modo edición)");
  assert.match(recorte(plano2D, "function AssignmentPanel(", "// ─── Toolbar Button"),
    /item\.type === "gondola_doble" \|\| item\.type === "gondola_mural" \|\| item\.type === "punta"/,
    "el panel del 2D no los muestra para la góndola y la punta");
  const panel3D = recorte(editor, "const modeloDelMueble = modeloPorId(fix.modelo);", "// ─── Canvas error boundary");
  assert.match(panel3D, /<GeometriaDelMueble id=\{fix\.id\} puedeEditar=\{isAdmin\} \/>/, "el panel del Editor 3D no tiene los campos");
  for (const etiqueta of ["Alto (m)", "Entrepaños", "Módulo (m)"]) {
    assert.ok(componente.includes(`>${etiqueta}<`), `falta el campo «${etiqueta}»`);
  }
  // La ficha del modelo es la sugerencia.
  assert.match(componente, /placeholder=\{ficha\.entrepanos !== undefined \? String\(ficha\.entrepanos\)/);
  assert.match(componente, /placeholder=\{ficha\.modulo !== undefined \? String\(ficha\.modulo\)/);
  assert.match(componente, /const ficha = useMemo\(\(\) => \(f \? fichaSugerida\(f\) : \{\}\), \[f\]\);/);
});

prueba("el componente NO escribe sin revisar: bloqueo no escribe, aviso espera «Cambiar igual»", () => {
  // Una sola manera de escribir, y es `conGeometria` sobre el store de ahora.
  assert.match(componente, /function escribir\(cambio: CambioDeGeometria\) \{\s*const st = useFixtureStore\.getState\(\);\s*st\.commit\(conGeometria\(selectFixtures\(st\), id, cambio\)\);\s*\}/);
  assert.equal((componente.match(/\.commit\(/g) || []).length, 1, "el componente escribe en el store por otro lado");
  const llamadas = [...componente.matchAll(/escribir\(([^)]*)\)/g)].map((m) => m[0]);
  assert.deepEqual(llamadas.filter((l) => l !== "escribir(cambio: CambioDeGeometria)"), ["escribir(cambio)", "escribir(c)"],
    "el componente escribe en un lugar más que tras la revisión y tras «Cambiar igual»");
  const proponer = recorte(componente, "async function proponer(", "const alSalir");
  const orden = ["problemaDelCambio(f, cambio)", "getFaceImages()", "revisarCambioDeGeometria(f, cambio, loVendidoDe(f, sede, conArte))",
    "if (r.bloqueo) { setProblema(r.bloqueo); volver(); return; }",
    "if (r.aviso) { setPendiente({ cambio, aviso: r.aviso }); return; }", "escribir(cambio);"];
  let desde = 0;
  for (const paso of orden) {
    const i = proponer.indexOf(paso, desde);
    assert.ok(i >= 0, `\`proponer\` no hace «${paso}» (o no en ese orden)`);
    desde = i + paso.length;
  }
  // Si no se pudo preguntar por el arte: null, que avisa.
  assert.match(proponer, /catch \{\s*conArte = null;/, "si falla la consulta del arte se sigue como si no hubiera");
  // «Cambiar igual» escribe el cambio que se revisó.
  assert.match(componente, /onClick=\{\(\) => \{ const c = pendiente\.cambio; setPendiente\(null\); escribir\(c\); \}\}[^]*?Cambiar igual/);
  assert.match(componente, /Dejarlo como estaba/);
  // Vaciar un campo es null.
  assert.match(componente, /if \(crudo === ""\) return \{ \[campo\]: null \};/, "vaciar un campo no lo pide como null");
});

console.log(`\n${hechas} pruebas de geometría del mueble`);
