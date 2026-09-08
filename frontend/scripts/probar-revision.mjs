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

console.log("\nrevisión · los nombres, que es lo que se lee");

/** Once impulsadores en fila, seis renumerados a mano: el plano de CIUDAD
 *  JARDIN del diagnóstico de la fase 12. Separados 1,5 m para que no haya
 *  encimados ni pasillos angostos y quede a la vista lo de los nombres. */
const impulsadores = (renombres = {}) =>
  Array.from({ length: 11 }, (_, i) => {
    const code = `IMP-${String(i + 7).padStart(2, "0")}`;
    return {
      id: "i" + code.slice(4), code, type: "impulsador",
      cx: i * 1.5, cz: 0, w: 0.6, d: 0.4, h: 1.4, rotY: 0,
      nomenclatura: renombres[code],
    };
  });

const RENUMERADO = {
  "IMP-09": "IMP-17", "IMP-11": "IMP-16", "IMP-12": "IMP-08",
  "IMP-13": "IMP-10", "IMP-14": "IMP-12", "IMP-15": "IMP-14",
};

prueba("EL PLANO CON SEIS RENOMBRES YA NO SE DECLARA LIMPIO", () => {
  // Antes: `revisarPlano` devolvía [] y el panel decía «El plano está limpio».
  // Cuatro nombres dibujados dos veces y ningún código repetido.
  const plano = impulsadores(RENUMERADO);
  assert.deepEqual(clases(R.revisarPlano(plano)).filter(c => c === "codigo-repetido"), []);
  const h = R.revisarPlano(plano);
  assert.ok(h.length > 0, "siguió declarando limpio un plano con cuatro nombres repetidos");
  assert.equal(h.filter(x => x.clase === "nombre-repetido").length, 4);
  assert.equal(h.filter(x => x.clase === "nombre-pisa-codigo").length, 6);
});

prueba("dos muebles dibujados con el mismo nombre es un error, y los nombra", () => {
  const plano = impulsadores({ "IMP-12": "IMP-08" });
  const h = R.revisarPlano(plano).find(x => x.clase === "nombre-repetido");
  assert.ok(h, "no lo detectó");
  assert.equal(h.severidad, "error");
  assert.deepEqual(h.ids.sort(), ["i08", "i12"]);
  assert.ok(h.texto.includes("IMP-08"), h.texto);
});

prueba("un nombre que es el código de otro se reporta con los dos muebles", () => {
  // Acá NO hay nombres repetidos: IMP-14 no lo dibuja nadie más. Y sin embargo
  // cargar una planilla que diga «IMP-14» firma sobre el otro mueble.
  const plano = impulsadores({ "IMP-15": "IMP-14", "IMP-14": "IMP-12", "IMP-12": "Punta 3" });
  const h = R.revisarPlano(plano).find(x => x.clase === "nombre-pisa-codigo" && x.ids[0] === "i15");
  assert.ok(h, "no lo detectó");
  assert.equal(h.severidad, "error");
  assert.deepEqual(h.ids, ["i15", "i14"]);
  assert.ok(h.texto.includes("IMP-14"), h.texto);
});

prueba("renombrar sin pisar a nadie no molesta", () => {
  // Renombrar está permitido y es lo normal: «la punta del pasillo 3».
  const plano = impulsadores({ "IMP-08": "Punta del pasillo 3", "IMP-09": "Cabecera lácteos" });
  const c = clases(R.revisarPlano(plano));
  assert.ok(!c.includes("nombre-repetido"), c.join(","));
  assert.ok(!c.includes("nombre-pisa-codigo"), c.join(","));
});

prueba("un plano sin nomenclaturas sigue limpio", () => {
  assert.deepEqual(R.revisarPlano(impulsadores()), []);
});

console.log("\nrevisión · los contratos que ya están cargados");

const contrato = (extra) => ({
  id: "i12", code: "IMP-12", sede: "CIUDAD JARDIN", nomenclatura: "IMP-08",
  proveedor: "CASA LUKER", marca: "ASEO",
  desde: "2026-01-01", hasta: "2026-09-15", valor: 200000, ...extra,
});
const PLANO_CJ = impulsadores(RENUMERADO);

prueba("lista el contrato cuyo mueble se dibuja con otro nombre", () => {
  const r = R.contratosConNombreAjeno([contrato()], PLANO_CJ, "2026-09-08");
  assert.equal(r.length, 1);
  assert.equal(r[0].codigo, "CIUDAD JARDIN-IMP-12");   // lo que dice el contrato
  assert.equal(r[0].nombre, "IMP-08");                  // lo que vio quien lo negoció
  assert.equal(r[0].proveedor, "CASA LUKER");
  assert.equal(r[0].desde, "2026-01-01");
  assert.equal(r[0].hasta, "2026-09-15");
  assert.equal(r[0].pisaCodigoDe, "IMP-08");            // y hay OTRO mueble que se llama así
});

prueba("el que se dibuja con su propio código no está en la lista", () => {
  const solo = R.contratosConNombreAjeno(
    [contrato({ id: "i07", code: "IMP-07", nomenclatura: undefined })], PLANO_CJ, "2026-09-08");
  assert.deepEqual(solo, []);
});

prueba("un contrato vencido no se lista", () => {
  // La reconciliación es para poder corregir; lo que ya terminó no se corrige.
  assert.deepEqual(R.contratosConNombreAjeno([contrato()], PLANO_CJ, "2026-12-01"), []);
  // El que arranca el mes que viene SÍ: es el que todavía se puede mover.
  const futuro = R.contratosConNombreAjeno(
    [contrato({ desde: "2026-10-01", hasta: "2026-12-31" })], PLANO_CJ, "2026-09-08");
  assert.equal(futuro.length, 1);
});

prueba("un mueble sin proveedor no es un contrato", () => {
  assert.deepEqual(R.contratosConNombreAjeno([contrato({ proveedor: "" })], PLANO_CJ, "2026-09-08"), []);
});

prueba("la cara B lleva su propio código de espacio", () => {
  const r = R.contratosConNombreAjeno([contrato({ cara: "B" })], PLANO_CJ, "2026-09-08");
  assert.equal(r[0].codigo, "CIUDAD JARDIN-IMP-12-B");
});

prueba("primero los que pisan el código de otro", () => {
  // Son los peores: hay un mueble al que ese nombre apunta de verdad.
  const inocente = contrato({ id: "i08", code: "IMP-08", nomenclatura: "Punta 3", proveedor: "COLGATE" });
  const r = R.contratosConNombreAjeno([inocente, contrato()], PLANO_CJ, "2026-09-08");
  assert.equal(r.length, 2);
  assert.equal(r[0].pisaCodigoDe, "IMP-08");
  assert.equal(r[1].pisaCodigoDe, null);
});

prueba("un plano sin renombres no deja nada para reconciliar", () => {
  const limpio = impulsadores();
  const c = { id: "i12", code: "IMP-12", sede: "CIUDAD JARDIN", proveedor: "CASA LUKER",
              desde: "2026-01-01", hasta: "2026-09-15" };
  assert.deepEqual(R.contratosConNombreAjeno([c], limpio, "2026-09-08"), []);
});

console.log("\n" + hechas + " pruebas" + (process.exitCode ? " · CON FALLAS" : " · todo en orden") + "\n");
