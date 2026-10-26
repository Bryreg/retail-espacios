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
import { writeFileSync, rmSync } from "node:fs";
import * as XLSX from "xlsx";

const aqui = dirname(fileURLToPath(import.meta.url));
// DENTRO del proyecto, no en /tmp: `exceljs` y `xlsx` quedan externos al
// bundle y node los busca subiendo desde la carpeta del archivo. Desde /tmp no
// hay `node_modules` arriba y la importación falla con ERR_MODULE_NOT_FOUND.
const salida = join(aqui, ".planilla-bundle.mjs");
const { outputFiles } = await build({
  entryPoints: [join(aqui, "..", "src", "utils", "planilla.ts")],
  bundle: true, format: "esm", write: false, platform: "node",
  // `exceljs` y `xlsx` quedan afuera del bundle: traen dependencias de node
  // —`crypto`, `stream`— que esbuild no inlinea. Node las resuelve solo
  // desde node_modules, igual que el navegador con su empaquetador.
  external: ["exceljs", "xlsx"],
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
const archivo = (buf, name = "planilla.xlsx") => ({ name, type: "", arrayBuffer: async () => buf });

const ENCABEZADOS = ["Espacio", "Sede", "Proveedor", "Valor mensual", "Desde", "Hasta"];

const csv = (filas) =>
  archivo(Buffer.from([ENCABEZADOS, ...filas].map((f) => f.join(",")).join("\n"), "utf8"), "planilla.csv");

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

console.log("\nplanilla · el valor es al mes y los acentos de un CSV no se rompen");

await pruebaAsync("UNA COLUMNA «VALOR TOTAL» NO SE LEE: LA PLANILLA VA CON EL VALOR POR MES", async () => {
  const conTotal = archivo(Buffer.from(
    "Espacio,Sede,Proveedor,Valor total,Desde,Hasta\nPUN-04,NAVE,ACME,1800000,01/03/2026,30/06/2026", "utf8"),
  "planilla.csv");
  await assert.rejects(() => P.leerPlanilla(conTotal), /valor por mes/);
  // «Valor mensual», «Renta», «Canon»: se leen, y son lo de cada mes.
  for (const col of ["Valor mensual", "Renta", "Canon", "Valor al mes", "Valor"]) {
    const { mapeo } = await P.leerPlanilla(archivo(Buffer.from(
      `Espacio,Proveedor,${col}\nPUN-04,ACME,650000`, "utf8"), "planilla.csv"));
    assert.equal(mapeo.valor, col);
  }
});

await pruebaAsync("UN CSV EN UTF-8 SIN BOM CONSERVA LOS ACENTOS (era «LÃ¡cteos»: un proveedor duplicado)", async () => {
  const utf8 = archivo(Buffer.from("Espacio,Proveedor,Valor\nPUN-04,Lácteos del Valle,650000", "utf8"), "x.csv");
  assert.equal((await P.leerPlanilla(utf8)).filas[0].proveedor, "Lácteos del Valle");
  // Y el CSV de Excel en español (Windows-1252, con punto y coma) también.
  const latin = archivo(Buffer.from("Espacio;Proveedor;Valor\nPUN-04;Lácteos del Valle;650000", "latin1"), "x.csv");
  assert.equal((await P.leerPlanilla(latin)).filas[0].proveedor, "Lácteos del Valle");
  assert.equal(P.textoDeCsv(Buffer.from("\uFEFFEspacio", "utf8")), "Espacio", "la BOM no queda pegada al título");
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

// ─── La plantilla que se descarga ────────────────────────────────────────────

/* Se prueba EL LIBRO REAL —el mismo que arma `descargarPlantilla`— leído con el
   mismo `leerPlanilla` que abre lo que manda la gente. Una aproximación armada
   a mano probaría otra cosa.

   Lo que puede romperse acá no se ve mirando el archivo: que el lector agarre
   la pestaña equivocada, que no encuentre los títulos, o que el ejemplo se suba
   solo porque nadie lo borró. */

/** La plantilla tal como sale, sin pasar por el navegador.
 *
 *  El archivo lo arma ExcelJS —SheetJS community no escribe estilos— y se lee
 *  con el mismo `leerPlanilla` de la aplicación, que sí usa SheetJS. Que el
 *  redondeo funcione es parte de lo que se prueba: un .xlsx con diseño tiene
 *  que seguir siendo un .xlsx que el lector entiende. */
const plantilla = async (sede = "NAVE") =>
  archivo(Buffer.from(await P.bufferDePlantilla(sede)));

console.log("\nplanilla · la plantilla que se descarga");

await pruebaAsync("LA HOJA DE DATOS ES LA PRIMERA", async () => {
  // `leerPlanilla` lee `SheetNames[0]`. Si las instrucciones quedaran primeras,
  // la carga fallaría entera con «no encontré la fila de encabezados».
  const libro = await P.libroDePlantilla("NAVE");
  const nombres = libro.worksheets.map((h) => h.name);
  assert.equal(nombres[0], "Contratos");
  assert.ok(nombres.includes("Cómo llenarla"), "falta la hoja de ayuda");
});

await pruebaAsync("los títulos se encuentran y las columnas se reconocen", async () => {
  const { filas, faltan, mapeo } = await P.leerPlanilla(await plantilla());
  assert.deepEqual(faltan, [], "no reconoció alguna columna obligatoria");
  assert.equal(mapeo.espacio, "Espacio");
  assert.equal(mapeo.valor, "Valor al mes", "la columna dejó de llamarse «Valor al mes»");
  assert.equal(filas.length, 2, "tiene que leer las dos filas de ejemplo y nada más");
});

await pruebaAsync("NINGÚN RENGLÓN DE ARRIBA SE CONFUNDE CON LOS TÍTULOS", async () => {
  // Si un renglón de orientación calzara dos campos, el lector lo tomaría por
  // la fila de títulos y todo lo de abajo quedaría en columnas equivocadas.
  const { filas } = await P.leerPlanilla(await plantilla());
  assert.equal(filas[0].espacio, "EJEMPLO-01");
  assert.equal(filas[0].proveedor, "Nutresa");
  assert.equal(filas[0].valor, 650000);
});

await pruebaAsync("LA PLANTILLA DICE «POR MES» Y «ENTEROS» (decisión del dueño, 2026-10-26)", async () => {
  const filas = P.filasDeContratosDePlantilla("NAVE");
  const arriba = filas.slice(0, filas.findIndex((f) => f[0] === "Espacio")).flat().join(" ");
  assert.match(arriba, /POR MES/);
  assert.match(arriba, /ENTEROS/);
  assert.ok(filas.some((f) => f.includes("Valor al mes")));
});

await pruebaAsync("LA FECHA DEL EJEMPLO SE ESCRIBE COMO DICE LA INSTRUCCIÓN", async () => {
  // El bicho que reportó el dueño: el renglón prometía «día primero, con /» y
  // el ejemplo mostraba `2026-09-15`. Justo en el campo donde la ambigüedad no
  // avisa — leer 3/4 al revés crea el contrato tres meses corrido en silencio.
  const filas = P.filasDeContratosDePlantilla("NAVE");
  const iTitulos = filas.findIndex((f) => f[0] === "Espacio");
  const ejemplo = filas[iTitulos + 1];
  const desde = String(ejemplo[6]);
  assert.match(desde, /^\d{2}\/\d{2}\/\d{4}$/,
    `el ejemplo escribe la fecha como «${desde}» y la instrucción promete día primero con /`);
});

await pruebaAsync("y se lee como el mismo día que dice", async () => {
  // No alcanza con que PAREZCA día primero: tiene que LEERSE así.
  const filas = P.filasDeContratosDePlantilla("NAVE");
  const iTitulos = filas.findIndex((f) => f[0] === "Espacio");
  const [dd, mm, aaaa] = String(filas[iTitulos + 1][6]).split("/");
  const { filas: leidas } = await P.leerPlanilla(await plantilla());
  assert.equal(leidas[0].desde, `${aaaa}-${mm}-${dd}`);
});

await pruebaAsync("EL EJEMPLO NO SE PUEDE SUBIR POR ACCIDENTE", async () => {
  // Las filas sin error vienen MARCADAS en la pantalla de carga: un ejemplo con
  // un código real se subiría solo si alguien se olvida de borrarlo, y eso es
  // un contrato inventado en la base.
  const { filas } = await P.leerPlanilla(await plantilla());
  for (const f of filas) {
    assert.match(f.espacio, /^EJEMPLO-/,
      "el ejemplo volvió a usar un código real: se sube solo si nadie lo borra");
  }
});

await pruebaAsync("los títulos caben en la ventana que el lector mira", async () => {
  // `leerPlanilla` sólo recorre las primeras 15 filas buscando los títulos.
  const filas = P.filasDeContratosDePlantilla("NAVE");
  const iTitulos = filas.findIndex((f) => f[0] === "Espacio");
  assert.ok(iTitulos >= 0, "la hoja de datos perdió su fila de títulos");
  assert.ok(iTitulos < 15, `los títulos quedaron en la fila ${iTitulos + 1}, fuera de las 15`);
});

await pruebaAsync("cada renglón de orientación va en UNA sola celda", async () => {
  const filas = P.filasDeContratosDePlantilla("NAVE");
  const iTitulos = filas.findIndex((f) => f[0] === "Espacio");
  for (const f of filas.slice(0, iTitulos)) {
    assert.ok(f.length <= 1,
      "un renglón de arriba ocupa más de una celda: puede calzar dos campos y " +
      "hacerse pasar por la fila de títulos");
  }
});

// ─── La pantalla (decisión del dueño, 2026-10-26) ────────────────────────────

console.log("\nplanilla · la pantalla dice al mes, el total de verdad y lo que salió");

await pruebaAsync("CADA FILA DICE «AL MES × MESES = TOTAL» Y EL PIE SUMA TOTALES COMO TOTAL", async () => {
  const { readFileSync } = await import("node:fs");
  const c = readFileSync(join(aqui, "../src/components/CargaMasiva/CargaMasiva.tsx"), "utf8");
  assert.ok(c.includes("`${money(r.valor_mes)} al mes`"), "la fila perdió «$ X al mes»");
  assert.ok(/× \{textoDeMeses\(r\.meses\)\} = <b[^>]*>\{money\(r\.valor\)\}/.test(c), "la fila perdió la cuenta × meses = total");
  assert.ok(/\{money\(total\)\}<\/b> en total/.test(c), "el pie volvió a llamar «al mes» a la suma de totales");
  assert.ok(!/\{money\(total\)\}<\/b> al mes/.test(c), "el pie suma totales y los llama «al mes»");
});

await pruebaAsync("AL GUARDAR DICE LO QUE DE VERDAD SALIÓ, NO UNA FRASE FIJA", async () => {
  const { readFileSync } = await import("node:fs");
  const c = readFileSync(join(aqui, "../src/components/CargaMasiva/CargaMasiva.tsx"), "utf8");
  assert.ok(c.includes("setAvisos(res.avisos ?? null)"), "la pantalla final no lee los avisos del servidor");
  assert.ok(c.includes("El correo no está configurado:"), "falta el caso sin correo");
  assert.ok(c.includes("espera su planometría"), "falta que el montaje espera la planometría");
  assert.ok(!c.includes("uno al\n              mercaderista con la lista"), "volvió la frase fija de los avisos agrupados");
});

// El bundle es un intermedio, no un artefacto: se borra al terminar.
rmSync(salida, { force: true });
