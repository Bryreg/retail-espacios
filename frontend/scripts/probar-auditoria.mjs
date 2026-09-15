/**
 * Pruebas de src/utils/auditoriaDesfase.ts — el fantasma, visto desde el navegador.
 *   npm run probar:auditoria
 *
 * Contesta la pregunta del reporte original —«no me deja alquilar la IMP-17 que
 * está libre, el sistema la toma como ocupada»— sin consola, sin credenciales y
 * sin plan pago: el store ya bajó TODOS los planos y el mapa comercial entero,
 * porque los necesita para pintar. La auditoría es una resta entre dos cosas que
 * ya están en memoria.
 *
 * Lo que fijan estas pruebas es lo que no se puede romper sin que el fantasma
 * vuelva a ser invisible:
 *
 *  · Un mueble es único por SEDE + CÓDIGO. Casi todas las tiendas tienen un
 *    IMP-17; buscar por código solo diría «existe» señalando el de otra tienda.
 *  · Las tres puertas son un espacio MENOS: borrar el mueble, pasar la góndola
 *    de doble a simple —desaparece la cara B— y marcarlo no comercializable.
 *  · Y la mitad que se olvida: un auditor que grita siempre se deja de leer.
 *
 * `espaciosOfrecidos` es espejo de `espacios_ofrecidos` en
 * `backend/app/services/layout_lookup.py`. Si las dos se separan, el aviso de la
 * pantalla y el guardarraíl del servidor dejan de hablar del mismo conjunto.
 */
import assert from "node:assert/strict";
import { build } from "esbuild";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

const aqui = dirname(fileURLToPath(import.meta.url));
const salida = join(mkdtempSync(join(tmpdir(), "aud-")), "a.mjs");
const { outputFiles } = await build({
  entryPoints: [join(aqui, "..", "src", "utils", "auditoriaDesfase.ts")],
  bundle: true, format: "esm", write: false, platform: "neutral",
});
writeFileSync(salida, outputFiles[0].text);
const { contratosSinMueble } = await import(pathToFileURL(salida).href);

let hechas = 0;
const prueba = (n, fn) => {
  try { fn(); hechas++; console.log("  ok   " + n); }
  catch (e) { console.error("  FALLA " + n + "\n         " + e.message); process.exitCode = 1; }
};

const mueble = (code, extra = {}) => ({
  id: `f-${code}`, code, label: code, type: "punta", w: 1, h: 1, d: 1, ...extra,
});

const vendido = (extra = {}) => ({
  status: "occupied", supplierName: "Colgate", brandCategory: "Aseo",
  negotiatedValue: 1_000_000, startDate: "2026-09-01", endDate: "2026-10-01",
  observation: "", ...extra,
});

/** Dos tiendas con un IMP-17 cada una: la situación real que rompía todo. */
const dosSedes = () => ({
  "CIUDAD JARDIN": [mueble("IMP-17"), mueble("IMP-18")],
  "NAVE": [mueble("IMP-17"), mueble("PUN-15")],
});

console.log("\nLa auditoría de desfase, en la pantalla\n");

prueba("un plano al día no reporta nada", () => {
  // La mitad que se olvida: un auditor que grita siempre se deja de leer.
  assert.deepEqual(
    contratosSinMueble(dosSedes(), {
      "NAVE-IMP-17": vendido(), "CIUDAD JARDIN-IMP-18": vendido(),
    }),
    [],
  );
});

prueba("BORRAR EL MUEBLE deja el contrato a la vista", () => {
  // El plano ya no tiene el PUN-01; la base sigue teniendo su contrato.
  const r = contratosSinMueble(dosSedes(), { "NAVE-PUN-01": vendido() });
  assert.equal(r.length, 1);
  assert.equal(r[0].espacio, "NAVE-PUN-01");
  assert.equal(r[0].sede, "NAVE");
  assert.equal(r[0].code, "PUN-01");
  assert.equal(r[0].supplierName, "Colgate");
  assert.equal(r[0].endDate, "2026-10-01");
});

prueba("LA CARA B QUE DESAPARECE también", () => {
  // Una góndola simple no ofrece cara B: pasarla de doble a simple borra un
  // espacio vendible entero sin que nadie borre un mueble.
  const simple = { "NAVE": [mueble("GON-60")] };
  assert.equal(contratosSinMueble(simple, { "NAVE-GON-60-B": vendido() }).length, 1);
});

prueba("y una góndola doble SÍ ofrece las dos caras", () => {
  const doble = { "NAVE": [mueble("GON-60", { gondolaType: "double" })] };
  assert.deepEqual(
    contratosSinMueble(doble, { "NAVE-GON-60": vendido(), "NAVE-GON-60-B": vendido() }),
    [],
  );
});

prueba("gondola_doble por tipo cuenta igual", () => {
  const doble = { "NAVE": [mueble("GON-60", { type: "gondola_doble" })] };
  assert.deepEqual(contratosSinMueble(doble, { "NAVE-GON-60-B": vendido() }), []);
});

prueba("MARCARLO NO COMERCIALIZABLE lo saca de la venta y se ve", () => {
  const planos = { "NAVE": [mueble("IMP-17", { rentable: false })] };
  const r = contratosSinMueble(planos, { "NAVE-IMP-17": vendido() });
  assert.equal(r.length, 1, "un mueble no comercializable no ofrece su espacio");
});

prueba("un tipo que NUNCA se alquila tampoco ofrece", () => {
  // La caja registradora es puesto de trabajo de la tienda, no espacio vendible.
  const planos = { "NAVE": [mueble("CAJ-01", { type: "checkout" })] };
  assert.equal(contratosSinMueble(planos, { "NAVE-CAJ-01": vendido() }).length, 1);
});

prueba("EL IMP-17 DE LA OTRA TIENDA NO LO TAPA", () => {
  // El bug entero en una línea: `PUN-15` existe en NAVE, no en CIUDAD JARDIN.
  const r = contratosSinMueble(dosSedes(), { "CIUDAD JARDIN-PUN-15": vendido() });
  assert.equal(r.length, 1);
  assert.equal(r[0].sede, "CIUDAD JARDIN");
  assert.equal(r[0].code, "PUN-15");
});

prueba("la grafía de la sede no inventa un fantasma", () => {
  // El store conserva la sede como se cargó: «Nave», no «NAVE».
  const planos = { "Ciudad Jardin": [mueble("IMP-17")] };
  assert.deepEqual(contratosSinMueble(planos, { "CIUDAD JARDIN-IMP-17": vendido() }), []);
});

prueba("el mueble con sede propia ofrece para SU sede", () => {
  // Un plano copiado de otra tienda dibuja muebles que no son de la abierta.
  const planos = { "CIUDAD JARDIN": [mueble("PUN-15", { sede: "NAVE" })] };
  assert.deepEqual(contratosSinMueble(planos, { "NAVE-PUN-15": vendido() }), []);
  assert.equal(contratosSinMueble(planos, { "CIUDAD JARDIN-PUN-15": vendido() }).length, 1);
});

prueba("un código que ya trae la sede adentro no se prefija dos veces", () => {
  // El editor 3D los genera así.
  const planos = { "NAVE": [mueble("NAVE-IMP-17")] };
  assert.deepEqual(contratosSinMueble(planos, { "NAVE-IMP-17": vendido() }), []);
});

prueba("gana el prefijo de sede MÁS LARGO", () => {
  // Con «NAVE» y «NAVE 2» cargadas, el código de la segunda no se puede leer
  // como el de la primera.
  const planos = { "NAVE": [mueble("IMP-17")], "NAVE 2": [mueble("IMP-99")] };
  const r = contratosSinMueble(planos, { "NAVE 2-PUN-01": vendido() });
  assert.equal(r[0].sede, "NAVE 2");
  assert.equal(r[0].code, "PUN-01");
});

prueba("RESERVADO Y MANTENIMIENTO NO SON FANTASMAS", () => {
  // Los pone una persona a propósito y no tienen contrato detrás: que no haya
  // mueble es raro, pero no es plata en el aire, y mezclarlos apaga el aviso.
  const r = contratosSinMueble(dosSedes(), {
    "NAVE-ZZZ-01": { ...vendido(), status: "maintenance" },
    "NAVE-ZZZ-02": { ...vendido(), status: "reserved" },
    "NAVE-ZZZ-03": { ...vendido(), status: "free" },
  });
  assert.deepEqual(r, []);
});

prueba("se ordenan por sede y después por código", () => {
  const r = contratosSinMueble(dosSedes(), {
    "NAVE-ZZZ-01": vendido(), "NAVE-AAA-02": vendido(),
    "CIUDAD JARDIN-MMM-03": vendido(),
  });
  assert.deepEqual(r.map((x) => x.espacio), [
    "CIUDAD JARDIN-MMM-03", "NAVE-AAA-02", "NAVE-ZZZ-01",
  ]);
});

prueba("un espacio de una sede que el store no conoce se reporta igual", () => {
  // Sin plano no hay dónde verlo: es el caso más fuerte, no el más débil.
  const r = contratosSinMueble(dosSedes(), { "TERRON-IMP-17": vendido() });
  assert.equal(r.length, 1);
  assert.equal(r[0].sede, "", "no se inventa una sede que no está cargada");
  assert.equal(r[0].code, "TERRON-IMP-17");
});

prueba("un mapa vacío no reporta nada", () => {
  assert.deepEqual(contratosSinMueble(dosSedes(), {}), []);
});

prueba("un plano que no es un arreglo no rompe la cuenta", () => {
  const planos = { "NAVE": null, "CIUDAD JARDIN": [mueble("IMP-17")] };
  const r = contratosSinMueble(planos, {
    "NAVE-IMP-17": vendido(), "CIUDAD JARDIN-IMP-17": vendido(),
  });
  assert.deepEqual(r.map((x) => x.espacio), ["NAVE-IMP-17"]);
});

prueba("la plata viaja tal como la mandó el servidor", () => {
  // Para un mercaderista el servidor manda 0, y acá no se inventa nada.
  const r = contratosSinMueble(dosSedes(), {
    "NAVE-PUN-01": vendido({ negotiatedValue: 0 }),
  });
  assert.equal(r[0].negotiatedValue, 0);
});

// ─── El espejo con el servidor ───────────────────────────────────────────────

/* `espaciosOfrecidos` acá y `espacios_ofrecidos` en el servidor tienen que
   contestar lo mismo: el primero decide qué se AVISA en la pantalla y el
   segundo qué se FRENA al guardar. Si se separan, el aviso y el guardarraíl
   dejan de hablar del mismo conjunto — y la forma en que eso se nota es la
   peor: alguien borra un mueble, el servidor lo deja pasar porque cree que su
   espacio ya no se ofrecía, y el contrato se vuelve invisible.

   No se puede correr el Python desde acá, así que se afirma que las tres
   decisiones siguen escritas en los dos lados. Es poco, y es más que nada. */
import { readFileSync } from "node:fs";
const servidor = readFileSync(
  join(aqui, "..", "..", "backend", "app", "services", "layout_lookup.py"), "utf8",
);

prueba("el servidor sigue saltándose lo no comercializable", () => {
  const m = servidor.match(/def espacios_ofrecidos[\s\S]*?\n    return ofrecidos/);
  assert.ok(m, "no se encontró `espacios_ofrecidos` en el servidor");
  assert.match(m[0], /es_comercializable\(fixture\)/,
    "el servidor dejó de mirar si el mueble se alquila: un mueble marcado no " +
    "comercializable volvería a poder sacarse del plano con un contrato vivo");
});

prueba("el servidor sigue contando la cara B como un espacio aparte", () => {
  const m = servidor.match(/def espacios_ofrecidos[\s\S]*?\n    return ofrecidos/);
  assert.match(m[0], /gondolaType"\) == "double" or fixture\.get\("type"\) == "gondola_doble"/,
    "el servidor dejó de reconocer la góndola doble");
  assert.match(m[0], /f"\{completo\}-B"/, "el servidor dejó de ofrecer la cara B");
});

prueba("el servidor sigue armando el código con la sede", () => {
  const m = servidor.match(/def espacios_ofrecidos[\s\S]*?\n    return ofrecidos/);
  assert.match(m[0], /_full_code\(code, sede\)/,
    "el servidor dejó de usar `_full_code`: indexar por el código corto mezcla " +
    "tiendas, que es el bug original");
});

console.log(`\n${hechas} pruebas · el fantasma tiene nombre\n`);
