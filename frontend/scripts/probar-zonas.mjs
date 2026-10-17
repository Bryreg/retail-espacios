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

console.log(`\n${hechas} pruebas de zonas en verde`);
