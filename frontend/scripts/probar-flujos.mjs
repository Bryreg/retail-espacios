/**
 * Conectar las tareas, no sumar pantallas (2026-10-28)
 *   npm run probar:flujos
 *
 * ── Por qué existe este archivo ──────────────────────────────────────────────
 *
 * Tres mejoras de flujo aprobadas por el dueño sobre el lienzo «Tres mejoras
 * de flujo»:
 *
 *   · Inicio e Indicadores: cada cifra lleva a la lista que la suma
 *     («Contratos activos» y «Canon del mes» → Indicadores › Contratos en
 *     «Vigentes hoy», con la suma al pie, de dónde se vino y «Volver»), y la
 *     configuración inicial oculta con pasos pendientes se retoma desde el
 *     Inicio.
 *   · Montajes: el reporte del enlace no se pierde sin señal (queda en el
 *     teléfono y se manda solo); «Ubicar la zona» abre Pendientes en esa fila
 *     con la vuelta a Montajes; después de verificar, el siguiente.
 *   · Pulido: el mismo foco en todo, «reducir movimiento», 375 px, el aviso al
 *     cambiar de sede con un contrato a medio cargar y las etiquetas «Cubre …».
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = join(aqui, "..");
const leer = (p) => readFileSync(join(raiz, p), "utf8");
const sinComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

let hechas = 0;
const prueba = async (n, fn) => {
  try { await fn(); hechas++; console.log("  ok   " + n); }
  catch (e) { console.error("  FALLA " + n + "\n         " + e.message.split("\n").join("\n         ")); process.exitCode = 1; }
};

const r = await build({
  stdin: { contents: 'export * as BM from "./src/utils/borradorDeMontaje.ts";', resolveDir: raiz, loader: "ts" },
  bundle: true, write: false, format: "esm", platform: "neutral", logLevel: "silent",
});
const { BM } = await import("data:text/javascript;base64," + Buffer.from(r.outputFiles[0].text).toString("base64"));

console.log("flujos · Inicio e Indicadores");

await prueba("cada cifra del Inicio dice qué abre y lleva a su lista filtrada", () => {
  const ini = sinComentarios(leer("src/components/Inicio/Inicio.tsx"));
  assert.ok(!ini.includes('"Ver indicadores"') && !ini.includes('"Ver la tabla"'), "quedó un enlace que no dice a dónde lleva");
  assert.ok(ini.includes('"Ver de dónde sale"') && ini.includes('"Ver cuáles son"'));
  assert.ok(/firmado.*todavía no empieza/.test(ini), "los firmados que no empezaron se dicen aparte");
  const d = sinComentarios(leer("src/pages/DashboardView.tsx"));
  assert.ok(d.includes('abrirTablaDesde("occupied", "Inicio", "Contratos activos")'));
  assert.ok(d.includes('abrirTablaDesde("occupied", "Inicio", "Canon del mes")'));
  assert.ok(d.includes('abrirTablaDesde("free", "Inicio", "Disponibles hoy")'), "quien no ve plata llega a los libres");
  assert.ok(d.includes('{ id: "occupied", label: "Vigentes hoy", n: cuantas("occupied") }'));
  assert.ok(d.includes("contratos: vigentesHoy,"), "«Contratos activos» es la pestaña «Vigentes hoy»");
});

await prueba("la tabla dice de dónde se vino, suma al pie y deja volver", () => {
  const d = sinComentarios(leer("src/pages/DashboardView.tsx"));
  assert.ok(d.includes("data-llegada") && d.includes("onIrAlInicio?.()") && d.includes('setPestanaInd(llegada.desde === "Análisis" ? "analisis" : "mapa")'));
  assert.ok(/suma=\{mapFilter === "occupied"/.test(d), "la suma sale sólo con los vigentes");
  assert.ok(d.includes("{isAdmin && sumaDeFilas !== null"), "la suma es plata: sólo administración");
  // Tocar otra pestaña u otro filtro olvida de dónde se vino.
  assert.equal((d.match(/setLlegada\(null\)/g) ?? []).length >= 4, true);
  // Desde el Mapa de oportunidades y el Análisis, cada lista lleva a su tabla.
  assert.ok(d.includes('abrirTablaDesde(filtro[capa], "Mapa de oportunidades", cifra[capa])'));
  assert.ok(d.includes('abrirTablaDesde(filtro, "Análisis", filtro === "expiring" ? "Por vencer" : "Ingreso contratado")'));
});

await prueba("la configuración inicial oculta con pasos pendientes se retoma desde el Inicio", () => {
  const c = sinComentarios(leer("src/components/Inicio/ConfiguracionInicial.tsx"));
  assert.ok(c.includes("pendiente: esAdmin && hechos < pasos.length") && c.includes("mostrar: () => mostrarConfiguracionInicial(cliente)"));
  const ini = sinComentarios(leer("src/components/Inicio/Inicio.tsx"));
  assert.ok(ini.includes("config.pendiente && !config.visible") && ini.includes("data-continuar-configuracion"));
});

console.log("\nflujos · Montajes");

await prueba("un error de red se guarda; un «no» del servidor, no", () => {
  assert.equal(BM.esErrorDeRed({ code: "ERR_NETWORK", message: "Network Error" }), true);
  assert.equal(BM.esErrorDeRed({ code: "ECONNABORTED", message: "timeout of 60000ms exceeded" }), true);
  assert.equal(BM.esErrorDeRed({ response: { status: 409 }, message: "Request failed" }), false);
  assert.equal(BM.esErrorDeRed({ response: { status: 401 } }), false);
  assert.equal(BM.esErrorDeRed(null), false);
});

await prueba("cuándo se guardó, en palabras y sin doble punto", () => {
  const t = BM.cuandoSeGuardo(new Date().toISOString());
  assert.ok(t.startsWith("hoy a las "), t);
  const f = sinComentarios(leer("src/components/Montaje/FormularioMontaje.tsx"));
  assert.ok(!/cuandoSeGuardo\([^)]*\)\}\./.test(f), "«p. m.» seguido de punto");
});

await prueba("el formulario guarda sin señal, reintenta al volver y ofrece lo guardado", () => {
  const f = sinComentarios(leer("src/components/Montaje/FormularioMontaje.tsx"));
  assert.ok(/if \(esErrorDeRed\(e\)\)[\s\S]{0,400}guardarBorrador\(clave/.test(f));
  assert.ok(f.includes('window.addEventListener("online", alVolver)'));
  assert.ok(/onSaved\(saved\)/.test(f) && /void borrarBorrador\(clave\);\s*setSinSenal\(null\);\s*onSaved\(saved\)/.test(f), "lo enviado no queda guardado");
  assert.ok(f.includes("data-reporte-guardado") && f.includes("Mandar ahora") && f.includes("Descartar"));
  assert.equal((f.match(/btn-principal/g) ?? []).length, 1, "un solo amarillo: «Confirmar»");
});

await prueba("«Ubicar la zona» abre esa fila en Pendientes y deja volver a Montajes", () => {
  const m = sinComentarios(leer("src/pages/MountView.tsx"));
  assert.ok(/onAbrirPendientes\(\{ codigo: f\.pendiente\?\.code \?\? f\.codigo/.test(m));
  const a = sinComentarios(leer("src/store/armazonStore.ts"));
  assert.ok(a.includes("abrirDesdeMontaje: (d) => set({ desdeMontaje: d, bandejaAbierta: true"));
  const d = sinComentarios(leer("src/pages/DashboardView.tsx"));
  assert.ok(d.includes("data-tira-montaje") && d.includes('setAttribute("data-desde-montaje", "1")'));
  assert.ok(d.includes('replace(/-PC\\d+$/i, "")'), "la participación se busca por su cara");
  const db = sinComentarios(leer("src/pages/Dashboard.tsx"));
  assert.ok(db.includes('desdeMontaje && efectivo !== "montajes"') && db.includes("data-volver-montaje"));
  assert.ok(db.includes("setMontajeResaltado(d.codigo)"), "al volver, la fila queda marcada");
});

await prueba("después de verificar, el siguiente sin verificar (sin otro amarillo)", () => {
  const v = sinComentarios(leer("src/components/Montaje/VerificarMontaje.tsx"));
  assert.ok(v.includes("data-siguiente-montaje") && v.includes("Verificar el siguiente"));
  assert.equal((v.match(/btn-principal/g) ?? []).length, 1);
  const m = sinComentarios(leer("src/pages/MountView.tsx"));
  assert.ok(m.includes('f.estado === "sin_verificar" && f.clave !== actual') && m.includes("key={mirando.clave}"));
});

console.log("\nflujos · pulido");

await prueba("el mismo foco en todo y «reducir movimiento» del sistema", () => {
  const css = leer("src/index.css");
  assert.ok(/:where\(button, a\[href\], input, select, textarea, summary, \[tabindex\]:not\(\[tabindex="-1"\]\)\):focus-visible \{\s*outline: 2px solid var\(--ring\);/.test(css));
  assert.ok(/@media \(prefers-reduced-motion: reduce\) \{\s*\*, \*::before, \*::after \{/.test(css));
});

await prueba("cambiar de sede con un contrato a medio cargar pregunta antes", () => {
  const db = sinComentarios(leer("src/pages/Dashboard.tsx"));
  assert.ok(db.includes("if (borrador && v !== sede) setPedida(v); else setSede(v);"));
  assert.ok(db.includes("Cambiar y descartarlo") && /autoFocus>Seguir en \{actual\}/.test(db), "seguir es lo de por defecto");
  const v = sinComentarios(leer("src/components/Contrato/ModoVender.tsx"));
  assert.ok(v.includes("avisarBorrador.current?.(borrador)") && v.includes("avisarBorrador.current?.(null)"));
  assert.ok(!v.includes("armazonStore"), "Vender no alcanza el armazón (ni Supervisar por él)");
  const d = sinComentarios(leer("src/pages/DashboardView.tsx"));
  assert.ok(d.includes("onBorrador={(t) => useArmazon.getState().setBorradorDeVenta(t)}"));
});

await prueba("las etiquetas «Cubre …» bajan de renglón y el rótulo no se parte", () => {
  const css = leer("src/vender.css");
  assert.ok(css.includes("grid-template-columns: minmax(max-content, 1fr) minmax(0, auto);"));
  assert.ok(css.includes(".pie-contrato .cubre { margin-top: 0; flex: 0 1 auto; min-width: 0; flex-wrap: wrap;"));
  const a = leer("src/armazon.css");
  assert.ok(/@media \(max-width: 389px\)/.test(a), "375 px: la barra del Plano");
});

console.log(`\n${hechas} pruebas · las tareas se conectan`);
