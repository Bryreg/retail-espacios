/**
 * Planogramas con destinos (fase 2 de la distribución, 2026-10-24).
 *   npm run probar:planogramas       (y `-- --escribir` para regenerar `casos/planogramas.json`)
 *
 * ── Por qué existe este archivo ──────────────────────────────────────────────
 *
 * «Planificar la cara» usa las mismas piezas exactas de «Distribuir» para
 * repartir una cara entre DESTINOS (categoría, marca propia, promoción…). La
 * pantalla dice en vivo el estado de cada pieza («Ubicada», «Le falta…»,
 * «Pisa a…») y lo libre; la revisión de verdad es la del servidor
 * (`services/planogramas.revisar`). Acá:
 *
 *   · `piezasDelPlano`: el estado de cada destino (sin ubicar, ubicada, falta,
 *     sobra, choca con otro destino o con lo VENDIDO, que viene bloqueado);
 *   · lo libre: la cara entera menos el pico de lo vendido y lo de los
 *     destinos; vendida entera hoy, nada;
 *   · las palabras: qué cambia contra la vigente, hace cuánto venció, el color
 *     que sale solo, los rótulos de la entrada del plano;
 *   · los gemelos: los tipos y los colores son los del servidor; las rutas del
 *     cliente existen en el router; los tokens de color están en claro y en
 *     oscuro;
 *   · la casa: nada se guarda en el navegador, nunca «sombra», un solo
 *     amarillo por pantalla, íconos de 16;
 *   · y `casos/planogramas.json`, que `backend/tests/test_planogramas_gemelos.py`
 *     le pasa al SERVIDOR: el mismo % dibujado y los mismos problemas.
 */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = join(aqui, "..");
const RUTA_CASOS = join(aqui, "casos", "planogramas.json");
const ESCRIBIR = process.argv.includes("--escribir");
const leer = (p) => readFileSync(join(raiz, p), "utf8");
const sinComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

let hechas = 0;
const prueba = async (n, fn) => {
  try { await fn(); hechas++; console.log("  ok   " + n); }
  catch (e) { console.error("  FALLA " + n + "\n         " + e.message.split("\n").join("\n         ")); process.exitCode = 1; }
};

const r = await build({
  stdin: {
    contents: [
      'export * as PL from "./src/utils/planograma.ts";',
      'export * as PZ from "./src/utils/piezas.ts";',
      'export * as S from "./src/utils/superficie.ts";',
    ].join("\n"),
    resolveDir: raiz, loader: "ts",
  },
  bundle: true, write: false, format: "esm", platform: "neutral", logLevel: "silent",
});
const { PL, PZ, S } = await import("data:text/javascript;base64," + Buffer.from(r.outputFiles[0].text).toString("base64"));

const GONDOLA = { type: "gondola", w: 1.8, d: 0.9, h: 1.8, entrepanos: 5 };
const sup = S.superficieDeCara(GONDOLA, "A");
const cara = { ancho: sup.ancho, alto: sup.alto, exclusiones: sup.exclusiones, estantes: S.guiasDeCara(GONDOLA, "A").entrepanos };
const HOY = "2026-10-24";
const datos = (vendido = { entera: [], participaciones: [] }, extra = {}) => ({
  sede: "CENTRO", hoy: HOY, cara: "A", codigo_cara: "CENTRO-GON-12", fixture: { id: "f-GON-12", code: "GON-12", label: "GON-12", type: "gondola", caras: 2 },
  comercializable: vendido.participaciones.length > 0 || vendido.entera.length > 0, por_participacion: vendido.participaciones.length > 0,
  superficie: { ...sup, giro_x: 0, area_util_m2: 1 }, firma: null, permisos: { planificar: true, quien_publica: "admin" }, vendido,
  planograma: { version: 0, borrador: null, vigente: null, programadas: [], versiones: [] }, destinos: {}, biblioteca: [], revision: null, ...extra,
});
const DESTINOS = new Map([
  [1, { id: 1, nombre: "Lácteos", tipo: "categoria", color: "d1", como_se_monta: null, codigo_externo: "CAT-102" }],
  [2, { id: 2, nombre: "Marca propia", tipo: "marca_propia", color: "d2", como_se_monta: null, codigo_externo: null }],
  [3, { id: 3, nombre: "Halloween", tipo: "promocion", color: "d3", como_se_monta: "Al frente", codigo_externo: null }],
]);
const casos = [];

console.log("planogramas · las piezas de un planograma");

await prueba("el estado de cada destino: sin ubicar, ubicada, falta, sobra y choca (con otro destino)", () => {
  const f40 = PZ.franja(cara, 4000, 0, "derecha");
  const f25 = PZ.franja(cara, 2500, f40.u1, "derecha");
  const ed = [
    { destinoId: 1, pb: 4000, vertices: PZ.poligonoDeRect(f40) },
    { destinoId: 2, pb: 2500, vertices: PZ.poligonoDeRect(f25) },
    { destinoId: 3, pb: 1750, vertices: null },
  ];
  const ps = PL.piezasDelPlano(datos(), ed, DESTINOS, {});
  assert.deepEqual(ps.map((p) => [p.id, p.estado, p.dibujado]), [[1, "ubicada", 4000], [2, "ubicada", 2500], [3, "sin_ubicar", 0]]);
  assert.equal(ps[0].tono, "rgb(var(--destino-1-rgb))");
  casos.push({ nombre: "tres destinos, uno sin ubicar", mueble: GONDOLA, piezas: ed.map((p) => ({ destino_id: p.destinoId, pb: p.pb, vertices: p.vertices })),
    dibujado: Object.fromEntries(ps.map((p) => [p.id, p.dibujado])), codigos: [] });
  // Pisa: la 2 corrida a la izquierda pisa a la 1.
  const pisa = PZ.franja(cara, 2500, f40.u1 - 0.05, "derecha");
  const ed2 = [ed[0], { ...ed[1], vertices: PZ.poligonoDeRect(pisa) }];
  const ps2 = PL.piezasDelPlano(datos(), ed2, DESTINOS, {});
  assert.deepEqual(ps2.map((p) => [p.estado, p.choca]), [["choca", 2], ["choca", 1]]);
  casos.push({ nombre: "dos destinos que se pisan", mueble: GONDOLA, piezas: ed2.map((p) => ({ destino_id: p.destinoId, pb: p.pb, vertices: p.vertices })),
    dibujado: Object.fromEntries(ps2.map((p) => [p.id, p.dibujado])), codigos: ["SOLAPE"] });
  // Falta y sobra: la franja de 40 % declarada como 50 % y como 30 %.
  const ps3 = PL.piezasDelPlano(datos(), [{ destinoId: 1, pb: 5000, vertices: PZ.poligonoDeRect(f40) }, { destinoId: 2, pb: 2000, vertices: PZ.poligonoDeRect(f25) }], DESTINOS, {});
  assert.deepEqual(ps3.map((p) => p.estado), ["falta", "sobra"]);
  assert.equal(PL.textoDelEstadoDelPlano(ps3[0], null), "Le falta 10 %");
  assert.equal(PL.textoDelEstadoDelPlano(ps3[1], null), "Sobra 5 %");
  casos.push({ nombre: "uno corto y uno pasado", mueble: GONDOLA, piezas: [{ destino_id: 1, pb: 5000, vertices: PZ.poligonoDeRect(f40) }, { destino_id: 2, pb: 2000, vertices: PZ.poligonoDeRect(f25) }],
    dibujado: Object.fromEntries(ps3.map((p) => [p.id, p.dibujado])), codigos: ["PIEZA_FALTA", "PIEZA_SOBRA"] });
  // Una forma rota se marca para rehacer.
  const rota = [[0.1, 0.1], [0.5, 0.5], [0.5, 0.1], [0.1, 0.5]];
  assert.equal(PL.piezasDelPlano(datos(), [{ destinoId: 1, pb: 1000, vertices: rota }], DESTINOS, {})[0].estado, "rehacer");
});

await prueba("lo vendido viene bloqueado, en gris, y un destino que lo pisa choca con él", () => {
  const vendida = PZ.franja(cara, 3000, 0, "derecha");
  const vendido = { entera: [], participaciones: [{ space_id: 62, nombre: "Café Montaña · Café A", pb: 3000,
    intervalos: [{ desde: HOY, hasta: "2027-03-31", pb: 3000 }], poligonos: [PZ.poligonoDeRect(vendida)] }] };
  const encima = PZ.franja(cara, 2000, 0.2, "derecha");
  const ps = PL.piezasDelPlano(datos(vendido), [{ destinoId: 2, pb: 2000, vertices: PZ.poligonoDeRect(encima) }], DESTINOS, {});
  assert.deepEqual(ps.map((p) => [p.id, p.bloqueada, p.estado]), [[-62, true, "ubicada"], [2, false, "choca"]]);
  assert.equal(ps[1].choca, -62);
  assert.equal(ps[0].tono, PL.TONO_VENDIDO);
  assert.equal(PL.textoDelEstadoDelPlano(ps[0], null), "Vendida · su lugar no se toca");
  // Lo que una pieza no puede pisar incluye lo vendido.
  assert.deepEqual(PL.ocupadosDelPlano(2, ps).map((o) => o.spaceId), [-62]);
  casos.push({ nombre: "un destino encima de lo vendido", mueble: GONDOLA, vendido: vendido.participaciones,
    piezas: [{ destino_id: 2, pb: 2000, vertices: PZ.poligonoDeRect(encima) }], dibujado: { 2: ps[1].dibujado }, codigos: ["PISA_LO_VENDIDO"] });
  const alLado = PZ.franja(cara, 2000, vendida.u1, "derecha");
  const ok = PL.piezasDelPlano(datos(vendido), [{ destinoId: 2, pb: 2000, vertices: PZ.poligonoDeRect(alLado) }], DESTINOS, {});
  assert.equal(ok[1].estado, "ubicada");
  casos.push({ nombre: "un destino al lado de lo vendido", mueble: GONDOLA, vendido: vendido.participaciones,
    piezas: [{ destino_id: 2, pb: 2000, vertices: PZ.poligonoDeRect(alLado) }], dibujado: { 2: 2000 }, codigos: [] });
});

await prueba("lo libre: la cara menos el pico de lo vendido (ubicado o guardado) y lo de los destinos; vendida entera hoy, nada", () => {
  const vendido = { entera: [], participaciones: [
    { space_id: 1, nombre: "A", pb: 3000, intervalos: [{ desde: HOY, hasta: "2026-12-31", pb: 3000 }], poligonos: [] },
    { space_id: 2, nombre: "B", pb: 2000, intervalos: [{ desde: "2026-11-01", hasta: "2026-11-30", pb: 2000 }], poligonos: [] },
  ] };
  const d = datos(vendido);
  assert.equal(PL.vendidoPico(d), 5000);
  assert.equal(PL.libreParaPlanificar(d, [{ destinoId: 1, pb: 1500, vertices: null }]), 3500);
  assert.deepEqual(PL.guardadoSinUbicar(d), [{ nombre: "A", pb: 3000 }, { nombre: "B", pb: 2000 }]);
  assert.equal(PL.libreParaPlanificar(datos(), [{ destinoId: 1, pb: 12000, vertices: null }]), 0, "nunca negativo");
  const entera = datos({ entera: [{ desde: "2026-10-01", hasta: "2026-11-30" }], participaciones: [] });
  assert.equal(PL.libreParaPlanificar(entera, []), 0);
  assert.deepEqual(PL.vendidaEnteraHoy(entera), { desde: "2026-10-01", hasta: "2026-11-30" });
  const despues = datos({ entera: [{ desde: "2026-12-01", hasta: "2027-01-31" }], participaciones: [] });
  assert.equal(PL.vendidaEnteraHoy(despues), null);
  assert.equal(PL.vendidaEnteraDespues(despues).desde, "2026-12-01");
  assert.equal(PL.libreParaPlanificar(despues, []), 10000);
});

await prueba("las palabras: qué cambia, hace cuánto venció, el color que sale solo", () => {
  const nombre = (id) => DESTINOS.get(id)?.nombre ?? "Un destino";
  const v = [[0, 0], [0.4, 0], [0.4, 1], [0, 1]];
  const antes = [{ destinoId: 1, pb: 4000, vertices: v }, { destinoId: 2, pb: 4000, vertices: v }, { destinoId: 3, pb: 1000, vertices: v }];
  const despues = [{ destinoId: 1, pb: 4000, vertices: [[0, 0], [0.5, 0], [0.5, 1], [0, 1]] }, { destinoId: 2, pb: 2500, vertices: v }, { destinoId: 4, pb: 1500, vertices: v }];
  assert.deepEqual(PL.queCambia(antes, despues, nombre), [
    "Lácteos cambia de lugar.", "Marca propia: 40 % → 25 %.", "Un destino entra con 15 %.", "Halloween sale de la cara.",
  ]);
  assert.deepEqual(PL.queCambia(antes, antes, nombre), []);
  assert.ok(PL.mismasPiezas(antes, antes.map((p) => ({ ...p, vertices: [...p.vertices] }))));
  assert.ok(!PL.mismasPiezas(antes, despues));
  assert.deepEqual([1, 2, 10, 59, 60, 95].map(PL.haceCuanto), ["hace 1 día", "hace 2 días", "hace 10 días", "hace 59 días", "hace 2 meses", "hace 3 meses"]);
  assert.equal(PL.colorLibre([]), "d1");
  assert.equal(PL.colorLibre(["d1", "d2"]), "d3");
  assert.equal(PL.colorLibre(["d1", "d2", "d3", "d4", "d5", "d6"]), "d1");
  assert.equal(PL.colorLibre(["d1", "d1", "d2", "d3", "d4", "d5", "d6"]), "d2");
  assert.deepEqual(PL.TIPOS_DE_DESTINO.map((t) => t.texto), ["Categoría", "Marca propia", "Producto o grupo", "Promoción", "Otro"]);
});

await prueba("«La cara» y Plano › Caras: el estado de cada cara, los pasos y los filtros (el dueño, 2026-10-29)", () => {
  const hoy = new Date(2026, 9, 29);
  const v = (o = {}) => ({ id: 7, numero: 2, rige_desde: "2026-10-12", hasta: null, estado: "vigente", publicada_en: null, publicada_por: null,
    vencida_hace_dias: null, para_revisar: false, ...o });
  const como = (c) => PL.comoEstaLaCara({ borrador: false, vigente: null, programada: null, ...c }, hoy);
  let e = como({});
  assert.deepEqual([e.estado, e.tono, e.titulo, e.boton], ["sin_repartir", "falta", "Sin repartir", "Distribuir la cara"]);
  e = como({ borrador: true });
  assert.deepEqual([e.estado, e.tono, e.boton], ["borrador", "en_curso", "Seguir y publicar"]);
  e = como({ programada: v({ estado: "programada", rige_desde: "2026-11-02" }) });
  assert.deepEqual([e.estado, e.titulo], ["programada", "Rige desde el 2 nov"]);
  e = como({ vigente: v() });
  assert.deepEqual([e.estado, e.tono, e.titulo, e.boton], ["lista", "lista", "Lista · versión 2 desde el 12 oct", "Ver o cambiar el reparto"]);
  assert.equal(como({ vigente: v(), borrador: true }).boton, "Seguir y publicar", "un borrador encima de la vigente no se esconde");
  // Lo que pide revisión: el mueble cambió, venció, o el montaje.
  assert.deepEqual([como({ vigente: v({ para_revisar: true }) }).motivo, como({ vigente: v({ para_revisar: true }) }).boton], ["mueble_cambio", "Nueva versión"]);
  assert.deepEqual([como({ vigente: v({ vencida_hace_dias: 4 }) }).titulo], ["Venció hace 4 días"]);
  for (const m of ["no_coincide", "no_se_pudo"]) {
    const r = como({ vigente: v(), montaje: m });
    assert.deepEqual([r.estado, r.motivo, r.boton], ["para_revisar", m, "Revisar el montaje"]);
  }
  assert.equal(como({ vigente: v(), montaje: "coincide" }).estado, "lista");
  // Las cuentas y los filtros de Plano › Caras.
  const caras = [{ estado: "sin_repartir", comercializable: false }, { estado: "borrador", comercializable: false },
    { estado: "programada", comercializable: true }, { estado: "para_revisar", comercializable: false }, { estado: "lista", comercializable: true }];
  assert.deepEqual(PL.contarCaras(caras), { sinRepartir: 1, enCurso: 2, paraRevisar: 1, listas: 1 });
  assert.equal(PL.filtrarCaras(caras, "internas").length, 3);
  assert.equal(PL.filtrarCaras(caras, "lo_libre").length, 2);
  assert.equal(PL.filtrarCaras(caras, "todas").length, 5);
  // Los 3 pasos de arriba del planograma: el que toca es el primero sin hacer.
  const estados = (c) => PL.pasosDelPlanograma(c).map((p) => p.estado);
  assert.deepEqual(estados({ destinos: 0, sinUbicar: 0, conProblema: 0, publicada: false }), ["ahora", "despues", "despues"]);
  assert.deepEqual(estados({ destinos: 2, sinUbicar: 1, conProblema: 0, publicada: false }), ["hecho", "ahora", "despues"]);
  assert.deepEqual(estados({ destinos: 2, sinUbicar: 0, conProblema: 1, publicada: false }), ["hecho", "ahora", "despues"]);
  assert.deepEqual(estados({ destinos: 2, sinUbicar: 0, conProblema: 0, publicada: false }), ["hecho", "hecho", "ahora"]);
  assert.deepEqual(estados({ destinos: 2, sinUbicar: 0, conProblema: 0, publicada: true }), ["hecho", "hecho", "hecho"]);
  assert.equal(PL.pasosDelPlanograma({ destinos: 1, sinUbicar: 1, conProblema: 0, publicada: false })[1].detalle, "Falta ubicar 1");
  // El botón abre lo que le toca al mueble: por porcentaje, Distribuir; si no, el planograma.
  const bloque = sinComentarios(leer("src/components/Planograma/BloqueDeLaCara.tsx"));
  assert.match(bloque, /if \(porParticipacion\) \{[\s\S]*onClick=\{\(\) => onPorcentaje\?\.\(caraMirada\)\}/);
  assert.match(bloque, /const abrir = \(c: "A" \| "B"\) => void usePlanograma\.getState\(\)\.abrir\(\{ sede, fixtureId, cara: c \}\);/);
  assert.match(bloque, /if \(comercializable && !esAdmin\) return null;/, "a quien no administra se le muestra un mueble que se vende");
  const plano = sinComentarios(leer("src/components/FloorPlan2D/FloorPlan2D.tsx"));
  assert.match(plano, /<BloqueDeLaCara sede=\{sede\}[\s\S]*?onPorcentaje=\{isAdmin && esPc \? \(c\) => abrirEnDistribucion\(item\.id, c\) : undefined\}/);
  const tres = sinComentarios(leer("src/components/StoreEditor3D/StoreEditor3D.tsx"));
  assert.match(tres, /<BloqueDeLaCara variante="oscuro"[\s\S]*?motivo=\{motivoSinDistribuir\}/);
  assert.ok(!tres.includes(">\n              Distribuir esta cara\n"), "quedó el botón viejo del 3D");
  // La pantalla del planograma tiene la tira de pasos y se llama «Distribuir la cara».
  const pantalla = sinComentarios(leer("src/components/Planograma/PlanificarCara.tsx"));
  assert.match(pantalla, /<ol data-pasos-del-planograma/);
  assert.ok(pantalla.includes('aria-label="Distribuir la cara"'));
});

console.log("planogramas · los gemelos y la casa");

await prueba("los tipos y los colores son los del servidor; los tokens existen en claro y en oscuro", () => {
  const py = readFileSync(join(raiz, "../backend/app/models/planogramas.py"), "utf8");
  const tupla = (n) => [...(py.match(new RegExp(`${n} = \\(([^)]*)\\)`))?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual([...PL.TIPOS_DE_DESTINO.map((t) => t.tipo)].sort(), tupla("TIPOS_DE_DESTINO").sort());
  assert.deepEqual(PL.COLORES_DE_DESTINO, tupla("COLORES_DE_DESTINO"));
  const api = leer("src/api/planogramas.ts");
  assert.ok(api.includes(`"d1" | "d2" | "d3" | "d4" | "d5" | "d6"`), "ColorDeDestino no es la lista del servidor");
  const tema = leer("src/tema.css");
  for (let i = 1; i <= 6; i++) {
    const n = (tema.match(new RegExp(`--destino-${i}-rgb:`, "g")) ?? []).length;
    assert.ok(n >= 2, `--destino-${i}-rgb tiene que estar en claro y en oscuro (está ${n} vez)`);
  }
});

await prueba("cada ruta del cliente existe en el router, con su método", () => {
  const api = sinComentarios(leer("src/api/planogramas.ts"));
  const router = readFileSync(join(raiz, "../backend/app/routers/planogramas.py"), "utf8");
  const rutas = new Set([...router.matchAll(/@router\.(get|put|post|patch|delete)\("([^"]+)"/g)].map((m) => `${m[1]} ${m[2]}`));
  const llamadas = [...api.matchAll(/client\.(get|put|post|patch|delete)<[^>]*>\(`\$\{P\}([^`]*)`/g)].map((m) => `${m[1]} ${m[2].replace(/\$\{id\}/, "{destino_id}")}`);
  assert.ok(llamadas.length >= 10, `pocas llamadas: ${llamadas.length}`);
  for (const l of llamadas) assert.ok(rutas.has(l), `el cliente llama ${l} y el router no la tiene`);
  // Los GET reciben todo por query, nunca por ruta.
  for (const l of llamadas.filter((x) => x.startsWith("get "))) assert.ok(!l.includes("{"), `${l}: un GET con datos en la ruta`);
});

await prueba("la casa: nada en el navegador, nunca «sombra», un solo amarillo por pantalla, íconos de 16", () => {
  const archivos = ["src/store/planogramaStore.ts", "src/utils/planograma.ts", "src/api/planogramas.ts",
    "src/components/Planograma/PlanificarCara.tsx", "src/components/Planograma/CaraDelPlanograma.tsx",
    "src/components/Planograma/FormularioDeDestino.tsx", "src/pages/CarasDeLaSede.tsx"];
  for (const a of archivos) {
    const s = sinComentarios(leer(a));
    assert.ok(!/localStorage|sessionStorage|indexedDB/.test(s), `${a} guarda algo en el navegador`);
    assert.ok(!/sombra/i.test(s), `${a} dice «sombra»`);
    assert.ok(!/\bdark-/.test(s), `${a} usa colores congelados dark-*`);
  }
  const pantalla = sinComentarios(leer("src/components/Planograma/PlanificarCara.tsx"));
  // El amarillo: «Publicar versión N» en la pantalla y el de cada diálogo (que, abierto, ES la pantalla).
  assert.equal((pantalla.match(/btn-principal/g) ?? []).length, 1, "PlanificarCara: un solo amarillo, «Publicar versión N»");
  assert.equal((sinComentarios(leer("src/components/Planograma/PublicarVersion.tsx")).match(/btn-principal/g) ?? []).length, 1, "el diálogo de publicar: su propio amarillo");
  assert.equal((sinComentarios(leer("src/components/Planograma/FormularioDeDestino.tsx")).match(/btn-principal/g) ?? []).length, 1);
  assert.ok(pantalla.includes('const ICONO = { size: 16, strokeWidth: 1.75'), "los íconos de la pantalla son de 16");
  // Las palabras de la pantalla: ni números internos de participación ni «zona».
  for (const prohibida of ["participación ", "Participación ", "zona ", "capa "]) {
    const textos = [...pantalla.matchAll(/>([^<>{}]+)</g)].map((m) => m[1]);
    assert.ok(!textos.some((t) => t.includes(prohibida)), `la pantalla dice «${prohibida.trim()}»`);
  }
  // La pantalla se monta perezosa: no engorda el tablero.
  assert.ok(leer("src/pages/Dashboard.tsx").includes('lazy(() => import("../components/Planograma/PlanificarCara"))'));
});

await prueba("casos/planogramas.json es lo que arma el navegador hoy (lo corre test_planogramas_gemelos.py)", () => {
  const contenido = JSON.stringify({
    leeme: "Generado por `npm run probar:planogramas -- --escribir`. Piezas de destinos que arma el navegador con su % dibujado y los problemas que espera; `backend/tests/test_planogramas_gemelos.py` las pasa por `services/planogramas.revisar` del servidor.",
    casos,
  }, null, 1) + "\n";
  if (ESCRIBIR) { writeFileSync(RUTA_CASOS, contenido); console.log("       (escrito)"); return; }
  assert.equal(readFileSync(RUTA_CASOS, "utf8"), contenido, "casos/planogramas.json no es lo de hoy: corré `npm run probar:planogramas -- --escribir` y la prueba del servidor");
});

console.log(`\n${hechas} pruebas pasaron${process.exitCode ? ", hay fallas" : ""}.`);
