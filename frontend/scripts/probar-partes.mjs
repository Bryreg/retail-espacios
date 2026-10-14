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
        'export { vanosDePuertas } from "./src/components/StoreEditor3D/muebles/medidas.ts";',
        'export { conPartes, partesConEstado, revisarCambioDePartes } from "./src/utils/partesDelMueble.ts";',
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

console.log(`\n${hechas} pruebas de vender por partes`);
