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
        'export { vanosDePuertas, vanosDeCorrido, ventaDeNevera, montantesDeTramos, geometriaDe } from "./src/components/StoreEditor3D/muebles/medidas.ts";',
        'export { conPartes, partesConEstado, revisarCambioDePartes, cambioParaDividir, divisionSinFijar, tramosQueEntran, tramosDibujados } from "./src/utils/partesDelMueble.ts";',
        'export { slotsDeLaParte, internosVendidosEnLaParte, partesQuePisa } from "./src/utils/slotsDeLasPartes.ts";',
        'export { revisarCambioDeGeometria, loVendidoDe, geometriaALaVista } from "./src/utils/geometriaDelMueble.ts";',
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
  }
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
  for (const p of P.partesConEstado(nevera, estado, "NAVE")) assert.deepEqual(Object.keys(p).sort(), ["codigo", "sufijo", "vendida"]);
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

console.log(`\n${hechas} pruebas de vender por partes`);
