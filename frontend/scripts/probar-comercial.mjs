/**
 * Pruebas de src/utils/estadoComercial.ts — la base pinta el plano.
 *   npm run probar:comercial
 *
 * El plano guarda lo que ES el mueble y la base lo que se le VENDIÓ. Durante
 * mucho tiempo las dos cosas vivieron en el mismo JSON: el mismo hecho escrito
 * dos veces, sin nada que las obligara a coincidir. Se rompía siempre igual —
 * «el espacio está libre y el sistema dice que está ocupado»— porque el plano
 * NUNCA le escribió a la base, y el parche que las emparejaba lo hacía el
 * navegador: si esa pestaña se cerraba antes de guardar, el desfase quedaba.
 *
 * Desde el corte hay una sola verdad y esta función es la que la aplica. Lo que
 * fijan estas pruebas es lo que no se puede romper sin que vuelvan los
 * fantasmas:
 *
 *  · Lo que no está en el mapa está LIBRE. La fusión REEMPLAZA, no rellena: si
 *    rellenara, un contrato cancelado seguiría pintado desde la copia vieja de
 *    `localStorage` hasta que alguien recargara.
 *  · Un mueble es único por SEDE + CÓDIGO. Casi todas las tiendas tienen un
 *    IMP-17; confundirlos fue exactamente el bug que se reportó.
 *  · Si nada cambió, devuelve lo mismo. El store refusiona cada 20 segundos.
 */
import assert from "node:assert/strict";
import { build } from "esbuild";
import * as esbuildMod from "esbuild";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

const aqui = dirname(fileURLToPath(import.meta.url));
const salida = join(mkdtempSync(join(tmpdir(), "com-")), "c.mjs");
const { outputFiles } = await build({
  entryPoints: [join(aqui, "..", "src", "utils", "estadoComercial.ts")],
  bundle: true, format: "esm", write: false, platform: "neutral",
});
writeFileSync(salida, outputFiles[0].text);
const { fusionarEstadoComercial, LIBRE } = await import(pathToFileURL(salida).href);

let hechas = 0;
const prueba = (n, fn) => {
  try { fn(); hechas++; console.log("  ok   " + n); }
  catch (e) { console.error("  FALLA " + n + "\n         " + e.message); process.exitCode = 1; }
};

/** Un mueble tal como lo devuelve el servidor DESPUÉS del corte: sin una sola
 *  palabra de lo comercial. Así llega hoy de `GET /api/layout`. */
const mueble = (code, extra = {}) => ({
  id: `f-${code}`, code, label: code, type: "cross", w: 1, h: 1, d: 1, ...extra,
});

const vendido = (extra = {}) => ({
  status: "occupied", supplierName: "Colgate", brandCategory: "Aseo",
  negotiatedValue: 1_000_000, startDate: "2026-09-01", endDate: "2026-10-01",
  observation: "", ...extra,
});

console.log("\nLa base pinta el plano\n");

prueba("un espacio sin fila en la base queda LIBRE", () => {
  const [f] = fusionarEstadoComercial("NAVE", [mueble("IMP-17")], {});
  assert.equal(f.status, "free");
  assert.equal(f.supplierName, "");
  assert.equal(f.negotiatedValue, 0);
});

prueba("un espacio vendido recibe todo lo que el plano dibujaba", () => {
  const [f] = fusionarEstadoComercial(
    "NAVE", [mueble("IMP-17")], { "NAVE-IMP-17": vendido() },
  );
  assert.equal(f.status, "occupied");
  assert.equal(f.supplierName, "Colgate");
  assert.equal(f.brandCategory, "Aseo");
  assert.equal(f.negotiatedValue, 1_000_000);
  assert.equal(f.startDate, "2026-09-01");
  assert.equal(f.endDate, "2026-10-01");
  // Lo que es del plano no se toca.
  assert.equal(f.label, "IMP-17");
  assert.equal(f.w, 1);
});

prueba("EL CONTRATO CANCELADO SE BORRA: la fusión reemplaza, no rellena", () => {
  // Esto es el fantasma. La copia de `localStorage` todavía trae el contrato
  // porque se guardó antes de cancelarlo; la base ya no tiene la fila.
  const viejo = mueble("IMP-17", vendido());
  const [f] = fusionarEstadoComercial("NAVE", [viejo], {});
  assert.equal(f.status, "free");
  assert.equal(f.supplierName, "");
  assert.equal(f.endDate, "");
  assert.equal(f.negotiatedValue, 0);
});

prueba("UN IMP-17 POR TIENDA: el contrato se pinta en SU sede", () => {
  const estado = { "NAVE-IMP-17": vendido() };
  const [cj] = fusionarEstadoComercial("CIUDAD JARDIN", [mueble("IMP-17")], estado);
  const [nv] = fusionarEstadoComercial("NAVE", [mueble("IMP-17")], estado);
  assert.equal(cj.status, "free", "el de la otra tienda NO se pinta");
  assert.equal(nv.status, "occupied");
});

prueba("la sede propia del mueble le gana a la sede abierta", () => {
  // Un plano puede traer muebles de otra tienda (una propuesta copiada).
  const f = mueble("IMP-17", { sede: "NAVE" });
  const [salida] = fusionarEstadoComercial(
    "CIUDAD JARDIN", [f], { "NAVE-IMP-17": vendido() },
  );
  assert.equal(salida.status, "occupied");
});

prueba("un código que YA trae la sede adentro no se prefija dos veces", () => {
  // El editor 3D genera códigos con la sede puesta. Misma guarda que
  // `_full_code` en el servidor.
  const [f] = fusionarEstadoComercial(
    "NAVE", [mueble("NAVE-IMP-17")], { "NAVE-IMP-17": vendido() },
  );
  assert.equal(f.status, "occupied");
});

prueba("el código pelado sirve de respaldo", () => {
  const [f] = fusionarEstadoComercial("NAVE", [mueble("IMP-17")], { "IMP-17": vendido() });
  assert.equal(f.status, "occupied");
});

prueba("minúsculas y espacios no esconden un contrato", () => {
  const [f] = fusionarEstadoComercial(
    " nave ", [mueble(" imp-17 ")], { "NAVE-IMP-17": vendido() },
  );
  assert.equal(f.status, "occupied");
});

prueba("LA CARA B ES UN ESPACIO APARTE: se vende sola", () => {
  const g = mueble("GON-60", { type: "gondola", gondolaType: "double" });
  const [f] = fusionarEstadoComercial("NAVE", [g], {
    "NAVE-GON-60-B": vendido({ supplierName: "Fabuloso" }),
  });
  assert.equal(f.status, "free", "la cara A sigue libre");
  assert.equal(f.faceB.status, "occupied");
  assert.equal(f.faceB.supplierName, "Fabuloso");
});

prueba("la cara B conserva lo que NO es comercial", () => {
  const g = mueble("GON-60", {
    type: "gondola", gondolaType: "double",
    faceB: { montajeEstado: "montado", montajeFoto: "b.jpg" },
  });
  const [f] = fusionarEstadoComercial("NAVE", [g], { "NAVE-GON-60-B": vendido() });
  assert.equal(f.faceB.montajeEstado, "montado");
  assert.equal(f.faceB.montajeFoto, "b.jpg");
  assert.equal(f.faceB.supplierName, "Colgate");
});

prueba("una góndola simple no inventa una cara B", () => {
  const [f] = fusionarEstadoComercial("NAVE", [mueble("GON-60")], {
    "NAVE-GON-60-B": vendido(),
  });
  assert.equal(f.faceB, undefined);
});

prueba("una góndola SIN `gondolaType` también tiene cara B: la pinta vendida", () => {
  // La regla es UNA (`carasDe`): Vender ofrece la cara B de una góndola vieja
  // sin el campo, así que la fusión tiene que pintarla cuando se vende. Con la
  // regla estricta de antes, el contrato existía y el plano la dejaba libre.
  const g = mueble("GON-60", { type: "gondola" });
  const [f] = fusionarEstadoComercial("NAVE", [g], { "NAVE-GON-60-B": vendido() });
  assert.equal(f.faceB.status, "occupied");
});

prueba("una góndola MURAL no tiene cara B", () => {
  const g = mueble("GON-60", { type: "gondola", gondolaType: "wall" });
  const [f] = fusionarEstadoComercial("NAVE", [g], { "NAVE-GON-60-B": vendido() });
  assert.equal(f.faceB, undefined);
});

prueba("gondola_doble por tipo también tiene cara B", () => {
  const g = mueble("GON-60", { type: "gondola_doble" });
  const [f] = fusionarEstadoComercial("NAVE", [g], { "NAVE-GON-60-B": vendido() });
  assert.equal(f.faceB.status, "occupied");
});

prueba("una cara B cancelada se limpia sin borrar el montaje", () => {
  const g = mueble("GON-60", {
    type: "gondola", gondolaType: "double",
    faceB: { ...vendido(), montajeEstado: "montado" },
  });
  const [f] = fusionarEstadoComercial("NAVE", [g], {});
  assert.equal(f.faceB.status, "free");
  assert.equal(f.faceB.supplierName, "");
  assert.equal(f.faceB.montajeEstado, "montado");
});

prueba("SI NADA CAMBIÓ DEVUELVE EL MISMO ARREGLO, no una copia", () => {
  // El store refusiona en cada vuelta del poll. Sin esto, cada 20 segundos se
  // redibuja el plano entero y la sede queda marcada como modificada.
  const entrada = [mueble("IMP-17", vendido()), mueble("IMP-18", LIBRE)];
  const salida = fusionarEstadoComercial("NAVE", entrada, { "NAVE-IMP-17": vendido() });
  assert.equal(salida, entrada);
});

prueba("UN PLANO RECIÉN CORTADO ESTRENA LOS SIETE CAMPOS", () => {
  // El servidor devuelve el plano sin una palabra de lo comercial. Dejarlo así
  // no sirve: `isSellableToday` pregunta `status !== "free"` y con `undefined`
  // entra por la rama del contrato y declara INVENDIBLE un espacio libre. La
  // primera fusión los escribe todos; a partir de ahí no vuelve a tocar nada.
  const entrada = [mueble("IMP-17")];
  const primera = fusionarEstadoComercial("NAVE", entrada, {});
  assert.notEqual(primera, entrada);
  assert.equal(primera[0].status, "free");
  assert.equal(fusionarEstadoComercial("NAVE", primera, {}), primera);
});

prueba("el mueble que no cambió conserva su identidad", () => {
  const quieto = mueble("IMP-18", LIBRE);
  const entrada = [mueble("IMP-17"), quieto];
  const salida = fusionarEstadoComercial("NAVE", entrada, { "NAVE-IMP-17": vendido() });
  assert.notEqual(salida, entrada);
  assert.equal(salida[1], quieto);
  assert.notEqual(salida[0], entrada[0]);
});

prueba("una góndola doble estrena su cara B aunque nadie la haya vendido", () => {
  // Misma razón: sin `faceB.status` la cara B se lee como invendible.
  const primera = fusionarEstadoComercial(
    "NAVE", [mueble("GON-60", { type: "gondola", gondolaType: "double" })], {},
  );
  assert.equal(primera[0].faceB.status, "free");
  assert.equal(fusionarEstadoComercial("NAVE", primera, {}), primera);
});

prueba("un mueble sin código queda libre y no explota", () => {
  const [f] = fusionarEstadoComercial("NAVE", [mueble("")], { "NAVE-": vendido() });
  assert.equal(f.status, "free");
});

prueba("LIBRE es el estado completo, sin campos sueltos", () => {
  assert.deepEqual(Object.keys(LIBRE).sort(), [
    "brandCategory", "endDate", "negotiatedValue", "observation",
    "startDate", "status", "supplierName",
  ]);
});

prueba("un plano vacío devuelve un plano vacío", () => {
  const entrada = [];
  assert.equal(fusionarEstadoComercial("NAVE", entrada, { "NAVE-X": vendido() }), entrada);
});

/* ── Las participaciones de cara (§4.8, §9.9, §10.8, §11) ────────────────────
   Un contrato de participación (`NAVE-GON-01-PC3`) es un espacio más de
   `/spaces/comercial`: la fusión NUNCA pinta la cara con él (busca por código
   exacto), Supervisar lo cuelga de su cara sólo para quien administra, y el
   color y la palabra de la cara salen de la ocupación anónima. Los bloques de
   participaciones de Supervisar (tarjetas, ficha, tabla) llevan proveedores y
   marcas de todos: se montan SÓLO con `isAdmin`. */
console.log("\nLas participaciones de cara\n");

const { readFileSync } = await import("node:fs");
const raiz = join(aqui, "..");
const fuenteDe = (rel) => readFileSync(join(raiz, "src", ...rel.split("/")), "utf8");
const sinComent = (t) => t.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
const salidaPc = join(mkdtempSync(join(tmpdir(), "com-pc-")), "pc.mjs");
{
  const r = await build({
    stdin: {
      contents: [
        'export * from "./src/utils/partes.ts";',
        'export * as R from "./src/utils/revisarParticipaciones.ts";',
      ].join("\n"),
      resolveDir: raiz, loader: "ts",
    },
    bundle: true, format: "esm", write: false, platform: "neutral", logLevel: "silent",
  });
  writeFileSync(salidaPc, r.outputFiles[0].text);
}
const PC = await import(pathToFileURL(salidaPc).href);
const R = PC.R;

const porPc = (code, extra = {}) => mueble(code, { type: "gondola", gondolaType: "double", partes: { division: "participacion" }, ...extra });

prueba("UN CONTRATO DE PARTICIPACIÓN NO PINTA LA CARA: ni la A ni la B quedan ocupadas por un `…-PC`", () => {
  const [f] = fusionarEstadoComercial("NAVE", [porPc("GON-01")], {
    "NAVE-GON-01-PC1": vendido({ supplierName: "Postobón" }),
    "NAVE-GON-01-B-PC2": vendido({ supplierName: "Alpina" }),
  });
  assert.equal(f.status, "free", "la cara A se pintó con un contrato de participación");
  assert.equal(f.supplierName, "", "la cara A tomó el proveedor de una participación");
  assert.equal(f.faceB.status, "free", "la cara B se pintó con un contrato de participación");
  assert.equal(f.faceB.supplierName, "");
});

prueba("el contrato de participación cuelga de SU cara en el índice de partes (lo que lee Supervisar)", () => {
  const estado = { "NAVE-GON-01-PC1": vendido(), "NAVE-GON-01-B-PC2": vendido(), "NAVE-GON-01-PU1": vendido() };
  const ix = PC.indiceDePartes(estado);
  const de = (cara) => (ix.get(cara) ?? []).map((o) => PC.sufijoDeParte(o.partido.parte)).sort();
  assert.deepEqual(de("NAVE-GON-01"), ["PC1", "PU1"]);
  assert.deepEqual(de("NAVE-GON-01-B"), ["PC2"]);
});

prueba("Supervisar: las participaciones sólo para quien administra; puertas, tramos y piezas para todos", () => {
  const pc = PC.partirCodigo("NAVE-GON-01-PC1").parte;
  const pu = PC.partirCodigo("NAVE-NEV-03-PU2").parte;
  const bi = PC.partirCodigo("NAVE-CAJ-04-BI1").parte;
  assert.equal(PC.parteVisible(pc, true), true, "la administración no ve la participación");
  assert.equal(PC.parteVisible(pc, false), false, "el trabajador ve una participación en Supervisar");
  for (const p of [pu, bi, null]) {
    assert.equal(PC.parteVisible(p, false), true);
    assert.equal(PC.parteVisible(p, true), true);
  }
  const t = sinComent(fuenteDe("pages/DashboardView.tsx"));
  const def = (nombre) => {
    const i = t.indexOf(`function ${nombre}(`);
    return i < 0 ? "" : t.slice(i, t.indexOf("\n}\n", i));
  };
  assert.match(def("partesConContrato"), /conParticipaciones = true,[\s\S]*\.filter\(\(o\) => parteVisible\(o\.partido\.parte, conParticipaciones\)\)/,
    "partesConContrato no filtra las participaciones");
  assert.match(def("PartesDeLaCara"), /partesConContrato\(fixture, estado, indice, sede, false\)/,
    "«Por puertas» lista participaciones (las muestra ParticipacionesDeLaCara)");
  assert.match(t, /const partesVisiblesDe = useCallback\(\s*\(f: UnifiedFixture\): FaceEntry\[\] => partesConContrato\(f, estadoComercial, indicePartes, sede, isAdmin\),/,
    "las filas de Supervisar no dependen de quién mira");
  assert.match(t, /const visibles = isAdmin \? partes : fixtures\.flatMap\(partesVisiblesDe\);\s*const faces = visibles\.length \? \[\.\.\.caras, \.\.\.visibles\] : caras;/,
    "los totales y las listas de «Para revisar» le muestran al trabajador contratos de participación");
  assert.match(t, /const partes = partesVisiblesDe\(f\);\s*return partes\.length \? \[\.\.\.commercialFacesOf\(f\), \.\.\.partes\] : commercialFacesOf\(f\);/,
    "«Estado por espacio» le muestra al trabajador contratos de participación");
});

prueba("BLOQUES DE SUPERVISAR DENTRO DE isAdmin: tarjetas, ficha y tabla de participaciones", () => {
  const t = sinComent(fuenteDe("pages/DashboardView.tsx"));
  // Cada montaje, adentro de un `{isAdmin && … (` que no se cerró antes de él
  // (ni con `)}` ni con otra rama): mirando hacia atrás desde la etiqueta.
  for (const tag of ["RevisarParticipaciones", "ParticipacionesDeLaCara", "TablaDeParticipaciones"]) {
    const usos = [...t.matchAll(new RegExp(`<${tag}\\b`, "g"))].map((m) => m.index);
    assert.ok(usos.length >= 1, `${tag} no se monta en Supervisar`);
    for (const i of usos) {
      const antes = t.slice(Math.max(0, i - 700), i);
      const k = antes.lastIndexOf("{isAdmin && ");
      const linea = t.slice(0, i).split("\n").length;
      assert.ok(k >= 0, `${tag} (línea ${linea}) se monta sin \`{isAdmin && …\` alrededor`);
      const entre = antes.slice(k);
      assert.match(entre, /^\{isAdmin && [^{}()]*\(/, `${tag} (línea ${linea}): la condición no es \`{isAdmin && … (\``);
      assert.doesNotMatch(entre, /\)\}|\) : \(|\s:\s/, `${tag} (línea ${linea}) queda afuera del \`{isAdmin && …\` que lo precede`);
    }
  }
  // El resumen (proveedores y marcas) no se pide si no es administración.
  assert.match(t, /useRevisionDeParticipaciones\(\{ sede, activo: isAdmin && hayParticipaciones,/,
    "«Para revisar» pide el resumen de participaciones sin ser administración");
  // Y lo que suma a la cuenta de «Para revisar», también sólo con isAdmin.
  assert.match(t, /\(isAdmin\s*\? kpis\.belowReference\.length[^;]*revisionPc\.total\s*: 0\)/,
    "la cuenta de «Para revisar» suma participaciones para el trabajador");
  // Los dos componentes van en el pedazo del tablero: sólo el store de lectura.
  for (const f of ["components/Distribucion/ParticipacionesDeLaCara.tsx", "components/Distribucion/RevisarParticipaciones.tsx"]) {
    const c = sinComent(fuenteDe(f));
    assert.doesNotMatch(c, /store\/distribucionStore/, `${f} trae el store de edición al tablero`);
    assert.doesNotMatch(c, /localStorage|sessionStorage|indexedDB/, `${f} guarda algo en el navegador`);
  }
});

prueba("la palabra del trabajador para una cara por participación nunca lleva %", () => {
  assert.deepEqual(["libre", "parcial", "tomado"].map(R.palabraDeLaCara), ["Libre", "Por participación", "Tomada"]);
  const t = sinComent(fuenteDe("pages/DashboardView.tsx"));
  const ficha = t.slice(t.indexOf("function CaraPorParticipacion("), t.indexOf("function NoContractState("));
  assert.ok(ficha.length > 0, "no está CaraPorParticipacion");
  assert.doesNotMatch(ficha, /pct\(|quedaPb|%/, "la ficha del trabajador muestra un %");
  assert.match(ficha, /palabraDeLaCara\(pc\.dispo\)/);
  // La pastilla de estado también es la palabra (para los dos roles).
  assert.match(t, /parcial: \{ meta: \{ \.\.\.STATUS_META\.reserved, label: palabraDeLaCara\("parcial"\) \}/);
});

prueba("el plano 2D pinta la cara por participación con su ocupación del día (ejecutado)", () => {
  assert.equal(PC.estadoParaPintar("free", { dispo: "tomado" }), "occupied");
  assert.equal(PC.estadoParaPintar("free", { dispo: "parcial" }), "reserved");
  assert.equal(PC.estadoParaPintar("free", { dispo: "libre" }), "free");
  assert.equal(PC.estadoParaPintar("free", null), "free", "sin ocupación se inventó un color");
  // Lo que la cara tiene por sí misma (vendida entera, en mantenimiento) manda.
  assert.equal(PC.estadoParaPintar("maintenance", { dispo: "parcial" }), "maintenance");
  assert.equal(PC.estadoParaPintar("occupied", { dispo: "libre" }), "occupied");
  // Cuatro participaciones del 25 % hoy: no se ven verdes.
  const g = porPc("ROB-01", { type: "robatope", gondolaType: undefined });
  const hoy = "2026-10-17";
  const cuatro = { ocupacion: { intervalos: [1, 2, 3, 4].map(() => ({ desde: "2026-10-01", hasta: "2026-12-31", pb: 2500 })), fisicos: [] }, hoy };
  assert.equal(PC.porParticipacion(g), true, "el robatope de prueba no se vende por participación");
  assert.equal(PC.estadoParaPintar("free", PC.dispoDeParticipacion(g, cuatro, hoy, hoy)), "occupied");
  const plano = sinComent(fuenteDe("components/FloorPlan2D/FloorPlan2D.tsx"));
  assert.match(plano, /const aFill = STATUS_FILL\[pintadoDe\(item\.id, "A", item\.status\)\];/, "la mitad A no usa el color por ocupación");
  assert.match(plano, /const bFill = STATUS_FILL\[pintadoDe\(item\.id, "B", item\.faceB\?\.status \?\? "free"\)\];/, "la mitad B no usa el color por ocupación");
  assert.match(plano, /: STATUS_FILL\[pintadoDe\(item\.id, "A", item\.status\)\]/, "la cara de una sola cara no usa el color por ocupación");
  assert.match(plano, /: STATUS_COLORS\[pintadoDe\(item\.id, "A", item\.status\)\]/, "el borde no usa el color por ocupación");
});

prueba("Montajes: la participación es un contrato a montar, «Participación 3 · cara A», sin % (ejecutado)", () => {
  const p = PC.partirCodigo("NAVE-GON-01-B-PC3");
  assert.equal(PC.textoDeParticipacionParaMontar(p.parte, p.cara), "Participación 3 · cara B");
  assert.equal(PC.textoDeParticipacionParaMontar(PC.partirCodigo("GON-01-PC12").parte, "A"), "Participación 12 · cara A");
  const mv = sinComent(fuenteDe("pages/MountView.tsx"));
  assert.equal((mv.match(/parteParaMontar\(partido\.parte, partido\.cara, f\)/g) ?? []).length, 2,
    "la lista o el «reportar de nuevo» del tablero arman el rótulo de la parte a mano");
  assert.match(mv, /esParticipacion\(parte\)\s*\? textoDeParticipacionParaMontar\(parte, cara\)\s*: textoParaMontar\(parte, cantidadDe\(f, parte\.clase\)\)/);
});

/* «Para revisar», ejecutado sobre un resumen como el que devuelve el servidor. */
const HOY = "2026-10-17";
const pcRes = (extra) => ({
  codigo: "NAVE-GON-01-PC1", numero: 1, proveedor_id: 7, proveedor: "Postobón", marca: "Hit", cuenta_el_dia: true,
  estado_visible: "vigente", puntos_basicos: 2500, desde: "2026-10-01", hasta: "2027-01-31", caduca: null,
  dibujado_pb: 2500, m2_contratados: 0.3, ...extra,
});
const caraRes = (extra) => ({
  codigo_cara: "NAVE-GON-01", cara: "A", fixture_code: "GON-01", rotulo: "Góndola 1", estado_distribucion: "confirmada",
  area_util_m2: 1.3, comprometido_dia_pb: 2500, pico_pb: 2500, dia_pico: HOY, disponible_pb: 7500,
  dibujado_dia_pb: 2500, pendiente_dia_pb: 0, errores: 0, avisos: 0, participaciones: [pcRes()], ...extra,
});
const resumen = (caras, totales = {}) => ({
  sede: "NAVE", hoy: HOY, dia: HOY, desde: HOY, hasta: "2027-10-16", caras, por_proveedor: [],
  totales: { caras_por_participacion: caras.length, sin_distribuir: 0, borradores: 0, para_revisar: 0, con_errores: 0,
    reservas_por_caducar: 0, sin_mueble: 0, huerfanos: 0, ...totales },
});
const plano = [
  { id: "f1", code: "GON-01", type: "gondola", gondolaType: "double" },
  { id: "f2", code: "PUN-03", type: "punta" },
];

prueba("«Para revisar»: una cara en orden no aparece; cada problema cae en su tarjeta, con «Abrir en Distribución» (ejecutado)", () => {
  assert.deepEqual(R.paraRevisarDeResumen(resumen([caraRes()]), plano), []);
  // Una cara por participación sin ninguna participación todavía no tiene nada
  // que dibujar: no es un pendiente.
  const vacia = caraRes({ codigo_cara: "NAVE-GON-01-B", cara: "B", estado_distribucion: "sin_distribuir", participaciones: [],
    comprometido_dia_pb: 0, dibujado_dia_pb: 0, disponible_pb: 10000 });
  assert.deepEqual(R.paraRevisarDeResumen(resumen([vacia]), plano), [], "una cara sin participaciones sale como «sin distribuir»");
  const r = resumen([
    caraRes({ pendiente_dia_pb: 1500, dibujado_dia_pb: 1000, participaciones: [pcRes({ dibujado_pb: 1000 }), pcRes({ codigo: "NAVE-GON-01-PC2", numero: 2, dibujado_pb: 0 })] }),
    caraRes({ codigo_cara: "NAVE-GON-01-B", cara: "B", estado_distribucion: "para_revisar", errores: 2 }),
    caraRes({ codigo_cara: "NAVE-PUN-03", fixture_code: "PUN-03", estado_distribucion: "borrador",
      participaciones: [pcRes({ codigo: "NAVE-PUN-03-PC1", estado_visible: "reserva", caduca: "2026-10-24", proveedor: "Alpina", marca: null })] }),
    caraRes({ codigo_cara: "NAVE-GON-09", fixture_code: "GON-09", estado_distribucion: "sin_distribuir", pendiente_dia_pb: 0,
      participaciones: [pcRes({ codigo: "NAVE-GON-09-PC1", cuenta_el_dia: false, estado_visible: "reserva", caduca: "2026-11-30" })] }),
  ], { sin_mueble: 1 });
  const s = R.paraRevisarDeResumen(r, plano, ["NAVE-GON-01-PC7"]);
  const por = Object.fromEntries(s.map((x) => [x.tipo, x.items]));
  // `sin_mueble: 1` del servidor NO es una tarjeta: esa cuenta incluye lo
  // cancelado y lo vencido (ver la prueba de abajo).
  assert.deepEqual(s.map((x) => x.tipo), ["sin_termino", "por_caducar", "con_problemas", "para_revisar", "sin_dibujar", "borradores"]);
  assert.deepEqual(s.map((x) => x.titulo).slice(0, 1), ["Contrato de participación sin término"]);
  assert.equal(por.sin_dibujar[0].rotulo, "GON-01 · A");
  assert.equal(por.sin_dibujar[0].frase, "falta dibujar 15 % (2 participaciones).");
  assert.deepEqual(por.sin_dibujar[0].abrir, { fixtureId: "f1", cara: "A" });
  // Sin el mueble en el plano, se nombra igual pero no hay qué abrir.
  assert.equal(por.sin_dibujar[1].frase, "todavía sin distribuir (1 participación).");
  assert.equal(por.sin_dibujar[1].abrir, null);
  assert.equal(por.con_problemas[0].frase, "2 problemas en la distribución.");
  assert.equal(por.con_problemas[0].rotulo, "GON-01 · B");
  assert.equal(por.para_revisar[0].frase, "el mueble cambió desde que se confirmó la distribución.");
  // La punta tiene una sola cara: sin la letra.
  assert.equal(por.borradores[0].rotulo, "PUN-03");
  assert.deepEqual(por.por_caducar.map((i) => i.frase), ["Reserva de Alpina en PUN-03 caduca el 24 oct."],
    "la reserva que caduca dentro de 8 días o más no se avisa, o la que caduca en 7 sí");
  assert.equal(por.sin_mueble, undefined, "la cuenta `sin_mueble` del servidor se volvió una tarjeta");
  assert.deepEqual(por.sin_termino.map((i) => [i.rotulo, i.frase]), [["NAVE-GON-01-PC7", "cuenta como la cara entera hasta que se aclare."]]);
  assert.equal(R.cuantasParaRevisar(s), 7);
});

prueba("«Para revisar»: reservas que caducan hoy y dentro de 7 días; los huérfanos que no se pudieron nombrar se cuentan (ejecutado)", () => {
  const r = resumen([caraRes({ participaciones: [
    pcRes({ estado_visible: "reserva", caduca: HOY }),
    pcRes({ codigo: "NAVE-GON-01-PC2", numero: 2, estado_visible: "reserva", caduca: "2026-10-24" }),
    pcRes({ codigo: "NAVE-GON-01-PC3", numero: 3, estado_visible: "reserva_caducada", caduca: "2026-10-10" }),
  ] })], { huerfanos: 2 });
  const s = R.paraRevisarDeResumen(r, plano);
  const por = Object.fromEntries(s.map((x) => [x.tipo, x.items]));
  assert.deepEqual(por.por_caducar.map((i) => i.frase), [
    "Reserva de Postobón (Hit) en GON-01 · A caduca hoy.",
    "Reserva de Postobón (Hit) en GON-01 · A caduca el 24 oct.",
  ]);
  assert.deepEqual(por.sin_termino.map((i) => i.frase), ["2 contratos de participación sin término cuentan como la cara entera hasta que se aclare."]);
});

prueba("los contratos de participación sin término se nombran: vivos, sobre una cara por participación, y fuera del resumen (ejecutado)", () => {
  const r = resumen([caraRes()]);
  const estado = {
    "NAVE-GON-01-PC1": vendido({ endDate: "2027-01-31" }),        // tiene término: está en el resumen
    "NAVE-GON-01-PC7": vendido({ endDate: "2027-01-31" }),        // sin término
    "NAVE-GON-01-PC8": vendido({ endDate: "2026-10-01" }),        // ya terminó
    "NAVE-GON-01-PC9": { ...vendido(), status: "free" },          // libre
    "NAVE-GON-02-PC1": vendido({ endDate: "2027-01-31" }),        // su cara no es por participación (lo dice otra tarjeta)
    "NAVE-GON-01-PU1": vendido({ endDate: "2027-01-31" }),        // una puerta no es una participación
  };
  assert.deepEqual(R.huerfanosDelEstado(estado, r), ["NAVE-GON-01-PC7"]);
});

prueba("la barra de capacidad de hoy: un segmento por participación que cuenta, lo libre, o «Vendida entera» (ejecutado)", () => {
  const term = (id, prov, extra = {}) => ({ id, proveedor: { id: prov, nombre: `P${prov}` }, estado: "contrato", estado_visible: "vigente", desde: "2026-10-01", hasta: "2026-12-31", ...extra });
  const cara = {
    hoy: HOY,
    capacidad: {
      intervalos: [
        { desde: "2026-10-01", hasta: "2026-12-31", pb: 2500, tipo: "contrato", numero: 1 },
        { desde: "2026-10-10", hasta: "2026-10-31", pb: 1000, tipo: "reserva", numero: 2 },
        { desde: "2026-11-01", hasta: "2026-12-31", pb: 4000, tipo: "contrato", numero: 3 },
      ],
      fisicos: [],
    },
    participaciones: [
      { space_id: 11, numero: 1, viva: true, terminos: [term(1, 7)] },
      { space_id: 12, numero: 2, viva: true, terminos: [term(2, 8, { estado: "reserva", estado_visible: "reserva" })] },
      { space_id: 13, numero: 3, viva: true, terminos: [term(3, 9, { desde: "2026-11-01" })] },
    ],
  };
  const seg = R.segmentosDeHoy(cara);
  assert.deepEqual(seg.map((x) => [x.rotulo, x.tipo, x.pb]), [["1 · 25 %", "contrato", 2500], ["2 · 10 %", "reserva", 1000], ["Libre 65 %", "libre", 6500]],
    "la barra de hoy cuenta lo que empieza después, o no deja lo libre");
  assert.ok(seg.slice(0, 2).every((x) => x.tono !== null && x.textura), "una participación sin estampa");
  assert.notDeepEqual([seg[0].tono, seg[0].textura], [seg[1].tono, seg[1].textura], "dos participaciones con la misma estampa");
  const entera = R.segmentosDeHoy({ ...cara, capacidad: { ...cara.capacidad, fisicos: [{ codigo: "NAVE-GON-01", desde: "2026-01-01", hasta: "2026-12-31", huerfano: false }] } });
  assert.deepEqual(entera.map((x) => [x.rotulo, x.pb]), [["Vendida entera", 10000]]);
});

prueba("la ficha renueva sólo un contrato vivo que termina en 60 días; las palabras de cada estado (ejecutado)", () => {
  const t = (extra) => ({ id: 5, estado: "contrato", estado_visible: "vigente", desde: "2026-01-01", hasta: "2026-12-01", ...extra });
  assert.equal(R.terminoParaRenovar({ terminos: [t()] }, HOY)?.id, 5);
  assert.equal(R.terminoParaRenovar({ terminos: [t({ hasta: "2027-03-01" })] }, HOY), null, "renovar un contrato que vence en cinco meses");
  assert.equal(R.terminoParaRenovar({ terminos: [t({ estado: "reserva", estado_visible: "reserva" })] }, HOY), null, "una reserva se renueva");
  assert.equal(R.terminoParaRenovar({ terminos: [t({ estado_visible: "vencido", hasta: "2026-10-01" })] }, HOY), null, "un contrato vencido se renueva");
  assert.equal(R.terminoParaRenovar({ terminos: [] }, HOY), null);
  assert.equal(R.PALABRA_DEL_TERMINO.reserva, "Reserva provisional");
  assert.equal(R.PALABRA_DE_LA_DISTRIBUCION.para_revisar, "Para revisar");
  assert.equal(R.rotuloDeCara("GON-01", "B", plano[0]), "GON-01 · B");
  assert.equal(R.rotuloDeCara("PUN-03", "A", plano[1]), "PUN-03");
  assert.equal(R.rotuloDeCara("GON-09", "A", undefined), "GON-09 · A");
  assert.equal(R.fechaCorta("2027-02-03", HOY), "3 feb 2027");
  assert.equal(R.sumarDias("2026-12-28", 7), "2027-01-04");
});

/* ── Verificación del paso 7: lo que las pruebas de arriba dejaban pasar ─────
   Cada una de estas cayó con una mutación que no rompía ninguna prueba: sacar
   la carga de la ocupación de Vender, el filtro `activo` del resumen, la
   palabra de la pastilla, la regla de «Libres» con una reserva que llena la
   cara, el botón «Negociar» de una cara por participación… */

prueba("«Participación sin mueble» no sale de `totales.sin_mueble`, que cuenta también lo cancelado (ejecutado)", () => {
  // Lo que se vio en el navegador: PUN-05 tuvo una reserva, se canceló, y la
  // cara volvió a venderse entera. El servidor la cuenta para siempre (las
  // filas de participación no se borran nunca, D14): «cancelá lo que quede
  // vivo» sin nada vivo, y la cuenta de «Para revisar» nunca volvía a cero.
  assert.deepEqual(R.paraRevisarDeResumen(resumen([], { sin_mueble: 3 }), plano), []);
  assert.equal(R.cuantasParaRevisar(R.paraRevisarDeResumen(resumen([caraRes()], { sin_mueble: 1 }), plano)), 0);
});

prueba("«Para revisar» con fecha y nombre: la LISTA `sin_mueble` (sólo lo vivo), los huérfanos del servidor y el borrador de hace N días (ejecutado)", () => {
  // Lo que el verificador del paso 7 tuvo que sacar, de vuelta con los datos
  // que ahora manda el servidor (`GET /participaciones/resumen`).
  const r = {
    ...resumen([
      caraRes({ borrador_en: "2026-10-14T15:00:00+00:00", borrador_dia: "2026-10-14" }),   // encima de una confirmada
      caraRes({ codigo_cara: "NAVE-GON-01-B", cara: "B", borrador_en: "2026-10-17T02:00:00+00:00", borrador_dia: "2026-10-16" }),
      caraRes({ codigo_cara: "NAVE-PUN-03", fixture_code: "PUN-03", estado_distribucion: "borrador",
        borrador_en: "2026-10-17T13:00:00+00:00", borrador_dia: HOY }),
    ], { sin_mueble: 2, huerfanos: 1 }),
    sin_mueble: [
      { codigo_cara: "NAVE-PUN-03", cara: "A", fixture_code: "PUN-03", en_el_plano: true, participaciones: 1, hasta: "2026-11-30" },
      { codigo_cara: "NAVE-GON-07-B", cara: "B", fixture_code: "GON-07", en_el_plano: false, participaciones: 2, hasta: "2027-01-31" },
    ],
    huerfanos: [{ codigo: "NAVE-GON-01-PC9", desde: "2027-01-01", hasta: "2027-01-31" }],
  };
  // Lo que el navegador nombró por su cuenta no pisa la lista del servidor.
  const s = R.paraRevisarDeResumen(r, plano, ["NAVE-GON-01-PC7"]);
  const por = Object.fromEntries(s.map((x) => [x.tipo, x.items]));
  assert.deepEqual(s.map((x) => x.tipo), ["sin_termino", "sin_mueble", "borradores"]);
  assert.deepEqual(s.map((x) => x.titulo).slice(0, 2), ["Contrato de participación sin término", "Participación sin mueble"]);
  assert.deepEqual(por.sin_termino.map((i) => [i.rotulo, i.frase]), [
    ["NAVE-GON-01-PC9", "contrato del 1 ene 2027 al 31 ene 2027 sin término: cuenta como la cara entera hasta que se aclare."]]);
  assert.deepEqual(por.sin_mueble.map((i) => [i.rotulo, i.frase, i.abrir]), [
    ["PUN-03", "ya no se vende por participación y tiene 1 participación viva hasta el 30 nov: volvé a venderla así o cancelá lo que quede vivo.",
      { fixtureId: "f2", cara: "A" }],
    ["GON-07 · B", "ya no está en el plano y tiene 2 participaciones vivas hasta el 31 ene 2027: volvé a poner el mueble o cancelá lo que quede vivo.", null],
  ]);
  assert.deepEqual(por.borradores.map((i) => [i.rotulo, i.frase]), [
    ["GON-01 · A", "tiene un borrador de hace 3 días."],
    ["GON-01 · B", "tiene un borrador de ayer."],
    ["PUN-03", "tiene un borrador de hoy."],
  ], "el borrador de una cara confirmada no sale, o sale sin su día");
  assert.equal(R.cuantasParaRevisar(s), 6);
  // Con la lista del servidor vacía no hay tarjeta, aunque la cuenta vieja diga 3.
  assert.deepEqual(R.paraRevisarDeResumen({ ...resumen([], { sin_mueble: 3 }), sin_mueble: [], huerfanos: [] }, plano, ["NAVE-GON-01-PC7"]), []);
  assert.equal(R.deCuando("2026-10-17", HOY), "de hoy");
  assert.equal(R.deCuando("2026-09-30", HOY), "de hace 17 días");
  // La tarjeta lee la LISTA, nunca la cuenta: en el código no hay un
  // `totales.sin_mueble` que arme una tarjeta.
  const fuenteR = fuenteDe("utils/revisarParticipaciones.ts").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  assert.ok(!/totales\.sin_mueble/.test(fuenteR), "una tarjeta sale de la cuenta `totales.sin_mueble`");
  assert.match(fuenteR, /for \(const x of r\.sin_mueble \?\? \[\]\)/);
});

prueba("«Distribución con problemas» con UN problema (ejecutado)", () => {
  const s = R.paraRevisarDeResumen(resumen([caraRes({ errores: 1 })]), plano);
  assert.deepEqual(s.map((x) => [x.tipo, x.items.map((i) => i.frase)]), [["con_problemas", ["1 problema en la distribución."]]]);
});

prueba("la ficha muestra el término que rige hoy, no el más nuevo (ejecutado)", () => {
  const nuevo = { id: 9, estado: "contrato", estado_visible: "firmado", desde: "2026-12-01", hasta: "2027-05-31" };
  const rige = { id: 5, estado: "contrato", estado_visible: "vigente", desde: "2026-06-01", hasta: "2026-11-30" };
  assert.equal(R.terminoQueSeMuestra({ terminos: [nuevo, rige] }, HOY)?.id, 5, "la ficha muestra el renovado que todavía no empieza");
  assert.equal(R.terminoQueSeMuestra({ terminos: [nuevo] }, HOY)?.id, 9);
  assert.equal(R.terminoQueSeMuestra({ terminos: [] }, HOY), null);
});

prueba("«Libres»: una cara por participación que una reserva deja hoy sin lugar no está libre (estadoDeUnidad, ejecutado)", () => {
  const t = fuenteDe("pages/DashboardView.tsx");
  const i = t.indexOf("function estadoDeUnidad(");
  assert.ok(i >= 0, "no está estadoDeUnidad");
  const fuente = t.slice(i, t.indexOf("\n}\n", i) + 2);
  const { transformSync } = esbuildMod;
  const js = transformSync(fuente, { loader: "ts" }).code;
  const estadoDeUnidad = new Function("displayStatus", `${js}\nreturn estadoDeUnidad;`)((f) => f.ds);
  const cara = { ds: "free" };
  assert.equal(estadoDeUnidad(cara, [], true), "reserved", "una reserva del 100 % hoy deja la cara entre las «Libres»");
  assert.equal(estadoDeUnidad(cara, [], false), "free");
  assert.equal(estadoDeUnidad(cara, [{ ds: "active" }], true), "active", "con un contrato de participación que corre, la cara trabaja");
  assert.equal(estadoDeUnidad(cara, [{ ds: "committed" }], false), "committed");
  assert.equal(estadoDeUnidad({ ds: "active" }, [], true), "active", "lo que la cara tiene por sí misma manda");
  // Y los totales le pasan la ocupación de HOY: «tomado» (sin lugar), nada más.
  const v = sinComent(t);
  assert.match(v, /return !!par && dispoDeParticipacion\(c\.fixture, par, par\.hoy, par\.hoy\)\?\.dispo === "tomado";/,
    "«Libres» no mira la ocupación de hoy de la cara por participación");
  assert.match(v, /estadoDeUnidad\(\s*c, partes\.filter\(\(p\) => p\.fixture\.id === c\.fixture\.id && p\.face === c\.face\), sinLugarHoy\(c\)\)/,
    "los totales no le pasan a estadoDeUnidad si la cara se quedó sin lugar hoy");
});

prueba("Vender, Supervisar y el plano 2D LEEN la ocupación (sin esto, toda cara por participación se ve libre)", () => {
  const v = sinComent(fuenteDe("pages/DashboardView.tsx"));
  assert.match(v, /useEffect\(\(\) => \{\s*if \(hayParticipaciones\) void cargarOcupacion\(sede\);\s*\}, \[hayParticipaciones, sede, cargarOcupacion\]\);/,
    "el tablero no pide la ocupación de la sede");
  assert.match(v, /const hayParticipaciones = useMemo\(\(\) => fixtures\.some\(\(f\) => porParticipacion\(f\)\), \[fixtures\]\);/);
  // Un contrato que entra o se cancela cambia el mapa de la base: la ocupación
  // y el resumen se vuelven a leer.
  assert.match(v, /if \(estadoVisto\.current === estadoComercial\) return;\s*estadoVisto\.current = estadoComercial;\s*if \(!hayParticipaciones\) return;\s*void recargarOcupacion\(sede\);\s*invalidarResumen\(sede\);/,
    "un contrato nuevo o cancelado no vuelve a leer la ocupación ni olvida el resumen");
  const plano2d = sinComent(fuenteDe("components/FloorPlan2D/FloorPlan2D.tsx"));
  assert.match(plano2d, /useEffect\(\(\) => \{\s*if \(hayParticipaciones\) void cargarOcupacion\(sede\);\s*\}, \[hayParticipaciones, sede, cargarOcupacion\]\);/,
    "el plano 2D no pide la ocupación (abierto directo, pinta verde lo comprometido)");
  // La cara se busca en la ocupación con la sede del PLANO, como el servidor y
  // `carasPorParticipacion`: con el campo `sede` del mueble, un mueble viejo
  // con otra sede escrita adentro no encontraría su ocupación (y se vería libre).
  assert.match(v, /function participacionDeLaCara\([\s\S]*?const codigo = fullSpaceCode\(sede, codigoDeParte\(f\.code, cara, null\)\);/,
    "Vender y Supervisar buscan la ocupación con otra sede que la del plano");
  assert.match(plano2d, /const codigo = fullSpaceCode\(sede, codigoDeParte\(f\.code, cara, null\)\);/,
    "el plano 2D busca la ocupación con otra sede que la del plano");
});

prueba("la palabra de la cara por participación sale en la pastilla y en la tabla de «Estado por espacio»", () => {
  const v = sinComent(fuenteDe("pages/DashboardView.tsx"));
  assert.match(v, /const porPc = !face\.parte && ds === "free" && pc && pc\.dispo !== "libre" \? META_DE_PARTICIPACION\[pc\.dispo\] : null;/,
    "la pastilla de estado no dice «Por participación» / «Tomada»");
  assert.match(v, /const meta = porPc \? porPc\.meta : STATUS_META\[ds\];/);
  assert.match(v, /const pin = pcHoy && pcHoy\.dispo !== "libre" \? pinDeParticipacion\(pcHoy\.dispo\) : pinDe\(\)\[ds\];/,
    "la tabla dice «Libre» de una cara por participación comprometida");
  assert.match(v, /tomado: \{ meta: \{ \.\.\.STATUS_META\.expired, label: palabraDeLaCara\("tomado"\) \}/);
});

prueba("el resumen (proveedores y marcas) no se pide sin `activo`: lo cumple el hook, no sólo quien lo llama", () => {
  const c = sinComent(fuenteDe("components/Distribucion/RevisarParticipaciones.tsx"));
  assert.match(c, /useOcupacionStore\(\(s\) => \(activo \? s\.resumen\[clave\] \?\? null : null\)\)/, "el hook muestra un resumen sin estar activo");
  assert.match(c, /if \(!activo \|\| r\) return;/, "el hook pide el resumen sin estar activo");
});

prueba("una cara por participación no ofrece «Negociar» en la ficha ni en el globito", () => {
  const v = sinComent(fuenteDe("pages/DashboardView.tsx"));
  assert.match(v, /\{rentable && onNegociar && !pc && \(/, "la ficha ofrece vender entera una cara por participación");
  assert.match(v, /onNegociar=\{isAdmin && !porParticipacion\(selected\) \? \(\) => negociar\(selected\) : undefined\}/,
    "el globito de Supervisar ofrece vender entera una cara por participación");
  // Lo del trabajador va sólo al trabajador (la administración tiene el bloque completo).
  assert.match(v, /\{!hasContract && pc \? \(\s*!isAdmin && <CaraPorParticipacion fixture=\{fixture\} face=\{entry\.face\} \/>/);
});

prueba("«Renovar» de una participación sólo lleva a Distribución un contrato vivo", () => {
  const v = sinComent(fuenteDe("pages/DashboardView.tsx"));
  assert.match(v, /if \(t && t\.estado === "contrato" && \(t\.estado_visible === "vigente" \|\| t\.estado_visible === "firmado"\)\) termino = t\.id;/,
    "renovar abre el formulario sobre una reserva, un vencido o un cancelado");
});

console.log(`\n${hechas} pruebas\n`);
