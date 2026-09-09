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

// La otra mitad de la reconciliación: de dónde sale «cómo se llamaba». Vive en
// `nomenclatura.ts` y acá se prueba junto con la lista, porque el hueco que hubo
// no estaba en ninguna de las dos por separado — estaba en el paso de una a la
// otra DESPUÉS de renumerar, que es cuando el plano deja de traer el recuerdo y
// lo trae el servidor en otro campo.
const salidaN = join(mkdtempSync(join(tmpdir(), "rev-nom-")), "nom.mjs");
const bundleN = await build({
  entryPoints: [join(aqui, "..", "src", "utils", "nomenclatura.ts")],
  bundle: true, format: "esm", write: false, platform: "neutral",
});
writeFileSync(salidaN, bundleN.outputFiles[0].text);
const N = await import(pathToFileURL(salidaN).href);

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

console.log("\nrevisión · los nombres: uno por mueble");

/** Once impulsadores en fila. Separados 1,5 m para que no haya encimados ni
 *  pasillos angostos y quede a la vista lo de los nombres.
 *
 *  `repetidos` fuerza que dos se llamen igual: es lo que un plano guardado
 *  ANTES de la regla puede traer, y lo que la revisión tiene que mostrar sin
 *  impedir que se abra ni que se guarde. */
const impulsadores = (repetidos = {}) =>
  Array.from({ length: 11 }, (_, i) => {
    const code = `IMP-${String(i + 7).padStart(2, "0")}`;
    return {
      id: "i" + code.slice(4), code: repetidos[code] ?? code, type: "impulsador",
      cx: i * 1.5, cz: 0, w: 0.6, d: 0.4, h: 1.4, rotY: 0,
    };
  });

prueba("DOS MUEBLES LLAMADOS IGUAL ES UN ERROR, Y LOS NOMBRA", () => {
  // Antes esto se contaba de tres maneras —código repetido, nombre dibujado
  // repetido, nombre que pisa el código de otro— porque un mueble tenía dos
  // campos. Con un solo nombre es un solo hallazgo, y dice lo que importa.
  const plano = impulsadores({ "IMP-12": "IMP-08" });
  const h = R.revisarPlano(plano).find(x => x.clase === "codigo-repetido");
  assert.ok(h, "no lo detectó");
  assert.equal(h.severidad, "error");
  assert.deepEqual(h.ids.sort(), ["i08", "i12"]);
  assert.ok(h.texto.includes("IMP-08"), h.texto);
  assert.ok(h.texto.includes("no elige cuál"), h.texto);
});

prueba("los seis renombres de CIUDAD JARDIN, ahora, son cuatro nombres repetidos", () => {
  // La foto del dueño, traducida al modelo de un solo nombre: correr números
  // dentro de un conjunto cerrado deja pares de muebles llamados igual.
  const plano = impulsadores({
    "IMP-09": "IMP-17", "IMP-11": "IMP-16", "IMP-12": "IMP-08",
    "IMP-13": "IMP-10", "IMP-14": "IMP-12", "IMP-15": "IMP-14",
  });
  const h = R.revisarPlano(plano).filter(x => x.clase === "codigo-repetido");
  assert.deepEqual(h.map(x => x.texto.split(" ")[0]).sort(), ["IMP-08", "IMP-10", "IMP-16", "IMP-17"]);
  assert.ok(h.every(x => x.ids.length === 2));
});

prueba("un plano sano no reporta nada", () => {
  assert.deepEqual(R.revisarPlano(impulsadores()), []);
});

console.log("\nrevisión · los contratos que ya están cargados");

/** Después de renumerar, el mueble que hoy se llama IMP-12 es el que el papel
 *  de CASA LUKER llama «IMP-08», que es como se llamaba cuando se negoció. */
const contrato = (extra) => ({
  id: "i12", code: "IMP-12", sede: "CIUDAD JARDIN", nombreAnterior: "IMP-08",
  proveedor: "CASA LUKER", marca: "ASEO",
  desde: "2026-01-01", hasta: "2026-09-15", valor: 200000, ...extra,
});
const PLANO_CJ = impulsadores();

prueba("LISTA EL CONTRATO CUYO MUEBLE YA NO SE LLAMA COMO EL CONTRATO DICE", () => {
  const r = R.contratosConNombreAjeno([contrato()], PLANO_CJ, "2026-09-08");
  assert.equal(r.length, 1);
  assert.equal(r[0].codigo, "CIUDAD JARDIN-IMP-12");   // cómo se llama hoy
  assert.equal(r[0].nombre, "IMP-12");
  assert.equal(r[0].seNegocioComo, "IMP-08");           // lo que dice el papel
  assert.equal(r[0].proveedor, "CASA LUKER");
  assert.equal(r[0].desde, "2026-01-01");
  assert.equal(r[0].hasta, "2026-09-15");
  // Y lo peor que puede pasar: ese nombre viejo hoy lo lleva OTRO mueble, así
  // que quien lea el papel y camine hasta el cartel se para frente al equivocado.
  assert.equal(r[0].loTieneAhora, "IMP-08");
});

prueba("el que se sigue llamando igual no está en la lista", () => {
  const igual = R.contratosConNombreAjeno(
    [contrato({ id: "i07", code: "IMP-07", nombreAnterior: undefined })], PLANO_CJ, "2026-09-08");
  assert.deepEqual(igual, []);
  // Ni el que tiene guardado su propio nombre como nombre viejo.
  const mismo = R.contratosConNombreAjeno(
    [contrato({ id: "i07", code: "IMP-07", nombreAnterior: " imp-07 " })], PLANO_CJ, "2026-09-08");
  assert.deepEqual(mismo, []);
});

prueba("el nombre viejo que hoy no lo tiene nadie igual se lista", () => {
  // No es el peor caso, pero sigue siendo un papel que nombra algo que ya no
  // existe: hay que reconciliarlo con la cartelería igual.
  const r = R.contratosConNombreAjeno(
    [contrato({ nombreAnterior: "IMP-99" })], PLANO_CJ, "2026-09-08");
  assert.equal(r.length, 1);
  assert.equal(r[0].seNegocioComo, "IMP-99");
  assert.equal(r[0].loTieneAhora, null);
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

prueba("primero los que hoy nombran a OTRO mueble", () => {
  const suelto = contrato({ id: "i09", code: "IMP-09", nombreAnterior: "IMP-99", proveedor: "COLGATE" });
  const r = R.contratosConNombreAjeno([suelto, contrato()], PLANO_CJ, "2026-09-08");
  assert.equal(r.length, 2);
  assert.equal(r[0].loTieneAhora, "IMP-08");
  assert.equal(r[1].loTieneAhora, null);
});

prueba("un plano que nunca se renombró no deja nada para reconciliar", () => {
  const c = { id: "i12", code: "IMP-12", sede: "CIUDAD JARDIN", proveedor: "CASA LUKER",
              desde: "2026-01-01", hasta: "2026-09-15" };
  assert.deepEqual(R.contratosConNombreAjeno([c], PLANO_CJ, "2026-09-08"), []);
});

console.log("\nrevisión · la reconciliación DESPUÉS de renumerar");

/** CIUDAD JARDIN ya renumerada, **tal como la entrega el servidor**: los once
 *  impulsadores pasan a llamarse `IMP-01…IMP-11` en el orden en que se camina,
 *  cada uno conserva su `id` —que es la identidad de verdad—, **ninguno tiene
 *  `nomenclatura`** (la renumeración la borra, y tiene que borrarla) y cada uno
 *  que cambió trae `nombreAnterior`, que el servidor deriva de su registro de
 *  renumeraciones y agrega al plano al leerlo.
 *
 *  El recuerdo es el nombre que el plano DIBUJABA: para `i12` es «IMP-08»
 *  —lo que decía el cartel— y no «IMP-12», que era su código. */
const PLANO_RENUMERADO = impulsadores().map((f, k) => {
  const dibujado = { i12: "IMP-08", i13: "IMP-10", i14: "IMP-12" }[f.id] ?? f.code;
  const code = `IMP-${String(k + 1).padStart(2, "0")}`;
  return { ...f, code, nomenclatura: undefined, nombreAnterior: dibujado };
});

/** El camino entero de la pantalla, sin saltarse un paso: el mueble como lo
 *  manda el servidor → `nombreAnterior` → la lista. Es lo que hace
 *  `RevisionPanel` al armar los contratos del plano. */
const reconciliar = (contratos, plano = PLANO_RENUMERADO) => {
  const conNombre = contratos.map((c) => {
    const mueble = plano.find((f) => f.id === c.id);
    return { ...c, code: mueble.code, nombreAnterior: N.nombreAnterior(mueble) };
  });
  return R.contratosConNombreAjeno(conNombre, plano, "2026-09-09");
};

/** El contrato de CASA LUKER, negociado mirando el cartel que decía «IMP-08»
 *  sobre el mueble `i12`. Después de renumerar ese mueble se llama «IMP-06». */
const LUKER = {
  id: "i12", sede: "CIUDAD JARDIN", proveedor: "CASA LUKER", marca: "ASEO",
  desde: "2026-01-01", hasta: "2026-12-31", valor: 200000,
};

prueba("DESPUÉS DE RENUMERAR, EL CONTRATO SIGUE EN LA LISTA, CON LOS DOS NOMBRES", () => {
  // Es el punto entero: renumerar es lo que HACE que el plano y la cartelería
  // dejen de decir lo mismo, así que la lista tiene que existir justo después,
  // no sólo antes. Con la `nomenclatura` borrada y sin el recuerdo del servidor,
  // esta pantalla quedaba vacía en el minuto para el que fue hecha.
  const r = reconciliar([LUKER]);
  assert.equal(r.length, 1);
  assert.equal(r[0].seNegocioComo, "IMP-08");             // lo que dice el papel
  assert.equal(r[0].nombre, "IMP-06");                     // cómo se llama hoy
  assert.equal(r[0].codigo, "CIUDAD JARDIN-IMP-06");       // con qué se factura
  assert.equal(r[0].proveedor, "CASA LUKER");
  // Y lo peor que puede pasar sigue estando dicho: «IMP-08» hoy es el nombre de
  // OTRO mueble, así que quien camine hasta el cartel se para frente al equivocado.
  assert.equal(r[0].loTieneAhora, "IMP-08");
});

prueba("sin el recuerdo del servidor, la misma pantalla no lista NADA", () => {
  // La prueba de que ese campo es lo que sostiene la lista y no un adorno: el
  // mismo plano renumerado y el mismo contrato, sin `nombreAnterior`, no tiene
  // una sola fuente de la que sacar «cómo se llamaba».
  const sinMemoria = PLANO_RENUMERADO.map((f) => ({ ...f, nombreAnterior: undefined }));
  assert.deepEqual(reconciliar([LUKER], sinMemoria), []);
});

prueba("ninguno de los contratos vigentes de la sede se queda afuera", () => {
  // La foto del dueño, después de renumerar: contratos vigentes sobre muebles
  // que cambiaron de nombre, cada uno con el suyo.
  const contratos = [
    LUKER,
    { id: "i07", sede: "CIUDAD JARDIN", proveedor: "POSTOBON", desde: "2026-01-01", hasta: "2026-12-31" },
    { id: "i08", sede: "CIUDAD JARDIN", proveedor: "COLGATE",  desde: "2026-01-01", hasta: "2026-12-31" },
  ];
  const r = reconciliar(contratos);
  assert.equal(r.length, 3);
  assert.deepEqual(
    r.map((x) => `${x.seNegocioComo}→${x.nombre}`).sort(),
    ["IMP-07→IMP-01", "IMP-08→IMP-02", "IMP-08→IMP-06"],
  );
});

prueba("un mueble que la renumeración dejó como estaba no aparece", () => {
  // El servidor no manda `nombreAnterior` cuando el mueble salió llamándose
  // como entró: no hay nada que recordar, y meterlo en la lista sería mandar a
  // alguien a caminar la tienda al pepe.
  const plano = PLANO_RENUMERADO.map((f) =>
    f.id === "i09" ? { ...f, code: "IMP-09", nombreAnterior: undefined } : f);
  const c = { id: "i09", sede: "CIUDAD JARDIN", proveedor: "QUALA", desde: "2026-01-01", hasta: "2026-12-31" };
  assert.deepEqual(reconciliar([c], plano), []);
});

prueba("con DOS renumeraciones encima, el papel más viejo sigue valiendo", () => {
  // El servidor guarda una fila por renumeración y contesta la punta MÁS VIEJA:
  // el contrato se firmó cuando el mueble se leía «IMP-08», y el papel que está
  // en la carpeta sigue diciendo eso aunque después haya habido otra corrida.
  const plano = PLANO_RENUMERADO.map((f) =>
    f.id === "i12" ? { ...f, code: "IMP-04", nombreAnterior: "IMP-08" } : f);
  const r = reconciliar([LUKER], plano);
  assert.equal(r.length, 1);
  assert.equal(r[0].seNegocioComo, "IMP-08");
  assert.equal(r[0].nombre, "IMP-04");
});

prueba("un contrato vencido tampoco se lista después de renumerar", () => {
  // La reconciliación es para poder corregir: lo que ya terminó no se corrige,
  // y llenar la lista de contratos muertos es la forma de que no se lea.
  assert.deepEqual(reconciliar([{ ...LUKER, hasta: "2026-08-31" }]), []);
});

console.log("\n" + hechas + " pruebas" + (process.exitCode ? " · CON FALLAS" : " · todo en orden") + "\n");
