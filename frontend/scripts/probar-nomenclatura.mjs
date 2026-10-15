/**
 * Pruebas de src/utils/nomenclatura.ts — cómo se llama un mueble. UNO, no dos.
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


console.log("\nnomenclatura · el nombre del mueble es su código");

prueba("un mueble tiene UN nombre, y es el código", () => {
  // Había dos campos: el `code` y una `nomenclatura` de texto libre que lo
  // reemplazaba en pantalla. Ahora hay uno. Todo lo que quede escrito en el
  // campo viejo NO es un nombre y no cambia cómo se llama el mueble.
  assert.equal(N.nombreDeMueble({ code: "GON-800" }), "GON-800");
  assert.equal(N.nombreDeMueble({ code: "GON-800", nomenclatura: "P1-A" }), "GON-800");
  assert.equal(N.nombreDeMueble({ code: "GON-800", nomenclatura: "" }), "GON-800");
});

prueba("el nombre viejo se conserva, pero como recuerdo", () => {
  // Sirve para dos cosas: buscar por lo que dice la cartelería de la tienda, y
  // reconciliar los contratos que se negociaron mirando ese texto.
  assert.equal(N.nombreAnterior({ code: "IMP-12", nomenclatura: "IMP-08" }), "IMP-08");
  assert.equal(N.nombreAnterior({ code: "IMP-12", nomenclatura: " imp-08 " }), "IMP-08");
  // Nada que recordar: vacío, ausente, o el mismo nombre de hoy.
  assert.equal(N.nombreAnterior({ code: "IMP-12" }), null);
  assert.equal(N.nombreAnterior({ code: "IMP-12", nomenclatura: "" }), null);
  assert.equal(N.nombreAnterior({ code: "IMP-12", nomenclatura: null }), null);
  assert.equal(N.nombreAnterior({ code: "IMP-12", nomenclatura: "imp-12" }), null);
});

prueba("EL NOMBRE VIEJO SOBREVIVE A LA RENUMERACIÓN, Y ES EL QUE SE DIBUJABA", () => {
  // Así llega un mueble renumerado: sin `nomenclatura` —el servidor la borra, y
  // tiene que borrarla— y con `nombreAnterior`, que el servidor deriva de su
  // registro de renumeraciones y agrega al plano al entregarlo. Sin esa segunda
  // fuente, después de renumerar no quedaría nada contra qué reconciliar la
  // cartelería de la tienda, que es cuando más falta hace.
  const renumerado = { id: "imp12", code: "IMP-06", nombreAnterior: "IMP-08" };
  assert.equal(N.nombreAnterior(renumerado), "IMP-08");
  // Y es el nombre que el plano DIBUJABA, no el código viejo: el mueble `imp12`
  // tenía el código «IMP-12» y el cartel decía «IMP-08». El papel dice «IMP-08».
  assert.equal(N.nombreDeMueble(renumerado), "IMP-06");

  // Manda sobre la `nomenclatura`, para un plano a medio migrar que traiga las dos.
  assert.equal(
    N.nombreAnterior({ code: "GON-03", nombreAnterior: "GON-07", nomenclatura: "P1-A" }),
    "GON-07",
  );
  // Y si el nombre recordado es el de hoy, no hay nada que reconciliar.
  assert.equal(N.nombreAnterior({ code: "GON-03", nombreAnterior: "gon-03" }), null);
  assert.equal(N.nombreAnterior({ code: "GON-03" }), null);
});

console.log("\nnomenclatura · LA REGLA: un nombre, un mueble");

/** El plano de CIUDAD JARDIN de la fase 12, ya con un solo nombre: once
 *  impulsadores, cada uno llamado por su código. Es contra este plano que se
 *  prueba la regla, porque es el que la rompió. */
const CIUDAD_JARDIN = [
  { id: "i07", code: "IMP-07", label: "Impulsador Marca" },
  { id: "i08", code: "IMP-08", label: "Impulsador Marca" },
  { id: "i09", code: "IMP-09", label: "Impulsador Marca" },
  { id: "i10", code: "IMP-10", label: "Impulsador Marca" },
  { id: "i11", code: "IMP-11", label: "Impulsador Marca" },
  { id: "i12", code: "IMP-12", label: "Impulsador Marca" },
];

prueba("NO PUEDE HABER DOS MUEBLES CON EL MISMO NOMBRE", () => {
  const r = N.choqueDeNombre("IMP-08", CIUDAD_JARDIN, "i12");
  assert.equal(r.razon, "ocupado");
  assert.equal(r.ocupa.id, "i08");
  // No distingue mayúsculas ni espacios: es la llave.
  assert.equal(N.choqueDeNombre("  imp-08 ", CIUDAD_JARDIN, "i12").ocupa.id, "i08");
});

prueba("un nombre libre se puede poner, y uno vacío no", () => {
  assert.equal(N.choqueDeNombre("IMP-99", CIUDAD_JARDIN, "i12"), null);
  // Un mueble tiene que llamarse de alguna manera: ya no hay un nombre del
  // sistema al que volver vaciando el campo, porque el nombre ES el del sistema.
  assert.equal(N.choqueDeNombre("", CIUDAD_JARDIN, "i12").razon, "vacio");
  assert.equal(N.choqueDeNombre("   ", CIUDAD_JARDIN, "i12").razon, "vacio");
});

prueba("un mueble no choca contra sí mismo", () => {
  // Si chocara, ningún plano se podría abrir sin que el campo grite.
  assert.equal(N.choqueDeNombre("IMP-07", CIUDAD_JARDIN, "i07"), null);
  assert.equal(N.choqueDeNombre("imp-07", CIUDAD_JARDIN, "i07"), null);
});

prueba("un mueble nuevo no se llama como una parte; el que ya se llamaba así, sigue", () => {
  // Vender por partes: `NEV-03-PU2` es la puerta 2 de `NEV-03` y `GON-05-B`
  // la cara B. Un mueble que se llamara así se leería como la parte de otro
  // (el servidor lo frena igual: 409 `nombre_reservado`).
  for (const nombre of ["NEV-PU2", "gon-05-b", "MUR-TR3", "CAJ-BI1", "COL-FO"]) {
    assert.equal(N.choqueDeNombre(nombre, CIUDAD_JARDIN, "i12")?.razon, "reservado", nombre);
  }
  assert.match(N.textoDelChoque("NEV-PU2", { razon: "reservado" }), /parte/);
  // Lo que sólo se le parece, no: un token que no está reservado, o sin guion.
  for (const nombre of ["NEV-PUN2", "PUB-01", "NEVPU2", "IMP-99"]) {
    assert.equal(N.choqueDeNombre(nombre, CIUDAD_JARDIN, "i12"), null, nombre);
  }
  // Un plano viejo con un mueble ya llamado así se sigue abriendo y guardando.
  const viejo = [...CIUDAD_JARDIN, { id: "v1", code: "NEV-PU2", label: "Nevera vieja" }];
  assert.equal(N.choqueDeNombre("NEV-PU2", viejo, "v1"), null);
});

prueba("LA REGLA Y LA ESCRITURA SON LA MISMA LLAMADA", () => {
  // El agujero de la fase 12 no fue que faltara la comprobación: fue que vivía
  // en un camino y la escritura en otro, y el segundo no la llamaba. `renombrar`
  // comprueba y escribe junto, así que no hay forma de escribir sin comprobar.
  const ok = N.renombrar(CIUDAD_JARDIN, "i12", "imp-99");
  assert.equal(ok.ok, true);
  assert.equal(ok.nombre, "IMP-99");                      // se guarda normalizado
  assert.equal(ok.muebles.find(f => f.id === "i12").code, "IMP-99");
  assert.equal(ok.muebles.length, CIUDAD_JARDIN.length);  // ninguno se agrega ni se borra
  // Y el rechazo no escribe NADA: no hay estado a medias.
  const no = N.renombrar(CIUDAD_JARDIN, "i12", "IMP-08");
  assert.equal(no.ok, false);
  assert.equal(no.rechazo.ocupa.id, "i08");
  assert.equal(no.muebles, undefined);
});

prueba("renombrar no toca ni una coordenada", () => {
  const plano = [{ id: "a", code: "IMP-07", cx: 3.5, cz: 8.2, w: 0.6, d: 0.6, rotY: 1.57, type: "impulsador", rentable: true }];
  const r = N.renombrar(plano, "a", "IMP-01");
  assert.equal(r.ok, true);
  const { code, ...restoDespues } = r.muebles[0];
  const { code: _c, ...restoAntes } = plano[0];
  assert.deepEqual(restoDespues, restoAntes);
});

prueba("EL AVISO DICE QUIÉN TIENE EL NOMBRE", () => {
  // Un aviso que dice «está mal» y no dice contra qué no se puede resolver. Y
  // con un solo nombre no alcanza con repetir el código del otro: el código del
  // otro ES el texto que la persona acaba de teclear.
  const r = N.choqueDeNombre("IMP-08", CIUDAD_JARDIN, "i12");
  const t = N.textoDelChoque("imp-08", r);
  assert.ok(t.includes("IMP-08"), t);
  assert.ok(t.includes("Impulsador Marca"), t);
  assert.ok(t.includes("ya lo tiene otro mueble"), t);
  // Sin `label` el aviso sigue siendo cierto, sólo menos preciso.
  const sinLabel = N.choqueDeNombre("PUN-01", [{ id: "a", code: "PUN-01" }], "b");
  assert.ok(N.textoDelChoque("PUN-01", sinLabel).includes("otro mueble de esta sede"));
  // El vacío tiene su propia explicación, no la del nombre tomado.
  assert.ok(N.textoDelChoque("", { razon: "vacio" }).includes("tiene que llamarse"));
});

console.log("\nnomenclatura · el intercambio, que es cómo se renumera a mano");

prueba("INTERCAMBIAR ESCRIBE LOS DOS NOMBRES A LA VEZ", () => {
  // Es la operación real: correr los números de una corrida. Sin ella, la regla
  // correcta vuelve imposible el trabajo normal, porque en el medio de una
  // corrida cerrada no hay ni un nombre libre con el que hacer escala.
  const r = N.intercambiarNombres(CIUDAD_JARDIN, "i12", "i08");
  assert.equal(r.find(f => f.id === "i12").code, "IMP-08");
  assert.equal(r.find(f => f.id === "i08").code, "IMP-12");
  // Y en ningún momento hay dos llamados igual: el resultado no tiene duplicados.
  assert.deepEqual(N.duplicados(r), []);
  // Ninguno se agrega ni se borra, y el conjunto de nombres es EL MISMO.
  assert.equal(r.length, CIUDAD_JARDIN.length);
  assert.deepEqual(r.map(f => f.id).sort(), CIUDAD_JARDIN.map(f => f.id).sort());
  assert.deepEqual(r.map(f => f.code).sort(), CIUDAD_JARDIN.map(f => f.code).sort());
});

prueba("intercambiar dos veces devuelve el plano original", () => {
  const ida = N.intercambiarNombres(CIUDAD_JARDIN, "i12", "i08");
  const vuelta = N.intercambiarNombres(ida, "i12", "i08");
  assert.deepEqual(vuelta, CIUDAD_JARDIN);
});

prueba("intercambiar con nadie no rompe nada", () => {
  assert.deepEqual(N.intercambiarNombres(CIUDAD_JARDIN, "i12", "i12"), CIUDAD_JARDIN);
  assert.deepEqual(N.intercambiarNombres(CIUDAD_JARDIN, "i12", "no-existe"), CIUDAD_JARDIN);
});

prueba("se entiende qué va a pasar ANTES de apretar", () => {
  // El intercambio toca DOS muebles y uno de los dos no está seleccionado.
  const t = N.textoDelIntercambio(
    { code: "IMP-12" },
    { code: "IMP-08", label: "Impulsador Marca" },
  );
  assert.ok(t.includes("IMP-08"), t);
  assert.ok(t.includes("IMP-12"), t);
  assert.ok(t.includes("Impulsador Marca"), t);
});

prueba("renumerar una corrida entera a mano, paso a paso", () => {
  // Correr IMP-08…IMP-12 un lugar hacia abajo, que es lo que se hizo a mano en
  // CIUDAD JARDIN y lo que rompió todo. Con intercambios, cada paso deja el
  // plano válido: nunca hay dos muebles llamados igual.
  let plano = CIUDAD_JARDIN.map(f => ({ ...f }));
  for (const [a, b] of [["i08", "i09"], ["i09", "i10"], ["i10", "i11"], ["i11", "i12"]]) {
    plano = N.intercambiarNombres(plano, a, b);
    assert.deepEqual(N.duplicados(plano), [], "un paso dejó dos muebles llamados igual");
  }
  assert.deepEqual(plano.map(f => f.code).sort(), CIUDAD_JARDIN.map(f => f.code).sort());
  assert.equal(plano.find(f => f.id === "i08").code, "IMP-09");
  assert.equal(plano.find(f => f.id === "i12").code, "IMP-08");
});

console.log("\nnomenclatura · qué se dibuja en el plano");

prueba("EL NOMBRE APARECE UNA VEZ, NO DOS", () => {
  // El bicho viejo: un mueble renombrado mostraba un nombre en la pastilla de
  // arriba y otro adentro de la caja. Con un solo nombre no puede volver.
  const r = N.rotulosDelPlano({ code: "ISL-03" }, true);
  assert.equal(r.adentro, "ISL-03");
  assert.equal(r.pastilla, null);
});

prueba("un mueble chico no lleva pastilla", () => {
  // Una pastilla por cada cajita deja el plano ilegible al alejarse, y no diría
  // nada que el emoji no diga: la caja se llama como el sistema la llamó.
  const r = N.rotulosDelPlano({ code: "GON-800" }, false);
  assert.equal(r.adentro, null);
  assert.equal(r.pastilla, null);
});

prueba("nunca se dibujan los dos a la vez", () => {
  for (const cabe of [true, false]) {
    const r = N.rotulosDelPlano({ code: "GON-01" }, cabe);
    assert.ok(!(r.adentro && r.pastilla));
  }
});

console.log("\nnomenclatura · un plano que YA está mal se abre y se muestra");

/** Dos muebles llamados igual. La regla lo impide de ahora en adelante, pero un
 *  plano guardado antes puede traerlo, y ahí hay que verlo. */
const PAR = [
  { id: "i08", code: "IMP-08" },
  { id: "i12", code: "IMP-08" },
];

prueba("los nombres chocados salen con la CUENTA, no con un sí/no", () => {
  // Sin la cuenta el aviso no puede decir «×2», que es lo que convierte dos
  // cajas iguales en dos cajas que se señalan entre ellas.
  const m = N.nombresChocados(PAR);
  assert.deepEqual([...m.keys()], ["IMP-08"]);
  assert.equal(m.get("IMP-08"), 2);
  // Un plano sano no reporta nada.
  assert.equal(N.nombresChocados(CIUDAD_JARDIN).size, 0);
});

prueba("LOS DOS MUEBLES QUE SE LLAMAN IGUAL MUESTRAN SU NOMBRE", () => {
  // El hallazgo grave de la fase 12: de los dos, el plano dibujaba UNA sola
  // pastilla y el otro, chico, mostraba nada más el emoji. Quien miraba el plano
  // veía un solo IMP-08, elegía, y el contrato caía en el que no era.
  const ch = N.nombresChocados(PAR);
  for (const m of PAR) {
    const r = N.rotulosDelPlano(m, false, ch);
    assert.equal(r.pastilla, "IMP-08");
    assert.equal(r.choque.veces, 2);
    assert.equal(r.choque.marca, "×2");
  }
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
      assert.ok(r.adentro || r.pastilla, `${m.code} / ${cabe}: no muestra el nombre`);
    }
  }
  const grande = N.rotulosDelPlano(PAR[0], true, ch);
  assert.equal(grande.adentro, "IMP-08");
  assert.equal(grande.pastilla, null);
  assert.equal(grande.choque.marca, "×2");
});

prueba("NO SE LLENA EL PLANO DE PASTILLAS", () => {
  // La contracara del aviso: en un plano sano tiene que haber CERO pastillas,
  // exactamente como antes de que existiera este archivo.
  const ch = N.nombresChocados(CIUDAD_JARDIN);
  const marcados = CIUDAD_JARDIN.filter(f => N.rotulosDelPlano(f, false, ch).pastilla);
  assert.deepEqual(marcados, []);
  assert.equal(N.rotulosDelPlano({ code: "GON-800" }, false, ch).choque, null);
});

prueba("sin el mapa del plano no hay choque que reportar", () => {
  // Un mueble solo no sabe con quién choca, y ningún llamador viejo empieza a
  // pintar rojo por sorpresa.
  const r = N.rotulosDelPlano(PAR[1], false);
  assert.equal(r.choque, null);
  assert.equal(r.pastilla, null);
});

prueba("tres muebles con el mismo nombre dicen ×3", () => {
  const tres = [
    { id: "a", code: "IMP-08" },
    { id: "b", code: " imp-08 " },
    { id: "c", code: "IMP-08" },
  ];
  const ch = N.nombresChocados(tres);
  assert.equal(ch.get("IMP-08"), 3);
  assert.equal(N.rotulosDelPlano(tres[1], true, ch).choque.marca, "×3");
});

prueba("el plano roto se puede renombrar para arreglarlo", () => {
  // La regla no traba el plano que ya está mal: deja arreglarlo. Renombrar uno
  // de los dos gemelos a un nombre libre lo resuelve, y renombrarlo al del otro
  // se rechaza, como cualquier otro nombre tomado.
  assert.equal(N.renombrar(PAR, "i12", "IMP-12").ok, true);
  assert.equal(N.renombrar(PAR, "i12", "IMP-08").ok, false);
  const arreglado = N.renombrar(PAR, "i12", "IMP-12").muebles;
  assert.deepEqual(N.duplicados(arreglado), []);
});

console.log("\n" + hechas + " pruebas" + (process.exitCode ? " · CON FALLAS" : " · todo en orden") + "\n");
