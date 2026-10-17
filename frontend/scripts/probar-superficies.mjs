/**
 * Pruebas de la superficie comercializable (`src/utils/superficie.ts`).
 *   npm run probar:superficies
 *
 * ── Por qué existe este archivo ──────────────────────────────────────────────
 *
 * Una cara vendida por participación se dibuja en zonas, y lo dibujado se
 * cuenta sobre lo que de verdad se vende de la cara: sin el zócalo, los
 * parantes, el copete, el remate. Esa superficie la calcula una receta por
 * tipo, dos veces —acá y en `backend/app/services/superficie.py`, que es el
 * que decide—, y en el 3D las zonas se pegan a un plano por delante del
 * frente del mueble. Por eso:
 *
 *   · **Los mismos casos en los dos lados** (`casos/superficies.json`, que
 *     corre también `tests/test_participaciones_geometria.py`): exclusiones,
 *     área útil, plano, giro y la firma que deja una distribución «para
 *     revisar».
 *   · **Las recetas son las del catálogo**: `RECETAS` es la unión
 *     `RecetaDeSuperficie` de `catalogo.ts`.
 *   · **La holgura se EJECUTA contra el 3D, no se lee** (`docs/engram/03`):
 *     para los siete tipos y varias medidas se arman los puntos más salientes
 *     del frente con las funciones de `muebles/medidas.ts` que usa el dibujo
 *     y con las cotas que `StoreEditor3D.tsx`, `PuntaReal.tsx`, `piezas.tsx`
 *     y `perfiles.ts` escriben en su código (las busca acá, y si cambian, la
 *     prueba se entera), y se afirma que todo queda al menos 6 mm detrás del
 *     plano del dibujo, en el marco de la superficie: el robatope, girado
 *     como sus repisas. La zona libre se mira desde arriba: 4 mm sobre la
 *     tapa.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = join(aqui, "..");
const leer = (p) => readFileSync(p, "utf8");
const CASOS = JSON.parse(leer(join(aqui, "casos", "superficies.json")));
const CATALOGO = JSON.parse(leer(join(raiz, "src", "catalogo", "muebles.json")));
const TOL = CASOS.tolerancia;
const muebles = join(raiz, "src", "components", "StoreEditor3D", "muebles");
const FUENTE = {
  editor: leer(join(raiz, "src", "components", "StoreEditor3D", "StoreEditor3D.tsx")),
  gondola: leer(join(muebles, "GondolaReal.tsx")),
  punta: leer(join(muebles, "PuntaReal.tsx")),
  piezas: leer(join(muebles, "piezas.tsx")),
  perfiles: leer(join(muebles, "perfiles.ts")),
};

let hechas = 0;
const prueba = async (n, fn) => {
  try { await fn(); hechas++; console.log("  ok   " + n); }
  catch (e) { console.error("  FALLA " + n + "\n         " + e.message.split("\n").join("\n         ")); process.exitCode = 1; }
};

const r = await build({
  stdin: {
    contents: [
      'export * from "./src/utils/superficie.ts";',
      'export { areaUtil } from "./src/utils/zonasGeometria.ts";',
      'export { ALTURA_PISABLE } from "./src/utils/planta.ts";',
      'export * as M from "./src/components/StoreEditor3D/muebles/medidas.ts";',
    ].join("\n"),
    resolveDir: raiz, loader: "ts",
  },
  bundle: true, write: false, format: "esm", platform: "neutral", logLevel: "silent",
});
const S = await import("data:text/javascript;base64," + Buffer.from(r.outputFiles[0].text).toString("base64"));
const { M } = S;

const comoCaso = (s) => s && ({ orientacion: s.orientacion, ancho: s.ancho, alto: s.alto, plano: s.plano, giro_x: s.giroX, area_util_m2: s.areaUtilM2, exclusiones: s.exclusiones });
const porNombre = Object.fromEntries(CASOS.casos.map((c) => [c.nombre, c]));
const cerca = (a, b, tol, quien) => assert.ok(Math.abs(a - b) <= tol, `${quien}: ${a} y no ${b}`);

function igualSuperficie(obtenida, esperada, quien) {
  assert.equal(obtenida === null, esperada === null, `${quien}: ${obtenida === null ? "no dio superficie" : "dio superficie y no tenía que"}`);
  if (esperada === null) return;
  assert.equal(obtenida.orientacion, esperada.orientacion, quien);
  for (const k of ["ancho", "alto", "plano", "giro_x", "area_util_m2"]) cerca(obtenida[k], esperada[k], TOL, `${quien}: ${k}`);
  assert.equal(obtenida.exclusiones.length, esperada.exclusiones.length, `${quien}: cuántas exclusiones`);
  obtenida.exclusiones.forEach((x, i) => {
    const y = esperada.exclusiones[i];
    assert.equal(x.por, y.por, `${quien}: la exclusión ${i}`);
    for (const k of ["u0", "u1", "v0", "v1"]) cerca(x[k], y[k], TOL, `${quien}: ${x.por}.${k}`);
  });
}

console.log("superficies · los casos compartidos con el servidor");

await prueba(`la superficie y la firma de cada cara (${CASOS.casos.length} casos)`, () => {
  for (const c of CASOS.casos) {
    const esperada = typeof c.superficie === "string" ? porNombre[c.superficie.slice("igual:".length)].superficie : c.superficie;
    igualSuperficie(comoCaso(S.superficieDeCara(c.mueble, c.cara)), esperada, c.nombre);
    assert.equal(S.firmaDeCara(c.mueble, c.cara), c.firma ?? null, `${c.nombre}: la firma`);
  }
});

await prueba("las recetas son las de `RecetaDeSuperficie` (catalogo.ts) y las pide el catálogo", () => {
  const m = /export type RecetaDeSuperficie =([^;]*);/.exec(leer(join(raiz, "src", "catalogo", "catalogo.ts")));
  assert.ok(m, "no encontré `RecetaDeSuperficie` en catalogo.ts");
  const union = [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  assert.deepEqual([...S.RECETAS].sort(), union.sort());
  const conSuperficie = Object.entries(CATALOGO.tipos).filter(([, d]) => d.superficie);
  assert.deepEqual(conSuperficie.map(([t]) => t).sort(), ["cross", "gondola", "metro", "mueble", "punta", "ristra", "robatope"]);
  for (const [t, d] of conSuperficie) {
    assert.ok(S.RECETAS.includes(d.superficie.receta), `${t}: la receta «${d.superficie.receta}» no la calcula nadie`);
    assert.ok(S.tieneSuperficie(t), t);
  }
  for (const [alias, a] of Object.entries(CATALOGO.alias)) assert.equal(S.tieneSuperficie(alias), !!CATALOGO.tipos[a.tipo].superficie, alias);
  for (const t of ["nevera_puertas", "isla", "checkout", "constructor", "__proto__", "toString", ""]) assert.ok(!S.tieneSuperficie(t), t);
});

await prueba("la cara B de una doble es la A en espejo, y la mural no tiene B", () => {
  for (const w of [0.6, 0.9, 1.25, 2.4, 3.0, 4.9]) {
    for (const extra of [{}, { modulo: 1.0 }, { partes: { tramos: 3 } }, { type: "gondola_doble" }]) {
      const f = { type: "gondola", w, d: 0.9, h: 1.8, ...extra };
      assert.deepEqual(S.superficieDeCara(f, "B"), S.superficieDeCara(f, "A"), `${w} ${JSON.stringify(extra)}`);
      assert.equal(S.firmaDeCara(f, "B"), S.firmaDeCara(f, "A"));
      const g = S.guiasDeCara(f, "A"), gb = S.guiasDeCara(f, "B");
      assert.deepEqual(gb.entrepanos, g.entrepanos);
      assert.deepEqual(gb.parantes.map((u) => +u.toFixed(9)), g.parantes.map((u) => +(1 - u).toFixed(9)).sort((a, b) => a - b));
    }
  }
  assert.equal(S.superficieDeCara({ type: "gondola", gondolaType: "wall", w: 2, d: 0.4, h: 1.8 }, "B"), null);
});

await prueba("la firma cambia con lo que mueve u,v y no con el fondo", () => {
  const base = { type: "gondola", w: 1.25, d: 0.9, h: 1.8 };
  const f0 = S.firmaDeCara(base, "A");
  for (const [cambio, quien] of [[{ w: 1.3 }, "el ancho"], [{ h: 2.0 }, "el alto"], [{ entrepanos: 4 }, "los entrepaños"],
    [{ partes: { tramos: 2 } }, "los tramos"], [{ modulo: 0.6 }, "el módulo"], [{ gondolaType: "wall" }, "mural"], [{ type: "punta" }, "el tipo"]]) {
    assert.notEqual(S.firmaDeCara({ ...base, ...cambio }, "A"), f0, `${quien} no cambia la firma`);
  }
  assert.equal(S.firmaDeCara({ ...base, d: 1.16 }, "A"), f0, "el fondo cambia la firma");
  assert.equal(S.firmaDeCara({ ...base, entrepanos: 4.5 }, "A"), f0, "unos entrepaños que no son enteros cuentan");
  assert.equal(S.firmaDeCara({ ...base, type: "gondola_doble" }, "A"), f0, "el tipo legado firma distinto");
  assert.ok(f0.startsWith("v1|gondola|doble|1250|1800|e-|"), f0);
});

await prueba("las guías del lienzo caen en la cara, ordenadas, y salen de la misma cuenta que el dibujo", () => {
  const g = S.guiasDeCara({ type: "gondola", w: 3.0, d: 0.9, h: 1.8, entrepanos: 4 }, "A");
  assert.equal(g.entrepanos.length, M.nivelesDeEntrepano(1.8, 4).length);
  assert.equal(g.parantes.length, M.vanosDeCorrido(3.0).length + 1);
  for (const [tipo, extra] of [["gondola", {}], ["punta", { d: 0.4 }], ["robatope", { w: 0.3, d: 0.4 }], ["ristra", { w: 0.4, d: 0.4 }],
    ["cross", { w: 0.8, d: 0.8 }], ["mueble", { w: 1.8, d: 0.6 }]]) {
    const gg = S.guiasDeCara({ type: tipo, w: 1.25, d: 0.9, h: 1.8, ...extra }, "A");
    assert.ok(gg.entrepanos.length > 0, `${tipo}: sin guías de entrepaños`);
    for (const l of [gg.entrepanos, gg.parantes]) {
      assert.ok(l.every((x) => x >= 0 && x <= 1), `${tipo}: una guía fuera de la cara`);
      assert.deepEqual(l, [...l].sort((a, b) => a - b), `${tipo}: guías desordenadas`);
    }
  }
  assert.deepEqual(S.guiasDeCara({ type: "metro", w: 1, d: 1, h: 0.05 }, "A"), { entrepanos: [], parantes: [] });
  assert.deepEqual(S.guiasDeCara({ type: "nevera_puertas", w: 1, d: 1, h: 2 }, "A"), { entrepanos: [], parantes: [] });
});

/* ── La holgura, ejecutada contra lo que dibuja el 3D ────────────────────── */

/** El cuerpo de una función de un archivo fuente (hasta la próxima función
 *  de primer nivel). */
const cuerpo = (fuente, ancla) => {
  const i = fuente.indexOf(ancla);
  assert.ok(i >= 0, `no encontré «${ancla}»`);
  const j = fuente.indexOf("\nfunction ", i + ancla.length);
  const k = fuente.indexOf("\nexport ", i + ancla.length);
  const fin = Math.min(j < 0 ? fuente.length : j, k < 0 ? fuente.length : k);
  return fuente.slice(i, fin);
};
/** Los números de la primera coincidencia de `re` en `texto`. */
const numeros = (texto, re, quien) => {
  const m = re.exec(texto);
  assert.ok(m, `${quien}: no encontré ${re} (¿cambió el dibujo? hay que revisar la receta y su holgura)`);
  return m.slice(1).map(Number);
};
const tiene = (texto, literal, quien) => assert.ok(texto.includes(literal), `${quien}: no encontré «${literal}» (¿cambió el dibujo?)`);

const EDITOR = {
  robatope: cuerpo(FUENTE.editor, "function RobatopeMesh("),
  ristra: cuerpo(FUENTE.editor, "function RistraMesh("),
  cross: cuerpo(FUENTE.editor, "function CrossMesh("),
  vitrina: cuerpo(FUENTE.editor, "function MuebleMesh("),
};
const CARA_DE_ESTANTERIA = cuerpo(FUENTE.piezas, "export const CaraDeEstanteria");

/** Las cotas de las piezas comunes (piezas.tsx y perfiles.ts). */
const PIEZAS = (() => {
  const q = "piezas";
  tiene(CARA_DE_ESTANTERIA, "const fondo = profundidadDeNivel(i, niveles.length, fondoMaximo);", q);
  tiene(CARA_DE_ESTANTERIA, "const giro = inclinacionDeNivel(y, alto);", q);
  tiene(CARA_DE_ESTANTERIA, "<group key={`e-${y.toFixed(3)}-${v.x.toFixed(3)}`} position={[v.x, y, 0]}>", q);
  tiene(CARA_DE_ESTANTERIA, "<group rotation={[giro, 0, 0]}>", q);
  tiene(CARA_DE_ESTANTERIA, "position={[0, -PORTA_PRECIOS.alto / 2, -(fondo + PORTA_PRECIOS.saliente)]}", q);
  tiene(CARA_DE_ESTANTERIA, "<group key={`p-${x.toFixed(3)}`} position={[x, ZOCALO.alto, 0]}>", q);
  tiene(CARA_DE_ESTANTERIA, "geometry={geometriaRemate(anchoTotal, REMATE.saliente)}", q);
  const entrepano = cuerpo(FUENTE.perfiles, "export function geometriaEntrepano(");
  tiene(entrepano, "s.moveTo(0, -t);", "entrepaño");
  tiene(entrepano, "s.lineTo(fondo, labio);", "entrepaño");
  tiene(entrepano, "g.rotateY(Math.PI / 2);", "entrepaño");
  const [bisel] = numeros(entrepano, /bevelSize: ([\d.]+),/, "entrepaño");
  const precios = cuerpo(FUENTE.perfiles, "export function geometriaPortaPrecios(");
  tiene(precios, "s.moveTo(0, 0);", "porta precios");
  tiene(precios, "g.rotateY(-Math.PI / 2);", "porta precios");
  // El canto de adelante de la sección es x = 0; lo demás va hacia atrás.
  const xs = [...precios.matchAll(/s\.(?:moveTo|lineTo)\(([\d.]+)(?: - t)?, /g)].map((m) => Number(m[1]));
  assert.ok(xs.length >= 5 && Math.min(...xs) === 0, "porta precios: la sección ya no arranca en el canto");
  const parante = cuerpo(FUENTE.perfiles, "export function geometriaParante(");
  tiene(parante, "g.translate(0, 0, -f / 2);", "parante");
  const [biselParante] = numeros(parante, /bevelSize: ([\d.]+),/, "parante");
  const remate = cuerpo(FUENTE.perfiles, "export function geometriaRemate(");
  tiene(remate, "s.lineTo(-saliente, 0);", "remate");
  tiene(remate, "g.rotateY(Math.PI / 2);", "remate");
  return { bisel, biselParante };
})();

/** Gira (y, z) alrededor de X: el `rotation={[g, 0, 0]}` de three. */
const girar = (y, z, g) => [y * Math.cos(g) - z * Math.sin(g), y * Math.sin(g) + z * Math.cos(g)];

/** Los puntos más salientes de una CaraDeEstanteria (entrepaños con su
 *  porta precios, parantes) colgada en `montaje`, que crece hacia −z. */
function puntosDeEstanteria({ montaje, alto, niveles, fondoMaximo, quien }) {
  const P = [];
  const t = M.ENTREPANO.espesor, labio = M.ENTREPANO.labio, b = PIEZAS.bisel;
  const pa = M.PORTA_PRECIOS.alto, sal = M.PORTA_PRECIOS.saliente;
  niveles.forEach((y0, i) => {
    const fondo = M.profundidadDeNivel(i, niveles.length, fondoMaximo);
    const g = M.inclinacionDeNivel(y0, alto);
    const locales = [
      ["entrepaño", -(t + b), -(fondo + b)], ["entrepaño (labio)", labio + b, -(fondo + b)],
      ["porta precios", -pa / 2, -(fondo + sal)], ["porta precios", -pa / 2 + 0.0015, -(fondo + sal)],
      ["porta precios (arriba)", pa / 2, -(fondo + sal) + 0.008],
    ];
    for (const [pieza, y, z] of locales) {
      const [yy, zz] = girar(y, z, g);
      P.push({ pieza: `${quien}: ${pieza} ${i + 1}`, y: y0 + yy, z: montaje + zz });
    }
  });
  for (const y of [M.ZOCALO.alto, alto]) P.push({ pieza: `${quien}: parante`, y, z: montaje - (M.PARANTE.fondo + PIEZAS.biselParante) });
  P.push({ pieza: `${quien}: remate`, y: alto, z: montaje });
  return P;
}

/** Góndola (GondolaReal): las dos caras cuelgan de la espina. */
function puntosDeGondola(f) {
  const src = FUENTE.gondola, q = "GondolaReal";
  tiene(src, "<group position={[0, 0, -espesorEspina / 2]}>", q);
  tiene(src, "<group position={[0, 0, espesorEspina / 2]} rotation={[0, Math.PI, 0]}>", q);
  tiene(src, "const fondoDeCara = fondoPorCara(d, esMural);", q);
  tiene(src, "const niveles = useMemo(() => nivelesDeEntrepano(h, entrepanos), [h, entrepanos]);", q);
  tiene(src, "? Math.max(0.05, fondoDeCara - ZOCALO.retranqueo)", q);
  tiene(src, ": Math.max(0.05, d - ZOCALO.retranqueo * 2);", q);
  tiene(src, "position={[0, ZOCALO.alto / 2, esMural ? -fondoBase / 2 + espesorEspina / 2 : 0]}", q);
  const mural = f.gondolaType === "wall";
  const fondoDeCara = M.fondoPorCara(f.d, mural);
  const fondoBase = mural ? Math.max(0.05, fondoDeCara - M.ZOCALO.retranqueo) : Math.max(0.05, f.d - M.ZOCALO.retranqueo * 2);
  const zocalo = mural ? -fondoBase / 2 + M.ESPESOR_ESPINA / 2 - fondoBase / 2 : -fondoBase / 2;
  return [
    ...puntosDeEstanteria({ montaje: -M.ESPESOR_ESPINA / 2, alto: f.h, niveles: M.nivelesDeEntrepano(f.h, f.entrepanos), fondoMaximo: fondoDeCara, quien: "góndola" }),
    { pieza: "góndola: zócalo", y: 0, z: zocalo }, { pieza: "góndola: espina", y: f.h, z: -M.ESPESOR_ESPINA / 2 },
  ];
}

/** Punta (PuntaReal): la cara cuelga atrás, en z = d/2, y crece al frente. */
function puntosDePunta(f) {
  const src = FUENTE.punta, q = "PuntaReal";
  tiene(src, "<group position={[0, 0, d / 2]}>", q);
  tiene(src, "const fondoDeCara = Math.max(0.12, d - PANEL_FONDO.espesor);", q);
  tiene(src, "const altoDeCuerpo = techoDeCara(h);", q);
  tiene(src, "const niveles = useMemo(() => nivelesDePunta(altoDeCuerpo, entrepanos), [altoDeCuerpo, entrepanos]);", q);
  tiene(src, "alto={altoDeCuerpo}", q);
  const [cenefaSale, cenefaFondo] = numeros(src,
    /-d \/ 2 - ([\d.]+)\]\}[\s\S]{0,200}?<boxGeometry args=\{\[w, altoDeCuerpo - niveles\[niveles\.length - 1\] - [\d.]+, ([\d.]+)\]\} \/>/, "cenefa");
  tiene(src, "{cenefa && altoDeCuerpo - niveles[niveles.length - 1] < HUECO_SIN_PRODUCTO && (", q);
  const [tapaAlto] = numeros(src, /<boxGeometry args=\{\[w, ([\d.]+), d\]\} \/>/, "tapa");
  const [barraAdentro, barraFondo] = numeros(src, /position=\{\[0, altoDeCuerpo - [\d.]+, -d \/ 2 \+ ([\d.]+)\]\}[\s\S]{0,120}?<boxGeometry args=\{\[w - PARANTE\.ancho \* 2, [\d.]+, ([\d.]+)\]\} \/>/, "barra de luz");
  tiene(src, "position={[0, ZOCALO.alto / 2, ZOCALO.retranqueo / 2]}", q);
  tiene(src, "const fondoBase = Math.max(0.05, d - ZOCALO.retranqueo);", q);
  tiene(src, "const zCopete = COPETE.fondo / 2;", q);
  const techo = M.techoDeCara(f.h);
  const niveles = M.nivelesDePunta(techo, f.entrepanos);
  const P = puntosDeEstanteria({ montaje: f.d / 2, alto: techo, niveles, fondoMaximo: Math.max(0.12, f.d - M.PANEL_FONDO.espesor), quien: "punta" });
  // La cenefa sólo aparece con la marca en el copete (nunca en el mueble
  // desnudo), pero se mide igual: es lo más saliente que puede tener.
  const ultimo = niveles[niveles.length - 1];
  if (ultimo !== undefined && techo - ultimo < M.HUECO_SIN_PRODUCTO) {
    for (const y of [ultimo, techo]) P.push({ pieza: "punta: cenefa", y, z: -f.d / 2 - cenefaSale - cenefaFondo / 2 });
  }
  const fondoBase = Math.max(0.05, f.d - M.ZOCALO.retranqueo);
  P.push({ pieza: "punta: tapa", y: techo - tapaAlto, z: -f.d / 2 });
  P.push({ pieza: "punta: barra de luz", y: techo - 0.06, z: -f.d / 2 + barraAdentro - barraFondo / 2 });
  P.push({ pieza: "punta: zócalo", y: 0, z: M.ZOCALO.retranqueo / 2 - fondoBase / 2 });
  P.push({ pieza: "punta: copete", y: techo + M.COPETE.alto / 2, z: M.COPETE.fondo / 2 - M.COPETE.fondo });
  return P;
}

/** Robatope (RobatopeMesh): rieles y tablas, girados con sus repisas; lo
 *  demás, sin girar. Todo se lleva al marco de la superficie (el girado). */
function puntosDeRobatope(f) {
  const src = EDITOR.robatope, q = "RobatopeMesh";
  tiene(src, "<group key={i} rotation={[cotas.giro, 0, 0]}>", q);
  tiene(src, "<mesh position={[0, sy, 0]} castShadow>", q);
  tiene(src, "<boxGeometry args={[cotas.anchoUtil, ROBATOPE.espesorRepisa, cotas.fondo]} />", q);
  tiene(src, "<mesh position={[0, sy + ROBATOPE.rielSube, -(d / 2 - ROBATOPE.rielAdentro)]}>", q);
  tiene(src, "<boxGeometry args={[w - ROBATOPE.rielRetiro, ROBATOPE.rielAlto, ROBATOPE.rielEspesor]} />", q);
  tiene(src, "<boxGeometry args={[ROBATOPE.parante, bodyH, d]} />", q);
  const [tiraY, tiraSale, tiraAlto, tiraFondo] = numeros(src,
    /<mesh position=\{\[0, ([\d.]+), -\(d \/ 2 \+ ([\d.]+)\)\]\}>\s*<boxGeometry args=\{\[w \* [\d.]+, ([\d.]+), ([\d.]+)\]\} \/>\s*<meshLambertMaterial color=\{statusColor\}/, "tira de estado");
  const [remateDe] = numeros(src, /<boxGeometry args=\{\[w \+ [\d.]+, capH, d \+ ([\d.]+)\]\} \/>/, "remate");
  const [filoSube, filoSale, filoAlto, filoFondo] = numeros(src,
    /<mesh position=\{\[0, bodyH \+ ([\d.]+), -\(d \/ 2 \+ ([\d.]+)\)\]\}>\s*<boxGeometry args=\{\[w \+ [\d.]+, ([\d.]+), ([\d.]+)\]\} \/>/, "filo del remate");
  const [patas] = numeros(src, /<boxGeometry args=\{\[0\.10, 0\.090, d \* ([\d.]+)\]\} \/>/, "patas");
  const R = M.ROBATOPE, c = M.cotasDeRobatope(f.w, f.d, f.h), g = c.giro;
  const P = [];
  for (const sy of c.repisas) {
    for (const dy of [-R.rielAlto / 2, R.rielAlto / 2]) P.push({ pieza: "robatope: riel", y: sy + R.rielSube + dy, z: -(f.d / 2 - R.rielAdentro) - R.rielEspesor / 2, girado: true });
    for (const dy of [-R.espesorRepisa / 2, R.espesorRepisa / 2]) P.push({ pieza: "robatope: tabla", y: sy + dy, z: -c.fondo / 2, girado: true });
  }
  for (const y of [0, c.cuerpo]) P.push({ pieza: "robatope: parante", y, z: -f.d / 2 });
  for (const y of [tiraY - tiraAlto / 2, tiraY + tiraAlto / 2]) P.push({ pieza: "robatope: tira de estado", y, z: -(f.d / 2 + tiraSale) - tiraFondo / 2 });
  for (const y of [c.cuerpo, f.h]) P.push({ pieza: "robatope: remate", y, z: -(f.d + remateDe) / 2 });
  for (const y of [c.cuerpo + filoSube - filoAlto / 2, c.cuerpo + filoSube + filoAlto / 2]) P.push({ pieza: "robatope: filo del remate", y, z: -(f.d / 2 + filoSale) - filoFondo / 2 });
  for (const y of [0, 0.09]) P.push({ pieza: "robatope: pata", y, z: -f.d * patas / 2 });
  // Al marco girado: la inversa de Rx(g).
  return P.map((p) => {
    if (p.girado) return p;
    const [y, z] = girar(p.y, p.z, -g);
    return { ...p, y, z };
  });
}

/** Ristra (RistraMesh): la tira, los ganchos y su franja de estado. */
function puntosDeRistra(f) {
  const src = EDITOR.ristra, q = "RistraMesh";
  const [anchoMax, anchoMin, fraccion] = numeros(src, /const RISTRA_W = Math\.min\(([\d.]+), Math\.max\(([\d.]+), w \* ([\d.]+)\)\);/, "ancho de la lámina");
  assert.deepEqual([anchoMax, anchoMin, fraccion], [S.RISTRA.anchoMaximo, S.RISTRA.anchoMinimo, S.RISTRA.fraccionDelAncho], "ristra: la receta no tiene el ancho del dibujo");
  const [recorte] = numeros(src, /const RISTRA_H = h - ([\d.]+);/, "alto de la lámina");
  const [base] = numeros(src, /y=\{RISTRA_H \/ 2 \+ ([\d.]+)\}/, "base de la lámina");
  assert.deepEqual([base, recorte - base], [S.RISTRA.base, S.RISTRA.cabezal], "ristra: la base y el cabezal no son los del dibujo");
  // La varilla va acostada (rotación π/2 en X): su largo es el fondo que
  // sale de la tira, y su radio no suma hacia adelante.
  const [centro, largo] = numeros(src,
    /<mesh position=\{\[0, 0, -d \* ([\d.]+)\]\} rotation=\{\[Math\.PI \/ 2, 0, 0\]\} castShadow>\s*<cylinderGeometry args=\{\[[\d.]+, [\d.]+, d \* ([\d.]+), 6\]\} \/>/, "gancho");
  assert.equal(centro * 2, largo, "ristra: el gancho ya no arranca en la tira");
  assert.equal(largo, S.RISTRA.gancho, "ristra: la receta no mide el gancho del dibujo");
  const [punta, radioPunta] = numeros(src, /<mesh position=\{\[0, 0\.009, -d \* ([\d.]+)\]\} castShadow>\s*<cylinderGeometry args=\{\[([\d.]+),/, "punta del gancho");
  const [franjaSale, franjaFondo] = numeros(src, /<mesh position=\{\[0, 0\.016, -([\d.]+)\]\}>\s*<boxGeometry args=\{\[0\.022, 0\.012, ([\d.]+)\]\} \/>/, "franja de estado");
  const [tiraFondo] = numeros(src, /<boxGeometry args=\{\[TIRA, h, ([\d.]+)\]\} \/>/, "tira");
  const [n0, n1] = numeros(src, /const nHooks = Math\.max\((\d+), Math\.round\(h \/ ([\d.]+)\)\);/, "ganchos");
  const n = Math.max(n0, Math.round(f.h / n1));
  const sp = (f.h - 0.10) / n;
  tiene(src, "const py = h - 0.08 - i * sp;", q);
  const P = [];
  for (let i = 0; i < n; i++) {
    const py = f.h - 0.08 - i * sp;
    P.push({ pieza: "ristra: gancho", y: py, z: -f.d * centro - f.d * largo / 2 });
    P.push({ pieza: "ristra: punta del gancho", y: py + 0.009, z: -f.d * punta - radioPunta });
    P.push({ pieza: "ristra: franja de estado", y: py + 0.016, z: -franjaSale - franjaFondo / 2 });
  }
  for (const y of [0, f.h]) P.push({ pieza: "ristra: tira", y, z: -tiraFondo / 2 });
  return P;
}

/** Cruz (CrossMesh): los postes delanteros y las repisas inclinadas. */
function puntosDeCross(f) {
  const src = EDITOR.cross, q = "CrossMesh";
  const [ejeX, ejeZ, ladoX, ladoZ] = numeros(src,
    /position=\{\[side \* \(w \/ 2 - ([\d.]+)\), h \/ 2, dz \* \(d \/ 2 - ([\d.]+)\)\]\} castShadow>\s*<boxGeometry args=\{\[([\d.]+), h, ([\d.]+)\]\} \/>/, "postes");
  assert.deepEqual([ejeX, ladoX], [S.CROSS.ejeDelPoste, S.CROSS.ladoDelPoste], "cruz: la receta no tiene los postes del dibujo");
  const [n0, n1] = numeros(src, /const nLevels = Math\.max\((\d+), Math\.round\(h \/ ([\d.]+)\)\);/, "niveles");
  const [primero, recorrido] = numeros(src, /const py = ([\d.]+) \+ i \* \(\(h - ([\d.]+)\) \/ Math\.max\(nLevels - 1, 1\)\);/, "niveles");
  assert.deepEqual([primero, recorrido], [S.CROSS.primerNivel, S.CROSS.recorrido], "cruz: la receta no tiene los niveles del dibujo");
  const [giro] = numeros(src, /<group key=\{i\} position=\{\[0, py, 0\]\} rotation=\{\[(-[\d.]+), 0, 0\]\}>/, "giro de las repisas");
  const [repisaAlto, repisaRetiro] = numeros(src, /<boxGeometry args=\{\[w - [\d.]+, ([\d.]+), d - ([\d.]+)\]\} \/>/, "repisa");
  assert.equal(repisaAlto / 2, S.CROSS.medioEspesor, "cruz: la receta no tiene el espesor de la repisa");
  const [carY, carAdentro, carAlto, carFondo] = numeros(src,
    /<mesh position=\{\[0, ([\d.]+), -\(d \/ 2 - ([\d.]+)\)\]\}>\s*<boxGeometry args=\{\[w - [\d.]+, ([\d.]+), ([\d.]+)\]\} \/>/, "cartel de la repisa");
  const [estY, estAdentro, estAlto, estFondo] = numeros(src,
    /<mesh position=\{\[0, ([\d.]+), -\(d \/ 2 - ([\d.]+)\)\]\}>\s*<boxGeometry args=\{\[w \* [\d.]+, ([\d.]+), ([\d.]+)\]\} \/>/, "franja de estado");
  const [patas] = numeros(src, /<boxGeometry args=\{\[0\.065, 0\.104, d \* ([\d.]+)\]\} \/>/, "patas");
  const n = Math.max(n0, Math.round(f.h / n1));
  const P = [];
  for (const y of [0, f.h]) P.push({ pieza: "cruz: poste", y, z: -(f.d / 2 - ejeZ) - ladoZ / 2 });
  for (let i = 0; i < n; i++) {
    const py = primero + i * ((f.h - recorrido) / Math.max(n - 1, 1));
    const locales = [
      ["repisa", -repisaAlto / 2, -(f.d - repisaRetiro) / 2], ["repisa", repisaAlto / 2, -(f.d - repisaRetiro) / 2],
      ["cartel", carY - carAlto / 2, -(f.d / 2 - carAdentro) - carFondo / 2], ["cartel", carY + carAlto / 2, -(f.d / 2 - carAdentro) - carFondo / 2],
      ["franja de estado", estY + estAlto / 2, -(f.d / 2 - estAdentro) - estFondo / 2],
    ];
    for (const [pieza, y, z] of locales) {
      const [yy, zz] = girar(y, z, giro);
      P.push({ pieza: `cruz: ${pieza} ${i + 1}`, y: py + yy, z: zz });
    }
  }
  for (const y of [0, 0.104]) P.push({ pieza: "cruz: pata", y, z: -f.d * patas / 2 });
  tiene(src, "<boxGeometry args={[0.045, 0.045, d - 0.064]} />", q);
  return P;
}

/** Vitrina (MuebleMesh): marco, vidrio, divisores y la tira de estado. */
function puntosDeVitrina(f) {
  const src = EDITOR.vitrina, q = "MuebleMesh";
  const [fraccion, baseMax] = numeros(src, /const baseH\s*= Math\.min\(h \* ([\d.]+), ([\d.]+)\);/, "zócalo");
  assert.deepEqual([fraccion, baseMax], [S.VITRINA.fraccionDeBase, S.VITRINA.baseMaxima], "vitrina: la receta no tiene el zócalo del dibujo");
  const [puerta] = numeros(src, /const nDoors\s*= Math\.max\(1, Math\.round\(w \/ ([\d.]+)\)\);/, "puertas");
  assert.equal(puerta, S.VITRINA.puerta, "vitrina: la receta no reparte las puertas como el dibujo");
  const [medioMarco, marco] = numeros(src, /position=\{\[side \* \(w \/ 2 - ([\d.]+)\), baseH \+ doorH \/ 2, 0\]\} castShadow>\s*<boxGeometry args=\{\[([\d.]+), doorH, d\]\} \/>/, "marco");
  assert.deepEqual([medioMarco * 2, marco], [S.VITRINA.marco, S.VITRINA.marco], "vitrina: la receta no tiene el marco del dibujo");
  tiene(src, "<boxGeometry args={[w, 0.036, d]} />", q);
  const [divAdentro, divAncho, divFondo] = numeros(src,
    /<mesh position=\{\[dx - doorW \/ 2, baseH \+ doorH \/ 2, -\(d \/ 2 - ([\d.]+)\)\]\}>\s*<boxGeometry args=\{\[([\d.]+), doorH, ([\d.]+)\]\} \/>/, "divisor");
  assert.equal(divAncho / 2, S.VITRINA.medioDivisor, "vitrina: la receta no tiene el divisor del dibujo");
  const [vidAdentro, vidFondo] = numeros(src, /<mesh position=\{\[dx, baseH \+ doorH \/ 2, -\(d \/ 2 - ([\d.]+)\)\]\}>\s*<boxGeometry args=\{\[doorW - [\d.]+, doorH - [\d.]+, ([\d.]+)\]\} \/>/, "vidrio");
  const [manAdentro, manFondo] = numeros(src, /-\(d \/ 2 - ([\d.]+)\)\]\}>\s*<boxGeometry args=\{\[0\.012, 0\.120, ([\d.]+)\]\} \/>/, "manija");
  const [zocAdentro, zocFondo] = numeros(src, /<mesh position=\{\[0, 0\.055, -\(d \/ 2 - ([\d.]+)\)\]\}>\s*<boxGeometry args=\{\[w - [\d.]+, [\d.]+, ([\d.]+)\]\} \/>/, "zócalo retranqueado");
  const [estY, estSale, estAlto, estFondo] = numeros(src,
    /<mesh position=\{\[0, ([\d.]+), -\(d \/ 2 \+ ([\d.]+)\)\]\}>\s*<boxGeometry args=\{\[w \* [\d.]+, ([\d.]+), ([\d.]+)\]\} \/>/, "tira de estado");
  const baseH = Math.min(f.h * fraccion, baseMax);
  return [
    { pieza: "vitrina: marco", y: baseH, z: -f.d / 2 }, { pieza: "vitrina: marco", y: f.h, z: -f.d / 2 },
    { pieza: "vitrina: divisor", y: baseH, z: -(f.d / 2 - divAdentro) - divFondo / 2 },
    { pieza: "vitrina: vidrio", y: baseH + 0.1, z: -(f.d / 2 - vidAdentro) - vidFondo / 2 },
    { pieza: "vitrina: manija", y: baseH + 0.2, z: -(f.d / 2 - manAdentro) - manFondo / 2 },
    { pieza: "vitrina: zócalo", y: 0.055, z: -(f.d / 2 - zocAdentro) - zocFondo / 2 },
    { pieza: "vitrina: zócalo", y: baseH, z: -f.d / 2 },
    { pieza: "vitrina: tira de estado", y: estY - estAlto / 2, z: -(f.d / 2 + estSale) - estFondo / 2 },
    { pieza: "vitrina: tira de estado", y: estY + estAlto / 2, z: -(f.d / 2 + estSale) - estFondo / 2 },
  ];
}

const PUNTOS = { gondola: puntosDeGondola, punta: puntosDePunta, robatope: puntosDeRobatope, ristra: puntosDeRistra, cross: puntosDeCross, mueble: puntosDeVitrina };
const HOLGURA_MINIMA = 0.006;

/** La menor holgura de un frente: el plano (z = −plano en el marco de la
 *  superficie) menos lo más saliente que cae en su alto. */
function holgura(f) {
  const s = S.superficieDeCara(f, "A");
  assert.ok(s, `${JSON.stringify(f)}: sin superficie`);
  let peor = { mm: Infinity, pieza: "" };
  for (const p of PUNTOS[f.type](f)) {
    if (p.y < -1e-9 || p.y > s.alto + 1e-9) continue;
    const h = s.plano + p.z;
    if (h < peor.mm) peor = { mm: h, pieza: p.pieza };
  }
  return peor;
}

const medidas = [];
for (const h of [1.2, 1.6, 2.0, 2.6]) {
  for (const d of [0.3, 0.4, 0.6, 0.9, 1.16, 1.2]) {
    for (const w of [0.6, 0.9, 1.25, 3.0]) {
      for (const entrepanos of [undefined, 2, 4, 6]) medidas.push({ type: "gondola", w, d, h, entrepanos });
    }
    for (const w of [1.0, 1.7]) for (const entrepanos of [undefined, 4]) medidas.push({ type: "gondola", gondolaType: "wall", w, d, h, entrepanos });
  }
}
for (const h of [0.7, 1.2, 1.6, 1.8, 2.0]) {
  for (const d of [0.3, 0.4, 0.5, 0.6]) {
    for (const w of [0.6, 0.9, 2.0]) for (const entrepanos of [undefined, 2, 3, 5]) medidas.push({ type: "punta", w, d, h, entrepanos });
    for (const w of [0.3, 0.45]) medidas.push({ type: "robatope", w, d, h });
    for (const w of [0.1, 0.4]) medidas.push({ type: "ristra", w, d, h });
    for (const w of [0.5, 0.8]) medidas.push({ type: "cross", w, d, h });
    for (const w of [0.5, 1.2, 1.8]) medidas.push({ type: "mueble", w, d, h });
  }
}
// Los seis robatopes que midió el diseño (`final/robatope2.mjs`).
for (const [w, d, h] of [[0.3, 0.4, 1.6], [0.3, 0.4, 2.0], [0.45, 0.5, 1.8], [0.3, 0.3, 1.6], [0.3, 0.4, 1.2], [0.3, 0.6, 2.0]]) {
  medidas.push({ type: "robatope", w, d, h });
}

await prueba(`holgura ejecutada: todo el frente queda ≥ 6 mm detrás del dibujo (${medidas.length} muebles de seis tipos)`, () => {
  const peores = {};
  for (const f of medidas) {
    const p = holgura(f);
    const clave = f.gondolaType === "wall" ? "góndola mural" : f.type;
    if (!peores[clave] || p.mm < peores[clave].mm) peores[clave] = { ...p, f };
    assert.ok(p.mm >= HOLGURA_MINIMA - 1e-9,
      `${JSON.stringify(f)}: «${p.pieza}» queda a ${(p.mm * 1000).toFixed(1)} mm del dibujo (mínimo ${HOLGURA_MINIMA * 1000} mm)`);
  }
  console.log("         lo que manda: " + Object.entries(peores)
    .map(([t, p]) => `${t} ${(p.mm * 1000).toFixed(1)} mm (${p.pieza.replace(/^[^:]+: /, "")})`).join(" · "));
});

await prueba("el robatope dibuja en el marco girado de sus repisas: con el plano sin girar, las repisas lo atravesarían", () => {
  const f = { type: "robatope", w: 0.3, d: 0.4, h: 1.6 };
  const s = S.superficieDeCara(f, "A");
  assert.equal(s.giroX, M.ROBATOPE.giro);
  // El mismo plano SIN girar: los rieles de arriba se adelantan ≈ 0,06·y.
  const c = M.cotasDeRobatope(f.w, f.d, f.h);
  const arriba = c.repisas[c.repisas.length - 1] + M.ROBATOPE.rielSube + M.ROBATOPE.rielAlto / 2;
  const [, zMundo] = girar(arriba, -(f.d / 2 - M.ROBATOPE.rielAdentro) - M.ROBATOPE.rielEspesor / 2, c.giro);
  assert.ok(s.plano + zMundo < 0, "sin girar el plano, el riel de arriba no lo atravesaría (¿cambió el giro?)");
  for (const t of ["gondola", "punta", "ristra", "cross", "mueble", "metro"]) {
    const sup = S.superficieDeCara({ type: t, w: 1, d: 0.6, h: t === "metro" ? 0.05 : 1.8 }, "A");
    assert.equal(sup.giroX, 0, `${t} gira`);
  }
});

await prueba("la zona libre: 4 mm sobre la tapa que dibuja el 3D, y sólo si se pisa", () => {
  // §10.7: una zona libre que se pisa (h < ALTURA_PISABLE) se dibuja como una
  // placa de alto h. El dibujo de las zonas va 4 mm arriba, mirado desde
  // arriba (polygonOffset): no tiene producto encima.
  for (const [w, d, h] of [[1, 1, 0.05], [2, 0.5, 0.02], [1.5, 1.5, 0.2]]) {
    const s = S.superficieDeCara({ type: "metro", w, d, h }, "A");
    assert.equal(s.orientacion, "arriba");
    assert.deepEqual([s.ancho, s.alto, s.exclusiones], [w, d, []]);
    assert.ok(s.plano - h >= 0.004 - 1e-12, "el dibujo de la zona libre no queda sobre su tapa");
  }
  assert.equal(S.superficieDeCara({ type: "metro", w: 1, d: 1, h: S.ALTURA_PISABLE }, "A"), null,
    "una zona libre que no se pisa (el 3D la dibuja con estantes y rieles por encima de h) tiene superficie");
});

console.log(`\n${hechas} pruebas de superficies en verde`);
