/**
 * Pruebas de src/utils/renumeracion.ts — la cuenta de la pantalla de renumerar.
 *   npm run probar:renumerar
 *
 * Lo que se prueba acá no es el cálculo de la renumeración —ése es del backend y
 * tiene sus propias 27 pruebas— sino la CUENTA con la que la pantalla afirma
 * delante del dueño que ningún mueble se agregó ni se borró. Es la única parte
 * del asunto que puede desmentir al servidor, así que tiene que fallar cuando el
 * servidor se equivoca, y sólo entonces.
 */
import assert from "node:assert/strict";
import { build } from "esbuild";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

const aqui = dirname(fileURLToPath(import.meta.url));
const salida = join(mkdtempSync(join(tmpdir(), "renum-")), "renum.mjs");
const { outputFiles } = await build({
  entryPoints: [join(aqui, "..", "src", "utils", "renumeracion.ts")],
  bundle: true, format: "esm", write: false, platform: "neutral",
});
writeFileSync(salida, outputFiles[0].text);
const R = await import(pathToFileURL(salida).href);

let hechas = 0;
const prueba = (n, fn) => {
  try { fn(); hechas++; console.log("  ok   " + n); }
  catch (e) { console.error("  FALLA " + n + "\n         " + e.message); process.exitCode = 1; }
};

// ─── Un plano de juguete con la forma del de verdad ─────────────────────────
//
// Tres góndolas en una corrida (banda 1) y dos puntas (banda 2), con los nombres
// corridos un lugar: renumerar es una ROTACIÓN pura, que es el caso que hace
// fallar cualquier escritura ingenua y el que de verdad pasa cuando alguien
// renumeró a mano una corrida cerrada.
const fila = (id, banda, antes, ahora, extra = {}) => ({
  id, tipo: "gondola", etiqueta: "Góndola Doble", banda,
  antes, se_leia: extra.se_leia ?? antes, ahora,
  codigo_antes: `NAVE-${antes}`, codigo_ahora: `NAVE-${ahora}`,
  cambia: antes !== ahora, cx: extra.cx ?? 4, cz: extra.cz ?? 3,
});

const sedeDe = (filas, extra = {}) => ({
  sede: "NAVE", eje_recorrido: "z", eje_bandas: "x",
  motivo_eje: "9 muebles alargados corren sobre Z y 3 sobre X: los pasillos van sobre Z",
  bandas: new Set(filas.map((f) => f.banda)).size,
  muebles: filas.length,
  cambian: filas.filter((f) => f.cambia).length,
  nomenclaturas_borradas: 0,
  filas,
  espacios: [], montajes: 0, avisos: [], texto: "",
  ...extra,
});

const PLANO = [
  fila("g1", 1, "GON-02", "GON-01", { cz: 3 }),
  fila("g2", 1, "GON-03", "GON-02", { cz: 7 }),
  fila("g3", 1, "GON-01", "GON-03", { cz: 11 }),
  fila("p1", 2, "PUN-02", "PUN-01", { cz: 1 }),
  fila("p2", 2, "PUN-01", "PUN-02", { cz: 13 }),
];
const IDS = PLANO.map((f) => f.id);

console.log("\nrenumerar · la promesa se cumple y se ve");

prueba("una rotación pura cierra: nada se agrega, nada se borra", () => {
  const c = R.contar(sedeDe(PLANO), IDS);
  assert.equal(c.enElPlano, 5);
  assert.equal(c.enElInforme, 5);
  assert.deepEqual(c.faltan, []);
  assert.deepEqual(c.sobran, []);
  assert.deepEqual(c.repetidos, []);
  assert.equal(c.cambian, 5);
  assert.equal(c.iguales, 0);
  assert.equal(c.ok, true);
});

prueba("«después» no se inventa mientras no se aplicó", () => {
  const c = R.contar(sedeDe(PLANO), IDS);
  assert.equal(c.despues, null, "un número acá diría que ya se aplicó");
  assert.deepEqual(c.perdidos, []);
  assert.deepEqual(c.aparecidos, []);
});

prueba("aplicado y con los mismos ids de vuelta: cierra por las tres fuentes", () => {
  const c = R.contar(sedeDe(PLANO), IDS, IDS);
  assert.equal(c.despues, 5);
  assert.deepEqual(c.perdidos, []);
  assert.deepEqual(c.aparecidos, []);
  assert.equal(c.ok, true);
});

prueba("los muebles que no cambian se cuentan aparte", () => {
  const filas = [...PLANO.slice(0, 3), fila("p1", 2, "PUN-01", "PUN-01")];
  const c = R.contar(sedeDe(filas), ["g1", "g2", "g3", "p1"]);
  assert.equal(c.cambian, 3);
  assert.equal(c.iguales, 1);
  assert.equal(c.ok, true);
});

prueba("un plano vacío no rompe nada", () => {
  const c = R.contar(sedeDe([]), []);
  assert.equal(c.enElPlano, 0);
  assert.equal(c.enElInforme, 0);
  assert.equal(c.comparable, true);
  assert.equal(c.ok, true);
});

console.log("\nrenumerar · la cuenta desmiente al servidor cuando hace falta");

prueba("si el informe PIERDE un mueble, se ve y se nombra", () => {
  // El servidor lista cuatro renglones para un plano de cinco: eso es un mueble
  // que se borraría sin que nadie lo pida. Es justo lo que la promesa prohíbe.
  const c = R.contar(sedeDe(PLANO.slice(0, 4)), IDS);
  assert.deepEqual(c.faltan, ["p2"]);
  assert.equal(c.enElPlano, 5);
  assert.equal(c.enElInforme, 4);
  assert.equal(c.ok, false);
});

prueba("si el informe INVENTA un mueble, también", () => {
  const filas = [...PLANO, fila("fantasma", 2, "GON-99", "GON-04")];
  const c = R.contar(sedeDe(filas), IDS);
  assert.deepEqual(c.sobran, ["fantasma"]);
  assert.equal(c.ok, false);
});

prueba("un mueble que desaparece DESPUÉS de aplicar es la falla más grave", () => {
  const c = R.contar(sedeDe(PLANO), IDS, ["g1", "g2", "g3", "p1"]);
  assert.deepEqual(c.perdidos, ["p2"]);
  assert.equal(c.despues, 4);
  assert.equal(c.ok, false);
});

prueba("y uno que aparece de la nada, igual", () => {
  const c = R.contar(sedeDe(PLANO), IDS, [...IDS, "colado"]);
  assert.deepEqual(c.aparecidos, ["colado"]);
  assert.equal(c.ok, false);
});

prueba("dos muebles que quedarían con el mismo nombre no pasan", () => {
  // Es el error que toda la fase 13 viene a matar: si la renumeración lo
  // produjera, la pantalla tiene que decirlo antes de que se aplique.
  const filas = [...PLANO.slice(0, 4), fila("p2", 2, "PUN-01", "PUN-01")];
  filas[3] = fila("p1", 2, "PUN-02", "PUN-01");
  const c = R.contar(sedeDe(filas), IDS);
  assert.deepEqual(c.repetidos, ["PUN-01"]);
  assert.equal(c.ok, false);
});

prueba("el nombre repetido se detecta sin importar mayúsculas", () => {
  // `imp-08` y `IMP-08` son el mismo espacio en todas las comparaciones del
  // sistema; si acá no lo fueran, la pantalla daría por buena una colisión.
  const filas = [fila("a", 1, "IMP-07", "IMP-08"), fila("b", 1, "IMP-09", "imp-08")];
  const c = R.contar(sedeDe(filas), ["a", "b"]);
  assert.deepEqual(c.repetidos, ["IMP-08"]);
  assert.equal(c.ok, false);
});

console.log("\nrenumerar · lo que NO se puede afirmar, no se afirma");

prueba("sin plano local no se grita «se borran 5»: se dice que no se pudo comparar", () => {
  const c = R.contar(sedeDe(PLANO), []);
  assert.equal(c.comparable, false);
  assert.deepEqual(c.faltan, []);
  assert.deepEqual(c.sobran, []);
  assert.equal(c.ok, true, "no hay nada roto: hay algo que no se pudo mirar");
});

prueba("sin plano local, un nombre repetido SIGUE siendo un error", () => {
  const filas = [fila("a", 1, "IMP-07", "IMP-08"), fila("b", 1, "IMP-09", "IMP-08")];
  const c = R.contar(sedeDe(filas), []);
  assert.equal(c.comparable, false);
  assert.equal(c.ok, false, "eso se puede afirmar mirando sólo el informe");
});

prueba("ids repetidos en el plano local no inflan la cuenta", () => {
  const c = R.contar(sedeDe(PLANO), [...IDS, "g1", "g1"]);
  assert.equal(c.enElPlano, 5);
  assert.equal(c.ok, true);
});

console.log("\nrenumerar · el total de todas las sedes");

const informeDe = (...sedes) => ({
  aplicado: false, sedes,
  muebles: sedes.reduce((n, s) => n + s.muebles, 0),
  cambian: sedes.reduce((n, s) => n + s.cambian, 0),
});

prueba("el total suma las sedes", () => {
  const otra = { ...sedeDe([fila("x1", 1, "CAJ-02", "CAJ-01")]), sede: "POBLADO" };
  const t = R.contarTodo(informeDe(sedeDe(PLANO), otra), { NAVE: IDS, POBLADO: ["x1"] });
  assert.equal(t.enElPlano, 6);
  assert.equal(t.enElInforme, 6);
  assert.equal(t.cambian, 6);
  assert.equal(t.ok, true);
});

prueba("una sola sede rota vuelve rojo el total, y el id dice de qué sede es", () => {
  // Sin la sede adelante, «falta p2» no dice a qué tienda ir a mirar — y dos
  // sedes pueden tener un `p2` cada una.
  const otra = { ...sedeDe([fila("x1", 1, "CAJ-02", "CAJ-01")]), sede: "POBLADO" };
  const t = R.contarTodo(informeDe(sedeDe(PLANO.slice(0, 4)), otra), { NAVE: IDS, POBLADO: ["x1"] });
  assert.deepEqual(t.faltan, ["NAVE·p2"]);
  assert.equal(t.ok, false);
});

prueba("un mueble de más en una sede no tapa uno de menos en otra", () => {
  const otra = {
    ...sedeDe([fila("x1", 1, "CAJ-02", "CAJ-01"), fila("x2", 1, "CAJ-03", "CAJ-02")]),
    sede: "POBLADO",
  };
  const t = R.contarTodo(informeDe(sedeDe(PLANO.slice(0, 4)), otra), { NAVE: IDS, POBLADO: ["x1"] });
  assert.equal(t.enElPlano, 6);
  assert.equal(t.enElInforme, 6, "los largos coinciden y aun así falta uno y sobra otro");
  assert.deepEqual(t.faltan, ["NAVE·p2"]);
  assert.deepEqual(t.sobran, ["POBLADO·x2"]);
  assert.equal(t.ok, false);
});

prueba("el total no dice «después» mientras no se aplicó", () => {
  const t = R.contarTodo(informeDe(sedeDe(PLANO)), { NAVE: IDS });
  assert.equal(t.despues, null);
});

prueba("aplicado, el total suma los «después» de cada sede", () => {
  const otra = { ...sedeDe([fila("x1", 1, "CAJ-02", "CAJ-01")]), sede: "POBLADO" };
  const t = R.contarTodo(
    informeDe(sedeDe(PLANO), otra),
    { NAVE: IDS, POBLADO: ["x1"] },
    { NAVE: IDS, POBLADO: ["x1"] },
  );
  assert.equal(t.despues, 6);
  assert.equal(t.ok, true);
});

prueba("una sede sin plano local vuelve incomparable el total entero", () => {
  const otra = { ...sedeDe([fila("x1", 1, "CAJ-02", "CAJ-01")]), sede: "POBLADO" };
  const t = R.contarTodo(informeDe(sedeDe(PLANO), otra), { NAVE: IDS });
  assert.equal(t.comparable, false, "sumar los ceros de POBLADO daría un total que parece bueno");
});

console.log("\nrenumerar · el papel se puede seguir con el dedo");

prueba("las bandas agrupan en el orden en que se camina", () => {
  const bandas = R.porBanda(sedeDe(PLANO));
  assert.equal(bandas.length, 2);
  assert.deepEqual(bandas.map((b) => b.banda), [1, 2]);
  assert.deepEqual(bandas[0].filas.map((f) => f.id), ["g1", "g2", "g3"]);
  assert.deepEqual(bandas[1].filas.map((f) => f.id), ["p1", "p2"]);
});

prueba("cada banda dice cuántos de los suyos cambian", () => {
  const filas = [
    fila("g1", 1, "GON-01", "GON-01"),
    fila("g2", 1, "GON-03", "GON-02"),
    fila("p1", 2, "PUN-02", "PUN-01"),
  ];
  const bandas = R.porBanda(sedeDe(filas));
  assert.equal(bandas[0].cambian, 1);
  assert.equal(bandas[1].cambian, 1);
});

prueba("una banda que vuelve a aparecer NO se fusiona con la primera", () => {
  // El orden de la tabla es el del recorrido, no el del número de banda: unir
  // dos tramos separados movería un renglón de lugar y el papel dejaría de
  // coincidir con lo que se camina.
  const filas = [
    fila("a", 1, "GON-01", "GON-01"),
    fila("b", 2, "GON-02", "GON-02"),
    fila("c", 1, "GON-03", "GON-03"),
  ];
  const bandas = R.porBanda(sedeDe(filas));
  assert.deepEqual(bandas.map((b) => b.banda), [1, 2, 1]);
});

prueba("el recorrido se dice en palabras, con el plural puesto", () => {
  assert.match(R.textoDelRecorrido(sedeDe(PLANO)), /^2 bandas sobre X, y dentro de cada banda de menor a mayor Z\.$/);
  const una = { ...sedeDe(PLANO), bandas: 1 };
  assert.match(R.textoDelRecorrido(una), /^1 banda sobre X/);
});

console.log("\nrenumerar · qué se va a escribir, dicho antes de apretar");

prueba("los contratos que viajan con los espacios se suman", () => {
  const s = sedeDe(PLANO, {
    espacios: [
      { space_id: 1, antes: "NAVE-GON-02", ahora: "NAVE-GON-01", svg_antes: "", svg_ahora: "", contratos: 2 },
      { space_id: 2, antes: "NAVE-GON-03", ahora: "NAVE-GON-02", svg_antes: "", svg_ahora: "", contratos: 0 },
    ],
  });
  assert.equal(R.contratosEnJuego(s), 2);
});

prueba("sin nada que cambiar se dice eso y no un cero disfrazado", () => {
  const filas = PLANO.map((f) => fila(f.id, f.banda, f.antes, f.antes));
  const texto = R.resumenDeLoQueSeEscribe(informeDe(sedeDe(filas)));
  assert.match(texto, /No hay nada que renumerar/);
});

prueba("el resumen nombra las sedes, los espacios, los contratos y los montajes", () => {
  const s = sedeDe(PLANO, {
    espacios: [{ space_id: 1, antes: "a", ahora: "b", svg_antes: "", svg_ahora: "", contratos: 3 }],
    montajes: 2,
  });
  const texto = R.resumenDeLoQueSeEscribe(informeDe(s));
  assert.match(texto, /5 de 5 muebles cambian de nombre/);
  assert.match(texto, /en 1 sede/);
  assert.match(texto, /1 espacio se muda con su mueble \(3 contratos vigentes encima\)/);
  assert.match(texto, /2 confirmaciones de montaje/);
});

prueba("una sede sin cambios no se cuenta en «en N sedes»", () => {
  const quieta = {
    ...sedeDe(PLANO.map((f) => fila(f.id, f.banda, f.antes, f.antes))),
    sede: "POBLADO",
  };
  const texto = R.resumenDeLoQueSeEscribe(informeDe(sedeDe(PLANO), quieta));
  assert.match(texto, /en 1 sede/);
});

console.log(`\n${hechas} pruebas`);
