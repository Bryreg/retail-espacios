/**
 * Pruebas de src/utils/nomenclatura.ts — cómo se llaman los muebles.
 *   npm run probar:nomenclatura
 */
import assert from "node:assert/strict";
import { build } from "esbuild";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

const aqui = dirname(fileURLToPath(import.meta.url));
const salida = join(mkdtempSync(join(tmpdir(), "nom-")), "nom.mjs");
const { outputFiles } = await build({
  entryPoints: [join(aqui, "..", "src", "utils", "nomenclatura.ts")],
  bundle: true, format: "esm", write: false, platform: "neutral",
});
writeFileSync(salida, outputFiles[0].text);
const N = await import(pathToFileURL(salida).href);

let hechas = 0;
const prueba = (n, fn) => {
  try { fn(); hechas++; console.log("  ok   " + n); }
  catch (e) { console.error("  FALLA " + n + "\n         " + e.message); process.exitCode = 1; }
};
const muebles = (...codigos) => codigos.map((c, i) => ({ id: "f" + i, code: c }));

console.log("\nnomenclatura · el siguiente código");

prueba("una sede vacía empieza en 01", () => {
  assert.equal(N.siguienteCodigo("gondola", []), "GON-01");
});

prueba("sigue al más alto", () => {
  assert.equal(N.siguienteCodigo("gondola", muebles("GON-01", "GON-02")), "GON-03");
});

prueba("BORRAR UN MUEBLE NO REPITE EL CÓDIGO", () => {
  // El editor 3D CONTABA: con GON-01 y GON-03 en el plano, contaba 2 y devolvía
  // GON-03 otra vez. Dos muebles distintos con el mismo código, y con eso dos
  // espacios distintos compartiendo contratos, archivos y correos.
  const tras = muebles("GON-01", "GON-03");
  const nuevo = N.siguienteCodigo("gondola", tras);
  assert.equal(nuevo, "GON-04");
  assert.ok(!tras.some(f => f.code === nuevo), "el código nuevo ya estaba en uso");
});

prueba("un código escrito a mano tampoco lo hace chocar", () => {
  // Alguien renombra a GON-09 con sólo GON-01 en el plano. max+1 daría GON-10,
  // que está libre; pero si además existe GON-02 el salto tiene que esquivarlo.
  const plano = muebles("GON-01", "GON-09", "GON-10");
  assert.equal(N.siguienteCodigo("gondola", plano), "GON-11");
});

prueba("no distingue mayúsculas ni espacios", () => {
  assert.equal(N.siguienteCodigo("gondola", muebles(" gon-01 ", "GON-02")), "GON-03");
});

prueba("cada tipo lleva su propia cuenta", () => {
  const plano = muebles("GON-01", "GON-02", "PUN-01");
  assert.equal(N.siguienteCodigo("punta", plano), "PUN-02");
  assert.equal(N.siguienteCodigo("gondola", plano), "GON-03");
});

prueba("las dos góndolas del plano 2D comparten numeración", () => {
  // gondola_doble y gondola_mural son un solo GON: son la misma familia y en
  // el plano se leen juntas.
  const plano = muebles("GON-01");
  assert.equal(N.siguienteCodigo("gondola_doble", plano), "GON-02");
  assert.equal(N.siguienteCodigo("gondola_mural", plano), "GON-02");
  assert.equal(N.prefijoDe("gondola_doble"), N.prefijoDe("gondola"));
});

prueba("un tipo desconocido no rompe: cae en SPC", () => {
  assert.equal(N.siguienteCodigo("marciano", []), "SPC-01");
});

prueba("pasado el 99 sigue contando", () => {
  const plano = muebles(...Array.from({ length: 99 }, (_, i) => `GON-${String(i+1).padStart(2,"0")}`));
  assert.equal(N.siguienteCodigo("gondola", plano), "GON-100");
});

console.log("\nnomenclatura · códigos repetidos");

prueba("detecta el repetido", () => {
  const d = N.duplicados([{id:"a",code:"GON-01"},{id:"b",code:"GON-01"},{id:"c",code:"PUN-01"}]);
  assert.equal(d.length, 1);
  assert.equal(d[0].codigo, "GON-01");
  assert.deepEqual(d[0].ids.sort(), ["a","b"]);
});

prueba("un plano sano no reporta nada", () => {
  assert.deepEqual(N.duplicados(muebles("GON-01","GON-02","PUN-01")), []);
});

prueba("el repetido se detecta aunque cambie la caja", () => {
  const d = N.duplicados([{id:"a",code:"gon-01"},{id:"b",code:"GON-01 "}]);
  assert.equal(d.length, 1);
});

prueba("un código vacío no cuenta como repetido", () => {
  assert.deepEqual(N.duplicados([{id:"a",code:""},{id:"b",code:"  "}]), []);
});

prueba("al renombrar avisa si el código ya es de otro", () => {
  const plano = [{id:"a",code:"GON-01"},{id:"b",code:"GON-02"}];
  assert.ok(N.codigoRepetido("GON-02", plano, "a"), "debía avisar");
  assert.ok(!N.codigoRepetido("GON-01", plano, "a"), "es su propio código, no es choque");
  assert.ok(!N.codigoRepetido("GON-07", plano, "a"), "está libre");
});

console.log("\nnomenclatura · el prefijo dice qué es");

prueba("un prefijo que no corresponde al tipo se reporta", () => {
  const r = N.prefijoDesalineado([
    { id: "a", code: "GON-01", type: "gondola" },
    { id: "b", code: "GON-02", type: "punta" },
  ]);
  assert.equal(r.length, 1);
  assert.equal(r[0].id, "b");
  assert.equal(r[0].esperado, "PUN");
});

prueba("NAVE no tiene ninguno desalineado", () => {
  // Los 104 muebles reales pasan: quien dibujó el plano siguió la convención.
  const reales = [
    { id:"1", code:"GON-46", type:"gondola" }, { id:"2", code:"PUN-01", type:"punta" },
    { id:"3", code:"CAJ-01", type:"checkout" }, { id:"4", code:"BEB-01", type:"nevera_refrescos" },
    { id:"5", code:"MET-03", type:"metro" }, { id:"6", code:"COL-01", type:"columna" },
  ];
  assert.deepEqual(N.prefijoDesalineado(reales), []);
});



console.log("\nnomenclatura · el nombre del mueble");

prueba("sin nomenclatura escrita, el nombre es el del sistema", () => {
  // Es el caso de los 109 muebles del plano real: el panel decía «—» mientras
  // el plano mostraba el código. Son la misma cosa.
  assert.equal(N.nombreDeMueble({ code: "GON-800" }), "GON-800");
  assert.equal(N.nombreDeMueble({ code: "GON-800", nomenclatura: "" }), "GON-800");
  assert.equal(N.nombreDeMueble({ code: "GON-800", nomenclatura: "   " }), "GON-800");
  assert.equal(N.nombreDeMueble({ code: "GON-800", nomenclatura: null }), "GON-800");
});

prueba("escribir una nomenclatura reemplaza el nombre", () => {
  assert.equal(N.nombreDeMueble({ code: "GON-800", nomenclatura: "P1-A" }), "P1-A");
  assert.equal(N.nombreDeMueble({ code: "GON-800", nomenclatura: "  P1-A  " }), "P1-A");
});

prueba("se distingue el nombre puesto a mano del heredado", () => {
  // Sirve para poder decir «· del sistema» sin mentir, y para saber que vaciar
  // el campo devuelve al código.
  assert.equal(N.nombrePropio({ code: "GON-800" }), false);
  assert.equal(N.nombrePropio({ code: "GON-800", nomenclatura: "" }), false);
  assert.equal(N.nombrePropio({ code: "GON-800", nomenclatura: "P1-A" }), true);
  // Escribir exactamente el código NO es un nombre propio: es el mismo.
  assert.equal(N.nombrePropio({ code: "GON-800", nomenclatura: "GON-800" }), false);
});

prueba("vaciar el campo devuelve el nombre del sistema", () => {
  const antes = { code: "GON-800", nomenclatura: "P1-A" };
  assert.equal(N.nombreDeMueble(antes), "P1-A");
  assert.equal(N.nombreDeMueble({ ...antes, nomenclatura: "" }), "GON-800");
});

console.log("\nnomenclatura · qué se dibuja en el plano");

prueba("EL NOMBRE APARECE UNA VEZ, NO DOS", () => {
  // El bicho: un mueble renombrado mostraba «ISL-01» en la pastilla de arriba y
  // «ISL-03» —el de fábrica— adentro de la caja. Dos nombres para el mismo
  // mueble, uno encima del otro, y el de abajo era el que ya no se usa.
  const renombrado = { code: "ISL-03", nomenclatura: "ISL-01" };
  const grande = N.rotulosDelPlano(renombrado, true);
  assert.equal(grande.adentro, "ISL-01");
  assert.equal(grande.pastilla, null);
});

prueba("sin nombre propio, adentro va el del sistema", () => {
  const r = N.rotulosDelPlano({ code: "GON-800" }, true);
  assert.equal(r.adentro, "GON-800");
  assert.equal(r.pastilla, null);
});

prueba("si adentro no cabe, el nombre puesto a mano se va a la pastilla", () => {
  // Para eso existe la pastilla: un mueble de 30 px no tiene lugar adentro.
  const r = N.rotulosDelPlano({ code: "ISL-03", nomenclatura: "ISL-01" }, false);
  assert.equal(r.adentro, null);
  assert.equal(r.pastilla, "ISL-01");
});

prueba("un mueble chico SIN nombre propio no lleva pastilla", () => {
  // Una pastilla por cada cajita deja el plano ilegible al alejarse, y no diría
  // nada que el emoji no diga.
  const r = N.rotulosDelPlano({ code: "GON-800" }, false);
  assert.equal(r.adentro, null);
  assert.equal(r.pastilla, null);
});

prueba("nunca se dibujan los dos a la vez", () => {
  const casos = [
    { code: "GON-01" },
    { code: "GON-01", nomenclatura: "" },
    { code: "GON-01", nomenclatura: "GON-01" },
    { code: "GON-01", nomenclatura: "Punta pasillo 3" },
  ];
  for (const m of casos) {
    for (const cabe of [true, false]) {
      const r = N.rotulosDelPlano(m, cabe);
      assert.ok(!(r.adentro && r.pastilla), `${m.nomenclatura ?? "—"} / ${cabe}`);
    }
  }
});

console.log("\nnomenclatura · dos muebles llamados igual");

prueba("renombrar a un nombre que ya se ve en otro mueble es choque", () => {
  const items = [
    { id: "a", code: "ISL-01" },
    { id: "b", code: "ISL-03", nomenclatura: "Punta pasillo 3" },
  ];
  // Contra el nombre del sistema de otro mueble.
  assert.equal(N.nombreRepetido("ISL-01", items, "c"), true);
  // Contra el nombre puesto a mano de otro mueble.
  assert.equal(N.nombreRepetido("Punta pasillo 3", items, "c"), true);
  // Un nombre libre no choca.
  assert.equal(N.nombreRepetido("ISL-02", items, "c"), false);
  // Quedarse con el nombre que uno ya tiene no es choque.
  assert.equal(N.nombreRepetido("Punta pasillo 3", items, "b"), false);
});

prueba("RENOMBRAR AL CÓDIGO DE OTRO MUEBLE ES CHOQUE", () => {
  // Es exactamente lo que pasa al renombrar ISL-03 → ISL-01 en una sala donde
  // ISL-01 ya existe: quedan dos cajas diciendo ISL-01 y nadie sabe cuál es
  // cuál. El código no choca —sigue siendo ISL-03— pero lo que se VE, sí.
  const items = [
    { id: "a", code: "ISL-01" },
    { id: "b", code: "ISL-03" },
  ];
  assert.equal(N.codigoRepetido("ISL-01", items, "b"), true);
  assert.equal(N.nombreRepetido("ISL-01", items, "b"), true);
});

prueba("un nombre vacío no cuenta como repetido", () => {
  assert.equal(N.nombreRepetido("  ", [{ id: "a", code: "ISL-01" }]), false);
});

prueba("el mueble renombrado libera su código de fábrica", () => {
  // ISL-03 se renombró a ISL-01, así que YA NO se llama ISL-03: otro mueble
  // puede llamarse así sin que se vean dos iguales en el plano.
  const items = [{ id: "b", code: "ISL-03", nomenclatura: "ISL-01" }];
  assert.equal(N.nombreRepetido("ISL-03", items, "c"), false);
  // Pero el CÓDIGO sigue tomado: es la llave del espacio, y no se toca.
  assert.equal(N.codigoRepetido("ISL-03", items, "c"), true);
});

console.log("\nnomenclatura · un nombre que es el CÓDIGO de otro");

/** El plano de CIUDAD JARDIN de la fase 12: once impulsadores, seis renumerados
 *  a mano corriendo los números dentro del mismo conjunto. Correr números en un
 *  conjunto cerrado garantiza que cada nombre nuevo sea el código viejo de otro. */
const CIUDAD_JARDIN = [
  { id: "i07", code: "IMP-07" },
  { id: "i08", code: "IMP-08" },
  { id: "i09", code: "IMP-09", nomenclatura: "IMP-17" },
  { id: "i10", code: "IMP-10" },
  { id: "i11", code: "IMP-11", nomenclatura: "IMP-16" },
  { id: "i12", code: "IMP-12", nomenclatura: "IMP-08" },
  { id: "i13", code: "IMP-13", nomenclatura: "IMP-10" },
  { id: "i14", code: "IMP-14", nomenclatura: "IMP-12" },
  { id: "i15", code: "IMP-15", nomenclatura: "IMP-14" },
  { id: "i16", code: "IMP-16" },
  { id: "i17", code: "IMP-17" },
];

prueba("muebleConCodigo devuelve el mueble, no un sí/no", () => {
  // Un booleano no alcanza: el aviso tiene que poder decir CUÁL es el otro.
  const otro = N.muebleConCodigo("IMP-08", CIUDAD_JARDIN, "i12");
  assert.equal(otro?.id, "i08");
  assert.equal(N.muebleConCodigo("IMP-99", CIUDAD_JARDIN), null);
  assert.equal(N.muebleConCodigo("  imp-08 ", CIUDAD_JARDIN, "i12")?.id, "i08");
  // El propio no cuenta.
  assert.equal(N.muebleConCodigo("IMP-08", CIUDAD_JARDIN, "i08"), null);
});

prueba("PONERLE A UN MUEBLE EL CÓDIGO DE OTRO ES CHOQUE", () => {
  // El agujero de la fase 12. En un plano donde IMP-08 todavía se dibuja con su
  // código, `nombreRepetido` ya lo atrapaba. El caso que se colaba es el de
  // abajo: en cuanto el dueño del código se renombra, el código queda «libre»
  // como nombre y sin embargo sigue siendo la llave con la que la planilla une.
  const plano = [
    { id: "a", code: "IMP-08", nomenclatura: "IMP-14" },  // ya renombrado
    { id: "b", code: "IMP-12" },
  ];
  // El nombre IMP-08 no lo dibuja nadie: por nombre no choca.
  assert.equal(N.nombreRepetido("IMP-08", plano, "b"), false);
  // Pero es el código de «a»: quien cargue una planilla con «IMP-08» firma sobre «a».
  const ch = N.choqueDeNombre("IMP-08", plano, "b");
  assert.equal(ch?.clase, "codigo");
  assert.equal(ch?.otro.id, "a");
});

prueba("la cascada de renombres ya no abre la puerta", () => {
  // Medido en el diagnóstico: con `nombreRepetido` solo, renombrar primero al
  // dueño del código dejaba pasar el segundo renombre. Ahora los dos se frenan.
  const plano = [{ id: "a", code: "IMP-08" }, { id: "b", code: "IMP-12" }];
  assert.equal(N.choqueDeNombre("IMP-08", plano, "b")?.clase, "nombre");
  const tras = [{ id: "a", code: "IMP-08", nomenclatura: "IMP-14" }, { id: "b", code: "IMP-12" }];
  assert.equal(N.choqueDeNombre("IMP-08", tras, "b")?.clase, "codigo");
});

prueba("un mueble no choca contra sí mismo", () => {
  // Si chocara, ningún plano se podría abrir sin que el campo grite.
  assert.equal(N.choqueDeNombre("IMP-07", CIUDAD_JARDIN, "i07"), null);
  const propio = [{ id: "a", code: "PUN-01", nomenclatura: "Punta del pasillo 3" }];
  assert.equal(N.choqueDeNombre("Punta del pasillo 3", propio, "a"), null);
  assert.equal(N.choqueDeNombre("PUN-01", propio, "a"), null);
});

prueba("lo que YA está guardado y choca se sigue detectando", () => {
  // El plano de CIUDAD JARDIN está mal desde antes de que exista esta
  // comprobación. Los seis renombres se detectan —para avisarlos—, y ninguno
  // impide abrir ni guardar: eso lo decide la pantalla, no esta función.
  const porNombre = N.choqueDeNombre("IMP-08", CIUDAD_JARDIN, "i12");
  assert.equal(porNombre?.clase, "nombre");     // IMP-08 también lo DIBUJA i08
  assert.equal(porNombre?.otro.id, "i08");
  const porCodigo = N.choqueDeNombre("IMP-14", CIUDAD_JARDIN, "i15");
  assert.equal(porCodigo?.clase, "codigo");     // nadie dibuja IMP-14; es el código de i14
  assert.equal(porCodigo?.otro.id, "i14");
});

prueba("un nombre libre y uno vacío no chocan", () => {
  assert.equal(N.choqueDeNombre("Punta del pasillo 3", CIUDAD_JARDIN, "i12"), null);
  // Vaciar el campo devuelve el nombre del sistema: tiene que poder hacerse siempre.
  assert.equal(N.choqueDeNombre("", CIUDAD_JARDIN, "i12"), null);
  assert.equal(N.choqueDeNombre("   ", CIUDAD_JARDIN, "i12"), null);
});

prueba("el aviso nombra al otro mueble por su código", () => {
  // Un aviso que dice «está mal» y no dice contra qué no se puede resolver.
  const porCodigo = N.choqueDeNombre("IMP-08", [{ id: "a", code: "IMP-08", nomenclatura: "IMP-14" }], "b");
  const t1 = N.textoDelChoque("IMP-08", porCodigo);
  assert.ok(t1.includes("IMP-08"), t1);
  assert.ok(t1.includes("IMP-14"), t1);   // cómo se dibuja el otro, para poder encontrarlo
  const porNombre = N.choqueDeNombre("IMP-08", [{ id: "a", code: "IMP-99", nomenclatura: "IMP-08" }], "b");
  const t2 = N.textoDelChoque("imp-08", porNombre);
  assert.ok(t2.includes("IMP-99"), t2);   // el código del otro, que es la llave
});

console.log("\nnomenclatura · qué está mal en un plano entero");

prueba("los nombres repetidos del plano medido son cuatro", () => {
  // IMP-08, IMP-10, IMP-16 e IMP-17 se dibujan dos veces cada uno, y el plano
  // no tiene UN SOLO código repetido: por eso la revisión lo daba por limpio.
  assert.deepEqual(N.duplicados(CIUDAD_JARDIN), []);
  const rep = N.nombresRepetidos(CIUDAD_JARDIN).map((r) => r.nombre).sort();
  assert.deepEqual(rep, ["IMP-08", "IMP-10", "IMP-16", "IMP-17"]);
  assert.equal(N.nombresRepetidos(CIUDAD_JARDIN)[0].ids.length, 2);
});

prueba("las seis nomenclaturas puestas a mano pisan el código de otro", () => {
  const pisan = N.nombresQuePisanCodigo(CIUDAD_JARDIN);
  assert.equal(pisan.length, 6);
  const doce = pisan.find((p) => p.code === "IMP-12");
  assert.equal(doce.nombre, "IMP-08");
  assert.equal(doce.otroCode, "IMP-08");
  assert.equal(doce.otroId, "i08");
});

prueba("un plano sin nombres puestos a mano no reporta nada", () => {
  const limpio = muebles("IMP-07", "IMP-08", "IMP-09");
  assert.deepEqual(N.nombresRepetidos(limpio), []);
  assert.deepEqual(N.nombresQuePisanCodigo(limpio), []);
});

prueba("un nombre que no es código de nadie no se reporta", () => {
  // Renombrar está permitido: lo que no se puede es pisar la llave de otro.
  const plano = [
    { id: "a", code: "PUN-01", nomenclatura: "Punta del pasillo 3" },
    { id: "b", code: "PUN-02" },
  ];
  assert.deepEqual(N.nombresQuePisanCodigo(plano), []);
  assert.deepEqual(N.nombresRepetidos(plano), []);
});

console.log("\nnomenclatura · en el plano se tiene que VER que dos se llaman igual");

/** El par de la doble venta, reducido a lo que importa: el mueble renombrado
 *  «IMP-08» y el que de verdad SE LLAMA IMP-08. En el plano medido los dos se
 *  leen «IMP-08» y sólo el primero dibujaba pastilla. */
const PAR = [
  { id: "i08", code: "IMP-08" },                          // el verdadero, sin nombre puesto a mano
  { id: "i12", code: "IMP-12", nomenclatura: "IMP-08" },  // el que el plano rotula igual
];

prueba("los nombres chocados salen con la CUENTA, no con un sí/no", () => {
  // Sin la cuenta el aviso no puede decir «×2», que es lo que convierte dos
  // cajas iguales en dos cajas que se señalan entre ellas.
  const m = N.nombresChocados(CIUDAD_JARDIN);
  assert.deepEqual([...m.keys()].sort(), ["IMP-08", "IMP-10", "IMP-16", "IMP-17"]);
  assert.equal(m.get("IMP-08"), 2);
  assert.deepEqual([...N.nombresChocados(muebles("IMP-07", "IMP-08")).keys()], []);
  // Un mueble solo no choca contra sí mismo, ni siquiera si se renombró.
  assert.equal(N.nombresChocados([{ id: "a", code: "GON-01", nomenclatura: "GON-01" }]).size, 0);
});

prueba("LOS DOS MUEBLES QUE SE LLAMAN IGUAL MUESTRAN SU NOMBRE", () => {
  // El hallazgo grave que quedó abierto: de los dos, el plano dibujaba UNA
  // pastilla —la del renombrado— y el IMP-08 verdadero, chico, mostraba nada
  // más el emoji. Quien miraba el plano veía un solo IMP-08.
  const ch = N.nombresChocados(PAR);
  const verdadero = N.rotulosDelPlano(PAR[0], false, ch);
  const renombrado = N.rotulosDelPlano(PAR[1], false, ch);
  assert.equal(verdadero.pastilla, "IMP-08");   // antes: null
  assert.equal(renombrado.pastilla, "IMP-08");
  assert.equal(verdadero.choque.veces, 2);
  assert.equal(renombrado.choque.veces, 2);
});

prueba("y se ve que CHOCAN: la marca dice cuántos son", () => {
  const ch = N.nombresChocados(PAR);
  const r = N.rotulosDelPlano(PAR[1], false, ch);
  assert.equal(r.choque.marca, "×2");
  // El código es lo único que distingue a los dos, y viaja con el aviso.
  assert.equal(r.choque.codigo, "IMP-12");
  // El que se dibuja con su código no tiene nada oculto que revelar.
  assert.equal(N.rotulosDelPlano(PAR[0], false, ch).choque.codigo, null);
  const t = N.rotulosDelPlano(PAR[0], false, ch).choque.texto;
  assert.ok(t.includes("IMP-08") && t.includes("2 muebles"), t);
});

prueba("el nombre SIGUE apareciendo una sola vez", () => {
  // La marca no es un nombre: es la cuenta. Si el nombre entra adentro de la
  // caja, arriba sube sólo «×2» y el mueble no queda diciéndose dos veces.
  const ch = N.nombresChocados(PAR);
  for (const m of PAR) {
    for (const cabe of [true, false]) {
      const r = N.rotulosDelPlano(m, cabe, ch);
      assert.ok(!(r.adentro && r.pastilla), `${m.code} / ${cabe}`);
      assert.ok(r.adentro || r.pastilla, `${m.code} / ${cabe}: no muestra el nombre en ningún lado`);
    }
  }
  const grande = N.rotulosDelPlano(PAR[0], true, ch);
  assert.equal(grande.adentro, "IMP-08");
  assert.equal(grande.pastilla, null);
  assert.equal(grande.choque.marca, "×2");   // la marca sí, el nombre no
});

prueba("NO SE LLENA EL PLANO DE PASTILLAS: sólo se marcan los que chocan", () => {
  // La regla vieja manda para todo lo demás. Una pastilla por cada cajita deja
  // el plano ilegible al alejarse, y eso no cambió.
  const ch = N.nombresChocados(CIUDAD_JARDIN);
  const chico = N.rotulosDelPlano({ code: "GON-800" }, false, ch);
  assert.equal(chico.pastilla, null);
  assert.equal(chico.choque, null);
  // Renombrar sin pisar a nadie: pastilla de siempre, sin marca.
  const libre = N.rotulosDelPlano({ code: "PUN-01", nomenclatura: "Punta del pasillo 3" }, false, ch);
  assert.equal(libre.pastilla, "Punta del pasillo 3");
  assert.equal(libre.choque, null);
  // Y en el plano entero, marcados los 8 muebles de los 4 nombres repetidos.
  const marcados = CIUDAD_JARDIN.filter((f) => N.rotulosDelPlano(f, true, ch).choque);
  assert.equal(marcados.length, 8);
});

prueba("sin el mapa del plano no hay choque que reportar", () => {
  // `rotulosDelPlano` con dos argumentos es lo que ya había: un mueble solo no
  // sabe con quién choca, y ningún llamador viejo empieza a pintar rojo.
  const r = N.rotulosDelPlano(PAR[1], false);
  assert.equal(r.choque, null);
  assert.equal(r.pastilla, "IMP-08");
  assert.equal(N.rotulosDelPlano(PAR[0], false).pastilla, null);
});

prueba("tres muebles con el mismo rótulo dicen ×3, y la caja no importa", () => {
  const tres = [
    { id: "a", code: "IMP-08" },
    { id: "b", code: "IMP-12", nomenclatura: " imp-08 " },
    { id: "c", code: "IMP-14", nomenclatura: "IMP-08" },
  ];
  const ch = N.nombresChocados(tres);
  assert.equal(ch.get("IMP-08"), 3);
  assert.equal(N.rotulosDelPlano(tres[1], true, ch).choque.marca, "×3");
});

prueba("el gemelo se marca aunque su nombre NO pise ningún código", () => {
  // Dos muebles renombrados al mismo texto libre: no hay código pisado —eso lo
  // lista la revisión— pero en el plano se leen igual, que es lo que decide
  // quien está eligiendo un mueble para vender.
  const dos = [
    { id: "a", code: "PUN-01", nomenclatura: "Punta del pasillo 3" },
    { id: "b", code: "PUN-02", nomenclatura: "Punta del pasillo 3" },
  ];
  assert.deepEqual(N.nombresQuePisanCodigo(dos), []);
  const ch = N.nombresChocados(dos);
  assert.equal(N.rotulosDelPlano(dos[0], true, ch).choque.veces, 2);
  assert.equal(N.rotulosDelPlano(dos[1], true, ch).choque.codigo, "PUN-02");
});

console.log("\n" + hechas + " pruebas" + (process.exitCode ? " · CON FALLAS" : " · todo en orden") + "\n");
