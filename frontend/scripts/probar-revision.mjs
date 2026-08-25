/**
 * Pruebas de src/utils/revision.ts — qué está mal en el plano.
 *   npm run probar:revision
 */
import assert from "node:assert/strict";
import { build } from "esbuild";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

const aqui = dirname(fileURLToPath(import.meta.url));
const salida = join(mkdtempSync(join(tmpdir(), "rev-")), "rev.mjs");
const { outputFiles } = await build({
  entryPoints: [join(aqui, "..", "src", "utils", "revision.ts")],
  bundle: true, format: "esm", write: false, platform: "neutral",
});
writeFileSync(salida, outputFiles[0].text);
const R = await import(pathToFileURL(salida).href);

let hechas = 0;
const prueba = (n, fn) => {
  try { fn(); hechas++; console.log("  ok   " + n); }
  catch (e) { console.error("  FALLA " + n + "\n         " + e.message); process.exitCode = 1; }
};
const V = Math.PI / 2;
/** Una Góndola Doble de verdad: 0,90 × 0,90. Una corrida son módulos en fila. */
const gon = (id, cx, cz, rotY = V) => ({ id, code: id.toUpperCase(), type: "gondola", cx, cz, w: 0.9, d: 0.9, h: 1.8, rotY });
/** Corrida vertical de n módulos en x, puestos uno detrás de otro. */
const corrida = (pre, x, n) => Array.from({ length: n }, (_, i) => gon(`${pre}-${i+1}`, x, i * 0.95));
const clases = (h) => h.map(x => x.clase);

console.log("\nrevisión · un plano sano no molesta");

prueba("una corrida sola no reporta nada", () => {
  assert.deepEqual(R.revisarPlano(corrida("gon", 0, 5)), []);
});

prueba("un plano vacío no reporta nada", () => {
  assert.deepEqual(R.revisarPlano([]), []);
});

prueba("pasillos de supermercado de verdad pasan", () => {
  // 1,55 m entre corridas es lo que mide NAVE entre sus pasillos 1 y 2.
  // 0,45 + 1,55 + 0,45 = 2,45 entre centros.
  const plano = [...corrida("a", 0, 5), ...corrida("b", 2.45, 5)];
  assert.ok(!clases(R.revisarPlano(plano)).includes("pasillo-angosto"));
});

console.log("\nrevisión · lo que sí importa");

prueba("dos muebles con el mismo código es un error", () => {
  const plano = corrida("gon", 0, 3);
  plano[1].code = plano[0].code;
  const h = R.revisarPlano(plano);
  const d = h.find(x => x.clase === "codigo-repetido");
  assert.ok(d, "no lo detectó");
  assert.equal(d.severidad, "error");
  assert.equal(d.ids.length, 2);
});

prueba("un mueble encima de otro se reporta con su área", () => {
  const plano = [gon("a", 0, 0), gon("b", 0.5, 0)];
  const e = R.revisarPlano(plano).find(x => x.clase === "encimado");
  assert.ok(e, "no lo detectó");
  assert.equal(e.severidad, "error");
  assert.deepEqual(e.ids.sort(), ["a", "b"]);
});

prueba("un roce de milímetros es aviso, no error", () => {
  // En NAVE hay dos pares que se tocan 0,01 y 0,03 m². Tratarlos como error
  // haría que el plano nunca esté limpio y que el panel deje de leerse.
  // Solape de 0,03 × 0,9 = 0,027 m², del orden de los dos roces reales de NAVE
  // (0,01 y 0,03 m²). Por debajo de 2 cm lineales no se reporta nada: eso ya es
  // ruido de coma flotante, no un mueble encima de otro.
  const plano = [gon("a", 0, 0), gon("b", 0.87, 0)];
  const e = R.revisarPlano(plano).find(x => x.clase === "encimado");
  assert.ok(e, "no lo detectó");
  assert.equal(e.severidad, "aviso");
});

prueba("un pasillo por donde no pasa una persona es un error", () => {
  const plano = [...corrida("a", 0, 5), ...corrida("b", 1.2, 5)];  // hueco 0,30 m
  const p = R.revisarPlano(plano).find(x => x.clase === "pasillo-angosto");
  assert.ok(p, "no lo detectó");
  assert.equal(p.severidad, "error");
  assert.ok(/no pasa una persona/.test(p.texto), p.texto);
});

prueba("un pasillo donde pasa una persona pero no un carrito es aviso", () => {
  const plano = [...corrida("a", 0, 5), ...corrida("b", 1.6, 5)];  // hueco 0,70 m
  const p = R.revisarPlano(plano).find(x => x.clase === "pasillo-angosto");
  assert.ok(p, "no lo detectó");
  assert.equal(p.severidad, "aviso");
  assert.ok(/carrito/.test(p.texto), p.texto);
});

prueba("el prefijo que no corresponde al tipo se avisa", () => {
  const plano = corrida("gon", 0, 3);
  plano[0].code = "PUN-99";
  const p = R.revisarPlano(plano).find(x => x.clase === "prefijo");
  assert.ok(p, "no lo detectó");
  assert.equal(p.severidad, "aviso");
});

prueba("los errores van antes que los avisos", () => {
  const plano = corrida("gon", 0, 4);
  plano[0].code = "PUN-99";          // aviso
  plano[2].code = plano[1].code;     // error
  const h = R.revisarPlano(plano);
  const primerAviso = h.findIndex(x => x.severidad === "aviso");
  const ultimoError = h.map(x => x.severidad).lastIndexOf("error");
  assert.ok(ultimoError < primerAviso || primerAviso === -1, "quedaron mezclados");
});

console.log("\nrevisión · juntos sí, encima no");

prueba("dos góndolas al ras NO son un solape", () => {
  // Así se arma una corrida: una pegada a la otra. Si esto rebotara, no se
  // podría dibujar un supermercado.
  const plano = [gon("a", 0, 0), gon("b", 0.9, 0)];
  assert.deepEqual(R.encimados(plano), [], "las marcó como encimadas");
  assert.ok(!clases(R.revisarPlano(plano)).includes("encimado"));
});

prueba("al ras funciona también giradas", () => {
  // cos(90°) da 6·10⁻¹⁷ en vez de 0: con tolerancia de cero, el ruido de la
  // rotación solo bastaba para rechazar dos muebles pegados.
  const plano = [gon("a", 0, 0, V), gon("b", 0, 0.9, V)];
  assert.deepEqual(R.encimados(plano), []);
});

prueba("una fila entera al ras queda limpia", () => {
  const fila = Array.from({ length: 8 }, (_, i) => gon(`g${i}`, i * 0.9, 0));
  assert.deepEqual(R.encimados(fila), []);
});

prueba("medio centímetro de solape sigue siendo contacto", () => {
  // Redondeo de la grilla, no una decisión de nadie.
  assert.deepEqual(R.encimados([gon("a", 0, 0), gon("b", 0.895, 0)]), []);
});

prueba("cinco centímetros ya es un mueble sobre otro", () => {
  const e = R.encimados([gon("a", 0, 0), gon("b", 0.85, 0)]);
  assert.equal(e.length, 1, "no lo detectó");
});

prueba("el umbral es menor que la grilla con la que se dibuja", () => {
  // La grilla del editor es de 5 cm: la tolerancia tiene que quedar por debajo
  // o dos muebles a un paso de grilla se leerían como pegados.
  const solapeGrilla = R.encimados([gon("a", 0, 0), gon("b", 0.85, 0)]);
  assert.equal(solapeGrilla.length, 1);
});

console.log("\nrevisión · el piso que no se puede caminar");

prueba("un rincón encerrado se reporta", () => {
  // Cuatro góndolas formando una caja cerrada alrededor de un hueco.
  const caja = [
    { id:"n", code:"N", type:"gondola", cx:0, cz:-2, w:4, d:0.9, h:1.8, rotY:0 },
    { id:"s", code:"S", type:"gondola", cx:0, cz: 2, w:4, d:0.9, h:1.8, rotY:0 },
    { id:"e", code:"E", type:"gondola", cx: 2, cz:0, w:4, d:0.9, h:1.8, rotY:V },
    { id:"o", code:"O", type:"gondola", cx:-2, cz:0, w:4, d:0.9, h:1.8, rotY:V },
  ];
  const z = R.zonasAisladas(caja);
  assert.ok(z.celdas > 0, "no vio el hueco encerrado");
  assert.ok(z.punto, "no dijo dónde está");
});

prueba("una tienda abierta no tiene zonas aisladas", () => {
  const z = R.zonasAisladas([...corrida("a", 0, 5), ...corrida("b", 3, 5)]);
  assert.equal(z.celdas, 0);
});

prueba("lo que mide menos de 25 cm no encierra nada", () => {
  // La Zona Libre es una marca en el piso: se pisa.
  const marcas = [
    { id:"m1", code:"MET-01", type:"metro", cx:0, cz:0, w:4, d:4, h:0.05, rotY:0 },
    ...corrida("a", 6, 3),
  ];
  assert.equal(R.zonasAisladas(marcas).celdas, 0);
});

console.log("\n" + hechas + " pruebas" + (process.exitCode ? " · CON FALLAS" : " · todo en orden") + "\n");
