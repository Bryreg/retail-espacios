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
import { PARA_TODOS, SOLO_ADMINISTRACION, revisarAvisos } from "./casos/avisos-de-revision.mjs";

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
  assert.match(t, /const visibles = isAdmin \? partes : fixtures\.flatMap\(partesVisiblesDe\)\.map\(reserva\);\s*const faces = visibles\.length \? \[\.\.\.caras, \.\.\.visibles\] : caras;/,
    "los totales y las listas de «Para revisar» le muestran al trabajador contratos de participación");
  assert.match(t, /const partes = partesVisiblesDe\(f\);\s*return \(partes\.length \? \[\.\.\.commercialFacesOf\(f\), \.\.\.partes\] : commercialFacesOf\(f\)\)\s*\.map\(\(e\) => conLaReserva\(e, estadoComercial, sede\)\);/,
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
  // (Rediseño, PR 2: la cuenta es la suma de los tres grupos de `avisos`; lo
  // de las participaciones se suma DESPUÉS del corte del trabajador. Ver
  // «Para revisar en tres grupos», más abajo.)
  // La MISMA lista que `probar-vender` (`casos/avisos-de-revision.mjs`): todo
  // lo de administración después del corte, y nada fuera de la lista.
  const avisosDef = t.slice(t.indexOf("const avisos = useMemo("), t.indexOf("const cuentasDeRevision = useMemo("));
  assert.ok(avisosDef.length > 200, "no está `const avisos = useMemo(`");
  assert.deepEqual(revisarAvisos(avisosDef), [], "la cuenta de «Para revisar» le suma al trabajador lo de administración");
  // Y la lista misma no se afloja: lo que el trabajador ve, y nada más.
  // (Rediseño, PR 3, decisión 1: suma «Marcado reservado a mano», que no lleva
  // plata ni proveedor —no tiene ninguno— y que el trabajador ya ve pintado en
  // su mapa, como «Ocupado sin contrato». Lo que la guarda exige además: que
  // salga SÓLO de las caras «reserved» sin la marca de una reserva de Vender,
  // y que liberar o reservar de verdad sea de administración.)
  // (Fase 4 de la distribución, 2026-10-25: suma los planogramas por revisar,
  // que no llevan plata ni proveedor; el SERVIDOR sólo le manda a cada rol las
  // caras que puede publicar —`test_revisa_quien_puede_publicar_esa_cara`—.)
  assert.deepEqual(PARA_TODOS, ["kpis.expired", "kpis.expiring", "kpis.noContract", "kpis.reservadoAMano", "fantasmas",
    "planogramasPorRevisar.filas"]);
  assert.match(t, /else if \(ds\[i\] === "reserved" && !x\.reservado\) reservadoAMano\.push\(x\);/,
    "«Marcado reservado a mano» junta algo más que lo marcado a mano (una reserva de Vender lleva proveedor y fechas)");
  assert.equal((t.match(/reservadoAMano\.push\(/g) ?? []).length, 1, "«Marcado reservado a mano» se llena por otro lado");
  const seccionRa = t.slice(t.indexOf("<div data-reservado-a-mano>"), t.indexOf("</div>", t.indexOf("<div data-reservado-a-mano>")));
  assert.ok(seccionRa.length > 200, "no está la sección «Marcado reservado a mano» en Corregir");
  assert.match(seccionRa, /acciones=\{isAdmin \? \[/, "«Liberar» o «Reservar de verdad» se le ofrecen al trabajador");
  assert.doesNotMatch(seccionRa, /negotiatedValue|formatCOP|supplierName|brandCategory|observation/, "la sección dice plata, proveedor o nota");
  for (const n of ["kpis.belowReference", "importacion", "montaje.noMontado", "montaje.sinMontar", "montaje.viejos",
    "cortesSinCargar.pendientes", "reservasSinConfirmar.vivas", "faltaPlanometria.filas", "revisionPc.secciones"]) {
    assert.ok(SOLO_ADMINISTRACION.includes(n), `«${n}» salió de la lista de lo de administración`);
  }
  // La guarda muerde: un aviso de administración antes del corte, o uno nuevo
  // sin anotar, falla.
  const conFuga = avisosDef.replace("if (!isAdmin) return a;", "for (const e of kpis.belowReference) a.push(e);\n    if (!isAdmin) return a;");
  assert.ok(revisarAvisos(conFuga).length > 0, "la guarda no ve un aviso de administración antes del corte");
  const conNuevo = avisosDef.replace("return a;\n  }, [", "for (const x of otraCosa.filas) a.push(x);\n    return a;\n  }, [");
  assert.notEqual(conNuevo, avisosDef, "no se pudo armar el caso del aviso nuevo");
  assert.ok(revisarAvisos(conNuevo).length > 0, "la guarda deja pasar un aviso nuevo sin anotar");
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

/* La revisión final (2026-10-17): el globo de Supervisar y la ficha del plano
   2D decían «Sin contrato activo — disponible para vender» y «Disponible» en
   verde sobre caras por participación tomadas al 100 %: una cara así nunca
   tiene `supplierName` (el contrato `…-PC3` no la pinta). Lo dice su ocupación
   anónima de hoy. */
prueba("lo comprometido de una cara por participación: «comprometido X % · queda Y %», y «disponible» sólo si queda algo (ejecutado)", () => {
  const g = porPc("ROB-01", { type: "robatope", gondolaType: undefined });
  const hoy = "2026-10-17";
  const de = (intervalos, fisicos = []) => PC.dispoDeParticipacion(g, { ocupacion: { intervalos, fisicos }, hoy }, hoy, hoy);
  const iv = (pb, desde = "2026-10-01", hasta = "2026-12-31") => ({ desde, hasta, pb });
  // GON-01·A del recorrido: 55 % comprometido.
  assert.equal(PC.textoDeLoComprometido(de([iv(3000), iv(2500)]), true),
    "Por participación · comprometido 55 % · queda 45 % — disponible para vender en Vender.");
  // ROB-01: cuatro del 25 %. Nunca «disponible» sobre algo tomado.
  const tomada = PC.textoDeLoComprometido(de([iv(2500), iv(2500), iv(2500), iv(2500)]), true);
  assert.equal(tomada, "Por participación · comprometido 100 % · queda 0 %.");
  assert.doesNotMatch(tomada, /disponible/i, "el globo dice «disponible» sobre una cara tomada");
  // Vendida entera (lo físico cuenta como la cara entera) y con decimales.
  assert.equal(PC.textoDeLoComprometido(de([], [{ desde: "2026-10-01", hasta: "2026-12-31" }]), true),
    "Por participación · comprometido 100 % · queda 0 %.");
  assert.match(PC.textoDeLoComprometido(de([iv(3333)]), true), /^Por participación · comprometido 33,33 % · queda 66,67 % — disponible/);
  // Nada comprometido hoy (lo de mañana no cuenta): queda todo.
  assert.equal(PC.textoDeLoComprometido(de([iv(4000, "2026-10-18")]), true),
    "Por participación · comprometido 0 % · queda 100 % — disponible para vender en Vender.");
  // El trabajador: la palabra sola, sin % ni «disponible» (D7).
  for (const [d, esperado] of [[de([iv(5500)]), "Por participación."], [de([iv(10000)]), "Por participación · tomada."], [de([]), "Por participación."]]) {
    const t = PC.textoDeLoComprometido(d, false);
    assert.equal(t, esperado);
    assert.doesNotMatch(t, /%|\d|disponible/i, "el trabajador ve un % o «disponible»");
  }
  // Sin la ocupación todavía: nunca «disponible» sobre lo que no se sabe.
  for (const conPct of [true, false]) {
    assert.equal(PC.textoDeLoComprometido(null, conPct), "Se vende por participación.");
  }
});

prueba("el globo de Supervisar dice lo comprometido de una cara por participación, nunca «Sin contrato activo — disponible»", () => {
  const t = sinComent(fuenteDe("pages/DashboardView.tsx"));
  const globo = t.slice(t.indexOf("function FixturePopover("), t.indexOf("// ─── Vender por partes: las puertas de la cara"));
  assert.ok(globo.length > 1000, "no está FixturePopover");
  assert.match(globo, /const esPc = rentable && porParticipacion\(fixture\);/);
  // La ocupación de HOY de la misma cara que la pastilla.
  assert.match(globo, /const dispoPc = useDispoDeHoy\(fixture, entry\.face\);/);
  assert.match(globo, /<StatusPill fixture=\{fixture\} face=\{entry\} \/>/);
  // La rama de participación va ANTES de la frase de siempre: ésa queda para
  // las caras que no se venden así. (Fase 2 · I4: con el estado propio de la
  // cara, que manda sobre la ocupación —Mantenimiento no dice «disponible»—.
  // La guarda exige eso además de lo de antes.)
  assert.match(globo, /\? esPc\s*\? textoDeLoComprometido\(dispoPc, isAdmin, \{ propio: entry\.status \}\)\s*: puertas\.some\(\(p\) => p\.vendida\) && claseDelPopover/,
    "el globo de una cara por participación no dice lo comprometido (con su estado propio)");
  const i = globo.indexOf("textoDeLoComprometido(dispoPc, isAdmin, { propio: entry.status })");
  const j = globo.indexOf('"Sin contrato activo — disponible para vender."');
  assert.ok(i > 0 && j > i, "«Sin contrato activo — disponible para vender.» se alcanza antes que la rama de participación");
  // «Abrir en Distribución» sólo para quien administra, y sólo en una cara así.
  // (Fase 2 · I4, E5b: con la cara que se tocó —la de la ficha, `entradaDetalle`—
  // y no siempre la A. La guarda exige eso además de lo de antes.)
  assert.match(globo, /\{esPc && isAdmin && onAbrirEnDistribucion && \(/);
  assert.match(t, /onAbrirEnDistribucion=\{isAdmin && porParticipacion\(selected\)\s*\? \(\) => abrirEnDistribucion\(selected\.id, entradaDetalle\.face\)\s*: undefined\}/,
    "el globo ofrece Distribución a quien no administra, a una cara que no es por participación, o a otra cara que la tocada");
});

prueba("la ficha del plano 2D: estado por ocupación y «Contratado» por participación, no «Disponible» ni «Sede → Vender» (ejecutado)", () => {
  // La palabra del estado que se ve, la misma regla que el color.
  assert.equal(PC.rotuloPorOcupacion("free", { dispo: "tomado" }), "Tomada");
  assert.equal(PC.rotuloPorOcupacion("free", { dispo: "parcial" }), "Parcial");
  assert.equal(PC.rotuloPorOcupacion("free", { dispo: "libre" }), null);
  assert.equal(PC.rotuloPorOcupacion("free", null), null, "sin ocupación se inventó un estado");
  assert.equal(PC.rotuloPorOcupacion("maintenance", { dispo: "tomado" }), null, "lo propio de la cara dejó de mandar");
  assert.equal(PC.rotuloPorOcupacion("occupied", { dispo: "parcial" }), null);
  const plano = sinComent(fuenteDe("components/FloorPlan2D/FloorPlan2D.tsx"));
  // (Rediseño, PR 3: el panel B termina donde empieza su renglón,
  // `FilaDelPanel`; antes, en `ToolbarBtn`, que se fue con la barra vieja.)
  const panel = plano.slice(plano.indexOf("function AssignmentPanel("), plano.indexOf("function FilaDelPanel("));
  assert.ok(plano.indexOf("function FilaDelPanel(") > plano.indexOf("function AssignmentPanel("), "el panel B no termina en `FilaDelPanel`");
  assert.ok(panel.length > 1000, "no está AssignmentPanel");
  // La ocupación de la cara que se mira, del mismo cálculo que su color.
  assert.match(plano, /const pintadoDe = useCallback\(\(itemId: string, cara: "A" \| "B", propio: SpaceStatus\): SpaceStatus =>\s*estadoParaPintar\(propio, dispoDeLaCara\(itemId, cara\)\), \[dispoDeLaCara\]\);/,
    "el color y la ficha no salen de la misma ocupación");
  assert.match(plano, /dispoDeCara=\{\(cara\) => dispoDeLaCara\(selectedItem\.id, cara\)\}/);
  assert.match(plano, /porParticipacion=\{esPorParticipacion\(selectedItem\.id\)\}/);
  assert.match(panel, /const dispoPc = esPc \? \(dispoDeCara\?\.\(activeFace\) \?\? null\) : null;/);
  assert.match(panel, /const estadoVisto: SpaceStatus = estadoParaPintar\(face\.status, dispoPc\);/);
  assert.match(panel, /const rotuloVisto = rotuloPorOcupacion\(face\.status, dispoPc\) \?\? STATUS_LABELS\[face\.status\];/);
  // La pastilla: el color y la palabra por ocupación.
  assert.match(panel, /\.\.\.\(rentable \? STATUS_BADGE_STYLE\[estadoVisto\] : NON_RENTABLE_BADGE_STYLE\)/, "la pastilla no usa el color por ocupación");
  assert.match(panel, /\{rentable \? rotuloVisto : NON_RENTABLE_LABEL\}/, "la pastilla dice «Disponible» sobre una cara por participación");
  assert.doesNotMatch(panel, /STATUS_BADGE_STYLE\[face\.status\]|\{rentable \? STATUS_LABELS\[face\.status\]/, "queda una pastilla con el estado crudo");
  // «Contratado»: lo comprometido, y dónde se vende (no «Sede → Vender»).
  // (Fase 2 · I4: con el estado propio de la cara y sin repetir «en el Editor
  // 3D → Distribución», que dice el renglón de abajo. La guarda exige eso
  // además de lo de antes.)
  assert.match(panel, /\) : esPc \? \(\s*<p data-contratado-por-participacion[^>]*>\s*\{textoDeLoComprometido\(dispoPc, isAdmin, \{ propio: face\.status, conLugar: false \}\)\}/,
    "«Contratado» de una cara por participación no dice lo comprometido (con su estado propio, sin repetir dónde se carga)");
  const k = panel.indexOf("{textoDeLoComprometido(dispoPc, isAdmin, { propio: face.status, conLugar: false })}");
  const sin = panel.indexOf("Sin contrato activo.");
  assert.ok(k > 0 && sin > k, "«Sin contrato activo.» se alcanza antes que la rama de participación");
  assert.match(panel, /\{isAdmin && esPc \? \(\s*<>\s*<p[^>]*>\s*\{DONDE_SE_CARGAN\}/, "a quien administra no le dice dónde se cargan las participaciones");
  assert.match(panel, /onPorcentaje=\{isAdmin && esPc \? \(c\) => abrirEnDistribucion\(item\.id, c\) : undefined\}/);
  const vender = panel.indexOf("Sede → Vender");
  assert.ok(vender > panel.indexOf("{isAdmin && esPc ? ("), "«Sede → Vender» se dice también de una cara por participación");
});

/* La verificación del arreglo (2026-10-17): cuatro mutantes vivían con las
   pruebas de arriba. «Estado del espacio» —el renglón que el recorrido vio
   decir «Disponible» sobre ROB-01— podía volver al estado crudo; «es por
   participación» podía valer para todo mueble (la ficha de una góndola que se
   vende entera perdía «Sin contrato activo.» y «Sede → Vender»); la nota «lo
   dice la ocupación» podía salir siempre, y el tope de lo comprometido no lo
   probaba nadie. */
prueba("la ficha del plano 2D: «Estado del espacio» también por ocupación, y un mueble que se vende entero queda como estaba (ejecutado)", () => {
  // El tope: lo comprometido nunca pasa de la cara ni baja de cero.
  assert.equal(PC.textoDeLoComprometido({ dispo: "tomado", quedaPb: -500 }, true), "Por participación · comprometido 100 % · queda 0 %.");
  assert.equal(PC.textoDeLoComprometido({ dispo: "libre", quedaPb: 12000 }, true),
    "Por participación · comprometido 0 % · queda 100 % — disponible para vender en Vender.");
  const plano = sinComent(fuenteDe("components/FloorPlan2D/FloorPlan2D.tsx"));
  // «Es por participación» lo dice el mueble del store, no cualquier mueble.
  assert.match(plano, /const esPorParticipacion = useCallback\(\(itemId: string\): boolean => \{\s*const f = muebleDelStore\.get\(itemId\);\s*return !!f && porParticipacion\(f\);\s*\}, \[muebleDelStore\]\);/,
    "«es por participación» vale para muebles que no se venden así");
  // (Rediseño, PR 3: el panel B termina donde empieza su renglón,
  // `FilaDelPanel`; antes, en `ToolbarBtn`, que se fue con la barra vieja.)
  const panel = plano.slice(plano.indexOf("function AssignmentPanel("), plano.indexOf("function FilaDelPanel("));
  assert.ok(plano.indexOf("function FilaDelPanel(") > plano.indexOf("function AssignmentPanel("), "el panel B no termina en `FilaDelPanel`");
  // (Rediseño, PR 3: «Estado del espacio» es el renglón «Estado» del panel B,
  // en la pestaña Venta; la palabra de sólo lectura va en `.p2-v`.)
  const i = panel.indexOf('<FilaDelPanel k="Estado" titulo="Estado del espacio"');
  const estado = panel.slice(i, panel.indexOf("</FilaDelPanel>", i));
  assert.ok(i > 0 && estado.length > 200, "no está el campo «Estado del espacio»");
  // De sólo lectura dice la palabra por ocupación, nunca el estado crudo.
  assert.match(estado, /<p className="p2-v">\s*\{rotuloVisto\}\s*\{face\.status === "occupied" && \(/,
    "«Estado del espacio» dice «Disponible» sobre una cara por participación tomada");
  assert.doesNotMatch(estado, /STATUS_LABELS\[face\.status\]/, "«Estado del espacio» vuelve a leer el estado crudo");
  // La nota «lo dice la ocupación» sale sólo cuando lo que se ve no es lo de la base.
  assert.equal((estado.match(/data-estado-por-ocupacion/g) || []).length, 2);
  assert.equal((estado.match(/\{estadoVisto !== face\.status && \(\s*<(?:p|span|small) data-estado-por-ocupacion/g) || []).length, 2,
    "la nota «lo dice la ocupación» sale también en caras que no se venden por participación");
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
  // Rediseño (PR 1): la sección se llama «Falta distribuir» y cada renglón
  // dice cuándo empieza lo que falta (`empiezaEn`: 0 o menos, ya corre).
  assert.equal(s.find((x) => x.tipo === "sin_dibujar").titulo, "Falta distribuir");
  assert.equal(por.sin_dibujar[0].rotulo, "GON-01 · A");
  assert.equal(por.sin_dibujar[0].frase, "falta distribuir 15 % (2 participaciones) · ya corre.");
  assert.equal(por.sin_dibujar[0].empiezaEn, 0);
  assert.deepEqual(por.sin_dibujar[0].abrir, { fixtureId: "f1", cara: "A" });
  // Sin el mueble en el plano, se nombra igual pero no hay qué abrir.
  assert.equal(por.sin_dibujar[1].frase, "todavía sin distribuir (1 participación) · ya corre.");
  assert.ok(por.sin_dibujar[1].empiezaEn <= 0, "lo que ya empezó no dice que falta");
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

prueba("«Falta distribuir»: lo firmado para más adelante cuenta desde que se firma, con sus días, rojo con 7 o menos y de lo urgente a lo menos (ejecutado)", () => {
  assert.equal(R.DIAS_DE_APURO, 7);
  assert.equal(R.cuandoEmpieza("2026-10-10", HOY), "ya corre");
  assert.equal(R.cuandoEmpieza(HOY, HOY), "empieza hoy");
  assert.equal(R.cuandoEmpieza("2026-10-18", HOY), "empieza mañana");
  assert.equal(R.cuandoEmpieza("2026-11-16", HOY), "empieza el 16 nov (en 30 días)");
  const futura = (extra) => pcRes({ cuenta_el_dia: false, estado_visible: "firmado", dibujado_pb: 0, ...extra });
  const r = resumen([
    // Lejos: 30 días. Sin nada dibujado.
    caraRes({ codigo_cara: "NAVE-PUN-03", fixture_code: "PUN-03", comprometido_dia_pb: 0, dibujado_dia_pb: 0,
      participaciones: [futura({ codigo: "NAVE-PUN-03-PC1", desde: "2026-11-16", hasta: "2026-12-15" })] }),
    // Cerca: 5 días, con la mitad dibujada; y otra, del mismo mueble, entera
    // dibujada (no falta nada) y una reserva futura (no es un contrato firmado).
    caraRes({ participaciones: [
      pcRes(),
      futura({ codigo: "NAVE-GON-01-PC2", numero: 2, desde: "2026-10-22", hasta: "2026-11-21", puntos_basicos: 4000, dibujado_pb: 2000 }),
      futura({ codigo: "NAVE-GON-01-PC3", numero: 3, desde: "2026-10-20", hasta: "2026-11-21", dibujado_pb: 2500 }),
      futura({ codigo: "NAVE-GON-01-PC4", numero: 4, estado_visible: "reserva", desde: "2026-10-19", caduca: "2026-12-01" }),
    ] }),
    // Lo que corre hoy: primero.
    caraRes({ codigo_cara: "NAVE-GON-01-B", cara: "B", pendiente_dia_pb: 1000, dibujado_dia_pb: 1500,
      participaciones: [pcRes({ codigo: "NAVE-GON-01-B-PC1", dibujado_pb: 1500 })] }),
  ]);
  const s = R.paraRevisarDeResumen(r, plano);
  const falta = s.find((x) => x.tipo === "sin_dibujar");
  assert.ok(falta, "lo firmado para más adelante sin distribuir no sale en «Para revisar»");
  assert.deepEqual(falta.items.map((i) => [i.rotulo, i.frase, i.empiezaEn]), [
    ["GON-01 · B", "falta distribuir 10 % (1 participación) · ya corre.", 0],
    ["GON-01 · A", "falta distribuir 20 % · empieza el 22 oct (en 5 días).", 5],
    ["PUN-03", "falta distribuir 25 % · empieza el 16 nov (en 30 días).", 30],
  ], "lo futuro no se cuenta desde la firma, se suma con lo de hoy, cuenta lo ya dibujado o una reserva, o no va de lo urgente a lo menos");
  assert.deepEqual(falta.items[1].abrir, { fixtureId: "f1", cara: "A" }, "«Abrir en Distribución» se perdió en lo futuro");
  assert.equal(R.cuantasParaRevisar(s), 3, "lo que falta distribuir no suma a la cuenta de «Para revisar»");
  // Y en pantalla: la cifra de días en rojo con 7 o menos, y el botón de siempre.
  const comp = sinComent(fuenteDe("components/Distribucion/RevisarParticipaciones.tsx"));
  // (Rediseño, PR 2: la cifra va en la pastilla del renglón, roja con 7 o
  // menos; una reserva, con los días que le quedan antes de caducar.)
  assert.match(comp, /const dias = it\.caducaEn \?\? it\.empiezaEn;/, "el renglón no sabe cuántos días faltan");
  assert.match(comp, /const apuro = dias !== undefined && dias <= \(it\.caducaEn !== undefined \? 0 : DIAS_DE_APURO\);/, "los días de «Falta distribuir» no se pintan de rojo con 7 o menos");
  assert.match(comp, /className=\{`pill mono \$\{dias === undefined \? "resto" : apuro \? "ocupado" : "entra"\}`\}/, "la pastilla de los días no es roja con apuro");
  assert.match(comp, /: dias <= 0 \? "corre" : `\$\{dias\}d`\}/, "el renglón no dice cuántos días faltan");
  assert.match(comp, /onClick=\{\(\) => abrir\(it\.abrir!\.fixtureId, it\.abrir!\.cara\)\}[\s\S]{0,600}Abrir en Distribución/, "«Abrir en Distribución» se fue");
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

prueba("una RESERVA viva de una cara o una parte no es un contrato en Supervisar: «Reservado», fuera del canon, los contratos, los vencimientos, el montaje y «Quién paga» (conLaReserva, ejecutado)", () => {
  const t = fuenteDe("pages/DashboardView.tsx");
  const i = t.indexOf("function conLaReserva(");
  assert.ok(i >= 0, "no está conLaReserva");
  const fuente = t.slice(i, t.indexOf("\n}\n", i) + 2);
  const js = esbuildMod.transformSync(fuente, { loader: "ts" }).code;
  const fullSpaceCode = (sede, c) => (c.startsWith(`${sede}-`) ? c : `${sede}-${c}`);
  const conLaReserva = new Function("fullSpaceCode", `${js}\nreturn conLaReserva;`)(fullSpaceCode);
  const f = { sede: "CENTRO", code: "GON-02" };
  const cara = { fixture: f, face: "A", code: "GON-02", status: "occupied", supplierName: "X", endDate: "2026-11-30", negotiatedValue: 9 };
  const mapa = { "CENTRO-GON-02": { status: "occupied", reservaHasta: "2026-11-02" }, "CENTRO-GON-03": { status: "occupied", reservaHasta: null } };
  const r = conLaReserva(cara, mapa, "CENTRO");
  assert.equal(r.status, "reserved", "una reserva viva sigue contando como contrato");
  assert.equal(r.reservaHasta, "2026-11-02");
  assert.equal(conLaReserva({ ...cara, code: "GON-03" }, mapa, "CENTRO").status, "occupied", "un contrato pasó a «Reservado»");
  const parte = { ...cara, code: "GON-02-EN1" };
  assert.equal(conLaReserva(parte, { "CENTRO-GON-02-EN1": { reservaHasta: "2026-11-05" } }, "CENTRO").status, "reserved", "una parte reservada cuenta como contrato");
  // Al trabajador le llega sólo la marca `reservado`, sin fechas: «Reservado»
  // sin fecha, nunca «Ocupado sin contrato» (que es `occupied` sin fechas).
  const delTrabajador = { ...cara, supplierName: "", endDate: "", negotiatedValue: 0 };
  const rt = conLaReserva(delTrabajador, { "CENTRO-GON-02": { status: "occupied", reservado: true } }, "CENTRO");
  assert.equal(rt.status, "reserved", "al trabajador una reserva le queda «Ocupado sin contrato»");
  assert.ok(!rt.reservaHasta, "al trabajador la reserva le inventa una fecha");
  assert.equal(conLaReserva(delTrabajador, { "CENTRO-GON-02": { status: "occupied" } }, "CENTRO").status, "occupied",
    "un ocupado sin contrato de verdad pasó a «Reservado»");
  // Las cuentas de Supervisar pasan TODAS por ahí: caras, partes y filas.
  const v = sinComent(t);
  const k = v.slice(v.indexOf("const kpis = useMemo("), v.indexOf("const rangeTally"));
  assert.match(k, /const reserva = \(e: FaceEntry\) => conLaReserva\(e, estadoComercial, sede\);/);
  assert.match(k, /const caras = fixtures\.flatMap\(commercialFacesOf\)\.map\(reserva\);/, "el canon y la ocupación cuentan una reserva de cara como contrato");
  assert.match(k, /const partes = fixtures\.flatMap\(partesVendidasDe\)\.map\(reserva\);/, "una parte reservada cuenta como contrato");
  assert.match(k, /const visibles = isAdmin \? partes : fixtures\.flatMap\(partesVisiblesDe\)\.map\(reserva\);/);
  assert.match(v, /const espaciosDelMueble = useCallback\(\s*\(f: UnifiedFixture\): FaceEntry\[\] => \{[^}]*?\.map\(\(e\) => conLaReserva\(e, estadoComercial, sede\)\);/,
    "la tabla y «Contratado sin montar» cuentan una reserva como contrato");
  const m = v.slice(v.indexOf("const montaje = useMemo("), v.indexOf("const montaje = useMemo(") + 1500);
  assert.match(m, /fixtures\.flatMap\(espaciosDelMueble\)/, "el montaje no sale de las filas con la reserva marcada");
  assert.match(m, /if \(fase !== "vigente" && fase !== "pendiente"\) return;/, "el montaje cuenta lo que no es contrato");
  // «Reservado» dice hasta cuándo, en la tabla y en la ficha; y no se renueva.
  assert.match(v, /\{entry\.reservaHasta && \(\s*<span style=\{\{ color: "var\(--ink-3\)" \}\}> hasta \{diaCorto\(entry\.reservaHasta\)\}<\/span>/);
  assert.match(v, /if \(entry\.reservaHasta \|\| !entry\.supplierName\.trim\(\) \|\| !entry\.endDate\) return false;/, "una reserva se ofrece a renovar");
  // La fecha no se le pega al mueble (ni viaja en el PUT del plano), y el mapa crudo la compara.
  const mueble0 = { id: "f", code: "GON-02", type: "cross", sede: "CENTRO" };
  const [fusionado] = fusionarEstadoComercial("CENTRO", [mueble0], { "CENTRO-GON-02": { ...vendido(), reservaHasta: "2026-11-02" } });
  assert.ok(!("reservaHasta" in fusionado), "la fecha de la reserva se pegó al mueble");
  assert.match(sinComent(fuenteDe("utils/guardadoDelPlano.ts")), /"startDate", "endDate", "observation", "reservaHasta", "reservado",\s*"leaseId", "proximoLeaseId",\s*\] as const;/);
  assert.match(sinComent(fuenteDe("store/fixtureStore.ts")), /\(x\.reservaHasta \?\? null\) !== \(y\.reservaHasta \?\? null\) \|\|\s*!!x\.reservado !== !!y\.reservado \|\|\s*\(x\.leaseId \?\? null\) !== \(y\.leaseId \?\? null\) \|\|\s*\(x\.proximoLeaseId \?\? null\) !== \(y\.proximoLeaseId \?\? null\)\) return false;/,
    "el mapa crudo no se actualiza cuando una reserva se confirma con los mismos datos (o cambia el contrato que dibuja la cara)");
  // La marca de la reserva tampoco se le pega al mueble.
  const [fusionado2] = fusionarEstadoComercial("CENTRO", [mueble0], { "CENTRO-GON-02": { ...vendido(), reservado: true } });
  assert.ok(!("reservado" in fusionado2), "la marca de la reserva se pegó al mueble");
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
  // (Fase 2 · I4, E5b: con la cara que se tocó. La guarda exige eso además
  // de lo de antes.)
  assert.match(v, /onNegociar=\{isAdmin && !porParticipacion\(selected\) \? \(\) => negociar\(selected, entradaDetalle\.face\) : undefined\}/,
    "el globito de Supervisar ofrece vender entera una cara por participación, u otra cara que la tocada");
  // Lo del trabajador va sólo al trabajador (la administración tiene el bloque completo).
  assert.match(v, /\{!hasContract && pc \? \(\s*!isAdmin && <CaraPorParticipacion fixture=\{fixture\} face=\{entry\.face\} \/>/);
});

prueba("«Renovar» de una participación abre Vender armado, y sólo renueva un contrato vivo", () => {
  // Rediseño de Vender (PR 1): ya no va a Distribución; abre Vender con el %
  // de la cara. Marca el término que renueva (`renueva`) sólo si es un
  // contrato vigente o firmado: sobre una reserva, un vencido o un cancelado
  // es un contrato nuevo, sin `renueva` y sin las fechas que lo seguirían.
  const v = sinComent(fuenteDe("pages/DashboardView.tsx"));
  assert.match(v, /if \(t && t\.estado === "contrato" && \(t\.estado_visible === "vigente" \|\| t\.estado_visible === "firmado"\)\) termino = t\.id;/,
    "renovar marca para renovar una reserva, un vencido o un cancelado");
  assert.match(v, /renueva: termino \? \{ \[caraCompleta\]: termino \} : \{\},/, "renueva un término que no es un contrato vivo");
  assert.match(v, /desde: termino && desde \? toISODate\(desde\) : "",/, "sobre algo que no se renueva, arranca después de un contrato que no corre");
  assert.match(v, /negociar\(f, entry\.face, semillaPc\);/, "renovar una participación no abre Vender");
  // El botón «Renovar» de la ficha de Supervisar (las participaciones de la
  // cara) también abre Vender: nunca el Editor 3D → Distribución.
  const pdc = sinComent(fuenteDe("components/Distribucion/ParticipacionesDeLaCara.tsx"));
  assert.doesNotMatch(pdc, /abrir\([^)]*,[^)]*,[^)]*\)/, "«Renovar» de la ficha abre Distribución con el término");
  assert.doesNotMatch(pdc, /renovable\.id/, "«Renovar» de la ficha manda el término a Distribución");
  assert.match(pdc, /\{renovable && onRenovar && \(\s*<button\s+type="button"\s+onClick=\{\(\) => onRenovar\(p\.numero\)\}/,
    "«Renovar» de la ficha no pasa por `onRenovar`");
  assert.match(v, /<ParticipacionesDeLaCara\b[^>]*?onRenovar=\{onRenovarParte\s*\? \(n\) => \{\s*const parte = partirCodigo\(`X-PC\$\{n\}`\)\.parte;\s*onRenovarParte\(\{ \.\.\.entry, code: codigoDeParte\(fixture\.code, entry\.face, parte\), parte \}\);/,
    "la ficha no conecta «Renovar» de una participación con `renovar` (que abre Vender)");
  assert.match(v, /if \(entry\.parte && esParticipacion\(entry\.parte\)\) \{\s*void renovarParticipacion\(entry\);\s*return;\s*\}/,
    "`renovar` no manda una participación a `renovarParticipacion`");
});

/* ── fase 2 · I4: Vender y los bajos ─────────────────────────────────────────
   El ámbar de Vender contaba tres hechos como si fueran días (se libera en el
   periodo, partes vendidas, una participación comprometida) y «al cerrar»
   sumaba caras por participación que nunca entran a ese contrato; la pestaña
   activa de la ficha del plano 2D no se leía en tema claro; los rótulos largos
   de once muebles por participación tapaban la sala; una cara en Mantenimiento
   con participaciones vivas salía «parcial» y «queda 75 %»; el globo de
   Supervisar hablaba de la A al tocar la B; y delante del proveedor de la
   reunión, la dueña pidió «sólo lo suyo y lo libre». */
console.log("\nFase 2 · Vender y los bajos\n");

prueba("fase 2 · el ámbar se separa por motivo: se libera, partes vendidas o participación (`motivoDelParcial`, ejecutado)", () => {
  assert.equal(PC.motivoDelParcial(true, null), "participacion");
  assert.equal(PC.motivoDelParcial(true, { porPartes: "Por participación · queda 40 %" }), "participacion");
  assert.equal(PC.motivoDelParcial(false, { porPartes: "1 de 3 puertas vendida" }), "partes");
  assert.equal(PC.motivoDelParcial(false, { desde: new Date(2026, 10, 3), diasLibres: 12 }), "dias");
  assert.equal(PC.motivoDelParcial(false, null), "dias");
  assert.equal(PC.motivoDelParcial(false, undefined), "dias");
});

prueba("fase 2 · UNA cuenta para la clave, la columna y el pie; «al cerrar» es lo que ESTE contrato puede tomar (`contarElPeriodo`, ejecutado)", () => {
  const caras = [
    { dispo: "libre", deParticipacion: false },
    { dispo: "libre", deParticipacion: true },
    { dispo: "parcial", deParticipacion: false, motivo: "dias" },
    { dispo: "parcial", deParticipacion: false, motivo: "partes" },
    { dispo: "parcial", deParticipacion: true, motivo: "participacion" },
    { dispo: "parcial", deParticipacion: true },                          // sin motivo: por participación
    { dispo: "tomado", deParticipacion: false },
    { dispo: "libre", deParticipacion: false, enContrato: true },        // ya en el contrato: no cuenta
  ];
  const c = PC.contarElPeriodo(caras);
  assert.deepEqual(c, { libres: 2, libresPc: 1, dias: 1, partes: 1, participacion: 2, tomados: 1 });
  assert.equal(PC.enParte(c), 4);
  // Rediseño de Vender (PR 1): una cara por participación se vende EN VENDER
  // (una línea de porcentaje), así que «al cerrar» la cuenta como cualquier
  // otra: es libres + el «+N», lo mismo que la columna. Nunca lo tomado ni lo
  // que ya está en el contrato.
  assert.equal(PC.alCerrar(c), 6, "«al cerrar» no es libres + en parte (deja afuera las caras por participación o cuenta lo tomado)");
  assert.equal(PC.alCerrar(c), c.libres + PC.enParte(c));
  for (const k of [0, 1, 2, 3, 5, 8]) {
    const muchas = Array.from({ length: k * 3 }, (_, i) => caras[(i * 7 + k) % caras.length]);
    const cc = PC.contarElPeriodo(muchas);
    assert.equal(PC.alCerrar(cc), cc.libres + cc.dias + cc.partes + cc.participacion, "«al cerrar» se aparta de la columna");
    assert.equal(PC.alCerrar(cc) + cc.tomados, muchas.filter((x) => !x.enContrato).length, "«al cerrar» + tomadas no da lo que hay fuera del contrato");
  }
  assert.equal(PC.desgloseDelParcial(c), "1 se libera en el periodo · 1 con partes vendidas · 2 por participación");
  assert.equal(PC.sinLasDeParticipacion, undefined, "volvió «Sin las N por participación: se cargan en el Editor 3D → Distribución»");
  assert.equal(PC.conLasDeParticipacion(c), "Incluye 3 por participación: entran al contrato como una línea de porcentaje cada una.");
  // Singular, plural y vacío.
  assert.equal(PC.desgloseDelParcial({ ...c, dias: 3, partes: 0, participacion: 0 }), "3 se liberan en el periodo");
  assert.equal(PC.desgloseDelParcial(PC.contarElPeriodo([])), "");
  assert.deepEqual(PC.contarElPeriodo([]), { libres: 0, libresPc: 0, dias: 0, partes: 0, participacion: 0, tomados: 0 });
  assert.equal(PC.conLasDeParticipacion(PC.contarElPeriodo([{ dispo: "libre", deParticipacion: true }])),
    "Incluye 1 por participación: entra al contrato como una línea de porcentaje.");
  assert.equal(PC.conLasDeParticipacion(PC.contarElPeriodo([{ dispo: "libre", deParticipacion: false }])), null);
  // Lo que está en el contrato no cuenta en ningún lado; un parcial sin motivo ni participación es «días».
  assert.deepEqual(PC.contarElPeriodo([{ dispo: "tomado", deParticipacion: false, enContrato: true }, { dispo: "parcial", deParticipacion: false }]),
    { libres: 0, libresPc: 0, dias: 1, partes: 0, participacion: 0, tomados: 0 });
  // Vender lo mira el proveedor: sólo cuentas, ni un % ni un nombre.
  assert.doesNotMatch(PC.desgloseDelParcial(c) + PC.conLasDeParticipacion(c), /%|\$|proveedor|marca|Distribuci/i);
});

prueba("fase 2 · la clave, la columna y el pie de Vender cuentan con `contarElPeriodo`: nada a mano, ni «Vence dentro» ni «Se libera en el periodo»", () => {
  const t = sinComent(fuenteDe("pages/DashboardView.tsx"));
  const def = (nombre) => {
    const i = t.indexOf(`function ${nombre}(`);
    return i < 0 ? "" : t.slice(i, t.indexOf("\n}\n", i));
  };
  const leyenda = def("MapLegend");
  assert.ok(leyenda.length > 200, "no está MapLegend");
  assert.doesNotMatch(leyenda, /Vence dentro|Se libera en el periodo/, "la clave nombra el ámbar como si fueran días");
  assert.match(leyenda, /tally: ConteoDelPeriodo;/);
  assert.match(leyenda, /l: modo === "vender" \? RANGE_LABEL\.parcial : RANGE_LABEL_PARCIAL_SUPERVISAR, n: enParte\(tally\),\s*t: desgloseDelParcial\(tally\) \|\| undefined/,
    "el renglón ámbar no cuenta las tres cosas o no las desglosa");
  assert.match(leyenda, /<span key=\{o\.l\} title=\{o\.t\}>/);
  assert.match(t, /parcial: "Disponible en parte",/);
  assert.match(t, /const RANGE_LABEL_PARCIAL_SUPERVISAR = "Vendido en parte";/);
  // Las tres cuentas, de la misma fila por cara.
  assert.match(t, /motivo: motivoDelParcial\(deParticipacion, como\)/, "la fila de cada cara no dice por qué está en parte");
  // (Corrección de Supervisar, PR 2: la cuenta de Supervisar pasa por
  // `comoLaVeSupervisar` —una cara vendida entera parte del periodo no está
  // «vendida en parte»—; más abajo, «Supervisar cuenta UNA vez».)
  assert.match(t, /const rangeTally = useMemo\(\(\) => contarElPeriodo\(filasSupervisar\.values\(\)\), \[filasSupervisar\]\);/);
  assert.match(t, /const tallyVender = useMemo\(\s*\(\) => contarElPeriodo\(\[\.\.\.filasDelPeriodo\]\.map\(\(\[clave, fila\]\) => \(\{ \.\.\.fila, enContrato: carasDelContrato\.includes\(clave\) \}\)\)\),/);
  assert.match(t, /cuenta: contarElPeriodo\(filas\)/, "la fila de la tarifa no cuenta con contarElPeriodo");
  assert.match(t, /if \(fila\) e\.filas\.push\(\{ \.\.\.fila, enContrato \}\);/);
  assert.doesNotMatch(t, /parciales\+\+|libres\+\+|tomados\+\+/, "queda un conteo a mano");
  // La tarifa: el encabezado, el «+N» con su porqué y «al cerrar» sin lo que no entra.
  assert.match(t, /<th scope="col" className="der2 c2">Libres · en parte<\/th>/);
  assert.doesNotMatch(t, /Libres · entran|adentro del periodo`/);
  // El «+N» dice por qué sin mandar a nadie al Editor 3D: una cara por
  // participación se vende acá (rediseño de Vender, PR 1).
  assert.match(t, /className="entran"\s*title=\{porQue\}/);
  assert.doesNotMatch(t, /DONDE_SE_CARGAN|se cargan? en el Editor 3D/, "Vender (o Supervisar) vuelve a decir que las participaciones se cargan en Distribución");
  assert.match(t, /\+\{nParte\}/);
  assert.match(t, /\{alCerrar\(tallyVender\)\} al cerrar/);
  assert.doesNotMatch(t, /tallyVender\.libres \+ tallyVender\.parciales/, "«al cerrar» vuelve a sumar todo lo ámbar");
  assert.match(t, /title=\{conLasDeParticipacion\(tallyVender\) \?\? undefined\}>\s*\{alCerrar\(tallyVender\)\} al cerrar/);
  assert.match(t, /title=\{desgloseDelParcial\(tallyVender\)\}>\+\{enParte\(tallyVender\)\}/);
});

/* Rediseño, PR 3: la ficha deja de ser el cajón oscuro y sigue el tema (panel
   B). Esta guarda REEMPLAZA a la que exigía los tokens del cajón oscuro en la
   pestaña de la cara y en el destino, y es más estricta: ningún `--dark-*` ni
   clase `dark-*` en todo el panel (tampoco --accent ni --signal), la cara
   activa y el destino con su estado dicho a la tecnología de asistencia
   (`aria-pressed`, `role="switch"` + `aria-checked`), y lo elegido pintado en
   tinta plena sobre la superficie del tema (`plano.css`), que se lee en claro
   y en oscuro. */
prueba("rediseño PR 3 · la ficha del plano 2D sigue el tema: sin cajón oscuro, la cara activa y el destino se leen en los dos temas", () => {
  const plano = sinComent(fuenteDe("components/FloorPlan2D/FloorPlan2D.tsx"));
  const panel = plano.slice(plano.indexOf("function AssignmentPanel("), plano.indexOf("function FilaDelPanel("));
  assert.ok(panel.length > 1000, "no está AssignmentPanel");
  assert.doesNotMatch(panel, /--dark-|\bdark-(?:ink|line|surface|bg)/, "la ficha vuelve a pintar con el cajón oscuro");
  assert.doesNotMatch(panel, /var\(--accent\)|var\(--accent-ink\)/, "la ficha pinta con --accent");
  assert.doesNotMatch(panel, /--signal/, "el amarillo es sólo del botón principal");
  assert.match(panel, /<div className="p2-seg ancho" role="group" aria-label="Cara" data-caras>[\s\S]{0,200}onClick=\{\(\) => setActiveFace\(f\)\} aria-pressed=\{activeFace === f\}/,
    "la cara activa no se dice (o no es el control segmentado del tema)");
  assert.match(panel, /<button type="button" role="switch" className="p2-sw" aria-checked=\{rentable\}/, "«Se vende» no dice si está encendido");
  const css = sinComent(fuenteDe("plano.css"));
  assert.match(css, /\.plano2d \.p2-seg button\[aria-pressed="true"\] \{ background: var\(--ink-1\); color: var\(--surface\);/,
    "lo elegido no va en tinta plena sobre la superficie del tema");
  assert.match(css, /\.plano2d \.p2-sw\[aria-checked="true"\] \{ background: var\(--ink-1\);/, "el interruptor encendido no se distingue");
  assert.doesNotMatch(css, /--dark-/, "plano.css lee el cajón oscuro");
});

prueba("fase 2 · el rótulo del plano de una cara por participación es la línea CORTA; el cartel del mouse sigue con la larga (ejecutado)", () => {
  assert.equal(PC.textoCortoDeParticipacion({ dispo: "parcial", quedaPb: 4500 }, true), "queda 45 %");
  assert.equal(PC.textoCortoDeParticipacion({ dispo: "parcial", quedaPb: 3333 }, true), "queda 33,33 %");
  assert.equal(PC.textoCortoDeParticipacion({ dispo: "parcial", quedaPb: 4500 }, false), "por participación");
  assert.equal(PC.textoCortoDeParticipacion({ dispo: "tomado", quedaPb: 0 }, true), "tomada");
  assert.equal(PC.textoCortoDeParticipacion({ dispo: "tomado", quedaPb: 0 }, false), "tomada");
  for (const d of [{ dispo: "parcial", quedaPb: 4500 }, { dispo: "tomado", quedaPb: 0 }, { dispo: "libre", quedaPb: 10000 }]) {
    assert.doesNotMatch(PC.textoCortoDeParticipacion(d, false), /%|\d/, "el trabajador ve un %");
    assert.ok(PC.textoCortoDeParticipacion(d, true).length <= 18, "la línea corta no es corta");
  }
  const t = sinComent(fuenteDe("pages/DashboardView.tsx"));
  const k = t.indexOf("function IsoMap(");
  const iso = t.slice(k, t.indexOf("\n}\n", k));
  assert.ok(iso.length > 2000, "no está IsoMap");
  assert.match(iso, /const corto = dispo === "parcial" \? cortoDe\?\.\(f, entry\) \?\? null : null;/);
  assert.match(iso, /\.\.\.\(corto \? \{ corto \} : \{\}\),/);
  // La de participación cede como una libre ante «libre 14 oct».
  assert.match(iso, /peso: choque \? 0 : corto \? 2 : dispo === "parcial" \? 1 : dispo === "libre" \? 2 : 3,/);
  assert.match(iso, /const linea = l\.corto \|\| l\.fecha;/);
  assert.match(iso, /\{linea && <tspan className="p-fec" x=\{ax\} dy="1\.18em">\{linea\}<\/tspan>\}/);
  // El cartel del mouse sigue diciendo la larga («Por participación · queda 45 %»).
  assert.match(iso, /const partes = porPartes\?\.\(f, face\) \?\? null;\s*if \(partes\) return partes;/);
  assert.equal((t.match(/cortoDe=\{cortoDeCara\}/g) ?? []).length, 2, "Vender y Supervisar no dibujan el plano con el mismo rótulo");
  assert.match(t, /const d = dispoDeParticipacion\(f, participacionDe\(f, face\.face\), mapRange\.from, mapRange\.to\);\s*return d && d\.dispo !== "libre" \? textoCortoDeParticipacion\(d, isAdmin\) : null;/,
    "la línea corta no sale de la ocupación del periodo, o el % no depende de quién mira");
});

prueba("fase 2 · lo puesto a mano y la venta entera mandan sobre la ocupación de las participaciones: en Vender, en el globo y en la ficha, como en el plano (ejecutado)", () => {
  const p2 = (n) => String(n).padStart(2, "0");
  const dia = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const en = (n) => { const d = new Date(hoy); d.setDate(d.getDate() + n); return d; };
  const rob = (status) => porPc("ROB-01", { type: "robatope", gondolaType: undefined, status, startDate: "", endDate: "" });
  const par = { ocupacion: { intervalos: [{ desde: dia(en(-30)), hasta: dia(en(120)), pb: 2500 }], fisicos: [] }, hoy: dia(hoy) };
  const ix = PC.indiceDePartes({});
  const dispo = (f, desde, hasta) => PC.disponibilidadDeCara(f, "A", {}, ix, "NAVE", desde, hasta, par);
  // Disponible: la ocupación la pinta.
  assert.equal(dispo(rob("free"), hoy, en(30)), "parcial");
  // En Mantenimiento o Reservada a mano HOY: tomada, aunque quede 75 %.
  assert.equal(dispo(rob("maintenance"), hoy, en(30)), "tomado", "una cara en Mantenimiento con 25 % comprometido sale «parcial» en Vender");
  assert.equal(dispo(rob("reserved"), hoy, en(30)), "tomado");
  // Esos estados no tienen fechas: un periodo que no incluye hoy no lo cubren, y la ocupación vuelve a pintar.
  assert.equal(dispo(rob("maintenance"), en(40), en(70)), "parcial");
  assert.equal(PC.tomadaPorLoSuyo(rob("maintenance"), "A", {}, "NAVE", hoy, en(30)), true);
  assert.equal(PC.tomadaPorLoSuyo(rob("free"), "A", {}, "NAVE", hoy, en(30)), false);
  // «Cuándo se libera» tampoco dice «queda 75 %» de una cara en Mantenimiento.
  const como = (f) => PC.comoSeLiberaLaCara(f, "A", {}, ix, "NAVE", hoy, en(30), { ...par, conPorcentaje: true });
  assert.deepEqual(como(rob("free")), { porPartes: "Por participación · queda 75 %" });
  assert.ok(!/queda|participaci/i.test(JSON.stringify(como(rob("maintenance")) ?? null)), "una cara en Mantenimiento dice lo que queda de sus participaciones");
  // El globo y la ficha: nunca «disponible para vender» sobre lo puesto a mano.
  const d = PC.dispoDeParticipacion(rob("free"), par, dia(hoy), dia(hoy));
  const mant = PC.textoDeLoComprometido(d, true, { propio: "maintenance" });
  assert.equal(mant, "Por participación · comprometido 25 % · queda 75 % · En mantenimiento: no se ofrece.");
  assert.doesNotMatch(mant, /disponible/i);
  assert.equal(PC.textoDeLoComprometido(d, true, { propio: "reserved" }), "Por participación · comprometido 25 % · queda 75 % · Reservada a mano: no se ofrece.");
  assert.equal(PC.textoDeLoComprometido(d, false, { propio: "maintenance" }), "Por participación · En mantenimiento: no se ofrece.");
  assert.equal(PC.textoDeLoComprometido(null, true, { propio: "maintenance" }), "Se vende por participación · En mantenimiento: no se ofrece.");
  // Disponible: lo de antes, con la opción o sin ella.
  assert.equal(PC.textoDeLoComprometido(d, true, { propio: "free" }), PC.textoDeLoComprometido(d, true));
  assert.equal(PC.textoDeLoComprometido(d, true), "Por participación · comprometido 25 % · queda 75 % — disponible para vender en Vender.");
  // Vender y Supervisar: lo puesto a mano pasa antes que la ocupación en «Cuándo se libera».
  const t = sinComent(fuenteDe("pages/DashboardView.tsx"));
  assert.match(t, /\? \(tomadaPorLoSuyo\(f, face\.face, estadoComercial, sede, mapRange\.from, mapRange\.to\)\s*\? comoSeLiberaLaCara\(f, face\.face, estadoComercial, indicePartes, sede, mapRange\.from, mapRange\.to\)\s*: comoSeLiberaPorParticipacion\(/,
    "«Cuándo se libera» mira la ocupación antes que lo puesto a mano");
});

prueba("fase 2 · la ficha del plano 2D no repite «en el Editor 3D → Distribución» (`conLugar`, ejecutado)", () => {
  const g = porPc("ROB-01", { type: "robatope", gondolaType: undefined });
  const hoy = "2026-10-17";
  const d = PC.dispoDeParticipacion(g, { ocupacion: { intervalos: [{ desde: "2026-10-01", hasta: "2026-12-31", pb: 5500 }], fisicos: [] }, hoy }, hoy, hoy);
  assert.equal(PC.textoDeLoComprometido(d, true, { conLugar: false }), "Por participación · comprometido 55 % · queda 45 % — disponible para vender.");
  assert.equal(PC.textoDeLoComprometido(d, true, { conLugar: true }), PC.textoDeLoComprometido(d, true));
  // Tomada: igual con y sin el lugar.
  const tomada = { dispo: "tomado", quedaPb: 0 };
  assert.equal(PC.textoDeLoComprometido(tomada, true, { conLugar: false }), PC.textoDeLoComprometido(tomada, true));
  // La ficha lo pide sin lugar; el renglón de abajo dice dónde se cargan (una vez).
  const plano = sinComent(fuenteDe("components/FloorPlan2D/FloorPlan2D.tsx"));
  // (Rediseño, PR 3: el panel B termina donde empieza su renglón,
  // `FilaDelPanel`; antes, en `ToolbarBtn`, que se fue con la barra vieja.)
  const panel = plano.slice(plano.indexOf("function AssignmentPanel("), plano.indexOf("function FilaDelPanel("));
  assert.ok(plano.indexOf("function FilaDelPanel(") > plano.indexOf("function AssignmentPanel("), "el panel B no termina en `FilaDelPanel`");
  assert.equal((panel.match(/\{DONDE_SE_CARGAN\}/g) ?? []).length, 1);
  assert.match(panel, /textoDeLoComprometido\(dispoPc, isAdmin, \{ propio: face\.status, conLugar: false \}\)/);
});

prueba("fase 2 · el globo de Supervisar habla de la cara TOCADA, no siempre de la A (E5b)", () => {
  const t = sinComent(fuenteDe("pages/DashboardView.tsx"));
  const i = t.indexOf("function FixturePopover(");
  const globo = t.slice(i, t.indexOf("\n}\n", i));
  assert.ok(globo.length > 1000, "no está FixturePopover");
  assert.match(globo, /fixture, cara = "A", anchor, isAdmin,/);
  assert.match(globo, /const entry = faces\.find\(\(x\) => x\.face === cara\) \?\? faces\[0\];/, "el globo mira la A al tocar la B");
  assert.doesNotMatch(globo, /const entry = faces\[0\];/);
  // Las puertas, la ocupación de hoy y la pastilla son de ESA cara.
  assert.match(globo, /\.filter\(\(p\) => p\.sufijo\.startsWith\("B·"\) === \(entry\.face === "B"\)\)/);
  assert.match(globo, /const dispoPc = useDispoDeHoy\(fixture, entry\.face\);/);
  assert.match(globo, /<StatusPill fixture=\{fixture\} face=\{entry\} \/>/);
  // La llamada: la cara de la ficha (`entradaDetalle`), y Renovar y «Abrir en Distribución» con ella.
  assert.match(t, /<FixturePopover\s+fixture=\{selected\}\s+cara=\{entradaDetalle\.face\}/);
  assert.match(t, /onRenovar=\{isAdmin && renovable\(entradaDetalle\)\s*\? \(\) => renovar\(entradaDetalle\)\s*: undefined\}/);
  assert.doesNotMatch(t, /facesOf\(selected\)\[0\]/, "algo del globo sigue yendo a la A");
});

prueba("fase 2 · lo SUYO del proveedor que está delante: su pico en el periodo; otro proveedor nunca suma (`loDelProveedor`, ejecutado)", () => {
  const hoy = "2026-10-19";
  let id = 0;
  const contrato = (pb, desde, hasta, extra = {}) => ({ id: ++id, spaceId: id, numero: id, estado: "contrato", pb, supplierId: 0, marca: null,
    desde, hasta, caduca: null, bajaFecha: null, lease: { isActive: true, startDate: desde, endDate: hasta }, ...extra });
  const reserva = (pb, desde, hasta, caduca) => ({ id: ++id, spaceId: id, numero: id, estado: "reserva", pb, supplierId: 0, marca: null,
    desde, hasta, caduca, bajaFecha: null, lease: null });
  const de = (proveedor, termino) => ({ proveedor, termino });
  const terminos = [
    de("Kellogg's", contrato(2500, "2026-10-01", "2026-12-31")),
    de("Kellogg's", reserva(1000, "2026-11-01", "2026-11-30", "2026-10-25")),   // se sostiene: cuenta en noviembre
    de("Alpina", contrato(4000, "2026-10-01", "2026-12-31")),
    de("Postobón", contrato(3000, "2026-10-01", "2026-12-31")),
    de(null, contrato(500, "2026-10-01", "2026-12-31")),
  ];
  assert.equal(PC.loDelProveedor(terminos, "Kellogg's", hoy, hoy, hoy), 2500);
  assert.equal(PC.loDelProveedor(terminos, "Kellogg's", "2026-11-01", "2026-11-30", hoy), 3500, "su reserva no cuenta");
  assert.equal(PC.loDelProveedor(terminos, "  KELLOGG'S ", hoy, hoy, hoy), 2500, "mayúsculas y espacios lo vuelven otro proveedor");
  assert.equal(PC.loDelProveedor(terminos, "Alpina", hoy, hoy, hoy), 4000);
  // Otro proveedor (o uno sin nada en la cara) nunca suma lo de los demás.
  assert.equal(PC.loDelProveedor(terminos, "Nutresa", hoy, hoy, hoy), 0, "suma lo de otros");
  assert.equal(PC.loDelProveedor(terminos, "Postobon", hoy, hoy, hoy), 0, "sin la tilde es otro nombre: no se adivina");
  // Sin proveedor nombrado, nada: la pantalla dice sólo lo libre.
  for (const p of [null, undefined, "", "   "]) assert.equal(PC.loDelProveedor(terminos, p, hoy, hoy, hoy), 0);
  // Lo que no cuenta: una reserva caducada, un contrato cancelado, lo que cae fuera del periodo.
  const otros = [
    de("Kellogg's", reserva(2000, "2026-10-01", "2026-12-31", "2026-10-18")),
    de("Kellogg's", contrato(3000, "2026-10-01", "2026-12-31", { lease: { isActive: false, startDate: "2026-10-01", endDate: "2026-12-31" }, bajaFecha: "2026-10-10" })),
    de("Kellogg's", contrato(5000, "2027-02-01", "2027-03-31")),
  ];
  assert.equal(PC.loDelProveedor(otros, "Kellogg's", hoy, "2026-12-31", hoy), 0);
  assert.equal(PC.loDelProveedor(otros, "Kellogg's", hoy, "2027-03-31", hoy), 5000);
  // Nunca más que la cara entera.
  assert.equal(PC.loDelProveedor([de("K", contrato(8000, "2026-10-01", "2026-12-31")), de("k", contrato(8000, "2026-10-01", "2026-12-31"))], "K", hoy, hoy, hoy), 10000);
});

/* ── Supervisar, PR 2: «Para revisar» en tres grupos y la plata en una unidad ──
   El dibujo aprobado (`docs/maquetas/rediseno-2026-10/supervisar.html`) trae la
   lista «Dónde queda cada cosa»: nada se va de la pantalla. Cada sección de
   esa lista está en exactamente un grupo (o en «Hoy» / «30 días» según cuándo
   hay que actuar, y entonces cada aviso en uno solo), la pastilla roja es la
   suma de los tres y cada sección cuenta, el selector «Al mes | Total» manda
   en las tres cosas que dicen plata y «Al mes» reparte con `utils/meses.ts`. */
console.log("\nSupervisar · «Para revisar» en tres grupos y la plata en una unidad\n");
const cargarTs = async (rel) => {
  const { outputFiles: o } = await build({
    entryPoints: [join(aqui, "..", "src", ...rel.split("/"))], bundle: true, format: "esm", write: false, platform: "neutral",
  });
  const f = join(mkdtempSync(join(tmpdir(), "sup-")), "m.mjs");
  writeFileSync(f, o[0].text);
  return import(pathToFileURL(f).href);
};
const G = await cargarTs("components/Supervisar/paraRevisar.ts");
const PL = await cargarTs("components/Supervisar/plata.ts");

/** La lista del dibujo, renglón por renglón, con dónde va cada cosa. */
const DEL_DIBUJO = [
  ["Ventas por cargar", "ventas_por_cargar", ["hoy"]],
  ["Falta distribuir", "falta_distribuir", ["hoy", "dias30"]],
  ["Falta planometría", "falta_planometria", ["hoy", "dias30"]],
  ["Vencidos", "vencidos", ["hoy"]],
  ["No se pudo montar", "no_se_pudo_montar", ["hoy"]],
  ["Reservas que caducan hoy · Reservas por caducar", "reservas", ["hoy", "dias30"]],
  ["Por vencer", "por_vencer", ["dias30"]],
  ["Contratado sin montar", "sin_montar", ["dias30"]],
  ["Borradores sin confirmar", "borradores", ["dias30"]],
  ["Contrato sin mueble", "contrato_sin_mueble", ["corregir"]],
  ["Sólo en el plano", "solo_en_el_plano", ["corregir"]],
  ["Ocupado sin contrato", "ocupado_sin_contrato", ["corregir"]],
  // Rediseño, PR 3 (decisión 1): lo marcado «Reservado» a mano, para liberarlo
  // o reservarlo de verdad en Vender.
  ["Marcado reservado a mano", "reservado_a_mano", ["corregir"]],
  ["Participación sin mueble", "participacion_sin_mueble", ["corregir"]],
  ["Sin término", "sin_termino", ["corregir"]],
  ["Distribución con problemas", "distribucion_con_problemas", ["corregir"]],
  ["Distribución para revisar", "distribucion_para_revisar", ["corregir"]],
  ["Bajo tarifa", "bajo_tarifa", ["corregir"]],
  ["Montajes viejos sin reporte", "montajes_viejos", ["corregir"]],
  // Fase 4 de la distribución (dibujo «Supervisar planogramas», 2026-10-25):
  // las cuatro en «Hoy»; la vigente sin aviso, desde el día que empieza a regir.
  ["Planograma montado por revisar", "planograma_por_revisar", ["hoy"]],
  ["Planograma que no coincide", "planograma_no_coincide", ["hoy"]],
  ["No se pudo montar el planograma", "planograma_no_se_pudo", ["hoy"]],
  ["Planograma sin montar", "planograma_sin_montar", ["hoy"]],
  // 2026-10-25: los contratos de antes de Vender, ¿el valor es al mes? Corregir.
  ["Contratos cargados antes: ¿el valor es al mes?", "precio_sin_forma", ["corregir"]],
];

prueba("cada sección del dibujo está en «Para revisar», en su grupo, y cada aviso en uno solo (ejecutado)", () => {
  assert.deepEqual(Object.keys(G.DONDE_VA).sort(), DEL_DIBUJO.map(([, id]) => id).sort(), "una sección de la lista no tiene grupo, o hay una de más");
  for (const [que, id, grupos] of DEL_DIBUJO) {
    const vistos = new Set();
    for (const dias of [undefined, null, -3, 0, 1, 6, 7, 8, 29, 45]) {
      const g = G.grupoDelAviso(id, dias);
      assert.ok(["hoy", "dias30", "corregir"].includes(g), `${que}: grupo ${g}`);
      vistos.add(g);
    }
    assert.deepEqual([...vistos].sort(), [...grupos].sort(), `«${que}» no está donde dice el dibujo`);
    assert.ok(G.tituloDeSeccion(id, grupos[0]).length > 3, `«${que}» no tiene título`);
  }
  // Los umbrales: 7 días o menos para empezar es de hoy; una reserva, si caduca hoy.
  assert.equal(G.grupoDelAviso("falta_distribuir", 7), "hoy");
  assert.equal(G.grupoDelAviso("falta_distribuir", 8), "dias30");
  assert.equal(G.grupoDelAviso("falta_planometria", -2), "hoy", "lo que ya corre sin planometría no es de hoy");
  assert.equal(G.grupoDelAviso("reservas", 0), "hoy");
  assert.equal(G.grupoDelAviso("reservas", 1), "dias30");
  // Las secciones de las participaciones caen en la suya.
  assert.deepEqual(Object.values(G.SECCION_DE_PARTICIPACIONES).every((x) => x in G.DONDE_VA), true);
  const secs = [
    { tipo: "sin_dibujar", items: [{ clave: "a", empiezaEn: 3 }, { clave: "b", empiezaEn: 20 }] },
    { tipo: "por_caducar", items: [{ clave: "c", caducaEn: 0 }, { clave: "d", caducaEn: 5 }] },
    { tipo: "borradores", items: [{ clave: "e" }] },
    { tipo: "sin_termino", items: [{ clave: "f" }] },
  ];
  const claves = (g) => G.deParticipacionesEn(secs, g).flatMap((x) => x.items.map((i) => i.clave)).sort();
  assert.deepEqual(claves("hoy"), ["a", "c"]);
  assert.deepEqual(claves("dias30"), ["b", "d", "e"]);
  assert.deepEqual(claves("corregir"), ["f"]);
});

prueba("la pastilla roja es la suma de los tres grupos, y cada aviso de cada sección cuenta (ejecutado)", () => {
  const avisos = DEL_DIBUJO.flatMap(([, id], k) => [{ seccion: id, clave: `${id}1`, dias: k - 3 }, { seccion: id, clave: `${id}2`, dias: 40 }]);
  const n = G.contarPorGrupo(avisos);
  assert.equal(G.cuentaDelBadge(n), avisos.length, "un aviso no cuenta");
  assert.equal(G.cuentaDelBadge(n), n.hoy + n.dias30 + n.corregir);
  assert.equal(G.grupoParaAbrir({ hoy: 2, dias30: 1, corregir: 0 }), "hoy", "con algo hoy no abre en «Hoy»");
  assert.equal(G.grupoParaAbrir({ hoy: 0, dias30: 3, corregir: 1 }), "dias30", "sin nada hoy no abre en «30 días»");
  assert.equal(G.grupoParaAbrir({ hoy: 0, dias30: 0, corregir: 0 }), "dias30");
  // La tarjeta: los mismos avisos que se cuentan, y la cuenta es la de la barra.
  const t = sinComent(fuenteDe("pages/DashboardView.tsx"));
  assert.match(t, /const cuentasDeRevision = useMemo\(\(\) => contarPorGrupo\(avisos\), \[avisos\]\);\s*const attentionCount = cuentaDelBadge\(cuentasDeRevision\);/,
    "la pastilla roja no es la suma de los tres grupos");
  // La cuenta va al menú de módulos (rediseño UX 2026-10): era la pastilla de
  // la pestaña «Supervisar», ahora es la de «Indicadores», y en Vender no cuenta.
  assert.match(t, /const cuentaParaElMenu = modoEfectivo === "supervisar" \? attentionCount : 0;\s*useEffect\(\(\) => \{\s*useArmazon\.getState\(\)\.setCuentaPendientes\(cuentaParaElMenu\);/);
  assert.match(t, /const grupoDeRevision: GrupoDeRevision = grupoElegido \?\? grupoParaAbrir\(cuentasDeRevision\);/, "no abre en «Hoy» o en «30 días»");
  assert.match(t, /<PestanasDeRevision cuentas=\{cuentasDeRevision\} grupo=\{grupoDeRevision\}/, "las pestañas no dicen las cuentas de los grupos");
  // Cada lista que se cuenta se dibuja, y en UN solo grupo.
  const avisosDef = t.slice(t.indexOf("const avisos = useMemo("), t.indexOf("const cuentasDeRevision = useMemo("));
  const bloque = (g) => {
    const i = t.indexOf(`{grupoDeRevision === "${g}" && (`);
    assert.ok(i > 0, `no está el grupo ${g}`);
    const fin = ["hoy", "dias30", "corregir"].map((x) => t.indexOf(`{grupoDeRevision === "${x}" && (`)).filter((k) => k > i);
    // El último grupo termina donde termina la lista: antes de la tabla o de
    // las cuentas del Mapa de oportunidades (versión B), lo que venga primero.
    const cierre = ["<SpacesTable", "const tableroB ="].map((x) => t.indexOf(x, i)).filter((k) => k > 0);
    return t.slice(i, fin.length ? Math.min(...fin) : Math.min(...cierre));
  };
  const DIBUJO = {
    hoy: ["cortesSinCargar.pendientes", "participacionesPorGrupo.hoy", "planometriaPorGrupo.hoy", "kpis.expired.map", "montaje.noMontado.map", "reservasPorGrupo.hoy"],
    dias30: ["kpis.expiring.map", "participacionesPorGrupo.dias30", "planometriaPorGrupo.dias30", "montaje.sinMontar.map", "reservasPorGrupo.dias30"],
    corregir: ["fantasmas.map", "<ImportarDelPlano", "kpis.noContract.map", "participacionesPorGrupo.corregir", "kpis.belowReference.map", "montaje.viejos.map"],
  };
  const bloques = Object.fromEntries(Object.keys(DIBUJO).map((g) => [g, bloque(g)]));
  for (const [g, listas] of Object.entries(DIBUJO)) {
    for (const l of listas) {
      assert.ok(bloques[g].includes(l), `«${l}» no se dibuja en ${g}`);
      for (const otro of Object.keys(DIBUJO)) if (otro !== g) assert.ok(!bloques[otro].includes(l), `«${l}» se dibuja en ${g} y en ${otro}`);
    }
  }
  for (const l of ["kpis.expired", "kpis.expiring", "kpis.noContract", "fantasmas", "cortesSinCargar.pendientes", "revisionPc.secciones",
    "faltaPlanometria.filas", "montaje.noMontado", "montaje.sinMontar", "montaje.viejos", "reservasSinConfirmar.vivas", "kpis.belowReference", "importacion.importables"]) {
    assert.ok(avisosDef.includes(`of ${l}`) || avisosDef.includes(`...${l}`), `«${l}» se dibuja y no cuenta`);
  }
  // Lo partido entre «Hoy» y «30 días» se parte con la misma regla que se cuenta.
  assert.match(t, /hoy: faltaPlanometria\.filas\.filter\(\(f\) => grupoDelAviso\("falta_planometria", f\.dias_para_empezar\) === "hoy"\)/);
  assert.match(t, /hoy: deParticipacionesEn\(revisionPc\.secciones, "hoy"\)/);
  assert.match(t, /hoy: reservasSinConfirmar\.vivas\.filter\(\(r\) => r\.caduca <= hoyIso\),\s*dias30: reservasSinConfirmar\.vivas\.filter\(\(r\) => r\.caduca > hoyIso\),/);
  // Las reservas y los cortes, dentro de `isAdmin &&`, como siempre.
  assert.match(t, /\{isAdmin && reservasPorGrupo\.hoy\.length > 0 && \(\s*<ReservasSinConfirmar\b/);
  assert.match(t, /\{isAdmin && reservasPorGrupo\.dias30\.length > 0 && \(\s*<ReservasSinConfirmar\b/);
  assert.match(t, /\{isAdmin && planometriaPorGrupo\.hoy\.length > 0 && \(\s*<FaltaPlanometria\b/);
  assert.match(t, /\{isAdmin && planometriaPorGrupo\.dias30\.length > 0 && \(\s*<FaltaPlanometria\b/);
  // «Contratado sin montar» en rojo con un umbral que PUEDE pasar: la lista corta a los 30 días.
  assert.ok(G.DIAS_SIN_MONTAR_EN_ROJO < 30, "el rojo de «Contratado sin montar» no puede pasar nunca");
  assert.match(t, /tono=\{entry\.dias > DIAS_SIN_MONTAR_EN_ROJO \? "alarma" : "espera"\}/);
  assert.doesNotMatch(t, /entry\.dias > 60/);
  assert.match(t, /const VENTANA_MONTAJE_DIAS = 30;/);
});

prueba("las chinchetas: sólo lo que está en «Para revisar», una por cara, del grupo más urgente (ejecutado)", () => {
  const ch = G.chinchetasDe([
    { seccion: "bajo_tarifa", clave: "x1", fixtureId: "f1", cara: "A" },
    { seccion: "vencidos", clave: "x2", fixtureId: "f1", cara: "A" },
    { seccion: "sin_montar", clave: "x3", fixtureId: "f2" },
    { seccion: "contrato_sin_mueble", clave: "x4" },
  ]);
  assert.deepEqual(ch.map((c) => [c.fixtureId, c.cara, c.grupo, c.clave]).sort(), [["f1", "A", "hoy", "x2"], ["f2", "A", "dias30", "x3"]]);
});

prueba("los puntos del plano («aire y pines»): uno por MUEBLE, del grupo más urgente de sus caras —Hoy rojo, 30 días ámbar, Corregir tinta— y nada fuera de la lista (ejecutado)", () => {
  const p = G.puntosDelPlano([
    // Una góndola doble: la A sólo para corregir, la B de «30 días»: un punto, ámbar, el de la B.
    { seccion: "bajo_tarifa", clave: "a1", fixtureId: "g1", cara: "A" },
    { seccion: "por_vencer", clave: "a2", fixtureId: "g1", cara: "B" },
    // Otra: «Hoy» en la A gana a «30 días» en la B, aunque llegue después.
    { seccion: "sin_montar", clave: "b1", fixtureId: "g2", cara: "B" },
    { seccion: "vencidos", clave: "b2", fixtureId: "g2", cara: "A" },
    // Y al revés: «Hoy» primero, «30 días» después en la otra cara: sigue «Hoy».
    { seccion: "vencidos", clave: "h1", fixtureId: "g6", cara: "A" },
    { seccion: "por_vencer", clave: "h2", fixtureId: "g6", cara: "B" },
    // Sólo para corregir: tinta.
    { seccion: "ocupado_sin_contrato", clave: "c1", fixtureId: "g3" },
    // Lo que depende de los días: una reserva que caduca hoy es «Hoy».
    { seccion: "reservas", clave: "d1", fixtureId: "g4", cara: "A", dias: 0 },
    { seccion: "falta_planometria", clave: "e1", fixtureId: "g5", dias: 12 },
    // Sin mueble no hay punto.
    { seccion: "contrato_sin_mueble", clave: "z1" },
  ]);
  assert.deepEqual(p.map((c) => [c.fixtureId, c.cara, c.grupo, c.clave]).sort(), [
    ["g1", "B", "dias30", "a2"], ["g2", "A", "hoy", "b2"], ["g3", "A", "corregir", "c1"],
    ["g4", "A", "hoy", "d1"], ["g5", "A", "dias30", "e1"], ["g6", "A", "hoy", "h1"],
  ]);
  assert.equal(new Set(p.map((c) => c.fixtureId)).size, p.length, "un mueble lleva dos puntos");
  assert.deepEqual(G.puntosDelPlano([]), []);
  // El renglón que se señala lleva el grupo de su aviso: el color del piso.
  const m = G.avisoPorClave([
    { seccion: "reservas", clave: "r1", fixtureId: "f9", cara: "B", dias: 0 },
    { seccion: "reservas", clave: "r2", fixtureId: "f9", cara: "B", dias: 9 },
    { seccion: "bajo_tarifa", clave: "t1", fixtureId: "f8" },
  ]);
  assert.deepEqual([...m.entries()].map(([k, a]) => [k, a.fixtureId, a.cara, a.grupo]), [
    ["r1", "f9", "B", "hoy"], ["r2", "f9", "B", "dias30"], ["t1", "f8", undefined, "corregir"],
  ]);
});

prueba("«Al mes» reparte cada contrato en SUS meses (`utils/meses.ts`), «Total» es lo firmado (ejecutado)", () => {
  assert.equal(PL.enLaUnidad(900000, "2026-11-01", "2027-01-31", "mes"), 300000);
  assert.equal(PL.enLaUnidad(900000, "2026-11-01", "2027-01-31", "total"), 900000);
  assert.equal(PL.enLaUnidad(600000, "2026-11-01", "2026-11-30", "mes"), 600000);
  assert.equal(PL.enLaUnidad(500000, "", "", "mes"), 500000, "sin fechas se inventó un plazo");
  assert.equal(PL.enLaUnidad(0, "2026-11-01", "2026-11-30", "mes"), 0);
  assert.equal(PL.tarifaEnLaUnidad(800000, "2026-10-18", "2026-11-17", "total"), 800000);
  assert.equal(PL.tarifaEnLaUnidad(800000, "2026-11-01", "2027-01-31", "total"), 2400000);
  assert.equal(PL.tarifaEnLaUnidad(800000, "2026-11-01", "2027-01-31", "mes"), 800000);
  assert.deepEqual(PL.ROTULO_DEL_VALOR, { mes: "Valor al mes", total: "Valor total" });
  const plata = sinComent(fuenteDe("components/Supervisar/plata.ts"));
  assert.match(plata, /import \{ alMesDe, meses \} from "\.\.\/\.\.\/utils\/meses";/, "«Al mes» no usa la cuenta gemela del servidor");
  // (Corrección única: el reparto al mes vive en `utils/meses.ts` —«Bajo
  // tarifa» lo usa desde `kpis`, que corre con Vender abierto— y sale de `meses`.)
  assert.match(plata, /if \(unidad === "total"\) return total;\s*return alMesDe\(total, desde, hasta\);/);
  assert.match(sinComent(fuenteDe("utils/meses.ts")), /export function alMesDe\(total: number, desde: string, hasta: string\): number \{\s*const m = meses\(desde, hasta\);\s*return m > 0 \? redondear\(total \/ m\) : total;/);
  assert.doesNotMatch(plata, /\/\s*30\b/, "«Al mes» divide por 30 a mano");
  const t = sinComent(fuenteDe("pages/DashboardView.tsx"));
  const memo = t.slice(t.indexOf("const plata = useMemo("), t.indexOf("}, [isAdmin, unidad, kpis,"));
  assert.ok(memo.length > 500, "no está la plata de Supervisar");
  assert.doesNotMatch(memo, /\/\s*30\b/, "la plata de Supervisar divide por 30 a mano");
  assert.match(memo, /enLaUnidad\(x\.negotiatedValue, x\.startDate, x\.endDate, unidad\)/);
  assert.match(memo, /canon \+= enLaUnidad\(c\.cobrado, c\.desde, c\.hasta, unidad\);/, "el canon no suma lo cargado de los contratos por % de venta");
});

prueba("el selector «Al mes | Total» manda en las cifras, la columna de la tabla y «Quién paga»; el trabajador no ve plata", () => {
  const t = sinComent(fuenteDe("pages/DashboardView.tsx"));
  assert.match(t, /const \[unidad, setUnidad\] = useUnidadDePlata\(\);/);
  // (La franja de cifras con su selector se fue con el Detalle, versión B
  // de Indicadores 2026-10-28; quedan el de la tabla y el de «Quién paga».)
  assert.match(t, /\{isAdmin && <SelectorDePlata unidad=\{unidad\} onCambio=\{setUnidad\} \/>\}/, "el selector se le ofrece al trabajador");
  // 1 · las cifras: las de plata salen de `plata`, que no existe para el trabajador.
  assert.match(t, /const plata = useMemo\(\(\) => \{\s*if \(!isAdmin\) return null;/, "la plata se calcula para el trabajador");
  // (Las cifras de la franja se fueron con el Detalle, versión B de
  // Indicadores 2026-10-28: el canon del Mapa de oportunidades y del Análisis
  // llega en null para quien no administra; `probar:mapa-de-decision`.)
  assert.match(t, /canon: isAdmin \? canonDelMes : null, potencial: isAdmin \? potencial : null,/, "las cifras de plata no van sólo para quien administra");
  // 2 · la tabla: el encabezado y cada fila.
  assert.match(t, /if \(isAdmin\) pedidas\.push\(\{ etiqueta: ROTULO_DEL_VALOR\[unidad\],/, "la columna de valor no sigue al selector, o se le muestra al trabajador");
  assert.match(t, /formatCOP\(enLaUnidad\(entry\.negotiatedValue, entry\.startDate, entry\.endDate, unidad\)\)/);
  assert.match(t, /<SpacesTable[\s\S]*?unidad=\{unidad\}/);
  // 3 · Quién paga: con la misma cuenta, y sólo para quien administra.
  assert.match(t, /\{isAdmin && plata && \(\s*<Card[\s\S]{0,200}title="Quién paga el canon"/, "«Quién paga» se le muestra al trabajador");
  assert.match(t, /plata\.quienes\.map/);
  // La ficha: el cobro y la reserva, sólo para quien administra.
  assert.match(t, /const reservaViva = isAdmin && entry\.reservaHasta \? reservaDe\?\.\(codigoDeLaCara\) : undefined;/);
  assert.match(t, /const cobroDeLaCara = isAdmin && hasContract \? cobroDe\?\.\(codigoDeLaCara\) : undefined;/);
  assert.match(t, /\{isAdmin && \(entry\.negotiatedValue > 0 \|\| cobroDeLaCara\) && \(/, "el valor de la ficha se le muestra al trabajador");
  // Lo que se elige se recuerda con try/catch.
  const hook = sinComent(fuenteDe("components/Supervisar/useUnidadDePlata.ts"));
  assert.equal((hook.match(/try \{/g) ?? []).length, 2, "el almacenamiento del navegador no va con try/catch");
});

/* ── Supervisar, PR 2: la corrección única ───────────────────────────────────
   Lo que el verificador vio en el navegador y el dueño mandó a corregir: la
   planometría de un contrato que todavía no arranca no se podía cargar; «Bajo
   tarifa» comparaba el total con una tarifa al mes; «Vendido en parte» contaba
   caras vendidas enteras parte del periodo y las pestañas contaban otra cosa
   que lo que mostraban; la ficha de un % decía lo de hoy y «Vender el Y %»
   rebotaba en Vender; al trabajador una reserva le salía «sin papeles». */
console.log("\nSupervisar · la corrección única\n");

prueba("«Cargar planometría» llega al contrato de la fila aunque todavía no arranque (`lease_id`, y si no `active_lease ?? upcoming_lease`)", () => {
  const pl = sinComent(fuenteDe("components/Contrato/Planometria.tsx"));
  assert.match(pl, /setLeaseId\(espacio\?\.active_lease\?\.id \?\? espacio\?\.upcoming_lease\?\.id \?\? null\);/,
    "sin `lease_id`, la planometría sólo se le carga al contrato que corre hoy");
  assert.doesNotMatch(pl, /setLeaseId\(espacio\?\.active_lease\?\.id \?\? null\)/);
  assert.match(pl, /if \(leaseIdPedido && isAdmin\) \{\s*\/?\/?[^\n]*\n?\s*setPlano\(await planometriaDelContrato\(leaseIdPedido\)\);\s*setLeaseId\(leaseIdPedido\);/,
    "con el contrato de la fila, la planometría no se lee y se carga sobre ESE contrato");
  const api = sinComent(fuenteDe("api/planograms.ts"));
  assert.match(api, /export const planometriaDelContrato = \(leaseId: number\)[^=]*=>\s*client\s*\.get<Planometria>\(`\/leases\/\$\{leaseId\}\/planometria`\)/);
  const fp = sinComent(fuenteDe("components/Supervisar/FaltaPlanometria.tsx"));
  assert.match(fp, /onClick=\{\(\) => onCargar\(f, visible\(f\.espacio\)\)\}/, "«Cargar planometría» no manda la fila con su código visible");
  const t = sinComent(fuenteDe("pages/DashboardView.tsx"));
  assert.match(t, /setPlanometriaPedida\(\{ codigo: f\.espacio\.toUpperCase\(\), leaseId: f\.lease_id, rotulo \}\);/,
    "«Cargar planometría» no le pasa a la ficha el contrato de la fila");
  assert.match(t, /spaceCode=\{pedidaAparte\.codigo\}\s*leaseId=\{pedidaAparte\.leaseId\}/, "la planometría de una parte o participación no va con su contrato");
  assert.match(t, /leaseId=\{planometriaPedida && !pedidaAparte \? planometriaPedida\.leaseId : null\}/, "la planometría de la cara no va con el contrato de la fila");
  // El rótulo es el código como se lee, nunca el crudo («CENTRO-GON-01-PC1»).
  assert.match(t, /Planometría de <span className="mono">\{pedidaAparte\.rotulo\}<\/span>/);
  assert.doesNotMatch(t, /Planometría de \{pedidaAparte\}/);
  // El servidor deja leer y cargar la de cualquier contrato por su id (cargar: sólo administración).
  const back = readFileSync(join(raiz, "..", "backend", "app", "routers", "planograms.py"), "utf8");
  assert.match(back, /"\/leases\/\{lease_id\}\/planometria",\s*response_model=PlanometriaOut,\s*status_code=201,\s*dependencies=\[Depends\(require_admin\)\],/);
  assert.match(back, /"\/leases\/\{lease_id\}\/planometria",\s*response_model=PlanometriaOut,\s*dependencies=\[Depends\(require_auth\)\],/);
});

prueba("«Bajo tarifa» compara lo que el contrato paga AL MES con la tarifa (que es al mes), y la fila dice esa misma cifra (`bajoLaTarifa`, ejecutado)", () => {
  // 3 meses por $ 1.500.000 = $ 500.000 al mes, contra $ 650.000: 23 % abajo.
  assert.deepEqual(PL.bajoLaTarifa(1_500_000, "2026-10-10", "2027-01-09", 650_000), { alMes: 500_000, brechaPct: 23 });
  // Comparando el total salía «por encima»: no se veía nunca.
  assert.ok(Math.round((1 - 1_500_000 / 650_000) * 100) < 1);
  // 15 días por $ 500.000 = $ 1.000.000 al mes, contra $ 800.000: NO está abajo
  // (comparando el total salía «−38 %»).
  assert.equal(PL.bajoLaTarifa(500_000, "2026-10-15", "2026-10-29", 800_000), null);
  // A la par, o sin tarifa, o sin valor: nada.
  assert.equal(PL.bajoLaTarifa(2_400_000, "2026-10-01", "2026-12-31", 800_000), null);
  assert.equal(PL.bajoLaTarifa(400_000, "2026-10-10", "2026-11-09", null), null);
  assert.equal(PL.bajoLaTarifa(0, "2026-10-10", "2026-11-09", 650_000), null);
  // Un mes por $ 400.000 contra $ 650.000: 38 % abajo.
  assert.deepEqual(PL.bajoLaTarifa(400_000, "2026-10-10", "2026-11-09", 650_000), { alMes: 400_000, brechaPct: 38 });
  const t = sinComent(fuenteDe("pages/DashboardView.tsx"));
  assert.match(t, /const bajo = bajoLaTarifa\(x\.negotiatedValue, x\.startDate, x\.endDate, ref\);\s*if \(bajo\) belowReference\.push\(\{ \.\.\.x, ref, gapPct: bajo\.brechaPct, alMes: bajo\.alMes \}\);/,
    "«Bajo tarifa» no sale de `bajoLaTarifa`");
  assert.doesNotMatch(t, /x\.negotiatedValue \/ ref/, "«Bajo tarifa» vuelve a comparar el total con la tarifa al mes");
  assert.match(t, /chip=\{`−\$\{entry\.gapPct\} %`\}/);
  assert.match(t, /dates=\{`\$\{formatCOP\(entry\.alMes\)\} al mes · ref \$\{formatCOP\(entry\.ref\)\}`\}/, "la fila de «Bajo tarifa» dice otra cifra que la que se comparó");
});

prueba("Supervisar cuenta «Vendido en parte» UNA vez: sólo por partes o por participación, en la clave, el color del plano, «Ocupación» y la pestaña (`comoLaVeSupervisar`, ejecutado)", () => {
  const caras = [
    { dispo: "libre", deParticipacion: false },
    { dispo: "parcial", deParticipacion: false, motivo: "dias" },      // vendida ENTERA, arranca adentro
    { dispo: "parcial", deParticipacion: false },                      // sin motivo y sin participación: días
    { dispo: "parcial", deParticipacion: false, motivo: "partes" },
    { dispo: "parcial", deParticipacion: true, motivo: "participacion" },
    { dispo: "parcial", deParticipacion: true },
    { dispo: "tomado", deParticipacion: false },
  ];
  const vistas = caras.map(PC.comoLaVeSupervisar);
  assert.deepEqual(vistas.map((x) => x.dispo), ["libre", "tomado", "tomado", "parcial", "parcial", "parcial", "tomado"],
    "una cara vendida entera parte del periodo cuenta como «vendida en parte»");
  const c = PC.contarElPeriodo(vistas);
  assert.equal(c.dias, 0, "Supervisar cuenta días en «Vendido en parte»");
  assert.equal(PC.enParte(c), 3);
  assert.equal(c.libres + PC.enParte(c) + c.tomados, caras.length, "la clave de Supervisar no suma las caras");
  // Lo que ya está bien no se toca (la misma referencia).
  assert.equal(PC.comoLaVeSupervisar(caras[3]), caras[3]);
  const t = sinComent(fuenteDe("pages/DashboardView.tsx"));
  assert.match(t, /const filasSupervisar = useMemo\(\s*\(\) => new Map\(\[\.\.\.filasDelPeriodo\]\.map\(\(\[clave, fila\]\) => \[clave, comoLaVeSupervisar\(fila\)\] as const\)\),/);
  // La clave, la nota de «Ocupación» y la pestaña: de `filasSupervisar`.
  assert.match(t, /const rangeTally = useMemo\(\(\) => contarElPeriodo\(filasSupervisar\.values\(\)\), \[filasSupervisar\]\);/);
  assert.match(t, /<MapLegend tally=\{rangeTally\} modo="supervisar"/);
  // (La nota de «Ocupación» de la franja se fue con el Detalle, versión B de
  // Indicadores 2026-10-28: la ocupación del Mapa de oportunidades cuenta
  // caras, `kpis.occupied`, y lo vendido en parte es su propia capa.)
  assert.match(t, /ocupacion: \{ pct: kpis\.occPct, ocupadas: kpis\.occupied, total: kpis\.total, meta: meta\.ocupacion \}/, "la ocupación del mapa cuenta con otra cosa");
  assert.match(t, /const enParteSet = useMemo\(\s*\(\) => new Set\(\[\.\.\.filasSupervisar\]\.filter\(\(\[, f\]\) => f\.dispo === "parcial"\)\.map\(\(\[k\]\) => k\)\),/,
    "la pestaña «Vendido en parte» no sale de la misma cuenta que la clave");
  // El color del plano de Supervisar, de la misma cuenta; Vender sigue con la suya.
  const isos = [...t.matchAll(/<IsoMap\b[\s\S]*?\/>/g)].map((m) => m[0]);
  const deSup = isos.filter((u) => /chinchetas=\{pendientesEnElPlano \? chinchetasDeRevision : undefined\}/.test(u));
  assert.equal(deSup.length, 1);
  assert.match(deSup[0], /dispo=\{dispoSupervisar\}/, "el plano de Supervisar pinta ámbar lo vendido entero");
  assert.ok(isos.filter((u) => u !== deSup[0]).every((u) => /dispo=\{dispoDeCara\}/.test(u)), "Vender perdió su ámbar");
  assert.match(t, /filasSupervisar\.get\(`\$\{f\.id\}-\$\{face\.face\}`\)\?\.dispo \?\? dispoDeCara\(f, face\)/);
  assert.match(t, /const tallyVender = useMemo\(\s*\(\) => contarElPeriodo\(\[\.\.\.filasDelPeriodo\]/, "Vender cuenta como Supervisar");
});

prueba("las pestañas «Libres» y «Vendido en parte» cuentan EXACTAMENTE las filas que muestran (`faceMatchesFilter`, ejecutado)", () => {
  const t = fuenteDe("pages/DashboardView.tsx");
  const i = t.indexOf("function faceMatchesFilter(");
  assert.ok(i >= 0, "no está faceMatchesFilter");
  const fuente = t.slice(i, t.indexOf("\n}\n", i) + 2);
  const js = esbuildMod.transformSync(fuente, { loader: "ts" }).code;
  const displayStatus = (e) => e.ds;
  const claveDeFila = (e) => `${e.fixture.id}-${e.face}${e.parte ? `-${e.parte.clase}` : ""}`;
  const fmf = new Function("displayStatus", "claveDeFila", `${js}\nreturn faceMatchesFilter;`)(displayStatus, claveDeFila);
  const f1 = { id: "f1" }, f2 = { id: "f2" }, f3 = { id: "f3" };
  // f1-A libre en el periodo; f2-A con una parte vendida (la cara entera libre HOY);
  // f3-A por participación con algo comprometido (libre HOY); f1-B tomada.
  const filas = [
    { fixture: f1, face: "A", ds: "free" },
    { fixture: f1, face: "B", ds: "active" },
    { fixture: f2, face: "A", ds: "free" },
    { fixture: f2, face: "A", ds: "active", parte: { clase: "EN" } },
    { fixture: f3, face: "A", ds: "free" },
    { fixture: f3, face: "A", ds: "active", parte: { clase: "PC" } },
  ];
  const libres = new Set(["f1-A"]);
  const enParte = new Set(["f2-A", "f3-A"]);
  const de = (id) => filas.filter((e) => fmf(e, id, new Set(), enParte, libres));
  assert.deepEqual(de("free").map((e) => `${e.fixture.id}-${e.face}`), ["f1-A"], "«Libres» muestra caras con una parte o una participación vendida");
  assert.deepEqual(de("en_parte").map((e) => `${e.fixture.id}-${e.face}${e.parte ? "+" : ""}`), ["f2-A", "f3-A"], "«Vendido en parte» muestra otra cosa que las caras que cuenta");
  assert.equal(de("free").length, libres.size);
  assert.equal(de("en_parte").length, enParte.size);
  // La cuenta de la pestaña es la de las filas: la misma función, con los mismos conjuntos.
  const v = sinComent(t);
  assert.match(v, /const cuantas = \(id: MapFilter\) => filas\.filter\(\(e\) => faceMatchesFilter\(e, id, sinMontarSet, enParteSet, libresSet\)\)\.length;/);
  assert.match(v, /\{ id: "free", label: "Libres", n: cuantas\("free"\) \}/, "la pestaña «Libres» cuenta otra cosa que sus filas");
  assert.match(v, /\{ id: "en_parte", label: "Vendido en parte", n: cuantas\("en_parte"\) \}/);
  assert.doesNotMatch(v, /label: "Libres", n: kpis\.free/);
  assert.match(v, /const filas = fixtures\.flatMap\(espaciosDelMueble\);/, "la cuenta no recorre las filas de la tabla");
  assert.match(v, /espaciosDe=\{espaciosDelMueble\}/);
  assert.match(v, /sinMontar=\{sinMontarSet\}\s*enParte=\{enParteSet\}\s*libres=\{libresSet\}/, "la tabla no filtra con los mismos conjuntos que cuenta la pestaña");
  assert.match(v, /faceMatchesFilter\(e, filter, sinMontar, enParte, libres\)/);
  assert.match(v, /const libresSet = useMemo\(\s*\(\) => new Set\(\[\.\.\.filasSupervisar\]\.filter\(\(\[, f\]\) => f\.dispo === "libre"\)/,
    "«Libres» no es la cuenta de la clave del plano");
  // (La cifra «Libres» del trabajador vivía en la franja del Detalle; la
  // versión B de Indicadores la pasó a «Caras sin contrato», que es la capa.)
});

prueba("la ficha de un % dice lo comprometido y lo que queda EN EL PERIODO (el pico), y «Vender el Y %» vende eso", () => {
  const pdc = sinComent(fuenteDe("components/Distribucion/ParticipacionesDeLaCara.tsx"));
  assert.match(pdc, /const comprometido = periodo\?\.pico_pb \?\? 0;\s*const queda = periodo\?\.disponible_pb \?\? 0;/,
    "la ficha cuenta lo que queda con lo de hoy");
  assert.match(pdc, /const periodo = datos\?\.capacidad\.periodo;/);
  assert.doesNotMatch(pdc, /const queda = datos\?\.capacidad\.disponible_hoy_pb/);
  assert.match(pdc, /Comprometido <b>\{pct\(comprometido\)\}<\/b>/);
  assert.match(pdc, /queda <b>\{pct\(queda\)\}<\/b>/);
  assert.match(pdc, /onClick=\{\(\) => onVender\(queda\)\}/);
  assert.match(pdc, /Vender el \{pct\(queda\)\}/);
  // Sin la plata de Supervisar adentro: la escribe quien la monta (el plano 2D
  // también importa este archivo).
  assert.doesNotMatch(pdc, /from "\.\.\/Supervisar\//, "la ficha de participaciones arrastra la plata de Supervisar al plano 2D");
  assert.doesNotMatch(pdc, /from "\.\.\/Contrato\/Contrato"|\bmoney\(|enLaUnidad|textoDelCobro/);
  const t = sinComent(fuenteDe("pages/DashboardView.tsx"));
  assert.match(t, /<ParticipacionesDeLaCara\b[\s\S]*?precioDe=\{\(t\) => `\$\{formatCOP\(enLaUnidad\(t\.valor_mensual, t\.desde, t\.hasta, unidad\)\)\}/);
  assert.match(t, /return x \? \{ texto: textoDelCobro\(x\.porcentaje\), proximo_corte: x\.proximo_corte \} : undefined;/);
});

prueba("la ficha sigue al mueble de la última sincronización: cancelar una reserva no la deja diciendo «Renovar con …»", () => {
  const t = sinComent(fuenteDe("pages/DashboardView.tsx"));
  assert.match(t, /useEffect\(\(\) => \{\s*if \(!selected\) return;\s*const fresco = fixtures\.find\(\(f\) => f\.id === selected\.id\);\s*if \(fresco && fresco !== selected\) setSelected\(fresco\);\s*\}, \[fixtures, selected\]\);/,
    "la ficha se queda con el mueble de antes de cancelar o confirmar");
  assert.match(t, /onReservaCambio=\{\(\) => \{\s*reservasSinConfirmar\.recargar\(\);\s*void refrescarComercial\(\);/);
  // Y al trabajador una reserva le sale «Reservado» en la ficha, no «Disponible para vender».
  assert.match(t, /\) : !hasContract && entry\.reservado \? \(/);
});

prueba("guardar un corte vuelve a leer los cobros: el canon vigente suma lo cargado sin recargar", () => {
  const c = sinComent(fuenteDe("components/Supervisar/CobrosYReservas.tsx"));
  assert.match(c, /setCargados\(\(x\) => \(\{ \.\.\.x, \[claveDeCorte\(c\)\]: monto \}\)\);\s*setVueltaDeCobros\(\(n\) => n \+ 1\);/,
    "cargar un corte no vuelve a pedir `GET /api/cobros`");
  assert.match(c, /cobrosPorVentas\(sede\)[\s\S]*?\}, \[sede, activo, vuelta, vueltaDeCobros\]\);/);
  // Los pendientes NO se vuelven a pedir: la fila se queda con su «→ $ monto».
  assert.match(c, /cortesPendientes\(sede\)[\s\S]*?\}, \[sede, activo, vuelta\]\);/);
  const t = sinComent(fuenteDe("pages/DashboardView.tsx"));
  assert.match(t, /onCargado=\{cortesSinCargar\.marcarCargado\}/);
});

prueba("el aspecto: la chincheta no tapa el código, la pastilla y la fecha entran, las participaciones miden lo suyo, la barra entra a 390", () => {
  const t = sinComent(fuenteDe("pages/DashboardView.tsx"));
  // «Aire y pines», la corrección: los rótulos se acomodan SIN mirar los
  // puntos —prender los puntos no puede esconder un código que apagados se
  // ve (antes cada rótulo con chincheta reservaba arriba lo que ella medía, y
  // esa reserva tapaba a los vecinos: cedían cuatro más)—, y cada punto va
  // DESPUÉS, pegado a su rótulo, donde no pise ningún código, ni las
  // herramientas, ni otro punto. Más estricto que la reserva: lo mide en el
  // navegador `probar-vender` (ningún rótulo nuevo cede, ningún punto tapa
  // un código).
  const k0 = t.indexOf("const acomodar = useCallback(");
  const acom = t.slice(k0, t.indexOf("}, [aPantalla, encuadre]);", k0));
  const iPuntos = acom.indexOf("const puntos: Caja[] = [];");
  assert.ok(k0 > 0 && iPuntos > 0, "no está `acomodar` o sus puntos");
  const deRotulos = acom.slice(0, iPuntos), dePuntos = acom.slice(iPuntos);
  assert.doesNotMatch(deRotulos, /pinRefs|offsetHeight|offsetWidth|conPin|turno/, "los rótulos se acomodan contando con los puntos");
  assert.match(deRotulos, /for \(const p of piezas\.current\) \{/, "los rótulos no van en el orden de su peso");
  assert.doesNotMatch(dePuntos, /ok\.push\(/, "un punto se vuelve obstáculo de los rótulos");
  // Cada punto: debajo de su rótulo, arriba, a la derecha o a la izquierda;
  // primero sin pisar nada, después sin pisar ningún código.
  assert.match(dePuntos, /candidatos\.push\(caja\(cx, suyo\.bottom \+ sep\), caja\(cx, suyo\.top - sep\), caja\(suyo\.right \+ sep, cy\), caja\(suyo\.left - sep, cy\)\);/,
    "el punto no se apoya pegado a su rótulo");
  assert.match(dePuntos, /candidatos\.find\(\(b\) => !fuera\(b\) && !ok\.some\(\(o\) => cruza\(b, o\)\) && !puntos\.some\(\(o\) => cruza\(b, o\)\)\)\s*\?\? candidatos\.find\(\(b\) => !fuera\(b\) && !ok\.some\(\(o\) => cruza\(b, o\)\)\)/,
    "un punto puede tapar el código de un rótulo");
  assert.match(dePuntos, /const fuera = \(b: Caja\) => seSale\(b\) \|\| fijos\.some\(\(o\) => cruza\(b, o\)\);/, "un punto puede caer sobre las herramientas o fuera del lienzo");
  // La caja del rótulo se mide contra donde está ESCRITO (un `acomodar()` entre
  // la vuelta al ancla y la medida corría la caja del texto).
  assert.match(t, /const xa = Number\(p\.txt\.getAttribute\("x"\)\), ya = Number\(p\.txt\.getAttribute\("y"\)\);/);
  const css = readFileSync(join(raiz, "src", "supervisar.css"), "utf8");
  // `left`/`top` son el centro del punto: un solo `transform`, ninguno por encima del rótulo.
  assert.match(css, /\.chinchetas button \{[^}]*transform: translate\(-50%, -50%\);/);
  assert.doesNotMatch(css, /\.chinchetas button\[data-sobre/, "volvió el punto apoyado arriba del rótulo (el que reservaba lugar)");
  // «Aire y pines»: un PUNTO de 10 px (con un blanco de 16 para tocarlo), sin
  // globo ni ícono: ningún `svg` adentro, a ningún ancho.
  assert.match(css, /\.chinchetas button \{[^}]*width: 16px; height: 16px;[^}]*background: transparent;/);
  assert.match(css, /\.chinchetas button::after \{[^}]*width: 10px; height: 10px; border-radius: 50%;\s*background: var\(--c, var\(--ink-1\)\);/);
  assert.doesNotMatch(css, /\.chinchetas button svg/, "el punto volvió a llevar ícono");
  // La tabla: el estado y las fechas miden lo que su texto, y la pastilla corta con «…».
  assert.match(t, /\{ etiqueta: "Estado", ancho: anchos\.estado, minimo: anchos\.estadoMinimo, cede: 3 \}/);
  assert.match(t, /const estadoMinimo = anchoDeTexto\(palabras, pastilla\) \+ 20 \+ 18;/, "la pastilla más larga no entra en lo menos que mide el estado");
  assert.match(t, /\{ etiqueta: "Desde", ancho: anchos\.desde, minimo: anchos\.desde \}/, "la fecha cede");
  assert.match(t, /\{ etiqueta: "Hasta", ancho: anchos\.hasta, minimo: anchos\.hasta \}/, "la fecha cede");
  assert.match(t, /\.map\(\(iso\) => fechaEnCurso\(iso\)\), fuente\) \+ 28;/, "las fechas no se miden con el año");
  assert.match(css, /\.sup td > \.pill \{[^}]*text-overflow: ellipsis;/);
  // «Participaciones de cara» fuera de la hoja (cuyas filas miden `--alto-plano`).
  const i = t.indexOf('className="supervisar-hoja"');
  const fin = t.indexOf('title="Participaciones de cara"');
  assert.ok(i > 0 && fin > i);
  const trozo = t.slice(i, fin);
  let hondo = 0;
  for (const m of trozo.matchAll(/<div\b[^>]*?(\/)?>|<\/div>/g)) {
    if (m[0] === "</div>") hondo--; else if (!m[1]) hondo++;
  }
  // Desde adentro de la etiqueta de la hoja: su cierre deja la cuenta en −1.
  assert.equal(hondo, -1, "«Participaciones de cara» quedó adentro de la hoja: su fila mide `--alto-plano` y deja un blanco abajo");
  // La sincronización: a 480 px o menos, el punto solo, con la palabra en el title.
  const sync = sinComent(fuenteDe("components/SyncStatus/SyncStatus.tsx"));
  assert.match(sync, /<span className="sync-palabra">\{label\}<\/span>/);
  assert.match(sync, /aria-label=\{`\$\{label\}\. Sincronizar con el servidor`\}/);
  const vcss = readFileSync(join(raiz, "src", "vender.css"), "utf8");
  // (Las pestañas de la barra se fueron al menú de módulos —rediseño UX 2026-10—:
  // a 480 px ya no hay renglón que partir, sólo la palabra que se esconde.)
  assert.match(vcss, /@media \(max-width: 480px\) \{\s*\.sync-palabra \{ display: none; \}\s*\}/);
});


/* ── «Editar contrato» (2026-10-22) ──────────────────────────────────────────
   Un contrato guardado se reabre en Vender desde Supervisar («Para revisar» →
   Corregir y la ficha del espacio) y se guarda otra vez, con aviso de que se
   reenvía a los correos. Las cuentas son puras (`utils/edicionDeContrato.ts`,
   que Vender puede importar); el botón es de quien administra; el pedido nombra
   EL contrato del renglón (`edita.lease_id` + `esperado`) y nunca lo vuelve a
   buscar por código; el propio contrato no está tomado contra sí mismo. */
console.log("\nSupervisar · «Editar contrato»\n");
const ED = await cargarTs("utils/edicionDeContrato.ts");
const CASOS_VENTAS = JSON.parse(readFileSync(join(aqui, "casos", "cobro-por-ventas.json"), "utf8"));

prueba("lo de antes se dice al centavo: la misma plata que el servidor (casos/cobro-por-ventas.json, ejecutado)", () => {
  const casos = CASOS_VENTAS.pesos_exactos;
  assert.ok(casos.length >= 20, "casos/cobro-por-ventas.json tiene muy pocos casos de plata");
  for (const [v, t] of casos) assert.equal(ED.pesosExactos(v), t, `${v} → «${t}»`);
  for (const [v] of casos) assert.doesNotMatch(ED.pesosExactos(v), /,$|M$|k$/, `${v}: coma colgando o plata abreviada`);
  assert.equal(ED.pesosExactos(Number.NaN), "$ 0");
});

prueba("los cortes que ya cerraron se avisan con la regla de períodos del servidor (casos/cobro-por-ventas.json, ejecutado)", () => {
  // Los MISMOS casos corren contra `cobros.periodos` en tests/test_editar_contrato.py.
  const casos = CASOS_VENTAS.cortes;
  assert.ok(casos.length >= 10, "casos/cobro-por-ventas.json tiene muy pocos casos de cortes");
  for (const c of casos) {
    // `periodosDeCorte` es lo que cuenta `avisoDeCortes`: los cerrados, con la
    // misma regla que el servidor.
    const cerrados = ED.periodosDeCorte(c.desde, c.hasta, c.corte).filter(([, b]) => b < c.hoy);
    assert.deepEqual(cerrados, c.vencidos, `${c.por}: cerrados`);
    assert.equal(ED.avisoDeCortes(c.desde, c.hasta, c.corte, c.hoy, c.cargados_hasta ?? null), c.aviso, `${c.por}: aviso`);
  }
  assert.ok(casos.some((c) => /\(ago y sep 2026\)/.test(c.aviso ?? "")), "falta el caso del dibujo aprobado (ago y sep)");
  // Código muerto: el «hoy» es el del servidor (`edita.hoy`), y los cerrados se
  // cuentan adentro de `avisoDeCortes`.
  for (const muerto of ["hoyEnColombia", "cortesCerrados"]) assert.ok(!(muerto in ED), `vuelve ${muerto}, que nadie usa`);
  assert.equal(ED.diaConAnio("2027-01-05"), "5 ene 2027");
});

prueba("el propio contrato no cuenta como tomado, y ningún otro deja de contar (ejecutado)", () => {
  const estado = {
    "NAVE-PUN-04": { ...vendido(), leaseId: 7 },
    "NAVE-PUN-05": { ...vendido(), leaseId: 8 },
    "NAVE-GON-02": { ...vendido() },
  };
  const sin = ED.estadoSinElPropio(estado, 7);
  assert.deepEqual(Object.keys(sin).sort(), ["NAVE-GON-02", "NAVE-PUN-05"], "se fue otro contrato, o se quedó el propio");
  assert.equal(ED.estadoSinElPropio(estado, null), estado, "sin edición, el mapa es el mismo");
  assert.equal(ED.estadoSinElPropio(estado, 99), estado);
  // La ocupación anónima de una cara por participación: se saca UN intervalo
  // con las fechas y el % del propio; otro igual es de otro.
  const par = { hoy: "2026-10-22", ocupacion: {
    intervalos: [{ desde: "2026-11-01", hasta: "2026-11-30", pb: 2500 }, { desde: "2026-11-01", hasta: "2026-11-30", pb: 2500 },
      { desde: "2026-11-01", hasta: "2026-11-30", pb: 6000 }],
    fisicos: [{ desde: "2026-12-01", hasta: "2026-12-31" }] } };
  const sinPc = ED.ocupacionSinElPropio(par, { desde: "2026-11-01", hasta: "2026-11-30", pb: 2500 });
  assert.deepEqual(sinPc.ocupacion.intervalos.map((x) => x.pb), [2500, 6000]);
  assert.equal(sinPc.ocupacion.fisicos.length, 1);
  const sinFisico = ED.ocupacionSinElPropio(par, { desde: "2026-12-01", hasta: "2026-12-31", pb: null });
  assert.equal(sinFisico.ocupacion.fisicos.length, 0);
  assert.equal(sinFisico.ocupacion.intervalos.length, 3);
  assert.equal(ED.ocupacionSinElPropio(par, { desde: "2027-01-01", hasta: "2027-01-31", pb: 2500 }), par, "sacó algo que no era el propio");
});

prueba("«Qué cambia»: lo de antes → lo nuevo, sólo lo que cambió, y si se reemplaza (ejecutado)", () => {
  const antes = { forma: "entera", visibleCara: "PUN-04", partes: [], proveedor: "COMERCIAL NUTRESA", marca: "Zenú",
    desde: "2026-08-01", hasta: "2027-01-31", valor: 6, modoPrecio: "total", valorTecleado: 6, cobro: null, pb: null };
  const igual = ED.queCambia(antes, { ...antes });
  assert.deepEqual(igual, { cambios: [], reemplazo: false }, "sin cambios no hay nada que decir (el botón queda apagado)");
  const aVentas = ED.queCambia(antes, { ...antes, valor: 0, modoPrecio: null, valorTecleado: null, cobro: { porcentaje: 8, corte: "mensual" } });
  assert.deepEqual(aVentas, { reemplazo: false, cambios: [
    { campo: "Cobro", antes: "Precio fijo $ 6", ahora: "8 % de las ventas, corte mensual" }] });
  const aPartes = ED.queCambia(antes, { ...antes, forma: "parte", partes: ["EN2", "EN1"] });
  assert.equal(aPartes.reemplazo, true);
  assert.deepEqual(aPartes.cambios[0], { campo: "Espacio", antes: "PUN-04 entera", ahora: "PUN-04 · EN1 y EN2" });
  const pc = { ...antes, forma: "participacion", visibleCara: "GON-01·A", pb: 2500 };
  const otroPct = ED.queCambia(pc, { ...pc, pb: 4000 });
  assert.equal(otroPct.reemplazo, false, "cambiar el % de la misma cara es el mismo contrato");
  assert.deepEqual(otroPct.cambios, [{ campo: "Espacio", antes: "GON-01·A · 25 %", ahora: "GON-01·A · 40 %" }]);
  const alMes = ED.queCambia(antes, { ...antes, valor: 1_800_000, modoPrecio: "mensual", valorTecleado: 300_000 });
  assert.equal(alMes.cambios[0].ahora, "Precio fijo $ 1.800.000 ($ 300.000 al mes)", "la plata va entera, con punto de miles");
  for (const t of [aVentas, aPartes, otroPct, alMes]) {
    assert.doesNotMatch(JSON.stringify(t), /nota|tarifa|referencia/i, "«Qué cambia» dice algo que Vender no puede decir");
  }
});

prueba("lo que frena una edición antes del servidor: el «Desde» de uno que arrancó, el «Hasta», los cortes y un solo espacio (ejecutado)", () => {
  const antes = { forma: "entera", visibleCara: "PUN-04", partes: [], proveedor: "X", marca: "", desde: "2026-08-01",
    hasta: "2027-01-31", valor: 0, modoPrecio: null, valorTecleado: null, cobro: { porcentaje: 8, corte: "mensual" }, pb: null };
  const e = { leaseId: 1, esperado: { valor: 0, desde: "2026-08-01", hasta: "2027-01-31" }, codigo: "NAVE-PUN-04",
    cara: "NAVE-PUN-04", sede: "NAVE", antes, arranco: true, ultimoCorte: null, cortes: 0, planometria: null, correo: null,
    montajePendiente: false, hoy: "2026-10-22" };
  assert.equal(ED.faltaDeLaEdicion(e, antes, 1), null);
  assert.match(ED.faltaDeLaEdicion(e, { ...antes, desde: "2026-09-01" }, 1), /Ya arrancó: el «Desde» sigue en el 1 ago 2026/);
  assert.equal(ED.faltaDeLaEdicion({ ...e, arranco: false }, { ...antes, desde: "2026-09-01" }, 1), null, "uno que no arrancó mueve las dos fechas");
  assert.match(ED.faltaDeLaEdicion(e, { ...antes, hasta: "2026-10-21" }, 1), /antes de hoy/);
  const conCortes = { ...e, cortes: 2, ultimoCorte: "2026-09-30" };
  assert.match(ED.faltaDeLaEdicion(conCortes, { ...antes, hasta: "2026-09-15" }, 1), /ventas cargadas hasta el 30 sep 2026/);
  assert.match(ED.faltaDeLaEdicion(conCortes, { ...antes, cobro: null, valor: 9 }, 1), /sigue por % de las ventas/);
  assert.match(ED.faltaDeLaEdicion(conCortes, { ...antes, cobro: { porcentaje: 8, corte: "al_final" } }, 1), /el corte no cambia/);
  assert.match(ED.faltaDeLaEdicion(conCortes, { ...antes, forma: "parte", partes: ["EN1"] }, 1), /no cambia de forma/);
  assert.equal(ED.faltaDeLaEdicion(conCortes, { ...antes, cobro: { porcentaje: 10, corte: "mensual" } }, 1), null, "el % sí cambia");
  assert.match(ED.faltaDeLaEdicion(e, antes, 2), /un solo espacio/);
  assert.equal(ED.faltaDeLaEdicion(e, { ...antes, forma: "parte", partes: ["EN1", "EN2"] }, 1), null);
});

prueba("«Editar contrato»: sólo para quien administra, en Corregir y en la ficha, y abre EL contrato del renglón", () => {
  const t = sinComent(fuenteDe("pages/DashboardView.tsx"));
  // El botón de Corregir, en las dos secciones con un contrato detrás, y nada más.
  assert.equal((t.match(/acciones=\{accionEditar\(entry, /g) || []).length, 2, "«Editar contrato» en otra sección de Corregir (o en ninguna)");
  for (const [seccion, abre] of [["Bajo tarifa de referencia", "{isAdmin && kpis.belowReference.length > 0 && ("],
    ["montajes_viejos", "{isAdmin && montaje.viejos.length > 0 && ("]]) {
    const i = t.indexOf(abre);
    assert.ok(i > 0, `«${seccion}» no se monta sólo para quien administra`);
    const trozo = t.slice(i, t.indexOf("</div>\n                      )}", i));
    assert.match(trozo, /acciones=\{accionEditar\(entry, /, `«${seccion}» no lleva «Editar contrato»`);
  }
  assert.match(t, /const accionEditar = \(entry: FaceEntry, seccion: string\) => \(isAdmin && typeof entry\.leaseId === "number" \? \[\{\s*texto: "Editar contrato", icono: <FilePenLine \{\.\.\.ICONO_TARJETA\} \/>,/,
    "el botón de Corregir no es sólo de quien administra, o no lleva su ícono de 16 × 1,75");
  // La ficha: junto a Renovar, sólo con un contrato de verdad (no una reserva).
  assert.match(t, /\{isAdmin && rentable && onEditar && hasContract && !entry\.reservaHasta && typeof entry\.leaseId === "number" && \(/,
    "el botón de la ficha no está guardado por quien administra, el contrato y su leaseId");
  assert.match(t, /onEditar=\{isAdmin \? \(e\) => editarFila\(e, \{ enFicha: true \}\) : undefined\}/);
  assert.match(t, /onEditar=\{isAdmin \? onEditar : undefined\}/, "las partes ofrecen editar a quien no administra");
  assert.match(t, /onEditarParticipacion=\{isAdmin\s*\?/);
  // EL contrato del renglón: su leaseId y lo que el renglón mostró; lo demás
  // se lee por su id. Nunca se vuelve a buscar el espacio por código.
  const ed = t.slice(t.indexOf("const editarContrato = useCallback(async ("), t.indexOf("const accionEditar ="));
  assert.ok(ed.length > 500, "no se encontró «editarContrato»");
  assert.match(ed, /const d = await contratoParaEditar\(leaseId\);/);
  assert.match(ed, /edita: \{\s*leaseId, esperado, codigo: d\.espacio,/, "el pedido no lleva la huella que se espera");
  // La huella: lo que la fila MOSTRÓ (valor, fechas, proveedor, marca) y, de
  // lo que no dice, lo que se leyó al abrir (el cobro y el %).
  for (const campo of ["valor: mostrado?.valor ?? d.valor", "desde: mostrado?.desde ?? d.desde", "hasta: mostrado?.hasta ?? d.hasta",
    "proveedor: mostrado?.proveedor ?? d.proveedor", "marca: mostrado?.marca !== undefined ? mostrado.marca : d.marca",
    "puntos_basicos: d.puntos_basicos"]) assert.ok(ed.includes(campo), `el esperado no lleva «${campo}»`);
  assert.match(ed, /cobro: d\.cobro \? \{ modo: "ventas", porcentaje: d\.cobro\.porcentaje, corte: d\.cobro\.corte \} : \{ modo: "fijo" \},/);
  assert.match(t, /valor: entry\.negotiatedValue, desde: entry\.startDate, hasta: entry\.endDate,\s*proveedor: entry\.supplierName, marca: entry\.brandCategory \|\| null,/);
  // El precio va EXACTO a la semilla, con su coma: nunca redondeado a pesos.
  assert.match(ed, /valores: d\.cobro \? \{\} : \{ \[clave\]: textoDePrecioExacto\(tecleado\) \},/);
  assert.doesNotMatch(ed, /Math\.round\(tecleado\)|toLocaleString/, "la semilla redondea el precio");
  assert.doesNotMatch(ed, /getSpaceByCode|findOrCreateSpace|active_lease|upcoming_lease|fetchSpace|\/spaces\//,
    "vuelve a buscar el contrato por código");
  // La semilla de edición nunca lleva la nota interna.
  assert.doesNotMatch(ed, /\bnota\b|notes|observation/, "la semilla de edición lleva la nota interna");
  // Sólo DashboardView (Supervisar) lee el contrato para editarlo.
  const api = sinComent(fuenteDe("api/edicionDeContrato.ts"));
  assert.match(api, /client\.get<ContratoParaEditar>\(`\/contratos\/\$\{leaseId\}\/edicion`\)/);
  assert.doesNotMatch(api, /nota|notes|observation/, "el contrato para editar trae la nota");
  // Las participaciones: el botón sólo para un contrato vigente o firmado.
  const pc = sinComent(fuenteDe("components/Distribucion/ParticipacionesDeLaCara.tsx"));
  assert.match(pc, /t\.estado === "contrato" && typeof t\.lease_id === "number"\s*&& \(t\.estado_visible === "vigente" \|\| t\.estado_visible === "firmado"\)/);
  assert.match(pc, /\{editable\(t\) && onEditar && t && \(/);
});

prueba("Vender en edición: manda `edita` con el leaseId y `esperado`, sin la nota, y no cuenta el propio contrato como tomado", () => {
  const c = sinComent(fuenteDe("components/Contrato/Contrato.tsx"));
  assert.match(c, /\.\.\.\(edita \? \{ edita: \{ lease_id: edita\.leaseId, esperado: edita\.esperado \} \} : \{\}\),/,
    "el pedido no nombra el contrato por su leaseId y lo que se mostró");
  assert.match(c, /nota: edita \? undefined : nota\.trim\(\) \|\| undefined,/, "editando, la nota interna viaja");
  assert.match(c, /const estadoComercial = useMemo\(\(\) => estadoSinElPropio\(estadoCrudo, edita\?\.leaseId\), \[estadoCrudo, edita\]\);/,
    "el propio contrato cuenta como tomado contra sí mismo");
  assert.equal((c.match(/useFixtureStore\(\(s\) => s\.estadoComercial\)/g) || []).length, 1, "otra lectura del mapa crudo se salta la exclusión");
  assert.match(c, /return ocupacionSinElPropio\(par, \{/);
  assert.match(c, /&& chocan\.length === 0 && !faltaEdicion;/, "una edición sin cambios (o que no se puede) se guarda igual");
  assert.match(c, /\(sinCambios \? "No cambiaste nada" : null\)/);
  assert.doesNotMatch(c.slice(c.lastIndexOf("return {")), /\bsinCambios\b/, "`sinCambios` vuelve al hook y nadie lo lee");
  // Un 409 `contrato_cambio`: el principal queda apagado y se ofrece volver.
  assert.match(c, /if \(edita && codigoDelRechazo\(e\) === "contrato_cambio"\) \{\s*setCambioAjeno\(true\);/);
  assert.match(c, /\(cambioAjeno \? "Ese contrato cambió mientras lo editabas: volvé a Indicadores y abrilo de nuevo" : null\)/);
  const m = sinComent(fuenteDe("components/Contrato/ModoVender.tsx"));
  assert.match(m, /const estadoComercial = c\.estadoComercial;/, "la línea mira el mapa con el propio contrato");
  assert.doesNotMatch(m, /useFixtureStore\(\(s\) => s\.estadoComercial\)/, "ModoVender lee el mapa crudo");
  assert.match(m, /ocupacionDe=\{c\.ocupacionDe\}/);
  // El «Desde» de uno que ya arrancó, deshabilitado y dicho.
  assert.match(m, /disabled=\{!!edita\?\.arranco\}/);
  assert.match(m, /Ya arrancó: el «Desde» no se mueve\./);
  assert.match(m, /\{!edita\?\.arranco && <AtajosDeFecha c=\{c\} \/>\}/, "los atajos mueven el «Desde» de uno que arrancó");
  // La banda, «Qué cambia», el aviso de los correos y el botón.
  assert.match(m, /<b>Editando el contrato de \{nombreDelContrato\(edita\.antes\)\}<\/b>/);
  assert.match(m, /<X \{\.\.\.ICONO\} \/> Salir sin cambios/);
  assert.match(m, /<b>Al guardar, se envía de nuevo a los correos:<\/b> comercial · el proveedor \(\{c\.correoDestino\}\) · montaje/);
  assert.match(m, /\{edita \? \(c\.cambioAjeno \? \(\s*<button className="btn-texto" type="button" onClick=\{onSalirDeEdicion \?\? onCancelar\} data-volver-tras-cambio>\s*<ArrowLeft \{\.\.\.ICONO\} \/> Volver a Supervisar/,
    "tras un 409 `contrato_cambio` no se ofrece volver a Supervisar");
  assert.match(m, /<Send \{\.\.\.ICONO\} \/> Guardar cambios y reenviar/);
  // 2026-10-25: si lo ÚNICO que cambia es cómo se lee el precio (el mismo
  // número, «Total → Al mes»), no se reenvía y se guarda sin el diálogo
  // (decisión del dueño). `soloForma` sale de la gemela del servidor
  // (`soloLaFormaDelPrecio`, `probar-precio`); cualquier otra edición confirma.
  assert.match(m, /onClick=\{edita && !c\.soloForma \? \(\) => setConfirmando\(true\) : c\.guardar\}/, "se guarda sin confirmar a quiénes se reenvía");
  assert.match(fuenteDe("components/Contrato/Contrato.tsx"),
    /const soloForma = !!edita && !!fotoAhora && soloLaFormaDelPrecio\(edita\.antes, fotoAhora\);/, "«sólo la forma» sale de la gemela");
  assert.match(m, /<span>\{notaDelReemplazo\(edita, c\.nuevos\)\}<\/span>/);
  // La nota interna no se ofrece editando.
  assert.match(m, /\{!edita && \(\s*<div className="campo">\s*<span className="rotulo">Nota<\/span>/);
  // El diálogo: accesible y con los tres destinatarios.
  const d = sinComent(fuenteDe("components/Contrato/ConfirmarEdicion.tsx"));
  assert.match(d, /role="dialog"\s*aria-modal="true"\s*aria-labelledby=\{titulo\}/);
  assert.match(d, /if \(e\.key === "Escape"\) \{ e\.stopPropagation\(\); onVolver\(\); return; \}/);
  assert.match(d, /app\?\.setAttribute\("inert", ""\);/, "el foco se escapa del diálogo");
  assert.match(d, /data-capa-modal/, "el diálogo no se lleva el amarillo: quedan dos a la vez");
  assert.match(d, /useModalAbierto\(\);/);
  for (const rol of ["comercial", "proveedor", "montaje"]) assert.match(d, new RegExp(`data-rol="${rol}"`), `el diálogo no lista ${rol}`);
  assert.match(d, />Volver<\/button>/);
  assert.match(d, /<Send \{\.\.\.ICONO\} \/> Guardar y reenviar/);
  assert.doesNotMatch(d + m, /sombra/i);
  // El leaseId: sólo para quien administra, y nunca pegado al mueble.
  const sp = readFileSync(join(raiz, "..", "backend", "app", "routers", "spaces.py"), "utf8");
  assert.match(sp, /leaseId=lease\.id if admin else None,/, "el servidor le manda el leaseId al trabajador");
  assert.equal((sp.match(/leaseId=/g) || []).length, 1, "el leaseId sale por otro lado del mapa comercial");
  const [f] = fusionarEstadoComercial("CENTRO", [{ id: "f", code: "GON-02", type: "cross", sede: "CENTRO" }],
    { "CENTRO-GON-02": { ...vendido(), leaseId: 17 } });
  assert.ok(!("leaseId" in f), "el leaseId se pegó al mueble");
  assert.match(t0(), /if \(typeof suyo\?\.leaseId !== "number"\) return e;\s*return typeof suyo\.proximoLeaseId === "number"\s*\? \{ \.\.\.e, leaseId: suyo\.leaseId, proximoLeaseId: suyo\.proximoLeaseId \}\s*: \{ \.\.\.e, leaseId: suyo\.leaseId \};/,
    "la fila no sabe qué contrato dibuja (ni el próximo)");
});

/* ── La corrección tras la ronda de prueba (2026-10-22) ──────────────────── */
const PL_PRECIO = await cargarTs("utils/precioDeLista.ts");

prueba("el precio se siembra y se lee EXACTO, con su coma (0,5 · 6 · 1.000.000 · 7,25), y «Qué cambia» no ve cambios donde no los hay (ejecutado)", () => {
  for (const [n, t] of [[0.5, "0,5"], [6, "6"], [1_000_000, "1.000.000"], [7.25, "7,25"], [1_234_567.8, "1.234.567,8"], [0.05, "0,05"]]) {
    assert.equal(PL_PRECIO.textoDePrecioExacto(n), t, `${n} → «${t}»`);
    assert.equal(PL_PRECIO.numeroDePrecio(t), n, `«${t}» → ${n}`);
    assert.equal(PL_PRECIO.precioTecleado(t), t, `«${t}» se reescribe igual al teclearlo`);
  }
  assert.equal(PL_PRECIO.precioTecleado("1000000"), "1.000.000");
  assert.equal(PL_PRECIO.precioTecleado("7,"), "7,", "la coma recién tecleada no se borra");
  assert.equal(PL_PRECIO.precioTecleado("7,259"), "7,25", "más de dos decimales");
  assert.equal(PL_PRECIO.precioTecleado("$ 0,5"), "0,5");
  assert.equal(PL_PRECIO.precioTecleado(""), "");
  // Sembrado y vuelto a leer, cada valor es el mismo contrato: «sin cambios».
  for (const v of [0.5, 6, 1_000_000, 7.25]) {
    const antes = { forma: "entera", visibleCara: "PUN-04", partes: [], proveedor: "X", marca: "", desde: "2026-08-01",
      hasta: "2027-01-31", valor: v, modoPrecio: "total", valorTecleado: v, cobro: null, pb: null };
    const leido = PL_PRECIO.numeroDePrecio(PL_PRECIO.textoDePrecioExacto(v));
    assert.deepEqual(ED.queCambia(antes, { ...antes, valor: leido, valorTecleado: leido }), { cambios: [], reemplazo: false },
      `$ ${v} abre con un cambio que nadie hizo`);
  }
  // Un centavo sí es un cambio.
  const a = { forma: "entera", visibleCara: "PUN-04", partes: [], proveedor: "X", marca: "", desde: "2026-08-01",
    hasta: "2027-01-31", valor: 0.5, modoPrecio: "total", valorTecleado: 0.5, cobro: null, pb: null };
  assert.deepEqual(ED.queCambia(a, { ...a, valor: 0.51 }).cambios, [{ campo: "Cobro", antes: "Precio fijo $ 0,5", ahora: "Precio fijo $ 0,51" }]);
  // El campo lee y escribe con sus centavos: ya no se queda con los dígitos.
  const c = sinComent(fuenteDe("components/Contrato/Contrato.tsx"));
  assert.match(c, /const numero = numeroDePrecio\(texto\);/);
  assert.match(c, /setValores\(\(v\) => \(\{ \.\.\.v, \[codigo\]: precioTecleado\(txt\) \}\)\);/);
  assert.doesNotMatch(c, /texto\.replace\(\/\[\^\\d\]\/g, ""\)|Number\(soloDigitos\)/, "el campo vuelve a tirar la coma");
});

prueba("cambiar de proveedor no arrastra el correo del anterior: el campo se vacía y el aviso dice el del proveedor que queda (ejecutado)", () => {
  const e = { antes: { proveedor: "Lácteos del Valle" }, correo: "compras@valle.co" };
  // El campo.
  assert.equal(ED.correoAlCambiarDeProveedor(e, "Alpina", "compras@valle.co"), "", "el correo del anterior viaja con el nuevo");
  assert.equal(ED.correoAlCambiarDeProveedor(e, "Alpina", " COMPRAS@valle.co "), "");
  assert.equal(ED.correoAlCambiarDeProveedor(e, "Alpina", "trade@alpina.co"), "trade@alpina.co", "se borró lo que se escribió para el nuevo");
  assert.equal(ED.correoAlCambiarDeProveedor(e, " lácteos del valle", ""), "compras@valle.co", "volver al de antes no trae su correo");
  assert.equal(ED.correoAlCambiarDeProveedor(e, "Lácteos del Valle", "otro@valle.co"), "otro@valle.co");
  // Lo que dicen el aviso y el diálogo.
  assert.equal(ED.correoDelProveedorQueQueda(e, "Lácteos del Valle", "compras@valle.co", null), "compras@valle.co");
  assert.equal(ED.correoDelProveedorQueQueda(e, "Alpina", "", false), ED.SIN_CORREO);
  assert.equal(ED.SIN_CORREO, "sin correo cargado: el proveedor no recibe aviso");
  assert.equal(ED.correoDelProveedorQueQueda(e, "Alpina", "compras@valle.co", false), ED.SIN_CORREO, "el aviso dice el correo del anterior para el nuevo");
  assert.equal(ED.correoDelProveedorQueQueda(e, "Alpina", "trade@alpina.co", false), "trade@alpina.co");
  assert.equal(ED.correoDelProveedorQueQueda(e, "Alpina", "", true), "su correo cargado; si no tiene, no recibe aviso");
  assert.equal(ED.correoDelProveedorQueQueda(e, "Alpina", "trade@alpina.co", true), "su correo cargado o, si no tiene, trade@alpina.co");
  for (const [prov, cor, ex] of [["Alpina", "compras@valle.co", true], ["Alpina", "", true], ["Alpina", "", false], ["Postobón", "x", null]]) {
    assert.doesNotMatch(ED.correoDelProveedorQueQueda(e, prov, cor, ex), /valle/i, `${prov}: el aviso nombra el correo del anterior`);
  }
  assert.equal(ED.correoDelProveedorQueQueda({ ...e, correo: null }, "Lácteos del Valle", "", null), ED.SIN_CORREO);
  // El hook cambia el campo al cambiar el proveedor, y el aviso y el diálogo
  // leen el correo del que queda (nunca `edita.correo` a secas).
  const c = sinComent(fuenteDe("components/Contrato/Contrato.tsx"));
  assert.match(c, /if \(e\) setCorreo\(\(c\) => correoAlCambiarDeProveedor\(e, v, c\)\);/);
  assert.match(c, /const correoDestino = edita \? correoDelProveedorQueQueda\(edita, proveedor, correo, proveedorExiste\) : null;/);
  const d = sinComent(fuenteDe("components/Contrato/ConfirmarEdicion.tsx"));
  assert.match(d, /<b>El proveedor<\/b> · \{c\.correoDestino\}/);
  assert.doesNotMatch(d, /edita\.correo/, "el diálogo muestra el correo del proveedor de antes");
  const m = sinComent(fuenteDe("components/Contrato/ModoVender.tsx"));
  assert.doesNotMatch(m, /edita\.correo/, "el aviso del pie muestra el correo del proveedor de antes");
});

prueba("«Salir sin cambios» no deja el plano cambiado: editando, «Cambiar» la forma queda pendiente y se escribe al guardar; si falla, se deshace", () => {
  const t = sinComent(fuenteDe("pages/DashboardView.tsx"));
  const va = t.slice(t.indexOf("const venderAsi = useCallback(async ("), t.indexOf("const planoPendiente = useMemo("));
  assert.ok(va.length > 300, "no se encontró «venderAsi»");
  const editando = va.slice(va.indexOf("if (editandoRef.current) {"), va.indexOf("try {"));
  assert.ok(editando.length > 100, "editando, «Cambiar» escribe el plano al tocarlo");
  assert.doesNotMatch(editando, /commit|flushPending/, "editando, «Cambiar» escribe el plano al tocarlo");
  assert.match(editando, /setFormaPendiente\(/);
  assert.ok(va.indexOf("if (editandoRef.current) {") < va.indexOf("antes.commit("), "el plano se escribe antes de mirar si se edita");
  // Vender ve el mueble con lo pendiente encima; el plano, no.
  assert.match(t, /const fixturesDelContrato = useMemo\(\s*\(\) => \(formaPendiente \? conPartes\(fixtures, formaPendiente\.id, formaPendiente\.cambio\) : fixtures\),/);
  assert.match(t, /const fixture = fixturesDelContrato\.find\(\(f\) => f\.id === id\);/);
  // Lo pendiente se va con la edición (salir, guardar, otra semilla).
  assert.match(t, /setSemilla\(null\);\s*setFormaPendiente\(null\);\s*\};/);
  assert.match(t, /editandoRef\.current = !!semilla\?\.edita;\s*if \(!semilla\?\.edita\) setFormaPendiente\(null\);/);
  assert.match(t, /planoPendiente=\{planoPendiente\}/);
  const pp = t.slice(t.indexOf("const planoPendiente = useMemo("), t.indexOf("const alternarCara"));
  assert.match(pp, /st\.commit\(conPartes\(selectFixtures\(st\), id, cambio\)\);/);
  assert.match(pp, /if \(useFixtureStore\.getState\(\)\.rechazos\[sede\]\) \{\s*await deshacer\(\);/);
  assert.match(pp, /partes: vuelta\.partes \?\? null, entrepanos: vuelta\.entrepanos \?\? null/, "deshacer manda `undefined` y el servidor conserva lo partido");
  // El guardado: primero el plano, después el pedido; si el pedido falla, el plano vuelve.
  const c = sinComent(fuenteDe("components/Contrato/Contrato.tsx"));
  const g = c.slice(c.indexOf("async function guardar()"), c.indexOf("return {", c.indexOf("async function guardar()")));
  assert.ok(g.indexOf("await planoPendiente.escribir()") > 0 && g.indexOf("await planoPendiente.escribir()") < g.indexOf("await guardarContrato(lo)"),
    "el plano no se escribe justo antes del pedido");
  assert.match(g, /\} catch \(e\) \{\s*if \(planoEscrito && planoPendiente\) await planoPendiente\.deshacer\(\)/,
    "si el guardado falla, el plano queda cambiado");
  const l = sinComent(fuenteDe("components/Contrato/LineaDelContrato.tsx"));
  assert.match(l, /\{alGuardar && " Se escribe en el plano al guardar los cambios\."\}/);
});

prueba("el PRÓXIMO contrato de una cara con vigente se edita: `proximoLeaseId` sólo para quien administra, nunca pegado al mueble", () => {
  const sp = readFileSync(join(raiz, "..", "backend", "app", "routers", "spaces.py"), "utf8");
  assert.match(sp, /proximoLeaseId=\(space\.upcoming_lease\.id\s*if admin and space\.active_lease is not None and space\.upcoming_lease is not None\s*else None\),/,
    "el servidor le manda el id del próximo al trabajador");
  assert.equal((sp.match(/proximoLeaseId=/g) || []).length, 1);
  const [f] = fusionarEstadoComercial("CENTRO", [{ id: "f", code: "GON-02", type: "cross", sede: "CENTRO" }],
    { "CENTRO-GON-02": { ...vendido(), leaseId: 17, proximoLeaseId: 18 } });
  assert.ok(!("proximoLeaseId" in f) && !("leaseId" in f), "el id del próximo se pegó al mueble");
  const ll = readFileSync(join(raiz, "..", "backend", "app", "services", "layout_lookup.py"), "utf8");
  assert.match(ll, /"leaseId", "proximoLeaseId",\n\)/, "el id del próximo viaja en el layout");
  const t = t0();
  assert.match(t, /\{isAdmin && rentable && onEditarProximo && hasContract && !entry\.reservaHasta\s*&& typeof entry\.leaseId === "number" && typeof entry\.proximoLeaseId === "number" && \(/,
    "«Editar el próximo contrato» no es sólo de quien administra");
  assert.match(t, /Editar el próximo contrato/);
  // El de una parte abre por SU id y con su propio esperado (nunca el de la fila del vigente).
  assert.match(t, /onClick=\{\(\) => onEditarProximo\(\{ \.\.\.e, leaseId, proximoLeaseId \}, proximoLeaseId\)\}/);
  assert.match(t, /onEditarProximo=\{isAdmin \? onEditarProximo : undefined\}/);
  assert.doesNotMatch(t, /onEditar\(\{ \.\.\.e, leaseId: proximoLeaseId/, "el próximo de una parte se abre con el esperado del vigente");
  assert.match(t, /onEditarProximo=\{isAdmin\s*\? \(e, id\) => void editarContrato\(e\.fixture, e\.face, id, null, \{ enFicha: true \}\)/,
    "el próximo no se abre por SU id, o su esperado no sale de él");
});

prueba("el foco vuelve al «Editar contrato» que abrió la edición (o al título de su sección), y los textos del final", () => {
  const t = t0();
  assert.match(t, /onSalirDeEdicion=\{volverDeLaEdicion\}\s*onVolverASupervisar=\{volverDeLaEdicion\}/);
  assert.match(t, /const boton = document\.querySelector<HTMLElement>\(`\[data-editar-contrato="\$\{o\.leaseId\}"\]`\);\s*if \(boton\) \{ boton\.focus\(\);/);
  assert.match(t, /document\.querySelector<HTMLElement>\("\[data-ficha-titulo\]"\)/);
  assert.match(t, /data-editar-contrato=\{a\.leaseId\}/, "el botón de Corregir no se puede volver a encontrar");
  assert.match(t, /<h3 className="mono" data-ficha-titulo tabIndex=\{-1\}>/);
  // El reemplazo: los NUEVOS piden lo suyo, con el plural bien.
  const uno = ED.notaDelReemplazo({ antes: { forma: "entera", visibleCara: "PUN-04", partes: [], pb: null }, planometria: "p.pdf" }, 1);
  assert.equal(uno, "El contrato de PUN-04 se cierra como «reemplazado», no cancelado: su planometría (p.pdf) y su montaje quedan con él. El contrato nuevo pide su planometría y su montaje en «Para revisar».");
  const dos = ED.notaDelReemplazo({ antes: { forma: "entera", visibleCara: "PUN-04", partes: [], pb: null }, planometria: null }, 2);
  assert.match(dos, /su montaje queda con él\. Los 2 contratos nuevos piden su planometría y su montaje en «Para revisar»\.$/);
  assert.deepEqual([ED.resumenDeCambios([{ campo: "Cobro" }]), ED.resumenDeCambios([{ campo: "a" }, { campo: "b" }, { campo: "c" }, { campo: "d" }])],
    ["Cobro", "4 cambios"]);
  const m = sinComent(fuenteDe("components/Contrato/ModoVender.tsx"));
  // El éxito no pide la planometría de un contrato que ya la tiene.
  assert.match(m, /\{\(!editado \|\| \(!editado\.reemplazo && !editado\.conPlanometria\)\) && \(\s*<p className="nota-guardado" data-planometria-en-supervisar>/);
  assert.match(m, /editado\.nuevos > 1\s*\? "Los contratos nuevos piden su planometría y su montaje en «Para revisar»\."/);
  const d = sinComent(fuenteDe("components/Contrato/ConfirmarEdicion.tsx"));
  assert.match(d, /\{notaDelReemplazo\(edita, c\.nuevos\)\}/);
  assert.doesNotMatch(d, /su montaje se vuelven a pedir/, "el diálogo dice que se vuelven a pedir los del contrato viejo");
  const sv = readFileSync(join(raiz, "..", "backend", "app", "services", "aviso_de_edicion.py"), "utf8");
  assert.match(sv, /"los del contrato nuevo se piden" if len\(despues\) == 1\s*else "los de los contratos nuevos se piden"/);
  // «Qué cambia» y el aviso en UNA línea cada uno; la lista entera, desplegable y en el diálogo.
  assert.match(m, /<b>Qué cambia:<\/b> \{resumenDeCambios\(c\.edicion\.cambios\)\}/);
  assert.match(m, /aria-expanded=\{verCambios\} aria-controls=\{idCambios\} data-ver-cambios>/);
  // «8 % ventas» en la línea, donde iría el precio.
  assert.match(m, /<span className="ventas-linea" data-ventas-linea>\{pct\(ventasPb\)\} ventas<\/span>/);
  // El estilo: el % de las ventas con el reset de los demás campos y el foco en la caja; «Volver a Supervisar» en un renglón.
  const css = readFileSync(join(raiz, "src", "vender.css"), "utf8");
  assert.match(css, /\.vender \.entrada\.pct-ventas input \{\s*border: 0; outline: none; background: transparent; color: inherit; font: inherit; padding: 0;/);
  assert.match(css, /\.vender \.entrada\.pct-ventas:focus-within \{ border-color: var\(--ink-1\);/);
  assert.match(css, /\.btn-tinta \{\s*display: inline-flex; align-items: center; justify-content: center; gap: 8px;/);
  assert.match(css, /\.que-cambia-linea \.txt \{[^}]*white-space: nowrap;/);
  assert.match(css, /\.aviso-correos > span \{[^}]*-webkit-line-clamp: 2;/);
  assert.match(css, /\.pie-contrato\.editando \.total-sub \{ white-space: nowrap; overflow: hidden; text-overflow: ellipsis; \}/);
});
function t0() { return sinComent(fuenteDe("pages/DashboardView.tsx")); }

console.log(`\n${hechas} pruebas\n`);
