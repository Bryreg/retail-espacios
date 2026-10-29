/**
 * Las piezas EXACTAS de «Distribuir» (`src/utils/piezas.ts`).
 *   npm run probar:piezas            (y `-- --escribir` para regenerar `casos/piezas.json`)
 *
 * ── Por qué existe este archivo ──────────────────────────────────────────────
 *
 * Desde el rediseño «como un juego de piezas» (2026-10-24) una marca no se
 * dibuja: su pieza NACE con el tamaño de su % contratado y se arrastra a la
 * cara. La promesa es que no hay forma de pasarse —ya no existe «sobra
 * 0,86 %»—, y eso sólo es cierto si el rectángulo que arma el navegador da,
 * con la cuenta del SERVIDOR (redondeo a puntos básicos incluido), exactamente
 * el contratado. Por eso:
 *
 *   · Cada mueble del catálogo que se vende por participación (góndola doble,
 *     mural, de tres módulos con parantes en el medio, punta, robatope, ristra,
 *     cruz, vitrina, zona libre, las dos neveras), con 1 %, 17 %, 17,5 %,
 *     30 %, 50 % y 100 %, en Franja (desde la izquierda, desde la derecha y
 *     desde el medio), en Estantes y estirada: `dibujadoPb` da el pedido, la
 *     zona es válida y está cuantizada.
 *   · «Acomodar solas» pone las piezas en el orden de la lista, una al lado de
 *     la otra, sin pisarse, y cada una justa; con fechas que no se cruzan,
 *     comparten el lugar.
 *   · Soltar: encaja en el hueco, se pega a los bordes y dice a quién pisa.
 *   · «A mano»: la L del dibujo aprobado llega a 30 % justo con el imán, el
 *     contador dice «Llevás / Justo / Te pasaste»; cerca del contratado (±3 %)
 *     se deja JUSTA sola corriendo el lado suelto, sin tocar los pegados.
 *   · Los rectángulos salen escritos en `casos/piezas.json`, y
 *     `backend/tests/test_piezas_exactas.py` le pasa ESOS vértices al servidor
 *     (su superficie, su `medir` y su `juzgar`): da el % justo, sin `EXCESO`
 *     ni `SOLAPE`. Si la cuenta del navegador cambia, el archivo cambia y la
 *     prueba de acá falla hasta regenerarlo.
 */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = join(aqui, "..");
const RUTA_CASOS = join(aqui, "casos", "piezas.json");
const ESCRIBIR = process.argv.includes("--escribir");

let hechas = 0;
const prueba = async (n, fn) => {
  try { await fn(); hechas++; console.log("  ok   " + n); }
  catch (e) { console.error("  FALLA " + n + "\n         " + e.message.split("\n").join("\n         ")); process.exitCode = 1; }
};

const r = await build({
  stdin: {
    contents: [
      'export * as PZ from "./src/utils/piezas.ts";',
      'export * as S from "./src/utils/superficie.ts";',
      'export * as G from "./src/utils/zonasGeometria.ts";',
      'export * as P from "./src/utils/participaciones.ts";',
      'export * as E from "./src/utils/edicionDeZonas.ts";',
    ].join("\n"),
    resolveDir: raiz, loader: "ts",
  },
  bundle: true, write: false, format: "esm", platform: "neutral", logLevel: "silent",
});
const { PZ, S, G, P, E } = await import("data:text/javascript;base64," + Buffer.from(r.outputFiles[0].text).toString("base64"));

const MUEBLES = [
  { nombre: "góndola doble 1,80", mueble: { type: "gondola", w: 1.8, d: 0.9, h: 1.8 } },
  { nombre: "góndola mural 1,00", mueble: { type: "gondola", gondolaType: "wall", w: 1, d: 0.4, h: 1.9 } },
  { nombre: "góndola 3,00 de tres módulos (parantes en el medio)", mueble: { type: "gondola", w: 3, d: 0.9, h: 1.8, modulo: 1, entrepanos: 4 } },
  { nombre: "punta 0,90", mueble: { type: "punta", w: 0.9, d: 0.4, h: 1.8 } },
  { nombre: "punta 2,00 de dos módulos", mueble: { type: "punta", w: 2, d: 0.4, h: 1.8, modulo: 1 } },
  { nombre: "robatope", mueble: { type: "robatope", w: 0.3, d: 0.4, h: 1.6 } },
  { nombre: "ristra", mueble: { type: "ristra", w: 0.4, d: 0.4, h: 1.6 } },
  { nombre: "cruz", mueble: { type: "cross", w: 0.8, d: 0.8, h: 1.8 } },
  { nombre: "vitrina de tres puertas", mueble: { type: "mueble", w: 1.8, d: 0.6, h: 2 } },
  { nombre: "zona libre baja", mueble: { type: "metro", w: 1, d: 1, h: 0.05 } },
  { nombre: "nevera de 3 puertas", mueble: { type: "nevera_puertas", w: 2.07, d: 0.7, h: 2.1, partes: { puertas: 3, division: "participacion" } } },
  { nombre: "nevera abierta de 3 tramos", mueble: { type: "nevera_refrescos", w: 3.75, d: 0.75, h: 1.8, partes: { tramos: 3 } } },
];
const PORCENTAJES = [100, 1700, 1750, 3000, 5000, 10000];

const caraDe = (m) => {
  const s = S.superficieDeCara(m, "A");
  assert.ok(s, `${JSON.stringify(m)} no tiene superficie`);
  return { ancho: s.ancho, alto: s.alto, exclusiones: s.exclusiones, estantes: S.guiasDeCara(m, "A").entrepanos };
};
const cuantizado = (x) => Math.abs(x * 1e6 - Math.round(x * 1e6)) < 1e-6;
const exacta = (r, pb, cara, quien) => {
  assert.ok(r, `${quien}: no salió la pieza`);
  assert.equal(PZ.pbDeRect(r, cara.exclusiones), pb, `${quien}: el servidor diría ${PZ.pbDeRect(r, cara.exclusiones)} pb y no ${pb}`);
  assert.ok(PZ.rectValido(r, cara), `${quien}: la zona no es válida (${JSON.stringify(r)})`);
  for (const x of [r.u0, r.u1, r.v0, r.v1]) assert.ok(cuantizado(x), `${quien}: ${x} no está cuantizado a 1e-6`);
  // Lo que se manda pasa por `limpiar` sin cambiar (ya cuantizado y antihorario).
  assert.deepEqual(G.limpiar(PZ.poligonoDeRect(r)), PZ.poligonoDeRect(r), `${quien}: limpiar cambia el polígono`);
  // Y lo mide `medir`, que es lo que corre el servidor al confirmar.
  const m = G.medir([{ participacionSpaceId: 1, vertices: PZ.poligonoDeRect(r) }], { exclusiones: cara.exclusiones, ancho: cara.ancho, alto: cara.alto });
  assert.equal(m.dibujadoPb.get(1), pb, `${quien}: medir no da el % justo`);
};

const casos = [];

console.log("piezas · la pieza exacta, mueble por mueble");

await prueba(`Franja exacta: ${MUEBLES.length} muebles × ${PORCENTAJES.length} porcentajes × 3 anclas, con el redondeo del servidor`, () => {
  for (const { nombre, mueble } of MUEBLES) {
    const cara = caraDe(mueble);
    const b = PZ.bordesUtiles(cara.exclusiones);
    for (const pb of PORCENTAJES) {
      const izq = PZ.franja(cara, pb, 0, "derecha");
      exacta(izq, pb, cara, `${nombre} ${pb} desde la izquierda`);
      // De borde a borde de lo que se VENDE (no sobre el zócalo, el remate ni
      // el parante del costado): lo que se ve es lo que se guarda.
      assert.equal(izq.u0, b.u0, `${nombre}: la franja no arranca donde arranca lo que se vende`);
      assert.ok(izq.v0 === b.v0 && izq.v1 === b.v1, `${nombre}: una franja va de arriba a abajo de lo que se vende`);
      const der = PZ.franja(cara, pb, 1, "izquierda");
      exacta(der, pb, cara, `${nombre} ${pb} desde la derecha`);
      assert.equal(der.u1, b.u1, `${nombre}: la franja no termina donde termina lo que se vende`);
      if (pb <= 5000) {
        const medio = PZ.franja(cara, pb, 0.37, "derecha") ?? PZ.franja(cara, pb, 0.37, "izquierda");
        exacta(medio, pb, cara, `${nombre} ${pb} desde el medio`);
      }
      casos.push({ nombre: `${nombre} · franja ${pb} pb`, mueble, pb, piezas: [{ s: 1, pb, vertices: PZ.poligonoDeRect(izq) }] });
      assert.ok(b.u0 >= 0 && b.u1 <= 1 && b.v0 < b.v1);
    }
  }
});

await prueba("100 % es la cara entera; con lo que no se vende a los costados, la franja termina donde termina lo vendible", () => {
  const cara = caraDe(MUEBLES[0].mueble);
  const t = PZ.franja(cara, 10000, 0, "derecha");
  exacta(t, 10000, cara, "100 %");
  const b = PZ.bordesUtiles(cara.exclusiones);
  assert.ok(t.u1 <= b.u1 + 1e-9 && t.u1 >= b.u1 - 1e-6, `la franja del 100 % termina en ${t.u1}`);
  assert.deepEqual([t.u0, t.v0, t.v1], [b.u0, b.v0, b.v1], "la franja del 100 % no es lo que se vende");
  // 10001 pb no existe; 0 tampoco.
  assert.equal(PZ.franja(cara, 10001, 0), null);
  assert.equal(PZ.franja(cara, 0, 0), null);
  // Desde el medio, hacia la derecha, no entra el 100 %: null (no se pasa).
  assert.equal(PZ.franja(cara, 10000, 0.5, "derecha"), null, "una franja que no entra no se achica sola");
});

await prueba("cruzar un parante la hace más ANCHA, no más grande: el % sigue justo", () => {
  const cara = caraDe(MUEBLES[2].mueble);     // 3 m, tres módulos
  const parantes = cara.exclusiones.filter((e) => e.por === "parante" && e.u0 > 0.1 && e.u1 < 0.9);
  assert.ok(parantes.length >= 2, "la góndola de tres módulos no tiene parantes en el medio: la prueba no prueba nada");
  const p = parantes[0];
  const antes = PZ.franja(cara, 1000, p.u0 - 0.05, "derecha");
  exacta(antes, 1000, cara, "cruzando el parante");
  const sin = PZ.franja(cara, 1000, 0.05, "derecha");
  assert.ok(antes.u1 - antes.u0 > sin.u1 - sin.u0 + (p.u1 - p.u0) * 0.9, "la que cruza el parante no es más ancha");
});

await prueba("Estantes exacta: con el ancho fijo y apoyada en un estante, la altura sale sola (todos los muebles)", () => {
  for (const { nombre, mueble } of MUEBLES) {
    const cara = caraDe(mueble);
    const b = PZ.bordesUtiles(cara.exclusiones);
    for (const pb of [100, 1700, 1750, 3000]) {
      for (const [u0, u1] of [[b.u0, b.u1], [b.u0, (b.u0 + b.u1) / 2 + 0.11]]) {
        const r = PZ.estantes(cara, pb, u0, u1, b.v0);
        if ((u1 - u0) < 0.6 && pb > 3000) continue;
        exacta(r, pb, cara, `${nombre} estantes ${pb}`);
        assert.equal(r.u0, G.cuantizarNumero(u0));
        assert.equal(r.u1, G.cuantizarNumero(u1));
        assert.equal(r.v0, G.cuantizarNumero(b.v0), `${nombre}: no se apoyó en el estante de abajo`);
        casos.push({ nombre: `${nombre} · estantes ${pb} pb`, mueble, pb, piezas: [{ s: 1, pb, vertices: PZ.poligonoDeRect(r) }] });
      }
    }
  }
});

await prueba("estirar conserva el %: más ancha → más baja; más alta → más angosta; y no se pasa nunca", () => {
  for (const { nombre, mueble } of MUEBLES) {
    const cara = caraDe(mueble);
    const pb = 3000;
    const f = PZ.franja(cara, pb, 0, "derecha");
    const ancha = PZ.estirar(cara, pb, f, "e", Math.min(1, f.u1 + 0.25), 0);
    exacta(ancha, pb, cara, `${nombre}: estirada hacia la derecha`);
    assert.ok(ancha.u1 > f.u1 && ancha.v1 - ancha.v0 < f.v1 - f.v0, `${nombre}: más ancha no la hizo más baja`);
    const baja = PZ.estirar(cara, pb, ancha, "n", ancha.v1 - 0.1, 0);
    if (baja) {
      exacta(baja, pb, cara, `${nombre}: más baja`);
      assert.ok(baja.u1 - baja.u0 > ancha.u1 - ancha.u0 - 1e-9, `${nombre}: más baja no la hizo más ancha`);
    }
    casos.push({ nombre: `${nombre} · estirada`, mueble, pb, piezas: [{ s: 1, pb, vertices: PZ.poligonoDeRect(ancha) }] });
  }
});

const cuantoSePisan = (a, b, cara) => G.areaCubierta([PZ.poligonoDeRect(a)], cara.exclusiones, [PZ.poligonoDeRect(b)]) * cara.ancho * cara.alto;

await prueba("«Acomodar solas»: en el orden de la lista, una al lado de la otra, cada una justa y sin pisarse (todos los muebles)", () => {
  const LISTA = [{ spaceId: 11, pb: 3000 }, { spaceId: 12, pb: 1750 }, { spaceId: 13, pb: 1700 }, { spaceId: 14, pb: 2500 }, { spaceId: 15, pb: 100 }];
  for (const { nombre, mueble } of MUEBLES) {
    const cara = caraDe(mueble);
    const puestas = PZ.acomodarSolas(cara, LISTA, [], () => true);
    assert.equal(puestas.size, LISTA.length, `${nombre}: quedaron piezas sin ubicar (${puestas.size} de ${LISTA.length})`);
    let antes = null;
    for (const p of LISTA) {
      const rr = puestas.get(p.spaceId);
      exacta(rr, p.pb, cara, `${nombre}: la ${p.spaceId}`);
      const bb = PZ.bordesUtiles(cara.exclusiones);
      assert.ok(rr.v0 === bb.v0 && rr.v1 === bb.v1, `${nombre}: acomodar no armó franjas`);
      if (!antes) assert.equal(rr.u0, bb.u0, `${nombre}: la primera no arranca donde arranca lo que se vende`);
      if (antes) assert.equal(rr.u0, antes.u1, `${nombre}: la ${p.spaceId} no va pegada a la anterior`);
      antes = rr;
    }
    for (const a of LISTA) for (const b of LISTA) {
      if (a.spaceId < b.spaceId) assert.ok(cuantoSePisan(puestas.get(a.spaceId), puestas.get(b.spaceId), cara) <= G.AREA_MINIMA_M2, `${nombre}: ${a.spaceId} y ${b.spaceId} se pisan`);
    }
    // Lo que diría el servidor: `juzgar` con contratos vivos que se cruzan en fechas → ni EXCESO ni SOLAPE.
    const terminos = new Map(LISTA.map((p, i) => [p.spaceId, [{ id: i + 1, spaceId: p.spaceId, numero: i + 1, estado: "contrato", pb: p.pb, supplierId: i + 1,
      marca: null, desde: "2026-10-01", hasta: "2027-03-31", caduca: null, bajaFecha: null, lease: { isActive: true, startDate: "2026-10-01", endDate: "2027-03-31" } }]]));
    const zonas = LISTA.map((p) => ({ participacionSpaceId: p.spaceId, vertices: PZ.poligonoDeRect(puestas.get(p.spaceId)) }));
    const j = P.juzgar(G.medir(zonas, { exclusiones: cara.exclusiones, ancho: cara.ancho, alto: cara.alto }), terminos, "2026-10-24");
    assert.deepEqual(j.errores.map((e) => e.codigo), [], `${nombre}: ${j.errores.map((e) => e.frase).join(" · ")}`);
    for (const p of LISTA) {
      const c = j.cuentas.get(p.spaceId);
      assert.deepEqual([c.dibujado, c.pendiente, c.exceso], [p.pb, 0, 0], `${nombre}: la ${p.spaceId} no quedó justa`);
    }
    casos.push({ nombre: `${nombre} · acomodadas solas`, mueble, pb: null, piezas: LISTA.map((p) => ({ s: p.spaceId, pb: p.pb, vertices: PZ.poligonoDeRect(puestas.get(p.spaceId)) })) });
  }
});

await prueba("«Acomodar solas» con la cara entera vendida (40 + 35 + 25, 50 + 50, 100): entran todas, la última termina donde termina lo que se vende (todos los muebles)", () => {
  // La ronda de verificación (2026-10-24): con el redondeo a pb, la última
  // necesitaba hasta el borde de la CARA y quedaba sin ubicar.
  for (const { nombre, mueble } of MUEBLES) {
    const cara = caraDe(mueble);
    const b = PZ.bordesUtiles(cara.exclusiones);
    for (const lista of [[4000, 3500, 2500], [5000, 5000], [10000], [3333, 3333, 3334]]) {
      const L = lista.map((pb, i) => ({ spaceId: 20 + i, pb }));
      const puestas = PZ.acomodarSolas(cara, L, [], () => true);
      assert.equal(puestas.size, L.length, `${nombre}: ${lista.join(" + ")} — quedaron sin ubicar ${L.length - puestas.size}`);
      for (const p of L) {
        const r = puestas.get(p.spaceId);
        exacta(r, p.pb, cara, `${nombre}: ${lista.join(" + ")}, la de ${p.pb}`);
        assert.ok(r.u0 >= b.u0 - 1e-9 && r.u1 <= b.u1 + 1e-9, `${nombre}: ${lista.join(" + ")} se sale de lo que se vende`);
      }
      casos.push({ nombre: `${nombre} · acomodadas ${lista.join(" + ")}`, mueble, pb: null, piezas: L.map((p) => ({ s: p.spaceId, pb: p.pb, vertices: PZ.poligonoDeRect(puestas.get(p.spaceId)) })) });
    }
  }
});

await prueba("«Acomodar solas» respeta lo ya ubicado y las fechas: lo fijo no se toca; dos marcas que no se cruzan comparten el lugar", () => {
  const cara = caraDe(MUEBLES[0].mueble);
  const fija = PZ.franja(cara, 5000, 0, "derecha");
  const fijas = [{ spaceId: 4, poligonos: [PZ.poligonoDeRect(fija)] }];
  const puestas = PZ.acomodarSolas(cara, [{ spaceId: 5, pb: 3000 }], fijas, () => true);
  exacta(puestas.get(5), 3000, cara, "al lado de la fija");
  assert.equal(puestas.get(5).u0, fija.u1, "no quedó pegada a la que ya estaba");
  // Si sus fechas no se cruzan, la 5 puede ir en el mismo lugar que la 4.
  const juntas = PZ.acomodarSolas(cara, [{ spaceId: 5, pb: 3000 }], fijas, () => false);
  assert.equal(juntas.get(5).u0, PZ.bordesUtiles(cara.exclusiones).u0, "con fechas que no se cruzan, la 5 no usó el lugar de la 4");
  // Lo que no entra queda sin ubicar.
  const llena = PZ.acomodarSolas(cara, [{ spaceId: 6, pb: 6000 }], fijas, () => true);
  assert.equal(llena.size, 0, "una pieza que no entra se ubicó igual");
});

console.log("piezas · soltar, encajar y chocar");

await prueba("soltar en lo verde encaja pegada al costado de la otra marca; soltar encima dice a quién pisa", () => {
  const cara = caraDe(MUEBLES[0].mueble);
  const aseo = PZ.franja(cara, 5000, 0, "derecha");
  const ocupados = [{ spaceId: 4, poligonos: [PZ.poligonoDeRect(aseo)] }];
  // Soltada cerca del borde de Aseo (en lo verde): se pega a ella.
  const r1 = PZ.encajar(cara, 3000, "franja", aseo.u1 + 0.17, 0.5, ocupados, { radio: 0.04 });
  exacta(r1, 3000, cara, "encajada");
  assert.equal(r1.u0, aseo.u1, "no se pegó al costado de Aseo");
  assert.equal(PZ.primeraQuePisa([PZ.poligonoDeRect(r1)], ocupados, cara), null);
  // Soltada contra el borde derecho: se pega a la derecha.
  const r2 = PZ.encajar(cara, 3000, "franja", 0.92, 0.5, ocupados, { radio: 0.04 });
  exacta(r2, 3000, cara, "contra la derecha");
  assert.equal(r2.u1, PZ.bordesUtiles(cara.exclusiones).u1, "no se pegó al borde derecho de lo que se vende");
  // Soltada encima de Aseo: el % sigue justo, pero pisa a la 4.
  const r3 = PZ.encajar(cara, 3000, "franja", 0.2, 0.5, ocupados, { radio: 0.01 });
  exacta(r3, 3000, cara, "encima");
  assert.equal(PZ.primeraQuePisa([PZ.poligonoDeRect(r3)], ocupados, cara), 4, "soltar encima de otra marca no dice a quién pisa");
  // Nunca sale de la cara, aunque se suelte afuera.
  for (const u of [-0.5, 1.5]) {
    const r4 = PZ.encajar(cara, 3000, "franja", u, 0.5, [], {});
    exacta(r4, 3000, cara, `soltada en u = ${u}`);
  }
});

await prueba("soltar una pieza GRANDE cerca del medio: 60, 70, 90 y 100 % en una cara vacía (todos los muebles) y en un hueco parcial, siempre exacta y adentro del hueco", () => {
  // La ronda de prueba (2026-10-24): el ancho se medía desde el puntero hacia
  // un solo lado y una pieza de 60 % soltada en u = 0,5 no se ubicaba.
  for (const { nombre, mueble } of MUEBLES) {
    const cara = caraDe(mueble);
    const b = PZ.bordesUtiles(cara.exclusiones);
    for (const [pb, us] of [[6000, [0.5]], [7000, [0.4, 0.5, 0.6]], [9000, [0.2, 0.35, 0.5, 0.65, 0.8]], [10000, [0.5, 0.1, 0.9]]]) {
      for (const u of us) {
        const r = PZ.encajar(cara, pb, "franja", u, 0.5, [], { radio: 0.03 });
        exacta(r, pb, cara, `${nombre}: ${pb} pb soltada en u = ${u}`);
        assert.ok(r.u0 >= b.u0 - 1e-9 && r.u1 <= b.u1 + 1e-9, `${nombre}: ${pb} pb en u = ${u} se sale de lo que se vende`);
        assert.ok(r.v0 === b.v0 && r.v1 === b.v1, `${nombre}: ${pb} pb en u = ${u} no es una franja`);
        // Centrada en el puntero salvo que choque con un borde.
        const centro = (r.u0 + r.u1) / 2;
        assert.ok(Math.abs(centro - u) < 0.03 || r.u0 === b.u0 || r.u1 === b.u1, `${nombre}: ${pb} pb en u = ${u} quedó lejos (${centro})`);
      }
    }
    // Lo mismo al cambiar la forma de una de Estantes a Franja (la cuenta de «cambiarForma»).
    const est = PZ.estantes(cara, 7000, b.u0, b.u1, b.v0);
    if (est) {
      const f = PZ.encajar(cara, 7000, "franja", (est.u0 + est.u1) / 2, (est.v0 + est.v1) / 2, [], { radio: 0.03 });
      exacta(f, 7000, cara, `${nombre}: de Estantes a Franja con 70 %`);
    }
  }
  // En un hueco parcial: 30 % ocupado a la izquierda y la de 60 % (o 70 %) soltada en el medio de lo verde.
  const cara = caraDe(MUEBLES[0].mueble);
  const b = PZ.bordesUtiles(cara.exclusiones);
  const aseo = PZ.franja(cara, 3000, 0, "derecha");
  const ocupados = [{ spaceId: 4, poligonos: [PZ.poligonoDeRect(aseo)] }];
  for (const pb of [6000, 7000]) {
    for (const u of [aseo.u1 + 0.1, (aseo.u1 + b.u1) / 2, b.u1 - 0.1]) {
      const r = PZ.encajar(cara, pb, "franja", u, 0.5, ocupados, { radio: 0.03 });
      exacta(r, pb, cara, `${pb} pb en el hueco, soltada en u = ${u.toFixed(3)}`);
      assert.ok(r.u0 >= aseo.u1 - 1e-9 && r.u1 <= b.u1 + 1e-9, `${pb} pb se sale del hueco (${r.u0}–${r.u1})`);
      assert.equal(PZ.primeraQuePisa([PZ.poligonoDeRect(r)], ocupados, cara), null, `${pb} pb en el hueco pisa a la otra`);
      casos.push({ nombre: `góndola doble 1,80 · ${pb} pb soltada en el hueco (u ${u.toFixed(3)})`, mueble: MUEBLES[0].mueble, pb: null,
        piezas: [{ s: 4, pb: 3000, vertices: PZ.poligonoDeRect(aseo) }, { s: 5, pb, vertices: PZ.poligonoDeRect(r) }] });
    }
  }
  // Y en el hueco de en medio (dos piezas a los costados): la de 40 % entra justa.
  const otra = PZ.franja(cara, 3000, 1, "izquierda");
  const dos = [...ocupados, { spaceId: 6, poligonos: [PZ.poligonoDeRect(otra)] }];
  const medio = PZ.encajar(cara, 4000, "franja", 0.5, 0.5, dos, { radio: 0.03 });
  exacta(medio, 4000, cara, "40 % entre dos de 30 %");
  assert.deepEqual([medio.u0, PZ.primeraQuePisa([PZ.poligonoDeRect(medio)], dos, cara)], [aseo.u1, null]);
  // Lo que no entra en el hueco se ve (pisa), nunca se achica.
  const grande = PZ.encajar(cara, 8000, "franja", 0.6, 0.5, ocupados, { radio: 0.03 });
  exacta(grande, 8000, cara, "80 % donde quedan 70 %");
  assert.equal(PZ.primeraQuePisa([PZ.poligonoDeRect(grande)], ocupados, cara), 4, "una pieza que no entra en el hueco no dice a quién pisa");
});

await prueba("ubicar sin arrastrar (teclado y menú): el primer hueco libre, y el lugar siguiente a la izquierda o a la derecha, siempre exacta y sin pisar", () => {
  const cara = caraDe(MUEBLES[0].mueble);
  const b = PZ.bordesUtiles(cara.exclusiones);
  const aseo = PZ.franja(cara, 3000, 0, "derecha");
  const ocupados = [{ spaceId: 4, poligonos: [PZ.poligonoDeRect(aseo)] }];
  const primero = PZ.ubicarSinArrastrar(cara, 2000, "franja", ocupados, null, "primero");
  exacta(primero, 2000, cara, "en el primer hueco");
  assert.equal(primero.u0, aseo.u1, "el primer hueco libre no es el de al lado de Aseo");
  const derecha = PZ.ubicarSinArrastrar(cara, 2000, "franja", ocupados, null, "derecha");
  exacta(derecha, 2000, cara, "a la derecha");
  assert.equal(derecha.u1, b.u1, "«a la derecha» no la pegó al borde derecho");
  // Las flechas: desde el primer lugar, a la derecha va al borde derecho del hueco; de ahí, a la izquierda vuelve.
  const sig = PZ.ubicarSinArrastrar(cara, 2000, "franja", ocupados, primero, "derecha");
  assert.deepEqual(sig, derecha);
  assert.deepEqual(PZ.ubicarSinArrastrar(cara, 2000, "franja", ocupados, sig, "izquierda"), primero);
  assert.equal(PZ.ubicarSinArrastrar(cara, 2000, "franja", ocupados, primero, "izquierda"), null, "a la izquierda de Aseo no hay lugar: no debería moverse");
  // Con dos huecos (Aseo en el medio), salta de hueco en hueco.
  const medio = PZ.franja(cara, 3000, 0.35, "derecha");
  const oc2 = [{ spaceId: 4, poligonos: [PZ.poligonoDeRect(medio)] }];
  const L = PZ.lugaresPosibles(cara, 2000, "franja", oc2, null);
  assert.ok(L.length === 4, `en dos huecos hay 4 lugares (${L.length})`);
  for (const r of L) {
    exacta(r, 2000, cara, "un lugar posible");
    assert.equal(PZ.primeraQuePisa([PZ.poligonoDeRect(r)], oc2, cara), null);
  }
  let x = PZ.ubicarSinArrastrar(cara, 2000, "franja", oc2, null, "izquierda");
  const visitados = [x.u0];
  for (let k = 0; k < 6; k++) { const y = PZ.ubicarSinArrastrar(cara, 2000, "franja", oc2, x, "derecha"); if (!y) break; x = y; visitados.push(x.u0); }
  assert.deepEqual(visitados, L.map((r) => r.u0), "las flechas no recorren los lugares en orden");
  // Estantes: conserva el ancho y el estante.
  const est = PZ.estantes(cara, 1500, aseo.u1, aseo.u1 + 0.3, b.v0);
  const movida = PZ.ubicarSinArrastrar(cara, 1500, "estantes", ocupados, est, "derecha");
  exacta(movida, 1500, cara, "estantes movida");
  assert.ok(Math.abs((movida.u1 - movida.u0) - (est.u1 - est.u0)) < 1e-6 && movida.v0 === est.v0, "la de Estantes cambió de ancho o de estante");
  // Llena: no hay a dónde.
  const llena = [{ spaceId: 4, poligonos: [PZ.poligonoDeRect(PZ.franja(cara, 9000, 0, "derecha"))] }];
  assert.equal(PZ.ubicarSinArrastrar(cara, 2000, "franja", llena, null, "primero"), null);
});

await prueba("el rótulo dice lo que HAY: justa, su %; pasada o corta, lo medido y cuánto sobra o falta", () => {
  assert.deepEqual(PZ.rotuloDeLoQueHay(3000, 3000), { texto: "30 %", justo: true });
  assert.deepEqual(PZ.rotuloDeLoQueHay(3000, 4242), { texto: "42,42 % · sobra 12,42 %", justo: false });
  assert.deepEqual(PZ.rotuloDeLoQueHay(3000, 2500), { texto: "25 % · faltan 5 %", justo: false });
});

await prueba("Estantes al soltar: toma el ancho del hueco y se apoya en el estante más cercano", () => {
  const m = MUEBLES[0].mueble;
  const cara = caraDe(m);
  const aseo = PZ.franja(cara, 5000, 0, "derecha");
  const ocupados = [{ spaceId: 4, poligonos: [PZ.poligonoDeRect(aseo)] }];
  const r = PZ.encajar(cara, 3000, "estantes", 0.75, 0.3, ocupados, { radio: 0.03 });
  exacta(r, 3000, cara, "estantes en el hueco");
  assert.equal(r.u0, aseo.u1, "no tomó el hueco desde la otra marca");
  assert.equal(r.u1, PZ.bordesUtiles(cara.exclusiones).u1, "no tomó el hueco hasta el borde de lo que se vende");
  const lineas = PZ.lineasDeLaCara(cara).vs;
  assert.ok(lineas.includes(r.v0), `no se apoyó en un estante (${r.v0})`);
  assert.equal(PZ.primeraQuePisa([PZ.poligonoDeRect(r)], ocupados, cara), null);
  casos.push({ nombre: "góndola doble 1,80 · franja y estantes", mueble: m, pb: null,
    piezas: [{ s: 4, pb: 5000, vertices: PZ.poligonoDeRect(aseo) }, { s: 5, pb: 3000, vertices: PZ.poligonoDeRect(r) }] });
});

console.log("piezas · «A mano»");

await prueba("«A mano»: un lado casi recto queda recto, se alinea con los puntos puestos y dice por dónde (guías) — el dueño, 2026-10-29", () => {
  const sin = { us: [0, 1], vs: [0, 1] };
  const radio = { u: 0.02, v: 0.02 };
  // Lejos del anterior y torcido 3°: se endereza en vertical.
  const r1 = PZ.imantarConGuias([0.3 + 0.4 * Math.tan(3 * Math.PI / 180), 0.8], sin, radio, [[0.3, 0.4]]);
  assert.equal(r1.punto[0], 0.3, "el lado casi vertical no quedó recto");
  assert.equal(r1.guias.u, 0.3);
  assert.equal(r1.guias.v, null);
  // Torcido 3° en horizontal: se endereza en horizontal.
  const r2 = PZ.imantarConGuias([0.8, 0.4 + 0.4 * Math.tan(3 * Math.PI / 180)], sin, radio, [[0.3, 0.8], [0.4, 0.4]]);
  assert.equal(r2.punto[1], 0.4);
  assert.equal(r2.guias.v, 0.4);
  // Torcido 20°: es una diagonal a propósito, no se toca.
  const d = [0.3 + 0.4 * Math.tan(20 * Math.PI / 180), 0.8];
  const r3 = PZ.imantarConGuias(d, sin, radio, [[0.3, 0.4]]);
  assert.deepEqual(r3.guias, { u: null, v: null });
  // El que cierra: se alinea con el PRIMER punto (no sólo con el anterior).
  const r4 = PZ.imantarConGuias([0.305, 0.795], sin, radio, [[0.3, 0.4], [0.7, 0.4], [0.7, 0.8]]);
  assert.deepEqual(r4.punto, [0.3, 0.8], "el último punto no cerró en ángulo recto");
  // Empalma con otra forma: su lado y su esquina son líneas del imán.
  const otra = PZ.lineasDeOcupados([{ spaceId: 9, poligonos: [[[0.5, 0], [0.62, 0], [0.62, 0.55], [0.5, 0.55]]] }]);
  const r5 = PZ.imantarConGuias([0.627, 0.546], { us: [0, 1, ...otra.us], vs: [0, 1, ...otra.vs] }, radio, []);
  assert.deepEqual(r5.punto, [0.62, 0.55], "no empalmó con la esquina de la otra forma");
  assert.deepEqual(r5.guias, { u: 0.62, v: 0.55 });
  // Sin trazo, lo de siempre.
  assert.deepEqual(PZ.imantarAMano([0.5, 0.5], sin, radio), [0.5, 0.5]);
});

await prueba("«A mano»: la L del dibujo aprobado (dos estantes de abajo y una franja a la derecha) llega a 30 % justo con el imán", () => {
  const m = MUEBLES[0].mueble;
  const cara = caraDe(m);
  const b = PZ.bordesUtiles(cara.exclusiones);
  const aseo = PZ.franja(cara, 5000, 0, "derecha");
  const lineas = PZ.lineasDeLaCara(cara);
  const todas = { us: [...lineas.us, aseo.u1], vs: lineas.vs };
  const radio = { u: 0.02, v: 0.02 };
  // Los toques de la persona, aproximados: el imán los pega a las líneas.
  const est = cara.estantes.filter((v) => v > b.v0 + 0.01 && v < b.v1 - 0.01);
  const segundo = est[1];
  const toques = [[aseo.u1 + 0.004, b.v0 + 0.005], [aseo.u1 + 0.006, segundo - 0.004]];
  const pts = toques.map((p) => PZ.imantarAMano(p, todas, radio));
  assert.equal(pts[0][0], aseo.u1, "el primer punto no se pegó al costado de Aseo");
  assert.ok([G.cuantizarNumero(b.v0), ...lineas.vs].includes(pts[0][1]), `el primer punto no se pegó a una línea de abajo (${pts[0][1]})`);
  assert.equal(pts[1][1], G.cuantizarNumero(segundo), "el segundo punto no se pegó al estante");
  // El brazo de la L: buscar el ancho del brazo vertical que da 30 % justo.
  const armar = (x) => [pts[0], [b.u1, pts[0][1]], [b.u1, b.v1], [x, b.v1], [x, pts[1][1]], pts[1]];
  let lo = aseo.u1 + 0.01, hi = b.u1 - 0.01;
  for (let i = 0; i < 60; i++) { const mm = (lo + hi) / 2; if ((PZ.llevaAMano(armar(mm), cara) ?? 0) > 3000) lo = mm; else hi = mm; }
  let L = null;
  for (let k = 0; k < 400 && !L; k++) for (const s of [k, -k]) { const x = G.cuantizarNumero(hi + s * 1e-6); if (PZ.llevaAMano(armar(x), cara) === 3000) { L = armar(x); break; } }
  assert.ok(L, "la L no llegó a 30 % justo");
  assert.equal(PZ.llevaAMano(L, cara), 3000);
  const c = PZ.contadorAMano(PZ.llevaAMano(L, cara), 3000);
  assert.deepEqual([c.estado, c.titulo, c.texto], ["justo", "Justo", "Cerraste la forma con el % exacto."]);
  assert.equal(PZ.formaDeLoDibujado([L], cara.exclusiones), "a_mano");
  assert.equal(PZ.primeraQuePisa([L], [{ spaceId: 4, poligonos: [PZ.poligonoDeRect(aseo)] }], cara), null);
  casos.push({ nombre: "góndola doble 1,80 · la L a mano", mueble: m, pb: null,
    piezas: [{ s: 4, pb: 5000, vertices: PZ.poligonoDeRect(aseo) }, { s: 5, pb: 3000, vertices: L }] });
  // Pasándose: el brazo hasta arriba de todo.
  const pasada = [pts[0], [b.u1, pts[0][1]], [b.u1, 1], [hi - 0.02, 1], [hi - 0.02, pts[1][1]], pts[1]];
  const lleva = PZ.llevaAMano(pasada, cara);
  assert.ok(lleva > 3000);
  const cp = PZ.contadorAMano(lleva, 3000);
  assert.equal(cp.estado, "pasado");
  assert.equal(cp.titulo, "Te pasaste");
  assert.match(cp.texto, /^Sobra [\d,]+ %: sacá el último punto \(Retroceso\) o cerrala y tocá «Achicar a 30 %»\.$/);
  // Cerrada (se mira, no se dibuja): nada de «mové un punto»; achicar o rehacer.
  assert.match(PZ.contadorAMano(lleva, 3000, true).texto, /^Sobra [\d,]+ %: tocá «Achicar a 30 %» o «Rehacer a mano»\.$/);
  assert.equal(PZ.contadorAMano(2500, 3000, true).texto, "Faltan 5 %: tocá «Llevar a 30 %» o «Rehacer a mano».");
  // «Achicar a 30 %» reusa el ajuste de siempre y queda justo.
  const ach = E.ajustarAlContratado([pasada], cara.exclusiones, 3000, G.areaUtil(cara.exclusiones), [[PZ.poligonoDeRect(aseo)]], { ancho: cara.ancho, alto: cara.alto });
  assert.equal(G.dibujadoPb(ach, cara.exclusiones), 3000, "«Achicar» no dejó el 30 % justo");
});

await prueba("«A mano» cerca del contratado (±3 %) queda JUSTA corriendo el lado suelto; los pegados a estantes, bordes y a la otra marca no se mueven", () => {
  const m = MUEBLES[0].mueble;
  const cara = caraDe(m);
  const b = PZ.bordesUtiles(cara.exclusiones);
  const aseo = PZ.franja(cara, 5000, 0, "derecha");
  const l = PZ.lineasDeLaCara(cara);
  const lineas = { us: [...l.us, aseo.u1], vs: l.vs };
  const est = cara.estantes.filter((v) => v > b.v0 + 0.01 && v < b.v1 - 0.01);
  const vE = G.cuantizarNumero(est[1]);
  const otras = [PZ.poligonoDeRect(aseo)];
  const pegados = (P) => P.flatMap((p, i) => { const s = P[(i + 1) % P.length]; return p[0] === s[0] && lineas.us.includes(p[0]) ? [`u${p[0]}`] : p[1] === s[1] && lineas.vs.includes(p[1]) ? [`v${p[1]}`] : []; });
  let probadas = 0;
  for (const x of [b.u1 - 0.12, b.u1 - 0.16, b.u1 - 0.2, b.u1 - 0.26]) {
    // La L con el brazo puesto a ojo en x (no está pegado a nada).
    const L = [[aseo.u1, b.v0], [b.u1, b.v0], [b.u1, b.v1], [G.cuantizarNumero(x), b.v1], [G.cuantizarNumero(x), vE], [aseo.u1, vE]];
    const lleva = PZ.llevaAMano(L, cara);
    if (lleva === 3000 || Math.abs(lleva - 3000) > PZ.AJUSTE_SOLO_PB) continue;
    probadas++;
    const J = PZ.dejarJustaAMano(L, cara, 3000, otras, lineas);
    assert.ok(J, `la L de ${G.cuantizarNumero(x)} (lleva ${lleva}) no se dejó justa`);
    assert.equal(G.dibujadoPb([J], cara.exclusiones), 3000, "no quedó en 30 % justo");
    assert.equal(G.validarZona(J, cara.ancho, cara.alto).codigo, null, "la forma quedó inválida");
    assert.equal(PZ.primeraQuePisa([J], [{ spaceId: 4, poligonos: otras }], cara), null, "pisa a Aseo");
    assert.deepEqual(pegados(J), pegados(L), "se movió un lado pegado a una línea");
    const movidos = J.filter((p, i) => p[0] !== L[i][0] || p[1] !== L[i][1]).length;
    assert.equal(movidos, 2, "se movió más de un lado");
    for (const p of J) assert.ok(cuantizado(p[0]) && cuantizado(p[1]), "un vértice sin cuantizar");
    casos.push({ nombre: `góndola doble 1,80 · L a ojo (${lleva} pb) dejada justa`, mueble: m, pb: null,
      piezas: [{ s: 4, pb: 5000, vertices: PZ.poligonoDeRect(aseo) }, { s: 5, pb: 3000, vertices: J }] });
  }
  assert.ok(probadas >= 2, `sólo ${probadas} L cerca del 30 %`);
  // Lejos del contratado no se toca sola (eso lo decide la persona).
  assert.equal(PZ.AJUSTE_SOLO_PB, 300);
  // Todo pegado: un rectángulo de borde a borde se corre igual (sin `lineas`).
  const R = PZ.poligonoDeRect({ u0: aseo.u1, u1: b.u1, v0: b.v0, v1: b.v1 });
  const JR = PZ.dejarJustaAMano(R, cara, 3000, otras, lineas);
  assert.ok(JR && G.dibujadoPb([JR], cara.exclusiones) === 3000, "el rectángulo pegado a todo no se ajustó");
  assert.equal(PZ.primeraQuePisa([JR], [{ spaceId: 4, poligonos: otras }], cara), null);
  // Imposible (más de lo que entra): null, no una forma que pisa.
  assert.equal(PZ.ajustarUnLado(R, cara, 9000, otras, { us: [], vs: [] }), null);
});

await prueba("el contador: llevando, justo y pasado, con las palabras del dibujo; una forma que se cruza no cuenta", () => {
  assert.deepEqual(PZ.contadorAMano(0, 3000), { estado: "lleva", titulo: "Llevás", texto: "Faltan 30 %. Seguí tocando puntos; se pegan a los estantes, a los bordes y a la otra forma, y la línea punteada azul avisa cuando el lado va recto.", falta: 3000, sobra: 0 });
  assert.equal(PZ.contadorAMano(2000, 3000).texto, "Faltan 10 %. Seguí tocando puntos; se pegan a los estantes, a los bordes y a la otra forma, y la línea punteada azul avisa cuando el lado va recto.");
  assert.equal(PZ.contadorAMano(3400, 3000).texto, "Sobra 4 %: sacá el último punto (Retroceso) o cerrala y tocá «Achicar a 30 %».");
  assert.equal(PZ.contadorAMano(1750, 1750).estado, "justo");
  const cara = caraDe(MUEBLES[0].mueble);
  assert.equal(PZ.llevaAMano([[0.1, 0.1], [0.5, 0.5], [0.5, 0.1], [0.1, 0.5]], cara), null, "un moño se contó");
  assert.equal(PZ.llevaAMano([], cara), 0);
  assert.equal(PZ.llevaAMano([[0.1, 0.1], [0.2, 0.2]], cara), null);
  assert.equal(PZ.contadorAMano(null, 3000).texto, "Así la forma se cruza: sacá el último punto (Retroceso).");
  for (const x of [0, 2000, 3400, null]) for (const c of [false, true]) assert.ok(!/mové/.test(PZ.contadorAMano(x, 3000, c).texto), "el contador pide mover un punto (no se puede)");
});

await prueba("la forma de lo ya dibujado: franja, estantes o a mano", () => {
  const cara = caraDe(MUEBLES[0].mueble);
  const f = PZ.franja(cara, 3000, 0.2, "derecha");
  assert.equal(PZ.formaDeLoDibujado([PZ.poligonoDeRect(f)], cara.exclusiones), "franja");
  const e = PZ.estantes(cara, 3000, 0.1, 0.9, PZ.bordesUtiles(cara.exclusiones).v0);
  assert.equal(PZ.formaDeLoDibujado([PZ.poligonoDeRect(e)], cara.exclusiones), "estantes");
  assert.equal(PZ.formaDeLoDibujado([[[0.1, 0.1], [0.5, 0.1], [0.3, 0.6]]], cara.exclusiones), "a_mano");
  assert.equal(PZ.formaDeLoDibujado([PZ.poligonoDeRect(f), PZ.poligonoDeRect(e)], cara.exclusiones), "a_mano");
  assert.equal(PZ.formaDeLoDibujado([], cara.exclusiones), null);
  // Un rectángulo escrito en otro orden o sentido es el mismo rectángulo.
  assert.deepEqual(PZ.rectDePoligono([[0.5, 1], [0.5, 0], [0.2, 0], [0.2, 1]]), { u0: 0.2, v0: 0, u1: 0.5, v1: 1 });
  assert.equal(PZ.rectDePoligono([[0, 0], [1, 0], [1, 1], [0.1, 1]]), null);
});

await prueba("utils/piezas.ts es puro: sin DOM, reloj, navegador ni stores", () => {
  const t = readFileSync(join(raiz, "src", "utils", "piezas.ts"), "utf8").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
  assert.ok(!/document\.|window\.|requestAnimationFrame|Date\.now|new Date\(|localStorage|sessionStorage|indexedDB/.test(t), "piezas.ts no es puro");
  for (const m of t.matchAll(/^import\s+(type\s+)?[^;]*from\s+"([^"]+)"/gm)) {
    assert.ok(["./zonasGeometria", "./participaciones"].includes(m[2]), `piezas.ts importa ${m[2]}`);
  }
  // La cuenta es la del servidor: el % se mide con `dibujadoPb` y `areaCubierta`, nunca con un área propia.
  assert.match(t, /export function pbDeRect\(r: Rect, E: readonly Exclusion\[\]\): number \{\s*return dibujadoPb\(\[poligonoDeRect\(r\)\], E\);/);
  assert.match(t, /if \(pbDeRect\(r, E\) === pb && rectValido\(r, cara\)\) return r;/, "la pieza no se verifica con la cuenta del servidor antes de devolverla");
});

console.log("piezas · el reductor: ubicar, sacar y cerrar «A mano»");

await prueba("`ponerPiezas`: las zonas de cada marca nombrada pasan a ser EXACTAMENTE ésas, en UN paso de deshacer; las demás no se tocan; `[]` la saca; en «Mirar» nada", () => {
  const z = (clave, s, v) => ({ clave, participacionSpaceId: s, vertices: v });
  const cuad = (u0, v0, u1, v1) => [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
  const e0 = { ...E.estadoInicial(), zonas: [z("z1", 4, cuad(0, 0, 0.5, 1)), z("z2", 5, cuad(0.6, 0.1, 0.7, 0.3)), z("z3", 5, cuad(0.8, 0.1, 0.9, 0.3))], proxima: 3 };
  e0.base = e0.zonas;
  const nueva = cuad(0.5, 0, 0.8, 1);
  const e1 = E.reducir(e0, { tipo: "ponerPiezas", piezas: [{ spaceId: 5, vertices: [nueva] }] });
  assert.deepEqual(e1.zonas.map((x) => [x.clave, x.participacionSpaceId]), [["z1", 4], ["n3", 5]], "la marca 5 no quedó con UNA pieza (o se tocó la 4)");
  assert.deepEqual(e1.zonas[1].vertices, nueva);
  assert.deepEqual([e1.atras.length, e1.sucio, e1.proxima], [1, true, 4]);
  assert.deepEqual(E.reducir(e1, { tipo: "deshacer" }).zonas, e0.zonas, "deshacer no volvió exacto");
  // Varias de una vez («Acomodar solas»): un solo paso.
  const e2 = E.reducir({ ...e0, zonas: [], base: [] }, { tipo: "ponerPiezas", piezas: [{ spaceId: 4, vertices: [cuad(0, 0, 0.5, 1)] }, { spaceId: 5, vertices: [nueva] }] });
  assert.deepEqual([e2.zonas.length, e2.atras.length], [2, 1]);
  // Sacar: `[]`.
  const e3 = E.reducir(e1, { tipo: "ponerPiezas", piezas: [{ spaceId: 4, vertices: [] }] });
  assert.deepEqual(e3.zonas.map((x) => x.participacionSpaceId), [5]);
  // Lo mismo que ya había: el MISMO estado (no se redibuja ni apila).
  assert.equal(E.reducir(e3, { tipo: "ponerPiezas", piezas: [{ spaceId: 4, vertices: [] }] }), e3);
  // En «Mirar», nada.
  const mirar = { ...e0, modo: "mirar" };
  assert.equal(E.reducir(mirar, { tipo: "ponerPiezas", piezas: [{ spaceId: 5, vertices: [nueva] }] }), mirar);
  // Cuantiza como todo lo que escribe el editor.
  const e4 = E.reducir(e0, { tipo: "ponerPiezas", piezas: [{ spaceId: 4, vertices: [[[0.1234567, 0], [0.5, 0], [0.5, 1]]] }] });
  assert.equal(e4.zonas.find((x) => x.participacionSpaceId === 4).vertices[0][0], 0.123457);
});

await prueba("«A mano» cierra la forma como LA pieza de la marca (`cerrarTrazo` con `reemplazar`); sin `reemplazar`, como siempre (agrega)", () => {
  const z = (clave, s, v) => ({ clave, participacionSpaceId: s, vertices: v });
  const base = { ...E.estadoInicial(), herramienta: "poligono", activa: 5, proxima: 7,
    zonas: [z("z1", 4, [[0, 0], [0.5, 0], [0.5, 1], [0, 1]]), z("z2", 5, [[0.6, 0], [0.9, 0], [0.9, 1], [0.6, 1]])],
    trazo: [[0.5, 0.1], [0.8, 0.1], [0.8, 0.6], [0.5, 0.6]] };
  const r = E.reducir(base, { tipo: "cerrarTrazo", reemplazar: true });
  assert.deepEqual(r.zonas.map((x) => [x.clave, x.participacionSpaceId]), [["z1", 4], ["n7", 5]]);
  assert.deepEqual([r.trazo, r.atras.length], [null, 1]);
  const sin = E.reducir(base, { tipo: "cerrarTrazo" });
  assert.deepEqual(sin.zonas.map((x) => x.clave), ["z1", "z2", "n7"], "sin `reemplazar` cambió lo de siempre");
  assert.equal(E.reducir({ ...base, modo: "mirar" }, { tipo: "cerrarTrazo", reemplazar: true }).zonas, base.zonas);
});

console.log("piezas · los casos para el servidor (`casos/piezas.json`)");

await prueba("casos/piezas.json es lo que arma el navegador hoy (si cambia la cuenta, se regenera con --escribir y lo corre test_piezas_exactas.py)", () => {
  const contenido = JSON.stringify({
    leeme: "Generado por `npm run probar:piezas -- --escribir`. Los rectángulos y la L que arma `utils/piezas.ts`; `backend/tests/test_piezas_exactas.py` los pasa por la superficie, `medir` y `juzgar` del servidor: cada pieza da su pb justo, sin EXCESO ni SOLAPE.",
    casos,
  }, null, 1) + "\n";
  if (ESCRIBIR) { writeFileSync(RUTA_CASOS, contenido); console.log("       (escrito)"); return; }
  const actual = readFileSync(RUTA_CASOS, "utf8");
  assert.equal(actual, contenido, "casos/piezas.json no es lo que arma piezas.ts hoy: corré `npm run probar:piezas -- --escribir` y la prueba del servidor");
  assert.ok(casos.length >= 100, `pocos casos: ${casos.length}`);
});

console.log(`\n${hechas} pruebas de piezas en verde`);
