/**
 * Pruebas de src/utils/planilla.ts — leer la planilla que llega de una reunión.
 *   npm run probar:planilla
 *
 * El foco es LA FECHA, que estuvo mal en producción: un CSV que decía
 * `01/03/2026` —1 de marzo— entraba como 3 de enero, y sólo cuando el día era 12
 * o menos, así que la mitad de las filas se leía bien y la otra mitad creaba el
 * contrato en el mes equivocado sin que nada avisara.
 *
 * Se prueba con las DOS formas de archivo, armadas de verdad con la misma
 * librería que las abre: un CSV de texto y un .xlsx binario.
 */
import assert from "node:assert/strict";
import { build } from "esbuild";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import * as XLSX from "xlsx";

const aqui = dirname(fileURLToPath(import.meta.url));
const salida = join(mkdtempSync(join(tmpdir(), "planilla-")), "planilla.mjs");
const { outputFiles } = await build({
  entryPoints: [join(aqui, "..", "src", "utils", "planilla.ts")],
  bundle: true, format: "esm", write: false, platform: "node",
});
writeFileSync(salida, outputFiles[0].text);
const P = await import(pathToFileURL(salida).href);

let hechas = 0;
const prueba = (n, fn) => {
  try { fn(); hechas++; console.log("  ok   " + n); }
  catch (e) { console.error("  FALLA " + n + "\n         " + e.message); process.exitCode = 1; }
};
const pruebaAsync = async (n, fn) => {
  try { await fn(); hechas++; console.log("  ok   " + n); }
  catch (e) { console.error("  FALLA " + n + "\n         " + e.message); process.exitCode = 1; }
};

/** Un `File` de mentira: `leerPlanilla` sólo le pide `arrayBuffer()`. */
const archivo = (buf) => ({ arrayBuffer: async () => buf });

const ENCABEZADOS = ["Espacio", "Sede", "Proveedor", "Valor mensual", "Desde", "Hasta"];

const csv = (filas) =>
  archivo(Buffer.from([ENCABEZADOS, ...filas].map((f) => f.join(",")).join("\n"), "utf8"));

/** Un .xlsx de verdad, con las celdas que se le pasen —incluidas las `Date`,
 *  que es lo único que un CSV no puede tener. */
const xlsx = (filas) => {
  const hoja = XLSX.utils.aoa_to_sheet([ENCABEZADOS, ...filas], { cellDates: true });
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, "Contratos");
  return archivo(XLSX.write(libro, { type: "buffer", bookType: "xlsx" }));
};

console.log("\nplanilla · las fechas de un CSV se leen DÍA PRIMERO");

await pruebaAsync("EL 1 DE MARZO ES EL 1 DE MARZO, NO EL 3 DE ENERO", async () => {
  // El bicho medido dos veces en producción. `01/03/2026` es 1 de marzo en la
  // convención local; la librería lo interpretaba mes primero y la pantalla
  // mostraba «3 ene».
  const { filas } = await P.leerPlanilla(csv([
    ["PUN-04", "NAVE", "ACME", "1.800.000", "01/03/2026", "30/06/2026"],
  ]));
  assert.equal(filas.length, 1);
  assert.equal(filas[0].desde, "2026-03-01");
  assert.equal(filas[0].hasta, "2026-06-30");
});

await pruebaAsync("las dos puntas del contrato se leen con la MISMA regla", async () => {
  // Lo peor del bicho no era leer mal: era leer mal a veces. `05/04/2026` se
  // parecía a una fecha inglesa y se daba vuelta; `30/06/2026` no (no hay mes
  // 30) y se leía bien. Un contrato con el inicio en un idioma y el fin en otro.
  const { filas } = await P.leerPlanilla(csv([
    ["PUN-04", "NAVE", "ACME", "100", "05/04/2026", "30/06/2026"],
  ]));
  assert.equal(filas[0].desde, "2026-04-05");
  assert.equal(filas[0].hasta, "2026-06-30");
});

await pruebaAsync("día 13 o más, que nunca estuvo roto, sigue igual", async () => {
  const { filas } = await P.leerPlanilla(csv([
    ["PUN-04", "NAVE", "ACME", "100", "13/03/2026", "28/02/2027"],
  ]));
  assert.equal(filas[0].desde, "2026-03-13");
  assert.equal(filas[0].hasta, "2027-02-28");
});

await pruebaAsync("el CSV con fecha ISO se lee como ISO", async () => {
  const { filas } = await P.leerPlanilla(csv([
    ["PUN-04", "NAVE", "ACME", "100", "2026-03-01", "2026-06-30"],
  ]));
  assert.equal(filas[0].desde, "2026-03-01");
  assert.equal(filas[0].hasta, "2026-06-30");
});

await pruebaAsync("el resto del CSV no se rompió: sede, valor y proveedor", async () => {
  // `raw` deja las celdas como texto, así que los montos entran por `leerMonto`,
  // que es justamente el que sabe leer «1.800.000» a la colombiana.
  const { filas, faltan } = await P.leerPlanilla(csv([
    ["PUN-04", "CIUDAD JARDIN", "NUTRESA", "$ 1.800.000", "01/03/2026", "30/06/2026"],
    ["PUN-05", "CIUDAD JARDIN", "ALPINA", "2100000", "01/03/2026", "30/06/2026"],
  ]));
  assert.deepEqual(faltan, []);
  assert.equal(filas.length, 2);
  assert.equal(filas[0].espacio, "PUN-04");
  assert.equal(filas[0].sede, "CIUDAD JARDIN");
  assert.equal(filas[0].proveedor, "NUTRESA");
  assert.equal(filas[0].valor, 1800000);
  assert.equal(filas[1].valor, 2100000);
  assert.equal(filas[0].fila, 2);      // la 2 de Excel, con encabezado en la 1
});

console.log("\nplanilla · el camino de Excel no cambió");

await pruebaAsync("UNA CELDA CON FORMATO DE FECHA SE TOMA TAL CUAL", async () => {
  // Es lo único que un .xlsx tiene y un CSV no: acá el día y el mes ya los
  // decidió Excel con el formato guardado en el archivo, y no hay nada que
  // adivinar. Ésta es la parte que no se podía romper arreglando el CSV.
  const { filas } = await P.leerPlanilla(xlsx([
    ["PUN-04", "NAVE", "ACME", 1800000, new Date(2026, 2, 1), new Date(2026, 5, 30)],
  ]));
  assert.equal(filas[0].desde, "2026-03-01");
  assert.equal(filas[0].hasta, "2026-06-30");
  assert.equal(filas[0].valor, 1800000);
});

await pruebaAsync("una fecha escrita como TEXTO en un .xlsx también es día primero", async () => {
  const { filas } = await P.leerPlanilla(xlsx([
    ["PUN-04", "NAVE", "ACME", 100, "01/03/2026", "30/06/2026"],
  ]));
  assert.equal(filas[0].desde, "2026-03-01");
  assert.equal(filas[0].hasta, "2026-06-30");
});

await pruebaAsync("el serial de Excel suelto se sigue entendiendo", async () => {
  // Una planilla exportada de otro sistema puede traer el número pelado.
  const serial = XLSX.SSF.parse_date_code;
  assert.ok(serial, "la librería trae el parser de seriales");
  const { filas } = await P.leerPlanilla(csv([
    ["PUN-04", "NAVE", "ACME", "100", "46082", "46203"],
  ]));
  assert.equal(filas[0].desde, "2026-03-01");
  assert.equal(filas[0].hasta, "2026-06-30");
});

console.log("\nplanilla · lo que ya andaba");

prueba("el monto se lee como se escribe en Colombia", () => {
  assert.equal(P.leerMonto("$ 1.800.000"), 1800000);
  assert.equal(P.leerMonto("1,800,000"), 1800000);
  assert.equal(P.leerMonto("1800000"), 1800000);
  assert.equal(P.leerMonto(2100000), 2100000);
  assert.equal(P.leerMonto(""), undefined);
});

prueba("una fecha que no se entiende no se inventa", () => {
  assert.equal(P.leerFecha(""), undefined);
  assert.equal(P.leerFecha(null), undefined);
  assert.equal(P.leerFecha("cuando arranque la temporada"), undefined);
  assert.equal(P.leerFecha("32/01/2026"), undefined);   // no hay día 32
  assert.equal(P.leerFecha("01/13/2026"), undefined);   // ni mes 13: no se da vuelta
});

prueba("una `Date` se pasa a ISO en hora LOCAL", () => {
  // `toISOString()` pasa a UTC y en Colombia (UTC−5) una fecha a medianoche
  // retrocede un día: el contrato empezaría el 28 de febrero.
  assert.equal(P.leerFecha(new Date(2026, 2, 1)), "2026-03-01");
});

await pruebaAsync("un archivo sin encabezados reconocibles lo dice", async () => {
  const suelto = archivo(Buffer.from("hola,mundo\n1,2\n", "utf8"));
  await assert.rejects(() => P.leerPlanilla(suelto), /encabezados/);
});

console.log("\n" + hechas + " pruebas" + (process.exitCode ? " · CON FALLAS" : " · todo en orden") + "\n");
