/**
 * La supervisión de los planogramas (fase 4 de la distribución, 2026-10-25).
 *   npm run probar:supervision
 *
 * ── Por qué existe este archivo ──────────────────────────────────────────────
 *
 * Quien monta avisa desde el enlace de la guía; una persona pone lo
 * planificado al lado de la foto y dice si coincide. Nada se decide solo. Acá:
 *
 *   · los gemelos con el servidor: los motivos de «no se pudo», los estados
 *     del montaje y las cuatro secciones de «Para revisar»;
 *   · las palabras: qué quedó mal («el 2 y el 3 quedaron mal»), la línea de
 *     cada cara en «Para revisar» y la pastilla (la vigente sin aviso entra el
 *     MISMO DÍA que empieza a regir, decisión del dueño);
 *   · lo que falta para guardar una revisión, con las reglas del servidor:
 *     «coincide» sin foto nueva pide haberla visto en la tienda; «no coincide»
 *     pide un número de la guía, u «Otra cosa» con la nota;
 *   · «Para revisar»: las cuatro van en «Hoy» y se cuentan en la pastilla roja;
 *   · las rutas del cliente existen en los routers;
 *   · la casa: un amarillo por archivo, nada comercial, nunca «sombra», la
 *     ficha y la guía entran perezosas en el tablero.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = join(aqui, "..");
const leer = (p) => readFileSync(join(raiz, p), "utf8");
const leerPy = (p) => readFileSync(join(raiz, "../backend/app", p), "utf8");
const sinComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

let hechas = 0;
const prueba = async (n, fn) => {
  try { await fn(); hechas++; console.log("  ok   " + n); }
  catch (e) { console.error("  FALLA " + n + "\n         " + e.message.split("\n").join("\n         ")); process.exitCode = 1; }
};

const r = await build({
  stdin: {
    contents: [
      'export * as SU from "./src/utils/supervision.ts";',
      'export * as PR from "./src/components/Supervisar/paraRevisar.ts";',
    ].join("\n"),
    resolveDir: raiz, loader: "ts",
  },
  bundle: true, write: false, format: "esm", platform: "neutral", logLevel: "silent",
});
const { SU, PR } = await import("data:text/javascript;base64," + Buffer.from(r.outputFiles[0].text).toString("base64"));

/** Una tupla de Python `("a", "b")` → ["a", "b"]. */
const tupla = (py, nombre) => {
  const m = py.match(new RegExp(`${nombre}\\s*=\\s*\\(([^)]*)\\)`));
  assert.ok(m, `no encontré ${nombre}`);
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
};

const HOY = "2026-10-24";
const instante = (y, m, d, h, mi) => new Date(y, m - 1, d, h, mi).toISOString();
const cara = (estado, extra = {}) => ({
  version_id: 7, numero: 2, fixture_id: "f-GON-12", cara: "A", codigo: "GON-12", nombre: "GON-12 · cara A",
  estado, rige_desde: HOY, dias_que_rige: 0, aviso: null, revision: null, fotos_nuevas: 0, ...extra,
});

console.log("supervisión · los gemelos con el servidor");

await prueba("los motivos de «no se pudo» son los del servidor, con las mismas palabras", () => {
  const modelos = leerPy("models/planogramas.py");
  const servicio = leerPy("services/supervision_planogramas.py");
  assert.deepEqual(SU.MOTIVOS_DE_NO_MONTAJE.map((m) => m.id), tupla(modelos, "MOTIVOS_DE_NO_MONTAJE"));
  for (const m of SU.MOTIVOS_DE_NO_MONTAJE) {
    assert.ok(servicio.includes(`"${m.id}": "${m.texto}"`), `el servidor no dice «${m.texto}» para ${m.id}`);
  }
  assert.deepEqual(tupla(modelos, "ESTADOS_DE_MONTAJE"), ["montada", "no_se_pudo"]);
  assert.deepEqual(tupla(modelos, "RESULTADOS_DE_REVISION"), ["coincide", "no_coincide"]);
});

await prueba("los estados del montaje y las cuatro secciones son los del servidor", () => {
  const servicio = leerPy("services/supervision_planogramas.py");
  const docEstados = servicio.match(/"""no_rige[^"]*"""/)?.[0] ?? "";
  for (const e of Object.keys(SU.ESTADO_DE_MONTAJE)) assert.ok(docEstados.includes(e), `el servidor no conoce el estado ${e}`);
  assert.deepEqual([...SU.ORDEN_DE_SUPERVISION].sort(), tupla(servicio, "PARA_REVISAR").sort());
  assert.deepEqual([...SU.ORDEN_DE_SUPERVISION], ["por_revisar", "no_coincide", "no_se_pudo", "sin_montar"], "el orden del dibujo aprobado");
});

console.log("\nsupervisión · las palabras");

await prueba("qué quedó mal, con los números de la guía", () => {
  assert.equal(SU.queQuedoMal([2], false), "el 2 quedó mal");
  assert.equal(SU.queQuedoMal([2, 3], false), "el 2 y el 3 quedaron mal");
  assert.equal(SU.queQuedoMal([1, 2, 4], true), "el 1, el 2 y el 4 quedaron mal y otra cosa");
  assert.equal(SU.queQuedoMal([], true), "otra cosa");
});

await prueba("la línea de cada cara en «Para revisar» y su pastilla", () => {
  // Sin aviso: entra el mismo día que empieza a regir.
  assert.equal(SU.lineaParaRevisar(cara("sin_montar"), HOY), "rige desde hoy · nadie avisó");
  assert.equal(SU.pastillaParaRevisar(cara("sin_montar")), "hoy");
  assert.equal(SU.lineaParaRevisar(cara("sin_montar", { rige_desde: "2026-10-21", dias_que_rige: 3 }), HOY), "rige desde el 21 oct · nadie avisó");
  assert.equal(SU.pastillaParaRevisar(cara("sin_montar", { dias_que_rige: 3 })), "3d");
  const aviso = { id: 1, estado: "montada", motivo: null, motivo_legible: null, nota: null, por_enlace: true, por: null, en: instante(2026, 10, 24, 9, 40) };
  assert.equal(SU.lineaParaRevisar(cara("por_revisar", { aviso, fotos_nuevas: 2 }), HOY), "avisó que quedó · hoy 9:40 · con 2 fotos");
  assert.equal(SU.lineaParaRevisar(cara("por_revisar", { aviso, fotos_nuevas: 0 }), HOY), "avisó que quedó · hoy 9:40 · sin foto");
  const noPudo = { ...aviso, estado: "no_se_pudo", motivo: "sin_producto", motivo_legible: "No llegó el producto", nota: "Halloween", en: instante(2026, 10, 23, 18, 5) };
  assert.equal(SU.lineaParaRevisar(cara("no_se_pudo", { aviso: noPudo }), HOY), "No llegó el producto · Halloween · ayer 18:05");
  const revision = { id: 3, montaje_id: 1, resultado: "no_coincide", numeros: [2, 3], otra_cosa: false, nota: null, en_la_tienda: false,
    guia_reenviada: true, por: "ana@super.co", en: instante(2026, 10, 21, 11, 0) };
  assert.equal(SU.lineaParaRevisar(cara("no_coincide", { revision }), HOY), "el 2 y el 3 quedaron mal · guía reenviada 21 oct");
  assert.equal(SU.lineaParaRevisar(cara("no_coincide", { revision: { ...revision, guia_reenviada: false } }), HOY),
    "el 2 y el 3 quedaron mal · esperando que lo corrijan");
});

await prueba("lo que falta para guardar una revisión: las reglas del servidor", () => {
  const base = { numeros: [], otraCosa: false, nota: "", enLaTienda: false, hayFotoNueva: false, total: 3 };
  assert.match(SU.faltaParaRevisar({ ...base, resultado: "coincide" }), /viste en la tienda/);
  assert.equal(SU.faltaParaRevisar({ ...base, resultado: "coincide", hayFotoNueva: true }), null);
  assert.equal(SU.faltaParaRevisar({ ...base, resultado: "coincide", enLaTienda: true }), null);
  assert.match(SU.faltaParaRevisar({ ...base, resultado: "no_coincide" }), /Tocá los números/);
  assert.match(SU.faltaParaRevisar({ ...base, resultado: "no_coincide", numeros: [4] }), /del 1 al 3/);
  assert.match(SU.faltaParaRevisar({ ...base, resultado: "no_coincide", otraCosa: true }), /escribí qué hay que corregir/);
  assert.equal(SU.faltaParaRevisar({ ...base, resultado: "no_coincide", numeros: [2] }), null);
  // Las mismas frases que el servidor.
  const servicio = leerPy("services/supervision_planogramas.py");
  for (const f of ["Tocá los números que quedaron mal (o «Otra cosa»).", "Con «Otra cosa», escribí qué hay que corregir.",
    "No hay foto nueva: sólo se da por buena si la viste en la tienda."]) assert.ok(servicio.includes(f), `el servidor no dice «${f}»`);
});

console.log("\nsupervisión · «Para revisar» y la casa");

await prueba("las cuatro secciones van en «Hoy» y cuentan en la pastilla roja", () => {
  const secciones = ["planograma_por_revisar", "planograma_no_coincide", "planograma_no_se_pudo", "planograma_sin_montar"];
  for (const s of secciones) assert.equal(PR.grupoDelAviso(s, 30), "hoy", `${s} no va en Hoy`);
  const n = PR.contarPorGrupo(secciones.map((s, i) => ({ seccion: s, clave: `pg:${i}` })));
  assert.deepEqual(n, { hoy: 4, dias30: 0, corregir: 0 });
  assert.equal(PR.tituloDeSeccion("planograma_sin_montar", "hoy"), "Planograma sin montar");
  assert.equal(PR.tituloDeSeccion("planograma_por_revisar", "hoy"), "Planograma montado por revisar");
  const tablero = leer("src/pages/DashboardView.tsx");
  assert.ok(/for \(const c of planogramasPorRevisar\.filas\)[\s\S]{0,200}SECCION_DE_SUPERVISION[\s\S]{0,400}if \(!isAdmin\) return a;/.test(tablero),
    "los planogramas cuentan también para el equipo (el servidor ya filtra lo que puede revisar)");
  assert.ok(/lazy\(\(\) => import\("\.\.\/components\/Supervision\/RevisarMontaje"\)\)/.test(tablero), "la ficha entra perezosa");
});

await prueba("cada ruta del cliente existe en su router", () => {
  const guiaPy = leerPy("routers/guia.py");
  const planPy = leerPy("routers/planogramas.py");
  const rutas = new Set([
    ...[...guiaPy.matchAll(/@router\.(get|post)\("([^"]*)"/g)].map((m) => `${m[1]} /guia${m[2]}`),
    ...[...planPy.matchAll(/@router\.(get|post|put|patch)\("([^"]*)"/g)].map((m) => `${m[1]} /planogramas${m[2]}`),
  ]);
  const llamadas = [
    ...sinComentarios(leer("src/api/supervision.ts")).matchAll(/client\.(get|post)<[^>]*>\("([^"]+)"/g),
    ...sinComentarios(leer("src/api/guia.ts")).matchAll(/\.(get|post)<\{ aviso[^>]*>\("([^"]+)"/g),
  ].map((m) => `${m[1]} ${m[2]}`);
  // 5: la lista de Montajes (etapa 7) lee la misma supervisión con `todas`.
  assert.equal(llamadas.length, 5, `faltan llamadas: ${llamadas.join(" | ")}`);
  for (const l of llamadas) assert.ok(rutas.has(l), `el cliente llama ${l} y no existe`);
});

await prueba("la casa: un amarillo por archivo, nada comercial, nunca «sombra»", () => {
  for (const [a, n] of [["src/components/Supervision/RevisarMontaje.tsx", 1], ["src/pages/GuiaDeMontaje.tsx", 1],
    ["src/components/Supervisar/PlanogramasPorRevisar.tsx", 0], ["src/components/Planograma/Versiones.tsx", 0]]) {
    const s = sinComentarios(leer(a));
    assert.equal((s.match(/btn-principal/g) ?? []).length, n, `${a}: ${n} amarillo(s)`);
    assert.ok(!/formatCOP|negotiatedValue|valor_mensual|monthly_rent|supplierName|supplier_id|lease_id/.test(s), `${a} toca algo comercial`);
    assert.ok(!/sombra/i.test(s), `${a} dice «sombra»`);
    assert.ok(!/localStorage/.test(s), `${a} guarda algo en el navegador`);
  }
  for (const a of ["src/utils/supervision.ts", "src/api/supervision.ts"]) assert.ok(!/sombra/i.test(sinComentarios(leer(a))));
  // Lo único amarillo de la ficha es «Sí, coincide» (o guardar lo que quedó mal).
  const ficha = sinComentarios(leer("src/components/Supervision/RevisarMontaje.tsx"));
  assert.ok(ficha.includes("Sí, coincide") && ficha.includes("Lo vi en la tienda: coincide") && ficha.includes("Guardar y mandar la guía"));
  assert.ok(ficha.includes("const [reenviar, setReenviar] = useState(true)"), "mandar la guía de nuevo viene marcado (decisión del dueño)");
});

console.log(`\n${hechas} pruebas pasaron${process.exitCode ? ", hay fallas" : ""}.`);
