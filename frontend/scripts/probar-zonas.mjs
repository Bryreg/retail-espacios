/**
 * Pruebas de la geometría de las zonas (`src/utils/zonasGeometria.ts`).
 *   npm run probar:zonas
 *
 * ── Por qué existe este archivo ──────────────────────────────────────────────
 *
 * Una cara se vende por participación: el 25 % para una marca, el 30 % para
 * otra, y cada una se dibuja como zonas sobre la cara. Lo dibujado se cuenta
 * en puntos básicos (10 000 = la cara entera) con la MISMA cuenta en dos
 * lugares: acá, mientras la dueña dibuja, y en
 * `backend/app/services/zonas_geometria.py`, que es el que acepta o rechaza al
 * confirmar. Dos cuentas escritas a mano terminan dando distinto, y en el filo
 * del redondeo una zona pasaría en la pantalla y rebotaría en el servidor. Por
 * eso:
 *
 *   · **Los mismos casos en los dos lados** (`casos/zonas.json`, que también
 *     corre `tests/test_participaciones_geometria.py`): áreas, intersecciones,
 *     validación, pb dibujados, la medición de una distribución y los topes,
 *     todos con la cuenta hecha a mano.
 *   · **Bit a bit** (`exactos`): el número que da este lado, congelado; Python
 *     tiene que dar exactamente ése. Si alguien cambia el orden de una suma de
 *     un solo lado, se entera acá o allá.
 *   · **Lo que se pinta es lo que cuenta**: los trapecios con que el 3D y el
 *     lienzo rellenan las zonas suman exactamente el área, y ninguno cae sobre
 *     una exclusión.
 *   · **Identidades**: |A∪B| + |A∩B| = |A| + |B| y, para un polígono simple,
 *     el área es la del shoelace.
 *   · **El peor caso es rápido**: 240 vértices de estrellas que se cruzan.
 *
 * Y el editor de zonas (`src/utils/edicionDeZonas.ts`), que es un reductor
 * puro: dibujar, mover, escalar, borrar, deshacer (un arrastre entero es UN
 * paso, 100 pasos), «Mirar» que no edita, las teclas (Esc nunca saca del
 * modo), el imán, la fusión de tres vías ante `version_vieja` y «Ajustar al
 * contratado», cuyas salidas de `casos/zonas.json` (`ajustar`) se exigen
 * exactas acá y por debajo del tope de los dos lados.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = join(aqui, "..");
const leer = (p) => readFileSync(p, "utf8");
const CASOS = JSON.parse(leer(join(aqui, "casos", "zonas.json")));
const SUPERFICIES = JSON.parse(leer(join(aqui, "casos", "superficies.json")));
const TOL = CASOS.tolerancia;

let hechas = 0;
const prueba = async (n, fn) => {
  try { await fn(); hechas++; console.log("  ok   " + n); }
  catch (e) { console.error("  FALLA " + n + "\n         " + e.message.split("\n").join("\n         ")); process.exitCode = 1; }
};

const r = await build({
  stdin: { contents: 'export * from "./src/utils/zonasGeometria.ts";', resolveDir: raiz, loader: "ts" },
  bundle: true, write: false, format: "esm", platform: "neutral", logLevel: "silent",
});
const G = await import("data:text/javascript;base64," + Buffer.from(r.outputFiles[0].text).toString("base64"));
const rE = await build({
  stdin: { contents: 'export * from "./src/utils/edicionDeZonas.ts";', resolveDir: raiz, loader: "ts" },
  bundle: true, write: false, format: "esm", platform: "neutral", logLevel: "silent",
});
const E = await import("data:text/javascript;base64," + Buffer.from(rE.outputFiles[0].text).toString("base64"));

// ── Lo que los casos nombran por referencia ──────────────────────────────────
const superficiePorNombre = Object.fromEntries(SUPERFICIES.casos.map((c) => [c.nombre, c.superficie]));
const superficieDe = (ref) => {
  const s = superficiePorNombre[ref.slice("superficie:".length)];
  assert.ok(s && typeof s === "object", `«${ref}» no es una superficie de casos/superficies.json`);
  return s;
};
const exclusionesDe = (e) => (e === "peor" ? CASOS.peor.exclusiones : typeof e === "string" ? superficieDe(e).exclusiones : e);
const poligonosDe = (p) => (p === "peor:a" ? CASOS.peor.a : p === "peor:b" ? CASOS.peor.b : p);
const circulo = (n) => Array.from({ length: n }, (_, k) => [0.5 + 0.4 * Math.cos(2 * Math.PI * k / n), 0.5 + 0.4 * Math.sin(2 * Math.PI * k / n)]);
const verticesDe = (v) => (typeof v === "string" && v.startsWith("circulo:") ? circulo(Number(v.slice(8))) : v);
const cerca = (a, b, tol, quien) => assert.ok(Math.abs(a - b) <= tol, `${quien}: ${a} y no ${b}`);

/** Lo que suman los trapecios (shoelace de cada uno). */
const areaDeTrapecios = (T) => {
  let s = 0;
  for (const t of T) s += Math.abs(G.areaFirmada(t));
  return s;
};
/** Ningún trapecio cae sobre una exclusión (su centro no está adentro). */
const fueraDeLasExclusiones = (T, E, quien) => {
  for (const t of T) {
    let cu = 0, cv = 0;
    for (const [u, v] of t) { cu += u / 4; cv += v / 4; }
    for (const e of E) {
      assert.ok(!(e.u0 < cu && cu < e.u1 && e.v0 < cv && cv < e.v1) || Math.abs(G.areaFirmada(t)) < 1e-15,
        `${quien}: se pinta sobre «${e.por}» en (${cu}, ${cv})`);
    }
  }
};

/** Adentro o sobre el borde de un polígono (tolerancia en u,v). */
const adentroOBorde = ([x, y], p, tol) => {
  let dentro = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [ax, ay] = p[j], [bx, by] = p[i];
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0;
    if (Math.hypot(x - (ax + t * dx), y - (ay + t * dy)) <= tol) return true;
    if ((ay > y) !== (by > y) && x < ax + (y - ay) * dx / dy) dentro = !dentro;
  }
  return dentro;
};
/** Cada esquina de cada trapecio cae en la región que se pinta: en la cara,
 *  en alguna zona de P (y de Q) y fuera del interior de las exclusiones. La
 *  suma de áreas sola no alcanza: los rectángulos a la altura del punto medio
 *  de cada franja suman lo mismo y pintan fuera de las zonas inclinadas. */
const trapeciosEnSuLugar = (T, P, E, Q, quien) => {
  const tol = 1e-9;
  for (const t of T) {
    for (const c of t) {
      const [u, v] = c;
      assert.ok(u >= -tol && u <= 1 + tol && v >= -tol && v <= 1 + tol, `${quien}: una esquina fuera de la cara (${u}, ${v})`);
      assert.ok(P.some((p) => adentroOBorde(c, p, tol)), `${quien}: una esquina fuera de las zonas (${u}, ${v})`);
      if (Q) assert.ok(Q.some((p) => adentroOBorde(c, p, tol)), `${quien}: una esquina fuera de la otra participación (${u}, ${v})`);
      for (const e of E) {
        assert.ok(!(e.u0 + tol < u && u < e.u1 - tol && e.v0 + tol < v && v < e.v1 - tol), `${quien}: una esquina adentro de «${e.por}» (${u}, ${v})`);
      }
    }
  }
};

console.log("zonas · los casos compartidos con el servidor");

await prueba(`área de la unión dentro de la cara (${CASOS.area.length} casos)`, () => {
  for (const c of CASOS.area) {
    const E = exclusionesDe(c.exclusiones);
    const a = G.areaCubierta(c.zonas, E);
    cerca(a, c.area, TOL, c.nombre);
    const T = G.trapecios(c.zonas, E);
    cerca(areaDeTrapecios(T), a, 1e-12, `${c.nombre}: los trapecios`);
    fueraDeLasExclusiones(T, E, c.nombre);
    trapeciosEnSuLugar(T, c.zonas, E, undefined, c.nombre);
  }
});

await prueba(`lo que se pisan dos participaciones (${CASOS.interseccion.length} casos)`, () => {
  for (const c of CASOS.interseccion) {
    const E = exclusionesDe(c.exclusiones);
    const a = G.areaCubierta(c.a, E, c.b);
    cerca(a, c.area, TOL, c.nombre);
    cerca(G.areaCubierta(c.b, E, c.a), a, 1e-12, `${c.nombre}: al revés`);
    const T = G.trapecios(c.a, E, c.b);
    cerca(areaDeTrapecios(T), a, 1e-12, `${c.nombre}: los trapecios`);
    trapeciosEnSuLugar(T, c.a, E, c.b, c.nombre);
  }
});

await prueba(`validación de una zona (${CASOS.validar.length} casos)`, () => {
  for (const c of CASOS.validar) {
    const v = G.validarZona(verticesDe(c.vertices), c.ancho, c.alto);
    assert.equal(v.codigo, c.codigo, c.nombre);
    if ("limpios" in c) assert.deepEqual(v.vertices, c.limpios, `${c.nombre}: los vértices limpios`);
    if (v.codigo === null) {
      assert.ok(G.esSimple(v.vertices), `${c.nombre}: lo limpio no es simple`);
      assert.ok(G.areaFirmada(v.vertices) > 0, `${c.nombre}: lo limpio no es antihorario`);
      assert.deepEqual(G.limpiar(v.vertices), v.vertices, `${c.nombre}: limpiar lo limpio lo cambia`);
      assert.deepEqual(G.limpiar(verticesDe(c.vertices)), v.vertices, `${c.nombre}: limpiar no da lo mismo que validar`);
    }
  }
});

await prueba(`pb dibujados (${CASOS.dibujado.length} casos)`, () => {
  for (const c of CASOS.dibujado) assert.equal(G.dibujadoPb(c.zonas, exclusionesDe(c.exclusiones)), c.pb, c.nombre);
});

await prueba(`medir una distribución sin términos (${CASOS.medir.length} casos)`, () => {
  for (const c of CASOS.medir) {
    const s = typeof c.superficie === "string" ? superficieDe(c.superficie) : c.superficie;
    const m = G.medir(c.zonas.map((z) => ({ participacionSpaceId: z.s, vertices: z.vertices })),
      { exclusiones: s.exclusiones, ancho: s.ancho, alto: s.alto });
    assert.deepEqual(m.validaciones.map((v) => v.codigo), c.codigos, `${c.nombre}: los códigos`);
    assert.deepEqual(m.validaciones.map((v) => v.k), c.zonas.map((_, k) => k), `${c.nombre}: k no es el índice enviado`);
    assert.deepEqual(Object.fromEntries([...m.dibujadoPb].map(([k, v]) => [String(k), v])), c.dibujado, `${c.nombre}: el dibujado`);
    assert.deepEqual([...m.dibujadoPb.keys()], [...m.dibujadoPb.keys()].sort((a, b) => a - b), `${c.nombre}: el dibujado no va por id`);
    assert.equal(m.pisadas.length, c.pisadas.length, `${c.nombre}: los pares medidos`);
    m.pisadas.forEach((p, i) => {
      assert.deepEqual([p.s1, p.s2], c.pisadas[i].slice(0, 2), `${c.nombre}: el par ${i}`);
      cerca(p.m2, c.pisadas[i][2], TOL, `${c.nombre}: los m² del par ${i}`);
    });
    assert.deepEqual(m.sinSuperficieUtil, c.sin_superficie_util, `${c.nombre}: sin superficie útil`);
    cerca(m.areaUtil, G.areaUtil(s.exclusiones), 0, `${c.nombre}: el área útil`);
  }
});

await prueba(`los topes de una capa (${CASOS.topes.length} casos)`, () => {
  for (const c of CASOS.topes) {
    const zonas = c.vertices_por_zona.map((n) => ({ vertices: n === "malformada" ? "x" : Array.from({ length: n }, () => [0, 0]) }));
    assert.equal(G.dentroDeLosTopes(zonas), c.entra, c.nombre);
  }
  assert.deepEqual([G.MIN_VERTICES, G.MAX_VERTICES, G.MAX_ZONAS_POR_CARA, G.MAX_VERTICES_POR_CARA, G.AREA_MINIMA_M2, G.CUANTO],
    [3, 24, 60, 240, 1e-4, 1e-6], "los topes no son los del diseño (§3.1)");
});

await prueba(`bit a bit: el número que Python tiene que dar igual (${CASOS.exactos.length} casos)`, () => {
  for (const c of CASOS.exactos) {
    const P = poligonosDe(c.P), E = exclusionesDe(c.E), Q = c.Q !== undefined ? poligonosDe(c.Q) : undefined;
    const a = G.areaCubierta(P, E, Q);
    assert.ok(Object.is(a, c.area), `${c.nombre}: ${a} y no ${c.area} (cambió el orden de una cuenta)`);
    const T = G.trapecios(P, E, Q);
    cerca(areaDeTrapecios(T), a, 1e-12, `${c.nombre}: los trapecios`);
    trapeciosEnSuLugar(T, P, E, Q, c.nombre);
  }
});

await prueba("ajustar al contratado: ninguna salida pasa su tope (si el paso del editor ya las cargó)", () => {
  for (const c of CASOS.ajustar ?? []) {
    assert.ok(G.dibujadoPb(c.salida, exclusionesDe(c.exclusiones)) <= c.tope, `${c.nombre}: la salida pasa el tope`);
  }
});

console.log("zonas · identidades y propiedades");

// Polígonos SIMPLES al azar (como los que deja pasar `validarZona`; con uno
// que se cruza consigo mismo el barrido no es exacto, y no tiene por qué:
// nunca le llega uno): estrellados alrededor de un centro, ángulos ordenados,
// adentro de la cara y cuantizados. Generador fijo: la prueba no cambia de
// corrida en corrida.
let semilla = 20261017;
const rnd = () => { semilla = (semilla * 16807) % 2147483647; return semilla / 2147483647; };
const alAzar = () => {
  for (;;) {
    const n = 3 + Math.floor(rnd() * 10);
    const cx = 0.3 + 0.4 * rnd(), cy = 0.3 + 0.4 * rnd();
    const angs = Array.from({ length: n }, () => rnd() * 2 * Math.PI).sort((a, b) => a - b);
    const p = G.limpiar(angs.map((t) => {
      const rr = 0.03 + 0.26 * rnd();
      return [cx + rr * Math.cos(t), cy + rr * Math.sin(t)];
    }));
    if (G.esSimple(p)) return p;
  }
};

await prueba("|A∪B| + |A∩B| = |A| + |B| en 300 pares al azar, con y sin exclusiones", () => {
  const E = superficieDe("superficie:gondola-doble-090").exclusiones;
  for (let i = 0; i < 300; i++) {
    const A = [alAzar(), ...(rnd() < 0.5 ? [alAzar()] : [])];
    const B = [alAzar(), ...(rnd() < 0.5 ? [alAzar()] : [])];
    const Ex = i % 2 ? E : [];
    const suma = G.areaCubierta(A, Ex) + G.areaCubierta(B, Ex);
    const otra = G.areaCubierta([...A, ...B], Ex) + G.areaCubierta(A, Ex, B);
    cerca(otra, suma, 1e-12, `par ${i}`);
  }
});

await prueba("un polígono simple solo: su área es la del shoelace; con exclusiones, nunca más", () => {
  const E = superficieDe("superficie:punta-090").exclusiones;
  for (let i = 0; i < 200; i++) {
    const p = alAzar();
    cerca(G.areaCubierta([p]), Math.abs(G.areaFirmada(p)), 1e-12, `polígono ${i}`);
    assert.ok(G.areaCubierta([p], E) <= G.areaCubierta([p]) + 1e-15, `polígono ${i}: las exclusiones suman`);
  }
});

await prueba("el área útil es la cara menos lo excluido cuando las exclusiones no se pisan", () => {
  for (const c of SUPERFICIES.casos) {
    const s = c.superficie;
    if (!s || typeof s !== "object") continue;
    const E = s.exclusiones;
    let pisan = false;
    for (let i = 0; i < E.length; i++) for (let j = i + 1; j < E.length; j++) {
      if (E[i].u0 < E[j].u1 && E[j].u0 < E[i].u1 && E[i].v0 < E[j].v1 && E[j].v0 < E[i].v1) pisan = true;
    }
    if (pisan) continue;
    let resta = 1;
    for (const e of E) resta -= (e.u1 - e.u0) * (e.v1 - e.v0);
    cerca(G.areaUtil(E), resta, 1e-12, c.nombre);
  }
});

await prueba("una zona válida no cambia al validarla de nuevo, y la horaria guarda el primer vértice", () => {
  const h = [[0.2, 0.2], [0.2, 0.6], [0.7, 0.6], [0.7, 0.2]];
  const v = G.validarZona(h, 1, 1);
  assert.equal(v.codigo, null);
  assert.deepEqual(v.vertices[0], h[0]);
  assert.deepEqual(v.vertices, [h[0], h[3], h[2], h[1]]);
  assert.deepEqual(G.validarZona(v.vertices, 1, 1), v);
  assert.deepEqual(G.cajas([v.vertices, [[0.1, 0.9], [0.3, 0.9], [0.3, 0.95]]]), [0.1, 0.2, 0.7, 0.95]);
});

await prueba("las zonas de la misma participación que se pisan se pintan una vez", () => {
  const z = [[[0, 0], [0.5, 0], [0.5, 0.5], [0, 0.5]], [[0.25, 0.25], [0.75, 0.25], [0.75, 0.75], [0.25, 0.75]]];
  const T = G.trapecios(z, []);
  // Ningún par de trapecios se pisa: sus áreas suman la unión, no la suma.
  cerca(areaDeTrapecios(T), 0.4375, 1e-12, "la unión");
  assert.ok(areaDeTrapecios(T) < 0.5 - 1e-6, "se pintó dos veces lo que se pisa");
});

console.log("zonas · rapidez y determinismo");

await prueba("el peor caso (240 vértices de estrellas que se cruzan, zócalo y parante) es rápido", () => {
  const { a, b, exclusiones } = CASOS.peor;
  let total = 0;
  for (const p of [...a, ...b]) total += p.length;
  assert.equal(total, G.MAX_VERTICES_POR_CARA, "el peor caso no tiene los 240 vértices del tope");
  let t = performance.now();
  G.areaCubierta(a, exclusiones, b);
  const inter = performance.now() - t;
  t = performance.now();
  G.medir([...a.map((v) => ({ participacionSpaceId: 1, vertices: v })), ...b.map((v) => ({ participacionSpaceId: 2, vertices: v }))],
    { exclusiones, ancho: 1, alto: 1 });
  const med = performance.now() - t;
  console.log(`         intersección ${inter.toFixed(0)} ms · medir la distribución entera ${med.toFixed(0)} ms`);
  assert.ok(inter < 1000 && med < 2000, "la geometría del peor caso tarda demasiado");
});

await prueba("las sumas de los dos gemelos son bucles explícitos (nada de reduce, sum ni fsum)", () => {
  const sinComent = (t) => t.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, (m, p1) => p1);
  const ts = sinComent(leer(join(raiz, "src", "utils", "zonasGeometria.ts")));
  assert.ok(!/\.reduce\s*\(/.test(ts), "zonasGeometria.ts suma con reduce");
  assert.ok(!/Math\.(round|fround|hypot)\s*\(/.test(ts), "zonasGeometria.ts redondea con otra cuenta que floor(x + 0.5)");
  const py = leer(join(raiz, "..", "backend", "app", "services", "zonas_geometria.py"))
    .replace(/"""[\s\S]*?"""/g, " ").replace(/#[^\n]*/g, " ");
  assert.ok(!/(^|[^\w.])(sum|fsum|round)\s*\(/m.test(py), "zonas_geometria.py suma con sum/fsum o redondea con round");
  // La de arriba no ve `math.fsum(` (el punto la deja pasar), que es como se
  // escribe: ésta sí.
  assert.ok(!/\bf?sum\s*\(/.test(py), "zonas_geometria.py suma con math.fsum o sum");
  assert.ok(!/^\s*(from app|import app)/m.test(py), "zonas_geometria.py importa algo de la app: tiene que ser pura");
});

console.log("zonas · «Ajustar al contratado» (casos compartidos)");

await prueba(`ajustar al contratado: la salida revisada a mano, exacta, y por debajo del tope (${(CASOS.ajustar ?? []).length} casos)`, () => {
  assert.ok((CASOS.ajustar ?? []).length >= 3, "faltan los casos `ajustar` en casos/zonas.json");
  for (const c of CASOS.ajustar) {
    const Ex = exclusionesDe(c.exclusiones);
    assert.ok(typeof c.revisado === "string" && c.revisado.length > 20, `${c.nombre}: la salida no dice cómo se revisó`);
    assert.ok(G.dibujadoPb(c.zonas, Ex) > c.tope, `${c.nombre}: la entrada ya no pasaba el tope (el caso no prueba nada)`);
    const salida = E.ajustarAlContratado(c.zonas, Ex, c.tope, G.areaUtil(Ex), c.otras ?? [], c.cara);
    assert.deepEqual(salida, c.salida, `${c.nombre}: la salida cambió`);
    assert.ok(G.dibujadoPb(salida, Ex) <= c.tope, `${c.nombre}: pasa el tope`);
    // El crudo, al menos medio pb lejos del filo donde floor(x + 0.5) da tope + 1.
    assert.ok(10000 * G.areaCubierta(salida, Ex) / G.areaUtil(Ex) <= c.tope, `${c.nombre}: el crudo pasa el tope`);
    for (const z of salida) assert.equal(G.validarZona(z, c.cara?.ancho ?? 1, c.cara?.alto ?? 1).codigo, null, `${c.nombre}: una zona quedó inválida`);
    for (const q of (c.otras ?? []).flat()) {
      assert.ok(G.areaCubierta(salida, Ex, [q]) * (c.cara?.ancho ?? 1) * (c.cara?.alto ?? 1) <= G.AREA_MINIMA_M2 / 2, `${c.nombre}: pisa a la otra`);
    }
  }
});

console.log("zonas · el editor (reductor puro)");

const ini = (extra = {}) => ({ ...E.estadoInicial(), medidas: { ancho: 1, alto: 1 }, ...extra });
const hacer = (e, ...acciones) => acciones.reduce((x, a) => E.reducir(x, a), e);
const cuadrado = (u0, v0, u1, v1) => [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
const zona = (clave, s, vertices) => ({ clave, participacionSpaceId: s, vertices });
const conZonas = (zonas, extra = {}) => ini({ zonas, base: zonas, ...extra });

await prueba("dibujar un rectángulo: con la participación activa, arrastrando; queda elegida, antihoraria y es UN paso", () => {
  let e = hacer(ini(), { tipo: "elegirActiva", spaceId: 7 }, { tipo: "elegirHerramienta", herramienta: "rectangulo" });
  assert.equal(e.herramienta, "rectangulo");
  e = hacer(e, { tipo: "empezarTrazo", punto: [0.6, 0.7] }, { tipo: "estirarTrazo", punto: [0.2, 0.1] }, { tipo: "estirarTrazo", punto: [0.1, 0.2] });
  assert.deepEqual(e.trazo, [[0.6, 0.7], [0.1, 0.2]]);
  e = E.reducir(e, { tipo: "cerrarTrazo" });
  assert.equal(e.zonas.length, 1);
  assert.deepEqual(e.zonas[0].vertices, cuadrado(0.1, 0.2, 0.6, 0.7));
  assert.equal(e.zonas[0].participacionSpaceId, 7);
  assert.ok(G.areaFirmada(e.zonas[0].vertices) > 0, "no quedó antihoraria");
  assert.deepEqual(e.seleccion, { zona: e.zonas[0].clave, vertice: null });
  assert.equal(e.trazo, null);
  assert.equal(e.atras.length, 1);
  assert.equal(e.sucio, true);
  // Un clic sin arrastre no dibuja nada.
  const f = hacer(e, { tipo: "empezarTrazo", punto: [0.3, 0.3] }, { tipo: "cerrarTrazo" });
  assert.equal(f.zonas.length, 1);
  assert.equal(f.atras.length, 1);
  // Lo que se sale de la cara se recorta, y todo queda cuantizado a 1e-6.
  const g = hacer(e, { tipo: "empezarTrazo", punto: [-0.3, 0.5] }, { tipo: "estirarTrazo", punto: [0.12345678, 1.7] }, { tipo: "cerrarTrazo" });
  assert.deepEqual(g.zonas[1].vertices, cuadrado(0, 0.5, 0.123457, 1));
});

await prueba("dibujar un polígono: punto a punto, Retroceso saca el último, Enter cierra, Esc cancela; con menos de tres, no cierra", () => {
  let e = hacer(ini(), { tipo: "elegirActiva", spaceId: 3 }, { tipo: "elegirHerramienta", herramienta: "poligono" });
  e = hacer(e, { tipo: "agregarPunto", punto: [0.1, 0.1] }, { tipo: "agregarPunto", punto: [0.5, 0.1] }, { tipo: "agregarPunto", punto: [0.5, 0.1] });
  assert.equal(e.trazo.length, 2, "el doble clic repitió el punto");
  const corto = E.reducir(e, { tipo: "cerrarTrazo" });
  assert.equal(corto.zonas.length, 0);
  assert.equal(corto.aviso, E.AVISO_POCOS_PUNTOS);
  e = hacer(e, { tipo: "agregarPunto", punto: [0.9, 0.9] }, E.accionDeTecla(e, { key: "Backspace", ctrl: false, shift: false }));
  assert.deepEqual(e.trazo, [[0.1, 0.1], [0.5, 0.1]]);
  e = hacer(e, { tipo: "agregarPunto", punto: [0.5, 0.5] }, { tipo: "agregarPunto", punto: [0.1, 0.5] });
  const cerrar = E.accionDeTecla(e, { key: "Enter", ctrl: false, shift: false });
  assert.deepEqual(cerrar, { tipo: "cerrarTrazo" });
  const hecho = E.reducir(e, cerrar);
  assert.deepEqual(hecho.zonas[0].vertices, cuadrado(0.1, 0.1, 0.5, 0.5));
  // Esc con un trazo lo cancela, y no hace nada más.
  const cancel = E.accionDeTecla(e, { key: "Escape", ctrl: false, shift: false });
  assert.deepEqual(cancel, { tipo: "cancelarTrazo" });
  assert.equal(E.reducir(e, cancel).trazo, null);
  assert.equal(E.reducir(e, cancel).zonas.length, 0);
  // No pasa de 24 puntos.
  let largo = hacer(ini(), { tipo: "elegirActiva", spaceId: 3 }, { tipo: "elegirHerramienta", herramienta: "poligono" });
  for (let k = 0; k < 30; k++) largo = E.reducir(largo, { tipo: "agregarPunto", punto: [0.5 + 0.4 * Math.cos(k / 5), 0.5 + 0.4 * Math.sin(k / 5)] });
  assert.equal(largo.trazo.length, G.MAX_VERTICES);
  assert.equal(largo.aviso, E.AVISO_TOPE_DE_PUNTOS);
});

await prueba("sin participación activa no se dibuja: R y P no hacen nada y el trazo no empieza", () => {
  const e = ini();
  assert.equal(E.accionDeTecla(e, { key: "r", ctrl: false, shift: false }), null);
  assert.equal(E.accionDeTecla(e, { key: "P", ctrl: false, shift: false }), null);
  const h = E.reducir(e, { tipo: "elegirHerramienta", herramienta: "rectangulo" });
  assert.equal(h.herramienta, "seleccionar");
  assert.equal(h.aviso, E.AVISO_SIN_ACTIVA);
  // Si se saca la activa con una herramienta de dibujo, vuelve a Seleccionar.
  const d = hacer(e, { tipo: "elegirActiva", spaceId: 1 }, { tipo: "elegirHerramienta", herramienta: "poligono" }, { tipo: "elegirActiva", spaceId: null });
  assert.equal(d.herramienta, "seleccionar");
  assert.equal(E.reducir(d, { tipo: "agregarPunto", punto: [0.2, 0.2] }).trazo, null);
});

await prueba("mover una zona contra el borde no la deforma: el vector se recorta con su caja", () => {
  const z = [[0.7, 0.2], [0.9, 0.25], [0.85, 0.6], [0.75, 0.5]];
  const movida = E.trasladar(z, 0.5, -0.4);
  const [u0, v0, u1, v1] = G.cajas([movida]);
  assert.equal(u1, 1);
  assert.equal(v0, 0);
  // La forma es la misma: las diferencias entre vértices no cambian.
  for (let i = 1; i < z.length; i++) {
    cerca(movida[i][0] - movida[0][0], z[i][0] - z[0][0], 1e-6, `du ${i}`);
    cerca(movida[i][1] - movida[0][1], z[i][1] - z[0][1], 1e-6, `dv ${i}`);
  }
  assert.ok(u0 > 0 && v1 < 1);
  // Con un arrastre, `du/dv` cuentan desde el comienzo: ir y volver deja la zona donde estaba.
  let e = conZonas([zona("z1", 1, z)]);
  e = hacer(e, { tipo: "empezarArrastre" }, { tipo: "moverZona", clave: "z1", du: 0.5, dv: 0 }, { tipo: "moverZona", clave: "z1", du: 0, dv: 0 }, { tipo: "terminarArrastre" });
  assert.deepEqual(e.zonas[0].vertices, z);
  assert.equal(e.atras.length, 0, "un arrastre que vuelve al lugar apiló un paso");
});

await prueba("un arrastre de 50 movimientos es UN paso de deshacer (mover, vértice y escala)", () => {
  const base = conZonas([zona("z1", 1, cuadrado(0.2, 0.2, 0.4, 0.4)), zona("z2", 2, cuadrado(0.6, 0.6, 0.8, 0.8))]);
  for (const mover of [
    (k) => ({ tipo: "moverZona", clave: "z1", du: k * 0.004, dv: k * 0.002 }),
    (k) => ({ tipo: "moverVertice", clave: "z1", vertice: 2, punto: [0.4 + k * 0.003, 0.4 + k * 0.001] }),
    (k) => ({ tipo: "escalar", clave: "z1", manija: "ne", punto: [0.4 + k * 0.004, 0.4 + k * 0.004] }),
  ]) {
    let e = E.reducir(base, { tipo: "empezarArrastre" });
    for (let k = 1; k <= 50; k++) e = E.reducir(e, mover(k));
    assert.equal(e.atras.length, 0, "los movimientos apilan pasos");
    e = E.reducir(e, { tipo: "terminarArrastre" });
    assert.equal(e.atras.length, 1, "el arrastre no es un paso");
    assert.equal(e.arrastre, null);
    const atras = E.reducir(e, { tipo: "deshacer" });
    assert.deepEqual(atras.zonas, base.zonas, "deshacer no vuelve a antes del arrastre");
    assert.equal(atras.sucio, false);
    assert.deepEqual(E.reducir(atras, { tipo: "rehacer" }).zonas, e.zonas);
  }
});

await prueba("vértices: mover, insertar en un borde, borrar; un triángulo no pierde un punto", () => {
  let e = conZonas([zona("z1", 1, cuadrado(0.2, 0.2, 0.4, 0.4))]);
  e = E.reducir(e, { tipo: "insertarVertice", clave: "z1", despuesDe: 0, punto: [0.3, 0.2] });
  assert.equal(e.zonas[0].vertices.length, 5);
  assert.deepEqual(e.zonas[0].vertices[1], [0.3, 0.2]);
  assert.deepEqual(e.seleccion, { zona: "z1", vertice: 1 });
  e = E.reducir(e, { tipo: "moverVertice", clave: "z1", vertice: 1, punto: [0.3, -0.5] });
  assert.deepEqual(e.zonas[0].vertices[1], [0.3, 0], "el vértice se sale de la cara");
  const borrar = E.accionDeTecla(e, { key: "Delete", ctrl: false, shift: false });
  assert.deepEqual(borrar, { tipo: "borrarVertice", clave: "z1", vertice: 1 });
  e = E.reducir(e, borrar);
  assert.equal(e.zonas[0].vertices.length, 4);
  e = hacer(e, { tipo: "borrarVertice", clave: "z1", vertice: 0 });
  assert.equal(e.zonas[0].vertices.length, 3);
  const triangulo = E.reducir(e, { tipo: "borrarVertice", clave: "z1", vertice: 0 });
  assert.equal(triangulo.zonas, e.zonas, "el triángulo perdió un punto");
  assert.equal(triangulo.aviso, E.AVISO_TRIANGULO);
  // Sin un punto elegido, Supr borra la zona entera.
  const sinPunto = E.reducir(triangulo, { tipo: "seleccionar", zona: "z1" });
  const z = E.reducir(sinPunto, E.accionDeTecla(sinPunto, { key: "Delete", ctrl: false, shift: false }));
  assert.equal(z.zonas.length, 0);
  assert.equal(z.seleccion, null);
  // Una zona de 24 puntos no gana otro.
  const llena = conZonas([zona("z9", 1, Array.from({ length: 24 }, (_, k) => [0.5 + 0.3 * Math.cos(2 * Math.PI * k / 24), 0.5 + 0.3 * Math.sin(2 * Math.PI * k / 24)]))]);
  assert.equal(E.reducir(llena, { tipo: "insertarVertice", clave: "z9", despuesDe: 3, punto: [0.5, 0.5] }).zonas, llena.zonas);
});

await prueba("escalar: el lado opuesto queda fijo, Shift conserva la proporción, nunca se da vuelta ni sale de la cara", () => {
  const z = cuadrado(0.2, 0.2, 0.4, 0.3);
  assert.deepEqual(G.cajas([E.escalarZona(z, "e", [0.6, 0.9])]), [0.2, 0.2, 0.6, 0.3]);
  assert.deepEqual(G.cajas([E.escalarZona(z, "o", [0.1, 0.9])]), [0.1, 0.2, 0.4, 0.3]);
  assert.deepEqual(G.cajas([E.escalarZona(z, "n", [0.9, 0.5])]), [0.2, 0.2, 0.4, 0.5]);
  assert.deepEqual(G.cajas([E.escalarZona(z, "s", [0.9, 0])]), [0.2, 0, 0.4, 0.3]);
  // Pasar la manija al otro lado no la da vuelta: queda en el mínimo.
  const [u0, , u1] = G.cajas([E.escalarZona(z, "e", [0.05, 0.25])]);
  assert.ok(u1 > u0 && u0 === 0.2, "se dio vuelta");
  // Shift en una esquina: la misma proporción (ancho/alto = 2).
  const [a0, b0, a1, b1] = G.cajas([E.escalarZona(z, "ne", [0.8, 0.35], true)]);
  cerca((a1 - a0) / (b1 - b0), 2, 1e-5, "la proporción");
  // Y nunca sale de la cara, aunque la proporción lo pida.
  const [, , c1, d1] = G.cajas([E.escalarZona(z, "ne", [1, 1], true)]);
  assert.ok(c1 <= 1 && d1 <= 1);
});

await prueba("100 pasos de deshacer; rehacer se pierde al editar; deshacer de vuelta a lo cargado no queda sucio", () => {
  let e = hacer(ini(), { tipo: "elegirActiva", spaceId: 1 }, { tipo: "elegirHerramienta", herramienta: "rectangulo" });
  const pasos = [];
  for (let k = 0; k < 120; k++) {
    e = hacer(e, { tipo: "empezarTrazo", punto: [0.001 * k, 0] }, { tipo: "estirarTrazo", punto: [0.001 * k + 0.0011, 0.01] }, { tipo: "cerrarTrazo" });
    pasos.push(e.zonas);
  }
  assert.equal(e.atras.length, E.PASOS_DE_DESHACER);
  for (let k = 0; k < 100; k++) e = E.reducir(e, { tipo: "deshacer" });
  assert.equal(e.zonas.length, 20, "deshacer no volvió 100 pasos");
  assert.equal(E.reducir(e, { tipo: "deshacer" }), e, "deshizo más de 100");
  e = E.reducir(e, { tipo: "rehacer" });
  assert.equal(e.zonas.length, 21);
  e = E.reducir(e, { tipo: "borrarZona", clave: e.zonas[0].clave });
  assert.equal(e.adelante.length, 0, "editar no borró lo de rehacer");
  // De vuelta a lo cargado: no sucio.
  const cargado = E.reducir(ini(), { tipo: "cargar", zonas: [{ id: 5, participacion_space_id: 1, vertices: cuadrado(0.1, 0.1, 0.2, 0.2), orden: 0 }] });
  const editado = E.reducir(cargado, { tipo: "moverZona", clave: "z5", du: 0.1, dv: 0 });
  assert.equal(editado.sucio, true);
  assert.equal(E.reducir(editado, { tipo: "deshacer" }).sucio, false);
  const descartado = E.reducir(editado, { tipo: "descartarCambios" });
  assert.equal(descartado.sucio, false);
  assert.deepEqual(descartado.zonas, cargado.zonas);
  assert.equal(E.reducir(descartado, { tipo: "deshacer" }).sucio, true, "descartar no se puede deshacer");
});

await prueba("«Mirar» no edita: ninguna acción de edición cambia nada, y se puede elegir una zona para ver sus datos", () => {
  const z = conZonas([zona("z1", 1, cuadrado(0.2, 0.2, 0.4, 0.4))], { activa: 1, atras: [[]], adelante: [[]] });
  const m = E.reducir(z, { tipo: "elegirModo", modo: "mirar" });
  assert.equal(m.herramienta, "seleccionar");
  const editan = [
    { tipo: "empezarTrazo", punto: [0.5, 0.5] }, { tipo: "agregarPunto", punto: [0.5, 0.5] }, { tipo: "cerrarTrazo" },
    { tipo: "empezarArrastre" }, { tipo: "moverZona", clave: "z1", du: 0.1, dv: 0 }, { tipo: "empujar", dx: 0.01, dy: 0 },
    { tipo: "moverVertice", clave: "z1", vertice: 0, punto: [0, 0] }, { tipo: "escalar", clave: "z1", manija: "e", punto: [0.9, 0.9] },
    { tipo: "insertarVertice", clave: "z1", despuesDe: 0, punto: [0.3, 0.2] }, { tipo: "borrarVertice", clave: "z1", vertice: 0 },
    { tipo: "borrarZona", clave: "z1" }, { tipo: "deshacer" }, { tipo: "rehacer" }, { tipo: "descartarCambios" },
    { tipo: "ajustarZonas", spaceId: 1, vertices: [cuadrado(0, 0, 0.1, 0.1)] }, { tipo: "usarZonas", spaceId: 1, zonas: [] },
  ];
  for (const a of editan) assert.equal(E.reducir(m, a), m, `en Mirar, «${a.tipo}» cambió algo`);
  assert.equal(E.reducir(m, { tipo: "elegirHerramienta", herramienta: "rectangulo" }).herramienta, "seleccionar");
  const visto = E.reducir(m, { tipo: "seleccionar", zona: "z1", vertice: 2 });
  assert.deepEqual(visto.seleccion, { zona: "z1", vertice: null }, "en Mirar se eligió un vértice");
  for (const key of ["v", "r", "p", "Delete", "Backspace", "ArrowLeft", "Enter"]) {
    assert.equal(E.accionDeTecla(visto, { key, ctrl: false, shift: false }), null, `en Mirar, ${key} edita`);
  }
  assert.equal(E.accionDeTecla(visto, { key: "z", ctrl: true, shift: false }), null);
});

await prueba("las teclas: V/R/P/G, flechas (1 cm, Shift 10 cm), Supr/Retroceso, Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y; Esc NUNCA sale", () => {
  const t = (e, key, o = {}) => E.accionDeTecla(e, { key, ctrl: !!o.ctrl, shift: !!o.shift });
  const e = conZonas([zona("z1", 1, cuadrado(0.2, 0.2, 0.4, 0.4))], { activa: 1, medidas: { ancho: 2, alto: 0.5 } });
  assert.deepEqual(t(e, "v"), { tipo: "elegirHerramienta", herramienta: "seleccionar" });
  assert.deepEqual(t(e, "R"), { tipo: "elegirHerramienta", herramienta: "rectangulo" });
  assert.deepEqual(t(e, "p"), { tipo: "elegirHerramienta", herramienta: "poligono" });
  assert.deepEqual(t(e, "g"), { tipo: "alternarIman" });
  assert.deepEqual(t(e, "z", { ctrl: true }), { tipo: "deshacer" });
  assert.deepEqual(t(e, "Z", { ctrl: true, shift: true }), { tipo: "rehacer" });
  assert.deepEqual(t(e, "y", { ctrl: true }), { tipo: "rehacer" });
  assert.equal(t(e, "ArrowLeft"), null, "sin nada elegido, las flechas no son del editor");
  assert.equal(t(e, "f"), null, "F no es del editor (es del atajo del plano: la corta el panel)");
  const elegida = E.reducir(e, { tipo: "seleccionar", zona: "z1" });
  assert.deepEqual(t(elegida, "ArrowRight"), { tipo: "empujar", dx: 0.01, dy: 0 });
  assert.deepEqual(t(elegida, "ArrowUp", { shift: true }), { tipo: "empujar", dx: 0, dy: 0.1 });
  // 1 cm en una cara de 2 m de ancho es 0,005 en u; 10 cm en 0,5 m de alto, 0,2 en v.
  const movida = E.reducir(elegida, t(elegida, "ArrowRight"));
  cerca(movida.zonas[0].vertices[0][0], 0.205, 1e-9, "1 cm a la derecha");
  const subida = E.reducir(elegida, t(elegida, "ArrowUp", { shift: true }));
  cerca(subida.zonas[0].vertices[0][1], 0.4, 1e-9, "10 cm arriba");
  assert.deepEqual(t(elegida, "Backspace"), { tipo: "borrarZona", clave: "z1" });
  // Esc: suelta la zona; sin nada, nada. Nunca otra cosa (no hay «salir»).
  assert.deepEqual(t(elegida, "Escape"), { tipo: "seleccionar", zona: null });
  assert.equal(t(e, "Escape"), null);
  const estados = [e, elegida, E.reducir(e, { tipo: "elegirModo", modo: "mirar" }),
    hacer(e, { tipo: "elegirHerramienta", herramienta: "poligono" }, { tipo: "agregarPunto", punto: [0.5, 0.5] })];
  for (const x of estados) {
    for (const mods of [{}, { shift: true }]) {
      const a = t(x, "Escape", mods);
      assert.ok(a === null || a.tipo === "cancelarTrazo" || (a.tipo === "seleccionar" && a.zona === null), `Esc devolvió ${JSON.stringify(a)}`);
    }
  }
});

await prueba("un clic es menos de 4 px entre bajar y subir; más, es un arrastre", () => {
  assert.equal(E.UMBRAL_CLIC_PX, 4);
  assert.equal(E.esClic({ x: 10, y: 10 }, { x: 12, y: 12 }), true);
  assert.equal(E.esClic({ x: 10, y: 10 }, { x: 14, y: 10 }), false);
});

await prueba("cargar: las zonas del servidor por su orden, con su clave; guardado deja la base en lo mandado", () => {
  const e = E.reducir(ini(), { tipo: "cargar", zonas: [
    { id: 9, participacion_space_id: 2, vertices: cuadrado(0.5, 0.5, 0.6, 0.6), orden: 1 },
    { id: 4, participacion_space_id: 1, vertices: cuadrado(0.1, 0.1, 0.2, 0.2), orden: 0 },
  ], medidas: { ancho: 0.9, alto: 1.8 } });
  assert.deepEqual(e.zonas.map((z) => z.clave), ["z4", "z9"]);
  assert.deepEqual(e.medidas, { ancho: 0.9, alto: 1.8 });
  assert.equal(e.sucio, false);
  const dibujado = hacer(e, { tipo: "elegirActiva", spaceId: 1 }, { tipo: "elegirHerramienta", herramienta: "rectangulo" },
    { tipo: "empezarTrazo", punto: [0.3, 0.3] }, { tipo: "estirarTrazo", punto: [0.4, 0.4] }, { tipo: "cerrarTrazo" });
  assert.equal(dibujado.sucio, true);
  const guardado = E.reducir(dibujado, { tipo: "guardado", base: dibujado.zonas });
  assert.equal(guardado.sucio, false);
  assert.equal(guardado.atras.length, dibujado.atras.length, "guardar borró el deshacer");
  assert.deepEqual(E.zonasParaEnviar(guardado.zonas).map((z) => z.participacion_space_id), [1, 2, 1]);
  // El sentido de los vértices o el orden de la lista no son un cambio.
  const alReves = E.reducir(e, { tipo: "guardado", base: [...e.zonas].reverse().map((z) => ({ ...z, vertices: [...z.vertices].reverse() })) });
  assert.equal(alReves.sucio, false);
});

await prueba("la zona de arriba bajo el puntero (la última si se pisan), y el punto interior cae adentro", () => {
  const zs = [zona("a", 1, cuadrado(0, 0, 0.6, 0.6)), zona("b", 2, cuadrado(0.4, 0.4, 1, 1))];
  assert.equal(E.zonaEnPunto(zs, [0.5, 0.5]), "b");
  assert.equal(E.zonaEnPunto(zs, [0.1, 0.1]), "a");
  assert.equal(E.zonaEnPunto(zs, [0.9, 0.1]), null);
  // L: el punto interior no es el centroide (que cae afuera), y está adentro.
  const L = [[0, 0], [0.6, 0], [0.6, 0.2], [0.2, 0.2], [0.2, 0.8], [0, 0.8]];
  assert.ok(E.adentro(E.puntoInterior(L), L));
  // Un rectángulo: centrado.
  assert.deepEqual(E.puntoInterior(cuadrado(0, 0, 0.5, 1)).map((x) => Math.round(x * 1000) / 1000), [0.234, 0.469]);
  // Tan fina que ninguna celda cae adentro: el centroide del triángulo más grande, adentro.
  const fina = [[0.1, 0.1], [0.9, 0.1000001], [0.9, 0.1000003], [0.1, 0.1000002]];
  const pf = E.puntoInterior(fina);
  assert.ok(pf[0] > 0.1 && pf[0] < 0.9 && pf[1] >= 0.1 && pf[1] <= 0.1000003, `cayó en ${pf}`);
  for (let i = 0; i < 200; i++) {
    const p = alAzar();
    assert.ok(E.adentro(E.puntoInterior(p), p), `polígono ${i}: el punto interior cae afuera`);
  }
});

console.log("zonas · imán, fusión y lo que cambia al confirmar");

await prueba("imán: al vértice más cercano dentro del radio, si no a una arista; afuera, nada; con radio distinto en u y v", () => {
  const objetivos = [[0.5, 0.5], [0.52, 0.5]];
  const segmentos = [[[0, 0.3], [1, 0.3]]];
  assert.deepEqual(E.imantar([0.505, 0.502], objetivos, segmentos, 0.01), [0.5, 0.5]);
  assert.deepEqual(E.imantar([0.515, 0.501], objetivos, segmentos, 0.01), [0.52, 0.5]);
  assert.deepEqual(E.imantar([0.7, 0.305], objetivos, segmentos, 0.01), [0.7, 0.3]);
  assert.deepEqual(E.imantar([0.7, 0.4], objetivos, segmentos, 0.01), [0.7, 0.4]);
  // El vértice gana a la arista aunque la arista quede más cerca (0,003 contra 0,007).
  assert.deepEqual(E.imantar([0.5, 0.303], [[0.5, 0.31]], segmentos, 0.01), [0.5, 0.31]);
  // La esquina de otra zona gana a sus dos bordes (que pasan por ella y siempre quedan más cerca).
  assert.deepEqual(E.imantar([0.102, 0.101], [[0.1, 0.1]], [[[0.1, 0.1], [0.5, 0.1]], [[0.1, 0.1], [0.1, 0.5]]], 0.01), [0.1, 0.1]);
  // Radio anisótropo: 6 px son 0,02 en u y 0,005 en v.
  assert.deepEqual(E.imantar([0.515, 0.5], objetivos, [], { u: 0.02, v: 0.005 }), [0.52, 0.5]);
  assert.deepEqual(E.imantar([0.5, 0.51], objetivos, [], { u: 0.02, v: 0.005 }), [0.5, 0.51]);
  assert.deepEqual(E.imantar([0.5, 0.51], objetivos, [], 0), [0.5, 0.51]);
});

await prueba("a qué imanta: otras zonas y el borde por defecto (no la que se mueve); entrepaños y parantes sólo a pedido", () => {
  const e = conZonas([zona("z1", 1, cuadrado(0.2, 0.2, 0.4, 0.4)), zona("z2", 2, cuadrado(0.6, 0.6, 0.8, 0.8))]);
  assert.equal(e.iman, true, "el imán no arranca prendido");
  assert.equal(e.imanAGuias, false, "el imán a las guías arranca prendido (el pedido no deja imponerlo)");
  assert.equal(e.guias, true, "las guías no se ven de entrada");
  const guias = { entrepanos: [0.33], parantes: [0.5] };
  const { objetivos, segmentos } = E.objetivosDelIman(e, "z1", guias);
  assert.ok(objetivos.some(([u, v]) => u === 0.6 && v === 0.6), "no imanta a la otra zona");
  assert.ok(!objetivos.some(([u, v]) => u === 0.2 && v === 0.2), "imanta a la zona que se mueve");
  assert.ok(objetivos.some(([u, v]) => u === 1 && v === 1), "no imanta a la esquina de la cara");
  assert.ok(!segmentos.some(([a, b]) => a[1] === 0.33 && b[1] === 0.33), "imanta a un entrepaño sin que se pida");
  assert.deepEqual(E.imantar([0.45, 0.335], objetivos, segmentos, 0.01), [0.45, 0.335]);
  const conGuias = E.objetivosDelIman(E.reducir(e, { tipo: "alternarImanAGuias" }), "z1", guias);
  assert.deepEqual(E.imantar([0.45, 0.335], conGuias.objetivos, conGuias.segmentos, 0.01), [0.45, 0.33]);
  assert.deepEqual(E.imantar([0.497, 0.9], conGuias.objetivos, conGuias.segmentos, 0.01), [0.5, 0.9]);
  // G apaga el imán (lo usa el lienzo).
  assert.equal(E.reducir(e, E.accionDeTecla(e, { key: "G", ctrl: false, shift: false })).iman, false);
});

await prueba("fusión de tres vías: mía sin tocar → suya; suya sin tocar → mía; las dos distinto → conflicto con la suya", () => {
  const zo = (id, s, v, orden = 0) => ({ id, participacion_space_id: s, vertices: v, orden });
  const servidorAntes = [zo(1, 10, cuadrado(0, 0, 0.2, 0.2)), zo(2, 20, cuadrado(0.3, 0, 0.5, 0.2)), zo(3, 30, cuadrado(0.6, 0, 0.8, 0.2))];
  const base = E.desdeElServidor(servidorAntes);
  // Acá: cambié la 20 y la 30. Allá: cambiaron la 10 y la 30 (distinto), y la 20 la dejaron.
  const mias = base.map((z) => (z.participacionSpaceId === 20 ? { ...z, vertices: cuadrado(0.3, 0, 0.55, 0.2) }
    : z.participacionSpaceId === 30 ? { ...z, vertices: cuadrado(0.6, 0, 0.85, 0.2) } : z));
  // El servidor devuelve la 20 al revés y antihoraria desde otro vértice: no es un cambio.
  const suyas = [zo(11, 10, cuadrado(0, 0, 0.25, 0.25)), zo(2, 20, [[0.5, 0.2], [0.3, 0.2], [0.3, 0], [0.5, 0]]), zo(33, 30, cuadrado(0.6, 0, 0.7, 0.2))];
  const f = E.fusionarZonas(base, mias, suyas);
  assert.deepEqual(f.conflictos, [30]);
  const de = (s) => f.zonas.filter((z) => z.participacionSpaceId === s).map((z) => z.vertices);
  assert.deepEqual(de(10), [cuadrado(0, 0, 0.25, 0.25)], "la que no toqué no tomó lo del servidor");
  assert.deepEqual(de(20), [cuadrado(0.3, 0, 0.55, 0.2)], "la que no tocaron allá no quedó con lo mío");
  assert.deepEqual(de(30), [cuadrado(0.6, 0, 0.7, 0.2)], "en el conflicto no quedó lo del servidor");
  assert.equal(new Set(f.zonas.map((z) => z.clave)).size, f.zonas.length, "claves repetidas");
  // Las dos cambiaron igual: sin conflicto. Una participación nueva de cada lado, se suman.
  const igual = E.fusionarZonas(base, [...mias, zona("n1", 40, cuadrado(0, 0.5, 0.1, 0.6))], [...suyas.slice(0, 2), zo(33, 30, cuadrado(0.6, 0, 0.85, 0.2)), zo(50, 50, cuadrado(0.5, 0.5, 0.6, 0.6))]);
  assert.deepEqual(igual.conflictos, []);
  assert.deepEqual(igual.zonas.map((z) => z.participacionSpaceId).sort(), [10, 20, 30, 40, 50]);
  // Sin cambios de nadie: lo del servidor.
  assert.deepEqual(E.fusionarZonas(base, base, servidorAntes), { zonas: base, conflictos: [] });
  // «Usar lo mío» (en el reductor): la participación del conflicto vuelve a lo de acá.
  const ed = E.reducir(conZonas(f.zonas), { tipo: "usarZonas", spaceId: 30, zonas: mias.filter((z) => z.participacionSpaceId === 30) });
  assert.deepEqual(ed.zonas.filter((z) => z.participacionSpaceId === 30).map((z) => z.vertices), [cuadrado(0.6, 0, 0.85, 0.2)]);
});

await prueba("lo que cambia al confirmar: zonas agregadas, borradas y cambiadas, y el dibujado de antes y después", () => {
  const antes = [{ id: 1, participacion_space_id: 10, vertices: cuadrado(0, 0, 0.2, 0.2), orden: 0 },
    { id: 2, participacion_space_id: 20, vertices: cuadrado(0.3, 0, 0.5, 0.2), orden: 1 },
    { id: 3, participacion_space_id: 20, vertices: cuadrado(0.3, 0.5, 0.5, 0.7), orden: 2 }];
  const despues = [zona("z1", 10, [[0.2, 0.2], [0, 0.2], [0, 0], [0.2, 0]]), zona("z2", 20, cuadrado(0.3, 0, 0.6, 0.2)), zona("n1", 30, cuadrado(0.7, 0.7, 0.8, 0.8))];
  const r = E.diferencias(antes, despues, new Map([[10, { dibujado: 400 }], [20, { dibujado: 800 }]]), new Map([[10, { dibujado: 400 }], [20, { dibujado: 600 }], [30, { dibujado: 100 }]]));
  assert.deepEqual(r.participaciones, [
    { spaceId: 20, dibujadoAntes: 800, dibujadoDespues: 600, agregadas: 0, borradas: 1, cambiadas: 1 },
    { spaceId: 30, dibujadoAntes: 0, dibujadoDespues: 100, agregadas: 1, borradas: 0, cambiadas: 0 },
  ]);
  assert.deepEqual([r.agregadas, r.borradas, r.cambiadas, r.hayCambios], [1, 1, 1, true]);
  assert.equal(E.diferencias(antes, E.desdeElServidor(antes), new Map(), new Map()).hayCambios, false);
  // Editando el BORRADOR (o después de guardar: el servidor numera de nuevo), las claves no son las de la
  // confirmada: una zona idéntica de la misma participación es la misma zona, no «una agregada y una borrada».
  const delBorrador = E.desdeElServidor(antes.map((z) => ({ ...z, id: z.id + 100 })));
  const d0 = E.diferencias(antes, delBorrador, new Map(), new Map());
  assert.deepEqual([d0.agregadas, d0.borradas, d0.cambiadas, d0.hayCambios], [0, 0, 0, false], JSON.stringify(d0));
  // Con una cambiada, una nueva y una que pasa a otra participación (misma forma): eso sí se cuenta.
  const mezcla = [zona("z101", 10, cuadrado(0, 0, 0.2, 0.2)), zona("z102", 20, cuadrado(0.3, 0, 0.6, 0.2)), zona("z103", 30, cuadrado(0.3, 0.5, 0.5, 0.7))];
  const d1 = E.diferencias(antes, mezcla, new Map(), new Map());
  assert.deepEqual(d1.participaciones.map((f) => [f.spaceId, f.agregadas, f.borradas, f.cambiadas]), [[20, 1, 2, 0], [30, 1, 0, 0]]);
  // Dos zonas iguales de la misma participación: se aparean de a una.
  const dos = [{ id: 1, participacion_space_id: 10, vertices: cuadrado(0, 0, 0.2, 0.2), orden: 0 }, { id: 2, participacion_space_id: 10, vertices: cuadrado(0, 0, 0.2, 0.2), orden: 1 }];
  const d2 = E.diferencias(dos, [zona("n1", 10, cuadrado(0, 0, 0.2, 0.2))], new Map(), new Map());
  assert.deepEqual([d2.agregadas, d2.borradas], [0, 1]);
});

await prueba("sucio no mira el orden de la lista ni de las zonas de una misma participación", () => {
  const a = [zona("a", 1, cuadrado(0, 0, 0.1, 0.1)), zona("b", 1, cuadrado(0.5, 0.5, 0.6, 0.6)), zona("c", 2, cuadrado(0.7, 0.7, 0.8, 0.8))];
  assert.equal(E.mismasZonas(a, [a[2], a[1], a[0]]), true);
  assert.equal(E.mismasZonas(a, [a[0], { ...a[1], participacionSpaceId: 2 }, a[2]]), false);
  assert.equal(E.reducir(conZonas(a), { tipo: "fusionar", zonas: [a[1], a[2], a[0]], base: a }).sucio, false);
});

await prueba("ajustar: nunca pasa el tope y no crea solapes, en 150 juegos al azar con zócalo y parantes", () => {
  const sup = superficieDe("superficie:gondola-doble-090");
  const Ex = sup.exclusiones, util = G.areaUtil(Ex);
  let achicados = 0, creados = 0;
  for (let i = 0; i < 150; i++) {
    const zs = [alAzar(), ...(rnd() < 0.4 ? [alAzar()] : [])];
    const antes = G.dibujadoPb(zs, Ex);
    const crudoAntes = 10000 * G.areaCubierta(zs, Ex) / util;
    if (antes < 50) continue;
    const tope = 1 + Math.floor(rnd() * antes * 1.2);
    // La otra participación (fechas cruzadas): un rectángulo a la derecha que
    // arranca en el borde de las zonas (no las pisa) o un poco antes (las
    // pisa: un dibujo desprolijo), siempre a la derecha de todos los puntos
    // interiores.
    const [, , u1] = G.cajas(zs);
    let cu = 0;
    for (const z of zs) cu = Math.max(cu, E.puntoInterior(z, sup.ancho, sup.alto)[0]);
    const x0 = G.cuantizarNumero(i % 2 ? u1 : cu + 0.75 * (u1 - cu));
    if (!(x0 < 0.99)) continue;
    const otra = [[x0, 0.0], [1, 0], [1, 1], [x0, 1]];
    const pisabaAntes = G.areaCubierta(zs, Ex, [otra]) * sup.ancho * sup.alto > G.AREA_MINIMA_M2 / 2;
    const out = E.ajustarAlContratado(zs, Ex, tope, util, [[otra]], sup);
    const pb = G.dibujadoPb(out, Ex);
    assert.ok(pb <= Math.max(tope, 0), `juego ${i}: ${pb} > ${tope}`);
    // Sin exceso (el crudo, sin redondear, no pasa el tope) no se toca nada.
    if (crudoAntes <= tope) assert.deepEqual(out, zs, `juego ${i}: sin exceso cambió las zonas`);
    else assert.ok(10000 * G.areaCubierta(out, Ex) / util <= tope, `juego ${i}: el crudo pasa el tope`);
    const pisa = G.areaCubierta(out, Ex, [otra]) * sup.ancho * sup.alto > G.AREA_MINIMA_M2 / 2;
    const soloTope = E.ajustarAlContratado(zs, Ex, tope, util, [], sup);
    const topePisa = G.areaCubierta(soloTope, Ex, [otra]) * sup.ancho * sup.alto > G.AREA_MINIMA_M2 / 2;
    if (pisa) {
      // Sólo se queda pisando con lo que tenía (el resultado del tope solo):
      // no pudo dejar de pisar sin perder más de la mitad del contratado.
      assert.deepEqual(out, soloTope, `juego ${i}: pisa y no es lo que tenía`);
      if (!pisabaAntes) creados++;
    } else if (topePisa) {
      achicados++;
      assert.ok(10000 * G.areaCubierta(out, Ex) / util >= E.MIN_FRACCION_SIN_PISAR * tope, `juego ${i}: la borró para no pisar`);
    }
  }
  console.log(`         ${achicados} achicadas de más para no pisar · ${creados} que habrían pisado sin poder evitarlo`);
  assert.ok(achicados > 5, "el azar casi no prueba el achique por solape");
});

await prueba("ajustar: una U con otra marca adentro de su hueco no se borra para no pisarla (queda el solape a la vista)", () => {
  const U = [[[0, 0], [0.6, 0], [0.6, 0.8], [0.45, 0.8], [0.45, 0.15], [0.15, 0.15], [0.15, 0.8], [0, 0.8]]];
  const otra = [[0.15, 0.15], [0.45, 0.15], [0.45, 1], [0.15, 1]];
  assert.equal(G.areaCubierta(U, [], [otra]), 0, "la U ya pisaba");
  const out = E.ajustarAlContratado(U, [], 2500, 1, [[otra]], { ancho: 1, alto: 1 });
  assert.equal(G.dibujadoPb(out, []), 2500, "no llegó al tope");
  assert.ok(G.areaCubierta(out, [], [otra]) > 0, "esperaba el solape (que la revisión marca)");
  // Sin la otra marca, la misma U sólo llega al tope.
  assert.deepEqual(E.ajustarAlContratado(U, [], 2500, 1, [], { ancho: 1, alto: 1 }), out);
});

await prueba("«Descartarlos» (la pregunta al salir o al cambiar de cara) descarta también en «Mirar», sin cambiar el modo; el botón «Descartar mis cambios» sigue sin andar en «Mirar» (revisión final)", () => {
  const cargado = E.reducir(ini(), { tipo: "cargar", zonas: [{ id: 5, participacion_space_id: 1, vertices: cuadrado(0.1, 0.1, 0.2, 0.2), orden: 0 }] });
  const editado = E.reducir(cargado, { tipo: "moverZona", clave: "z5", du: 0.1, dv: 0 });
  const enMirar = E.reducir(editado, { tipo: "elegirModo", modo: "mirar" });
  assert.equal(enMirar.modo, "mirar");
  assert.equal(enMirar.sucio, true);
  // El reductor no edita en «Mirar»: por eso la pregunta no puede despachar `descartarCambios`.
  assert.equal(E.reducir(enMirar, { tipo: "descartarCambios" }), enMirar);
  const tirado = E.descartarEnCualquierModo(enMirar);
  assert.equal(tirado.sucio, false, "en «Mirar», «Descartarlos» dejó lo descartado sin guardar (y salir lo guardaba como borrador)");
  assert.deepEqual(tirado.zonas, cargado.zonas);
  assert.equal(tirado.modo, "mirar", "descartar cambió el modo");
  assert.equal(tirado.herramienta, enMirar.herramienta);
  // En «Editar», lo mismo que el reductor; sin nada que descartar, el MISMO objeto.
  assert.deepEqual(E.descartarEnCualquierModo(editado), E.reducir(editado, { tipo: "descartarCambios" }));
  assert.equal(E.descartarEnCualquierModo(cargado), cargado);
  const quietoEnMirar = E.reducir(cargado, { tipo: "elegirModo", modo: "mirar" });
  assert.equal(E.descartarEnCualquierModo(quietoEnMirar), quietoEnMirar);
});

await prueba("el editor es puro: sin React, sin catálogo, sin reloj y sin guardar nada en el navegador", () => {
  const sinComent = (t) => t.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, (m, p1) => p1);
  const ts = sinComent(leer(join(raiz, "src", "utils", "edicionDeZonas.ts")));
  const imports = [...ts.matchAll(/^import\s+(type\s+)?[^;]*from\s+"([^"]+)"/gm)].map((m) => [m[2], !!m[1]]);
  for (const [de, soloTipos] of imports) {
    assert.ok(soloTipos || ["./participaciones", "./zonasGeometria"].includes(de), `edicionDeZonas.ts importa ${de}`);
  }
  assert.ok(!/localStorage|sessionStorage|indexedDB|new Date\(|Date\.now|from "react"/.test(ts));
  for (const f of ["zonas3d.ts", "coloresDeMarca.ts"]) {
    const t = sinComent(leer(join(raiz, "src", "utils", f)));
    for (const m of t.matchAll(/^import\s+(type\s+)?[^;]*from\s+"([^"]+)"/gm)) {
      assert.ok(m[1], `${f} importa ${m[2]} con valores (tiene que ser sólo de tipos)`);
    }
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// fase 2 · I2 · el imán de una zona que se mueve y «Ajustar el borde a la vecina»
// ═══════════════════════════════════════════════════════════════════════════
//
// El imán de la zona entera vivía en línea en el lienzo; ahora es
// `imantarTraslado` y lo usan el lienzo y el 3D («Editar en el 3D»): tiene que
// dar EXACTAMENTE lo que daba el bloque de antes. «Ajustar el borde» pega un
// borde de la zona elegida al de enfrente de la vecina (hasta 5 cm), con las
// salidas de `casos/zonas.json` (`bordes`) revisadas a mano: el navegador las
// exige exactas y el servidor (`test_participaciones_geometria.py`) que pasen
// su validación sin pisar a nadie.

console.log("zonas · fase 2 · I2: el imán de la zona que se mueve y «Ajustar el borde a la vecina»");

await prueba("imantarTraslado: pega el vértice que queda más cerca de su objetivo (en metros) y los demás lo siguen; radio por eje; sin nada cerca, el mismo desplazamiento", () => {
  const z = cuadrado(0.2, 0.2, 0.4, 0.4);
  const cerca2 = (a, b, quien) => assert.ok(Math.abs(a[0] - b[0]) < 1e-12 && Math.abs(a[1] - b[1]) < 1e-12, `${quien}: [${a}] y no [${b}]`);
  // Moviendo 0,095 en u, el vértice (0,4; 0,2) queda a 0,005 de la esquina (0,5; 0,2) de otra zona: se pega y la zona lo sigue.
  cerca2(E.imantarTraslado(z, 0.095, 0, [[0.5, 0.2]], [], 0.01, 1, 1), [0.1, 0], "un objetivo");
  // Dos candidatos: (0,4; 0,2) a 0,004 en u de T1 y (0,2; 0,4) a 0,006 en v de T2. En una cara
  // cuadrada gana T1; en una de 3 m × 1 m, 0,004 en u son 12 mm y 0,006 en v, 6 mm: gana T2.
  const objetivos = [[0.404, 0.2], [0.2, 0.406]];
  cerca2(E.imantarTraslado(z, 0, 0, objetivos, [], 0.01, 1, 1), [0.004, 0], "cara cuadrada");
  cerca2(E.imantarTraslado(z, 0, 0, objetivos, [], 0.01, 3, 1), [0, 0.006], "en metros (3 × 1)");
  // Radio por eje: con 0,001 en u T1 queda afuera.
  cerca2(E.imantarTraslado(z, 0, 0, objetivos, [], { u: 0.001, v: 0.02 }, 1, 1), [0, 0.006], "radio por eje");
  // Una arista también imanta (el borde de la cara en u = 1).
  cerca2(E.imantarTraslado(z, 0.597, 0, [], [[[1, 0], [1, 1]]], 0.01, 1, 1), [0.6, 0], "a una arista");
  // Sin nada en el radio, el desplazamiento tal cual (el MISMO número).
  assert.deepEqual(E.imantarTraslado(z, 0.05, -0.02, [[0.9, 0.9]], [], 0.01, 1, 1), [0.05, -0.02]);
  assert.deepEqual(E.imantarTraslado(z, 0.05, -0.02, [[0.4, 0.2]], [], 0, 1, 1), [0.05, -0.02], "con radio 0 imantó");
});

await prueba("imantarTraslado da EXACTAMENTE lo que daba el bloque en línea del lienzo (300 movimientos al azar, con objetivos de otras zonas y del borde)", () => {
  // El bloque de antes, copiado tal cual de LienzoDeZonas.tsx (2ffecd2).
  const deAntes = (zv, du, dv, objetivos, segmentos, r, W, H) => {
    let mejor = null, dmin = Infinity;
    for (const q of zv) {
      const a = [q[0] + du, q[1] + dv];
      const b = E.imantar(a, objetivos, segmentos, r);
      const dd = Math.hypot((b[0] - a[0]) * W, (b[1] - a[1]) * H);
      if ((b[0] !== a[0] || b[1] !== a[1]) && dd < dmin) { dmin = dd; mejor = [b[0] - a[0], b[1] - a[1]]; }
    }
    if (mejor) { du += mejor[0]; dv += mejor[1]; }
    return [du, dv];
  };
  let s = 31;
  const az = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  let imantados = 0;
  for (let k = 0; k < 300; k++) {
    const u0 = 0.1 + 0.4 * az(), v0 = 0.1 + 0.4 * az();
    const zv = cuadrado(u0, v0, u0 + 0.05 + 0.3 * az(), v0 + 0.05 + 0.3 * az());
    const e = conZonas([zona("m", 1, zv), zona("o", 2, cuadrado(0.6, 0.1, 0.6 + 0.3 * az(), 0.2 + 0.6 * az()))]);
    const { objetivos, segmentos } = E.objetivosDelIman(e, "m");
    const r = az() < 0.5 ? 0.004 + 0.02 * az() : { u: 0.004 + 0.02 * az(), v: 0.004 + 0.02 * az() };
    const W = 0.5 + 3 * az(), H = 0.5 + 2 * az();
    const du = (az() - 0.5) * 0.6, dv = (az() - 0.5) * 0.6;
    const ahora = E.imantarTraslado(zv, du, dv, objetivos, segmentos, r, W, H);
    assert.deepEqual(ahora, deAntes(zv, du, dv, objetivos, segmentos, r, W, H), `movimiento ${k}`);
    if (ahora[0] !== du || ahora[1] !== dv) imantados++;
  }
  assert.ok(imantados > 15, `sólo ${imantados} movimientos imantaron: la prueba no prueba el imán`);
});

await prueba("el lienzo usa imantarTraslado (sin el bloque en línea) y la distancia para tocar el primer punto es la de edicionDeZonas (8 px)", () => {
  const sinComent = (t) => t.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, (m, p1) => p1);
  const lienzo = sinComent(leer(join(raiz, "src", "components", "Distribucion", "LienzoDeZonas.tsx")));
  assert.match(lienzo, /const \{ objetivos, segmentos \} = objetivosDelIman\(ed, g\.clave, guias\);\s*\[du, dv\] = imantarTraslado\(z\.vertices, du, dv, objetivos, segmentos, radioUV\(\), W, H\);/,
    "el lienzo no imanta la zona que se mueve con imantarTraslado");
  assert.ok(!/for \(const q of z\.vertices\)/.test(lienzo), "quedó el imán de la zona en línea en el lienzo");
  assert.ok(!/const TOQUE_PX\s*=/.test(lienzo), "el lienzo tiene su propio TOQUE_PX");
  assert.match(lienzo, /import \{[^}]*\bTOQUE_PX\b[^}]*\} from "\.\.\/\.\.\/utils\/edicionDeZonas";/);
  assert.equal(E.TOQUE_PX, 8);
});

const BORDES = CASOS.bordes ?? [];

await prueba(`ajustar el borde: la salida revisada a mano, exacta (${BORDES.length} casos de casos/zonas.json)`, () => {
  assert.ok(BORDES.length >= 8, "faltan los casos `bordes` en casos/zonas.json");
  assert.equal(E.DISTANCIA_MAXIMA_DE_AJUSTE_M, 0.05);
  assert.equal(E.ANGULO_MAXIMO_DE_AJUSTE_RAD, (10 * Math.PI) / 180);
  assert.equal(E.TRAMO_MINIMO_DE_AJUSTE, 0.3);
  const motivos = new Set();
  for (const c of BORDES) {
    assert.ok(typeof c.revisado === "string" && c.revisado.length > 20, `${c.nombre}: no dice cómo se revisó`);
    assert.ok(("salida" in c) !== ("motivo" in c), `${c.nombre}: tiene que tener salida o motivo, no las dos`);
    const r = E.ajustarBordeAVecina(c.zona, c.vecinas, c.cara);
    if (c.motivo) {
      motivos.add(c.motivo);
      assert.deepEqual(r, { motivo: c.motivo }, `${c.nombre}: ${JSON.stringify(r)}`);
      continue;
    }
    assert.ok(r.vertices, `${c.nombre}: no ajustó (${JSON.stringify(r)})`);
    assert.deepEqual(r.vertices, c.salida, `${c.nombre}: la salida cambió`);
    if (c.vecina !== undefined) assert.equal(r.vecina, c.vecina, `${c.nombre}: se pegó a otra vecina`);
    if (c.distancia_m !== undefined) cerca(r.distanciaM, c.distancia_m, 1e-6, `${c.nombre}: la distancia`);
    // Lo que el servidor también exige: válida y sin pisar a ninguna vecina (1 cm²).
    assert.equal(G.validarZona(r.vertices, c.cara.ancho, c.cara.alto).codigo, null, `${c.nombre}: la salida no es válida`);
    for (const v of c.vecinas) {
      assert.ok(G.areaCubierta([r.vertices], [], [v]) * c.cara.ancho * c.cara.alto < G.AREA_MINIMA_M2, `${c.nombre}: la salida pisa a una vecina`);
    }
  }
  assert.deepEqual([...motivos].sort(), ["SIN_VECINA", "YA_PEGADA"], "los casos no cubren los motivos");
});

await prueba("ajustar el borde: sólo se mueven los dos puntos del borde (o se saca uno repetido), y la zona horaria conserva su sentido", () => {
  const c = BORDES.find((x) => /primer clic/.test(x.nombre));
  assert.ok(c, "falta el caso de la L");
  const r = E.ajustarBordeAVecina(c.zona, c.vecinas, c.cara);
  const movidos = c.zona.map((p, i) => (p[0] !== r.vertices[i][0] || p[1] !== r.vertices[i][1] ? i : -1)).filter((i) => i >= 0);
  assert.deepEqual(movidos, [1, 2], "se movieron otros puntos que los dos del borde");
  assert.equal(r.borde, 1);
  const horaria = BORDES.find((x) => /horaria/.test(x.nombre));
  assert.ok(G.areaFirmada(E.ajustarBordeAVecina(horaria.zona, horaria.vecinas, horaria.cara).vertices) < 0, "la zona horaria quedó antihoraria");
});

await prueba("ajustar el borde: 500 al azar, toda salida pasa validarZona y no pisa a la vecina más que antes", () => {
  let s = 7;
  const az = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  let hechos = 0;
  for (let k = 0; k < 500; k++) {
    const u0 = 0.05 + 0.3 * az(), x = 0.4 + 0.2 * az(), g = (az() - 0.5) * 0.1;
    const z = cuadrado(u0, 0.1 * az(), x, 0.9 + 0.1 * az()).map((p) => p.map(G.cuantizarNumero));
    const n = cuadrado(x + g, 0.2 * az(), 0.95, 0.8 + 0.2 * az()).map((p) => p.map(G.cuantizarNumero));
    const cara = { ancho: 1 + 2 * az(), alto: 1 + az() };
    const r = E.ajustarBordeAVecina(z, [n], cara);
    if (!r.vertices) continue;
    hechos++;
    assert.equal(G.validarZona(r.vertices, cara.ancho, cara.alto).codigo, null, `juego ${k}: la salida no es válida`);
    const umbral = G.AREA_MINIMA_M2 / (cara.ancho * cara.alto) / 2;
    assert.ok(G.areaCubierta([r.vertices], [], [n]) <= Math.max(G.areaCubierta([z], [], [n]), umbral) + 1e-12, `juego ${k}: pisa más que antes`);
    assert.ok(Math.abs(r.distanciaM) <= E.DISTANCIA_MAXIMA_DE_AJUSTE_M, `juego ${k}: ajustó más de 5 cm`);
  }
  assert.ok(hechos > 200, `sólo ${hechos} ajustes en 500: la prueba casi no prueba nada`);
});

await prueba("ajustar el borde en el reductor: un paso de deshacer, la zona queda elegida, «Mirar» no hace nada, `ignorar` deja fuera a una vecina y los tres avisos", () => {
  const z1 = zona("z1", 1, cuadrado(0, 0, 0.48, 1)), z2 = zona("z2", 2, cuadrado(0.49, 0, 1, 0.5)), z3 = zona("z3", 3, cuadrado(0.5, 0.5, 1, 1));
  const e = conZonas([z1, z2, z3], { seleccion: { zona: "z1", vertice: 2 } });
  // La más cercana es z2 (1 cm): el borde derecho va a u = 0,49.
  const f = E.reducir(e, { tipo: "ajustarBorde", clave: "z1" });
  assert.deepEqual(f.zonas[0].vertices, cuadrado(0, 0, 0.49, 1));
  assert.equal(f.zonas[1], z2, "se tocó la vecina");
  assert.equal(f.atras.length, 1, "no es un paso de deshacer");
  assert.deepEqual(f.seleccion, { zona: "z1", vertice: null });
  assert.equal(f.sucio, true);
  assert.equal(f.aviso, null);
  assert.deepEqual(E.reducir(f, { tipo: "deshacer" }).zonas[0].vertices, z1.vertices, "deshacer no vuelve a lo de antes");
  // Si z2 no cuenta (sus fechas no se cruzan con las de z1), se pega a z3 (2 cm).
  const g = E.reducir(e, { tipo: "ajustarBorde", clave: "z1", ignorar: ["z2"] });
  assert.deepEqual(g.zonas[0].vertices, cuadrado(0, 0, 0.5, 1), "`ignorar` no dejó fuera a la vecina");
  // Un segundo clic: pegarse a z3 pisaría a z2 → no cambia nada y lo dice.
  const h = E.reducir(f, { tipo: "ajustarBorde", clave: "z1" });
  assert.equal(h.zonas, f.zonas);
  assert.equal(h.aviso, E.AVISO_NO_QUEDA_LIMPIA);
  assert.equal(h.atras.length, f.atras.length);
  // Sin vecina cerca y ya pegada.
  const lejos = conZonas([zona("a", 1, cuadrado(0, 0, 0.3, 1)), z2], { seleccion: { zona: "a", vertice: null } });
  const sin = E.reducir(lejos, { tipo: "ajustarBorde", clave: "a" });
  assert.equal(sin.zonas, lejos.zonas);
  assert.equal(sin.aviso, E.AVISO_SIN_VECINA);
  const pegadas = conZonas([zona("a", 1, cuadrado(0, 0, 0.5, 1)), zona("b", 2, cuadrado(0.5, 0, 1, 1))]);
  assert.equal(E.reducir(pegadas, { tipo: "ajustarBorde", clave: "a" }).aviso, E.AVISO_YA_PEGADA);
  // Los avisos son los de la pantalla (voseo).
  assert.match(E.AVISO_SIN_VECINA, /acercala con el imán/);
  assert.match(E.AVISO_NO_QUEDA_LIMPIA, /ajustalo a mano/);
  // «Mirar» no edita; una clave que no está o sin medidas, nada.
  const mirar = E.reducir(e, { tipo: "elegirModo", modo: "mirar" });
  assert.equal(E.reducir(mirar, { tipo: "ajustarBorde", clave: "z1" }), mirar, "en «Mirar» ajustó");
  assert.equal(E.reducir(e, { tipo: "ajustarBorde", clave: "nadie" }), e);
  const sinMedidas = { ...e, medidas: null };
  assert.equal(E.reducir(sinMedidas, { tipo: "ajustarBorde", clave: "z1" }), sinMedidas);
});

console.log(`\n${hechas} pruebas de zonas en verde`);
