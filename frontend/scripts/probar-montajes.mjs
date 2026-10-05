/**
 * Pruebas de src/utils/montajeDelContrato.ts — cada contrato con sus propios
 * reportes de montaje.
 *   npm run probar:montajes
 *
 * El caso que la motiva (2026-10-05): Alpina tuvo la punta hasta el 20 de
 * octubre y se reportó montada; Colanta la compró desde el 21. El tablero
 * tomaba el último reporte del CÓDIGO, así que Colanta nunca aparecía como
 * pendiente y Supervisar la pintaba «Montado» con la foto de Alpina.
 */
// El navegador de quien usa esto está en Colombia. Con el proceso en UTC —los
// runners de CI lo están— una hora sin huso se leería bien por casualidad y la
// prueba de abajo no mordería.
process.env.TZ = "America/Bogota";

import assert from "node:assert/strict";
import { build } from "esbuild";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { writeFileSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = join(aqui, "..");
const salida = join(mkdtempSync(join(tmpdir(), "mon-")), "m.mjs");
const { outputFiles } = await build({
  entryPoints: [join(raiz, "src", "utils", "montajeDelContrato.ts")],
  bundle: true, format: "esm", write: false, platform: "neutral",
});
writeFileSync(salida, outputFiles[0].text);
const M = await import(pathToFileURL(salida).href);
const fuente = (...partes) => readFileSync(join(raiz, ...partes), "utf8");

let hechas = 0;
const prueba = (n, fn) => {
  try { fn(); hechas++; console.log("  ok   " + n); }
  catch (e) { console.error("  FALLA " + n + "\n         " + e.message); process.exitCode = 1; }
};

const CODIGO = "NAVE-PUN-04";
let id = 0;
const reporte = (confirmado_en, extra = {}) =>
  ({ id: ++id, space_code: CODIGO, estado: "montado", confirmado_en, ...extra });
// El backend los manda del más reciente al más viejo.
const indexar = (...reportes) =>
  M.reportesPorCodigo([...reportes].sort((a, b) => M.instanteDe(b) - M.instanteDe(a)));

console.log("El caso que la motivó");

prueba("el «montado» de Alpina no cuenta para Colanta, que arranca después", () => {
  const alpina = reporte("2026-09-02T15:00:00+00:00", { reportado_por: "Yenny" });
  const porCodigo = indexar(alpina);
  assert.equal(M.reporteDelContrato(porCodigo, CODIGO, "2026-10-21"), undefined);
  // Para el contrato de Alpina sí es su reporte.
  assert.equal(M.reporteDelContrato(porCodigo, CODIGO, "2026-09-01"), alpina);
});

prueba("lo que se reporta para Colanta, desde la víspera, sí cuenta", () => {
  const alpina = reporte("2026-09-02T15:00:00+00:00");
  const colanta = reporte("2026-10-20T13:00:00+00:00"); // 8 a. m. del 20, en Colombia
  assert.equal(M.reporteDelContrato(indexar(alpina, colanta), CODIGO, "2026-10-21"), colanta);
});

console.log("El borde: la víspera, a medianoche de Colombia");

prueba("un segundo antes de la medianoche del 20 (hora de Colombia) no cuenta; a medianoche, sí", () => {
  assert.equal(M.cuentaDesde("2026-10-21"), Date.UTC(2026, 9, 20, 5, 0, 0));
  const antes = reporte("2026-10-20T04:59:59+00:00");
  const justo = reporte("2026-10-20T05:00:00+00:00");
  assert.equal(M.reporteDelContrato(indexar(antes), CODIGO, "2026-10-21"), undefined);
  assert.equal(M.reporteDelContrato(indexar(justo), CODIGO, "2026-10-21"), justo);
});

prueba("la hora con huso de Colombia se lee igual que en UTC", () => {
  const r = reporte("2026-10-20T00:00:00-05:00");
  assert.equal(M.instanteDe(r), Date.UTC(2026, 9, 20, 5, 0, 0));
  assert.equal(M.reporteDelContrato(indexar(r), CODIGO, "2026-10-21"), r);
});

prueba("la hora sin huso (SQLite) es UTC, no la hora local del navegador", () => {
  assert.equal(new Date(2026, 9, 20).getTimezoneOffset(), 300, "el proceso no quedó en hora de Colombia");
  assert.equal(M.instanteDe(reporte("2026-10-20T05:00:00")), Date.UTC(2026, 9, 20, 5, 0, 0));
  assert.equal(M.instanteDe(reporte("2026-10-20T04:59:59.123456")), Date.UTC(2026, 9, 20, 4, 59, 59, 123));
  assert.equal(M.reporteDelContrato(indexar(reporte("2026-10-20T04:59:59")), CODIGO, "2026-10-21"), undefined);
});

prueba("la víspera cruza meses, años y el 29 de febrero", () => {
  assert.equal(M.cuentaDesde("2026-11-01"), Date.UTC(2026, 9, 31, 5));
  assert.equal(M.cuentaDesde("2027-01-01"), Date.UTC(2026, 11, 31, 5));
  assert.equal(M.cuentaDesde("2028-03-01"), Date.UTC(2028, 1, 29, 5));
  assert.equal(M.cuentaDesde("2027-03-01"), Date.UTC(2027, 1, 28, 5));
});

console.log("Lo que no cambia");

prueba("entre varios reportes del contrato, vale el último", () => {
  const primero = reporte("2026-10-21T14:00:00+00:00", { estado: "no_montado" });
  const despues = reporte("2026-10-22T14:00:00+00:00");
  assert.equal(M.reporteDelContrato(indexar(primero, despues), CODIGO, "2026-10-21"), despues);
});

prueba("sin fecha de contrato (espacio libre) vale el último, como antes", () => {
  const viejo = reporte("2026-05-01T14:00:00+00:00");
  const nuevo = reporte("2026-09-02T14:00:00+00:00");
  const porCodigo = indexar(viejo, nuevo);
  assert.equal(M.reporteDelContrato(porCodigo, CODIGO, ""), nuevo);
  assert.equal(M.reporteDelContrato(porCodigo, CODIGO, undefined), nuevo);
  assert.equal(M.cuentaDesde(""), null);
});

prueba("los códigos no se mezclan, y uno sin reportes no tiene ninguno", () => {
  const otro = { ...reporte("2026-10-22T14:00:00+00:00"), space_code: "NAVE-PUN-05" };
  const porCodigo = indexar(otro);
  assert.equal(M.reporteDelContrato(porCodigo, CODIGO, "2026-10-21"), undefined);
  assert.equal(M.reporteDelContrato({}, CODIGO, "2026-10-21"), undefined);
});

console.log("Las dos pantallas usan la regla, y el servidor dice lo mismo");

prueba("Montajes: un espacio sale de pendientes sólo con el «montado» de SU contrato", () => {
  const vista = fuente("src", "pages", "MountView.tsx");
  assert.match(vista, /if \(reporteDelContrato\(porCodigo, code, cara\.startDate\)\?\.estado === "montado"\) continue;/);
  assert.doesNotMatch(vista, /ultimo\[code\]\?\.estado === "montado"/);
});

prueba("Sede/Supervisar: el estado de montaje de cada cara es el de su contrato", () => {
  const vista = fuente("src", "pages", "DashboardView.tsx");
  assert.match(vista, /reporteDelContrato\(\s*reportesDeMontaje, fullSpaceCode\(entry\.fixture\.sede \|\| sede, entry\.code\), entry\.startDate,\s*\)/);
  assert.doesNotMatch(vista, /latestByCode/);
});

prueba("el enlace firmado usa la misma víspera (routers/montaje.py)", () => {
  const backend = readFileSync(join(raiz, "..", "backend", "app", "routers", "montaje.py"), "utf8");
  assert.match(backend, /def _se_confirma_desde\(lease: SpaceLease\) -> date:[\s\S]*?return lease\.start_date - timedelta\(days=1\)/);
  assert.match(backend, /inicio = datetime\.combine\(desde, time\.min, tzinfo=ZONA_DEL_NEGOCIO\)/);
  const fechas = readFileSync(join(raiz, "..", "backend", "app", "fechas.py"), "utf8");
  assert.match(fechas, /ZONA_DEL_NEGOCIO = timezone\(timedelta\(hours=-5\)/);
});

console.log(`\n${hechas} pruebas`);
