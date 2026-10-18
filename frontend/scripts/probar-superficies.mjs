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
 *   · **Las zonas en el 3D** (`zonas3d.ts`): montadas con three como las monta
 *     la escena (el grupo del giro del robatope y, adentro, el de la cara),
 *     cada punto cae donde dice §8.2 y la cara visible da hacia quien mira; el
 *     rayo contra el plano devuelve la misma cara y el mismo (u, v), con 2 cm
 *     de tolerancia en metros.
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
      'export * as Z from "./src/utils/zonas3d.ts";',
    ].join("\n"),
    resolveDir: raiz, loader: "ts",
  },
  bundle: true, write: false, format: "esm", platform: "neutral", logLevel: "silent",
});
const S = await import("data:text/javascript;base64," + Buffer.from(r.outputFiles[0].text).toString("base64"));
const { M, Z } = S;

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

await prueba("medidas absurdas no se distribuyen: los dos lados del filo de MAX_VANOS y MEDIDA_MAXIMA", () => {
  // La API no acota `w` ni `modulo`: sin el tope, un ancho de 1e308 dejaba
  // el bucle de parantes sin fin. Los casos compartidos tienen el lado de
  // afuera; acá va también el de adentro.
  assert.deepEqual([S.MAX_VANOS, S.MEDIDA_MAXIMA], [200, 1000]);
  const justo = S.superficieDeCara({ type: "gondola", w: 1.25 * S.MAX_VANOS, d: 0.9, h: 1.8 }, "A");
  assert.ok(justo, "200 módulos no tienen superficie");
  assert.equal(justo.exclusiones.filter((e) => e.por === "parante").length, S.MAX_VANOS + 1);
  assert.equal(S.superficieDeCara({ type: "gondola", w: 251.9, d: 0.9, h: 1.8 }, "A"), null);
  assert.ok(S.superficieDeCara({ type: "mueble", w: 0.6 * S.MAX_VANOS, d: 0.6, h: 2 }, "A"), "200 puertas no tienen superficie");
  assert.equal(S.superficieDeCara({ type: "mueble", w: 0.6 * (S.MAX_VANOS + 1), d: 0.6, h: 2 }, "A"), null);
  assert.ok(S.superficieDeCara({ type: "robatope", w: 0.3, d: 0.4, h: S.MEDIDA_MAXIMA }, "A"), "un kilómetro justo no tiene superficie");
  assert.ok(S.firmaDeCara({ type: "robatope", w: 0.3, d: 0.4, h: S.MEDIDA_MAXIMA }, "A").startsWith("v1|robatope||300|1000000|"));
  for (const k of ["w", "d", "h"]) {
    const f = { type: "cross", w: 0.8, d: 0.8, h: 1.8, [k]: S.MEDIDA_MAXIMA + 0.001 };
    assert.equal(S.superficieDeCara(f, "A"), null, k);
    assert.equal(S.firmaDeCara(f, "A"), null, k);
  }
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

console.log("superficies · las zonas en el 3D (`zonas3d.ts`, armado con three como lo monta la escena)");

const THREE = await import("three");
/** Lo que monta `ZonasDelMueble`: un grupo con el giro (sólo el robatope) y,
 *  adentro, el grupo de la cara; devuelve la matriz del grupo de la cara. */
const matrizDeLaCara = (sup, cara) => {
  const t = Z.transformDeCara(sup, cara);
  const afuera = new THREE.Group();
  if (t.giro) afuera.rotation.set(...t.giro);
  const adentro = new THREE.Group();
  adentro.position.set(...t.position);
  adentro.rotation.set(...t.rotation);
  afuera.add(adentro);
  afuera.updateMatrixWorld(true);
  return adentro.matrixWorld;
};
const supDe = (f, cara = "A") => {
  const s = S.superficieDeCara(f, cara);
  assert.ok(s, `${JSON.stringify(f)} ${cara} no tiene superficie`);
  return s;
};
const CARAS_3D = [
  ["góndola doble, A", { type: "gondola", w: 0.9, d: 0.9, h: 1.8 }, "A"],
  ["góndola doble, B", { type: "gondola", w: 0.9, d: 0.9, h: 1.8 }, "B"],
  ["góndola de 3 m, B", { type: "gondola", w: 3, d: 0.9, h: 1.8 }, "B"],
  ["mural", { type: "gondola", gondolaType: "wall", w: 1, d: 0.4, h: 1.9 }, "A"],
  ["punta", { type: "punta", w: 0.9, d: 0.4, h: 1.8 }, "A"],
  ["robatope", { type: "robatope", w: 0.3, d: 0.4, h: 1.6 }, "A"],
  ["ristra", { type: "ristra", w: 0.4, d: 0.4, h: 1.6 }, "A"],
  ["metro (desde arriba)", { type: "metro", w: 1.2, d: 0.8, h: 0.05 }, "A"],
];
let sem3 = 4242;
const az3 = () => ((sem3 = (sem3 * 16807) % 2147483647) / 2147483647);
const cerca3 = ([a, b, c], [x, y, z], tol, quien) => assert.ok(Math.abs(a - x) <= tol && Math.abs(b - y) <= tol && Math.abs(c - z) <= tol,
  `${quien}: (${a.toFixed(5)}, ${b.toFixed(5)}, ${c.toFixed(5)}) y no (${x.toFixed(5)}, ${y.toFixed(5)}, ${z.toFixed(5)})`);
const rotarX = ([x, y, z], t) => [x, y * Math.cos(t) - z * Math.sin(t), y * Math.sin(t) + z * Math.cos(t)];

await prueba("la forma de una zona, montada con `transformDeCara`, cae donde dice §8.2 (A en −plano con x = (0,5 − u)·W; B en +plano; la tapa desde arriba; el robatope girado)", () => {
  for (const [nombre, f, cara] of CARAS_3D) {
    const sup = supDe(f, cara);
    const M4 = matrizDeLaCara(sup, cara);
    const W = sup.ancho, H = sup.alto;
    for (let k = 0; k < 40; k++) {
      const u = az3(), v = az3();
      const [[sx, sy]] = Z.formaDeZona(sup, cara, [[u, v]]);
      const p = new THREE.Vector3(sx, sy, 0).applyMatrix4(M4).toArray();
      let esperado;
      if (sup.orientacion === "arriba") esperado = [(0.5 - u) * W, sup.plano, -H / 2 + v * H];
      else if (cara === "B") esperado = [(u - 0.5) * W, v * H, sup.plano];
      else esperado = [(0.5 - u) * W, v * H, -sup.plano];
      esperado = rotarX(esperado, sup.giroX);
      cerca3(p, esperado, 1e-12, `${nombre} (${u.toFixed(3)}, ${v.toFixed(3)})`);
      cerca3(Z.puntoDeLaCara(sup, cara, u, v), esperado, 1e-12, `${nombre}: puntoDeLaCara`);
    }
    // u = 0 es la izquierda de quien MIRA la cara: en la A (mirando hacia +z
    // desde −z) la izquierda es +x; en la B, −x.
    const izq = Z.puntoDeLaCara(sup, cara, 0, 0.5)[0], der = Z.puntoDeLaCara(sup, cara, 1, 0.5)[0];
    if (cara === "B") assert.ok(izq < der, `${nombre}: u = 0 no es la izquierda`);
    else assert.ok(izq > der, `${nombre}: u = 0 no es la izquierda`);
    // La cara visible de `ShapeGeometry` (+z de la forma) da hacia quien mira.
    const n = new THREE.Vector3(0, 0, 1).transformDirection(M4).toArray();
    const haciaQuienMira = sup.orientacion === "arriba" ? [0, 1, 0] : cara === "B" ? [0, 0, 1] : [0, 0, -1];
    cerca3(n, rotarX(haciaQuienMira, sup.giroX), 1e-12, `${nombre}: la normal`);
  }
  // El robatope tiene el grupo del giro; los demás, no.
  assert.deepEqual(Z.transformDeCara(supDe({ type: "robatope", w: 0.3, d: 0.4, h: 1.6 }), "A").giro, [M.ROBATOPE.giro, 0, 0]);
  assert.equal(Z.transformDeCara(supDe({ type: "gondola", w: 0.9, d: 0.9, h: 1.8 }), "A").giro, null);
});

await prueba("elegir cara y punto con rayo contra plano: ida y vuelta en todas las caras, desde cualquier lado de enfrente", () => {
  for (const [nombre, f, cara] of CARAS_3D) {
    const sup = supDe(f, cara);
    const caras = { A: S.superficieDeCara(f, "A"), B: S.superficieDeCara(f, "B") };
    const normal = rotarX(sup.orientacion === "arriba" ? [0, 1, 0] : cara === "B" ? [0, 0, 1] : [0, 0, -1], sup.giroX);
    for (let k = 0; k < 60; k++) {
      const u = 0.02 + 0.96 * az3(), v = 0.02 + 0.96 * az3();
      const p = Z.puntoDeLaCara(sup, cara, u, v);
      // Una cámara delante de la cara (a 1–6 m, corrida para un costado).
      const d = 1 + 5 * az3();
      const camara = [p[0] + normal[0] * d + (az3() - 0.5) * 2, p[1] + normal[1] * d + (az3() - 0.5) * 1.5, p[2] + normal[2] * d + (az3() - 0.5) * 2];
      const dir = [p[0] - camara[0], p[1] - camara[1], p[2] - camara[2]];
      if (dir[0] * normal[0] + dir[1] * normal[1] + dir[2] * normal[2] >= -1e-6) continue;
      const r = Z.elegirCaraYPunto({ origen: camara, dir }, caras);
      assert.ok(r, `${nombre}: el rayo no tocó la cara`);
      assert.equal(r.cara, cara, `${nombre}: tocó la otra cara`);
      assert.ok(Math.abs(r.u - u) < 1e-9 && Math.abs(r.v - v) < 1e-9, `${nombre}: (${r.u}, ${r.v}) y no (${u}, ${v})`);
    }
  }
});

await prueba("rayos que no tocan: oblicuo que pasa al costado, desde adentro del mueble, paralelo; desde −z nunca la B", () => {
  const f = { type: "gondola", w: 0.9, d: 0.9, h: 1.8 };
  const caras = { A: S.superficieDeCara(f, "A"), B: S.superficieDeCara(f, "B") };
  assert.equal(Z.elegirCaraYPunto({ origen: [3, 1, -3], dir: [0.2, 0, 1] }, caras), null, "el oblicuo que pasa al costado tocó");
  assert.equal(Z.elegirCaraYPunto({ origen: [0, 1, 0], dir: [0, 0, 1] }, caras), null, "desde adentro tocó");
  assert.equal(Z.elegirCaraYPunto({ origen: [0, 1, -3], dir: [1, 0, 0] }, caras), null, "el paralelo tocó");
  const desdeA = Z.elegirCaraYPunto({ origen: [0, 1, -3], dir: [0, 0, 1] }, caras);
  assert.equal(desdeA.cara, "A");
  const desdeB = Z.elegirCaraYPunto({ origen: [0, 1, 3], dir: [0, 0, -1] }, caras);
  assert.equal(desdeB.cara, "B");
  // Una mural sólo tiene A: desde atrás, nada.
  const mural = { A: S.superficieDeCara({ type: "gondola", gondolaType: "wall", w: 1, d: 0.4, h: 1.9 }, "A"), B: null };
  assert.equal(Z.elegirCaraYPunto({ origen: [0, 1, 3], dir: [0, 0, -1] }, mural), null);
  // El metro, desde abajo, nada; desde arriba, la tapa (que es su A).
  const metro = { A: S.superficieDeCara({ type: "metro", w: 1, d: 1, h: 0.05 }, "A") };
  assert.equal(Z.elegirCaraYPunto({ origen: [0, -1, 0], dir: [0, 1, 0] }, metro), null);
  assert.deepEqual(Z.elegirCaraYPunto({ origen: [0.25, 3, -0.25], dir: [0, -1, 0] }, metro), { cara: "A", u: 0.25, v: 0.25 });
});

await prueba("la tolerancia del clic es de 2 cm EN METROS, en la ristra angosta y en la góndola de 3 m; u,v se recortan", () => {
  assert.equal(Z.TOLERANCIA_DEL_CLIC_M, 0.02);
  for (const f of [{ type: "ristra", w: 0.4, d: 0.4, h: 1.6 }, { type: "gondola", w: 3, d: 0.9, h: 1.8 }]) {
    const sup = S.superficieDeCara(f, "A");
    const caras = { A: sup };
    const rayo = (x, y) => ({ origen: [x, y, -sup.plano - 2], dir: [0, 0, 1] });
    // A la derecha de quien mira la A (−x), 1,5 cm afuera: toca, con u = 1.
    const r = Z.elegirCaraYPunto(rayo(-sup.ancho / 2 - 0.015, 1), caras);
    assert.ok(r && r.u === 1, `${f.type}: 1,5 cm afuera no tocó`);
    assert.equal(Z.elegirCaraYPunto(rayo(-sup.ancho / 2 - 0.025, 1), caras), null, `${f.type}: 2,5 cm afuera tocó`);
    assert.ok(Z.elegirCaraYPunto(rayo(0, sup.alto + 0.019), caras)?.v === 1, `${f.type}: arriba, dentro de la tolerancia`);
    assert.equal(Z.elegirCaraYPunto(rayo(0, -0.021), caras), null, `${f.type}: abajo, fuera de la tolerancia`);
  }
});

await prueba("la letra «A»/«B» va arriba al centro de su cara, sobre el plano del dibujo", () => {
  const f = { type: "gondola", w: 0.9, d: 0.9, h: 1.8 };
  const a = S.superficieDeCara(f, "A"), b = S.superficieDeCara(f, "B");
  cerca3(Z.letraDeCara(a, "A"), [0, a.alto + Z.ALTO_DE_LA_LETRA, -a.plano], 1e-12, "A");
  cerca3(Z.letraDeCara(b, "B"), [0, b.alto + Z.ALTO_DE_LA_LETRA, b.plano], 1e-12, "B");
  const rob = S.superficieDeCara({ type: "robatope", w: 0.3, d: 0.4, h: 1.6 }, "A");
  cerca3(Z.letraDeCara(rob, "A"), rotarX([0, rob.alto + Z.ALTO_DE_LA_LETRA, -rob.plano], rob.giroX), 1e-12, "robatope");
});

await prueba("la letra de la cara de atrás no se ve a través del mueble: tapada de frente, visible desde arriba (ejecutado, contra un rayo de three)", () => {
  const f = { type: "gondola", w: 1.25, d: 0.9, h: 1.8 };
  const a = S.superficieDeCara(f, "A"), b = S.superficieDeCara(f, "B");
  const la = Z.letraDeCara(a, "A"), lb = Z.letraDeCara(b, "B");
  const frenteBajo = [0.3, 1.2, -4];          // delante de la A, más bajo que el mueble
  assert.equal(Z.letraTapada(b, frenteBajo, lb), true, "la B se ve a través del mueble mirando la A");
  assert.equal(Z.letraTapada(a, frenteBajo, la), false, "la A, mirada de frente, quedó escondida");
  const atras = [-0.2, 1.2, 4];
  assert.equal(Z.letraTapada(a, atras, la), true, "la A se ve a través del mueble mirando la B");
  assert.equal(Z.letraTapada(b, atras, lb), false);
  const arriba = [0, 6, -2];                   // por encima del mueble: se ven las dos
  assert.equal(Z.letraTapada(b, arriba, lb), false, "desde arriba la de atrás asoma por encima y se escondió igual");
  assert.equal(Z.letraTapada(a, arriba, la), false);
  // La tapa de la zona libre tiene una sola cara: nada la tapa.
  const tapa = S.superficieDeCara({ type: "zona_libre", w: 1, d: 1, h: 0.05 }, "A")
    ?? S.superficieDeCara({ type: "metro", w: 1, d: 1, h: 0.05 }, "A");
  assert.equal(Z.letraTapada(tapa, [0, 3, -3], Z.letraDeCara(tapa, "A")), false);

  // Contra three: el rayo de la cámara a la letra contra la caja del cuerpo
  // entre las dos caras (girada en el robatope). Se comparan sólo los rayos
  // que no rozan un canto (la caja 1 cm más grande y 1 cm más chica dicen lo
  // mismo).
  const rc = new THREE.Raycaster();
  const tapadaPorThree = (sup, cam, letra, margen) => {
    const caja = new THREE.Mesh(new THREE.BoxGeometry(sup.ancho + margen, sup.alto + margen, 2 * sup.plano + margen), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    const g = new THREE.Group();
    g.rotation.set(sup.giroX, 0, 0);
    caja.position.set(0, sup.alto / 2, 0);
    g.add(caja);
    g.updateMatrixWorld(true);
    const o = new THREE.Vector3(...cam), dst = new THREE.Vector3(...letra);
    const dir = dst.clone().sub(o);
    const largo = dir.length();
    rc.set(o, dir.normalize());
    rc.far = largo;
    return rc.intersectObject(caja, false).some((h) => h.distance < largo - 1e-6);
  };
  let semilla = 7;
  const azar = () => { semilla = (semilla * 16807) % 2147483647; return semilla / 2147483647; };
  let comparados = 0;
  for (const [sup, cara] of [[a, "A"], [b, "B"], ...(() => {
    const ra = S.superficieDeCara({ type: "robatope", w: 0.3, d: 0.4, h: 1.6 }, "A");
    const rb = S.superficieDeCara({ type: "robatope", w: 0.3, d: 0.4, h: 1.6 }, "B");
    return rb ? [[ra, "A"], [rb, "B"]] : [[ra, "A"]];
  })()]) {
    const letra = Z.letraDeCara(sup, cara);
    for (let i = 0; i < 400; i++) {
      const ang = azar() * 2 * Math.PI, r = 1.5 + azar() * 6;
      const cam = [r * Math.cos(ang), 0.2 + azar() * 4, r * Math.sin(ang)];
      const grande = tapadaPorThree(sup, cam, letra, 0.01), chica = tapadaPorThree(sup, cam, letra, -0.01);
      if (grande !== chica) continue;
      comparados++;
      assert.equal(Z.letraTapada(sup, cam, letra), grande, `cara ${cara}, cámara ${cam.map((x) => x.toFixed(2))}: letraTapada no coincide con el rayo`);
    }
  }
  assert.ok(comparados > 1000, `se compararon pocos rayos: ${comparados}`);
});

// ── Distribución: arreglos de la revisión final ─────────────────────────────
//
// Tres cuentas puras del 3D de Distribución que dejó la revisión final: lejos
// con histéresis (los rótulos `Html` no se montan más allá de 40 m), el clic
// que un vecino tapa (`rayoTapado`, contra el raycaster de three) y el
// encuadre que abarca la cara entera en el panel partido
// (`encuadreDeDistribucion.ts`, con el plano del recorrido).

console.log("superficies · Distribución, arreglos de la revisión final");

const rE = await build({
  stdin: { contents: 'export * as ED from "./src/utils/encuadreDeDistribucion.ts"; export * as PL from "./src/utils/planta.ts";', resolveDir: raiz, loader: "ts" },
  bundle: true, write: false, format: "esm", platform: "neutral", logLevel: "silent",
});
const { ED, PL } = await import("data:text/javascript;base64," + Buffer.from(rE.outputFiles[0].text).toString("base64"));

await prueba("lejos con histéresis: se apaga al pasar los 40 m y vuelve 1 m más cerca (una órbita que roza el borde no monta y desmonta los rótulos)", () => {
  assert.equal(Z.sigueLejos(false, 40, 40), false);
  assert.equal(Z.sigueLejos(false, 40.01, 40), true);
  assert.equal(Z.sigueLejos(true, 39.5, 40), true, "vuelve apenas cruza el borde (sin histéresis)");
  assert.equal(Z.sigueLejos(true, 38.99, 40), false);
  assert.equal(Z.HISTERESIS_DE_LEJOS_M, 1);
  let lejos = false, cambios = 0;
  for (let k = 0; k < 400; k++) {
    const d = 40 + 0.4 * Math.sin(k / 3);
    const ahora = Z.sigueLejos(lejos, d, 40);
    if (ahora !== lejos) cambios++;
    lejos = ahora;
  }
  assert.equal(cambios, 1, `rozando el borde cambió ${cambios} veces`);
});

await prueba("el corte con la cara dice a qué distancia toca (`corteConLaCara`): el punto del rayo a esa distancia es el (u, v) de la cara", () => {
  const sup = supDe({ type: "gondola", gondolaType: "double", w: 2.5, d: 0.9, h: 1.8 }, "A");
  const supB = supDe({ type: "gondola", gondolaType: "double", w: 2.5, d: 0.9, h: 1.8 }, "B");
  let semilla = 11;
  const azar = () => { semilla = (semilla * 16807) % 2147483647; return semilla / 2147483647; };
  let vistos = 0;
  for (let i = 0; i < 300; i++) {
    const cara = azar() < 0.5 ? "A" : "B";
    const u = 0.05 + 0.9 * azar(), v = 0.05 + 0.9 * azar();
    const blanco = Z.puntoDeLaCara(cara === "A" ? sup : supB, cara, u, v);
    const origen = [blanco[0] + (azar() - 0.5) * 3, 0.3 + azar() * 2.5, blanco[2] + (cara === "A" ? -1 : 1) * (1 + azar() * 4)];
    const d = blanco.map((x, k) => x - origen[k]);
    const l = Math.hypot(...d);
    const dir = d.map((x) => x / l);
    const r = Z.corteConLaCara({ origen, dir }, { A: sup, B: supB });
    assert.ok(r, "no tocó la cara a la que apuntaba");
    assert.deepEqual(Z.elegirCaraYPunto({ origen, dir }, { A: sup, B: supB }), { cara: r.cara, u: r.u, v: r.v }, "las dos cuentas eligen distinto");
    assert.equal(r.cara, cara);
    assert.ok(Math.abs(r.t - l) < 1e-9, `la distancia del corte (${r.t}) no es la del rayo (${l})`);
    vistos++;
  }
  assert.equal(vistos, 300);
});

await prueba("un mueble que corta el rayo ANTES que la cara la tapa (`rayoTapado`), contra el raycaster de three (cajas giradas, 2000 rayos)", () => {
  const rc = new THREE.Raycaster();
  const cajaDeThree = (m, margen) => {
    const malla = new THREE.Mesh(new THREE.BoxGeometry(m.w + margen, m.h + margen, m.d + margen), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    const g = new THREE.Group();
    g.position.set(m.x, 0, m.z);
    g.rotation.set(0, m.rotY, 0);
    malla.position.set(0, m.h / 2, 0);
    g.add(malla);
    g.updateMatrixWorld(true);
    return malla;
  };
  const adentro = (m, p) => {
    const c = Math.cos(m.rotY), s = Math.sin(m.rotY), dx = p[0] - m.x, dz = p[2] - m.z;
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    return Math.abs(lx) < m.w / 2 + 0.02 && Math.abs(lz) < m.d / 2 + 0.02 && p[1] > -0.02 && p[1] < m.h + 0.02;
  };
  let semilla = 23;
  const azar = () => { semilla = (semilla * 16807) % 2147483647; return semilla / 2147483647; };
  let comparados = 0, tapados = 0;
  for (let i = 0; i < 2000; i++) {
    const m = { x: (azar() - 0.5) * 6, z: (azar() - 0.5) * 6, w: 0.3 + azar() * 3, d: 0.3 + azar() * 1.2, h: 0.05 + azar() * 2.2, rotY: azar() * 2 * Math.PI };
    const origen = [(azar() - 0.5) * 14, 0.2 + azar() * 4, (azar() - 0.5) * 14];
    if (adentro(m, origen)) continue;
    const blanco = [m.x + (azar() - 0.5) * 3, azar() * 2, m.z + (azar() - 0.5) * 3];
    const d = blanco.map((x, k) => x - origen[k]);
    const hasta = Math.hypot(...d);
    const dir = d.map((x) => x / hasta);
    const porThree = (margen) => {
      rc.set(new THREE.Vector3(...origen), new THREE.Vector3(...dir));
      rc.far = hasta;
      return rc.intersectObject(cajaDeThree(m, margen), false).some((h) => h.distance < hasta - 1e-6);
    };
    const grande = porThree(0.01), chica = porThree(-0.01);
    if (grande !== chica) continue;   // roza un canto: las dos cajas no se ponen de acuerdo
    comparados++;
    if (grande) tapados++;
    assert.equal(Z.rayoTapado({ origen, dir }, hasta, [m]), grande, `caja ${JSON.stringify(m)}, origen ${origen}: rayoTapado no coincide con three`);
  }
  assert.ok(comparados > 1500 && tapados > 200, `se compararon pocos rayos: ${comparados} (${tapados} tapados)`);
  // El caso del recorrido: se distribuye GON-01 (cara B, que mira a GON-02) y la cámara queda detrás de GON-02.
  const g = (code, x, z) => ({ code, x, z, w: 3, d: 0.9, h: 1.8, rotY: 0 });
  const gon01 = g("GON-01", 4, 4), gon02 = g("GON-02", 4, 9);
  const supB = supDe({ type: "gondola", gondolaType: "double", w: 3, d: 0.9, h: 1.8 }, "B");
  const supA = supDe({ type: "gondola", gondolaType: "double", w: 3, d: 0.9, h: 1.8 }, "A");
  const clic = (camara, blanco) => {
    const d = blanco.map((x, k) => x - camara[k]);
    const l = Math.hypot(...d);
    const dir = d.map((x) => x / l);
    const local = [camara[0] - gon01.x, camara[1], camara[2] - gon01.z];   // GON-01 sin giro: el marco es el mundo corrido
    const corte = Z.corteConLaCara({ origen: local, dir }, { A: supA, B: supB });
    return corte && !Z.rayoTapado({ origen: camara, dir }, corte.t, [gon02]) ? corte : null;
  };
  assert.equal(clic([4, 1, 12], [4, 1, 4.6]), null, "el clic sobre GON-02, que tapa, eligió la cara B de GON-01");
  assert.equal(clic([4, 1, 7], [4, 1, 4.6])?.cara, "B", "sin nada delante, el clic no eligió la cara");
  assert.equal(clic([4, 5, 12], [4, 1, 4.6])?.cara, "B", "por encima de GON-02 (se ve la cara) el clic no eligió");
  assert.equal(Z.rayoTapado({ origen: [4, 1, 12], dir: [0, 0, -1] }, 2, [gon02]), false, "un mueble DETRÁS de la cara la tapa");
});

await prueba("al entrar en Distribución el encuadre abarca la cara ENTERA en el panel partido: de frente si entra, si no el tres cuartos que la abarca (el plano del recorrido)", () => {
  const f = (code, x, z, w, d, h, rotY = 0) => ({ code, x, z, w, d, h, rotY });
  const NAVE = [f("GON-01", 4, 4, 3, 0.9, 1.8), f("GON-04", 4, 14, 3, 0.5, 1.9), f("PUN-01", 11, 4, 0.9, 0.4, 1.8), f("ROB-01", 13, 4, 1.2, 0.5, 1),
    f("RIS-01", 15, 4, 0.4, 0.4, 1.6), f("CRO-01", 17, 4, 0.8, 0.8, 1.8), f("MUE-01", 19.5, 4, 1.2, 0.6, 2), f("GON-02", 4, 9, 3, 0.9, 1.8),
    f("GON-03", 11, 9, 3, 0.9, 1.8), f("GON-05", 11, 14, 3, 0.9, 1.8)];
  // El salón del editor (`limitesDePlanta(…, 2,5)`) y el 3D del panel partido: ≈ 560 × 720 px a 1440 × 900 (y 521 a 1366).
  const limites = PL.limitesDePlanta(NAVE, 2.5, { minX: 0, maxX: 30, minZ: 0, maxZ: 42 });
  const encuadre = (code, cara, aspecto, plano = NAVE) => {
    const m = plano.find((x) => x.code === code);
    const mueble = { cx: m.x, cz: m.z, w: m.w, d: m.d, h: m.h, rotY: m.rotY };
    const obstaculos = PL.murosDeCaminata(plano.filter((x) => x !== m));
    const e = ED.encuadreDeLaCara(mueble, cara, obstaculos, limites, 50, aspecto);
    const esquinas = ED.esquinasDeLaCara(mueble, cara);
    const frente = PL.vistaDeVenta(mueble, cara, "frente", { yBajo: 0, yAlto: m.h }, obstaculos, limites, 50, aspecto);
    return { e, esquinas, obstaculos, antes: ED.cuantoOcupa(frente, 50, aspecto, esquinas) };
  };
  for (const aspecto of [560 / 720, 521 / 700]) {
    for (const [code, cara] of [["GON-01", "A"], ["GON-01", "B"], ["GON-03", "A"], ["GON-02", "B"], ["PUN-01", "A"], ["CRO-01", "A"]]) {
      const { e, esquinas, obstaculos, antes } = encuadre(code, cara, aspecto);
      const quien = `${code}·${cara} a ${aspecto.toFixed(2)}`;
      assert.equal(e.entera, true, `${quien}: la cara no entra entera`);
      for (const p of esquinas) {
        const q = PL.proyectar(e.vista, 50, aspecto, p);
        assert.ok(q.profundidad > 0 && Math.abs(q.x) <= ED.BORDE_DEL_ENCUADRE + 1e-9 && Math.abs(q.y) <= ED.BORDE_DEL_ENCUADRE + 1e-9,
          `${quien}: una esquina de la cara queda fuera de cuadro (${q.x.toFixed(2)}, ${q.y.toFixed(2)})`);
      }
      // Desde donde se puede parar alguien: dentro del salón y fuera de los muebles.
      assert.ok(e.vista.posX > limites.minX && e.vista.posX < limites.maxX && e.vista.posZ > limites.minZ && e.vista.posZ < limites.maxZ, `${quien}: la cámara sale del salón`);
      assert.ok(!PL.chocaEn(obstaculos, e.vista.posX, e.vista.posZ), `${quien}: la cámara queda adentro de un mueble`);
      assert.ok(e.vista.posY > e.vista.targetY, `${quien}: la cámara no mira desde arriba de la mira (los controles la corrigen)`);
      // De frente cuando entra de frente; si no, girada lo menos posible.
      if (antes <= ED.BORDE_DEL_ENCUADRE) assert.equal(e.toma, "frente", `${quien}: entraba de frente y se giró`);
      else assert.ok(e.toma === "tres_cuartos" && ED.GIROS_DEL_TRES_CUARTOS.includes(Math.abs(e.giro)), `${quien}: no entraba de frente y no se giró`);
    }
  }
  // GON-01·A, el caso del recorrido: de frente se veía el 54 % del ancho (la cara de −1,85 a +1,85).
  const gon = encuadre("GON-01", "A", 560 / 720);
  assert.ok(gon.antes > 1.6, `el caso del recorrido ya no se reproduce de frente (${gon.antes.toFixed(2)})`);
  assert.equal(gon.e.toma, "tres_cuartos");
  // A pantalla entera (16:9) la misma cara entra de frente: la cuenta mira el aspecto del lienzo de ahora.
  assert.equal(encuadre("GON-01", "A", 16 / 9).e.toma, "frente", "con el lienzo ancho no la mira de frente");
  // Girado 90°, igual.
  const girado = NAVE.map((m) => (m.code === "GON-01" ? { ...m, rotY: Math.PI / 2, x: 1.5, z: 12 } : m));
  const gr = encuadre("GON-01", "A", 560 / 720, girado);
  for (const p of gr.esquinas) assert.ok(Math.abs(PL.proyectar(gr.e.vista, 50, 560 / 720, p).x) <= ED.BORDE_DEL_ENCUADRE + 1e-9, "girado 90°, la cara no entra");
  // Encajonada (sin lugar para girar): la que muestra más, sin mentir que entra.
  const caja = PL.limitesDePlanta([NAVE[0]], 1.2, limites);
  const m = NAVE[0];
  const muro = ED.encuadreDeLaCara({ cx: m.x, cz: m.z, w: m.w, d: m.d, h: m.h, rotY: 0 }, "A", [], caja, 50, 560 / 720);
  const frenteMuro = PL.vistaDeVenta({ cx: m.x, cz: m.z, w: m.w, d: m.d, h: m.h, rotY: 0 }, "A", "frente", { yBajo: 0, yAlto: m.h }, [], caja, 50, 560 / 720);
  assert.equal(muro.entera, false, "encajonada dice que entra entera");
  assert.ok(muro.ocupa <= ED.cuantoOcupa(frenteMuro, 50, 560 / 720, ED.esquinasDeLaCara({ cx: m.x, cz: m.z, w: m.w, d: m.d, h: m.h, rotY: 0 }, "A")) + 1e-9,
    "encajonada eligió una toma que muestra menos que la de frente");
});

// Verificación de los arreglos del Editor: dos cosas del encuadre que nada fijaba (con los giros
// al revés —del más oblicuo— o sin la subida mínima de la cámara, las pruebas de arriba seguían
// en verde). La referencia de abajo recorre los giros de MENOR a mayor con la misma cuenta.
await prueba("el tres cuartos de Distribución es el de MENOR giro que abarca la cara y queda dentro del rango polar de los controles (si no, los controles la mueven y la cara se sale)", () => {
  const f = (code, x, z, w, d, h, rotY = 0) => ({ code, x, z, w, d, h, rotY });
  const NAVE = [f("GON-01", 4, 4, 3, 0.9, 1.8), f("GON-04", 4, 14, 3, 0.5, 1.9), f("PUN-01", 11, 4, 0.9, 0.4, 1.8), f("ROB-01", 13, 4, 1.2, 0.5, 1),
    f("RIS-01", 15, 4, 0.4, 0.4, 1.6), f("CRO-01", 17, 4, 0.8, 0.8, 1.8), f("MUE-01", 19.5, 4, 1.2, 0.6, 2), f("GON-02", 4, 9, 3, 0.9, 1.8),
    f("GON-03", 11, 9, 3, 0.9, 1.8), f("GON-05", 11, 14, 3, 0.9, 1.8)];
  // Los controles del editor: `minPolarAngle = π/6`, `maxPolarAngle = π/2,1` (StoreEditor3D.tsx).
  const editor = leer(join(raiz, "src", "components", "StoreEditor3D", "StoreEditor3D.tsx"));
  assert.match(editor, /ctrl\.minPolarAngle = Math\.PI \/ 6;\s*ctrl\.maxPolarAngle = Math\.PI \/ 2\.1;/, "cambió el rango polar de los controles: revisá la subida mínima del encuadre");
  const polar = (v) => Math.atan2(Math.hypot(v.posX - v.targetX, v.posZ - v.targetZ), v.posY - v.targetY);
  const SUBIDA = Math.tan(Math.PI / 2 - Math.PI / 2.1) * 1.08;
  /** La referencia: el menor giro de la lista con alguna toma que abarque la cara (la misma cuenta). */
  const menorGiroQueEntra = (mueble, cara, obstaculos, limites, aspecto) => {
    const esquinas = ED.esquinasDeLaCara(mueble, cara);
    const n = PL.normalDeCara(mueble.rotY ?? 0, cara);
    const centro = { x: mueble.cx + (n.x * mueble.d) / 2, z: mueble.cz + (n.z * mueble.d) / 2 };
    const mira = mueble.h / 2, yCamara = Math.min(1.6, Math.max(1.2, mira + 0.35));
    for (const giro of [...ED.GIROS_DEL_TRES_CUARTOS].sort((a, b) => a - b)) {
      for (const signo of [1, -1]) {
        const a = (signo * giro * Math.PI) / 180;
        const dir = { x: n.x * Math.cos(a) - n.z * Math.sin(a), z: n.x * Math.sin(a) + n.z * Math.cos(a) };
        const libre = PL.distanciaLibre(centro, dir, obstaculos, limites);
        for (let dist = 0.9; dist <= libre + 1e-9; dist += 0.05) {
          const x = centro.x + dir.x * dist, z = centro.z + dir.z * dist;
          if (!(x > limites.minX && x < limites.maxX && z > limites.minZ && z < limites.maxZ) || PL.chocaEn(obstaculos, x, z)) break;
          const v = { posX: x, posY: Math.max(yCamara, mira + 0.05, mira + SUBIDA * dist), posZ: z, targetX: centro.x, targetY: mira, targetZ: centro.z };
          if (ED.cuantoOcupa(v, 50, aspecto, esquinas) <= ED.BORDE_DEL_ENCUADRE) return giro;
        }
      }
    }
    return null;
  };
  const revisar = (quien, plano, code, cara, aspecto, limites) => {
    const m = plano.find((x) => x.code === code);
    const mueble = { cx: m.x, cz: m.z, w: m.w, d: m.d, h: m.h, rotY: m.rotY };
    const obstaculos = PL.murosDeCaminata(plano.filter((x) => x !== m));
    const e = ED.encuadreDeLaCara(mueble, cara, obstaculos, limites, 50, aspecto);
    const p = polar(e.vista);
    assert.ok(p <= Math.PI / 2.1 + 1e-9 && p >= Math.PI / 6 - 1e-9,
      `${quien}: la toma queda fuera del rango polar de los controles (${((p * 180) / Math.PI).toFixed(1)}°): la corrigen y la cara se sale`);
    if (e.toma === "tres_cuartos" && e.entera) {
      assert.equal(Math.abs(e.giro), menorGiroQueEntra(mueble, cara, obstaculos, limites, aspecto), `${quien}: el tres cuartos no es el de menor giro que la abarca`);
    }
    return e;
  };
  const limites = PL.limitesDePlanta(NAVE, 2.5, { minX: 0, maxX: 30, minZ: 0, maxZ: 42 });
  let girados = 0;
  for (const aspecto of [560 / 720, 521 / 700]) {
    for (const [code, cara] of [["GON-01", "A"], ["GON-01", "B"], ["GON-03", "A"], ["GON-02", "B"], ["PUN-01", "A"], ["CRO-01", "A"], ["GON-05", "B"]]) {
      if (revisar(`${code}·${cara} a ${aspecto.toFixed(2)}`, NAVE, code, cara, aspecto, limites).toma === "tres_cuartos") girados++;
    }
  }
  assert.ok(girados >= 4, `pocos casos en tres cuartos (${girados}): la referencia no prueba nada`);
  // Una góndola de 5 m frente a un pasillo de 2,5 m: el tres cuartos queda LEJOS (más de 5 m), donde la
  // subida mínima decide si los controles la dejan donde está.
  const larga = [f("GON-L", 20, 10, 5, 0.9, 1.8)];
  const salon = { minX: 0, maxX: 40, minZ: 10 - 0.45 - 2.5, maxZ: 10 + 0.45 + 2.5 };
  for (const cara of ["A", "B"]) {
    const e = revisar(`góndola de 5 m · ${cara}`, larga, "GON-L", cara, 560 / 720, salon);
    assert.ok(e.entera && e.toma === "tres_cuartos", `góndola de 5 m · ${cara}: no la abarca en tres cuartos (${e.toma}, ${e.ocupa.toFixed(2)})`);
    assert.ok(Math.hypot(e.vista.posX - e.vista.targetX, e.vista.posZ - e.vista.targetZ) > 5, `góndola de 5 m · ${cara}: la toma no quedó lejos (el caso no prueba la subida)`);
  }
});

console.log(`\n${hechas} pruebas de superficies en verde`);
