/**
 * Pruebas de las reglas de las participaciones de cara (`src/utils/participaciones.ts`).
 *   npm run probar:distribucion
 *
 * ── Por qué existe este archivo ──────────────────────────────────────────────
 *
 * Una cara se vende por participación: el 25 % para una marca, el 30 % para
 * otra. Qué término cuenta un día, cuánto queda para vender, si un cambio de
 * término contradice a los otros de su participación y si una distribución
 * (las zonas dibujadas) se puede confirmar, se decide con la MISMA cuenta en
 * dos lugares: acá, en la pantalla, mientras la dueña carga o dibuja, y en
 * `backend/app/services/reglas_participacion.py`, que decide con el candado
 * tomado. Si se separan, el formulario dice «queda 40 %» y el servidor
 * contesta 409. Por eso:
 *
 *   · **Los mismos casos en los dos lados** (`casos/participaciones.json`, que
 *     también corre `tests/test_participaciones_reglas.py`), con las frases
 *     letra por letra: los pedidos del cliente (Caso A, B, D, E, G) y los
 *     bordes (el día de empalme, la baja a las 21:00, el pasado que no se
 *     valida, el bisiesto).
 *   · **Las dos reglas que se tienen que dar la razón**: lo que cuenta un día
 *     (§3.3) es exactamente lo que suma la capacidad (§3.4); el pico es el de
 *     contar día por día; la capacidad dice «entra» justo cuando lo pedido
 *     cabe en lo disponible.
 *   · **Gemelas de verdad**: cada función pública de un lado tiene su gemela
 *     del otro, y ninguna pregunta la hora (el `hoy` lo manda el servidor).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = join(aqui, "..");
const leer = (p) => readFileSync(p, "utf8");
const CASOS = JSON.parse(leer(join(aqui, "casos", "participaciones.json")));
const SUPERFICIES = JSON.parse(leer(join(aqui, "casos", "superficies.json")));
const HOY = CASOS.hoy;
const RUTA_TS = join(raiz, "src", "utils", "participaciones.ts");
const RUTA_PY = join(raiz, "..", "backend", "app", "services", "reglas_participacion.py");

let hechas = 0;
const prueba = async (n, fn) => {
  try { await fn(); hechas++; console.log("  ok   " + n); }
  catch (e) { console.error("  FALLA " + n + "\n         " + e.message.split("\n").join("\n         ")); process.exitCode = 1; }
};

const r = await build({
  stdin: {
    contents: 'export * as P from "./src/utils/participaciones.ts"; export * as G from "./src/utils/zonasGeometria.ts";',
    resolveDir: raiz, loader: "ts",
  },
  bundle: true, write: false, format: "esm", platform: "neutral", logLevel: "silent",
});
const { P, G } = await import("data:text/javascript;base64," + Buffer.from(r.outputFiles[0].text).toString("base64"));

// ── Lo que los casos dan a medias (las dos suites completan igual) ───────────
const termino = (t, d) => ({
  id: t.id ?? d.id, spaceId: t.spaceId ?? d.spaceId, numero: t.numero ?? d.numero,
  estado: t.estado, pb: t.pb ?? 0, supplierId: t.supplierId ?? 1, marca: t.marca ?? null,
  desde: t.desde ?? t.lease?.startDate ?? null, hasta: t.hasta ?? t.lease?.endDate ?? null,
  caduca: t.caduca ?? null, bajaFecha: t.bajaFecha ?? null, lease: t.lease ?? null,
});
const lista = (ts, spaceId = 1, numero = 1) => ts.map((t, i) => termino(t, { id: i + 1, spaceId, numero }));
const deS = (ts, s, numero) => ts.map((t, i) => termino(t, { id: s * 100 + i + 1, spaceId: s, numero }));
const superficieDe = (ref) => {
  const c = SUPERFICIES.casos.find((x) => x.nombre === ref.slice("superficie:".length));
  assert.ok(c && c.superficie && typeof c.superficie === "object", `«${ref}» no es una superficie de casos/superficies.json`);
  return c.superficie;
};
const circulo = (n) => Array.from({ length: n }, (_, k) => [0.5 + 0.4 * Math.cos(2 * Math.PI * k / n), 0.5 + 0.4 * Math.sin(2 * Math.PI * k / n)]);
const verticesDe = (v) => (typeof v === "string" && v.startsWith("circulo:") ? circulo(Number(v.slice(8))) : v);
const medirCon = (sup, zonas) => G.medir(zonas, { exclusiones: sup.exclusiones, ancho: sup.ancho, alto: sup.alto });
const cuentasComo = (cuentas, esperadas, quien) => {
  for (const [s, campos] of Object.entries(esperadas)) {
    const c = cuentas.get(Number(s));
    assert.ok(c, `${quien}: no hay cuenta de ${s}`);
    for (const [k, v] of Object.entries(campos)) assert.deepEqual(c[k], v, `${quien}: ${k} de ${s}`);
  }
};

console.log("distribución · los casos compartidos con el servidor");

await prueba("las constantes son las del diseño (§3.1)", () => {
  for (const [k, v] of Object.entries(CASOS.constantes)) assert.equal(P[k], v, k);
});

await prueba(`porcentajes en texto (${CASOS.porcentajes.length} + ${CASOS.deTexto.length} casos)`, () => {
  for (const c of CASOS.porcentajes) assert.equal(P.pct(c.pb), c.texto, `pct(${c.pb})`);
  for (const c of CASOS.deTexto) assert.equal(P.pbDeTexto(c.texto), c.pb, `pbDeTexto(${JSON.stringify(c.texto)})`);
});

await prueba(`estado que se muestra y vivo (${CASOS.estados.length} casos)`, () => {
  for (const c of CASOS.estados) {
    const [t] = lista([c.termino]);
    assert.equal(P.estadoVisible(t, HOY), c.estado_visible, `${c.nombre}: estado`);
    assert.equal(P.vivo(t, HOY), c.vivo, `${c.nombre}: vivo`);
    assert.equal(P.rige([t], HOY), c.vivo, `${c.nombre}: rige`);
  }
});

await prueba(`qué cuenta un día (${CASOS.cuentaElDia.length} + ${CASOS.cuentaEseDia.length} casos)`, () => {
  for (const c of CASOS.cuentaElDia) {
    const [t] = lista([c.termino]);
    for (const [d, v] of Object.entries(c.dias)) assert.equal(P.cuentaElDia(t, d, HOY), v, `${c.nombre}: ${d}`);
  }
  for (const c of CASOS.cuentaEseDia) {
    const ts = lista(c.terminos);
    for (const [d, v] of Object.entries(c.dias)) assert.equal(P.cuentaEseDia(ts, d, HOY), v, `${c.nombre}: ${d}`);
  }
});

await prueba(`el pico de la suma diaria (${CASOS.pico.length} casos)`, () => {
  for (const c of CASOS.pico) assert.deepEqual(P.pico(c.intervalos, c.desde, c.hasta), { pb: c.pb, dia: c.dia }, c.nombre);
});

await prueba(`capacidad y disponible (${CASOS.capacidad.length} casos)`, () => {
  for (const c of CASOS.capacidad) {
    const I = P.intervalosQueCuentan(lista(c.terminos), c.fisicos, HOY);
    const a = c.desde > HOY ? c.desde : HOY;
    const p = P.pico(I, a, c.hasta);
    assert.equal(p.pb, c.pico, `${c.nombre}: pico`);
    if ("dia" in c) assert.equal(p.dia, c.dia, `${c.nombre}: día del pico`);
    assert.equal(P.disponible(I, c.desde, c.hasta, HOY), c.disponible, `${c.nombre}: disponible`);
  }
});

await prueba(`la regla de capacidad (${CASOS.revisar.length} casos)`, () => {
  for (const c of CASOS.revisar) {
    const I = P.intervalosQueCuentan(lista(c.existentes), c.fisicos, HOY, c.pide.excluir ?? null);
    const x = P.revisarCapacidad(I, c.fisicos, c.pide.pb, c.pide.desde, c.pide.hasta, c.cara ?? "A", HOY);
    assert.equal(x?.codigo ?? null, c.codigo, c.nombre);
    if ("frase" in c) assert.equal(x.frase, c.frase, `${c.nombre}: la frase`);
    if ("dia" in c) assert.equal(x.extra.dia, c.dia, `${c.nombre}: el día`);
    if ("disponiblePb" in c) assert.equal(x.extra.disponiblePb, c.disponiblePb, `${c.nombre}: lo disponible`);
    if (x?.codigo === "cara_vendida_entera") assert.deepEqual(x.extra, {}, `${c.nombre}: sin extra`);
  }
});

await prueba(`las invariantes de los términos (${CASOS.terminos.length} casos)`, () => {
  for (const c of CASOS.terminos) {
    const x = P.revisarTerminos(lista(c.de, 1, 3), c.cambio, HOY);
    assert.equal(x?.codigo ?? null, c.codigo, c.nombre);
    if ("frase" in c) assert.equal(x.frase, c.frase, `${c.nombre}: la frase`);
    if (x) assert.deepEqual(x.extra, {}, `${c.nombre}: sin extra`);
  }
});

/** Las zonas del caso, en orden, como las manda el navegador. */
const zonasDelCaso = (c) => (c.zonas
  ? c.zonas.map((z) => ({ participacionSpaceId: z.s, vertices: verticesDe(z.vertices) }))
  : c.participaciones.flatMap((p) => (p.zonas ?? []).map((v) => ({ participacionSpaceId: p.spaceId, vertices: verticesDe(v) }))));

await prueba(`el juicio de una distribución (${CASOS.distribucion.length} casos)`, () => {
  for (const c of CASOS.distribucion) {
    const sup = superficieDe(c.superficie);
    const m = medirCon(sup, zonasDelCaso(c));
    const porS = new Map(c.participaciones.map((p) => [p.spaceId, deS(p.terminos, p.spaceId, p.numero)]));
    const j = P.juzgar(m, porS, HOY, { confirmada: !!c.confirmada, firmaCambio: !!c.firmaCambio, orientacion: sup.orientacion });
    assert.deepEqual(j.errores.map((p) => p.codigo), c.errores, `${c.nombre}: errores`);
    assert.deepEqual(j.avisos.map((p) => p.codigo), c.avisos, `${c.nombre}: avisos`);
    if (c.detalle) assert.deepEqual([...j.errores, ...j.avisos], c.detalle, `${c.nombre}: el detalle`);
    if (c.cuentas) cuentasComo(j.cuentas, c.cuentas, c.nombre);
    for (const p of [...j.errores, ...j.avisos]) {
      assert.deepEqual(p.participaciones, [...p.participaciones].sort((a, b) => a - b), `${c.nombre}: números desordenados`);
    }
    if (c.disponible) {
      const todos = [...porS.values()].flat();
      const I = P.intervalosQueCuentan(todos, [], HOY);
      assert.equal(P.disponible(I, c.disponible.desde, c.disponible.hasta, HOY), c.disponible.pb, `${c.nombre}: lo disponible`);
    }
  }
});

const mapaDe = (porS) => new Map(Object.entries(porS).map(([s, ts]) => [Number(s), deS(ts, Number(s), Number(s))]));
await prueba(`un cambio de término no rompe la confirmada (${CASOS.rompe.length} casos)`, () => {
  for (const c of CASOS.rompe) {
    const sup = superficieDe(c.superficie);
    const zonas = Object.entries(c.zonas).flatMap(([s, ps]) => ps.map((v) => ({ participacionSpaceId: Number(s), vertices: v })));
    const m = medirCon(sup, zonas);
    const nuevos = P.rompeDistribucion(m, mapaDe(c.antes), mapaDe(c.despues), HOY);
    assert.deepEqual(nuevos.map((p) => [p.codigo, p.participaciones]), c.nuevos, c.nombre);
    if (c.frases) assert.deepEqual(nuevos.map((p) => p.frase), c.frases, `${c.nombre}: las frases`);
    if ("mensaje" in c) assert.equal(P.mensajeDeRompe(nuevos), c.mensaje, `${c.nombre}: el mensaje`);
    assert.deepEqual(P.rompeDistribucion(m, mapaDe(c.despues), mapaDe(c.despues), HOY), [], `${c.nombre}: sin cambio no rompe nada`);
  }
});

await prueba(`la ocupación anónima (${CASOS.dispo.length} casos)`, () => {
  for (const c of CASOS.dispo) {
    assert.deepEqual(P.dispoPorParticipacion(c.ocupacion, c.desde, c.hasta, HOY),
      { dispo: c.dispo, quedaPb: c.quedaPb, libreDesde: c.libreDesde }, c.nombre);
  }
});

await prueba(`el estado de la distribución de una cara (${CASOS.estadosDistribucion.length} casos)`, () => {
  for (const c of CASOS.estadosDistribucion) {
    assert.equal(P.estadoDistribucion(c.porParticipacion, c.fixtureId, c.distribucion, c.firmaActual), c.estado, c.nombre);
    assert.equal(P.paraRevisar(c.distribucion, c.firmaActual), c.paraRevisar, `${c.nombre}: para revisar`);
  }
});

console.log("distribución · las reglas se dan la razón entre sí");

// Generador fijo: la prueba no cambia de corrida en corrida.
let semilla = 20261017;
const rnd = () => { semilla = (semilla * 16807) % 2147483647; return semilla / 2147483647; };
const entre = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const BASE = Date.UTC(2026, 9, 1);
const dia = (n) => new Date(BASE + n * 86400000).toISOString().slice(0, 10);
const diasDe = (a, b) => { const fuera = []; for (let d = a; d <= b; d = new Date(Date.parse(d) + 86400000).toISOString().slice(0, 10)) fuera.push(d); return fuera; };
const PB = [500, 1000, 2500, 3000, 3333, 5000, 6000, 10000];
const terminoAlAzar = (id) => {
  const a = entre(0, 120), b = a + entre(0, 60);
  const k = rnd();
  if (k < 0.55) {
    const activo = rnd() < 0.8;
    return termino({ estado: "contrato", pb: PB[entre(0, PB.length - 1)],
      // Una baja ya pasó: su día es hoy o antes (nunca una baja futura).
      bajaFecha: !activo && rnd() < 0.5 ? dia(entre(0, 16)) : null,
      lease: { isActive: activo, startDate: dia(a), endDate: dia(b) } }, { id, spaceId: 1, numero: 1 });
  }
  return termino({ estado: k < 0.9 ? "reserva" : "reserva_cancelada", pb: PB[entre(0, PB.length - 1)],
    desde: dia(a), hasta: dia(b), caduca: dia(entre(0, 40)) }, { id, spaceId: 1, numero: 1 });
};

await prueba("lo que cuenta un día (§3.3) es lo que suma la capacidad (§3.4), desde hoy, en 400 juegos al azar", () => {
  for (let i = 0; i < 400; i++) {
    const ts = Array.from({ length: entre(0, 6) }, (_, j) => terminoAlAzar(j + 1));
    const I = P.intervalosQueCuentan(ts, [], HOY);
    for (const d of diasDe(HOY, dia(200))) {
      let suma = 0;
      for (const t of ts) if (P.cuentaElDia(t, d, HOY)) suma += t.pb;
      assert.equal(P.comprometido(I, d), suma, `juego ${i}, día ${d}`);
    }
    for (const t of ts) {
      const algunDia = diasDe(HOY, dia(200)).some((d) => P.cuentaElDia(t, d, HOY));
      assert.equal(P.vivo(t, HOY), algunDia, `juego ${i}: vivo no es «cuenta algún día desde hoy» (${JSON.stringify(t)})`);
    }
  }
});

await prueba("el pico es el de contar día por día, y la capacidad dice «entra» justo cuando cabe (500 al azar)", () => {
  for (let i = 0; i < 500; i++) {
    const I = Array.from({ length: entre(0, 7) }, () => { const a = entre(0, 90); return { desde: dia(a), hasta: dia(a + entre(0, 40)), pb: PB[entre(0, PB.length - 1)] }; });
    const a = entre(0, 100), b = a + entre(-3, 60);
    const desde = dia(a), hasta = dia(b);
    let mejor = 0, cuando = desde;
    if (desde <= hasta) {
      for (const d of diasDe(desde, hasta)) {
        let s = 0;
        for (const it of I) if (it.desde <= d && d <= it.hasta) s += it.pb;
        if (s > mejor) { mejor = s; cuando = d; }
      }
    }
    assert.deepEqual(P.pico(I, desde, hasta), { pb: mejor, dia: cuando }, `juego ${i}`);
    const pide = entre(1, 10000);
    const libre = P.disponible(I, desde, hasta, HOY);
    const x = P.revisarCapacidad(I, [], pide, desde, hasta, "A", HOY);
    const todoPasado = (desde > HOY ? desde : HOY) > hasta;
    assert.equal(x === null, todoPasado || pide <= libre, `juego ${i}: pide ${pide}, queda ${libre}`);
    // libreDesde: el primer día con lugar, contado a mano.
    const o = { intervalos: I, fisicos: [] };
    const dd = P.dispoPorParticipacion(o, desde, hasta, HOY);
    let primero = null;
    const a2 = desde > HOY ? desde : HOY;
    if (a2 <= hasta) {
      for (const d of diasDe(a2, hasta)) {
        let s = 0;
        for (const it of I) if (it.desde <= d && d <= it.hasta) s += it.pb;
        if (s < P.CARA_ENTERA_PB) { primero = d; break; }
      }
    }
    assert.equal(dd.libreDesde, primero, `juego ${i}: libreDesde`);
    assert.equal(dd.quedaPb, libre, `juego ${i}: quedaPb`);
  }
});

await prueba("lo dibujado nunca cambia lo disponible, y una distribución sin cambio de términos no se rompe", () => {
  const sup = superficieDe("superficie:metro-100");
  for (let i = 0; i < 100; i++) {
    const ts1 = [terminoAlAzar(1)].map((t) => ({ ...t, spaceId: 1, numero: 1 }));
    const ts2 = [terminoAlAzar(2)].map((t) => ({ ...t, spaceId: 2, numero: 2 }));
    const u = rnd() * 0.5;
    const zonas = [
      { participacionSpaceId: 1, vertices: [[0, 0], [u + 0.1, 0], [u + 0.1, 1], [0, 1]] },
      { participacionSpaceId: 2, vertices: [[u, 0], [1, 0], [1, 1], [u, 1]] },
    ];
    const m = medirCon(sup, zonas);
    const porS = new Map([[1, ts1], [2, ts2]]);
    assert.deepEqual(P.rompeDistribucion(m, porS, porS, HOY), [], `juego ${i}`);
    const j = P.juzgar(m, porS, HOY);
    const haySolape = j.errores.some((p) => p.codigo === "SOLAPE");
    assert.equal(haySolape, P.seCruzanEnFechas(ts1, ts2, HOY), `juego ${i}: el solape sigue a las fechas`);
  }
});

console.log("distribución · gemelas de verdad");

const sinComentTs = (t) => t.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, (m, p1) => p1);
const sinComentPy = (t) => t.replace(/"""[\s\S]*?"""/g, " ").replace(/#[^\n]*/g, " ");

await prueba("cada función pública de un lado tiene su gemela del otro", () => {
  const ts = leer(RUTA_TS), py = leer(RUTA_PY);
  const deTs = [...ts.matchAll(/^export function (\w+)/gm)].map((m) => m[1]);
  const dePy = [...py.matchAll(/^def ([a-z]\w*)\(/gm)].map((m) => m[1]);
  const serpiente = (n) => n.replace(/[A-Z]/g, (l) => "_" + l.toLowerCase());
  assert.deepEqual(deTs.map(serpiente).sort(), [...dePy].sort(), "las funciones públicas no son las mismas en los dos lados");
  for (const k of Object.keys(CASOS.constantes)) {
    assert.ok(new RegExp(`^export const ${k} = ${CASOS.constantes[k]};`, "m").test(ts), `${k} en participaciones.ts`);
    assert.ok(new RegExp(`^${k} = ${CASOS.constantes[k]}$`, "m").test(py), `${k} en reglas_participacion.py`);
  }
});

await prueba("ninguna de las dos pregunta la hora, ni suma con reduce/sum/fsum, y Python sólo importa la geometría", () => {
  const ts = sinComentTs(leer(RUTA_TS));
  assert.ok(!/new Date\(\s*\)|Date\.now\s*\(/.test(ts), "participaciones.ts lee el reloj del navegador: el hoy lo manda el servidor");
  assert.ok(!/\.reduce\s*\(/.test(ts), "participaciones.ts suma con reduce");
  assert.ok(!/localStorage|sessionStorage|indexedDB/.test(ts), "participaciones.ts guarda algo en el navegador");
  const py = sinComentPy(leer(RUTA_PY));
  assert.ok(!/\btoday\s*\(|\bnow\s*\(|app\.fechas|\bfechas\.hoy|\btime\s*\(/.test(py), "reglas_participacion.py lee el reloj: hoy es un parámetro");
  assert.ok(!/\bf?sum\s*\(/.test(py), "reglas_participacion.py suma con sum/fsum");
  const deApp = [...py.matchAll(/^\s*(?:from|import) (app[\w.]*)/gm)].map((m) => m[1]);
  assert.deepEqual(deApp, ["app.services.zonas_geometria"], "reglas_participacion.py importa de la app algo más que la geometría pura");
});

await prueba("las frases de la capacidad no nombran proveedores, marcas ni montos", () => {
  const ts = lista([
    { estado: "contrato", pb: 6000, supplierId: 77, marca: "MarcaSecreta", lease: { isActive: true, startDate: "2026-11-01", endDate: "2026-12-31" } },
  ]);
  const I = P.intervalosQueCuentan(ts, [], HOY);
  const x = P.revisarCapacidad(I, [], 5000, "2026-11-01", "2026-11-30", "A", HOY);
  assert.ok(x && !/MarcaSecreta|77|\$/.test(x.frase), x?.frase);
});

console.log(`\n${hechas} pruebas de distribución en verde`);
