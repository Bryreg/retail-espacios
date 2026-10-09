/**
 * Pruebas de src/utils/propuesta.ts — la lámina para el proveedor.
 * Sólo la parte que no toca el navegador: el pie, las medidas y el nombre.
 *
 *   npm run probar:propuesta
 */
import assert from "node:assert/strict";
import { build } from "esbuild";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

const aqui = dirname(fileURLToPath(import.meta.url));
const salida = join(mkdtempSync(join(tmpdir(), "propuesta-")), "propuesta.mjs");
const { outputFiles } = await build({
  entryPoints: [join(aqui, "..", "src", "utils", "propuesta.ts")],
  bundle: true, format: "esm", write: false, platform: "neutral",
});
writeFileSync(salida, outputFiles[0].text);
const { lineasDePie, medidasDeLamina, nombreDeArchivo, fechaCorta, montoCorto, MARGEN, HUECO } =
  await import(pathToFileURL(salida).href);

let hechas = 0;
const prueba = (n, fn) => {
  try { fn(); hechas++; console.log("  ok   " + n); }
  catch (e) { console.error("  FALLA " + n + "\n         " + e.message); process.exitCode = 1; }
};

const base = {
  sede: "NAVE", espacio: "NAVE-PUN-04", mueble: "Punta Góndola",
  proveedor: "Alpina", categoria: "Lácteos",
  desde: "2026-09-13", hasta: "2026-10-12", valorMensual: 1800000,
};

console.log("\npropuesta · el pie");

prueba("dice de qué espacio y de qué contrato se habla", () => {
  const f = lineasDePie(base);
  const et = f.map(x => x.etiqueta);
  assert.ok(et.includes("Proveedor") && et.includes("Categoría") && et.includes("Período"));
});

prueba("el producto que se está probando sale como su propio renglón", () => {
  // La categoría del contrato y el producto que se muestra son cosas
  // distintas, y en una propuesta suelen ser de proveedores distintos.
  const f = lineasDePie({ ...base, producto: "Yogurt Griego 150g" });
  const producto = f.find(x => x.etiqueta === "Producto");
  assert.equal(producto?.valor, "Yogurt Griego 150g");
  // Y va ANTES de la categoría: es lo que el proveedor está mirando.
  assert.ok(f.indexOf(producto) < f.findIndex(x => x.etiqueta === "Categoría"));
});

prueba("la exhibición acomodada sale como renglón sólo cuando se pasa", () => {
  // «Hoy» con las rejillas de fábrica y «Con …» con las acomodadas para la
  // 2 L: la lámina no lo esconde, porque es lo que hará el mercaderista.
  const con = lineasDePie({ ...base, producto: "Manzana Postobón 2 L", exhibicion: "rejillas acomodadas para este producto" });
  const ex = con.find(x => x.etiqueta === "Exhibición");
  assert.equal(ex?.valor, "rejillas acomodadas para este producto");
  for (const sin of [lineasDePie(base), lineasDePie({ ...base, exhibicion: "" }), lineasDePie({ ...base, exhibicion: "  " })]) {
    assert.ok(!sin.some(x => x.etiqueta === "Exhibición"), "el renglón sale sin que nadie lo pase");
  }
  assert.equal(con.length, lineasDePie({ ...base, producto: "Manzana Postobón 2 L" }).length + 1);
});

prueba("el pie del surtido nombra los productos, sin período ni valor", () => {
  // Una propuesta con varios productos del mismo proveedor: el renglón
  // «Producto» los nombra a todos; de lo que se propone no hay nada acordado.
  const f = lineasDePie({
    ...base, proveedor: "Kellogg's", producto: "Müsli arándanos 410 g · Choco Krispis · Zucaritas",
    desde: "", hasta: "", valorMensual: null,
  });
  assert.equal(f.find(x => x.etiqueta === "Producto")?.valor, "Müsli arándanos 410 g · Choco Krispis · Zucaritas");
  assert.ok(!f.some(x => x.etiqueta === "Período" || x.etiqueta === "Valor mensual"), "el pie del surtido inventa período o valor");
});

prueba("sin producto el pie queda como estaba", () => {
  const sin = lineasDePie(base);
  const vacio = lineasDePie({ ...base, producto: "   " });
  assert.ok(!sin.some(x => x.etiqueta === "Producto"));
  assert.ok(!vacio.some(x => x.etiqueta === "Producto"));
  assert.equal(vacio.length, sin.length);
});

prueba("una propuesta sin período ni valor no los inventa", () => {
  // Es el caso de probarle un producto a un espacio con otro contrato encima:
  // de lo propuesto no hay fechas acordadas, y poner las del contrato de al
  // lado sería inventarlas.
  const f = lineasDePie({
    ...base, proveedor: "Alpina", producto: "Yogurt Griego 150g",
    categoria: "", desde: "", hasta: "", valorMensual: null,
  });
  const et = f.map(x => x.etiqueta);
  assert.deepEqual(et, ["Proveedor", "Producto", "Mueble"]);
});

prueba("la plata sólo aparece si quien llama la pasa", () => {
  // La redacción por rol es de la pantalla y del servidor. Este módulo no
  // decide: si le pasan null, no dibuja plata en ningún lado.
  const conPlata = lineasDePie(base);
  const sinPlata = lineasDePie({ ...base, valorMensual: null });
  assert.ok(conPlata.some(f => f.etiqueta === "Valor mensual"));
  assert.ok(!sinPlata.some(f => f.etiqueta === "Valor mensual"));
  assert.ok(!JSON.stringify(sinPlata).includes("1800000"));
  assert.ok(!JSON.stringify(sinPlata).includes("1.800.000"));
});

prueba("un valor en cero no se dibuja", () => {
  assert.ok(!lineasDePie({ ...base, valorMensual: 0 }).some(f => f.etiqueta === "Valor mensual"));
});

prueba("los campos vacíos no ocupan renglón", () => {
  const f = lineasDePie({ ...base, categoria: "  ", proveedor: "" });
  assert.ok(!f.some(x => x.etiqueta === "Categoría"));
  assert.ok(!f.some(x => x.etiqueta === "Proveedor"));
});

prueba("un período a medias no se muestra", () => {
  assert.ok(!lineasDePie({ ...base, hasta: "" }).some(f => f.etiqueta === "Período"));
});

console.log("\npropuesta · formato");

prueba("la fecha se lee como la lee una persona", () => {
  assert.equal(fechaCorta("2026-09-13"), "13 sep 2026");
  assert.equal(fechaCorta("2026-01-01"), "1 ene 2026");
});

prueba("una fecha rara se deja como está en vez de inventar", () => {
  assert.equal(fechaCorta("mañana"), "mañana");
  assert.equal(fechaCorta("2026-13-01"), "2026-13-01");
  assert.equal(fechaCorta(""), "");
});

prueba("el monto va con separador de miles", () => {
  assert.equal(montoCorto(1800000).replace(/ /g, " "), "$1.800.000");
});

console.log("\npropuesta · la lámina");

prueba("dos tomas caben lado a lado dentro del ancho máximo", () => {
  const m = medidasDeLamina(2, 1200, 800, 5, 1600);
  assert.equal(m.imgX.length, 2);
  assert.ok(m.ancho <= 1600, `la lámina salió de ${m.ancho} px`);
  assert.ok(m.imgX[1] >= m.imgX[0] + m.imgAncho + HUECO - 1, "las tomas se solapan");
  assert.ok(m.imgX[0] === MARGEN);
});

prueba("una sola toma no se achica al pedo", () => {
  const m = medidasDeLamina(1, 1200, 800, 5, 1600);
  assert.equal(m.imgAncho, 1200, "con lugar de sobra debía quedar a tamaño real");
});

prueba("la proporción de la imagen se respeta", () => {
  const m = medidasDeLamina(2, 1440, 900, 4);
  assert.ok(Math.abs(m.imgAlto / m.imgAncho - 900 / 1440) < 0.01);
});

prueba("el pie no se come la imagen", () => {
  const m = medidasDeLamina(2, 1200, 800, 6);
  assert.ok(m.pieY > m.imgY + m.imgAlto, "el pie arranca encima de la imagen");
  assert.ok(m.alto > m.pieY, "no queda alto para el pie");
});

prueba("más renglones de pie hacen la lámina más alta", () => {
  const corta = medidasDeLamina(2, 1200, 800, 2);
  const larga = medidasDeLamina(2, 1200, 800, 8);
  assert.ok(larga.alto > corta.alto);
});

console.log("\npropuesta · el nombre del archivo");

prueba("viaja por correo sin espacios ni acentos", () => {
  const n = nombreDeArchivo({ ...base, proveedor: "Café Águila S.A." }, true);
  assert.ok(/^[A-Za-z0-9._-]+$/.test(n), `salió "${n}"`);
  assert.ok(n.includes("NAVE-PUN-04"));
  assert.ok(n.endsWith("antes-despues.png"));
});

prueba("sin proveedor igual queda un nombre usable", () => {
  const n = nombreDeArchivo({ ...base, proveedor: "" }, false);
  assert.equal(n, "NAVE-PUN-04.png");
});

console.log("\n" + hechas + " pruebas" + (process.exitCode ? " · CON FALLAS" : " · todo en orden") + "\n");
