/**
 * Pruebas del armazón del rediseño UX 2026-10 (etapas 2 y 3).
 *   npm run probar:armazon
 *
 * Lo que, si se rompe, rompe la aplicación entera en silencio:
 *
 *  · Cada módulo tiene su dirección y cada dirección su módulo (`modulos.ts`):
 *    un enlace guardado, el «atrás» del navegador y el enlace del correo de
 *    montaje llevan al mismo lugar. Lo que no es de ningún módulo va al Inicio.
 *  · Quien trabaja en la tienda abre lo mismo que abría con las pestañas: el
 *    Inicio, Indicadores (lo que era Supervisar) y Montajes. Ni Contratos, ni
 *    el Plano, ni Ajustes.
 *  · La sede se elige en UN lugar.
 *  · La bandeja de Pendientes: lo de «Para revisar» se pide en Supervisar o con
 *    la bandeja abierta, nunca con Vender abierto y la bandeja cerrada (Vender
 *    lo mira el proveedor); la pastilla roja no se dibuja en Contratos.
 *  · El Inicio no muestra plata a quien no administra.
 *  · La línea de tiempo de la ficha: de qué cara es cada contrato del
 *    historial (la A no se lleva los de la B) y desde qué día queda disponible.
 */
import assert from "node:assert/strict";
import { build } from "esbuild";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { writeFileSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = join(aqui, "..");
const leer = (...p) => readFileSync(join(raiz, "src", ...p), "utf8");
const sinComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");

async function cargar(entrada) {
  const salida = join(mkdtempSync(join(tmpdir(), "arm-")), "m.mjs");
  const { outputFiles } = await build({
    entryPoints: [join(raiz, "src", entrada)], bundle: true, format: "esm", write: false, platform: "neutral",
  });
  writeFileSync(salida, outputFiles[0].text);
  return import(pathToFileURL(salida).href);
}
const M = await cargar("modulos.ts");
const L = await cargar("utils/lineaDeTiempo.ts");
const LS = await cargar("utils/lineaDeLaSede.ts");
const I = await cargar("utils/indicadores.ts");

let hechas = 0;
const prueba = (n, fn) => {
  try { fn(); hechas++; console.log("  ok   " + n); }
  catch (e) { console.error("  FALLA " + n + "\n         " + e.message); process.exitCode = 1; }
};

console.log("\narmazón · módulos y direcciones");

prueba("cada módulo tiene su dirección y cada dirección vuelve a su módulo", () => {
  for (const [m, ruta] of Object.entries(M.RUTA_DE)) assert.equal(M.moduloDeRuta(ruta), m, `${ruta} no vuelve a ${m}`);
  assert.equal(new Set(Object.values(M.RUTA_DE)).size, Object.keys(M.RUTA_DE).length, "dos módulos con la misma dirección");
  // La barra final y el index.html no cambian de módulo.
  assert.equal(M.moduloDeRuta("/contratos/"), "contratos");
  assert.equal(M.moduloDeRuta("/plano/3d/"), "plano3d");
  assert.equal(M.moduloDeRuta("/index.html"), "inicio");
  // Lo que no es de ningún módulo: null (el Dashboard lo manda al Inicio).
  for (const x of ["/no-existe", "/plano/4d", "/contratosx", "/ajustes/raro"]) assert.equal(M.moduloDeRuta(x), null, x);
});

prueba("quien trabaja en la tienda abre lo de antes: el Inicio, Indicadores y Montajes", () => {
  const todos = Object.keys(M.RUTA_DE);
  assert.deepEqual(todos.filter((m) => M.puedeAbrir(m, false)).sort(), ["indicadores", "inicio", "montajes"]);
  assert.deepEqual(todos.filter((m) => M.puedeAbrir(m, true)).sort(), [...todos].sort());
});

prueba("el Dashboard monta los módulos sin volver a montarse y manda lo desconocido o prohibido al Inicio", () => {
  // Sin quitar comentarios: `path="/*"` se leería como el comienzo de uno.
  const app = leer("App.tsx");
  assert.match(app, /<Route path="\/\*" element=\{plataforma \? <Navigate to="\/plataforma" replace \/> : <Dashboard \/>\} \/>/);
  for (const r of ["/plataforma", "/renumerar", "/taller", "/reporte-plataforma"]) assert.ok(app.includes(`path="${r}"`), `se perdió la ruta ${r}`);
  const dash = sinComentarios(leer("pages", "Dashboard.tsx"));
  assert.match(dash, /const permitido = modulo !== null && puedeAbrir\(modulo, isAdmin\);\s*useEffect\(\(\) => \{\s*if \(!permitido\) navigate\(RUTA_DE\.inicio, \{ replace: true \}\);/);
  assert.match(dash, /if \(mountCode\) navigate\(RUTA_DE\.montajes, \{ replace: true \}\);/, "el enlace del correo de montaje no abre Montajes");
  // Contratos, Indicadores e Inicio son la MISMA pantalla comercial (un solo elemento).
  assert.equal((dash.match(/<DashboardView\b/g) ?? []).length, 1, "la pantalla comercial se monta en más de un lugar");
  // El 2D y el 3D siguen alcanzándose: el selector 2D | 3D de la barra.
  assert.match(dash, /\["plano", "2D",[\s\S]{0,200}\["plano3d", "3D",/);
});

prueba("la sede se elige en un solo lugar de la aplicación", () => {
  const archivos = [["pages", "Dashboard.tsx"], ["pages", "DashboardView.tsx"], ["components", "FloorPlan2D", "FloorPlan2D.tsx"], ["components", "StoreEditor3D", "StoreEditor3D.tsx"]];
  const selects = archivos.map((a) => (sinComentarios(leer(...a)).match(/aria-label="Sede"/g) ?? []).length);
  assert.deepEqual(selects, [1, 0, 0, 0], "hay más de un selector de sede");
});

console.log("\narmazón · Pendientes, Inicio y la ficha");

prueba("lo de «Para revisar» se pide en Supervisar o con la bandeja abierta; la pastilla no va en Contratos", () => {
  const v = sinComentarios(leer("pages", "DashboardView.tsx"));
  assert.match(v, /const pideRevision = modoEfectivo === "supervisar" \|\| bandejaAbierta;/);
  for (const h of ["useCobrosPorVentas", "useReservasDeEspacio", "useFaltaPlanometria", "usePrecioSinForma"])
    assert.match(v, new RegExp(`${h}\\(\\{ sede, activo: isAdmin && pideRevision \\}\\)`), `${h} se pide sin la regla`);
  assert.match(v, /usePlanogramasPorRevisar\(\{ sede, activo: pideRevision \}\)/);
  // La bandeja y la tarjeta de Indicadores dibujan el MISMO cuerpo, nunca las dos a la vez.
  assert.equal((v.match(/\{cuerpoDeRevision\}/g) ?? []).length, 1);
  assert.match(v, /\{bandejaAbierta\s*\?\s*<div className="vacio-r">Abierto en Pendientes\.<\/div>\s*:\s*cuerpoDeRevision\}/);
  const dash = sinComentarios(leer("pages", "Dashboard.tsx"));
  assert.match(dash, /const n = modulo === "contratos" \? 0 : cuenta;/);
});

prueba("el Inicio no le muestra plata a quien no administra, ni la bitácora", () => {
  const v = sinComentarios(leer("pages", "DashboardView.tsx"));
  assert.match(v, /const canonDelMes = useMemo\(\(\) => \{\s*if \(!isAdmin\) return null;/);
  const ini = sinComentarios(leer("components", "Inicio", "Inicio.tsx"));
  assert.match(ini, /\{esAdmin && cifras\.canonDelMes !== null \? \(/, "el canon se dibuja sin mirar el rol");
  const efecto = ini.slice(ini.indexOf("useEffect(() => {"), ini.indexOf("}, [esAdmin]);"));
  assert.ok(efecto.indexOf("if (!esAdmin) return;") >= 0 && efecto.indexOf("if (!esAdmin) return;") < efecto.indexOf("getBitacora("),
    "la bitácora se pide sin ser administración");
  assert.match(ini, /\{esAdmin && \(\s*<section className="ini-panel" data-actividad>/);
  // Un solo botón principal en el Inicio.
  assert.equal((ini.match(/btn-principal/g) ?? []).length, 1);
});

prueba("la ficha: la cara A no se lleva los contratos de la B, y sí los de sus partes", () => {
  const A = "CENTRO-GON-01";
  assert.ok(L.esDeLaCara("CENTRO-GON-01", A));
  assert.ok(L.esDeLaCara("CENTRO-GON-01-PC1", A));
  assert.ok(L.esDeLaCara("CENTRO-GON-01-EN2", A));
  assert.ok(!L.esDeLaCara("CENTRO-GON-01-B", A));
  assert.ok(!L.esDeLaCara("CENTRO-GON-01-B-PC1", A));
  assert.ok(!L.esDeLaCara("CENTRO-GON-012", A), "otro mueble con el mismo comienzo");
  assert.ok(!L.esDeLaCara("CENTRO-GON-10", A));
  // Una parte que empieza con B (una bahía) sigue siendo de la A.
  assert.ok(L.esDeLaCara("CENTRO-CAJ-01-BA1", "CENTRO-CAJ-01"));
  assert.ok(L.esDeLaCara("CENTRO-GON-01-B-PC1", "CENTRO-GON-01-B"));
});

prueba("la ficha: desde qué día queda disponible la cara entera", () => {
  const hoy = new Date(2026, 9, 26);
  const c = "CENTRO-PUN-07";
  const f = (desde, hasta, estado = "vigente", espacio = c) => ({ espacio, estado, desde, hasta });
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  assert.equal(iso(L.libreDesde([], c, hoy)), "2026-10-26", "sin contratos no está libre hoy");
  assert.equal(iso(L.libreDesde([f("2026-05-01", "2026-10-31")], c, hoy)), "2026-11-01");
  // Uno pegado al otro: se sigue de largo.
  assert.equal(iso(L.libreDesde([f("2026-05-01", "2026-10-31"), f("2026-11-01", "2027-01-31", "proximo")], c, hoy)), "2027-02-01");
  // Con un hueco, el hueco.
  assert.equal(iso(L.libreDesde([f("2026-05-01", "2026-10-31"), f("2026-11-15", "2027-01-31", "proximo")], c, hoy)), "2026-11-01");
  // Lo terminado, lo cancelado y las partes no ocupan la cara entera.
  assert.equal(iso(L.libreDesde([f("2026-01-01", "2026-12-31", "cancelado"), f("2026-01-01", "2026-12-31", "vigente", c + "-EN1")], c, hoy)), "2026-10-26");
  // Termina hoy: libre mañana.
  assert.equal(iso(L.libreDesde([f("2026-10-01", "2026-10-26")], c, hoy)), "2026-10-27");
});

console.log("\narmazón · Contratos (etapa 4)");

prueba("la línea de la sede: un carril por cara, las partes debajo, y nada de otra sede", () => {
  const muebles = [{ id: "a", code: "GON-01", doble: true }, { id: "b", code: "PUN-03", doble: false }];
  const filas = [
    { espacio: "CENTRO-GON-01-B-PC1", tipo: "contrato", desde: "2026-09-01", hasta: "2027-02-28" },
    { espacio: "CENTRO-PUN-03-EN2", tipo: "contrato", desde: "2026-09-01", hasta: "2027-02-28" },
    { espacio: "CENTRO-PUN-03", tipo: "reserva", desde: "2026-11-01", hasta: "2026-11-30", caduca: "2026-10-30" },
    { espacio: "CENTRO-PUN-03", tipo: "contrato", desde: "2027-03-01", hasta: "2027-04-30" },
    { espacio: "CENTRO-PUN-030", tipo: "contrato", desde: "2027-03-01", hasta: "2027-04-30" },
  ];
  const c = LS.armarCarriles(muebles, filas, "centro");
  assert.deepEqual(c.map((x) => x.etiqueta), ["GON-01·A", "GON-01·B", "GON-01·B·PC1", "PUN-03", "PUN-03·EN2"]);
  const pun = c.find((x) => x.etiqueta === "PUN-03");
  assert.deepEqual(pun.barras.map((b) => [b.tipo, b.desde]), [["reserva", "2026-11-01"], ["contrato", "2027-03-01"]], "las barras no van en orden");
  assert.equal(pun.barras[0].caduca, "2026-10-30");
  const pc = c.find((x) => x.etiqueta === "GON-01·B·PC1");
  assert.deepEqual([pc.cara, pc.sufijo, pc.codigo], ["B", "PC1", "CENTRO-GON-01-B-PC1"]);
});

prueba("la línea de la sede: el hueco de un día y si está disponible en las fechas", () => {
  const b = [{ tipo: "contrato", desde: "2026-11-01", hasta: "2026-11-30" }, { tipo: "reserva", desde: "2027-01-15", hasta: "2027-02-14" }];
  assert.deepEqual(LS.huecoEn(b, "2026-12-20", "2026-10-26", "2027-10-26"), { desde: "2026-12-01", hasta: "2027-01-14", dias: 45 });
  assert.deepEqual(LS.huecoEn(b, "2026-10-28", "2026-10-26", "2027-10-26"), { desde: "2026-10-26", hasta: "2026-10-31", dias: 6 });
  assert.deepEqual(LS.huecoEn(b, "2027-05-01", "2026-10-26", "2027-10-26"), { desde: "2027-02-15", hasta: "2027-10-26", dias: 254 });
  assert.equal(LS.huecoEn(b, "2026-11-15", "2026-10-26", "2027-10-26"), null, "adentro de un contrato no hay hueco");
  assert.equal(LS.huecoEn(b, "2028-01-01", "2026-10-26", "2027-10-26"), null, "fuera de la línea no hay hueco");
  assert.ok(LS.libreEnLasFechas(b, "2026-12-01", "2027-01-14"));
  assert.ok(!LS.libreEnLasFechas(b, "2026-12-01", "2027-01-15"), "el día que arranca la reserva no está libre");
  assert.ok(!LS.libreEnLasFechas(b, "2026-10-01", "2026-11-01"));
  assert.equal(LS.diasEntre("2026-10-26", "2026-10-26"), 1);
  assert.equal(LS.diasEntre("2026-02-01", "2026-03-01"), 29);
});

prueba("Contratos: la línea no pide proveedores ni plata, y cada pantalla tiene su periodo", () => {
  const api = sinComentarios(leer("api", "spaces.ts"));
  const fila = api.slice(api.indexOf("export interface FilaDeLaLinea"), api.indexOf("export const getLineaDeLaSede"));
  assert.doesNotMatch(fila, /proveedor|supplier|valor|monto|precio/i, "la fila de la línea trae proveedor o plata");
  const linea = sinComentarios(leer("components", "Contrato", "LineaDeLaSede.tsx"));
  assert.doesNotMatch(linea, /proveedor|supplierName|negotiatedValue|valor_/i, "la línea de la sede dibuja proveedor o plata");
  const v = sinComentarios(leer("pages", "DashboardView.tsx"));
  assert.match(v, /const mapRange: DateRange \| null = modoEfectivo === "vender" \? rangoVender : rangoSupervisar;/, "Contratos e Indicadores comparten el periodo");
  // El contrato sigue a «¿Para qué fechas?» mientras nadie toque sus fechas.
  const c = sinComentarios(leer("components", "Contrato", "Contrato.tsx"));
  assert.match(c, /useEffect\(\(\) => \{\s*if \(fechasTocadas\.current \|\| !rango\) return;/);
});

console.log("\narmazón · Indicadores (etapa 5)");

prueba("las cuentas: contra la meta, canon ÷ tarifa, lo que vence, los montajes, los días sin contrato", () => {
  assert.deepEqual([I.contraLaMeta(90, 90), I.contraLaMeta(85, 90), I.contraLaMeta(80, 90), I.contraLaMeta(79, 90)], ["ok", "bajo", "bajo", "muy_bajo"]);
  assert.equal(I.textoContraLaMeta(78, 90), "Bajo la meta de 90 %");
  const ct = I.canonContraTarifa([{ alMes: 500, tarifa: 600 }, { alMes: 700, tarifa: 600 }, { alMes: 900, tarifa: 0 }]);
  assert.deepEqual(ct, { pct: 100, canon: 1200, tarifa: 1200, contadas: 2, sinTarifa: 1 }, "un contrato sin tarifa entra en la cuenta");
  assert.equal(I.canonContraTarifa([]).pct, null);
  const v = I.venceEn([
    { codigo: "A", hasta: "2026-11-10", alMes: 100, renovado: false },
    { codigo: "B", hasta: "2026-12-01", alMes: 200, renovado: true },
    { codigo: "C", hasta: "2027-03-01", alMes: 400, renovado: false },
    { codigo: "D", hasta: "2026-10-20", alMes: 800, renovado: false },
  ], "2026-10-26", 90);
  assert.deepEqual(v.puntos.map((p) => [p.codigo, p.dias]), [["A", 15], ["B", 36]], "lo vencido o lo que pasa de 90 días cuenta");
  assert.deepEqual([v.sinRenovar, v.total], [100, 300]);
  const m = I.montajesDelMes([
    { desde: "2026-10-01", estado: "verificado" }, { desde: "2026-10-15", estado: "sin_verificar" },
    { desde: "2026-10-20", estado: "sin_montar" }, { desde: "2026-09-30", estado: "no_realizado" },
  ], "2026-10-26");
  assert.deepEqual([m.total, m.enLaTienda, m.porEstado.no_realizado], [3, 2, 0], "un contrato de otro mes cuenta en los del mes");
  assert.deepEqual(I.diasSinContrato(["PUN-08", "GON-02·B"], { "PUN-08": "2026-09-30" }, "2026-10-26"),
    [{ codigo: "PUN-08", dias: 26 }, { codigo: "GON-02·B", dias: null }]);
  assert.deepEqual(I.variacion([100, 110]), { actual: 110, anterior: 100, pct: 10 });
  assert.equal(I.variacion([0, 50]).pct, null, "contra cero no hay porcentaje");
  assert.equal(I.pesos(9939500), "$ 9.939.500");
});

prueba("el CSV: separado por punto y coma, con BOM, y las comillas donde hacen falta", () => {
  const t = I.aCsv(["A", "B"], [["x;y", 'di "hola"'], [1, null]]);
  assert.ok(t.startsWith("\uFEFFA;B\r\n"));
  assert.ok(t.includes('"x;y";"di ""hola"""'));
  assert.ok(t.endsWith("1;\r\n"));
});

prueba("Indicadores: cada tarjeta tiene su definición, y quien no administra no ve plata", () => {
  const res = sinComentarios(leer("components", "Indicadores", "Resumen.tsx"));
  const ids = [...res.matchAll(/<Tarjeta id="([a-z_0-9]+)"/g)].map((m) => m[1]);
  assert.ok(ids.length >= 7, `el Resumen tiene ${ids.length} tarjetas`);
  for (const id of ids) assert.ok(I.metrica(id), `la tarjeta «${id}» no tiene definición en el diccionario`);
  // Las de plata, sólo para administración.
  assert.match(res, /\{esAdmin && c && canonDelPeriodo && \(\s*<Tarjeta id="canon"/);
  assert.match(res, /\{esAdmin && datos\.canonTarifa && \(\s*<Tarjeta id="canon_tarifa"/);
  assert.match(res, /\{esAdmin && datos\.disponibles\.sinFacturar !== null && \(/);
  for (const m of I.METRICAS) assert.ok(m.formula && m.periodo && m.origen, `«${m.nombre}» sin fórmula, periodo u origen`);
  const dic = sinComentarios(leer("components", "Indicadores", "Diccionario.tsx"));
  assert.match(dic, /METRICAS\.filter\(\(m\) => esAdmin \|\| !m\.plata\)/, "el diccionario le muestra las de plata a quien no administra");
  // La serie y las tarifas, sólo para quien administra.
  const v = sinComentarios(leer("pages", "DashboardView.tsx"));
  assert.match(v, /if \(!isAdmin \|\| !enIndicadores\) return;\s*let vivo = true;\s*getSerieDeCanon/);
});

prueba("lo que trae un contrato a Vender cierra la bandeja de Pendientes (Editar desde Contratos la dejaba encima)", () => {
  const v = sinComentarios(leer("pages", "DashboardView.tsx"));
  assert.match(v, /const setModo = useCallback\(\(m: ModoComercial\) => \{\s*if \(m === "vender"\) useArmazon\.getState\(\)\.cerrarBandeja\(\);/);
});

console.log(`\n${hechas} pruebas pasaron${process.exitCode ? " — HAY FALLAS" : ""}\n`);
