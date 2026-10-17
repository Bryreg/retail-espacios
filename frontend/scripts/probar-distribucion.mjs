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
 *
 * Y lo del navegador que las usa (paso 5 del diseño):
 *
 *   · **Las estampas** (`coloresDeMarca.ts`): el mismo proveedor se ve igual en
 *     todas las caras, un choque se corre a la siguiente, y los tonos son los
 *     `--marca-*` de los dos bloques de `tema.css`.
 *   · **El cliente** (`api/participaciones.ts`): cada función llama su ruta de
 *     §5.2 con su cuerpo de §5.3, los rechazos se leen en sus dos formas, y un
 *     `TerminoOut` leído por las reglas dice lo mismo que el servidor.
 *   · **Los stores**, con el `client.ts` de verdad sobre un servidor de
 *     prueba: una lectura de la ocupación por sede; `entrar` guarda el plano
 *     antes de leer la cara; el autoguardado a los 20 s; `version_vieja` y la
 *     fusión de tres vías; el 409 que guarda como borrador; salir sin perder
 *     nada; y la sesión que se cierra (o un 401) lo vacía todo. Nada va a
 *     `localStorage`.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
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

// (Que lo dibujado no cambia lo disponible lo fijan los casos `distribucion` con `disponible`: `disponible`
// ni siquiera recibe las zonas.)
await prueba("una distribución sin cambio de términos no se rompe, y el solape sigue a las fechas (100 al azar)", () => {
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

console.log("distribución · estampas de marca y tokens del tema");

const rC = await build({
  stdin: { contents: 'export * from "./src/utils/coloresDeMarca.ts";', resolveDir: raiz, loader: "ts" },
  bundle: true, write: false, format: "esm", platform: "neutral", logLevel: "silent",
});
const C = await import("data:text/javascript;base64," + Buffer.from(rC.outputFiles[0].text).toString("base64"));

await prueba("las nueve estampas: 3 tonos × 3 texturas, el tono cambia primero", () => {
  assert.equal(C.ESTAMPAS.length, 9);
  assert.deepEqual(C.ESTAMPAS.slice(0, 3).map((e) => [e.tono, e.textura]), C.TONOS_DE_MARCA.map((t) => [t, "lleno"]));
  assert.equal(new Set(C.ESTAMPAS.map((e) => `${e.tono}|${e.textura}`)).size, 9);
  C.ESTAMPAS.forEach((e, i) => assert.equal(e.indice, i));
});

await prueba("asignación estable: el mismo proveedor, la misma estampa en dos caras; un choque rota +1; no depende del orden ni del filtro", () => {
  const caraA = [{ spaceId: 10, numero: 1, supplierId: 7 }, { spaceId: 11, numero: 2, supplierId: 16 }, { spaceId: 12, numero: 3, supplierId: 3 }];
  const caraB = [{ spaceId: 20, numero: 1, supplierId: 3 }, { spaceId: 21, numero: 2, supplierId: 7 }];
  const a = C.estampasDeLaCara(caraA), b = C.estampasDeLaCara(caraB);
  assert.equal(a.get(10).indice, 7);
  assert.equal(a.get(11).indice, 8, "16 mod 9 = 7 choca con el 7: se corre a la 8");
  assert.equal(a.get(12).indice, 3);
  assert.deepEqual(b.get(21), a.get(10), "el mismo proveedor no se ve igual en las dos caras");
  assert.deepEqual(b.get(20), a.get(12));
  assert.deepEqual(C.estampasDeLaCara([...caraA].reverse()), a, "depende del orden de la lista");
  // Una más nueva nunca repinta a las anteriores; sacar una que no chocaba no repinta a nadie.
  const conNueva = C.estampasDeLaCara([...caraA, { spaceId: 13, numero: 4, supplierId: 7 }]);
  for (const s of [10, 11, 12]) assert.deepEqual(conNueva.get(s), a.get(s));
  assert.equal(conNueva.get(13).indice, 0, "7 y 8 tomadas: la siguiente libre es la 0");
  const sinLa3 = C.estampasDeLaCara(caraA.filter((p) => p.spaceId !== 12));
  for (const s of [10, 11]) assert.deepEqual(sinLa3.get(s), a.get(s));
  // Con más de nueve se repite (el número las distingue).
  const muchas = Array.from({ length: 12 }, (_, k) => ({ spaceId: 100 + k, numero: k + 1, supplierId: 5 }));
  const m = C.estampasDeLaCara(muchas);
  assert.equal(new Set([...m.values()].slice(0, 9).map((e) => e.indice)).size, 9);
  assert.equal(m.get(109).indice, 5);
  // Ids raros no rompen nada.
  assert.equal(C.estampaPreferida(-1), 8);
  assert.equal(C.estampaPreferida(NaN), 0);
});

await prueba("TONOS_DE_MARCA son los --marca-1..3 de los DOS bloques de tema.css", () => {
  const css = leer(join(raiz, "src", "tema.css")).replace(/\/\*[\s\S]*?\*\//g, " ");
  const bloque = (sel) => {
    const i = css.indexOf(sel);
    assert.ok(i >= 0, `no encontré ${sel}`);
    return css.slice(i, css.indexOf("}", i));
  };
  const semanticos = css.slice(css.indexOf(":root", css.indexOf(":root") + 1));   // la capa 2 (el segundo :root)
  for (const [nombre, b] of [[":root (semánticos)", semanticos.slice(0, semanticos.indexOf("}"))], ['html[data-tema="oscuro"]', bloque('html[data-tema="oscuro"]')]]) {
    const vals = [1, 2, 3].map((k) => (new RegExp(`--marca-${k}:\\s*(#[0-9A-Fa-f]{6})`).exec(b) ?? [])[1]?.toUpperCase());
    assert.deepEqual(vals, [...C.TONOS_DE_MARCA], `${nombre}: --marca-* no son los de coloresDeMarca.ts`);
  }
});

console.log("distribución · el cliente de la API (§5.3)");

// Un axios de mentira: el `client.ts` de verdad (con sus interceptores: el
// token y el `logout` del 401) sobre un servidor que contesta la prueba.
const AXIOS_FALSO = `
const req = [], res = [];
async function pedir(method, url, data, config) {
  let cfg = { method, url, data, params: config && config.params, headers: {} };
  for (const f of req) cfg = f(cfg) || cfg;
  try {
    const r = await globalThis.__servidor(cfg);
    let resp = { status: 200, data: r, config: cfg };
    for (const [ok] of res) if (ok) resp = ok(resp);
    return resp;
  } catch (e) {
    let err = e;
    for (const [, mal] of res) if (mal) { try { return await mal(err); } catch (x) { err = x; } }
    throw err;
  }
}
const instancia = {
  interceptors: { request: { use: (f) => { req.push(f); } }, response: { use: (ok, mal) => { res.push([ok, mal]); } } },
  get: (u, c) => pedir("get", u, undefined, c), delete: (u, c) => pedir("delete", u, undefined, c),
  post: (u, d, c) => pedir("post", u, d, c), put: (u, d, c) => pedir("put", u, d, c), patch: (u, d, c) => pedir("patch", u, d, c),
};
export default { create: () => instancia };`;

const rS = await build({
  stdin: {
    contents: [
      'export * as API from "./src/api/participaciones.ts";',
      'export { useOcupacionStore, ocupacionDeLaCara } from "./src/store/ocupacionStore.ts";',
      'export { useDistribucionStore, hayParaRecuperar, capaQueSeMuestra, planoAlDia, AUTOGUARDADO_MS } from "./src/store/distribucionStore.ts";',
      'export { useAuthStore } from "./src/store/authStore.ts";',
      'export { useFixtureStore } from "./src/store/fixtureStore.ts";',
    ].join("\n"),
    resolveDir: raiz, loader: "ts",
  },
  bundle: true, write: false, format: "esm", platform: "node", logLevel: "silent",
  plugins: [{
    name: "sin-red",
    setup(b) {
      b.onResolve({ filter: /^axios$/ }, () => ({ path: "axios", namespace: "falso" }));
      b.onLoad({ filter: /^axios$/, namespace: "falso" }, () => ({ contents: AXIOS_FALSO, loader: "js" }));
      b.onResolve({ filter: /api[\\/]firebase$/ }, (a) => ({ path: a.path, namespace: "firebase-falso" }));
      b.onLoad({ filter: /.*/, namespace: "firebase-falso" }, () => ({ contents: "export const signOutFirebase = async () => {};", loader: "js" }));
    },
  }],
});
const guardado = new Map();
const escritas = new Set();
globalThis.window = { localStorage: {
  getItem: (k) => guardado.get(k) ?? null,
  setItem: (k, v) => { escritas.add(k); guardado.set(k, String(v)); },
  removeItem: (k) => { guardado.delete(k); },
} };
const dirS = mkdtempSync(join(tmpdir(), "distribucion-"));
writeFileSync(join(dirS, "s.mjs"), rS.outputFiles[0].text);
const S = await import(pathToFileURL(join(dirS, "s.mjs")).href);
rmSync(dirS, { recursive: true, force: true });

/** El servidor de la prueba: anota cada pedido y contesta con `responder`. */
const servidor = { pedidos: [], responder: async () => ({}) };
globalThis.__servidor = async (cfg) => { servidor.pedidos.push(cfg); return servidor.responder(cfg); };
const rechazo = (status, data) => Object.assign(new Error(`HTTP ${status}`), { response: { status, data } });

await prueba("cada función llama su ruta de §5.2, con su método, su query y su cuerpo", async () => {
  servidor.pedidos = [];
  servidor.responder = async () => ({ ok: true });
  S.useAuthStore.getState().setAuth("t-api", "admin", "galerias");
  await S.API.leerCara("NAVE", "GON-01-B");
  await S.API.leerCara("NAVE", "GON-01", "2026-11-01", "2026-11-30");
  await S.API.resumen({ sede: "NAVE", dia: "2026-10-17", proveedor_id: undefined, espacio: "" });
  await S.API.ocupacion("NAVE");
  await S.API.historial({ sede: "NAVE", espacio: "GON-01" });
  await S.API.historial({ participacion_id: 41 });
  const alta = { sede: "NAVE", espacio: "GON-01-B", tipo: "reserva", proveedor: "Postobón", correo: null, marca: "Hit", puntos_basicos: 2500,
    desde: "2026-11-01", hasta: "2027-01-31", caduca: "2026-10-25", valor_mensual: null, notas: null };
  await S.API.crear(alta);
  await S.API.editarReserva(41, { version: 1, puntos_basicos: 3000 });
  await S.API.confirmarReserva(41, { version: 2, valor_mensual: 1200000 });
  await S.API.cancelarReserva(41, 3);
  await S.API.renovar(41, { version: 1, tipo: "contrato", desde: "2027-02-01", hasta: "2027-04-30", valor_mensual: 1200000 });
  const zonas = [{ participacion_space_id: 812, vertices: [[0.1, 0.1], [0.4, 0.1], [0.4, 0.6], [0.1, 0.6]] }];
  await S.API.guardarBorrador({ sede: "NAVE", espacio: "GON-01", version: 4, automatico: false, zonas });
  await S.API.confirmarDistribucion({ sede: "NAVE", espacio: "GON-01", version: 5, zonas });
  await S.API.descartarBorrador({ sede: "NAVE", espacio: "GON-01", version: 6 });
  const vistos = servidor.pedidos.map((p) => [p.method.toUpperCase(), p.url, p.params ?? null, p.data ?? null]);
  assert.deepEqual(vistos, [
    ["GET", "/participaciones/cara", { sede: "NAVE", espacio: "GON-01-B" }, null],
    ["GET", "/participaciones/cara", { sede: "NAVE", espacio: "GON-01", desde: "2026-11-01", hasta: "2026-11-30" }, null],
    ["GET", "/participaciones/resumen", { sede: "NAVE", dia: "2026-10-17" }, null],
    ["GET", "/participaciones/ocupacion", { sede: "NAVE" }, null],
    ["GET", "/participaciones/historial", { sede: "NAVE", espacio: "GON-01" }, null],
    ["GET", "/participaciones/historial", { participacion_id: 41 }, null],
    ["POST", "/participaciones/", null, alta],
    ["PATCH", "/participaciones/41", null, { version: 1, puntos_basicos: 3000 }],
    ["POST", "/participaciones/41/confirmar", null, { version: 2, valor_mensual: 1200000 }],
    ["POST", "/participaciones/41/cancelar", null, { version: 3 }],
    ["POST", "/participaciones/41/renovar", null, { version: 1, tipo: "contrato", desde: "2027-02-01", hasta: "2027-04-30", valor_mensual: 1200000 }],
    ["PUT", "/participaciones/distribucion/borrador", null, { sede: "NAVE", espacio: "GON-01", version: 4, automatico: false, zonas }],
    ["POST", "/participaciones/distribucion/confirmar", null, { sede: "NAVE", espacio: "GON-01", version: 5, zonas }],
    ["POST", "/participaciones/distribucion/descartar", null, { sede: "NAVE", espacio: "GON-01", version: 6 }],
  ]);
  assert.ok(servidor.pedidos.every((p) => p.headers.Authorization === "Bearer t-api"), "un pedido sin el token");
});

await prueba("el archivo del cliente sólo nombra rutas de §5.2, y los GET van por query (nunca por ruta)", () => {
  const ts = leer(join(raiz, "src", "api", "participaciones.ts")).replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
  const rutas = [...ts.matchAll(/client\.(get|post|put|patch|delete)<[^>]*>\(`\$\{P\}([^`]*)`/g)].map((m) => `${m[1].toUpperCase()} ${m[2]}`);
  assert.deepEqual(rutas.sort(), [
    "GET /cara", "GET /historial", "GET /ocupacion", "GET /resumen",
    "PATCH /${id}", "POST /", "POST /${id}/cancelar", "POST /${id}/confirmar", "POST /${id}/renovar",
    "POST /distribucion/confirmar", "POST /distribucion/descartar", "PUT /distribucion/borrador",
  ].sort());
  assert.match(ts, /const P = "\/participaciones";/);
  assert.ok(!/client\.get<[^>]*>\(`\$\{P\}\/\$\{/.test(ts), "un GET lleva datos en la ruta");
});

await prueba("los rechazos se leen en las dos formas: `detail: {code…}` y el cuerpo suelto del 409 que guarda", () => {
  const a = S.API.rechazoDe(rechazo(409, { detail: { code: "version_vieja", message: "Otra sesión…", version_actual: 7 } }));
  assert.deepEqual([a.status, a.code, a.message, a.cuerpo.version_actual], [409, "version_vieja", "Otra sesión…", 7]);
  const b = S.API.rechazoDe(rechazo(409, { code: "distribucion_invalida", message: "La distribución tiene 2 problemas: se guardó como borrador.", errores: [], avisos: [], version: 6 }));
  assert.deepEqual([b.code, b.cuerpo.version], ["distribucion_invalida", 6]);
  assert.equal(S.API.rechazoDe(rechazo(422, { detail: [{ msg: "campo" }] })), null);
  assert.equal(S.API.rechazoDe(new Error("sin red")), null);
});

await prueba("un TerminoOut leído por las reglas dice lo mismo que el servidor: estado, vivo y qué cuenta cada día", () => {
  const dias = ["2026-08-15", "2026-10-09", "2026-10-10", "2026-10-17", "2026-11-15", "2026-12-31", "2027-01-15"];
  for (const c of CASOS.estados) {
    const [t] = lista([c.termino]);
    // Como lo arma el servidor (§5.3): en un contrato, las fechas del lease.
    const out = {
      id: t.id, space_id: 812, codigo: "NAVE-GON-01-PC3", numero: 3, cara: "A", estado: t.estado,
      estado_visible: P.estadoVisible(t, HOY), puntos_basicos: 2500, porcentaje: "25 %", proveedor: { id: 7, nombre: "Postobón" },
      marca: "Hit", desde: t.lease ? t.lease.startDate : t.desde, hasta: t.lease ? t.lease.endDate : t.hasta, caduca: t.caduca,
      lease_id: t.estado === "contrato" ? 3310 : null, valor_mensual: null, renueva_a: null, notas: null, baja_en: null, baja_fecha: t.bajaFecha,
      version: 1, creada_en: "2026-10-17T14:02:11+00:00", creada_por: "duena@super.co",
    };
    const v = S.API.terminoDeOut(out);
    assert.equal(P.estadoVisible(v, HOY), c.estado_visible, `${c.nombre}: estado`);
    assert.equal(P.vivo(v, HOY), c.vivo, `${c.nombre}: vivo`);
    for (const d of dias) assert.equal(P.cuentaElDia(v, d, HOY), P.cuentaElDia({ ...t, pb: 2500, supplierId: 7 }, d, HOY), `${c.nombre}: ${d}`);
    assert.equal(v.supplierId, 7);
  }
  const roto = S.API.terminoDeOut({ id: 1, space_id: 2, numero: 1, estado: "contrato", estado_visible: "cancelado", puntos_basicos: 100,
    proveedor: null, marca: null, desde: "2026-01-01", hasta: "2026-12-31", caduca: null, lease_id: null, baja_fecha: null });
  assert.equal(roto.lease, null, "un contrato sin lease ganó uno");
  assert.equal(S.API.espacioDeLaCara("GON-01", "B"), "GON-01-B");
  assert.deepEqual(S.API.superficieDeOut({ orientacion: "frente", ancho: 1, alto: 2, plano: 0.4, giro_x: -0.06, area_util_m2: 1.5, exclusiones: [] }),
    { orientacion: "frente", ancho: 1, alto: 2, plano: 0.4, giroX: -0.06, exclusiones: [], areaUtilM2: 1.5 });
});

console.log("distribución · los stores (lectura y edición)");

const esperar = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const EXCL_090 = superficieDe("superficie:gondola-doble-090");
const zo = (id, s, vertices, orden = 0) => ({ id, participacion_space_id: s, vertices, orden });
const cuadradoZ = (u0, v0, u1, v1) => [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
const caraOut = (extra = {}) => ({
  sede: "NAVE", hoy: "2026-10-17", codigo_cara: "NAVE-GON-01", cara: "A",
  fixture: { id: "f-1", code: "GON-01", label: "Góndola 1", type: "gondola", caras: 2 },
  por_participacion: true, comercializable: true,
  superficie: { orientacion: "frente", ancho: 0.9, alto: 1.8, plano: 0.462, giro_x: 0, area_util_m2: EXCL_090.area_util_m2, exclusiones: EXCL_090.exclusiones },
  firma: "v1|gondola|doble|900|1800|e-|zocalo:0,10000,0,667;parante:0,278,667,9444;parante:9722,10000,667,9444;remate:0,10000,9444,10000",
  distribucion: null, participaciones: [], capacidad: { hoy_pb: 0, disponible_hoy_pb: 10000, periodo: { desde: "2026-10-17", hasta: "2027-10-16", pico_pb: 0, dia_pico: "2026-10-17", disponible_pb: 10000 }, intervalos: [], fisicos: [] },
  revision: { capa: "confirmada", errores: [], avisos: [] }, ...extra,
});
const distribucion = (version, confirmada, borrador = null) => ({
  id: 9, version, estado: borrador ? "borrador" : "confirmada", confirmada_en: "2026-10-16T10:00:00+00:00", confirmada_por: "duena@super.co",
  para_revisar: false, borrador_en: borrador ? "2026-10-17T10:00:00+00:00" : null, borrador_por: null, confirmada, borrador,
});

await prueba("ocupación: una lectura por sede (los pedidos simultáneos comparten), recargar vuelve a leer, otra sesión la vacía y tira lo que llega tarde", async () => {
  S.useAuthStore.getState().setAuth("t-1", "worker", "galerias");
  servidor.pedidos = [];
  const ocup = { sede: "NAVE", hoy: "2026-10-17", caras: { "NAVE-GON-01": { intervalos: [{ desde: "2026-11-01", hasta: "2027-01-31", pb: 2500 }], fisicos: [] } } };
  servidor.responder = async () => ocup;
  const [a, b] = await Promise.all([S.useOcupacionStore.getState().cargarOcupacion("NAVE"), S.useOcupacionStore.getState().cargarOcupacion("NAVE")]);
  assert.deepEqual(a, ocup);
  assert.equal(a, b);
  await S.useOcupacionStore.getState().cargarOcupacion("NAVE");
  assert.equal(servidor.pedidos.length, 1, "leyó la misma sede más de una vez");
  assert.deepEqual(Object.keys(S.useOcupacionStore.getState().ocupacion), ["galerias|NAVE"]);
  assert.deepEqual(S.ocupacionDeLaCara(S.useOcupacionStore.getState(), "NAVE", "NAVE-GON-01").intervalos[0].pb, 2500);
  await S.useOcupacionStore.getState().recargarOcupacion("NAVE");
  assert.equal(servidor.pedidos.length, 2);
  // Otro cliente en la misma pestaña: no ve nada del anterior.
  S.useAuthStore.getState().setAuth("t-2", "admin", "canaveral");
  assert.deepEqual(S.useOcupacionStore.getState().ocupacion, {});
  assert.equal(S.ocupacionDeLaCara(S.useOcupacionStore.getState(), "NAVE", "NAVE-GON-01"), undefined);
  // Una respuesta que llega después de cambiar de sesión se tira.
  let soltar;
  servidor.responder = () => new Promise((r) => { soltar = () => r(ocup); });
  const tarde = S.useOcupacionStore.getState().cargarOcupacion("NAVE");
  S.useAuthStore.getState().logout();
  soltar();
  assert.equal(await tarde, null);
  assert.deepEqual(S.useOcupacionStore.getState().ocupacion, {});
  // El resumen, en caché por todos sus parámetros y con el cliente en la clave.
  S.useAuthStore.getState().setAuth("t-3", "admin", "galerias");
  servidor.pedidos = [];
  servidor.responder = async (cfg) => ({ sede: "NAVE", dia: cfg.params.dia, caras: [] });
  await S.useOcupacionStore.getState().cargarResumen({ sede: "NAVE", dia: "2026-10-17" });
  await S.useOcupacionStore.getState().cargarResumen({ sede: "NAVE", dia: "2026-10-17" });
  await S.useOcupacionStore.getState().cargarResumen({ sede: "NAVE", dia: "2026-10-18" });
  assert.equal(servidor.pedidos.length, 2);
  S.useOcupacionStore.getState().invalidarResumen("NAVE");
  assert.deepEqual(S.useOcupacionStore.getState().resumen, {});
});

await prueba("ocupación: una lectura vieja que llega DESPUÉS de la que trajo una escritura no la pisa (ni su falla deja un error)", async () => {
  S.useAuthStore.getState().setAuth("t-oc", "admin", "galerias");
  const libre = { sede: "NAVE", hoy: "2026-10-17", caras: { "NAVE-GON-01": { intervalos: [], fisicos: [] } } };
  const tomada = { sede: "NAVE", hoy: "2026-10-17", caras: { "NAVE-GON-01": { intervalos: [{ desde: "2026-10-17", hasta: "2027-01-31", pb: 10000 }], fisicos: [] } } };
  // La lectura de entrada tarda; mientras, una escritura vuelve y se relee.
  let soltar, n = 0;
  servidor.responder = () => (n++ === 0 ? new Promise((r) => { soltar = () => r(libre); }) : Promise.resolve(tomada));
  const vieja = S.useOcupacionStore.getState().cargarOcupacion("NAVE");
  await S.useOcupacionStore.getState().recargarOcupacion("NAVE");
  soltar();
  await vieja;
  assert.equal(S.ocupacionDeLaCara(S.useOcupacionStore.getState(), "NAVE", "NAVE-GON-01").intervalos.length, 1,
    "la lectura vieja pisó a la nueva: la cara vendida se ve libre");
  // Lo mismo si la vieja falla tarde: no deja un error sobre datos buenos.
  n = 0;
  servidor.responder = () => (n++ === 0 ? new Promise((_, no) => { soltar = () => no(rechazo(503, { detail: "Servicio no disponible" })); }) : Promise.resolve(tomada));
  const falla = S.useOcupacionStore.getState().recargarOcupacion("NAVE");
  await S.useOcupacionStore.getState().recargarOcupacion("NAVE");
  soltar();
  await falla;
  assert.equal(S.useOcupacionStore.getState().error["galerias|NAVE"], undefined, "la falla vieja dejó un error");
  // Una nueva que llega primero no la tapa la vieja aunque la vieja llegue después y la nueva ya esté escrita.
  assert.deepEqual(S.useOcupacionStore.getState().ocupacion["galerias|NAVE"], tomada);
  // El resumen, igual: una lectura forzada que tarda no pisa a la que se pidió después.
  n = 0;
  servidor.responder = (cfg) => (n++ === 0 ? new Promise((r) => { soltar = () => r({ sede: "NAVE", dia: cfg.params.dia, caras: [], cual: "vieja" }); })
    : Promise.resolve({ sede: "NAVE", dia: cfg.params.dia, caras: [], cual: "nueva" }));
  const rv = S.useOcupacionStore.getState().cargarResumen({ sede: "NAVE", dia: "2026-10-20" }, { forzar: true });
  await S.useOcupacionStore.getState().cargarResumen({ sede: "NAVE", dia: "2026-10-20" }, { forzar: true });
  soltar();
  await rv;
  assert.equal(S.useOcupacionStore.getState().resumen["galerias|NAVE|2026-10-20||||"]?.cual, "nueva");
});

/** Entra a la cara A de GON-01 con un servidor que contesta `cara`. */
const entrarA = async (cara, cualCara = "A") => {
  servidor.responder = async (cfg) => (cfg.url === "/participaciones/cara" ? cara : {});
  await S.useDistribucionStore.getState().entrar({ sede: "NAVE", fixtureId: "f-1", codigo: "GON-01", cara: cualCara });
};
const D = () => S.useDistribucionStore.getState();
const dibujar = (s, u0, v0, u1, v1) => {
  D().despachar({ tipo: "elegirActiva", spaceId: s });
  D().despachar({ tipo: "elegirHerramienta", herramienta: "rectangulo" });
  D().despachar({ tipo: "empezarTrazo", punto: [u0, v0] });
  D().despachar({ tipo: "estirarTrazo", punto: [u1, v1] });
  D().despachar({ tipo: "cerrarTrazo" });
};
/** El reloj del autoguardado, a mano: se anota y se dispara cuando la prueba quiere. */
const relojes = [];
const setTimeoutReal = globalThis.setTimeout, clearTimeoutReal = globalThis.clearTimeout;
const conRelojFalso = async (fn) => {
  relojes.length = 0;
  globalThis.setTimeout = (f, ms) => { if (ms >= 1000) { const r = { f, ms, vivo: true }; relojes.push(r); return r; } return setTimeoutReal(f, ms); };
  globalThis.clearTimeout = (r) => { if (r && typeof r === "object" && "vivo" in r) r.vivo = false; else clearTimeoutReal(r); };
  try { await fn(); } finally { globalThis.setTimeout = setTimeoutReal; globalThis.clearTimeout = clearTimeoutReal; }
};

await prueba("entrar: primero guarda el plano pendiente, después lee la cara; edita el borrador si hay y si no la confirmada", async () => {
  S.useAuthStore.getState().setAuth("t-4", "admin", "galerias");
  const orden = [];
  S.useFixtureStore.setState({ flushPending: async () => { orden.push("plano"); await esperar(5); orden.push("plano guardado"); } });
  servidor.pedidos = [];
  const conBorrador = caraOut({ distribucion: distribucion(4, [zo(1, 812, cuadradoZ(0.1, 0.1, 0.3, 0.3))], [zo(2, 812, cuadradoZ(0.1, 0.1, 0.4, 0.4)), zo(3, 813, cuadradoZ(0.5, 0.5, 0.6, 0.6), 1)]) });
  servidor.responder = async (cfg) => { orden.push(cfg.url); return conBorrador; };
  await D().entrar({ sede: "NAVE", fixtureId: "f-1", codigo: "GON-01", cara: "B" });
  assert.deepEqual(orden, ["plano", "plano guardado", "/participaciones/cara"], "leyó la cara antes de guardar el plano");
  assert.deepEqual(servidor.pedidos[0].params, { sede: "NAVE", espacio: "GON-01-B" });
  assert.deepEqual(D().activa, { cliente: "galerias", sede: "NAVE", fixtureId: "f-1", codigo: "GON-01", cara: "B" });
  assert.deepEqual(D().edicion.zonas.map((z) => z.clave), ["z2", "z3"], "no edita el borrador");
  assert.equal(D().edicion.sucio, false);
  assert.equal(D().verAlDia, "2026-10-17");
  assert.deepEqual(D().edicion.medidas, { ancho: 0.9, alto: 1.8 });
  // Sin borrador: la confirmada.
  await D().salir();
  await entrarA(caraOut({ distribucion: distribucion(4, [zo(1, 812, cuadradoZ(0.1, 0.1, 0.3, 0.3))]) }));
  assert.deepEqual(D().edicion.zonas.map((z) => z.clave), ["z1"]);
  assert.deepEqual(S.capaQueSeMuestra(caraOut()), []);
  // La firma del plano local contra la que leyó el servidor.
  assert.equal(S.planoAlDia(D().datos, { type: "gondola", w: 0.9, d: 0.9, h: 1.8 }), true);
  assert.equal(S.planoAlDia(D().datos, { type: "gondola", w: 1.2, d: 0.9, h: 1.8 }), false);
  await D().salir();
});

await prueba("guardar el borrador manda las zonas en u,v con la versión; el autoguardado espera 20 s quieto y no anota historial", async () => {
  await conRelojFalso(async () => {
    await entrarA(caraOut({ distribucion: distribucion(4, []) }));
    dibujar(812, 0.1, 0.1, 0.3, 0.4);
    assert.equal(D().edicion.sucio, true);
    const vivos = relojes.filter((r) => r.vivo);
    assert.equal(vivos.length, 1);
    assert.equal(vivos[0].ms, S.AUTOGUARDADO_MS);
    assert.equal(S.AUTOGUARDADO_MS, 20000);
    // Cada cambio vuelve a esperar los 20 s.
    D().despachar({ tipo: "moverZona", clave: D().edicion.zonas[0].clave, du: 0.01, dv: 0 });
    assert.equal(relojes.filter((r) => r.vivo).length, 1);
    servidor.pedidos = [];
    servidor.responder = async (cfg) => ({ version: 5, distribucion: distribucion(5, [], cfg.data.zonas.map((z, i) => zo(70 + i, z.participacion_space_id, z.vertices, i))), participaciones: [], revision: { capa: "borrador", errores: [], avisos: [] } });
    relojes.filter((r) => r.vivo).at(-1).f();
    await esperar(10);
    assert.equal(servidor.pedidos.length, 1);
    const p = servidor.pedidos[0];
    assert.equal(p.url, "/participaciones/distribucion/borrador");
    assert.deepEqual({ ...p.data, zonas: undefined }, { sede: "NAVE", espacio: "GON-01", version: 4, automatico: true, zonas: undefined });
    assert.deepEqual(p.data.zonas, [{ participacion_space_id: 812, vertices: [[0.11, 0.1], [0.31, 0.1], [0.31, 0.4], [0.11, 0.4]] }]);
    assert.equal(D().datos.distribucion.version, 5);
    assert.equal(D().edicion.sucio, false);
    assert.equal(D().guardado.estado, "quieto");
    assert.ok(D().guardado.ultimoAuto > 0);
    // El manual va con automatico: false y la versión nueva.
    dibujar(812, 0.5, 0.5, 0.6, 0.6);
    await D().guardarBorrador();
    assert.deepEqual([servidor.pedidos[1].data.version, servidor.pedidos[1].data.automatico], [5, false]);
  });
  await D().salir();
});

await prueba("otra sesión guardó (409 version_vieja): deja de autoguardar; «Traer lo nuevo» combina por participación y ofrece «Usar lo mío»", async () => {
  // Confirmada con la 812 y la 813. Acá cambio las dos; allá cambiaron la 813 (distinto) y agregaron la 814.
  const base = [zo(1, 812, cuadradoZ(0.1, 0.1, 0.3, 0.3)), zo(2, 813, cuadradoZ(0.5, 0.1, 0.7, 0.3), 1)];
  await entrarA(caraOut({ distribucion: distribucion(4, base) }));
  D().despachar({ tipo: "moverZona", clave: "z1", du: 0.05, dv: 0 });
  D().despachar({ tipo: "moverZona", clave: "z2", du: 0, dv: 0.05 });
  servidor.pedidos = [];
  servidor.responder = async () => { throw rechazo(409, { detail: { code: "version_vieja", message: "Otra sesión cambió esta distribución mientras la editabas. Tu trabajo sigue en pantalla: traé lo nuevo y se combina con lo tuyo.", version_actual: 5 } }); };
  assert.equal(await D().guardarBorrador(true), false);
  assert.equal(D().guardado.estado, "version_vieja");
  assert.match(D().guardado.mensaje, /Otra sesión cambió esta distribución/);
  assert.equal(await D().guardarBorrador(true), false);
  assert.equal(servidor.pedidos.length, 1, "siguió autoguardando después de version_vieja");
  const suyas = [zo(1, 812, cuadradoZ(0.1, 0.1, 0.3, 0.3)), zo(5, 813, cuadradoZ(0.5, 0.1, 0.8, 0.3), 1), zo(6, 814, cuadradoZ(0.1, 0.6, 0.2, 0.7), 2)];
  servidor.responder = async () => caraOut({ distribucion: distribucion(5, suyas) });
  await D().traerLoNuevo();
  assert.equal(D().guardado.estado, "quieto");
  assert.equal(D().datos.distribucion.version, 5);
  const de = (s) => D().edicion.zonas.filter((z) => z.participacionSpaceId === s).map((z) => z.vertices);
  assert.deepEqual(de(812), [cuadradoZ(0.15, 0.1, 0.35, 0.3)], "lo mío que la otra no tocó se perdió");
  assert.deepEqual(de(813), [cuadradoZ(0.5, 0.1, 0.8, 0.3)], "en el conflicto no quedó lo del servidor");
  assert.deepEqual(de(814), [cuadradoZ(0.1, 0.6, 0.2, 0.7)], "lo nuevo de la otra sesión se perdió");
  assert.deepEqual(D().fusion.conflictos, [813]);
  assert.equal(D().edicion.sucio, true);
  D().usarLoMio(813);
  assert.deepEqual(de(813), [cuadradoZ(0.5, 0.15, 0.7, 0.35)]);
  assert.equal(D().fusion, null);
  // El próximo guardado va con la versión nueva.
  servidor.pedidos = [];
  servidor.responder = async () => ({ version: 6, distribucion: distribucion(6, suyas, []), participaciones: [], revision: { capa: "borrador", errores: [], avisos: [] } });
  await D().guardarBorrador();
  assert.equal(servidor.pedidos[0].data.version, 5);
  await D().salir();
});

await prueba("confirmar con errores (409 distribucion_invalida, cuerpo suelto): quedó guardado como borrador, con la versión nueva y los errores a la vista", async () => {
  await entrarA(caraOut());
  dibujar(812, 0, 0, 0.6, 1);
  servidor.pedidos = [];
  const errores = [{ codigo: "EXCESO", frase: "La participación 3 tiene dibujado…", zona: null, participaciones: [3] }];
  servidor.responder = async (cfg) => {
    if (cfg.url === "/participaciones/distribucion/confirmar") throw rechazo(409, { code: "distribucion_invalida", message: "La distribución tiene 1 problema: se guardó como borrador.", errores, avisos: [], version: 1 });
    return caraOut({ distribucion: distribucion(1, [], [zo(80, 812, cuadradoZ(0, 0, 0.6, 1))]), revision: { capa: "borrador", errores, avisos: [] } });
  };
  await D().confirmar();
  assert.equal(servidor.pedidos[0].data.version, 0, "la primera confirmación no va con versión 0");
  assert.equal(D().datos.distribucion.version, 1);
  assert.deepEqual(D().datos.revision.errores, errores);
  assert.equal(D().edicion.sucio, false, "lo que el 409 guardó sigue sucio");
  assert.equal(D().guardado.mensaje, "La distribución tiene 1 problema: se guardó como borrador.");
  await esperar(10);
  assert.ok(servidor.pedidos.some((p) => p.url === "/participaciones/cara"), "no volvió a leer la cara");
  assert.equal(D().edicion.zonas.length, 1, "releer la cara pisó lo dibujado");
  await D().salir();
});

await prueba("salir: sin forzar, con un guardado que falla, se queda; forzado, sale y lo deja en memoria para «Recuperar»", async () => {
  await entrarA(caraOut({ distribucion: distribucion(4, [zo(1, 812, cuadradoZ(0.1, 0.1, 0.3, 0.3))]) }));
  dibujar(813, 0.5, 0.5, 0.7, 0.7);
  servidor.responder = async () => { throw rechazo(503, { detail: "Servicio no disponible" }); };
  assert.equal(await D().salir(), false);
  assert.ok(D().activa, "salió sin guardar");
  assert.equal(D().guardado.estado, "error");
  assert.equal(D().guardado.mensaje, "No se pudo guardar: Servicio no disponible. Tu trabajo sigue acá.");
  assert.equal(await D().salir({ forzado: true }), true);
  assert.equal(D().activa, null);
  assert.equal(D().edicion.zonas.length, 0, "quedó dibujado al salir");
  assert.deepEqual(Object.keys(D().sinGuardar), ["galerias|NAVE|f-1|A"]);
  // Volver a esa cara: se ofrece recuperar, y recuperar combina con lo del servidor.
  await entrarA(caraOut({ distribucion: distribucion(5, [zo(1, 812, cuadradoZ(0.1, 0.1, 0.35, 0.3))]) }));
  assert.equal(S.hayParaRecuperar(D()), true);
  D().recuperar();
  assert.deepEqual(D().edicion.zonas.map((z) => [z.participacionSpaceId, z.vertices]), [
    [812, cuadradoZ(0.1, 0.1, 0.35, 0.3)], [813, cuadradoZ(0.5, 0.5, 0.7, 0.7)]]);
  assert.equal(S.hayParaRecuperar(D()), false);
  assert.equal(D().edicion.sucio, true);
});

await prueba("un toque en el 3D: en la misma cara elige la zona de arriba; en la otra, pregunta si hay cambios o cambia de cara", async () => {
  D().reiniciar();
  await entrarA(caraOut({ distribucion: distribucion(4, [zo(1, 812, cuadradoZ(0, 0, 0.6, 0.6)), zo(2, 813, cuadradoZ(0.4, 0.4, 1, 1), 1)]) }));
  D().tocarEnElMueble("A", 0.5, 0.5);
  assert.equal(D().edicion.seleccion.zona, "z2");
  D().tocarEnElMueble("A", 0.9, 0.1);
  assert.equal(D().edicion.seleccion, null);
  D().despachar({ tipo: "moverZona", clave: "z1", du: 0.01, dv: 0 });
  D().tocarEnElMueble("B", 0.5, 0.5);
  assert.equal(D().pedidoDeCara, "B");
  assert.equal(D().activa.cara, "A");
  D().cancelarPedidoDeCara();
  D().despachar({ tipo: "deshacer" });
  servidor.pedidos = [];
  D().tocarEnElMueble("B", 0.5, 0.5);
  await esperar(10);
  assert.equal(D().activa.cara, "B");
  assert.deepEqual(servidor.pedidos.at(-1).params, { sede: "NAVE", espacio: "GON-01-B" });
});

/** Un servidor de borradores con su versión: un pedido con otra versión es `version_vieja`. */
const servidorConVersion = (inicial) => {
  const s = { version: inicial };
  servidor.responder = async (cfg) => {
    if (cfg.url === "/participaciones/cara") return caraOut({ distribucion: distribucion(s.version, []) });
    await esperar(3);
    if (cfg.data.version !== s.version) throw rechazo(409, { detail: { code: "version_vieja", message: "Otra sesión cambió esta distribución mientras la editabas." } });
    s.version++;
    const zonas = (cfg.data.zonas ?? []).map((z, i) => zo(100 * s.version + i, z.participacion_space_id, z.vertices, i));
    return { version: s.version, distribucion: distribucion(s.version, [], cfg.url.endsWith("/descartar") ? null : zonas), participaciones: [], revision: { capa: "borrador", errores: [], avisos: [] } };
  };
  return s;
};

await prueba("las escrituras van en fila: tres guardados encimados salen con 4, 5 y 6 (ningún version_vieja de la propia sesión), y descartar espera su turno", async () => {
  D().reiniciar();
  S.useAuthStore.getState().setAuth("t-fila", "admin", "galerias");
  servidorConVersion(4);
  await D().entrar({ sede: "NAVE", fixtureId: "f-1", codigo: "GON-01", cara: "A" });
  servidor.pedidos = [];
  dibujar(812, 0.1, 0.1, 0.2, 0.2);
  const a = D().guardarBorrador(true);
  dibujar(812, 0.3, 0.3, 0.4, 0.4);
  const b = D().guardarBorrador();
  dibujar(812, 0.5, 0.5, 0.6, 0.6);
  const c = D().guardarBorrador();
  const d = D().descartar();
  assert.deepEqual(await Promise.all([a, b, c]), [true, true, true]);
  await d;
  assert.deepEqual(servidor.pedidos.filter((p) => p.url !== "/participaciones/cara").map((p) => [p.url.split("/").at(-1), p.data.version]),
    [["borrador", 4], ["borrador", 5], ["borrador", 6], ["descartar", 7]]);
  assert.equal(D().guardado.estado, "quieto", "la propia sesión se dio un version_vieja");
  assert.equal(D().datos.distribucion.version, 8);
  // Al revés: un guardado pedido mientras se descarta espera a que vuelva el descarte.
  servidor.pedidos = [];
  const des = D().descartar();
  dibujar(812, 0.7, 0.7, 0.8, 0.8);
  const tras = D().guardarBorrador();
  await des;
  assert.equal(await tras, true);
  assert.deepEqual(servidor.pedidos.map((p) => [p.url.split("/").at(-1), p.data.version]), [["descartar", 8], ["borrador", 9]]);
  await D().salir({ forzado: true });
});

await prueba("descartar con el autoguardado a punto de saltar: no se vuelve a escribir el borrador recién descartado", async () => {
  D().reiniciar();
  S.useAuthStore.getState().setAuth("t-desc", "admin", "galerias");
  await conRelojFalso(async () => {
    servidorConVersion(4);
    await D().entrar({ sede: "NAVE", fixtureId: "f-1", codigo: "GON-01", cara: "A" });
    dibujar(812, 0.1, 0.1, 0.2, 0.2);
    const reloj = relojes.filter((r) => r.vivo).at(-1);
    servidor.pedidos = [];
    const des = D().descartar();
    reloj.f();                       // el reloj ya estaba armado: salta durante el descarte
    await des;
    await esperar(20);
    assert.deepEqual(servidor.pedidos.filter((p) => p.url !== "/participaciones/cara").map((p) => p.url.split("/").at(-1)), ["descartar"],
      "después de descartar, el autoguardado volvió a escribir un borrador");
    assert.equal(D().edicion.sucio, false);
  });
  await D().salir({ forzado: true });
});

await prueba("«Usar lo mío» en Mirar no se pierde: el conflicto sigue en la lista (y lo de acá también) hasta volver a Editar", async () => {
  D().reiniciar();
  const base = [zo(1, 812, cuadradoZ(0.1, 0.1, 0.3, 0.3)), zo(2, 813, cuadradoZ(0.5, 0.1, 0.7, 0.3), 1)];
  await entrarA(caraOut({ distribucion: distribucion(4, base) }));
  D().despachar({ tipo: "moverZona", clave: "z2", du: 0, dv: 0.05 });
  D().despachar({ tipo: "elegirModo", modo: "mirar" });
  servidor.responder = async () => caraOut({ distribucion: distribucion(5, [base[0], zo(5, 813, cuadradoZ(0.5, 0.1, 0.8, 0.3), 1)]) });
  await D().traerLoNuevo();
  assert.deepEqual(D().fusion.conflictos, [813]);
  D().usarLoMio(813);
  assert.deepEqual(D().fusion?.conflictos, [813], "en Mirar el conflicto se fue de la lista sin aplicar lo mío");
  D().despachar({ tipo: "elegirModo", modo: "editar" });
  D().usarLoMio(813);
  assert.deepEqual(D().edicion.zonas.filter((z) => z.participacionSpaceId === 813).map((z) => z.vertices), [cuadradoZ(0.5, 0.15, 0.7, 0.35)]);
  assert.equal(D().fusion, null);
  await D().salir({ forzado: true });
});

await prueba("las zonas de una participación que ya no rige no se editan ni se mandan (salen de la capa al confirmar); si una deja de regir, sus zonas salen de lo editado", async () => {
  D().reiniciar();
  const part = (space_id, numero, viva) => ({ space_id, codigo: `NAVE-GON-01-PC${numero}`, numero, viva, contratado_pb: 2000, dibujado_pb: 0, pendiente_pb: 0, terminos: [] });
  const conf = [zo(1, 812, cuadradoZ(0.1, 0.1, 0.3, 0.3)), zo(2, 899, cuadradoZ(0.5, 0.5, 0.7, 0.7), 1), zo(3, 813, cuadradoZ(0.1, 0.6, 0.2, 0.7), 2)];
  const vivas = [part(812, 1, true), part(813, 3, true), part(899, 2, false)];
  await entrarA(caraOut({ distribucion: distribucion(4, conf), participaciones: vivas }));
  assert.deepEqual(D().edicion.zonas.map((z) => z.participacionSpaceId), [812, 813], "se edita la zona de una participación que ya no rige");
  assert.equal(D().edicion.sucio, false);
  // Lo que se manda al confirmar: sólo las vivas (el servidor no marca ZONA_DE_PARTICIPACION_TERMINADA).
  servidor.pedidos = [];
  servidor.responder = async (cfg) => ({ version: 5, distribucion: distribucion(5, cfg.data.zonas.map((z, i) => zo(50 + i, z.participacion_space_id, z.vertices, i))), participaciones: vivas, revision: { capa: "confirmada", errores: [], avisos: [] } });
  await D().confirmar();
  assert.deepEqual(servidor.pedidos[0].data.zonas.map((z) => z.participacion_space_id), [812, 813]);
  // Se cancela la 813 (vuelve la cara de la escritura del término): sus zonas salen de lo editado sin dejar nada «sin guardar».
  D().aplicarCara(caraOut({ distribucion: distribucion(5, D().datos.distribucion.confirmada), participaciones: [part(812, 1, true), part(813, 3, false), part(899, 2, false)] }));
  assert.deepEqual(D().edicion.zonas.map((z) => z.participacionSpaceId), [812]);
  assert.equal(D().edicion.sucio, false);
  // Traer lo nuevo tampoco las trae de vuelta: ni las del servidor ni una que dibujé acá para la 899 cuando
  // todavía regía (la otra sesión no la tocó, así que «gana lo mío»… de una participación que ya no rige).
  D().despachar({ tipo: "fusionar", zonas: [...D().edicion.zonas, { clave: "n90", participacionSpaceId: 899, vertices: cuadradoZ(0.6, 0.1, 0.7, 0.2) }], base: D().edicion.base });
  servidor.responder = async () => caraOut({ distribucion: distribucion(6, [zo(60, 812, cuadradoZ(0.1, 0.1, 0.35, 0.3)), zo(61, 813, cuadradoZ(0.1, 0.6, 0.2, 0.7), 1)]), participaciones: [part(812, 1, true), part(813, 3, false), part(899, 2, false)] });
  await D().traerLoNuevo();
  assert.deepEqual(D().edicion.zonas.map((z) => z.participacionSpaceId), [812]);
  // Descartar el borrador vuelve a la confirmada… sin sus zonas de historia.
  servidor.responder = async () => ({ version: 7, distribucion: distribucion(7, [zo(60, 812, cuadradoZ(0.1, 0.1, 0.35, 0.3)), zo(62, 899, cuadradoZ(0.6, 0.1, 0.7, 0.2), 1)]),
    participaciones: [part(812, 1, true), part(899, 2, false)], revision: { capa: "confirmada", errores: [], avisos: [] } });
  await D().descartar();
  assert.deepEqual(D().edicion.zonas.map((z) => z.participacionSpaceId), [812], "descartar trajo de vuelta una zona de historia");
  await D().salir({ forzado: true });
  // «Recuperar lo que no se guardó»: lo dibujado para la 813 cuando regía no vuelve si ya no rige.
  D().reiniciar();
  await entrarA(caraOut({ distribucion: distribucion(7, [zo(70, 812, cuadradoZ(0.1, 0.1, 0.3, 0.3))]), participaciones: [part(812, 1, true), part(813, 3, true)] }));
  dibujar(813, 0.6, 0.6, 0.7, 0.7);
  servidor.responder = async () => { throw rechazo(503, { detail: "Servicio no disponible" }); };
  assert.equal(await D().salir({ forzado: true }), true);
  await entrarA(caraOut({ distribucion: distribucion(7, [zo(70, 812, cuadradoZ(0.1, 0.1, 0.3, 0.3))]), participaciones: [part(812, 1, true), part(813, 3, false)] }));
  assert.equal(S.hayParaRecuperar(D()), true);
  D().recuperar();
  assert.deepEqual(D().edicion.zonas.map((z) => z.participacionSpaceId), [812], "recuperar trajo la zona de una participación que ya no rige");
  await D().salir({ forzado: true });
});

await prueba("guardar el borrador, confirmar y descartar olvidan el resumen de Supervisar de esa sede (cambia su estado)", async () => {
  D().reiniciar();
  S.useAuthStore.getState().setAuth("t-res", "admin", "galerias");
  const sembrar = () => S.useOcupacionStore.setState({ resumen: { "galerias|NAVE||||||": { sede: "NAVE", caras: [] }, "galerias|OTRA||||||": { sede: "OTRA", caras: [] } } });
  servidorConVersion(4);
  await D().entrar({ sede: "NAVE", fixtureId: "f-1", codigo: "GON-01", cara: "A" });
  for (const accion of [async () => { dibujar(812, 0.1, 0.1, 0.2, 0.2); return D().guardarBorrador(); }, () => D().descartar()]) {
    sembrar();
    await accion();
    assert.deepEqual(Object.keys(S.useOcupacionStore.getState().resumen), ["galerias|OTRA||||||"]);
  }
  await D().salir({ forzado: true });
});

await prueba("cerrar la sesión (o un 401) vacía la edición entera, lo no guardado incluido; nada se escribió en localStorage", async () => {
  // Algo que no se pudo guardar en la cara B, y se sigue en la A.
  await entrarA(caraOut({ cara: "B" }), "B");
  dibujar(813, 0.5, 0.5, 0.6, 0.6);
  servidor.responder = async () => { throw rechazo(500, {}); };
  assert.equal(await D().salir({ forzado: true }), true);
  assert.equal(Object.keys(D().sinGuardar).length, 1);
  await entrarA(caraOut());
  dibujar(812, 0.1, 0.1, 0.2, 0.2);
  servidor.responder = async () => { throw rechazo(401, { detail: "Sesión vencida" }); };
  await D().guardarBorrador();
  assert.equal(S.useAuthStore.getState().token, null, "el 401 no cerró la sesión");
  const d = D();
  assert.deepEqual([d.activa, d.datos, d.edicion.zonas, d.formulario, d.sinGuardar, d.fusion], [null, null, [], null, {}, null]);
  S.useAuthStore.getState().setAuth("t-9", "admin", "otro-super");
  assert.equal(D().activa, null);
  assert.deepEqual([...escritas].sort(), ["retail-auth-v1", "retail-fixtures-v1"].filter((k) => escritas.has(k)).sort(),
    `se escribió en localStorage: ${[...escritas].join(", ")}`);
  for (const k of escritas) assert.ok(["retail-auth-v1", "retail-fixtures-v1"].includes(k), `clave nueva en localStorage: ${k}`);
});

console.log("distribución · guardas de los stores y del cliente");

const fuente = (rel) => leer(join(raiz, "src", ...rel.split("/")));
const sinComentTs2 = (t) => t.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");

await prueba("los dos stores se vacían al cambiar de sesión o de cliente, sin persist ni nada guardado en el navegador", () => {
  for (const f of ["store/ocupacionStore.ts", "store/distribucionStore.ts"]) {
    const t = sinComentTs2(fuente(f));
    assert.match(t, /useAuthStore\.subscribe\(\(s, antes\) => \{\s*if \(s\.token !== antes\.token \|\| s\.cliente !== antes\.cliente\) use\w+Store\.getState\(\)\.reiniciar\(\);/, `${f}: no se reinicia con la sesión`);
    assert.ok(/reiniciar: \(\) => \{/.test(t), `${f}: no tiene reiniciar`);
    assert.ok(!/\bpersist\b/.test(t), `${f}: usa persist`);
  }
  for (const f of ["store/ocupacionStore.ts", "store/distribucionStore.ts", "api/participaciones.ts", "utils/edicionDeZonas.ts", "utils/zonas3d.ts", "utils/coloresDeMarca.ts"]) {
    assert.ok(!/localStorage|sessionStorage|indexedDB/.test(sinComentTs2(fuente(f))), `${f} guarda algo en el navegador`);
  }
});

await prueba("`distribucionStore` lo importan sólo el Editor 3D y components/Distribucion; el tablero y el plano 2D, sólo el de lectura", () => {
  const todos = [];
  const recorrer = (dir) => {
    for (const n of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, n.name);
      if (n.isDirectory()) recorrer(p);
      else if (/\.(ts|tsx)$/.test(n.name)) todos.push(p);
    }
  };
  recorrer(join(raiz, "src"));
  const importan = todos.filter((p) => /from\s+["'][^"']*store\/distribucionStore["']/.test(leer(p)))
    .map((p) => p.slice(join(raiz, "src").length + 1).split("\\").join("/"));
  for (const p of importan) {
    assert.ok(p === "components/StoreEditor3D/StoreEditor3D.tsx" || p.startsWith("components/Distribucion/"), `${p} importa el store de edición`);
  }
  // El store de edición no entra por el de lectura (que sí baja con el tablero).
  assert.ok(!/distribucionStore/.test(sinComentTs2(fuente("store/ocupacionStore.ts"))));
});

// ═══════════════════════════════════════════════════════════════════════════
// PASO 6b · EL PANEL, EL LIENZO, LA LEYENDA, EL FORMULARIO Y EL TECLADO
// ═══════════════════════════════════════════════════════════════════════════
//
// La pantalla de Distribución (§9.3–§9.8). Lo que se puede romper sin que se
// vea en una captura:
//
//   · **El teclado** (§9.5). El atajo global del Editor 3D borra el mueble
//     seleccionado con Supr, lo gira con R, le cambia ancho por fondo con F y
//     deshace el PLANO con Ctrl+Z, y en Distribución el seleccionado es
//     justamente el mueble que se distribuye. El panel se queda con esas
//     teclas en CAPTURA: Supr borra la zona (nunca el mueble), Ctrl+Z deshace
//     la zona (nunca el plano), Esc nunca saca del modo. Se EJECUTA el oyente
//     con eventos de mentira, foco por foco.
//   · **La firma que 6a monta** (contrato entre los pasos 6a y 6b).
//   · **Los colores**: tokens reales, y escritos de modo que el cajón oscuro
//     del editor los cambie (un `var(--surface)` resuelto en `:root` llegaba
//     adentro con el blanco del tema claro).
//   · **La leyenda** dice las cuatro magnitudes, el estado comercial y la
//     vigencia; el formulario frena lo que el servidor rechazaría por fechas.

console.log("distribución · el panel, el lienzo y el teclado (paso 6b)");

const DIST = "components/Distribucion";
const ARCHIVOS_6B = ["PanelDeDistribucion", "LienzoDeZonas", "LeyendaDeParticipaciones", "FormularioDeParticipacion", "ResumenDeCambios"];
const codigo6b = (n) => sinComentTs2(fuente(`${DIST}/${n}.tsx`));

const rP = await build({
  stdin: {
    contents: [
      `export * as PANEL from "./src/${DIST}/PanelDeDistribucion.tsx";`,
      `export * as LEY from "./src/${DIST}/LeyendaDeParticipaciones.tsx";`,
      `export * as FORM from "./src/${DIST}/FormularioDeParticipacion.tsx";`,
      'export { useDistribucionStore } from "./src/store/distribucionStore.ts";',
      'export { estadoInicial } from "./src/utils/edicionDeZonas.ts";',
      'export { useAuthStore } from "./src/store/authStore.ts";',
    ].join("\n"),
    resolveDir: raiz, loader: "ts",
  },
  bundle: true, write: false, format: "esm", platform: "node", logLevel: "silent", jsx: "automatic",
  plugins: [{
    name: "sin-red",
    setup(b) {
      b.onResolve({ filter: /^axios$/ }, () => ({ path: "axios", namespace: "falso" }));
      b.onLoad({ filter: /^axios$/, namespace: "falso" }, () => ({ contents: AXIOS_FALSO, loader: "js" }));
      b.onResolve({ filter: /api[\\/]firebase$/ }, (a) => ({ path: a.path, namespace: "firebase-falso" }));
      b.onLoad({ filter: /.*/, namespace: "firebase-falso" }, () => ({ contents: "export const signOutFirebase = async () => {};", loader: "js" }));
    },
  }],
});
const dirP = mkdtempSync(join(tmpdir(), "distribucion-6b-"));
writeFileSync(join(dirP, "p.mjs"), rP.outputFiles[0].text);
const P6 = await import(pathToFileURL(join(dirP, "p.mjs")).href);
rmSync(dirP, { recursive: true, force: true });

/** Un nodo del DOM de mentira: su etiqueta y los selectores que lo contienen. */
const nodo = (tag, dentroDe = [], editable = false) => ({
  tagName: tag.toUpperCase(), isContentEditable: editable, closest: (sel) => (dentroDe.includes(sel) ? {} : null),
});
const EN_LIENZO = nodo("svg", ["[data-lienzo-de-zonas]", "[data-distribucion]"]);
const EN_BOTON_DEL_PANEL = nodo("button", ["[data-distribucion]"]);
const AFUERA = nodo("button", []);              // la barra del editor, fuera del modo
const EN_BODY = nodo("body", []);               // donde queda el foco después de tocar el 3D
const EN_CAMPO = nodo("input", ["[data-distribucion]"]);
const EN_DIALOGO = nodo("button", ['[role="dialog"]', "[data-distribucion]"]);
const tecla = (key, target, extra = {}) => ({
  key, ctrlKey: false, metaKey: false, shiftKey: false, ...extra, target, cortada: false, prevenida: false,
  stopPropagation() { this.cortada = true; }, preventDefault() { this.prevenida = true; },
});
const ZONA_A = { clave: "z1", participacionSpaceId: 7, vertices: [[0.1, 0.1], [0.4, 0.1], [0.4, 0.5], [0.1, 0.5]] };
const ZONA_B = { clave: "z2", participacionSpaceId: 8, vertices: [[0.5, 0.1], [0.9, 0.1], [0.9, 0.5], [0.5, 0.5]] };
let salidas = 0;
/** El modo encendido, con dos zonas, la 1 elegida y la participación 7 activa. */
const enElModo = (extra = {}) => {
  salidas = 0;
  P6.useDistribucionStore.setState({
    activa: { cliente: "galerias", sede: "NAVE", fixtureId: "f-1", codigo: "GON-01", cara: "A" },
    salir: async () => { salidas++; return true; },
    edicion: { ...P6.estadoInicial(), zonas: [ZONA_A, ZONA_B], base: [ZONA_A, ZONA_B], seleccion: { zona: "z1", vertice: null },
      activa: 7, medidas: { ancho: 0.9, alto: 1.8 }, ...extra },
  });
};
const atajo = (ev, modal = false) => { P6.PANEL.atajoDeDistribucion(ev, () => modal); return ev; };
const claves = () => P6.useDistribucionStore.getState().edicion.zonas.map((z) => z.clave);

await prueba("teclado: Supr borra la ZONA elegida con el foco en el lienzo (o en body, después de tocar el 3D), y el atajo global no ve la tecla", () => {
  enElModo();
  const ev = atajo(tecla("Delete", EN_LIENZO));
  assert.deepEqual(claves(), ["z2"], "Supr en el lienzo no borró la zona elegida");
  assert.ok(ev.cortada && ev.prevenida, "la tecla siguió hasta el atajo global del editor (que borra el mueble)");
  enElModo();
  atajo(tecla("Backspace", EN_BODY));
  assert.deepEqual(claves(), ["z2"], "Retroceso con el foco en body (tocando el 3D) no borró la zona");
  enElModo({ seleccion: { zona: "z1", vertice: 2 } });
  atajo(tecla("Delete", EN_LIENZO));
  assert.equal(P6.useDistribucionStore.getState().edicion.zonas[0].vertices.length, 3, "con un punto elegido, Supr borra el punto");
});

await prueba("teclado: Supr, R, F, Esc y Ctrl+Z NUNCA le llegan al atajo global mientras dura el modo, tenga el foco quien lo tenga", () => {
  for (const donde of [EN_LIENZO, EN_BOTON_DEL_PANEL, AFUERA, EN_BODY]) {
    for (const k of ["Delete", "Backspace", "r", "R", "f", "F", "Escape"]) {
      enElModo();
      const ev = atajo(tecla(k, donde));
      assert.ok(ev.cortada, `«${k}» con el foco en ${donde.tagName} llegó al atajo global`);
    }
    enElModo();
    assert.ok(atajo(tecla("z", donde, { ctrlKey: true })).cortada, `Ctrl+Z con el foco en ${donde.tagName} deshacía el plano`);
    assert.ok(atajo(tecla("y", donde, { metaKey: true })).cortada, `⌘+Y con el foco en ${donde.tagName} rehacía el plano`);
  }
  // Fuera del lienzo no se borra nada: Supr en un botón del panel o afuera no toca las zonas.
  for (const donde of [EN_BOTON_DEL_PANEL, AFUERA]) {
    enElModo();
    atajo(tecla("Delete", donde));
    assert.deepEqual(claves(), ["z1", "z2"], `Supr con el foco en ${donde.tagName} borró una zona`);
  }
  // Las teclas que no son del editor pasan (Tab, letras, Enter en un botón).
  for (const k of ["Tab", "a", "Enter", "ArrowDown"]) {
    enElModo({ seleccion: null });
    assert.ok(!atajo(tecla(k, EN_BOTON_DEL_PANEL)).cortada, `«${k}» en un botón del panel no llegó a su destino`);
  }
});

await prueba("teclado: Ctrl+Z deshace la ZONA (desde el lienzo y desde el panel), R elige el rectángulo, Esc cancela el trazo y nunca saca del modo", () => {
  enElModo();
  atajo(tecla("Delete", EN_LIENZO));
  assert.deepEqual(claves(), ["z2"]);
  atajo(tecla("z", EN_BOTON_DEL_PANEL, { ctrlKey: true }));
  assert.deepEqual(claves(), ["z1", "z2"], "Ctrl+Z desde el panel no deshizo la zona");
  atajo(tecla("Z", EN_LIENZO, { ctrlKey: true, shiftKey: true }));
  assert.deepEqual(claves(), ["z2"], "Ctrl+Shift+Z no rehízo");
  enElModo();
  atajo(tecla("r", EN_LIENZO));
  assert.equal(P6.useDistribucionStore.getState().edicion.herramienta, "rectangulo");
  enElModo({ herramienta: "poligono", trazo: [[0.1, 0.1], [0.2, 0.1]], seleccion: null });
  atajo(tecla("Escape", EN_LIENZO));
  assert.equal(P6.useDistribucionStore.getState().edicion.trazo, null, "Esc no canceló el trazo");
  const ev = atajo(tecla("Escape", EN_LIENZO));
  assert.ok(ev.cortada, "Esc sin nada que cancelar llegó al atajo global");
  atajo(tecla("Escape", EN_BOTON_DEL_PANEL));
  atajo(tecla("Escape", AFUERA));
  assert.equal(salidas, 0, "Esc llamó a salir");
  assert.ok(P6.useDistribucionStore.getState().activa, "Esc sacó del modo");
});

await prueba("teclado: lo que se escribe y los diálogos mandan (su Esc y su Enter siguen), pero Supr/R/F/Ctrl+Z no llegan al mueble; sin el modo, nada se toca", () => {
  enElModo();
  for (const k of ["Delete", "r", "Escape", "Backspace"]) {
    const ev = atajo(tecla(k, EN_CAMPO));
    assert.ok(!ev.cortada && !ev.prevenida, `«${k}» en un campo no llegó al campo`);
  }
  assert.deepEqual(claves(), ["z1", "z2"], "escribir en un campo borró una zona");
  for (const k of ["Escape", "Enter", "Tab"]) assert.ok(!atajo(tecla(k, EN_DIALOGO)).cortada, `«${k}» no le llegó al diálogo`);
  for (const k of ["Delete", "Backspace", "r", "F"]) assert.ok(atajo(tecla(k, EN_DIALOGO)).cortada, `«${k}» con el foco en el diálogo llegó al atajo global`);
  assert.ok(atajo(tecla("z", EN_DIALOGO, { ctrlKey: true })).cortada);
  // Con un diálogo modal abierto y el foco en body: nada se despacha, y Supr no llega al mueble.
  const ev = atajo(tecla("Delete", EN_BODY), true);
  assert.ok(ev.cortada);
  assert.deepEqual(claves(), ["z1", "z2"], "con un diálogo abierto, Supr borró una zona de atrás");
  assert.equal(salidas, 0);
  // Fuera del modo el editor de siempre sigue: el oyente no corta nada.
  P6.useDistribucionStore.setState({ activa: null });
  for (const k of ["Delete", "r", "Escape"]) assert.ok(!atajo(tecla(k, EN_BODY)).cortada, `sin el modo, «${k}» no llegó al editor`);
});

await prueba("el panel registra el oyente en captura y lo saca en captura, respeta role=\"dialog\" y no llama a salir desde el oyente", () => {
  const t = codigo6b("PanelDeDistribucion");
  const m = /window\.addEventListener\("keydown", (\w+), \{ capture: true \}\)/.exec(t);
  assert.ok(m, "el panel no registra keydown con capture: true");
  assert.ok(t.includes(`window.removeEventListener("keydown", ${m[1]}, { capture: true })`), "el oyente no se saca en captura (quedaría colgado)");
  assert.ok(t.includes('role="dialog"'), "el oyente no respeta los diálogos");
  const i = t.indexOf("export function atajoDeDistribucion(");
  assert.ok(i >= 0, "no está atajoDeDistribucion");
  const cuerpo = t.slice(i, t.indexOf("\n}\n", i));
  assert.ok(!/\bsalir\b/.test(cuerpo), "el oyente del teclado llama a salir: Esc nunca saca del modo");
  assert.match(cuerpo, /e\.stopPropagation\(\)/);
  assert.match(cuerpo, /accionDeTecla\(/, "el teclado no pasa por el reductor");
  // El panel no toca el atajo global (es de StoreEditor3D, fijado por probar-muebles).
  assert.ok(!/StoreEditor3D/.test(t.replace(/import[^\n]*\n/g, "")) || !/from\s+["'][^"']*StoreEditor3D/.test(t));
});

await prueba("contrato con 6a: las firmas exactas de PanelDeDistribucion y LienzoDeZonas, salir por el store", () => {
  const panel = codigo6b("PanelDeDistribucion"), lienzo = codigo6b("LienzoDeZonas");
  assert.match(panel, /export default function PanelDeDistribucion\(\{ fixtureId, sede, onEncuadrarCara \}: \{ fixtureId: string; sede: string; onEncuadrarCara: \(cara: "A" \| "B"\) => void \}\)/);
  assert.match(lienzo, /export default function LienzoDeZonas\(\{ fixtureId, sede \}: \{ fixtureId: string; sede: string \}\)/);
  assert.match(panel, /st\(\)\.salir\(\)/, "«Salir» no sale por el store");
  for (const n of ARCHIVOS_6B) {
    const t = codigo6b(n);
    assert.ok(!/from\s+["'][^"']*StoreEditor3D\/StoreEditor3D["']/.test(t), `${n} importa StoreEditor3D`);
    assert.ok(!/Marcador: lo reemplaza el paso 6b/.test(fuente(`${DIST}/${n}.tsx`)), `${n} sigue siendo el marcador de 6a`);
  }
});

await prueba("el lienzo: getScreenCTM().inverse() como Libera, rueda nativa no pasiva, y edita SÓLO por el reductor del store (nunca el plano)", () => {
  const t = codigo6b("LienzoDeZonas");
  assert.match(t, /getScreenCTM\(\)/);
  assert.match(t, /matrixTransform\(m\.inverse\(\)\)/, "el puntero no pasa por la inversa de la matriz del SVG");
  assert.match(t, /addEventListener\("wheel", (\w+), \{ passive: false \}\)/, "la rueda no es un oyente nativo con passive: false");
  assert.ok(!/onWheel=/.test(t), "con onWheel de React el preventDefault no vale");
  assert.match(t, /useDistribucionStore\.getState\(\)\.despachar\(a\)/);
  for (const n of ARCHIVOS_6B) {
    const c = codigo6b(n);
    assert.ok(!/useDistribucionStore\.setState\(/.test(c), `${n} escribe el store de edición por fuera de sus acciones`);
  }
  assert.ok(!/\.commit\(/.test(t), "el lienzo escribe el plano");
  // Los trazos, las manijas y los rótulos miden en pantalla, no en metros.
  assert.match(t, /const px = \(n: number\) => n \/ escala;/);
  // El rótulo va sobre una pastilla y nunca en el color de la serie.
  assert.match(t, /<text textAnchor="middle" dominantBaseline="central" style=\{\{ fill: error \? C\.rojo : C\.tinta \}\}>/);
});

await prueba("colores: un botón principal por archivo, tokens que existen y que el cajón oscuro redefine; nada guardado en el navegador", () => {
  const css = [leer(join(raiz, "src", "tema.css")), leer(join(raiz, "src", "index.css"))].join("\n");
  for (const n of ARCHIVOS_6B) {
    const crudo = fuente(`${DIST}/${n}.tsx`), t = codigo6b(n);
    const principales = (crudo.match(/["'\s`]btn-principal["'\s`]/g) || []).length;
    assert.ok(principales <= 1, `${n}: ${principales} botones principales`);
    for (const m of t.matchAll(/var\(\s*(--[\w-]+)\s*[,)]/g)) {
      assert.ok(new RegExp(`${m[1]}\\s*:`).test(css), `${n}: ${m[1]} no existe en el tema`);
    }
    // El único nombre armado en el momento es el tono de la estampa (--marca-1..3).
    for (const m of t.matchAll(/var\(\s*(--[\w-]*)\$\{/g)) assert.equal(m[1], "--marca-", `${n}: var(${m[1]}…) armado a mano`);
    // Resueltos en :root: adentro del cajón oscuro del editor llegarían con el valor del tema claro.
    const raiz1 = /var\(--(surface|surface-2|surface-3|ink-[1-4]|danger|warning|success|line|line-strong|accent|bg)\)/.exec(t);
    assert.equal(raiz1, null, `${n}: ${raiz1?.[0]} se resuelve en :root (usá rgb(var(--x-rgb)))`);
    assert.ok(!/--superficie|--tinta\b|prefers-color-scheme/.test(t), `${n}: token inventado o prefers-color-scheme`);
    assert.ok(!/localStorage|sessionStorage|indexedDB/.test(t), `${n} guarda algo en el navegador`);
  }
  assert.match(fuente(`${DIST}/PanelDeDistribucion.tsx`), /className="btn-principal[^"]*"[\s\S]{0,260}Confirmar distribución…/,
    "el botón principal del panel no es «Confirmar distribución…»");
  // Las estampas son los --marca-k del tema.
  P6.LEY && C.ESTAMPAS.forEach((e) => assert.equal(P6.LEY.tonoCss(e), `var(--marca-${C.TONOS_DE_MARCA.indexOf(e.tono) + 1})`));
});

/** Un término como lo manda el servidor. */
const tOut = (x) => ({
  id: 1, space_id: 7, codigo: "NAVE-GON-01-PC1", numero: 1, cara: "A", estado: "contrato", estado_visible: "vigente",
  puntos_basicos: 2500, porcentaje: "25 %", proveedor: { id: 4, nombre: "Postobón" }, marca: "Hit",
  desde: "2026-11-01", hasta: "2027-01-31", caduca: null, lease_id: 30, valor_mensual: 900000, renueva_a: null, notas: null,
  baja_en: null, baja_fecha: null, version: 1, creada_en: "2026-10-01T00:00:00+00:00", creada_por: null, ...x,
});
const pOut = (terminos, x = {}) => ({
  space_id: terminos[0].space_id, codigo: terminos[0].codigo, numero: terminos[0].numero, viva: true,
  contratado_pb: terminos[0].puntos_basicos, dibujado_pb: 0, pendiente_pb: terminos[0].puntos_basicos, terminos, ...x,
});
const cuenta = (contratado, dibujado) => ({ numero: 1, viva: true, contratado, dibujado, pendiente: Math.max(0, contratado - dibujado), exceso: dibujado - contratado });

await prueba("la leyenda dice las cuatro magnitudes, el estado comercial y la vigencia (y «desde el…» si no cuenta ese día)", () => {
  const L = P6.LEY;
  const vigente = pOut([tOut({ desde: "2026-10-01", hasta: "2027-01-31" })]);
  let f = L.filaDeLaLeyenda(vigente, cuenta(2500, 2410), "2026-10-17", "2026-10-17");
  assert.equal(f.nombre, "1 · Postobón · Hit");
  assert.equal(f.estado, "Contrato vigente");
  assert.equal(f.vigencia, "del 1 oct 2026 al 31 ene 2027");
  assert.equal(L.textoDeMagnitudes(f), "25 % contratado · 24,1 % dibujado · falta 0,9 %");
  assert.equal(f.cuentaElDia, true);
  assert.equal(f.rotuloDelDia, null);
  assert.equal(L.textoDeMagnitudes(L.filaDeLaLeyenda(vigente, cuenta(2500, 2600), "2026-10-17", "2026-10-17")),
    "25 % contratado · 26 % dibujado · sobra 1 %");
  assert.equal(L.textoDeMagnitudes(L.filaDeLaLeyenda(vigente, cuenta(2500, 2500), "2026-10-17", "2026-10-17")),
    "25 % contratado · 25 % dibujado · completa");
  // Una reserva: su caducidad en el chip.
  const reserva = pOut([tOut({ estado: "reserva", estado_visible: "reserva", lease_id: null, valor_mensual: null, caduca: "2026-10-25", desde: "2026-10-17", hasta: "2026-12-31" })]);
  f = L.filaDeLaLeyenda(reserva, cuenta(2500, 0), "2026-10-17", "2026-10-17");
  assert.equal(f.estado, "Reserva provisional · caduca el 25 oct");
  assert.equal(f.esReserva, true);
  // Un contrato firmado que empieza el 1 dic: ese día no cuenta y se dice desde cuándo.
  const firmado = pOut([tOut({ estado_visible: "firmado", desde: "2026-12-01", hasta: "2027-02-28" })]);
  f = L.filaDeLaLeyenda(firmado, cuenta(2500, 0), "2026-10-17", "2026-10-17");
  assert.equal(f.estado, "Contrato firmado · empieza el 1 dic");
  assert.equal(f.cuentaElDia, false);
  assert.equal(f.rotuloDelDia, "desde el 1 dic");
  // Con una renovación: se muestra el que cuenta y «Después: …».
  const renovado = pOut([tOut({ id: 2, desde: "2027-02-01", hasta: "2027-04-30", estado_visible: "firmado" }), tOut({ id: 1, desde: "2026-10-01", hasta: "2027-01-31" })]);
  f = L.filaDeLaLeyenda(renovado, cuenta(2500, 2500), "2026-10-17", "2026-10-17");
  assert.equal(f.termino.id, 1);
  assert.equal(f.despues?.id, 2);
  // El código del componente las escribe (la fila, el chip y la vigencia; «Para vender» arriba).
  const t = codigo6b("LeyendaDeParticipaciones");
  for (const pieza of ["textoDeMagnitudes(f)", "{f.estado}", "{f.vigencia}", "Para vender:", "{f.rotuloDelDia}"]) assert.ok(t.includes(pieza), `la leyenda no muestra ${pieza}`);
});

await prueba("la capacidad del día y del período: un segmento por participación, lo vendido entero cuenta 100 %, lo que queda para vender", () => {
  const L = P6.LEY;
  const a = pOut([tOut({ id: 1, space_id: 7, numero: 1, puntos_basicos: 3000, desde: "2026-10-01", hasta: "2027-01-31" })]);
  const b = pOut([tOut({ id: 2, space_id: 8, numero: 2, puntos_basicos: 2500, estado: "reserva", estado_visible: "reserva", lease_id: null, caduca: "2026-10-30", desde: "2026-10-17", hasta: "2026-11-30", proveedor: { id: 5, nombre: "Alpina" } })]);
  const cara = { hoy: "2026-10-17", participaciones: [a, b], capacidad: { periodo: { desde: "2026-10-17", hasta: "2027-10-16" }, fisicos: [] } };
  let c = L.capacidadDe(cara, "2026-10-17");
  assert.deepEqual(c.segmentos.map((s) => [s.numero, s.pb]), [[1, 3000], [2, 2500]]);
  assert.equal(c.comprometido, 5500);
  assert.equal(c.queda, 4500);
  assert.equal(c.periodo.pico, 5500);
  assert.equal(c.periodo.queda, 4500, "en todo el período queda lo del pico");
  assert.ok(c.segmentos.every((s) => s.estampa), "una participación viva sin estampa");
  c = L.capacidadDe(cara, "2026-12-15");
  assert.deepEqual(c.segmentos.map((s) => s.numero), [1], "la reserva terminó el 30 nov y se sigue contando");
  c = L.capacidadDe({ ...cara, capacidad: { ...cara.capacidad, fisicos: [{ desde: "2027-03-01", hasta: "2027-03-31" }] } }, "2027-03-10");
  assert.equal(c.enteraElDia, true);
  assert.equal(c.queda, 0);
  assert.equal(c.periodo.queda, 0, "con la cara vendida entera un mes, en el año no queda nada para vender por participación");
  c = L.capacidadDe(cara, "2026-10-17", { desde: "2027-02-01", hasta: "2027-06-30" });
  assert.equal(c.periodo.queda, 10000, "el período elegido no mira lo que terminó antes");
});

await prueba("el formulario frena antes de mandar lo que el servidor rechazaría (porcentaje, fechas, caducidad, valor) y lee los pesos como se escriben", () => {
  const F = P6.FORM;
  const base = { tipo: "contrato", proveedor: "Postobón", correo: "", marca: "", porcentaje: "25", desde: "2026-10-17", hasta: "2026-12-31", caduca: "2026-10-24", valor: "900.000", notas: "" };
  const hoy = "2026-10-17";
  assert.equal(F.problemaDeLosCampos("alta", base, hoy), null);
  assert.equal(F.problemaDeLosCampos("alta", { ...base, porcentaje: "0" }, hoy), "Escribí un porcentaje entre 0,01 y 100.");
  assert.equal(F.problemaDeLosCampos("alta", { ...base, porcentaje: "120" }, hoy), "Escribí un porcentaje entre 0,01 y 100.");
  assert.equal(F.problemaDeLosCampos("alta", { ...base, proveedor: "  " }, hoy), "Escribí el proveedor.");
  assert.equal(F.problemaDeLosCampos("alta", { ...base, desde: "2027-01-01" }, hoy), "La fecha de inicio no puede ser posterior a la de fin.");
  assert.match(F.problemaDeLosCampos("alta", { ...base, valor: "" }, hoy), /^Escribí el valor mensual del contrato/);
  assert.equal(F.problemaDeLosCampos("alta", { ...base, valor: "0" }, hoy), null, "un contrato de $ 0 es válido");
  const reserva = { ...base, tipo: "reserva", valor: "" };
  assert.equal(F.problemaDeLosCampos("alta", reserva, hoy), null);
  assert.equal(F.problemaDeLosCampos("alta", { ...reserva, caduca: "2027-01-05" }, hoy), "La reserva tiene que caducar entre hoy y el último día que reserva.");
  assert.equal(F.problemaDeLosCampos("alta", { ...reserva, caduca: "2026-10-16" }, hoy), "La reserva tiene que caducar entre hoy y el último día que reserva.");
  assert.equal(F.problemaDeLosCampos("alta", { ...reserva, desde: "2026-09-01", hasta: "2026-10-01", caduca: "2026-10-01" }, hoy),
    "Una reserva provisional tiene que terminar hoy o después.");
  // Renovar no pide proveedor (es el de la participación); confirmar pide el valor.
  assert.equal(F.problemaDeLosCampos("renovar", { ...base, proveedor: "" }, hoy), null);
  assert.match(F.problemaDeLosCampos("confirmar", { ...reserva, valor: "" }, hoy), /^Escribí el valor mensual/);
  assert.equal(F.valorDeTexto("900.000"), 900000);
  assert.equal(F.valorDeTexto("$ 1.250.000"), 1250000);
  assert.equal(F.valorDeTexto("900000,5"), 900000.5);
  assert.equal(F.valorDeTexto("abc"), null);
  assert.equal(F.valorDeTexto("-5"), null);
});

// ── Verificación del paso 6b ─────────────────────────────────────────────────

await prueba("teclado (verificación 6b): desde el PANEL andan V/R/P/G, deshacer y Esc —clic en la fila de la leyenda y R—; Supr, flechas y Enter siguen siendo sólo del lienzo", () => {
  // El camino que la pantalla sugiere: «Elegí una participación en la lista
  // para dibujar su zona» → clic en la fila (el foco queda en la fila) → R.
  // Antes la R se cortaba y no hacía nada.
  enElModo({ seleccion: null });
  let ev = atajo(tecla("r", EN_BOTON_DEL_PANEL));
  assert.equal(P6.useDistribucionStore.getState().edicion.herramienta, "rectangulo", "R con el foco en la fila de la leyenda no eligió el rectángulo");
  assert.ok(ev.cortada && ev.prevenida, "la R siguió hasta el atajo global (gira el mueble)");
  atajo(tecla("p", EN_BOTON_DEL_PANEL));
  assert.equal(P6.useDistribucionStore.getState().edicion.herramienta, "poligono");
  atajo(tecla("v", EN_BOTON_DEL_PANEL));
  assert.equal(P6.useDistribucionStore.getState().edicion.herramienta, "seleccionar");
  const iman = P6.useDistribucionStore.getState().edicion.iman;
  atajo(tecla("g", EN_BOTON_DEL_PANEL));
  assert.equal(P6.useDistribucionStore.getState().edicion.iman, !iman, "G desde el panel no alternó el imán");
  // Lo que borra o mueve una zona, no: con una zona elegida, las flechas y Supr
  // en un botón del panel no la tocan (son del botón o de la lista).
  enElModo();
  const antes = JSON.stringify(P6.useDistribucionStore.getState().edicion.zonas);
  ev = atajo(tecla("ArrowLeft", EN_BOTON_DEL_PANEL));
  assert.ok(!ev.cortada, "la flecha en un botón del panel no le llegó al botón");
  atajo(tecla("Delete", EN_BOTON_DEL_PANEL));
  assert.equal(JSON.stringify(P6.useDistribucionStore.getState().edicion.zonas), antes, "una tecla en el panel movió o borró una zona");
  // Enter en un botón del panel es del botón, aunque haya un polígono a medias.
  enElModo({ herramienta: "poligono", trazo: [[0.1, 0.1], [0.2, 0.1], [0.2, 0.3]], seleccion: null });
  ev = atajo(tecla("Enter", EN_BOTON_DEL_PANEL));
  assert.ok(!ev.cortada && P6.useDistribucionStore.getState().edicion.trazo, "Enter en un botón del panel cerró el polígono del lienzo");
  // Sin acción, en el lienzo, las teclas del atajo global se cortan Y se frenan (Retroceso no navega).
  enElModo({ seleccion: null });
  ev = atajo(tecla("Backspace", EN_LIENZO));
  assert.ok(ev.cortada && ev.prevenida, "Retroceso sin nada elegido, en el lienzo, no se frenó");
  // Afuera del modo (la barra del editor) nada se despacha.
  enElModo({ seleccion: null });
  atajo(tecla("r", AFUERA));
  assert.equal(P6.useDistribucionStore.getState().edicion.herramienta, "seleccionar", "una R afuera del modo eligió una herramienta");
});

await prueba("capacidad (verificación 6b): el pico de un período que empezó antes de hoy no mira los días que ya pasaron", () => {
  const L = P6.LEY;
  // Un contrato del 90 % que terminó el 30 sep, y hoy es 17 oct: ese 90 % no
  // compromete nada de lo que queda del período.
  const viejo = pOut([tOut({ id: 9, space_id: 9, numero: 1, puntos_basicos: 9000, estado_visible: "vencido", desde: "2026-08-01", hasta: "2026-09-30" })], { viva: false });
  const hoyVivo = pOut([tOut({ id: 10, space_id: 10, numero: 2, puntos_basicos: 2000, desde: "2026-10-01", hasta: "2026-12-31", proveedor: { id: 5, nombre: "Alpina" } })]);
  const cara = { hoy: "2026-10-17", participaciones: [viejo, hoyVivo], capacidad: { periodo: { desde: "2026-10-17", hasta: "2027-10-16" }, fisicos: [] } };
  const c = L.capacidadDe(cara, "2026-10-17", { desde: "2026-09-01", hasta: "2026-12-31" });
  assert.equal(c.periodo.pico, 2000, `el pico miró el pasado: ${c.periodo.pico}`);
  assert.equal(c.periodo.diaPico >= "2026-10-17", true, `el día del pico es anterior a hoy: ${c.periodo.diaPico}`);
  assert.equal(c.periodo.queda, 8000);
});

await prueba("panel y leyenda (verificación 6b): «Guardarlos como borrador» guarda como la persona (con historial), y un contrato escrito vuelve a leer el estado comercial del plano", () => {
  const panel = codigo6b("PanelDeDistribucion");
  const i = panel.indexOf("async function guardarYSeguir(");
  assert.ok(i >= 0, "no está guardarYSeguir");
  const cuerpo = panel.slice(i, panel.indexOf("\n  }\n", i));
  const g = cuerpo.indexOf("guardarBorrador(false)");
  assert.ok(g >= 0, "«Guardarlos como borrador» guarda como autoguardado (sin historial ni bitácora)");
  assert.ok(g < cuerpo.indexOf("cambiarCara(") && g < cuerpo.indexOf("salir()"), "el guardado explícito tiene que ir antes de cambiar de cara o salir");
  const ley = codigo6b("LeyendaDeParticipaciones");
  const c = ley.indexOf("await cancelLease(");
  assert.ok(c >= 0 && ley.indexOf("refrescarComercial()", c) > c, "cancelar un contrato no vuelve a leer el estado comercial del plano");
  const form = codigo6b("FormularioDeParticipacion");
  assert.match(form, /r\.termino\.estado === "contrato"\) void useFixtureStore\.getState\(\)\.refrescarComercial\(\)/,
    "un contrato nuevo no vuelve a leer el estado comercial del plano");
});

await prueba("pantalla (verificación 6b): lo que sólo se ve en pantalla, fijado — solape rojo sólo con fechas cruzadas, relleno sólo de lo que cuenta ese día, edición frenada con el plano sin guardar, confirmar frenado con errores, beforeunload, revisión congelada en el arrastre", () => {
  // Sin DOM no se puede mirar el dibujo: se fija el código que lo decide (cada
  // una de estas líneas, sacada, dejaba todas las pruebas en verde).
  const lienzo = codigo6b("LienzoDeZonas"), panel = codigo6b("PanelDeDistribucion");
  const resumen = codigo6b("ResumenDeCambios"), ley = codigo6b("LeyendaDeParticipaciones"), form = codigo6b("FormularioDeParticipacion");
  assert.match(lienzo, /if \(!t1 \|\| !t2 \|\| !seCruzanEnFechas\(t1, t2, hoy\)\) continue;/, "el solape rojo no mira si las fechas se cruzan (§3.6)");
  assert.match(lienzo, /if \(!info\?\.cuenta \|\| !info\.estampa\) return null;/, "se rellena una participación que no cuenta el día de «Ver al día» (va sólo punteada)");
  assert.match(panel, /const editable = !!datos\?\.por_participacion && !!datos\.superficie && alDia;/, "se edita con el plano sin guardar (§9.2: la firma tiene que coincidir)");
  assert.match(lienzo, /const puedeEditar = [^;]*alDia[^;]*edicion\.modo === "editar";/, "el lienzo dibuja con el plano sin guardar o en «Mirar»");
  assert.match(resumen, /const bloqueado = errores\.length > 0 \|\| !enTopes \|\| !alDia/, "«Confirmar» no se frena con errores, fuera de los topes o con el plano sin guardar");
  assert.match(panel, /window\.addEventListener\("beforeunload", (\w+)\)[\s\S]{0,80}window\.removeEventListener\("beforeunload", \1\)/, "cerrar la pestaña con cambios sin guardar no pregunta (§9.8)");
  assert.match(ley, /s\.edicion\.arrastre \? s\.edicion\.arrastre\.antes : s\.edicion\.zonas/, "la revisión en vivo se recalcula en cada movimiento del arrastre (§9.4: al soltar)");
  assert.match(ley, /const renovable = masNuevo && masNuevo\.estado === "contrato" \? masNuevo : null;/, "«Renovar» se ofrece en una reserva (§4.7: sólo el contrato vivo más nuevo)");
  assert.match(form, /const excluir = \(modo === "editar" \|\| modo === "confirmar"\) && termino \? termino\.id : null;/,
    "la vista previa de cambiar o confirmar una reserva la cuenta dos veces (a ella misma)");
});

await prueba("vista de pantalla (verificación 6b): «Ver cómo estaba» y el período se vacían al cambiar de cara, de sesión o de cliente (geometría de un supermercado en la pantalla de otro)", () => {
  const V = P6.LEY.useVistaDeDistribucion;
  const sembrar = () => {
    V.getState().elegirPeriodo({ desde: "2027-01-01", hasta: "2027-02-01" });
    V.getState().verComoEstaba({ titulo: "cómo quedó", zonas: [{ id: 1, participacion_space_id: 7, vertices: [[0, 0], [1, 0], [1, 1]], orden: 0 }] });
  };
  const vacia = () => V.getState().comoEstaba === null && V.getState().periodo === null;
  enElModo();
  sembrar();
  P6.useDistribucionStore.setState({ activa: { ...P6.useDistribucionStore.getState().activa, cara: "B" } });
  assert.ok(vacia(), "cambiar de cara dejó «Ver cómo estaba» de la otra");
  sembrar();
  P6.useAuthStore.setState({ token: "otro-token" });
  assert.ok(vacia(), "cambiar de sesión dejó la vista de la anterior");
  sembrar();
  P6.useAuthStore.setState({ cliente: "otro-cliente" });
  assert.ok(vacia(), "cambiar de cliente dejó la vista del anterior");
});

console.log(`\n${hechas} pruebas de distribución en verde`);
