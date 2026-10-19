/**
 * Pruebas de vender por partes (`src/utils/partes.ts`).
 *   npm run probar:partes
 *
 * ── Por qué existe este archivo ──────────────────────────────────────────────
 *
 * La dueña pidió vender la nevera entera o por puertas, nunca las dos en las
 * mismas fechas, y eligió el código: `NEV-03-PU2` es la puerta 2 contando de
 * izquierda a derecha mirando el frente. La regla está escrita dos veces —acá,
 * para avisar en Vender antes de guardar, y en `backend/app/services/partes.py`,
 * que es el que decide— y dos reglas escritas a mano terminan diciendo cosas
 * distintas. Por eso:
 *
 *   · **Los mismos casos en los dos lados.** `casos/partes.json` lo corren esto
 *     y `tests/test_partes.py`: cómo se parte un código, qué partes ofrece un
 *     mueble, qué choca con qué, la tarifa de una puerta y los nombres que un
 *     mueble no puede tomar.
 *   · **La izquierda es la del que mira.** Se gira un mueble, se arma la cámara
 *     de `vistaDeCara` (la que ve el proveedor) y se proyecta el centro de cada
 *     puerta sobre el vector derecho de la cámara: la puerta 1 tiene que quedar
 *     a la izquierda de la 2, y la 2 de la 3, en las dos caras.
 *   · **Las clases salen del catálogo.** Con un catálogo adulterado (otro
 *     token) el código se parte con el otro token.
 *   · **Un mueble sin configuración da lo de hoy**: sus espacios son sus caras.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = join(aqui, "..");
const leer = (p) => readFileSync(p, "utf8");
const CATALOGO = JSON.parse(leer(join(raiz, "src", "catalogo", "muebles.json")));
const CASOS = JSON.parse(leer(join(aqui, "casos", "partes.json")));

let hechas = 0;
const prueba = async (n, fn) => {
  try { await fn(); hechas++; console.log("  ok   " + n); }
  catch (e) { console.error("  FALLA " + n + "\n         " + e.message.split("\n").join("\n         ")); process.exitCode = 1; }
};

/** `utils/partes.ts` (y lo que la prueba necesita de al lado), compilado; con
 *  `catalogo`, el `muebles.json` que importa es ése y no el del disco. */
const cargar = async (catalogo) => {
  const r = await build({
    stdin: {
      contents: [
        'export * from "./src/utils/partes.ts";',
        'export { vistaDeCara } from "./src/utils/planta.ts";',
        'export { vanosDePuertas, vanosDeCorrido, ventaDeNevera, montantesDeTramos, geometriaDe, cotasDeCheckout, mesaDeImpulso, nichosDeImpulso, montantesDeImpulso } from "./src/components/StoreEditor3D/muebles/medidas.ts";',
        'export { conPartes, partesConEstado, revisarCambioDePartes, cambioParaDividir, divisionSinFijar, tramosQueEntran, tramosDibujados, aplicarATodos, textoDeAplicarATodos, vendePorPartes, textoDeLoQueNuncaSeAlquila, loDeLaFicha, aplicarLoDeLaFicha, colocadosConLaFicha } from "./src/utils/partesDelMueble.ts";',
        'export { fijarFichasPropias, olvidarFichasPropias } from "./src/catalogo/propias.ts";',
        'export { PALETA_3D, paletaConPropias } from "./src/catalogo/editor3D.ts";',
        'export { MODELOS_2D, modelosDelPlanoConPropias } from "./src/catalogo/plano2D.ts";',
        'export { nombreDeTarifa } from "./src/catalogo/nombresPropios.ts";',
        'export { slotsDeLaParte, internosVendidosEnLaParte, partesQuePisa } from "./src/utils/slotsDeLasPartes.ts";',
        'export { revisarCambioDeGeometria, loVendidoDe, geometriaALaVista, confirmadasDelResumen } from "./src/utils/geometriaDelMueble.ts";',
        'export { fichaDelFormulario, formularioVacio, formularioDe, problemasDelFormulario, familiaDe } from "./src/utils/formularioDeFicha.ts";',
        'export { conFichaQuitada } from "./src/utils/guardadoDelPlano.ts";',
      ].join("\n"),
      resolveDir: raiz, loader: "ts",
    },
    bundle: true, write: false, format: "esm", platform: "neutral", logLevel: "silent",
    plugins: catalogo ? [{
      name: "catalogo-adulterado",
      setup(b) {
        b.onLoad({ filter: /[\\/]catalogo[\\/]muebles\.json$/ },
          () => ({ contents: JSON.stringify(catalogo), loader: "json" }));
      },
    }] : [],
  });
  return import("data:text/javascript;base64," + Buffer.from(r.outputFiles[0].text).toString("base64"));
};

const P = await cargar();
const sufijo = (p) => (p ? P.sufijoDeParte(p) : null);

console.log("partes · los casos compartidos con el servidor");

await prueba(`cómo se parte un código (${CASOS.codigos.length} casos)`, () => {
  for (const c of CASOS.codigos) {
    const r = P.partirCodigo(c.codigo);
    assert.deepEqual({ base: r.base, cara: r.cara, parte: sufijo(r.parte) },
      { base: c.base, cara: c.cara, parte: c.parte }, `«${c.codigo}»`);
    assert.equal(P.codigoDeParte(r.base, r.cara, r.parte), c.armado ?? c.codigo, `«${c.codigo}» no se vuelve a armar igual`);
  }
});

await prueba(`qué ofrece cada mueble en NAVE (${CASOS.muebles.length} casos)`, () => {
  for (const c of CASOS.muebles) {
    assert.deepEqual(P.espaciosDe(c.mueble, "NAVE"), c.espacios, c.nombre);
    const d = P.divisionDe(c.mueble);
    assert.deepEqual(d ? [d.clase, d.n] : null, c.division, c.nombre);
    if ("firma" in c) assert.deepEqual(P.firmaDePartes(c.mueble), c.firma, `${c.nombre}: la firma`);
    if ("carasPorParticipacion" in c) {
      assert.deepEqual([...P.carasPorParticipacion([c.mueble], "NAVE")].sort(), c.carasPorParticipacion,
        `${c.nombre}: las caras por participación`);
    }
  }
});

await prueba("la participación: no la cuenta el mueble, no tiene tarifa propia y no divide la cara", () => {
  const doble = { code: "GON-01", type: "gondola", entrepanos: 4, partes: { division: "participacion" } };
  const pc3 = P.partirCodigo("NAVE-GON-01-PC3").parte;
  assert.ok(P.esParticipacion(pc3) && !P.esDivision(pc3) && !P.esPieza(pc3), "PC3 no es una participación");
  assert.ok(!P.esParticipacion(P.partirCodigo("NAVE-GON-01-EN3").parte) && !P.esParticipacion(null));
  assert.equal(P.cantidadDe(doble, "participacion"), null);
  assert.ok(P.porParticipacion(doble) && !P.porParticipacion({ ...doble, rentable: false }));
  assert.ok(!P.porParticipacion({ code: "EXP-03", type: "isla", partes: { division: "participacion" } }),
    "una estiba no tiene receta de superficie");
  // fase 2 · I3: las dos neveras sí (y su división física guardada no la reemplaza).
  assert.ok(P.porParticipacion({ code: "NEV-03", type: "nevera_puertas", partes: { puertas: 3, division: "participacion" } }),
    "la nevera de puertas tiene receta de superficie");
  assert.ok(P.porParticipacion({ code: "BEB-03", type: "nevera_refrescos", partes: { tramos: 3, division: "participacion" } }),
    "la nevera de bebidas tiene receta de superficie");
  assert.ok(!P.porParticipacion({ code: "NEV-03", type: "nevera_puertas", partes: { puertas: 3, division: "puertas" } }),
    "una nevera por puertas pasó a venderse por participación");
  for (const type of ["impulsador", "puesto_impulso", "batea", "isla_fria", "nevera_vegetales", "nevera_carnes", "stand_frutas"]) {
    assert.ok(!P.porParticipacion({ code: "X-01", type, partes: { division: "participacion" } }), `${type} no tiene receta de superficie`);
  }
  assert.equal(P.divisionDe(doble), null);
  assert.deepEqual(P.interruptoresDeLaCara(doble, "A"), [], "Vender no ofrece partes físicas de una cara por participación");
  assert.equal(P.textoDeParte(pc3), "Participación 3");
  assert.equal(P.textoParaMontar(pc3), "Participación 3");
});

await prueba(`qué choca con qué (${CASOS.chocan.length} casos)`, () => {
  for (const c of CASOS.chocan) {
    assert.equal(P.chocan(P.partirCodigo(c.a), P.partirCodigo(c.b)), c.chocan, `${c.a} / ${c.b}: ${c.por}`);
  }
});

await prueba(`la tarifa de cada espacio y de dónde sale (${CASOS.tarifas.length} casos)`, () => {
  for (const c of CASOS.tarifas) {
    const parte = c.parte ? P.partirCodigo(`X-${c.parte}`).parte : null;
    assert.deepEqual(P.tarifaDeEspacio(c.rates, c.sede, c.mueble, parte), { valor: c.valor, origen: c.origen }, c.nombre);
  }
});

await prueba(`los nombres que un mueble no puede tomar (${CASOS.reservados.length} casos)`, () => {
  for (const c of CASOS.reservados) assert.equal(P.terminaReservado(c.nombre), c.reservado, c.nombre);
});

await prueba("qué vano del dibujo es cada parte", () => {
  for (const c of CASOS.numeracion) assert.equal(P.vanoDeParte(c.cara, c.k, c.n), c.vano, JSON.stringify(c));
  // En el dibujo de la cara (el producto de la B va girado media vuelta).
  for (const c of CASOS.enLaCara) assert.equal(P.vanoEnLaCara(c.cara, c.k, c.n), c.vano, JSON.stringify(c));
});

await prueba("de `partes` sólo pasa lo conocido, con su tipo", () => {
  for (const c of CASOS.tipadas) assert.deepEqual(P.partesTipadas(c.partes) ?? {}, c.salida, c.nombre);
});

console.log("partes · de izquierda a derecha, mirando el frente");

await prueba("la puerta 1 queda a la izquierda de quien mira, en las dos caras y con el mueble girado", () => {
  for (const rotY of [0, 0.7, Math.PI / 2, 2.4, -1.1]) {
    const f = { cx: 3, cz: -2, w: 2.07, d: 0.7, h: 2.1, rotY };
    const n = 3;
    const vanos = P.vanosDePuertas(f.w, n);
    for (const cara of ["A", "B"]) {
      const v = P.vistaDeCara(f, cara);
      const adelante = { x: v.targetX - v.posX, z: v.targetZ - v.posZ };
      // La derecha de la cámara: adelante × arriba (arriba = +Y).
      const derecha = { x: -adelante.z, z: adelante.x };
      const enPantalla = [];
      for (let k = 1; k <= n; k++) {
        const x = vanos[P.vanoDeParte(cara, k, n)].x;
        // Del mueble al mundo: el giro de three.js sobre Y.
        const wx = f.cx + x * Math.cos(rotY);
        const wz = f.cz - x * Math.sin(rotY);
        enPantalla.push(wx * derecha.x + wz * derecha.z);
      }
      for (let k = 1; k < n; k++) {
        assert.ok(enPantalla[k] > enPantalla[k - 1],
          `cara ${cara}, giro ${rotY}: la puerta ${k + 1} no queda a la derecha de la ${k} (${enPantalla.map((x) => x.toFixed(2)).join(", ")})`);
      }
    }
  }
});

console.log("partes · el contrato y la disponibilidad");

await prueba("prender una puerta apaga la entera, y la entera apaga las puertas; dos puertas conviven", () => {
  let l = [{ id: "n1", face: "A" }, { id: "g1", face: "A" }];
  l = P.alternarParte(l, { id: "n1", face: "A", parte: "PU2" });
  assert.deepEqual(l, [{ id: "g1", face: "A" }, { id: "n1", face: "A", parte: "PU2" }]);
  l = P.alternarParte(l, { id: "n1", face: "A", parte: "PU1" });
  assert.equal(l.length, 3, "dos puertas distintas tienen que convivir");
  l = P.alternarParte(l, { id: "n1", face: "A" });
  assert.deepEqual(l, [{ id: "g1", face: "A" }, { id: "n1", face: "A" }], "la entera tiene que apagar sus puertas");
  l = P.alternarParte(l, { id: "n1", face: "A" });
  assert.deepEqual(l, [{ id: "g1", face: "A" }], "tocarla de nuevo la saca");
  // Otra cara u otro mueble no se tocan.
  l = P.alternarParte([{ id: "g1", face: "B" }, { id: "n2", face: "A" }], { id: "g1", face: "A", parte: "PU1" });
  assert.equal(l.length, 3);
});

await prueba("la llave de un espacio se arma y se parte igual, con ids con guiones", () => {
  for (const [id, cara, parte] of [["n1", "A", null], ["f-12", "B", null], ["f-12", "A", "PU2"], ["a-b-c", "B", "PU10"]]) {
    const clave = P.claveDeEspacio(id, cara, parte);
    assert.deepEqual(P.partirClave(clave), { id, cara, parte });
  }
});

const nevera = { id: "n1", code: "NEV-03", type: "nevera_puertas", sede: "NAVE", partes: { puertas: 3, division: "puertas" } };
const hoy = new Date(2026, 9, 14);
const d = (s) => new Date(`${s}T00:00:00`);
const vendido = (desde, hasta) => ({
  status: "occupied", supplierName: "Postobón", brandCategory: "", negotiatedValue: 0,
  startDate: desde, endDate: hasta, observation: "",
});

await prueba("una puerta vendida: la entera no se vende en esas fechas, las otras puertas sí", () => {
  const estado = { "NAVE-NEV-03-PU2": vendido("2026-10-01", "2026-12-31") };
  const ix = P.indiceDePartes(estado);
  const dispo = (parte) => P.disponibilidadDeEspacio(nevera, "A", parte ? P.partirCodigo(`X-${parte}`).parte : null,
    estado, ix, "NAVE", d("2026-11-01"), d("2026-11-30"));
  assert.equal(dispo(null), "tomado", "la entera");
  assert.equal(dispo("PU2"), "tomado", "la misma puerta");
  assert.equal(dispo("PU1"), "libre", "otra puerta");
  // Fuera de esas fechas, la entera vuelve a estar libre.
  assert.equal(P.disponibilidadDeEspacio(nevera, "A", null, estado, ix, "NAVE", d("2027-01-01"), d("2027-01-31")), "libre");
  // La cara se pinta «parcial»: se puede vender una parte.
  assert.equal(P.disponibilidadDeCara(nevera, "A", estado, ix, "NAVE", d("2026-11-01"), d("2026-11-30")), "parcial");
});

await prueba("la nevera vendida entera tapa todas sus puertas; todas vendidas es la cara tomada", () => {
  const entera = { "NAVE-NEV-03": vendido("2026-10-01", "2026-12-31") };
  const ix = P.indiceDePartes(entera);
  const pu1 = P.partirCodigo("X-PU1").parte;
  assert.equal(P.disponibilidadDeEspacio(nevera, "A", pu1, entera, ix, "NAVE", d("2026-11-01"), d("2026-11-30")), "tomado");
  const todas = {
    "NAVE-NEV-03-PU1": vendido("2026-10-01", "2026-12-31"),
    "NAVE-NEV-03-PU2": vendido("2026-10-01", "2026-12-31"),
    "NAVE-NEV-03-PU3": vendido("2026-10-01", "2026-12-31"),
  };
  assert.equal(P.disponibilidadDeCara(nevera, "A", todas, P.indiceDePartes(todas), "NAVE", d("2026-11-01"), d("2026-11-30")), "tomado");
});

await prueba("un mueble sin configuración de partes se pinta como siempre", () => {
  const vieja = { id: "n0", code: "NEV-01", type: "nevera_puertas", sede: "NAVE", partes: { puertas: 2 } };
  const estado = { "NAVE-NEV-01": vendido("2026-11-10", "2026-11-20") };
  const ix = P.indiceDePartes(estado);
  assert.equal(P.disponibilidadDeCara(vieja, "A", estado, ix, "NAVE", d("2026-11-01"), d("2026-11-30")), "parcial");
  assert.equal(P.disponibilidadDeCara(vieja, "A", {}, P.indiceDePartes({}), "NAVE", d("2026-11-01"), d("2026-11-30")), "libre");
  assert.deepEqual(P.espaciosDe(vieja, "NAVE"), ["NAVE-NEV-01"]);
});

await prueba("los textos de una parte dicen cuál, nunca de quién", () => {
  const pu2 = P.partirCodigo("NEV-03-PU2").parte;
  assert.equal(P.textoDeParte(pu2, 3), "Puerta 2 de 3");
  assert.equal(P.textoParaMontar(pu2, 3), "Puerta 2 de 3, contando de izquierda a derecha mirando el frente");
  assert.equal(P.codigoVisibleDe("NEV-03", "A", false, pu2), "NEV-03·PU2");
  assert.equal(P.codigoVisibleDe("GON-05", "B", true, null), "GON-05·B");
  assert.equal(P.codigoVisibleDe("PUN-01", "A", false, null), "PUN-01");
  void hoy;
});

await prueba("la cara se lee de lo que trae el mueble fusionado; la parte, del mapa crudo", () => {
  // Antes de que llegue el mapa (o si no llega), el plano pinta lo que el
  // mueble trae pegado por la fusión: un mueble sin partes da lo de siempre.
  const fusionada = { ...nevera, status: "occupied", startDate: "2026-11-01", endDate: "2026-11-30" };
  const vacio = {};
  assert.equal(P.disponibilidadDeCara(fusionada, "A", vacio, P.indiceDePartes(vacio), "NAVE", d("2026-11-01"), d("2026-11-30")), "tomado");
  assert.equal(P.porQueNoEstaLibre(fusionada, "A", null, vacio, P.indiceDePartes(vacio), "NAVE", d("2026-11-01"), d("2026-11-30")), "propio");
  // Una puerta con la entera vendida: «entera»; la entera con una puerta vendida: «partes».
  const pu2 = { "NAVE-NEV-03-PU2": vendido("2026-10-01", "2026-12-31") };
  const pu1 = P.partirCodigo("X-PU1").parte;
  assert.equal(P.porQueNoEstaLibre(fusionada, "A", pu1, vacio, P.indiceDePartes(vacio), "NAVE", d("2026-11-01"), d("2026-11-30")), "entera");
  assert.equal(P.porQueNoEstaLibre(nevera, "A", null, pu2, P.indiceDePartes(pu2), "NAVE", d("2026-11-01"), d("2026-11-30")), "partes");
  assert.equal(P.porQueNoEstaLibre(nevera, "A", pu1, pu2, P.indiceDePartes(pu2), "NAVE", d("2026-11-01"), d("2026-11-30")), null);
});

console.log("partes · el panel «Cómo se vende»");

await prueba("con una puerta vendida no cambian ni las puertas ni la forma, y no se nombra a nadie", () => {
  const pu2 = { "NAVE-NEV-03-PU2": vendido("2026-10-01", "2099-12-31") };
  for (const cambio of [{ puertas: 4 }, { puertas: 2 }, { division: null }]) {
    const r = P.revisarCambioDePartes(nevera, cambio, pu2, "NAVE");
    assert.ok(r.bloqueo, `${JSON.stringify(cambio)} pasó con la PU2 vendida`);
    assert.ok(!/Postob/i.test(r.bloqueo), "el bloqueo nombra al proveedor");
  }
  // Una PU3 vendida de antes, aunque hoy no se ofrezca, también frena.
  const dos = { ...nevera, partes: { puertas: 2, division: "puertas" } };
  assert.ok(P.revisarCambioDePartes(dos, { puertas: 3 }, { "NAVE-NEV-03-PU3": vendido("2026-10-01", "2099-12-31") }, "NAVE").bloqueo);
  // Sin nada vendido, pasa; lo libre (o de otra nevera) no frena.
  assert.deepEqual(P.revisarCambioDePartes(nevera, { puertas: 4 }, {}, "NAVE"), { bloqueo: null, aviso: null });
  assert.deepEqual(P.revisarCambioDePartes(nevera, { puertas: 4 }, { "NAVE-NEV-033-PU2": vendido("2026-10-01", "2099-12-31") }, "NAVE"),
    { bloqueo: null, aviso: null });
  // Con la nevera vendida ENTERA, cambiar las puertas avisa y deja seguir.
  const entera = P.revisarCambioDePartes(nevera, { puertas: 4 }, { "NAVE-NEV-03": vendido("2026-10-01", "2099-12-31") }, "NAVE");
  assert.equal(entera.bloqueo, null);
  assert.ok(entera.aviso);
});

await prueba("«Cómo se vende» escribe `partes` entera, sin perder lo que no conoce", () => {
  const plano = [{ id: "a", partes: { puertas: 3, otra: 1 } }, { id: "b" }];
  const r = P.conPartes(plano, "a", { division: "puertas" });
  assert.deepEqual(r[0].partes, { puertas: 3, otra: 1, division: "puertas" });
  assert.equal(r[1], plano[1], "tocó otro mueble");
  assert.equal(P.conPartes(plano, "zz", { division: "puertas" }), plano, "un id que no está no rehace el plano");
  // Qué puertas están vendidas, sin nombres ni fechas.
  const estado = { "NAVE-NEV-03-PU2": vendido("2026-10-01", "2099-12-31") };
  assert.deepEqual(P.partesConEstado(nevera, estado, "NAVE").map((p) => [p.sufijo, p.vendida]),
    [["PU1", false], ["PU2", true], ["PU3", false]]);
  for (const p of P.partesConEstado(nevera, estado, "NAVE")) assert.deepEqual(Object.keys(p).sort(), ["codigo", "pieza", "sufijo", "vendida"]); // `pieza`: si es de una caja o una columna, sin nombres
});

await prueba("deshacer «por puertas» manda `division: null` adentro de `partes`", () => {
  const actual = [{ id: "a", type: "nevera_puertas", partes: { puertas: 3, division: "puertas" } }];
  const repuesto = [{ id: "a", type: "nevera_puertas", partes: { puertas: 3 } }];
  const r = P.conFichaQuitada(repuesto, actual);
  assert.deepEqual(r[0].partes, { puertas: 3, division: null });
  // Sin nada que quitar, el mismo arreglo.
  assert.equal(P.conFichaQuitada(actual, actual), actual);
});

console.log("partes · las clases salen del catálogo");

await prueba("con otro token en el catálogo, el código se parte con el otro", async () => {
  const otro = structuredClone(CATALOGO);
  otro.partes.clases.puertas.token = "PX";
  const Q = await cargar(otro);
  assert.equal(Q.partirCodigo("NEV-03-PX2").parte?.clase, "puertas");
  assert.equal(Q.partirCodigo("NEV-03-PU2").parte, null);
  const sinPuertas = structuredClone(CATALOGO);
  sinPuertas.tipos.nevera_puertas.partes.divisiones = [];
  const R = await cargar(sinPuertas);
  assert.deepEqual(R.espaciosDe(nevera, "NAVE"), ["NAVE-NEV-03"], "sin la división en la familia, entera");
});

console.log("partes · paso 2: tramos y entrepaños");

/** El contorno de las partes en el visor: `muebles/contornos.ts` trae la
 *  venta de la góndola (React y three), compilada para Node como en
 *  `probar-muebles`. */
const compiladoC = await build({
  entryPoints: [join(raiz, "src", "components", "StoreEditor3D", "muebles", "contornos.ts")],
  bundle: true, write: false, format: "esm", platform: "node", jsx: "automatic", logLevel: "silent",
});
const C = await import("data:text/javascript;base64," + Buffer.from(compiladoC.outputFiles[0].text).toString("base64"));

const gondola = (extra = {}) => ({
  id: "g1", code: "GON-05", type: "gondola", gondolaType: "double", sede: "NAVE", w: 3.75, d: 0.9, h: 2.0,
  partes: { tramos: 3, division: "tramos" }, ...extra,
});

await prueba("el tramo 1 queda a la izquierda de quien mira, en las dos caras, con el producto de la B girado", () => {
  // El producto de cada cara va en su grupo: el de la A sin girar, el de la B
  // girado media vuelta (`ProductoDePrueba`). En ese dibujo, el tramo k es el
  // vano `vanoEnLaCara`; se lleva al mueble y al mundo, y se proyecta con la
  // cámara de venta de esa cara.
  for (const rotY of [0, 0.7, Math.PI / 2, 2.4, -1.1]) {
    const f = { cx: 3, cz: -2, w: 3.75, d: 0.9, h: 2.0, rotY };
    const n = 3;
    const vanos = P.vanosDeCorrido(f.w, undefined, n);
    for (const cara of ["A", "B"]) {
      const v = P.vistaDeCara(f, cara);
      const adelante = { x: v.targetX - v.posX, z: v.targetZ - v.posZ };
      const derecha = { x: -adelante.z, z: adelante.x };
      const enPantalla = [];
      for (let k = 1; k <= n; k++) {
        const xGrupo = vanos[P.vanoEnLaCara(cara, k, n)].x;
        const x = cara === "B" ? -xGrupo : xGrupo;   // el grupo de la B, girado
        const wx = f.cx + x * Math.cos(rotY);
        const wz = f.cz - x * Math.sin(rotY);
        enPantalla.push(wx * derecha.x + wz * derecha.z);
      }
      for (let k = 1; k < n; k++) {
        assert.ok(enPantalla[k] > enPantalla[k - 1],
          `cara ${cara}, giro ${rotY}: el tramo ${k + 1} no queda a la derecha del ${k} (${enPantalla.map((x) => x.toFixed(2)).join(", ")})`);
      }
      // Y en el mueble, la cuenta de `vanoDeParte` (la del plano 2D y los
      // espacios internos) cae en el mismo lugar.
      for (let k = 1; k <= n; k++) {
        const xGrupo = vanos[P.vanoEnLaCara(cara, k, n)].x;
        const x = cara === "B" ? -xGrupo : xGrupo;
        assert.ok(Math.abs(x - vanos[P.vanoDeParte(cara, k, n)].x) < 1e-9, `cara ${cara}: el tramo ${k} cae en dos lugares`);
      }
    }
  }
});

await prueba("los tramos parten el corrido en tramos iguales, mande lo que mande el módulo", () => {
  assert.deepEqual(P.vanosDeCorrido(3.75, 1.25).length, 3);
  const tres = P.vanosDeCorrido(3.75, 0.9, 3);
  assert.equal(tres.length, 3, "el módulo le ganó a los tramos");
  assert.ok(Math.abs(tres[1].x) < 1e-9 && Math.abs(tres[0].x + 1.25) < 1e-9);
  // Sin tramos (o con un número que no es de tramos), la cuenta de siempre.
  assert.deepEqual(P.vanosDeCorrido(3.75, 0.9, undefined), P.vanosDeCorrido(3.75, 0.9));
  assert.deepEqual(P.vanosDeCorrido(3.75, 0.9, 0), P.vanosDeCorrido(3.75, 0.9));
  assert.deepEqual(P.vanosDeCorrido(3.75, 0.9, 2.5), P.vanosDeCorrido(3.75, 0.9));
  assert.deepEqual(P.vanosDeCorrido(3.75, 0.9, 41), P.vanosDeCorrido(3.75, 0.9));
  // La nevera abierta: un vano por tramo y un montante en cada junta.
  assert.equal(P.ventaDeNevera(2.5, 0.8, 2.0).vanos.length, 1, "sin tramos, el frente corrido de siempre");
  const dos = P.ventaDeNevera(2.5, 0.8, 2.0, undefined, 2).vanos;
  assert.equal(dos.length, 2);
  assert.deepEqual(P.montantesDeTramos(2.4, 2), [0]);
  assert.deepEqual(P.montantesDeTramos(2.4, undefined), []);
  assert.ok(dos[0].x + dos[0].ancho / 2 < 0 && dos[1].x - dos[1].ancho / 2 > 0, "un vano pisa el montante");
  // La geometría del mueble los lee de `partes`, sólo si son tramos de verdad.
  assert.equal(P.geometriaDe({ partes: { tramos: 3 } }).tramos, 3);
  assert.equal(P.geometriaDe({ partes: { tramos: "3" } }).tramos, undefined);
  assert.equal(P.geometriaDe({ partes: null }).tramos, undefined);
});

await prueba("elegir «por tramos» escribe los que se dibujan; «por entrepaños», los entrepaños si faltan", () => {
  // Una góndola de 3,75 sin tramos guardados: tres módulos de 1,25.
  const g = gondola({ partes: null });
  assert.deepEqual(P.cambioParaDividir(g, "tramos"), { cambio: { division: "tramos", tramos: 3 } });
  // Una nevera abierta de 2,50: dos tramos de 1,25.
  const beb = { id: "b1", code: "BEB-01", type: "nevera_refrescos", w: 2.5, d: 0.8, h: 2.0 };
  assert.deepEqual(P.cambioParaDividir(beb, "tramos"), { cambio: { division: "tramos", tramos: 2 } });
  // Un tramo cada 60 cm como mínimo: el mural de 26 m admite 40; uno de 1 m, 2.
  assert.equal(P.tramosQueEntran({ ...beb, w: 26.05 }), 40);
  assert.equal(P.tramosQueEntran({ ...beb, w: 1.0 }), 2);
  // Por entrepaños sin entrepaños guardados: escribe los que se dibujan.
  const conCuenta = P.cambioParaDividir(gondola({ partes: null }), "entrepanos");
  assert.equal(conCuenta.cambio.division, "entrepanos");
  assert.equal(conCuenta.cambio.entrepanos, P.geometriaALaVista({ ...gondola(), partes: null }).entrepanos);
  // Con entrepaños guardados, sólo la forma.
  assert.deepEqual(P.cambioParaDividir(gondola({ entrepanos: 4 }), "entrepanos"), { cambio: { division: "entrepanos" } });
  // Una nevera de una puerta no se divide.
  assert.ok("problema" in P.cambioParaDividir({ ...nevera, w: 0.7, partes: { puertas: 1 } }, "puertas"));
  // La ficha pidió «por tramos» y nadie los fijó: se dice, y se vende entera.
  assert.equal(P.divisionSinFijar(gondola({ partes: { division: "tramos" } })), "tramos");
  assert.equal(P.divisionSinFijar(gondola()), null);
  assert.deepEqual(P.espaciosDe(gondola({ partes: { division: "tramos" } }), "NAVE"), ["NAVE-GON-05", "NAVE-GON-05-B"]);
});

await prueba("con un tramo vendido no cambian los tramos ni la forma; dicho bien y sin nombres", () => {
  const tr2 = { "NAVE-GON-05-B-TR2": vendido("2026-10-01", "2099-12-31") };
  for (const cambio of [{ tramos: 4 }, { tramos: 2 }, { division: null }, { division: "entrepanos", entrepanos: 4 }]) {
    const r = P.revisarCambioDePartes(gondola(), cambio, tr2, "NAVE");
    assert.ok(r.bloqueo, `${JSON.stringify(cambio)} pasó con el TR2 de la B vendido`);
    assert.match(r.bloqueo, /un tramo vendido/, "el bloqueo no concuerda con el tramo");
    assert.ok(!/Postob/i.test(r.bloqueo), "el bloqueo nombra al proveedor");
  }
  // Sin nada vendido de esa clase, pasa (una puerta vendida de otro mueble no cuenta).
  assert.deepEqual(P.revisarCambioDePartes(gondola(), { tramos: 4 }, {}, "NAVE"), { bloqueo: null, aviso: null });
  // Con la cara B vendida entera, cambiar los tramos avisa.
  const b = P.revisarCambioDePartes(gondola(), { tramos: 4 }, { "NAVE-GON-05-B": vendido("2026-10-01", "2099-12-31") }, "NAVE");
  assert.equal(b.bloqueo, null);
  assert.match(b.aviso ?? "", /vendida entera/);
  // Dividir un mueble con espacios internos vendidos avisa que pueden caer encima.
  const conInternos = gondola({ partes: null, slots: [{ x: 0, w: 0.5, y: 0, h: 0.5, status: "occupied" }] });
  const r = P.revisarCambioDePartes(conInternos, { division: "tramos", tramos: 3 }, {}, "NAVE");
  assert.match(r.aviso ?? "", /espacio interno vendido/);
});

await prueba("con un entrepaño vendido, «Entrepaños» no cambia la cantidad; el alto sí, con aviso", () => {
  const g = gondola({ entrepanos: 4, partes: { division: "entrepanos" }, status: "free" });
  const en2 = { "NAVE-GON-05-EN2": vendido("2026-10-01", "2099-12-31") };
  const vendido_ = P.loVendidoDe(g, "NAVE", new Set(), en2);
  assert.deepEqual(vendido_.partes, ["EN2"]);
  for (const cambio of [{ entrepanos: 5 }, { entrepanos: 3 }, { entrepanos: null }]) {
    const r = P.revisarCambioDeGeometria(g, cambio, vendido_);
    assert.ok(r.bloqueo, `${JSON.stringify(cambio)} pasó con el EN2 vendido`);
    assert.ok(!/Postob/i.test(r.bloqueo));
  }
  const alto = P.revisarCambioDeGeometria(g, { h: 2.2 }, vendido_);
  assert.equal(alto.bloqueo, null);
  assert.ok(alto.aviso && alto.aviso.lineas.some((l) => l.includes("EN2")), "el alto no avisa de la parte vendida");
  // Sin partes vendidas, como siempre.
  assert.equal(P.revisarCambioDeGeometria(g, { entrepanos: 5 }, P.loVendidoDe(g, "NAVE", new Set(), {})).bloqueo, null);
  // Vendida por tramos, el módulo sale de los tramos.
  const v = P.geometriaALaVista({ ...gondola(), modulo: 0.9 });
  assert.equal(v.porTramos, true);
  assert.equal(v.modulos, 3);
});

await prueba("qué espacio interno cae en qué tramo o entrepaño (la regla del relleno)", () => {
  const izquierda = { x: 0, w: 0.3, y: 0, h: 1, status: "occupied" };   // −X del mueble
  const g = gondola({ slots: [izquierda] });
  const tr = (k) => ({ clase: "tramos", token: "TR", n: k });
  // En la A, −X es la derecha de quien mira: el TR3; en la B, el TR1.
  assert.equal(P.internosVendidosEnLaParte(g, "A", tr(3)), 1);
  assert.equal(P.internosVendidosEnLaParte(g, "A", tr(1)), 0);
  assert.equal(P.internosVendidosEnLaParte(g, "B", tr(1)), 1);
  assert.deepEqual(P.partesQuePisa(g, izquierda, ["A", "B"]).map((p) => `${p.cara}${p.parte.n}`), ["A3", "B1"]);
  // La entera: todos, como siempre. Uno libre no cuenta como vendido.
  assert.equal(P.slotsDeLaParte(g, "A", null).length, 1);
  assert.equal(P.internosVendidosEnLaParte(gondola({ slots: [{ ...izquierda, status: "free" }] }), "A", tr(3)), 0);
  // Por entrepaños: la base es el EN1; un espacio interno de la mitad de abajo cae en la base.
  const e = gondola({ entrepanos: 4, partes: { division: "entrepanos" }, slots: [{ x: 0, w: 1, y: 0, h: 0.2, status: "occupied" }] });
  const en = (k) => ({ clase: "entrepanos", token: "EN", n: k });
  assert.equal(P.internosVendidosEnLaParte(e, "A", en(1)), 1, "la base no recibe el espacio interno de abajo");
  assert.equal(P.internosVendidosEnLaParte(e, "A", en(5)), 0);
});

await prueba("Vender: prender un tramo apaga la entera; dos tramos conviven; los entrepaños, igual", () => {
  let l = [{ id: "g1", face: "B" }];
  l = P.alternarParte(l, { id: "g1", face: "B", parte: "TR2" });
  assert.deepEqual(l, [{ id: "g1", face: "B", parte: "TR2" }]);
  l = P.alternarParte(l, { id: "g1", face: "B", parte: "TR1" });
  assert.equal(l.length, 2);
  l = P.alternarParte(l, { id: "g1", face: "A", parte: "EN1" });
  assert.equal(l.length, 3, "la cara A no se toca");
  // Una sola forma: un entrepaño de la misma cara apaga los tramos.
  l = P.alternarParte(l, { id: "g1", face: "B", parte: "EN2" });
  assert.deepEqual(l.filter((x) => x.face === "B"), [{ id: "g1", face: "B", parte: "EN2" }]);
});

await prueba("la disponibilidad de un entrepaño y de su cara, sin nombres", () => {
  const p = { id: "p1", code: "PUN-02", type: "punta", sede: "NAVE", entrepanos: 3, partes: { division: "entrepanos" } };
  const estado = { "NAVE-PUN-02-EN1": vendido("2026-10-01", "2026-12-31") };
  const ix = P.indiceDePartes(estado);
  const en = (k) => P.partirCodigo(`X-EN${k}`).parte;
  assert.equal(P.disponibilidadDeEspacio(p, "A", null, estado, ix, "NAVE", d("2026-11-01"), d("2026-11-30")), "tomado");
  assert.equal(P.disponibilidadDeEspacio(p, "A", en(2), estado, ix, "NAVE", d("2026-11-01"), d("2026-11-30")), "libre");
  assert.equal(P.disponibilidadDeCara(p, "A", estado, ix, "NAVE", d("2026-11-01"), d("2026-11-30")), "parcial");
  assert.equal(P.porQueNoEstaLibre(p, "A", null, estado, ix, "NAVE", d("2026-11-01"), d("2026-11-30")), "partes");
  assert.equal(P.textoParaMontar(en(1), 4), "Entrepaño 1 de 4, contando de abajo hacia arriba (el 1 es la base)");
  assert.equal(P.textoParaMontar(P.partirCodigo("X-TR2").parte, 3), "Tramo 2 de 3, contando de izquierda a derecha mirando el frente");
  assert.deepEqual(P.concordancia("tramos"), { un: "un", el: "el", los: "los", o: "o", este: "este" });
  assert.equal(P.concordancia("puertas").o, "a");
});

await prueba("el contorno de la parte en el visor cae donde va el producto, en las dos caras", () => {
  const geo = { tramos: 3 };
  // El tramo 1 de la A (vano 2 del dibujo de la cara) está en +X; el de la B, en −X.
  const a = C.contornosDeLasPartes("gondola", 3.75, 0.9, 2.0, "double", geo, "A", [P.vanoEnLaCara("A", 1, 3)]);
  const b = C.contornosDeLasPartes("gondola", 3.75, 0.9, 2.0, "double", geo, "B", [P.vanoEnLaCara("B", 1, 3)]);
  assert.equal(a.length, 1);
  assert.ok(a[0].cx > 1 && b[0].cx < -1, `el TR1 de la A en ${a[0].cx}, el de la B en ${b[0].cx}`);
  assert.ok(a[0].z < 0 && b[0].z > 0, "cada contorno va en el frente de su cara");
  // Un entrepaño: toda la cara de ancho, la altura de su fila.
  const e = C.contornosDeLasPartes("punta", 0.9, 0.4, 1.8, undefined, { entrepanos: 3 }, "A", undefined, [0]);
  assert.equal(e.length, 1);
  assert.ok(e[0].ancho > 0.7 && e[0].alto > 0.1 && e[0].cy < 0.6, JSON.stringify(e[0]));
  // Sin partes, ninguno; la nevera de vegetales, por sus tramos.
  assert.deepEqual(C.contornosDeLasPartes("gondola", 3.75, 0.9, 2.0, "double", geo, "A"), []);
  assert.equal(C.contornosDeLasPartes("nevera_vegetales", 2.5, 0.9, 1.6, undefined, { tramos: 2 }, "A", [0]).length, 1);
  // La nevera abierta (multideck) por tramos: un vano por tramo, del mismo
  // ancho, uno al lado del otro. Sin los tramos en su venta, un vano solo.
  const m = C.contornosDeLasPartes("nevera_refrescos", 2.5, 0.8, 2.0, undefined, { tramos: 3 }, "A", [0, 1, 2]);
  assert.equal(m.length, 3, "la multideck por tramos no tiene un vano por tramo");
  assert.ok(Math.abs(m[0].ancho - m[2].ancho) < 1e-9 && m[0].ancho < 0.85, JSON.stringify(m.map((x) => x.ancho)));
  assert.ok(new Set(m.map((x) => x.cx.toFixed(3))).size === 3, "los tramos de la multideck caen uno encima del otro");
});

await prueba("el taller: la ficha propia dice cómo se vende, y la de la góndola no lleva los tramos", () => {
  const beb = { ...P.formularioVacio("nevera_refrescos"), nombre: "Multideck", clave: "multideck", division: "tramos", tramos: "2",
    nota: "x", confiabilidad: "ficha" };
  assert.deepEqual(P.fichaDelFormulario(beb).partes, { tramos: 2, division: "tramos" });
  assert.deepEqual(P.problemasDelFormulario(beb), []);
  const g = { ...P.formularioVacio("gondola:wall"), nombre: "Góndola", division: "tramos", tramos: "4",
    nota: "x", confiabilidad: "ficha" };
  assert.deepEqual(P.fichaDelFormulario(g).partes, { division: "tramos" }, "los tramos de la góndola viajaron en la ficha");
  // Una división que su familia no admite no viaja.
  assert.equal(P.fichaDelFormulario({ ...g, division: "puertas" }).partes, undefined);
  // Por entrepaños sin entrepaños: el formulario lo marca en «Cómo se vende».
  const sinEntrepanos = { ...g, division: "entrepanos" };
  assert.ok(P.problemasDelFormulario(sinEntrepanos).some((x) => x.campo === "partes.division"));
  // Y vuelve igual al editarla.
  const ida = P.formularioDe({ id: "cli:x", clave: "x", tipo: "nevera_refrescos", nombre: "M", w: 2.5, d: 0.8, h: 2,
    partes: { tramos: 2, division: "tramos" }, fuente: { confiabilidad: "ficha" }, retirado: false });
  assert.equal(ida.division, "tramos");
  assert.equal(ida.tramos, "2");
});

/** El panel del espacio interno (Editor 3D) es JSX dentro de un componente de
 *  miles de líneas: no se monta acá. Se lee el código: en un mueble que se
 *  vende por tramos o entrepaños, un espacio interno libre no se marca
 *  vendido (ni con el menú ni escribiendo un proveedor); el ya marcado sí se
 *  libera. */
await prueba("el Editor 3D no marca vendido un espacio interno nuevo en un mueble que se vende por partes", () => {
  const ed = leer(join(raiz, "src", "components", "StoreEditor3D", "StoreEditor3D.tsx"));
  assert.match(ed, /const porPartes = !!divisionDelMueble && \(divisionDelMueble\.clase === "tramos" \|\| divisionDelMueble\.clase === "entrepanos"\);/,
    "el panel ya no sabe si el mueble se vende por tramos o entrepaños");
  assert.match(ed, /const noSeMarcaVendido = porPartes && selectedSlot\.status === "free";/,
    "un espacio interno libre se puede marcar vendido en un mueble que se vende por partes");
  for (const estado of ["occupied", "reserved"]) {
    assert.match(ed, new RegExp(`<option value="${estado}" disabled=\\{noSeMarcaVendido\\}>`), `«${estado}» se puede elegir igual`);
  }
  assert.match(ed, /selectedSlot\.status==="free" && !noSeMarcaVendido/, "escribir un proveedor lo marca vendido igual");
  // Y lo que ya pisa una parte con contrato se avisa con el mapa crudo.
  assert.match(ed, /partesQuePisa\(fix, selectedSlot, [^\n]*\n\s*\.filter\(\(\{ cara, parte \}\) => estadoCrudo\[/,
    "el aviso de la parte con contrato no sale del mapa crudo de la base");
});

console.log("partes · paso 3: las piezas de lo que no se vende entero");

const caja = (extra = {}) => ({
  id: "c1", code: "CAJ-04", type: "checkout", sede: "NAVE", w: 1.8, d: 0.7, h: 0.9, partes: { bahias: 2 }, ...extra,
});
const columna = (extra = {}) => ({
  id: "k1", code: "COL-07", type: "columna", sede: "NAVE", w: 0.4, d: 0.4, h: 3.0, partes: { forro: true }, ...extra,
});

await prueba("la caja y la columna no se venden enteras, sus piezas sí: Vender las deja tocar", () => {
  assert.equal(P.seVendeAlgo(caja()), true, "una caja con bahías no se deja tocar en Vender");
  assert.equal(P.seVendeAlgo(caja({ partes: undefined })), false, "una caja de un plano de antes se volvió vendible");
  assert.equal(P.seVendeAlgo(columna()), true);
  assert.equal(P.seVendeAlgo(columna({ partes: { forro: false } })), false);
  assert.equal(P.seVendeAlgo({ id: "s1", code: "SAC-01", type: "servicio_cliente", partes: { bahias: 2, forro: true } }), false);
  // Sus espacios son sólo las piezas, en la cara A: nunca la caja.
  assert.deepEqual(P.espaciosDe(caja(), "NAVE"), ["NAVE-CAJ-04-BI1", "NAVE-CAJ-04-BI2"]);
  assert.deepEqual(P.partesDe(caja()).map((p) => p.cara), ["A", "A"]);
  assert.deepEqual(P.piezasDe(columna()).map(P.sufijoDeParte), ["FO"]);
  // Una pieza no es una división: no parte ninguna cara.
  assert.ok(P.partesDe(caja()).every((p) => P.esPieza(p.parte) && !P.esDivision(p.parte)));
});

await prueba("dos bahías conviven en el contrato y ninguna apaga a la otra", () => {
  let l = P.alternarParte([], { id: "c1", face: "A", parte: "BI1" });
  l = P.alternarParte(l, { id: "c1", face: "A", parte: "BI2" });
  assert.equal(l.length, 2, "la bahía 2 apagó la 1");
  l = P.alternarParte(l, { id: "c1", face: "A", parte: "BI1" });
  assert.deepEqual(l, [{ id: "c1", face: "A", parte: "BI2" }], "tocarla de nuevo la saca");
});

await prueba("la bahía 1 queda a la izquierda de quien mira la caja desde la fila, con la caja girada", () => {
  // Quien hace la fila está del lado del cliente (−Z de la caja) mirando hacia
  // +Z: la cámara de la cara A. La BI k es el nicho `vanoDeParte("A", k, n)`.
  for (const rotY of [0, 0.7, Math.PI / 2, 2.4, -1.1]) {
    const f = { cx: 3, cz: -2, w: 1.8, d: 0.7, h: 0.9, rotY };
    for (const n of [2, 3, 4]) {
      const nichos = P.nichosDeImpulso(P.mesaDeImpulso(f.w, P.cotasDeCheckout(f.w, f.d, f.h)), n);
      const v = P.vistaDeCara(f, "A");
      const adelante = { x: v.targetX - v.posX, z: v.targetZ - v.posZ };
      const derecha = { x: -adelante.z, z: adelante.x };
      const enPantalla = [];
      for (let k = 1; k <= n; k++) {
        const x = nichos[P.vanoDeParte("A", k, n)].x;
        enPantalla.push((f.cx + x * Math.cos(rotY)) * derecha.x + (f.cz - x * Math.sin(rotY)) * derecha.z);
      }
      for (let k = 1; k < n; k++) {
        assert.ok(enPantalla[k] > enPantalla[k - 1], `giro ${rotY}, ${n} bahías: la BI${k + 1} no queda a la derecha de la BI${k}`);
      }
    }
  }
});

await prueba("las bahías parten la mesa en nichos iguales; sin bahías, el dibujo de siempre", () => {
  const c = P.mesaDeImpulso(1.8, P.cotasDeCheckout(1.8, 0.7, 0.9));
  for (const n of [1, 2, 3, 4]) {
    const nichos = P.nichosDeImpulso(c, n);
    assert.equal(nichos.length, n);
    assert.equal(P.montantesDeImpulso(c, n).length, n - 1, `${n} bahías: un montante entre cada par`);
    const desde = c.xMesa - c.anchoDeMesa / 2;
    assert.ok(Math.abs(nichos[0].x - (desde + c.anchoDeMesa / n / 2)) < 1e-9, "el primer nicho no arranca en la punta");
    assert.ok(nichos.every((v) => Math.abs(v.ancho - nichos[0].ancho) < 1e-9), "nichos desparejos");
  }
  // La geometría las lee de 1 a 4; lo demás no se dibuja (como no se vende).
  assert.equal(P.geometriaDe({ partes: { bahias: 3 } }).bahias, 3);
  assert.equal(P.geometriaDe({ partes: { bahias: 5 } }).bahias, undefined);
  assert.equal(P.geometriaDe({ partes: { bahias: true } }).bahias, undefined);
  assert.equal(P.geometriaDe({ partes: { forro: true } }).forro, true);
  assert.equal(P.geometriaDe({ partes: { forro: "si" } }).forro, undefined);
  // El dibujo: con `bahias`, los montantes de la cuenta; sin ellas, el de
  // siempre al 10 %. Y el despachador le pasa las bahías y el forro.
  const ck = leer(join(raiz, "src", "components", "StoreEditor3D", "muebles", "CheckoutReal.tsx"));
  assert.match(ck, /const montantes = bahias \? montantesDeImpulso\(mesaDeLaCaja, bahias\) : \[xMesa \+ anchoDeMesa \* 0\.1\];/,
    "la caja dejó de partir la mesa con las bahías del plano, o cambió el dibujo de siempre");
  const ed = leer(join(raiz, "src", "components", "StoreEditor3D", "StoreEditor3D.tsx"));
  assert.match(ed, /case "checkout":\s+return <CheckoutMesh\s+\{\.\.\.base\} bahias=\{geometria\.bahias\} \/>;/, "la caja del 3D no recibe sus bahías");
  assert.match(ed, /case "columna":\s+return <ColumnaMesh\s+\{\.\.\.base\} forro=\{geometria\.forro\} \/>;/, "la columna del 3D no recibe su forro");
  assert.match(ed, /\{forro && \(\(\) => \{/, "la columna dibuja el forro aunque no lo tenga");
});

await prueba("una bahía vendida: las otras y la caja siguen libres; el forro, sólo consigo mismo", () => {
  const estado = { "NAVE-CAJ-04-BI1": vendido("2026-10-01", "2026-12-31") };
  const ix = P.indiceDePartes(estado);
  const dispo = (f, suf) => P.disponibilidadDeEspacio(f, "A", P.partirCodigo(`X-${suf}`).parte, estado, ix, "NAVE",
    d("2026-11-01"), d("2026-11-30"));
  assert.equal(dispo(caja(), "BI1"), "tomado");
  assert.equal(dispo(caja(), "BI2"), "libre", "una bahía vendida tapó la otra");
  assert.equal(P.porQueNoEstaLibre(caja(), "A", P.partirCodigo("X-BI1").parte, estado, ix, "NAVE", d("2026-11-01"), d("2026-11-30")), "propio");
  assert.equal(dispo(columna(), "FO"), "libre");
});

await prueba("con una bahía vendida no cambia la cantidad de bahías; con el forro vendido, no se saca", () => {
  const estado = { "NAVE-CAJ-04-BI1": { ...vendido("2026-10-01", "2026-12-31"), status: "occupied" } };
  const r = P.revisarCambioDePartes(caja(), { bahias: 3 }, estado, "NAVE");
  assert.ok(r.bloqueo && /una bahía de impulso vendida/.test(r.bloqueo) && /no cambia/.test(r.bloqueo), r.bloqueo);
  assert.ok(!/Postob/.test(r.bloqueo), "el bloqueo nombra al proveedor");
  assert.ok(P.revisarCambioDePartes(caja(), { bahias: null }, estado, "NAVE").bloqueo, "sacar las bahías con una vendida se dejó");
  assert.equal(P.revisarCambioDePartes(caja(), { bahias: 3 }, {}, "NAVE").bloqueo, null, "sin nada vendido, se cambia");
  const conForro = { "NAVE-COL-07-FO": vendido("2026-10-01", "2026-12-31") };
  const f = P.revisarCambioDePartes(columna(), { forro: null }, conForro, "NAVE");
  assert.ok(f.bloqueo && /el forro vendido/.test(f.bloqueo), f.bloqueo);
});

await prueba("«Aplicar a todas las cajas de la sede» salta las que tienen una bahía vendida y lo dice", () => {
  const plano = [caja(), caja({ id: "c2", code: "CAJ-05", partes: undefined }), caja({ id: "c3", code: "CAJ-06", partes: { bahias: 2 } }),
    { id: "n1", code: "NEV-03", type: "nevera_puertas", w: 2, partes: { puertas: 3 } }];
  const estado = { "NAVE-CAJ-06-BI2": vendido("2026-10-01", "2026-12-31") };
  const r = P.aplicarATodos(plano, "checkout", { bahias: 3 }, estado, "NAVE");
  assert.deepEqual(r.aplicados, ["CAJ-04", "CAJ-05"]);
  assert.deepEqual(r.saltados, ["CAJ-06"]);
  assert.deepEqual(r.fixtures.map((f) => f.partes?.bahias ?? null), [3, 3, 2, null]);
  assert.equal(r.fixtures[3], plano[3], "tocó un mueble que no es una caja");
  // Lo que ya está así no se cuenta ni se toca.
  const igual = P.aplicarATodos(plano, "checkout", { bahias: 2 }, {}, "NAVE");
  assert.deepEqual(igual.aplicados, ["CAJ-05"]);
});

await prueba("los textos de una pieza: la bahía desde la fila, el forro sin número", () => {
  assert.equal(P.textoParaMontar(P.partirCodigo("X-BI2").parte, 2),
    "Bahía de impulso 2 de 2, contando de izquierda a derecha mirando la caja desde la fila");
  assert.equal(P.textoParaMontar(P.partirCodigo("X-FO").parte), "Forro de columna");
  assert.equal(P.codigoVisibleDe("CAJ-04", "A", false, P.partirCodigo("X-BI1").parte), "CAJ-04·BI1");
  // El panel dice qué se vende de lo que nunca se alquila entero.
  assert.equal(P.vendePorPartes("checkout"), true);
  assert.equal(P.vendePorPartes("columna"), true);
  assert.equal(P.vendePorPartes("servicio_cliente"), false);
  assert.match(P.textoDeLoQueNuncaSeAlquila("checkout"), /bahías de impulso/);
  assert.match(P.textoDeLoQueNuncaSeAlquila("columna"), /forro/);
  assert.doesNotMatch(P.textoDeLoQueNuncaSeAlquila("servicio_cliente"), /bahías|forro/);
});

await prueba("el contorno de la bahía en el visor cae en su nicho; el del forro, en su frente", () => {
  const c = P.mesaDeImpulso(1.8, P.cotasDeCheckout(1.8, 0.7, 0.9));
  const nichos = P.nichosDeImpulso(c, 2);
  const bi1 = C.contornosDeLasPartes("checkout", 1.8, 0.7, 0.9, undefined, { bahias: 2 }, "A", [P.vanoDeParte("A", 1, 2)]);
  assert.equal(bi1.length, 1);
  assert.ok(Math.abs(bi1[0].cx - nichos[1].x) < 1e-9 && bi1[0].z < 0, JSON.stringify(bi1[0]));
  // Sin bahías en el plano, ninguno; la cara B de una caja no existe.
  assert.deepEqual(C.contornosDeLasPartes("checkout", 1.8, 0.7, 0.9, undefined, {}, "A", [0]), []);
  assert.deepEqual(C.contornosDeLasPartes("checkout", 1.8, 0.7, 0.9, undefined, { bahias: 2 }, "B", [0]), []);
  const fo = C.contornosDeLasPartes("columna", 0.4, 0.4, 3.0, undefined, { forro: true }, "A", [0]);
  assert.equal(fo.length, 1);
  assert.ok(fo[0].ancho > 0.4 && fo[0].cy + fo[0].alto / 2 <= 2.0 + 1e-9, JSON.stringify(fo[0]));
});

await prueba("el taller: la caja dice cuántas bahías vende y la columna si vende el forro", () => {
  const c = { ...P.formularioVacio("checkout"), nombre: "Caja Ocaña", clave: "caja-ocana", bahias: "2", nota: "medida", confiabilidad: "estimado" };
  assert.deepEqual(P.fichaDelFormulario(c).partes, { bahias: 2 });
  assert.deepEqual(P.problemasDelFormulario(c), []);
  assert.ok(P.problemasDelFormulario({ ...c, bahias: "5" }).some((x) => x.campo === "partes.bahias"));
  const k = { ...P.formularioVacio("columna"), nombre: "Columna 40", clave: "col-40", forro: "si", anchoCm: "40", fondoCm: "40", nota: "medida", confiabilidad: "estimado" };
  assert.deepEqual(P.fichaDelFormulario(k).partes, { forro: true });
  assert.deepEqual(P.problemasDelFormulario(k), []);
  // Una nevera no lleva bahías: el formulario no las manda.
  const n = { ...P.formularioVacio("nevera_puertas"), bahias: "2", forro: "si" };
  assert.equal(P.fichaDelFormulario(n).partes, undefined);
  // Y vuelve igual al editarla.
  const ida = P.formularioDe({ id: "cli:c", clave: "c", tipo: "checkout", nombre: "C", w: 1.8, d: 0.7, h: 0.9,
    partes: { bahias: 3 }, fuente: { confiabilidad: "estimado" }, retirado: false });
  assert.equal(ida.bahias, "3");
  const vuelta = P.formularioDe({ id: "cli:k", clave: "k", tipo: "columna", nombre: "K", w: 0.4, d: 0.4, h: 3,
    partes: { forro: true }, fuente: { confiabilidad: "estimado" }, retirado: false });
  assert.equal(vuelta.forro, "si");
});

/** Las pantallas grandes (Vender, Supervisar, el tablero de montaje) no se
 *  montan acá: se lee el código de lo que las piezas no pueden perder. */
await prueba("Vender toca la caja, ofrece sus bahías sin «Entera» y el atajo de todas las cajas", () => {
  const dash = leer(join(raiz, "src", "pages", "DashboardView.tsx"));
  // Tocar la caja y sus interruptores son cuentas puras desde la revisión de
  // la rama (`alTocarEnVender`, `interruptoresDeLaCara`): las prueba, por lo
  // que hacen, «la caja nunca se vende entera en Vender», más abajo.
  assert.match(dash, /setEnContrato\(\(lista\) => alTocarEnVender\(lista, f, cara, libre\)\);/, "Vender ya no deja tocar una caja con bahías");
  assert.match(dash, /onSumarEnTodas=\{sumarEnTodas\}/, "el atajo de todas las cajas no llega a la ficha");
  const mv = leer(join(raiz, "src", "components", "Contrato", "ModoVender.tsx"));
  assert.match(mv, /\{interruptores\.map\(\(suf\) => \{/, "la caja ofrece «Entera»");
  assert.match(mv, /data-sumar-en-todas=\{piezaDelRenglon\}/, "falta «Sumar la BI1 de todas las cajas»");
  assert.match(mv, /!seVendeAlgo\(ultimo\)/, "la caja con bahías se explica como no comercializable");
  // Supervisar: las piezas de la caja son filas, y no cuentan en la ocupación.
  assert.match(dash, /if \(soloPiezas && piezasDeLaFamilia\(f\.type\)\.length === 0\) return \[\];/, "las bahías vendidas no son filas de Supervisar");
  assert.match(dash, /\(!soloPiezas \|\| esPieza\(o\.partido\.parte\)\)/, "de una caja se cuelan partes que no son piezas");
  assert.match(dash, /const partesVendidas = partes\.filter\(\(p\) => esDivision\(p\.parte\) && corre\(p\)\)\.length;/,
    "las bahías se cuentan como partes de una cara");
  const mount = leer(join(raiz, "src", "pages", "MountView.tsx"));
  assert.match(mount, /soloPiezas \? caras\.slice\(1\) : caras/, "el tablero de montaje pide montar la caja entera");
});

console.log("partes · paso 4: cómo se vende, desde la ficha");

/** Una ficha propia como la manda `GET /api/muebles/modelos`. */
const propia = (clave, datos) => ({
  id: `cli:${clave}`, clave, retirado: false, fuente: { confiabilidad: "estimado", nota: "medida en la tienda" }, ...datos,
});
const PROPIAS = [
  propia("nevera-inducol-2p", { tipo: "nevera_puertas", nombre: "Nevera Inducol 2 puertas", w: 1.445, d: 0.74, h: 2.1,
    partes: { puertas: 2, division: "puertas" } }),
  propia("nevera-vieja", { tipo: "nevera_puertas", nombre: "Nevera de antes", w: 1.445, d: 0.74, h: 2.1, partes: { puertas: 2 } }),
  propia("caja-ocana", { tipo: "checkout", nombre: "Caja Ocaña", w: 1.8, d: 0.7, h: 0.9, partes: { bahias: 2 } }),
  propia("columna-40", { tipo: "columna", nombre: "Columna 40 forrada", w: 0.4, d: 0.4, h: 3.0, partes: { forro: true } }),
  propia("multideck-2t", { tipo: "nevera_refrescos", nombre: "Multideck 2 tramos", w: 2.5, d: 0.8, h: 2.0,
    partes: { tramos: 2, division: "tramos" } }),
  propia("punta-en", { tipo: "punta", nombre: "Punta por entrepaños", w: 0.7, d: 0.37, h: 1.8, entrepanos: 3,
    partes: { division: "entrepanos" } }),
];

await prueba("los modelos de RECABRA traen cómo se venden: neveras por puertas, murales por tramos, lo demás entero", () => {
  const como = (id) => P.comoSeVendeLaFicha(CATALOGO.modelos.find((m) => m.id === id));
  for (const [id, n] of [["base:nevera-2p-inducol", 2], ["base:nevera-3p-frigomaster", 3], ["base:nevera-4p-frigomaster", 4]]) {
    assert.deepEqual(como(id), { division: "puertas", n, piezas: [] }, id);
  }
  // La de una puerta no se divide (el mínimo es 2).
  assert.equal(como("base:nevera-1p-inducol"), null);
  // Los murales (góndolas de pared), por tramos: uno por módulo, se fijan en
  // el plano (la ficha es un módulo).
  const murales = CATALOGO.modelos.filter((m) => m.tipo === "gondola" && m.variante === "wall");
  assert.equal(murales.length, 12, "cambió la cantidad de murales de RECABRA");
  for (const m of murales) assert.deepEqual(P.comoSeVendeLaFicha(m), { division: "tramos", n: null, piezas: [] }, m.id);
  // Las centrales, las puntas, las estibas y el resto, enteros: lo decide la dueña.
  for (const m of CATALOGO.modelos.filter((m) => !(m.tipo === "gondola" && m.variante === "wall") && m.tipo !== "nevera_puertas")) {
    assert.equal(P.comoSeVendeLaFicha(m), null, `${m.id} nace por partes`);
  }
  // En palabras: la paleta dice poco, el panel dice todo.
  assert.equal(P.textoDeComoSeVende(como("base:nevera-3p-frigomaster"), { corto: true }), "por puertas");
  assert.equal(P.textoDeComoSeVende(como("base:nevera-3p-frigomaster")), "entera o por puertas (3)");
  assert.equal(P.textoDeComoSeVende(P.comoSeVendeLaFicha(murales[0])), "entera o por tramos, uno por módulo");
  assert.equal(P.textoDeComoSeVende(P.comoSeVendeLaFicha(PROPIAS[5])), "entera o por entrepaños (4, con la base)");
  assert.equal(P.textoDeComoSeVende(P.comoSeVendeLaFicha(PROPIAS[2]), { corto: true }), "2 bahías de impulso");
  assert.equal(P.textoDeComoSeVende(P.comoSeVendeLaFicha(PROPIAS[3])), "el forro se vende");
  assert.equal(P.textoDeComoSeVende(P.comoSeVendeLaFicha(PROPIAS[3]), { corto: true }), "con forro");
  // Lo que no dice nada, o lo dice mal (la cuenta fuera de rango), es entera.
  assert.equal(P.comoSeVendeLaFicha(PROPIAS[1]), null, "una ficha de antes (sólo puertas) se vende entera");
  assert.equal(P.comoSeVendeLaFicha({ tipo: "nevera_puertas", partes: { puertas: 9, division: "puertas" } }), null);
  assert.equal(P.comoSeVendeLaFicha({ tipo: "isla", partes: { division: "tramos" } }), null);
});

await prueba("las paletas del plano y del 3D dicen cómo se vende cada modelo, de RECABRA y propio", () => {
  const def = (entrada, id) => P.PALETA_3D.find((f) => f.entrada === entrada).modelos.find((m) => m.modelo === id);
  assert.equal(def("nevera_puertas", "base:nevera-3p-frigomaster").comoSeVende, "por puertas");
  assert.equal(def("nevera_puertas", "base:nevera-1p-inducol").comoSeVende, undefined);
  assert.equal(def("gondola:wall", "base:gondola-pared-180-m100").comoSeVende, "por tramos");
  assert.equal(def("gondola:double", "base:gondola-central-180-m100").comoSeVende, undefined);
  assert.equal(P.MODELOS_2D.gondola_mural.find((m) => m.id === "base:gondola-pared-180-m100").comoSeVende, "por tramos");
  assert.equal(P.MODELOS_2D.nevera_puertas.find((m) => m.id === "base:nevera-4p-frigomaster").comoSeVende, "por puertas");
  // La ficha propia, igual, y con su estampa entera (lo que se coloca).
  const paleta = P.paletaConPropias(PROPIAS);
  const caja = paleta.find((f) => f.entrada === "checkout").modelos.find((m) => m.modelo === "cli:caja-ocana");
  assert.equal(caja.comoSeVende, "2 bahías de impulso");
  assert.deepEqual(caja.partes, { bahias: 2 });
  const nev = paleta.find((f) => f.entrada === "nevera_puertas").modelos.find((m) => m.modelo === "cli:nevera-inducol-2p");
  assert.deepEqual([nev.comoSeVende, nev.partes], ["por puertas", { puertas: 2, division: "puertas" }]);
  assert.equal(P.modelosDelPlanoConPropias(PROPIAS).columna.at(-1).comoSeVende, "con forro");
  // Y las dos paletas lo muestran al lado de las medidas.
  const ed = leer(join(raiz, "src", "components", "StoreEditor3D", "StoreEditor3D.tsx"));
  assert.match(ed, /\{m\.w\}×\{m\.d\}×\{m\.h\} m\{m\.comoSeVende \? ` · \$\{m\.comoSeVende\}` : ""\}/, "la paleta del 3D no dice cómo se vende");
  const p2 = leer(join(raiz, "src", "components", "FloorPlan2D", "FloorPlan2D.tsx"));
  assert.match(p2, /\{m\.comoSeVende && \(/, "la biblioteca del 2D no dice cómo se vende");
});

await prueba("lo ya colocado no cambia solo: un mueble de antes se vende entero aunque su ficha diga partes", () => {
  // Colocados antes de que su modelo dijera cómo se vende: con la ficha
  // estampada de entonces (el mural sin `partes`; la nevera con sus puertas
  // y sin `division`). Se venden enteros, como el día que se colocaron.
  const mural = { id: "m1", code: "GON-07", type: "gondola", gondolaType: "wall", sede: "NAVE", w: 4, d: 0.4, h: 1.8,
    modulo: 1, entrepanos: 4, modelo: "base:gondola-pared-180-m100" };
  const nev = { id: "n9", code: "NEV-09", type: "nevera_puertas", sede: "NAVE", w: 2.07, d: 0.7, h: 2.1,
    partes: { puertas: 3 }, modelo: "base:nevera-3p-frigomaster" };
  assert.deepEqual(P.espaciosDe(mural, "NAVE"), ["NAVE-GON-07"]);
  assert.deepEqual(P.espaciosDe(nev, "NAVE"), ["NAVE-NEV-09"]);
  assert.equal(P.divisionSinFijar(mural), null);
  // El panel lo ofrece, y el cambio es lo que dice la ficha.
  const lo = P.loDeLaFicha(nev);
  assert.equal(lo.nombre, "Nevera de 3 puertas");
  assert.equal(lo.texto, "entera o por puertas (3)");
  assert.deepEqual(lo.cambio, { division: "puertas", puertas: 3 });
  assert.equal(lo.problema, null);
  const usada = P.conPartes([nev], "n9", lo.cambio)[0];
  assert.deepEqual(P.espaciosDe(usada, "NAVE"), ["NAVE-NEV-09", "NAVE-NEV-09-PU1", "NAVE-NEV-09-PU2", "NAVE-NEV-09-PU3"]);
  assert.equal(P.loDeLaFicha(usada).cambio, null, "ya se vende como su ficha y se sigue ofreciendo");
  // El mural: un tramo por módulo de su corrido (4 m de módulos de 1 m).
  assert.deepEqual(P.loDeLaFicha(mural).cambio, { division: "tramos", tramos: 4 });
  // Sin ficha, o con la de otra familia, o con una que no dice nada: nada.
  assert.equal(P.loDeLaFicha({ ...nev, modelo: undefined }), null);
  assert.equal(P.loDeLaFicha({ ...nev, modelo: "base:gondola-pared-180-m100" }), null);
  assert.equal(P.loDeLaFicha({ ...mural, gondolaType: "double" }), null, "un mural se le ofrece a una central");
  assert.equal(P.loDeLaFicha({ ...mural, modelo: "base:gondola-pared-180-m100".replace("pared", "central") }), null);
  assert.equal(P.loDeLaFicha({ ...nev, modelo: "cli:no-esta" }), null);
});

await prueba("un mural de un solo módulo no se parte en dos: se estira primero", () => {
  const solo = { id: "m2", code: "GON-08", type: "gondola", gondolaType: "wall", sede: "NAVE", w: 1, d: 0.4, h: 1.8,
    modulo: 1, modelo: "base:gondola-pared-180-m100", partes: { division: "tramos" } };
  const r = P.cambioParaDividir(solo, "tramos");
  assert.ok("problema" in r && /un solo módulo/.test(r.problema), JSON.stringify(r));
  const lo = P.loDeLaFicha({ ...solo, partes: null });
  assert.equal(lo.cambio, null);
  assert.match(lo.problema, /un solo módulo/);
  // Con dos módulos, sí: uno por módulo.
  assert.deepEqual(P.cambioParaDividir({ ...solo, w: 2 }, "tramos"), { cambio: { division: "tramos", tramos: 2 } });
  // La nevera abierta sigue con su cuenta (un tramo cada 1,25 m, al menos 2).
  assert.deepEqual(P.cambioParaDividir({ id: "b", code: "BEB-01", type: "nevera_refrescos", w: 2.5 }, "tramos"),
    { cambio: { division: "tramos", tramos: 2 } });
});

await prueba("las fichas propias: lo que se coloca ya viene configurado; lo de antes, se ofrece", () => {
  P.fijarFichasPropias(PROPIAS);
  try {
    const caja = { id: "c9", code: "CAJ-09", type: "checkout", sede: "NAVE", w: 1.8, d: 0.7, h: 0.9, modelo: "cli:caja-ocana" };
    assert.deepEqual(P.loDeLaFicha(caja).cambio, { bahias: 2 });
    assert.equal(P.loDeLaFicha(caja).texto, "2 bahías de impulso");
    assert.equal(P.loDeLaFicha({ ...caja, partes: { bahias: 2 } }).cambio, null);
    const col = { id: "k9", code: "COL-09", type: "columna", sede: "NAVE", w: 0.4, d: 0.4, h: 3, modelo: "cli:columna-40" };
    assert.deepEqual(P.loDeLaFicha(col).cambio, { forro: true });
    // Por entrepaños: los del mueble si los tiene; si no, los de la ficha.
    const punta = { id: "p9", code: "PUN-09", type: "punta", sede: "NAVE", w: 0.7, d: 0.37, h: 1.8, modelo: "cli:punta-en" };
    assert.deepEqual(P.loDeLaFicha(punta).cambio, { division: "entrepanos", entrepanos: 3 });
    assert.deepEqual(P.loDeLaFicha({ ...punta, entrepanos: 4 }).cambio, { division: "entrepanos" });
    const beb = { id: "b9", code: "BEB-09", type: "nevera_refrescos", sede: "NAVE", w: 2.5, d: 0.8, h: 2, modelo: "cli:multideck-2t" };
    assert.deepEqual(P.loDeLaFicha(beb).cambio, { division: "tramos", tramos: 2 });
    // Una ficha guardada antes de vender por partes (sólo las puertas) no dice
    // nada de cómo se vende: el mueble sigue entero y el panel no ofrece nada.
    assert.equal(P.loDeLaFicha({ id: "n8", code: "NEV-08", type: "nevera_puertas", w: 1.445, partes: { puertas: 2 }, modelo: "cli:nevera-vieja" }), null);
    // Retirada, se sigue leyendo: lo colocado la sigue usando.
    P.fijarFichasPropias(PROPIAS.map((m) => (m.clave === "caja-ocana" ? { ...m, retirado: true } : m)));
    assert.deepEqual(P.loDeLaFicha(caja).cambio, { bahias: 2 });
    assert.match(P.loDeLaFicha(caja).nombre, /\(retirada\)/);
  } finally {
    P.olvidarFichasPropias();
  }
});

await prueba("«Usar lo de la ficha» pasa por las mismas revisiones: con una parte vendida, no se mueve", () => {
  // Una nevera de 2 puertas ya vendida por puertas (PU1), colocada desde la
  // de 3: lo de la ficha la llevaría a 3 puertas y la PU1 quedaría en otro lugar.
  const nev = { id: "n7", code: "NEV-07", type: "nevera_puertas", sede: "NAVE", w: 2.07, d: 0.7, h: 2.1,
    partes: { puertas: 2, division: "puertas" }, modelo: "base:nevera-3p-frigomaster" };
  const estado = { "NAVE-NEV-07-PU1": vendido("2026-10-01", "2026-12-31") };
  const lo = P.loDeLaFicha(nev);
  assert.deepEqual(lo.cambio, { division: "puertas", puertas: 3 });
  const r = P.revisarCambioDePartes(nev, lo.cambio, estado, "NAVE");
  assert.ok(r.bloqueo && /una puerta vendida/.test(r.bloqueo), r.bloqueo);
  assert.ok(!/Postob/.test(r.bloqueo), "el bloqueo nombra al proveedor");
  // Y el panel lo propone por `proponer` (la revisión), nunca escribe directo.
  const panel = leer(join(raiz, "src", "components", "PartesDelMueble.tsx"));
  assert.match(panel, /const ficha = useMemo\(\(\) => \(f \? loDeLaFicha\(f\) : null\), \[f, fichasPropias\]\);/,
    "el panel no pregunta lo de la ficha, o no se entera cuando llegan las fichas propias");
  assert.match(panel, /data-partes-usar-ficha[\s\S]{0,400}onClick=\{\(\) => \{ setEnTodas\(null\); proponer\(ficha\.cambio!\); \}\}/,
    "«Usar lo de la ficha» no pasa por la revisión de lo vendido");
  assert.match(panel, /aplicarLoDeLaFicha\(selectFixtures\(st\), f\.modelo, estado, sede\)/, "falta «Aplicar a los colocados con esta ficha»");
  assert.match(panel, /onClick=\{\(\) => elegir\(sinFijar\)\}/, "el mural sin fijar no tiene cómo fijar sus tramos");
});

await prueba("«Aplicar a los colocados con esta ficha» salta lo vendido, lo que no puede y lo de otra ficha", () => {
  const nev = (id, code, extra = {}) => ({ id, code, type: "nevera_puertas", sede: "NAVE", w: 2.07, d: 0.7, h: 2.1,
    partes: { puertas: 3 }, modelo: "base:nevera-3p-frigomaster", ...extra });
  const plano = [
    nev("a", "NEV-01"),
    nev("b", "NEV-02", { partes: { puertas: 3, division: "puertas" } }),
    nev("c", "NEV-03", { partes: { puertas: 2, division: "puertas" } }),
    nev("d", "NEV-04", { modelo: "base:nevera-4p-frigomaster", partes: { puertas: 4 } }),
    { id: "m", code: "GON-01", type: "gondola", gondolaType: "wall", sede: "NAVE", w: 1, d: 0.4, h: 1.8, modulo: 1,
      modelo: "base:gondola-pared-180-m100" },
  ];
  const estado = { "NAVE-NEV-03-PU2": vendido("2026-10-01", "2026-12-31") };
  assert.deepEqual(P.colocadosConLaFicha(plano, "base:nevera-3p-frigomaster"), { todos: 3, distintos: 2 });
  const r = P.aplicarLoDeLaFicha(plano, "base:nevera-3p-frigomaster", estado, "NAVE");
  assert.deepEqual(r.aplicados, ["NEV-01"]);
  assert.deepEqual(r.saltados, ["NEV-03"], "tocó la nevera con una puerta vendida");
  assert.deepEqual(r.fixtures[0].partes, { puertas: 3, division: "puertas" });
  assert.equal(r.fixtures[1], plano[1], "tocó la que ya estaba así");
  assert.equal(r.fixtures[2], plano[2]);
  assert.equal(r.fixtures[3], plano[3], "tocó una de otra ficha");
  // El mural de un solo módulo: no puede, y se dice.
  const m = P.aplicarLoDeLaFicha(plano, "base:gondola-pared-180-m100", {}, "NAVE");
  assert.deepEqual([m.aplicados, m.sinPoder], [[], ["GON-01"]]);
  // Con la entera vendida y la ficha cambiando las hojas que se dibujan, se
  // hace de a una (el panel avisa): en lote, se salta.
  const entera = { "NAVE-NEV-01": vendido("2026-10-01", "2026-12-31") };
  const otra = [nev("a", "NEV-01", { partes: { puertas: 2 } })];
  assert.deepEqual(P.aplicarLoDeLaFicha(otra, "base:nevera-3p-frigomaster", entera, "NAVE").saltados, ["NEV-01"]);
});

await prueba("el taller numera las partes sobre el mueble que gira, con las cuentas del visor", () => {
  const numeradas = (f) => C.partesNumeradas(f);
  const nev = numeradas({ type: "nevera_puertas", w: 2.07, d: 0.7, h: 2.1, partes: { puertas: 3, division: "puertas" } });
  assert.deepEqual(nev.map((p) => p.etiqueta), ["PU1", "PU2", "PU3"]);
  // La PU1 a la izquierda de quien mira el frente de la A (−Z): en +X.
  assert.ok(nev[0].contorno.cx > nev[1].contorno.cx && nev[1].contorno.cx > nev[2].contorno.cx,
    nev.map((p) => p.contorno.cx).join(", "));
  assert.ok(nev.every((p) => p.contorno.z < 0), "las puertas no están en el frente");
  // Los entrepaños, de abajo hacia arriba, con la base.
  const pun = numeradas({ type: "punta", w: 0.7, d: 0.37, h: 1.8, entrepanos: 3, partes: { division: "entrepanos" } });
  assert.deepEqual(pun.map((p) => p.etiqueta), ["EN1 · base", "EN2", "EN3", "EN4"]);
  assert.ok(pun.every((p, i) => i === 0 || p.contorno.cy > pun[i - 1].contorno.cy), "los entrepaños no suben");
  // Las dos caras de una góndola central; la B, con su letra.
  const gon = numeradas({ type: "gondola", gondolaType: "double", w: 1, d: 0.8, h: 1.8, entrepanos: 3, partes: { division: "entrepanos" } });
  assert.deepEqual(gon.map((p) => p.etiqueta), ["EN1 · base", "EN2", "EN3", "EN4", "B·EN1 · base", "B·EN2", "B·EN3", "B·EN4"]);
  assert.ok(gon.slice(4).every((p) => p.cara === "B" && p.contorno.z > 0));
  // Las piezas: la bahía 1 a la izquierda de quien hace la fila; el forro.
  const caja = numeradas({ type: "checkout", w: 1.8, d: 0.7, h: 0.9, partes: { bahias: 2 } });
  assert.deepEqual(caja.map((p) => p.etiqueta), ["BI1", "BI2"]);
  assert.ok(caja[0].contorno.cx > caja[1].contorno.cx);
  assert.deepEqual(numeradas({ type: "columna", w: 0.4, d: 0.4, h: 3, partes: { forro: true } }).map((p) => p.etiqueta), ["FO"]);
  // Sin partes, nada: una ficha entera no muestra números.
  assert.deepEqual(numeradas({ type: "nevera_puertas", w: 2.07, d: 0.7, h: 2.1, partes: { puertas: 3 } }), []);
  // El taller las dibuja, y a la nevera abierta le pasa sus tramos.
  const taller = leer(join(raiz, "src", "pages", "TallerMuebles.tsx"));
  assert.match(taller, /partesNumeradas\(\{ type: def\.type, gondolaType: def\.gondolaType, w: anchoV, d: fondoV, h: altoV,\s*partes: defFicha\.partes/,
    "el taller no numera las partes de la ficha que se arma");
  assert.match(taller, /\{numeradas\.map\(\(p, i\) => <ParteNumeradaDelTaller/, "el taller no dibuja las partes numeradas");
  assert.match(taller, /tramos=\{def\.type === "nevera_refrescos" \? geometria\?\.tramos : undefined\}/,
    "la nevera abierta del taller no dibuja sus tramos");
});

console.log("partes · lo que se vio en el recorrido en el navegador (2026-10-14)");

await prueba("el plano y la lista de precios dicen «1 de 3 puertas vendida», no «libre» el día de hoy", () => {
  const estado = { "NAVE-NEV-03-PU2": vendido("2026-10-14", "2026-11-13") };
  const r = P.partesVendidasDeLaCara(nevera, "A", estado, "NAVE", d("2026-10-14"), d("2026-11-13"));
  assert.deepEqual(r, { vendidas: 1, de: 3, clase: "puertas" });
  assert.equal(P.textoDePartesVendidas(r), "1 de 3 puertas vendida");
  assert.equal(P.textoDePartesVendidas({ vendidas: 2, de: 5, clase: "entrepanos" }), "2 de 5 entrepaños vendidos");
  // Fuera de esas fechas, nada vendido: el rótulo de siempre.
  assert.equal(P.partesVendidasDeLaCara(nevera, "A", estado, "NAVE", d("2026-12-01"), d("2026-12-31")), null);
  // Con la ENTERA tomada parte del periodo, manda el día en que se libera.
  // (la entera hasta el 20 y la PU2 desde el 25: no se pisan, y la cara tiene
  // días tomados ella misma).
  const entera = { "NAVE-NEV-03": vendido("2026-09-01", "2026-10-20"), "NAVE-NEV-03-PU2": vendido("2026-10-25", "2026-11-13") };
  assert.equal(P.partesVendidasDeLaCara(nevera, "A", entera, "NAVE", d("2026-10-14"), d("2026-11-13")), null);
  // Un mueble sin partes: nada que contar.
  assert.equal(P.partesVendidasDeLaCara({ code: "GON-04", type: "gondola", sede: "NAVE" }, "A", {}, "NAVE", d("2026-10-14"), d("2026-11-13")), null);
  // Y el plano lo pide antes que la fecha (`porPartes`), en el rótulo, en el
  // cartel del mouse y en la ficha de la lista de precios.
  const dash = leer(join(raiz, "src", "pages", "DashboardView.tsx"));
  assert.match(dash, /const partes = dispo === "parcial" \? porPartes\?\.\(f, entry\) \?\? null : null;\s*const desde = dispo === "parcial" && !partes\s*\? \(libreDesde \? libreDesde\(f, entry\)\?\.desde : primerDiaLibre/,
    "el rótulo de una cara parcial por sus partes vuelve a decir «libre» y el día");
  assert.match(dash, /fecha: partes \?\? \(desde \?/, "el rótulo no dice las partes vendidas");
  assert.match(dash, /const partes = porPartes\?\.\(f, face\) \?\? null;\s*if \(partes\) return partes;/, "el cartel del mouse dice «libre los 31 días»");
  assert.match(dash, /\.\.\.\(como\?\.porPartes \? \{ porPartes: como\.porPartes \} : \{ desde: como\?\.desde \}\)/, "la lista de precios vuelve a poner el día");
  assert.equal((dash.match(/porPartes=\{porPartesDeCara\}/g) ?? []).length, 2, "Vender y Supervisar dibujan el plano con el mismo rótulo");
});

await prueba("el panel dice de qué cara es cada entrepaño de una góndola central", () => {
  const gon = { id: "g", code: "GON-01", type: "gondola", gondolaType: "double", sede: "NAVE", w: 0.9, d: 0.9, h: 1.8,
    entrepanos: 2, partes: { division: "entrepanos" } };
  const estado = { "NAVE-GON-01-B-EN2": vendido("2026-10-14", "2026-11-13") };
  assert.deepEqual(P.partesConEstado(gon, estado, "NAVE").map((p) => [p.sufijo, p.vendida]),
    [["EN1", false], ["EN2", false], ["EN3", false], ["B·EN1", false], ["B·EN2", true], ["B·EN3", false]]);
});

await prueba("lo que dice el panel: «1 caja», «las puertas vendidas quedarían», y un solo «Cómo se vende» en el 2D", () => {
  assert.equal(P.textoDeAplicarATodos({ aplicados: ["CAJ-03"], saltados: [] }, "caja", "cajas"), "Quedó igual en 1 caja.");
  assert.equal(P.textoDeAplicarATodos({ aplicados: ["CAJ-03", "CAJ-04"], saltados: ["CAJ-02"] }, "caja", "cajas"),
    "Quedó igual en 2 cajas. No se tocó CAJ-02: tiene algo vendido que se movería.");
  assert.equal(P.textoDeAplicarATodos({ aplicados: [], saltados: [] }, "caja", "cajas"), "Las demás cajas ya estaban así.");
  const tres = { "NAVE-NEV-03-PU1": vendido("2026-10-14", "2026-11-13"), "NAVE-NEV-03-PU3": vendido("2026-10-14", "2026-11-13") };
  assert.match(P.revisarCambioDePartes(nevera, { puertas: 2 }, tres, "NAVE").bloqueo, /Con 2 puertas vendidas .*: las puertas vendidas quedarían en otro lugar/);
  const una = { "NAVE-NEV-03-PU3": vendido("2026-10-14", "2026-11-13") };
  assert.match(P.revisarCambioDePartes(nevera, { puertas: 2 }, una, "NAVE").bloqueo, /Con una puerta vendida .*: la puerta vendida quedaría en otro lugar/);
  const cajas = { "NAVE-CAJ-04-BI1": vendido("2026-10-14", "2026-11-13"), "NAVE-CAJ-04-BI2": vendido("2026-10-14", "2026-11-13") };
  assert.match(P.revisarCambioDePartes(caja(), { bahias: 1 }, cajas, "NAVE").bloqueo, /las bahías de impulso vendidas quedarían/);
  const comp = leer(join(raiz, "src", "components", "PartesDelMueble.tsx"));
  assert.match(comp, /\{!sinTitulo && <span className=\{etiquetaCls\}>Cómo se vende<\/span>\}/, "el componente no deja sacar su título");
  assert.match(comp, /setEnTodas\(textoDeAplicarATodos\(r, singular, plural\)\)/, "el panel arma el texto a mano otra vez");
  assert.match(comp, /aplicarEnTodas\(\{ bahias: [^}]*\}, "caja", "cajas"\)/, "«Aplicar a todas» no dice la caja en singular");
  const plano = leer(join(raiz, "src", "components", "FloorPlan2D", "FloorPlan2D.tsx"));
  assert.match(plano, /<Field label="Cómo se vende" icon="🧩">\s*<PartesDelMueble id=\{item\.id\} puedeEditar=\{editMode && isAdmin\} sinTitulo \/>/,
    "el panel del 2D dice «Cómo se vende» dos veces seguidas");
});

await prueba("Supervisar: una fila por puerta que se distingue, claves únicas y los contratos contados como contratos", () => {
  const dash = leer(join(raiz, "src", "pages", "DashboardView.tsx"));
  // «Para revisar»: dos puertas de la misma nevera que vencen el mismo día
  // repetían la clave y React podía comerse una fila.
  assert.match(dash, /key=\{`pv-\$\{claveDeFila\(entry\)\}`\}/, "las filas de «por vencer» repiten la clave de dos puertas");
  assert.match(dash, /key=\{`sm-\$\{claveDeFila\(entry\)\}`\}/, "las filas de «sin montar» repiten la clave de dos puertas");
  // Estado por espacio: la columna del código mide los de las partes; sin
  // partes, 104 como siempre.
  assert.match(dash, /const deLasPartes = rows\.filter\(\(e\) => e\.parte\)\.map\(\(e\) => codigoVisible\(e\)\);/, "la columna no mide los códigos de las partes");
  assert.match(dash, /: 104;\s*return \{\s*codigo,/, "sin partes, la columna del código ya no mide 104");
  assert.match(dash, /\{ etiqueta: "Código", ancho: anchos\.codigo, minimo: anchos\.codigo \}/, "la columna del código no usa lo que se midió");
  // «N contratos»: uno por espacio que corre, la cara o cada parte.
  assert.match(dash, /const contratos = faces\.filter\(corre\)\.length;/, "los contratos se cuentan por cara otra vez");
  assert.match(dash, /\{kpis\.contratos\} contrato\s*\{kpis\.contratos === 1 \? "" : "s"\}/, "el encabezado no dice los contratos");
});

await prueba("el visor cuenta las unidades de la puerta que se vende, no las de la nevera entera", () => {
  const ed = leer(join(raiz, "src", "components", "StoreEditor3D", "StoreEditor3D.tsx"));
  assert.match(ed, /unidadesDePrueba\(\{ venta: ventaUsada, empaque, donde: "todas", semilla: "panel", vanos: vanosDeLaParte \}\)/,
    "la capacidad del panel cuenta la cara entera");
  assert.match(ed, /unidadesDePrueba\(\{ venta: ventaUsada, empaque, donde: dondeDelDibujo, semilla: "panel", vanos: vanosDeLaParte \}\)/,
    "la cuenta del panel no es la del dibujo");
  const visor = leer(join(raiz, "src", "components", "Contrato", "VisorDeVenta.tsx"));
  assert.match(visor, /paraElProveedor\s*vanos=\{cara\?\.vanos\}\s*filas=\{cara\?\.filas\}/, "el visor no le pasa al panel las partes del contrato");
  // Y la cuenta pura: la puerta 2 de 3 entra un tercio de la nevera.
  const venta = P.ventaDeNevera(2.05, 0.74, 2.1, 3);
  assert.ok(venta.vanos.length === 3, `la nevera de 3 puertas tiene ${venta.vanos.length} vanos`);
});

console.log("partes · lo que encontró la revisión de la rama (2026-10-14)");

await prueba("la entera vendida hasta el 20 y una puerta desde el 21: el plano no dice «libre 21 oct»", () => {
  // Lo de la revisión: la cara está «parcial», tiene días propios, y el plano
  // y la lista de precios decían el primer día libre DE LA CARA, cuando ese
  // día la puerta 2 ya está vendida y la entera no se puede vender.
  const estado = {
    "NAVE-NEV-03": vendido("2026-10-15", "2026-10-20"),
    "NAVE-NEV-03-PU2": vendido("2026-10-21", "2026-12-31"),
  };
  const ix = P.indiceDePartes(estado);
  const desde = d("2026-10-15"), hasta = d("2026-11-15");
  assert.equal(P.disponibilidadDeCara(nevera, "A", estado, ix, "NAVE", desde, hasta), "parcial");
  assert.deepEqual(P.diasLibresDeLaCara(nevera, "A", estado, ix, "NAVE", desde, hasta), [], "la entera no se libera en el periodo");
  // Lo que se puede vender son las otras puertas: lo dice la cuenta, no una fecha.
  assert.deepEqual(P.comoSeLiberaLaCara(nevera, "A", estado, ix, "NAVE", desde, hasta), { porPartes: "1 de 3 puertas vendida" });
  // Con un hueco (la puerta desde el 25), la entera se vende del 21 al 24.
  const hueco = { ...estado, "NAVE-NEV-03-PU2": vendido("2026-10-25", "2026-12-31") };
  const c = P.comoSeLiberaLaCara(nevera, "A", hueco, P.indiceDePartes(hueco), "NAVE", desde, hasta);
  assert.equal(c.desde.getTime(), d("2026-10-21").getTime());
  assert.equal(c.diasLibres, 4);
  // Sin partes, lo de siempre: el primer día libre de la cara y sus días.
  const sola = { "NAVE-NEV-03": vendido("2026-10-15", "2026-10-20") };
  const s1 = P.comoSeLiberaLaCara(nevera, "A", sola, P.indiceDePartes(sola), "NAVE", desde, hasta);
  assert.equal(s1.desde.getTime(), d("2026-10-21").getTime());
  assert.equal(s1.diasLibres, 26);
  // Con la cara libre y una puerta vendida, la cuenta de siempre.
  const una = { "NAVE-NEV-03-PU2": vendido("2026-10-14", "2026-11-13") };
  assert.deepEqual(P.comoSeLiberaLaCara(nevera, "A", una, P.indiceDePartes(una), "NAVE", desde, hasta), { porPartes: "1 de 3 puertas vendida" });
  // Y el plano y la lista de precios lo piden por acá, en Vender y en Supervisar.
  const dash = leer(join(raiz, "src", "pages", "DashboardView.tsx"));
  assert.equal((dash.match(/libreDesde=\{libreDesdeDeCara\}/g) ?? []).length, 2, "un plano no recibe el día en que se libera la entera");
  assert.match(dash, /comoSeLiberaLaCara\(f, face\.face, estadoComercial, indicePartes, sede, mapRange\.from, mapRange\.to\)/,
    "el día en que se libera no mira el mapa de la base");
  assert.match(dash, /const taken = Math\.max\(daysTakenInRange\(face, range\.from, range\.to\), libre \? total - libre\.diasLibres : 0\);/,
    "el cartel del mouse cuenta sólo los días de la cara");
});

/** La proyección de un vano del dibujo de una cara sobre la derecha de la
 *  cámara de venta de esa cara (la cuenta de «el tramo 1 queda a la izquierda»). */
const enPantallaDe = (f, cara, vanos, i) => {
  const v = P.vistaDeCara(f, cara);
  const adelante = { x: v.targetX - v.posX, z: v.targetZ - v.posZ };
  const derecha = { x: -adelante.z, z: adelante.x };
  const xGrupo = vanos[i].x;
  const x = cara === "B" ? -xGrupo : xGrupo;
  const wx = f.cx + x * Math.cos(f.rotY);
  const wz = f.cz - x * Math.sin(f.rotY);
  return wx * derecha.x + wz * derecha.z;
};

await prueba("el visor de Vender marca la parte que se vende, no otra: tramos de las dos caras, entrepaños y bahías", () => {
  // `marcasDelContrato` es lo que el visor le muestra al proveedor. Tres
  // mutaciones (el tramo de la B espejado, el entrepaño una fila más arriba,
  // la bahía del otro lado) pasaban todo: se prueba con la cámara de venta.
  for (const rotY of [0, 0.7, Math.PI / 2, -1.1]) {
    const f = { ...gondola(), cx: 3, cz: -2, rotY };
    const n = 3;
    const vanos = P.vanosDeCorrido(f.w, undefined, n);
    for (const cara of ["A", "B"]) {
      const x = [1, 2, 3].map((k) => {
        const m = P.marcasDelContrato(f, cara, [`TR${k}`]);
        assert.equal(m.vanos.length, 1);
        assert.deepEqual(m.filas, []);
        return enPantallaDe(f, cara, vanos, m.vanos[0]);
      });
      assert.ok(x[0] < x[1] && x[1] < x[2], `cara ${cara}, giro ${rotY}: el TR1 no es el de la izquierda (${x.map((v) => v.toFixed(2))})`);
      // Y el contorno amarillo cae en el mismo lugar que el producto.
      const m = P.marcasDelContrato(f, cara, ["TR1"]);
      const [cont] = C.contornosDeLasPartes("gondola", f.w, f.d, f.h, "double", { tramos: n }, cara, m.vanos);
      assert.ok(cara === "A" ? cont.cx > 1 : cont.cx < -1, `cara ${cara}: el contorno del TR1 en ${cont.cx}`);
    }
  }
  // Los entrepaños, por su fila: el EN1 es la base, la 0.
  const pun = { code: "PUN-02", type: "punta", entrepanos: 3, partes: { division: "entrepanos" } };
  assert.deepEqual(P.marcasDelContrato(pun, "A", ["EN1"]), { vanos: [], filas: [0], dePiezas: false });
  assert.deepEqual(P.marcasDelContrato(pun, "A", ["EN3", "EN1"]).filas, [2, 0]);
  // La bahía 1, a la izquierda de quien hace la fila (+X: la del contorno de más a la derecha del mueble).
  const bi1 = P.marcasDelContrato(caja(), "A", ["BI1"]);
  const bi2 = P.marcasDelContrato(caja(), "A", ["BI2"]);
  assert.equal(bi1.dePiezas, true);
  const c1 = C.contornosDeLasPartes("checkout", 1.8, 0.7, 0.9, undefined, { bahias: 2 }, "A", bi1.vanos)[0];
  const c2 = C.contornosDeLasPartes("checkout", 1.8, 0.7, 0.9, undefined, { bahias: 2 }, "A", bi2.vanos)[0];
  assert.ok(c1.cx > c2.cx, `la BI1 en ${c1.cx}, la BI2 en ${c2.cx}`);
  assert.deepEqual(P.marcasDelContrato(columna(), "A", ["FO"]), { vanos: [0], filas: [], dePiezas: true });
  // La entera, sin marcas; y la pantalla las pide por acá.
  assert.deepEqual(P.marcasDelContrato(nevera, "A", []), { vanos: [], filas: [], dePiezas: false });
  const mv = leer(join(raiz, "src", "components", "Contrato", "ModoVender.tsx"));
  assert.match(mv, /const \{ vanos, filas, dePiezas \} = marcasDelContrato\(f, cara\.face, sufijos\);/, "el visor arma las marcas a mano otra vez");
});

await prueba("el renglón de Vender y Supervisar cobran la tarifa de la puerta y ven las puertas vendidas", () => {
  const rates = { default: { nevera_puertas: 900_000 }, by_sede: {} };
  const pu2 = P.partirCodigo("X-PU2").parte;
  assert.deepEqual(P.tarifaDeLaFila(rates, "NAVE", { fixture: nevera, parte: pu2 }), { valor: 300_000, origen: "cara/n" });
  assert.deepEqual(P.tarifaDeLaFila(rates, "NAVE", { fixture: nevera }), { valor: 900_000, origen: "cara" });
  const ctx = (estado) => ({ rates, sede: "NAVE", estado, desde: d("2026-10-15"), hasta: d("2026-11-15") });
  const r = P.comercialDelEspacio(nevera, "A", "PU2", ctx({}));
  assert.equal(r.codigo, "NAVE-NEV-03-PU2");
  assert.deepEqual([r.ref, r.origenRef, r.disponibilidad, r.porQue], [300_000, "cara/n", "libre", null]);
  // Con la puerta 2 vendida, el renglón de la ENTERA no está libre, por sus partes.
  const estado = { "NAVE-NEV-03-PU2": vendido("2026-10-01", "2026-12-31") };
  const entera = P.comercialDelEspacio(nevera, "A", null, ctx(estado));
  assert.deepEqual([entera.ref, entera.disponibilidad, entera.porQue], [900_000, "tomado", "partes"]);
  assert.equal(P.comercialDelEspacio(nevera, "A", "PU1", ctx(estado)).porQue, null, "otra puerta sí se vende");
  // Las pantallas lo piden por acá, con el mapa de la base y la tarifa de la fila.
  const contrato = leer(join(raiz, "src", "components", "Contrato", "Contrato.tsx"));
  assert.match(contrato, /comercialDelEspacio\(\s*fixture, face, sufijo \?\? null,\s*\{ rates: referenceRates, sede, estado: estadoComercial,/,
    "Vender arma lo comercial del renglón a mano otra vez");
  const dash = leer(join(raiz, "src", "pages", "DashboardView.tsx"));
  assert.match(dash, /const ref = tarifaDeLaFila\(referenceRates, sede, x\)\.valor;/, "«bajo la tarifa» no cobra la tarifa de la puerta");
  assert.match(dash, /tarifaDeLaFila\(referenceRates, sede, e\)\.valor,/, "la franja no cobra la tarifa de la puerta");
  assert.doesNotMatch(dash, /tarifaDeEspacio\(/, "Supervisar pregunta la tarifa sin la parte");
});

await prueba("la caja nunca se vende entera en Vender: ni al tocarla ni en su renglón", () => {
  const libre = () => true;
  // Tocar una caja suma su BI1 (o la primera libre), nunca la caja entera.
  assert.deepEqual(P.alTocarEnVender([], caja(), "A", libre), [{ id: "c1", face: "A", parte: "BI1" }]);
  assert.deepEqual(P.alTocarEnVender([], caja(), "B", (p) => p.n !== 1), [{ id: "c1", face: "A", parte: "BI2" }]);
  // Tocarla de nuevo saca todo lo de esa caja.
  assert.deepEqual(P.alTocarEnVender([{ id: "c1", face: "A", parte: "BI2" }], caja(), "A", libre), []);
  // La columna forrada suma su forro; sin forro, no se vende nada: vacía el contrato.
  assert.deepEqual(P.alTocarEnVender([], columna(), "A", libre), [{ id: "k1", face: "A", parte: "FO" }]);
  assert.deepEqual(P.alTocarEnVender([{ id: "n1", face: "A" }], caja({ partes: {} }), "A", libre), []);
  // Un mueble que se vende entero suma la cara que se tocó, como siempre.
  assert.deepEqual(P.alTocarEnVender([], { ...gondola(), id: "g1" }, "B", libre), [{ id: "g1", face: "B" }]);
  assert.deepEqual(P.alTocarEnVender([{ id: "g1", face: "B" }], { ...gondola(), id: "g1" }, "B", libre), []);
  // El renglón: la caja ofrece sus bahías sin «Entera»; la nevera, «Entera» y sus puertas.
  assert.deepEqual(P.interruptoresDeLaCara(caja(), "A"), ["BI1", "BI2"]);
  assert.deepEqual(P.interruptoresDeLaCara(nevera, "A"), [null, "PU1", "PU2", "PU3"]);
  assert.deepEqual(P.interruptoresDeLaCara({ code: "PUN-01", type: "punta" }, "A"), []);
  const dash = leer(join(raiz, "src", "pages", "DashboardView.tsx"));
  assert.match(dash, /setEnContrato\(\(lista\) => alTocarEnVender\(lista, f, cara, libre\)\);/, "tocar en Vender no pasa por `alTocarEnVender`");
  const mv = leer(join(raiz, "src", "components", "Contrato", "ModoVender.tsx"));
  // Rediseño de Vender: las PIEZAS (la caja, la columna) siguen con sus
  // interruptores, de `interruptoresDeLaCara`; las partes de una cara se eligen
  // en su lista (`ElegirPartes`, con `partesParaElegir`), nunca armadas a mano.
  assert.match(mv, /const interruptores = l\.tipo === "pieza" \? interruptoresDeLaCara\(l\.fixture, l\.face\) : \[\];/,
    "el renglón arma sus interruptores a mano, o se los ofrece a algo que no es una pieza");
  assert.match(mv, /\{interruptores\.map\(\(suf\) => \{/, "el renglón no dibuja los interruptores de las piezas");
  assert.match(mv, /l\.tipo === "partes" && <ElegirPartes l=\{l\} c=\{c\} \/>/, "las partes de una cara no se eligen en su lista");
  const linea = leer(join(raiz, "src", "components", "Contrato", "LineaDelContrato.tsx"));
  assert.match(linea, /const lista = partesParaElegir\(l\.fixture, l\.face, clase\);/, "la lista de partes se arma a mano");
  assert.match(linea, /disabled=\{tomada && !puesta\}/, "una parte tomada se puede marcar");
  assert.match(linea, /\{tomada \? "Tomado" : /, "la parte tomada no dice «Tomado»");
});

await prueba("el plano 2D pone el punto del tramo vendido de la cara B donde está", () => {
  // Una góndola doble por tramos con el B-TR1 vendido: mirando la B (desde
  // +Z), la izquierda es −X del mueble.
  const g = gondola();
  const estado = { "NAVE-GON-05-B-TR1": vendido("2026-10-14", "2026-11-13"), "NAVE-GON-05-TR1": vendido("2026-10-14", "2026-11-13") };
  const puntos = P.puntosDePartesVendidas(g, estado, "NAVE");
  const b = puntos.find((p) => p.cara === "B");
  const a = puntos.find((p) => p.cara === "A");
  assert.equal(b.lado, 1);
  assert.equal(a.lado, -1);
  const [t0, t1] = P.fraccionDeParte("B", 1, 3);
  assert.ok(Math.abs(b.a - ((t0 + t1) / 2 - 0.5)) < 1e-9);
  assert.ok(b.a < 0, `el B-TR1 en ${b.a}: tiene que caer en −X, a la izquierda de quien mira la B`);
  assert.ok(a.a > 0, `el TR1 de la A en ${a.a}: tiene que caer en +X`);
  // Los entrepaños no tienen punto en planta; sin nada vendido, ninguno.
  assert.deepEqual(P.puntosDePartesVendidas({ ...g, partes: { division: "entrepanos" }, entrepanos: 3 }, estado, "NAVE"), []);
  assert.deepEqual(P.puntosDePartesVendidas(g, {}, "NAVE"), []);
  const plano = leer(join(raiz, "src", "components", "FloorPlan2D", "FloorPlan2D.tsx"));
  assert.match(plano, /const vendidas = puntosDePartesVendidas\(f, estadoCrudo, sede\);/, "el plano ubica los puntos a mano");
  assert.match(plano, /const p = aPlano\(a \* largo, lado \* fondo \* 0\.3\);/, "el plano no pone el punto donde dice la cuenta");
});

await prueba("el taller numera los tramos de la cara B de izquierda a derecha de quien la mira", () => {
  const g = { type: "gondola", gondolaType: "double", w: 3.75, d: 0.9, h: 2.0, partes: { tramos: 3, division: "tramos" } };
  const num = C.partesNumeradas(g);
  assert.deepEqual(num.map((p) => p.etiqueta), ["TR1", "TR2", "TR3", "B·TR1", "B·TR2", "B·TR3"]);
  const A = num.filter((p) => p.cara === "A"), B = num.filter((p) => p.cara === "B");
  // Mirando la A (desde −Z) la izquierda es +X; mirando la B, −X.
  assert.ok(A[0].contorno.cx > A[1].contorno.cx && A[1].contorno.cx > A[2].contorno.cx, A.map((p) => p.contorno.cx).join(", "));
  assert.ok(B[0].contorno.cx < B[1].contorno.cx && B[1].contorno.cx < B[2].contorno.cx, B.map((p) => p.contorno.cx).join(", "));
  // Y es el mismo contorno que marca el visor de Vender para el B-TR1.
  const [delVisor] = C.contornosDeLasPartes("gondola", 3.75, 0.9, 2.0, "double", { tramos: 3 }, "B", [P.vanoEnLaCara("B", 1, 3)]);
  assert.ok(Math.abs(B[0].contorno.cx - delVisor.cx) < 1e-9, `${B[0].contorno.cx} / ${delVisor.cx}`);
});

await prueba("la consola cuenta los contratos de las bahías y no elige «puertas» como lo más libre", async () => {
  // El detalle por cliente: las piezas vendidas llegan en `piezas` (no cuelgan
  // de ninguna cara) y «N · M sobre el plano + K fuera» tiene que cerrar.
  const r = await build({
    entryPoints: [join(raiz, "src", "components", "plataforma", "sesion-datos.ts")],
    bundle: true, write: false, format: "esm", platform: "neutral", logLevel: "silent",
  });
  const S = await import("data:text/javascript;base64," + Buffer.from(r.outputFiles[0].text).toString("base64"));
  const contrato = (fin, canon) => ({ proveedor: "X", marca: null, canon_mensual: canon, inicio: "2026-09-01", fin,
    dias_para_vencer: 30, arranca_en_periodo: true });
  const detalle = {
    cliente: { slug: "c", nombre: "C", estado_cuenta: "activo" }, periodo: "2026-09", desde: "2026-09-01",
    hasta: "2026-09-30", generado_en: "", sedes_con_plano: 1, sedes: [],
    espacios: [
      { codigo: "NAVE-NEV-03", sede: "NAVE", codigo_corto: "NEV-03", cara: "A", tipo: "nevera_puertas", zona: null,
        area_m2: null, estado: "ocupado", contrato: null,
        partes: [{ parte: "PU2", codigo: "NAVE-NEV-03-PU2", codigo_corto: "NEV-03-PU2", contrato: contrato("2026-12-31", 300000) }] },
      { codigo: "NAVE-PUN-01", sede: "NAVE", codigo_corto: "PUN-01", cara: "A", tipo: "punta", zona: null,
        area_m2: null, estado: "ocupado", contrato: contrato("2026-12-31", 500000) },
    ],
    piezas: [{ parte: "BI1", codigo: "NAVE-CAJ-04-BI1", codigo_corto: "CAJ-04-BI1", sede: "NAVE", tipo: "parte_bahia",
      contrato: contrato("2026-12-31", 150000) }],
    contratos_fuera_del_plano: 0, resumen_por_tipo: [],
    proveedores: [{ nombre: "X", espacios: 3, tipos: [], sedes: [], canon_total: 950000, canon_promedio: 0,
      participacion_pct: 100, desde: null, contratos_por_vencer_60d: 0 }],
    movimientos: [], benchmark_plataforma: {}, oportunidades: [], recomendaciones: [],
  };
  const der = S.derivar(detalle);
  assert.equal(der.contratos, 3);
  assert.equal(der.contratosEnPlano + detalle.contratos_fuera_del_plano, der.contratos, "la cuenta de contratos no cierra");
  assert.deepEqual(S.contratosSobreElPlano(detalle).map((e) => e.codigo), ["NAVE-NEV-03-PU2", "NAVE-PUN-01", "NAVE-CAJ-04-BI1"]);
  assert.equal(S.contratosSobreElPlano(detalle).find((e) => e.codigo === "NAVE-CAJ-04-BI1").tipo, "parte_bahia");
  // Sin piezas, lo de antes.
  const { piezas: _p, ...sinPiezas } = detalle;
  assert.equal(S.derivar(sinPiezas).contratosEnPlano, 2);
  const pag = leer(join(raiz, "src", "pages", "DetalleCliente.tsx"));
  assert.match(pag, /const contratos = contratosSobreElPlano\(detalle\)\.filter\(pasa\);/, "la tabla de contratos no lista las partes ni las piezas");
  assert.match(pag, /const tiposDeCara = new Set\(der\.espacios\.map\(\(e\) => e\.tipo\)\);\s*const libresPorTipo = detalle\.resumen_por_tipo\s*\.filter\(\(r\) => tiposDeCara\.has\(r\.tipo\)\)/,
    "«Lo que no se vende es sobre todo…» puede elegir las puertas, que no son espacios");
});

await prueba("el enlace de montaje dice la cara y la parte una vez: «NEV-01 PU2», no «NEV-01-PU2 PU2»", () => {
  const m = leer(join(raiz, "src", "pages", "Montaje.tsx"));
  assert.match(m, /const sufijoParte = espacio\.parte \? `\$\{espacio\.parte\.token\}\$\{espacio\.parte\.n \?\? ""\}` : null;/,
    "el encabezado no arma el sufijo de la parte");
  assert.match(m, /espacio\.corto\.slice\(0, -\(sufijoParte\.length \+ 1\)\)/, "el encabezado repite el sufijo de la parte");
});

console.log("partes · la cara por participación y el cambio de geometría (§10.8)");

await prueba("cambiar alto, entrepaños o módulo de una cara por participación avisa que su distribución queda para revisar", () => {
  const g = gondola({ partes: { division: "participacion" }, status: "free", faceB: { status: "free" } });
  const sinParticipaciones = { ocupacion: {}, confirmadas: new Set() };
  // Un `PC3` vivo tiene la forma de una parte vendida y NO lo es: no se para a ninguna altura.
  const conPC = { "NAVE-GON-05-PC3": vendido("2026-10-01", "2099-12-31"), "NAVE-GON-05-B-PC1": vendido("2026-10-01", "2099-12-31") };
  const v0 = P.loVendidoDe(g, "NAVE", new Set(), conPC, sinParticipaciones);
  assert.equal(v0.partes, undefined, "un contrato de participación cuenta como parte vendida");
  assert.deepEqual(v0.participacion, [{ cara: "A", comprometida: false, confirmada: false }, { cara: "B", comprometida: false, confirmada: false }]);
  // Sin términos ni distribución, nada que avisar.
  assert.deepEqual(P.revisarCambioDeGeometria(g, { h: 2.2 }, v0), { cambios: P.revisarCambioDeGeometria(g, { h: 2.2 }, v0).cambios, bloqueo: null, aviso: null });
  // La A con una distribución confirmada.
  const conDistribucion = P.loVendidoDe(g, "NAVE", new Set(), conPC, { ocupacion: { "NAVE-GON-05": { intervalos: [{ desde: "2026-11-01", hasta: "2026-11-30", pb: 2500 }] } }, confirmadas: new Set(["NAVE-GON-05"]) });
  for (const cambio of [{ h: 2.2 }, { entrepanos: 5 }, { modulo: 1.0 }]) {
    const r = P.revisarCambioDeGeometria(g, cambio, conDistribucion);
    assert.equal(r.bloqueo, null, JSON.stringify(cambio));
    assert.ok(r.aviso, `${JSON.stringify(cambio)} no avisa`);
    assert.ok(r.aviso.lineas.includes("La cara A se vende por participación y tiene una distribución confirmada: con este cambio queda para revisar."),
      `${JSON.stringify(cambio)}: ${r.aviso.lineas.join(" | ")}`);
    assert.ok(!r.aviso.lineas.some((l) => l.includes("La cara B")), "avisa de la B, que no tiene nada");
    assert.ok(!r.aviso.lineas.some((l) => /partes vendidas|PC3/.test(l)), "el PC3 se lee como una parte que se para a otra altura");
  }
  // Sólo con una reserva provisional (la ocupación la cuenta; la fusión con la base no la ve).
  const conReserva = P.loVendidoDe(g, "NAVE", new Set(), {}, { ocupacion: { "NAVE-GON-05-B": { intervalos: [{ desde: "2026-12-01", hasta: "2026-12-31", pb: 3000 }], fisicos: [] } }, confirmadas: new Set() });
  const r = P.revisarCambioDeGeometria(g, { h: 2.2 }, conReserva);
  assert.ok(r.aviso && r.aviso.lineas.some((l) => l.startsWith("La cara B se vende por participación y tiene participaciones vivas")), r.aviso?.lineas.join(" | "));
  // Sin poder leer la ocupación: ante la duda, se pregunta.
  const sinDatos = P.loVendidoDe(g, "NAVE", new Set(), {});
  const d = P.revisarCambioDeGeometria(g, { h: 2.2 }, sinDatos);
  assert.ok(d.aviso && d.aviso.lineas.some((l) => l.startsWith("No se pudo revisar si la cara A tiene participaciones")));
  // Un cambio que no cambia la firma (con tramos guardados, el módulo no manda) no dice nada de la distribución.
  const conTramos = gondola({ partes: { division: "participacion", tramos: 3 }, status: "free" });
  const vt = P.loVendidoDe(conTramos, "NAVE", new Set(), {}, { ocupacion: {}, confirmadas: new Set(["NAVE-GON-05", "NAVE-GON-05-B"]) });
  assert.equal(P.revisarCambioDeGeometria(conTramos, { modulo: 1.0 }, vt).aviso, null);
  // Un mueble que no se vende por participación no lleva la rama.
  assert.equal(P.loVendidoDe(gondola(), "NAVE", new Set(), {}, sinParticipaciones).participacion, undefined);
  // Una mural por participación tiene UNA cara: nunca se pregunta por una B que no existe.
  const mural = gondola({ gondolaType: "wall", partes: { division: "participacion" }, status: "free" });
  const vm = P.loVendidoDe(mural, "NAVE", new Set(), {}, { ocupacion: { "NAVE-GON-05-B": { intervalos: [{ desde: "2026-11-01", hasta: "2026-11-30", pb: 2500 }] } }, confirmadas: new Set(["NAVE-GON-05-B"]) });
  assert.deepEqual(vm.participacion, [{ cara: "A", comprometida: false, confirmada: false }]);
  assert.equal(P.revisarCambioDeGeometria(mural, { h: 2.2 }, vm).aviso, null);
  // Sin la ocupación pero sabiendo que NO hay distribución confirmada: nada queda para revisar, no se pregunta.
  const sinOcupacion = P.loVendidoDe(g, "NAVE", new Set(), {}, { ocupacion: null, confirmadas: new Set() });
  assert.equal(P.revisarCambioDeGeometria(g, { h: 2.2 }, sinOcupacion).aviso, null);
});

await prueba("el panel de geometría le pasa a `loVendidoDe` las caras confirmadas del resumen: la confirmada avisa «para revisar», no «no se pudo revisar» (ejecutado)", () => {
  // Lo que arma `GeometriaDelMueble` con el store de lectura (ocupación y
  // resumen): sin esto, toda cara por participación decía «No se pudo revisar».
  const resumen = { caras: [
    { codigo_cara: "NAVE-GON-05", estado_distribucion: "confirmada" },
    { codigo_cara: "NAVE-GON-05-B", estado_distribucion: "borrador" },     // nunca se confirmó
    { codigo_cara: "NAVE-GON-06", estado_distribucion: "para_revisar" },  // confirmada, el mueble cambió
    { codigo_cara: "NAVE-GON-07", estado_distribucion: "sin_distribuir" },
  ] };
  assert.deepEqual([...P.confirmadasDelResumen(resumen)].sort(), ["NAVE-GON-05", "NAVE-GON-06"]);
  assert.equal(P.confirmadasDelResumen(null), null, "sin resumen no se sabe: no es «ninguna confirmada»");
  const g = gondola({ partes: { division: "participacion" }, status: "free", faceB: { status: "free" } });
  const v = P.loVendidoDe(g, "NAVE", new Set(), {}, { ocupacion: {}, confirmadas: P.confirmadasDelResumen(resumen) });
  const r = P.revisarCambioDeGeometria(g, { h: 2.2 }, v);
  assert.deepEqual(r.aviso?.lineas.filter((l) => /cara [AB]/.test(l)),
    ["La cara A se vende por participación y tiene una distribución confirmada: con este cambio queda para revisar."]);
  assert.ok(!r.aviso.lineas.some((l) => l.startsWith("No se pudo revisar")), "con los datos a mano igual dice «No se pudo revisar»");
});

// ── fase 2 · I4 (E8): la ocupación de la cara por participación, con la sede del PLANO ──
await prueba("fase 2 · un mueble por participación con OTRA «Sede» escrita avisa igual al cambiar su geometría: la ocupación se busca con la sede del plano (E8)", () => {
  const g = gondola({ partes: { division: "participacion" }, status: "free", faceB: { status: "free" }, sede: "OTRA" });
  const iv = [{ desde: "2026-11-01", hasta: "2026-11-30", pb: 2500 }];
  // El servidor arma la ocupación y las distribuciones con la sede del plano (NAVE), no la del mueble.
  const v = P.loVendidoDe(g, "NAVE", new Set(), {}, { ocupacion: { "NAVE-GON-05": { intervalos: iv, fisicos: [] } }, confirmadas: new Set(["NAVE-GON-05"]) });
  assert.deepEqual(v.participacion, [{ cara: "A", comprometida: true, confirmada: true }, { cara: "B", comprometida: false, confirmada: false }],
    "con otra «Sede» escrita en el mueble, la cara A no encuentra su ocupación");
  const r = P.revisarCambioDeGeometria(g, { h: 2.2 }, v);
  assert.ok(r.aviso && r.aviso.lineas.some((l) => l.startsWith("La cara A se vende por participación")), "cambiar el alto no avisa de las participaciones vivas");
  // Escrita con la sede del mueble (como el servidor NUNCA la arma), no se encuentra: la cuenta no mira esa sede.
  const conLaDelMueble = P.loVendidoDe(g, "NAVE", new Set(), {}, { ocupacion: { "OTRA-GON-05": { intervalos: iv, fisicos: [] } }, confirmadas: new Set(["OTRA-GON-05"]) });
  assert.deepEqual(conLaDelMueble.participacion.map((x) => [x.comprometida, x.confirmada]), [[false, false], [false, false]]);
  // Con la misma sede en los dos, como siempre.
  const igual = P.loVendidoDe({ ...g, sede: "NAVE" }, "NAVE", new Set(), {}, { ocupacion: { "NAVE-GON-05-B": { intervalos: iv, fisicos: [] } }, confirmadas: new Set() });
  assert.deepEqual(igual.participacion.map((x) => x.comprometida), [false, true]);
});

console.log(`\n${hechas} pruebas de vender por partes`);
