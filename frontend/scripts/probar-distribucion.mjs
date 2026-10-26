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
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
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
// Distribuir con piezas (2026-10-24): la pantalla es `DistribuirCara` (reemplaza al panel y al
// lienzo de antes) y la cara de frente, `CaraDePiezas`; las mismas reglas valen para las dos.
const ARCHIVOS_6B = ["DistribuirCara", "CaraDePiezas", "LeyendaDeParticipaciones", "FormularioDeParticipacion", "ResumenDeCambios"];
const codigo6b = (n) => sinComentTs2(fuente(`${DIST}/${n}.tsx`));

const rP = await build({
  stdin: {
    contents: [
      `export * as PANEL from "./src/${DIST}/DistribuirCara.tsx";`,
      `export * as PZC from "./src/${DIST}/piezasDeLaCara.ts";`,
      `export * as CARA from "./src/${DIST}/CaraDePiezas.tsx";`,
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

await prueba("teclado: Ctrl+Z deshace la PIEZA (desde la cara y desde la lista), R no elige herramientas (pero se corta), Esc cancela el trazo y nunca saca de la pantalla", () => {
  enElModo();
  atajo(tecla("Delete", EN_LIENZO));
  assert.deepEqual(claves(), ["z2"]);
  atajo(tecla("z", EN_BOTON_DEL_PANEL, { ctrlKey: true }));
  assert.deepEqual(claves(), ["z1", "z2"], "Ctrl+Z desde la lista no deshizo");
  atajo(tecla("Z", EN_LIENZO, { ctrlKey: true, shiftKey: true }));
  assert.deepEqual(claves(), ["z2"], "Ctrl+Shift+Z no rehízo");
  // Distribuir con piezas: no hay herramientas. R, P y V no cambian nada, y R
  // igual se corta (si no, gira el mueble).
  for (const k of ["r", "R", "p", "v", "g"]) {
    enElModo();
    const ev = atajo(tecla(k, EN_LIENZO));
    assert.equal(P6.useDistribucionStore.getState().edicion.herramienta, "seleccionar", `«${k}» eligió una herramienta`);
    assert.equal(P6.useDistribucionStore.getState().edicion.iman, true, `«${k}» tocó el imán`);
    if (k === "r" || k === "R") assert.ok(ev.cortada, "R llegó al atajo global (gira el mueble)");
  }
  enElModo({ herramienta: "poligono", trazo: [[0.1, 0.1], [0.2, 0.1]], seleccion: null });
  atajo(tecla("Escape", EN_LIENZO));
  assert.equal(P6.useDistribucionStore.getState().edicion.trazo, null, "Esc no canceló el trazo");
  const ev = atajo(tecla("Escape", EN_LIENZO));
  assert.ok(ev.cortada, "Esc sin nada que cancelar llegó al atajo global");
  atajo(tecla("Escape", EN_BOTON_DEL_PANEL));
  atajo(tecla("Escape", AFUERA));
  assert.equal(salidas, 0, "Esc llamó a salir");
  assert.ok(P6.useDistribucionStore.getState().activa, "Esc sacó de la pantalla");
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

await prueba("la pantalla registra el oyente en captura y lo saca en captura, respeta role=\"dialog\" y no llama a salir desde el oyente", () => {
  const t = codigo6b("DistribuirCara");
  const m = /window\.addEventListener\("keydown", (\w+), \{ capture: true \}\)/.exec(t);
  assert.ok(m, "la pantalla no registra keydown con capture: true");
  assert.ok(t.includes(`window.removeEventListener("keydown", ${m[1]}, { capture: true })`), "el oyente no se saca en captura (quedaría colgado)");
  assert.ok(t.includes('role="dialog"'), "el oyente no respeta los diálogos");
  const i = t.indexOf("export function atajoDeDistribucion(");
  assert.ok(i >= 0, "no está atajoDeDistribucion");
  const cuerpo = t.slice(i, t.indexOf("\n}\n", i));
  assert.ok(!/\bsalir\b/.test(cuerpo), "el oyente del teclado llama a salir: Esc nunca saca de la pantalla");
  assert.match(cuerpo, /e\.stopPropagation\(\)/);
  assert.match(cuerpo, /accionDeTecla\(/, "el teclado no pasa por el reductor");
  assert.match(cuerpo, /POR_TECLADO\.has\(posible\.tipo\)/, "el teclado despacha acciones que no son de esta pantalla (herramientas, flechas)");
  // Lo que el teclado puede hacer, escrito: ni herramientas, ni imán, ni flechas (una pieza corrida dejaría de dar su %).
  const lista = /const POR_TECLADO: ReadonlySet<Accion\["tipo"\]> = new Set<Accion\["tipo"\]>\(\[([\s\S]*?)\]\);/.exec(t);
  assert.ok(lista, "no está POR_TECLADO");
  for (const prohibida of ["elegirHerramienta", "alternarIman", "empujar", "moverZona", "escalar"]) {
    assert.ok(!lista[1].includes(`"${prohibida}"`), `el teclado puede «${prohibida}»`);
  }
  // La pantalla no toca el atajo global (es de StoreEditor3D, fijado por probar-muebles).
  assert.ok(!/from\s+["'][^"']*StoreEditor3D\/StoreEditor3D/.test(t));
});


await prueba("contrato con el editor: las firmas exactas de DistribuirCara y CaraDePiezas, salir por el store", () => {
  const panel = codigo6b("DistribuirCara"), cara = codigo6b("CaraDePiezas");
  assert.match(panel, /export default function DistribuirCara\(\{ fixtureId, sede, onEncuadrarCara, lienzo3D \}: \{\s*fixtureId: string;\s*sede: string;\s*onEncuadrarCara: \(cara: "A" \| "B"\) => void;[\s\S]{0,160}lienzo3D: HTMLElement \| null;\s*\}\)/);
  assert.match(cara, /export default function CaraDePiezas\(\{ fixtureId, sede, onSoltar \}: \{/);
  assert.match(panel, /await st\(\)\.salir\(\)/, "«Salir» no sale por el store");
  for (const n of ARCHIVOS_6B) {
    const t = codigo6b(n);
    assert.ok(!/from\s+["'][^"']*StoreEditor3D\/StoreEditor3D["']/.test(t), `${n} importa StoreEditor3D`);
  }
  // Los archivos de antes se fueron (el panel, el lienzo y «Editar en el 3D»).
  for (const n of ["PanelDeDistribucion.tsx", "LienzoDeZonas.tsx", "EdicionEnElMueble.tsx", "punteroEnElMueble.ts"]) {
    assert.ok(!existsSync(join(raiz, "src", ...DIST.split("/"), n)), `quedó ${n}`);
  }
});


await prueba("la cara: getScreenCTM().inverse() como Libera, y edita SÓLO por el reductor del store (nunca el plano); el rótulo nunca en el color de la marca", () => {
  const t = codigo6b("CaraDePiezas");
  assert.match(t, /getScreenCTM\(\)/);
  assert.match(t, /matrixTransform\(m\.inverse\(\)\)/, "el puntero no pasa por la inversa de la matriz del SVG");
  assert.ok(!/onWheel=/.test(t), "con onWheel de React el preventDefault no vale");
  assert.match(t, /const despachar = useDistribucionStore\.getState\(\)\.despachar;/);
  for (const n of ARCHIVOS_6B) {
    const c = codigo6b(n);
    assert.ok(!/useDistribucionStore\.setState\(/.test(c), `${n} escribe el store de edición por fuera de sus acciones`);
  }
  assert.ok(!/\.commit\(/.test(t), "la cara escribe el plano");
  // Los trazos, las manijas y los rótulos miden en pantalla, no en metros.
  assert.match(t, /const px = \(n: number\) => n \/ escala;/);
  // Cada texto de la cara va en un color de tinta del tema (o el rojo de texto), nunca en el tono de una marca.
  const textos = [...t.matchAll(/<text\b[^>]*>/g)].map((m) => m[0]);
  assert.ok(textos.length >= 3, "no encontré los rótulos de la cara");
  for (const x of textos) assert.match(x, /fill: ((o|r2)\.rojo \? C\.rojoTxt : C\.tinta2?|C\.tinta2|C\.libreTxt)\b/, `un rótulo con otro color: ${x}`);
  // Corrección tras la ronda de prueba (2026-10-24): el rótulo dice lo que HAY (no el contratado) y, si no está justa, en rojo.
  assert.match(t, /const r2 = o\.rotulo !== undefined \? null : rotuloDePieza\(p,/, "el rótulo de la pieza no dice lo que hay");
  assert.ok(!/\$\{pct\(p\.pb\)\}\$\{p\.estado === "ubicada"/.test(t), "el rótulo vuelve a decir el contratado");
  // Piezas LISAS: el rayado es «no se vende»; si dos marcas comparten tono, puntos (nunca rayas).
  assert.ok(!/patternTransform=\{`rotate\(\$\{p\.estampa/.test(t), "las piezas vuelven a ir rayadas según su estampa");
  assert.match(t, /const patron = o\.rojo \? "rojo" : patronDe\(p, piezas\);/);
  // El choque en rojo no se puede agarrar.
  assert.match(t, /dibujoDePieza\(porS\.get\(choque\.spaceId\)!, \[poligonoDeRect\(choque\.rect\)\], \{ rojo: true, rotulo: null, inerte: true \}\)/, "el fantasma rojo del choque se puede agarrar");
  assert.match(t, /data-pieza=\{real \? p\.spaceId : undefined\}/);
  assert.match(t, /pointerEvents=\{o\.inerte \|\| o\.fantasma \? "none" : undefined\}/);
  // Lo libre de la cara, por día: la misma cuenta que la lista (dos marcas que se turnan no se suman).
  assert.match(t, /capacidadDe\(datos, hoy\)\.queda/, "el «Libre» de la cara no es la cuenta de la lista");
  assert.ok(!/10000 - ubicado/.test(t), "el «Libre» de la cara vuelve a sumar lo dibujado de marcas que se turnan");
  // Cada pieza con nombre accesible y movible con las flechas (sin arrastrar).
  assert.match(t, /role=\{real \? "button" : undefined\} tabIndex=\{real \? 0 : undefined\} aria-label=\{nombre\}/);
  assert.match(t, /e\.key === "ArrowLeft" \|\| e\.key === "ArrowRight"/);
});


await prueba("colores: un botón principal por archivo, tokens que existen (escritos como canales); nada guardado en el navegador", () => {
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
    const raiz1 = /var\(--(surface|surface-2|surface-3|ink-[1-4]|danger|warning|success|line|line-strong|accent|bg)\)/.exec(t);
    assert.equal(raiz1, null, `${n}: ${raiz1?.[0]} (usá rgb(var(--x-rgb)) o la clase del token)`);
    assert.ok(!/--superficie|--tinta\b|prefers-color-scheme/.test(t), `${n}: token inventado o prefers-color-scheme`);
    assert.ok(!/localStorage|sessionStorage|indexedDB/.test(t), `${n} guarda algo en el navegador`);
    // Distribuir va en el tema de la app (claro u oscuro): nada del cajón oscuro congelado.
    assert.ok(!/\bdark-(bg|surface|line|ink)/.test(t), `${n} pinta con el cajón oscuro (\`dark-*\`): la pantalla va en el tema de la app`);
  }
  assert.match(fuente(`${DIST}/DistribuirCara.tsx`), /className="btn-principal[^"]*"[\s\S]{0,320}Listo, guardar la cara/,
    "el botón principal de la pantalla no es «Listo, guardar la cara»");
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
  // Distribuir con piezas: la lista de la derecha dice, por marca, su nombre (sin número), su %, su
  // estado en palabras y —en su menú— el estado comercial y la vigencia; abajo, lo libre sin vender.
  const t = codigo6b("DistribuirCara");
  for (const pieza of ["{p.nombre}", "{pct(p.pb)} de la cara", "{textoDelEstado(p, nombreDe, p.choca)}", "{p.detalle}", "Libre · {pct(queda)} sin vender"]) {
    assert.ok(t.includes(pieza), `la lista de piezas no muestra ${pieza}`);
  }
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
  assert.match(F.problemaDeLosCampos("alta", { ...base, valor: "" }, hoy), /^Escribí el valor de cada mes del contrato/);
  assert.equal(F.problemaDeLosCampos("alta", { ...base, valor: "0" }, hoy), null, "un contrato de $ 0 es válido");
  const reserva = { ...base, tipo: "reserva", valor: "" };
  assert.equal(F.problemaDeLosCampos("alta", reserva, hoy), null);
  assert.equal(F.problemaDeLosCampos("alta", { ...reserva, caduca: "2027-01-05" }, hoy), "La reserva tiene que caducar entre hoy y el último día que reserva.");
  assert.equal(F.problemaDeLosCampos("alta", { ...reserva, caduca: "2026-10-16" }, hoy), "La reserva tiene que caducar entre hoy y el último día que reserva.");
  assert.equal(F.problemaDeLosCampos("alta", { ...reserva, desde: "2026-09-01", hasta: "2026-10-01", caduca: "2026-10-01" }, hoy),
    "Una reserva provisional tiene que terminar hoy o después.");
  // Renovar no pide proveedor (es el de la participación); confirmar pide el valor.
  assert.equal(F.problemaDeLosCampos("renovar", { ...base, proveedor: "" }, hoy), null);
  assert.match(F.problemaDeLosCampos("confirmar", { ...reserva, valor: "" }, hoy), /^Escribí el valor de cada mes/);
  assert.equal(F.valorDeTexto("900.000"), 900000);
  assert.equal(F.valorDeTexto("$ 1.250.000"), 1250000);
  assert.equal(F.valorDeTexto("900000,5"), 900000.5);
  assert.equal(F.valorDeTexto("abc"), null);
  assert.equal(F.valorDeTexto("-5"), null);
});

// fase 2 · I6 — G3: la caducidad de una reserva provisional la elige quien
// opera (decisión de la dueña, 2026-10-18: «hasta una fecha límite elegida por
// quien esté manejando el sistema»). Sin tope fijo —el servidor ya exige
// `hoy ≤ caduca ≤ hasta`— y sin un valor propuesto: antes el formulario
// precargaba «hoy + 7» y la decidía por él.
await prueba("la caducidad de una reserva la elige quien opera: el formulario no la propone en ningún modo y sin ella no se guarda (ejecutado)", () => {
  const F = P6.FORM;
  const hoy = "2026-10-17";
  const ELEGI = "Elegí hasta cuándo se sostiene la reserva.";
  const RANGO = "La reserva tiene que caducar entre hoy y el último día que reserva.";
  const reserva = { tipo: "reserva", proveedor: "Postobón", correo: "", marca: "", porcentaje: "25", desde: "2026-10-17", hasta: "2026-12-31",
    caduca: "", valor: "", notas: "" };
  // Sin elegir, frena con su frase, en todos los modos que dejan una reserva.
  assert.equal(F.problemaDeLosCampos("alta", reserva, hoy), ELEGI);
  assert.equal(F.problemaDeLosCampos("cargarDeNuevo", reserva, hoy), ELEGI);
  assert.equal(F.problemaDeLosCampos("renovar", reserva, hoy), ELEGI);
  assert.equal(F.problemaDeLosCampos("editar", { ...reserva, tipo: "contrato" }, hoy), ELEGI, "cambiar una reserva siempre deja una reserva");
  // La vista previa dice lo mismo, y por eso «Guardar» queda frenado.
  const v = F.vistaPrevia("alta", reserva, caraOut(), null, null, "A");
  assert.equal(v.problema, ELEGI);
  assert.equal(F.fraseDeLaVistaPrevia(v), ELEGI);
  // Un contrato no tiene caducidad: vacía no frena.
  assert.equal(F.problemaDeLosCampos("alta", { ...reserva, tipo: "contrato", valor: "900.000" }, hoy), null, "un contrato con `caduca: \"\"` se frenó");
  assert.equal(F.problemaDeLosCampos("confirmar", { ...reserva, valor: "900.000" }, hoy), null);
  // Elegida, entra: sin tope fijo, hasta el último día que reserva. Las frases de rango no cambian.
  assert.equal(F.problemaDeLosCampos("alta", { ...reserva, caduca: hoy }, hoy), null);
  assert.equal(F.problemaDeLosCampos("alta", { ...reserva, caduca: "2026-12-31" }, hoy), null, "se le puso un tope que la dueña no pidió");
  assert.equal(F.problemaDeLosCampos("alta", { ...reserva, caduca: "2027-01-01" }, hoy), RANGO);
  assert.equal(F.problemaDeLosCampos("alta", { ...reserva, caduca: "2026-10-16" }, hoy), RANGO);
  // Ningún modo la trae escrita: ni el alta, ni «Cargar de nuevo», ni renovar,
  // ni cambiar una reserva que no tenía (la que ya tenía, ésa).
  assert.equal(F.camposIniciales("alta", null, null, hoy).caduca, "");
  const vieja = pOut([tOut({ estado: "contrato", desde: "2026-01-01", hasta: "2026-06-30" })]);
  for (const modo of ["cargarDeNuevo", "renovar", "confirmar"]) {
    assert.equal(F.camposIniciales(modo, vieja.terminos[0], vieja, hoy).caduca, "", `«${modo}» propone una caducidad`);
  }
  const res = pOut([tOut({ estado: "reserva", estado_visible: "reserva", lease_id: null, valor_mensual: null, caduca: "2026-10-25", desde: "2026-10-17", hasta: "2026-12-31" })]);
  assert.equal(F.camposIniciales("editar", res.terminos[0], res, hoy).caduca, "2026-10-25", "cambiar una reserva perdió la caducidad que tenía");
  const sinCaduca = pOut([tOut({ estado: "reserva", estado_visible: "reserva", lease_id: null, valor_mensual: null, caduca: null, desde: "2026-10-17", hasta: "2026-12-31" })]);
  assert.equal(F.camposIniciales("editar", sinCaduca.terminos[0], sinCaduca, hoy).caduca, "");
  // En la fuente: ninguna caducidad calculada, y el campo con su rango.
  const form = codigo6b("FormularioDeParticipacion");
  assert.doesNotMatch(form, /caduca: sumarDias\(/, "el formulario volvió a proponer la caducidad");
  assert.doesNotMatch(form, /caduca \?\? sumarDias\(/);
  assert.match(form, /<input id="part-caduca" type="date" className=\{CAMPO\} value=\{c\.caduca\} min=\{hoy\} max=\{c\.hasta \|\| undefined\}/,
    "el campo de la caducidad no ofrece sólo entre hoy y el último día que reserva");
  assert.match(form, /if \(!c\.caduca\) return "Elegí hasta cuándo se sostiene la reserva\.";/);
});

// ── Verificación del paso 6b ─────────────────────────────────────────────────

await prueba("teclado (verificación 6b, con piezas): desde la LISTA sólo deshacer, rehacer y Esc; en la cara, Supr saca la pieza, Retroceso saca el último punto y Enter cierra la forma «A mano» como LA pieza; las flechas nunca corren una pieza", () => {
  // Desde la lista (el foco en una pieza): deshacer anda; nada elige herramienta ni toca el imán.
  enElModo({ seleccion: null });
  for (const k of ["r", "p", "v", "g"]) {
    const ev = atajo(tecla(k, EN_BOTON_DEL_PANEL));
    assert.equal(P6.useDistribucionStore.getState().edicion.herramienta, "seleccionar", `«${k}» desde la lista eligió una herramienta`);
    assert.equal(P6.useDistribucionStore.getState().edicion.iman, true, `«${k}» desde la lista tocó el imán`);
    if (k === "r") assert.ok(ev.cortada, "R desde la lista llegó al atajo global (gira el mueble)");
    else assert.ok(!ev.cortada, `«${k}» desde la lista no le llegó a su botón`);
  }
  // Lo que saca o mueve una pieza, no: con una elegida, las flechas y Supr en un botón no la tocan.
  enElModo();
  const antes = JSON.stringify(P6.useDistribucionStore.getState().edicion.zonas);
  let ev = atajo(tecla("ArrowLeft", EN_BOTON_DEL_PANEL));
  assert.ok(!ev.cortada, "la flecha en un botón de la lista no le llegó al botón");
  atajo(tecla("Delete", EN_BOTON_DEL_PANEL));
  assert.equal(JSON.stringify(P6.useDistribucionStore.getState().edicion.zonas), antes, "una tecla en la lista movió o sacó una pieza");
  // Y en la cara las flechas tampoco corren la pieza elegida (dejaría de dar su % exacto).
  for (const k of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]) {
    atajo(tecla(k, EN_LIENZO));
    atajo(tecla(k, EN_LIENZO, { shiftKey: true }));
  }
  assert.equal(JSON.stringify(P6.useDistribucionStore.getState().edicion.zonas), antes, "una flecha en la cara corrió una pieza");
  // «A mano» en la cara: Retroceso saca el último punto; Enter cierra la forma y REEMPLAZA lo que tenía esa marca.
  enElModo({ herramienta: "poligono", activa: 7, trazo: [[0.1, 0.6], [0.3, 0.6], [0.3, 0.9], [0.2, 0.95]], seleccion: null });
  atajo(tecla("Backspace", EN_LIENZO));
  assert.equal(P6.useDistribucionStore.getState().edicion.trazo.length, 3, "Retroceso no sacó el último punto");
  ev = atajo(tecla("Enter", EN_LIENZO));
  assert.ok(ev.cortada && ev.prevenida);
  const ed = P6.useDistribucionStore.getState().edicion;
  assert.equal(ed.trazo, null, "Enter no cerró la forma");
  assert.deepEqual(ed.zonas.filter((z) => z.participacionSpaceId === 7).map((z) => z.vertices), [[[0.1, 0.6], [0.3, 0.6], [0.3, 0.9]]],
    "Enter agregó una forma más en vez de dejarla como LA pieza de la marca");
  assert.ok(ed.zonas.some((z) => z.participacionSpaceId === 8), "Enter tocó la pieza de otra marca");
  // Enter en un botón de la lista es del botón, aunque haya una forma a medias.
  enElModo({ herramienta: "poligono", activa: 7, trazo: [[0.1, 0.1], [0.2, 0.1], [0.2, 0.3]], seleccion: null });
  ev = atajo(tecla("Enter", EN_BOTON_DEL_PANEL));
  assert.ok(!ev.cortada && P6.useDistribucionStore.getState().edicion.trazo, "Enter en un botón de la lista cerró la forma de la cara");
  // Sin acción, en la cara, las teclas del atajo global se cortan Y se frenan (Retroceso no navega).
  enElModo({ seleccion: null });
  ev = atajo(tecla("Backspace", EN_LIENZO));
  assert.ok(ev.cortada && ev.prevenida, "Retroceso sin nada elegido, en la cara, no se frenó");
  // Afuera de la pantalla (la barra del editor) nada se despacha.
  enElModo();
  atajo(tecla("Delete", AFUERA));
  assert.deepEqual(claves(), ["z1", "z2"], "Supr afuera de la pantalla sacó una pieza");
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
  const panel = codigo6b("DistribuirCara");
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

await prueba("pantalla (verificación 6b, con piezas): lo que sólo se ve en pantalla, fijado — una pieza choca sólo con fechas cruzadas, la reserva punteada, edición frenada con el plano sin guardar, «Listo» frenado con errores, beforeunload, revisión congelada en el arrastre", () => {
  // Sin DOM no se puede mirar el dibujo: se fija el código que lo decide.
  const cara = codigo6b("CaraDePiezas"), panel = codigo6b("DistribuirCara"), ley = codigo6b("LeyendaDeParticipaciones"), form = codigo6b("FormularioDeParticipacion");
  const piezas = sinComentTs2(fuente(`${DIST}/piezasDeLaCara.ts`));
  assert.match(piezas, /\.filter\(\(p\) => p\.spaceId !== spaceId && p\.poligonos\.length > 0 && seCruzanEnFechas\(yo\.terminos, p\.terminos, hoy\)\)/,
    "una pieza choca con otra aunque sus fechas no se crucen (§3.6)");
  assert.match(cara, /strokeDasharray=\{o\.fantasma \|\| p\.esReserva \|\| futura \? /, "la reserva provisional (o la que todavía no rige) no va punteada");
  assert.match(cara, /\{!futura && <path d=\{relleno\(P\)\} fill=\{tono\}/, "la que todavía no rige se pinta llena (tapa a la de ahora)");
  assert.match(panel, /const editable = !!datos\?\.por_participacion && !!datos\.superficie && alDia;/, "se edita con el plano sin guardar (§9.2: la firma tiene que coincidir)");
  assert.match(cara, /const puedeEditar = [^;]*alDia[^;]*edicion\.modo === "editar";/, "la cara edita con el plano sin guardar");
  assert.match(panel, /const bloqueado = errores\.length > 0 \|\| !enLosTopes \|\| !alDia \|\| motivoDeListo !== null;/, "«Listo» no se frena con errores, fuera de los topes o con el plano sin guardar");
  assert.match(panel, /disabled=\{bloqueado\} onClick=\{listo\} data-listo/, "el botón «Listo» no mira `bloqueado`");
  assert.match(panel, /window\.addEventListener\("beforeunload", (\w+)\)[\s\S]{0,80}window\.removeEventListener\("beforeunload", \1\)/, "cerrar la pestaña con cambios sin guardar no pregunta (§9.8)");
  assert.match(ley, /s\.edicion\.arrastre \? s\.edicion\.arrastre\.antes : s\.edicion\.zonas/, "la revisión en vivo se recalcula en cada movimiento del arrastre (§9.4: al soltar)");
  assert.match(panel, /const renovable = masNuevo && masNuevo\.estado === "contrato" \? masNuevo : null;/, "«Renovar» se ofrece en una reserva (§4.7: sólo el contrato vivo más nuevo)");
  assert.match(form, /const excluir = \(modo === "editar" \|\| modo === "confirmar"\) && termino \? termino\.id : null;/,
    "la vista previa de cambiar o confirmar una reserva la cuenta dos veces (a ella misma)");
  // Soltar encima de otra marca: queda marcada en rojo y NO se ubica.
  const i = panel.indexOf("const soltar = (spaceId: number, rect: Rect | null, pisa: number | null) => {");
  assert.ok(i >= 0, "no está `soltar`");
  const cuerpo = panel.slice(i, panel.indexOf("\n  };", i));
  const choca = cuerpo.indexOf("if (pisa !== null) {"), pone = cuerpo.indexOf('tipo: "ponerPiezas"');
  assert.ok(choca >= 0 && pone > choca && cuerpo.slice(choca, pone).includes("return;"), "soltar encima de otra marca la ubica igual");
  assert.match(cuerpo, /ui\(\)\.decir\(`Ahí ya está \$\{nombreDe\(pisa\)\}: soltala en lo verde\.`\);/);
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

// ═══════════════════════════════════════════════════════════════════════════
// INTEGRACIÓN · lo que los pasos dejaron anotado para «otro dueño»
// ═══════════════════════════════════════════════════════════════════════════
//
// Los datos de la zona elegida también en «Editar» (pedido §12), Esc en un
// campo del formulario que no pierde lo escrito, «Descartar borrador» que avisa
// lo que se pierde en pantalla, la fila de la leyenda sin un botón adentro de
// otro (verificación del paso 6b), y «Borrar sede» / el renombre que nombran
// las reservas provisionales que se cancelan (pasos 4a y 4c).

console.log("distribución · pendientes de la integración");

const rI = await build({
  entryPoints: [join(raiz, "src", "utils", "impactoDeSede.ts")],
  bundle: true, write: false, format: "esm", platform: "neutral", logLevel: "silent",
});
const IMP = await import("data:text/javascript;base64," + Buffer.from(rI.outputFiles[0].text).toString("base64"));

await prueba("cada pieza dice su marca (sin número), su %, su estado en palabras y su contrato (ejecutado con `piezasDe`)", () => {
  const Z = P6.PZC;
  const sup = { ancho: 1.8, alto: 1.8, orientacion: "frente", plano: 0.46, giro_x: 0, area_util_m2: 3,
    exclusiones: [{ por: "zocalo", u0: 0, u1: 1, v0: 0, v1: 0.066667 }, { por: "remate", u0: 0, u1: 1, v0: 0.944444, v1: 1 }] };
  const aseo = pOut([tOut({ id: 1, space_id: 62, numero: 4, puntos_basicos: 5000, proveedor: { id: 3, nombre: "Aseo Total" }, marca: "Marca 2", desde: "2026-10-01", hasta: "2027-03-31" })]);
  const cafe = pOut([tOut({ id: 2, space_id: 63, numero: 5, puntos_basicos: 3000, proveedor: { id: 9, nombre: "Café Montaña" }, marca: "Café A", desde: "2026-10-23", hasta: "2027-03-31" })]);
  const datos = { hoy: "2026-10-24", superficie: sup, participaciones: [aseo, cafe], capacidad: { periodo: { desde: "2026-10-24", hasta: "2027-10-23" }, fisicos: [] }, distribucion: null };
  const mitad = { clave: "z1", participacionSpaceId: 62, vertices: [[0, 0], [0.5, 0], [0.5, 1], [0, 1]] };
  const rev = P6.LEY.revisionEnVivo([mitad], datos);
  const ps = Z.piezasDe(datos, [mitad], rev, {});
  assert.deepEqual(ps.map((p) => [p.nombre, p.corto, p.pb, p.estado, p.forma]), [
    ["Aseo Total · Marca 2", "Marca 2", 5000, "ubicada", "franja"],
    ["Café Montaña · Café A", "Café A", 3000, "sin_ubicar", "franja"],
  ]);
  assert.equal(ps[0].detalle, "Contrato vigente · del 1 oct 2026 al 31 mar 2027");
  const nombre = (s) => ps.find((p) => p.spaceId === s)?.corto ?? "?";
  assert.deepEqual(ps.map((p) => Z.textoDelEstado(p, nombre, p.choca)), ["Ubicada", "Arrastrala a la cara"]);
  for (const p of ps) assert.ok(!/\b4\b|\b5\b|participaci/i.test(`${p.nombre} ${p.corto} ${Z.textoDelEstado(p, nombre, p.choca)}`), `una pieza dice el número interno: ${p.nombre}`);
  // Una pieza encima de la otra (fechas que se cruzan): «Pisa a Marca 2», y no está ubicada.
  const encima = { clave: "n1", participacionSpaceId: 63, vertices: [[0.3, 0], [0.6, 0], [0.6, 1], [0.3, 1]] };
  const ps2 = Z.piezasDe(datos, [mitad, encima], P6.LEY.revisionEnVivo([mitad, encima], datos), {});
  assert.equal(ps2[1].estado, "choca");
  assert.equal(Z.textoDelEstado(ps2[1], nombre, ps2[1].choca), "Pisa a Marca 2");
  // Pasada o corta: lo dice con el %.
  assert.equal(Z.textoDelEstado({ estado: "sobra", pb: 3000, dibujado: 3086, forma: "a_mano" }, nombre, null), "Sobra 0,86 %");
  assert.equal(Z.textoDelEstado({ estado: "falta", pb: 3000, dibujado: 2000, forma: "franja" }, nombre, null), "Le falta 10 %");
  // Con fechas que NO se cruzan, lo de la otra no la bloquea.
  const despues = pOut([tOut({ id: 3, space_id: 64, numero: 6, puntos_basicos: 3000, proveedor: { id: 9, nombre: "Café Montaña" }, marca: "Café B", desde: "2027-04-01", hasta: "2027-06-30" })]);
  const d3 = { ...datos, participaciones: [aseo, despues] };
  const ps3 = Z.piezasDe(d3, [mitad], P6.LEY.revisionEnVivo([mitad], d3), {});
  assert.deepEqual(Z.ocupadosPara(64, ps3, "2026-10-24"), [], "una marca de otras fechas bloquea el lugar");
  assert.deepEqual(Z.ocupadosPara(63, Z.piezasDe(datos, [mitad], rev, {}), "2026-10-24").map((o) => o.spaceId), [62]);
});


await prueba("formulario: Esc con algo escrito pregunta y no cierra (tampoco desde un campo); sin nada escrito cierra; la pregunta se va con Esc (ejecutado)", () => {
  const q = P6.FORM.queHaceEsc;
  assert.equal(q({ sucio: false, preguntando: false, enviando: false }), "cerrar");
  assert.equal(q({ sucio: true, preguntando: false, enviando: false }), "preguntar", "Esc con lo escrito cierra el formulario y se pierde");
  assert.equal(q({ sucio: true, preguntando: true, enviando: false }), "seguir");
  assert.equal(q({ sucio: true, preguntando: false, enviando: true }), "nada", "Esc mientras se guarda cierra el formulario");
  // El diálogo de siempre usa `alEscape` si se lo dan (el Esc de un campo
  // llega al diálogo: el oyente del panel deja pasar las teclas de los campos).
  const ley = codigo6b("LeyendaDeParticipaciones");
  assert.match(ley, /if \(e\.key === "Escape"\) \{ e\.preventDefault\(\); \(alEscape \?\? onCerrar\)\(\); \}/);
  const form = codigo6b("FormularioDeParticipacion");
  const i = form.indexOf('<Dialogo titulo={titulo} onCerrar={cerrar} cerrarAfuera={false} ancho="max-w-md"');
  assert.ok(i >= 0, "el formulario dejó de ser un diálogo que no se cierra con un clic afuera");
  assert.match(form.slice(i, i + 400), /alEscape=\{\(\) => \{\s*const q = queHaceEsc\(\{ sucio, preguntando: preguntaCerrar, enviando \}\);/,
    "el formulario no le dice al diálogo qué hacer con Esc");
  assert.match(form, /const sucio = \(Object\.keys\(inicial\) as \(keyof Campos\)\[\]\)\.some\(\(k\) => c\[k\] !== inicial\[k\]\);/);
  assert.match(form, /Cerrar sin guardar/);
  // Un campo del formulario: el oyente en captura no corta su Esc (llega al diálogo).
  enElModo();
  assert.ok(!atajo(tecla("Escape", EN_CAMPO)).cortada);
});

await prueba("«Descartar borrador» dice que también se pierde lo que no se guardó en pantalla (ejecutado)", () => {
  const T = P6.PANEL.textoDeDescartarBorrador;
  assert.deepEqual(T({ cara: "A", hayConfirmada: true, sucio: false }), [
    "Se borra el borrador guardado de la cara A y vuelve a verse la que estaba guardada como lista. Queda anotado en el historial."]);
  const con = T({ cara: "B", hayConfirmada: false, sucio: true });
  assert.equal(con.length, 2, "con cambios sin guardar, el diálogo no avisa que se pierden");
  assert.equal(con[1], "También se pierden los cambios que hiciste en pantalla y todavía no guardaste.");
  const panel = codigo6b("DistribuirCara");
  assert.match(panel, /textoDeDescartarBorrador\(\{ cara: activa\.cara, hayConfirmada: !!datos\?\.distribucion\?\.confirmada\.length, sucio \}\)/,
    "el diálogo no usa lo que se hizo en pantalla (`sucio`)");
  // Y descartar de verdad vuelve a cargar del servidor (por eso se pierde).
  assert.match(sinComentTs2(fuente("store/distribucionStore.ts")), /descartar: async \(\) => \{[\s\S]*?reducir\(s\.edicion, \{ tipo: "cargar"/);
});

await prueba("la pieza de la lista: dos botones hermanos (elegirla o arrastrarla, y su menú), ningún botón adentro de otro ni `role=\"button\"`", () => {
  const ley = codigo6b("DistribuirCara");
  assert.ok(!/role="button"/.test(ley), "la pieza es un role=\"button\" (con un <button> adentro)");
  const i = ley.indexOf("data-elegir-pieza");
  assert.ok(i >= 0, "no está el botón que elige la pieza");
  const abre = ley.lastIndexOf("<button", i);
  const cierra = ley.indexOf("</button>", i);
  const adentro = ley.slice(ley.indexOf(">", i) + 1, cierra);
  assert.ok(!/<button/.test(adentro), "hay un botón adentro del botón de la pieza");
  assert.ok(!/<(div|p)\b/.test(adentro), "un botón con <div> o <p> adentro (sólo va contenido en línea)");
  assert.match(ley.slice(abre, i + 400), /type="button"[\s\S]*aria-pressed=\{esElegida\}[\s\S]*data-elegir-pieza[\s\S]*onPointerDown=\{\(e\) => \{ arrastrada\.current = false; empezarArrastre\(p, e\); \}\}/);
  assert.match(ley.slice(cierra, cierra + 400), /<button[\s\S]{0,80}aria-label=\{`Más de \$\{p\.nombre\}`\}/, "el menú no es el botón hermano que sigue");
});


await prueba("«Borrar sede» nombra las reservas provisionales que se cancelan; el renombre dice adónde van (ejecutado)", () => {
  assert.deepEqual(IMP.lineasDelImpacto({ spaces: 4, active_leases: 2, reservas_vivas: 3 }), [
    "2 contratos activos se cerrarán", "3 reservas provisionales de participación se cancelan"]);
  assert.deepEqual(IMP.lineasDelImpacto({ spaces: 4, active_leases: 1, reservas_vivas: 1 }), [
    "1 contrato activo se cerrará", "1 reserva provisional de participación se cancela"]);
  assert.deepEqual(IMP.lineasDelImpacto({ spaces: 4, active_leases: 0, reservas_vivas: 0 }), []);
  assert.deepEqual(IMP.lineasDelImpacto({ spaces: 4, active_leases: 0 }), [], "un servidor viejo sin `reservas_vivas`");
  // El renombre: sin nada comercial, sin pregunta; con algo, lo dice; sin saberlo, avisa igual.
  // fase 2 · I5: el renombre ya no borra la sede (era «borrar + crear»): el
  // aviso dice adónde va lo vendido, nunca que se pierde. Las guardas que
  // exigen que no se pierda nada están en el bloque «fase 2 · I5» de abajo.
  assert.equal(IMP.avisoDelRenombre("NAVE", "NAVE NORTE", { spaces: 3, active_leases: 0, reservas_vivas: 0 }), null);
  assert.equal(IMP.avisoDelRenombre("NAVE", "NAVE NORTE", { spaces: 3, active_leases: 0, reservas_vivas: 2 }),
    "Las 2 reservas provisionales de participación de «NAVE» pasan a «NAVE NORTE». Los enlaces de montaje enviados desde el 2 de octubre siguen andando; los anteriores hay que volver a mandarlos.");
  assert.equal(IMP.avisoDelRenombre("NAVE", "X", null),
    "Los contratos y las reservas provisionales de participación de «NAVE», si tiene, pasan a «X». Los enlaces de montaje enviados desde el 2 de octubre siguen andando; los anteriores hay que volver a mandarlos.");
  // El tipo del cliente lleva el dato del servidor, y el diálogo lo muestra.
  assert.match(fuente("api/layout.ts"), /export interface DeleteImpact \{[^}]*reservas_vivas: number;/);
  const plano = sinComentTs2(fuente("components/FloorPlan2D/FloorPlan2D.tsx"));
  assert.match(plano, /\{lineasDelImpacto\(impact\)\.map\(\(linea\) => \(/, "«Borrar sede» no muestra lo que cuenta el servidor");
  assert.ok(!/impact\.active_leases\} contrato/.test(plano), "quedó la línea vieja que sólo contaba contratos");
  // El renombre pregunta ANTES de borrar: lee el impacto y sólo sin aviso renombra directo.
  const i = plano.indexOf("async function pedirRenombre(");
  assert.ok(i >= 0, "no está pedirRenombre");
  const cuerpo = plano.slice(i, plano.indexOf("\n  }\n", i));
  const orden = ["fetchDeleteImpact(viejo)", "avisoDelRenombre(viejo, nuevo, impacto)", "if (aviso) { setRenombreEnEspera(", "renameSede(viejo, nuevo);"];
  let desde = 0;
  for (const paso of orden) {
    const k = cuerpo.indexOf(paso, desde);
    assert.ok(k >= 0, `el renombre no hace «${paso}» (o no en ese orden)`);
    desde = k + paso.length;
  }
  // El campo ya no renombra por su cuenta: Enter y el blur pasan por pedirRenombre.
  assert.equal((plano.match(/renameSede\(sede, n\)/g) || []).length, 0, "el campo de la sede renombra sin avisar");
  assert.equal((plano.match(/void pedirRenombre\(normalizeSede\(editingSedeVal\)\)/g) || []).length, 2);
  assert.match(plano, /<RenombrarSedeDialog[\s\S]{0,300}renameSede\(de, a\);/, "«Renombrar igual» no renombra");
});

// fase 2 · I5 — Renombrar una sede ya no la borra. Era «borrar + crear»:
// `renameSede` movía la clave local y mandaba `deleteLayout` del nombre viejo,
// y el archivo de la sede cerraba los contratos, cancelaba las reservas de
// participación y archivaba los montajes. Ahora el renombre es del servidor
// (`POST /layout/{sede}/renombrar`, una transacción) y lo vendido sigue vivo.
// Estas guardas REEMPLAZAN a las que pedían el aviso «borra la sede y la
// vuelve a crear» (arriba) y son más estrictas: `renameSede` no puede llamar a
// `deleteLayout`, el renombre pasa por `renombrarSede` de `api/layout.ts`, y
// lo que se dice antes de renombrar no dice «borra», «se cancelan» ni «No se
// puede deshacer» con ningún impacto.
await prueba("fase 2 · I5: el renombre no borra la sede: sin `deleteLayout` en `renameSede`, por `renombrarSede` de api/, y nada dice que se pierde", () => {
  const store = sinComentTs2(fuente("store/fixtureStore.ts"));
  const i = store.indexOf("renameSede: async (oldName, rawNewName) => {");
  assert.ok(i >= 0, "renameSede dejó de ser async: el renombre volvió a ser local");
  const cuerpo = store.slice(i, store.indexOf("removeSede: async", i));
  assert.ok(cuerpo.length > 0 && !/deleteLayout/.test(cuerpo), "renameSede vuelve a borrar la sede en el servidor");
  assert.match(cuerpo, /servidorDeSedes\.renombrarSede\(oldName, newName, get\(\)\.serverRev\[oldName\] \?\? null\)/,
    "renameSede no le pide el renombre al servidor con la revisión que tiene");
  // Lo que pasa en el store después: sin borrar ni volver a subir nada.
  const k = store.indexOf("function sedeMudada(");
  assert.ok(k >= 0, "no está sedeMudada");
  const mudada = store.slice(k, store.indexOf("export const useFixtureStore", k));
  assert.ok(!/deleteLayout|scheduleSave\(|dirty\[newName\] = true/.test(mudada), "adoptar el renombre borra o vuelve a subir el plano");
  const api = sinComentTs2(fuente("api/layout.ts"));
  assert.match(api, /export const renombrarSede = \([\s\S]{0,200}?client\s*\.post\(`\/layout\/\$\{encodeURIComponent\(sede\)\}\/renombrar`, \{\s*nuevo,\s*base_updated_at: baseUpdatedAt \?\? null,\s*\}\)/,
    "renombrarSede no llama a POST /layout/{sede}/renombrar con el nombre nuevo y la revisión");
  // Lo que se dice antes: adónde va lo vendido, con cualquier impacto (también sin saberlo).
  for (const impacto of [null, { spaces: 3, active_leases: 2, reservas_vivas: 1 }, { spaces: 1, active_leases: 1, reservas_vivas: 0 },
    { spaces: 2, active_leases: 0, reservas_vivas: 3 }, { spaces: 2, active_leases: 4 }]) {
    const t = IMP.avisoDelRenombre("NAVE", "NAVE NORTE", impacto);
    assert.ok(typeof t === "string" && !/borra|se cancela|se cierra|cerrar|deshacer|vuelve a crear/i.test(t),
      `el aviso del renombre dice que se pierde algo: «${t}»`);
    assert.ok(t.endsWith(IMP.SIGUEN_LOS_ENLACES), `el aviso no dice que los enlaces de montaje siguen andando: «${t}»`);
  }
  assert.equal(IMP.avisoDelRenombre("NAVE", "NAVE NORTE", { spaces: 3, active_leases: 2, reservas_vivas: 1 }),
    "Los 2 contratos activos y la reserva provisional de participación de «NAVE» pasan a «NAVE NORTE». Los enlaces de montaje enviados desde el 2 de octubre siguen andando; los anteriores hay que volver a mandarlos.");
  assert.equal(IMP.avisoDelRenombre("NAVE", "NAVE NORTE", { spaces: 1, active_leases: 1, reservas_vivas: 0 }),
    "El contrato activo de «NAVE» pasa a «NAVE NORTE». Los enlaces de montaje enviados desde el 2 de octubre siguen andando; los anteriores hay que volver a mandarlos.");
  // «Borrar sede» sigue diciendo lo que se pierde: esa mitad no cambia.
  assert.deepEqual(IMP.lineasDelImpacto({ spaces: 4, active_leases: 2, reservas_vivas: 3 }), [
    "2 contratos activos se cerrarán", "3 reservas provisionales de participación se cancelan"]);
  // El diálogo del 2D: sin «borra», «se cancelan», «Renombrar igual» ni el botón rojo de peligro.
  const plano = sinComentTs2(fuente("components/FloorPlan2D/FloorPlan2D.tsx"));
  const a = plano.indexOf("function RenombrarSedeDialog("), b = plano.indexOf("function RenombreRechazadoDialog(");
  assert.ok(a >= 0 && b > a, "no están los dos diálogos del renombre");
  assert.ok(!/borra|se cancelan|Renombrar igual|deshacer|var\(--danger\)/.test(plano.slice(a, b)),
    "el diálogo del renombre todavía dice que se pierde algo");
  // Se espera al servidor; si se niega, se dice por qué con sus motivos y la sede queda como estaba.
  assert.equal((plano.match(/const hecho = await renameSede\((viejo, nuevo|de, a)\);\s*trasElRenombre\(/g) || []).length, 2,
    "un renombre que no espera la respuesta del servidor");
  assert.match(plano, /function trasElRenombre\(de: string, a: string, hecho: \{ ok: boolean; error\?: string; motivos\?: string\[\] \}\) \{\s*if \(hecho\.ok\) \{\s*setRenombreFallido\(null\);\s*setSede\(a\);\s*return;\s*\}/,
    "el lienzo cambia de sede aunque el servidor no haya renombrado");
  assert.match(plano, /\{renombreFallido && \(\s*<RenombreRechazadoDialog \{\.\.\.renombreFallido\} onCerrar=\{\(\) => setRenombreFallido\(null\)\} \/>/);
  assert.match(plano.slice(b, b + 4000), /\{motivos\.map\(\(m\) => <li key=\{m\}>\{m\}<\/li>\)\}/, "el rechazo no muestra sus motivos");
  // La «Sede» del panel del mueble es de sólo lectura (V16): el plano define la sede.
  // (Rediseño, PR 3: va con su candado en la línea «tipo · sede · pasillo» del
  // encabezado del panel B, y el aviso de la sede ajena justo debajo. La guarda
  // mira las dos piezas, y además que no quede otro lugar del panel que diga
  // la sede.)
  const panel = plano.slice(plano.indexOf("function AssignmentPanel("), plano.indexOf("function FilaDelPanel("));
  const iLinea = panel.indexOf("<span className=\"p2-linea\" data-linea-del-mueble>");
  const linea = panel.slice(iLinea, panel.indexOf("</span>\n", panel.indexOf("{pasillo !== undefined", iLinea)));
  const iAjena = panel.indexOf("{item.sede && normalizeSede(item.sede) !== normalizeSede(sede) && (");
  const sede = linea + panel.slice(iAjena, panel.indexOf("</p>", iAjena));
  assert.ok(iLinea > 0 && iAjena > iLinea && linea.length > 0, "no está la sede en la línea del encabezado, o su aviso");
  // Lo único que puede escribir es la sede DEL PLANO (`onUpdate({ sede })`, el
  // arreglo de un mueble viejo que guardó otra), sólo en edición y para quien
  // administra, y diciendo antes que lo vendido con el código viejo no se muda.
  assert.ok(sede.length > 0 && !/<select|<input/.test(sede), "la «Sede» del panel 2D vuelve a tener un selector");
  assert.ok(!/<select/.test(panel), "el panel 2D tiene un selector (la sede, o el estado de antes)");
  assert.deepEqual(sede.match(/onUpdate\([^)]*\)/g) ?? [], ["onUpdate({ sede })"],
    "la «Sede» del panel 2D le escribe al mueble otra cosa que la sede del plano");
  assert.match(sede, /\{editMode && isAdmin && \(\s*<button type="button" data-usar-sede-del-plano onClick=\{\(\) => onUpdate\(\{ sede \}\)\}/);
  assert.match(sede, /sus espacios se arman como\s+«\{fullCode\}»[\s\S]{0,80}no se muda solo/,
    "el aviso de la sede ajena vuelve a decir que vale la del plano (los espacios se arman con la suya)");
  assert.ok(!/vale «\{sede\}»/.test(sede), "el aviso de la sede ajena promete que vale la del plano");
  assert.match(linea, /<span className="mono" data-sede-del-plano[^>]*>\{sede\}<\/span>\s*<Lock /, "la sede del encabezado no lleva su candado");
  assert.equal((panel.match(/data-sede-del-plano/g) ?? []).length, 1, "la sede se dice en más de un lugar del panel");
});

await prueba("fase 2 · I5: renombrar una sede es UN pedido al servidor —ningún DELETE—; se adopta lo que contesta y, si se niega, no cambia nada (ejecutado)", async () => {
  const st = () => S.useFixtureStore.getState();
  const REV = "2026-10-17T15:00:00+00:00", REV2 = "2026-10-17T15:05:00+00:00", AJUSTES2 = "2026-10-17T15:05:00.500000+00:00";
  const plano = [{ id: "f-1", code: "GON-01", sede: "NAVE", type: "gondola", gondolaType: "double", cx: 2, cz: 2, rotY: 0, w: 0.9, d: 0.9, h: 1.8 }];
  const antes = {
    sedes: S.useFixtureStore.getState().sedes, sede: st().sede, fixturesBySede: st().fixturesBySede, serverRev: st().serverRev,
    dirty: st().dirty, conflicts: st().conflicts, rechazos: st().rechazos, settingsRev: st().settingsRev, referenceRates: st().referenceRates,
  };
  S.useAuthStore.getState().setAuth("t-sede", "admin", "galerias");
  S.useFixtureStore.setState({
    sedes: ["NAVE", "SUR"], sede: "NAVE", fixturesBySede: { NAVE: plano, SUR: [] }, serverRev: { NAVE: REV, SUR: REV },
    dirty: {}, conflicts: {}, rechazos: {}, settingsRev: "s1", referenceRates: { default: {}, by_sede: { NAVE: { gondola: 900000 } } },
  });
  try {
    // 1 · El servidor renombra: un POST con el nombre nuevo y la revisión, ningún DELETE.
    servidor.pedidos = [];
    servidor.responder = async (cfg) => (cfg.method === "post" && cfg.url === "/layout/NAVE/renombrar"
      ? { sede: "NAVE NORTE", fixtures: plano.map((f) => ({ ...f, sede: "NAVE NORTE" })), updated_at: REV2,
          settings_updated_at: AJUSTES2, espacios: 3, contratos: 1, montajes: 0, avisos: [] }
      : {});
    assert.deepEqual(await st().renameSede("NAVE", " nave norte "), { ok: true });
    await esperar(5); // el `refrescarComercial` que sale después
    assert.deepEqual(servidor.pedidos.filter((p) => p.method === "delete"), [], "el renombre borró la sede en el servidor");
    const posts = servidor.pedidos.filter((p) => p.method === "post");
    assert.deepEqual(posts.map((p) => [p.url, p.data]), [["/layout/NAVE/renombrar", { nuevo: "NAVE NORTE", base_updated_at: REV }]]);
    assert.deepEqual(st().sedes, ["NAVE NORTE", "SUR"]);
    assert.equal(st().sede, "NAVE NORTE");
    assert.ok(!("NAVE" in st().fixturesBySede) && !("NAVE" in st().serverRev), "quedó la sede vieja en el store");
    assert.deepEqual(st().fixturesBySede["NAVE NORTE"].map((f) => [f.code, f.sede]), [["GON-01", "NAVE NORTE"]]);
    assert.equal(st().serverRev["NAVE NORTE"], REV2, "no adoptó la revisión que contestó el servidor");
    assert.equal(st().settingsRev, AJUSTES2, "no adoptó la revisión nueva de la lista de sedes");
    assert.ok(!st().dirty["NAVE NORTE"], "el plano renombrado quedó para volver a subir");
    assert.deepEqual(st().referenceRates.by_sede, { "NAVE NORTE": { gondola: 900000 } }, "las tarifas quedaron con el nombre viejo");

    // 2 · El servidor se niega: nada cambia, ni acá ni allá, y se dice por qué.
    const MOTIVO = "«SUR NORTE-GON-01» ya es el código del espacio #9, que no es de «NAVE NORTE»: archivalo o cambiale el código antes de renombrar.";
    servidor.pedidos = [];
    servidor.responder = async (cfg) => {
      if (cfg.method === "post" && cfg.url.endsWith("/renombrar")) {
        throw rechazo(409, { detail: { code: "renombre_bloqueado", message: "No se puede renombrar «NAVE NORTE» a «SUR NORTE» sin romper algo.", motivos: [MOTIVO] } });
      }
      return {};
    };
    const foto = () => JSON.stringify([st().sedes, st().sede, st().fixturesBySede, st().serverRev, st().settingsRev, st().referenceRates]);
    const quieto = foto();
    const r = await st().renameSede("NAVE NORTE", "sur norte");
    assert.deepEqual(r, { ok: false, error: "No se puede renombrar «NAVE NORTE» a «SUR NORTE» sin romper algo.", motivos: [MOTIVO] });
    assert.equal(foto(), quieto, "un renombre rechazado cambió el store");
    assert.deepEqual(servidor.pedidos.filter((p) => p.method === "delete"), []);
    assert.ok(servidor.pedidos.some((p) => p.method === "post" && p.url === "/layout/NAVE%20NORTE/renombrar"), "no le pidió el renombre al servidor");

    // 3 · Un nombre que ya existe ni se pregunta; con cambios sin guardar, tampoco.
    servidor.pedidos = [];
    assert.deepEqual(await st().renameSede("NAVE NORTE", "sur"), { ok: false, error: "Ya hay una sede «SUR»: elegí otro nombre." });
    S.useFixtureStore.setState({ conflicts: { "NAVE NORTE": true } });
    const conCambios = await st().renameSede("NAVE NORTE", "OESTE");
    assert.equal(conCambios.ok, false);
    assert.match(conCambios.error, /tiene cambios que el servidor todavía no guardó/);
    S.useFixtureStore.setState({ conflicts: {} });
    assert.deepEqual(servidor.pedidos.filter((p) => p.url.endsWith("/renombrar")), [], "pidió el renombre con cambios sin guardar");
    assert.equal(foto(), quieto);

    // 4 · Sin permiso de escritura no hay servidor que renombre: sólo acá, y sin pedidos.
    S.useAuthStore.getState().setAuth("t-sede-w", "worker", "galerias");
    servidor.pedidos = [];
    assert.deepEqual(await st().renameSede("NAVE NORTE", "OESTE"), { ok: true });
    assert.deepEqual(servidor.pedidos.filter((p) => p.method !== "get"), [], "una sesión que no escribe le pidió algo al servidor");
    assert.deepEqual(st().sedes, ["OESTE", "SUR"]);
    assert.deepEqual(st().fixturesBySede.OESTE.map((f) => f.sede), ["OESTE"]);
  } finally {
    S.useAuthStore.getState().setAuth("t-sede", "admin", "galerias");
    S.useFixtureStore.setState(antes);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// REVISIÓN FINAL · el Editor 3D y el modo Distribución
// ═══════════════════════════════════════════════════════════════════════════
//
// Lo que dejaron la revisión final y el recorrido (50-hallazgos-finales):
// «Descartarlos» en «Mirar» guardaba como borrador lo que se pidió tirar; un
// 401 con el autoguardado frenado por un 409 perdía todo lo dibujado desde el
// 409; el encabezado no decía la sede; y el historial fechaba la caducidad y
// el vencimiento un día antes en hora de Colombia (contrato del historial con
// el servidor: las derivadas traen `derivado` y `dia`, y `en` es la
// medianoche de Colombia con su zona). Se CORRE con los stores de verdad y un
// servidor de prueba, y el historial con TZ=America/Bogota.

console.log("distribución · el Editor 3D y el modo, tras la revisión final");

await prueba("«Descartarlos» con la edición en «Mirar» (al salir y al cambiar de cara) no escribe ningún borrador: se descarta en cualquier modo", async () => {
  D().reiniciar();
  S.useAuthStore.getState().setAuth("t-desc-mirar", "admin", "galerias");
  for (const como of ["salir", "cambiarCara"]) {
    await entrarA(caraOut({ distribucion: distribucion(4, [zo(1, 812, cuadradoZ(0.1, 0.1, 0.3, 0.3))]) }));
    D().despachar({ tipo: "elegirModo", modo: "editar" });     // el modo sobrevive a la salida anterior
    dibujar(813, 0.5, 0.5, 0.7, 0.7);
    D().despachar({ tipo: "elegirModo", modo: "mirar" });
    assert.equal(D().edicion.modo, "mirar");
    assert.equal(D().edicion.sucio, true);
    // El camino de antes: en «Mirar» el reductor no descarta nada.
    D().despachar({ tipo: "descartarCambios" });
    assert.equal(D().edicion.sucio, true);
    servidor.pedidos = [];
    const ok = como === "salir" ? await D().salir({ descartar: true }) : await D().cambiarCara("B", { descartar: true });
    assert.equal(ok, true, `${como}: no siguió`);
    assert.deepEqual(servidor.pedidos.filter((p) => p.url !== "/participaciones/cara").map((p) => p.url), [],
      `${como}: guardó como borrador lo que se pidió descartar`);
    if (como === "salir") assert.equal(D().activa, null);
    else {
      assert.equal(D().activa.cara, "B");
      assert.equal(D().edicion.sucio, false);
      assert.equal(D().edicion.modo, "mirar", "descartar cambió el modo");
      await D().salir();
    }
  }
  // Sin «descartar», la red de siempre (§9.8): salir con cambios guarda el borrador.
  await entrarA(caraOut({ distribucion: distribucion(4, []) }));
  D().despachar({ tipo: "elegirModo", modo: "editar" });
  dibujar(813, 0.5, 0.5, 0.7, 0.7);
  D().despachar({ tipo: "elegirModo", modo: "mirar" });
  servidor.pedidos = [];
  servidor.responder = async (cfg) => ({ version: 5, distribucion: distribucion(5, [], cfg.data.zonas.map((z, i) => zo(90 + i, z.participacion_space_id, z.vertices, i))), participaciones: [], revision: { capa: "borrador", errores: [], avisos: [] } });
  assert.equal(await D().salir(), true);
  assert.equal(servidor.pedidos.filter((p) => p.url !== "/participaciones/cara").length, 1, "salir con cambios dejó de guardar el borrador");
  // El panel responde «Descartarlos» con la opción del store, no con el reductor.
  const panel = codigo6b("DistribuirCara");
  const i = panel.indexOf("async function descartarYSeguir(");
  const cuerpo = panel.slice(i, panel.indexOf("\n  }\n", i));
  assert.match(cuerpo, /await st\(\)\.cambiarCara\(p\.cara, \{ descartar: true \}\)/);
  assert.match(cuerpo, /await st\(\)\.salir\(\{ descartar: true \}\)/);
  assert.ok(!/despachar\(\{ tipo: "descartarCambios" \}\)/.test(cuerpo), "«Descartarlos» sigue dependiendo del modo");
});

await prueba("un 401 con el autoguardado frenado por un 409 no pierde lo dibujado desde el 409: vuelve al re-ingreso de LA MISMA persona en EL MISMO cliente, en memoria; nunca a otra sesión", async () => {
  D().reiniciar();
  const entrarComo = (token, email, cliente = "galerias", rol = "admin") => S.useAuthStore.getState().setAuth(token, rol, cliente, "Galerías", email);
  entrarComo("t-r1", "duena@super.co");
  await entrarA(caraOut({ distribucion: distribucion(4, [zo(1, 812, cuadradoZ(0.1, 0.1, 0.3, 0.3))]) }));
  dibujar(812, 0.5, 0.1, 0.6, 0.2);
  servidor.responder = async () => { throw rechazo(409, { detail: { code: "version_vieja", message: "Otra sesión cambió esta distribución mientras la editabas." } }); };
  assert.equal(await D().guardarBorrador(true), false);
  assert.equal(D().guardado.estado, "version_vieja");
  dibujar(813, 0.7, 0.7, 0.8, 0.8);                                  // sigue dibujando sin ver la franja
  servidor.responder = async () => { throw rechazo(401, { detail: "Sesión vencida" }); };
  await D().guardarBorrador();
  assert.equal(S.useAuthStore.getState().token, null, "el 401 no cerró la sesión");
  assert.deepEqual([D().activa, D().datos, D().edicion.zonas, D().sinGuardar], [null, null, [], {}], "el store no se vació al cerrarse la sesión");
  // La misma persona, el mismo cliente: «Recuperar lo que no se guardó», con la fusión de tres vías.
  entrarComo("t-r2", "duena@super.co");
  assert.deepEqual(Object.keys(D().sinGuardar), ["galerias|NAVE|f-1|A"]);
  await entrarA(caraOut({ distribucion: distribucion(5, [zo(1, 812, cuadradoZ(0.1, 0.1, 0.3, 0.3)), zo(9, 814, cuadradoZ(0.1, 0.6, 0.2, 0.7), 1)]) }));
  assert.equal(S.hayParaRecuperar(D()), true, "no se ofrece recuperar lo dibujado antes del 401");
  D().recuperar();
  const por = (s) => D().edicion.zonas.filter((z) => z.participacionSpaceId === s).map((z) => z.vertices);
  assert.deepEqual(por(812), [cuadradoZ(0.1, 0.1, 0.3, 0.3), cuadradoZ(0.5, 0.1, 0.6, 0.2)], "se perdió lo dibujado antes del 409");
  assert.deepEqual(por(813), [cuadradoZ(0.7, 0.7, 0.8, 0.8)], "se perdió lo dibujado DESPUÉS del 409");
  assert.deepEqual(por(814), [cuadradoZ(0.1, 0.6, 0.2, 0.7)], "la fusión pisó lo de la otra sesión");
  await D().salir({ forzado: true });
  // Nunca a otra sesión: otra persona del mismo cliente, un trabajador, otro cliente.
  const apartarAlgo = async (token, email) => {
    D().reiniciar();
    entrarComo(token, email);
    await entrarA(caraOut({ distribucion: distribucion(4, []) }));
    dibujar(812, 0.2, 0.2, 0.3, 0.3);
    S.useAuthStore.getState().logout();
    assert.deepEqual(D().sinGuardar, {});
  };
  for (const [otra, cual] of [[() => entrarComo("t-o1", "otra@super.co"), "otra persona"], [() => entrarComo("t-o2", "duena@super.co", "galerias", "worker"), "un trabajador"],
    [() => entrarComo("t-o3", "duena@super.co", "canaveral"), "otro cliente"]]) {
    await apartarAlgo("t-a", "duena@super.co");
    otra();
    assert.deepEqual(D().sinGuardar, {}, `lo apartado volvió en la sesión de ${cual}`);
    // Y lo apartado ya no vuelve después, aunque entre la persona de antes.
    S.useAuthStore.getState().logout();
    entrarComo("t-b", "duena@super.co");
    assert.deepEqual(D().sinGuardar, {}, `después de ${cual}, lo apartado volvió`);
  }
  // Cambiar de sesión sin cerrarla también lo tira.
  await apartarAlgo("t-c", "duena@super.co");
  entrarComo("t-c2", "otra@super.co");
  entrarComo("t-c3", "duena@super.co");
  assert.deepEqual(D().sinGuardar, {});
  // Nada fue al navegador.
  for (const k of escritas) assert.ok(["retail-auth-v1", "retail-fixtures-v1"].includes(k), `clave nueva en localStorage: ${k}`);
  const st = sinComentTs2(fuente("store/distribucionStore.ts"));
  assert.ok(!/localStorage|sessionStorage|indexedDB/.test(st));
  assert.match(st, /let reservaDeLaSesion: \{ cliente: string; email: string \| null; sinGuardar: Record<string, EdicionSinGuardar> \} \| null = null;/);
  assert.match(st, /if \(!r \|\| s\.cliente !== r\.cliente \|\| s\.email !== r\.email \|\| s\.role !== "admin"\) return;/);
  D().reiniciar();
});

await prueba("el encabezado dice la sede: «NAVE · GON-01 · cara A» (pedido §12), partido y nunca cortado", () => {
  assert.equal(P6.PANEL.tituloDelPanel({ sede: "NAVE", codigo: "GON-01", cara: "A" }), "NAVE · GON-01 · cara A");
  assert.equal(P6.PANEL.tituloDelPanel({ sede: "TERRON", codigo: "ROB-01", cara: "B" }), "TERRON · ROB-01 · cara B");
  const panel = codigo6b("DistribuirCara");
  assert.match(panel, /title=\{tituloDelPanel\(activa\)\} data-titulo-de-distribucion>\s*<span className="codigo">\{sinCortarLaCara\(tituloDelPanel\(activa\)\)\}<\/span>/, "el encabezado no usa el título con la sede");
  // «cara A» nunca en dos renglones (a 390 px quedaba «cara» / «A»).
  assert.equal(P6.PANEL.sinCortarLaCara("NAVE · GON-01 · cara A"), "NAVE · GON-01 · cara\u00A0A");
  assert.equal(P6.PANEL.sinCortarLaCara("TERRON · ROB-01 · cara B"), "TERRON · ROB-01 · cara\u00A0B");
  const clases = panel.match(/<h2 className="([^"]*)" title=\{tituloDelPanel\(activa\)\} data-titulo-de-distribucion>/);
  assert.ok(clases, "no está el título");
  assert.ok(!/(^|\s)truncate(\s|$)/.test(clases[1]), `el título se corta (${clases[1]})`);
  assert.match(clases[1], /(^|\s)break-words(\s|$)/, "el título no se parte en renglones");
  assert.match(clases[1], /(^|\s)text-balance(\s|$)/, "el título se parte en el guion del código");
});


await prueba("historial (contrato con el servidor): una derivada dice sólo el DÍA en que dejó de valer —nunca el anterior— y se ordena por el instante contra las reales (ejecutado con TZ=America/Bogota)", () => {
  const tzAntes = process.env.TZ;
  process.env.TZ = "America/Bogota";
  try {
    assert.equal(new Date("2026-10-18").getDate(), 17, "la prueba no corre con el reloj de Colombia (el error de antes no se vería)");
    const L = P6.PANEL.lineasDelHistorial;
    const real = (id, en, detalle, extra = {}) => ({ id, en, actor: "duena@super.co", tipo: "contractual", accion: "participacion.contrato", detalle, antes: null, despues: null, ...extra });
    const zonas = [{ id: 1, participacion_space_id: 7, vertices: cuadradoZ(0, 0, 0.5, 1), orden: 0 }];
    const h = {
      entradas: [
        real(1, "2026-10-18T06:00:00+00:00", "Contrato a la 1 de la mañana del 18"),
        real(2, "2026-10-18T03:00:00+00:00", "Cambio a las 10 de la noche del 17"),
        real(3, "2026-10-16T15:00:00+00:00", "Confirmada", { tipo: "geometria", accion: "distribucion.confirmada", despues: { zonas } }),
      ],
      derivados: [{ en: "2026-10-18T00:00:00-05:00", dia: "2026-10-18", derivado: true, tipo: "evento", accion: "reserva.caducada", participacion_id: 2,
        detalle: "Caducó la reserva provisional de la participación 2." }],
    };
    const ls = L(h);
    assert.deepEqual(ls.map((l) => l.detalle), [
      "Contrato a la 1 de la mañana del 18", "Caducó la reserva provisional de la participación 2.", "Cambio a las 10 de la noche del 17", "Confirmada",
    ], "no se ordena por el instante (comparando textos, la medianoche de Colombia quedaba debajo de las 10 de la noche del 17)");
    const d = ls[1];
    assert.equal(d.derivada, true);
    assert.equal(d.cuando, "18 oct 2026", `la caducidad dice «${d.cuando}» (en Colombia, con new Date(iso), «17 oct, 7:00 p. m.»)`);
    assert.equal(d.actor, null);
    assert.ok(!/\d:\d\d/.test(d.cuando), "la derivada muestra una hora");
    // Las reales siguen con día y hora (en la hora del navegador).
    assert.match(ls[2].cuando, /17/, `la entrada de las 22:00 del 17 dice «${ls[2].cuando}»`);
    assert.match(ls[2].cuando, /\d:\d\d/);
    assert.ok(ls[3].zonas && ls[3].zonas.length === 1, "«Ver cómo estaba» perdió las zonas de la confirmación");
    // Un servidor de antes (`en` = día solo): el mismo día y el mismo lugar.
    const viejo = L({ entradas: h.entradas, derivados: [{ en: "2026-10-18", tipo: "evento", accion: "participacion.vencida", participacion_id: 4, detalle: "Venció la participación 4." }] });
    assert.deepEqual(viejo.map((l) => l.cuando)[1], "18 oct 2026");
    assert.equal(viejo[1].detalle, "Venció la participación 4.");
    // El panel muestra eso, y ya no ordena por texto ni fecha las derivadas con su hora.
    const panel = codigo6b("DistribuirCara");
    assert.match(panel, /\{lineas && lineasDelHistorial\(lineas, nombresHist\)\.map\(\(e\) => \(/);
    assert.match(panel, /<p className="text-ink-1" data-texto-del-historial>\{e\.texto\}<\/p>/, "el historial muestra el texto del servidor (con «zona» y fechas ISO)");
    assert.ok(!/\.sort\(\(a, b\) => \(a\.en < b\.en/.test(panel), "el historial se sigue ordenando comparando textos");
    assert.match(panel, /cuando: dia \? fechaLegible\(dia\) : cuandoFue\(d\.en\)/, "una derivada con su día pasa por new Date");
  } finally {
    if (tzAntes === undefined) delete process.env.TZ; else process.env.TZ = tzAntes;
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// RECORRIDO FINAL · lo que quedó del caso H y del historial
// ═══════════════════════════════════════════════════════════════════════════
//
// Dos sesiones piden 60 % de la misma cara; la segunda frena con el 409 del
// servidor («queda 40 %»), pero su vista previa seguía diciendo «queda 100 %»
// y el panel «Comprometido 0 %» hasta volver a entrar a la cara. Y el
// historial escribía la fecha de dos maneras: «18 oct 2026» en las derivadas y
// «17 de oct de 2026, 03:24 p. m.» en las reales.

console.log("distribución · los arreglos del recorrido final");

const terminoOut = (id, space_id, numero, extra = {}) => ({
  id, space_id, codigo: `NAVE-GON-01-PC${numero}`, numero, cara: "A", estado: "contrato", estado_visible: "vigente",
  puntos_basicos: 6000, porcentaje: "60 %", proveedor: { id: 7, nombre: "Café A" }, marca: null,
  desde: "2026-10-17", hasta: "2027-01-14", caduca: null, lease_id: 3310, valor_mensual: null, renueva_a: null, notas: null,
  baja_en: null, baja_fecha: null, version: 1, creada_en: "2026-10-17T15:00:00+00:00", creada_por: "otra@super.co", ...extra,
});
const participacionOut = (t) => ({
  space_id: t.space_id, codigo: t.codigo, numero: t.numero, viva: true,
  contratado_pb: t.puntos_basicos, dibujado_pb: 0, pendiente_pb: t.puntos_basicos, terminos: [t],
});

await prueba("un 409 de una escritura de términos (otra sesión vendió en el medio) vuelve a leer la cara y la ocupación SIN cerrar el formulario: la vista previa y el panel dicen lo que queda de verdad (ejecutado, caso H)", async () => {
  D().reiniciar();
  S.useAuthStore.getState().setAuth("t-409", "admin", "galerias");
  const capa = [zo(1, 812, cuadradoZ(0.1, 0.1, 0.3, 0.3))];
  await entrarA(caraOut({ distribucion: distribucion(4, capa) }));
  D().despachar({ tipo: "elegirModo", modo: "editar" });
  dibujar(812, 0.5, 0.5, 0.7, 0.7);
  const dibujado = D().edicion.zonas;
  D().abrirFormulario({ modo: "alta" });
  // Lo escrito vive en el componente; la vista previa es pura y sale de los `datos` del store.
  const escrito = { tipo: "contrato", proveedor: "Lácteos B", correo: "", marca: "", porcentaje: "60", desde: "2026-10-17", hasta: "2027-01-14",
    caduca: "2026-10-24", valor: "500.000", notas: "" };
  const vista = () => P6.FORM.fraseDeLaVistaPrevia(P6.FORM.vistaPrevia("alta", escrito, D().datos, null, null, "A"));
  assert.equal(vista(), "En esas fechas queda 100 % y pedís 60 %.");
  assert.equal(P6.LEY.capacidadDe(D().datos, "2026-10-17").queda, 10000);

  // Lo que no es un 409 no relee nada (ni un 422 de validación, ni una caída, ni la red).
  servidor.pedidos = [];
  for (const e of [rechazo(422, { detail: [{ msg: "campo" }] }), rechazo(500, { detail: "error" }), rechazo(404, { detail: { code: "sin_mueble", message: "…" } }),
    new Error("sin red"), null]) {
    assert.equal(await D().releerTrasConflicto(e), false);
  }
  assert.deepEqual(servidor.pedidos, [], "un rechazo que no es 409 volvió a leer la cara");

  // La otra sesión cargó 60 % de la cara: es lo que tiene el servidor ahora.
  const otra = participacionOut(terminoOut(51, 813, 1));
  const conLaOtra = caraOut({ distribucion: distribucion(4, capa), participaciones: [otra] });
  const ocup = { sede: "NAVE", hoy: "2026-10-17", caras: { "NAVE-GON-01": { intervalos: [{ desde: "2026-10-17", hasta: "2027-01-14", pb: 6000 }], fisicos: [] } } };
  servidor.responder = async (cfg) => (cfg.url === "/participaciones/cara" ? conLaOtra : cfg.url === "/participaciones/ocupacion" ? ocup : {});
  const r409 = rechazo(409, { detail: { code: "capacidad_excedida",
    message: "No entra: el 17 oct 2026 la cara A ya tiene 60 % comprometido; queda 40 % y pediste 60 %." } });
  assert.equal(await D().releerTrasConflicto(r409), true);
  await esperar(5);
  assert.deepEqual(servidor.pedidos.map((p) => [p.url, p.params]), [
    ["/participaciones/cara", { sede: "NAVE", espacio: "GON-01" }],
    ["/participaciones/ocupacion", { sede: "NAVE" }],
  ], "no volvió a leer la cara y la ocupación");
  // El formulario sigue abierto (lo escrito no se pierde: el componente no se remonta) y lo dibujado, intacto.
  assert.deepEqual(D().formulario, { modo: "alta" }, "el 409 cerró el formulario");
  assert.equal(D().edicion.zonas, dibujado, "volver a leer la cara tocó lo dibujado");
  assert.equal(D().edicion.sucio, true);
  // La vista previa, con lo escrito, ya no dice «queda 100 %»: dice por qué no entra, con lo que queda.
  assert.ok(!/queda 100 %/.test(vista()), `la vista previa sigue diciendo «${vista()}»`);
  assert.match(vista(), /queda 40 %/);
  assert.ok(P6.FORM.vistaPrevia("alta", escrito, D().datos, null, null, "A").noEntra, "«Guardar» sigue habilitado con lo que ya no entra");
  // El panel (la barra y «Para vender»): comprometido 60 %, queda 40 %.
  const cap = P6.LEY.capacidadDe(D().datos, "2026-10-17");
  assert.deepEqual([cap.comprometido, cap.queda], [6000, 4000], "el panel sigue en «Comprometido 0 % · queda 100 %»");
  assert.deepEqual(S.ocupacionDeLaCara(S.useOcupacionStore.getState(), "NAVE", "NAVE-GON-01").intervalos, ocup.caras["NAVE-GON-01"].intervalos);

  // Si en el medio otra sesión guardó la distribución, su versión NO se adopta:
  // el próximo guardado tiene que chocar (`version_vieja`) en vez de pisarla.
  const otraCapa = [zo(7, 813, cuadradoZ(0.6, 0.1, 0.9, 0.4))];
  const conOtraVersion = caraOut({ distribucion: distribucion(5, capa, otraCapa), participaciones: [otra, participacionOut(terminoOut(52, 814, 2, { puntos_basicos: 1000 }))] });
  servidor.responder = async (cfg) => (cfg.url === "/participaciones/cara" ? conOtraVersion : cfg.url === "/participaciones/ocupacion" ? ocup : {});
  assert.equal(await D().releerTrasConflicto(rechazo(409, { detail: { code: "version_vieja", message: "Otra sesión…" } })), true);
  assert.equal(D().datos.participaciones.length, 2, "los términos no se pusieron al día");
  assert.equal(D().datos.distribucion.version, 4, "adoptó la versión de la distribución de la otra sesión: el próximo guardado la pisaría");
  assert.equal(D().datos.distribucion.borrador, null);
  servidor.pedidos = [];
  servidor.responder = async () => { throw rechazo(409, { detail: { code: "version_vieja", message: "Otra sesión cambió esta distribución mientras la editabas." } }); };
  assert.equal(await D().guardarBorrador(), false);
  assert.equal(servidor.pedidos[0].data.version, 4);
  assert.equal(D().guardado.estado, "version_vieja");

  // Una lectura que vuelve después de salir de la cara se tira.
  let soltar;
  servidor.responder = () => new Promise((r) => { soltar = () => r(conLaOtra); });
  const tarde = D().releerTrasConflicto(r409);
  await D().salir({ forzado: true, descartar: true });
  soltar();
  assert.equal(await tarde, false);
  assert.equal(D().datos, null, "la lectura de una cara de la que se salió volvió a poner datos");
  assert.equal(await D().releerTrasConflicto(r409), false, "sin cara activa leyó algo");

  // Los dos caminos que escriben términos en Distribución lo piden; el formulario no se remonta con los datos nuevos.
  const form = codigo6b("FormularioDeParticipacion");
  assert.match(form, /setRechazo\(\{\s*mensaje: r\?\.message[\s\S]*?\}\);\s*void useDistribucionStore\.getState\(\)\.releerTrasConflicto\(e\);\s*\} finally \{/,
    "el rechazo del formulario no vuelve a leer la cara");
  assert.match(form, /<Formulario key=\{`\$\{formulario\.modo\}\|\$\{formulario\.terminoId \?\? ""\}`\}/, "la clave del formulario cambia con los datos: se perdería lo escrito");
  assert.match(form, /const vista = vistaPrevia\(modo, c, datos, termino, participacion, activa\.cara\);/, "la vista previa no sale de los datos de este dibujo");
  assert.match(form, /<p className="text-ink-1">\{fraseDeLaVistaPrevia\(vista\)\}<\/p>/);
  const ley = codigo6b("LeyendaDeParticipaciones");
  const c = ley.indexOf("function PreguntaDeCancelar(");
  assert.match(ley.slice(c, ley.indexOf("return (", c)), /\} catch \(e\) \{[\s\S]*?void st\.releerTrasConflicto\(e\);/, "un 409 al cancelar no vuelve a leer la cara");
  D().reiniciar();
});

await prueba("historial: la fecha se escribe igual en las reales y en las derivadas («17 oct 2026»); la hora, sólo en las reales (ejecutado con TZ=America/Bogota)", () => {
  const tzAntes = process.env.TZ;
  process.env.TZ = "America/Bogota";
  try {
    assert.equal(new Date("2026-10-17T20:24:00+00:00").getHours(), 15, "la prueba no corre con el reloj de Colombia");
    const real = (id, en) => ({ id, en, actor: "duena@super.co", tipo: "contractual", accion: "participacion.contrato", detalle: `real ${id}`, antes: null, despues: null });
    const ls = P6.PANEL.lineasDelHistorial({
      entradas: [real(1, "2026-10-17T20:24:00+00:00"), real(2, "2026-10-18T03:00:00+00:00"), real(3, "2026-12-01T13:05:00+00:00")],
      derivados: [{ en: "2026-10-18T05:00:00+00:00", dia: "2026-10-18", derivado: true, tipo: "evento", accion: "participacion.vencida", participacion_id: 4,
        detalle: "Venció la participación 4." }],
    });
    const por = Object.fromEntries(ls.map((l) => [l.detalle, l.cuando]));
    assert.equal(por["Venció la participación 4."], "18 oct 2026");
    assert.match(por["real 1"], /^17 oct 2026, 0?3:24\s?p\.\s?m\.$/, `una real dice «${por["real 1"]}»`);
    assert.match(por["real 2"], /^17 oct 2026, 10:00\s?p\.\s?m\.$/, `la de las 10 de la noche del 17 dice «${por["real 2"]}»`);
    assert.match(por["real 3"], /^1 dic 2026, 0?8:05\s?a\.\s?m\.$/);
    // El día, igual en las dos: «D mmm AAAA», sin «de»; la hora, sólo en las reales.
    const dia = (s) => s.split(", ")[0];
    for (const l of ls) {
      assert.match(dia(l.cuando), /^\d{1,2} [a-z]{3} \d{4}$/, `«${l.cuando}» no escribe la fecha como las demás`);
      assert.ok(!/ de /.test(l.cuando), `«${l.cuando}» escribe la fecha con «de»`);
      assert.equal(/\d:\d\d/.test(l.cuando), !l.derivada, `«${l.cuando}»: la hora va sólo en las reales`);
    }
    const panel = codigo6b("DistribuirCara");
    assert.match(panel, /return `\$\{fechaLegible\(dia\)\}, \$\{hora\(d\.getTime\(\)\)\}`;/, "una real no escribe su día con `fechaLegible`");
    assert.ok(!/toLocaleString\("es-CO"/.test(panel), "queda el formato largo de `es-CO` («17 de oct de 2026»)");
  } finally {
    if (tzAntes === undefined) delete process.env.TZ; else process.env.TZ = tzAntes;
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// fase 2 · I1 · «COPIAR ZONAS DE OTRA CARA» (pedido §17, D20, Caso F)
// ═══════════════════════════════════════════════════════════════════════════
//
// Lo pegado se guarda enseguida por el borrador de siempre, como la persona,
// con `origen` (sólo historial y bitácora). Si ese guardado no sale (red, 409),
// el origen viaja con el próximo guardado que lleve alguna zona pegada —el
// autoguardado después de «Traer lo nuevo», el de red al cambiar de cara o
// salir, «Recuperar», el que hace confirmar antes de confirmar—, y nunca si la
// copia se deshizo. Confirmar no cambia: ni su cuerpo ni su ruta. La cuenta de
// la copia (pura) la prueba `probar-zonas.mjs`.

console.log("distribución · copiar zonas de otra cara (fase 2 · I1)");

// `copiaALaVista` es pura (lee el estado que se le pasa): se usa con el estado del store de `S`.
const rSC = await build({
  stdin: { contents: 'export { copiaALaVista } from "./src/store/distribucionStore.ts";', resolveDir: raiz, loader: "ts" },
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
const dirSC = mkdtempSync(join(tmpdir(), "distribucion-copia-"));
writeFileSync(join(dirSC, "c.mjs"), rSC.outputFiles[0].text);
const SC = await import(pathToFileURL(join(dirSC, "c.mjs")).href);
rmSync(dirSC, { recursive: true, force: true });

const ORIGEN_COPIA = { sede: "NAVE", espacio: "GON-01-B", capa: "confirmada", version: 3, espejo: false, mapa: [{ origen: 1, destino: 1 }], sin_copiar: 0 };
const PEGADA = { participacionSpaceId: 812, vertices: cuadradoZ(0.5, 0.2, 0.7, 0.6) };
const ROTULO = "NAVE · GON-01 · cara B";
const escriturasDeBorrador = () => servidor.pedidos.filter((p) => p.url === "/participaciones/distribucion/borrador");
/** El servidor de borradores con su versión, que tira los PUT del borrador mientras `cae()` diga que sí. */
const servidorQueCae = (inicial, cae) => {
  const s = servidorConVersion(inicial);
  const bien = servidor.responder;
  servidor.responder = async (cfg) => {
    if (cfg.url === "/participaciones/distribucion/borrador" && cae()) throw rechazo(503, { detail: "Servicio no disponible" });
    return bien(cfg);
  };
  return s;
};

await prueba("pegar una copia: UN paso de deshacer y un PUT del borrador como la persona, con el origen; el autoguardado de después ya no lo declara; Ctrl+Z saca la franja (ejecutado)", async () => {
  D().reiniciar();
  S.useAuthStore.getState().setAuth("t-copia-1", "admin", "galerias");
  await conRelojFalso(async () => {
    servidorConVersion(4);
    await D().entrar({ sede: "NAVE", fixtureId: "f-1", codigo: "GON-01", cara: "A" });
    servidor.pedidos = [];
    const antes = D().edicion;
    assert.equal(await D().pegarCopia({ quedan: [], nuevas: [PEGADA] }, ORIGEN_COPIA, ROTULO), true);
    assert.equal(escriturasDeBorrador().length, 1);
    const [put] = escriturasDeBorrador();
    assert.deepEqual([put.data.version, put.data.automatico, put.data.origen], [4, false, ORIGEN_COPIA]);
    assert.deepEqual(put.data.zonas, [{ participacion_space_id: 812, vertices: cuadradoZ(0.5, 0.2, 0.7, 0.6) }]);
    assert.deepEqual(D().edicion.zonas.map((z) => z.clave), [`n${antes.proxima}`]);
    assert.equal(D().edicion.atras.length, antes.atras.length + 1, "pegar no fue UN paso de deshacer");
    assert.deepEqual([D().copia.cara, D().copia.rotulo, D().copia.claves, D().copia.declarada],
      ["galerias|NAVE|f-1|A", ROTULO, [`n${antes.proxima}`], true]);
    assert.equal(SC.copiaALaVista(D()), D().copia, "la franja de la copia no está a la vista");
    assert.equal(D().edicion.sucio, false);
    // Se sigue dibujando: el autoguardado sale como siempre, sin origen (la copia ya quedó en el historial).
    dibujar(812, 0.1, 0.1, 0.2, 0.2);
    relojes.filter((r) => r.vivo).at(-1).f();
    await esperar(20);
    assert.equal(escriturasDeBorrador().length, 2);
    const auto = escriturasDeBorrador().at(-1);
    assert.equal(auto.data.automatico, true);
    assert.ok(!("origen" in auto.data), "el autoguardado volvió a declarar la copia");
    // Ctrl+Z hasta sacar lo pegado: la franja se va (y vuelve con Ctrl+Y).
    D().despachar({ tipo: "deshacer" });
    assert.ok(SC.copiaALaVista(D()));
    D().despachar({ tipo: "deshacer" });
    assert.equal(SC.copiaALaVista(D()), null, "la franja de la copia quedó después de deshacerla");
    D().despachar({ tipo: "rehacer" });
    assert.ok(SC.copiaALaVista(D()));
    await D().salir({ forzado: true, descartar: true });
  });
});

await prueba("una copia que no se pudo guardar y se deshizo no se declara con el próximo guardado; en «Mirar» no se pega nada (ejecutado)", async () => {
  D().reiniciar();
  S.useAuthStore.getState().setAuth("t-copia-2", "admin", "galerias");
  await conRelojFalso(async () => {
    let cae = true;
    servidorQueCae(4, () => cae);
    await D().entrar({ sede: "NAVE", fixtureId: "f-1", codigo: "GON-01", cara: "A" });
    servidor.pedidos = [];
    assert.equal(await D().pegarCopia({ quedan: [], nuevas: [PEGADA] }, ORIGEN_COPIA, ROTULO), false);
    assert.equal(D().guardado.estado, "error");
    assert.deepEqual(escriturasDeBorrador()[0].data.origen, ORIGEN_COPIA, "el primer intento no llevó el origen");
    assert.equal(D().copia.declarada, false);
    assert.equal(D().edicion.zonas.length, 1, "lo pegado se fue del lienzo cuando el guardado falló");
    assert.ok(SC.copiaALaVista(D()), "lo pegado y no guardado no se dice en la franja");
    // Ctrl+Z antes de que llegue al servidor: el próximo guardado no la declara.
    D().despachar({ tipo: "deshacer" });
    dibujar(812, 0.1, 0.1, 0.2, 0.2);
    cae = false;
    servidor.pedidos = [];
    assert.equal(await D().guardarBorrador(), true);
    const [put] = escriturasDeBorrador();
    assert.equal(put.data.automatico, false);
    assert.ok(!("origen" in put.data), "se declaró una copia que se había deshecho");
    // En «Mirar» no se pega (ni se escribe nada).
    D().despachar({ tipo: "elegirModo", modo: "mirar" });
    servidor.pedidos = [];
    const quieta = D().edicion;
    assert.equal(await D().pegarCopia({ quedan: [], nuevas: [PEGADA] }, ORIGEN_COPIA, ROTULO), false);
    assert.equal(D().edicion, quieta, "se pegó en «Mirar»");
    assert.deepEqual(servidor.pedidos, []);
    D().despachar({ tipo: "elegirModo", modo: "editar" });
    await D().salir({ forzado: true, descartar: true });
  });
});

await prueba("pegar con un 409 version_vieja → «Traer lo nuevo» (lo pegado es «lo mío») → el autoguardado siguiente lleva el origen, como la persona (ejecutado)", async () => {
  D().reiniciar();
  S.useAuthStore.getState().setAuth("t-copia-3", "admin", "galerias");
  await conRelojFalso(async () => {
    const base = [zo(1, 813, cuadradoZ(0.1, 0.6, 0.2, 0.7))];
    await entrarA(caraOut({ distribucion: distribucion(4, base) }));
    servidor.pedidos = [];
    servidor.responder = async (cfg) => {
      if (cfg.url === "/participaciones/distribucion/borrador") {
        throw rechazo(409, { detail: { code: "version_vieja", message: "Otra sesión cambió esta distribución mientras la editabas.", version_actual: 5 } });
      }
      return {};
    };
    assert.equal(await D().pegarCopia({ quedan: D().edicion.zonas, nuevas: [PEGADA] }, ORIGEN_COPIA, ROTULO), false);
    assert.equal(D().guardado.estado, "version_vieja");
    // El autoguardado espera a «Traer lo nuevo», como siempre.
    assert.equal(await D().guardarBorrador(true), false);
    assert.equal(escriturasDeBorrador().length, 1);
    // La otra sesión agregó una zona de la 814: se combina por participación y lo pegado (de la 812) queda.
    const suyas = [...base, zo(2, 814, cuadradoZ(0.8, 0.8, 0.9, 0.9), 1)];
    servidor.responder = async (cfg) => (cfg.url === "/participaciones/cara"
      ? caraOut({ distribucion: distribucion(5, suyas) })
      : { version: 6, distribucion: distribucion(6, suyas, cfg.data.zonas.map((z, i) => zo(60 + i, z.participacion_space_id, z.vertices, i))),
        participaciones: [], revision: { capa: "borrador", errores: [], avisos: [] } });
    await D().traerLoNuevo();
    assert.deepEqual(D().edicion.zonas.map((z) => z.participacionSpaceId).sort((a, b) => a - b), [812, 813, 814]);
    assert.ok(SC.copiaALaVista(D()), "la fusión se llevó lo pegado (o su clave)");
    servidor.pedidos = [];
    relojes.filter((r) => r.vivo).at(-1).f();
    await esperar(20);
    const [put] = escriturasDeBorrador();
    assert.ok(put, "no salió el autoguardado después de traer lo nuevo");
    assert.deepEqual([put.data.version, put.data.automatico, put.data.origen], [5, false, ORIGEN_COPIA]);
    assert.equal(D().copia.declarada, true);
    await D().salir({ forzado: true, descartar: true });
  });
});

await prueba("confirmar con una copia que no llegó al servidor: primero el borrador con el origen y después confirmar (con su cuerpo de siempre); si el borrador no sale, no se confirma (ejecutado)", async () => {
  D().reiniciar();
  S.useAuthStore.getState().setAuth("t-copia-4", "admin", "galerias");
  await conRelojFalso(async () => {
    let cae = true;
    servidorQueCae(4, () => cae);
    await D().entrar({ sede: "NAVE", fixtureId: "f-1", codigo: "GON-01", cara: "A" });
    assert.equal(await D().pegarCopia({ quedan: [], nuevas: [PEGADA] }, ORIGEN_COPIA, ROTULO), false);
    servidor.pedidos = [];
    await D().confirmar();
    assert.deepEqual(servidor.pedidos.map((p) => p.url.split("/").at(-1)), ["borrador"], "se confirmó sin haber guardado antes la copia");
    assert.equal(D().copia.declarada, false);
    cae = false;
    servidor.pedidos = [];
    await D().confirmar();
    assert.deepEqual(servidor.pedidos.map((p) => [p.url.split("/").at(-1), p.data.version]), [["borrador", 4], ["confirmar", 5]]);
    assert.deepEqual([servidor.pedidos[0].data.automatico, servidor.pedidos[0].data.origen], [false, ORIGEN_COPIA]);
    assert.ok(!("origen" in servidor.pedidos[1].data) && !("automatico" in servidor.pedidos[1].data), "el cuerpo de confirmar cambió");
    assert.equal(D().copia, null, "la copia siguió pendiente después de confirmar");
    assert.equal(SC.copiaALaVista(D()), null);
    await D().salir({ forzado: true, descartar: true });
  });
});

await prueba("cambiar de cara con una copia sin guardar: el guardado de red lleva el origen y la otra cara empieza sin copia; salir: queda en memoria y «Recuperar» la trae (ejecutado)", async () => {
  D().reiniciar();
  S.useAuthStore.getState().setAuth("t-copia-5", "admin", "galerias");
  await conRelojFalso(async () => {
    let cae = true;
    servidorQueCae(4, () => cae);
    await D().entrar({ sede: "NAVE", fixtureId: "f-1", codigo: "GON-01", cara: "A" });
    assert.equal(await D().pegarCopia({ quedan: [], nuevas: [PEGADA] }, ORIGEN_COPIA, ROTULO), false);
    cae = false;
    servidor.pedidos = [];
    assert.equal(await D().cambiarCara("B"), true);
    const [put] = escriturasDeBorrador();
    assert.deepEqual([put.data.espacio, put.data.automatico, put.data.origen], ["GON-01", false, ORIGEN_COPIA]);
    assert.equal(D().activa.cara, "B");
    assert.equal(D().copia, null, "la copia de la cara A siguió en la B");
    await D().salir({ forzado: true, descartar: true });

    // Salir con el guardado cayéndose: lo no guardado se queda en memoria con su copia, y «Recuperar» la trae.
    D().reiniciar();
    S.useAuthStore.getState().setAuth("t-copia-6", "admin", "galerias");
    cae = true;
    servidorQueCae(4, () => cae);
    await D().entrar({ sede: "NAVE", fixtureId: "f-1", codigo: "GON-01", cara: "A" });
    assert.equal(await D().pegarCopia({ quedan: [], nuevas: [PEGADA] }, ORIGEN_COPIA, ROTULO), false);
    assert.equal(await D().salir({ forzado: true }), true);
    assert.deepEqual(D().sinGuardar["galerias|NAVE|f-1|A"]?.copia?.origen, ORIGEN_COPIA, "lo no guardado perdió de dónde venía la copia");
    cae = false;
    await D().entrar({ sede: "NAVE", fixtureId: "f-1", codigo: "GON-01", cara: "A" });
    assert.equal(D().copia, null);
    D().recuperar();
    assert.equal(D().copia?.declarada, false, "«Recuperar» no trajo la copia pendiente");
    servidor.pedidos = [];
    assert.equal(await D().guardarBorrador(true), true);
    const [otro] = escriturasDeBorrador();
    assert.deepEqual([otro.data.automatico, otro.data.origen], [false, ORIGEN_COPIA]);
    await D().salir({ forzado: true, descartar: true });
  });
});

await prueba("guardas de la copia: el diálogo con los tokens del cajón, UN botón principal y sin montos; el panel lo apaga en «Mirar» y con el plano sin guardar; pegarZonas en EDITAN; confirmar sin origen; E5a sin tipo local", () => {
  const css = [leer(join(raiz, "src", "tema.css")), leer(join(raiz, "src", "index.css"))].join("\n");
  const crudo = fuente(`${DIST}/CopiarZonas.tsx`), t = sinComentTs2(crudo);
  assert.equal((crudo.match(/["'\s`]btn-principal["'\s`]/g) || []).length, 1, "CopiarZonas tiene que tener UN botón principal («Copiar como borrador»)");
  assert.match(crudo, /className="btn-principal[^"]*"[\s\S]{0,260}Copiar como borrador/);
  for (const m of t.matchAll(/var\(\s*(--[\w-]+)\s*[,)]/g)) assert.ok(new RegExp(`${m[1]}\\s*:`).test(css), `CopiarZonas: ${m[1]} no existe en el tema`);
  const raiz1 = /var\(--(surface|surface-2|surface-3|ink-[1-4]|danger|warning|success|line|line-strong|accent|bg)\)/.exec(t);
  assert.equal(raiz1, null, `CopiarZonas: ${raiz1?.[0]} se resuelve en :root (usá rgb(var(--x-rgb)))`);
  assert.ok(!/--superficie|--tinta\b|prefers-color-scheme/.test(t), "CopiarZonas: token inventado o prefers-color-scheme");
  assert.ok(!/localStorage|sessionStorage|indexedDB/.test(t), "CopiarZonas guarda algo en el navegador");
  assert.ok(!/useDistribucionStore\.setState\(/.test(t), "CopiarZonas escribe el store de edición por fuera de sus acciones");
  assert.ok(!/from\s+["'][^"']*StoreEditor3D\/StoreEditor3D["']/.test(t), "CopiarZonas importa StoreEditor3D");
  assert.ok(!/valor_mensual|monthly_rent|negotiatedValue|sombra/i.test(crudo), "CopiarZonas nombra montos (o «sombra»)");
  assert.match(t, /useDistribucionStore\.getState\(\)\.pegarCopia\(/, "el diálogo no pega por el store");
  assert.match(t, /<Dialogo titulo=\{caras === 2 \? "Copiar de la otra cara" : "Copiar de otra cara"\}/, "el diálogo no es el de siempre (role=dialog, aria-modal, Esc propio), o no se llama como el ítem de «Más»");
  // Distribuir con piezas: abre en una cara que TIENE algo para copiar, y una vacía se dice sin rojo.
  assert.match(t, /setElegida\(opcionDeEntrada\(opciones\)\?\.clave \?\? ""\)/, "el diálogo abre en la primera cara aunque no tenga nada (y muestra un error de entrada)");
  assert.match(t, /\{copia && !copia\.compatible && !sinNada && <p role="alert"/, "una cara sin nada para copiar se dice en rojo");
  // Tampoco los avisos de la copia («No queda ninguna pieza para copiar», en
  // rojo) ni las opciones de una copia que no hay (recorrido 2026-10-24).
  assert.match(t, /\{frases && frases\.avisos\.length > 0 && !sinNada && \(/, "una cara sin nada para copiar muestra los avisos en rojo");
  assert.match(t, /\{!sinNada && \(\s*<label[^>]*>\s*<input type="checkbox" checked=\{quitarLasDemas\}/, "sin nada para copiar, sigue «Sacar las piezas…»");
  assert.match(t, /\{!sinNada && \(\s*<label[^>]*>\s*<input type="checkbox" checked=\{espejo\}/, "sin nada para copiar, sigue «En espejo»");
  assert.ok(!/A qué participación|Quitar las zonas de las participaciones/.test(crudo), "el diálogo habla de «participación» o de «zonas»");
  // En «Más»: «Copiar de la otra cara», apagado mientras no se puede editar y con lo que dice `motivoParaNoCopiar`.
  const panel = codigo6b("DistribuirCara");
  assert.match(panel, /data-copiar-zonas-de-otra-cara disabled=\{!puedeEditar \|\| motivoCopiar !== null\}[\s\S]{0,260}Copiar de la otra cara/);
  assert.match(panel, /\{copiando && <CopiarZonas caras=\{caras\} onCerrar=\{\(\) => setCopiando\(false\)\} \/>\}/);
  assert.match(panel, /\{copiaVisible && \(/, "la franja de la copia no está en el panel");
  // pegarZonas está entre las acciones que no hacen nada en «Mirar».
  const ed = sinComentTs2(fuente("utils/edicionDeZonas.ts"));
  const editan = /const EDITAN = new Set<Accion\["tipo"\]>\(\[([\s\S]*?)\]\);/.exec(ed);
  assert.ok(editan && /"pegarZonas"/.test(editan[1]), "pegarZonas no está en EDITAN (pegaría en «Mirar»)");
  // Confirmar no cambia: su cuerpo no lleva `origen` (una copia se guarda antes como borrador).
  const api = sinComentTs2(fuente("api/participaciones.ts"));
  assert.match(api, /export type ConfirmarDistribucionIn = Omit<BorradorIn, "automatico" \| "origen">;/);
  assert.match(api, /origen\?: OrigenDeCopiaIn;/);
  // copiaDeZonas no entra por la lista de lo que guarda en el navegador… porque no guarda nada.
  assert.ok(!/localStorage|sessionStorage|indexedDB/.test(sinComentTs2(fuente("utils/copiaDeZonas.ts"))));
  // E5a: el historial trae `dia` y `derivado` en su tipo; el panel ya no los agrega con un tipo local.
  assert.match(api, /derivados: \{ en: string; dia\?: string; derivado\?: true;/);
  assert.ok(!/HistorialOut\["derivados"\]\[number\] &/.test(fuente(`${DIST}/DistribuirCara.tsx`)), "la pantalla lee dia/derivado con un tipo local");
});

// ═══════════════════════════════════════════════════════════════════════════
// DISTRIBUIR CON PIEZAS (2026-10-24) · el 3D se mira, la parte se vende en Vender
// ═══════════════════════════════════════════════════════════════════════════
//
// El rediseño aprobado sacó «Editar en el 3D» (la zona flotando delante de los
// estantes y el giro con el botón derecho confundían): el 3D queda como
// miniatura viva y «Ver en 3D», con el MISMO motor del editor. El trazo «A
// mano» se sigue viendo punteado en el 3D. Las guardas de antes del control
// del puntero (puntero, interruptor, órbita) se fueron con él; éstas fijan que
// no vuelva y que el 3D de Distribuir sea el del editor, y lo nuevo: sin alta
// de participación en Distribuir, sin números internos ni palabras de antes, y
// la entrada desde Supervisar con su vuelta.

console.log("distribución · con piezas: el 3D se mira, sin alta, sin números internos, Supervisar ida y vuelta");

const rI2 = await build({
  stdin: {
    contents: [
      'export * as EM from "./src/utils/edicionEnElMueble.ts";',
      'export { useDistribucionStore } from "./src/store/distribucionStore.ts";',
      'export { estadoInicial, reducir } from "./src/utils/edicionDeZonas.ts";',
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
const dirI2 = mkdtempSync(join(tmpdir(), "distribucion-i2-"));
writeFileSync(join(dirI2, "i2.mjs"), rI2.outputFiles[0].text);
const I2 = await import(pathToFileURL(join(dirI2, "i2.mjs")).href);
rmSync(dirI2, { recursive: true, force: true });

const cuadI2 = (u0, v0, u1, v1) => [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];

await prueba("el trazo que se dibuja punteado: el rectángulo de sus dos esquinas, el polígono con el cursor, y nada con menos de dos puntos", () => {
  const t = I2.EM.trazoParaDibujar;
  assert.deepEqual(t({ herramienta: "rectangulo", trazo: [[0.6, 0.7], [0.2, 0.1]] }, null), cuadI2(0.2, 0.1, 0.6, 0.7));
  assert.deepEqual(t({ herramienta: "rectangulo", trazo: [[0.6, 0.7], [0.2, 0.1]] }, [0.9, 0.9]), cuadI2(0.2, 0.1, 0.6, 0.7), "el cursor cambió el rectángulo");
  assert.deepEqual(t({ herramienta: "poligono", trazo: [[0.1, 0.1], [0.5, 0.1]] }, [0.5, 0.5]), [[0.1, 0.1], [0.5, 0.1], [0.5, 0.5]]);
  assert.deepEqual(t({ herramienta: "poligono", trazo: [[0.1, 0.1], [0.5, 0.1]] }, null), [[0.1, 0.1], [0.5, 0.1]]);
  assert.deepEqual(t({ herramienta: "poligono", trazo: [[0.1, 0.1]] }, [0.3, 0.3]), [[0.1, 0.1], [0.3, 0.3]]);
  assert.equal(t({ herramienta: "poligono", trazo: [[0.1, 0.1]] }, null), null);
  assert.equal(t({ herramienta: "rectangulo", trazo: [[0.1, 0.1]] }, null), null);
  assert.equal(t({ herramienta: "rectangulo", trazo: null }, [0.3, 0.3]), null);
  assert.equal(t({ herramienta: "seleccionar", trazo: null }, null), null);
  // No devuelve el arreglo del estado (el 3D no lo puede mutar).
  const trazo = [[0.1, 0.1], [0.5, 0.1]];
  const fuera = t({ herramienta: "poligono", trazo }, null);
  assert.notEqual(fuera, trazo);
  assert.notEqual(fuera[0], trazo[0]);
});
await prueba("el trazo en el 3D: `ZonasDelMueble` sigue sin leer stores y lo dibuja como una cinta discontinua, en el nivel más alto y sólo en la cara que se edita", () => {
  const z = sinComentTs2(fuente("components/StoreEditor3D/muebles/ZonasDelMueble.tsx"));
  assert.ok(!/store\//.test(z), "las zonas leen un store");
  assert.match(z, /\{c\.editada && trazo && trazo\.vertices\.length >= 2 && \(\s*<Cinta key="trazo" sup=\{sup\} cara=\{c\.cara\} vertices=\{trazo\.vertices\} ancho=\{CINTA_ELEGIDA_M\} estilo="discontinua"\s*tono=\{trazo\.tono \?\? GRIS_DE_HISTORIA\} opacidad=\{1\} nivel=\{NIVEL_MAXIMO_DE_CINTA\} \/>/,
    "el trazo no es una cinta discontinua arriba de todo en la cara que se edita");
});
await prueba("sin «Editar en el 3D»: ni el control, ni el interruptor, ni su pista; el clic en el 3D sólo elige (o cambia de cara), y `Scene` no sabe de ediciones", () => {
  const editor = sinComentTs2(fuente("components/StoreEditor3D/StoreEditor3D.tsx"));
  assert.ok(!/EdicionEnElMueble|useEditarEnEl3D|punteroEnElMueble|conectarEdicionEnElMueble|BotonDeEditarEnEl3D|PistaDeEditarEnEl3D|data-editar-en-3d|Editar en el 3D/.test(editor),
    "volvió «Editar en el 3D» al editor");
  assert.ok(!/queHaceElBotonIzquierdo/.test(sinComentTs2(fuente("utils/edicionEnElMueble.ts"))), "quedó la tabla del botón izquierdo del 3D");
  // Ningún archivo de Distribuir dibuja un 3D propio: se usa el motor del editor.
  for (const n of readdirSync(join(raiz, "src", ...DIST.split("/")))) {
    const t = sinComentTs2(leer(join(raiz, "src", ...DIST.split("/"), n)));
    assert.ok(!/from\s+["'](three|@react-three\/fiber|@react-three\/drei)["']/.test(t), `${n} arma un 3D propio`);
  }
  // El nodo de las zonas: sin órbita ni muebles (nadie edita desde el 3D) y el trazo «A mano» sin cursor del 3D.
  assert.match(editor, /const zonasDeLaDistribucion = useMemo\(\(\) => <ZonasDeLaDistribucion \/>, \[\]\);/);
  assert.match(editor, /function ZonasDeLaDistribucion\(\) \{/);
  assert.match(editor, /trazoParaDibujar\(\{ trazo: trazoEnCurso, herramienta \}, null\)/);
  const scene = editor.slice(editor.indexOf("export function Scene({"), editor.indexOf("export function storeToFixtures("));
  assert.ok(scene.length > 5000, "no se encontró el cuerpo de `Scene`");
  assert.match(scene, /if \(r\) enModoDistribucion\.onTocar\(r\.cara, r\.u, r\.v\);/);
  // Un toque en el 3D (`tocarEnElMueble`) sólo elige la zona o cambia de cara: nunca dibuja ni mueve.
  const st = sinComentTs2(fuente("store/distribucionStore.ts"));
  const i = st.indexOf("tocarEnElMueble: (cara, u, v) => {");
  const cuerpo = st.slice(i, st.indexOf("\n    },", i));
  assert.ok(i > 0 && !/empezarTrazo|agregarPunto|moverZona|ponerPiezas|cerrarTrazo/.test(cuerpo), "un toque en el 3D edita");
});

await prueba("el 3D de Distribuir es el del editor: el Canvas vive en un anfitrión que se muda (miniatura viva y «Ver en 3D»), sin volver a montarse", () => {
  const editor = sinComentTs2(fuente("components/StoreEditor3D/StoreEditor3D.tsx"));
  const panel = codigo6b("DistribuirCara");
  const ranura = sinComentTs2(fuente("components/RanuraDelLienzo.tsx"));
  // El Canvas se dibuja por un portal adentro del anfitrión, y el anfitrión se enchufa en una ranura.
  assert.match(editor, /\{anfitrionDelLienzo && createPortal\(\s*<CanvasErrorBoundary>\s*<Canvas\b/, "el Canvas no va por el portal del anfitrión");
  assert.match(editor, /<\/CanvasErrorBoundary>,\s*anfitrionDelLienzo\)\}/);
  assert.equal((editor.match(/<Canvas\b/g) || []).length, 1, "hay más de un Canvas en el editor (un 3D nuevo)");
  assert.match(editor, /\{!distribucionVisible && <RanuraDelLienzo anfitrion=\{anfitrionDelLienzo\} className="absolute inset-0" \/>\}/);
  assert.match(editor, /<DistribuirCara fixtureId=\{distribucionActiva\.fixtureId\} sede=\{distribucionActiva\.sede\} onEncuadrarCara=\{encuadrarCara\} lienzo3D=\{anfitrionDelLienzo\} \/>/);
  // En la pantalla: la miniatura (sin puntero: la toca el botón) y en grande, con «Volver a ubicar».
  assert.equal((panel.match(/<RanuraDelLienzo anfitrion=\{lienzo3D\}/g) || []).length, 2, "la pantalla no enchufa el 3D en la miniatura y en grande");
  assert.match(panel, /<RanuraDelLienzo anfitrion=\{lienzo3D\} className="pointer-events-none [^"]*" \/>/, "la miniatura deja girar el 3D (se toca para agrandarla)");
  assert.match(panel, /Así queda en 3D/);
  assert.match(panel, /Se actualiza al soltar cada pieza/);
  assert.match(panel, /data-ver-en-3d><Box \{\.\.\.ICONO\} \/>Ver en 3D<\/button>/);
  assert.match(panel, /onClick=\{\(\) => ui\(\)\.verEn3D\(false\)\} data-volver-a-ubicar><ArrowLeft \{\.\.\.ICONO\} \/>Volver a ubicar<\/button>/);
  assert.match(panel, /Desde acá no se edita\./);
  // La ranura muda el anfitrión con el DOM (appendChild) y sólo lo suelta si todavía lo tiene.
  assert.match(ranura, /el\.appendChild\(anfitrion\);\s*return \(\) => \{ if \(anfitrion\.parentNode === el\) el\.removeChild\(anfitrion\); \};/);
  // La pantalla va en el tema de la app: el editor deja de ser cajón oscuro mientras se distribuye.
  assert.match(editor, /<div data-cajon-oscuro=\{distribucionVisible \? undefined : ""\}/, "Distribuir queda adentro del cajón oscuro (oscuro forzado)");
});

await prueba("sin alta de participación en Distribuir: el formulario no abre «alta» ni «Cargar de nuevo», el store no los pide y ninguna pantalla los ofrece", () => {
  const store = sinComentTs2(fuente("store/distribucionStore.ts"));
  assert.match(store, /\| \{ modo: "renovar" \| "confirmar" \| "editar"; terminoId\?: number \};/, "el store pide un alta");
  const form = codigo6b("FormularioDeParticipacion");
  assert.match(form, /const MODOS_DE_DISTRIBUIR: readonly Modo\[\] = \["renovar", "confirmar", "editar"\];/);
  assert.match(form, /if \(!MODOS_DE_DISTRIBUIR\.includes\(formulario\.modo\)\) return null;/, "el formulario abre un alta");
  const todos = [];
  const recorrer = (dir) => {
    for (const n of readdirSync(dir, { withFileTypes: true })) {
      const q = join(dir, n.name);
      if (n.isDirectory()) recorrer(q); else if (/\.(ts|tsx)$/.test(n.name)) todos.push(q);
    }
  };
  recorrer(join(raiz, "src"));
  for (const q of todos) {
    const t = sinComentTs2(leer(q));
    assert.ok(!/abrirFormulario\(\{ modo: "(alta|cargarDeNuevo)"/.test(t), `${q} abre el alta de una participación`);
  }
  for (const n of ["DistribuirCara", "CaraDePiezas", "LeyendaDeParticipaciones", "ResumenDeCambios", "CopiarZonas"]) {
    assert.ok(!/Nueva participación|Cargar de nuevo/.test(codigo6b(n)), `${n} ofrece crear una participación`);
  }
  // Los textos que mandaban a crearlas en Distribución dicen Vender.
  const editor = sinComentTs2(fuente("components/StoreEditor3D/StoreEditor3D.tsx"));
  assert.ok(!/Las participaciones se cargan en/.test(editor), "el panel del 3D sigue mandando a crear participaciones en Distribución");
  assert.match(editor, /se vende en <b className="text-dark-ink-2">Vender<\/b>/);
  const partes = sinComentTs2(fuente("components/PartesDelMueble.tsx"));
  assert.ok(!/cargan en Distribución|se cargan en el Editor 3D/.test(partes), "PartesDelMueble sigue mandando a cargarlas en Distribución");
  assert.match(partes, /se vende en Vender/);
  // Y las frases compartidas (el globo de Supervisar, la ficha del plano 2D): se vende en Vender, se ubica en Distribuir.
  const reglas = sinComentTs2(fuente("utils/partes.ts"));
  assert.match(reglas, /export const DONDE_SE_CARGAN = "La parte de cada marca se vende en Vender; dónde va cada una se ubica con «Distribuir»\.";/);
  assert.ok(!/disponible para vender en el Editor 3D|se cargan en el Editor 3D/.test(reglas), "una frase compartida manda a vender en Distribución");
});

/** Lo que se LEE en pantalla de un componente: los textos entre comillas (sin
 *  lo que va en `${…}`) y el texto suelto de JSX. Los nombres de variables
 *  (`p.dibujado`, `capacidadDe`) no son palabras de la pantalla. */
const textosVisibles = (t) => {
  const fuera = [];
  const sinImports = t.replace(/^import[^;]*;/gm, "");
  for (const m of sinImports.matchAll(/"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`/g)) {
    const x = (m[1] ?? m[2] ?? m[3]).replace(/\$\{[^}]*\}/g, " ");
    // Un selector, una clave o un nombre de acción (sin espacios) no es texto de pantalla.
    if (/^[\w.\-\[\]=#:/]*$/.test(x.trim())) continue;
    fuera.push(x);
  }
  // El texto suelto de JSX (sin código: nada con `;`, `(`, `)` ni `=`, que es lo que deja un genérico o una flecha).
  for (const m of t.matchAll(/>([^<>{}();=]+)</g)) fuera.push(m[1]);
  return fuera.join("\n");
};

await prueba("sin números internos ni palabras de antes en la pantalla de Distribuir (ni «sombra»)", () => {
  // Que la cuenta de los textos no esté vacía (si el extractor se rompe, la prueba no prueba nada).
  assert.match(textosVisibles(codigo6b("DistribuirCara")), /Listo, guardar la cara/);
  assert.match(textosVisibles(codigo6b("DistribuirCara")), /marcas ubicadas/);
  assert.match(textosVisibles(sinComentTs2(fuente(`${DIST}/piezasDeLaCara.ts`))), /Arrastrala a la cara/);
  const archivos = [["DistribuirCara", codigo6b("DistribuirCara")], ["CaraDePiezas", codigo6b("CaraDePiezas")], ["ResumenDeCambios", codigo6b("ResumenDeCambios")],
    ["CopiarZonas", codigo6b("CopiarZonas")], ["piezasDeLaCara", sinComentTs2(fuente(`${DIST}/piezasDeLaCara.ts`))]];
  for (const [n, t] of archivos) {
    assert.ok(!/[Pp]articipaci[oó]n \$\{|\{p\.numero\}|\$\{p\.numero\}|numero\} ·|\$\{g\.numeroOrigen\}/.test(t), `${n} muestra el número interno de una participación`);
    const v = textosVisibles(t);
    assert.ok(!/\bsombra\b/i.test(v), `${n} dice «sombra»`);
    for (const palabra of [/\bparticipaci[oó]n(es)?\b/i, /\bzonas?\b/i, /\bcapacidad\b/i, /\bpico\b/i, /comprometid/i, /\bcapa\b/i, /término/i, /\bMirar\b/, /\bdibujado\b/i, /\bcontratado\b/i, /\bconfirmar la distribución\b/i]) {
      const m = palabra.exec(v);
      assert.ok(!m, `${n} dice «${m?.[0]}» en pantalla`);
    }
  }
  // El rótulo de las zonas en el 3D: el %, sin el número.
  const editor = sinComentTs2(fuente("components/StoreEditor3D/StoreEditor3D.tsx"));
  assert.match(editor, /rotulo: pct\(p\.contratado_pb\),/);
  assert.ok(!/rotulo: `\$\{p\.numero\} ·/.test(editor), "el rótulo del 3D dice el número interno");
});

await prueba("«Acomodar solas» al entrar: sólo una cara SIN nada ubicado, una vez por entrada, y nunca sobre lo que ya hay (ni con algo para recuperar)", () => {
  const panel = codigo6b("DistribuirCara");
  const i = panel.indexOf("const claveDeEntrada = activa && datos ?");
  const efecto = panel.slice(i, panel.indexOf("}, [claveDeEntrada", i));
  assert.match(efecto, /if \(!claveDeEntrada \|\| !puedeEditar \|\| recuperable \|\| acomodadas\.includes\(claveDeEntrada\)\) return;\s*ui\(\)\.anotarAcomodada\(claveDeEntrada\);/,
    "se acomoda más de una vez, sin poder editar, o con algo para recuperar");
  assert.match(efecto, /if \(edicion\.zonas\.length > 0 \|\| piezas\.length === 0\) return;\s*acomodar\(true\);/, "se acomoda una cara que ya tiene algo dibujado");
  // Acomodar pone SÓLO las sin ubicar, con `acomodarSolas` (las exactas), en un paso.
  const j = panel.indexOf("const acomodar = (alEntrar = false) => {");
  const cuerpo = panel.slice(j, panel.indexOf("\n  };", j));
  assert.match(cuerpo, /const sin = piezas\.filter\(\(p\) => p\.estado === "sin_ubicar"\);/);
  assert.match(cuerpo, /acomodarSolas\(cara, sin\.map\(\(p\) => \(\{ spaceId: p\.spaceId, pb: p\.pb \}\)\), fijas, cruzanEnFechas\(piezas, hoy\)\)/);
  assert.equal((cuerpo.match(/despachar\(/g) || []).length, 1, "acomodar despacha más de una vez (más de un paso de deshacer)");
});

await prueba("desde Supervisar y de vuelta: «Distribuir» pide volver; «Listo» guarda, sale y vuelve a Supervisar con el aviso (ejecutado el pedido del store)", () => {
  for (const f of ["components/Distribucion/RevisarParticipaciones.tsx", "components/Distribucion/ParticipacionesDeLaCara.tsx", "pages/DashboardView.tsx"]) {
    assert.match(sinComentTs2(fuente(f)), /useAbrirEnDistribucion\("supervisar"\)/, `${f} no pide volver a Supervisar`);
  }
  const hook = sinComentTs2(fuente("components/Distribucion/ParticipacionesDeLaCara.tsx"));
  assert.match(hook, /pedir\(fixtureId, cara, \{ distribucion: \{ \.\.\.\(renovar \? \{ renovar \} : \{\}\), \.\.\.\(volver \? \{ volver \} : \{\}\) \} \}\)/);
  const editor = sinComentTs2(fuente("components/StoreEditor3D/StoreEditor3D.tsx"));
  assert.match(editor, /const \{ renovar, volver \} = enfoquePedido\.distribucion;/);
  assert.match(editor, /\.\.\.\(volver \? \{ volverA: volver \} : \{\}\),/);
  const panel = codigo6b("DistribuirCara");
  const i = panel.indexOf("async function confirmarYa() {");
  const cuerpo = panel.slice(i, panel.indexOf("\n  }\n", i));
  const orden = ["const conAviso = piezas.filter((p) => !p.esReserva && p.poligonos.length > 0 && (!habia || cambian.has(p.spaceId))).map((p) => p.corto);",
    "await st().confirmar();", 'if (g.estado !== "quieto" || g.mensaje)', "avisoDeMontaje(conAviso)",
    'if (a.volverA === "supervisar") {', "if (await st().salir()) irseASupervisar(`${titulo} ${texto}`.trim());", "setExito({ titulo, texto });"];
  let desde = 0;
  for (const paso of orden) {
    const k = cuerpo.indexOf(paso, desde);
    assert.ok(k >= 0, `«Listo» no hace «${paso}» (o no en ese orden)`);
    desde = k + paso.length;
  }
  assert.match(panel, /const titulo = `Listo: \$\{a\.codigo\} · cara \$\{a\.cara\} quedó distribuida\.`;/);
  // El aviso de montaje, en palabras (ejecutado): las marcas con contrato, una vez cada una.
  const A = P6.PANEL.avisoDeMontaje;
  assert.equal(A(["Café A"]), "A Café A le llega el aviso de montaje con su lugar (si le falta la planometría, sale cuando la cargues en Supervisar).");
  assert.equal(A(["Café A", "Marca 2", "Café A"]), "A Café A y Marca 2 les llega el aviso de montaje con su lugar (si les falta la planometría, sale cuando la cargues en Supervisar).");
  assert.equal(A([]), "");
  // Distribuir no lee lo de Supervisar (el visor de Vender alcanza esta pantalla por el editor).
  assert.ok(!/montajesPendientes|api\/cobros|api\/reservas/.test(panel), "Distribuir lee una API de Supervisar");
  // El pedido: viaja por el store, `Dashboard` cambia de pestaña y la pantalla de sede lo suelta y abre Supervisar.
  const st = S.useFixtureStore.getState();
  st.pedirSupervisar("Listo: GON-01 · cara A quedó distribuida.");
  const pedido = S.useFixtureStore.getState().pedidoSupervisar;
  assert.deepEqual([pedido.aviso, typeof pedido.n], ["Listo: GON-01 · cara A quedó distribuida.", "number"]);
  S.useFixtureStore.getState().soltarPedidoSupervisar();
  assert.equal(S.useFixtureStore.getState().pedidoSupervisar, null);
  assert.match(sinComentTs2(fuente("pages/Dashboard.tsx")), /if \(pedidoSupervisar && isAdmin\) setViewMode\("kpis"\);/);
  const dv = sinComentTs2(fuente("pages/DashboardView.tsx"));
  assert.match(dv, /useFixtureStore\.getState\(\)\.soltarPedidoSupervisar\(\);\s*setModo\("supervisar"\);\s*setAvisoDeDistribucion\(pedidoSupervisar\.aviso\);/);
  assert.match(dv, /\{isAdmin && avisoDeDistribucion && \(/, "el aviso de lo que dejó Distribuir no se muestra (o se le muestra a un trabajador)");
  // No se persiste (no es una preferencia ni un dato).
  const fs = sinComentTs2(fuente("store/fixtureStore.ts"));
  const parcial = fs.slice(fs.indexOf("partialize: (state) => ({"), fs.indexOf("}),", fs.indexOf("partialize: (state) => ({")));
  assert.ok(!/pedidoSupervisar/.test(parcial), "el pedido de volver a Supervisar se guarda en el navegador");
});

console.log("distribución · la corrección tras la ronda de prueba (2026-10-24)");

/** Un término de las reglas (lo que lee `seCruzanEnFechas`) para una pieza de prueba. */
const terminoR = (spaceId, desde, hasta) => ({ id: spaceId * 10, spaceId, numero: spaceId, estado: "contrato", pb: 6000, supplierId: spaceId,
  marca: null, desde, hasta, caduca: null, bajaFecha: null, lease: { isActive: true, startDate: desde, endDate: hasta } });
const piezaR = (spaceId, x) => ({ spaceId, corto: `M${spaceId}`, pb: 6000, dibujado: 6000, estado: "ubicada", tono: "var(--marca-1)", estampa: null,
  poligonos: [], terminos: [], rigeHoy: true, desde: "2026-10-01", hasta: "2026-11-15", choca: null, ...x });

await prueba("el rótulo de la pieza en la cara dice lo que HAY: justa con ✓; pasada, corta o pisando, lo medido y en rojo (ejecutado)", () => {
  const R = P6.CARA.rotuloDePieza;
  assert.deepEqual(R({ estado: "ubicada", pb: 3000, dibujado: 3000 }, null), { texto: "30 % ✓", rojo: false });
  assert.deepEqual(R({ estado: "sobra", pb: 3000, dibujado: 4242 }, null), { texto: "42,42 % · sobra 12,42 %", rojo: true });
  assert.deepEqual(R({ estado: "falta", pb: 3000, dibujado: 2500 }, null), { texto: "25 % · faltan 5 %", rojo: true });
  assert.deepEqual(R({ estado: "choca", pb: 3000, dibujado: 3000 }, "Aseo"), { texto: "30 % · pisa a Aseo", rojo: true });
  assert.equal(R({ estado: "sin_ubicar", pb: 3000, dibujado: 0 }, null).rojo, false);
  // Y el 3D: lo medido en la edición, con la misma frase.
  const editor = sinComentTs2(fuente("components/StoreEditor3D/StoreEditor3D.tsx"));
  assert.match(editor, /fuera\.set\(p\.space_id, hay === 0 \? pct\(p\.contratado_pb\) : rotuloDeLoQueHay\(p\.contratado_pb, hay\)\.texto\);/, "el 3D no dice lo medido");
  assert.match(editor, /const medido = rotulosMedidos\(datos, zonas\);/);
});

await prueba("dos marcas con fechas que no se cruzan comparten el lugar: rótulos apilados con la vigencia corta, la que todavía no rige sólo punteada; las que se cruzan no (ejecutado)", () => {
  const cara = { ancho: 1.8, alto: 1.8, exclusiones: [] };
  const cuad = [[0.1, 0.1], [0.6, 0.1], [0.6, 0.9], [0.1, 0.9]];
  const ahora = piezaR(1, { poligonos: [cuad], terminos: [terminoR(1, "2026-10-01", "2026-11-15")], desde: "2026-10-01", hasta: "2026-11-15", rigeHoy: true });
  const despues = piezaR(2, { poligonos: [cuad], terminos: [terminoR(2, "2026-11-16", "2027-02-28")], desde: "2026-11-16", hasta: "2027-02-28", rigeHoy: false });
  const m = P6.CARA.lugaresCompartidos([despues, ahora], cara, "2026-10-24");
  assert.deepEqual([m.get(1), m.get(2)], [{ i: 0, n: 2 }, { i: 1, n: 2 }], "no se apilan de la que empieza antes a la de después");
  assert.equal(P6.CARA.vigenciaCorta(ahora, "2026-10-24"), "hasta 15 nov");
  assert.equal(P6.CARA.vigenciaCorta(despues, "2026-10-24"), "desde 16 nov");
  // Fechas que se cruzan: es un choque (rojo), no un lugar compartido.
  const cruzada = piezaR(3, { poligonos: [cuad], terminos: [terminoR(3, "2026-10-01", "2027-01-31")] });
  assert.equal(P6.CARA.lugaresCompartidos([ahora, cruzada], cara, "2026-10-24").size, 0);
  // Sin pisarse, tampoco.
  const alLado = piezaR(4, { poligonos: [[[0.7, 0.1], [0.9, 0.1], [0.9, 0.9], [0.7, 0.9]]], terminos: [terminoR(4, "2026-11-16", "2027-02-28")] });
  assert.equal(P6.CARA.lugaresCompartidos([ahora, alLado], cara, "2026-10-24").size, 0);
  const t = codigo6b("CaraDePiezas");
  assert.match(t, /const futura = real && !p\.rigeHoy;/);
  assert.match(t, /const linea3 = o\.rotulo === undefined && \(apilado \|\| futura\) \? vigenciaCorta\(p, hoy\) : null;/);
  // La pieza sabe si rige hoy (con la cuenta del día de las reglas).
  assert.match(sinComentTs2(fuente(`${DIST}/piezasDeLaCara.ts`)), /rigeHoy: terminos\.some\(\(x\) => cuentaElDia\(x, datos\.hoy, datos\.hoy\)\),/);
});

await prueba("piezas LISAS; puntos sólo si dos marcas comparten el tono, y el bloque de la lista los repite (ejecutado)", () => {
  const Z = P6.PZC.patronDe;
  const a = { spaceId: 1, tono: "var(--marca-1)", estampa: { tono: "#1A67C2", textura: "rayado45" } };
  const b = { spaceId: 2, tono: "var(--marca-2)", estampa: { tono: "#A4338F", textura: "lleno" } };
  assert.equal(Z(a, [a, b]), "lisa", "una marca con tono propio va rayada o con puntos");
  const c = { spaceId: 3, tono: "var(--marca-1)", estampa: { tono: "#1A67C2", textura: "lleno" } };
  assert.equal(Z(a, [a, b, c]), "puntos");
  assert.equal(Z(c, [a, b, c]), "lisa");
  assert.equal(Z({ ...a, estampa: { tono: "#1A67C2", textura: "rayado135" } }, [a, c]), "puntos_grandes");
  const panel = codigo6b("DistribuirCara");
  assert.match(panel, /<Bloque p=\{p\} patron=\{patronDe\(p, piezas\)\} \/>/, "el bloque de la lista no repite el patrón de la pieza");
  assert.ok(!/repeating-linear-gradient/.test(panel), "el bloque de la lista va rayado");
});

await prueba("nombre accesible de cada pieza y anuncio al moverla («Café A, 30 %, ubicada»; «de 0,25 a 0,79 m desde la izquierda») (ejecutado)", () => {
  assert.equal(P6.CARA.nombreAccesible({ corto: "Café A", pb: 3000, estado: "ubicada", dibujado: 3000 }, null), "Café A, 30 %, ubicada");
  assert.equal(P6.CARA.nombreAccesible({ corto: "Café A", pb: 3000, estado: "sobra", dibujado: 4242 }, null), "Café A, 30 %, sobra 12,42 %");
  assert.equal(P6.CARA.nombreAccesible({ corto: "Café A", pb: 3000, estado: "choca", dibujado: 3000 }, "Aseo"), "Café A, 30 %, pisa a Aseo");
  assert.equal(P6.CARA.dondeQuedo({ u0: 0.25 / 1.8, u1: 0.79 / 1.8, v0: 0, v1: 1 }, 1.8), "de 0,25 a 0,79 m desde la izquierda");
  const panel = codigo6b("DistribuirCara");
  // Sin arrastrar: en el menú de cada pieza, y la pista (aria-live) lo anuncia.
  for (const x of ["Ponerla en el primer hueco libre", "A la izquierda", "A la derecha"]) assert.ok(panel.includes(x), `falta «${x}» en el menú de la pieza`);
  assert.match(panel, /ubicarSinArrastrar\(cara, p\.pb, p\.forma, ocupadosPara\(p\.spaceId, piezas, hoy\), p\.estado === "sin_ubicar" \? null : p\.rect, como\)/);
  assert.match(panel, /aria-live="polite" data-pista/);
  // La pista dice que en una pantalla angosta alcanza con tocar (sin arrastrar).
  assert.match(panel, /o tocala en la lista y después tocá lo verde/);
});

await prueba("«A mano» ya hecha: elegirla NO entra a dibujar; «Rehacer a mano» sí; Enter cierra con el MISMO ajuste que el primer punto (ejecutado)", () => {
  const panel = codigo6b("DistribuirCara");
  const i = panel.indexOf("const elegirPieza = (s: number) => {");
  const cuerpo = panel.slice(i, panel.indexOf("\n  };", i));
  assert.match(cuerpo, /if \(p\?\.forma === "a_mano" && p\.poligonos\.length === 0 && puedeEditar\) empezarAMano\(p\);\s*else salirDelTrazo\(\);/,
    "elegir una pieza a mano ya hecha la deja en modo trazo");
  assert.ok(!/elegirHerramienta", herramienta: "poligono"/.test(cuerpo), "elegirPieza entra a dibujar");
  assert.match(panel, /onClick=\{\(\) => empezarAMano\(piezaElegida\)\} data-rehacer-a-mano>/);
  assert.match(panel, /data-dejar-como-estaba>/);
  // Las pistas por estado: nunca «Tocá un punto…» con la forma ya cerrada.
  const A = P6.PANEL.pistaDeAMano;
  for (const estado of ["ubicada", "sobra", "falta", "choca", "rehacer"]) assert.ok(!/Tocá un punto/.test(A({ corto: "Café A", estado, pb: 3000, dibujado: 4242 })), `${estado}: dice «Tocá un punto»`);
  assert.equal(A({ corto: "Café A", estado: "sobra", pb: 3000, dibujado: 4242 }), "Café A se pasa 12,42 %: tocá «Achicar a 30 %» o «Rehacer a mano».");
  assert.equal(A({ corto: "Café A", estado: "ubicada", pb: 3000, dibujado: 3000 }), "Café A está hecha a mano, con 30 % justo. Para cambiarla, «Rehacer a mano».");
  assert.match(P6.PANEL.pistaDelTrazo(0, false), /^Tocá un punto por cada esquina/);
  assert.match(P6.PANEL.pistaDelTrazo(4, false), /Enter para cerrar la forma\.$/);
  assert.match(P6.PANEL.pistaDelTrazo(0, true), /^Rehacela/);
  // Enter: el oyente cierra con `alCerrarAMano` (el mismo que tocar el primer punto), no con el reductor pelado.
  enElModo({ herramienta: "poligono", activa: 7, seleccion: null, trazo: [[0.1, 0.1], [0.3, 0.1], [0.3, 0.3]] });
  let cierres = 0;
  P6.PZC.alCerrarAMano.actual = () => { cierres++; };
  const antes = P6.useDistribucionStore.getState().edicion;
  const ev = atajo(tecla("Enter", EN_LIENZO));
  assert.deepEqual([cierres, ev.cortada, ev.prevenida], [1, true, true], "Enter no cerró con el ajuste solo");
  assert.equal(P6.useDistribucionStore.getState().edicion, antes, "Enter cerró por el reductor además del ajuste");
  P6.PZC.alCerrarAMano.actual = null;
  atajo(tecla("Enter", EN_LIENZO));
  assert.equal(P6.useDistribucionStore.getState().edicion.trazo, null, "sin la cara montada, Enter no cierra como siempre");
});

await prueba("el ajuste solo (±3 %): «Deshacer el ajuste» visible y la pista que vence al cambiar la cara (deshacer, rehacer, otra pieza) (ejecutado)", () => {
  const panel = codigo6b("DistribuirCara");
  assert.match(panel, /const pista = pistaGuardada && pistaGuardada\.zonas === edicion\.zonas \? pistaGuardada\.texto : null;/, "la pista vieja sigue después de deshacer");
  assert.match(panel, /const ajusteVigente = ajuste && ajuste\.zonas === edicion\.zonas \? ajuste : null;/);
  assert.match(panel, /\{ajusteVigente && puedeEditar && \(\s*<button type="button" className=\{BOTON\} data-deshacer-ajuste\s*onClick=\{\(\) => \{ st\(\)\.despachar\(\{ tipo: "deshacer" \}\); ui\(\)\.anotarAjuste\(null\); \}\}>\s*<Undo2 \{\.\.\.ICONO\} \/>Deshacer el ajuste/);
  // El store anota las zonas del momento en que se dijo.
  enElModo();
  const ui = P6.PZC.usePiezasUI.getState();
  ui.decir("algo");
  ui.anotarAjuste(7);
  const zonas = P6.useDistribucionStore.getState().edicion.zonas;
  assert.equal(P6.PZC.usePiezasUI.getState().pista.zonas, zonas);
  assert.equal(P6.PZC.usePiezasUI.getState().ajuste.zonas, zonas);
  P6.useDistribucionStore.getState().despachar({ tipo: "ponerPiezas", piezas: [{ spaceId: 8, vertices: [] }] });
  assert.notEqual(P6.useDistribucionStore.getState().edicion.zonas, zonas, "la prueba no cambió la cara");
  ui.reiniciar();
});

await prueba("«Listo» con la cara guardada y sin cambios: apagado y «Guardada, sin cambios» (no crea otra versión ni otro «Confirmada»)", () => {
  const panel = codigo6b("DistribuirCara");
  assert.match(panel, /const guardadaSinCambios = !sucio && datos\?\.distribucion\?\.estado === "confirmada" && !datos\.distribucion\.borrador;/);
  assert.match(panel, /: guardadaSinCambios \? "Guardada, sin cambios\." *\n? *: null;/, "guardada y sin cambios no frena «Listo»");
  assert.match(panel, /\{guardando \? "Guardando…" : guardadaSinCambios \? "Guardada, sin cambios" : "Listo, guardar la cara"\}/);
});

await prueba("«Más»: el foco entra al abrir, flechas/Inicio/Fin entre los ítems, Esc lo cierra y vuelve a «Más» (ejecutado el oyente)", () => {
  const panel = codigo6b("DistribuirCara");
  assert.match(panel, /<div role="menu" aria-label="Más" data-menu-mas [^>]*\n?\s*onKeyDown=\{teclaDelMenu\}>/);
  assert.match(panel, /itemsDelMenu\(menuMas\.current\)\[0\]\?\.focus\(\);/, "al abrir «Más» el foco no entra");
  assert.match(panel, /menuAbierto\.cerrar = \(\) => \{ setMas\(false\); botonMas\.current\?\.focus\(\); \};/);
  for (const k of ['e.key === "ArrowDown"', 'e.key === "ArrowUp"', 'e.key === "Home"', 'e.key === "End"']) assert.ok(panel.includes(k), `«Más» no atiende ${k}`);
  // El oyente: Esc dentro de «Más» lo cierra y no despacha nada; las flechas le llegan al menú.
  enElModo();
  const EN_MENU = nodo("button", ["[data-menu-mas]", "[data-distribucion]"]);
  const antes = P6.useDistribucionStore.getState().edicion;
  const esc = atajo(tecla("Escape", EN_MENU));
  assert.deepEqual([esc.cortada, esc.prevenida], [true, true], "Esc en «Más» llega al editor");
  assert.equal(P6.useDistribucionStore.getState().edicion, antes, "Esc en «Más» soltó la pieza elegida");
  const flecha = atajo(tecla("ArrowDown", EN_MENU));
  assert.deepEqual([flecha.cortada, flecha.prevenida], [false, false], "la flecha no le llega al menú");
  const supr = atajo(tecla("Delete", EN_MENU));
  assert.equal(supr.cortada, true, "Supr en «Más» llega al editor (borraría el mueble)");
});

await prueba("menores: historial en palabras simples (ejecutado con lo que manda el servidor), «Sin lugar libre», íconos de 16, los hooks antes del return, «Centrar la cara»", () => {
  const n = P6.PANEL.nombresDelHistorial({ participaciones: [
    { space_id: 71, numero: 1, terminos: [{ id: 501, proveedor: { id: 1, nombre: "Snacks Norte" }, marca: "Papitas" }] },
    { space_id: 72, numero: 2, terminos: [{ id: 502, proveedor: { id: 2, nombre: "Dulces Sur" }, marca: "Chocolatina" }] },
  ] });
  const T = (e) => P6.PANEL.textoDelHistorial({ antes: null, despues: null, ...e }, n);
  const contrato = T({ accion: "participacion.contrato", participacion_id: 501,
    detalle: "Contrato · Participación 1 · 60 % · Snacks Norte (Papitas) · 2026-10-01→2026-11-15",
    despues: { puntos_basicos: 6000, desde: "2026-10-01", hasta: "2026-11-15", caduca: null, proveedor: "Snacks Norte", marca: "Papitas", estado: "contrato" } });
  assert.equal(contrato, "Se vendió el 60 % de la cara a Snacks Norte · Papitas, del 1 oct 2026 al 15 nov 2026.");
  const conf = T({ accion: "distribucion.confirmada", detalle: "Confirmada: 2 zonas de 2 participaciones",
    despues: { zonas: [{ participacion_space_id: 71 }, { participacion_space_id: 72 }], cuentas: {} } });
  assert.equal(conf, "Se guardó la cara: Snacks Norte · Papitas y Dulces Sur · Chocolatina quedaron ubicadas.");
  assert.equal(T({ accion: "distribucion.division", detalle: "GON-04 · cara B pasó a venderse por participación." }), "La cara pasó a venderse por partes, una por marca.");
  assert.equal(T({ accion: "participacion.vencida", participacion_id: 502, detalle: "Venció la participación 2." }), "Venció el contrato de Dulces Sur · Chocolatina.");
  assert.equal(T({ accion: "algo.nuevo", detalle: "Participación 3 · 2 zonas · 2026-10-24→2027-03-31" }), "una marca · 2 piezas · 24 oct 2026 al 31 mar 2027");
  for (const x of [contrato, conf]) assert.ok(!/\bzonas?\b|[Pp]articipaci[oó]n \d|\d{4}-\d{2}-\d{2}/.test(x), `jerga en el historial: ${x}`);
  // Las líneas guardan el texto del servidor (`detalle`) y muestran el llano (`texto`).
  const ls = P6.PANEL.lineasDelHistorial({ entradas: [{ id: 1, en: "2026-10-24T17:51:33+00:00", actor: "admin", tipo: "geometria", accion: "distribucion.descartada", detalle: "Borrador descartado", antes: null, despues: null }], derivados: [] }, n);
  assert.deepEqual([ls[0].detalle, ls[0].texto], ["Borrador descartado", "Se descartó el borrador."]);
  const panel = codigo6b("DistribuirCara"), cara = codigo6b("CaraDePiezas");
  // 0 % libre.
  assert.match(panel, /\{queda !== null && queda > 0 && \(/, "con 0 % la lista dice «Libre · 0 % sin vender»");
  assert.match(panel, /\{queda === 0 && <p[^>]*data-sin-lugar>Sin lugar libre/);
  // Íconos: lucide de 16 con trazo 1,75 (`ICONO`), nunca otra medida.
  for (const [nombre, t] of [["DistribuirCara", panel], ["CaraDePiezas", cara]]) {
    assert.ok(!/size=\{(?!16\b)\d+\}/.test(t), `${nombre}: un ícono que no es de 16`);
  }
  // Los hooks, todos antes del return temprano (`if (!activa)`).
  const ret = panel.indexOf("if (!activa) {\n    return (");
  assert.ok(ret > 0);
  const despues = panel.slice(ret, panel.indexOf("\nexport default", ret) > 0 ? panel.indexOf("\nexport default", ret) : undefined);
  assert.ok(!/\buse(Memo|State|Effect|Ref|Callback|DistribucionStore|PiezasUI|FixtureStore)\(/.test(despues.slice(0, despues.indexOf("\n}\n"))), "un hook después del return temprano");
  // «De frente» en la cara B miraba de tres cuartos (el pasillo no deja): dice lo que hace.
  assert.match(panel, /data-encuadrar-cara><Crosshair \{\.\.\.ICONO\} \/>Centrar la cara \{activa\.cara\}<\/button>/);
  assert.ok(!/>De frente</.test(panel), "el botón vuelve a prometer «De frente»");
});

console.log(`\n${hechas} pruebas de distribución en verde`);
