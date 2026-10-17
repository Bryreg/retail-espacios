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
const componente = sinComentarios(leer("src/components/GeometriaDelMueble.tsx"));

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
    // Vaciarlo (volver a la cuenta de siempre) también es cambiarla, si la
    // cuenta de siempre da otra cantidad (con 1,80 da 4).
    const tres = gondola({ slots: slots(estado, "free"), entrepanos: 3 });
    assert.ok(revisar(tres, { entrepanos: null }).bloqueo, "vaciar los entrepaños pasó con internos vendidos");
  }
  // Sin entrepaños guardados, el alto decide cuántos entran: un alto que suma
  // uno es cambiar la cantidad.
  const auto = gondola({ slots: slots("occupied") });
  assert.equal(G.geometriaALaVista(auto).entrepanos, 4);
  const r = revisar(auto, { h: 2.2 });
  assert.ok(r.bloqueo, "un alto que suma un entrepaño pasó con internos vendidos");
  assert.match(r.bloqueo, /pasaría de 4 a 5 entrepaños/);
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

prueba("LA MISMA UNIDAD: el número que el panel sugiere da las mismas filas de producto (ejecutado)", () => {
  // El panel dice «auto (N)»; escribir esa N no puede cambiar las filas del
  // arte. Antes la góndola contaba el techo: decía 5 y el 5 tecleado daba 6.
  for (const [tipo, h, d] of [["gondola", 1.5, 0.9], ["gondola", 1.8, 0.9], ["gondola", 2.0, 0.9], ["gondola", 2.4, 0.9], ["punta", 1.6, 0.4], ["punta", 2.0, 0.4]]) {
    const f = tipo === "punta" ? punta({ h, d }) : gondola({ h, d });
    const n = G.geometriaALaVista(f).entrepanos;
    const filas = (e) => V.ventaDeTipo(tipo, f.w, d, h, tipo === "gondola" ? "double" : undefined, e === undefined ? {} : { entrepanos: e }).filas.rows;
    assert.equal(filas(n), filas(undefined), `${tipo} de ${h}: el panel sugiere ${n} y tecleándolo cambian las filas de producto`);
    // Con la cara vendida, el aviso no dice «de 4 a 4» como si nada cambiara:
    // dice que se reparten parejo, y no bloquea por cantidad con internos vendidos.
    const r = revisar({ ...f, ...CONTRATO }, { entrepanos: n });
    assert.ok(r.aviso, `${tipo} de ${h}: repartir los entrepaños de una cara vendida no avisó`);
    assert.match(texto(r), new RegExp(`los mismos ${n}, repartidos parejo`));
    assert.ok(!new RegExp(`de ${n} a ${n}\\b`).test(texto(r)), `el aviso dice «de ${n} a ${n}»`);
    assert.equal(revisar({ ...f, slots: slots("occupied") }, { entrepanos: n }).bloqueo, null,
      `${tipo} de ${h}: la misma cantidad se bloqueó como si cambiara`);
  }
  // Un número distinto sí cambia la cantidad, y lo dice desde la cuenta de siempre.
  const t = texto(revisar(gondola(CONTRATO), { entrepanos: 5 }));
  assert.match(t, /los entrepaños, de 4 \(la cuenta de siempre\) a 5/);
  assert.ok(revisar(gondola({ slots: slots("occupied") }), { entrepanos: 5 }).bloqueo);
  // Los campos del panel dicen el techo, para que nadie lo cuente.
  assert.match(componente, /vista\.techo \? ", más uno de techo sin producto" : ""/);
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
  // Sin guardar, la góndola dibuja la base, los que llevan producto y uno de
  // techo arriba: el techo no se cuenta (ver «la misma unidad», abajo).
  assert.deepEqual(
    [G.geometriaALaVista(gondola()).entrepanos, G.geometriaALaVista(gondola()).entrepanosGuardados, G.geometriaALaVista(gondola()).techo],
    [M.nivelesDeEntrepano(1.8).length - 2, false, true]);
  assert.equal(G.geometriaALaVista(gondola({ entrepanos: null })).entrepanos, M.nivelesDeEntrepano(1.8).length - 2);
  assert.equal(G.geometriaALaVista(gondola({ entrepanos: 3 })).techo, false);
  assert.deepEqual([G.geometriaALaVista(gondola({ entrepanos: 3 })).entrepanos, G.geometriaALaVista(gondola({ entrepanos: 3 })).entrepanosGuardados], [3, true]);
  const v = G.geometriaALaVista(gondola({ modulo: 1.0 }));
  assert.deepEqual([v.modulos, v.anchoDeModulo], [3, 1.0]);
  assert.equal(G.geometriaALaVista(punta()).entrepanos, M.nivelesDePunta(M.techoDeCara(1.8)).length - 1);
  assert.equal(G.geometriaALaVista(punta()).techo, false, "la punta no tiene techo: el de su última fila es el copete");
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
  // `loVendidoDe` va como PREFIJO (§12 del diseño de participaciones): ganó
  // un quinto parámetro, `participaciones`, que se fija aparte, abajo.
  const orden = ["problemaDelCambio(f, cambio)", "getFaceImages()", "revisarCambioDeGeometria(f, cambio, loVendidoDe(f, sede, conArte, estado",
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
  // El quinto parámetro: lo que se sabe de las participaciones de la sede, leído
  // DESPUÉS del arte y ANTES de revisar, sólo si el mueble se vende así.
  assert.ok(proponer.includes("revisarCambioDeGeometria(f, cambio, loVendidoDe(f, sede, conArte, estado, participaciones));"),
    "`loVendidoDe` no recibe lo que se sabe de las participaciones (paso 5): una cara por participación dice «No se pudo revisar»");
  const leeParticipaciones = proponer.indexOf("participaciones = await datosDeParticipacionDeLaSede(sede);");
  assert.ok(leeParticipaciones > proponer.indexOf("getFaceImages()")
    && leeParticipaciones < proponer.indexOf("revisarCambioDeGeometria("), "las participaciones no se leen antes de revisar");
  assert.match(proponer, /if \(porParticipacion\(f\)\) \{\s*setRevisando\(true\);/, "se leen las participaciones de un mueble que no se vende así");
  assert.match(componente, /async function datosDeParticipacionDeLaSede\(sede: string\): Promise<DatosDeParticipacion> \{[\s\S]*?st\.cargarOcupacion\(sede\)\.catch\(\(\) => null\),\s*st\.cargarResumen\(\{ sede \}\)\.catch\(\(\) => null\),[\s\S]*?return \{ ocupacion: o\?\.caras \?\? null, confirmadas: confirmadasDelResumen\(r\) \};/,
    "las participaciones no salen del store de lectura (ocupación y resumen), o una falla no queda como «no se sabe»");
  // «Cambiar igual» escribe el cambio que se revisó.
  assert.match(componente, /onClick=\{\(\) => \{ const c = pendiente\.cambio; setPendiente\(null\); escribir\(c\); \}\}[^]*?Cambiar igual/);
  assert.match(componente, /Dejarlo como estaba/);
  // Vaciar un campo es null.
  assert.match(componente, /if \(crudo === ""\) return \{ \[campo\]: null \};/, "vaciar un campo no lo pide como null");
});

// ═════════════════════════════════════════════════════════════════════════════
// 6 · LO QUE SE DESHACE SE GUARDA (el store de verdad, con la red de mentira)
// ═════════════════════════════════════════════════════════════════════════════
//
// `PUT /layout` rellena la ficha que llega AUSENTE con la guardada y la borra
// sólo con un `null`. Deshacer un «Entrepaños» escrito sobre una góndola que no
// tenía la clave reponía el arreglo de antes, con la clave ausente: el editor
// dibujaba la cuenta de siempre y la base se quedaba con lo deshecho. Esto
// corre el store de verdad (`commit`, `undo`, `redo`, `pushSede`) con la red
// cambiada por una que anota el cuerpo de cada `PUT`.

const GP = await cargar("src/utils/guardadoDelPlano.ts");
// El `persist` del store guarda en `window.localStorage`: uno de mentira.
globalThis.window ??= globalThis;
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const cuerpos = [];
globalThis.__cuerposDelPut = cuerpos;
const redDeMentira = {
  name: "red-de-mentira",
  setup(b) {
    b.onResolve({ filter: /(\/api\/layout|\/api\/spaces|\/authStore)$/ }, (a) => ({ path: a.path, namespace: "mentira" }));
    b.onLoad({ filter: /.*/, namespace: "mentira" }, (a) => {
      if (a.path.endsWith("authStore")) {
        return { loader: "js", contents: "export const useAuthStore = { getState: () => ({ token: 't', role: 'admin' }) };" };
      }
      if (a.path.endsWith("spaces")) return { loader: "js", contents: "export const fetchEstadoComercial = async () => ({});" };
      return {
        loader: "js",
        contents: `
          const nada = async () => ({});
          export const deleteLayout = nada, fetchAllLayouts = async () => [], fetchLayoutSettings = nada,
            fetchReferenceRates = nada, fetchRevisions = async () => [], fetchSeasonWindows = nada,
            saveLayoutSettings = nada, saveReferenceRates = nada, saveSeasonWindows = nada;
          export async function saveLayout(sede, fixtures, base) {
            globalThis.__cuerposDelPut.push(JSON.stringify({ sede, fixtures, base_updated_at: base }));
            return { sede, fixtures, updated_at: "rev-" + globalThis.__cuerposDelPut.length };
          }`,
      };
    });
  },
};
const S = await cargar("src/store/fixtureStore.ts", { platform: "node", plugins: [redDeMentira] });

{
  const st = S.useFixtureStore;
  /** Lo que sale en el próximo `PUT` de NAVE: el mueble `id`, como JSON. */
  const guardar = async (id) => {
    const antes = cuerpos.length;
    await st.getState().pushSede("NAVE");
    assert.equal(cuerpos.length, antes + 1, "el store no mandó el plano");
    const cuerpo = JSON.parse(cuerpos[cuerpos.length - 1]);
    return { crudo: JSON.stringify(cuerpo.fixtures.find((f) => f.id === id)), mueble: cuerpo.fixtures.find((f) => f.id === id) };
  };
  const arrancar = (plano) => st.setState({
    sede: "NAVE", sedes: ["NAVE"], fixturesBySede: { NAVE: plano }, serverRev: { NAVE: "rev-0" },
    conflicts: {}, dirty: {}, rechazos: {}, past: [], future: [],
  });
  const escribir = (id, cambio) => st.getState().commit(G.conGeometria(S.selectFixtures(st.getState()), id, cambio));
  const asincronas = [
    ["DESHACER «Entrepaños» y «Módulo» en un mueble que no los tenía manda null, no la clave ausente", async () => {
      const vieja = gondola({ id: "g-vieja", ...CONTRATO });
      const otra = gondola({ id: "g-otra", code: "GON-04" });
      arrancar([vieja, otra]);
      escribir("g-vieja", { entrepanos: 4, modulo: 1.0 });
      const tras = await guardar("g-vieja");
      assert.deepEqual([tras.mueble.entrepanos, tras.mueble.modulo], [4, 1.0], "el panel no se guardó");
      assert.ok(!("status" in tras.mueble) && !("supplierName" in tras.mueble), "lo comercial viajó en el PUT");
      st.getState().undo();
      const deshecho = await guardar("g-vieja");
      assert.match(deshecho.crudo, /"entrepanos":null/,
        "el deshacer mandó los entrepaños ausentes: el servidor rellena lo guardado y la base se queda con lo deshecho");
      assert.match(deshecho.crudo, /"modulo":null/, "el deshacer mandó el módulo ausente");
      assert.ok(!/"modelo"|"partes"/.test(deshecho.crudo), "el deshacer inventó claves que el mueble nunca tuvo");
      const enElStore = S.selectFixtures(st.getState());
      assert.equal(G.geometriaALaVista(enElStore[0]).entrepanosGuardados, false, "tras deshacer no volvió la cuenta de siempre");
      assert.equal(enElStore[1], otra, "el deshacer le cambió la identidad a un mueble que no tenía nada que decir");
      // Rehacer vuelve a escribir lo deshecho.
      st.getState().redo();
      assert.deepEqual([(await guardar("g-vieja")).mueble.entrepanos, (await guardar("g-vieja")).mueble.modulo], [4, 1.0], "rehacer no se guardó");
    }],
    ["deshacer un VACIADO vuelve a mandar el valor, y vaciar viaja null hasta el servidor", async () => {
      arrancar([gondola({ id: "g-ficha", entrepanos: 4, modulo: 1.0, modelo: "base:gondola-central-200-m100" })]);
      escribir("g-ficha", { entrepanos: null });
      const vaciado = await guardar("g-ficha");
      assert.match(vaciado.crudo, /"entrepanos":null/, "el guardado sacó el null: el servidor rellena y vaciar no se guarda nunca");
      assert.equal(vaciado.mueble.modelo, "base:gondola-central-200-m100");
      st.getState().undo();
      assert.equal((await guardar("g-ficha")).mueble.entrepanos, 4, "deshacer el vaciado no volvió a mandar los 4");
    }],
  ];
  for (const [nombre, fn] of asincronas) {
    try { await fn(); hechas++; console.log("  ok   " + nombre); }
    catch (e) { console.error("  FALLA " + nombre + "\n         " + e.message); process.exitCode = 1; }
  }
}

prueba("deshacer Y rehacer reponen el plano con la ficha que se va dicha con null, y el PUT lleva sinComercial", () => {
  const store = sinComentarios(leer("src/store/fixtureStore.ts"));
  assert.match(store, /const prev = conFichaQuitada\(state\.past\[state\.past\.length - 1\], current\);/, "deshacer repone la ficha ausente");
  assert.match(store, /const next = conFichaQuitada\(state\.future\[0\], current\);/, "rehacer repone la ficha ausente");
  assert.match(store, /await saveLayout\(sede, sinComercial\(fixtures\), base\)/, "el PUT no manda el plano por `sinComercial`");
  assert.match(store, /import \{ conFichaQuitada, sinComercial \} from "\.\.\/utils\/guardadoDelPlano";/);
});

prueba("conFichaQuitada y sinComercial, solos: el null de la ficha llega al cuerpo del PUT", () => {
  const actual = [{ id: "a", type: "gondola", entrepanos: 4, partes: { puertas: 2 } }, { id: "b", type: "gondola" }];
  const repuesto = [{ id: "a", type: "gondola" }, actual[1], { id: "c", type: "punta" }];
  const r = GP.conFichaQuitada(repuesto, actual);
  assert.deepEqual(r[0], { id: "a", type: "gondola", entrepanos: null, partes: null });
  assert.equal(r[1], actual[1]);
  assert.equal(r[2], repuesto[2], "un mueble que no está ahora no tiene nada que decir");
  assert.equal(repuesto[0].entrepanos, undefined, "conFichaQuitada mutó el historial");
  assert.equal(GP.conFichaQuitada(actual, actual), actual, "sin nada que decir no vuelve el mismo arreglo");
  const cuerpo = JSON.stringify(GP.sinComercial([{ id: "a", type: "gondola", entrepanos: null, partes: null, modulo: 1, ...CONTRATO }]));
  assert.match(cuerpo, /"entrepanos":null/);
  assert.match(cuerpo, /"partes":null/);
  for (const campo of GP.CAMPOS_DE_CONTRATO) assert.ok(!cuerpo.includes(`"${campo}"`), `\`${campo}\` viajó en el PUT`);
});

console.log(`\n${hechas} pruebas de geometría del mueble`);
